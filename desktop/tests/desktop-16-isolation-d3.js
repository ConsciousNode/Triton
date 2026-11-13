'use strict';
const { loadHtmlModule, readFbString, readDiskFileTrytes, readDiskWord, makeMouseTracker } = require('./t3-common.js');

function readClockDec(vm, T) {
  const s = readFbString(vm, T, 561, 32, 10, -320).replace(/[^0-9]/g, '');
  return s ? parseInt(s, 10) : 0;
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const appButtons = [
    { appId: 6, name: 'Klondike', x: 440 },
    { appId: 7, name: 'Tetris',   x: 500 },
    { appId: 8, name: 'Write',    x: 565 },
    { appId: 9, name: 'Sheet',    x: 625 },
    { appId: 10, name: 'Net',     x: 690 }
  ];

  // 1. Fault (key 200) and Infinite Loop (key 201) inside each of the 5 new D3 apps
  const appIsolation = [];
  for (const app of appButtons) {
    const vm = T.TritonWASM.createSync({ archMode: 'T3' });
    T.bootTritOSDesktop(vm, false);
    vm.run(300000);
    const mouse = makeMouseTracker(vm);

    // Launch app and trigger protection fault (key 200)
    mouse.click(app.x, 472, 500000);
    vm.pushKeyEvent(200, 0);
    vm.run(250000);
    const banner = readFbString(vm, T, 550, 476, 18, 240);

    // Relaunch app and trigger infinite loop (key 201), then verify Clock and Terminal remain responsive
    mouse.click(app.x, 472, 500000);
    vm.pushKeyEvent(201, 0);
    vm.run(100000);
    const clkBefore = readClockDec(vm, T);
    // Click Terminal at (15, 25) (uncovered left strip of Terminal at x=12..17) and run "PS\n"
    mouse.click(15, 25, 160000);
    for (const c of 'PS\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
    vm.run(250000);
    const clkAfter = readClockDec(vm, T);
    const ps = readDiskFileTrytes(vm, T, 'PS');
    const activeTasks = ps ? [0, 1, 2, 3, 4, 5, 6, 7].filter(i => ps[i * 8 + 1] === 1).length : 0;

    if (banner !== 'FAULT: TASK KILLED') {
      throw new Error(app.name + ' fault was not isolated/reported on banner: ' + banner);
    }
    if (clkAfter <= clkBefore || activeTasks < 3) {
      throw new Error(app.name + ' infinite loop froze desktop: clkDelta=' + (clkAfter - clkBefore) + ' activeTasks=' + activeTasks);
    }
    appIsolation.push({ app: app.name, faultBanner: banner, clockDeltaUnderLoop: clkAfter - clkBefore, activeTasksUnderLoop: activeTasks });
  }

  // 2. Flood of 1,000 incoming StudioNet frames
  const floodVm = new T.TritonJS({ archMode: 'T3', nodeId: 3 });
  T.bootTritOSDesktop(floodVm, false);
  floodVm.run(300000);
  const floodFrame = T.buildStudioNetFrame(3, 4, 1, 1, new Uint8Array([80, 73, 78, 71]), 16);
  for (let i = 0; i < 1000; i++) {
    floodVm.receiveNetFrame(floodFrame);
  }
  floodVm.run(400000);
  const clk0 = readClockDec(floodVm, T);
  for (const c of 'KSTAT\n') floodVm.pushKeyEvent(c.charCodeAt(0), 0);
  floodVm.run(200000);
  const clk1 = readClockDec(floodVm, T);
  const kstat = readDiskFileTrytes(floodVm, T, 'KSTAT');
  const netRx = kstat ? readDiskWord(kstat, 12) : 0;
  const netDrop = kstat ? readDiskWord(kstat, 15) : 0;
  if (clk1 <= clk0) throw new Error('Desktop froze after 1,000-frame StudioNet flood');
  if (netRx !== 10 || netDrop !== 990) {
    throw new Error('Expected 10 accepted and 990 dropped frames in 1,000-frame flood, got rx=' + netRx + ' drop=' + netDrop);
  }

  return {
    name: '16-isolation-d3-and-net-flood',
    status: 'PASS',
    appIsolation,
    floodFramesSent: 1000,
    floodAccepted: netRx,
    floodDropped: netDrop
  };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
