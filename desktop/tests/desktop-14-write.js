'use strict';
const { loadHtmlModule, readFbString, readDiskFileString, makeMouseTracker } = require('./t3-common.js');

// 3.1.1: type in bursts the guest can drain, the way a person types. Before 3.1.1 this test
// pushed ~2,500 keys in one burst; that only passed on TritonJS's unbounded queue (on
// TritonWASM, keys past 2,048 were dropped and it failed). Both cores now hold 2,048 pending
// events, and this test runs on both.
function typeKeys(vm, codes) {
  for (let i = 0; i < codes.length; i += 64) {
    for (let j = i; j < Math.min(codes.length, i + 64); j++) vm.pushKeyEvent(codes[j], 0);
    vm.run(150000);
  }
}

function runTest() {
  const a = runOnCore('js');
  const b = runOnCore('wasm');
  if (a.charCount !== b.charCount) throw new Error('JS/WASM disagree: ' + a.charCount + ' vs ' + b.charCount);
  return Object.assign({}, a, { cores: ['js', 'wasm'] });
}

function runOnCore(core) {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const vm = core === 'js' ? new T.TritonJS({ archMode: 'T3' }) : T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);
  const mouse = makeMouseTracker(vm);

  // Launch Write (App 8) via taskbar click at (565, 472)
  mouse.click(565, 472, 350000);

  // Build a 2,100+ character multi-line document and exercise cursor moves, insert, backspace, delete, newlines, scrolling, and Save-As
  const lines = [];
  for (let i = 0; i < 35; i++) {
    lines.push('Line ' + String(i).padStart(2, '0') + ': TritOS 1.1 Write word processor test paragraph ' + (i * 19));
  }
  const body = lines.join('\n');
  typeKeys(vm, Array.from(body, (ch) => ch.charCodeAt(0)));
  // Exercise Backspace, Left, Right, Delete, Home, End, PgUp, PgDn:
  // Type 'X', Backspace 'X'; Left 1 char, type 'Y', Left 1 char, Delete 'Y'; Home, End, PgUp, PgDn, End
  vm.pushKeyEvent('X'.charCodeAt(0), 0);
  vm.pushKeyEvent(8, 0);   // Backspace
  vm.pushKeyEvent(128, 0); // Left
  vm.pushKeyEvent('Y'.charCodeAt(0), 0);
  vm.pushKeyEvent(128, 0); // Left
  vm.pushKeyEvent(127, 0); // Delete
  vm.pushKeyEvent(132, 0); // Home
  vm.pushKeyEvent(133, 0); // End
  vm.pushKeyEvent(134, 0); // PgUp
  vm.pushKeyEvent(135, 0); // PgDn
  // Save-As (Ctrl+W = 23) -> "WRTDOC\n"
  vm.pushKeyEvent(23, 0);
  for (const c of 'WRTDOC\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(4500000);

  const saved = readDiskFileString(vm, T, 'WRTDOC');
  if (!saved || saved.length < 2000) {
    throw new Error('Expected saved WRTDOC >= 2000 chars, got ' + (saved ? saved.length : 0));
  }
  if (saved !== body) {
    throw new Error('Saved WRTDOC content mismatch (len=' + saved.length + ' vs ' + body.length + ')');
  }

  // Reboot with keepDisk = true, launch Write, Open "WRTDOC" via Ctrl+O (15), and check MMIO framebuffer of first lines!
  T.bootTritOSDesktop(vm, true);
  vm.run(300000);
  const mouse2 = makeMouseTracker(vm);
  mouse2.click(565, 472, 450000);
  vm.pushKeyEvent(15, 0); // Ctrl+O (Open)
  for (const c of 'WRTDOC\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(600000);

  // Write window is at (60, 24) -> client origin at (61, 36).
  // First visual line is drawn at client (4, 16) -> screen (65, 52), bg = -310
  // Note: at cursor_pos = 0, first char (x=65, y=52) has inverted cursor background (364), chars 1..15 at x=73..185 have bg = -310
  const line0Str = readFbString(vm, T, 67, 54, 15, -340);
  if (!line0Str.startsWith('LINE 00: TRITOS')) {
    throw new Error('Reopened Write MMIO framebuffer first line mismatch: got ' + JSON.stringify(line0Str));
  }

  return {
    name: '14-write-word-processor',
    status: 'PASS',
    savedFile: 'WRTDOC',
    charCount: saved.length,
    reopenedFirstLineCheck: line0Str
  };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
