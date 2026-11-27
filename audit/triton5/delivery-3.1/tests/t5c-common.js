'use strict';

/**
 * Shared Test Harness for Triton 5 Stage 3 (`tests/t5c-common.js`)
 * ConsciousNode SoftWorks — MIT License
 * Lifts `loadHtmlModule` and `makeRng` from `tests/t3-common.js`.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadHtmlModule, makeRng } = require('./t3-common');
const tcc5 = require('../tcc5/tcc5');

const REPO_ROOT = path.resolve(__dirname, '..');
const RESULTS_PATH = path.join(REPO_ROOT, 'results.jsonl');

let _T = null;
function getTriton() {
  if (!_T) {
    _T = loadHtmlModule(path.resolve(REPO_ROOT, 'triton5.html')).T;
  }
  return _T;
}

function sha256Str(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function getCompilerCodeHash() {
  const files = [
    'triton5.html',
    'tcc5/isa.js', 'tcc5/headers.js', 'tcc5/preproc.js', 'tcc5/types.js',
    'tcc5/parser.js', 'tcc5/codegen.js', 'tcc5/asm.js', 'tcc5/linker.js', 'tcc5/tcc5.js',
    'runtime/crt0.s', 'runtime/rt_mem.c', 'runtime/rt_int64.c', 'runtime/rt_softfp.c'
  ];
  const h = crypto.createHash('sha256');
  for (const f of files) {
    h.update(f + '\0');
    h.update(fs.readFileSync(path.join(REPO_ROOT, f)));
  }
  return h.digest('hex');
}

function runExeOnBothCores(exe, maxSteps = 50000000, runJs = true) {
  const T = getTriton();
  const opts = { archMode: 'T3', pageSize: 2187, mmuMode: 'balanced', diskSectors: 2 };

  const t0 = Date.now();
  const wasmVm = T.TritonWASM.createSync(opts);
  wasmVm.loadProgram(exe.image, 0);
  wasmVm.run(maxSteps);
  const wasmMs = Date.now() - t0;
  const wasmHash = T.computeStateHash(wasmVm);

  let jsOut = null, jsHash = null, jsSteps = 0, jsHalted = false, jsMs = 0;
  let lockstepOk = null;
  if (runJs) {
    const t1 = Date.now();
    const jsVm = new T.TritonJS(opts);
    jsVm.loadProgram(exe.image, 0);
    jsVm.run(maxSteps);
    jsMs = Date.now() - t1;
    jsHash = T.computeStateHash(jsVm);
    jsOut = jsVm.consoleOut;
    jsSteps = jsVm.steps;
    jsHalted = !!jsVm.halted;
    lockstepOk = (jsHash === wasmHash) && (jsOut === wasmVm.consoleOut) && (jsSteps === wasmVm.steps);
  }

  return {
    consoleOut: wasmVm.consoleOut,
    jsOut,
    wasmSteps: wasmVm.steps,
    jsSteps,
    wasmHalted: !!wasmVm.halted,
    jsHalted,
    wasmHash: '0x' + (wasmHash >>> 0).toString(16),
    jsHash: jsHash !== null ? '0x' + (jsHash >>> 0).toString(16) : null,
    lockstepOk,
    wasmMs,
    jsMs
  };
}

function recordJsonl(entry) {
  const full = Object.assign({
    timestamp: new Date().toISOString(),
    codeSha256: getCompilerCodeHash(),
    triton5Sha256: sha256File(path.join(REPO_ROOT, 'triton5.html'))
  }, entry);
  if (process.env.T5C_WRITE_JSONL === '1') {
    fs.appendFileSync(RESULTS_PATH, JSON.stringify(full) + '\n', 'utf8');
  }
  return full;
}

module.exports = {
  REPO_ROOT,
  RESULTS_PATH,
  tcc5,
  makeRng,
  getTriton,
  sha256Str,
  sha256File,
  getCompilerCodeHash,
  runExeOnBothCores,
  recordJsonl
};
