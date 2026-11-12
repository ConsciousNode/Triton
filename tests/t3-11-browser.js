#!/usr/bin/env node
'use strict';

/**
 * Test 11: Real Headless Browser Verification (`tests/t3-11-browser.js`)
 * ConsciousNode SoftWorks
 *
 * Loads `triton3.html` inside headless Chromium via Selenium WebDriver (`data:text/html;base64`),
 * boots TritOS 3.0 in lockstep on JS and MicroWAT WASM, executes interactive shell commands
 * (`list`, `calc 10T+11`, `user`), verifies the 729x486 canvas renders non-zero pixels,
 * and asserts 0 browser console/page errors.
 * Includes a positive control verifying that an injected runtime error is captured by Chromium's
 * browser error log.
 */

const { execFileSync } = require('child_process');
const { loadHtmlModule } = require('./t3-common');
const { htmlPath } = loadHtmlModule('triton3.html');

const t0 = Date.now();

const pyScript = `
import base64, json, sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

html_path = sys.argv[1]
with open(html_path, "rb") as f:
    raw_bytes = f.read()
b64 = base64.b64encode(raw_bytes).decode("ascii")

opts = Options()
opts.add_argument("--headless=new")
opts.add_argument("--no-sandbox")
opts.add_argument("--disable-dev-shm-usage")
opts.set_capability("goog:loggingPrefs", {"browser": "ALL"})

driver = webdriver.Chrome(options=opts)
try:
    # 1. Load triton3.html and verify boot + UI commands + 0 page errors
    driver.get("data:text/html;base64," + b64)
    logs_boot = driver.get_log("browser")
    title = driver.title
    console_boot = driver.execute_script("return document.getElementById('console-output').textContent;")
    sync_boot = driver.execute_script("return document.getElementById('sync-indicator').textContent;")

    # Click quick-cmd buttons 'list', 'calc 10T+11', and 'user'
    driver.execute_script("document.querySelector('button[data-cmd=\\"list\\"]').click();")
    driver.execute_script("document.querySelector('button[data-cmd=\\"calc 10T+11\\"]').click();")
    driver.execute_script("document.querySelector('button[data-cmd=\\"user\\"]').click();")

    console_after = driver.execute_script("return document.getElementById('console-output').textContent;")
    sync_after = driver.execute_script("return document.getElementById('sync-indicator').textContent;")
    non_zero_px = driver.execute_script("""
      const c = document.getElementById('triton-screen');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let nz = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] !== 0 || d[i+1] !== 0 || d[i+2] !== 0) nz++;
      }
      return nz;
    """)
    logs_after = driver.get_log("browser")

    # 2. Positive Control: inject a page with a deliberate ReferenceError and verify Chromium logs it
    bad_html = b"<!DOCTYPE html><html><body><script>nonExistentTritonFunctionCall();</script></body></html>"
    driver.get("data:text/html;base64," + base64.b64encode(bad_html).decode("ascii"))
    bad_logs = driver.get_log("browser")

    print(json.dumps({
        "title": title,
        "logsBoot": logs_boot,
        "logsAfter": logs_after,
        "consoleBoot": console_boot,
        "consoleAfter": console_after,
        "syncBoot": sync_boot,
        "syncAfter": sync_after,
        "nonZeroPixels": non_zero_px,
        "positiveControlLogs": len(bad_logs)
    }))
finally:
    driver.quit()
`;

const rawOut = execFileSync('python3', ['-c', pyScript, htmlPath], { encoding: 'utf8' });
const res = JSON.parse(rawOut.trim());

if (res.logsBoot.length !== 0 || res.logsAfter.length !== 0) {
  throw new Error(`[Test 11] Browser reported page errors: ${JSON.stringify([...res.logsBoot, ...res.logsAfter])}`);
}
if (!res.consoleBoot.includes('TritOS 3.0') ||
    !res.consoleAfter.includes('FILES ON DISK:') ||
    !res.consoleAfter.includes('= 110 (12)') ||
    !res.consoleAfter.includes('USR:OK')) {
  throw new Error(`[Test 11] Unexpected browser console transcript: ${res.consoleAfter}`);
}
if (res.syncBoot !== 'JS ≡ WASM LOCKSTEP OK' || res.syncAfter !== 'JS ≡ WASM LOCKSTEP OK') {
  throw new Error(`[Test 11] Lockstep indicator mismatch in browser: ${res.syncAfter}`);
}
if (res.nonZeroPixels <= 0) {
  throw new Error('[Test 11] 729x486 canvas rendered 0 lit pixels in browser');
}
if (res.positiveControlLogs === 0) {
  throw new Error('[Test 11] Positive control failed: Chromium did not log injected ReferenceError!');
}

console.log(`[PASS] t3-11-browser: Headless Chromium booted triton3.html, ran shell/calc/user in lockstep (${res.nonZeroPixels.toLocaleString()} lit pixels, 0 page errors + positive control) in ${Date.now() - t0} ms`);
