'use strict';
const fs = require('fs');
const path = require('path');
const { loadHtmlModule } = require('./t3-common.js');

function runTest() {
  const { T, htmlContent } = loadHtmlModule('tritos-desktop.html');
  const rootDir = path.resolve(__dirname, '..', '..', '..');

  // 1. Discover every asm-*.js source in rootDir
  const asmJsFiles = fs.readdirSync(rootDir).filter(f => /^asm-.*\.js$/.test(f)).sort();
  if (asmJsFiles.length < 2) {
    throw new Error('Expected at least 2 asm-*.js files, found: ' + JSON.stringify(asmJsFiles));
  }

  const KD = require(path.join(rootDir, 'asm-kernel-and-drivers.js'));
  const SB = require(path.join(rootDir, 'asm-solitaire-and-blocks.js'));
  const { fontLines, splashTileLines } = KD.buildFontAndSplashAsm(rootDir);
  const coreKernelAsm = KD.getKernelAndCoreDriversAsm(fontLines, splashTileLines);
  const app6ExtAsm = SB.getApp6ExtensionsAsm();
  const app7ExtAsm = SB.getApp7ExtensionsAsm();
  const netV3ExtAsm = SB.getNetV3SrrpAndSnsAsm();
  const app10ExtAsm = SB.getApp10ExtensionsAsm();

  // Verify no unquoted single-letter character immediates (#A..#Z, #a..#z, #:, #., #/) or raw multiline .stringz exist in any asm-*.js snippet
  const snippets = {
    'asm-kernel-and-drivers:coreKernelAsm': coreKernelAsm,
    'asm-solitaire-and-blocks:app6ExtAsm': app6ExtAsm,
    'asm-solitaire-and-blocks:app7ExtAsm': app7ExtAsm,
    'asm-solitaire-and-blocks:netV3ExtAsm': netV3ExtAsm,
    'asm-solitaire-and-blocks:app10ExtAsm': app10ExtAsm
  };
  for (const [name, text] of Object.entries(snippets)) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const code = lines[i].split(';')[0];
      if (/#([A-Za-z]|[.:/])(?![A-Za-z0-9_'])/.test(code)) {
        throw new Error(`Unquoted character immediate in ${name} line ${i + 1}: ${lines[i]}`);
      }
      if (/\.stringz\s+"[^"]*$/.test(code)) {
        throw new Error(`Unterminated multiline .stringz in ${name} line ${i + 1}: ${lines[i]}`);
      }
    }
  }

  // 2. Assemble the direct guest-112.asm source and compare tryte-for-tryte against T.TRITOS_DESKTOP_SRC (via TRITOS_DESKTOP_TEMPLATE)
  const directAsm = fs.readFileSync(path.join(rootDir, 'guest-112.asm'), 'utf8');
  const templateAsm = T.buildTritOSDesktopSource({});
  const resDirect = T.assemble(directAsm, { mode: 'T3' });
  const resTemplate = T.assemble(templateAsm, { mode: 'T3' });
  const resSrc = T.assemble(T.TRITOS_DESKTOP_SRC, { mode: 'T3' });

  if (resDirect.trytes.length !== resTemplate.trytes.length || resDirect.trytes.length !== resSrc.trytes.length) {
    throw new Error(`Tryte length mismatch: direct=${resDirect.trytes.length} template=${resTemplate.trytes.length} src=${resSrc.trytes.length}`);
  }

  let diffs = 0;
  for (let i = 0; i < resDirect.trytes.length; i++) {
    if (resDirect.trytes[i] !== resTemplate.trytes[i] || resDirect.trytes[i] !== resSrc.trytes[i]) {
      diffs++;
    }
  }
  if (diffs !== 0) {
    throw new Error(`Direct vs template tryte mismatch count: ${diffs}`);
  }

  // 3. Positive controls: verify T.assemble rejects unquoted #T and raw newline inside .stringz
  let unquotedCharCaught = false;
  try {
    T.assemble('.mode T3\n.org 0\n  CMPI R0, #T\n', { mode: 'T3' });
  } catch (e) {
    unquotedCharCaught = /Undefined label T/i.test(e.message);
  }
  let rawNewlineInStringzCaught = false;
  try {
    T.assemble('.mode T3\n.org 0\nstr_bad: .stringz "GET /index.hts SRRP/1\n\n"\n', { mode: 'T3' });
  } catch (e) {
    rawNewlineInStringzCaught = /Invalid string literal/i.test(e.message);
  }
  if (!unquotedCharCaught || !rawNewlineInStringzCaught) {
    throw new Error(`Positive controls failed: unquotedCharCaught=${unquotedCharCaught} rawNewlineInStringzCaught=${rawNewlineInStringzCaught}`);
  }

  return {
    name: '31-asm-template-equiv',
    status: 'PASS',
    asmJsFilesChecked: asmJsFiles,
    snippetsChecked: Object.keys(snippets).length,
    emittedTrytes: resDirect.trytes.length,
    directVsTemplateDiffs: diffs,
    unquotedCharCaught,
    rawNewlineInStringzCaught
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
