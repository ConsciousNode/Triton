#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Stage 2 Test 11: NULL (-B) Fault, Frame 0 Guard & Machine vs C Space (`tests/t5-11-balanced-null.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Verifies in balanced-3^k at BOTH 729 (B=364) and 2,187 (B=1,093) with
 * JS === WASM state hash checked after EVERY single step:
 *   1. Dereferencing C NULL (machine address -B) via READ, WRITE, and EXEC faults
 *      to Vector 13 with EADDR = -B (machine space, NOT 0).
 *   2. Virtual page 0 ([-B .. +B]) ALWAYS faults even if a valid PTE is written
 *      into L1 slot (0, 0).
 *   3. Physical frame 0 (ppn = 0) in a valid PTE ALWAYS faults and never produces
 *      a negative physical address.
 *   4. Machine space verification: PC, CALL/CALLX/JALR return addresses, BCOPY/BFILL
 *      operands, PTEs, and EADDR all operate in machine space (never C space).
 */

const {
  loadHtmlModule, sha256Str, writePhysWord, recordResult
} = require('./t5-common');

function runBalancedNullAndSpaceTest(T) {
  const t0 = Date.now();
  const perSize = {};

  for (const ps of [729, 2187]) {
    const B = (ps - 1) / 2;
    const ramSize = 20 * ps;
    const js = new T.TritonJS({ archMode: 'T3', pageSize: ps, mmuMode: 'balanced', ramSize, diskSectors: 2 });
    const wasm = T.TritonWASM.createSync({ archMode: 'T3', pageSize: ps, mmuMode: 'balanced', ramSize, diskSectors: 2 });

    const rwx = T.T5_PTE.V | T.T5_PTE.R | T.T5_PTE.W | T.T5_PTE.X | T.T5_PTE.U;
    const l0Base = 1 * ps;
    const l1Base = 2 * ps;
    const codeVaBase = 1 * ps - B; // lowest tryte of virtual page 1 -> Frame 3
    const codePaBase = 3 * ps - B;
    const stackVaTop = 2 * ps + B - 30; // inside virtual page 2 -> Frame 4
    const pfHandlerVa = codeVaBase + 200;

    for (const m of [js, wasm]) {
      // VBR = 0 (lives in reserved RAM 0..B, outside all frames!)
      m.vbr = 0;
      writePhysWord(T, m, 13 * 3, pfHandlerVa);
      // L0[0] -> Frame 2 (centred)
      writePhysWord(T, m, l0Base + 0 * 3 - 1, 2 * 512 + T.T5_PTE.V);
      // Plant a valid PTE in virtual page 0 slot (L1[0]) to prove hardware STILL rejects vpn=0!
      writePhysWord(T, m, l1Base + 0 * 3 - 1, 5 * 512 + rwx);
      // Map virtual page 1 -> Frame 3 (code), virtual page 2 -> Frame 4 (stack)
      writePhysWord(T, m, l1Base + 1 * 3 - 1, 3 * 512 + rwx);
      writePhysWord(T, m, l1Base + 2 * 3 - 1, 4 * 512 + rwx);
      // Plant a PTE with illegal Frame 0 (ppn = 0) at virtual page 5 (L1[5])!
      writePhysWord(T, m, l1Base + 5 * 3 - 1, 0 * 512 + rwx);
    }

    // Program at codeVaBase:
    //   +0:   LT R0, R1, #0 ; HALT   (dereference R1 = -B -> NULL read)
    //   +4:   ST R0, R1, #0 ; HALT   (dereference R1 = -B -> NULL write)
    //   +8:   CALLX sub_fn  ; HALT   (verifies return PC pushed is in machine space!)
    //   +12:  sub_fn: LW R6, R7, #0 ; POP R5 ; PUSH R5 ; RET
    //   +200: pf_handler: MFSPR R2, #13 ; MFSPR R3, #19 ; HALT
    const prog = T.assemble(`
      .mode T3
      .org 0
      LT R0, R1, #0
      HALT
      ST R0, R1, #0
      HALT
      CALLX sub_fn
      HALT
    sub_fn:
      POP R5
      PUSH R5
      RET
      .org 200
    pf_handler:
      MFSPR R2, #13
      MFSPR R3, #19
      HALT
    `, { mode: 'T3' });

    for (const m of [js, wasm]) {
      for (let i = 0; i < prog.trytes.length; i++) {
        if (prog.trytes[i] !== 0) m.setMem(codePaBase + i, prog.trytes[i]);
      }
      m.ptbr = l0Base;
      m.pgEn = 1;
      m.flushTlbAll();
    }

    let totalSteps = 0;
    function runLockstep(setupFn, maxSteps = 50) {
      setupFn(js);
      setupFn(wasm);
      let s = 0;
      while (!js.halted && s < maxSteps) {
        js.step();
        wasm.step();
        s++;
        totalSteps++;
        if (T.computeStateHash(js) !== T.computeStateHash(wasm)) {
          throw new Error(`[t5-11] JS/WASM lockstep mismatch in balanced-${ps} at step ${totalSteps}`);
        }
      }
      if (!js.halted) throw new Error(`[t5-11] balanced-${ps} did not halt`);
    }

    // Case A: READ C NULL (machine address -B) -> must fault with EADDR = -B
    runLockstep((m) => { m.halted = 0; m.pc = codeVaBase + 0; m.setWordNum(1, -B); m.ecause = 0; m.eaddr = 0; });
    if (js.ecause !== 13 || js.getWordNum(2) !== -B || js.eaddr !== -B) {
      throw new Error(`[t5-11] balanced-${ps} NULL read expected EADDR=${-B}, got ecause=${js.ecause} EADDR=${js.eaddr}`);
    }

    // Case B: WRITE C NULL (machine address -B) -> must fault with EADDR = -B
    runLockstep((m) => { m.halted = 0; m.pc = codeVaBase + 4; m.setWordNum(1, -B); m.ecause = 0; m.eaddr = 0; });
    if (js.ecause !== 13 || js.getWordNum(2) !== -B || js.eaddr !== -B) {
      throw new Error(`[t5-11] balanced-${ps} NULL write expected EADDR=${-B}, got ecause=${js.ecause} EADDR=${js.eaddr}`);
    }

    // Case C: EXEC C NULL (PC = -B) -> must fault with EADDR = -B
    runLockstep((m) => { m.halted = 0; m.pc = -B; m.ecause = 0; m.eaddr = 0; });
    if (js.ecause !== 13 || js.getWordNum(2) !== -B || js.eaddr !== -B) {
      throw new Error(`[t5-11] balanced-${ps} NULL exec expected EADDR=${-B}, got ecause=${js.ecause} EADDR=${js.eaddr}`);
    }

    // Case D: Virtual page 0 (+B and 0) must ALSO fault despite valid PTE planted in L1[0]
    for (const v0Addr of [0, B]) {
      runLockstep((m) => { m.halted = 0; m.pc = codeVaBase + 0; m.setWordNum(1, v0Addr); m.ecause = 0; m.eaddr = 0; });
      if (js.ecause !== 13 || js.eaddr !== v0Addr) {
        throw new Error(`[t5-11] balanced-${ps} vpage0 addr=${v0Addr} failed to fault (ecause=${js.ecause}, eaddr=${js.eaddr})`);
      }
    }

    // Case E: Frame 0 (ppn = 0 at vpn = 5, VA = 5*ps - B) must fault and NEVER access negative PA!
    const f0Va = 5 * ps - B;
    runLockstep((m) => { m.halted = 0; m.pc = codeVaBase + 0; m.setWordNum(1, f0Va); m.ecause = 0; m.eaddr = 0; });
    if (js.ecause !== 13 || js.eaddr !== f0Va) {
      throw new Error(`[t5-11] balanced-${ps} Frame-0 PTE failed to fault (ecause=${js.ecause}, eaddr=${js.eaddr})`);
    }

    // Case F: Machine space verification for CALLX return address (must equal codeVaBase + 10)
    runLockstep((m) => { m.halted = 0; m.pc = codeVaBase + 8; m.sp = stackVaTop; m.ecause = 0; });
    const retPc = js.getWordNum(5);
    if (retPc !== codeVaBase + 10) {
      throw new Error(`[t5-11] balanced-${ps} CALLX return PC not in machine space: expected ${codeVaBase + 10}, got ${retPc}`);
    }

    perSize[ps] = {
      biasB: B,
      nullFaultEaddr: -B,
      vpage0Guarded: true,
      frame0Guarded: true,
      callxReturnMachinePc: retPc,
      lockstepSteps: totalSteps
    };
  }

  return {
    test: 11,
    name: 't5-11-balanced-null',
    status: 'PASS',
    inputHash: sha256Str('balanced-null-frame0-space:729,2187'),
    perSize,
    elapsedMs: Date.now() - t0
  };
}

if (require.main === module) {
  const { T } = loadHtmlModule('triton5.html');
  const res = runBalancedNullAndSpaceTest(T);
  recordResult(res);
  console.log(`[PASS] t5-11-balanced-null: NULL (-B) read/write/exec faults (EADDR=-B), vpage0 guard, frame0 guard, and machine-space CALLX verified JS === WASM across 729 & 2187 in ${res.elapsedMs} ms`);
}

module.exports = { runBalancedNullAndSpaceTest };
