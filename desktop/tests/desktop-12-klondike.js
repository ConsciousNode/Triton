'use strict';
const { loadHtmlModule, readFbString, readDiskFileTrytes, makeMouseTracker } = require('./t3-common.js');

function dealKlondikeRef(seed, perturbShuffle = false) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  let s = seed;
  for (let i = 51; i >= 1; i--) {
    s = (s * 127 + 259) % 6561;
    if (s < 0) s += 6561;
    let j = s % (i + 1);
    if (perturbShuffle) j = 0;
    const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
  }
  const tab = Array.from({ length: 7 }, () => Array(19).fill(-1));
  const tabLen = [1, 2, 3, 4, 5, 6, 7];
  const tabDown = [0, 1, 2, 3, 4, 5, 6];
  let idx = 0;
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r <= c; r++) tab[c][r] = deck[idx++];
  }
  const stock = Array(24).fill(-1);
  for (let i = 0; i < 24; i++) stock[i] = deck[idx++];
  const waste = Array(24).fill(-1);
  return {
    seed, drawMode: 1, won: 0, moves: 0, illegal: 0,
    stockLen: 24, wasteLen: 0, foundLen: [0, 0, 0, 0],
    tabLen, tabDown, stock, waste, tab
  };
}

function encodeKlondikeRef(st) {
  const out = [
    st.seed, st.drawMode, st.won, st.moves, st.illegal,
    st.stockLen, st.wasteLen,
    ...st.foundLen, ...st.tabLen, ...st.tabDown,
    ...st.stock, ...st.waste
  ];
  for (let c = 0; c < 7; c++) out.push(...st.tab[c]);
  return out;
}

function getWinningMoves(seed) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  let s = seed;
  for (let i = 51; i >= 1; i--) {
    s = (s * 127 + 259) % 6561;
    if (s < 0) s += 6561;
    const j = s % (i + 1);
    const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
  }
  const tab = Array.from({ length: 7 }, () => []);
  const tabDown = [0, 1, 2, 3, 4, 5, 6];
  let idx = 0;
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r <= c; r++) tab[c].push(deck[idx++]);
  }
  const stock = [];
  for (let i = 0; i < 24; i++) stock.push(deck[idx++]);
  const st = { tab, tabDown, stock, waste: [], found: [0, 0, 0, 0] };
  const moves = [];
  for (let step = 0; step < 300; step++) {
    if (st.found[0] + st.found[1] + st.found[2] + st.found[3] === 52) break;
    let moved = false;
    if (st.waste.length > 0) {
      const card = st.waste[st.waste.length - 1];
      const suit = Math.floor(card / 13), rank = card % 13;
      if (st.found[suit] === rank) {
        st.waste.pop(); st.found[suit]++;
        moves.push({ type: 'drag', src: 7, idx: 0, dst: 8 + suit });
        moved = true; continue;
      }
    }
    for (let c = 0; c < 7; c++) {
      if (st.tab[c].length === 0) continue;
      const card = st.tab[c][st.tab[c].length - 1];
      const suit = Math.floor(card / 13), rank = card % 13;
      if (st.found[suit] === rank) {
        const i = st.tab[c].length - 1;
        st.tab[c].pop();
        if (st.tabDown[c] === i && i > 0) st.tabDown[c]--;
        st.found[suit]++;
        moves.push({ type: 'drag', src: c, idx: i, dst: 8 + suit });
        moved = true; break;
      }
    }
    if (moved) continue;
    for (let c = 0; c < 7; c++) {
      if (st.tab[c].length === 0) continue;
      const i = st.tabDown[c];
      const card = st.tab[c][i];
      const suit = Math.floor(card / 13), rank = card % 13;
      if (i === 0 && rank === 12) continue;
      for (let dc = 0; dc < 7; dc++) {
        if (dc === c) continue;
        if (st.tab[dc].length === 0) {
          if (rank === 12 && i > 0) {
            const moving = st.tab[c].splice(i);
            st.tab[dc].push(...moving);
            st.tabDown[c] = i - 1;
            moves.push({ type: 'drag', src: c, idx: i, dst: dc });
            moved = true; break;
          }
        } else {
          const top = st.tab[dc][st.tab[dc].length - 1];
          const tsuit = Math.floor(top / 13), trank = top % 13;
          if (((suit + tsuit) % 2 === 1) && rank + 1 === trank) {
            const moving = st.tab[c].splice(i);
            st.tab[dc].push(...moving);
            if (i > 0) st.tabDown[c] = i - 1;
            moves.push({ type: 'drag', src: c, idx: i, dst: dc });
            moved = true; break;
          }
        }
      }
      if (moved) break;
    }
    if (moved) continue;
    if (st.waste.length > 0) {
      const card = st.waste[st.waste.length - 1];
      const suit = Math.floor(card / 13), rank = card % 13;
      for (let dc = 0; dc < 7; dc++) {
        if (st.tab[dc].length === 0) {
          if (rank === 12) {
            st.waste.pop(); st.tab[dc].push(card);
            moves.push({ type: 'drag', src: 7, idx: 0, dst: dc });
            moved = true; break;
          }
        } else {
          const top = st.tab[dc][st.tab[dc].length - 1];
          const tsuit = Math.floor(top / 13), trank = top % 13;
          if (((suit + tsuit) % 2 === 1) && rank + 1 === trank) {
            st.waste.pop(); st.tab[dc].push(card);
            moves.push({ type: 'drag', src: 7, idx: 0, dst: dc });
            moved = true; break;
          }
        }
      }
      if (moved) continue;
    }
    if (st.stock.length > 0) {
      st.waste.push(st.stock.pop());
    } else {
      st.stock = st.waste.reverse();
      st.waste = [];
    }
    moves.push({ type: 'draw' });
  }
  return moves;
}

function pileCoords(pile, idx = 0) {
  const ox = 19, oy = 30;
  if (pile === 7) return [ox + 45, oy + 20];
  if (pile >= 8) return [ox + 95 + (pile - 8) * 30, oy + 20];
  return [ox + 12 + pile * 30, oy + 40 + idx * 5];
}

function runKlondikeScenario(T, perturbShuffle = false) {
  const vm = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm, false, perturbShuffle ? { perturbShuffle: true } : {});
  vm.run(300000);
  const mouse = makeMouseTracker(vm);

  // Launch Klondike Solitaire (App 6) via taskbar click at (440, 472)
  mouse.click(440, 472, 350000);

  // 1. Verify dealt layout for 3 seeds (1, 42, 4456) against unperturbed JS reference
  const seedDiffs = {};
  for (const seed of [1, 42, 4456]) {
    for (const ch of String(seed) + 'NS') vm.pushKeyEvent(ch.charCodeAt(0), 0);
    vm.run(280000);
    const got = readDiskFileTrytes(vm, T, 'SOL');
    const exp = encodeKlondikeRef(dealKlondikeRef(seed, false));
    let diffs = 0;
    if (!got || got.length !== exp.length) diffs = 999;
    else {
      for (let i = 0; i < exp.length; i++) if (got[i] !== exp[i]) diffs++;
    }
    seedDiffs[seed] = diffs;
  }

  // 2. Execute 20 illegal moves (refused) + 20 legal moves (accepted), then complete all 100 moves to win on seed 4456
  const winMoves = getWinningMoves(4456);
  for (let i = 0; i < 20; i++) mouse.click(19 + 2, 30 + 20, 0);
  for (let i = 0; i < 20; i++) {
    const m = winMoves[i];
    if (m.type === 'draw') mouse.click(19 + 15, 30 + 20, 0);
    else {
      const [x1, y1] = pileCoords(m.src, m.idx);
      const [x2, y2] = pileCoords(m.dst, 0);
      mouse.drag(x1, y1, x2, y2, 0);
    }
  }
  vm.run(500000);
  vm.pushKeyEvent('S'.charCodeAt(0), 0);
  vm.run(200000);
  const midSol = readDiskFileTrytes(vm, T, 'SOL');
  const midLegal = midSol ? midSol[3] : -1;
  const midIllegal = midSol ? midSol[4] : -1;

  // Complete the remaining moves to reach the win screen!
  for (let i = 20; i < winMoves.length; i++) {
    const m = winMoves[i];
    if (m.type === 'draw') mouse.click(19 + 15, 30 + 20, 0);
    else {
      const [x1, y1] = pileCoords(m.src, m.idx);
      const [x2, y2] = pileCoords(m.dst, 0);
      mouse.drag(x1, y1, x2, y2, 0);
    }
  }
  vm.run(1200000);
  vm.pushKeyEvent('S'.charCodeAt(0), 0);
  vm.run(250000);
  const finalSol = readDiskFileTrytes(vm, T, 'SOL');
  const wonFlag = finalSol ? finalSol[2] : 0;
  const totalMoves = finalSol ? finalSol[3] : 0;
  const foundations = finalSol ? finalSol.slice(7, 11) : [0, 0, 0, 0];
  // Check MMIO framebuffer at client (32, 66) -> screen (51, 96), bg = 76 (COL_GREEN) for "YOU WIN! SOLITAIRE!"
  const winBanner = readFbString(vm, T, 51, 96, 19, 76);

  return {
    seedDiffs,
    midLegal,
    midIllegal,
    wonFlag,
    totalMoves,
    foundations,
    winBanner
  };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const res = runKlondikeScenario(T, false);
  if (res.seedDiffs[1] !== 0 || res.seedDiffs[42] !== 0 || res.seedDiffs[4456] !== 0) {
    throw new Error('Klondike deal mismatch vs JS reference: ' + JSON.stringify(res.seedDiffs));
  }
  if (res.midLegal !== 20 || res.midIllegal !== 20) {
    throw new Error('Expected 20 legal moves and 20 illegal moves, got legal=' + res.midLegal + ' illegal=' + res.midIllegal);
  }
  if (res.wonFlag !== 1 || res.winBanner !== 'YOU WIN! SOLITAIRE!') {
    throw new Error('Klondike win state or MMIO banner failed: won=' + res.wonFlag + ' banner=' + res.winBanner);
  }
  return { name: '12-klondike-solitaire', status: 'PASS', ...res };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest, runKlondikeScenario };
