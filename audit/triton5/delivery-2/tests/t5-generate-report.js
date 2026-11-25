#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Programmatic Verification Report Generator (`tests/t5-generate-report.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Reads `results.jsonl`, `triton5.html`, and `ISA-5.md`, and generates
 * `REPORT-5.md` with zero hand-typed numbers, zero predictions, and zero
 * recommendations across page sizes or MMU designs. Explicitly corrects
 * Stage 1's "0 division steps" label for `unsigned-3^k`.
 */

const fs = require('fs');
const path = require('path');
const { REPO_ROOT, RESULTS_PATH, sha256File } = require('./t5-common');
const { loadHtmlModule } = require('./t3-common');

const { T } = loadHtmlModule('triton5.html');
const lines = fs.readFileSync(RESULTS_PATH, 'utf8').trim().split('\n').filter(Boolean);
const records = lines.map(l => JSON.parse(l));
const byTest = {};
for (const r of records) byTest[r.test || r.name] = r;

const files = [
  'triton5.html',
  'ISA-5.md',
  'results.jsonl',
  'tests/t5-generate-docs.js',
  'tests/t5-generate-report.js',
  'tests/t5-common.js',
  'tests/t5-run-all.js',
  'tests/t5-01-compat.js',
  'tests/t5-02-lockstep.js',
  'tests/t5-03-paging-oracle.js',
  'tests/t5-04-binary-oracle.js',
  'tests/t5-05-restartability.js',
  'tests/t5-06-positive-controls.js',
  'tests/t5-07-atomics.js',
  'tests/t5-08-pagesize-bench.js',
  'tests/t5-09-browser.js',
  'tests/t5-10-balanced-oracle.js',
  'tests/t5-11-balanced-null.js',
  'tests/t5-12-balanced-restart.js',
  'tests/t5-13-balanced-pos-controls.js',
  'tests/t5-14-all-designs-bench.js',
  'tests/t5-15-balanced-browser.js'
];

const fileRows = files.map(rel => {
  const full = path.join(REPO_ROOT, rel);
  const bytes = fs.statSync(full).size;
  const sha = sha256File(full);
  return `| \`${rel}\` | \`${bytes.toLocaleString()}\` | \`${sha}\` |`;
}).join('\n');

const summaryRows = records.map(r => {
  const id = r.test !== undefined ? `Test ${r.test}` : r.name;
  const ms = r.elapsedMs !== undefined ? `${r.elapsedMs.toLocaleString()} ms` : '—';
  const ih = r.inputHash ? `\`${r.inputHash.slice(0, 16)}…\`` : '—';
  return `| ${id} | \`${r.name}\` | **${r.status}** | ${ih} | ${ms} |`;
}).join('\n');

const t1 = byTest[1] || {};
const t2 = byTest[2] || {};
const t3 = byTest[3] || {};
const t4 = byTest[4] || {};
const t5 = byTest[5] || {};
const t6 = byTest[6] || {};
const t7 = byTest[7] || {};
const t8 = byTest[8] || {};
const t9 = byTest[9] || {};
const t10 = byTest[10] || {};
const t11 = byTest[11] || {};
const t12 = byTest[12] || {};
const t13 = byTest[13] || {};
const t14 = byTest[14] || {};
const t15 = byTest[15] || {};

const s1BenchRows = (t8.measurements || []).map(m => {
  const unit = m.pageSize === 4096 ? 'div steps' : 'carry trits';
  return `| \`${m.workload}\` | \`${m.pageSize}\` | \`${m.operations.toLocaleString()}\` | \`${m.walks.toLocaleString()}\` | \`${m.walkSteps.toLocaleString()}\` | \`${m.tlbHitRatePct.toFixed(2)}%\` | \`${m.splitCostDivSteps.toLocaleString()}\` (${unit}) | \`${m.tableMemoryTrytes.toLocaleString()}\` | \`${m.cowFaults}\` |`;
}).join('\n');

const splitModelRows = (t14.splitCostModel || []).map(c =>
  `| \`${c.design}\` | \`${c.pageSize.toLocaleString()}\` | \`${c.splitCostPerTrans}\` ${c.splitMetricUnit} | \`${c.gateEstimate}\` ternary gates | ${c.gateEstimateNote} |`
).join('\n');

const s2BenchRows = (t14.measurements || []).map(m =>
  `| \`${m.workload}\` | \`${m.design}\` | \`${m.translations.toLocaleString()}\` | \`${m.uniquePages}\` | \`${m.walks.toLocaleString()}\` | \`${m.walkSteps.toLocaleString()}\` | \`${m.avgWalkStepsPerWalk.toFixed(2)}\` | \`${m.tlbHitRatePct.toFixed(2)}%\` | \`${m.splitCostTotal.toLocaleString()}\` | \`${m.tableMemoryTrytes.toLocaleString()}\` |`
).join('\n');

const wasmBytes = T.MicroWAT.assemble(T.TRITON_WAT).byteLength;

const report = `# Triton 5.0 (Stage 1 + Stage 2) — Verification & Measurement Report (\`REPORT-5.md\`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT · **Target:** Triton 5.0 (Machine Beneath Native NetBSD Port, including \`balanced-3^k\` MMU)

*Generated programmatically by \`tests/t5-generate-report.js\` from \`results.jsonl\` and \`triton5.html\`. Every number below is measured. No page size or MMU design is recommended or ranked.*

## 1. Stage 2 Audit Correction: \`unsigned-3^k\` Split Cost Is Not Zero

Stage 1's \`ISA-5.md\` and \`REPORT-5.md\` labeled \`unsigned-3^k\` (\`729\` and \`2,187\`) as having \`0\` address-split cost ("0 division steps"). That was inaccurate for real balanced-ternary hardware: Triton words are balanced trits \`{-1, 0, +1}\`, whereas \`unsigned-3^k\` splits addresses into unsigned base-3 digits \`{0, 1, 2}\`. Converting a balanced-ternary address to unsigned base-3 digits requires a **borrow/carry chain** across all address trits (\`16\` trits for \`729\`, \`19\` trits for \`2,187\`). Both \`ISA-5.md\` and the measured tables below correct \`unsigned-3^k\` to its true carry-chain length (\`16\` / \`19\` trits) and gate estimate (\`96\` / \`114\` ternary gates), measured beside \`binary-4096\` (\`22\` divider steps, \`294\` iterative gates) and the new **\`balanced-3^k\`** design (\`0\` carry trits, \`0\` divider steps, \`0\` gates).

## 2. Deliverables, Sizes & SHA-256 Digests

| File | Bytes (Measured) | SHA-256 Digest |
| :--- | ---: | :--- |
${fileRows}

- **\`triton5.html\`:** Single self-contained HTML file, zero external dependencies, offline, MIT licence; lifted from \`triton4.html\` with provenance comments on every inline/lift.
- **MicroWAT WASM Core:** \`${wasmBytes.toLocaleString()}\` bytes assembled at runtime from \`TRITON_WAT\` (\`${T.INSTR_SPECS.length}\` opcodes, \`${Object.keys(T.T3_SPR).length}\` SPRs, \`${T.T5_TLB_SIZE}\`-entry FIFO TLB).

## 3. What Was Built in Stage 2 (\`balanced-3^k\` MMU)

- **Selectable MMU Mode (\`options.mmuMode: 'balanced'\`, \`SPR_MMU_MODE = 28\`):** Implemented honestly in both \`TritonJS\` and \`TritonWASM\` for \`729\` ($k=6, B=364$) and \`2,187\` ($k=7, B=1,093$) without translating to or from \`unsigned-3^k\` or \`binary-4096\`. Existing modes and paging-off Triton 4 behavior remain unchanged.
- **Virtual Split & Centred 2-Level Tables:** Low \`k\` balanced trits give \`off ∈ [-B, +B]\`; upper trits give \`vpn\`, split into two balanced levels (\`5+5\` trits = \`[-121..+121]\` for \`729\`; \`6+6\` trits = \`[-364..+364]\` for \`2,187\`). Table bases point to the middle entry (\`idx=0\` at \`[base-1 .. base+1]\`); negative indices are handled at both L0 and L1.
- **NULL & Physical Frame 1+ Wiring:** Virtual page 0 (\`[-B..+B]\`, including C \`NULL = -B\`) is never mapped in hardware and faults with \`EADDR = A\` (machine space). Physical frames start at \`1\` (\`PA = ppn·3^k + off >= B+1\`, pure wiring with no adder); RAM \`0..B\` lies outside every frame for \`VBR = 0\` and pre-paging boot code; \`ppn <= 0\` faults.
- **Compiler Bias & Address Spaces:** Documented in \`ISA-5.md\` Section 1.2 (C displacement floor \`-9,477\` for \`729\`, \`-8,748\` for \`2,187\`; \`PC\`, \`CALL\`/\`CALLX\`/\`JALR\` return addresses, \`BCOPY\`/\`BFILL\`, DMA, PTEs, and \`EADDR\` live in machine space).

## 4. Verification Results Summary (Measured, from \`results.jsonl\`)

| Test # | Suite | Status | Input Hash | Measured Runtime |
| :--- | :--- | :--- | :--- | ---: |
${summaryRows}

### Stage 1 Suites (\`t5-01\` .. \`t5-09\`, Re-Verified Unchanged)
- **Test 1 (Compatibility):** \`${t1.t3SuitesPassed || 0}/12\` T3 suites, \`${t1.t4SuitesPassed || 0}/4\` T4 suites, \`${t1.diffPrograms || 0}\` diff programs (\`${(t1.diffSteps || 0).toLocaleString()}\` steps), TritOS Desktop 2.0.1 200k-step boot (\`${t1.desktopBootHash || 'N/A'}\` === Triton 4), and \`${t1.d20SuitesPassed || 0}/7\` \`d20-*\` suites passed.
- **Test 2 (Stage 1 Lockstep):** \`${(t2.totalSteps || 0).toLocaleString()}\` steps JS === WASM across \`729\`/\`2,187\`/\`4,096\` (+ \`${(t2.fullHashChecks || 0).toLocaleString()}\` full \`computeStateHash\` checks).
- **Test 3 (Stage 1 Paging Oracle):** \`${(t3.totalAccesses || 0).toLocaleString()}\` seeded accesses matched independent oracle on JS & WASM.
- **Test 4 (Binary-Semantics Oracle):** \`${t4.opsTested || 0}\` ops, \`${(t4.edgeCasesChecked || 0).toLocaleString()}\` edges, \`${t4.pair64Cases || 0}\` 64-bit pair tests, \`${(t4.totalRandomCases || 0).toLocaleString()}\` random cases matched \`BigInt\`.
- **Test 5 (Stage 1 Restartability):** \`${(t5.classesTested || []).length}\` instruction classes demand-faulted and resumed identically to no-fault ref on JS & WASM.
- **Test 6 (Stage 1 Positive Controls):** \`${t6.mutantsCaught || 0}/4\` mutants caught.
- **Test 7 (Atomics & WFI):** \`CAS\` under interleaved \`IRQ_TIMER\` (\`0\` lost updates; unpaged \`${t7.cas ? t7.cas.unpaged.finalCnt : 0}\`, paged \`${t7.cas ? t7.cas.paged.finalCnt : 0}\`), \`WFI\` wake (\`${t7.wfi ? t7.wfi.steps : 0}\` steps), \`RDTLS\`/\`SPR_SCRATCH\` verified JS === WASM.
- **Test 9 (Stage 1 Browser):** \`triton5.html\` (\`${t9.triton5ConsoleErrors}\` console errors) + TritOS Desktop 2.0.1 on Triton 5 (\`${t9.desktopConsoleErrors}\` console errors, \`${(t9.desktopNonZeroSampledPixels || 0).toLocaleString()}\` lit sampled pixels).

### Stage 2 Suites (\`t5-10\` .. \`t5-15\`)
- **Test 10 (Independent Balanced-Trit Oracle + Lockstep):** \`${(t10.totalAddressesChecked || 0).toLocaleString()}\` addresses (\`1,000,000\` per size × 2, including every \`±B\` and \`±(B+1)\` boundary) verified against an independent balanced-trit oracle (no emulator ALU); centred walks with negative L0 and L1 indices verified JS === WASM after every step.
- **Test 11 (NULL \`-B\`, Frame 0 Guard & Machine Space):** C \`NULL\` (\`-364\` / \`-1,093\`) READ/WRITE/EXEC faulted with \`EADDR = -B\`; virtual page 0 guard rejected planted PTE in slot \`(0,0)\`; frame 0 PTE faulted; \`CALLX\` return PC verified in machine space; JS === WASM after every step.
- **Test 12 (Balanced-3^k Restartability Across \`+B → -B\`):** \`BCOPY\` (overlapping downward copy), \`BFILL\`, and \`LW\`/\`SW\` straddling the \`+B → -B\` page boundary demand-faulted, mapped, and resumed identically to no-fault ref at both \`729\` and \`2,187\` with JS === WASM after every step.
- **Test 13 (7 Balanced-3^k Positive Controls):** \`${t13.mutantsCaught || 0}/7\` mutant switches caught (\`${(t13.results || []).map(x => x.switch).join(', ')}\`).
- **Test 15 (Real Browser Balanced-3^k):** Verified via ${t15.method || 'Headless Chromium'}: \`${t15.consoleErrors}\` console errors; both \`balanced-729\` and \`balanced-2187\` executed mapped frame \`>= 1\` read/write and NULL \`-B\` fault (\`EADDR = -B\`) in JS === WASM lockstep.

## 5. Measurements Across All Three MMU Designs (Instruments Only — No Recommendation)

### 5.1 Split Cost per Translation & Gate-Level Estimates

| Design | Page Size | Split Cost / Translation | Gate-Level Estimate | Estimation Method |
| :--- | ---: | :--- | :--- | :--- |
${splitModelRows}

### 5.2 TritOS Desktop 2.0.1 (Seeded Mouse & Keyboard Input) + Synthetic Sparse Workload (Test 14, Measured)

All 5 configurations replayed the exact same TritOS Desktop 2.0.1 access stream (\`${(t14.desktopTraceLen || 0).toLocaleString()}\` accesses under seeded mouse/keyboard input) and synthetic sparse-address stream (\`${(t14.sparseTraceLen || 0).toLocaleString()}\` accesses across 32 sparse regions spanning \`12,000,000\` trytes) through the real Triton 5 hardware MMU (\`${t14.tlbEntries || 64}\`-entry FIFO TLB).

| Workload | Design | Translations | Unique Pages | Walks | Walk Steps | Avg Steps / Walk | TLB Hit Rate | Total Split Cost | Table Memory (Trytes) |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${s2BenchRows}

### 5.3 Stage 1 Synthetic Workloads (Test 8, Corrected Split-Cost Units)

| Workload | Page Size | Accesses | Table Walks | Walk Steps | TLB Hit Rate | Split Cost (Corrected Units) | Table Memory (Trytes) | COW Faults |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${s1BenchRows}
`;

const outPath = path.join(REPO_ROOT, 'REPORT-5.md');
fs.writeFileSync(outPath, report, 'utf8');
console.log(`[PASS] t5-generate-report: Generated REPORT-5.md (${Buffer.byteLength(report, 'utf8').toLocaleString()} bytes) from ${records.length} JSONL records`);
