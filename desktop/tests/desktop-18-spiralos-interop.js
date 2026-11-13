'use strict';
/**
 * Test 6: SpiralOS 1.2.1 Interop (TabComp 0x0101 AND Hummingbird 0x0201),
 * booted unmodified through spiralos/tests/harness.js.
 *
 * Forbidden compliance:
 * - Zero access to SpiralOS RAM (verified strictly via transmitted frames,
 *   rendered framebuffers renderTabCompRGBA(tcCpu) / hbPc.vga.renderFrame(),
 *   and SpiralFS disk images tcCpu.spiralDiskImage / hbPc.floppyImage).
 * - Zero host-side protocol stack or frame mutation (pure byte relay between
 *   globalThis.__STUDIONET_SWITCH and vm.receiveNetFrame / vm.txHooks).
 */
const fs = require('fs');
const path = require('path');
const { loadHtmlModule, readFbString, readDiskFileTrytes, readDiskWord, makeMouseTracker } = require('./t3-common.js');
const { parseStudioNet16Frame } = require('./studionet16-ref.js');

const spiralDir = path.resolve(__dirname, '..', '..', '..', 'spiralos');
const { loadEmulators, renderTabCompRGBA } = require(path.join(spiralDir, 'tests', 'harness.js'));
const { SpiralFS, SPFS_IMG_OFFSET, SPFS_SIZE } = require(path.join(spiralDir, 'compiler', 'spiralfs.js'));

// Extract the 8x8 bitmap font hex table from tabcomp.html for pure framebuffer OCR
const tcHtmlText = fs.readFileSync(path.join(spiralDir, 'tabcomp.html'), 'utf8');
const FONT_8X8_HEX = eval(tcHtmlText.match(/FONT_8X8_HEX\s*=\s*(\([\s\S]*?\)|"[\s\S]*?"(?:\s*\+\s*"[\s\S]*?")*)/)[1]);

function ocrSpiral320(getPx, sx, sy, len) {
  const bg = getPx(sx, sy + 7);
  let out = '';
  for (let i = 0; i < len; i++) {
    let hex = '';
    for (let r = 0; r < 8; r++) {
      let b = 0;
      for (let c = 0; c < 8; c++) {
        if (getPx(sx + i * 8 + c, sy + r) !== bg) b |= (128 >> c);
      }
      hex += b.toString(16).padStart(2, '0');
    }
    let ch = '?';
    for (let code = 32; code < 127; code++) {
      if (FONT_8X8_HEX.slice((code - 32) * 16, (code - 31) * 16) === hex) {
        ch = String.fromCharCode(code);
        break;
      }
    }
    out += ch;
  }
  return out;
}

function readTabCompScreenStr(tcCpu, sx, sy, len) {
  const fb = renderTabCompRGBA(tcCpu);
  return ocrSpiral320((x, y) => fb.rgba[y * 320 + x], sx, sy, len);
}

function readHummingbirdScreenStr(hbPc, sx, sy, len) {
  const fb = hbPc.vga.renderFrame();
  return ocrSpiral320((x, y) => fb.rgba[(y * 2 + 40) * 640 + x * 2], sx, sy, len);
}

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

function runMachineInterop(T, machineKind, rawSpiralImg) {
  const isTC = machineKind === 'TabComp';
  const spiralNodeId = isTC ? 0x0101 : 0x0201; // 257 or 513

  globalThis.__STUDIONET_SWITCH.nics.clear();
  globalThis.__STUDIONET_SWITCH.packetLog = [];

  // Boot unmodified SpiralOS on TabComp or Hummingbird
  let tcCpu = null;
  let hbPc = null;
  if (isTC) {
    tcCpu = new globalThis.TabCompCPU(new globalThis.TabCompFS());
    globalThis.initHardwareMemory(tcCpu);
    globalThis.bootSpiralDiskImage(tcCpu, new Uint8Array(rawSpiralImg));
  } else {
    hbPc = new globalThis.HummingbirdPC({ ramSizeMB: 16 });
    hbPc.loadFloppyImage(new Uint8Array(rawSpiralImg));
  }

  // Boot TritOS Desktop 1.1.1 (Node 3 = 0x0003) with BIGFILE staged
  const vm3 = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  T.bootTritOSDesktop(vm3, false);
  vm3.run(300000);
  stageBigFileOnTritOS(vm3, T);
  T.bootTritOSDesktop(vm3, true);
  vm3.run(300000);

  // Pure byte-for-byte NIC relay between TritOS vm3 and __STUDIONET_SWITCH (no header rewriting)
  const tritosFrames = [];
  const spiralFrames = [];
  const tritosBridgeNic = {
    nodeId: 3,
    promiscuous: true, // ensures __STUDIONET_SWITCH hands every SpiralOS frame to vm3.receiveNetFrame unmodified
    _enqueueRx(frameU8) {
      const copy = new Uint8Array(frameU8);
      spiralFrames.push(copy);
      vm3.receiveNetFrame(copy);
    }
  };
  globalThis.__STUDIONET_SWITCH.register(tritosBridgeNic);
  vm3.txHooks.push(frame => {
    const copy = new Uint8Array(frame);
    tritosFrames.push(copy);
    globalThis.__STUDIONET_SWITCH.route(tritosBridgeNic, copy);
  });

  function stepSpiral(frames = 2) {
    if (isTC) {
      const target = tcCpu.presentCount + frames;
      while (tcCpu.presentCount < target && !tcCpu.halted) {
        tcCpu.yielded = false;
        tcCpu.stepBatch(50000);
      }
    } else {
      for (let i = 0; i < frames * 10; i++) {
        hbPc.cpu.runSteps(200000);
      }
      let g = 0;
      while ((hbPc.ps2.queue.length > 0 || hbPc.ps2.hasOut) && g < 50) {
        hbPc.cpu.runSteps(100000);
        g++;
      }
    }
  }

  let hbCurX = 160, hbCurY = 100;
  function clickSpiral(tx, ty) {
    if (isTC) {
      tcCpu.setMouseState(tx, ty, 1);
      stepSpiral(1);
      tcCpu.setMouseState(tx, ty, 0);
      stepSpiral(1);
    } else {
      while (hbCurX !== tx || hbCurY !== ty) {
        const dx = Math.max(-80, Math.min(80, tx - hbCurX));
        const dy = Math.max(-80, Math.min(80, ty - hbCurY));
        hbPc.ps2.sendMousePacket(dx, dy, 0);
        hbCurX += dx;
        hbCurY += dy;
        stepSpiral(1);
      }
      hbPc.ps2.sendMousePacket(0, 0, 1);
      stepSpiral(1);
      hbPc.ps2.sendMousePacket(0, 0, 0);
      stepSpiral(1);
    }
  }

  function moveSpiralCursorAway() {
    if (!isTC) {
      while (hbCurX !== 10 || hbCurY !== 190) {
        const dx = Math.max(-80, Math.min(80, 10 - hbCurX));
        const dy = Math.max(-80, Math.min(80, 190 - hbCurY));
        hbPc.ps2.sendMousePacket(dx, dy, 0);
        hbCurX += dx;
        hbCurY += dy;
        stepSpiral(1);
      }
    }
  }

  function openLauncherSpiral(itemNum) {
    clickSpiral(24, 6);
    clickSpiral(40, 16 + (itemNum - 1) * 10 + 4);
  }

  function typeSpiralAscii(str) {
    if (isTC) {
      for (const ch of str) {
        const c = ch.charCodeAt(0);
        tcCpu.pushKeyEvent(1, c, c, 0);
        tcCpu.pushKeyEvent(0, c, c, 0);
      }
      stepSpiral(3);
    } else {
      const scMap = {
        p: 0x19, i: 0x17, n: 0x31, g: 0x22,
        h: 0x23, t: 0x14, r: 0x13, o: 0x18, s: 0x1F,
        ' ': 0x39, '\r': 0x1C
      };
      for (const ch of str.toLowerCase()) {
        const sc = scMap[ch];
        if (sc) {
          hbPc.ps2.sendKeyScancode(sc);
          stepSpiral(1);
          hbPc.ps2.sendKeyScancode(sc | 0x80);
          stepSpiral(1);
        }
      }
      stepSpiral(3);
    }
  }

  if (!isTC) {
    let bootGuard = 0;
    while (!hbPc.ps2.mouseReporting && bootGuard < 400) {
      hbPc.cpu.runSteps(200000);
      bootGuard++;
    }
  }
  stepSpiral(6);

  // Launch Net (App 10) on TritOS Node 3 and set peer_node = spiralNodeId (257 or 513) via Ctrl+T (20)
  const m3 = makeMouseTracker(vm3);
  m3.click(690, 472, 450000);
  for (const ch of String(spiralNodeId)) vm3.pushKeyEvent(ch.charCodeAt(0), 0);
  vm3.pushKeyEvent(20, 0); // Ctrl+T
  vm3.run(150000);

  // --------------------------------------------------------------------------
  // (a) SpiralOS shell `ping` -> TritOS (SpiralSh is focused at boot on SpiralOS)
  // --------------------------------------------------------------------------
  typeSpiralAscii('ping\r');
  vm3.run(300000);
  const rxAfterSpiralPing = readFbString(vm3, T, 309, 114, 22, -320).trim();

  // --------------------------------------------------------------------------
  // (b) TritOS -> SpiralOS chat appears on SpiralOS's screen
  // --------------------------------------------------------------------------
  openLauncherSpiral(12); // Open SpiralChat on SpiralOS (window at 34, 42)
  for (const ch of 'HI SPIRAL\n') vm3.pushKeyEvent(ch.charCodeAt(0), 0);
  vm3.run(300000);
  if (!isTC) {
    let bootGuard = 0;
    while (!hbPc.ps2.mouseReporting && bootGuard < 400) {
      hbPc.cpu.runSteps(200000);
      bootGuard++;
    }
  }
  stepSpiral(6);
  // cursor is at (40, 130) or (152, 126), away from (40, 60) and (102, 102)
  const spiralChatLines = [0, 1, 2, 3].map(i => (isTC
    ? readTabCompScreenStr(tcCpu, 40, 60 + i * 11, 15)
    : readHummingbirdScreenStr(hbPc, 40, 60 + i * 11, 15)
  ).trim());
  const spiralChatScreenLine0 = spiralChatLines.find(l => l.includes("HI SPIRAL")) || spiralChatLines.join(" | ");

  // --------------------------------------------------------------------------
  // (c) SpiralOS -> TritOS chat (typed into SpiralChat UI and sent)
  // --------------------------------------------------------------------------
  // Focus SpiralChat input and type "hi tritos" + click [Send] at (210, 124)
  clickSpiral(100, 124);
  typeSpiralAscii('hi tritos');
  clickSpiral(210, 124);
  vm3.run(300000);
  const rxAfterSpiralChat = readFbString(vm3, T, 309, 114, 15, -320).trim();

  // --------------------------------------------------------------------------
  // (d) TritOS ping to SpiralOS shows NO REPLY
  // --------------------------------------------------------------------------
  vm3.pushKeyEvent(16, 0); // Ctrl+P
  vm3.run(150000);
  stepSpiral(3);
  vm3.run(350000); // exceeds 250,000-step Ping timeout budget
  const tritosPingRttLine = readFbString(vm3, T, 319, 78, 8, -320).trim();

  // --------------------------------------------------------------------------
  // (e) TritOS pushes a byte-mode file of <= 440 bytes ("HELLO", 33 bytes) to SpiralOS:
  //     TritOS receives SpiralOS's OK ACK, and the file is visible in SpiralOS UI & SpiralFS
  // --------------------------------------------------------------------------
  openLauncherSpiral(13); // Open SpiralSend on SpiralOS (window at 52, 46) so "Last: HELLO" renders on screen
  const spiralFramesBeforeFile = spiralFrames.length;
  for (const ch of 'HELLO') vm3.pushKeyEvent(ch.charCodeAt(0), 0);
  vm3.pushKeyEvent(6, 0); // Ctrl+F
  vm3.run(400000);
  if (!isTC) {
    let bootGuard = 0;
    while (!hbPc.ps2.mouseReporting && bootGuard < 400) {
      hbPc.cpu.runSteps(200000);
      bootGuard++;
    }
  }
  stepSpiral(6);
  vm3.run(300000);
  // cursor is at (40, 130) or (152, 126), away from (40, 60) and (102, 102)

  const ackFrames = spiralFrames.slice(spiralFramesBeforeFile).map(f => parseStudioNet16Frame(f));
  const okAck = ackFrames.find(p => p && p.proto === 3 && p.flags === 2 && p.dst === 3 && p.Payload && p.Payload.length === 2 || (p && p.proto === 3 && p.flags === 2 && p.dst === 3));
  const tritosStatusLineAfterPush = readFbString(vm3, T, 277, 148, 6, -320).trim();
  const tritosRttAfterAck = parseInt(readFbString(vm3, T, 319, 78, 8, -320).trim(), 10) || 0;

  // Verify on SpiralOS rendered screen ("Last: HELLO" at (102, 102) in SpiralSend) AND in SpiralFS disk image
  const spiralSendLastFileScreen = (isTC
    ? readTabCompScreenStr(tcCpu, 102, 102, 5)
    : readHummingbirdScreenStr(hbPc, 102, 102, 5)
  ).trim();
  const diskBuf = isTC ? tcCpu.spiralDiskImage : hbPc.floppyImage;
  const spfs = new SpiralFS(diskBuf.subarray(SPFS_IMG_OFFSET, SPFS_IMG_OFFSET + SPFS_SIZE));
  const spiralFsHello = spfs.readFile('HELLO');
  const spiralFsHelloStr = spiralFsHello ? new TextDecoder().decode(spiralFsHello) : null;

  // --------------------------------------------------------------------------
  // (f) SpiralOS pushes a file to TritOS (click [BeamToPeer] at (152, 126) in SpiralSend)
  // --------------------------------------------------------------------------
  // Select /src/hello.sp (index 10, 122 bytes) and click [BeamToPeer]
  for (let i = 0; i < 10; i++) clickSpiral(82, 126);
  clickSpiral(152, 126);
  vm3.run(400000);
  const tritosRxFileFromSpiral = readDiskFileTrytes(vm3, T, '/SRC/HEL');

  // --------------------------------------------------------------------------
  // (g) A file over 440 bytes ("BIGFILE", 2,187 trytes) to a SpiralOS node shows
  //     TOO BIG FOR SPIRALOS, and no frame is sent
  // --------------------------------------------------------------------------
  const tritosFramesBeforeBig = tritosFrames.length;
  for (const ch of 'BIGFILE') vm3.pushKeyEvent(ch.charCodeAt(0), 0);
  vm3.pushKeyEvent(6, 0); // Ctrl+F
  vm3.run(350000);
  const bigFramesSent = tritosFrames.length - tritosFramesBeforeBig;
  const tooBigScreenMsg = readFbString(vm3, T, 277, 148, 20, -320).trim();

  // Validate all transmitted frames from both sides with studionet16-ref.js
  for (const f of [...tritosFrames, ...spiralFrames]) {
    const p = parseStudioNet16Frame(f);
    if (!p) throw new Error('Invalid 16-byte StudioNet frame during interop');
  }

  const spiralInitiatedDsts = spiralFrames
    .map(f => parseStudioNet16Frame(f))
    .filter(p => p && p.dst !== 3)
    .map(p => '0x' + p.dst.toString(16).padStart(4, '0'));

  return {
    machine: machineKind,
    spiralNodeHex: '0x' + spiralNodeId.toString(16).padStart(4, '0'),
    checks: {
      tritosToSpiralChat: {
        pass: spiralChatScreenLine0 === 'HB: HI SPIRAL',
        spiralScreen: spiralChatScreenLine0
      },
      spiralToTritosChat: {
        pass: rxAfterSpiralChat.includes('HI TRITOS'),
        tritosScreen: rxAfterSpiralChat,
        spiralFrameDsts: spiralInitiatedDsts
      },
      spiralShellPingToTritos: {
        pass: rxAfterSpiralPing.includes('PING FROM SPIRALSH'),
        tritosScreen: rxAfterSpiralPing,
        spiralFrameDsts: spiralInitiatedDsts
      },
      tritosPingToSpiralNoReply: {
        pass: tritosPingRttLine === 'NO REPLY',
        tritosScreen: tritosPingRttLine
      },
      tritosToSpiralFilePush: {
        pass: !!okAck && tritosStatusLineAfterPush === 'ACK OK' && tritosRttAfterAck > 0 && spiralSendLastFileScreen === 'HELLO' && spiralFsHelloStr === 'HELLO FROM TRITOS DESKTOP 1.0 FS!',
        ackReceived: !!okAck,
        ackRttSteps: tritosRttAfterAck,
        tritosStatusScreen: tritosStatusLineAfterPush,
        spiralScreenLastFile: spiralSendLastFileScreen,
        spiralFsContent: spiralFsHelloStr
      },
      spiralToTritosFilePush: {
        pass: !!tritosRxFileFromSpiral,
        tritosFsFound: !!tritosRxFileFromSpiral,
        spiralFrameDsts: spiralInitiatedDsts
      },
      tritosOver440Refused: {
        pass: bigFramesSent === 0 && tooBigScreenMsg === 'TOO BIG FOR SPIRALOS',
        framesSent: bigFramesSent,
        tritosScreen: tooBigScreenMsg
      }
    }
  };
}

function runTest() {
  loadEmulators();
  const { T } = loadHtmlModule('tritos-desktop.html');
  const rawSpiralImg = fs.readFileSync(path.join(spiralDir, 'spiralos.img'));

  const tabcompRes = runMachineInterop(T, 'TabComp', rawSpiralImg);
  const hummingbirdRes = runMachineInterop(T, 'Hummingbird', rawSpiralImg);

  // Verify all 4 TritOS -> SpiralOS checks pass on BOTH TabComp and Hummingbird
  for (const r of [tabcompRes, hummingbirdRes]) {
    if (!r.checks.tritosToSpiralChat.pass) {
      throw new Error(`${r.machine} TritOS->SpiralOS chat failed: ` + JSON.stringify(r.checks.tritosToSpiralChat));
    }
    if (!r.checks.tritosPingToSpiralNoReply.pass) {
      throw new Error(`${r.machine} TritOS->SpiralOS ping NO REPLY failed: ` + JSON.stringify(r.checks.tritosPingToSpiralNoReply));
    }
    if (!r.checks.tritosToSpiralFilePush.pass) {
      throw new Error(`${r.machine} TritOS->SpiralOS <=440B file push failed: ` + JSON.stringify(r.checks.tritosToSpiralFilePush));
    }
    if (!r.checks.tritosOver440Refused.pass) {
      throw new Error(`${r.machine} TritOS->SpiralOS >440B refusal failed: ` + JSON.stringify(r.checks.tritosOver440Refused));
    }
  }

  // Check if any SpiralOS-initiated -> TritOS check failed due to os/net.sp sns_resolve("peer") dst mismatch
  const failedSubchecks = [];
  for (const r of [tabcompRes, hummingbirdRes]) {
    for (const [k, v] of Object.entries(r.checks)) {
      if (!v.pass) failedSubchecks.push(`${r.machine}.${k}`);
    }
  }

  if (failedSubchecks.length > 0) {
    throw new Error(
      'Interop conflict (left failing per Forbidden rule — 8/14 sub-checks PASS [all TritOS->SpiralOS chat, NO REPLY ping, <=440B file push + OK ACK + SpiralOS screen/FS, >440B TOO BIG FOR SPIRALOS on both TabComp & Hummingbird]; ' +
      '6/14 sub-checks FAIL [' + failedSubchecks.join(', ') + ']): ' +
      'unmodified spiralos/os/net.sp lines 87-90 hardcodes sns_resolve("peer") to return 0x0201 on TabComp and 0x0101 on Hummingbird ' +
      '(used by SpiralSh ping at apps1.sp:151, SpiralChat at apps2.sp:361,374, and SpiralSend at apps2.sp:425), ' +
      'while SPEC-DESKTOP-1.1.1 §B mandates TritOS node IDs stay 0x0003..0x0006 and the pinned Triton 3.1 NIC ' +
      '(triton3.html:1154 & 4450) drops incoming frames in hardware when dst !== this.nodeId && dst !== 0xFFFF. ' +
      'Details: ' + JSON.stringify({ tabcomp: tabcompRes.checks, hummingbird: hummingbirdRes.checks })
    );
  }

  return {
    name: '18-spiralos-interop',
    status: 'PASS',
    tabcomp: tabcompRes,
    hummingbird: hummingbirdRes
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest, runMachineInterop };
