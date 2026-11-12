# TritOS Desktop 1.0 Verification & Engineering Report (`REPORT.md`)

*All tables and metrics in this report are generated programmatically by `generate_docs.js` and `tests/desktop-run-all.js`.*

## 1. Component Code Size Breakdown

| Component | Address Range (Trytes) | Size (Trytes) | Execution Mode |
| :--- | :--- | :--- | :--- |
| Stage-0 DMA Bootloader (`boot_reset`) | `0 .. 15` | `16` | Supervisor (`PRIV=0`) |
| Kernel Core, Scheduler, IRQs & Syscalls | `16 .. 1909` | `1894` | Supervisor (`PRIV=0`) |
| Window Manager & Scanline Compositor | `1910 .. 4391` | `2482` | Supervisor (`PRIV=0`) |
| Block-Disk File System & App Registry | `4392 .. 5243` | `852` | Supervisor (`PRIV=0`) |
| 8×8 Bitmap Font (`font_8x8`, 64 glyphs) | `5244 .. 5755` | `512` | Supervisor Data |
| App 0: Terminal Shell (`app0_term_rom`) | `23473 .. 23994` | `522` | User (`PRIV=1`, `PROT_EN=1`) |
| App 1: Text Editor (`app1_edit_rom`) | `20415 .. 20832` | `418` | User (`PRIV=1`, `PROT_EN=1`) |
| App 2: Paint 729 (`app2_paint_rom`) | `20833 .. 21226` | `394` | User (`PRIV=1`, `PROT_EN=1`) |
| App 3: Live Clock (`app3_clock_rom`) | `19683 .. 19846` | `164` | User (`PRIV=1`, `PROT_EN=1`) |
| App 4: In-Guest Assembler (`app4_asm_rom`) | `21227 .. 23472` | `2246` | User (`PRIV=1`, `PROT_EN=1`) |
| App 5: Trit Calculator (`app5_calc_rom`) | `19847 .. 20414` | `568` | User (`PRIV=1`, `PROT_EN=1`) |
| **Total Assembled OS Image** | `0 .. 23994` | **`23995`** | Supervisor + 6 User Tasks |

## 2. Measured Frame, Redraw & Scheduling Costs (in Virtual Clock Steps)

| Operation / Measurement | Virtual Clock Steps | Trytes Written to VRAM | Fraction of Full Screen (`354,294`) |
| :--- | :--- | :--- | :--- |
| Cold Boot (DMA Load + FS Format + Wallpaper + 2 Windows) | `279,604` | `79,236` (after Port 5 clear) | `22.36%` |
| Mouse Cursor Move (Old `6×6` + New `6×6` Damage Rects) | `2043` | `72` | `0.02%` |
| Paint Single-Pixel Stroke Flush (`1×1` Damage Rect) | `134` | `1` | `0.0003%` |
| Clock Tick Display Refresh (Two `128×8` Damage Rects) | `4,812` | `2,048` | `0.58%` |
| Window Move (`180×110` Old + New Damage Rects) | `84,210` | `39,600` (`19,800` per rect) | `5.59%` per rect |
| Timer Preemption Quantum (`Port 9 = TIMER_PERIOD`) | `2,500` | `0` | — |

## 3. Self-Hosting Size Reached

| Target Assembled Inside Guest User-Mode Assembler App (`App 4`) | Source Size (Chars) | Emitted Code Size (Trytes) | Diffs vs. Host JS Assembler |
| :--- | :--- | :--- | :--- |
| Standalone Windowed User App (`DEMO.ASM` on Disk) | `114` | `18` | `0` (Byte-for-Byte Identical, Launched & Ran) |
| Complete TritOS 3.0 Operating System (`TRITOS3_SRC` via LBA 1..38) | `26,627` | `4,474` | `0` (Byte-for-Byte Identical) |

## 4. Verification Suite Results (`node tests/desktop-run-all.js`)

| Test Suite | Status | Verified Metrics & Outputs |
| :--- | :--- | :--- |
| `01-machine-integrity` | **PASS** | sha256="e8b8fa5e7ce96e705eba7f7985b5e0008d72b4ae8ac9c1fa4a1ff7e814175456" |
| `02-determinism-differential` | **PASS** | events=2000, stateHash="0x6ee03a4c", fbHash="0x2d8aa4c5", lockstepChecks=6 |
| `03-preemption-fairness` | **PASS** | clockDelta=375604, cursorDeltaX=15, slices=[50,18,40], stepsPerSlice=2500 |
| `04-fault-isolation` | **PASS** | csumBefore=1417955584, csumAfter=1417955584, intact=true, trapCount=4, causes=[3,2,5,3] |
| `05-filesystem` | **PASS** | persistedFiles=4, countAfterDelete=3, diskFullRejected=true, diskBytes=3188646 |
| `06-windowing-damage-redraw` | **PASS** | vacatedPx=-280, overlapPx=-340, clockPx=-320, lastRedrawTrytes=19800, fullScreenTrytes=354294 |
| `07-apps` | **PASS** | editorSaved="HELLO TRITOS!", paintStrokePx=364, calcExpressionsVerified=100 |
| `08-self-hosting` | **PASS** | demoAppTrytes=18, fullOsSourceChars=26627, fullOsTrytes=4474, diffs=0 |
| `09-positive-controls` | **PASS** | protectionOffCorrupted=true, timerOffFrozen=true, pixelPerturbationCaught=true |
| `10-static-scan` | **PASS** | inlineBlocksLabeled=4 |
| `11-browser` | **PASS** | pageErrors=0, screenshot="/working_dir/c_d48e23af370d973a/artifacts/file_generation/ttl=63d/output/tritos-desktop-screenshot.png", dbgPreview=["CORE: WASM ONLY","STATE HASH: 0x90e55d7f","STEPS: 12940000  PRIV: SUP"] |

## 5. Known Machine Bugs (`AUDIT-3.0.md`) & Unmet / Conflicting Requirements

- **Audit Bugs Respected**: All guest addresses in TritOS Desktop 1.0 are kept below `1,350,000` trytes (and MMIO `15,000,000 .. 15,354,293`), well below the $2^{32}$ WASM address-wrapping threshold documented in `AUDIT-3.0.md`. No test or desktop feature depends on `getConsoleOut()`.
- **Unmet or Failing Requirements**: None (`11/11` test suites pass, including all 3 positive controls and the headless Chromium browser run with `0` page errors and screenshot `tritos-desktop-screenshot.png`).
