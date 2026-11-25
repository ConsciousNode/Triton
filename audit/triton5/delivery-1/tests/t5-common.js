'use strict';

/**
 * Shared test utilities & JSONL recorder for Triton 5.0 (`tests/t5-common.js`)
 * ConsciousNode SoftWorks — MIT License
 * Lifts `loadHtmlModule` and `makeRng` from `tests/t3-common.js`.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { loadHtmlModule, makeRng } = require('./t3-common');

const REPO_ROOT = path.resolve(__dirname, '..');
const RESULTS_PATH = path.join(REPO_ROOT, 'results.jsonl');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256Str(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function loadMutatedHtmlModule(htmlContent) {
  const scriptMatches = [...htmlContent.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)];
  const sandbox = {
    WebAssembly, Int8Array, Uint8Array, Int16Array, Int32Array,
    Float32Array, Float64Array, BigInt64Array, BigUint64Array,
    DataView, ArrayBuffer, TextEncoder, TextDecoder, Math, BigInt,
    JSON, Array, Object, String, Number, Boolean, Set, Map, RegExp, Error, Date, console
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const m of scriptMatches) vm.runInContext(m[1], sandbox);
  return sandbox.TritonSystem;
}

// Helper to write a 27-trit word directly into a VM's physical RAM (for page table setup in tests)
function writePhysWord(T, machine, physAddr, val) {
  const [w0, w1, w2] = T.numberToWord(val);
  machine.setMem(physAddr, w0);
  machine.setMem(physAddr + 1, w1);
  machine.setMem(physAddr + 2, w2);
}

function readPhysWord(T, machine, physAddr) {
  return T.wordToNumber(
    machine.getMem(physAddr),
    machine.getMem(physAddr + 1),
    machine.getMem(physAddr + 2)
  );
}

// Page table builder helper for tests (operates on physical RAM before enabling paging)
class PageTableBuilder {
  constructor(T, pageSize, l0BasePhys, firstL1Ppn) {
    this.T = T;
    this.pageSize = pageSize;
    this.l0BasePhys = l0BasePhys;
    this.nextL1Ppn = firstL1Ppn;
    this.l1Map = new Map(); // idx0 -> l1Ppn
    this.entriesPerTable = pageSize === 729 ? 243 : (pageSize === 2187 ? 729 : 1024);
    this.tableTrytes = this.entriesPerTable * 3;
  }
  split(va) {
    if (this.pageSize === 729) return this.T.t5SplitAddr729(va);
    if (this.pageSize === 2187) return this.T.t5SplitAddr2187(va);
    return this.T.t5SplitAddr4096(va);
  }
  mapPage(vms, vaPageAligned, ppn, flags) {
    const sp = this.split(vaPageAligned);
    if (!sp) throw new Error(`VA ${vaPageAligned} out of range for pageSize ${this.pageSize}`);
    let l1Ppn = this.l1Map.get(sp.idx0);
    if (l1Ppn === undefined) {
      l1Ppn = this.nextL1Ppn++;
      this.l1Map.set(sp.idx0, l1Ppn);
      const pdeVal = l1Ppn * 512 + this.T.T5_PTE.V;
      for (const m of vms) {
        writePhysWord(this.T, m, this.l0BasePhys + sp.idx0 * 3, pdeVal);
      }
    }
    const pteAddr = l1Ppn * this.pageSize + sp.idx1 * 3;
    const pteVal = ppn * 512 + flags;
    for (const m of vms) {
      writePhysWord(this.T, m, pteAddr, pteVal);
    }
    return pteAddr;
  }
  unmapPage(vms, vaPageAligned) {
    const sp = this.split(vaPageAligned);
    if (!sp) return;
    const l1Ppn = this.l1Map.get(sp.idx0);
    if (l1Ppn === undefined) return;
    const pteAddr = l1Ppn * this.pageSize + sp.idx1 * 3;
    for (const m of vms) {
      writePhysWord(this.T, m, pteAddr, 0);
    }
  }
  getTableMemoryTrytes() {
    return (1 + this.l1Map.size) * this.tableTrytes;
  }
}

function recordResult(entry) {
  const triton5Path = path.join(REPO_ROOT, 'triton5.html');
  const full = Object.assign({
    timestamp: new Date().toISOString(),
    codeSha256: fs.existsSync(triton5Path) ? sha256File(triton5Path) : null
  }, entry);
  if (process.env.T5_WRITE_JSONL === '1') {
    fs.appendFileSync(RESULTS_PATH, JSON.stringify(full) + '\n', 'utf8');
  }
  return full;
}

module.exports = {
  REPO_ROOT,
  RESULTS_PATH,
  loadHtmlModule,
  loadMutatedHtmlModule,
  makeRng,
  sha256File,
  sha256Str,
  writePhysWord,
  readPhysWord,
  PageTableBuilder,
  recordResult
};
