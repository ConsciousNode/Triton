#include <triton5.h>
struct { int a:4; int :4; int b:4; int c:4; } x = { 2, 3, 4 };   /* unnamed bit-fields take no initializer (6.7.9p9) */
int main(void) { t5_putint(x.a); t5_putchar(' '); t5_putint(x.b); t5_putchar(' '); t5_putint(x.c); t5_putchar('\n'); return 0; }
