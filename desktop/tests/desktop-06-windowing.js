'use strict';
const { loadHtmlModule, readFbPixel, readDiskFileTrytes, readDiskWord, makeMouseTracker } = require('./t3-common.js');

function runWindowingScenario(T, perturbCompositor = false) {
  const vm = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm, false, perturbCompositor ? { perturbCompositor: true } : {});
  vm.run(300000);
  const mouse = makeMouseTracker(vm);

  // Move Terminal (Win 1 at 12,12) so it overlaps Clock (Win 0 at 520,12) by dragging its titlebar from (30, 16) to (460, 16)
  mouse.drag(30, 16, 460, 16, 180000);

  // Read MMIO framebuffer pixels BEFORE running KSTAT so KSTAT does not change lastRedrawTrytes:
  // 1. Vacated region at (20, 25) must be repainted to desktop background (-280)
  const vacatedPx = readFbPixel(vm, T, 20, 25);
  // 2. Overlap region at (530, 25): specifically check left border of moved Terminal at x = 442, y = 25 (COL_WIN_BORDER = 120)
  //    and interior body at (530, 25) (-340). With perturbCompositor: true, guest compositor shifts window source by 1px so x=442 shows -340 instead of border 120!
  const borderPx = readFbPixel(vm, T, 442, 25);
  const overlapPx = readFbPixel(vm, T, 530, 25);
  // 3. Non-overlapped part of Clock at (650, 25) must still show Clock (-320)
  const clockPx = readFbPixel(vm, T, 650, 25);

  // Query lastRedrawTrytes via guest Terminal "KSTAT\n" -> file "KSTAT" on disk
  for (const c of 'KSTAT\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(120000);
  const kstat = readDiskFileTrytes(vm, T, 'KSTAT');
  const lastRedrawTrytes = kstat ? readDiskWord(kstat, 9) : 0;

  return { vacatedPx, borderPx, overlapPx, clockPx, lastRedrawTrytes, fullScreenTrytes: T.T3_FB_SIZE };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const res = runWindowingScenario(T, false);
  if (res.vacatedPx !== -280) throw new Error('Vacated region not repainted: ' + res.vacatedPx);
  if (res.borderPx !== 120) throw new Error('Moved window border wrong pixel (compositor offset): ' + res.borderPx);
  if (res.overlapPx !== -340) throw new Error('Overlap region wrong pixel: ' + res.overlapPx);
  if (res.clockPx !== -320) throw new Error('Clipped underlying window wrong pixel: ' + res.clockPx);
  if (res.lastRedrawTrytes <= 0 || res.lastRedrawTrytes >= res.fullScreenTrytes / 2) {
    throw new Error('Redraw tryte count out of bounds: ' + res.lastRedrawTrytes);
  }
  return { name: '06-windowing-damage-redraw', status: 'PASS', ...res };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest, runWindowingScenario };
