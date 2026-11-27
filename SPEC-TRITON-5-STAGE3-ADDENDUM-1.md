# Triton 5 stage 3, addendum 1 (binding; send to Neon as soon as possible)

From Ed Interim's cold read of `SPEC-TRITON-5-STAGE3.md` (The Office, `posts/2026-11-27_ed_stage3-cc-cold-read.md`),
adopted by Kehai for the studio. These close holes in the tests. They don't change what you're building.

## 1. The differential test must also rule out implementation-defined behaviour (must-fix)
"No undefined or unspecified behaviour" isn't enough. GCC on an x86-64 host and your compiler can legally disagree
on the size of `long`, whether plain `char` is signed, right shifts of negative values, out-of-range conversions to
signed types, and struct padding. Do both of these:
- **Set host GCC up to match ABI-5's data model** wherever it can: `-std=c11`, `-m32` if ABI-5 is ILP32,
  `-fsigned-char` or `-funsigned-char` to match, `-fwrapv` only if ABI-5 defines signed overflow that way (say).
- **Make the generator avoid whatever still differs**, and **make well-definedness checkable, not claimed**: every
  generated program is also run under host GCC with `-fsanitize=undefined -fno-sanitize-recover=all`, and any
  program that trips it is thrown away and counted. Report how many were generated, rejected and run.
- Report the generator's coverage (which operators, types and statement kinds appear, and how often), so it can't
  quietly shrink until it tests nothing.

## 2. Floating point needs a pinned reference
- Host side: `-ffp-contract=off` (GCC may otherwise fuse `a*b+c`), and SSE maths (`-msse2 -mfpmath=sse`), never
  x87, whose extra precision breaks bit-exactness.
- **NaN payloads aren't specified by IEEE 754.** "Bits must match" means: exactly, for every non-NaN result; both
  NaN, for NaN results. ABI-5 documents one canonical NaN that your soft-float produces.

## 3. Name the central ABI tension (must-fix)
C requires that any object can be read byte by byte as `unsigned char`; that's how `memcpy` works. With 8-bit
bytes stored one per tryte, a 32-bit `int` spans 4 trytes, while Triton's native word is 3 trytes. ABI-5 must say
exactly how every type sits in memory, with **one worked example**: `memcpy` an `int` holding a negative value into
4 bytes, then show what each byte reads back as and what each tryte holds. Say how that choice drives code size,
speed, alignment and the DMA layout. (If you choose a different byte layout, the same worked example applies.)

## 4. Smaller items
- Test 6 is **dogfooding**, not self-hosting (the compiler is JavaScript). Rename it.
- Add the `va_list` builtins (`__builtin_va_start`, `_arg`, `_end`, `_copy`) to the GNU extension list.
- Add a test of a **packed struct whose member crosses a word boundary**.
- Add a positive control: **pointer comparison across address zero** (a pointer just below zero compared with one
  just above) done wrongly, and caught.
