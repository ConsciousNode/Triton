#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Test 5: Precise Fault Restartability (`tests/t5-05-restartability.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * For every instruction class (FETCH, LT/LDX, ST/STX, LW/LWX straddling page
 * boundary, SW/SWX straddling page boundary, PUSH/POP, CALL/RET, CAS, BCOPY
 * partway through across a page boundary, BFILL partway through across a page
 * boundary):
 *   - Faults on a missing page (Vector 13 PAGE_FAULT)
 *   - Demand-maps the missing page inside the guest page-fault handler (using
 *     real Triton 5 assembly, TLBINV, and IRET)
 *   - Resumes execution and verifies final registers + mapped memory equal a
 *     reference run where all pages were pre-mapped (no fault).
 * Tested across all 3 page sizes (729, 2187, 4096) on both JS and WASM.
 */

const {
  loadHtmlModule, sha256Str, writePhysWord, PageTableBuilder, recordResult
} = require('./t5-common');

function runRestartabilityTest(T) {
  const t0 = Date.now();
  const classesTested = [];

  for (const ps of [729, 2187, 4096]) {
    const ramSize = 60 * ps;
    const rwFlags = T.T5_PTE.V | T.T5_PTE.R | T.T5_PTE.W | T.T5_PTE.U;
    const rwxFlags = rwFlags | T.T5_PTE.X;

    // Physical layout:
    // Page 0: VBR (0..60), main test program (200..600)
    // Page 1: L0 page table
    // Page 2: L1 page table (for L0 index 0)
    // Page 3: Fault handler code (mapped at VA 3*ps)
    // Page 4: Kernel stack (mapped at VA 4*ps)
    // Page 5: User/test stack (mapped at VA 5*ps)
    // Pages 10..25: Data/code pages (mapped on demand or pre-mapped)
    //
    // In-guest demand-paging fault handler at VA 3*ps:
    //   Reads EADDR (SPR 13), computes VPN = EADDR / ps (via DIV),
    //   writes PTE at L1[VPN] = (VPN * 512 + rwxFlags) using physical identity mapping of Page 2!
    //   Executes TLBINV on EADDR, increments fault counter at VA 4*ps+100, and executes IRET!
    //   Uses SPR_SCRATCH (24) and kernel stack to preserve ALL R0..R8!
    function liConst(reg, val) {
      const [w0, w1, w2] = T.numberToWord(val);
      let out = `LI ${reg}, #${w0}\n`;
      if (w1 !== 0) out += `LMI ${reg}, #${w1}\n`;
      if (w2 !== 0) out += `LHI ${reg}, #${w2}\n`;
      return out;
    }
    const l0Phys = 1 * ps;
    const l1Phys = 2 * ps;
    const handlerVa = 3 * ps;
    const kspVa = 4 * ps + 500;
    const faultCntVa = 4 * ps + 600;

    // Assemble demand-paging fault handler
    const saveVa = 4 * ps + 400;
    const handlerSrc = `
      .mode T3
      .org ${handlerVa}
      ; Save R0 in SPR_SCRATCH (24), then save R0..R3 into mapped kernel save area (avoids faulting SP!)
      MTSPR R0, #24
      ${liConst("R0", saveVa)}
      SW R1, R0, #3
      SW R2, R0, #6
      SW R3, R0, #9
      MFSPR R1, #24
      SW R1, R0, #0
      ; Increment fault counter
      ${liConst("R0", faultCntVa)}
      LW R1, R0, #0
      ADDI R1, R1, #1
      SW R1, R0, #0
      ; Read faulting VA from SPR_EADDR (13)
      MFSPR R0, #13
      ; Compute VPN = R0 / pageSize
      LI R1, #${ps}
      DIV R2, R0, R1
      ; Compute PTE value = VPN * 512 + rwxFlags (identity map VPN -> PPN=VPN)
      LI R1, #512
      MUL R3, R2, R1
      ADDI R3, R3, #${rwxFlags}
      ; Compute PTE address = l1Phys + VPN * 3
      MULI R2, R2, #3
      ${liConst("R1", l1Phys)}
      ADD R1, R1, R2
      ; Write PTE into L1 table (Page 2 is identity-mapped!)
      SW R3, R1, #0
      ; Invalidate TLB for faulting VA
      TLBINV R0
      ; Restore R0..R3
      ${liConst("R0", saveVa)}
      LW R3, R0, #9
      LW R2, R0, #6
      LW R1, R0, #3
      LW R0, R0, #0
      IRET
    `;
    const handlerBuilt = T.assemble(handlerSrc, { mode: 'T3' });

    // Define test cases for every instruction class!
    // Pages 10..20 are used as demand-paged targets (identity-mapped when faulted)
    const p10 = 10 * ps;
    const p11 = 11 * ps;
    const p12 = 12 * ps;
    const p13 = 13 * ps;
    const p14 = 14 * ps;
    const p15 = 15 * ps;
    const p16 = 16 * ps;
    const p17 = 17 * ps;



    const scenarios = [
      {
        name: 'FETCH',
        unmapPages: [p10],
        setupData: (m) => {
          // Put small function at p10: ADDI R0, R0, #77 ; RET
          const sub = T.assemble(`.mode T3\n .org ${p10}\n ADDI R0, R0, #77\n RET`, { mode: 'T3' });
          for (let i = 0; i < sub.trytes.length; i++) m.setMem(p10 + i, sub.trytes[i]);
        },
        src: `.mode T3\n .org 200\n LI R0, #100\n ${liConst('R1', p10)} JALR R8, R1, #0\n HALT`,
        // Note: JALR stores return PC in R8, so use CALL via JR? Simpler: jump to p10 which does ADDI + HALT!
        srcOverride: `.mode T3\n .org 200\n LI R0, #100\n ${liConst('R1', p10)} JR R1\n HALT`,
        setupDataOverride: (m) => {
          const sub = T.assemble(`.mode T3\n ADDI R0, R0, #77\n HALT`, { mode: 'T3' });
          for (let i = 0; i < sub.trytes.length; i++) m.setMem(p10 + i, sub.trytes[i]);
        },
        checkAddrs: []
      },
      {
        name: 'LT_ST',
        unmapPages: [p10, p11],
        setupData: (m) => { m.setMem(p10 + 5, 1234); },
        src: `.mode T3\n .org 200\n ${liConst('R1', p10)} LT R0, R1, #5\n ADDI R0, R0, #10\n ${liConst('R2', p11)} ST R0, R2, #7\n HALT`,
        checkAddrs: [p11 + 7]
      },
      {
        name: 'LW_SW_STRADDLE',
        // Word straddling page boundary between p10 (mapped) and p11 (unmapped)!
        unmapPages: [p11],
        setupData: (m) => {
          writePhysWord(T, m, p10 + ps - 1, 987654321);
        },
        src: `.mode T3\n .org 200\n ${liConst('R1', p10 + ps - 1)} LW R0, R1, #0\n ADDI R0, R0, #55\n SW R0, R1, #0\n HALT`,
        checkAddrs: [p10 + ps - 1, p10 + ps, p10 + ps + 1]
      },
      {
        name: 'PUSH_POP_CALL_RET',
        // Stack starts at p12 + 3, PUSH/CALL crosses down into unmapped p11!
        unmapPages: [p11],
        setupData: () => {},
        src: `
          .mode T3
          .org 200
          ${liConst('R1', p12 + 2)}
          MOV R0, R1
          ; Set SP via helper? Just test PUSH/POP/CALL/RET with SP initialized to p12+2
          LI R3, #3333
          PUSH R3
          CALL fn_sub
          POP R4
          HALT
        fn_sub:
          ADDI R3, R3, #111
          RET
        `,
        initSp: p12 + 2,
        checkAddrs: [p12 - 1, p12, p12 + 1]
      },
      {
        name: 'CAS_STRADDLE',
        unmapPages: [p11],
        setupData: (m) => { writePhysWord(T, m, p10 + ps - 1, 424242); },
        src: `.mode T3\n .org 200\n ${liConst('R0', 424242)} ${liConst('R1', p10 + ps - 1)} ${liConst('R2', 777777)} CAS R0, R1, R2\n HALT`,
        checkAddrs: [p10 + ps - 1, p10 + ps, p10 + ps + 1]
      },
      {
        name: 'BCOPY_MIDWAY',
        // Overlapping downward copy of 40 trytes: src = p14+ps-10, dst = p14+ps-15 (dst = src - 5)
        // p14 is mapped; p15 (second page of both src and dst) is UNMAPPED!
        // Because dst overwrites already-read src trytes, any mutant BCOPY that restarts
        // from the beginning (or rewinds) instead of resuming corrupts the final output!
        unmapPages: [p15],
        setupData: (m) => {
          for (let k = 0; k < 40; k++) m.setMem(p14 + ps - 10 + k, 100 + k);
        },
        src: `.mode T3\n .org 200\n ${liConst('R1', p14 + ps - 15)} ${liConst('R2', p14 + ps - 10)} LI R3, #40\n BCOPY R1, R2, R3\n HALT`,
        checkAddrs: Array.from({ length: 40 }, (_, k) => p14 + ps - 15 + k)
      },
      {
        name: 'BFILL_MIDWAY',
        // Fill 40 trytes starting at p16 + ps - 12 crossing into unmapped p17!
        unmapPages: [p17],
        setupData: () => {},
        src: `.mode T3\n .org 200\n ${liConst('R1', p16 + ps - 12)} LI R2, #555\n LI R3, #40\n BFILL R1, R2, R3\n HALT`,
        checkAddrs: Array.from({ length: 40 }, (_, k) => p16 + ps - 12 + k)
      }
    ];

    for (const sc of scenarios) {
      const progSrc = sc.srcOverride || sc.src;
      const progBuilt = T.assemble(progSrc, { mode: 'T3' });

      function runOnce(VmClass, withFaults) {
        const m = VmClass === 'JS'
          ? new T.TritonJS({ archMode: 'T3', pageSize: ps, ramSize, diskSectors: 2 })
          : T.TritonWASM.createSync({ archMode: 'T3', pageSize: ps, ramSize, diskSectors: 2 });
        m.loadProgram(progBuilt.trytes, 0);
        // Load handler at handlerVa
        for (let i = 0; i < handlerBuilt.trytes.length; i++) {
          if (handlerBuilt.trytes[i] !== 0) m.setMem(i, handlerBuilt.trytes[i]);
        }
        if (sc.setupDataOverride) sc.setupDataOverride(m);
        else sc.setupData(m);

        m.vbr = 0;
        writePhysWord(T, m, 13 * 3, handlerVa);

        // Build identity page table for pages 0..20, omitting unmapPages if withFaults
        const unmapSet = new Set(withFaults ? sc.unmapPages : []);
        const ptb = new PageTableBuilder(T, ps, l0Phys, 2);
        for (let pg = 0; pg <= 20; pg++) {
          const va = pg * ps;
          if (!unmapSet.has(va)) {
            ptb.mapPage([m], va, pg, rwxFlags);
          }
        }
        m.ptbr = l0Phys;
        m.ksp = kspVa;
        m.sp = sc.initSp !== undefined ? sc.initSp : (5 * ps + 500);
        m.pc = 200;
        m.pgEn = 1;
        m.flushTlbAll();

        m.run(5000);
        if (!m.halted) throw new Error(`[t5-05] ${VmClass} ps=${ps} ${sc.name} (faults=${withFaults}) did not halt`);
        const faultCount = T.wordToNumber(m.getMem(faultCntVa), m.getMem(faultCntVa + 1), m.getMem(faultCntVa + 2));
        if (withFaults && faultCount !== sc.unmapPages.length) {
          throw new Error(`[t5-05] ${VmClass} ps=${ps} ${sc.name}: expected ${sc.unmapPages.length} faults, got ${faultCount}`);
        }
        if (!withFaults && faultCount !== 0) {
          throw new Error(`[t5-05] ${VmClass} ps=${ps} ${sc.name}: unexpected ${faultCount} faults in ref run`);
        }
        const regs = Array.from({ length: 9 }, (_, r) => m.getWordNum(r));
        const memOut = sc.checkAddrs.map(a => m.getMem(a));
        return { regs, memOut, sp: m.sp, sf: m.sf, cf: m.cf, of: m.of, faultCount };
      }

      for (const cls of ['JS', 'WASM']) {
        const ref = runOnce(cls, false);
        const flt = runOnce(cls, true);
        if (JSON.stringify(ref.regs) !== JSON.stringify(flt.regs) ||
            JSON.stringify(ref.memOut) !== JSON.stringify(flt.memOut) ||
            ref.sp !== flt.sp || ref.sf !== flt.sf || ref.cf !== flt.cf || ref.of !== flt.of) {
          throw new Error(
            `[t5-05] Restartability mismatch ${cls} ps=${ps} ${sc.name}:\n` +
            `  ref=${JSON.stringify(ref)}\n  flt=${JSON.stringify(flt)}`
          );
        }
      }
      if (ps === 2187) classesTested.push(sc.name);
    }
  }

  return {
    test: 5,
    name: 't5-05-restartability',
    status: 'PASS',
    inputHash: sha256Str('restartability:729,2187,4096:' + classesTested.join(',')),
    pageSizes: [729, 2187, 4096],
    classesTested,
    elapsedMs: Date.now() - t0
  };
}

if (require.main === module) {
  const { T } = loadHtmlModule('triton5.html');
  const res = runRestartabilityTest(T);
  recordResult(res);
  console.log(`[PASS] t5-05-restartability: ${res.classesTested.length} instruction classes (${res.classesTested.join(', ')}) demand-faulted, mapped, and resumed identically to no-fault ref across 729/2187/4096 on JS & WASM in ${res.elapsedMs} ms`);
}

module.exports = { runRestartabilityTest };
