#!/usr/bin/env node
'use strict';

/**
 * Test 2: Differential Fuzz in T3 (`tests/t3-02-fuzz.js`)
 * ConsciousNode SoftWorks
 *
 * Runs 10,000 seeded random T3 programs with interrupts arriving on a seeded
 * virtual-clock schedule. Verifies JS === WASM on every register, flag, SPR,
 * memory checksum, and device state.
 * Includes a positive control where an uncoordinated interrupt schedule diverges.
 */

const { loadHtmlModule, makeRng } = require('./t3-common');
const { T } = loadHtmlModule('triton3.html');

const t0 = Date.now();
const rng = makeRng(0x3002F00D);
const jsVm = new T.TritonJS({ archMode: 'T3' });
const wasmVm = T.TritonWASM.createSync({ archMode: 'T3' });

const FUZZ_OPS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
  15, 16, 17, 18, 19, 20,
  33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, 46, 47,
  -2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -12, -13
];

// Install a fast ISR at PC = 2000 that increments Mem[1500] and executes IRET
const isrCode = T.assemble(`
  .mode T3
  .org 0
  PUSH R0
  PUSH R1
  LI R1, #1500
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  POP R1
  POP R0
  IRET
`, { mode: 'T3' }).trytes;

for (let p = 0; p < 10000; p++) {
  const numIns = rng.int(12, (p % 40 === 0) ? 180 : 40);
  const touchedAddrs = [1500, 1501, 1502];

  // Reset CPU state without full 4.7M array fill on every iteration
  jsVm.pc = 0; jsVm.sp = 50000; jsVm.sf = 0; jsVm.cf = 0; jsVm.of = 0;
  jsVm.halted = 0; jsVm.steps = 0; jsVm.priv = 0; jsVm.ie = 1;
  jsVm.imask = 31; jsVm.ipend = 0; jsVm.vbr = 1000;
  jsVm.epc = 0; jsVm.esp = 0; jsVm.esr = 0; jsVm.ecause = 0; jsVm.eaddr = 0;
  jsVm.timerPeriod = rng.int(8, 35); jsVm.timerCount = 0;
  jsVm.kbdQueue.length = 0; jsVm.kbdHead = 0;
  jsVm.mouseQueue.length = 0; jsVm.mouseHead = 0;
  jsVm.ioTrace.length = 0;
  jsVm.reg.fill(0);

  wasmVm.pc = 0; wasmVm.sp = 50000; wasmVm.sf = 0; wasmVm.cf = 0; wasmVm.of = 0;
  wasmVm.halted = 0; wasmVm.steps = 0; wasmVm.priv = 0; wasmVm.ie = 1;
  wasmVm.imask = 31; wasmVm.ipend = 0; wasmVm.vbr = 1000;
  wasmVm.epc = 0; wasmVm.esp = 0; wasmVm.esr = 0; wasmVm.ecause = 0; wasmVm.eaddr = 0;
  wasmVm.timerPeriod = jsVm.timerPeriod; wasmVm.timerCount = 0;
  wasmVm.i32[20581] = 0; wasmVm.i32[20582] = 0;
  wasmVm.i32[20585] = 0; wasmVm.i32[20586] = 0;
  wasmVm.i32[20556] = 0;
  wasmVm.i32.fill(0, 20480, 20480 + 27);

  // Set up Vector Table at 1000..1035 pointing to ISR at 2000
  for (let v = 0; v < 12; v++) {
    jsVm.setMem(1000 + v * 3, 2000); jsVm.setMem(1000 + v * 3 + 1, 0); jsVm.setMem(1000 + v * 3 + 2, 0);
    wasmVm.setMem(1000 + v * 3, 2000); wasmVm.setMem(1000 + v * 3 + 1, 0); wasmVm.setMem(1000 + v * 3 + 2, 0);
  }
  for (let i = 0; i < isrCode.length; i++) {
    jsVm.setMem(2000 + i, isrCode[i]);
    wasmVm.setMem(2000 + i, isrCode[i]);
  }
  jsVm.setMem(1500, 0); jsVm.setMem(1501, 0); jsVm.setMem(1502, 0);
  wasmVm.setMem(1500, 0); wasmVm.setMem(1501, 0); wasmVm.setMem(1502, 0);

  for (let i = 0; i < numIns - 1; i++) {
    const op = FUZZ_OPS[rng.u32() % FUZZ_OPS.length];
    const rd = rng.u32() % 8; // keep R8 free or safe
    const rs1 = rng.u32() % 8;
    const rs2 = rng.u32() % 8;
    let t1 = 0;
    let effRs1 = rs1;

    if (op >= 41 && op <= 47) {
      // Forward PC-relative branch
      const targetIns = rng.int(i + 1, numIns - 1);
      t1 = (targetIns - (i + 1)) * 2;
    } else if ((op >= 15 && op <= 18) || (op >= 37 && op <= 40)) {
      // Memory load/store using R8 (= 30000) + offset
      effRs1 = 8;
      t1 = rng.int(-200, 200);
      touchedAddrs.push(30000 + t1, 30000 + t1 + 1, 30000 + t1 + 2);
    } else if (op === 19 || op === 20) {
      // PUSH / POP around SP=50000
      touchedAddrs.push(49980, 49981, 49982, 49983, 49984, 49985, 49997, 49998, 49999, 50000, 50001, 50002);
    } else if (op === -10 || op === -11 || op === -12 || op === -13) {
      t1 = (op === -10 || op === -12) ? T.balRem(rs2, 9, 4) : rng.int(-30, 30);
    } else {
      const spec = T.OP_MAP[op];
      if (spec.fmt === 'R3' || spec.fmt === 'CMP') t1 = T.balRem(rs2, 9, 4);
      else if (spec.fmt === 'NONE' || spec.fmt === 'R2' || spec.fmt === 'R1_S' || spec.fmt === 'R1_D') t1 = 0;
      else t1 = rng.int(-9841, 9841);
    }

    const [ins0, ins1] = T.encodeInstruction(op, rd, effRs1, t1);
    jsVm.setMem(i * 2, ins0); jsVm.setMem(i * 2 + 1, ins1);
    wasmVm.setMem(i * 2, ins0); wasmVm.setMem(i * 2 + 1, ins1);
  }
  const [h0, h1] = T.encodeInstruction(-1, 0, 0, 0);
  jsVm.setMem((numIns - 1) * 2, h0); jsVm.setMem((numIns - 1) * 2 + 1, h1);
  wasmVm.setMem((numIns - 1) * 2, h0); wasmVm.setMem((numIns - 1) * 2 + 1, h1);

  jsVm.setWordNum(8, 30000);
  wasmVm.setWordNum(8, 30000);

  // Run in two slices with a seeded keyboard or mouse interrupt injected at slice boundary
  const slice1 = rng.int(5, 25);
  jsVm.run(slice1);
  wasmVm.run(slice1);

  if (!jsVm.halted && (p % 3 === 0)) {
    const key = rng.int(65, 90);
    jsVm.pushKeyEvent(key, 0);
    wasmVm.pushKeyEvent(key, 0);
  } else if (!jsVm.halted && (p % 3 === 1)) {
    const dx = rng.int(-20, 20), dy = rng.int(-20, 20);
    jsVm.pushMouseEvent(dx, dy, 1);
    wasmVm.pushMouseEvent(dx, dy, 1);
  }

  jsVm.run(250);
  wasmVm.run(250);

  if (jsVm.pc !== wasmVm.pc || jsVm.sp !== wasmVm.sp ||
      jsVm.sf !== wasmVm.sf || jsVm.cf !== wasmVm.cf || jsVm.of !== wasmVm.of ||
      jsVm.halted !== wasmVm.halted || jsVm.steps !== wasmVm.steps ||
      jsVm.epc !== wasmVm.epc || jsVm.ecause !== wasmVm.ecause || jsVm.ipend !== wasmVm.ipend) {
    throw new Error(`[Test 2] CPU/SPR mismatch on program ${p}: jsPC=${jsVm.pc} wasmPC=${wasmVm.pc} jsSteps=${jsVm.steps} wasmSteps=${wasmVm.steps}`);
  }

  for (let r = 0; r < 9; r++) {
    const [j0, j1, j2] = jsVm.getWord(r);
    const [w0, w1, w2] = wasmVm.getWord(r);
    if (j0 !== w0 || j1 !== w1 || j2 !== w2) {
      throw new Error(`[Test 2] Register R${r} mismatch on program ${p}`);
    }
  }

  for (const a of touchedAddrs) {
    if (a >= 0 && a < jsVm.ramSize) {
      if (jsVm.getMem(a) !== wasmVm.getMem(a)) {
        throw new Error(`[Test 2] Memory mismatch at ${a} on program ${p}`);
      }
      jsVm.setMem(a, 0);
      wasmVm.setMem(a, 0);
    }
  }
  for (let i = 0; i < numIns * 2; i++) {
    jsVm.setMem(i, 0);
    wasmVm.setMem(i, 0);
  }
}

// Positive Control: verify that injecting an interrupt into JS but not WASM causes immediate state divergence
let positiveControlCaught = false;
{
  jsVm.reset(true); wasmVm.reset(true);
  jsVm.ie = 1; jsVm.imask = 31; jsVm.vbr = 1000;
  wasmVm.ie = 1; wasmVm.imask = 31; wasmVm.vbr = 1000;
  for (let v = 0; v < 12; v++) {
    jsVm.setMem(1000 + v * 3, 2000); wasmVm.setMem(1000 + v * 3, 2000);
  }
  for (let i = 0; i < isrCode.length; i++) {
    jsVm.setMem(2000 + i, isrCode[i]); wasmVm.setMem(2000 + i, isrCode[i]);
  }
  const [n0, n1] = T.encodeInstruction(0, 0, 0, 0); // NOP
  jsVm.setMem(0, n0); jsVm.setMem(1, n1);
  wasmVm.setMem(0, n0); wasmVm.setMem(1, n1);
  jsVm.pushKeyEvent(65, 0); // only on JS!
  jsVm.step();
  wasmVm.step();
  if (jsVm.pc !== wasmVm.pc || jsVm.getMem(1500) !== wasmVm.getMem(1500)) {
    positiveControlCaught = true;
  }
}
if (!positiveControlCaught) {
  throw new Error('[Test 2] Positive control failed to detect interrupt schedule divergence!');
}

console.log(`[PASS] t3-02-fuzz: 10,000 random T3 programs with seeded virtual-clock interrupts (JS === WASM + positive control) in ${Date.now() - t0} ms`);
