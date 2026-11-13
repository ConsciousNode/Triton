# TritOS Desktop 1.1 — Record of Changes (`CHANGES-1.1.md`)

## D0. Migration to the Triton 3.1 Machine (`triton3.html`)
1. **Embedded Triton 3.1 Machine Block (`[INLINE 2/4]`)**: Replaced the Triton 3.0 machine block with lines 431–9635 of `triton3.html` byte-for-byte (SHA-256 `24f32f41406763dbded240397639559ac98d18b15537f8d1fe5bfabe92fa3831`), closed its IIFE (`})();`) immediately after `//END_TRITON3_MACHINE_BLOCK`, and routed all desktop host calls exclusively through `TritonSystem`.
2. **Removed Host Reads of Guest Memory in Page (`[INLINE 4/4]`)**: Removed `wasmVm.mem[...]` reads from `updateDebugReadout()` so the host page never reads or writes guest-private memory.
3. **Configurable Node ID & `BroadcastChannel('studionet_v1')`**: Added a Node ID selector (`0x0003..0x0006`, default `0x0003`) and connected `wasmVm.txHooks` and `wasmVm.receiveNetFrame` to `BroadcastChannel('studionet_v1')`.

## D1. Fixes for Audit Findings 1–5 (`desktop/AUDIT.md`)
1. **Audit Finding 1 (Host Memory Poking in Tests)**: Eliminated all `vm.mem[...]`, `vm.setMem(...)`, and `vm.setDisk(...)` calls across the entire test suite (`desktop-01` through `desktop-18`). Added `readFbPixel`, `readFbChar`, `readFbString` (MMIO framebuffer OCR), `listDiskFiles`, `readDiskFileTrytes`, `readDiskFileString` (reading Sector 200 on `exportDiskImage(vm)`), and `makeMouseTracker` in `desktop/tests/t3-common.js`.
2. **Audit Finding 2 (Calculator Test Killing Tasks & Missing Keyboard Flow Control)**:
   - Added flow control to `k_poll_kbd` and `k_poll_mouse` in the kernel so hardware FIFO events remain in the architected device queue whenever the focused task's 16-slot event queue is full (`EV_COUNT >= 16`).
   - Added `EV_MOUSE_UP` (`type = 4`) delivery when the mouse button transitions from pressed to released.
   - Verified that the unmodified auditor probe `desktop/audit/calc-no-host-writes.js` passes `100 / 100` at the default `35,000` steps while all other tasks remain running and preempting.
3. **Audit Finding 3 (Host-Poked Disk Full Test)**:
   - Upgraded `fs_read` and `fs_write` in the kernel to use hardware multi-sector DMA (`Ports 17–20`).
   - Added the `FILL` command to Terminal (`App 0`) to write 50-sector (`36,450`-tryte) files through `SYS_FS_WRITE` (`SYSCALL #32`) until the file system genuinely fills the 2,187-sector disk and returns `-1`.
4. **Audit Finding 4 (Positive Controls Perturbing Host Instead of Guest)**:
   - Added build-time guest source perturbation options to `buildTritOSDesktopSource(options)`: `perturbCompositor`, `perturbShuffle`, `perturbTetrisRot`, `perturbSheetPrec`, `perturbNetChecksum`, `disableTimer`, and `disableProtection`.
5. **Audit Finding 5 (Hardcoded Browser Paths & Self-Hosting Claims)**:
   - Rewrote `desktop-11-browser.js` to use repo-relative paths, try Playwright then Selenium, print `SKIPPED: <reason>` if neither can launch, and verify a SpiralChat message crossing between two desktop tabs over `BroadcastChannel('studionet_v1')`.
   - Updated `desktop-run-all.js` to report `passed / failed / skipped` where a skip is never a pass.
   - Embedded the complete `4,876`-character assembly source of `App 5: Trit Calculator` as `DEMO` on the boot disk and added `SYSCALL #37` mode `1` so the in-guest Assembler (`App 4`) rebuilds `App 5` (`597` trytes) byte-for-byte into `OUT` on disk and launches it.

## D2. Kernel Extensions & Honesty
1. **Kernel Stack Isolation**: Moved `SPR_KSP` to `10190` (`9850..10190`) so deep compositor call chains never overlap `pow2_tab` (`9714..9721`) or `xor4_tab` (`9458..9713`).
2. **Compositor Fast Path & Focus Check**: Added a top-window coverage fast path in `wm_redraw_rect` and skipped redundant full-window redraws in `wm_focus_window` when clicking inside an already-focused window.
3. **Coprime Kernel Code Checksum**: Updated `SYS_KERNEL_INFO` (`SYSCALL #8`) to use multiplier `#2` (coprime to `3^27`) so modifications anywhere in `Mem[0..4999]` are reflected in `k_csum`.
4. **StudioNet Kernel Driver**: Added Vector 11 (`IRQ_NET`) handler, 10-slot frame ring buffer (`K_NET_Q_BASE`), drop counter (`K_NET_DROP_PKTS`), 16-bit XOR/additive checksum (`k_net_checksum`), and Syscalls `#40..#45`.

## D3. New User-Mode Applications & 11-App Launcher
1. **App 6: Klondike Solitaire (`app6_sol_rom`)**: 7 tableau piles, stock/waste, 4 foundations, Draw-1/Draw-3, 729-color cards, mouse drag-and-drop, illegal move refusal, win detection, documented Fisher-Yates shuffle, and state save to `"SOL"`.
2. **App 7: Tetris (`app7_tet_rom`)**: 10×20 well, 7 tetrominoes, 4 rotations with 6-point wall kicks, soft/hard drop, line clears, virtual-clock gravity, LCG piece generator, persistent high score in `"TETHI"`, and state save to `"TETRIS"`.
3. **App 8: Write (`app8_write_rom`)**: Multi-line word processor with 24-column word wrap, cursor navigation (arrows, Home/End, PgUp/PgDn), insert/backspace/delete, scrolling, Open (`Ctrl+O`), Save (`Ctrl+S`), Save-As (`Ctrl+W`), and live status bar (`L:`, `C:`, `W:`).
4. **App 9: Sheet (`app9_sheet_rom`)**: 10×30 spreadsheet (`A1..J30`) with recursive-descent formula evaluator (`= + - * / ( )`, cell refs, `SUM`, `MIN`, `MAX`), truncating integer division, `#DIV/0!` and `#CYCLE!` detection, and plain-text save/load (`"SHEET"`).
5. **App 10: StudioNet (`app10_net_rom`)**: SpiralChat (`PROTO_SDP = 3`, port `900`), Ping (`PROTO_ECHO_REQ = 1` / `PROTO_ECHO_REP = 2`) with RTT in virtual steps, and multi-sector SFP (`PROTO_SFP = 5`) file send/receive landing in the TritOS file system.
6. **11-App Taskbar Launcher & Terminal `RUN <0..10>`**: Extended taskbar hit-testing and rendering to launch all 11 apps (`0..10`), and updated Terminal `RUN` to parse multi-digit app IDs `0..10`.
