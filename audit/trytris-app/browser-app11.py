import sys, time, subprocess, hashlib
from playwright.sync_api import sync_playwright
root=sys.argv[1]
srv=subprocess.Popen([sys.executable,'-m','http.server','8767','--bind','127.0.0.1'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
def canvas_hash(p): return hashlib.sha256(p.locator('canvas').first.screenshot()).hexdigest()[:12]
try:
  with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    def fresh():
      p=b.new_page(viewport={'width':1500,'height':1100}); errs=[]; reqs=[]
      p.on('pageerror',lambda e:errs.append(str(e))); p.on('request',lambda r:reqs.append(r.url))
      p.goto('http://127.0.0.1:8767/tritos-desktop.html'); time.sleep(6)
      bb=p.locator('canvas').first.bounding_box()
      to=lambda x,y:(bb['x']+x*bb['width']/723, bb['y']+y*bb['height']/480)
      return p,errs,reqs,to
    # A: launch App 11 and play a little
    p,errs,reqs,to=fresh()
    p.mouse.move(*to(710,472)); p.mouse.down(); p.mouse.up(); time.sleep(1.5)
    p.keyboard.type('2026'); p.keyboard.press('Enter'); time.sleep(1)
    for k in 'LLXRRZ': p.keyboard.press(k); time.sleep(0.15)
    p.keyboard.press('Space'); time.sleep(1)
    p.screenshot(path='/tmp/aud5/shots/app11-chrome.png')
    print('A errors',errs,'external',[u for u in reqs if not u.startswith('http://127.0.0.1')])
    print(p.evaluate("()=>document.body.innerText.slice(0,600)"))
    p.close()
    # B: mouse queue saturation
    p,errs,reqs,to=fresh()
    for i in range(2100): p.mouse.move(*to(300+(i%2)*4,200))
    time.sleep(1); p.mouse.move(*to(100,100)); time.sleep(0.5); h1=canvas_hash(p)
    p.mouse.move(*to(600,350)); time.sleep(0.5); h2=canvas_hash(p)
    p.screenshot(path='/tmp/aud5/shots/after-2100-mousemoves.png')
    print('B cursor moved after 2100 moves?', h1!=h2, h1, h2, 'errors', errs); p.close()
    # B0 control: same probe with only 50 moves
    p,errs,reqs,to=fresh()
    for i in range(50): p.mouse.move(*to(300+(i%2)*4,200))
    time.sleep(1); p.mouse.move(*to(100,100)); time.sleep(0.5); h1=canvas_hash(p)
    p.mouse.move(*to(600,350)); time.sleep(0.5); h2=canvas_hash(p)
    print('B0 control cursor moved after 50 moves?', h1!=h2); p.close()
    b.close()
finally: srv.terminate()
