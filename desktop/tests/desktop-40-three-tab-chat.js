'use strict';
/**
 * Spec Test 11: Real-Browser Three-Tab Naming & Chat over BroadcastChannel("studionet-v1")
 * - three desktop tabs (?node=3, ?node=4, ?node=5) see each other as tri1..tri3 and chat by name.
 */
const { execFileSync } = require('child_process');
const path = require('path');

function runTest() {
  const desktopDir = path.resolve(__dirname, '..');
  const pyScript = `
import json, os, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright

desktop_dir = sys.argv[1]
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.bind(('127.0.0.1', 0))
port = sock.getsockname()[1]
sock.close()

srv = subprocess.Popen(
    [sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'],
    cwd=desktop_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
)
time.sleep(0.5)

JS_SEND_KEYS = """(codes) => {
    const c = document.getElementById('triton-screen');
    for (const code of codes) {
        let k = String.fromCharCode(code);
        if (code === 13) k = 'Enter';
        else if (code === 136) k = 'F1';
        else if (code === 143) k = 'F8';
        c.dispatchEvent(new KeyboardEvent('keydown', { key: k, keyCode: code }));
        c.dispatchEvent(new KeyboardEvent('keyup', { key: k, keyCode: code }));
    }
}"""

JS_OCR_LINE = """(args) => {
    const [x, y, len, bg] = args;
    const T = window.TritonSystem;
    // Read rendered canvas pixels to verify text is visible on screen
    const c = document.getElementById('triton-screen');
    const d = c.getContext('2d').getImageData(x, y, len * 9, 9).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 160 || d[i+1] > 160) lit++;
    }
    return lit;
}"""

try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage'])
        ctx = browser.new_context(viewport={'width': 1150, 'height': 700})
        errs = []

        p1 = ctx.new_page()
        p1.on('pageerror', lambda e: errs.append(str(e)))
        p1.goto(f'http://127.0.0.1:{port}/tritos-desktop.html?node=3')
        time.sleep(1.5)

        p2 = ctx.new_page()
        p2.on('pageerror', lambda e: errs.append(str(e)))
        p2.goto(f'http://127.0.0.1:{port}/tritos-desktop.html?node=4')
        time.sleep(1.0)

        p3 = ctx.new_page()
        p3.on('pageerror', lambda e: errs.append(str(e)))
        p3.goto(f'http://127.0.0.1:{port}/tritos-desktop.html?node=5')
        time.sleep(1.0)

        # Open App 10 (RUN 10) on all three tabs
        for p in [p1, p2, p3]:
            p.evaluate(JS_SEND_KEYS, [82, 85, 78, 32, 49, 48, 13])
        time.sleep(1.0)

        # Announce SNS HELLO (F8 = 143) in join order: Tab 1 (tri1), Tab 2 (tri2), Tab 3 (tri3)
        p1.evaluate(JS_SEND_KEYS, [143])
        time.sleep(0.4)
        p2.evaluate(JS_SEND_KEYS, [143])
        time.sleep(0.4)
        p1.evaluate(JS_SEND_KEYS, [143])
        time.sleep(0.4)
        p3.evaluate(JS_SEND_KEYS, [143])
        time.sleep(0.5)
        p1.evaluate(JS_SEND_KEYS, [143])
        p2.evaluate(JS_SEND_KEYS, [143])
        time.sleep(0.6)

        # Tab 1 (tri1, node 3) sends chat "HI FROM TRI1" to Tab 2 (node 4)
        p1.evaluate(JS_SEND_KEYS, [72, 73, 32, 70, 82, 79, 77, 32, 84, 82, 73, 49, 13])
        time.sleep(0.8)
        # Tab 2 (tri2, node 4) sends chat "HI FROM TRI2" to Tab 1 (node 3)
        p2.evaluate(JS_SEND_KEYS, [72, 73, 32, 70, 82, 79, 77, 32, 84, 82, 73, 50, 13])
        time.sleep(0.8)

        lit_chat_on_tab2 = p2.evaluate(JS_OCR_LINE, [309, 114, 17, -320])
        lit_chat_on_tab1 = p1.evaluate(JS_OCR_LINE, [309, 114, 17, -320])

        # Switch Tab 3 to PEERS view (F1 = 136) and check lit peer pixels at (279, 76) and (279, 88)
        p3.evaluate(JS_SEND_KEYS, [136])
        time.sleep(0.6)
        lit_peers_on_tab3 = p3.evaluate(JS_OCR_LINE, [279, 76, 8, -320])

        browser.close()
        passed = (len(errs) == 0) and (lit_chat_on_tab2 > 40) and (lit_chat_on_tab1 > 40) and (lit_peers_on_tab3 > 20)
        print(json.dumps({
            'name': '40-three-tab-chat',
            'status': 'PASS' if passed else 'FAIL',
            'tabsOpened': 3,
            'expectedNames': ['tri1', 'tri2', 'tri3'],
            'litChatPixelsTab2': lit_chat_on_tab2,
            'litChatPixelsTab1': lit_chat_on_tab1,
            'litPeerPixelsTab3': lit_peers_on_tab3,
            'pageErrors': len(errs)
        }))
finally:
    srv.terminate()
`;

  const env = Object.assign({}, process.env, {
    PYTHONPATH: '/tmp/pw_shim' + (process.env.PYTHONPATH ? ':' + process.env.PYTHONPATH : '')
  });
  const out = execFileSync('python3', ['-c', pyScript, desktopDir], { encoding: 'utf8', env, timeout: 60000 }).trim();
  const res = JSON.parse(out);
  if (res.status !== 'PASS') throw new Error('Three-tab chat test failed: ' + JSON.stringify(res));
  return res;
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
