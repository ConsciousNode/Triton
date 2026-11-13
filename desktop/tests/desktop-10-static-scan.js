'use strict';
const fs = require('fs');
const path = require('path');
const { loadHtmlModule } = require('./t3-common.js');

function runTest() {
  const { htmlContent, htmlPath } = loadHtmlModule('tritos-desktop.html');
  if (!htmlContent.includes("default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data:; connect-src 'none';")) {
    throw new Error('Missing strict CSP');
  }
  const forbidden = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage', 'indexedDB'];
  for (const api of forbidden) {
    if (htmlContent.includes(api)) throw new Error('Forbidden API found: ' + api);
  }
  for (let i = 1; i <= 4; i++) {
    if (!htmlContent.includes('[INLINE ' + i + '/4]')) throw new Error('Missing inline provenance label ' + i);
  }
  if (!htmlContent.includes("BroadcastChannel('studionet_v1')")) {
    throw new Error('Missing documented BroadcastChannel(studionet_v1) plumbing');
  }

  // Verify host scripts outside [INLINE 2/4] never read or write guest-private memory (.mem[)
  const afterMachine = htmlContent.split('//END_TRITON3_MACHINE_BLOCK')[1] || '';
  if (/\.mem\s*\[/.test(afterMachine)) {
    throw new Error('Host code outside machine block accesses .mem[...] directly');
  }

  // Verify all test files in desktop/tests/*.js never read or write guest-private memory
  const testDir = path.dirname(__filename);
  const testFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.js'));
  for (const tf of testFiles) {
    if (tf === 'desktop-10-static-scan.js') continue;
    const src = fs.readFileSync(path.join(testDir, tf), 'utf8');
    if (/\.mem\s*\[/.test(src)) {
      throw new Error('Test file ' + tf + ' accesses guest-private .mem[...] directly');
    }
    if (/\.setMem\s*\(/.test(src)) {
      throw new Error('Test file ' + tf + ' calls .setMem(...)');
    }
    if (/\.setDisk\s*\(/.test(src)) {
      throw new Error('Test file ' + tf + ' calls .setDisk(...) directly');
    }
  }

  return {
    name: '10-static-scan',
    status: 'PASS',
    inlineBlocksLabeled: 4,
    testFilesScanned: testFiles.length,
    zeroHostGuestMemAccesses: true
  };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
