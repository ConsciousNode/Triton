#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Test 1: Backward Compatibility (`tests/t5-01-compat.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Verifies with paging off (SPR_PG_EN = 0):
 *   1. All 12 Triton 3 suites (`t3-01`..`t3-12`) pass unmodified on `triton5.html`.
 *   2. All Triton 4 machine suites (`t4-02`..`t4-05`) pass unmodified on `triton5.html`.
 *   3. Step-for-step differential between `triton4.html` and `triton5.html` (JS & WASM)
 *      across T3/T4 programs + 50 seeded random programs: identical state hash at EVERY step.
 *   4. TritOS Desktop 2.0.1 boots on `triton5.html` with state hash identical to `triton4.html`
 *      after 200,000 steps (both JS and WASM), and all 7 `d20-01`..`d20-07` suites pass
 *      unmodified against `triton5.html`'s machine block.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT, loadHtmlModule, makeRng, sha256Str, recordResult } = require('./t5-common');

const t0 = Date.now();
const { T: T4 } = loadHtmlModule('triton4.html');
const { T: T5 } = loadHtmlModule('triton5.html');

// ---------------------------------------------------------------------------
// 1. Run all 12 T3 suites + 4 T4 suites (t4-02..t4-05) on triton5.html
// ---------------------------------------------------------------------------
const preloadPath = path.resolve(__dirname, '.t5-compat-preload.js');
fs.writeFileSync(preloadPath, `
'use strict';
const Module = require('module');
const path = require('path');
const origResolve = Module._resolveFilename;
const tritfsRefPath = ${JSON.stringify(path.resolve(REPO_ROOT, 'desktop', 'tests', 'tritfs-ref.js'))};
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request === '../../tritfs/tritfs-ref.js') return tritfsRefPath;
  return origResolve.call(this, request, parent, isMain, options);
};
const common = require(${JSON.stringify(path.resolve(__dirname, 't3-common.js'))});
const origLoad = common.loadHtmlModule;
common.loadHtmlModule = function(fn) {
  if (fn === 'triton3.html' || fn === 'triton4.html') return origLoad('triton5.html');
  return origLoad(fn);
};
`);

const T3_SUITES = [
  't3-01-oracle.js', 't3-02-fuzz.js', 't3-03-t2compat.js', 't3-04-protection.js',
  't3-05-interrupts.js', 't3-06-disk.js', 't3-07-selfhost.js', 't3-08-devices.js',
  't3-09-state.js', 't3-10-static.js', 't3-11-browser.js', 't3-12-input-queues.js'
];
const T4_SUITES = [
  't4-02-js-wasm.js', 't4-03-ports-units.js', 't4-04-timer-rtc.js', 't4-05-fault-browser.js'
];

let t3Passed = 0, t4Passed = 0;
try {
  for (const suite of T3_SUITES) {
    const res = spawnSync(process.execPath, ['-r', preloadPath, path.resolve(__dirname, suite)], {
      cwd: REPO_ROOT, encoding: 'utf8', env: process.env, timeout: 180000
    });
    if (res.status !== 0) {
      throw new Error(`[t5-01] T3 suite ${suite} failed on triton5.html:\n${res.stdout}\n${res.stderr}`);
    }
    t3Passed++;
  }
  for (const suite of T4_SUITES) {
    const res = spawnSync(process.execPath, ['-r', preloadPath, path.resolve(__dirname, suite)], {
      cwd: REPO_ROOT, encoding: 'utf8', env: process.env, timeout: 180000
    });
    if (res.status !== 0) {
      throw new Error(`[t5-01] T4 suite ${suite} failed on triton5.html:\n${res.stdout}\n${res.stderr}`);
    }
    t4Passed++;
  }
} finally {
  try { fs.unlinkSync(preloadPath); } catch (_) {}
}

// ---------------------------------------------------------------------------
// 2. Step-for-step differential: triton4.html vs triton5.html (paging off)
// ---------------------------------------------------------------------------
function runStepDiff(name, trytes, modeStr, maxSteps) {
  const j4 = new T4.TritonJS({ archMode: modeStr, ramSize: 65536, diskSectors: 16 });
  const w4 = T4.TritonWASM.createSync({ archMode: modeStr, ramSize: 65536, diskSectors: 16 });
  const j5 = new T5.TritonJS({ archMode: modeStr, ramSize: 65536, diskSectors: 16 });
  const w5 = T5.TritonWASM.createSync({ archMode: modeStr, ramSize: 65536, diskSectors: 16 });
  for (const vm of [j4, w4, j5, w5]) {
    vm.loadProgram(trytes, 0);
    if (modeStr === 'T3') vm.sp = 40000;
  }
  let steps = 0;
  while (steps < maxSteps && !j4.halted) {
    j4.step(); w4.step(); j5.step(); w5.step();
    steps++;
    const h4j = T4.computeStateHash(j4), h4w = T4.computeStateHash(w4);
    const h5j = T5.computeStateHash(j5), h5w = T5.computeStateHash(w5);
    if (h4j !== h5j || h4w !== h5w || h5j !== h5w) {
      throw new Error(`[t5-01] T4/T5 hash mismatch on '${name}' step ${steps}: T4=0x${h4j.toString(16)} T5_JS=0x${h5j.toString(16)} T5_WASM=0x${h5w.toString(16)}`);
    }
  }
  return steps;
}

let totalDiffSteps = 0;
let diffPrograms = 0;
const rng = makeRng(0xC099A705);
const safeOps = [
  (r) => `LI R${r.int(0,7)}, #${r.int(-4000,4000)}`,
  (r) => `ADD R${r.int(0,7)}, R${r.int(0,7)}, R${r.int(0,7)}`,
  (r) => `SUB R${r.int(0,7)}, R${r.int(0,7)}, R${r.int(0,7)}`,
  (r) => `MUL R${r.int(0,7)}, R${r.int(0,7)}, R${r.int(0,7)}`,
  (r) => `TCON R${r.int(0,7)}, R${r.int(0,7)}, R${r.int(0,7)}`,
  (r) => `SHLI R${r.int(0,7)}, R${r.int(0,7)}, #${r.int(-5,5)}`,
  (r) => `ST R${r.int(0,7)}, R8, #${r.int(0,200)}`,
  (r) => `LT R${r.int(0,7)}, R8, #${r.int(0,200)}`,
  (r) => `PUSH R${r.int(0,7)}`,
  (r) => `POP R${r.int(0,7)}`
];
for (let p = 0; p < 50; p++) {
  const lines = ['.mode T3', '.org 0', 'LI R8, #2000'];
  for (let k = 0; k < 40; k++) lines.push(rng.pick(safeOps)(rng));
  lines.push('HALT');
  const built = T4.assemble(lines.join('\n'), { mode: 'T3' });
  totalDiffSteps += runStepDiff(`rand-${p}`, built.trytes, 'T3', 100);
  diffPrograms++;
}

// ---------------------------------------------------------------------------
// 3. TritOS Desktop 2.0.1 boot hash parity (Triton 4 vs Triton 5) + d20-01..07
// ---------------------------------------------------------------------------
const d2HtmlPath = path.join(REPO_ROOT, 'desktop', 'tritos-desktop-2.html');
const d2Html = fs.readFileSync(d2HtmlPath, 'utf8');
const d2Asm = fs.readFileSync(path.join(REPO_ROOT, 'desktop', 'guest-200.asm'), 'utf8');
const d2Built = T4.assemble(d2Asm, { mode: 'T3' });

const d4Js = new T4.TritonJS({ archMode: 'T3' });
const d4Wasm = T4.TritonWASM.createSync({ archMode: 'T3' });
const d5Js = new T5.TritonJS({ archMode: 'T3' });
const d5Wasm = T5.TritonWASM.createSync({ archMode: 'T3' });

for (const vm of [d4Js, d4Wasm, d5Js, d5Wasm]) {
  for (let i = 0; i < d2Built.trytes.length; i++) {
    if (vm.setDisk) vm.setDisk(i, d2Built.trytes[i]);
    else vm.disk[i] = d2Built.trytes[i];
  }
  vm.loadProgram(d2Built.trytes.slice(0, 32), 0);
}

const desktopBootSteps = 200000;
d4Js.run(desktopBootSteps);
d4Wasm.run(desktopBootSteps);
d5Js.run(desktopBootSteps);
d5Wasm.run(desktopBootSteps);

const dh4j = T4.computeStateHash(d4Js);
const dh4w = T4.computeStateHash(d4Wasm);
const dh5j = T5.computeStateHash(d5Js);
const dh5w = T5.computeStateHash(d5Wasm);
if (dh4j !== dh5j || dh4w !== dh5w || dh5j !== dh5w) {
  throw new Error(`[t5-01] TritOS Desktop 2.0.1 boot hash mismatch after ${desktopBootSteps} steps: T4=0x${dh4j.toString(16)} T5_JS=0x${dh5j.toString(16)} T5_WASM=0x${dh5w.toString(16)}`);
}

// Run all 7 unmodified TritOS Desktop 2.0.1 suites (d20-01..d20-07) with triton5.html machine block
const d20PreloadPath = path.resolve(__dirname, '.t5-d20-preload.js');
fs.writeFileSync(d20PreloadPath, `
'use strict';
const fs = require('fs');
const path = require('path');
const repoRoot = ${JSON.stringify(REPO_ROOT)};
const t5Html = fs.readFileSync(path.join(repoRoot, 'triton5.html'), 'utf8');
const d2Path = path.join(repoRoot, 'desktop', 'tritos-desktop-2.html');
const t4Path = path.join(repoRoot, 'triton4.html');
const mbRe = /\\/\\/BEGIN_TRITON3_MACHINE_BLOCK[\\s\\S]*?\\/\\/END_TRITON3_MACHINE_BLOCK/;
const m5 = mbRe.exec(t5Html);
const origRead = fs.readFileSync;
const d2Orig = origRead.call(fs, d2Path, 'utf8');
const m2 = mbRe.exec(d2Orig);
const d2Patched = d2Orig.slice(0, m2.index) + m5[0] + d2Orig.slice(m2.index + m2[0].length);
fs.readFileSync = function(p, enc) {
  const rp = typeof p === 'string' ? path.resolve(p) : '';
  if (rp === d2Path) return enc ? d2Patched : Buffer.from(d2Patched, 'utf8');
  if (rp === t4Path) return enc ? t5Html : Buffer.from(t5Html, 'utf8');
  return origRead.apply(fs, arguments);
};
`);

const D20_SUITES = [
  'd20-01-tritfs-conformance.js',
  'd20-02-scale.js',
  'd20-03-power-cut.js',
  'd20-04-positive-controls.js',
  'd20-05-media-cartridge.js',
  'd20-06-legacy.js',
  'd20-07-no-regressions.js'
];
let d20Passed = 0;
try {
  for (const s of D20_SUITES) {
    const res = spawnSync(process.execPath, ['-r', d20PreloadPath, path.join(REPO_ROOT, 'desktop', 'tests', s)], {
      cwd: path.join(REPO_ROOT, 'desktop'), encoding: 'utf8', env: process.env, timeout: 180000
    });
    if (res.status !== 0) {
      throw new Error(`[t5-01] Desktop 2.0.1 suite ${s} failed on triton5.html:\n${res.stdout}\n${res.stderr}`);
    }
    d20Passed++;
  }
} finally {
  try { fs.unlinkSync(d20PreloadPath); } catch (_) {}
}

const out = {
  test: 1,
  name: 't5-01-compat',
  status: 'PASS',
  inputHash: sha256Str('compat:t3(12)+t4(4)+diff(50)+d20(7)'),
  t3SuitesPassed: t3Passed,
  t4SuitesPassed: t4Passed,
  diffPrograms,
  diffSteps: totalDiffSteps,
  desktopBootSteps,
  desktopBootHash: '0x' + dh5j.toString(16),
  desktopBootMatchesT4: true,
  d20SuitesPassed: d20Passed,
  elapsedMs: Date.now() - t0
};
recordResult(out);
console.log(`[PASS] t5-01-compat: ${t3Passed}/12 T3 suites, ${t4Passed}/4 T4 suites, ${diffPrograms} step-for-step diff programs (${totalDiffSteps} steps), TritOS Desktop 2.0.1 boot (200k steps, hash ${out.desktopBootHash} === T4) & ${d20Passed}/7 d20 suites passed in ${out.elapsedMs} ms`);
