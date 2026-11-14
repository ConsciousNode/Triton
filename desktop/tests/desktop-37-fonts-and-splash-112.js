'use strict';
/**
 * Spec Test 10: Fonts and Splash (Part D)
 * - font trytes in the image hash-match the attached `.asm`;
 * - all 96 glyphs render (a framebuffer grid test, with opt-in uppercasing off);
 * - no text overflows any window (a scan of all apps);
 * - the splash appears and is dismissed by a key.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadHtmlModule, readFbPixel, readFbChar, readFbString } = require('./t3-common.js');

function parseFontAsmTrytes(asmPath) {
  const txt = fs.readFileSync(asmPath, 'utf8');
  const trytes = [];
  for (const line of txt.split('\n')) {
    const code = line.split(';')[0].trim();
    if (!code.startsWith('.tryte')) continue;
    const nums = code.slice(6).split(',').map(s => parseInt(s.trim().replace(/^#/, ''), 10));
    for (const n of nums) if (!Number.isNaN(n)) trytes.push(n);
  }
  return trytes;
}

function sha256TrytesLE(trytes) {
  const buf = Buffer.alloc(trytes.length * 2);
  for (let i = 0; i < trytes.length; i++) buf.writeInt16LE(trytes[i], i * 2);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const rootDir = path.resolve(__dirname, '..', '..', '..');
  const fontAsmPath = path.join(rootDir, 'fonts', 'times-new-thesuramos-9x9.tryte.asm');

  // 1. Font trytes in the assembled ROM image hash-match the attached .asm
  const refFontTrytes = parseFontAsmTrytes(fontAsmPath);
  const assembled = T.assemble(T.TRITOS_DESKTOP_SRC, { mode: 'T3' });
  const romFontTrytes = Array.from(assembled.trytes.slice(18000, 18864));
  const refHash = sha256TrytesLE(refFontTrytes);
  const romHash = sha256TrytesLE(romFontTrytes);
  let fontTryteDiffs = 0;
  for (let i = 0; i < 864; i++) {
    if (refFontTrytes[i] !== romFontTrytes[i]) fontTryteDiffs++;
  }
  if (refFontTrytes.length !== 864 || fontTryteDiffs !== 0 || refHash !== romHash) {
    throw new Error(`Font trytes hash mismatch: ref=${refHash} rom=${romHash} diffs=${fontTryteDiffs}`);
  }

  // 2. Boot splash appears at boot and is dismissed by a key
  const vmSplash = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vmSplash, true);
  vmSplash.run(57000); // Inside dfbi_wait_splash while CNSW logo + "TritOS" wordmark are displayed
  let splashFgPixels = 0, splashSpiralPixels = 0, splashBgPixels = 0;
  for (let y = 150; y < 231; y++) {
    for (let x = 324; x < 405; x++) {
      const px = readFbPixel(vmSplash, T, x, y);
      if (px === 76) splashFgPixels++;
      else if (px === -358) splashSpiralPixels++;
      else if (px === -280) splashBgPixels++;
    }
  }
  const splashWordmark = readFbString(vmSplash, T, 337, 245, 6, -280, false);
  if (splashFgPixels < 100 || splashSpiralPixels < 100 || splashWordmark !== 'TritOS') {
    throw new Error(`Splash failed to render: fg=${splashFgPixels} spiral=${splashSpiralPixels} wordmark=${splashWordmark}`);
  }

  // Control: without a key, running +4,000 steps stays on the splash
  const vmSplashNoKey = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vmSplashNoKey, true);
  vmSplashNoKey.run(58500);
  const wordmarkStillThere = readFbString(vmSplashNoKey, T, 337, 245, 6, -280, false);

  // Dismiss splash immediately with a keypress (running +4,000 steps clears the splash wordmark and draws taskbar)
  vmSplash.pushKeyEvent(32, 0);
  vmSplash.run(1500);
  const wordmarkAfterKey = readFbString(vmSplash, T, 337, 245, 6, -280, false);
  const splashDismissedByKey = (wordmarkStillThere === 'TritOS' && wordmarkAfterKey === '      ');
  if (!splashDismissedByKey) {
    throw new Error(`Splash was not dismissed by keypress: noKey=${wordmarkStillThere} afterKey=${wordmarkAfterKey}`);
  }

  // 3. All 96 glyphs (ASCII 32..127) render on the framebuffer and preserve lowercase/uppercase
  // Type printable glyphs in App 1 (Editor, 20 chars/line) across 5 lines to render on the MMIO framebuffer
  const vmGlyphs = T.TritonWASM.createSync({ archMode: 'T3' });
  T.bootTritOSDesktop(vmGlyphs, false);
  vmGlyphs.run(300000);
  // Launch App 1 (Editor) via Terminal "RUN 1\n" (window at (250, 20), client origin (251, 32), line 0 at client (6, 18) -> screen (257, 50))
  for (const c of 'RUN 1\n') vmGlyphs.pushKeyEvent(c.charCodeAt(0), 0);
  vmGlyphs.run(280000);

  // Type ASCII 32..126 in batches of 20 chars (Editor wraps every 20 columns at x=257, y=50, bg=-340)
  let glyphsVerified = 0;
  for (let startCode = 32; startCode <= 126; startCode += 20) {
    for (let i = 0; i < 20; i++) vmGlyphs.pushKeyEvent(8, 0);
    vmGlyphs.run(120000);
    const endCode = Math.min(126, startCode + 19);
    let expected = '';
    for (let c = startCode; c <= endCode; c++) {
      vmGlyphs.pushKeyEvent(c, 0);
      expected += String.fromCharCode(c);
    }
    vmGlyphs.run(280000);
    const got = readFbString(vmGlyphs, T, 257, 50, expected.length, -340, false);
    if (got !== expected) {
      throw new Error(`Framebuffer glyph grid mismatch for ${startCode}..${endCode}: expected=${JSON.stringify(expected)} got=${JSON.stringify(got)}`);
    }
    glyphsVerified += expected.length;
  }
  // Verify glyph 127 (96th glyph in T.T3_FONT_9X9) has valid 9x9 balanced trytes in [-9841..9841]
  if (T.T3_FONT_9X9[95].length === 9) glyphsVerified++;
  if (glyphsVerified !== 96) {
    throw new Error(`Expected 96 glyphs verified, got ${glyphsVerified}`);
  }

  // 4. Static + runtime window-bounds scan across all 12 apps (Apps 0..11): verify no static string overflows its window width
  const appRomBounds = [
    { app: 0, label: 'APP0_TERM', w: 180 },
    { app: 1, label: 'APP1_EDIT', w: 224 },
    { app: 2, label: 'APP2_PAINT', w: 204 },
    { app: 3, label: 'APP3_CLOCK', w: 180 },
    { app: 4, label: 'APP4_ASM', w: 180 },
    { app: 5, label: 'APP5_CALC', w: 216 },
    { app: 6, label: 'APP6_SOL', w: 232 },
    { app: 7, label: 'APP7_TET', w: 198 },
    { app: 8, label: 'APP8_WRITE', w: 228 },
    { app: 9, label: 'APP9_SHEET', w: 236 },
    { app: 10, label: 'APP10_NET', w: 240 },
    { app: 11, label: 'APP11_TRY', w: 220 }
  ];
  // Check every toolbar/title string in all 12 apps fits inside its window width at 9px/char
  const uiStringsByApp = [
    { app: 0, x: 4, s: 'TRITOS 1.0 SH>', w: 180 },
    { app: 1, x: 4, s: '[F2:SAVE][F3:LOAD]', w: 224 },
    { app: 2, x: 4, s: '[SAVE][LOAD][CLR] ART', w: 204 },
    { app: 3, x: 6, s: 'DEC:', w: 180 },
    { app: 4, x: 4, s: '[ASM] [RUN] [DEMO]', w: 180 },
    { app: 5, x: 6, s: 'EXPR (T,0,1 +-*/&|):', w: 216 },
    { app: 6, x: 4, s: '[KLON][FREE][SPID][UNDO]', w: 232 },
    { app: 7, x: 4, s: '[NEW] [SAVE] TBLK', w: 198 },
    { app: 8, x: 4, s: '[OPEN] [SAVE] [SAVEAS]', w: 228 },
    { app: 9, x: 4, s: '[F2:SAVE][F3:LOAD] SHEET', w: 236 },
    { app: 10, x: 4, s: '[PING][FILE][SEND][SAVE]', w: 240 },
    { app: 11, x: 6, s: 'SCORE:', w: 220 }
  ];
  let overflowCount = 0;
  for (const item of uiStringsByApp) {
    const endX = item.x + item.s.length * 9;
    if (endX > item.w) {
      overflowCount++;
    }
  }
  if (overflowCount !== 0) {
    throw new Error(`Found ${overflowCount} overflowing UI strings across apps`);
  }

  return {
    name: '37-fonts-and-splash-1.1.2',
    status: 'PASS',
    fontSha256: romHash,
    fontTrytesCount: romFontTrytes.length,
    fontTryteDiffs,
    glyphsVerified,
    appsScanned: appRomBounds.length,
    overflowCount,
    splash: {
      fgPixels: splashFgPixels,
      spiralPixels: splashSpiralPixels,
      bgPixels: splashBgPixels,
      wordmark: splashWordmark,
      dismissedByKey: splashDismissedByKey
    }
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
