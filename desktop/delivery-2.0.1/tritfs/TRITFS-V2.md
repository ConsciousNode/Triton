# TritFS v2: on-disk format (Kehai Interim with Kham, 2026-11-17). MIT.

The reference model is `tritfs-ref.js`, and its `selftest.js` must report 625 PASS, 0 FAIL. **Where this
text and the reference disagree, report it; do not guess.**

## Basics
- **Sector:** 729 balanced trytes (−9,841..+9,841).
- **Word:** 3 trytes, little-endian, base 19,683: `t0 + t1·19683 + t2·19683²`. This is the same encoding
  TritOS Desktop already uses.
- **Characters:** one tryte per character (ASCII code).
- TritFS v2 lives on units 1 and up. Unit 0 keeps the legacy TritOS Desktop layout (sector-200 directory).

## Sector 0: superblock

| Trytes | Field |
|---|---|
| 0–3 | `T` `F` `S` `2` |
| 4 | version = 2 |
| 5–7 | total sectors (word) |
| 8–10 | link-table start sector = 1 (word) |
| 11–13 | link-table length = ⌈total / 243⌉ sectors (word) |
| 14–16 | root directory: first sector, 0 when empty (word) |
| 17–32 | label, up to 16 characters, 0-padded |
| 33 | clean flag: +1 clean, 0 mounted, −1 errors found |
| 34–36 | allocation hint (word, advisory) |
| 37–39 | root directory: length in trytes (word) |
| 40–728 | 0 |

Sectors 0 .. link-table end are system sectors. They are marked −3 in the link table.

## Sector link table
- Each sector `s` has one word at link-table sector `1 + ⌊s/243⌋`, offset `3·(s mod 243)`.
- Values:
  - **0** = free;
  - **> 0** = the next sector of this file;
  - **−1** = last sector of this file;
  - **−2** = bad;
  - **−3** = system or reserved.

A file is a chain starting at its first sector. An empty file has first sector 0 and no chain.

## Directories
- A directory is a file of 27-tryte entries, 27 per sector. A slot whose first tryte is 0 is free.
- When written, a directory is trimmed after its last used slot.
- **Root** is the directory whose "entry" is the superblock (14–16, 37–39).

| Trytes | Field |
|---|---|
| 0–15 | name: 1–16 chars, ASCII 32–126 except `/` and `:`, no leading or trailing space, 0-padded |
| 16 | type: 1 data/text, 2 image, 3 asm source, 4 executable, 5 directory |
| 17 | flags: bit 0 read-only, bit 1 hidden, bit 2 system |
| 18–20 | first sector (word) |
| 21–23 | length in trytes (word); for a directory, 27 × slots |
| 24–26 | modified time, RTC seconds since 2000-01-01 UTC (word) |

- Names match case-insensitively (ASCII) and are stored with their case preserved.
- Paths look like `U:/dir/name`, where `U` is the unit number. Unit 0's legacy files are `0:/NAME`.

## Updates are copy-on-write (crash safety)
Every change follows the same order:
1. Write the new data sectors.
2. Write their links.
3. Rewrite the parent directory the same way, and its parent, up to root.
4. **Write the superblock (one sector): this is the commit.**
5. Only then free the old chains (link → 0).

So a power cut at any sector write leaves the old tree or the new tree, never a mix. The worst
case is orphaned sectors: marked non-free and owned by no file.

## fsck
- Walk from root and check:
  - each chain ends in −1;
  - each chain has no loops and stays in range;
  - its sector count is ⌈length/729⌉;
  - no sector belongs to two owners;
  - every system sector is marked −3.
- Any non-free sector not reached is an orphan. Repairing an orphan sets its link to 0.
- Repair never edits a directory entry. Problems other than orphans are reported, not "fixed".

## Image files
- **`.tdisk`** (sparse; units 1+):
  - `"TDSK"`;
  - u16 version = 1;
  - u32 sectors;
  - u16 flags (bit 0 removable, bit 1 write-protected);
  - u32 count;
  - then `count` × (u32 sector index, 729 × Int16LE), in ascending order. All-zero sectors are omitted.
  - All integers are little-endian.
- **Raw:** sectors × 1,458 bytes, Int16LE. This is byte-identical to Triton 3's `exportDiskImage`.
  The real machine's microSD stores raw or `.tdisk`; the I/O card converts.
