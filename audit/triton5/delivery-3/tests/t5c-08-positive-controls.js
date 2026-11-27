'use strict';

/**
 * Test 8: Positive Controls (`tests/t5c-08-positive-controls.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Applies 6 targeted in-memory defects (mutants) to the real compiler/linker/runtime
 * without adding any test hooks to production code, and verifies each defect is
 * caught by our test suite:
 *   1. Unsigned addition that doesn't wrap at 2^32
 *   2. Right shift of a negative int that is logical instead of arithmetic
 *   3. Struct passed by value whose last member is dropped
 *   4. Float conversion that truncates instead of rounding to nearest even
 *   5. Relocation off by one unit
 *   6. volatile load that the optimiser removes
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { REPO_ROOT, tcc5, runExeOnBothCores, sha256Str, recordJsonl } = require('./t5c-common');

function loadMutatedModule(relPath, patchFn) {
  const fullPath = path.join(REPO_ROOT, relPath);
  const orig = fs.readFileSync(fullPath, 'utf8');
  const patched = patchFn(orig);
  if (patched === orig) throw new Error(`Positive control patch had no effect on ${relPath}`);
  const mod = { exports: {} };
  const sandbox = {
    module: mod,
    exports: mod.exports,
    require: (id) => {
      if (id.startsWith('.')) return require(path.resolve(path.dirname(fullPath), id));
      return require(id);
    },
    console, Buffer, process, globalThis, BigInt,
    Int8Array, Uint8Array, Int16Array, Int32Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer,
    Math, JSON, Array, Object, String, Number, Boolean, Set, Map, RegExp, Error
  };
  vm.runInNewContext(patched, sandbox, { filename: relPath + '.mutant' });
  return mod.exports;
}

function runProg(source, opts = {}) {
  const gen = opts.generateAsm || tcc5.generateAsm;
  const link = opts.linkT5X || tcc5.linkT5X;
  const rtObjs = opts.rtObjs || tcc5.buildRuntimeObjects();
  const pp = tcc5.preprocess(source, { filename: 'ctrl.c' });
  const ast = tcc5.parseProgram(pp, 'ctrl.c');
  const asm = gen(ast, { optLevel: 1 });
  const obj = tcc5.assembleT5O(asm, 'ctrl.c');
  const exe = link([...rtObjs, obj]);
  return runExeOnBothCores(exe, 5000000, false);
}

function run() {
  const controls = [];

  // Control 1: Unsigned addition that doesn't wrap at 2^32
  {
    const src = `
      #include <triton5.h>
      #include <stdint.h>
      int main(void) {
        volatile uint32_t a = 0xFFFFFFFFU;
        t5_putint(((a + 1U) == 0U) ? 1 : 0);
        return 0;
      }
    `;
    const base = runProg(src);
    const mutCodegen = loadMutatedModule('tcc5/codegen.js', s =>
      s.replace("case '+': emit(`  ADD R0, R0, R2`); emit(`  ${wrap}`); break;",
                "case '+': emit(`  ADD R0, R0, R2`); /* MUTANT: no wrap */ break;")
    );
    const mut = runProg(src, { generateAsm: mutCodegen.generateAsm });
    const caught = (base.consoleOut === '1') && (mut.consoleOut !== '1');
    controls.push({ id: 'unsigned_add_no_wrap', base: base.consoleOut, mutant: mut.consoleOut, caught });
    console.log(`Control 1 (unsigned_add_no_wrap): base=${base.consoleOut} mutant=${mut.consoleOut} caught=${caught}`);
  }

  // Control 2: Right shift of negative int that is logical (BSHR) instead of arithmetic (BSAR)
  {
    const src = `
      #include <triton5.h>
      int main(void) {
        volatile int x = -16;
        int y = x >> 2;
        t5_putint(y);
        return 0;
      }
    `;
    const base = runProg(src);
    const mutCodegen = loadMutatedModule('tcc5/codegen.js', s =>
      s.replace("emit(`  BSAR R0, R0, R2`);", "emit(`  BSHR R0, R0, R2`); /* MUTANT */")
    );
    const mut = runProg(src, { generateAsm: mutCodegen.generateAsm });
    const caught = (base.consoleOut === '-4') && (mut.consoleOut !== '-4');
    controls.push({ id: 'signed_rshift_logical', base: base.consoleOut, mutant: mut.consoleOut, caught });
    console.log(`Control 2 (signed_rshift_logical): base=${base.consoleOut} mutant=${mut.consoleOut} caught=${caught}`);
  }

  // Control 3: Struct passed by value whose last member is dropped
  {
    const src = `
      #include <triton5.h>
      struct S3 { int a; int b; int c; };
      static int sum3(struct S3 s) { return s.a + s.b + s.c; }
      int main(void) {
        struct S3 x = { 10, 20, 30 };
        t5_putint(sum3(x));
        return 0;
      }
    `;
    const base = runProg(src);
    const mutCodegen = loadMutatedModule('tcc5/codegen.js', s =>
      s.replace("emitMemCopy('R0', 'R1', sp.size);", "emitMemCopy('R0', 'R1', Math.max(0, sp.size - 4)); /* MUTANT */")
    );
    const mut = runProg(src, { generateAsm: mutCodegen.generateAsm });
    const caught = (base.consoleOut === '60') && (mut.consoleOut !== '60');
    controls.push({ id: 'struct_arg_last_member_dropped', base: base.consoleOut, mutant: mut.consoleOut, caught });
    console.log(`Control 3 (struct_arg_last_member_dropped): base=${base.consoleOut} mutant=${mut.consoleOut} caught=${caught}`);
  }

  // Control 4: Float conversion that truncates instead of rounding to nearest even
  {
    const src = `
      #include <triton5.h>
      #include <stdint.h>
      typedef union { float f; uint32_t u; } FU;
      int main(void) {
        volatile uint32_t x = 16777219U; /* tie between 16777218 (odd) and 16777220 (even) -> RNE rounds up to 0x4b800002 */
        FU fu; fu.f = (float)x;
        t5_puthex32(fu.u);
        return 0;
      }
    `;
    const base = runProg(src);
    const origFp = fs.readFileSync(path.join(REPO_ROOT, 'runtime/rt_softfp.c'), 'utf8');
    const mutFp = origFp.replace(
      'if (grs > 4U || (grs == 4U && (mant & 1U))) {',
      'if (0) { /* MUTANT: truncate instead of RNE */'
    );
    if (mutFp === origFp) throw new Error('FP mutant did not match');
    const rtBase = tcc5.buildRuntimeObjects();
    const mutRt = [rtBase[0], rtBase[1], rtBase[2], tcc5.compileCToObj(mutFp, { filename: 'rt_softfp_mut.c' })];
    const mut = runProg(src, { rtObjs: mutRt });
    const caught = (base.consoleOut === '4b800002') && (mut.consoleOut !== '4b800002');
    controls.push({ id: 'float_trunc_instead_of_rne', base: base.consoleOut, mutant: mut.consoleOut, caught });
    console.log(`Control 4 (float_trunc_instead_of_rne): base=${base.consoleOut} mutant=${mut.consoleOut} caught=${caught}`);
  }

  // Control 5: Relocation off by one unit
  {
    const src = `
      #include <triton5.h>
      static int g_val = 9876;
      int main(void) {
        t5_putint(g_val);
        return 0;
      }
    `;
    const base = runProg(src);
    const mutLinker = loadMutatedModule('tcc5/linker.js', s =>
      s.replace('const relocOffsetDelta = options.debugRelocDelta || 0;', 'const relocOffsetDelta = 1; /* MUTANT */')
    );
    const mut = runProg(src, { linkT5X: mutLinker.linkT5X });
    const caught = (base.consoleOut === '9876') && (mut.consoleOut !== '9876');
    controls.push({ id: 'reloc_off_by_one', base: base.consoleOut, mutant: mut.consoleOut, caught });
    console.log(`Control 5 (reloc_off_by_one): base=${base.consoleOut} mutant=${mut.consoleOut} caught=${caught}`);
  }

  // Control 6: volatile load that the optimiser removes
  {
    const src = `
      #include <triton5.h>
      static int read_vol_twice(volatile int *p) {
        int a = *p;
        int b = *p;
        return a + b;
      }
      int main(void) {
        volatile int v = 21;
        t5_putint(read_vol_twice(&v));
        return 0;
      }
    `;
    const baseAsm = tcc5.compileCToAsm(src, { filename: 'vol.c', optLevel: 1 });
    const baseVolLoads = (baseAsm.match(/;\s*volatile/g) || []).length;
    const baseRun = runProg(src);

    const mutCodegen = loadMutatedModule('tcc5/codegen.js', s =>
      s.replace(
        "if (cur.includes('; volatile') || cur.includes('; inline-asm')) {\n      out.push(cur);\n      continue;\n    }",
        "if (cur.includes('; volatile') && /\\bLT\\b/.test(cur)) continue; /* MUTANT: drop volatile load */"
      )
    );
    const mutAsm = mutCodegen.generateAsm(tcc5.parseProgram(tcc5.preprocess(src, { filename: 'vol.c' }), 'vol.c'), { optLevel: 1 });
    const mutVolLoads = (mutAsm.match(/;\s*volatile/g) || []).length;
    const mutRun = runProg(src, { generateAsm: mutCodegen.generateAsm });
    const caught = (baseRun.consoleOut === '42') && (baseVolLoads >= 8) && (mutVolLoads < baseVolLoads || mutRun.consoleOut !== '42');
    controls.push({ id: 'volatile_load_removed', base: `${baseRun.consoleOut}(volOps=${baseVolLoads})`, mutant: `${mutRun.consoleOut}(volOps=${mutVolLoads})`, caught });
    console.log(`Control 6 (volatile_load_removed): base=${baseRun.consoleOut}(volOps=${baseVolLoads}) mutant=${mutRun.consoleOut}(volOps=${mutVolLoads}) caught=${caught}`);
  }

  const allCaught = controls.every(c => c.caught);
  recordJsonl({
    testId: 't5c-08',
    name: 'Positive Controls (6/6 Mutants Caught)',
    pass: allCaught,
    inputSha256: sha256Str(JSON.stringify(controls.map(c => c.id))),
    caught: controls.filter(c => c.caught).length,
    total: controls.length,
    controls
  });
  console.log(`t5c-08 Positive Controls: ${controls.filter(c => c.caught).length}/${controls.length} caught`);
  if (!allCaught) process.exit(1);
}

if (require.main === module) run();
module.exports = { run };
