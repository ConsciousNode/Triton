#!/usr/bin/env node
'use strict';
// Audit probe (Kehai, 2026-11-12): the delivered calculator test kills the other tasks by writing their TCB STATE
// fields from the host before checking 100 expressions. Here: same expressions, same device-queue input, but no
// host writes to guest memory at all, with every other task still running and preempting.
const { loadHtmlModule, makeRng } = require('../tests/t3-common.js');
const { T } = loadHtmlModule('tritos-desktop.html');
const vm = T.TritonWASM.createSync({ archMode: 'T3' });
T.bootTritOSDesktop(vm, false);
vm.run(300000);
const cx = vm.mem[8910], cy = vm.mem[8911];
vm.pushMouseEvent(354 - cx, 472 - cy, 1); vm.pushMouseEvent(0, 0, 0);
vm.run(280000);
const calcTask = vm.mem[8909];
const ub = (10 + calcTask * 2) * 19683;
const rng = makeRng(0x98765432); const ops = ['+', '-', '*'];
let ok = 0, bad = 0, steps = Number(process.argv[2] || 35000);
for (let i = 0; i < 100; i++) {
  const a = rng.int(-400, 400), b = rng.int(-400, 400), op = ops[i % 3];
  const sa = T.intToTernaryStr(a, 7), sb = T.intToTernaryStr(b, 7);
  for (const c of sa + op + sb + '=') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(steps);
  const got = BigInt(vm.mem[ub + 2000] + vm.mem[ub + 2001] * 19683 + vm.mem[ub + 2002] * 387420489); // read-only check
  const A = T.ternaryStrToBigInt(sa), B = T.ternaryStrToBigInt(sb);
  const exp = op === '+' ? A + B : op === '-' ? A - B : A * B;
  if (got === exp) ok++; else bad++;
}
const states = [0, 1, 2, 3, 4, 5, 6, 7].map(t => vm.mem[6000 + t * 64 + 42]);
console.log(JSON.stringify({ stepsPerExpr: steps, correct: ok, wrong: bad, otherTasksStillRunning: states }));
process.exit(bad ? 1 : 0);
