# Triton 2.0: a balanced-ternary computer, from ISA to shell

**ConsciousNode SoftWorks.** Xinu rules: single-file HTML, zero dependencies, offline, deterministic. Inline everything and label every inline.

## Attached

- `Triton-1.html`, `Triton-XA-1.html` and `Triton-XP-1.html`: the studio's first balanced-ternary VMs (6-trit words, 25 opcodes). They're the ancestors. Learn from them, but Triton 2.0 is a new design.
- MicroWAT (from The-Beginning): the studio's in-page WAT assembler. Use it to assemble the WASM interpreter **inside the page, from WAT text kept in the page**.

## What to build

`triton.html`, a computer whose native arithmetic is **balanced ternary** (trits −1, 0, +1, written `T`, `0`, `1`).

1. **ISA** (`ISA.md`, the normative spec):
   - **Word size:** choose it, e.g. 9-trit trytes and 27-trit words, and justify it.
   - **Registers and addressing:** registers, memory addressing in trytes, and instruction encoding.
   - **Arithmetic:** add, subtract, multiply, divide and compare, all with explicit carry and overflow semantics *defined in ternary*. Words wrap modulo 3^n, never 2^n.
   - **Tritwise logic:** min, max, negation, consensus, and the full set of 1-trit unary ops, defined in ternary terms.
   - **Shifts:** trit shifts, which multiply or divide by 3.
   - **Control:** branches on the sign of the last result (three ways: negative, zero, positive), plus call and return.
   - **I/O:** a port model.
   - **Encoding:** every instruction's trit layout as a table.
2. **Two interpreters that must agree:**
   - a **JavaScript reference interpreter**, written for clarity;
   - a **WASM interpreter** written in WAT, assembled in-page by MicroWAT.

   Differential testing between them is the core correctness check.
3. **Assembler and disassembler** in JS, with a written grammar.
4. **Devices:**
   - **display:** 243×243, each pixel one of 27 colors (3 trits);
   - **keyboard;**
   - **timer;**
   - **storage:** a tryte-addressed disk saved inside the exported page.
5. **TritOS**, written in Triton assembly and running on the interpreter:
   - boot monitor;
   - shell (list, run, type, edit, save);
   - a simple file store on the disk;
   - a text console on the display;
   - at least 3 small programs (a calculator in balanced-ternary notation, a drawing toy, and one game).
6. **Self-hosting:** a Triton assembler written in Triton assembly, running under TritOS, that assembles TritOS's own source to output **byte-identical** to the JS assembler's.
7. **Export:** save the whole machine (disk, memory, state) as a self-contained `.html` that boots where it left off.

## Forbidden

- **No binary semantics leaking into the ISA.** Words wrap at 3^n, and no instruction's result may depend on the host's binary representation. Host binary integers may *implement* the machine, but a test (below) checks every result against a pure balanced-ternary model built from trit arrays.
- **No WASM output copied from JS.** The WASM interpreter may not call into the JS interpreter or reuse its results. The two interpreters share only the ISA document.
- **No hard-coded self-host result.** The self-hosted assembler may not embed the JS assembler's output; the fixed-point test also runs on edited source.

## Tests (`node tests/run.js`, all must pass)

1. **Trit-array oracle.** Every arithmetic and logic instruction, on 100,000 seeded random operands plus all edge cases (max positive, max negative, 0, ±1, overflow boundaries), matches a pure trit-array model in the test file. That model is written independently of both interpreters.
2. **Differential fuzz.** 10,000 seeded random *valid* programs (≤ 500 instructions, bounded steps) give identical final memory, registers, I/O traces and step counts on the JS and WASM interpreters.
3. **Assembler round trip.** Assemble → disassemble → assemble gives identical bytes across the full instruction set.
4. **Self-hosting fixed point.**
   - The in-OS assembler's output on the TritOS source equals the JS assembler's output, byte for byte.
   - It also matches on 3 edited copies of the source, chosen by the test, that the builder has not seen.
   - The image built by the in-OS assembler boots.
5. **TritOS boots** on both interpreters to the shell prompt. A scripted session (list, run calculator, compute a value, save a file, reboot, type the file) gives an identical transcript on both.
6. **Export round trip.** Export → load → continue gives identical state hashes.
7. **Timing.** Instructions per second for each interpreter, printed. No minimum is required: just report it.
8. **Static scan.** No network or storage APIs; strict CSP.

## Report

`REPORT.md` covers:
- the ISA design choices and why;
- measured speeds;
- what TritOS can and can't do yet;
- every place where the docs and code might disagree, checked.

Do not claim anything a test doesn't exercise.
