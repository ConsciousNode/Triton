#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Test 2: JS & WASM Lockstep (2,100,000 Steps) (`tests/t5-02-lockstep.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Runs seeded programs exercising EVERY new Triton 5 instruction (+56..+75:
 * WRAPU, WRAPS, BAND, BOR, BXOR, BNOT, BSHL, BSHR, BSAR, BADD, BADC, BSUB,
 * BSBC, BMULLO, BMULHI, CAS, WFI, TLBFLUSH, TLBINV, RDTLS) with paging ON in
 * ALL THREE page-size modes (729, 2187, 4096), verifying state hashes equal
 * after EVERY SINGLE STEP for 2,100,000 steps (700,000 per page size), plus
 * full-memory `computeStateHash(js) === computeStateHash(wasm)` every 500 steps
 * and at the final step.
 */

const {
  loadHtmlModule, makeRng, sha256Str, PageTableBuilder, recordResult
} = require('./t5-common');

// Fast per-step architectural state hash (same FNV-1a mix as computeStateHash over
// all CPU/SPR/T5 registers, all 9 27-trit GPRs, and active memory window).
function computeStepHash(vm, memWatchStart, memWatchLen) {
  let h = 2166136261 >>> 0;
  const mix = (v) => {
    const lo = v | 0;
    h ^= (lo & 0xFFFF);
    h = Math.imul(h, 16777619) >>> 0;
    h ^= ((lo >> 16) & 0xFFFF);
    h = Math.imul(h, 16777619) >>> 0;
    if (v > 2147483647 || v < -2147483648) {
      const hi = Math.floor(v / 4294967296) | 0;
      h ^= (hi & 0xFFFF);
      h = Math.imul(h, 16777619) >>> 0;
      h ^= ((hi >> 16) & 0xFFFF);
      h = Math.imul(h, 16777619) >>> 0;
    }
  };
  mix(vm.archMode); mix(vm.pc); mix(vm.sp);
  mix(vm.sf); mix(vm.cf); mix(vm.of);
  mix(vm.halted); mix(vm.steps);
  mix(vm.priv); mix(vm.ie); mix(vm.imask); mix(vm.ipend);
  mix(vm.vbr); mix(vm.epc); mix(vm.esp); mix(vm.esr);
  mix(vm.ecause); mix(vm.eaddr); mix(vm.ksp);
  mix(vm.pgEn); mix(vm.ptbr); mix(vm.asid); mix(vm.pfCause);
  mix(vm.wfi); mix(vm.tls); mix(vm.scratch);
  mix(vm.mmuWalks); mix(vm.mmuHits); mix(vm.mmuSplits);
  for (let r = 0; r < 9; r++) {
    const [w0, w1, w2] = vm.getWord(r);
    mix(w0); mix(w1); mix(w2);
  }
  const mem = vm.mem;
  for (let i = memWatchStart; i < memWatchStart + memWatchLen; i++) {
    const v = mem[i];
    if (v !== 0) { mix(i); mix(v); }
  }
  return h >>> 0;
}

function buildLockstepProgram(T, ps, seed) {
  const rng = makeRng(seed);
  const dataBase = 6 * ps;
  const casAddr = dataBase + 10;
  const copySrc = dataBase + 40;
  const copyDst = dataBase + 80;
  const fillDst = dataBase + 120;
  const scratchInit = rng.int(100, 9000);
  const tlsInit = rng.int(100, 9000);

  function liConst(reg, val) {
    const [w0, w1, w2] = T.numberToWord(val);
    let s = `LI ${reg}, #${w0}\n`;
    if (w1 !== 0) s += `LMI ${reg}, #${w1}\n`;
    if (w2 !== 0) s += `LHI ${reg}, #${w2}\n`;
    return s;
  }

  const src = `
    .mode T3
    .org 0
    ; Install IRQ_TIMER handler at VBR + 21 (VBR = 1000)
    LI R0, #1000
    MTSPR R0, #5
    LI R1, #1000
    LI R0, #isr_t
    SW R0, R1, #21

    ; Initialize TLS & SCRATCH SPRs
    LI R0, #${tlsInit}
    MTSPR R0, #23
    LI R0, #${scratchInit}
    MTSPR R0, #24

    ; Enable periodic timer (period 5000 steps) so WFI wakes cleanly
    LI R0, #5000
    OUT R0, #9
    LI R0, #1
    MTSPR R0, #3
    MTSPR R0, #2

    ; Initialize seed registers
    LI R1, #${rng.int(-9000, 9000)}
    LMI R1, #${rng.int(-9000, 9000)}
    LI R2, #${rng.int(-9000, 9000)}
    LMI R2, #${rng.int(-9000, 9000)}
    LI R3, #${rng.int(1, 30)}
    ${liConst('R6', casAddr)}
    SW R1, R6, #0

    LI R8, #0
  main_lp:
    ; Exercise all 15 Binary-C instructions (+56..+70)
    WRAPU R4, R1, #32
    WRAPS R5, R2, #16
    BAND  R0, R4, R5
    BOR   R0, R0, R1
    BXOR  R0, R0, R2
    BNOT  R4, R0
    BSHL  R5, R4, R3
    BSHR  R0, R5, R3
    BSAR  R5, R1, R3
    BADD  R4, R4, R5
    BADC  R5, R1, R2
    BSUB  R0, R4, R5
    BSBC  R4, R1, R2
    BMULLO R0, R4, R5
    BMULHI R5, R4, R5

    ; Exercise RDTLS (+75)
    RDTLS R7
    ADD   R1, R1, R0
    ADD   R2, R2, R5
    ADD   R1, R1, R7

    ; Exercise CAS (+71) on paged memory
    LW  R0, R6, #0
    CAS R0, R6, R1

    ; Exercise BCOPY & BFILL across paged memory
    PUSH R1
    PUSH R2
    PUSH R3
    ${liConst('R1', copyDst)}
    ${liConst('R2', copySrc)}
    LI R3, #3
    BCOPY R1, R2, R3
    ${liConst('R1', fillDst)}
    LI R2, #77
    LI R3, #3
    BFILL R1, R2, R3
    POP R3
    POP R2
    POP R1

    ; Exercise TLBINV (+74), TLBFLUSH (+73), and WFI (+72)
    TLBINV R6
    ADDI R8, R8, #1
    LI R0, #63
    BAND R0, R8, R0
    JNZX skip_flush
    TLBFLUSH
    WFI
  skip_flush:
    LI R0, #31
    BAND R3, R8, R0
    JMPX main_lp

  isr_t:
    PUSH R0
    MFSPR R0, #24
    ADDI R0, R0, #1
    MTSPR R0, #24
    POP R0
    IRET
  `;
  return { built: T.assemble(src, { mode: 'T3' }), dataBase };
}

function runLockstepTest(T, stepsPerPageSize = 700000, seed = 0x70C57E90) {
  const t0 = Date.now();
  const perPageSize = {};
  let totalSteps = 0;
  let fullHashChecks = 0;

  for (const ps of [729, 2187, 4096]) {
    const ramSize = 16 * ps;
    const { built, dataBase } = buildLockstepProgram(T, ps, seed ^ ps);
    const js = new T.TritonJS({ archMode: 'T3', pageSize: ps, ramSize, diskSectors: 2 });
    const wasm = T.TritonWASM.createSync({ archMode: 'T3', pageSize: ps, ramSize, diskSectors: 2 });

    const l0Phys = 10 * ps;
    const flags = T.T5_PTE.V | T.T5_PTE.R | T.T5_PTE.W | T.T5_PTE.X | T.T5_PTE.U;
    for (const m of [js, wasm]) {
      m.loadProgram(built.trytes, 0);
      const ptb = new PageTableBuilder(T, ps, l0Phys, 11);
      for (let pg = 0; pg < 10; pg++) {
        ptb.mapPage([m], pg * ps, pg, flags);
      }
      m.ptbr = l0Phys;
      m.sp = 8 * ps + 400;
      m.pgEn = 1;
      m.flushTlbAll();
    }

    const tPs0 = Date.now();
    for (let s = 1; s <= stepsPerPageSize; s++) {
      js.step();
      wasm.step();
      const shJs = computeStepHash(js, dataBase, 140);
      const shWasm = computeStepHash(wasm, dataBase, 140);
      if (shJs !== shWasm) {
        throw new Error(
          `[t5-02] JS !== WASM step-hash mismatch at ps=${ps} step=${s}: ` +
          `JS=0x${shJs.toString(16)} WASM=0x${shWasm.toString(16)} ` +
          `(pc=${js.pc}/${wasm.pc} sp=${js.sp}/${wasm.sp} sf=${js.sf}/${wasm.sf} cf=${js.cf}/${wasm.cf} wfi=${js.wfi}/${wasm.wfi})`
        );
      }
      if ((s % 500) === 0 || s === stepsPerPageSize) {
        const fhJs = T.computeStateHash(js);
        const fhWasm = T.computeStateHash(wasm);
        fullHashChecks++;
        if (fhJs !== fhWasm) {
          throw new Error(
            `[t5-02] JS !== WASM full computeStateHash mismatch at ps=${ps} step=${s}: ` +
            `JS=0x${fhJs.toString(16)} WASM=0x${fhWasm.toString(16)}`
          );
        }
      }
    }
    const finalFullHash = T.computeStateHash(js);
    totalSteps += stepsPerPageSize;
    perPageSize[ps] = {
      steps: stepsPerPageSize,
      finalFullHash: '0x' + finalFullHash.toString(16),
      mmuWalks: js.mmuWalks,
      mmuHits: js.mmuHits,
      elapsedMs: Date.now() - tPs0
    };
  }

  return {
    test: 2,
    name: 't5-02-lockstep',
    status: 'PASS',
    seed,
    inputHash: sha256Str(`lockstep:${seed}:${stepsPerPageSize}`),
    totalSteps,
    fullHashChecks,
    perPageSize,
    elapsedMs: Date.now() - t0
  };
}

if (require.main === module) {
  const { T } = loadHtmlModule('triton5.html');
  const res = runLockstepTest(T, 700000);
  recordResult(res);
  console.log(`[PASS] t5-02-lockstep: JS === WASM state hash verified after EVERY step for ${res.totalSteps.toLocaleString()} steps (+ ${res.fullHashChecks.toLocaleString()} full-memory computeStateHash checks) across 729/2187/4096 with paging ON & all 20 new opcodes in ${res.elapsedMs} ms`);
}

module.exports = { runLockstepTest };
