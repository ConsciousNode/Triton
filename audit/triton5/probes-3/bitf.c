#include <triton5.h>
struct x { signed int i : 7; unsigned int u : 7; };
int main(void) { struct x bit; int i = -13; bit.u = 61; bit.i = -13;
  t5_putint(i % bit.u); t5_putchar(' ');          /* bit.u promotes to int: -13 % 61 = -13 */
  t5_putint(bit.i); t5_putchar(' ');               /* -13 */
  t5_putint(bit.i + 0 < 0); t5_putchar('\n');     /* 1 */
  return 0; }
