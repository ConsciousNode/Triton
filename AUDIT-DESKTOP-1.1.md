# TritOS Desktop 1.1: Audit

**Auditor:** Kehai Interim · **Date:** 2026-11-12 · **Build audited:** commit `e97101a` (Argon's delivery, as delivered, in `desktop/`)

**Verdict: accepted. Every finding from the 1.0 audit is fixed, and the new apps and network stack are real guest code.** The one failing test is a real contradiction, and it's mine. I sent Argon a `STUDIONET.md` that disagrees with the SpiralOS code it claims to describe. Argon spotted it, left the test failing as the spec required, and documented the exact bytes. That's the behaviour the spec asked for.

## 1. Argon's suite, rerun

I rebuilt the tree from scratch: this repo at `89f0f02` (the spec as sent), the delivered `desktop/`, and SpiralOS 1.2 (`spiralos` commit `0d950d8`) in `spiralos/`.

- `node desktop/audit/calc-no-host-writes.js`: **100/100**, with the other tasks still running. The probe and `desktop/AUDIT.md` are byte-identical to what I sent.
- `node desktop/tests/desktop-run-all.js`: **16 pass, 2 fail.** Argon's machine got 17/1. The difference is test 11 (see 3.2): it failed here because of a launcher bug, not a desktop bug.
- Test 1 pins the embedded machine block to `24f32f41…a3831`, the 3.1 hash.
- Test 10 (static scan) passes. There are no `vm.mem[` reads or writes in the page or in any test. The one host-side disk write left (test 17 staging `BIGFILE`) goes through the architected `exportDiskImage`/`importDiskImage`, which is the page's Import Disk button, not a memory poke.

## 2. The StudioNet contradiction (test 18): my error, Argon's catch

SpiralOS 1.1 shipped a `STUDIONET.md` that documents one wire format while its `os/net.sp` implements another:

| | `STUDIONET.md` (doc) | `os/net.sp` (code that actually runs) |
|---|---|---|
| Header | 12 bytes, with checksum | 16 bytes, no checksum |
| Fields | dst, src, proto, ttl, seq, len, csum | dst, src, proto, flags, sport, dport, seq, ack, len |
| Protocols | 1/2 echo, 3 SDP, 4 SHP, 5 SFP | 1 SNS, 2 SDP, 3 SSP |
| Chat port | 900 | 4200 |
| Hummingbird node | `0x0002` | `0x0201` |
| Ping | echo request/reply | a chat datagram to port 4200; no echo handler |

I passed the doc along as the authority without checking it against the code. The Triton 3.x workstation was built to the doc, so it speaks 12-byte frames. TabComp, Hummingbird and Sonder all run `net.sp`, so they speak 16-byte frames to each other, and that's why nobody noticed. Argon checked both, found they disagree, and refused to fake either side.

**Scope of the fix.** The Triton 3.1 NIC is a byte pipe: it accepts any frame of length ≥ 12 and filters on the destination in bytes 0–1, which sit in the same place in both formats. So the fix needs no change to the hash-pinned machine block. It's a choice of canonical format, then a guest-side driver change:

- **(a) Recommended:** make the doc tell the truth (16-byte, as SpiralOS ships), and give TritOS a 1.1.1 driver that speaks it, including SDP chat on port 4200.
- **(b)** Move SpiralOS to the 12-byte format. That touches TabComp, Hummingbird, Sonder and the shell, and adds the echo protocol.

Either way, the Triton workstation's own chat app (3.x guest code) should move to the same format.

## 3. My checks

Scripts are in `audit/desktop-1.1/`.

### 3.1 Two real browser tabs, with a negative control (`two-tab-broadcast-control.py`)

I loaded the page twice over HTTP in Playwright and headless Chrome, as node 3 and node 4. I ran `RUN 10` in both, typed `BCCHAT OK` on node 3, and counted lit pixels in node 4's RX line. I did the same again without typing the message.

- With the message: **125 lit**. Without it: **0**. No page errors.
- The node 4 screenshot (`two-tab-node4-received.png`) shows `RX: BCCHAT OK`.

Argon's test only checks "more than 20 lit pixels". The control is what shows those pixels come from the message.

### 3.2 Bug: the browser test's Playwright branch never launches

`desktop-11-browser.js` imports Playwright, sets `engine = 'playwright'`, and never starts it. It then runs Selenium-only code on `driver = None` and crashes. So on any machine that has Playwright installed, the test reports FAIL instead of running or printing SKIPPED. On Argon's machine it only ever ran through Selenium. It's minor, and the claim it tests is true (3.1). It goes in the next patch.

### 3.3 Custom-filename send (`custom-filename-send.js`, run with `node … <path-to-desktop>`)

No test covers typing a name before Ctrl+F. I tested it on node 4:

- Node 4 saved its own status file `NET` through the guest (Ctrl+S).
- I typed `NOPE` (no such file) and pressed Ctrl+F. Nothing was sent, nothing landed on node 3, and node 4 kept running.
- I typed `NET` and pressed Ctrl+F. It arrived on node 3: **100 trytes, 0 diffs**, in one frame.

### 3.4 Interop test plumbing

`desktop-18` hands TritOS frames to `hbPc.nic`. Hummingbird has no such property: its NIC is `snet`, on `__STUDIONET_SWITCH`. So TritOS→SpiralOS frames probably never arrived. This didn't affect the verdict, because the test failed on the format first anyway. The 1.1.1 spec requires delivery to be proven by what SpiralOS shows or answers.

### 3.5 Cosmetic

The debug panel shows `PSW: undefined`.

## 4. What's next

1. Kham picks the canonical StudioNet format (2a or 2b).
2. TritOS 1.1.1: driver on the chosen format, fix the browser test's Playwright branch, fix the PSW readout, and add 3.1 and 3.3 to the suite as standing tests.
3. Rerun test 18 against SpiralOS. It should pass without touching `spiralos/`, if we pick (a).
