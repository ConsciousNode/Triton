#include <triton5.h>
typedef int v4 __attribute__((vector_size(16)));
int main(void) { v4 a = {1, 2, 3, 4}; t5_putint(sizeof(a)); t5_putchar('\n'); return 0; }
