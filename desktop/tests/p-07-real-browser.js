'use strict';
/**
 * p-07: Real headless Chromium browser test.
 * 1. Loads triton4.html and tritos-desktop-2.html with 0 page errors and 0 console errors.
 * 2. Saves a screenshot of the Clock app (desktop/p07-clock-screenshot.png).
 * 3. Fixes the browser clock to 2031-02-03T04:05:06Z via CDP init script and verifies
 *    the guest's RTC is within 2 seconds of that time by reading the Clock app's on-screen
 *    time via the framebuffer text reader (readFbString). Never reads host clock variables.
 */
const path = require('path');
const { execFileSync } = require('child_process');
const { desktopDir, appendResult } = require('./p-common.js');

function runTest() {
  const tritonDir = path.resolve(desktopDir, '..');
  const t4Path = path.join(tritonDir, 'triton4.html');
  const d2Path = path.join(desktopDir, 'tritos-desktop-2.html');
  const screenshotPath = path.join(desktopDir, 'p07-clock-screenshot.png');
  const targetMs = Date.UTC(2031, 1, 3, 4, 5, 6); // 2031-02-03T04:05:06Z
  const expectedRtcSec = Math.floor((targetMs - Date.UTC(2000, 0, 1, 0, 0, 0)) / 1000);

  const pyScript = `
import base64, json, sys, time, os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

t4_path = sys.argv[1]
d2_path = sys.argv[2]
screenshot_path = sys.argv[3]
target_ms = int(sys.argv[4])
expected_rtc_sec = int(sys.argv[5])

def make_driver():
    opts = Options()
    opts.add_argument('--headless=new')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--window-size=1150,700')
    opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    svc = Service('/usr/bin/chromedriver') if os.path.exists('/usr/bin/chromedriver') else Service()
    return webdriver.Chrome(service=svc, options=opts)

def collect_errors(driver):
    logs = driver.get_log('browser')
    errs = [l.get('message', '') for l in logs if l.get('level') == 'SEVERE']
    page_errs = driver.execute_script('return window.__p07PageErrors || [];')
    return errs, page_errs

ERR_HOOK = '''
window.__p07PageErrors = [];
window.addEventListener('error', (e) => window.__p07PageErrors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', (e) => window.__p07PageErrors.push(String(e.reason || e)));
'''

READ_FB_CLOCK_JS = '''
() => {
  const vm = window.wasmVm;
  const T = window.TritonSystem;
  const gmap = new Map();
  for (let c = 32; c < 128; c++) {
    const g = T.T3_FONT_9X9[c - 32];
    const key = Array.from(g).join(',');
    if (!gmap.has(key)) gmap.set(key, String.fromCharCode(c));
  }
  const shColor = (typeof T.T3_FONT_SHADOW_COLOR === 'number') ? T.T3_FONT_SHADOW_COLOR : -358;
  const bgColor = -320;
  function readChar(x, y) {
    const rows = [];
    for (let r = 0; r < 9; r++) {
      let val = 0;
      for (let col = 0; col < 9; col++) {
        const px = vm.getMem(T.T3_FB_BASE + (y + r) * T.T3_FB_WIDTH + (x + col));
        const trit = (px === bgColor) ? 0 : (px === shColor ? -1 : 1);
        val = val * 3 + trit;
      }
      rows.push(val);
    }
    return gmap.get(rows.join(',')) || '?';
  }
  let s = '';
  for (let i = 0; i < 8; i++) s += readChar(561 + i * 9, 50);
  return s;
}
'''

with open(t4_path, 'rb') as f:
    t4_b64 = base64.b64encode(f.read()).decode('ascii')
with open(d2_path, 'rb') as f:
    d2_b64 = base64.b64encode(f.read()).decode('ascii')

# 1. Load triton4.html and check 0 console/page errors
d1 = make_driver()
try:
    d1.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': ERR_HOOK})
    d1.get('data:text/html;base64,' + t4_b64)
    time.sleep(0.8)
    t4_console_errs, t4_page_errs = collect_errors(d1)
    t4_title = d1.title
finally:
    d1.quit()

# 2. Load tritos-desktop-2.html with fixed browser clock 2031-02-03T04:05:06Z
d2 = make_driver()
try:
    clock_override = ERR_HOOK + f'''
(function() {{
  const fixedMs = {target_ms};
  Date.now = function() {{ return fixedMs; }};
}})();
'''
    d2.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': clock_override})
    d2.get('data:text/html;base64,' + d2_b64)
    time.sleep(1.5)

    # Step VM briefly to ensure Clock app has rendered, then read Clock via readFbString
    d2.execute_script('if (window.wasmVm) { window.wasmVm.run(100000); }')
    time.sleep(0.3)
    clock_utc_str = d2.execute_script('return (' + READ_FB_CLOCK_JS + ')();')
    d2.save_screenshot(screenshot_path)

    d2_console_errs, d2_page_errs = collect_errors(d2)
    d2_title = d2.title
finally:
    d2.quit()

print(json.dumps({
    't4Title': t4_title,
    't4ConsoleErrors': len(t4_console_errs),
    't4PageErrors': len(t4_page_errs),
    'd2Title': d2_title,
    'd2ConsoleErrors': len(d2_console_errs),
    'd2PageErrors': len(d2_page_errs),
    'clockUtcStr': clock_utc_str,
    'expectedUtcStr': '04:05:06',
    'expectedRtcSec': expected_rtc_sec,
    'screenshot': os.path.basename(screenshot_path),
    'errors': t4_console_errs + t4_page_errs + d2_console_errs + d2_page_errs
}))
`;

  const out = execFileSync('python3', ['-c', pyScript, t4Path, d2Path, screenshotPath, String(targetMs), String(expectedRtcSec)], {
    encoding: 'utf8',
    timeout: 60000
  }).trim();

  const res = JSON.parse(out.split('\n').pop());
  if (res.t4ConsoleErrors !== 0 || res.t4PageErrors !== 0 || res.d2ConsoleErrors !== 0 || res.d2PageErrors !== 0) {
    throw new Error('Browser console/page errors detected: ' + JSON.stringify(res));
  }

  const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(res.clockUtcStr);
  if (!m) {
    throw new Error(`Expected HH:MM:SS from Clock app framebuffer, got ${JSON.stringify(res.clockUtcStr)}`);
  }
  const gotSecOfDay = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  const expSecOfDay = 4 * 3600 + 5 * 60 + 6;
  const deltaSec = Math.abs(gotSecOfDay - expSecOfDay);
  if (deltaSec > 2) {
    throw new Error(`Clock app time ${res.clockUtcStr} differs from 04:05:06 by ${deltaSec}s (> 2s)`);
  }

  const numbers = {
    t4ConsoleErrors: res.t4ConsoleErrors,
    t4PageErrors: res.t4PageErrors,
    d2ConsoleErrors: res.d2ConsoleErrors,
    d2PageErrors: res.d2PageErrors,
    clockUtcStr: res.clockUtcStr,
    expectedUtcStr: res.expectedUtcStr,
    deltaSec,
    screenshot: res.screenshot
  };
  appendResult({ testId: 'p-07', backend: 'Chromium+WASM', seed: 0, pass: true, numbers });
  return { name: 'p-07-real-browser', status: 'PASS', ...numbers };
}

if (require.main === module) {
  console.log(JSON.stringify(runTest()));
}
module.exports = { runTest };
