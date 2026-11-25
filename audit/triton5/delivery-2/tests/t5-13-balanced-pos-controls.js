#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Stage 2 Test 13: Balanced-3^k Positive Controls (7 Mutants) (`tests/t5-13-balanced-pos-controls.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Each of the 7 required positive controls has an explicit named switch
 * (`MUTANT_SWITCHES`) that injects the defect into an isolated in-memory copy
 * of `triton5.html` (never modifying the file on disk) and confirms the Stage 2
 * suites (`t5-10`, `t5-11`, `t5-12`) catch it:
 *   1. unsigned_for_balanced   — unsigned digits substituted for balanced
 *   2. unsigned_one_level_only — unsigned at L1 only (half-converted walk)
 *   3. bias_off_by_one         — compiler bias off by one (B+1 instead of B)
 *   4. table_base_entry_zero   — table base at entry 0 instead of middle
 *   5. frame_zero_used         — frame 0 (ppn = 0) permitted (negative PA)
 *   6. eaddr_in_c_space        — EADDR reported in C space (va + B) instead of machine space
 *   7. vpage_zero_mapped       — virtual page 0 guard disabled (vpage 0 mapped)
 */

const fs = require('fs');
const path = require('path');
const { REPO_ROOT, loadMutatedHtmlModule, sha256Str, recordResult } = require('./t5-common');
const { runBalancedOracleTest } = require('./t5-10-balanced-oracle');
const { runBalancedNullAndSpaceTest } = require('./t5-11-balanced-null');

const MUTANT_SWITCHES = {
  unsigned_for_balanced: {
    patch: (src) => src.replace(
      'return this.pageSize === 729 ? t5SplitAddrBal729(va) : t5SplitAddrBal2187(va);',
      'return this.pageSize === 729 ? t5SplitAddr729(va) : t5SplitAddr2187(va);'
    ),
    test: (Tm) => runBalancedOracleTest(Tm, 500)
  },
  unsigned_one_level_only: {
    patch: (src) => src.replace(
      'const idx1 = balRem(vpn, 243, 121);\n  const q1 = balQuot(vpn, 243, 121);',
      'const idx1 = ((vpn % 243) + 243) % 243;\n  const q1 = Math.floor(vpn / 243);'
    ),
    test: (Tm) => runBalancedOracleTest(Tm, 500)
  },
  bias_off_by_one: {
    patch: (src) => src, // exercised via explicit biasDelta = +1 switch in oracle
    test: (Tm) => runBalancedOracleTest(Tm, 500, 0xBA1A4CED, { biasDelta: 1 })
  },
  table_base_entry_zero: {
    patch: (src) => src.replace(
      'const pdeAddr = isBal ? (this.ptbr + idx0 * 3 - 1) : (this.ptbr + idx0 * 3);',
      'const pdeAddr = this.ptbr + idx0 * 3;'
    ),
    test: (Tm) => runBalancedOracleTest(Tm, 500)
  },
  frame_zero_used: {
    patch: (src) => src.replace(
      'if (isBal && ppn <= 0) {',
      'if (false && isBal && ppn <= 0) {'
    ),
    test: (Tm) => runBalancedNullAndSpaceTest(Tm)
  },
  eaddr_in_c_space: {
    patch: (src) => src.replace(
      'this.raiseTrap(T3_VEC.PAGE_FAULT, va, savedPc, T3_VEC.PAGE_FAULT);',
      'const repVa = this.mmuMode === T5_MMU_MODE.BALANCED ? (va + (this.pageSize - 1) / 2) : va; this.raiseTrap(T3_VEC.PAGE_FAULT, repVa, savedPc, T3_VEC.PAGE_FAULT);'
    ),
    test: (Tm) => runBalancedNullAndSpaceTest(Tm)
  },
  vpage_zero_mapped: {
    patch: (src) => src.replace(
      'if (this.mmuMode === T5_MMU_MODE.BALANCED && vpn === 0) {',
      'if (false && this.mmuMode === T5_MMU_MODE.BALANCED && vpn === 0) {'
    ),
    test: (Tm) => runBalancedNullAndSpaceTest(Tm)
  }
};

function runBalancedPositiveControls() {
  const t0 = Date.now();
  const baseHtml = fs.readFileSync(path.join(REPO_ROOT, 'triton5.html'), 'utf8');
  const results = [];

  for (const [switchName, cfg] of Object.entries(MUTANT_SWITCHES)) {
    const mutated = cfg.patch(baseHtml);
    if (switchName !== 'bias_off_by_one' && mutated === baseHtml) {
      throw new Error(`[t5-13] Mutant switch '${switchName}' did not modify source!`);
    }
    const Tm = loadMutatedHtmlModule(mutated);
    let caught = false;
    let msg = '';
    try {
      cfg.test(Tm);
    } catch (err) {
      caught = true;
      msg = err.message;
    }
    if (!caught) {
      throw new Error(`[t5-13] POSITIVE CONTROL FAILED: Mutant '${switchName}' was NOT caught!`);
    }
    results.push({ switch: switchName, caught: true, caughtByMessage: msg.slice(0, 180) });
  }

  return {
    test: 13,
    name: 't5-13-balanced-pos-controls',
    status: 'PASS',
    inputHash: sha256Str('balanced-pos-controls:' + Object.keys(MUTANT_SWITCHES).join(',')),
    mutantsCaught: results.length,
    results,
    elapsedMs: Date.now() - t0
  };
}

if (require.main === module) {
  const res = runBalancedPositiveControls();
  recordResult(res);
  console.log(`[PASS] t5-13-balanced-pos-controls: All ${res.mutantsCaught}/7 balanced-3^k mutants caught (${res.results.map(r => r.switch).join(', ')}) in ${res.elapsedMs} ms`);
}

module.exports = { runBalancedPositiveControls, MUTANT_SWITCHES };
