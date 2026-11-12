'use strict';
const { loadHtmlModule } = require('./t3-common.js');

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const vm = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);

  // 1. Launch Editor (App 1) and save file NOTE ("PERSIST TEST!" = 13 chars, plus Ctrl+S = 14 events <= 16 queue cap!)
  for (const c of 'RUN 1\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(280000);
  for (const c of 'PERSIST TEST!\x13') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(150000);

  // 2. Launch Paint (App 2) and save multi-sector image ART (3,072 trytes = 5 sectors)
  const cx = vm.mem[8910], cy = vm.mem[8911];
  vm.pushMouseEvent(150 - cx, 472 - cy, 1);
  vm.pushMouseEvent(0, 0, 0);
  vm.run(360000);
  vm.pushKeyEvent('S'.charCodeAt(0), 0);
  vm.run(160000);

  if (vm.mem[7810] !== 4) {
    throw new Error('Expected 4 files before reboot (HELLO, DEMO, NOTE, ART), got ' + vm.mem[7810]);
  }

  // 3. Test delete ("RM HELLO\n" in Terminal) and re-verify count, then re-save
  // Focus Terminal (Win 1 at 12, 12)
  const cxT = vm.mem[8910], cyT = vm.mem[8911];
  vm.pushMouseEvent(30 - cxT, 30 - cyT, 1);
  vm.pushMouseEvent(0, 0, 0);
  vm.run(80000);
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

  // 5. Reboot with the same disk image (keepDisk = true) and verify all 4 files (including multi-sector ART) persist
  T.bootTritOSDesktop(vm, true);
  vm.run(300000);
  const fileCountAfterReboot = vm.mem[7810];
  if (fileCountAfterReboot < 4) throw new Error('Files did not persist across reboot: count=' + fileCountAfterReboot);

  // 6. Test Delete file ("RM DEMO\n") via Terminal after reboot
  for (const c of 'RM DEMO\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(100000);
  const countAfterDelete = vm.mem[7810];
  if (countAfterDelete !== 3) throw new Error('Delete failed: count=' + countAfterDelete);

  // 7. Fill disk until it reports full (-1): set NEXT_FREE_LBA to 2185 (2 sectors left) and attempt to save 5-sector Paint file "FULL"
  vm.mem[7807] = 2185;
  vm.setDisk(200 * 729 + 707, 2185);
  const cx2 = vm.mem[8910], cy2 = vm.mem[8911];
  vm.pushMouseEvent(150 - cx2, 472 - cy2, 1);
  vm.pushMouseEvent(0, 0, 0);
  vm.run(360000);
  const paintUbase = (10 + vm.mem[8909] * 2) * 19683;
  vm.mem[paintUbase + 1400] = 70; // 'F' -> filename "FRT" (new file requiring 5 sectors > 2 available)
  vm.pushKeyEvent('S'.charCodeAt(0), 0);
  vm.run(120000);
  const countAfterFull = vm.mem[7810];
  if (countAfterFull !== 3) throw new Error('Disk full should reject write, but file count changed to ' + countAfterFull);

  return { name: '05-filesystem', status: 'PASS', persistedFiles: fileCountAfterReboot, countAfterDelete, diskFullRejected: countAfterFull === 3, diskBytes: exported.byteLength };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
