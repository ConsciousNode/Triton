# Triton 3.1 Engineering & Verification Report (`REPORT-3.md`)

**ConsciousNode SoftWorks · November 2026**

*Every numerical figure, opcode table, memory range, port assignment, vector offset, and benchmark timing in this report is generated programmatically by `tests/t3-generate-docs.js` and verified by `tests/t3-run-all.js`.*

## 1. Executive Summary & Deliverables

| Deliverable | File Size / Metric | Verification Status |
| :--- | :--- | :--- |
| **`triton3.html`** | `331,423` bytes (`10,019` lines) | Single-file HTML workstation, 7 labeled inline blocks with provenance, strict CSP, zero external dependencies |
| **`triton.html` (2.1 Reference)** | `159,493` bytes (`5,577` lines) | **Unmodified** byte-for-byte; all 2.1 suites (`tests/run.js`, `tests/symbols.js`, `audit/*.js`) pass |
| **MicroWAT WASM Engine** | `108,103` bytes WAT $\to$ `12,599` bytes WASM | Assembled at load time by MicroWAT 2.0.0; holds all 27-trit state at 64-bit (`i64`) width and runs in lockstep with `TritonJS` |
| **TritOS 3.0 Kernel & Shell** | `26,627` chars $\to$ `4,474` trytes | 8×8 custom bitmap font console on $729 \times 486$ framebuffer, shell, file store, DMA streaming assembler, user runner |
| **TritOS 2.1 Compatibility Image** | `18,608` chars $\to$ `3,057` trytes | Boots and self-hosts identically in T2 mode |
| **Headless Test Suites (`tests/t3-*.js`)** | `11 / 11` suites passing (with positive controls) | Exercised via `node tests/t3-run-all.js` plus all 3 `audit/t3-*.js` probes |

## 2. Opcode Space & Allocation Map

Out of the 5-trit opcode space ($3^5 = 243$ opcodes in $[-121, +121]$):
- **Allocated in Triton 2.1 (T2 & T3)**: **`46` opcodes** (`-13 .. -1` and `0 .. +32`).
- **Added in Triton 3.0 (T3)**: **`23` opcodes** (`+33 .. +55`).
- **Total Allocated Opcodes**: **`69` opcodes**.
- **Remaining Free Opcode Space**: **`174` opcodes (`71.6%` free)**, spanning `-121 .. -14` ($108$ opcodes) and `+56 .. +121` ($66$ opcodes).

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

## 3. Memory Map, Port Map & Interrupt Vector Table

### 3.1 Physical Memory & MMIO Map (T3 Mode)

| Tryte Address Range | Size (Trytes) | Region | Description |
| :--- | :--- | :--- | :--- |
| `0 .. 4,473` | `4,474` | **TritOS 3.0 Kernel Image** | Boot reset, console driver, trap handlers, shell, 8×8 font, streaming assembler |
| `4,900 .. 4,935` | `36` ($12 \times 3$) | **Interrupt & Trap Vector Table (`VBR`)** | 12 27-trit vector entries (`RESET` through `IRQ_NET`) |
| `5,000 .. 6,128` | `1,129` | **Kernel Buffers & `SEC_BUF`** | `LBUF` (`5000`), `SBUF` (`5100`), `TBUF` (`5200`), state words (`5300..`), 729-tryte DMA sector buffer (`5400..6128`) |
| `6,500 .. 24,382` | `17,883` ($1,987 \times 9$) | **In-OS Symbol Table (`STAB`)** | 1,987-bucket open-addressed hash table (`[hash_w, val_w, name_ptr_w]`) |
| `25,000 .. 98,414` | `73,415` | **Symbol Name String Pool (`SPOOL`)** | Null-terminated uppercase symbol strings for full-name resolution |
| `39,366 .. 44,365` | `5,000` | **Default User Protection Window** | `[UBASE = 39,366, ULIMIT = 44,366)` used by `user` and `fault` shell commands |
| `98,415 .. 196,829` | `98,415` | **Assembled Output Buffer (`OBUF`)** | Emitted machine code image buffer ($5 \times 3^9$ base) |
| `196,830 .. 200,000` | `3,170` | **Supervisor Stack (`KSP` / `SP`)** | Downward-growing 27-trit supervisor call & interrupt stack |
| `0 .. 4,782,968` | `4,782,969` ($3^{14}$) | **Default Physical RAM** | Configurable up to $3^{15} = 14,348,907$ trytes |
| `15,000,000 .. 15,354,293` | `354,294` ($729 \times 486$) | **MMIO Display Framebuffer** | 1 tryte/pixel, 729 colors ($2$ trits/channel R, G, B; top 3 trits reserved `0`) |

### 3.2 Architected I/O Port Map (`Ports 0 .. 27`)

| PortRange | Subsystem | Ports & Roles |
| :--- | :--- | :--- |
| `0 .. 1` | **Console I/O** | `0`: `CONSOLE_CHAR` (ASCII char in/out), `1`: `CONSOLE_NUM` (queue count / 27-trit integer out) |
| `2 .. 5` | **Display Port I/O** | `2`: `DISPLAY_X`, `3`: `DISPLAY_Y`, `4`: `DISPLAY_PIXEL`, `5`: `DISPLAY_CMD` (full-screen fill) |
| `6, 9` | **Virtual Clock & Timer** | `6`: `TIMER_TICKS` (virtual step clock, rate $1.0 \text{ MHz}$), `9`: `TIMER_PERIOD` (periodic IRQ reload) |
| `7 .. 8` | **Stream Disk Access** | `7`: `DISK_ADDR` (tryte offset), `8`: `DISK_DATA` (auto-incrementing tryte read/write) |
| `10 .. 12` | **Keyboard Queue** | `10`: `KBD_COUNT`, `11`: `KBD_DATA` (dequeue keycode), `12`: `KBD_TYPE` (`0`=down, `1`=up) |
| `13 .. 16` | **Mouse Queue** | `13`: `MOUSE_COUNT`, `14`: `MOUSE_DX` (dequeue), `15`: `MOUSE_DY`, `16`: `MOUSE_BTN` (3-button mask) |
| `17 .. 21` | **DMA Block Disk** | `17`: `DISK_LBA`, `18`: `DISK_DMA_ADDR`, `19`: `DISK_COUNT`, `20`: `DISK_CMD_STAT`, `21`: `DISK_ERR` |
| `22 .. 27` | **StudioNet NIC** | `22`: `NET_STATUS` (`0xA4|rx`), `23`: `NET_NODE_ID` (`3`), `24`: `NET_TX_LEN`, `25`: `NET_RX_LEN`, `26`: `NET_TX_FIFO`, `27`: `NET_RX_FIFO` |

### 3.3 Interrupt & Exception Vector Table (`VBR + 3 * vec`)

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

## 4. Measured Interpreter Speeds (JS vs. MicroWAT WASM in T2 & T3 Modes)

Measured on a `108,256`-instruction benchmark loop mixing 27-trit arithmetic (`ADD`, `SUB`, `MUL`, `ADDI`, `SUBI`), tritwise consensus (`TCON`), trit shifts (`SHLI`), memory loads/stores (`ST`, `LT`), comparisons (`CMPI`), and branches (`JP` / `JPX`):

| Mode | Interpreter | Time (`108,256` instrs) | Throughput (instr/sec) | Throughput (MIPS) | WASM Speedup |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T2 Mode** | `TritonJS` (JS Reference) | `291.75 ms` | `371,052 instr/s` | **`0.37 MIPS`** | $1.0\times$ |
| **T2 Mode** | `TritonWASM` (MicroWAT WASM) | `31.81 ms` | `3,403,573 instr/s` | **`3.40 MIPS`** | **`9.2×`** |
| **T3 Mode** | `TritonJS` (JS Reference) | `202.74 ms` | `533,975 instr/s` | **`0.53 MIPS`** | $1.0\times$ |
| **T3 Mode** | `TritonWASM` (MicroWAT WASM) | `18.03 ms` | `6,005,151 instr/s` | **`6.01 MIPS`** | **`11.2×`** |

## 5. Verification Suite Summary (`tests/t3-*.js` & `audit/t3-*.js`)

| Suite | Scope & Positive Control | Verdict |
| :--- | :--- | :--- |
| `t3-01-oracle.js` | 46,827 T3 oracle checks (`LMI`..`ADDH`, full 27-trit large addresses $2^{31}\pm 1, 2^{32}\pm 1, 2^{32}+\text{small}, 2^{32}+\text{FB}, 3^{26}, -1, -2^{31}$ in Sup/User modes for loads, stores, jumps, `BCOPY`, `BFILL` + `narrowWasmState: true` & perturbed oracle controls) | **PASS** |
| `t3-02-fuzz.js` | 10,000 random T3 programs (2,500 [25%] building addresses $\ge 2^{31}$ via `LMI`/`LHI`/`ADDM`/`ADDH`) with seeded virtual-clock interrupts (`JS === WASM` + `narrowWasmState: true` & IRQ controls) | **PASS** |
| `t3-03-t2compat.js` | 10,000 random 2.x programs vs `triton.html`, TritOS 2.1 session & self-host fixed point, plus all 5 unmodified 2.1 suites | **PASS** |
| `t3-04-protection.js` | User bounds fault (`Vec 3`), all 6 supervisor instructions fault (`Vec 2`), full 27-trit SPR `MTSPR`/`MFSPR` round-trip ($\ge 2^{31}$), OS survives + `protectionEnabled: false` control | **PASS** |
| `t3-05-interrupts.js` | Programmable timer rate, priority order (`7->8->9`), nested ISR, schedule determinism, and `2,149,483,659`-step ($> 2^{31} + 10^6$) tight loop counter & Port 6 check (+ `narrowWasmState: true` control) | **PASS** |
| `t3-06-disk.js` | Multi-sector DMA read/write, `IRQ_DISK` interrupt, bad sector/addr/cmd errors, $\ge 2^{32}$ LBA/DMA/count non-aliasing checks, and 3,188,646-byte image round-trip (+ mutation control) | **PASS** |
| `t3-07-selfhost.js` | TritOS 3 fixed point (`4474` trytes, `26,627` chars), self-built boot, and `105,038`-char streaming assembly (+ 19,182-char cap control) | **PASS** |
| `t3-08-devices.js` | $729 \times 486$ 729-color MMIO framebuffer readback, interrupt-driven keyboard, mouse & StudioNet NIC guest observation, $\ge 2^{32}$ Port 24 check (+ masked IRQ control) | **PASS** |
| `t3-09-state.js` | Determinism, mid-run HTML snapshot export/resume in T2 & T3 modes, and `1,005`-command / `50,746`-char TritOS 3 console length match (+ `narrowWasmState: true` & mutated snapshot controls) | **PASS** |
| `t3-10-static.js` | Strict CSP, 0 forbidden network/storage APIs, 7/7 inline blocks labeled with provenance (`triton.html` line ranges + scanner controls) | **PASS** |
| `t3-11-browser.js` | Headless Chromium via Playwright or Selenium WebDriver (printing `SKIPPED: <reason>` if no browser driver is installed) loads `triton3.html`, boots TritOS 3.0 in lockstep, runs shell/calc/user with 0 page errors | **PASS** |
| `audit/t3-*.js` | Unmodified auditor probes: `t3-protection-probes.js`, `t3-badaddr-probes.js`, and `t3-console-cap.js 400` | **3 / 3 PASS** |

## 6. Everything Not Built, Failing, or Found Impossible/Contradictory

1. **Paging (Optional in M3)**:
   - *Status*: **Not built (Base-and-Limit protection implemented instead)**.
   - *Reason*: M3 specifies *"At minimum, base and limit registers for user mode, so a user task cannot touch memory outside its window. Paging is optional."* Base and limit registers (`UBASE = SPR[6]`, `ULIMIT = SPR[7]`, `PROT_EN = SPR[8]`) are implemented at full 27-trit width, documented in `ISA-3.md`, and verified in `tests/t3-04-protection.js` and `audit/t3-protection-probes.js`.
2. **Future Operating Systems (Ternary GUI Desktop & SpiralOS Port)**:
   - *Status*: **Not built (by explicit specification mandate)**.
   - *Reason*: The specification states *"Do not build either one. Build a machine that can honestly host them, plus a small text-mode TritOS 3 that proves the machine works and assembles itself."*
3. **3.0 Audit Findings Resolved in 3.1 (`AUDIT-3.0.md`)**:
   - *Finding 1 (WASM 32-bit truncation of T3 effective addresses, `PC`, `SP`, SPRs, and counters)*: **Fixed in 3.1** by widening all 27-trit architected state and effective address calculations in `TRITON_WAT` and `TritonWASM` to 64-bit signed integers (`i64`). Verified by `audit/t3-badaddr-probes.js`, `tests/t3-01-oracle.js`, `tests/t3-02-fuzz.js`, `tests/t3-04-protection.js`, `tests/t3-05-interrupts.js`, `tests/t3-06-disk.js`, and `tests/t3-08-devices.js`, with `narrowWasmState: true` positive controls confirming the tests fail when 32-bit truncation is reintroduced.
   - *Finding 2 (WASM console output capped at 10,900 I/O trace events)*: **Fixed in 3.1** by decoupling `TritonWASM.getConsoleOut()` from `IOTrace` via a dedicated console flush buffer drained into `consoleAcc` (while keeping `IOTrace` capped at 10,900 events). Verified by `audit/t3-console-cap.js 400` and `tests/t3-09-state.js` (`1,005` commands producing `50,746` characters, with `narrowWasmState: true` positive control).
   - *Browser Driver Availability Note*: When no browser driver (Playwright or Selenium) is installed in the test environment, `tests/t3-11-browser.js` prints `SKIPPED: <reason>` and `tests/t3-run-all.js` reports it in the `skipped` count rather than failing the run or misreporting it as passed.
   - *Remaining Failing or Impossible Requirements*: **0 failing requirements, 0 impossible/contradictory requirements.**
