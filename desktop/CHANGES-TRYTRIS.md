# Changes for Trytris (App 11)

## `tritos-desktop.html`
- Added **App 11: Trytris** (`app11_try_rom`, 4,819 trytes) in Triton 3.1 user-mode assembly:
  - Exact 32-bit `try_mulberry32` (with 256-tryte nibble XOR table `try_xor_tbl` and 16-bit limb `try_imul32`), `floor(u32 * (i + 1) / 2^32)` Fisher-Yates bag shuffle, `SeededBagGenerator` vocabulary filtering and `CURSED` level-5 bag flush.
  - All 16 piece definitions (`P1..P4`, `H1..H12`) and 72 rotation states lifted from `trytris/index.html` (`[LIFT]` provenance comment).
  - Full `TrytrisEngine` rules: `canPlace`, `moveHorizontal`, `rotate` (8-point kick list), `stepGravityDown` zig-zag, `softDrop`, `hardDrop`, `resolveFullRows` (pre-cleared check, collapse with Ternary Negation, combo multipliers `1, 1.5, 2, 2.5, 3`, back-to-back `1.5x`, exact integer `Math.round`, `level = min(15, 1 + floor(lines / 10))`).
  - Window rendering via syscalls only: rasterized ▲/▽ cells (`66×144` board), ghost piece, 729-color palette, next-3 preview, HUD, and unrolled 5×5 T/Z/F readout (`72×144`).
  - Live gravity (`200 steps/ms`) and Lockstep mode (`K` toggle), `TRYSTATE` (355 trytes) and `TRYHI` (3 trytes) persistence.
  - Build-time positive control hooks: `perturbTryRotation`, `perturbTryPrng`, `perturbTryCollapse`, `perturbTryScore`.
- Raised `k_spawn_app` app count limit from `11` to `12` (`0..11`), added `app11_try_rom` to `app_rom_table`, added taskbar button `[T3]` at `x >= 696` (preserving `[NET]` at `660..695`), and gave App 11 `SP = UBASE + 4980` in `k_init_task_slot`.

## New & Modified Tests (`desktop/tests/`)
- `trytris-ref.js` (new): Reference harness loading `TrytrisEngine` and dependencies unmodified from `trytris/index.html` (lines 853–1594, SHA-256 `91293917014195ff492ab84dc15fa7f1c0d812e5c28a3580943573437a11a683`).
- `desktop-22-trytris-tables.js` (new): Compares all 16 pieces, 72 rotations, and 404 cells against the reference.
- `desktop-23-trytris-differential.js` (new): 90 lockstep differential runs (30 seeds × 3 modes × 300 actions, 3 per-action + 87 every-25 + final, `CURSED` lv=4 and lv=5, game-over runs) plus 20 framebuffer centroid + T/Z/F readout checks.
- `desktop-24-trytris-negation.js` (new): Scripted 1-row (odd) and 2-row (even) clears verifying Ternary Negation in `TRYSTATE` and screen T/Z/F readout.
- `desktop-25-trytris-persistence.js` (new): Verifies `TRYHI` survives reboot (`keepDisk = true`).
- `desktop-26-trytris-isolation.js` (new): App 11 protection fault (`200`) and infinite loop (`201`) isolation, Clock advancement, and `KSTAT` kernel checksum integrity.
- `desktop-27-trytris-browser.js` (new): Headless Chromium/Selenium test launching App 11 via `RUN 11`, toggling Lockstep, playing 20 hard drops, checking 0 `SEVERE` errors, and saving `trytris-browser-screenshot.png`. (Uses `data:text/html;base64,...` because Chromium's container URL policy blocks `http://localhost` and `file://`.)
- `desktop-28-trytris-positive-controls.js` (new): Verifies `perturbTryRotation`, `perturbTryPrng`, `perturbTryCollapse`, and `perturbTryScore` all fail their respective checks.
- `desktop-10-static-scan.js` (modified): Extended host-code scan to verify no Trytris game logic appears outside `TRITOS_DESKTOP_TEMPLATE`.
- `desktop-run-all.js` (modified): Registered `desktop-22` through `desktop-28`.

## Documentation (`desktop/`)
- `DESKTOP.md`: Added App 11 controls, live gravity rate, `TRYSTATE`, and `TRYHI` formats.
- `CHANGES-TRYTRIS.md` & `REPORT-TRYTRIS.md`: Added change log and verification report with raw test log.
