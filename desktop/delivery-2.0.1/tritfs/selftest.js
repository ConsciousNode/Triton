// selftest.js for tritfs-ref.js (Kehai Interim, 2026-11-17). Run: node selftest.js
'use strict';
const R = require('./tritfs-ref.js');
const { TritFS, Unit } = R;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const throws = (f, m) => { try { f(); fail++; console.log('FAIL (no throw)', m); } catch { pass++; } };
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const randData = (r, n) => Int16Array.from({ length: n }, () => Math.floor(r() * 19683) - 9841);
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// 1. word encoding round trip at the edges
for (const v of [0, 1, -1, 9841, -9841, 9842, 3 ** 13, 3 ** 20, (3 ** 27 - 1) / 2, -(3 ** 27 - 1) / 2])
  ok(R.trytesToWord(R.wordToTrytes(v), 0) === v, 'word ' + v);
throws(() => R.wordToTrytes((3 ** 27 + 1) / 2), 'word overflow');

// 2. mkfs geometry
for (const k of [7, 10, 13]) { const u = new Unit(3 ** k), fs = TritFS.mkfs(u, 'HOME');
  ok(fs.sltLen === Math.ceil(3 ** k / 243), 'slt len 3^' + k); ok(fs.freeSectors() === 3 ** k - 1 - fs.sltLen, 'free 3^' + k);
  ok(fs.fsck().problems.length === 0, 'fsck fresh 3^' + k); }

// 3. basic ops, names, folders
{ const u = new Unit(2187), fs = TritFS.mkfs(u, 'T');
  fs.mkdir('/apps'); fs.mkdir('/apps/Trytris'); fs.writeFile('/apps/Trytris/main', [1, 2, 3], R.T_EXEC);
  ok(eq(fs.readFile('/APPS/trytris/MAIN'), [1, 2, 3]), 'case-insensitive read');
  ok(fs.list('/apps')[0].name === 'Trytris', 'case preserved');
  throws(() => fs.mkdir('/apps/trytris'), 'dup dir'); throws(() => fs.writeFile('/a/b', [1]), 'missing parent');
  throws(() => fs.writeFile('/bad:name', [1]), 'colon'); throws(() => fs.writeFile('/' + 'x'.repeat(17), [1]), 'long name');
  throws(() => fs.remove('/apps'), 'non-empty dir'); fs.writeFile('/empty', []); ok(fs.readFile('/empty').length === 0, 'empty file');
  fs.rename('/empty', 'Nothing'); ok(fs.stat('/nothing').name === 'Nothing', 'rename');
  for (let i = 0; i < 200; i++) fs.writeFile('/f' + i, [i]); ok(fs.list('/').length === 202, '200+ files in one folder (no 44 cap)');
  ok(fs.fsck().problems.length === 0, 'fsck after ops'); }

// 4. random ops against a plain model, 3 seeds; space returns after deletes
for (const seed of [1, 2, 3]) {
  const r = rng(seed), u = new Unit(3 ** 7), fs = TritFS.mkfs(u), model = new Map(), free0 = fs.freeSectors();
  for (let i = 0; i < 600; i++) {
    const name = '/n' + Math.floor(r() * 40), op = r();
    if (op < 0.55) { const d = randData(r, Math.floor(r() * 3000)); try { fs.writeFile(name, d); model.set(name.toLowerCase(), d); } catch (e) { if (e.message !== 'disk full') throw e; } }
    else if (op < 0.8) { if (model.has(name)) { fs.remove(name); model.delete(name); } else throws(() => fs.remove(name), 'remove missing'); }
    else if (model.has(name)) ok(eq(fs.readFile(name), model.get(name)), 'read ' + name);
  }
  const fs2 = new TritFS(u); // remount from the unit alone
  ok(fs2.list('/').length === model.size, 'remount count s' + seed);
  for (const [k, v] of model) ok(eq(fs2.readFile(k), v), 'remount data');
  ok(fs2.fsck().problems.length === 0 && fs2.fsck().orphans.length === 0, 'fsck clean s' + seed);
  for (const k of [...model.keys()]) fs2.remove(k); ok(fs2.freeSectors() === free0, 'all space returned s' + seed);
}

// 5. image formats round trip
{ const r = rng(9), u = new Unit(3 ** 10, { removable: true }), fs = TritFS.mkfs(u, 'CART');
  fs.mkdir('/apps'); fs.writeFile('/apps/big', randData(r, 50000));
  const t = Unit.fromTdisk(u.toTdisk()); ok(t.sectors === 3 ** 10 && t.removable, 'tdisk header');
  ok(eq(new TritFS(t).readFile('/apps/big'), fs.readFile('/apps/big')), 'tdisk data');
  const small = new Unit(2187); TritFS.mkfs(small).writeFile('/x', [5, -5]);
  ok(eq(new TritFS(Unit.fromRaw(small.toRaw())).readFile('/x'), [5, -5]), 'raw round trip');
  ok(small.toRaw().byteLength === 2187 * 1458, 'raw size = exportDiskImage size'); }

// 6. crash safety: cut power after every possible sector write of an operation.
//    After remount: fsck finds no problems (orphans allowed), and the tree is exactly the before- or after-state.
{ let cuts = 0, oldOrNew = 0;
  const snapshot = fs => { const out = {}; const walk = p => { for (const e of fs.list(p)) { const q = (p === '/' ? '' : p) + '/' + e.name;
      if (e.type === R.T_DIR) { out[q] = 'DIR'; walk(q); } else out[q] = Array.from(fs.readFile(q)).join(','); } }; walk('/'); return JSON.stringify(out); };
  const ops = [fs => fs.writeFile('/docs/a', randData(rng(5), 2000)), fs => fs.remove('/docs/old'), fs => fs.mkdir('/docs/new'),
    fs => fs.rename('/docs/old', 'renamed'), fs => fs.writeFile('/docs/old', [7, 7, 7])];
  for (const [oi, op] of ops.entries()) {
    const base = () => { const u = new Unit(2187), fs = TritFS.mkfs(u); fs.mkdir('/docs'); fs.writeFile('/docs/old', randData(rng(4), 1500)); return u; };
    const u0 = base(), before = snapshot(new TritFS(u0)); op(new TritFS(u0)); const after = snapshot(new TritFS(u0));
    for (let n = 0; ; n++) {
      const u = base(); let w = 0; const real = u.write.bind(u);
      u.write = (s, d) => { if (w++ === n) throw new Error('POWER CUT'); real(s, d); };
      let done = false; try { op(new TritFS(u)); done = true; } catch (e) { if (e.message !== 'POWER CUT') throw e; }
      u.write = real; const fs = new TritFS(u); const f = fs.fsck();
      ok(f.problems.length === 0, `crash op${oi} cut${n}: ${f.problems[0]}`);
      const s = snapshot(fs); ok(s === before || s === after, `crash op${oi} cut${n} state`); if (s === before || s === after) oldOrNew++;
      cuts++; if (done) break;
    }
  }
  console.log(`crash cuts tested: ${cuts}, all old-or-new: ${oldOrNew === cuts}`);
}

// 7. positive controls: fsck must catch planted damage
{ const u = new Unit(2187), fs = TritFS.mkfs(u); fs.writeFile('/a', randData(rng(1), 3000)); fs.writeFile('/b', randData(rng(2), 3000));
  const fa = new TritFS(u), ca = fa._chain(fa.stat('/a').first), cb = fa._chain(fa.stat('/b').first);
  fa._setLink(ca[0], cb[1]); fa._flushSlt(); ok(new TritFS(u).fsck().problems.length > 0, 'control: cross-link caught');
  const u2 = new Unit(2187), f2 = TritFS.mkfs(u2); f2.writeFile('/a', randData(rng(1), 3000)); const c2 = f2._chain(f2.stat('/a').first);
  f2._setLink(c2[2], c2[0]); f2._flushSlt(); ok(new TritFS(u2).fsck().problems.length > 0, 'control: loop caught');
  const u3 = new Unit(2187), f3 = TritFS.mkfs(u3); f3._setLink(500, -1); f3._flushSlt(); const r3 = new TritFS(u3).fsck(true);
  ok(r3.orphans.includes(500) && new TritFS(u3).fsck().orphans.length === 0, 'control: orphan found and repaired'); }

console.log(`tritfs-ref selftest: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
