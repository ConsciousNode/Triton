# Triton 5, stage 1: the machine a native NetBSD port needs

ConsciousNode SoftWorks. Xinu rules: one HTML file, zero dependencies, no network, works offline, MIT licence.
Inline everything, and label every inline (a comment naming where it came from).

## Where this is going
The studio's goal is a **native port of NetBSD to Triton**, the balanced-ternary computer. That means a real
NetBSD kernel and userland compiled for Triton's own instruction set, not an emulated binary CPU. It takes several
rounds: this machine, then a C toolchain (an LLVM or GCC backend), then libc, then the NetBSD port itself.

**This round builds only the machine:** Triton 5, which is Triton 4 plus what the port needs underneath it. Don't
start the compiler or the port, and don't stub them.

## The base
- Repository: https://github.com/ConsciousNode/Triton (public). Start from `triton4.html` (the Triton 4 machine,
  with both a JS and a WASM core), `ISA-4.md` and `SPEC-TRITON-4.md`, and the suites in `tests/` (`t4-*`, `t3-*`).
- Desktop OS: `desktop/tritos-desktop-2.html` (TritOS Desktop 2.0.1) and its tests in `desktop/tests/`.
- Lift what you need, and label every lift with its source file. Trust code over docs where they disagree, and
  report any disagreement you find.

## What to build
1. **`triton5.html`:** the Triton 5 machine, both cores (JS and WASM), with the additions below.
2. **`ISA-5.md`:** generated from the code by a script, like `tests/t4-generate-docs.js`. No hand-typed tables.
3. **`tests/t5-*.js`** and `tests/t5-run-all.js`, writing `results.jsonl` (with code and input hashes) and a
   generated `REPORT-5.md`.

## Addition A: paging
- **Page tables in memory, walked by the machine.** Choose a table format and document it. Each entry has valid,
  read, write, execute and user bits, plus accessed and dirty bits that the hardware sets.
- **An SPR turns paging on.** With paging off, Triton 5 must be **bit-identical to Triton 4**: the same state
  hash after every step, on every existing test.
- **Page faults are precise and restartable.** They need a new vector, with the faulting address and the kind of
  access (read, write or execute, user or supervisor) in SPRs. Every instruction must restart cleanly after the
  handler maps the page, including `BCOPY` and `BFILL` partway through.
- **A TLB** (any size; say what you chose), with instructions or SPR writes to flush one entry and to flush all.
- **Page size is a switch, set at machine creation:** 4,096 trytes, 729 trytes (3⁶) and 2,187 trytes (3⁷). This
  is a real open design question. NetBSD assumes power-of-two pages, while ternary hardware splits addresses
  naturally at powers of three. So build all three honestly:
  - for 3ᵏ sizes, split the address by trit position;
  - for 4,096, split it by real division (quotient and remainder).
  - Don't make one a wrapper that fakes the other.

## Addition B: binary-semantics instructions for C
C requires unsigned integers to behave as pure binary: they wrap at 2ⁿ, and `&`, `|`, `^`, `~`, `<<` and `>>`
act on bits. Triton words are 27 trits, which holds every 32-bit value but not every 64-bit value. Provide a
small, documented set of instructions that make this efficient and exact:
- wrap a word into [0, 2ⁿ) and into the signed range [−2ⁿ⁻¹, 2ⁿ⁻¹), for n ≤ 32;
- bitwise AND, OR, XOR and NOT, plus shifts (left, logical right, arithmetic right), on words holding binary
  values;
- whatever the 64-bit case needs on register pairs (carry or quotient out, for add, subtract, multiply and
  shifts), with a written explanation of how a compiler would lower `uint64_t` operations to them.

These instructions are for C's binary semantics only. Nothing else in the machine changes meaning.

## Addition C: what a kernel needs
- **An atomic compare-and-swap** on a word in memory.
- **Wait-for-interrupt:** sleep until an interrupt arrives. `HALT` keeps its meaning, halt until reset.
- **Anything else** you find NetBSD's machine-dependent layer needs from the hardware. List each one in the
  report with the reason, and don't add anything without one.

## Measurement for the page-size decision (an instrument, not a verdict)
Run a fixed, seeded workload set under all three page sizes:
- sequential sweep;
- random access;
- a fork-like copy-on-write pattern;
- a TLB-thrashing pattern.

Report, per page size:
- the steps spent in table walks;
- TLB hit rate;
- the cost of splitting the address (steps, or gate-level operations if you model them);
- table memory used.

**Don't recommend a page size.** The studio makes that decision from your measurements.

## Forbidden
- Any change to Triton 4 behaviour when paging is off.
- A page-size mode implemented by translating to another mode.
- Precomputed results or test-shaped special cases; branching on test names or inputs.
- Changing existing tests, harnesses, accessors or console paths to make a check pass.
- An emulator reading or writing a guest's private memory, except through documented ports and DMA.

## Tests (numbered; each writes a line to results.jsonl)
1. **Compatibility:** with paging off, every existing `t4-*` and `t3-*` suite passes, and TritOS Desktop 2.0.1
   boots and passes its suites, with state hashes identical to Triton 4 over the same runs.
2. **JS and WASM in lockstep:** state hashes equal after every step for at least 2,000,000 steps of seeded
   programs using every new instruction, with paging on in all three page-size modes.
3. **A paging oracle:** a pure, independent model of the page tables and permission checks, written separately
   from the cores. On 100,000 seeded accesses per page size, the machine's translations and faults match it.
4. **A binary-semantics oracle:** every new instruction against BigInt, on edges (0, 2ⁿ−1, −2ⁿ⁻¹, carries across
   the pair boundary) plus 1,000,000 random cases each.
5. **Restartability:** for every instruction class, including `BCOPY` and `BFILL` partway through, fault on a
   missing page, map it in the handler, resume, and confirm the final state equals a run with no fault.
6. **Positive controls that must fail:**
   - a mutant MMU that skips the user-bit check;
   - a mutant that never sets the dirty bit;
   - a mutant `WRAPU` that is off by one;
   - a mutant `BCOPY` that restarts from the beginning instead of resuming.
   Each must be caught by the tests above.
7. **Atomics:** compare-and-swap is correct under interleaved interrupts, against a model.
8. **The page-size measurements**, as above.
9. **Real browser:** `triton5.html` loads with 0 console errors and boots TritOS Desktop. Say how you tested it.

## Report
State what was built and how each claim was verified. Don't describe anything as working unless a test exercises
it. Mark every number as measured. Don't predict or rank.

If a requirement can't be met, or conflicts with another, say so in REPORT-5.md and leave it failing. Never change
emulator or VM accessors, I/O, consoles, test harnesses, or the auditor's scripts to make a check pass. An emulator
must never read or write a guest's private memory.
