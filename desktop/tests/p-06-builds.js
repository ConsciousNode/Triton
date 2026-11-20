'use strict';
/**
 * p-06: Build reproducibility & static checks.
 * - `node build_desktop2.js` reproduces the shipped tritos-desktop-2.html byte-for-byte.
 * - Shipped tritos-desktop-2.html was NOT built with --no-ptr-check.
 * - Shipped tritos-desktop-2.html passes `clock: Date.now` in browser boot.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { desktopDir, sha256File, appendResult } = require('./p-common.js');

function runTest() {
  const shippedPath = path.join(desktopDir, 'tritos-desktop-2.html');
  const beforeBytes = fs.readFileSync(shippedPath);
  const beforeSha = crypto.createHash('sha256').update(beforeBytes).digest('hex');

  const tmpOut = path.join(desktopDir, '_p06_rebuilt.html');
  try {
    execFileSync('node', [path.join(desktopDir, 'build_desktop2.js'), '--out', tmpOut], {
      cwd: desktopDir,
      encoding: 'utf8'
    });
    const afterBytes = fs.readFileSync(tmpOut);
    const afterSha = crypto.createHash('sha256').update(afterBytes).digest('hex');

    if (beforeSha !== afterSha || !beforeBytes.equals(afterBytes)) {
      throw new Error(`Rebuilt page mismatch: shipped=${beforeSha} vs rebuilt=${afterSha}`);
    }

    const htmlStr = beforeBytes.toString('utf8');
    if (htmlStr.includes('--no-ptr-check')) {
      throw new Error('Shipped tritos-desktop-2.html contains --no-ptr-check bypass!');
    }
    if (!htmlStr.includes('; __NO_PTR_CHECK__')) {
      throw new Error('Shipped tritos-desktop-2.html missing active k_check_user_ptr routine!');
    }
    if (!htmlStr.includes('clock: Date.now')) {
      throw new Error('Shipped tritos-desktop-2.html missing clock: Date.now in browser boot!');
    }

    const numbers = {
      shippedBytes: beforeBytes.length,
      shippedSha256: beforeSha,
      rebuiltSha256: afterSha,
      byteIdentical: true,
      noPtrCheckBypassAbsent: true,
      wallClockWired: true
    };
    appendResult({ testId: 'p-06', backend: 'build', seed: 0, pass: true, numbers });
    return { name: 'p-06-builds', status: 'PASS', ...numbers };
  } finally {
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  }
}

if (require.main === module) {
  console.log(JSON.stringify(runTest()));
}
module.exports = { runTest };
