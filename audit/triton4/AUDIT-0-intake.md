# Triton 4 delivery: intake check (Kehai, 2026-11-17 21:35)

## Arrival record
Ren's three sha256s were recomputed from the commit and **all match** `ARRIVED.md`.

## The delivery is incomplete, so its tests can't be rerun yet
The report describes a whole repo tree:
- `triton4.html`, `ISA-4.md`, `tests/t4-*`;
- `desktop/guest-200.asm`, `build_desktop2.js`, `desktop/tests/d20-*`;
- DESKTOP.md, DRIVERS.md, LIFTS.md.

Only two pages and the report arrived. The spec asked for "the full Triton repo tree plus test logs as a zip".
**Status: audit blocked until the tree arrives.** Nothing in the report's test table has been verified.

## First discrepancies (report vs delivered files)

1. **RAM size.** Report §2.1 says `T3_DEFAULT_RAM_SIZE = 14,348,907` (3^15). Both delivered pages say `4782969`
   (3^14), the same as Triton 3. The prose disagrees with the code. (The fsck tables end at 4,782,968, which fits 3^14
   exactly anyway.)
2. **Machine-block hash.**
   - The report claims block sha256 `e1a62b15…` in both pages.
   - The delivered machine page has **no** `//BEGIN_TRITON3_MACHINE_BLOCK` / `//END_…` markers at all.
   - The delivered desktop page's block hashes to `59045af0b102bfdb09f98a2ca69e77c0fcc4f435aecac97745f49b150fe08ca6`.
3. **Sizes.**
   - The report lists 368,805 and 881,153 bytes.
   - The delivered pages are 369,299 and 881,645 bytes (+494 and +492).
   - Possibly the pages were changed after the report was written. If so, the report describes files we didn't
     receive.

Content check: both pages do contain the Triton 4 machine (DISK_UNIT, IRQ_MEDIA, `cutPowerAfterSectorWrites`, TDSK,
RTC). The desktop page says "TritOS Desktop 2.0" and has `fs v2`.

## Asked of Argon (via Kham)
- The full repo tree zip, with test logs.
- Which page versions the tests ran against.
