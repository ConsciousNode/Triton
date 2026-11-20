# AUDIT 2: Triton 4 / TritOS Desktop 2.0, delivery 3 (report_19)
**Auditor:** Kehai Interim · **Date:** 2026-11-18 · **Verdict: accepted, with two minor notes.**

## The unit-26 finding from AUDIT-1 is fixed
- `fs_check_unit26_rpc` and its call site in the media poll are gone (−155 lines of guest code). There's no 420042
  magic, no RPC and no unit-26 special case anywhere in `guest-200.asm` or the built page. I grepped for the magic, for
  `rpc` and `AGENT`, and checked every `CMPI …, #26`: those are a syscall number and a letter-case range.
- The tests now drive syscalls #50..#65 through a **user-mode test app** (`D20_AGENT_ASM`). It sits on a cartridge at
  `2:/apps/AGENT/main`, is launched from the App Shelf with mouse and key events, and talks through ordinary TritFS
  files on unit 26 (`rdy`/`cmd`/`res`/`done`). The magic number now lives in the test app's own file format, in user
  mode, which is fine.
- The harness only touches the machine through input events, media insert/export and framebuffer *reads*. I grepped
  every d20 file for `setMem`/`.mem[`/`reg[`/`setSPR`/`.pc =` and found none; `d20-07` itself forbids `.mem[`,
  `.setMem(` and `.setDisk(`.
- **Positive control (mine):** I made the test app poll unit 25 instead of 26. `d20-01` then fails ("Guest RPC #53 did
  not complete in 6,000,000 steps"). So the user-mode path really carries the tests, and nothing behind it answers.

## Checked
- All 5 files match report_19's sizes and SHA-256 digests. Both machine-block digests match too.
- The two pasted pages are the zip's files minus a trailing newline.
- **`triton4.html` is byte-identical to delivery 2**, so AUDIT-1's t4 results stand. Only these changed:
  - `guest-200.asm` and the desktop page;
  - `d20-03`, `d20-05`, `d20-07` and `d20-common`;
  - REPORT and the d20 log.
- `node build_desktop2.js` in a scratch copy reproduces `tritos-desktop-2.html` byte for byte (`cf316b65…`).
- d20 suite rerun: 7/7 PASS, with every result line identical to their log (128 s). Kept in
  `audit-tools/d20-rerun-delivery-3.log`.
- Both pages loaded in real headless Chromium: 0 page errors, 0 console errors. Screenshot:
  `audit-tools/desktop2-delivery-3-real-browser.png`.
- The Clock now shows a readable `HH:MM:SS`. The old `(RTC mod 1000)·1000 + ms` value is gone; row 1 is honestly
  labelled "ms since boot".

## Minor notes
1. **Two guest changes the report doesn't mention.** Both look like real fixes, but they should be disclosed:
   - the path parser now zero-fills each 20-tryte component buffer before copying (`BFILL` at ~line 21216). Stale
     characters from a longer earlier component could otherwise survive, which is a genuine bug fix;
   - in the falling-block game's hold/swap, `SYSCALL #9` and its store moved after the ghost/save calls.
   Ask for a line each in the next report.
2. **The page's "UTC" clock isn't wall-clock time.**
   - What happens: the page boots its host clock at a fixed `T4_DEFAULT_CLOCK_MS` (2026-11-17 00:00 UTC) and
     advances it 5 µs per step. It never reads `Date.now()`. So the Clock app's "UTC:" row shows time since boot:
     00:00:13 in my screenshot.
   - Deterministic tests are right to inject a clock. The page should pass the real one (`clock: Date.now`).
   - Partly our spec's fault: we said "injectable" and "real time" but never said the page must use the wall clock.

## Disclosed, not a defect
- §2.1: `fsck` of a 3^13-sector unit needs two 3^13 tables and doesn't fit in the card's planned 2^22 = 4,194,304
  trytes. Units of 3^7 and 3^10 fit. This feeds our open "hardware profile" question; it isn't a delivery fault.
