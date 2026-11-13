'use strict';
const suites = [
  './desktop-01-integrity.js',
  './desktop-02-determinism.js',
  './desktop-03-preemption.js',
  './desktop-04-fault-isolation.js',
  './desktop-05-filesystem.js',
  './desktop-06-windowing.js',
  './desktop-07-apps.js',
  './desktop-08-selfhost.js',
  './desktop-12-klondike.js',
  './desktop-13-tetris.js',
  './desktop-14-write.js',
  './desktop-15-sheet.js',
  './desktop-16-isolation-d3.js',
  './studionet16-ref.js',
  './desktop-17-net.js',
  './desktop-21-custom-filename.js',
  './desktop-19-driver-library.js',
  './desktop-20-malformed-frames.js',
  './desktop-18-spiralos-interop.js',
  './desktop-09-positive-controls.js',
  './desktop-10-static-scan.js',
  './desktop-11-browser.js'
];

const results = [];
let passed = 0, failed = 0, skipped = 0;

for (const s of suites) {
  try {
    const r = require(s).runTest();
    if (r && r.status === 'SKIPPED') {
      console.log('[SKIPPED]', r.name, r.reason || '');
      results.push(r);
      skipped++;
    } else {
      console.log('[PASS]', r.name, JSON.stringify(r));
      results.push(r);
      passed++;
    }
  } catch (e) {
    console.error('[FAIL]', s, e.message);
    results.push({ name: s, status: 'FAIL', error: e.message });
    failed++;
  }
}

console.log(JSON.stringify({ summary: { passed, failed, skipped, total: suites.length } }));
if (failed > 0 || skipped > 0) process.exit(1);
module.exports = { results, passed, failed, skipped };
