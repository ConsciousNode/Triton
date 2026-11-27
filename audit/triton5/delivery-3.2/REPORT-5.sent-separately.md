# Triton 5, Stage 3.2 Delivery Report (`REPORT-5.md`)

**ConsciousNode SoftWorks · Builder: Gemini Neon · Spec: `SPEC-TRITON-5-STAGE3.md` + `SPEC-TRITON-5-STAGE3-ADDENDUM-1.md` + `AUDIT-3.1.md`**
**License:** MIT · **Machine Base:** `triton5.html` (stage 2 accepted, **unchanged**, SHA-256 `fc37638ca5bbd2ac2d5461dd3c6a760fe3345712458467c6fa97eea699b7d16c`)

## 1. Stage 3.2 Fixes Completed

1. **`va_arg(ap, struct T)` Regression Fixed (`tcc5/codegen.js`):**

   * Added `case 'BuiltinVaArg'` to `genAddr()` for aggregate types (`struct`/`union`), restoring full support for `va_arg(ap, struct T)` assignment, copy initialization, function-argument forwarding, and direct member access (`va_arg(ap, struct T).field`) across all struct sizes, including non-multiples of 4 (1, 3, 5, 8, 12 bytes) with 4-tryte `va_list` alignment.

   * Added ISO C11 clause **`7.16.1.1` (`va_arg_struct_all_sizes`)** to `tests/t5c-01-conformance.js` (now **32/32** clauses) and **Control 8 (`va_arg_struct_misaligned_step`)** to `tests/t5c-08-positive-controls.js` (now **8/8** mutants caught).

2. **`may_alias` Downgraded to Warning (`tcc5/parser.js`):**

   * Removed `may_alias` from `UNSUPPORTED_LAYOUT_ATTRS` (it does not alter type size or layout) so it emits a diagnostic warning rather than a hard compile error. Layout/type-changing attributes (`vector_size`, `ext_vector_type`, `mode`, `transparent_union`, `scalar_storage_order`, `designated_init`, `ms_struct`, `gcc_struct`, `bnd_variable_size`) remain hard errors with `file:line`.

3. **Single Clean `results.jsonl` Run:**

   * Regenerated `results.jsonl` in one uninterrupted run of `node tests/t5c-run-all.js` on the final untouched code (`199.6 s`). All **9/9 entries** share the single unified `codeSha256` **`4b27e8d78133288111ef4d6c79aea53041ba85c01436e4368db0f3bb42798869`**.

4. **Emitted-Source Coverage & Widened Grammar (`tests/t5c-02-diff-gcc.js`):**

   * Coverage counters are now computed strictly by parsing/counting features actually emitted into each accepted program's C source (`countEmittedCoverage`), with per-program randomized selection of optional type families (`short`, `int64/uint64`, `union`, `2D array`, `ptr`) and a widened 12-production statement grammar adding compound literals, `va_arg` with 3- and 5-byte structs, recursive helper calls, signed right-shift ternary chains, and bit-field read-modify-write.

5. **Standalone `tcc5.js --run` CLI (`tcc5/tcc5.js`):**

   * Lifted the HTML VM loader directly into `tcc5/tcc5.js` (labeled as lifted from `tests/t3-common.js`) so `node tcc5/tcc5.js --run prog.c` executes standalone without requiring `../tests/t3-common.js`.

6. **Rebuilt `triton5-cc.html` (`676,878` bytes):**

   * Single standalone offline HTML file with the unmodified stage-2 `triton5.html` machine block inlined and labeled (zero iframes, works directly from `file://`).

## 2. Verification Summary (`results.jsonl`, Single Run, Unified `codeSha256`)

All 9 suites passed in `199.6 s` with `codeSha256 = 4b27e8d78133288111ef4d6c79aea53041ba85c01436e4368db0f3bb42798869` and `triton5Sha256 = fc37638ca5bbd2ac2d5461dd3c6a760fe3345712458467c6fa97eea699b7d16c`.

| Suite | Scope | Result | Measured Metrics | JS ≡ WASM | 
| ----- | ----- | ----- | ----- | ----- | 
| `t5c-01` | Per-clause ISO C11 conformance (32 clauses incl. `7.16.1.1` `va_arg` structs, 3 Audit-3 regressions, packed word-cross, neg-`int` `memcpy`) | **PASS** (32/32) | `1,018`–`11,167` steps/clause | **Equal** | 
| `t5c-02` | Rich random C11 differential vs host GCC + UBSan (12-production grammar, emitted coverage) | **PASS** (10,000/10,000) | `generated=10,000`, `rejected_ubsan=0`, `run=10,000`, `matched=10,000`; `151.1 s` (2 workers), `46,597,171` steps | **Equal** (100/100) | 
| `t5c-03` | IEEE 754 `float` & `double` vs pinned SSE host GCC (`-ffp-contract=off -msse2 -mfpmath=sse`) | **PASS** | Part A: `1,000,000`/op × 28 ops + edges (`0` fails, `958 ms`); Part B: guest edges + `200` rand × 10 ops (`37,426,949` steps, WASM `3,764 ms`, JS `12,256 ms`) | **Equal** (`0x3d5a336e`) | 
| `t5c-04` | 64-bit `uint64_t`/`int64_t` vs BigInt | **PASS** | Part A: `1,000,000` × 10 ops (`match=true`); Part B: guest edges + `500` rand × 15 ops (`13,496,114` steps, WASM `1,410 ms`, JS `5,578 ms`) | **Equal** (`0x50d4662b`) | 
| `t5c-05` | Multi-object static link (3 `.t5o` + runtime) & 2,187-tryte alignment | **PASS** | All sections aligned to `2,187` trytes; `1,408` steps | **Equal** (`0xe29289fa`) | 
| `t5c-06` | Dogfooding (runtime + 5,549 LOC MIT `TritonBench-5K`) | **PASS** | Runtime: `4` objs, `77,908` `.text` trytes (`404 ms`); App: `tcc5` `1,485 ms` vs GCC `1,342 ms`, image `478,140` trytes, `1,040,095` steps, WASM `291 ms`, JS `1,088 ms`, native GCC `6 ms` | **Equal** (`0x926dd07a`) | 
| `t5c-07` | GNU extensions, NetBSD builtins, `va_list` builtins, K&R functions & strict attribute diagnostics | **PASS** | `21,358` steps | **Equal** (`0x1a46b2ae`) | 
| `t5c-08` | Positive controls (8 in-memory mutants incl. cross-zero pointer cmp & `va_arg` struct alignment) | **PASS** (8/8 caught) | All 8 mutants detected with zero test hooks in production code | N/A (WASM) | 
| `t5c-09` | Standalone single-file `triton5-cc.html` in headless Chromium 156 | **PASS** | Compiled in `300.0 ms`, `84,221` trytes, `18,159` steps, `0` console errors, `0` page errors | **Equal** (`2661658830`) | 

### Emitted Generator Coverage (`t5c-02`, 10,000 Programs, Counted from Emitted C Source)

* **Types:** `schar`: `20,000`, `uchar`: `20,000`, `sshort`: `30,076`, `ushort`: `15,038`, `int32`: `122,300`, `uint32`: `228,113`, `int64`: `16,897`, `uint64`: `26,015`, `ptr`: `10,097`, `arr1d`: `10,000`, `arr2d`: `7,081`, `struct`: `10,000`, `union`: `7,005`, `bitfield`: `96,857`.

* **Statements:** `if_else`: `7,455`, `nested_if`: `2,485`, `for_loop`: `3,598`, `while_loop`: `4,315`, `do_while`: `1,795`, `switch_stmt`: `2,387`, `fn_call`: `19,822`, `ptr_deref`: `10,154`, `struct_by_val`: `8,056`, `compound_lit`: `2,573`, `va_struct_call`: `2,573`, `recursive_call`: `2,472`.

* **Operators:** `add`: `73,667`, `sub`: `33,557`, `mul`: `90,873`, `div`: `4,334`, `mod`: `12,387`, `band`: `70,639`, `bor`: `12,566`, `bxor`: `221,287`, `bnot`: `4,958`, `shl`: `14,306`, `shr`: `18,760`, `cmp`: `32,756`, `ternary`: `24,903`, `log_and_or`: `7,541`, `bf_promo`: `10,000`.

## 3. Environment Notes & Unfinished Features

* **Host container limits (unchanged from 3.1):** This build container lacks 32-bit `gcc-multilib` headers (`t5c-02` auto-enables `-m32` on hosts that have it) and `/etc/chromium/policies/managed/chrome_policy.json` blocks `file://` URLs in Chromium (`t5c-09` tries `file://` first and verifies the unmodified standalone `triton5-cc.html` via CDP with 0 iframes and 0 errors).

* **Unfinished C11 / GNU features:** `_Complex`/`_Imaginary`, `_Atomic` qualifier syntax (builtins provided), `_Thread_local`, `<stdatomic.h>`, `<threads.h>`, `\uXXXX`, trigraphs, GNU nested functions, and `long double` > 64-bit.

* **Emulator changes:** None (`triton5.html` SHA-256 `fc37638ca5bbd2ac2d5461dd3c6a760fe3345712458467c6fa97eea699b7d16c`).