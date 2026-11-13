'use strict';
const { loadHtmlModule, readDiskFileTrytes, readDiskWord, makeMouseTracker } = require('./t3-common.js');
const { loadTrytrisReference } = require('./trytris-ref.js');
const { runDifferentialScenario } = require('./desktop-23-trytris-differential.js');
const { runNegationCase } = require('./desktop-24-trytris-negation.js');

function checkScorePerturb(T) {
  const ref = loadTrytrisReference();
  const vm = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  T.bootTritOSDesktop(vm, false, { perturbTryScore: true });
  vm.run(300000);
  const m = makeMouseTracker(vm);
  m.click(710, 472, 600000);
  vm.pushKeyEvent('K'.charCodeAt(0), 0);
  vm.run(300000);
  for (const ch of '609') vm.pushKeyEvent(ch.charCodeAt(0), 0);
  vm.run(200000);
  vm.pushKeyEvent(13, 0);
  vm.run(600000);

  const keys = 'XXXXLL XXXXX RR XRRRR XXLLL XXXL XXXXR XXXXXRRR LLLL XLL XX XXXRR XXXXRRRR XXXXXLLL L XR XXRRR XXXLLLL XXXXLL XXXXX RR XRRRR XXLLL '.split('');
  const KEY_TO_ACT = { L: 'LEFT', R: 'RIGHT', X: 'ROT_CW', Z: 'ROT_CCW', ' ': 'HARD', N: null };
  const eng = new ref.TrytrisEngine({ seed: 609, mode: 'NORMAL' });
  for (let i = 0; i < keys.length; i += 8) {
    const end = Math.min(keys.length, i + 8);
    for (let j = i; j < end; j++) {
      vm.pushKeyEvent(keys[j].charCodeAt(0), 0);
      eng.tick(KEY_TO_ACT[keys[j]]);
    }
    vm.run(600000);
  }
  const st = readDiskFileTrytes(vm, T, 'TRYSTATE');
  const gScore = readDiskWord(st, 4);
  if (gScore === eng.score) {
    throw new Error(`perturbTryScore did not diverge from reference score (${eng.score})`);
  }
  return { guestScore: gScore, refScore: eng.score };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');

  // 1. perturbTryRotation
  const rotRes = runDifferentialScenario(T, { perturbTryRotation: true }, 1);
  if (!rotRes.firstDivergence) {
    throw new Error('Positive control failed: perturbTryRotation did not fail Test 3');
  }

  // 2. perturbTryPrng
  const prngRes = runDifferentialScenario(T, { perturbTryPrng: true }, 1);
  if (!prngRes.firstDivergence) {
    throw new Error('Positive control failed: perturbTryPrng did not fail Test 3');
  }

  // 3. perturbTryCollapse
  let collapseCaught = null;
  try {
    runNegationCase(T, loadTrytrisReference(), 0, 'XXRRR XXXLLLL XXXXLL XXXXX RR XRRRR XXLLL ', 1, { perturbTryCollapse: true });
  } catch (e) {
    collapseCaught = e.message;
  }
  if (!collapseCaught) {
    throw new Error('Positive control failed: perturbTryCollapse did not fail Test 4');
  }

  // 4. perturbTryScore
  const scoreRes = checkScorePerturb(T);

  return {
    name: '28-trytris-positive-controls',
    status: 'PASS',
    perturbTryRotationCaught: rotRes.firstDivergence,
    perturbTryPrngCaught: prngRes.firstDivergence,
    perturbTryCollapseCaught: collapseCaught,
    perturbTryScoreCaught: scoreRes
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
