# TritOS Desktop 1.1 — Architecture, Syscall, Application & Protocol Reference

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
| `#44` | `SYS_NET_SEND_FILE` | `R0 = dst_node, R1 = filename_ptr` | Reads file from disk and transmits it in `PROTO_SFP (5)` chunks of up to 240 trytes |
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
