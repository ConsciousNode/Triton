# TritOS Desktop 1.1.2 — Provenance of Inlined Blocks & Shared Helpers (LIFTS.md)

Every inlined block inside `triton/desktop/tritos-desktop.html` is labeled with `// [INLINE k/4]` comments and documented below:

1. **`// [INLINE 1/4] Triton 3.1.1 Machine Block`**
   - **Source**: `triton/triton3.html` lines 431–9663 (`//BEGIN_TRITON3_MACHINE_BLOCK` .. `//END_TRITON3_MACHINE_BLOCK`).
   - **SHA-256**: `ffc89ac07c9294bc3d746172633dd8d1479d5d361768223501dc73ab65ad2a5d` (unchanged).
2. **`// [INLINE 2/4] TritOS Desktop 1.1.2 Guest Assembly Source (TRITOS_DESKTOP_SRC)`**
   - **Source**: Adapted from `triton/desktop/tritos-desktop.html` (1.1.1), `asm-kernel-and-drivers.js`, and `asm-solitaire-and-blocks.js`, upgrading `DRIVER net v3` (SNS naming + SRRP windowed SACK transfer), `SYSCALL #9` (`SYS_GET_MS`), `TASKBAR_BUF` compositor fix, Paint drag clipping, F1..F12 keycodes `136..147`, App 6 Solitaire Suite (Klondike/FreeCell/Spider, `DEALCHK`, Move-Log Undo, FreeCell DFS solver), App 7 Trit Blocks, App 10 NET & Browser (`text/hts`, `image/t3-snap`, `POST` forms), `fonts/times-new-thesuramos-9x9.tryte.asm` (864 trytes, SHA-256 `552e462ce2e9489629d56aeb6e09852f8b69eb0f712b157bad75bfdb526928f2`), and rasterized `cnsw-mark.svg` boot splash (729 trytes).
3. **`// [INLINE 3/4] Standalone App 5 (Trit Calculator) Source & Boot Helpers`**
   - **Source**: Adapted from `triton/desktop/tritos-desktop.html` (1.1.1), exporting `TRITOS_VERSION = "TritOS Desktop 1.1.2"`, `RATE = 200`, `T3_FONT_9X9` (96×9 glyph array), `buildTritOSDesktopSource`, and `bootTritOSDesktop`.
4. **`// [INLINE 4/4] Host Framebuffer Canvas Plumbing, StudioNet BroadcastChannel & Read-Only Debug Panel`**
   - **Source**: Adapted from `triton/triton3.html` lines 9665–10043 and `triton/desktop/tritos-desktop.html` (1.1.1), adding real-time frame pacing (`Math.round(Math.min(elapsedMs, 100) * RATE)` at `RATE = 200` steps/ms), enqueue-only `keydown` with 30 ms per-key autorepeat debounce, and `F1..F12` mapped to `136..147`.
5. **Test Helper Update (`triton/desktop/tests/t3-common.js`, `// [INLINE] Shared loader...`)**
   - **Source**: Adapted from `triton/desktop/tests/t3-common.js` (1.1.1). Updated `getGlyphMap`, `readFbChar`, and `readFbString(vmInst, T, x, y, len, bgColor, uppercase = false)` to decode 9×9 balanced-tryte glyphs from `T.T3_FONT_9X9` (`+1` ink, `0` background, `-1` shadow `-358`) at a 9 px horizontal step, with character uppercasing made strictly opt-in (`uppercase = false` by default).


---

# TritOS Desktop 2.0 & Triton 4 — Provenance of Inlined Blocks (`tritos-desktop-2.html` & `triton4.html`)

Every inlined block inside `triton/triton4.html` and `triton/desktop/tritos-desktop-2.html` carries an explicit provenance comment and is cataloged below:

1. **`triton/triton4.html` Machine Block (`//BEGIN_TRITON3_MACHINE_BLOCK` .. `//END_TRITON3_MACHINE_BLOCK`)**
   - **Source**: Adapted from `triton/triton3.html` lines 431–9663 (ConsciousNode SoftWorks, Triton 3.1.1, MIT), adding Triton 4 Storage & Time (`Ports 28..32`, `Vector 12 = IRQ_MEDIA`, sparse `Unit` storage `0..26`, 200 kHz real-time `TIMER_MODE = 1`, `RTC_SECONDS`, `cutPowerAfterSectorWrites(N)` fault injector, `.tdisk`/raw export/import, and the Units UI panel).
   - **SHA-256**: `e1a62b1564dd228a518c1621c26a70b6bf6437b1b497aa5a0584cd916084b71b`.
2. **`triton/desktop/tritos-desktop-2.html` — `// [INLINE 1/4] Triton 4 Machine Block`**
   - **Source**: Inlined verbatim from `triton/triton4.html` (`//BEGIN_TRITON3_MACHINE_BLOCK` .. `//END_TRITON3_MACHINE_BLOCK`) by `triton/desktop/build_desktop2.js`.
   - **SHA-256**: `e1a62b1564dd228a518c1621c26a70b6bf6437b1b497aa5a0584cd916084b71b` (identical to `triton/triton4.html`).
3. **`triton/desktop/tritos-desktop-2.html` — `// [INLINE 2/4] TritOS Desktop 2.0 Guest Assembly Source (TRITOS_DESKTOP_SRC)`**
   - **Source**: Assembled from `triton/desktop/guest-200.asm` (`75,029` trytes = `103` sectors), adapted from `triton/desktop/tritos-desktop.html` (1.1.2) and extended with `DRIVER disk v2`, `DRIVER timer v2`, `DRIVER fs v2` (TritFS v2 Copy-on-Write filesystem driver in guest assembly with 16-page SLT cache and generation-stamped `fsck`), Path Syscalls `#50..#65`, `SYS_GET_RTC` (`#38`), `App 12` (Files), `App 13` (Disks), and `App 14` (App Shelf).
4. **`triton/desktop/tritos-desktop-2.html` — `// [INLINE 3/4] Standalone App 5 (Trit Calculator) Source & Boot Helpers`**
   - **Source**: Adapted from `triton/desktop/tritos-desktop.html` (1.1.2), defining `const TRITOS_VERSION = "TritOS Desktop 2.0"` once, `RATE = 200`, `T3_FONT_9X9`, `buildTritOSDesktopSource`, and `bootTritOSDesktop` (which loads the 103-sector kernel/app image onto Unit `0` and ensures default blank `59,049`-sector Unit `1` is present for first-boot `"HOME"` formatting).
5. **`triton/desktop/tritos-desktop-2.html` — `// [INLINE 4/4] Host Framebuffer Canvas Plumbing, StudioNet BroadcastChannel & Read-Only Debug Panel`**
   - **Source**: Adapted from `triton/desktop/tritos-desktop.html` (1.1.2) and `triton/triton4.html`.
6. **Build Script (`triton/desktop/build_desktop2.js`)**
   - **Source**: Repository build script that reads `triton/triton4.html`, `triton/desktop/tritos-desktop.html`, and `triton/desktop/guest-200.asm`, verifies layout and far-target offset bounds (`Math.abs(symAddr - 59049) <= 9841`), and generates `triton/desktop/tritos-desktop-2.html`.
