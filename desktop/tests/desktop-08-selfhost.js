'use strict';
const { loadHtmlModule } = require('./t3-common.js');

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const vm = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);

  // Launch Assembler App (App 4) via taskbar click at (286, 472)
  const cx = vm.mem[8910], cy = vm.mem[8911];
  vm.pushMouseEvent(286 - cx, 472 - cy, 1);
  vm.pushMouseEvent(0, 0, 0);
  vm.run(260000);

  // 1. Assemble DEMO.ASM from disk ('A') and verify byte-for-byte against JS assembler
  vm.pushKeyEvent('A'.charCodeAt(0), 0);
  vm.run(150000);
  const demoSrc = '.mode T3\n.org 0\nLI R0,#420\nLI R1,#40\nLI R2,#120\nLI R3,#60\nLI R4,#0\nLI R5,#120\nSYSCALL #10\nlp: SYSCALL #2\nJMPX lp\n';
  const expectedDemo = T.assemble(demoSrc, { mode: 'T3' });
  const olenDemo = vm.mem[30 * 19683 + 5325];
  const obufBase = 35 * 19683;
  for (let i = 0; i < expectedDemo.length; i++) {
    if (vm.mem[obufBase + i] !== expectedDemo.trytes[i]) {
      throw new Error('Self-host DEMO.ASM mismatch at tryte ' + i);
    }
  }

  // Launch assembled DEMO app ('R') and verify its window opens at (420, 40)
  const zBefore = vm.mem[8908];
  vm.pushKeyEvent('R'.charCodeAt(0), 0);
  vm.run(260000);
  const zAfter = vm.mem[8908];
  if (zAfter <= zBefore) throw new Error('Assembled DEMO app did not open a window');

  // 2. Also stream and self-host the entire 105,672-char TritOS 3.0 source (4,474 trytes) inside the guest Assembler App ('S')!
  for (let i = 0; i < T.TRITOS3_SRC.length; i++) {
    vm.setDisk(729 + i, T.balRem(T.TRITOS3_SRC.charCodeAt(i), T.TRYTE_MOD, T.TRYTE_HALF));
  }
  vm.setDisk(729 + T.TRITOS3_SRC.length, 0);
  // Refocus Assembler App window (Win 2)
  const cx2 = vm.mem[8910], cy2 = vm.mem[8911];
  vm.pushMouseEvent(260 - cx2, 265 - cy2, 1);
  vm.pushMouseEvent(0, 0, 0);
  vm.run(60000);
  vm.pushKeyEvent('S'.charCodeAt(0), 0);
  vm.run(16000000);
  const expectedOS = T.assemble(T.TRITOS3_SRC, { mode: 'T3' });
  const olenOS = vm.mem[30 * 19683 + 5325] + vm.mem[30 * 19683 + 5326] * 19683;
  let osDiffs = 0;
  for (let i = 0; i < expectedOS.length; i++) {
    if (vm.mem[obufBase + i] !== expectedOS.trytes[i]) osDiffs++;
  }
  if (olenOS !== expectedOS.length || osDiffs !== 0) {
    throw new Error('Full OS self-host mismatch: olen=' + olenOS + ' diffs=' + osDiffs);
  }

  return { name: '08-self-hosting', status: 'PASS', demoAppTrytes: olenDemo, fullOsSourceChars: T.TRITOS3_SRC.length, fullOsTrytes: olenOS, diffs: osDiffs };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
