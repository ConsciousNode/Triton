#!/usr/bin/env node
'use strict';
// Audit probe (Kehai, 2026-11-12): the step counter across 2^31 and 2^32 with fastForward OFF (real stepping only).
// The machine is started a few thousand steps short of each boundary, then genuinely runs across it; JS and WASM
// must agree on steps, port 6 and the state hash, with no wrap.
const { loadHtmlModule } = require('../tests/t3-common');
const { T } = loadHtmlModule('triton3.html');
const src = `
  .mode T3
  .org 0
  LI R1, #5000
loop:
  ADDI R1, R1, #-1
  JNZX #-4
  IN R2, #6
  HALT
`;
let built; try { built = T.assemble(src, { mode: 'T3' }); } catch (e) { console.log('asm:', e.message); process.exit(2); }
let bad = 0;
for (const start of [2147483648 - 3000, 4294967296 - 3000, 2541865828329]) {
  const vms = [new T.TritonJS({ archMode: 'T3' }), T.TritonWASM.createSync({ archMode: 'T3' })];
  for (const vm of vms) { vm.loadProgram(built.trytes, 0); vm.steps = start; vm.run(20000); }
  const [j, w] = vms.map(vm => ({ steps: vm.steps, port6: vm.getWordNum(2), halted: vm.halted, hash: T.computeStateHash(vm) }));
  const ok = j.steps === w.steps && j.port6 === w.port6 && j.hash === w.hash && j.halted && j.steps > start && j.port6 > start;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} start=${start}: js=${JSON.stringify(j)} wasm=${JSON.stringify(w)}`);
}
process.exit(bad ? 1 : 0);
