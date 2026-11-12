# Triton 3.0 audit

**Auditor:** Kehai Interim · **Date:** 2026-11-12
**Delivery:** commit `79f84f4` (Argon's bundle, as delivered). The 2.1 files in the bundle were byte-identical to the repo, as the spec required.
**Spec:** [`SPEC-3.0.md`](SPEC-3.0.md) (commit `584f282`, sent before the build).

## Verdict

**Real, and the cleanest Argon delivery yet.** This is a working 27-trit balanced-ternary computer with supervisor and user modes, base-and-limit protection, vectored interrupts, a 729×486 framebuffer, a DMA block disk, a StudioNet NIC, and a text-mode TritOS 3 whose in-OS assembler rebuilds TritOS 3 byte for byte, streaming its source off the disk.

I found **no rigging**:
- no test hooks;
- no bent accessors;
- no host writes into guest memory outside architected DMA and loading.

All 10 suites I could run pass, and my own probes of protection, devices and the browser agree with them.

There is **one real bug**, in the WASM machine only. **T3 addresses at or above 2³² wrap silently instead of faulting**, which breaks M2 ("never wraps silently") and JS = WASM. There is also one carry-over: the WASM console stops after 10,900 I/O events. Neither is fixed here. Both are left failing in `audit/` for a 3.1 patch.

## What I ran

| Check | Result |
|---|---|
| `tests/t3-01` … `t3-10` (delivered) | **10/10 PASS**. 44,617 oracle checks; 10,000 fuzz programs with interrupts; 10,000 T2 programs against `triton.html`; protection; interrupts; disk; self-host; devices; state export; static scan |
| `tests/t3-11-browser.js` (delivered) | Not runnable here, because it needs Selenium. Replaced with my own Playwright run (below) |
| 2.1 suites against the unchanged `triton.html` | `tests/run.js` 8/8, `tests/symbols.js` 6/6 |
| `tests/t3-generate-docs.js`, regenerated to a temp dir | `ISA-3.md` byte-identical. `REPORT-3.md` identical except the timing table, which depends on the machine (here T3 WASM ran 5.50 MIPS vs the reported 7.31) |
| Real browser (headless Chromium via Playwright, `file://`) | **0 page errors.** Boots TritOS 3. `list`, `calc 10T+11` (= 110, i.e. 12), `user` (USR:OK), `fault` (TRAP CAUSE=3), `asm` (ASM OK: 4474 trytes), `net`, `type HELLO` all work. The lockstep indicator stays OK. Screenshot: `audit/t3-browser-boot.png` |

## Read by hand

- **Device model** (`handlePortIn`/`handlePortOut`). Ports only. Disk DMA bounds-checks LBA, count and the RAM range, then raises IRQ_DISK. Keyboard, mouse and NIC are queues that raise IRQ bits. Nothing writes guest RAM except architected DMA.
- **Self-host test.** The assembler that runs is TritOS 3's own, inside the guest. It reads source through disk DMA and writes its output into guest RAM. The test reads the result back and compares it with the JS assembler. Its positive control (a single-RAM-buffer build) really does fail on the 105k-character source.
- **Oracle.** It's an independent trit-array model. It shares only `encodeInstruction` and `tritsToWord` with the machine, so an encoder bug would cancel out. `audit/isa-bigint.js` covers encoding for 2.x; 3.0 encodings have no independent check yet.
- **WASM layout.** Guest RAM, disk, VRAM and the device buffers are separate regions of linear memory, with no overlap at default sizes.
- **Report §6 ("not built").** Honest about paging (optional; base-and-limit built instead) and about the future OSes (excluded by the spec). It claims "0 failing requirements", which the two findings below contradict.

## Audit probes (new, in `audit/`)

**`t3-protection-probes.js`: passes.** Ten user-mode escape attempts, all faulting with PROT_VIOL and leaving kernel memory intact on both JS and WASM:
- a write at ULIMIT, and one at UBASE−1;
- a read of kernel memory;
- BCOPY into the kernel, and BCOPY out of it;
- BFILL over the kernel;
- BCOPY straddling ULIMIT;
- a write to 2³²+400 (aliased);
- a jump into the kernel.

The control (a write inside the window) doesn't fault.

**`t3-badaddr-probes.js`: FAILS, finding 1.** Supervisor loads outside physical RAM:
- At RAM size, RAM+1000, −1, just below the framebuffer, and past its end: all fault with BAD_ADDR on both machines, with the right EADDR.
- At **3²⁵**: both fault, but WASM reports EADDR as `1180052131` (the address mod 2³²) where JS reports `847288609443`.
- At **2³²+2000**: JS faults, but **WASM loads Mem[2000] (31337) with no fault.**
- At **2³²+framebuffer base**: JS faults, but **WASM reads with no fault.**

**`t3-console-cap.js`: FAILS past about 400 commands, finding 2.**
- 50 `calc` commands: JS and WASM consoles match.
- 400 commands: JS holds 10,901 characters and WASM 8,131. WASM's `getConsoleOut()` is rebuilt from the I/O trace, which stops at 10,900 events, and `consoleAcc` is never appended to.

## Findings

1. **WASM truncates T3 addresses to 32 bits** (severity: medium; a correctness bug, not rigging).
   - The MicroWAT core holds effective addresses, PC, SP and SPRs as i32.
   - In supervisor mode, an address ≥ 2³² aliases into low memory instead of raising BAD_ADDR, and EADDR is stored truncated.
   - User-mode protection still holds: the aliased write in the probe faulted on both machines.
   - The differential fuzz never builds addresses that large, which is why it passes. Real programs rarely will either, but M2 requires a fault, and a GUI OS with a big heap could hit it.
   - Fix (3.1): carry addresses as i64 (or check the high trytes before narrowing), and store EADDR/EPC as full words. Add large-address cases to `t3-01` and the fuzz generator.
2. **WASM console caps at 10,900 I/O events** (severity: low; carried over from 2.x, where the audit worked around it in `tests/symbols.js`).
   - The workstation UI shows the JS console, and lockstep compares state hashes, so a user never sees it. Any harness reading `wasm.getConsoleOut()` will, though.
   - Fix: a guest-visible-neutral ring or an append-only console buffer on the host side, as planned for "Triton 2.2: console buffer".
3. **`t3-11-browser.js` needs Selenium** (note only). It's fine as delivered; it just can't run here. The Playwright run above stands in for it.
4. **The REPORT says "0 failing requirements"** (note only). Findings 1 and 2 are failures the delivered suite didn't catch. That's a gap in test coverage, not a misstatement of anything Argon's tests exercised.

## Not changed

I edited nothing in `triton3.html` or the delivered tests. The audit adds only:
- `audit/t3-*.js` (two of the three fail on purpose, documenting findings 1 and 2);
- `audit/t3-browser-boot.png`;
- this file;
- a README status line;
- `index.html` now opening 3.0.
