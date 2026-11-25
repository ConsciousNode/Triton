# Triton 5.0 (Stage 1 + Stage 2) — Verification & Measurement Report (`REPORT-5.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT · **Target:** Triton 5.0 (Machine Beneath Native NetBSD Port, including `balanced-3^k` MMU)

*Generated programmatically by `tests/t5-generate-report.js` from `results.jsonl` and `triton5.html`. Every number below is measured. No page size or MMU design is recommended or ranked.*

## 1. Stage 2 Audit Correction: `unsigned-3^k` Split Cost Is Not Zero

Stage 1's `ISA-5.md` and `REPORT-5.md` labeled `unsigned-3^k` (`729` and `2,187`) as having `0` address-split cost ("0 division steps"). That was inaccurate for real balanced-ternary hardware: Triton words are balanced trits `{-1, 0, +1}`, whereas `unsigned-3^k` splits addresses into unsigned base-3 digits `{0, 1, 2}`. Converting a balanced-ternary address to unsigned base-3 digits requires a **borrow/carry chain** across all address trits (`16` trits for `729`, `19` trits for `2,187`). Both `ISA-5.md` and the measured tables below correct `unsigned-3^k` to its true carry-chain length (`16` / `19` trits) and gate estimate (`96` / `114` ternary gates), measured beside `binary-4096` (`22` divider steps, `294` iterative gates) and the new **`balanced-3^k`** design (`0` carry trits, `0` divider steps, `0` gates).

## 2. Deliverables, Sizes & SHA-256 Digests

| File | Bytes (Measured) | SHA-256 Digest |
| :--- | ---: | :--- |
| `triton5.html` | `450,481` | `fc37638ca5bbd2ac2d5461dd3c6a760fe3345712458467c6fa97eea699b7d16c` |
| `ISA-5.md` | `25,868` | `5067d7cc1b2bb488e3e69cfa59512c337c2c361c7d0d18e2f7ba6b529f0032b5` |
| `results.jsonl` | `17,715` | `d4074293456d0fbc6eef8e79b85c673c602e7734acce084f790618d318f06356` |
| `tests/t5-generate-docs.js` | `23,766` | `3ee0973be917ac6706173bcb9c8a85d5778734ec8f819a0e8a527bf9b70a3dbc` |
| `tests/t5-generate-report.js` | `12,278` | `d51571817486330bea50989db81c92aa6062500201a4738b387ee693ba86b3db` |
| `tests/t5-common.js` | `4,178` | `74ed42be82a6769b7b0912585498ee409df3ebba417c69328b7df0f5c1537074` |
| `tests/t5-run-all.js` | `3,037` | `2f0391d90382fcb6cf7ce3e5b3ca685297be9fa146b3dce17cb9429ccb293170` |
| `tests/t5-01-compat.js` | `9,799` | `4ee5c8262d67d88b34cb53472d820e90795ebd4b1428058847ae6ac6ba3cc29e` |
| `tests/t5-02-lockstep.js` | `7,668` | `f5d44bff8f0660ac33dd43ceae9e5ca707746a8fb3fa3e5b2b17314ca59956ba` |
| `tests/t5-03-paging-oracle.js` | `13,641` | `30c3aea267a1a5ad8be3028114189aa7324a389b6f9d3f02eeea93289ab3bec0` |
| `tests/t5-04-binary-oracle.js` | `11,384` | `2cc50971b4c6b374d75496335b0f40cf8731411d2a4a5af67ba99ae2e736c3f8` |
| `tests/t5-05-restartability.js` | `11,356` | `600f6c2f115f47ee6c5c241a9cbb4026593520bed11dad8b0d67f0dd425eccb4` |
| `tests/t5-06-positive-controls.js` | `4,228` | `c53a32ed24459f7e299da1d0d82a68b33387cb9d72499702b4ca056ccfb731d5` |
| `tests/t5-07-atomics.js` | `7,852` | `bd89f4304b9985b14237db6696d167836eb06f9213b537c2b372b5ec441e682e` |
| `tests/t5-08-pagesize-bench.js` | `7,254` | `c8cbad772885b27ed50e9d6a8d7fec9723ebaa4445f05508a2e97687cdd018ec` |
| `tests/t5-09-browser.js` | `6,515` | `108075c9714f919563e9ce8d504862a55a1a329298101b51c00353000676d405` |
| `tests/t5-10-balanced-oracle.js` | `12,380` | `e3fa21ed5fca486c3383fca4679408da54acafe596733685c531c033a8c82605` |
| `tests/t5-11-balanced-null.js` | `7,208` | `cf27eb31b5ee49d95606f375a773a5d32c536c2e61aed2849e14e7b6948b2a64` |
| `tests/t5-12-balanced-restart.js` | `8,579` | `575e8710279ffa9226acc8994ff486f040d55f6c2a5226e47c774e63578e8075` |
| `tests/t5-13-balanced-pos-controls.js` | `4,679` | `960759dad40856f9d6e82e0a5d110f10ad866234e174c4631098ba6c94e4d9d3` |
| `tests/t5-14-all-designs-bench.js` | `11,011` | `3e03b043422bb4efe26e0a924b968d5599b136ab8d506fdd55187434d7a0d988` |
| `tests/t5-15-balanced-browser.js` | `5,479` | `befdc930902b2d60fc0daf64d0826c84e8c0c87aeb2536837a7ac22ce9b691a8` |

- **`triton5.html`:** Single self-contained HTML file, zero external dependencies, offline, MIT licence; lifted from `triton4.html` with provenance comments on every inline/lift.
- **MicroWAT WASM Core:** `17,698` bytes assembled at runtime from `TRITON_WAT` (`89` opcodes, `29` SPRs, `64`-entry FIFO TLB).

## 3. What Was Built in Stage 2 (`balanced-3^k` MMU)

- **Selectable MMU Mode (`options.mmuMode: 'balanced'`, `SPR_MMU_MODE = 28`):** Implemented honestly in both `TritonJS` and `TritonWASM` for `729` ($k=6, B=364$) and `2,187` ($k=7, B=1,093$) without translating to or from `unsigned-3^k` or `binary-4096`. Existing modes and paging-off Triton 4 behavior remain unchanged.
- **Virtual Split & Centred 2-Level Tables:** Low `k` balanced trits give `off ∈ [-B, +B]`; upper trits give `vpn`, split into two balanced levels (`5+5` trits = `[-121..+121]` for `729`; `6+6` trits = `[-364..+364]` for `2,187`). Table bases point to the middle entry (`idx=0` at `[base-1 .. base+1]`); negative indices are handled at both L0 and L1.
- **NULL & Physical Frame 1+ Wiring:** Virtual page 0 (`[-B..+B]`, including C `NULL = -B`) is never mapped in hardware and faults with `EADDR = A` (machine space). Physical frames start at `1` (`PA = ppn·3^k + off >= B+1`, pure wiring with no adder); RAM `0..B` lies outside every frame for `VBR = 0` and pre-paging boot code; `ppn <= 0` faults.
- **Compiler Bias & Address Spaces:** Documented in `ISA-5.md` Section 1.2 (C displacement floor `-9,477` for `729`, `-8,748` for `2,187`; `PC`, `CALL`/`CALLX`/`JALR` return addresses, `BCOPY`/`BFILL`, DMA, PTEs, and `EADDR` live in machine space).

## 4. Verification Results Summary (Measured, from `results.jsonl`)

| Test # | Suite | Status | Input Hash | Measured Runtime |
| :--- | :--- | :--- | :--- | ---: |
| Test 1 | `t5-01-compat` | **PASS** | `0582929a5530c11f…` | 281,508 ms |
| Test 2 | `t5-02-lockstep` | **PASS** | `b9a6d8c5ba8530a7…` | 14,207 ms |
| Test 3 | `t5-03-paging-oracle` | **PASS** | `3511c0a9c22d6775…` | 1,528 ms |
| Test 4 | `t5-04-binary-oracle` | **PASS** | `6f19f665d8a9ba78…` | 22,917 ms |
| Test 5 | `t5-05-restartability` | **PASS** | `6f0be19525ee75a2…` | 227 ms |
| Test 6 | `t5-06-positive-controls` | **PASS** | `2c31420feb52b3ca…` | 441 ms |
| Test 7 | `t5-07-atomics` | **PASS** | `fa2fd00c6839b320…` | 188 ms |
| Test 8 | `t5-08-pagesize-bench` | **PASS** | `f59d55d48321d3a2…` | 311 ms |
| Test 9 | `t5-09-browser` | **PASS** | `056484fe661df1bf…` | 8,450 ms |
| Test 10 | `t5-10-balanced-oracle` | **PASS** | `b07458f1736ea476…` | 3,281 ms |
| Test 11 | `t5-11-balanced-null` | **PASS** | `c705dffada416f53…` | 129 ms |
| Test 12 | `t5-12-balanced-restart` | **PASS** | `cd9add1fba77a76e…` | 408 ms |
| Test 13 | `t5-13-balanced-pos-controls` | **PASS** | `53d349e5ce6a2acb…` | 595 ms |
| Test 14 | `t5-14-all-designs-bench` | **PASS** | `98784c8e021831f1…` | 1,188 ms |
| Test 15 | `t5-15-balanced-browser` | **PASS** | `1cf60c54d2fd5103…` | 2,570 ms |

### Stage 1 Suites (`t5-01` .. `t5-09`, Re-Verified Unchanged)
- **Test 1 (Compatibility):** `12/12` T3 suites, `4/4` T4 suites, `50` diff programs (`2,100` steps), TritOS Desktop 2.0.1 200k-step boot (`0x575c333` === Triton 4), and `7/7` `d20-*` suites passed.
- **Test 2 (Stage 1 Lockstep):** `2,100,000` steps JS === WASM across `729`/`2,187`/`4,096` (+ `4,200` full `computeStateHash` checks).
- **Test 3 (Stage 1 Paging Oracle):** `300,000` seeded accesses matched independent oracle on JS & WASM.
- **Test 4 (Binary-Semantics Oracle):** `15` ops, `9,625` edges, `18` 64-bit pair tests, `15,000,000` random cases matched `BigInt`.
- **Test 5 (Stage 1 Restartability):** `7` instruction classes demand-faulted and resumed identically to no-fault ref on JS & WASM.
- **Test 6 (Stage 1 Positive Controls):** `4/4` mutants caught.
- **Test 7 (Atomics & WFI):** `CAS` under interleaved `IRQ_TIMER` (`0` lost updates; unpaged `599`, paged `599`), `WFI` wake (`50` steps), `RDTLS`/`SPR_SCRATCH` verified JS === WASM.
- **Test 9 (Stage 1 Browser):** `triton5.html` (`0` console errors) + TritOS Desktop 2.0.1 on Triton 5 (`0` console errors, `88,574` lit sampled pixels).

### Stage 2 Suites (`t5-10` .. `t5-15`)
- **Test 10 (Independent Balanced-Trit Oracle + Lockstep):** `2,000,000` addresses (`1,000,000` per size × 2, including every `±B` and `±(B+1)` boundary) verified against an independent balanced-trit oracle (no emulator ALU); centred walks with negative L0 and L1 indices verified JS === WASM after every step.
- **Test 11 (NULL `-B`, Frame 0 Guard & Machine Space):** C `NULL` (`-364` / `-1,093`) READ/WRITE/EXEC faulted with `EADDR = -B`; virtual page 0 guard rejected planted PTE in slot `(0,0)`; frame 0 PTE faulted; `CALLX` return PC verified in machine space; JS === WASM after every step.
- **Test 12 (Balanced-3^k Restartability Across `+B → -B`):** `BCOPY` (overlapping downward copy), `BFILL`, and `LW`/`SW` straddling the `+B → -B` page boundary demand-faulted, mapped, and resumed identically to no-fault ref at both `729` and `2,187` with JS === WASM after every step.
- **Test 13 (7 Balanced-3^k Positive Controls):** `7/7` mutant switches caught (`unsigned_for_balanced, unsigned_one_level_only, bias_off_by_one, table_base_entry_zero, frame_zero_used, eaddr_in_c_space, vpage_zero_mapped`).
- **Test 15 (Real Browser Balanced-3^k):** Verified via Headless Chromium via Selenium WebDriver (offline data:text/html;base64 load of triton5.html running balanced-729 and balanced-2187): `0` console errors; both `balanced-729` and `balanced-2187` executed mapped frame `>= 1` read/write and NULL `-B` fault (`EADDR = -B`) in JS === WASM lockstep.

## 5. Measurements Across All Three MMU Designs (Instruments Only — No Recommendation)

### 5.1 Split Cost per Translation & Gate-Level Estimates

| Design | Page Size | Split Cost / Translation | Gate-Level Estimate | Estimation Method |
| :--- | ---: | :--- | :--- | :--- |
| `binary-4096` | `4,096` | `22` divider steps | `294` ternary gates | iterative 21-trit restoring divider (~14 ternary gates/trit x 21 trits, 22 steps; ~6,174 if unrolled) |
| `unsigned-729` | `729` | `16` carry-chain trits | `96` ternary gates | 16-trit balanced->unsigned borrow chain (~6 ternary gates/trit x 16 trits, depth 16) |
| `unsigned-2187` | `2,187` | `19` carry-chain trits | `114` ternary gates | 19-trit balanced->unsigned borrow chain (~6 ternary gates/trit x 19 trits, depth 19) |
| `balanced-729` | `729` | `0` balanced wire slice | `0` ternary gates | 0 gates: direct balanced-trit wire tap (low 6 trits = off, [6..10] = L1, [11..15] = L0) |
| `balanced-2187` | `2,187` | `0` balanced wire slice | `0` ternary gates | 0 gates: direct balanced-trit wire tap (low 7 trits = off, [7..12] = L1, [13..18] = L0) |

### 5.2 TritOS Desktop 2.0.1 (Seeded Mouse & Keyboard Input) + Synthetic Sparse Workload (Test 14, Measured)

All 5 configurations replayed the exact same TritOS Desktop 2.0.1 access stream (`44,870` accesses under seeded mouse/keyboard input) and synthetic sparse-address stream (`20,000` accesses across 32 sparse regions spanning `12,000,000` trytes) through the real Triton 5 hardware MMU (`64`-entry FIFO TLB).

| Workload | Design | Translations | Unique Pages | Walks | Walk Steps | Avg Steps / Walk | TLB Hit Rate | Total Split Cost | Table Memory (Trytes) |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `tritos_desktop_201` | `binary-4096` | `44,870` | `12` | `12` | `38` | `3.17` | `99.97%` | `987,140` | `6,144` |
| `tritos_desktop_201` | `unsigned-729` | `44,870` | `35` | `35` | `107` | `3.06` | `99.92%` | `717,920` | `2,916` |
| `tritos_desktop_201` | `unsigned-2187` | `44,870` | `18` | `18` | `56` | `3.11` | `99.96%` | `852,530` | `4,374` |
| `tritos_desktop_201` | `balanced-729` | `44,870` | `35` | `35` | `107` | `3.06` | `99.92%` | `0` | `2,187` |
| `tritos_desktop_201` | `balanced-2187` | `44,870` | `18` | `18` | `56` | `3.11` | `99.96%` | `0` | `6,561` |
| `sparse_synthetic` | `binary-4096` | `20,000` | `64` | `64` | `249` | `3.89` | `99.68%` | `440,000` | `12,288` |
| `sparse_synthetic` | `unsigned-729` | `20,000` | `230` | `7,248` | `14,916` | `2.06` | `63.76%` | `320,000` | `24,786` |
| `sparse_synthetic` | `unsigned-2187` | `20,000` | `99` | `2,442` | `5,059` | `2.07` | `87.79%` | `380,000` | `19,683` |
| `sparse_synthetic` | `balanced-729` | `20,000` | `230` | `7,248` | `14,916` | `2.06` | `63.76%` | `0` | `24,057` |
| `sparse_synthetic` | `balanced-2187` | `20,000` | `99` | `2,442` | `5,059` | `2.07` | `87.79%` | `0` | `19,683` |

### 5.3 Stage 1 Synthetic Workloads (Test 8, Corrected Split-Cost Units)

| Workload | Page Size | Accesses | Table Walks | Walk Steps | TLB Hit Rate | Split Cost (Corrected Units) | Table Memory (Trytes) | COW Faults |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `sequential_sweep` | `729` | `40,000` | `165` | `495` | `99.59%` | `640,000` (carry trits) | `1,458` | `0` |
| `sequential_sweep` | `2187` | `40,000` | `55` | `165` | `99.86%` | `760,000` (carry trits) | `4,374` | `0` |
| `sequential_sweep` | `4096` | `40,000` | `30` | `90` | `99.92%` | `880,000` (div steps) | `6,144` | `0` |
| `random_access` | `729` | `20,000` | `17,435` | `35,729` | `12.83%` | `320,000` (carry trits) | `2,916` | `0` |
| `random_access` | `2187` | `20,000` | `12,186` | `24,655` | `39.07%` | `380,000` (carry trits) | `4,374` | `0` |
| `random_access` | `4096` | `20,000` | `5,375` | `10,898` | `73.13%` | `440,000` (div steps) | `6,144` | `0` |
| `fork_cow` | `729` | `8,000` | `5,147` | `10,602` | `36.86%` | `130,432` (carry trits) | `1,458` | `152` |
| `fork_cow` | `2187` | `8,000` | `184` | `474` | `97.72%` | `153,045` (carry trits) | `4,374` | `55` |
| `fork_cow` | `4096` | `8,000` | `60` | `178` | `99.25%` | `176,660` (div steps) | `6,144` | `30` |
| `tlb_thrash` | `729` | `12,800` | `12,800` | `25,728` | `0.00%` | `204,800` (carry trits) | `1,458` | `0` |
| `tlb_thrash` | `2187` | `12,800` | `12,800` | `25,728` | `0.00%` | `243,200` (carry trits) | `4,374` | `0` |
| `tlb_thrash` | `4096` | `12,800` | `12,800` | `25,728` | `0.00%` | `281,600` (div steps) | `6,144` | `0` |
