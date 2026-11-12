'use strict';
const fs = require('fs');
const crypto = require('crypto');
const { loadHtmlModule } = require('./t3-common.js');

function runTest() {
  const { htmlContent } = loadHtmlModule('tritos-desktop.html');
  const m = /\/\/BEGIN_TRITON3_MACHINE_BLOCK\n([\s\S]*?)\n\/\/END_TRITON3_MACHINE_BLOCK/.exec(htmlContent);
  if (!m) throw new Error('Missing machine block markers');
  const hash = crypto.createHash('sha256').update(m[1] + '\n', 'utf8').digest('hex');
  const expected = 'e8b8fa5e7ce96e705eba7f7985b5e0008d72b4ae8ac9c1fa4a1ff7e814175456';
  if (hash !== expected) throw new Error('Machine hash mismatch: ' + hash);
  return { name: '01-machine-integrity', status: 'PASS', sha256: hash };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
