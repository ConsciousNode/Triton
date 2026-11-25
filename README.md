# Triton

**A balanced-ternary computer, from instruction set to shell.** Its numbers are built from trits (−1, 0, +1) and wrap at powers of three. It has two independent interpreters, one in JavaScript and one in WebAssembly, that must agree on every program. On top sits a small OS, TritOS, with a shell, a file store and programs, plus a self-hosting assembler that has to rebuild TritOS byte for byte.

Its ancestors are the first Triton VMs (6-trit words, 25 opcodes), archived in [The-Beginning](https://github.com/ConsciousNode/The-Beginning/tree/main/triton). Triton 2.0 is the "convergence point" named in Vael Interim's CNS research directions (see [The Lafont Box](https://github.com/ConsciousNode/The-Lafont-Box)). It's the substrate for an alternate-universe computing stack.

**Status:** Triton 4 with TritOS Desktop 2.0.1 (below); 3.1.1 stays as the Triton 3 machine. 3.1 was built by Argon and audited by Kehai Interim ([`AUDIT-3.1.md`](AUDIT-3.1.md); 3.0: [`AUDIT-3.0.md`](AUDIT-3.0.md)); the 3.1.1 input-queue patch is by Kehai ([`CHANGES-3.1.1.md`](CHANGES-3.1.1.md)). 2.1 stays as the reference machine (`triton.html`, [`AUDIT.md`](AUDIT.md)).

> **Triton in hardware (2026-11-24):** Triton 4 now has a physical design: the [Triton card computer](https://github.com/ConsciousNode/Triton-card-computer), six cards of stock discrete logic with dual-rail trits and no microcontroller, FPGA or firmware anywhere in it. Its cards are checked cycle by cycle against a reference microsimulator, and that microsimulator against this repo's emulator. The whole machine, simulated chip by chip, boots and prints `POOP OK`, and runs the console, timer, SD card, keyboard, mouse and video in lockstep with the reference. Five of its six boards are laid out and routed in KiCad; the sixth, Memory, is routing now. A discrete-logic USB card, [JPUSB](https://github.com/ConsciousNode/Bare-USB), is on its way in.

> **Where to find TritOS Desktop:** the current version is **2.0.1**, on Triton 4: open [`desktop/tritos-desktop-2.html`](desktop/tritos-desktop-2.html), or start at `index.html`, which links to every machine. Desktop 1.1.2 on Triton 3.1.1 stays at [`desktop/tritos-desktop.html`](desktop/tritos-desktop.html).
>
> **TritOS Desktop 1.1.2 (2026-11-14):** StudioNet 1.0 (shared with SpiralOS), a sweep of the bugs from Kham's laptop playtest (taskbar labels chewed by the cursor, Paint drag, the editor eating `q` and `r`), real-time pacing so games no longer run at the laptop's frame rate, the Solitaire Suite, and Trit Blocks (the falling-block app, renamed). The delivery is in [`desktop/delivery-1.1.2-final/`](desktop/delivery-1.1.2-final/). Audit: accepted with notes ([`AUDIT-DESKTOP-1.1.2.md`](AUDIT-DESKTOP-1.1.2.md)). On Kehai's machine, with the real sibling repos and real Playwright, 37 of 40 tests pass. Test 10 and the old StudioNet-16 check still pin SpiralOS 1.3 and need re-pinning. Test 11 (two-tab browser) fails in real Playwright for a reason not yet found. Test 18 runs the JS reference peer but labels its results as SpiralOS. The Solitaire solver is honest but weak.
>
> **Triton 4 and TritOS Desktop 2.0.1 (2026-11-19):** the next machine, planned with a physical Triton card computer in mind.
> - **Triton 4** ([`triton4.html`](triton4.html), [`ISA-4.md`](ISA-4.md), spec [`SPEC-TRITON-4.md`](SPEC-TRITON-4.md)) adds:
>   - storage units: a home disk, a cartridge slot, and more removable disk images;
>   - TritFS v2, with folders and long names;
>   - a 200 kHz real-time timer mode and a real-time clock.
>
>   Triton 3 software runs on it unchanged.
> - **Desktop 2.0** (built by Argon) brings the Files and Disks apps, an App Shelf, cartridges, and fsck.
> - **2.0.1** (built by Gemini 4 Neon, spec [`SPEC-DESKTOP-2.0.1.md`](SPEC-DESKTOP-2.0.1.md)) closes a kernel memory-safety hole my audit found in 2.0:
>   - **The hole:** the file syscalls took user pointers unchecked, so any app could write file data anywhere in memory, including the task table, or copy kernel memory out to a file.
>   - **The fix:** every pointer-taking syscall (#50–#65) now checks the whole range against the caller's `[UBASE, ULIMIT)` and returns `ERR_BADPTR` (−14). The doc tables are generated from the code, and the page reads the real wall clock.
> - **Audits:** [`audit/triton4/`](audit/triton4/) holds the Triton 4 deliveries (intake, AUDIT-1 to AUDIT-3) and [`audit/triton4/desktop-2.0.1/AUDIT-1.md`](audit/triton4/desktop-2.0.1/AUDIT-1.md), **accepted**:
>   - every criterion we preregistered before sending the spec held;
>   - my old exploit probe, unchanged, now gets `ERR_BADPTR` everywhere on both cores;
>   - private probes the builder never saw (including the read over a task's own TCB that would have been a privilege escalation) are refused, with exact-fit controls passing;
>   - a build with the check switched off brings every hole back.
> - **Where the deliveries are:** Neon's delivery files are in [`desktop/delivery-2.0.1/`](desktop/delivery-2.0.1/). The Triton 4 machine report is [`REPORT-4.md`](REPORT-4.md).
>
> **Trytris on TritOS (2026-11-13):** App 11 is [Trytris](https://github.com/ConsciousNode/Trytris), written in Triton guest assembly by Gemini 4 Hydrogen. My audit ([`AUDIT-TRYTRIS-APP.md`](AUDIT-TRYTRIS-APP.md)) ran an independent lockstep differential against the reference game: 78 runs, 13,950 states, 0 divergences. Perturbed references were caught, and the app works in real Chrome. The audit also found a **Triton 3.1 machine bug**: the WASM keyboard and mouse queues accepted 2,048 events per boot and then dropped all input until reboot. Fixed in 3.1.1 (below).
>
> **TritOS Desktop 1.1 → 1.1.1 (2026-11-12/13):** 1.1 removed the host-staged test scenarios and passed audit ([`AUDIT-DESKTOP-1.1.md`](AUDIT-DESKTOP-1.1.md)). 1.1.1 adds a labeled driver library ([`desktop/DRIVERS.md`](desktop/DRIVERS.md)) and the StudioNet v2 16-byte frame format shared with SpiralOS ([`AUDIT-DESKTOP-1.1.1.md`](AUDIT-DESKTOP-1.1.1.md)).
>
> **TritOS Desktop 1.0 (2026-11-12, [`desktop/`](desktop/)):** a graphical OS written entirely as Triton 3 guest assembly. It has a preemptive kernel with protected user tasks, a window compositor, a block-disk file system, and six apps (terminal, editor, 729-color paint, clock, calculator, in-guest assembler). It runs on the 3.0 machine. Audit ([`desktop/AUDIT.md`](desktop/AUDIT.md)): the OS is real and boots cleanly in a browser, but several of its tests stage scenarios by writing guest memory from the host. A 1.1 cleanup is next.

> **3.1.1 (2026-11-13):** the keyboard and mouse queues are now 2,048-slot rings on both cores, so input never dies mid-boot. (In 3.1, it stopped after 2,048 events: about 1,000 key presses, or a minute of mouse movement.) The console input queue recycles too: in 3.1, after 69,632 typed chars, the guest read garbage. JS and WASM now apply identical limits. TritOS Desktop embeds the patched core, with its hash re-pinned. Tests: the new `t3-12-input-queues` (12,000 key events in order, with a positive control that re-installs the 3.1 queue and catches it), and a real-browser soak with a control run on the 3.1 desktop. Details: [`CHANGES-3.1.1.md`](CHANGES-3.1.1.md).

> **3.1 (2026-11-12):** the WASM core keeps every architected value at full 27-trit width, so addresses at or above 2³² fault instead of wrapping. The step counter crosses 2³¹ and 2³² without wrapping, the console never runs out, and an input-queue overflow is fixed. Audit: 11/11 suites pass, all three 3.0 audit probes now pass unmodified, and I found no rigging.

> **3.0 (2026-11-12):** `triton3.html` is a full balanced-ternary computer. It has 27-trit addresses, supervisor and user modes with base-and-limit protection, vectored interrupts on a virtual clock, a 729×486 framebuffer with 729 colors, a DMA block disk, a StudioNet NIC, and T2 mode matching 2.1 on 10,000 programs. TritOS 3 is a text-mode OS whose in-OS assembler rebuilds itself byte for byte, streaming its source off the disk. Audit: 10/10 delivered suites pass, the real browser shows 0 page errors, and I found no rigging. The two WASM bugs found in the audit are fixed in 3.1.

> **2.1 (2026-11-11):** the in-OS assembler now stores full label names. Undefined and duplicate labels are errors with line numbers in both assemblers, and labels are case-insensitive in both. Verified on 6,287 colliding pairs and 2,000 fuzz programs, with a `hashOnly` switch that brings the 2.0 bug back as a control. The self-hosting fixed point holds with 574 characters of source budget to spare. I removed two pieces of test-shaped scaffolding from the delivery; `AUDIT.md` has the details.

> **Audit, 2026-11-11:** Argon's suite passes 8/8. My own checks found **0 disagreements**: self-hosting on 10 sources Argon never saw, and 6,819 random ops checked against a BigInt model of `ISA.md`. ⚠️ The in-OS assembler keeps only a hash of each label. Colliding labels (e.g. `ay`/`b0`), undefined labels and duplicate labels silently assemble to the wrong address instead of failing. TritOS itself is unaffected. Fixed in 2.1.

**First look:** open `triton3.html` (or `triton.html` for 2.1) in a browser, run `node tests/t3-run-all.js`, or run `node tests/run.js` and `node audit/unseen.js`.

Xinu: single-file, zero-dependency, offline. MIT License · ConsciousNode SoftWorks
