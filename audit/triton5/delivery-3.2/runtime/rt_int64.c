/*
 * Triton 5.0 64-Bit Integer Runtime (`runtime/rt_int64.c`)
 * ConsciousNode SoftWorks — MIT License
 * Implements 64-bit shifts, division, and modulo using 32-bit operations
 * (compiled by tcc5 itself).
 */

#include <stdint.h>

typedef union {
  uint64_t u64;
  int64_t  i64;
  struct { uint32_t lo; uint32_t hi; } p;
} u64_parts;

static inline uint64_t make_u64(uint32_t lo, uint32_t hi) {
  u64_parts x;
  x.p.lo = lo;
  x.p.hi = hi;
  return x.u64;
}

uint64_t __ashldi3(uint64_t a, int s) {
  u64_parts x;
  x.u64 = a;
  if (s <= 0) return a;
  if (s >= 64) return 0;
  if (s >= 32) return make_u64(0, x.p.lo << (s - 32));
  return make_u64(x.p.lo << s, (x.p.hi << s) | (x.p.lo >> (32 - s)));
}

uint64_t __lshrdi3(uint64_t a, int s) {
  u64_parts x;
  x.u64 = a;
  if (s <= 0) return a;
  if (s >= 64) return 0;
  if (s >= 32) return make_u64(x.p.hi >> (s - 32), 0);
  return make_u64((x.p.lo >> s) | (x.p.hi << (32 - s)), x.p.hi >> s);
}

int64_t __ashrdi3(int64_t a, int s) {
  u64_parts x;
  x.i64 = a;
  int32_t shi = (int32_t)x.p.hi;
  if (s <= 0) return a;
  if (s >= 64) {
    uint32_t fill = (shi < 0) ? 0xFFFFFFFFU : 0U;
    return (int64_t)make_u64(fill, fill);
  }
  if (s >= 32) {
    uint32_t fill = (shi < 0) ? 0xFFFFFFFFU : 0U;
    return (int64_t)make_u64((uint32_t)(shi >> (s - 32)), fill);
  }
  return (int64_t)make_u64((x.p.lo >> s) | (x.p.hi << (32 - s)), (uint32_t)(shi >> s));
}

/* Fast binary long division for uint64_t (returns quotient, optionally stores remainder) */
static uint64_t udivmod64(uint64_t n, uint64_t d, uint64_t *rem_out) {
  if (d == 0) {
    if (rem_out) *rem_out = 0;
    return 0;
  }
  u64_parts np, dp;
  np.u64 = n;
  dp.u64 = d;

  /* Fast path: both fit in 32 bits */
  if (np.p.hi == 0 && dp.p.hi == 0) {
    uint32_t q = np.p.lo / dp.p.lo;
    if (rem_out) *rem_out = (uint64_t)(np.p.lo - q * dp.p.lo);
    return (uint64_t)q;
  }

  /* Fast path: n < d */
  if (n < d) {
    if (rem_out) *rem_out = n;
    return 0;
  }

  /* Shift-and-subtract with leading-zero skip */
  int lz_n = __builtin_clzll(n);
  int lz_d = __builtin_clzll(d);
  int shift = lz_d - lz_n;
  uint64_t denom = d << shift;
  uint64_t q = 0;
  uint64_t r = n;
  for (int i = shift; i >= 0; i--) {
    q = (q << 1);
    if (r >= denom) {
      r = r - denom;
      q = q | 1ULL;
    }
    denom = denom >> 1;
  }
  if (rem_out) *rem_out = r;
  return q;
}

uint64_t __udivdi3(uint64_t a, uint64_t b) {
  return udivmod64(a, b, (uint64_t *)0);
}

uint64_t __umoddi3(uint64_t a, uint64_t b) {
  uint64_t r = 0;
  udivmod64(a, b, &r);
  return r;
}

int64_t __divdi3(int64_t a, int64_t b) {
  int neg = 0;
  uint64_t ua = (uint64_t)a;
  uint64_t ub = (uint64_t)b;
  if (a < 0) { ua = 0ULL - ua; neg = !neg; }
  if (b < 0) { ub = 0ULL - ub; neg = !neg; }
  uint64_t q = udivmod64(ua, ub, (uint64_t *)0);
  return neg ? (int64_t)(0ULL - q) : (int64_t)q;
}

int64_t __moddi3(int64_t a, int64_t b) {
  int neg = 0;
  uint64_t ua = (uint64_t)a;
  uint64_t ub = (uint64_t)b;
  if (a < 0) { ua = 0ULL - ua; neg = 1; }
  if (b < 0) { ub = 0ULL - ub; }
  uint64_t r = 0;
  udivmod64(ua, ub, &r);
  return neg ? (int64_t)(0ULL - r) : (int64_t)r;
}
