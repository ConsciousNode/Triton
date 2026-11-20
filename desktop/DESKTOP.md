# TritOS Desktop 1.1.2 — Architecture, Syscall, Application & Protocol Reference

## 1. Hardware Platform & Memory Map (Triton 3.1)

TritOS Desktop 1.1 runs in **Triton 3.1 Supervisor/User Mode (`archMode = 'T3'`)** on the 27-trit balanced-ternary CPU (`1 tryte = 9 trits in [-9841..+9841]`, `1 word = 3 trytes = 27 trits`).

| Physical Tryte Range | Purpose | Access |
|---|---|---|
| `0 .. 5719` | Stage-0 DMA Bootloader, Trap/IRQ Vectors, Preemptive Scheduler, Compositor, DMA Block FS, Syscall Dispatcher | Supervisor |
| `5800 .. 8928` | Kernel BSS: Vector Table (`5800`), Task Control Blocks (`6000..6511`), Event Queues (`6512..7023`), FS Directory Mirror (`7100..7828`), Scanline Buffer (`7900..8628`), Window Table (`8700..8891`), Z-Order & Cursor (`8900..8928`) | Supervisor |
| `8940 .. 9721` | StudioNet Trampolines (`8940..8945`), 8×8 Bitmap Font (`8946..9457`), 16-bit XOR Nibble Table (`9458..9713`), Pow2 Table (`9714..9721`) | Supervisor |
| `9805 .. 9835` | StudioNet Driver Counters (`K_NET_IRQS`, `K_NET_RX_PKTS`, `K_NET_DROP_PKTS`, `K_NET_TX_PKTS`, `K_NET_SEQ`, `K_NET_LAST_RTT`, `K_NET_PING_REPLIES`) | Supervisor |
| `9850 .. 10190` | Supervisor Stack (`SPR_KSP = 10190`, grows downward) | Supervisor |
| `10200 .. 11203` | StudioNet Receive Interrupt Driver, 16-bit Checksum Engine & SFP Chunked File Transfer Engine | Supervisor |
| `11300 .. 19387` | StudioNet Buffers: `K_NET_LAST_CHAT` (`11300`), `K_NET_LAST_FILE` (`11364`), `K_NET_TX_BUF` (`11400`), 10-slot Frame Queue `K_NET_Q_BASE` (`12000..17159`), 3-sector SFP Buffer `K_SFP_BUF` (`17200..19387`) | Supervisor |
| `19683 .. 36483` | User-Mode Application ROM Templates (`Apps 0..10`) & Embedded Self-Host Source (`DEMO`) | Supervisor |
| `196,830 .. 511,757` | 8 User-Mode Task Segments (`Slot i`: `UBASE = (10 + 2*i) * 19683`, `ULIMIT = UBASE + 39366`) | User (Base/Limit Protected) |
| `590,490 .. 688,904` | In-Guest Streaming Assembler Workspace (`30 * 19683 .. 35 * 19683`) | User (App 4) |
| `688,905 .. 728,270` | Assembled Output Binary Buffer (`OBUF = 35 * 19683`) | User / Exec |
| `1,023,516 .. 1,653,371` | 8 Backing Window Pixel Buffers (`Win i`: `(52 + 2*i) * 19683`, up to `240×160` trytes each) | Supervisor |
| `15,000,000 .. 15,354,293` | Architected MMIO Framebuffer (`729 × 486` pixels in 729-color palette `[-364..+364]`) | MMIO |

## 2. System Call Interface (Vector 6: `SYSCALL #imm9`)

All user-mode applications interact with hardware, windows, files, and StudioNet exclusively through `SYSCALL #n`:

| Syscall | Name | Arguments | Return (`R0`) & Behavior |
|---:|---|---|---|
| `#0` | `SYS_EXIT` | None | Closes task's window, marks TCB free, and schedules next ready task |
| `#1` | `SYS_PUTC` | `R0 = char` | Outputs character to console port |
| `#2` | `SYS_YIELD` | None | Resets timer quantum (`2,500` steps) and yields CPU to next ready task |
| `#3` | `SYS_GET_TICKS` | None | Returns current 27-trit virtual step counter from hardware timer port (`Port 6`) |
| `#4` | `SYS_SPAWN_APP` | `R0 = app_id (0..10)` | Spawns built-in application `0..10` into a free TCB slot; returns `task_id` or `-1` |
| `#5` | `SYS_KILL_TASK` | `R0 = task_id (0..7)` | Terminates specified task cleanly and closes its window |
| `#6` | `SYS_LIST_TASKS` | `R0 = user_buf_ptr` | Writes 8×8-tryte task entries `[slot, state, app_id, win_id, slices, syscalls, fault_cause, 0]`; returns active task count |
| `#7` | `SYS_EXEC_BUF` | `R0 = buf_ptr, R1 = len, R2 = app_id` | Spawns a new user-mode task from an assembled tryte buffer in memory |
| `#8` | `SYS_KERNEL_INFO` | `R0 = user_buf_ptr` | Writes 6 words (18 trytes): `[k_csum, trap_cnt, last_cause, last_redraw_trytes, net_rx_pkts, net_drop_pkts]` |
| `#10` | `SYS_WIN_OPEN` | `R0=x, R1=y, R2=w, R3=h, R4=title_ptr, R5=bg` | Allocates and focuses a window for the calling task |
| `#11` | `SYS_WIN_CLOSE` | None | Closes calling task's window |
| `#12` | `SYS_WIN_MOVE` | `R0 = new_x, R1 = new_y` | Moves calling task's window and redraws vacated + new regions |
| `#13` | `SYS_WIN_FOCUS` | `R0 = win_id` | Brings window to top of `ZORDER` |
| `#20` | `SYS_WIN_FILL_RECT` | `R0=x, R1=y, R2=w, R3=h, R4=color` | Fills rectangle in calling task's window client buffer |
| `#21` | `SYS_WIN_DRAW_TEXT` | `R0=x, R1=y, R2=str_ptr, R3=fg, R4=bg` | Renders null-terminated string using 8×8 font into window client buffer |
| `#22` | `SYS_WIN_PUT_PIXEL` | `R0=x, R1=y, R2=color` | Writes one pixel in window client buffer |
| `#23` | `SYS_WIN_GET_PIXEL` | `R0=x, R1=y` | Reads one pixel from window client buffer |
| `#24` | `SYS_WIN_FLUSH` | `R0=x, R1=y, R2=w, R3=h` | Composites damage rectangle (or full window if `w=0`) to MMIO framebuffer |
| `#25` | `SYS_GET_EVENT` | None | Dequeues next event: `R0=type` (`0=none, 1=KEY, 2=MOUSE_DOWN, 3=MOUSE_DRAG, 4=MOUSE_UP`), `R1=code/x`, `R2=y`, `R3=btn` |
| `#26` | `SYS_WIN_DRAW_NUM` | `R0=x, R1=y, R2=val, R3=radix(10/3), R4=fg, R5=bg` | Formats 27-trit word in decimal (`10`) or balanced ternary (`3`) into window |
| `#27` | `SYS_WIN_BLIT_BUF` | `R0=x, R1=y, R2=w, R3=h, R4=src_ptr` | Blits raw tryte image buffer into window client area |
| `#30` | `SYS_FS_LIST` | `R0 = user_buf_ptr` | Copies active 16-tryte directory entries to user buffer; returns file count |
| `#31` | `SYS_FS_READ` | `R0=name_ptr, R1=dst_ptr, R2=max_len` | Reads file via DMA into user buffer; returns tryte length or `-1` |
| `#32` | `SYS_FS_WRITE` | `R0=name_ptr, R1=src_ptr, R2=len, R3=type` | Writes file via DMA to disk and syncs Sector 200 directory; returns `0` or `-1` (disk/dir full) |
| `#33` | `SYS_FS_DELETE` | `R0=name_ptr` | Deletes file entry in Sector 200 directory; returns `0` or `-1` |
| `#36` | `SYS_READ_SECTOR` | `R0=lba` | Reads 1 sector (`729` trytes) from disk LBA into assembler sector buffer |
| `#37` | `SYS_STAGE_ASM_FILE` | `R0=name_ptr, R1=mode (0=stage to LBA 1.., 1=save OBUF to "OUT")` | Stages source file to LBA `1..` or writes assembled `OBUF` binary to disk file `"OUT"` |
| `#40` | `SYS_NET_GET_ID` | None | Returns local 16-bit StudioNet Node ID from NIC Port 23 (`P_NID`) |
| `#41` | `SYS_NET_SEND` | `R0=dst_node, R1=proto, R2=payload_ptr, R3=len` | Builds 12-byte StudioNet header + 16-bit checksum and transmits frame over NIC |
| `#42` | `SYS_NET_RECV` | `R0 = dst_buf_ptr` | Drains NIC RX queue and returns received SpiralChat message count |
| `#43` | `SYS_NET_PING` | `R0 = dst_node` | Records current virtual step count and sends `PROTO_ECHO_REQ (1)` with `"PING"` payload |
| `#44` | `SYS_NET_SEND_FILE` | `R0 = dst_node, R1 = filename_ptr` | Reads file from disk and transmits it in `PROTO_SSP (3)` chunks of up to 240 trytes |
| `#45` | `SYS_NET_STATUS` | `R0 = user_buf_ptr` | Writes 100-tryte network status struct (Node ID, TX/RX/Drop counts, Ping replies, RTT in steps, last chat, last received SFP file) |

## 3. File Formats on Disk (Sector 200 Directory)

### 3.1 Block-Disk File System Layout (Sector 200)
- **Sector size**: `729` signed trytes (`1,458` bytes when exported via `exportDiskImage`).
- **Directory Sector (`LBA 200`)**:
  - Up to **44 entries** of `16` trytes each at offsets `0..703`:
    - `+0..7`: 8-tryte uppercase ASCII filename (zero-padded)
    - `+8`: `file_type` (`1=data/text`, `2=image`, `3=asm source`, `4=executable`)
    - `+9..11`: `start_lba` (3-tryte 27-trit word: `t0 + t1*19683 + t2*387420489`)
    - `+12..14`: `byte_len` (3-tryte 27-trit word: length in trytes)
    - `+15`: `sectors_allocated` (1 tryte)
  - Offset `704..706`: Magic word `31337`
  - Offset `707..709`: `next_free_lba` (starts at `210`, max `2187`)
  - Offset `710..712`: `file_count`

### 3.2 Klondike Solitaire State File (`"SOL"`, 206 Trytes)
Saved when pressing `'S'` or clicking `[SAVE]` in App 6:
- `+0`: `seed` (integer seed used for deal)
- `+1`: `draw_mode` (`1` or `3`)
- `+2`: `won` (`0` = in progress, `1` = won)
- `+3`: `move_count` (accepted legal moves)
- `+4`: `illegal_count` (refused illegal moves)
- `+5`: `stock_len` (`0..24`)
- `+6`: `waste_len` (`0..24`)
- `+7..10`: `found_len[0..3]` (cards in each of the 4 suit foundations `S, H, C, D`, `0..13`)
- `+11..17`: `tab_len[0..6]` (total cards in each of the 7 tableau columns)
- `+18..24`: `tab_down[0..6]` (number of face-down cards in each tableau column)
- `+25..48`: `stock[0..23]` (card IDs `0..51`, or `-1` for empty; `suit = id / 13`, `rank = id % 13`)
- `+49..72`: `waste[0..23]` (card IDs `0..51`, or `-1`)
- `+73..205`: `tab[0..6][0..18]` (`7 × 19 = 133` trytes of tableau card IDs `0..51`, or `-1`)

### 3.3 Tetris State Files (`"TETRIS"` 215 Trytes & `"TETHI"` 3 Trytes)
Saved when pressing `'P'`/`'V'` or clicking `[SAVE]` in App 7:
- `"TETHI"` (`3` trytes): 27-trit word `high_score`, automatically loaded at App 7 startup and updated whenever `score > high_score`.
- `"TETRIS"` (`215` trytes):
  - `+0..2`: `score` (27-trit word)
  - `+3..5`: `high_score` (27-trit word)
  - `+6`: `lines` cleared
  - `+7`: `level` (`1 + lines / 10`)
  - `+8`: `game_over` (`0` or `1`)
  - `+9`: `cur_piece` (`0..6`)
  - `+10`: `cur_rot` (`0..3`)
  - `+11`: `cur_px` (`0..9`)
  - `+12`: `cur_py` (`0..19`)
  - `+13`: `pieces_spawned`
  - `+14`: `seed`
  - `+15..214`: `grid[0..199]` (`20` rows × `10` columns, row-major from top `y=0` to bottom `y=19`; `0` = empty, `1..7` = locked piece color index)

### 3.4 Write Document Files (Default `"DOC"`, or custom via `Ctrl+O` / `Ctrl+W`)
Plain-text ASCII tryte stream (`1` tryte per character, `10` = newline, up to `3,700` characters).

### 3.5 Sheet Plain-Text File (`"SHEET"`)
Saved via `Ctrl+S` or `[SAVE]`, loaded via `Ctrl+L` or `[LOAD]`. Each non-empty cell in row-major order (`r = 0..29`, `c = 0..9`) is written as one line:
```text
<Col><Row>:<raw_input>=<evaluated_value_or_error>
```
For example:
```text
A1:20=20
B1:18=18
C1:3=3
C2:=A1+B1*C1=74
D2:=SUM(A1:C2)=134
```

## 4. Documented Generators, Rotation System & Sheet Grammar

### 4.1 Klondike Solitaire Shuffle Algorithm
1. Initialize `deck[i] = i` for `i = 0..51` (`suit = Math.floor(card / 13)` where `0=Spades(Black), 1=Hearts(Red), 2=Clubs(Black), 3=Diamonds(Red)` — alternating colors so `(suitA + suitB) % 2 == 1` iff opposite color; `rank = card % 13` where `0=Ace .. 12=King`).
2. Set `s = seed`.
3. For `i = 51` down to `1`:
   - `s = (s * 127 + 259) % 6561` (if `s < 0`, `s += 6561`)
   - `j = s % (i + 1)`
   - Swap `deck[i]` and `deck[j]`.
4. Deal `28` cards into tableau columns `c = 0..6` (`r = 0..c`, with `tab_down[c] = c` so only `r == c` is initially face-up), and copy `deck[28..51]` into `stock[0..23]` (`stock_len = 24`, top of stock is `stock[stock_len - 1]`).

### 4.2 Tetris Piece Generator & Rotation / Wall-Kick System
- **Piece LCG**: Initialized with `s = seed`. On each piece spawn:
  - `s = (s * 127 + 259) % 6561` (non-negative)
  - `piece = s % 7` (`0=I, 1=O, 2=T, 3=S, 4=Z, 5=J, 6=L`), spawned at `rot = 0, px = 3, py = 0`.
- **4-State Rotation Offsets (`(dx, dy)` for each piece `0..6` and rotation `0..3`)**:
  - `0 (I)`: `R0: (0,1),(1,1),(2,1),(3,1)` | `R1: (2,0),(2,1),(2,2),(2,3)` | `R2: (0,2),(1,2),(2,2),(3,2)` | `R3: (1,0),(1,1),(1,2),(1,3)`
  - `1 (O)`: `R0..R3: (1,0),(2,0),(1,1),(2,1)`
  - `2 (T)`: `R0: (1,0),(0,1),(1,1),(2,1)` | `R1: (1,0),(1,1),(2,1),(1,2)` | `R2: (0,1),(1,1),(2,1),(1,2)` | `R3: (1,0),(0,1),(1,1),(1,2)`
  - `3 (S)`: `R0: (1,0),(2,0),(0,1),(1,1)` | `R1: (1,0),(1,1),(2,1),(2,2)` | `R2: (1,1),(2,1),(0,2),(1,2)` | `R3: (0,0),(0,1),(1,1),(1,2)`
  - `4 (Z)`: `R0: (0,0),(1,0),(1,1),(2,1)` | `R1: (2,0),(1,1),(2,1),(1,2)` | `R2: (0,1),(1,1),(1,2),(2,2)` | `R3: (1,0),(0,1),(1,1),(0,2)`
  - `5 (J)`: `R0: (0,0),(0,1),(1,1),(2,1)` | `R1: (1,0),(2,0),(1,1),(1,2)` | `R2: (0,1),(1,1),(2,1),(2,2)` | `R3: (1,0),(1,1),(0,2),(1,2)`
  - `6 (L)`: `R0: (2,0),(0,1),(1,1),(2,1)` | `R1: (1,0),(1,1),(1,2),(2,2)` | `R2: (0,1),(1,1),(2,1),(0,2)` | `R3: (0,0),(1,0),(1,1),(1,2)`
- **6-Point Wall-Kick Table**: When rotating from `cur_rot` to `new_rot = (cur_rot + 1) % 4`, the guest tests offsets `(kx, ky)` in order:
  `1. (0, 0), 2. (-1, 0), 3. (+1, 0), 4. (0, -1), 5. (-2, 0), 6. (+2, 0)`
  and commits the first non-colliding placement.
- **Scoring**: Soft drop `+1` per row; hard drop `+2` per row; line clears award `100 / 300 / 500 / 800 × level` for `1 / 2 / 3 / 4` simultaneous lines.

### 4.3 Sheet Formula Grammar & Integer Division Semantics
```ebnf
cell_content ::= "=" expr | signed_int | text
expr         ::= term ( ("+" | "-") term )*
term         ::= factor ( ("*" | "/") factor )*
factor       ::= ["+" | "-"] primary
primary      ::= unsigned_int
               | "(" expr ")"
               | ("SUM" | "MIN" | "MAX") "(" cell_ref ":" cell_ref ")"
               | cell_ref
cell_ref     ::= ("A".."J") ("1".."30")
```
- **Number Representation & Division Semantics**: All numbers are 27-trit signed balanced-ternary words (integers). Division uses hardware `DIV` (`Math.trunc(a / b)`, truncating toward zero).
- **Division by Zero**: Checked before executing `DIV`; if the divisor is `0`, evaluation sets cell error state `3` and displays/saves `#DIV/0!`.
- **Circular Reference Detection**: Depth-first 3-color visitation (`0 = unvisited, 1 = visiting, 2 = evaluated`). Encountering a cell with `CELL_VISIT == 1` sets error state `4` (`#CYCLE!`), which propagates to dependent formulas.


## 5. StudioNet v2 (16-Byte Format) & Driver Library Summary (1.1.1)

- **Driver Library**: All hardware access in the guest kernel is partitioned into 6 contiguous, labeled modules (`disk v1`, `timer v1`, `keyboard v1`, `mouse v1`, `framebuffer v1`, `net v2`). See `desktop/DRIVERS.md` for the complete entry-table, register, port, memory, IRQ vector, and error specification.
- **StudioNet v2 Header (16 Bytes, Little-Endian, No Checksum)**:
  - `[0..1] dst (u16 LE)`, `[2..3] src (u16 LE)`, `[4] proto (u8: 1=LOOP, 2=SDP, 3=SSP)`, `[5] flags (u8: 1=SYN, 2=ACK, 4=PSH, 8=FIN)`, `[6..7] sport (u16 LE)`, `[8..9] dport (u16 LE)`, `[10..11] seq (u16 LE)`, `[12..13] ack (u16 LE)`, `[14..15] len (u16 LE, 0..480)`.
- **Ping Timeout Budget**: `250,000` virtual steps (~100 scheduler slices). If no SDP port-7 `ACK|PSH` reply arrives within `250,000` steps of `SYS_NET_PING`, App 10 sets `K_NET_LAST_RTT = -2` and displays `NO REPLY`.


## App 11: Trytris

App 11 is a balanced-ternary triangular falling-piece game written in Triton 3 assembly (`app11_try_rom`), launched from the taskbar button `[T3]` or via Terminal `RUN 11`.

### Controls & Keys

| Key | Action |
|---|---|
| `0`–`9` | Append digit to pending decimal seed (`0..4294967295`) |
| `M` | Cycle pending mode (`NORMAL`, `CURSED`, `HEXIAMOND`) |
| `U` / `D` | Increment / decrement pending starting level (`1..15`) |
| `Enter` | Start new game (`reset(seed, mode)` followed by `setLevel(startLevel)`) |
| `K` | Toggle between **Live** and **Lockstep** mode (writes `TRYSTATE` when entering Lockstep) |
| `L` / `←` | Lockstep: `tick('LEFT')` |
| `R` / `→` | Lockstep: `tick('RIGHT')` |
| `X` / `↑` | Lockstep: `tick('ROT_CW')` |
| `Z` | Lockstep: `tick('ROT_CCW')` |
| `Space` | Lockstep: `tick('HARD')` |
| `N` | Lockstep: `tick(null)` |
| `S` / `↓` | Lockstep: `softDrop()` |

### Live Gravity Rate

- **Virtual clock rate:** `200` virtual steps per millisecond.
- **Gravity interval:** `max(22000, 170000 - (level - 1) * 10000)` virtual steps (corresponding to `max(110, 850 - (level - 1) * 50)` ms).

### Disk Files

- **`TRYSTATE`** (355 trytes, written after `Enter`/`K` and every Lockstep action):
  - `0..2`: `seed` (27-trit word)
  - `3`: `mode` (`0 = NORMAL`, `1 = CURSED`, `2 = HEXIAMOND`)
  - `4..6`: `score` (27-trit word)
  - `7`: `lines`
  - `8`: `level` (`1..15`)
  - `9`: `comboStreak`
  - `10`: `backToBackActive` (`0` or `1`)
  - `11`: `gameOver` (`0` or `1`)
  - `12..15`: active piece (`id` `1..16`, `rotIndex`, `r`, `c`)
  - `16..18`: next 3 piece IDs (`1..16`)
  - `19..354`: `28 × 12` board cells in row-major order (`0` = empty, `1..4` = `P1..P4`, `5..16` = `H1..H12`)
- **`TRYHI`** (3 trytes, loaded at startup and updated whenever `score > highScore`):
  - `0..2`: persisted high score (27-trit word).


---

# TritOS Desktop 2.0 — Architecture, Memory Map, Path Syscalls & Applications (Triton 4)

## 6. TritOS Desktop 2.0 Full Memory Map & `fsck` / Window Buffer Layout

TritOS Desktop 2.0 (`desktop/tritos-desktop-2.html`, assembled from `desktop/guest-200.asm` via `desktop/build_desktop2.js`) runs on the **Triton 4** machine (`triton/triton4.html`, `archMode = 'T3'`).

| Physical Tryte Range | Bank(s) (`19,683` trytes/bank) | Size (Trytes) | Purpose | Access |
|---|---|---:|---|---|
| `0 .. 5,777` | Bank `0` (`0..5,777`) | `5,778` | Stage-0 DMA Bootloader (`DRIVER disk v2`, loads `135` sectors = `98,415` trytes), `kernel_boot_entry`, `DRIVER timer v2`, `DRIVER keyboard v1`, `DRIVER mouse v1`, `syscall_handler`, Preemptive Scheduler, Window Manager, `DRIVER framebuffer v1`, Legacy `0:/` (`Sector 200`) `fs_init`/`fs_find`/`fs_write` (`FW_EXIT + 18 = 5,778 <= 5,800`) | Supervisor |
| `5,800 .. 8,928` | Bank `0` (`5,800..8,928`) | `3,129` | Kernel BSS: Trap/IRQ Vector Table (`VEC_BASE = 5,800`, Vectors `0..12` at `5,800..5,838`), Globals (`5,840..5,899`), 8 Task Control Blocks (`TCB_BASE = 6,000..6,511`), 8 Event Queues (`EVQ_BASE = 6,512..7,023`), Legacy `0:/` Dir Mirror (`FS_DIR_BUF = 7,100..7,828`), Scanline Buffer (`SCAN_BUF = 7,900..8,628`), Window Table (`WINTAB = 8,700..8,891`), Z-Order & Cursor (`8,900..8,928`) | Supervisor |
| `8,930 .. 9,435` | Bank `0` (`8,930..9,435`) | `506` | Mid Kernel: `fs_norm_name`, `fs_read`, `fs_delete`, `app_rom_table` (`Apps 0..14`), Kernel UI Strings, `splash_wait_sub` (`END_OF_CORE_KERNEL = 9,436 <= 9,460`) | Supervisor |
| `9,460 .. 17,999` | Bank `0` (`9,460..17,999`) | `8,540` | `DRIVER net v3` Entry Table & Strings (`9,460..9,699`), `net v3` BSS (`9,700..9,799`), Supervisor/Exception Stack (`9,805..10,190`, `SPR_KSP = 10,190`), `DRIVER net v3` Implementation (`10,200..15,459`), StudioNet Frame Queues (`12,200..17,999`) | Supervisor |
| `18,000 .. 19,592` | Bank `0` (`18,000..19,592`) | `1,593` | 9×9 Balanced-Ternary Font Glyphs (`18,000..18,863`, `864` trytes) & Boot Splash Tiles (`18,864..19,592`, `729` trytes) | Supervisor |
| `19,683 .. 58,950` | Banks `1 .. 2` | `39,268` | Bundled User-Mode Application ROM Templates (`Apps 0..11`) & Self-Host Demo Source (`str_file_demo_asm`) | Supervisor |
| `59,049 .. 65,000` | Bank `3` (`59,049..65,000`) | `5,952` | StudioNet SFP File Transfer Scratch Buffer (`K_SFP_BUF`) | Supervisor |
| `65,020 .. 65,293` | Bank `3` (`65,020..65,293`) | `274` | Kernel 2.0 Far-Call Bridge (`k_fs2_boot_init`, `k_fs2_poll_media`, `k_fs2_fast_fault`, `k_fs2_draw_tb_row2`, `k_fs2_syscall_dispatch` `#50..#65`) | Supervisor |
| `65,400 .. 71,889` | Bank `3` (`65,400..71,889`) | `6,490` | `DRIVER fs v2` (TritFS v2 Copy-on-Write Filesystem Driver, Paged SLT Cache, Path Resolver, `fsck`, Legacy/Doc/App Helpers) | Supervisor |
| `71,890 .. 75,028` | Bank `3` (`71,890..75,028`) | `3,139` | Bundled 2.0 Application ROM Templates: `App 12` Files (`71,890..73,340`), `App 13` Disks (`73,341..74,067`), `App 14` App Shelf (`74,068..75,028`). Total boot image = `75,029` trytes (`103` sectors) | Supervisor |
| `196,830 .. 826,685` | Banks `10 .. 41` | `629,856` | 8 User-Mode Task Memory Segments (`Slot i = 0..7`: `UBASE = (10 + 2*i) * 19,683`, `ULIMIT = UBASE + 39,366`; App 4 Assembler workspace uses Banks `30..49`, `590,490..984,149`) | User (Base/Limit Protected) |
| `866,052 .. 885,734` | Bank `44` | `19,683` | StudioNet SRRP RX/TX Reassembly Buffer (`K_SRRP_BUF`) | Supervisor |
| `1,023,516 .. 1,338,443` | **Banks `52 .. 67`** | `314,928` | **8 Window Backing Pixel Buffers (`Win i = 0..7`: `(52 + 2*i) * 19,683`, `39,366` trytes/window, max `240 × 160 = 38,400` pixels)** | Supervisor |
| `1,377,810 .. 1,395,305` | Bank `70` | `17,496` | Offscreen Taskbar Composition Buffer (`TASKBAR_BUF`, `729 × 24` trytes) | Supervisor |
| `1,397,493 .. 1,398,221` | Bank `71` | `729` | Legacy Sector Scratch Buffer (`FS_SEC_BUF`) | Supervisor |
| `1,417,176 .. 1,456,541` | Banks `72 .. 73` | `39,366` | StudioNet SNS Peer Table (`K_SNS_PEERS`) & Telemetry Scratch | Supervisor |
| `1,456,542 .. 1,464,101` | Bank `74` | `7,560` | `DRIVER fs v2` Metadata & Scratch (`FS_UNIT_TAB` `+0..1079`, `FS_UNIT_FREE` `+1100..1180`, `FS_SLT_META` `+1200..1359`, `FS_STATE_VARS` `+1400..1699`, `FS_PATH_PARTS` `+1700..2079`, `FS_DIR_STACK` `+2100..2819`, `FS_CHAIN_SECS` `+2900..4435`, `FS_SB_BUF` `+4500..5228`, `FS_WORK_SEC` `+5300..6028`, `FS_ZERO_SEC` `+6100..6828`, `FS_TMP_ENTRY`/`FS_TMP_PATH` `+6900..7555`) | Supervisor |
| `1,476,225 .. 1,487,888` | Bank `75` | `11,664` | `DRIVER fs v2` Paged SLT Cache (`FS_SLT_DATA`: `16` pages × `729` trytes = `11,664` trytes, LRU-evicted, write-back on commit) | Supervisor |
| `1,495,908 .. 1,535,273` | Banks `76 .. 77` | `39,366` | `DRIVER fs v2` Directory Read/Rebuild Buffer (`FS_DIR_WORK_BUF`, up to `54` sectors / `972` entries) | Supervisor |
| `1,535,274 .. 1,574,639` | Banks `78 .. 79` | `39,366` | `DRIVER fs v2` Cross-Unit File Copy & App Shelf Launch Buffer (`FS_COPY_BUF`, `39,366` trytes) | Supervisor |
| `1,574,640 .. 1,594,322` | **Bank `80`** | `19,683` | **`fsck` Traversal Stack (`FS_FSCK_STACK`, up to `2,500` 7-tryte walk items)** | Supervisor |
| `1,594,323 .. 3,188,645` | **Banks `81 .. 161`** | `1,594,323` | **`fsck` Generation-Stamped Sector Owner Table (`FSCK_OWNER_BASE`, $3^{13} = 1,594,323$ trytes)** | Supervisor |
| `3,188,646 .. 4,782,968` | **Banks `162 .. 242`** | `1,594,323` | **`fsck` Generation-Stamped Chain-Loop Detector (`FSCK_SEEN_BASE`, $3^{13} = 1,594,323$ trytes)** | Supervisor |
| `15,000,000 .. 15,354,293` | MMIO | `354,294` | Architected MMIO Framebuffer (`729 × 486` pixels in 729-color palette `[-364..+364]`) | MMIO |

### Where the `fsck` Tables Live Relative to Window Buffers & Running `fsck` With Windows Open

- **Relative Placement:** The 8 window backing buffers (`Win 0..7`) live in **Banks `52..67` (`1,023,516 .. 1,338,443`)**, and user task segments (`Slots 0..7`) live in **Banks `10..41` (`196,830 .. 826,685`)**. The `DRIVER fs v2` workspace and all three `fsck` structures (`FS_FSCK_STACK` in Bank `80` at `1,574,640 .. 1,594,322`, `FSCK_OWNER_BASE` in Banks `81..161` at `1,594,323 .. 3,188,645`, and `FSCK_SEEN_BASE` in Banks `162..242` at `3,188,646 .. 4,782,968`) start at **Bank `74` (`1,456,542`)**, more than `118,000` trytes above the top of the highest window buffer (`1,338,443`).
- **Can `fsck` Run With Windows Open?** **Yes.** Because `FS_FSCK_STACK`, `FSCK_OWNER_BASE`, and `FSCK_SEEN_BASE` do not overlap any window backing buffer (`Banks 52..67`), taskbar buffer (`Bank 70`), or user task segment (`Banks 10..41`), `fsck` runs safely with any number of desktop windows open (including when invoked interactively via the `[C]` Check button inside the Disks app window while other apps are open and running).
- **Measured `fsck` Cost:** Table clear is constant-time (`1` increment of the 27-trit generation counter `FSCK_GEN` at `1,457,960`, rather than zeroing `3,188,646` trytes); the directory tree and SLT chain walk is linear in sectors used; the orphan scan is linear in total sectors on the unit (`total_sectors` SLT entries).

---

## 7. TritOS Desktop 2.0 System Calls (Path Syscalls `#50..#65` & Time Syscalls)

<!-- GENERATED BY desktop/gen_desktop_doc.js FROM desktop/guest-200.asm — DO NOT HAND-EDIT -->

Legacy `SYS_FS_*` syscalls (`#30..#33`) remain compatible and operate on `0:/` (`Sector 200` format). Desktop 2.0.1 exposes `#9` (`SYS_GET_MS`) and the `#50..#65` bridge in `k_fs2_syscall_dispatch`. Every pointer argument in `#50..#65` is validated by `k_check_user_ptr` against the calling task's `[UBASE, ULIMIT)` (TCB `+36` and `+39`) before the kernel reads or writes guest memory.

### 7.1 Syscall Table (`#9` and `#50..#65`)

| Syscall | Name | Arguments (`*` = pointer) | Pointer Validation & Length | Return Value | Error Codes |
|---:|---|---|---|---|---|
| `#9` | `SYS_GET_MS` | None | pointer args: none | `R0` = elapsed milliseconds (`drv_timer_read / 200`) | None |
| `#50` | `SYS_FS2_LIST` | `R0=path_ptr`*, `R1=out_buf_ptr`*, `R2=max_entries` | R0 (path_ptr, stringz: NUL-terminated through terminating 0 before ULIMIT); R1 (out_buf_ptr, buf: (R2>0?R2:64)*27) | R0 = active entry count (>= 0), or negative error code | `ERR_BADPTR` (`-14`), `ERR_FS_ERR` (`-1`) |
| `#51` | `SYS_FS2_STAT` | `R0=path_ptr`*, `R1=out_ent27_ptr`* | R0 (path_ptr, stringz: NUL-terminated through terminating 0 before ULIMIT); R1 (out_ent27_ptr, struct: 27) | R0 = 0 on success, or negative error code | `ERR_BADPTR` (`-14`), `ERR_FS_ERR` (`-1`) |
| `#52` | `SYS_FS2_READ` | `R0=path_ptr`*, `R1=dst_buf_ptr`*, `R2=max_trytes` | R0 (path_ptr, stringz: NUL-terminated through terminating 0 before ULIMIT); R1 (dst_buf_ptr, buf: actual_read_len) | R0 = trytes read (>= 0), or negative error code | `ERR_BADPTR` (`-14`), `ERR_FS_ERR` (`-1`), `ERR_FS_NO_UNIT` (`-4`) |
| `#53` | `SYS_FS2_WRITE` | `R0=path_ptr`*, `R1=src_buf_ptr`*, `R2=len_trytes`, `R3=type`, `R4=mtime` | R0 (path_ptr, stringz: NUL-terminated through terminating 0 before ULIMIT); R1 (src_buf_ptr, buf: R2) | R0 = 0 on success, or negative error code | `ERR_BADPTR` (`-14`), `ERR_FS_ERR` (`-1`), `ERR_FS_NO_UNIT` (`-4`), `ERR_FS_WP` (`-5`) |
| `#54` | `SYS_FS2_MKDIR` | `R0=path_ptr`*, `R1=mtime` | R0 (path_ptr, stringz: NUL-terminated through terminating 0 before ULIMIT) | R0 = 0 on success, or negative error code | `ERR_BADPTR` (`-14`), `ERR_FS_ERR` (`-1`), `ERR_FS_NO_UNIT` (`-4`), `ERR_FS_WP` (`-5`) |
| `#55` | `SYS_FS2_DELETE` | `R0=path_ptr`* | R0 (path_ptr, stringz: NUL-terminated through terminating 0 before ULIMIT) | R0 = 0 on success, or negative error code | `ERR_BADPTR` (`-14`), `ERR_FS_ERR` (`-1`), `ERR_FS_NO_UNIT` (`-4`), `ERR_FS_WP` (`-5`) |
| `#56` | `SYS_FS2_RENAME` | `R0=path_ptr`*, `R1=new_name_ptr`* | R0 (path_ptr, stringz: NUL-terminated through terminating 0 before ULIMIT); R1 (new_name_ptr, stringz: NUL-terminated through terminating 0 before ULIMIT) | R0 = 0 on success, or negative error code | `ERR_BADPTR` (`-14`), `ERR_FS_ERR` (`-1`), `ERR_FS_NO_UNIT` (`-4`), `ERR_FS_WP` (`-5`) |
| `#57` | `SYS_FS2_COPY` | `R0=src_path_ptr`*, `R1=dst_path_ptr`* | R0 (src_path_ptr, stringz: NUL-terminated through terminating 0 before ULIMIT); R1 (dst_path_ptr, stringz: NUL-terminated through terminating 0 before ULIMIT) | R0 = trytes copied (>= 0), or negative error code | `ERR_BADPTR` (`-14`), `ERR_FS_ERR` (`-1`), `ERR_FS_NO_UNIT` (`-4`), `ERR_FS_WP` (`-5`) |
| `#58` | `SYS_FS2_UNIT_INFO` | `R0=unit`, `R1=out_info32_ptr`* | R1 (out_info32_ptr, struct: 32) | R0 = mounted kind (0=unmounted, 1=legacy Unit 0, 2=TritFS v2), or negative error code | `ERR_BADPTR` (`-14`), `ERR_FS_NO_UNIT` (`-4`) |
| `#59` | `SYS_FS2_FORMAT` | `R0=unit`, `R1=label_str_ptr`* | R1 (label_str_ptr, stringz: NUL-terminated through terminating 0 before ULIMIT) | R0 = 0 on success, or negative error code | `ERR_BADPTR` (`-14`), `ERR_FS_ERR` (`-1`), `ERR_FS_NO_UNIT` (`-4`), `ERR_FS_WP` (`-5`) |
| `#60` | `SYS_FS2_FSCK` | `R0=unit`, `R1=repair_flag`, `R2=out_report12_ptr`* | R2 (out_report12_ptr, struct: 12) | R0 = problems_count, R1 = orphans_count (both negative on error) | `ERR_BADPTR` (`-14`), `ERR_FS_ERR` (`-1`) |
| `#61` | `SYS_FS2_COPY_LEGACY` | None | pointer args: none | R0 = number of legacy files copied (>= 0), or negative error code | `ERR_FS_ERR` (`-1`) |
| `#62` | `SYS_RTC` | `R0=op`, `R1=arg1`, `R2=arg2` | pointer args: none | R0 = RTC seconds (op=0), or 0 / negative error code (op=1..3) | `ERR_FS_ERR` (`-1`) |
| `#63` | `SYS_FS2_DOC_SAVE` | `R0=name_or_path_ptr`*, `R1=src_buf_ptr`*, `R2=len_trytes`, `R3=type` | R0 (name_or_path_ptr, stringz: NUL-terminated through terminating 0 before ULIMIT); R1 (src_buf_ptr, buf: R2) | R0 = 0 on success, or negative error code | `ERR_BADPTR` (`-14`), `ERR_FS_ERR` (`-1`), `ERR_FS_NO_UNIT` (`-4`), `ERR_FS_WP` (`-5`) |
| `#64` | `SYS_FS2_DOC_LOAD` | `R0=name_or_path_ptr`*, `R1=dst_buf_ptr`*, `R2=max_trytes` | R0 (name_or_path_ptr, stringz: NUL-terminated through terminating 0 before ULIMIT); R1 (dst_buf_ptr, buf: actual_read_len) | R0 = trytes read (>= 0), or negative error code | `ERR_BADPTR` (`-14`), `ERR_FS_ERR` (`-1`), `ERR_FS_NO_UNIT` (`-4`) |
| `#65` | `SYS_FS2_APP_INSTALL` | `R0=app_folder_name_ptr`* | R0 (app_folder_name_ptr, stringz: NUL-terminated through terminating 0 before ULIMIT) | R0 = files copied (>= 1), or negative error code | `ERR_BADPTR` (`-14`), `ERR_FS_ERR` (`-1`) |

### 7.2 Path Syscall Error Codes

| Name | Value | Meaning |
|---|---:|---|
| `ERR_FS_ERR` | `-1` | General filesystem error (invalid argument, bad path, not found, read-only entry, non-empty directory, disk full, or unit not mounted) |
| `ERR_FS_NO_UNIT` | `-4` | Unit not present, out of range, or media removed/changed during I/O |
| `ERR_FS_WP` | `-5` | Target unit is write-protected |
| `ERR_BADPTR` | `-14` | Pointer argument (or range [ptr, ptr + len - 1] or NUL-terminated path) lies outside the calling task's [UBASE, ULIMIT) |

---
## 8. `SYS_EXEC_BUF` Executable Format & App Shelf Cartridge Format

### 8.1 `SYS_EXEC_BUF` (`SYSCALL #7`) Executable Format (`main`) & Task Start State

<!-- GENERATED BY desktop/gen_desktop_doc.js FROM desktop/guest-200.asm (k_init_task_slot) — DO NOT HAND-EDIT -->

- **Invocation:** `R0 = buf_ptr`, `R1 = len_trytes`, `R2 = app_id` (e.g., `15` for App Shelf launches).
- **Binary Layout:** Raw Triton 3 user-mode machine code trytes assembled for origin `0` and copied into the task's `[UBASE, ULIMIT)` segment by `k_init_task_slot`.
- **Task Start State (`k_init_task_slot`):**

| Register / Field | TCB Offset | Initial Value |
|---|---:|---|
| `R0..R7` | `+0..+21` | `0` (TCB zero-filled via `BFILL`) |
| `R8` | `+24` | `UBASE` |
| `PC` | `+27` | `UBASE` |
| `SP` | `+30` | `UBASE + 4500` (per-app exceptions: App `6`: `UBASE + 6950`; App `11`: `UBASE + 4980`) |
| `ESR` | `+33` | `108` (User Mode, protection enabled, `IE = 1`) |
| `UBASE` | `+36` | Regular tasks: `(10 + 2 * slot) * 19,683`; App `4` (Assembler): `30 * 19,683 (590,490)` |
| `ULIMIT` | `+39` | Regular tasks: `UBASE + 39,366 (2 banks)`; App `4` (Assembler): `50 * 19,683 (984,150)` (`20` banks) |
### 8.2 App Shelf (`1:/apps/<name>` and `2:/apps/<name>`) Directory & `icon` Format
Each application folder under `1:/apps/<name>` or `2:/apps/<name>` contains:
1. **`main`** (`meta_type = 4` executable, required): Raw `SYS_EXEC_BUF` user-mode executable trytes (`1..39,000` trytes).
2. **`icon`** (`meta_type = 2` image, optional):
   - Either **`256` trytes** (`16 × 16` row-major pixels in the 729-color balanced-ternary palette `[-364..+364]`) or **`258` trytes** (`2`-tryte header `[16, 16]` followed by `256` row-major pixel trytes).
   - When present, App 14 (`App Shelf`) renders the `16 × 16` icon alongside the app folder name; when absent, App Shelf renders a default application badge.

---

## 9. TritOS Desktop 2.0 Bundled Applications (`Apps 12..14`)

- **Taskbar Row 1 (`y = 462..473`):** `[TERM]` (0), `[MON]` (1), `[CALC]` (5), `[CLK]` (3), `[EDIT]` (8), `[PNT]` (2), `[ASM]` (4), `[SOL]` (6), `[TBLK]` (7), `[SHEET]` (9), `[NET]` (10), `[T3]` (11).
- **Taskbar Row 2 (`y = 474..485`):** `[FILE]` (App 12), `[DISK]` (App 13), `[APPS]` (App 14).
- **App 12 — Files (`[FILE]`):**
  - Lists entries in the current path (`1:/`, `0:/`, `2:/`, or subfolders), displaying `[D]` for folders and `[F]` for files along with tryte size.
  - Controls / Toolbar buttons:
    - `0`..`3` or `[0:]` `[1:]` `[2:]`: Switch active unit (`0:/`, `1:/`, `2:/`, `3:/`)
    - `U` / `D` (`↑` / `↓`): Move selection cursor
    - `Enter` or `[OPEN]`: Enter selected folder or view file info (`type`, `size_trytes`, `modified_rtc`)
    - `B` or `[UP]`: Navigate to parent folder (`..`)
    - `N` or `[NEW]`: Create a new folder (`NEWDIR`) in the current directory
    - `R` or `[REN]`: Rename the selected entry
    - `X` (`Y` to confirm) or `[DEL]`: Delete the selected entry (with confirmation prompt)
    - `C` or `[CPY]`: Copy the selected file across units (e.g., `1:/` ↔ `2:/`)
    - `L` or `[LEGACY]`: **"Copy legacy files"** — copies every file from `0:/` (`Sector 200`) into `1:/legacy/<name>`
- **App 13 — Disks (`[DISK]`):**
  - Displays mounted status, volume label, total sectors, and free sectors for units `0:..3:` (and any selected unit `0..26`).
  - Controls / Toolbar buttons:
    - `0`..`9` or `U`/`D`: Select unit
    - `F` or `[FMT]`: Format selected unit (`1..26`) as TritFS v2
    - `C` or `[CHK]`: Run `fsck` (with orphan repair enabled) on the selected unit and display `[problems, orphans, fixed_orphans, free_sectors]`
    - `E` or `[EJT]`: Unmount/eject selected removable unit
- **App 14 — App Shelf (`[APPS]`):**
  - Scans `1:/apps` and `2:/apps`, renders each app's `16 × 16` `icon` (when present) and folder name (`1:<name>` or `2:<name>`), launches `main` via `SYS_EXEC_BUF` on `Enter` / `[RUN]`, and installs cartridge apps from `2:/apps/<name>` to `1:/apps/<name>` on `I` / `[INST]`.
