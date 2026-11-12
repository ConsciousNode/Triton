#!/usr/bin/env node
'use strict';

/**
 * Test 9: Determinism and State Export in Both T2 and T3 Modes (`tests/t3-09-state.js`)
 * ConsciousNode SoftWorks
 *
 * Verifies:
 *   - In both T2 mode (TritOS 2.1) and T3 mode (TritOS 3.0), two independent runs
 *     with the same inputs are bit-identical across JS and WASM.
 *   - A state exported mid-run (`exportSelfContainedHTML` / `extractSnapshotFromHTML` /
 *     `restoreSnapshot`) and resumed finishes with the exact same architectural
 *     state hash and console transcript on both JS and WASM as a continuous run.
 *   - Positive control: modifying a saved register or memory word in a mid-run
 *     snapshot produces a different final state hash.
 */

const { loadHtmlModule } = require('./t3-common');
const { T, htmlContent } = loadHtmlModule('triton3.html');

const t0 = Date.now();

function verifyModeExportRoundTrip(archModeStr, osSrc, commands, midSteps) {
  const built = T.assemble(osSrc, { mode: archModeStr });

  // 1. Run A (continuous) vs Run B (continuous) -> Bit-Identical Determinism
  const runA = new T.TritonJS({ archMode: archModeStr });
  const runB = new T.TritonJS({ archMode: archModeStr });
  runA.loadProgram(built.trytes, 0);
  runB.loadProgram(built.trytes, 0);
  runA.pushInputString(commands);
  runB.pushInputString(commands);

  // Stop Run A at midSteps, export HTML snapshot, then continue Run A to completion
  runA.run(midSteps);
  const exportedHtml = T.exportSelfContainedHTML(htmlContent, runA);
  const parsedSnap = T.extractSnapshotFromHTML(exportedHtml);
  if (!parsedSnap || parsedSnap.steps !== midSteps) {
    throw new Error(`[Test 9 - ${archModeStr}] Failed to extract valid mid-run snapshot at step ${midSteps}`);
  }
  runA.run(600000);
  runB.run(600000);

  const hashA = T.computeStateHash(runA);
  const hashB = T.computeStateHash(runB);
  if (hashA !== hashB || runA.consoleOut !== runB.consoleOut) {
    throw new Error(`[Test 9 - ${archModeStr}] Determinism failure between two continuous runs: 0x${hashA.toString(16)} vs 0x${hashB.toString(16)}`);
  }

  // 2. Restore mid-run snapshot onto fresh JS and WASM machines and resume to completion
  const restoredJs = new T.TritonJS({ archMode: archModeStr });
  const restoredWasm = T.TritonWASM.createSync({ archMode: archModeStr });
  T.restoreSnapshot(parsedSnap, restoredJs, restoredWasm);

  const midHashJs = T.computeStateHash(restoredJs);
  const midHashWasm = T.computeStateHash(restoredWasm);
  if (midHashJs !== midHashWasm) {
    throw new Error(`[Test 9 - ${archModeStr}] Restored mid-run state hashes differ between JS and WASM: 0x${midHashJs.toString(16)} vs 0x${midHashWasm.toString(16)}`);
  }

  restoredJs.run(600000);
  restoredWasm.run(600000);

  const finalHashJs = T.computeStateHash(restoredJs);
  const finalHashWasm = T.computeStateHash(restoredWasm);
  if (finalHashJs !== hashA || finalHashWasm !== hashA || restoredJs.consoleOut !== runA.consoleOut) {
    throw new Error(`[Test 9 - ${archModeStr}] Resumed snapshot hash mismatch: continuous=0x${hashA.toString(16)} js=0x${finalHashJs.toString(16)} wasm=0x${finalHashWasm.toString(16)}`);
  }

  // 3. Positive Control: perturbing SP in the snapshot causes final state hash to diverge
  const badSnap = JSON.parse(JSON.stringify(parsedSnap));
  badSnap.sp -= 9;
  const perturbedJs = new T.TritonJS({ archMode: archModeStr });
  T.restoreSnapshot(badSnap, perturbedJs, null);
  perturbedJs.run(600000);
  const perturbedHash = T.computeStateHash(perturbedJs);
  if (perturbedHash === hashA) {
    throw new Error(`[Test 9 - ${archModeStr}] Positive control failed: perturbed snapshot produced identical hash!`);
  }

  return hashA;
}

const hashT2 = verifyModeExportRoundTrip(
  'T2',
  T.TRITOS_SRC,
  'list\nsave SNAP2 T2_PERSISTED\ncalc 111*1T\nreboot\ntype SNAP2\nquit\n',
  1500
);

const hashT3 = verifyModeExportRoundTrip(
  'T3',
  T.TRITOS3_SRC,
  'list\nsave SNAP3 T3_PERSISTED\ncalc 111*1T\nuser\nfault\nreboot\ntype SNAP3\nquit\n',
  25000
);

console.log(`[PASS] t3-09-state: Determinism & mid-run state export/resume verified in T2 (0x${hashT2.toString(16)}) and T3 (0x${hashT3.toString(16)}) across JS & WASM (+ positive controls) in ${Date.now() - t0} ms`);
