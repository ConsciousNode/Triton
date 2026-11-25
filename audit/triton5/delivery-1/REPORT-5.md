# Triton 5.0 Stage 1 — Verification & Measurement Report (`REPORT-5.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT · **Target:** Triton 5.0 Stage 1 (Machine Beneath Native NetBSD Port)

*Generated programmatically by `tests/t5-generate-report.js` from `results.jsonl` and `triton5.html`. Every number below is measured.*

## 1. Deliverables, Sizes & SHA-256 Digests

| File | Bytes (Measured) | SHA-256 Digest |
| :--- | ---: | :--- |
| `triton5.html` | `442,008` | `2eed18755451a8e32671182d2d8d84628b641fe1b782093ab775886e8ed353a7` |
| `ISA-5.md` | `22,942` | `7696208c57e7f814fd65b4829f4dc62ae0a12019156cb20fbc1f40a88fe66d39` |
| `results.jsonl` | `8,328` | `d5247e04e83c316d08dbebf02cd3a1b13bac196745f9bf13684beb123e59b58b` |
| `tests/t5-generate-docs.js` | `21,002` | `c67ff0a9474d965065c3566aea4766179f1500dace04456d3e88ea833fe8cd68` |
| `tests/t5-generate-report.js` | `11,132` | `ed65b4a5cacb27cdbab7aac9c3ed313ac4b6fc576b493766fba8f97c1f20ccdc` |
| `tests/t5-common.js` | `4,178` | `74ed42be82a6769b7b0912585498ee409df3ebba417c69328b7df0f5c1537074` |
| `tests/t5-run-all.js` | `2,500` | `abf9bf2e711a55b2ee9f50ed68cac50c6c4076a3c3503157af2885e1f74c553e` |
| `tests/t5-01-compat.js` | `9,799` | `4ee5c8262d67d88b34cb53472d820e90795ebd4b1428058847ae6ac6ba3cc29e` |
| `tests/t5-02-lockstep.js` | `7,668` | `f5d44bff8f0660ac33dd43ceae9e5ca707746a8fb3fa3e5b2b17314ca59956ba` |
| `tests/t5-03-paging-oracle.js` | `13,641` | `30c3aea267a1a5ad8be3028114189aa7324a389b6f9d3f02eeea93289ab3bec0` |
| `tests/t5-04-binary-oracle.js` | `11,384` | `2cc50971b4c6b374d75496335b0f40cf8731411d2a4a5af67ba99ae2e736c3f8` |
| `tests/t5-05-restartability.js` | `11,356` | `600f6c2f115f47ee6c5c241a9cbb4026593520bed11dad8b0d67f0dd425eccb4` |
| `tests/t5-06-positive-controls.js` | `4,228` | `c53a32ed24459f7e299da1d0d82a68b33387cb9d72499702b4ca056ccfb731d5` |
| `tests/t5-07-atomics.js` | `7,852` | `bd89f4304b9985b14237db6696d167836eb06f9213b537c2b372b5ec441e682e` |
| `tests/t5-08-pagesize-bench.js` | `7,254` | `c8cbad772885b27ed50e9d6a8d7fec9723ebaa4445f05508a2e97687cdd018ec` |
| `tests/t5-09-browser.js` | `6,515` | `108075c9714f919563e9ce8d504862a55a1a329298101b51c00353000676d405` |

- **`triton5.html`:** Single self-contained HTML file, zero external dependencies, offline, MIT licence; lifted from `triton4.html` with provenance comments on every inline/lift.
- **MicroWAT WASM Core:** `17,229` bytes assembled at runtime from `TRITON_WAT` (`89` total opcodes: `69` Triton 4 + `20` Triton 5).
- **TLB Configuration:** `64`-entry fully associative FIFO TLB (tagged by `ASID` and `G` bit), flushed via `TLBFLUSH` / `SPR_TLB_FLUSH` (all) or `TLBINV` / `SPR_TLB_INV` (single VA).

## 2. Discrepancies Found Between Triton 4 Code and Docs

Per the rule "trust code over docs where they disagree, and report any disagreement you find":

1. **`triton4.html` line 893 comment:** States `T3_FB_BASE = 15000000 // MMIO framebuffer base address (15000000 .. 0x4567F5)`. `0x4567F5` is `4,548,597`; the actual end address in code is `15,000,000 + 354,294 - 1 = 15,354,293` (`0xEA4CF5`).
2. **`triton4.html` lines 944 & 953 comments:** `T3_SPR.IMASK` comment lists bits `0..4` (omitting bit 5 `IRQ_MEDIA`) and `T3_SPR.ECAUSE` comment lists vectors `0..11` (omitting vector 12 `IRQ_MEDIA`), whereas actual code masks `val & 63` (bits `0..5`) and dispatches vector `12`.
3. **`REPORT-4.md` section 2.5 vs. `triton4.html` lines 10040–10082:** `REPORT-4.md` describes `computeStateHash` as hashing low RAM (`0..19,682`), low disk (`0..19,682`), and low VRAM (`0..59,048`), whereas in T3 mode `triton4.html` actually hashes the full sparse `vm.mem`, `vm.disk`, `vm.vram`, and `vm.units[1..26]`.

## 3. Additions Implemented & NetBSD MD Rationale

### Addition A — Hardware-Walked Paging (`SPR 16..22, 25..27`, `Vector 13`)
- 2-level page tables in physical RAM rooted at `SPR_PTBR` (`SPR 17`); 1-word (3-tryte) PDE/PTE format `ppn * 512 + flags` with `V`, `R`, `W`, `X`, `U`, hardware-set `A` and `D`, and `G`.
- Three honest page-size modes selected at machine creation (`options.pageSize`, read-only `SPR_PAGE_SIZE`):
  - **`729` ($3^6$)**: base-3 trit-position slice (`[0..5]` offset, `[6..10]` L1, `[11..15]` L0; 243 entries/table = 729 trytes).
  - **`2,187` ($3^7$)**: base-3 trit-position slice (`[0..6]` offset, `[7..12]` L1, `[13..18]` L0; 729 entries/table = 2,187 trytes).
  - **`4,096` ($2^{12}$)**: real integer division (quotient/remainder by 4,096 and 1,024; 1,024 entries/table = 3,072 trytes).
- Precise, restartable `Vector 13` (`PAGE_FAULT`) recording faulting VA in `SPR_EADDR` and access/mode/reason/level in `SPR_PF_CAUSE`.

### Addition B — Binary-Semantics C Instructions (`+56 .. +70`)
- `WRAPU`, `WRAPS` (wrapping to $[0, 2^n)$ and $[-2^{n-1}, 2^{n-1})$ for $n le 32$), `BAND`, `BOR`, `BXOR`, `BNOT`, `BSHL`, `BSHR`, `BSAR`, and 64-bit register-pair primitives `BADD`, `BADC`, `BSUB`, `BSBC`, `BMULLO`, `BMULHI`. Lowering sequences for `uint64_t` are documented in `ISA-5.md` Section 1.2 and verified in Test 4.

### Addition C — Kernel & NetBSD Machine-Dependent Hardware (`+71 .. +75`, `SPR 23..24`)
- **`CAS rd, rs1, rs2` (`+71`):** Atomic 27-trit word compare-and-swap for NetBSD kernel `mutex`/`rwlock` and userland `atomic_ops(3)`.
- **`WFI` (`+72`, Supervisor-only):** Idle sleep until enabled interrupt arrives for NetBSD `cpu_idle()`; `HALT` retains halt-until-reset semantics.
- **`TLBFLUSH` (`+73`) & `TLBINV rs1` (`+74`, Supervisor-only):** Full and single-VA TLB invalidation required by NetBSD `pmap_update()` / `pmap_remove()` / `pmap_protect()`.
- **`SPR_TLS` (`SPR 23`) & `RDTLS rd` (`+75`, User/Supervisor):** Hardware LWP thread-local storage pointer readable from User mode without trapping, required by NetBSD `_lwp_getprivate()` / `libc` (`errno`, `libpthread`).
- **`SPR_SCRATCH` (`SPR 24`, Supervisor-only):** Kernel trap-entry scratch register required by NetBSD `locore` to save a user GPR before constructing a trapframe on `KSP` without clobbering any of `R0..R8`.

## 4. Verification Results Summary (Measured, from `results.jsonl`)

| Test # | Suite | Status | Input Hash | Measured Runtime |
| :--- | :--- | :--- | :--- | ---: |
| Test 1 | `t5-01-compat` | **PASS** | `0582929a5530c11f…` | 279,901 ms |
| Test 2 | `t5-02-lockstep` | **PASS** | `b9a6d8c5ba8530a7…` | 13,865 ms |
| Test 3 | `t5-03-paging-oracle` | **PASS** | `3511c0a9c22d6775…` | 1,523 ms |
| Test 4 | `t5-04-binary-oracle` | **PASS** | `6f19f665d8a9ba78…` | 22,171 ms |
| Test 5 | `t5-05-restartability` | **PASS** | `6f0be19525ee75a2…` | 216 ms |
| Test 6 | `t5-06-positive-controls` | **PASS** | `2c31420feb52b3ca…` | 408 ms |
| Test 7 | `t5-07-atomics` | **PASS** | `fa2fd00c6839b320…` | 186 ms |
| Test 8 | `t5-08-pagesize-bench` | **PASS** | `f59d55d48321d3a2…` | 292 ms |
| Test 9 | `t5-09-browser` | **PASS** | `056484fe661df1bf…` | 8,696 ms |

### Per-Test Measured Details
- **Test 1 (Compatibility):** `12/12` T3 suites passed, `4/4` T4 suites passed, `50` random programs (`2,100` steps) matched Triton 4 step-for-step, TritOS Desktop 2.0.1 booted `200,000` steps with state hash `0x575c333` identical to Triton 4 on both JS and WASM, and `7/7` Desktop 2.0.1 `d20-*` suites passed on Triton 5.
- **Test 2 (JS/WASM Lockstep):** `2,100,000` total steps executed with paging ON across `729`, `2,187`, and `4,096` exercising all 20 new opcodes; per-step state hash matched after every step plus `4,200` full-memory `computeStateHash` checks.
- **Test 3 (Paging Oracle):** `300,000` seeded accesses (`100,000` per page size × 3) matched the independent paging oracle on both JS and WASM.
- **Test 4 (Binary-Semantics Oracle):** `15` instructions verified against `BigInt` across `9,625` edge cases, `18` 64-bit register-pair lowering tests, and `15,000,000` random cases (`1,000,000` per op).
- **Test 5 (Restartability):** `7` instruction classes (`FETCH, LT_ST, LW_SW_STRADDLE, PUSH_POP_CALL_RET, CAS_STRADDLE, BCOPY_MIDWAY, BFILL_MIDWAY`) demand-faulted, mapped in guest handler, and resumed to exact no-fault reference state across `729`/`2,187`/`4,096` on JS and WASM.
- **Test 6 (Positive Controls):** `4/4` mutants caught (`mmu_skip_user_bit, mmu_never_set_dirty_bit, wrapu_off_by_one, bcopy_restarts_from_beginning`).
- **Test 7 (Atomics & WFI):** `CAS` under interleaved `IRQ_TIMER` produced `0` lost updates (unpaged final `599` = `300` main + `299` ISR; paged final `599` = `300` main + `299` ISR), `WFI` slept and woke cleanly in `50` steps, and `RDTLS`/`SPR_SCRATCH`/User `WFI` privilege fault verified JS === WASM.
- **Test 9 (Real Browser):** Verified via Headless Chromium via Selenium WebDriver (file:// load of triton5.html + TritOS Desktop 2.0.1 on Triton 5 machine block): `triton5.html` loaded with `0` console errors (`JS ≡ WASM LOCKSTEP OK`), all 3 page sizes (`729`, `2,187`, `4,096`) initialized cleanly, and TritOS Desktop 2.0.1 booted on Triton 5 with `0` console errors and `88,574` lit sampled framebuffer pixels.

## 5. Page-Size Measurements (Test 8 — Instrument Only, No Recommendation)

Fixed seeded workload set (seed `0x5eed2026`, `64`-entry FIFO TLB). Address-split cost models hardware restoring-division steps (`0` for base-3 trit-position slice on `729`/`2,187`; `22` division steps per split on `4,096`).

| Workload | Page Size | Accesses | Table Walks | Walk Steps | TLB Hit Rate | Address-Split Cost (Div Steps) | Table Memory (Trytes) | COW Faults |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `sequential_sweep` | `729` | `40,000` | `165` | `495` | `99.59%` | `0` | `1,458` | `0` |
| `sequential_sweep` | `2187` | `40,000` | `55` | `165` | `99.86%` | `0` | `4,374` | `0` |
| `sequential_sweep` | `4096` | `40,000` | `30` | `90` | `99.92%` | `880,000` | `6,144` | `0` |
| `random_access` | `729` | `20,000` | `17,435` | `35,729` | `12.83%` | `0` | `2,916` | `0` |
| `random_access` | `2187` | `20,000` | `12,186` | `24,655` | `39.07%` | `0` | `4,374` | `0` |
| `random_access` | `4096` | `20,000` | `5,375` | `10,898` | `73.13%` | `440,000` | `6,144` | `0` |
| `fork_cow` | `729` | `8,000` | `5,147` | `10,602` | `36.86%` | `0` | `1,458` | `152` |
| `fork_cow` | `2187` | `8,000` | `184` | `474` | `97.72%` | `0` | `4,374` | `55` |
| `fork_cow` | `4096` | `8,000` | `60` | `178` | `99.25%` | `176,660` | `6,144` | `30` |
| `tlb_thrash` | `729` | `12,800` | `12,800` | `25,728` | `0.00%` | `0` | `1,458` | `0` |
| `tlb_thrash` | `2187` | `12,800` | `12,800` | `25,728` | `0.00%` | `0` | `4,374` | `0` |
| `tlb_thrash` | `4096` | `12,800` | `12,800` | `25,728` | `0.00%` | `281,600` | `6,144` | `0` |
