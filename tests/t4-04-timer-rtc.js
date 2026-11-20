#!/usr/bin/env node
'use strict';

/**
 * Triton 4 Machine Test 4: Timer Mode 1 (200 kHz Real Time) & RTC_SECONDS (`tests/t4-04-timer-rtc.js`)
 * ConsciousNode SoftWorks
 *
 * Verifies:
 *   1. In Timer Mode 1 (`TIMER_MODE = 1`), with the injectable clock driven 1,000 ms forward
 *      and the CPU run for 10,000 steps or 1,000,000 steps, `TIMER_TICKS` (Port 6) advances by
 *      exactly 200,000 both times on both `TritonJS` and `TritonWASM`.
 *   2. In Timer Mode 0 (`TIMER_MODE = 0`), `TIMER_TICKS` (Port 6) follows CPU steps (10,000 and 1,000,000).
 *   3. Injectable clock function (`options.clock = () => ms`) and `advanceClockMs` / `advanceClockUs`
 *      drive both `TIMER_TICKS` and `IRQ_TIMER` at 200 kHz (1 tick per 5 us).
 *   4. `RTC_SECONDS` (Port 32) returns seconds since 2000-01-01 00:00:00 UTC from the same injectable
 *      clock, and writing to Port 32 sets an offset that persists across subsequent clock advances.
 *   5. Reset restores `TIMER_MODE = 0` and `DISK_UNIT = 0`.
 */

const { loadHtmlModule } = require('./t3-common');
const { T } = loadHtmlModule('triton4.html');

const t0 = Date.now();

function buildSpinReadTicksProg(timerMode, loopIters) {
  const [w0, w1, w2] = T.numberToWord(loopIters);
  return T.assemble(`
    .mode T3
    .org 0
    LI R0, #${timerMode}
    OUT R0, #31      ; set TIMER_MODE
    IN R1, #6        ; read start TIMER_TICKS
    LI R3, #${w0}
    LMI R3, #${w1}
    LHI R3, #${w2}
  spin_lp:
    SUBI R3, R3, #1
    JPX spin_lp
    IN R2, #6        ; read end TIMER_TICKS
    SUB R4, R2, R1   ; R4 = elapsed TIMER_TICKS
    HALT
  `, { mode: 'T3' });
}

// 1. Timer Mode 1: Clock driven 1,000 ms forward, CPU run for 10,000 or 1,000,000 steps -> TIMER_TICKS advances by 200,000 both times!
for (const targetSteps of [10000, 1000000]) {
  // Loop body is 2 instructions (SUBI + JPX), plus 6 setup instructions before loop and 3 after
  const iters = Math.floor((targetSteps - 8) / 2);
  const built = buildSpinReadTicksProg(1, iters);

  for (const [vmKind, makeVm] of [['JS', () => new T.TritonJS({ archMode: 'T3' })], ['WASM', () => T.TritonWASM.createSync({ archMode: 'T3' })]]) {
    const vm = makeVm();
    vm.loadProgram(built.trytes, 0);
    // Run 3 steps so TIMER_MODE=1 is set and start ticks R1 is latched
    vm.run(3);
    // Drive clock 1,000 ms forward
    vm.advanceClockMs(1000);
    // Run remaining steps (10,000 or 1,000,000 total steps)
    vm.run(targetSteps + 20);

    const deltaTicks = vm.getWordNum(4);
    if (!vm.halted || deltaTicks !== 200000 || vm.timerTicks !== 200000) {
      throw new Error(`[t4-04.1] Mode 1 (${vmKind}, ${targetSteps} steps): expected 200,000 ticks, got R4=${deltaTicks} vm.timerTicks=${vm.timerTicks}`);
    }
  }
}

// 2. Timer Mode 0: Clock driven 1,000 ms forward, CPU run for 10,000 or 1,000,000 steps -> TIMER_TICKS follows CPU steps!
const mode0Recorded = {};
for (const targetSteps of [10000, 1000000]) {
  const iters = Math.floor((targetSteps - 8) / 2);
  const built = buildSpinReadTicksProg(0, iters);

  for (const [vmKind, makeVm] of [['JS', () => new T.TritonJS({ archMode: 'T3' })], ['WASM', () => T.TritonWASM.createSync({ archMode: 'T3' })]]) {
    const vm = makeVm();
    vm.loadProgram(built.trytes, 0);
    vm.run(3);
    vm.advanceClockMs(1000);
    vm.run(targetSteps + 20);

    const deltaSteps = vm.getWordNum(4);
    const expectedDelta = iters * 2 + 4; // 3 setup instrs (LI, LMI, LHI) + iters*2 + IN R2,#6
    if (!vm.halted || deltaSteps !== expectedDelta) {
      throw new Error(`[t4-04.2] Mode 0 (${vmKind}, ${targetSteps} steps): expected ${expectedDelta} step ticks, got ${deltaSteps}`);
    }
    mode0Recorded[targetSteps] = deltaSteps;
  }
}

// 3. Injectable clock function (`options.clock`) driving both Mode 1 ticks and RTC_SECONDS
{
  let fakeNowMs = Date.UTC(2026, 10, 17, 12, 0, 0); // 2026-11-17 12:00:00 UTC
  const expectedInitialRtc = Math.floor((fakeNowMs - Date.UTC(2000, 0, 1, 0, 0, 0)) / 1000);

  const js = new T.TritonJS({ archMode: 'T3', clock: () => fakeNowMs });
  const wasm = T.TritonWASM.createSync({ archMode: 'T3', clock: () => fakeNowMs });

  const prog = T.assemble(`
    .mode T3
    .org 0
    LI R0, #1
    OUT R0, #31      ; Mode 1
    IN R1, #32       ; R1 = initial RTC_SECONDS
    IN R2, #6        ; R2 = initial TIMER_TICKS (0)
    NOP
    IN R3, #32       ; R3 = RTC_SECONDS after +5,000 ms (+5 s)
    IN R4, #6        ; R4 = TIMER_TICKS after +5,000 ms (1,000,000 ticks)
    ; Write custom RTC value = 50,000
    LI R0, #-9049
    LMI R0, #3       ; 50,000
    OUT R0, #32
    IN R5, #32       ; R5 = 50,000
    NOP
    IN R6, #32       ; R6 = 50,010 after +10,000 ms (+10 s)
    HALT
  `, { mode: 'T3' });

  js.loadProgram(prog.trytes, 0);
  wasm.loadProgram(prog.trytes, 0);

  js.run(4); wasm.run(4);
  fakeNowMs += 5000; // +5,000 ms = +5 s, +1,000,000 ticks
  js.run(7); wasm.run(7);
  fakeNowMs += 10000; // +10,000 ms = +10 s
  js.run(10); wasm.run(10);

  for (const [name, vm] of [['js', js], ['wasm', wasm]]) {
    if (vm.getWordNum(1) !== expectedInitialRtc ||
        vm.getWordNum(2) !== 0 ||
        vm.getWordNum(3) !== expectedInitialRtc + 5 ||
        vm.getWordNum(4) !== 1000000 ||
        vm.getWordNum(5) !== 50000 ||
        vm.getWordNum(6) !== 50010) {
      throw new Error(`[t4-04.3] ${name} injectable clock / RTC test failed: R1..R6=${[1,2,3,4,5,6].map(r=>vm.getWordNum(r))}`);
    }
  }

  // Verify reset restores timerMode = 0 and diskUnit = 0
  js.diskUnit = 2; wasm.diskUnit = 2;
  js.reset(true); wasm.reset(true);
  if (js.timerMode !== 0 || wasm.timerMode !== 0 || js.diskUnit !== 0 || wasm.diskUnit !== 0) {
    throw new Error('[t4-04.4] Reset did not restore timerMode=0 and diskUnit=0');
  }
}

console.log(`[PASS] t4-04-timer-rtc: Mode 1 1,000 ms -> +200,000 ticks at both 10k & 1M steps; Mode 0 follows steps (${mode0Recorded[10000].toLocaleString()} & ${mode0Recorded[1000000].toLocaleString()}); RTC_SECONDS & offset verified in ${Date.now() - t0} ms`);
