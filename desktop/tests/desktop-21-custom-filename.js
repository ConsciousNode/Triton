'use strict';
/**
 * Standing Test 4 (from 1.1 audit custom-filename-send.js):
 * Node 4 saves a file through the guest, the test types its name in Net and presses Ctrl+F,
 * and Node 3 receives it with 0 differences. Also verifies a nonexistent filename ("NOPE") sends nothing.
 */
const H = require('./t3-common.js');
const { parseStudioNet16Frame } = require('./studionet16-ref.js');

function runTest() {
  const { T } = H.loadHtmlModule('tritos-desktop.html');
  const vm3 = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  const vm4 = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 4 });
  T.bootTritOSDesktop(vm3, false);
  T.bootTritOSDesktop(vm4, false);
  vm3.run(300000);
  vm4.run(300000);

  const frames = [];
  vm3.txHooks.push(f => { frames.push({ from: 3, bytes: new Uint8Array(f) }); vm4.receiveNetFrame(f); });
  vm4.txHooks.push(f => { frames.push({ from: 4, bytes: new Uint8Array(f) }); vm3.receiveNetFrame(f); });

  const m3 = H.makeMouseTracker(vm3);
  const m4 = H.makeMouseTracker(vm4);
  m3.click(690, 472, 350000);
  m4.click(690, 472, 350000);
  const both = n => { vm4.run(n); vm3.run(n); };

  // Node 4 saves its net status as "NET" (guest-written file) via Ctrl+S (19)
  vm4.pushKeyEvent(19, 0);
  both(300000);

  // Nonexistent filename "NOPE" first -> must send 0 frames
  for (const c of 'NOPE') vm4.pushKeyEvent(c.charCodeAt(0), 0);
  vm4.pushKeyEvent(6, 0);
  both(600000);
  const framesAfterNope = frames.length;
  if (framesAfterNope !== 0) {
    throw new Error('Missing filename "NOPE" sent ' + framesAfterNope + ' frames instead of 0');
  }

  // Now type "NET" and press Ctrl+F (6) on Node 4 -> Node 3 receives "NET" with 0 differences
  for (const c of 'NET') vm4.pushKeyEvent(c.charCodeAt(0), 0);
  vm4.pushKeyEvent(6, 0);
  both(1000000);
  both(500000);

  const src = H.readDiskFileTrytes(vm4, T, 'NET');
  const got = H.readDiskFileTrytes(vm3, T, 'NET');
  let diffs = (src && got && src.length === got.length) ? 0 : -1;
  if (diffs === 0) {
    for (let i = 0; i < src.length; i++) {
      if (src[i] !== got[i]) diffs++;
    }
  }
  const nopeOn3 = !!H.readDiskFileTrytes(vm3, T, 'NOPE');

  for (const item of frames) {
    const parsed = parseStudioNet16Frame(item.bytes);
    if (!parsed) throw new Error('Transmitted frame failed studionet16-ref validation');
  }

  if (diffs !== 0 || nopeOn3 || !src || src.length !== 100) {
    throw new Error('Custom filename transfer failed: diffs=' + diffs + ' nopeOn3=' + nopeOn3);
  }

  return {
    name: '21-custom-filename-send',
    status: 'PASS',
    srcLen: src.length,
    gotLen: got.length,
    diffs,
    nopeOn3,
    framesAfterNope,
    totalFrames: frames.length
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
