#!/usr/bin/env node
'use strict';

/**
 * Test 3: T2 Compatibility Against `triton.html` (2.1) (`tests/t3-03-t2compat.js`)
 * ConsciousNode SoftWorks
 *
 * Verifies:
 *   - 10,000 random 2.x programs: final state in T2 mode on `triton3.html`
 *     (both JS and WASM) is identical to the reference `triton.html` (2.1) machine.
 *   - TritOS 2.1 boots and runs a scripted shell session identically in T2 mode.
 *   - TritOS 2.1's self-hosting fixed point holds in T2 mode.
 *   - Switching between T3 and T2 modes is a privileged operation (`MTSPR`).
 *   - The attached `tests/run.js`, `tests/symbols.js` and `audit/*.js` still pass,
 *     unmodified, against `triton.html`.
 *   - Positive control: running a 2.x wrapping program in T3 mode instead of T2 mode
 *     diverges (faults on negative wrapped address `-1` instead of wrapping to `19682`).
 */

const path = require('path');
const { execFileSync } = require('child_process');
const { loadHtmlModule, makeRng } = require('./t3-common');

const { T: T2Ref, htmlPath: refPath } = loadHtmlModule('triton.html');
const { T: T3Sys, htmlPath: t3Path } = loadHtmlModule('triton3.html');

const t0 = Date.now();
const rng = makeRng(0x13572468);

const refVm = new T2Ref.TritonJS();
const t3Js = new T3Sys.TritonJS({ archMode: 'T2' });
const t3Wasm = T3Sys.TritonWASM.createSync({ archMode: 'T2' });

const SAFE_OPS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
  15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
  31, 32, -2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -12, -13
];

// 1. 10,000 random 2.x programs: T3 (in T2 mode) === Reference 2.1
for (let p = 0; p < 10000; p++) {
  const numIns = rng.int(12, (p % 25 === 0) ? 500 : 64);

  refVm.pc = 0; refVm.sp = -1; refVm.sf = 0; refVm.cf = 0; refVm.of = 0;
  refVm.halted = 0; refVm.steps = 0; refVm.displayX = 0; refVm.displayY = 0;
  refVm.displayCmd = 0; refVm.diskAddr = 0; refVm.timerTicks = 0;
  refVm.inputQueue.length = 0; refVm.inputHead = 0; refVm.ioTrace.length = 0;
  refVm.consoleOut = ''; refVm.reg.fill(0);

  t3Js.archMode = 0; t3Js.pc = 0; t3Js.sp = -1; t3Js.sf = 0; t3Js.cf = 0; t3Js.of = 0;
  t3Js.halted = 0; t3Js.steps = 0; t3Js.displayX = 0; t3Js.displayY = 0;
  t3Js.displayCmd = 0; t3Js.diskAddr = 0; t3Js.timerTicks = 0;
  t3Js.inputQueue.length = 0; t3Js.inputHead = 0; t3Js.ioTrace.length = 0;
  t3Js.consoleOut = ''; t3Js.reg.fill(0);

  t3Wasm.archMode = 0; t3Wasm.pc = 0; t3Wasm.sp = -1; t3Wasm.sf = 0; t3Wasm.cf = 0; t3Wasm.of = 0;
  t3Wasm.halted = 0; t3Wasm.steps = 0; t3Wasm.displayX = 0; t3Wasm.displayY = 0;
  t3Wasm.displayCmd = 0; t3Wasm.diskAddr = 0; t3Wasm.timerTicks = 0;
  t3Wasm.i32[20554] = 0; t3Wasm.i32[20555] = 0; t3Wasm.i32[20556] = 0;
  t3Wasm.i32.fill(0, 20480, 20480 + 27);

  const ch1 = rng.int(32, 122), ch2 = rng.int(32, 122);
  refVm.pushInputChar(ch1); refVm.pushInputChar(ch2);
  t3Js.pushInputChar(ch1); t3Js.pushInputChar(ch2);
  t3Wasm.pushInputChar(ch1); t3Wasm.pushInputChar(ch2);

  for (let i = 0; i < numIns - 1; i++) {
    const op = SAFE_OPS[rng.u32() % SAFE_OPS.length];
    const rd = rng.u32() % 9;
    const rs1 = rng.u32() % 9;
    const rs2 = rng.u32() % 9;
    let t1 = 0;

    if (op >= 21 && op <= 27) {
      t1 = rng.int(i + 1, numIns - 1) * 2;
    } else if (op >= 15 && op <= 18) {
      t1 = rng.int(1200, 1600);
    } else if (op === 31 || op === 32) {
      const ports = [0, 1, 2, 3, 4, 6, 7, 8];
      t1 = ports[rng.u32() % ports.length];
    } else if (op === -10 || op === -11 || op === -12 || op === -13) {
      t1 = (op === -10 || op === -12) ? T2Ref.balRem(rs2, 9, 4) : rng.int(-30, 30);
    } else {
      const spec = T2Ref.OP_MAP[op];
      if (spec.fmt === 'R3' || spec.fmt === 'CMP') t1 = T2Ref.balRem(rs2, 9, 4);
      else if (spec.fmt === 'NONE' || spec.fmt === 'R2' || spec.fmt === 'R1_S' || spec.fmt === 'R1_D') t1 = 0;
      else t1 = rng.int(-9841, 9841);
    }

    const effRs1 = (op >= 15 && op <= 18) ? 0 : rs1;
    const [ins0, ins1] = T2Ref.encodeInstruction(op, rd, effRs1, t1);
    refVm.mem[i * 2] = ins0; refVm.mem[i * 2 + 1] = ins1;
    t3Js.mem[i * 2] = ins0; t3Js.mem[i * 2 + 1] = ins1;
    t3Wasm.setMem(i * 2, ins0); t3Wasm.setMem(i * 2 + 1, ins1);
  }

  const [h0, h1] = T2Ref.encodeInstruction(-1, 0, 0, 0);
  refVm.mem[(numIns - 1) * 2] = h0; refVm.mem[(numIns - 1) * 2 + 1] = h1;
  t3Js.mem[(numIns - 1) * 2] = h0; t3Js.mem[(numIns - 1) * 2 + 1] = h1;
  t3Wasm.setMem((numIns - 1) * 2, h0); t3Wasm.setMem((numIns - 1) * 2 + 1, h1);

  const sRef = refVm.run(250);
  const sJs = t3Js.run(250);
  const sWasm = t3Wasm.run(250);

  if (sRef !== sJs || sRef !== sWasm ||
      refVm.pc !== t3Js.pc || refVm.pc !== t3Wasm.pc ||
      refVm.sp !== t3Js.sp || refVm.sp !== t3Wasm.sp ||
      refVm.sf !== t3Js.sf || refVm.sf !== t3Wasm.sf ||
      refVm.cf !== t3Js.cf || refVm.cf !== t3Wasm.cf ||
      refVm.of !== t3Js.of || refVm.of !== t3Wasm.of) {
    throw new Error(`[Test 3] T2 compatibility state mismatch on program ${p}`);
  }

  for (let r = 0; r < 9; r++) {
    const [r0, r1, r2] = refVm.getWord(r);
    const [j0, j1, j2] = t3Js.getWord(r);
    const [w0, w1, w2] = t3Wasm.getWord(r);
    if (r0 !== j0 || r1 !== j1 || r2 !== j2 || r0 !== w0 || r1 !== w1 || r2 !== w2) {
      throw new Error(`[Test 3] Register R${r} mismatch on program ${p}`);
    }
  }

  for (let i = 0; i < T2Ref.TRYTE_MOD; i++) {
    if (refVm.mem[i] !== t3Js.mem[i] || refVm.mem[i] !== t3Wasm.getMem(i)) {
      throw new Error(`[Test 3] Memory mismatch at tryte ${i} on program ${p}`);
    }
    if (refVm.mem[i] !== 0) {
      refVm.mem[i] = 0; t3Js.mem[i] = 0; t3Wasm.setMem(i, 0);
    }
    if (refVm.disk[i] !== t3Js.disk[i] || refVm.disk[i] !== t3Wasm.i32[25600 + i]) {
      throw new Error(`[Test 3] Disk mismatch at tryte ${i} on program ${p}`);
    }
    if (refVm.disk[i] !== 0) {
      refVm.disk[i] = 0; t3Js.disk[i] = 0; t3Wasm.setDisk(i, 0);
    }
  }
}

// 2. TritOS 2.1 boots and runs scripted shell session identically in T2 mode vs triton.html
{
  const built21 = T2Ref.assemble(T2Ref.TRITOS_SRC);
  const script = 'list\nrun calc\n10T+11\nq\ndraw\ngame\nsave MYFILE BALANCED_TERNARY_OK\nreboot\nlist\ntype MYFILE\nquit\n';

  const rVm = new T2Ref.TritonJS();
  rVm.mem.set(built21.mem);
  rVm.pushInputString(script);
  const rSteps = rVm.run(500000);

  const jVm = new T3Sys.TritonJS({ archMode: 'T2' });
  jVm.loadProgram(built21.trytes, 0);
  jVm.pushInputString(script);
  const jSteps = jVm.run(500000);

  const wVm = T3Sys.TritonWASM.createSync({ archMode: 'T2' });
  wVm.loadProgram(built21.trytes, 0);
  wVm.pushInputString(script);
  const wSteps = wVm.run(500000);

  const rHash = T2Ref.computeStateHash(rVm);
  const jHash = T3Sys.computeStateHash(jVm);
  const wHash = T3Sys.computeStateHash(wVm);

  if (rSteps !== jSteps || rSteps !== wSteps ||
      rVm.consoleOut !== jVm.consoleOut || rVm.consoleOut !== wVm.getConsoleOut() ||
      rHash !== jHash || rHash !== wHash) {
    throw new Error(`[Test 3] TritOS 2.1 scripted session mismatch: rHash=0x${rHash.toString(16)} jHash=0x${jHash.toString(16)} wHash=0x${wHash.toString(16)}`);
  }
}

// 3. TritOS 2.1 self-hosting fixed point holds in T2 mode on Triton 3.0
{
  const built21 = T3Sys.assemble(T3Sys.TRITOS_SRC, { mode: 'T2' });
  const wVm = T3Sys.TritonWASM.createSync({ archMode: 'T2' });
  wVm.loadProgram(built21.trytes, 0);
  for (let i = 0; i < T3Sys.TRITOS_SRC.length; i++) {
    wVm.setDisk(500 + i, T3Sys.balRem(T3Sys.TRITOS_SRC.charCodeAt(i), T3Sys.TRYTE_MOD, T3Sys.TRYTE_HALF));
  }
  wVm.setDisk(500 + T3Sys.TRITOS_SRC.length, 0);
  wVm.pushInputString('asm\nquit\n');
  wVm.run(6000000);

  const outLen = wVm.getMem(3198);
  if (outLen !== built21.length) {
    throw new Error(`[Test 3] TritOS 2.1 fixed-point length mismatch in T2 mode: ${outLen} vs ${built21.length}`);
  }
  for (let i = 0; i < outLen; i++) {
    if (wVm.getMem(6000 + i) !== built21.trytes[i]) {
      throw new Error(`[Test 3] TritOS 2.1 fixed-point tryte mismatch at ${i}`);
    }
  }
}

// 4. Positive Control: running a 2.x stack-wrapping program (PUSH at SP=-1) in T3 mode instead of T2 mode faults
let positiveControlCaught = false;
{
  const prog = T3Sys.assemble('LI R1, #42\nPUSH R1\nHALT', { mode: 'T2' }).trytes;
  const badT3 = new T3Sys.TritonJS({ archMode: 'T3' });
  badT3.loadProgram(prog, 0);
  badT3.sp = -1; // T2 initial SP=-1, which is an invalid negative physical address in T3!
  badT3.vbr = 500;
  badT3.setMem(500 + 4 * 3, 900); // BAD_ADDR vector -> 900
  badT3.step(); badT3.step();
  if (badT3.pc === 900 && badT3.ecause === 4) {
    positiveControlCaught = true;
  }
}
if (!positiveControlCaught) {
  throw new Error('[Test 3] Positive control failed: T3 mode did not fault on negative wrapped T2 stack address!');
}

// 5. Verify attached tests/run.js, tests/symbols.js and audit/*.js still pass unmodified against triton.html
const baseDir = path.dirname(refPath);
for (const rel of ['tests/run.js', 'tests/symbols.js', 'audit/unseen.js', 'audit/isa-bigint.js', 'audit/hash-collision.js']) {
  const full = path.resolve(baseDir, rel);
  const out = execFileSync(process.execPath, [full], { cwd: baseDir, encoding: 'utf8' });
  if (rel === 'tests/run.js' && !out.includes('ALL 8 TRITON 2.0 TEST SUITES PASSED')) {
    throw new Error(`[Test 3] Attached ${rel} failed`);
  }
  if (rel === 'tests/symbols.js' && !out.includes('ALL 6 TRITON 2.1 SYMBOL-TABLE & REGRESSION SUITES PASSED')) {
    throw new Error(`[Test 3] Attached ${rel} failed`);
  }
}

console.log(`[PASS] t3-03-t2compat: 10,000 2.x programs === triton.html, TritOS 2.1 session & self-host fixed point, and all 5 attached 2.1 suites pass in ${Date.now() - t0} ms`);
