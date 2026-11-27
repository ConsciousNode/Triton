Thank you, Neon. tcc5 is a real compiler: every delivered suite reproduces bit for bit, `triton5.html` is untouched,
and on GCC's own torture tests (which you never saw) it passes 1,188 of the 1,678 that host GCC passes. The studio's
audit (`audit/triton5/AUDIT-3.md`) found the following, and asks for a round 3.1. The spec and addendum 1
(`SPEC-TRITON-5-STAGE3-ADDENDUM-1.md`, attached if you haven't seen it) still bind.

**1. Three miscompiles of well-defined C11. The spec forbids these; fix them and add each as a regression test.**
Host GCC (`-m32 -fsigned-char`) shown for comparison:

```c
/* (a) brace elision, 6.7.9p20 */
struct S { char f1; int f2[2]; };
struct S o = {'X', 8, 9};            /* GCC: f2[1] == 9.  tcc5: f2[1] == 0 */

/* (b) integer promotion of bit-fields, 6.3.1.1p2: a bit-field narrower than int promotes to int */
struct x { signed int i : 7; unsigned int u : 7; } bit;
bit.u = 61;  int i = -13;
i % bit.u;                           /* GCC: -13.  tcc5: 44 */
struct { unsigned a : 3; unsigned b : 31; } s;  s.a = 7; s.b = 0x7fffffff;
(s.a > -1), (s.b > -1);              /* GCC: 1, 1.  tcc5: 0, 0 */

/* (c) unnamed bit-fields take no initializer, 6.7.9p9 */
struct { int a:4; int :4; int b:4; int c:4; } y = {2, 3, 4};   /* GCC: 2 3 4.  tcc5: 2 4 0 */
```

**2. Attributes that change a type or layout must not be ignored.** `typedef int v4 __attribute__((vector_size(16)))`
gives `sizeof == 4` with no diagnostic. Make an unsupported attribute that changes a type or layout a hard error,
and warn on the other unknown ones.

**3. Conformance (test 1):** the spec asked for a test program for every C11 clause you implement, with expected
output written from the standard. Six multi-clause programs aren't that, and these bugs slipped through the gap.

**4. Differential (test 2):** the generator is one template of `uint32_t` arithmetic. Build a real random program
generator: pointers, arrays, structs and unions, bit-fields, `char`/`short` promotions, nested control flow and
calls. Apply addendum 1: host GCC with `-m32 -fsigned-char -std=c11`, UBSan as a checked filter (generated,
rejected and run counts reported), and generator coverage reported.

**5. The page must work from disk, as one file.** Opened via file://, Run fails ("Blocked a frame with origin
"null" from accessing a cross-origin frame"), because the page reaches into `triton5.html` in an iframe. Inline the
machine (labelled, as a lift) so `triton5-cc.html` is a single file that compiles and runs offline. Test it from a
file:// URL, not by setting document content over CDP.

**6. ABI-5 must match the code.** It says the first 4 argument slots use `R0..R3`; the code uses `R0..R2`. Also add
addendum 1's worked example: `memcpy` a negative `int` into 4 bytes, and show what each byte reads back as and what
each tryte holds. Report the cost of byte-per-tryte stores (an `int` store is four byte stores today) and what it
would take to store a whole word without breaking `memcpy` semantics.

**7. Builtins NetBSD calls by name:** `__builtin_memcpy`, `memset`, `memcmp`, `strlen`, `strcmp`, `abort`, `trap`,
`alloca`, `ffs` and the `__builtin_*_overflow` family need real meanings (inline or runtime), not undefined symbols.

**8. Optional:** K&R function definitions (NetBSD's tree still has some).

Everything else stands: same forbidden list, same honesty rules. If something can't be met, say so in the report and
leave it failing.
