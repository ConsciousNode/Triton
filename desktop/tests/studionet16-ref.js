'use strict';
/**
 * Reference parser & builder for the 16-byte StudioNet wire format
 * (spiralos/STUDIONET.md section 2 & spiralos/os/net.sp).
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
  const { loadEmulators } = require(spiralHarnessPath);
  loadEmulators();
  const img = fs.readFileSync(spiralImgPath);

  globalThis.__STUDIONET_SWITCH.nics.clear();
  globalThis.__STUDIONET_SWITCH.packetLog = [];

  // Boot unmodified TabComp (0x0101) and Hummingbird (0x0201) from spiralos.img
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
    for (let i = 0; i < frames * 4; i++) {
      hbPc.cpu.runSteps(200000);
    }
  }
  function clickTC(x, y) {
    tcCpu.setMouseState(x, y, 1);
    stepBoth(2);
    tcCpu.setMouseState(x, y, 0);
    stepBoth(2);
  }
  function openLauncherTC(itemNum) {
    clickTC(24, 6);
    clickTC(40, 16 + (itemNum - 1) * 10 + 4);
  }

  stepBoth(8);

  // 1. Capture real Chat frame from unmodified SpiralOS (TabComp SpiralChat -> Hummingbird)
  openLauncherTC(12);
  for (const ch of 'HI PEER') {
    const c = ch.charCodeAt(0);
    tcCpu.pushKeyEvent(1, c, c, 0);
    tcCpu.pushKeyEvent(0, c, c, 0);
  }
  stepBoth(6);
  clickTC(210, 124); // [Send]
  stepBoth(4);

  // 2. Capture real Shell `ping` frame from unmodified SpiralOS (Hummingbird SpiralSh -> TabComp)
  const scMap = { p: 0x19, i: 0x17, n: 0x31, g: 0x22, '\r': 0x1C };
  for (const ch of 'ping\r') {
    const sc = scMap[ch];
    hbPc.ps2.sendKeyScancode(sc);
    stepBoth(1);
    hbPc.ps2.sendKeyScancode(sc | 0x80);
    stepBoth(1);
  }
  stepBoth(4);

  // 3. Capture real File Push frame (TabComp SpiralSend -> Hummingbird) and real ACK frame (Hummingbird -> TabComp)
  openLauncherTC(13); // SpiralSend (window at 52, 46, w=180, h=90)
  // Click [NextFile] 10 times to select /src/hello.sp (122 bytes <= 440)
  for (let i = 0; i < 10; i++) clickTC(82, 126);
  clickTC(152, 126); // [BeamToPeer]
  stepBoth(6);

  const rawPackets = globalThis.__STUDIONET_SWITCH.packetLog.map(p => new Uint8Array(p.bytes));
  if (rawPackets.length < 4) {
    throw new Error('Expected at least 4 captured frames from SpiralOS (chat, ping, file push, ACK), got ' + rawPackets.length);
  }

  const parsedFrames = [];
  for (const raw of rawPackets) {
    const p = parseStudioNet16Frame(raw);
    if (!p) throw new Error('studionet16-ref failed to parse real SpiralOS frame of length ' + raw.length);
    if (p.len !== raw.length - 16) throw new Error('Parsed len mismatch vs frame.length - 16');
    parsedFrames.push(p);
  }

  const chatFrame = parsedFrames.find(f => f.proto === PROTO_SDP && f.dport === PORT_CHAT && f.src === 0x0101);
  const pingFrame = parsedFrames.find(f => f.proto === PROTO_SDP && f.dport === PORT_CHAT && f.src === 0x0201);
  const fileFrame = parsedFrames.find(f => f.proto === PROTO_SSP && f.dport === PORT_FTX && (f.flags & FLAG_PSH) !== 0);
  const ackFrame  = parsedFrames.find(f => f.proto === PROTO_SSP && (f.flags & FLAG_ACK) !== 0 && (f.flags & FLAG_PSH) === 0);

  if (!chatFrame || !pingFrame || !fileFrame || !ackFrame) {
    throw new Error('Missing one of {chat, ping, filePush, ack} in captured SpiralOS frames: ' + JSON.stringify(parsedFrames));
  }

  // Positive control: mutating the `len` field (bytes 14..15) of any valid frame must be rejected
  const mutated = new Uint8Array(rawPackets[0]);
  mutated[14] = (mutated[14] + 1) & 0xFF;
  const rejected = parseStudioNet16Frame(mutated);
  if (rejected !== null) {
    throw new Error('Positive control failed: frame with mutated len field was not rejected');
  }

  return {
    name: 'studionet16-ref',
    status: 'PASS',
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
  PROTO_SNS,
  PROTO_SDP,
  PROTO_SSP,
  FLAG_SYN,
  FLAG_ACK,
  FLAG_PSH,
  FLAG_FIN,
  PORT_PING,
  PORT_HTTP,
  PORT_CHAT,
  PORT_FTX,
  PORT_FTX_CONT,
  PORT_SNAKE,
  parseStudioNet16Frame,
  buildStudioNet16Frame,
  runTest
};
