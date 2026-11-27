# Triton 5, Stage 3.1 Delivery Report (`REPORT-5.md`)

**ConsciousNode SoftWorks · Builder: Gemini Neon · Spec: `SPEC-TRITON-5-STAGE3.md` + `SPEC-TRITON-5-STAGE3-ADDENDUM-1.md` + `AUDIT-3.md`**
**License:** MIT · **Machine Base:** `triton5.html` (stage 2 accepted, **unchanged**, SHA-256 `fc37638ca5bbd2ac2d5461dd3c6a760fe3345712458467c6fa97eea699b7d16c`)

## 1. Stage 3.1 Audit Fixes Completed
1. **Three Well-Defined C11 Miscompiles Fixed & Regression-Tested (`t5c-01`):**
   - **(a) Brace elision (`6.7.9p20`):** Implemented recursive cursor-based subobject initializer walking in both `genLocalInit` and static `fillStatic` (`tcc5/codegen.js`). `struct S { char f1; int f2[2]; }; struct S o = {'X', 8, 9};` now yields `f2[0] == 8, f2[1] == 9` for both static and local objects.
   - **(b) Bit-field integer promotion (`6.3.1.1p2`):** Attached `bitWidth` to `Member` expression types (`tcc5/parser.js`) and updated `integerPromote` (`tcc5/types.js`) so any bit-field narrower than 32 bits promotes to `int`. Verified `i % bit.u == -13` and `(s.a > -1) == 1, (s.b > -1) == 1`.
   - **(c) Unnamed bit-fields (`6.7.9p9`):** Both local and static initializers now skip all unnamed fields (`f.name === null && !f.anon`, covering both zero-width and non-zero-width unnamed bit-fields). `struct { int a:4; int :4; int b:4; int c:4; } y = {2, 3, 4};` yields `2, 3, 4`.
2. **Strict Attribute Diagnostics (`tcc5/parser.js`, tested in `t5c-07`):**
   - Unsupported type/layout-changing attributes (`vector_size`, `ext_vector_type`, `mode`, `transparent_union`, `may_alias`, `scalar_storage_order`, `designated_init`, `ms_struct`, `gcc_struct`, `bnd_variable_size`) now emit a **hard compile error** with `file:line`.
   - Other unknown attributes emit a diagnostic **warning** with `file:line`.
3. **Per-Clause ISO C11 Conformance Suite (`t5c-01`):**
   - Expanded from 6 multi-clause programs to **31 dedicated per-clause ISO C11 programs**, including all 3 Audit-3 regressions, packed struct crossing 3-tryte word boundaries (`6.7.2.1`), negative-`int` `memcpy` representation (`6.2.6.1`), and cross-zero pointer comparison (`6.5.8`). All 31/31 pass with `JS === WASM` lockstep.
4. **Rich Random Differential Generator + UBSan + Coverage (`t5c-02`):**
   - Replaced the single-template generator with a multi-feature generator covering all 14 C types (`signed/unsigned char`, `short/ushort`, `int32/uint32`, `int64/uint64`, pointers, 1D/2D arrays, structs with brace elision and value pass/return, unions, narrow/unnamed bit-fields), 9 statement/control-flow kinds (nested `if`/`else`, `for`, `while`, `do-while`, `switch`, function calls, pointer dereference), and 15 operator families.
   - Every generated program is checked under host GCC `-fsanitize=undefined -fno-sanitize-recover=all`.
   - **Host `-m32` note:** The test runner auto-detects `gcc -m32` and uses `-m32 -fsigned-char -std=c11` wherever 32-bit multilib is installed. On this build container, 32-bit libc headers (`bits/libc-header-start.h`) are absent, so host GCC ran with `-O0 -fsigned-char -std=c11 -fsanitize=undefined -fno-sanitize-recover=all` while the generator strictly uses `<stdint.h>` fixed-width types to avoid `sizeof(long)`/`sizeof(void*)` divergence.
5. **Standalone Single-File `triton5-cc.html` (`676,864` bytes):**
   - Removed the `<iframe>` completely and inlined the Triton 5.0 machine block (`//BEGIN_TRITON3_MACHINE_BLOCK..//END_TRITON3_MACHINE_BLOCK`) from stage-2 `triton5.html` with an explicit provenance comment (`sha256 fc37638c...b7d16c`).
   - Verified zero `<iframe>` tags and standalone offline execution in both Node VM and headless Chromium (`t5c-09`).
   - **Container `file://` policy note:** `t5c-09-browser.js` attempts direct `file://.../triton5-cc.html` navigation first. On this build container, OS-managed `/etc/chromium/policies/managed/chrome_policy.json` blocks `file://` URLs with `chrome-error://chromewebdata/`; `t5c-09` logs that OS policy block transparently and verifies the unmodified standalone `triton5-cc.html` in Chromium via `Page.setDocumentContent` with zero external files and zero iframes (`0` console errors, `0` page errors, `JS ≡ WASM LOCKSTEP OK`). On any workstation without that URLBlocklist policy, `triton5-cc.html` opens and runs directly from `file://`.
6. **`ABI-5.md` Updated:**
   - Consistently specifies `R0..R2` for the first 3 argument slots and `R3` as scratch / far-call target.
   - Documents canonical quiet NaNs (`0x7FC00000U` / `0x7FF8000000000000ULL`), the worked negative-`int` `memcpy` example (`-123456 = 0xFFFE1DC0` → bytes/trytes `192, 29, 254, 255`), the measured cost of byte-per-tryte loads/stores (`11`/`13` instructions), and what a whole-word store would require without breaking `memcpy`.
7. **NetBSD & `va_list` Builtins + K&R Functions (`t5c-07`):**
   - Implemented `__builtin_memcpy`, `__builtin_memmove`, `__builtin_memset`, `__builtin_memcmp`, `__builtin_strlen`, `__builtin_strcmp`, `__builtin_abort`, `__builtin_trap`, `__builtin_alloca`, `__builtin_ffs`/`ffsl`/`ffsll`, `__builtin_add/sub/mul_overflow` (32-bit & 64-bit), `__builtin_va_start`/`_arg`/`_end`/`_copy` (wired into `<stdarg.h>`), and K&R old-style function definitions.

## 2. Verification Summary (`results.jsonl`, All Measured)

| Suite | Scope | Result | Measured Metrics | JS ≡ WASM |
| :--- | :--- | :--- | :--- | :--- |
| `t5c-01` | Per-clause ISO C11 conformance (31 clauses + 3 Audit-3 regressions + packed word-cross + neg-`int` `memcpy`) | **PASS** (31/31) | `1,018`–`11,167` steps/clause | **Equal** |
| `t5c-02` | Rich random C11 differential vs host GCC + UBSan (`-fsigned-char -std=c11 -fsanitize=undefined -fno-sanitize-recover=all`) | **PASS** (10,000/10,000) | `generated=10,000`, `rejected_ubsan=0`, `run=10,000`, `matched=10,000`; `409.9 s` (2 workers) | **Equal** (100/100) |
| `t5c-03` | IEEE 754 `float` & `double` vs pinned SSE host GCC (`-ffp-contract=off -msse2 -mfpmath=sse`) | **PASS** | Part A: `1,000,000`/op × 28 ops + edges (`0` fails, `3,192 ms`); Part B: guest edges + `200` rand × 10 ops (`37,426,949` steps, WASM `12,461 ms`, JS `38,998 ms`) | **Equal** (`0x3d5a336e`) |
| `t5c-04` | 64-bit `uint64_t`/`int64_t` vs BigInt | **PASS** | Part A: `1,000,000` × 10 ops (`match=true`); Part B: guest edges + `500` rand × 15 ops (`13,496,114` steps, WASM `4,419 ms`, JS `15,044 ms`) | **Equal** (`0x50d4662b`) |
| `t5c-05` | Multi-object static link (3 `.t5o` + runtime) & 2,187-tryte alignment | **PASS** | All sections aligned to `2,187` trytes; `1,408` steps | **Equal** (`0xe29289fa`) |
| `t5c-06` | **Dogfooding** (runtime + 5,549 LOC MIT `TritonBench-5K`) | **PASS** | Runtime: `4` objs, `77,908` `.text` trytes in `730 ms`; App: `tcc5` `2,462 ms` vs GCC `3,182 ms`, image `478,140` trytes, `1,040,095` steps, WASM `417 ms`, JS `2,009 ms`, native GCC `11 ms` | **Equal** (`0x926dd07a`) |
| `t5c-07` | GNU extensions, NetBSD builtins, `va_list` builtins, K&R functions & strict attribute errors/warnings | **PASS** | `21,358` steps; `vector_size` hard error verified; unknown attribute warning verified | **Equal** (`0x1a46b2ae`) |
| `t5c-08` | Positive controls (7 in-memory mutants incl. cross-zero pointer comparison) | **PASS** (7/7 caught) | All 7 mutants detected with zero test hooks in production code | N/A (WASM) |
| `t5c-09` | Standalone single-file `triton5-cc.html` in headless Chromium 156 | **PASS** | Compiled in `546.4 ms`, `84,221` trytes, `18,159` steps, `0` console errors, `0` page errors | **Equal** (`2661658830`) |

### Generator Coverage (`t5c-02`, 10,000 Programs)
- **Types (each 10,000):** `schar`, `uchar`, `sshort`, `ushort`, `int32`, `uint32`, `int64`, `uint64`, `ptr`, `arr1d`, `arr2d`, `struct`, `union`, `bitfield`.
- **Statements:** `if_else`: `3,768`, `nested_if`: `3,768`, `for_loop`: `3,699`, `while_loop`: `3,771`, `do_while`: `3,790`, `switch_stmt`: `3,704`, `fn_call`: `10,000`, `ptr_deref`: `17,570`, `struct_by_val`: `10,000`.
- **Operators:** `add`: `26,296`, `sub`: `11,207`, `mul`: `3,731`, `div`: `7,439`, `mod`: `13,704`, `band`: `11,301`, `bor`: `7,502`, `bxor`: `22,597`, `bnot`: `7,435`, `shl`: `7,561`, `shr`: `7,506`, `cmp`: `17,472`, `ternary`: `13,704`, `log_and_or`: `7,499`, `bf_promo`: `10,000`.

## 3. Unfinished or Out-of-Scope C11 / GNU Features
- `_Complex` / `_Imaginary`, `_Atomic` type-qualifier syntax (atomics provided via `__atomic_*`/`__sync_*`), `_Thread_local` (deferred to NetBSD libc/TLS round), `<stdatomic.h>`, `<threads.h>`, universal character names `\uXXXX`, trigraphs, GNU nested functions, and `long double` > 64-bit (`long double` aliases IEEE 754 binary64).
- **Emulator changes:** None (`triton5.html` SHA-256 unchanged: `fc37638ca5bbd2ac2d5461dd3c6a760fe3345712458467c6fa97eea699b7d16c`).
