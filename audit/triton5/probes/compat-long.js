// compat-long.js: Kehai's audit probe for Triton 5 delivery 1 (2026-11-25). With paging off, run TritOS Desktop 2.0.1
// on Triton 4 and Triton 5 side by side for 3,000,000 steps, with seeded mouse and keyboard input, and compare the
// full state hash every 25,000 steps on both cores. Usage: node compat-long.js <repo-with-delivery-overlaid>
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = process.argv[2];
const { loadMutatedHtmlModule } = require(path.join(ROOT, 'tests', 't5-common.js'));
const T4 = loadMutatedHtmlModule(fs.readFileSync(path.join(ROOT, 'triton4.html'), 'utf8'));
const T5 = loadMutatedHtmlModule(fs.readFileSync(path.join(ROOT, 'triton5.html'), 'utf8'));
const asm = T4.assemble(fs.readFileSync(path.join(ROOT, 'desktop', 'guest-200.asm'), 'utf8'), { mode: 'T3' });
const mk = (T, wasm) => { const vm = wasm ? T.TritonWASM.createSync({ archMode: 'T3' }) : new T.TritonJS({ archMode: 'T3' });
  for (let i = 0; i < asm.trytes.length; i++) { if (vm.setDisk) vm.setDisk(i, asm.trytes[i]); else vm.disk[i] = asm.trytes[i]; }
  vm.loadProgram(asm.trytes.slice(0, 32), 0); return vm; };
let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
const out = {};
for (const wasm of [false, true]) {
  const a = mk(T4, wasm), b = mk(T5, wasm); let checks = 0, firstDiff = null; s = 12345;
  for (let step = 0; step < 3000000 && !firstDiff; step += 25000) {
    if (rnd() < 0.5) { const dx = Math.floor(rnd() * 41) - 20, dy = Math.floor(rnd() * 41) - 20, btn = rnd() < 0.3 ? 1 : 0;
      for (const vm of [a, b]) { vm.pushMouseEvent(dx, dy, btn); vm.pushMouseEvent(0, 0, 0); } }
    if (rnd() < 0.3) { const key = [13, 32, 65, 73, 81, 82, 27][Math.floor(rnd() * 7)]; for (const vm of [a, b]) vm.pushKeyEvent(key, 0); }
    a.run(25000); b.run(25000); checks++;
    const ha = T4.computeStateHash(a), hb = T5.computeStateHash(b);
    if (ha !== hb) firstDiff = { step: step + 25000, t4: ha.toString(16), t5: hb.toString(16) };
  }
  out[wasm ? 'WASM' : 'JS'] = { steps: checks * 25000, hashChecks: checks, firstDiff };
}
console.log(JSON.stringify(out));
