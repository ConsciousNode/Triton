# Triton 5, Stage 3 Delivery Report (`REPORT-5.md`)

**ConsciousNode SoftWorks · Builder: Gemini Neon · Spec: `SPEC-TRITON-5-STAGE3.md`**
**License:** MIT · **Machine Base:** `triton5.html` (stage 2 accepted, **unchanged**, SHA-256 `fc37638ca5bbd2ac2d5461dd3c6a760fe3345712458467c6fa97eea699b7d16c`)

## 1. What Was Built
1. **`tcc5` (Triton C Compiler for Architecture 5):**
   - From-scratch, zero-dependency, MIT-licensed ISO C11 + GNU extensions compiler written in JavaScript (`tcc5/{isa,headers,preproc,types,parser,codegen,asm,linker,tcc5,build-html}.js`).
   - Runs as a Node CLI (`node tcc5/tcc5.js [-E|-S|-c] [-O0|-O1] [-I dir] [-D K=V] [-o out] [--run] files...`) and as a single self-contained offline HTML page (`triton5-cc.html`, `254,053` bytes, every inlined module labeled with a `/* === INLINED FROM ... === */` provenance comment).
2. **Relocatable Assembler (`t5as`, `tcc5/asm.js`) & Static Linker (`t5ld`, `tcc5/linker.js`):**
   - Emits `.t5o` relocatable objects with sections (`.text`, `.rodata`, `.init_array`, `.data`, `.bss`, custom `.section`), `GLOBAL`/`WEAK`/`LOCAL` symbols, and 8 relocation types (`R_T5_REL9`, `R_T5_ABS27_LO/MID/HI`, `R_T5_CADDR27_LO/MID/HI`, `R_T5_CADDR32`).
   - Statically links multiple `.t5o` objects into a `.t5x` executable with every output segment aligned to **balanced-3⁷ = 2,187 trytes** (`DECISION-PAGE-SIZE.md`) and a boot trampoline at machine address `0` so `triton5.html` loads and executes it unmodified.
3. **Freestanding Runtime (`runtime/`):**
   - `runtime/crt0.s` (hardware `SP` relocation to `4,000,000` via `SPR_ESP`/`SPR_EPC`/`IRET`, `R8` C stack init, `BFILL` `.bss` zeroing, `.init_array` constructor dispatch, `main()` call, `HALT`).
   - `runtime/rt_mem.c` (`memcpy`, `memmove`, `memset` via `BCOPY`/`BFILL`, `memcmp`, bit-builtin helpers, and `__sync`/`__atomic` helpers backed by Triton 5 stage-1 `CAS` `+71`).
   - `runtime/rt_int64.c` (64-bit shifts, signed/unsigned division & modulo).
   - `runtime/rt_softfp.c` (bit-exact IEEE 754 binary32 `float` and binary64 `double` arithmetic, comparisons, and conversions with round-to-nearest-even).
   - Entire runtime is compiled by `tcc5` itself.
4. **ABI & Binary Format Specification (`ABI-5.md`):**
   - Documents the ILP32 little-endian 1-byte-per-tryte (`CHAR_BIT = 8`) data model, stage-1 binary-semantics lowering, `R0..R2` arg / `R3` scratch / `R4..R6` callee-saved / `R7` FP / `R8` CSP / hardware `SP` shadow-stack calling convention, C-space biased pointers (`P = A + 1093`) across negative and positive balanced-ternary addresses, and `.t5o`/`.t5x` formats.

## 2. Verification Summary (`results.jsonl`, All Measured)
All 9 suites were executed via `node tests/t5c-run-all.js` (total wall time: `207.6 s`, compiler bundle SHA-256 `72e223356673da6b8c08cffda4102ed2a0732b979d75fc0d9a88ae42f6248c39`).

| Suite | Scope | Result | Measured Metrics | JS ≡ WASM |
| :--- | :--- | :--- | :--- | :--- |
| `t5c-01` | ISO C11 freestanding conformance (6 multi-clause programs) | **PASS** (6/6) | `2,016`–`8,624` steps/program | **Equal** |
| `t5c-02` | Differential vs host GCC (10,000 seeded well-defined programs, 100 batches × 100) | **PASS** (10,000/10,000) | `tcc5` compile `61,796 ms`, GCC `43,660 ms`, WASM `7,254 ms`, JS `19,849 ms`, `55,358,203` steps | **Equal** (100/100) |
| `t5c-03` | IEEE 754 `float` & `double` (all 28 ops/conversions, edges + random) | **PASS** | Part A: `1,000,000` random/op × 28 ops + edges on `rt_softfp.c` vs host IEEE 754 (`0` fails, `966 ms`); Part B: `tcc5`-compiled guest edges + `200` random × 10 ops (`37,426,949` steps, WASM `3,970 ms`, JS `12,309 ms`) | **Equal** (`0x8f445192`) |
| `t5c-04` | 64-bit `uint64_t`/`int64_t` vs BigInt (edges + random) | **PASS** | Part A: `1,000,000` random × 10 ops on `rt_int64.c` vs BigInt (`match=true`); Part B: `tcc5`-compiled guest edges + `500` random × 15 ops (`13,496,114` steps, WASM `1,438 ms`, JS `4,518 ms`) | **Equal** (`0x44504518`) |
| `t5c-05` | Multi-object static link (3 `.t5o` + runtime) & 2,187-tryte section alignment | **PASS** | All sections aligned to `2,187` trytes; `1,408` steps | **Equal** (`0x14a33ca0`) |
| `t5c-06` | Self-host runtime + `TritonBench-5K` (`5,549` LOC MIT C11 app) | **PASS** | Runtime: `4` objs, `68,966` `.text` trytes in `194 ms`; App: `tcc5` `863 ms` vs GCC `900 ms`, image `467,205` trytes, `1,040,095` steps, WASM `181 ms` (`5.75 MIPS`), JS `585 ms` (`1.78 MIPS`), native GCC `3 ms` (`~60x` WASM / `~195x` JS) | **Equal** (`0xf5010714`) |
| `t5c-07` | GNU extensions (all required attributes, `__asm__`, builtins, atomics) | **PASS** | `17,354` steps | **Equal** (`0x1d2d417b`) |
| `t5c-08` | Positive controls (6 in-memory compiler/linker/runtime mutants) | **PASS** (6/6 caught) | All 6 mutants detected with zero test hooks in production code | N/A (WASM) |
| `t5c-09` | Real browser (`triton5-cc.html` + `triton5.html` in headless Chromium 156 via CDP) | **PASS** | Compiled in `127.8 ms`, `75,473` trytes, `18,159` steps, `0` console errors, `0` page errors | **Equal** (`1622478128`) |

### Notes on Tests 3, 4, and 9 Methodology
- **Tests 3 & 4 (`1,000,000` random cases):** Running `1,000,000` random cases per operation across 28 software-FP ops (`~28,000,000` calls × `~1,000` instructions = `~28 billion` Triton instructions) directly inside the JS emulator (`~1.8 MIPS`) would take `> 4 hours`. Accordingly, `t5c-03` and `t5c-04` verify the full `1,000,000`-per-op random sweeps directly on `runtime/rt_softfp.c` and `runtime/rt_int64.c` against host IEEE 754 / BigInt (Part A), AND compile/execute the complete edge-case plus seeded-random verification programs with `tcc5` on both `TritonJS` and `TritonWASM` in lockstep (Part B).
- **Test 9 (Real Browser):** Executed in headless `/usr/bin/chromium` (`156.0.8078.73`) via a zero-dependency Chrome DevTools Protocol client (`tests/t5c-09-browser.js`). Because the container's Chromium enterprise policy blocks `http://` and `file://` URL navigation, the test loads `triton5-cc.html` verbatim into the main frame and `triton5.html` verbatim into the `#triton5-host` child frame via CDP `Page.setDocumentContent`, then clicks `#btn-run` in the live DOM and checks console/page errors (`0`) and output (`JS ≡ WASM LOCKSTEP OK`).

## 3. GNU Extensions Implemented & Tested (`tests/t5c-07-gnu-ext.js`)
- `__attribute__`: `aligned`, `packed`, `section`, `noreturn`, `unused`, `used`, `weak`, `always_inline`, `noinline`, `const`, `pure`, `format`, `constructor` (dispatched from `.init_array` in `crt0.s`).
- `__asm__` / `asm` (`volatile`, outputs `"=r"`/`"+r"`, inputs `"r"`/`"i"`, clobbers, `%0`/`%1`/`%[name]` substitution).
- `__builtin_expect`, `__builtin_unreachable`, `__builtin_constant_p`, `__builtin_offsetof`.
- `__builtin_clz`, `__builtin_clzl`, `__builtin_clzll`, `__builtin_ctz`, `__builtin_ctzl`, `__builtin_ctzll`, `__builtin_popcount`, `__builtin_popcountl`, `__builtin_popcountll`, `__builtin_bswap16`, `__builtin_bswap32`, `__builtin_bswap64`.
- `__typeof__` / `typeof`, statement expressions `({ ... })`, `__label__` and computed goto (`&&label`, `goto *expr;`), zero-length arrays (`int data[0];`).
- `__sync_*` (`__sync_val_compare_and_swap`, `__sync_bool_compare_and_swap`, `__sync_fetch_and_add`, `__sync_add_and_fetch`, `__sync_fetch_and_sub`, `__sync_sub_and_fetch`, `__sync_fetch_and_and/or/xor`, `__sync_lock_test_and_set`, `__sync_lock_release`, `__sync_synchronize`) and `__atomic_*` (`__atomic_load_n`, `__atomic_store_n`, `__atomic_exchange_n`, `__atomic_compare_exchange_n`, `__atomic_fetch_add/sub/and/or/xor`, `__atomic_thread_fence`) backed by Triton 5 stage-1 `CAS` (`+71`).

## 4. Unfinished or Out-of-Scope C11 / GNU Features
- **C11 optional/complex/threading features not implemented:** `_Complex` / `_Imaginary`, `_Atomic` type-qualifier syntax (atomic operations are provided via `__atomic_*` and `__sync_*` builtins), `_Thread_local` (hardware `SPR_TLS`/`RDTLS` exists in Triton 5; TLS relocation/segment support is deferred to the NetBSD libc/ld.elf_so round), `<stdatomic.h>`, `<threads.h>`, universal character names `\uXXXX`, and trigraphs.
- **Legacy / niche features not implemented:** K&R non-prototype parameter declaration lists (`int f(a, b) int a; int b; { ... }`), nested functions (GNU trampoline extension), and `long double` > 64-bit (`long double` aliases IEEE 754 binary64 `double`).
- **Emulator changes:** None. `triton5.html` is byte-identical to accepted stage-2 delivery (`fc37638ca5bbd2ac2d5461dd3c6a760fe3345712458467c6fa97eea699b7d16c`).
