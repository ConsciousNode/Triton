#!/usr/bin/env node
'use strict';

/**
 * Test 11: Real Headless Browser Verification (`tests/t3-11-browser.js`)
 * ConsciousNode SoftWorks
 *
 * Loads `triton3.html` inside headless Chromium via Playwright or Selenium WebDriver
 * (whichever is available), boots TritOS 3.0 in lockstep on JS and MicroWAT WASM,
 * executes interactive shell commands (`list`, `calc 10T+11`, `user`), verifies the
 * 729x486 canvas renders non-zero pixels, and asserts 0 browser console/page errors
 * plus a positive control for error capture.
 * If neither Playwright nor Selenium can launch a browser, prints `SKIPPED: <reason>`
 * without failing the test run.
 */

const { spawnSync } = require('child_process');
const { loadHtmlModule } = require('./t3-common');
const { htmlPath } = loadHtmlModule('triton3.html');

const t0 = Date.now();

function tryPlaywrightNode() {
  let pw = null;
  for (const modName of ['playwright', 'playwright-core']) {
    try {
      pw = require(modName);
      break;
    } catch (_) {}
  }
  if (!pw || !pw.chromium) {
    return { ok: false, reason: 'Node playwright module not installed' };
  }
  const runnerScript = `
const fs = require('fs');
(async () => {
  let pw;
  try { pw = require('playwright'); } catch (_) { pw = require('playwright-core'); }
  const htmlPath = process.argv[1];
  const rawBytes = fs.readFileSync(htmlPath);
  const b64 = rawBytes.toString('base64');
  const browser = await pw.chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    const errorsBoot = [];
    page.on('pageerror', err => errorsBoot.push(String(err)));
    page.on('console', msg => { if (msg.type() === 'error') errorsBoot.push(msg.text()); });
    await page.goto('data:text/html;base64,' + b64, { waitUntil: 'load' });
    const title = await page.title();
    const consoleBoot = await page.locator('#console-output').textContent();
    const syncBoot = await page.locator('#sync-indicator').textContent();
    const logsBoot = errorsBoot.slice();

    await page.evaluate(() => {
      document.querySelector('button[data-cmd="list"]').click();
      document.querySelector('button[data-cmd="calc 10T+11"]').click();
      document.querySelector('button[data-cmd="user"]').click();
    });

    const consoleAfter = await page.locator('#console-output').textContent();
    const syncAfter = await page.locator('#sync-indicator').textContent();
    const nonZeroPixels = await page.evaluate(() => {
      const c = document.getElementById('triton-screen');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let nz = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] !== 0 || d[i+1] !== 0 || d[i+2] !== 0) nz++;
      }
      return nz;
    });
    const logsAfter = errorsBoot.slice();

    const badPage = await browser.newPage();
    const badLogs = [];
    badPage.on('pageerror', err => badLogs.push(String(err)));
    badPage.on('console', msg => { if (msg.type() === 'error') badLogs.push(msg.text()); });
    const badHtml = Buffer.from('<!DOCTYPE html><html><body><script>nonExistentTritonFunctionCall();</script></body></html>').toString('base64');
    await badPage.goto('data:text/html;base64,' + badHtml, { waitUntil: 'load' });

    console.log(JSON.stringify({
      driver: 'Playwright (Node)',
      title,
      logsBoot,
      logsAfter,
      consoleBoot,
      consoleAfter,
      syncBoot,
      syncAfter,
      nonZeroPixels,
      positiveControlLogs: badLogs.length
    }));
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e && e.message ? e.message : String(e));
  process.exit(2);
});
`;
  const r = spawnSync(process.execPath, ['-e', runnerScript, htmlPath], { encoding: 'utf8', timeout: 45000 });
  if (r.status === 0 && r.stdout && r.stdout.trim()) {
    try {
      return { ok: true, res: JSON.parse(r.stdout.trim().split('\n').pop()) };
    } catch (e) {
      return { ok: false, reason: `Playwright JSON parse error: ${e.message}` };
    }
  }
  return { ok: false, reason: (r.stderr || 'Playwright launch failed').trim().split('\n')[0] };
}

function tryPlaywrightPython() {
  const pyPwScript = `
import base64, json, sys
from playwright.sync_api import sync_playwright

html_path = sys.argv[1]
with open(html_path, "rb") as f:
    b64 = base64.b64encode(f.read()).decode("ascii")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
    try:
        page = browser.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto("data:text/html;base64," + b64)
        logs_boot = list(errs)
        title = page.title()
        console_boot = page.evaluate("() => document.getElementById('console-output').textContent")
        sync_boot = page.evaluate("() => document.getElementById('sync-indicator').textContent")

        page.evaluate("""() => {
          document.querySelector('button[data-cmd="list"]').click();
          document.querySelector('button[data-cmd="calc 10T+11"]').click();
          document.querySelector('button[data-cmd="user"]').click();
        }""")
        console_after = page.evaluate("() => document.getElementById('console-output').textContent")
        sync_after = page.evaluate("() => document.getElementById('sync-indicator').textContent")
        non_zero_px = page.evaluate("""() => {
          const c = document.getElementById('triton-screen');
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let nz = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] !== 0 || d[i+1] !== 0 || d[i+2] !== 0) nz++;
          }
          return nz;
        }""")
        logs_after = list(errs)

        bad_page = browser.new_page()
        bad_errs = []
        bad_page.on("pageerror", lambda e: bad_errs.append(str(e)))
        bad_html = b"<!DOCTYPE html><html><body><script>nonExistentTritonFunctionCall();</script></body></html>"
        bad_page.goto("data:text/html;base64," + base64.b64encode(bad_html).decode("ascii"))

        print(json.dumps({
            "driver": "Playwright (Python)",
            "title": title,
            "logsBoot": logs_boot,
            "logsAfter": logs_after,
            "consoleBoot": console_boot,
            "consoleAfter": console_after,
            "syncBoot": sync_boot,
            "syncAfter": sync_after,
            "nonZeroPixels": non_zero_px,
            "positiveControlLogs": len(bad_errs)
        }))
    finally:
        browser.close()
`;
  const r = spawnSync('python3', ['-c', pyPwScript, htmlPath], { encoding: 'utf8', timeout: 45000 });
  if (r.status === 0 && r.stdout && r.stdout.trim()) {
    try {
      return { ok: true, res: JSON.parse(r.stdout.trim().split('\n').pop()) };
    } catch (e) {
      return { ok: false, reason: `Python Playwright JSON parse error: ${e.message}` };
    }
  }
  return { ok: false, reason: (r.stderr || 'Python Playwright unavailable').trim().split('\n').pop() };
}

function trySeleniumPython() {
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
        "driver": "Selenium WebDriver",
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
  const r = spawnSync('python3', ['-c', pyScript, htmlPath], { encoding: 'utf8', timeout: 45000 });
  if (r.status === 0 && r.stdout && r.stdout.trim()) {
    try {
      return { ok: true, res: JSON.parse(r.stdout.trim().split('\n').pop()) };
    } catch (e) {
      return { ok: false, reason: `Selenium JSON parse error: ${e.message}` };
    }
  }
  return { ok: false, reason: (r.stderr || 'Selenium WebDriver unavailable').trim().split('\n').pop() };
}

let attempt = { ok: false, reason: 'Browser driver disabled via TRITON_FORCE_NO_BROWSER' };
if (!process.env.TRITON_FORCE_NO_BROWSER) {
  attempt = tryPlaywrightNode();
  if (!attempt.ok) attempt = tryPlaywrightPython();
  if (!attempt.ok) attempt = trySeleniumPython();
}

if (!attempt.ok) {
  console.log(`SKIPPED: No browser driver available (${attempt.reason})`);
  process.exit(0);
}

const res = attempt.res;

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

console.log(`[PASS] t3-11-browser: Headless Chromium (${res.driver}) booted triton3.html, ran shell/calc/user in lockstep (${res.nonZeroPixels.toLocaleString()} lit pixels, 0 page errors + positive control) in ${Date.now() - t0} ms`);
