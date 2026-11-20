# Triton 4: storage units, TritFS v2 and time (decided 2026-11-17)

Kham + Kehai. Status: **decided by Kham 2026-11-17**; next step is an Argon spec (emulator + TritOS). The emulator gets every
item first and stays the answer key; the card computer follows it.

Why: Triton 3 was specced as an emulator, before we planned our own hardware. Its storage is one
fixed disk of 2,187 sectors and TritOS Desktop's directory holds 44 files, flat, append-only.
That is "runs", not "runs well with room for work and apps to spare".

Facts checked in the repo (triton/ISA-3.md, desktop/DESKTOP.md, triton3.html):
- Ports 0–27 are used. `handlePortIn` returns 0 for unknown ports and `handlePortOut` ignores
  them, so new ports at 28+ are invisible to old software, and new software can probe for them.
- Vectors 0–11 are used (IRQ bits 0–4: timer, kbd, mouse, disk, net).
- Disk LBA/DMA registers are already held at full 27-trit width.

## 1. Storage units (ports 28–30, vector 12)

| Port | Name | IN | OUT |
|---|---|---|---|
| 28 | `DISK_UNIT` | selected unit (0..26) | select unit; all disk ports (7–8, 17–21) then act on it |
| 29 | `DISK_SIZE` | sector count of selected unit, `0` = no medium | ignored |
| 30 | `DISK_FLAGS` | bit 0 present, 1 removable, 2 write-protected, 3 changed (clears on read) | ignored |

- Reset selects unit 0. Software that never touches port 28 behaves exactly as on Triton 3.
- Detection: `IN 29` on unit 0 returns 2,187 on Triton 4, and 0 on older machines.
- `DISK_LBA` range becomes `0 .. DISK_SIZE − 1` of the selected unit. New `DISK_ERR` code 4 =
  bad or empty unit.
- New vector **12 `IRQ_MEDIA`** (IRQ bit 5 = 32): a removable unit was inserted or removed.

**Unit map:**

| Unit | What | Size |
|---|---|---|
| 0 | Boot disk, legacy layout, unchanged | 2,187 sectors (3^7) |
| 1 | Home disk (main storage) | 59,049 sectors (3^10) recommended |
| 2 | Cartridge slot (removable) | any |
| 3..26 | Extra disk images on the microSD (removable as a group) | any |

Size classes (2 bytes per tryte on the card):

| Sectors | Trytes | On microSD | Link table (below) |
|---|---|---|---|
| 3^7 = 2,187 | 1,594,323 | 3.2 MB | 9 sectors |
| 3^10 = 59,049 | 43,046,721 | 86 MB | 243 sectors (177,147 trytes, 3.7% of RAM if fully cached) |
| 3^13 = 1,594,323 | 1,162,261,467 | 2.3 GB | 6,561 sectors (must be paged, not cached) |

The 3^10 home disk holds about 30× everything TritOS loads at full use (1.4M trytes measured).

## 2. TritFS v2 (on units 1+)

- **Sector 0, superblock:** magic, version 2, total sectors, link-table start and length,
  root-directory first sector, 16-char label, clean-unmount flag.
- **Sector link table:** one 27-trit word (3 trytes) per sector, 243 per table sector.
  `0` free, `> 0` next sector of the file, `−1` end of file, `−2` bad sector, `−3` reserved.
  The status codes sit on the negative side and links on the positive side.
- **Directories are files** of 27-tryte entries, 27 entries per sector, growing by chaining.

| Trytes | Field |
|---|---|
| 0–15 | name, 16 characters, mixed case (no `/`, `:` or NUL) |
| 16 | type: 1 data/text, 2 image, 3 asm source, 4 executable, 5 directory |
| 17 | flags: read-only, hidden, system |
| 18–20 | first sector (27-trit) |
| 21–23 | length in trytes (27-trit) |
| 24–26 | modified time (RTC seconds, section 3) |

- What this removes: the 44-file ceiling, the flat namespace, the 5/8-character names and
  append-only allocation. Deleting a file frees its chain. Files per folder: unlimited.
- Paths: `1:/apps/trytris/main`. Unit 0 keeps its legacy sector-200 directory, so TritOS Desktop
  1.1.2 still runs unchanged; the next TritOS mounts both.
- **App shelf convention:** `1:/apps/<name>/` holding `main` (executable), `icon` (image) and its
  own data. Installing from a cartridge = copying the folder; a cartridge app can also run in place.

## 3. Time (ports 31–32)

| Port | Name | IN | OUT |
|---|---|---|---|
| 31 | `TIMER_MODE` | current mode | `0` = steps (reset default, as Triton 3); `1` = real time, ticks every 5 µs (200 kHz) |
| 32 | `RTC_SECONDS` | seconds since 2000-01-01 00:00 UTC (27-trit) | set the clock |

- Mode 1 keeps clocks and games at the right speed on hardware running 2–5× faster than the
  emulator's pace. In the emulator, mode 1 counts from the host clock. Mode 0 stays for exact
  conformance runs against the emulator.
- The 27-trit seconds count reaches about 120,000 years.
- Hardware: an RTC chip with a coin cell on the I/O card, or set over StudioNet / Wi-Fi.

## 4. Reserved

Ports 40–48 are held for an audio spec (later, emulator first).

## Decisions (Kham, 2026-11-17)

1. Unit numbering as above: home = 1, cartridge = 2. **Yes.**
2. Home disk standard = 3^10 sectors. **Yes** ("plenty, especially with the disk unit expansion").
3. Name: **Triton 4** ("these aren't superficial upgrades"). Triton 3 software runs unchanged on it.
