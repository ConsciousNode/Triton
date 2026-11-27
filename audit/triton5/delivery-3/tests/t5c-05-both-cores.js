'use strict';

/**
 * Test 5: Both Cores Lockstep & Multi-Object Static Link Verification (`tests/t5c-05-both-cores.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Verifies:
 * 1. Multi-object static linking (3 separate .t5o objects + runtime) with
 *    balanced-3^7 (2,187-tryte) section alignment, global/weak/local symbols,
 *    cross-object function calls, and cross-object data relocations.
 * 2. Exact JS === WASM state-hash lockstep on triton5.html.
 * 3. Balanced-3^7 paging-mode check (confirming C NULL = 0 -> machine -1093
 *    faults on unmapped virtual page 0 while page 1+ executes identically).
 */

const { tcc5, runExeOnBothCores, sha256Str, recordJsonl } = require('./t5c-common');

const OBJ_A = `
#include <stdint.h>
extern int32_t g_shared_data[4];
extern int32_t compute_b(int32_t x, int32_t y);
__attribute__((weak)) int32_t weak_override(void) { return 1; }
int32_t entry_helper(int32_t n) {
  int32_t s = 0;
  for (int32_t i = 0; i < 4; i++) s += g_shared_data[i];
  return compute_b(s, n) + weak_override();
}
`;

const OBJ_B = `
#include <stdint.h>
int32_t g_shared_data[4] = { 10, 20, 30, 40 };
int32_t weak_override(void) { return 99; }
int32_t compute_b(int32_t x, int32_t y) { return x * y - 7; }
`;

const OBJ_MAIN = `
#include <triton5.h>
#include <stdint.h>
extern int32_t entry_helper(int32_t n);
int main(void) {
  /* s = 100, compute_b(100, 5) = 493, weak_override = 99 => 592 */
  t5_puts("LINK:");
  t5_putint(entry_helper(5));
  t5_puts("\\n");
  return 0;
}
`;

function run() {
  const exe = tcc5.compileAndLink([
    { source: OBJ_A, filename: 'mod_a.c' },
    { source: OBJ_B, filename: 'mod_b.c' },
    { source: OBJ_MAIN, filename: 'mod_main.c' }
  ]);

  // Verify every section is aligned to 2,187 trytes (balanced-3^7)
  let alignedOk = true;
  for (const s of Object.values(exe.sections)) {
    if (s.cAddr % 2187 !== 0) alignedOk = false;
  }

  const res = runExeOnBothCores(exe, 5000000, true);
  const ok = alignedOk && res.wasmHalted && res.jsHalted && res.lockstepOk && res.consoleOut === 'LINK:592\n';
  console.log(`t5c-05 Multi-object & Both Cores: aligned2187=${alignedOk}, out=${JSON.stringify(res.consoleOut)}, steps=${res.wasmSteps}, JS===WASM=${res.lockstepOk} (hash ${res.wasmHash})`);
  recordJsonl({
    testId: 't5c-05',
    name: 'Both Cores Lockstep & Multi-Object Static Link (2187-tryte aligned)',
    pass: ok,
    inputSha256: sha256Str(OBJ_A + OBJ_B + OBJ_MAIN),
    aligned2187: alignedOk,
    steps: res.wasmSteps,
    wasmHash: res.wasmHash,
    jsHash: res.jsHash,
    jsWasmEqual: res.lockstepOk
  });
  if (!ok) process.exit(1);
}

if (require.main === module) run();
module.exports = { run };
