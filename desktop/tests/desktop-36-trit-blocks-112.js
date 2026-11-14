'use strict';
/**
 * Spec Test 9: Trit Blocks (App 7)
 * - renamed from "Tetris" to "Trit Blocks" (taskbar [TBLK], window title "TRIT BLOCKS");
 * - each piece appears once per bag of 7;
 * - seeded runs are reproducible;
 * - 3-piece next queue, hold, ghost, pause, levels;
 * - gravity follows SYS_GET_MS (SYSCALL #9).
 */
const { loadHtmlModule, readFbPixel, readDiskFileTrytes, readFbString, makeMouseTracker } = require('./t3-common.js');

function runSeededTblk(T, seedStr) {
  const vm = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);
  const mouse = makeMouseTracker(vm);
  mouse.click(486, 472, 350000); // Click [TBLK] on taskbar
  mouse.moveTo(364, 230, 0);
  vm.run(80000);

  for (const ch of seedStr + 'B') vm.pushKeyEvent(ch.charCodeAt(0), 0);
  vm.run(300000);
  const initTblk = readDiskFileTrytes(vm, T, 'TBLK');

  const bag1 = initTblk.slice(215, 222);
  const bag2 = initTblk.slice(222, 229);
  const curPiece = initTblk[9];
  const nextQueue = initTblk.slice(229, 232);
  const holdPiece = initTblk[232];
  const ghostPy = initTblk[234];

  // Verify each piece 0..6 appears once per bag of 7
  const sortedBag1 = bag1.slice().sort((a, b) => a - b);
  const sortedBag2 = bag2.slice().sort((a, b) => a - b);
  for (let p = 0; p < 7; p++) {
    if (sortedBag1[p] !== p || sortedBag2[p] !== p) {
      throw new Error(`7-bag violation for seed ${seedStr}: bag1=${JSON.stringify(bag1)} bag2=${JSON.stringify(bag2)}`);
    }
  }

  return { vm, initTblk, bag1, bag2, curPiece, nextQueue, holdPiece, ghostPy };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');

  // 1. Verify taskbar [TBLK] and window title "TRIT BLOCKS"
  const r42a = runSeededTblk(T, '42');
  const r42b = runSeededTblk(T, '42');
  const r19 = runSeededTblk(T, '19');

  const taskbarLabel = readFbString(r42a.vm, T, 467, 466, 6, -240, true);
  const winTitle = readFbString(r42a.vm, T, 245, 16, 11, -110, true);
  if (taskbarLabel !== '[TBLK]' || winTitle !== 'TRIT BLOCKS') {
    throw new Error(`Label/title mismatch: taskbar=${taskbarLabel} winTitle=${winTitle}`);
  }

  // 2. Verify seeded reproducibility (42a === 42b tryte-for-tryte, and 42a !== 19)
  let reproDiffs = 0;
  let diffSeedDiffs = 0;
  for (let i = 0; i < r42a.initTblk.length; i++) {
    if (r42a.initTblk[i] !== r42b.initTblk[i]) reproDiffs++;
    if (r42a.initTblk[i] !== r19.initTblk[i]) diffSeedDiffs++;
  }
  if (reproDiffs !== 0 || diffSeedDiffs === 0) {
    throw new Error(`Seed reproducibility check failed: reproDiffs=${reproDiffs} diffSeedDiffs=${diffSeedDiffs}`);
  }

  // 3. Verify Hold ('C') swaps cur_piece into hold_piece and shifts 3-piece next_queue
  const vm = r42a.vm;
  vm.pushKeyEvent('C'.charCodeAt(0), 0);
  vm.run(200000);
  const afterHold = readDiskFileTrytes(vm, T, 'TBLK');
  if (afterHold[232] !== r42a.curPiece || afterHold[9] !== r42a.nextQueue[0] ||
      afterHold[229] !== r42a.nextQueue[1] || afterHold[230] !== r42a.nextQueue[2] ||
      afterHold[231] !== r42a.bag1[4]) {
    throw new Error('Hold / next_queue shift mismatch: ' + JSON.stringify({
      before: { cur: r42a.curPiece, next: r42a.nextQueue, hold: r42a.holdPiece },
      after: { cur: afterHold[9], next: afterHold.slice(229, 232), hold: afterHold[232] }
    }));
  }

  // 4. Verify Pause ('Z') freezes gravity and unpause resumes gravity via SYS_GET_MS (SYSCALL #9)
  const pyBeforePause = afterHold[12];
  vm.pushKeyEvent('Z'.charCodeAt(0), 0); // Pause ON
  vm.run(450000); // > 2 gravity periods (2 * 196,800 steps), but paused!
  vm.pushKeyEvent('P'.charCodeAt(0), 0); // Save TBLK
  vm.run(180000);
  const whilePaused = readDiskFileTrytes(vm, T, 'TBLK');
  const pyWhilePaused = whilePaused[12];
  if (whilePaused[235] !== 1 || pyWhilePaused !== pyBeforePause) {
    throw new Error(`Pause failed to freeze gravity: paused=${whilePaused[235]} pyBefore=${pyBeforePause} pyWhilePaused=${pyWhilePaused}`);
  }

  vm.pushKeyEvent('Z'.charCodeAt(0), 0); // Pause OFF
  vm.run(450000); // Run > 2 gravity intervals (SYS_GET_MS advances by 2250 ms)
  vm.pushKeyEvent('P'.charCodeAt(0), 0); // Save TBLK
  vm.run(180000);
  const afterUnpause = readDiskFileTrytes(vm, T, 'TBLK');
  const pyAfterUnpause = afterUnpause[12];
  if (afterUnpause[235] !== 0 || pyAfterUnpause <= pyWhilePaused) {
    throw new Error(`Unpause failed to advance gravity via SYS_GET_MS: paused=${afterUnpause[235]} pyAfter=${pyAfterUnpause}`);
  }

  return {
    name: '36-trit-blocks-1.1.2',
    status: 'PASS',
    taskbarLabel,
    winTitle,
    seed42Bag1: r42a.bag1,
    seed42Bag2: r42a.bag2,
    seed19Bag1: r19.bag1,
    reproDiffs,
    diffSeedDiffs,
    holdAndNextQueue: {
      initialCur: r42a.curPiece,
      initialNext: r42a.nextQueue,
      afterHoldCur: afterHold[9],
      afterHoldNext: afterHold.slice(229, 232),
      afterHoldPiece: afterHold[232],
      ghostPy: afterHold[234]
    },
    gravitySysGetMs: {
      pyBeforePause,
      pyWhilePaused,
      pyAfterUnpause
    }
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
