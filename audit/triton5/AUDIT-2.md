# Triton 5 stage 2 audit, delivery 2 (Kehai Interim, 2026-11-25)

**Verdict: accept.** The balanced-3ᵏ MMU is real in both cores, matches an oracle written from the spec alone on
400,000 executed accesses, leaves paging-off Triton 4 behaviour and the stage-1 modes unchanged, and the
stage-1 "zero-cost" label is corrected in both documents as asked. Notes below. No measurement is ranked.

Spec: `SPEC-TRITON-5-STAGE2.md` (4509e84, committed before sending). Delivery: `delivery-2/` (1df1b9f, committed
as delivered). Code under audit: `triton5.html` sha256 `fc37638c…b7d16c`.

## What I checked, and how

1. **Arrival.** All 22 files match the delivered SHA-256 table (see `ARRIVED-2.md`).
2. **The diff from stage 1 is small and readable** (218 changed lines in `triton5.html`), and I read all of it:
   - a new mode switch (`mmuMode`, read-only `SPR_MMU_MODE` = 28);
   - two balanced split functions per core (JS `t5SplitAddrBal729/2187`, WAT `$split_addr_bal_729/2187`);
   - the centring `−1` on PDE/PTE addresses in balanced mode;
   - the virtual-page-0 guard, placed before the TLB lookup, so no page-0 entry can ever be cached;
   - frame ≥ 1 guards on both the PDE's L1 frame and the PTE's frame;
   - the UI selector.

   Balanced mode never calls the unsigned or binary split (forbidden list ✓). The only change to the stage-1
   modes is the value of their split-cost counter (16 / 19 / 22 instead of 0). That's the requested correction,
   and it feeds no translation. `TLBINV` and the SPR 22 path go through the same mode dispatch in both cores.
3. **Untouched where it must be.**
   - The stage-1 tests `t5-01`…`t5-09` and `t5-common.js` are byte-identical to delivery 1. `t5-run-all.js` only
     gains the six new suites and the docs-generation step.
   - `computeStateHash` is byte-identical to stage 1. The new split-cost counter is not mixed into it.
4. **Reruns** (scratch copy of this repo with the delivery overlaid; logs in `probes/reruns-2/`). All pass:
   - stage 2: `t5-10` … `t5-14`;
   - stage 1: `t5-02` … `t5-08`;
   - `t5-01`: 12/12 T3 suites, 3/4 T4, the 50 diff programs, the 7 d20 suites, and the 200k-step desktop boot
     hash `0x575c333`, equal to Triton 4.

   Skipped: `t4-05`, `t5-09` and `t5-15` need Selenium, which this workspace doesn't have (as in stage 1).
   `t4-05` was removed from the list in the scratch copy only.

   `t5-14` is seeded and reproduces the delivered measurement table exactly.
5. **Independent hot-path probe** (`probes/balanced-walk.js`, output in `balanced-walk.out`). Real `LT`
   instructions run through *both* cores over randomly built centred page tables:
   - 200,000 accesses per size, with the TLB never flushed (about 1.1M TLB hits and 120k walks per size);
   - negative and extreme indices at both levels, virtual page 0 with a planted valid PTE, and C NULL;
   - unmapped PDEs and PTEs, a PDE pointing at frame 0, PTEs with frame 0 and with a negative frame, and VAs just
     out of range.

   Every load returned the tryte my oracle predicted. Every fault reported `EADDR` = the machine VA. The oracle
   shares no code with the delivery: its own rounding, its own table model, its own expected faults. JS and WASM
   registers were compared after every access, and full state hashes every 100 accesses.
6. **The probe's own positive controls** (`balanced-walk-controls.py`). Each mutant is applied to *both* cores, so
   JS/WASM lockstep can't catch it; the oracle has to. All four were caught:
   - virtual page 0 mapped;
   - unsigned split substituted;
   - frame 0 allowed;
   - PTE base at entry 0.
7. **Real browser** (Playwright Chromium, `probes/browser-balanced.py`).
   - The page loads with 0 console errors and 0 page errors.
   - The selector offers both balanced modes.
   - The page booted TritOS with "JS ≡ WASM LOCKSTEP OK" in Balanced 2187 (`browser-balanced.png`).
   - In-page JS and WASM balanced machines at both sizes load through a negative-vpn page and fault on C NULL
     with `EADDR` = −B, with equal state hashes.

## Notes (none blocks acceptance)

- **The delivered positive controls mostly lean on the twin, not the oracle.** `t5-13` patches the JS core only.
  So 5 of its 7 mutants are caught as "JS/WASM lockstep mismatch at step 1" rather than by `t5-10`/`t5-11`'s
  oracle checks. That's a legitimate differential test, but a defect written into both cores would only meet
  the oracle. My probe's controls (item 6) cover that case.
- **`bias_off_by_one` mutates the checker, not the machine.** Its patch is the identity: it shifts the bias inside
  the test's own oracle. That's unavoidable, since the bias is a compiler convention with no hardware behind it,
  so the control can only show that the test is sensitive to the convention.
- **The 1,000,000-address oracle checks the JS split function only.** The WASM split was exercised by short
  lockstep runs (19–296 steps). Item 5 closes this with 400,000 executed accesses per core.
- **The desktop workload is a replayed trace, not TritOS running paged.**
  - `t5-14` records 40,000 steps of TritOS Desktop 2.0.1 (with seeded mouse and keys) on the unpaged machine,
    then replays those addresses through `translateAddrT5`. The report says so, and it's a fair instrument.
  - But the trace touches only 12–35 pages, so every design shows a TLB hit rate of 99.9%+ on it. The sparse
    synthetic workload is where the designs actually differ.
- **The gate counts are Neon's rough estimates** (about 6 or 14 gates per trit), stated as such. They aren't
  circuit-verified. The carry-chain lengths (16 and 19 trits = the trits covered by the two-level split) are
  sound.
- **Doc nit:** `ISA-5.md` gives `SPR_MMU_MODE`'s reset value as `1`. It's `1` only for the default 2,187
  unsigned machine. It's fixed at creation, so it's `0` or `2` in the other designs.

## What the measurements show (descriptive, no ranking)

- **With the compiler bias, balanced-3ᵏ and unsigned-3ᵏ partition C addresses into the same pages.**
  A = P − B gives vpn = ⌊P/3ᵏ⌋. So their unique pages, walks, walk steps and TLB hit rates are identical on
  both workloads. What differs is only:
  - **split cost:** 0 against a 16- or 19-trit carry chain per translation;
  - **table count:** centred tables split the vpn range at ±(3ʷ−1)/2, not at 3ʷ.
- **The table effect goes either way.**
  - Balanced-2187 needed 3 tables on the desktop trace (6,561 trytes), where unsigned-2187 needed 2 (4,374).
    A positive-only address space reaches the centred L0's +1 slot at half the distance.
  - Balanced-729 needed fewer (2,187 trytes against 2,916).
  - An OS that places part of its space at negative addresses would use the other half of every centred table.
    That's a design question for the studio, not a finding against the delivery.
- **Page size, not design, drives the TLB hit rate on the sparse workload:** 4,096 gives 99.68%, 2,187 gives
  87.79%, 729 gives 63.76%.

— Kehai
