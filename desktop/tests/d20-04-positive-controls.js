'use strict';
// Test 8 (d20-04-positive-controls.js):
//   1. Guest fsck detects a planted cross-link (two files sharing a sector) and reports problems > 0 without repairing/destroying files.
//   2. Guest fsck detects a planted SLT cycle/loop and reports problems > 0 without hanging.
//   3. Guest fsck detects a planted orphan sector, reports orphans == 1, and repairs ONLY the orphan when repair=1.
//   4. Guest refuses to mount a unit with a corrupted superblock magic.

const {
  TritFS, Unit, T_DATA, L_END, L_FREE, wordToTrytes,
  bootDesktop2, guestUnitInfo, guestList, guestFsck
} = require('./d20-common.js');

function runTest() {
  const { vm } = bootDesktop2();

  // (a) Planted cross-link on Unit 2
  const uCross = new Unit(2187, { removable: true });
  const refCross = TritFS.mkfs(uCross, 'CROSS');
  refCross.writeFile('/A', Int16Array.from([1, 2, 3]), T_DATA);
  refCross.writeFile('/B', Int16Array.from([4, 5, 6]), T_DATA);
  const stA = refCross.stat('/A');
  // Point /B's directory entry firstSector to /A's firstSector
  const rootSec = uCross.read(refCross.root);
  rootSec.set(wordToTrytes(stA.first), 27 + 18); // slot 1 (/B) firstSector = stA.first
  uCross.write(refCross.root, rootSec);

  vm.insertUnit(2, uCross.toTdisk(), { removable: true, writeProtected: false });
  vm.run(25000);
  const fsckCross = guestFsck(vm, 2, 0, 200000);
  if (fsckCross.problems <= 0) {
    throw new Error(`Positive control failed: guest fsck did not detect planted cross-link: ${JSON.stringify(fsckCross)}`);
  }

  // (b) Planted SLT chain loop on Unit 2
  const uLoop = new Unit(2187, { removable: true });
  const refLoop = TritFS.mkfs(uLoop, 'LOOP');
  refLoop.writeFile('/LOOPFILE', new Int16Array(1000).fill(7), T_DATA);
  const stLoop = refLoop.stat('/LOOPFILE');
  // Set SLT[stLoop.first] = stLoop.first (self-loop!)
  refLoop._setLink(stLoop.first, stLoop.first);
  refLoop._flushSlt();

  vm.insertUnit(2, uLoop.toTdisk(), { removable: true, writeProtected: false });
  vm.run(25000);
  const fsckLoop = guestFsck(vm, 2, 0, 200000);
  if (fsckLoop.problems <= 0) {
    throw new Error(`Positive control failed: guest fsck did not detect planted SLT loop: ${JSON.stringify(fsckLoop)}`);
  }

  // (c) Planted orphan on Unit 2: reported on repair=0, freed on repair=1
  const uOrph = new Unit(2187, { removable: true });
  const refOrph = TritFS.mkfs(uOrph, 'ORPHAN');
  refOrph.writeFile('/KEEP', Int16Array.from([42, 43]), T_DATA);
  const orphanSector = 500;
  refOrph._setLink(orphanSector, L_END);
  refOrph._flushSlt();

  vm.insertUnit(2, uOrph.toTdisk(), { removable: true, writeProtected: false });
  vm.run(25000);
  const fsckOrphCheck = guestFsck(vm, 2, 0, 200000);
  if (fsckOrphCheck.problems !== 0 || fsckOrphCheck.orphans !== 1 || fsckOrphCheck.repaired !== 0) {
    throw new Error(`Guest fsck(repair=0) on planted orphan unexpected: ${JSON.stringify(fsckOrphCheck)}`);
  }
  const fsckOrphFix = guestFsck(vm, 2, 1, 200000);
  if (fsckOrphFix.problems !== 0 || fsckOrphFix.orphans !== 1 || fsckOrphFix.repaired !== 1) {
    throw new Error(`Guest fsck(repair=1) on planted orphan unexpected: ${JSON.stringify(fsckOrphFix)}`);
  }
  const refOrphAfter = new TritFS(Unit.fromTdisk(vm.exportUnitTdisk(2)));
  if (refOrphAfter.link(orphanSector) !== L_FREE || refOrphAfter.fsck(false).orphans.length !== 0) {
    throw new Error('Planted orphan was not freed on disk by guest fsck(repair=1)');
  }

  // (d) Corrupted superblock magic on Unit 2 -> refused / not mounted
  const uBadSb = new Unit(2187, { removable: true });
  TritFS.mkfs(uBadSb, 'BADSB');
  const sb0 = uBadSb.read(0);
  sb0[0] = 88; // 'X' instead of 'T'
  uBadSb.write(0, sb0);

  vm.insertUnit(2, uBadSb.toTdisk(), { removable: true, writeProtected: false });
  vm.run(25000);
  const infoBad = guestUnitInfo(vm, 2);
  const listBad = guestList(vm, '2:/', 16, 20000);
  if (infoBad.mounted !== 0 || listBad.count >= 0) {
    throw new Error(`Corrupted superblock magic was mounted: info=${JSON.stringify(infoBad)}, list=${JSON.stringify(listBad)}`);
  }

  return {
    name: 'd20-04-positive-controls',
    status: 'PASS',
    crossLinkCaught: fsckCross.problems > 0,
    loopCaught: fsckLoop.problems > 0,
    orphanDetectedAndRepaired: fsckOrphFix.repaired === 1,
    corruptedSuperblockRefused: infoBad.mounted === 0 && listBad.count < 0
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
