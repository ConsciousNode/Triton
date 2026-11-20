'use strict';
// Auditor probes for Desktop 2.0.1 (Kehai, 2026-11-19): the private extras from PREREG.md §3, not in the spec.
// Uses the delivered d20 harness unmodified; only passes raw args. The auditor reads guest memory to observe
// (before/after snapshots); nothing in the harness or the machine is changed.
// usage: node audit-201-private-probes.js <tree>/triton/desktop [JS|WASM]
const C = require(process.argv[2] + '/tests/d20-common.js');
const { bootDesktop2, callGuestFs, guestWrite, guestRead } = C;
let vm = null;
const mem = a => (vm.getMem ? vm.getMem(a) : vm.mem[a]);
const word = a => mem(a) + 19683 * mem(a + 1) + 19683 * 19683 * mem(a + 2);
const snap = (a, n) => Array.from({ length: n }, (_, i) => mem(a + i));
const same = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
let fails = 0; const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

const N = 30, marker = Int16Array.from({ length: N }, (_, i) => 2000 + i * 11);
const TCB_BASE = 6000, TCB_SIZE = 64; let slot = -1, UB = 0, UL = 0, tcb = 0, boots = 0;
// every case gets a freshly booted machine: on a broken build one case can wreck the agent (a hang counts as a FAIL)
function fresh() { vm = bootDesktop2({ backend: process.argv[3] || 'JS' }).vm; boots++;
  guestWrite(vm, '1:/PMARK', marker); const back = guestRead(vm, '1:/PMARK', 64);
  if (!(back.status === N && back.data.every((v, i) => v === marker[i]))) throw new Error('control read failed');
  slot = -1; for (let s = 0; s < 40; s++) { const t = TCB_BASE + s * TCB_SIZE, ub = word(t + 36), ul = word(t + 39);
    if (ub <= 0 || ul <= ub) continue; const p = String.fromCharCode(...snap(ub + 4630, 8).map(v => v & 255));
    if (p === '1:/PMARK') { slot = s; UB = ub; UL = ul; } }
  if (slot < 0) throw new Error('agent not found'); tcb = TCB_BASE + slot * TCB_SIZE; }
const cases = [];
const kase = (name, fn) => cases.push([name, fn]);

kase('own TCB', () => {
// 1. the escalation lead: read a file over the caller's OWN TCB (the saved ESR lives at +33)
// (the TCB holds live saved registers that change whenever the agent runs, so "unchanged" is the wrong test: the test
// is that the file's bytes did not land there, and that UBASE/ULIMIT are intact)
{ const r = callGuestFs(vm, 52, { arg0: -9001, arg1: tcb, arg2: N, path1: '1:/PMARK', replySectors: 1, replyTrytes: 64 });
  const t = snap(tcb, TCB_SIZE); let landed = false; for (let i = 0; i + 4 <= TCB_SIZE; i++) if (t.slice(i, i + 4).every((v, k) => v === marker[k])) landed = true;
  check(r.r0 === -14 && !landed && word(tcb + 36) === UB && word(tcb + 39) === UL,
    `#52 into own TCB (${tcb}): r0=${r.r0}, the file's bytes are not in the TCB, UBASE/ULIMIT intact`); } });

kase('straddle', () => {
// 2. #51 stat and #50 list with the output straddling ULIMIT by one tryte; controls exactly at the limit
for (const [num, len, label, extra] of [[51, 27, 'stat', {}], [50, 64 * 27, 'list', { arg2: 0 }]]) {
  const okPtr = UL - len, badPtr = UL - len + 1;
  const bb = snap(badPtr - 5, len + 10);
  const rb = callGuestFs(vm, num, { arg0: -9001, arg1: badPtr, path1: num === 51 ? '1:/PMARK' : '1:/', replySectors: 1, replyTrytes: 64, ...extra });
  check(rb.r0 === -14 && same(bb, snap(badPtr - 5, len + 10)), `#${num} ${label} out at ULIMIT-${len}+1 (straddles by one): r0=${rb.r0}, nothing written`);
  const rc = callGuestFs(vm, num, { arg0: -9001, arg1: okPtr, path1: num === 51 ? '1:/PMARK' : '1:/', replySectors: 1, replyTrytes: 64, ...extra });
  check(rc.r0 !== -14, `#${num} ${label} out exactly at ULIMIT-${len} (control, fits): r0=${rc.r0}`); } });

kase('whole file', () => {
// 3. #52 "read the whole file" (max_trytes <= 0) into a buffer with less room than the file: refused before any copy
{ const dst = UL - 10, bb = snap(dst - 5, 40);
  const r = callGuestFs(vm, 52, { arg0: -9001, arg1: dst, arg2: 0, path1: '1:/PMARK', replySectors: 1, replyTrytes: 64 });
  check(r.r0 === -14 && same(bb, snap(dst - 5, 40)), `#52 whole-file read of ${N} trytes into ULIMIT-10: r0=${r.r0}, nothing written (not even the part that fits)`);
  const dst2 = UL - N, r2 = callGuestFs(vm, 52, { arg0: -9001, arg1: dst2, arg2: 0, path1: '1:/PMARK', replySectors: 1, replyTrytes: 64 });
  check(r2.r0 === N && same(snap(dst2, N), Array.from(marker)), `#52 whole-file read into ULIMIT-${N} (control, exact fit): r0=${r2.r0}, data matches`); } });

kase('unterminated path', () => {
// 4. a path with no terminator before ULIMIT
{ const p = UL - 6, bb = snap(p, 6);
  // the agent can only hand over a raw pointer; fill the last 6 trytes of its window with nonzero characters via a #52 read
  const fill = Int16Array.from({ length: 6 }, () => 65); guestWrite(vm, '1:/FILLA', fill);
  const rf = callGuestFs(vm, 52, { arg0: -9001, arg1: p, arg2: 6, path1: '1:/FILLA', replySectors: 1, replyTrytes: 64 });
  const r = callGuestFs(vm, 54, { arg0: p, replySectors: 1, replyTrytes: 0 });
  check(rf.r0 === 6 && r.r0 === -14, `#54 mkdir with an unterminated path ending at ULIMIT: setup r0=${rf.r0}, r0=${r.r0}`); void bb; } });

for (const [name, fn] of cases) { try { fresh(); fn(); check(!vm.halted, `${name}: machine still running`); }
  catch (e) { check(false, `${name}: ${e.message.split('\n')[0]}`); } }
console.log(`agent: TCB slot ${slot}, UBASE ${UB}, ULIMIT ${UL}; ${boots} fresh boots`);
console.log(`${fails ? 'FAILURES: ' + fails : 'ALL OK'}`);
process.exit(fails ? 1 : 0);
