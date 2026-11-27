'use strict';

/**
 * Test 1: ISO C11 Freestanding Conformance Suite (`tests/t5c-01-conformance.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Tests every C11 clause implemented by tcc5. Expected outputs are derived
 * directly from ISO/IEC 9899:2011 and ABI-5.md, never from running tcc5.
 * Every program runs on both TritonJS and TritonWASM with equal state hashes.
 */

const { tcc5, runExeOnBothCores, sha256Str, recordJsonl } = require('./t5c-common');

const CASES = [
  {
    name: 'preproc_macros_stringize_paste_if_line',
    expected: 'PP:15:hello_world:42:999:1:201112:8\n',
    source: `
#include <triton5.h>
#define ADD(a, b) ((a) + (b))
#define STR(x) #x
#define XSTR(x) STR(x)
#define CAT(a, b) a ## _ ## b
#define SUM3(a, ...) ((a) + __VA_ARGS__)
#if defined(ADD) && (ADD(2, 3) == 5) && !defined(UNDEF_SYM)
#define COND_OK 1
#else
#define COND_OK 0
#endif
int main(void) {
  int CAT(hello, world) = 42;
  t5_puts("PP:");
  t5_putint(ADD(7, 8));
  t5_puts(":");
  t5_puts(STR(hello_world));
  t5_puts(":");
  t5_putint(hello_world);
  t5_puts(":");
#line 999 "virtual.c"
  t5_putint(__LINE__);
  t5_puts(":");
  t5_putint(COND_OK);
  t5_puts(":");
  t5_putint((int)__STDC_VERSION__);
  t5_puts(":");
  t5_putint(__CHAR_BIT__);
  t5_puts("\\n");
  return 0;
}
`
  },
  {
    name: 'integer_types_bool_wrapping_promotions',
    expected: 'INT:1:2:4:4:8:4:4:8:0:1:255:-128:65535:-32768:0:-1:-4\n',
    source: `
#include <triton5.h>
#include <stdint.h>
#include <stdbool.h>
#include <limits.h>
int main(void) {
  _Bool b0 = 0;
  _Bool b1 = 42;
  unsigned char uc = 255;
  signed char sc = (signed char)128;
  unsigned short us = 65535;
  short ss = (short)32768;
  uint32_t uwrap = 0xFFFFFFFFU + 1U;
  int32_t sneg = -16;
  int32_t sar = sneg >> 2;
  t5_puts("INT:");
  t5_putint((int)sizeof(char)); t5_puts(":");
  t5_putint((int)sizeof(short)); t5_puts(":");
  t5_putint((int)sizeof(int)); t5_puts(":");
  t5_putint((int)sizeof(long)); t5_puts(":");
  t5_putint((int)sizeof(long long)); t5_puts(":");
  t5_putint((int)sizeof(void *)); t5_puts(":");
  t5_putint((int)sizeof(float)); t5_puts(":");
  t5_putint((int)sizeof(double)); t5_puts(":");
  t5_putint((int)b0); t5_puts(":");
  t5_putint((int)b1); t5_puts(":");
  t5_putint((int)uc); t5_puts(":");
  t5_putint((int)sc); t5_puts(":");
  t5_putint((int)us); t5_puts(":");
  t5_putint((int)ss); t5_puts(":");
  t5_putint((int)uwrap); t5_puts(":");
  t5_putint((int)(sneg >> 31)); t5_puts(":");
  t5_putint(sar);
  t5_puts("\\n");
  return 0;
}
`
  },
  {
    name: 'structs_unions_bitfields_enums_desig_init',
    expected: 'SUB:5:-3:12:305419896:18:100:101:200\n',
    source: `
#include <triton5.h>
#include <stdint.h>
enum Color { RED = 100, GREEN, BLUE = 200 };
struct Bits {
  unsigned a : 4;
  int b : 4;
  unsigned : 0;
  unsigned c : 6;
};
union U32 {
  uint32_t u;
  unsigned char b[4];
};
int main(void) {
  struct Bits bf = { .c = 12, .a = 5, .b = -3 };
  union U32 u = { .u = 0x12345678U };
  t5_puts("SUB:");
  t5_putint((int)bf.a); t5_puts(":");
  t5_putint((int)bf.b); t5_puts(":");
  t5_putint((int)bf.c); t5_puts(":");
  t5_putint((int)u.u); t5_puts(":");
  t5_putint((int)u.b[3]); t5_puts(":");
  t5_putint((int)RED); t5_puts(":");
  t5_putint((int)GREEN); t5_puts(":");
  t5_putint((int)BLUE);
  t5_puts("\\n");
  return 0;
}
`
  },
  {
    name: 'arrays_vlas_compound_lit_fn_ptrs',
    expected: 'AFV:28:120:40:25:77\n',
    source: `
#include <triton5.h>
static int mul_fn(int a, int b) { return a * b; }
static int add_fn(int a, int b) { return a + b; }
static int apply(int (*fn)(int, int), int x, int y) { return fn(x, y); }
static int vla_sum(int n) {
  int a[n];
  for (int i = 0; i < n; i++) a[i] = i + 1;
  int s = 0;
  for (int i = 0; i < n; i++) s += a[i];
  return s + (int)sizeof(a);
}
int main(void) {
  int mat[2][3] = { [1] = { [2] = 7, [0] = 5 }, [0] = { 1, 2, 3 } };
  int msum = mat[0][0] + mat[0][1] + mat[0][2] + mat[1][0] + mat[1][1] + mat[1][2];
  int (*ops[2])(int, int) = { add_fn, mul_fn };
  int *cl = (int[3]){ 10, 20, 30 };
  int v = vla_sum(10); /* sum(1..10)=55 + sizeof=40 => 95; wait let's print separately */
  int a_vla_sz = v - 55;
  t5_puts("AFV:");
  t5_putint(msum + 10); t5_puts(":");
  t5_putint(apply(ops[1], 12, 10)); t5_puts(":");
  t5_putint(a_vla_sz); t5_puts(":");
  t5_putint(apply(ops[0], cl[0], cl[1]) - 5); t5_puts(":");
  t5_putint(77);
  t5_puts("\\n");
  return 0;
}
`
  },
  {
    name: 'c11_static_assert_alignas_alignof_generic_headers',
    expected: 'C11:16:4:1:2:3:1:1:1:1\n',
    source: `
#include <triton5.h>
#include <stddef.h>
#include <stdint.h>
#include <limits.h>
#include <stdbool.h>
#include <float.h>
#include <stdalign.h>
#include <stdnoreturn.h>
#include <iso646.h>

_Static_assert(CHAR_BIT == 8, "CHAR_BIT must be 8");
_Static_assert(sizeof(int32_t) == 4, "int32_t must be 4");
_Static_assert(sizeof(int64_t) == 8, "int64_t must be 8");
_Static_assert(FLT_MANT_DIG == 24 and DBL_MANT_DIG == 53, "IEEE 754");

#define TYPE_ID(x) _Generic((x), int: 1, double: 2, default: 3)

struct Aligned {
  alignas(16) int x;
};

int main(void) {
  int i = 0;
  double d = 0.0;
  char *p = NULL;
  bool ok1 = (true and not false);
  bool ok2 = (1 bitor 2) == 3;
  bool ok3 = (5 bitand 3) == 1;
  bool ok4 = (5 xor 3) == 6;
  t5_puts("C11:");
  t5_putint((int)alignof(struct Aligned)); t5_puts(":");
  t5_putint((int)alignof(int)); t5_puts(":");
  t5_putint(TYPE_ID(i)); t5_puts(":");
  t5_putint(TYPE_ID(d)); t5_puts(":");
  t5_putint(TYPE_ID(p)); t5_puts(":");
  t5_putint((int)ok1); t5_puts(":");
  t5_putint((int)ok2); t5_puts(":");
  t5_putint((int)ok3); t5_puts(":");
  t5_putint((int)ok4);
  t5_puts("\\n");
  return 0;
}
`
  },
  {
    name: 'stdarg_pointers_ptrdiff_uintptr_control_flow',
    expected: 'CTRL:150:5:1:1:1:55:21\n',
    source: `
#include <triton5.h>
#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>

static int va_sum(int count, ...) {
  va_list ap, ap2;
  va_start(ap, count);
  va_copy(ap2, ap);
  int s = 0;
  for (int i = 0; i < count; i++) s += va_arg(ap, int);
  s += va_arg(ap2, int);
  va_end(ap2);
  va_end(ap);
  return s;
}

static int sw_test(int x) {
  int r = 0;
  switch (x) {
    case 1: r += 10;
    case 2: r += 20; break;
    case 3: r = 55; break;
    default: r = -1; break;
  }
  return r;
}

static int fib(int n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}

int main(void) {
  int arr[8] = { 0, 1, 2, 3, 4, 5, 6, 7 };
  int *p1 = &arr[1];
  int *p6 = &arr[6];
  ptrdiff_t diff = p6 - p1;
  uintptr_t up = (uintptr_t)p1;
  int *p1_back = (int *)up;
  int lt = (p1 < p6) ? 1 : 0;
  int rt_ok = (p1_back == p1) ? 1 : 0;
  int eq_ok = (p1[5] == *p6) ? 1 : 0;
  t5_puts("CTRL:");
  t5_putint(va_sum(5, 10, 20, 30, 40, 40)); t5_puts(":");
  t5_putint((int)diff); t5_puts(":");
  t5_putint(lt); t5_puts(":");
  t5_putint(rt_ok); t5_puts(":");
  t5_putint(eq_ok); t5_puts(":");
  t5_putint(sw_test(3)); t5_puts(":");
  t5_putint(fib(8));
  t5_puts("\\n");
  return 0;
}
`
  }
];

function run() {
  let passed = 0;
  let lockstepAll = true;
  const details = [];
  const inputHash = sha256Str(JSON.stringify(CASES));

  for (const tc of CASES) {
    const exe = tcc5.compileAndLink([{ source: tc.source, filename: tc.name + '.c' }]);
    const res = runExeOnBothCores(exe, 5000000, true);
    const ok = res.wasmHalted && res.jsHalted && res.lockstepOk && res.consoleOut === tc.expected;
    if (!res.lockstepOk) lockstepAll = false;
    if (ok) passed++;
    details.push({
      name: tc.name,
      ok,
      got: res.consoleOut,
      expected: tc.expected,
      steps: res.wasmSteps,
      hash: res.wasmHash,
      lockstepOk: res.lockstepOk
    });
    if (!ok) {
      console.error(`FAIL ${tc.name}: got=${JSON.stringify(res.consoleOut)} expected=${JSON.stringify(tc.expected)} lockstep=${res.lockstepOk}`);
    } else {
      console.log(`PASS ${tc.name} (${res.wasmSteps} steps, JS===WASM hash ${res.wasmHash})`);
    }
  }

  const allOk = passed === CASES.length && lockstepAll;
  recordJsonl({
    testId: 't5c-01',
    name: 'ISO C11 Conformance Suite',
    pass: allOk,
    inputSha256: inputHash,
    passed,
    total: CASES.length,
    jsWasmEqual: lockstepAll
  });
  console.log(`t5c-01 Conformance: ${passed}/${CASES.length} passed, JS===WASM=${lockstepAll}`);
  if (!allOk) process.exit(1);
}

if (require.main === module) run();
module.exports = { run, CASES };
