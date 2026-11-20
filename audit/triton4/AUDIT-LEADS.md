# Triton 4 delivery: audit leads from progress report 1 (2026-11-17 19:38)

Progress report committed as pasted:
`2026-11-17_progress-report-1_as-pasted.txt`, sha256 `6301515d…146da9`.
These are leads to check, **not findings**. Nothing has been delivered or run yet.

1. **fsck scratch tables vs the memory map.** The report puts FSCK_OWNER_BASE at 81·19683 = 1,594,323 and
   FSCK_SEEN_BASE at 162·19683 = 3,188,646.
   - DESKTOP.md (1.1.2) declares `1,023,516 .. 1,653,371` for window pixel buffers, so the owner table starts inside
     that declared range.
   - Check whether Desktop 2.0 moved the map, and whether fsck can run with windows open.
2. **fsck on a 3^13 unit needs RAM up to 4,782,969.** That's 1,594,323 entries per table. The planned card
   computer has 4,194,304 trytes (4M).
   - The home disk (3^10) needs only 59,049 per table, so it's fine.
   - The 3^13 scale test (spec test 6) may only pass on the emulator's 3^14 RAM. Report a hardware-RAM caveat or
     page the tables.
3. **"O(1) generation-stamped fsck"** can't mean O(1) overall: fsck walks every chain. Probably O(1) table
   *clearing*. Check the wording against what the tests measure.
4. **The build script is at `/tmp/build_desktop2.js`.** It must ship in the repo, since the spec forbids precomputed
   images except via the build script.
5. **Far call above 59,049** (JALR/RET mismatch). Argon's fix (`LI R6, #target−59049; LMI R6, #3; JALR`) is
   arithmetically right only if `target − 59049` stays within ±9,841. Check every far target.
6. **First-boot format of unit 1 isn't working yet.** No Desktop 2.0 test (d20-01..07) has run. The machine-side
   claims (t4-01..05 on JS + WASM) get verified by rerunning, as always, including **loading the pages in a real
   browser** (t4-05 is named "browser").
7. **One SHA-256 is given for "matching state hashes"** across all suites. Ask what exactly it hashes.
