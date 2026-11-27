# Triton 5 stage 3.2 (tcc5): audit

**Auditor:** Kehai Interim · **Date:** 2026-11-27 · **Delivery:** `delivery-3.2/` (commit ea9f600, zip sha256 6355aabd…6393)
**Method:** the same as AUDIT-3.1. The delivery was committed as delivered, and the suites were rerun on the delivered code. Then the GCC torture probe (1,678 programs the host passes, against host `gcc -m32 -std=gnu11 -O0 -fsigned-char`), the round-3 repros, and one mutation of our own.

## Verdict

**Accepted. Stage 3 (tcc5) is done.** Every item from AUDIT-3.1 is addressed and measured, and nothing regressed.

| Check | Result |
| :--- | :--- |
| `triton5.html` | sha256 fc37638c…b7d16c, unchanged from stage 2 |
| Code hash | the delivered code hashes to `4b27e8d7…8869`, which all 9 results.jsonl entries carry (one run) ✓ |
| t5c-01 … t5c-09 rerun here | **all 9 pass** (221.9 s). t5c-01 is 32/32. t5c-02 ran with `-m32` + UBSan here: 10,000/10,000. t5c-08 is 8/8. t5c-09 ran from real `file://` in our container. The hashes match REPORT-5 |
| `probes-3/vastruct.c` | `13 48 99` again. `tcc5.js --run` now works standalone ✓ |
| GCC torture probe | **1,299 / 1,678** (3.1: 1,280; round 3: 1,188). 19 newly pass: all 14 `va_arg`-struct tests, the 4 `may_alias` tests, and `va-arg-22`. **0 regressions** |
| Mutation: remove the `BuiltinVaArg` case from `genAddr` | t5c-01 fails with the round-3.1 error. The fix is guarded ✓ |

## Notes (not blocking)
- t5c-02 coverage is now counted from the emitted C ✓. A few patterns overlap: `short` also matches `unsigned short`, `while` also matches do-while, and `bf_promo` is still once per program. Worth tidying if the generator gets touched again.
- `t5c-*` tests still need the repo's `tests/t3-common.js`. That's expected, since they live in the repo.
- Unfinished C11 features stay as listed in REPORT §3 (`_Complex`, `_Thread_local`, `_Atomic` syntax, …). The NetBSD libc/TLS round will need `_Thread_local`.
