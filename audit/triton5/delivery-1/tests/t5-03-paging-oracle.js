#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Test 3: Independent Paging Oracle (`tests/t5-03-paging-oracle.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Pure, independent model of the 2-level page tables, address splitting
 * (729 = 3^6, 2187 = 3^7, 4096 = 2^12), permission checks (V, R, W, X, U),
 * and hardware A/D bit updates, written separately from `triton5.html`.
 * Verifies 100,000 seeded accesses per page size (300,000 total) against both
 * `TritonJS` and `TritonWASM`.
 */

const {
  loadHtmlModule, makeRng, sha256Str, writePhysWord, readPhysWord, recordResult
} = require('./t5-common');

// ============================================================================
// PURE INDEPENDENT PAGING ORACLE (Zero shared translation code with triton5.html)
// ============================================================================
function oracleSplit(va, pageSize) {
  if (va < 0) return null;
  if (pageSize === 729) {
    if (va >= 43046721) return null;
    const off = va % 729;
    const vpn = Math.floor(va / 729);
    const idx1 = vpn % 243;
    const idx0 = Math.floor(vpn / 243);
    return { off, idx0, idx1, vpn };
  }
  if (pageSize === 2187) {
    if (va >= 1162261467) return null;
    const off = va % 2187;
    const vpn = Math.floor(va / 2187);
    const idx1 = vpn % 729;
    const idx0 = Math.floor(vpn / 729);
    return { off, idx0, idx1, vpn };
  }
  if (pageSize === 4096) {
    if (va >= 4294967296) return null;
    const off = va % 4096;
    const vpn = Math.floor(va / 4096);
    const idx1 = vpn % 1024;
    const idx0 = Math.floor(vpn / 1024);
    return { off, idx0, idx1, vpn };
  }
  throw new Error('Unknown page size');
}

function oracleTranslate(ramReadWord, ramWriteWord, ptbr, pageSize, priv, va, accessType) {
  const sp = oracleSplit(va, pageSize);
  const mkCause = (isPerm, isL1) => (accessType & 3) | (priv ? 4 : 0) | (isPerm ? 8 : 0) | (isL1 ? 16 : 0);
  if (!sp) return { fault: true, pfCause: mkCause(false, false), eaddr: va };
  const pde = ramReadWord(ptbr + sp.idx0 * 3);
  if (pde === null || pde < 0 || (pde & 1) === 0) {
    return { fault: true, pfCause: mkCause(false, false), eaddr: va };
  }
  const l1Base = Math.floor(pde / 512) * pageSize;
  const pteAddr = l1Base + sp.idx1 * 3;
  const pte = ramReadWord(pteAddr);
  if (pte === null || pte < 0 || (pte & 1) === 0) {
    return { fault: true, pfCause: mkCause(false, true), eaddr: va };
  }
  let flags = pte % 512;
  const ppn = Math.floor(pte / 512);
  if (priv === 1 && (flags & 16) === 0) {
    return { fault: true, pfCause: mkCause(true, true), eaddr: va };
  }
  const needBit = accessType === 0 ? 2 : (accessType === 1 ? 4 : 8);
  if ((flags & needBit) === 0) {
    return { fault: true, pfCause: mkCause(true, true), eaddr: va };
  }
  const newFlags = flags | 32 | (accessType === 1 ? 64 : 0);
  if (newFlags !== flags) {
    ramWriteWord(pteAddr, ppn * 512 + newFlags);
  }
  return { fault: false, pa: ppn * pageSize + sp.off, pteAddr, flags: newFlags };
}

function runPagingOracleTest(T, accessesPerPageSize = 100000, seed = 0x51A7C0DE) {
  const t0 = Date.now();
  const rng = makeRng(seed);
  const perPageSize = {};

  for (const ps of [729, 2187, 4096]) {
    // Allocate compact RAM: 400 pages (plenty for L0, L1s, code, trap handler, data frames)
    const numPages = 220;
    const ramSize = numPages * ps;
    const js = new T.TritonJS({ archMode: 'T3', pageSize: ps, ramSize, diskSectors: 4 });
    const wasm = T.TritonWASM.createSync({ archMode: 'T3', pageSize: ps, ramSize, diskSectors: 4 });

    // Physical layout:
    // Page 0: VBR (offset 0..60) + small harness code (offset 100..400)
    // Page 1: L0 table
    // Pages 2..5: L1 tables (for L0 indices 0..3)
    // Pages 10..150: data/code frames
    const vbrPhys = 0;
    const l0Phys = 1 * ps;
    const harnessVa = 100;
    const pfHandlerVa = 300;
    const testProg = T.assemble(`
      .mode T3
      .org 100
      ; Harness entry points:
      ; 100: LT R1, R0, #0 ; HALT   (READ test)
      LT R1, R0, #0
      HALT
      ; 104: ST R2, R0, #0 ; HALT   (WRITE test)
      ST R2, R0, #0
      HALT
      ; 108: JR R0                  (EXEC test: jumps to target VA which contains HALT/NOP)
      JR R0
      HALT
      .org 300
      ; Page Fault handler: HALT immediately so host inspects EADDR/PF_CAUSE/ECAUSE
      HALT
    `, { mode: 'T3' });

    for (const m of [js, wasm]) {
      m.loadProgram(testProg.trytes, 0);
      m.vbr = vbrPhys;
      writePhysWord(T, m, vbrPhys + 13 * 3, pfHandlerVa);
      writePhysWord(T, m, vbrPhys + 4 * 3, pfHandlerVa);
      // Map Page 0 identity (Supervisor + User R|W|X|U|V|A|D|G so harness executes in both modes)
      const pde0 = 2 * 512 + 1;
      writePhysWord(T, m, l0Phys + 0 * 3, pde0);
      const pte0 = 0 * 512 + (1 | 2 | 4 | 8 | 16 | 32 | 64 | 128);
      writePhysWord(T, m, 2 * ps + 0 * 3, pte0);
    }

    // Build 120 virtual pages (VPN 1..120) with diverse permissions (some unmapped, some RO, some RX, some Sup-only, some User RWX, some A=0/D=0)
    const entriesPerTable = ps === 729 ? 243 : (ps === 2187 ? 729 : 1024);
    const l1Map = new Map([[0, 2]]);
    let nextL1 = 3;
    const pteAddrs = [];

    // Also fill target frames 10..130 with HALT (-1 * 81 = -81, 0) at offset 0 and deterministic data elsewhere
    for (let f = 10; f < 130; f++) {
      const base = f * ps;
      for (const m of [js, wasm]) {
        m.setMem(base, -81); // HALT opcode tryte0 = -1*81 = -81
        m.setMem(base + 1, 0);
        m.setMem(base + 10, (f * 37) % 9000);
        m.setMem(base + 20, (f * 53) % 9000);
      }
    }

    // Setup 110 mapped + unmapped pages in VPN 1..120
    for (let vpn = 1; vpn <= 120; vpn++) {
      const idx0 = Math.floor(vpn / entriesPerTable);
      const idx1 = vpn % entriesPerTable;
      if (!l1Map.has(idx0)) {
        l1Map.set(idx0, nextL1++);
        const pdeVal = l1Map.get(idx0) * 512 + 1;
        for (const m of [js, wasm]) writePhysWord(T, m, l0Phys + idx0 * 3, pdeVal);
      }
      const l1Ppn = l1Map.get(idx0);
      const pteAddr = l1Ppn * ps + idx1 * 3;
      const kind = vpn % 10;
      let pteVal = 0;
      if (kind !== 0) { // kind 0 stays invalid (V=0)
        const ppn = 10 + (vpn % 110);
        let flags = 1; // V
        if (kind === 1) flags |= 2;                   // Sup R only
        else if (kind === 2) flags |= 2 | 4;          // Sup RW
        else if (kind === 3) flags |= 2 | 8;          // Sup RX
        else if (kind === 4) flags |= 2 | 4 | 8;      // Sup RWX
        else if (kind === 5) flags |= 2 | 16;         // User R only
        else if (kind === 6) flags |= 2 | 4 | 16;     // User RW
        else if (kind === 7) flags |= 2 | 8 | 16;     // User RX
        else if (kind === 8) flags |= 2 | 4 | 8 | 16; // User RWX
        else if (kind === 9) flags |= 4 | 16;         // User W only (no R)
        pteVal = ppn * 512 + flags;
      }
      for (const m of [js, wasm]) writePhysWord(T, m, pteAddr, pteVal);
      pteAddrs.push({ vpn, pteAddr });
    }

    // Mirror physical RAM for the independent oracle
    const oracleMem = new Int16Array(js.mem);
    const oReadWord = (pa) => {
      if (pa < 0 || pa + 2 >= ramSize) return null;
      return T.wordToNumber(oracleMem[pa], oracleMem[pa + 1], oracleMem[pa + 2]);
    };
    const oWriteWord = (pa, val) => {
      const [w0, w1, w2] = T.numberToWord(val);
      oracleMem[pa] = w0; oracleMem[pa + 1] = w1; oracleMem[pa + 2] = w2;
    };

    for (const m of [js, wasm]) {
      m.ptbr = l0Phys;
      m.pgEn = 1;
      m.flushTlbAll();
    }

    let faults = 0, okReads = 0, okWrites = 0, okExecs = 0;
    let wasmChecked = 0;

    for (let i = 0; i < accessesPerPageSize; i++) {
      // Periodically clear A/D bits on a random PTE & flush TLB to test fresh A/D transitions!
      if ((i & 1023) === 511) {
        const pick = pteAddrs[rng.u32() % pteAddrs.length];
        const cur = oReadWord(pick.pteAddr);
        if (cur & 1) {
          const cleared = Math.floor(cur / 512) * 512 + ((cur % 512) & ~(32 | 64));
          oWriteWord(pick.pteAddr, cleared);
          writePhysWord(T, js, pick.pteAddr, cleared);
          writePhysWord(T, wasm, pick.pteAddr, cleared);
          js.flushTlbVa(pick.vpn * ps);
          wasm.flushTlbVa(pick.vpn * ps);
        }
      }

      const priv = rng.u32() & 1;
      const accessType = rng.u32() % 3; // 0=READ, 1=WRITE, 2=EXEC
      // Pick VA: 90% in VPN 1..120, 5% unmapped L0, 5% negative/OOB
      const rKind = rng.u32() % 20;
      let va;
      if (rKind === 0) {
        va = -(rng.int(1, 5000)); // negative VA -> OOB fault
      } else if (rKind === 1) {
        va = (entriesPerTable * 5) * ps + 10; // unmapped L0 PDE
      } else {
        const vpn = rng.int(1, 120);
        const off = accessType === 2 ? 0 : (rng.u32() & 1 ? 10 : 20);
        va = vpn * ps + off;
      }

      const expected = oracleTranslate(oReadWord, oWriteWord, l0Phys, ps, priv, va, accessType);

      // Execute single access on TritonJS directly via step()
      js.halted = 0;
      js.faulted = false;
      js.priv = priv;
      js.ecause = 0;
      js.eaddr = 0;
      js.pfCause = 0;
      js.setWordNum(0, va);
      if (accessType === 0) {
        js.pc = 100; // LT R1, R0, #0
        js.step();
      } else if (accessType === 1) {
        js.setWordNum(2, (i % 7000) - 3500);
        js.pc = 104; // ST R2, R0, #0
        js.step();
      } else {
        js.pc = va; // Direct fetch/EXEC at va!
        js.step();
      }

      if (expected.fault) {
        faults++;
        if (js.ecause !== 13 || js.eaddr !== expected.eaddr || js.pfCause !== expected.pfCause) {
          throw new Error(
            `[t5-03] JS fault mismatch ps=${ps} i=${i} priv=${priv} acc=${accessType} va=${va}: ` +
            `expected (vec=13, eaddr=${expected.eaddr}, pf=${expected.pfCause}), ` +
            `got (vec=${js.ecause}, eaddr=${js.eaddr}, pf=${js.pfCause})`
          );
        }
      } else {
        if (js.ecause === 13) {
          throw new Error(`[t5-03] JS unexpected PAGE_FAULT ps=${ps} i=${i} priv=${priv} acc=${accessType} va=${va} pf=${js.pfCause}`);
        }
        // Check PTE A/D bits in RAM match oracle!
        const actualPte = readPhysWord(T, js, expected.pteAddr);
        const expectedPte = oReadWord(expected.pteAddr);
        if (actualPte !== expectedPte) {
          throw new Error(`[t5-03] JS PTE A/D mismatch ps=${ps} i=${i} va=${va}: expected 0x${expectedPte.toString(16)}, got 0x${actualPte.toString(16)}`);
        }
        if (accessType === 0) {
          okReads++;
          if (js.getWordNum(1) !== js.getMem(expected.pa)) {
            throw new Error(`[t5-03] JS READ value mismatch at pa=${expected.pa}`);
          }
        } else if (accessType === 1) {
          okWrites++;
          const want = (i % 7000) - 3500;
          if (js.getMem(expected.pa) !== want) {
            throw new Error(`[t5-03] JS WRITE value mismatch at pa=${expected.pa}`);
          }
          oracleMem[expected.pa] = want;
        } else {
          okExecs++;
        }
      }

      // Mirror every access on WASM too (check all 100,000!)
      wasm.halted = 0;
      wasm.priv = priv;
      wasm.ecause = 0;
      wasm.eaddr = 0;
      wasm.pfCause = 0;
      wasm.setWordNum(0, va);
      if (accessType === 0) {
        wasm.pc = 100;
        wasm.step();
      } else if (accessType === 1) {
        wasm.setWordNum(2, (i % 7000) - 3500);
        wasm.pc = 104;
        wasm.step();
      } else {
        wasm.pc = va;
        wasm.step();
      }
      wasmChecked++;

      if (expected.fault) {
        if (wasm.ecause !== 13 || wasm.eaddr !== expected.eaddr || wasm.pfCause !== expected.pfCause) {
          throw new Error(
            `[t5-03] WASM fault mismatch ps=${ps} i=${i} priv=${priv} acc=${accessType} va=${va}: ` +
            `expected (vec=13, eaddr=${expected.eaddr}, pf=${expected.pfCause}), ` +
            `got (vec=${wasm.ecause}, eaddr=${wasm.eaddr}, pf=${wasm.pfCause})`
          );
        }
      } else {
        if (wasm.ecause === 13) {
          throw new Error(`[t5-03] WASM unexpected PAGE_FAULT ps=${ps} i=${i} va=${va}`);
        }
        const actualWasmPte = readPhysWord(T, wasm, expected.pteAddr);
        const expectedPte = oReadWord(expected.pteAddr);
        if (actualWasmPte !== expectedPte) {
          throw new Error(`[t5-03] WASM PTE A/D mismatch ps=${ps} i=${i} va=${va}: expected ${expectedPte}, got ${actualWasmPte}`);
        }
        if (accessType === 0 && wasm.getWordNum(1) !== js.getWordNum(1)) {
          throw new Error(`[t5-03] WASM/JS READ value mismatch ps=${ps} i=${i}`);
        }
      }
    }

    perPageSize[ps] = {
      accesses: accessesPerPageSize,
      wasmChecked,
      faults,
      okReads,
      okWrites,
      okExecs,
      jsTlbHits: js.mmuHits,
      wasmTlbHits: wasm.mmuHits,
      jsWalks: js.mmuWalks,
      wasmWalks: wasm.mmuWalks
    };
  }

  return {
    test: 3,
    name: 't5-03-paging-oracle',
    status: 'PASS',
    seed,
    inputHash: sha256Str(`paging-oracle:${seed}:${accessesPerPageSize}`),
    totalAccesses: accessesPerPageSize * 3,
    perPageSize,
    elapsedMs: Date.now() - t0
  };
}

if (require.main === module) {
  const { T } = loadHtmlModule('triton5.html');
  const res = runPagingOracleTest(T, 100000);
  recordResult(res);
  console.log(`[PASS] t5-03-paging-oracle: ${res.totalAccesses.toLocaleString()} seeded accesses (100,000/pageSize x 3) matched independent oracle on JS & WASM in ${res.elapsedMs} ms`);
}

module.exports = { runPagingOracleTest, oracleTranslate, oracleSplit };
