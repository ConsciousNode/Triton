// compat-control.js: positive control for compat-long.js: one changed tryte of RAM must change the hash.
'use strict';
const fs = require('fs'), path = require('path'); const ROOT = process.argv[2];
const { loadMutatedHtmlModule } = require(path.join(ROOT, 'tests', 't5-common.js'));
const T4 = loadMutatedHtmlModule(fs.readFileSync(path.join(ROOT, 'triton4.html'), 'utf8'));
const T5 = loadMutatedHtmlModule(fs.readFileSync(path.join(ROOT, 'triton5.html'), 'utf8'));
const asm = T4.assemble(fs.readFileSync(path.join(ROOT, 'desktop', 'guest-200.asm'), 'utf8'), { mode: 'T3' });
const mk = T => { const vm = new T.TritonJS({ archMode: 'T3' }); for (let i = 0; i < asm.trytes.length; i++) vm.disk[i] = asm.trytes[i]; vm.loadProgram(asm.trytes.slice(0, 32), 0); return vm; };
const a = mk(T4), b = mk(T5); a.run(100000); b.run(100000);
const same = T4.computeStateHash(a) === T5.computeStateHash(b);
b.mem[123456] = (b.mem[123456] || 0) + 1;
console.log(JSON.stringify({ equalBefore: same, equalAfterOneTryteChange: T4.computeStateHash(a) === T5.computeStateHash(b) }));
