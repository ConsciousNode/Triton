import sys, time, json, subprocess, os
from playwright.sync_api import sync_playwright
root=sys.argv[1]
srv=subprocess.Popen([sys.executable,'-m','http.server','8765','--bind','127.0.0.1'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
def typ(p,codes):
    p.evaluate("""codes=>{const c=document.getElementById('triton-screen');for(const code of codes){const k=code===13?'Enter':String.fromCharCode(code);c.dispatchEvent(new KeyboardEvent('keydown',{key:k,keyCode:code}));c.dispatchEvent(new KeyboardEvent('keyup',{key:k,keyCode:code}));}}""",codes)
def lit(p):
    return p.evaluate("""()=>{const c=document.getElementById('triton-screen');const d=c.getContext('2d').getImageData(309,114,72,8).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>180&&d[i+1]>180)n++;return n}""")
def run(send):
    with sync_playwright() as pw:
        b=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        ctx=b.new_context(); errs=[]
        p1=ctx.new_page(); p1.on('pageerror',lambda e:errs.append(str(e)))
        p1.goto('http://127.0.0.1:8765/tritos-desktop.html'); time.sleep(1.5)
        p2=ctx.new_page(); p2.on('pageerror',lambda e:errs.append(str(e)))
        p2.add_init_script('window.TRITOS_INITIAL_NODE_ID=4;')
        p2.goto('http://127.0.0.1:8765/tritos-desktop.html'); time.sleep(1.5)
        typ(p2,[82,85,78,32,49,48,13]); time.sleep(1)
        typ(p1,[82,85,78,32,49,48,13]); time.sleep(1)
        if send: typ(p1,[66,67,67,72,65,84,32,79,75,13])
        time.sleep(2)
        n=lit(p2)
        if send: p2.screenshot(path='/tmp/audscripts/tab2.png')
        nid=p2.evaluate("()=>{const e=document.querySelector('select');return e?e.value:null}")
        b.close(); return n,errs,nid
try:
    a=run(True); c=run(False)
    print(json.dumps({'withChat':a[0],'control_noChat':c[0],'errors':a[1]+c[1],'tab2NodeSelect':a[2]}))
finally: srv.terminate()
