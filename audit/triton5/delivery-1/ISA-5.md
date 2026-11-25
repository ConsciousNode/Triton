# Triton 5.0 Instruction Set & Hardware Architecture (`ISA-5.md`)

**ConsciousNode SoftWorks · Normative Architecture Specification (Version 5.0, Stage 1)**

*All numerical figures, opcode encodings, SPR indices, PTE bitmasks, page-size geometry, vector offsets, and throughput benchmarks in this specification are generated programmatically by `tests/t5-generate-docs.js` directly from `triton5.html`.*

Triton 5.0 extends Triton 4.0 (`369,358` bytes) into a virtual-memory, C-ready, NetBSD-capable balanced-ternary architecture (`triton5.html`, `442,008` bytes, `12,385` lines; MicroWAT WASM module `17,229` bytes from `146,689` bytes of WAT source). With `SPR_PG_EN = 0` (reset default), Triton 5.0 is **bit-identical step-for-step** to Triton 4.0 on every existing T2, T3, T4, and TritOS Desktop 2.0.1 workload.

## 1. Summary of Triton 5.0 Architectural Extensions

### 1.1 Addition A — Hardware-Walked Paging, 64-Entry TLB & 3 Page Sizes
- **Configured Page Size (`options.pageSize`, read via `SPR_PAGE_SIZE` = `SPR 20`):** set at machine creation to `729` ($3^6$), `2,187` ($3^7$, default), or `4,096` ($2^{12}$) trytes.
- **Honest Per-Mode Address Splitting:**
  - `729` and `2,187` split virtual addresses directly by **base-3 trit position** (zero hardware divisions; wire routing on a ternary address bus).
  - `4,096` splits virtual addresses by **real integer division** (quotient and remainder by `4,096` and `1,024`).
- **2-Level Page Tables in Physical RAM:** Rooted at physical tryte address `SPR_PTBR` (`SPR 17`). Every PDE (L0) and PTE (L1) is **1 word (3 trytes)** encoded as `ppn * 512 + flags`.
- **TLB:** **64-entry** fully associative FIFO TLB tagged with `ASID` (`SPR 18`) and `G` (global) bit. Managed via `TLBFLUSH` (`+73`) / `SPR_TLB_FLUSH` (`21`) and `TLBINV rs1` (`+74`) / `SPR_TLB_INV` (`22`).
- **Precise, Restartable Page Faults (`Vector 13`, `PAGE_FAULT`):** Sets `SPR_EADDR = faulting VA`, `SPR_ECAUSE = 13`, `SPR_PF_CAUSE` (access type, privilege mode, not-present vs. permission, L0 vs. L1), and `SPR_EPC = fetchPc`. Multi-tryte operations (`LW`/`SW`, `PUSH`/`POP`, `CALL`/`RET`, `CAS`) validate all trytes before committing writes; `BCOPY` and `BFILL` preserve exact per-tryte progress in registers and resume cleanly on `IRET`.

| Page Size (Trytes) | Address Split Mechanism | Entries / Table | Table Size | Addressable VA Space | Modeled Split Cost |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `729` ($3^6$) | Trit-position slice (`trits[0..5]`, `[6..10]`, `[11..15]`) | `243` | `729` trytes | `43,046,721` trytes | `0` div steps |
| `2,187` ($3^7$) | Trit-position slice (`trits[0..6]`, `[7..12]`, `[13..18]`) | `729` | `2,187` trytes | `1,162,261,467` trytes | `0` div steps |
| `4,096` ($2^{12}$) | Real division (`va / 4096`, `va % 4096`, `vpn / 1024`, `vpn % 1024`) | `1,024` | `3,072` trytes | `4,294,967,296` trytes | `22` div steps |

#### PTE / PDE Word Layout (`word = ppn * 512 + flags`)

| Flag Bit | Mask | Name | Architectural Semantics |
| :--- | :--- | :--- | :--- |
| `bit 0` | `1` | `V` | Valid — entry is present; `0` raises `PAGE_FAULT` (`PERM=0`) |
| `bit 1` | `2` | `R` | Readable — permits load/read accesses |
| `bit 2` | `4` | `W` | Writable — permits store/write accesses |
| `bit 3` | `8` | `X` | Executable — permits instruction fetch accesses |
| `bit 4` | `16` | `U` | User — permits User-mode (`PRIV=1`) access; `0` restricts to Supervisor (`PRIV=0`) |
| `bit 5` | `32` | `A` | Accessed — set to `1` in RAM and TLB by hardware on any permitted translation |
| `bit 6` | `64` | `D` | Dirty — set to `1` in RAM and TLB by hardware on any permitted write translation |
| `bit 7` | `128` | `G` | Global — TLB entry matches any `ASID` (invalidated by `TLBFLUSH` or `TLBINV`) |

### 1.2 Addition B — Binary-Semantics Instructions for C (`+56 .. +70`)
Triton words are 27 balanced trits ($[-3,812,798,742,493, +3,812,798,742,493]$), which hold every 32-bit unsigned (`[0, 2^32)`) and signed (`[-2^31, 2^31)`) integer exactly. Triton 5 adds 15 binary-semantics instructions that interpret inputs via canonical 32-bit two's-complement reduction $u_{32}(x) = x mod 2^{32}$ without altering any existing ternary instruction:
- **Wrapping:** `WRAPU rd, rs1, imm9` ($[0, 2^n)$ for $n le 32$), `WRAPS rd, rs1, imm9` ($[-2^{n-1}, 2^{n-1})$ for $n le 32$).
- **Bitwise:** `BAND`, `BOR`, `BXOR`, `BNOT` (canonical unsigned 32-bit results in $[0, 2^{32})$).
- **Binary Shifts:** `BSHL`, `BSHR` (unsigned 32-bit; shift count $k ge 32 Rightarrow 0$), `BSAR` (signed 32-bit in $[-2^{31}, 2^{31})$; $k ge 32 Rightarrow -1$ or $0$).
- **64-Bit Register-Pair Primitives:** `BADD`, `BADC` (carry-out in `CF`), `BSUB`, `BSBC` (borrow-out in `CF`), `BMULLO`, `BMULHI` (full $32 	imes 32 	o 64$-bit unsigned product).

#### Lowering `uint64_t` Operations to Register Pairs `(lo, hi)`
A C compiler represents a 64-bit integer `uint64_t` in a pair of 27-trit registers `(a_lo, a_hi)` with each limb normalized to $[0, 2^{32})$:
- **`a + b` (2 instructions):** `BADD r_lo, a_lo, b_lo` (sets `CF` = carry out of bit 31); `BADC r_hi, a_hi, b_hi`.
- **`a - b` (2 instructions):** `BSUB r_lo, a_lo, b_lo` (sets `CF` = borrow out); `BSBC r_hi, a_hi, b_hi`.
- **`a * b` (6 instructions):** `BMULLO r_lo, a_lo, b_lo`; `BMULHI t0, a_lo, b_lo`; `BMULLO t1, a_lo, b_hi`; `BMULLO t2, a_hi, b_lo`; `BADD t0, t0, t1`; `BADD r_hi, t0, t2`.
- **`a << s` ($0 le s < 64$):** for $s < 32$: `BSHL r_lo, a_lo, s`, `BSHL t0, a_hi, s`, `BSHR t1, a_lo, (32-s)` (which yields `0` cleanly when $s = 0$), `BOR r_hi, t0, t1`; for $32 le s < 64$: `BSHL r_hi, a_lo, (s-32)`, `LI r_lo, #0`.
- **`a >> s` (logical, $0 le s < 64$):** symmetric using `BSHR` / `BSHL` / `BOR`; arithmetic `int64_t >> s` uses `BSAR` on the high limb.

### 1.3 Addition C — Kernel & NetBSD Machine-Dependent Hardware (`+71 .. +75`, `SPR 23..24`)
- **`CAS rd, rs1, rs2` (`+71`):** Atomic 27-trit word compare-and-swap at address `rs1`. Compares memory word against `rd`; if equal, stores `rs2` and sets `SF=1, CF=1`; else leaves memory unchanged and sets `SF=0, CF=0`. Always returns the old memory word in `rd`. Non-interruptible within a step; checks read and write permissions before committing.
- **`WFI` (`+72`, Supervisor-only):** Sleeps until `(IPEND & IMASK) != 0`, while timers continue advancing. `HALT` (`-1`) retains its exact meaning (halt until reset).
- **`TLBFLUSH` (`+73`) & `TLBINV rs1` (`+74`, Supervisor-only):** Required by NetBSD `pmap_update()` / `pmap_remove()` / `pmap_protect()` for full and single-VA TLB invalidation.
- **`SPR_TLS` (`SPR 23`) & `RDTLS rd` (`+75`, User/Supervisor):** Required by NetBSD `_lwp_getprivate()` / `libc` TLS (`errno`, `libpthread`) so userland reads its LWP thread pointer without trapping into supervisor mode.
- **`SPR_SCRATCH` (`SPR 24`, Supervisor-only):** Required by NetBSD `locore` trap/interrupt entry to save one user GPR before constructing a trapframe on `KSP` without clobbering any of `R0..R8`.

## 2. Special-Purpose Registers (`SPR 0 .. 27`)

| SPR Index (`imm9`) | Symbolic Name | Reset Value | Architectural Semantics |
| :--- | :--- | :--- | :--- |
| `0` | `SPR_MODE` | `1` | `0` = T2 (9-trit wrap), `1` = T3/T5 (27-trit protected) |
| `1` | `SPR_PRIV` | `0` | `0` = Supervisor mode, `1` = User mode |
| `2` | `SPR_IE` | `0` | Global Interrupt Enable (`0` = masked, `1` = enabled) |
| `3` | `SPR_IMASK` | `0` | 6-bit hardware IRQ enable mask (`bit 0..5` for Vec `7..12`) |
| `4` | `SPR_IPEND` | `0` | 6-bit hardware IRQ pending bitmap (`bit 0..5` for Vec `7..12`) |
| `5` | `SPR_VBR` | `0` | 27-trit Vector Base Register (physical tryte address of 14-entry vector table) |
| `6` | `SPR_UBASE` | `0` | 27-trit User Base Register (inclusive lower bound in User mode when `PG_EN = 0`) |
| `7` | `SPR_ULIMIT` | `4782969` | 27-trit User Limit Register (exclusive upper bound in User mode when `PG_EN = 0`) |
| `8` | `SPR_PROT_EN` | `1` | User protection enable when `PG_EN = 0` (`1` = enforce `[UBASE, ULIMIT)`, `0` = off) |
| `9` | `SPR_EPC` | `0` | 27-trit Exception Program Counter saved on trap/fault/interrupt entry |
| `10` | `SPR_ESP` | `0` | 27-trit Exception Stack Pointer saved on trap/fault/interrupt entry |
| `11` | `SPR_ESR` | `0` | Exception Status Register (`SF + 3*CF + 9*OF + 27*PRIV + 81*IE`) |
| `12` | `SPR_ECAUSE` | `0` | Exception Cause code (vector index `0..13`, or `imm9` on `SYSCALL`) |
| `13` | `SPR_EADDR` | `0` | 27-trit Exception Faulting Address (VA on `PAGE_FAULT`, PA on `BAD_ADDR`) |
| `14` | `SPR_KSP` | `0` | 27-trit Kernel Stack Pointer loaded into `SP` when trapping from User mode |
| `15` | `SPR_TRAP_DIV0` | `0` | `1` = trap on `DIV`/`MOD` by zero (Vector 5); `0` = deterministic non-trapping |
| `16` | `SPR_PG_EN` | `0` | MMU paging enable (`0` = off / Triton 4 bit-identical, `1` = 2-level paging active) |
| `17` | `SPR_PTBR` | `0` | 27-trit physical tryte address of L0 page table root (write flushes TLB on change) |
| `18` | `SPR_ASID` | `0` | Address Space Identifier (`0..255`) for non-global TLB tag matching |
| `19` | `SPR_PF_CAUSE` | `0` | Page fault cause bitmap: `bits 0..1` access (`0`=R,`1`=W,`2`=X), `bit 2` User, `bit 3` Perm, `bit 4` L1 |
| `20` | `SPR_PAGE_SIZE` | `2187` | Read-only configured page size set at machine creation (`729`, `2187`, or `4096` trytes) |
| `21` | `SPR_TLB_FLUSH` | `0` | Write-only: writing any value flushes all TLB entries (reads `0`) |
| `22` | `SPR_TLB_INV` | `0` | Write-only: writing a VA invalidates matching TLB entry for current ASID (reads `0`) |
| `23` | `SPR_TLS` | `0` | 27-trit Thread-Local Storage pointer (Supervisor write via `MTSPR`, User/Sup read via `RDTLS`) |
| `24` | `SPR_SCRATCH` | `0` | 27-trit Supervisor scratch register for NetBSD `locore` trapframe entry without clobbering GPRs |
| `25` | `SPR_MMU_WALKS` | `0` | Hardware counter: number of 2-level page table walks performed |
| `26` | `SPR_MMU_HITS` | `0` | Hardware counter: number of TLB hits |
| `27` | `SPR_MMU_SPLITS` | `0` | Hardware counter: number of virtual address splits performed |

## 3. Interrupts & Exceptions (Vectors `0 .. 13`)

Each vector table entry occupies **1 word (3 consecutive trytes)** at physical address $\text{VBR} + 3 \times \text{vec}$:

| Vector (`vec`) | Name | Table Offset | Category | Trigger Condition |
| :--- | :--- | :--- | :--- | :--- |
| `0` | `RESET` | `VBR + 0` (`3` trytes) | Supervisor | Cold/warm reset entry vector |
| `1` | `ILLEGAL_OP` | `VBR + 3` (`3` trytes) | Fault Trap | Unallocated or illegal instruction opcode (`EADDR = op`) |
| `2` | `PRIV_VIOL` | `VBR + 6` (`3` trytes) | Fault Trap | Supervisor-only instruction executed in User mode (`PRIV = 1`) |
| `3` | `PROT_VIOL` | `VBR + 9` (`3` trytes) | Fault Trap | User memory access outside `[UBASE, ULIMIT)` when paging is off (`EADDR = addr`) |
| `4` | `BAD_ADDR` | `VBR + 12` (`3` trytes) | Fault Trap | Physical address outside `[0, RAM_SIZE)` and MMIO (`EADDR = addr`) |
| `5` | `DIV_ZERO` | `VBR + 15` (`3` trytes) | Fault Trap | Division or modulo by zero when `SPR[15]` (`TRAP_DIV0`) is `1` |
| `6` | `SYSCALL` | `VBR + 18` (`3` trytes) | Software Trap | `SYSCALL imm9` system call (`ECAUSE = imm9`, `EADDR = imm9`) |
| `7` | `IRQ_TIMER` | `VBR + 21` (`3` trytes) | Hardware IRQ 0 (`bit 0 = 1`) | Programmable periodic timer interrupt (Mode 0 = steps, Mode 1 = 200 kHz real time) |
| `8` | `IRQ_KBD` | `VBR + 24` (`3` trytes) | Hardware IRQ 1 (`bit 1 = 2`) | Keyboard key-down / key-up event queued |
| `9` | `IRQ_MOUSE` | `VBR + 27` (`3` trytes) | Hardware IRQ 2 (`bit 2 = 4`) | Mouse relative motion / button event queued |
| `10` | `IRQ_DISK` | `VBR + 30` (`3` trytes) | Hardware IRQ 3 (`bit 3 = 8`) | Block disk multi-sector DMA read/write completion on selected unit |
| `11` | `IRQ_NET` | `VBR + 33` (`3` trytes) | Hardware IRQ 4 (`bit 4 = 16`) | StudioNet network frame received in RX buffer |
| `12` | `IRQ_MEDIA` | `VBR + 36` (`3` trytes) | Hardware IRQ 5 (`bit 5 = 32`) | Removable storage unit (`0..26`) inserted or ejected |
| `13` | `PAGE_FAULT` | `VBR + 39` (`3` trytes) | Fault Trap (Precise) | MMU page fault when `SPR_PG_EN = 1` (`EADDR = faulting VA`, `PF_CAUSE` = access/mode/reason/level) |

## 4. Complete Instruction Encoding Table (89 Opcodes)

Out of $3^5 = 243$ possible 5-trit opcodes ($[-121, +121]$), Triton 5.0 allocates **89 opcodes** (46 base T2/T3 + 23 T3 + 20 T5), leaving **154 free opcodes (63.4%)**.

| Mnemonic | Op Dec | Op Trits ($t_8..t_4$) | Tryte 0 Layout | Tryte 1 Layout | Assembly Syntax | Mode | Flag Updates (`SF`, `CF`, `OF`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `HALT` | `-1` | `0000T` | `0000T | 00 | 00` | `000000000` | `HALT` | T2/T3 (Sup) | Unchanged |
| `NOP` | `+0` | `00000` | `00000 | 00 | 00` | `000000000` | `NOP` | T2/T3 | Unchanged |
| `LI` | `+1` | `00001` | `00001 | rd | 00` | `imm9` | `LI rd, imm9` | T2/T3 | `SF=sign`, `CF=0`, `OF=0` |
| `LUI` | `+2` | `0001T` | `0001T | rd | 00` | `imm9` | `LUI rd, imm9` | T2/T3 | `SF=sign`, `CF=0`, `OF=0` |
| `MOV` | `+3` | `00010` | `00010 | rd | rs1` | `000000000` | `MOV rd, rs1` | T2/T3 | `SF=sign`, `CF=0`, `OF=0` |
| `ADD` | `+4` | `00011` | `00011 | rd | rs1` | `0000000 | rs2` | `ADD rd, rs1, rs2` | T2/T3 | `SF=sign`, `CF=c27`, `OF=c27` |
| `ADDI` | `+5` | `001TT` | `001TT | rd | rs1` | `imm9` | `ADDI rd, rs1, imm9` | T2/T3 | `SF=sign`, `CF=c27`, `OF=c27` |
| `ADC` | `+6` | `001T0` | `001T0 | rd | rs1` | `0000000 | rs2` | `ADC rd, rs1, rs2` | T2/T3 | `SF=sign`, `CF=c27`, `OF=c27` |
| `SUB` | `+7` | `001T1` | `001T1 | rd | rs1` | `0000000 | rs2` | `SUB rd, rs1, rs2` | T2/T3 | `SF=sign`, `CF=c27`, `OF=c27` |
| `SUBI` | `+8` | `0010T` | `0010T | rd | rs1` | `imm9` | `SUBI rd, rs1, imm9` | T2/T3 | `SF=sign`, `CF=c27`, `OF=c27` |
| `SBC` | `+9` | `00100` | `00100 | rd | rs1` | `0000000 | rs2` | `SBC rd, rs1, rs2` | T2/T3 | `SF=sign`, `CF=c27`, `OF=c27` |
| `MUL` | `+10` | `00101` | `00101 | rd | rs1` | `0000000 | rs2` | `MUL rd, rs1, rs2` | T2/T3 | `SF=sign`, `CF=hi`, `OF=hi` |
| `MULI` | `+11` | `0011T` | `0011T | rd | rs1` | `imm9` | `MULI rd, rs1, imm9` | T2/T3 | `SF=sign`, `CF=hi`, `OF=hi` |
| `DIV` | `+12` | `00110` | `00110 | rd | rs1` | `0000000 | rs2` | `DIV rd, rs1, rs2` | T2/T3 | `SF=sign`, `CF=0`, `OF=div0` |
| `MOD` | `+13` | `00111` | `00111 | rd | rs1` | `0000000 | rs2` | `MOD rd, rs1, rs2` | T2/T3 | `SF=sign`, `CF=0`, `OF=div0` |
| `NEG` | `+14` | `01TTT` | `01TTT | rd | rs1` | `000000000` | `NEG rd, rs1` | T2/T3 | `SF=sign`, `CF=0`, `OF=0` |
| `LT` | `+15` | `01TT0` | `01TT0 | rd | rs1` | `imm9` | `LT rd, rs1, imm9` | T2/T3 | `SF=sign`, `CF=0`, `OF=0` |
| `ST` | `+16` | `01TT1` | `01TT1 | rd | rs1` | `imm9` | `ST rd, rs1, imm9` | T2/T3 | Unchanged |
| `LW` | `+17` | `01T0T` | `01T0T | rd | rs1` | `imm9` | `LW rd, rs1, imm9` | T2/T3 | `SF=sign`, `CF=0`, `OF=0` |
| `SW` | `+18` | `01T00` | `01T00 | rd | rs1` | `imm9` | `SW rd, rs1, imm9` | T2/T3 | Unchanged |
| `PUSH` | `+19` | `01T01` | `01T01 | 00 | rs1` | `000000000` | `PUSH rs1` | T2/T3 | Unchanged |
| `POP` | `+20` | `01T1T` | `01T1T | rd | 00` | `000000000` | `POP rd` | T2/T3 | `SF=sign`, `CF=0`, `OF=0` |
| `JMP` | `+21` | `01T10` | `01T10 | 00 | 00` | `imm9` | `JMP imm9` | T2/T3 | Unchanged |
| `JN` | `+22` | `01T11` | `01T11 | 00 | 00` | `imm9` | `JN imm9` | T2/T3 | Unchanged |
| `JZ` | `+23` | `010TT` | `010TT | 00 | 00` | `imm9` | `JZ imm9` | T2/T3 | Unchanged |
| `JP` | `+24` | `010T0` | `010T0 | 00 | 00` | `imm9` | `JP imm9` | T2/T3 | Unchanged |
| `JNZ` | `+25` | `010T1` | `010T1 | 00 | 00` | `imm9` | `JNZ imm9` | T2/T3 | Unchanged |
| `JNP` | `+26` | `0100T` | `0100T | 00 | 00` | `imm9` | `JNP imm9` | T2/T3 | Unchanged |
| `JNN` | `+27` | `01000` | `01000 | 00 | 00` | `imm9` | `JNN imm9` | T2/T3 | Unchanged |
| `JR` | `+28` | `01001` | `01001 | 00 | rs1` | `000000000` | `JR rs1` | T2/T3 | Unchanged |
| `CALL` | `+29` | `0101T` | `0101T | 00 | 00` | `imm9` | `CALL imm9` | T2/T3 | Unchanged |
| `RET` | `+30` | `01010` | `01010 | 00 | 00` | `000000000` | `RET` | T2/T3 | Unchanged |
| `IN` | `+31` | `01011` | `01011 | rd | 00` | `imm9` | `IN rd, imm9` | T2/T3 (Sup) | `SF=sign`, `CF=0`, `OF=0` |
| `OUT` | `+32` | `011TT` | `011TT | rd | 00` | `imm9` | `OUT rd, imm9` | T2/T3 (Sup) | Unchanged |
| `CMP` | `-2` | `000T1` | `000T1 | 00 | rs1` | `0000000 | rs2` | `CMP rs1, rs2` | T2/T3 | `SF=cmp`, `CF=c27`, `OF=c27` |
| `CMPI` | `-3` | `000T0` | `000T0 | 00 | rs1` | `imm9` | `CMPI rs1, imm9` | T2/T3 | `SF=cmp`, `CF=c27`, `OF=c27` |
| `TMIN` | `-4` | `000TT` | `000TT | rd | rs1` | `0000000 | rs2` | `TMIN rd, rs1, rs2` | T2/T3 | `SF=sign`, `CF=0`, `OF=0` |
| `TMAX` | `-5` | `00T11` | `00T11 | rd | rs1` | `0000000 | rs2` | `TMAX rd, rs1, rs2` | T2/T3 | `SF=sign`, `CF=0`, `OF=0` |
| `TCON` | `-6` | `00T10` | `00T10 | rd | rs1` | `0000000 | rs2` | `TCON rd, rs1, rs2` | T2/T3 | `SF=sign`, `CF=0`, `OF=0` |
| `TANY` | `-7` | `00T1T` | `00T1T | rd | rs1` | `0000000 | rs2` | `TANY rd, rs1, rs2` | T2/T3 | `SF=sign`, `CF=0`, `OF=0` |
| `TXOR` | `-8` | `00T01` | `00T01 | rd | rs1` | `0000000 | rs2` | `TXOR rd, rs1, rs2` | T2/T3 | `SF=sign`, `CF=0`, `OF=0` |
| `TUNARY` | `-9` | `00T00` | `00T00 | rd | rs1` | `imm9` | `TUNARY rd, rs1, imm9` | T2/T3 | `SF=sign`, `CF=0`, `OF=0` |
| `SHL` | `-10` | `00T0T` | `00T0T | rd | rs1` | `0000000 | rs2` | `SHL rd, rs1, rs2` | T2/T3 | `SF=sign`, `CF=out`, `OF=hi` |
| `SHLI` | `-11` | `00TT1` | `00TT1 | rd | rs1` | `imm9` | `SHLI rd, rs1, imm9` | T2/T3 | `SF=sign`, `CF=out`, `OF=hi` |
| `SHR` | `-12` | `00TT0` | `00TT0 | rd | rs1` | `0000000 | rs2` | `SHR rd, rs1, rs2` | T2/T3 | `SF=sign`, `CF=out`, `OF=0` |
| `SHRI` | `-13` | `00TTT` | `00TTT | rd | rs1` | `imm9` | `SHRI rd, rs1, imm9` | T2/T3 | `SF=sign`, `CF=out`, `OF=0` |
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
| `WRAPU` | `+56` | `1T01T` | `1T01T | rd | rs1` | `imm9` | `WRAPU rd, rs1, imm9` | T5 | `SF=sign`, `CF=0`, `OF=0` |
| `WRAPS` | `+57` | `1T010` | `1T010 | rd | rs1` | `imm9` | `WRAPS rd, rs1, imm9` | T5 | `SF=sign`, `CF=0`, `OF=0` |
| `BAND` | `+58` | `1T011` | `1T011 | rd | rs1` | `0000000 | rs2` | `BAND rd, rs1, rs2` | T5 | `SF=sign`, `CF=0`, `OF=0` |
| `BOR` | `+59` | `1T1TT` | `1T1TT | rd | rs1` | `0000000 | rs2` | `BOR rd, rs1, rs2` | T5 | `SF=sign`, `CF=0`, `OF=0` |
| `BXOR` | `+60` | `1T1T0` | `1T1T0 | rd | rs1` | `0000000 | rs2` | `BXOR rd, rs1, rs2` | T5 | `SF=sign`, `CF=0`, `OF=0` |
| `BNOT` | `+61` | `1T1T1` | `1T1T1 | rd | rs1` | `000000000` | `BNOT rd, rs1` | T5 | `SF=sign`, `CF=0`, `OF=0` |
| `BSHL` | `+62` | `1T10T` | `1T10T | rd | rs1` | `0000000 | rs2` | `BSHL rd, rs1, rs2` | T5 | `SF=sign`, `CF=0`, `OF=0` |
| `BSHR` | `+63` | `1T100` | `1T100 | rd | rs1` | `0000000 | rs2` | `BSHR rd, rs1, rs2` | T5 | `SF=sign`, `CF=0`, `OF=0` |
| `BSAR` | `+64` | `1T101` | `1T101 | rd | rs1` | `0000000 | rs2` | `BSAR rd, rs1, rs2` | T5 | `SF=sign`, `CF=0`, `OF=0` |
| `BADD` | `+65` | `1T11T` | `1T11T | rd | rs1` | `0000000 | rs2` | `BADD rd, rs1, rs2` | T5 | `SF=sign`, `CF=c32`, `OF=c32` |
| `BADC` | `+66` | `1T110` | `1T110 | rd | rs1` | `0000000 | rs2` | `BADC rd, rs1, rs2` | T5 | `SF=sign`, `CF=c32`, `OF=c32` |
| `BSUB` | `+67` | `1T111` | `1T111 | rd | rs1` | `0000000 | rs2` | `BSUB rd, rs1, rs2` | T5 | `SF=sign`, `CF=b32`, `OF=b32` |
| `BSBC` | `+68` | `10TTT` | `10TTT | rd | rs1` | `0000000 | rs2` | `BSBC rd, rs1, rs2` | T5 | `SF=sign`, `CF=b32`, `OF=b32` |
| `BMULLO` | `+69` | `10TT0` | `10TT0 | rd | rs1` | `0000000 | rs2` | `BMULLO rd, rs1, rs2` | T5 | `SF=sign`, `CF=0`, `OF=0` |
| `BMULHI` | `+70` | `10TT1` | `10TT1 | rd | rs1` | `0000000 | rs2` | `BMULHI rd, rs1, rs2` | T5 | `SF=sign`, `CF=0`, `OF=0` |
| `CAS` | `+71` | `10T0T` | `10T0T | rd | rs1` | `0000000 | rs2` | `CAS rd, rs1, rs2` | T5 | `SF=swapped`, `CF=swapped`, `OF=0` |
| `WFI` | `+72` | `10T00` | `10T00 | 00 | 00` | `000000000` | `WFI` | T5 (Sup) | Unchanged |
| `TLBFLUSH` | `+73` | `10T01` | `10T01 | 00 | 00` | `000000000` | `TLBFLUSH` | T5 (Sup) | Unchanged |
| `TLBINV` | `+74` | `10T1T` | `10T1T | 00 | rs1` | `000000000` | `TLBINV rs1` | T5 (Sup) | Unchanged |
| `RDTLS` | `+75` | `10T10` | `10T10 | rd | 00` | `000000000` | `RDTLS rd` | T5 | `SF=sign`, `CF=0`, `OF=0` |

## 5. Interpreter Throughput Benchmarks (`triton5.html`, Measured)

| Mode | Instructions Executed | `TritonJS` Time (ms) | `TritonJS` Speed (MIPS) | `TritonWASM` Time (ms) | `TritonWASM` Speed (MIPS) | WASM Speedup |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **T2 Mode** | `108,256` | `257.35` ms | `0.42` MIPS | `34.59` ms | `3.13` MIPS | `7.4x` |
| **T3 Mode** | `108,256` | `226.46` ms | `0.48` MIPS | `19.45` ms | `5.56` MIPS | `11.6x` |
