'use strict';
const { loadHtmlModule, makeRng } = require('./t3-common.js');

function fbHash(vm) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < vm.vram.length; i++) {
    const v = vm.vram[i];
    if (v !== 0) { h = Math.imul(h ^ i, 16777619) >>> 0; h = Math.imul(h ^ (v & 0xFFFF), 16777619) >>> 0; }
  }
  return h >>> 0;
}

function runSession(T, useWasm, eventCount) {
  const vm = useWasm ? T.TritonWASM.createSync({ archMode: 'T3' }) : new T.TritonJS({ archMode: 'T3' });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);
  const rng = makeRng(0x13572468);
  const keys = 'LS\nPS\nCAT HELLO\n';
  for (let i = 0; i < eventCount; i++) {
    if (i % 3 === 0) {
      vm.pushKeyEvent(keys.charCodeAt(i % keys.length), 0);
    } else {
      vm.pushMouseEvent(rng.int(-3, 3), rng.int(-3, 3), (i % 20 === 0) ? 1 : 0);
    }
    if (i % 50 === 49) vm.run(1500);
  }
  vm.run(20000);
  return { stateHash: T.computeStateHash(vm), fbHash: fbHash(vm) };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  // 2,000-event determinism on WASM
  const r1 = runSession(T, true, 2000);
  const r2 = runSession(T, true, 2000);
  if (r1.stateHash !== r2.stateHash || r1.fbHash !== r2.fbHash) {
    throw new Error('Determinism mismatch across two 2,000-event runs');
  }
  // Differential lockstep session comparing JS and WASM along the way
  const wasmVm = T.TritonWASM.createSync({ archMode: 'T3' });
  const jsVm = new T.TritonJS({ archMode: 'T3' });
  T.bootTritOSDesktop(wasmVm, false);
  T.bootTritOSDesktop(jsVm, false);
  wasmVm.run(300000);
  jsVm.run(300000);
  let checks = 0;
  for (let i = 0; i < 60; i++) {
    const dx = (i % 5) - 2, dy = (i % 3) - 1;
    wasmVm.pushMouseEvent(dx, dy, 0);
    jsVm.pushMouseEvent(dx, dy, 0);
    wasmVm.run(2000);
    jsVm.run(2000);
    if (i % 10 === 9) {
      checks++;
      if (T.computeStateHash(wasmVm) !== T.computeStateHash(jsVm)) {
        throw new Error('JS vs WASM state hash divergence at check ' + checks);
      }
    }
  }
  if (fbHash(wasmVm) !== fbHash(jsVm)) throw new Error('JS vs WASM framebuffer hash mismatch');
  return { name: '02-determinism-differential', status: 'PASS', events: 2000, stateHash: '0x' + r1.stateHash.toString(16), fbHash: '0x' + r1.fbHash.toString(16), lockstepChecks: checks };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
