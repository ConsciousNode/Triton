'use strict';
const { loadHtmlModule, readFbPixel, readDiskFileTrytes, makeMouseTracker } = require('./t3-common.js');
const { loadTrytrisReference, PIECE_ID_TO_NUM } = require('./trytris-ref.js');

const KEY_TO_ACT = {
  L: 'LEFT',
  R: 'RIGHT',
  X: 'ROT_CW',
  Z: 'ROT_CCW',
  ' ': 'HARD',
  N: null
};

function readTzfFromScreen(vm, T) {
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
        throw new Error(`Unreadable TZF glyph at (${vr},${c}) (${x0},${y0})`);
      }
    }
  }
  return fbTzf;
}

function runNegationCase(T, ref, seed, keyStr, expectedClear, buildOpts = {}) {
  const vm = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  T.bootTritOSDesktop(vm, false, buildOpts);
  vm.run(300000);
  const m = makeMouseTracker(vm);
  m.click(710, 472, 600000);
  vm.pushKeyEvent('K'.charCodeAt(0), 0);
  vm.run(300000);

  for (const ch of String(seed)) vm.pushKeyEvent(ch.charCodeAt(0), 0);
  vm.run(200000);
  vm.pushKeyEvent(13, 0);
  vm.run(600000);

  const eng = new ref.TrytrisEngine({ seed, mode: 'NORMAL' });
  const keys = keyStr.split('');
  const prefix = keys.slice(0, -1);
  const finalKey = keys[keys.length - 1];

  for (let i = 0; i < prefix.length; i += 8) {
    const end = Math.min(prefix.length, i + 8);
    for (let j = i; j < end; j++) {
      const k = prefix[j];
      vm.pushKeyEvent(k.charCodeAt(0), 0);
      eng.tick(KEY_TO_ACT[k]);
    }
    vm.run(600000);
  }
  vm.run(300000);

  const stBefore = readDiskFileTrytes(vm, T, 'TRYSTATE');
  const linesBefore = stBefore[7];
  const refTzfBefore = ref.encodeBoardBalancedTernary(eng.board, false);
  const scrTzfBefore = readTzfFromScreen(vm, T);
  const refWithActBefore = ref.encodeBoardBalancedTernary(
    eng.board.map((row, r) => row.map((cell, c) => {
      if (eng.activePiece && eng.getPieceWorldCells(eng.activePiece).some(([pr, pc]) => pr === r && pc === c)) {
        return { color: eng.activePiece.def.color };
      }
      return cell;
    })), false
  );
  if (scrTzfBefore !== refWithActBefore) {
    throw new Error(`Before-clear screen T/Z/F mismatch for seed=${seed}`);
  }

  // Trigger the clearing hard drop
  vm.pushKeyEvent(finalKey.charCodeAt(0), 0);
  vm.run(600000);
  eng.tick(KEY_TO_ACT[finalKey]);

  const stAfter = readDiskFileTrytes(vm, T, 'TRYSTATE');
  const linesAfter = stAfter[7];
  if (linesAfter - linesBefore !== expectedClear) {
    throw new Error(`Expected ${expectedClear} cleared lines for seed=${seed}, got ${linesAfter - linesBefore}`);
  }
  if (linesAfter !== eng.lines) {
    throw new Error(`Lines mismatch: guest=${linesAfter} ref=${eng.lines}`);
  }

  // Verify board cells in TRYSTATE match reference
  for (let r = 0; r < 28; r++) {
    for (let c = 0; c < 12; c++) {
      const gCell = stAfter[19 + r * 12 + c];
      const rCell = eng.board[r][c] ? PIECE_ID_TO_NUM[eng.board[r][c].pieceId] : 0;
      if (gCell !== rCell) {
        throw new Error(`Board mismatch after clear at (${r},${c}): guest=${gCell} ref=${rCell}`);
      }
    }
  }

  // Verify screen T/Z/F matches reference after clear
  const scrTzfAfter = readTzfFromScreen(vm, T);
  const refWithActAfter = ref.encodeBoardBalancedTernary(
    eng.board.map((row, r) => row.map((cell, c) => {
      if (!eng.gameOver && eng.activePiece && eng.getPieceWorldCells(eng.activePiece).some(([pr, pc]) => pr === r && pc === c)) {
        return { color: eng.activePiece.def.color };
      }
      return cell;
    })), false
  );
  if (scrTzfAfter !== refWithActAfter) {
    throw new Error(`After-clear screen T/Z/F mismatch for seed=${seed}`);
  }

  // Verify Ternary Negation on previously locked cells above the cleared row(s)
  // Find lowest cleared-row index by checking which rows above row 26 had occupied locked cells before
  let flippedChecked = 0;
  let unflippedChecked = 0;
  // Find highest row with locked cells that was NOT cleared by checking lowest non-empty row in stBefore that disappeared,
  // or simply check rows strictly above the highest row that had >= 8 locked cells in stBefore (the cleared row is at >= 25)
  // Actually, find the exact cleared rows by comparing row signatures: the lowest row in stAfter that matches stBefore[r]
  // Find the highest (smallest r) row with >= 8 locked cells in stBefore (or any row that disappeared)
  let highestCleared = 28;
  for (let r = 4; r < 28; r++) {
    let cnt = 0;
    for (let c = 0; c < 12; c++) if (stBefore[19 + r * 12 + c] !== 0) cnt++;
    if (cnt >= 8) { highestCleared = r; break; }
  }
  const lowestCleared = highestCleared;
  for (let vr = 0; vr < 24; vr++) {
    const r = vr + 4;
    if (r >= lowestCleared) continue;
    const dstR = r + expectedClear;
    if (dstR >= 28) continue;
    for (let c = 0; c < 12; c++) {
      const wasLocked = stBefore[19 + r * 12 + c] !== 0;
      if (wasLocked) {
        const chBefore = refTzfBefore[vr * 12 + c];
        const chAfter = ref.encodeBoardBalancedTernary(eng.board, false)[(vr + expectedClear) * 12 + c];
        if (expectedClear % 2 === 1) {
          const expectedFlip = chBefore === 'T' ? 'F' : (chBefore === 'F' ? 'T' : 'Z');
          if (chAfter !== expectedFlip) {
            throw new Error(`Odd clear did not flip (${r},${c}): before=${chBefore} after=${chAfter}`);
          }
          flippedChecked++;
        } else {
          if (chAfter !== chBefore) {
            throw new Error(`Even clear unexpectedly flipped (${r},${c}): before=${chBefore} after=${chAfter}`);
          }
          unflippedChecked++;
        }
      }
    }
  }
  if (expectedClear % 2 === 1 && flippedChecked === 0) {
    throw new Error('Odd clear had 0 occupied cells above to verify flip');
  }
  if (expectedClear % 2 === 0 && unflippedChecked === 0) {
    throw new Error('Even clear had 0 occupied cells above to verify non-flip');
  }

  return { seed, expectedClear, linesAfter, flippedChecked, unflippedChecked };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const ref = loadTrytrisReference();
  const oddRes = runNegationCase(T, ref, 0, 'XXRRR XXXLLLL XXXXLL XXXXX RR XRRRR XXLLL ', 1);
  const evenRes = runNegationCase(T, ref, 248, 'XR XXRRR XXXLLLL XXXXLL XXXXX RR XRRRR XXLLL XXXL XXXXR XXXXXRRR LLLL XLL XX XXXRR XXXXRRRR XXXXXLLL L XR XXRRR ', 2);
  return {
    name: '24-trytris-negation',
    status: 'PASS',
    oddRes,
    evenRes
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest, runNegationCase };
