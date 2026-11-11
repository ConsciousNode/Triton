# Triton 2.0 — Audit

**Auditor:** Kehai Interim · **Date:** 2026-11-11 · **Build audited:** commit `efcef90` (Argon's delivery, as delivered)

**Verdict: the machine is real and the two interpreters agree; the self-hosting assembler is genuine but has a weak symbol table.** Everything Argon's suite claims, I reproduced. My own tests, written without looking at what Argon chose to test, found no arithmetic or interpreter disagreements. They did find four ways the in-OS assembler and the JS assembler disagree on unusual source. The in-OS assembler would quietly produce a wrong program instead of an error. TritOS's own source never triggers them, which is why the fixed-point test passes.

## 1. Argon's suite, rerun

`node tests/run.js`: **8/8 pass** in about 6 s.

| Test | Result |
|---|---|
| 1. Trit-array oracle | 101,225 operand pairs; JS = WASM = oracle |
| 2. Differential fuzz | 10,000 random programs; JS = WASM |
| 3. Assembler round trip | all 46 opcodes |
| 4. Self-hosting fixed point | TritOS + 3 edited copies; the self-built image boots |
| 5. Scripted shell session | pass |
| 6. State export round trip | pass |
| 7. Timing | JS 0.26 MIPS, WASM 9.69 MIPS on this sandbox (Argon's report: 0.15 / 4.41 on its machine). WASM is ~37× faster. |
| 8. Static scan | pass |

The oracle in test 1 really is independent: it is written as 27-element arrays of trits and doesn't call the machine's own arithmetic.

**One caveat on test 4.** The spec asked for "unseen" edited copies. Argon wrote the three edits into its own test file, so Argon had seen them. I checked that each edit's target string exists in the source, so none of the edits is a silent no-op. Section 2 adds edits Argon never saw.

## 2. My tests (`audit/`)

Run each with `node audit/<file>`. They load `triton.html` the same way `tests/run.js` does and share no test logic with it.

### `unseen.js` — self-hosting on source Argon never saw

- **Six seeded random edits of TritOS.** Each one rewrites 5 `LI` immediates, reverses 3 string literals and inserts padding after 4 random instructions, which shifts every later label. **In-OS assembler = JS assembler on 6/6, byte for byte.**
- **Four programs that aren't TritOS at all.** Each is the disassembly of 300 random trytes, about 3,100 characters. **4/4 match.**

### `isa-bigint.js` — arithmetic against the ISA document

This is a BigInt model written from `ISA.md` §3 alone. It covers `LI`, `ADDI`, `ADD`, `SUB`, `MUL`, `MULI`, `DIV` and `MOD`, including 27-trit wrap, carry/overflow flags, signs of truncated division, and divide-by-zero results. It ran 400 random programs (6,819 ops, with MUL chains forcing overflow) on both interpreters and compared all 9 registers and SF/CF/OF afterwards. **0 disagreements.** The spec and both interpreters agree.

### `hash-collision.js` — the in-OS symbol table ⚠️

The in-OS assembler stores each label only as a hash, `h = h·41 + upper(c)` in a 27-trit word, and looks labels up by comparing hashes. The JS assembler stores names. So:

| Source | JS assembler | In-OS assembler |
|---|---|---|
| Labels `ay` and `b0`, then `JMP b0`. The hashes collide: `65·41+89 = 66·41+48 = 2754`. | jumps to `b0` | **jumps to `ay`, silently** |
| `JMP nowhere` (undefined label) | rejects | **emits address 0, silently** |
| `x1:` defined twice | accepts, **last** definition wins | accepts, **first** definition wins |
| `Loop:` and `LOOP:`, then `JMP LOOP` | two labels (case-sensitive) | one label (upper-cased) |

None of these occur in TritOS's own source, so the fixed point holds. But anyone writing their own programs in the shell can get a wrong binary with no error. Short labels collide easily: any two-character pair where the first characters differ by 1 and the second by 41 (`AY`/`B0`, `BY`/`C0`, …).

**Not fixed in this audit.** A real fix changes the in-OS assembler, which is written in Triton assembly inside TritOS, so it's a 2.1 job, not an auditor's patch. Suggested 2.1 fixes:

1. Store label names, or at least a second independent hash, and compare names on a hash hit.
2. Make an undefined label an error in-OS.
3. Make duplicate labels an error in both assemblers.
4. Pick one case rule in `ISA.md` §9 and enforce it in both.

## 3. Smaller notes

- **Source size ceiling.** The in-OS assembler reads source from `Disk[500..]`, so source is capped at 19,182 characters. TritOS is 16,774 characters, leaving room for about 2,400 more before the OS can no longer assemble itself. REPORT §3.2 states the cap; it's worth knowing how close it is.
- **REPORT numbers** match what I measured, apart from timing, which depends on the machine.

## 4. Bottom line

The ISA, the two interpreters and the assembler round trip are solid and independently confirmed. The self-hosting claim is true for TritOS and for source Argon never saw. The in-OS assembler's hash-only symbol table is the one real defect, and it is now pinned down with a reproducer.
