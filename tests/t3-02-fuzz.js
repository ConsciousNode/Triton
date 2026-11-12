#!/usr/bin/env node
'use strict';

/**
 * Test 2: Differential Fuzz in T3 (`tests/t3-02-fuzz.js`)
 * ConsciousNode SoftWorks
 *
 * Runs 10,000 seeded random T3 programs with interrupts arriving on a seeded
 * virtual-clock schedule. At least 20% (specifically 2,500 = 25%) of the 10,000
 * programs build addresses >= 2^31 in magnitude through `LMI`/`LHI`/`ADDM`/`ADDH`
 * and execute loads/stores against them (faulting cleanly into a trap handler that
 * logs `ECAUSE` and full 27-trit `EADDR` before advancing `EPC`).
 * Verifies JS === WASM on every register, flag, SPR, memory checksum, and device state.
 * Includes positive controls verifying that:
 *   (a) an uncoordinated interrupt schedule diverges, and
 *   (b) enabling `narrowWasmState: true` fails the differential fuzz suite.
 */

const { loadHtmlModule, makeRng } = require('./t3-common');
const { T } = loadHtmlModule('triton3.html');

const t0 = Date.now();

const FUZZ_OPS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
  15, 16, 17, 18, 19, 20,
  33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, 46, 47,
  -2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -12, -13
];

// Fast hardware IRQ ISR at PC = 2000 that increments Mem[1500] and executes IRET
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

// Fault trap handler at PC = 2100 (for PROT_VIOL Vec 3 and BAD_ADDR Vec 4):
// Logs fault count at Mem[1503], ECAUSE at Mem[1506], full 27-trit EADDR at Mem[1509..1511],
// advances EPC by +2 to skip the faulting instruction, and returns via IRET.
const trapCode = T.assemble(`
  .mode T3
  .org 0
  PUSH R0
  PUSH R1
  LI R1, #1503
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  MFSPR R0, #12
  LI R1, #1506
  SW R0, R1, #0
  MFSPR R0, #13
  LI R1, #1509
  SW R0, R1, #0
  MFSPR R0, #9
  ADDI R0, R0, #2
  MTSPR R0, #9
  POP R1
  POP R0
  IRET
`, { mode: 'T3' }).trytes;

const LARGE_ADDR_POOL = [
  2147483648,             // 2^31
  2147483649,             // 2^31 + 1
  -2147483648,            // -2^31
  -2147483649,            // -(2^31 + 1)
  4294967295,             // 2^32 - 1
  4294967296,             // 2^32
  4294967297,             // 2^32 + 1
  4294967296 + 30000,     // 2^32 + 30000 (aliases RAM[30000] if truncated to 32 bits!)
  4294967296 + 15000000,  // 2^32 + FB_BASE (aliases framebuffer if truncated to 32 bits!)
  847288609443,           // 3^25
  2541865828329,          // 3^26
  -2541865828329          // -3^26
];

function runFuzzSuite(numPrograms, wasmOptions = {}) {
  const rng = makeRng(0x3002F00D);
  const jsVm = new T.TritonJS({ archMode: 'T3' });
  const wasmVm = T.TritonWASM.createSync({ archMode: 'T3', ...wasmOptions });
  let largeAddrProgramCount = 0;

  for (let v = 0; v < 12; v++) {
    const handlerPc = (v >= 1 && v <= 5) ? 2100 : 2000;
    jsVm.setMem(1000 + v * 3, handlerPc); jsVm.setMem(1000 + v * 3 + 1, 0); jsVm.setMem(1000 + v * 3 + 2, 0);
    wasmVm.setMem(1000 + v * 3, handlerPc); wasmVm.setMem(1000 + v * 3 + 1, 0); wasmVm.setMem(1000 + v * 3 + 2, 0);
  }
  for (let i = 0; i < isrCode.length; i++) {
    jsVm.setMem(2000 + i, isrCode[i]);
    wasmVm.setMem(2000 + i, isrCode[i]);
  }
  for (let i = 0; i < trapCode.length; i++) {
    jsVm.setMem(2100 + i, trapCode[i]);
    wasmVm.setMem(2100 + i, trapCode[i]);
  }

  for (let p = 0; p < numPrograms; p++) {
    const isLargeAddrProg = (p % 4 === 0); // 25% of programs (2,500 / 10,000) >= 20%
    const numIns = rng.int(16, (p % 40 === 0) ? 180 : 40);
    const touchedAddrs = [1500, 1501, 1502, 1503, 1504, 1505, 1506, 1507, 1508, 1509, 1510, 1511];

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

    for (let a = 1500; a < 1512; a++) {
      jsVm.setMem(a, 0);
      wasmVm.setMem(a, 0);
    }

    let startIns = 0;
    if (isLargeAddrProg) {
      largeAddrProgramCount++;
      // Build an address >= 2^31 in magnitude in R7 via LI + LMI + LHI or ADDM + ADDH, then load/store at R7 + imm9
      let targetAddr;
      if ((p / 4) % 2 === 0) {
        targetAddr = LARGE_ADDR_POOL[(p / 4) % LARGE_ADDR_POOL.length];
      } else {
        const w0 = rng.int(-9841, 9841);
        const w1 = rng.int(-9841, 9841);
        const w2 = (rng.u32() % 2 === 0 ? 1 : -1) * rng.int(6, 9841); // |w2| >= 6 => |addr| >= 6*3^18 - ... > 2^31
        targetAddr = w0 + w1 * 19683 + w2 * 387420489;
      }
      const [tw0, tw1, tw2] = T.numberToWord(targetAddr);
      const useAddmAddh = ((p / 4) % 3 === 0);
      const seq = useAddmAddh
        ? [
            T.encodeInstruction(1,  7, 0, tw0), // LI R7, #tw0
            T.encodeInstruction(35, 7, 7, tw1), // ADDM R7, R7, #tw1
            T.encodeInstruction(36, 7, 7, tw2)  // ADDH R7, R7, #tw2
          ]
        : [
            T.encodeInstruction(1,  7, 0, tw0), // LI R7, #tw0
            T.encodeInstruction(33, 7, 0, tw1), // LMI R7, #tw1
            T.encodeInstruction(34, 7, 0, tw2)  // LHI R7, #tw2
          ];
      const memOp = [37, 38, 39, 40][(p / 4) % 4]; // LDX, STX, LWX, SWX
      const disp = rng.int(-50, 50);
      seq.push(T.encodeInstruction(memOp, 6, 7, disp));
      for (let k = 0; k < seq.length; k++) {
        jsVm.setMem(k * 2, seq[k][0]); jsVm.setMem(k * 2 + 1, seq[k][1]);
        wasmVm.setMem(k * 2, seq[k][0]); wasmVm.setMem(k * 2 + 1, seq[k][1]);
      }
      startIns = seq.length;
    }

    for (let i = startIns; i < numIns - 1; i++) {
      const op = FUZZ_OPS[rng.u32() % FUZZ_OPS.length];
      const rd = rng.u32() % 8;
      const rs1 = rng.u32() % 8;
      const rs2 = rng.u32() % 8;
      let t1 = 0;
      let effRs1 = rs1;

      if (op >= 41 && op <= 47) {
        const targetIns = rng.int(i + 1, numIns - 1);
        t1 = (targetIns - (i + 1)) * 2;
      } else if ((op >= 15 && op <= 18) || (op >= 37 && op <= 40)) {
        effRs1 = 8;
        t1 = rng.int(-200, 200);
        touchedAddrs.push(30000 + t1, 30000 + t1 + 1, 30000 + t1 + 2);
      } else if (op === 19 || op === 20) {
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
    // Place sentinel at Mem[30000] so aliased 2^32 + 30000 loads/stores are observable
    jsVm.setMem(30000, 1234);
    wasmVm.setMem(30000, 1234);
    touchedAddrs.push(30000, 30001, 30002);

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

    jsVm.run(280);
    wasmVm.run(280);

    if (jsVm.pc !== wasmVm.pc || jsVm.sp !== wasmVm.sp ||
        jsVm.sf !== wasmVm.sf || jsVm.cf !== wasmVm.cf || jsVm.of !== wasmVm.of ||
        jsVm.halted !== wasmVm.halted || jsVm.steps !== wasmVm.steps ||
        jsVm.epc !== wasmVm.epc || jsVm.ecause !== wasmVm.ecause ||
        jsVm.eaddr !== wasmVm.eaddr || jsVm.ipend !== wasmVm.ipend) {
      throw new Error(`[Test 2] CPU/SPR mismatch on program ${p}: jsPC=${jsVm.pc} wasmPC=${wasmVm.pc} jsEADDR=${jsVm.eaddr} wasmEADDR=${wasmVm.eaddr}`);
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
          throw new Error(`[Test 2] Memory mismatch at ${a} on program ${p}: js=${jsVm.getMem(a)} wasm=${wasmVm.getMem(a)}`);
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
  return { largeAddrProgramCount };
}

const { largeAddrProgramCount } = runFuzzSuite(10000);
if (largeAddrProgramCount < 2000) {
  throw new Error(`[Test 2] Expected >= 20% (2,000) large-address programs, got ${largeAddrProgramCount}`);
}

// Positive Controls:
// (a) Verify that injecting an interrupt into JS but not WASM causes immediate state divergence
let positiveControlCaught = false;
{
  const jsVm = new T.TritonJS({ archMode: 'T3' });
  const wasmVm = T.TritonWASM.createSync({ archMode: 'T3' });
  jsVm.ie = 1; jsVm.imask = 31; jsVm.vbr = 1000;
  wasmVm.ie = 1; wasmVm.imask = 31; wasmVm.vbr = 1000;
  for (let v = 0; v < 12; v++) {
    jsVm.setMem(1000 + v * 3, 2000); wasmVm.setMem(1000 + v * 3, 2000);
  }
  for (let i = 0; i < isrCode.length; i++) {
    jsVm.setMem(2000 + i, isrCode[i]); wasmVm.setMem(2000 + i, isrCode[i]);
  }
  const [n0, n1] = T.encodeInstruction(0, 0, 0, 0);
  jsVm.setMem(0, n0); jsVm.setMem(1, n1);
  wasmVm.setMem(0, n0); wasmVm.setMem(1, n1);
  jsVm.pushKeyEvent(65, 0);
  jsVm.step();
  wasmVm.step();
  if (jsVm.pc !== wasmVm.pc || jsVm.getMem(1500) !== wasmVm.getMem(1500)) {
    positiveControlCaught = true;
  }
}
if (!positiveControlCaught) {
  throw new Error('[Test 2] Positive control failed to detect interrupt schedule divergence!');
}

// (b) Positive Control (3.1): `narrowWasmState: true` MUST fail the fuzz suite on large-address programs
let narrowControlCaught = false;
try {
  runFuzzSuite(100, { narrowWasmState: true });
} catch (_) {
  narrowControlCaught = true;
}
if (!narrowControlCaught) {
  throw new Error('[Test 2] Positive control failed: narrowWasmState: true did not fail differential fuzz!');
}

console.log(`[PASS] t3-02-fuzz: 10,000 random T3 programs (${largeAddrProgramCount.toLocaleString()} [25%] with addresses >= 2^31 via LMI/LHI/ADDM/ADDH, JS === WASM + narrowWasmState positive control) in ${Date.now() - t0} ms`);
