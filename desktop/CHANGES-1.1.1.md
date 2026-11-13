# TritOS Desktop 1.1.1 — Changes from 1.1

## 1. Summary of Changes to `desktop/tritos-desktop.html`

1. **Driver Library Refactoring (Requirement A)**:
   - Split all kernel hardware and MMIO access into six contiguous, labeled guest assembly driver modules, each wrapped in `; ==== DRIVER <name> v<n> ====` ... `; ==== END DRIVER <name> ====` with a jump-table **entry table** at the start of the module, a declared list of hardware **ports**, and a declared list of owned **kernel memory ranges**:
     - `DRIVER disk v1` (`.org 5444`, entry table `drv_disk_read_sectors` / `drv_disk_write_sectors`, ports `2, 3, 4, 5`).
     - `DRIVER timer v1` (`.org 5480`, entry table `drv_timer_init` / `drv_timer_set_quantum` / `drv_timer_get_ticks` / `drv_timer_irq`, ports `6, 7`, Vector 1).
     - `DRIVER keyboard v1` (`.org 5508`, entry table `drv_kbd_irq` / `drv_kbd_write_console`, ports `0, 1`, Vector 2).
     - `DRIVER mouse v1` (`.org 5542`, entry table `drv_mouse_irq`, ports `8, 9, 10`, Vector 3).
     - `DRIVER framebuffer v1` (`.org 5610`, entry table `drv_fb_blit_scanline` / `drv_fb_plot_cursor_px`, MMIO `15000000..15354293`).
     - `DRIVER net v2` (`.org 9460`, entry table `drv_net_irq` / `drv_net_get_id` / `drv_net_send` / `drv_net_recv` / `drv_net_ping` / `drv_net_send_file` / `drv_net_status`, ports `20, 21, 22, 23`, Vector 4).
   - Rerouted all kernel callers (`boot_start`, trap/IRQ vectors, `sys_putc`, `sys_yield`, `sys_get_ticks`, `sys_read_sector`, `sys_stage_asm_file`, `fs_find`, `fs_sync_dir`, `sys_fs_read`, `sys_fs_write`, `comp_redraw_rect`, `comp_draw_cursor`, and `SYSCALL #40..#45`) to invoke drivers exclusively through their entry tables.
2. **StudioNet v2 (`DRIVER net v2`) — 16-Byte Wire Format (Requirement B)**:
   - Replaced the 12-byte checksummed header (`[dst:16][src:16][proto:8][ttl:8][seq:16][len:16][csum:16]`) with the 16-byte little-endian StudioNet header (`[dst:16][src:16][proto:8][flags:8][sport:16][dport:16][seq:16][ack:16][len:16]`, no checksum, payload `<= 480` bytes) matching `spiralos/STUDIONET.md` Section 2 and `spiralos/os/net.sp`.
   - Removed the 256-entry XOR table that was only used by the retired 12-byte checksum.
   - **Chat (`PROTO_SDP = 2`, `sport = dport = 4200`, `FLAG_PSH = 4`)**: Sends null-terminated ASCII (`len` includes the trailing `NUL`) and formats received messages as `XXXX:<message>` with the 4-digit uppercase hex sender node ID.
   - **Ping (`PROTO_SDP = 2`, `sport = dport = 7`)**: Sends `FLAG_PSH (4)` with `"PING\0"`, answers any incoming port-7 `FLAG_PSH` frame with `FLAG_ACK | FLAG_PSH (6)`, `ack = seq + 1`, and the identical payload, measures RTT in virtual steps, and times out after a documented `250,000`-step budget to display `NO REPLY` when pinging nodes (such as SpiralOS) that do not answer port 7.
   - **File Push (`PROTO_SSP = 3`, ports `4300` / `4301`)**:
     - Builds the 32-byte name block (`name`, `NUL`, zeros; `block[24]` mode `'B'` or `'T'`, `block[25..28]` total tryte length `u32 LE`, `block[29..30]` chunk index `u16 LE`).
     - Single-frame files (`<= 440` encoded bytes) transmit on port `4300` with `SYN|PSH|FIN (13)`.
     - Multi-chunk files (`> 440` encoded bytes) transmit chunk `0` (`SYN|PSH = 5`) on port `4300` and subsequent chunks (`PSH = 4` / `PSH|FIN = 12`) on port `4301`, reassembling into `K_SFP_BUF` and committing to the file system only when all expected trytes have arrived.
     - Refuses files `> 440` encoded bytes addressed to SpiralOS nodes (`0x0101`, `0x0201`, `0x00FE`), setting status `2` (`TOO BIG FOR SPIRALOS`) and transmitting `0` frames.
     - Replies to every received file frame with SSP `FLAG_ACK (2)`, payload `"OK"`, `ack = seq + 1` on port `4300`, and records the RTT to incoming SSP `ACK` frames.
     - Accepts single-frame SpiralOS file pushes (`block[24] == 0`) as byte-mode files with the filename truncated to 8 characters and uppercased.
   - **Malformed-Frame Filtering**: Drops and counts (`K_NET_DROP_PKTS`) frames with `frame_len < 16`, `frame_len > 496`, `hdr.len != frame_len - 16`, unknown protocol, or unknown port without faulting.
3. **App 10 (`STUDIONET`) Updates (Requirement B & Test 4)**:
   - Added Target Node selector (`0003`, `0004`, `0101`, `0201`), interactive File box (`Ctrl+F` to focus, printable keys/Backspace to edit filename, `Enter` or `[PUSH]` to send), sender hex prefix display (`XXXX:MSG`), `NO REPLY` timeout display, `TOO BIG FOR SPIRALOS` refusal banner, `FILE NOT FOUND` status, and `ACK OK` status.
   - Updated default BroadcastChannel name in `tritos-desktop.html` to `'studionet-v1'` (matching `spiralos/tabcomp.html` and `spiralos/hummingbird.html`) while also bridging `'studionet_v1'` so both channel names interoperate seamlessly.
4. **Audit Punch List (Requirement C)**:
   - **Debug Panel `PSW` Readout (C.2)**: Updated `updateDebugReadout()` in `desktop/tritos-desktop.html` to compute the packed architectural `PSW` integer (`wasmVm.sf + 3*wasmVm.cf + 9*wasmVm.of + 27*wasmVm.priv + 81*wasmVm.ie`) alongside `ESR` through `TritonSystem`, eliminating `PSW: undefined`.
   - **Browser Test Engine Branches (C.1)**: Rewrote `desktop/tests/desktop-11-browser.js` with complete, self-contained Playwright and Selenium branches (`runWithPlaywright` then `runWithSelenium`), printing `SKIPPED: <reason>` only if neither engine can launch, and added the standing negative control (Test 5).
   - **Standing Custom Filename Test (C.3 / Test 4)**: Added `desktop/tests/desktop-21-custom-filename.js`.

## 2. 1.1 Tests Changed or Retired, with Reasons

All 1.1 tests not tied to the retired 12-byte wire format (`desktop-01` through `desktop-09`, `desktop-12` through `desktop-15`, and `desktop/audit/calc-no-host-writes.js`) remain **unchanged** and pass. The following 1.1 test files were updated for the 16-byte StudioNet v2 wire format and 1.1.1 requirements:

| Test File | Change Made | Reason |
|---|---|---|
| `desktop/tests/desktop-16-isolation-d3.js` | Updated the 1,000-frame flood test generator from `TritonSystem.buildStudioNetFrame` (12-byte) to `studionet16-ref.js` `buildFrame16` (16-byte SDP port 4200 chat frames). | `DRIVER net v2` speaks the 16-byte StudioNet format (`STUDIONET.md` §2) and drops 12-byte frames as malformed (`len < 16`). |
| `desktop/tests/desktop-17-net.js` | Rewrote Test 8a (now 1.1.1 Test 3) to validate every frame with `studionet16-ref.js` instead of the machine block's 12-byte helpers, and added checks for sender hex ID on screen (`0003:...`, `0004:...`), missing-filename `0`-frame refusal, single-frame byte-mode file push (`<= 440` bytes, `SYN|PSH|FIN`), and 10-chunk tryte-mode file push (`2,187` trytes across ports `4300`/`4301` with negative trytes). | Required by 1.1.1 Specification Test 3 and Requirement B. |
| `desktop/tests/desktop-18-spiralos-interop.js` | Rewrote Test 8b (now 1.1.1 Test 6) to boot unmodified SpiralOS 1.2.1 in **both** TabComp (`0x0101`) and Hummingbird (`0x0201`) via `spiralos/tests/harness.js`, relay frames to `tcCpu.netRxQueue` and `hbPc.snet.onReceive`, and test all 7 sub-checks through rendered framebuffers, `studionet16-ref.js`, and `SpiralFS`. | Required by 1.1.1 Specification Test 6 and the 1.1 audit note regarding `hbPc.snet`. |
| `desktop/tests/desktop-10-static-scan.js` | Added static checks that no test or host code reads SpiralOS RAM (`ram` / `ramView` / `ramDV`), no host-side 16-byte protocol stack exists in `tritos-desktop.html`, and all `spiralos/` files match their original SHA-256 digests. | Required by 1.1.1 Specification Test 9 and Forbidden rules. |
| `desktop/tests/desktop-11-browser.js` | Completed the Playwright branch and Selenium branch (trying Playwright first, then Selenium), verified `PSW:` is never `undefined`, and added the standing two-tab negative control (chat run vs. no-message run). | Required by 1.1.1 Specification C.1, C.2, C.3, and Test 5. |
| `desktop/tests/desktop-run-all.js` | Added the 4 new 1.1.1 test suites (`studionet16-ref.js`, `desktop-21-custom-filename.js`, `desktop-19-driver-library.js`, `desktop-20-malformed-frames.js`). | Required by 1.1.1 Specification Tests 2, 4, 7, and 8. |
