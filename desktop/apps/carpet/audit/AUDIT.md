# Audit of CARPET (PR #1)

*Kehai Interim, 2026-11-24.* Written by Ed Interim, checked by someone else, as the README asked.

**Verdict: accept.** CARPET draws what it says it draws, on both cores, pixel for pixel. One small finding (the
ADD panel's corners) and two documentation items, none of which blocks merging.

## What was checked
1. **The receipts reproduce.** `carpet-app-test.js` was rerun on both cores, with the same 7 state hashes on each
   (`7c1277a8 … 90d4f118`) at 14,115,000 steps. All 7 JS screenshots are byte-identical to the 7 committed WASM
   ones, and the cartridge image hash matches (`3ce28f93…`). The source hashes match the README.
2. **The picture is right, not just consistent.** The harness compares the two cores with each other, but not with
   what the ops *should* draw. `audit/oracle-check.js` recomputes every pixel from the per-trit definitions in
   `ISA.md` §4.1, written independently of the emulator's ALU. It then finds the 162 × 108 picture in the
   framebuffer (at 201, 112) and compares all 17,496 pixels for each op.
   - **TXOR, TCON, TANY, TMIN, TMAX: 0 mismatches on both cores.**
   - **Positive control:** the same probe with TMIN swapped for TMAX in the oracle reports 17,388 mismatches on
     that op. The check can see a wrong op.
3. **R8 across syscalls (the README's first question): guaranteed by construction, not just true today.**
   - `syscall_handler` saves R0..R8 into the caller's TCB (`k_save_current_task`, R8 at offset 24), and every syscall
     returns through `sched_restore_current`, which reloads R0..R8 from the TCB.
   - Across the whole kernel, offsets 24..26 are written in exactly two places: the save itself, and task creation
     (`SW R6, R1, #24 ; R8 = UBASE`).
   - Syscalls write back only R0 (every return value), R1 for #60, and R0..R3 for #25 `SYS_GET_EVENT`.
   - Timer, keyboard and mouse preemption take the same save/restore path.
4. **Memory layout (the second question): fine.**
   - `k_init_task_slot` sets SP = UBASE + 4500 for shelf apps (only apps 6 and 11 differ), and ULIMIT = UBASE +
     39,366 (two banks).
   - CARPET's code (362 trytes) sits below the stack; MODE at +5900 sits above the stack top.
   - The buffer at +6000..+23,495 is inside the segment, with 15,870 trytes to spare.
   - Every pixel of the buffer is written before the blit, so leftovers from a slot's previous task can't show.

## Findings
1. **ADD's corners leave the pixel range (minor, cosmetic).**
   - `x + y` runs from −135 to +133, and `MULI R5, R5, #3` makes that −405..+399.
   - A pixel's colour is its low 6 trits (±364). `ISA-3.md` §2 says a pixel tryte's high 3 trits are 0.
   - In the two corners where |x + y| > 121, which is 183 pixels, CARPET stores trytes with a non-zero high
     trit. The framebuffer shows the low 6 trits (−405 appears as +324), so those corners wrap from dark to bright.
   - Both cores agree, and nothing faults.
   - Fix options: clamp ADD to ±121 before the multiply, or scale ADD by 2 instead of 3. Or keep it and say so in
     the README: the wrap is honestly a picture of overflow.
2. **The syscall ABI should be written down (docs, ours).** It's sound today but undocumented, so a future kernel
   could break it silently. Proposed line for `DESKTOP.md`: *syscalls preserve every register except their outputs:
   R0 always; R0..R1 for #60; R0..R3 for #25.* Add a clobber test that checks every register across every
   syscall number.
3. **`SYS_WIN_BLIT_BUF` (#27) takes R5 as the direction flag** (0 = buffer → window), and `DESKTOP.md` doesn't say
   so. Ed found it by reading `wm_user_blit_buf`. This is a docs gap, not an app bug.

## Reproducing
```
cd desktop/apps/carpet
node carpet-app-test.js WASM; node carpet-app-test.js JS
node audit/oracle-check.js WASM; node audit/oracle-check.js JS
```
