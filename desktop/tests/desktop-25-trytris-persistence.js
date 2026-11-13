'use strict';
const { loadHtmlModule, readDiskFileTrytes, readDiskWord, makeMouseTracker } = require('./t3-common.js');

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const vm = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);
  const m = makeMouseTracker(vm);
  m.click(710, 472, 600000);
  vm.pushKeyEvent('K'.charCodeAt(0), 0);
  vm.run(300000);

  // Play scripted line clear on seed 0 to achieve score > 0
  vm.pushKeyEvent('0'.charCodeAt(0), 0);
  vm.run(200000);
  vm.pushKeyEvent(13, 0);
  vm.run(600000);

  const keys = 'XXRRR XXXLLLL XXXXLL XXXXX RR XRRRR XXLLL '.split('');
  for (let i = 0; i < keys.length; i += 8) {
    const end = Math.min(keys.length, i + 8);
    for (let j = i; j < end; j++) vm.pushKeyEvent(keys[j].charCodeAt(0), 0);
    vm.run(600000);
  }

  const st1 = readDiskFileTrytes(vm, T, 'TRYSTATE');
  const hi1 = readDiskFileTrytes(vm, T, 'TRYHI');
  if (!st1 || !hi1 || hi1.length !== 3) {
    throw new Error('Missing TRYSTATE or TRYHI before reboot');
  }
  const score1 = readDiskWord(st1, 4);
  const hiVal1 = readDiskWord(hi1, 0);
  if (score1 <= 0 || hiVal1 !== score1) {
    throw new Error(`Expected TRYHI=${score1} (>0) before reboot, got ${hiVal1}`);
  }

  // Reboot preserving disk
  T.bootTritOSDesktop(vm, true);
  vm.run(300000);
  const m2 = makeMouseTracker(vm);
  m2.click(710, 472, 600000);

  const hi2 = readDiskFileTrytes(vm, T, 'TRYHI');
  if (!hi2 || hi2.length !== 3) {
    throw new Error('TRYHI missing after reboot');
  }
  const hiVal2 = readDiskWord(hi2, 0);
  if (hiVal2 !== hiVal1) {
    throw new Error(`TRYHI did not survive reboot: before=${hiVal1} after=${hiVal2}`);
  }

  return {
    name: '25-trytris-persistence',
    status: 'PASS',
    scoreAchieved: score1,
    hiBeforeReboot: hiVal1,
    hiAfterReboot: hiVal2
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
