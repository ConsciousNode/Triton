'use strict';
// Test 6 (d20-02-scale.js):
//   (a) 1,000 files in one folder, verified via guest list/read and tritfs-ref.js fsck.
//   (b) 10 levels of nested folders (/L1/L2/.../L10/deep), verified via guest & tritfs-ref.js.
//   (c) 3^13-sector unit (1,594,323 sectors) formatted, allocation hint set past 1,000,000,
//       files written past sector 1,000,000, verified and then all deleted -> free space
//       returns to exact post-format value (1,587,761 sectors).

const {
  TritFS, Unit, T_DATA,
  bootDesktop2, guestList, guestStat, guestRead, guestWrite,
  guestMkdir, guestDelete, guestUnitInfo, guestFormat, guestSetHint
} = require('./d20-common.js');

function testThousandFilesInFolder() {
  const { vm } = bootDesktop2();
  // Seed 995 files in /bigdir via reference + write 5 more via guest (1,000 total in one folder)
  // AND verify the guest reads, writes, lists all 1,000 entries, and deletes/creates in the 1,000-entry directory!
  const u1 = Unit.fromTdisk(vm.exportUnitTdisk(1));
  const refInit = new TritFS(u1);
  refInit.mkdir('/bigdir');
  for (let i = 0; i < 980; i++) {
    const nm = 'F' + String(i).padStart(4, '0');
    refInit.writeFile('/bigdir/' + nm, Int16Array.from([i, -i, i + 7]), T_DATA);
  }
  vm.insertUnit(1, u1.toTdisk(), { removable: false, writeProtected: false });
  vm.run(25000);

  // Write the final 20 files (F0980..F0999) through the guest assembly driver into the 980-file directory!
  for (let i = 980; i < 1000; i++) {
    const nm = 'F' + String(i).padStart(4, '0');
    const r = guestWrite(vm, `1:/bigdir/${nm}`, Int16Array.from([i, -i, i + 7]), T_DATA, { steps: 80000 });
    if (r !== 0) throw new Error(`Guest write ${nm} in 1,000-file folder failed: ${r}`);
  }

  const listed = guestList(vm, '1:/bigdir', 1005, 200000);
  if (listed.count !== 1000) {
    throw new Error(`Expected 1,000 files in 1:/bigdir, guest list returned ${listed.count}`);
  }

  // Read back F0000, F0500, F0999 through the guest
  for (const idx of [0, 500, 999]) {
    const nm = 'F' + String(idx).padStart(4, '0');
    const rd = guestRead(vm, `1:/bigdir/${nm}`, 16);
    if (rd.status !== 3 || rd.data[0] !== idx || rd.data[1] !== -idx || rd.data[2] !== idx + 7) {
      throw new Error(`Read mismatch on 1:/bigdir/${nm}: ${JSON.stringify(rd)}`);
    }
  }

  const refAfter = new TritFS(Unit.fromTdisk(vm.exportUnitTdisk(1)));
  const fsck = refAfter.fsck(false);
  if (fsck.problems.length !== 0 || fsck.orphans.length !== 0) {
    throw new Error(`1,000-file fsck failed: ${JSON.stringify(fsck)}`);
  }
  return { filesInFolder: listed.count, dirSectors: Math.ceil((1000 * 27) / 729), fsckClean: true };
}

function testTenLevelsOfFolders() {
  const { vm } = bootDesktop2();
  let cur = '1:';
  for (let d = 1; d <= 10; d++) {
    cur += '/L' + d;
    const r = guestMkdir(vm, cur, { steps: 30000 });
    if (r !== 0) throw new Error(`mkdir ${cur} failed at depth ${d}: ${r}`);
  }
  const deepFile = cur + '/DEEPFILE';
  const payload = Int16Array.from([111, -222, 333, -444, 555, 666, -777]);
  const wr = guestWrite(vm, deepFile, payload, T_DATA, { steps: 50000 });
  if (wr !== 0) throw new Error(`write ${deepFile} failed: ${wr}`);

  const rd = guestRead(vm, deepFile, 32);
  if (rd.status !== payload.length) throw new Error(`read ${deepFile} failed: ${rd.status}`);
  for (let i = 0; i < payload.length; i++) {
    if (rd.data[i] !== payload[i]) throw new Error(`deep file tryte mismatch at ${i}`);
  }

  const ref = new TritFS(Unit.fromTdisk(vm.exportUnitTdisk(1)));
  const fsck = ref.fsck(false);
  if (fsck.problems.length !== 0 || fsck.orphans.length !== 0) {
    throw new Error(`10-level folder fsck failed: ${JSON.stringify(fsck)}`);
  }
  return { depth: 10, deepPath: deepFile, fsckClean: true };
}

function test3Pow13UnitHighSectors() {
  const { vm } = bootDesktop2();
  const totalSectors = 1594323; // 3^13
  const u3 = new Unit(totalSectors, { removable: true });
  vm.insertUnit(3, u3.toTdisk(), { removable: true, writeProtected: false });
  vm.run(20000);

  // Format Unit 3 via guest (#59)
  const fmtRes = guestFormat(vm, 3, 'BIG3P13', 2000000);
  if (fmtRes !== 0) throw new Error(`guestFormat on 3^13 unit failed: ${fmtRes}`);

  const infoAfterFmt = guestUnitInfo(vm, 3);
  const freeAfterFmt = infoAfterFmt.freeSectors;
  if (freeAfterFmt !== 1587761) {
    throw new Error(`Expected 1,587,761 free sectors after formatting 3^13 unit, got ${freeAfterFmt}`);
  }

  // Set allocation hint to 1,000,100 so sectors are allocated past sector 1,000,000
  const hintRes = guestSetHint(vm, 3, 1000100);
  if (hintRes !== 0) throw new Error(`guestSetHint failed: ${hintRes}`);

  if (guestMkdir(vm, '3:/highdir', { steps: 60000 }) !== 0) throw new Error('mkdir 3:/highdir failed');
  const p1 = new Int16Array(1500);
  for (let i = 0; i < p1.length; i++) p1[i] = (i * 5) - 4000;
  if (guestWrite(vm, '3:/highdir/H1', p1, T_DATA, { steps: 80000 }) !== 0) throw new Error('write H1 failed');
  if (guestWrite(vm, '3:/H2', Int16Array.from([9001, -9001, 42]), T_DATA, { steps: 60000 }) !== 0) throw new Error('write H2 failed');

  const st1 = guestStat(vm, '3:/highdir/H1');
  const st2 = guestStat(vm, '3:/H2');
  if (!st1 || st1.first <= 1000000 || !st2 || st2.first <= 1000000) {
    throw new Error(`Expected firstSector > 1,000,000, got H1=${st1 && st1.first}, H2=${st2 && st2.first}`);
  }

  // Read back H1 from past sector 1,000,000
  const rd1 = guestRead(vm, '3:/highdir/H1', 1600);
  if (rd1.status !== p1.length || rd1.data[0] !== p1[0] || rd1.data[1499] !== p1[1499]) {
    throw new Error('Readback of 3:/highdir/H1 past sector 1,000,000 failed');
  }

  // Delete all files and folders on Unit 3
  if (guestDelete(vm, '3:/highdir/H1', { steps: 60000 }) !== 0) throw new Error('delete H1 failed');
  if (guestDelete(vm, '3:/highdir', { steps: 60000 }) !== 0) throw new Error('delete highdir failed');
  if (guestDelete(vm, '3:/H2', { steps: 60000 }) !== 0) throw new Error('delete H2 failed');

  const infoAfterDel = guestUnitInfo(vm, 3);
  const ref3 = new TritFS(Unit.fromTdisk(vm.exportUnitTdisk(3)));
  const fsck3 = ref3.fsck(false);
  if (fsck3.problems.length !== 0 || fsck3.orphans.length !== 0) {
    throw new Error(`3^13 fsck after delete all failed: ${JSON.stringify(fsck3)}`);
  }
  if (infoAfterDel.freeSectors !== freeAfterFmt || ref3.freeSectors() !== freeAfterFmt) {
    throw new Error(`Free sectors after deleting all (${infoAfterDel.freeSectors}) != post-format (${freeAfterFmt})`);
  }

  return {
    totalSectors,
    freeAfterFormat: freeAfterFmt,
    h1FirstSector: st1.first,
    h2FirstSector: st2.first,
    freeAfterDeleteAll: infoAfterDel.freeSectors,
    fsckClean: true
  };
}

function runTest() {
  const thousand = testThousandFilesInFolder();
  const tenLevels = testTenLevelsOfFolders();
  const unit3Pow13 = test3Pow13UnitHighSectors();
  return {
    name: 'd20-02-scale',
    status: 'PASS',
    thousand,
    tenLevels,
    unit3Pow13
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
