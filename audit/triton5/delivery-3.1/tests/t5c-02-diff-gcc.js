'use strict';

/**
 * Test 2: Rich Random C11 Differential Testing vs Host GCC (`tests/t5c-02-diff-gcc.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Implements Audit-3 #4 & Addendum 1 §1:
 * - Real random C11 program generator covering:
 *     Types: signed/unsigned char, short/ushort, int32_t/uint32_t, int64_t/uint64_t,
 *            pointers, 1D/2D arrays, structs (value pass/return, brace elision),
 *            unions, bit-fields (narrow signed/unsigned + unnamed).
 *     Control flow: nested if/else, for, while, do-while, switch/case, helper calls.
 *     Operators: +, -, *, safe /, safe %, &, |, ^, ~, <<, >>, comparisons, &&, ||, !, ?:, ptr arith.
 * - Host GCC pinned to `-fsigned-char -std=c11` (+ `-m32` when 32-bit multilib is available).
 * - Every generated program is verified under host GCC `-fsanitize=undefined -fno-sanitize-recover=all`;
 *   any program tripping UBSan is rejected and counted (generated, rejected, run reported).
 * - Full generator coverage (types, operators, statement kinds) is counted and reported.
 * - Runs >= 10,000 non-rejected seeded programs on GCC vs tcc5 (both TritonJS & TritonWASM).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync, fork } = require('child_process');
const { REPO_ROOT, tcc5, runExeOnBothCores, sha256Str, recordJsonl } = require('./t5c-common');

const TARGET_RUN = parseInt(process.env.T5C_DIFF_COUNT || '10000', 10);
const BATCH_SIZE = 100;

function detectGcc32(tmpDir) {
  const p = path.join(tmpDir, 'probe32.c');
  const b = path.join(tmpDir, 'probe32');
  fs.writeFileSync(p, '#include <stdio.h>\nint main(void){return 0;}\n', 'utf8');
  const r = spawnSync('gcc', ['-m32', '-fsigned-char', '-std=c11', p, '-o', b], { stdio: 'pipe' });
  return r.status === 0;
}

function makeCoverageTracker() {
  return {
    types: {
      schar: 0, uchar: 0, sshort: 0, ushort: 0, int32: 0, uint32: 0,
      int64: 0, uint64: 0, ptr: 0, arr1d: 0, arr2d: 0, struct: 0, union: 0, bitfield: 0
    },
    stmts: {
      if_else: 0, nested_if: 0, for_loop: 0, while_loop: 0, do_while: 0,
      switch_stmt: 0, fn_call: 0, ptr_deref: 0, struct_by_val: 0
    },
    ops: {
      add: 0, sub: 0, mul: 0, div: 0, mod: 0, band: 0, bor: 0, bxor: 0, bnot: 0,
      shl: 0, shr: 0, cmp: 0, ternary: 0, log_and_or: 0, bf_promo: 0
    }
  };
}

function generateRichProg(seed, cov) {
  let _s = (seed ^ 0x9E3779B9) >>> 0;
  if (_s === 0) _s = 1;
  const rng = () => { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; return _s >>> 0; };
  const ri = (lo, hi) => lo + (rng() % (hi - lo + 1));

  const sc0 = ri(-100, 100);
  const uc0 = ri(0, 255);
  const ss0 = ri(-2000, 2000);
  const us0 = ri(0, 65535);
  const u0 = rng();
  const u1 = rng();
  const u2 = rng();
  const bfA = ri(-4, 3);
  const bfU = ri(1, 63);
  const bfB = ri(0, 7);
  const bfC = ri(0, 15);
  const arrInit = [ri(0, 999), ri(0, 999), ri(0, 999), ri(0, 999)];
  const m0 = ri(-50, 50), m1 = ri(-50, 50), m2 = ri(-50, 50), m3 = ri(-50, 50);

  cov.types.schar++; cov.types.uchar++; cov.types.sshort++; cov.types.ushort++;
  cov.types.int32++; cov.types.uint32++; cov.types.int64++; cov.types.uint64++;
  cov.types.ptr++; cov.types.arr1d++; cov.types.arr2d++; cov.types.struct++;
  cov.types.union++; cov.types.bitfield++;

  const lines = [];
  lines.push(`static uint32_t prog_${seed}(void) {`);
  lines.push(`  signed char sc = (signed char)${sc0};`);
  lines.push(`  unsigned char uc = (unsigned char)${uc0};`);
  lines.push(`  short ss = (short)${ss0};`);
  lines.push(`  unsigned short us = (unsigned short)${us0};`);
  lines.push(`  uint32_t a = ${u0}U, b = ${u1}U, c = ${u2}U;`);
  lines.push(`  uint64_t x64 = ((uint64_t)${rng()}U << 32) | (uint64_t)${rng()}U;`);
  lines.push(`  int64_t s64 = (int64_t)(x64 & 0x0000FFFFFFFFFFFFULL) - 1000000LL;`);
  /* Brace-elided struct + 2D array + union + bit-fields (with unnamed bit-field) */
  lines.push(`  struct RichS rs = { sc, ${arrInit[0]}, ${arrInit[1]}, { ${bfA}, ${bfU}, ${bfB}, ${bfC} } };`);
  lines.push(`  union RichU ru; ru.u = a ^ b;`);
  lines.push(`  int32_t mat[2][2] = { { ${m0}, ${m1} }, { ${m2}, ${m3} } };`);
  lines.push(`  int32_t arr[4] = { ${arrInit[0]}, ${arrInit[1]}, ${arrInit[2]}, ${arrInit[3]} };`);
  lines.push(`  int32_t *p = &arr[0];`);

  /* Char/short & bit-field integer promotion (C11 6.3.1.1p2) */
  lines.push(`  int32_t promo = (int32_t)sc + (int32_t)uc - (int32_t)ss + (int32_t)us;`);
  lines.push(`  int32_t bfp = (promo % (int32_t)(rs.bf.u ? rs.bf.u : 1)) + ((rs.bf.b > -1) ? 11 : 0);`);
  cov.ops.mod++; cov.ops.cmp++; cov.ops.ternary++; cov.ops.bf_promo++;

  /* Pass struct by value & pointer to helper function */
  lines.push(`  rs = rich_mix(rs, p, (int32_t)(ru.bytes[0] + ru.bytes[3]));`);
  cov.stmts.fn_call++; cov.stmts.struct_by_val++; cov.stmts.ptr_deref++;

  /* Generate 5 varied random statements covering nested control flow & ops */
  for (let k = 0; k < 3; k++) {
    const sk = ri(0, 7);
    if (sk === 0) {
      /* Nested if/else with && and || */
      const thr = ri(1, 200);
      lines.push(`  if (((a & 255U) > ${thr}U) && (b != 0U)) { if (mat[0][1] < mat[1][0]) { a += (uint32_t)p[1]; } else { b ^= (uint32_t)rs.f2[1]; } } else if ((c & 1U) || (uc > 128U)) { c = (c - a) ^ (uint32_t)bfp; }`);
      cov.stmts.if_else++; cov.stmts.nested_if++; cov.stmts.ptr_deref++;
      cov.ops.cmp++; cov.ops.log_and_or++; cov.ops.add++; cov.ops.sub++; cov.ops.bxor++; cov.ops.band++;
    } else if (sk === 1) {
      /* Pointer walk + dereference */
      const off = ri(0, 2);
      lines.push(`  { int32_t *q = p + ${off}; *q = (int32_t)((uint32_t)(*q) + (a & 0xFFFFU)); a ^= (uint32_t)(*(q + 1)); }`);
      cov.stmts.ptr_deref++; cov.ops.add++; cov.ops.bxor++; cov.ops.band++;
    } else if (sk === 2) {
      /* While loop */
      const lim = ri(1, 3);
      lines.push(`  { uint32_t w = 0U; while (w < ${lim}U) { a = (a ^ (b >> ${ri(1, 15)}U)) + (uint32_t)mat[w & 1U][(w >> 1) & 1U]; b = (b << ${ri(1, 7)}U) | (b >> ${ri(1, 7)}U); w++; } }`);
      cov.stmts.while_loop++; cov.ops.shr++; cov.ops.shl++; cov.ops.bor++; cov.ops.bxor++; cov.ops.add++;
    } else if (sk === 3) {
      /* Do-while loop */
      const lim = ri(1, 3);
      lines.push(`  { int32_t d = 0; do { x64 = (x64 + (uint64_t)(a & 0xFFFFU)) ^ ((uint64_t)(b & 0xFFFFU) << ${ri(1, 24)}); d++; } while (d < ${lim}); }`);
      cov.stmts.do_while++; cov.ops.add++; cov.ops.bxor++; cov.ops.shl++;
    } else if (sk === 4) {
      /* Switch with fallthrough */
      lines.push(`  switch (c & 3U) { case 0: a += safe_udiv(b, c); break; case 1: b ^= safe_umod(a, c); case 2: c = ~c + (uint32_t)rs.bf.c; break; default: a = (a < b) ? (b - a) : (a - b); break; }`);
      cov.stmts.switch_stmt++; cov.ops.div++; cov.ops.mod++; cov.ops.bnot++; cov.ops.ternary++; cov.ops.sub++; cov.ops.cmp++;
    } else if (sk === 5) {
      /* 64-bit arithmetic & signed safe div */
      lines.push(`  s64 = (s64 * ${ri(3, 17)}LL) + (int64_t)safe_sdiv((int32_t)(a & 0xFFFFU) - 32768, (int32_t)(b & 255U) - 128); a ^= (uint32_t)(x64 >> 32) ^ (uint32_t)s64;`);
      cov.ops.div++; cov.ops.add++; cov.ops.sub++; cov.ops.bxor++; cov.ops.shr++;
    } else if (sk === 6) {
      /* For loop over 2D array + union byte read */
      lines.push(`  for (int i = 0; i < 2; i++) { for (int j = 0; j < 2; j++) { mat[i][j] = (int32_t)((uint32_t)mat[i][j] + (uint32_t)ru.bytes[(i * 2 + j) & 3]); } }`);
      cov.stmts.for_loop++; cov.ops.add++;
    } else {
      /* Multiply + bitwise + logical ! */
      lines.push(`  a = (a * 1664525U + 1013904223U) ^ (uint32_t)(!bfp); b = (b & ~c) | (a & c);`);
      cov.ops.mul++; cov.ops.add++; cov.ops.bxor++; cov.ops.band++; cov.ops.bor++; cov.ops.bnot++; cov.ops.log_and_or++;
    }
  }

  /* FNV-1a checksum of all state */
  lines.push(`  uint32_t h = 2166136261U;`);
  lines.push(`  h = (h ^ a) * 16777619U; h = (h ^ b) * 16777619U; h = (h ^ c) * 16777619U;`);
  lines.push(`  h = (h ^ (uint32_t)bfp) * 16777619U;`);
  lines.push(`  h = (h ^ (uint32_t)rs.f1 ^ (uint32_t)rs.f2[0] ^ (uint32_t)rs.f2[1]) * 16777619U;`);
  lines.push(`  h = (h ^ (uint32_t)rs.bf.a ^ (uint32_t)rs.bf.u ^ (uint32_t)rs.bf.b ^ (uint32_t)rs.bf.c) * 16777619U;`);
  lines.push(`  h = (h ^ (uint32_t)arr[0] ^ (uint32_t)arr[1] ^ (uint32_t)arr[2] ^ (uint32_t)arr[3]) * 16777619U;`);
  lines.push(`  h = (h ^ (uint32_t)mat[0][0] ^ (uint32_t)mat[1][1]) * 16777619U;`);
  lines.push(`  h = (h ^ (uint32_t)x64 ^ (uint32_t)(x64 >> 32) ^ (uint32_t)s64) * 16777619U;`);
  lines.push(`  return h;`);
  lines.push(`}`);
  return lines.join('\n');
}

function buildBatchSource(seeds, forHostGcc, cov) {
  const header = forHostGcc
    ? `#include <stdio.h>\n#include <stdint.h>\nstatic void out_hex(uint32_t v) { printf("%08x\\n", v); }\n`
    : `#include <triton5.h>\n#include <stdint.h>\nstatic void out_hex(uint32_t v) { t5_puthex32(v); t5_putchar('\\n'); }\n`;

  const helpers = `
struct RichBF { signed int a : 4; unsigned int u : 6; int : 2; unsigned int b : 3; unsigned int c : 4; };
struct RichS { signed char f1; int32_t f2[2]; struct RichBF bf; };
union RichU { uint32_t u; unsigned char bytes[4]; };

static uint32_t safe_udiv(uint32_t a, uint32_t b) { return b == 0U ? a : (a / b); }
static uint32_t safe_umod(uint32_t a, uint32_t b) { return b == 0U ? a : (a % b); }
static int32_t safe_sdiv(int32_t a, int32_t b) {
  if (b == 0 || (a == (-2147483647 - 1) && b == -1)) return a;
  return a / b;
}
static struct RichS rich_mix(struct RichS s, int32_t *p, int32_t k) {
  s.f2[0] = (int32_t)((uint32_t)s.f2[0] + (uint32_t)k);
  s.f2[1] = (int32_t)((uint32_t)s.f2[1] ^ (uint32_t)p[0]);
  p[0] = (int32_t)((uint32_t)p[0] + (uint32_t)s.bf.u);
  return s;
}
`;

  const progs = [];
  const calls = [];
  for (const seed of seeds) {
    progs.push(generateRichProg(seed, cov));
    calls.push(`  out_hex(prog_${seed}());`);
  }
  return `${header}\n${helpers}\n${progs.join('\n')}\nint main(void) {\n${calls.join('\n')}\n  return 0;\n}\n`;
}

function run() {
  const tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.tmp-t5c-diff-'));
  const hasM32 = detectGcc32(tmpDir);
  const hostFlags = hasM32
    ? ['-O1', '-m32', '-fsigned-char', '-std=c11', '-w']
    : ['-O1', '-fsigned-char', '-std=c11', '-w'];
  const ubsanFlags = hasM32
    ? ['-O0', '-m32', '-fsigned-char', '-std=c11', '-fsanitize=undefined', '-fno-sanitize-recover=all', '-w']
    : ['-O0', '-fsigned-char', '-std=c11', '-fsanitize=undefined', '-fno-sanitize-recover=all', '-w'];

  console.log(`Host GCC flags: ${hostFlags.join(' ')} (32-bit multilib available=${hasM32}; UBSan active)`);

  const cov = makeCoverageTracker();
  const dummyCov = makeCoverageTracker();
  let generated = 0;
  let rejectedUbsan = 0;
  let runCount = 0;
  let matched = 0;
  let lockstepBatches = 0;
  let batchIdx = 0;
  let nextSeed = parseInt(process.env.T5C_DIFF_START_SEED || '1', 10);
  let totalCompileMs = 0, totalGccMs = 0, totalWasmMs = 0, totalJsMs = 0, totalWasmSteps = 0;
  const tStart = Date.now();

  try {
    while (runCount < TARGET_RUN) {
      const need = Math.min(BATCH_SIZE, TARGET_RUN - runCount);
      const seeds = [];
      for (let i = 0; i < need; i++) seeds.push(nextSeed++);
      generated += seeds.length;

      // 1. Check batch under host GCC + UBSan (-fsanitize=undefined -fno-sanitize-recover=all)
      const ubSrc = buildBatchSource(seeds, true, dummyCov);
      const ubC = path.join(tmpDir, `ub_${batchIdx}.c`);
      const ubBin = path.join(tmpDir, `ub_${batchIdx}`);
      fs.writeFileSync(ubC, ubSrc, 'utf8');
      const tg0 = Date.now();
      execFileSync('gcc', [...ubsanFlags, ubC, '-o', ubBin]);
      const ubRun = spawnSync(ubBin, { encoding: 'utf8' });
      totalGccMs += Date.now() - tg0;

      let acceptedSeeds = seeds;
      let gccOut = ubRun.stdout;
      if (ubRun.status !== 0) {
        // Isolate & reject individual UBSan-tripping seeds
        acceptedSeeds = [];
        const linesOut = [];
        for (const s of seeds) {
          const singleSrc = buildBatchSource([s], true, dummyCov);
          const sc = path.join(tmpDir, `s_${s}.c`);
          const sb = path.join(tmpDir, `s_${s}`);
          fs.writeFileSync(sc, singleSrc, 'utf8');
          execFileSync('gcc', [...ubsanFlags, sc, '-o', sb]);
          const sr = spawnSync(sb, { encoding: 'utf8' });
          if (sr.status !== 0) {
            rejectedUbsan++;
          } else {
            acceptedSeeds.push(s);
            linesOut.push(sr.stdout.trim());
          }
        }
        gccOut = linesOut.join('\n') + '\n';
        if (acceptedSeeds.length === 0) { batchIdx++; continue; }
      }

      // 2. Compile accepted seeds with tcc5 and run on BOTH TritonWASM & TritonJS
      const t5Src = buildBatchSource(acceptedSeeds, false, cov);
      const tc0 = Date.now();
      const exe = tcc5.compileAndLink([{ source: t5Src, filename: `diff_b${batchIdx}.c` }]);
      totalCompileMs += Date.now() - tc0;

      const res = runExeOnBothCores(exe, 50000000, true);
      totalWasmMs += res.wasmMs;
      totalJsMs += res.jsMs;
      totalWasmSteps += res.wasmSteps;
      if (res.lockstepOk) lockstepBatches++;

      const gccLines = gccOut.trim().split('\n');
      const t5Lines = res.consoleOut.trim().split('\n');
      if (gccLines.length !== acceptedSeeds.length || t5Lines.length !== acceptedSeeds.length || !res.lockstepOk) {
        console.error(`FAIL batch ${batchIdx}: gccLines=${gccLines.length} t5Lines=${t5Lines.length} lockstep=${res.lockstepOk}`);
        process.exit(1);
      }
      for (let i = 0; i < acceptedSeeds.length; i++) {
        if (gccLines[i] !== t5Lines[i]) {
          console.error(`MISMATCH seed ${acceptedSeeds[i]}: GCC=${gccLines[i]} vs tcc5=${t5Lines[i]}`);
          process.exit(1);
        }
        matched++;
      }
      runCount += acceptedSeeds.length;
      batchIdx++;
      if (batchIdx % 20 === 0 || runCount >= TARGET_RUN) {
        console.log(`Differential progress: run=${runCount}/${TARGET_RUN}, generated=${generated}, rejected_ubsan=${rejectedUbsan}, matched=${matched}, JS===WASM=${lockstepBatches}/${batchIdx} (${((Date.now() - tStart) / 1000).toFixed(1)}s)`);
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const allOk = matched === TARGET_RUN && lockstepBatches === batchIdx;
  console.log('Generator coverage:', JSON.stringify(cov));
  const entry = {
    testId: 't5c-02',
    name: 'Rich Random C11 Differential vs Host GCC (UBSan Filtered)',
    pass: allOk,
    inputSha256: sha256Str(`rich-diff-v31-target${TARGET_RUN}`),
    hostGccFlags: ubsanFlags.join(' '),
    hostHasM32: hasM32,
    generated,
    rejectedUbsan,
    run: runCount,
    matched,
    batches: batchIdx,
    jsWasmEqual: lockstepBatches === batchIdx,
    coverage: cov,
    compileMs: totalCompileMs,
    gccMs: totalGccMs,
    wasmMs: totalWasmMs,
    jsMs: totalJsMs,
    totalSteps: totalWasmSteps
  };
  if (process.env.T5C_DIFF_WORKER_OUT) fs.writeFileSync(process.env.T5C_DIFF_WORKER_OUT, JSON.stringify(entry), 'utf8');
  else recordJsonl(entry);
  console.log(`PASS t5c-02 Differential: generated=${generated}, rejected_ubsan=${rejectedUbsan}, run=${runCount}, matched=${matched}/${TARGET_RUN}, JS===WASM=${lockstepBatches === batchIdx}`);
}


async function runParallel() {
  const half1 = Math.floor(TARGET_RUN / 2);
  const half2 = TARGET_RUN - half1;
  const tmpOut1 = path.join(REPO_ROOT, '.tmp-diff-w1.json');
  const tmpOut2 = path.join(REPO_ROOT, '.tmp-diff-w2.json');
  const spawnW = (count, startSeed, outPath) => new Promise((resolve, reject) => {
    const child = fork(__filename, [], {
      env: Object.assign({}, process.env, {
        T5C_DIFF_WORKER: '1',
        T5C_WRITE_JSONL: '0',
        T5C_DIFF_COUNT: String(count),
        T5C_DIFF_START_SEED: String(startSeed),
        T5C_DIFF_WORKER_OUT: outPath
      }),
      stdio: 'inherit'
    });
    child.on('exit', code => code === 0 ? resolve() : reject(new Error('Worker failed with code ' + code)));
  });
  const t0 = Date.now();
  await Promise.all([
    spawnW(half1, 1, tmpOut1),
    spawnW(half2, half1 + 1, tmpOut2)
  ]);
  const r1 = JSON.parse(fs.readFileSync(tmpOut1, 'utf8'));
  const r2 = JSON.parse(fs.readFileSync(tmpOut2, 'utf8'));
  fs.rmSync(tmpOut1, { force: true });
  fs.rmSync(tmpOut2, { force: true });

  const cov = makeCoverageTracker();
  for (const grp of ['types', 'stmts', 'ops']) {
    for (const k of Object.keys(cov[grp])) {
      cov[grp][k] = r1.coverage[grp][k] + r2.coverage[grp][k];
    }
  }
  const merged = {
    testId: 't5c-02',
    name: 'Rich Random C11 Differential vs Host GCC (UBSan Filtered)',
    pass: r1.pass && r2.pass,
    inputSha256: sha256Str(`rich-diff-v31-target${TARGET_RUN}`),
    hostGccFlags: r1.hostGccFlags,
    hostHasM32: r1.hostHasM32,
    generated: r1.generated + r2.generated,
    rejectedUbsan: r1.rejectedUbsan + r2.rejectedUbsan,
    run: r1.run + r2.run,
    matched: r1.matched + r2.matched,
    batches: r1.batches + r2.batches,
    jsWasmEqual: r1.jsWasmEqual && r2.jsWasmEqual,
    coverage: cov,
    compileMs: r1.compileMs + r2.compileMs,
    gccMs: r1.gccMs + r2.gccMs,
    wasmMs: r1.wasmMs + r2.wasmMs,
    jsMs: r1.jsMs + r2.jsMs,
    wallMs: Date.now() - t0,
    totalSteps: r1.totalSteps + r2.totalSteps
  };
  recordJsonl(merged);
  console.log('Merged Generator Coverage:', JSON.stringify(cov));
  console.log(`PASS t5c-02 Differential (2 workers, ${(merged.wallMs/1000).toFixed(1)}s): generated=${merged.generated}, rejected_ubsan=${merged.rejectedUbsan}, run=${merged.run}, matched=${merged.matched}/${TARGET_RUN}, JS===WASM=${merged.jsWasmEqual}`);
  if (!merged.pass) process.exit(1);
}

if (require.main === module) {
  if (process.env.T5C_DIFF_WORKER !== '1' && TARGET_RUN >= 2000) {
    runParallel().catch(e => { console.error(e); process.exit(1); });
  } else {
    run();
  }
}
module.exports = { run, generateRichProg, buildBatchSource };
