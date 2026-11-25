#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Master Verification Runner (`tests/t5-run-all.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Runs all 9 numbered Triton 5 test suites, writes `results.jsonl` (with code
 * and input hashes), and generates `REPORT-5.md` directly from measured results.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT, RESULTS_PATH, sha256File } = require('./t5-common');

const SUITES = [
  't5-01-compat.js',
  't5-02-lockstep.js',
  't5-03-paging-oracle.js',
  't5-04-binary-oracle.js',
  't5-05-restartability.js',
  't5-06-positive-controls.js',
  't5-07-atomics.js',
  't5-08-pagesize-bench.js',
  't5-09-browser.js'
];

console.log('====================================================================');
console.log('TRITON 5.0 STAGE 1 VERIFICATION SUITE (node tests/t5-run-all.js)');
console.log('====================================================================\n');

// Reset results.jsonl before fresh run
fs.writeFileSync(RESULTS_PATH, '', 'utf8');

const t0 = Date.now();
let passed = 0, failed = 0;

for (const file of SUITES) {
  const full = path.resolve(__dirname, file);
  const res = spawnSync(process.execPath, [full], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { T5_WRITE_JSONL: '1' }),
    timeout: 600000
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0) {
    failed++;
    fs.appendFileSync(RESULTS_PATH, JSON.stringify({
      timestamp: new Date().toISOString(),
      codeSha256: sha256File(path.join(REPO_ROOT, 'triton5.html')),
      name: file.replace(/\.js$/, ''),
      status: 'FAIL',
      exitCode: res.status
    }) + '\n', 'utf8');
  } else {
    passed++;
  }
}

console.log('\n====================================================================');
console.log(`TRITON 5.0 SUITE SUMMARY: ${passed} passed, ${failed} failed (total ${SUITES.length}) in ${Date.now() - t0} ms`);
console.log('====================================================================');

// Generate REPORT-5.md from results.jsonl
const genRes = spawnSync(process.execPath, [path.resolve(__dirname, 't5-generate-report.js')], {
  cwd: REPO_ROOT, encoding: 'utf8'
});
if (genRes.stdout) process.stdout.write(genRes.stdout);
if (genRes.stderr) process.stderr.write(genRes.stderr);

process.exit(failed > 0 || genRes.status !== 0 ? 1 : 0);
