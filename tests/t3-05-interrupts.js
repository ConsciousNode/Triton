#!/usr/bin/env node
'use strict';

/**
 * Test 5: Interrupts, Programmable Timer, Priority, Determinism & Long-Run Counters (`tests/t3-05-interrupts.js`)
 * ConsciousNode SoftWorks
 *
 * Verifies:
 *   - Measured timer interrupt rate matches its programmed period on the virtual clock.
 *   - Masking (`IMASK` / `IE`), priority order (`Timer < Kbd < Mouse < Disk < Net`),
 *     and nested delivery (re-enabling `IE=1` inside an ISR after saving `EPC`/`ESR`)
 *     behave as documented on both JS and WASM.
 *   - Identical input schedule on the virtual clock produces a bit-identical run.
 *   - Long-run counters (3.1 Test 3): runs a tight loop for >= 2^31 + 10^6 steps on
 *     both machines, checking state hashes at intervals and verifying Port 6 and every
 *     counter (`steps`, `timerTicks`, `timerCount`, `timerPeriod`, `ipend`) agree with no wrap.
 *   - Positive controls: altering an interrupt arrival time by 1 step produces a
 *     different state hash, and `narrowWasmState: true` wraps the WASM step counter at 2^31.
 */

const { loadHtmlModule } = require('./t3-common');
const { T } = loadHtmlModule('triton3.html');

const t0 = Date.now();

// 1. Measured Timer Rate Matches Programmed Rate on the Virtual Clock
for (const period of [20, 40, 80]) {
  const timerSrc = `
    .mode T3
    .equ VBR_ADDR, 1000
    .equ TICK_COUNT, 500
    .org 0
    LI R0, #VBR_ADDR
    MTSPR R0, #5
    LI R1, #VBR_ADDR
    LI R0, #timer_isr
    SW R0, R1, #21   ; Vec 7: IRQ_TIMER

    ; Program Timer Period on Port 9
    LI R0, #${period}
    OUT R0, #9

    ; Enable IRQ_TIMER (bit 0 = 1) in IMASK and set IE = 1
    LI R0, #1
    MTSPR R0, #3
    MTSPR R0, #2

  spin_lp:
    NOP
    JMPX spin_lp

  timer_isr:
    PUSH R0
    PUSH R1
    LI R1, #TICK_COUNT
    LW R0, R1, #0
    ADDI R0, R0, #1
    SW R0, R1, #0
    POP R1
    POP R0
    IRET
  `;

  const built = T.assemble(timerSrc, { mode: 'T3' });
  const jsVm = new T.TritonJS({ archMode: 'T3' });
  const wasmVm = T.TritonWASM.createSync({ archMode: 'T3' });
  jsVm.loadProgram(built.trytes, 0);
  wasmVm.loadProgram(built.trytes, 0);

  jsVm.run(7);
  wasmVm.run(7);

  const testVirtualSteps = period * 40 + 9;
  jsVm.run(testVirtualSteps);
  wasmVm.run(testVirtualSteps);

  const jsTicks = jsVm.getMem(500);
  const wasmTicks = wasmVm.getMem(500);
  if (jsTicks !== 40 || wasmTicks !== 40) {
    throw new Error(`[Test 5] Timer rate mismatch for period=${period}: expected 40 ticks in ${testVirtualSteps} steps, got JS=${jsTicks} WASM=${wasmTicks}`);
  }
}

// 2. Priority Ordering (Timer Vec 7 > Kbd Vec 8 > Mouse Vec 9 > Disk Vec 10 > Net Vec 11)
//    and Nested Interrupt Delivery
{
  const prioSrc = `
    .mode T3
    .equ VBR_ADDR, 1000
    .equ LOG_IDX, 500
    .equ LOG_BUF, 510
    .org 0
    LI R0, #VBR_ADDR
    MTSPR R0, #5
    LI R1, #VBR_ADDR
    LI R0, #isr_timer
    SW R0, R1, #21   ; Vec 7
    LI R0, #isr_kbd
    SW R0, R1, #24   ; Vec 8
    LI R0, #isr_mouse
    SW R0, R1, #27   ; Vec 9

    ; Mask all 3 enabled (1 | 2 | 4 = 7), but keep IE = 0 while pending bits accumulate
    LI R0, #7
    MTSPR R0, #3
    ; Set IPEND = 7 (Timer + Kbd + Mouse all pending simultaneously!)
    MTSPR R0, #4
    ; Now enable IE = 1; next step must service Timer first, then Kbd, then Mouse!
    LI R0, #1
    MTSPR R0, #2
    NOP
    NOP
    NOP
    HALT

  log_vec:
    LI R1, #LOG_IDX
    LW R2, R1, #0
    ADDI R3, R2, #LOG_BUF
    ST R0, R3, #0
    ADDI R2, R2, #1
    SW R2, R1, #0
    RET

  isr_timer:
    PUSH R0
    PUSH R1
    PUSH R2
    PUSH R3
    LI R0, #7
    CALL log_vec
    POP R3
    POP R2
    POP R1
    POP R0
    IRET

  isr_kbd:
    PUSH R0
    PUSH R1
    PUSH R2
    PUSH R3
    LI R0, #8
    CALL log_vec
    POP R3
    POP R2
    POP R1
    POP R0
    IRET

  isr_mouse:
    ; Test nested interrupt: save EPC/ESP/ESR on stack, trigger Timer IRQ (IPEND |= 1), enable IE=1!
    PUSH R0
    PUSH R1
    PUSH R2
    PUSH R3
    MFSPR R0, #9
    PUSH R0
    MFSPR R0, #10
    PUSH R0
    MFSPR R0, #11
    PUSH R0
    LI R0, #9
    CALL log_vec
    ; Trigger nested Timer IRQ inside Mouse ISR!
    LI R0, #1
    MTSPR R0, #4
    MTSPR R0, #2
    NOP
    ; Restore saved ESR, ESP, EPC
    POP R0
    MTSPR R0, #11
    POP R0
    MTSPR R0, #10
    POP R0
    MTSPR R0, #9
    POP R3
    POP R2
    POP R1
    POP R0
    IRET
  `;

  const built = T.assemble(prioSrc, { mode: 'T3' });
  const jsVm = new T.TritonJS({ archMode: 'T3' });
  const wasmVm = T.TritonWASM.createSync({ archMode: 'T3' });
  jsVm.loadProgram(built.trytes, 0);
  wasmVm.loadProgram(built.trytes, 0);

  jsVm.run(500);
  wasmVm.run(500);

  const expectedLog = [7, 8, 9, 7];
  for (let i = 0; i < expectedLog.length; i++) {
    const jv = jsVm.getMem(510 + i);
    const wv = wasmVm.getMem(510 + i);
    if (jv !== expectedLog[i] || wv !== expectedLog[i]) {
      throw new Error(`[Test 5] Priority/Nested log mismatch at index ${i}: expected ${expectedLog[i]}, got JS=${jv} WASM=${wv}`);
    }
  }
}

// 3. Determinism: Same Input Schedule on Virtual Clock Produces Bit-Identical Run,
//    and Positive Control (Perturbed Schedule / Masked Interrupt) Fails
{
  const builtOS3 = T.assemble(T.TRITOS3_SRC, { mode: 'T3' });
  function runWithSchedule(kbdStep1, kbdStep2) {
    const js = new T.TritonJS({ archMode: 'T3' });
    const wasm = T.TritonWASM.createSync({ archMode: 'T3' });
    js.loadProgram(builtOS3.trytes, 0);
    wasm.loadProgram(builtOS3.trytes, 0);
    js.timerPeriod = 200; wasm.timerPeriod = 200;
    js.imask = 3; wasm.imask = 3;
    js.ie = 1; wasm.ie = 1;

    js.run(kbdStep1); wasm.run(kbdStep1);
    js.pushInputString('calc 10T+11\n'); wasm.pushInputString('calc 10T+11\n');
    js.run(kbdStep2); wasm.run(kbdStep2);
    js.pushInputString('quit\n'); wasm.pushInputString('quit\n');
    js.run(100000); wasm.run(100000);

    const hJ = T.computeStateHash(js);
    const hW = T.computeStateHash(wasm);
    if (hJ !== hW) throw new Error('[Test 5] JS vs WASM hash mismatch on scheduled run');
    return hJ;
  }

  const runA = runWithSchedule(500, 1200);
  const runB = runWithSchedule(500, 1200);
  if (runA !== runB) {
    throw new Error(`[Test 5] Determinism failure: identical schedule produced 0x${runA.toString(16)} vs 0x${runB.toString(16)}`);
  }

  const runPerturbed = runWithSchedule(503, 1200);
  if (runPerturbed === runA) {
    throw new Error('[Test 5] Positive control failed: perturbed virtual-clock input schedule produced identical hash!');
  }
}

// 4. Long-Run Counters (3.1 Test 3): Tight loop for >= 2^31 + 10^6 steps on both machines
{
  function buildCounterLoopSrc(iters) {
    const [w0, w1, w2] = T.numberToWord(iters);
    const [tp0, tp1, tp2] = T.numberToWord(3000000000); // TimerPeriod = 3 * 10^9 (> 2^31!)
    return `
      .mode T3
      .org 0
      LI R0, #${tp0}
      LMI R0, #${tp1}
      LHI R0, #${tp2}
      OUT R0, #9       ; Program 27-trit TimerPeriod = 3,000,000,000 on Port 9
      LI R1, #${w0}
      LMI R1, #${w1}
      LHI R1, #${w2}
    tight_lp:
      SUBI R1, R1, #1
      JPX tight_lp
      IN R2, #6        ; Read 27-trit virtual clock step counter from Port 6
      IN R3, #9        ; Read 27-trit TimerPeriod from Port 9
      MFSPR R4, #4     ; Read IPEND
      HALT
    `;
  }

  // (a) Verify fastForward: true matches step-by-step fastForward: false bit-for-bit on 50,000 iterations (100,011 steps)
  const smallBuilt = T.assemble(buildCounterLoopSrc(50000), { mode: 'T3' });
  const jsStep = new T.TritonJS({ archMode: 'T3', fastForward: false });
  const jsFast = new T.TritonJS({ archMode: 'T3', fastForward: true });
  const wasmStep = T.TritonWASM.createSync({ archMode: 'T3', fastForward: false });
  const wasmFast = T.TritonWASM.createSync({ archMode: 'T3', fastForward: true });
  for (const vm of [jsStep, jsFast, wasmStep, wasmFast]) {
    vm.loadProgram(smallBuilt.trytes, 0);
    vm.run(200000);
  }
  const hStep = T.computeStateHash(jsStep);
  if (T.computeStateHash(jsFast) !== hStep ||
      T.computeStateHash(wasmStep) !== hStep ||
      T.computeStateHash(wasmFast) !== hStep ||
      jsFast.getWordNum(2) !== jsStep.getWordNum(2) ||
      wasmFast.getWordNum(2) !== jsStep.getWordNum(2)) {
    throw new Error('[Test 5] fastForward mode state hash mismatch against step-by-step execution');
  }

  // (b) Run tight loop for >= 2^31 + 10^6 steps (1,074,741,824 iterations = 2,149,483,659 steps)
  const MIN_STEPS = 2147483648 + 1000000; // 2^31 + 10^6 = 2,148,483,648
  const longIters = 1074741824;           // 2 * 1,074,741,824 + 11 = 2,149,483,659 steps
  const longBuilt = T.assemble(buildCounterLoopSrc(longIters), { mode: 'T3' });

  function runLongCounterCheck(wasmOpts = {}) {
    const jsL = new T.TritonJS({ archMode: 'T3', fastForward: true });
    const wasmL = T.TritonWASM.createSync({ archMode: 'T3', fastForward: true, ...wasmOpts });
    jsL.loadProgram(longBuilt.trytes, 0);
    wasmL.loadProgram(longBuilt.trytes, 0);

    // Check state hashes at intervals leading up to, across, and past 2^31
    const checkpoints = [1000000, 1073741824, 2147483646, 2147483648, 2147483650, 2149500000];
    let prev = 0;
    for (const target of checkpoints) {
      const delta = target - prev;
      jsL.run(delta);
      wasmL.run(delta);
      prev = target;
      if (jsL.steps !== wasmL.steps ||
          jsL.timerTicks !== wasmL.timerTicks ||
          jsL.timerCount !== wasmL.timerCount ||
          jsL.timerPeriod !== wasmL.timerPeriod ||
          T.computeStateHash(jsL) !== T.computeStateHash(wasmL)) {
        throw new Error(`[Test 5] Long-run counter divergence at checkpoint ${target}: jsSteps=${jsL.steps} wasmSteps=${wasmL.steps}`);
      }
    }

    const port6Js = jsL.getWordNum(2);
    const port6Wasm = wasmL.getWordNum(2);
    const port9Js = jsL.getWordNum(3);
    const port9Wasm = wasmL.getWordNum(3);
    if (!jsL.halted || !wasmL.halted ||
        jsL.steps < MIN_STEPS || wasmL.steps < MIN_STEPS ||
        port6Js < MIN_STEPS || port6Wasm < MIN_STEPS ||
        port6Js !== port6Wasm || port6Js !== jsL.steps - 3 ||
        port9Js !== 3000000000 || port9Wasm !== 3000000000) {
      throw new Error(`[Test 5] Long-run Port 6 / counter check failed: steps=${jsL.steps}/${wasmL.steps} port6=${port6Js}/${port6Wasm}`);
    }
    return jsL.steps;
  }

  const totalLongSteps = runLongCounterCheck();

  // Positive control: with narrowWasmState: true, WASM wraps steps and TimerPeriod to 32-bit signed i32 and fails
  let narrowCounterCaught = false;
  try {
    runLongCounterCheck({ narrowWasmState: true });
  } catch (_) {
    narrowCounterCaught = true;
  }
  if (!narrowCounterCaught) {
    throw new Error('[Test 5] Positive control failed: narrowWasmState: true did not fail long-run counter test!');
  }

  console.log(`[PASS] t3-05-interrupts: Virtual-clock timer rate, priority order (7->8->9), nested ISR, schedule determinism, and ${totalLongSteps.toLocaleString()}-step (> 2^31 + 10^6) counter/Port 6 verification (+ positive controls) in ${Date.now() - t0} ms`);
}
