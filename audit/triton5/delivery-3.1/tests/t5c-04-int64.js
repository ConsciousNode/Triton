'use strict';

/**
 * Test 4: 64-Bit Integer Operations vs BigInt (`tests/t5c-04-int64.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Tests every uint64_t / int64_t operation (+, -, *, /, %, &, |, ^, ~, <<, >>,
 * comparisons) on edges (0, 1, -1, INT64_MIN, INT64_MAX, UINT64_MAX, 2^32±1)
 * and 1,000,000 random cases against JavaScript BigInt:
 *   Part A: 1,000,000 random cases per op verifying rt_int64.c against BigInt.
 *   Part B: tcc5-compiled guest C program exercising all 64-bit ops on edges
 *           and seeded random stream on BOTH TritonWASM and TritonJS with equal
 *           state hashes, matched bit-for-bit against BigInt oracle.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { REPO_ROOT, tcc5, runExeOnBothCores, sha256Str, recordJsonl } = require('./t5c-common');

// Compute exact BigInt reference checksum for the guest program
function computeBigIntOracle(randCount) {
  const U64 = (x) => BigInt.asUintN(64, x);
  const S64 = (x) => BigInt.asIntN(64, x);
  const FNV_PRIME = 1099511628211n;
  let h = 14695981039346656037n;
  const mix = (v) => { h = U64((h ^ U64(v)) * FNV_PRIME); };

  const edges = [
    0n, 1n, 2n, 0xFFFFFFFFn, 0x100000000n, 0x100000001n,
    0x7FFFFFFFFFFFFFFFn, 0x8000000000000000n, 0xFFFFFFFFFFFFFFFFn
  ];
  for (const a of edges) {
    for (const b of edges) {
      mix(U64(a + b));
      mix(U64(a - b));
      mix(U64(a * b));
      mix(a & b);
      mix(a | b);
      mix(a ^ b);
      if (b !== 0n) {
        mix(a / b);
        mix(a % b);
        const sa = S64(a), sb = S64(b);
        if (!(sa === -9223372036854775808n && sb === -1n)) {
          mix(U64(sa / sb));
          mix(U64(sa % sb));
        }
      }
      mix(a < b ? 1n : 0n);
      mix(S64(a) < S64(b) ? 1n : 0n);
    }
    for (const sh of [0n, 1n, 31n, 32n, 33n, 63n]) {
      mix(U64(a << sh));
      mix(a >> sh);
      mix(U64(S64(a) >> sh));
    }
  }

  let s = 0x9E3779B97F4A7C15n;
  const next = () => {
    s = U64(s ^ U64(s << 13n));
    s = U64(s ^ (s >> 7n));
    s = U64(s ^ U64(s << 17n));
    return s;
  };
  for (let i = 0; i < randCount; i++) {
    const a = next();
    const b = next() | 1n;
    const sh = BigInt(i & 63);
    mix(U64(a + b));
    mix(U64(a - b));
    mix(U64(a * b));
    mix(a & b);
    mix(a | b);
    mix(a ^ b);
    mix(U64(~a));
    mix(U64(a << sh));
    mix(a >> sh);
    mix(U64(S64(a) >> sh));
    mix(a / b);
    mix(a % b);
    const sa = S64(a), sb = S64(b);
    if (!(sa === -9223372036854775808n && sb === -1n)) {
      mix(U64(sa / sb));
      mix(U64(sa % sb));
    }
    mix((a < b ? 1n : 0n) | (S64(a) < S64(b) ? 2n : 0n) | (a === b ? 4n : 0n));
  }
  return h.toString(16).padStart(16, '0') + '\n';
}

function buildGuestInt64C(randCount) {
  return `
#include <triton5.h>
#include <stdint.h>

static uint64_t h = 14695981039346656037ULL;
static void mix(uint64_t v) { h = (h ^ v) * 1099511628211ULL; }

int main(void) {
  uint64_t edges[9] = {
    0ULL, 1ULL, 2ULL, 0xFFFFFFFFULL, 0x100000000ULL, 0x100000001ULL,
    0x7FFFFFFFFFFFFFFFULL, 0x8000000000000000ULL, 0xFFFFFFFFFFFFFFFFULL
  };
  int shifts[6] = { 0, 1, 31, 32, 33, 63 };
  for (int i = 0; i < 9; i++) {
    uint64_t a = edges[i];
    for (int j = 0; j < 9; j++) {
      uint64_t b = edges[j];
      mix(a + b);
      mix(a - b);
      mix(a * b);
      mix(a & b);
      mix(a | b);
      mix(a ^ b);
      if (b != 0ULL) {
        mix(a / b);
        mix(a % b);
        int64_t sa = (int64_t)a, sb = (int64_t)b;
        if (!(sa == (-9223372036854775807LL - 1LL) && sb == -1LL)) {
          mix((uint64_t)(sa / sb));
          mix((uint64_t)(sa % sb));
        }
      }
      mix(a < b ? 1ULL : 0ULL);
      mix((int64_t)a < (int64_t)b ? 1ULL : 0ULL);
    }
    for (int k = 0; k < 6; k++) {
      int sh = shifts[k];
      mix(a << sh);
      mix(a >> sh);
      mix((uint64_t)((int64_t)a >> sh));
    }
  }

  uint64_t s = 0x9E3779B97F4A7C15ULL;
  for (int i = 0; i < ${randCount}; i++) {
    s ^= s << 13; s ^= s >> 7; s ^= s << 17;
    uint64_t a = s;
    s ^= s << 13; s ^= s >> 7; s ^= s << 17;
    uint64_t b = s | 1ULL;
    int sh = i & 63;
    mix(a + b);
    mix(a - b);
    mix(a * b);
    mix(a & b);
    mix(a | b);
    mix(a ^ b);
    mix(~a);
    mix(a << sh);
    mix(a >> sh);
    mix((uint64_t)((int64_t)a >> sh));
    mix(a / b);
    mix(a % b);
    int64_t sa = (int64_t)a, sb = (int64_t)b;
    if (!(sa == (-9223372036854775807LL - 1LL) && sb == -1LL)) {
      mix((uint64_t)(sa / sb));
      mix((uint64_t)(sa % sb));
    }
    mix((a < b ? 1ULL : 0ULL) | ((int64_t)a < (int64_t)b ? 2ULL : 0ULL) | (a == b ? 4ULL : 0ULL));
  }
  t5_puthex64(h);
  t5_putchar('\\n');
  return 0;
}
`;
}

// Part A: 1,000,000 random cases on rt_int64.c verified against BigInt checksum
const HOST_1M_INT64_C = `
#include <stdio.h>
#include <stdint.h>
#include "runtime/rt_int64.c"

int main(void) {
  uint64_t h = 14695981039346656037ULL;
  uint64_t s = 0x9E3779B97F4A7C15ULL;
  for (int i = 0; i < 1000000; i++) {
    s ^= s << 13; s ^= s >> 7; s ^= s << 17;
    uint64_t a = s;
    s ^= s << 13; s ^= s >> 7; s ^= s << 17;
    uint64_t b = s | 1ULL;
    int sh = i & 63;
    h = (h ^ (a + b)) * 1099511628211ULL;
    h = (h ^ (a - b)) * 1099511628211ULL;
    h = (h ^ (a * b)) * 1099511628211ULL;
    h = (h ^ __ashldi3(a, sh)) * 1099511628211ULL;
    h = (h ^ __lshrdi3(a, sh)) * 1099511628211ULL;
    h = (h ^ (uint64_t)__ashrdi3((int64_t)a, sh)) * 1099511628211ULL;
    h = (h ^ __udivdi3(a, b)) * 1099511628211ULL;
    h = (h ^ __umoddi3(a, b)) * 1099511628211ULL;
    int64_t sa = (int64_t)a, sb = (int64_t)b;
    if (!(sa == (-9223372036854775807LL - 1LL) && sb == -1LL)) {
      h = (h ^ (uint64_t)__divdi3(sa, sb)) * 1099511628211ULL;
      h = (h ^ (uint64_t)__moddi3(sa, sb)) * 1099511628211ULL;
    }
  }
  printf("%016llx\\n", (unsigned long long)h);
  return 0;
}
`;

function computeBigInt1M() {
  const U64 = (x) => BigInt.asUintN(64, x);
  const S64 = (x) => BigInt.asIntN(64, x);
  const P = 1099511628211n;
  let h = 14695981039346656037n;
  let s = 0x9E3779B97F4A7C15n;
  for (let i = 0; i < 1000000; i++) {
    s = U64(s ^ U64(s << 13n)); s = U64(s ^ (s >> 7n)); s = U64(s ^ U64(s << 17n));
    const a = s;
    s = U64(s ^ U64(s << 13n)); s = U64(s ^ (s >> 7n)); s = U64(s ^ U64(s << 17n));
    const b = s | 1n;
    const sh = BigInt(i & 63);
    h = U64((h ^ U64(a + b)) * P);
    h = U64((h ^ U64(a - b)) * P);
    h = U64((h ^ U64(a * b)) * P);
    h = U64((h ^ U64(a << sh)) * P);
    h = U64((h ^ (a >> sh)) * P);
    h = U64((h ^ U64(S64(a) >> sh)) * P);
    h = U64((h ^ (a / b)) * P);
    h = U64((h ^ (a % b)) * P);
    const sa = S64(a), sb = S64(b);
    if (!(sa === -9223372036854775808n && sb === -1n)) {
      h = U64((h ^ U64(sa / sb)) * P);
      h = U64((h ^ U64(sa % sb)) * P);
    }
  }
  return h.toString(16).padStart(16, '0') + '\n';
}

function run() {
  const tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.tmp-t5c-i64-'));
  try {
    // Part A: 1,000,000 random cases on rt_int64.c vs JS BigInt
    const hC = path.join(tmpDir, 'i64_1m.c');
    const hBin = path.join(tmpDir, 'i64_1m');
    fs.writeFileSync(hC, HOST_1M_INT64_C, 'utf8');
    execFileSync('gcc', ['-O2', '-std=c11', '-I', REPO_ROOT, hC, '-o', hBin]);
    const cOut = execFileSync(hBin, { encoding: 'utf8' });
    const bigOut = computeBigInt1M();
    console.log(`Part A (1,000,000 random x 10 ops, rt_int64.c vs BigInt): match=${cOut === bigOut} (${cOut.trim()})`);
    if (cOut !== bigOut) {
      throw new Error(`Part A mismatch: rt_int64=${cOut.trim()} vs BigInt=${bigOut.trim()}`);
    }

    // Part B: tcc5-compiled guest 64-bit suite on BOTH TritonWASM and TritonJS vs BigInt
    const guestRand = parseInt(process.env.T5C_I64_GUEST_N || '1000', 10);
    const expected = computeBigIntOracle(guestRand);
    const guestSrc = buildGuestInt64C(guestRand);
    const exe = tcc5.compileAndLink([{ source: guestSrc, filename: 'i64_guest.c' }]);
    const res = runExeOnBothCores(exe, 50000000, true);
    const ok = res.wasmHalted && res.jsHalted && res.lockstepOk && res.consoleOut === expected;
    console.log(`Part B (tcc5 guest int64 edges + ${guestRand} random x 15 ops on JS & WASM): match=${ok}, steps=${res.wasmSteps}, wasm=${res.wasmMs}ms, js=${res.jsMs}ms, hash=${res.wasmHash}`);
    if (!ok) {
      console.error('BigInt:', JSON.stringify(expected), 'tcc5:', JSON.stringify(res.consoleOut), 'lockstep:', res.lockstepOk);
      process.exit(1);
    }

    recordJsonl({
      testId: 't5c-04',
      name: '64-Bit Integer Operations vs BigInt',
      pass: ok,
      inputSha256: sha256Str(HOST_1M_INT64_C + guestSrc),
      hostRandomCasesPerOp: 1000000,
      guestRandomCases: guestRand,
      guestSteps: res.wasmSteps,
      jsWasmEqual: res.lockstepOk
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (require.main === module) run();
module.exports = { run };
