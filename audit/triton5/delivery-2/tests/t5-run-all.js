#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Master Verification Runner (`tests/t5-run-all.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Runs all 9 Stage 1 suites (`t5-01`..`t5-09`) and all 6 Stage 2 suites
 * (`t5-10`..`t5-15`), writes `results.jsonl` (with code and input hashes),
 * regenerates `ISA-5.md` and `REPORT-5.md` programmatically.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT, RESULTS_PATH, sha256File } = require('./t5-common');

const SUITES = [
  // Stage 1 suites (unchanged)
  't5-01-compat.js',
  't5-02-lockstep.js',
  't5-03-paging-oracle.js',
  't5-04-binary-oracle.js',
  't5-05-restartability.js',
  't5-06-positive-controls.js',
  't5-07-atomics.js',
  't5-08-pagesize-bench.js',
  't5-09-browser.js',
  // Stage 2 suites (balanced-3^k MMU + three-design comparative measurements)
  't5-10-balanced-oracle.js',
  't5-11-balanced-null.js',
  't5-12-balanced-restart.js',
  't5-13-balanced-pos-controls.js',
  't5-14-all-designs-bench.js',
  't5-15-balanced-browser.js'
];

console.log('====================================================================');
console.log('TRITON 5.0 FULL VERIFICATION SUITE (Stage 1 + Stage 2: 15 suites)');
console.log('====================================================================\n');

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

const docRes = spawnSync(process.execPath, [path.resolve(__dirname, 't5-generate-docs.js')], {
  cwd: REPO_ROOT, encoding: 'utf8'
});
if (docRes.stdout) process.stdout.write(docRes.stdout);
if (docRes.stderr) process.stderr.write(docRes.stderr);

const genRes = spawnSync(process.execPath, [path.resolve(__dirname, 't5-generate-report.js')], {
  cwd: REPO_ROOT, encoding: 'utf8'
});
if (genRes.stdout) process.stdout.write(genRes.stdout);
if (genRes.stderr) process.stderr.write(genRes.stderr);

process.exit(failed > 0 || docRes.status !== 0 || genRes.status !== 0 ? 1 : 0);
