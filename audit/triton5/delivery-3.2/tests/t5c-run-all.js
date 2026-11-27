#!/usr/bin/env node
'use strict';

/**
 * Master Test Runner for Triton 5 Stage 3 (`tests/t5c-run-all.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Runs Tests 1..9 sequentially, recording a fresh `results.jsonl` with code and
 * input SHA-256 hashes for every suite.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const RESULTS_PATH = path.join(REPO_ROOT, 'results.jsonl');

// Reset results.jsonl for this full run
fs.writeFileSync(RESULTS_PATH, '', 'utf8');

const SUITES = [
  ['t5c-01', 'tests/t5c-01-conformance.js'],
  ['t5c-02', 'tests/t5c-02-diff-gcc.js'],
  ['t5c-03', 'tests/t5c-03-softfp.js'],
  ['t5c-04', 'tests/t5c-04-int64.js'],
  ['t5c-05', 'tests/t5c-05-both-cores.js'],
  ['t5c-06', 'tests/t5c-06-selfhost.js'],
  ['t5c-07', 'tests/t5c-07-gnu-ext.js'],
  ['t5c-08', 'tests/t5c-08-positive-controls.js'],
  ['t5c-09', 'tests/t5c-09-browser.js']
];

const env = Object.assign({}, process.env, {
  T5C_WRITE_JSONL: '1',
  T5C_DIFF_COUNT: process.env.T5C_DIFF_COUNT || '10000',
  T5C_FP_GUEST_N: process.env.T5C_FP_GUEST_N || '200',
  T5C_I64_GUEST_N: process.env.T5C_I64_GUEST_N || '500'
});

const t0 = Date.now();
for (const [id, rel] of SUITES) {
  console.log(`\n=== Running ${id} (${rel}) ===`);
  execFileSync(process.execPath, [path.join(REPO_ROOT, rel)], {
    cwd: REPO_ROOT,
    env,
    stdio: 'inherit'
  });
}

const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
const lines = fs.readFileSync(RESULTS_PATH, 'utf8').trim().split('\n');
console.log(`\nALL ${SUITES.length} SUITES PASSED in ${totalSec}s (${lines.length} entries recorded in results.jsonl)`);
