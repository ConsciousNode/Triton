'use strict';
const { loadHtmlModule } = require('./t3-common.js');
const { runPreemptionScenario } = require('./desktop-03-preemption.js');
const { runFaultScenario } = require('./desktop-04-fault-isolation.js');
const { runWindowingScenario } = require('./desktop-06-windowing.js');
const { runKlondikeScenario } = require('./desktop-12-klondike.js');
const { runTetrisScenario } = require('./desktop-13-tetris.js');
const { runSheetScenario } = require('./desktop-15-sheet.js');
const { runNetScenario } = require('./desktop-17-net.js');

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');

  // 1. perturbCompositor: true fails Test 6 (windowing border pixel shifted by 1px)
  const winCtl = runWindowingScenario(T, true);
  if (winCtl.borderPx === 120) {
    throw new Error('Positive control 1 failed: perturbCompositor did not fail Test 6 border check');
  }

  // 2. perturbShuffle: true (shuffle with swapped step) fails Test 3 (Klondike deal check)
  const solCtl = runKlondikeScenario(T, true);
  if (solCtl.seedDiffs[1] === 0 && solCtl.seedDiffs[42] === 0) {
    throw new Error('Positive control 2 failed: perturbed shuffle did not fail Test 3');
  }

  // 3. perturbTetrisRot: true (one rotation offset changed) fails Test 4 (Tetris board/score check)
  const tetCtl = runTetrisScenario(T, true);
  if (tetCtl.seedChecks[1].gridDiffs === 0 && tetCtl.seedChecks[7].gridDiffs === 0 && tetCtl.seedChecks[19].gridDiffs === 0) {
    throw new Error('Positive control 3 failed: perturbed Tetris rotation offset did not fail Test 4');
  }

  // 4. perturbSheetPrec: true (ignores operator precedence) fails Test 6 (Sheet evaluation)
  const shCtl = runSheetScenario(T, true, 5);
  if (shCtl.matchedSheets === 5) {
    throw new Error('Positive control 4 failed: Sheet build ignoring operator precedence did not fail Test 6');
  }

  // 5. perturbNetChecksum: true (wrong checksum) fails Test 8 (Net frame validation & delivery)
  const netCtl = runNetScenario(T, true);
  if (netCtl.invalidChecksumFrames === 0 || netCtl.pingReplies > 0) {
    throw new Error('Positive control 5 failed: wrong StudioNet checksum did not fail Test 8');
  }

  // 6. 1.0 controls: protectionEnabled: false corrupts kernel memory; disableTimer: true freezes Clock
  const faultCtl = runFaultScenario(T, false);
  if (faultCtl.intact) {
    throw new Error('Positive control 6 failed: protectionEnabled: false did not corrupt kernel memory');
  }
  const preemptCtl = runPreemptionScenario(T, false);
  if (preemptCtl.clockDelta !== 0) {
    throw new Error('Positive control 7 failed: disableTimer: true did not freeze Clock under infinite loop');
  }

  return {
    name: '09-positive-controls',
    status: 'PASS',
    perturbCompositorCaught: winCtl.borderPx !== 120,
    perturbShuffleCaught: solCtl.seedDiffs[1] > 0,
    perturbTetrisRotCaught: tetCtl.seedChecks[1].gridDiffs > 0 || tetCtl.seedChecks[7].gridDiffs > 0,
    perturbSheetPrecCaught: shCtl.matchedSheets === 0,
    perturbNetChecksumCaught: netCtl.invalidChecksumFrames > 0 && netCtl.pingReplies === 0,
    protectionOffCorrupted: !faultCtl.intact,
    timerOffFrozen: preemptCtl.clockDelta === 0
  };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
