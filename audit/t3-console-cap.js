#!/usr/bin/env node
'use strict';
// Audit probe (Kehai, 2026-11-12): WASM getConsoleOut() is rebuilt from the I/O trace, which stops at
// 10,900 events; consoleAcc is never appended to. A long TritOS 3 session should still match JS.
const { loadHtmlModule } = require('../tests/t3-common');
const { T } = loadHtmlModule('triton3.html');
const os = T.assemble(T.TRITOS3_SRC, { mode: 'T3' });
const n = Number(process.argv[2] || 400);
const input = 'calc 1+1\n'.repeat(n) + 'quit\n';
const js = new T.TritonJS({ archMode: 'T3' }), wa = T.TritonWASM.createSync({ archMode: 'T3' });
for (const vm of [js, wa]) { vm.loadProgram(os.trytes, 0); vm.pushInputString(input); vm.run(20000000); }
const a = js.consoleOut, b = wa.getConsoleOut();
console.log({ sessions: n, jsLen: a.length, wasmLen: b.length, traceLen: wa.i32[20556], equal: a === b, jsHalted: js.halted, wasmHalted: wa.halted });
process.exit(a === b ? 0 : 1);
