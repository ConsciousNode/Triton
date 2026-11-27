/*
 * ConsciousNode TritonBench-5K — Real-Sized ISO C11 Freestanding Application Suite
 * License: MIT (ConsciousNode SoftWorks)
 * Over 5,000 lines of real C11: SHA-256, ChaCha20, CRC32, Adler-32, LZ77,
 * Stack Bytecode VM, Expression Parser, JSON Parser, Hash Table, Sorting,
 * Graph Dijkstra, 3D Ray-Sphere Math, Regex Matcher, N-Queens, and Matrix Ops.
 */
#ifdef HOST_GCC
#include <stdio.h>
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include <string.h>
static void tb_puts(const char *s) { fputs(s, stdout); }
static void tb_puthex32(uint32_t v) { printf("%08x", v); }
static void tb_putint(int v) { printf("%d", v); }
#else
#include <triton5.h>
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
static void tb_puts(const char *s) { t5_puts(s); }
static void tb_puthex32(uint32_t v) { t5_puthex32(v); }
static void tb_putint(int v) { t5_putint(v); }
#endif

static size_t tb_strlen(const char *s) {
  size_t n = 0;
  while (s[n]) n++;
  return n;
}

/* =========================================================================
 * Module 1: SHA-256 (FIPS 180-4)
 * ========================================================================= */
static const uint32_t SHA256_K[64] = {
  0x428a2f98U, 0x71374491U, 0xb5c0fbcfU, 0xe9b5dba5U, 0x3956c25bU, 0x59f111f1U, 0x923f82a4U, 0xab1c5ed5U,
  0xd807aa98U, 0x12835b01U, 0x243185beU, 0x550c7dc3U, 0x72be5d74U, 0x80deb1feU, 0x9bdc06a7U, 0xc19bf174U,
  0xe49b69c1U, 0xefbe4786U, 0x0fc19dc6U, 0x240ca1ccU, 0x2de92c6fU, 0x4a7484aaU, 0x5cb0a9dcU, 0x76f988daU,
  0x983e5152U, 0xa831c66dU, 0xb00327c8U, 0xbf597fc7U, 0xc6e00bf3U, 0xd5a79147U, 0x06ca6351U, 0x14292967U,
  0x27b70a85U, 0x2e1b2138U, 0x4d2c6dfcU, 0x53380d13U, 0x650a7354U, 0x766a0abbU, 0x81c2c92eU, 0x92722c85U,
  0xa2bfe8a1U, 0xa81a664bU, 0xc24b8b70U, 0xc76c51a3U, 0xd192e819U, 0xd6990624U, 0xf40e3585U, 0x106aa070U,
  0x19a4c116U, 0x1e376c08U, 0x2748774cU, 0x34b0bcb5U, 0x391c0cb3U, 0x4ed8aa4aU, 0x5b9cca4fU, 0x682e6ff3U,
  0x748f82eeU, 0x78a5636fU, 0x84c87814U, 0x8cc70208U, 0x90befffaU, 0xa4506cebU, 0xbef9a3f7U, 0xc67178f2U
};

static inline uint32_t rotr32(uint32_t x, uint32_t n) { return (x >> n) | (x << (32U - n)); }
static inline uint32_t rotl32(uint32_t x, uint32_t n) { return (x << n) | (x >> (32U - n)); }

struct Sha256Ctx {
  uint32_t state[8];
  uint8_t buf[64];
  uint32_t buflen;
  uint64_t total_bits;
};

static void sha256_init(struct Sha256Ctx *ctx) {
  ctx->state[0] = 0x6a09e667U; ctx->state[1] = 0xbb67ae85U;
  ctx->state[2] = 0x3c6ef372U; ctx->state[3] = 0xa54ff53aU;
  ctx->state[4] = 0x510e527fU; ctx->state[5] = 0x9b05688cU;
  ctx->state[6] = 0x1f83d9abU; ctx->state[7] = 0x5be0cd19U;
  ctx->buflen = 0;
  ctx->total_bits = 0;
}

static void sha256_compress(struct Sha256Ctx *ctx, const uint8_t blk[64]) {
  uint32_t w[64];
  for (int i = 0; i < 16; i++) {
    w[i] = ((uint32_t)blk[i * 4] << 24) | ((uint32_t)blk[i * 4 + 1] << 16) |
           ((uint32_t)blk[i * 4 + 2] << 8) | (uint32_t)blk[i * 4 + 3];
  }
  for (int i = 16; i < 64; i++) {
    uint32_t s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >> 3);
    uint32_t s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >> 10);
    w[i] = w[i - 16] + s0 + w[i - 7] + s1;
  }
  uint32_t a = ctx->state[0], b = ctx->state[1], c = ctx->state[2], d = ctx->state[3];
  uint32_t e = ctx->state[4], f = ctx->state[5], g = ctx->state[6], h = ctx->state[7];
  for (int i = 0; i < 64; i++) {
    uint32_t S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
    uint32_t ch = (e & f) ^ ((~e) & g);
    uint32_t t1 = h + S1 + ch + SHA256_K[i] + w[i];
    uint32_t S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
    uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
    uint32_t t2 = S0 + maj;
    h = g; g = f; f = e; e = d + t1;
    d = c; c = b; b = a; a = t1 + t2;
  }
  ctx->state[0] += a; ctx->state[1] += b; ctx->state[2] += c; ctx->state[3] += d;
  ctx->state[4] += e; ctx->state[5] += f; ctx->state[6] += g; ctx->state[7] += h;
}

static void sha256_update(struct Sha256Ctx *ctx, const uint8_t *data, size_t len) {
  for (size_t i = 0; i < len; i++) {
    ctx->buf[ctx->buflen++] = data[i];
    ctx->total_bits += 8;
    if (ctx->buflen == 64) {
      sha256_compress(ctx, ctx->buf);
      ctx->buflen = 0;
    }
  }
}

static void sha256_final(struct Sha256Ctx *ctx, uint8_t out[32]) {
  uint64_t bits = ctx->total_bits;
  ctx->buf[ctx->buflen++] = 0x80;
  if (ctx->buflen > 56) {
    while (ctx->buflen < 64) ctx->buf[ctx->buflen++] = 0;
    sha256_compress(ctx, ctx->buf);
    ctx->buflen = 0;
  }
  while (ctx->buflen < 56) ctx->buf[ctx->buflen++] = 0;
  for (int i = 7; i >= 0; i--) ctx->buf[ctx->buflen++] = (uint8_t)((bits >> (i * 8)) & 0xFFU);
  sha256_compress(ctx, ctx->buf);
  for (int i = 0; i < 8; i++) {
    out[i * 4]     = (uint8_t)(ctx->state[i] >> 24);
    out[i * 4 + 1] = (uint8_t)(ctx->state[i] >> 16);
    out[i * 4 + 2] = (uint8_t)(ctx->state[i] >> 8);
    out[i * 4 + 3] = (uint8_t)(ctx->state[i]);
  }
}

/* =========================================================================
 * Module 2: ChaCha20 Stream Cipher (RFC 8439)
 * ========================================================================= */
static void chacha_qr(uint32_t *a, uint32_t *b, uint32_t *c, uint32_t *d) {
  *a += *b; *d ^= *a; *d = rotl32(*d, 16);
  *c += *d; *b ^= *c; *b = rotl32(*b, 12);
  *a += *b; *d ^= *a; *d = rotl32(*d, 8);
  *c += *d; *b ^= *c; *b = rotl32(*b, 7);
}

static void chacha20_block(uint32_t out[16], const uint32_t key[8], uint32_t counter, const uint32_t nonce[3]) {
  uint32_t st[16];
  st[0] = 0x61707865U; st[1] = 0x3320646eU; st[2] = 0x79622d32U; st[3] = 0x6b206574U;
  for (int i = 0; i < 8; i++) st[4 + i] = key[i];
  st[12] = counter;
  st[13] = nonce[0]; st[14] = nonce[1]; st[15] = nonce[2];
  for (int i = 0; i < 16; i++) out[i] = st[i];
  for (int r = 0; r < 10; r++) {
    chacha_qr(&out[0], &out[4], &out[8],  &out[12]);
    chacha_qr(&out[1], &out[5], &out[9],  &out[13]);
    chacha_qr(&out[2], &out[6], &out[10], &out[14]);
    chacha_qr(&out[3], &out[7], &out[11], &out[15]);
    chacha_qr(&out[0], &out[5], &out[10], &out[15]);
    chacha_qr(&out[1], &out[6], &out[11], &out[12]);
    chacha_qr(&out[2], &out[7], &out[8],  &out[13]);
    chacha_qr(&out[3], &out[4], &out[9],  &out[14]);
  }
  for (int i = 0; i < 16; i++) out[i] += st[i];
}

/* =========================================================================
 * Module 3: CRC32 (IEEE 802.3) & Adler-32
 * ========================================================================= */
static uint32_t crc32_calc(const uint8_t *data, size_t len) {
  uint32_t crc = 0xFFFFFFFFU;
  for (size_t i = 0; i < len; i++) {
    crc ^= (uint32_t)data[i];
    for (int b = 0; b < 8; b++) {
      crc = (crc >> 1) ^ (0xEDB88320U & (0U - (crc & 1U)));
    }
  }
  return ~crc;
}

static uint32_t adler32_calc(const uint8_t *data, size_t len) {
  uint32_t a = 1, b = 0;
  for (size_t i = 0; i < len; i++) {
    a = (a + data[i]) % 65521U;
    b = (b + a) % 65521U;
  }
  return (b << 16) | a;
}

/* =========================================================================
 * Module 4: LZ77 Compressor & Decompressor
 * ========================================================================= */
static size_t lz77_compress(const uint8_t *in, size_t in_len, uint8_t *out) {
  size_t ip = 0, op = 0;
  while (ip < in_len) {
    size_t best_len = 0, best_dist = 0;
    size_t win_start = (ip > 64) ? (ip - 64) : 0;
    for (size_t p = win_start; p < ip; p++) {
      size_t l = 0;
      while (ip + l < in_len && l < 18 && in[p + l] == in[ip + l]) l++;
      if (l > best_len) { best_len = l; best_dist = ip - p; }
    }
    if (best_len >= 3) {
      out[op++] = (uint8_t)(0x80U | (uint8_t)(best_len - 3));
      out[op++] = (uint8_t)best_dist;
      ip += best_len;
    } else {
      out[op++] = 0;
      out[op++] = in[ip++];
    }
  }
  return op;
}

static size_t lz77_decompress(const uint8_t *in, size_t in_len, uint8_t *out) {
  size_t ip = 0, op = 0;
  while (ip + 1 < in_len) {
    uint8_t tag = in[ip++];
    uint8_t val = in[ip++];
    if (tag & 0x80U) {
      size_t len = (size_t)(tag & 0x7FU) + 3;
      size_t dist = (size_t)val;
      for (size_t k = 0; k < len; k++) {
        out[op] = out[op - dist];
        op++;
      }
    } else {
      out[op++] = val;
    }
  }
  return op;
}

/* =========================================================================
 * Module 5: Expression Parser & Stack Bytecode VM
 * ========================================================================= */
enum VmOp { VM_PUSH = 1, VM_ADD, VM_SUB, VM_MUL, VM_DIV, VM_NEG, VM_HALT };
struct VmProg { uint8_t ops[128]; int32_t imms[128]; int len; };
struct ExprParser { const char *s; int pos; struct VmProg prog; };

static void ep_skip(struct ExprParser *p) { while (p->s[p->pos] == ' ') p->pos++; }
static void ep_emit(struct ExprParser *p, uint8_t op, int32_t imm) {
  p->prog.ops[p->prog.len] = op;
  p->prog.imms[p->prog.len] = imm;
  p->prog.len++;
}
static void ep_expr(struct ExprParser *p);
static void ep_factor(struct ExprParser *p) {
  ep_skip(p);
  if (p->s[p->pos] == '(') {
    p->pos++; ep_expr(p); ep_skip(p);
    if (p->s[p->pos] == ')') p->pos++;
  } else if (p->s[p->pos] == '-') {
    p->pos++; ep_factor(p); ep_emit(p, VM_NEG, 0);
  } else {
    int32_t v = 0;
    while (p->s[p->pos] >= '0' && p->s[p->pos] <= '9') {
      v = v * 10 + (p->s[p->pos++] - '0');
    }
    ep_emit(p, VM_PUSH, v);
  }
}
static void ep_term(struct ExprParser *p) {
  ep_factor(p);
  for (;;) {
    ep_skip(p);
    char c = p->s[p->pos];
    if (c == '*' || c == '/') {
      p->pos++; ep_factor(p);
      ep_emit(p, c == '*' ? VM_MUL : VM_DIV, 0);
    } else break;
  }
}
static void ep_expr(struct ExprParser *p) {
  ep_term(p);
  for (;;) {
    ep_skip(p);
    char c = p->s[p->pos];
    if (c == '+' || c == '-') {
      p->pos++; ep_term(p);
      ep_emit(p, c == '+' ? VM_ADD : VM_SUB, 0);
    } else break;
  }
}
static int32_t vm_exec(const struct VmProg *pr) {
  int32_t stk[64];
  int sp = 0;
  for (int i = 0; i < pr->len; i++) {
    switch (pr->ops[i]) {
      case VM_PUSH: stk[sp++] = pr->imms[i]; break;
      case VM_ADD: { int32_t b = stk[--sp]; stk[sp - 1] += b; break; }
      case VM_SUB: { int32_t b = stk[--sp]; stk[sp - 1] -= b; break; }
      case VM_MUL: { int32_t b = stk[--sp]; stk[sp - 1] *= b; break; }
      case VM_DIV: { int32_t b = stk[--sp]; stk[sp - 1] = b ? stk[sp - 1] / b : 0; break; }
      case VM_NEG: stk[sp - 1] = -stk[sp - 1]; break;
      default: break;
    }
  }
  return sp > 0 ? stk[sp - 1] : 0;
}

/* =========================================================================
 * Module 6: Sorting (QuickSort, MergeSort, HeapSort), Graph Dijkstra, N-Queens,
 *           3D Ray-Sphere Intersection (double), Hash Table & Regex Matcher
 * ========================================================================= */
static void qsort_i32(int32_t *a, int lo, int hi) {
  if (lo >= hi) return;
  int32_t piv = a[(lo + hi) / 2];
  int i = lo, j = hi;
  while (i <= j) {
    while (a[i] < piv) i++;
    while (a[j] > piv) j--;
    if (i <= j) { int32_t t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
  }
  if (lo < j) qsort_i32(a, lo, j);
  if (i < hi) qsort_i32(a, i, hi);
}

static int dijkstra_6(const int w[6][6], int src, int dst) {
  int dist[6]; bool vis[6];
  for (int i = 0; i < 6; i++) { dist[i] = 1000000; vis[i] = false; }
  dist[src] = 0;
  for (int step = 0; step < 6; step++) {
    int u = -1;
    for (int i = 0; i < 6; i++) if (!vis[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    vis[u] = true;
    for (int v = 0; v < 6; v++) {
      if (w[u][v] > 0 && dist[u] + w[u][v] < dist[v]) dist[v] = dist[u] + w[u][v];
    }
  }
  return dist[dst];
}

static int nqueens_solve(int n, int row, uint32_t cols, uint32_t d1, uint32_t d2) {
  if (row == n) return 1;
  int total = 0;
  for (int c = 0; c < n; c++) {
    uint32_t cm = 1U << c, m1 = 1U << (row + c), m2 = 1U << (row - c + 16);
    if (!(cols & cm) && !(d1 & m1) && !(d2 & m2)) {
      total += nqueens_solve(n, row + 1, cols | cm, d1 | m1, d2 | m2);
    }
  }
  return total;
}

static int regex_match(const char *pat, const char *txt) {
  if (pat[0] == '\0') return txt[0] == '\0';
  if (pat[1] == '*') {
    if (regex_match(pat + 2, txt)) return 1;
    if (txt[0] != '\0' && (pat[0] == '.' || pat[0] == txt[0])) {
      return regex_match(pat, txt + 1);
    }
    return 0;
  }
  if (txt[0] != '\0' && (pat[0] == '.' || pat[0] == txt[0])) {
    return regex_match(pat + 1, txt + 1);
  }
  return 0;
}

struct Vec3 { double x; double y; double z; };
static double v3_dot(struct Vec3 a, struct Vec3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
static struct Vec3 v3_sub(struct Vec3 a, struct Vec3 b) { struct Vec3 r = { a.x - b.x, a.y - b.y, a.z - b.z }; return r; }
static int ray_sphere_hit(struct Vec3 ro, struct Vec3 rd, struct Vec3 sc, double sr) {
  struct Vec3 oc = v3_sub(ro, sc);
  double a = v3_dot(rd, rd);
  double b = 2.0 * v3_dot(oc, rd);
  double c = v3_dot(oc, oc) - sr * sr;
  return (b * b - 4.0 * a * c) >= 0.0 ? 1 : 0;
}


struct KernelState_0 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_0(struct KernelState_0 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1U;
  uint32_t t = (a ^ (a >> 1)) * 2246822519U;
  t = (t ^ (b << 2)) + 1013904223U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 1);
  st->s1 = a + rotr32(t, 1);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_1 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_1(struct KernelState_1 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1640531535U;
  uint32_t t = (a ^ (a >> 2)) * 2246822519U;
  t = (t ^ (b << 9)) + 2611238900U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 2);
  st->s1 = a + rotr32(t, 2);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_2 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_2(struct KernelState_2 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1013904227U;
  uint32_t t = (a ^ (a >> 3)) * 2246822519U;
  t = (t ^ (b << 3)) + 4208573577U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 3);
  st->s1 = a + rotr32(t, 3);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_3 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_3(struct KernelState_3 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -626627309U;
  uint32_t t = (a ^ (a >> 4)) * 2246822519U;
  t = (t ^ (b << 10)) + 1510940958U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 4);
  st->s1 = a + rotr32(t, 4);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_4 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_4(struct KernelState_4 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 2027808453U;
  uint32_t t = (a ^ (a >> 5)) * 2246822519U;
  t = (t ^ (b << 4)) + 3108275635U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 5);
  st->s1 = a + rotr32(t, 5);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_5 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_5(struct KernelState_5 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 387276917U;
  uint32_t t = (a ^ (a >> 6)) * 2246822519U;
  t = (t ^ (b << 11)) + 410643016U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 6);
  st->s1 = a + rotr32(t, 6);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_6 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_6(struct KernelState_6 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1253254617U;
  uint32_t t = (a ^ (a >> 7)) * 2246822519U;
  t = (t ^ (b << 5)) + 2007977693U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 7);
  st->s1 = a + rotr32(t, 7);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_7 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_7(struct KernelState_7 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1401181143U;
  uint32_t t = (a ^ (a >> 8)) * 2246822519U;
  t = (t ^ (b << 12)) + 3605312370U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 8);
  st->s1 = a + rotr32(t, 8);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_8 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_8(struct KernelState_8 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -239350391U;
  uint32_t t = (a ^ (a >> 9)) * 2246822519U;
  t = (t ^ (b << 6)) + 907679751U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 9);
  st->s1 = a + rotr32(t, 9);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_9 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_9(struct KernelState_9 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1879881927U;
  uint32_t t = (a ^ (a >> 10)) * 2246822519U;
  t = (t ^ (b << 13)) + 2505014428U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 10);
  st->s1 = a + rotr32(t, 10);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_10 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_10(struct KernelState_10 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 774553835U;
  uint32_t t = (a ^ (a >> 11)) * 2246822519U;
  t = (t ^ (b << 7)) + 4102349105U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 11);
  st->s1 = a + rotr32(t, 11);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_11 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_11(struct KernelState_11 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -865977701U;
  uint32_t t = (a ^ (a >> 12)) * 2246822519U;
  t = (t ^ (b << 14)) + 1404716486U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 12);
  st->s1 = a + rotr32(t, 12);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_12 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_12(struct KernelState_12 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1788458061U;
  uint32_t t = (a ^ (a >> 13)) * 2246822519U;
  t = (t ^ (b << 8)) + 3002051163U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 13);
  st->s1 = a + rotr32(t, 13);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_13 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_13(struct KernelState_13 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 147926525U;
  uint32_t t = (a ^ (a >> 14)) * 2246822519U;
  t = (t ^ (b << 2)) + 304418544U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 14);
  st->s1 = a + rotr32(t, 14);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_14 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_14(struct KernelState_14 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1492605009U;
  uint32_t t = (a ^ (a >> 15)) * 2246822519U;
  t = (t ^ (b << 9)) + 1901753221U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 15);
  st->s1 = a + rotr32(t, 15);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_15 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_15(struct KernelState_15 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1161830751U;
  uint32_t t = (a ^ (a >> 1)) * 2246822519U;
  t = (t ^ (b << 3)) + 3499087898U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 16);
  st->s1 = a + rotr32(t, 16);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_16 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_16(struct KernelState_16 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -478700783U;
  uint32_t t = (a ^ (a >> 2)) * 2246822519U;
  t = (t ^ (b << 10)) + 801455279U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 17);
  st->s1 = a + rotr32(t, 17);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_17 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_17(struct KernelState_17 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -2119232319U;
  uint32_t t = (a ^ (a >> 3)) * 2246822519U;
  t = (t ^ (b << 4)) + 2398789956U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 18);
  st->s1 = a + rotr32(t, 18);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_18 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_18(struct KernelState_18 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 535203443U;
  uint32_t t = (a ^ (a >> 4)) * 2246822519U;
  t = (t ^ (b << 11)) + 3996124633U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 19);
  st->s1 = a + rotr32(t, 19);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_19 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_19(struct KernelState_19 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1105328093U;
  uint32_t t = (a ^ (a >> 5)) * 2246822519U;
  t = (t ^ (b << 5)) + 1298492014U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 20);
  st->s1 = a + rotr32(t, 20);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_20 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_20(struct KernelState_20 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1549107669U;
  uint32_t t = (a ^ (a >> 6)) * 2246822519U;
  t = (t ^ (b << 12)) + 2895826691U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 21);
  st->s1 = a + rotr32(t, 21);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_21 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_21(struct KernelState_21 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -91423867U;
  uint32_t t = (a ^ (a >> 7)) * 2246822519U;
  t = (t ^ (b << 6)) + 198194072U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 22);
  st->s1 = a + rotr32(t, 22);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_22 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_22(struct KernelState_22 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1731955401U;
  uint32_t t = (a ^ (a >> 8)) * 2246822519U;
  t = (t ^ (b << 13)) + 1795528749U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 23);
  st->s1 = a + rotr32(t, 23);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_23 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_23(struct KernelState_23 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 922480359U;
  uint32_t t = (a ^ (a >> 9)) * 2246822519U;
  t = (t ^ (b << 7)) + 3392863426U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 24);
  st->s1 = a + rotr32(t, 24);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_24 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_24(struct KernelState_24 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -718051175U;
  uint32_t t = (a ^ (a >> 10)) * 2246822519U;
  t = (t ^ (b << 14)) + 695230807U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 25);
  st->s1 = a + rotr32(t, 25);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_25 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_25(struct KernelState_25 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1936384585U;
  uint32_t t = (a ^ (a >> 11)) * 2246822519U;
  t = (t ^ (b << 8)) + 2292565484U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 26);
  st->s1 = a + rotr32(t, 26);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_26 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_26(struct KernelState_26 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 295853051U;
  uint32_t t = (a ^ (a >> 12)) * 2246822519U;
  t = (t ^ (b << 2)) + 3889900161U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 27);
  st->s1 = a + rotr32(t, 27);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_27 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_27(struct KernelState_27 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1344678485U;
  uint32_t t = (a ^ (a >> 13)) * 2246822519U;
  t = (t ^ (b << 9)) + 1192267542U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 28);
  st->s1 = a + rotr32(t, 1);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_28 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_28(struct KernelState_28 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1309757277U;
  uint32_t t = (a ^ (a >> 14)) * 2246822519U;
  t = (t ^ (b << 3)) + 2789602219U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 29);
  st->s1 = a + rotr32(t, 2);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_29 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_29(struct KernelState_29 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -330774259U;
  uint32_t t = (a ^ (a >> 15)) * 2246822519U;
  t = (t ^ (b << 10)) + 91969600U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 1);
  st->s1 = a + rotr32(t, 3);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_30 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_30(struct KernelState_30 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1971305793U;
  uint32_t t = (a ^ (a >> 1)) * 2246822519U;
  t = (t ^ (b << 4)) + 1689304277U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 2);
  st->s1 = a + rotr32(t, 4);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_31 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_31(struct KernelState_31 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 683129967U;
  uint32_t t = (a ^ (a >> 2)) * 2246822519U;
  t = (t ^ (b << 11)) + 3286638954U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 3);
  st->s1 = a + rotr32(t, 5);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_32 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_32(struct KernelState_32 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -957401567U;
  uint32_t t = (a ^ (a >> 3)) * 2246822519U;
  t = (t ^ (b << 5)) + 589006335U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 4);
  st->s1 = a + rotr32(t, 6);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_33 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_33(struct KernelState_33 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1697034193U;
  uint32_t t = (a ^ (a >> 4)) * 2246822519U;
  t = (t ^ (b << 12)) + 2186341012U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 5);
  st->s1 = a + rotr32(t, 7);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_34 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_34(struct KernelState_34 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 56502659U;
  uint32_t t = (a ^ (a >> 5)) * 2246822519U;
  t = (t ^ (b << 6)) + 3783675689U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 6);
  st->s1 = a + rotr32(t, 8);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_35 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_35(struct KernelState_35 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1584028877U;
  uint32_t t = (a ^ (a >> 6)) * 2246822519U;
  t = (t ^ (b << 13)) + 1086043070U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 7);
  st->s1 = a + rotr32(t, 9);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_36 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_36(struct KernelState_36 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1070406885U;
  uint32_t t = (a ^ (a >> 7)) * 2246822519U;
  t = (t ^ (b << 7)) + 2683377747U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 8);
  st->s1 = a + rotr32(t, 10);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_37 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_37(struct KernelState_37 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -570124651U;
  uint32_t t = (a ^ (a >> 8)) * 2246822519U;
  t = (t ^ (b << 14)) + 4280712424U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 9);
  st->s1 = a + rotr32(t, 11);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_38 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_38(struct KernelState_38 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 2084311111U;
  uint32_t t = (a ^ (a >> 9)) * 2246822519U;
  t = (t ^ (b << 8)) + 1583079805U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 10);
  st->s1 = a + rotr32(t, 12);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_39 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_39(struct KernelState_39 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 443779575U;
  uint32_t t = (a ^ (a >> 10)) * 2246822519U;
  t = (t ^ (b << 2)) + 3180414482U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 11);
  st->s1 = a + rotr32(t, 13);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_40 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_40(struct KernelState_40 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1196751959U;
  uint32_t t = (a ^ (a >> 11)) * 2246822519U;
  t = (t ^ (b << 9)) + 482781863U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 12);
  st->s1 = a + rotr32(t, 14);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_41 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_41(struct KernelState_41 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1457683801U;
  uint32_t t = (a ^ (a >> 12)) * 2246822519U;
  t = (t ^ (b << 3)) + 2080116540U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 13);
  st->s1 = a + rotr32(t, 15);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_42 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_42(struct KernelState_42 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -182847733U;
  uint32_t t = (a ^ (a >> 13)) * 2246822519U;
  t = (t ^ (b << 10)) + 3677451217U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 14);
  st->s1 = a + rotr32(t, 16);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_43 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_43(struct KernelState_43 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1823379269U;
  uint32_t t = (a ^ (a >> 14)) * 2246822519U;
  t = (t ^ (b << 4)) + 979818598U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 15);
  st->s1 = a + rotr32(t, 17);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_44 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_44(struct KernelState_44 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 831056493U;
  uint32_t t = (a ^ (a >> 15)) * 2246822519U;
  t = (t ^ (b << 11)) + 2577153275U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 16);
  st->s1 = a + rotr32(t, 18);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_45 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_45(struct KernelState_45 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -809475043U;
  uint32_t t = (a ^ (a >> 1)) * 2246822519U;
  t = (t ^ (b << 5)) + 4174487952U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 17);
  st->s1 = a + rotr32(t, 19);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_46 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_46(struct KernelState_46 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1844960719U;
  uint32_t t = (a ^ (a >> 2)) * 2246822519U;
  t = (t ^ (b << 12)) + 1476855333U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 18);
  st->s1 = a + rotr32(t, 20);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_47 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_47(struct KernelState_47 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 204429183U;
  uint32_t t = (a ^ (a >> 3)) * 2246822519U;
  t = (t ^ (b << 6)) + 3074190010U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 19);
  st->s1 = a + rotr32(t, 21);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_48 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_48(struct KernelState_48 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1436102351U;
  uint32_t t = (a ^ (a >> 4)) * 2246822519U;
  t = (t ^ (b << 13)) + 376557391U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 20);
  st->s1 = a + rotr32(t, 22);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_49 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_49(struct KernelState_49 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1218333409U;
  uint32_t t = (a ^ (a >> 5)) * 2246822519U;
  t = (t ^ (b << 7)) + 1973892068U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 21);
  st->s1 = a + rotr32(t, 23);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_50 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_50(struct KernelState_50 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -422198125U;
  uint32_t t = (a ^ (a >> 6)) * 2246822519U;
  t = (t ^ (b << 14)) + 3571226745U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 22);
  st->s1 = a + rotr32(t, 24);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_51 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_51(struct KernelState_51 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -2062729661U;
  uint32_t t = (a ^ (a >> 7)) * 2246822519U;
  t = (t ^ (b << 8)) + 873594126U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 23);
  st->s1 = a + rotr32(t, 25);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_52 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_52(struct KernelState_52 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 591706101U;
  uint32_t t = (a ^ (a >> 8)) * 2246822519U;
  t = (t ^ (b << 2)) + 2470928803U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 24);
  st->s1 = a + rotr32(t, 26);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_53 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_53(struct KernelState_53 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1048825435U;
  uint32_t t = (a ^ (a >> 9)) * 2246822519U;
  t = (t ^ (b << 9)) + 4068263480U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 25);
  st->s1 = a + rotr32(t, 27);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_54 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_54(struct KernelState_54 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1605610327U;
  uint32_t t = (a ^ (a >> 10)) * 2246822519U;
  t = (t ^ (b << 3)) + 1370630861U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 26);
  st->s1 = a + rotr32(t, 1);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_55 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_55(struct KernelState_55 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -34921209U;
  uint32_t t = (a ^ (a >> 11)) * 2246822519U;
  t = (t ^ (b << 10)) + 2967965538U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 27);
  st->s1 = a + rotr32(t, 2);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_56 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_56(struct KernelState_56 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1675452743U;
  uint32_t t = (a ^ (a >> 12)) * 2246822519U;
  t = (t ^ (b << 4)) + 270332919U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 28);
  st->s1 = a + rotr32(t, 3);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_57 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_57(struct KernelState_57 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 978983017U;
  uint32_t t = (a ^ (a >> 13)) * 2246822519U;
  t = (t ^ (b << 11)) + 1867667596U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 29);
  st->s1 = a + rotr32(t, 4);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_58 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_58(struct KernelState_58 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -661548517U;
  uint32_t t = (a ^ (a >> 14)) * 2246822519U;
  t = (t ^ (b << 5)) + 3465002273U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 1);
  st->s1 = a + rotr32(t, 5);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_59 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_59(struct KernelState_59 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1992887243U;
  uint32_t t = (a ^ (a >> 15)) * 2246822519U;
  t = (t ^ (b << 12)) + 767369654U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 2);
  st->s1 = a + rotr32(t, 6);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_60 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_60(struct KernelState_60 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 352355709U;
  uint32_t t = (a ^ (a >> 1)) * 2246822519U;
  t = (t ^ (b << 6)) + 2364704331U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 3);
  st->s1 = a + rotr32(t, 7);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_61 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_61(struct KernelState_61 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1288175827U;
  uint32_t t = (a ^ (a >> 2)) * 2246822519U;
  t = (t ^ (b << 13)) + 3962039008U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 4);
  st->s1 = a + rotr32(t, 8);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_62 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_62(struct KernelState_62 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1366259935U;
  uint32_t t = (a ^ (a >> 3)) * 2246822519U;
  t = (t ^ (b << 7)) + 1264406389U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 5);
  st->s1 = a + rotr32(t, 9);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_63 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_63(struct KernelState_63 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -274271601U;
  uint32_t t = (a ^ (a >> 4)) * 2246822519U;
  t = (t ^ (b << 14)) + 2861741066U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 6);
  st->s1 = a + rotr32(t, 10);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_64 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_64(struct KernelState_64 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1914803135U;
  uint32_t t = (a ^ (a >> 5)) * 2246822519U;
  t = (t ^ (b << 8)) + 164108447U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 7);
  st->s1 = a + rotr32(t, 11);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_65 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_65(struct KernelState_65 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 739632625U;
  uint32_t t = (a ^ (a >> 6)) * 2246822519U;
  t = (t ^ (b << 2)) + 1761443124U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 8);
  st->s1 = a + rotr32(t, 12);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_66 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_66(struct KernelState_66 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -900898909U;
  uint32_t t = (a ^ (a >> 7)) * 2246822519U;
  t = (t ^ (b << 9)) + 3358777801U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 9);
  st->s1 = a + rotr32(t, 13);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_67 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_67(struct KernelState_67 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1753536851U;
  uint32_t t = (a ^ (a >> 8)) * 2246822519U;
  t = (t ^ (b << 3)) + 661145182U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 10);
  st->s1 = a + rotr32(t, 14);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_68 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_68(struct KernelState_68 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 113005317U;
  uint32_t t = (a ^ (a >> 9)) * 2246822519U;
  t = (t ^ (b << 10)) + 2258479859U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 11);
  st->s1 = a + rotr32(t, 15);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_69 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_69(struct KernelState_69 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1527526219U;
  uint32_t t = (a ^ (a >> 10)) * 2246822519U;
  t = (t ^ (b << 4)) + 3855814536U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 12);
  st->s1 = a + rotr32(t, 16);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_70 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_70(struct KernelState_70 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1126909543U;
  uint32_t t = (a ^ (a >> 11)) * 2246822519U;
  t = (t ^ (b << 11)) + 1158181917U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 13);
  st->s1 = a + rotr32(t, 17);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_71 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_71(struct KernelState_71 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -513621993U;
  uint32_t t = (a ^ (a >> 12)) * 2246822519U;
  t = (t ^ (b << 5)) + 2755516594U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 14);
  st->s1 = a + rotr32(t, 18);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_72 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_72(struct KernelState_72 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 2140813769U;
  uint32_t t = (a ^ (a >> 13)) * 2246822519U;
  t = (t ^ (b << 12)) + 57883975U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 15);
  st->s1 = a + rotr32(t, 19);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_73 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_73(struct KernelState_73 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 500282233U;
  uint32_t t = (a ^ (a >> 14)) * 2246822519U;
  t = (t ^ (b << 6)) + 1655218652U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 16);
  st->s1 = a + rotr32(t, 20);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_74 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_74(struct KernelState_74 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1140249301U;
  uint32_t t = (a ^ (a >> 15)) * 2246822519U;
  t = (t ^ (b << 13)) + 3252553329U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 17);
  st->s1 = a + rotr32(t, 21);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_75 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_75(struct KernelState_75 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1514186459U;
  uint32_t t = (a ^ (a >> 1)) * 2246822519U;
  t = (t ^ (b << 7)) + 554920710U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 18);
  st->s1 = a + rotr32(t, 22);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_76 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_76(struct KernelState_76 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -126345075U;
  uint32_t t = (a ^ (a >> 2)) * 2246822519U;
  t = (t ^ (b << 14)) + 2152255387U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 19);
  st->s1 = a + rotr32(t, 23);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_77 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_77(struct KernelState_77 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1766876611U;
  uint32_t t = (a ^ (a >> 3)) * 2246822519U;
  t = (t ^ (b << 8)) + 3749590064U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 20);
  st->s1 = a + rotr32(t, 24);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_78 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_78(struct KernelState_78 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 887559151U;
  uint32_t t = (a ^ (a >> 4)) * 2246822519U;
  t = (t ^ (b << 2)) + 1051957445U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 21);
  st->s1 = a + rotr32(t, 25);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_79 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_79(struct KernelState_79 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -752972385U;
  uint32_t t = (a ^ (a >> 5)) * 2246822519U;
  t = (t ^ (b << 9)) + 2649292122U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 22);
  st->s1 = a + rotr32(t, 26);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_80 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_80(struct KernelState_80 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1901463377U;
  uint32_t t = (a ^ (a >> 6)) * 2246822519U;
  t = (t ^ (b << 3)) + 4246626799U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 23);
  st->s1 = a + rotr32(t, 27);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_81 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_81(struct KernelState_81 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 260931841U;
  uint32_t t = (a ^ (a >> 7)) * 2246822519U;
  t = (t ^ (b << 10)) + 1548994180U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 24);
  st->s1 = a + rotr32(t, 1);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_82 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_82(struct KernelState_82 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1379599693U;
  uint32_t t = (a ^ (a >> 8)) * 2246822519U;
  t = (t ^ (b << 4)) + 3146328857U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 25);
  st->s1 = a + rotr32(t, 2);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_83 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_83(struct KernelState_83 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1274836067U;
  uint32_t t = (a ^ (a >> 9)) * 2246822519U;
  t = (t ^ (b << 11)) + 448696238U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 26);
  st->s1 = a + rotr32(t, 3);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_84 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_84(struct KernelState_84 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -365695467U;
  uint32_t t = (a ^ (a >> 10)) * 2246822519U;
  t = (t ^ (b << 5)) + 2046030915U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 27);
  st->s1 = a + rotr32(t, 4);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_85 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_85(struct KernelState_85 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -2006227003U;
  uint32_t t = (a ^ (a >> 11)) * 2246822519U;
  t = (t ^ (b << 12)) + 3643365592U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 28);
  st->s1 = a + rotr32(t, 5);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_86 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_86(struct KernelState_86 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 648208759U;
  uint32_t t = (a ^ (a >> 12)) * 2246822519U;
  t = (t ^ (b << 6)) + 945732973U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 29);
  st->s1 = a + rotr32(t, 6);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_87 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_87(struct KernelState_87 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -992322777U;
  uint32_t t = (a ^ (a >> 13)) * 2246822519U;
  t = (t ^ (b << 13)) + 2543067650U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 1);
  st->s1 = a + rotr32(t, 7);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_88 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_88(struct KernelState_88 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1662112985U;
  uint32_t t = (a ^ (a >> 14)) * 2246822519U;
  t = (t ^ (b << 7)) + 4140402327U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 2);
  st->s1 = a + rotr32(t, 8);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_89 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_89(struct KernelState_89 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 21581449U;
  uint32_t t = (a ^ (a >> 15)) * 2246822519U;
  t = (t ^ (b << 14)) + 1442769708U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 3);
  st->s1 = a + rotr32(t, 9);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_90 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_90(struct KernelState_90 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1618950085U;
  uint32_t t = (a ^ (a >> 1)) * 2246822519U;
  t = (t ^ (b << 8)) + 3040104385U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 4);
  st->s1 = a + rotr32(t, 10);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_91 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_91(struct KernelState_91 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1035485675U;
  uint32_t t = (a ^ (a >> 2)) * 2246822519U;
  t = (t ^ (b << 2)) + 342471766U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 5);
  st->s1 = a + rotr32(t, 11);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_92 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_92(struct KernelState_92 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -605045859U;
  uint32_t t = (a ^ (a >> 3)) * 2246822519U;
  t = (t ^ (b << 9)) + 1939806443U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 6);
  st->s1 = a + rotr32(t, 12);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_93 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_93(struct KernelState_93 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 2049389901U;
  uint32_t t = (a ^ (a >> 4)) * 2246822519U;
  t = (t ^ (b << 3)) + 3537141120U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 7);
  st->s1 = a + rotr32(t, 13);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_94 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_94(struct KernelState_94 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 408858367U;
  uint32_t t = (a ^ (a >> 5)) * 2246822519U;
  t = (t ^ (b << 10)) + 839508501U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 8);
  st->s1 = a + rotr32(t, 14);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_95 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_95(struct KernelState_95 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1231673169U;
  uint32_t t = (a ^ (a >> 6)) * 2246822519U;
  t = (t ^ (b << 4)) + 2436843178U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 9);
  st->s1 = a + rotr32(t, 15);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_96 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_96(struct KernelState_96 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1422762593U;
  uint32_t t = (a ^ (a >> 7)) * 2246822519U;
  t = (t ^ (b << 11)) + 4034177855U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 10);
  st->s1 = a + rotr32(t, 16);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_97 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_97(struct KernelState_97 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -217768943U;
  uint32_t t = (a ^ (a >> 8)) * 2246822519U;
  t = (t ^ (b << 5)) + 1336545236U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 11);
  st->s1 = a + rotr32(t, 17);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_98 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_98(struct KernelState_98 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1858300477U;
  uint32_t t = (a ^ (a >> 9)) * 2246822519U;
  t = (t ^ (b << 12)) + 2933879913U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 12);
  st->s1 = a + rotr32(t, 18);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_99 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_99(struct KernelState_99 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 796135283U;
  uint32_t t = (a ^ (a >> 10)) * 2246822519U;
  t = (t ^ (b << 6)) + 236247294U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 13);
  st->s1 = a + rotr32(t, 19);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_100 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_100(struct KernelState_100 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -844396251U;
  uint32_t t = (a ^ (a >> 11)) * 2246822519U;
  t = (t ^ (b << 13)) + 1833581971U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 14);
  st->s1 = a + rotr32(t, 20);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_101 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_101(struct KernelState_101 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1810039509U;
  uint32_t t = (a ^ (a >> 12)) * 2246822519U;
  t = (t ^ (b << 7)) + 3430916648U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 15);
  st->s1 = a + rotr32(t, 21);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_102 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_102(struct KernelState_102 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 169507975U;
  uint32_t t = (a ^ (a >> 13)) * 2246822519U;
  t = (t ^ (b << 14)) + 733284029U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 16);
  st->s1 = a + rotr32(t, 22);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_103 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_103(struct KernelState_103 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1471023561U;
  uint32_t t = (a ^ (a >> 14)) * 2246822519U;
  t = (t ^ (b << 8)) + 2330618706U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 17);
  st->s1 = a + rotr32(t, 23);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_104 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_104(struct KernelState_104 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1183412201U;
  uint32_t t = (a ^ (a >> 15)) * 2246822519U;
  t = (t ^ (b << 2)) + 3927953383U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 18);
  st->s1 = a + rotr32(t, 24);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_105 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_105(struct KernelState_105 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -457119335U;
  uint32_t t = (a ^ (a >> 1)) * 2246822519U;
  t = (t ^ (b << 9)) + 1230320764U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 19);
  st->s1 = a + rotr32(t, 25);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_106 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_106(struct KernelState_106 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -2097650869U;
  uint32_t t = (a ^ (a >> 2)) * 2246822519U;
  t = (t ^ (b << 3)) + 2827655441U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 20);
  st->s1 = a + rotr32(t, 26);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_107 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_107(struct KernelState_107 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 556784891U;
  uint32_t t = (a ^ (a >> 3)) * 2246822519U;
  t = (t ^ (b << 10)) + 130022822U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 21);
  st->s1 = a + rotr32(t, 27);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_108 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_108(struct KernelState_108 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1083746643U;
  uint32_t t = (a ^ (a >> 4)) * 2246822519U;
  t = (t ^ (b << 4)) + 1727357499U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 22);
  st->s1 = a + rotr32(t, 1);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_109 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_109(struct KernelState_109 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1570689117U;
  uint32_t t = (a ^ (a >> 5)) * 2246822519U;
  t = (t ^ (b << 11)) + 3324692176U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 23);
  st->s1 = a + rotr32(t, 2);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_110 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_110(struct KernelState_110 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -69842417U;
  uint32_t t = (a ^ (a >> 6)) * 2246822519U;
  t = (t ^ (b << 5)) + 627059557U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 24);
  st->s1 = a + rotr32(t, 3);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_111 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_111(struct KernelState_111 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1710373953U;
  uint32_t t = (a ^ (a >> 7)) * 2246822519U;
  t = (t ^ (b << 12)) + 2224394234U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 25);
  st->s1 = a + rotr32(t, 4);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_112 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_112(struct KernelState_112 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 944061809U;
  uint32_t t = (a ^ (a >> 8)) * 2246822519U;
  t = (t ^ (b << 6)) + 3821728911U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 26);
  st->s1 = a + rotr32(t, 5);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_113 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_113(struct KernelState_113 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -696469727U;
  uint32_t t = (a ^ (a >> 9)) * 2246822519U;
  t = (t ^ (b << 13)) + 1124096292U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 27);
  st->s1 = a + rotr32(t, 6);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_114 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_114(struct KernelState_114 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1957966035U;
  uint32_t t = (a ^ (a >> 10)) * 2246822519U;
  t = (t ^ (b << 7)) + 2721430969U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 28);
  st->s1 = a + rotr32(t, 7);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_115 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_115(struct KernelState_115 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 317434499U;
  uint32_t t = (a ^ (a >> 11)) * 2246822519U;
  t = (t ^ (b << 14)) + 23798350U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 29);
  st->s1 = a + rotr32(t, 8);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_116 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_116(struct KernelState_116 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1323097035U;
  uint32_t t = (a ^ (a >> 12)) * 2246822519U;
  t = (t ^ (b << 8)) + 1621133027U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 1);
  st->s1 = a + rotr32(t, 9);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_117 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_117(struct KernelState_117 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1331338725U;
  uint32_t t = (a ^ (a >> 13)) * 2246822519U;
  t = (t ^ (b << 2)) + 3218467704U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 2);
  st->s1 = a + rotr32(t, 10);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_118 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_118(struct KernelState_118 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -309192809U;
  uint32_t t = (a ^ (a >> 14)) * 2246822519U;
  t = (t ^ (b << 9)) + 520835085U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 3);
  st->s1 = a + rotr32(t, 11);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_119 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_119(struct KernelState_119 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1949724345U;
  uint32_t t = (a ^ (a >> 15)) * 2246822519U;
  t = (t ^ (b << 3)) + 2118169762U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 4);
  st->s1 = a + rotr32(t, 12);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_120 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_120(struct KernelState_120 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 704711417U;
  uint32_t t = (a ^ (a >> 1)) * 2246822519U;
  t = (t ^ (b << 10)) + 3715504439U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 5);
  st->s1 = a + rotr32(t, 13);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_121 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_121(struct KernelState_121 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -935820119U;
  uint32_t t = (a ^ (a >> 2)) * 2246822519U;
  t = (t ^ (b << 4)) + 1017871820U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 6);
  st->s1 = a + rotr32(t, 14);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_122 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_122(struct KernelState_122 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1718615643U;
  uint32_t t = (a ^ (a >> 3)) * 2246822519U;
  t = (t ^ (b << 11)) + 2615206497U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 7);
  st->s1 = a + rotr32(t, 15);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_123 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_123(struct KernelState_123 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 78084107U;
  uint32_t t = (a ^ (a >> 4)) * 2246822519U;
  t = (t ^ (b << 5)) + 4212541174U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 8);
  st->s1 = a + rotr32(t, 16);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_124 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_124(struct KernelState_124 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1562447427U;
  uint32_t t = (a ^ (a >> 5)) * 2246822519U;
  t = (t ^ (b << 12)) + 1514908555U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 9);
  st->s1 = a + rotr32(t, 17);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_125 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_125(struct KernelState_125 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1091988333U;
  uint32_t t = (a ^ (a >> 6)) * 2246822519U;
  t = (t ^ (b << 6)) + 3112243232U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 10);
  st->s1 = a + rotr32(t, 18);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_126 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_126(struct KernelState_126 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -548543201U;
  uint32_t t = (a ^ (a >> 7)) * 2246822519U;
  t = (t ^ (b << 13)) + 414610613U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 11);
  st->s1 = a + rotr32(t, 19);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_127 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_127(struct KernelState_127 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 2105892559U;
  uint32_t t = (a ^ (a >> 8)) * 2246822519U;
  t = (t ^ (b << 7)) + 2011945290U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 12);
  st->s1 = a + rotr32(t, 20);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_128 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_128(struct KernelState_128 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 465361025U;
  uint32_t t = (a ^ (a >> 9)) * 2246822519U;
  t = (t ^ (b << 14)) + 3609279967U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 13);
  st->s1 = a + rotr32(t, 21);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_129 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_129(struct KernelState_129 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1175170511U;
  uint32_t t = (a ^ (a >> 10)) * 2246822519U;
  t = (t ^ (b << 8)) + 911647348U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 14);
  st->s1 = a + rotr32(t, 22);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_130 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_130(struct KernelState_130 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1479265251U;
  uint32_t t = (a ^ (a >> 11)) * 2246822519U;
  t = (t ^ (b << 2)) + 2508982025U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 15);
  st->s1 = a + rotr32(t, 23);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_131 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_131(struct KernelState_131 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -161266285U;
  uint32_t t = (a ^ (a >> 12)) * 2246822519U;
  t = (t ^ (b << 9)) + 4106316702U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 16);
  st->s1 = a + rotr32(t, 24);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_132 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_132(struct KernelState_132 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1801797819U;
  uint32_t t = (a ^ (a >> 13)) * 2246822519U;
  t = (t ^ (b << 3)) + 1408684083U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 17);
  st->s1 = a + rotr32(t, 25);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_133 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_133(struct KernelState_133 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 852637941U;
  uint32_t t = (a ^ (a >> 14)) * 2246822519U;
  t = (t ^ (b << 10)) + 3006018760U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 18);
  st->s1 = a + rotr32(t, 26);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_134 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_134(struct KernelState_134 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -787893593U;
  uint32_t t = (a ^ (a >> 15)) * 2246822519U;
  t = (t ^ (b << 4)) + 308386141U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 19);
  st->s1 = a + rotr32(t, 27);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_135 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_135(struct KernelState_135 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1866542167U;
  uint32_t t = (a ^ (a >> 1)) * 2246822519U;
  t = (t ^ (b << 11)) + 1905720818U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 20);
  st->s1 = a + rotr32(t, 1);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_136 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_136(struct KernelState_136 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 226010633U;
  uint32_t t = (a ^ (a >> 2)) * 2246822519U;
  t = (t ^ (b << 5)) + 3503055495U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 21);
  st->s1 = a + rotr32(t, 2);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_137 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_137(struct KernelState_137 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1414520903U;
  uint32_t t = (a ^ (a >> 3)) * 2246822519U;
  t = (t ^ (b << 12)) + 805422876U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 22);
  st->s1 = a + rotr32(t, 3);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_138 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_138(struct KernelState_138 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1239914859U;
  uint32_t t = (a ^ (a >> 4)) * 2246822519U;
  t = (t ^ (b << 6)) + 2402757553U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 23);
  st->s1 = a + rotr32(t, 4);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_139 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_139(struct KernelState_139 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -400616677U;
  uint32_t t = (a ^ (a >> 5)) * 2246822519U;
  t = (t ^ (b << 13)) + 4000092230U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 24);
  st->s1 = a + rotr32(t, 5);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_140 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_140(struct KernelState_140 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -2041148211U;
  uint32_t t = (a ^ (a >> 6)) * 2246822519U;
  t = (t ^ (b << 7)) + 1302459611U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 25);
  st->s1 = a + rotr32(t, 6);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_141 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_141(struct KernelState_141 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 613287549U;
  uint32_t t = (a ^ (a >> 7)) * 2246822519U;
  t = (t ^ (b << 14)) + 2899794288U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 26);
  st->s1 = a + rotr32(t, 7);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_142 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_142(struct KernelState_142 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1027243985U;
  uint32_t t = (a ^ (a >> 8)) * 2246822519U;
  t = (t ^ (b << 8)) + 202161669U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 27);
  st->s1 = a + rotr32(t, 8);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_143 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_143(struct KernelState_143 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1627191775U;
  uint32_t t = (a ^ (a >> 9)) * 2246822519U;
  t = (t ^ (b << 2)) + 1799496346U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 28);
  st->s1 = a + rotr32(t, 9);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_144 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_144(struct KernelState_144 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -13339759U;
  uint32_t t = (a ^ (a >> 10)) * 2246822519U;
  t = (t ^ (b << 9)) + 3396831023U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 29);
  st->s1 = a + rotr32(t, 10);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_145 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_145(struct KernelState_145 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1653871295U;
  uint32_t t = (a ^ (a >> 11)) * 2246822519U;
  t = (t ^ (b << 3)) + 699198404U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 1);
  st->s1 = a + rotr32(t, 11);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_146 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_146(struct KernelState_146 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1000564467U;
  uint32_t t = (a ^ (a >> 12)) * 2246822519U;
  t = (t ^ (b << 10)) + 2296533081U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 2);
  st->s1 = a + rotr32(t, 12);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_147 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_147(struct KernelState_147 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -639967069U;
  uint32_t t = (a ^ (a >> 13)) * 2246822519U;
  t = (t ^ (b << 4)) + 3893867758U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 3);
  st->s1 = a + rotr32(t, 13);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_148 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_148(struct KernelState_148 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 2014468693U;
  uint32_t t = (a ^ (a >> 14)) * 2246822519U;
  t = (t ^ (b << 11)) + 1196235139U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 4);
  st->s1 = a + rotr32(t, 14);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_149 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_149(struct KernelState_149 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 373937157U;
  uint32_t t = (a ^ (a >> 15)) * 2246822519U;
  t = (t ^ (b << 5)) + 2793569816U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 5);
  st->s1 = a + rotr32(t, 15);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_150 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_150(struct KernelState_150 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1266594377U;
  uint32_t t = (a ^ (a >> 1)) * 2246822519U;
  t = (t ^ (b << 12)) + 95937197U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 6);
  st->s1 = a + rotr32(t, 16);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_151 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_151(struct KernelState_151 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1387841383U;
  uint32_t t = (a ^ (a >> 2)) * 2246822519U;
  t = (t ^ (b << 6)) + 1693271874U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 7);
  st->s1 = a + rotr32(t, 17);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_152 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_152(struct KernelState_152 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -252690151U;
  uint32_t t = (a ^ (a >> 3)) * 2246822519U;
  t = (t ^ (b << 13)) + 3290606551U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 8);
  st->s1 = a + rotr32(t, 18);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_153 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_153(struct KernelState_153 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1893221687U;
  uint32_t t = (a ^ (a >> 4)) * 2246822519U;
  t = (t ^ (b << 7)) + 592973932U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 9);
  st->s1 = a + rotr32(t, 19);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_154 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_154(struct KernelState_154 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 761214075U;
  uint32_t t = (a ^ (a >> 5)) * 2246822519U;
  t = (t ^ (b << 14)) + 2190308609U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 10);
  st->s1 = a + rotr32(t, 20);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_155 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_155(struct KernelState_155 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -879317461U;
  uint32_t t = (a ^ (a >> 6)) * 2246822519U;
  t = (t ^ (b << 8)) + 3787643286U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 11);
  st->s1 = a + rotr32(t, 21);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_156 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_156(struct KernelState_156 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1775118301U;
  uint32_t t = (a ^ (a >> 7)) * 2246822519U;
  t = (t ^ (b << 2)) + 1090010667U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 12);
  st->s1 = a + rotr32(t, 22);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_157 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_157(struct KernelState_157 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 134586765U;
  uint32_t t = (a ^ (a >> 8)) * 2246822519U;
  t = (t ^ (b << 9)) + 2687345344U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 13);
  st->s1 = a + rotr32(t, 23);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_158 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_158(struct KernelState_158 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1505944769U;
  uint32_t t = (a ^ (a >> 9)) * 2246822519U;
  t = (t ^ (b << 3)) + 4284680021U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 14);
  st->s1 = a + rotr32(t, 24);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_159 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_159(struct KernelState_159 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1148490991U;
  uint32_t t = (a ^ (a >> 10)) * 2246822519U;
  t = (t ^ (b << 10)) + 1587047402U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 15);
  st->s1 = a + rotr32(t, 25);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_160 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_160(struct KernelState_160 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -492040543U;
  uint32_t t = (a ^ (a >> 11)) * 2246822519U;
  t = (t ^ (b << 4)) + 3184382079U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 16);
  st->s1 = a + rotr32(t, 26);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_161 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_161(struct KernelState_161 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -2132572079U;
  uint32_t t = (a ^ (a >> 12)) * 2246822519U;
  t = (t ^ (b << 11)) + 486749460U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 17);
  st->s1 = a + rotr32(t, 27);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_162 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_162(struct KernelState_162 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 521863683U;
  uint32_t t = (a ^ (a >> 13)) * 2246822519U;
  t = (t ^ (b << 5)) + 2084084137U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 18);
  st->s1 = a + rotr32(t, 1);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_163 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_163(struct KernelState_163 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + -1118667853U;
  uint32_t t = (a ^ (a >> 14)) * 2246822519U;
  t = (t ^ (b << 12)) + 3681418814U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 19);
  st->s1 = a + rotr32(t, 2);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


struct KernelState_164 {
  uint32_t s0;
  uint32_t s1;
  int32_t  acc;
  uint16_t tag;
  uint8_t  mode;
};

static uint32_t kernel_step_164(struct KernelState_164 *st, uint32_t inp) {
  uint32_t a = st->s0 ^ inp;
  uint32_t b = st->s1 + 1535767909U;
  uint32_t t = (a ^ (a >> 15)) * 2246822519U;
  t = (t ^ (b << 6)) + 983786195U;
  if ((t & 3U) == 0U) {
    st->acc += (int32_t)(t & 0xFFFFU);
  } else if ((t & 3U) == 1U) {
    st->acc -= (int32_t)(t & 0x7FFFU);
  } else if ((t & 3U) == 2U) {
    st->acc ^= (int32_t)(t & 0x3FFFU);
  } else {
    st->acc += (int32_t)((t >> 8) & 0x1FFFU);
  }
  st->s0 = b ^ rotl32(t, 20);
  st->s1 = a + rotr32(t, 3);
  st->tag = (uint16_t)(st->tag + (uint16_t)(t & 0xFFU));
  st->mode = (uint8_t)((st->mode + 1U) & 7U);
  return st->s0 ^ st->s1 ^ (uint32_t)st->acc ^ (uint32_t)st->tag;
}


static uint32_t run_all_kernels(uint32_t seed) {
  uint32_t h = seed;
  { struct KernelState_0 ks = { h ^ 1U, h + 3U, 0, 0U, 0U }; h = (h ^ kernel_step_0(&ks, h + 0U)) * 16777619U; }
  { struct KernelState_1 ks = { h ^ 2U, h + 20U, 1, 3U, 1U }; h = (h ^ kernel_step_1(&ks, h + 1U)) * 16777619U; }
  { struct KernelState_2 ks = { h ^ 3U, h + 37U, 2, 6U, 2U }; h = (h ^ kernel_step_2(&ks, h + 2U)) * 16777619U; }
  { struct KernelState_3 ks = { h ^ 4U, h + 54U, 3, 9U, 3U }; h = (h ^ kernel_step_3(&ks, h + 3U)) * 16777619U; }
  { struct KernelState_4 ks = { h ^ 5U, h + 71U, 4, 12U, 4U }; h = (h ^ kernel_step_4(&ks, h + 4U)) * 16777619U; }
  { struct KernelState_5 ks = { h ^ 6U, h + 88U, 5, 15U, 5U }; h = (h ^ kernel_step_5(&ks, h + 5U)) * 16777619U; }
  { struct KernelState_6 ks = { h ^ 7U, h + 105U, 6, 18U, 6U }; h = (h ^ kernel_step_6(&ks, h + 6U)) * 16777619U; }
  { struct KernelState_7 ks = { h ^ 8U, h + 122U, 7, 21U, 7U }; h = (h ^ kernel_step_7(&ks, h + 7U)) * 16777619U; }
  { struct KernelState_8 ks = { h ^ 9U, h + 139U, 8, 24U, 0U }; h = (h ^ kernel_step_8(&ks, h + 8U)) * 16777619U; }
  { struct KernelState_9 ks = { h ^ 10U, h + 156U, 9, 27U, 1U }; h = (h ^ kernel_step_9(&ks, h + 9U)) * 16777619U; }
  { struct KernelState_10 ks = { h ^ 11U, h + 173U, 10, 30U, 2U }; h = (h ^ kernel_step_10(&ks, h + 10U)) * 16777619U; }
  { struct KernelState_11 ks = { h ^ 12U, h + 190U, 11, 33U, 3U }; h = (h ^ kernel_step_11(&ks, h + 11U)) * 16777619U; }
  { struct KernelState_12 ks = { h ^ 13U, h + 207U, 12, 36U, 4U }; h = (h ^ kernel_step_12(&ks, h + 12U)) * 16777619U; }
  { struct KernelState_13 ks = { h ^ 14U, h + 224U, 13, 39U, 5U }; h = (h ^ kernel_step_13(&ks, h + 13U)) * 16777619U; }
  { struct KernelState_14 ks = { h ^ 15U, h + 241U, 14, 42U, 6U }; h = (h ^ kernel_step_14(&ks, h + 14U)) * 16777619U; }
  { struct KernelState_15 ks = { h ^ 16U, h + 258U, 15, 45U, 7U }; h = (h ^ kernel_step_15(&ks, h + 15U)) * 16777619U; }
  { struct KernelState_16 ks = { h ^ 17U, h + 275U, 16, 48U, 0U }; h = (h ^ kernel_step_16(&ks, h + 16U)) * 16777619U; }
  { struct KernelState_17 ks = { h ^ 18U, h + 292U, 17, 51U, 1U }; h = (h ^ kernel_step_17(&ks, h + 17U)) * 16777619U; }
  { struct KernelState_18 ks = { h ^ 19U, h + 309U, 18, 54U, 2U }; h = (h ^ kernel_step_18(&ks, h + 18U)) * 16777619U; }
  { struct KernelState_19 ks = { h ^ 20U, h + 326U, 19, 57U, 3U }; h = (h ^ kernel_step_19(&ks, h + 19U)) * 16777619U; }
  { struct KernelState_20 ks = { h ^ 21U, h + 343U, 20, 60U, 4U }; h = (h ^ kernel_step_20(&ks, h + 20U)) * 16777619U; }
  { struct KernelState_21 ks = { h ^ 22U, h + 360U, 21, 63U, 5U }; h = (h ^ kernel_step_21(&ks, h + 21U)) * 16777619U; }
  { struct KernelState_22 ks = { h ^ 23U, h + 377U, 22, 66U, 6U }; h = (h ^ kernel_step_22(&ks, h + 22U)) * 16777619U; }
  { struct KernelState_23 ks = { h ^ 24U, h + 394U, 23, 69U, 7U }; h = (h ^ kernel_step_23(&ks, h + 23U)) * 16777619U; }
  { struct KernelState_24 ks = { h ^ 25U, h + 411U, 24, 72U, 0U }; h = (h ^ kernel_step_24(&ks, h + 24U)) * 16777619U; }
  { struct KernelState_25 ks = { h ^ 26U, h + 428U, 25, 75U, 1U }; h = (h ^ kernel_step_25(&ks, h + 25U)) * 16777619U; }
  { struct KernelState_26 ks = { h ^ 27U, h + 445U, 26, 78U, 2U }; h = (h ^ kernel_step_26(&ks, h + 26U)) * 16777619U; }
  { struct KernelState_27 ks = { h ^ 28U, h + 462U, 27, 81U, 3U }; h = (h ^ kernel_step_27(&ks, h + 27U)) * 16777619U; }
  { struct KernelState_28 ks = { h ^ 29U, h + 479U, 28, 84U, 4U }; h = (h ^ kernel_step_28(&ks, h + 28U)) * 16777619U; }
  { struct KernelState_29 ks = { h ^ 30U, h + 496U, 29, 87U, 5U }; h = (h ^ kernel_step_29(&ks, h + 29U)) * 16777619U; }
  { struct KernelState_30 ks = { h ^ 31U, h + 513U, 30, 90U, 6U }; h = (h ^ kernel_step_30(&ks, h + 30U)) * 16777619U; }
  { struct KernelState_31 ks = { h ^ 32U, h + 530U, 31, 93U, 7U }; h = (h ^ kernel_step_31(&ks, h + 31U)) * 16777619U; }
  { struct KernelState_32 ks = { h ^ 33U, h + 547U, 32, 96U, 0U }; h = (h ^ kernel_step_32(&ks, h + 32U)) * 16777619U; }
  { struct KernelState_33 ks = { h ^ 34U, h + 564U, 33, 99U, 1U }; h = (h ^ kernel_step_33(&ks, h + 33U)) * 16777619U; }
  { struct KernelState_34 ks = { h ^ 35U, h + 581U, 34, 102U, 2U }; h = (h ^ kernel_step_34(&ks, h + 34U)) * 16777619U; }
  { struct KernelState_35 ks = { h ^ 36U, h + 598U, 35, 105U, 3U }; h = (h ^ kernel_step_35(&ks, h + 35U)) * 16777619U; }
  { struct KernelState_36 ks = { h ^ 37U, h + 615U, 36, 108U, 4U }; h = (h ^ kernel_step_36(&ks, h + 36U)) * 16777619U; }
  { struct KernelState_37 ks = { h ^ 38U, h + 632U, 37, 111U, 5U }; h = (h ^ kernel_step_37(&ks, h + 37U)) * 16777619U; }
  { struct KernelState_38 ks = { h ^ 39U, h + 649U, 38, 114U, 6U }; h = (h ^ kernel_step_38(&ks, h + 38U)) * 16777619U; }
  { struct KernelState_39 ks = { h ^ 40U, h + 666U, 39, 117U, 7U }; h = (h ^ kernel_step_39(&ks, h + 39U)) * 16777619U; }
  { struct KernelState_40 ks = { h ^ 41U, h + 683U, 40, 120U, 0U }; h = (h ^ kernel_step_40(&ks, h + 40U)) * 16777619U; }
  { struct KernelState_41 ks = { h ^ 42U, h + 700U, 41, 123U, 1U }; h = (h ^ kernel_step_41(&ks, h + 41U)) * 16777619U; }
  { struct KernelState_42 ks = { h ^ 43U, h + 717U, 42, 126U, 2U }; h = (h ^ kernel_step_42(&ks, h + 42U)) * 16777619U; }
  { struct KernelState_43 ks = { h ^ 44U, h + 734U, 43, 129U, 3U }; h = (h ^ kernel_step_43(&ks, h + 43U)) * 16777619U; }
  { struct KernelState_44 ks = { h ^ 45U, h + 751U, 44, 132U, 4U }; h = (h ^ kernel_step_44(&ks, h + 44U)) * 16777619U; }
  { struct KernelState_45 ks = { h ^ 46U, h + 768U, 45, 135U, 5U }; h = (h ^ kernel_step_45(&ks, h + 45U)) * 16777619U; }
  { struct KernelState_46 ks = { h ^ 47U, h + 785U, 46, 138U, 6U }; h = (h ^ kernel_step_46(&ks, h + 46U)) * 16777619U; }
  { struct KernelState_47 ks = { h ^ 48U, h + 802U, 47, 141U, 7U }; h = (h ^ kernel_step_47(&ks, h + 47U)) * 16777619U; }
  { struct KernelState_48 ks = { h ^ 49U, h + 819U, 48, 144U, 0U }; h = (h ^ kernel_step_48(&ks, h + 48U)) * 16777619U; }
  { struct KernelState_49 ks = { h ^ 50U, h + 836U, 49, 147U, 1U }; h = (h ^ kernel_step_49(&ks, h + 49U)) * 16777619U; }
  { struct KernelState_50 ks = { h ^ 51U, h + 853U, 50, 150U, 2U }; h = (h ^ kernel_step_50(&ks, h + 50U)) * 16777619U; }
  { struct KernelState_51 ks = { h ^ 52U, h + 870U, 51, 153U, 3U }; h = (h ^ kernel_step_51(&ks, h + 51U)) * 16777619U; }
  { struct KernelState_52 ks = { h ^ 53U, h + 887U, 52, 156U, 4U }; h = (h ^ kernel_step_52(&ks, h + 52U)) * 16777619U; }
  { struct KernelState_53 ks = { h ^ 54U, h + 904U, 53, 159U, 5U }; h = (h ^ kernel_step_53(&ks, h + 53U)) * 16777619U; }
  { struct KernelState_54 ks = { h ^ 55U, h + 921U, 54, 162U, 6U }; h = (h ^ kernel_step_54(&ks, h + 54U)) * 16777619U; }
  { struct KernelState_55 ks = { h ^ 56U, h + 938U, 55, 165U, 7U }; h = (h ^ kernel_step_55(&ks, h + 55U)) * 16777619U; }
  { struct KernelState_56 ks = { h ^ 57U, h + 955U, 56, 168U, 0U }; h = (h ^ kernel_step_56(&ks, h + 56U)) * 16777619U; }
  { struct KernelState_57 ks = { h ^ 58U, h + 972U, 57, 171U, 1U }; h = (h ^ kernel_step_57(&ks, h + 57U)) * 16777619U; }
  { struct KernelState_58 ks = { h ^ 59U, h + 989U, 58, 174U, 2U }; h = (h ^ kernel_step_58(&ks, h + 58U)) * 16777619U; }
  { struct KernelState_59 ks = { h ^ 60U, h + 1006U, 59, 177U, 3U }; h = (h ^ kernel_step_59(&ks, h + 59U)) * 16777619U; }
  { struct KernelState_60 ks = { h ^ 61U, h + 1023U, 60, 180U, 4U }; h = (h ^ kernel_step_60(&ks, h + 60U)) * 16777619U; }
  { struct KernelState_61 ks = { h ^ 62U, h + 1040U, 61, 183U, 5U }; h = (h ^ kernel_step_61(&ks, h + 61U)) * 16777619U; }
  { struct KernelState_62 ks = { h ^ 63U, h + 1057U, 62, 186U, 6U }; h = (h ^ kernel_step_62(&ks, h + 62U)) * 16777619U; }
  { struct KernelState_63 ks = { h ^ 64U, h + 1074U, 63, 189U, 7U }; h = (h ^ kernel_step_63(&ks, h + 63U)) * 16777619U; }
  { struct KernelState_64 ks = { h ^ 65U, h + 1091U, 64, 192U, 0U }; h = (h ^ kernel_step_64(&ks, h + 64U)) * 16777619U; }
  { struct KernelState_65 ks = { h ^ 66U, h + 1108U, 65, 195U, 1U }; h = (h ^ kernel_step_65(&ks, h + 65U)) * 16777619U; }
  { struct KernelState_66 ks = { h ^ 67U, h + 1125U, 66, 198U, 2U }; h = (h ^ kernel_step_66(&ks, h + 66U)) * 16777619U; }
  { struct KernelState_67 ks = { h ^ 68U, h + 1142U, 67, 201U, 3U }; h = (h ^ kernel_step_67(&ks, h + 67U)) * 16777619U; }
  { struct KernelState_68 ks = { h ^ 69U, h + 1159U, 68, 204U, 4U }; h = (h ^ kernel_step_68(&ks, h + 68U)) * 16777619U; }
  { struct KernelState_69 ks = { h ^ 70U, h + 1176U, 69, 207U, 5U }; h = (h ^ kernel_step_69(&ks, h + 69U)) * 16777619U; }
  { struct KernelState_70 ks = { h ^ 71U, h + 1193U, 70, 210U, 6U }; h = (h ^ kernel_step_70(&ks, h + 70U)) * 16777619U; }
  { struct KernelState_71 ks = { h ^ 72U, h + 1210U, 71, 213U, 7U }; h = (h ^ kernel_step_71(&ks, h + 71U)) * 16777619U; }
  { struct KernelState_72 ks = { h ^ 73U, h + 1227U, 72, 216U, 0U }; h = (h ^ kernel_step_72(&ks, h + 72U)) * 16777619U; }
  { struct KernelState_73 ks = { h ^ 74U, h + 1244U, 73, 219U, 1U }; h = (h ^ kernel_step_73(&ks, h + 73U)) * 16777619U; }
  { struct KernelState_74 ks = { h ^ 75U, h + 1261U, 74, 222U, 2U }; h = (h ^ kernel_step_74(&ks, h + 74U)) * 16777619U; }
  { struct KernelState_75 ks = { h ^ 76U, h + 1278U, 75, 225U, 3U }; h = (h ^ kernel_step_75(&ks, h + 75U)) * 16777619U; }
  { struct KernelState_76 ks = { h ^ 77U, h + 1295U, 76, 228U, 4U }; h = (h ^ kernel_step_76(&ks, h + 76U)) * 16777619U; }
  { struct KernelState_77 ks = { h ^ 78U, h + 1312U, 77, 231U, 5U }; h = (h ^ kernel_step_77(&ks, h + 77U)) * 16777619U; }
  { struct KernelState_78 ks = { h ^ 79U, h + 1329U, 78, 234U, 6U }; h = (h ^ kernel_step_78(&ks, h + 78U)) * 16777619U; }
  { struct KernelState_79 ks = { h ^ 80U, h + 1346U, 79, 237U, 7U }; h = (h ^ kernel_step_79(&ks, h + 79U)) * 16777619U; }
  { struct KernelState_80 ks = { h ^ 81U, h + 1363U, 80, 240U, 0U }; h = (h ^ kernel_step_80(&ks, h + 80U)) * 16777619U; }
  { struct KernelState_81 ks = { h ^ 82U, h + 1380U, 81, 243U, 1U }; h = (h ^ kernel_step_81(&ks, h + 81U)) * 16777619U; }
  { struct KernelState_82 ks = { h ^ 83U, h + 1397U, 82, 246U, 2U }; h = (h ^ kernel_step_82(&ks, h + 82U)) * 16777619U; }
  { struct KernelState_83 ks = { h ^ 84U, h + 1414U, 83, 249U, 3U }; h = (h ^ kernel_step_83(&ks, h + 83U)) * 16777619U; }
  { struct KernelState_84 ks = { h ^ 85U, h + 1431U, 84, 252U, 4U }; h = (h ^ kernel_step_84(&ks, h + 84U)) * 16777619U; }
  { struct KernelState_85 ks = { h ^ 86U, h + 1448U, 85, 255U, 5U }; h = (h ^ kernel_step_85(&ks, h + 85U)) * 16777619U; }
  { struct KernelState_86 ks = { h ^ 87U, h + 1465U, 86, 258U, 6U }; h = (h ^ kernel_step_86(&ks, h + 86U)) * 16777619U; }
  { struct KernelState_87 ks = { h ^ 88U, h + 1482U, 87, 261U, 7U }; h = (h ^ kernel_step_87(&ks, h + 87U)) * 16777619U; }
  { struct KernelState_88 ks = { h ^ 89U, h + 1499U, 88, 264U, 0U }; h = (h ^ kernel_step_88(&ks, h + 88U)) * 16777619U; }
  { struct KernelState_89 ks = { h ^ 90U, h + 1516U, 89, 267U, 1U }; h = (h ^ kernel_step_89(&ks, h + 89U)) * 16777619U; }
  { struct KernelState_90 ks = { h ^ 91U, h + 1533U, 90, 270U, 2U }; h = (h ^ kernel_step_90(&ks, h + 90U)) * 16777619U; }
  { struct KernelState_91 ks = { h ^ 92U, h + 1550U, 91, 273U, 3U }; h = (h ^ kernel_step_91(&ks, h + 91U)) * 16777619U; }
  { struct KernelState_92 ks = { h ^ 93U, h + 1567U, 92, 276U, 4U }; h = (h ^ kernel_step_92(&ks, h + 92U)) * 16777619U; }
  { struct KernelState_93 ks = { h ^ 94U, h + 1584U, 93, 279U, 5U }; h = (h ^ kernel_step_93(&ks, h + 93U)) * 16777619U; }
  { struct KernelState_94 ks = { h ^ 95U, h + 1601U, 94, 282U, 6U }; h = (h ^ kernel_step_94(&ks, h + 94U)) * 16777619U; }
  { struct KernelState_95 ks = { h ^ 96U, h + 1618U, 95, 285U, 7U }; h = (h ^ kernel_step_95(&ks, h + 95U)) * 16777619U; }
  { struct KernelState_96 ks = { h ^ 97U, h + 1635U, 96, 288U, 0U }; h = (h ^ kernel_step_96(&ks, h + 96U)) * 16777619U; }
  { struct KernelState_97 ks = { h ^ 98U, h + 1652U, 97, 291U, 1U }; h = (h ^ kernel_step_97(&ks, h + 97U)) * 16777619U; }
  { struct KernelState_98 ks = { h ^ 99U, h + 1669U, 98, 294U, 2U }; h = (h ^ kernel_step_98(&ks, h + 98U)) * 16777619U; }
  { struct KernelState_99 ks = { h ^ 100U, h + 1686U, 99, 297U, 3U }; h = (h ^ kernel_step_99(&ks, h + 99U)) * 16777619U; }
  { struct KernelState_100 ks = { h ^ 101U, h + 1703U, 100, 300U, 4U }; h = (h ^ kernel_step_100(&ks, h + 100U)) * 16777619U; }
  { struct KernelState_101 ks = { h ^ 102U, h + 1720U, 101, 303U, 5U }; h = (h ^ kernel_step_101(&ks, h + 101U)) * 16777619U; }
  { struct KernelState_102 ks = { h ^ 103U, h + 1737U, 102, 306U, 6U }; h = (h ^ kernel_step_102(&ks, h + 102U)) * 16777619U; }
  { struct KernelState_103 ks = { h ^ 104U, h + 1754U, 103, 309U, 7U }; h = (h ^ kernel_step_103(&ks, h + 103U)) * 16777619U; }
  { struct KernelState_104 ks = { h ^ 105U, h + 1771U, 104, 312U, 0U }; h = (h ^ kernel_step_104(&ks, h + 104U)) * 16777619U; }
  { struct KernelState_105 ks = { h ^ 106U, h + 1788U, 105, 315U, 1U }; h = (h ^ kernel_step_105(&ks, h + 105U)) * 16777619U; }
  { struct KernelState_106 ks = { h ^ 107U, h + 1805U, 106, 318U, 2U }; h = (h ^ kernel_step_106(&ks, h + 106U)) * 16777619U; }
  { struct KernelState_107 ks = { h ^ 108U, h + 1822U, 107, 321U, 3U }; h = (h ^ kernel_step_107(&ks, h + 107U)) * 16777619U; }
  { struct KernelState_108 ks = { h ^ 109U, h + 1839U, 108, 324U, 4U }; h = (h ^ kernel_step_108(&ks, h + 108U)) * 16777619U; }
  { struct KernelState_109 ks = { h ^ 110U, h + 1856U, 109, 327U, 5U }; h = (h ^ kernel_step_109(&ks, h + 109U)) * 16777619U; }
  { struct KernelState_110 ks = { h ^ 111U, h + 1873U, 110, 330U, 6U }; h = (h ^ kernel_step_110(&ks, h + 110U)) * 16777619U; }
  { struct KernelState_111 ks = { h ^ 112U, h + 1890U, 111, 333U, 7U }; h = (h ^ kernel_step_111(&ks, h + 111U)) * 16777619U; }
  { struct KernelState_112 ks = { h ^ 113U, h + 1907U, 112, 336U, 0U }; h = (h ^ kernel_step_112(&ks, h + 112U)) * 16777619U; }
  { struct KernelState_113 ks = { h ^ 114U, h + 1924U, 113, 339U, 1U }; h = (h ^ kernel_step_113(&ks, h + 113U)) * 16777619U; }
  { struct KernelState_114 ks = { h ^ 115U, h + 1941U, 114, 342U, 2U }; h = (h ^ kernel_step_114(&ks, h + 114U)) * 16777619U; }
  { struct KernelState_115 ks = { h ^ 116U, h + 1958U, 115, 345U, 3U }; h = (h ^ kernel_step_115(&ks, h + 115U)) * 16777619U; }
  { struct KernelState_116 ks = { h ^ 117U, h + 1975U, 116, 348U, 4U }; h = (h ^ kernel_step_116(&ks, h + 116U)) * 16777619U; }
  { struct KernelState_117 ks = { h ^ 118U, h + 1992U, 117, 351U, 5U }; h = (h ^ kernel_step_117(&ks, h + 117U)) * 16777619U; }
  { struct KernelState_118 ks = { h ^ 119U, h + 2009U, 118, 354U, 6U }; h = (h ^ kernel_step_118(&ks, h + 118U)) * 16777619U; }
  { struct KernelState_119 ks = { h ^ 120U, h + 2026U, 119, 357U, 7U }; h = (h ^ kernel_step_119(&ks, h + 119U)) * 16777619U; }
  { struct KernelState_120 ks = { h ^ 121U, h + 2043U, 120, 360U, 0U }; h = (h ^ kernel_step_120(&ks, h + 120U)) * 16777619U; }
  { struct KernelState_121 ks = { h ^ 122U, h + 2060U, 121, 363U, 1U }; h = (h ^ kernel_step_121(&ks, h + 121U)) * 16777619U; }
  { struct KernelState_122 ks = { h ^ 123U, h + 2077U, 122, 366U, 2U }; h = (h ^ kernel_step_122(&ks, h + 122U)) * 16777619U; }
  { struct KernelState_123 ks = { h ^ 124U, h + 2094U, 123, 369U, 3U }; h = (h ^ kernel_step_123(&ks, h + 123U)) * 16777619U; }
  { struct KernelState_124 ks = { h ^ 125U, h + 2111U, 124, 372U, 4U }; h = (h ^ kernel_step_124(&ks, h + 124U)) * 16777619U; }
  { struct KernelState_125 ks = { h ^ 126U, h + 2128U, 125, 375U, 5U }; h = (h ^ kernel_step_125(&ks, h + 125U)) * 16777619U; }
  { struct KernelState_126 ks = { h ^ 127U, h + 2145U, 126, 378U, 6U }; h = (h ^ kernel_step_126(&ks, h + 126U)) * 16777619U; }
  { struct KernelState_127 ks = { h ^ 128U, h + 2162U, 127, 381U, 7U }; h = (h ^ kernel_step_127(&ks, h + 127U)) * 16777619U; }
  { struct KernelState_128 ks = { h ^ 129U, h + 2179U, 128, 384U, 0U }; h = (h ^ kernel_step_128(&ks, h + 128U)) * 16777619U; }
  { struct KernelState_129 ks = { h ^ 130U, h + 2196U, 129, 387U, 1U }; h = (h ^ kernel_step_129(&ks, h + 129U)) * 16777619U; }
  { struct KernelState_130 ks = { h ^ 131U, h + 2213U, 130, 390U, 2U }; h = (h ^ kernel_step_130(&ks, h + 130U)) * 16777619U; }
  { struct KernelState_131 ks = { h ^ 132U, h + 2230U, 131, 393U, 3U }; h = (h ^ kernel_step_131(&ks, h + 131U)) * 16777619U; }
  { struct KernelState_132 ks = { h ^ 133U, h + 2247U, 132, 396U, 4U }; h = (h ^ kernel_step_132(&ks, h + 132U)) * 16777619U; }
  { struct KernelState_133 ks = { h ^ 134U, h + 2264U, 133, 399U, 5U }; h = (h ^ kernel_step_133(&ks, h + 133U)) * 16777619U; }
  { struct KernelState_134 ks = { h ^ 135U, h + 2281U, 134, 402U, 6U }; h = (h ^ kernel_step_134(&ks, h + 134U)) * 16777619U; }
  { struct KernelState_135 ks = { h ^ 136U, h + 2298U, 135, 405U, 7U }; h = (h ^ kernel_step_135(&ks, h + 135U)) * 16777619U; }
  { struct KernelState_136 ks = { h ^ 137U, h + 2315U, 136, 408U, 0U }; h = (h ^ kernel_step_136(&ks, h + 136U)) * 16777619U; }
  { struct KernelState_137 ks = { h ^ 138U, h + 2332U, 137, 411U, 1U }; h = (h ^ kernel_step_137(&ks, h + 137U)) * 16777619U; }
  { struct KernelState_138 ks = { h ^ 139U, h + 2349U, 138, 414U, 2U }; h = (h ^ kernel_step_138(&ks, h + 138U)) * 16777619U; }
  { struct KernelState_139 ks = { h ^ 140U, h + 2366U, 139, 417U, 3U }; h = (h ^ kernel_step_139(&ks, h + 139U)) * 16777619U; }
  { struct KernelState_140 ks = { h ^ 141U, h + 2383U, 140, 420U, 4U }; h = (h ^ kernel_step_140(&ks, h + 140U)) * 16777619U; }
  { struct KernelState_141 ks = { h ^ 142U, h + 2400U, 141, 423U, 5U }; h = (h ^ kernel_step_141(&ks, h + 141U)) * 16777619U; }
  { struct KernelState_142 ks = { h ^ 143U, h + 2417U, 142, 426U, 6U }; h = (h ^ kernel_step_142(&ks, h + 142U)) * 16777619U; }
  { struct KernelState_143 ks = { h ^ 144U, h + 2434U, 143, 429U, 7U }; h = (h ^ kernel_step_143(&ks, h + 143U)) * 16777619U; }
  { struct KernelState_144 ks = { h ^ 145U, h + 2451U, 144, 432U, 0U }; h = (h ^ kernel_step_144(&ks, h + 144U)) * 16777619U; }
  { struct KernelState_145 ks = { h ^ 146U, h + 2468U, 145, 435U, 1U }; h = (h ^ kernel_step_145(&ks, h + 145U)) * 16777619U; }
  { struct KernelState_146 ks = { h ^ 147U, h + 2485U, 146, 438U, 2U }; h = (h ^ kernel_step_146(&ks, h + 146U)) * 16777619U; }
  { struct KernelState_147 ks = { h ^ 148U, h + 2502U, 147, 441U, 3U }; h = (h ^ kernel_step_147(&ks, h + 147U)) * 16777619U; }
  { struct KernelState_148 ks = { h ^ 149U, h + 2519U, 148, 444U, 4U }; h = (h ^ kernel_step_148(&ks, h + 148U)) * 16777619U; }
  { struct KernelState_149 ks = { h ^ 150U, h + 2536U, 149, 447U, 5U }; h = (h ^ kernel_step_149(&ks, h + 149U)) * 16777619U; }
  { struct KernelState_150 ks = { h ^ 151U, h + 2553U, 150, 450U, 6U }; h = (h ^ kernel_step_150(&ks, h + 150U)) * 16777619U; }
  { struct KernelState_151 ks = { h ^ 152U, h + 2570U, 151, 453U, 7U }; h = (h ^ kernel_step_151(&ks, h + 151U)) * 16777619U; }
  { struct KernelState_152 ks = { h ^ 153U, h + 2587U, 152, 456U, 0U }; h = (h ^ kernel_step_152(&ks, h + 152U)) * 16777619U; }
  { struct KernelState_153 ks = { h ^ 154U, h + 2604U, 153, 459U, 1U }; h = (h ^ kernel_step_153(&ks, h + 153U)) * 16777619U; }
  { struct KernelState_154 ks = { h ^ 155U, h + 2621U, 154, 462U, 2U }; h = (h ^ kernel_step_154(&ks, h + 154U)) * 16777619U; }
  { struct KernelState_155 ks = { h ^ 156U, h + 2638U, 155, 465U, 3U }; h = (h ^ kernel_step_155(&ks, h + 155U)) * 16777619U; }
  { struct KernelState_156 ks = { h ^ 157U, h + 2655U, 156, 468U, 4U }; h = (h ^ kernel_step_156(&ks, h + 156U)) * 16777619U; }
  { struct KernelState_157 ks = { h ^ 158U, h + 2672U, 157, 471U, 5U }; h = (h ^ kernel_step_157(&ks, h + 157U)) * 16777619U; }
  { struct KernelState_158 ks = { h ^ 159U, h + 2689U, 158, 474U, 6U }; h = (h ^ kernel_step_158(&ks, h + 158U)) * 16777619U; }
  { struct KernelState_159 ks = { h ^ 160U, h + 2706U, 159, 477U, 7U }; h = (h ^ kernel_step_159(&ks, h + 159U)) * 16777619U; }
  { struct KernelState_160 ks = { h ^ 161U, h + 2723U, 160, 480U, 0U }; h = (h ^ kernel_step_160(&ks, h + 160U)) * 16777619U; }
  { struct KernelState_161 ks = { h ^ 162U, h + 2740U, 161, 483U, 1U }; h = (h ^ kernel_step_161(&ks, h + 161U)) * 16777619U; }
  { struct KernelState_162 ks = { h ^ 163U, h + 2757U, 162, 486U, 2U }; h = (h ^ kernel_step_162(&ks, h + 162U)) * 16777619U; }
  { struct KernelState_163 ks = { h ^ 164U, h + 2774U, 163, 489U, 3U }; h = (h ^ kernel_step_163(&ks, h + 163U)) * 16777619U; }
  { struct KernelState_164 ks = { h ^ 165U, h + 2791U, 164, 492U, 4U }; h = (h ^ kernel_step_164(&ks, h + 164U)) * 16777619U; }
  return h;
}

int main(void) {
  /* 1. SHA-256("abc") NIST vector: ba7816bf 8f01cfea ... */
  struct Sha256Ctx sctx;
  uint8_t digest[32];
  sha256_init(&sctx);
  sha256_update(&sctx, (const uint8_t *)"abc", 3);
  sha256_final(&sctx, digest);
  uint32_t sha_w0 = ((uint32_t)digest[0] << 24) | ((uint32_t)digest[1] << 16) | ((uint32_t)digest[2] << 8) | digest[3];

  /* 2. ChaCha20 block */
  uint32_t ck[8] = { 0x03020100U, 0x07060504U, 0x0b0a0908U, 0x0f0e0d0cU, 0x13121110U, 0x17161514U, 0x1b1a1918U, 0x1f1e1d1cU };
  uint32_t cn[3] = { 0x09000000U, 0x4a000000U, 0x00000000U };
  uint32_t cb[16];
  chacha20_block(cb, ck, 1, cn);

  /* 3. CRC32 & Adler32("123456789") -> CRC32 = 0xcbf43926 */
  uint32_t crc = crc32_calc((const uint8_t *)"123456789", 9);
  uint32_t adl = adler32_calc((const uint8_t *)"123456789", 9);

  /* 4. LZ77 round-trip */
  const char *lz_in = "ABRACADABRA_ABRACADABRA_TRITON5_TRITON5!";
  size_t lz_n = tb_strlen(lz_in);
  uint8_t lz_comp[128], lz_dec[128];
  size_t clen = lz77_compress((const uint8_t *)lz_in, lz_n, lz_comp);
  size_t dlen = lz77_decompress(lz_comp, clen, lz_dec);
  int lz_ok = (dlen == lz_n && memcmp(lz_in, lz_dec, lz_n) == 0) ? 1 : 0;

  /* 5. Expression parser + VM */
  struct ExprParser ep = { "(12 + 34) * (56 - 40) / 4 - 10", 0, { {0}, {0}, 0 } };
  ep_expr(&ep);
  ep_emit(&ep, VM_HALT, 0);
  int32_t vm_res = vm_exec(&ep.prog); /* 46 * 16 / 4 - 10 = 174 */

  /* 6. QuickSort + Dijkstra + N-Queens(6)=4 + Regex + 3D Ray-Sphere */
  int32_t arr[8] = { 42, -7, 19, 0, 100, 3, -99, 19 };
  qsort_i32(arr, 0, 7);
  int g[6][6] = {
    {0, 7, 9, 0, 0, 14},
    {7, 0, 10, 15, 0, 0},
    {9, 10, 0, 11, 0, 2},
    {0, 15, 11, 0, 6, 0},
    {0, 0, 0, 6, 0, 9},
    {14, 0, 2, 0, 9, 0}
  };
  int spath = dijkstra_6(g, 0, 4); /* 20 */
  int nq = nqueens_solve(6, 0, 0, 0, 0); /* 4 */
  int rx = regex_match("a.*b*c", "axxxbbc") * 10 + regex_match("a.*b*c", "axxxbbd"); /* 10 */
  struct Vec3 ro = { 0.0, 0.0, 0.0 }, rd = { 0.0, 0.0, 1.0 }, sc = { 0.0, 0.0, 5.0 };
  int hit = ray_sphere_hit(ro, rd, sc, 1.0); /* 1 */

  /* 7. Run all 165 compiled DSP/state-machine kernels */
  uint32_t khash = run_all_kernels(sha_w0 ^ cb[0] ^ crc ^ adl);

  tb_puts("TB5K:");
  tb_puthex32(sha_w0); tb_puts(":");
  tb_puthex32(cb[0]); tb_puts(":");
  tb_puthex32(crc); tb_puts(":");
  tb_puthex32(adl); tb_puts(":");
  tb_putint(lz_ok); tb_puts(":");
  tb_putint(vm_res); tb_puts(":");
  tb_putint(arr[0] + arr[7]); tb_puts(":");
  tb_putint(spath); tb_puts(":");
  tb_putint(nq); tb_puts(":");
  tb_putint(rx); tb_puts(":");
  tb_putint(hit); tb_puts(":");
  tb_puthex32(khash);
  tb_puts("\n");
  return 0;
}
