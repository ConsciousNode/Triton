'use strict';
// Test 7 (d20-03-power-cut.js):
//   For each of write, overwrite, delete, mkdir, rename:
//   Cut power after each sector write N = 1, 2, ... M with cutPowerAfterSectorWrites(N),
//   reboot with keepDisk = true, remount, and check that:
//     1. tritfs-ref.js fsck finds 0 structural problems (no broken chains, no cross-links),
//     2. the visible tree equals either the exact before-state (N < M) or after-state (N == M),
//     3. running guest fsck(repair=true) reclaims any uncommitted CoW orphan sectors.
//   Prints the exact number of cut points tested.

const {
  TritFS, Unit, T_DATA, T_DIR,
  bootDesktop2, ensureTestAgentRunning, guestWrite, guestMkdir, guestDelete, guestRename, guestFsck
} = require('./d20-common.js');

function snapshotTree(tdiskBytes) {
  const unit = Unit.fromTdisk(tdiskBytes);
  const ref = new TritFS(unit);
  const fsck = ref.fsck(false);
  const items = [];
  function walk(dirPath) {
    const list = ref.list(dirPath).slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const e of list) {
      const p = (dirPath === '/' ? '' : dirPath) + '/' + e.name;
      if (e.type === T_DIR) {
        items.push(`D:${p}`);
        walk(p);
      } else {
        const data = ref.readFile(p);
        items.push(`F:${p}:${e.type}:${Array.from(data).join(',')}`);
      }
    }
  }
  walk('/');
  return { fsck, treeSig: items.join('|') };
}

function testOperationPowerCuts(opName, setupFn, opFn) {
  const { T, vm } = bootDesktop2();
  setupFn(vm);
  const beforeTdisk = vm.exportUnitTdisk(1);
  const beforeSnap = snapshotTree(beforeTdisk);
  if (beforeSnap.fsck.problems.length !== 0 || beforeSnap.fsck.orphans.length !== 0) {
    throw new Error(`${opName}: before-state not clean`);
  }

  // First measure total sector writes M performed by opFn on Unit 1
  vm.cutPowerAfterSectorWrites(10000);
  opFn(vm);
  const totalWrites = 10000 - vm.powerCutWritesRemaining;
  vm.cutPowerAfterSectorWrites(0);
  if (totalWrites <= 0) {
    throw new Error(`${opName}: expected > 0 sector writes, got ${totalWrites}`);
  }
  const afterTdisk = vm.exportUnitTdisk(1);
  const afterSnap = snapshotTree(afterTdisk);
  if (afterSnap.fsck.problems.length !== 0 || afterSnap.fsck.orphans.length !== 0) {
    throw new Error(`${opName}: after-state not clean: ${JSON.stringify(afterSnap.fsck)}`);
  }
  if (beforeSnap.treeSig === afterSnap.treeSig) {
    throw new Error(`${opName}: before and after trees are identical`);
  }

  let beforeMatches = 0;
  let afterMatches = 0;
  let orphansReclaimed = 0;

  for (let n = 1; n <= totalWrites; n++) {
    // Restore exact before-state on Unit 1 and reboot cleanly
    vm.cutPowerAfterSectorWrites(0);
    vm.insertUnit(1, beforeTdisk, { removable: false, writeProtected: false });
    T.bootTritOSDesktop(vm, true);
    vm.run(300000);
    ensureTestAgentRunning(vm, T);

    // Arm power cut after N sector writes and execute operation with replySectors = 0
    vm.cutPowerAfterSectorWrites(n);
    opFn(vm);
    if (!vm.halted) {
      throw new Error(`${opName} cut N=${n}/${totalWrites} did not halt VM`);
    }

    // Reboot with keepDisk = true and remount
    T.bootTritOSDesktop(vm, true);
    vm.run(300000);

    const cutTdisk = vm.exportUnitTdisk(1);
    const snap = snapshotTree(cutTdisk);
    if (snap.fsck.problems.length !== 0) {
      throw new Error(`${opName} cut N=${n}/${totalWrites} produced fsck problems: ${JSON.stringify(snap.fsck.problems)}`);
    }

    if (snap.treeSig === beforeSnap.treeSig) {
      beforeMatches++;
    } else if (snap.treeSig === afterSnap.treeSig) {
      afterMatches++;
    } else {
      throw new Error(`${opName} cut N=${n}/${totalWrites} tree matches neither before nor after state: ${snap.treeSig}`);
    }

    // If there are uncommitted CoW orphan sectors, verify guest fsck(1, repair=1) reclaims them all
    if (snap.fsck.orphans.length > 0) {
      const gFsck = guestFsck(vm, 1, 1, 300000);
      if (gFsck.problems !== 0 || gFsck.repaired !== snap.fsck.orphans.length) {
        throw new Error(`${opName} cut N=${n} guest fsck repair mismatch: ${JSON.stringify(gFsck)} vs ${snap.fsck.orphans.length}`);
      }
      const postRepair = snapshotTree(vm.exportUnitTdisk(1));
      if (postRepair.fsck.orphans.length !== 0 || postRepair.fsck.problems.length !== 0) {
        throw new Error(`${opName} cut N=${n} orphans remain after guest repair`);
      }
      orphansReclaimed += gFsck.repaired;
    }
  }

  return {
    operation: opName,
    cutPointsTested: totalWrites,
    beforeStateCount: beforeMatches,
    afterStateCount: afterMatches,
    orphansReclaimed
  };
}

function runTest() {
  const results = [];

  // 1. write (2-sector file inside a subfolder)
  const writeData = new Int16Array(900);
  for (let i = 0; i < writeData.length; i++) writeData[i] = (i * 19) - 4000;
  results.push(testOperationPowerCuts(
    'write',
    vm => { guestMkdir(vm, '1:/pcdir', { steps: 20000 }); },
    vm => { guestWrite(vm, '1:/pcdir/newfile', writeData, T_DATA, { replySectors: 0, steps: 60000 }); }
  ));

  // 2. overwrite (replace 2-sector file with different 2-sector data)
  const ovOld = new Int16Array(850).fill(111);
  const ovNew = new Int16Array(950).fill(-222);
  results.push(testOperationPowerCuts(
    'overwrite',
    vm => {
      guestMkdir(vm, '1:/pcdir', { steps: 20000 });
      guestWrite(vm, '1:/pcdir/target', ovOld, T_DATA, { steps: 40000 });
    },
    vm => { guestWrite(vm, '1:/pcdir/target', ovNew, T_DATA, { replySectors: 0, steps: 60000 }); }
  ));

  // 3. delete
  results.push(testOperationPowerCuts(
    'delete',
    vm => {
      guestMkdir(vm, '1:/pcdir', { steps: 20000 });
      guestWrite(vm, '1:/pcdir/delme', ovOld, T_DATA, { steps: 40000 });
    },
    vm => { guestDelete(vm, '1:/pcdir/delme', { replySectors: 0, steps: 40000 }); }
  ));

  // 4. mkdir
  results.push(testOperationPowerCuts(
    'mkdir',
    vm => { guestMkdir(vm, '1:/pcdir', { steps: 20000 }); },
    vm => { guestMkdir(vm, '1:/pcdir/sub2', { replySectors: 0, steps: 40000 }); }
  ));

  // 5. rename
  results.push(testOperationPowerCuts(
    'rename',
    vm => {
      guestMkdir(vm, '1:/pcdir', { steps: 20000 });
      guestWrite(vm, '1:/pcdir/oldname', Int16Array.from([1, 2, 3, 4]), T_DATA, { steps: 30000 });
    },
    vm => { guestRename(vm, '1:/pcdir/oldname', 'newname', { replySectors: 0, steps: 40000 }); }
  ));

  const totalCutPointsTested = results.reduce((acc, r) => acc + r.cutPointsTested, 0);
  return {
    name: 'd20-03-power-cut',
    status: 'PASS',
    totalCutPointsTested,
    operations: results
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
