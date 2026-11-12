'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

function runTest() {
  const pyScript = `
import json, time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains

html_path = '/working_dir/c_d48e23af370d973a/artifacts/file_generation/ttl=63d/output/tritos-desktop.html'
screenshot_path = '/working_dir/c_d48e23af370d973a/artifacts/file_generation/ttl=63d/output/tritos-desktop-screenshot.png'
html_str = open(html_path, 'r', encoding='utf-8').read()

opts = Options()
opts.add_argument('--headless=new')
opts.add_argument('--no-sandbox')
opts.add_argument('--disable-dev-shm-usage')
opts.add_argument('--window-size=1150,620')
opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})

driver = webdriver.Chrome(service=Service('/usr/bin/chromedriver'), options=opts)
try:
    driver.get('about:blank')
    driver.execute_script('document.open(); document.write(arguments[0]); document.close(); window.dispatchEvent(new Event("DOMContentLoaded"));', html_str)
    time.sleep(1.2)
    canvas = driver.find_element(By.ID, 'triton-screen')
    canvas.click()
    ActionChains(driver).send_keys('RUN 1\\n').perform()
    time.sleep(0.8)
    ActionChains(driver).send_keys('HELLO TRITOS DESKTOP 1.0!\\x13').perform()
    time.sleep(0.8)
    driver.save_screenshot(screenshot_path)
    dbg = driver.find_element(By.ID, 'dbg-readout').text
    logs = driver.get_log('browser')
    errors = [l for l in logs if l.get('level') == 'SEVERE']
    print(json.dumps({
        'name': '11-browser',
        'status': 'PASS' if len(errors) == 0 else 'FAIL',
        'pageErrors': len(errors),
        'screenshot': screenshot_path,
        'dbgPreview': dbg.splitlines()[0:3]
    }))
finally:
    driver.quit()
`;
  const out = execFileSync('python3', ['-c', pyScript], { encoding: 'utf8' }).trim();
  const res = JSON.parse(out);
  if (res.status !== 'PASS') throw new Error('Browser test had page errors: ' + JSON.stringify(res));
  return res;
}
if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
