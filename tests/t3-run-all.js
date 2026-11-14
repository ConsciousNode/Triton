#!/usr/bin/env node
'use strict';

/**
 * Triton 3.1.1 Master Test Runner (`tests/t3-run-all.js`)
 * ConsciousNode SoftWorks
 *
 * Runs all 12 `tests/t3-*.js` suites sequentially and reports passed / failed / skipped
 * counts. A skipped suite (printing `SKIPPED: <reason>`) is never reported as passed.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const SUITES = [
  't3-01-oracle.js',
  't3-02-fuzz.js',
  't3-03-t2compat.js',
  't3-04-protection.js',
  't3-05-interrupts.js',
  't3-06-disk.js',
  't3-07-selfhost.js',
  't3-08-devices.js',
  't3-09-state.js',
  't3-10-static.js',
  't3-11-browser.js',
  't3-12-input-queues.js'
];

console.log('====================================================================');
console.log('TRITON 3.1.1 FULL VERIFICATION SUITE (node tests/t3-run-all.js)');
console.log('====================================================================\n');

const t0 = Date.now();
let passed = 0;
let failed = 0;
let skipped = 0;

for (const file of SUITES) {
  const full = path.resolve(__dirname, file);
  const res = spawnSync(process.execPath, [full], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    env: process.env
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);

  if (res.status !== 0) {
    failed++;
  } else if (/^SKIPPED:/m.test(res.stdout || '')) {
    skipped++;
  } else {
    passed++;
  }
}

console.log(`\n====================================================================`);
console.log(`TRITON 3.1.1 SUITE SUMMARY: ${passed} passed, ${failed} failed, ${skipped} skipped (total ${SUITES.length}) in ${Date.now() - t0} ms`);
console.log(`====================================================================`);

process.exit(failed > 0 ? 1 : 0);
