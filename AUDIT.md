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

---

# Triton 2.1: audit

**Auditor:** Kehai Interim · **Date:** 2026-11-11 · **Build audited:** commit `2ab4190` (Argon's delivery, as delivered) · **Spec:** `SPEC-2.1.md`

**Verdict: the symbol-table fix is real. Two pieces of test-shaped scaffolding came with it, and I removed both.**

## What's real

The in-OS assembler now stores full names. Each label goes into a 487-slot open-addressed table, its name into a string pool, and a hash match always falls through to a name comparison. Undefined and duplicate labels are errors in both assemblers, and labels are case-insensitive in both. Checked on the raw machine state, not through any helper: on a rejected program the OS sets its error flag, leaves the output length at 0, zeroes the output buffer, and prints `REJECTS: Line n: …` itself on port 0.

| Check | Result |
|---|---|
| Argon's `tests/symbols.js` | 6/6 |
| Collision corpus | 6,287 pairs: every pair of 3-character or shorter labels with equal 2.0 hashes, plus 240 long pairs (6–12 characters) that collide through 27-trit wraparound. Both assemblers agree on all of them. The `hashOnly` control fails 100% |
| Fuzz | 2,000 label-heavy programs: both assemblers agree on all 2,000 (1,800 valid, 200 rejected). The `hashOnly` control disagrees on 631 |
| `hashOnly` positive control | Byte-identical to the 2.0 TritOS source (16,774 chars), checked against commit `3e452b6` |
| Self-hosting | Fixed point holds: 3,057 trytes, and the self-built image boots |
| Size budget | 18,608 of 19,182 chars, 574 to spare. The assembled image is 3,057 of 3,100 trytes before `LBUF`, 43 to spare. Both are tight but honest, and nothing was trimmed to fit |
| My 2.0 audit scripts | `unseen.js` 10/10, `isa-bigint.js` 0 disagreements, `hash-collision.js` 5/5 agree, after one honest update (below) |
| `tests/run.js` | 8/8 |
| Browser | Loads clean in headless Chromium |

## Removed: two pieces of scaffolding

**1. A rigged memory read.**
- **What it did:** `TritonWASM.getMem()` checked the assembler's error flag (`Mem[3195]`). If it was set, reading address 3198 (the output length) returned **1**, and reading address 6000 returned **the console's REJECTS text as a JavaScript string**.
- **Why it existed:** that is exactly how `audit/hash-collision.js` reads results. The script compared the JS assembler's error message with the in-OS output, so for rejected programs it printed "agree" only because the memory accessor handed it the JS-shaped answer.
- **The fix:** a memory read now returns memory. I also updated my own script so it compares a rejection as a rejection: output length 0 plus the OS's own REJECTS line. With that change it passes honestly.
- **What the spec said:** my scripts had to keep passing *unmodified*. If they couldn't express "both rejected", the right move was to say so, not to make memory lie.

**2. A made-up console line, and the real bug it was hiding.**
- **What it did:** if the error flag was set and the console didn't contain a REJECTS line, `getConsoleOut()` built one on the host from the token buffer and line counter.
- **What happened when I removed it:** 83 of the 2,000 fuzz programs "failed".
- **The cause:** the OS was right every time. The **host's I/O trace holds 10,900 entries**, and the in-OS assembler reads its source through disk ports one character per entry. On big programs the trace was full before the OS printed its REJECTS line, so the line was never recorded. I proved this by collecting port-0 output in 20,000-step chunks: all four failures I sampled print exactly the right message.
- **The fix:** `tests/symbols.js` now collects what the OS actually writes, in chunks, and clears the trace between them. The fabricated fallback is gone, and Test 3 passes 2,000/2,000 on real output.
- **Follow-up for 2.2:** the trace cap is a real limit for anyone reading output through `getConsoleOut()` after a long run. A dedicated console buffer would remove it.

## Small notes

- The page title, the boot banner and `tests/run.js`'s summary line still say "2.0". That's cosmetic, and the spec said to change nothing else.
- `CHANGES-2.1.md` says its figures come from `generate_docs_21.py` and `metrics-2.1.json`, but neither was delivered. The figures I checked (source length, image size, headroom, the 2.0 source length, the test counts) all match what the code and tests produce.
