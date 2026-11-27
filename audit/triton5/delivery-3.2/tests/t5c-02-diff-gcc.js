'use strict';

/**
 * Test 2: Rich Random C11 Differential Testing vs Host GCC (`tests/t5c-02-diff-gcc.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Implements Audit-3 #4, Addendum 1 §1, and Audit-3.1 #4:
 * - Wide random C11 generator with optional per-program feature selection (pointers,
 *   1D/2D arrays, structs with brace elision, unions, narrow/unnamed bit-fields,
 *   char/short promotions, int32/uint32/int64/uint64, compound literals, va_arg
 *   with 3-byte & 5-byte structs, 12 statement/control-flow grammar productions).
 * - Coverage is measured strictly by counting features actually emitted into each
 *   accepted program's C source (never incremented unconditionally).
 * - Host GCC pinned to `-fsigned-char -std=c11` (+ `-m32` when available), with
 *   `-fsanitize=undefined -fno-sanitize-recover=all` checking every program.
 * - Runs >= 10,000 non-rejected seeded programs on GCC vs tcc5 (both JS & WASM).
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
      switch_stmt: 0, fn_call: 0, ptr_deref: 0, struct_by_val: 0,
      compound_lit: 0, va_struct_call: 0, recursive_call: 0
    },
    ops: {
      add: 0, sub: 0, mul: 0, div: 0, mod: 0, band: 0, bor: 0, bxor: 0, bnot: 0,
      shl: 0, shr: 0, cmp: 0, ternary: 0, log_and_or: 0, bf_promo: 0
    }
  };
}

// Measure coverage strictly from the emitted C source of a single generated function
function countEmittedCoverage(src, cov) {
  const countRe = (re) => (src.match(re) || []).length;
  cov.types.schar    += countRe(/\bsigned char\b/g);
  cov.types.uchar    += countRe(/\bunsigned char\b/g);
  cov.types.sshort   += countRe(/\bshort\b/g);
  cov.types.ushort   += countRe(/\bunsigned short\b/g);
  cov.types.int32    += countRe(/\bint32_t\b/g);
  cov.types.uint32   += countRe(/\buint32_t\b/g);
  cov.types.int64    += countRe(/\bint64_t\b/g);
  cov.types.uint64   += countRe(/\buint64_t\b/g);
  cov.types.ptr      += countRe(/\bint32_t\s*\*/g);
  cov.types.arr1d    += countRe(/\barr\[4\]/g);
  cov.types.arr2d    += countRe(/\bmat\[2\]\[2\]/g);
  cov.types.struct   += countRe(/\bstruct\s+RichS\b/g);
  cov.types.union    += countRe(/\bunion\s+RichU\b/g);
  cov.types.bitfield += countRe(/\.bf\./g);

  cov.stmts.if_else        += countRe(/\bif\s*\(/g);
  cov.stmts.nested_if      += countRe(/\{\s*if\s*\(/g);
  cov.stmts.for_loop       += countRe(/\bfor\s*\(/g);
  cov.stmts.while_loop     += countRe(/\bwhile\s*\(/g);
  cov.stmts.do_while       += countRe(/\bdo\s*\{/g);
  cov.stmts.switch_stmt    += countRe(/\bswitch\s*\(/g);
  cov.stmts.fn_call        += countRe(/\b(rich_mix|safe_udiv|safe_umod|safe_sdiv|rec_fold|va_mix_s)\s*\(/g);
  cov.stmts.ptr_deref      += countRe(/(\*q|\*\(q\s*\+\s*1\)|p\[)/g);
  cov.stmts.struct_by_val  += countRe(/\brich_mix\s*\(/g);
  cov.stmts.compound_lit   += countRe(/\(struct\s+S3\)\{/g);
  cov.stmts.va_struct_call += countRe(/\bva_mix_s\s*\(/g);
  cov.stmts.recursive_call += countRe(/\brec_fold\s*\(/g);

  cov.ops.add        += countRe(/\s\+\s|\+=/g);
  cov.ops.sub        += countRe(/\s-\s|-=/g);
  cov.ops.mul        += countRe(/\s\*\s/g);
  cov.ops.div        += countRe(/\bsafe_[su]div\(/g);
  cov.ops.mod        += countRe(/(\s%\s|\bsafe_umod\()/g);
  cov.ops.band       += countRe(/\s&\s/g);
  cov.ops.bor        += countRe(/\s\|\s/g);
  cov.ops.bxor       += countRe(/\s\^\s|\^=/g);
  cov.ops.bnot       += countRe(/~/g);
  cov.ops.shl        += countRe(/<</g);
  cov.ops.shr        += countRe(/>>/g);
  cov.ops.cmp        += countRe(/(==|!=|<=|>=|\s<\s|\s>\s)/g);
  cov.ops.ternary    += countRe(/\?/g);
  cov.ops.log_and_or += countRe(/(&&|\|\||!bfp)/g);
  cov.ops.bf_promo   += countRe(/rs\.bf\.b\s*>\s*-1/g);
}

function generateRichProg(seed) {
  let _s = (seed ^ 0x9E3779B9) >>> 0;
  if (_s === 0) _s = 1;
  const rng = () => { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; return _s >>> 0; };
  const ri = (lo, hi) => lo + (rng() % (hi - lo + 1));
  const coin = (pPct) => (rng() % 100) < pPct;

  // Randomly choose which optional type families are instantiated in this program
  const useShort = coin(75);
  const use64    = coin(75);
  const useUnion = coin(70);
  const use2D    = coin(70);
  const usePtr   = coin(80);

  const lines = [];
  lines.push(`static uint32_t prog_${seed}(void) {`);
  lines.push(`  signed char sc = (signed char)${ri(-100, 100)};`);
  lines.push(`  unsigned char uc = (unsigned char)${ri(0, 255)};`);
  if (useShort) {
    lines.push(`  short ss = (short)${ri(-2000, 2000)};`);
    lines.push(`  unsigned short us = (unsigned short)${ri(0, 65535)};`);
  }
  lines.push(`  uint32_t a = ${rng()}U, b = ${rng()}U, c = ${rng()}U;`);
  if (use64) {
    lines.push(`  uint64_t x64 = ((uint64_t)${rng()}U << 32) | (uint64_t)${rng()}U;`);
    lines.push(`  int64_t s64 = (int64_t)(x64 & 0x0000FFFFFFFFFFFFULL) - 1000000LL;`);
  }
  const a0 = ri(0, 999), a1 = ri(0, 999), a2 = ri(0, 999), a3 = ri(0, 999);
  lines.push(`  struct RichS rs = { sc, ${a0}, ${a1}, { ${ri(-4, 3)}, ${ri(1, 63)}, ${ri(0, 7)}, ${ri(0, 15)} } };`);
  if (useUnion) lines.push(`  union RichU ru; ru.u = a ^ b;`);
  if (use2D) lines.push(`  int32_t mat[2][2] = { { ${ri(-50, 50)}, ${ri(-50, 50)} }, { ${ri(-50, 50)}, ${ri(-50, 50)} } };`);
  lines.push(`  int32_t arr[4] = { ${a0}, ${a1}, ${a2}, ${a3} };`);
  if (usePtr) lines.push(`  int32_t *p = &arr[0];`);

  const promoExpr = useShort
    ? `(int32_t)sc + (int32_t)uc - (int32_t)ss + (int32_t)us`
    : `(int32_t)sc + (int32_t)uc`;
  lines.push(`  int32_t promo = ${promoExpr};`);
  lines.push(`  int32_t bfp = (promo % (int32_t)(rs.bf.u ? rs.bf.u : 1)) + ((rs.bf.b > -1) ? 11 : 0);`);
  if (usePtr) {
    const kExpr = useUnion ? `(int32_t)(ru.bytes[0] + ru.bytes[3])` : `(int32_t)(a & 255U)`;
    lines.push(`  rs = rich_mix(rs, p, ${kExpr});`);
  }

  // Pick 3 random statements from a widened 12-production grammar
  for (let k = 0; k < 3; k++) {
    const sk = ri(0, 11);
    if (sk === 0) {
      const thr = ri(1, 200);
      const inner = use2D ? `mat[0][1] < mat[1][0]` : `arr[0] < arr[2]`;
      const br1 = usePtr ? `a += (uint32_t)p[1];` : `a += (uint32_t)arr[1];`;
      lines.push(`  if (((a & 255U) > ${thr}U) && (b != 0U)) { if (${inner}) { ${br1} } else { b ^= (uint32_t)rs.f2[1]; } } else if ((c & 1U) || (uc > 128U)) { c = (c - a) ^ (uint32_t)bfp; }`);
    } else if (sk === 1 && usePtr) {
      const off = ri(0, 2);
      lines.push(`  { int32_t *q = p + ${off}; *q = (int32_t)((uint32_t)(*q) + (a & 0xFFFFU)); a ^= (uint32_t)(*(q + 1)); }`);
    } else if (sk === 2) {
      const lim = ri(1, 3);
      const elem = use2D ? `(uint32_t)mat[w & 1U][(w >> 1) & 1U]` : `(uint32_t)arr[w & 3U]`;
      lines.push(`  { uint32_t w = 0U; while (w < ${lim}U) { a = (a ^ (b >> ${ri(1, 15)}U)) + ${elem}; b = (b << ${ri(1, 7)}U) | (b >> ${ri(1, 7)}U); w++; } }`);
    } else if (sk === 3 && use64) {
      const lim = ri(1, 3);
      lines.push(`  { int32_t d = 0; do { x64 = (x64 + (uint64_t)(a & 0xFFFFU)) ^ ((uint64_t)(b & 0xFFFFU) << ${ri(1, 24)}); d++; } while (d < ${lim}); }`);
    } else if (sk === 4) {
      lines.push(`  switch (c & 3U) { case 0: a += safe_udiv(b, c); break; case 1: b ^= safe_umod(a, c); case 2: c = ~c + (uint32_t)rs.bf.c; break; default: a = (a < b) ? (b - a) : (a - b); break; }`);
    } else if (sk === 5 && use64) {
      lines.push(`  s64 = (s64 * ${ri(3, 17)}LL) + (int64_t)safe_sdiv((int32_t)(a & 0xFFFFU) - 32768, (int32_t)(b & 255U) - 128); a ^= (uint32_t)(x64 >> 32) ^ (uint32_t)s64;`);
    } else if (sk === 6 && use2D) {
      const addend = useUnion ? `(uint32_t)ru.bytes[(i * 2 + j) & 3]` : `(uint32_t)arr[(i * 2 + j) & 3]`;
      lines.push(`  for (int i = 0; i < 2; i++) { for (int j = 0; j < 2; j++) { mat[i][j] = (int32_t)((uint32_t)mat[i][j] + ${addend}); } }`);
    } else if (sk === 7) {
      lines.push(`  a = (a * 1664525U + 1013904223U) ^ (uint32_t)(!bfp); b = (b & ~c) | (a & c);`);
    } else if (sk === 8) {
      /* va_arg with 3-byte & 5-byte structs + compound literal! */
      lines.push(`  { struct S3 t3 = (struct S3){ (char)(a & 63U), (char)(b & 63U), (char)(c & 63U) }; struct S5 t5 = { 1, 2, 3, (char)(uc & 31U), (char)(sc & 31) }; a ^= (uint32_t)va_mix_s(${ri(1, 9)}, t3, t5, (int32_t)(c & 255U)); }`);
    } else if (sk === 9) {
      /* Recursive helper call */
      lines.push(`  b ^= rec_fold(${ri(2, 5)}, a ^ c);`);
    } else if (sk === 10) {
      /* Signed arithmetic right shift & ternary chain */
      lines.push(`  { int32_t sv = (int32_t)(a & 0xFFFFU) - 32768; c = (sv < 0) ? (uint32_t)(sv >> ${ri(1, 7)}) : ((uint32_t)sv << ${ri(1, 7)}U); }`);
    } else {
      /* Bit-field read-modify-write & unsigned wrap */
      lines.push(`  rs.bf.a = (signed int)(((int32_t)rs.bf.a + ${ri(-3, 3)}) & 7) - 4; rs.bf.c = (unsigned int)((rs.bf.c + (a & 7U)) & 15U); a = a + (uint32_t)rs.bf.c;`);
    }
  }

  /* FNV-1a checksum of live state */
  lines.push(`  uint32_t h = 2166136261U;`);
  lines.push(`  h = (h ^ a) * 16777619U; h = (h ^ b) * 16777619U; h = (h ^ c) * 16777619U;`);
  lines.push(`  h = (h ^ (uint32_t)bfp) * 16777619U;`);
  lines.push(`  h = (h ^ (uint32_t)rs.f1 ^ (uint32_t)rs.f2[0] ^ (uint32_t)rs.f2[1]) * 16777619U;`);
  lines.push(`  h = (h ^ (uint32_t)rs.bf.a ^ (uint32_t)rs.bf.u ^ (uint32_t)rs.bf.b ^ (uint32_t)rs.bf.c) * 16777619U;`);
  lines.push(`  h = (h ^ (uint32_t)arr[0] ^ (uint32_t)arr[1] ^ (uint32_t)arr[2] ^ (uint32_t)arr[3]) * 16777619U;`);
  if (use2D) lines.push(`  h = (h ^ (uint32_t)mat[0][0] ^ (uint32_t)mat[1][1]) * 16777619U;`);
  if (use64) lines.push(`  h = (h ^ (uint32_t)x64 ^ (uint32_t)(x64 >> 32) ^ (uint32_t)s64) * 16777619U;`);
  lines.push(`  return h;`);
  lines.push(`}`);
  return lines.join('\n');
}

function buildBatchSource(seeds, forHostGcc, cov) {
  const header = forHostGcc
    ? `#include <stdio.h>\n#include <stdint.h>\n#include <stdarg.h>\nstatic void out_hex(uint32_t v) { printf("%08x\\n", v); }\n`
    : `#include <triton5.h>\n#include <stdint.h>\n#include <stdarg.h>\nstatic void out_hex(uint32_t v) { t5_puthex32(v); t5_putchar('\\n'); }\n`;

  const helpers = `
struct S3 { char a; char b; char c; };
struct S5 { char a; char b; char c; char d; char e; };
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
static uint32_t rec_fold(int n, uint32_t v) {
  if (n <= 0) return v;
  return rec_fold(n - 1, (v * 1103515245U + 12345U) ^ (v >> 7));
}
static int32_t va_mix_s(int tag, ...) {
  va_list ap;
  va_start(ap, tag);
  struct S3 s3 = va_arg(ap, struct S3);
  struct S5 s5 = va_arg(ap, struct S5);
  int32_t tail = va_arg(ap, int32_t);
  va_end(ap);
  return tag + s3.a + s3.b + s3.c + s5.a + s5.b + s5.c + s5.d + s5.e + tail;
}
`;

  const progs = [];
  const calls = [];
  for (const seed of seeds) {
    const pSrc = generateRichProg(seed);
    if (cov) countEmittedCoverage(pSrc, cov);
    progs.push(pSrc);
    calls.push(`  out_hex(prog_${seed}());`);
  }
  return `${header}\n${helpers}\n${progs.join('\n')}\nint main(void) {\n${calls.join('\n')}\n  return 0;\n}\n`;
}

function run() {
  const tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.tmp-t5c-diff-'));
  const hasM32 = detectGcc32(tmpDir);
  const ubsanFlags = hasM32
    ? ['-O0', '-m32', '-fsigned-char', '-std=c11', '-fsanitize=undefined', '-fno-sanitize-recover=all', '-w']
    : ['-O0', '-fsigned-char', '-std=c11', '-fsanitize=undefined', '-fno-sanitize-recover=all', '-w'];

  console.log(`Host GCC flags: ${ubsanFlags.join(' ')} (32-bit multilib available=${hasM32}; UBSan active)`);

  const cov = makeCoverageTracker();
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

      // 1. Check batch under host GCC + UBSan
      const ubSrc = buildBatchSource(seeds, true, null);
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
        acceptedSeeds = [];
        const linesOut = [];
        for (const s of seeds) {
          const singleSrc = buildBatchSource([s], true, null);
          const sc = path.join(tmpDir, `s_${s}.c`);
          const sb = path.join(tmpDir, `s_${s}`);
          fs.writeFileSync(sc, singleSrc, 'utf8');
          execFileSync('gcc', [...ubsanFlags, sc, '-o', sb]);
          const sr = spawnSync(sb, { encoding: 'utf8' });
          if (sr.status !== 0) rejectedUbsan++;
          else { acceptedSeeds.push(s); linesOut.push(sr.stdout.trim()); }
        }
        gccOut = linesOut.join('\n') + '\n';
        if (acceptedSeeds.length === 0) { batchIdx++; continue; }
      }

      // 2. Compile accepted seeds with tcc5 (counting coverage strictly from emitted C) & run on JS + WASM
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
  const entry = {
    testId: 't5c-02',
    name: 'Rich Random C11 Differential vs Host GCC (UBSan Filtered, Emitted Coverage)',
    pass: allOk,
    inputSha256: sha256Str(`rich-diff-v32-target${TARGET_RUN}`),
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
    name: 'Rich Random C11 Differential vs Host GCC (UBSan Filtered, Emitted Coverage)',
    pass: r1.pass && r2.pass,
    inputSha256: sha256Str(`rich-diff-v32-target${TARGET_RUN}`),
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
  console.log('Emitted Generator Coverage:', JSON.stringify(cov));
  console.log(`PASS t5c-02 Differential (2 workers, ${(merged.wallMs / 1000).toFixed(1)}s): generated=${merged.generated}, rejected_ubsan=${merged.rejectedUbsan}, run=${merged.run}, matched=${merged.matched}/${TARGET_RUN}, JS===WASM=${merged.jsWasmEqual}`);
  if (!merged.pass) process.exit(1);
}

if (require.main === module) {
  if (process.env.T5C_DIFF_WORKER !== '1' && TARGET_RUN >= 2000) {
    runParallel().catch(e => { console.error(e); process.exit(1); });
  } else {
    run();
  }
}
module.exports = { run, generateRichProg, buildBatchSource, countEmittedCoverage };
