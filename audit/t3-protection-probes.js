#!/usr/bin/env node
'use strict';
// Audit probes (Kehai, 2026-11-12): user-mode escapes the delivered protection test doesn't try.
// Each user program runs in window [5000, 6000) and should fault (logged count 1) without touching the sentinel.
const { loadHtmlModule } = require('../tests/t3-common');
const { T } = loadHtmlModule('triton3.html');

const kernel = (userProg) => `
  .mode T3
  .org 0
  LI R0, #7777
  LI R1, #400
  SW R0, R1, #0
  LI R0, #1000
  MTSPR R0, #5
  LI R1, #1000
  LI R0, #trap_handler
  SW R0, R1, #3
  SW R0, R1, #6
  SW R0, R1, #9
  SW R0, R1, #12
  LI R0, #sys_handler
  SW R0, R1, #18
  LI R0, #317
  LMI R0, #1
  MTSPR R0, #14
  LI R0, #5000
  MTSPR R0, #6
  LI R0, #6000
  MTSPR R0, #7
  LI R1, #5000
  LI R2, #user_prog_start
  LI R3, #60
  BCOPY R1, R2, R3
  LI R0, #5000
  MTSPR R0, #9
  LI R0, #5900
  MTSPR R0, #10
  LI R0, #27
  MTSPR R0, #11
  IRET
after_user:
  LI R8, #4242
  HALT
trap_handler:
  LI R1, #410
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  MFSPR R0, #12
  LI R1, #413
  SW R0, R1, #0
  LI R0, #after_user
  MTSPR R0, #9
  LI R0, #0
  MTSPR R0, #11
  IRET
sys_handler:
  LI R0, #after_user
  MTSPR R0, #9
  LI R0, #0
  MTSPR R0, #11
  IRET
user_prog_start:
${userProg}
  SYSCALL #0
`;

const probes = {
  'write at ULIMIT (6000)': `  LI R0, #-5\n  LI R1, #6000\n  SW R0, R1, #0`,
  'write at UBASE-1 (4999)': `  LI R0, #-5\n  LI R1, #4999\n  SW R0, R1, #0`,
  'read kernel sentinel (400)': `  LI R1, #400\n  LW R0, R1, #0`,
  'BCOPY into kernel (dst 400)': `  LI R1, #400\n  LI R2, #5000\n  LI R3, #3\n  BCOPY R1, R2, R3`,
  'BCOPY out of kernel (src 0 -> 5500)': `  LI R1, #5500\n  LI R2, #0\n  LI R3, #10\n  BCOPY R1, R2, R3`,
  'BFILL kernel (dst 400)': `  LI R1, #400\n  LI R2, #-9\n  LI R3, #3\n  BFILL R1, R2, R3`,
  'BCOPY straddling ULIMIT (5995, n=10)': `  LI R1, #5995\n  LI R2, #5000\n  LI R3, #10\n  BCOPY R1, R2, R3`,
  'write at 2^32 + 400 (kernel sentinel if truncated)': `  LI R0, #-5\n  LI R1, #-685\n  LMI R1, #1694\n  LHI R1, #11\n  SW R0, R1, #0`,
  'jump into kernel (JR 0)': `  LI R1, #0\n  JR R1`,
};
const control = { 'write inside window (5500): must NOT fault': `  LI R0, #-5\n  LI R1, #5500\n  SW R0, R1, #0` };

let bad = 0;
function runOne(name, prog, expectFault) {
  const built = T.assemble(kernel(prog), { mode: 'T3' });
  const res = [];
  for (const vm of [new T.TritonJS({ archMode: 'T3' }), T.TritonWASM.createSync({ archMode: 'T3' })]) {
    vm.loadProgram(built.trytes, 0);
    vm.run(5000);
    res.push({ faults: vm.getMem(410), cause: vm.getMem(413), sentinel: vm.getMem(400), r8: vm.getWordNum(8), k3: vm.getMem(403) });
  }
  const [j, w] = res;
  const same = JSON.stringify(j) === JSON.stringify(w);
  const ok = same && j.sentinel === 7777 && j.r8 === 4242 && (expectFault ? j.faults === 1 : j.faults === 0);
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: js=${JSON.stringify(j)}${same ? '' : ' wasm=' + JSON.stringify(w)}`);
}
for (const [n, p] of Object.entries(probes)) runOne(n, p, true);
for (const [n, p] of Object.entries(control)) runOne(n, p, false);
console.log(bad ? `${bad} probe(s) failed` : 'all protection probes pass');
process.exit(bad ? 1 : 0);
