'use strict';
const { loadHtmlModule, readFbString, readDiskFileTrytes, readDiskWord, makeMouseTracker } = require('./t3-common.js');

const TET_SHAPES = [
  [[[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]], [[0,2],[1,2],[2,2],[3,2]], [[1,0],[1,1],[1,2],[1,3]]],
  [[[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]]],
  [[[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[2,1],[1,2]], [[1,0],[0,1],[1,1],[1,2]]],
  [[[1,0],[2,0],[0,1],[1,1]], [[1,0],[1,1],[2,1],[2,2]], [[1,1],[2,1],[0,2],[1,2]], [[0,0],[0,1],[1,1],[1,2]]],
  [[[0,0],[1,0],[1,1],[2,1]], [[2,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[1,2],[2,2]], [[1,0],[0,1],[1,1],[0,2]]],
  [[[0,0],[0,1],[1,1],[2,1]], [[1,0],[2,0],[1,1],[1,2]], [[0,1],[1,1],[2,1],[2,2]], [[1,0],[1,1],[0,2],[1,2]]],
  [[[2,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[2,2]], [[0,1],[1,1],[2,1],[0,2]], [[0,0],[1,0],[1,1],[1,2]]]
];
const TET_KICKS = [[0,0], [-1,0], [1,0], [0,-1], [-2,0], [2,0]];

function simulateTetrisRef(seed, cmds) {
  const grid = Array(200).fill(0);
  let s = seed, score = 0, lines = 0, level = 1, gameOver = 0, pieces = 0;
  let curPiece = 0, curRot = 0, curPx = 3, curPy = 0;
  function checkCol(p, r, px, py) {
    for (const [dx, dy] of TET_SHAPES[p][r]) {
      const x = px + dx, y = py + dy;
      if (x < 0 || x >= 10 || y < 0 || y >= 20) return true;
      if (grid[y * 10 + x] !== 0) return true;
    }
    return false;
  }
  function spawn() {
    s = (s * 127 + 259) % 6561;
    if (s < 0) s += 6561;
    curPiece = s % 7; curRot = 0; curPx = 3; curPy = 0;
    pieces++;
    if (checkCol(curPiece, curRot, curPx, curPy)) gameOver = 1;
  }
  function lock() {
    const val = curPiece + 1;
    for (const [dx, dy] of TET_SHAPES[curPiece][curRot]) {
      const x = curPx + dx, y = curPy + dy;
      if (x >= 0 && x < 10 && y >= 0 && y < 20) grid[y * 10 + x] = val;
    }
    let cleared = 0;
    for (let r = 19; r >= 0; r--) {
      let full = true;
      for (let c = 0; c < 10; c++) if (grid[r * 10 + c] === 0) { full = false; break; }
      if (full) {
        cleared++;
        for (let rr = r; rr > 0; rr--) {
          for (let c = 0; c < 10; c++) grid[rr * 10 + c] = grid[(rr - 1) * 10 + c];
        }
        for (let c = 0; c < 10; c++) grid[c] = 0;
        r++;
      }
    }
    if (cleared > 0) {
      lines += cleared;
      level = 1 + Math.floor(lines / 10);
      const pts = cleared === 1 ? 100 : cleared === 2 ? 300 : cleared === 3 ? 500 : 800;
      score += pts * level;
    }
    spawn();
  }
  spawn();
  for (const ch of cmds) {
    if (gameOver) break;
    if (ch === 'A') { if (!checkCol(curPiece, curRot, curPx - 1, curPy)) curPx--; }
    else if (ch === 'D') { if (!checkCol(curPiece, curRot, curPx + 1, curPy)) curPx++; }
    else if (ch === 'W') {
      const nr = (curRot + 1) % 4;
      for (const [kx, ky] of TET_KICKS) {
        if (!checkCol(curPiece, nr, curPx + kx, curPy + ky)) {
          curRot = nr; curPx += kx; curPy += ky; break;
        }
      }
    } else if (ch === 'S') {
      if (!checkCol(curPiece, curRot, curPx, curPy + 1)) { curPy++; score += 1; }
      else lock();
    } else if (ch === ' ') {
      while (!checkCol(curPiece, curRot, curPx, curPy + 1)) { curPy++; score += 2; }
      lock();
    }
  }
  return { score, lines, level, gameOver, curPiece, curRot, curPx, curPy, pieces, seed, grid };
}

function runTetrisScenario(T, perturbTetrisRot = false) {
  const vm = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm, false, perturbTetrisRot ? { perturbTetrisRot: true } : {});
  vm.run(300000);
  const mouse = makeMouseTracker(vm);

  // Launch Tetris (App 7) via taskbar click at (500, 472)
  mouse.click(500, 472, 350000);

  // 1. For 3 seeds (1, 7, 19) and a scripted input timeline, compare saved board and score with JS reference
  const timeline = 'WAA DD W S  W A  W D ';
  const seedChecks = {};
  for (const seed of [1, 7, 19]) {
    for (const ch of String(seed) + 'N' + timeline + 'P') vm.pushKeyEvent(ch.charCodeAt(0), 0);
    vm.run(650000);
    const got = readDiskFileTrytes(vm, T, 'TETRIS');
    const ref = simulateTetrisRef(seed, timeline);
    const gotScore = got ? readDiskWord(got, 0) : -1;
    let gridDiffs = 0;
    if (!got) gridDiffs = 999;
    else {
      for (let i = 0; i < 200; i++) if (got[15 + i] !== ref.grid[i]) gridDiffs++;
    }
    seedChecks[seed] = { scoreMatch: gotScore === ref.score, gridDiffs, score: gotScore, refScore: ref.score };
  }

  // 2. Line-clear scenario on seed 130 (opening pieces I, I, O -> "AAA D DDDD " clears bottom row!)
  const clearTimeline = 'AAA D DDDD ';
  for (const ch of '130N' + clearTimeline + 'P') vm.pushKeyEvent(ch.charCodeAt(0), 0);
  vm.run(650000);
  const clearGot = readDiskFileTrytes(vm, T, 'TETRIS');
  const clearRef = simulateTetrisRef(130, clearTimeline);
  const clearedLines = clearGot ? clearGot[6] : 0;
  const clearScore = clearGot ? readDiskWord(clearGot, 0) : 0;

  // 3. Game-over scenario (hard-dropping until well tops out)
  const overTimeline = '            ';
  for (const ch of '1N' + overTimeline + 'P') vm.pushKeyEvent(ch.charCodeAt(0), 0);
  vm.run(700000);
  const overGot = readDiskFileTrytes(vm, T, 'TETRIS');
  const gameOverFlag = overGot ? overGot[8] : 0;
  // Check MMIO framebuffer at client (76, 104) inside window (240, 14) -> screen (317, 130), bg = -320 for "OVER"
  const overBanner = readFbString(vm, T, 317, 130, 9, -320);

  // 4. High score persistence across a reboot (keepDisk = true)
  const hiBefore = overGot ? readDiskWord(overGot, 3) : 0;
  T.bootTritOSDesktop(vm, true, perturbTetrisRot ? { perturbTetrisRot: true } : {});
  vm.run(300000);
  const mouse2 = makeMouseTracker(vm);
  mouse2.click(500, 472, 350000);
  vm.pushKeyEvent('P'.charCodeAt(0), 0);
  vm.run(200000);
  const afterRebootGot = readDiskFileTrytes(vm, T, 'TETRIS');
  const hiAfterReboot = afterRebootGot ? readDiskWord(afterRebootGot, 3) : -1;

  return {
    seedChecks,
    clearedLines,
    clearScore,
    expectedClearScore: clearRef.score,
    gameOverFlag,
    overBanner,
    hiBefore,
    hiAfterReboot
  };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const res = runTetrisScenario(T, false);
  for (const seed of [1, 7, 19]) {
    if (!res.seedChecks[seed].scoreMatch || res.seedChecks[seed].gridDiffs !== 0) {
      throw new Error('Tetris seed ' + seed + ' mismatch vs JS reference: ' + JSON.stringify(res.seedChecks[seed]));
    }
  }
  if (res.clearedLines !== 1 || res.clearScore !== res.expectedClearScore) {
    throw new Error('Tetris line-clear check failed: lines=' + res.clearedLines + ' score=' + res.clearScore);
  }
  if (res.gameOverFlag !== 1 || res.overBanner !== 'GAME OVER') {
    throw new Error('Tetris game-over check failed: flag=' + res.gameOverFlag + ' banner=' + res.overBanner);
  }
  if (res.hiBefore <= 0 || res.hiAfterReboot !== res.hiBefore) {
    throw new Error('Tetris high score did not persist across reboot: before=' + res.hiBefore + ' after=' + res.hiAfterReboot);
  }
  return { name: '13-tetris', status: 'PASS', ...res };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest, runTetrisScenario };
