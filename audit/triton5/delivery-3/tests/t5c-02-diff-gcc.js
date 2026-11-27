'use strict';

/**
 * Test 2: Differential Testing Against Host GCC (`tests/t5c-02-diff-gcc.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * From-scratch random well-defined C11 program generator (in the spirit of Csmith).
 * Guarantees zero undefined or unspecified behaviour by:
 *   1. Explicit sequence points (one side-effect per statement).
 *   2. Safe division/modulo wrappers guarding divisor == 0 and INT_MIN / -1.
 *   3. Masked shift counts (0..31 for 32-bit, 0..63 for 64-bit) on unsigned operands.
 *   4. Unsigned modular arithmetic for all generated additions/subtractions/multiplies
 *      before signed reinterpretation, eliminating signed integer overflow UB.
 *   5. All variables initialized at declaration; all array indices masked in bounds.
 *
 * Runs 10,000 seeded programs (100 batches x 100 independent programs) on:
 *   - Host GCC (native reference)
 *   - tcc5 -> TritonWASM
 *   - tcc5 -> TritonJS (verifying JS === WASM state hashes on every batch)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { tcc5, makeRng, runExeOnBothCores, sha256Str, recordJsonl } = require('./t5c-common');

const TOTAL_PROGRAMS = parseInt(process.env.T5C_DIFF_COUNT || '10000', 10);
const BATCH_SIZE = 100;

function generateWellDefinedProg(seed) {
  let _s = (seed ^ 0x9E3779B9) >>> 0; if (_s === 0) _s = 1; const rng = () => { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; return _s >>> 0; };
  const ri = (lo, hi) => lo + (rng() % (hi - lo + 1));

  const initA = rng();
  const initB = rng();
  const initC = rng();
  const initD = rng();
  const init64Lo = rng();
  const init64Hi = rng();
  const s1 = ri(-1000, 1000);
  const s2 = ri(-1000, 1000);
  const s3 = ri(-1000, 1000);
  const loopN = ri(2, 6);

  const ops32 = ['+', '-', '*', '&', '|', '^'];
  const lines = [];
  lines.push(`static uint32_t prog_${seed}(void) {`);
  lines.push(`  uint32_t a = ${initA}U, b = ${initB}U, c = ${initC}U, d = ${initD}U;`);
  lines.push(`  int32_t sa = (int32_t)a, sb = (int32_t)b;`);
  lines.push(`  uint64_t x64 = ((uint64_t)${init64Hi}U << 32) | (uint64_t)${init64Lo}U;`);
  lines.push(`  uint32_t arr[4] = { a, b, c, d };`);
  lines.push(`  struct DiffS st = { ${s1}, ${s2}, ${s3} };`);
  lines.push(`  st = diff_mix(st, (int32_t)(a & 255U));`);
  lines.push(`  a = (uint32_t)(a + (uint32_t)st.x + (uint32_t)st.y + (uint32_t)st.z);`);

  // Generate 6 random well-defined statements
  for (let k = 0; k < 6; k++) {
    const kind = ri(0, 7);
    const dst = ['a', 'b', 'c', 'd'][ri(0, 3)];
    const src1 = ['a', 'b', 'c', 'd'][ri(0, 3)];
    const src2 = ['a', 'b', 'c', 'd'][ri(0, 3)];
    if (kind === 0) {
      const op = ops32[ri(0, ops32.length - 1)];
      lines.push(`  ${dst} = ${src1} ${op} ${src2};`);
    } else if (kind === 1) {
      const sh = ri(0, 31);
      const dir = ri(0, 1) ? '<<' : '>>';
      lines.push(`  ${dst} = ${src1} ${dir} ${sh}U;`);
    } else if (kind === 2) {
      const sh = ri(0, 31);
      lines.push(`  sa = (int32_t)${src1}; ${dst} = (uint32_t)(sa >> ${sh});`);
    } else if (kind === 3) {
      lines.push(`  ${dst} = safe_udiv(${src1}, ${src2}) ^ safe_umod(${src2}, ${src1});`);
    } else if (kind === 4) {
      lines.push(`  sa = (int32_t)${src1}; sb = (int32_t)${src2}; ${dst} = (uint32_t)safe_sdiv(sa, sb);`);
    } else if (kind === 5) {
      const idx = ri(0, 3);
      lines.push(`  arr[${idx}] = arr[(${src1}) & 3U] + ${src2}; ${dst} ^= arr[${idx}];`);
    } else if (kind === 6) {
      const sh64 = ri(0, 63);
      lines.push(`  x64 = (x64 + (uint64_t)${src1}) ^ ((uint64_t)${src2} << ${sh64 % 32}); ${dst} ^= (uint32_t)(x64 >> 32) ^ (uint32_t)x64;`);
    } else {
      lines.push(`  switch (${src1} & 3U) { case 0: ${dst} += ${src2}; break; case 1: ${dst} -= ${src2}; break; case 2: ${dst} ^= ~${src2}; break; default: ${dst} = (${dst} < ${src2}) ? ${src2} : ${dst}; break; }`);
    }
  }

  lines.push(`  for (uint32_t i = 0; i < ${loopN}U; i++) {`);
  lines.push(`    a = (a * 1664525U + 1013904223U) ^ arr[i & 3U];`);
  lines.push(`    b = (b >> 3) | (b << 29);`);
  lines.push(`    arr[i & 3U] = a ^ b;`);
  lines.push(`  }`);

  // FNV-1a checksum of all state
  lines.push(`  uint32_t h = 2166136261U;`);
  lines.push(`  h = (h ^ a) * 16777619U;`);
  lines.push(`  h = (h ^ b) * 16777619U;`);
  lines.push(`  h = (h ^ c) * 16777619U;`);
  lines.push(`  h = (h ^ d) * 16777619U;`);
  lines.push(`  h = (h ^ (uint32_t)x64) * 16777619U;`);
  lines.push(`  h = (h ^ (uint32_t)(x64 >> 32)) * 16777619U;`);
  lines.push(`  h = (h ^ arr[0] ^ arr[1] ^ arr[2] ^ arr[3]) * 16777619U;`);
  lines.push(`  h = (h ^ (uint32_t)st.z) * 16777619U;`);
  lines.push(`  return h;`);
  lines.push(`}`);
  return lines.join('\n');
}

function buildBatchSource(startSeed, count, forHostGcc) {
  const header = forHostGcc
    ? `#include <stdio.h>\n#include <stdint.h>\nstatic void out_hex(uint32_t v) { printf("%08x\\n", v); }\n`
    : `#include <triton5.h>\n#include <stdint.h>\nstatic void out_hex(uint32_t v) { t5_puthex32(v); t5_putchar('\\n'); }\n`;

  const helpers = `
struct DiffS { int32_t x; int32_t y; int32_t z; };
static struct DiffS diff_mix(struct DiffS s, int32_t k) {
  struct DiffS r;
  r.x = (int32_t)((uint32_t)s.x + (uint32_t)k);
  r.y = (int32_t)((uint32_t)s.y ^ (uint32_t)s.x);
  r.z = (int32_t)((uint32_t)s.z - (uint32_t)s.y + (uint32_t)k);
  return r;
}
static uint32_t safe_udiv(uint32_t a, uint32_t b) { return b == 0U ? a : (a / b); }
static uint32_t safe_umod(uint32_t a, uint32_t b) { return b == 0U ? a : (a % b); }
static int32_t safe_sdiv(int32_t a, int32_t b) {
  if (b == 0 || (a == (-2147483647 - 1) && b == -1)) return a;
  return a / b;
}
`;

  const progs = [];
  const calls = [];
  for (let i = 0; i < count; i++) {
    const seed = startSeed + i;
    progs.push(generateWellDefinedProg(seed));
    calls.push(`  out_hex(prog_${seed}());`);
  }

  return `${header}\n${helpers}\n${progs.join('\n')}\nint main(void) {\n${calls.join('\n')}\n  return 0;\n}\n`;
}

function run() {
  const tmpDir = fs.mkdtempSync(path.join(__dirname, '..', '.tmp-t5c-diff-'));
  const numBatches = Math.ceil(TOTAL_PROGRAMS / BATCH_SIZE);
  let matched = 0;
  let lockstepBatches = 0;
  let totalCompileMs = 0;
  let totalWasmMs = 0;
  let totalJsMs = 0;
  let totalGccMs = 0;
  let totalWasmSteps = 0;

  const tStart = Date.now();
  try {
    for (let b = 0; b < numBatches; b++) {
      const startSeed = b * BATCH_SIZE + 1;
      const count = Math.min(BATCH_SIZE, TOTAL_PROGRAMS - b * BATCH_SIZE);

      // 1. Host GCC reference
      const gccSrc = buildBatchSource(startSeed, count, true);
      const cPath = path.join(tmpDir, `b${b}.c`);
      const binPath = path.join(tmpDir, `b${b}`);
      fs.writeFileSync(cPath, gccSrc, 'utf8');
      const tg0 = Date.now();
      execFileSync('gcc', ['-O1', '-std=c11', '-w', cPath, '-o', binPath]);
      const gccOut = execFileSync(binPath, { encoding: 'utf8' });
      totalGccMs += Date.now() - tg0;

      // 2. tcc5 + TritonWASM + TritonJS
      const t5Src = buildBatchSource(startSeed, count, false);
      const tc0 = Date.now();
      const exe = tcc5.compileAndLink([{ source: t5Src, filename: `diff_b${b}.c` }]);
      totalCompileMs += Date.now() - tc0;

      const res = runExeOnBothCores(exe, 50000000, true);
      totalWasmMs += res.wasmMs;
      totalJsMs += res.jsMs;
      totalWasmSteps += res.wasmSteps;
      if (res.lockstepOk) lockstepBatches++;

      const gccLines = gccOut.trim().split('\n');
      const t5Lines = res.consoleOut.trim().split('\n');
      if (gccLines.length !== count || t5Lines.length !== count || !res.lockstepOk) {
        console.error(`FAIL batch ${b} (seeds ${startSeed}..${startSeed + count - 1}): gccLines=${gccLines.length} t5Lines=${t5Lines.length} lockstep=${res.lockstepOk}`);
        process.exit(1);
      }
      for (let i = 0; i < count; i++) {
        if (gccLines[i] !== t5Lines[i]) {
          console.error(`MISMATCH seed ${startSeed + i}: GCC=${gccLines[i]} vs tcc5=${t5Lines[i]}`);
          process.exit(1);
        }
        matched++;
      }
      if ((b + 1) % 20 === 0 || b === numBatches - 1) {
        console.log(`Differential progress: ${matched}/${TOTAL_PROGRAMS} matched (batches=${b + 1}/${numBatches}, JS===WASM=${lockstepBatches}/${b + 1}, elapsed=${((Date.now() - tStart) / 1000).toFixed(1)}s)`);
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const allOk = matched === TOTAL_PROGRAMS && lockstepBatches === numBatches;
  recordJsonl({
    testId: 't5c-02',
    name: 'Differential vs Host GCC',
    pass: allOk,
    inputSha256: sha256Str(`diff-seeds-1..${TOTAL_PROGRAMS}-batch${BATCH_SIZE}`),
    matched,
    total: TOTAL_PROGRAMS,
    batches: numBatches,
    jsWasmEqual: lockstepBatches === numBatches,
    compileMs: totalCompileMs,
    gccMs: totalGccMs,
    wasmMs: totalWasmMs,
    jsMs: totalJsMs,
    totalSteps: totalWasmSteps
  });
  console.log(`PASS t5c-02 Differential: ${matched}/${TOTAL_PROGRAMS} exact matches vs GCC, JS===WASM=${lockstepBatches === numBatches}`);
}

if (require.main === module) run();
module.exports = { run, generateWellDefinedProg, buildBatchSource };
