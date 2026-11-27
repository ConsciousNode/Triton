'use strict';

/**
 * Built-in ISO C11 Freestanding Headers for Triton 5 (`tcc5/headers.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Provides <stdarg.h>, <stddef.h>, <stdint.h>, <limits.h>, <stdbool.h>,
 * <float.h>, <stdalign.h>, <stdnoreturn.h>, <iso646.h>, and <triton5.h>.
 */

const BUILTIN_HEADERS = {
  'stddef.h': `
#ifndef _TRITON5_STDDEF_H
#define _TRITON5_STDDEF_H
typedef unsigned long size_t;
typedef long ptrdiff_t;
typedef int wchar_t;
typedef long long max_align_t;
#define NULL ((void *)0)
#define offsetof(type, member) __builtin_offsetof(type, member)
#endif
`,

  'stdint.h': `
#ifndef _TRITON5_STDINT_H
#define _TRITON5_STDINT_H
typedef signed char        int8_t;
typedef short              int16_t;
typedef int                int32_t;
typedef long long          int64_t;
typedef unsigned char      uint8_t;
typedef unsigned short     uint16_t;
typedef unsigned int       uint32_t;
typedef unsigned long long uint64_t;

typedef signed char        int_least8_t;
typedef short              int_least16_t;
typedef int                int_least32_t;
typedef long long          int_least64_t;
typedef unsigned char      uint_least8_t;
typedef unsigned short     uint_least16_t;
typedef unsigned int       uint_least32_t;
typedef unsigned long long uint_least64_t;

typedef signed char        int_fast8_t;
typedef int                int_fast16_t;
typedef int                int_fast32_t;
typedef long long          int_fast64_t;
typedef unsigned char      uint_fast8_t;
typedef unsigned int       uint_fast16_t;
typedef unsigned int       uint_fast32_t;
typedef unsigned long long uint_fast64_t;

typedef long               intptr_t;
typedef unsigned long      uintptr_t;
typedef long long          intmax_t;
typedef unsigned long long uintmax_t;

#define INT8_MIN   (-128)
#define INT8_MAX   127
#define UINT8_MAX  255
#define INT16_MIN  (-32768)
#define INT16_MAX  32767
#define UINT16_MAX 65535
#define INT32_MIN  (-2147483647 - 1)
#define INT32_MAX  2147483647
#define UINT32_MAX 4294967295U
#define INT64_MIN  (-9223372036854775807LL - 1LL)
#define INT64_MAX  9223372036854775807LL
#define UINT64_MAX 18446744073709551615ULL

#define INT_LEAST8_MIN   INT8_MIN
#define INT_LEAST8_MAX   INT8_MAX
#define UINT_LEAST8_MAX  UINT8_MAX
#define INT_LEAST16_MIN  INT16_MIN
#define INT_LEAST16_MAX  INT16_MAX
#define UINT_LEAST16_MAX UINT16_MAX
#define INT_LEAST32_MIN  INT32_MIN
#define INT_LEAST32_MAX  INT32_MAX
#define UINT_LEAST32_MAX UINT32_MAX
#define INT_LEAST64_MIN  INT64_MIN
#define INT_LEAST64_MAX  INT64_MAX
#define UINT_LEAST64_MAX UINT64_MAX

#define INT_FAST8_MIN    INT8_MIN
#define INT_FAST8_MAX    INT8_MAX
#define UINT_FAST8_MAX   UINT8_MAX
#define INT_FAST16_MIN   INT32_MIN
#define INT_FAST16_MAX   INT32_MAX
#define UINT_FAST16_MAX  UINT32_MAX
#define INT_FAST32_MIN   INT32_MIN
#define INT_FAST32_MAX   INT32_MAX
#define UINT_FAST32_MAX  UINT32_MAX
#define INT_FAST64_MIN   INT64_MIN
#define INT_FAST64_MAX   INT64_MAX
#define UINT_FAST64_MAX  UINT64_MAX

#define INTPTR_MIN   INT32_MIN
#define INTPTR_MAX   INT32_MAX
#define UINTPTR_MAX  UINT32_MAX
#define INTMAX_MIN   INT64_MIN
#define INTMAX_MAX   INT64_MAX
#define UINTMAX_MAX  UINT64_MAX
#define PTRDIFF_MIN  INT32_MIN
#define PTRDIFF_MAX  INT32_MAX
#define SIZE_MAX     UINT32_MAX
#define SIG_ATOMIC_MIN INT32_MIN
#define SIG_ATOMIC_MAX INT32_MAX
#define WCHAR_MIN    INT32_MIN
#define WCHAR_MAX    INT32_MAX
#define WINT_MIN     0U
#define WINT_MAX     UINT32_MAX

#define INT8_C(x)   (x)
#define INT16_C(x)  (x)
#define INT32_C(x)  (x)
#define INT64_C(x)  (x ## LL)
#define UINT8_C(x)  (x)
#define UINT16_C(x) (x)
#define UINT32_C(x) (x ## U)
#define UINT64_C(x) (x ## ULL)
#define INTMAX_C(x) (x ## LL)
#define UINTMAX_C(x) (x ## ULL)
#endif
`,

  'limits.h': `
#ifndef _TRITON5_LIMITS_H
#define _TRITON5_LIMITS_H
#define CHAR_BIT   8
#define SCHAR_MIN  (-128)
#define SCHAR_MAX  127
#define UCHAR_MAX  255
#define CHAR_MIN   SCHAR_MIN
#define CHAR_MAX   SCHAR_MAX
#define MB_LEN_MAX 4
#define SHRT_MIN   (-32768)
#define SHRT_MAX   32767
#define USHRT_MAX  65535
#define INT_MIN    (-2147483647 - 1)
#define INT_MAX    2147483647
#define UINT_MAX   4294967295U
#define LONG_MIN   (-2147483647L - 1L)
#define LONG_MAX   2147483647L
#define ULONG_MAX  4294967295UL
#define LLONG_MIN  (-9223372036854775807LL - 1LL)
#define LLONG_MAX  9223372036854775807LL
#define ULLONG_MAX 18446744073709551615ULL
#endif
`,

  'stdbool.h': `
#ifndef _TRITON5_STDBOOL_H
#define _TRITON5_STDBOOL_H
#define bool _Bool
#define true 1
#define false 0
#define __bool_true_false_are_defined 1
#endif
`,

  'stdarg.h': `
#ifndef _TRITON5_STDARG_H
#define _TRITON5_STDARG_H
typedef char *va_list;
typedef va_list __gnuc_va_list;
#define va_start(ap, last) __builtin_va_start((ap), (last))
#define va_arg(ap, T)      __builtin_va_arg((ap), T)
#define va_end(ap)         __builtin_va_end((ap))
#define va_copy(dst, src)  __builtin_va_copy((dst), (src))
#endif
`,

  'float.h': `
#ifndef _TRITON5_FLOAT_H
#define _TRITON5_FLOAT_H
#define FLT_RADIX       2
#define FLT_ROUNDS      1
#define FLT_EVAL_METHOD 0

#define FLT_MANT_DIG    24
#define FLT_DIG         6
#define FLT_DECIMAL_DIG 9
#define FLT_MIN_EXP     (-125)
#define FLT_MIN_10_EXP  (-37)
#define FLT_MAX_EXP     128
#define FLT_MAX_10_EXP  38
#define FLT_MAX         3.40282346638528859812e+38F
#define FLT_MIN         1.17549435082228750797e-38F
#define FLT_EPSILON     1.19209289550781250000e-7F
#define FLT_TRUE_MIN    1.40129846432481707092e-45F
#define FLT_HAS_SUBNORM 1

#define DBL_MANT_DIG    53
#define DBL_DIG         15
#define DBL_DECIMAL_DIG 17
#define DECIMAL_DIG     17
#define DBL_MIN_EXP     (-1021)
#define DBL_MIN_10_EXP  (-307)
#define DBL_MAX_EXP     1024
#define DBL_MAX_10_EXP  308
#define DBL_MAX         1.79769313486231570815e+308
#define DBL_MIN         2.22507385850720138309e-308
#define DBL_EPSILON     2.22044604925031308085e-16
#define DBL_TRUE_MIN    4.94065645841246544177e-324
#define DBL_HAS_SUBNORM 1

#define LDBL_MANT_DIG    DBL_MANT_DIG
#define LDBL_DIG         DBL_DIG
#define LDBL_DECIMAL_DIG DBL_DECIMAL_DIG
#define LDBL_MIN_EXP     DBL_MIN_EXP
#define LDBL_MIN_10_EXP  DBL_MIN_10_EXP
#define LDBL_MAX_EXP     DBL_MAX_EXP
#define LDBL_MAX_10_EXP  DBL_MAX_10_EXP
#define LDBL_MAX         DBL_MAX
#define LDBL_MIN         DBL_MIN
#define LDBL_EPSILON     DBL_EPSILON
#define LDBL_TRUE_MIN    DBL_TRUE_MIN
#define LDBL_HAS_SUBNORM 1
#endif
`,

  'stdalign.h': `
#ifndef _TRITON5_STDALIGN_H
#define _TRITON5_STDALIGN_H
#define alignas _Alignas
#define alignof _Alignof
#define __alignas_is_defined 1
#define __alignof_is_defined 1
#endif
`,

  'stdnoreturn.h': `
#ifndef _TRITON5_STDNORETURN_H
#define _TRITON5_STDNORETURN_H
#define noreturn _Noreturn
#endif
`,

  'iso646.h': `
#ifndef _TRITON5_ISO646_H
#define _TRITON5_ISO646_H
#define and    &&
#define and_eq &=
#define bitand &
#define bitor  |
#define compl  ~
#define not    !
#define not_eq !=
#define or     ||
#define or_eq  |=
#define xor    ^
#define xor_eq ^=
#endif
`,

  'triton5.h': `
#ifndef _TRITON5_H
#define _TRITON5_H
#include <stdint.h>
#include <stddef.h>

static inline void t5_putchar(int c) {
  __asm__ volatile ("OUT %0, 0" : : "r"(c));
}
static inline void t5_putint(int v) {
  __asm__ volatile ("OUT %0, 1" : : "r"(v));
}
static inline void t5_puts(const char *s) {
  while (*s) t5_putchar((unsigned char)*s++);
}
static inline void t5_puthex32(uint32_t v) {
  static const char hex[] = "0123456789abcdef";
  for (int i = 28; i >= 0; i -= 4) t5_putchar(hex[(v >> i) & 15U]);
}
static inline void t5_puthex64(uint64_t v) {
  t5_puthex32((uint32_t)(v >> 32));
  t5_puthex32((uint32_t)v);
}
void *memcpy(void *dst, const void *src, size_t n);
void *memmove(void *dst, const void *src, size_t n);
void *memset(void *dst, int c, size_t n);
int memcmp(const void *a, const void *b, size_t n);
#endif
`
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BUILTIN_HEADERS };
}
