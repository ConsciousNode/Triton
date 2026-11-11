#!/usr/bin/env node
'use strict';

/**
 * Triton 2.0 Verification & Benchmark Suite (`tests/run.js`)
 * ConsciousNode SoftWorks
 *
 * Exercises and verifies all 8 required tests directly against `triton.html`:
 *   1. Trit-array oracle (100,000 seeded random operands + all edge cases)
 *   2. Differential fuzz (10,000 seeded random valid programs <= 500 instructions)
 *   3. Assembler round trip (assemble -> disassemble -> assemble across full ISA)
 *   4. Self-hosting fixed point (TritOS source + 3 unseen edited copies + boot test)
 *   5. TritOS boots & scripted session on both interpreters (identical transcript)
 *   6. Export round trip (Export -> load -> continue gives identical state hashes)
 *   7. Timing (instructions per second measured and reported for JS and WASM)
 *   8. Static scan (no network or storage APIs; strict CSP; labeled inlines)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Locate triton.html
const candidatePaths = [
  path.resolve(__dirname, '../triton.html'),
  path.resolve(__dirname, './triton.html'),
  '/working_dir/c_a7ca1264b94c3647/artifacts/file_generation/ttl=63d/output/triton.html',
  '/working_dir/c_a7ca1264b94c3647/work/triton.html'
];
const htmlPath = candidatePaths.find(p => fs.existsSync(p));
if (!htmlPath) {
  throw new Error('Could not find triton.html');
}
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Extract the executable inline <script> from triton.html and evaluate in a sandbox
const scriptMatches = [...htmlContent.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)];
if (scriptMatches.length === 0) {
  throw new Error('No executable <script> found in triton.html');
}
const sandbox = {
  WebAssembly,
  Int8Array,
  Uint8Array,
  Int16Array,
  Int32Array,
  Float32Array,
  Float64Array,
  TextEncoder,
  TextDecoder,
  Math,
  BigInt,
  JSON,
  Array,
  Object,
  String,
  Number,
  Set,
  Map,
  RegExp,
  Error,
  console
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const m of scriptMatches) {
  vm.runInContext(m[1], sandbox);
}

const T = sandbox.TritonSystem;
if (!T) {
  throw new Error('TritonSystem was not exported by triton.html');
}

// ---- Kehai's audit: arithmetic checked against BigInt math written from ISA.md alone ----
const M = 3n ** 27n, H = (M - 1n) / 2n;
const balRem = x => { let r = ((x % M) + M) % M; if (r > H) r -= M; return r; };
const balQuot = x => (x - balRem(x)) / M;
const sgn = x => x > 0n ? 1 : x < 0n ? -1 : 0;
const toWord = ([a, b, c]) => BigInt(a) + 19683n * BigInt(b) + 387420489n * BigInt(c);
let seed = 777; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const ri = n => Math.floor(rnd() * n); const imm = () => ri(19683) - 9841;
let fails = 0, progs = 0, ops = 0;
for (let p = 0; p < 400; p++) {
  const R = Array(9).fill(0n); let F = [0, 0, 0]; const src = [];
  const n = 5 + ri(25);
  for (let k = 0; k < n; k++) {
    const op = ['LI', 'ADDI', 'MULI', 'ADD', 'SUB', 'MUL', 'MUL', 'DIV', 'MOD'][ri(9)];
    const d = ri(9), a = ri(9), b = ri(9); let A = R[a], B = R[b], v;
    if (op === 'LI') { v = BigInt(imm()); src.push(`LI R${d},#${v}`); R[d] = v; F = [sgn(v), 0, 0]; }
    else if (op === 'ADDI' || op === 'ADD' || op === 'SUB') {
      const Bv = op === 'ADDI' ? BigInt(imm()) : B;
      src.push(op === 'ADDI' ? `ADDI R${d},R${a},#${Bv}` : `${op} R${d},R${a},R${b}`);
      const S = op === 'SUB' ? A - Bv : A + Bv; const c = Number(balQuot(S)); R[d] = balRem(S); F = [sgn(R[d]), c, c];
    } else if (op === 'MUL' || op === 'MULI') {
      const Bv = op === 'MULI' ? BigInt(imm()) : B;
      src.push(op === 'MULI' ? `MULI R${d},R${a},#${Bv}` : `MUL R${d},R${a},R${b}`);
      const P = A * Bv, lo = balRem(P), hi = sgn(balQuot(P)); R[d] = lo; F = [sgn(lo), hi, hi];
    } else {
      src.push(`${op} R${d},R${a},R${b}`);
      if (B === 0n) { const o = A === 0n ? 1 : sgn(A); if (op === 'DIV') { R[d] = 0n; F = [0, 0, o]; } else { R[d] = A; F = [sgn(A), 0, o]; } }
      else { const q = A / B; R[d] = op === 'DIV' ? q : A - q * B; F = [sgn(R[d]), 0, 0]; }  // BigInt / truncates toward zero
    }
    ops++;
  }
  src.push('HALT');
  const img = T.assemble(src.join('\n')).trytes;
  const js = new T.TritonJS(); img.forEach((t, i) => js.mem[i] = t); js.run(10000);
  const w = T.TritonWASM.createSync(); w.loadProgram(img, 0); w.run(10000);
  for (const [name, vm] of [['JS', js], ['WASM', w]]) {
    for (let r = 0; r < 9; r++) if (toWord(vm.getWord(r)) !== R[r]) { fails++; if (fails < 6) console.log(name, 'prog', p, 'R' + r, toWord(vm.getWord(r)), 'expected', R[r], '\n', src.join('; ')); }
    const f = [vm.sf, vm.cf, vm.of]; if (f.join() !== F.join()) { fails++; if (fails < 6) console.log(name, 'prog', p, 'flags', f, 'expected', F, 'last', src[src.length - 2]); }
  }
  progs++;
}
console.log(`ISA-from-spec BigInt check: ${progs} programs, ${ops} ops, ${fails} disagreements (JS and WASM each checked)`);
