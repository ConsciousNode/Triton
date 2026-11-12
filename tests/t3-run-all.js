#!/usr/bin/env node
'use strict';

/**
 * Triton 3.0 Master Test Runner (`tests/t3-run-all.js`)
 * ConsciousNode SoftWorks
 *
 * Runs all 11 `tests/t3-*.js` suites sequentially and prints the overall summary.
 */

const path = require('path');
const { execFileSync } = require('child_process');

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
  't3-11-browser.js'
];

console.log('====================================================================');
console.log('TRITON 3.0 FULL VERIFICATION SUITE (node tests/t3-run-all.js)');
console.log('====================================================================\n');

const t0 = Date.now();
for (const file of SUITES) {
  const full = path.resolve(__dirname, file);
  const out = execFileSync(process.execPath, [full], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  process.stdout.write(out);
}

console.log(`\n====================================================================`);
console.log(`ALL ${SUITES.length} TRITON 3.0 TEST SUITES PASSED IN ${Date.now() - t0} ms`);
console.log(`====================================================================`);
