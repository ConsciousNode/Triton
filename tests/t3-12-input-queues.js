#!/usr/bin/env node
'use strict';

/**
 * Test 12: Input queues never die (`tests/t3-12-input-queues.js`)
 * ConsciousNode SoftWorks — Triton 3.1.1
 *
 * The bug (found in the App 11 audit, reproduced on Kham's laptop 2026-11-13):
 * Triton 3.1's WASM keyboard and mouse queues were linear arrays of 2,048 slots
 * whose head/tail counters never reset, so after 2,048 events per boot all input
 * was silently dropped forever. TritonJS used unbounded arrays instead, so the two
 * cores disagreed after event 2,048.
 *
 * 3.1.1 contract (both cores, checked here):
 *   - Keyboard and mouse queues are rings that hold up to 2,048 *pending* events.
 *     Events pushed while 2,048 are pending are dropped (backpressure, both cores).
 *   - A guest that keeps draining can receive unlimited events per boot.
 *   - The console input queue holds up to 69,632 pending chars and recycles when
 *     drained, so it never dies either.
 *   - Snapshot capture/restore preserves pending events and their order.
 *   - Head/tail counters survive i32 wrap (2^31) on the WASM core.
 *
 * Checks:
 *   1. 12,000 key events (6,000 down/up pairs) streamed in bursts of 100 to a polling
 *      guest: every event logged in order, JS === WASM.
 *   2. 12,000 mouse events: count and checksums, JS === WASM.
 *   3. 80,000 console chars (> 69,632): count and checksum, JS === WASM.
 *   4. Backpressure: 3,000 events pushed without draining → exactly 2,048 accepted on
 *      both cores; after draining, input works again.
 *   5. Snapshot mid-stream after the ring has wrapped: restored pending queues match.
 *   6. WASM counters started at 2^31 − 10: 50 events still delivered in order.
 *   7. Positive control: the 3.1 linear push (tail < 2048, never reset) is re-installed
 *      on a WASM instance and check 1 must fail on it.
 */

const { loadHtmlModule } = require('./t3-common');
const { T } = loadHtmlModule('triton3.html');

const t0 = Date.now();

// Polling guest: drains keyboard (ports 10..12), mouse (13..16) and console (0..1).
// Key events are logged two trytes each starting at 3000 (code, type).
// Counters/checksums are words (3 trytes) at 2000.. (see .equ list).
const guestSrc = `
  .mode T3
  .equ BASE, 2000
  .equ KLOG, 3000
  .org 0
  LI R4, #BASE
  LI R5, #KLOG
lp:
  IN R0, #10
  CMPI R0, #0
  JZ mchk
  IN R1, #11
  IN R2, #12
  ST R1, R5, #0
  ST R2, R5, #1
  ADDI R5, R5, #2
  LW R0, R4, #0
  ADDI R0, R0, #1
  SW R0, R4, #0
  JMP lp
mchk:
  IN R0, #13
  CMPI R0, #0
  JZ cchk
  IN R1, #14
  IN R2, #15
  IN R3, #16
  LW R0, R4, #6
  ADDI R0, R0, #1
  SW R0, R4, #6
  LW R0, R4, #9
  ADD R0, R0, R1
  SW R0, R4, #9
  LW R0, R4, #18
  ADD R0, R0, R2
  ADD R0, R0, R3
  SW R0, R4, #18
  JMP lp
cchk:
  IN R0, #1
  CMPI R0, #0
  JZ lp
  IN R1, #0
  LW R0, R4, #12
  ADDI R0, R0, #1
  SW R0, R4, #12
  LW R0, R4, #15
  ADD R0, R0, R1
  SW R0, R4, #15
  JMP lp
`;
const built = T.assemble(guestSrc, { mode: 'T3' });

const KCNT = 2000, MCNT = 2006, MSUMX = 2009, CCNT = 2012, CSUM = 2015, MSUMYB = 2018, KLOG = 3000;

function word(vm, a) {
  return vm.getMem(a) + vm.getMem(a + 1) * 19683 + vm.getMem(a + 2) * 387420489;
}
function fresh() {
  const js = new T.TritonJS({ archMode: 'T3' });
  const wasm = T.TritonWASM.createSync({ archMode: 'T3' });
  js.loadProgram(built.trytes, 0);
  wasm.loadProgram(built.trytes, 0);
  return { js, wasm };
}
function pendingKbd(vm) {
  return vm instanceof T.TritonWASM ? (vm.i32[20582] - vm.i32[20581]) | 0 : vm.kbdQueue.length - vm.kbdHead;
}
function pendingMouse(vm) {
  return vm instanceof T.TritonWASM ? (vm.i32[20586] - vm.i32[20585]) | 0 : vm.mouseQueue.length - vm.mouseHead;
}
function pendingConsole(vm) {
  return vm instanceof T.TritonWASM ? (vm.i32[20555] - vm.i32[20554]) | 0 : vm.inputQueue.length - vm.inputHead;
}
function drain(vm) {
  for (let i = 0; i < 2000; i++) {
    if (pendingKbd(vm) === 0 && pendingMouse(vm) === 0 && pendingConsole(vm) === 0) {
      vm.run(200); // let the loop finish its last bookkeeping
      return;
    }
    vm.run(5000);
  }
  throw new Error('guest did not drain');
}

const keyCode = (i) => 32 + (i % 90);

// Check 1 helper: streams key events, returns the first problem or null.
function streamKeys(vm, pairs) {
  for (let b = 0; b < pairs; b += 50) {
    for (let i = b; i < Math.min(pairs, b + 50); i++) {
      vm.pushKeyEvent(keyCode(i), 0);
      vm.pushKeyEvent(keyCode(i), 1);
    }
    drain(vm);
  }
  const n = word(vm, KCNT);
  if (n !== pairs * 2) return `received ${n} of ${pairs * 2} key events`;
  for (let i = 0; i < pairs; i++) {
    const a = KLOG + i * 4;
    if (vm.getMem(a) !== keyCode(i) || vm.getMem(a + 1) !== 0 ||
        vm.getMem(a + 2) !== keyCode(i) || vm.getMem(a + 3) !== 1) {
      return `key log mismatch at pair ${i}`;
    }
  }
  return null;
}

const results = {};

// 1. Keyboard stream
{
  const { js, wasm } = fresh();
  const pairs = 6000;
  for (const [name, vm] of [['js', js], ['wasm', wasm]]) {
    const err = streamKeys(vm, pairs);
    if (err) throw new Error(`[Test 12.1] ${name}: ${err}`);
  }
  results.keyEvents = pairs * 2;
}

// 2. Mouse stream
{
  const { js, wasm } = fresh();
  const N = 12000;
  let sx = 0, syb = 0;
  for (let b = 0; b < N; b += 100) {
    for (let i = b; i < b + 100; i++) {
      const dx = (i % 21) - 10, dy = ((i * 7) % 17) - 8, btn = i % 8;
      sx += dx; syb += dy + btn;
      js.pushMouseEvent(dx, dy, btn); wasm.pushMouseEvent(dx, dy, btn);
    }
    drain(js); drain(wasm);
  }
  for (const [name, vm] of [['js', js], ['wasm', wasm]]) {
    if (word(vm, MCNT) !== N || word(vm, MSUMX) !== sx || word(vm, MSUMYB) !== syb) {
      throw new Error(`[Test 12.2] ${name}: mouse count/sums ${word(vm, MCNT)}/${word(vm, MSUMX)}/${word(vm, MSUMYB)} expected ${N}/${sx}/${syb}`);
    }
  }
  results.mouseEvents = N;
}

// 3. Console stream past the old 69,632-char lifetime
{
  const { js, wasm } = fresh();
  const N = 80000;
  let sum = 0;
  for (let b = 0; b < N; b += 1000) {
    for (let i = b; i < b + 1000; i++) {
      const c = 33 + (i % 90);
      sum += c;
      js.pushInputChar(c); wasm.pushInputChar(c);
    }
    drain(js); drain(wasm);
  }
  for (const [name, vm] of [['js', js], ['wasm', wasm]]) {
    if (word(vm, CCNT) !== N || word(vm, CSUM) !== sum) {
      throw new Error(`[Test 12.3] ${name}: console ${word(vm, CCNT)}/${word(vm, CSUM)} expected ${N}/${sum}`);
    }
    // pushInputChar also emits a key-down per char
    if (word(vm, KCNT) !== N) throw new Error(`[Test 12.3] ${name}: key mirror ${word(vm, KCNT)} expected ${N}`);
  }
  results.consoleChars = N;
}

// 4. Backpressure, then recovery
{
  const { js, wasm } = fresh();
  for (let i = 0; i < 3000; i++) {
    js.pushKeyEvent(65, 0); wasm.pushKeyEvent(65, 0);
    js.pushMouseEvent(1, 1, 0); wasm.pushMouseEvent(1, 1, 0);
  }
  for (const [name, vm] of [['js', js], ['wasm', wasm]]) {
    if (pendingKbd(vm) !== 2048 || pendingMouse(vm) !== 2048) {
      throw new Error(`[Test 12.4] ${name}: pending ${pendingKbd(vm)}/${pendingMouse(vm)} expected 2048/2048`);
    }
  }
  drain(js); drain(wasm);
  for (let i = 0; i < 10; i++) { js.pushKeyEvent(66, 0); wasm.pushKeyEvent(66, 0); }
  drain(js); drain(wasm);
  for (const [name, vm] of [['js', js], ['wasm', wasm]]) {
    if (word(vm, KCNT) !== 2058 || word(vm, MCNT) !== 2048) {
      throw new Error(`[Test 12.4] ${name}: after recovery ${word(vm, KCNT)}/${word(vm, MCNT)} expected 2058/2048`);
    }
  }
  results.backpressureAccepted = 2048;
}

// 5. Snapshot after the ring has wrapped, with events pending
{
  const { js, wasm } = fresh();
  for (let i = 0; i < 3000; i++) { js.pushKeyEvent(70, 0); wasm.pushKeyEvent(70, 0); }
  drain(js); drain(wasm);
  for (let i = 0; i < 300; i++) {
    js.pushKeyEvent(keyCode(i), i & 1); wasm.pushKeyEvent(keyCode(i), i & 1);
    js.pushMouseEvent(i % 5, -(i % 3), i % 8); wasm.pushMouseEvent(i % 5, -(i % 3), i % 8);
  }
  const snap = JSON.parse(JSON.stringify(T.captureSnapshot(js)));
  const r = fresh();
  T.restoreSnapshot(snap, r.js, r.wasm);
  for (const [name, vm] of [['js', r.js], ['wasm', r.wasm]]) {
    if (pendingKbd(vm) !== 300 || pendingMouse(vm) !== 300) {
      throw new Error(`[Test 12.5] ${name}: restored pending ${pendingKbd(vm)}/${pendingMouse(vm)} expected 300/300`);
    }
  }
  const before = word(r.js, KCNT);
  drain(r.js); drain(r.wasm);
  for (const [name, vm] of [['js', r.js], ['wasm', r.wasm]]) {
    for (let i = 0; i < 300; i++) {
      const a = KLOG + (before + i) * 2;
      if (vm.getMem(a) !== keyCode(i) || vm.getMem(a + 1) !== (i & 1)) {
        throw new Error(`[Test 12.5] ${name}: restored event ${i} out of order`);
      }
    }
  }
  if (T.computeStateHash(r.js) !== T.computeStateHash(r.wasm)) throw new Error('[Test 12.5] JS/WASM hash differ after restore + drain');
  results.snapshotPendingRestored = 300;
}

// 6. WASM counters across i32 wrap
{
  const { wasm } = fresh();
  const start = 2147483647 - 10;
  wasm.i32[20581] = start; wasm.i32[20582] = start;
  for (let i = 0; i < 50; i++) wasm.pushKeyEvent(keyCode(i), 0);
  if (pendingKbd(wasm) !== 50) throw new Error(`[Test 12.6] pending ${pendingKbd(wasm)} expected 50`);
  drain(wasm);
  if (word(wasm, KCNT) !== 50) throw new Error(`[Test 12.6] received ${word(wasm, KCNT)} expected 50`);
  for (let i = 0; i < 50; i++) {
    if (wasm.getMem(KLOG + i * 2) !== keyCode(i)) throw new Error(`[Test 12.6] event ${i} wrong across wrap`);
  }
  results.wrapAcross2e31 = true;
}

// 7. Positive control: 3.1's linear push must fail check 1
{
  const { wasm } = fresh();
  wasm.pushKeyEvent = function (code, isUp = 0) { // Triton 3.1 behaviour, verbatim logic
    let c = ((code + 9841) % 19683 + 19683) % 19683 - 9841; // balRem
    const tail = this.i32[20582];
    if (tail < 2048) {
      const base = 131072 + tail * 2;
      this.i32[base] = c;
      this.i32[base + 1] = isUp ? 1 : 0;
      this.i32[20582] = tail + 1;
      this.ipend |= 2;
    }
  };
  const err = streamKeys(wasm, 6000);
  if (!err) throw new Error('[Test 12.7] Positive control failed: the 3.1 linear queue passed check 1');
  results.positiveControl = err;
}

console.log(`[PASS] t3-12-input-queues: ${results.keyEvents.toLocaleString()} key events in order, ` +
  `${results.mouseEvents.toLocaleString()} mouse events, ${results.consoleChars.toLocaleString()} console chars (> 69,632), ` +
  `backpressure at 2,048 pending + recovery, snapshot restore of 300 pending after wrap, i32 counter wrap, ` +
  `JS === WASM (+ positive control: 3.1 queue "${results.positiveControl}") in ${Date.now() - t0} ms`);
