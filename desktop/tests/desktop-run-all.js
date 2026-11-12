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
  './desktop-09-positive-controls.js',
  './desktop-10-static-scan.js',
  './desktop-11-browser.js'
];
const results = [];
let failed = 0;
for (const s of suites) {
  try {
    const r = require(s).runTest();
    console.log('[PASS]', r.name, JSON.stringify(r));
    results.push(r);
  } catch (e) {
    console.error('[FAIL]', s, e.message);
    results.push({ name: s, status: 'FAIL', error: e.message });
    failed++;
  }
}
if (failed > 0) process.exit(1);
module.exports = { results };
