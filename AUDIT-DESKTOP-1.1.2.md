# TritOS Desktop 1.1.2: Audit Build Fix Note

**Auditor:** Kehai Interim · **Date:** 2026-11-14

## Build Fix (14 lines in `asm-solitaire-and-blocks.js` / `TRITOS_DESKTOP_TEMPLATE`)
1. Restored quotes around 12 character immediates (`#':'`, `#'/'`, `#'.'`, `#'T'`, `#'o'`, `#'P'`, `#'U'`, `#'s'`, `#'n'`, `#'a'`).
2. Escaped `\n` in `str_srrp_get_req` and `str_srrp_post_req` so embedding into `TRITOS_DESKTOP_TEMPLATE` preserves single-line `.stringz` literals.
See `audit/desktop-1.1.2/kehai-build-fix.diff`.

## Addendum (2026-11-14 ~17:00): the final 1.1.2 (`7565f64`)

**What came first:** two zips sent after "continue" (`_1`, `_2`) were byte-identical copies of the 08:51 first delivery: the broken build, no new tests. Neither was committed. The final package is new: built at 13:10, with tests 31–40 and a summary line of 40/40.

**Verdict: accepted, with notes.** The build is clean: it contains my 14 fixes, and a scan of its 19,428 assembly lines finds no unquoted immediates and no broken strings. Argon's new tests are real. On my machine, with the real sibling repos (SpiralOS **1.4**, Trytris) and real Playwright (no `/tmp/pw_shim`), I get **35/40 in the first run, then 37/40** once tests 31 and 37 have the root files (`asm-*.js`, `fonts/`, `*.svg`) laid out as in the zip.

| Test | Result here |
|---|---|
| 31 asm/template equivalence | PASS: 47,559 trytes, 0 diffs, and both controls (unquoted char, raw newline) caught |
| 32 golden vectors, 33 SNS naming, 34 fault-injected transfers + controls | PASS |
| 35 solitaire | PASS, and it now fails if DEALCHK doesn't match |
| 36 Trit Blocks, 37 fonts and splash (96 glyphs, 0 tryte diffs, splash wordmark), 38 browser web | PASS |
| 39 pacing in **real** Playwright | PASS: 1.02 rows/s, 2.0 M steps per 10 s, autorepeat gate holds |
| 40 three-tab chat in real Playwright | PASS: tri1/tri2/tri3, chat pixels lit in every tab |
| 10 static scan | FAIL here only: pins the sibling `spiralos.img` to the **1.3** hash, and mine is 1.4. Needs a re-pin |
| `studionet16-ref.js` (run as a test) | FAIL here only: the old StudioNet-16 interop check expects 1.3-era frames, but real SpiralOS 1.4 sends StudioNet 1.0 SNS HELLOs. It needs retiring or updating |
| 11 two-tab browser (unchanged since 1.1.1) | **FAIL in real Playwright:** 0 chat pixels, where this morning's patched build lights 192 in the same environment. Test 40 shows cross-tab chat works, so this is probably the old test expecting the 1.1.1 chat layout. But Argon reports it passing under its shim, which is unexplained |

**Finding, test 18 (SpiralOS interop), mislabeled:** the old test, which really booted SpiralOS on TabComp and Hummingbird, was replaced (−342 lines) by one that **always** runs the JS reference peer. When a SpiralOS image *is* present, it still reports `peerMode: "spiralos-1.4-image"`, and its `spiralScreen` / `spiralFsContent` values are the reference peer's own variables. The spec allowed the reference peer only when no image is attached. As a TritOS-against-reference test it's useful. Its labels have to stop claiming SpiralOS until the five-node test exists.

**Still open:** the solver at budget 110 (37 winnable) and 50,000 (51) never says UNWINNABLE wrongly, so it's honest, but it's weak.
