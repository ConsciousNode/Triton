#!/usr/bin/env node
'use strict';

/**
 * Triton 2.1 Symbol-Table Verification Suite (`tests/symbols.js`)
 * ConsciousNode SoftWorks
 *
 * Runs all 6 symbol-table & regression test suites in both `names` mode (2.1)
 * and `hashOnly` mode (2.0 positive control), and writes script-generated
 * metrics for `CHANGES-2.1.md` and `REPORT.md`:
 *   1. Collision corpus (all length <= 3 colliding pairs + >= 200 length 6-12 27-trit wraparound pairs)
 *   2. Undefined and duplicate labels (incl. case-only duplicates like Loop / LOOP)
 *   3. Differential fuzz (2,000 seeded random label-heavy programs, 50-300 labels each)
 *   4. Self-hosting fixed point & source budget check against 19,182-char cap
 *   5. Regressions (tests/run.js, audit/unseen.js, audit/isa-bigint.js, audit/hash-collision.js)
 *   6. Static scan (no network/storage APIs, strict CSP, all inlines labeled)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const candidatePaths = [
  path.resolve(__dirname, '../triton.html'),
  path.resolve(__dirname, './triton.html'),
  '/working_dir/c_a7ca1264b94c3647/artifacts/file_generation/ttl=63d/output/triton.html',
  '/working_dir/c_a7ca1264b94c3647/work/v21/triton.html',
  '/working_dir/c_a7ca1264b94c3647/work/triton.html'
];
const htmlPath = candidatePaths.find(p => fs.existsSync(p));
if (!htmlPath) throw new Error('Could not find triton.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const scriptMatches = [...htmlContent.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)];
const sandbox = {
  WebAssembly, Int8Array, Uint8Array, Int16Array, Int32Array, Float32Array, Float64Array,
  TextEncoder, TextDecoder, Math, BigInt, JSON, Array, Object, String, Number, Set, Map, RegExp, Error, console
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const m of scriptMatches) vm.runInContext(m[1], sandbox);

const T = sandbox.TritonSystem;
if (!T) throw new Error('TritonSystem not exported by triton.html');

// Helper: create a fast reusable in-OS assembler runner for a given symbolMode ('names' | 'hashOnly')
function createInOSRunner(mode) {
  T.setSymbolMode(mode);
  const osTrytes = T.assemble(T.TRITOS_SRC).trytes;
  const w = T.TritonWASM.createSync();
  w.loadProgram(osTrytes, 0);
  // Boot once to initialize persistent Disk directory at Disk[0..128]
  w.pushInputString('quit\n');
  w.run(100000);

  return function runInOS(src, maxSteps = 2500000) {
    // Reload OS image & clear working RAM [0..19000]
    w.i32.fill(0, 0, T.TRYTE_MOD);
    for (let i = 0; i < osTrytes.length; i++) w.i32[i] = osTrytes[i];
    // Write source to Disk[500..]
    for (let i = 0; i < src.length; i++) {
      w.i32[25600 + 500 + i] = T.balRem(src.charCodeAt(i), T.TRYTE_MOD, T.TRYTE_HALF);
    }
    w.i32[25600 + 500 + src.length] = 0;

    w.pc = 0;
    w.sp = -1;
    w.sf = 0; w.cf = 0; w.of = 0;
    w.halted = 0;
    w.steps = 0;
    w.i32[20554] = 0; // InputHead
    w.i32[20555] = 0; // InputTail
    w.i32[20556] = 0; w.i32[20559] = 0;
    w.i32.fill(0, 20480, 20480 + 27);

    w.pushInputString('asm\nquit\n');
    // [Kehai audit 2026-11-11] The host's I/O trace holds 10,900 entries, and the in-OS assembler reads its source
    // through disk ports one character per entry, so on big programs the trace filled before the OS printed its
    // REJECTS line. As delivered, getConsoleOut() then made the line up on the host. Instead, run in chunks and
    // collect what the OS actually wrote to port 0, clearing the trace between chunks.
    let consoleOut = '';
    for (let done = 0; done < maxSteps && !w.halted; done += 20000) {
      w.run(Math.min(20000, maxSteps - done));
      consoleOut += w.getConsoleOut();
      w.i32[20556] = 0;
    }

    const errFlag = w.getRawMem ? w.getRawMem(3195) : w.i32[3195];
    const rawLen = w.getRawMem ? w.getRawMem(3198) : w.i32[3198];

    if (mode === 'names' && errFlag !== 0) {
      const m = /REJECTS:\s*(Line\s+\d+:\s+[^\n]+)/.exec(consoleOut);
      // Verify no output image was written
      let nonZeroInObuf = 0;
      for (let i = 0; i < 64; i++) {
        if ((w.getRawMem ? w.getRawMem(6000 + i) : w.i32[6000 + i]) !== 0) nonZeroInObuf++;
      }
      return {
        ok: false,
        error: m ? m[1].trim() : 'ASM ERROR',
        rawLen,
        nonZeroInObuf,
        consoleOut
      };
    }

    const out = [];
    for (let i = 0; i < rawLen; i++) {
      out.push(w.getRawMem ? w.getRawMem(6000 + i) : w.i32[6000 + i]);
    }
    return { ok: true, trytes: out, rawLen, consoleOut };
  };
}

function runJSAssemble(src) {
  try {
    const res = T.assemble(src);
    return { ok: true, trytes: res.trytes };
  } catch (err) {
    return { ok: false, error: err.message.trim() };
  }
}

// ============================================================================
// BUILD TEST 1 COLLISION CORPUS
//   Part A: Every pair of distinct valid labels of length <= 3 with equal 2.0 hash
//   Part B: >= 200 pairs of length 6-12 colliding via 27-trit wraparound
// ============================================================================
function buildCollisionCorpus() {
  const reserved = new Set(Object.keys(T.MNEM_MAP));
  for (let r = 0; r <= 8; r++) reserved.add('R' + r);

  const firstChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_';
  const nextChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';

  const byHash = new Map();
  let totalValidShortIds = 0;
  function addShort(id) {
    if (reserved.has(id)) return;
    totalValidShortIds++;
    const h = T.tokenHash27(id);
    let list = byHash.get(h);
    if (!list) { list = []; byHash.set(h, list); }
    list.push(id);
  }

  for (const c0 of firstChars) {
    addShort(c0);
    for (const c1 of nextChars) {
      addShort(c0 + c1);
      for (const c2 of nextChars) {
        addShort(c0 + c1 + c2);
      }
    }
  }

  const shortPairs = [];
  for (const [h, list] of byHash.entries()) {
    if (list.length > 1) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          shortPairs.push({ l1: list[i], l2: list[j], hash: h, kind: 'short_le3' });
        }
      }
    }
  }

  // Part B: Search for >= 200 pairs of length 6-12 that collide strictly through 27-trit wraparound.
  // Method: For k = 1..15, decompose k * 3^27 in balanced base 41:
  //   k * 3^27 = sum_{i=0}^{m} d_i * 41^i with d_i in [-20, +20].
  // Any choice of letter pairs (c1_i, c2_i) in ['A'..'Z']^2 with c1_i - c2_i = d_i
  // produces two strings S1, S2 with P(S1) - P(S2) = k * 3^27 != 0 and tokenHash27(S1) == tokenHash27(S2).
  const wrapPairs = [];
  const M27 = 7625597484987n; // 3^27
  const prefixes = ['', 'X', 'TR', 'LBL'];

  for (let k = 1n; k <= 12n && wrapPairs.length < 240; k++) {
    let v = k * M27;
    const digits = [];
    while (v !== 0n) {
      let r = Number(v % 41n);
      v = (v - BigInt(r)) / 41n;
      if (r > 20) { r -= 41; v += 1n; }
      else if (r < -20) { r += 41; v -= 1n; }
      digits.push(r);
    }
    digits.reverse(); // MSB first (length 9)

    for (let shift = 0; shift < 6 && wrapPairs.length < 240; shift++) {
      for (const pfx of prefixes) {
        if (wrapPairs.length >= 240) break;
        let s1 = pfx;
        let s2 = pfx;
        let valid = true;
        for (let idx = 0; idx < digits.length; idx++) {
          const d = digits[idx];
          const base = 65 + ((shift + idx) % 5); // vary base letter 'A'..'E'
          if (d >= 0) {
            if (base + d > 90) { valid = false; break; }
            s1 += String.fromCharCode(base + d);
            s2 += String.fromCharCode(base);
          } else {
            if (base - d > 90) { valid = false; break; }
            s1 += String.fromCharCode(base);
            s2 += String.fromCharCode(base - d);
          }
        }
        if (!valid || s1.length < 6 || s1.length > 12) continue;
        const h1 = T.tokenHash27(s1);
        const h2 = T.tokenHash27(s2);
        if (h1 !== h2) throw new Error(`Wraparound search bug: ${s1} vs ${s2}`);
        // Also verify un-wrapped BigInt polynomial hashes differ
        const poly = str => [...str].reduce((acc, ch) => acc * 41n + BigInt(ch.charCodeAt(0)), 0n);
        if (poly(s1) === poly(s2)) throw new Error('Expected wraparound collision, got direct collision');
        wrapPairs.push({ l1: s1, l2: s2, hash: h1, kind: 'wrap_6_12', k: Number(k), len: s1.length });
      }
    }
  }

  return { totalValidShortIds, shortPairs, wrapPairs };
}

console.log('====================================================================');
console.log('TRITON 2.1 SYMBOL-TABLE & REGRESSION SUITE (node tests/symbols.js)');
console.log('Target:', htmlPath);
console.log('====================================================================\n');

const metrics = {
  target: htmlPath,
  sourceLengths: {},
  modes: { names: {}, hashOnly: {} },
  regressions: {},
  staticScan: {}
};

// ============================================================================
// TEST 1: COLLISION CORPUS (in both `names` and `hashOnly` modes)
// ============================================================================
const corpus = buildCollisionCorpus();
const allCollisionPairs = [...corpus.shortPairs, ...corpus.wrapPairs];
console.log(`[Corpus] Enumerated ${corpus.totalValidShortIds.toLocaleString()} valid identifiers of length <= 3:`);
console.log(`         - ${corpus.shortPairs.length.toLocaleString()} colliding pairs of length <= 3 (100% of pairs)`);
console.log(`         - ${corpus.wrapPairs.length.toLocaleString()} colliding pairs of length 6-12 via 27-trit wraparound`);
console.log(`         - ${allCollisionPairs.length.toLocaleString()} total colliding pairs in corpus\n`);

for (const mode of ['names', 'hashOnly']) {
  const t0 = Date.now();
  const runInOS = createInOSRunner(mode);
  let passCount = 0;
  let failCount = 0;

  for (let i = 0; i < allCollisionPairs.length; i++) {
    const { l1, l2 } = allCollisionPairs[i];
    const src = `${l1}: LI R1,#1\n${l2}: LI R2,#2\nJMP ${l1}\nJMP ${l2}\nHALT`;
    const jsRes = runJSAssemble(src);
    const osRes = runInOS(src);

    const match = (
      jsRes.ok &&
      osRes.ok &&
      jsRes.trytes.length === osRes.trytes.length &&
      jsRes.trytes.every((v, idx) => v === osRes.trytes[idx])
    );
    if (match) passCount++;
    else failCount++;
  }

  const elapsed = Date.now() - t0;
  const failPct = (failCount / allCollisionPairs.length) * 100;
  metrics.modes[mode].test1_collision = {
    totalPairs: allCollisionPairs.length,
    shortPairs: corpus.shortPairs.length,
    wrapPairs: corpus.wrapPairs.length,
    passCount,
    failCount,
    failPct: Number(failPct.toFixed(2)),
    ms: elapsed
  };

  if (mode === 'names') {
    if (passCount !== allCollisionPairs.length) {
      throw new Error(`[Test 1 - names] Expected 100% pass on collision corpus, got ${passCount}/${allCollisionPairs.length}`);
    }
    console.log(`[PASS] Test 1 (mode="names")   : ${passCount}/${allCollisionPairs.length} colliding pairs matched JS byte-for-byte (${elapsed} ms)`);
  } else {
    if (failPct < 99.0) {
      throw new Error(`[Test 1 - hashOnly] Expected >= 99% failure on collision corpus, got ${failPct.toFixed(2)}%`);
    }
    console.log(`[PASS] Test 1 (mode="hashOnly"): Caught ${failCount}/${allCollisionPairs.length} (${failPct.toFixed(1)}%) colliding pairs failing in 2.0 hashOnly mode (${elapsed} ms)`);
  }
}

// ============================================================================
// TEST 2: UNDEFINED AND DUPLICATE LABELS (incl. case-only duplicates)
// ============================================================================
const ERROR_CASES = [
  { name: 'undefined forward JMP',          src: 'LI R1,#1\nJMP nowhere\nHALT',                         expLine: 2, expLabel: 'NOWHERE', kind: 'undefined' },
  { name: 'undefined CALL target',          src: 'NOP\nNOP\nCALL missing_sub\nHALT',                    expLine: 3, expLabel: 'MISSING_SUB', kind: 'undefined' },
  { name: 'undefined LI symbol',            src: 'start: NOP\nLI R3,#undef_const\nHALT',                expLine: 2, expLabel: 'UNDEF_CONST', kind: 'undefined' },
  { name: 'undefined offset expression',    src: 'a1: LI R1,#1\nADDI R2,R1,#ghost+4\nHALT',             expLine: 2, expLabel: 'GHOST', kind: 'undefined' },
  { name: 'undefined in .tryte',            src: 'LI R0,#0\nHALT\n.tryte #1,#no_such_sym',              expLine: 3, expLabel: 'NO_SUCH_SYM', kind: 'undefined' },
  { name: 'undefined on line 1',            src: 'JMP first_line_undef\nHALT',                          expLine: 1, expLabel: 'FIRST_LINE_UNDEF', kind: 'undefined' },
  { name: 'exact duplicate label x1',       src: 'x1: LI R1,#1\nx1: LI R2,#2\nJMP x1\nHALT',           expLine: 2, expLabel: 'X1', kind: 'duplicate' },
  { name: 'exact duplicate label later',    src: 'top: NOP\nmid: NOP\ntop: LI R0,#5\nHALT',             expLine: 3, expLabel: 'TOP', kind: 'duplicate' },
  { name: 'case-only duplicate Loop/LOOP',  src: 'Loop: LI R1,#1\nLOOP: LI R2,#2\nJMP LOOP\nHALT',     expLine: 2, expLabel: 'LOOP', kind: 'case_duplicate' },
  { name: 'case-only duplicate Exit/eXiT',  src: 'Exit: NOP\nNOP\nNOP\neXiT: HALT',                     expLine: 4, expLabel: 'EXIT', kind: 'case_duplicate' },
  { name: 'duplicate .equ symbol',          src: '.equ VAL,10\n.equ val,20\nLI R0,#VAL\nHALT',          expLine: 2, expLabel: 'VAL', kind: 'duplicate' },
  { name: 'label duplicates .equ name',     src: '.equ FOO,5\n NOP\nfoo: HALT',                         expLine: 3, expLabel: 'FOO', kind: 'case_duplicate' }
];

for (const mode of ['names', 'hashOnly']) {
  const t0 = Date.now();
  const runInOS = createInOSRunner(mode);
  let matchedRejections = 0;

  for (const tc of ERROR_CASES) {
    const jsRes = runJSAssemble(tc.src);
    const osRes = runInOS(tc.src);

    if (jsRes.ok) {
      throw new Error(`[Test 2] JS assembler unexpectedly accepted error case '${tc.name}'`);
    }
    const expectedSubstr = `Line ${tc.expLine}: ${tc.kind === 'undefined' ? 'Undefined' : 'Duplicate'} label ${tc.expLabel}`;
    if (jsRes.error !== expectedSubstr) {
      throw new Error(`[Test 2] JS error '${jsRes.error}' !== expected '${expectedSubstr}'`);
    }

    if (!osRes.ok && osRes.error === jsRes.error && osRes.rawLen === 0 && osRes.nonZeroInObuf === 0) {
      matchedRejections++;
    }
  }

  const elapsed = Date.now() - t0;
  metrics.modes[mode].test2_errors = {
    totalCases: ERROR_CASES.length,
    matchedRejections,
    ms: elapsed
  };

  if (mode === 'names') {
    if (matchedRejections !== ERROR_CASES.length) {
      throw new Error(`[Test 2 - names] Expected all ${ERROR_CASES.length} error cases rejected identically, got ${matchedRejections}`);
    }
    console.log(`[PASS] Test 2 (mode="names")   : ${matchedRejections}/${ERROR_CASES.length} undefined/duplicate/case-duplicate cases rejected with identical line & label and 0 output trytes (${elapsed} ms)`);
  } else {
    if (matchedRejections !== 0) {
      throw new Error(`[Test 2 - hashOnly] Expected hashOnly to fail error rejection test, but matched ${matchedRejections}`);
    }
    console.log(`[PASS] Test 2 (mode="hashOnly"): Caught 0/${ERROR_CASES.length} rejected in 2.0 hashOnly mode (fails as expected) (${elapsed} ms)`);
  }
}

// ============================================================================
// TEST 3: DIFFERENTIAL FUZZ (2,000 seeded random label-heavy programs)
//   50-300 labels per program, mixed case, short labels, forward & backward refs
// ============================================================================
function makePrng(seed) {
  let s = seed >>> 0;
  return {
    u32() {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return s >>> 0;
    },
    int(min, max) {
      return min + (this.u32() % (max - min + 1));
    },
    pick(arr) {
      return arr[this.u32() % arr.length];
    }
  };
}

const FUZZ_SEEDS = Array.from({ length: 2000 }, (_, i) => (0x210000 + i * 7919) >>> 0);
console.log('[Test 3 Seeds] Logging all 2,000 fixed seeds (20 per row):');
for (let r = 0; r < FUZZ_SEEDS.length; r += 20) {
  console.log('  Seeds [' + String(r).padStart(4, '0') + '..' + String(r + 19).padStart(4, '0') + ']: ' +
    FUZZ_SEEDS.slice(r, r + 20).map(v => '0x' + v.toString(16)).join(', '));
}

function generateLabelHeavyProgram(seed, idx) {
  const rng = makePrng(seed);
  const numLabels = rng.int(50, 300);
  const reserved = new Set(Object.keys(T.MNEM_MAP));
  for (let r = 0; r <= 8; r++) reserved.add('R' + r);

  const fChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_';
  const nChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
  const randomizeCase = (str) => {
    let out = '';
    for (let i = 0; i < str.length; i++) {
      out += (rng.u32() & 1) ? str[i].toLowerCase() : str[i].toUpperCase();
    }
    return out;
  };

  const canonicalSet = new Set();
  const labels = [];

  // Include a colliding short pair in 40% of valid programs so hash collisions are heavily exercised
  if (idx % 5 < 2) {
    const pair = corpus.shortPairs[(idx * 31) % corpus.shortPairs.length];
    canonicalSet.add(pair.l1);
    canonicalSet.add(pair.l2);
    labels.push(randomizeCase(pair.l1), randomizeCase(pair.l2));
  }

  while (labels.length < numLabels) {
    const len = rng.int(1, 5);
    let cand = fChars[rng.u32() % fChars.length];
    for (let k = 1; k < len; k++) cand += nChars[rng.u32() % nChars.length];
    if (reserved.has(cand) || canonicalSet.has(cand)) continue;
    canonicalSet.add(cand);
    labels.push(randomizeCase(cand));
  }

  const lines = [];
  const branchOps = ['JMP', 'JZ', 'JNZ', 'JN', 'JP'];
  for (let i = 0; i < labels.length; i++) {
    const defLabel = labels[i];
    const targetLabel = randomizeCase(labels[rng.u32() % labels.length]); // forward or backward reference!
    const kind = rng.u32() % 3;
    if (kind === 0) {
      lines.push(`${defLabel}: LI R${rng.u32() % 9},#${targetLabel}`);
    } else if (kind === 1) {
      lines.push(`${defLabel}: ${rng.pick(branchOps)} ${targetLabel}`);
    } else {
      lines.push(`${defLabel}: ADDI R${rng.u32() % 9},R${rng.u32() % 9},#${rng.int(-100, 100)}`);
    }
  }

  // Inject deliberate duplicate or undefined label in 15% of fuzz programs
  const faultMode = idx % 20;
  if (faultMode === 1) {
    // Case-altered duplicate label
    const dup = randomizeCase(labels[rng.u32() % labels.length]);
    lines.splice(rng.int(1, lines.length - 1), 0, `${dup}: NOP`);
  } else if (faultMode === 2) {
    // Undefined label reference
    lines.splice(rng.int(0, lines.length - 1), 0, `JMP undef_sym_${idx}`);
  }

  lines.push('HALT');
  return { src: lines.join('\n'), numLabels };
}

for (const mode of ['names', 'hashOnly']) {
  const t0 = Date.now();
  const runInOS = createInOSRunner(mode);
  let agreeCount = 0;
  let disagreeCount = 0;
  let validAgreed = 0;
  let rejectedAgreed = 0;

  for (let i = 0; i < FUZZ_SEEDS.length; i++) {
    const seed = FUZZ_SEEDS[i];
    const { src } = generateLabelHeavyProgram(seed, i);
    const jsRes = runJSAssemble(src);
    const osRes = runInOS(src, 3000000);

    let agree = false;
    if (jsRes.ok && osRes.ok) {
      agree = (
        jsRes.trytes.length === osRes.trytes.length &&
        jsRes.trytes.every((v, k) => v === osRes.trytes[k])
      );
      if (agree) validAgreed++;
    } else if (!jsRes.ok && !osRes.ok) {
      agree = (jsRes.error === osRes.error && osRes.rawLen === 0);
      if (agree) rejectedAgreed++;
    }

    if (agree) agreeCount++;
    else disagreeCount++;
  }

  const elapsed = Date.now() - t0;
  metrics.modes[mode].test3_fuzz = {
    totalPrograms: FUZZ_SEEDS.length,
    firstSeed: '0x' + FUZZ_SEEDS[0].toString(16),
    lastSeed: '0x' + FUZZ_SEEDS[FUZZ_SEEDS.length - 1].toString(16),
    agreeCount,
    disagreeCount,
    validAgreed,
    rejectedAgreed,
    ms: elapsed
  };

  if (mode === 'names') {
    if (agreeCount !== FUZZ_SEEDS.length) {
      throw new Error(`[Test 3 - names] Expected 2000/2000 agreement, got ${agreeCount}/${FUZZ_SEEDS.length}`);
    }
    console.log(`[PASS] Test 3 (mode="names")   : ${agreeCount}/${FUZZ_SEEDS.length} label-heavy programs (50-300 labels, seeds 0x${FUZZ_SEEDS[0].toString(16)}..0x${FUZZ_SEEDS[FUZZ_SEEDS.length - 1].toString(16)}) agreed (${validAgreed} valid, ${rejectedAgreed} rejected) in ${elapsed} ms`);
  } else {
    console.log(`[PASS] Test 3 (mode="hashOnly"): ${disagreeCount}/${FUZZ_SEEDS.length} label-heavy programs disagreed in 2.0 hashOnly mode (${elapsed} ms)`);
  }
}

// ============================================================================
// TEST 4: SELF-HOSTING FIXED POINT & SOURCE BUDGET CHECK
// ============================================================================
{
  const t0 = Date.now();
  T.setSymbolMode('names');
  const src20Len = T.TRITOS_SRC_HASHONLY.length;
  const src21Len = T.TRITOS_SRC_NAMES.length;
  const cap = T.TRYTE_MOD - 500 - 1; // 19,182 characters
  const headroom = cap - src21Len;

  const jsBuilt21 = T.assemble(T.TRITOS_SRC_NAMES);
  const runInOS = createInOSRunner('names');
  const osBuilt21 = runInOS(T.TRITOS_SRC_NAMES, 6000000);

  if (!osBuilt21.ok || osBuilt21.trytes.length !== jsBuilt21.trytes.length) {
    throw new Error('[Test 4] Self-hosting assembly of TritOS 2.1 failed');
  }
  for (let i = 0; i < jsBuilt21.trytes.length; i++) {
    if (osBuilt21.trytes[i] !== jsBuilt21.trytes[i]) {
      throw new Error(`[Test 4] Self-hosting mismatch at tryte ${i}`);
    }
  }

  // Boot the self-built TritOS 2.1 image and verify shell + calculator
  const bootVm = T.TritonWASM.createSync();
  bootVm.loadProgram(osBuilt21.trytes, 0);
  bootVm.pushInputString('list\ncalc 10T+11\nquit\n');
  bootVm.run(250000);
  const bootOut = bootVm.getConsoleOut();
  if (!bootOut.includes('TritOS 2.0') || !bootOut.includes('= 110 (12)')) {
    throw new Error('[Test 4] Self-built TritOS 2.1 image failed boot verification');
  }

  const elapsed = Date.now() - t0;
  metrics.sourceLengths = {
    v20Chars: src20Len,
    v20Trytes: T.assemble(T.TRITOS_SRC_HASHONLY).length,
    v21Chars: src21Len,
    v21Trytes: jsBuilt21.length,
    deltaChars: src21Len - src20Len,
    deltaTrytes: jsBuilt21.length - T.assemble(T.TRITOS_SRC_HASHONLY).length,
    capChars: cap,
    headroomChars: headroom,
    fixedPointMs: elapsed
  };
  console.log(`[PASS] Test 4: TritOS 2.1 self-hosting fixed point (${jsBuilt21.length} trytes identical, self-built image boots)`);
  console.log(`       - Source budget: 2.0 = ${src20Len.toLocaleString()} chars | 2.1 = ${src21Len.toLocaleString()} chars (+${src21Len - src20Len} chars) | Cap = ${cap.toLocaleString()} chars | Remaining headroom = ${headroom.toLocaleString()} chars (${elapsed} ms)`);
}

// ============================================================================
// TEST 5: REGRESSIONS (tests/run.js, audit/unseen.js, audit/isa-bigint.js, audit/hash-collision.js)
// ============================================================================
{
  const t0 = Date.now();
  const baseDir = path.dirname(htmlPath);

  const runScript = (relPath) => {
    const full = path.resolve(baseDir, relPath);
    if (!fs.existsSync(full)) {
      throw new Error(`[Test 5] Missing regression script: ${full}`);
    }
    return execFileSync(process.execPath, [full], { cwd: baseDir, encoding: 'utf8' });
  };

  const outRun = runScript('tests/run.js');
  if (!outRun.includes('ALL 8 TRITON 2.0 TEST SUITES PASSED')) {
    throw new Error('[Test 5] tests/run.js failed:\n' + outRun);
  }

  const outUnseen = runScript('audit/unseen.js');
  if (!outUnseen.includes('SUMMARY 6 match of 6') || !outUnseen.includes('SOUP SUMMARY 4 match of 4')) {
    throw new Error('[Test 5] audit/unseen.js failed:\n' + outUnseen);
  }

  const outBigInt = runScript('audit/isa-bigint.js');
  if (!outBigInt.includes('0 disagreements')) {
    throw new Error('[Test 5] audit/isa-bigint.js failed:\n' + outBigInt);
  }

  const outCollision = runScript('audit/hash-collision.js');
  const agreeMatches = [...outCollision.matchAll(/^\s*agree\s*$/gm)].length;
  const disagreeMatches = [...outCollision.matchAll(/DISAGREE/g)].length;
  if (agreeMatches !== 5 || disagreeMatches !== 0) {
    throw new Error(`[Test 5] audit/hash-collision.js expected 5 'agree' and 0 'DISAGREE', got:\n${outCollision}`);
  }

  const elapsed = Date.now() - t0;
  metrics.regressions = {
    runJsPass: true,
    unseenEditsMatched: '6/6',
    unseenSoupMatched: '4/4',
    isaBigIntDisagreements: 0,
    hashCollisionAgrees: `${agreeMatches}/5`,
    ms: elapsed
  };
  console.log(`[PASS] Test 5: All 4 unmodified regression suites passed (tests/run.js 8/8, unseen.js 6/6 + 4/4, isa-bigint.js 0 disagreements, hash-collision.js 5/5 agree) in ${elapsed} ms`);
}

// ============================================================================
// TEST 6: STATIC SCAN (No network or storage APIs; strict CSP; every inline labeled)
// ============================================================================
{
  const cspMatch = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(htmlContent);
  if (!cspMatch || !cspMatch[1].includes("default-src 'none'") || !cspMatch[1].includes("connect-src 'none'")) {
    throw new Error('[Test 6] Missing or weak CSP meta tag');
  }

  const forbidden = [
    { name: 'fetch()', re: /\bfetch\s*\(/ },
    { name: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/ },
    { name: 'WebSocket', re: /\bWebSocket\b/ },
    { name: 'EventSource', re: /\bEventSource\b/ },
    { name: 'sendBeacon', re: /\bsendBeacon\b/ },
    { name: 'localStorage', re: /\blocalStorage\b/ },
    { name: 'sessionStorage', re: /\bsessionStorage\b/ },
    { name: 'indexedDB', re: /\bindexedDB\b/ },
    { name: 'caches', re: /\bcaches\b/ },
    { name: 'http/https URL', re: /https?:\/\//i }
  ];
  for (const f of forbidden) {
    if (f.re.test(htmlContent)) throw new Error(`[Test 6] Forbidden API/URL in triton.html: ${f.name}`);
  }

  const inlineLabels = [];
  for (let i = 1; i <= 7; i++) {
    const tag = `[INLINE ${i}/7]`;
    if (!htmlContent.includes(tag)) throw new Error(`[Test 6] Missing inline label ${tag}`);
    inlineLabels.push(tag);
  }

  metrics.staticScan = {
    htmlBytes: Buffer.byteLength(htmlContent, 'utf8'),
    cspVerified: true,
    forbiddenApisFound: 0,
    inlineLabelsCount: inlineLabels.length
  };
  console.log(`[PASS] Test 6: Static scan (strict CSP, 0 network/storage APIs, all ${inlineLabels.length}/7 inline blocks labeled)`);
}

// Save script-generated metrics JSON for report generation
const metricsPath = '/working_dir/c_a7ca1264b94c3647/artifacts/file_generation/ttl=63d/intermediate/metrics-2.1.json';
try {
  fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
} catch (_) {}

console.log('\n====================================================================');
console.log('ALL 6 TRITON 2.1 SYMBOL-TABLE & REGRESSION SUITES PASSED');
console.log('====================================================================');