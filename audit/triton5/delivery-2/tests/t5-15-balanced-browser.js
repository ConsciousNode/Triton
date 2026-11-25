#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Stage 2 Test 15: Real Browser Balanced-3^k Verification (`tests/t5-15-balanced-browser.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Uses Headless Chromium via Selenium (`python3` + `selenium.webdriver.Chrome`) to:
 *   1. Load `triton5.html` offline via `data:text/html;base64` with 0 console/page errors.
 *   2. Switch to `balanced-729` (729:balanced) and `balanced-2187` (2187:balanced) in the
 *      live browser, run a real balanced-3^k paged program (verifying centred page tables,
 *      frame >= 1 pure-wiring read/write, and NULL -B fault with EADDR = -B) on BOTH
 *      `TritonJS` and `TritonWASM`, confirming JS === WASM lockstep and 0 console errors.
 */

const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT, sha256Str, recordResult } = require('./t5-common');

function runBalancedBrowserTest() {
  const t0 = Date.now();
  const triton5Path = path.join(REPO_ROOT, 'triton5.html');

  const pyScript = `
import base64, json, sys, time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

t5_path = sys.argv[1]
with open(t5_path, "rb") as f:
    b64 = base64.b64encode(f.read()).decode("ascii")

opts = Options()
opts.add_argument("--headless=new")
opts.add_argument("--no-sandbox")
opts.add_argument("--disable-dev-shm-usage")
opts.set_capability("goog:loggingPrefs", {"browser": "ALL"})

driver = webdriver.Chrome(options=opts)
try:
    driver.get("data:text/html;base64," + b64)
    time.sleep(0.4)
    logs_boot = driver.get_log("browser")

    res = driver.execute_script("""
      const T = window.TritonSystem;
      const out = {};
      for (const ps of [729, 2187]) {
        const B = (ps - 1) / 2;
        const cfg = window.__triton5.recreateWithPageSize(ps, 'balanced');
        const js = window.__triton5.jsVm;
        const wasm = window.__triton5.wasmVm;
        const rwx = T.T5_PTE.V | T.T5_PTE.R | T.T5_PTE.W | T.T5_PTE.X | T.T5_PTE.U;
        const l0Base = 1 * ps;
        const l1Base = 2 * ps;
        const codeVa = 1 * ps - B;
        const pfVa = codeVa + 100;
        const writeWord = (m, pa, val) => {
          const [w0, w1, w2] = T.numberToWord(val);
          m.setMem(pa, w0); m.setMem(pa + 1, w1); m.setMem(pa + 2, w2);
        };
        const NL = String.fromCharCode(10);
        const prog = T.assemble([
          '.mode T3',
          'LI R1, #' + (2 * ps - B),
          'LI R0, #4321',
          'ST R0, R1, #0',
          'LT R2, R1, #0',
          'LI R3, #' + (-B),
          'LT R4, R3, #0',
          'HALT',
          '.org 100',
          'MFSPR R5, #13',
          'HALT'
        ].join(NL), { mode: 'T3' });
        for (const m of [js, wasm]) {
          m.vbr = 0;
          writeWord(m, 13 * 3, pfVa);
          writeWord(m, l0Base + 0 * 3 - 1, 2 * 512 + T.T5_PTE.V);
          writeWord(m, l1Base + 1 * 3 - 1, 3 * 512 + rwx);
          writeWord(m, l1Base + 2 * 3 - 1, 4 * 512 + rwx);
          for (let i = 0; i < prog.trytes.length; i++) {
            if (prog.trytes[i] !== 0) m.setMem(3 * ps - B + i, prog.trytes[i]);
          }
          m.ptbr = l0Base;
          m.pc = codeVa;
          m.pgEn = 1;
          m.flushTlbAll();
        }
        let steps = 0, lockstepOk = true;
        while (!js.halted && steps < 50) {
          js.step(); wasm.step(); steps++;
          if (T.computeStateHash(js) !== T.computeStateHash(wasm)) { lockstepOk = false; break; }
        }
        out[ps] = {
          cfg,
          steps,
          lockstepOk,
          halted: js.halted,
          readBack: js.getWordNum(2),
          wiredPaVal: js.getMem(4 * ps - B),
          nullFaultEaddr: js.getWordNum(5),
          expectedNullEaddr: -B
        };
      }
      return out;
    """)

    logs_after = driver.get_log("browser")
    errors = [l for l in (logs_boot + logs_after) if l.get("level") in ("SEVERE", "ERROR")]
    print(json.dumps({ "errors": errors, "modes": res }))
finally:
    driver.quit()
`;

  const r = spawnSync('python3', ['-c', pyScript, triton5Path], { encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0) {
    throw new Error(`[t5-15] Headless Chromium run failed:\n${r.stderr}`);
  }
  const bRes = JSON.parse(r.stdout.trim().split('\n').pop());
  if (bRes.errors.length !== 0) {
    throw new Error(`[t5-15] Browser console errors: ${JSON.stringify(bRes.errors)}`);
  }
  for (const ps of ['729', '2187']) {
    const m = bRes.modes[ps];
    if (!m || !m.lockstepOk || !m.halted || m.readBack !== 4321 || m.wiredPaVal !== 4321 || m.nullFaultEaddr !== m.expectedNullEaddr) {
      throw new Error(`[t5-15] Browser balanced-${ps} check failed: ${JSON.stringify(m)}`);
    }
  }

  return {
    test: 15,
    name: 't5-15-balanced-browser',
    status: 'PASS',
    method: 'Headless Chromium via Selenium WebDriver (offline data:text/html;base64 load of triton5.html running balanced-729 and balanced-2187)',
    inputHash: sha256Str('balanced-browser-chromium:729,2187'),
    consoleErrors: bRes.errors.length,
    modes: bRes.modes,
    elapsedMs: Date.now() - t0
  };
}

if (require.main === module) {
  const res = runBalancedBrowserTest();
  recordResult(res);
  console.log(`[PASS] t5-15-balanced-browser: triton5.html loaded with 0 console errors in Headless Chromium and ran balanced-729 & balanced-2187 (JS === WASM lockstep, NULL EADDR=-B verified) in ${res.elapsedMs} ms`);
}

module.exports = { runBalancedBrowserTest };
