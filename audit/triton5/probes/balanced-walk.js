#!/usr/bin/env node
'use strict';
// Kehai's audit probe for Triton 5 stage 2 (balanced-3^k MMU).
// Drives REAL loads (LT) through both TritonJS and TritonWASM in balanced mode, over randomly built centred
// page tables, and checks every result against an oracle written here from the spec alone (no code shared with
// the delivery's tests or emulator: own balanced rounding, own table model, own expected faults).
// Covers: negative and extreme indices at both levels, vpn 0, unmapped PDE/PTE, PTE frame 0 and negative frames,
// PDE pointing at frame 0, out-of-range VAs, and the TLB (never flushed between accesses).
// Usage: node balanced-walk.js <path-to-triton5.html> [accessesPerSize]
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(path.resolve(process.argv[2]), 'utf8');
const N = parseInt(process.argv[3] || '200000', 10);
const sandbox = { WebAssembly, Int8Array, Uint8Array, Int16Array, Int32Array, Float32Array, Float64Array,
  BigInt64Array, BigUint64Array, DataView, ArrayBuffer, TextEncoder, TextDecoder, Math, BigInt, JSON, Array,
  Object, String, Number, Boolean, Set, Map, RegExp, Error, Date, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const m of html.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], sandbox);
const T = sandbox.TritonSystem;

// --- oracle (spec only) ---
// Balanced residue by symmetric rounding: r in [-h, +h], q = (x - r) / m.
function bdiv(x, m) { const h = (m - 1) / 2; let r = ((x + h) % m + m) % m - h; return [(x - r) / m, r]; }
function split(va, ps, H) {
  const [vpn, off] = bdiv(va, ps);
  const [q1, i1] = bdiv(vpn, 2 * H + 1);
  const [hi, i0] = bdiv(q1, 2 * H + 1);
  return hi === 0 ? { off, vpn, i0, i1 } : null;
}
function rng(seed) { let s = seed >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; }; }
const patBase = (pa) => ((pa * 7919 + 12345) % 19683) - 9841; // tryte value stored at physical address pa
let codeOverlay = null; // [codePa, trytes] for the code page
const pat = (pa) => (codeOverlay && pa >= codeOverlay[0] && pa < codeOverlay[0] + codeOverlay[1].length) ? codeOverlay[1][pa - codeOverlay[0]] : patBase(pa);

function wword(m, a, v) { const [w0, w1, w2] = T.numberToWord(v); m.setMem(a, w0); m.setMem(a + 1, w1); m.setMem(a + 2, w2); }

let total = 0;
for (const ps of [729, 2187]) {
  const B = (ps - 1) / 2, H = ps === 729 ? 121 : 364, W = 2 * H + 1;
  const NF = 90, ramSize = (NF + 2) * ps;
  const r = rng(ps * 2654435761);
  const flags = T.T5_PTE.V | T.T5_PTE.R | T.T5_PTE.W | T.T5_PTE.X | T.T5_PTE.U;
  const js = new T.TritonJS({ archMode: 'T3', pageSize: ps, mmuMode: 'balanced', ramSize, diskSectors: 2 });
  const wa = T.TritonWASM.createSync({ archMode: 'T3', pageSize: ps, mmuMode: 'balanced', ramSize, diskSectors: 2 });
  const both = [js, wa];

  // Frames: 1 = L0, 2..9 = L1 tables, 10 = code, 11..NF = data. Fill data frames with the pattern.
  for (const m of both) for (let f = 10; f <= NF; f++) for (let o = -B; o <= B; o++) m.setMem(f * ps + o, pat(f * ps + o));
  const idx0s = [0, 1, -1, H, -H, 2, -2]; // L1 tables at frames 2..8 for these idx0 values
  const l1Frame = new Map(idx0s.map((v, i) => [v, 2 + i]));
  // A PDE that points at frame 0 (illegal): idx0 = 3
  const badPdeIdx0 = 3;
  const map = new Map(); // vpn -> ppn (may be <= 0 for planted illegal frames)
  const setPde = (i0, fr) => { for (const m of both) wword(m, ps + 3 * i0 - 1, fr * 512 + T.T5_PTE.V); };
  const setPte = (i0, i1, ppn) => { const fr = l1Frame.get(i0); for (const m of both) wword(m, fr * ps + 3 * i1 - 1, ppn * 512 + flags); };
  for (const [i0, fr] of l1Frame) setPde(i0, fr);
  setPde(badPdeIdx0, 0);
  // code page at vpn 1 -> frame 10: LT R0, R1, #0 ; HALT ; ... handler at +200: MFSPR R2, #13 ; HALT
  setPte(0, 1, 10); map.set(1, 10);
  const prog = T.assemble(`
    .mode T3
    .org 0
    LT R0, R1, #0
    HALT
    .org 200
    MFSPR R2, #13
    MFSPR R3, #12
    HALT
  `, { mode: 'T3' });
  const codeVa = 1 * ps - B, codePa = 10 * ps - B;
  codeOverlay = [codePa, Array.from(prog.trytes)];
  for (const m of both) {
    for (let i = 0; i < prog.trytes.length; i++) m.setMem(codePa + i, prog.trytes[i]);
    m.vbr = 0; wword(m, 13 * 3, codeVa + 200);
    m.ptbr = ps; m.pgEn = 1; m.flushTlbAll();
  }
  // Random data mappings, plus planted illegal frames, plus vpn 0 with a planted valid PTE.
  const vpnFor = (i0, i1) => i0 * W + i1;
  const extremes = [0, 1, -1, H, -H, H - 1, -(H - 1), 2, -2];
  for (const i0 of idx0s) for (const i1 of extremes) {
    const vpn = vpnFor(i0, i1); if (vpn === 0 || vpn === 1) continue;
    const ppn = 11 + (r() % (NF - 10)); setPte(i0, i1, ppn); map.set(vpn, ppn);
  }
  for (let k = 0; k < 150; k++) {
    const i0 = idx0s[r() % idx0s.length], i1 = (r() % W) - H, vpn = vpnFor(i0, i1);
    if (vpn === 0 || vpn === 1 || map.has(vpn)) continue;
    const ppn = 11 + (r() % (NF - 10)); setPte(i0, i1, ppn); map.set(vpn, ppn);
  }
  setPte(0, 0, 12); // valid-looking PTE for virtual page 0: hardware must still fault
  const illegal = [[0, 5, 0], [0, 6, -3], [1, 7, 0]]; // PTEs with frame 0 / negative frame
  for (const [i0, i1, p] of illegal) { setPte(i0, i1, p); map.set(vpnFor(i0, i1), p); }

  const mappedVpns = [...map.keys()];
  let ok = 0, faults = 0, byKind = {};
  for (let n = 0; n < N; n++) {
    let va; const c = r() % 10;
    if (c < 6) { const vpn = mappedVpns[r() % mappedVpns.length]; va = vpn * ps + (r() % ps) - B; }
    else if (c < 7) va = (r() % (3 * ps)) - Math.floor(1.5 * ps);            // around page 0 and NULL
    else if (c < 8) { va = vpnFor(badPdeIdx0, (r() % W) - H) * ps + (r() % ps) - B; } // under the frame-0 PDE
    else if (c < 9) va = (r() % (W * W * ps)) - Math.floor(W * W * ps / 2);   // anywhere in range (mostly unmapped)
    else va = (r() % 2 ? 1 : -1) * (Math.floor(W * W * ps / 2) + 1 + (r() % 1000)); // just out of range
    if (n % 97 === 0) va = -B; // C NULL, often

    const s = split(va, ps, H);
    let expect;
    if (!s || s.vpn === 0) expect = { fault: true };
    else if (!l1Frame.has(s.i0)) expect = { fault: true };                    // PDE invalid or frame 0
    else { const p = map.get(s.vpn); expect = (p === undefined || p <= 0) ? { fault: true } : { fault: false, v: pat(p * ps + s.off) }; }

    for (const m of both) { m.halted = 0; m.pc = codeVa; m.setWordNum(1, va); m.setWordNum(0, 0x2a); m.setWordNum(2, 0); m.ecause = 0; m.eaddr = 0; }
    let st = 0;
    while (!js.halted && st < 10) { js.step(); wa.step(); st++; }
    if (!js.halted || !wa.halted || js.pc !== wa.pc || js.ecause !== wa.ecause || js.getWordNum(0) !== wa.getWordNum(0)) throw new Error(`ps=${ps} va=${va}: did not halt`);
    if ((n % 100 === 0 || n === N - 1) && T.computeStateHash(js) !== T.computeStateHash(wa)) throw new Error(`ps=${ps} va=${va}: JS/WASM state hash differs`);
    for (const [nm, m] of [['JS', js], ['WASM', wa]]) {
      if (expect.fault) {
        if (m.ecause !== 13 || m.getWordNum(2) !== va) throw new Error(`${nm} ps=${ps} va=${va}: expected PAGE_FAULT with EADDR=va, got ecause=${m.ecause} R2=${m.getWordNum(2)}`);
      } else {
        if (m.ecause !== 0 || m.getWordNum(0) !== expect.v) throw new Error(`${nm} ps=${ps} va=${va}: expected load ${expect.v}, got R0=${m.getWordNum(0)} ecause=${m.ecause}`);
      }
    }
    const kind = expect.fault ? 'fault' : 'load'; byKind[kind] = (byKind[kind] || 0) + 1;
    expect.fault ? faults++ : ok++;
  }
  total += N;
  console.log(`balanced-${ps}: ${N} accesses, ${ok} loads correct, ${faults} faults correct (EADDR = VA); ` +
    `${map.size} mappings, TLB hits JS=${js.mmuHits} WASM=${wa.mmuHits}, walks JS=${js.mmuWalks} WASM=${wa.mmuWalks}`);
}
console.log(`PASS: ${total} accesses, JS and WASM both match the spec-only oracle, registers equal after every access, full state hashes equal every 100 accesses and at the end`);
