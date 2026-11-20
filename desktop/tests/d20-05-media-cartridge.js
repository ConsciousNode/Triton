'use strict';
// Test 9 (d20-05-media-cartridge.js):
//   1. Insert a cartridge built by the reference holding /apps/<test>/main and icon ->
//      appears in the App Shelf launcher without reboot, renders its 16x16 icon,
//      launches via SYS_EXEC_BUF, and draws its expected pixels on the framebuffer.
//   2. Install cartridge app from 2:/apps/<test> to 1:/apps/<test>, eject Unit 2,
//      and verify 1:/apps/<test>/main and icon are present on the home disk.
//   3. Eject Unit 2 mid-operation / before copy completes -> fails cleanly without
//      harming anything else, and Unit 1 (home disk) passes tritfs-ref.js fsck.

const {
  TritFS, Unit, T_EXEC, T_IMAGE, T_DATA,
  bootDesktop2, callGuestFs, guestList, guestStat
} = require('./d20-common.js');

function runTest() {
  const { T, vm } = bootDesktop2();

  // Assemble a cartridge app that opens a window at (180, 120, 140, 80) and fills a bright green (+242) rectangle
  const cartAppAsm = `
.mode T3
.org 0
cart_entry:
  LI R0, #180
  LI R1, #120
  LI R2, #140
  LI R3, #80
  LI R4, #str_title - cart_entry
  ADD R4, R4, R8
  LI R5, #-300
  SYSCALL #10

  LI R0, #10
  LI R1, #10
  LI R2, #60
  LI R3, #40
  LI R4, #242
  SYSCALL #20

  LI R0, #0
  LI R1, #0
  LI R2, #0
  LI R3, #0
  SYSCALL #24

cart_loop:
  SYSCALL #2
  JMPX cart_loop

str_title: .stringz "CARTDEMO"
`;
  const builtApp = T.assemble(cartAppAsm);
  if (builtApp.errors && builtApp.errors.length) {
    throw new Error('Failed to assemble cartridge app: ' + builtApp.errors.join('; '));
  }

  // Build 16x16 icon with distinctive pixel value +310
  const iconTrytes = new Int16Array(256).fill(310);

  // Build cartridge image on Unit 2 using tritfs-ref.js
  const cartUnit = new Unit(2187, { removable: true });
  const cartFs = TritFS.mkfs(cartUnit, 'APPCART');
  cartFs.mkdir('/apps');
  cartFs.mkdir('/apps/CARTDEMO');
  cartFs.writeFile('/apps/CARTDEMO/main', builtApp.trytes, T_EXEC);
  cartFs.writeFile('/apps/CARTDEMO/icon', iconTrytes, T_IMAGE);
  cartFs.writeFile('/BIGFILE', new Int16Array(1200).fill(99), T_DATA);

  // Open App 14 (App Shelf) BEFORE inserting the cartridge
  // Click [APPS] on taskbar Row 2: "[FILES] [DISKS] [APPS]" -> x = 6 + 16*9 = 150..204, y = 478
  vm.pushMouseEvent(170 - 364, 478 - 230, 1);
  vm.pushMouseEvent(0, 0, 0);
  vm.run(250000);

  // Insert cartridge into Unit 2 WITHOUT rebooting
  vm.insertUnit(2, cartUnit.toTdisk(), { removable: true, writeProtected: false });
  vm.run(250000);

  // Verify Unit 2 mounted automatically via IRQ_MEDIA and /apps/CARTDEMO is visible
  const appsList = guestList(vm, '2:/apps', 16, 30000);
  if (appsList.count !== 1 || appsList.entries[0].name !== 'CARTDEMO') {
    throw new Error(`Cartridge /apps not mounted on IRQ_MEDIA: ${JSON.stringify(appsList)}`);
  }

  // Trigger App Shelf refresh ('R') and verify 16x16 icon pixel (+310) is drawn in App Shelf window
  vm.pushKeyEvent('R'.charCodeAt(0), 0);
  vm.run(250000);

  let iconPixelsFound = 0;
  for (let i = 0; i < 729 * 486; i++) {
    if (vm.vram[i] === 310) iconPixelsFound++;
  }
  if (iconPixelsFound < 100) {
    throw new Error(`Expected >= 100 cartridge icon pixels (+310) on screen, found ${iconPixelsFound}`);
  }

  // Install cartridge app ('I') and launch it ('\r' = 13) from App Shelf
  vm.pushKeyEvent('I'.charCodeAt(0), 0);
  vm.run(300000);
  vm.pushKeyEvent(13, 0);
  vm.run(600000);

  // Verify launched cartridge app drew its +242 rectangle onto the framebuffer
  let appPixelsFound = 0;
  for (let i = 0; i < 729 * 486; i++) {
    if (vm.vram[i] === 242) appPixelsFound++;
  }
  if (appPixelsFound < 1000) {
    throw new Error(`Expected launched cartridge app to draw >= 1000 pixels (+242), found ${appPixelsFound}`);
  }

  // Verify cartridge app was installed to 1:/apps/CARTDEMO/main and icon
  const installedMain = guestStat(vm, '1:/apps/CARTDEMO/main');
  const installedIcon = guestStat(vm, '1:/apps/CARTDEMO/icon');
  if (!installedMain || !installedIcon) {
    throw new Error('Cartridge app was not installed to 1:/apps/CARTDEMO');
  }

  // Now eject Unit 2 and attempt to copy from 2:/BIGFILE to 1:/COPIED -> must fail cleanly (< 0)
  // and leave 1:/ completely intact and passing tritfs-ref.js fsck!
  vm.ejectUnit(2);
  vm.run(30000);
  const copyRes = callGuestFs(vm, 57, {
    arg0: -9001,
    arg1: -9002,
    path1: '2:/BIGFILE',
    path2: '1:/COPIED',
    replySectors: 1,
    steps: 40000
  });
  if (copyRes.r0 >= 0) {
    throw new Error(`Copy from ejected Unit 2 should fail (< 0), got ${copyRes.r0}`);
  }

  const refHome = new TritFS(Unit.fromTdisk(vm.exportUnitTdisk(1)));
  const homeFsck = refHome.fsck(false);
  if (homeFsck.problems.length !== 0 || homeFsck.orphans.length !== 0) {
    throw new Error(`Home disk fsck failed after ejected cartridge copy: ${JSON.stringify(homeFsck)}`);
  }

  return {
    name: 'd20-05-media-cartridge',
    status: 'PASS',
    mountedWithoutReboot: true,
    iconPixelsFound,
    appPixelsFound,
    installedToHome: true,
    ejectedCopyFailedCleanly: copyRes.r0 < 0,
    homeFsckClean: true
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
