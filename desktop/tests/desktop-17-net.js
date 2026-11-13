'use strict';
const { loadHtmlModule, readFbString, listDiskFiles, readDiskFileTrytes, readDiskWord, makeMouseTracker } = require('./t3-common.js');
const {
  parseStudioNet16Frame,
  PROTO_SDP,
  PROTO_SSP,
  FLAG_SYN,
  FLAG_ACK,
  FLAG_PSH,
  FLAG_FIN,
  PORT_PING,
  PORT_CHAT,
  PORT_FTX,
  PORT_FTX_CONT
} = require('./studionet16-ref.js');

function runNetScenario(T, perturbNetChecksum = false) {
  const vm3 = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  const vm4 = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 4 });
  T.bootTritOSDesktop(vm3, false, perturbNetChecksum ? { perturbNetChecksum: true } : {});
  T.bootTritOSDesktop(vm4, false);
  vm3.run(300000);
  vm4.run(300000);

  // Stage a 3-sector (2,187-tryte) tryte-mode file "BIGFILE" (with negative trytes) on vm3's disk via architected disk image import
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
  let negativeTryteCount = 0;
  for (let i = 0; i < 2187; i++) {
    const val = ((i * 73 + 19) % 729) - 364;
    if (val < 0) negativeTryteCount++;
    disk3[218 * 729 + i] = val;
    expectedBig.push(val);
  }
  T.importDiskImage(vm3, u8_3);
  T.bootTritOSDesktop(vm3, true, perturbNetChecksum ? { perturbNetChecksum: true } : {});
  vm3.run(300000);

  // Also stage a byte-mode file "BYTE1" (120 trytes in 0..255, <= 440 bytes) on Node 3 by saving via Write or Terminal,
  // or use the guest-created "HELLO" (33 ASCII bytes in 0..255) on Node 3 -> send to Node 4 as a new name or delete "HELLO" on Node 4 first!
  // Let's delete "HELLO" on Node 4 via Terminal ("RM HELLO\n") before launching Net so Node 4 doesn't have "HELLO" yet!
  for (const c of 'RM HELLO\n') vm4.pushKeyEvent(c.charCodeAt(0), 0);
  vm4.run(350000);

  // Relay frames between vm3 and vm4 NICs (device-level only) and validate every frame with studionet16-ref.js
  const allFrames = [];
  vm3.txHooks.push(f => { allFrames.push({ from: 3, bytes: new Uint8Array(f) }); vm4.receiveNetFrame(f); });
  vm4.txHooks.push(f => { allFrames.push({ from: 4, bytes: new Uint8Array(f) }); vm3.receiveNetFrame(f); });

  const m3 = makeMouseTracker(vm3);
  const m4 = makeMouseTracker(vm4);
  // Launch Net (App 10) on both desktops at taskbar (690, 472)
  m3.click(690, 472, 450000);
  m4.click(690, 472, 450000);

  // 1. Ping from Node 3 to Node 4 (Ctrl+P = 16) -> SDP port 7 PSH request & ACK|PSH reply
  vm3.pushKeyEvent(16, 0);
  vm3.run(200000);
  vm4.run(150000);
  vm3.run(200000);

  // Read RTT displayed on Node 3's Net window framebuffer: client (48, 34) -> screen (319, 78), bg = -320
  const rttScreenStr = readFbString(vm3, T, 319, 78, 8, -320).trim();
  const rttScreenVal = parseInt(rttScreenStr, 10) || 0;

  // Save Net status on Node 3 right after Ping to verify pingReplies and lastRtt
  vm3.pushKeyEvent(19, 0);
  vm3.run(200000);
  const netStatAfterPing = readDiskFileTrytes(vm3, T, 'NET');
  const pingReplies = netStatAfterPing ? readDiskWord(netStatAfterPing, 12) : 0;
  const pingRttSteps = netStatAfterPing ? readDiskWord(netStatAfterPing, 15) : 0;

  // 2. Chat both ways (SDP port 4200, flags PSH, payload = msg + NUL, shown with sender node ID in hex)
  for (const c of 'HELLO NODE 4\n') vm3.pushKeyEvent(c.charCodeAt(0), 0);
  vm3.run(250000);
  vm4.run(300000);

  for (const c of 'HI NODE 3\n') vm4.pushKeyEvent(c.charCodeAt(0), 0);
  vm4.run(250000);
  vm3.run(300000);

  // Check MMIO framebuffer on both screens for "<HEX4>:<msg>" at client (38, 70) -> screen (309, 114), bg = -320
  const rxChatOn4 = readFbString(vm4, T, 309, 114, 17, -320);
  const rxChatOn3 = readFbString(vm3, T, 309, 114, 14, -320);

  // 3. Missing filename sends nothing: type "MISSING" on Node 3 and press Ctrl+F (6)
  const framesBeforeMissing = allFrames.length;
  for (const c of 'MISSING') vm3.pushKeyEvent(c.charCodeAt(0), 0);
  vm3.pushKeyEvent(6, 0);
  vm3.run(300000);
  const missingFilenameFramesSent = allFrames.length - framesBeforeMissing;
  const nfStatusOn3 = readFbString(vm3, T, 277, 148, 14, -320);

  // 4. Byte-mode file ("HELLO", 33 trytes in 0..255) in one frame (SSP port 4300, SYN|PSH|FIN = 13, mode 'B')
  const framesBeforeByteFile = allFrames.length;
  for (const c of 'HELLO') vm3.pushKeyEvent(c.charCodeAt(0), 0);
  vm3.pushKeyEvent(6, 0);
  vm3.run(400000);
  vm4.run(400000);
  vm3.run(200000);
  const byteFileFrames = allFrames.slice(framesBeforeByteFile);
  const rxHelloTrytes = readDiskFileTrytes(vm4, T, 'HELLO');
  const srcHelloTrytes = readDiskFileTrytes(vm3, T, 'HELLO');
  let byteFileDiffs = (rxHelloTrytes && srcHelloTrytes && rxHelloTrytes.length === srcHelloTrytes.length) ? 0 : -1;
  if (byteFileDiffs === 0) {
    for (let i = 0; i < srcHelloTrytes.length; i++) {
      if (rxHelloTrytes[i] !== srcHelloTrytes[i]) byteFileDiffs++;
    }
  }
  const rxByteFileScreenOn4 = readFbString(vm4, T, 325, 132, 5, -320);

  // 5. Tryte-mode file of 3 sectors ("BIGFILE", 2,187 trytes with negative trytes) in chunks:
  //    chunk 0 on port 4300 (SYN|PSH), chunks 1..8 on port 4301 (PSH), chunk 9 on port 4301 (PSH|FIN)
  const framesBeforeBigFile = allFrames.length;
  for (const c of 'BIGFILE') vm3.pushKeyEvent(c.charCodeAt(0), 0);
  vm3.pushKeyEvent(6, 0);
  vm3.run(1000000);
  vm4.run(1200000);
  vm3.run(400000);
  const bigFileFrames = allFrames.slice(framesBeforeBigFile);

  const rxBigTrytes = readDiskFileTrytes(vm4, T, 'BIGFILE');
  let fileDiffs = -1;
  if (rxBigTrytes && rxBigTrytes.length === 2187) {
    fileDiffs = 0;
    for (let i = 0; i < 2187; i++) if (rxBigTrytes[i] !== expectedBig[i]) fileDiffs++;
  }
  const rxBigFileScreenOn4 = readFbString(vm4, T, 325, 132, 7, -320);

  // Validate every frame with studionet16-ref.js
  let validFrames = 0;
  let invalidChecksumFrames = 0; // kept property name for desktop-09 compatibility (counts invalid 16-byte header/len frames)
  for (const item of allFrames) {
    const parsed = parseStudioNet16Frame(item.bytes);
    if (parsed && item.bytes.length === 16 + parsed.len) {
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
    lastRttSteps: pingRttSteps,
    rttScreenVal,
    rxChatOn4,
    rxChatOn3,
    missingFilenameFramesSent,
    nfStatusOn3,
    byteFilePushFrames: byteFileFrames.filter(f => f.from === 3).length,
    byteFileAckFrames: byteFileFrames.filter(f => f.from === 4).length,
    byteFileDiffs,
    rxByteFileScreenOn4,
    bigFilePushChunks: bigFileFrames.filter(f => f.from === 3).length,
    bigFileAckFrames: bigFileFrames.filter(f => f.from === 4).length,
    negativeTryteCount,
    receivedFileTrytes: rxBigTrytes ? rxBigTrytes.length : 0,
    fileDiffs,
    rxBigFileScreenOn4,
    byteFileFramesRaw: byteFileFrames,
    bigFileFramesRaw: bigFileFrames
  };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const res = runNetScenario(T, false);

  if (res.invalidChecksumFrames !== 0 || res.validFrames !== res.totalFrames) {
    throw new Error('studionet16-ref frame validation failed: ' + JSON.stringify(res));
  }
  if (res.pingReplies < 1 || res.lastRttSteps <= 0 || res.rttScreenVal <= 0) {
    throw new Error('Ping reply / RTT check failed: ' + JSON.stringify(res));
  }
  if (res.rxChatOn4 !== '0003:HELLO NODE 4' || res.rxChatOn3 !== '0004:HI NODE 3') {
    throw new Error(`Chat framebuffer check failed: node4='${res.rxChatOn4}' node3='${res.rxChatOn3}'`);
  }
  if (res.missingFilenameFramesSent !== 0) {
    throw new Error('Missing filename sent frames: ' + res.missingFilenameFramesSent);
  }
  if (res.byteFilePushFrames !== 1 || res.byteFileAckFrames !== 1 || res.byteFileDiffs !== 0 || res.rxByteFileScreenOn4 !== 'HELLO') {
    throw new Error('Single-frame byte-mode file push failed: ' + JSON.stringify({
      push: res.byteFilePushFrames, ack: res.byteFileAckFrames, diffs: res.byteFileDiffs, screen: res.rxByteFileScreenOn4
    }));
  }
  // Check single-frame byte-mode header details
  const bf0 = parseStudioNet16Frame(res.byteFileFramesRaw.find(f => f.from === 3).bytes);
  if (bf0.proto !== PROTO_SSP || bf0.dport !== PORT_FTX || bf0.flags !== (FLAG_SYN | FLAG_PSH | FLAG_FIN) || bf0.payload[24] !== 66) {
    throw new Error('Byte-mode file frame header/metadata mismatch: ' + JSON.stringify(bf0));
  }

  // Check multi-chunk tryte-mode file details (chunk 0 on 4300 SYN|PSH, middle on 4301 PSH, last on 4301 PSH|FIN)
  if (res.bigFilePushChunks !== 10 || res.bigFileAckFrames !== 10 || res.receivedFileTrytes !== 2187 || res.fileDiffs !== 0 || res.rxBigFileScreenOn4 !== 'BIGFILE') {
    throw new Error('3-sector chunked tryte-mode file transfer failed: ' + JSON.stringify({
      chunks: res.bigFilePushChunks, acks: res.bigFileAckFrames, len: res.receivedFileTrytes, diffs: res.fileDiffs, screen: res.rxBigFileScreenOn4
    }));
  }
  const chunks = res.bigFileFramesRaw.filter(f => f.from === 3).map(f => parseStudioNet16Frame(f.bytes));
  if (chunks[0].dport !== PORT_FTX || chunks[0].flags !== (FLAG_SYN | FLAG_PSH) || chunks[0].payload[24] !== 84) {
    throw new Error('First chunk header mismatch: ' + JSON.stringify(chunks[0]));
  }
  for (let i = 1; i < chunks.length - 1; i++) {
    if (chunks[i].dport !== PORT_FTX_CONT || chunks[i].flags !== FLAG_PSH) {
      throw new Error(`Middle chunk ${i} header mismatch: ` + JSON.stringify(chunks[i]));
    }
  }
  const lastChunk = chunks[chunks.length - 1];
  if (lastChunk.dport !== PORT_FTX_CONT || lastChunk.flags !== (FLAG_PSH | FLAG_FIN)) {
    throw new Error('Last chunk header mismatch: ' + JSON.stringify(lastChunk));
  }

  const out = { ...res };
  delete out.byteFileFramesRaw;
  delete out.bigFileFramesRaw;
  return { name: '17-studionet-two-node', status: 'PASS', ...out };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest, runNetScenario };
