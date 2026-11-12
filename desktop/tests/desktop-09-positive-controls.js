'use strict';
const { loadHtmlModule } = require('./t3-common.js');
const { runPreemptionScenario } = require('./desktop-03-preemption.js');
const { runFaultScenario } = require('./desktop-04-fault-isolation.js');
const { runWindowingScenario } = require('./desktop-06-windowing.js');

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  // Control 1: protectionEnabled: false -> rogue task corrupts kernel memory at Mem[100] and Test 4 checksum catches it
  const faultCtl = runFaultScenario(T, false);
  if (faultCtl.intact) throw new Error('Positive control 1 failed: kernel memory was not corrupted with protectionEnabled: false');

  // Control 2: timer disabled -> Test 3 detects frozen desktop (clockDelta == 0)
  const preemptCtl = runPreemptionScenario(T, false);
  if (preemptCtl.clockDelta !== 0) throw new Error('Positive control 2 failed: clock advanced with timer disabled');

  // Control 3: 1-pixel perturbation in window drawing -> Test 6 catches it
  const winCtl = runWindowingScenario(T, true);
  if (winCtl.overlapPx === -340) throw new Error('Positive control 3 failed: 1-pixel perturbation not caught');

  return { name: '09-positive-controls', status: 'PASS', protectionOffCorrupted: !faultCtl.intact, timerOffFrozen: preemptCtl.clockDelta === 0, pixelPerturbationCaught: winCtl.overlapPx !== -340 };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
