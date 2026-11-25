#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Test 7: Atomics (CAS under Interleaved Interrupts), WFI & TLS (`tests/t5-07-atomics.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Verifies:
 *   1. CAS lock-free counter increment under frequent interleaved IRQ_TIMER
 *      interrupts where BOTH main thread and ISR contend on the exact same
 *      shared counter word via CAS retry loops. Confirmed against exact
 *      sequential-consistency model (mainIncs + isrIncs === finalCounter,
 *      zero lost updates), both non-paged and paged, JS === WASM.
 *   2. WFI sleeps until an enabled interrupt arrives (timers advance while
 *      sleeping), wakes cleanly and runs ISR + resumes after WFI; HALT still
 *      halts permanently until reset; User-mode WFI traps PRIV_VIOL.
 *   3. SPR_TLS + RDTLS (readable from User mode) and SPR_SCRATCH (Supervisor-only).
 */

const {
  loadHtmlModule, sha256Str, writePhysWord, readPhysWord, PageTableBuilder, recordResult
} = require('./t5-common');

function runAtomicsTest(T) {
  const t0 = Date.now();

  // 1. CAS under interleaved timer interrupts (main thread does 300 CAS increments,
  //    timer ISR fires every 11 steps and also does a CAS increment on the SAME word!)
  const SHARED_CNT = 4000;
  const ISR_HITS = 4003;
  const MAIN_DONE = 4006;

  const casProg = T.assemble(`
    .mode T3
    .org 0
    ; Install IRQ_TIMER (Vector 7 -> VBR + 21)
    LI R0, #1000
    MTSPR R0, #5
    LI R1, #1000
    LI R0, #isr_timer
    SW R0, R1, #21

    ; Initialize shared counter = 0, isr_hits = 0, main_done = 0
    LI R0, #0
    LI R1, #${SHARED_CNT}
    SW R0, R1, #0
    SW R0, R1, #3
    SW R0, R1, #6

    ; Start periodic timer (period = 11 steps) and enable IRQ_TIMER (bit 0) + IE
    LI R0, #23
    OUT R0, #9
    LI R0, #1
    MTSPR R0, #3
    MTSPR R0, #2

    ; Main thread: perform 300 lock-free CAS increments on SHARED_CNT
    LI R5, #300
    LI R6, #${SHARED_CNT}
  main_lp:
    CMPI R5, #0
    JZX main_fin
  main_retry:
    LW R0, R6, #0       ; expected = *SHARED_CNT
    ADDI R2, R0, #1     ; desired = expected + 1
    CAS R0, R6, R2      ; atomic CAS: if *R6 == R0 -> *R6 = R2, SF=1
    JZX main_retry      ; if ISR interleaved between LW and CAS, retry!
    SUBI R5, R5, #1
    JMPX main_lp

  main_fin:
    ; Disable interrupts and record completion
    LI R0, #0
    MTSPR R0, #2
    LI R0, #1
    SW R0, R6, #6
    HALT

  isr_timer:
    PUSH R0
    PUSH R1
    PUSH R2
    LI R1, #${SHARED_CNT}
  isr_retry:
    LW R0, R1, #0
    ADDI R2, R0, #1
    CAS R0, R1, R2
    JZX isr_retry
    ; Increment ISR_HITS
    LW R0, R1, #3
    ADDI R0, R0, #1
    SW R0, R1, #3
    POP R2
    POP R1
    POP R0
    IRET
  `, { mode: 'T3' });

  const casResults = {};
  for (const paged of [false, true]) {
    const ps = 2187;
    const js = new T.TritonJS({ archMode: 'T3', pageSize: ps, ramSize: 30 * ps, diskSectors: 2 });
    const wasm = T.TritonWASM.createSync({ archMode: 'T3', pageSize: ps, ramSize: 30 * ps, diskSectors: 2 });
    for (const m of [js, wasm]) {
      m.loadProgram(casProg.trytes, 0);
      m.sp = 10 * ps + 500;
      if (paged) {
        const ptb = new PageTableBuilder(T, ps, 20 * ps, 21);
        const flags = T.T5_PTE.V | T.T5_PTE.R | T.T5_PTE.W | T.T5_PTE.X | T.T5_PTE.U;
        for (let pg = 0; pg < 15; pg++) ptb.mapPage([m], pg * ps, pg, flags);
        m.ptbr = 20 * ps;
        m.sp = 10 * ps + 500;
        m.pgEn = 1;
        m.flushTlbAll();
      }
    }
    js.run(50000);
    wasm.run(50000);
    if (!js.halted || !wasm.halted) throw new Error(`[t5-07] CAS test (paged=${paged}) did not halt`);
    if (T.computeStateHash(js) !== T.computeStateHash(wasm)) {
      throw new Error(`[t5-07] CAS test (paged=${paged}) JS/WASM state hash mismatch`);
    }
    const finalCnt = readPhysWord(T, js, SHARED_CNT);
    const isrHits = readPhysWord(T, js, ISR_HITS);
    const expectedCnt = 300 + isrHits;
    if (isrHits < 20) throw new Error(`[t5-07] Expected >= 20 interleaved interrupts, got ${isrHits}`);
    if (finalCnt !== expectedCnt) {
      throw new Error(`[t5-07] Lost atomic update (paged=${paged}): final=${finalCnt}, expected 300+${isrHits}=${expectedCnt}`);
    }
    casResults[paged ? 'paged' : 'unpaged'] = { mainIncs: 300, isrHits, finalCnt, jsWasmEqual: true };
  }

  // 2. WFI test: sleep until IRQ_TIMER arrives after 40 steps, then wake, run ISR, and resume
  const wfiProg = T.assemble(`
    .mode T3
    .org 0
    LI R0, #1000
    MTSPR R0, #5
    LI R1, #1000
    LI R0, #isr_wfi
    SW R0, R1, #21
    LI R0, #40
    OUT R0, #9
    LI R0, #1
    MTSPR R0, #3
    MTSPR R0, #2
    LI R4, #0
    WFI
    ADDI R4, R4, #100
    HALT
  isr_wfi:
    ADDI R4, R4, #7
    IRET
  `, { mode: 'T3' });

  const jsW = new T.TritonJS({ archMode: 'T3', ramSize: 16384, diskSectors: 2 });
  const wasmW = T.TritonWASM.createSync({ archMode: 'T3', ramSize: 16384, diskSectors: 2 });
  jsW.loadProgram(wfiProg.trytes, 0); jsW.sp = 8000;
  wasmW.loadProgram(wfiProg.trytes, 0); wasmW.sp = 8000;

  let sawSleeping = false;
  for (let s = 0; s < 100 && !jsW.halted; s++) {
    jsW.step();
    wasmW.step();
    if (T.computeStateHash(jsW) !== T.computeStateHash(wasmW)) {
      throw new Error(`[t5-07] WFI JS/WASM hash mismatch at step ${s + 1}`);
    }
    if (jsW.wfi === 1) sawSleeping = true;
  }
  if (!sawSleeping) throw new Error('[t5-07] WFI never entered sleep state');
  if (!jsW.halted || jsW.getWordNum(4) !== 107) {
    throw new Error(`[t5-07] WFI wake/resume failed: halted=${jsW.halted} R4=${jsW.getWordNum(4)}`);
  }

  // 3. RDTLS (User-readable) & SPR_SCRATCH (Supervisor-only) & User-mode WFI -> PRIV_VIOL
  const tlsProg = T.assemble(`
    .mode T3
    .org 0
    LI R0, #1000
    MTSPR R0, #5
    LI R1, #1000
    LI R0, #priv_h
    SW R0, R1, #6       ; Vector 2 PRIV_VIOL
    LI R0, #7777
    MTSPR R0, #23       ; SPR_TLS = 7777
    LI R0, #8888
    MTSPR R0, #24       ; SPR_SCRATCH = 8888
    MFSPR R7, #24       ; R7 = 8888
    ; Drop to User mode at user_entry
    LI R0, #user_entry
    MTSPR R0, #9        ; EPC
    LI R0, #5000
    MTSPR R0, #10       ; ESP
    LI R0, #27          ; PRIV=1
    MTSPR R0, #11       ; ESR
    IRET
  user_entry:
    RDTLS R6            ; Must succeed in User mode -> R6 = 7777
    WFI                 ; Must trap PRIV_VIOL (Vector 2) in User mode!
    HALT
  priv_h:
    MFSPR R5, #12       ; ECAUSE = 2
    HALT
  `, { mode: 'T3' });

  const jsT = new T.TritonJS({ archMode: 'T3', ramSize: 16384, diskSectors: 2 });
  const wasmT = T.TritonWASM.createSync({ archMode: 'T3', ramSize: 16384, diskSectors: 2 });
  jsT.loadProgram(tlsProg.trytes, 0); jsT.sp = 8000;
  wasmT.loadProgram(tlsProg.trytes, 0); wasmT.sp = 8000;
  jsT.run(200);
  wasmT.run(200);
  if (T.computeStateHash(jsT) !== T.computeStateHash(wasmT)) throw new Error('[t5-07] TLS/WFI priv hash mismatch');
  if (jsT.getWordNum(6) !== 7777 || jsT.getWordNum(7) !== 8888 || jsT.getWordNum(5) !== 2) {
    throw new Error(`[t5-07] TLS/SCRATCH/WFI priv check failed: R6=${jsT.getWordNum(6)} R7=${jsT.getWordNum(7)} R5=${jsT.getWordNum(5)}`);
  }

  return {
    test: 7,
    name: 't5-07-atomics',
    status: 'PASS',
    inputHash: sha256Str('atomics-wfi-tls-v1'),
    cas: casResults,
    wfi: { sawSleeping, finalR4: jsW.getWordNum(4), steps: jsW.steps },
    tlsAndScratch: { userRdtls: 7777, supScratch: 8888, userWfiTrapVec: 2 },
    elapsedMs: Date.now() - t0
  };
}

if (require.main === module) {
  const { T } = loadHtmlModule('triton5.html');
  const res = runAtomicsTest(T);
  recordResult(res);
  console.log(`[PASS] t5-07-atomics: CAS under interleaved IRQ_TIMER (unpaged=${res.cas.unpaged.finalCnt}, paged=${res.cas.paged.finalCnt}, 0 lost updates), WFI wake (${res.wfi.steps} steps), RDTLS/SCRATCH verified JS === WASM in ${res.elapsedMs} ms`);
}

module.exports = { runAtomicsTest };
