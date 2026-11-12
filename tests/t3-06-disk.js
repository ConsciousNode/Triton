#!/usr/bin/env node
'use strict';

/**
 * Test 6: Block Disk DMA, Interrupts, Error Codes & Image Round-Trip (`tests/t3-06-disk.js`)
 * ConsciousNode SoftWorks
 *
 * Verifies:
 *   - Sector size = 729 trytes, capacity = 3^13 = 1,594,323 trytes (2,187 sectors).
 *   - Multi-sector DMA write (RAM -> Disk) and DMA read (Disk -> RAM) round trips.
 *   - Completion interrupt (Vector 10, `IRQ_DISK`, bit 3 = 8) delivered to guest ISR.
 *   - Status (`-1`) and error codes (`1` = `ERR_BAD_SECTOR`, `2` = `ERR_BAD_DMA_ADDR`,
 *     `3` = `ERR_BAD_CMD`) for bad sectors, out-of-range DMA buffers, and invalid commands.
 *   - Disk image export and import (`exportDiskImage` / `importDiskImage`) round-trip
 *     byte-for-byte across the entire 1,594,323-tryte (3,188,646-byte) disk.
 *   - Positive control: corrupting 1 byte in an exported disk image is detected.
 */

const { loadHtmlModule, makeRng } = require('./t3-common');
const { T } = loadHtmlModule('triton3.html');

const t0 = Date.now();
const rng = makeRng(0x3006D15C);

if (T.T3_SECTOR_SIZE !== 729 || T.T3_DEFAULT_DISK_SIZE < 1594323) {
  throw new Error(`[Test 6] Invalid disk geometry: sector=${T.T3_SECTOR_SIZE} size=${T.T3_DEFAULT_DISK_SIZE}`);
}

// 1. Multi-sector DMA Write + DMA Read + IRQ_DISK Completion Interrupt
const dmaSrc = `
  .mode T3
  .equ VBR_ADDR, 1000
  .equ IRQ_FLAG, 500
  .org 0
  ; Set up VBR and Vector 10 (IRQ_DISK = VBR + 30)
  LI R0, #VBR_ADDR
  MTSPR R0, #5
  LI R1, #VBR_ADDR
  LI R0, #disk_isr
  SW R0, R1, #30

  ; Enable IRQ_DISK (bit 3 = 8) in IMASK and IE = 1
  LI R0, #8
  MTSPR R0, #3
  LI R0, #1
  MTSPR R0, #2

  ; Write 4 sectors (4 * 729 = 2,916 trytes) from RAM[10000..12915] to Disk LBA 10..13
  LI R0, #10
  OUT R0, #17      ; DISK_LBA = 10
  LI R0, #0
  ADDI R0, R0, #-9683
  LMI R0, #1       ; 10000 = 1*19683 - 9683
  OUT R0, #18      ; DISK_DMA_ADDR = 10000
  LI R0, #4
  OUT R0, #19      ; DISK_COUNT = 4
  LI R0, #2
  OUT R0, #20      ; DISK_CMD = 2 (DMA_WRITE)
  NOP              ; allow IRQ_DISK ISR to fire!

  ; Re-enable IE = 1 for second DMA interrupt
  LI R0, #1
  MTSPR R0, #2

  ; Read 4 sectors back from Disk LBA 10..13 into RAM[20000..22915]
  LI R0, #10
  OUT R0, #17      ; DISK_LBA = 10
  LI R0, #317
  LMI R0, #1       ; 20000 = 1*19683 + 317
  OUT R0, #18      ; DISK_DMA_ADDR = 20000
  LI R0, #4
  OUT R0, #19      ; DISK_COUNT = 4
  LI R0, #1
  OUT R0, #20      ; DISK_CMD = 1 (DMA_READ)
  NOP              ; allow IRQ_DISK ISR to fire!

  ; Test error codes:
  ; (a) Bad sector LBA = 3000 -> Status in R4, Err in R5
  LI R0, #3000
  OUT R0, #17
  LI R0, #1
  OUT R0, #20
  IN R4, #20
  IN R5, #21

  ; (b) Bad DMA address = -50 -> Status in R6, Err in R7
  LI R0, #10
  OUT R0, #17
  LI R0, #-50
  OUT R0, #18
  LI R0, #1
  OUT R0, #20
  IN R6, #20
  IN R7, #21

  ; (c) Bad command = 99 -> Err in R8
  LI R0, #99
  OUT R0, #20
  IN R8, #21
  HALT

disk_isr:
  PUSH R0
  PUSH R1
  LI R1, #IRQ_FLAG
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  POP R1
  POP R0
  IRET
`;

const built = T.assemble(dmaSrc, { mode: 'T3' });
const jsVm = new T.TritonJS({ archMode: 'T3' });
const wasmVm = T.TritonWASM.createSync({ archMode: 'T3' });

jsVm.loadProgram(built.trytes, 0);
wasmVm.loadProgram(built.trytes, 0);

// Populate source buffer RAM[10000..12915] with 2,916 random trytes
const pattern = new Int16Array(4 * 729);
for (let i = 0; i < pattern.length; i++) {
  const v = rng.int(-9841, 9841);
  pattern[i] = v;
  jsVm.setMem(10000 + i, v);
  wasmVm.setMem(10000 + i, v);
}

jsVm.run(1000);
wasmVm.run(1000);

// Verify both DMA completion interrupts fired (IRQ_FLAG at Mem[500] == 2)
if (jsVm.getMem(500) !== 2 || wasmVm.getMem(500) !== 2) {
  throw new Error(`[Test 6] Expected 2 IRQ_DISK interrupts, got JS=${jsVm.getMem(500)} WASM=${wasmVm.getMem(500)}`);
}

// Verify all 2,916 trytes in RAM[20000..22915] match pattern
for (let i = 0; i < pattern.length; i++) {
  if (jsVm.getMem(20000 + i) !== pattern[i] || wasmVm.getMem(20000 + i) !== pattern[i]) {
    throw new Error(`[Test 6] Multi-sector DMA round-trip mismatch at tryte ${i}`);
  }
}

// Verify error codes for bad sector (Err=1), bad DMA address (Err=2), and bad command (Err=3)
if (jsVm.getWordNum(4) !== -1 || jsVm.getWordNum(5) !== 1 ||
    jsVm.getWordNum(6) !== -1 || jsVm.getWordNum(7) !== 2 ||
    jsVm.getWordNum(8) !== 3 ||
    wasmVm.getWordNum(4) !== -1 || wasmVm.getWordNum(5) !== 1 ||
    wasmVm.getWordNum(6) !== -1 || wasmVm.getWordNum(7) !== 2 ||
    wasmVm.getWordNum(8) !== 3) {
  throw new Error(`[Test 6] Disk error code mismatch: R4..R8 = ${[4,5,6,7,8].map(r => jsVm.getWordNum(r))}`);
}

// 2. Image Export & Import Byte-for-Byte Round-Trip across full 3^13-tryte disk
// Also write data at high sector (Sector 2186, the very last sector of 3^13 disk)
const lastSectorOffset = 2186 * 729;
for (let i = 0; i < 729; i++) {
  const v = rng.int(-9841, 9841);
  jsVm.disk[lastSectorOffset + i] = v;
  wasmVm.setDisk(lastSectorOffset + i, v);
}

const exportedBytes = T.exportDiskImage(jsVm);
if (exportedBytes.byteLength !== T.T3_DEFAULT_DISK_SIZE * 2) {
  throw new Error(`[Test 6] Exported disk byte length mismatch: ${exportedBytes.byteLength}`);
}

const freshJs = new T.TritonJS({ archMode: 'T3' });
const freshWasm = T.TritonWASM.createSync({ archMode: 'T3' });
T.importDiskImage(freshJs, exportedBytes);
T.importDiskImage(freshWasm, exportedBytes);

const reExportedJs = T.exportDiskImage(freshJs);
const reExportedWasm = T.exportDiskImage(freshWasm);

for (let i = 0; i < exportedBytes.length; i++) {
  if (reExportedJs[i] !== exportedBytes[i] || reExportedWasm[i] !== exportedBytes[i]) {
    throw new Error(`[Test 6] Export/import byte mismatch at byte ${i}`);
  }
}

// 3. Positive Control: mutating 1 byte in exported disk image is detected on re-import
let positiveControlCaught = false;
{
  const mutated = exportedBytes.slice();
  mutated[10 * 729 * 2 + 4] ^= 0x55;
  const checkVm = new T.TritonJS({ archMode: 'T3' });
  T.importDiskImage(checkVm, mutated);
  if (checkVm.disk[10 * 729 + 2] !== jsVm.disk[10 * 729 + 2]) {
    positiveControlCaught = true;
  }
}
if (!positiveControlCaught) {
  throw new Error('[Test 6] Positive control failed to detect disk image mutation!');
}

console.log(`[PASS] t3-06-disk: Multi-sector DMA read/write, IRQ_DISK interrupt, bad sector/addr/cmd errors, and ${exportedBytes.byteLength.toLocaleString()}-byte image round-trip (+ positive control) in ${Date.now() - t0} ms`);
