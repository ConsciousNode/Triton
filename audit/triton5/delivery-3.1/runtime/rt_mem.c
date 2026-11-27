/*
 * Triton 5.0 Freestanding Memory, Bit-Op & Atomic Runtime (`runtime/rt_mem.c`)
 * ConsciousNode SoftWorks — MIT License
 * Compiled by tcc5 itself (self-hosted runtime).
 */

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

void *memcpy(void *dst, const void *src, size_t n) {
  unsigned char *d = (unsigned char *)dst;
  const unsigned char *s = (const unsigned char *)src;
  if (n > 0) {
    /* Use Triton 5 BCOPY directly in machine space (A = P - 1093) */
    uint32_t dm = (uint32_t)((int32_t)(uintptr_t)d - 1093);
    uint32_t sm = (uint32_t)((int32_t)(uintptr_t)s - 1093);
    uint32_t cnt = (uint32_t)n;
    __asm__ volatile ("BCOPY %0, %1, %2" : "+r"(dm), "+r"(sm), "+r"(cnt));
  }
  return dst;
}

void *memmove(void *dst, const void *src, size_t n) {
  unsigned char *d = (unsigned char *)dst;
  const unsigned char *s = (const unsigned char *)src;
  if (d == s || n == 0) return dst;
  if (d < s || d >= s + n) {
    return memcpy(dst, src, n);
  }
  for (size_t i = n; i > 0; i--) {
    d[i - 1] = s[i - 1];
  }
  return dst;
}

void *memset(void *dst, int c, size_t n) {
  unsigned char *d = (unsigned char *)dst;
  if (n > 0) {
    uint32_t dm = (uint32_t)((int32_t)(uintptr_t)d - 1093);
    uint32_t val = (uint32_t)(c & 0xFF);
    uint32_t cnt = (uint32_t)n;
    __asm__ volatile ("BFILL %0, %1, %2" : "+r"(dm), "+r"(val), "+r"(cnt));
  }
  return dst;
}

int memcmp(const void *a, const void *b, size_t n) {
  const unsigned char *pa = (const unsigned char *)a;
  const unsigned char *pb = (const unsigned char *)b;
  for (size_t i = 0; i < n; i++) {
    if (pa[i] != pb[i]) return (int)pa[i] - (int)pb[i];
  }
  return 0;
}

/* GNU Bit Builtin Helpers */
uint32_t __t5_bswap32(uint32_t x) {
  return ((x & 0x000000FFU) << 24) |
         ((x & 0x0000FF00U) << 8)  |
         ((x & 0x00FF0000U) >> 8)  |
         ((x & 0xFF000000U) >> 24);
}

uint64_t __t5_bswap64(uint64_t x) {
  uint32_t lo = (uint32_t)x;
  uint32_t hi = (uint32_t)(x >> 32);
  return ((uint64_t)__t5_bswap32(lo) << 32) | (uint64_t)__t5_bswap32(hi);
}

int __t5_clz32(uint32_t x) {
  if (x == 0) return 32;
  int n = 0;
  if ((x & 0xFFFF0000U) == 0) { n += 16; x <<= 16; }
  if ((x & 0xFF000000U) == 0) { n += 8;  x <<= 8;  }
  if ((x & 0xF0000000U) == 0) { n += 4;  x <<= 4;  }
  if ((x & 0xC0000000U) == 0) { n += 2;  x <<= 2;  }
  if ((x & 0x80000000U) == 0) { n += 1; }
  return n;
}

int __t5_clz64(uint64_t x) {
  uint32_t hi = (uint32_t)(x >> 32);
  if (hi != 0) return __t5_clz32(hi);
  return 32 + __t5_clz32((uint32_t)x);
}

int __t5_ctz32(uint32_t x) {
  if (x == 0) return 32;
  int n = 0;
  if ((x & 0x0000FFFFU) == 0) { n += 16; x >>= 16; }
  if ((x & 0x000000FFU) == 0) { n += 8;  x >>= 8;  }
  if ((x & 0x0000000FU) == 0) { n += 4;  x >>= 4;  }
  if ((x & 0x00000003U) == 0) { n += 2;  x >>= 2;  }
  if ((x & 0x00000001U) == 0) { n += 1; }
  return n;
}

int __t5_ctz64(uint64_t x) {
  uint32_t lo = (uint32_t)x;
  if (lo != 0) return __t5_ctz32(lo);
  return 32 + __t5_ctz32((uint32_t)(x >> 32));
}

int __t5_popcount32(uint32_t x) {
  x = x - ((x >> 1) & 0x55555555U);
  x = (x & 0x33333333U) + ((x >> 2) & 0x33333333U);
  return (int)((((x + (x >> 4)) & 0x0F0F0F0FU) * 0x01010101U) >> 24);
}

int __t5_popcount64(uint64_t x) {
  return __t5_popcount32((uint32_t)x) + __t5_popcount32((uint32_t)(x >> 32));
}

/*
 * Atomic helpers backed by Triton 5.0 stage-1 CAS (+71) instruction.
 * Uses a 3-tryte (27-trit word) hardware CAS lock word to guarantee full
 * atomicity across 4-tryte little-endian 32-bit C integers.
 */
static volatile uint32_t __t5_atomic_lock_word = 0;

static void __t5_lock_acquire(void) {
  uint32_t lock_mach = (uint32_t)((int32_t)(uintptr_t)&__t5_atomic_lock_word - 1093);
  for (;;) {
    uint32_t exp = 0;
    uint32_t one = 1;
    __asm__ volatile ("CAS %0, %1, %2" : "+r"(exp) : "r"(lock_mach), "r"(one));
    if (exp == 0) break;
  }
}

static void __t5_lock_release(void) {
  uint32_t lock_mach = (uint32_t)((int32_t)(uintptr_t)&__t5_atomic_lock_word - 1093);
  uint32_t exp = 1;
  uint32_t zero = 0;
  __asm__ volatile ("CAS %0, %1, %2" : "+r"(exp) : "r"(lock_mach), "r"(zero));
}

uint32_t __t5_cas32_val(volatile uint32_t *ptr, uint32_t expected, uint32_t desired) {
  __t5_lock_acquire();
  uint32_t old = *ptr;
  if (old == expected) *ptr = desired;
  __t5_lock_release();
  return old;
}

bool __t5_cas32_bool(volatile uint32_t *ptr, uint32_t expected, uint32_t desired) {
  __t5_lock_acquire();
  uint32_t old = *ptr;
  bool ok = (old == expected);
  if (ok) *ptr = desired;
  __t5_lock_release();
  return ok;
}

bool __t5_atomic_cmpxchg32(volatile uint32_t *ptr, uint32_t *expected, uint32_t desired) {
  __t5_lock_acquire();
  uint32_t old = *ptr;
  bool ok = (old == *expected);
  if (ok) *ptr = desired;
  else *expected = old;
  __t5_lock_release();
  return ok;
}

uint32_t __t5_atomic_xchg32(volatile uint32_t *ptr, uint32_t val) {
  __t5_lock_acquire();
  uint32_t old = *ptr;
  *ptr = val;
  __t5_lock_release();
  return old;
}

uint32_t __t5_atomic_fetch_add32(volatile uint32_t *ptr, uint32_t val) {
  __t5_lock_acquire();
  uint32_t old = *ptr;
  *ptr = old + val;
  __t5_lock_release();
  return old;
}

uint32_t __t5_atomic_add_fetch32(volatile uint32_t *ptr, uint32_t val) {
  __t5_lock_acquire();
  uint32_t res = *ptr + val;
  *ptr = res;
  __t5_lock_release();
  return res;
}

uint32_t __t5_atomic_fetch_sub32(volatile uint32_t *ptr, uint32_t val) {
  __t5_lock_acquire();
  uint32_t old = *ptr;
  *ptr = old - val;
  __t5_lock_release();
  return old;
}

uint32_t __t5_atomic_sub_fetch32(volatile uint32_t *ptr, uint32_t val) {
  __t5_lock_acquire();
  uint32_t res = *ptr - val;
  *ptr = res;
  __t5_lock_release();
  return res;
}

uint32_t __t5_atomic_fetch_and32(volatile uint32_t *ptr, uint32_t val) {
  __t5_lock_acquire();
  uint32_t old = *ptr;
  *ptr = old & val;
  __t5_lock_release();
  return old;
}

uint32_t __t5_atomic_fetch_or32(volatile uint32_t *ptr, uint32_t val) {
  __t5_lock_acquire();
  uint32_t old = *ptr;
  *ptr = old | val;
  __t5_lock_release();
  return old;
}

uint32_t __t5_atomic_fetch_xor32(volatile uint32_t *ptr, uint32_t val) {
  __t5_lock_acquire();
  uint32_t old = *ptr;
  *ptr = old ^ val;
  __t5_lock_release();
  return old;
}

/* NetBSD / C string & ffs & overflow runtime helpers */
size_t strlen(const char *s) {
  size_t n = 0;
  while (s[n] != '\0') n++;
  return n;
}

int strcmp(const char *a, const char *b) {
  while (*a && (*a == *b)) { a++; b++; }
  return (int)(unsigned char)*a - (int)(unsigned char)*b;
}

int __t5_ffs32(int x) {
  if (x == 0) return 0;
  return __t5_ctz32((uint32_t)x) + 1;
}

int __t5_ffs64(long long x) {
  if (x == 0) return 0;
  return __t5_ctz64((uint64_t)x) + 1;
}

bool __t5_uadd32_ovf(uint32_t a, uint32_t b, uint32_t *res) {
  uint32_t r = a + b;
  *res = r;
  return r < a;
}

bool __t5_sadd32_ovf(int32_t a, int32_t b, int32_t *res) {
  uint32_t ur = (uint32_t)a + (uint32_t)b;
  int32_t r = (int32_t)ur;
  *res = r;
  return ((b > 0) && (r < a)) || ((b < 0) && (r > a));
}

bool __t5_usub32_ovf(uint32_t a, uint32_t b, uint32_t *res) {
  uint32_t r = a - b;
  *res = r;
  return a < b;
}

bool __t5_ssub32_ovf(int32_t a, int32_t b, int32_t *res) {
  uint32_t ur = (uint32_t)a - (uint32_t)b;
  int32_t r = (int32_t)ur;
  *res = r;
  return ((b > 0) && (r > a)) || ((b < 0) && (r < a));
}

bool __t5_umul32_ovf(uint32_t a, uint32_t b, uint32_t *res) {
  uint64_t p = (uint64_t)a * (uint64_t)b;
  *res = (uint32_t)p;
  return (p >> 32) != 0ULL;
}

bool __t5_smul32_ovf(int32_t a, int32_t b, int32_t *res) {
  int64_t p = (int64_t)a * (int64_t)b;
  int32_t r = (int32_t)p;
  *res = r;
  return (int64_t)r != p;
}

bool __t5_uadd64_ovf(uint64_t a, uint64_t b, uint64_t *res) {
  uint64_t r = a + b;
  *res = r;
  return r < a;
}

bool __t5_sadd64_ovf(int64_t a, int64_t b, int64_t *res) {
  uint64_t ur = (uint64_t)a + (uint64_t)b;
  int64_t r = (int64_t)ur;
  *res = r;
  return ((b > 0) && (r < a)) || ((b < 0) && (r > a));
}

bool __t5_usub64_ovf(uint64_t a, uint64_t b, uint64_t *res) {
  uint64_t r = a - b;
  *res = r;
  return a < b;
}

bool __t5_ssub64_ovf(int64_t a, int64_t b, int64_t *res) {
  uint64_t ur = (uint64_t)a - (uint64_t)b;
  int64_t r = (int64_t)ur;
  *res = r;
  return ((b > 0) && (r > a)) || ((b < 0) && (r < a));
}

bool __t5_umul64_ovf(uint64_t a, uint64_t b, uint64_t *res) {
  uint64_t r = a * b;
  *res = r;
  if (a == 0ULL || b == 0ULL) return false;
  return (r / a) != b;
}

bool __t5_smul64_ovf(int64_t a, int64_t b, int64_t *res) {
  uint64_t ur = (uint64_t)a * (uint64_t)b;
  int64_t r = (int64_t)ur;
  *res = r;
  if (a == 0LL || b == 0LL) return false;
  if (a == (-9223372036854775807LL - 1LL) && b == -1LL) return true;
  if (b == (-9223372036854775807LL - 1LL) && a == -1LL) return true;
  return (r / a) != b;
}
