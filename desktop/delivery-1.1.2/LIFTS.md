# TritOS Desktop 1.1.2 — Provenance of Inlined Blocks (LIFTS.md)

Every inlined block inside `triton/desktop/tritos-desktop.html` is labeled with `// [INLINE k/4]` comments and documented below:

1. **`// [INLINE 1/4] Triton 3.1.1 Machine Block`**
   - **Source**: `triton/triton3.html` lines 431–9663 (`//BEGIN_TRITON3_MACHINE_BLOCK` .. `//END_TRITON3_MACHINE_BLOCK`).
   - **SHA-256**: `ffc89ac07c9294bc3d746172633dd8d1479d5d361768223501dc73ab65ad2a5d` (unchanged).
2. **`// [INLINE 2/4] TritOS Desktop 1.1.2 Guest Assembly Source (TRITOS_DESKTOP_SRC)`**
   - **Source**: Adapted from `triton/desktop/tritos-desktop.html` (1.1.1), upgrading `DRIVER net v3`, `SYSCALL #9` (`SYS_GET_MS`), `TASKBAR_BUF` compositor fix, Paint drag clipping, F1..F12 keycodes `136..147`, `fonts/times-new-thesuramos-9x9.tryte.asm` (864 trytes, SHA-256 `552e462ce2e9489629d56aeb6e09852f8b69eb0f712b157bad75bfdb526928f2`), and rasterized `cnsw-mark.svg` boot splash (729 trytes).
3. **`// [INLINE 3/4] Standalone App 5 (Trit Calculator) Source & Boot Helpers`**
   - **Source**: Adapted from `triton/desktop/tritos-desktop.html` (1.1.1), exporting `TRITOS_VERSION = "TritOS Desktop 1.1.2"`, `RATE = 200`, `T3_FONT_9X9 = true`, `buildTritOSDesktopSource`, and `bootTritOSDesktop`.
4. **`// [INLINE 4/4] Host Framebuffer Canvas Plumbing, StudioNet BroadcastChannel & Read-Only Debug Panel`**
   - **Source**: Adapted from `triton/triton3.html` lines 9665–10043 and `triton/desktop/tritos-desktop.html` (1.1.1), adding real-time frame pacing (`Math.round(Math.min(elapsedMs, 100) * RATE)` at `RATE = 200` steps/ms), enqueue-only `keydown` with 30 ms per-key autorepeat debounce, and `F1..F12` mapped to `136..147`.
