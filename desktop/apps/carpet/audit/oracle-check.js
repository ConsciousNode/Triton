// oracle-check.js: Kehai's independent audit probe for CARPET (2026-11-24).
// Recomputes every op(x, y) from ISA.md 4.1's per-trit definitions (not from the emulator's ALU), finds the
// 162x108 picture in the framebuffer, and compares every pixel for all six ops on the named backend.
const fs = require('fs'), path = require('path');
const D = path.resolve(__dirname, '../../../tests') + '/';
const { TritFS, Unit, T_EXEC, bootDesktop2 } = require(D + 'd20-common.js');
const backend = process.argv[2] || 'WASM';
const { T, vm } = bootDesktop2({ backend });
const app = T.assemble(fs.readFileSync(path.join(__dirname, '..', 'carpet-app.asm'), 'utf8'));
// --- the oracle: 27-trit balanced words, per-trit ops straight from ISA.md 4.1 ---
const N = 27;
const toT = v => { const t = []; for (let i = 0; i < N; i++) { let r = ((v % 3) + 3) % 3; if (r === 2) r = -1; t.push(r); v = (v - r) / 3; } return t; };
const fromT = t => t.reduce((a, d, i) => a + d * 3 ** i, 0);
const balrem = s => { let r = ((s % 3) + 3) % 3; return r === 2 ? -1 : r; };
const OPS = [
  (a, b) => balrem(a + b),            // TXOR
  (a, b) => (a === b ? a : 0),        // TCON
  (a, b) => Math.sign(a + b),         // TANY
  (a, b) => Math.min(a, b),           // TMIN
  (a, b) => Math.max(a, b),           // TMAX
];
const op = (m, x, y) => m === 5 ? x + y : fromT(toT(x).map((a, i) => OPS[m](a, toT(y)[i])));
// a tryte holds 9 trits; the framebuffer shows the low 6 (ISA-3.md: high 3 trits = 0)
const tryte = v => fromT(toT(v).slice(0, 9));
const low6 = v => fromT(toT(v).slice(0, 6));
// --- install and launch exactly as Ed's test does ---
const cart = new Unit(2187, { removable: true }); const cfs = TritFS.mkfs(cart, 'AUDIT');
cfs.mkdir('/apps'); cfs.mkdir('/apps/CARPET'); cfs.writeFile('/apps/CARPET/main', app.trytes, T_EXEC);
vm.pushMouseEvent(170 - 364, 478 - 230, 1); vm.pushMouseEvent(0, 0, 0); vm.run(250000);
vm.insertUnit(2, cart.toTdisk(), { removable: true, writeProtected: false }); vm.run(250000);
vm.pushKeyEvent(82, 0); vm.run(250000); vm.pushKeyEvent(73, 0); vm.run(300000); vm.pushKeyEvent(13, 0); vm.run(1500000);
const W = 729, H = 486, w = 162, h = 108;
let origin = null; const out = { backend, ops: [] };
for (let m = 0; m < 6; m++) {
  const want = (x, y) => tryte(op(m, x - 81, y - 54) * 3);
  if (!origin) {  // locate the picture once, by matching the TXOR pattern's first two rows
    for (let oy = 0; oy + h <= H && !origin; oy++) for (let ox = 0; ox + w <= W; ox++) {
      let ok = true; for (let x = 0; x < w && ok; x++) for (let y = 0; y < 2 && ok; y++) if (vm.vram[(oy + y) * W + ox + x] !== want(x, y)) ok = false;
      if (ok) { origin = [ox, oy]; break; }
    }
    if (!origin) { console.log(JSON.stringify({ backend, error: 'picture not found' })); process.exit(1); }
  }
  let bad = 0, badExamples = [], highTrits = 0, distinct = new Set();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = vm.vram[(origin[1] + y) * W + origin[0] + x], e = want(x, y); distinct.add(v);
    if (low6(e) !== e) highTrits++;
    if (v !== e) { bad++; if (badExamples.length < 3) badExamples.push({ x: x - 81, y: y - 54, got: v, want: e }); }
  }
  out.ops.push({ op: m, mismatches: bad, examples: badExamples, pixelsWithHighTrits: highTrits, distinctValues: distinct.size });
  vm.pushKeyEvent(32, 0); vm.run(1500000);
}
out.origin = origin; console.log(JSON.stringify(out));
