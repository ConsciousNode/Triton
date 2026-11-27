#include <triton5.h>
struct { char a1c; char *a1p; } a1 = { '4', "62" };
struct { char a2c; char a2p[2]; } a2 = { 'v', "cq" };
int main(void) { t5_putchar(a1.a1c); t5_putchar(a1.a1p[0]); t5_putchar(a1.a1p[1]); t5_putchar(' ');
  t5_putchar(a2.a2c); t5_putchar(a2.a2p[0]); t5_putchar(a2.a2p[1]); t5_putchar('\n'); return 0; }
