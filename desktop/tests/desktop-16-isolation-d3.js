'use strict';
const { loadHtmlModule, readFbString, readDiskFileTrytes, readDiskWord, makeMouseTracker } = require('./t3-common.js');
const { buildStudioNet16Frame, PROTO_SDP, FLAG_PSH, PORT_CHAT } = require('./studionet16-ref.js');

function readClockVal(vm, T) {
  let s = readFbString(vm, T, 561, 32, 12, -320);
  for (let k = 0; k < 6 && s.includes("?"); k++) {
    vm.run(2500);
    s = readFbString(vm, T, 561, 32, 12, -320);
  }
  const m = /-?\d+/.exec(s);
  return m ? parseInt(m[0], 10) : 0;
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const apps = [
    { appId: 6, name: 'Klondike', x: 440 },
    { appId: 7, name: 'Tetris',   x: 502 },
    { appId: 8, name: 'Write',    x: 565 },
    { appId: 9, name: 'Sheet',    x: 625 },
    { appId: 10, name: 'Net',     x: 690 }
  ];

  const faultResults = [];
  const loopResults = [];

  for (const app of apps) {
    // 1a. Deliberate protection fault (key 200) inside each new app
    const vm = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
    T.bootTritOSDesktop(vm, false);
    vm.run(300000);
    const m = makeMouseTracker(vm);
    m.click(app.x, 472, 350000);
    const clk0 = readClockVal(vm, T);
    vm.pushKeyEvent(200, 0); // trigger deliberate protection violation inside app
    vm.run(350000);
    const banner = readFbString(vm, T, 550, 476, 18, 240);
    vm.run(250000);
    const clk1 = readClockVal(vm, T);
    if (banner !== 'FAULT: TASK KILLED' || clk1 <= clk0) {
      throw new Error('Fault isolation failed for ' + app.name + ': banner=' + banner + ' clk=' + clk0 + '->' + clk1);
    }
    faultResults.push({ app: app.name, banner, clockAdvanced: clk1 > clk0 });

    // 1b. Deliberate infinite loop (key 201) inside each new app -> preempted, desktop stays responsive
    const vmLoop = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
    T.bootTritOSDesktop(vmLoop, false);
    vmLoop.run(300000);
    const mLoop = makeMouseTracker(vmLoop);
    mLoop.click(app.x, 472, 350000);
    const lClk0 = readClockVal(vmLoop, T);
    vmLoop.pushKeyEvent(201, 0); // enter infinite loop inside app
    vmLoop.run(450000);
    const lClk1 = readClockVal(vmLoop, T);
    if (lClk1 <= lClk0) {
      throw new Error('Preemption under infinite loop failed for ' + app.name);
    }
    loopResults.push({ app: app.name, clockDelta: lClk1 - lClk0 });
  }

  // 2. Flood of 1,000 incoming 16-byte StudioNet frames
  const floodVm = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  T.bootTritOSDesktop(floodVm, false);
  floodVm.run(300000);
  const floodFrame = buildStudioNet16Frame({
    dst: 3, src: 4, proto: PROTO_SDP, flags: FLAG_PSH,
    sport: PORT_CHAT, dport: PORT_CHAT, seq: 100, ack: 0,
    payload: new Uint8Array([72, 73, 0])
  });
  for (let i = 0; i < 1000; i++) {
    floodVm.receiveNetFrame(floodFrame);
  }
  floodVm.run(400000);
  const clk0 = readClockVal(floodVm, T);
  for (const c of 'KCHK\n') floodVm.pushKeyEvent(c.charCodeAt(0), 0);
  floodVm.run(450000);
  const clk1 = readClockVal(floodVm, T);
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
    faultedAppsIsolated: faultResults.length,
    loopedAppsPreempted: loopResults.length,
    floodAccepted: netRx,
    floodDropped: netDrop
  };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
