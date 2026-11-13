'use strict';
const fs = require('fs');
const path = require('path');
const { loadHtmlModule, makeMouseTracker } = require('./t3-common.js');

function runTest() {
  const { T, htmlPath } = loadHtmlModule('tritos-desktop.html');
  const spiralRoot = path.resolve(path.dirname(htmlPath), '..', 'spiralos');
  const { loadEmulators } = require(path.join(spiralRoot, 'tests', 'harness.js'));
  loadEmulators();

  // Boot unmodified SpiralOS 1.2 in Hummingbird via spiralos/tests/harness.js
  const img = new Uint8Array(fs.readFileSync(path.join(spiralRoot, 'spiralos.img')));
  globalThis.__STUDIONET_SWITCH.nics.clear();
  globalThis.__STUDIONET_SWITCH.packetLog = [];
  const hbPc = new globalThis.HummingbirdPC({ ramSizeMB: 16 });
  hbPc.loadFloppyImage(img);
  for (let i = 0; i < 6; i++) hbPc.cpu.runSteps(200000);

  // Boot TritOS Desktop 1.1 (Node 3) and launch Net (App 10)
  const vm3 = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  T.bootTritOSDesktop(vm3, false);
  vm3.run(300000);
  const m3 = makeMouseTracker(vm3);
  m3.click(690, 472, 350000);

  const tritosFrames = [];
  vm3.txHooks.push(f => {
    const u8 = new Uint8Array(f);
    tritosFrames.push(u8);
    if (hbPc.nic && typeof hbPc.nic.receiveFrame === 'function') {
      hbPc.nic.receiveFrame(u8);
    }
  });

  // Send Ping and SpiralChat from TritOS (12-byte STUDIONET.md header, port 900)
  vm3.pushKeyEvent(16, 0); // Ctrl+P Ping
  for (const c of 'HI SPIRAL\n') vm3.pushKeyEvent(c.charCodeAt(0), 0);
  vm3.run(400000);

  // Have Hummingbird SpiralOS send "ping" via unmodified SpiralSh (os/apps1.sp & os/net.sp)
  const scMap = { p: 0x19, i: 0x17, n: 0x31, g: 0x22, "\r": 0x1C };
  for (const ch of "ping\r") {
    const sc = scMap[ch];
    hbPc.ps2.sendKeyScancode(sc);
    hbPc.cpu.runSteps(200000);
    hbPc.ps2.sendKeyScancode(sc | 0x80);
    hbPc.cpu.runSteps(200000);
  }
  for (let i = 0; i < 4; i++) hbPc.cpu.runSteps(200000);

  const spiralFrames = globalThis.__STUDIONET_SWITCH.packetLog.map(p => new Uint8Array(p.raw || p.frame || p.bytes || p));
  for (const sf of spiralFrames) vm3.receiveNetFrame(sf);
  vm3.run(300000);

  // Check every frame sent by either side byte-for-byte against STUDIONET.md (12-byte header + checksum)
  for (const tf of tritosFrames) {
    const p = T.parseStudioNetFrame(tf);
    const csum = T.computeStudioNetChecksum(tf, p.len);
    if (p.checksum !== csum || tf.length !== 12 + p.len) {
      throw new Error('TritOS frame failed STUDIONET.md format/checksum');
    }
  }
  if (spiralFrames.length === 0) {
    throw new Error('Hummingbird SpiralOS did not emit any frames');
  }
  for (const sf of spiralFrames) {
    const p = T.parseStudioNetFrame(sf);
    const b8_9 = sf.length >= 10 ? (sf[8] | (sf[9] << 8)) : -1;
    const b10_11 = sf.length >= 12 ? (sf[10] | (sf[11] << 8)) : -1;
    if (!p || sf.length !== 12 + p.len || p.checksum !== T.computeStudioNetChecksum(sf, p.len)) {
      throw new Error(
        'Specification conflict (left failing per Forbidden rule): STUDIONET.md specifies a 12-byte header ' +
        '([dst:u16][src:u16][proto:u8][ttl:u8][seq:u16][len:u16][checksum:u16], port 900, PROTO_ECHO_REQ=1/SDP=3), ' +
        'whereas unmodified spiralos/os/net.sp emits a 16-byte header without checksum ' +
        '([dst:16][src:16][proto:8][flags:8][sport:16][dport:16][seq:16][ack:16][len:16], node 0x0201, port 4200, PROTO_SDP=2): ' +
        'parseStudioNetFrame=' + JSON.stringify(p) + ', frame.length=' + sf.length + ', bytes[8..9]=' + b8_9 + ' (dport 4200 vs len), bytes[10..11]=' + b10_11
      );
    }
  }

  return { name: '18-spiralos-interop', status: 'PASS', tritosFrames: tritosFrames.length, spiralFrames: spiralFrames.length };
}
if (require.main === module) {
  try {
    console.log(JSON.stringify(runTest()));
  } catch (e) {
    console.error('[EXPECTED SPEC CONFLICT FAIL]', e.message);
    process.exit(1);
  }
}
module.exports = { runTest };
