/* libmini for 3.1: strlen and strcmp now in runtime rt_mem.c; the abort, trap, mem and str builtins are now compiler builtins (REPORT-5 s1.7). Otherwise identical to probes-3 libmini.c */
/* auditor's probe library (not part of the delivery): just enough libc for the GCC torture tests */
#include <stddef.h>
#include <stdint.h>
#include <stdarg.h>
#include <triton5.h>
void abort(void); size_t strlen(const char *); int strcmp(const char *, const char *); char *strcpy(char *, const char *); void *malloc(size_t); int abs(int);
static void halt_(void) { __asm__ volatile ("HALT"); for (;;) {} }
void abort(void) { t5_puts("\n@@ABORT\n"); halt_(); }
void exit(int c) { t5_puts("\n@@EXIT "); t5_putint(c); t5_putchar('\n'); halt_(); }
static char heap_[400000]; static size_t hp_;
void *malloc(size_t n) { n = (n + 7) & ~(size_t)7; if (hp_ + n > sizeof heap_) return 0; void *p = heap_ + hp_; hp_ += n; return p; }
void *calloc(size_t a, size_t b) { void *p = malloc(a * b); if (p) memset(p, 0, a * b); return p; }
void free(void *p) { (void)p; }
void *realloc(void *p, size_t n) { void *q = malloc(n); if (q && p) memcpy(q, p, n); return q; }
int abs(int x) { return x < 0 ? -x : x; }
long labs(long x) { return x < 0 ? -x : x; }
int strncmp(const char *a, const char *b, size_t n) { for (; n; n--, a++, b++) { if (*a != *b) return (unsigned char)*a - (unsigned char)*b; if (!*a) return 0; } return 0; }
char *strcpy(char *d, const char *s) { char *r = d; while ((*d++ = *s++)) {} return r; }
char *strncpy(char *d, const char *s, size_t n) { size_t i = 0; for (; i < n && s[i]; i++) d[i] = s[i]; for (; i < n; i++) d[i] = 0; return d; }
char *strchr(const char *s, int c) { for (;; s++) { if (*s == (char)c) return (char *)s; if (!*s) return 0; } }
char *strcat(char *d, const char *s) { strcpy(d + strlen(d), s); return d; }
int putchar(int c) { t5_putchar(c); return c; }
int puts(const char *s) { t5_puts(s); t5_putchar('\n'); return 0; }
int printf(const char *f, ...) { va_list ap; va_start(ap, f);
  for (; *f; f++) { if (*f != '%') { t5_putchar(*f); continue; } f++; while (*f == 'l' || *f == 'h') f++;
    if (*f == 'd' || *f == 'i') t5_putint(va_arg(ap, int)); else if (*f == 's') t5_puts(va_arg(ap, const char *));
    else if (*f == 'c') t5_putchar(va_arg(ap, int)); else if (*f == 'x' || *f == 'u') t5_puthex32(va_arg(ap, unsigned)); else t5_putchar(*f); }
  va_end(ap); return 0; }
int __t_main(void);
int main(void) { int r = __t_main(); t5_puts("\n@@RET "); t5_putint(r); t5_putchar('\n'); return r; }
/* plain-function stand-ins for GCC builtins tcc5 leaves to the library */
char *__builtin_strcpy(char *d, const char *s) { return strcpy(d, s); }
void *__builtin_malloc(size_t n) { return malloc(n); }
int __builtin_abs(int x) { return abs(x); }
