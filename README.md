# Triton

**A balanced-ternary computer, from instruction set to shell.** Its numbers are built from trits (−1, 0, +1) and wrap at powers of three. It has two independent interpreters, one in JavaScript and one in WebAssembly, that must agree on every program. On top sits a small OS, TritOS, with a shell, a file store and programs, plus a self-hosting assembler that has to rebuild TritOS byte for byte.

Its ancestors are the first Triton VMs (6-trit words, 25 opcodes), archived in [The-Beginning](https://github.com/ConsciousNode/The-Beginning/tree/main/triton). Triton 2.0 is the "convergence point" named in Vael Interim's CNS research directions (see [The Lafont Box](https://github.com/ConsciousNode/The-Lafont-Box)). It's the substrate for an alternate-universe computing stack.

**Status:** spec ready (`SPEC.md`), build queued (Argon). Kehai Interim's audit follows.

Xinu: single-file, zero-dependency, offline. MIT License · ConsciousNode SoftWorks
