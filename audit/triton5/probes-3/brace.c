#include <triton5.h>
struct S { char f1; int f2[2]; };
struct S object = {'X', 8, 9};          /* brace elision, C11 6.7.9p20 */
int main(void) { t5_putint(object.f1); t5_putchar(' '); t5_putint(object.f2[0]); t5_putchar(' '); t5_putint(object.f2[1]); t5_putchar('\n'); return 0; }
