#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Stage 2 Test 12: Balanced-3^k Restartability Across (+B -> -B) Page Boundary (`tests/t5-12-balanced-restart.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Verifies precise fault restart across a balanced-3^k page boundary (offset +B -> -B)
 * in the middle of BCOPY (overlapping downward copy so restarting from 0 corrupts data),
 * BFILL, and page-straddling LW/SW, at BOTH 729 (B=364) and 2,187 (B=1,093), with
 * JS === WASM state hash verified after EVERY SINGLE STEP!
 */

const {
  loadHtmlModule, sha256Str, writePhysWord, recordResult
} = require('./t5-common');

function runBalancedRestartTest(T) {
  const t0 = Date.now();
  const perSize = {};

  for (const ps of [729, 2187]) {
    const B = (ps - 1) / 2;
    const ramSize = 25 * ps;
    const rwx = T.T5_PTE.V | T.T5_PTE.R | T.T5_PTE.W | T.T5_PTE.X | T.T5_PTE.U;
    const l0Base = 1 * ps;
    const l1Base = 2 * ps;
    const codeVa = 1 * ps - B;      // Frame 3
    const handlerVa = 2 * ps - B;   // Frame 4
    const saveVa = 3 * ps - B;      // Frame 5 (handler scratch)
    const faultCntVa = saveVa + 20;

    function liConst(reg, val) {
      const [w0, w1, w2] = T.numberToWord(val);
      let s = `LI ${reg}, #${w0}\n`;
      if (w1 !== 0) s += `LMI ${reg}, #${w1}\n`;
      if (w2 !== 0) s += `LHI ${reg}, #${w2}\n`;
      return s;
    }

    // Demand-paging handler in balanced-3^k:
    //   Reads faulting VA from SPR_EADDR (13), computes balanced VPN = (EADDR + B) / ps
    //   (exact for EADDR >= -B because floor((A+B)/3^k) == balQuot(A, 3^k, B)!),
    //   maps VPN -> PPN = VPN + 2 in L1 table (Frame 2 is mapped at VA vpn=6 -> Frame 2!),
    //   calls TLBINV, and executes IRET!
    const l1MappedVa = 6 * ps; // Virtual page 6 centre maps directly to Frame 2 centre (L1 table)!
    const handlerProg = T.assemble(`
      .mode T3
      MTSPR R0, #24
      ${liConst('R0', saveVa)}
      SW R1, R0, #3
      SW R2, R0, #6
      SW R3, R0, #9
      MFSPR R1, #24
      SW R1, R0, #0

      ; Increment fault counter
      ${liConst('R0', faultCntVa)}
      LW R1, R0, #0
      ADDI R1, R1, #1
      SW R1, R0, #0

      ; Read faulting VA from SPR_EADDR (13), compute balanced VPN = (VA + B) / ps
      MFSPR R0, #13
      ${liConst('R1', B)}
      ADD R2, R0, R1
      ${liConst('R1', ps)}
      DIV R2, R2, R1

      ; Map VPN -> PPN = VPN + 2: PTE = (VPN + 2) * 512 + rwx
      ADDI R3, R2, #2
      LI R1, #512
      MUL R3, R3, R1
      ADDI R3, R3, #${rwx}

      ; Write PTE into centred L1 table at l1MappedVa + VPN * 3 - 1
      MULI R2, R2, #3
      SUBI R2, R2, #1
      ${liConst('R1', l1MappedVa)}
      ADD R1, R1, R2
      SW R3, R1, #0

      TLBINV R0
      ${liConst('R0', saveVa)}
      LW R3, R0, #9
      LW R2, R0, #6
      LW R1, R0, #3
      LW R0, R0, #0
      IRET
    `, { mode: 'T3' });

    // Page boundary between vpn=10 (Frame 12) and vpn=11 (Frame 13):
    //   Last tryte of vpn=10 is 10*ps + B (offset +B)
    //   First tryte of vpn=11 is 11*ps - B = 10*ps + B + 1 (offset -B)!
    const boundaryEndV10 = 10 * ps + B;
    const scenarios = [
      {
        name: 'BCOPY_CROSS_PLUS_B_TO_MINUS_B',
        unmapVpn: 11,
        // Overlapping downward copy: src starts at boundaryEndV10 - 9 (10 trytes before +B -> -B boundary),
        // dst = src - 5, count = 40 -> crosses +B -> -B midway through!
        setupData: (m) => {
          for (let k = 0; k < 40; k++) {
            const va = boundaryEndV10 - 9 + k;
            const pa = va < boundaryEndV10 + 1 ? (12 * ps + (va - 10 * ps)) : (13 * ps + (va - 11 * ps));
            m.setMem(pa, 200 + k);
          }
        },
        src: `.mode T3\n ${liConst('R1', boundaryEndV10 - 14)} ${liConst('R2', boundaryEndV10 - 9)} LI R3, #40\n BCOPY R1, R2, R3\n HALT`,
        checkPas: Array.from({ length: 40 }, (_, k) => {
          const va = boundaryEndV10 - 14 + k;
          return va <= boundaryEndV10 ? (12 * ps + (va - 10 * ps)) : (13 * ps + (va - 11 * ps));
        })
      },
      {
        name: 'BFILL_CROSS_PLUS_B_TO_MINUS_B',
        unmapVpn: 11,
        setupData: () => {},
        src: `.mode T3\n ${liConst('R1', boundaryEndV10 - 11)} LI R2, #666\n LI R3, #40\n BFILL R1, R2, R3\n HALT`,
        checkPas: Array.from({ length: 40 }, (_, k) => {
          const va = boundaryEndV10 - 11 + k;
          return va <= boundaryEndV10 ? (12 * ps + (va - 10 * ps)) : (13 * ps + (va - 11 * ps));
        })
      },
      {
        name: 'LW_SW_STRADDLE_PLUS_B_TO_MINUS_B',
        unmapVpn: 11,
        setupData: (m) => {
          const [w0, w1, w2] = T.numberToWord(123456789);
          m.setMem(12 * ps + B, w0);
          m.setMem(13 * ps - B, w1);
          m.setMem(13 * ps - B + 1, w2);
        },
        src: `.mode T3\n ${liConst('R1', boundaryEndV10)} LW R0, R1, #0\n ADDI R0, R0, #99\n SW R0, R1, #0\n HALT`,
        checkPas: [12 * ps + B, 13 * ps - B, 13 * ps - B + 1]
      }
    ];

    let totalLockstepSteps = 0;
    for (const sc of scenarios) {
      const progBuilt = T.assemble(sc.src, { mode: 'T3' });

      function runPair(withFault) {
        const js = new T.TritonJS({ archMode: 'T3', pageSize: ps, mmuMode: 'balanced', ramSize, diskSectors: 2 });
        const wasm = T.TritonWASM.createSync({ archMode: 'T3', pageSize: ps, mmuMode: 'balanced', ramSize, diskSectors: 2 });
        for (const m of [js, wasm]) {
          m.vbr = 0;
          writePhysWord(T, m, 13 * 3, handlerVa);
          // Load code into Frame 3 and handler into Frame 4
          for (let i = 0; i < progBuilt.trytes.length; i++) m.setMem(3 * ps - B + i, progBuilt.trytes[i]);
          for (let i = 0; i < handlerProg.trytes.length; i++) m.setMem(4 * ps - B + i, handlerProg.trytes[i]);
          sc.setupData(m);
          // Build centred L0 & L1 tables
          writePhysWord(T, m, l0Base + 0 * 3 - 1, 2 * 512 + T.T5_PTE.V);
          writePhysWord(T, m, l1Base + 1 * 3 - 1, 3 * 512 + rwx); // code
          writePhysWord(T, m, l1Base + 2 * 3 - 1, 4 * 512 + rwx); // handler
          writePhysWord(T, m, l1Base + 3 * 3 - 1, 5 * 512 + rwx); // save area
          writePhysWord(T, m, l1Base + 6 * 3 - 1, 2 * 512 + rwx); // L1 table mapped at vpn=6
          writePhysWord(T, m, l1Base + 10 * 3 - 1, 12 * 512 + rwx); // page 10 -> Frame 12
          if (!withFault) {
            writePhysWord(T, m, l1Base + 11 * 3 - 1, 13 * 512 + rwx); // page 11 -> Frame 13
          }
          m.ptbr = l0Base;
          m.pc = codeVa;
          m.pgEn = 1;
          m.flushTlbAll();
        }
        let s = 0;
        while (!js.halted && s < 2000) {
          js.step();
          wasm.step();
          s++;
          totalLockstepSteps++;
          if (T.computeStateHash(js) !== T.computeStateHash(wasm)) {
            throw new Error(`[t5-12] JS/WASM lockstep mismatch in balanced-${ps} ${sc.name} (fault=${withFault}) at step ${s}`);
          }
        }
        if (!js.halted) throw new Error(`[t5-12] balanced-${ps} ${sc.name} (fault=${withFault}) did not halt`);
        const fCnt = T.wordToNumber(js.getMem(5 * ps - B + 20), js.getMem(5 * ps - B + 21), js.getMem(5 * ps - B + 22));
        if (withFault && fCnt !== 1) throw new Error(`[t5-12] Expected 1 fault in ${sc.name}, got ${fCnt}`);
        if (!withFault && fCnt !== 0) throw new Error(`[t5-12] Expected 0 faults in ref ${sc.name}, got ${fCnt}`);
        return {
          regs: Array.from({ length: 9 }, (_, r) => js.getWordNum(r)),
          memOut: sc.checkPas.map(pa => js.getMem(pa)),
          sf: js.sf, cf: js.cf, of: js.of
        };
      }

      const ref = runPair(false);
      const flt = runPair(true);
      if (JSON.stringify(ref) !== JSON.stringify(flt)) {
        throw new Error(`[t5-12] balanced-${ps} ${sc.name} restart mismatch:\n  ref=${JSON.stringify(ref)}\n  flt=${JSON.stringify(flt)}`);
      }
    }

    perSize[ps] = {
      scenarios: scenarios.map(s => s.name),
      lockstepSteps: totalLockstepSteps
    };
  }

  return {
    test: 12,
    name: 't5-12-balanced-restart',
    status: 'PASS',
    inputHash: sha256Str('balanced-restart:+B-to-minus-B:729,2187'),
    perSize,
    elapsedMs: Date.now() - t0
  };
}

if (require.main === module) {
  const { T } = loadHtmlModule('triton5.html');
  const res = runBalancedRestartTest(T);
  recordResult(res);
  console.log(`[PASS] t5-12-balanced-restart: BCOPY, BFILL, and LW/SW straddling (+B -> -B) page boundary restarted identically to no-fault ref (JS === WASM every step) across 729 & 2187 in ${res.elapsedMs} ms`);
}

module.exports = { runBalancedRestartTest };
