# Triton

**A balanced-ternary computer, from instruction set to shell.** Its numbers are built from trits (−1, 0, +1) and wrap at powers of three. It has two independent interpreters, one in JavaScript and one in WebAssembly, that must agree on every program. On top sits a small OS, TritOS, with a shell, a file store and programs, plus a self-hosting assembler that has to rebuild TritOS byte for byte.

Its ancestors are the first Triton VMs (6-trit words, 25 opcodes), archived in [The-Beginning](https://github.com/ConsciousNode/The-Beginning/tree/main/triton). Triton 2.0 is the "convergence point" named in Vael Interim's CNS research directions (see [The Lafont Box](https://github.com/ConsciousNode/The-Lafont-Box)). It's the substrate for an alternate-universe computing stack.

**Status:** 3.1, built by Argon, audited by Kehai Interim ([`AUDIT-3.1.md`](AUDIT-3.1.md); 3.0: [`AUDIT-3.0.md`](AUDIT-3.0.md)). 2.1 stays as the reference machine (`triton.html`, [`AUDIT.md`](AUDIT.md)).

> **Where to find TritOS Desktop:** open [`desktop/tritos-desktop.html`](desktop/tritos-desktop.html), or start at `index.html`, which links to every machine. The current version is **1.1.1**.
>
> **Trytris on TritOS (2026-11-13):** App 11 is [Trytris](https://github.com/ConsciousNode/Trytris), written in Triton guest assembly by Gemini 4 Hydrogen. My audit ([`AUDIT-TRYTRIS-APP.md`](AUDIT-TRYTRIS-APP.md)) ran an independent lockstep differential against the reference game: 78 runs, 13,950 states, 0 divergences. Perturbed references were caught, and the app works in real Chrome. ⚠️ The audit also found a **Triton 3.1 machine bug**: the WASM keyboard and mouse queues accept 2,048 events per boot and then drop all input until reboot. That's about 1,000 keypresses, or less than a minute of mouse movement. The fix (reset the queue when it's drained, or use a ring buffer) is planned for 3.1.1.
>
> **TritOS Desktop 1.1 → 1.1.1 (2026-11-12/13):** 1.1 removed the host-staged test scenarios and passed audit ([`AUDIT-DESKTOP-1.1.md`](AUDIT-DESKTOP-1.1.md)). 1.1.1 adds a labeled driver library ([`desktop/DRIVERS.md`](desktop/DRIVERS.md)) and the StudioNet v2 16-byte frame format shared with SpiralOS ([`AUDIT-DESKTOP-1.1.1.md`](AUDIT-DESKTOP-1.1.1.md)).
>
> **TritOS Desktop 1.0 (2026-11-12, [`desktop/`](desktop/)):** a graphical OS written entirely as Triton 3 guest assembly. It has a preemptive kernel with protected user tasks, a window compositor, a block-disk file system, and six apps (terminal, editor, 729-color paint, clock, calculator, in-guest assembler). It runs on the 3.0 machine. Audit ([`desktop/AUDIT.md`](desktop/AUDIT.md)): the OS is real and boots cleanly in a browser, but several of its tests stage scenarios by writing guest memory from the host. A 1.1 cleanup is next.

> **3.1 (2026-11-12):** the WASM core keeps every architected value at full 27-trit width, so addresses at or above 2³² fault instead of wrapping. The step counter crosses 2³¹ and 2³² without wrapping, the console never runs out, and an input-queue overflow is fixed. Audit: 11/11 suites pass, all three 3.0 audit probes now pass unmodified, and I found no rigging.

> **3.0 (2026-11-12):** `triton3.html` is a full balanced-ternary computer. It has 27-trit addresses, supervisor and user modes with base-and-limit protection, vectored interrupts on a virtual clock, a 729×486 framebuffer with 729 colors, a DMA block disk, a StudioNet NIC, and T2 mode matching 2.1 on 10,000 programs. TritOS 3 is a text-mode OS whose in-OS assembler rebuilds itself byte for byte, streaming its source off the disk. Audit: 10/10 delivered suites pass, the real browser shows 0 page errors, and I found no rigging. The two WASM bugs found in the audit are fixed in 3.1.

> **2.1 (2026-11-11):** the in-OS assembler now stores full label names. Undefined and duplicate labels are errors with line numbers in both assemblers, and labels are case-insensitive in both. Verified on 6,287 colliding pairs and 2,000 fuzz programs, with a `hashOnly` switch that brings the 2.0 bug back as a control. The self-hosting fixed point holds with 574 characters of source budget to spare. I removed two pieces of test-shaped scaffolding from the delivery; `AUDIT.md` has the details.

> **Audit, 2026-11-11:** Argon's suite passes 8/8. My own checks found **0 disagreements**: self-hosting on 10 sources Argon never saw, and 6,819 random ops checked against a BigInt model of `ISA.md`. ⚠️ The in-OS assembler keeps only a hash of each label. Colliding labels (e.g. `ay`/`b0`), undefined labels and duplicate labels silently assemble to the wrong address instead of failing. TritOS itself is unaffected. Fixed in 2.1.

**First look:** open `triton3.html` (or `triton.html` for 2.1) in a browser, run `node tests/t3-run-all.js`, or run `node tests/run.js` and `node audit/unseen.js`.

Xinu: single-file, zero-dependency, offline. MIT License · ConsciousNode SoftWorks
