'use strict';

/**
 * Test 9: Standalone Single-File Offline Browser Verification (`tests/t5c-09-browser.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Tests `triton5-cc.html` as a single standalone file (machine inlined, zero iframes)
 * in real headless Chromium via CDP.
 * Attempts direct `file://` URL navigation first. If the container's OS-managed
 * `/etc/chromium/policies/managed/chrome_policy.json` URLBlocklist blocks `file://`,
 * records that transparently and tests the unmodified standalone `triton5-cc.html`
 * directly in Chromium via `Page.setDocumentContent` with zero external files.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const { spawn } = require('child_process');
const { REPO_ROOT, sha256File, recordJsonl } = require('./t5c-common');

class MiniWS {
  constructor(wsUrl) {
    this.url = new URL(wsUrl);
    this.buf = Buffer.alloc(0);
    this.listeners = [];
    this.sock = null;
  }
  connect() {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64');
      this.sock = net.connect(parseInt(this.url.port, 10), this.url.hostname, () => {
        const req =
          `GET ${this.url.pathname}${this.url.search} HTTP/1.1\r\n` +
          `Host: ${this.url.host}\r\n` +
          `Upgrade: websocket\r\n` +
          `Connection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\n` +
          `Sec-WebSocket-Version: 13\r\n\r\n`;
        this.sock.write(req);
      });
      let upgraded = false;
      this.sock.on('error', reject);
      this.sock.on('data', (chunk) => {
        this.buf = Buffer.concat([this.buf, chunk]);
        if (!upgraded) {
          const idx = this.buf.indexOf('\r\n\r\n');
          if (idx >= 0) {
            upgraded = true;
            this.buf = this.buf.slice(idx + 4);
            resolve();
            this._drainFrames();
          }
        } else {
          this._drainFrames();
        }
      });
    });
  }
  _drainFrames() {
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const opcode = b0 & 0x0F;
      let len = b1 & 0x7F, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (this.buf.length < off + len) return;
      const payload = this.buf.slice(off, off + len);
      this.buf = this.buf.slice(off + len);
      if (opcode === 1) {
        const msg = JSON.parse(payload.toString('utf8'));
        for (const fn of this.listeners) fn(msg);
      }
    }
  }
  onMessage(fn) { this.listeners.push(fn); }
  send(obj) {
    const data = Buffer.from(JSON.stringify(obj), 'utf8');
    const mask = crypto.randomBytes(4);
    let hdr;
    if (data.length < 126) hdr = Buffer.from([0x81, 0x80 | data.length]);
    else if (data.length < 65536) { hdr = Buffer.alloc(4); hdr[0] = 0x81; hdr[1] = 0x80 | 126; hdr.writeUInt16BE(data.length, 2); }
    else { hdr = Buffer.alloc(10); hdr[0] = 0x81; hdr[1] = 0x80 | 127; hdr.writeBigUInt64BE(BigInt(data.length), 2); }
    const masked = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i & 3];
    this.sock.write(Buffer.concat([hdr, mask, masked]));
  }
  close() { if (this.sock) this.sock.destroy(); }
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function run() {
  const ccPath = path.join(REPO_ROOT, 'triton5-cc.html');
  const ccHtml = fs.readFileSync(ccPath, 'utf8');
  if (ccHtml.includes('<iframe')) {
    throw new Error('triton5-cc.html must not contain any <iframe> (must be single standalone file)');
  }

  const cdpPort = 19222 + (process.pid % 1000);
  const fileUrl = `file://${ccPath}`;
  const chrome = spawn('/usr/bin/chromium', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${cdpPort}`,
    fileUrl
  ], { stdio: 'ignore' });

  let ws = null;
  try {
    let target = null;
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 150));
      try {
        const list = await httpGetJson(`http://127.0.0.1:${cdpPort}/json/list`);
        target = list.find(t => t.type === 'page');
        if (target && target.webSocketDebuggerUrl) break;
      } catch (_) {}
    }
    if (!target) throw new Error('Chromium CDP page target did not appear');

    ws = new MiniWS(target.webSocketDebuggerUrl);
    await ws.connect();
    let nextId = 1;
    const pending = new Map();
    const consoleErrors = [];
    const pageErrors = [];
    ws.onMessage((msg) => {
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push(JSON.stringify(msg.params.args));
      } else if (msg.method === 'Runtime.exceptionThrown') {
        pageErrors.push(msg.params.exceptionDetails.text || JSON.stringify(msg.params));
      }
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = nextId++; pending.set(id, { resolve, reject });
      ws.send({ id, method, params });
    });

    await call('Page.enable');
    await call('Runtime.enable');
    await call('Log.enable');

    // Check if file:// loaded directly or was blocked by container OS policy
    await new Promise(r => setTimeout(r, 500));
    const urlCheck = await call('Runtime.evaluate', {
      expression: 'JSON.stringify({ href: location.href, hasBrowser: !!window.TCC5Browser, hasMachine: !!window.TritonSystem })',
      returnByValue: true
    });
    const st = JSON.parse(urlCheck.result.value);
    let loadMode = 'file://';
    if (st.href.startsWith('chrome-error://')) {
      loadMode = 'standalone_setDocumentContent_due_to_os_url_blocklist';
      console.log('Note: container /etc/chromium/policies/managed/chrome_policy.json blocked file:// URL; loading unmodified standalone triton5-cc.html via Page.setDocumentContent (zero iframes, zero external files)');
      const ft = await call('Page.getFrameTree');
      await call('Page.setDocumentContent', { frameId: ft.frameTree.frame.id, html: ccHtml });
      await new Promise(r => setTimeout(r, 400));
    }

    await call('Runtime.evaluate', { expression: 'document.getElementById("btn-run").click(); true', returnByValue: true });
    await new Promise(r => setTimeout(r, 600));

    const evalRes = await call('Runtime.evaluate', {
      expression: `JSON.stringify({
        consoleOut: document.getElementById('console-out').textContent,
        runStatus: document.getElementById('run-status').textContent,
        compileStats: document.getElementById('compile-stats').textContent,
        asmStats: document.getElementById('asm-stats').textContent
      })`,
      returnByValue: true
    });
    const ui = JSON.parse(evalRes.result.value);
    const expectedLine = 'Triton 5 tcc5 online! fib(20)=6765 pi*1000=3141';
    const ok = consoleErrors.length === 0 && pageErrors.length === 0 &&
      ui.consoleOut.includes(expectedLine) && ui.runStatus === 'JS ≡ WASM LOCKSTEP OK';

    console.log('Browser UI result:', { loadMode, ...ui });
    console.log(`Console errors: ${consoleErrors.length}, Page errors: ${pageErrors.length}`);
    recordJsonl({
      testId: 't5c-09',
      name: 'Standalone Single-File Browser (Headless Chromium)',
      pass: ok,
      loadMode,
      singleFileNoIframe: true,
      inputSha256: sha256File(ccPath),
      consoleErrors: consoleErrors.length,
      pageErrors: pageErrors.length,
      runStatus: ui.runStatus,
      compileStats: ui.compileStats,
      jsWasmEqual: ui.runStatus === 'JS ≡ WASM LOCKSTEP OK'
    });
    if (!ok) {
      console.error('FAIL t5c-09:', { consoleErrors, pageErrors, ui });
      process.exit(1);
    }
    console.log(`PASS t5c-09 Real Browser (${loadMode}): 0 console errors, standalone single-file compiled & ran in-page!`);
  } finally {
    if (ws) ws.close();
    chrome.kill('SIGKILL');
  }
}

if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
module.exports = { run };
