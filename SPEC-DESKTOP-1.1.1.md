# TritOS Desktop 1.1.1: one StudioNet, and a driver library

ConsciousNode SoftWorks. Xinu rules: one HTML file, zero dependencies, works offline, MIT. **Inline everything, label every inline:** code copied from an attached file carries a provenance comment naming the file and lines.

This is a patch on TritOS Desktop 1.1, which you built and which passed audit. Two goals:

1. **Speak the network SpiralOS actually ships.** In 1.1 you found that SpiralOS's old `STUDIONET.md` (12-byte header) contradicted its `os/net.sp` (16-byte header). You were right, and you left the test failing honestly. That was the correct call. The doc has since been rewritten to match the code. TritOS now moves to that real format.
2. **Start a driver library.** TritOS's hardware drivers become separate, labeled modules with a documented interface, so later OSes and versions can reuse them.

## Attached

- `triton/`: the Triton repo, with your 1.1 delivery in `desktop/` and the audit in `AUDIT-DESKTOP-1.1.md`. Read the audit. `triton3.html` is the 3.1 machine.
- `spiralos/`: SpiralOS 1.2.1, including the **corrected `STUDIONET.md`** (sections 1–2), `os/net.sp`, `spiralos.img`, `tests/harness.js`, `tabcomp.html`, `hummingbird.html`. Used only for interop tests. **Don't modify anything in it.** If `STUDIONET.md` and `os/net.sp` still disagree anywhere, `net.sp` is the authority. Say so in `REPORT.md`.

## Keep from 1.1

- The 3.1 machine block, byte for byte, pinned by SHA-256 (test 1). The Triton NIC passes bytes through: it accepts frames of length ≥ 12 and filters on `dst` (bytes 0–1). Nothing about the new format needs a machine change. The machine block's own `buildStudioNetFrame` / `parseStudioNetFrame` helpers are 12-byte. **Leave them as they are, and don't use them as the reference any more.**
- `desktop/audit/calc-no-host-writes.js` and `desktop/AUDIT.md`: unchanged, and the probe still passes.
- Every 1.1 test that isn't about the wire format keeps passing unchanged. If you have to change a 1.1 test, list the change and the reason in `CHANGES-1.1.1.md`.

## What to build

### A. Driver library (guest code)

Split the kernel's hardware code into driver modules: **keyboard, mouse, timer, disk, framebuffer, net.** For each one:

- One contiguous, labeled section of guest assembly source: `; ==== DRIVER <name> v<n> ====` … `; ==== END DRIVER <name> ====`.
- A fixed **entry table** at the start of the driver (for example `init`, `irq`, `poll`, `read`, `write`; only the entries that driver needs). The rest of the kernel calls the driver **only** through its entry table.
- A declared list of the **ports** it uses and the **kernel memory ranges** it owns.
- New file `desktop/DRIVERS.md`, one section per driver:
  - entry table, with the registers in and out of each entry;
  - ports;
  - memory;
  - IRQ vector;
  - what it does on errors.
  Write it for a reader building a different OS on Triton.

The behavior of every driver except net stays the same as 1.1.

### B. StudioNet driver v2 (`net`): the 16-byte format

Frames follow `spiralos/STUDIONET.md` section 2, byte for byte: a 16-byte header, little-endian, **no checksum**, payload ≤ 480 bytes. The driver keeps the receive interrupt and the frame queue. TritOS node IDs stay `0x0003..0x0006`, set in the page.

**Bytes vs trytes.** A frame carries bytes and a TritOS file holds trytes. One byte goes into one tryte as `0..255`. Text (chat, filenames) is ASCII bytes.

**Services:**

1. **Chat:** SDP (`proto 2`), `sport = dport = 4200`, flags `PSH`, payload = message + NUL (`len` includes the NUL).
   - A received chat from any node shows in Net with its sender's node ID in hex.
   - Chat with SpiralOS (TabComp `0x0101`, Hummingbird `0x0201`) and with other TritOS desktops.
2. **Ping:** SDP on port **7**.
   - The request has flags `PSH` and any payload.
   - TritOS answers every port-7 request with flags `ACK|PSH`, the same payload, and `ack = seq + 1`.
   - Net shows the round-trip time in virtual steps.
   - SpiralOS doesn't answer port 7. If no reply comes within a fixed, documented step budget, Net shows `NO REPLY`. **Never fake a reply.**
3. **File push:** SSP (`proto 3`), port **4300**. The payload starts with a 32-byte name block: the name, then a NUL, then zeros. Bytes after the NUL are ignored by SpiralOS, so TritOS uses them for metadata:
   - `block[24]` mode: `'B'` = byte mode (every tryte is in 0..255, sent one byte per tryte), `'T'` = tryte mode (two bytes per tryte, signed 16-bit LE).
   - `block[25..28]` total file length in trytes (u32 LE).
   - `block[29..30]` chunk index (u16 LE).

   **Single frame:** a file whose encoded data fits in **440 bytes** goes as one frame, flags `SYN|PSH|FIN`. This is exactly what SpiralOS accepts.

   **Larger files** go TritOS-to-TritOS in chunks:
   - The first chunk (`SYN|PSH`) goes on port 4300.
   - The middle chunks (`PSH`) and the last one (`PSH|FIN`) go on port **4301**, so SpiralOS never sees them.
   - The receiver puts the file together and writes it to its file system only once every chunk is in.

   **Size limit for SpiralOS:** TritOS refuses to send a file whose encoded data is over 440 bytes to `0x0101`, `0x0201` or `0x00FE`. It shows `TOO BIG FOR SPIRALOS` and sends nothing.

   **Acknowledgement:** the receiver answers each file frame with SSP flags `ACK`, payload `OK`, `ack = seq + 1`, as SpiralOS does. TritOS records the round-trip time to that ACK, which is the only round trip SpiralOS offers.

   **Receiving from SpiralOS:** a file pushed by SpiralOS (a single frame, no mode byte) lands as a byte-mode file, with the name cut to TritOS's 8 characters, uppercased.
4. **Malformed frames:** frames shorter than 16 bytes, or whose `len` disagrees with the frame length, are dropped and counted. They never fault the kernel. The 1.1 flood test (1,000 frames, bounded queue) still applies.

### C. Punch list from the 1.1 audit

1. `desktop-11-browser.js`: the Playwright branch never launches, and crashes into Selenium-only code. Make each engine branch complete, try Playwright then Selenium, and print `SKIPPED: <reason>` only when neither can launch.
2. The debug panel shows `PSW: undefined`. Show the real value, read through `TritonSystem`, or drop the field.
3. Make the auditor's two extra checks standing tests (see Tests 4 and 5).

## Forbidden

- If a requirement can't be met, or conflicts with another, say so in `REPORT.md` and leave it failing. Never change emulator or VM accessors, I/O, consoles, test harnesses, the machine block, anything in `desktop/audit/`, or anything in `spiralos/` to make a check pass. An emulator must never read or write a guest's private memory, and no host page or test reads or writes `vm.mem`.
- **No host-side protocol stack.** Frames are built and parsed by guest code. The host only relays NIC bytes (`txHooks`, `receiveNetFrame`, `BroadcastChannel`).
- **No special cases keyed on test names, seeds or file hashes.** No precomputed frames. No faked replies, ACKs or `NO REPLY` timings.
- **No reading SpiralOS state** except through what SpiralOS itself shows, sends or writes: its frames, its framebuffer as rendered by its own emulator, and its disk image once SpiralOS has written it (read the way SpiralOS's own test tools read SpiralFS). Never read its RAM.
- Heads-up from the 1.1 audit: 1.1's `desktop-18` handed TritOS frames to `hbPc.nic`, but Hummingbird's NIC is `snet`, registered on `__STUDIONET_SWITCH`, so those frames probably never reached SpiralOS. In 1.1.1, prove delivery by what SpiralOS shows or answers, not by having called a function.
- Don't predict or summarize results anywhere except where a test produced them. Don't describe anything as working unless a test exercises it.

## Tests

`node desktop/tests/desktop-run-all.js` runs everything and reports pass / fail / skip. A skip is never a pass.

1. **All of 1.1, still passing:** integrity (same SHA-256), determinism, preemption, faults, filesystem, windowing, apps, self-hosting, Klondike, Tetris, Write, Sheet, isolation and flood, positive controls, static scan, and the auditor probe. Retire or rewrite only the tests that checked the 12-byte format, and list them.
2. **Reference parser:** a new `desktop/tests/studionet16-ref.js`, written from `STUDIONET.md` section 2. It does **not** use the machine block's helpers.
   - Cross-check it on real frames captured from **unmodified SpiralOS** in `harness.js`: chat, shell `ping`, file push, ACK. It must parse every one, with `len` equal to the frame length minus 16.
   - Positive control: a frame with its `len` field changed must be rejected.
3. **Two TritOS nodes** (3 and 4), checked byte for byte with the reference parser and on each screen through framebuffer reads:
   - chat both ways;
   - ping with a real reply and a round-trip time above 0;
   - a byte-mode file in one frame;
   - a tryte-mode file of 3 sectors (2,187 trytes) in chunks, with negative trytes, arriving with 0 differences;
   - a missing filename sends nothing.
4. **Custom filename (standing):** node 4 saves a file through the guest, the test types its name in Net and presses Ctrl+F, and node 3 receives it with 0 differences.
5. **Two real browser tabs, with a negative control (standing):** chat from node 3 lights the RX line on node 4, and the same run without the message lights none of it. Report both counts.
6. **SpiralOS interop**, booted unmodified in Hummingbird **and** in TabComp through `harness.js`:
   - TritOS → SpiralOS chat appears on SpiralOS's screen.
   - SpiralOS → TritOS chat (typed into SpiralOS's own UI or shell) appears on the TritOS screen.
   - SpiralOS shell `ping` arrives at TritOS as chat.
   - TritOS ping to SpiralOS shows `NO REPLY`.
   - TritOS pushes a byte-mode file of ≤ 440 bytes to SpiralOS: TritOS receives SpiralOS's `OK` ACK, and the file is visible through SpiralOS's own shell or files UI.
   - SpiralOS pushes a file to TritOS, and it lands in the TritOS file system.
   - A file over 440 bytes to a SpiralOS node shows `TOO BIG FOR SPIRALOS`, and no frame is sent.
7. **Driver library:**
   - **(a) Static check:** every `IN`/`OUT` (or port access) in the guest source sits inside a driver section and uses only that driver's declared ports.
   - **(b) Static check:** kernel code outside the drivers reaches driver code only through entry tables.
   - **(c) Positive controls (build-time options):** one stray port access added outside a driver, and one direct call that bypasses an entry table. The static checks must catch each one.
   - **(d)** `DRIVERS.md` lists exactly the ports and entries the static scan finds. The test compares them.
8. **Malformed-frame robustness:** short frames, a wrong `len`, unknown protocols, and unknown ports, in random mixes (fixed seed). No faults, the kernel checksum is unchanged, and the drop counter matches.
9. **Static scan:** CSP, offline, labeled inlines, and no `vm.mem` access in the page or the tests.

## Report

- `REPORT.md`: what was built, and the test table generated from the test run, never typed by hand. Include every conflict you found and every check left failing.
- `CHANGES-1.1.1.md`: every change from 1.1, and every 1.1 test changed or retired, with the reason.
- `DRIVERS.md`.
- The raw test log.
