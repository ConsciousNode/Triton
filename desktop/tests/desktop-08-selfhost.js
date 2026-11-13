'use strict';
const { loadHtmlModule, readFbString, readDiskFileTrytes, makeMouseTracker } = require('./t3-common.js');

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const vm = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);
  const mouse = makeMouseTracker(vm);

  // Launch Assembler App (App 4) via taskbar click at (286, 472)
  mouse.click(286, 472, 260000);

  // Press 'A' to assemble "DEMO" (complete 4,877-char source of App 5: Trit Calculator) on disk into "OUT" on disk
  vm.pushKeyEvent('A'.charCodeAt(0), 0);
  vm.run(2200000);

  const outTrytes = readDiskFileTrytes(vm, T, 'OUT');
  const expectedCalc = T.assemble(T.STANDALONE_CALC_SRC, { mode: 'T3' });
  if (!outTrytes) throw new Error('In-guest Assembler did not write OUT file to disk');
  if (outTrytes.length !== expectedCalc.length) {
    throw new Error('Self-hosted Calculator length mismatch: got ' + outTrytes.length + ', expected ' + expectedCalc.length);
  }
  let diffs = 0;
  for (let i = 0; i < expectedCalc.length; i++) {
    if (outTrytes[i] !== expectedCalc.trytes[i]) diffs++;
  }
  if (diffs !== 0) {
    throw new Error('Self-hosted Calculator binary has ' + diffs + ' byte-for-byte differences');
  }

  // Press 'R' to launch the rebuilt Calculator binary from guest memory via SYSCALL #7
  vm.pushKeyEvent('R'.charCodeAt(0), 0);
  vm.run(260000);

  // Verify the rebuilt Calculator app launched and evaluates "11+1T=" (4 + 2 = 6 -> "1T0") on MMIO framebuffer
  for (const c of '11+1T=') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(80000);
  const calcRes = readFbString(vm, T, 517, 123, 12, -350).replace(/\?/g, '').trim();
  if (T.ternaryStrToBigInt(calcRes) !== 6n) {
    throw new Error('Rebuilt Calculator failed evaluation check on MMIO framebuffer: got ' + calcRes);
  }

  return {
    name: '08-self-hosting',
    status: 'PASS',
    rebuiltApp: 'App 5: Trit Calculator',
    sourceChars: T.STANDALONE_CALC_SRC.length,
    emittedTrytes: outTrytes.length,
    diffs,
    launchedEvalResult: calcRes
  };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
