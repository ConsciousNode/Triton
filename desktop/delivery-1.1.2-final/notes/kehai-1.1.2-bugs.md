# TritOS Desktop 1.1.2 / Triton 3.1.1 bug list (Kham's real-laptop playtest, 2026-11-13 06:32)

Kham played TritOS Desktop 1.1.1 from Pages on his laptop. Reported (his words):
1. "The taskbar bugs out when the cursor goes over it": labels get chewed ([ED~T], [CL)Cl,]); stray dark dots on the desktop too.
2. "The drag is buggy on paint."
3. "The controls are glitchy in tetris and in trytris."

Plus from the App 11 audit:
4. Triton 3.1 WASM keyboard/mouse queues die after 2,048 events per boot (machine-level; fix = reset when drained or ring buffer; re-pin machine hash).

Kehai's hypotheses to test first (not yet verified):
- (1) cursor save-under/restore wrong over the taskbar (cursor drawn into the framebuffer, background not restored), or compositor not redrawing the taskbar after cursor moves.
- (2) Paint strokes not clipped to the canvas, and/or mouse deltas accumulating wrong during drag (host sends absolute→delta; rounding).
- (3) Browser key handling: OS key auto-repeat floods events; keyup events possibly treated as presses by apps; each keydown runs only 80k steps so a held key can lag; the 2,048 cap makes it worse over time. Our audits drove keys via pushKeyEvent(down only) in Node, which would never see any of this: the browser path needs its own test (Playwright key presses with real down/up and repeat).
Tuesday: reproduce each in Playwright first, then spec 3.1.1 + 1.1.2.

## Found 07:09 by Kham: the editor eats Q and R (verified, root cause known)
- Kham typed the alphabet in TEXT EDITOR; Q and R vanished and the status line said "SAVED TO DISK: NOTE".
- Reproduced in Node (audit/…/qr.js): uppercase Q/R survive, lowercase q (113) and r (114) are dropped.
- Cause: `edit_on_key` treats 113 and 114 as Save/Load (guest template ~line 5262: `CMPI R1,#113 → edit_do_save`, `CMPI R1,#114 → edit_do_load`), meant as F2/F3. The host's mapKeyEvent sends printable keys as their character code and unknown named keys as e.keyCode, so F2 → 113 = 'q' and F3 → 114 = 'r'. Code-space collision between browser keyCodes and ASCII.
- So typing "q" SAVES the note and "r" LOADS it. Ctrl+S (19) / Ctrl+L (12) also work.
- Fix: give F-keys codes in the private range next to the arrows (SPECIAL_KEYS 128+, e.g. F1..F12 = 136..147) and update the editor (and grep every app for other 112–123 checks).

## Added 2026-11-13 19:30 — arrow input jitter in Trytris (Kham's laptop playtest)
- Symptom: some arrow presses dropped, others read twice. Before the freeze.
- Probably NOT the 2048 queue cap (that one is a cliff, not jitter). Same input path though, so test them together.
- Hypotheses to check (unverified):
  1. OS key autorepeat → extra keydowns → doubles. Host should ignore `e.repeat` or the app should debounce.
  2. Host runs +80k steps per keydown → a press fast-forwards game time, can land on a gravity tick → feels like a double/skip.
  3. App 11 consumes one key per tick and drops the rest (or reads key state, not the queue) → dropped presses when tapping fast.
- Test: scripted real-browser key bursts at known timings, log queue head/tail + TRYSTATE per press.

## 2026-11-13 ~21:30 — Kehai, after shipping Triton 3.1.1 (queue fix)
Queue cap (item 4) is FIXED in Triton 3.1.1 (CHANGES-3.1.1.md). Arrow-jitter investigation, by code reading + one Node measurement:
- Suspect 3 (App 11 eats one key per tick) is RULED OUT: try_ev_lp calls SYSCALL #25 in a loop until the event queue is empty, then does gravity/redraw/yield.
- Machine path: t3-12 proves the queues deliver every key event exactly once, in order (12,000 events, JS === WASM). The kernel keyboard driver drops key-ups (apps only see presses) and parks events in the hw queue when the app's 16-slot event queue is full (no drops there).
- REAL FINDING (suspect 2, bigger than thought): App 11's gravity is in machine steps at "200 steps/ms" (level 1 = 170,000 steps = the reference's 850 ms). But the desktop host runs 80,000 steps EVERY animation frame, plus another 80,000 on EVERY keydown. So game time is tied to the laptop's frame rate and to typing speed, not the wall clock. Measured in Node: 13 rows fall per 60 frames at level 1 (reference: ~1.2 rows per second). On a 60 fps laptop that's ~10x the reference speed; slower laptops are slower. Each tap is also an extra frame of game time.
- Suspect 1 (OS autorepeat): the host does not check e.repeat. The reference Trytris doesn't either, so autorepeat on hold is normal browser-game behaviour, not a TritOS-only bug. Whether to keep it is a feel decision.
- Fix options for 1.1.2 (Kham's call): (a) pace the host by wall clock: steps per frame = elapsed_ms × a fixed rate, and keydown no longer runs extra steps (keeps per-step determinism; virtual time then tracks real time); (b) give App 11 a frame-count or tick-count gravity instead of a "steps per ms" constant; (c) both. Also F-keys → 128+ range (q/r bug) in the same host patch.
- Test to write with the fix: scripted real-browser taps at known wall-clock times, logging TRYSTATE (row/col) per press.
