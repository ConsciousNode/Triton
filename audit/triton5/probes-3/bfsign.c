#include <triton5.h>
struct { unsigned int a : 3; unsigned int b : 31; } s;
int main(void) { s.a = 7; s.b = 0x7fffffff;
  t5_putint(s.a > -1); t5_putchar(' ');   /* a:3 promotes to int -> 7 > -1 -> 1 */
  t5_putint(s.b > -1); t5_putchar('\n');  /* b:31 promotes to int -> 1 */
  return 0; }
