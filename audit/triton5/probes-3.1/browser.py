import asyncio, sys
from playwright.async_api import async_playwright
async def go(url):
  async with async_playwright() as p:
    b=await p.chromium.launch(); pg=await b.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append('PAGE '+str(e)[:150])); pg.on('console',lambda m: errs.append('CONSOLE '+m.text[:150]) if m.type=='error' else None)
    await pg.goto(url); await pg.wait_for_timeout(2500)
    await pg.click('#btn-run'); await pg.wait_for_timeout(8000)
    txt=await pg.inner_text('body')
    print(url, 'errors:', errs[:4]); print(txt[-600:].replace('\n',' | '))
    await pg.screenshot(path='/tmp/s31/browser-'+('http' if url.startswith('http') else 'file')+'.png')
    await b.close()
asyncio.run(go(sys.argv[1]))
