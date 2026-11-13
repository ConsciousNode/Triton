# Audit: Trytris for TritOS (App 11), Gemini 4 Hydrogen's delivery

Auditor: Kehai Interim, 2026-11-13. Delivery committed as delivered at `099e032`.
Spec: `SPEC-TRYTRIS-APP.md` (`92037a3`). Reference: Trytris `fba45f6`, `index.html`.
Evidence and scripts: `audit/trytris-app/`.

## Verdict

**App 11 passes.** The guest-assembly game matches the reference engine state for state.
The checks behind that are Hydrogen's suite rerun, my own independent differential, positive controls on both, and real Chrome.

The audit also found a **real Triton 3.1 machine bug**, which is not Hydrogen's. The keyboard and mouse queues accept 2,048 events per boot and then stop for good. Hydrogen saw it and worked around it in a test comment, but didn't report it (spec rule: "say so in REPORT.md").

## 1. Hydrogen's suite, rerun

- **Reference lift hash.** `91293917…a683` matches the marker slice of Trytris `fba45f6`.
- **Probe:** 100/100.
- **Suite:** 27 pass, 2 fail.
  - Test 18 is the known one (SpiralOS can't address peers yet; it's our spec error).
  - Test 27 needs Selenium, which this environment doesn't have.
  - Hydrogen's log shows 27 pass, 1 fail, 1 skip. State hashes match mine (`0x3b0f9b92`).
- **Hydrogen's positive controls:** all four are caught.
  - rotation: board[26][4]
  - PRNG: active_id 2 vs 4
  - collapse: board (25,7)
  - score: 300 vs 250
- **Hydrogen's differential:** 90 runs, 1,947 states, 0 divergences.
- Among the existing tests, only test 10 (an added Trytris regex) and run-all changed.

## 2. My independent differential (`kehai-diff.js`)

It shares nothing with Hydrogen's test 23 except the machine loader (`t3-common.js`) and the reference markers. Its own parts:

- a xorshift32 seed source (`"KEHA"`), plus edge seeds 4294967295 and 7;
- a random mode and a random start level 1–15, reached by U or D;
- six action profiles: uniform, left-wall hug, right-wall hug, gravity-heavy, stacker, and a **greedy line-clearer** (it plans placements by replaying the reference);
- its own TRYSTATE parser (27-trit words as 3 × 9-trit trytes);
- a **full-state comparison after every single action, in every run.**

| batch | runs | states compared | game overs | max lines | max level | divergences |
|---|---|---|---|---|---|---|
| mixed profiles (`diff60.json`) | 60 | 9,758 | 46 | 1 | 15 | 0 |
| greedy (`greedy18.json`) | 18 | 4,192 | 11 | 6 | 13 | 0 |

**My controls:** I perturbed the reference, never the guest, so that a pass can't come from a lenient harness.

- Spawn column 3→5: caught at the first state (`ctl-spawn.json`).
- Score +1 per clear: caught at action 73 (score 800 vs 801) with greedy play (`ctl-score-greedy.json`).
- *Honest note:* the random profiles alone hardly ever clear lines (max 1). A score perturbation run with random play only had not diverged before I stopped it. That's why the greedy profile exists. Hydrogen's scripted test 24 covers Ternary Negation.

**Timing note.** The guest needs more than 300k steps after a key to finish its lockstep TRYSTATE write. At 150k or 300k steps per action the harness reads stale files. That's a harness budget, not a bug: the browser runs 80k steps per frame plus 80k per keydown, so a 600k-step budget is about 0.1 s.

## 3. Real Chrome (`browser-app11.py`)

App 11 launches from `[T3]`, takes a seed, starts, and accepts L/R/X/Z/Space. The board, ghost, HUD, next-3 and the T/Z/F readout all render, with no page errors and no network requests outside localhost (`app11-chrome.png`).

The "unrolled 5×5 T/Z/F readout (72×144)" wording is accurate. It means 5×5-pixel glyphs in 6-pixel cells: 12 × 24 = 288 visible cells.

## 4. Finding: Triton 3.1 input queues die after 2,048 events per boot

`TritonWASM.pushKeyEvent` and `pushMouseEvent` append at `i32[20582]` / `i32[20586]` and refuse once the tail reaches 2048. The tail resets only on machine reset. The queue is linear, not a ring, and is never compacted when drained. This is inside the pinned machine block, and `triton3.html` behaves the same way.

- **Node** (`kbdcap.js`, `mousecap.js`): after 2,100 events, head = tail = 2048. Draining for 5M steps changes nothing, and a new event is dropped.
- **Real Chrome** (`browser-kbd.py`, `kbd-compare.png`):
  - after 560 a+Backspace pairs (about 2,240 down/up events), typing "HELLO TRITON" into EDIT shows nothing;
  - the control (10 pairs) shows the text.
- **Real Chrome** (`browser-mouse2.py`, `mouse-compare.png`):
  - after 2,200 mouse moves, the cursor freezes and clicking `[PAINT]` opens nothing;
  - the control opens Paint.
- **Real-world impact:**
  - about 1,024 keypresses per boot, since every press is a down and an up event;
  - well under a minute of mouse movement;
  - a live Trytris game will lose its keyboard partway through.
- **Lockstep consequence:** the JS core's `kbdQueue` has no cap. After 2,048 events in lockstep mode the two cores would diverge.
- **Fix (for a Triton 3.1.1 machine patch, re-pinning the machine hash):** when head == tail, reset both to 0 before appending, or make it a ring buffer. Apply it to the keyboard, the mouse, and the snapshot-restore loops (host lines that write `pendingKbd`/`pendingMouse`).

## 5. Minor

- The page header still reads "TritOS Desktop 1.1" in 1.1.1.
- Hydrogen's REPORT doesn't mention the 2,048 cap. It's only in a comment in `desktop-23` ("boot fresh every 5 runs").

## Re-run

```
node audit/trytris-app/kehai-diff.js desktop ../trytris/index.html 60
ONLY=greedy node audit/trytris-app/kehai-diff.js desktop ../trytris/index.html 18
node audit/trytris-app/kbdcap.js desktop ; node audit/trytris-app/mousecap.js desktop
python3 audit/trytris-app/browser-kbd.py desktop      # needs Chrome + Playwright
```
