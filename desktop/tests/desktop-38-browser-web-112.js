'use strict';
/**
 * Spec Test 5: Browser (App 10 WEB view)
 * - fetch a `text/hts` page and an `image/t3-snap` from the reference peer;
 * - the framebuffer shows them (pixel checks);
 * - submit a form and verify the `POST` body.
 */
const path = require('path');
const { loadHtmlModule, readFbPixel, readFbString, readDiskFileTrytes, makeMouseTracker } = require('./t3-common.js');
const SRef = require(path.resolve(__dirname, '../../../studionet/studionet-ref.js'));

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const vm = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);

  // Launch App 10 (NET) at window (270, 32), client origin = (271, 44)
  const mouse = makeMouseTracker(vm);
  mouse.click(690, 472, 350000);

  let mode = 'hts';
  let lastGetReq = null;
  let lastPostReq = null;

  // Prepare 10x10 image/t3-snap test image with palette values in -364..+364
  const snapW = 10, snapH = 10;
  const snapPixels = [];
  for (let i = 0; i < snapW * snapH; i++) {
    snapPixels.push(((i * 37) % 729) - 364);
  }
  const snapPixelBytes = SRef.trytes16Encode(snapPixels);
  const snapBody = new Uint8Array(4 + snapPixelBytes.length);
  snapBody[0] = snapW & 255; snapBody[1] = (snapW >>> 8) & 255;
  snapBody[2] = snapH & 255; snapBody[3] = (snapH >>> 8) & 255;
  snapBody.set(snapPixelBytes, 4);

  vm.txHooks.push(raw => {
    const f = SRef.decodeFrame(raw);
    if (!f.ok || f.proto !== 3 || f.dport !== 80) return;
    const req = SRef.decodeMessage(f.payload);
    if (!req.ok) return;
    if (req.method === 'GET') {
      lastGetReq = req;
      if (mode === 'hts') {
        const htsBody = Uint8Array.from(Array.from("<h1>StudioNet</h1>\n<p>Hello Web</p>\n<a href='/'>Link</a>", c => c.charCodeAt(0)));
        const resp = SRef.encodeMessage({
          request: false, status: 200, reason: 'OK',
          headers: { Type: 'text/hts', Encoding: 'bytes' },
          body: htsBody
        });
        vm.receiveNetFrame(SRef.encodeFrame({
          dst: 3, src: f.dst, proto: 3, flags: 13, sport: 80, dport: f.sport, seq: 900, ack: (f.seq + 1) & 0xFFFF, payload: resp
        }));
      } else {
        const resp = SRef.encodeMessage({
          request: false, status: 200, reason: 'OK',
          headers: { Type: 'image/t3-snap', Encoding: 'bytes' },
          body: snapBody
        });
        vm.receiveNetFrame(SRef.encodeFrame({
          dst: 3, src: f.dst, proto: 3, flags: 13, sport: 80, dport: f.sport, seq: 910, ack: (f.seq + 1) & 0xFFFF, payload: resp
        }));
      }
    } else if (req.method === 'POST') {
      lastPostReq = req;
      const resp = SRef.encodeMessage({
        request: false, status: 200, reason: 'OK',
        headers: { Type: 'text/hts', Encoding: 'bytes' },
        body: Uint8Array.from(Array.from('<h1>POST OK</h1>', c => c.charCodeAt(0)))
      });
      vm.receiveNetFrame(SRef.encodeFrame({
        dst: 3, src: f.dst, proto: 3, flags: 13, sport: 80, dport: f.sport, seq: 920, ack: (f.seq + 1) & 0xFFFF, payload: resp
      }));
    }
  });

  // 1. Fetch and render text/hts page (F3 = 138 GET, F7 = 142 RENDER)
  mode = 'hts';
  vm.pushKeyEvent(138, 0); // F3 WEB GET
  vm.run(250000);
  vm.pushKeyEvent(142, 0); // F7 WEB RENDER
  vm.run(350000);

  // Client origin of App 10 is (271, 44). ndwr_render_hts draws lines at client (6, 20), (6, 32), (6, 44) -> screen (277, 64), (277, 76), (277, 88)
  const htsLine1 = readFbString(vm, T, 277, 64, 9, -320, false);
  const htsLine2 = readFbString(vm, T, 277, 76, 9, -320, false);
  const htsLine3 = readFbString(vm, T, 277, 88, 4, -320, false);
  if (htsLine1 !== 'StudioNet' || htsLine2 !== 'Hello Web' || htsLine3 !== 'Link') {
    throw new Error(`text/hts framebuffer render mismatch: l1=${JSON.stringify(htsLine1)} l2=${JSON.stringify(htsLine2)} l3=${JSON.stringify(htsLine3)}`);
  }

  // 2. Fetch and render image/t3-snap (10x10 palette trytes at client (8, 20) -> screen (279, 64))
  mode = 'snap';
  vm.pushKeyEvent(138, 0); // F3 WEB GET
  vm.run(250000);
  vm.pushKeyEvent(142, 0); // F7 WEB RENDER
  vm.run(450000);

  let snapPixelDiffs = 0;
  for (let y = 0; y < snapH; y++) {
    for (let x = 0; x < snapW; x++) {
      const fbPx = readFbPixel(vm, T, 271 + 8 + x, 44 + 20 + y);
      const expPx = snapPixels[y * snapW + x];
      if (fbPx !== expPx) snapPixelDiffs++;
    }
  }
  const savedSnap = readDiskFileTrytes(vm, T, 'WEBSNAP');
  if (snapPixelDiffs !== 0 || !savedSnap || savedSnap.length !== 100) {
    throw new Error(`image/t3-snap framebuffer pixel check failed: pixelDiffs=${snapPixelDiffs}`);
  }

  // 3. Submit POST form (F6 = 141) and verify POST headers and body ("user=triton&ok=1")
  vm.pushKeyEvent(141, 0); // F6 WEB POST
  vm.run(250000);
  if (!lastPostReq || lastPostReq.method !== 'POST' || lastPostReq.path !== '/form' || lastPostReq.headers.Type !== 'form') {
    throw new Error('POST form header mismatch: ' + JSON.stringify(lastPostReq));
  }
  const postBodyStr = String.fromCharCode.apply(null, Array.from(lastPostReq.body));
  if (postBodyStr !== 'user=triton&ok=1') {
    throw new Error(`POST form body mismatch: expected "user=triton&ok=1", got ${JSON.stringify(postBodyStr)}`);
  }

  return {
    name: '38-browser-web-1.1.2',
    status: 'PASS',
    getPath: lastGetReq ? lastGetReq.path : null,
    htsRenderedLines: [htsLine1, htsLine2, htsLine3],
    snapImage: { width: snapW, height: snapH, totalPixels: snapW * snapH, fbPixelDiffs: snapPixelDiffs },
    postForm: { method: lastPostReq.method, path: lastPostReq.path, type: lastPostReq.headers.Type, body: postBodyStr }
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
