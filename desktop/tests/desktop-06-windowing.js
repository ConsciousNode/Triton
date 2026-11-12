'use strict';
const { loadHtmlModule } = require('./t3-common.js');

function runWindowingScenario(T, perturbPixel = false) {
  const vm = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);

  // Move Terminal (Win 1 at 12,12) so it overlaps Clock (Win 0 at 520,12) by dragging its titlebar from (30, 16) to (460, 16)
  const cx = vm.mem[8910], cy = vm.mem[8911];
  vm.pushMouseEvent(30 - cx, 16 - cy, 1); // press on Terminal titlebar
  vm.pushMouseEvent(430, 0, 1);           // drag right by 430px -> new_x = 442 (overlaps Clock at 520..622!)
  vm.pushMouseEvent(0, 0, 0);             // release
  vm.run(180000);

  const lastRedrawTrytes = vm.mem[8912] + vm.mem[8913] * 19683;
  if (perturbPixel) {
    // Positive control perturbation: corrupt 1 pixel in overlap region
    vm.setMem(T.T3_FB_BASE + 25 * 729 + 530, 123);
  }
  // Check MMIO framebuffer readback:
  // 1. Vacated region at (20, 25) must be repainted to desktop background (-280)
  const vacatedPx = vm.getMem(T.T3_FB_BASE + 25 * 729 + 20);
  // 2. Overlap region at (530, 25) must show top window (Terminal body = -340 or border/titlebar)
  const overlapPx = vm.getMem(T.T3_FB_BASE + 25 * 729 + 530);
  // 3. Non-overlapped part of Clock at (650, 25) must still show Clock (-320)
  const clockPx = vm.getMem(T.T3_FB_BASE + 25 * 729 + 650);

  return { vacatedPx, overlapPx, clockPx, lastRedrawTrytes, fullScreenTrytes: T.T3_FB_SIZE };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const res = runWindowingScenario(T, false);
  if (res.vacatedPx !== -280) throw new Error('Vacated region not repainted: ' + res.vacatedPx);
  if (res.overlapPx !== -340) throw new Error('Overlap region wrong pixel: ' + res.overlapPx);
  if (res.clockPx !== -320) throw new Error('Clipped underlying window wrong pixel: ' + res.clockPx);
  if (res.lastRedrawTrytes >= res.fullScreenTrytes / 2) throw new Error('Redraw wrote too many trytes: ' + res.lastRedrawTrytes);
  return { name: '06-windowing-damage-redraw', status: 'PASS', ...res };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest, runWindowingScenario };
