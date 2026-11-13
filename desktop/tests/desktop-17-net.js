'use strict';
const { loadHtmlModule, readFbString, listDiskFiles, readDiskFileTrytes, readDiskWord, makeMouseTracker } = require('./t3-common.js');

function runNetScenario(T, perturbNetChecksum = false) {
  const vm3 = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  const vm4 = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 4 });
  T.bootTritOSDesktop(vm3, false, perturbNetChecksum ? { perturbNetChecksum: true } : {});
  T.bootTritOSDesktop(vm4, false);
  vm3.run(300000);
  vm4.run(300000);

  // Stage a 3-sector (2,187-tryte) file "BIGFILE" on vm3's disk via architected disk image import
  const u8_3 = T.exportDiskImage(vm3);
  const disk3 = new Int16Array(u8_3.buffer, u8_3.byteOffset, u8_3.byteLength / 2);
  const dirBase = 200 * 729;
  const ent = dirBase + 2 * 16;
  const fn = 'BIGFILE';
  for (let i = 0; i < 8; i++) disk3[ent + i] = i < fn.length ? fn.charCodeAt(i) : 0;
  disk3[ent + 8] = 1;
  disk3[ent + 9] = 218; disk3[ent + 10] = 0; disk3[ent + 11] = 0;
  disk3[ent + 12] = 2187; disk3[ent + 13] = 0; disk3[ent + 14] = 0;
  disk3[ent + 15] = 3;
  disk3[dirBase + 707] = 221;
  disk3[dirBase + 710] = 3;
  const expectedBig = [];
  for (let i = 0; i < 2187; i++) {
    const val = ((i * 73 + 19) % 729) - 364;
    disk3[218 * 729 + i] = val;
    expectedBig.push(val);
  }
  T.importDiskImage(vm3, u8_3);
  T.bootTritOSDesktop(vm3, true, perturbNetChecksum ? { perturbNetChecksum: true } : {});
  vm3.run(300000);

  // Relay frames between vm3 and vm4 NICs (device-level only) and validate every frame with JS reference parser & checksum
  const allFrames = [];
  vm3.txHooks.push(f => { allFrames.push({ from: 3, bytes: new Uint8Array(f) }); vm4.receiveNetFrame(f); });
  vm4.txHooks.push(f => { allFrames.push({ from: 4, bytes: new Uint8Array(f) }); vm3.receiveNetFrame(f); });

  const m3 = makeMouseTracker(vm3);
  const m4 = makeMouseTracker(vm4);
  // Launch Net (App 10) on both desktops at taskbar (690, 472)
  m3.click(690, 472, 350000);
  m4.click(690, 472, 350000);

  // 1. Ping from Node 3 to Node 4 (Ctrl+P = 16)
  vm3.pushKeyEvent(16, 0);
  vm3.run(150000);
  vm4.run(150000);
  vm3.run(200000);

  // 2. SpiralChat round-trip (Node 3 -> Node 4: "HELLO NODE 4", Node 4 -> Node 3: "HI NODE 3")
  for (const c of 'HELLO NODE 4\n') vm3.pushKeyEvent(c.charCodeAt(0), 0);
  vm3.run(250000);
  vm4.run(300000);

  for (const c of 'HI NODE 3\n') vm4.pushKeyEvent(c.charCodeAt(0), 0);
  vm4.run(250000);
  vm3.run(300000);

  // Check MMIO framebuffer on both screens for received SpiralChat messages:
  // Net window is at (270, 32) -> client origin at (271, 44).
  // Received chat is drawn at client (38, 70) -> screen (309, 114), bg = -320
  const rxChatOn4 = readFbString(vm4, T, 309, 114, 12, -320);
  const rxChatOn3 = readFbString(vm3, T, 309, 114, 9, -320);

  // 3. Send 3-sector file "BIGFILE" from Node 3 to Node 4 (Ctrl+F = 6)
  vm3.pushKeyEvent(6, 0);
  vm3.run(1000000);
  vm4.run(1000000);

  // Save Net status to "NET" on Node 3 (Ctrl+S = 19) to read ping_replies and last_rtt
  vm3.pushKeyEvent(19, 0);
  vm3.run(200000);
  const netStat3 = readDiskFileTrytes(vm3, T, 'NET');
  const pingReplies = netStat3 ? readDiskWord(netStat3, 12) : 0;
  const lastRtt = netStat3 ? readDiskWord(netStat3, 15) : 0;

  // Verify received 3-sector file "BIGFILE" on Node 4's disk image
  const rxBigTrytes = readDiskFileTrytes(vm4, T, 'BIGFILE');
  let fileDiffs = -1;
  if (rxBigTrytes && rxBigTrytes.length === 2187) {
    fileDiffs = 0;
    for (let i = 0; i < 2187; i++) if (rxBigTrytes[i] !== expectedBig[i]) fileDiffs++;
  }

  // Verify every transmitted frame with JS reference parser and checksum
  let validFrames = 0;
  let invalidChecksumFrames = 0;
  for (const item of allFrames) {
    const parsed = T.parseStudioNetFrame(item.bytes);
    const expectedCsum = T.computeStudioNetChecksum(item.bytes, parsed.len);
    if (parsed && parsed.checksum === expectedCsum && item.bytes.length === 12 + parsed.len) {
      validFrames++;
    } else {
      invalidChecksumFrames++;
    }
  }

  return {
    totalFrames: allFrames.length,
    validFrames,
    invalidChecksumFrames,
    pingReplies,
    lastRttSteps: lastRtt,
    rxChatOn4,
    rxChatOn3,
    receivedFileTrytes: rxBigTrytes ? rxBigTrytes.length : 0,
    fileDiffs
  };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const res = runNetScenario(T, false);
  if (res.invalidChecksumFrames !== 0 || res.validFrames < 13) {
    throw new Error('Frame checksum/parser validation failed: ' + JSON.stringify(res));
  }
  if (res.pingReplies < 1 || res.lastRttSteps <= 0) {
    throw new Error('Ping reply / RTT check failed: ' + JSON.stringify(res));
  }
  if (res.rxChatOn4 !== 'HELLO NODE 4' || res.rxChatOn3 !== 'HI NODE 3') {
    throw new Error('SpiralChat MMIO framebuffer check failed: node4=' + res.rxChatOn4 + ' node3=' + res.rxChatOn3);
  }
  if (res.receivedFileTrytes !== 2187 || res.fileDiffs !== 0) {
    throw new Error('3-sector SFP file transfer failed: len=' + res.receivedFileTrytes + ' diffs=' + res.fileDiffs);
  }
  return { name: '17-studionet-two-node', status: 'PASS', ...res };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest, runNetScenario };
