# Triton 5 stage 3.1 (tcc5): audit

**Auditor:** Kehai Interim · **Date:** 2026-11-27 · **Delivery:** `delivery-3.1/` (commit f33de8a, zip sha256 081ecec1…6c63)
**Method:** the same as AUDIT-3. The delivery was committed as delivered. The suites were rerun on the delivered code, and the GCC torture probe was rerun against host `gcc -m32 -std=gnu11 -O0 -fsigned-char`. Then the round-3 repros, a real Chromium check from both `file://` and `http://`, and one mutation test of our own.

## Verdict

**Close, but not accepted yet: one regression to fix in 3.2.** All three miscompiles from AUDIT-3 are fixed and guarded by tests. The page runs from disk, the suites reproduce on the delivered code, and the torture probe went from 1,188 to 1,280 passing. However, passing a struct through `va_arg` no longer compiles. Round 3 handled it correctly, so this is new breakage.

## What was checked

| Check | Result |
| :--- | :--- |
| `triton5.html` | sha256 fc37638c…b7d16c, the same as the accepted stage-2 machine |
| Machine block inlined in `triton5-cc.html` | byte-identical to the block in `triton5.html` (408,139 chars) |
| t5c-01 … t5c-08 rerun on the delivered code | all pass; every hash matches REPORT-5 (`0x3d5a336e`, `0x50d4662b`, `0xe29289fa`, `0x926dd07a`, `0x1a46b2ae`) |
| t5c-02 here | ran **with `-m32`** (our container has 32-bit multilib): 10,000/10,000 matched |
| t5c-09 here | not runnable: the script hard-codes `/usr/bin/chromium`, which our container lacks (see the next row) |
| Real Chromium (Playwright), `file://` and `http://` | `triton5-cc.html` compiles and runs from disk: `fib(20)=6765 pi*1000=3141`, JS≡WASM lockstep, 0 errors (`probes-3.1/browser-file.png`) |
| Round-3 repros | `brace.c` gives `88 8 9`, `bitf.c` gives `-13 -13 1`, `bfsign.c` gives `1 1`, `unnamedbf.c` gives `2 3 4`: all now correct |
| Mutation: undo the bit-field promotion fix | t5c-01 fails (30/31) and t5c-02 mismatches on seed 1. The fix is guarded twice |
| GCC torture probe (1,678 tests the host passes) | **1,280 pass** (round 3: 1,188). 122 newly pass, 30 regress (below) |

### The 30 torture regressions
- **16 are the requested strictness.** `mode` (7), `vector_size` (3), `may_alias` (4) and `scalar_storage_order` (3) are now hard errors instead of being silently ignored. That is what we asked for. One nit: `may_alias` doesn't change layout or type, so a warning would be enough for it.
- **14 are a real regression: `va_arg` of a struct type doesn't compile.** The error is `Cannot take address of AST node 'BuiltinVaArg'`. Affected tests: `931004-2/4/6/8/10/12/14`, `stdarg-3`, `strct-varg-1`, `strct-stdarg-1`, `pr44575`, `pr92904`, `920625-1`, `920908-1`. Round 3's `probes-3/vastruct.c` printed `13 48 99`; 3.1 rejects it. This most likely came from wiring `<stdarg.h>` to the new `__builtin_va_arg`, since an aggregate result has no address to copy from.

## Other findings (no fix needed for acceptance unless noted)
1. **results.jsonl doesn't all describe the delivered code.** 13 of its 16 entries carry `codeSha256 980a50…`. The delivered code hashes to `a19c85…`, which appears only on the last three entries (t5c-07 rerun, 08, 09), because the code changed after a failing t5c-07. Our reruns show the delivered code reproduces every figure, so nothing was misreported. For 3.2: **regenerate results.jsonl in one run on the final code.**
2. **The differential generator is still template-based.** Each program is one fixed skeleton plus 3 statements picked from 8 hand-written snippets. The coverage counters are incremented unconditionally, so "each type 10,000" restates the template rather than measuring anything. `rejected_ubsan = 0` is guaranteed because every risky operation goes through `safe_*` helpers. The generator does catch real bugs (see the mutation above), so this isn't blocking. For 3.2: count coverage from what was actually emitted, and widen the statement grammar.
3. **The ABI doc is fixed** (R0..R2, R3 scratch), with the worked `memcpy` example and the measured costs ✓.
4. **The `tcc5.js --run` CLI requires `../tests/t3-common.js`**, which isn't in the delivery. It works only when overlaid on the repo. Note this in the README, or lift the helper.

## For round 3.2 (small)
1. Fix `va_arg(ap, struct T)` for all struct sizes, including sizes that aren't a multiple of 4 (3 and 5 bytes, as in `vastruct.c`). Add a per-clause test (7.16.1.1) and a positive control for it.
2. Make `may_alias` a warning, not an error, or explain in REPORT why it must stay an error.
3. Regenerate results.jsonl in a single run on the final code.
4. Count generator coverage from emitted features.
