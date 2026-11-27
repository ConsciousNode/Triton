'use strict';

/**
 * Test 7: GNU Extensions Suite (`tests/t5c-07-gnu-ext.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Tests every GNU extension implemented by tcc5 (with expected results written by hand):
 * - __attribute__: aligned, packed, section, noreturn, unused, used, weak,
 *   always_inline, noinline, const, pure, format, constructor
 * - __asm__ with Triton operand constraints and clobbers
 * - __builtin_expect, __builtin_unreachable, __builtin_constant_p, __builtin_offsetof
 * - __builtin_clz/ctz/popcount/bswap (16/32/64)
 * - __typeof__, statement expressions ({ ... }), __label__ and computed goto,
 *   zero-length arrays, __sync_* and __atomic_* on stage-1 CAS.
 */

const { tcc5, runExeOnBothCores, sha256Str, recordJsonl } = require('./t5c-common');

const SOURCE = `
#include <triton5.h>
#include <stdint.h>
#include <stdbool.h>

static int ctor_ran = 0;

__attribute__((constructor))
static void init_ctor(void) {
  ctor_ran = 777;
}

__attribute__((weak))
int weak_fn(void) { return 11; }

int weak_fn(void) { return 22; } /* strong overrides weak */

__attribute__((always_inline))
static inline int add_ai(int a, int b) { return a + b; }

__attribute__((noinline, pure))
static int mul_pure(int a, int b) { return a * b; }

__attribute__((const))
static int sq_const(int x) { return x * x; }

__attribute__((format(printf, 1, 2), unused))
static void dummy_fmt(const char *fmt, ...) { (void)fmt; }

__attribute__((noreturn))
static void halt_now(void) { __asm__ volatile ("HALT"); __builtin_unreachable(); }

__attribute__((section(".custom_ro"), used))
static const int custom_sec_val = 12345;

struct __attribute__((packed)) PackedS {
  char a;
  int b;
  short c;
};

struct FlexZLA {
  int count;
  int data[0];
};

static int test_computed_goto(int idx) {
  __label__ l0, l1, l2;
  void *jt[3] = { &&l0, &&l1, &&l2 };
  goto *jt[idx];
l0: return 101;
l1: return 202;
l2: return 303;
}

int main(void) {
  /* 1. constructor + weak + always_inline + noinline + pure + const + section */
  int r1 = ctor_ran + weak_fn() + add_ai(3, 4) + mul_pure(5, 6) + sq_const(7) + custom_sec_val;
  /* 777 + 22 + 7 + 30 + 49 + 12345 = 13230 */

  /* 2. packed + aligned + offsetof + zero-length array */
  __attribute__((aligned(16))) int aligned_var = 1;
  (void)aligned_var;
  int p_sz = (int)sizeof(struct PackedS); /* 1 + 4 + 2 = 7 */
  int p_off = (int)__builtin_offsetof(struct PackedS, b); /* 1 */
  int zla_sz = (int)sizeof(struct FlexZLA); /* 4 */

  /* 3. __asm__ with Triton constraints & clobbers */
  int asm_in = 19, asm_out = 0;
  __asm__ volatile ("ADDI %0, %1, 23" : "=r"(asm_out) : "r"(asm_in) : "memory");
  /* asm_out = 42 */

  /* 4. __typeof__, statement expressions, __builtin_expect, __builtin_constant_p */
  __typeof__(asm_out) st_res = ({
    int t = 10;
    if (__builtin_expect(t == 10, 1)) t += 5;
    t * 2;
  }); /* 30 */
  int cp1 = __builtin_constant_p(123 + 456); /* 1 */
  int cp0 = __builtin_constant_p(asm_in);    /* 0 */

  /* 5. bit builtins */
  int clz = __builtin_clz(0x00100000U);       /* 11 */
  int ctz = __builtin_ctz(0x00100000U);       /* 20 */
  int pop = __builtin_popcount(0xA5A5A5A5U);  /* 16 */
  int clz64 = __builtin_clzll(1ULL << 40);    /* 23 */
  int ctz64 = __builtin_ctzll(1ULL << 40);    /* 40 */
  int pop64 = __builtin_popcountll(0x0F0F0F0F0F0F0F0FULL); /* 32 */
  uint16_t bs16 = __builtin_bswap16(0x1234U); /* 0x3412 = 13330 */
  uint32_t bs32 = __builtin_bswap32(0x12345678U); /* 0x78563412 */
  uint64_t bs64 = __builtin_bswap64(0x0123456789ABCDEFULL); /* 0xEFCDAB8967452301 */

  /* 6. computed goto + __label__ */
  int cg = test_computed_goto(0) + test_computed_goto(1) + test_computed_goto(2); /* 606 */

  /* 7. __sync and __atomic builtins backed by Triton 5 CAS (+71) */
  volatile uint32_t aval = 100U;
  uint32_t old1 = __sync_fetch_and_add(&aval, 25U);       /* old1=100, aval=125 */
  bool cas_ok = __sync_bool_compare_and_swap(&aval, 125U, 200U); /* true, aval=200 */
  bool cas_no = __sync_bool_compare_and_swap(&aval, 125U, 300U); /* false, aval=200 */
  uint32_t exp = 200U;
  bool acas = __atomic_compare_exchange_n(&aval, &exp, 250U, false, 0, 0); /* true, aval=250 */
  uint32_t old2 = __atomic_fetch_xor(&aval, 0xFFU, 0);    /* old2=250, aval=250^255=5 */
  uint32_t final_a = __atomic_load_n(&aval, 0);           /* 5 */
  __atomic_thread_fence(0);

  t5_puts("GNU:");
  t5_putint(r1); t5_puts(":");
  t5_putint(p_sz); t5_puts(":");
  t5_putint(p_off); t5_puts(":");
  t5_putint(zla_sz); t5_puts(":");
  t5_putint(asm_out); t5_puts(":");
  t5_putint(st_res); t5_puts(":");
  t5_putint(cp1); t5_puts(":");
  t5_putint(cp0); t5_puts(":");
  t5_putint(clz); t5_puts(":");
  t5_putint(ctz); t5_puts(":");
  t5_putint(pop); t5_puts(":");
  t5_putint(clz64); t5_puts(":");
  t5_putint(ctz64); t5_puts(":");
  t5_putint(pop64); t5_puts(":");
  t5_putint((int)bs16); t5_puts(":");
  t5_puthex32(bs32); t5_puts(":");
  t5_puthex64(bs64); t5_puts(":");
  t5_putint(cg); t5_puts(":");
  t5_putint((int)old1); t5_puts(":");
  t5_putint((int)cas_ok); t5_puts(":");
  t5_putint((int)cas_no); t5_puts(":");
  t5_putint((int)acas); t5_puts(":");
  t5_putint((int)old2); t5_puts(":");
  t5_putint((int)final_a);
  t5_puts("\\n");
  return 0;
}
`;

const EXPECTED = 'GNU:13230:7:1:4:42:30:1:0:11:20:16:23:40:32:13330:78563412:efcdab8967452301:606:100:1:0:1:250:5\n';

function run() {
  const exe = tcc5.compileAndLink([{ source: SOURCE, filename: 'gnu_ext.c' }]);
  const res = runExeOnBothCores(exe, 5000000, true);
  const ok = res.wasmHalted && res.jsHalted && res.lockstepOk && res.consoleOut === EXPECTED;
  if (!ok) {
    console.error(`FAIL t5c-07:\n  got     : ${JSON.stringify(res.consoleOut)}\n  expected: ${JSON.stringify(EXPECTED)}\n  lockstep: ${res.lockstepOk}`);
  } else {
    console.log(`PASS t5c-07 GNU Extensions (${res.wasmSteps} steps, JS===WASM hash ${res.wasmHash})`);
  }
  recordJsonl({
    testId: 't5c-07',
    name: 'GNU Extensions Suite',
    pass: ok,
    inputSha256: sha256Str(SOURCE),
    steps: res.wasmSteps,
    jsWasmEqual: res.lockstepOk
  });
  if (!ok) process.exit(1);
}

if (require.main === module) run();
module.exports = { run };
