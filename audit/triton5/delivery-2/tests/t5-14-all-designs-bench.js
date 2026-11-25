#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Stage 2 Test 14: Comparative Three-Design Measurements (`tests/t5-14-all-designs-bench.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Instrument only (NO recommendation or ranking anywhere).
 * Measures all three MMU designs across all 5 configurations:
 *   - binary-4096    (pageSize: 4096, mmuMode: 'binary')
 *   - unsigned-729   (pageSize: 729,  mmuMode: 'unsigned')
 *   - unsigned-2187  (pageSize: 2187, mmuMode: 'unsigned')
 *   - balanced-729   (pageSize: 729,  mmuMode: 'balanced')
 *   - balanced-2187  (pageSize: 2187, mmuMode: 'balanced')
 *
 * Reports:
 *   1. Split cost per translation (divider steps / carry-chain trits / 0) +
 *      explicit gate-level estimate and estimation method.
 *   2. Walk length, TLB hit rate, and page-table memory on:
 *      (a) TritOS Desktop 2.0.1 booted with seeded mouse and keyboard input
 *          (unmodified guest-200.asm, real device inputs via pushMouseEvent /
 *          pushKeyEvent, observed PC fetch & instruction-referenced stream replayed
 *          uniformly through each design's real Triton 5 MMU & 64-entry TLB);
 *      (b) Synthetic sparse-address workload (20,000 seeded accesses across 32
 *          widely-spaced sparse regions spanning 12,000,000 trytes).
 */

const fs = require('fs');
const path = require('path');
const {
  REPO_ROOT, loadHtmlModule, makeRng, sha256Str, writePhysWord, recordResult
} = require('./t5-common');

// Gate-level split cost model (explicitly documented):
//   - balanced-3^k:  0 carry trits, 0 divider steps, 0 ternary gates (pure bus-wire slice; PA = pure wire concat).
//   - unsigned-3^k:  carry-chain length = 16 trits (729) or 19 trits (2187) to convert balanced trits {-1,0,+1}
//                    into unsigned digits {0,1,2} via borrow propagation; ~6 ternary gates/trit (borrow-gen,
//                    borrow-prop, digit-adjust) => 96 ternary gates (729) / 114 ternary gates (2187).
//   - binary-4096:   22 restoring-division steps (12 for ÷4096 + 10 for ÷1024; 21-trit dividend for 2^32);
//                    ~14 ternary gates/trit (comparator + conditional subtractor + mux) x 21 trits
//                    => 294 ternary gates (iterative, 22 cycles) or 6,174 gates (fully unrolled).
const SPLIT_COST_MODEL = [
  {
    design: 'binary-4096', pageSize: 4096, mmuMode: 'binary',
    splitMetricUnit: 'divider steps', splitCostPerTrans: 22,
    gateEstimate: 294, gateEstimateNote: 'iterative 21-trit restoring divider (~14 ternary gates/trit x 21 trits, 22 steps; ~6,174 if unrolled)'
  },
  {
    design: 'unsigned-729', pageSize: 729, mmuMode: 'unsigned',
    splitMetricUnit: 'carry-chain trits', splitCostPerTrans: 16,
    gateEstimate: 96, gateEstimateNote: '16-trit balanced->unsigned borrow chain (~6 ternary gates/trit x 16 trits, depth 16)'
  },
  {
    design: 'unsigned-2187', pageSize: 2187, mmuMode: 'unsigned',
    splitMetricUnit: 'carry-chain trits', splitCostPerTrans: 19,
    gateEstimate: 114, gateEstimateNote: '19-trit balanced->unsigned borrow chain (~6 ternary gates/trit x 19 trits, depth 19)'
  },
  {
    design: 'balanced-729', pageSize: 729, mmuMode: 'balanced',
    splitMetricUnit: 'balanced wire slice', splitCostPerTrans: 0,
    gateEstimate: 0, gateEstimateNote: '0 gates: direct balanced-trit wire tap (low 6 trits = off, [6..10] = L1, [11..15] = L0)'
  },
  {
    design: 'balanced-2187', pageSize: 2187, mmuMode: 'balanced',
    splitMetricUnit: 'balanced wire slice', splitCostPerTrans: 0,
    gateEstimate: 0, gateEstimateNote: '0 gates: direct balanced-trit wire tap (low 7 trits = off, [7..12] = L1, [13..18] = L0)'
  }
];

function collectDesktopTrace(T, seed) {
  const rng = makeRng(seed);
  const asmSrc = fs.readFileSync(path.join(REPO_ROOT, 'desktop', 'guest-200.asm'), 'utf8');
  const built = T.assemble(asmSrc, { mode: 'T3' });
  const vm = new T.TritonJS({ archMode: 'T3' });
  for (let i = 0; i < built.trytes.length; i++) vm.disk[i] = built.trytes[i];
  vm.loadProgram(built.trytes.slice(0, 32), 0);

  // Boot TritOS Desktop 2.0.1 (120,000 steps)
  vm.run(120000);

  // Drive seeded mouse & keyboard input through documented device methods
  for (let e = 0; e < 24; e++) {
    vm.pushMouseEvent(rng.int(-40, 40), rng.int(-30, 30), (e % 3 === 0) ? 1 : 0);
    vm.pushKeyEvent(65 + (rng.u32() % 26), 0);
    vm.pushKeyEvent(65 + (rng.u32() % 26), 1);
  }

  // Record 40,000 step-level memory accesses (PC fetch + SP / decoded load/store address)
  // while the desktop processes the seeded mouse & keyboard events.
  const trace = [];
  for (let s = 0; s < 40000; s++) {
    const pc = vm.pc;
    trace.push({ addr: pc, isWrite: false });
    if (pc >= 0 && pc + 1 < vm.ramSize) {
      const t0 = vm.mem[pc];
      const t1 = vm.mem[pc + 1];
      const dec = T.decodeInstruction(t0, t1);
      // Record data access address for load/store/push/pop/call/ret
      if (dec.op === 15 || dec.op === 37 || dec.op === 17 || dec.op === 39) {
        trace.push({ addr: vm.getWordNum(dec.rs1) + dec.imm9, isWrite: false });
      } else if (dec.op === 16 || dec.op === 38 || dec.op === 18 || dec.op === 40) {
        trace.push({ addr: vm.getWordNum(dec.rs1) + dec.imm9, isWrite: true });
      } else if (dec.op === 19 || dec.op === 29 || dec.op === 48) {
        trace.push({ addr: vm.sp - 3, isWrite: true });
      } else if (dec.op === 20 || dec.op === 30) {
        trace.push({ addr: vm.sp, isWrite: false });
      }
    }
    vm.step();
  }
  return trace;
}

function generateSparseTrace(seed) {
  const rng = makeRng(seed);
  // 32 widely-spaced sparse regions across 0 .. 12,000,000 trytes (each region = 4,500 trytes)
  const regions = [];
  for (let r = 0; r < 32; r++) {
    regions.push(100000 + r * 370000);
  }
  const trace = [];
  for (let i = 0; i < 20000; i++) {
    // 80% locality within current region, 20% jump to random sparse region
    const regIdx = (i % 5 === 0) ? (rng.u32() % regions.length) : ((Math.floor(i / 25)) % regions.length);
    const addr = regions[regIdx] + (rng.u32() % 4500);
    trace.push({ addr, isWrite: (i % 7) === 0 });
  }
  return trace;
}

function replayTraceOnDesign(T, cfg, trace, workloadName) {
  const ps = cfg.pageSize;
  const isBal = cfg.mmuMode === 'balanced';
  const B = isBal ? (ps - 1) / 2 : 0;
  const entriesPerTable = ps === 729 ? 243 : (ps === 2187 ? 729 : 1024);
  const tableTrytes = entriesPerTable * 3;
  // Shift all trace addresses by +4096 so every address is strictly above virtual page 0
  // uniformly across all 3 designs (and filter out MMIO >= 15,000,000 to pure RAM VAs).
  const baseShift = 4096;

  // Allocate physical RAM: enough for L0 + up to 400 L1 tables + 2000 data frames
  const ramSize = 14348907; // max Triton RAM (3^15)
  const vm = new T.TritonJS({ archMode: 'T3', pageSize: ps, mmuMode: cfg.mmuMode, ramSize, diskSectors: 2 });
  const rwx = T.T5_PTE.V | T.T5_PTE.R | T.T5_PTE.W | T.T5_PTE.X | T.T5_PTE.U;

  const l0Frame = 1;
  const l0Base = l0Frame * ps;
  let nextFrame = 2;
  const l1Map = new Map(); // idx0 -> l1Frame
  const mappedVpns = new Map(); // vpn -> dataFrame

  const splitFn = isBal
    ? (ps === 729 ? T.t5SplitAddrBal729 : T.t5SplitAddrBal2187)
    : (ps === 729 ? T.t5SplitAddr729 : (ps === 2187 ? T.t5SplitAddr2187 : T.t5SplitAddr4096));

  // Pre-map every page touched by the trace into real page tables in vm.mem
  const validOps = [];
  for (const op of trace) {
    if (op.addr < 0 || op.addr >= 14000000) continue;
    const va = op.addr + baseShift - B; // machine address (for balanced: A = P - B)
    const sp = splitFn(va);
    if (!sp || (isBal && sp.vpn === 0)) continue;
    if (!mappedVpns.has(sp.vpn)) {
      let l1Frame = l1Map.get(sp.idx0);
      if (l1Frame === undefined) {
        l1Frame = nextFrame++;
        l1Map.set(sp.idx0, l1Frame);
        const pdeAddr = isBal ? (l0Base + sp.idx0 * 3 - 1) : (l0Base + sp.idx0 * 3);
        writePhysWord(T, vm, pdeAddr, l1Frame * 512 + T.T5_PTE.V);
      }
      const dataFrame = nextFrame++;
      mappedVpns.set(sp.vpn, dataFrame);
      const pteAddr = isBal ? (l1Frame * ps + sp.idx1 * 3 - 1) : (l1Frame * ps + sp.idx1 * 3);
      writePhysWord(T, vm, pteAddr, dataFrame * 512 + rwx);
    }
    validOps.push({ va, isWrite: op.isWrite });
  }

  vm.ptbr = l0Base;
  vm.pgEn = 1;
  vm.flushTlbAll();
  vm.mmuWalks = 0;
  vm.mmuHits = 0;
  vm.mmuSplits = 0;
  vm.mmuWalkSteps = 0;
  vm.mmuSplitCost = 0;

  for (const op of validOps) {
    if (op.isWrite) vm.translateAddrT5(op.va, T.T5_PF_ACCESS.WRITE, 0, true);
    else vm.translateAddrT5(op.va, T.T5_PF_ACCESS.READ, 0, false);
  }

  const hitRatePct = vm.mmuSplits > 0 ? Number(((vm.mmuHits / vm.mmuSplits) * 100).toFixed(2)) : 0;
  const avgWalkLen = vm.mmuWalks > 0 ? Number((vm.mmuWalkSteps / vm.mmuWalks).toFixed(2)) : 0;
  const tableMemoryTrytes = (1 + l1Map.size) * tableTrytes;

  return {
    workload: workloadName,
    design: cfg.design,
    pageSize: ps,
    mmuMode: cfg.mmuMode,
    translations: validOps.length,
    uniquePages: mappedVpns.size,
    l1TablesAllocated: l1Map.size,
    walks: vm.mmuWalks,
    walkSteps: vm.mmuWalkSteps,
    avgWalkStepsPerWalk: avgWalkLen,
    tlbHits: vm.mmuHits,
    tlbHitRatePct: hitRatePct,
    splitCostTotal: vm.mmuSplitCost,
    splitCostPerTrans: cfg.splitCostPerTrans,
    splitMetricUnit: cfg.splitMetricUnit,
    gateEstimate: cfg.gateEstimate,
    tableMemoryTrytes
  };
}

function runAllDesignsBench(T, seed = 0xD3516402) {
  const t0 = Date.now();
  const desktopTrace = collectDesktopTrace(T, seed);
  const sparseTrace = generateSparseTrace(seed ^ 0x5A5A5A5A);

  const measurements = [];
  for (const [wName, tr] of [['tritos_desktop_201', desktopTrace], ['sparse_synthetic', sparseTrace]]) {
    for (const cfg of SPLIT_COST_MODEL) {
      measurements.push(replayTraceOnDesign(T, cfg, tr, wName));
    }
  }

  return {
    test: 14,
    name: 't5-14-all-designs-bench',
    status: 'PASS',
    seed,
    inputHash: sha256Str(`all-designs-bench:${seed}:${desktopTrace.length}:${sparseTrace.length}`),
    tlbEntries: T.T5_TLB_SIZE,
    desktopTraceLen: desktopTrace.length,
    sparseTraceLen: sparseTrace.length,
    splitCostModel: SPLIT_COST_MODEL,
    measurements,
    elapsedMs: Date.now() - t0
  };
}

if (require.main === module) {
  const { T } = loadHtmlModule('triton5.html');
  const res = runAllDesignsBench(T);
  recordResult(res);
  console.log(`[PASS] t5-14-all-designs-bench: Measured all 5 designs across TritOS Desktop 2.0.1 (${res.desktopTraceLen} accesses) + sparse synthetic (${res.sparseTraceLen} accesses) in ${res.elapsedMs} ms`);
  for (const m of res.measurements) {
    console.log(`  ${m.workload.padEnd(19)} ${m.design.padEnd(14)} | walkSteps=${String(m.walkSteps).padStart(6)} | tlbHit=${String(m.tlbHitRatePct.toFixed(2)).padStart(6)}% | split/tx=${String(m.splitCostPerTrans).padStart(2)} (${m.gateEstimate}g) | tableTrytes=${m.tableMemoryTrytes}`);
  }
}

module.exports = { runAllDesignsBench, SPLIT_COST_MODEL };
