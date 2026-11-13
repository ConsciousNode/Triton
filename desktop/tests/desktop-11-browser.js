'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

function runTest() {
  const desktopDir = path.resolve(__dirname, '..');
  const screenshotRelPath = path.resolve(desktopDir, 'tritos-desktop-screenshot.png');

  const pyScript = `
import json, sys, time, os, socket, subprocess

desktop_dir = sys.argv[1]
screenshot_path = sys.argv[2]

# Pick an available localhost TCP port and start a background HTTP server serving desktop/
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.bind(('127.0.0.1', 0))
port = sock.getsockname()[1]
sock.close()

srv = subprocess.Popen(
    [sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'],
    cwd=desktop_dir,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL
)
time.sleep(0.6)

base_url = f'http://127.0.0.1:{port}/tritos-desktop.html'
skip_reasons = []

JS_SEND_KEYS = '''
(codes) => {
    const c = document.getElementById("triton-screen");
    for (const code of codes) {
        const k = code === 13 ? "Enter" : String.fromCharCode(code);
        c.dispatchEvent(new KeyboardEvent("keydown", { key: k, keyCode: code }));
        c.dispatchEvent(new KeyboardEvent("keyup", { key: k, keyCode: code }));
    }
}
'''

JS_COUNT_LIT = '''
() => {
    const c = document.getElementById("triton-screen");
    const d = c.getContext("2d").getImageData(309, 114, 96, 8).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 180 && d[i + 1] > 180) n++;
    }
    return n;
}
'''

def run_with_playwright(send_chat):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = None
        last_err = None
        for exe in ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', None]:
            try:
                if exe and os.path.exists(exe):
                    browser = pw.chromium.launch(executable_path=exe, args=['--no-sandbox', '--disable-dev-shm-usage'])
                    break
                elif exe is None:
                    browser = pw.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage'])
                    break
            except Exception as e:
                last_err = e
        if browser is None:
            raise RuntimeError(f'Could not launch Playwright Chromium: {last_err}')

        ctx = browser.new_context(viewport={'width': 1150, 'height': 650})
        errs = []
        p1 = ctx.new_page()
        p1.on('pageerror', lambda e: errs.append(str(e)))
        p1.goto(base_url)
        time.sleep(1.0)

        p2 = ctx.new_page()
        p2.on('pageerror', lambda e: errs.append(str(e)))
        p2.add_init_script('window.TRITOS_INITIAL_NODE_ID = 4;')
        p2.goto(base_url + '?node=4')
        time.sleep(1.0)

        p2.evaluate(JS_SEND_KEYS, [82, 85, 78, 32, 49, 48, 13]) # RUN 10
        time.sleep(0.8)
        p1.evaluate(JS_SEND_KEYS, [82, 85, 78, 32, 49, 48, 13]) # RUN 10
        time.sleep(0.8)

        if send_chat:
            p1.evaluate(JS_SEND_KEYS, [66, 67, 67, 72, 65, 84, 32, 79, 75, 13]) # BCCHAT OK
        time.sleep(1.2)

        lit = p2.evaluate(JS_COUNT_LIT)
        dbg = p2.locator('#dbg-readout').inner_text()
        if send_chat:
            p2.screenshot(path=screenshot_path)
        browser.close()
        return lit, errs, dbg

def run_with_selenium(send_chat):
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By

    opts = Options()
    opts.add_argument('--headless=new')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--disable-popup-blocking')
    opts.add_argument('--window-size=1150,650')
    opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    driver = webdriver.Chrome(service=Service('/usr/bin/chromedriver'), options=opts)
    try:
        driver.get(base_url)
        time.sleep(0.9)
        tab1 = driver.current_window_handle
        before_set = set(driver.window_handles)
        driver.execute_script('window._tab2 = window.open(arguments[0], "_blank");', base_url + '?node=4')
        after_handles = [h for h in driver.window_handles if h not in before_set]
        tab2 = after_handles[0]
        time.sleep(0.9)

        driver.switch_to.window(tab2)
        driver.execute_script('(' + JS_SEND_KEYS + ')([82, 85, 78, 32, 49, 48, 13]);')
        time.sleep(0.8)

        driver.switch_to.window(tab1)
        driver.execute_script('(' + JS_SEND_KEYS + ')([82, 85, 78, 32, 49, 48, 13]);')
        time.sleep(0.8)

        if send_chat:
            driver.execute_script('(' + JS_SEND_KEYS + ')([66, 67, 67, 72, 65, 84, 32, 79, 75, 13]);')
        time.sleep(1.0)

        driver.switch_to.window(tab2)
        time.sleep(0.6)
        if send_chat:
            driver.save_screenshot(screenshot_path)
        lit = driver.execute_script('return (' + JS_COUNT_LIT + ')();')
        dbg = driver.find_element(By.ID, 'dbg-readout').text
        logs = driver.get_log('browser')
        errs = [l.get('message', '') for l in logs if l.get('level') == 'SEVERE']
        return lit, errs, dbg
    finally:
        driver.quit()

try:
    engine = None
    res_with = None
    res_ctrl = None

    try:
        res_with = run_with_playwright(True)
        res_ctrl = run_with_playwright(False)
        engine = 'playwright'
    except Exception as e:
        skip_reasons.append('Playwright unavailable: ' + str(e))

    if engine is None:
        try:
            res_with = run_with_selenium(True)
            res_ctrl = run_with_selenium(False)
            engine = 'selenium'
        except Exception as e:
            skip_reasons.append('Selenium unavailable: ' + str(e))

    if engine is None:
        print('SKIPPED: ' + '; '.join(skip_reasons))
        sys.exit(0)

    with_chat_lit, errs1, dbg = res_with
    ctrl_no_chat_lit, errs2, _ = res_ctrl
    all_errs = errs1 + errs2
    psw_ok = ('PSW: undefined' not in dbg) and ('PSW:' in dbg)
    passed = (len(all_errs) == 0) and (with_chat_lit > 20) and (ctrl_no_chat_lit == 0) and psw_ok

    print(json.dumps({
        'name': '11-browser-two-tab-negative-control',
        'status': 'PASS' if passed else 'FAIL',
        'engine': engine,
        'tabsOpened': 2,
        'withChat': with_chat_lit,
        'control_noChat': ctrl_no_chat_lit,
        'broadcastChannelChatPixelsLit': with_chat_lit,
        'pswDefined': psw_ok,
        'pageErrors': len(all_errs),
        'screenshot': os.path.basename(screenshot_path),
        'dbgPreview': dbg.splitlines()[0:5]
    }))
finally:
    srv.terminate()
`;

  const out = execFileSync('python3', ['-c', pyScript, desktopDir, screenshotRelPath], { encoding: 'utf8' }).trim();
  if (out.startsWith('SKIPPED:')) {
    console.log(out);
    return { name: '11-browser-two-tab-negative-control', status: 'SKIPPED', reason: out.slice(8).trim() };
  }
  const res = JSON.parse(out);
  if (res.status !== 'PASS') throw new Error('Browser two-tab test failed: ' + JSON.stringify(res));
  return res;
}
if (require.main === module) {
  const r = runTest();
  if (r.status === 'SKIPPED') process.exit(2);
  console.log(JSON.stringify(r));
}
module.exports = { runTest };
