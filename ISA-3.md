# Triton 3.0 Instruction Set Architecture (`ISA-3.md`)

**ConsciousNode SoftWorks · Normative Architecture Specification (Version 3.0)**

*All numerical figures, opcode encodings, memory ranges, port definitions, and vector offsets in this specification are generated programmatically by `tests/t3-generate-docs.js` directly from `triton3.html`.*

Triton 3.0 is a full balanced-ternary computer architecture with a **27-trit ($3^{27} = 7,625,597,484,987$-tryte) address space**, supervisor/user privilege separation, base-and-limit memory protection, prioritized hardware interrupts and software traps, interruptible block memory instructions, memory-mapped **$729 \times 486$ ($729$-color) graphics**, DMA block storage ($3^{13} = 1,594,323$ trytes), StudioNet networking, and hardware backward-compatibility mode (**T2 mode**) that runs every Triton 2.x program unchanged.

## 1. Fundamental Data Types & Dual Architectural Modes

### 1.1 Hierarchy of Balanced-Ternary Units

| Unit | Width (Trits) | Cardinality ($3^n$) | Balanced Range $[-\frac{3^n-1}{2}, +\frac{3^n-1}{2}]$ | Architectural Role in Triton 3.0 |
| :--- | :--- | :--- | :--- | :--- |
| **Trit** | $1 = 3^0$ | $3$ | $[-1, +1]$ (`T`, `0`, `1`) | Atomic ternary digit; individual status flag (`SF`, `CF`, `OF`) |
| **Diad** | $2$ | $9$ | $[-4, +4]$ (`TT` .. `11`) | Register specifier (`R0`–`R8`); single color channel ($9$ levels) in T3 display |
| **Triad** | $3 = 3^1$ | $27$ | $[-13, +13]$ (`TTT` .. `111`) | T2 status register (`SR`), T2 27-color pixel, `TUNARY` truth table |
| **Hexad** | $6 = 2 \times 3$ | $729$ | $[-364, +364]$ | T3 729-color pixel ($2$ trits each of R, G, B in low 6 trits of a tryte) |
| **Tryte** | $9 = 3^2$ | $19,683$ | $[-9,841, +9,841]$ | Addressable memory/disk cell, T2 `PC`/`SP`, instruction immediate `imm9` |
| **Parcel** | $18 = 2 \times 9$ | $387,420,489$ | $[-193,710,244, +193,710,244]$ | Fixed-width 2-tryte instruction parcel (`Tryte 0`, `Tryte 1`) |
| **Word** | $27 = 3^3$ | $7,625,597,484,987$ | $[-3,812,798,742,493, +3,812,798,742,493]$ | General-purpose register width (`R0`–`R8`), T3 `PC`, `SP`, and effective address |

### 1.2 Architectural Modes (`SPR_MODE`, SPR 0)

1. **T3 Mode (`SPR_MODE = 1`, Default on Reset)**:
   - `PC`, `SP`, and all effective memory addresses are full **27-trit words** ($W_0 + 19,683 W_1 + 387,420,489 W_2$).
   - Physical RAM defaults to **$3^{14} = 4,782,969$ trytes** and is configurable up to **$3^{15} = 14,348,907$ trytes**.
   - Memory accesses never wrap silently modulo $3^9$: any access outside physical RAM (and outside the MMIO framebuffer at `15,000,000 .. 15,354,293`) raises a **Bad Address fault (Vector 4)**.
   - `CALL` and `CALLX` push the full 3-tryte (27-trit) return `PC` onto the stack (`SP <- SP - 3`), and `RET` pops all 3 trytes (`SP <- SP + 3`).
2. **T2 Compatibility Mode (`SPR_MODE = 0`)**:
   - Behaves identically to Triton 2.1 (`ISA.md`). `PC`, `SP`, and effective addresses are 9-trit trytes that wrap modulo $3^9 = 19,683$ via $\text{phys}(A) = ((A \bmod 19683) + 19683) \bmod 19683$.
   - `CALL` pushes a 1-tryte return `PC` (`SP <- (SP - 1) mod_bal 3^9`), and `RET` pops 1 tryte.
   - Switching between T2 and T3 modes is performed by executing the privileged instruction `MTSPR rs1, #0` (`SPR_MODE`) in Supervisor mode (`PRIV = 0`).

## 2. Registers, Special-Purpose Registers (SPRs) & Memory Map

### 2.1 General-Purpose & Status Registers

- **`R0` – `R8`**: Nine 27-trit general-purpose registers, decomposed in little-endian tryte order as $R[r] = W_0 + 19,683 W_1 + 387,420,489 W_2$ with $W_0, W_1, W_2 \in [-9841, +9841]$.
- **`PC`**: 27-trit Program Counter in T3 mode (initialized to `0` on reset); 9-trit tryte in T2 mode.
- **`SP`**: 27-trit Stack Pointer in T3 mode (initialized to `200000` on reset); 9-trit tryte (`-1`) in T2 mode.
- **Flags (`SF`, `CF`, `OF`)**: Three balanced trits $\in \{-1, 0, +1\}$ representing Sign (`SF`), Ternary Carry (`CF`), and Ternary Overflow (`OF`).

### 2.2 Special-Purpose Registers (`MFSPR rd, imm9` / `MTSPR rs1, imm9`)

Reading (`MFSPR`) or writing (`MTSPR`) any SPR requires **Supervisor mode (`PRIV = 0`)**. Attempting either instruction in User mode (`PRIV = 1`) faults via **Vector 2 (`PRIV_VIOL`)**.

| SPR Index (`imm9`) | Symbolic Name | Reset Value | Architectural Semantics |
| :--- | :--- | :--- | :--- |
| `0` | `SPR_MODE` | `1` (T3) | `0` = T2 (9-trit wrap), `1` = T3 (27-trit protected) |
| `1` | `SPR_PRIV` | `0` (Supervisor) | `0` = Supervisor mode, `1` = User mode |
| `2` | `SPR_IE` | `0` | Global Interrupt Enable (`0` = masked, `1` = enabled) |
| `3` | `SPR_IMASK` | `0` | 5-bit hardware IRQ enable mask (`bit 0..4` for Vec `7..11`) |
| `4` | `SPR_IPEND` | `0` | 5-bit hardware IRQ pending bitmap (`bit 0..4` for Vec `7..11`) |
| `5` | `SPR_VBR` | `0` | 27-trit Vector Base Register (tryte address of 12-entry vector table) |
| `6` | `SPR_UBASE` | `0` | 27-trit User Base Register (inclusive lower bound in User mode) |
| `7` | `SPR_ULIMIT` | `4782969` | 27-trit User Limit Register (exclusive upper bound in User mode) |
| `8` | `SPR_PROT_EN` | `1` | User protection enable (`1` = enforce `[UBASE, ULIMIT)`, `0` = off) |
| `9` | `SPR_EPC` | `0` | 27-trit Exception Program Counter saved on trap/interrupt entry |
| `10` | `SPR_ESP` | `0` | 27-trit Exception Stack Pointer saved on trap/interrupt entry |
| `11` | `SPR_ESR` | `0` | Exception Status Register (`SF + 3*CF + 9*OF + 27*PRIV + 81*IE`) |
| `12` | `SPR_ECAUSE` | `0` | Exception Cause code (vector index `0..11`, or `imm9` on `SYSCALL`) |
| `13` | `SPR_EADDR` | `0` | 27-trit Exception Faulting Address (or opcode/port/syscall immediate) |
| `14` | `SPR_KSP` | `0` | 27-trit Kernel Stack Pointer loaded into `SP` when trapping from User mode |
| `15` | `SPR_TRAP_DIV0` | `0` | `1` = trap on `DIV`/`MOD` by zero (Vector 5); `0` = deterministic non-trapping |

### 2.3 Triton 3.0 Physical Memory & MMIO Address Map

| Address Range (Trytes) | Size (Trytes) | Region Name | Access Rules & Protection |
| :--- | :--- | :--- | :--- |
| `0 .. 4,782,968` ($3^{14}$, default) | `4,782,969` | **Default Physical RAM** | Full read/write in Supervisor mode; restricted to `[UBASE, ULIMIT)` in User mode when `PROT_EN = 1` |
| `0 .. 14,348,906` ($3^{15}$, max) | `14,348,907` | **Max Configurable Physical RAM** | Configurable via `new TritonJS({ ramSize })` / `TritonWASM.createSync({ ramSize })` |
| `15,000,000 .. 15,354,293` | `354,294` ($729 \times 486$) | **MMIO Display Framebuffer** | 1 tryte per pixel ($729$ colors: low 6 trits = 2 trits R, 2 trits G, 2 trits B; high 3 trits = 0) |
| All other addresses | — | **Unmapped Address Space** | Raises **Bad Address fault (Vector 4, `BAD_ADDR`)** with `EADDR = addr`; never wraps silently |

## 3. New Triton 3.0 Instructions (M2 & M3)

All instructions keep the fixed **2-tryte (18-trit)** encoding from Triton 2.1:
$$\text{Tryte 0} = \text{op} \cdot 81 + \text{bal\_rem}(rd, 9) \cdot 9 + \text{bal\_rem}(rs1, 9), \qquad \text{Tryte 1} = \text{imm9} \text{ or } \text{bal\_rem}(rs2, 9)$$

### 3.1 27-Trit Constant Builders & Upper Tryte Additions

1. **`LMI rd, imm9` (Opcode `+33`)**:
   - Sets the middle tryte $W_1$ of $R[rd]$ to $\text{imm9}$, preserving $W_0$ and $W_2$: $(W_0, W_1, W_2) \leftarrow (W_0, \text{imm9}, W_2)$.
   - Flags: $\text{SF} = \text{sign}(R[rd])$, $\text{CF} = 0$, $\text{OF} = 0$.
2. **`LHI rd, imm9` (Opcode `+34`)**:
   - Sets the high tryte $W_2$ of $R[rd]$ to $\text{imm9}$, preserving $W_0$ and $W_1$: $(W_0, W_1, W_2) \leftarrow (W_0, W_1, \text{imm9})$.
   - Flags: $\text{SF} = \text{sign}(R[rd])$, $\text{CF} = 0$, $\text{OF} = 0$.
   - *Building any 27-trit constant*: `LI rd, #w0; LMI rd, #w1; LHI rd, #w2` constructs any 27-trit value in 3 instructions with zero carry interaction.
3. **`ADDM rd, rs1, imm9` (Opcode `+35`)**:
   - Adds $\text{imm9} \cdot 3^9$ to $R[rs1]$ with full 27-trit carry propagation: $R[rd] \leftarrow (R[rs1] + \text{imm9} \cdot 19,683) \bmod_{\text{bal}} 3^{27}$.
   - Flags: $\text{SF} = \text{sign}(R[rd])$, $\text{CF} = c_{27}$, $\text{OF} = c_{27}$.
4. **`ADDH rd, rs1, imm9` (Opcode `+36`)**:
   - Adds $\text{imm9} \cdot 3^{18}$ to $R[rs1]$ with full 27-trit carry propagation: $R[rd] \leftarrow (R[rs1] + \text{imm9} \cdot 387,420,489) \bmod_{\text{bal}} 3^{27}$.
   - Flags: $\text{SF} = \text{sign}(R[rd])$, $\text{CF} = c_{27}$, $\text{OF} = c_{27}$.

### 3.2 Full 27-Trit Base + Offset Loads & Stores

In T3 mode, both the original load/store opcodes (`LT` `+15`, `ST` `+16`, `LW` `+17`, `SW` `+18`) and the explicit extended mnemonics (`LDX` `+37`, `STX` `+38`, `LWX` `+39`, `SWX` `+40`) compute the full 27-trit effective address:
$$\text{EA} = R[rs1] + \text{imm9}$$
- `LT` / `LDX rd, rs1, imm9`: Checks protection and physical bounds at $\text{EA}$; loads 1 tryte into $W_0$ of $R[rd]$ with $W_1 = W_2 = 0$; sets $\text{SF} = \text{sign}(R[rd])$, $\text{CF} = 0$, $\text{OF} = 0$.
- `ST` / `STX rd, rs1, imm9`: Checks protection and physical bounds at $\text{EA}$; stores $W_0$ of $R[rd]$ to $\text{Mem}[\text{EA}]$. Flags unchanged.
- `LW` / `LWX rd, rs1, imm9`: Checks protection and physical bounds at $\text{EA}, \text{EA}+1, \text{EA}+2$; loads 3 trytes $(W_0, W_1, W_2)$ into $R[rd]$; sets $\text{SF} = \text{sign}(R[rd])$, $\text{CF} = 0$, $\text{OF} = 0$.
- `SW` / `SWX rd, rs1, imm9`: Checks protection and physical bounds at $\text{EA}, \text{EA}+1, \text{EA}+2$; stores $(W_0, W_1, W_2)$ of $R[rd]$. Flags unchanged.

### 3.3 PC-Relative Branches & Calls and Register-Indirect Calls

After fetching a 2-tryte instruction at $\text{PC}_{\text{fetch}}$, $\text{PC}$ advances to $\text{PC}_{\text{next}} = \text{PC}_{\text{fetch}} + 2$.
- **`JMPX rel9` (`+41`), `JNX rel9` (`+42`), `JZX rel9` (`+43`), `JPX rel9` (`+44`), `JNZX rel9` (`+45`), `JNPX rel9` (`+46`), `JNNX rel9` (`+47`)**:
  - Evaluates the sign condition on $\text{SF}$ (unconditional, $\text{SF}=-1$, $\text{SF}=0$, $\text{SF}=+1$, $\text{SF}\ne 0$, $\text{SF}\le 0$, $\text{SF}\ge 0$). If satisfied, sets $\text{PC} \leftarrow \text{PC}_{\text{next}} + \text{imm9}$. Flags unchanged.
- **`CALLX rel9` (`+48`)**:
  - Pushes the 3-tryte return address $\text{PC}_{\text{next}}$ onto the stack ($	ext{SP} \leftarrow \text{SP} - 3$; $\text{Mem}[\text{SP}..\text{SP}+2] \leftarrow \text{PC}_{\text{next}}$) and branches to $\text{PC} \leftarrow \text{PC}_{\text{next}} + \text{imm9}$. Flags unchanged.
- **`JR rs1` (`+28`)**:
  - In T3 mode, jumps to the full 27-trit address in $R[rs1]$: $\text{PC} \leftarrow R[rs1]$.
- **`JALR rd, rs1, imm9` (`+49`)**:
  - Computes target $\text{EA} = R[rs1] + \text{imm9}$, saves the 27-trit return address $\text{PC}_{\text{next}}$ into $R[rd]$, sets $\text{SF} = \text{sign}(R[rd]), \text{CF} = 0, \text{OF} = 0$, and jumps to $\text{PC} \leftarrow \text{EA}$.

### 3.4 Interruptible & Restartable Block Operations (`BCOPY`, `BFILL`)

1. **`BCOPY rd, rs1, rs2` (Opcode `+50`)**:
   - Operands: $R[rd]$ = destination tryte address, $R[rs1]$ = source tryte address, $R[rs2]$ = remaining tryte count.
   - If $R[rs2] \le 0$: sets $R[rs2] \leftarrow 0$, $\text{SF} = 0, \text{CF} = 0, \text{OF} = 0$, and completes ($	ext{PC} = \text{PC}_{\text{next}}$).
   - If $R[rs2] > 0$: copies 1 tryte from $\text{Mem}[R[rs1]]$ to $\text{Mem}[R[rd]]$ (checking protection and physical bounds on both; on fault, architectural registers hold the exact uncopied remainder and `EPC` points to the `BCOPY` instruction). Increments $R[rd] \leftarrow R[rd] + 1$, increments $R[rs1] \leftarrow R[rs1] + 1$, and decrements $R[rs2] \leftarrow R[rs2] - 1$.
   - If the new $R[rs2] > 0$, rewinds $\text{PC} \leftarrow \text{PC}_{\text{fetch}}$ and sets $\text{SF} = +1, \text{CF} = 0, \text{OF} = 0$ so pending hardware interrupts are serviced between trytes and `IRET` resumes the copy seamlessly. When $R[rs2]$ reaches $0$, sets $\text{SF} = 0, \text{CF} = 0, \text{OF} = 0$ and advances to $\text{PC}_{\text{next}}$.
2. **`BFILL rd, rs1, rs2` (Opcode `+51`)**:
   - Operands: $R[rd]$ = destination tryte address, $R[rs1]_0$ = fill tryte value, $R[rs2]$ = remaining tryte count.
   - Same interruptible, restartable single-tryte step semantics as `BCOPY`: writes $R[rs1]_0$ to $\text{Mem}[R[rd]]$, advances $R[rd] \leftarrow R[rd] + 1$, decrements $R[rs2] \leftarrow R[rs2] - 1$, rewinds $\text{PC} \leftarrow \text{PC}_{\text{fetch}}$ with $\text{SF} = +1$ while $R[rs2] > 0$, and finishes with $\text{SF} = 0$ when $R[rs2] = 0$.

## 4. Interrupts, Exceptions, Privilege & Protection (M3)

### 4.1 Vector Table Layout (Base at `VBR = SPR[5]`)

Each vector table entry occupies **1 word (3 consecutive trytes)** at $\text{VBR} + 3 \times \text{vec}$, holding the 27-trit handler entry `PC`:

| Vector (`vec`) | Name | Table Offset | Category | Trigger Condition |
| :--- | :--- | :--- | :--- | :--- |
| `0` | `RESET` | `VBR + 0` (`3` trytes) | Supervisor | Cold/warm reset entry vector |
| `1` | `ILLEGAL_OP` | `VBR + 3` (`3` trytes) | Fault Trap | Unallocated or illegal instruction opcode (`EADDR = op`) |
| `2` | `PRIV_VIOL` | `VBR + 6` (`3` trytes) | Fault Trap | Supervisor-only instruction executed in User mode (`PRIV = 1`) |
| `3` | `PROT_VIOL` | `VBR + 9` (`3` trytes) | Fault Trap | User memory access outside `[UBASE, ULIMIT)` (`EADDR = addr`) |
| `4` | `BAD_ADDR` | `VBR + 12` (`3` trytes) | Fault Trap | Physical address outside `[0, RAM_SIZE)` and MMIO (`EADDR = addr`) |
| `5` | `DIV_ZERO` | `VBR + 15` (`3` trytes) | Fault Trap | Division or modulo by zero when `SPR[15]` (`TRAP_DIV0`) is `1` |
| `6` | `SYSCALL` | `VBR + 18` (`3` trytes) | Software Trap | `SYSCALL imm9` system call (`ECAUSE = imm9`, `EADDR = imm9`) |
| `7` | `IRQ_TIMER` | `VBR + 21` (`3` trytes) | Hardware IRQ 0 (`bit 0 = 1`) | Programmable periodic virtual-clock timer interrupt |
| `8` | `IRQ_KBD` | `VBR + 24` (`3` trytes) | Hardware IRQ 1 (`bit 1 = 2`) | Keyboard key-down / key-up event queued |
| `9` | `IRQ_MOUSE` | `VBR + 27` (`3` trytes) | Hardware IRQ 2 (`bit 2 = 4`) | Mouse relative motion / button event queued |
| `10` | `IRQ_DISK` | `VBR + 30` (`3` trytes) | Hardware IRQ 3 (`bit 3 = 8`) | Block disk multi-sector DMA read/write completion |
| `11` | `IRQ_NET` | `VBR + 33` (`3` trytes) | Hardware IRQ 4 (`bit 4 = 16`) | StudioNet network frame received in RX buffer |

### 4.2 Trap & Interrupt Entry / Exit (`SYSCALL` & `IRET`)

When a fault, `SYSCALL imm9` (`+52`), or enabled hardware interrupt ($	ext{IE} = 1$ and $(\text{IPEND} \mathbin{\&} \text{IMASK}) \ne 0$, serviced in priority order $\text{Vec } 7 \to 11$) occurs:
1. `EPC <- saved_pc` (for faults, the faulting instruction's `PC`; for `SYSCALL`, $\text{PC}_{\text{next}}$; for hardware interrupts, the next instruction's `PC`).
2. `ESP <- SP`.
3. `ESR <- SF + 3*CF + 9*OF + 27*PRIV + 81*IE`.
4. `ECAUSE <- cause` (vector index `0..11`, or `imm9` for `SYSCALL`) and `EADDR <- fault_addr`.
5. If trapping from User mode ($	ext{PRIV} = 1$) and $\text{KSP} \ne 0$, switches stack to kernel stack: `SP <- KSP`.
6. Enters Supervisor mode with interrupts disabled: `PRIV <- 0`, `IE <- 0`.
7. Loads the 27-trit handler address from $\text{Mem}[\text{VBR} + 3 \cdot \text{vec} .. \text{VBR} + 3 \cdot \text{vec} + 2]$ into `PC`.

Executing **`IRET` (Opcode `+53`, Supervisor-only)** restores:
$$\text{PC} \leftarrow \text{EPC}, \quad \text{SP} \leftarrow \text{ESP}, \quad (\text{SF}, \text{CF}, \text{OF}, \text{PRIV}, \text{IE}) \leftarrow \text{unpack}(\text{ESR})$$

## 5. Architected I/O Ports & Devices (M4)

In T3 mode, `IN rd, port` (`+31`) and `OUT rd, port` (`+32`) are **Supervisor-only** (faulting via Vector 2 in User mode).

| Port (`imm9`) | Symbolic Name | `IN rd, port` (Read Semantics) | `OUT rd, port` (Write Semantics) |
| :--- | :--- | :--- | :--- |
| `0` | `CONSOLE_CHAR` | Dequeues next ASCII character from console input queue (`0` if empty) | Appends character $R[rd]_0 \bmod 19683$ to console transcript |
| `1` | `CONSOLE_NUM` | Returns queued console character count | Appends decimal representation of 27-trit $R[rd]$ to console |
| `2` | `DISPLAY_X` | Reads active display X coordinate ($0..728$ in T3, $0..242$ in T2) | Sets `DisplayX` $\leftarrow R[rd]_0 \bmod W$ |
| `3` | `DISPLAY_Y` | Reads active display Y coordinate ($0..485$ in T3, $0..242$ in T2) | Sets `DisplayY` $\leftarrow R[rd]_0 \bmod H$ |
| `4` | `DISPLAY_PIXEL` | Reads pixel color at `(DisplayX, DisplayY)` | Writes pixel color ($[-364..+364]$ in T3, $[-13..+13]$ in T2) |
| `5` | `DISPLAY_CMD` | Reads last display fill color | Fills entire framebuffer with color $R[rd]_0$ |
| `6` | `TIMER_TICKS` | Reads virtual clock step counter (27-trit in T3, 9-trit in T2) | Sets `timerTicks` $\leftarrow R[rd]_0$ |
| `7` | `DISK_ADDR` | Reads current stream disk tryte address | Sets stream `DiskAddr` $\leftarrow R[rd] \bmod \text{DiskSize}$ |
| `8` | `DISK_DATA` | Reads `Disk[DiskAddr]` and increments `DiskAddr` | Writes $R[rd]_0$ to `Disk[DiskAddr]` and increments `DiskAddr` |
| `9` | `TIMER_PERIOD` | Reads programmable periodic timer period (in virtual steps) | Sets `TimerPeriod` $\leftarrow R[rd]$, resets `TimerCount <- 0` |
| `10` | `KBD_COUNT` | Returns queued hardware keyboard events | Ignored |
| `11` | `KBD_DATA` | Dequeues next keyboard event keycode into $R[rd]$ and latches type | Ignored |
| `12` | `KBD_TYPE` | Returns latched event type (`0` = key-down, `1` = key-up) | Ignored |
| `13` | `MOUSE_COUNT` | Returns queued hardware mouse events | Ignored |
| `14` | `MOUSE_DX` | Dequeues next mouse event $\Delta X$ into $R[rd]$ and latches $\Delta Y$, buttons | Ignored |
| `15` | `MOUSE_DY` | Returns latched mouse $\Delta Y$ | Ignored |
| `16` | `MOUSE_BTN` | Returns latched 3-button mask (`bit 0`: Left, `1`: Right, `2`: Middle) | Ignored |
| `17` | `DISK_LBA` | Reads DMA starting sector number (`0 .. 2186`) | Sets `DiskLba` $\leftarrow R[rd]$ |
| `18` | `DISK_DMA_ADDR` | Reads DMA physical RAM tryte address | Sets `DiskDmaAddr` $\leftarrow R[rd]$ |
| `19` | `DISK_COUNT` | Reads DMA sector count $N$ ($729 N$ trytes) | Sets `DiskCount` $\leftarrow R[rd]$ |
| `20` | `DISK_CMD_STAT` | Reads DMA status (`0`=idle, `1`=OK, `-1`=error) | Executes DMA: `0`=reset, `1`=DMA Read, `2`=DMA Write (raises `IRQ_DISK`) |
| `21` | `DISK_ERR` | Reads DMA error code (`0`=none, `1`=bad sector, `2`=bad DMA addr, `3`=bad cmd) | Ignored |
| `22` | `NET_STATUS` | Returns StudioNet magic `0xA4 | rx_ready` (`164` or `165`) | Ignored |
| `23` | `NET_NODE_ID` | Returns StudioNet station node ID (`0x0003` default) | Ignored |
| `24` | `NET_TX_LEN` | Reads current TX FIFO byte count | Transmits `R[rd]`-byte frame (`12..512` B) onto StudioNet bus |
| `25` | `NET_RX_LEN` | Returns byte length of current RX frame (`0` if none) | Writing `1` pops current RX frame and advances RX queue |
| `26` | `NET_TX_FIFO` | Returns `0` | Appends byte $R[rd]_0 \bmod 256$ to outbound TX frame buffer |
| `27` | `NET_RX_FIFO` | Reads next byte from current inbound RX frame | Ignored |

## 6. Complete Triton 3.0 Instruction Encoding Table (69 Opcodes)

Out of $3^5 = 243$ possible 5-trit opcodes ($[-121, +121]$), Triton 3.0 allocates **69 opcodes** (46 base T2/T3 opcodes + 23 new T3 opcodes), leaving **174 free opcodes (71.6%)**.

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

## 7. TritOS 3.0 Disk File Table & Streaming Assembler Format

1. **Disk Layout ($3^{13} = 1,594,323$ trytes = $2,187$ sectors of $729$ trytes)**:
   - **Sector 0 (`Disk[0..728]`)**: Flat named-file directory (`Disk[0..127]`, up to 16 entries of 8 trytes: 5-tryte uppercase filename, 1-tryte type, 1-tryte start offset, 1-tryte length), free-space pointer at `Disk[128]`, and initial files (`Disk[200..728]`).
   - **Sectors 1 .. 2186 (`Disk[729..1,594,322]`)**: Contiguous sector-streamed assembly source region (up to $2,186 \times 729 = 1,593,594$ characters, removing the 2.x 19,182-character ceiling).
2. **Sector-Streaming In-OS Assembler (`a_ent` / `src_peek`)**:
   - Streams source text from Disk Sectors $1..2186$ one 729-tryte sector at a time into the 729-tryte kernel buffer `SEC_BUF` (`Mem[5400..6128]`) via DMA Read commands on `Ports 17..20`.
   - Stores full uppercase symbol names in `SPOOL` (`Mem[25000..98414]`) indexed by a **1,987-bucket open-addressed hash table** `STAB` (`Mem[6500..24382]`, 9 trytes = 3 words per bucket: `[hash_word, val_word, name_ptr_word]`).
   - Emits assembled machine code to `OBUF` (`Mem[98415..]`).
