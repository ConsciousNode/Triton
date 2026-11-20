# Triton 4 & TritOS Desktop 2.0 — Provenance of Inlined Blocks (`LIFTS.md`)

Every inlined block across `triton/triton4.html`, `triton/desktop/tritos-desktop-2.html`, `triton/desktop/tritos-desktop.html`, and the test helpers is labeled with an inline provenance comment and documented below:

1. **`triton/triton4.html` — Triton 4 Machine Block (`//BEGIN_TRITON3_MACHINE_BLOCK` .. `//END_TRITON3_MACHINE_BLOCK`)**
   - **Source**: Adapted from `triton/triton3.html` lines 431–9663 (ConsciousNode SoftWorks, Triton 3.1.1, MIT), adding Ports `28..32` (`DISK_UNIT`, `DISK_SIZE`, `DISK_FLAGS`, `TIMER_MODE`, `RTC_SECONDS`), Vector `12` (`IRQ_MEDIA`, mask bit 5 = `32`), `DISK_ERR = 4` (`ERR_BAD_UNIT`), sparse `Unit` storage (`0..26`), 200 kHz / 5 µs real-time `TIMER_MODE = 1` and `RTC_SECONDS` from an injectable host clock, `cutPowerAfterSectorWrites(N)` fault injector, `.tdisk`/raw/HTML snapshot export & import, and the Units UI panel.
   - **SHA-256**: `e1a62b1564dd228a518c1621c26a70b6bf6437b1b497aa5a0584cd916084b71b`.
2. **`triton/desktop/tritos-desktop-2.html` — `// [INLINE 1/4] Triton 4 Machine Block`**
   - **Source**: Inlined verbatim from `triton/triton4.html` (`//BEGIN_TRITON3_MACHINE_BLOCK` .. `//END_TRITON3_MACHINE_BLOCK`) by `triton/desktop/build_desktop2.js`.
   - **SHA-256**: `e1a62b1564dd228a518c1621c26a70b6bf6437b1b497aa5a0584cd916084b71b`.
3. **`triton/desktop/tritos-desktop-2.html` — `// [INLINE 2/4] TritOS Desktop 2.0 Guest Assembly Source (TRITOS_DESKTOP_SRC)`**
   - **Source**: Assembled from `triton/desktop/guest-200.asm` (`75,029` trytes = `103` sectors), adapted from `triton/desktop/tritos-desktop.html` (1.1.2) and extended with `DRIVER disk v2`, `DRIVER timer v2`, `DRIVER fs v2` (TritFS v2 Copy-on-Write filesystem driver in guest assembly with 16-page SLT cache and generation-stamped `fsck`), Path Syscalls `#50..#65`, `SYS_GET_RTC` (`#38`), `App 12` (Files), `App 13` (Disks), and `App 14` (App Shelf).
4. **`triton/desktop/tritos-desktop-2.html` — `// [INLINE 3/4] Standalone App 5 (Trit Calculator) Source & Boot Helpers`**
   - **Source**: Adapted from `triton/desktop/tritos-desktop.html` (1.1.2), defining `const TRITOS_VERSION = "TritOS Desktop 2.0"` once, `RATE = 200`, `T3_FONT_9X9`, `buildTritOSDesktopSource`, and `bootTritOSDesktop`.
5. **`triton/desktop/tritos-desktop-2.html` — `// [INLINE 4/4] Host Framebuffer Canvas Plumbing, StudioNet BroadcastChannel & Read-Only Debug Panel`**
   - **Source**: Adapted from `triton/desktop/tritos-desktop.html` (1.1.2) and `triton/triton4.html`.
6. **Build & Doc Generator Scripts (`triton/desktop/build_desktop2.js`, `triton/tests/t4-generate-docs.js`)**
   - **Source**: Repository scripts for building `triton/desktop/tritos-desktop-2.html` from `triton/desktop/guest-200.asm` + `triton/triton4.html` and generating `triton/ISA-4.md` from `triton/triton4.html`.
7. **Test Helper (`triton/desktop/tests/t3-common.js`)**
   - **Source**: Adapted from `triton/tests/t3-common.js` (Triton 3.1.1 / TritOS 1.1.2) with 9×9 glyph OCR helpers (`getGlyphMap`, `readFbChar`, `readFbString`).
