# Triton 3.1 audit

**Auditor:** Kehai Interim · **Date:** 2026-11-12
**Delivery:** commit `4381eb3` (Argon's bundle, as delivered).
**Spec:** [`SPEC-3.1.md`](SPEC-3.1.md). **Previous audit:** [`AUDIT-3.0.md`](AUDIT-3.0.md).

## Verdict

**Both 3.0 bugs are fixed, and I found no rigging.**
- The WASM core now carries every architected value at full 27-trit width.
- The console no longer runs out.
- My three 3.0 audit probes are unmodified, and all three now pass.

Argon also found and fixed a bug I missed: in 3.0, a long input string (more than 4,096 characters) overflowed the WASM input queue into the T2 disk mirror. The change is disclosed in `CHANGES-3.1.md`.

## What I ran

| Check | Result |
|---|---|
| `node tests/t3-run-all.js` | **11 passed, 0 failed, 0 skipped.** The browser test now runs here through Playwright for Node. |
| 2.x suites against the unchanged `triton.html` | `tests/run.js` 8/8, `tests/symbols.js` 6/6 |
| `audit/t3-badaddr-probes.js` (failed on 3.0) | **Passes.** Loads at 3²⁵, 2³²+2000 and 2³²+framebuffer now fault on WASM with the full `EADDR`, the same as JS. |
| `audit/t3-console-cap.js 400` (failed on 3.0) | **Passes.** JS and WASM consoles are both 10,901 characters and identical, while the I/O trace stays capped at 10,900, as the spec allowed. |
| `audit/t3-protection-probes.js` | Still passes (10 escape attempts). |
| `audit/t31-counter-crossing.js` (new) | **Passes.** The step counter crosses 2³¹, 2³² and 3²⁶ by **real stepping**, with fast-forward off. JS and WASM agree on steps, port 6 and the state hash, with no wrap. |
| Doc regeneration | `ISA-3.md` byte-identical. `REPORT-3.md` identical apart from the timing table, which depends on the machine. The generator now writes into the repo, as F3 required. |
| Test diffs | The changed suites (`t3-04`, `-05`, `-06`, `-08`, `-09`) only **add** checks: large SPRs, a 2³¹ counter, DMA and NIC registers ≥ 2³², and a 50,746-character console. No existing assertion was removed or loosened. |

## Notes

1. **`fastForward` is a loop accelerator inside the machine, used only by the long-run test.**
   - Spec Test 3 allowed "a fast-forward test mode that both machines share". It's opt-in and off by default, and the workstation UI never turns it on.
   - It recognizes one loop shape (count down by one, then branch back), checks itself against step-by-step execution on 50,000 iterations, and stops skipping right before step 2,147,483,644, so the 2³¹ crossing itself is stepped for real.
   - That clamp is a hardcoded number tied to the test's boundary, and it isn't documented in `ISA-3.md`. It's harmless, but it's the kind of special case I'd rather see written down.
   - Because the delivered long-run test depends on fast-forward, I added `audit/t31-counter-crossing.js`, which crosses the boundaries without it.
2. **Unrequested changes, all disclosed:**
   - the top-level script is now wrapped in an IIFE, and `TritonSystem` is still exported;
   - JS has a 19,683-entry decode table for speed;
   - the input-queue overflow fix.

   Every test passes with them.
3. **The Desktop pin.** `SPEC-DESKTOP-1.0.md` pins the **3.0** machine block (lines 431–9394, by SHA-256). 3.1 changes the machine code, so the Desktop build in progress is against 3.0. Dropping in 3.1 afterwards means re-pinning the hash and rerunning the Desktop suite. The fixes don't change what correct guest software sees.

## Files added by this audit

`audit/t31-counter-crossing.js` and this file.
