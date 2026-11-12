#!/usr/bin/env node
'use strict';
// Audit probe (Kehai, 2026-11-12): supervisor accesses outside physical RAM must fault (BAD_ADDR), never wrap.
const { loadHtmlModule } = require('../tests/t3-common');
const { T } = loadHtmlModule('triton3.html');
// Build a 27-trit address in R1 from three trytes: value = lo + mid*3^9 + hi*3^18
function addrLoad(v) {
  const M = 19683; const b = (x) => { let r = ((x % M) + M) % M; if (r > 9841) r -= M; return r; };
  const lo = b(v); const q1 = (v - lo) / M; const mid = b(q1); const hi = (q1 - mid) / M;
  return `  LI R1, #${lo}\n  LMI R1, #${mid}\n  LHI R1, #${hi}`;
}
const prog = (acc) => `
  .mode T3
  .org 0
  LI R0, #1000
  MTSPR R0, #5
  LI R1, #1000
  LI R0, #trap
  SW R0, R1, #12
  SW R0, R1, #9
${acc}
  LI R8, #-1
  HALT
trap:
  MFSPR R0, #12
  LI R1, #410
  SW R0, R1, #0
  MFSPR R3, #13
  LI R8, #4242
  HALT
  .org 2000
  .word #31337
`;
const ram = T.T3_DEFAULT_RAM_SIZE;
const cases = { 'load at RAM size': ram, 'load at RAM size + 1000': ram + 1000, 'load at -1': -1, 'load at 3^25': 847288609443, 'load just below framebuffer': T.T3_FB_BASE - 1, 'load past framebuffer end': T.T3_FB_BASE + T.T3_FB_SIZE, 'load at 2^32 + 2000 (aliases 2000 if truncated)': 4294969296, 'load at 2^32 + FB base': 4294967296 + 15000000 };
let bad = 0;
for (const [name, a] of Object.entries(cases)) {
  const src = prog(addrLoad(a) + '\n  LW R2, R1, #0');
  let built; try { built = T.assemble(src, { mode: 'T3' }); } catch (e) { console.log('ASM ERR', name, e.message); bad++; continue; }
  const out = [];
  for (const vm of [new T.TritonJS({ archMode: 'T3' }), T.TritonWASM.createSync({ archMode: 'T3' })]) {
    vm.loadProgram(built.trytes, 0); vm.run(2000);
    out.push({ r2: vm.getWordNum(2), eaddr: vm.getWordNum(3), r8: vm.getWordNum(8), cause: vm.getMem(410) });
  }
  const ok = out[0].r8 === 4242 && out[0].eaddr === a && out[0].cause === 4 && JSON.stringify(out[0]) === JSON.stringify(out[1]);
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} (${a}): js=${JSON.stringify(out[0])} wasm=${JSON.stringify(out[1])}`);
}
process.exit(bad ? 1 : 0);
