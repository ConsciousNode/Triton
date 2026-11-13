// Kehai's independent lockstep differential for TritOS App 11 (Trytris).
// Own seeds, own action profiles, own TRYSTATE parser, own reference loader.
// Usage: node kehai-diff.js <desktopDir> <trytrisIndexHtml> [runs] [perturb]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const [desktopDir, refHtml, runsArg] = process.argv.slice(2);
const RUNS = +(runsArg || 60);
const common = require(path.join(desktopDir, 'tests', 't3-common.js'));

// ---- reference engine, sliced by markers, run unmodified in a bare context
function loadRef() {
  const lines = fs.readFileSync(refHtml, 'utf8').split('\n');
  const s = lines.findIndex(l => l.includes('[LIFT-1] Mulberry32')) - 1;
  const e = lines.findIndex((l, i) => i > s && l.includes('IN-BROWSER SELF-TEST SUITE')) - 1;
  const src = lines.slice(s, e).join('\n');
  const ctx = { Set, Map, Math, JSON, Array, Object, String, Number, Boolean, isNaN, Infinity, NaN };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.E=TrytrisEngine;this.norm=normalizeSeed;', ctx);
  return { E: ctx.E, norm: ctx.norm, sha: crypto.createHash('sha256').update(src).digest('hex') };
}

// ---- my own tryte-file parser (independent of Hydrogen's compareState)
const IDS = [null, 'P1', 'P2', 'P3', 'P4', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10', 'H11', 'H12'];
const MODES = ['NORMAL', 'CURSED', 'HEXIAMOND'];
function word(a, o) { // 3 balanced 9-trit trytes, little-endian, base 3^9
  return a[o] + a[o + 1] * 19683 + a[o + 2] * 19683 * 19683;
}
function u32(x) { return ((x % 4294967296) + 4294967296) % 4294967296; }
function parse(st) {
  if (!st || st.length !== 355) return null;
  const board = [];
  for (let r = 0; r < 28; r++) board.push(st.slice(19 + r * 12, 31 + r * 12).map(v => IDS[v] || (v ? '?' + v : null)));
  return {
    seed: u32(word(st, 0)), mode: MODES[st[3]], score: word(st, 4), lines: st[7], level: st[8],
    combo: st[9], b2b: !!st[10], over: !!st[11],
    act: st[12] ? [IDS[st[12]], st[13], st[14], st[15]] : null,
    next: [IDS[st[16]], IDS[st[17]], IDS[st[18]]], board
  };
}
function snapRef(e, norm) {
  return {
    seed: u32(norm(e.seed)), mode: e.mode, score: e.score, lines: e.lines, level: e.level,
    combo: e.comboStreak, b2b: !!e.backToBackActive, over: !!e.gameOver,
    act: e.activePiece ? [e.activePiece.def.id, e.activePiece.rotIndex, e.activePiece.r, e.activePiece.c] : null,
    next: e.bagGen.peekPreview(e.mode, e.level, 3).map(p => p.id),
    board: e.board.map(row => row.map(c => c ? c.pieceId : null))
  };
}
function diff(g, r) {
  if (!g) return 'TRYSTATE missing/bad length';
  for (const k of Object.keys(r)) {
    const a = JSON.stringify(g[k]), b = JSON.stringify(r[k]);
    if (a !== b) {
      if (k === 'board') for (let i = 0; i < 28; i++) for (let j = 0; j < 12; j++)
        if (g.board[i][j] !== r.board[i][j]) return `board(${i},${j}) guest=${g.board[i][j]} ref=${r.board[i][j]}`;
      return `${k} guest=${a} ref=${b}`;
    }
  }
  return null;
}

// ---- my own PRNG (xorshift32) for seeds and scripts
let xs = 0x4B454841; // "KEHA"
function rnd() { xs ^= xs << 13; xs >>>= 0; xs ^= xs >>> 17; xs ^= xs << 5; xs >>>= 0; return xs; }
const K = c => c.charCodeAt(0);
const ACT = { L: [K('L'), e => e.tick('LEFT')], R: [K('R'), e => e.tick('RIGHT')], X: [K('X'), e => e.tick('ROT_CW')],
  Z: [K('Z'), e => e.tick('ROT_CCW')], H: [32, e => e.tick('HARD')], N: [K('N'), e => e.tick(null)], S: [K('S'), e => e.softDrop()] };
const PROFILES = {
  uniform: () => 'LRXZHNS'[rnd() % 7],
  wallhug: () => { const p = rnd() % 10; return p < 4 ? 'L' : p < 6 ? 'X' : p < 7 ? 'Z' : p < 8 ? 'N' : p < 9 ? 'S' : 'H'; },
  rightwall: () => { const p = rnd() % 10; return p < 4 ? 'R' : p < 6 ? 'Z' : p < 7 ? 'X' : p < 9 ? 'S' : 'H'; },
  gravity: () => { const p = rnd() % 10; return p < 6 ? 'N' : p < 8 ? 'S' : 'LRXZ'[rnd() % 4]; },
  stacker: () => { const p = rnd() % 10; return p < 5 ? 'H' : 'LRXZ'[rnd() % 4]; }
};

const ref = loadRef();
function replay(seed, mode, level, hist) { const e = new ref.E({ seed, mode }); e.setLevel(level); for (const h of hist) ACT[h][1](e); return e; }
function evalBoard(e) { // lines first, then low stack, few holes
  let holes = 0, top = 28; for (let c = 0; c < 12; c++) { let seen = false; for (let r = 0; r < 28; r++) { if (e.board[r][c]) { seen = true; top = Math.min(top, r); } else if (seen) holes++; } }
  return e.lines * 1000 + top * 10 - holes * 3 - (e.gameOver ? 1e6 : 0);
}
function planGreedy(seed, mode, level, hist) {
  let best = null, bestV = -Infinity;
  for (let rot = 0; rot < 6; rot++) for (let sh = -6; sh <= 6; sh++) {
    const plan = [...Array(rot).fill('X'), ...Array(Math.abs(sh)).fill(sh < 0 ? 'L' : 'R'), 'H'];
    const e = replay(seed, mode, level, [...hist, ...plan]); const v = evalBoard(e);
    if (v > bestV) { bestV = v; best = plan; }
  }
  return best;
}
const { T } = common.loadHtmlModule('tritos-desktop.html');
let machine = null, keysThisBoot = 0, menuMode = 0, menuLevel = 1;
function boot() {
  machine = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  T.bootTritOSDesktop(machine, false, {});
  machine.run(300000);
  common.makeMouseTracker(machine).click(710, 472, 600000);
  machine.pushKeyEvent(K('K'), 0); machine.run(300000);
  keysThisBoot = 1; menuMode = 0; menuLevel = 1;
}
function key(c) { machine.pushKeyEvent(c, 0); keysThisBoot++; }

const out = { refSha: ref.sha, runs: 0, statesCompared: 0, gameOvers: 0, boots: 0, linesMax: 0, maxLevelSeen: 0,
  profiles: {}, modes: {}, firstDivergence: null };
for (let run = 0; run < RUNS && !out.firstDivergence; run++) {
  const seed = run === 0 ? 4294967295 : run === 1 ? 7 : rnd();
  const mi = rnd() % 3, level = 1 + (rnd() % 15);
  const PN = [...Object.keys(PROFILES), 'greedy']; const pname = process.env.ONLY || PN[run % PN.length];
  const nActs = 150 + (rnd() % 250);
  if (!machine || keysThisBoot + 40 + nActs > 2000) { boot(); out.boots++; }
  const menu = [...String(seed)].map(K);
  for (let k = 0; k < (mi - menuMode + 3) % 3; k++) menu.push(K('M'));
  const up = (level - menuLevel + 15) % 15, down = (menuLevel - level + 15) % 15;
  for (let k = 0; k < Math.min(up, down); k++) menu.push(up <= down ? K('U') : K('D'));
  menuMode = mi; menuLevel = level;
  for (let i = 0; i < menu.length; i += 5) { menu.slice(i, i + 5).forEach(key); machine.run(250000); }
  key(13); machine.run(600000);
  const eng = new ref.E({ seed, mode: MODES[mi] }); eng.setLevel(level);
  let d = diff(parse(common.readDiskFileTrytes(machine, T, 'TRYSTATE')), snapRef(eng, ref.norm));
  if (d) { out.firstDivergence = `run ${run} start (seed ${seed} ${MODES[mi]} L${level}): ${d}`; break; }
  out.statesCompared++;
  const hist = []; let queue = [];
  for (let a = 0; a < nActs; a++) {
    if (pname === 'greedy' && !queue.length) queue = planGreedy(seed, MODES[mi], level, hist);
    const name = pname === 'greedy' ? queue.shift() : PROFILES[pname](); hist.push(name);
    key(ACT[name][0]); machine.run(+(process.env.STEPS||600000)); ACT[name][1](eng);
    d = diff(parse(common.readDiskFileTrytes(machine, T, 'TRYSTATE')), snapRef(eng, ref.norm));
    out.statesCompared++;
    if (d) { out.firstDivergence = `run ${run} act ${a} ${name} (seed ${seed} ${MODES[mi]} L${level} ${pname}): ${d}`; break; }
    if (eng.gameOver) { out.gameOvers++; break; }
  }
  out.runs++; out.profiles[pname] = (out.profiles[pname] || 0) + 1; out.modes[MODES[mi]] = (out.modes[MODES[mi]] || 0) + 1;
  out.linesMax = Math.max(out.linesMax, eng.lines); out.maxLevelSeen = Math.max(out.maxLevelSeen, eng.level);
}
console.log(JSON.stringify(out, null, 1));
process.exit(out.firstDivergence ? 1 : 0);
