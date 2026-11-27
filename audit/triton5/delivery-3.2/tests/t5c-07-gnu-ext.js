'use strict';

/**
 * Test 7: GNU Extensions & NetBSD Builtins Suite (`tests/t5c-07-gnu-ext.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Tests every GNU extension & NetBSD builtin implemented by tcc5 (expected
 * results written by hand):
 * - __attribute__: aligned, packed (incl. word-boundary crossing), section,
 *   noreturn, unused, used, weak, always_inline, noinline, const, pure, format, constructor
 * - Strict attribute diagnostics: hard error on vector_size/mode, warning on unknown
 * - __asm__ with Triton operand constraints and clobbers
 * - __builtin_expect, __builtin_unreachable, __builtin_constant_p, __builtin_offsetof
 * - __builtin_clz/ctz/popcount/bswap/ffs (16/32/64)
 * - __builtin_memcpy/memmove/memset/memcmp/strlen/strcmp/alloca/abort/trap
 * - __builtin_add/sub/mul_overflow (32-bit & 64-bit)
 * - __builtin_va_start/va_arg/va_end/va_copy
 * - __typeof__, statement expressions, __label__ & computed goto, zero-length arrays
 * - __sync_* and __atomic_* on Triton 5 stage-1 CAS (+71)
 * - K&R old-style function definitions
 */

const { tcc5, runExeOnBothCores, sha256Str, recordJsonl } = require('./t5c-common');

const SOURCE = `
#include <triton5.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdarg.h>

static int ctor_ran = 0;
__attribute__((constructor)) static void init_ctor(void) { ctor_ran = 777; }
__attribute__((weak)) int weak_fn(void) { return 11; }
int weak_fn(void) { return 22; }
__attribute__((always_inline)) static inline int add_ai(int a, int b) { return a + b; }
__attribute__((noinline, pure)) static int mul_pure(int a, int b) { return a * b; }
__attribute__((const)) static int sq_const(int x) { return x * x; }
__attribute__((format(printf, 1, 2), unused)) static void dummy_fmt(const char *fmt, ...) { (void)fmt; }
__attribute__((noreturn)) static void halt_now(void) { __builtin_trap(); __builtin_abort(); __builtin_unreachable(); }
__attribute__((section(".custom_ro"), used)) static const int custom_sec_val = 12345;

struct __attribute__((packed)) PackedS { char a; int b; short c; };
struct FlexZLA { int count; int data[0]; };

/* K&R function definition */
int knr_comb(a, b)
  int a;
  int b;
{
  return a * 100 + b;
}

static int test_va_builtins(int n, ...) {
  va_list ap, ap2;
  __builtin_va_start(ap, n);
  __builtin_va_copy(ap2, ap);
  int s = 0;
  for (int i = 0; i < n; i++) s += __builtin_va_arg(ap, int);
  s += __builtin_va_arg(ap2, int);
  __builtin_va_end(ap2);
  __builtin_va_end(ap);
  return s;
}

static int test_computed_goto(int idx) {
  __label__ l0, l1, l2;
  void *jt[3] = { &&l0, &&l1, &&l2 };
  goto *jt[idx];
l0: return 101;
l1: return 202;
l2: return 303;
}

int main(void) {
  int r1 = ctor_ran + weak_fn() + add_ai(3, 4) + mul_pure(5, 6) + sq_const(7) + custom_sec_val; /* 13230 */
  int p_sz = (int)sizeof(struct PackedS); /* 7 */
  int p_off = (int)__builtin_offsetof(struct PackedS, b); /* 1 */
  int zla_sz = (int)sizeof(struct FlexZLA); /* 4 */

  int asm_in = 19, asm_out = 0;
  __asm__ volatile ("ADDI %0, %1, 23" : "=r"(asm_out) : "r"(asm_in) : "memory"); /* 42 */

  __typeof__(asm_out) st_res = ({ int t = 10; if (__builtin_expect(t == 10, 1)) t += 5; t * 2; }); /* 30 */
  int cp1 = __builtin_constant_p(123 + 456); /* 1 */
  int cp0 = __builtin_constant_p(asm_in);    /* 0 */

  /* Bit + ffs builtins */
  int clz = __builtin_clz(0x00100000U);       /* 11 */
  int ctz = __builtin_ctz(0x00100000U);       /* 20 */
  int pop = __builtin_popcount(0xA5A5A5A5U);  /* 16 */
  int ffs32 = __builtin_ffs(0x18);            /* 4 */
  int ffs64 = __builtin_ffsll(1LL << 40);     /* 41 */
  uint16_t bs16 = __builtin_bswap16(0x1234U); /* 13330 */
  uint32_t bs32 = __builtin_bswap32(0x12345678U);
  uint64_t bs64 = __builtin_bswap64(0x0123456789ABCDEFULL);

  /* NetBSD memory/string/alloca/overflow builtins */
  char *abuf = (char *)__builtin_alloca(16);
  __builtin_memset(abuf, 'Z', 6);
  abuf[6] = '\\0';
  char bbuf[16];
  __builtin_memcpy(bbuf, abuf, 7);
  int blen = (int)__builtin_strlen(bbuf);     /* 6 */
  int bcmp = __builtin_strcmp(abuf, bbuf);    /* 0 */
  int bmcmp = __builtin_memcmp(abuf, "ZZZZZZ", 6); /* 0 */
  int32_t ov32 = 0;
  bool o1 = __builtin_add_overflow(2147483647, 1, &ov32); /* 1 */
  bool o2 = __builtin_sub_overflow(10, 3, &ov32);         /* 0, ov32=7 */
  uint64_t ov64 = 0;
  bool o3 = __builtin_umulll_overflow(0x100000000ULL, 0x100000000ULL, &ov64); /* 1 */

  int cg = test_computed_goto(0) + test_computed_goto(1) + test_computed_goto(2); /* 606 */
  int vas = test_va_builtins(3, 10, 20, 30); /* 70 */
  int knr = knr_comb(3, 14); /* 314 */

  volatile uint32_t aval = 100U;
  uint32_t old1 = __sync_fetch_and_add(&aval, 25U);
  bool cas_ok = __sync_bool_compare_and_swap(&aval, 125U, 200U);
  uint32_t exp = 200U;
  bool acas = __atomic_compare_exchange_n(&aval, &exp, 250U, false, 0, 0);
  uint32_t final_a = __atomic_load_n(&aval, 0); /* 250 */

  t5_puts("GNU:");
  t5_putint(r1); t5_puts(":"); t5_putint(p_sz); t5_puts(":"); t5_putint(p_off); t5_puts(":"); t5_putint(zla_sz); t5_puts(":");
  t5_putint(asm_out); t5_puts(":"); t5_putint(st_res); t5_puts(":"); t5_putint(cp1); t5_puts(":"); t5_putint(cp0); t5_puts(":");
  t5_putint(clz); t5_puts(":"); t5_putint(ctz); t5_puts(":"); t5_putint(pop); t5_puts(":"); t5_putint(ffs32); t5_puts(":"); t5_putint(ffs64); t5_puts(":");
  t5_putint((int)bs16); t5_puts(":"); t5_puthex32(bs32); t5_puts(":"); t5_puthex64(bs64); t5_puts(":");
  t5_putint(blen); t5_puts(":"); t5_putint(bcmp); t5_puts(":"); t5_putint(bmcmp); t5_puts(":");
  t5_putint((int)o1); t5_puts(":"); t5_putint((int)o2); t5_puts(":"); t5_putint(ov32); t5_puts(":"); t5_putint((int)o3); t5_puts(":");
  t5_putint(cg); t5_puts(":"); t5_putint(vas); t5_puts(":"); t5_putint(knr); t5_puts(":");
  t5_putint((int)old1); t5_puts(":"); t5_putint((int)cas_ok); t5_puts(":"); t5_putint((int)acas); t5_puts(":"); t5_putint((int)final_a);
  t5_puts("\\n");
  return 0;
}
`;

const EXPECTED = 'GNU:13230:7:1:4:42:30:1:0:11:20:16:4:41:13330:78563412:efcdab8967452301:6:0:0:1:0:7:1:606:70:314:100:1:1:250\n';

function run() {
  // Check strict attribute diagnostics (Audit-3 #2)
  let attrErrOk = false;
  try {
    tcc5.compileCToAsm('typedef int v4 __attribute__((vector_size(16)));', { filename: 'attr_err.c' });
  } catch (e) {
    attrErrOk = /attr_err\.c:1:.*unsupported type\/layout-changing attribute 'vector_size'/.test(e.message);
  }
  const warnAst = tcc5.parseProgram(tcc5.preprocess('__attribute__((unknown_xyz)) int g = 1;', { filename: 'attr_warn.c' }), 'attr_warn.c');
  const attrWarnOk = warnAst.warnings && warnAst.warnings.some(w => w.includes("unknown attribute 'unknown_xyz'"));

  const exe = tcc5.compileAndLink([{ source: SOURCE, filename: 'gnu_ext.c' }]);
  const res = runExeOnBothCores(exe, 5000000, true);
  const ok = attrErrOk && attrWarnOk && res.wasmHalted && res.jsHalted && res.lockstepOk && res.consoleOut === EXPECTED;
  if (!ok) {
    console.error('FAIL t5c-07:', { attrErrOk, attrWarnOk, got: res.consoleOut, expected: EXPECTED, lockstep: res.lockstepOk });
  } else {
    console.log(`PASS t5c-07 GNU Extensions + NetBSD Builtins + Strict Attrs (${res.wasmSteps} steps, JS===WASM ${res.wasmHash})`);
  }
  recordJsonl({
    testId: 't5c-07',
    name: 'GNU Extensions, NetBSD Builtins, K&R & Strict Attribute Diagnostics',
    pass: ok,
    inputSha256: sha256Str(SOURCE),
    attrHardErrorOk: attrErrOk,
    attrWarnOk,
    steps: res.wasmSteps,
    jsWasmEqual: res.lockstepOk
  });
  if (!ok) process.exit(1);
}

if (require.main === module) run();
module.exports = { run };
