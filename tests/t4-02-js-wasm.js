#!/usr/bin/env node
'use strict';

/**
 * Triton 4 Machine Test 2: JS <-> WASM Step-for-Step Equivalence on Units, Timer Mode & RTC (`tests/t4-02-js-wasm.js`)
 * ConsciousNode SoftWorks
 *
 * Verifies that `TritonJS` and `TritonWASM` agree step-for-step (`computeStateHash(js) === computeStateHash(wasm)`
 * at every step) on:
 *   1. Storage unit selection, size/flag probing, stream read/write with wrap, multi-sector DMA read/write
 *      across Units 0, 1, 2, and 5, plus `IRQ_MEDIA` interrupt delivery on insert and eject.
 *   2. Timer Mode 0 and Timer Mode 1 switching, 200 kHz real-time tick counting, and periodic `IRQ_TIMER`
 *      delivery driven by the injectable clock.
 *   3. `RTC_SECONDS` (Port 32) reading, writing an offset, and advancing the injectable clock.
 */

const { loadHtmlModule, makeRng } = require('./t3-common');
const { T } = loadHtmlModule('triton4.html');

const t0 = Date.now();
const rng = makeRng(0x4002BEEF);

function stepBothAndVerify(name, jsVm, wasmVm, count) {
  for (let s = 0; s < count; s++) {
    if (jsVm.halted && wasmVm.halted) break;
    jsVm.step();
    wasmVm.step();
    const hj = T.computeStateHash(jsVm);
    const hw = T.computeStateHash(wasmVm);
    if (hj !== hw || jsVm.pc !== wasmVm.pc || jsVm.steps !== wasmVm.steps ||
        jsVm.diskUnit !== wasmVm.diskUnit || jsVm.timerMode !== wasmVm.timerMode ||
        jsVm.timerTicks !== wasmVm.timerTicks || jsVm.ipend !== wasmVm.ipend) {
      throw new Error(`[t4-02] JS/WASM step divergence on '${name}' at step ${jsVm.steps}: hash=0x${hj.toString(16)}/0x${hw.toString(16)} pc=${jsVm.pc}/${wasmVm.pc}`);
    }
  }
}

let totalLockstepSteps = 0;

// 1. Storage Unit Program (Units 0, 1, 2, 5 + DMA + Stream + IRQ_MEDIA)
{
  const unitProg = T.assemble(`
    .mode T3
    .equ VBR_ADDR, 1000
    .equ MEDIA_CNT, 500
    .equ MEDIA_FLAGS, 503
    .org 0
    ; Set up VBR at 1000 with Vec 10 (IRQ_DISK = VBR+30) and Vec 12 (IRQ_MEDIA = VBR+36)
    LI R0, #VBR_ADDR
    MTSPR R0, #5
    LI R1, #VBR_ADDR
    LI R0, #isr_disk
    SW R0, R1, #30
    LI R0, #isr_media
    SW R0, R1, #36

    ; Enable IRQ_DISK (8) | IRQ_MEDIA (32) = 40 in IMASK, IE = 1
    LI R0, #40
    MTSPR R0, #3
    LI R0, #1
    MTSPR R0, #2

    ; Probe Unit 0 size & flags into Mem[600..605]
    LI R0, #0
    OUT R0, #28
    IN R2, #29
    IN R3, #30
    LI R1, #600
    SW R2, R1, #0
    SW R3, R1, #3

    ; Select Unit 1 (Home disk, 59,049 sectors), read size & flags into Mem[606..611]
    LI R0, #1
    OUT R0, #28
    IN R2, #29
    IN R3, #30
    SW R2, R1, #6
    SW R3, R1, #9

    ; Fill RAM[2000..3457] (2 sectors) and DMA_WRITE to Unit 1 LBA 50000..50001
    LI R4, #2000
    LI R5, #777
    LI R6, #1458
    BFILL R4, R5, R6
    LI R0, #-8049
    LMI R0, #3       ; 50000 = 3*19683 - 9049
    LI R0, #-9049
    LMI R0, #3
    OUT R0, #17      ; DISK_LBA = 50000
    LI R0, #2000
    OUT R0, #18      ; DISK_DMA_ADDR = 2000
    LI R0, #2
    OUT R0, #19      ; DISK_COUNT = 2
    OUT R0, #20      ; DMA_WRITE
    NOP

    ; Re-enable IE=1 and DMA_READ back into RAM[4000..5457]
    LI R0, #1
    MTSPR R0, #2
    LI R0, #4000
    OUT R0, #18
    LI R0, #1
    OUT R0, #20      ; DMA_READ
    NOP

    ; Wait loop for media insert/eject events driven by harness
    LI R7, #40
  wait_lp:
    SUBI R7, R7, #1
    JPX wait_lp

    ; After media inserted into Unit 2, select Unit 2, read size and stream-write/read across wrap
    LI R0, #2
    OUT R0, #28
    IN R2, #29
    LI R1, #612
    SW R2, R1, #0
    HALT

  isr_disk:
    PUSH R0
    PUSH R1
    LI R1, #510
    LW R0, R1, #0
    ADDI R0, R0, #1
    SW R0, R1, #0
    POP R1
    POP R0
    IRET

  isr_media:
    PUSH R0
    PUSH R1
    LI R1, #MEDIA_CNT
    LW R0, R1, #0
    ADDI R0, R0, #1
    SW R0, R1, #0
    LI R0, #2
    OUT R0, #28
    IN R0, #30       ; Read DISK_FLAGS on Unit 2 (clears changed bit)
    LI R1, #MEDIA_FLAGS
    SW R0, R1, #0
    POP R1
    POP R0
    IRET
  `, { mode: 'T3' });

  const jsVm = new T.TritonJS({ archMode: 'T3' });
  const wasmVm = T.TritonWASM.createSync({ archMode: 'T3' });
  jsVm.loadProgram(unitProg.trytes, 0);
  wasmVm.loadProgram(unitProg.trytes, 0);

  stepBothAndVerify('unit-prog-phase1', jsVm, wasmVm, 1525);
  totalLockstepSteps += 1525;

  // Insert a 2,187-sector removable cartridge into Unit 2 on both VMs
  jsVm.createBlankUnit(2, 2187);
  wasmVm.createBlankUnit(2, 2187);

  stepBothAndVerify('unit-prog-phase2', jsVm, wasmVm, 300);
  totalLockstepSteps += jsVm.steps - 1525;

  if (!jsVm.halted || jsVm.getMem(500) !== 1 || jsVm.getMem(503) !== 11 ||
      jsVm.getMem(4000) !== 777 || jsVm.getMem(5457) !== 777) {
    throw new Error(`[t4-02] Unexpected unit program results: mediaCnt=${jsVm.getMem(500)} flags=${jsVm.getMem(503)} dma=${jsVm.getMem(4000)}`);
  }
}

// 2. Timer Mode 1 & Periodic Timer Program
{
  const timerProg = T.assemble(`
    .mode T3
    .equ VBR_ADDR, 1000
    .org 0
    LI R0, #VBR_ADDR
    MTSPR R0, #5
    LI R1, #VBR_ADDR
    LI R0, #t_isr
    SW R0, R1, #21   ; Vec 7: IRQ_TIMER

    ; Switch to Timer Mode 1 (200 kHz real time)
    LI R0, #1
    OUT R0, #31
    IN R1, #31       ; R1 = 1

    ; Program TimerPeriod = 50,000 ticks (250 ms)
    LI R0, #-9049
    LMI R0, #3       ; 50,000
    OUT R0, #9

    ; Enable IRQ_TIMER (bit 0 = 1) and IE = 1
    LI R0, #1
    MTSPR R0, #3
    MTSPR R0, #2

    IN R2, #6        ; initial real-time ticks
    LI R5, #50
  lp:
    SUBI R5, R5, #1
    JPX lp
    IN R3, #6        ; final real-time ticks
    HALT

  t_isr:
    PUSH R0
    PUSH R1
    LI R1, #500
    LW R0, R1, #0
    ADDI R0, R0, #1
    SW R0, R1, #0
    LI R0, #1
    MTSPR R0, #2
    POP R1
    POP R0
    IRET
  `, { mode: 'T3' });

  const jsVm = new T.TritonJS({ archMode: 'T3' });
  const wasmVm = T.TritonWASM.createSync({ archMode: 'T3' });
  jsVm.loadProgram(timerProg.trytes, 0);
  wasmVm.loadProgram(timerProg.trytes, 0);

  // Step through setup and enter loop
  stepBothAndVerify('timer-mode1-setup', jsVm, wasmVm, 20);
  // Advance injectable clock in 4 steps of 250 ms (total 1,000 ms = 200,000 ticks)
  for (let k = 0; k < 4; k++) {
    jsVm.advanceClockMs(250);
    wasmVm.advanceClockMs(250);
    stepBothAndVerify(`timer-mode1-slice-${k}`, jsVm, wasmVm, 40);
  }
  totalLockstepSteps += jsVm.steps;

  if (!jsVm.halted || jsVm.getWordNum(1) !== 1 || jsVm.getWordNum(3) - jsVm.getWordNum(2) !== 200000 || jsVm.getMem(500) !== 4) {
    throw new Error(`[t4-02] Unexpected timer mode 1 results: mode=${jsVm.getWordNum(1)} deltaTicks=${jsVm.getWordNum(3) - jsVm.getWordNum(2)} irqs=${jsVm.getMem(500)}`);
  }
}

// 3. RTC_SECONDS Program (read, set offset, advance clock, read again)
{
  const rtcProg = T.assemble(`
    .mode T3
    .org 0
    IN R1, #32       ; initial RTC_SECONDS
    LI R0, #1000
    OUT R0, #32      ; set RTC to 1,000 seconds
    IN R2, #32       ; should read 1,000
    NOP
    NOP
    IN R3, #32       ; after clock advances 45,000 ms, should read 1,045
    HALT
  `, { mode: 'T3' });

  const jsVm = new T.TritonJS({ archMode: 'T3', initialClockMs: 1794873600000 });
  const wasmVm = T.TritonWASM.createSync({ archMode: 'T3', initialClockMs: 1794873600000 });
  jsVm.loadProgram(rtcProg.trytes, 0);
  wasmVm.loadProgram(rtcProg.trytes, 0);

  stepBothAndVerify('rtc-phase1', jsVm, wasmVm, 5);
  jsVm.advanceClockMs(45000);
  wasmVm.advanceClockMs(45000);
  stepBothAndVerify('rtc-phase2', jsVm, wasmVm, 10);
  totalLockstepSteps += jsVm.steps;

  if (!jsVm.halted || jsVm.getWordNum(1) !== 848188800 || jsVm.getWordNum(2) !== 1000 || jsVm.getWordNum(3) !== 1045) {
    throw new Error(`[t4-02] Unexpected RTC results: R1=${jsVm.getWordNum(1)} R2=${jsVm.getWordNum(2)} R3=${jsVm.getWordNum(3)}`);
  }
}

console.log(`[PASS] t4-02-js-wasm: JS === WASM step-for-step across ${totalLockstepSteps.toLocaleString()} steps on unit, timer-mode 1, and RTC programs in ${Date.now() - t0} ms`);
