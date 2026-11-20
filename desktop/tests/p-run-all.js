'use strict';
/**
 * TritOS Desktop 2.0.1 Test Runner (p-01..p-07).
 * Clears desktop/results.jsonl and executes p-01..p-07 in order,
 * writing a full log to desktop/tests/p-test-results.log.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { desktopDir, resultsPath } = require('./p-common.js');

const SUITES = [
  'p-01-pointer-probes.js',
  'p-02-coverage.js',
  'p-03-positive-control.js',
  'p-04-docs.js',
  'p-05-regressions.js',
  'p-06-builds.js',
  'p-07-real-browser.js'
];

function runAll() {
  if (fs.existsSync(resultsPath)) fs.unlinkSync(resultsPath);
  const logLines = [];
  const results = [];
  let passed = 0;
  let failed = 0;

  for (const s of SUITES) {
    const p = path.join(__dirname, s);
    try {
      const out = execFileSync('node', [p], {
        cwd: desktopDir,
        encoding: 'utf8',
        timeout: 600000
      }).trim();
      const lines = out.split('\n');
      const parsed = JSON.parse(lines[lines.length - 1]);
      const line = `[PASS] ${s}: ${JSON.stringify(parsed)}`;
      console.log(line);
      logLines.push(line);
      results.push(parsed);
      passed++;
    } catch (e) {
      const msg = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : e.message);
      const line = `[FAIL] ${s}: ${msg}`;
      console.error(line);
      logLines.push(line);
      results.push({ name: s, status: 'FAIL', error: msg });
      failed++;
    }
  }

  const summary = { passed, failed, total: SUITES.length };
  const sumLine = JSON.stringify({ summary, results });
  console.log(sumLine);
  logLines.push(sumLine);
  fs.writeFileSync(path.join(__dirname, 'p-test-results.log'), logLines.join('\n') + '\n', 'utf8');
  if (failed > 0) process.exit(1);
}

if (require.main === module) runAll();
module.exports = { runAll };
