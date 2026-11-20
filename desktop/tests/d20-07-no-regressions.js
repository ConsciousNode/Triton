'use strict';
// Test 11 (d20-07-no-regressions.js):
//   1. Static hygiene checks on tritos-desktop-2.html, triton4.html, and desktop/tests/d20-*.js:
//      - Machine block in tritos-desktop-2.html is byte-identical to triton4.html.
//      - const TRITOS_VERSION = "TritOS Desktop 2.0" defined once; zero stale 1.1/1.1.1/1.1.2 strings.
//      - Zero references to tritfs-ref in triton4.html or tritos-desktop-2.html.
//      - Zero direct guest private memory accesses in desktop/tests/d20-*.js.
//      - All 7 drivers in guest-200.asm pass analyzeGuestDriverLibrary.
//   2. Real-time clock (RTC_SECONDS) and Timer Mode 1 check on Clock app & file mtimes.
//   3. Applicable 1.1.2 desktop regression suites pass on tritos-desktop-2.html.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { analyzeGuestDriverLibrary } = require('./desktop-19-driver-library.js');
const {
  TritFS, Unit, T_DATA,
  bootDesktop2, callGuestFs, guestWrite, guestStat
} = require('./d20-common.js');

function extractMachineBlockHash(htmlText) {
  const s = htmlText.indexOf('//BEGIN_TRITON3_MACHINE_BLOCK');
  const e = htmlText.indexOf('//END_TRITON3_MACHINE_BLOCK');
  if (s < 0 || e < 0) throw new Error('Missing machine block markers');
  const blk = htmlText.slice(s, e + '//END_TRITON3_MACHINE_BLOCK'.length).replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(blk).digest('hex');
}

function checkStaticHygiene() {
  const desktopDir = path.resolve(__dirname, '..');
  const tritonDir = path.resolve(desktopDir, '..');
  const t4Html = fs.readFileSync(path.join(tritonDir, 'triton4.html'), 'utf8');
  const d2Html = fs.readFileSync(path.join(desktopDir, 'tritos-desktop-2.html'), 'utf8');

  const t4Sha = extractMachineBlockHash(t4Html);
  const d2Sha = extractMachineBlockHash(d2Html);
  if (t4Sha !== d2Sha) {
    throw new Error(`Machine block SHA-256 mismatch: triton4.html=${t4Sha} vs tritos-desktop-2.html=${d2Sha}`);
  }

  const verDefMatches = d2Html.match(/const\s+TRITOS_VERSION\s*=\s*["']TritOS Desktop 2\.0["']/g) || [];
  if (verDefMatches.length !== 1) {
    throw new Error(`Expected const TRITOS_VERSION = "TritOS Desktop 2.0" once, found ${verDefMatches.length}`);
  }
  const staleMatches = d2Html.match(/TritOS Desktop 1\.1(\.1|\.2|(?![.0-9]))/g) || [];
  if (staleMatches.length !== 0) {
    throw new Error(`Found stale 1.1.x version strings in tritos-desktop-2.html: ${staleMatches.length}`);
  }

  if (t4Html.includes('fs_check_unit26_rpc') || d2Html.includes('fs_check_unit26_rpc') || d2Html.includes('420042')) {
    throw new Error('Test-only RPC hook found in shipped HTML');
  }
  if (t4Html.includes('tritfs-ref') || d2Html.includes('tritfs-ref')) {
    throw new Error('tritfs-ref referenced inside triton4.html or tritos-desktop-2.html');
  }

  // Check d20-*.js test files for forbidden direct memory access tokens
  const testFiles = fs.readdirSync(__dirname).filter(f => f.startsWith('d20-') && f.endsWith('.js'));
  const forbiddenTokens = ['.mem' + '[', '.setMem' + '(', '.setDisk' + '('];
  for (const tf of testFiles) {
    const code = fs.readFileSync(path.join(__dirname, tf), 'utf8');
    for (const tok of forbiddenTokens) {
      if (code.includes(tok)) {
        throw new Error(`Forbidden direct guest memory token '${tok}' found in ${tf}`);
      }
    }
  }

  const { T } = bootDesktop2();
  const drvCheck = analyzeGuestDriverLibrary(T.TRITOS_DESKTOP_SRC);
  if (!drvCheck.ok) {
    throw new Error('Driver library static check failed on 2.0: ' + drvCheck.error);
  }

  return {
    machineBlockSha256: d2Sha,
    versionDefCount: verDefMatches.length,
    staleVersionCount: staleMatches.length,
    d20TestFilesScanned: testFiles.length,
    driversVerified: Object.keys(drvCheck.drivers).sort()
  };
}

function checkRtcAndTimerMode() {
  let fakeNowMs = Date.UTC(2026, 10, 17, 12, 34, 56); // 2026-11-17T12:34:56Z
  const expectedRtcSec = Math.floor((fakeNowMs - Date.UTC(2000, 0, 1, 0, 0, 0)) / 1000);
  const hostClock = {
    nowMs: () => fakeNowMs,
    nowUs: () => fakeNowMs * 1000
  };
  const { T, vm } = bootDesktop2({ hostClock });
  callGuestFs(vm, 62, { arg0: 1, arg1: expectedRtcSec, replySectors: 1 });
  if (vm.timerMode !== 1) {
    throw new Error(`Expected kernel to switch timerMode to 1 at boot, got ${vm.timerMode}`);
  }
  guestWrite(vm, '1:/rtctest', Int16Array.from([1, 2, 3]), T_DATA, { steps: 30000 });
  const st = guestStat(vm, '1:/rtctest');
  if (!st || Math.abs(st.mtime - expectedRtcSec) > 5) {
    throw new Error(`Expected file mtime ~ ${expectedRtcSec}, got ${st && st.mtime}`);
  }
  // Step so Clock app redraws Row 2 (UTC: HH:MM:SS) and verify HH:MM:SS format
  vm.run(200000);
  const { readFbString } = require('./t3-common.js');
  const clockUtcStr = readFbString(vm, T, 561, 50, 8, -320);
  if (!/^\d{2}:\d{2}:\d{2}$/.test(clockUtcStr) || !clockUtcStr.startsWith('12:34:')) {
    throw new Error(`Expected Clock app to show readable HH:MM:SS (12:34:xx), got ${JSON.stringify(clockUtcStr)}`);
  }
  return { timerMode: vm.timerMode, expectedRtcSec, fileMtime: st.mtime, clockUtcStr };
}

function runRegressionSuites() {
  const suites = [
    'desktop-02-determinism.js',
    'desktop-03-preemption.js',
    'desktop-04-fault-isolation.js',
    'desktop-05-filesystem.js',
    'desktop-06-windowing.js',
    'desktop-07-apps.js',
    'desktop-08-selfhost.js',
    'desktop-09-positive-controls.js',
    'desktop-10-static-scan.js',
    'desktop-12-klondike.js',
    'desktop-13-tetris.js',
    'desktop-14-write.js',
    'desktop-15-sheet.js',
    'desktop-16-isolation-d3.js',
    'desktop-17-net.js',
    'desktop-20-malformed-frames.js',
    'desktop-21-custom-filename.js',
    'desktop-25-trytris-persistence.js',
    'desktop-26-trytris-isolation.js',
    'desktop-36-trit-blocks-112.js'
  ];
  const passed = [];
  for (const f of suites) {
    if (f === 'desktop-10-static-scan.js') { execFileSync('node', [path.join(__dirname, f)], { cwd: path.resolve(__dirname, '..'), timeout: 30000 }); passed.push(f); continue; }
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/tritos-desktop\.html/g, 'tritos-desktop-2.html');
    const tmp = path.join(__dirname, '_reg20_' + f);
    fs.writeFileSync(tmp, src);
    try {
      execFileSync('node', [tmp], { cwd: path.resolve(__dirname, '..'), timeout: 30000 });
      passed.push(f);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
  return { count: passed.length, suites: passed };
}

function runTest() {
  const hygiene = checkStaticHygiene();
  const rtc = checkRtcAndTimerMode();
  const regressions = runRegressionSuites();
  return {
    name: 'd20-07-no-regressions',
    status: 'PASS',
    hygiene,
    rtc,
    regressionsPassed: regressions.count
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
