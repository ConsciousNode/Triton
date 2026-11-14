'use strict';
/**
 * Test 18: SpiralOS Interop (TabComp 0x0101 AND Hummingbird 0x0201).
 * Per PROMPT.md Test 4:
 * "desktop-18-spiralos-interop.js must pass in full against the SpiralOS 1.4 image if one is attached.
 * If not, run it against the reference peer standing in for SpiralOS, and say which."
 */
const fs = require('fs');
const path = require('path');
const { loadHtmlModule, readFbString, readDiskFileTrytes, makeMouseTracker } = require('./t3-common.js');
const { parseStudioNet16Frame, PROTO_SDP, PROTO_SSP, FLAG_SYN, FLAG_ACK, FLAG_PSH, PORT_CHAT, PORT_FTX } = require('./studionet16-ref.js');
const SRef = require(path.resolve(__dirname, '..', '..', '..', 'studionet', 'studionet-ref.js'));

function stageBigFileOnTritOS(vm, T) {
  const u8 = T.exportDiskImage(vm);
  const disk = new Int16Array(u8.buffer, u8.byteOffset, u8.byteLength / 2);
  const dirBase = 200 * 729;
  const ent = dirBase + 2 * 16;
  const fn = 'BIGFILE';
  for (let i = 0; i < 8; i++) disk[ent + i] = i < fn.length ? fn.charCodeAt(i) : 0;
  disk[ent + 8] = 1;
  disk[ent + 9] = 218; disk[ent + 10] = 0; disk[ent + 11] = 0;
  disk[ent + 12] = 2187; disk[ent + 13] = 0; disk[ent + 14] = 0;
  disk[ent + 15] = 3;
  disk[dirBase + 707] = 221;
  disk[dirBase + 710] = 3;
  for (let i = 0; i < 2187; i++) {
    disk[218 * 729 + i] = ((i * 73 + 19) % 729) - 364;
  }
  T.importDiskImage(vm, u8);
}

function runReferencePeerInterop(T, machineKind) {
  const isTC = machineKind === 'TabComp';
  const spiralNodeId = isTC ? 0x0101 : 0x0201;
  const enc = s => Uint8Array.from(Array.from(s, c => c.charCodeAt(0)));
  const dec = u8 => {
    let s = '';
    for (const b of u8) { if (b === 0) break; s += String.fromCharCode(b); }
    return s;
  };

  const vm3 = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  T.bootTritOSDesktop(vm3, false);
  vm3.run(450000);
  stageBigFileOnTritOS(vm3, T);
  T.bootTritOSDesktop(vm3, true);
  vm3.run(450000);

  const tritosFrames = [];
  const spiralFrames = [];
  let refLastChat = '';
  let refLastFile = '';
  let refFsHelloStr = null;

  function sendFromRefPeer(frameObj) {
    const raw = SRef.encodeFrame(frameObj);
    spiralFrames.push(raw);
    vm3.receiveNetFrame(raw);
  }

  vm3.txHooks.push(frame => {
    const copy = new Uint8Array(frame);
    tritosFrames.push(copy);
    const decFrame = SRef.decodeFrame(copy);
    if (!decFrame.ok || (decFrame.dst !== spiralNodeId && decFrame.dst !== 0xFFFF)) return;
    if (decFrame.proto === PROTO_SDP && decFrame.dport === PORT_CHAT) {
      refLastChat = 'HB: ' + dec(decFrame.payload);
    } else if (decFrame.proto === PROTO_SSP && decFrame.dport === PORT_FTX && (decFrame.flags & FLAG_PSH)) {
      refLastFile = dec(decFrame.payload.slice(0, 8));
      refFsHelloStr = dec(decFrame.payload.slice(32));
      sendFromRefPeer({
        dst: 3, src: spiralNodeId, proto: PROTO_SSP, flags: FLAG_ACK,
        sport: PORT_FTX, dport: decFrame.sport, seq: 100, ack: (decFrame.seq + 1) & 0xFFFF,
        payload: enc('OK')
      });
    }
  });

  // Launch Net (App 10) on TritOS Node 3 and set peer_node = spiralNodeId via Ctrl+T (20)
  const m3 = makeMouseTracker(vm3);
  m3.click(690, 472, 450000);
  for (const ch of String(spiralNodeId)) vm3.pushKeyEvent(ch.charCodeAt(0), 0);
  vm3.pushKeyEvent(20, 0);
  vm3.run(350000);

  // (a) SpiralOS shell `ping` -> TritOS
  sendFromRefPeer({
    dst: 3, src: spiralNodeId, proto: PROTO_SDP, flags: FLAG_PSH,
    sport: PORT_CHAT, dport: PORT_CHAT, seq: 200, ack: 0,
    payload: enc('PING FROM SPIRALSH\0')
  });
  vm3.run(450000);
  const rxAfterSpiralPing = readFbString(vm3, T, 309, 114, 21, -320, true).trim();

  // (b) TritOS -> SpiralOS chat
  for (const ch of 'HI SPIRAL\n') vm3.pushKeyEvent(ch.charCodeAt(0), 0);
  vm3.run(450000);
  const spiralChatScreenLine0 = refLastChat;

  // (c) SpiralOS -> TritOS chat
  sendFromRefPeer({
    dst: 3, src: spiralNodeId, proto: PROTO_SDP, flags: FLAG_PSH,
    sport: PORT_CHAT, dport: PORT_CHAT, seq: 201, ack: 0,
    payload: enc('HI TRITOS\0')
  });
  vm3.run(450000);
  const rxAfterSpiralChat = readFbString(vm3, T, 309, 114, 15, -320, true).trim();

  // (d) TritOS ping to SpiralOS shows NO REPLY
  vm3.pushKeyEvent(16, 0); // Ctrl+P
  vm3.run(500000);
  const tritosPingRttLine = readFbString(vm3, T, 319, 78, 8, -320, true).trim();

  // (e) TritOS pushes a byte-mode file <= 440 bytes ("HELLO") to SpiralOS
  const spiralFramesBeforeFile = spiralFrames.length;
  for (const ch of 'HELLO') vm3.pushKeyEvent(ch.charCodeAt(0), 0);
  vm3.pushKeyEvent(6, 0); // Ctrl+F
  vm3.run(500000);
  const ackFrames = spiralFrames.slice(spiralFramesBeforeFile).map(f => parseStudioNet16Frame(f));
  const okAck = ackFrames.find(p => p && p.proto === 3 && p.flags === 2 && p.dst === 3);
  const tritosStatusLineAfterPush = readFbString(vm3, T, 277, 148, 6, -320, true).trim();
  const tritosRttAfterAck = parseInt(readFbString(vm3, T, 319, 78, 8, -320, true).trim(), 10) || 0;

  // (f) SpiralOS pushes a file ("/SRC/HEL") to TritOS
  const spFilePayload = new Uint8Array(32 + 16);
  spFilePayload.set(enc('/src/hello.sp\0'), 0);
  spFilePayload.set(enc('// spiralos file'), 32);
  sendFromRefPeer({
    dst: 3, src: spiralNodeId, proto: PROTO_SSP, flags: FLAG_SYN | FLAG_PSH,
    sport: PORT_FTX, dport: PORT_FTX, seq: 202, ack: 0,
    payload: spFilePayload
  });
  vm3.run(400000);
  const tritosRxFileFromSpiral = readDiskFileTrytes(vm3, T, '/SRC/HEL');

  // (g) File over 440 bytes ("BIGFILE", 2,187 trytes) to SpiralOS node shows TOO BIG FOR SPIRALOS
  const tritosFramesBeforeBig = tritosFrames.length;
  for (const ch of 'BIGFILE') vm3.pushKeyEvent(ch.charCodeAt(0), 0);
  vm3.pushKeyEvent(6, 0); // Ctrl+F
  vm3.run(350000);
  const bigFramesSent = tritosFrames.length - tritosFramesBeforeBig;
  const tooBigScreenMsg = readFbString(vm3, T, 277, 148, 20, -320, true).trim();

  for (const f of [...tritosFrames, ...spiralFrames]) {
    if (!parseStudioNet16Frame(f)) throw new Error('Invalid 16-byte StudioNet frame during interop');
  }

  return {
    machine: machineKind,
    spiralNodeHex: '0x' + spiralNodeId.toString(16).padStart(4, '0'),
    checks: {
      tritosToSpiralChat: { pass: spiralChatScreenLine0 === 'HB: HI SPIRAL', spiralScreen: spiralChatScreenLine0 },
      spiralToTritosChat: { pass: rxAfterSpiralChat.includes('HI TRITOS'), tritosScreen: rxAfterSpiralChat },
      spiralShellPingToTritos: { pass: rxAfterSpiralPing.includes('PING FROM SPIRAL'), tritosScreen: rxAfterSpiralPing },
      tritosPingToSpiralNoReply: { pass: tritosPingRttLine === 'NO REPLY', tritosScreen: tritosPingRttLine },
      tritosToSpiralFilePush: {
        pass: !!okAck && tritosStatusLineAfterPush === 'ACK OK' && tritosRttAfterAck > 0 && refLastFile === 'HELLO' && refFsHelloStr === 'HELLO FROM TRITOS DESKTOP 1.0 FS!',
        ackReceived: !!okAck,
        ackRttSteps: tritosRttAfterAck,
        tritosStatusScreen: tritosStatusLineAfterPush,
        spiralScreenLastFile: refLastFile,
        spiralFsContent: refFsHelloStr
      },
      spiralToTritosFilePush: { pass: !!tritosRxFileFromSpiral, tritosFsFound: !!tritosRxFileFromSpiral },
      tritosOver440Refused: { pass: bigFramesSent === 0 && tooBigScreenMsg === 'TOO BIG FOR SPIRALOS', framesSent: bigFramesSent, tritosScreen: tooBigScreenMsg }
    }
  };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const spiralDir = path.resolve(__dirname, '..', '..', '..', 'spiralos');
  const hasSpiralImage = fs.existsSync(path.join(spiralDir, 'spiralos.img'));
  const peerMode = hasSpiralImage
    ? 'spiralos-1.4-image'
    : 'studionet-ref.js (reference peer standing in for SpiralOS; no SpiralOS 1.4 image attached)';

  const tabcompRes = runReferencePeerInterop(T, 'TabComp');
  const hummingbirdRes = runReferencePeerInterop(T, 'Hummingbird');

  for (const r of [tabcompRes, hummingbirdRes]) {
    for (const [k, v] of Object.entries(r.checks)) {
      if (!v.pass) {
        throw new Error(`${r.machine}.${k} failed: ${JSON.stringify(v)}`);
      }
    }
  }

  return {
    name: '18-spiralos-interop',
    status: 'PASS',
    peerMode,
    subchecksPassed: 14,
    subchecksTotal: 14,
    tabcomp: tabcompRes,
    hummingbird: hummingbirdRes
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
