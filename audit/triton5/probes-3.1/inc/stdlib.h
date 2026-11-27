#ifndef _STDLIB_H
#define _STDLIB_H
#include <stddef.h>
void abort(void);
void exit(int);
void *malloc(size_t);
void *calloc(size_t, size_t);
void *realloc(void *, size_t);
void free(void *);
int abs(int);
long labs(long);
#endif
