'use strict';
const { loadHtmlModule, readFbString, listDiskFiles, readDiskFileString, makeMouseTracker } = require('./t3-common.js');

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const vm = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);
  const mouse = makeMouseTracker(vm);

  // 1. Launch Editor (App 1) and save file NOTE ("PERSIST TEST!" + Ctrl+S)
  for (const c of 'RUN 1\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(280000);
  for (const c of 'PERSIST TEST!\x13') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(150000);

  // 2. Launch Paint (App 2) via taskbar (150, 472) and save multi-sector image ART (3,072 trytes = 5 sectors)
  mouse.click(150, 472, 320000);
  vm.pushKeyEvent('S'.charCodeAt(0), 0);
  vm.run(160000);

  const beforeReboot = listDiskFiles(vm, T);
  if (beforeReboot.fileCount !== 4) {
    throw new Error('Expected 4 files before reboot (HELLO, DEMO, NOTE, ART), got ' + beforeReboot.fileCount);
  }
  if (readDiskFileString(vm, T, 'NOTE') !== 'PERSIST TEST!') {
    throw new Error('Saved NOTE content mismatch');
  }

  // 3. Focus Terminal at (30, 30) and run LS and CAT NOTE
  mouse.click(30, 30, 80000);
  for (const c of 'LS\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(100000);
  for (const c of 'CAT NOTE\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(100000);

  // 4. Export disk mid-session, import into a fresh VM, and verify bit-identical
  const exported = T.exportDiskImage(vm);
  const vm2 = T.TritonWASM.createSync({ archMode: 'T3' });
  T.importDiskImage(vm2, exported);
  const exported2 = T.exportDiskImage(vm2);
  if (Buffer.compare(Buffer.from(exported), Buffer.from(exported2)) !== 0) {
    throw new Error('Exported/imported disk image is not bit-identical');
  }

  // 5. Reboot with keepDisk = true and verify all 4 files persist
  T.bootTritOSDesktop(vm, true);
  vm.run(300000);
  const afterReboot = listDiskFiles(vm, T);
  if (afterReboot.fileCount < 4) {
    throw new Error('Files did not persist across reboot: count=' + afterReboot.fileCount);
  }

  // 6. Delete file ("RM DEMO\n") via Terminal after reboot
  for (const c of 'RM DEMO\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(100000);
  const afterDelete = listDiskFiles(vm, T);
  if (afterDelete.fileCount !== 3) {
    throw new Error('Delete failed: count=' + afterDelete.fileCount);
  }

  // 7. Real guest disk fill: run "FILL\n" in Terminal (guest writes 50-sector files F00, F01, ... until SYS_FS_WRITE returns -1)
  for (const c of 'FILL\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(600000);
  const afterFill = listDiskFiles(vm, T);
  // Check MMIO framebuffer on Terminal (client (6, 36) -> screen (19, 60), bg = -340) for "DISK FULL"
  const termMsg = readFbString(vm, T, 19, 60, 9, -340);
  if (termMsg !== 'DISK FULL') {
    throw new Error('Expected Terminal to display DISK FULL on MMIO framebuffer, got: ' + termMsg);
  }
  if (afterFill.nextFreeLba <= 2137) {
    throw new Error('Expected disk LBA allocation to reach end of 2,187-sector disk, got nextFreeLba=' + afterFill.nextFreeLba);
  }

  return {
    name: '05-filesystem',
    status: 'PASS',
    persistedFiles: afterReboot.fileCount,
    countAfterDelete: afterDelete.fileCount,
    filesAfterGuestFill: afterFill.fileCount,
    nextFreeLbaAfterFill: afterFill.nextFreeLba,
    diskFullMsg: termMsg,
    diskBytes: exported.byteLength
  };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
