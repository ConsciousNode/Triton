# Trytris for TritOS: App 11, a triangular falling-piece game in balanced-ternary guest code

ConsciousNode SoftWorks. Xinu rules: one HTML file, zero dependencies, works offline, MIT. **Inline everything, label every inline:** code copied from an attached file carries a provenance comment naming the file and lines.

Add **App 11: Trytris** to TritOS Desktop. It's a user-mode guest application written in Triton 3 assembly, and it plays the same game as the attached reference page, `trytris/index.html`. The reference is the **oracle**: given the same seed and the same actions, App 11's game state must equal the reference engine's state exactly, every piece, every cell, every point.

## Attached

- `triton/`: the Triton repo.
  - `desktop/`: TritOS Desktop 1.1.1, with its driver library, `DRIVERS.md`, syscalls in `DESKTOP.md`, and tests.
  - `triton3.html`: the 3.1 machine.
  - Read `AUDIT-DESKTOP-1.1.1.md`.
- `spiralos/`: SpiralOS, used only by the existing interop test (test 18). **Don't modify it.**
- `trytris/index.html`: the reference game (`TrytrisEngine`, `SeededBagGenerator`, `createMulberry32`, rotation tables, scoring), plus `trytris/SPEC.md` for the game's rules. Read the `REPORT` block at the bottom of `index.html`, including **Ternary Negation**: clearing an odd number of rows flips every cell above, so its T/F readout is negated. That behavior is intended and must be reproduced.

## Keep from 1.1.1

- The 3.1 machine block, byte for byte (test 1), plus `desktop/audit/calc-no-host-writes.js` and `desktop/AUDIT.md`, unchanged, with the probe passing.
- **Every existing test** keeps its current result:
  - all of them pass except `desktop-18-spiralos-interop.js`;
  - test 18 stays exactly as it is, failing 6 of 14 sub-checks for the documented reason in `AUDIT-DESKTOP-1.1.1.md`.
- App 11 does all hardware access through syscalls and the driver library. No new port access outside a driver: test 19 must still pass, with App 11 included in its scan.
- If you must change an existing test, list it and the reason in `CHANGES-TRYTRIS.md`. Raising the app count (`0..10` to `0..11`) in the launcher, `SYS_SPAWN_APP`, Terminal `RUN`, and tests that enumerate apps is expected.

## What to build

**A. App 11 (guest code)**, launched from the taskbar and `RUN 11`. It must contain all of the following:

1. **Grid:** 12 columns × 28 rows. Rows 0–3 are a hidden buffer; rows 4–27 are visible. A cell `(r, c)` is ▲ when `(r + c)` is even, else ▽, exactly as in the reference.
2. **Pieces:** all 16 pieces: tetriamonds P1–P4 and hexiamonds H1–H12. Each piece has exactly the reference's rotation states, in the reference's order (`def.rotations`).
   - The rotation tables may be generated at build time from the reference definitions, as a labeled lift.
   - A test must compare them cell for cell with the reference.
3. **Modes:** `NORMAL`, `CURSED` and `HEXIAMOND`, chosen before a game starts, with the reference's vocabulary rules.
   - **Starting level** `1..15`, also chosen before a game starts. A new game with seed `S`, mode `M` and starting level `L` means exactly the reference's `reset(S, M)` followed by `setLevel(L)`, in that order. The first piece is spawned during `reset`, at level 1.
   - This includes the CURSED switch at level 5.
   - It also includes the reference's bag filtering and flush when the vocabulary changes (`SeededBagGenerator.nextPiece`).
4. **Randomness:**
   - **Mulberry32:** exact 32-bit results on 27-trit hardware.
   - **Seed:** a decimal entry `0..4294967295`, with the reference's `normalizeSeed` for numeric seeds.
   - **Shuffle:** the reference's Fisher–Yates bag. `Math.floor(prng() * (i + 1))` must be computed exactly, e.g. as `floor(u32 · (i+1) / 2^32)`.
5. **Rules, matching the reference engine:**
   - movement: `moveHorizontal`, `rotate` with its kick list, `stepGravityDown` zig-zag, `softDrop`, `hardDrop`;
   - locking, game over in the buffer rows;
   - `resolveFullRows`: removal, collapse, and the **pre-cleared** check at the start of `tick`.
6. **Scoring:**
   - line-clear base × level;
   - the combo multipliers `1, 1.5, 2, 2.5, 3`;
   - the back-to-back ×1.5 rule;
   - `Math.round`, computed with exact integer arithmetic;
   - level = `min(15, 1 + floor(lines / 10))`, never decreasing.
   - Achievements are optional and must not change state.
7. **Display, drawn by the guest into its window:**
   - real triangles: rasterized ▲/▽ cells, not squares;
   - piece colors from the 729-color palette, plus the ghost piece;
   - the next 3 pieces;
   - score, level, lines;
   - a **T/Z/F readout** of the visible board (▲ occupied = `T`, empty = `Z`, ▽ occupied = `F`), including the active piece, as in the reference panel.
   - The preview must **not** change the random sequence: it reads the bag and never draws from the PRNG beyond what `nextPiece` does.
8. **Two ways to play:**
   - **Live:** gravity paced by the virtual clock, with the reference's level speed curve, converted to virtual steps at a fixed documented rate.
   - **Lockstep** (toggled by a key, shown on screen): one key = one reference engine call, no clock.

     | Key | Reference call |
     |---|---|
     | `L` | `tick('LEFT')` |
     | `R` | `tick('RIGHT')` |
     | `X` | `tick('ROT_CW')` |
     | `Z` | `tick('ROT_CCW')` |
     | `Space` | `tick('HARD')` |
     | `N` | `tick(null)` |
     | `S` | `softDrop()` |
9. **Files** (disk and format documented in `DESKTOP.md`):
   - **`TRYSTATE`:** written by the guest after every lockstep action. It holds:
     - seed;
     - mode;
     - score (27-trit word);
     - lines, level, `comboStreak`, `backToBackActive`, `gameOver`;
     - the active piece (id, rotation index, r, c);
     - the next 3 piece ids;
     - all 28×12 board cells (`0` = empty, else the piece number 1–16: P1–P4 = 1–4, H1–H12 = 5–16).
   - **`TRYHI`:** the high score, loaded at start and persistent across reboots.

**B. Tests**, under `desktop/tests/`. `desktop-run-all.js` runs them alongside the existing ones.

1. **Reference harness:** `trytris-ref.js` loads `TrytrisEngine` and its dependencies from `trytris/index.html`, unmodified. Locate the code by its markers, and record the source line range and SHA-256. It drives the reference headlessly.
2. **Rotation tables:** App 11's tables equal the reference's `rotations` for all 16 pieces, cell for cell. Read them from guest-written output or from the build, and say which.
3. **Lockstep differential** (the core test):
   - **Runs:** 30 seeds × 3 modes, each a seeded random sequence of 300 lockstep actions.
   - **Driving:** the test feeds App 11 through the keyboard device, and feeds the reference the same calls.
   - **Comparison:** compare `TRYSTATE` with the reference state after **every** action for 3 runs, and after every 25 actions plus the final state for the rest.
   - **Coverage:** include `CURSED` runs that start at level 4 and level 5, so the vocabulary switch and bag flush are exercised, plus runs that reach game over. Starting levels are chosen through the guest's own menu, never by writing guest memory.
   - **Report:** the number of states compared, and the first divergence if any.
4. **Ternary Negation:** a scripted odd-row clear flips the cells above it (T↔F in the guest's readout and in `TRYSTATE`), and an even-row clear doesn't. Both agree with the reference.
5. **Screen:** at 20 snapshots during test 3, check from the framebuffer (never guest RAM):
   - every visible cell's centroid pixel is the piece color or the empty color, as `TRYSTATE` says;
   - the T/Z/F readout read off the screen equals the reference's `encodeBoardBalancedTernary`.
6. **Persistence:** `TRYHI` survives a reboot.
7. **Isolation:** App 11 faulted, and App 11 in an infinite loop, are each isolated like the D3 apps (test 16's pattern). Other tasks keep running, and the kernel checksum is intact.
8. **Positive controls** (build-time options; each must make test 3 or 4 fail):
   - `perturbTryRotation` (one rotation state of one piece altered);
   - `perturbTryPrng` (the Mulberry32 increment constant altered);
   - `perturbTryCollapse` (collapse that shears by one column, which removes Ternary Negation);
   - `perturbTryScore` (combo multiplier 1.5 → 2).
9. **Static scan:** the existing scan, extended. The host page contains **no Trytris game logic**: no piece tables used at runtime, no PRNG, no board. Only tests may contain the reference engine. Still no `vm.mem` access anywhere.
10. **Browser:** a real browser launches App 11, plays 20 hard drops in lockstep, and saves a screenshot, with no page errors. `SKIPPED: <reason>` only if no browser can launch. A skip is never a pass.

## Forbidden

- If a requirement can't be met, or conflicts with another, say so in REPORT.md and leave it failing. Never change emulator or VM accessors, I/O, consoles, test harnesses, or the auditor's scripts to make a check pass. An emulator must never read or write a guest's private memory. That includes the machine block, everything in `desktop/audit/`, and everything in `spiralos/`.
- **No game logic on the host.** No precomputed piece sequences, boards, scores, or `TRYSTATE` contents. No code that branches on seed values, test names, or file hashes. The reference engine is used only by tests.
- **Don't edit the reference.** Lift it by markers, unmodified, and record its hash.
- Don't predict, summarize, or rank results anywhere except where a test produced them. Don't describe the game as working, complete, or fun unless a test exercises the claim.

## Report

- `desktop/REPORT-TRYTRIS.md`: what was built and how it was verified, with the test table **generated by the same run whose raw log you include**. Include every conflict and every failing check, the reference's line range and hash, and the virtual-steps-per-millisecond rate for live gravity.
- `desktop/CHANGES-TRYTRIS.md`: every change, including every existing test touched.
- `DESKTOP.md`: App 11, its keys, and the `TRYSTATE` and `TRYHI` formats.
