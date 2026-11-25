# Audit of Triton 5 stage 1, delivery 1 (Kehai Interim, 2026-11-25)

**Verdict: accept as the stage-1 machine, with one design finding that changes how the page-size measurements read.**
Paging-off compatibility with Triton 4 holds, under an unchanged state hash. Every delivered suite reproduces. The
paging oracle really is independent. But the "zero-cost" address split for the 3ᵏ page sizes uses unsigned base-3
digits, and Triton's words are balanced trits. So the measured cost of 729 and 2,187 is optimistic (finding 1).

## What was checked
1. **Integrity:** committed as received (`ARRIVED-1.md`). All 16 files match the SHA-256 table in `REPORT-5.md`.
2. **The delivered suites, rerun** on a scratch copy of this repo with the delivery overlaid:
   - tests 2–8 pass, with the same counts as `results.jsonl`;
   - test 1 passes;
   - its one Selenium-driven Triton 4 suite (`t4-05`) was skipped in the scratch copy only, because this workspace
     has no Selenium. The delivery itself is unchanged.
3. **The state hash didn't move.** `computeStateHash` in `triton5.html` is Triton 4's, line for line, plus one block
   that mixes in the new Triton 5 registers only when they're non-zero. So "paging-off hash equals Triton 4" is a
   real comparison. Console paths (`getConsoleOut`) are byte-identical to Triton 4's.
4. **Longer compatibility run** (`probes/compat-long.js`): TritOS Desktop 2.0.1 on Triton 4 and Triton 5 side by side
   for 3,000,000 steps with seeded mouse and keyboard input, hashes compared every 25,000 steps.
   - **Identical at all 120 checks, on both the JS and WASM cores.**
   - Control (`probes/compat-control.js`): one changed tryte of RAM makes the hashes differ.
   - This matters because the delivered random step-for-step check is short: 50 programs of about 42 steps each.
5. **The paging oracle is independent.** `tests/t5-03-paging-oracle.js` computes splits and walks with its own
   arithmetic and shares no translation code with the machine. The machine is checked by running real guest loads,
   stores and jumps, not by calling its translator.
6. **Real browser** (Playwright, Chromium): `triton5.html` loads with 0 console errors, boots the TritOS 3 shell,
   and reports `JS ≡ WASM LOCKSTEP OK`.

## Findings
1. **The 3ᵏ split is unsigned base-3, not balanced trits (design; this is the one that matters).**
   `t5SplitAddr729` and `t5SplitAddr2187` peel off digits 0, 1, 2 (`v % 3`). Triton words are balanced trits
   (−1, 0, +1), and the two decompositions disagree on about half of all addresses.
   - **Example:** VA 365 sliced as balanced trits gives offset −364 in page 1. The unsigned split gives offset 365
     in page 0.
   - **Measured:** in 43,177 sampled VAs below 3¹⁶, 21,559 differ.
   - **What it means for cost:**
     - On real Triton hardware, getting the unsigned digits this MMU uses takes a balanced-to-unsigned conversion,
       which is a carry chain across the field, not "pure wire routing".
     - So the reported **0 division steps** for 729 and 2,187 understates their cost. The 4,096 figure (22 steps)
       is unaffected.
     - The genuinely free option is an MMU that keeps the fields balanced: offsets −364..+364, page-table indices
       centred on zero. Nobody has built or measured that yet.
   - **Our side:** the spec said "split the address by trit position" without saying *balanced* trits. It should
     have.
2. **TLB contents aren't in the state hash.** JS and WASM TLB agreement is checked only through hit and walk
   counters (test 3). A TLB that held different entries but produced the same translations would go unnoticed. That
   is unlikely to matter, but it's worth knowing.
3. **Cosmetic:** the page's status bar still says "Triton 4.0 Balanced-Ternary Workstation".

## Not yet done
- A by-hand read of the MMU walk, CAS and restart paths in both cores (the tests exercise them; I haven't read
  them line by line).
- Independent probes of the binary-semantics instructions beyond the delivered BigInt oracle.

## Reproducing
```
# a copy of this repo with audit/triton5/delivery-1/ overlaid at the root, then:
node tests/t5-run-all.js
node audit/triton5/probes/compat-long.js <that copy>
node audit/triton5/probes/compat-control.js <that copy>
```
