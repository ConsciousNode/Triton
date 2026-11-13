'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

function runTest() {
  const htmlRelPath = path.resolve(__dirname, '..', 'tritos-desktop.html');
  const screenshotRelPath = path.resolve(__dirname, '..', 'tritos-desktop-screenshot.png');

  const pyScript = `
import json, sys, time, os

html_path = sys.argv[1]
screenshot_path = sys.argv[2]
html_str = open(html_path, 'r', encoding='utf-8').read()

driver = None
engine = None
skip_reasons = []

# Try Playwright first, then Selenium
try:
    from playwright.sync_api import sync_playwright
    engine = 'playwright'
except Exception as e:
    skip_reasons.append('Playwright unavailable: ' + str(e))

if engine is None:
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.action_chains import ActionChains
        opts = Options()
        opts.add_argument('--headless=new')
        opts.add_argument('--no-sandbox')
        opts.add_argument('--disable-dev-shm-usage')
        opts.add_argument('--disable-popup-blocking')
        opts.add_argument('--window-size=1150,650')
        opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
        driver = webdriver.Chrome(service=Service('/usr/bin/chromedriver'), options=opts)
        engine = 'selenium'
    except Exception as e:
        skip_reasons.append('Selenium unavailable: ' + str(e))

if engine is None:
    reason = '; '.join(skip_reasons)
    print('SKIPPED: ' + reason)
    sys.exit(0)

try:
    # Open Tab 1 (Node 3) and spawn Tab 2 (Node 4) from same origin so BroadcastChannel('studionet_v1') is shared
    driver.get('about:blank')
    driver.execute_script(
        'document.open(); document.write(arguments[0]); document.close(); window.dispatchEvent(new Event("DOMContentLoaded"));',
        html_str
    )
    time.sleep(0.8)

    # Open Tab 2 via window.open from Tab 1 so both share the exact same origin for BroadcastChannel('studionet_v1')
    tab1 = driver.current_window_handle
    before_set = set(driver.window_handles)
    driver.execute_script('window._tab2 = window.open("about:blank", "_blank");')
    after_handles = [h for h in driver.window_handles if h not in before_set]
    tab2 = after_handles[0]

    driver.switch_to.window(tab2)
    driver.execute_script(
        'window.TRITOS_INITIAL_NODE_ID = 4; '
        'document.open(); document.write(arguments[0]); document.close(); '
        'window.dispatchEvent(new Event("DOMContentLoaded"));',
        html_str
    )
    time.sleep(0.8)

    # Launch App 10 (Net) on Tab 2 (Node 4) via Terminal "RUN 10"
    driver.execute_script('''
        const c = document.getElementById("triton-screen");
        for (const code of [82, 85, 78, 32, 49, 48, 13]) {
            c.dispatchEvent(new KeyboardEvent("keydown", { key: code === 13 ? "Enter" : String.fromCharCode(code), keyCode: code }));
            c.dispatchEvent(new KeyboardEvent("keyup", { key: code === 13 ? "Enter" : String.fromCharCode(code), keyCode: code }));
        }
    ''')
    time.sleep(0.8)

    # Switch to Tab 1 (Node 3), launch App 10 (Net) via "RUN 10", then type SpiralChat message "BCCHAT OK"
    driver.switch_to.window(tab1)
    driver.execute_script('''
        const c = document.getElementById("triton-screen");
        for (const code of [82, 85, 78, 32, 49, 48, 13]) {
            c.dispatchEvent(new KeyboardEvent("keydown", { key: code === 13 ? "Enter" : String.fromCharCode(code), keyCode: code }));
            c.dispatchEvent(new KeyboardEvent("keyup", { key: code === 13 ? "Enter" : String.fromCharCode(code), keyCode: code }));
        }
    ''')
    time.sleep(0.8)
    driver.execute_script('''
        const c = document.getElementById("triton-screen");
        for (const code of [66, 67, 67, 72, 65, 84, 32, 79, 75, 13]) {
            c.dispatchEvent(new KeyboardEvent("keydown", { key: code === 13 ? "Enter" : String.fromCharCode(code), keyCode: code }));
            c.dispatchEvent(new KeyboardEvent("keyup", { key: code === 13 ? "Enter" : String.fromCharCode(code), keyCode: code }));
        }
    ''')
    time.sleep(0.8)

    # Switch back to Tab 2 (Node 4) to let it render the received BroadcastChannel SpiralChat frame and take screenshot
    driver.switch_to.window(tab2)
    time.sleep(0.8)
    driver.save_screenshot(screenshot_path)

    # Read MMIO framebuffer on Tab 2 via canvas pixel data at screen (309, 114) where received chat is drawn in yellow [255, 255, 128]
    chat_pixels_lit = driver.execute_script('''
        const c = document.getElementById("triton-screen");
        const ctx = c.getContext("2d");
        const img = ctx.getImageData(309, 114, 72, 8).data;
        let lit = 0;
        for (let i = 0; i < img.length; i += 4) {
            if (img[i] > 180 && img[i+1] > 180) lit++;
        }
        return lit;
    ''')

    dbg = driver.find_element(By.ID, 'dbg-readout').text
    logs = driver.get_log('browser')
    errors = [l for l in logs if l.get('level') == 'SEVERE']
    print(json.dumps({
        'name': '11-browser',
        'status': 'PASS' if (len(errors) == 0 and chat_pixels_lit > 20) else 'FAIL',
        'engine': engine,
        'tabsOpened': 2,
        'broadcastChannelChatPixelsLit': chat_pixels_lit,
        'pageErrors': len(errors),
        'screenshot': os.path.basename(screenshot_path),
        'dbgPreview': dbg.splitlines()[0:3]
    }))
finally:
    if driver is not None:
        driver.quit()
`;

  const out = execFileSync('python3', ['-c', pyScript, htmlRelPath, screenshotRelPath], { encoding: 'utf8' }).trim();
  if (out.startsWith('SKIPPED:')) {
    console.log(out);
    return { name: '11-browser', status: 'SKIPPED', reason: out.slice(8).trim() };
  }
  const res = JSON.parse(out);
  if (res.status !== 'PASS') throw new Error('Browser test failed: ' + JSON.stringify(res));
  return res;
}
if (require.main === module) {
  const r = runTest();
  if (r.status === 'SKIPPED') process.exit(2);
  console.log(JSON.stringify(r));
}
module.exports = { runTest };
