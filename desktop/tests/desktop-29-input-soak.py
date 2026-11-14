#!/usr/bin/env python3
"""
Test 29: real-browser input soak (desktop/tests/desktop-29-input-soak.py)
ConsciousNode SoftWorks — Triton 3.1.1 / TritOS Desktop

Drives a desktop page in headless Chromium with *real* Playwright input (trusted
keydown/keyup and mousemove events through the page's own listeners, no harness
writes into the machine), far past Triton 3.1's 2,048-event queue cliff:
  - 150 "a" + Backspace press pairs typed into the Terminal (600 key events) plus
    2,000 bare Shift keyups (2,000 key events) = 2,600 key events
  - 2,600 mouse moves = 2,600 mouse events
Then it checks the machine still reacts to both:
  - keyboard probe: typing "ZQX" must change pixels inside the Terminal's text area
  - mouse probe: moving the cursor to a new spot must change pixels at that spot
Each probe looks only at its own region, away from the Clock window; pixels that
change on their own are also learned first and masked out. (v1 of this test diffed
the whole screen, and its own control caught the clock fooling it.)

Usage: desktop-29-input-soak.py <html_path> [--expect-dead]
  --expect-dead  positive control: the run passes only if input is DEAD after the
                 soak (used against the unpatched Triton 3.1 desktop).
Prints one JSON line.
"""
import json, os, socket, subprocess, sys, time

html_path = os.path.abspath(sys.argv[1])
expect_dead = '--expect-dead' in sys.argv
N_PAIRS = int(os.environ.get('SOAK_PAIRS', '150'))  # "a"+Backspace presses: 4 key events each
N_KEYUPS = int(os.environ.get('SOAK_KEYUPS', '2000'))  # bare Shift keyups: 1 key event each, cheap
# Each keydown makes the page run 80,000 machine steps (~50 ms here); keyups only enqueue.
# Default: 600 + 2,000 = 2,600 key events (> 2,048), all real trusted input.
N_MOUSE = int(os.environ.get('SOAK_MOUSE', '2600'))
serve_dir, page_name = os.path.split(html_path)

sock = socket.socket(); sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]; sock.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'],
                       cwd=serve_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.6)

JS_GRAB = '''() => {
  const c = document.getElementById("triton-screen");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  const out = new Uint8Array(c.width * c.height);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) out[j] = (d[i] * 7 + d[i+1] * 5 + d[i+2] * 3) & 255;
  return Array.from(out);
}'''

def grab(page):
    return page.evaluate(JS_GRAB)

W = 729
def diff(a, b, mask, rect):
    x0, y0, x1, y1 = rect
    return sum(1 for y in range(y0, y1) for x in range(x0, x1)
               if a[y * W + x] != b[y * W + x] and not mask[y * W + x])

# Probe regions (framebuffer coords). The Terminal window's text area is top-left
# (x 12..190, y 18..122); the Clock window (x 519..698, y 13..66) is outside both.
TERM_RECT = (12, 18, 190, 122)
CURSOR_FROM = (400, 300)
CURSOR_TO = (650, 420)
CURSOR_RECT = (640, 410, 664, 434)

result = {'name': '29-input-soak', 'page': page_name, 'expectDead': expect_dead}
try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width': 1150, 'height': 700})
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(f'http://127.0.0.1:{port}/{page_name}')
        time.sleep(2.0)
        canvas = page.locator('#triton-screen')
        box = canvas.bounding_box()
        cw = page.evaluate('() => document.getElementById("triton-screen").width')
        ch = page.evaluate('() => document.getElementById("triton-screen").height')
        sx, sy = box['width'] / cw, box['height'] / ch
        def to_page(x, y):
            return box['x'] + x * sx, box['y'] + y * sy

        # Focus without clicking a window: click on the bare desktop near the top-right
        page.mouse.move(*to_page(*CURSOR_FROM))
        canvas.focus()
        time.sleep(0.3)

        # --- soak ---
        t0 = time.time()
        for i in range(N_PAIRS):
            page.keyboard.press('a')
            page.keyboard.press('Backspace')
        for i in range(N_KEYUPS):
            page.keyboard.up('Shift')
        key_events = N_PAIRS * 2 * 2 + N_KEYUPS
        for i in range(N_MOUSE):
            x = 100 + (i * 37) % 500
            y = 80 + (i * 53) % 300
            page.mouse.move(*to_page(x, y))
        mouse_events = N_MOUSE
        result['soakSeconds'] = round(time.time() - t0, 1)
        page.mouse.move(*to_page(*CURSOR_FROM))
        time.sleep(1.0)

        # --- learn the always-changing pixels (clock etc.) ---
        base = grab(page)
        mask = [0] * len(base)
        for _ in range(4):
            time.sleep(0.4)
            g = grab(page)
            for i in range(len(g)):
                if g[i] != base[i]:
                    mask[i] = 1
        base = grab(page)

        # --- keyboard probe ---
        canvas.focus()
        page.keyboard.type('ZQX')
        time.sleep(0.8)
        after_keys = grab(page)
        key_px = diff(base, after_keys, mask, TERM_RECT)

        # --- mouse probe: move from CURSOR_FROM to CURSOR_TO in small steps ---
        for k in range(1, 21):
            page.mouse.move(*to_page(CURSOR_FROM[0] + (CURSOR_TO[0] - CURSOR_FROM[0]) * k / 20,
                                     CURSOR_FROM[1] + (CURSOR_TO[1] - CURSOR_FROM[1]) * k / 20))
        time.sleep(0.8)
        after_mouse = grab(page)
        mouse_px = diff(after_keys, after_mouse, mask, CURSOR_RECT)

        result.update({
            'keyEventsSent': key_events, 'mouseEventsSent': mouse_events,
            'maskedPixels': sum(mask), 'keyboardProbeChangedPx': key_px,
            'mouseProbeChangedPx': mouse_px, 'pageErrors': errs[:3]
        })
        page.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        '..', 'input-soak-' + ('control' if expect_dead else 'pass') + '.png'))
        browser.close()
    alive = result['keyboardProbeChangedPx'] > 0 and result['mouseProbeChangedPx'] > 0
    dead = result['keyboardProbeChangedPx'] == 0 and result['mouseProbeChangedPx'] == 0
    ok = (dead if expect_dead else alive) and not result['pageErrors']
    result['status'] = 'PASS' if ok else 'FAIL'
finally:
    srv.terminate()
print(json.dumps(result))
sys.exit(0 if result.get('status') == 'PASS' else 1)
