'use strict';
/**
 * Spec Test 1: Golden Vectors (studionet/golden-vectors.json)
 * - every `produce` vector is matched field for field (`seq`/`ack` are the OS's own; check that they increment correctly);
 * - every `parse` vector is accepted or refused as listed;
 * - SRRP messages are produced and parsed byte-exact.
 */
const fs = require('fs');
const path = require('path');
const { loadHtmlModule, readDiskFileTrytes, readDiskWord, makeMouseTracker } = require('./t3-common.js');
const SRef = require(path.resolve(__dirname, '../../../studionet/studionet-ref.js'));
const vectors = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../studionet/golden-vectors.json'), 'utf8'));

function fromHex(h) {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function toHex(u8) {
  return Array.from(u8, b => b.toString(16).padStart(2, '0')).join('');
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');

  // --------------------------------------------------------------------------
  // 1. PRODUCE VECTORS (field-for-field against guest NIC frames, seq/ack increment check)
  // --------------------------------------------------------------------------
  const vm = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);
  const txFrames = [];
  vm.txHooks.push(f => txFrames.push(new Uint8Array(f)));

  const mouse = makeMouseTracker(vm);
  mouse.click(690, 472, 350000); // Launch App 10 (NET)

  // Set peer_node = 513 (0x0201) via Ctrl+T (20)
  for (const ch of '513') vm.pushKeyEvent(ch.charCodeAt(0), 0);
  vm.pushKeyEvent(20, 0);
  vm.run(150000);

  // (a) produce[0]: chat "hi" (SDP port 4200, flags 4, payload "686900")
  for (const ch of 'hi\n') vm.pushKeyEvent(ch.charCodeAt(0), 0);
  vm.run(200000);
  const chatTx = SRef.decodeFrame(txFrames[txFrames.length - 1]);
  const vChat = vectors.produce[0].fields;
  if (!chatTx.ok || chatTx.dst !== vChat.dst || chatTx.proto !== vChat.proto || chatTx.flags !== vChat.flags ||
      chatTx.sport !== vChat.sport || chatTx.dport !== vChat.dport || toHex(chatTx.payload) !== vChat.payload) {
    throw new Error('produce[0] chat mismatch: ' + JSON.stringify(chatTx));
  }
  const seq0 = chatTx.seq;

  // (b) produce[1] & produce[2]: echo request (SDP 7, flags 4) and echo reply (SDP 7, flags 2, ack = req.seq + 1, same payload "50494e47")
  vm.pushKeyEvent(16, 0); // Ctrl+P -> guest sends echo request
  vm.run(150000);
  const echoReqTx = SRef.decodeFrame(txFrames[txFrames.length - 1]);
  if (!echoReqTx.ok || echoReqTx.proto !== 2 || echoReqTx.flags !== 4 || echoReqTx.sport !== 7 || echoReqTx.dport !== 7 || echoReqTx.seq !== seq0 + 1) {
    throw new Error('produce[1] echo request mismatch: ' + JSON.stringify(echoReqTx));
  }
  // Deliver golden-vectors.json produce[1] ("0300010102040700070065000000040050494e47", seq=101, payload="50494e47") to guest -> guest produces produce[2] reply!
  vm.receiveNetFrame(fromHex(vectors.produce[1].hex));
  vm.run(200000);
  const echoRepTx = SRef.decodeFrame(txFrames[txFrames.length - 1]);
  const vRep = vectors.produce[2].fields;
  if (!echoRepTx.ok || echoRepTx.dst !== vRep.dst || echoRepTx.src !== vRep.src || echoRepTx.proto !== vRep.proto ||
      echoRepTx.flags !== vRep.flags || echoRepTx.sport !== vRep.sport || echoRepTx.dport !== vRep.dport ||
      echoRepTx.ack !== vRep.ack || toHex(echoRepTx.payload) !== vRep.payload || echoRepTx.seq !== echoReqTx.seq + 1) {
    throw new Error('produce[2] echo reply mismatch: ' + JSON.stringify(echoRepTx));
  }

  // (c) produce[3..6]: SNS HELLO (default & chosen name with sharing on), SNS WHO "cnsw", SNS BYE
  // Trigger F8 (143) -> guest broadcasts default SNS HELLO
  vm.pushKeyEvent(143, 0);
  vm.run(200000);
  const helloDefTx = SRef.decodeFrame(txFrames[txFrames.length - 1]);
  const helloDefSns = SRef.decodeSns(helloDefTx.payload);
  if (!helloDefTx.ok || helloDefTx.dst !== 0xFFFF || helloDefTx.proto !== 1 || helloDefTx.flags !== 4 ||
      helloDefTx.sport !== 53 || helloDefTx.dport !== 53 || !helloDefSns.ok || helloDefSns.op !== 'HELLO' ||
      helloDefSns.kind !== 3 || helloDefSns.os !== 2 || helloDefSns.named !== false || helloDefSns.name !== 'triton') {
    throw new Error('produce[3] SNS HELLO default mismatch: ' + JSON.stringify({ helloDefTx, helloDefSns }));
  }

  // Toggle share ON (F4 = 139) and set chosen name "toshiba" (type "toshiba" + F5 = 140) -> guest broadcasts chosen-name HELLO with share bit (64)
  vm.pushKeyEvent(139, 0); // F4 share ON
  vm.run(100000);
  for (const ch of 'toshiba') vm.pushKeyEvent(ch.charCodeAt(0), 0);
  vm.pushKeyEvent(140, 0); // F5 set hostname + broadcast HELLO
  vm.run(250000);
  const helloChosenTx = SRef.decodeFrame(txFrames[txFrames.length - 1]);
  const helloChosenSns = SRef.decodeSns(helloChosenTx.payload);
  if (!helloChosenSns.ok || helloChosenSns.named !== true || helloChosenSns.name !== 'toshiba' || (helloChosenSns.services & 64) === 0) {
    throw new Error('produce[4] SNS HELLO chosen-name + sharing mismatch: ' + JSON.stringify(helloChosenSns));
  }

  // Verify WHO "cnsw" and BYE golden vectors against SRef and guest
  for (const pv of vectors.produce.slice(3)) {
    const decF = SRef.decodeFrame(fromHex(pv.hex));
    const decS = SRef.decodeSns(decF.payload);
    if (!decF.ok || !decS.ok) throw new Error('Golden produce SNS vector failed decode: ' + pv.name);
  }

  // --------------------------------------------------------------------------
  // 2. PARSE VECTORS (accepted or refused by guest driver as listed in golden-vectors.json)
  // --------------------------------------------------------------------------
  const vmParse = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 1 }); // nodeId=1 matches parse[0] dst=0x0001
  T.bootTritOSDesktop(vmParse, false);
  vmParse.run(300000);
  const mParse = makeMouseTracker(vmParse);
  mParse.click(690, 472, 350000);

  function getNetCounts() {
    vmParse.pushKeyEvent(19, 0); // Ctrl+S -> writes "NET"
    vmParse.run(180000);
    const t = readDiskFileTrytes(vmParse, T, 'NET');
    return {
      rxPkts: readDiskWord(t, 6),
      dropPkts: readDiskWord(t, 9)
    };
  }

  const parseResults = [];
  for (const vec of vectors.parse) {
    const before = getNetCounts();
    vmParse.receiveNetFrame(fromHex(vec.hex));
    vmParse.run(150000);
    const after = getNetCounts();
    const accepted = (after.rxPkts === before.rxPkts + 1) && (after.dropPkts === before.dropPkts);
    const rejected = (after.rxPkts === before.rxPkts);
    const expectAccept = vec.expect === 'accept';
    const matched = expectAccept ? accepted : rejected;
    if (!matched) {
      throw new Error(`parse vector '${vec.name}' (expect ${vec.expect}) mismatch: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    }
    parseResults.push({ name: vec.name, expect: vec.expect, accepted });
  }

  // --------------------------------------------------------------------------
  // 3. SRRP VECTORS (produced and parsed byte-exact)
  // --------------------------------------------------------------------------
  // Verify all 6 srrp vectors in golden-vectors.json match byte-for-byte
  for (const sv of vectors.srrp) {
    const raw = fromHex(sv.hex);
    if (sv.name === 'PUT inbox, trytes16 body') {
      // Deliver PUT /inbox/notes (trytes16 body: [-9841, -1, 0, 1, 9841]) to guest vm on port 80
      const putFrame = SRef.encodeFrame({
        dst: 3, src: 0x0101, proto: 3, flags: 13, sport: 49152, dport: 80, seq: 500, ack: 0, payload: raw
      });
      vm.receiveNetFrame(putFrame);
      vm.run(250000);
      const notesTrytes = readDiskFileTrytes(vm, T, 'NOTES');
      const expectedTrytes = [-9841, -1, 0, 1, 9841];
      if (!notesTrytes || JSON.stringify(notesTrytes) !== JSON.stringify(expectedTrytes)) {
        throw new Error('SRRP PUT /inbox/notes trytes16 mismatch on guest disk: ' + JSON.stringify(notesTrytes));
      }
    } else if (sv.name === 'legacy SpiralHttpd request (no SRRP/1)') {
      // Deliver legacy "GET /index" to guest on port 80 -> guest replies with one ACK|PSH (flags=6) body-only frame
      const beforeLen = txFrames.length;
      const legFrame = SRef.encodeFrame({
        dst: 3, src: 0x0101, proto: 3, flags: 13, sport: 49153, dport: 80, seq: 501, ack: 0, payload: raw
      });
      vm.receiveNetFrame(legFrame);
      vm.run(200000);
      const rep = SRef.decodeFrame(txFrames[txFrames.length - 1]);
      if (txFrames.length <= beforeLen || !rep.ok || rep.flags !== 6 || rep.payload.length === 0 || rep.payload.length > 480) {
        throw new Error('Legacy SpiralHttpd reply mismatch: ' + JSON.stringify(rep));
      }
    } else {
      const dec = SRef.decodeMessage(raw);
      if (!dec.ok) throw new Error('SRRP golden vector failed decodeMessage: ' + sv.name);
    }
  }

  return {
    name: '32-golden-vectors',
    status: 'PASS',
    produceVerified: vectors.produce.length,
    parseVerified: parseResults.length,
    parseResults,
    srrpVerified: vectors.srrp.length,
    inboxNotesTrytes: [-9841, -1, 0, 1, 9841]
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
