'use strict';
const { loadHtmlModule } = require('./t3-common.js');

function runPreemptionScenario(T, enableTimer = true) {
  const vm = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);
  // Spawn infinite-loop task via Terminal "LOOP\n"
  for (const c of 'LOOP\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(80000);
  if (!enableTimer) {
    // Positive control: disable timer period (Port 9 = 0) while inside infinite loop task (Task 2)
    while (vm.mem[5850] !== 2 && vm.steps < 500000) vm.run(500);
    vm.timerPeriod = 0;
  }
  const clockBefore = vm.mem[196830 + 2000] + vm.mem[196830 + 2001] * 19683;
  const curXBefore = vm.mem[8910];
  vm.pushMouseEvent(15, 10, 0);
  for (const c of 'PS\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(350000);
  const clockAfter = vm.mem[196830 + 2000] + vm.mem[196830 + 2001] * 19683;
  const curXAfter = vm.mem[8910];
  const s0 = vm.mem[6000 + 45], s1 = vm.mem[6064 + 45], s2 = vm.mem[6128 + 45];
  return { clockDelta: clockAfter - clockBefore, cursorDeltaX: curXAfter - curXBefore, slices: [s0, s1, s2], stepsPerSlice: 2500 };
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
