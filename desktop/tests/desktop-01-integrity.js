'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadHtmlModule } = require('./t3-common.js');

function runTest() {
  const { T, htmlContent, htmlPath } = loadHtmlModule('tritos-desktop.html');
  const m = /\/\/BEGIN_TRITON3_MACHINE_BLOCK\n([\s\S]*?)\n\/\/END_TRITON3_MACHINE_BLOCK/.exec(htmlContent);
  if (!m) throw new Error('Missing machine block markers');
  const hash = crypto.createHash('sha256').update(m[1] + '\n', 'utf8').digest('hex');

  // Verify against attached triton3.html if present, and against pinned 3.1 SHA-256
  const expected = '24f32f41406763dbded240397639559ac98d18b15537f8d1fe5bfabe92fa3831';
  const refPath = path.resolve(path.dirname(htmlPath), '..', 'triton3.html');
  if (fs.existsSync(refPath)) {
    const refLines = fs.readFileSync(refPath, 'utf8').split('\n');
    const refBlock = refLines.slice(430, 9635).join('\n') + '\n';
    const refHash = crypto.createHash('sha256').update(refBlock, 'utf8').digest('hex');
    if (hash !== refHash) throw new Error('Machine block does not match attached triton3.html: ' + hash + ' vs ' + refHash);
  }
  if (hash !== expected) throw new Error('Machine hash mismatch: ' + hash);
  if (!T || !T.TritonWASM || !T.TritonJS) throw new Error('TritonSystem not properly exported from IIFE');
  return { name: '01-machine-integrity', status: 'PASS', sha256: hash };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
