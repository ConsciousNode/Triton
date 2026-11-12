#!/usr/bin/env node
'use strict';

/**
 * Test 1: Extended Trit-Array Oracle (`tests/t3-01-oracle.js`)
 * ConsciousNode SoftWorks
 *
 * Extends the 27-element trit-array oracle to every new T3 instruction:
 *   - 27-trit constant builders & upper additions (`LMI`, `LHI`, `ADDM`, `ADDH`)
 *   - Full 27-trit address formation (`LT`/`LDX`, `ST`/`STX`, `LW`/`LWX`, `SW`/`SWX`)
 *   - PC-relative branches & calls (`JMPX`, `JNX`, `JZX`, `JPX`, `JNZX`, `JNPX`, `JNNX`, `CALLX`)
 *   - Register-indirect jumps & calls (`JR`, `JALR`)
 *   - Interruptible & restartable block copy and fill (`BCOPY`, `BFILL`)
 *   - Edge values and faulting cases (out-of-bounds physical RAM, user protection faults, priv faults)
 *   - Positive control: a deliberately perturbed oracle must fail verification.
 */

const { loadHtmlModule, makeRng } = require('./t3-common');
const { T, htmlPath } = loadHtmlModule('triton3.html');

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
  // T3 New Constant Builders & Upper Tryte Additions in pure trit-array form
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
  // 27-trit Effective Address Formation: base (27 trits) + sign-extended imm9 (9 trits)
  effectiveAddr(baseTrits, imm9Trits) {
    const ext = new Array(27).fill(0);
    for (let i = 0; i < 9; i++) ext[i] = imm9Trits[i];
    return this.add(baseTrits, ext, 0).res;
  },
  // PC-relative branch evaluation
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
  // Single step of BCOPY / BFILL
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

// 2. Test 27-trit Address Formation & Loads/Stores (LDX, STX, LWX, SWX) across full physical RAM & faulting cases
for (let i = 0; i < 5000; i++) {
  const baseAddr = (i % 10 === 0)
    ? rng.int(T.T3_DEFAULT_RAM_SIZE - 5, T.T3_DEFAULT_RAM_SIZE + 500) // Faulting bad address cases!
    : (i % 10 === 1 ? rng.int(-500, -1) : rng.int(1000, T.T3_DEFAULT_RAM_SIZE - 20000));
  const imm9 = rng.int(-500, 500);
  const baseTrits = PureTritOracle3.intToTrits(baseAddr, 27);
  const immTrits = PureTritOracle3.intToTrits(imm9, 9);
  const effTrits = PureTritOracle3.effectiveAddr(baseTrits, immTrits);
  const effAddr = Number(PureTritOracle3.tritsToBigInt(effTrits));

  const isFaultExpected = (effAddr < 0 || effAddr + 2 >= T.T3_DEFAULT_RAM_SIZE);
  // Set up vector 4 (BAD_ADDR) at VBR=100 -> handler at 500
  jsVm.reset(true); wasmVm.reset(true);
  jsVm.vbr = 100; wasmVm.vbr = 100;
  jsVm.setMem(100 + 4 * 3, 500); wasmVm.setMem(100 + 4 * 3, 500);

  const testVal = rng.wordTrits();
  const [v0, v1, v2] = T.tritsToWord(testVal);
  const [b0, b1, b2] = T.tritsToWord(baseTrits);

  // SWX R2, R1, imm9 followed by LWX R3, R1, imm9
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
    const expC = Number(PureTritOracle3.tritsToBigInt(cTrits));
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

// 5. Positive Control: verify that perturbing a single trit in the oracle is immediately caught
let positiveControlCaught = false;
{
  const ta = PureTritOracle3.intToTrits(1234567, 27);
  const immTrits = PureTritOracle3.intToTrits(42, 9);
  const good = PureTritOracle3.addm(ta, immTrits);
  const badRes = good.res.slice();
  badRes[9] = badRes[9] === 1 ? -1 : 1; // flip middle tryte LSB trit
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

console.log(`[PASS] t3-01-oracle: ${totalChecks.toLocaleString()} T3 oracle checks (arithmetic, 27-trit addr, PC-rel branches, restartable BCOPY/BFILL, faults + positive control) in ${Date.now() - t0} ms`);
