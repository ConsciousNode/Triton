// run.js -- assemble an asm file, run it on TritonJS and TritonWASM, compare.
// usage: node carpet-bare-run.js carpet-bare.asm [lockstepSteps]
const fs = require('fs');
const path = require('path');
const { loadHtmlModule } = require(path.resolve(__dirname, '../../../tests/t3-common'));
const { T } = loadHtmlModule('triton4.html');
const src = fs.readFileSync(process.argv[2], 'utf8');
const lockN = Number(process.argv[3] || 20000);
const prog = T.assemble(src, { mode: 'T3' });
console.log(`assembled: ${prog.length} trytes`);
const js = new T.TritonJS({ archMode: 'T3' });
const wa = T.TritonWASM.createSync({ archMode: 'T3' });
js.loadProgram(prog.trytes, 0); wa.loadProgram(prog.trytes, 0);
// lockstep for the first lockN steps, state hash every step
for (let s = 0; s < lockN && !(js.halted && wa.halted); s++) {
  js.step(); wa.step();
  const a = T.computeStateHash(js), b = T.computeStateHash(wa);
  if (a !== b || js.pc !== wa.pc) { console.log(`DIVERGE at step ${s}: ${a} vs ${b}`); process.exit(1); }
}
// then run both to halt
let guard = 0;
while (!(js.halted && wa.halted) && guard++ < 1000) { js.run(100000); wa.run(100000); }
const hj = T.computeStateHash(js), hw = T.computeStateHash(wa);
let vramSame = js.vram.length === wa.vram.length;
const wv = wa.vram || [];
for (let i = 0; vramSame && i < js.vram.length; i++) if (js.vram[i] !== wv[i]) vramSame = false;
console.log(`halted: js=${js.halted} wasm=${wa.halted}  steps: js=${js.steps} wasm=${wa.steps}`);
console.log(`final state hash: js=0x${hj.toString(16)} wasm=0x${hw.toString(16)}  ${hj === hw ? 'AGREE' : 'DISAGREE'}`);
console.log(`framebuffer identical: ${vramSame}`);
console.log('console:\n' + js.consoleOut);
console.log(`consoles identical: ${js.consoleOut === wa.consoleOut}`);
// dump framebuffer as RGB via the machine's own 729 palette
const pal = T.PALETTE_729;
const out = Buffer.alloc(729 * 486 * 3);
for (let i = 0; i < 729 * 486; i++) {
  let c = pal[js.vram[i]];
  let r, g, b;
  if (typeof c === 'string') { const n = parseInt(c.replace('#', ''), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
  else if (Array.isArray(c)) [r, g, b] = c; else { r = (c >> 16) & 255; g = (c >> 8) & 255; b = c & 255; }
  out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
}
const zlib = require('zlib');
const raw = Buffer.alloc((729 * 3 + 1) * 486);
for (let y = 0; y < 486; y++) out.copy(raw, y * (729 * 3 + 1) + 1, y * 729 * 3, (y + 1) * 729 * 3);
const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([l, td, c]); };
const ih = Buffer.alloc(13); ih.writeUInt32BE(729, 0); ih.writeUInt32BE(486, 4); ih[8] = 8; ih[9] = 2;
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'carpet-bare.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]));
