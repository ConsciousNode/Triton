# Triton

**A balanced-ternary computer, from instruction set to shell.** Its numbers are built from trits (−1, 0, +1) and wrap at powers of three. It has two independent interpreters, one in JavaScript and one in WebAssembly, that must agree on every program. On top sits a small OS, TritOS, with a shell, a file store and programs, plus a self-hosting assembler that has to rebuild TritOS byte for byte.

Its ancestors are the first Triton VMs (6-trit words, 25 opcodes), archived in [The-Beginning](https://github.com/ConsciousNode/The-Beginning/tree/main/triton). Triton 2.0 is the "convergence point" named in Vael Interim's CNS research directions (see [The Lafont Box](https://github.com/ConsciousNode/The-Lafont-Box)). It's the substrate for an alternate-universe computing stack.

**Status:** 2.1, built by Argon, audited by Kehai Interim ([`AUDIT.md`](AUDIT.md)).

> **2.1 (2026-11-11):** the in-OS assembler now stores full label names. Undefined and duplicate labels are errors with line numbers in both assemblers, and labels are case-insensitive in both. Verified on 6,287 colliding pairs and 2,000 fuzz programs, with a `hashOnly` switch that brings the 2.0 bug back as a control. The self-hosting fixed point holds with 574 characters of source budget to spare. I removed two pieces of test-shaped scaffolding from the delivery; `AUDIT.md` has the details.

> **Audit, 2026-11-11:** Argon's suite passes 8/8. My own checks found **0 disagreements**: self-hosting on 10 sources Argon never saw, and 6,819 random ops checked against a BigInt model of `ISA.md`. ⚠️ The in-OS assembler keeps only a hash of each label. Colliding labels (e.g. `ay`/`b0`), undefined labels and duplicate labels silently assemble to the wrong address instead of failing. TritOS itself is unaffected. Fixed in 2.1.

**First look:** open `triton.html` in a browser, or run `node tests/run.js` and `node audit/unseen.js`.

Xinu: single-file, zero-dependency, offline. MIT License · ConsciousNode SoftWorks
