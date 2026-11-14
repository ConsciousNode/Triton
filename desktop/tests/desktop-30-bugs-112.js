'use strict';
const fs = require('fs');
const path = require('path');
const {
  loadHtmlModule, readFbPixel, readDiskFileString, makeMouseTracker
} = require('./t3-common.js');

function readRect(vm, T, x0, y0, w, h) {
  const out = new Int16Array(w * h);
  let k = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[k++] = readFbPixel(vm, T, x0 + x, y0 + y);
    }
  }
  return out;
}

function bresenhamPoints(x0, y0, x1, y1) {
  const pts = [];
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0, y = y0;
  while (true) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return pts;
}

function runBugsSuite(htmlFile = 'tritos-desktop.html') {
  const { T, htmlContent } = loadHtmlModule(htmlFile);

  // 1. Taskbar labels intact after 500 cursor passes over them (pixel compare against a clean redraw)
  const vm1 = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm1, false);
  vm1.run(300000);
  const mouse1 = makeMouseTracker(vm1);
  // Move cursor off taskbar first to capture clean reference taskbar
  mouse1.moveTo(364, 200, 0);
  vm1.run(20000);
  const cleanTaskbar = readRect(vm1, T, 0, 462, 729, 24);

  for (let i = 0; i < 500; i++) {
    const x = 6 + ((i * 19) % 710);
    const y = 463 + (i % 21);
    mouse1.moveTo(x, y, 0);
    vm1.run(6000);
  }
  mouse1.moveTo(364, 200, 0);
  vm1.run(25000);
  const afterTaskbar = readRect(vm1, T, 0, 462, 729, 24);
  let taskbarDiffPixels = 0;
  for (let i = 0; i < cleanTaskbar.length; i++) {
    if (cleanTaskbar[i] !== afterTaskbar[i]) taskbarDiffPixels++;
  }

  // 2. Paint drag stroke stays inside the canvas and matches the expected polyline
  const vm2 = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm2, false);
  vm2.run(300000);
  const mouse2 = makeMouseTracker(vm2);
  mouse2.click(150, 472, 420000); // Launch Paint (App 2) at window (250, 130)
  const wx = 250, wy = 130;
  // Client coordinate origin in window is (wx + 1, wy + 12)
  // Canvas is client [10..73] x [28..75] -> screen [261..324] x [170..217]
  const sx0 = wx + 1 + 15, sy0 = wy + 12 + 32; // client (15, 32)
  const sx1 = wx + 1 + 55, sy1 = wy + 12 + 52; // client (55, 52)
  const sxOut = wx + 1 + 125, syOut = wy + 12 + 6; // client (125, 6) inside [CLR] button on toolbar!

  const toolbarBefore = readRect(vm2, T, wx + 1, wy + 12, 170, 26);
  mouse2.moveTo(sx0, sy0, 0);
  vm2.run(15000);
  mouse2.moveTo(sx0, sy0, 1); // mousedown at (15, 32)
  vm2.run(30000);
  mouse2.moveTo(sx1, sy1, 1); // drag in a single jump to (55, 52)
  vm2.run(60000);
  mouse2.moveTo(sxOut, syOut, 1); // drag outside canvas across toolbar [CLR]
  vm2.run(60000);
  mouse2.moveTo(sxOut, syOut, 0); // mouseup
  mouse2.moveTo(364, 230, 0); // move cursor off toolbar before comparing
  vm2.run(30000);

  const expectedLine = bresenhamPoints(sx0, sy0, sx1, sy1);
  let polylineMatched = 0;
  for (const [px, py] of expectedLine) {
    if (readFbPixel(vm2, T, px, py) === 364) polylineMatched++;
  }
  const toolbarAfter = readRect(vm2, T, wx + 1, wy + 12, 170, 26);
  let outsideCanvasDiffs = 0;
  for (let i = 0; i < toolbarBefore.length; i++) {
    if (toolbarBefore[i] !== toolbarAfter[i]) outsideCanvasDiffs++;
  }

  // 3. Typing the full alphabet in the editor keeps every letter, and F2/F3 still save and load
  const vm3 = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm3, false);
  vm3.run(300000);
  for (const c of 'RUN 1\n') vm3.pushKeyEvent(c.charCodeAt(0), 0);
  vm3.run(280000);
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const ch of alphabet) {
    vm3.pushKeyEvent(ch.charCodeAt(0), 0);
    vm3.run(12000);
  }
  // Save with F2 (137)
  vm3.pushKeyEvent(137, 0);
  vm3.run(150000);
  const savedAfterF2 = readDiskFileString(vm3, T, 'NOTE');

  // Clear buffer by clicking [CLR] at client (150, 6) inside Editor window (250, 20) -> screen (401, 38)
  const mouse3 = makeMouseTracker(vm3);
  mouse3.click(401, 38, 80000);
  // Load back with F3 (138), append '!', and save again with F2 (137)
  vm3.pushKeyEvent(138, 0);
  vm3.run(150000);
  vm3.pushKeyEvent('!'.charCodeAt(0), 0);
  vm3.run(15000);
  vm3.pushKeyEvent(137, 0);
  vm3.run(150000);
  const savedAfterF3Reload = readDiskFileString(vm3, T, 'NOTE');

  // 4. Static scan: no app compares a key against 112..123, and version string defined once
  const asmSrc = T.TRITOS_DESKTOP_SRC || '';
  const badKeyComparisons = [];
  asmSrc.split('\n').forEach((line, idx) => {
    const clean = line.split(';')[0];
    const m = clean.match(/\bCMPI\s+R\d+\s*,\s*#(11[2-9]|12[0-3])\b/);
    if (m) badKeyComparisons.push({ line: idx + 1, code: clean.trim() });
  });

  const versionMatches = htmlContent.match(/TritOS Desktop 1\.1\.2/g) || [];
  const staleVersionMatches = htmlContent.match(/TritOS Desktop 1\.1(\.1|(?![.0-9]))/g) || [];

  return {
    taskbarDiffPixels,
    polylineExpected: expectedLine.length,
    polylineMatched,
    outsideCanvasDiffs,
    savedAfterF2,
    savedAfterF3Reload,
    badKeyComparisons,
    versionDefCount: versionMatches.length,
    staleVersionCount: staleVersionMatches.length
  };
}

function runTest() {
  // First verify that the reproduction test FAILS on 1.1.1 backup if present
  const bakPath = path.resolve(__dirname, '..', 'tritos-desktop-1.1.1.html.bak');
  let failedOn111 = false;
  let res111 = null;
  if (fs.existsSync(bakPath)) {
    res111 = runBugsSuite(bakPath);
    failedOn111 = (
      res111.taskbarDiffPixels > 0 &&
      res111.polylineMatched < res111.polylineExpected &&
      res111.savedAfterF2 !== 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' &&
      res111.badKeyComparisons.length > 0
    );
    if (!failedOn111) {
      throw new Error('Bug reproduction test did not fail on 1.1.1: ' + JSON.stringify(res111));
    }
  }

  const res = runBugsSuite('tritos-desktop.html');
  if (res.taskbarDiffPixels !== 0) {
    throw new Error('Bug 1 failed: taskbar garbled after 500 cursor passes, diffPixels=' + res.taskbarDiffPixels);
  }
  if (res.polylineMatched !== res.polylineExpected || res.outsideCanvasDiffs !== 0) {
    throw new Error('Bug 2 failed: Paint drag polylineMatched=' + res.polylineMatched + '/' + res.polylineExpected + ' outsideCanvasDiffs=' + res.outsideCanvasDiffs);
  }
  if (res.savedAfterF2 !== 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' ||
      res.savedAfterF3Reload !== 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!') {
    throw new Error('Bug 3 failed: Editor F2/F3 or alphabet mismatch: ' + JSON.stringify({ f2: res.savedAfterF2, f3: res.savedAfterF3Reload }));
  }
  if (res.badKeyComparisons.length !== 0) {
    throw new Error('Bug 3 static scan failed: found comparisons against 112..123: ' + JSON.stringify(res.badKeyComparisons));
  }
  if (res.versionDefCount !== 1 || res.staleVersionCount !== 0) {
    throw new Error('Bug 5 failed: TRITOS_VERSION must be defined once (got ' + res.versionDefCount + ') with 0 stale 1.1/1.1.1 strings (got ' + res.staleVersionCount + ')');
  }

  return {
    name: '30-playtest-bugs-1.1.2',
    status: 'PASS',
    reproducedOn111: failedOn111,
    on111: res111 ? {
      taskbarDiffPixels: res111.taskbarDiffPixels,
      polylineMatched: res111.polylineMatched + '/' + res111.polylineExpected,
      savedAfterF2: res111.savedAfterF2,
      badKeyComparisons: res111.badKeyComparisons.length
    } : null,
    on112: res
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest, runBugsSuite };
