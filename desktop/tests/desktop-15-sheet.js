'use strict';
const { loadHtmlModule, makeRng, readFbString, readDiskFileString, makeMouseTracker } = require('./t3-common.js');

function evalSheetRef(raw, ignorePrecedence = false) {
  const a1 = parseInt(raw.A1, 10), b1 = parseInt(raw.B1, 10), c1 = parseInt(raw.C1, 10);
  const a2 = parseInt(raw.A2, 10), b2 = parseInt(raw.B2, 10);
  const c2Val = ignorePrecedence ? (a1 + b1) * c1 : a1 + b1 * c1;
  const d1Val = Math.trunc((a1 - a2) / b2);
  const d2Val = a1 + b1 + c1 + a2 + b2 + c2Val;
  const e1Val = Math.max(a1, b1, a2, b2) - Math.min(a1, b1, a2, b2);
  return [
    'A1:' + a1 + '=' + a1,
    'B1:' + b1 + '=' + b1,
    'C1:' + c1 + '=' + c1,
    'D1:=(A1-A2)/B2=' + d1Val,
    'E1:=MAX(A1:B2)-MIN(A1:B2)=' + e1Val,
    'A2:' + a2 + '=' + a2,
    'B2:' + b2 + '=' + b2,
    'C2:=A1+B1*C1=' + c2Val,
    'D2:=SUM(A1:C2)=' + d2Val
  ].join('\n') + '\n';
}

function runSheetScenario(T, perturbSheetPrec = false, count = 100) {
  const rng = makeRng(0x5EE7100);
  let matched = 0;
  let vm = null;

  for (let s = 0; s < count; s++) {
    // Refresh TritonWASM every 14 sheets to stay within TritonWASM 2,048-key static buffer while keeping WASM speed
    if (s % 14 === 0) {
      vm = T.TritonWASM.createSync({ archMode: 'T3' });
      T.bootTritOSDesktop(vm, false, perturbSheetPrec ? { perturbSheetPrec: true } : {});
      vm.run(300000);
      const mouse = makeMouseTracker(vm);
      mouse.click(625, 472, 350000);
    }
    const a1 = rng.int(2, 50), b1 = rng.int(2, 20), c1 = rng.int(2, 15), a2 = rng.int(-30, 30), b2 = rng.int(1, 10);
    const raw = {
      A1: String(a1),
      B1: String(b1),
      C1: String(c1),
      A2: String(a2),
      B2: String(b2),
      C2: '=A1+B1*C1',
      D1: '=(A1-A2)/B2',
      D2: '=SUM(A1:C2)',
      E1: '=MAX(A1:B2)-MIN(A1:B2)'
    };
    let script = '\x0e';
    for (const [cell, expr] of Object.entries(raw)) script += '@' + cell + ' ' + expr + '\n';
    script += '\x13';
    for (let i = 0; i < script.length; i++) vm.pushKeyEvent(script.charCodeAt(i), 0);
    vm.run(350000);
    const saved = readDiskFileString(vm, T, 'SHEET');
    const exp = evalSheetRef(raw, false);
    if (saved === exp) matched++;
  }

  // Test circular reference (#CYCLE!) and division by zero (#DIV/0!)
  const errVm = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(errVm, false);
  errVm.run(300000);
  const errMouse = makeMouseTracker(errVm);
  errMouse.click(625, 472, 350000);
  const errScript = '\x0e@A1 =B1+1\n@B1 =A1+1\n@A2 =100/0\n\x13';
  for (let i = 0; i < errScript.length; i++) errVm.pushKeyEvent(errScript.charCodeAt(i), 0);
  errVm.run(450000);
  const errSaved = readDiskFileString(errVm, T, 'SHEET') || '';
  // Check MMIO framebuffer at Sheet window (80, 28) -> client origin (81, 40)
  // Row 0 (y = 28 -> screen y = 68): B1 at client x=26+48=74 -> screen x=155; Row 1 (y = 40 -> screen y = 80): A2 at client x=26 -> screen x=107, bg = -315
  const fbCycle = readFbString(errVm, T, 155, 68, 7, -315);
  const fbDiv0 = readFbString(errVm, T, 107, 80, 7, -315);

  return {
    matchedSheets: matched,
    totalSheets: count,
    errSaved: errSaved.trim(),
    fbCycle,
    fbDiv0
  };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const res = runSheetScenario(T, false, 100);
  if (res.matchedSheets !== 100) {
    throw new Error('Expected 100/100 random sheets to match JS reference, got ' + res.matchedSheets);
  }
  if (!res.errSaved.includes('A1:=B1+1=#CYCLE!') || !res.errSaved.includes('A2:=100/0=#DIV/0!')) {
    throw new Error('Sheet error detection failed in saved file: ' + res.errSaved);
  }
  if (res.fbCycle !== '#CYCLE!' || res.fbDiv0 !== '#DIV/0!') {
    throw new Error('Sheet error MMIO framebuffer check failed: cycle=' + res.fbCycle + ' div0=' + res.fbDiv0);
  }
  return { name: '15-sheet-spreadsheet', status: 'PASS', ...res };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest, runSheetScenario };
