# Triton 3.1 Patch Log (`CHANGES-3.1.md`)

**ConsciousNode SoftWorks · November 2026**

This document lists every change made in the Triton 3.1 patch relative to Triton 3.0 (`commit 79f84f4`), the reason for each change, and the complete audit of narrow architected state fields found and widened in `TritonWASM` / `TRITON_WAT`.

## 1. Complete Audit of Narrow Architected State in `TritonWASM` (Requirement F1)

In Triton 3.0, general-purpose registers `R0..R8` were stored as three 9-trit trytes (`w0, w1, w2`), which held all 27 trits, **but** scalar conversions (`$get_word_num`, `$set_word_num`), effective addresses, program/stack pointers, special-purpose registers (SPRs), device registers, and the virtual-clock step counter in `TRITON_WAT` and `TritonWASM` used 32-bit signed integers (`i32`). Because a 27-trit balanced-ternary word spans $[-\frac{3^{27}-1}{2}, +\frac{3^{27}-1}{2}] = [-3,812,798,742,493, +3,812,798,742,493]$, any value outside $[-2^{31}, 2^{31}-1]$ wrapped modulo $2^{32}$ in the WASM engine.

Every piece of architected state in the WASM core was audited against `ISA-3.md` and `TritonJS`. Below is the complete list of narrow fields and calculation paths found and what was done with each:

| # | Architected Field / Path | 3.0 WASM Representation | Architected Width (`ISA-3.md` / `TritonJS`) | Action Taken in Triton 3.1 | Exercised By |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`$get_word_num` & `$set_word_num`** | `i32` scalar conversion of `(w0, w1, w2)` | 27-trit word ($\pm 3,812,798,742,493$) | Widened to `i64` using `$bal_rem64` and `$bal_quot64` modulo $3^{27}$ (`7625597484987`) and $3^9$ (`19683`) | `audit/t3-badaddr-probes.js`, `t3-01`, `t3-02` |
| 2 | **T3 Effective Addresses (`EA`)** (`LT`/`LDX`, `ST`/`STX`, `LW`/`LWX`, `SW`/`SWX`, `JR`, `JALR`, `BCOPY`, `BFILL`, parcel fetch) | `i32` (`$addr`, `$src`, `$cnt` in `$step`, `$check_read_t3`, `$check_write_t3`, `$check_write_word_t3`) | 27-trit word | Widened all address locals, parameters, protection checks (`[UBASE, ULIMIT)`), MMIO framebuffer checks (`[15000000, 15354294)`), and physical RAM checks (`[0, RamSize)`) to `i64` | `audit/t3-badaddr-probes.js`, `audit/t3-protection-probes.js`, `t3-01`, `t3-02` |
| 3 | **`PC` (Program Counter)** | `i32` at byte `82176` (`i32[20544]`) | 27-trit word in T3; 9-trit tryte in T2 | Widened to `i64` at byte `83456` (`$load_pc` / `$store_pc` and `TritonWASM.pc` getter/setter), plus 64-bit return-PC decomposition in `CALL` (`29`) and `CALLX` (`48`) and 64-bit reconstruction in `RET` (`30`) | `t3-01`, `t3-02` |
| 4 | **`SP` (Stack Pointer)** | `i32` at byte `82180` (`i32[20545]`) | 27-trit word in T3; 9-trit tryte in T2 | Widened to `i64` at byte `83464` (`$load_sp` / `$store_sp` and `TritonWASM.sp` getter/setter) across `PUSH`, `POP`, `CALL`, `CALLX`, `RET`, `IRET`, and trap entry | `t3-01`, `t3-02`, `t3-04` |
| 5 | **`SPR[5]` `VBR` (Vector Base Register)** | `i32` at byte `82260` (`i32[20565]`) | 27-trit word | Widened to `i64` at byte `83480`; vector table offset `VBR + vec * 3` computed and bounds-checked in `i64` | `t3-04` |
| 6 | **`SPR[6]` `UBASE` (User Base Register)** | `i32` at byte `82264` (`i32[20566]`) | 27-trit word | Widened to `i64` at byte `83488`; compared against 64-bit effective addresses in `$check_read_t3`, `$check_write_t3`, `$check_write_word_t3` | `t3-01`, `t3-04`, `audit/t3-protection-probes.js` |
| 7 | **`SPR[7]` `ULIMIT` (User Limit Register)** | `i32` at byte `82268` (`i32[20567]`) | 27-trit word | Widened to `i64` at byte `83496`; compared against 64-bit effective addresses in `$check_read_t3`, `$check_write_t3`, `$check_write_word_t3` | `t3-01`, `t3-04`, `audit/t3-protection-probes.js` |
| 8 | **`SPR[9]` `EPC` (Exception Program Counter)** | `i32` at byte `82276` (`i32[20569]`) | 27-trit word | Widened to `i64` at byte `83504` on trap entry, `IRET`, `MFSPR`, and `MTSPR` | `t3-01`, `t3-02`, `t3-04` |
| 9 | **`SPR[10]` `ESP` (Exception Stack Pointer)** | `i32` at byte `82280` (`i32[20570]`) | 27-trit word | Widened to `i64` at byte `83512` on trap entry, `IRET`, `MFSPR`, and `MTSPR` | `t3-01`, `t3-04` |
| 10 | **`SPR[11]` `ESR` (Exception Status Register)** | `i32` at byte `82284` (`i32[20571]`) | 5-trit status word (`MTSPR`/`MFSPR` accept 27-trit word) | Widened to `i64` at byte `83520`; `IRET` unpacks low 5 trits via `$bal_rem64`/`$bal_quot64` | `t3-04`, `t3-05` |
| 11 | **`SPR[12]` `ECAUSE` (Exception Cause)** | `i32` at byte `82288` (`i32[20572]`) | Vector index or `imm9` (`MTSPR`/`MFSPR` accept 27-trit word) | Widened to `i64` at byte `83528` | `audit/t3-badaddr-probes.js`, `t3-01`, `t3-04` |
| 12 | **`SPR[13]` `EADDR` (Exception Faulting Address)** | `i32` at byte `82292` (`i32[20573]`) | 27-trit word | Widened to `i64` at byte `83536`; stores full 27-trit faulting address on `PROT_VIOL` and `BAD_ADDR` | `audit/t3-badaddr-probes.js`, `t3-01`, `t3-02`, `t3-04` |
| 13 | **`SPR[14]` `KSP` (Kernel Stack Pointer)** | `i32` at byte `82296` (`i32[20574]`) | 27-trit word | Widened to `i64` at byte `83544`; non-zero check and stack swap on user-to-supervisor trap performed in `i64` | `t3-04` |
| 14 | **Boolean SPRs (`MODE` `0`, `PRIV` `1`, `IE` `2`, `PROT_EN` `8`, `TRAP_DIV0` `15`) on `MTSPR`** | `i32` truthiness test on `$val` | Non-zero test on full 27-trit `R[rs1]` | Changed `$set_spr` to test `(i64.ne $val (i64.const 0))` so non-zero multiples of $2^{32}$ evaluate to `1` | `t3-04` |
| 15 | **`Steps` / Port 6 Virtual Clock Counter in T3 Mode** | `i32` at byte `82200` (`i32[20550]`) | 27-trit word on Port 6 `IN` (unbounded step counter) | Widened to `i64` at byte `83472`; incremented in `i64` on every step and decomposed into 27-trit `R[rd]` on Port 6 `IN` in T3 mode | `t3-05` ($\ge 2^{31} + 10^6$ steps) |
| 16 | **`TimerPeriod` (Port 9) & `TimerCount`** | `i32` at bytes `82316, 82320` (`i32[20579..20580]`) | 27-trit word | Widened `TimerPeriod` (`83552`) and `TimerCount` (`83560`) to `i64` in Port 9 `IN`/`OUT` and per-step timer comparison | `t3-05` |
| 17 | **`DiskLba` (Port 17), `DiskDmaAddr` (Port 18), `DiskCount` (Port 19) & DMA Bounds** | `i32` at bytes `82360..82368` (`i32[20590..20592]`) | 27-trit words | Widened `DiskLba` (`83568`), `DiskDmaAddr` (`83576`), `DiskCount` (`83584`), and all DMA bounds calculations (`lba + cnt`, `cnt * 729`, `dma + cnt * 729`) to `i64` | `t3-06` |
| 18 | **Stream `DiskAddr` (Port 7) & StudioNet `NetTxLen` (Port 24)** | `i32` `$full` before `% DiskSize` on Port 7 `OUT`; `i32` `$full` range check `12..512` on Port 24 `OUT` | 27-trit word input `R[rd]` | Widened `DiskAddr` (`83592`) and Port 7 modulo reduction to `i64`; widened Port 24 `12 <= full <= 512` check to `i64` | `t3-06`, `t3-08` |

All other fields in WASM linear memory (`SF`, `CF`, `OF`, `Halted`, `DisplayX`, `DisplayY`, `DisplayCmd`, `TimerTicks` [9-trit T2 counter], `IMask`, `IPend`, `DiskStatus`, `DiskErr`, `NodeId`, `NetTxLen`, `NetRxLen`, `NetRxPos`, and the 9-trit tryte cells of `R0..R8`) have architected widths $\le 9$ trits (`[-9841, +9841]`) and fit losslessly in `i32`.

## 2. File-by-File List of Changes and Reasons

### 2.1 `triton3.html`

1. **`[INLINE 3/7]` MicroWAT 2.0.0 Assembler**:
   - *Change*: Added the remaining WebAssembly 1.0 `i64` comparison (`i64.eqz` `0x50` through `i64.ge_u` `0x5A`), division/remainder (`i64.div_s` `0x7F` through `i64.rem_u` `0x82`), and bitwise/shift (`i64.and` `0x83` through `i64.shr_u` `0x88`) opcodes to `OPS`.
   - *Reason*: Needed by `TRITON_WAT` to perform full 64-bit address bounds checks, balanced-ternary modulo/quotient decomposition (`$bal_rem64`, `$bal_quot64`), and 64-bit division (`$alu_divmod`).
2. **`[INLINE 4/7]` `TRITON_WAT` & `TritonWASM` — Full-Width 64-Bit State (F1)**:
   - *Change*: Added 8-byte-aligned `i64` storage at bytes `83456..83599` for `PC`, `SP`, `Steps`, `VBR`, `UBASE`, `ULIMIT`, `EPC`, `ESP`, `ESR`, `ECAUSE`, `EADDR`, `KSP`, `TimerPeriod`, `TimerCount`, `DiskLba`, `DiskDmaAddr`, `DiskCount`, and `DiskAddr`. Widened all effective address computations, bounds checks, SPR reads/writes, DMA checks, and virtual clock counters in `TRITON_WAT` and `TritonWASM` getters/setters to `i64`.
   - *Reason*: Fixes Audit Finding 1 (`t3-badaddr-probes.js`), preventing addresses $\ge 2^{31}$ from wrapping silently into low memory or truncating `EADDR`.
3. **`[INLINE 4/7]` `TRITON_WAT` & `TritonWASM` — Unlimited Console Output & Extended Input Queue (F2)**:
   - *Change*: Added `$log_console` in `TRITON_WAT` writing Port 0 and Port 1 `OUT` events to a dedicated 8,192-entry Console Flush Buffer at bytes `573440..704512` (`ConsoleBufLen` at byte `82412` / `i32[20603]`), paused `$run` batches when `ConsoleBufLen >= 8192`, and added `TritonWASM.prototype._drainConsoleBuf()` called in `_syncHostTriggers()` and `getConsoleOut()` to append directly into `this.consoleAcc`. Extended `pushInputChar` / `$read_input_char` with a 65,536-entry overflow buffer at bytes `704512..966656` for `tail >= 4096`. Kept `IOTrace` (`i32[20556]`) capped at 10,900 events.
   - *Reason*: Fixes Audit Finding 2 (`t3-console-cap.js 400`), ensuring `TritonWASM.getConsoleOut()` never runs out regardless of session length while keeping `IOTrace` at its 10,900-event cap and preventing long `pushInputString` sessions from overflowing the 4,096-entry low input queue into the T2 disk mirror at `i32[25600]`.
4. **`[INLINE 4/7]` & `[INLINE 7/7]` Positive-Control Option `narrowWasmState` & Shared `fastForward` Option (Tests 3 & 5)**:
   - *Change*: Added machine option `narrowWasmState: true` (default `false`, stored at byte `82408` / `i32[20602]`, also configurable via `TritonSystem.setNarrowWasmState`) that reintroduces 32-bit signed truncation via `$maybe_narrow` and trace-derived console reconstruction in `getConsoleOut()`. Added `fastForward: true` option on both `TritonJS` and `TritonWASM` for tight countdown loops, and extended `computeStateHash` to mix the upper 32 bits of any state value outside `[-2^31, 2^31 - 1]`. Wrapped the top-level `<script>` in an IIFE and added a 19,683-entry instruction decode lookup table in `TritonJS` to avoid Node `vm.Context` global proxy overhead.
   - *Reason*: Required by Test 3 (long-run counters $\ge 2^{31} + 10^6$ steps) and Test 5 (positive controls proving Tests 1, 2, and 4 fail when 3.0 behavior is reintroduced).

### 2.2 `tests/` and Documentation

1. **`tests/t3-common.js` & `tests/t3-generate-docs.js` (F3)**:
   - *Change*: Removed all `/working_dir/...` hardcoded paths and resolved all file paths relative to `path.resolve(__dirname, '..')`. Updated `tests/t3-generate-docs.js` to write `ISA-3.md` and `REPORT-3.md` into the repo root.
   - *Reason*: Satisfies Requirement F3.
2. **`tests/t3-11-browser.js` & `tests/t3-run-all.js` (F3)**:
   - *Change*: Updated `tests/t3-11-browser.js` to try Playwright (Node or Python) and Selenium WebDriver, and if neither can launch a browser, print `SKIPPED: <reason>` and exit `0`. Updated `tests/t3-run-all.js` to parse `SKIPPED:` and report `passed`, `failed`, and `skipped` counts without ever reporting a skipped suite as passed.
   - *Reason*: Satisfies Requirement F3.
3. **`tests/t3-01-oracle.js`, `tests/t3-02-fuzz.js`, `tests/t3-04-protection.js`, `tests/t3-05-interrupts.js`, `tests/t3-06-disk.js`, `tests/t3-08-devices.js`, `tests/t3-09-state.js` (Tests 1–5)**:
   - *Change*: Extended `t3-01` with full 27-trit large-address loads, stores, jumps, `BCOPY`, and `BFILL` in Supervisor and User mode; updated `t3-02` so 25% (`2,500 / 10,000`) of fuzz programs build addresses $\ge 2^{31}$ via `LMI`/`LHI`/`ADDM`/`ADDH`; added full 27-trit SPR checks to `t3-04`; added $\ge 2^{31} + 10^6$-step tight-loop counter and Port 6 verification to `t3-05`; added $\ge 2^{32}$ DMA/disk/NIC register checks to `t3-06` and `t3-08`; added `1,005`-command / `50,746`-char console verification to `t3-09`; and added `narrowWasmState: true` positive controls to `t3-01`, `t3-02`, `t3-05`, and `t3-09`.
   - *Reason*: Satisfies Tests 1–6 and ensures every fixed field is exercised by an automated test.
