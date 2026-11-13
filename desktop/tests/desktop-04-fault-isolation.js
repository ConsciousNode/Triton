'use strict';
const { loadHtmlModule, readFbString, readDiskFileTrytes, readDiskWord, makeMouseTracker } = require('./t3-common.js');

function readKstat(vm, T) {
  const arr = readDiskFileTrytes(vm, T, 'KSTAT');
  if (!arr || arr.length < 18) return null;
  return {
    kCsum: readDiskWord(arr, 0),
    trapCount: readDiskWord(arr, 3),
    lastCause: readDiskWord(arr, 6),
    lastRedraw: readDiskWord(arr, 9),
    netRx: readDiskWord(arr, 12),
    netDrop: readDiskWord(arr, 15)
  };
}

function runFaultScenario(T, protectionEnabled = true) {
  const vm = T.TritonWASM.createSync({ archMode: 'T3', protectionEnabled });
  T.bootTritOSDesktop(vm, false, protectionEnabled ? {} : { disableProtection: true });
  vm.run(300000);
  const mouse = makeMouseTracker(vm);

  // Record baseline kernel checksum via Terminal "KSTAT\n"
  for (const c of 'KSTAT\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(120000);
  const before = readKstat(vm, T);
  if (!before) throw new Error('Failed to read initial KSTAT file');

  const causes = [];
  const maxFault = protectionEnabled ? 4 : 1;
  for (let f = 1; f <= maxFault; f++) {
    if (f > 1) {
      mouse.click(20, 472, 220000);
    }
    const cmd = 'FAULT ' + f + '\n';
    for (const c of cmd) vm.pushKeyEvent(c.charCodeAt(0), 0);
    vm.run(120000);
    if (protectionEnabled) {
      mouse.click(20, 472, 220000);
    }
    for (const c of 'KSTAT\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
    vm.run(120000);
    const cur = readKstat(vm, T);
    causes.push(cur ? cur.lastCause : -1);
  }
  const after = readKstat(vm, T);
  // Trigger one more fault so the taskbar FAULT banner is visible on MMIO framebuffer
  for (const c of 'FAULT 1\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(100000);
  const banner = readFbString(vm, T, 550, 476, 18, 240);

  return {
    csumBefore: before.kCsum,
    csumAfter: after ? after.kCsum : 0,
    intact: Boolean(after && before.kCsum === after.kCsum),
    trapCount: after ? after.trapCount : 0,
    causes,
    banner
  };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const res = runFaultScenario(T, true);
  if (!res.intact) throw new Error('Kernel memory corrupted after user faults!');
  if (res.trapCount < 4) throw new Error('Expected 4 faults trapped, got ' + res.trapCount);
  if (res.banner !== 'FAULT: TASK KILLED') throw new Error('Expected fault banner on MMIO framebuffer, got: ' + res.banner);
  return { name: '04-fault-isolation', status: 'PASS', ...res };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest, runFaultScenario };
