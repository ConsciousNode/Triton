// app-test.js -- boot TritOS Desktop 2.0.1, insert a cartridge holding
// /apps/CARPET/{main,icon}, install + launch from App Shelf, cycle all six ops,
// save a screenshot of each. Runs on the backend named in argv[2] (JS | WASM).
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const D = path.resolve(__dirname, '../../tests') + '/';
const { TritFS, Unit, T_EXEC, T_IMAGE, bootDesktop2, guestStat } = require(D + 'd20-common.js');
const backend = process.argv[2] || 'WASM';
const { T, vm } = bootDesktop2({ backend });
const app = T.assemble(fs.readFileSync(path.join(__dirname, 'carpet-app.asm'), 'utf8'));
// icon: 16x16 TXOR pattern, the same formula as the app, scaled the same way
const bt = v => { const t = []; for (let i = 0; i < 6; i++) { let r = ((v % 3) + 3) % 3; if (r === 2) r = -1; t.push(r); v = (v - r) / 3; } return t; };
const fromT = t => t.reduce((a, d, i) => a + d * 3 ** i, 0);
const txor = (a, b) => { const A = bt(a), B = bt(b); return fromT(A.map((x, i) => { let s = ((x + B[i]) % 3 + 3) % 3; return s === 2 ? -1 : s; })); };
const icon = new Int16Array(256);
for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) icon[y * 16 + x] = txor(-81 + x * 10, -54 + y * 7) * 3; // a 16x16 sample of the app's own TXOR screen
const cart = new Unit(2187, { removable: true });
const cfs = TritFS.mkfs(cart, 'EDCART');
cfs.mkdir('/apps'); cfs.mkdir('/apps/CARPET');
cfs.writeFile('/apps/CARPET/main', app.trytes, T_EXEC);
cfs.writeFile('/apps/CARPET/icon', icon, T_IMAGE);
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'out', 'carpet-cartridge.tdisk'), Buffer.from(cart.toTdisk()));
vm.pushMouseEvent(170 - 364, 478 - 230, 1); vm.pushMouseEvent(0, 0, 0); vm.run(250000);
vm.insertUnit(2, cart.toTdisk(), { removable: true, writeProtected: false }); vm.run(250000);
vm.pushKeyEvent('R'.charCodeAt(0), 0); vm.run(250000);
vm.pushKeyEvent('I'.charCodeAt(0), 0); vm.run(300000);
vm.pushKeyEvent(13, 0); vm.run(1500000);
const pal = T.PALETTE_729;
function shot(name) {
  const w = 729, h = 486, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = pal[vm.vram[y * w + x]] || [0, 0, 0], o = y * (w * 3 + 1) + 1 + x * 3;
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
  }
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32 ? zlib.crc32(td) >>> 0 : crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'out', name), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]));
}
function crc(b) { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = ~0; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; }
const hashes = [];
for (let m = 0; m < 6; m++) {
  shot(`app-${backend}-op${m}.png`);
  hashes.push(T.computeStateHash(vm).toString(16));
  vm.pushKeyEvent(32, 0); vm.run(1500000);
}
vm.pushKeyEvent(81, 0); vm.run(1500000); shot(`app-${backend}-after-quit.png`);
hashes.push(T.computeStateHash(vm).toString(16));
console.log(JSON.stringify({ backend, appTrytes: app.length, installed: !!guestStat(vm, '1:/apps/CARPET/main'), steps: vm.steps, hashes }));
