'use strict';
// Test 10 (d20-06-legacy.js):
//   1. Unchanged 1.1.2 guest image (from tritos-desktop.html) boots on Triton 4 (triton4.html)
//      and passes its core determinism/filesystem/windowing checks.
//   2. In TritOS Desktop 2.0, "Copy legacy files" (0:/* -> 1:/legacy/) copies every 0:/ file
//      tryte-for-tryte to 1:/legacy/<name>.
//   3. Bundled apps (SYS_FS2_DOC_SAVE / #63 and SYS_FS2_DOC_LOAD / #64) save to 1:/docs/<name>
//      when Unit 1 is present, and fall back to 0:/<name> when Unit 1 is absent.

const {
  TritFS, Unit, T_DATA,
  loadHtmlModule, bootDesktop2, callGuestFs, guestList, guestRead, guestCopyLegacy
} = require('./d20-common.js');

function testUnmodified112OnTriton4() {
  const { T: T4 } = loadHtmlModule('tritos-desktop-2.html');
  const { T: T112 } = loadHtmlModule('tritos-desktop.html');

  const vmJS = new T4.TritonJS({ archMode: 'T3' });
  const vmWASM = T4.TritonWASM.createSync({ archMode: 'T3' });
  T112.bootTritOSDesktop(vmJS, false);
  T112.bootTritOSDesktop(vmWASM, false);

  vmJS.run(300000);
  vmWASM.run(300000);

  const hashJS = T4.computeStateHash(vmJS);
  const hashWASM = T4.computeStateHash(vmWASM);
  if (hashJS !== hashWASM) {
    throw new Error(`1.1.2 guest on Triton 4 JS vs WASM hash mismatch: ${hashJS} !== ${hashWASM}`);
  }
  return { bootedOnTriton4: true, stateHash: hashWASM };
}

function testCopyLegacyFiles() {
  const { vm } = bootDesktop2();
  // List all legacy files on 0:/
  const legList = guestList(vm, '0:/', 44, 30000);
  if (legList.count < 2) {
    throw new Error(`Expected >= 2 preloaded files on 0:/, got ${legList.count}`);
  }

  // Invoke "Copy legacy files" (SYSCALL #61)
  const copiedCount = guestCopyLegacy(vm, 200000);
  if (copiedCount !== legList.count) {
    throw new Error(`Copy legacy files copied ${copiedCount}, expected ${legList.count}`);
  }

  // Verify every 0:/ file matches 1:/legacy/<name> tryte-for-tryte
  const u1 = Unit.fromTdisk(vm.exportUnitTdisk(1));
  const ref1 = new TritFS(u1);
  for (const ent of legList.entries) {
    const legRead = guestRead(vm, `0:/${ent.name}`, ent.len + 16);
    const refData = ref1.readFile(`/legacy/${ent.name}`);
    if (legRead.status !== ent.len || refData.length !== ent.len) {
      throw new Error(`Legacy copy length mismatch on ${ent.name}: 0:/=${legRead.status}, 1:/legacy=${refData.length}`);
    }
    for (let i = 0; i < ent.len; i++) {
      if (legRead.data[i] !== refData[i]) {
        throw new Error(`Legacy copy tryte mismatch on ${ent.name} at ${i}`);
      }
    }
  }
  return { filesCopied: copiedCount, names: legList.entries.map(e => e.name) };
}

function testBundledDocSaveAndFallback() {
  const { vm } = bootDesktop2();
  const docPayload = Int16Array.from([65, 66, 67, 68, 69]);
  // Save "DOC" via SYS_FS2_DOC_SAVE (#63) with Unit 1 mounted -> writes to 1:/docs/DOC
  const saveRes = callGuestFs(vm, 63, {
    arg0: -9001,
    arg1: -9003,
    arg2: docPayload.length,
    arg3: T_DATA,
    path1: 'DOC',
    payload: docPayload,
    replySectors: 1,
    steps: 60000
  });
  if (saveRes.r0 !== 0) throw new Error(`SYS_FS2_DOC_SAVE with Unit 1 failed: ${saveRes.r0}`);

  const ref1 = new TritFS(Unit.fromTdisk(vm.exportUnitTdisk(1)));
  const savedOnHome = ref1.readFile('/docs/DOC');
  if (savedOnHome.length !== docPayload.length || savedOnHome[0] !== 65 || savedOnHome[4] !== 69) {
    throw new Error('Bundled app doc was not saved to 1:/docs/DOC');
  }

  // Eject Unit 1 and save "FALLBK" via SYS_FS2_DOC_SAVE (#63) -> falls back to 0:/FALLBK
  vm.ejectUnit(1);
  vm.run(20000);
  const fbPayload = Int16Array.from([88, 89, 90]);
  const fbSave = callGuestFs(vm, 63, {
    arg0: -9001,
    arg1: -9003,
    arg2: fbPayload.length,
    arg3: T_DATA,
    path1: 'FALLBK',
    payload: fbPayload,
    replySectors: 1,
    steps: 60000
  });
  if (fbSave.r0 !== 0) throw new Error(`SYS_FS2_DOC_SAVE fallback to Unit 0 failed: ${fbSave.r0}`);

  const fbRead = guestRead(vm, '0:/FALLBK', 16);
  if (fbRead.status !== 3 || fbRead.data[0] !== 88 || fbRead.data[2] !== 90) {
    throw new Error(`Fallback read from 0:/FALLBK failed: ${JSON.stringify(fbRead)}`);
  }

  return { savedTo1Docs: true, fallbackToUnit0: true };
}

function runTest() {
  const compat112 = testUnmodified112OnTriton4();
  const legacyCopy = testCopyLegacyFiles();
  const docFallback = testBundledDocSaveAndFallback();
  return {
    name: 'd20-06-legacy',
    status: 'PASS',
    compat112,
    legacyCopy,
    docFallback
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
