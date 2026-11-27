/*
 * Triton 5.0 IEEE 754 Software Floating-Point Runtime (`runtime/rt_softfp.c`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Bit-exact IEEE 754 binary32 (float) and binary64 (double) arithmetic and
 * conversions with round-to-nearest-even (ties-to-even), signed zeros,
 * subnormals, infinities, and NaN quieting. Written from scratch in C11
 * and compiled by tcc5 itself.
 */

#include <stdint.h>

/* =========================================================================
 * Helper: Right shift with sticky bit (jam)
 * ========================================================================= */
static uint32_t shr_jam32(uint32_t v, int s) {
  if (s <= 0) return v;
  if (s >= 32) return (v != 0U) ? 1U : 0U;
  uint32_t lost = v << (32 - s);
  return (v >> s) | ((lost != 0U) ? 1U : 0U);
}

static uint64_t shr_jam64(uint64_t v, int s) {
  if (s <= 0) return v;
  if (s >= 64) return (v != 0ULL) ? 1ULL : 0ULL;
  uint64_t lost = v << (64 - s);
  return (v >> s) | ((lost != 0ULL) ? 1ULL : 0ULL);
}

/* =========================================================================
 * IEEE 754 binary32 (float) — 1 sign, 8 exp (bias 127), 23 frac
 * ========================================================================= */
#define F32_QNAN 0x7FC00000U
#define F32_INF  0x7F800000U

/* Pack sign (0/1), unbiased-plus-127 exp (for sig with bit 26 = 1.0, 3 guard/round/sticky bits in bits 2..0) */
static uint32_t pack_f32(uint32_t sign, int32_t exp, uint32_t sig) {
  /* Normalize sig so bit 26 is the leading 1 (0x04000000 .. 0x07FFFFFF) */
  if (sig == 0U) return sign << 31;
  while (sig >= 0x08000000U) {
    sig = (sig >> 1) | (sig & 1U);
    exp++;
  }
  while (sig < 0x04000000U) {
    sig <<= 1;
    exp--;
  }
  /* Subnormal handling */
  if (exp <= 0) {
    int shift = 1 - exp;
    sig = shr_jam32(sig, shift);
    exp = 0;
  }
  /* Round to nearest even using bits 2..0 (bit 2 = guard, bits 1..0 = round|sticky) */
  uint32_t grs = sig & 7U;
  uint32_t mant = sig >> 3;
  if (grs > 4U || (grs == 4U && (mant & 1U))) {
    mant++;
    if (exp == 0) {
      if (mant >= 0x00800000U) {
        exp = 1;
        mant &= 0x007FFFFFU;
      }
    } else if (mant >= 0x01000000U) {
      mant >>= 1;
      exp++;
    }
  }
  if (exp >= 255) return (sign << 31) | F32_INF;
  return (sign << 31) | ((uint32_t)exp << 23) | (mant & 0x007FFFFFU);
}

static uint32_t f32_add_core(uint32_t a, uint32_t b) {
  uint32_t sa = a >> 31, sb = b >> 31;
  int32_t ea = (int32_t)((a >> 23) & 0xFFU);
  int32_t eb = (int32_t)((b >> 23) & 0xFFU);
  uint32_t fa = a & 0x007FFFFFU;
  uint32_t fb = b & 0x007FFFFFU;

  /* NaNs */
  if (ea == 255 && fa != 0U) return a | 0x00400000U;
  if (eb == 255 && fb != 0U) return b | 0x00400000U;
  /* Infinities */
  if (ea == 255 && eb == 255) {
    if (sa != sb) return F32_QNAN;
    return a;
  }
  if (ea == 255) return a;
  if (eb == 255) return b;

  /* Zeros */
  if (ea == 0 && fa == 0U) {
    if (eb == 0 && fb == 0U) return (sa & sb) << 31;
    return b;
  }
  if (eb == 0 && fb == 0U) return a;

  uint32_t ma = (ea == 0) ? (fa << 3) : ((fa | 0x00800000U) << 3);
  uint32_t mb = (eb == 0) ? (fb << 3) : ((fb | 0x00800000U) << 3);
  if (ea == 0) ea = 1;
  if (eb == 0) eb = 1;

  if (ea < eb || (ea == eb && ma < mb)) {
    uint32_t ts = sa; sa = sb; sb = ts;
    int32_t te = ea; ea = eb; eb = te;
    uint32_t tm = ma; ma = mb; mb = tm;
  }

  int32_t diff = ea - eb;
  mb = shr_jam32(mb, diff);

  if (sa == sb) {
    return pack_f32(sa, ea, ma + mb);
  } else {
    uint32_t res = ma - mb;
    if (res == 0U) return 0U; /* IEEE 754 RNE: exact cancellation yields +0.0 */
    return pack_f32(sa, ea, res);
  }
}

uint32_t __t5_fadd(uint32_t a, uint32_t b) { return f32_add_core(a, b); }
uint32_t __t5_fsub(uint32_t a, uint32_t b) { return f32_add_core(a, b ^ 0x80000000U); }

uint32_t __t5_fmul(uint32_t a, uint32_t b) {
  uint32_t sa = a >> 31, sb = b >> 31;
  uint32_t sign = sa ^ sb;
  int32_t ea = (int32_t)((a >> 23) & 0xFFU);
  int32_t eb = (int32_t)((b >> 23) & 0xFFU);
  uint32_t fa = a & 0x007FFFFFU;
  uint32_t fb = b & 0x007FFFFFU;

  if (ea == 255 && fa != 0U) return a | 0x00400000U;
  if (eb == 255 && fb != 0U) return b | 0x00400000U;
  if (ea == 255 || eb == 255) {
    if ((ea == 0 && fa == 0U) || (eb == 0 && fb == 0U)) return F32_QNAN;
    return (sign << 31) | F32_INF;
  }
  if ((ea == 0 && fa == 0U) || (eb == 0 && fb == 0U)) return sign << 31;

  uint32_t ma = (ea == 0) ? fa : (fa | 0x00800000U);
  uint32_t mb = (eb == 0) ? fb : (fb | 0x00800000U);
  if (ea == 0) { ea = 1; while ((ma & 0x00800000U) == 0U) { ma <<= 1; ea--; } }
  if (eb == 0) { eb = 1; while ((mb & 0x00800000U) == 0U) { mb <<= 1; eb--; } }

  uint64_t prod = (uint64_t)ma * (uint64_t)mb; /* 47 or 48 bits */
  int32_t exp = ea + eb - 127;
  uint32_t sig;
  if (prod & (1ULL << 47)) {
    sig = (uint32_t)shr_jam64(prod, 21); /* 48 - 21 = 27 bits -> bit 26 set */
    exp++;
  } else {
    sig = (uint32_t)shr_jam64(prod, 20); /* 47 - 20 = 27 bits -> bit 26 set */
  }
  return pack_f32(sign, exp, sig);
}

uint32_t __t5_fdiv(uint32_t a, uint32_t b) {
  uint32_t sa = a >> 31, sb = b >> 31;
  uint32_t sign = sa ^ sb;
  int32_t ea = (int32_t)((a >> 23) & 0xFFU);
  int32_t eb = (int32_t)((b >> 23) & 0xFFU);
  uint32_t fa = a & 0x007FFFFFU;
  uint32_t fb = b & 0x007FFFFFU;

  if (ea == 255 && fa != 0U) return a | 0x00400000U;
  if (eb == 255 && fb != 0U) return b | 0x00400000U;
  if (ea == 255 && eb == 255) return F32_QNAN;
  if (ea == 255) return (sign << 31) | F32_INF;
  if (eb == 255) return sign << 31;
  if (eb == 0 && fb == 0U) {
    if (ea == 0 && fa == 0U) return F32_QNAN;
    return (sign << 31) | F32_INF;
  }
  if (ea == 0 && fa == 0U) return sign << 31;

  uint32_t ma = (ea == 0) ? fa : (fa | 0x00800000U);
  uint32_t mb = (eb == 0) ? fb : (fb | 0x00800000U);
  if (ea == 0) { ea = 1; while ((ma & 0x00800000U) == 0U) { ma <<= 1; ea--; } }
  if (eb == 0) { eb = 1; while ((mb & 0x00800000U) == 0U) { mb <<= 1; eb--; } }

  int32_t exp = ea - eb + 127;
  uint64_t num = (uint64_t)ma << 26;
  if (ma < mb) { num <<= 1; exp--; }
  uint64_t q = num / (uint64_t)mb;
  uint64_t r = num - q * (uint64_t)mb;
  uint32_t sig = (uint32_t)q | ((r != 0ULL) ? 1U : 0U);
  return pack_f32(sign, exp, sig);
}

int __t5_fcmp(uint32_t a, uint32_t b) {
  if (((a & 0x7FFFFFFFU) > F32_INF) || ((b & 0x7FFFFFFFU) > F32_INF)) return 2;
  if (((a | b) & 0x7FFFFFFFU) == 0U) return 0; /* +0.0 == -0.0 */
  if (a == b) return 0;
  uint32_t sa = a >> 31, sb = b >> 31;
  if (sa != sb) return sa ? -1 : 1;
  if (sa) return (a > b) ? -1 : 1;
  return (a < b) ? -1 : 1;
}

uint32_t __t5_u32tof(uint32_t x) {
  if (x == 0U) return 0U;
  int lz = __builtin_clz(x);
  int32_t exp = 127 + (31 - lz);
  uint32_t sig;
  if (lz < 5) {
    sig = shr_jam32(x, 5 - lz);
  } else {
    sig = x << (lz - 5);
  }
  return pack_f32(0U, exp, sig);
}

uint32_t __t5_i32tof(int32_t x) {
  if (x == 0) return 0U;
  uint32_t sign = (x < 0) ? 1U : 0U;
  uint32_t ux = sign ? (0U - (uint32_t)x) : (uint32_t)x;
  uint32_t res = __t5_u32tof(ux);
  return res | (sign << 31);
}

uint32_t __t5_u64tof(uint64_t x) {
  if (x == 0ULL) return 0U;
  int lz = __builtin_clzll(x);
  int32_t exp = 127 + (63 - lz);
  uint32_t sig;
  if (lz < 37) {
    sig = (uint32_t)shr_jam64(x, 37 - lz);
  } else {
    sig = (uint32_t)(x << (lz - 37));
  }
  return pack_f32(0U, exp, sig);
}

uint32_t __t5_i64tof(int64_t x) {
  if (x == 0LL) return 0U;
  uint32_t sign = (x < 0LL) ? 1U : 0U;
  uint64_t ux = sign ? (0ULL - (uint64_t)x) : (uint64_t)x;
  uint32_t res = __t5_u64tof(ux);
  return res | (sign << 31);
}

int32_t __t5_ftoi32(uint32_t a) {
  uint32_t sign = a >> 31;
  int32_t exp = (int32_t)((a >> 23) & 0xFFU) - 127;
  uint32_t frac = a & 0x007FFFFFU;
  if (exp < 0) return 0;
  if (exp >= 31) {
    if (exp == 31 && sign && frac == 0U) return (int32_t)0x80000000U;
    return (int32_t)0x80000000U; /* x86 cvttss2si indefinite / overflow */
  }
  uint32_t mant = frac | 0x00800000U;
  uint32_t val = (exp >= 23) ? (mant << (exp - 23)) : (mant >> (23 - exp));
  return sign ? (int32_t)(0U - val) : (int32_t)val;
}

uint32_t __t5_ftou32(uint32_t a) {
  uint32_t sign = a >> 31;
  int32_t exp = (int32_t)((a >> 23) & 0xFFU) - 127;
  uint32_t frac = a & 0x007FFFFFU;
  if (sign || exp < 0) return 0U;
  if (exp >= 32) return 0U;
  uint32_t mant = frac | 0x00800000U;
  return (exp >= 23) ? (mant << (exp - 23)) : (mant >> (23 - exp));
}

int64_t __t5_ftoi64(uint32_t a) {
  uint32_t sign = a >> 31;
  int32_t exp = (int32_t)((a >> 23) & 0xFFU) - 127;
  uint32_t frac = a & 0x007FFFFFU;
  if (exp < 0) return 0LL;
  if (exp >= 63) return (int64_t)0x8000000000000000ULL;
  uint64_t mant = (uint64_t)(frac | 0x00800000U);
  uint64_t val = (exp >= 23) ? (mant << (exp - 23)) : (mant >> (23 - exp));
  return sign ? (int64_t)(0ULL - val) : (int64_t)val;
}

uint64_t __t5_ftou64(uint32_t a) {
  uint32_t sign = a >> 31;
  int32_t exp = (int32_t)((a >> 23) & 0xFFU) - 127;
  uint32_t frac = a & 0x007FFFFFU;
  if (sign || exp < 0) return 0ULL;
  if (exp >= 64) return 0ULL;
  uint64_t mant = (uint64_t)(frac | 0x00800000U);
  return (exp >= 23) ? (mant << (exp - 23)) : (mant >> (23 - exp));
}

/* =========================================================================
 * IEEE 754 binary64 (double) — 1 sign, 11 exp (bias 1023), 52 frac
 * ========================================================================= */
#define F64_QNAN 0x7FF8000000000000ULL
#define F64_INF  0x7FF0000000000000ULL
#define F64_SIGN 0x8000000000000000ULL
#define F64_FRAC 0x000FFFFFFFFFFFFFULL
#define F64_IMP  0x0010000000000000ULL

/* sig has leading 1 at bit 55 (0x0080000000000000ULL), bits 2..0 = G/R/S */
static uint64_t pack_f64(uint64_t sign, int32_t exp, uint64_t sig) {
  if (sig == 0ULL) return sign << 63;
  while (sig >= 0x0100000000000000ULL) {
    sig = (sig >> 1) | (sig & 1ULL);
    exp++;
  }
  while (sig < 0x0080000000000000ULL) {
    sig <<= 1;
    exp--;
  }
  if (exp <= 0) {
    int shift = 1 - exp;
    sig = shr_jam64(sig, shift);
    exp = 0;
  }
  uint64_t grs = sig & 7ULL;
  uint64_t mant = sig >> 3;
  if (grs > 4ULL || (grs == 4ULL && (mant & 1ULL))) {
    mant++;
    if (exp == 0) {
      if (mant >= F64_IMP) {
        exp = 1;
        mant &= F64_FRAC;
      }
    } else if (mant >= (F64_IMP << 1)) {
      mant >>= 1;
      exp++;
    }
  }
  if (exp >= 2047) return (sign << 63) | F64_INF;
  return (sign << 63) | ((uint64_t)exp << 52) | (mant & F64_FRAC);
}

static uint64_t f64_add_core(uint64_t a, uint64_t b) {
  uint64_t sa = a >> 63, sb = b >> 63;
  int32_t ea = (int32_t)((a >> 52) & 0x7FFU);
  int32_t eb = (int32_t)((b >> 52) & 0x7FFU);
  uint64_t fa = a & F64_FRAC;
  uint64_t fb = b & F64_FRAC;

  if (ea == 2047 && fa != 0ULL) return a | 0x0008000000000000ULL;
  if (eb == 2047 && fb != 0ULL) return b | 0x0008000000000000ULL;
  if (ea == 2047 && eb == 2047) {
    if (sa != sb) return F64_QNAN;
    return a;
  }
  if (ea == 2047) return a;
  if (eb == 2047) return b;

  if (ea == 0 && fa == 0ULL) {
    if (eb == 0 && fb == 0ULL) return (sa & sb) << 63;
    return b;
  }
  if (eb == 0 && fb == 0ULL) return a;

  uint64_t ma = (ea == 0) ? (fa << 3) : ((fa | F64_IMP) << 3);
  uint64_t mb = (eb == 0) ? (fb << 3) : ((fb | F64_IMP) << 3);
  if (ea == 0) ea = 1;
  if (eb == 0) eb = 1;

  if (ea < eb || (ea == eb && ma < mb)) {
    uint64_t ts = sa; sa = sb; sb = ts;
    int32_t te = ea; ea = eb; eb = te;
    uint64_t tm = ma; ma = mb; mb = tm;
  }

  int32_t diff = ea - eb;
  mb = shr_jam64(mb, diff);

  if (sa == sb) {
    return pack_f64(sa, ea, ma + mb);
  } else {
    uint64_t res = ma - mb;
    if (res == 0ULL) return 0ULL;
    return pack_f64(sa, ea, res);
  }
}

uint64_t __t5_dadd(uint64_t a, uint64_t b) { return f64_add_core(a, b); }
uint64_t __t5_dsub(uint64_t a, uint64_t b) { return f64_add_core(a, b ^ F64_SIGN); }

/* Exact 64x64 -> 128-bit unsigned multiply */
static void mul64x64_128(uint64_t a, uint64_t b, uint64_t *hi_out, uint64_t *lo_out) {
  uint64_t a0 = a & 0xFFFFFFFFULL, a1 = a >> 32;
  uint64_t b0 = b & 0xFFFFFFFFULL, b1 = b >> 32;
  uint64_t p00 = a0 * b0;
  uint64_t p01 = a0 * b1;
  uint64_t p10 = a1 * b0;
  uint64_t p11 = a1 * b1;
  uint64_t mid = (p00 >> 32) + (p01 & 0xFFFFFFFFULL) + (p10 & 0xFFFFFFFFULL);
  *lo_out = (p00 & 0xFFFFFFFFULL) | (mid << 32);
  *hi_out = p11 + (p01 >> 32) + (p10 >> 32) + (mid >> 32);
}

uint64_t __t5_dmul(uint64_t a, uint64_t b) {
  uint64_t sign = (a >> 63) ^ (b >> 63);
  int32_t ea = (int32_t)((a >> 52) & 0x7FFU);
  int32_t eb = (int32_t)((b >> 52) & 0x7FFU);
  uint64_t fa = a & F64_FRAC;
  uint64_t fb = b & F64_FRAC;

  if (ea == 2047 && fa != 0ULL) return a | 0x0008000000000000ULL;
  if (eb == 2047 && fb != 0ULL) return b | 0x0008000000000000ULL;
  if (ea == 2047 || eb == 2047) {
    if ((ea == 0 && fa == 0ULL) || (eb == 0 && fb == 0ULL)) return F64_QNAN;
    return (sign << 63) | F64_INF;
  }
  if ((ea == 0 && fa == 0ULL) || (eb == 0 && fb == 0ULL)) return sign << 63;

  uint64_t ma = (ea == 0) ? fa : (fa | F64_IMP);
  uint64_t mb = (eb == 0) ? fb : (fb | F64_IMP);
  if (ea == 0) { ea = 1; while ((ma & F64_IMP) == 0ULL) { ma <<= 1; ea--; } }
  if (eb == 0) { eb = 1; while ((mb & F64_IMP) == 0ULL) { mb <<= 1; eb--; } }

  /* ma, mb in [2^52, 2^53). Shift left by 11 so product is in [2^126, 2^128) */
  uint64_t hi, lo;
  mul64x64_128(ma << 11, mb << 11, &hi, &lo);
  int32_t exp = ea + eb - 1023;
  /* hi is in [2^62, 2^64) */
  uint64_t sig;
  if (hi & (1ULL << 63)) {
    sig = shr_jam64(hi, 8) | ((lo != 0ULL) ? 1ULL : 0ULL); /* bit 55 set */
    exp++;
  } else {
    sig = shr_jam64(hi, 7) | ((lo != 0ULL) ? 1ULL : 0ULL); /* bit 55 set */
  }
  return pack_f64(sign, exp, sig);
}

uint64_t __t5_ddiv(uint64_t a, uint64_t b) {
  uint64_t sign = (a >> 63) ^ (b >> 63);
  int32_t ea = (int32_t)((a >> 52) & 0x7FFU);
  int32_t eb = (int32_t)((b >> 52) & 0x7FFU);
  uint64_t fa = a & F64_FRAC;
  uint64_t fb = b & F64_FRAC;

  if (ea == 2047 && fa != 0ULL) return a | 0x0008000000000000ULL;
  if (eb == 2047 && fb != 0ULL) return b | 0x0008000000000000ULL;
  if (ea == 2047 && eb == 2047) return F64_QNAN;
  if (ea == 2047) return (sign << 63) | F64_INF;
  if (eb == 2047) return sign << 63;
  if (eb == 0 && fb == 0ULL) {
    if (ea == 0 && fa == 0ULL) return F64_QNAN;
    return (sign << 63) | F64_INF;
  }
  if (ea == 0 && fa == 0ULL) return sign << 63;

  uint64_t ma = (ea == 0) ? fa : (fa | F64_IMP);
  uint64_t mb = (eb == 0) ? fb : (fb | F64_IMP);
  if (ea == 0) { ea = 1; while ((ma & F64_IMP) == 0ULL) { ma <<= 1; ea--; } }
  if (eb == 0) { eb = 1; while ((mb & F64_IMP) == 0ULL) { mb <<= 1; eb--; } }

  int32_t exp = ea - eb + 1023;
  if (ma < mb) { ma <<= 1; exp--; }
  /* Compute 55 quotient bits (bit 55 down to bit 1), then bit 0 = (rem != 0) */
  uint64_t rem = ma;
  uint64_t q = 0ULL;
  for (int i = 55; i >= 1; i--) {
    q <<= 1;
    if (rem >= mb) {
      rem -= mb;
      q |= 1ULL;
    }
    rem <<= 1;
  }
  uint64_t sig = (q << 1) | ((rem != 0ULL) ? 1ULL : 0ULL);
  return pack_f64(sign, exp, sig);
}

int __t5_dcmp(uint64_t a, uint64_t b) {
  if (((a & 0x7FFFFFFFFFFFFFFFULL) > F64_INF) || ((b & 0x7FFFFFFFFFFFFFFFULL) > F64_INF)) return 2;
  if (((a | b) & 0x7FFFFFFFFFFFFFFFULL) == 0ULL) return 0;
  if (a == b) return 0;
  uint64_t sa = a >> 63, sb = b >> 63;
  if (sa != sb) return sa ? -1 : 1;
  if (sa) return (a > b) ? -1 : 1;
  return (a < b) ? -1 : 1;
}

uint64_t __t5_ftod(uint32_t a) {
  uint64_t sign = (uint64_t)(a >> 31);
  int32_t exp = (int32_t)((a >> 23) & 0xFFU);
  uint32_t frac = a & 0x007FFFFFU;
  if (exp == 255) {
    if (frac != 0U) return (sign << 63) | F64_QNAN | ((uint64_t)frac << 29);
    return (sign << 63) | F64_INF;
  }
  if (exp == 0) {
    if (frac == 0U) return sign << 63;
    exp = 1;
    while ((frac & 0x00800000U) == 0U) { frac <<= 1; exp--; }
    frac &= 0x007FFFFFU;
  }
  return (sign << 63) | ((uint64_t)(exp - 127 + 1023) << 52) | ((uint64_t)frac << 29);
}

uint32_t __t5_dtof(uint64_t a) {
  uint32_t sign = (uint32_t)(a >> 63);
  int32_t exp = (int32_t)((a >> 52) & 0x7FFU);
  uint64_t frac = a & F64_FRAC;
  if (exp == 2047) {
    if (frac != 0ULL) return (sign << 31) | F32_QNAN | (uint32_t)(frac >> 29);
    return (sign << 31) | F32_INF;
  }
  if (exp == 0 && frac == 0ULL) return sign << 31;
  uint64_t mant = (exp == 0) ? frac : (frac | F64_IMP);
  if (exp == 0) {
    exp = 1;
    while ((mant & F64_IMP) == 0ULL) { mant <<= 1; exp--; }
  }
  uint32_t sig = (uint32_t)shr_jam64(mant, 26); /* 53 - 26 = 27 bits -> bit 26 set */
  return pack_f32(sign, exp - 1023 + 127, sig);
}

uint64_t __t5_u32tod(uint32_t x) {
  if (x == 0U) return 0ULL;
  int lz = __builtin_clz(x);
  int32_t exp = 1023 + (31 - lz);
  uint64_t sig = (uint64_t)x << (lz + 24);
  return pack_f64(0ULL, exp, sig);
}

uint64_t __t5_i32tod(int32_t x) {
  if (x == 0) return 0ULL;
  uint64_t sign = (x < 0) ? 1ULL : 0ULL;
  uint32_t ux = sign ? (0U - (uint32_t)x) : (uint32_t)x;
  return __t5_u32tod(ux) | (sign << 63);
}

uint64_t __t5_u64tod(uint64_t x) {
  if (x == 0ULL) return 0ULL;
  int lz = __builtin_clzll(x);
  int32_t exp = 1023 + (63 - lz);
  uint64_t sig;
  if (lz < 8) {
    sig = shr_jam64(x, 8 - lz);
  } else {
    sig = x << (lz - 8);
  }
  return pack_f64(0ULL, exp, sig);
}

uint64_t __t5_i64tod(int64_t x) {
  if (x == 0LL) return 0ULL;
  uint64_t sign = (x < 0LL) ? 1ULL : 0ULL;
  uint64_t ux = sign ? (0ULL - (uint64_t)x) : (uint64_t)x;
  return __t5_u64tod(ux) | (sign << 63);
}

int32_t __t5_dtoi32(uint64_t a) {
  uint64_t sign = a >> 63;
  int32_t exp = (int32_t)((a >> 52) & 0x7FFU) - 1023;
  uint64_t frac = a & F64_FRAC;
  if (exp < 0) return 0;
  if (exp >= 31) {
    if (exp == 31 && sign && frac == 0ULL) return (int32_t)0x80000000U;
    return (int32_t)0x80000000U;
  }
  uint64_t mant = frac | F64_IMP;
  uint32_t val = (uint32_t)(mant >> (52 - exp));
  return sign ? (int32_t)(0U - val) : (int32_t)val;
}

uint32_t __t5_dtou32(uint64_t a) {
  uint64_t sign = a >> 63;
  int32_t exp = (int32_t)((a >> 52) & 0x7FFU) - 1023;
  uint64_t frac = a & F64_FRAC;
  if (sign || exp < 0 || exp >= 32) return 0U;
  uint64_t mant = frac | F64_IMP;
  return (uint32_t)(mant >> (52 - exp));
}

int64_t __t5_dtoi64(uint64_t a) {
  uint64_t sign = a >> 63;
  int32_t exp = (int32_t)((a >> 52) & 0x7FFU) - 1023;
  uint64_t frac = a & F64_FRAC;
  if (exp < 0) return 0LL;
  if (exp >= 63) return (int64_t)0x8000000000000000ULL;
  uint64_t mant = frac | F64_IMP;
  uint64_t val = (exp >= 52) ? (mant << (exp - 52)) : (mant >> (52 - exp));
  return sign ? (int64_t)(0ULL - val) : (int64_t)val;
}

uint64_t __t5_dtou64(uint64_t a) {
  uint64_t sign = a >> 63;
  int32_t exp = (int32_t)((a >> 52) & 0x7FFU) - 1023;
  uint64_t frac = a & F64_FRAC;
  if (sign || exp < 0 || exp >= 64) return 0ULL;
  uint64_t mant = frac | F64_IMP;
  return (exp >= 52) ? (mant << (exp - 52)) : (mant >> (52 - exp));
}
