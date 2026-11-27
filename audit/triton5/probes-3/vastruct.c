#include <triton5.h>
#include <stdarg.h>
typedef struct { char x[3]; } A3; typedef struct { char x[5]; } A5;
static void foo(int n, ...) { va_list ap; va_start(ap, n);
  A3 a = va_arg(ap, A3); A5 b = va_arg(ap, A5); int k = va_arg(ap, int);
  t5_putint(a.x[0]); t5_putint(a.x[2]); t5_putchar(' '); t5_putint(b.x[0]); t5_putint(b.x[4]); t5_putchar(' '); t5_putint(k); t5_putchar('\n'); va_end(ap); }
int main(void) { A3 a = {{1,2,3}}; A5 b = {{4,5,6,7,8}}; foo(2, a, b, 99); return 0; }
