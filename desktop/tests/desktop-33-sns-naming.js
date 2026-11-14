'use strict';
/**
 * Spec Test 2: StudioNet 1.0 SNS Naming (§3.4) in Guest Assembly
 * - three TritOS desktops booted in order -> tri1, tri2, tri3;
 * - leave and rejoin -> lowest free number (tri1, while tri2/tri3 do not shift);
 * - a dead heat -> the lower token wins (tri1), and all agree;
 * - a chosen-name clash -> name2 ("toshiba" vs "toshiba2" + "NAME TAKEN: using toshiba2");
 * - a duplicate node ID -> "NODE ID CLASH".
 */
const path = require('path');
const { loadHtmlModule, readDiskFileTrytes, readFbString, makeMouseTracker } = require('./t3-common.js');
const SRef = require(path.resolve(__dirname, '../../../studionet/studionet-ref.js'));

function trytesToStr(arr, off, maxLen = 15) {
  let s = '';
  for (let i = 0; i < maxLen; i++) {
    const ch = arr[off + i];
    if (!ch) break;
    s += String.fromCharCode(ch);
  }
  return s;
}

function getGuestNetPeers(vm, T) {
  vm.pushKeyEvent(136, 0); // F1 -> PEERS view (writes 272-tryte "NETPEERS": 8*32 peers + 16-tryte local displayName)
  vm.run(220000);
  const raw = readDiskFileTrytes(vm, T, 'NETPEERS');
  const myDisplay = trytesToStr(raw, 256, 15);
  const peers = {};
  for (let i = 0; i < 8; i++) {
    const base = i * 32;
    const node = raw[base];
    if (node > 0) {
      peers[node] = trytesToStr(raw, base + 16, 15);
    }
  }
  return { myDisplay, peers };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');

  // --------------------------------------------------------------------------
  // 1 & 2. Three TritOS desktops booted in order -> tri1, tri2, tri3;
  //        then tri1 leaves (BYE) and newcomer vm6 joins -> takes lowest free (tri1)!
  // --------------------------------------------------------------------------
  const vm3 = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  const vm4 = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 4 });
  const vm5 = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 5 });
  const vms = new Map([[3, vm3], [4, vm4], [5, vm5]]);

  function wireBus() {
    for (const [id, v] of vms.entries()) {
      v.txHooks.length = 0;
      v.txHooks.push(frame => {
        const copy = new Uint8Array(frame);
        for (const [oid, ov] of vms.entries()) {
          if (oid !== id) ov.receiveNetFrame(copy);
        }
      });
    }
  }
  wireBus();

  // Boot vm3 first and run so its age is largest (e.g. 10 s = 2,000,000 steps), then vm4 (age 5 s), then vm5 (age 1 s)
  T.bootTritOSDesktop(vm3, false);
  vm3.run(2000000);
  const m3 = makeMouseTracker(vm3);
  m3.click(690, 472, 350000); // Open App 10 on vm3
  vm3.pushKeyEvent(143, 0);   // F8 -> announce HELLO
  vm3.run(200000);

  T.bootTritOSDesktop(vm4, false);
  vm4.run(1000000);
  const m4 = makeMouseTracker(vm4);
  m4.click(690, 472, 350000);
  // Replay vm3's HELLO to vm4 and have vm4 announce
  vm3.pushKeyEvent(143, 0);
  vm3.run(200000);
  vm4.run(200000);
  vm4.pushKeyEvent(143, 0);
  vm4.run(200000);
  vm3.run(250000);
  vm4.run(200000);

  T.bootTritOSDesktop(vm5, false);
  vm5.run(300000);
  const m5 = makeMouseTracker(vm5);
  m5.click(690, 472, 350000);
  vm3.pushKeyEvent(143, 0);
  vm3.run(200000);
  vm4.pushKeyEvent(143, 0);
  vm4.run(200000);
  vm5.run(250000);
  vm5.pushKeyEvent(143, 0);
  vm5.run(200000);
  vm3.run(200000);
  vm4.run(200000);

  const st3 = getGuestNetPeers(vm3, T);
  const st4 = getGuestNetPeers(vm4, T);
  const st5 = getGuestNetPeers(vm5, T);
  const joinOrderNames = { 3: st3.myDisplay, 4: st4.myDisplay, 5: st5.myDisplay };
  if (joinOrderNames[3] !== 'tri1' || joinOrderNames[4] !== 'tri2' || joinOrderNames[5] !== 'tri3') {
    throw new Error('Three TritOS desktops in join order did not get tri1..tri3: ' + JSON.stringify(joinOrderNames));
  }

  // Now node 3 (tri1) leaves (broadcasts BYE), and newcomer node 6 joins -> takes lowest free (tri1) while 4=tri2, 5=tri3 stay unchanged!
  const byeFrame = SRef.snsFrame(3, 0xFFFF, 900, SRef.encodeBye());
  vms.delete(3);
  vm4.receiveNetFrame(byeFrame);
  vm5.receiveNetFrame(byeFrame);
  vm4.run(200000);
  vm5.run(200000);

  const vm6 = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 6 });
  T.bootTritOSDesktop(vm6, false);
  vm6.run(300000);
  const m6 = makeMouseTracker(vm6);
  m6.click(690, 472, 350000);
  vms.set(6, vm6);
  wireBus();

  vm4.pushKeyEvent(143, 0);
  vm4.run(200000);
  vm5.pushKeyEvent(143, 0);
  vm5.run(200000);
  vm6.run(250000);
  vm6.pushKeyEvent(143, 0);
  vm6.run(200000);
  vm4.run(200000);
  vm5.run(200000);

  const afterRejoin = {
    4: getGuestNetPeers(vm4, T).myDisplay,
    5: getGuestNetPeers(vm5, T).myDisplay,
    6: getGuestNetPeers(vm6, T).myDisplay
  };
  if (afterRejoin[4] !== 'tri2' || afterRejoin[5] !== 'tri3' || afterRejoin[6] !== 'tri1') {
    throw new Error('Leave and rejoin failed: ' + JSON.stringify(afterRejoin));
  }

  // --------------------------------------------------------------------------
  // 3. Dead heat (identical age, deaf at first): lower token wins tri1, other gets tri2
  // --------------------------------------------------------------------------
  // Boot two fresh TritOS nodes (node 4 with token=4 and node 3 with token=3) at the exact same virtual step count (same whole-second age = 3s)
  const vmTieA = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 4 }); // token = 4
  const vmTieB = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 }); // token = 3 (lower token!)
  T.bootTritOSDesktop(vmTieA, false);
  T.bootTritOSDesktop(vmTieB, false);
  vmTieA.run(300000);
  vmTieB.run(300000);
  makeMouseTracker(vmTieA).click(690, 472, 350000);
  makeMouseTracker(vmTieB).click(690, 472, 350000);

  // Connect them and announce simultaneously at identical age
  vmTieA.txHooks.push(f => vmTieB.receiveNetFrame(new Uint8Array(f)));
  vmTieB.txHooks.push(f => vmTieA.receiveNetFrame(new Uint8Array(f)));
  vmTieA.pushKeyEvent(143, 0);
  vmTieB.pushKeyEvent(143, 0);
  vmTieA.run(200000);
  vmTieB.run(200000);
  vmTieA.run(200000);
  vmTieB.run(200000);

  const tieRes = {
    node3_token3: getGuestNetPeers(vmTieB, T).myDisplay,
    node4_token4: getGuestNetPeers(vmTieA, T).myDisplay
  };
  if (tieRes.node3_token3 !== 'tri1' || tieRes.node4_token4 !== 'tri2') {
    throw new Error('Dead heat token tie-break failed: ' + JSON.stringify(tieRes));
  }

  // --------------------------------------------------------------------------
  // 4. Chosen-name clash ("toshiba"): senior keeps "toshiba", junior gets "toshiba2"
  // --------------------------------------------------------------------------
  for (const ch of 'toshiba') vmTieB.pushKeyEvent(ch.charCodeAt(0), 0);
  vmTieB.pushKeyEvent(140, 0); // F5 set hostname on node 3 (token 3, senior)
  vmTieB.run(250000);
  vmTieA.run(200000);

  for (const ch of 'toshiba') vmTieA.pushKeyEvent(ch.charCodeAt(0), 0);
  vmTieA.pushKeyEvent(140, 0); // F5 set hostname on node 4 (token 4, junior)
  vmTieA.run(250000);
  vmTieB.run(200000);
  vmTieA.run(200000);

  const clashRes = {
    senior: getGuestNetPeers(vmTieB, T).myDisplay,
    junior: getGuestNetPeers(vmTieA, T).myDisplay
  };
  if (clashRes.senior !== 'toshiba' || clashRes.junior !== 'toshiba2') {
    throw new Error('Chosen-name clash failed: ' + JSON.stringify(clashRes));
  }

  // --------------------------------------------------------------------------
  // 5. Duplicate Node ID -> "NODE ID CLASH"
  // --------------------------------------------------------------------------
  const dupHello = SRef.snsFrame(3, 0xFFFF, 950, SRef.encodeHello({
    kind: 3, os: 2, services: 31, age: 10, token: 999, named: false, num: 1, name: 'triton'
  }));
  vmTieB.receiveNetFrame(dupHello); // vmTieB is nodeId 3, receives frame from src=3!
  vmTieB.run(200000);
  vmTieB.run(250000);
  const statusMsg = readFbString(vmTieB, T, 277, 148, 13, -320, true).trim();
  if (statusMsg !== 'NODE ID CLASH') {
    throw new Error('Duplicate node ID did not set NODE ID CLASH, got: ' + JSON.stringify(statusMsg));
  }

  return {
    name: '33-sns-naming',
    status: 'PASS',
    joinOrderNames,
    afterLeaveAndRejoin: afterRejoin,
    deadHeatTieBreak: tieRes,
    chosenNameClash: clashRes,
    duplicateNodeIdWarning: statusMsg
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
