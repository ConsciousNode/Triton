'use strict';
const { loadHtmlModule, readFbPixel, readFbString, readDiskFileTrytes } = require('./t3-common.js');

function readClockDec(vm, T) {
  // Clock window is at (520, 12) -> client origin at (521, 24). Decimal ticks at client (40, 8) -> screen (561, 32), bg = -320
  const s = readFbString(vm, T, 561, 32, 10, -320).replace(/[^0-9]/g, '');
  return s ? parseInt(s, 10) : 0;
}

function runPreemptionScenario(T, enableTimer = true) {
  const vm = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm, false, enableTimer ? {} : { disableTimer: true });
  vm.run(300000);

  // Spawn infinite-loop task via Terminal "LOOP\n"
  for (const c of 'LOOP\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(80000);

  const clockBefore = readClockDec(vm, T);
  // Move cursor from (364, 230) by (+15, +10) -> (379, 240)
  vm.pushMouseEvent(15, 10, 0);
  // Run "PS\n" in Terminal (which writes the 64-tryte task table to file "PS" on disk!)
  for (const c of 'PS\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(350000);

  const clockAfter = readClockDec(vm, T);
  // Check MMIO framebuffer at new cursor position (379, 240) for white cursor pixel (364)
  const cursorMoved = readFbPixel(vm, T, 379, 240) === 364;
  const psTrytes = readDiskFileTrytes(vm, T, 'PS');
  const slices = psTrytes ? [psTrytes[0 * 8 + 4], psTrytes[1 * 8 + 4], psTrytes[2 * 8 + 4]] : [0, 0, 0];
  return {
    clockDelta: clockAfter - clockBefore,
    cursorDeltaX: cursorMoved ? 15 : 0,
    slices,
    stepsPerSlice: 2500
  };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const res = runPreemptionScenario(T, true);
  if (res.clockDelta <= 0) throw new Error('Clock froze under infinite-loop task');
  if (res.cursorDeltaX !== 15) throw new Error('Cursor failed to move under infinite-loop task');
  if (res.slices[2] <= 0) throw new Error('Infinite loop task did not execute slices');
  return { name: '03-preemption-fairness', status: 'PASS', ...res };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest, runPreemptionScenario };
