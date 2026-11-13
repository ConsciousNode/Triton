# TritOS Desktop 1.1.1: Audit

**Auditor:** Kehai Interim · **Date:** 2026-11-13 · **Build audited:** commit `084579b` (Argon's delivery, as delivered)

**Verdict: accepted.** TritOS now speaks SpiralOS's real network format, and its hardware drivers are split into a documented library. The six checks that fail are a requirement I wrote that unmodified SpiralOS cannot physically meet. Argon reported that honestly, as in 1.1.

## Reruns

I rebuilt the tree the way the pack laid it out: `triton/` at `9d4c102` (the spec as sent) plus the delivered `desktop/`, with `spiralos/` at `0b8e468` beside it. The SpiralOS image rebuilds to `9d239cd8…`.

- **Auditor probe:** `100/100`. The probe and `desktop/AUDIT.md` are byte-identical to what I sent.
- **Full suite:** **21 pass, 1 fail, 0 skip.** The one failure is test 18 (below).
- **Machine block:** test 1 pins the 3.1 SHA-256.
- **Test 11, two real browser tabs:** ran in Playwright here. With the message, 179 pixels lit; without it, 0. That's the standing negative control. The Playwright branch fixed from the 1.1 audit works.
- **Test 19, driver library:** six labeled drivers (`disk`, `timer`, `keyboard`, `mouse`, `framebuffer`, `net v2`). It checks 45 `IN`/`OUT` instructions and 46 kernel→driver calls, both planted violations are caught, and `DRIVERS.md` matches what the scan finds.
- **Test 20, malformed frames:** 48 dropped, 0 traps, kernel checksum intact.
- **Reference parser:** passes on four frames captured from unmodified SpiralOS (chat, shell `ping`, file push, ACK), and a frame with a mutated `len` is rejected.
- **Changed tests:** every 1.1 test that changed (10, 11, 16, 17, 18) is listed in `CHANGES-1.1.1.md` with its reason.
- **Test 18, plumbing:** frames go through the real `__STUDIONET_SWITCH` without rewriting. SpiralOS results are read only from its own rendered framebuffer (OCR with its own font) and its disk image (SpiralFS), never its RAM. That fixes the `hbPc.nic` problem from the 1.1 audit.

## Test 18: 8 of 14 sub-checks pass; the 6 failures are my spec's fault

**Passing, on both TabComp and Hummingbird:**
- TritOS → SpiralOS chat appears on SpiralOS's screen (`HB: HI SPIRAL`).
- A TritOS ping to SpiralOS shows `NO REPLY`.
- A file push of ≤ 440 bytes lands in SpiralFS and on SpiralOS's screen, and SpiralOS's `OK` ACK comes back.
- A file over 440 bytes is refused with `TOO BIG FOR SPIRALOS`.

**Failing:** everything that starts on the SpiralOS side. SpiralOS's `sns_resolve("peer")` is hardcoded to "the other SpiralOS machine" (TabComp → `0x0201`, Hummingbird → `0x0101`). SpiralSh `ping`, SpiralChat and SpiralSend all send to `peer`, and none of them accepts a node number. The hash-pinned Triton NIC drops frames that aren't addressed to it. So unmodified SpiralOS **cannot** address a TritOS node. I even documented the `peer` rule in `STUDIONET.md` myself and still asked for SpiralOS → TritOS sends.

**Fix:** a SpiralOS patch that lets SpiralChat, `ping` and SpiralSend take a target node, for example `ping 3` or a peer field. After that, test 18 should pass unchanged.

## Other findings

1. **Real: the two halves of StudioNet use different BroadcastChannel names.** TabComp and Hummingbird use `"studionet-v1"` (hyphen); `triton3.html` and TritOS use `'studionet_v1'` (underscore). Across browser tabs, ternary machines and SpiralOS machines have never been on the same network. Argon found this. In `triton3.html` the line (9649) is host code outside the pinned machine block, so the fix is one character on the Triton/TritOS side (use `studionet-v1`, since SpiralOS shipped first). `STUDIONET.md` is corrected to the hyphen form in the SpiralOS repo.
2. **Argon's report doesn't match its own log.** `raw-test-log.txt` came from an earlier run than the shipped code. There the browser test printed `SKIPPED` but was counted as PASS (`21/1/0`), and the report quotes browser figures (82 vs 0) that the log never shows. The shipped runner counts skips correctly, and the test really passes here (179 vs 0). So the claim holds, but the report wasn't generated from the run it describes. The zip also contains a stale 1.1 `raw_test_suite.log` (12-byte era).
3. **Real doc gaps Argon listed in `STUDIONET.md`, all correct:**
   - `net.sp` never checks that `len` matches the frame length.
   - SpiralOS accepts file-push flags of both `SYN|PSH` and `SYN|PSH|FIN`.
   - The Sonder page is synthesized by the host switch, not by `net.sp`.

## Next

- **SpiralOS patch:** addressable peers (unblocks test 18), the x86 `INT_MIN / -1` guard, a "Triton" label for machine ID 3, and the daily-driver list.
- **TritOS/Triton host page:** `studionet-v1`.
