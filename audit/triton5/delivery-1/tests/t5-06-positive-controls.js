#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Test 6: Positive Controls (Mutants That Must Fail) (`tests/t5-06-positive-controls.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Constructs 4 isolated in-memory mutants of `triton5.html` (never modifying the
 * file on disk) and confirms EACH mutant is caught by the Triton 5 test suites:
 *   1. Mutant MMU that skips the User-bit (U) check -> caught by Paging Oracle (Test 3)
 *   2. Mutant MMU that never sets the Dirty (D) bit -> caught by Paging Oracle (Test 3)
 *   3. Mutant WRAPU that is off by one              -> caught by Binary Oracle (Test 4)
 *   4. Mutant BCOPY that restarts from beginning    -> caught by Restartability (Test 5)
 */

const fs = require('fs');
const path = require('path');
const {
  REPO_ROOT, loadMutatedHtmlModule, sha256Str, recordResult
} = require('./t5-common');
const { runPagingOracleTest } = require('./t5-03-paging-oracle');
const { runBinaryOracleTest } = require('./t5-04-binary-oracle');
const { runRestartabilityTest } = require('./t5-05-restartability');

function runPositiveControls() {
  const t0 = Date.now();
  const baseHtml = fs.readFileSync(path.join(REPO_ROOT, 'triton5.html'), 'utf8');

  function testMutant(name, patchFn, runnerFn) {
    const mutatedHtml = patchFn(baseHtml);
    if (mutatedHtml === baseHtml) {
      throw new Error(`[t5-06] Mutant '${name}' patch did not change source!`);
    }
    const Tm = loadMutatedHtmlModule(mutatedHtml);
    let caught = false;
    let errorMsg = '';
    try {
      runnerFn(Tm);
    } catch (err) {
      caught = true;
      errorMsg = err.message;
    }
    if (!caught) {
      throw new Error(`[t5-06] POSITIVE CONTROL FAILED: Mutant '${name}' was NOT caught!`);
    }
    return { mutant: name, caught: true, caughtByMessage: errorMsg.slice(0, 180) };
  }

  const results = [];

  // Mutant 1: MMU skips the user-bit (U) check in TritonJS translateAddrT5
  results.push(testMutant(
    'mmu_skip_user_bit',
    (src) => src
      .replaceAll('if (this.priv === 1 && !(e.flags & T5_PTE.U))', 'if (false && this.priv === 1 && !(e.flags & T5_PTE.U))')
      .replaceAll('if (this.priv === 1 && !(flags & T5_PTE.U))', 'if (false && this.priv === 1 && !(flags & T5_PTE.U))'),
    (Tm) => runPagingOracleTest(Tm, 2000)
  ));

  // Mutant 2: MMU never sets the dirty (D) bit
  results.push(testMutant(
    'mmu_never_set_dirty_bit',
    (src) => src
      .replace('if (accessType === 1 && setDirty) flags |= T5_PTE.D;', 'if (false && accessType === 1 && setDirty) flags |= T5_PTE.D;')
      .replace('if (accessType === 1 && setDirty && !(e.flags & T5_PTE.D))', 'if (false && accessType === 1 && setDirty && !(e.flags & T5_PTE.D))'),
    (Tm) => runPagingOracleTest(Tm, 2000)
  ));

  // Mutant 3: WRAPU off by one
  results.push(testMutant(
    'wrapu_off_by_one',
    (src) => src.replace(
      'return (u & ((1 << bits) - 1)) >>> 0;',
      'return (((u & ((1 << bits) - 1)) >>> 0) + 1);'
    ),
    (Tm) => runBinaryOracleTest(Tm, 100)
  ));

  // Mutant 4: BCOPY restarts from the beginning instead of resuming after a page fault
  // Simulated by making BCOPY decrement dst/src back by 1 and increment cnt by 1 on fault
  // (or resetting dst/src/cnt to initial values when a fault occurs midway through).
  results.push(testMutant(
    'bcopy_restarts_from_beginning',
    (src) => src.replace(
      'const val = this.checkReadTryteT3(src, fetchPc);\n        if (val === null) break;',
      'const val = this.checkReadTryteT3(src, fetchPc);\n        if (val === null) { this.setWordNum(rd, dst - 10); this.setWordNum(rs1, src - 10); this.setWordNum(rs2, cnt + 10); break; }'
    ),
    (Tm) => runRestartabilityTest(Tm)
  ));

  return {
    test: 6,
    name: 't5-06-positive-controls',
    status: 'PASS',
    inputHash: sha256Str('positive-controls:4-mutants'),
    mutantsCaught: results.length,
    results,
    elapsedMs: Date.now() - t0
  };
}

if (require.main === module) {
  const res = runPositiveControls();
  recordResult(res);
  console.log(`[PASS] t5-06-positive-controls: All ${res.mutantsCaught}/4 mutants caught (${res.results.map(r => r.mutant).join(', ')}) in ${res.elapsedMs} ms`);
}

module.exports = { runPositiveControls };
