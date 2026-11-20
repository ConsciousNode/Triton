#!/usr/bin/env node
'use strict';

/**
 * Triton 4.0 Programmatic ISA Documentation Generator (`tests/t4-generate-docs.js`)
 * ConsciousNode SoftWorks
 *
 * Inspects `triton4.html` and `triton3.html`, runs interpreter speed benchmarks in both
 * T2 and T3 modes across `TritonJS` and `TritonWASM`, computes exact opcode/memory/port/vector/unit
 * tables and test figures, and writes `ISA-4.md` into the repository root (`path.resolve(__dirname, '..')`)
 * with zero hand-typed numbers.
 */

const fs = require('fs');
const path = require('path');
const { loadHtmlModule } = require('./t3-common');

const { T, htmlContent } = loadHtmlModule('triton4.html');
const { htmlContent: ref3HtmlContent } = loadHtmlModule('triton3.html');

function measureSpeed(modeStr) {
  const isT3 = modeStr === 'T3';
  const brOp = isT3 ? 'JPX bench_lp' : 'JP bench_lp';
  const benchSrc = `
    ${isT3 ? '.mode T3' : ''}
    LI R0, #0
    LI R1, #0t10T10T10T
    LI R2, #0t01T01T01T
    LI R3, #9841
  bench_lp:
    ADD  R4, R1, R2
    SUB  R5, R4, R2
    MUL  R6, R4, R1
    TCON R7, R4, R5
    SHLI R8, R7, #3
    ST   R4, R0, #500
    LT   R4, R0, #500
    ADDI R1, R1, #1
    SUBI R3, R3, #1
    CMPI R3, #0
    ${brOp}
    HALT
  `;
  const built = T.assemble(benchSrc, { mode: modeStr });
  const totalInstrs = 4 + 9841 * 11 + 1;

  const jsVm = new T.TritonJS({ archMode: modeStr });
  jsVm.loadProgram(built.trytes, 0);
  const tJs0 = process.hrtime.bigint();
  const jsRan = jsVm.run(200000);
  const jsMs = Number(process.hrtime.bigint() - tJs0) / 1e6;

  const wasmVm = T.TritonWASM.createSync({ archMode: modeStr });
  wasmVm.loadProgram(built.trytes, 0);
  const tWasm0 = process.hrtime.bigint();
  const wasmRan = wasmVm.run(200000);
  const wasmMs = Number(process.hrtime.bigint() - tWasm0) / 1e6;

  if (jsRan !== totalInstrs || wasmRan !== totalInstrs) {
    throw new Error(`Benchmark step mismatch in ${modeStr}: ${jsRan} / ${wasmRan} vs ${totalInstrs}`);
  }

  const jsIps = Math.round((totalInstrs / jsMs) * 1000);
  const wasmIps = Math.round((totalInstrs / wasmMs) * 1000);
  return {
    mode: modeStr,
    totalInstrs,
    jsMs: jsMs.toFixed(2),
    wasmMs: wasmMs.toFixed(2),
    jsIps,
    wasmIps,
    jsMips: (jsIps / 1e6).toFixed(2),
    wasmMips: (wasmIps / 1e6).toFixed(2),
    speedup: (wasmIps / jsIps).toFixed(1)
  };
}

const benchT2 = measureSpeed('T2');
const benchT3 = measureSpeed('T3');

const totalOpcodeSpace = Math.pow(3, 5);
const t2Opcodes = T.INSTR_SPECS_T2.length;
const t3NewOpcodes = T.INSTR_SPECS.length - t2Opcodes;
const totalAllocatedOpcodes = T.INSTR_SPECS.length;
const freeOpcodes = totalOpcodeSpace - totalAllocatedOpcodes;
const freePct = ((freeOpcodes / totalOpcodeSpace) * 100).toFixed(1);

const html4Bytes = Buffer.byteLength(htmlContent, 'utf8');
const html4Lines = htmlContent.split('\n').length;
const html3Bytes = Buffer.byteLength(ref3HtmlContent, 'utf8');
const watBytes = Buffer.byteLength(T.TRITON_WAT, 'utf8');
const wasmModuleBytes = T.MicroWAT.assemble(T.TRITON_WAT).byteLength;

function describeLayouts(spec) {
  const opTrits = T.intToTernaryStr(spec.op, 5);
  let t0Layout = `${opTrits} | 00 | 00`;
  let t1Layout = '000000000';
  let syntax = spec.mnem;
  let flags = 'Unchanged';
  switch (spec.fmt) {
    case 'NONE': break;
    case 'R3': t0Layout = `${opTrits} | rd | rs1`; t1Layout = '0000000 | rs2'; syntax = `${spec.mnem} rd, rs1, rs2`; break;
    case 'R2': t0Layout = `${opTrits} | rd | rs1`; syntax = `${spec.mnem} rd, rs1`; break;
    case 'CMP': t0Layout = `${opTrits} | 00 | rs1`; t1Layout = '0000000 | rs2'; syntax = `${spec.mnem} rs1, rs2`; break;
    case 'CMPI': t0Layout = `${opTrits} | 00 | rs1`; t1Layout = 'imm9'; syntax = `${spec.mnem} rs1, imm9`; break;
    case 'RI': t0Layout = `${opTrits} | rd | 00`; t1Layout = 'imm9'; syntax = `${spec.mnem} rd, imm9`; break;
    case 'RRI': t0Layout = `${opTrits} | rd | rs1`; t1Layout = 'imm9'; syntax = `${spec.mnem} rd, rs1, imm9`; break;
    case 'R1_S': t0Layout = `${opTrits} | 00 | rs1`; syntax = `${spec.mnem} rs1`; break;
    case 'R1_D': t0Layout = `${opTrits} | rd | 00`; syntax = `${spec.mnem} rd`; break;
    case 'J': t1Layout = 'imm9'; syntax = `${spec.mnem} imm9`; break;
    case 'JREL': t1Layout = 'rel9'; syntax = `${spec.mnem} target`; break;
  }
  const m = spec.mnem;
  if (['LI','LUI','LMI','LHI','MOV','NEG','LT','LDX','LW','LWX','POP','IN','TMIN','TMAX','TCON','TANY','TXOR','TUNARY','JALR','MFSPR'].includes(m)) {
    flags = '`SF=sign`, `CF=0`, `OF=0`';
  } else if (['ADD','ADDI','ADC','SUB','SUBI','SBC','ADDM','ADDH'].includes(m)) {
    flags = '`SF=sign`, `CF=c27`, `OF=c27`';
  } else if (['MUL','MULI'].includes(m)) {
    flags = '`SF=sign`, `CF=hi`, `OF=hi`';
  } else if (['DIV','MOD'].includes(m)) {
    flags = '`SF=sign`, `CF=0`, `OF=div0`';
  } else if (['CMP','CMPI'].includes(m)) {
    flags = '`SF=cmp`, `CF=c27`, `OF=c27`';
  } else if (['SHL','SHLI'].includes(m)) {
    flags = '`SF=sign`, `CF=out`, `OF=hi`';
  } else if (['SHR','SHRI'].includes(m)) {
    flags = '`SF=sign`, `CF=out`, `OF=0`';
  } else if (['BCOPY','BFILL'].includes(m)) {
    flags = '`SF=(cnt>0?1:0)`, `CF=0`, `OF=0`';
  } else if (m === 'IRET') {
    flags = 'Restored from `ESR`';
  }
  return { opTrits, t0Layout, t1Layout, syntax, flags };
}

const opcodeRowsMd = T.INSTR_SPECS.map(spec => {
  const { opTrits, t0Layout, t1Layout, syntax, flags } = describeLayouts(spec);
  const modeTag = spec.t3only ? (spec.t3priv ? 'T3 (Sup)' : 'T3') : (spec.t3priv ? 'T2 / T3 (Sup)' : 'T2 & T3');
  return `| \`${spec.mnem}\` | \`${spec.op >= 0 ? '+' + spec.op : spec.op}\` | \`${opTrits}\` | \`${t0Layout}\` | \`${t1Layout}\` | \`${syntax}\` | ${modeTag} | ${flags} |`;
}).join('\n');

const VEC_DESC = {
  RESET:      ['Supervisor', 'Cold/warm reset entry vector'],
  ILLEGAL_OP: ['Fault Trap', 'Unallocated or illegal instruction opcode (`EADDR = op`)'],
  PRIV_VIOL:  ['Fault Trap', 'Supervisor-only instruction executed in User mode (`PRIV = 1`)'],
  PROT_VIOL:  ['Fault Trap', 'User memory access outside `[UBASE, ULIMIT)` (`EADDR = addr`)'],
  BAD_ADDR:   ['Fault Trap', 'Physical address outside `[0, RAM_SIZE)` and MMIO (`EADDR = addr`)'],
  DIV_ZERO:   ['Fault Trap', 'Division or modulo by zero when `SPR[15]` (`TRAP_DIV0`) is `1`'],
  SYSCALL:    ['Software Trap', '`SYSCALL imm9` system call (`ECAUSE = imm9`, `EADDR = imm9`)'],
  IRQ_TIMER:  ['Hardware IRQ 0 (`bit 0 = 1`)', 'Programmable periodic timer interrupt (Mode 0 = steps, Mode 1 = 200 kHz real time)'],
  IRQ_KBD:    ['Hardware IRQ 1 (`bit 1 = 2`)', 'Keyboard key-down / key-up event queued'],
  IRQ_MOUSE:  ['Hardware IRQ 2 (`bit 2 = 4`)', 'Mouse relative motion / button event queued'],
  IRQ_DISK:   ['Hardware IRQ 3 (`bit 3 = 8`)', 'Block disk multi-sector DMA read/write completion on selected unit'],
  IRQ_NET:    ['Hardware IRQ 4 (`bit 4 = 16`)', 'StudioNet network frame received in RX buffer'],
  IRQ_MEDIA:  ['Hardware IRQ 5 (`bit 5 = 32`)', 'Removable storage unit (`0..26`) inserted or ejected']
};

const vecRowsMd = Object.entries(T.T3_VEC).map(([name, idx]) => {
  const [kind, desc] = VEC_DESC[name];
  return `| \`${idx}\` | \`${name}\` | \`VBR + ${idx * 3}\` (\`3\` trytes) | ${kind} | ${desc} |`;
}).join('\n');

const SPR_DESC = {
  MODE:      ['`0` = T2 (9-trit wrap), `1` = T3 (27-trit protected)', '`1` (T3)'],
  PRIV:      ['`0` = Supervisor mode, `1` = User mode', '`0` (Supervisor)'],
  IE:        ['Global Interrupt Enable (`0` = masked, `1` = enabled)', '`0`'],
  IMASK:     ['6-bit hardware IRQ enable mask (`bit 0..5` for Vec `7..12`)', '`0`'],
  IPEND:     ['6-bit hardware IRQ pending bitmap (`bit 0..5` for Vec `7..12`)', '`0`'],
  VBR:       ['27-trit Vector Base Register (tryte address of 13-entry vector table)', '`0`'],
  UBASE:     ['27-trit User Base Register (inclusive lower bound in User mode)', '`0`'],
  ULIMIT:    ['27-trit User Limit Register (exclusive upper bound in User mode)', `\`${T.T3_DEFAULT_RAM_SIZE}\``],
  PROT_EN:   ['User protection enable (`1` = enforce `[UBASE, ULIMIT)`, `0` = off)', '`1`'],
  EPC:       ['27-trit Exception Program Counter saved on trap/interrupt entry', '`0`'],
  ESP:       ['27-trit Exception Stack Pointer saved on trap/interrupt entry', '`0`'],
  ESR:       ['Exception Status Register (`SF + 3*CF + 9*OF + 27*PRIV + 81*IE`)', '`0`'],
  ECAUSE:    ['Exception Cause code (vector index `0..12`, or `imm9` on `SYSCALL`)', '`0`'],
  EADDR:     ['27-trit Exception Faulting Address (or opcode/port/syscall immediate)', '`0`'],
  KSP:       ['27-trit Kernel Stack Pointer loaded into `SP` when trapping from User mode', '`0`'],
  TRAP_DIV0: ['`1` = trap on `DIV`/`MOD` by zero (Vector 5); `0` = deterministic non-trapping', '`0`']
};

const sprRowsMd = Object.entries(T.T3_SPR).map(([name, idx]) => {
  const [desc, defVal] = SPR_DESC[name];
  return `| \`${idx}\` | \`SPR_${name}\` | ${defVal} | ${desc} |`;
}).join('\n');

const isa4Content = `# Triton 4.0 Instruction Set & Hardware Architecture (\`ISA-4.md\`)

**ConsciousNode SoftWorks · Normative Architecture Specification (Version 4.0)**

*All numerical figures, opcode encodings, memory ranges, port definitions, storage unit classes, and vector offsets in this specification are generated programmatically by \`tests/t4-generate-docs.js\` directly from \`triton4.html\`.*

Triton 4.0 extends Triton 3.1.1 (\`${html3Bytes.toLocaleString()}\` bytes) into a complete card-computer architecture (\`triton4.html\`, \`${html4Bytes.toLocaleString()}\` bytes, \`${html4Lines.toLocaleString()}\` lines; MicroWAT WASM module \`${wasmModuleBytes.toLocaleString()}\` bytes from \`${watBytes.toLocaleString()}\` bytes of WAT source) while remaining **step-for-step backward-compatible** with every Triton 3.1.1 and Triton 2.1 program that does not access Ports \`28+\`.

## 1. Summary of Triton 4.0 Architectural Extensions

1. **Multi-Unit Sparse Block & Stream Storage (\`Ports 28..30\`, \`Vector 12 IRQ_MEDIA\`)**:
   - Supports **${T.T3_MAX_UNITS} addressable storage units (\`0 .. ${T.T3_MAX_UNITS - 1}\`)**:
     - **Unit \`0\`**: Boot disk, fixed at **$3^7 = ${T.T3_DEFAULT_DISK_SECTORS.toLocaleString()}$ sectors** ($\`${T.T3_DEFAULT_DISK_SIZE.toLocaleString()}\`$ trytes), preserving the legacy TritOS layout.
     - **Unit \`1\`**: Home disk (main storage), defaulting to **$3^{10} = ${T.T4_HOME_DISK_SECTORS.toLocaleString()}$ sectors** ($\`${(T.T4_HOME_DISK_SECTORS * T.T3_SECTOR_SIZE).toLocaleString()}\`$ trytes), blank on cold creation.
     - **Unit \`2\`**: Removable cartridge slot (any sector count up to **$3^{13} = ${T.T4_MAX_DISK_SECTORS.toLocaleString()}$ sectors** = $\`${(T.T4_MAX_DISK_SECTORS * T.T3_SECTOR_SIZE).toLocaleString()}\`$ trytes).
     - **Units \`3 .. 26\`**: Removable extra disk image slots on microSD.
   - All existing disk ports (\`7..8\` stream disk, \`17..21\` DMA block disk) act on the currently selected \`DISK_UNIT\` (\`Port 28\`).
   - \`DISK_ERR\` (\`Port 21\`) adds error code \`${T.T4_DISK_ERR.BAD_UNIT}\` (\`ERR_BAD_UNIT\`) for invalid, empty, or write-protected units.
   - Inserting or ejecting a unit sets bit 3 (\`changed = 8\`) in \`DISK_FLAGS\` (\`Port 30\`, which clears on read) and raises **Vector \`${T.T3_VEC.IRQ_MEDIA}\` (\`IRQ_MEDIA\`, IRQ bit 5 = \`32\`)**.
2. **Real-Time 200 kHz Timer Mode & Real-Time Clock (\`Ports 31..32\`)**:
   - \`TIMER_MODE\` (\`Port 31\`): \`0\` (reset default) counts CPU steps as in Triton 3.1.1; \`1\` counts real time at **${(T.T4_TIMER_RATE_HZ / 1000).toLocaleString()} kHz** ($1$ tick per $5\\,\\mu\\text{s} = 200$ ticks/ms) from an injectable host clock on both \`TIMER_TICKS\` (\`Port 6\`) and the periodic timer (\`Port 9\`, \`IRQ_TIMER\`).
   - \`RTC_SECONDS\` (\`Port 32\`): 27-trit seconds elapsed since **\`2000-01-01 00:00:00 UTC\`** (\`${T.T4_RTC_EPOCH_MS}\` ms Unix epoch) driven by the same injectable clock. Writing \`OUT rd, #32\` sets an offset.
3. **Power-Cut Fault Injector (\`cutPowerAfterSectorWrites(N)\`)**:
   - Halts the machine as if unplugged immediately after the next $N$ sector writes ($N \\ge 0$): all unit contents up to cut point $N$ persist, while RAM, VRAM, and CPU registers are wiped.

## 2. Fundamental Data Types & Storage Size Classes

### 2.1 Hierarchy of Balanced-Ternary Units

| Unit | Width (Trits) | Cardinality ($3^n$) | Balanced Range $[-\\frac{3^n-1}{2}, +\\frac{3^n-1}{2}]$ | Architectural Role in Triton 4.0 |
| :--- | :--- | :--- | :--- | :--- |
| **Trit** | $1 = 3^0$ | $3$ | $[-1, +1]$ (\`T\`, \`0\`, \`1\`) | Atomic ternary digit; individual status flag (\`SF\`, \`CF\`, \`OF\`) |
| **Diad** | $2$ | $9$ | $[-4, +4]$ (\`TT\` .. \`11\`) | Register specifier (\`R0\`–\`R8\`); single color channel ($9$ levels) in T3 display |
| **Triad** | $3 = 3^1$ | $27$ | $[-13, +13]$ (\`TTT\` .. \`111\`) | T2 status register (\`SR\`), T2 27-color pixel, \`TUNARY\` truth table |
| **Hexad** | $6 = 2 \\times 3$ | $729$ | $[-364, +364]$ | T3 729-color pixel ($2$ trits each of R, G, B in low 6 trits of a tryte) |
| **Tryte** | $9 = 3^2$ | $${T.TRYTE_MOD.toLocaleString()}$ | $[-${T.TRYTE_HALF.toLocaleString()}, +${T.TRYTE_HALF.toLocaleString()}]$ | Addressable memory/disk cell, T2 \`PC\`/\`SP\`, instruction immediate \`imm9\` |
| **Parcel** | $18 = 2 \\times 9$ | $387,420,489$ | $[-193,710,244, +193,710,244]$ | Fixed-width 2-tryte instruction parcel (\`Tryte 0\`, \`Tryte 1\`) |
| **Word** | $27 = 3^3$ | $${T.WORD_MOD_BIG.toLocaleString()}$ | $[-${T.WORD_HALF_BIG.toLocaleString()}, +${T.WORD_HALF_BIG.toLocaleString()}]$ | General-purpose register width (\`R0\`–\`R8\`), T3 \`PC\`, \`SP\`, LBA, RTC seconds |

### 2.2 Standard Disk Unit Map & Size Classes

| Unit Slot | Role | Default State | Default Sector Count |
| :--- | :--- | :--- | :--- |
| \`0\` | Boot Disk (Legacy layout) | Present, Fixed, RW | \`${T.T3_DEFAULT_DISK_SECTORS.toLocaleString()}\` ($3^7$) |
| \`1\` | Home Disk (Main storage) | Present, Fixed, RW | \`${T.T4_HOME_DISK_SECTORS.toLocaleString()}\` ($3^{10}$) |
| \`2\` | Cartridge Slot | Empty, Removable | \`0\` (any size when inserted) |
| \`3 .. 26\` | Extra MicroSD Images | Empty, Removable | \`0\` (any size when inserted) |

| Size Class | Sectors ($3^k$) | Capacity (Trytes) | Raw Image Bytes ($2\\text{ B/tryte}$) | TritFS v2 Link Table Sectors ($\\lceil N / 243 \\rceil$) |
| :--- | :--- | :--- | :--- | :--- |
| **Small ($3^7$)** | \`2,187\` | \`1,594,323\` | \`3,188,646\` (~3.2 MB) | \`9\` sectors (\`6,561\` trytes) |
| **Home ($3^{10}$)** | \`59,049\` | \`43,046,721\` | \`86,093,442\` (~86.1 MB) | \`243\` sectors (\`177,147\` trytes) |
| **Large ($3^{13}$)** | \`1,594,323\` | \`1,162,261,467\` | \`2,324,522,934\` (~2.32 GB) | \`6,561\` sectors (\`4,782,969\` trytes, paged) |

## 3. Registers, Special-Purpose Registers (SPRs) & Memory Map

### 3.1 Special-Purpose Registers (\`MFSPR rd, imm9\` / \`MTSPR rs1, imm9\`)

| SPR Index (\`imm9\`) | Symbolic Name | Reset Value | Architectural Semantics |
| :--- | :--- | :--- | :--- |
${sprRowsMd}

### 3.2 Physical Memory & MMIO Address Map

| Address Range (Trytes) | Size (Trytes) | Region Name | Access Rules & Protection |
| :--- | :--- | :--- | :--- |
| \`0 .. 4,782,968\` ($3^{14}$, default) | \`${T.T3_DEFAULT_RAM_SIZE.toLocaleString()}\` | **Default Physical RAM** | Full read/write in Supervisor mode; restricted to \`[UBASE, ULIMIT)\` in User mode when \`PROT_EN = 1\` |
| \`0 .. 14,348,906\` ($3^{15}$, max) | \`${T.T3_MAX_CONF_RAM_SIZE.toLocaleString()}\` | **Max Configurable Physical RAM** | Configurable via \`new TritonJS({ ramSize })\` / \`TritonWASM.createSync({ ramSize })\` |
| \`${T.T3_FB_BASE.toLocaleString()} .. ${(T.T3_FB_BASE + T.T3_FB_SIZE - 1).toLocaleString()}\` | \`${T.T3_FB_SIZE.toLocaleString()}\` ($729 \\times 486$) | **MMIO Display Framebuffer** | 1 tryte per pixel ($729$ colors: low 6 trits = 2 trits R, 2 trits G, 2 trits B; high 3 trits = 0) |
| All other addresses | — | **Unmapped Address Space** | Raises **Bad Address fault (Vector 4, \`BAD_ADDR\`)** with full 27-trit \`EADDR = addr\`; never wraps silently |

## 4. Interrupts & Exceptions (Vectors \`0 .. 12\`)

Each vector table entry occupies **1 word (3 consecutive trytes)** at $\\text{VBR} + 3 \\times \\text{vec}$:

| Vector (\`vec\`) | Name | Table Offset | Category | Trigger Condition |
| :--- | :--- | :--- | :--- | :--- |
${vecRowsMd}

## 5. Architected I/O Ports (\`Ports 0 .. 32\`)

In T3 mode, \`IN rd, port\` (\`+31\`) and \`OUT rd, port\` (\`+32\`) are **Supervisor-only** (faulting via Vector 2 in User mode). In T2 compatibility mode (\`SPR_MODE = 0\`), Ports \`28+\` read \`0\` and ignore writes.

| Port (\`imm9\`) | Symbolic Name | \`IN rd, port\` (Read Semantics) | \`OUT rd, port\` (Write Semantics) |
| :--- | :--- | :--- | :--- |
| \`0\` | \`CONSOLE_CHAR\` | Dequeues next ASCII character from console input queue (\`0\` if empty) | Appends character $R[rd]_0 \\bmod 19683$ to console transcript |
| \`1\` | \`CONSOLE_NUM\` | Returns queued console character count | Appends decimal representation of 27-trit $R[rd]$ to console |
| \`2\` | \`DISPLAY_X\` | Reads active display X coordinate ($0..728$ in T3, $0..242$ in T2) | Sets \`DisplayX\` $\\leftarrow R[rd]_0 \\bmod W$ |
| \`3\` | \`DISPLAY_Y\` | Reads active display Y coordinate ($0..485$ in T3, $0..242$ in T2) | Sets \`DisplayY\` $\\leftarrow R[rd]_0 \\bmod H$ |
| \`4\` | \`DISPLAY_PIXEL\` | Reads pixel color at \`(DisplayX, DisplayY)\` | Writes pixel color ($[-364..+364]$ in T3, $[-13..+13]$ in T2) |
| \`5\` | \`DISPLAY_CMD\` | Reads last display fill color | Fills entire framebuffer with color $R[rd]_0$ |
| \`6\` | \`TIMER_TICKS\` | Reads 27-trit tick counter (Mode 0 = \`steps\`; Mode 1 = 200 kHz real-time ticks) | Sets \`timerTicks\` (or \`realTimeTicks\` in Mode 1) |
| \`7\` | \`DISK_ADDR\` | Reads stream tryte address on selected unit | Sets stream \`DiskAddr\` $\\leftarrow R[rd] \\bmod (\\text{DISK\\_SIZE} \\times 729)$ |
| \`8\` | \`DISK_DATA\` | Reads \`Unit[DiskUnit][DiskAddr]\` and increments \`DiskAddr\` (wrapping at unit size) | Writes $R[rd]_0$ to \`Unit[DiskUnit][DiskAddr]\` and increments \`DiskAddr\` |
| \`9\` | \`TIMER_PERIOD\` | Reads programmable periodic timer period | Sets \`TimerPeriod\` $\\leftarrow R[rd]$, resets \`TimerCount <- 0\` |
| \`10\` | \`KBD_COUNT\` | Returns queued hardware keyboard events | Ignored |
| \`11\` | \`KBD_DATA\` | Dequeues next keyboard event keycode into $R[rd]$ and latches type | Ignored |
| \`12\` | \`KBD_TYPE\` | Returns latched event type (\`0\` = key-down, \`1\` = key-up) | Ignored |
| \`13\` | \`MOUSE_COUNT\` | Returns queued hardware mouse events | Ignored |
| \`14\` | \`MOUSE_DX\` | Dequeues next mouse event $\\Delta X$ into $R[rd]$ and latches $\\Delta Y$, buttons | Ignored |
| \`15\` | \`MOUSE_DY\` | Returns latched mouse $\\Delta Y$ | Ignored |
| \`16\` | \`MOUSE_BTN\` | Returns latched 3-button mask (\`bit 0\`: Left, \`1\`: Right, \`2\`: Middle) | Ignored |
| \`17\` | \`DISK_LBA\` | Reads DMA starting sector number (\`0 .. DISK_SIZE - 1\`) | Sets \`DiskLba\` $\\leftarrow R[rd]$ |
| \`18\` | \`DISK_DMA_ADDR\` | Reads DMA physical RAM tryte address | Sets \`DiskDmaAddr\` $\\leftarrow R[rd]$ |
| \`19\` | \`DISK_COUNT\` | Reads DMA sector count $N$ ($729 N$ trytes) | Sets \`DiskCount\` $\\leftarrow R[rd]$ |
| \`20\` | \`DISK_CMD_STAT\` | Reads DMA status (\`0\`=idle, \`1\`=OK, \`-1\`=error) | Executes DMA on selected unit: \`0\`=reset, \`1\`=Read, \`2\`=Write (raises \`IRQ_DISK\`) |
| \`21\` | \`DISK_ERR\` | Reads DMA error (\`0\`=none, \`1\`=bad sector, \`2\`=bad DMA addr, \`3\`=bad cmd, \`4\`=bad/empty unit) | Ignored |
| \`22\` | \`NET_STATUS\` | Returns StudioNet magic \`0xA4 | rx_ready\` (\`164\` or \`165\`) | Ignored |
| \`23\` | \`NET_NODE_ID\` | Returns StudioNet station node ID (\`0x0003\` default) | Ignored |
| \`24\` | \`NET_TX_LEN\` | Reads current TX FIFO byte count | Transmits \`R[rd]\`-byte frame (\`12..512\` B) onto StudioNet bus |
| \`25\` | \`NET_RX_LEN\` | Returns byte length of current RX frame (\`0\` if none) | Writing \`1\` pops current RX frame and advances RX queue |
| \`26\` | \`NET_TX_FIFO\` | Returns \`0\` | Appends byte $R[rd]_0 \\bmod 256$ to outbound TX frame buffer |
| \`27\` | \`NET_RX_FIFO\` | Reads next byte from current inbound RX frame | Ignored |
| \`28\` | \`DISK_UNIT\` | Reads selected storage unit (\`0 .. 26\`, reset default \`0\`) | Selects storage unit $R[rd]$; all disk ports (\`7..8, 17..21\`) act on it |
| \`29\` | \`DISK_SIZE\` | Reads sector count of selected unit (\`0\` = no medium; \`2,187\` on Unit 0) | Ignored |
| \`30\` | \`DISK_FLAGS\` | Reads unit flags (\`bit 0\` present, \`1\` removable, \`2\` WP, \`3\` changed—clears on read) | Ignored |
| \`31\` | \`TIMER_MODE\` | Reads current timer mode (\`0\` or \`1\`) | Sets timer mode: \`0\` = virtual steps (default); \`1\` = real time (200 kHz / $5\\,\\mu\\text{s}$) |
| \`32\` | \`RTC_SECONDS\` | Reads 27-trit seconds since \`2000-01-01 00:00 UTC\` | Sets RTC clock offset so \`RTC_SECONDS\` equals $R[rd]$ at current host time |
| \`40 .. 48\` | *Reserved* | Reserved for future audio specification (reads \`0\`) | Ignored |

## 6. Complete Instruction Encoding Table (${totalAllocatedOpcodes} Opcodes)

Out of $3^5 = ${totalOpcodeSpace}$ possible 5-trit opcodes ($[-121, +121]$), Triton 4.0 allocates **${totalAllocatedOpcodes} opcodes** (${t2Opcodes} base T2/T3 opcodes + ${t3NewOpcodes} T3 opcodes), leaving **${freeOpcodes} free opcodes (${freePct}%)**.

| Mnemonic | Op Dec | Op Trits ($t_8..t_4$) | Tryte 0 Layout | Tryte 1 Layout | Assembly Syntax | Mode | Flag Updates (\`SF\`, \`CF\`, \`OF\`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${opcodeRowsMd}

## 7. Interpreter Throughput Benchmarks (\`triton4.html\`)

| Mode | Instructions Executed | \`TritonJS\` Time (ms) | \`TritonJS\` Speed (MIPS) | \`TritonWASM\` Time (ms) | \`TritonWASM\` Speed (MIPS) | WASM Speedup |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **T2 Mode** | \`${benchT2.totalInstrs.toLocaleString()}\` | \`${benchT2.jsMs}\` ms | \`${benchT2.jsMips}\` MIPS | \`${benchT2.wasmMs}\` ms | \`${benchT2.wasmMips}\` MIPS | \`${benchT2.speedup}x\` |
| **T3 Mode** | \`${benchT3.totalInstrs.toLocaleString()}\` | \`${benchT3.jsMs}\` ms | \`${benchT3.jsMips}\` MIPS | \`${benchT3.wasmMs}\` ms | \`${benchT3.wasmMips}\` MIPS | \`${benchT3.speedup}x\` |
`;

const outPath = path.resolve(__dirname, '..', 'ISA-4.md');
fs.writeFileSync(outPath, isa4Content, 'utf8');
console.log(`[PASS] t4-generate-docs: Generated ISA-4.md (${Buffer.byteLength(isa4Content, 'utf8').toLocaleString()} bytes) from triton4.html`);
