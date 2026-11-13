// [INLINE] Shared loader, PRNG, MMIO Framebuffer OCR, Disk Image Reader & Reference Models
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadHtmlModule(filename) {
  const candidates = [
    path.resolve(__dirname, '..', filename),
    path.resolve(__dirname, filename)
  ];
  const htmlPath = candidates.find(p => fs.existsSync(p));
  if (!htmlPath) {
    throw new Error('Could not find ' + filename);
  }
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const scriptMatches = [...htmlContent.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)];
  if (scriptMatches.length === 0) {
    throw new Error('No executable <script> found in ' + filename);
  }
  const sandbox = {
    WebAssembly, Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
    Int32Array, Uint32Array, Float32Array, Float64Array, DataView, ArrayBuffer,
    TextEncoder, TextDecoder, Math, BigInt, JSON, Array, Object, String, Number,
    Boolean, Set, Map, RegExp, Error, TypeError, RangeError, Date, console
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const m of scriptMatches) {
    vm.runInContext(m[1], sandbox);
  }
  if (!sandbox.TritonSystem) {
    throw new Error('TritonSystem not exported by ' + filename);
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

// MMIO Framebuffer Readback Helpers (strictly through architected MMIO >= T.T3_FB_BASE)
let _glyphMap = null;
function getGlyphMap(T) {
  if (_glyphMap) return _glyphMap;
  _glyphMap = new Map();
  for (let c = 32; c < 96; c++) {
    const g = T.T3_FONT_GLYPHS_64[c - 32];
    const key = Array.from(g).join(',');
    if (!_glyphMap.has(key)) _glyphMap.set(key, String.fromCharCode(c));
  }
  return _glyphMap;
}

function readFbPixel(vmInst, T, x, y) {
  return vmInst.getMem(T.T3_FB_BASE + y * T.T3_FB_WIDTH + x);
}

function readFbChar(vmInst, T, x, y, bgColor) {
  const gmap = getGlyphMap(T);
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let bits = 0;
    for (let col = 0; col < 8; col++) {
      const px = readFbPixel(vmInst, T, x + col, y + r);
      if (px !== bgColor) bits |= (1 << (7 - col));
    }
    rows.push(bits);
  }
  return gmap.get(rows.join(',')) || '?';
}

function readFbString(vmInst, T, x, y, len, bgColor) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += readFbChar(vmInst, T, x + i * 8, y, bgColor);
  }
  return s;
}

function fbHash(vmInst, T) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < T.T3_FB_SIZE; i++) {
    const v = vmInst.getMem(T.T3_FB_BASE + i);
    if (v !== 0) {
      h = Math.imul(h ^ i, 16777619) >>> 0;
      h = Math.imul(h ^ (v & 0xFFFF), 16777619) >>> 0;
    }
  }
  return h >>> 0;
}

// Disk Image File Readers (strictly via T.exportDiskImage(vm))
function getDiskTrytes(vmInst, T) {
  const u8 = T.exportDiskImage(vmInst);
  return new Int16Array(u8.buffer, u8.byteOffset, u8.byteLength / 2);
}

function readDiskWord(arr, off) {
  return arr[off] + arr[off + 1] * 19683 + arr[off + 2] * 387420489;
}

function listDiskFiles(vmInst, T) {
  const disk = getDiskTrytes(vmInst, T);
  const dirBase = 200 * 729;
  const files = [];
  for (let i = 0; i < 44; i++) {
    const ent = dirBase + i * 16;
    if (disk[ent] === 0) continue;
    let name = '';
    for (let j = 0; j < 8; j++) {
      const ch = disk[ent + j];
      if (ch === 0) break;
      name += String.fromCharCode(ch);
    }
    const type = disk[ent + 8];
    const startSec = readDiskWord(disk, ent + 9);
    const len = readDiskWord(disk, ent + 12);
    const sectors = disk[ent + 15];
    files.push({ name, type, startSec, len, sectors });
  }
  const nextFreeLba = readDiskWord(disk, dirBase + 707);
  const fileCount = readDiskWord(disk, dirBase + 710);
  return { files, nextFreeLba, fileCount };
}

function readDiskFileTrytes(vmInst, T, name) {
  const disk = getDiskTrytes(vmInst, T);
  const { files } = listDiskFiles(vmInst, T);
  const f = files.find(x => x.name === name.toUpperCase());
  if (!f) return null;
  const start = f.startSec * 729;
  return Array.from(disk.slice(start, start + f.len));
}

function readDiskFileString(vmInst, T, name) {
  const trytes = readDiskFileTrytes(vmInst, T, name);
  if (!trytes) return null;
  let s = '';
  for (const t of trytes) {
    if (t === 0) break;
    s += String.fromCharCode(t);
  }
  return s;
}

// Relative Mouse Tracker starting from documented boot cursor (364, 230)
function makeMouseTracker(vmInst, initX = 364, initY = 230) {
  let cx = initX, cy = initY;
  return {
    getPos() { return { x: cx, y: cy }; },
    moveTo(x, y, btn = 0) {
      const nx = Math.max(0, Math.min(722, x));
      const ny = Math.max(0, Math.min(479, y));
      vmInst.pushMouseEvent(nx - cx, ny - cy, btn);
      cx = nx; cy = ny;
    },
    click(x, y, steps = 0) {
      this.moveTo(x, y, 1);
      vmInst.pushMouseEvent(0, 0, 0);
      if (steps > 0) vmInst.run(steps);
    },
    drag(x1, y1, x2, y2, steps = 0) {
      this.moveTo(x1, y1, 1);
      this.moveTo(x2, y2, 1);
      vmInst.pushMouseEvent(0, 0, 0);
      if (steps > 0) vmInst.run(steps);
    }
  };
}

module.exports = {
  loadHtmlModule, makeRng,
  readFbPixel, readFbChar, readFbString, fbHash,
  getDiskTrytes, readDiskWord, listDiskFiles, readDiskFileTrytes, readDiskFileString,
  makeMouseTracker
};
