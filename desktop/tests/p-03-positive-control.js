'use strict';
/**
 * p-03: Positive control (--no-ptr-check build flag).
 * Builds a temporary page with `--no-ptr-check`, verifies that p-01 fails on
 * case (e) (kernel memory) for SYS_FS2_READ (#52) and SYS_FS2_WRITE (#53),
 * and verifies that the shipped tritos-desktop-2.html is NOT built with --no-ptr-check.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { desktopDir, appendResult } = require('./p-common.js');
const { runProbesOnBackend } = require('./p-01-pointer-probes.js');

function runTest() {
  const shippedHtml = fs.readFileSync(path.join(desktopDir, 'tritos-desktop-2.html'), 'utf8');
  if (shippedHtml.includes('--no-ptr-check') || !shippedHtml.includes('; __NO_PTR_CHECK__')) {
    throw new Error('Shipped tritos-desktop-2.html appears to have pointer checking bypassed!');
  }

  const tmpName = '_p03_nocheck.html';
  const tmpPath = path.join(desktopDir, tmpName);
  try {
    execFileSync('node', [path.join(desktopDir, 'build_desktop2.js'), '--no-ptr-check', '--out', tmpPath], {
      cwd: desktopDir,
      encoding: 'utf8'
    });

    const bypassHtml = fs.readFileSync(tmpPath, 'utf8');
    if (!bypassHtml.includes('--no-ptr-check')) {
      throw new Error('--no-ptr-check build did not inject bypass');
    }

    // Run p-01 against the bypassed build for SYS_FS2_READ (#52) and SYS_FS2_WRITE (#53):
    // Both MUST fail!
    const failedSyscalls = [];
    for (const scNum of [52, 53]) {
      let caught = null;
      try {
        runProbesOnBackend('WASM', { htmlFilename: tmpName, filterSyscalls: [scNum] });
      } catch (e) {
        caught = e.message;
      }
      if (!caught) {
        throw new Error(`Positive control FAILED: p-01 unexpectedly PASSED on --no-ptr-check build for syscall #${scNum}`);
      }
      failedSyscalls.push({ syscall: scNum, error: caught });
    }

    // Also specifically probe case (e) (kernel memory = 100) for #52 and #53 directly to confirm
    // case (e) specifically fails on the --no-ptr-check build!
    const { loadHtmlModule, ensureTestAgentRunning, callGuestFs, guestWrite, T_DATA } = require('./d20-common.js');
    const { T } = loadHtmlModule(tmpName);
    const vm = T.TritonWASM.createSync({ archMode: 'T3' });
    T.bootTritOSDesktop(vm, false);
    vm.run(300000);
    vm._d20T = T;
    ensureTestAgentRunning(vm, T);
    guestWrite(vm, '1:/pc52', Int16Array.from([1, 2, 3, 4]), T_DATA);

    // Case (e) for SYS_FS2_WRITE (#53): src_buf_ptr = 100 (kernel memory)
    const wrRes = callGuestFs(vm, 53, {
      arg0: -9001, arg1: 100, arg2: 4, arg3: T_DATA, path1: '1:/pc53', replyTrytes: 0
    });
    // Case (e) for SYS_FS2_READ (#52): dst_buf_ptr = 5900 (kernel scratch K_NUM_FMT_BUF)
    const rdRes = callGuestFs(vm, 52, {
      arg0: -9001, arg1: 5900, arg2: 4, path1: '1:/pc52', replyTrytes: 0
    });

    if (wrRes.r0 === -14) {
      throw new Error('Positive control FAILED: SYS_FS2_WRITE case (e) still returned ERR_BADPTR on --no-ptr-check build');
    }
    if (rdRes.r0 === -14) {
      throw new Error('Positive control FAILED: SYS_FS2_READ case (e) still returned ERR_BADPTR on --no-ptr-check build');
    }

    const numbers = {
      shippedCheckActive: true,
      bypassWriteCaseE_r0: wrRes.r0,
      bypassReadCaseE_r0: rdRes.r0,
      p01FailuresDetected: failedSyscalls.length
    };
    appendResult({ testId: 'p-03', backend: 'TritonWASM', seed: 0, pass: true, numbers });
    return { name: 'p-03-positive-control', status: 'PASS', ...numbers };
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

if (require.main === module) {
  console.log(JSON.stringify(runTest()));
}
module.exports = { runTest };
