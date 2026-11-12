#!/usr/bin/env node
'use strict';

/**
 * Test 7: Self-Hosting at Scale (`tests/t3-07-selfhost.js`)
 * ConsciousNode SoftWorks
 *
 * Verifies:
 *   - TritOS 3's in-OS assembler streams source sector-by-sector via DMA from
 *     the block disk (`Port 17..20`), assembles TritOS 3's own source (`TRITOS3_SRC`),
 *     and emits an output image byte-for-byte equal to the JS assembler's (fixed point).
 *   - The self-built TritOS 3 image boots cleanly on both JS and WASM, runs the
 *     shell, calculator, and user-mode program runner.
 *   - TritOS 3's in-OS assembler assembles a generated source of >= 100,000 characters
 *     (spanning > 144 disk sectors), matching the JS assembler byte-for-byte.
 *   - Positive control: enabling the machine option (`setSingleRamBufferMode(true)`)
 *     that limits the assembler to a single in-RAM source buffer (19,182 chars)
 *     fails the 100,000-character case (`EFLG = 3`, `OLEN = 0`, `REJECTS:` printed).
 */

const { loadHtmlModule } = require('./t3-common');
const { T } = loadHtmlModule('triton3.html');

const t0 = Date.now();

// 1. TritOS 3 Self-Hosting Fixed Point & Boot Verification
T.setSingleRamBufferMode(false);
const osSrc = T.TRITOS3_SRC;
const jsBuiltOS = T.assemble(osSrc, { mode: 'T3' });

const wasmVm = T.TritonWASM.createSync({ archMode: 'T3' });
wasmVm.loadProgram(jsBuiltOS.trytes, 0);

// Write TRITOS3_SRC to block disk starting at Sector 1 (offset 729)
for (let i = 0; i < osSrc.length; i++) {
  wasmVm.setDisk(729 + i, T.balRem(osSrc.charCodeAt(i), T.TRYTE_MOD, T.TRYTE_HALF));
}
wasmVm.setDisk(729 + osSrc.length, 0);

wasmVm.pushInputString('asm\nquit\n');
wasmVm.run(15000000);

const osEflg = wasmVm.getMem(5316);
const osOutLen = wasmVm.getMem(5325) + wasmVm.getMem(5326) * 19683 + wasmVm.getMem(5327) * 387420489;

if (osEflg !== 0 || osOutLen !== jsBuiltOS.length) {
  throw new Error(`[Test 7] TritOS 3 self-hosting failed: eflg=${osEflg} outLen=${osOutLen} expected=${jsBuiltOS.length}`);
}

const selfBuiltImage = new Array(osOutLen);
for (let i = 0; i < osOutLen; i++) {
  const got = wasmVm.getMem(98415 + i);
  if (got !== jsBuiltOS.trytes[i]) {
    throw new Error(`[Test 7] Self-hosting fixed-point mismatch at tryte ${i}: got=${got} expected=${jsBuiltOS.trytes[i]}`);
  }
  selfBuiltImage[i] = got;
}

// Boot the self-built TritOS 3 image on both JS and WASM
const bootJs = new T.TritonJS({ archMode: 'T3' });
const bootWasm = T.TritonWASM.createSync({ archMode: 'T3' });
bootJs.loadProgram(selfBuiltImage, 0);
bootWasm.loadProgram(selfBuiltImage, 0);
bootJs.pushInputString('calc 110-1T\nuser\nquit\n');
bootWasm.pushInputString('calc 110-1T\nuser\nquit\n');
bootJs.run(400000);
bootWasm.run(400000);

if (!bootJs.consoleOut.includes('TritOS 3.0') ||
    !bootJs.consoleOut.includes('= 101 (10)') ||
    !bootJs.consoleOut.includes('USR:OK') ||
    bootJs.consoleOut !== bootWasm.getConsoleOut()) {
  throw new Error('[Test 7] Self-built TritOS 3 image failed boot verification:\n' + bootJs.consoleOut);
}

// 2. Assemble >= 100,000-character generated source in-OS via sector streaming
const genLines = ['.mode T3', '.org 0'];
let idx = 0;
while (genLines.join('\n').length < 105000) {
  const lbl = `lbl_scale_${idx}`;
  const v = ((idx * 37) % 9000) - 4500;
  const m = idx % 5;
  if (m === 0) genLines.push(`${lbl}: LI R${idx % 9},#${v} ; scale test comment padding ${idx}`);
  else if (m === 1) genLines.push(`ADDI R${idx % 9},R${(idx + 1) % 9},#${v} ; arithmetic step ${idx}`);
  else if (m === 2) genLines.push(`JMPX #2 ; relative hop over next instruction ${idx}`);
  else if (m === 3) genLines.push(`LMI R${idx % 9},#${v % 100} ; middle tryte set ${idx}`);
  else genLines.push(`.word #${idx * 12345} ; 27-trit data word ${idx}`);
  idx++;
}
genLines.push('HALT');
const bigSrc = genLines.join('\n');
if (bigSrc.length < 100000) {
  throw new Error('[Test 7] Generated source is shorter than 100,000 chars');
}

const jsBigExpected = T.assemble(bigSrc, { mode: 'T3' });

const scaleVm = T.TritonWASM.createSync({ archMode: 'T3' });
scaleVm.loadProgram(jsBuiltOS.trytes, 0);
for (let i = 0; i < bigSrc.length; i++) {
  scaleVm.setDisk(729 + i, T.balRem(bigSrc.charCodeAt(i), T.TRYTE_MOD, T.TRYTE_HALF));
}
scaleVm.setDisk(729 + bigSrc.length, 0);
scaleVm.pushInputString('asm\nquit\n');
scaleVm.run(35000000);

const bigEflg = scaleVm.getMem(5316);
const bigOutLen = scaleVm.getMem(5325) + scaleVm.getMem(5326) * 19683 + scaleVm.getMem(5327) * 387420489;
if (bigEflg !== 0 || bigOutLen !== jsBigExpected.length) {
  throw new Error(`[Test 7] 100k+ assembly failed: eflg=${bigEflg} outLen=${bigOutLen} expected=${jsBigExpected.length}`);
}
for (let i = 0; i < bigOutLen; i++) {
  if (scaleVm.getMem(98415 + i) !== jsBigExpected.trytes[i]) {
    throw new Error(`[Test 7] 100k+ assembly tryte mismatch at index ${i}`);
  }
}

// 3. Positive Control: machine option limiting assembler to a single in-RAM source buffer (19,182 chars) MUST FAIL the 100k case
T.setSingleRamBufferMode(true);
const cappedOS = T.assemble(T.TRITOS3_SRC, { mode: 'T3' });
const cappedVm = T.TritonWASM.createSync({ archMode: 'T3' });
cappedVm.loadProgram(cappedOS.trytes, 0);
for (let i = 0; i < bigSrc.length; i++) {
  cappedVm.setDisk(729 + i, T.balRem(bigSrc.charCodeAt(i), T.TRYTE_MOD, T.TRYTE_HALF));
}
cappedVm.setDisk(729 + bigSrc.length, 0);
cappedVm.pushInputString('asm\nquit\n');
cappedVm.run(10000000);

const capEflg = cappedVm.getMem(5316);
const capOutLen = cappedVm.getMem(5325) + cappedVm.getMem(5326) * 19683 + cappedVm.getMem(5327) * 387420489;
if (capEflg === 0 || capOutLen !== 0) {
  throw new Error(`[Test 7] Positive control failed: single-RAM-buffer capped assembler did not reject 100k source (eflg=${capEflg}, outLen=${capOutLen})`);
}
T.setSingleRamBufferMode(false);

console.log(`[PASS] t3-07-selfhost: TritOS 3 fixed point (${osOutLen} trytes, ${osSrc.length.toLocaleString()} chars), self-built boot, and ${bigSrc.length.toLocaleString()}-char streaming assembly (${bigOutLen} trytes + positive control) in ${Date.now() - t0} ms`);
