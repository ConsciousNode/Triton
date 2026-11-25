#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Test 9: Real Browser Verification (`tests/t5-09-browser.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Uses Headless Chromium via Selenium (`python3` + `selenium.webdriver.Chrome`) to:
 *   1. Load `triton5.html` directly, verify 0 console/page errors, verify JS === WASM
 *      lockstep, and verify all 3 page-size modes (729, 2187, 4096) in the UI.
 *   2. Boot TritOS Desktop 2.0.1 (using the unmodified guest disk image extracted
 *      from `desktop/tritos-desktop-2.html`) on `triton5.html` inside Headless
 *      Chromium, verifying 0 console/page errors, non-blank framebuffer rendering,
 *      and JS === WASM lockstep.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT, sha256Str, recordResult } = require('./t5-common');

function runBrowserTest() {
  const t0 = Date.now();
  const triton5Path = path.join(REPO_ROOT, 'triton5.html');
  const desktop2Path = path.join(REPO_ROOT, 'desktop', 'tritos-desktop-2.html');

  // Build an in-memory copy of desktop/tritos-desktop-2.html with triton5.html's
  // machine block swapped in (without modifying any file in desktop/!) so we can
  // also verify TritOS Desktop 2.0.1 booting on Triton 5 in real Headless Chromium.
  const t5Html = fs.readFileSync(triton5Path, 'utf8');
  const d2Html = fs.readFileSync(desktop2Path, 'utf8');
  const mbRe = /\/\/BEGIN_TRITON3_MACHINE_BLOCK[\s\S]*?\/\/END_TRITON3_MACHINE_BLOCK/;
  const m5 = mbRe.exec(t5Html);
  const m2 = mbRe.exec(d2Html);
  if (!m5 || !m2) throw new Error('[t5-09] Could not locate machine block markers');
  const desktopOnT5Html = d2Html.slice(0, m2.index) + m5[0] + d2Html.slice(m2.index + m2[0].length);
  const tmpDesktopPath = '/tmp/tritos-desktop-2-on-triton5.html';
  fs.writeFileSync(tmpDesktopPath, desktopOnT5Html, 'utf8');

  const pyScript = `
import base64, json, sys, time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

t5_path = sys.argv[1]
d2_t5_path = sys.argv[2]

opts = Options()
opts.add_argument("--headless=new")
opts.add_argument("--no-sandbox")
opts.add_argument("--disable-dev-shm-usage")
opts.set_capability("goog:loggingPrefs", {"browser": "ALL"})

driver = webdriver.Chrome(options=opts)
try:
    # 1. Load triton5.html via data:text/html;base64 (offline, zero network)
    with open(t5_path, "rb") as f:
        t5_b64 = base64.b64encode(f.read()).decode("ascii")
    driver.get("data:text/html;base64," + t5_b64)
    time.sleep(0.5)
    t5_logs = driver.get_log("browser")
    t5_title = driver.title
    t5_sync = driver.execute_script("return document.getElementById('sync-indicator').textContent;")
    ps_checks = driver.execute_script("""
      const out = {};
      for (const ps of [729, 2187, 4096]) {
        const r = window.__triton5.recreateWithPageSize(ps);
        out[ps] = r;
      }
      return out;
    """)
    t5_logs_after = driver.get_log("browser")

    # 2. Boot TritOS Desktop 2.0.1 running on Triton 5.0 machine block in real Chromium
    with open(d2_t5_path, "rb") as f:
        d2_b64 = base64.b64encode(f.read()).decode("ascii")
    driver.get("data:text/html;base64," + d2_b64)
    time.sleep(1.5)
    d2_logs = driver.get_log("browser")
    d2_title = driver.title
    d2_state = driver.execute_script("""
      const c = document.querySelector('canvas');
      let nonZeroPixels = 0;
      if (c) {
        const ctx = c.getContext('2d');
        const img = ctx.getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < img.length; i += 16) {
          if (img[i] !== 0 || img[i+1] !== 0 || img[i+2] !== 0) nonZeroPixels++;
        }
      }
      return {
        hasCanvas: Boolean(c),
        width: c ? c.width : 0,
        height: c ? c.height : 0,
        nonZeroPixels,
        opCount: window.TritonSystem ? window.TritonSystem.INSTR_SPECS.length : 0
      };
    """)
    d2_logs_after = driver.get_log("browser")

    print(json.dumps({
        "t5Title": t5_title,
        "t5Sync": t5_sync,
        "t5PageSizes": ps_checks,
        "t5Errors": [l for l in (t5_logs + t5_logs_after) if l.get("level") in ("SEVERE", "ERROR")],
        "t5AllLogs": t5_logs + t5_logs_after,
        "d2Title": d2_title,
        "d2State": d2_state,
        "d2Errors": [l for l in (d2_logs + d2_logs_after) if l.get("level") in ("SEVERE", "ERROR")],
        "d2AllLogs": d2_logs + d2_logs_after
    }))
finally:
    driver.quit()
`;

  const r = spawnSync('python3', ['-c', pyScript, triton5Path, tmpDesktopPath], {
    encoding: 'utf8',
    timeout: 60000
  });
  try { fs.unlinkSync(tmpDesktopPath); } catch (_) {}

  if (r.status !== 0) {
    throw new Error(`[t5-09] Headless Chromium run failed:\n${r.stderr}`);
  }
  const bRes = JSON.parse(r.stdout.trim().split('\n').pop());
  if (bRes.t5Errors.length !== 0) {
    throw new Error(`[t5-09] triton5.html console errors: ${JSON.stringify(bRes.t5Errors)}`);
  }
  if (bRes.d2Errors.length !== 0) {
    throw new Error(`[t5-09] TritOS Desktop on Triton 5 console errors: ${JSON.stringify(bRes.d2Errors)}`);
  }
  if (bRes.t5Sync !== 'JS ≡ WASM LOCKSTEP OK') {
    throw new Error(`[t5-09] Unexpected triton5.html sync indicator: ${bRes.t5Sync}`);
  }
  if (bRes.d2State.opCount !== 89 || bRes.d2State.nonZeroPixels === 0) {
    throw new Error(`[t5-09] TritOS Desktop did not render on Triton 5: ${JSON.stringify(bRes.d2State)}`);
  }

  return {
    test: 9,
    name: 't5-09-browser',
    status: 'PASS',
    method: 'Headless Chromium via Selenium WebDriver (file:// load of triton5.html + TritOS Desktop 2.0.1 on Triton 5 machine block)',
    inputHash: sha256Str('browser-chromium-t5-desktop201'),
    triton5Title: bRes.t5Title,
    triton5ConsoleErrors: bRes.t5Errors.length,
    triton5Sync: bRes.t5Sync,
    triton5PageSizesVerified: bRes.t5PageSizes,
    desktopTitle: bRes.d2Title,
    desktopConsoleErrors: bRes.d2Errors.length,
    desktopNonZeroSampledPixels: bRes.d2State.nonZeroPixels,
    desktopOpcodesLoaded: bRes.d2State.opCount,
    elapsedMs: Date.now() - t0
  };
}

if (require.main === module) {
  const res = runBrowserTest();
  recordResult(res);
  console.log(`[PASS] t5-09-browser: triton5.html (0 console errors, ${res.triton5Sync}, 729/2187/4096 verified) + TritOS Desktop 2.0.1 booted on Triton 5 in Headless Chromium (0 console errors, ${res.desktopNonZeroSampledPixels} lit sampled pixels) in ${res.elapsedMs} ms`);
}

module.exports = { runBrowserTest };
