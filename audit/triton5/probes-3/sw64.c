#include <triton5.h>
static int f(unsigned long long x) { switch (x) { case 1000000000000000000ULL: return 19; case 5ULL: return 5; default: return 20; } }
static int g(unsigned long long x) { if (x == 1000000000000000000ULL) return 19; return 20; }
int main(void) { t5_putint(f(1000000000000000000ULL)); t5_putchar(' '); t5_putint(f(5)); t5_putchar(' '); t5_putint(g(1000000000000000000ULL)); t5_putchar('\n'); return 0; }
