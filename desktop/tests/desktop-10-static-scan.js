'use strict';
const { loadHtmlModule } = require('./t3-common.js');

function runTest() {
  const { htmlContent } = loadHtmlModule('tritos-desktop.html');
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
  return { name: '10-static-scan', status: 'PASS', inlineBlocksLabeled: 4 };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
