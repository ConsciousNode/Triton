'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

function runTest() {
  const desktopDir = path.resolve(__dirname, '..');
  const screenshotPath = path.resolve(desktopDir, 'trytris-browser-screenshot.png');

  const pyScript = `
import base64, json, sys, time, os

desktop_dir = sys.argv[1]
screenshot_path = sys.argv[2]
html_path = os.path.join(desktop_dir, 'tritos-desktop.html')

JS_SEND_KEYS = '''
const codes = arguments[0];
const c = document.getElementById("triton-screen");
for (const code of codes) {
    const k = code === 13 ? "Enter" : (code === 32 ? " " : String.fromCharCode(code));
    c.dispatchEvent(new KeyboardEvent("keydown", { key: k, keyCode: code, which: code }));
    c.dispatchEvent(new KeyboardEvent("keyup", { key: k, keyCode: code, which: code }));
}
'''

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    with open(html_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('ascii')

    opts = Options()
    opts.add_argument('--headless=new')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--disable-gpu')
    opts.add_argument('--window-size=1150,700')
    for exe in ['/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium-browser']:
        if os.path.exists(exe):
            opts.binary_location = exe
            break
    service = Service('/usr/bin/chromedriver') if os.path.exists('/usr/bin/chromedriver') else Service()
    drv = webdriver.Chrome(service=service, options=opts)
    drv.get('data:text/html;base64,' + b64)
    WebDriverWait(drv, 15).until(EC.presence_of_element_located((By.ID, 'triton-screen')))
    time.sleep(1.5)

    # Launch App 11 via Terminal RUN 11
    drv.execute_script(JS_SEND_KEYS, [82, 85, 78, 32, 49, 49, 13])
    time.sleep(1.5)

    # Toggle Lockstep mode ('K')
    drv.execute_script(JS_SEND_KEYS, [75])
    time.sleep(0.4)

    # Play 20 hard drops in Lockstep
    for _ in range(20):
        drv.execute_script(JS_SEND_KEYS, [32])
        time.sleep(0.12)
    time.sleep(0.5)

    drv.save_screenshot(screenshot_path)
    logs = drv.get_log('browser')
    severe = [l for l in logs if l.get('level') == 'SEVERE']
    dbg = drv.find_element(By.ID, 'dbg-readout').text
    drv.quit()
    if severe:
        raise RuntimeError(f'Browser console SEVERE errors: {severe}')
    print(json.dumps({
        'name': '27-trytris-browser',
        'status': 'PASS',
        'hardDropsPlayed': 20,
        'screenshot': os.path.basename(screenshot_path),
        'pageErrors': 0,
        'dbg': dbg[:120]
    }))
except Exception as e:
    print(json.dumps({'name': '27-trytris-browser', 'status': 'SKIPPED', 'reason': str(e)}))
`;

  const out = execFileSync('python3', ['-c', pyScript, desktopDir, screenshotPath], { encoding: 'utf8', timeout: 60000 }).trim();
  const res = JSON.parse(out);
  if (res.status === 'SKIPPED') {
    throw new Error('Browser test skipped/failed: ' + res.reason);
  }
  return res;
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
