'use strict';
const { loadHtmlModule } = require('./t3-common.js');

function kernelCodeChecksum(vm) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < 5700; i++) {
    h = Math.imul(h ^ (vm.mem[i] & 0xFFFF), 16777619) >>> 0;
  }
  return h >>> 0;
}

function runFaultScenario(T, protectionEnabled = true) {
  const vm = T.TritonWASM.createSync({ archMode: 'T3', protectionEnabled });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);
  const csumBefore = kernelCodeChecksum(vm);
  const causes = [];
  for (let f = 1; f <= 4; f++) {
    // Ensure a Terminal (App 0) is running and focused (after f > 1)
    if (f > 1) {
      const cx = vm.mem[8910], cy = vm.mem[8911];
      vm.pushMouseEvent(20 - cx, 472 - cy, 1);
      vm.pushMouseEvent(0, 0, 0);
      vm.run(180000);
    }
    const cmd = 'FAULT ' + f + '\n';
    for (const c of cmd) vm.pushKeyEvent(c.charCodeAt(0), 0);
    vm.run(120000);
    causes.push(vm.mem[5857]);
  }
  const csumAfter = kernelCodeChecksum(vm);
  return { csumBefore, csumAfter, intact: csumBefore === csumAfter, trapCount: vm.mem[5854], causes };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const res = runFaultScenario(T, true);
  if (!res.intact) throw new Error('Kernel memory corrupted after user faults!');
  if (res.trapCount < 4) throw new Error('Expected 4 faults trapped, got ' + res.trapCount);
  return { name: '04-fault-isolation', status: 'PASS', ...res };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest, runFaultScenario };
