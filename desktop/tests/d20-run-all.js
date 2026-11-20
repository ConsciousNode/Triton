'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const SUITES = [
  'd20-01-tritfs-conformance.js',
  'd20-02-scale.js',
  'd20-03-power-cut.js',
  'd20-04-positive-controls.js',
  'd20-05-media-cartridge.js',
  'd20-06-legacy.js',
  'd20-07-no-regressions.js'
];

function runAll() {
  const results = [];
  let passed = 0;
  let failed = 0;
  for (const s of SUITES) {
    const p = path.join(__dirname, s);
    try {
      const out = execFileSync('node', [p], { cwd: path.resolve(__dirname, '..'), timeout: 120000 }).toString().trim();
      const lines = out.split('\n');
      const parsed = JSON.parse(lines[lines.length - 1]);
      console.log(`[PASS] ${s}: ${JSON.stringify(parsed)}`);
      results.push(parsed);
      passed++;
    } catch (e) {
      const msg = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : e.message);
      console.error(`[FAIL] ${s}: ${msg}`);
      results.push({ name: s, status: 'FAIL', error: msg });
      failed++;
    }
  }
  const summary = { passed, failed, total: SUITES.length };
  console.log(JSON.stringify({ summary, results }));
  if (failed > 0) process.exit(1);
}

if (require.main === module) runAll();
module.exports = { runAll };
