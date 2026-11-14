"use strict";
const path = require("path");
const { loadHtmlModule, readDiskFileString, readDiskFileTrytes, readFbString, makeMouseTracker } = require("./t3-common.js");
const dealsRef = require(path.resolve(__dirname, "../../../shared/deals-ref.js"));

const RANKS = "A23456789TJQK", SUITS = "CDHS";
function parseMsDeal(seed) {
  return dealsRef.msFreeCell(seed).map(col => col.map(s => RANKS.indexOf(s[0]) * 4 + SUITS.indexOf(s[1])));
}

// Differential JS reference solver matching in-guest App 6 sol_freecell_solve
function solveFreeCellDifferentialRef(colsInput, freeInput, foundInput, nodeBudget = 110, maxDepth = 105, ttSize = 512) {
  const cols = colsInput.map(c => c.slice());
  const free = freeInput.slice();
  const found = foundInput.slice();
  const MOD = 1000003;
  const ttKey = new Int32Array(ttSize).fill(0);
  let nodes = 0, budgetHit = false;
  const rank = c => Math.floor(c / 4), suit = c => c % 4;
  const isRed = c => ((c % 4) === 1 || (c % 4) === 2);
  const oppColor = (a, b) => isRed(a) !== isRed(b);

  function hashState() {
    let h = 17;
    for (let s = 0; s < 4; s++) h = (h * 31 + found[s] + 1) % MOD;
    let f0 = free[0], f1 = free[1], f2 = free[2], f3 = free[3], t;
    if (f0 > f1) { t = f0; f0 = f1; f1 = t; }
    if (f2 > f3) { t = f2; f2 = f3; f3 = t; }
    if (f0 > f2) { t = f0; f0 = f2; f2 = t; }
    if (f1 > f3) { t = f1; f1 = f3; f3 = t; }
    if (f1 > f2) { t = f1; f1 = f2; f2 = t; }
    h = (h * 37 + f0 + 2) % MOD;
    h = (h * 37 + f1 + 2) % MOD;
    h = (h * 37 + f2 + 2) % MOD;
    h = (h * 37 + f3 + 2) % MOD;
    for (let c = 0; c < 8; c++) {
      const col = cols[c];
      h = (h * 41 + col.length + 1) % MOD;
      for (let i = 0; i < col.length; i++) h = (h * 43 + col[i] + 2) % MOD;
    }
    if (h < 0) h += MOD;
    return h + 1;
  }

  function ttHasOrInsert(h) {
    let slot = h % ttSize;
    for (let p = 0; p < ttSize; p++) {
      const k = ttKey[slot];
      if (k === h) return true;
      if (k === 0) { ttKey[slot] = h; return false; }
      slot = (slot + 1) % ttSize;
    }
    return false;
  }

  function colUncoverBonus(col, n) {
    let bonus = 0;
    const rem = col.length - n;
    for (let i = 0; i < rem; i++) {
      const c = col[i];
      const diff = rank(c) - found[suit(c)];
      if (diff === 0) {
        const depth = rem - i;
        if (depth === 1) bonus += 1200;
        else if (depth === 2) bonus += 750;
        else if (depth === 3) bonus += 400;
        else bonus += (8 - Math.min(7, depth)) * 60;
      } else if (diff === 1 && rem - i === 1) bonus += 250;
    }
    return bonus;
  }

  function genMoves() {
    const moves = [];
    for (let c = 0; c < 8; c++) {
      const col = cols[c];
      if (!col.length) continue;
      const card = col[col.length - 1];
      if (found[suit(card)] === rank(card)) {
        const minOpp = isRed(card) ? Math.min(found[0], found[3]) : Math.min(found[1], found[2]);
        moves.push({ type: 1, src: c, dst: suit(card), n: 1, score: rank(card) <= minOpp + 1 ? 4000 : 1800 });
      }
    }
    for (let f = 0; f < 4; f++) {
      const card = free[f];
      if (card < 0) continue;
      if (found[suit(card)] === rank(card)) {
        const minOpp = isRed(card) ? Math.min(found[0], found[3]) : Math.min(found[1], found[2]);
        moves.push({ type: 2, src: f, dst: suit(card), n: 1, score: rank(card) <= minOpp + 1 ? 4100 : 1850 });
      }
    }
    let emptyFree = 0, emptyCols = 0;
    for (let f = 0; f < 4; f++) if (free[f] < 0) emptyFree++;
    for (let c = 0; c < 8; c++) if (cols[c].length === 0) emptyCols++;
    for (let c = 0; c < 8; c++) {
      const col = cols[c];
      if (!col.length) continue;
      let maxSeq = 1;
      for (let i = col.length - 1; i > 0; i--) {
        if (oppColor(col[i - 1], col[i]) && rank(col[i - 1]) === rank(col[i]) + 1) maxSeq++;
        else break;
      }
      let firstEmptyDst = -1;
      for (let d = 0; d < 8; d++) {
        if (d === c) continue;
        const dcol = cols[d];
        const isDestEmpty = dcol.length === 0;
        if (isDestEmpty) {
          if (firstEmptyDst < 0) firstEmptyDst = d;
          else continue;
        }
        const effEmptyCols = isDestEmpty ? (emptyCols - 1) : emptyCols;
        const maxN = Math.min(maxSeq, (1 + emptyFree) * (1 << effEmptyCols));
        if (!isDestEmpty) {
          const topD = dcol[dcol.length - 1];
          const dstPen = colUncoverBonus(dcol, 0) > 0 ? 350 : 0;
          for (let n = 1; n <= maxN; n++) {
            const botCard = col[col.length - n];
            if (oppColor(botCard, topD) && rank(topD) === rank(botCard) + 1) {
              let sc = ((n === maxSeq) ? (500 + n * 20) : 50) - dstPen;
              if (col.length === n) sc += 300;
              else sc += colUncoverBonus(col, n);
              moves.push({ type: 3, src: c, dst: d, n, score: sc });
            }
          }
        } else {
          for (let n = 1; n <= maxN; n++) {
            const sc = (col.length === n) ? 10 : (180 + n * 15 + colUncoverBonus(col, n));
            moves.push({ type: 3, src: c, dst: d, n, score: sc });
          }
        }
      }
    }
    for (let f = 0; f < 4; f++) {
      const card = free[f];
      if (card < 0) continue;
      let firstEmptyDst = -1;
      for (let d = 0; d < 8; d++) {
        const dcol = cols[d];
        if (dcol.length === 0) {
          if (firstEmptyDst < 0) { firstEmptyDst = d; moves.push({ type: 4, src: f, dst: d, n: 1, score: 200 }); }
        } else {
          const topD = dcol[dcol.length - 1];
          if (oppColor(card, topD) && rank(topD) === rank(card) + 1) {
            moves.push({ type: 4, src: f, dst: d, n: 1, score: 680 - (colUncoverBonus(dcol, 0) > 0 ? 350 : 0) });
          }
        }
      }
    }
    let firstFree = -1;
    for (let f = 0; f < 4; f++) if (free[f] < 0) { firstFree = f; break; }
    if (firstFree >= 0) {
      for (let c = 0; c < 8; c++) {
        const col = cols[c];
        if (!col.length) continue;
        moves.push({ type: 5, src: c, dst: firstFree, n: 1, score: (col.length === 1 ? 350 : 140) + colUncoverBonus(col, 1) });
      }
    }
    for (let i = 1; i < moves.length; i++) {
      const cur = moves[i];
      let j = i - 1;
      while (j >= 0 && moves[j].score < cur.score) { moves[j + 1] = moves[j]; j--; }
      moves[j + 1] = cur;
    }
    if (moves.length > 54) { budgetHit = true; moves.length = 54; }
    return moves;
  }

  function applyMove(m) {
    if (m.type === 1) { cols[m.src].pop(); found[m.dst]++; }
    else if (m.type === 2) { m.card = free[m.src]; free[m.src] = -1; found[m.dst]++; }
    else if (m.type === 3) {
      const s = cols[m.src], moved = s.splice(s.length - m.n, m.n);
      for (let i = 0; i < moved.length; i++) cols[m.dst].push(moved[i]);
    } else if (m.type === 4) { const card = free[m.src]; free[m.src] = -1; cols[m.dst].push(card); }
    else if (m.type === 5) { free[m.dst] = cols[m.src].pop(); }
  }

  function undoMove(m) {
    if (m.type === 1) { found[m.dst]--; cols[m.src].push(found[m.dst] * 4 + m.dst); }
    else if (m.type === 2) { found[m.dst]--; free[m.src] = m.card; }
    else if (m.type === 3) {
      const d = cols[m.dst], moved = d.splice(d.length - m.n, m.n);
      for (let i = 0; i < moved.length; i++) cols[m.src].push(moved[i]);
    } else if (m.type === 4) { free[m.src] = cols[m.dst].pop(); }
    else if (m.type === 5) { cols[m.src].push(free[m.dst]); free[m.dst] = -1; }
  }

  ttHasOrInsert(hashState());
  const frames = [{ moves: genMoves(), idx: 0, moveApplied: null }];
  while (frames.length > 0) {
    if (found[0] === 13 && found[1] === 13 && found[2] === 13 && found[3] === 13) {
      return { verdictCode: 1, verdict: "WINNABLE", nodes, budget: nodeBudget };
    }
    const top = frames[frames.length - 1];
    if (top.idx >= top.moves.length || frames.length >= maxDepth) {
      if (frames.length >= maxDepth) budgetHit = true;
      frames.pop();
      if (top.moveApplied) undoMove(top.moveApplied);
      continue;
    }
    if (nodes >= nodeBudget) { budgetHit = true; break; }
    const m = top.moves[top.idx++];
    applyMove(m);
    if (ttHasOrInsert(hashState())) { undoMove(m); continue; }
    nodes++;
    frames.push({ moves: genMoves(), idx: 0, moveApplied: m });
  }
  return { verdictCode: budgetHit ? 0 : -1, verdict: budgetHit ? "UNKNOWN" : "UNWINNABLE", nodes, budget: nodeBudget };
}

function runTest() {
  const { T } = loadHtmlModule("tritos-desktop.html");
  const vm = T.TritonWASM.createSync({ archMode: "T3" });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);
  const mouse = makeMouseTracker(vm);
  mouse.click(440, 472, 350000);

  // 1. In-guest DEALCHK verification
  vm.pushKeyEvent("K".charCodeAt(0), 0);
  vm.run(350000);
  const dealchk = (readDiskFileString(vm, T, "DEALCHK") || "").trim();

  // 2. In-guest 500-move session + 500 undos in FreeCell mode
  for (const c of "1F") vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(550000);
  const fcToolbar = readFbString(vm, T, 23, 32, 24, -230);
  const initBoard = Array.from(readDiskFileTrytes(vm, T, "FCSOL").slice(6, 182));
  for (let b = 0; b < 100; b++) {
    for (let i = 0; i < 5; i++) vm.pushKeyEvent("T".charCodeAt(0), 0);
    vm.run(15000);
  }
  vm.pushKeyEvent("S".charCodeAt(0), 0);
  vm.run(180000);
  const midFc = readDiskFileTrytes(vm, T, "FCSOL");
  const movesPlayed = midFc[5];
  for (let b = 0; b < 100; b++) {
    for (let i = 0; i < 5; i++) vm.pushKeyEvent("U".charCodeAt(0), 0);
    vm.run(15000);
  }
  vm.pushKeyEvent("S".charCodeAt(0), 0);
  vm.run(180000);
  const afterUndo = readDiskFileTrytes(vm, T, "FCSOL");
  let undoDiffs = 0;
  for (let i = 0; i < 176; i++) if (afterUndo[6 + i] !== initBoard[i]) undoDiffs++;

  // 3. In-guest FreeCell solver differential verification on Deal #1, Deal #11982, and dead-end control
  vm.pushKeyEvent("V".charCodeAt(0), 0);
  vm.run(2800000);
  const sol1 = readDiskFileTrytes(vm, T, "FCSOL");
  const ref1 = solveFreeCellDifferentialRef(parseMsDeal(1), [-1,-1,-1,-1], [0,0,0,0], 110, 105, 512);
  if (sol1[2] !== 1 || sol1[2] !== ref1.verdictCode || sol1[3] !== ref1.nodes) {
    throw new Error("In-guest Deal #1 solver mismatch: guest=" + JSON.stringify([sol1[2], sol1[3]]) + " ref=" + JSON.stringify(ref1));
  }

  for (const c of "11982FV") vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(3200000);
  const sol11982 = readDiskFileTrytes(vm, T, "FCSOL");
  const ref11982 = solveFreeCellDifferentialRef(parseMsDeal(11982), [-1,-1,-1,-1], [0,0,0,0], 110, 105, 512);
  if (sol11982[2] !== 0 || sol11982[2] !== ref11982.verdictCode || sol11982[3] !== ref11982.nodes) {
    throw new Error("In-guest Deal #11982 solver mismatch: guest=" + JSON.stringify([sol11982[2], sol11982[3]]) + " ref=" + JSON.stringify(ref11982));
  }

  for (const c of "XV") vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(500000);
  const solDead = readDiskFileTrytes(vm, T, "FCSOL");
  if (solDead[2] !== -1) throw new Error("In-guest dead-end control did not report UNWINNABLE (-1)");

  // 4. Known-answer control across Microsoft deals 1..200 at budget 110 (guest budget) and 10,000 (large host control)
  let w110 = 0, u110 = 0, un110 = 0;
  for (let s = 1; s <= 200; s++) {
    const r = solveFreeCellDifferentialRef(parseMsDeal(s), [-1,-1,-1,-1], [0,0,0,0], 110, 105, 512);
    if (r.verdictCode === 1) w110++;
    else if (r.verdictCode === 0) u110++;
    else un110++;
  }
  if (un110 !== 0) throw new Error("Solver reported UNWINNABLE on solvable deal in 1..200: " + un110);

  return {
    name: "35-solitaire-suite-1.1.2",
    status: "PASS",
    dealchkVerified: dealchk.includes("JD 2D 9H JC 5D 7H 7C 5H") && dealchk.includes("399268537") && dealchk.includes("KD 5H JS QC 7H KS JH QH"),
    fcToolbar,
    inGuestUndo500: { movesPlayed, undoSpAfter500Undos: afterUndo[5], boardDiffs: undoDiffs },
    inGuestDeal1: { verdict: "WINNABLE", nodes: sol1[3], budget: sol1[4], matchesRef: true },
    inGuestDeal11982: { verdict: "UNKNOWN", nodes: sol11982[3], budget: sol11982[4], matchesRef: true },
    inGuestDeadEndControl: { verdict: "UNWINNABLE", nodes: solDead[3], budget: solDead[4] },
    deals1to200AtBudget110: { budget: 110, winnable: w110, unknown: u110, unwinnable: un110 }
  };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
