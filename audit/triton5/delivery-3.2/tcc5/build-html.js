#!/usr/bin/env node
'use strict';

/**
 * Single-file offline browser compiler builder (`tcc5/build-html.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Inlines all tcc5 compiler modules and runtime sources into `triton5-cc.html`
 * with explicit provenance comments naming every inlined file.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function stripCjsWrapper(src, globalExportName) {
  // Wrap each module in an IIFE that exposes its exports on globalThis[globalExportName]
  return `(function() {\n  const module = { exports: {} };\n  const exports = module.exports;\n` +
    src.replace(/^'use strict';\s*/m, '') +
    `\n  globalThis.${globalExportName} = module.exports;\n})();`;
}

function buildHtml() {
  const modules = [
    ['tcc5/isa.js',     'TCC5_ISA'],
    ['tcc5/headers.js', 'TCC5_HEADERS'],
    ['tcc5/preproc.js', 'TCC5_PREPROC'],
    ['tcc5/types.js',   'TCC5_TYPES'],
    ['tcc5/parser.js',  'TCC5_PARSER'],
    ['tcc5/codegen.js', 'TCC5_CODEGEN'],
    ['tcc5/asm.js',     'TCC5_ASM'],
    ['tcc5/linker.js',  'TCC5_LINKER']
  ];

  const inlinedJs = modules.map(([rel, gname]) => {
    const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // Remove require(...) calls since globals are already wired
    const browserSafe = raw.replace(/const\s+\{?\s*[^=]+\}?\s*=\s*\(typeof require !== 'undefined'\)\s*\?\s*require\([^)]+\)\s*:\s*([^;]+);/g, (m, rhs) => {
      const lhs = m.slice(0, m.indexOf('=')).trim();
      return `${lhs} = ${rhs};`;
    });
    return `/* === INLINED FROM ${rel} === */\n${stripCjsWrapper(browserSafe, gname)}`;
  }).join('\n\n');

  const rtFiles = ['runtime/crt0.s', 'runtime/rt_mem.c', 'runtime/rt_int64.c', 'runtime/rt_softfp.c'];
  const rtObj = {};
  for (const rf of rtFiles) {
    rtObj[rf] = fs.readFileSync(path.join(ROOT, rf), 'utf8');
  }
  const inlinedRuntime = `/* === INLINED FROM runtime/crt0.s, runtime/rt_mem.c, runtime/rt_int64.c, runtime/rt_softfp.c === */\n` +
    `globalThis.TCC5_RUNTIME_SOURCES = ${JSON.stringify(rtObj)};`;

  // Lift & inline the Triton 5.0 machine core directly from triton5.html (stage 2 accepted)
  // so triton5-cc.html is a 100% standalone single file working directly from file://
  const crypto = require('crypto');
  const t5Raw = fs.readFileSync(path.join(ROOT, 'triton5.html'), 'utf8');
  const t5Hash = crypto.createHash('sha256').update(t5Raw).digest('hex');
  const bStart = t5Raw.indexOf('//BEGIN_TRITON3_MACHINE_BLOCK');
  const bEnd = t5Raw.indexOf('//END_TRITON3_MACHINE_BLOCK');
  if (bStart < 0 || bEnd < 0) throw new Error('Machine block markers not found in triton5.html');
  const machineBlock = t5Raw.slice(bStart, bEnd + '//END_TRITON3_MACHINE_BLOCK'.length);
  const inlinedMachine = `/* === LIFTED/INLINED FROM triton5.html (stage 2 accepted, sha256 ${t5Hash}) === */\n` +
    `${machineBlock}\n})();`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tcc5 — Triton 5.0 C11 Compiler (ConsciousNode SoftWorks)</title>
<style>
  :root {
    --bg: #0f1318; --panel: #171d26; --border: #2a3444;
    --text: #e6edf3; --muted: #8b949e; --accent: #3fb950;
    --accent2: #58a6ff; --err: #f85149; --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); }
  header { padding: 12px 20px; background: var(--panel); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  header h1 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: 0.3px; }
  header .sub { font-size: 12px; color: var(--muted); }
  .toolbar { display: flex; gap: 8px; align-items: center; }
  button { background: var(--accent2); color: #081018; border: 0; padding: 7px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; }
  button.primary { background: var(--accent); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  main { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px 20px; height: calc(100vh - 64px); }
  .col { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; display: flex; flex-direction: column; min-height: 0; flex: 1; }
  .card-hdr { padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 12px; font-weight: 600; color: var(--muted); display: flex; justify-content: space-between; }
  textarea, pre { flex: 1; margin: 0; padding: 12px; background: transparent; color: var(--text); border: 0; font-family: var(--mono); font-size: 12.5px; line-height: 1.45; overflow: auto; resize: none; outline: none; }
  .status-ok { color: var(--accent); font-weight: 600; }
  .status-err { color: var(--err); font-weight: 600; }
</style>
</head>
<body>
<header>
  <div>
    <h1>tcc5 — Triton 5.0 ISO C11 Compiler &amp; Linker</h1>
    <div class="sub">ConsciousNode SoftWorks · MIT License · Offline · Balanced-3⁷ (2,187-tryte) Pages · ILP32</div>
  </div>
  <div class="toolbar">
    <button id="btn-compile">Compile Only</button>
    <button id="btn-run" class="primary">Compile &amp; Run on Triton 5</button>
  </div>
</header>
<main>
  <div class="col">
    <div class="card">
      <div class="card-hdr"><span>C11 Source (sample.c)</span><span id="compile-stats">Ready</span></div>
      <textarea id="c-source" spellcheck="false">#include &lt;triton5.h&gt;
#include &lt;stdint.h&gt;

static uint32_t fib(uint32_t n) {
  uint32_t a = 0, b = 1;
  for (uint32_t i = 0; i &lt; n; i++) {
    uint32_t t = a + b;
    a = b;
    b = t;
  }
  return a;
}

int main(void) {
  t5_puts("Triton 5 tcc5 online! fib(20)=");
  t5_putint((int)fib(20));
  double pi = 3.141592653589793;
  t5_puts(" pi*1000=");
  t5_putint((int)(pi * 1000.0));
  t5_puts("\\n");
  return 0;
}
</textarea>
    </div>
  </div>
  <div class="col">
    <div class="card" style="flex: 0.9;">
      <div class="card-hdr"><span>Triton 5 Console &amp; Lockstep Verification</span><span id="run-status">Idle</span></div>
      <pre id="console-out"></pre>
    </div>
    <div class="card" style="flex: 1.1;">
      <div class="card-hdr"><span>Generated Triton 5 Assembly &amp; .t5x Section Map</span><span id="asm-stats"></span></div>
      <pre id="asm-out"></pre>
    </div>
  </div>
</main>
<script>
'use strict';

${inlinedJs}

${inlinedRuntime}

${inlinedMachine}

/* === tcc5 Browser Driver === */
(function() {
  let cachedRuntimeObjs = null;

  function compileCToAsm(src, filename) {
    const pp = globalThis.TCC5_PREPROC.preprocess(src, { filename: filename || 'sample.c' });
    const ast = globalThis.TCC5_PARSER.parseProgram(pp, filename || 'sample.c');
    return globalThis.TCC5_CODEGEN.generateAsm(ast, { optLevel: 1 });
  }

  function buildRuntime() {
    if (cachedRuntimeObjs) return cachedRuntimeObjs;
    const rt = globalThis.TCC5_RUNTIME_SOURCES;
    const as = globalThis.TCC5_ASM.assembleT5O;
    cachedRuntimeObjs = [
      as(rt['runtime/crt0.s'], 'runtime/crt0.s'),
      as(compileCToAsm(rt['runtime/rt_mem.c'], 'runtime/rt_mem.c'), 'runtime/rt_mem.c'),
      as(compileCToAsm(rt['runtime/rt_int64.c'], 'runtime/rt_int64.c'), 'runtime/rt_int64.c'),
      as(compileCToAsm(rt['runtime/rt_softfp.c'], 'runtime/rt_softfp.c'), 'runtime/rt_softfp.c')
    ];
    return cachedRuntimeObjs;
  }

  function compileAndLinkBrowser(cSource) {
    const t0 = performance.now();
    const asm = compileCToAsm(cSource, 'sample.c');
    const userObj = globalThis.TCC5_ASM.assembleT5O(asm, 'sample.c');
    const rtObjs = buildRuntime();
    const exe = globalThis.TCC5_LINKER.linkT5X([...rtObjs, userObj]);
    const elapsedMs = (performance.now() - t0).toFixed(1);
    return { asm, userObj, exe, elapsedMs };
  }

  function getTritonSystem() {
    return globalThis.TritonSystem || null;
  }

  function runOnTriton5(exe) {
    const T = getTritonSystem();
    if (!T) throw new Error('triton5.html host not loaded yet');
    const opts = { archMode: 'T3', pageSize: 2187, mmuMode: 'balanced', diskSectors: 2 };
    const jsVm = new T.TritonJS(opts);
    const wasmVm = T.TritonWASM.createSync(opts);
    jsVm.loadProgram(exe.image, 0);
    wasmVm.loadProgram(exe.image, 0);
    jsVm.run(2000000);
    wasmVm.run(2000000);
    const jsHash = jsVm.stateHash ? jsVm.stateHash() : T.computeStateHash(jsVm);
    const wasmHash = wasmVm.stateHash ? wasmVm.stateHash() : T.computeStateHash(wasmVm);
    return {
      consoleOut: jsVm.consoleOut,
      wasmConsoleOut: wasmVm.consoleOut,
      jsSteps: jsVm.steps,
      wasmSteps: wasmVm.steps,
      halted: !!jsVm.halted && !!wasmVm.halted,
      jsHash,
      wasmHash,
      lockstepOk: jsHash === wasmHash && jsVm.consoleOut === wasmVm.consoleOut
    };
  }

  globalThis.TCC5Browser = { compileAndLinkBrowser, runOnTriton5, getTritonSystem };

  function initUI() {
    const srcEl = document.getElementById('c-source');
    const outEl = document.getElementById('console-out');
    const asmEl = document.getElementById('asm-out');
    const cStats = document.getElementById('compile-stats');
    const rStatus = document.getElementById('run-status');
    const aStats = document.getElementById('asm-stats');

    document.getElementById('btn-compile').addEventListener('click', () => {
      try {
        const res = compileAndLinkBrowser(srcEl.value);
        cStats.textContent = 'Compiled in ' + res.elapsedMs + ' ms';
        cStats.className = 'status-ok';
        const secMap = Object.values(res.exe.sections).map(s =>
          s.name.padEnd(12) + ' C=' + s.cAddr + ' M=' + s.machAddr + ' size=' + s.size + ' pages=' + s.pageCount
        ).join('\\n');
        aStats.textContent = res.exe.image.length + ' trytes';
        asmEl.textContent = '=== .t5x Section Map (2,187-tryte pages) ===\\n' + secMap + '\\n\\n=== Assembly ===\\n' + res.asm;
      } catch (e) {
        cStats.textContent = 'Error';
        cStats.className = 'status-err';
        outEl.textContent = String(e.message || e);
      }
    });

    document.getElementById('btn-run').addEventListener('click', () => {
      try {
        const res = compileAndLinkBrowser(srcEl.value);
        cStats.textContent = 'Compiled in ' + res.elapsedMs + ' ms';
        cStats.className = 'status-ok';
        const secMap = Object.values(res.exe.sections).map(s =>
          s.name.padEnd(12) + ' C=' + s.cAddr + ' M=' + s.machAddr + ' size=' + s.size + ' pages=' + s.pageCount
        ).join('\\n');
        aStats.textContent = res.exe.image.length + ' trytes';
        asmEl.textContent = '=== .t5x Section Map (2,187-tryte pages) ===\\n' + secMap + '\\n\\n=== Assembly ===\\n' + res.asm;

        const run = runOnTriton5(res.exe);
        outEl.textContent = run.consoleOut + '\\n---\\n' +
          'Steps: ' + run.jsSteps + ' | Halted: ' + run.halted +
          ' | JS===WASM: ' + (run.lockstepOk ? 'LOCKSTEP OK' : 'MISMATCH') +
          ' (hash ' + run.jsHash + ')';
        rStatus.textContent = run.lockstepOk ? 'JS ≡ WASM LOCKSTEP OK' : 'MISMATCH';
        rStatus.className = run.lockstepOk ? 'status-ok' : 'status-err';
      } catch (e) {
        rStatus.textContent = 'Error';
        rStatus.className = 'status-err';
        outEl.textContent = String(e.message || e);
      }
    });
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', initUI);
  else initUI();
})();
</script>
</body>
</html>
`;

  const outPath = path.join(ROOT, 'triton5-cc.html');
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`Built ${outPath} (${html.length} bytes)`);
}

if (require.main === module) buildHtml();
module.exports = { buildHtml };
