#!/usr/bin/env node
'use strict';

/**
 * Triton 4.0 Master Machine Test Runner (`tests/t4-run-all.js`)
 * ConsciousNode SoftWorks
 */

const path = require('path');
const { spawnSync } = require('child_process');

const SUITES = [
  't4-01-compat.js',
  't4-02-js-wasm.js',
  't4-03-ports-units.js',
  't4-04-timer-rtc.js',
  't4-05-fault-browser.js'
];

console.log('====================================================================');
console.log('TRITON 4.0 FULL MACHINE VERIFICATION SUITE (node tests/t4-run-all.js)');
console.log('====================================================================\n');

const t0 = Date.now();
let passed = 0, failed = 0, skipped = 0;

for (const file of SUITES) {
  const full = path.resolve(__dirname, file);
  const res = spawnSync(process.execPath, [full], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    env: process.env
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0) failed++;
  else if (/^SKIPPED:/m.test(res.stdout || '')) skipped++;
  else passed++;
}

console.log('\n====================================================================');
console.log(`TRITON 4.0 MACHINE SUITE SUMMARY: ${passed} passed, ${failed} failed, ${skipped} skipped (total ${SUITES.length}) in ${Date.now() - t0} ms`);
console.log('====================================================================');
process.exit(failed > 0 ? 1 : 0);
