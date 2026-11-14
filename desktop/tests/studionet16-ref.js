'use strict';
/**
 * Reference parser & builder for the 16-byte StudioNet wire format
 * (spiralos/STUDIONET.md section 2 & studionet/STUDIONET-1.0.md).
 * Does NOT use the Triton 3.1 machine block's 12-byte helpers.
 */
const fs = require('fs');
const path = require('path');

const PROTO_SNS = 1;
const PROTO_SDP = 2;
const PROTO_SSP = 3;

const FLAG_SYN = 0x01;
const FLAG_ACK = 0x02;
const FLAG_PSH = 0x04;
const FLAG_FIN = 0x08;

const PORT_PING = 7;
const PORT_HTTP = 80;
const PORT_CHAT = 4200;
const PORT_FTX  = 4300;
const PORT_FTX_CONT = 4301;
const PORT_SNAKE = 4400;

function parseStudioNet16Frame(bytes) {
  if (!bytes || typeof bytes.length !== 'number') return null;
  const u8 = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  if (u8.length < 16 || u8.length > 496) return null;
  const dst   = u8[0] | (u8[1] << 8);
  const src   = u8[2] | (u8[3] << 8);
  const proto = u8[4];
  const flags = u8[5];
  const sport = u8[6] | (u8[7] << 8);
  const dport = u8[8] | (u8[9] << 8);
  const seq   = u8[10] | (u8[11] << 8);
  const ack   = u8[12] | (u8[13] << 8);
  const len   = u8[14] | (u8[15] << 8);
  if (len > 480) return null;
  if (u8.length !== 16 + len) return null;
  const payload = u8.slice(16, 16 + len);
  return { dst, src, proto, flags, sport, dport, seq, ack, len, payload };
}

function buildStudioNet16Frame({ dst, src, proto, flags, sport, dport, seq = 100, ack = 0, payload = new Uint8Array(0) }) {
  const pay = payload instanceof Uint8Array ? payload : Uint8Array.from(payload);
  if (pay.length > 480) throw new Error('Payload exceeds 480 bytes');
  const out = new Uint8Array(16 + pay.length);
  out[0] = dst & 0xFF;   out[1] = (dst >>> 8) & 0xFF;
  out[2] = src & 0xFF;   out[3] = (src >>> 8) & 0xFF;
  out[4] = proto & 0xFF;
  out[5] = flags & 0xFF;
  out[6] = sport & 0xFF; out[7] = (sport >>> 8) & 0xFF;
  out[8] = dport & 0xFF; out[9] = (dport >>> 8) & 0xFF;
  out[10] = seq & 0xFF;  out[11] = (seq >>> 8) & 0xFF;
  out[12] = ack & 0xFF;  out[13] = (ack >>> 8) & 0xFF;
  out[14] = pay.length & 0xFF; out[15] = (pay.length >>> 8) & 0xFF;
  out.set(pay, 16);
  return out;
}

function runTest() {
  const spiralHarnessPath = path.resolve(__dirname, '..', '..', '..', 'spiralos', 'tests', 'harness.js');
  const spiralImgPath = path.resolve(__dirname, '..', '..', '..', 'spiralos', 'spiralos.img');

  let rawPackets = [];
  let peerMode = 'spiralos-1.4-image';

  if (fs.existsSync(spiralHarnessPath) && fs.existsSync(spiralImgPath)) {
    const { loadEmulators } = require(spiralHarnessPath);
    loadEmulators();
    const img = fs.readFileSync(spiralImgPath);
    globalThis.__STUDIONET_SWITCH.nics.clear();
    globalThis.__STUDIONET_SWITCH.packetLog = [];

    const tcCpu = new globalThis.TabCompCPU(new globalThis.TabCompFS());
    globalThis.initHardwareMemory(tcCpu);
    globalThis.bootSpiralDiskImage(tcCpu, new Uint8Array(img));
    const hbPc = new globalThis.HummingbirdPC({ ramSizeMB: 16 });
    hbPc.loadFloppyImage(new Uint8Array(img));

    function stepBoth(frames = 2) {
      const tcTarget = tcCpu.presentCount + frames;
      while (tcCpu.presentCount < tcTarget && !tcCpu.halted) {
        tcCpu.yielded = false;
        tcCpu.stepBatch(50000);
      }
      for (let i = 0; i < frames * 4; i++) hbPc.cpu.runSteps(200000);
    }
    function clickTC(x, y) {
      tcCpu.setMouseState(x, y, 1); stepBoth(2);
      tcCpu.setMouseState(x, y, 0); stepBoth(2);
    }
    function openLauncherTC(itemNum) {
      clickTC(24, 6);
      clickTC(40, 16 + (itemNum - 1) * 10 + 4);
    }
    stepBoth(8);
    openLauncherTC(12);
    for (const ch of 'HI PEER') {
      const c = ch.charCodeAt(0);
      tcCpu.pushKeyEvent(1, c, c, 0);
      tcCpu.pushKeyEvent(0, c, c, 0);
    }
    stepBoth(6);
    clickTC(210, 124);
    stepBoth(4);
    const scMap = { p: 0x19, i: 0x17, n: 0x31, g: 0x22, '\r': 0x1C };
    for (const ch of 'ping\r') {
      const sc = scMap[ch];
      hbPc.ps2.sendKeyScancode(sc); stepBoth(1);
      hbPc.ps2.sendKeyScancode(sc | 0x80); stepBoth(1);
    }
    stepBoth(4);
    openLauncherTC(13);
    for (let i = 0; i < 10; i++) clickTC(82, 126);
    clickTC(152, 126);
    stepBoth(6);
    rawPackets = globalThis.__STUDIONET_SWITCH.packetLog.map(p => new Uint8Array(p.bytes));
  } else {
    // Use studionet-ref.js (reference peer standing in for SpiralOS when no SpiralOS image is attached)
    peerMode = 'studionet-ref.js (reference peer standing in for SpiralOS; no SpiralOS image attached)';
    const SRef = require(path.resolve(__dirname, '..', '..', '..', 'studionet', 'studionet-ref.js'));
    const enc = s => Uint8Array.from(Array.from(s, c => c.charCodeAt(0)));
    const fileBlk = new Uint8Array(154);
    fileBlk.set(enc('/src/hello.sp\0'), 0);
    fileBlk.set(enc('// hello.sp'), 32);
    rawPackets = [
      SRef.encodeFrame({ src: 0x0101, dst: 0x0201, proto: PROTO_SDP, flags: FLAG_PSH, sport: PORT_CHAT, dport: PORT_CHAT, seq: 100, ack: 0, payload: enc('HI PEER\0') }),
      SRef.encodeFrame({ src: 0x0201, dst: 0x0101, proto: PROTO_SDP, flags: FLAG_PSH, sport: PORT_CHAT, dport: PORT_CHAT, seq: 101, ack: 0, payload: enc('PING FROM SPIRALSH\0') }),
      SRef.encodeFrame({ src: 0x0101, dst: 0x0201, proto: PROTO_SSP, flags: FLAG_SYN | FLAG_PSH, sport: PORT_FTX, dport: PORT_FTX, seq: 102, ack: 0, payload: fileBlk }),
      SRef.encodeFrame({ src: 0x0201, dst: 0x0101, proto: PROTO_SSP, flags: FLAG_ACK, sport: PORT_FTX, dport: PORT_FTX, seq: 102, ack: 102, payload: enc('OK') })
    ];
  }

  const parsedFrames = [];
  for (const raw of rawPackets) {
    const p = parseStudioNet16Frame(raw);
    if (!p) throw new Error('studionet16-ref failed to parse frame of length ' + raw.length);
    if (p.len !== raw.length - 16) throw new Error('Parsed len mismatch vs frame.length - 16');
    parsedFrames.push(p);
  }

  const chatFrame = parsedFrames.find(f => f.proto === PROTO_SDP && f.dport === PORT_CHAT && f.src === 0x0101);
  const pingFrame = parsedFrames.find(f => f.proto === PROTO_SDP && f.dport === PORT_CHAT && f.src === 0x0201);
  const fileFrame = parsedFrames.find(f => f.proto === PROTO_SSP && f.dport === PORT_FTX && (f.flags & FLAG_PSH) !== 0);
  const ackFrame  = parsedFrames.find(f => f.proto === PROTO_SSP && (f.flags & FLAG_ACK) !== 0 && (f.flags & FLAG_PSH) === 0);

  if (!chatFrame || !pingFrame || !fileFrame || !ackFrame) {
    throw new Error('Missing one of {chat, ping, filePush, ack}: ' + JSON.stringify(parsedFrames));
  }

  const mutated = new Uint8Array(rawPackets[0]);
  mutated[14] = (mutated[14] + 1) & 0xFF;
  const rejected = parseStudioNet16Frame(mutated);
  if (rejected !== null) {
    throw new Error('Positive control failed: frame with mutated len field was not rejected');
  }

  return {
    name: 'studionet16-ref',
    status: 'PASS',
    peerMode,
    capturedCount: parsedFrames.length,
    chat: { src: chatFrame.src, dst: chatFrame.dst, sport: chatFrame.sport, dport: chatFrame.dport, len: chatFrame.len },
    shellPing: { src: pingFrame.src, dst: pingFrame.dst, sport: pingFrame.sport, dport: pingFrame.dport, len: pingFrame.len },
    filePush: { src: fileFrame.src, dst: fileFrame.dst, flags: fileFrame.flags, sport: fileFrame.sport, dport: fileFrame.dport, len: fileFrame.len },
    ack: { src: ackFrame.src, dst: ackFrame.dst, flags: ackFrame.flags, seq: ackFrame.seq, ack: ackFrame.ack, len: ackFrame.len },
    mutatedLenRejected: rejected === null
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));

module.exports = {
  PROTO_SNS, PROTO_SDP, PROTO_SSP,
  FLAG_SYN, FLAG_ACK, FLAG_PSH, FLAG_FIN,
  PORT_PING, PORT_HTTP, PORT_CHAT, PORT_FTX, PORT_FTX_CONT, PORT_SNAKE,
  parseStudioNet16Frame, buildStudioNet16Frame, runTest
};
