#!/usr/bin/env node
'use strict';

/**
 * Test 1: Extended Trit-Array Oracle (`tests/t3-01-oracle.js`)
 * ConsciousNode SoftWorks
 *
 * Extends the 27-element trit-array oracle to every new T3 instruction and full 27-trit address space:
 *   - 27-trit constant builders & upper additions (`LMI`, `LHI`, `ADDM`, `ADDH`)
 *   - Full 27-trit address formation (`LT`/`LDX`, `ST`/`STX`, `LW`/`LWX`, `SW`/`SWX`)
 *   - PC-relative branches & calls (`JMPX`, `JNX`, `JZX`, `JPX`, `JNZX`, `JNPX`, `JNNX`, `CALLX`)
 *   - Register-indirect jumps & calls (`JR`, `JALR`)
 *   - Interruptible & restartable block copy and fill (`BCOPY`, `BFILL`)
 *   - Full 27-trit range large addresses (2^31 ± 1, 2^32 ± 1, 2^32 + small, 2^32 + FB base,
 *     3^26, -1, -2^31, random 27-trit words) for loads, stores, jumps, BCOPY, and BFILL in
 *     both Supervisor and User mode: JS === WASM === Oracle on fault, ECAUSE, and full EADDR.
 *   - Positive controls: (a) a deliberately perturbed oracle fails verification;
 *     (b) enabling `narrowWasmState: true` (3.0 32-bit address truncation) fails verification.
 */

const { loadHtmlModule, makeRng } = require('./t3-common');
const { T } = loadHtmlModule('triton3.html');

// ============================================================================
// INDEPENDENT PURE TRIT-ARRAY ORACLE (27-element arrays of {-1, 0, +1})
// ============================================================================
const PureTritOracle3 = {
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
  intToTrits(val, len = 27) {
    const out = new Array(len).fill(0);
    let v = BigInt(val);
    for (let i = 0; i < len; i++) {
      let r = Number(v % 3n);
      v = (v - BigInt(r)) / 3n;
      if (r === 2) { r = -1; v += 1n; }
      else if (r === -2) { r = 1; v -= 1n; }
      out[i] = r;
    }
    return out;
  },
  tritsToBigInt(a) {
    let acc = 0n;
    for (let i = a.length - 1; i >= 0; i--) {
      acc = acc * 3n + BigInt(a[i]);
    }
    return acc;
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
  lmi(rdTrits, imm9Trits) {
    const res = rdTrits.slice(0, 27);
    for (let i = 0; i < 9; i++) res[9 + i] = imm9Trits[i];
    return { res, sf: this.sign(res), cf: 0, of: 0 };
  },
  lhi(rdTrits, imm9Trits) {
    const res = rdTrits.slice(0, 27);
    for (let i = 0; i < 9; i++) res[18 + i] = imm9Trits[i];
    return { res, sf: this.sign(res), cf: 0, of: 0 };
  },
  addm(rs1Trits, imm9Trits) {
    const shifted = new Array(27).fill(0);
    for (let i = 0; i < 9; i++) shifted[9 + i] = imm9Trits[i];
    return this.add(rs1Trits, shifted, 0);
  },
  addh(rs1Trits, imm9Trits) {
    const shifted = new Array(27).fill(0);
    for (let i = 0; i < 9; i++) shifted[18 + i] = imm9Trits[i];
    return this.add(rs1Trits, shifted, 0);
  },
  effectiveAddr(baseTrits, imm9Trits) {
    const ext = new Array(27).fill(0);
    for (let i = 0; i < 9; i++) ext[i] = imm9Trits[i];
    return this.add(baseTrits, ext, 0).res;
  },
  branchRel(pcTrits, imm9Trits, sf, condKind) {
    let take = false;
    switch (condKind) {
      case 'JMPX':  take = true; break;
      case 'JNX':   take = (sf === -1); break;
      case 'JZX':   take = (sf === 0); break;
      case 'JPX':   take = (sf === 1); break;
      case 'JNZX':  take = (sf !== 0); break;
      case 'JNPX':  take = (sf !== 1); break;
      case 'JNNX':  take = (sf !== -1); break;
      case 'CALLX': take = true; break;
    }
    const nextPc = this.add(pcTrits, this.intToTrits(2, 27), 0).res;
    if (!take) return { nextPc, retPc: nextPc, taken: false };
    const extImm = new Array(27).fill(0);
    for (let i = 0; i < 9; i++) extImm[i] = imm9Trits[i];
    return {
      nextPc: this.add(nextPc, extImm, 0).res,
      retPc: nextPc,
      taken: true
    };
  },
  blockStep(dstTrits, srcOrValTrits, cntTrits, isFill) {
    const cntVal = this.tritsToBigInt(cntTrits);
    if (cntVal <= 0n) {
      return {
        done: true,
        dst: dstTrits,
        src: srcOrValTrits,
        cnt: this.zero(),
        sf: 0, cf: 0, of: 0
      };
    }
    const one = this.intToTrits(1, 27);
    const nextDst = this.add(dstTrits, one, 0).res;
    const nextSrc = isFill ? srcOrValTrits : this.add(srcOrValTrits, one, 0).res;
    const nextCnt = this.sub(cntTrits, one, 0).res;
    const remVal = this.tritsToBigInt(nextCnt);
    return {
      done: remVal === 0n,
      dst: nextDst,
      src: nextSrc,
      cnt: nextCnt,
      sf: remVal > 0n ? 1 : 0,
      cf: 0,
      of: 0
    };
  },
  // Pure trit-array oracle evaluation of single-tryte and 3-tryte memory access / fetch faults
  evalAccess(addrTrits, spanTrytes, priv, protEn, ubaseTrits, ulimitTrits, ramSize, isWrite = false) {
    const addr = this.tritsToBigInt(addrTrits);
    const ubase = this.tritsToBigInt(ubaseTrits);
    const ulimit = this.tritsToBigInt(ulimitTrits);
    const ram = BigInt(ramSize);
    const fbBase = BigInt(T.T3_FB_BASE);
    const fbEnd = BigInt(T.T3_FB_BASE + T.T3_FB_SIZE);
    const span = BigInt(spanTrytes);

    if (isWrite && span === 3n) {
      if (priv === 1 && protEn === 1) {
        if (addr < ubase || addr + 2n >= ulimit) {
          const bad = addr < ubase ? addr : (addr > ulimit ? addr : ulimit);
          return { fault: true, ecause: 3, eaddr: Number(bad) };
        }
      }
      if (!(addr >= fbBase && addr + 2n < fbEnd)) {
        if (addr < 0n || addr + 2n >= ram) {
          const bad = addr < 0n ? addr : (addr > ram ? addr : ram);
          return { fault: true, ecause: 4, eaddr: Number(bad) };
        }
      }
      return { fault: false, ecause: 0, eaddr: 0 };
    }

    for (let k = 0n; k < span; k++) {
      const cur = addr + k;
      if (priv === 1 && protEn === 1) {
        if (cur < ubase || cur >= ulimit) {
          return { fault: true, ecause: 3, eaddr: Number(cur) };
        }
      }
      const inFb = (cur >= fbBase && cur < fbEnd);
      const inRam = (cur >= 0n && cur < ram);
      if (!inFb && !inRam) {
        return { fault: true, ecause: 4, eaddr: Number(cur) };
      }
    }
    return { fault: false, ecause: 0, eaddr: 0 };
  }
};

const t0 = Date.now();
const rng = makeRng(0x3001CAFE);
const jsVm = new T.TritonJS({ archMode: 'T3' });
const wasmVm = T.TritonWASM.createSync({ archMode: 'T3' });

// 1. Test LMI, LHI, ADDM, ADDH across 25,000 random & edge operands
let totalChecks = 0;
const EDGE_VALS = [
  0n, 1n, -1n, 9841n, -9841n, 9842n, -9842n, 19683n, -19683n,
  387420489n, -387420489n, 3812798742493n, -3812798742493n
];
const T3_ALU_OPS = [
  { name: 'LMI',  op: 33 },
  { name: 'LHI',  op: 34 },
  { name: 'ADDM', op: 35 },
  { name: 'ADDH', op: 36 }
];

for (let i = 0; i < 25000; i++) {
  const ta = i < EDGE_VALS.length ? PureTritOracle3.intToTrits(EDGE_VALS[i], 27) : rng.wordTrits();
  const imm9 = (i < EDGE_VALS.length * 2) ? ((i % 3 === 0) ? 9841 : (i % 3 === 1 ? -9841 : 0)) : rng.int(-9841, 9841);
  const immTrits = PureTritOracle3.intToTrits(imm9, 9);
  const spec = T3_ALU_OPS[i % T3_ALU_OPS.length];

  let exp;
  if (spec.name === 'LMI') exp = PureTritOracle3.lmi(ta, immTrits);
  else if (spec.name === 'LHI') exp = PureTritOracle3.lhi(ta, immTrits);
  else if (spec.name === 'ADDM') exp = PureTritOracle3.addm(ta, immTrits);
  else exp = PureTritOracle3.addh(ta, immTrits);

  const [a0, a1, a2] = T.tritsToWord(ta);
  const rs1 = (spec.name === 'LMI' || spec.name === 'LHI') ? 0 : 1;
  const [ins0, ins1] = T.encodeInstruction(spec.op, 0, rs1, imm9);

  jsVm.pc = 0; jsVm.halted = 0;
  jsVm.setMem(0, ins0); jsVm.setMem(1, ins1);
  jsVm.setWord(0, a0, a1, a2); jsVm.setWord(1, a0, a1, a2);
  jsVm.step();

  wasmVm.pc = 0; wasmVm.halted = 0;
  wasmVm.setMem(0, ins0); wasmVm.setMem(1, ins1);
  wasmVm.setWord(0, a0, a1, a2); wasmVm.setWord(1, a0, a1, a2);
  wasmVm.step();

  const [ew0, ew1, ew2] = T.tritsToWord(exp.res);
  const [jw0, jw1, jw2] = jsVm.getWord(0);
  const [ww0, ww1, ww2] = wasmVm.getWord(0);
  if (ew0 !== jw0 || ew1 !== jw1 || ew2 !== jw2 || ew0 !== ww0 || ew1 !== ww1 || ew2 !== ww2 ||
      exp.sf !== jsVm.sf || exp.cf !== jsVm.cf || exp.of !== jsVm.of ||
      exp.sf !== wasmVm.sf || exp.cf !== wasmVm.cf || exp.of !== wasmVm.of) {
    throw new Error(`[Test 1] Oracle mismatch on ${spec.name} at case ${i}`);
  }
  totalChecks++;
}

// 2. Test 27-trit Address Formation & Loads/Stores (LDX, STX, LWX, SWX) across physical RAM & faulting cases
for (let i = 0; i < 5000; i++) {
  const baseAddr = (i % 10 === 0)
    ? rng.int(T.T3_DEFAULT_RAM_SIZE - 5, T.T3_DEFAULT_RAM_SIZE + 500)
    : (i % 10 === 1 ? rng.int(-500, -1) : rng.int(1000, T.T3_DEFAULT_RAM_SIZE - 20000));
  const imm9 = rng.int(-500, 500);
  const baseTrits = PureTritOracle3.intToTrits(baseAddr, 27);
  const immTrits = PureTritOracle3.intToTrits(imm9, 9);
  const effTrits = PureTritOracle3.effectiveAddr(baseTrits, immTrits);
  const effAddr = Number(PureTritOracle3.tritsToBigInt(effTrits));

  const isFaultExpected = (effAddr < 0 || effAddr + 2 >= T.T3_DEFAULT_RAM_SIZE);
  jsVm.reset(true); wasmVm.reset(true);
  jsVm.vbr = 100; wasmVm.vbr = 100;
  jsVm.setMem(100 + 4 * 3, 500); wasmVm.setMem(100 + 4 * 3, 500);

  const testVal = rng.wordTrits();
  const [v0, v1, v2] = T.tritsToWord(testVal);
  const [b0, b1, b2] = T.tritsToWord(baseTrits);

  const [sw0, sw1] = T.encodeInstruction(40, 2, 1, imm9);
  const [lw0, lw1] = T.encodeInstruction(39, 3, 1, imm9);
  jsVm.setMem(0, sw0); jsVm.setMem(1, sw1);
  jsVm.setMem(2, lw0); jsVm.setMem(3, lw1);
  wasmVm.setMem(0, sw0); wasmVm.setMem(1, sw1);
  wasmVm.setMem(2, lw0); wasmVm.setMem(3, lw1);

  jsVm.setWord(1, b0, b1, b2); jsVm.setWord(2, v0, v1, v2);
  wasmVm.setWord(1, b0, b1, b2); wasmVm.setWord(2, v0, v1, v2);

  jsVm.step(); wasmVm.step();
  if (isFaultExpected) {
    if (jsVm.pc !== 500 || wasmVm.pc !== 500 || jsVm.ecause !== 4 || wasmVm.ecause !== 4) {
      throw new Error(`[Test 1] Expected BAD_ADDR fault at effAddr=${effAddr}, got pc=${jsVm.pc}/${wasmVm.pc}`);
    }
  } else {
    jsVm.step(); wasmVm.step();
    const [j0, j1, j2] = jsVm.getWord(3);
    const [w0, w1, w2] = wasmVm.getWord(3);
    if (j0 !== v0 || j1 !== v1 || j2 !== v2 || w0 !== v0 || w1 !== v1 || w2 !== v2) {
      throw new Error(`[Test 1] LWX/SWX mismatch at effAddr=${effAddr}`);
    }
  }
  totalChecks++;
}

// 3. Test PC-Relative Branches & Calls (JMPX..JNNX, CALLX) and JALR against Oracle
const BRANCH_OPS = [
  { name: 'JMPX',  op: 41 },
  { name: 'JNX',   op: 42 },
  { name: 'JZX',   op: 43 },
  { name: 'JPX',   op: 44 },
  { name: 'JNZX',  op: 45 },
  { name: 'JNPX',  op: 46 },
  { name: 'JNNX',  op: 47 },
  { name: 'CALLX', op: 48 }
];

for (let i = 0; i < 5000; i++) {
  const pcStart = rng.int(20000, 500000) & ~1;
  const rel9 = rng.int(-4000, 4000) * 2;
  const sf = (i % 3) - 1;
  const spec = BRANCH_OPS[i % BRANCH_OPS.length];

  const pcTrits = PureTritOracle3.intToTrits(pcStart, 27);
  const relTrits = PureTritOracle3.intToTrits(rel9, 9);
  const exp = PureTritOracle3.branchRel(pcTrits, relTrits, sf, spec.name);
  const expNextPc = Number(PureTritOracle3.tritsToBigInt(exp.nextPc));

  const [ins0, ins1] = T.encodeInstruction(spec.op, 0, 0, rel9);
  jsVm.pc = pcStart; jsVm.sp = 100000; jsVm.sf = sf;
  wasmVm.pc = pcStart; wasmVm.sp = 100000; wasmVm.sf = sf;
  jsVm.setMem(pcStart, ins0); jsVm.setMem(pcStart + 1, ins1);
  wasmVm.setMem(pcStart, ins0); wasmVm.setMem(pcStart + 1, ins1);

  jsVm.step(); wasmVm.step();
  if (jsVm.pc !== expNextPc || wasmVm.pc !== expNextPc) {
    throw new Error(`[Test 1] Branch ${spec.name} PC mismatch: exp=${expNextPc} js=${jsVm.pc} wasm=${wasmVm.pc}`);
  }
  if (spec.name === 'CALLX') {
    if (jsVm.sp !== 99997 || wasmVm.sp !== 99997) {
      throw new Error(`[Test 1] CALLX SP mismatch`);
    }
  }
  totalChecks++;
}

// 4. Test Interruptible & Restartable BCOPY and BFILL against Oracle
for (let i = 0; i < 500; i++) {
  const len = rng.int(0, 40);
  const srcBase = 30000 + i * 50;
  const dstBase = 60000 + i * 50;
  const isFill = (i % 2 === 1);
  const op = isFill ? 51 : 50;
  const [ins0, ins1] = T.encodeInstruction(op, 1, 2, T.balRem(3, 9, 4));

  jsVm.pc = 100; wasmVm.pc = 100;
  jsVm.setMem(100, ins0); jsVm.setMem(101, ins1);
  wasmVm.setMem(100, ins0); wasmVm.setMem(101, ins1);

  for (let k = 0; k < len; k++) {
    const v = rng.int(-9841, 9841);
    jsVm.setMem(srcBase + k, v);
    wasmVm.setMem(srcBase + k, v);
  }
  const fillVal = rng.int(-9841, 9841);
  let dTrits = PureTritOracle3.intToTrits(dstBase, 27);
  let sTrits = PureTritOracle3.intToTrits(isFill ? fillVal : srcBase, 27);
  let cTrits = PureTritOracle3.intToTrits(len, 27);

  jsVm.setWordNum(1, dstBase);
  jsVm.setWordNum(2, isFill ? fillVal : srcBase);
  jsVm.setWordNum(3, len);
  wasmVm.setWordNum(1, dstBase);
  wasmVm.setWordNum(2, isFill ? fillVal : srcBase);
  wasmVm.setWordNum(3, len);

  const stepsNeeded = Math.max(1, len);
  for (let st = 0; st < stepsNeeded; st++) {
    const exp = PureTritOracle3.blockStep(dTrits, sTrits, cTrits, isFill);
    dTrits = exp.dst; sTrits = exp.src; cTrits = exp.cnt;
    jsVm.step(); wasmVm.step();

    const expD = Number(PureTritOracle3.tritsToBigInt(dTrits));
    const expS = Number(PureTritOracle3.tritsToBigInt(sTrits));
    const expC = Number(PureTritOracle3.tritsToBigInt(sTrits === exp.src ? cTrits : cTrits));
    if (jsVm.getWordNum(1) !== expD || wasmVm.getWordNum(1) !== expD ||
        jsVm.getWordNum(2) !== expS || wasmVm.getWordNum(2) !== expS ||
        jsVm.getWordNum(3) !== expC || wasmVm.getWordNum(3) !== expC ||
        jsVm.sf !== exp.sf || wasmVm.sf !== exp.sf) {
      throw new Error(`[Test 1] Block op step mismatch at i=${i} st=${st}`);
    }
    const expPc = exp.done ? 102 : 100;
    if (jsVm.pc !== expPc || wasmVm.pc !== expPc) {
      throw new Error(`[Test 1] Block op restartable PC mismatch: exp=${expPc} got=${jsVm.pc}/${wasmVm.pc}`);
    }
    totalChecks++;
  }
  for (let k = 0; k < len; k++) {
    const expectedTryte = isFill ? fillVal : jsVm.getMem(srcBase + k);
    if (jsVm.getMem(dstBase + k) !== expectedTryte || wasmVm.getMem(dstBase + k) !== expectedTryte) {
      throw new Error(`[Test 1] Block op memory content mismatch at k=${k}`);
    }
  }
}

// 5. Full 27-Trit Large-Address Oracle Suite (Loads, Stores, Jumps, BCOPY, BFILL in Supervisor & User Mode)
function runLargeAddrOracleSuite(targetWasmVm) {
  let checks = 0;
  const TWO31 = 2147483648;
  const TWO32 = 4294967296;
  const THREE25 = 847288609443;
  const THREE26 = 2541865828329;
  const MAX27 = 3812798742493;

  const probeAddrs = [
    TWO31 - 1,
    TWO31,
    TWO31 + 1,
    TWO32 - 1,
    TWO32,
    TWO32 + 1,
    TWO32 + 400,                 // aliases kernel sentinel 400 if truncated to 32 bits
    TWO32 + 2000,                // aliases supervisor RAM 2000 if truncated to 32 bits
    TWO32 + 5500,                // aliases user window [5000, 6000) if truncated to 32 bits
    TWO32 + T.T3_FB_BASE,        // 2^32 + framebuffer base
    TWO32 + T.T3_FB_BASE + 1000,
    THREE25,
    THREE26,
    -THREE26,
    MAX27 - 10,
    -MAX27 + 10,
    -1,
    -TWO31,
    -TWO31 - 1,
    -TWO31 + 1,
    -TWO32,
    -TWO32 + 5500,
    0,
    400,
    4999,
    5000,
    5500,
    5998,
    5999,
    6000,
    T.T3_DEFAULT_RAM_SIZE - 3,
    T.T3_DEFAULT_RAM_SIZE - 1,
    T.T3_DEFAULT_RAM_SIZE,
    T.T3_DEFAULT_RAM_SIZE + 1000,
    T.T3_FB_BASE - 1,
    T.T3_FB_BASE,
    T.T3_FB_BASE + 100,
    T.T3_FB_BASE + T.T3_FB_SIZE - 1,
    T.T3_FB_BASE + T.T3_FB_SIZE
  ];

  // Add 120 random 27-trit addresses spread across [-MAX27, +MAX27]
  const localRng = makeRng(0x3101BEEF);
  for (let i = 0; i < 120; i++) {
    const rt = localRng.wordTrits();
    const bigA = Number(PureTritOracle3.tritsToBigInt(rt));
    if (Math.abs(bigA) < MAX27 - 1000) probeAddrs.push(bigA);
  }

  const ubase = 5000;
  const ulimit = 6000;
  const ubaseTrits = PureTritOracle3.intToTrits(ubase, 27);
  const ulimitTrits = PureTritOracle3.intToTrits(ulimit, 27);

  jsVm.reset(true);
  targetWasmVm.reset(true);
  // Set up trap vectors 3 (PROT_VIOL) and 4 (BAD_ADDR) at VBR=100 -> handler at PC=800
  // At PC=800: MFSPR R7, #12 (ECAUSE); MFSPR R8, #13 (EADDR)
  jsVm.vbr = 100; targetWasmVm.vbr = 100;
  jsVm.ubase = ubase; targetWasmVm.ubase = ubase;
  jsVm.ulimit = ulimit; targetWasmVm.ulimit = ulimit;
  jsVm.protEn = 1; targetWasmVm.protEn = 1;
  jsVm.ksp = 20000; targetWasmVm.ksp = 20000;
  for (const vec of [3, 4]) {
    jsVm.setMem(100 + vec * 3, 800); jsVm.setMem(100 + vec * 3 + 1, 0); jsVm.setMem(100 + vec * 3 + 2, 0);
    targetWasmVm.setMem(100 + vec * 3, 800); targetWasmVm.setMem(100 + vec * 3 + 1, 0); targetWasmVm.setMem(100 + vec * 3 + 2, 0);
  }
  const [mfCause0, mfCause1] = T.encodeInstruction(54, 7, 0, 12); // MFSPR R7, #12
  const [mfAddr0, mfAddr1] = T.encodeInstruction(54, 8, 0, 13);   // MFSPR R8, #13
  jsVm.setMem(800, mfCause0); jsVm.setMem(801, mfCause1);
  jsVm.setMem(802, mfAddr0);  jsVm.setMem(803, mfAddr1);
  targetWasmVm.setMem(800, mfCause0); targetWasmVm.setMem(801, mfCause1);
  targetWasmVm.setMem(802, mfAddr0);  targetWasmVm.setMem(803, mfAddr1);

  // Place a known sentinel at Mem[2000] = 31337 and Mem[400] = 7777
  jsVm.setMem(2000, 7654); targetWasmVm.setMem(2000, 7654);
  jsVm.setMem(400, 7777);   targetWasmVm.setMem(400, 7777);

  for (const priv of [0, 1]) {
    const execPc = priv === 1 ? 5100 : 300;
    for (const targetAddr of probeAddrs) {
      const imm9 = (targetAddr >= -MAX27 + 500 && targetAddr <= MAX27 - 500) ? ((checks % 5) - 2) * 7 : 0;
      const baseAddr = targetAddr - imm9;
      const baseTrits = PureTritOracle3.intToTrits(baseAddr, 27);
      const immTrits = PureTritOracle3.intToTrits(imm9, 9);
      const effTrits = PureTritOracle3.effectiveAddr(baseTrits, immTrits);
      const [b0, b1, b2] = T.tritsToWord(baseTrits);

      // (a) Single-tryte Load (LDX / LT) & Store (STX / ST) and Word Load (LWX) & Store (SWX)
      const memOps = [
        { name: 'LDX', op: 37, span: 1, isWrite: false },
        { name: 'STX', op: 38, span: 1, isWrite: true  },
        { name: 'LWX', op: 39, span: 3, isWrite: false },
        { name: 'SWX', op: 40, span: 3, isWrite: true  }
      ];
      for (const mop of memOps) {
        if (mop.isWrite && targetAddr >= 0 && targetAddr < 2100) continue; // don't overwrite vector table/handler
        if (mop.isWrite && targetAddr >= 5095 && targetAddr <= 5110) continue; // don't overwrite execPc

        const oracle = PureTritOracle3.evalAccess(effTrits, mop.span, priv, 1, ubaseTrits, ulimitTrits, T.T3_DEFAULT_RAM_SIZE, mop.isWrite);
        const [ins0, ins1] = T.encodeInstruction(mop.op, 2, 1, imm9);

        for (const vm of [jsVm, targetWasmVm]) {
          vm.priv = priv; vm.pc = execPc; vm.sp = priv === 1 ? 5800 : 50000;
          vm.ecause = 0; vm.eaddr = 0; vm.epc = 0; vm.halted = 0;
          vm.setMem(execPc, ins0); vm.setMem(execPc + 1, ins1);
          vm.setWord(1, b0, b1, b2);
          vm.setWord(2, 123, -45, 6);
          vm. setWord(7, 0, 0, 0); vm.setWord(8, 0, 0, 0);
          vm.step();
          if (vm.pc === 800) { vm.step(); vm.step(); }
        }

        if (oracle.fault) {
          if (jsVm.pc !== 804 || targetWasmVm.pc !== 804 ||
              jsVm.ecause !== oracle.ecause || targetWasmVm.ecause !== oracle.ecause ||
              jsVm.eaddr !== oracle.eaddr || targetWasmVm.eaddr !== oracle.eaddr ||
              jsVm.getWordNum(7) !== oracle.ecause || targetWasmVm.getWordNum(7) !== oracle.ecause ||
              jsVm.getWordNum(8) !== oracle.eaddr || targetWasmVm.getWordNum(8) !== oracle.eaddr ||
              jsVm.epc !== execPc || targetWasmVm.epc !== execPc) {
            throw new Error(`[Test 1] Large-address ${mop.name} fault mismatch at addr=${targetAddr} (priv=${priv}): oracle=${JSON.stringify(oracle)} js={pc:${jsVm.pc},cause:${jsVm.ecause},eaddr:${jsVm.eaddr}} wasm={pc:${targetWasmVm.pc},cause:${targetWasmVm.ecause},eaddr:${targetWasmVm.eaddr},r8:${targetWasmVm.getWordNum(8)}}`);
          }
        } else {
          if (jsVm.pc !== execPc + 2 || targetWasmVm.pc !== execPc + 2 ||
              jsVm.getWordNum(2) !== targetWasmVm.getWordNum(2)) {
            throw new Error(`[Test 1] Large-address ${mop.name} non-fault mismatch at addr=${targetAddr} (priv=${priv})`);
          }
        }
        checks++;
      }

      // (b) Jump (JR / JALR) to full 27-trit targetAddr + instruction fetch at targetAddr
      {
        const isJalr = (checks & 1) === 1;
        const [j0, j1] = isJalr
          ? T.encodeInstruction(49, 4, 1, imm9) // JALR R4, R1, imm9
          : T.encodeInstruction(28, 0, 1, 0);   // JR R1
        const jumpTargetTrits = isJalr ? effTrits : baseTrits;
        const jumpTargetNum = Number(PureTritOracle3.tritsToBigInt(jumpTargetTrits));
        const fetchOracle = PureTritOracle3.evalAccess(jumpTargetTrits, 2, priv, 1, ubaseTrits, ulimitTrits, T.T3_DEFAULT_RAM_SIZE);

        for (const vm of [jsVm, targetWasmVm]) {
          vm.priv = priv; vm.pc = execPc; vm.sp = priv === 1 ? 5800 : 50000;
          vm.ecause = 0; vm.eaddr = 0; vm.epc = 0; vm.halted = 0;
          vm.setMem(execPc, j0); vm.setMem(execPc + 1, j1);
          vm.setWord(1, b0, b1, b2);
          vm.step(); // executes JR / JALR -> sets PC = jumpTargetNum
        }
        if (jsVm.pc !== jumpTargetNum || targetWasmVm.pc !== jumpTargetNum) {
          throw new Error(`[Test 1] Large-address jump PC mismatch: expected ${jumpTargetNum}, got js=${jsVm.pc} wasm=${targetWasmVm.pc}`);
        }
        if (fetchOracle.fault) {
          jsVm.step(); targetWasmVm.step(); // instruction fetch at jumpTargetNum must fault!
          if (jsVm.pc !== 800 || targetWasmVm.pc !== 800 ||
              jsVm.ecause !== fetchOracle.ecause || targetWasmVm.ecause !== fetchOracle.ecause ||
              jsVm.eaddr !== fetchOracle.eaddr || targetWasmVm.eaddr !== fetchOracle.eaddr ||
              jsVm.epc !== jumpTargetNum || targetWasmVm.epc !== jumpTargetNum) {
            throw new Error(`[Test 1] Large-address fetch after jump mismatch at ${jumpTargetNum} (priv=${priv}): oracle=${JSON.stringify(fetchOracle)} jsEaddr=${jsVm.eaddr} wasmEaddr=${targetWasmVm.eaddr}`);
          }
        }
        checks++;
      }

      // (c) BCOPY and BFILL at targetAddr
      if (!(targetAddr >= 0 && targetAddr < 2100) && !(targetAddr >= 5095 && targetAddr <= 5110)) {
        const effAddrTrits = PureTritOracle3.intToTrits(targetAddr, 27);
        const [t0, t1, t2] = T.tritsToWord(effAddrTrits);
        const oracle1 = PureTritOracle3.evalAccess(effAddrTrits, 1, priv, 1, ubaseTrits, ulimitTrits, T.T3_DEFAULT_RAM_SIZE);

        // BFILL R1(dst=targetAddr), R2(val=77), R3(cnt=2)
        const [bf0, bf1] = T.encodeInstruction(51, 1, 2, T.balRem(3, 9, 4));
        for (const vm of [jsVm, targetWasmVm]) {
          vm.priv = priv; vm.pc = execPc; vm.ecause = 0; vm.eaddr = 0; vm.halted = 0;
          vm.setMem(execPc, bf0); vm.setMem(execPc + 1, bf1);
          vm.setWord(1, t0, t1, t2);
          vm.setWord(2, 77, 0, 0);
          vm.setWord(3, 2, 0, 0);
          vm.step();
        }
        if (oracle1.fault) {
          if (jsVm.pc !== 800 || targetWasmVm.pc !== 800 ||
              jsVm.ecause !== oracle1.ecause || targetWasmVm.ecause !== oracle1.ecause ||
              jsVm.eaddr !== oracle1.eaddr || targetWasmVm.eaddr !== oracle1.eaddr) {
            throw new Error(`[Test 1] Large-address BFILL fault mismatch at ${targetAddr}`);
          }
        } else {
          if (jsVm.getWordNum(1) !== targetAddr + 1 || targetWasmVm.getWordNum(1) !== targetAddr + 1 ||
              jsVm.getWordNum(3) !== 1 || targetWasmVm.getWordNum(3) !== 1) {
            throw new Error(`[Test 1] Large-address BFILL step mismatch at ${targetAddr}`);
          }
        }

        // BCOPY R1(dst=5500), R2(src=targetAddr), R3(cnt=2)
        const [bc0, bc1] = T.encodeInstruction(50, 1, 2, T.balRem(3, 9, 4));
        for (const vm of [jsVm, targetWasmVm]) {
          vm.priv = priv; vm.pc = execPc; vm.ecause = 0; vm.eaddr = 0; vm.halted = 0;
          vm.setMem(execPc, bc0); vm.setMem(execPc + 1, bc1);
          vm.setWord(1, 5500, 0, 0);
          vm.setWord(2, t0, t1, t2);
          vm.setWord(3, 2, 0, 0);
          vm.step();
        }
        if (oracle1.fault) {
          if (jsVm.pc !== 800 || targetWasmVm.pc !== 800 ||
              jsVm.ecause !== oracle1.ecause || targetWasmVm.ecause !== oracle1.ecause ||
              jsVm.eaddr !== oracle1.eaddr || targetWasmVm.eaddr !== oracle1.eaddr) {
            throw new Error(`[Test 1] Large-address BCOPY fault mismatch at ${targetAddr}`);
          }
        } else {
          if (jsVm.getWordNum(2) !== targetAddr + 1 || targetWasmVm.getWordNum(2) !== targetAddr + 1 ||
              jsVm.getWordNum(3) !== 1 || targetWasmVm.getWordNum(3) !== 1) {
            throw new Error(`[Test 1] Large-address BCOPY step mismatch at ${targetAddr}`);
          }
        }
        checks += 2;
      }
    }
  }

  // Verify kernel sentinels at Mem[400] and Mem[2000] were never corrupted
  if (jsVm.getMem(400) !== 7777 || targetWasmVm.getMem(400) !== 7777 ||
      jsVm.getMem(2000) !== 7654 || targetWasmVm.getMem(2000) !== 7654) {
    throw new Error('[Test 1] Sentinel memory corrupted during large-address oracle checks');
  }
  return checks;
}

totalChecks += runLargeAddrOracleSuite(wasmVm);

// 6. Positive Controls:
// (a) Verify that perturbing a single trit in the oracle is immediately caught
let positiveControlCaught = false;
{
  const ta = PureTritOracle3.intToTrits(1234567, 27);
  const immTrits = PureTritOracle3.intToTrits(42, 9);
  const good = PureTritOracle3.addm(ta, immTrits);
  const badRes = good.res.slice();
  badRes[9] = badRes[9] === 1 ? -1 : 1;
  const [bw0, bw1, bw2] = T.tritsToWord(badRes);

  const [a0, a1, a2] = T.tritsToWord(ta);
  const [ins0, ins1] = T.encodeInstruction(35, 0, 1, 42);
  jsVm.pc = 0; jsVm.setMem(0, ins0); jsVm.setMem(1, ins1);
  jsVm.setWord(1, a0, a1, a2);
  jsVm.step();
  const [jw0, jw1, jw2] = jsVm.getWord(0);
  if (bw0 !== jw0 || bw1 !== jw1 || bw2 !== jw2) {
    positiveControlCaught = true;
  }
}
if (!positiveControlCaught) {
  throw new Error('[Test 1] Positive control failed to detect perturbed oracle!');
}

// (b) Positive Control (3.1): `narrowWasmState: true` reintroduces 3.0 32-bit address truncation and MUST fail Test 1
let narrowControlCaught = false;
{
  const narrowWasm = T.TritonWASM.createSync({ archMode: 'T3', narrowWasmState: true });
  try {
    runLargeAddrOracleSuite(narrowWasm);
  } catch (_) {
    narrowControlCaught = true;
  }
}
if (!narrowControlCaught) {
  throw new Error('[Test 1] Positive control failed: narrowWasmState: true did not fail large-address oracle checks!');
}

console.log(`[PASS] t3-01-oracle: ${totalChecks.toLocaleString()} T3 oracle checks (arithmetic, full 27-trit large addrs in Sup/User mode, PC-rel branches, BCOPY/BFILL, faults + narrowWasmState positive control) in ${Date.now() - t0} ms`);
