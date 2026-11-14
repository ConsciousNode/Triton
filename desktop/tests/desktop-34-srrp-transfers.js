'use strict';
/**
 * Spec Test 3: SRRP Transfers against the reference peer over a seeded fault-injecting link
 * (drop, duplicate, reorder):
 * - 1 K (1,024), 8 K (8,192) and 16 K (16,384) trytes both ways (`trytes16`);
 * - tryte-identical results.
 * Positive controls:
 * - 100% loss gives `TIMEOUT`;
 * - an oversize body gives 413 at the first frame;
 * - `../x` gives 403.
 */
const path = require('path');
const { loadHtmlModule, makeRng, readDiskFileTrytes, readFbString, makeMouseTracker } = require('./t3-common.js');
const SRef = require(path.resolve(__dirname, '../../../studionet/studionet-ref.js'));

function makeTestTrytes(count, seed) {
  const rng = makeRng(seed);
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = rng.int(-364, 364);
  return out;
}

// Transfer from Reference Peer (StudioNetRef.Sender) -> TritOS Guest (knrd_srrp_port80) over a fault-injecting link
function runRefToGuestTransfer(vm, T, fileName, trytes, seed, startSeq) {
  const rng = makeRng(seed);
  const body = SRef.trytes16Encode(trytes);
  const msg = SRef.encodeMessage({
    request: true,
    method: 'PUT',
    path: `/inbox/${fileName}`,
    headers: { Encoding: 'trytes16' },
    body
  });

  const sender = new SRef.Sender({ src: 0x00FD, dst: 3, sport: 49200, dport: 80, startSeq, message: msg, rto: 500 });
  const fastQueue = [];
  let now = 0;

  vm.txHooks.length = 0;
  vm.txHooks.push(raw => {
    const f = SRef.decodeFrame(raw);
    if (!f.ok) return;
    if (f.flags === SRef.FLAG.ACK && f.payload.length >= 3) {
      const fastResends = sender.onAck(f, now);
      for (const fr of fastResends) fastQueue.push(fr);
    }
  });

  let stats = { dropped: 0, duplicated: 0, reordered: 0, rounds: 0 };
  while (sender.state === 'sending' && stats.rounds < 250) {
    stats.rounds++;
    const batch = fastQueue.splice(0).concat(sender.poll(now));
    if (batch.length === 0) {
      now += 600; // advance virtual clock past RTO to trigger selective resend of any dropped frame
      continue;
    }
    now += 50;
    const wire = [];
    for (let i = 0; i < batch.length; i++) {
      const r = rng.u32() % 100;
      if (r < 6 && stats.dropped < 8) {
        stats.dropped++;
        continue;
      }
      if (r >= 6 && r < 12) {
        stats.duplicated++;
        wire.push(batch[i]);
      }
      wire.push(batch[i]);
    }
    if (wire.length >= 2 && (rng.u32() % 100) < 20) {
      const t = wire[0]; wire[0] = wire[1]; wire[1] = t;
      stats.reordered++;
    }
    for (const rawFrame of wire) {
      vm.receiveNetFrame(rawFrame);
      vm.run(40000);
    }
  }
  vm.run(350000);

  const diskTrytes = readDiskFileTrytes(vm, T, fileName.toUpperCase());
  if (!diskTrytes || diskTrytes.length !== trytes.length) {
    throw new Error(`Ref->Guest ${fileName} length mismatch: expected ${trytes.length}, got ${diskTrytes ? diskTrytes.length : null} (sender.state=${sender.state})`);
  }
  let diffs = 0;
  for (let i = 0; i < trytes.length; i++) {
    if (diskTrytes[i] !== trytes[i]) diffs++;
  }
  if (diffs !== 0) {
    throw new Error(`Ref->Guest ${fileName} had ${diffs} tryte differences`);
  }
  return { trytes: trytes.length, diffs, stats };
}

// Transfer from TritOS Guest (drv_net_srrp_impl windowed SACK sender) -> Reference Peer (StudioNetRef.Receiver) over a fault-injecting link
function runGuestToRefTransfer(vm, T, trytes, seed, dropAll = false) {
  const rng = makeRng(seed);
  const receiver = new SRef.Receiver({ me: 0x00FD, maxSize: 65536, window: 8 });
  let stats = { txFrames: 0, dropped: 0, duplicated: 0, reordered: 0, acksSent: 0 };
  let heldFrame = null;

  vm.txHooks.length = 0;
  vm.txHooks.push(raw => {
    const f = SRef.decodeFrame(raw);
    if (!f.ok || f.proto !== 3 || f.dport !== 80) return;
    stats.txFrames++;
    if (dropAll) {
      stats.dropped++;
      return;
    }
    const r = rng.u32() % 100;
    if (r < 6 && stats.dropped < 2 && !(f.flags & SRef.FLAG.SYN)) {
      stats.dropped++;
      return; // drop frame -> forces guest SACK selective resend!
    }
    const toDeliver = [];
    if (r >= 6 && r < 14 && heldFrame === null && stats.reordered < 2 && stats.txFrames <= 2 && !(f.flags & SRef.FLAG.SYN) && !(f.flags & SRef.FLAG.FIN)) {
      heldFrame = f; // hold for 1 step to reorder!
      stats.reordered++;
      return;
    }
    toDeliver.push(f);
    if (heldFrame) {
      toDeliver.push(heldFrame);
      heldFrame = null;
    }
    if (r >= 14 && r < 20) {
      toDeliver.push(f); // duplicate!
      stats.duplicated++;
    }
    for (const df of toDeliver) {
      const acks = receiver.onData(df);
      for (const a of acks) {
        stats.acksSent++;
        vm.receiveNetFrame(a);
      }
    }
  });

  // Stage trytes at disk sector 300 via exportDiskImage/importDiskImage
  const u8 = T.exportDiskImage(vm);
  const disk = new Int16Array(u8.buffer, u8.byteOffset, u8.byteLength / 2);
  for (let i = 0; i < trytes.length; i++) {
    disk[300 * 729 + i] = trytes[i];
  }
  T.importDiskImage(vm, u8);

  const keyForSize = trytes.length === 1024 ? 144 : (trytes.length === 8192 ? 145 : 146);
  vm.pushKeyEvent(keyForSize, 0);
  vm.run(dropAll ? 1500000 : 4500000);

  if (dropAll) {
    const statusStr = readFbString(vm, T, 277, 148, 7, -320, true).trim();
    return { statusStr, stats };
  }

  if (receiver.state !== 'done' || !receiver.message) {
    throw new Error(`Guest->Ref (${trytes.length} trytes) did not finish: state=${receiver.state} stats=${JSON.stringify(stats)}`);
  }
  const decMsg = SRef.decodeMessage(receiver.message);
  if (!decMsg.ok) throw new Error('Guest->Ref message failed decodeMessage: ' + JSON.stringify(decMsg));
  const rxTrytes = Array.from(SRef.trytes16Decode(decMsg.body));
  if (rxTrytes.length !== trytes.length) {
    throw new Error(`Guest->Ref length mismatch: expected ${trytes.length}, got ${rxTrytes.length}`);
  }
  let diffs = 0;
  for (let i = 0; i < trytes.length; i++) {
    if (rxTrytes[i] !== trytes[i]) diffs++;
  }
  if (diffs !== 0) {
    throw new Error(`Guest->Ref (${trytes.length} trytes) had ${diffs} tryte differences`);
  }
  return { trytes: trytes.length, diffs, stats };
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const vm = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);
  const mouse = makeMouseTracker(vm);
  mouse.click(690, 472, 350000); // Open App 10 (NET)

  const t1k = makeTestTrytes(1024, 0x1024);
  const t8k = makeTestTrytes(8192, 0x8192);
  const t16k = makeTestTrytes(16384, 0x16384);

  // 1. Reference Peer -> Guest transfers (1 K, 8 K, 16 K trytes) over fault-injecting link
  const rx1k = runRefToGuestTransfer(vm, T, 'rx1k', t1k, 101, 1000);
  const rx8k = runRefToGuestTransfer(vm, T, 'rx8k', t8k, 202, 2000);
  const rx16k = runRefToGuestTransfer(vm, T, 'rx16k', t16k, 303, 3000);

  // 2. Guest -> Reference Peer transfers (1 K, 8 K, 16 K trytes) over fault-injecting link
  const tx1k = runGuestToRefTransfer(vm, T, t1k, 404, false);
  const tx8k = runGuestToRefTransfer(vm, T, t8k, 505, false);
  const tx16k = runGuestToRefTransfer(vm, T, t16k, 606, false);

  // 3. Positive controls:
  // (a) 100% loss gives TIMEOUT
  const timeoutCtrl = runGuestToRefTransfer(vm, T, t1k, 707, true);
  if (timeoutCtrl.statusStr !== 'TIMEOUT') {
    throw new Error('100% loss positive control did not set TIMEOUT, got: ' + JSON.stringify(timeoutCtrl));
  }

  // (b) Oversize body (Size: 40000 > 32768) gives 413 at the first frame
  const replies413 = [];
  vm.txHooks.length = 0;
  vm.txHooks.push(raw => replies413.push(SRef.decodeFrame(raw)));
  const overHead = Uint8Array.from(Array.from('PUT /inbox/huge SRRP/1\nEncoding: trytes16\nSize: 40000\n\nAAAA', c => c.charCodeAt(0)));
  vm.receiveNetFrame(SRef.encodeFrame({
    dst: 3, src: 0x00FD, proto: 3, flags: SRef.FLAG.SYN | SRef.FLAG.PSH, sport: 49300, dport: 80, seq: 8000, ack: 0, payload: overHead
  }));
  vm.run(200000);
  const msg413 = replies413.find(f => f.ok && (f.flags & SRef.FLAG.PSH));
  const dec413 = msg413 ? SRef.decodeMessage(msg413.payload) : null;
  if (!dec413 || !dec413.ok || dec413.status !== 413) {
    throw new Error('Oversize PUT did not return 413 at first frame: ' + JSON.stringify(dec413));
  }

  // (c) "../x" gives 403
  const replies403 = [];
  vm.txHooks.length = 0;
  vm.txHooks.push(raw => replies403.push(SRef.decodeFrame(raw)));
  const badPath = Uint8Array.from(Array.from('PUT /inbox/../x SRRP/1\nEncoding: trytes16\nSize: 2\n\nAA', c => c.charCodeAt(0)));
  vm.receiveNetFrame(SRef.encodeFrame({
    dst: 3, src: 0x00FD, proto: 3, flags: 13, sport: 49301, dport: 80, seq: 8010, ack: 0, payload: badPath
  }));
  vm.run(200000);
  const msg403 = replies403.find(f => f.ok && (f.flags & SRef.FLAG.PSH));
  const dec403 = msg403 ? SRef.decodeMessage(msg403.payload) : null;
  if (!dec403 || !dec403.ok || dec403.status !== 403) {
    throw new Error('../x PUT did not return 403: ' + JSON.stringify(dec403));
  }

  return {
    name: '34-srrp-transfers',
    status: 'PASS',
    refToGuest: { '1K': rx1k, '8K': rx8k, '16K': rx16k },
    guestToRef: { '1K': tx1k, '8K': tx8k, '16K': tx16k },
    positiveControls: {
      loss100Timeout: timeoutCtrl.statusStr,
      oversizeFirstFrameStatus: dec413.status,
      dotDotSlashStatus: dec403.status
    }
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
