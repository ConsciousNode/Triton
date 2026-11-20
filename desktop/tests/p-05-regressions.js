'use strict';
/**
 * p-05: Regression suite runner.
 * Runs all existing Desktop 2.0 suites (d20-01..07, including the 20 desktop 1.1.2
 * regressions inside d20-07) and records the summary and log.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { desktopDir, appendResult } = require('./p-common.js');

function runTest() {
  const t0 = Date.now();
  const out = execFileSync('node', [path.join(__dirname, 'd20-run-all.js')], {
    cwd: desktopDir,
    encoding: 'utf8',
    timeout: 600000
  });
  const logPath = path.join(desktopDir, 'tests', 'd20-test-results-2.0.1.log');
  fs.writeFileSync(logPath, out, 'utf8');

  const lines = out.trim().split('\n');
  const last = JSON.parse(lines[lines.length - 1]);
  const { passed, failed, total } = last.summary;
  if (failed !== 0 || passed !== total) {
    throw new Error(`d20 regressions failed: ${passed}/${total} passed, ${failed} failed`);
  }

  const numbers = {
    d20Passed: passed,
    d20Failed: failed,
    d20Total: total,
    elapsedMs: Date.now() - t0
  };
  appendResult({ testId: 'p-05', backend: 'TritonWASM+JS', seed: 0, pass: true, numbers });
  return { name: 'p-05-regressions', status: 'PASS', ...numbers };
}

if (require.main === module) {
  console.log(JSON.stringify(runTest()));
}
module.exports = { runTest };
