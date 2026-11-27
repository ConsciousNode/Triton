# Triton 5, stage 3: the studio's own C compiler for Triton

ConsciousNode SoftWorks. Xinu rules: from-scratch, zero dependencies, no network, works offline, MIT licence.
Inline everything, and label every inline (a comment naming where it came from). Spec by Kehai Interim, for Kham.

**Builder: Gemini Neon.** You built Triton 5 stages 1 and 2, and both were accepted. Read the two audits
(`audit/triton5/AUDIT-1.md`, `AUDIT-2.md`) and `DECISION-PAGE-SIZE.md` first.

## Where this is going
The studio is porting **NetBSD natively to Triton**: a real kernel and userland compiled for Triton's own
instruction set. Stages 1 and 2 built the machine (paging, the binary-semantics instructions for C, what a kernel
needs). This round builds the head of the dragon: **a C compiler of our own.** Not an LLVM or GCC backend. The
studio writes its own tools, like TabComp's C compiler that compiled DOOM.

Later rounds, not this one: libc, the rest of the toolchain, the MMU card, then NetBSD itself. Don't start them,
and don't stub them.

## The base
- Machine: `audit/triton5/delivery-2/triton5.html` (stage 2, accepted), its `ISA-5.md`, and the `t5-*` tests.
  Copy it to the repo root as `triton5.html` with the stage-2 hash recorded, and change nothing in it unless a
  requirement truly needs it (then say so first and list it).
- **Pages are balanced-3⁷, 2,187 trytes** (`DECISION-PAGE-SIZE.md`). The linker aligns sections to that.
- Prior art inside the studio: TabComp's C compiler (`ConsciousNode/TabComp`, attached if Kham includes it) and
  SpiralOS's SpiralC. Lift what helps and label it. Neither targets ternary, so most of this is new.

## What to build
1. **`tcc5`** (name it, and say why): a C compiler for Triton 5, written in JavaScript, that runs both in Node
   (a CLI) and in a page (`triton5-cc.html`, one file, works offline). Source in, Triton object code out.
2. **An assembler and a linker** for Triton 5, with an object format and an executable format you design and
   document in `ABI-5.md`. Relocations, symbols, sections, and a static link of several objects into one image
   that `triton5.html` loads and runs.
3. **A freestanding runtime:** the support routines compiled code calls (memcpy and friends, 64-bit helpers
   where the instructions don't cover it, software floating point), in C or assembly, built by your own tools.
4. **`ABI-5.md`, the C data model and calling convention**, decided from Triton 5 as it really is. Read
   `ISA-5.md` first. It must say:
   - what `char`, `short`, `int`, `long`, `long long`, pointers, `float` and `double` are, in Triton's own
     units, and how each value is stored in memory;
   - that `CHAR_BIT` is 8, and how unsigned and signed arithmetic get exact binary behaviour from the stage-1
     binary-semantics instructions (wrap to 2ⁿ, bitwise ops, register-pair carries);
   - registers, argument passing, return values, varargs, the stack frame, alignment, what's caller- and
     callee-saved, and how struct arguments and returns work;
   - what a C pointer is on a balanced-ternary machine whose addresses can be negative, and how pointer
     comparison, `ptrdiff_t` and `uintptr_t` behave.
   Justify every choice in one or two lines.

## The language
- **ISO C11, freestanding, the whole language:** the preprocessor (macros, `#include`, `#if`, `#line`,
  stringizing and pasting), every integer type, `_Bool`, structs, unions, bit-fields, enums, arrays, VLAs,
  pointers to functions, `const`/`volatile`/`restrict`, compound literals, designated initialisers, `_Static_assert`,
  `_Alignas`/`_Alignof`, `_Generic`, and `<stdarg.h>`, `<stddef.h>`, `<stdint.h>`, `<limits.h>`, `<stdbool.h>`,
  `<float.h>`, `<stdalign.h>`, `<stdnoreturn.h>`, `<iso646.h>`.
- **`float` and `double` as IEEE 754 binary32 and binary64**, with round-to-nearest-even, computed in software
  (Triton has no FPU). The results must be bit-exact.
- **The GNU extensions a BSD kernel leans on, starting with:** `__attribute__` (aligned, packed, section, noreturn,
  unused, used, weak, always_inline, noinline, const, pure, format, constructor), `__asm__` with Triton operand
  constraints and clobbers, `__builtin_expect`, `__builtin_unreachable`, `__builtin_constant_p`,
  `__builtin_offsetof`, the `__builtin_*` bit operations (clz, ctz, popcount, bswap), `__typeof__`, statement
  expressions, `__label__` and computed goto, zero-length arrays, `__sync`/`__atomic` builtins on the stage-1
  compare-and-swap. List each one you implement and its test.
- **Diagnostics with line numbers.** Undefined behaviour doesn't have to be diagnosed, but nothing well-defined
  may be miscompiled.

## Tests (numbered; each writes a line to results.jsonl with code and input hashes)
1. **Conformance, your own suite:** a test program for every C11 clause you implement, each printing what it
   checks, run on `triton5.html`. Expected output is written from the standard, never by running your compiler.
2. **Differential, against GCC on the host:** write a random C program generator under `tests/` (in the spirit of
   Csmith, from scratch). It makes **well-defined** programs (no undefined or unspecified behaviour; say how you
   ensure that) that print a checksum of their state. Compile each with the host's GCC and run it natively, and
   with yours and run it on Triton. The outputs must match on **at least 10,000 programs**, seeded.
3. **Floating point, against the host:** every operation and conversion, on edges (zeros, subnormals, infinities,
   NaNs, rounding ties) and 1,000,000 random cases each. Bits must match the host's IEEE results exactly.
4. **64-bit integers:** every `uint64_t`/`int64_t` operation against BigInt, on edges and 1,000,000 random cases.
5. **Both cores:** every program in tests 1–4 runs on the JS core and the WASM core with equal state hashes at the
   end.
6. **Self-host, the round's trophy:** compile the compiler's own runtime with itself, and compile one real-sized C
   program of at least 5,000 lines (your choice, MIT-compatible, say what it is) that runs correctly on Triton.
7. **The GNU extensions:** a test per extension, `__asm__` included, with expected results written by hand.
8. **Positive controls (each must be caught by the tests above):**
   - unsigned addition that doesn't wrap at 2³²;
   - a right shift of a negative `int` that is logical instead of arithmetic;
   - a struct passed by value whose last member is dropped;
   - a float conversion that truncates instead of rounding to nearest even;
   - a relocation off by one unit;
   - a `volatile` load that the optimiser removes.
9. **Real browser:** `triton5-cc.html` compiles a sample program in the page and runs it on `triton5.html` with 0
   console errors. Say how you tested it.

## Forbidden
- Third-party compiler code: GCC, LLVM/Clang, TCC, chibicc, 8cc, lcc, SDCC and every other compiler are off
  limits as sources. Write from the C standard and the GNU manuals' descriptions of the extensions. The host's GCC
  is allowed **only as the reference** in tests 2 and 3, never in the build.
- Any change to the machine's behaviour, unless a requirement can't be met otherwise (say so first, and list it).
- Precomputed outputs; test-shaped special cases; branching on test names, file names or inputs; an optimiser
  that recognises test programs.
- Changing existing tests, harnesses, accessors or console paths to make a check pass.
- An emulator reading or writing a guest's private memory, except through documented ports and DMA.

## Report
State what was built and how each claim was verified. Don't describe anything as working unless a test exercises
it. Mark every number as measured: compile speed, code size, run speed against the native host if you measure
it. Don't predict or rank. List every C11 feature or extension you didn't finish.

If a requirement can't be met, or conflicts with another, say so in REPORT-5.md and leave it failing. Never change
emulator or VM accessors, I/O, consoles, test harnesses, or the auditor's scripts to make a check pass. An emulator
must never read or write a guest's private memory.
