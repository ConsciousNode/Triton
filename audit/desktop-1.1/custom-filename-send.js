'use strict';
const H = require(process.argv[2] + '/tests/t3-common.js');
const { T } = H.loadHtmlModule('tritos-desktop.html');
const vm3 = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 3 });
const vm4 = T.TritonWASM.createSync({ archMode: 'T3', nodeId: 4 });
T.bootTritOSDesktop(vm3, false); T.bootTritOSDesktop(vm4, false);
vm3.run(300000); vm4.run(300000);
const frames = [];
vm3.txHooks.push(f => { frames.push(['3>', f.length]); vm4.receiveNetFrame(f); });
vm4.txHooks.push(f => { frames.push(['4>', f.length]); vm3.receiveNetFrame(f); });
const m3 = H.makeMouseTracker(vm3), m4 = H.makeMouseTracker(vm4);
m3.click(690, 472, 350000); m4.click(690, 472, 350000);
const both = n => { vm4.run(n); vm3.run(n); };
// node 4: save its net status as NET (guest-written file), then send it by typed name
vm4.pushKeyEvent(19, 0); both(300000);
const before3 = Object.keys(H.listDiskFiles(vm3, T));
// nonexistent name first
for (const c of 'NOPE') vm4.pushKeyEvent(c.charCodeAt(0), 0);
vm4.pushKeyEvent(6, 0); both(600000);
for (const c of 'NET') vm4.pushKeyEvent(c.charCodeAt(0), 0);
vm4.pushKeyEvent(6, 0); both(1000000); both(500000);
const src = H.readDiskFileTrytes(vm4, T, 'NET');
const got = H.readDiskFileTrytes(vm3, T, 'NET');
let diffs = (src && got && src.length === got.length) ? 0 : -1;
if (diffs === 0) for (let i = 0; i < src.length; i++) if (src[i] !== got[i]) diffs++;
console.log(JSON.stringify({ before3, after3: Object.keys(H.listDiskFiles(vm3, T)),
  srcLen: src && src.length, gotLen: got && got.length, diffs, nopeOn3: !!H.readDiskFileTrytes(vm3, T, 'NOPE'),
  frames: frames.length, vm4alive: H.readFbString(vm4, T, 309, 114, 3, -320) !== undefined }));
