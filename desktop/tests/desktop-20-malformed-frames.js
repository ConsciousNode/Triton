'use strict';
const { loadHtmlModule, readFbString, readDiskFileTrytes, readDiskWord, makeMouseTracker, makeRng } = require('./t3-common.js');
const { buildStudioNet16Frame, PROTO_SDP, FLAG_PSH, PORT_CHAT, PORT_PING } = require('./studionet16-ref.js');

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const vm = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);

  const m = makeMouseTracker(vm);
  // Launch Net (App 10) at taskbar (690, 472)
  m.click(690, 472, 450000);

  const rng = makeRng(0x11108BAD);
  let validSent = 0;
  let badShortDriverSent = 0;   // 12..15 bytes: passes NIC hardware filter (>=12), dropped & counted by guest net v2 (<16)
  let badShortHwSent = 0;       // 1..11 bytes: dropped by pinned 3.1 NIC hardware (<12) without faulting
  let badLenSent = 0;           // >=16 bytes with header len != frame.length - 16
  let badProtoPortSent = 0;     // >=16 bytes with unknown protocol or port

  // Deliver a randomized mix of 80 frames in small batches so the 10-slot burst queue never overflows from flooding
  for (let i = 0; i < 80; i++) {
    const kind = i % 5;
    if (kind === 0) {
      const msg = new TextEncoder().encode('MSG' + i + '\0');
      const f = buildStudioNet16Frame({
        dst: 3, src: 4, proto: PROTO_SDP, flags: FLAG_PSH,
        sport: PORT_CHAT, dport: PORT_CHAT, seq: 200 + i, ack: 0, payload: msg
      });
      vm.receiveNetFrame(f);
      validSent++;
    } else if (kind === 1) {
      const len = rng.int(12, 15);
      const f = new Uint8Array(len);
      f[0] = 3; f[1] = 0;
      f[2] = 4; f[3] = 0;
      vm.receiveNetFrame(f);
      badShortDriverSent++;
    } else if (kind === 2) {
      const f = buildStudioNet16Frame({
        dst: 3, src: 4, proto: PROTO_SDP, flags: FLAG_PSH,
        sport: PORT_PING, dport: PORT_PING, seq: 300 + i, ack: 0,
        payload: new Uint8Array([80, 73, 78, 71])
      });
      f[14] = 9; // claims 9 bytes instead of 4
      vm.receiveNetFrame(f);
      badLenSent++;
    } else if (kind === 3) {
      const unknownProto = (i % 2 === 0) ? 99 : PROTO_SDP;
      const unknownPort = (i % 2 === 0) ? PORT_CHAT : 9999;
      const f = buildStudioNet16Frame({
        dst: 3, src: 4, proto: unknownProto, flags: FLAG_PSH,
        sport: unknownPort, dport: unknownPort, seq: 400 + i, ack: 0,
        payload: new Uint8Array([65, 0])
      });
      vm.receiveNetFrame(f);
      badProtoPortSent++;
    } else {
      const len = rng.int(1, 11);
      const f = new Uint8Array(len);
      f[0] = 3;
      vm.receiveNetFrame(f);
      badShortHwSent++;
    }
    vm.run(40000);
  }

  // Save Net status to "NET" via Ctrl+S (19)
  vm.pushKeyEvent(19, 0);
  vm.run(250000);
  const netStat = readDiskFileTrytes(vm, T, 'NET');
  if (!netStat) throw new Error('Failed to save NET status file after malformed frame mix');

  const rxPkts = readDiskWord(netStat, 6);
  const dropPkts = readDiskWord(netStat, 9);
  const expectedDriverDrops = badShortDriverSent + badLenSent + badProtoPortSent;

  if (rxPkts !== validSent) {
    throw new Error(`Expected ${validSent} valid frames received, got ${rxPkts}`);
  }
  if (dropPkts !== expectedDriverDrops) {
    throw new Error(`Expected ${expectedDriverDrops} driver-dropped malformed frames, got ${dropPkts}`);
  }

  // Verify no fault banner on screen and trap_cnt === 0 via Terminal KCHK -> KSTAT
  const faultBanner = readFbString(vm, T, 550, 476, 18, 240).trim();
  if (faultBanner === 'FAULT: TASK KILLED') {
    throw new Error('Kernel faulted during malformed frame test');
  }

  // Close Net or focus Terminal at (60, 50) to run KCHK and verify trap_cnt === 0, last_cause === 0
  m.click(60, 50, 150000);
  for (const c of 'KCHK\n') vm.pushKeyEvent(c.charCodeAt(0), 0);
  vm.run(350000);
  const kstat = readDiskFileTrytes(vm, T, 'KSTAT');
  const trapCount = kstat ? readDiskWord(kstat, 3) : -1;
  const lastCause = kstat ? readDiskWord(kstat, 6) : -1;
  if (trapCount !== 0 || lastCause !== 0) {
    throw new Error(`Expected trapCount=0, lastCause=0, got trapCount=${trapCount}, lastCause=${lastCause}`);
  }

  return {
    name: '20-malformed-frames',
    status: 'PASS',
    validSent,
    rxPkts,
    badShortDriverSent,
    badShortHwSent,
    badLenSent,
    badProtoPortSent,
    dropPkts,
    trapCount,
    esr: lastCause
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
