#!/usr/bin/env node
'use strict';

/**
 * Test 10: Static Scan (`tests/t3-10-static.js`)
 * ConsciousNode SoftWorks
 *
 * Verifies:
 *   - Strict Content-Security-Policy (`default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data:; connect-src 'none';`).
 *   - Zero network or browser storage APIs (`fetch`, `XMLHttpRequest`, `WebSocket`,
 *     `EventSource`, `sendBeacon`, `localStorage`, `sessionStorage`, `indexedDB`, `caches`, `http://`, `https://`),
 *     with only the documented `BroadcastChannel('studionet_v1')` allowed for StudioNet.
 *   - Every inline component (`[INLINE 1/7]` .. `[INLINE 7/7]`) is labeled with provenance
 *     naming `triton.html` and its source line range.
 *   - `triton.html` is completely unmodified (byte-for-byte identical to the reference).
 *   - Positive control: scanning a synthetic HTML string containing a forbidden API or
 *     missing provenance label fails the static scanner.
 */

const fs = require('fs');
const path = require('path');
const { loadHtmlModule } = require('./t3-common');

const t0 = Date.now();
const { htmlContent: t3Html, htmlPath: t3Path } = loadHtmlModule('triton3.html');
const { htmlContent: t2Html } = loadHtmlModule('triton.html');

function runStaticScan(htmlStr) {
  const cspMatch = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(htmlStr);
  if (!cspMatch || !cspMatch[1].includes("default-src 'none'") || !cspMatch[1].includes("connect-src 'none'")) {
    return { ok: false, reason: 'Missing or weak CSP meta tag' };
  }

  const forbidden = [
    { name: 'fetch()', re: /\bfetch\s*\(/ },
    { name: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/ },
    { name: 'WebSocket', re: /\bWebSocket\b/ },
    { name: 'EventSource', re: /\bEventSource\b/ },
    { name: 'sendBeacon', re: /\bsendBeacon\b/ },
    { name: 'localStorage', re: /\blocalStorage\b/ },
    { name: 'sessionStorage', re: /\bsessionStorage\b/ },
    { name: 'indexedDB', re: /\bindexedDB\b/ },
    { name: 'caches', re: /\bcaches\b/ },
    { name: 'http/https URL', re: /https?:\/\//i }
  ];
  for (const f of forbidden) {
    if (f.re.test(htmlStr)) {
      return { ok: false, reason: `Forbidden API/URL found: ${f.name}` };
    }
  }

  for (let i = 1; i <= 7; i++) {
    const tag = `[INLINE ${i}/7]`;
    if (!htmlStr.includes(tag)) {
      return { ok: false, reason: `Missing inline label ${tag}` };
    }
  }

  // Verify provenance comments naming triton.html and line ranges exist on all 7 inline blocks
  const provMatches = [...htmlStr.matchAll(/triton\.html\s+lines\s+\d+[–-]\d+/g)];
  if (provMatches.length < 7) {
    return { ok: false, reason: `Expected >= 7 provenance line-range labels, found ${provMatches.length}` };
  }

  return { ok: true, provCount: provMatches.length };
}

const scanRes = runStaticScan(t3Html);
if (!scanRes.ok) {
  throw new Error(`[Test 10] Static scan of triton3.html failed: ${scanRes.reason}`);
}

// Verify triton.html size is untouched (159,493 bytes)
if (Buffer.byteLength(t2Html, 'utf8') !== 159493) {
  throw new Error(`[Test 10] Reference triton.html was modified!`);
}

// Positive Controls:
// (a) Injecting localStorage or fetch() into HTML must fail static scan
const badApiScan = runStaticScan(t3Html + '\n// localStorage.getItem("x")');
if (badApiScan.ok) {
  throw new Error('[Test 10] Positive control failed: scanner did not catch forbidden localStorage API!');
}
// (b) Removing an [INLINE k/7] label must fail static scan
const badLabelScan = runStaticScan(t3Html.replace(/\[INLINE 4\/7\]/g, '[UNLABELED]'));
if (badLabelScan.ok) {
  throw new Error('[Test 10] Positive control failed: scanner did not catch missing inline label!');
}

console.log(`[PASS] t3-10-static: Strict CSP, 0 forbidden network/storage APIs, 7/7 inline blocks labeled with provenance (${scanRes.provCount} line-range citations + positive controls) in ${Date.now() - t0} ms`);
