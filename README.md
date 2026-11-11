# Triton

**A balanced-ternary computer, from instruction set to shell.** Its numbers are built from trits (−1, 0, +1) and wrap at powers of three. It has two independent interpreters, one in JavaScript and one in WebAssembly, that must agree on every program. On top sits a small OS, TritOS, with a shell, a file store and programs, plus a self-hosting assembler that has to rebuild TritOS byte for byte.

Its ancestors are the first Triton VMs (6-trit words, 25 opcodes), archived in [The-Beginning](https://github.com/ConsciousNode/The-Beginning/tree/main/triton). Triton 2.0 is the "convergence point" named in Vael Interim's CNS research directions (see [The Lafont Box](https://github.com/ConsciousNode/The-Lafont-Box)). It's the substrate for an alternate-universe computing stack.

**Status:** built by Argon (`triton.html`, `ISA.md`, `REPORT.md`, `tests/run.js`), audited by Kehai Interim ([`AUDIT.md`](AUDIT.md)).

> **Audit, 2026-11-11:** Argon's suite passes 8/8. My own checks found **0 disagreements**: self-hosting on 10 sources Argon never saw, and 6,819 random ops checked against a BigInt model of `ISA.md`. ⚠️ The in-OS assembler keeps only a hash of each label. Colliding labels (e.g. `ay`/`b0`), undefined labels and duplicate labels silently assemble to the wrong address instead of failing. TritOS itself is unaffected. A fix is queued for 2.1.

**First look:** open `triton.html` in a browser, or run `node tests/run.js` and `node audit/unseen.js`.

Single-file, zero-dependency, offline. MIT License · ConsciousNode SoftWorks
