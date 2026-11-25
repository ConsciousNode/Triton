#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Programmatic ISA Documentation Generator (`tests/t5-generate-docs.js`)
 * ConsciousNode SoftWorks — MIT License
 * Lifted and extended from `tests/t4-generate-docs.js` (Stage 1 & Stage 2).
 *
 * Inspects `triton5.html` and `triton4.html`, runs interpreter speed benchmarks in both
 * T2 and T3 modes across `TritonJS` and `TritonWASM`, computes exact opcode/memory/port/
 * vector/SPR/MMU-design tables (correcting Stage 1's unsigned-3^k split-cost label and
 * documenting balanced-3^k, compiler bias, displacement floors, and machine vs C space),
 * and writes `ISA-5.md` with zero hand-typed tables.
 */

const fs = require('fs');
const path = require('path');
const { loadHtmlModule } = require('./t3-common');
const { SPLIT_COST_MODEL } = require('./t5-14-all-designs-bench');

const { T, htmlContent } = loadHtmlModule('triton5.html');
const { htmlContent: ref4HtmlContent } = loadHtmlModule('triton4.html');

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
const t3Opcodes = T.INSTR_SPECS.filter(s => s.t3only && s.op <= 55).length;
const t5Opcodes = T.INSTR_SPECS.filter(s => s.op >= 56).length;
const totalAllocatedOpcodes = T.INSTR_SPECS.length;
const freeOpcodes = totalOpcodeSpace - totalAllocatedOpcodes;
const freePct = ((freeOpcodes / totalOpcodeSpace) * 100).toFixed(1);

const html5Bytes = Buffer.byteLength(htmlContent, 'utf8');
const html5Lines = htmlContent.split('\n').length;
const html4Bytes = Buffer.byteLength(ref4HtmlContent, 'utf8');
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
  if (['LI','LUI','LMI','LHI','MOV','NEG','LT','LDX','LW','LWX','POP','IN','TMIN','TMAX','TCON','TANY','TXOR','TUNARY','JALR','MFSPR','WRAPU','WRAPS','BAND','BOR','BXOR','BNOT','BSHL','BSHR','BSAR','BMULLO','BMULHI','RDTLS'].includes(m)) {
    flags = '`SF=sign`, `CF=0`, `OF=0`';
  } else if (['ADD','ADDI','ADC','SUB','SUBI','SBC','ADDM','ADDH'].includes(m)) {
    flags = '`SF=sign`, `CF=c27`, `OF=c27`';
  } else if (['BADD','BADC'].includes(m)) {
    flags = '`SF=sign`, `CF=c32`, `OF=c32`';
  } else if (['BSUB','BSBC'].includes(m)) {
    flags = '`SF=sign`, `CF=b32`, `OF=b32`';
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
  } else if (m === 'CAS') {
    flags = '`SF=swapped`, `CF=swapped`, `OF=0`';
  } else if (m === 'IRET') {
    flags = 'Restored from `ESR`';
  }
  return { opTrits, t0Layout, t1Layout, syntax, flags };
}

const opcodeRowsMd = T.INSTR_SPECS.map(spec => {
  const { opTrits, t0Layout, t1Layout, syntax, flags } = describeLayouts(spec);
  const gen = spec.op >= 56 ? 'T5' : (spec.t3only ? 'T3' : 'T2/T3');
  const modeTag = spec.t3priv ? `${gen} (Sup)` : gen;
  return `| \`${spec.mnem}\` | \`${spec.op >= 0 ? '+' + spec.op : spec.op}\` | \`${opTrits}\` | \`${t0Layout}\` | \`${t1Layout}\` | \`${syntax}\` | ${modeTag} | ${flags} |`;
}).join('\n');

const VEC_DESC = {
  RESET:      ['Supervisor', 'Cold/warm reset entry vector'],
  ILLEGAL_OP: ['Fault Trap', 'Unallocated or illegal instruction opcode (`EADDR = op`)'],
  PRIV_VIOL:  ['Fault Trap', 'Supervisor-only instruction executed in User mode (`PRIV = 1`)'],
  PROT_VIOL:  ['Fault Trap', 'User memory access outside `[UBASE, ULIMIT)` when paging is off (`EADDR = addr`)'],
  BAD_ADDR:   ['Fault Trap', 'Physical address outside `[0, RAM_SIZE)` and MMIO (`EADDR = addr`)'],
  DIV_ZERO:   ['Fault Trap', 'Division or modulo by zero when `SPR[15]` (`TRAP_DIV0`) is `1`'],
  SYSCALL:    ['Software Trap', '`SYSCALL imm9` system call (`ECAUSE = imm9`, `EADDR = imm9`)'],
  IRQ_TIMER:  ['Hardware IRQ 0 (`bit 0 = 1`)', 'Programmable periodic timer interrupt (Mode 0 = steps, Mode 1 = 200 kHz real time)'],
  IRQ_KBD:    ['Hardware IRQ 1 (`bit 1 = 2`)', 'Keyboard key-down / key-up event queued'],
  IRQ_MOUSE:  ['Hardware IRQ 2 (`bit 2 = 4`)', 'Mouse relative motion / button event queued'],
  IRQ_DISK:   ['Hardware IRQ 3 (`bit 3 = 8`)', 'Block disk multi-sector DMA read/write completion on selected unit'],
  IRQ_NET:    ['Hardware IRQ 4 (`bit 4 = 16`)', 'StudioNet network frame received in RX buffer'],
  IRQ_MEDIA:  ['Hardware IRQ 5 (`bit 5 = 32`)', 'Removable storage unit (`0..26`) inserted or ejected'],
  PAGE_FAULT: ['Fault Trap (Precise)', 'MMU page fault when `SPR_PG_EN = 1` (`EADDR = faulting machine VA`, `PF_CAUSE` = access/mode/reason/level)']
};

const vecRowsMd = Object.entries(T.T3_VEC).map(([name, idx]) => {
  const [kind, desc] = VEC_DESC[name];
  return `| \`${idx}\` | \`${name}\` | \`VBR + ${idx * 3}\` (\`3\` trytes) | ${kind} | ${desc} |`;
}).join('\n');

const SPR_DESC = {
  MODE:       ['`0` = T2 (9-trit wrap), `1` = T3/T5 (27-trit protected)', '`1`'],
  PRIV:       ['`0` = Supervisor mode, `1` = User mode', '`0`'],
  IE:         ['Global Interrupt Enable (`0` = masked, `1` = enabled)', '`0`'],
  IMASK:      ['6-bit hardware IRQ enable mask (`bit 0..5` for Vec `7..12`)', '`0`'],
  IPEND:      ['6-bit hardware IRQ pending bitmap (`bit 0..5` for Vec `7..12`)', '`0`'],
  VBR:        ['27-trit Vector Base Register (physical tryte address of 14-entry vector table; in `balanced-3^k` lives in reserved RAM `0..B`)', '`0`'],
  UBASE:      ['27-trit User Base Register (inclusive lower bound in User mode when `PG_EN = 0`)', '`0`'],
  ULIMIT:     ['27-trit User Limit Register (exclusive upper bound in User mode when `PG_EN = 0`)', `\`${T.T3_DEFAULT_RAM_SIZE}\``],
  PROT_EN:    ['User protection enable when `PG_EN = 0` (`1` = enforce `[UBASE, ULIMIT)`, `0` = off)', '`1`'],
  EPC:        ['27-trit Exception Program Counter (machine space) saved on trap/fault/interrupt entry', '`0`'],
  ESP:        ['27-trit Exception Stack Pointer (machine space) saved on trap/fault/interrupt entry', '`0`'],
  ESR:        ['Exception Status Register (`SF + 3*CF + 9*OF + 27*PRIV + 81*IE`)', '`0`'],
  ECAUSE:     ['Exception Cause code (vector index `0..13`, or `imm9` on `SYSCALL`)', '`0`'],
  EADDR:      ['27-trit Exception Faulting Address (always **machine space** VA on `PAGE_FAULT`, PA on `BAD_ADDR`)', '`0`'],
  KSP:        ['27-trit Kernel Stack Pointer loaded into `SP` when trapping from User mode', '`0`'],
  TRAP_DIV0:  ['`1` = trap on `DIV`/`MOD` by zero (Vector 5); `0` = deterministic non-trapping', '`0`'],
  PG_EN:      ['MMU paging enable (`0` = off / Triton 4 bit-identical, `1` = 2-level paging active)', '`0`'],
  PTBR:       ['27-trit physical tryte address of L0 page table root (entry 0 for `binary`/`unsigned`, **middle entry** for `balanced-3^k`; write flushes TLB on change)', '`0`'],
  ASID:       ['Address Space Identifier (`0..255`) for non-global TLB tag matching', '`0`'],
  PF_CAUSE:   ['Page fault cause bitmap: `bits 0..1` access (`0`=R,`1`=W,`2`=X), `bit 2` User, `bit 3` Perm, `bit 4` L1', '`0`'],
  PAGE_SIZE:  ['Read-only configured page size set at machine creation (`729`, `2187`, or `4096` trytes)', `\`${T.T5_DEFAULT_PAGE_SIZE}\``],
  TLB_FLUSH:  ['Write-only: writing any value flushes all TLB entries (reads `0`)', '`0`'],
  TLB_INV:    ['Write-only: writing a machine VA invalidates matching TLB entry for current ASID (reads `0`)', '`0`'],
  TLS:        ['27-trit Thread-Local Storage pointer (Supervisor write via `MTSPR`, User/Sup read via `RDTLS`)', '`0`'],
  SCRATCH:    ['27-trit Supervisor scratch register for NetBSD `locore` trapframe entry without clobbering GPRs', '`0`'],
  MMU_WALKS:  ['Hardware counter: number of 2-level page table walks performed', '`0`'],
  MMU_HITS:   ['Hardware counter: number of TLB hits', '`0`'],
  MMU_SPLITS: ['Hardware counter: number of virtual address splits performed', '`0`'],
  MMU_MODE:   ['Read-only MMU design set at machine creation: `0` = `binary-4096`, `1` = `unsigned-3^k`, `2` = `balanced-3^k`', '`1` (`unsigned`)']
};

const sprRowsMd = Object.entries(T.T3_SPR).map(([name, idx]) => {
  const [desc, defVal] = SPR_DESC[name];
  return `| \`${idx}\` | \`SPR_${name}\` | ${defVal} | ${desc} |`;
}).join('\n');

const pteRowsMd = Object.entries(T.T5_PTE).map(([bitName, mask]) => {
  const bitIdx = Math.round(Math.log2(mask));
  const roles = {
    V: 'Valid — entry is present; `0` raises `PAGE_FAULT` (`PERM=0`)',
    R: 'Readable — permits load/read accesses',
    W: 'Writable — permits store/write accesses',
    X: 'Executable — permits instruction fetch accesses',
    U: 'User — permits User-mode (`PRIV=1`) access; `0` restricts to Supervisor (`PRIV=0`)',
    A: 'Accessed — set to `1` in RAM and TLB by hardware on any permitted translation',
    D: 'Dirty — set to `1` in RAM and TLB by hardware on any permitted write translation',
    G: 'Global — TLB entry matches any `ASID` (invalidated by `TLBFLUSH` or `TLBINV`)'
  };
  return `| \`bit ${bitIdx}\` | \`${mask}\` | \`${bitName}\` | ${roles[bitName]} |`;
}).join('\n');

const designRowsMd = SPLIT_COST_MODEL.map(c => {
  const entries = c.pageSize === 729 ? 243 : (c.pageSize === 2187 ? 729 : 1024);
  const tblTrytes = entries * 3;
  const idxRange = c.mmuMode === 'balanced'
    ? (c.pageSize === 729 ? '`[-121 .. +121]` (5 bal trits)' : '`[-364 .. +364]` (6 bal trits)')
    : (c.pageSize === 729 ? '`[0 .. 242]` (5 unsigned trits)' : (c.pageSize === 2187 ? '`[0 .. 728]` (6 unsigned trits)' : '`[0 .. 1023]` (10 bits)'));
  const offRange = c.mmuMode === 'balanced'
    ? `\`[-${(c.pageSize - 1) / 2} .. +${(c.pageSize - 1) / 2}]\``
    : `\`[0 .. ${c.pageSize - 1}]\``;
  return `| \`${c.design}\` | \`${c.pageSize.toLocaleString()}\` | ${offRange} | ${idxRange} | \`${tblTrytes.toLocaleString()}\` trytes | \`${c.splitCostPerTrans}\` ${c.splitMetricUnit} | \`${c.gateEstimate}\` gates (${c.gateEstimateNote}) |`;
}).join('\n');

const floor729 = -T.TRYTE_HALF + T.T5_BIAS[729];   // -9841 + 364 = -9477
const floor2187 = -T.TRYTE_HALF + T.T5_BIAS[2187]; // -9841 + 1093 = -8748

const isa5Content = `# Triton 5.0 Instruction Set & Hardware Architecture (\`ISA-5.md\`)

**ConsciousNode SoftWorks · Normative Architecture Specification (Version 5.0, Stage 2)**

*All numerical figures, opcode encodings, SPR indices, PTE bitmasks, MMU design tables, displacement floors, vector offsets, and throughput benchmarks in this specification are generated programmatically by \`tests/t5-generate-docs.js\` directly from \`triton5.html\`.*

Triton 5.0 extends Triton 4.0 (\`${html4Bytes.toLocaleString()}\` bytes) into a virtual-memory, C-ready, NetBSD-capable balanced-ternary architecture (\`triton5.html\`, \`${html5Bytes.toLocaleString()}\` bytes, \`${html5Lines.toLocaleString()}\` lines; MicroWAT WASM module \`${wasmModuleBytes.toLocaleString()}\` bytes from \`${watBytes.toLocaleString()}\` bytes of WAT source). With \`SPR_PG_EN = 0\` (reset default), Triton 5.0 is **bit-identical step-for-step** to Triton 4.0 on every existing T2, T3, T4, and TritOS Desktop 2.0.1 workload.

## 1. Summary of Triton 5.0 Architectural Extensions

### 1.1 Addition A — Three Hardware-Walked MMU Designs, 64-Entry TLB & Precise Page Faults
- **Design & Page Size Switch (set at machine creation via \`options.pageSize\` and \`options.mmuMode\`, read via \`SPR_PAGE_SIZE\` = \`SPR 20\` and \`SPR_MMU_MODE\` = \`SPR 28\`):**
  1. **\`binary-4096\`** (\`pageSize: 4096\`, \`mmuMode: 'binary'\`): real integer division by \`4,096\` and \`1,024\` (\`22\` restoring-division steps per translation).
  2. **\`unsigned-3^k\`** (\`pageSize: 729 | 2187\`, \`mmuMode: 'unsigned'\`): splits non-negative addresses into unsigned base-3 digits \`{0, 1, 2}\`. **Stage 2 Correction:** Stage 1 labeled \`unsigned-3^k\` as "0 division steps"; because Triton words are balanced ternary \`{-1, 0, +1}\`, extracting unsigned base-3 digits requires a **16-trit** (\`729\`) or **19-trit** (\`2,187\`) borrow/carry chain on real ternary hardware, so its split is **not free**.
  3. **\`balanced-3^k\`** (\`pageSize: 729 [k=6, B=364] | 2187 [k=7, B=1093]\`, \`mmuMode: 'balanced'\`): splits balanced-ternary machine addresses directly by balanced trit position (**0 carry trits, 0 divider steps, 0 gates**).

| Design | Page Size | Offset Range | L0 & L1 Index Range (2-Level) | Table Size | Split Cost / Translation | Gate-Level Estimate |
| :--- | ---: | :--- | :--- | ---: | :--- | :--- |
${designRowsMd}

### 1.2 \`balanced-3^k\` Virtual & Physical Geometry (Stage 2)
- **Virtual Split:** Given machine address $A$, the low $k$ balanced trits form \`off = balRem(A, 3^k, B) ∈ [-B, +B]\` and the upper trits form \`vpn = balQuot(A, 3^k, B)\`.
- **Centred 2-Level Page Tables:** Level widths are **5 balanced trits** (\`243\` entries, \`idx ∈ [-121 .. +121]\`, \`729\` trytes = 1 frame) for \`k = 6\` (\`729\`) and **6 balanced trits** (\`729\` entries, \`idx ∈ [-364 .. +364]\`, \`2,187\` trytes = 1 frame) for \`k = 7\` (\`2,187\`). Every table base (\`SPR_PTBR\` for L0, \`l1Ppn * 3^k\` for L1) points at the **middle entry** (\`idx = 0\`). Entry \`idx\` occupies the 3 trytes \`[base + idx*3 - 1 .. base + idx*3 + 1]\`, mapping \`[-H .. +H]\` bijectively onto the exact centred physical frame \`[n·3^k - B .. n·3^k + B]\` with zero overhang. Both L0 and L1 walks handle negative indices natively.
- **NULL & Virtual Page 0:** C's \`NULL\` is machine address \`-B\` (\`-364\` for \`729\`, \`-1,093\` for \`2,187\`), the lowest tryte of virtual page 0 (\`[-B .. +B]\`). Virtual page 0 is **never mapped** in hardware — any access with \`vpn === 0\` raises \`Vector 13 PAGE_FAULT\` with \`EADDR = A\` even if a valid PTE is written in slot \`(0, 0)\`.
- **Physical Frames & Pure Wiring:** Physical frames are numbered from **\`1\`** (\`ppn >= 1\`). Frame \`n\` covers \`[n·3^k - B .. n·3^k + B]\`, so the lowest frame address is \`B + 1\` (\`365\` for \`729\`, \`1,094\` for \`2,187\`). Physical RAM \`0 .. B\` lies outside every frame and holds the vector table (\`VBR = 0\`) and pre-paging boot code. \`PA = ppn·3^k + off\` is pure wiring (concatenating \`ppn\`'s balanced trits above \`off\`'s balanced trits with no adder). Frame \`0\` (\`ppn <= 0\`) is illegal and faults.
- **Compiler Bias Convention (Software Only — No Hardware Support):** Compiled C code keeps pointer values in C space \`P\` and converts to machine address \`A = P - B\` by folding \`-B\` into every load/store displacement and emitting \`JALR rd, rs, #-B\` for indirect jumps. Then \`off = (P mod 3^k) - B\` and \`vpn = floor(P / 3^k)\`. Because \`imm9 ∈ [-${T.TRYTE_HALF}, +${T.TRYTE_HALF}]\`, the **most negative usable C displacement** is:
  - **\`${floor729.toLocaleString()}\`** (\`-${T.TRYTE_HALF} + ${T.T5_BIAS[729]}\`) for \`729\`-tryte pages;
  - **\`${floor2187.toLocaleString()}\`** (\`-${T.TRYTE_HALF} + ${T.T5_BIAS[2187]}\`) for \`2,187\`-tryte pages.

#### Address Space Ownership (Machine Space vs. C Space)

| Entity / Operand | Address Space | Rule |
| :--- | :--- | :--- |
| \`PC\` | **Machine space** | Instruction fetch & branch targets operate directly on machine address \`A\` |
| Return addresses (\`CALL\`, \`CALLX\`, \`JALR\`) | **Machine space** | Pushed / linked return PCs are machine addresses \`A\` |
| \`BCOPY\` / \`BFILL\` operands (\`rd\`, \`rs1\`) | **Machine space** | Source and destination tryte pointers are machine addresses \`A\` |
| DMA addresses (\`DISK_DMA_ADDR\`) | **Machine space** | Physical RAM tryte address (unbiased) |
| Page-table entries (\`PTBR\`, PDE, PTE) | **Machine space** | Physical frame numbers \`ppn >= 1\` and centred physical bases |
| \`SPR_EADDR\` on \`PAGE_FAULT\` | **Machine space** | Always reports the exact faulting machine VA \`A\` (e.g. \`-B\` on C \`NULL\`) |
| Compiled C pointer variables | **C space** | Software convention only; \`P = A + B\` (compiler folds \`-B\` into displacements) |

#### PTE / PDE Word Layout (\`word = ppn * 512 + flags\`)

| Flag Bit | Mask | Name | Architectural Semantics |
| :--- | :--- | :--- | :--- |
${pteRowsMd}

### 1.3 Addition B — Binary-Semantics Instructions for C (\`+56 .. +70\`)
Triton words are 27 balanced trits ($[-3,812,798,742,493, +3,812,798,742,493]$), holding every 32-bit unsigned (\`[0, 2^32)\`) and signed (\`[-2^31, 2^31)\`) integer exactly. Triton 5 adds 15 binary-semantics instructions without altering any existing ternary instruction:
- **Wrapping:** \`WRAPU rd, rs1, imm9\` ($[0, 2^n)$ for $n \le 32$), \`WRAPS rd, rs1, imm9\` ($[-2^{n-1}, 2^{n-1})$ for $n \le 32$).
- **Bitwise:** \`BAND\`, \`BOR\`, \`BXOR\`, \`BNOT\` (canonical unsigned 32-bit results in $[0, 2^{32})$).
- **Binary Shifts:** \`BSHL\`, \`BSHR\` (unsigned 32-bit; $k \ge 32 \Rightarrow 0$), \`BSAR\` (signed 32-bit in $[-2^{31}, 2^{31})$; $k \ge 32 \Rightarrow -1$ or $0$).
- **64-Bit Register-Pair Primitives:** \`BADD\`, \`BADC\` (carry-out in \`CF\`), \`BSUB\`, \`BSBC\` (borrow-out in \`CF\`), \`BMULLO\`, \`BMULHI\` (full $32 \times 32 \to 64$-bit unsigned product).

#### Lowering \`uint64_t\` Operations to Register Pairs \`(lo, hi)\`
- **\`a + b\` (2 instructions):** \`BADD r_lo, a_lo, b_lo\`; \`BADC r_hi, a_hi, b_hi\`.
- **\`a - b\` (2 instructions):** \`BSUB r_lo, a_lo, b_lo\`; \`BSBC r_hi, a_hi, b_hi\`.
- **\`a * b\` (6 instructions):** \`BMULLO r_lo, a_lo, b_lo\`; \`BMULHI t0, a_lo, b_lo\`; \`BMULLO t1, a_lo, b_hi\`; \`BMULLO t2, a_hi, b_lo\`; \`BADD t0, t0, t1\`; \`BADD r_hi, t0, t2\`.
- **\`a << s\` / \`a >> s\` ($0 \le s < 64$):** for $s < 32$, combine \`BSHL\`/\`BSHR\` (or \`BSAR\` for signed high limb) with \`BOR\` using complement shift \`32 - s\` (yields \`0\` at $s = 0$); for $32 \le s < 64$, cross-limb shift by \`s - 32\`.

### 1.4 Addition C — Kernel & NetBSD Machine-Dependent Hardware (\`+71 .. +75\`, \`SPR 23..24\`)
- **\`CAS rd, rs1, rs2\` (\`+71\`):** Atomic 27-trit word compare-and-swap at address \`rs1\`.
- **\`WFI\` (\`+72\`, Supervisor-only):** Idle sleep until \`(IPEND & IMASK) != 0\`; \`HALT\` retains halt-until-reset semantics.
- **\`TLBFLUSH\` (\`+73\`) & \`TLBINV rs1\` (\`+74\`, Supervisor-only):** Full and single-VA TLB invalidation for NetBSD \`pmap\`.
- **\`SPR_TLS\` (\`SPR 23\`) & \`RDTLS rd\` (\`+75\`, User/Supervisor):** User-readable LWP TLS pointer for NetBSD \`_lwp_getprivate()\`.
- **\`SPR_SCRATCH\` (\`SPR 24\`, Supervisor-only):** Kernel trap-entry scratch register for NetBSD \`locore\` trapframe save.

## 2. Special-Purpose Registers (\`SPR 0 .. ${Object.keys(T.T3_SPR).length - 1}\`)

| SPR Index (\`imm9\`) | Symbolic Name | Reset Value | Architectural Semantics |
| :--- | :--- | :--- | :--- |
${sprRowsMd}

## 3. Interrupts & Exceptions (Vectors \`0 .. ${Object.keys(T.T3_VEC).length - 1}\`)

Each vector table entry occupies **1 word (3 consecutive trytes)** at physical address $\\text{VBR} + 3 \\times \\text{vec}$:

| Vector (\`vec\`) | Name | Table Offset | Category | Trigger Condition |
| :--- | :--- | :--- | :--- | :--- |
${vecRowsMd}

## 4. Complete Instruction Encoding Table (${totalAllocatedOpcodes} Opcodes)

Out of $3^5 = ${totalOpcodeSpace}$ possible 5-trit opcodes ($[-121, +121]$), Triton 5.0 allocates **${totalAllocatedOpcodes} opcodes** (${t2Opcodes} base T2/T3 + ${t3Opcodes} T3 + ${t5Opcodes} T5), leaving **${freeOpcodes} free opcodes (${freePct}%)**.

| Mnemonic | Op Dec | Op Trits ($t_8..t_4$) | Tryte 0 Layout | Tryte 1 Layout | Assembly Syntax | Mode | Flag Updates (\`SF\`, \`CF\`, \`OF\`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${opcodeRowsMd}

## 5. Interpreter Throughput Benchmarks (\`triton5.html\`, Measured)

| Mode | Instructions Executed | \`TritonJS\` Time (ms) | \`TritonJS\` Speed (MIPS) | \`TritonWASM\` Time (ms) | \`TritonWASM\` Speed (MIPS) | WASM Speedup |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **T2 Mode** | \`${benchT2.totalInstrs.toLocaleString()}\` | \`${benchT2.jsMs}\` ms | \`${benchT2.jsMips}\` MIPS | \`${benchT2.wasmMs}\` ms | \`${benchT2.wasmMips}\` MIPS | \`${benchT2.speedup}x\` |
| **T3 Mode** | \`${benchT3.totalInstrs.toLocaleString()}\` | \`${benchT3.jsMs}\` ms | \`${benchT3.jsMips}\` MIPS | \`${benchT3.wasmMs}\` ms | \`${benchT3.wasmMips}\` MIPS | \`${benchT3.speedup}x\` |
`;

const outPath = path.resolve(__dirname, '..', 'ISA-5.md');
fs.writeFileSync(outPath, isa5Content, 'utf8');
console.log(`[PASS] t5-generate-docs: Generated ISA-5.md (${Buffer.byteLength(isa5Content, 'utf8').toLocaleString()} bytes) from triton5.html (${totalAllocatedOpcodes} opcodes, ${Object.keys(T.T3_SPR).length} SPRs)`);
