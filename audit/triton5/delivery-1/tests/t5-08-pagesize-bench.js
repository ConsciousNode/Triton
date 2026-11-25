#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Test 8: Page-Size Measurement Instrument (`tests/t5-08-pagesize-bench.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Instrument (NOT a verdict — makes no recommendation or ranking).
 * Runs a fixed, seeded workload set under all three page sizes (729, 2187, 4096):
 *   1. sequential_sweep  — linear scan across 120,000 trytes
 *   2. random_access     — 20,000 seeded random tryte accesses across 360,000 trytes
 *   3. fork_cow          — fork-like copy-on-write over 64 shared RO pages (write fault -> copy + remap)
 *   4. tlb_thrash        — strided access across 128 distinct pages (> 64-entry TLB capacity)
 *
 * Reports, per page size & workload:
 *   - walkSteps (memory-access steps spent in page table walks + A/D updates)
 *   - walks (number of 2-level page table walks)
 *   - tlbHits, splits, tlbHitRatePct
 *   - splitCost (modeled hardware division steps: 0 for 3^k trit-slice; 22 div steps/split for 4096)
 *   - tableMemoryTrytes (L0 + allocated L1 page tables in trytes)
 */

const {
  loadHtmlModule, makeRng, sha256Str, writePhysWord, PageTableBuilder, recordResult
} = require('./t5-common');

function measureWorkload(T, ps, workloadName, seed) {
  const rng = makeRng(seed);
  // Uniform physical RAM budget large enough for all 3 page sizes
  // 4096 * 400 = 1,638,400 trytes (~3.2 MB)
  const ramSize = 1800000;
  const vm = new T.TritonJS({ archMode: 'T3', pageSize: ps, ramSize, diskSectors: 2 });

  const rwFlags = T.T5_PTE.V | T.T5_PTE.R | T.T5_PTE.W | T.T5_PTE.U;
  const roFlags = T.T5_PTE.V | T.T5_PTE.R | T.T5_PTE.U;
  const rwxFlags = rwFlags | T.T5_PTE.X;

  const l0Phys = 1 * ps;
  const ptb = new PageTableBuilder(T, ps, l0Phys, 2);

  // Reserve pages 0..19 for code, L0, L1 tables, and handler
  // Reserve data VA region starting at VA = 20 * ps
  const dataStartPage = 20;
  let nextFreePpn = 20;

  // Helper to reset MMU counters after setup
  function resetMmuCounters() {
    vm.mmuWalks = 0;
    vm.mmuHits = 0;
    vm.mmuSplits = 0;
    vm.mmuWalkSteps = 0;
    vm.mmuSplitCost = 0;
  }

  let operations = 0;
  let cowFaults = 0;
  let cowCopiedTrytes = 0;

  if (workloadName === 'sequential_sweep') {
    const spanTrytes = 120000;
    const pagesNeeded = Math.ceil(spanTrytes / ps);
    for (let i = 0; i < pagesNeeded; i++) {
      ptb.mapPage([vm], (dataStartPage + i) * ps, nextFreePpn++, rwFlags);
    }
    vm.ptbr = l0Phys;
    vm.pgEn = 1;
    vm.flushTlbAll();
    resetMmuCounters();

    const baseVa = dataStartPage * ps;
    for (let off = 0; off < spanTrytes; off += 3) {
      vm.checkReadTryteT3(baseVa + off, 0);
      operations++;
    }
  } else if (workloadName === 'random_access') {
    const spanTrytes = 360000;
    const pagesNeeded = Math.ceil(spanTrytes / ps);
    for (let i = 0; i < pagesNeeded; i++) {
      ptb.mapPage([vm], (dataStartPage + i) * ps, nextFreePpn++, rwFlags);
    }
    vm.ptbr = l0Phys;
    vm.pgEn = 1;
    vm.flushTlbAll();
    resetMmuCounters();

    const baseVa = dataStartPage * ps;
    const numOps = 20000;
    for (let i = 0; i < numOps; i++) {
      const off = rng.u32() % spanTrytes;
      if ((i & 3) === 0) vm.checkWriteTryteT3(baseVa + off, i & 255, 0);
      else vm.checkReadTryteT3(baseVa + off, 0);
      operations++;
    }
  } else if (workloadName === 'fork_cow') {
    // Fixed 120,000-tryte shared address space mapped RO; write to 64 seeded locations
    // triggering COW page faults, copying the faulting page to a fresh physical frame,
    // remapping RW, flushing that TLB entry, and retrying the write!
    const spanTrytes = 120000;
    const pagesNeeded = Math.ceil(spanTrytes / ps);
    const sharedStartPpn = nextFreePpn;
    for (let i = 0; i < pagesNeeded; i++) {
      ptb.mapPage([vm], (dataStartPage + i) * ps, nextFreePpn++, roFlags);
    }
    vm.vbr = 0;
    writePhysWord(T, vm, 13 * 3, 0);
    vm.ptbr = l0Phys;
    vm.pgEn = 1;
    vm.flushTlbAll();
    resetMmuCounters();

    const baseVa = dataStartPage * ps;
    const numOps = 8000;
    for (let i = 0; i < numOps; i++) {
      const off = rng.u32() % spanTrytes;
      const va = baseVa + off;
      if ((i % 20) === 0) {
        vm.faulted = false;
        const ok = vm.checkWriteTryteT3(va, (i % 9000), 0);
        if (!ok && vm.ecause === 13) {
          cowFaults++;
          const pageIdx = Math.floor(off / ps);
          const oldPpn = sharedStartPpn + pageIdx;
          const newPpn = nextFreePpn++;
          // Copy physical page contents (measuring copy cost)
          const srcBase = oldPpn * ps;
          const dstBase = newPpn * ps;
          for (let k = 0; k < ps; k++) vm.mem[dstBase + k] = vm.mem[srcBase + k];
          cowCopiedTrytes += ps;
          ptb.mapPage([vm], (dataStartPage + pageIdx) * ps, newPpn, rwFlags);
          vm.flushTlbVa(va);
          vm.ecause = 0;
          vm.checkWriteTryteT3(va, (i % 9000), 0);
        }
      } else {
        vm.checkReadTryteT3(va, 0);
      }
      operations++;
    }
  } else if (workloadName === 'tlb_thrash') {
    // 128 distinct pages (2x the 64-entry TLB) accessed in cyclic page order
    const numPages = 128;
    for (let i = 0; i < numPages; i++) {
      ptb.mapPage([vm], (dataStartPage + i) * ps, nextFreePpn++, rwFlags);
    }
    vm.ptbr = l0Phys;
    vm.pgEn = 1;
    vm.flushTlbAll();
    resetMmuCounters();

    const rounds = 100;
    for (let r = 0; r < rounds; r++) {
      for (let p = 0; p < numPages; p++) {
        vm.checkReadTryteT3((dataStartPage + p) * ps + ((r * 13) % ps), 0);
        operations++;
      }
    }
  }

  const hitRatePct = vm.mmuSplits > 0 ? Number(((vm.mmuHits / vm.mmuSplits) * 100).toFixed(2)) : 0;
  return {
    pageSize: ps,
    workload: workloadName,
    operations,
    walks: vm.mmuWalks,
    walkSteps: vm.mmuWalkSteps,
    tlbHits: vm.mmuHits,
    splits: vm.mmuSplits,
    tlbHitRatePct: hitRatePct,
    splitCostDivSteps: vm.mmuSplitCost,
    tableMemoryTrytes: ptb.getTableMemoryTrytes(),
    cowFaults,
    cowCopiedTrytes
  };
}

function runPageSizeBench(T, seed = 0x5EED2026) {
  const t0 = Date.now();
  const workloads = ['sequential_sweep', 'random_access', 'fork_cow', 'tlb_thrash'];
  const measurements = [];
  for (const w of workloads) {
    for (const ps of [729, 2187, 4096]) {
      measurements.push(measureWorkload(T, ps, w, seed));
    }
  }
  return {
    test: 8,
    name: 't5-08-pagesize-bench',
    status: 'PASS',
    seed,
    inputHash: sha256Str(`pagesize-bench:${seed}:${workloads.join(',')}`),
    tlbEntries: T.T5_TLB_SIZE,
    measurements,
    elapsedMs: Date.now() - t0
  };
}

if (require.main === module) {
  const { T } = loadHtmlModule('triton5.html');
  const res = runPageSizeBench(T);
  recordResult(res);
  console.log(`[PASS] t5-08-pagesize-bench: Measured 4 workloads x 3 page sizes (729/2187/4096) in ${res.elapsedMs} ms`);
  for (const m of res.measurements) {
    console.log(`  ${m.workload.padEnd(17)} ps=${String(m.pageSize).padStart(4)} | walkSteps=${String(m.walkSteps).padStart(6)} | tlbHit=${String(m.tlbHitRatePct.toFixed(2)).padStart(6)}% | splitDivSteps=${String(m.splitCostDivSteps).padStart(7)} | tableTrytes=${m.tableMemoryTrytes}`);
  }
}

module.exports = { runPageSizeBench };
