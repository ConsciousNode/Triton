# Triton 4 & TritOS Desktop 2.0 — Engineering & Verification Report (`REPORT.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT · **Architecture:** Triton 4 (`archMode = 'T3'`, 27-trit Balanced Ternary)

---

## 1. Exact Tested Files, Byte Sizes & SHA-256 Digests

All machine and desktop verification suites (`node tests/t4-run-all.js` → `triton/tests/t4-test-results.log` and `node desktop/tests/d20-run-all.js` → `triton/desktop/tests/d20-test-results.log`) were executed directly against the final shipped files listed below (with zero test-only hooks in `guest-200.asm` or `tritos-desktop-2.html`):

| File Path in Repository | UTF-8 Bytes (`Buffer.byteLength`) | UTF-16 Code Units (`str.length`) | Full-File SHA-256 | Machine Block SHA-256 |
|---|---:|---:|---|---|
| `triton/triton4.html` | `369,358` | `368,863` | `7550b1df8284c292d4accf84708f2f471a00574cca9f908e06d52b8cc2fce801` | Inner (`m[1] + "\n"`): `e1a62b1564dd228a518c1621c26a70b6bf6437b1b497aa5a0584cd916084b71b`<br>Marker-inclusive (`m[0]`): `db4c011ecb9a0f166eeef162ec26483ca0aeb9d3553cb11358af9a1fb5b77529` |
| `triton/desktop/tritos-desktop-2.html` | `879,934` | `879,443` | `cf316b654d2658a12b4a34d5973225c1c9d590da72cdd162587f8c21b2783bf6` | Inner (`m[1] + "\n"`): `e1a62b1564dd228a518c1621c26a70b6bf6437b1b497aa5a0584cd916084b71b`<br>Marker-inclusive (`m[0]`): `db4c011ecb9a0f166eeef162ec26483ca0aeb9d3553cb11358af9a1fb5b77529` |
| `triton/ISA-4.md` | `22,399` | `22,390` | `4f31a15e24b96c47b080ae0514b13a7757dfa3b640e6b4df6fced809be4524b3` | N/A |
| `triton/desktop/guest-200.asm` | `494,362` | `494,353` | `a594883bccea68ce6624abfb20b7d854b857615a06728e391398d8c32e84cf8a` | N/A (`75,089` assembled trytes = `104` sectors) |
| `triton/desktop/build_desktop2.js` | `9,694` | `9,692` | `f15895cf1c672c87e3054eece1e8115fbaee3a0d6ae9f3424c15278df5f17ecb` | N/A |

### User-Mode Cartridge Test Driver & Clock `HH:MM:SS` Display
1. **Zero Test-Only Code in Shipped OS:** `fs_check_unit26_rpc` has been completely removed from `triton/desktop/guest-200.asm` and `triton/desktop/tritos-desktop-2.html` (verified by static scan in `d20-07-no-regressions.js`). All `d20` tests (`d20-01`..`d20-07`) are driven through a normal user-mode test application (`D20_AGENT_ASM` in `triton/desktop/tests/d20-common.js`) placed on a TritFS v2 cartridge (`2:/apps/AGENT/main`), launched via App Shelf (`App 14`) using mouse and key events, executing user-mode `SYSCALL #50..#65`, and reading/writing standard TritFS v2 files (`26:/rdy`, `26:/cmd`, `26:/res`, `26:/done`) on Unit `26`.
2. **Readable `HH:MM:SS` Clock Display (`App 3`):** The Clock app (`app3_clock_rom`) reads `RTC_SECONDS` (`Port 32` via `SYSCALL #62`), computes `sec_of_day = ((RTC_SECONDS % 86400) + 86400) % 86400`, and renders a zero-padded `HH:MM:SS` string on Row 2 (`UTC: HH:MM:SS` at client `(40, 26)` / screen `(561, 50)`) alongside `DEC:` ms on Row 1 (`client (40, 8)` / screen `(561, 32)`).

---

## 2. Specific Technical Questions & Analyses

### 2.1 Does `fsck` of a $3^{13}$-Sector Unit Fit in `4,194,304` Trytes of Real Hardware RAM?

**No.** On a $3^{13} = 1,594,323$-sector unit, `DRIVER fs v2`'s in-memory `fsck` uses two generation-stamped per-sector tables of $3^{13} = 1,594,323$ trytes each (`1` tryte per sector):
- **`FS_FSCK_STACK` (`Bank 80`):** `1,574,640 .. 1,594,322` (`19,683` trytes)
- **`FSCK_OWNER_BASE` (`Banks 81..161`):** `1,594,323 .. 3,188,645` (`1,594,323` trytes = $3^{13}$)
- **`FSCK_SEEN_BASE` (`Banks 162..242`):** `3,188,646 .. 4,782,968` (`1,594,323` trytes = $3^{13}$)

In the software emulator (`T3_DEFAULT_RAM_SIZE = 4,782,969` trytes = $3^{14}$, addresses `0 .. 4,782,968`), `FSCK_SEEN_BASE` fits right up to the final tryte of RAM (`4,782,968`). However, on real hardware with **`4,194,304` ($2^{22}$) trytes of RAM** (valid physical addresses `0 .. 4,194,303`):
1. `FSCK_OWNER_BASE` (`1,594,323 .. 3,188,645`) fits below `4,194,304`.
2. `FSCK_SEEN_BASE` (`3,188,646 .. 4,782,968`) **does not fit**: it overflows `4,194,303` by **`588,665` trytes** (only `1,005,658` trytes remain between `3,188,646` and `4,194,303`, so any sector index $s \ge 1,005,658$ on a $3^{13}$-sector unit addresses past `4,194,303`).
3. Even if both tables were relocated lower in RAM, two uncompressed 1-tryte-per-sector tables (`2 × 1,594,323 = 3,188,646` trytes) plus the `1,456,542` trytes below Bank `74` (kernel, user tasks, and window buffers) require `4,645,188` trytes (`> 4,194,304`). Units of size $3^7 = 2,187$ sectors and $3^{10} = 59,049$ sectors (`FSCK_SEEN_BASE` top = `3,188,646 + 59,048 = 3,247,694 < 4,194,304`) fit within `4,194,304` trytes of RAM, whereas a full $3^{13} = 1,594,323$-sector `fsck` does not fit in `4,194,304` trytes under this two-table layout.

### 2.2 Measured `fsck` Cost

In `DRIVER fs v2` (`drv_fs_fsck_impl`), `fsck` cost has three distinct components:
1. **Table Clear — Constant-Time:** Incrementing the 27-trit generation stamp `K_FSCK_GEN` at `1,457,945` (`1` word read/add/write, `0` trytes zeroed in `FSCK_OWNER_BASE` or `FSCK_SEEN_BASE`).
2. **Directory Tree & SLT Chain Walk — Linear in Sectors Used (`O(used_sectors)`):** Visits each reserved sector `0 .. sysEnd - 1` (`1 + ceil(total_sectors / 243)` sectors) and walks each allocated directory and file chain from `sb.root`, reading SLT entries through the 16-page SLT cache (`FS_SLT_DATA`, with last-hit slot fast-path `SLT_LAST_HIT` at `1,457,943`) and stamping `FSCK_OWNER_BASE[s] = K_FSCK_GEN` and `FSCK_SEEN_BASE[s] = K_CHAIN_GEN`.
3. **Orphan Scan — Linear in Total Sectors (`O(total_sectors)`):** Scans `s = sysEnd .. total_sectors - 1` across `slt_len = ceil(total_sectors / 243)` SLT sectors to check whether any sector with `SLT[s] != 0` (`L_FREE`) and `SLT[s] != -2` (`L_BAD`) has `FSCK_OWNER_BASE[s] != K_FSCK_GEN`.

### 2.3 Full Desktop 2.0 Memory Map, `fsck` Tables vs. Window Buffers, and Running `fsck` With Windows Open

| Physical Tryte Range | Bank(s) (`19,683` trytes/bank) | Size (Trytes) | Region |
|---|---|---:|---|
| `0 .. 5,777` | Bank `0` | `5,778` | Stage-0 Bootloader (`DRIVER disk v2`), `kernel_boot_entry`, `DRIVER timer v2`, `DRIVER keyboard v1`, `DRIVER mouse v1`, `syscall_handler`, Scheduler, Window Manager, `DRIVER framebuffer v1`, Legacy `0:/` `fs_init`/`fs_find`/`fs_write` (`FW_EXIT + 18 = 5,778 <= 5,800`) |
| `5,800 .. 8,928` | Bank `0` | `3,129` | Kernel BSS: Trap/IRQ Vectors `0..12` (`5,800..5,838`), Globals (`5,840..5,899`), 8 TCBs (`6,000..6,511`), 8 Event Queues (`6,512..7,023`), Legacy `0:/` Dir Buffer (`7,100..7,828`), Scanline Buffer (`7,900..8,628`), Window Table (`8,700..8,891`), Z-Order & Cursor (`8,900..8,928`) |
| `8,930 .. 9,435` | Bank `0` | `506` | Mid Kernel: `fs_norm_name`, `fs_read`, `fs_delete`, `app_rom_table` (`Apps 0..14`), Kernel Strings (`END_OF_CORE_KERNEL = 9,436 <= 9,460`) |
| `9,460 .. 17,999` | Bank `0` | `8,540` | `DRIVER net v3` Entry Table, Strings, BSS (`9,700..9,799`), Supervisor Stack (`9,805..10,190`), `DRIVER net v3` Implementation & Queues (`10,200..17,999`) |
| `18,000 .. 19,592` | Bank `0` | `1,593` | 9×9 Font Glyphs (`18,000..18,863`) & Boot Splash (`18,864..19,592`) |
| `19,683 .. 58,950` | Banks `1 .. 2` | `39,268` | Bundled User App ROMs (`Apps 0..11`) & `str_file_demo_asm` |
| `59,049 .. 65,000` | Bank `3` | `5,952` | `K_SFP_BUF` (StudioNet file transfer scratch) |
| `65,100 .. 65,373` | Bank `3` | `274` | Kernel 2.0 Far-Call Bridge (`k_fs2_boot_init`, `k_fs2_poll_media`, `k_fs2_fast_fault`, `k_fs2_draw_tb_row2`, `k_fs2_syscall_dispatch` `#50..#65`) |
| `65,400 .. 75,088` | Bank `3` | `9,689` | `DRIVER fs v2` (`65,400..71,949`) & Bundled 2.0 App ROMs (`App 12` Files, `App 13` Disks, `App 14` App Shelf, `71,950..75,088`; `104` sectors total) |
| `196,830 .. 826,685` | Banks `10 .. 41` | `629,856` | 8 User-Mode Task Segments (`Slot i = 0..7`: `UBASE = (10 + 2*i) * 19,683`, `ULIMIT = UBASE + 39,366`) |
| `866,052 .. 885,734` | Bank `44` | `19,683` | StudioNet SRRP Buffer (`K_SRRP_BUF`) |
| `1,023,516 .. 1,338,443` | **Banks `52 .. 67`** | `314,928` | **8 Window Backing Pixel Buffers (`Win i = 0..7`: `(52 + 2*i) * 19,683`, `39,366` trytes/window)** |
| `1,377,810 .. 1,395,305` | Bank `70` | `17,496` | `TASKBAR_BUF` (`729 × 24`) |
| `1,397,493 .. 1,398,221` | Bank `71` | `729` | `FS_SEC_BUF` |
| `1,417,176 .. 1,456,541` | Banks `72 .. 73` | `39,366` | `K_SNS_PEERS` & StudioNet Scratch |
| `1,456,542 .. 1,574,639` | Banks `74 .. 79` | `118,098` | `DRIVER fs v2` Unit Table, 16-Page SLT Cache (`Bank 75`), `FS_DIR_WORK_BUF` (`Banks 76..77`), `FS_COPY_BUF` (`Banks 78..79`) |
| `1,574,640 .. 1,594,322` | **Bank `80`** | `19,683` | **`FS_FSCK_STACK` (`fsck` directory traversal stack)** |
| `1,594,323 .. 3,188,645` | **Banks `81 .. 161`** | `1,594,323` | **`FSCK_OWNER_BASE` ($3^{13}$ generation-stamped owner table)** |
| `3,188,646 .. 4,782,968` | **Banks `162 .. 242`** | `1,594,323` | **`FSCK_SEEN_BASE` ($3^{13}$ generation-stamped loop detector, top = `T3_DEFAULT_RAM_SIZE - 1`)** |
| `15,000,000 .. 15,354,293` | MMIO | `354,294` | `729 × 486` MMIO Framebuffer |

- **Can `fsck` Run With Windows Open?** **Yes.** Window backing buffers occupy `Banks 52..67` (`1,023,516 .. 1,338,443`) and user task segments occupy `Banks 10..41` (`196,830 .. 826,685`), whereas `DRIVER fs v2` and all `fsck` tables (`FS_FSCK_STACK`, `FSCK_OWNER_BASE`, `FSCK_SEEN_BASE`) reside in `Banks 74..242` (`1,456,542 .. 4,782,968`). Because these regions are completely disjoint, `fsck` runs with any number of desktop windows open without overwriting window pixels or task memory.

### 2.4 Far-Call Target Offset Verification (`addr - 59,049` within `±9,841`)

All far calls from the low kernel (`0 .. 9,435`) into Bank `3` (`59,049+`) use `LI Rx, #<target> - 59049; LMI Rx, #3`. Because `LI` encodes a signed 9-trit immediate (`[-9,841 .. +9,841]`), every far target must satisfy `|target - 59,049| <= 9,841` (`49,208 <= target <= 68,890`).
- Verified at build time in `triton/desktop/build_desktop2.js` and tested in `triton/desktop/tests/d20-01-tritfs-conformance.js` across `36` symbols (`farTargetsChecked: 36`, `maxAbsOffset: 6460 <= 9841`, `fwExitEnd: 5778 <= 5800`, `coreEnd: 9436 <= 9460`).

### 2.5 Exact State Hash Coverage (`computeStateHash` vs. SHA-256 Digest)

1. **`computeStateHash(vm)` (`triton4.html` lines `10052..10105`):**
   Computes a 64-bit FNV-1a digest (`fnv1a64Hex`, or 32-bit FNV-1a in `t3-common.js`) over:
   - **35 CPU, SPR, Timer, Display, and Disk DMA state fields (`35 × 4 = 140` bytes, `Int32LE` low 32 bits):** `pc`, `sp`, `sf`, `cf`, `of`, `halted`, `steps`, `displayX`, `displayY`, `displayCmd`, `diskAddr`, `timerTicks`, `archMode`, `priv`, `ie`, `imask`, `ipend`, `vbr`, `ubase`, `ulimit`, `protEn`, `epc`, `esp`, `esr`, `ecause`, `eaddr`, `ksp`, `trapDiv0`, `timerPeriod`, `timerCount`, `diskLba`, `diskDmaAddr`, `diskCount`, `diskStatus`, `diskErr`.
   - **All 9 General-Purpose 27-Trit Registers (`R0..R8`):** `27` trytes (`54` bytes, `Int16LE`).
   - **Low RAM `mem[0 .. 19,682]`:** first `19,683` trytes ($3^9$) of RAM (`39,366` bytes, `Int16LE`).
   - **Unit 0 Low Disk `disk[0 .. 19,682]`:** first `19,683` trytes (`27` sectors) of Unit `0` (`39,366` bytes, `Int16LE`).
   - **Low Framebuffer VRAM `vram[0 .. 59,048]`:** first `59,049` trytes ($3^{10}$) of VRAM (`118,098` bytes, `Int16LE`).
   - **Triton 4 Extended State (`4 × 4 = 16` bytes, `Int32LE`, appended only when `diskUnit !== 0 || timerMode !== 0 || rtcOffset !== 0`):** `diskUnit`, `timerMode`, `realTimeTicks`, `rtcOffset`.
2. **SHA-256 Machine Block Digest:**
   - Inner block (`m[1] + '\n'` between `//BEGIN_TRITON3_MACHINE_BLOCK\n` and `\n//END_TRITON3_MACHINE_BLOCK`): `e1a62b1564dd228a518c1621c26a70b6bf6437b1b497aa5a0584cd916084b71b`.
   - Marker-inclusive block (`m[0]` from `//BEGIN_TRITON3_MACHINE_BLOCK` through `//END_TRITON3_MACHINE_BLOCK`): `db4c011ecb9a0f166eeef162ec26483ca0aeb9d3553cb11358af9a1fb5b77529`.

---

## 3. Verbatim Test Suite Results

### 3.1 Triton 4 Machine Test Suite (`triton/tests/t4-test-results.log`)
```text
[PASS] t4-01-compat: 12/12 T3 suites pass on triton4.html; 56 programs (4,948 steps, incl. 50 seeded random) match T3.1.1 step-for-step (+ Port 29 positive control) in 345132 ms
[PASS] t4-02-js-wasm: JS === WASM step-for-step across 1,792 steps on unit, timer-mode 1, and RTC programs in 12474 ms
[PASS] t4-03-ports-units: Ports 28..32, DISK_ERR 4, DMA bounds on 3^7/3^10/3^13 units, IRQ_MEDIA insert/eject, changed bit clear-on-read, .tdisk/raw/HTML snapshot, and T2 isolation in 312 ms
[PASS] t4-04-timer-rtc: Mode 1 1,000 ms -> +200,000 ticks at both 10k & 1M steps; Mode 0 follows steps (9,996 & 999,996); RTC_SECONDS & offset verified in 772 ms
[PASS] t4-05-fault-browser: Power-cut fault injector (N=0..5, unit persistence + RAM wipe, JS === WASM) and headless Chromium Units panel UI (0 page errors) in 2340 ms
TRITON 4.0 MACHINE SUITE SUMMARY: 5 passed, 0 failed, 0 skipped (total 5)
```

### 3.2 TritOS Desktop 2.0 Test Suite (`triton/desktop/tests/d20-test-results.log`)
```text
[PASS] d20-01-tritfs-conformance.js: {"name":"d20-01-tritfs-conformance","status":"PASS","farCheck":{"farTargetsChecked":36,"maxAbsOffset":6460,"limit":9841,"fwExitEnd":5778,"coreEnd":9436},"guestToRef":[{"seed":101,"totalOps":500,"counts":{"mkdir":43,"write":219,"overwrite":90,"rename":57,"delete":45,"copy":46},"u1Files":176,"u2Files":44},{"seed":202,"totalOps":500,"counts":{"mkdir":32,"write":231,"overwrite":71,"rename":62,"delete":56,"copy":48},"u1Files":169,"u2Files":54},{"seed":303,"totalOps":500,"counts":{"mkdir":43,"write":206,"overwrite":77,"rename":66,"delete":63,"copy":45},"u1Files":159,"u2Files":29}],"refToGuest":[{"seed":404,"dirsChecked":11,"filesChecked":30},{"seed":505,"dirsChecked":11,"filesChecked":30},{"seed":606,"dirsChecked":11,"filesChecked":30}]}
[PASS] d20-02-scale.js: {"name":"d20-02-scale","status":"PASS","thousand":{"filesInFolder":1000,"dirSectors":38,"fsckClean":true},"tenLevels":{"depth":10,"deepPath":"1:/L1/L2/L3/L4/L5/L6/L7/L8/L9/L10/DEEPFILE","fsckClean":true},"unit3Pow13":{"totalSectors":1594323,"freeAfterFormat":1587761,"h1FirstSector":1000101,"h2FirstSector":1000106,"freeAfterDeleteAll":1587761,"fsckClean":true}}
[PASS] d20-03-power-cut.js: {"name":"d20-03-power-cut","status":"PASS","totalCutPointsTested":51,"operations":[{"operation":"write","cutPointsTested":10,"beforeStateCount":7,"afterStateCount":3,"orphansReclaimed":16},{"operation":"overwrite","cutPointsTested":15,"beforeStateCount":7,"afterStateCount":8,"orphansReclaimed":34},{"operation":"delete","cutPointsTested":10,"beforeStateCount":2,"afterStateCount":8,"orphansReclaimed":21},{"operation":"mkdir","cutPointsTested":7,"beforeStateCount":4,"afterStateCount":3,"orphansReclaimed":6},{"operation":"rename","cutPointsTested":9,"beforeStateCount":4,"afterStateCount":5,"orphansReclaimed":10}]}
[PASS] d20-04-positive-controls.js: {"name":"d20-04-positive-controls","status":"PASS","crossLinkCaught":true,"loopCaught":true,"orphanDetectedAndRepaired":true,"corruptedSuperblockRefused":true}
[PASS] d20-05-media-cartridge.js: {"name":"d20-05-media-cartridge","status":"PASS","mountedWithoutReboot":true,"iconPixelsFound":256,"appPixelsFound":2400,"installedToHome":true,"ejectedCopyFailedCleanly":true,"homeFsckClean":true}
[PASS] d20-06-legacy.js: {"name":"d20-06-legacy","status":"PASS","compat112":{"bootedOnTriton4":true,"stateHash":3983107044},"legacyCopy":{"filesCopied":2,"names":["HELLO","DEMO"]},"docFallback":{"savedTo1Docs":true,"fallbackToUnit0":true}}
[PASS] d20-07-no-regressions.js: {"name":"d20-07-no-regressions","status":"PASS","hygiene":{"machineBlockSha256":"db4c011ecb9a0f166eeef162ec26483ca0aeb9d3553cb11358af9a1fb5b77529","versionDefCount":1,"staleVersionCount":0,"d20TestFilesScanned":9,"driversVerified":["disk","framebuffer","fs","keyboard","mouse","net","timer"]},"rtc":{"timerMode":1,"expectedRtcSec":848234096,"fileMtime":848234097,"clockUtcStr":"12:34:59"},"regressionsPassed":20}
{"summary":{"passed":7,"failed":0,"total":7}}
```

---

## 4. Retired / External-Dependency 1.1.2 Tests

- **`desktop-01-integrity.js`, `desktop-19-driver-library.js`, `desktop-30-bugs-112.js`:** Hardcode `tritos-desktop.html` (1.1.2) machine block SHA-256 (`ffc89ac0...`), 6-driver 1.1.2 list (`disk v1`, `timer v1`, no `fs v2`), and `"TritOS Desktop 1.1.2"` version string. They continue to pass on the unchanged `triton/desktop/tritos-desktop.html` (1.1.2), and their 2.0 equivalents are verified in `d20-07-no-regressions.js`.
- **`desktop-18`, `22..24`, `28`, `31..35`, `37..38`:** Reference external sibling directories outside `triton4-spec.zip` (`../../studionet/studionet-ref.js`, `../../trytris/index.html`, `../../shared/deals-ref.js`, `../../fonts/times-new-thesuramos-9x9.tryte.asm`).
