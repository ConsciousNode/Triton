import sys, time, subprocess
from playwright.sync_api import sync_playwright
root=sys.argv[1]
srv=subprocess.Popen([sys.executable,'-m','http.server','8770','--bind','127.0.0.1'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
def run(b, moves, tag):
    p=b.new_page(viewport={'width':1500,'height':1100})
    p.goto('http://127.0.0.1:8770/tritos-desktop.html'); time.sleep(5)
    bb=p.locator('canvas').first.bounding_box(); sx=bb['width']/723; sy=bb['height']/480
    for i in range(moves):
        p.mouse.move(bb['x']+(300+(i%2)*6)*sx, bb['y']+200*sy); p.wait_for_timeout(4)
    p.mouse.click(bb['x']+160*sx, bb['y']+467*sy); time.sleep(2)   # [PAINT]
    p.screenshot(path=f'/tmp/aud5/shots/mouse-{tag}.png', clip={'x':bb['x'],'y':bb['y'],'width':bb['width'],'height':bb['height']})
    print(tag, moves); p.close()
try:
  with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    run(b, 20, 'control'); run(b, 2200, 'after2200')
    b.close()
finally: srv.terminate()
