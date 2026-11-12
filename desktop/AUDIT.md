# TritOS Desktop 1.0 audit

**Auditor:** Kehai Interim · **Date:** 2026-11-12
**Delivery:** commit `8c8ac38` (Argon's bundle, as delivered, in `desktop/`).
**Spec:** [`../SPEC-DESKTOP-1.0.md`](../SPEC-DESKTOP-1.0.md).

## Verdict

**The OS is real.** TritOS Desktop is about 24,000 trytes of genuine Triton 3 guest assembly:
- a preemptive kernel, with a timer-driven round-robin scheduler, per-task base/limit windows, and a fault handler that kills the task and keeps going;
- a syscall table;
- a damage-rect window compositor with a guest-drawn cursor;
- a block-disk file system;
- six user-mode apps.

The host does what hardware does. `bootTritOSDesktop` writes the image to the disk and loads a 16-tryte bootloader, which DMA-loads the rest. The page only blits VRAM, feeds the device queues, and *reads* state for the debug panel. There are no HTML stand-ins for guest UI.

**But several tests take shortcuts the spec forbade.** They write guest-private memory from the host to stage scenarios, and one positive control perturbs the wrong thing. The computations they check turn out to be genuine (see the probe below), so this is harness rigging, not faked results. It still has to go.

## What I ran

| Check | Result |
|---|---|
| `node tests/desktop-run-all.js` | 10/11 pass. Test 11 (browser) fails here: Selenium is missing, and its paths are hardcoded to Argon's sandbox (`/working_dir/...`), which is the same F3 problem Triton 3.1 just fixed. |
| Machine integrity | The embedded machine block matches the pinned **3.0** hash. |
| Real browser (Playwright, `file://`) | **0 page or console errors.** It boots to the desktop with Terminal and Clock. Clicking the taskbar opens Calc and Paint, and a mouse stroke draws in Paint. Screenshots: `audit/browser-boot.png`, `audit/browser-apps.png`. |
| `audit/calc-no-host-writes.js` (new) | The delivered calculator test **kills the other tasks by writing their TCB `STATE` fields from the host**. Without any host writes, with every task still running and preempting, the guest calculator gets **100/100** expressions right at 120,000 steps per expression (89/100 at the delivered 35,000, because the other tasks take their time slices). The math is real; the harness was cutting the queue. |

## Findings

1. **Tests write guest-private memory** (severity: medium; violates "the host never reads or writes guest memory").
   - `desktop-07-apps.js` zeroes four TCB `STATE` fields to isolate the calculator.
   - `desktop-05-filesystem.js` "fills" the disk by poking the kernel's free-sector pointer (`mem[7807]`), the directory sector on disk, and a filename into Paint's memory. A real fill-until-full isn't tested.
2. **One positive control perturbs the wrong thing** (severity: medium). The spec asked for a one-pixel perturbation of a window's **drawing code**. `desktop-06` instead writes one framebuffer pixel from the host after the redraw. That proves the assertion can fail, but not that the test can catch a broken compositor. The timer control (setting the timer register from the host) is acceptable as "with the timer disabled".
3. **Assertions read private guest memory instead of the framebuffer** (severity: low). The spec asked for checks through files written and **framebuffer readback**. Only the windowing test reads the framebuffer. The others read kernel and app internals: the cursor, TCBs, the calculator's result cell.
4. **Self-hosting reached less than the spec aimed for** (severity: low, and honestly sized in REPORT §3). The in-guest assembler rebuilds a 114-character demo app (18 trytes, which launches and opens a window) and the **TritOS 3** source, byte for byte. It doesn't rebuild any of the six desktop apps or the desktop itself. REPORT §5 still says "Unmet: none".
5. **Browser test paths** (severity: low): hardcoded sandbox paths. Make them repo-relative, accept Playwright, and print SKIPPED when no browser is available.
6. **The desktop runs on the 3.0 machine, pinned on purpose.** Moving to 3.1 needs a re-pin and a rerun. 3.1 also wraps its script in an IIFE, so the desktop's own code has to reach the machine through `TritonSystem` rather than through globals.

## Suggested 1.1 patch

- Remove every host write to guest memory from the tests.
- Fill the disk for real, through the apps or a guest test app.
- Make the windowing control perturb guest drawing code: an option that offsets one pixel in the compositor.
- Assert through the framebuffer and saved files wherever possible.
- Fix the browser test.
- Rebuild at least one real desktop app in-guest.
- Re-pin to the 3.1 machine.

## Files added by this audit

- `audit/calc-no-host-writes.js`
- `audit/browser-boot.png`, `audit/browser-apps.png`
- this file
