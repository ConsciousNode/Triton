#!/usr/bin/env node
'use strict';

/**
 * Test 9: Determinism, State Export, and Unlimited Console Length (`tests/t3-09-state.js`)
 * ConsciousNode SoftWorks
 *
 * Verifies:
 *   - In both T2 mode (TritOS 2.1) and T3 mode (TritOS 3.0), two independent runs
 *     with the same inputs are bit-identical across JS and WASM.
 *   - A state exported mid-run (`exportSelfContainedHTML` / `extractSnapshotFromHTML` /
 *     `restoreSnapshot`) and resumed finishes with the exact same architectural
 *     state hash and console transcript on both JS and WASM as a continuous run.
 *   - Console length (3.1 Test 4): a TritOS 3 session of >= 1,000 commands producing
 *     >= 50,000 console characters finishes with `wasm.getConsoleOut() === js.consoleOut`.
 *   - Positive controls:
 *     (a) modifying a saved register or memory word in a mid-run snapshot produces a different final state hash;
 *     (b) enabling `narrowWasmState: true` reintroduces the 3.0 trace-derived console cap and fails Test 4.
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
  if (finalHashJs !== hashA || finalHashWasm !== hashA ||
      restoredJs.consoleOut !== runA.consoleOut ||
      restoredWasm.getConsoleOut() !== runA.consoleOut) {
    throw new Error(`[Test 9 - ${archModeStr}] Resumed snapshot hash/console mismatch: continuous=0x${hashA.toString(16)} js=0x${finalHashJs.toString(16)} wasm=0x${finalHashWasm.toString(16)}`);
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

// 4. Console Length Verification (3.1 Test 4): >= 1,000 TritOS 3 commands producing >= 50,000 console chars
const builtOS3 = T.assemble(T.TRITOS3_SRC, { mode: 'T3' });
const numCommands = 1005;
const cmdLines = [];
for (let i = 0; i < numCommands; i++) {
  cmdLines.push(i < 100 ? 'c 111111111*111111111' : 'c 111111*111111');
}
cmdLines.push('quit\n');
const longSessionInput = cmdLines.join('\n');

const longJs = new T.TritonJS({ archMode: 'T3' });
const longWasm = T.TritonWASM.createSync({ archMode: 'T3' });
longJs.loadProgram(builtOS3.trytes, 0);
longWasm.loadProgram(builtOS3.trytes, 0);
longJs.pushInputString(longSessionInput);
longWasm.pushInputString(longSessionInput);

longJs.run(35000000);
longWasm.run(35000000);

const jsConsole = longJs.consoleOut;
const wasmConsole = longWasm.getConsoleOut();

if (!longJs.halted || !longWasm.halted) {
  throw new Error(`[Test 9] Long console session did not halt: jsHalted=${longJs.halted} wasmHalted=${longWasm.halted}`);
}
if (jsConsole.length < 50000) {
  throw new Error(`[Test 9] Expected >= 50,000 console chars from ${numCommands} commands, got ${jsConsole.length}`);
}
if (wasmConsole !== jsConsole) {
  throw new Error(`[Test 9] Console length mismatch: js=${jsConsole.length} chars vs wasm=${wasmConsole.length} chars`);
}
if (T.computeStateHash(longJs) !== T.computeStateHash(longWasm)) {
  throw new Error('[Test 9] State hash mismatch after 1,005-command TritOS 3 session');
}

// 5. Positive Control (3.1 Test 5): with `narrowWasmState: true`, trace-derived console caps at 10,900 I/O events and MUST fail
let narrowConsoleControlCaught = false;
{
  const narrowWasm = T.TritonWASM.createSync({ archMode: 'T3', narrowWasmState: true });
  narrowWasm.loadProgram(builtOS3.trytes, 0);
  narrowWasm.pushInputString(longSessionInput);
  narrowWasm.run(35000000);
  const cappedOut = narrowWasm.getConsoleOut();
  if (cappedOut !== jsConsole && cappedOut.length < jsConsole.length) {
    narrowConsoleControlCaught = true;
  }
}
if (!narrowConsoleControlCaught) {
  throw new Error('[Test 9] Positive control failed: narrowWasmState: true did not fail 50,000-char console check!');
}

console.log(`[PASS] t3-09-state: Determinism, mid-run state export/resume in T2 (0x${hashT2.toString(16)}) & T3 (0x${hashT3.toString(16)}), and ${numCommands}-cmd / ${jsConsole.length.toLocaleString()}-char console match (+ narrowWasmState positive control) in ${Date.now() - t0} ms`);
