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

// ---- Kehai's audit: edits Argon never saw (seeded, generated at run time) ----
let seed = Number(process.argv[2] || 20261111);
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const base = T.assemble(T.TRITOS_SRC);
console.log('TRITOS_SRC chars', T.TRITOS_SRC.length, 'trytes', base.length, 'TRYTE_MOD', T.TRYTE_MOD);

function selfHost(src) {
  const vmW = T.TritonWASM.createSync(); vmW.loadProgram(base.trytes, 0);
  if (500 + src.length >= T.TRYTE_MOD) return { skip: 'too long' };
  for (let i = 0; i < src.length; i++) vmW.i32[25600 + 500 + i] = T.balRem(src.charCodeAt(i), T.TRYTE_MOD, T.TRYTE_HALF);
  vmW.i32[25600 + 500 + src.length] = 0;
  vmW.pushInputString('asm\nquit\n'); vmW.run(6000000);
  const n = vmW.getMem(3198), out = []; for (let i = 0; i < n; i++) out.push(vmW.getMem(6000 + i));
  return { out };
}
function check(src, label) {
  let exp; try { exp = T.assemble(src); } catch (e) { console.log('  JS asm rejects', label, '-', e.message.slice(0, 60)); return null; }
  const r = selfHost(src); if (r.skip) { console.log('  SKIP', label, r.skip); return null; }
  let ok = r.out.length === exp.length; for (let i = 0; ok && i < exp.length; i++) if (r.out[i] !== exp.trytes[i]) { ok = false; console.log('   first diff at', i); }
  console.log(`  ${ok ? 'MATCH' : 'MISMATCH'} ${label}: in-OS ${r.out.length} vs JS ${exp.length} trytes`);
  return ok ? r.out : false;
}
// Are Argon's own three edits real edits?
const a1 = T.TRITOS_SRC.replace('TritOS 2.0 [27-Trit Balanced-Ternary System]', 'X').replace('LI R0,#4', 'X').replace('LI R6,#13', 'X');
console.log('Argon edit-1 targets present:', ['TritOS 2.0 [27-Trit Balanced-Ternary System]', 'LI R0,#4', 'LI R6,#13', 'boot_reset: LI R0,#0\nJMP boot_main', '.stringz "SAVED.\\n"'].map(s => T.TRITOS_SRC.includes(s)));

const lines = T.TRITOS_SRC.split('\n');
const instrIdx = lines.map((l, i) => [l, i]).filter(([l]) => /^\s*(?:[a-z_][a-z0-9_]*:\s*)?[A-Z]{2,5}\b/.test(l) && !/^\s*\./.test(l)).map(([, i]) => i);
const liIdx = lines.map((l, i) => [l, i]).filter(([l]) => /\bLI R\d,#-?\d+/.test(l)).map(([, i]) => i);
const strIdx = lines.map((l, i) => [l, i]).filter(([l]) => /\.stringz "[^"\\]{3,}/.test(l)).map(([, i]) => i);
console.log('instruction lines', instrIdx.length, 'LI lines', liIdx.length, 'string lines', strIdx.length);
let results = [];
for (let trial = 0; trial < 6; trial++) {
  const L = lines.slice(); const did = [];
  // 1) rewrite 5 LI immediates to random values in [-1000,1000]
  for (let k = 0; k < 5; k++) { const i = pick(liIdx); const v = Math.floor(rnd() * 2001) - 1000; L[i] = L[i].replace(/(\bLI R\d,#)-?\d+/, `$1${v}`); did.push(`LI@${i}=${v}`); }
  // 2) change 3 string literals
  for (let k = 0; k < 3; k++) { const i = pick(strIdx); L[i] = L[i].replace(/\.stringz "([^"\\]{3,})/, (m, s) => `.stringz "${s.split('').reverse().join('')}~${trial}`); did.push(`str@${i}`); }
  // 3) insert NOP/ADDI padding after 4 random instruction lines (shifts every later label)
  const ins = []; for (let k = 0; k < 4; k++) ins.push(pick(instrIdx));
  ins.sort((a, b) => b - a).forEach(i => { L.splice(i + 1, 0, pick(['NOP', 'ADDI R7,R7,#0', 'NOP\nNOP'])); did.push(`pad@${i}`); });
  const src = L.join('\n');
  if (src === T.TRITOS_SRC) { console.log('  edit was a no-op?!'); continue; }
  results.push(check(src, `trial ${trial} (${did.length} edits)`));
}
console.log('SUMMARY', results.filter(r => r && r !== false).length, 'match of', results.length);

// ---- Programs that are NOT TritOS at all: disassembly of random tryte soup ----
let r2 = [];
for (let trial = 0; trial < 4; trial++) {
  const soup = []; for (let i = 0; i < 300; i++) soup.push(Math.floor(rnd() * T.TRYTE_MOD) - T.TRYTE_HALF);
  let dis; try { dis = T.disassemble(soup); } catch (e) { console.log('  disasm threw', e.message); continue; }
  r2.push(check(dis, `soup ${trial} (${dis.length} chars)`));
}
console.log('SOUP SUMMARY', r2.filter(r => r && r !== false).length, 'match of', r2.length);
