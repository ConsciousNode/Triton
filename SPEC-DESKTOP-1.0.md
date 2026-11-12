# TritOS Desktop 1.0: a native graphical OS for the Triton 3 machine

Studio rules: Xinu (single file `tritos-desktop.html`, zero dependencies, offline, strict CSP, no network or storage APIs except the documented `BroadcastChannel`). Inline everything and label every inline: any code copied from another file carries a provenance comment naming its source and line range.

## What this is

A graphical operating system written **entirely as Triton 3 guest software** in Triton 3 assembly. It runs on the **unchanged** Triton 3 machine, drawing into the 729×486 framebuffer and driven by the machine's own timer, keyboard, mouse and disk interrupts.

The host page does only what real hardware does: it runs the machine, shows the framebuffer, and feeds the keyboard, mouse and disk devices. **Every pixel, window, menu and decision comes from guest code.**

Build the instrument and the OS. Do not predict or rank outcomes anywhere in code, docs or UI.

## Attached

- `triton3.html`: the Triton 3.0 machine (JS and WASM cores, assembler, devices, TritOS 3).
  - **Do not modify the machine.** Copy its machine code into `tritos-desktop.html` byte for byte, as one labeled inline block. The machine code is lines 431–9394 of the attached file: from `'use strict';` through the closing brace of the `globalThis.TritonSystem` export. Its SHA-256 is `e8b8fa5e7ce96e705eba7f7985b5e0008d72b4ae8ac9c1fa4a1ff7e814175456`. A test checks that hash, so a later 3.1 machine can be dropped in.
  - You may write a new page UI around it.
- `ISA-3.md`: the architecture, ports, interrupts, protection, `BCOPY`/`BFILL`, and the assembler syntax. It's the contract you program against.
- `AUDIT-3.0.md`: known machine bugs.
  - The WASM core wraps addresses ≥ 2³², so keep all addresses well below that.
  - Its `getConsoleOut()` stops after 10,900 I/O events, so don't depend on it.
  - A 3.1 patch is in progress separately. Don't work around anything else.
- `tests/t3-common.js`: how tests load the machine headless. Reuse it, labeled.

## What to build

### D1. Kernel

- **Boot:** the kernel boots in supervisor mode from a disk image and sets up the vector table, kernel stack and timer.
- **Preemptive multitasking:** the timer interrupt switches between tasks. Each application is a **user-mode task** with its own base-and-limit window, stack and saved registers. A task in an infinite loop must not freeze the desktop.
- **System calls** (via `SYSCALL`) for everything a task needs: drawing into its own window, reading its input events, file I/O, creating and exiting tasks, and the time. Document every call in `DESKTOP.md`.
- **Fault isolation:** a task that faults (protection, bad address, illegal instruction, divide by zero) is killed and its window closed, with a message. The kernel and every other task keep running.
- **Block-disk file system:** files with names, create / read / write / delete / list, and persistence across a reboot of the machine with the same disk image. The format is documented exactly in `DESKTOP.md`.

### D2. Graphics and windowing

- **Drawing by the guest:** the framebuffer is written only by guest code (ports and MMIO as `ISA-3.md` defines). Use `BCOPY`/`BFILL` for fills and blits.
- **Damage-based redraw:** redraw only changed regions. A full-screen redraw at the WASM core's speed costs real time, so the kernel tracks damage rectangles.
- **Windows:** overlapping, movable, focusable windows with title bars and close buttons. A guest-drawn mouse cursor. Keyboard focus follows the active window.
- **Font and colors:** a bitmap font in the guest (you may reuse TritOS 3's glyph data, labeled), and the 729-color balanced-ternary palette.
- **Desktop shell:** a taskbar or menu that launches the apps below and lists running tasks.

### D3. Applications (each a separate user-mode task)

1. **Terminal:** a text window running a shell. It can list, show and delete files, list and kill tasks, and launch apps.
2. **Text editor:** edit, save and load text files on the disk.
3. **Paint:** draw with the mouse in the 729-color palette, with a palette picker, and save and load images as files.
4. **Clock:** a live clock driven by the timer interrupt, shown in balanced ternary and decimal.
5. **Assembler app:** open a source file, assemble it **inside the guest** (port or reuse TritOS 3's streaming assembler, labeled), and run the result as a new user task in its own window.
6. **Trit calculator:** balanced-ternary arithmetic with a GUI.

### D4. Build and self-hosting

- The whole OS (kernel and apps) is Triton 3 assembly source embedded in the page, assembled by the machine's JS assembler into the boot disk image.
- **Self-hosting:** the guest assembler app, running on the desktop, rebuilds at least one complete application from its source on disk byte for byte, equal to the JS assembler's output. Aim for the whole OS if the size allows. Report what size it reached; don't fake it.

### D5. Page

- The framebuffer canvas, plus the device plumbing: keyboard, mouse (pointer lock optional), and disk image import/export.
- A small debug panel (registers, current task, IRQ counts) that only *reads* machine state.
- It runs on the WASM core. A switch runs the JS core too, in lockstep, with a state-hash comparison.
- The page never draws desktop content itself: no HTML windows, menus, buttons or text standing in for guest UI.

## Forbidden

- **The host never reads or writes guest memory** except to load the boot image, through architected DMA and devices, and in the read-only debug panel. The debug panel never feeds anything back to the machine or the tests.
- No host-side reimplementation of any desktop, window, app or file-system logic. No HTML or canvas overlays pretending to be guest UI.
- No modification of the machine code copied from `triton3.html`.
- No branching on test names, file hashes or scripted inputs anywhere in the guest or the host.
- No precomputed framebuffers, screenshots or recorded outputs embedded anywhere.
- **If a requirement can't be met, or conflicts with another, say so in `REPORT.md` and leave it failing.** Never change accessors, devices, harnesses or tests to make a check pass.

## Tests (`tests/desktop-*.js`, headless under Node, plus `node tests/desktop-run-all.js`)

Input in all tests is **scripted device events** (keys and mouse moves and clicks at given virtual-clock times) fed through the architected device queues, exactly as the page does.

1. **Machine integrity.** The embedded machine block hashes equal to the code in the attached `triton3.html`.
2. **Determinism and differential.** A scripted session of at least 2,000 events: two runs are bit-identical, and the JS and WASM cores agree on the final state hash and framebuffer hash. Also run a shorter session with frequent comparisons along the way.
3. **Preemption.** Launch a task that loops forever. The clock app keeps ticking, the cursor still moves, and another app still responds. Measure scheduling fairness (instructions per task per time slice) and report it.
4. **Fault isolation.** Separate tasks that write outside their window, execute a supervisor instruction, divide by zero, and jump to a bad address. Each is killed, its window closes, and the kernel and other tasks keep running, with kernel memory checksummed before and after.
5. **File system.** Create, write, read, list and delete, with random file sizes including multi-sector files. Fill the disk until it reports full. Reboot with the same disk image and verify persistence. A disk exported and imported mid-session must be bit-identical.
6. **Windowing.** Scripted open, move, overlap, focus, close. Assert on **framebuffer pixel readback** (via the machine's MMIO readback) that the top window is fully visible, the window under it is clipped correctly, and after a move the vacated region is repainted. No full-screen redraw happens for a small change: count the trytes written per redraw.
7. **Apps.** Scripted use of each app, checked through files written and framebuffer readback:
   - the editor saves a file whose contents match the typed text;
   - paint saves an image whose pixels match the drawn strokes;
   - the calculator shows the correct result for 100 random balanced-ternary expressions (checked against a BigInt oracle);
   - the clock advances with the virtual clock.
8. **Self-hosting.** The in-guest assembler rebuilds the target application(s) byte for byte. The built app launches and runs.
9. **Positive controls.**
   - With `protectionEnabled: false`, the fault-isolation test's rogue task corrupts kernel memory, and test 4 detects it.
   - With the timer disabled, test 3 detects the frozen desktop.
   - A one-pixel perturbation of a window's drawing code is caught by test 6.
10. **Static scan.** Strict CSP, no forbidden APIs, every inline labeled. The page has no DOM elements standing in for guest UI.
11. **Real browser.** If you can run a headless browser, load the page, run a scripted session and report page errors, with a screenshot. If you can't, say so plainly.

## Report (`REPORT.md`) and docs (`DESKTOP.md`)

- `DESKTOP.md`: the kernel memory map, task layout, system call table, file-system format, window protocol and the app list, generated where possible.
- `REPORT.md`: what was built and how each part was verified, with every table generated by a script. It includes code size per component, measured frame and redraw costs in steps, and the self-hosting size reached.
- **Everything not built, everything that fails, and every requirement found impossible or contradictory**, each with the reason.
- Describe nothing as working unless a test exercises it.
