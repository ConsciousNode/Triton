// [INLINE] Shared loader & PRNG helper (Provenance: copied from pack/tests/t3-common.js lines 1–91, updated search path for c_d48e23af370d973a)
'use strict';

/**
 * Shared loader & PRNG helper for Triton 3.0 headless verification suites (`tests/t3-*.js`)
 * ConsciousNode SoftWorks
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadHtmlModule(filename) {
  const candidates = [
    path.resolve(__dirname, '..', filename),
    path.resolve(__dirname, filename),
    path.resolve('/working_dir/c_d48e23af370d973a/artifacts/file_generation/ttl=63d/output', filename),
    path.resolve('/working_dir/c_d48e23af370d973a/work', filename)
  ];
  const htmlPath = candidates.find(p => fs.existsSync(p));
  if (!htmlPath) {
    throw new Error(`Could not find ${filename}`);
  }
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const scriptMatches = [...htmlContent.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)];
  if (scriptMatches.length === 0) {
    throw new Error(`No executable <script> found in ${filename}`);
  }
  const sandbox = {
    WebAssembly,
    Int8Array,
    Uint8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
    DataView,
    ArrayBuffer,
    TextEncoder,
    TextDecoder,
    Math,
    BigInt,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Set,
    Map,
    RegExp,
    Error,
    Date,
    console
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const m of scriptMatches) {
    vm.runInContext(m[1], sandbox);
  }
  if (!sandbox.TritonSystem) {
    throw new Error(`TritonSystem not exported by ${filename}`);
  }
  return { T: sandbox.TritonSystem, htmlPath, htmlContent, sandbox };
}

function makeRng(seed = 0x2468ACE1) {
  let s = seed >>> 0;
  return {
    u32() {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return s >>> 0;
    },
    int(min, max) {
      return min + (this.u32() % (max - min + 1));
    },
    trit() {
      return (this.u32() % 3) - 1;
    },
    wordTrits() {
      const a = new Array(27);
      for (let i = 0; i < 27; i++) a[i] = this.trit();
      return a;
    },
    pick(arr) {
      return arr[this.u32() % arr.length];
    }
  };
}

module.exports = { loadHtmlModule, makeRng };
