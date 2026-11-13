'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadHtmlModule } = require('./t3-common.js');

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

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
  if (!htmlContent.includes("BroadcastChannel('studionet-v1')")) {
    throw new Error('Missing documented BroadcastChannel(studionet-v1) plumbing');
  }

  // Verify host scripts outside [INLINE 2/4] never read or write guest-private memory (.mem[) and have no host-side protocol stack
  const afterMachine = htmlContent.split('//END_TRITON3_MACHINE_BLOCK')[1] || '';
  if (/\.mem\s*\[/.test(afterMachine)) {
    throw new Error('Host code outside machine block accesses .mem[...] directly');
  }
  const hostAfterTemplate = afterMachine.split('TritonSystem.bootTritOSDesktop = bootTritOSDesktop;')[1] || '';
  if (/buildStudioNet|parseStudioNet|computeStudioNetChecksum/.test(hostAfterTemplate)) {
    throw new Error('Host code contains StudioNet protocol stack helpers instead of pure byte relay');
  }

  // Verify all test files in desktop/tests/*.js never read or write guest-private memory or SpiralOS RAM
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
    if (/\b(tcCpu|hbPc|cpu|pc)\.(ram|ramView|ramDV)\b/.test(src)) {
      throw new Error('Test file ' + tf + ' reads or writes SpiralOS RAM directly');
    }
  }

  // Verify spiralos/ files and desktop/audit/ files are completely unmodified
  const spiralDir = path.resolve(testDir, '..', '..', '..', 'spiralos');
  const expectedSpiralHashes = {
    'STUDIONET.md':     'db7a1f4d31094e21def64586698b26a17fe780e56a022b559fe401b691def793',
    'spiralos.img':     '9d239cd8f59c124ee5031c9ce6d5a643d9855a135e42e534302c0cd949e7e5b4',
    'os/net.sp':        'a1fb8ac411257f13baa73255b161f6fbf30f677892703853a2c4359ed4c6e314',
    'tests/harness.js': 'f0d6629628a4b2a8dac9ad95b41b6442aba04b8f70e81bbd5c6e4ee71bdeb689'
  };
  let spiralVerified = 0;
  if (fs.existsSync(spiralDir)) {
    for (const [rel, expHash] of Object.entries(expectedSpiralHashes)) {
      const p = path.join(spiralDir, rel);
      if (fs.existsSync(p)) {
        const actual = sha256File(p);
        if (actual !== expHash) {
          throw new Error(`spiralos/${rel} was modified: expected ${expHash}, got ${actual}`);
        }
        spiralVerified++;
      }
    }
  }

  const auditProbePath = path.resolve(testDir, '..', 'audit', 'calc-no-host-writes.js');
  const expectedAuditProbeHash = 'b530a62d233d3cfe2ffe7f2b9375fd6e0fa385a27aaaf1c8b9e6a5e8bb4d199b';
  if (fs.existsSync(auditProbePath)) {
    const actualProbe = sha256File(auditProbePath);
    if (actualProbe !== expectedAuditProbeHash) {
      throw new Error(`desktop/audit/calc-no-host-writes.js was modified: ${actualProbe}`);
    }
  }

  return {
    name: '10-static-scan',
    status: 'PASS',
    inlineBlocksLabeled: 4,
    testFilesScanned: testFiles.length,
    zeroHostGuestMemAccesses: true,
    zeroHostProtocolStack: true,
    zeroSpiralOsRamReads: true,
    spiralOsFilesVerifiedUnmodified: spiralVerified
  };
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
