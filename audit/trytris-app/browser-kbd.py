import sys, time, subprocess
from playwright.sync_api import sync_playwright
root=sys.argv[1]
srv=subprocess.Popen([sys.executable,'-m','http.server','8769','--bind','127.0.0.1'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
def run(b, pairs, tag):
    p=b.new_page(viewport={'width':1500,'height':1100}); errs=[]
    p.on('pageerror',lambda e:errs.append(str(e)))
    p.goto('http://127.0.0.1:8769/tritos-desktop.html'); time.sleep(5)
    bb=p.locator('canvas').first.bounding_box()
    sx=bb['width']/723; sy=bb['height']/480
    p.mouse.click(bb['x']+95*sx, bb['y']+467*sy); time.sleep(1.5)   # [EDIT]
    for i in range(pairs):
        p.keyboard.press('a'); p.keyboard.press('Backspace')
    time.sleep(1)
    p.keyboard.type('HELLO TRITON'); time.sleep(1.5)
    p.screenshot(path=f'/tmp/aud5/shots/kbd-{tag}.png')
    print(tag, 'pairs', pairs, 'events ~', pairs*4, 'errors', errs); p.close()
try:
  with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    run(b, 10, 'control'); run(b, 560, 'after2240')
    b.close()
finally: srv.terminate()
