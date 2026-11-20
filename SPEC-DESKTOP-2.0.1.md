# TritOS Desktop 2.0.1: syscall argument validation, generated docs, wall clock
ConsciousNode SoftWorks (Kham & Kehai Interim). Xinu rules: single-file pages, zero dependencies, offline-first.
Inline everything, label every inline: code lifted from the attached tree keeps a provenance comment.

This is a small point release on top of the attached Desktop 2.0 tree. Keep the scope small. Don't add features.

## Attached
- `base/triton4-tritos-desktop-2.0.zip`: the Desktop 2.0 tree, delivered 2026-11-18. It's the starting point.
  - Its sha256 is `f52287b0c5b5df47baaa395db8dc7dd4ecd90dc50ac5070b6bcd576197fdd5f6`. Verify it before you start, and record it in REPORT.md.
  - Where its docs disagree with `desktop/guest-200.asm`, the code is right.

## What to build

### 1. Pointer validation for syscalls #50..#65
1. **Check every pointer argument.** A pointer argument is any argument that names guest memory: a buffer, a path or a struct.
   - Before the kernel reads or writes guest memory through it, check that the whole range lies inside the calling task's `[UBASE, ULIMIT)`. These are TCB fields +36 and +39.
   - "The whole range" means from the pointer through pointer + length − 1.
     - For a write into a buffer, the length is the number of trytes the call would actually write. That includes the "read the whole file" case where `max_trytes <= 0`, so the range check happens *before* any data is copied.
     - For a zero-terminated path, it's through the terminating zero. If no terminator turns up before `ULIMIT`, the call fails.
2. **On failure:**
   - Return one new, documented error code. Name it `ERR_BADPTR`, choose its value, and document it.
   - Write no guest memory outside the caller's range, change no disk, and leave other tasks untouched.
   - The caller keeps running.
3. **The App 4 assembler workspace** keeps its own buffer bounds through the same TCB fields. Its check isn't hardcoded separately.
4. **One check routine.** Put the check in a single kernel routine that every pointer-taking handler calls.

### 2. Error codes
Document every error code the path syscalls return, including any `ERR_FS_*` codes. Distinct failures get distinct codes where the code already distinguishes them. Don't invent distinctions the code doesn't make.

### 3. Generated documentation
- Add a script, `desktop/gen_desktop_doc.js`. It reads `guest-200.asm` and generates:
  - `DESKTOP.md` §7, the syscall table. For each syscall it gives the number, name, arguments (marking which ones are pointers, and how each one's length is determined), the return value and the error codes. The table for the path syscalls must come from the dispatch code itself.
  - `DESKTOP.md` §8.1, the task start state: R0..R8, PC, SP (including the per-app exceptions), ESR, UBASE and ULIMIT, all as the code sets them.
- The script also writes `desktop/syscall-table.json` with the same data.

### 4. Wall clock on the page
- The desktop page passes the browser's real clock to the machine (`clock: Date.now`) when it boots in a browser.
- Tests keep injecting a fixed clock, as they do now.
- Don't change `triton/triton4.html`. It must stay byte-identical to the attached tree.

### 5. Disclose earlier changes
The 2.0 report didn't mention two guest changes that are in the attached tree. List both in REPORT.md, one line each:
- the path parser zero-fills each component buffer before copying;
- in the falling-block game, the hold/swap reorders `SYSCALL #9` and its store.

## Tests (new, numbered p-01..p-07; the existing suites stay as they are)
- **p-01 pointer probes.** The probes run from the existing user-mode test agent (the d20 harness on unit 26). They are driven by `syscall-table.json`, so every pointer argument of every syscall #50..#65 gets probed. For each pointer argument, the cases are:
  - (a) a valid in-range pointer. This is the control: the call behaves as it did before.
  - (b) one tryte below UBASE;
  - (c) exactly ULIMIT;
  - (d) starts inside and ends outside;
  - (e) kernel memory;
  - (f) another live task's segment;
  - (g) the TCB table;
  - (h) for paths only, a path with no terminator before ULIMIT.

  Pass means all of the following:
  - every bad case returns `ERR_BADPTR`;
  - a full snapshot of guest RAM outside the caller's range is identical before and after the call;
  - every unit's exported image hashes the same before and after;
  - the agent is still running.

  The probes run on both `TritonJS` and `TritonWASM`, and results must match between them.
- **p-02 coverage.** The number of syscalls #50..#65 in the dispatch code equals the number of rows in `syscall-table.json`. Every row is marked either "pointer args: none" or with its list of pointer arguments. A syscall missing from the table fails the test.
- **p-03 positive control.** A build flag, `--no-ptr-check`, builds a page with the check routine bypassed. p-01 run against that build must fail on at least case (e) for `SYS_FS2_READ` and `SYS_FS2_WRITE`. The shipped page must not be built with the flag, and a static test checks that.
- **p-04 docs.** Running `gen_desktop_doc.js` reproduces the committed §7, §8.1 and `syscall-table.json` exactly.
- **p-05 regressions.** All existing Desktop 2.0 suites (d20-01..07 and the earlier desktop tests) still pass, with their logs included. If a test had to change, say which one and why. Never weaken an assertion.
- **p-06 builds.** `node build_desktop2.js` reproduces the shipped page byte for byte.
- **p-07 real browser.**
  - The desktop page and `triton4.html` load in real headless Chromium with 0 page errors and 0 console errors. Save a screenshot of the Clock app.
  - With the browser clock fixed by the test harness to 2031-02-03T04:05:06Z, the guest's RTC is within 2 seconds of that time.
    - Read it through the existing documented RTC syscall from a user task.
    - If a user task can't be driven inside the browser, say so in REPORT.md. Instead, read the Clock app's on-screen time with the framebuffer text reader the existing tests already use (`readFbString`). Never read it from host clock variables.

## Forbidden
- Checking only the start of a range, or only some syscalls.
- Special-casing the probe addresses, the test agent, unit 26 or test names in the kernel.
- Changing any VM or emulator accessor, I/O path, console, memory-read helper or test harness function that the tests read results through. New test files may call the existing ones. Ship a diff of the harness files against the attached tree. It must show additions only.
- Host code that reads or writes guest memory to make a test pass. An emulator must never read or write a guest's private memory.
- Hand-written §7 or §8.1 text, or tables typed into REPORT.md.
- Changing `triton/triton4.html`.

**If a requirement can't be met, or conflicts with another, say so in REPORT.md and leave it failing. Never change emulator or VM accessors, I/O, consoles, test harnesses, or the auditor's scripts to make a check pass. An emulator must never read or write a guest's private memory.**

## Measurement and results
- Every test run appends a line to `results.jsonl` with these fields: test id, backend, seed, sha256 of the built page, sha256 of `guest-200.asm`, pass/fail, and the printed numbers.
- Every number in REPORT.md is copied from a log or generated by a script, never typed.

## Deliver
- One zip containing:
  - the full updated tree;
  - `REPORT.md`, `CHANGES-2.0.1.md`, the logs, `results.jsonl` and the harness diff.
- In REPORT.md, cover:
  - what was built;
  - every guest change, one line each (including the two lines from §5 above and any fix found along the way);
  - each test's printed numbers;
  - every requirement not met;
  - anything you looked at beyond the attachment.
- Do not describe anything as working unless a test exercises it.
