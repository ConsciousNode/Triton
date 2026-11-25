# Triton 5, stage 2: a balanced-trit MMU, measured beside the other two designs

ConsciousNode SoftWorks. Xinu rules: one HTML file, zero dependencies, no network, works offline, MIT licence.
Inline everything, and label every inline. Spec by Ed Interim, reviewed by Kehai Interim; this is the copy sent.

## Why this round exists
Your stage 1 delivery (`triton5.html` and its tests, sha256 `2eed1875…53a7`) passed our audit as the stage-1 machine.
The audit had one design finding. Your 729 and 2,187 modes split addresses into **unsigned** base-3 digits
(`v % 3`), and Triton words are **balanced** trits (−1, 0, +1). The two decompositions differ on about half of all
addresses. For example, VA 365 is offset 365 in page 0 unsigned, but offset −364 in page 1 as balanced trits. So on
real ternary hardware those modes need a carry chain to produce unsigned digits, and their split isn't free. That
part was our spec's fault: it said "by trit position" without saying *balanced*.

This round adds the design whose split really is free, and measures all three designs the same way.

## Names
- **binary-4096**: stage 1's 4,096 mode (needs a divider).
- **unsigned-3ᵏ**: stage 1's 729 and 2,187 modes (need a carry chain).
- **balanced-3ᵏ**: new, below.

## What to build
1. `triton5.html` with **balanced-3ᵏ** added as a selectable mode for 729 (k = 6, B = 364) and 2,187 (k = 7,
   B = 1,093). The existing modes stay as they are.
2. Regenerated `ISA-5.md` and `REPORT-5.md` (by script, as before). Both must **correct** stage 1's "0 division
   steps" label for unsigned-3ᵏ, not just add new numbers beside it.
3. New tests (`tests/t5-1x-*.js`), added to `t5-run-all.js`, writing `results.jsonl` with code and input hashes.

## balanced-3ᵏ, virtual side
- **Split:** take the balanced trits of the machine address A. The low k trits are the offset (−B..+B), and the
  trits above them are the page number.
- **Centred tables:** every page-table base points at the table's middle entry. Indices at every level are balanced
  (−(3ⁿ−1)/2 .. +(3ⁿ−1)/2), and the walk handles negative indices at every level. Keep stage 1's 2-level layout;
  choose and state the level widths.
- **The compiler bias (a software convention, no hardware):** C pointers keep their C value P, and the machine
  address is A = P − B. A compiler would fold −B into every load/store displacement and use `JALR rd, rs, #−B`
  for indirect jumps. Then the offset is (P mod 3ᵏ) − B and the page is ⌊P/3ᵏ⌋. State this in `ISA-5.md` with
  the displacement floor: the most negative usable C displacement is −9,477 for 729-tryte pages and −8,748 for
  2,187-tryte pages.
- **NULL:** C's NULL is machine address −B, the lowest tryte of virtual page 0. Virtual addresses run negative,
  down to −B. Virtual page 0 is never mapped.

## balanced-3ᵏ, physical side
- **Physical frames are numbered from 1.** Frame n covers PA n·3ᵏ − B .. n·3ᵏ + B, so the lowest frame address is
  B + 1.
- **The PA is pure wiring:** the frame's balanced trits sit above the offset's balanced trits, with no adder.
- **RAM 0..B lies outside every frame.** The vector table and pre-paging boot code live there.

## Which space each address lives in
State it in `ISA-5.md` and test it:
- **Machine space:** PC, return addresses pushed by CALL/CALLX/JALR, BCOPY/BFILL operands, DMA addresses,
  page-table entries, and `EADDR` on a fault.
- **C space:** only what compiled C code holds in variables.

## Measurements (instruments; no recommendation anywhere)
For all three designs, on the same workloads:
1. **Split cost per translation:** divider steps (binary-4096), carry-chain length in trits (unsigned-3ᵏ), and
   zero (balanced-3ᵏ). Add a gate-level estimate for each, and say how it was estimated.
2. **Walk length, TLB hit rate and page-table memory**, on TritOS Desktop 2.0.1 with seeded mouse and keyboard
   input, plus one synthetic sparse-address workload.

**Don't recommend a page size or a design.** The studio decides from your measurements.

## Tests (numbered; each writes a line to results.jsonl)
1. JS and WASM run in lockstep, with the state hash compared after every step, on every new suite, in
   balanced-3ᵏ at both sizes.
2. Triton 4 compatibility is unchanged with paging off, and stage 1's 9 suites still pass.
3. **An independent oracle**, written without the emulator's ALU, checks the balanced split and the physical frame
   wiring on at least 1,000,000 addresses per size. That must include every ±B and ±(B+1) boundary.
4. **NULL:** dereferencing C NULL (machine address −B) faults with `EADDR = −B`.
5. **Restartability:** fault restart stays precise across a page boundary (offset +B → −B) in the middle of BCOPY
   and BFILL.
6. **Positive controls that must fail.** Each has a switch, and the tests above must catch it:
   - unsigned digits substituted for balanced;
   - unsigned at one level only (a half-converted walk);
   - bias off by one;
   - a table base at entry 0 instead of the middle;
   - frame 0 used (a negative PA);
   - `EADDR` reported in C space instead of machine space;
   - virtual page 0 mapped.
7. **The measurements above,** for all three designs.
8. **Real browser:** the page loads with 0 console errors and runs balanced-3ᵏ. Say how you tested it.

## Forbidden
- Any change to Triton 4 behaviour with paging off, or to stage 1's unsigned-3ᵏ and binary-4096 modes.
- Implementing balanced-3ᵏ by translating to or from another mode.
- Precomputed results, test-shaped special cases, or branching on test names or inputs.
- Changing existing tests, harnesses, accessors, the state hash or console paths to make a check pass.
- An emulator reading or writing a guest's private memory, except through documented ports and DMA.

## Report
State what was built and how each claim was verified. Don't describe anything as working unless a test exercises
it. Mark every number as measured.

If a requirement can't be met, or conflicts with another, say so in REPORT-5.md and leave it failing. Never change
emulator or VM accessors, I/O, consoles, test harnesses, or the auditor's scripts to make a check pass. An emulator
must never read or write a guest's private memory.
