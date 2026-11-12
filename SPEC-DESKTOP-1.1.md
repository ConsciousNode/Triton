# TritOS Desktop 1.1: honest tests, the 3.1 machine, games and an office suite

Studio rules: Xinu (single file `tritos-desktop.html`, zero dependencies, offline, strict CSP, no network or storage APIs except the documented `BroadcastChannel`). Inline everything and label every inline.

This is a **patch plus new apps** on TritOS Desktop 1.0. Everything 1.0 does must keep working. Record every change in `CHANGES-1.1.md`.

## Attached

- `desktop/`: TritOS Desktop 1.0 as delivered, its tests, and **`desktop/AUDIT.md`**. Read the audit first; its findings are requirements here.
- `triton3.html`: the **Triton 3.1** machine. Move the desktop onto it (D0).
- `ISA-3.md`, `AUDIT-3.1.md`: the 3.1 architecture and its audit.
- `STUDIONET.md`: the StudioNet wire format and protocols, from SpiralOS.
- `spiralos/`: SpiralOS 1.2 (`spiralos.img`, `os/net.sp`, `tests/harness.js`, `tabcomp.html`, `hummingbird.html`, `core/`, `themes/`), used **only** for the interop test. Don't modify it.
- `desktop/audit/calc-no-host-writes.js`: the auditor's probe. **Do not modify it.** It must still pass.

## D0. Move to the Triton 3.1 machine

- Embed the 3.1 machine code byte for byte as one labeled inline block. A test pins its SHA-256 against the attached `triton3.html`, as 1.0 did against 3.0.
- 3.1 wraps its script in an IIFE. The desktop's own code reaches the machine only through the exported `TritonSystem` object.
- All 1.0 behavior keeps working on 3.1.

## D1. Fix the tests (audit findings 1–5)

- **No host reads or writes of guest-private memory in any test.** The only allowed ways in are the boot image, the device queues (keys, mouse, disk image import), architected DMA and devices, framebuffer readback through MMIO, and reading files from the **disk image** after the guest saves them. In particular:
  - the calculator test must not kill or pause other tasks;
  - the disk-full test must fill the disk through the guest itself (apps saving files, or a small guest test app) until the file system reports full;
  - no test may poke kernel pointers, TCBs or app memory.
- **Assertions go through the framebuffer and saved files.** Where an app's state isn't visible, the app gets a documented way to save it to a file (for example, a game saving its board), and the test reads that file from the disk image.
- **The windowing positive control perturbs guest drawing code.** Add a build option, `perturbCompositor: true`, that assembles the compositor with a one-pixel offset in one drawing routine. Test 6 must fail with it on and pass with it off.
- **The browser test** uses repo-relative paths, accepts Playwright or Selenium, and prints `SKIPPED: <reason>` if neither can launch. The runner reports passed / failed / skipped. A skip is never a pass.
- **Self-hosting:** the in-guest assembler rebuilds **at least one of the desktop's own apps** (one of D3's, or any 1.0 app) from its source on disk, byte for byte, and the rebuilt app launches. Report the largest size reached. Don't describe anything bigger than what a test exercises.

## D2. Keep the kernel honest

The new apps must work through the existing syscall and event model. If you add syscalls (for example, a random seed from the virtual clock), document each one in `DESKTOP.md`. Faulting or looping in any new app must still be isolated (the 1.0 fault and preemption tests, extended to the new apps).

## D3. New apps (each a user-mode task with its own window)

1. **Klondike Solitaire**
   - Standard rules: 7 tableau piles, stock and waste, 4 foundations. Draw-1 and draw-3 modes.
   - Cards are drawn by the guest in the 729-color palette, and moved by mouse drag and drop.
   - Illegal moves are refused. Win detection, plus a new-game button.
   - Deals come from a **documented shuffle algorithm and seed**, so a test can reproduce a deal.
   - A "save game" command writes the full game state to a file.
2. **Tetris**
   - 10×20 well, the 7 standard tetrominoes, rotation with wall kicks (document the rotation system), soft and hard drop, line clears, score, level and speed.
   - Gravity is driven by the virtual clock, so it's deterministic for the same input timeline.
   - The piece sequence comes from a **documented generator and seed**.
   - It saves the high score to a file. A "save" command writes the board and score to a file.
3. **Write** (word processor)
   - Multi-line documents with word wrap, cursor movement (arrows, home/end, page up/down), insert, delete and backspace.
   - Open, save and save-as by file name. A status line shows line, column and word count.
   - Documents can be larger than one window and scroll.
4. **Sheet** (spreadsheet)
   - At least 10 columns × 30 rows (A1..J30). A cell holds a number, text or a formula: `=`, `+ − * /`, parentheses, cell references, `SUM(A1:A9)`, `MIN`, `MAX`.
   - Recalculation on edit, with circular references detected and shown as an error.
   - Saves and loads a documented plain-text format.
   - Numbers are integers (balanced ternary words). Division truncates, and division by zero shows an error. Document both.
5. **Net** (StudioNet, through the Triton NIC and its receive interrupt)
   - The kernel gets a network driver: a receive-interrupt handler, a frame queue and send/receive syscalls. Frames use the StudioNet wire format in the attached `STUDIONET.md` (12-byte header, checksum, protocols 1–5), byte for byte.
   - **Chat** speaks SpiralChat: SDP datagrams on port 900, wire-compatible with SpiralOS's `os/net.sp`, so a TritOS desktop can chat with SpiralOS running on TabComp or Hummingbird, and with another TritOS desktop.
   - **Ping** (echo request/reply) shows the round-trip time in virtual steps.
   - **Send file / receive file** use SFP (protocol 5), compatible with SpiralOS's file push. Received files land in the TritOS file system.
   - The node ID is configurable in the page (default `0x0003`), so two desktops on one network need different IDs. The page keeps joining `BroadcastChannel('studionet_v1')` as the Triton workstation does, so tabs in the same browser share one network.
6. **Launcher:** the taskbar or a start menu opens every app, old and new.

## Tests (headless, under Node)

Every input is a scripted device event through the architected queues. Every check reads the framebuffer through MMIO, or a file from the disk image.

1. **Integrity:** the embedded machine block's hash equals the 3.1 machine.
2. **Every 1.0 test, rewritten under D1's rules, passes.** That includes a real disk fill and the guest-perturbation control.
3. **Klondike:**
   - for 3 seeds, the dealt layout (read from the saved game file) equals a JS reference implementation of the documented shuffle;
   - 20 scripted legal moves are accepted, and 20 illegal ones refused (checked through the saved state);
   - a scripted complete game on a known winnable seed reaches the win screen (framebuffer check).
4. **Tetris:**
   - for 3 seeds and a scripted input timeline, the saved board and score after N pieces equal a JS reference model of the documented rules;
   - a line-clear scenario and a game-over scenario both check out;
   - the high score persists across a reboot.
5. **Write:**
   - a scripted editing session (typing, cursor moves, deletes, newlines, 2,000+ characters, scrolling) saves a file equal to the expected text;
   - reopening shows the right text in the window (framebuffer check of the first lines).
6. **Sheet:**
   - 100 randomly generated sheets, entered by scripted typing, saved, then compared cell by cell with a JS reference evaluator;
   - circular references and division by zero are reported.
7. **Isolation:** a fault and an infinite loop inside each new app leave the desktop and the other apps running. A flood of 1,000 incoming frames doesn't freeze the desktop or overflow kernel memory; extra frames are dropped and counted.
8. **Net:**
   - Two TritOS desktops (node IDs 3 and 4) in one Node process, with frames relayed between their NICs by the test (device-level only): a scripted chat round trip shows on both screens (framebuffer check), ping replies arrive, and a 3-sector file sent from one arrives byte-identical on the other's disk.
   - **Interop:** a TritOS desktop and the attached SpiralOS (booted in Hummingbird via `spiralos/tests/harness.js`) exchange SpiralChat messages and ping each other. Frames are checked byte for byte against the format in `STUDIONET.md`.
   - Every frame either side sends parses with a JS reference parser and passes the checksum.
9. **Positive controls:**
   - `perturbCompositor` fails test 6;
   - a shuffle with one swapped step fails test 3;
   - a Tetris build with one rotation offset changed fails test 4;
   - a Sheet build that ignores operator precedence fails test 6;
   - a network build that computes the checksum wrong fails test 8.
10. **Static scan** and **real browser**, as before. The real-browser run also opens two desktop tabs and shows a chat message crossing between them over `BroadcastChannel`.

## Forbidden

- **If a requirement can't be met, or conflicts with another, say so in `REPORT.md` and leave it failing.** Never change accessors, devices, harnesses, the machine block or anything in `desktop/audit/` to make a check pass.
- **The host never reads or writes guest-private memory**, in the page or in the tests, except as D1 allows. The read-only debug panel never feeds tests.
- No host-side game, editor or spreadsheet logic, and no HTML overlays standing in for guest UI.
- No branching on seeds, test names or scripted inputs anywhere in the guest.

## Report

`REPORT.md` (tables generated by script), `DESKTOP.md` (syscalls, file formats, the shuffle and piece generators, the rotation system, the Sheet grammar) and `CHANGES-1.1.md`. List everything not built, failing or contradictory, with the reason. Describe nothing as working unless a test exercises it.
