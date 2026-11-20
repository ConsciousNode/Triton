# Triton 4.0 Instruction Set & Hardware Architecture (`ISA-4.md`)

**ConsciousNode SoftWorks · Normative Architecture Specification (Version 4.0)**

*All numerical figures, opcode encodings, memory ranges, port definitions, storage unit classes, and vector offsets in this specification are generated programmatically by `tests/t4-generate-docs.js` directly from `triton4.html`.*

Triton 4.0 extends Triton 3.1.1 (`333,801` bytes) into a complete card-computer architecture (`triton4.html`, `369,330` bytes, `11,029` lines; MicroWAT WASM module `12,124` bytes from `103,711` bytes of WAT source) while remaining **step-for-step backward-compatible** with every Triton 3.1.1 and Triton 2.1 program that does not access Ports `28+`.

## 1. Summary of Triton 4.0 Architectural Extensions

1. **Multi-Unit Sparse Block & Stream Storage (`Ports 28..30`, `Vector 12 IRQ_MEDIA`)**:
   - Supports **27 addressable storage units (`0 .. 26`)**:
     - **Unit `0`**: Boot disk, fixed at **$3^7 = 2,187$ sectors** ($`1,594,323`$ trytes), preserving the legacy TritOS layout.
     - **Unit `1`**: Home disk (main storage), defaulting to **$3^{10} = 59,049$ sectors** ($`43,046,721`$ trytes), blank on cold creation.
     - **Unit `2`**: Removable cartridge slot (any sector count up to **$3^{13} = 1,594,323$ sectors** = $`1,162,261,467`$ trytes).
     - **Units `3 .. 26`**: Removable extra disk image slots on microSD.
   - All existing disk ports (`7..8` stream disk, `17..21` DMA block disk) act on the currently selected `DISK_UNIT` (`Port 28`).
   - `DISK_ERR` (`Port 21`) adds error code `4` (`ERR_BAD_UNIT`) for invalid, empty, or write-protected units.
   - Inserting or ejecting a unit sets bit 3 (`changed = 8`) in `DISK_FLAGS` (`Port 30`, which clears on read) and raises **Vector `12` (`IRQ_MEDIA`, IRQ bit 5 = `32`)**.
2. **Real-Time 200 kHz Timer Mode & Real-Time Clock (`Ports 31..32`)**:
   - `TIMER_MODE` (`Port 31`): `0` (reset default) counts CPU steps as in Triton 3.1.1; `1` counts real time at **200 kHz** ($1$ tick per $5\,\mu\text{s} = 200$ ticks/ms) from an injectable host clock on both `TIMER_TICKS` (`Port 6`) and the periodic timer (`Port 9`, `IRQ_TIMER`).
   - `RTC_SECONDS` (`Port 32`): 27-trit seconds elapsed since **`2000-01-01 00:00:00 UTC`** (`946684800000` ms Unix epoch) driven by the same injectable clock. Writing `OUT rd, #32` sets an offset.
3. **Power-Cut Fault Injector (`cutPowerAfterSectorWrites(N)`)**:
   - Halts the machine as if unplugged immediately after the next $N$ sector writes ($N \ge 0$): all unit contents up to cut point $N$ persist, while RAM, VRAM, and CPU registers are wiped.

## 2. Fundamental Data Types & Storage Size Classes

### 2.1 Hierarchy of Balanced-Ternary Units

| Unit | Width (Trits) | Cardinality ($3^n$) | Balanced Range $[-\frac{3^n-1}{2}, +\frac{3^n-1}{2}]$ | Architectural Role in Triton 4.0 |
| :--- | :--- | :--- | :--- | :--- |
| **Trit** | $1 = 3^0$ | $3$ | $[-1, +1]$ (`T`, `0`, `1`) | Atomic ternary digit; individual status flag (`SF`, `CF`, `OF`) |
| **Diad** | $2$ | $9$ | $[-4, +4]$ (`TT` .. `11`) | Register specifier (`R0`–`R8`); single color channel ($9$ levels) in T3 display |
| **Triad** | $3 = 3^1$ | $27$ | $[-13, +13]$ (`TTT` .. `111`) | T2 status register (`SR`), T2 27-color pixel, `TUNARY` truth table |
| **Hexad** | $6 = 2 \times 3$ | $729$ | $[-364, +364]$ | T3 729-color pixel ($2$ trits each of R, G, B in low 6 trits of a tryte) |
| **Tryte** | $9 = 3^2$ | $19,683$ | $[-9,841, +9,841]$ | Addressable memory/disk cell, T2 `PC`/`SP`, instruction immediate `imm9` |
| **Parcel** | $18 = 2 \times 9$ | $387,420,489$ | $[-193,710,244, +193,710,244]$ | Fixed-width 2-tryte instruction parcel (`Tryte 0`, `Tryte 1`) |
| **Word** | $27 = 3^3$ | $7,625,597,484,987$ | $[-3,812,798,742,493, +3,812,798,742,493]$ | General-purpose register width (`R0`–`R8`), T3 `PC`, `SP`, LBA, RTC seconds |

### 2.2 Standard Disk Unit Map & Size Classes

| Unit Slot | Role | Default State | Default Sector Count |
| :--- | :--- | :--- | :--- |
| `0` | Boot Disk (Legacy layout) | Present, Fixed, RW | `2,187` ($3^7$) |
| `1` | Home Disk (Main storage) | Present, Fixed, RW | `59,049` ($3^{10}$) |
| `2` | Cartridge Slot | Empty, Removable | `0` (any size when inserted) |
| `3 .. 26` | Extra MicroSD Images | Empty, Removable | `0` (any size when inserted) |

| Size Class | Sectors ($3^k$) | Capacity (Trytes) | Raw Image Bytes ($2\text{ B/tryte}$) | TritFS v2 Link Table Sectors ($\lceil N / 243 \rceil$) |
| :--- | :--- | :--- | :--- | :--- |
| **Small ($3^7$)** | `2,187` | `1,594,323` | `3,188,646` (~3.2 MB) | `9` sectors (`6,561` trytes) |
| **Home ($3^{10}$)** | `59,049` | `43,046,721` | `86,093,442` (~86.1 MB) | `243` sectors (`177,147` trytes) |
| **Large ($3^{13}$)** | `1,594,323` | `1,162,261,467` | `2,324,522,934` (~2.32 GB) | `6,561` sectors (`4,782,969` trytes, paged) |

## 3. Registers, Special-Purpose Registers (SPRs) & Memory Map

### 3.1 Special-Purpose Registers (`MFSPR rd, imm9` / `MTSPR rs1, imm9`)

| SPR Index (`imm9`) | Symbolic Name | Reset Value | Architectural Semantics |
| :--- | :--- | :--- | :--- |
| `0` | `SPR_MODE` | `1` (T3) | `0` = T2 (9-trit wrap), `1` = T3 (27-trit protected) |
| `1` | `SPR_PRIV` | `0` (Supervisor) | `0` = Supervisor mode, `1` = User mode |
| `2` | `SPR_IE` | `0` | Global Interrupt Enable (`0` = masked, `1` = enabled) |
| `3` | `SPR_IMASK` | `0` | 6-bit hardware IRQ enable mask (`bit 0..5` for Vec `7..12`) |
| `4` | `SPR_IPEND` | `0` | 6-bit hardware IRQ pending bitmap (`bit 0..5` for Vec `7..12`) |
| `5` | `SPR_VBR` | `0` | 27-trit Vector Base Register (tryte address of 13-entry vector table) |
| `6` | `SPR_UBASE` | `0` | 27-trit User Base Register (inclusive lower bound in User mode) |
| `7` | `SPR_ULIMIT` | `4782969` | 27-trit User Limit Register (exclusive upper bound in User mode) |
| `8` | `SPR_PROT_EN` | `1` | User protection enable (`1` = enforce `[UBASE, ULIMIT)`, `0` = off) |
| `9` | `SPR_EPC` | `0` | 27-trit Exception Program Counter saved on trap/interrupt entry |
| `10` | `SPR_ESP` | `0` | 27-trit Exception Stack Pointer saved on trap/interrupt entry |
| `11` | `SPR_ESR` | `0` | Exception Status Register (`SF + 3*CF + 9*OF + 27*PRIV + 81*IE`) |
| `12` | `SPR_ECAUSE` | `0` | Exception Cause code (vector index `0..12`, or `imm9` on `SYSCALL`) |
| `13` | `SPR_EADDR` | `0` | 27-trit Exception Faulting Address (or opcode/port/syscall immediate) |
| `14` | `SPR_KSP` | `0` | 27-trit Kernel Stack Pointer loaded into `SP` when trapping from User mode |
| `15` | `SPR_TRAP_DIV0` | `0` | `1` = trap on `DIV`/`MOD` by zero (Vector 5); `0` = deterministic non-trapping |

### 3.2 Physical Memory & MMIO Address Map

| Address Range (Trytes) | Size (Trytes) | Region Name | Access Rules & Protection |
| :--- | :--- | :--- | :--- |
| `0 .. 4,782,968` ($3^{14}$, default) | `4,782,969` | **Default Physical RAM** | Full read/write in Supervisor mode; restricted to `[UBASE, ULIMIT)` in User mode when `PROT_EN = 1` |
| `0 .. 14,348,906` ($3^{15}$, max) | `14,348,907` | **Max Configurable Physical RAM** | Configurable via `new TritonJS({ ramSize })` / `TritonWASM.createSync({ ramSize })` |
| `15,000,000 .. 15,354,293` | `354,294` ($729 \times 486$) | **MMIO Display Framebuffer** | 1 tryte per pixel ($729$ colors: low 6 trits = 2 trits R, 2 trits G, 2 trits B; high 3 trits = 0) |
| All other addresses | — | **Unmapped Address Space** | Raises **Bad Address fault (Vector 4, `BAD_ADDR`)** with full 27-trit `EADDR = addr`; never wraps silently |

## 4. Interrupts & Exceptions (Vectors `0 .. 12`)

Each vector table entry occupies **1 word (3 consecutive trytes)** at $\text{VBR} + 3 \times \text{vec}$:

| Vector (`vec`) | Name | Table Offset | Category | Trigger Condition |
| :--- | :--- | :--- | :--- | :--- |
| `0` | `RESET` | `VBR + 0` (`3` trytes) | Supervisor | Cold/warm reset entry vector |
| `1` | `ILLEGAL_OP` | `VBR + 3` (`3` trytes) | Fault Trap | Unallocated or illegal instruction opcode (`EADDR = op`) |
| `2` | `PRIV_VIOL` | `VBR + 6` (`3` trytes) | Fault Trap | Supervisor-only instruction executed in User mode (`PRIV = 1`) |
| `3` | `PROT_VIOL` | `VBR + 9` (`3` trytes) | Fault Trap | User memory access outside `[UBASE, ULIMIT)` (`EADDR = addr`) |
| `4` | `BAD_ADDR` | `VBR + 12` (`3` trytes) | Fault Trap | Physical address outside `[0, RAM_SIZE)` and MMIO (`EADDR = addr`) |
| `5` | `DIV_ZERO` | `VBR + 15` (`3` trytes) | Fault Trap | Division or modulo by zero when `SPR[15]` (`TRAP_DIV0`) is `1` |
| `6` | `SYSCALL` | `VBR + 18` (`3` trytes) | Software Trap | `SYSCALL imm9` system call (`ECAUSE = imm9`, `EADDR = imm9`) |
| `7` | `IRQ_TIMER` | `VBR + 21` (`3` trytes) | Hardware IRQ 0 (`bit 0 = 1`) | Programmable periodic timer interrupt (Mode 0 = steps, Mode 1 = 200 kHz real time) |
| `8` | `IRQ_KBD` | `VBR + 24` (`3` trytes) | Hardware IRQ 1 (`bit 1 = 2`) | Keyboard key-down / key-up event queued |
| `9` | `IRQ_MOUSE` | `VBR + 27` (`3` trytes) | Hardware IRQ 2 (`bit 2 = 4`) | Mouse relative motion / button event queued |
| `10` | `IRQ_DISK` | `VBR + 30` (`3` trytes) | Hardware IRQ 3 (`bit 3 = 8`) | Block disk multi-sector DMA read/write completion on selected unit |
| `11` | `IRQ_NET` | `VBR + 33` (`3` trytes) | Hardware IRQ 4 (`bit 4 = 16`) | StudioNet network frame received in RX buffer |
| `12` | `IRQ_MEDIA` | `VBR + 36` (`3` trytes) | Hardware IRQ 5 (`bit 5 = 32`) | Removable storage unit (`0..26`) inserted or ejected |

## 5. Architected I/O Ports (`Ports 0 .. 32`)

In T3 mode, `IN rd, port` (`+31`) and `OUT rd, port` (`+32`) are **Supervisor-only** (faulting via Vector 2 in User mode). In T2 compatibility mode (`SPR_MODE = 0`), Ports `28+` read `0` and ignore writes.

| Port (`imm9`) | Symbolic Name | `IN rd, port` (Read Semantics) | `OUT rd, port` (Write Semantics) |
| :--- | :--- | :--- | :--- |
| `0` | `CONSOLE_CHAR` | Dequeues next ASCII character from console input queue (`0` if empty) | Appends character $R[rd]_0 \bmod 19683$ to console transcript |
| `1` | `CONSOLE_NUM` | Returns queued console character count | Appends decimal representation of 27-trit $R[rd]$ to console |
| `2` | `DISPLAY_X` | Reads active display X coordinate ($0..728$ in T3, $0..242$ in T2) | Sets `DisplayX` $\leftarrow R[rd]_0 \bmod W$ |
| `3` | `DISPLAY_Y` | Reads active display Y coordinate ($0..485$ in T3, $0..242$ in T2) | Sets `DisplayY` $\leftarrow R[rd]_0 \bmod H$ |
| `4` | `DISPLAY_PIXEL` | Reads pixel color at `(DisplayX, DisplayY)` | Writes pixel color ($[-364..+364]$ in T3, $[-13..+13]$ in T2) |
| `5` | `DISPLAY_CMD` | Reads last display fill color | Fills entire framebuffer with color $R[rd]_0$ |
| `6` | `TIMER_TICKS` | Reads 27-trit tick counter (Mode 0 = `steps`; Mode 1 = 200 kHz real-time ticks) | Sets `timerTicks` (or `realTimeTicks` in Mode 1) |
| `7` | `DISK_ADDR` | Reads stream tryte address on selected unit | Sets stream `DiskAddr` $\leftarrow R[rd] \bmod (\text{DISK\_SIZE} \times 729)$ |
| `8` | `DISK_DATA` | Reads `Unit[DiskUnit][DiskAddr]` and increments `DiskAddr` (wrapping at unit size) | Writes $R[rd]_0$ to `Unit[DiskUnit][DiskAddr]` and increments `DiskAddr` |
| `9` | `TIMER_PERIOD` | Reads programmable periodic timer period | Sets `TimerPeriod` $\leftarrow R[rd]$, resets `TimerCount <- 0` |
| `10` | `KBD_COUNT` | Returns queued hardware keyboard events | Ignored |
| `11` | `KBD_DATA` | Dequeues next keyboard event keycode into $R[rd]$ and latches type | Ignored |
| `12` | `KBD_TYPE` | Returns latched event type (`0` = key-down, `1` = key-up) | Ignored |
| `13` | `MOUSE_COUNT` | Returns queued hardware mouse events | Ignored |
| `14` | `MOUSE_DX` | Dequeues next mouse event $\Delta X$ into $R[rd]$ and latches $\Delta Y$, buttons | Ignored |
| `15` | `MOUSE_DY` | Returns latched mouse $\Delta Y$ | Ignored |
| `16` | `MOUSE_BTN` | Returns latched 3-button mask (`bit 0`: Left, `1`: Right, `2`: Middle) | Ignored |
| `17` | `DISK_LBA` | Reads DMA starting sector number (`0 .. DISK_SIZE - 1`) | Sets `DiskLba` $\leftarrow R[rd]$ |
| `18` | `DISK_DMA_ADDR` | Reads DMA physical RAM tryte address | Sets `DiskDmaAddr` $\leftarrow R[rd]$ |
| `19` | `DISK_COUNT` | Reads DMA sector count $N$ ($729 N$ trytes) | Sets `DiskCount` $\leftarrow R[rd]$ |
| `20` | `DISK_CMD_STAT` | Reads DMA status (`0`=idle, `1`=OK, `-1`=error) | Executes DMA on selected unit: `0`=reset, `1`=Read, `2`=Write (raises `IRQ_DISK`) |
| `21` | `DISK_ERR` | Reads DMA error (`0`=none, `1`=bad sector, `2`=bad DMA addr, `3`=bad cmd, `4`=bad/empty unit) | Ignored |
| `22` | `NET_STATUS` | Returns StudioNet magic `0xA4 | rx_ready` (`164` or `165`) | Ignored |
| `23` | `NET_NODE_ID` | Returns StudioNet station node ID (`0x0003` default) | Ignored |
| `24` | `NET_TX_LEN` | Reads current TX FIFO byte count | Transmits `R[rd]`-byte frame (`12..512` B) onto StudioNet bus |
| `25` | `NET_RX_LEN` | Returns byte length of current RX frame (`0` if none) | Writing `1` pops current RX frame and advances RX queue |
| `26` | `NET_TX_FIFO` | Returns `0` | Appends byte $R[rd]_0 \bmod 256$ to outbound TX frame buffer |
| `27` | `NET_RX_FIFO` | Reads next byte from current inbound RX frame | Ignored |
| `28` | `DISK_UNIT` | Reads selected storage unit (`0 .. 26`, reset default `0`) | Selects storage unit $R[rd]$; all disk ports (`7..8, 17..21`) act on it |
| `29` | `DISK_SIZE` | Reads sector count of selected unit (`0` = no medium; `2,187` on Unit 0) | Ignored |
| `30` | `DISK_FLAGS` | Reads unit flags (`bit 0` present, `1` removable, `2` WP, `3` changed—clears on read) | Ignored |
| `31` | `TIMER_MODE` | Reads current timer mode (`0` or `1`) | Sets timer mode: `0` = virtual steps (default); `1` = real time (200 kHz / $5\,\mu\text{s}$) |
| `32` | `RTC_SECONDS` | Reads 27-trit seconds since `2000-01-01 00:00 UTC` | Sets RTC clock offset so `RTC_SECONDS` equals $R[rd]$ at current host time |
| `40 .. 48` | *Reserved* | Reserved for future audio specification (reads `0`) | Ignored |

## 6. Complete Instruction Encoding Table (69 Opcodes)

Out of $3^5 = 243$ possible 5-trit opcodes ($[-121, +121]$), Triton 4.0 allocates **69 opcodes** (46 base T2/T3 opcodes + 23 T3 opcodes), leaving **174 free opcodes (71.6%)**.

| Mnemonic | Op Dec | Op Trits ($t_8..t_4$) | Tryte 0 Layout | Tryte 1 Layout | Assembly Syntax | Mode | Flag Updates (`SF`, `CF`, `OF`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `HALT` | `-1` | `0000T` | `0000T | 00 | 00` | `000000000` | `HALT` | T2 / T3 (Sup) | Unchanged |
| `NOP` | `+0` | `00000` | `00000 | 00 | 00` | `000000000` | `NOP` | T2 & T3 | Unchanged |
| `LI` | `+1` | `00001` | `00001 | rd | 00` | `imm9` | `LI rd, imm9` | T2 & T3 | `SF=sign`, `CF=0`, `OF=0` |
| `LUI` | `+2` | `0001T` | `0001T | rd | 00` | `imm9` | `LUI rd, imm9` | T2 & T3 | `SF=sign`, `CF=0`, `OF=0` |
| `MOV` | `+3` | `00010` | `00010 | rd | rs1` | `000000000` | `MOV rd, rs1` | T2 & T3 | `SF=sign`, `CF=0`, `OF=0` |
| `ADD` | `+4` | `00011` | `00011 | rd | rs1` | `0000000 | rs2` | `ADD rd, rs1, rs2` | T2 & T3 | `SF=sign`, `CF=c27`, `OF=c27` |
| `ADDI` | `+5` | `001TT` | `001TT | rd | rs1` | `imm9` | `ADDI rd, rs1, imm9` | T2 & T3 | `SF=sign`, `CF=c27`, `OF=c27` |
| `ADC` | `+6` | `001T0` | `001T0 | rd | rs1` | `0000000 | rs2` | `ADC rd, rs1, rs2` | T2 & T3 | `SF=sign`, `CF=c27`, `OF=c27` |
| `SUB` | `+7` | `001T1` | `001T1 | rd | rs1` | `0000000 | rs2` | `SUB rd, rs1, rs2` | T2 & T3 | `SF=sign`, `CF=c27`, `OF=c27` |
| `SUBI` | `+8` | `0010T` | `0010T | rd | rs1` | `imm9` | `SUBI rd, rs1, imm9` | T2 & T3 | `SF=sign`, `CF=c27`, `OF=c27` |
| `SBC` | `+9` | `00100` | `00100 | rd | rs1` | `0000000 | rs2` | `SBC rd, rs1, rs2` | T2 & T3 | `SF=sign`, `CF=c27`, `OF=c27` |
| `MUL` | `+10` | `00101` | `00101 | rd | rs1` | `0000000 | rs2` | `MUL rd, rs1, rs2` | T2 & T3 | `SF=sign`, `CF=hi`, `OF=hi` |
| `MULI` | `+11` | `0011T` | `0011T | rd | rs1` | `imm9` | `MULI rd, rs1, imm9` | T2 & T3 | `SF=sign`, `CF=hi`, `OF=hi` |
| `DIV` | `+12` | `00110` | `00110 | rd | rs1` | `0000000 | rs2` | `DIV rd, rs1, rs2` | T2 & T3 | `SF=sign`, `CF=0`, `OF=div0` |
| `MOD` | `+13` | `00111` | `00111 | rd | rs1` | `0000000 | rs2` | `MOD rd, rs1, rs2` | T2 & T3 | `SF=sign`, `CF=0`, `OF=div0` |
| `NEG` | `+14` | `01TTT` | `01TTT | rd | rs1` | `000000000` | `NEG rd, rs1` | T2 & T3 | `SF=sign`, `CF=0`, `OF=0` |
| `LT` | `+15` | `01TT0` | `01TT0 | rd | rs1` | `imm9` | `LT rd, rs1, imm9` | T2 & T3 | `SF=sign`, `CF=0`, `OF=0` |
| `ST` | `+16` | `01TT1` | `01TT1 | rd | rs1` | `imm9` | `ST rd, rs1, imm9` | T2 & T3 | Unchanged |
| `LW` | `+17` | `01T0T` | `01T0T | rd | rs1` | `imm9` | `LW rd, rs1, imm9` | T2 & T3 | `SF=sign`, `CF=0`, `OF=0` |
| `SW` | `+18` | `01T00` | `01T00 | rd | rs1` | `imm9` | `SW rd, rs1, imm9` | T2 & T3 | Unchanged |
| `PUSH` | `+19` | `01T01` | `01T01 | 00 | rs1` | `000000000` | `PUSH rs1` | T2 & T3 | Unchanged |
| `POP` | `+20` | `01T1T` | `01T1T | rd | 00` | `000000000` | `POP rd` | T2 & T3 | `SF=sign`, `CF=0`, `OF=0` |
| `JMP` | `+21` | `01T10` | `01T10 | 00 | 00` | `imm9` | `JMP imm9` | T2 & T3 | Unchanged |
| `JN` | `+22` | `01T11` | `01T11 | 00 | 00` | `imm9` | `JN imm9` | T2 & T3 | Unchanged |
| `JZ` | `+23` | `010TT` | `010TT | 00 | 00` | `imm9` | `JZ imm9` | T2 & T3 | Unchanged |
| `JP` | `+24` | `010T0` | `010T0 | 00 | 00` | `imm9` | `JP imm9` | T2 & T3 | Unchanged |
| `JNZ` | `+25` | `010T1` | `010T1 | 00 | 00` | `imm9` | `JNZ imm9` | T2 & T3 | Unchanged |
| `JNP` | `+26` | `0100T` | `0100T | 00 | 00` | `imm9` | `JNP imm9` | T2 & T3 | Unchanged |
| `JNN` | `+27` | `01000` | `01000 | 00 | 00` | `imm9` | `JNN imm9` | T2 & T3 | Unchanged |
| `JR` | `+28` | `01001` | `01001 | 00 | rs1` | `000000000` | `JR rs1` | T2 & T3 | Unchanged |
| `CALL` | `+29` | `0101T` | `0101T | 00 | 00` | `imm9` | `CALL imm9` | T2 & T3 | Unchanged |
| `RET` | `+30` | `01010` | `01010 | 00 | 00` | `000000000` | `RET` | T2 & T3 | Unchanged |
| `IN` | `+31` | `01011` | `01011 | rd | 00` | `imm9` | `IN rd, imm9` | T2 / T3 (Sup) | `SF=sign`, `CF=0`, `OF=0` |
| `OUT` | `+32` | `011TT` | `011TT | rd | 00` | `imm9` | `OUT rd, imm9` | T2 / T3 (Sup) | Unchanged |
| `CMP` | `-2` | `000T1` | `000T1 | 00 | rs1` | `0000000 | rs2` | `CMP rs1, rs2` | T2 & T3 | `SF=cmp`, `CF=c27`, `OF=c27` |
| `CMPI` | `-3` | `000T0` | `000T0 | 00 | rs1` | `imm9` | `CMPI rs1, imm9` | T2 & T3 | `SF=cmp`, `CF=c27`, `OF=c27` |
| `TMIN` | `-4` | `000TT` | `000TT | rd | rs1` | `0000000 | rs2` | `TMIN rd, rs1, rs2` | T2 & T3 | `SF=sign`, `CF=0`, `OF=0` |
| `TMAX` | `-5` | `00T11` | `00T11 | rd | rs1` | `0000000 | rs2` | `TMAX rd, rs1, rs2` | T2 & T3 | `SF=sign`, `CF=0`, `OF=0` |
| `TCON` | `-6` | `00T10` | `00T10 | rd | rs1` | `0000000 | rs2` | `TCON rd, rs1, rs2` | T2 & T3 | `SF=sign`, `CF=0`, `OF=0` |
| `TANY` | `-7` | `00T1T` | `00T1T | rd | rs1` | `0000000 | rs2` | `TANY rd, rs1, rs2` | T2 & T3 | `SF=sign`, `CF=0`, `OF=0` |
| `TXOR` | `-8` | `00T01` | `00T01 | rd | rs1` | `0000000 | rs2` | `TXOR rd, rs1, rs2` | T2 & T3 | `SF=sign`, `CF=0`, `OF=0` |
| `TUNARY` | `-9` | `00T00` | `00T00 | rd | rs1` | `imm9` | `TUNARY rd, rs1, imm9` | T2 & T3 | `SF=sign`, `CF=0`, `OF=0` |
| `SHL` | `-10` | `00T0T` | `00T0T | rd | rs1` | `0000000 | rs2` | `SHL rd, rs1, rs2` | T2 & T3 | `SF=sign`, `CF=out`, `OF=hi` |
| `SHLI` | `-11` | `00TT1` | `00TT1 | rd | rs1` | `imm9` | `SHLI rd, rs1, imm9` | T2 & T3 | `SF=sign`, `CF=out`, `OF=hi` |
| `SHR` | `-12` | `00TT0` | `00TT0 | rd | rs1` | `0000000 | rs2` | `SHR rd, rs1, rs2` | T2 & T3 | `SF=sign`, `CF=out`, `OF=0` |
| `SHRI` | `-13` | `00TTT` | `00TTT | rd | rs1` | `imm9` | `SHRI rd, rs1, imm9` | T2 & T3 | `SF=sign`, `CF=out`, `OF=0` |
| `LMI` | `+33` | `011T0` | `011T0 | rd | 00` | `imm9` | `LMI rd, imm9` | T3 | `SF=sign`, `CF=0`, `OF=0` |
| `LHI` | `+34` | `011T1` | `011T1 | rd | 00` | `imm9` | `LHI rd, imm9` | T3 | `SF=sign`, `CF=0`, `OF=0` |
| `ADDM` | `+35` | `0110T` | `0110T | rd | rs1` | `imm9` | `ADDM rd, rs1, imm9` | T3 | `SF=sign`, `CF=c27`, `OF=c27` |
| `ADDH` | `+36` | `01100` | `01100 | rd | rs1` | `imm9` | `ADDH rd, rs1, imm9` | T3 | `SF=sign`, `CF=c27`, `OF=c27` |
| `LDX` | `+37` | `01101` | `01101 | rd | rs1` | `imm9` | `LDX rd, rs1, imm9` | T3 | `SF=sign`, `CF=0`, `OF=0` |
| `STX` | `+38` | `0111T` | `0111T | rd | rs1` | `imm9` | `STX rd, rs1, imm9` | T3 | Unchanged |
| `LWX` | `+39` | `01110` | `01110 | rd | rs1` | `imm9` | `LWX rd, rs1, imm9` | T3 | `SF=sign`, `CF=0`, `OF=0` |
| `SWX` | `+40` | `01111` | `01111 | rd | rs1` | `imm9` | `SWX rd, rs1, imm9` | T3 | Unchanged |
| `JMPX` | `+41` | `1TTTT` | `1TTTT | 00 | 00` | `rel9` | `JMPX target` | T3 | Unchanged |
| `JNX` | `+42` | `1TTT0` | `1TTT0 | 00 | 00` | `rel9` | `JNX target` | T3 | Unchanged |
| `JZX` | `+43` | `1TTT1` | `1TTT1 | 00 | 00` | `rel9` | `JZX target` | T3 | Unchanged |
| `JPX` | `+44` | `1TT0T` | `1TT0T | 00 | 00` | `rel9` | `JPX target` | T3 | Unchanged |
| `JNZX` | `+45` | `1TT00` | `1TT00 | 00 | 00` | `rel9` | `JNZX target` | T3 | Unchanged |
| `JNPX` | `+46` | `1TT01` | `1TT01 | 00 | 00` | `rel9` | `JNPX target` | T3 | Unchanged |
| `JNNX` | `+47` | `1TT1T` | `1TT1T | 00 | 00` | `rel9` | `JNNX target` | T3 | Unchanged |
| `CALLX` | `+48` | `1TT10` | `1TT10 | 00 | 00` | `rel9` | `CALLX target` | T3 | Unchanged |
| `JALR` | `+49` | `1TT11` | `1TT11 | rd | rs1` | `imm9` | `JALR rd, rs1, imm9` | T3 | `SF=sign`, `CF=0`, `OF=0` |
| `BCOPY` | `+50` | `1T0TT` | `1T0TT | rd | rs1` | `0000000 | rs2` | `BCOPY rd, rs1, rs2` | T3 | `SF=(cnt>0?1:0)`, `CF=0`, `OF=0` |
| `BFILL` | `+51` | `1T0T0` | `1T0T0 | rd | rs1` | `0000000 | rs2` | `BFILL rd, rs1, rs2` | T3 | `SF=(cnt>0?1:0)`, `CF=0`, `OF=0` |
| `SYSCALL` | `+52` | `1T0T1` | `1T0T1 | 00 | 00` | `imm9` | `SYSCALL imm9` | T3 | Unchanged |
| `IRET` | `+53` | `1T00T` | `1T00T | 00 | 00` | `000000000` | `IRET` | T3 (Sup) | Restored from `ESR` |
| `MFSPR` | `+54` | `1T000` | `1T000 | rd | 00` | `imm9` | `MFSPR rd, imm9` | T3 (Sup) | `SF=sign`, `CF=0`, `OF=0` |
| `MTSPR` | `+55` | `1T001` | `1T001 | 00 | rs1` | `imm9` | `MTSPR rs1, imm9` | T3 (Sup) | Unchanged |

## 7. Interpreter Throughput Benchmarks (`triton4.html`)

| Mode | Instructions Executed | `TritonJS` Time (ms) | `TritonJS` Speed (MIPS) | `TritonWASM` Time (ms) | `TritonWASM` Speed (MIPS) | WASM Speedup |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **T2 Mode** | `108,256` | `227.82` ms | `0.48` MIPS | `23.20` ms | `4.67` MIPS | `9.8x` |
| **T3 Mode** | `108,256` | `211.10` ms | `0.51` MIPS | `17.26` ms | `6.27` MIPS | `12.2x` |
