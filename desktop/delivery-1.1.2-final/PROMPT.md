# TritOS Desktop 1.1.2: StudioNet 1.0, a playtest bug sweep, real-time pacing, and the Solitaire Suite

ConsciousNode SoftWorks, MIT. Xinu rules: single-file page, zero dependencies, offline. The only network API is `BroadcastChannel("studionet-v1")`. **Inline everything, and label every inline** (provenance comments and `LIFTS.md`).

TritOS is a graphical OS written entirely in Triton guest assembly, running on the balanced-ternary Triton machine. A person played 1.1.1 on a real laptop and found the bugs below in minutes. This release fixes them, joins StudioNet 1.0 as a full citizen, and upgrades the card games.

## Attached

- **`triton/`**: the Triton repo at **3.1.1** (`b2cec89`): `triton3.html`, `desktop/tritos-desktop.html` (TritOS 1.1.1), `desktop/tests/*`, `desktop/DRIVERS.md`, `desktop/DESKTOP.md`, `CHANGES-3.1.1.md`.
  - The machine block inside the desktop is pinned at SHA-256 `ffc89ac07c9294bc3d746172633dd8d1479d5d361768223501dc73ab65ad2a5d`. **Do not change the machine.** If something truly needs a machine change, say so in REPORT.md instead.
- **`studionet/STUDIONET-1.0.md`**, **`studionet-ref.js`**, **`golden-vectors.json`**, **`selftest.js`**: the protocol contract, the reference implementation (the oracle for your **tests only**), and byte-exact vectors.
- **`shared/DEALS.md`**, **`deals-ref.js`**: the shared integer-only deal generators. They are ternary-safe, and SpiralOS uses the same ones.
- **`fonts/times-new-thesuramos-9x9.tryte.asm`**: TritOS's new font. Each glyph is 9 trytes, one balanced tryte per row of 9 trits: +1 ink, 0 background, −1 shadow.
- **`cnsw-mark.svg`**: the studio logo, for the boot splash.
- **`notes/kehai-1.1.2-bugs.md`**: the playtest bug list with Kehai's findings. Treat its hypotheses as hypotheses: trust the code over the notes.

## Part A: StudioNet 1.0 (`net` driver v3, NET app)

Implement **every MUST in STUDIONET-1.0.md for a TritOS node**, in Triton assembly, inside the labeled `net` driver (bump it to `v3` and update `DRIVERS.md`):

- **SNS:** HELLO/WHO/BYE, the peer table (at least 8 entries), and **the §3.4 naming rules exactly as `NameAgent` behaves**:
  - default name `triton`, numbered `tri1`, `tri2`… when duplicated;
  - a chosen name kept in a file on disk;
  - listen window, age extrapolation from the virtual clock at the machine's nominal rate, token ties, the `NODE ID CLASH` warning.
- **Echo:** keep answering pings, and start measuring RTT against any node that answers.
- **Chat lines labeled by display name.**
- **SRRP client and server** (port 80):
  - text heads, `GET`, `PUT`, `POST`, `LIST`, `DEL`;
  - **`Encoding: trytes16` for files** (TritOS files are trytes);
  - multi-frame transfer with SACK, the advertised `Window` (the 10-slot ring supports 8 for one conversation), an adaptive window and selective resend;
  - 413 at the first frame.
  
  Legacy 4300/4301 chunked transfers stay accepted, so old senders still work.
- **Inbox and share:** `PUT /inbox/<name>` lands files in the TritOS file system under the inbox rules of §4.3. A "Share files (read-only)" setting, off by default, serves `LIST /share` and `GET /share/<name>`.
- **NET app:**
  - a peers list (name, kind, OS, services, stale);
  - chat to a peer by name;
  - ping with RTT;
  - **Send file to…** with a peer picker;
  - Inbox;
  - a machine-name setting, and the share toggle.
- **A browser:**
  - `GET` an SRRP page and render `Type: text/hts`: the same SpiralWeb subset (`<h1>`, `<p>`, `<hr>`, `<a href>`, clickable links, Back);
  - display **`Type: image/t3-snap`**: `width` u16, `height` u16, then `width·height` palette values as trytes16 in −364..+364, shown at 1:1 in a window. The server renders pages with Vanta and recolors them into the 729-color palette; TritOS just displays the pixels;
  - forms, sent as `POST`, with the fields as `key=value&…`.
- **Fix the stale doc line** in `DESKTOP.md` that says file sends use `PROTO_SFP (5)`. The driver uses SSP (3).

## Part B: playtest bugs (reproduce each one first, in a test that **fails on 1.1.1**)

1. **Taskbar garbles under the cursor:** labels like `[ED~T]` and `[CL)Cl,]`, plus stray dark dots on the desktop. Suspects: cursor save-under and restore over the taskbar, or the compositor not redrawing the taskbar after cursor moves.
2. **Paint drag is buggy.** Suspects: strokes not clipped to the canvas, and/or mouse deltas accumulating wrong during a drag.
3. **The editor eats `q` and `r`:** typing `q` saves the note and `r` loads it. Root cause (verified): `edit_on_key` treats 113/114 as Save/Load, meant as F2/F3. But the host's `mapKeyEvent` sends printable keys as their character code and unknown named keys as `e.keyCode`, so F2 = 113 = `q`.
   - **Fix:** give F1..F12 private codes **136..147** in the host's `SPECIAL_KEYS` (next to the arrows at 128..135), and update every app.
   - **Grep every app for comparisons against 112..123**, and fix each one.
4. **Controls feel glitchy in the falling-block games (presses dropped or doubled).** Kehai measured the cause: the host runs **80,000 steps per animation frame plus another 80,000 on every keydown**, while Trytris (App 11) times gravity at a fixed "200 steps per ms". So game speed tracks the laptop's frame rate and typing speed: 13 rows per 60 frames at level 1, against the reference's ~1.2 rows/s.
   - **Fix: real-time pacing.**
     - The host runs `round(elapsedMs × RATE)` steps per frame, capped at 100 ms of catch-up. `RATE` is a documented constant: **200 steps per ms**, App 11's assumption. Show it in the debug panel.
     - A keydown **only enqueues**: no extra steps.
     - The kernel gets `SYS_GET_MS` (virtual steps ÷ RATE), and every timed app (Clock, Trytris, the block game) times itself with it.
     - Determinism per step is unchanged: lockstep mode and the tests drive steps directly, exactly as today.
   - **Autorepeat:** keep it (the reference Trytris accepts it too), but drop `e.repeat` events that arrive faster than 1 per 30 ms per key.
5. **Version strings:** the header and every other place say `TritOS Desktop 1.1.2`, defined once.

## Part C: Solitaire Suite and the block game

- **Solitaire Suite:** upgrade the existing Klondike app:
  - games: **Klondike (draw 1 / draw 3), FreeCell, Spider (1/2/4 suits)**;
  - **deals exactly per `shared/DEALS.md`**, with the seed shown and enterable;
  - **unlimited undo**;
  - an optional solver, off by default, never nags: depth-first search with a transposition table and a node budget, answering `WINNABLE` / `UNWINNABLE` / `UNKNOWN`;
  - **the clickwheel rule:** fully playable with only **scroll** (arrows), **select** (Enter or click) and **back** (Esc). Mouse drag is an extra, never required;
  - your own card art, drawn in the 729-color palette.
- **The block game:** rename the falling-block app from "Tetris" to **"Trit Blocks"** (taskbar `[TBLK]`): no third-party game names. Give it the same feature list as SpiralOS 1.4's SpiralBlocks: 7-bag, 3-piece next queue, hold, ghost, lock delay, wall kicks, levels, pause, seeded play, all timed with `SYS_GET_MS`.

## Part D: fonts and splash

- **Times New Thesuramos becomes the system font.**
  - Glyphs are 9 × 9 trits; render +1 as ink and −1 as the theme's shadow color.
  - Cover ASCII 32..127. **Lowercase is new:** today's 8 × 8 font has only 32..95.
  - Redraw any layout that assumed 8-pixel cells, and keep text inside its windows.
- **Boot splash:**
  - the CNSW logo as a trit image (+1 = the square, circle, triangle and center dot; −1 = the faint spiral; 0 = background);
  - the wordmark "TritOS" in Times New Thesuramos;
  - about 1.5 s, or until a key is pressed.
  
  Rasterize the SVG with a build-time script; no SVG parser in the guest.

## Forbidden

- Changing the Triton machine block (see Attached).
- The guest or the host calling `studionet-ref.js`, or host-side networking shortcuts. Frames go through the NIC only.
- Host code reading or writing guest memory, beyond the existing documented debug panel reads. No test detection.
- Precomputed protocol outputs or canned replies.
- Third-party game names, logos or card designs.
- **Verbatim:** "If a requirement can't be met, or conflicts with another, say so in REPORT.md and leave it failing. Never change emulator or VM accessors, I/O, consoles, test harnesses, or the auditor's scripts to make a check pass. An emulator must never read or write a guest's private memory."
- Do not predict, rank or praise results anywhere in code, docs or UI.

## Tests

New tests go in `desktop/tests/` and join `desktop-run-all.js`. The harness may only:
- push and read frames at the NIC;
- push key and mouse events through the device methods;
- read the framebuffer, the disk image, and the documented debug panel.

1. **Golden vectors:**
   - every `produce` vector is matched field for field (`seq`/`ack` are the OS's own; check that they increment correctly);
   - every `parse` vector is accepted or refused as listed;
   - SRRP messages are produced and parsed byte-exact.
2. **Naming:**
   - three TritOS desktops booted in order → `tri1`, `tri2`, `tri3`;
   - leave and rejoin → lowest free number;
   - a dead heat → the lower token wins, and all agree;
   - a chosen-name clash → `name2`;
   - a duplicate node ID → `NODE ID CLASH`.
3. **Transfers against the reference peer, over a seeded fault-injecting link** (drop, duplicate, reorder):
   - 1 K, 8 K and 16 K trytes both ways (`trytes16`);
   - tryte-identical results.
   
   **Positive controls:**
   - 100% loss gives `TIMEOUT`;
   - an oversize body gives 413 at the first frame;
   - `../x` gives 403.
4. **Interop:** `desktop-18-spiralos-interop.js` must pass in full against the SpiralOS 1.4 image if one is attached. If not, run it against the reference peer standing in for SpiralOS, and say which.
5. **Browser:** fetch a `text/hts` page and an `image/t3-snap` from the reference peer; the framebuffer shows them (pixel checks). Submit a form and verify the `POST` body.
6. **Bugs, each with a test that fails on 1.1.1 and passes now:**
   - taskbar labels intact after 500 cursor passes over them (pixel compare against a clean redraw);
   - a Paint drag stroke stays inside the canvas and matches the expected polyline;
   - typing the full alphabet in the editor keeps every letter, and F2/F3 still save and load;
   - a static scan finds no app comparing a key against 112..123.
7. **Pacing (real browser, Playwright):**
   - with the page idle for 10 s of wall time, Trytris at level 1 drops **9..14 rows** (850 ms each, ±tolerance for frame timing);
   - 20 rapid keypresses don't advance game time beyond wall time;
   - a held key with OS-rate autorepeat moves the piece at most once per 30 ms;
   - report the measured rows/s.
8. **Solitaire:**
   - `deals-ref.js`'s three check lines reproduced in-guest;
   - seeded deals tryte-identical to `deals-ref.js`;
   - FreeCell #11982 → `UNWINNABLE` and #1 → `WINNABLE` (node budget documented);
   - a scripted Klondike win using only scroll/select/back;
   - undo restores the exact prior state.
9. **Trit Blocks:** each piece appears once per bag of 7; seeded runs are reproducible; gravity follows `SYS_GET_MS`.
10. **Fonts and splash:**
    - font trytes in the image hash-match the attached `.asm`;
    - all 96 glyphs render (a framebuffer grid test);
    - no text overflows any window (a scan of all apps);
    - the splash appears and is dismissed by a key.
11. **No regressions:**
    - the full `desktop-run-all.js` and the Trytris differential (78-run audit seeds) pass;
    - pinned figures are regenerated by script, with old and new both reported;
    - **`desktop-29-input-soak.py`** passes, as does a new real-browser test: three desktop tabs see each other as `tri1`..`tri3` and chat by name.

## Report

`REPORT.md`:
- what was built, and each test's printed numbers (copied, never typed);
- every requirement not met;
- the memory-map and syscall changes;
- anything you looked at besides the attachments.

Do not describe anything as working unless a test exercises it. Package the full Triton repo tree plus test logs as a zip.
