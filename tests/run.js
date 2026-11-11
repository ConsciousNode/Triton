#!/usr/bin/env node
'use strict';

/**
 * Triton 2.0 Verification & Benchmark Suite (`tests/run.js`)
 * ConsciousNode SoftWorks
 *
 * Exercises and verifies all 8 required tests directly against `triton.html`:
 *   1. Trit-array oracle (100,000 seeded random operands + all edge cases)
 *   2. Differential fuzz (10,000 seeded random valid programs <= 500 instructions)
 *   3. Assembler round trip (assemble -> disassemble -> assemble across full ISA)
 *   4. Self-hosting fixed point (TritOS source + 3 unseen edited copies + boot test)
 *   5. TritOS boots & scripted session on both interpreters (identical transcript)
 *   6. Export round trip (Export -> load -> continue gives identical state hashes)
 *   7. Timing (instructions per second measured and reported for JS and WASM)
 *   8. Static scan (no network or storage APIs; strict CSP; labeled inlines)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Locate triton.html
const candidatePaths = [
  path.resolve(__dirname, '../triton.html'),
  path.resolve(__dirname, './triton.html'),
  '/working_dir/c_a7ca1264b94c3647/artifacts/file_generation/ttl=63d/output/triton.html',
  '/working_dir/c_a7ca1264b94c3647/work/triton.html'
];
const htmlPath = candidatePaths.find(p => fs.existsSync(p));
if (!htmlPath) {
  throw new Error('Could not find triton.html');
}
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Extract the executable inline <script> from triton.html and evaluate in a sandbox
const scriptMatches = [...htmlContent.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)];
if (scriptMatches.length === 0) {
  throw new Error('No executable <script> found in triton.html');
}
const sandbox = {
  WebAssembly,
  Int8Array,
  Uint8Array,
  Int16Array,
  Int32Array,
  Float32Array,
  Float64Array,
  TextEncoder,
  TextDecoder,
  Math,
  BigInt,
  JSON,
  Array,
  Object,
  String,
  Number,
  Set,
  Map,
  RegExp,
  Error,
  console
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const m of scriptMatches) {
  vm.runInContext(m[1], sandbox);
}

const T = sandbox.TritonSystem;
if (!T) {
  throw new Error('TritonSystem was not exported by triton.html');
}

// ============================================================================
// INDEPENDENT PURE TRIT-ARRAY ORACLE
// Written solely in terms of 27-element arrays of trits {-1, 0, +1}.
// ============================================================================
const PureTritOracle = {
  zero() { return new Array(27).fill(0); },
  clone(a) { return a.slice(0, 27); },
  sign(a) {
    for (let i = a.length - 1; i >= 0; i--) {
      if (a[i] !== 0) return a[i];
    }
    return 0;
  },
  fullAddTrit(s) {
    switch (s) {
      case  3: return [0, 1];
      case  2: return [-1, 1];
      case  1: return [1, 0];
      case  0: return [0, 0];
      case -1: return [-1, 0];
      case -2: return [1, -1];
      case -3: return [0, -1];
      default: throw new Error('Invalid trit sum: ' + s);
    }
  },
  neg(a) {
    const res = a.map(t => (t === 0 ? 0 : -t));
    return { res, sf: this.sign(res), cf: 0, of: 0 };
  },
  add(a, b, cin = 0) {
    const res = new Array(27);
    let c = cin;
    for (let i = 0; i < 27; i++) {
      const [t, nc] = this.fullAddTrit(a[i] + b[i] + c);
      res[i] = t;
      c = nc;
    }
    return { res, sf: this.sign(res), cf: c, of: c };
  },
  sub(a, b, cin = 0) {
    const nb = b.map(t => (t === 0 ? 0 : -t));
    return this.add(a, nb, cin);
  },
  cmp(a, b) {
    const { sf, cf, of } = this.sub(a, b, 0);
    return { res: null, sf: cf !== 0 ? cf : sf, cf, of };
  },
  mul(a, b) {
    const prod = new Array(54).fill(0);
    for (let i = 0; i < 27; i++) {
      if (a[i] === 0) continue;
      let c = 0;
      for (let j = 0; j < 27; j++) {
        const [t, nc] = this.fullAddTrit(prod[i + j] + a[i] * b[j] + c);
        prod[i + j] = t;
        c = nc;
      }
      let k = i + 27;
      while (c !== 0 && k < 54) {
        const [t, nc] = this.fullAddTrit(prod[k] + c);
        prod[k] = t;
        c = nc;
        k++;
      }
    }
    const res = prod.slice(0, 27);
    const hiSign = this.sign(prod.slice(27, 54));
    return { res, sf: this.sign(res), cf: hiSign, of: hiSign };
  },
  toUnsignedBase3(a) {
    const d = new Array(a.length).fill(0);
    let borrow = 0;
    for (let i = 0; i < a.length; i++) {
      const v = a[i] + borrow;
      if (v < 0) { d[i] = v + 3; borrow = -1; }
      else { d[i] = v; borrow = 0; }
    }
    return d;
  },
  fromUnsignedBase3(d, len = 27) {
    const r = new Array(len).fill(0);
    let carry = 0;
    for (let i = 0; i < len; i++) {
      const v = (i < d.length ? d[i] : 0) + carry;
      if (v >= 2) { r[i] = v - 3; carry = 1; }
      else { r[i] = v; carry = 0; }
    }
    return r;
  },
  cmpU(a, b) {
    for (let i = a.length - 1; i >= 0; i--) {
      if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
    }
    return 0;
  },
  subU(a, b) {
    const r = new Array(a.length).fill(0);
    let borrow = 0;
    for (let i = 0; i < a.length; i++) {
      const v = a[i] - b[i] + borrow;
      if (v < 0) { r[i] = v + 3; borrow = -1; }
      else { r[i] = v; borrow = 0; }
    }
    return r;
  },
  divmod(a, b) {
    const sa = this.sign(a);
    const sb = this.sign(b);
    if (sb === 0) {
      const div0Of = sa === 0 ? 1 : sa;
      return {
        q: { res: this.zero(), sf: 0, cf: 0, of: div0Of },
        r: { res: this.clone(a), sf: sa, cf: 0, of: div0Of }
      };
    }
    if (sa === 0) {
      return {
        q: { res: this.zero(), sf: 0, cf: 0, of: 0 },
        r: { res: this.zero(), sf: 0, cf: 0, of: 0 }
      };
    }
    const uA = this.toUnsignedBase3(a.map(t => t * sa));
    const uB = [...this.toUnsignedBase3(b.map(t => t * sb)), 0];
    const uB2 = new Array(28).fill(0);
    let c = 0;
    for (let i = 0; i < 28; i++) {
      const v = uB[i] * 2 + c;
      uB2[i] = v % 3;
      c = Math.floor(v / 3);
    }
    let rem = new Array(28).fill(0);
    const uQ = new Array(27).fill(0);
    for (let i = 26; i >= 0; i--) {
      for (let k = 27; k >= 1; k--) rem[k] = rem[k - 1];
      rem[0] = uA[i];
      if (this.cmpU(rem, uB2) >= 0) { uQ[i] = 2; rem = this.subU(rem, uB2); }
      else if (this.cmpU(rem, uB) >= 0) { uQ[i] = 1; rem = this.subU(rem, uB); }
      else { uQ[i] = 0; }
    }
    const sq = sa * sb;
    const qBal = this.fromUnsignedBase3(uQ, 27).map(t => (t === 0 ? 0 : t * sq));
    const rBal = this.fromUnsignedBase3(rem, 27).map(t => (t === 0 ? 0 : t * sa));
    return {
      q: { res: qBal, sf: this.sign(qBal), cf: 0, of: 0 },
      r: { res: rBal, sf: this.sign(rBal), cf: 0, of: 0 }
    };
  },
  tmin(a, b) {
    const res = a.map((t, i) => (t < b[i] ? t : b[i]));
    return { res, sf: this.sign(res), cf: 0, of: 0 };
  },
  tmax(a, b) {
    const res = a.map((t, i) => (t > b[i] ? t : b[i]));
    return { res, sf: this.sign(res), cf: 0, of: 0 };
  },
  tcon(a, b) {
    const res = a.map((t, i) => (t === b[i] ? t : 0));
    return { res, sf: this.sign(res), cf: 0, of: 0 };
  },
  tany(a, b) {
    const res = a.map((t, i) => {
      const s = t + b[i];
      return s > 0 ? 1 : (s < 0 ? -1 : 0);
    });
    return { res, sf: this.sign(res), cf: 0, of: 0 };
  },
  txor(a, b) {
    const res = a.map((t, i) => this.fullAddTrit(t + b[i])[0]);
    return { res, sf: this.sign(res), cf: 0, of: 0 };
  },
  tunary(a, lut3) {
    const res = a.map(t => lut3[t + 1]);
    return { res, sf: this.sign(res), cf: 0, of: 0 };
  },
  shl(a, k) {
    if (k < 0) return this.shr(a, -k);
    if (k === 0) return { res: this.clone(a), sf: this.sign(a), cf: 0, of: 0 };
    const res = new Array(27).fill(0);
    for (let i = 0; i < 27; i++) {
      if (i - k >= 0 && i - k < 27) res[i] = a[i - k];
    }
    const cf = (k >= 1 && k <= 27) ? a[27 - k] : 0;
    const out = [];
    for (let j = Math.max(0, 27 - k); j < 27; j++) out.push(a[j]);
    return { res, sf: this.sign(res), cf, of: this.sign(out) };
  },
  shr(a, k) {
    if (k < 0) return this.shl(a, -k);
    if (k === 0) return { res: this.clone(a), sf: this.sign(a), cf: 0, of: 0 };
    const res = new Array(27).fill(0);
    for (let i = 0; i < 27; i++) {
      if (i + k >= 0 && i + k < 27) res[i] = a[i + k];
    }
    const cf = (k >= 1 && k <= 27) ? a[k - 1] : 0;
    return { res, sf: this.sign(res), cf, of: 0 };
  }
};

// Deterministic PRNG (xorshift32)
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
    }
  };
}

console.log('====================================================================');
console.log('TRITON 2.0 VERIFICATION SUITE (node tests/run.js)');
console.log('Target:', htmlPath);
console.log('====================================================================\n');

// ============================================================================
// TEST 1: TRIT-ARRAY ORACLE (100,000 seeded random operands + all edge cases)
// ============================================================================
{
  const t0 = Date.now();
  const rng = makeRng(0xCAFEBABE);
  const jsVm = new T.TritonJS();
  const wasmVm = T.TritonWASM.createSync();

  const EDGE_BIGS = [
    0n, 1n, -1n, 2n, -2n, 3n, -3n, 4n, -4n, 9n, -9n, 13n, -13n, 27n, -27n,
    81n, -81n, 243n, -243n, 729n, -729n, 9841n, -9841n, 9842n, -9842n,
    19683n, -19683n, 387420489n, -387420489n,
    3812798742493n, -3812798742493n, // max positive & max negative (3^27 - 1)/2
    3812798742492n, -3812798742492n, // overflow boundaries +/- 1
    1906399371246n, -1906399371246n
  ];
  const edgeTrits = EDGE_BIGS.map(b => T.wordToTrits(...T.bigIntToWord(b)));

  const cases = [];
  for (const a of edgeTrits) {
    for (const b of edgeTrits) cases.push([a, b]);
  }
  while (cases.length < 100000 + edgeTrits.length * edgeTrits.length) {
    cases.push([rng.wordTrits(), rng.wordTrits()]);
  }

  const OPS = [
    { name: 'ADD',    op: 4 },
    { name: 'ADC_P',  op: 6, cin: 1 },
    { name: 'ADC_N',  op: 6, cin: -1 },
    { name: 'SUB',    op: 7 },
    { name: 'SBC_P',  op: 9, cin: 1 },
    { name: 'SBC_N',  op: 9, cin: -1 },
    { name: 'MUL',    op: 10 },
    { name: 'DIV',    op: 12 },
    { name: 'MOD',    op: 13 },
    { name: 'NEG',    op: 14 },
    { name: 'CMP',    op: -2 },
    { name: 'TMIN',   op: -4 },
    { name: 'TMAX',   op: -5 },
    { name: 'TCON',   op: -6 },
    { name: 'TANY',   op: -7 },
    { name: 'TXOR',   op: -8 },
    { name: 'TUNARY', op: -9 },
    { name: 'SHL',    op: -10 },
    { name: 'SHR',    op: -12 }
  ];

  const r2Enc = T.balRem(2, 9, 4);
  for (let i = 0; i < cases.length; i++) {
    const [ta, tb] = cases[i];
    const [a0, a1, a2] = T.tritsToWord(ta);
    const spec = OPS[i % OPS.length];

    let sb = tb;
    let [b0, b1, b2] = T.tritsToWord(tb);
    let kVal = 0;
    if (spec.name === 'SHL' || spec.name === 'SHR') {
      kVal = (i % 61) - 30;
      sb = T.wordToTrits(kVal, 0, 0);
      [b0, b1, b2] = [kVal, 0, 0];
    }

    let expected;
    const triad = (i % 27) - 13;
    switch (spec.name) {
      case 'ADD':   expected = PureTritOracle.add(ta, sb, 0); break;
      case 'ADC_P': expected = PureTritOracle.add(ta, sb, 1); break;
      case 'ADC_N': expected = PureTritOracle.add(ta, sb, -1); break;
      case 'SUB':   expected = PureTritOracle.sub(ta, sb, 0); break;
      case 'SBC_P': expected = PureTritOracle.sub(ta, sb, 1); break;
      case 'SBC_N': expected = PureTritOracle.sub(ta, sb, -1); break;
      case 'MUL':   expected = PureTritOracle.mul(ta, sb); break;
      case 'DIV':   expected = PureTritOracle.divmod(ta, sb).q; break;
      case 'MOD':   expected = PureTritOracle.divmod(ta, sb).r; break;
      case 'NEG':   expected = PureTritOracle.neg(ta); break;
      case 'CMP':   expected = PureTritOracle.cmp(ta, sb); break;
      case 'TMIN':  expected = PureTritOracle.tmin(ta, sb); break;
      case 'TMAX':  expected = PureTritOracle.tmax(ta, sb); break;
      case 'TCON':  expected = PureTritOracle.tcon(ta, sb); break;
      case 'TANY':  expected = PureTritOracle.tany(ta, sb); break;
      case 'TXOR':  expected = PureTritOracle.txor(ta, sb); break;
      case 'TUNARY': {
        const m0 = T.balRem(triad, 3, 1);
        const q1 = T.balQuot(triad, 3, 1);
        const m1 = T.balRem(q1, 3, 1);
        const m2 = T.balQuot(q1, 3, 1);
        expected = PureTritOracle.tunary(ta, [m0, m1, m2]);
        break;
      }
      case 'SHL':   expected = PureTritOracle.shl(ta, kVal); break;
      case 'SHR':   expected = PureTritOracle.shr(ta, kVal); break;
    }

    const t1 = spec.name === 'TUNARY' ? triad : (spec.name === 'NEG' ? 0 : r2Enc);
    const rd = spec.name === 'CMP' ? 0 : 0;
    const [ins0, ins1] = T.encodeInstruction(spec.op, rd, 1, t1);

    jsVm.pc = 0; jsVm.halted = 0; jsVm.cf = spec.cin || 0;
    jsVm.mem[0] = ins0; jsVm.mem[1] = ins1;
    jsVm.setWord(1, a0, a1, a2);
    jsVm.setWord(2, b0, b1, b2);
    jsVm.step();

    wasmVm.pc = 0; wasmVm.halted = 0; wasmVm.cf = spec.cin || 0;
    wasmVm.setMem(0, ins0); wasmVm.setMem(1, ins1);
    wasmVm.setWord(1, a0, a1, a2);
    wasmVm.setWord(2, b0, b1, b2);
    wasmVm.step();

    if (expected.res !== null) {
      const [ew0, ew1, ew2] = T.tritsToWord(expected.res);
      const [jw0, jw1, jw2] = jsVm.getWord(0);
      const [ww0, ww1, ww2] = wasmVm.getWord(0);
      if (ew0 !== jw0 || ew1 !== jw1 || ew2 !== jw2 || ew0 !== ww0 || ew1 !== ww1 || ew2 !== ww2) {
        throw new Error(`[Test 1] Word mismatch on ${spec.name} at case ${i}`);
      }
    }
    if (expected.sf !== jsVm.sf || expected.cf !== jsVm.cf || expected.of !== jsVm.of ||
        expected.sf !== wasmVm.sf || expected.cf !== wasmVm.cf || expected.of !== wasmVm.of) {
      throw new Error(`[Test 1] Flag mismatch on ${spec.name} at case ${i}`);
    }
  }
  console.log(`[PASS] Test 1: Trit-array oracle (${cases.length.toLocaleString()} cases incl. ${edgeTrits.length * edgeTrits.length} edge pairs) in ${Date.now() - t0} ms`);
}

// ============================================================================
// TEST 2: DIFFERENTIAL FUZZ (10,000 seeded random valid programs <= 500 instrs)
// ============================================================================
{
  const t0 = Date.now();
  const rng = makeRng(0x13572468);
  const jsVm = new T.TritonJS();
  const wasmVm = T.TritonWASM.createSync();

  const SAFE_OPS = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
    31, 32, -2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -12, -13
  ];

  for (let p = 0; p < 10000; p++) {
    const numIns = rng.int(12, (p % 25 === 0) ? 500 : 64);
    const touchedMem = [];
    const touchedDisk = [];

    jsVm.pc = 0; jsVm.sp = -1; jsVm.sf = 0; jsVm.cf = 0; jsVm.of = 0;
    jsVm.halted = 0; jsVm.steps = 0; jsVm.displayX = 0; jsVm.displayY = 0;
    jsVm.displayCmd = 0; jsVm.diskAddr = 0; jsVm.timerTicks = 0;
    jsVm.inputQueue.length = 0; jsVm.inputHead = 0; jsVm.ioTrace.length = 0;
    jsVm.consoleOut = '';
    jsVm.reg.fill(0);

    wasmVm.pc = 0; wasmVm.sp = -1; wasmVm.sf = 0; wasmVm.cf = 0; wasmVm.of = 0;
    wasmVm.halted = 0; wasmVm.steps = 0; wasmVm.displayX = 0; wasmVm.displayY = 0;
    wasmVm.displayCmd = 0; wasmVm.diskAddr = 0; wasmVm.timerTicks = 0;
    wasmVm.i32[20554] = 0; wasmVm.i32[20555] = 0; wasmVm.i32[20556] = 0;
    wasmVm.i32.fill(0, 20480, 20480 + 27);

    // Seed 2 keyboard input chars
    const ch1 = rng.int(32, 122), ch2 = rng.int(32, 122);
    jsVm.pushInputChar(ch1); jsVm.pushInputChar(ch2);
    wasmVm.pushInputChar(ch1); wasmVm.pushInputChar(ch2);

    for (let i = 0; i < numIns - 1; i++) {
      const op = SAFE_OPS[rng.u32() % SAFE_OPS.length];
      const rd = rng.u32() % 9;
      const rs1 = rng.u32() % 9;
      const rs2 = rng.u32() % 9;
      let t1 = 0;

      if (op >= 21 && op <= 27) {
        // Branch to a valid instruction parcel boundary (prefer forward to bound loops)
        const targetIns = rng.int(i + 1, numIns - 1);
        t1 = targetIns * 2;
      } else if (op >= 15 && op <= 18) {
        // Memory load/store in safe data scratch region [1200..1600]
        const dataAddr = rng.int(1200, 1600);
        // Force rs1 = R0 and clear R0 or use small offset
        t1 = dataAddr;
        touchedMem.push(dataAddr, dataAddr + 1, dataAddr + 2);
      } else if (op === 31 || op === 32) {
        // Port I/O: ports 0, 1, 2, 3, 4, 6, 7, 8 (skip port 5 full-screen fill for speed except occasionally)
        const ports = [0, 1, 2, 3, 4, 6, 7, 8];
        t1 = ports[rng.u32() % ports.length];
      } else if (op === -10 || op === -11 || op === -12 || op === -13) {
        t1 = (op === -10 || op === -12) ? T.balRem(rs2, 9, 4) : rng.int(-30, 30);
      } else {
        const spec = T.OP_MAP[op];
        if (spec.fmt === 'R3' || spec.fmt === 'CMP') t1 = T.balRem(rs2, 9, 4);
        else if (spec.fmt === 'NONE' || spec.fmt === 'R2' || spec.fmt === 'R1_S' || spec.fmt === 'R1_D') t1 = 0;
        else t1 = rng.int(-9841, 9841);
      }

      const effRs1 = (op >= 15 && op <= 18) ? 0 : rs1;
      const [ins0, ins1] = T.encodeInstruction(op, rd, effRs1, t1);
      jsVm.mem[i * 2] = ins0; jsVm.mem[i * 2 + 1] = ins1;
      wasmVm.setMem(i * 2, ins0); wasmVm.setMem(i * 2 + 1, ins1);
    }

    // Final HALT instruction
    const [h0, h1] = T.encodeInstruction(-1, 0, 0, 0);
    jsVm.mem[(numIns - 1) * 2] = h0; jsVm.mem[(numIns - 1) * 2 + 1] = h1;
    wasmVm.setMem((numIns - 1) * 2, h0); wasmVm.setMem((numIns - 1) * 2 + 1, h1);

    // Keep R0 = 0 initially so [R0 + imm9] addresses stay in [1200..1600] when R0 untouched
    const maxSteps = 250;
    const jsSteps = jsVm.run(maxSteps);
    const wasmSteps = wasmVm.run(maxSteps);

    if (jsSteps !== wasmSteps || jsVm.pc !== wasmVm.pc || jsVm.sp !== wasmVm.sp ||
        jsVm.sf !== wasmVm.sf || jsVm.cf !== wasmVm.cf || jsVm.of !== wasmVm.of ||
        jsVm.halted !== wasmVm.halted) {
      throw new Error(`[Test 2] State mismatch on fuzz program ${p}: jsSteps=${jsSteps} wasmSteps=${wasmSteps}`);
    }

    for (let r = 0; r < 9; r++) {
      const [j0, j1, j2] = jsVm.getWord(r);
      const [w0, w1, w2] = wasmVm.getWord(r);
      if (j0 !== w0 || j1 !== w1 || j2 !== w2) {
        throw new Error(`[Test 2] Register R${r} mismatch on fuzz program ${p}`);
      }
    }

    const wTrace = wasmVm.getIOTrace();
    if (jsVm.ioTrace.length !== wTrace.length) {
      throw new Error(`[Test 2] I/O trace length mismatch on fuzz program ${p}`);
    }
    for (let k = 0; k < wTrace.length; k++) {
      for (let f = 0; f < 6; f++) {
        if (jsVm.ioTrace[k][f] !== wTrace[k][f]) {
          throw new Error(`[Test 2] I/O trace entry ${k} mismatch on fuzz program ${p}`);
        }
      }
    }

    // Clean up memory/disk modified during this fuzz iteration
    for (let i = 0; i < numIns * 2; i++) {
      jsVm.mem[i] = 0; wasmVm.setMem(i, 0);
    }
    for (const a of touchedMem) {
      const pa = T.physAddr(a);
      jsVm.mem[pa] = 0; wasmVm.setMem(pa, 0);
    }
    // Also clean stack top region [19500..19682] and low memory if R0 changed
    for (let i = 0; i < T.TRYTE_MOD; i++) {
      if (jsVm.mem[i] !== wasmVm.getMem(i)) {
        throw new Error(`[Test 2] Memory mismatch at tryte ${i} on fuzz program ${p}`);
      }
      if (jsVm.mem[i] !== 0) { jsVm.mem[i] = 0; wasmVm.setMem(i, 0); }
      if (jsVm.disk[i] !== wasmVm.i32[25600 + i]) {
        throw new Error(`[Test 2] Disk mismatch at tryte ${i} on fuzz program ${p}`);
      }
      if (jsVm.disk[i] !== 0) { jsVm.disk[i] = 0; wasmVm.i32[25600 + i] = 0; }
    }
  }
  console.log(`[PASS] Test 2: Differential fuzz (10,000 random valid programs, JS === WASM) in ${Date.now() - t0} ms`);
}

// ============================================================================
// TEST 3: ASSEMBLER ROUND TRIP (assemble -> disassemble -> assemble)
// ============================================================================
{
  const t0 = Date.now();
  const rng = makeRng(0x98765432);
  const lines = [];

  // Exhaustive sweep across all 46 instructions in INSTR_SPECS with varied registers and immediates
  for (const spec of T.INSTR_SPECS) {
    for (let r = 0; r < 9; r++) {
      const r2 = (r + 3) % 9;
      const r3 = (r + 7) % 9;
      const imm = rng.int(-9841, 9841);
      switch (spec.fmt) {
        case 'NONE': lines.push(spec.mnem); break;
        case 'R3':   lines.push(`${spec.mnem} R${r}, R${r2}, R${r3}`); break;
        case 'R2':   lines.push(`${spec.mnem} R${r}, R${r2}`); break;
        case 'CMP':  lines.push(`${spec.mnem} R${r}, R${r2}`); break;
        case 'CMPI': lines.push(`${spec.mnem} R${r}, #${imm}`); break;
        case 'RI':   lines.push(`${spec.mnem} R${r}, #0t${T.intToTernaryStr(imm, 9)}`); break;
        case 'RRI':  lines.push(`${spec.mnem} R${r}, R${r2}, #${imm}`); break;
        case 'R1_S': lines.push(`${spec.mnem} R${r}`); break;
        case 'R1_D': lines.push(`${spec.mnem} R${r}`); break;
        case 'J':    lines.push(`${spec.mnem} #${imm}`); break;
      }
    }
  }

  const src1 = lines.join('\n');
  const pass1 = T.assemble(src1);
  const dis = T.disassemble(pass1.trytes);
  const pass2 = T.assemble(dis);

  if (pass1.trytes.length !== pass2.trytes.length) {
    throw new Error(`[Test 3] Length mismatch: ${pass1.trytes.length} vs ${pass2.trytes.length}`);
  }
  for (let i = 0; i < pass1.trytes.length; i++) {
    if (pass1.trytes[i] !== pass2.trytes[i]) {
      throw new Error(`[Test 3] Tryte mismatch at index ${i}: ${pass1.trytes[i]} vs ${pass2.trytes[i]}`);
    }
  }
  console.log(`[PASS] Test 3: Assembler round trip (${pass1.trytes.length} trytes across all ${T.INSTR_SPECS.length} opcodes) in ${Date.now() - t0} ms`);
}

// ============================================================================
// TEST 4: SELF-HOSTING FIXED POINT
//   - In-OS assembler on TritOS source === JS assembler output byte-for-byte
//   - Matches on 3 edited copies of the source
//   - Image built by the in-OS assembler boots
// ============================================================================
{
  const t0 = Date.now();
  const baseBuilt = T.assemble(T.TRITOS_SRC);

  function runSelfHostOnSource(srcText, label) {
    const expected = T.assemble(srcText);
    const wasmVm = T.TritonWASM.createSync();
    wasmVm.loadProgram(baseBuilt.trytes, 0);

    if (500 + srcText.length >= T.TRYTE_MOD) {
      throw new Error(`[Test 4] Source length ${srcText.length} exceeds disk capacity`);
    }
    for (let i = 0; i < srcText.length; i++) {
      wasmVm.i32[25600 + 500 + i] = T.balRem(srcText.charCodeAt(i), T.TRYTE_MOD, T.TRYTE_HALF);
    }
    wasmVm.i32[25600 + 500 + srcText.length] = 0;

    wasmVm.pushInputString('asm\nquit\n');
    wasmVm.run(6000000);

    const outLen = wasmVm.getMem(3198);
    if (outLen !== expected.length) {
      throw new Error(`[Test 4 - ${label}] Length mismatch: in-OS=${outLen} vs JS=${expected.length}`);
    }
    const emitted = [];
    for (let i = 0; i < outLen; i++) {
      const got = wasmVm.getMem(6000 + i);
      emitted.push(got);
      if (got !== expected.trytes[i]) {
        throw new Error(`[Test 4 - ${label}] Byte/tryte mismatch at index ${i}: in-OS=${got} vs JS=${expected.trytes[i]}`);
      }
    }
    return emitted;
  }

  // 4a. Original TritOS source
  const selfHostedImage = runSelfHostOnSource(T.TRITOS_SRC, 'Original TRITOS_SRC');

  // 4b. Three unseen edited copies of TRITOS_SRC
  // Edited Copy 1: Modified banner, prompt, and immediate pixel/color constants
  const edit1 = T.TRITOS_SRC
    .replace('TritOS 2.0 [27-Trit Balanced-Ternary System]', 'TritOS 2.0-MOD1 [Custom Build]')
    .replace('LI R0,#4', 'LI R0,#11')
    .replace('LI R6,#13', 'LI R6,#-12');
  runSelfHostOnSource(edit1, 'Edited Copy 1 (Modified strings & immediates)');

  // Edited Copy 2: Inserted extra instructions & a new label near boot_reset, shifting ALL label addresses!
  const edit2 = T.TRITOS_SRC.replace(
    'boot_reset: LI R0,#0\nJMP boot_main',
    'boot_reset: LI R0,#0\nADDI R0,R0,#0\nNOP\nJMP extra_hop\nextra_hop: JMP boot_main'
  );
  runSelfHostOnSource(edit2, 'Edited Copy 2 (Inserted instructions & shifted branch labels)');

  // Edited Copy 3: Modified file table metadata and appended custom data words/trytes
  const edit3 = T.TRITOS_SRC.replace(
    '.stringz "SAVED.\\n"',
    '.stringz "SAVED OK!\\n"'
  ) + '\ncustom_footer: .tryte #0t10T10T10T,#-4321,#4321\n.word #123456789\n';
  runSelfHostOnSource(edit3, 'Edited Copy 3 (Modified strings & appended .tryte/.word data)');

  // 4c. Boot the image produced by the in-OS assembler on both JS and WASM!
  const bootJs = new T.TritonJS();
  const bootWasm = T.TritonWASM.createSync();
  for (let i = 0; i < selfHostedImage.length; i++) {
    bootJs.mem[i] = selfHostedImage[i];
    bootWasm.setMem(i, selfHostedImage[i]);
  }
  bootJs.pushInputString('calc 110-1T\nquit\n');
  bootWasm.pushInputString('calc 110-1T\nquit\n');
  bootJs.run(200000);
  bootWasm.run(200000);

  if (!bootJs.consoleOut.includes('TritOS 2.0') || !bootJs.consoleOut.includes('= 101 (10)') ||
      bootJs.consoleOut !== bootWasm.getConsoleOut()) {
    throw new Error('[Test 4] Self-hosted image failed boot verification: ' + bootJs.consoleOut);
  }

  console.log(`[PASS] Test 4: Self-hosting fixed point (TRITOS_SRC + 3 edited copies + self-built image boot) in ${Date.now() - t0} ms`);
}

// ============================================================================
// TEST 5: TRITOS BOOTS & SCRIPTED SESSION ON BOTH INTERPRETERS
//   (list, run calculator, compute a value, save a file, reboot, type the file)
// ============================================================================
{
  const t0 = Date.now();
  const built = T.assemble(T.TRITOS_SRC);
  const script = [
    'list',
    'run calc',
    '10T+11',
    'q',
    'draw',
    'game',
    'save MYFILE BALANCED_TERNARY_OK',
    'reboot',
    'list',
    'type MYFILE',
    'quit',
    ''
  ].join('\n');

  const jsVm = new T.TritonJS();
  jsVm.mem.set(built.mem);
  jsVm.pushInputString(script);
  const jsSteps = jsVm.run(500000);

  const wasmVm = T.TritonWASM.createSync();
  wasmVm.loadProgram(built.trytes, 0);
  wasmVm.pushInputString(script);
  const wasmSteps = wasmVm.run(500000);

  const jsOut = jsVm.consoleOut;
  const wasmOut = wasmVm.getConsoleOut();

  if (jsSteps !== wasmSteps || jsOut !== wasmOut) {
    throw new Error(`[Test 5] Transcript or step mismatch: jsSteps=${jsSteps} wasmSteps=${wasmSteps}`);
  }
  if (!jsOut.includes('FILES ON DISK:') ||
      !jsOut.includes('= 110 (12)') ||
      !jsOut.includes('SAVED.') ||
      !jsOut.includes('MYFILE') ||
      !jsOut.includes('BALANCED_TERNARY_OK')) {
    throw new Error('[Test 5] Transcript missing expected outputs:\n' + jsOut);
  }
  if (T.computeStateHash(jsVm) !== T.computeStateHash(wasmVm)) {
    throw new Error('[Test 5] Final state hash mismatch between JS and WASM after scripted session');
  }
  console.log(`[PASS] Test 5: TritOS boots & scripted session identical on JS and WASM (${jsSteps.toLocaleString()} steps) in ${Date.now() - t0} ms`);
}

// ============================================================================
// TEST 6: EXPORT ROUND TRIP (Export -> load -> continue gives identical hashes)
// ============================================================================
{
  const t0 = Date.now();
  const built = T.assemble(T.TRITOS_SRC);
  const fullCommands = 'list\nsave SNAPFILE SNAPSHOT_PERSISTED\ncalc 111*1T\nreboot\ntype SNAPFILE\nquit\n';

  // Machine A: runs 1,500 steps, exports to HTML, then continues to completion
  const vmContinuous = new T.TritonJS();
  vmContinuous.mem.set(built.mem);
  vmContinuous.pushInputString(fullCommands);
  vmContinuous.run(1500);

  const exportedHtml = T.exportSelfContainedHTML(htmlContent, vmContinuous);
  const parsedSnap = T.extractSnapshotFromHTML(exportedHtml);
  if (!parsedSnap || parsedSnap.steps !== 1500) {
    throw new Error('[Test 6] Failed to extract valid mid-execution snapshot from exported HTML');
  }

  // Continue original machine to completion
  vmContinuous.run(500000);
  const expectedHash = T.computeStateHash(vmContinuous);

  // Machine B (JS & WASM): restored from exportedHtml and continued to completion
  const restoredJs = new T.TritonJS();
  const restoredWasm = T.TritonWASM.createSync();
  T.restoreSnapshot(parsedSnap, restoredJs, restoredWasm);

  if (T.computeStateHash(restoredJs) !== T.computeStateHash(restoredWasm)) {
    throw new Error('[Test 6] Restored mid-run state hashes differ between JS and WASM');
  }

  restoredJs.run(500000);
  restoredWasm.run(500000);

  const hashRestoredJs = T.computeStateHash(restoredJs);
  const hashRestoredWasm = T.computeStateHash(restoredWasm);

  if (hashRestoredJs !== expectedHash || hashRestoredWasm !== expectedHash ||
      restoredJs.consoleOut !== vmContinuous.consoleOut) {
    throw new Error(`[Test 6] Export round-trip hash mismatch: expected=0x${expectedHash.toString(16)} js=0x${hashRestoredJs.toString(16)} wasm=0x${hashRestoredWasm.toString(16)}`);
  }
  console.log(`[PASS] Test 6: Export round trip (state hash 0x${expectedHash.toString(16)} identical across continuous, restored JS, and restored WASM) in ${Date.now() - t0} ms`);
}

// ============================================================================
// TEST 7: TIMING (Instructions per second for each interpreter)
// ============================================================================
{
  const benchSrc = `
    LI R0, #0
    LI R1, #0t10T10T10T
    LI R2, #0t01T01T01T
    LI R3, #9841
  bench_lp:
    ADD  R4, R1, R2
    SUB  R5, R4, R1
    MUL  R6, R5, R2
    ADDI R7, R6, #121
    ST   R7, R0, #1500
    LT   R8, R0, #1500
    CMP  R8, R4
    TCON R4, R5, R2
    SHLI R7, R6, #3
    SUBI R3, R3, #1
    JP   bench_lp
    HALT
  `;
  const benchBuilt = T.assemble(benchSrc);

  const jsVm = new T.TritonJS();
  jsVm.mem.set(benchBuilt.mem);
  const jsStart = process.hrtime.bigint();
  const jsSteps = jsVm.run(1000000);
  const jsNs = Number(process.hrtime.bigint() - jsStart);
  const jsIps = Math.round((jsSteps / jsNs) * 1e9);

  const wasmVm = T.TritonWASM.createSync();
  wasmVm.loadProgram(benchBuilt.trytes, 0);
  const wasmStart = process.hrtime.bigint();
  const wasmSteps = wasmVm.run(1000000);
  const wasmNs = Number(process.hrtime.bigint() - wasmStart);
  const wasmIps = Math.round((wasmSteps / wasmNs) * 1e9);

  if (jsSteps !== wasmSteps || T.computeStateHash(jsVm) !== T.computeStateHash(wasmVm)) {
    throw new Error('[Test 7] Benchmark state mismatch between JS and WASM');
  }
  console.log(`[PASS] Test 7: Timing (${jsSteps.toLocaleString()} instructions):`);
  console.log(`       - JS Reference Interpreter : ${(jsIps / 1e6).toFixed(2)} MIPS (${jsIps.toLocaleString()} instr/sec)`);
  console.log(`       - MicroWAT WASM Interpreter: ${(wasmIps / 1e6).toFixed(2)} MIPS (${wasmIps.toLocaleString()} instr/sec)`);
}

// ============================================================================
// TEST 8: STATIC SCAN (No network or storage APIs; strict CSP; labeled inlines)
// ============================================================================
{
  // 1. Verify strict CSP meta tag
  const cspMatch = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(htmlContent);
  if (!cspMatch) {
    throw new Error('[Test 8] Missing Content-Security-Policy <meta> tag');
  }
  const csp = cspMatch[1];
  if (!csp.includes("default-src 'none'") || !csp.includes("connect-src 'none'")) {
    throw new Error('[Test 8] CSP is not strict enough: ' + csp);
  }

  // 2. Verify zero forbidden network / storage APIs or external URLs
  const forbiddenPatterns = [
    { name: 'fetch()', re: /\bfetch\s*\(/ },
    { name: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/ },
    { name: 'WebSocket', re: /\bWebSocket\b/ },
    { name: 'EventSource', re: /\bEventSource\b/ },
    { name: 'navigator.sendBeacon', re: /\bsendBeacon\b/ },
    { name: 'localStorage', re: /\blocalStorage\b/ },
    { name: 'sessionStorage', re: /\bsessionStorage\b/ },
    { name: 'indexedDB', re: /\bindexedDB\b/ },
    { name: 'caches', re: /\bcaches\b/ },
    { name: 'external http/https URL', re: /https?:\/\//i }
  ];
  for (const pat of forbiddenPatterns) {
    if (pat.re.test(htmlContent)) {
      throw new Error(`[Test 8] Forbidden pattern found in triton.html: ${pat.name}`);
    }
  }

  // 3. Verify all 7 inline sections are explicitly labeled
  for (let idx = 1; idx <= 7; idx++) {
    if (!htmlContent.includes(`[INLINE ${idx}/7]`)) {
      throw new Error(`[Test 8] Missing inline provenance label [INLINE ${idx}/7]`);
    }
  }

  console.log('[PASS] Test 8: Static scan (strict CSP verified, 0 network/storage APIs, all 7 inline blocks labeled)');
}

console.log('\n====================================================================');
console.log('ALL 8 TRITON 2.0 TEST SUITES PASSED');
console.log('====================================================================');