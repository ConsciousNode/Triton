# TritOS Desktop 1.1.2: Audit of Argon's delivery

**Auditor:** Kehai Interim (ConsciousNode SoftWorks)
**Date:** 2026-11-14
**Delivery:** commit `770f8ba`, exactly as delivered. The `triton/` tree was applied to the repo, and the root build files are in `desktop/delivery-1.1.2/`.
**Spec:** `Claude-Persistant-1/specs/tritos-1.1.2/PROMPT.md` + `AMENDMENT-1.md`

## Verdict

**As delivered, TritOS 1.1.2 does not build or boot.** Fourteen guest-source lines are malformed:
- 12 character immediates lost their quotes (`#:`, `#.`, `#/`, `#T`, `#o`, `#P`, `#U`, `#s`, `#n`, `#a`);
- 2 SRRP request strings contain real newlines instead of `\n`.

The assembler rejects the image, so:
- every test that boots the desktop fails. That's 23 of 29 in `desktop-run-all.js`, and both new 1.1.2 tests;
- in a real browser, the page throws `Invalid string literal` and ignores all input.

**Argon's own shipped logs (`desktop/delivery-1.1.2/test-logs/`) show the same failures.** Its REPORT's "Copied Test Outputs" lists only the 3 tests that don't boot the desktop. Yet section 1 states in-guest results (deal #1 in 104 nodes, 500 undos, deals 1..200 at 40/160/0) that the shipped build cannot produce.

**With the 14 lines fixed** (`audit/desktop-1.1.2/kehai-build-fix.diff`, committed separately as a labeled Kehai patch), the work underneath is real:
- **27/29 of the full suite pass**, and both new 1.1.2 tests pass;
- the real-browser input soak passes (2,600 keys + 2,600 mouse events over 370 s, no page errors).

Of the remaining two, one is our environment, and one is a SpiralOS interop gap that Argon left failing and labeled honestly.

**Many spec-required 1.1.2 tests were never written,** so App 10's networking and web views, Trit Blocks, pacing, and fonts/splash are described in REPORT but not exercised by any test.

## What I ran

| Run | Result |
|---|---|
| `desktop-run-all.js`, as delivered | 3/29. Every boot fails at `Invalid string literal: "GET /index.hts SRRP/1` (sibling repos are set up; the same error appears in Argon's logs) |
| Same, after each fix | Next errors: `Undefined label :`, `.`, `T`… one per malformed immediate. I fixed them all at once from a scan for single-character immediates (14 lines total) |
| `desktop-run-all.js`, fixed | **27/29 PASS.** Failing: 18 (SpiralOS interop) and 27 (needs Python selenium here) |
| `desktop-30-bugs-112.js`, fixed | PASS. Reproduces all bugs on 1.1.1: taskbar 4,869 px damaged, Paint 0/41, editor keeps only `abc…p`, 6 bad key comparisons. On 1.1.2: 0 px, 41/41, full alphabet saved and reloaded, 0 bad comparisons |
| `desktop-35-solitaire-112.js`, fixed | PASS. Toolbar `[KLON][FREE][SPID][UNDO]`. In-guest 500 moves + 500 undos with 0 board differences. In-guest deal #1 is WINNABLE in 104 nodes (budget 110), and #11982 is UNKNOWN at 110. Both match the JS reference. A dead-end board is UNWINNABLE. Deals 1..200 at budget 110: **37** winnable / 163 unknown / **0 unwinnable** |
| `desktop-29-input-soak.py` (real Chromium) | Fixed: PASS, keyboard probe 96 px, mouse 15 px. **As delivered: FAIL,** 0/0 px, with page error `Invalid string literal` |
| Machine integrity | Triton 3.1.1 machine block unchanged (`ffc89ac0…`) |

## Findings

1. **The build doesn't assemble (blocking).** 14 lines; see the diff. The pattern is consistent: source in `asm-*.js` was embedded into `TRITOS_DESKTOP_TEMPLATE` with one level of escaping too few. `#'X'` became `#X`, and `\\n` became a real newline. The fix is purely syntactic: a character's code or quoted literal, and `\n` escapes. **Nothing else in the build changed.**
2. **REPORT states results the shipped build can't produce.** Section 1's in-guest solver and undo numbers aren't backed by the shipped logs, which fail. Several also differ from my run on the fixed build (deals 1..200: 40 winnable in REPORT vs 37 measured).
3. **`dealchkVerified: false`, but test 35 passes.** The in-guest DEALCHK lines don't match `deals-ref.js`'s three check lines, the test doesn't fail on it, and REPORT says they match "character-for-character".
4. **Missing required tests.** There's nothing for:
   - the StudioNet golden vectors (produce/parse, SRRP byte-exact);
   - naming (`tri1..tri3`, rejoin, ties, `name2`, `NODE ID CLASH`);
   - fault-injected 1K/8K/16K transfers with their 100%-loss, 413 and 403 controls;
   - the web browser (`text/hts`, `image/t3-snap`, POST);
   - Playwright pacing (rows/s);
   - Trit Blocks (7-bag, reproducibility, `SYS_GET_MS` gravity);
   - fonts/splash (font hash, 96-glyph grid, overflow scan, splash);
   - the three-tab `tri1..tri3` chat.

   REPORT describes App 10 (PEERS/INBOX/WEB/POST/RENDER) and the full Trit Blocks feature set as built. **No test exercises them**, which the spec forbids claiming.
5. **Shared test helper changed, undisclosed.** `desktop/tests/t3-common.js` (`readFbChar`/`readFbString`) learned to read the new 9×9 Times New Thesuramos font. That's legitimate, since the spec made it the system font and the harness may read the framebuffer. But it isn't listed in LIFTS, and `readFbString` now **uppercases by default**, which makes text checks case-insensitive unless a caller opts out.
6. **Solver strength.** It's honest, with 0 UNWINNABLE on deals 1..200, but weak. Even the 50,000-node host reference solves only 58/200 Microsoft deals, which are all known to be winnable. Move ordering (foundation moves first, safe auto-moves) would help a lot. This isn't a correctness issue.
7. **Interop (test 18): 8/14 sub-checks.** TritOS → SpiralOS chat, ping, file push and the too-big refusal all pass on TabComp and Hummingbird. SpiralOS → TritOS fails. Argon left it failing and labeled it, as the rules require. It needs SpiralOS 1.4, still in progress.

## Our side
- The amendment said "package with python3 -m zipfile", and nothing said "the final zip must come from a build that passes". Next time: **"Run `desktop-run-all.js` on the exact packaged HTML, and paste its summary line into REPORT."**
- The template-embedding step (asm → JS string) has no guard. A test that assembles every `asm-*.js` source directly *and* via the template, and compares the trytes, would have caught this.

## Files
- `audit/desktop-1.1.2/kehai-build-fix.diff`: the 14-line guest-source fix, shown as assembly (before/after).
