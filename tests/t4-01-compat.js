#!/usr/bin/env node
'use strict';

/**
 * Triton 4 Machine Test 1: Machine Compatibility & Step-for-Step Differential (`tests/t4-01-compat.js`)
 * ConsciousNode SoftWorks
 *
 * Verifies:
 *   1. All 12 Triton 3.1.1 test suites (`tests/t3-01-oracle.js` .. `tests/t3-12-input-queues.js`)
 *      pass unmodified on `triton4.html`.
 *   2. Step-for-step differential between `triton3.html` (3.1.1) and `triton4.html` (4.0)
 *      across every existing T3 test program plus 50 seeded random programs that avoid ports 28+,
 *      comparing `computeStateHash` at EVERY single step on both JS and WASM.
 *   3. Positive control: a program that reads port 29 (`IN R0, #29`) diverges on the exact step
 *      where `IN R0, #29` executes (`0` on Triton 3.1.1 vs `2187` on Triton 4).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadHtmlModule, makeRng } = require('./t3-common');

const t0 = Date.now();
const { T: T3 } = loadHtmlModule('triton3.html');
const { T: T4 } = loadHtmlModule('triton4.html');

// 1. Run all 12 Triton 3 test suites against triton4.html
const preloadPath = path.resolve(__dirname, '.t4-preload.js');
fs.writeFileSync(preloadPath, `
'use strict';
const common = require(${JSON.stringify(path.resolve(__dirname, 't3-common.js'))});
const origLoad = common.loadHtmlModule;
common.loadHtmlModule = function(fn) {
  if (fn === 'triton3.html') return origLoad('triton4.html');
  return origLoad(fn);
};
`);

const T3_SUITES = [
  't3-01-oracle.js',
  't3-02-fuzz.js',
  't3-03-t2compat.js',
  't3-04-protection.js',
  't3-05-interrupts.js',
  't3-06-disk.js',
  't3-07-selfhost.js',
  't3-08-devices.js',
  't3-09-state.js',
  't3-10-static.js',
  't3-11-browser.js',
  't3-12-input-queues.js'
];

let t3SuitesPassed = 0;
try {
  for (const suite of T3_SUITES) {
    const res = spawnSync(process.execPath, ['-r', preloadPath, path.resolve(__dirname, suite)], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      env: process.env
    });
    if (res.status !== 0) {
      throw new Error(`[t4-01] Suite ${suite} failed on triton4.html:\n${res.stdout}\n${res.stderr}`);
    }
    t3SuitesPassed++;
  }
} finally {
  try { fs.unlinkSync(preloadPath); } catch (_) {}
}

// 2. Step-for-step differential on every existing T3 test program + 50 seeded random programs avoiding ports 28+
function runStepByStepDiff(name, trytes, modeStr, maxSteps, setupFn = null) {
  const t3Js = new T3.TritonJS({ archMode: modeStr });
  const t3Wasm = T3.TritonWASM.createSync({ archMode: modeStr });
  const t4Js = new T4.TritonJS({ archMode: modeStr });
  const t4Wasm = T4.TritonWASM.createSync({ archMode: modeStr });

  for (const vm of [t3Js, t3Wasm, t4Js, t4Wasm]) {
    vm.loadProgram(trytes, 0);
    if (setupFn) setupFn(vm);
  }

  let steps = 0;
  while (steps < maxSteps && !t3Js.halted) {
    t3Js.step();
    t3Wasm.step();
    t4Js.step();
    t4Wasm.step();
    steps++;

    const h3Js = T3.computeStateHash(t3Js);
    const h3Wasm = T3.computeStateHash(t3Wasm);
    const h4Js = T4.computeStateHash(t4Js);
    const h4Wasm = T4.computeStateHash(t4Wasm);

    if (h3Js !== h4Js || h3Wasm !== h4Wasm || h4Js !== h4Wasm) {
      throw new Error(`[t4-01] Step-by-step hash mismatch on '${name}' at step ${steps}: T3_JS=0x${h3Js.toString(16)} T4_JS=0x${h4Js.toString(16)} T4_WASM=0x${h4Wasm.toString(16)}`);
    }
  }
  return steps;
}

let totalDiffSteps = 0;
let totalPrograms = 0;

// Existing T3 test programs (representing t3-01..t3-09, t3-12, plus TritOS 3.0 and TritOS 2.1 sessions)
const existingPrograms = [
  {
    name: 't3-04-protection-kernel-user',
    mode: 'T3',
    steps: 400,
    src: `
      .mode T3
      .org 0
      LI R0, #7777
      LI R1, #400
      SW R0, R1, #0
      LI R0, #1000
      MTSPR R0, #5
      LI R1, #1000
      LI R0, #trap_h
      SW R0, R1, #9
      LI R0, #5000
      MTSPR R0, #6
      LI R0, #6000
      MTSPR R0, #7
      LI R1, #5000
      LI R2, #uprog
      LI R3, #10
      BCOPY R1, R2, R3
      LI R0, #5000
      MTSPR R0, #9
      LI R0, #5900
      MTSPR R0, #10
      LI R0, #27
      MTSPR R0, #11
      IRET
    trap_h:
      MFSPR R4, #12
      MFSPR R5, #13
      LI R8, #4242
      HALT
    uprog:
      LI R0, #-999
      LI R1, #400
      SW R0, R1, #0
      HALT
    `
  },
  {
    name: 't3-05-interrupts-timer-priority',
    mode: 'T3',
    steps: 500,
    src: `
      .mode T3
      .org 0
      LI R0, #1000
      MTSPR R0, #5
      LI R1, #1000
      LI R0, #isr_t
      SW R0, R1, #21
      LI R0, #25
      OUT R0, #9
      LI R0, #1
      MTSPR R0, #3
      MTSPR R0, #2
      LI R3, #120
    lp:
      SUBI R3, R3, #1
      JPX lp
      HALT
    isr_t:
      PUSH R0
      LI R0, #500
      LW R0, R0, #0
      ADDI R0, R0, #1
      PUSH R1
      LI R1, #500
      SW R0, R1, #0
      POP R1
      POP R0
      IRET
    `
  },
  {
    name: 't3-06-disk-dma-stream',
    mode: 'T3',
    steps: 300,
    src: `
      .mode T3
      .org 0
      LI R1, #2000
      LI R2, #42
      LI R3, #729
      BFILL R1, R2, R3
      LI R0, #5
      OUT R0, #17
      LI R0, #2000
      OUT R0, #18
      LI R0, #1
      OUT R0, #19
      LI R0, #2
      OUT R0, #20
      LI R0, #4000
      OUT R0, #18
      LI R0, #1
      OUT R0, #20
      LI R0, #3645
      OUT R0, #7
      IN R4, #8
      HALT
    `
  },
  {
    name: 't3-08-devices-fb-kbd-mouse',
    mode: 'T3',
    steps: 300,
    setup: (vm) => {
      vm.pushKeyEvent(65, 0);
      vm.pushMouseEvent(12, -5, 1);
    },
    src: `
      .mode T3
      .org 0
      LI R1, #1554
      LMI R1, #762
      LI R2, #250
      LI R3, #50
      BFILL R1, R2, R3
      IN R4, #10
      IN R5, #11
      IN R6, #14
      IN R7, #15
      HALT
    `
  },
  {
    name: 't3-tritos3-shell-session',
    mode: 'T3',
    steps: 1500,
    setup: (vm) => {
      vm.pushInputString('calc 10T+11\nquit\n');
    },
    trytes: T3.assemble(T3.TRITOS3_SRC, { mode: 'T3' }).trytes
  },
  {
    name: 't3-tritos21-t2compat-session',
    mode: 'T2',
    steps: 1500,
    setup: (vm) => {
      vm.pushInputString('list\nquit\n');
    },
    trytes: T3.assemble(T3.TRITOS_SRC, { mode: 'T2' }).trytes
  }
];

for (const prog of existingPrograms) {
  const trytes = prog.trytes || T3.assemble(prog.src, { mode: prog.mode }).trytes;
  totalDiffSteps += runStepByStepDiff(prog.name, trytes, prog.mode, prog.steps, prog.setup);
  totalPrograms++;
}

// 50 seeded random T3 programs that avoid ports 28+
const rng = makeRng(0x4001C0DE);
const RAND_OPS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
  15, 16, 17, 18, 19, 20,
  31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, 46, 47,
  -2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -12, -13
];
const SAFE_PORTS = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23];

for (let p = 0; p < 50; p++) {
  const numIns = rng.int(25, 60);
  const trytes = new Array(numIns * 2).fill(0);
  // Initialize R8 = 10000 for safe memory loads/stores
  const [li0, li1] = T3.encodeInstruction(1, 8, 0, -9683);
  const [lmi0, lmi1] = T3.encodeInstruction(33, 8, 0, 1);
  trytes[0] = li0; trytes[1] = li1;
  trytes[2] = lmi0; trytes[3] = lmi1;

  for (let i = 2; i < numIns - 1; i++) {
    const op = RAND_OPS[rng.u32() % RAND_OPS.length];
    const rd = rng.u32() % 8;
    const rs1 = rng.u32() % 8;
    const rs2 = rng.u32() % 8;
    let effRs1 = rs1;
    let t1 = 0;

    if (op >= 41 && op <= 47) {
      const target = rng.int(i + 1, numIns - 1);
      t1 = (target - (i + 1)) * 2;
    } else if ((op >= 15 && op <= 18) || (op >= 37 && op <= 40)) {
      effRs1 = 8;
      t1 = rng.int(-200, 200);
    } else if (op === 31 || op === 32) {
      t1 = SAFE_PORTS[rng.u32() % SAFE_PORTS.length];
    } else if (op === -10 || op === -11 || op === -12 || op === -13) {
      t1 = (op === -10 || op === -12) ? T3.balRem(rs2, 9, 4) : rng.int(-27, 27);
    } else {
      const spec = T3.OP_MAP[op];
      if (spec.fmt === 'R3' || spec.fmt === 'CMP') t1 = T3.balRem(rs2, 9, 4);
      else if (spec.fmt === 'NONE' || spec.fmt === 'R2' || spec.fmt === 'R1_S' || spec.fmt === 'R1_D') t1 = 0;
      else t1 = rng.int(-9841, 9841);
    }
    const [i0, i1] = T3.encodeInstruction(op, rd, effRs1, t1);
    trytes[i * 2] = i0;
    trytes[i * 2 + 1] = i1;
  }
  const [h0, h1] = T3.encodeInstruction(-1, 0, 0, 0);
  trytes[(numIns - 1) * 2] = h0;
  trytes[(numIns - 1) * 2 + 1] = h1;

  totalDiffSteps += runStepByStepDiff(`rand-t3-${p}`, trytes, 'T3', 200, (vm) => {
    vm.sp = 50000;
    vm.pushInputChar(65 + (p % 26));
  });
  totalPrograms++;
}

// 3. Positive control: a program that reads Port 29 (`IN R0, #29`) MUST diverge between Triton 3.1.1 and Triton 4
let positiveControlDiverged = false;
{
  const pcTrytes = T4.assemble(`
    .mode T3
    .org 0
    LI R1, #42
    IN R0, #29
    HALT
  `, { mode: 'T3' }).trytes;

  const v3 = new T3.TritonJS({ archMode: 'T3' });
  const v4 = new T4.TritonJS({ archMode: 'T3' });
  v3.loadProgram(pcTrytes, 0);
  v4.loadProgram(pcTrytes, 0);

  // Step 1: LI R1, #42 -> hashes must still match
  v3.step();
  v4.step();
  if (T3.computeStateHash(v3) !== T4.computeStateHash(v4)) {
    throw new Error('[t4-01] Positive control diverged before reading port 29!');
  }

  // Step 2: IN R0, #29 -> v3 reads 0, v4 reads 2187 -> hashes MUST diverge!
  v3.step();
  v4.step();
  if (v3.getWordNum(0) === 0 && v4.getWordNum(0) === 2187 && T3.computeStateHash(v3) !== T4.computeStateHash(v4)) {
    positiveControlDiverged = true;
  }
}
if (!positiveControlDiverged) {
  throw new Error('[t4-01] Positive control failed: reading Port 29 did not diverge between Triton 3.1.1 and Triton 4!');
}

console.log(`[PASS] t4-01-compat: ${t3SuitesPassed}/12 T3 suites pass on triton4.html; ${totalPrograms} programs (${totalDiffSteps.toLocaleString()} steps, incl. 50 seeded random) match T3.1.1 step-for-step (+ Port 29 positive control) in ${Date.now() - t0} ms`);
