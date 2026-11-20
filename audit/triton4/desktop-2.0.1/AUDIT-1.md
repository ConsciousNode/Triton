# AUDIT 1: TritOS Desktop 2.0.1, delivery 1 (Gemini 4 Neon)
**Auditor:** Kehai Interim · **Date:** 2026-11-19 (ET) · **Against:** `PREREG.md` (committed before the spec was sent)
**Delivery:** `delivery-1/triton4-tritos-desktop-2.0.1.zip`, sha256 `1775c4be…cb13c4a` (ARRIVED.md)

**Verdict: ACCEPTED.** All eight preregistered criteria hold. AUDIT-3's kernel memory hole is closed, on both backends,
by a check our own probes can see working, and can see missing in the bypass build. Two notes and one lead below; none
blocks.

## The eight criteria
1. **Their tests, rerun by us.** p-01, p-02, p-03, p-04, p-06 and d20-01..07 match their logs line for line (only
   `elapsedMs` differs). p-01: 162 cases (14 valid, 148 bad), 0 JS/WASM mismatches. d20: 7/7 PASS. p-05 is the d20
   suite, rerun directly. p-07 runs on Selenium; we used our own Chromium instead (criterion 7).
2. **Our AUDIT-3 probe, unchanged** (`../triton4-delivery/audit-tools/audit3-probe-user-pointers.js`):
   - 2.0 (delivery 3): `SYS_FS2_READ` wrote into kernel bank 100, slot 7's segment and the TCB table, and
     `SYS_FS2_WRITE` leaked kernel bank 74 into a file.
   - 2.0.1: all three reads return `ERR_BADPTR` (−14) and change nothing, on JS and WASM. The write is refused, so
     `/LEAK` never exists; the probe stops there, because it was written to expect the hole.
3. **Our private extras** (`audit-tools/audit-201-private-probes.js`, a fresh boot per case, JS and WASM: ALL OK):
   - a read over the caller's **own TCB** (the escalation lead) → −14; the file's bytes aren't in the TCB, and UBASE/ULIMIT
     are intact;
   - #51 stat and #50 list, output straddling ULIMIT **by one tryte** → −14, nothing written; the same output ending
     exactly at ULIMIT succeeds (controls);
   - #52 whole-file read (`max_trytes = 0`) of 30 trytes into ULIMIT−10 → −14, **nothing written, not even the part
     that fits**; into ULIMIT−30, it succeeds and the data matches;
   - #54 with a path that has no terminator before ULIMIT → −14.
4. **The positive control is real.** `build_desktop2.js --no-ptr-check` brings back every 2.0 hole in the AUDIT-3 probe,
   and fails all 5 bad cases of the private probes, while their controls still pass. On that build the own-TCB read
   wrecks the agent (its RPC never completes): the escalation lead was real.
5. **Byte-identical where promised.** `triton4.html` sha256 `7550b1df…` is the same as delivery 3. `build_desktop2.js`
   reproduces `tritos-desktop-2.html` (`c12b3f67…`). `gen_desktop_doc.js` reproduces `DESKTOP.md` (`32fa3d34…`) and
   `syscall-table.json` (`1dc058a5…`).
6. **The harness is untouched.** Against delivery 3, no existing test, harness or accessor file changed. The only new
   test files are p-01..p-07, `p-common.js` and `p-run-all.js`. The page diff is the guest image plus `clock: Date.now`
   on both VMs.
7. **Real Chromium** (Playwright, our own): both pages load with 0 page errors and 0 console errors. With the browser
   clock pinned to 2031-02-03 04:05:06 UTC, the desktop's RTC reads 981,173,115 s, the pinned time plus the 9 s the run
   let pass. The Clock app on screen shows 04:05:15 (`audit-tools/desktop2-201-real-browser.png`).
8. **Every guest change is named.** The guest diff (396 lines) is the check routine, the dispatch calls, the length
   checks in `drv_fs_read_impl` and `drv_fs_doc_load_impl`, the `.equ` codes, the `.org` move, and the
   `dfui_cnt_lp` fix. All are in REPORT.md, and so are the two changes 2.0 hadn't disclosed.

## Read by hand: `k_check_user_ptr`
- The pointer must satisfy UBASE ≤ ptr < ULIMIT.
- A length of −1 means a path: it's walked tryte by tryte and refused at ULIMIT if there's no terminator.
- Any other negative length is refused, and a zero length touches nothing.
- Otherwise the end is checked: ptr + len ≤ ULIMIT, with wraparound refused.
- 14 of the 16 syscalls take pointers. The other two really don't: #61 uses kernel constants only, and #62 takes values.

## Notes (not defects)
1. **`K_FS_CHECK_USER` is one global flag** (bank 74 +1452). #52 and #64 set it around the driver call, so the
   driver checks the actual write length only for user calls. That's safe today: SYSCALL enters with `IE ← 0` (ISA §
   traps) and the kernel never writes SPR 2, so a syscall can't be preempted. **If the kernel ever becomes
   preemptible, this flag has to move into the TCB.**
2. **p-03 is a minimal positive control** (2 detections: case (e) for #52 and #53, exactly what the spec asked). Our own
   bypass run (criterion 4) is the stronger one.

## Lead (out of this spec's scope, not tested)
- **#62 lets any user task set the RTC (R0 = 1) and eject or unmount units (R0 = 3).** There's no privilege check on
  those paths. Whether that's intended (a desktop with one user) is a design question for Kham, not a 2.0.1 defect.

## Files
`audit-tools/audit-201-private-probes.js`, `audit-tools/*.log`, `audit-tools/desktop2-201-real-browser.png`.
