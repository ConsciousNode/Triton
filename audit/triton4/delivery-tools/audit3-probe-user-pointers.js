'use strict';
// Auditor probe (Kehai, AUDIT-3): do path syscalls check user pointers?
// Uses the delivered d20 harness unmodified; only passes raw args.
const D = process.argv[2] + '/tests/d20-common.js';
const C = require(D);
const { bootDesktop2, callGuestFs, guestWrite, guestRead, TritFS, Unit } = C;
const { vm } = bootDesktop2({ backend: process.argv[3] || 'JS' });
const mem = a => (vm.getMem ? vm.getMem(a) : vm.mem[a]);
console.log('mem size', vm.mem ? vm.mem.length : '?');
// marker file
const N = 30;
const marker = Int16Array.from({ length: N }, (_, i) => 1000 + i * 7);
const w = guestWrite(vm, '1:/PMARK', marker);
console.log('write 1:/PMARK r0=', w.r0);
const back = guestRead(vm, '1:/PMARK', 64);
console.log('control read r0=', back.status, 'match=', back.data && back.data.every((v, i) => v === marker[i]));

function probeRead(label, dst) {
  const before = []; for (let i = 0; i < N; i++) before.push(mem(dst + i));
  const r = callGuestFs(vm, 52, { arg0: -9001, arg1: dst, arg2: N, path1: '1:/PMARK', replySectors: 1, replyTrytes: 64 });
  const after = []; for (let i = 0; i < N; i++) after.push(mem(dst + i));
  const hit = after.every((v, i) => v === marker[i]);
  const changed = after.some((v, i) => v !== before[i]);
  console.log(`READ dst=${label} (${dst}): r0=${r.r0} changed=${changed} equalsMarker=${hit}`);
}
probeRead('kernel bank 100', 100 * 19683 + 500);
probeRead('slot-7 user segment', 24 * 19683 + 500);
probeRead('kernel TCB+? (6000+400)', 6000 + 400);

// write with src pointer in kernel memory: leak
const SRC = 74 * 19683 + 0; const L = 40;
const expect = []; for (let i = 0; i < L; i++) expect.push(mem(SRC + i));
const r2 = callGuestFs(vm, 53, { arg0: -9001, arg1: SRC, arg2: L, arg3: 1, path1: '1:/LEAK', replySectors: 1 });
const fs1 = new TritFS(Unit.fromTdisk(vm.exportUnitTdisk(1)));
const got = fs1.readFile('/LEAK');
console.log(`WRITE src=kernel bank 74 (${SRC}): r0=${r2.r0} fileLen=${got ? got.length : null} equalsKernelMem=${got && expect.every((v, i) => v === got[i])} nonzero=${expect.filter(v => v !== 0).length}/${L}`);
console.log('halted', vm.halted);
