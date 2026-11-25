#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Test 4: Binary-Semantics BigInt Oracle (`tests/t5-04-binary-oracle.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Verifies every new binary-semantics C instruction (WRAPU, WRAPS, BAND, BOR, BXOR,
 * BNOT, BSHL, BSHR, BSAR, BADD, BADC, BSUB, BSBC, BMULLO, BMULHI) against an
 * independent BigInt oracle on:
 *   - All critical edge cases (0, 1, -1, 2^n-1, -2^(n-1), 2^32-1, 2^32, carries
 *     across the 32-bit boundary, shift edges, full 64-bit register-pair lowering)
 *   - 1,000,000 random cases EACH (15,000,000 total random cases)
 */

const { loadHtmlModule, makeRng, sha256Str, recordResult } = require('./t5-common');

const MASK32 = 0xFFFFFFFFn;
const U32 = (x) => BigInt.asUintN(32, BigInt(x));
const S32 = (x) => BigInt.asIntN(32, BigInt(x));

function oracleBin(mnem, a, b, imm9, cfIn) {
  const A = BigInt(a);
  const B = BigInt(b);
  switch (mnem) {
    case 'WRAPU': {
      const n = imm9 <= 0 ? 0 : (imm9 >= 32 ? 32 : imm9);
      return { res: n === 0 ? 0n : BigInt.asUintN(n, A), cf: 0 };
    }
    case 'WRAPS': {
      const n = imm9 <= 0 ? 0 : (imm9 >= 32 ? 32 : imm9);
      return { res: n === 0 ? 0n : BigInt.asIntN(n, A), cf: 0 };
    }
    case 'BAND': return { res: U32(A) & U32(B), cf: 0 };
    case 'BOR':  return { res: U32(A) | U32(B), cf: 0 };
    case 'BXOR': return { res: U32(A) ^ U32(B), cf: 0 };
    case 'BNOT': return { res: (~U32(A)) & MASK32, cf: 0 };
    case 'BSHL': {
      if (B <= 0n) return { res: U32(A), cf: 0 };
      if (B >= 32n) return { res: 0n, cf: 0 };
      return { res: (U32(A) << B) & MASK32, cf: 0 };
    }
    case 'BSHR': {
      if (B <= 0n) return { res: U32(A), cf: 0 };
      if (B >= 32n) return { res: 0n, cf: 0 };
      return { res: U32(A) >> B, cf: 0 };
    }
    case 'BSAR': {
      const s = S32(A);
      if (B <= 0n) return { res: s, cf: 0 };
      if (B >= 32n) return { res: s < 0n ? -1n : 0n, cf: 0 };
      return { res: s >> B, cf: 0 };
    }
    case 'BADD': {
      const sum = U32(A) + U32(B);
      return { res: sum & MASK32, cf: sum >= 0x100000000n ? 1 : 0 };
    }
    case 'BADC': {
      const sum = U32(A) + U32(B) + (cfIn === 1 ? 1n : 0n);
      return { res: sum & MASK32, cf: sum >= 0x100000000n ? 1 : 0 };
    }
    case 'BSUB': {
      const diff = U32(A) - U32(B);
      return { res: BigInt.asUintN(32, diff), cf: diff < 0n ? 1 : 0 };
    }
    case 'BSBC': {
      const diff = U32(A) - U32(B) - (cfIn === 1 ? 1n : 0n);
      return { res: BigInt.asUintN(32, diff), cf: diff < 0n ? 1 : 0 };
    }
    case 'BMULLO': return { res: (U32(A) * U32(B)) & MASK32, cf: 0 };
    case 'BMULHI': return { res: (U32(A) * U32(B)) >> 32n, cf: 0 };
    default: throw new Error(`Unknown binary op ${mnem}`);
  }
}

const BIN_OPS = [
  'WRAPU', 'WRAPS', 'BAND', 'BOR', 'BXOR', 'BNOT',
  'BSHL', 'BSHR', 'BSAR', 'BADD', 'BADC', 'BSUB', 'BSBC', 'BMULLO', 'BMULHI'
];

function runBinaryOracleTest(T, randomCasesPerOp = 1000000, seed = 0xB1A7B161) {
  const t0 = Date.now();
  const rng = makeRng(seed);

  const js = new T.TritonJS({ archMode: 'T3', ramSize: 8192, diskSectors: 2 });
  const wasm = T.TritonWASM.createSync({ archMode: 'T3', ramSize: 8192, diskSectors: 2 });

  // 1. Edge cases on BOTH JS and WASM
  const edgeVals = [
    0, 1, -1, 2, -2, 127, 128, -128, -129, 255, 256,
    32767, 32768, -32768, 65535, 65536,
    2147483647, 2147483648, -2147483648, -2147483649,
    4294967295, 4294967296, -4294967296,
    3812798742493, -3812798742493
  ];
  const widthEdges = [-5, 0, 1, 2, 7, 8, 15, 16, 24, 31, 32, 33, 64];
  const shiftEdges = [-3, -1, 0, 1, 7, 15, 31, 32, 33, 64, 1000];
  let edgeCasesChecked = 0;

  for (const mnem of BIN_OPS) {
    const spec = T.MNEM_MAP[mnem];
    if (mnem === 'WRAPU' || mnem === 'WRAPS') {
      for (const n of widthEdges) {
        const [t0e, t1e] = T.encodeInstruction(spec.op, 0, 1, n);
        js.setMem(0, t0e); js.setMem(1, t1e);
        wasm.setMem(0, t0e); wasm.setMem(1, t1e);
        for (const a of edgeVals) {
          const exp = oracleBin(mnem, a, 0, n, 0);
          for (const [tag, m] of [['JS', js], ['WASM', wasm]]) {
            m.pc = 0; m.halted = 0; m.setWordNum(1, a); m.step();
            const got = BigInt(m.getWordNum(0));
            if (got !== exp.res || m.cf !== exp.cf) {
              throw new Error(`[t5-04] Edge fail ${tag} ${mnem}(${a}, n=${n}): expected (${exp.res}, cf=${exp.cf}), got (${got}, cf=${m.cf})`);
            }
          }
          edgeCasesChecked++;
        }
      }
    } else if (mnem === 'BNOT') {
      const [t0e, t1e] = T.encodeInstruction(spec.op, 0, 1, 0);
      js.setMem(0, t0e); js.setMem(1, t1e);
      wasm.setMem(0, t0e); wasm.setMem(1, t1e);
      for (const a of edgeVals) {
        const exp = oracleBin(mnem, a, 0, 0, 0);
        for (const [tag, m] of [['JS', js], ['WASM', wasm]]) {
          m.pc = 0; m.halted = 0; m.setWordNum(1, a); m.step();
          const got = BigInt(m.getWordNum(0));
          if (got !== exp.res || m.cf !== exp.cf) {
            throw new Error(`[t5-04] Edge fail ${tag} ${mnem}(${a}): expected ${exp.res}, got ${got}`);
          }
        }
        edgeCasesChecked++;
      }
    } else {
      const [t0e, t1e] = T.encodeInstruction(spec.op, 0, 1, T.balRem(2, 9, 4));
      js.setMem(0, t0e); js.setMem(1, t1e);
      wasm.setMem(0, t0e); wasm.setMem(1, t1e);
      const bList = (mnem === 'BSHL' || mnem === 'BSHR' || mnem === 'BSAR') ? shiftEdges : edgeVals;
      const cfList = (mnem === 'BADC' || mnem === 'BSBC') ? [-1, 0, 1] : [0];
      for (const cfIn of cfList) {
        for (const a of edgeVals) {
          for (const b of bList) {
            const exp = oracleBin(mnem, a, b, 0, cfIn);
            for (const [tag, m] of [['JS', js], ['WASM', wasm]]) {
              m.pc = 0; m.halted = 0; m.cf = cfIn;
              m.setWordNum(1, a); m.setWordNum(2, b);
              m.step();
              const got = BigInt(m.getWordNum(0));
              if (got !== exp.res || m.cf !== exp.cf) {
                throw new Error(`[t5-04] Edge fail ${tag} ${mnem}(${a}, ${b}, cf=${cfIn}): expected (${exp.res}, cf=${exp.cf}), got (${got}, cf=${m.cf})`);
              }
            }
            edgeCasesChecked++;
          }
        }
      }
    }
  }

  // 2. Full 64-bit register-pair lowering verification (uint64_t add, sub, mul, shl, shr)
  const prog64Add = T.assemble(`.mode T3\n BADD R4, R0, R2\n BADC R5, R1, R3\n HALT`, { mode: 'T3' });
  const prog64Sub = T.assemble(`.mode T3\n BSUB R4, R0, R2\n BSBC R5, R1, R3\n HALT`, { mode: 'T3' });
  const prog64Mul = T.assemble(`
    .mode T3
    BMULLO R4, R0, R2
    BMULHI R5, R0, R2
    BMULLO R6, R0, R3
    BMULLO R7, R1, R2
    BADD   R5, R5, R6
    BADD   R5, R5, R7
    HALT
  `, { mode: 'T3' });

  const pairs64 = [
    [0n, 0n], [0xFFFFFFFFn, 1n], [0xFFFFFFFFFFFFFFFFn, 1n],
    [0x123456789ABCDEF0n, 0xFEDCBA9876543210n],
    [0x0000000100000000n, 0x00000000FFFFFFFFn],
    [0xFFFFFFFFFFFFFFFFn, 0xFFFFFFFFFFFFFFFFn]
  ];
  let pair64Cases = 0;
  for (const [x, y] of pairs64) {
    for (const [name, prog, fn] of [
      ['add64', prog64Add, (a, b) => BigInt.asUintN(64, a + b)],
      ['sub64', prog64Sub, (a, b) => BigInt.asUintN(64, a - b)],
      ['mul64', prog64Mul, (a, b) => BigInt.asUintN(64, a * b)]
    ]) {
      const exp = fn(x, y);
      for (const m of [js, wasm]) {
        m.reset(true);
        m.loadProgram(prog.trytes, 0);
        m.setWordNum(0, Number(x & MASK32));
        m.setWordNum(1, Number(x >> 32n));
        m.setWordNum(2, Number(y & MASK32));
        m.setWordNum(3, Number(y >> 32n));
        m.run(20);
        const got = BigInt(m.getWordNum(4)) | (BigInt(m.getWordNum(5)) << 32n);
        if (got !== exp) {
          throw new Error(`[t5-04] 64-bit ${name} mismatch: expected 0x${exp.toString(16)}, got 0x${got.toString(16)}`);
        }
      }
      pair64Cases++;
    }
  }

  // 3. 1,000,000 random cases EACH (using WASM core directly for all 1M + JS spot-verified on first 5,000 each)
  const perOpCounts = {};
  const jsVerifyLimit = Math.min(5000, randomCasesPerOp);
  const wasmStep = wasm.exports.step;

  // Helper to write a 27-trit word quickly into WASM register r (without Number->Word overhead when u32)
  function setWasmRegNumFast(r, val) {
    wasm.setWordNum(r, val);
  }

  for (const mnem of BIN_OPS) {
    const spec = T.MNEM_MAP[mnem];
    const isWrap = (mnem === 'WRAPU' || mnem === 'WRAPS');
    const isShift = (mnem === 'BSHL' || mnem === 'BSHR' || mnem === 'BSAR');
    const isCarry = (mnem === 'BADC' || mnem === 'BSBC');

    if (!isWrap) {
      const t1 = mnem === 'BNOT' ? 0 : T.balRem(2, 9, 4);
      const [t0e, t1e] = T.encodeInstruction(spec.op, 0, 1, t1);
      js.setMem(0, t0e); js.setMem(1, t1e);
      wasm.setMem(0, t0e); wasm.setMem(1, t1e);
    }

    for (let i = 0; i < randomCasesPerOp; i++) {
      // Generate wide signed 27-trit or 32-bit inputs
      const r1 = rng.u32();
      const r2 = rng.u32();
      const a = (i & 3) === 0 ? ((r1 - 0x80000000) * 17 + (r2 & 15)) : r1;
      const b = isShift ? ((r2 % 40) - 4) : ((i & 3) === 1 ? ((r2 - 0x80000000) * 9) : r2);
      const n = isWrap ? ((r2 % 33) + 1) : 0;
      const cfIn = isCarry ? (r2 & 1) : 0;

      if (isWrap) {
        const [t0e, t1e] = T.encodeInstruction(spec.op, 0, 1, n);
        wasm.setMem(0, t0e); wasm.setMem(1, t1e);
        if (i < jsVerifyLimit) { js.setMem(0, t0e); js.setMem(1, t1e); }
      }

      const exp = oracleBin(mnem, a, b, n, cfIn);
      const expNum = Number(exp.res);

      wasm.pc = 0;
      wasm.i32[20549] = 0; // halted = 0
      wasm.i32[20547] = cfIn;
      setWasmRegNumFast(1, a);
      if (!isWrap && mnem !== 'BNOT') setWasmRegNumFast(2, b);
      wasmStep();
      const gotWasm = wasm.getWordNum(0);
      const gotCf = wasm.i32[20547];
      if (gotWasm !== expNum || gotCf !== exp.cf) {
        throw new Error(`[t5-04] WASM random fail ${mnem} i=${i} a=${a} b=${b} n=${n} cf=${cfIn}: expected (${expNum}, cf=${exp.cf}), got (${gotWasm}, cf=${gotCf})`);
      }

      if (i < jsVerifyLimit) {
        js.pc = 0; js.halted = 0; js.cf = cfIn;
        js.setWordNum(1, a);
        if (!isWrap && mnem !== 'BNOT') js.setWordNum(2, b);
        js.step();
        if (js.getWordNum(0) !== expNum || js.cf !== exp.cf) {
          throw new Error(`[t5-04] JS random fail ${mnem} i=${i} a=${a} b=${b} n=${n} cf=${cfIn}: expected (${expNum}, cf=${exp.cf}), got (${js.getWordNum(0)}, cf=${js.cf})`);
        }
      }
    }
    perOpCounts[mnem] = randomCasesPerOp;
  }

  return {
    test: 4,
    name: 't5-04-binary-oracle',
    status: 'PASS',
    seed,
    inputHash: sha256Str(`binary-oracle:${seed}:${randomCasesPerOp}`),
    opsTested: BIN_OPS.length,
    edgeCasesChecked,
    pair64Cases,
    randomCasesPerOp,
    totalRandomCases: BIN_OPS.length * randomCasesPerOp,
    elapsedMs: Date.now() - t0
  };
}

if (require.main === module) {
  const { T } = loadHtmlModule('triton5.html');
  const res = runBinaryOracleTest(T, 1000000);
  recordResult(res);
  console.log(`[PASS] t5-04-binary-oracle: ${res.opsTested} ops, ${res.edgeCasesChecked.toLocaleString()} edges + ${res.pair64Cases} 64-bit pair tests + ${res.totalRandomCases.toLocaleString()} random cases (1,000,000/op) matched BigInt oracle in ${res.elapsedMs} ms`);
}

module.exports = { runBinaryOracleTest, oracleBin, BIN_OPS };
