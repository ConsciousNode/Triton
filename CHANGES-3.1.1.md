# Triton 3.1.1 Patch Log (`CHANGES-3.1.1.md`)

**ConsciousNode SoftWorks · 2026-11-13 · patch by Kehai Interim**

A machine-level patch to `triton3.html` (3.1, commit `f3316d4`). It fixes input queues that died partway through a boot. Nothing else in the machine changed.

## The bug

In Triton 3.1 the WASM core's keyboard and mouse queues were linear arrays of 2,048 slots. Their head and tail counters never reset, so once 2,048 events had arrived in one boot, every later key press and mouse move was silently dropped until reboot. That's about 1,000 key presses, or less than a minute of mouse movement. The machine kept running (the clock kept ticking); only the input stopped.

- Found in the Trytris App 11 audit ([`AUDIT-TRYTRIS-APP.md`](AUDIT-TRYTRIS-APP.md)), confirmed in Chrome, then hit by Kham on his own laptop the same morning: TritOS Desktop 1.1.1 froze for input after ~10 minutes of play while the clock kept counting.
- TritonJS used unbounded arrays instead, so the two cores also **disagreed** after event 2,048.
- The console input queue had the same flaw at a larger size. Its tail kept counting past its 69,632-char storage, so after char 69,632 the guest read unwritten memory instead of what was typed. (Found while writing the new test. On the 3.1 core, 80,000 typed chars reach the guest with the wrong checksum.)
- Snapshot restore wrote pending console chars only into the first 4,096-slot region, which would also break with more than 4,096 pending.

## The fix

| Queue | 3.1 | 3.1.1 (both cores, identical rule) |
| :--- | :--- | :--- |
| Keyboard (ports 10–12) | 2,048 events per boot, then dead | Ring of 2,048 slots. Up to 2,048 *pending*; extra events drop while full (backpressure); unlimited per boot |
| Mouse (ports 13–16) | same | same |
| Console input (ports 0–1) | 69,632 chars per boot, then wrong data | Up to 69,632 chars between drains; recycles whenever the guest has drained it |

Details:
- **WASM (`TRITON_WAT`, ports 11 and 14):** the slot is now `head & 2047`. Head and tail are free-running i32 counters, compared with `(tail − head) > 0`, so they survive i32 wraparound.
- **`TritonWASM.pushKeyEvent` / `pushMouseEvent`:** these write slot `tail & 2047` and accept while fewer than 2,048 are pending. **`pushInputChar`:** it resets head and tail to 0 when drained, and stops advancing the tail when full (no more phantom reads).
- **`TritonJS`:** it applies the same caps, so JS and WASM agree on every event, including the dropped ones. It compacts its arrays when drained, so memory no longer grows forever.
- **`restoreSnapshot`:** it writes through the ring, places console chars in the correct region, and caps at the queue sizes.
- New constants `EVENT_RING_SLOTS = 2048` and `INPUT_QUEUE_CAP = 69632`, next to `balRem`.
- Labels say 3.1.1 (page title, brand, footer; the desktop's instrument header).

No ISA change: ports, vectors and the architected state hash are unchanged, and guest programs need no edits.

## TritOS Desktop picks it up

`desktop/tritos-desktop.html` embeds the 3.1.1 machine block (triton3.html lines 431–9663, byte for byte), re-pinned at SHA-256 `ffc89ac07c9294bc3d746172633dd8d1479d5d361768223501dc73ab65ad2a5d` in the header and in `desktop-01-integrity.js`. The other provenance line ranges it cites in triton3.html moved and were updated (+26 lines from 7,237 on, +28 from 9,635 on). The desktop OS itself is unchanged (still 1.1.1); its own bugs (taskbar garble, Paint drag, editor eating q/r, arrow feel) are for 1.1.2.

## Verification

- **New `tests/t3-12-input-queues.js`** (added to `t3-run-all.js`). A polling guest drains all three queues, with JS === WASM throughout:
  1. 12,000 key events arrive, logged in order.
  2. 12,000 mouse events, with matching count and checksums.
  3. 80,000 console chars (past the old 69,632 lifetime), with matching count and checksum.
  4. With 3,000 events pushed and nothing draining, exactly 2,048 are accepted on both cores, and input works again after draining.
  5. A snapshot taken after the ring has wrapped, with 300 events pending, restores in order.
  6. WASM counters started at 2³¹ − 10 still deliver 50 events in order.
  7. **Positive control:** with 3.1's linear push re-installed, check 1 fails ("received 2048 of 12000 key events").
- **Before/after:** run against the 3.1 file, the same test fails check 1 on WASM (2,048 of 12,000) and check 3 on WASM (wrong checksum after char 69,632).
- **New real-browser soak, `desktop/tests/desktop-29-input-soak.py`** (headless Chromium, real Playwright input through the page's own listeners). 2,600 key events and 2,600 mouse moves go in, then typing and a mouse move must still change the screen (always-changing pixels like the clock are learned and masked first). On 3.1.1 both probes change pixels. **Control:** run with `--expect-dead` against the 3.1 desktop, the screen must not react at all. It takes ~6 minutes, because the page runs 80,000 machine steps per frame and per keydown, so it is not in `desktop-run-all.js`. Run it by hand:
  `python3 desktop/tests/desktop-29-input-soak.py desktop/tritos-desktop.html`
  Result: patched desktop, Terminal probe 47 px and cursor probe 15 px; 3.1 control, 0 and 0. (The first version diffed the whole screen. Its own control failed, because the ticking clock counted as "reacting" on the dead 3.1 desktop, so each probe now watches only its own region.)
- **`t3-run-all.js`: 12/12 pass.** The t3-09 state hashes (T2 `0x80323e41`, T3 `0x70a55fd3`) are identical to 3.1's, so the machine's behaviour is otherwise unchanged.
- **`desktop-run-all.js`: 26/29**, with Trytris and SpiralOS cloned alongside. The three FAILs:
  - **`desktop-14-write`** (fixed in this patch, test-side): it pushed ~2,500 keys in one burst on TritonJS. It passed on 3.1 only through JS's unbounded queue; on 3.1 TritonWASM the same test fails ("got 0"). It now types in 64-key bursts and runs on **both** cores, and passes on both (WASM for the first time).
  - **`desktop-18-spiralos-interop`**: pre-existing. It gives the identical 8/14 on the unmodified 3.1 commit, because SpiralOS hardcodes its peer address (addressable peers are queued for SpiralOS 1.4).
  - **`desktop-27-trytris-browser`**: environment only (it needs selenium + chromedriver).
- Raw output: [`raw-test-log-3.1.1.txt`](raw-test-log-3.1.1.txt). Soak screenshots: `desktop/input-soak-pass.png`, `desktop/input-soak-control.png`.
