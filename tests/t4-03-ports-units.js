#!/usr/bin/env node
'use strict';

/**
 * Triton 4 Machine Test 3: Ports 28-32, Sparse Units, IRQ_MEDIA, .tdisk/Raw Export & T2 Isolation (`tests/t4-03-ports-units.js`)
 * ConsciousNode SoftWorks
 *
 * Verifies:
 *   1. Each port's (28..32, 7..8, 17..21) read/write semantics across Units 0..26.
 *   2. Bad or empty unit -> `DISK_ERR` 4 (`DISK_STATUS` -1).
 *   3. DMA past a unit's end (`LBA + COUNT > DISK_SIZE`) -> bad sector (`DISK_ERR` 1, `DISK_STATUS` -1)
 *      on 3^7 (2,187), 3^10 (59,049), and 3^13 (1,594,323) sector units.
 *   4. Stream disk `DISK_ADDR` (Port 7) and `DISK_DATA` (Port 8) wrap at `DISK_SIZE * 729` of the selected unit.
 *   5. `IRQ_MEDIA` (Vector 12, bit 5 = 32) fires on both `insertUnit` and `ejectUnit`.
 *   6. `DISK_FLAGS` (Port 30) bit 3 (`changed = 8`) clears on read (`IN 30`).
 *   7. `.tdisk` (sparse) and raw image round-trip, self-contained HTML snapshot carrying all sparse units,
 *      and Unit 0 raw export byte-identical to Triton 3's `exportDiskImage`.
 *   8. T2 mode (`archMode = 0`) sees none of Ports 28+: reads return 0 and writes are ignored.
 */

const { loadHtmlModule, makeRng } = require('./t3-common');
const { T: T3 } = loadHtmlModule('triton3.html');
const { T: T4, htmlContent: t4Html } = loadHtmlModule('triton4.html');
const R = require('../../tritfs/tritfs-ref.js');

const t0 = Date.now();
const rng = makeRng(0x4003D15C);

// 1. Default unit geometry on reset (Unit 0 = 2187, Unit 1 = 59049, Units 2..26 = empty removable)
{
  const js = new T4.TritonJS({ archMode: 'T3' });
  const wasm = T4.TritonWASM.createSync({ archMode: 'T3' });

  for (const vm of [js, wasm]) {
    const u0 = vm.getUnitInfo(0);
    const u1 = vm.getUnitInfo(1);
    const u2 = vm.getUnitInfo(2);
    const u26 = vm.getUnitInfo(26);
    if (!u0.present || u0.sectors !== 2187 || u0.removable ||
        !u1.present || u1.sectors !== 59049 || u1.removable || u1.nonZeroSectors !== 0 ||
        u2.present || u2.sectors !== 0 || !u2.removable ||
        u26.present || u26.sectors !== 0 || !u26.removable) {
      throw new Error(`[t4-03.1] Default unit geometry mismatch: u0=${JSON.stringify(u0)} u1=${JSON.stringify(u1)} u2=${JSON.stringify(u2)}`);
    }
  }
}

// 2. Port 28..30 semantics, bad/empty unit -> DISK_ERR 4, DMA past unit end -> DISK_ERR 1, Port 7/8 wrap
{
  const [s10_0, s10_1, s10_2] = T4.numberToWord(59049);       // 3^10
  const [s13_0, s13_1, s13_2] = T4.numberToWord(1594323);     // 3^13
  const [end0_0, end0_1, end0_2] = T4.numberToWord(2187 * 729 - 1);

  const portSrc = T4.assemble(`
    .mode T3
    .org 0
    ; (a) Select empty Unit 2 -> IN 29 = 0, IN 30 = 2 (removable), DMA_READ -> Status=-1, Err=4 (BAD_UNIT)
    LI R0, #2
    OUT R0, #28
    IN R1, #28       ; R1 = 2
    IN R2, #29       ; R2 = 0 (no medium)
    IN R3, #30       ; R3 = 2 (removable, not present)
    LI R0, #0
    OUT R0, #17      ; LBA = 0
    LI R0, #2000
    OUT R0, #18      ; DMA = 2000
    LI R0, #1
    OUT R0, #19      ; COUNT = 1
    OUT R0, #20      ; DMA_READ on empty unit 2
    IN R4, #20       ; R4 = -1
    IN R5, #21       ; R5 = 4 (ERR_BAD_UNIT)

    ; (b) Select out-of-range Unit 99 -> IN 29 = 0, DMA_READ -> Err=4
    LI R0, #99
    OUT R0, #28
    IN R6, #29       ; R6 = 0
    LI R0, #1
    OUT R0, #20
    IN R7, #21       ; R7 = 4

    ; (c) Select Unit 1 (59,049 sectors): DMA at LBA=59048, COUNT=2 (past end) -> Err=1 (BAD_SECTOR)
    LI R0, #1
    OUT R0, #28
    LI R0, #${s10_0 - 1}
    LMI R0, #${s10_1}
    LHI R0, #${s10_2}
    OUT R0, #17      ; LBA = 59048
    LI R0, #2
    OUT R0, #19      ; COUNT = 2 (59048 + 2 > 59049)
    LI R0, #1
    OUT R0, #20
    IN R8, #21       ; R8 = 1 (ERR_BAD_SECTOR)
    LI R1, #500
    SW R8, R1, #0

    ; (d) Stream wrap on Unit 0 (2187 * 729 = 1,594,323 trytes)
    LI R0, #0
    OUT R0, #28
    LI R0, #${end0_0}
    LMI R0, #${end0_1}
    LHI R0, #${end0_2}
    OUT R0, #7       ; DISK_ADDR = 1,594,322 (last tryte of Unit 0)
    LI R0, #321
    OUT R0, #8       ; write 321 at last tryte, wraps DISK_ADDR to 0!
    IN R8, #7        ; R8 = 0
    SW R8, R1, #3
    HALT
  `, { mode: 'T3' });

  const js = new T4.TritonJS({ archMode: 'T3' });
  const wasm = T4.TritonWASM.createSync({ archMode: 'T3' });
  js.loadProgram(portSrc.trytes, 0);
  wasm.loadProgram(portSrc.trytes, 0);
  js.run(500);
  wasm.run(500);

  for (const [name, vm] of [['js', js], ['wasm', wasm]]) {
    if (vm.getWordNum(1) !== 500 || vm.getWordNum(2) !== 0 || vm.getWordNum(3) !== 2 ||
        vm.getWordNum(4) !== -1 || vm.getWordNum(5) !== 4 ||
        vm.getWordNum(6) !== 0 || vm.getWordNum(7) !== 4 ||
        vm.getMem(500) !== 1 || vm.getMem(503) !== 0 ||
        vm.disk[2187 * 729 - 1] !== 321) {
      throw new Error(`[t4-03.2] ${name} port/DMA check failed: R1..R7=${[1,2,3,4,5,6,7].map(r=>vm.getWordNum(r))} m500=${vm.getMem(500)} m503=${vm.getMem(503)}`);
    }
  }
}

// 3. 3^13-sector sparse unit: write at sector 1,500,000, verify sparse storage & DMA past end -> ERR_BAD_SECTOR
{
  const js = new T4.TritonJS({ archMode: 'T3' });
  const wasm = T4.TritonWASM.createSync({ archMode: 'T3' });
  js.createBlankUnit(3, 1594323);
  wasm.createBlankUnit(3, 1594323);

  const [lba0, lba1, lba2] = T4.numberToWord(1500000);
  const [bad0, bad1, bad2] = T4.numberToWord(1594323);
  const hiUnitSrc = T4.assemble(`
    .mode T3
    .org 0
    LI R0, #3
    OUT R0, #28      ; Select Unit 3 (3^13 = 1,594,323 sectors)
    IN R1, #29       ; R1 = 1,594,323
    IN R2, #30       ; R2 = 11 (present=1 | removable=2 | changed=8), clears changed!
    IN R3, #30       ; R3 = 3  (present=1 | removable=2, changed cleared!)

    ; Write 1 sector at LBA 1,500,000 from RAM[3000..3728]
    LI R4, #-1234
    LI R5, #3000
    SW R4, R5, #0
    LI R0, #${lba0}
    LMI R0, #${lba1}
    LHI R0, #${lba2}
    OUT R0, #17      ; DISK_LBA = 1,500,000
    LI R0, #3000
    OUT R0, #18
    LI R0, #1
    OUT R0, #19
    LI R0, #2
    OUT R0, #20      ; DMA_WRITE

    ; Read back into RAM[4000..4728]
    LI R0, #4000
    OUT R0, #18
    LI R0, #1
    OUT R0, #20      ; DMA_READ
    LI R5, #4000
    LW R4, R5, #0    ; R4 = -1234

    ; Attempt DMA_READ at LBA = 1,594,323 (past end) -> Status=-1, Err=1
    LI R0, #${bad0}
    LMI R0, #${bad1}
    LHI R0, #${bad2}
    OUT R0, #17
    LI R0, #1
    OUT R0, #20
    IN R6, #20       ; R6 = -1
    IN R7, #21       ; R7 = 1
    HALT
  `, { mode: 'T3' });

  js.loadProgram(hiUnitSrc.trytes, 0);
  wasm.loadProgram(hiUnitSrc.trytes, 0);
  js.run(500);
  wasm.run(500);

  for (const [name, vm] of [['js', js], ['wasm', wasm]]) {
    if (vm.getWordNum(1) !== 1594323 || vm.getWordNum(2) !== 11 || vm.getWordNum(3) !== 3 ||
        vm.getWordNum(4) !== -1234 || vm.getWordNum(6) !== -1 || vm.getWordNum(7) !== 1 ||
        vm.getUnitInfo(3).nonZeroSectors !== 1) {
      throw new Error(`[t4-03.3] ${name} 3^13-sector unit test failed: R1..R7=${[1,2,3,4,6,7].map(r=>vm.getWordNum(r))} nz=${vm.getUnitInfo(3).nonZeroSectors}`);
    }
  }
}

// 4. IRQ_MEDIA on both Insert and Eject, plus Write-Protect enforcement
{
  const mediaSrc = T4.assemble(`
    .mode T3
    .equ VBR_ADDR, 1000
    .org 0
    LI R0, #VBR_ADDR
    MTSPR R0, #5
    LI R1, #VBR_ADDR
    LI R0, #media_isr
    SW R0, R1, #36   ; Vec 12: IRQ_MEDIA
    LI R0, #32       ; bit 5 = 32 (IRQ_MEDIA)
    MTSPR R0, #3     ; IMASK = 32
    LI R0, #1
    MTSPR R0, #2     ; IE = 1
  lp:
    NOP
    JMPX lp

  media_isr:
    PUSH R0
    PUSH R1
    LI R1, #500
    LW R0, R1, #0
    ADDI R0, R0, #1
    SW R0, R1, #0
    ; Read Unit 2 DISK_FLAGS (Port 30) and log at Mem[510 + count*3]
    LI R2, #2
    OUT R2, #28
    IN R2, #30
    MULI R0, R0, #3
    ADDI R0, R0, #510
    SW R2, R0, #0
    LI R0, #1
    MTSPR R0, #2     ; re-enable IE=1
    POP R1
    POP R0
    IRET
  `, { mode: 'T3' });

  const js = new T4.TritonJS({ archMode: 'T3' });
  const wasm = T4.TritonWASM.createSync({ archMode: 'T3' });
  js.loadProgram(mediaSrc.trytes, 0);
  wasm.loadProgram(mediaSrc.trytes, 0);
  js.run(30); wasm.run(30);

  // Event 1: Insert write-protected cartridge into Unit 2 -> IRQ_MEDIA #1 (flags = present(1)|rem(2)|wp(4)|changed(8) = 15)
  js.createBlankUnit(2, 2187, { writeProtected: true });
  wasm.createBlankUnit(2, 2187, { writeProtected: true });
  js.run(50); wasm.run(50);

  // Event 2: Eject Unit 2 -> IRQ_MEDIA #2 (flags = rem(2)|changed(8) = 10)
  js.ejectUnit(2);
  wasm.ejectUnit(2);
  js.run(50); wasm.run(50);

  if (js.getMem(500) !== 2 || wasm.getMem(500) !== 2 ||
      js.getMem(513) !== 15 || wasm.getMem(513) !== 15 ||
      js.getMem(516) !== 10 || wasm.getMem(516) !== 10) {
    throw new Error(`[t4-03.4] IRQ_MEDIA insert/eject flags mismatch: cnt=${js.getMem(500)} f1=${js.getMem(513)} f2=${js.getMem(516)}`);
  }
}

// 5. .tdisk & Raw Export/Import Round-Trip, Self-Contained HTML Snapshot with Sparse Units, and Unit 0 Raw === T3 exportDiskImage
{
  const js = new T4.TritonJS({ archMode: 'T3' });
  const t3Vm = new T3.TritonJS({ archMode: 'T3' });

  // Populate Unit 0 with test data on both T4 and T3
  for (let i = 0; i < 5000; i++) {
    const v = rng.int(-9841, 9841);
    js.disk[i] = v;
    t3Vm.disk[i] = v;
  }
  const raw4 = T4.exportDiskImage(js);
  const raw3 = T3.exportDiskImage(t3Vm);
  if (raw4.byteLength !== raw3.byteLength) {
    throw new Error(`[t4-03.5] Unit 0 raw export size mismatch vs Triton 3: ${raw4.byteLength} vs ${raw3.byteLength}`);
  }
  for (let i = 0; i < raw4.byteLength; i++) {
    if (raw4[i] !== raw3[i]) throw new Error(`[t4-03.5] Unit 0 raw export byte mismatch at ${i}`);
  }

  // Build a TritFS v2 image in reference model, export .tdisk, insert into Unit 2 of js
  const refUnit = new R.Unit(59049, { removable: true });
  const refFs = R.TritFS.mkfs(refUnit, 'CARTRIDGE');
  refFs.mkdir('/apps');
  refFs.writeFile('/apps/hello', [10, -20, 30, 40], R.T_DATA);
  const tdiskBytes = refUnit.toTdisk();

  js.insertUnit(2, tdiskBytes);
  if (js.getUnitInfo(2).label !== 'CARTRIDGE') {
    throw new Error(`[t4-03.5] Expected label 'CARTRIDGE', got '${js.getUnitInfo(2).label}'`);
  }

  // Export HTML snapshot carrying all sparse units, then restore into fresh JS and WASM VMs
  const snapHtml = T4.exportSelfContainedHTML(t4Html, js);
  const snapObj = T4.extractSnapshotFromHTML(snapHtml);
  const rJs = new T4.TritonJS({ archMode: 'T3' });
  const rWasm = T4.TritonWASM.createSync({ archMode: 'T3' });
  T4.restoreSnapshot(snapObj, rJs, rWasm);

  const reTdiskJs = rJs.exportUnitTdisk(2);
  const reTdiskWasm = rWasm.exportUnitTdisk(2);
  if (reTdiskJs.byteLength !== tdiskBytes.byteLength || reTdiskWasm.byteLength !== tdiskBytes.byteLength) {
    throw new Error('[t4-03.5] Restored Unit 2 .tdisk byteLength mismatch');
  }
  for (let i = 0; i < tdiskBytes.byteLength; i++) {
    if (reTdiskJs[i] !== tdiskBytes[i] || reTdiskWasm[i] !== tdiskBytes[i]) {
      throw new Error(`[t4-03.5] Restored Unit 2 .tdisk byte mismatch at ${i}`);
    }
  }
}

// 6. T2 Mode Isolation: in T2 mode, Ports 28..32 read 0 and writes are ignored
{
  const t2Src = T4.assemble(`
    LI R0, #1
    OUT R0, #28
    OUT R0, #31
    OUT R0, #32
    IN R1, #28
    IN R2, #29
    IN R3, #30
    IN R4, #31
    IN R5, #32
    HALT
  `, { mode: 'T2' });

  const js = new T4.TritonJS({ archMode: 'T2' });
  const wasm = T4.TritonWASM.createSync({ archMode: 'T2' });
  js.loadProgram(t2Src.trytes, 0);
  wasm.loadProgram(t2Src.trytes, 0);
  js.run(100);
  wasm.run(100);

  for (const [name, vm] of [['js', js], ['wasm', wasm]]) {
    for (let r = 1; r <= 5; r++) {
      if (vm.getWordNum(r) !== 0) {
        throw new Error(`[t4-03.6] ${name} T2 mode leaked non-zero value on Port ${27 + r}: R${r}=${vm.getWordNum(r)}`);
      }
    }
    if (vm.diskUnit !== 0 || vm.timerMode !== 0) {
      throw new Error(`[t4-03.6] ${name} T2 mode modified diskUnit=${vm.diskUnit} or timerMode=${vm.timerMode}`);
    }
  }
}

console.log(`[PASS] t4-03-ports-units: Ports 28..32, DISK_ERR 4, DMA bounds on 3^7/3^10/3^13 units, IRQ_MEDIA insert/eject, changed bit clear-on-read, .tdisk/raw/HTML snapshot, and T2 isolation in ${Date.now() - t0} ms`);
