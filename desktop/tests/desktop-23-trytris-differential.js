'use strict';
const { loadHtmlModule, makeRng, readFbPixel, readDiskFileTrytes, readDiskWord, makeMouseTracker } = require('./t3-common.js');
const { loadTrytrisReference, PIECE_NUM_TO_ID, PIECE_ID_TO_NUM, MODE_NUM_TO_NAME, MODE_NAME_TO_NUM } = require('./trytris-ref.js');

const PIECE_COLORS = [
  -284, -180, 310, 140,
  -250, 292, 355, -100,
  280, 180, -220, 260,
  76, 240, -270, 200
];

const ACTIONS = [
  { key: 'L'.charCodeAt(0), call: (eng) => eng.tick('LEFT'), name: 'LEFT' },
  { key: 'R'.charCodeAt(0), call: (eng) => eng.tick('RIGHT'), name: 'RIGHT' },
  { key: 'X'.charCodeAt(0), call: (eng) => eng.tick('ROT_CW'), name: 'ROT_CW' },
  { key: 'Z'.charCodeAt(0), call: (eng) => eng.tick('ROT_CCW'), name: 'ROT_CCW' },
  { key: 32,               call: (eng) => eng.tick('HARD'), name: 'HARD' },
  { key: 'N'.charCodeAt(0), call: (eng) => eng.tick(null), name: 'NULL' },
  { key: 'S'.charCodeAt(0), call: (eng) => eng.softDrop(), name: 'SOFT' }
];

function compareState(st, eng, ref, label) {
  if (!st || st.length !== 355) {
    return `${label}: TRYSTATE missing or bad length (${st ? st.length : null})`;
  }
  const gSeed = readDiskWord(st, 0);
  const rSeed = ref.normalizeSeed(eng.seed);
  if (gSeed !== rSeed) return `${label}: seed guest=${gSeed} ref=${rSeed}`;
  const gMode = st[3];
  const rMode = MODE_NAME_TO_NUM[eng.mode];
  if (gMode !== rMode) return `${label}: mode guest=${gMode} ref=${rMode}`;
  const gScore = readDiskWord(st, 4);
  if (gScore !== eng.score) return `${label}: score guest=${gScore} ref=${eng.score}`;
  if (st[7] !== eng.lines) return `${label}: lines guest=${st[7]} ref=${eng.lines}`;
  if (st[8] !== eng.level) return `${label}: level guest=${st[8]} ref=${eng.level}`;
  if (st[9] !== eng.comboStreak) return `${label}: comboStreak guest=${st[9]} ref=${eng.comboStreak}`;
  const rB2B = eng.backToBackActive ? 1 : 0;
  if (st[10] !== rB2B) return `${label}: backToBackActive guest=${st[10]} ref=${rB2B}`;
  const rOver = eng.gameOver ? 1 : 0;
  if (st[11] !== rOver) return `${label}: gameOver guest=${st[11]} ref=${rOver}`;

  const rActId = eng.activePiece ? PIECE_ID_TO_NUM[eng.activePiece.def.id] : 0;
  const rActRot = eng.activePiece ? eng.activePiece.rotIndex : 0;
  const rActR = eng.activePiece ? eng.activePiece.r : 0;
  const rActC = eng.activePiece ? eng.activePiece.c : 0;
  if (st[12] !== rActId) return `${label}: active_id guest=${st[12]} ref=${rActId}`;
  if (st[13] !== rActRot) return `${label}: active_rot guest=${st[13]} ref=${rActRot}`;
  if (st[14] !== rActR) return `${label}: active_r guest=${st[14]} ref=${rActR}`;
  if (st[15] !== rActC) return `${label}: active_c guest=${st[15]} ref=${rActC}`;

  const rNext = eng.bagGen.peekPreview(eng.mode, eng.level, 3).map(p => PIECE_ID_TO_NUM[p.id]);
  for (let i = 0; i < 3; i++) {
    if (st[16 + i] !== rNext[i]) {
      return `${label}: next[${i}] guest=${st[16 + i]} ref=${rNext[i]}`;
    }
  }

  for (let r = 0; r < 28; r++) {
    for (let c = 0; c < 12; c++) {
      const gCell = st[19 + r * 12 + c];
      const rCell = eng.board[r][c] ? PIECE_ID_TO_NUM[eng.board[r][c].pieceId] : 0;
      if (gCell !== rCell) {
        return `${label}: board[${r}][${c}] guest=${gCell} ref=${rCell}`;
      }
    }
  }
  return null;
}

function checkScreenSnapshot(vm, T, st, eng, ref, label) {
  // Build expected visible board (locked + active piece when !gameOver)
  const visOcc = Array.from({ length: 24 }, () => Array(12).fill(0));
  const tempBoard = eng.board.map(row => row.slice());
  for (let vr = 0; vr < 24; vr++) {
    for (let c = 0; c < 12; c++) {
      visOcc[vr][c] = st[19 + (vr + 4) * 12 + c];
    }
  }
  if (!eng.gameOver && eng.activePiece) {
    const pid = PIECE_ID_TO_NUM[eng.activePiece.def.id];
    const cells = eng.getPieceWorldCells(eng.activePiece);
    for (const [r, c] of cells) {
      if (r >= 0 && r < 28 && c >= 0 && c < 12) {
        tempBoard[r][c] = { color: eng.activePiece.def.color };
        if (r >= 4) visOcc[r - 4][c] = pid;
      }
    }
  }

  // 1. Check centroid pixel of all 288 visible cells
  for (let vr = 0; vr < 24; vr++) {
    for (let c = 0; c < 12; c++) {
      const isUp = (((vr + 4) + c) & 1) === 0;
      const sx = 15 + c * 5 + 5;
      const sy = 24 + vr * 6 + (isUp ? 4 : 2);
      const px = readFbPixel(vm, T, sx, sy);
      const pid = visOcc[vr][c];
      const expCol = pid === 0 ? -350 : PIECE_COLORS[pid - 1];
      if (px !== expCol) {
        throw new Error(`${label} screen centroid (${vr},${c}) at (${sx},${sy}): got ${px}, expected ${expCol} (pid=${pid})`);
      }
    }
  }

  // 2. Read 288-char T/Z/F readout off framebuffer at (173, 24)
  let fbTzf = '';
  for (let vr = 0; vr < 24; vr++) {
    for (let c = 0; c < 12; c++) {
      const x0 = 173 + c * 6;
      const y0 = 24 + vr * 6;
      const p01 = readFbPixel(vm, T, x0 + 0, y0 + 1) !== -364;
      const p21 = readFbPixel(vm, T, x0 + 2, y0 + 1) !== -364;
      const p04 = readFbPixel(vm, T, x0 + 0, y0 + 4) !== -364;
      if (!p01 && p21 && !p04) fbTzf += 'T';
      else if (!p01 && !p21 && p04) fbTzf += 'Z';
      else if (p01 && !p21 && p04) fbTzf += 'F';
      else {
        throw new Error(`${label} unreadable TZF glyph at (${vr},${c}) (${x0},${y0}): p01=${p01} p21=${p21} p04=${p04}`);
      }
    }
  }
  const refTzf = ref.encodeBoardBalancedTernary(tempBoard, false);
  if (fbTzf !== refTzf) {
    throw new Error(`${label} screen T/Z/F mismatch`);
  }
}

function runDifferentialScenario(T, buildOpts = {}, maxRuns = 90) {
  const ref = loadTrytrisReference();
  let vm = null;

  const rng = makeRng(0xCAFEBABE);
  const modes = ['NORMAL', 'CURSED', 'HEXIAMOND'];
  const seeds = [0, 1, 42, 4294967295];
  while (seeds.length < 30) {
    seeds.push(rng.u32());
  }

  let curMenuMode = 0;
  let curMenuLevel = 1;
  let statesCompared = 0;
  let screenSnapshotsChecked = 0;
  let gameOverRuns = 0;
  let cursedLv4Count = 0;
  let cursedLv5Count = 0;
  let firstDivergence = null;
  let runIdx = 0;

  for (let si = 0; si < seeds.length; si++) {
    for (let mi = 0; mi < modes.length; mi++) {
      if (runIdx >= maxRuns) break;
      if (runIdx % 5 === 0) {
        // TritonWASM kbdQueue has a 2048-event cap per boot; boot fresh every 5 runs (~1550 keys)
        vm = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
        T.bootTritOSDesktop(vm, false, buildOpts);
        vm.run(300000);
        const m = makeMouseTracker(vm);
        m.click(710, 472, 600000);
        vm.pushKeyEvent('K'.charCodeAt(0), 0);
        vm.run(300000);
        curMenuMode = 0;
        curMenuLevel = 1;
      }
      const seed = seeds[si];
      const modeName = modes[mi];
      let startLevel = 1;
      if (modeName === 'CURSED') {
        if (si % 3 === 1) { startLevel = 4; cursedLv4Count++; }
        else if (si % 3 === 2) { startLevel = 5; cursedLv5Count++; }
      }

      const menuKeys = [];
      for (const ch of String(seed)) menuKeys.push(ch.charCodeAt(0));
      const mPresses = (mi - curMenuMode + 3) % 3;
      for (let k = 0; k < mPresses; k++) menuKeys.push('M'.charCodeAt(0));
      curMenuMode = mi;
      const uPresses = (startLevel - curMenuLevel + 15) % 15;
      for (let k = 0; k < uPresses; k++) menuKeys.push('U'.charCodeAt(0));
      curMenuLevel = startLevel;
      for (let p = 0; p < menuKeys.length; p += 5) {
        for (let q = p; q < Math.min(menuKeys.length, p + 5); q++) vm.pushKeyEvent(menuKeys[q], 0);
        vm.run(250000);
      }
      vm.pushKeyEvent(13, 0); // Enter: start new game
      vm.run(600000);

      const eng = new ref.TrytrisEngine({ seed, mode: modeName });
      eng.setLevel(startLevel);

      const perAction = (si === 0); // 3 runs (1 per mode) compared after EVERY action
      const actionSeq = [];
      for (let a = 0; a < 300; a++) {
        // Bias slightly toward HARD/DOWN so games naturally clear lines & reach game over
        const r = rng.int(0, 99);
        let actIdx;
        if (r < 22) actIdx = 0;      // L
        else if (r < 44) actIdx = 1; // R
        else if (r < 58) actIdx = 2; // X
        else if (r < 68) actIdx = 3; // Z
        else if (r < 85) actIdx = 4; // Space (HARD)
        else if (r < 93) actIdx = 5; // N
        else actIdx = 6;             // S
        actionSeq.push(actIdx);
      }

      if (perAction) {
        const st0 = readDiskFileTrytes(vm, T, 'TRYSTATE');
        const diff0 = compareState(st0, eng, ref, `run=${runIdx}(${modeName},s=${seed},lv=${startLevel}) init`);
        statesCompared++;
        if (diff0 && !firstDivergence) { firstDivergence = diff0; if (maxRuns < 90) return { statesCompared, firstDivergence }; }

        for (let a = 0; a < actionSeq.length; a++) {
          const act = ACTIONS[actionSeq[a]];
          vm.pushKeyEvent(act.key, 0);
          vm.run(600000);
          act.call(eng);
          const st = readDiskFileTrytes(vm, T, 'TRYSTATE');
          const diff = compareState(st, eng, ref, `run=${runIdx}(${modeName},s=${seed},lv=${startLevel}) act=${a}(${act.name})`);
          statesCompared++;
          if (diff && !firstDivergence) {
            firstDivergence = diff;
            if (maxRuns < 90) return { statesCompared, firstDivergence };
          }
          // Take 6 screen snapshots during perAction runs (18 of 20)
          if (screenSnapshotsChecked < 20 && (a === 10 || a === 50 || a === 100 || a === 150 || a === 200 || a === 250)) {
            vm.run(600000); // ensure idle redraw completed
            checkScreenSnapshot(vm, T, st, eng, ref, `snap=${screenSnapshotsChecked}`);
            screenSnapshotsChecked++;
          }
        }
      } else {
        // Batch up to 13 keys at a time, comparing every 25 actions + final
        for (let start = 0; start < 300; start += 25) {
          const end = Math.min(300, start + 25);
          for (let pos = start; pos < end; pos += 8) {
            const subEnd = Math.min(end, pos + 8);
            for (let a = pos; a < subEnd; a++) {
              const act = ACTIONS[actionSeq[a]];
              vm.pushKeyEvent(act.key, 0);
              act.call(eng);
            }
            vm.run(600000);
          }
          const st = readDiskFileTrytes(vm, T, 'TRYSTATE');
          const diff = compareState(st, eng, ref, `run=${runIdx}(${modeName},s=${seed},lv=${startLevel}) act=${end - 1}`);
          statesCompared++;
          if (diff && !firstDivergence) {
            firstDivergence = diff;
            if (maxRuns < 90) return { statesCompared, firstDivergence };
          }
          if (screenSnapshotsChecked < 20 && end === 150) {
            vm.run(250000);
            checkScreenSnapshot(vm, T, st, eng, ref, `snap=${screenSnapshotsChecked}`);
            screenSnapshotsChecked++;
          }
        }
      }

      if (eng.gameOver) gameOverRuns++;
      runIdx++;
    }
    if (runIdx >= maxRuns) break;
  }

  return {
    runs: runIdx,
    statesCompared,
    screenSnapshotsChecked,
    gameOverRuns,
    cursedLv4Count,
    cursedLv5Count,
    firstDivergence
  };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const res = runDifferentialScenario(T, {}, 90);
  if (res.firstDivergence) {
    throw new Error('Lockstep differential failed: ' + res.firstDivergence);
  }
  if (res.screenSnapshotsChecked !== 20) {
    throw new Error('Expected 20 screen snapshots checked, got ' + res.screenSnapshotsChecked);
  }
  if (res.gameOverRuns === 0) {
    throw new Error('Expected at least 1 run to reach game over');
  }
  return {
    name: '23-trytris-differential-and-screen',
    status: 'PASS',
    ...res
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest, runDifferentialScenario };
