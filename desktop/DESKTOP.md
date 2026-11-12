# TritOS Desktop 1.0 Architecture & System Reference (`DESKTOP.md`)

*Generated programmatically by `generate_docs.js` from the assembled `tritos-desktop.html` image (23995 trytes total).*

## 1. Physical Memory Map (`0 .. 4,782,968` Trytes + MMIO)

| Address Range (Trytes) | Size (Trytes) | Region Symbol / Name | Privilege & Role |
| :--- | :--- | :--- | :--- |
| `0 .. 15` | `16` | `boot_reset` | Stage-0 DMA Bootloader (loads 45 sectors = 32,805 trytes from Disk LBA 0) |
| `16 .. 5243` | `5228` | Kernel Text & Handlers | Preemptive scheduler, trap/IRQ handlers, compositor, block-disk FS |
| `5244 .. 5755` | `512` | `font_8x8` | 64-glyph 8×8 ASCII bitmap font (`triton3.html` lines 7268–7342) |
| `5800 .. 5835` | `36` | `VEC_BASE` | 12-entry hardware exception/interrupt vector table (3 trytes/entry) |
| `5850 .. 5939` | `90` | Kernel State & Telemetry | `K_CUR_TASK`, `K_NUM_TASKS`, IRQ counters, trap records, number formatter |
| `6000 .. 6511` | `512` | `TCB_BASE` | 8 Task Control Blocks × 64 trytes per task |
| `6512 .. 7023` | `512` | `EVQ_BASE` | Per-task event ring buffers (8 tasks × 16 events × 4 trytes) |
| `7100 .. 7828` | `729` | `FS_DIR_BUF` | RAM mirror of Disk LBA 200 File System Directory Sector |
| `7900 .. 8628` | `729` | `SCAN_BUF` | 1-scanline Painter's compositor scratch buffer (`BCOPY`/`BFILL`) |
| `8700 .. 8891` | `192` | `WINTAB` | 8 Window descriptors × 24 trytes per window |
| `8900 .. 8928` | `29` | `ZORDER` / Redraw State | Bottom-to-top Z-order array, `ACTIVE_WIN`, cursor coords, damage metrics |
| `9000 .. 9095` | `96` | `APP_REG_BASE` | Application ROM descriptor table (Apps 0..5) |
| `9100 .. 9600` | `500` | `SPR_KSP` | Supervisor Kernel Stack (`KSP = 9600`) |
| `19683 .. 23994` | `4312` | `app*_rom` | Embedded User-Mode Application ROM Templates |
| `196830 .. 511757` | `314,928` | User Task Windows `0..7` | Protected user-mode windows `[(10+2k)*19683, (12+2k)*19683)` (`39,366` trytes/task) |
| `590490 .. 984149` | `393,660` | Assembler App Window | Protected user-mode window `[30*19683, 50*19683)` for in-guest self-hosting |
| `1023516 .. 1338443` | `314,928` | Window Backing Buffers | Per-window pixel buffers `(52+2w)*19683` (`39,366` trytes/window) |
| `15000000 .. 15354293` | `354,294` | MMIO Framebuffer | Hardware `729 × 486` 729-color display (`ISA-3.md` §2.3) |

## 2. Task Control Block (`TCB_BASE = 6000`, 64 Trytes/Task) & User Layout

Each application runs as an unprivileged **User-Mode Task (`PRIV = 1`, `PROT_EN = 1`, `IE = 1`, `ESR = 108`)** with hardware base-and-limit isolation enforced on every instruction fetch, load, store, `PUSH`/`POP`, and `BCOPY`/`BFILL`:

| TCB Offset | Width | Field Name | Description |
| :--- | :--- | :--- | :--- |
| `+0 .. +26` | 27 trytes (9 words) | `R0 .. R8` | Saved 27-trit general-purpose registers (`R8` initialized to `UBASE`) |
| `+27 .. +29` | 3 trytes (1 word) | `PC` | Saved Program Counter (`SPR_EPC`, initialized to `UBASE`) |
| `+30 .. +32` | 3 trytes (1 word) | `SP` | Saved User Stack Pointer (`SPR_ESP`, initialized to `UBASE + 4500`) |
| `+33 .. +35` | 3 trytes (1 word) | `ESR` | Saved Exception Status Register (`108` = `PRIV=1, IE=1`) |
| `+36 .. +38` | 3 trytes (1 word) | `UBASE` | Inclusive lower physical memory bound (`SPR_UBASE`) |
| `+39 .. +41` | 3 trytes (1 word) | `ULIMIT` | Exclusive upper physical memory bound (`SPR_ULIMIT`) |
| `+42` | 1 tryte | `STATE` | `0` = Free, `1` = Ready/Running, `2` = Killed/Faulted |
| `+43` | 1 tryte | `WIN_ID` | Associated window index (`0..7`, or `-1` if none) |
| `+44` | 1 tryte | `APP_ID` | Application type identifier (`0..7`) |
| `+45 .. +47` | 3 trytes (1 word) | `SLICES` | Preemptive timer slices executed by this task |
| `+48 .. +50` | 3 trytes (1 word) | `SYSCALLS` | Total system calls invoked by this task |
| `+51 .. +53` | 3 trytes | `EV_HEAD/TAIL/CNT` | Per-task 16-slot input event ring buffer pointers |
| `+54 .. +56` | 3 trytes (1 word) | `FAULT_CAUSE` | Hardware exception vector (`1..5`) if killed by fault isolation |

## 3. System Call Table (`SYSCALL #imm9`, Vector 6)

| Syscall `#imm9` | Symbolic Name | Inputs (`R0..R5`) | Return (`R0..R3`) | Semantics |
| :--- | :--- | :--- | :--- | :--- |
| `0` | `SYS_EXIT` | None | Does not return | Terminates calling task, closes its window, and schedules next task |
| `1` | `SYS_PUTC` | `R0` = ASCII char | `R0` unchanged | Outputs character to hardware console Port 0 |
| `2` | `SYS_YIELD` | None | `R0` unchanged | Voluntarily yields remaining time slice to next ready task |
| `3` | `SYS_GET_TICKS` | None | `R0` = 27-trit step counter | Reads virtual clock step counter from Port 6 (`TIMER_TICKS`) |
| `4` | `SYS_SPAWN_APP` | `R0` = `app_id` (`0..5`) | `R0` = new `task_id` | Spawns built-in application in a new protected user window |
| `5` | `SYS_KILL_TASK` | `R0` = `task_id` (`0..7`) | `R0` = `0` or `-1` | Terminates specified task and closes its window |
| `6` | `SYS_LIST_TASKS` | `R0` = `user_buf_ptr` | `R0` = active count | Writes 8 × 8-tryte task status descriptors into user buffer |
| `7` | `SYS_EXEC_BUF` | `R0`=ptr, `R1`=len, `R2`=id | `R0` = new `task_id` | Spawns a new user task from assembled machine code in memory |
| `10` | `SYS_WIN_OPEN` | `R0`=x, `R1`=y, `R2`=w, `R3`=h, `R4`=title, `R5`=bg | `R0` = `win_id` | Opens, decorates, focuses, and composites a new window |
| `11` | `SYS_WIN_CLOSE` | None | `R0 = 0` | Closes calling task's window and repaints vacated damage region |
| `12` | `SYS_WIN_MOVE` | `R0`=win_id, `R1`=x, `R2`=y | `R0 = 0` | Moves window and damage-repaints both vacated and new rectangles |
| `13` | `SYS_WIN_FOCUS` | `R0` = `win_id` | `R0 = 0` | Raises window to top of `ZORDER` and updates active titlebar |
| `20` | `SYS_WIN_FILL_RECT` | `R0`=x, `R1`=y, `R2`=w, `R3`=h, `R4`=color | `R0 = 0` | Fills client rectangle in window backing buffer using `BFILL` |
| `21` | `SYS_WIN_DRAW_TEXT` | `R0`=x, `R1`=y, `R2`=str, `R3`=fg, `R4`=bg | `R0 = 0` | Draws null-terminated string using `font_8x8` into window buffer |
| `22` | `SYS_WIN_PUT_PIXEL` | `R0`=x, `R1`=y, `R2`=color | `R0 = 0` | Plots single 729-color pixel at client `(x, y)` |
| `23` | `SYS_WIN_GET_PIXEL` | `R0`=x, `R1`=y | `R0` = color | Reads 729-color pixel at client `(x, y)` |
| `24` | `SYS_WIN_FLUSH` | `R0`=x, `R1`=y, `R2`=w, `R3`=h | `R0 = 0` | Composites client damage rectangle `(x,y,w,h)` to MMIO VRAM |
| `25` | `SYS_GET_EVENT` | None | `R0`=type, `R1`=a, `R2`=b, `R3`=c | Dequeues input event (`0`=none, `1`=key, `2`=mouse down, `3`=mouse drag) |
| `26` | `SYS_WIN_DRAW_NUM` | `R0`=x, `R1`=y, `R2`=val, `R3`=base, `R4`=fg, `R5`=bg | `R0 = 0` | Formats 27-trit integer in base `10` or balanced-ternary `3` and draws |
| `27` | `SYS_WIN_BLIT_BUF` | `R0`=x, `R1`=y, `R2`=w, `R3`=h, `R4`=buf, `R5`=dir | `R0 = 0` | Blits rectangle between user buffer and window buffer via `BCOPY` |
| `30` | `SYS_FS_LIST` | `R0` = `user_buf_ptr` | `R0` = file count | Copies active 16-tryte directory entries to `user_buf_ptr` |
| `31` | `SYS_FS_READ` | `R0`=name, `R1`=dst, `R2`=max | `R0` = trytes read (`-1` if NF) | Reads named file from block disk into user buffer |
| `32` | `SYS_FS_WRITE` | `R0`=name, `R1`=src, `R2`=len, `R3`=type | `R0` = `0` (`-1` if disk full) | Writes single- or multi-sector file to disk and syncs directory |
| `33` | `SYS_FS_DELETE` | `R0` = `name_ptr` | `R0` = `0` or `-1` | Deletes named file and syncs directory sector to disk |
| `36` | `SYS_READ_SECTOR` | `R0` = `lba` | `R0 = 0` | DMA-reads disk sector `R0` into calling task's `SEC_BUF` (`UBASE+5400`) |
| `37` | `SYS_LOAD_SRC_SECTORS` | `R0` = `name_ptr` | `R0` = char length | Copies named source file into Disk Sectors `1..N` for streaming assembly |

## 4. Block-Disk File System Format (`2,187` Sectors × `729` Trytes = `1,594,323` Trytes)

- **Sectors `0 .. 34`**: Bootable OS kernel & user application ROM image (loaded via hardware DMA on reset).
- **Sectors `1 .. 199`**: Contiguous streaming assembly source workspace (used when `SYS_LOAD_SRC_SECTORS` or full-OS self-hosting streams source text).
- **Sector `200` (`Disk[145800..146528]`, mirrored at `FS_DIR_BUF = 7100`)**: Persistent File System Directory Sector:
  - **Bytes `+0 .. +703`**: 44 Directory Entries × 16 trytes each:
    - `+0 .. +7`: 8-tryte uppercase ASCII filename (zero-padded; `+0 == 0` marks a free entry).
    - `+8`: 1-tryte file type (`1` = text, `2` = 729-color image, `3` = assembly source, `4` = executable binary).
    - `+9 .. +11`: 3-tryte 27-trit `start_lba` sector number.
    - `+12 .. +14`: 3-tryte 27-trit `length_trytes` file size.
    - `+15`: 1-tryte allocated `sector_count` (`ceil(length_trytes / 729)`).
  - **Bytes `+704 .. +706`**: 27-trit filesystem format signature (`MAGIC = 31337`).
  - **Bytes `+707 .. +709`**: 27-trit `NEXT_FREE_LBA` allocation pointer (starts at `210`, max `2187`).
  - **Bytes `+710 .. +712`**: 27-trit active `FILE_COUNT`.
- **Sectors `210 .. 2186`**: Multi-sector file data blocks.

## 5. Window Protocol, Damage-Based Compositor & User Applications

- **Window Descriptor (`WINTAB = 8700`, 24 Trytes/Window)**: Stores `VIS`, `TASK_ID`, screen coordinates `(X, Y, W, H)`, 27-trit backing buffer address `BUF_ADDR = (52 + 2*win_id)*19683`, `BG_COL`, `TITLE_COL`, and 12-character title string.
- **Scanline Damage Compositor (`wm_redraw_rect`)**: To redraw a damaged screen rectangle `(rx, ry, rw, rh)`, the kernel iterates scanline by scanline `y = ry .. ry+rh-1`, fills `SCAN_BUF[rx..rx+rw-1]` via `BFILL`, overlays intersecting spans of visible windows in bottom-to-top `ZORDER` via `BCOPY`, overlays the mouse cursor at `(CUR_X, CUR_Y)`, and blits `SCAN_BUF[rx..rx+rw-1]` to `VRAM[15000000 + y*729 + rx]` in a single `BCOPY` per scanline.
- **Six User-Mode Applications**:
  1. **Terminal (`APP_ID = 0`)**: Interactive shell supporting `LS`, `CAT <F>`, `RM <F>`, `PS`, `KILL <ID>`, `RUN <0..5>`, `LOOP`, and `FAULT <1..4>`.
  2. **Text Editor (`APP_ID = 1`)**: Multi-line text editor with toolbar (`[SAVE] [LOAD] [CLR]`) and keyboard shortcuts (`Ctrl+S` / `Ctrl+L`) reading/writing disk files.
  3. **Paint 729 (`APP_ID = 2`)**: Mouse-driven canvas with a 729-color balanced-ternary palette picker strip and multi-sector image save/load (`ART`, 3,072 trytes).
  4. **Clock (`APP_ID = 3`)**: Live virtual-clock display rendered in both Decimal and Balanced Ternary (`T, 0, 1`).
  5. **Assembler App (`APP_ID = 4`)**: In-guest two-pass sector-streaming assembler running in user mode (`[590490, 984150)`) that assembles disk source files (`A`) or full OS streams (`S`) into `OBUF` and spawns the resulting binary as a new windowed user task (`R`).
  6. **Trit Calculator (`APP_ID = 5`)**: Balanced-ternary GUI & keyboard calculator evaluating 27-trit `+`, `-`, `*`, `/`, `%`, `&` (`TMIN`), `|` (`TMAX`), and `^` (`TCON`) expressions.
