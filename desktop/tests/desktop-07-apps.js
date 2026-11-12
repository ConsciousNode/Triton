'use strict';
const { loadHtmlModule, makeRng } = require('./t3-common.js');

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const vm = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);

  // 1. Clock advances with virtual clock
  const clk0 = vm.mem[196830 + 2000] + vm.mem[196830 + 2001] * 19683;
  vm.run(50000);
  const clk1 = vm.mem[196830 + 2000] + vm.mem[196830 + 2001] * 19683;
  if (clk1 <= clk0) throw new Error('Clock did not advance');

  // 2. Editor saves typed text
  for (const c of 'RUN 1\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(280000);
  for (const c of 'HELLO TRITOS!') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(150000);
  let editorSaved = '';
  for (let off = 7100; off < 7800; off += 16) {
    if (vm.mem[off] === 78 && vm.mem[off+1] === 79 && vm.mem[off+2] === 84 && vm.mem[off+3] === 69) {
      const lba = vm.mem[off+9], len = vm.mem[off+12];
      editorSaved = String.fromCharCode(...vm.disk.slice(lba * 729, lba * 729 + len));
    }
  }
  if (editorSaved !== 'HELLO TRITOS!') throw new Error('Editor saved mismatch: ' + editorSaved);

  // 3. Paint saves drawn stroke pixels
  const cx = vm.mem[8910], cy = vm.mem[8911];
  vm.pushMouseEvent(150 - cx, 472 - cy, 1);
  vm.pushMouseEvent(0, 0, 0);
  vm.run(280000);
  const cx2 = vm.mem[8910], cy2 = vm.mem[8911];
  vm.pushMouseEvent(270 - cx2, 180 - cy2, 1);
  vm.pushMouseEvent(0, 0, 0);
  vm.run(80000);
  vm.pushKeyEvent('S'.charCodeAt(0), 0);
  vm.run(150000);
  let strokePx = 0;
  for (let off = 7100; off < 7800; off += 16) {
    if (vm.mem[off] === 65 && vm.mem[off+1] === 82 && vm.mem[off+2] === 84) {
      const lba = vm.mem[off+9];
      strokePx = vm.disk[lba * 729 + 10 * 64 + 9];
    }
  }
  if (strokePx !== 364) throw new Error('Paint saved pixel mismatch: ' + strokePx);

  // 4. Calculator: 100 random balanced-ternary expressions checked against BigInt oracle
  const cx3 = vm.mem[8910], cy3 = vm.mem[8911];
  vm.pushMouseEvent(354 - cx3, 472 - cy3, 1);
  vm.pushMouseEvent(0, 0, 0);
  vm.run(280000);
  const calcTask = vm.mem[8909];
  const calcUbase = (10 + calcTask * 2) * 19683;
  // Isolate Calculator task during 100-expression batch so timer only runs Calculator
  vm.mem[6000 + 42] = 0;
  vm.mem[6064 + 42] = 0;
  vm.mem[6128 + 42] = 0;
  vm.mem[6192 + 42] = 0;

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
    vm.run(35000);
    const actual = BigInt(vm.mem[calcUbase + 2000] + vm.mem[calcUbase + 2001] * 19683 + vm.mem[calcUbase + 2002] * 387420489);
    const ba = T.ternaryStrToBigInt(sa);
    const bb = T.ternaryStrToBigInt(sb);
    const expected = op === '+' ? ba + bb : (op === '-' ? ba - bb : ba * bb);
    if (actual !== expected) {
      throw new Error('Calc mismatch on ' + expr + ': got ' + actual + ', expected ' + expected);
    }
  }

  return { name: '07-apps', status: 'PASS', editorSaved, paintStrokePx: strokePx, calcExpressionsVerified: 100 };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
