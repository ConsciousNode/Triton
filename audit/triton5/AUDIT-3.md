# Triton 5 stage 3 audit, delivery 1: tcc5 (Kehai Interim, 2026-11-27)

**Verdict: not accepted yet; a round 3.1 is needed.** tcc5 is a real compiler and a big piece of work. The
delivered suites all reproduce, `triton5.html` is untouched, and an independent probe it never saw (GCC's own
torture tests) passes in large numbers. But the probe also found **three miscompiles of well-defined C11**, which
the spec forbids outright, and the spec's own conformance and differential tests were too narrow to catch them.
The in-page compiler also doesn't run from disk. Details and the 3.1 list are below. Nothing here is a ranking.

Spec: `SPEC-TRITON-5-STAGE3.md` (committed before sending) and `SPEC-TRITON-5-STAGE3-ADDENDUM-1.md` (4622d9f).
Delivery: `delivery-3/` (201c6d6, as delivered; `ARRIVED-3.md`). The page sent separately is `triton5-cc.html`
minus its final newline.

## 1. What holds
- **`triton5.html` is byte-identical to the accepted stage 2** (sha256 `fc37638c…b7d16c`), as the report says.
- **Reruns** (scratch copy of this repo with the delivery overlaid; `probes-3/rerun-t5c-run-all.log`): suites
  1–8 pass and reproduce the delivered figures, including 10,000/10,000 differential programs and 6/6 positive
  controls (mutants are applied in memory to the real modules, with no test hooks in production code ✓). Suite 9
  needs `/usr/bin/chromium` and a CDP client this workspace doesn't have; my own browser check is §3.
- **The independent probe** (§2): of the 1,678 GCC torture tests that pass with host GCC, tcc5 compiles and
  passes **1,188**. Of the ones it compiles and runs to a result, 95% pass (1,188 of 1,251).
- **ABI-5** is careful about pointers on a balanced machine: a C pointer is the machine address + 1,093, so NULL
  lands in the unmapped virtual page 0 and signed comparison keeps address order across zero. That's a clean
  answer to a question nobody had answered before.

## 2. The independent probe: GCC's C torture tests
GCC's `gcc.c-torture/execute` suite (gcc-mirror/gcc at 136b0074, 1,701 programs; GPL test inputs, used here as
an auditor's probe only and **not committed**). Each program aborts on a wrong result.
- tcc5 side (`probes-3/one.sh`): the program, plus a small auditor's library (`probes-3/libmini.c`: abort, exit,
  malloc, the string functions, a tiny printf, and plain-function stand-ins for `__builtin_abort`/`memcpy`/…),
  compiled by tcc5 and run on `triton5.html`'s WASM core. `main` is renamed so the library can print its return.
- Host side (`probes-3/host.sh`): `gcc -m32 -std=gnu11 -O0 -fsigned-char`, to match ABI-5's ILP32 and signed char.
- Controls: a deliberately failing program reports ABORT; a trivial one reports PASS.

| on the 1,678 tests host GCC passes | count |
| --- | ---: |
| tcc5 passes | 1,188 |
| doesn't compile or link | 375 (266 parse/codegen errors: K&R definitions, GNU features not in the spec's list, …; 78 link errors for builtins and library calls tcc5 leaves undefined; 31 headers tcc5 lacks) |
| runs and gives a **wrong result** | 63 (triaged below) |
| no result within 50M steps | 52 (inconclusive: I reran 5 to 1,000M steps. 2 finished correctly, 2 hang inside my library's builtin stand-ins, and 1, pr43220, a million-iteration VLA loop, was still running) |

**Triage of the 63 wrong results.** Many are not tcc5 bugs: GNU vector types, 64-bit bit-fields, `__FUNCTION__`
(my harness renames `main`), unspecified evaluation order (pr58943 is legitimately either answer), builtin-folding
tests. I reduced the plain-C11 ones to minimal programs and compared with host GCC (`probes-3/*.c`):

| program | what C11 says | host GCC | tcc5 |
| --- | --- | --- | --- |
| `brace.c`: `struct { char f1; int f2[2]; } o = {'X', 8, 9};` | brace elision fills `f2[1] = 9` (6.7.9p20) | `88 8 9` | **`88 8 0`** |
| `bitf.c`: `unsigned u:7` = 61, `-13 % bit.u` | a narrower-than-int unsigned bit-field promotes to `int` (6.3.1.1p2), so `-13` | `-13` | **`44`** |
| `bfsign.c`: `unsigned a:3` = 7, `a > -1` | same promotion: true | `1 1` | **`0 0`** |
| `unnamedbf.c`: `{int a:4; int :4; int b:4; int c:4} = {2,3,4}` | unnamed bit-fields take no initializer (6.7.9p9) | `2 3 4` | **`2 4 0`** |

**These are miscompiles of well-defined C**, which the spec forbids. The bit-field promotion one matters most
for a BSD kernel: NetBSD is full of narrow unsigned bit-fields in device and protocol structs.

Checked and correct: 64-bit `switch` with large constants, `char *` and `char[]` members initialised from
strings, recursion over struct pointers, structs of odd sizes through varargs (`sw64.c`, `strinit.c`, `walk.c`,
`vastruct.c`).

**A diagnostic gap:** unknown attributes are silently ignored, including ones that change a type.
`typedef int v4 __attribute__((vector_size(16)))` gives `sizeof == 4` with no warning (`vec.c`), so GNU vector
code compiles to wrong code instead of failing. An unsupported attribute that changes layout or type must be an
error.

## 3. Real browser
`probes-3/browser.py` (Playwright Chromium):
- **Served over http:** `triton5-cc.html` loads with 0 errors, compiles the sample and runs it: "fib(20)=6765
  pi*1000=3141", `JS ≡ WASM LOCKSTEP OK`. ✓
- **Opened from disk (file://), the Xinu case: Run fails.** "Blocked a frame with origin "null" from accessing a
  cross-origin frame." The page loads `triton5.html` into an iframe and reaches into it, which browsers forbid
  between two local files. The page also isn't one file: it needs `triton5.html` beside it. Delivered test 9 set
  both documents' contents through CDP, which sidesteps exactly this. The spec asked for one file that works
  offline.

## 4. Against the spec and addendum
- **Test 1, conformance:** the spec asked for "a test program for every C11 clause you implement". The delivery
  has 6 multi-clause programs. That's why brace elision, unnamed bit-fields and bit-field promotion slipped by.
- **Test 2, differential:** the generator is a fixed template. Every program is `uint32_t` arithmetic on four
  variables, plus one struct pass and one 64-bit value, in 6 statements drawn from 8 kinds. That isn't "in the
  spirit of Csmith": no pointers, no `char`/`short` promotions, no bit-fields, no nested control flow, no calls
  beyond helpers. 10,000 programs, but a narrow slice of C.
- **Addendum 1 isn't reflected** (host GCC runs `-O1 -std=c11` on x86-64 with no `-m32`, no UBSan filter and no
  coverage report, no float flags, no worked memcpy example in ABI-5). I don't know whether it reached Neon before
  the build finished; Kham will. Either way it carries into 3.1.
- **ABI-5 disagrees with the code:** it says the first 4 argument slots go in `R0..R3`; the code passes 3
  (`R0..R2`; `args.c` shows the fourth on the C stack). The report's summary says R0..R2. Make the document match.
- **Not asked, but worth measuring:** every `int` store is written as four byte stores with shifts and masks
  (about 12 instructions; `args.c`). That's ABI-5's byte-per-tryte model doing what it says. It's correct, but it
  probably explains much of the ~60× gap to native. 3.1 should report it and say what it would take to store a
  whole word at once without breaking `memcpy` semantics.

## 5. For round 3.1
1. Fix the three miscompiles, and add each as a regression test: brace elision, unnamed bit-fields in
   initialisers, and integer promotion of bit-fields (signed and unsigned, every width).
2. Make unknown or unsupported attributes that change a type or layout a hard error, and warn on the rest.
3. Conformance: a test per C11 clause, as the spec asked, with expected output written from the standard.
4. Differential: a real random generator (pointers, arrays, structs and unions, bit-fields, `char`/`short`
   promotions, nested control flow, calls), with addendum 1 applied: `-m32 -fsigned-char`, UBSan as a checked
   filter, and coverage reported.
5. The page works from disk as one file: inline the machine instead of reaching into an iframe.
6. ABI-5 matches the code (argument registers), and gains addendum 1's memcpy worked example.
7. Builtins NetBSD calls by name: give `__builtin_memcpy`, `memset`, `memcmp`, `strlen`, `strcmp`, `abort`,
   `trap`, `alloca`, `ffs` and the `*_overflow` family real meanings (inline or runtime), not undefined symbols.
8. Optional: K&R function definitions. NetBSD's tree still has some.

— Kehai
