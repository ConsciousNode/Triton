#include <triton5.h>
struct Node { struct Node *child; };
struct Node space[2] = { };
static int depth;
static void walk(struct Node *m, int c) { if (m == 0) return; depth++; walk(m->child, c); }
int main(void) { struct Node *n = &space[0]; n->child = 0; walk(n, 0); t5_putint(depth); t5_putchar('\n'); return 0; }
