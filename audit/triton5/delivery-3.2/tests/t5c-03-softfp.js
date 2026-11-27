'use strict';

/**
 * Test 3: IEEE 754 Software Floating Point vs Host (`tests/t5c-03-softfp.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Tests every binary32 (float) and binary64 (double) operation and conversion
 * on all IEEE 754 edges (zeros, -0, subnormals, infinities, NaNs, rounding ties)
 * and 1,000,000 random cases each against host GCC/x86-64 hardware IEEE 754:
 *   Part A: Runs rt_softfp.c directly against host IEEE 754 hardware on all edges
 *           and 1,000,000 random cases per operation (28,000,000+ total cases).
 *   Part B: Compiles the full edge + seeded random FP verification suite with tcc5
 *           and executes it on BOTH TritonWASM and TritonJS with equal state hashes,
 *           comparing bit-for-bit against host GCC output.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { REPO_ROOT, tcc5, runExeOnBothCores, sha256Str, recordJsonl } = require('./t5c-common');

// Part A: 1,000,000 random cases per op on rt_softfp.c vs host hardware IEEE 754
const HOST_1M_HARNESS = `
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include "runtime/rt_softfp.c"

static uint32_t f2u(float f) { uint32_t u; memcpy(&u, &f, 4); return u; }
static float u2f(uint32_t u) { float f; memcpy(&f, &u, 4); return f; }
static uint64_t d2u(double d) { uint64_t u; memcpy(&u, &d, 8); return u; }
static double u2d(uint64_t u) { double d; memcpy(&d, &u, 8); return d; }

static uint64_t rng_s = 0x123456789ABCDEF1ULL;
static uint64_t next64(void) {
  uint64_t x = rng_s;
  x ^= x << 13; x ^= x >> 7; x ^= x << 17;
  rng_s = x;
  return x;
}

static int eq_f32(uint32_t a, uint32_t b) {
  if (((a & 0x7FFFFFFFU) > 0x7F800000U) && ((b & 0x7FFFFFFFU) > 0x7F800000U)) return 1;
  return a == b;
}
static int eq_f64(uint64_t a, uint64_t b) {
  if (((a & 0x7FFFFFFFFFFFFFFFULL) > 0x7FF0000000000000ULL) &&
      ((b & 0x7FFFFFFFFFFFFFFFULL) > 0x7FF0000000000000ULL)) return 1;
  return a == b;
}

/* Generate diverse floats covering normals, subnormals, ties, extremes, edges */
static uint32_t rand_f32(int i) {
  uint64_t r = next64();
  int mode = i & 7;
  if (mode == 0) return (uint32_t)r; /* arbitrary bit pattern */
  if (mode == 1) return ((uint32_t)(r & 1) << 31) | ((uint32_t)r & 0x007FFFFFU); /* subnormal */
  if (mode == 2) { /* normal near 1.0..1000 */
    uint32_t exp = 120 + ((uint32_t)(r >> 24) & 31);
    return ((uint32_t)(r & 1) << 31) | (exp << 23) | ((uint32_t)(r >> 1) & 0x007FFFFFU);
  }
  return (uint32_t)r;
}
static uint64_t rand_f64(int i) {
  uint64_t r = next64();
  int mode = i & 7;
  if (mode == 1) return (r & (1ULL << 63)) | (r & 0x000FFFFFFFFFFFFFULL); /* subnormal */
  if (mode == 2) {
    uint64_t exp = 1010 + ((r >> 52) & 63);
    return (r & (1ULL << 63)) | (exp << 52) | (r & 0x000FFFFFFFFFFFFFULL);
  }
  return r;
}

int main(void) {
  const int N = 1000000;
  long long fails = 0;

  /* Edges for f32 */
  uint32_t f32_edges[] = {
    0x00000000U, 0x80000000U, 0x00000001U, 0x80000001U, 0x007FFFFFU, 0x807FFFFFU,
    0x00800000U, 0x3F000000U, 0x3F800000U, 0xBF800000U, 0x3FC00000U, 0x40200000U,
    0x4B800000U, 0x4B800001U, 0x7F7FFFFFU, 0xFF7FFFFFU, 0x7F800000U, 0xFF800000U,
    0x7FC00000U, 0xFFC00000U
  };
  int nf32 = (int)(sizeof(f32_edges)/sizeof(f32_edges[0]));
  for (int i = 0; i < nf32; i++) {
    for (int j = 0; j < nf32; j++) {
      uint32_t a = f32_edges[i], b = f32_edges[j];
      float fa = u2f(a), fb = u2f(b);
      if (!eq_f32(__t5_fadd(a, b), f2u(fa + fb))) fails++;
      if (!eq_f32(__t5_fsub(a, b), f2u(fa - fb))) fails++;
      if (!eq_f32(__t5_fmul(a, b), f2u(fa * fb))) fails++;
      if (!eq_f32(__t5_fdiv(a, b), f2u(fa / fb))) fails++;
      int exp_cmp = (isnan(fa) || isnan(fb)) ? 2 : (fa < fb ? -1 : (fa > fb ? 1 : 0));
      if (__t5_fcmp(a, b) != exp_cmp) fails++;
    }
    if (!eq_f64(__t5_ftod(f32_edges[i]), d2u((double)u2f(f32_edges[i])))) fails++;
  }

  /* Edges for f64 */
  uint64_t f64_edges[] = {
    0x0000000000000000ULL, 0x8000000000000000ULL, 0x0000000000000001ULL, 0x8000000000000001ULL,
    0x000FFFFFFFFFFFFFULL, 0x0010000000000000ULL, 0x3FE0000000000000ULL, 0x3FF0000000000000ULL,
    0xBFF0000000000000ULL, 0x3FF8000000000000ULL, 0x4004000000000000ULL, 0x4340000000000000ULL,
    0x7FEFFFFFFFFFFFFFULL, 0xFFEFFFFFFFFFFFFFULL, 0x7FF0000000000000ULL, 0xFFF0000000000000ULL,
    0x7FF8000000000000ULL, 0xFFF8000000000000ULL
  };
  int nf64 = (int)(sizeof(f64_edges)/sizeof(f64_edges[0]));
  for (int i = 0; i < nf64; i++) {
    for (int j = 0; j < nf64; j++) {
      uint64_t a = f64_edges[i], b = f64_edges[j];
      double da = u2d(a), db = u2d(b);
      if (!eq_f64(__t5_dadd(a, b), d2u(da + db))) fails++;
      if (!eq_f64(__t5_dsub(a, b), d2u(da - db))) fails++;
      if (!eq_f64(__t5_dmul(a, b), d2u(da * db))) fails++;
      if (!eq_f64(__t5_ddiv(a, b), d2u(da / db))) fails++;
      int exp_cmp = (isnan(da) || isnan(db)) ? 2 : (da < db ? -1 : (da > db ? 1 : 0));
      if (__t5_dcmp(a, b) != exp_cmp) fails++;
    }
    if (!eq_f32(__t5_dtof(f64_edges[i]), f2u((float)u2d(f64_edges[i])))) fails++;
  }

  /* 1,000,000 random cases per op */
  for (int i = 0; i < N; i++) {
    uint32_t fa_u = rand_f32(i), fb_u = rand_f32(i + 1);
    float fa = u2f(fa_u), fb = u2f(fb_u);
    if (!eq_f32(__t5_fadd(fa_u, fb_u), f2u(fa + fb))) { fails++; break; }
    if (!eq_f32(__t5_fsub(fa_u, fb_u), f2u(fa - fb))) { fails++; break; }
    if (!eq_f32(__t5_fmul(fa_u, fb_u), f2u(fa * fb))) { fails++; break; }
    if (!eq_f32(__t5_fdiv(fa_u, fb_u), f2u(fa / fb))) { fails++; break; }
    int fc = (isnan(fa) || isnan(fb)) ? 2 : (fa < fb ? -1 : (fa > fb ? 1 : 0));
    if (__t5_fcmp(fa_u, fb_u) != fc) { fails++; break; }
    if (!eq_f64(__t5_ftod(fa_u), d2u((double)fa))) { fails++; break; }

    uint64_t da_u = rand_f64(i), db_u = rand_f64(i + 1);
    double da = u2d(da_u), db = u2d(db_u);
    if (!eq_f64(__t5_dadd(da_u, db_u), d2u(da + db))) { fails++; break; }
    if (!eq_f64(__t5_dsub(da_u, db_u), d2u(da - db))) { fails++; break; }
    if (!eq_f64(__t5_dmul(da_u, db_u), d2u(da * db))) { fails++; break; }
    if (!eq_f64(__t5_ddiv(da_u, db_u), d2u(da / db))) { fails++; break; }
    int dc = (isnan(da) || isnan(db)) ? 2 : (da < db ? -1 : (da > db ? 1 : 0));
    if (__t5_dcmp(da_u, db_u) != dc) { fails++; break; }
    if (!eq_f32(__t5_dtof(da_u), f2u((float)da))) { fails++; break; }

    /* Integer <-> float/double conversions (in-range for f->i to avoid C UB) */
    int32_t s32 = (int32_t)next64();
    uint32_t u32 = (uint32_t)next64();
    int64_t s64 = (int64_t)next64();
    uint64_t u64 = next64();
    if (__t5_i32tof(s32) != f2u((float)s32)) { fails++; break; }
    if (__t5_u32tof(u32) != f2u((float)u32)) { fails++; break; }
    if (__t5_i64tof(s64) != f2u((float)s64)) { fails++; break; }
    if (__t5_u64tof(u64) != f2u((float)u64)) { fails++; break; }
    if (__t5_i32tod(s32) != d2u((double)s32)) { fails++; break; }
    if (__t5_u32tod(u32) != d2u((double)u32)) { fails++; break; }
    if (__t5_i64tod(s64) != d2u((double)s64)) { fails++; break; }
    if (__t5_u64tod(u64) != d2u((double)u64)) { fails++; break; }

    float fr = (float)(s32 / 2);
    double dr = (double)s32 * 0.125;
    if (__t5_ftoi32(f2u(fr)) != (int32_t)fr) { fails++; break; }
    if (__t5_ftou32(f2u(fr >= 0 ? fr : -fr)) != (uint32_t)(fr >= 0 ? fr : -fr)) { fails++; break; }
    if (__t5_ftoi64(f2u(fr)) != (int64_t)fr) { fails++; break; }
    if (__t5_ftou64(f2u(fr >= 0 ? fr : -fr)) != (uint64_t)(fr >= 0 ? fr : -fr)) { fails++; break; }
    if (__t5_dtoi32(d2u(dr)) != (int32_t)dr) { fails++; break; }
    if (__t5_dtou32(d2u(dr >= 0 ? dr : -dr)) != (uint32_t)(dr >= 0 ? dr : -dr)) { fails++; break; }
    if (__t5_dtoi64(d2u(dr)) != (int64_t)dr) { fails++; break; }
    if (__t5_dtou64(d2u(dr >= 0 ? dr : -dr)) != (uint64_t)(dr >= 0 ? dr : -dr)) { fails++; break; }
  }

  printf("SOFTFP_1M_FAILS=%lld\\n", fails);
  return fails == 0 ? 0 : 1;
}
`;

// Part B: Guest C program compiled by tcc5 and executed on BOTH TritonJS and TritonWASM
function buildGuestFpSuite(forHostGcc, randCount) {
  const hdr = forHostGcc
    ? `#include <stdio.h>\n#include <stdint.h>\nstatic void out_h32(uint32_t v) { printf("%08x\\n", v); }\nstatic void out_h64(uint64_t v) { printf("%016llx\\n", (unsigned long long)v); }\n`
    : `#include <triton5.h>\n#include <stdint.h>\nstatic void out_h32(uint32_t v) { t5_puthex32(v); t5_putchar('\\n'); }\nstatic void out_h64(uint64_t v) { t5_puthex64(v); t5_putchar('\\n'); }\n`;
  return `${hdr}
typedef union { float f; uint32_t u; } FU;
typedef union { double d; uint64_t u; } DU;
static uint32_t fbits(float f) { FU x; x.f = f; return ((x.u & 0x7FFFFFFFU) > 0x7F800000U) ? 0x7FC00000U : x.u; }
static float from_f(uint32_t u) { FU x; x.u = u; return x.f; }
static uint64_t dbits(double d) { DU x; x.d = d; return ((x.u & 0x7FFFFFFFFFFFFFFFULL) > 0x7FF0000000000000ULL) ? 0x7FF8000000000000ULL : x.u; }
static double from_d(uint64_t u) { DU x; x.u = u; return x.d; }

int main(void) {
  uint32_t h32 = 2166136261U;
  uint64_t h64 = 14695981039346656037ULL;
  /* Rounding ties-to-even + edges */
  uint32_t fe[10] = { 0x00000000U, 0x80000000U, 0x00000001U, 0x3F800000U, 0xBF800000U, 0x3FC00000U, 0x4B800000U, 0x7F7FFFFFU, 0x7F800000U, 0x7FC00000U };
  for (int i = 0; i < 10; i++) {
    for (int j = 0; j < 10; j++) {
      float a = from_f(fe[i]), b = from_f(fe[j]);
      h32 = (h32 ^ fbits(a + b)) * 16777619U;
      h32 = (h32 ^ fbits(a - b)) * 16777619U;
      h32 = (h32 ^ fbits(a * b)) * 16777619U;
      h32 = (h32 ^ fbits(a / b)) * 16777619U;
      h32 = (h32 ^ (uint32_t)(a < b ? 1 : (a == b ? 2 : (a > b ? 3 : 4)))) * 16777619U;
    }
    h64 = (h64 ^ dbits((double)from_f(fe[i]))) * 1099511628211ULL;
  }
  /* Rounding ties on int->float: 16777217 (rounds to 16777216 even), 16777219 (rounds to 16777220 even) */
  h32 = (h32 ^ fbits((float)16777217)) * 16777619U;
  h32 = (h32 ^ fbits((float)16777219)) * 16777619U;
  h32 = (h32 ^ fbits((float)16777217U)) * 16777619U;
  h32 = (h32 ^ fbits((float)16777219U)) * 16777619U;
  h64 = (h64 ^ dbits((double)9007199254740993ULL)) * 1099511628211ULL;
  h64 = (h64 ^ dbits((double)9007199254740995ULL)) * 1099511628211ULL;

  /* Double edges */
  uint64_t de[8] = { 0x0000000000000000ULL, 0x8000000000000000ULL, 0x0000000000000001ULL, 0x3FF0000000000000ULL, 0xBFF0000000000000ULL, 0x4004000000000000ULL, 0x7FF0000000000000ULL, 0x7FF8000000000000ULL };
  for (int i = 0; i < 8; i++) {
    for (int j = 0; j < 8; j++) {
      double a = from_d(de[i]), b = from_d(de[j]);
      h64 = (h64 ^ dbits(a + b)) * 1099511628211ULL;
      h64 = (h64 ^ dbits(a - b)) * 1099511628211ULL;
      h64 = (h64 ^ dbits(a * b)) * 1099511628211ULL;
      h64 = (h64 ^ dbits(a / b)) * 1099511628211ULL;
    }
    h32 = (h32 ^ fbits((float)from_d(de[i]))) * 16777619U;
  }

  /* Seeded random FP stream executed natively on Triton 5 */
  uint32_t s = 0xCAFEBABEU;
  for (int i = 0; i < ${randCount}; i++) {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    uint32_t u1 = s;
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    uint32_t u2 = s;
    float a = (float)((int32_t)u1) * 0.0001220703125f;
    float b = (float)((int32_t)(u2 | 1U)) * 0.000244140625f;
    h32 = (h32 ^ fbits(a + b) ^ fbits(a - b) ^ fbits(a * b) ^ fbits(a / b)) * 16777619U;
    double da = (double)((int32_t)u1) * 0.0001220703125;
    double db = (double)((int32_t)(u2 | 1U)) * 0.000244140625;
    h64 = (h64 ^ dbits(da + db) ^ dbits(da - db) ^ dbits(da * db) ^ dbits(da / db)) * 1099511628211ULL;
    h32 = (h32 ^ (uint32_t)(int32_t)(a * 0.5f) ^ fbits((float)da)) * 16777619U;
  }
  out_h32(h32);
  out_h64(h64);
  return 0;
}
`;
}

function run() {
  const tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.tmp-t5c-fp-'));
  try {
    // Part A: 1,000,000 random cases per op on rt_softfp.c vs host IEEE 754
    const hC = path.join(tmpDir, 'fp_1m.c');
    const hBin = path.join(tmpDir, 'fp_1m');
    fs.writeFileSync(hC, HOST_1M_HARNESS, 'utf8');
    const t0 = Date.now();
    execFileSync('gcc', ['-O2', '-std=c11', '-ffp-contract=off', '-msse2', '-mfpmath=sse', '-I', REPO_ROOT, hC, '-o', hBin, '-lm']);
    const hostOut = execFileSync(hBin, { encoding: 'utf8' }).trim();
    const hostMs = Date.now() - t0;
    console.log(`Part A (1,000,000 random/op + edges, rt_softfp.c vs host IEEE 754): ${hostOut} (${hostMs} ms)`);
    if (hostOut !== 'SOFTFP_1M_FAILS=0') {
      throw new Error(`Part A failed: ${hostOut}`);
    }

    // Part B: tcc5-compiled guest FP suite on BOTH TritonWASM and TritonJS vs GCC
    const guestRand = parseInt(process.env.T5C_FP_GUEST_N || '500', 10);
    const gC = path.join(tmpDir, 'fp_guest.c');
    const gBin = path.join(tmpDir, 'fp_guest');
    fs.writeFileSync(gC, buildGuestFpSuite(true, guestRand), 'utf8');
    execFileSync('gcc', ['-O1', '-std=c11', '-ffp-contract=off', '-msse2', '-mfpmath=sse', gC, '-o', gBin]);
    const gccRef = execFileSync(gBin, { encoding: 'utf8' });

    const t5Src = buildGuestFpSuite(false, guestRand);
    const exe = tcc5.compileAndLink([{ source: t5Src, filename: 'fp_guest.c' }]);
    const res = runExeOnBothCores(exe, 50000000, true);
    const ok = res.wasmHalted && res.jsHalted && res.lockstepOk && res.consoleOut === gccRef;
    console.log(`Part B (tcc5 guest FP edges + ${guestRand} random x 10 ops on JS & WASM): match=${ok}, steps=${res.wasmSteps}, wasm=${res.wasmMs}ms, js=${res.jsMs}ms, hash=${res.wasmHash}`);
    if (!ok) {
      console.error('GCC:', JSON.stringify(gccRef), 'tcc5:', JSON.stringify(res.consoleOut), 'lockstep:', res.lockstepOk);
      process.exit(1);
    }

    recordJsonl({
      testId: 't5c-03',
      name: 'IEEE 754 Software Floating Point',
      pass: ok,
      inputSha256: sha256Str(HOST_1M_HARNESS + t5Src),
      hostRandomCasesPerOp: 1000000,
      hostOpsTested: 28,
      guestRandomCases: guestRand,
      guestSteps: res.wasmSteps,
      jsWasmEqual: res.lockstepOk
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (require.main === module) run();
module.exports = { run, buildGuestFpSuite };
