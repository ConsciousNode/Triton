'use strict';
const { loadHtmlModule, readFbString, readDiskFileTrytes, readDiskWord, makeMouseTracker } = require('./t3-common.js');

function readClockVal(vm, T) {
  let s = readFbString(vm, T, 561, 32, 12, -320);
  for (let k = 0; k < 6 && s.includes('?'); k++) {
    vm.run(2500);
    s = readFbString(vm, T, 561, 32, 12, -320);
  }
  const m = /-?\d+/.exec(s);
  return m ? parseInt(m[0], 10) : 0;
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');

  // 1a. Deliberate protection fault (key 200) inside App 11
  const vm = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);
  for (const c of 'KSTAT\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(120000);
  const kBefore = readDiskFileTrytes(vm, T, 'KSTAT');
  const chkBefore = kBefore ? readDiskWord(kBefore, 0) : null;
  const m = makeMouseTracker(vm);
  m.click(710, 472, 900000);
  const clk0 = readClockVal(vm, T);
  vm.pushKeyEvent(200, 0);
  vm.run(600000);
  const banner = readFbString(vm, T, 550, 476, 18, 240);
  vm.run(250000);
  const clk1 = readClockVal(vm, T);
  if (banner !== 'FAULT: TASK KILLED' || clk1 <= clk0) {
    throw new Error(`Fault isolation failed for Trytris: banner=${banner} clk=${clk0}->${clk1}`);
  }

  // Verify Terminal / other apps still work (launch Terminal at x=120, y=472 and type HELP)
  m.click(20, 472, 220000);
  for (const c of 'KSTAT\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(150000);
  const kAfter = readDiskFileTrytes(vm, T, 'KSTAT');
  const chkAfter = kAfter ? readDiskWord(kAfter, 0) : null;
  if (chkBefore === null || chkAfter !== chkBefore) {
    throw new Error(`Kernel checksum changed after App 11 fault: ${chkBefore} -> ${chkAfter}`);
  }
  const clk2 = readClockVal(vm, T);
  if (clk2 <= clk1) {
    throw new Error(`Clock stopped advancing after App 11 fault: ${clk1}->${clk2}`);
  }

  // 1b. Deliberate infinite loop (key 201) inside App 11 -> preempted, desktop stays responsive
  const vmLoop = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  T.bootTritOSDesktop(vmLoop, false);
  vmLoop.run(300000);
  const mLoop = makeMouseTracker(vmLoop);
  mLoop.click(710, 472, 900000);
  const lClk0 = readClockVal(vmLoop, T);
  vmLoop.pushKeyEvent(201, 0);
  vmLoop.run(450000);
  const lClk1 = readClockVal(vmLoop, T);
  if (lClk1 <= lClk0) {
    throw new Error(`Preemption under infinite loop failed for Trytris: ${lClk0}->${lClk1}`);
  }

  return {
    name: '26-trytris-isolation',
    status: 'PASS',
    fault: { banner, clockDelta: clk2 - clk0, kernelChecksumIntact: chkAfter === chkBefore },
    infiniteLoop: { clockDelta: lClk1 - lClk0 }
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
