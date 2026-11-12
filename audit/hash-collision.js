// Kehai's audit: the in-OS assembler stores symbols as h = h*41 + upper(c) only, and compares hashes.
// Updated 2026-11-11 for 2.1, by Kehai: rejections are now compared as rejections (OLEN 0 + the OS's own REJECTS line).
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
const base = T.assemble(T.TRITOS_SRC);
function inOS(src) {
  const w = T.TritonWASM.createSync(); w.loadProgram(base.trytes, 0);
  for (let i = 0; i < src.length; i++) w.i32[25600 + 500 + i] = T.balRem(src.charCodeAt(i), T.TRYTE_MOD, T.TRYTE_HALF);
  w.i32[25600 + 500 + src.length] = 0; w.pushInputString('asm\nquit\n'); w.run(6000000);
  const n = w.getMem(3198), out = []; for (let i = 0; i < n; i++) out.push(w.getMem(6000 + i));
  // 2.1: a rejected program leaves OLEN = 0 and the OS prints "REJECTS: Line n: ..." on its console (port 0).
  // Report that as the in-OS result so it can be compared with the JS assembler's rejection.
  const rej = n === 0 && /REJECTS: [^\n]+/.exec(w.getConsoleOut ? w.getConsoleOut() : '');
  return rej ? [rej[0]] : out;
}
const h = s => [...s.toUpperCase()].reduce((a, c) => a * 41 + c.charCodeAt(0), 0);
console.log('hash(AY) =', h('AY'), ' hash(B0) =', h('B0'));
const cases = {
  'colliding labels ay / b0': 'ay: LI R1,#1\nb0: LI R2,#2\nJMP b0\nHALT',
  'control (no collision) ay / bz': 'ay: LI R1,#1\nbz: LI R2,#2\nJMP bz\nHALT',
  'undefined label': 'LI R1,#1\nJMP nowhere\nHALT',
  'case-only difference Loop / LOOP': 'Loop: LI R1,#1\nLOOP: LI R2,#2\nJMP LOOP\nHALT',
  'duplicate label': 'x1: LI R1,#1\nx1: LI R2,#2\nJMP x1\nHALT',
};
for (const [k, src] of Object.entries(cases)) {
  let js; try { js = T.assemble(src).trytes.join(','); } catch (e) { js = 'REJECTS: ' + e.message.slice(0, 50); }
  const os = inOS(src).join(',');
  console.log(`${k}\n   JS   : ${js}\n   in-OS: ${os}\n   ${js === os ? 'agree' : 'DISAGREE'}`);
}
