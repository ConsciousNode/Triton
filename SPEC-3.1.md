# Triton 3.1: full-width WASM state and a console that never runs out

Studio rules: Xinu (single file, zero dependencies, offline). Inline everything and label every inline: any code copied from another file carries a provenance comment naming its source.

This is a **patch** to Triton 3.0, not a rebuild. Change only what the requirements below need, and list every change in `CHANGES-3.1.md`.

## Attached

- `triton3.html`: Triton 3.0 as delivered and audited. This is the file you patch.
- `triton.html`: Triton 2.1, the T2 reference. **Do not modify it.**
- `ISA-3.md`, `REPORT-3.md`: 3.0 docs (generated).
- `AUDIT-3.0.md`: the audit of 3.0. It describes the two bugs this patch fixes. Where the audit and the docs disagree, trust the audit and the code.
- `tests/`: the 3.0 suites (`t3-*.js`) and the 2.x suites (`run.js`, `symbols.js`).
- `audit/`: the auditor's scripts. **Do not modify anything in `audit/`.** Three of them are new:
  - `t3-protection-probes.js` passes today and must keep passing;
  - `t3-badaddr-probes.js` fails today and must pass after the patch;
  - `t3-console-cap.js` fails today (when run with `400`) and must pass after the patch.

## What to fix

### F1. The WASM machine holds every architected value at full width

In 3.0, `TritonWASM` keeps effective addresses, `PC`, `SP` and the special registers in 32-bit integers. A T3 address at or above 2³² wraps silently into low memory instead of faulting, and `EADDR` is stored truncated. The JS machine is correct.

- Every T3 effective address is computed and bounds-checked at full 27-trit width. An address outside physical RAM and outside the framebuffer raises `BAD_ADDR`, with the **full** address in `EADDR`, exactly as `TritonJS` does.
- **Audit every piece of architected state in the WASM core that is stored narrower than its architected width**, and fix each one, or document it in `ISA-3.md` as a limit that both machines enforce the same way. At minimum check:
  - `PC`, `SP`, `KSP`, `EPC`, `ESP`, `EADDR`, `VBR`, `UBASE`, `ULIMIT`;
  - the disk `LBA`, DMA address and count;
  - the timer period;
  - the step / virtual-clock counter that port 6 returns in T3 mode. At 5–7 MIPS an i32 overflows after about five minutes of running.
- List every field you found and what you did with it in `CHANGES-3.1.md`.

### F2. The console never runs out

In 3.0, `TritonWASM.getConsoleOut()` rebuilds the console from the I/O trace, which stops at 10,900 events. Past that, the WASM console is silently short.

- `getConsoleOut()` returns the full console output for a session of any length, identical to `TritonJS.consoleOut`.
- The I/O trace may keep its cap. The console must not depend on it.
- This is host-side bookkeeping only. Nothing the guest can observe changes.

### F3. Paths and the browser test

- `tests/t3-common.js` and `tests/t3-generate-docs.js` contain hardcoded paths from your build sandbox (`/working_dir/...`). Resolve everything relative to the repo (`path.resolve(__dirname, '..')`). The doc generator writes `ISA-3.md` and `REPORT-3.md` into the repo root.
- `tests/t3-11-browser.js` must not fail the whole run when no browser driver is installed. If it can't launch a browser, it prints `SKIPPED: <reason>`, and `t3-run-all.js` reports passed / failed / skipped counts. A skipped suite is **never** reported as passed. Accept either Selenium or Playwright if one is available.

## Tests

1. **Large addresses in the oracle.** Extend `t3-01` with loads, stores, jumps, `BCOPY` and `BFILL` at addresses spread over the whole 27-trit range. Include 2³¹ ± 1, 2³² ± 1, 2³² + small, 2³² + framebuffer base, 3²⁶, −1 and −2³¹, in both supervisor and user mode. JS = WASM = oracle on the fault, `ECAUSE` and the full `EADDR`.
2. **Large addresses in the fuzz.** In `t3-02`, at least 20% of the 10,000 programs build addresses ≥ 2³¹ in magnitude through `LMI`/`LHI`/`ADDM`/`ADDH`.
3. **Long-run counters.** Run a tight loop for at least 2³¹ + 10⁶ steps on both machines (the JS machine may be checked by state hash at intervals, or with a fast-forward test mode that both machines share). Port 6 and every counter agree, with no wrap.
4. **Console length.** A TritOS 3 session of at least 1,000 commands producing at least 50,000 console characters. `wasm.getConsoleOut() === js.consoleOut`.
5. **Positive controls.** Add a machine option, `narrowWasmState: true` (default false), that reintroduces the 3.0 behavior: 32-bit addresses and the trace-derived console. Tests 1, 2 and 4 must **fail** with it on. That proves they can see the bug.
6. **Everything still passes:** all 3.0 suites, all 2.x suites against the unchanged `triton.html`, and all three `audit/t3-*.js` scripts unmodified (`node audit/t3-console-cap.js 400` included).

## Forbidden

- **If a requirement can't be met, or conflicts with another, say so in `REPORT-3.md` and leave it failing.** Never change accessors, I/O, consoles, test harnesses or anything in `audit/` to make a check pass.
- **The emulator never reads or writes guest-private memory**, except through architected DMA, memory-mapped devices and the debugger. The debugger never feeds results back to tests.
- No special-casing of the probe addresses or test inputs anywhere in the machines.
- No change to the ISA, TritOS 3 or T2 behavior, other than the fixes above. If a fix needs an ISA change, stop and report it instead.
- No network or storage APIs beyond the documented `BroadcastChannel`, and keep the strict CSP.

## Report

- `CHANGES-3.1.md`: every change, with the reason; the full list of narrow fields found in F1 and what was done with each.
- Regenerate `ISA-3.md` and `REPORT-3.md` with the generator. Update REPORT §6 (not built / failing / impossible) honestly.
- Do not describe anything as fixed or working unless a test exercises it.
