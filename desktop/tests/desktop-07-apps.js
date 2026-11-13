'use strict';
const { loadHtmlModule, makeRng, readFbString, readDiskFileString, readDiskFileTrytes, makeMouseTracker } = require('./t3-common.js');

function readClockDec(vm, T) {
  const s = readFbString(vm, T, 561, 32, 10, -320).replace(/[^0-9]/g, '');
  return s ? parseInt(s, 10) : 0;
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const vm = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);
  const mouse = makeMouseTracker(vm);

  // 1. Clock advances on MMIO framebuffer with virtual clock
  const clk0 = readClockDec(vm, T);
  vm.run(50000);
  const clk1 = readClockDec(vm, T);
  if (clk1 <= clk0) throw new Error('Clock did not advance on MMIO framebuffer');

  // 2. Editor saves typed text to disk ("NOTE")
  for (const c of 'RUN 1\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(280000);
  for (const c of 'HELLO TRITOS!\x13') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(150000);
  const editorSaved = readDiskFileString(vm, T, 'NOTE');
  if (editorSaved !== 'HELLO TRITOS!') throw new Error('Editor saved mismatch: ' + editorSaved);

  // 3. Paint saves drawn stroke pixels to disk ("ART")
  mouse.click(150, 472, 280000);
  mouse.click(270, 180, 80000);
  vm.pushKeyEvent('S'.charCodeAt(0), 0);
  vm.run(150000);
  const artTrytes = readDiskFileTrytes(vm, T, 'ART');
  const strokePx = artTrytes ? artTrytes[10 * 64 + 9] : 0;
  if (strokePx !== 364) throw new Error('Paint saved pixel mismatch: ' + strokePx);

  // 4. Calculator: 100 random balanced-ternary expressions checked via MMIO framebuffer readback
  //    while ALL other tasks (Clock, Terminal, Editor, Paint) remain running and preempting!
  mouse.click(354, 472, 280000);
  const rng = makeRng(0x98765432);
  const ops = ['+', '-', '*'];
  for (let i = 0; i < 100; i++) {
    const a = rng.int(-400, 400);
    const b = rng.int(-400, 400);
    const op = ops[i % ops.length];
    const sa = T.intToTernaryStr(a, 7);
    const sb = T.intToTernaryStr(b, 7);
    const expr = sa + op + sb + '=';
    for (const c of expr) vm.pushKeyEvent(c.charCodeAt(0), 0);
    vm.run(60000);
    // Read Calculator result directly from MMIO framebuffer at screen (517, 123), bg = -350
    const dispStr = readFbString(vm, T, 517, 123, 18, -350).replace(/\?/g, '').trim();
    const actual = T.ternaryStrToBigInt(dispStr);
    const ba = T.ternaryStrToBigInt(sa);
    const bb = T.ternaryStrToBigInt(sb);
    const expected = op === '+' ? ba + bb : (op === '-' ? ba - bb : ba * bb);
    if (actual !== expected) {
      throw new Error('Calc MMIO mismatch on ' + expr + ': got ' + actual + ' (' + dispStr + '), expected ' + expected);
    }
  }

  return { name: '07-apps', status: 'PASS', editorSaved, paintStrokePx: strokePx, calcExpressionsVerified: 100 };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
