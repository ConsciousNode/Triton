'use strict';
/**
 * p-02: Syscall table coverage check.
 * Verifies that the number of syscalls #50..#65 in k_fs2_syscall_dispatch equals
 * the number of rows in syscall-table.json, every row is marked either
 * "pointer args: none" or with its list of pointer arguments, and no syscall is missing.
 */
const fs = require('fs');
const path = require('path');
const { desktopDir, appendResult } = require('./p-common.js');

function runTest() {
  const asm = fs.readFileSync(path.join(desktopDir, 'guest-200.asm'), 'utf8');
  const table = JSON.parse(fs.readFileSync(path.join(desktopDir, 'syscall-table.json'), 'utf8'));

  const dispStart = asm.indexOf('\nk_fs2_syscall_dispatch:\n');
  const drvStart = asm.indexOf('\n; ==== DRIVER fs v2 ====', dispStart);
  if (dispStart < 0 || drvStart < 0) {
    throw new Error('Could not locate k_fs2_syscall_dispatch block in guest-200.asm');
  }
  const dispBlock = asm.slice(dispStart, drvStart);
  const dispatchNums = [];
  const re = /CMPI\s+R6\s*,\s*#(\d+)\s*\n\s*JZX\s+([A-Za-z0-9_]+)/g;
  let m;
  while ((m = re.exec(dispBlock)) !== null) {
    const n = parseInt(m[1], 10);
    if (n >= 50 && n <= 65) dispatchNums.push(n);
  }

  const rows = table.syscalls || [];
  if (dispatchNums.length !== rows.length) {
    throw new Error(`Dispatch count (${dispatchNums.length}) != syscall-table.json rows (${rows.length})`);
  }

  const rowNums = new Set(rows.map(r => r.num));
  for (const n of dispatchNums) {
    if (!rowNums.has(n)) {
      throw new Error(`Syscall #${n} present in dispatch code is missing from syscall-table.json`);
    }
  }

  let withPtrs = 0;
  let withoutPtrs = 0;
  let totalPtrArgs = 0;
  for (const row of rows) {
    if (!Array.isArray(row.pointerArgs)) {
      throw new Error(`Row #${row.num} missing pointerArgs array`);
    }
    if (row.pointerArgs.length === 0) {
      if (row.pointerArgsSummary !== 'pointer args: none') {
        throw new Error(`Row #${row.num} has 0 pointer args but summary is ${JSON.stringify(row.pointerArgsSummary)}`);
      }
      withoutPtrs++;
    } else {
      if (!row.pointerArgsSummary || row.pointerArgsSummary === 'pointer args: none') {
        throw new Error(`Row #${row.num} has pointer args but invalid summary`);
      }
      withPtrs++;
      totalPtrArgs += row.pointerArgs.length;
    }
  }

  const numbers = {
    dispatchCount: dispatchNums.length,
    tableRowCount: rows.length,
    syscallsWithPointers: withPtrs,
    syscallsWithoutPointers: withoutPtrs,
    totalPointerArgs: totalPtrArgs
  };
  appendResult({ testId: 'p-02', backend: 'static', seed: 0, pass: true, numbers });
  return { name: 'p-02-coverage', status: 'PASS', ...numbers };
}

if (require.main === module) {
  console.log(JSON.stringify(runTest()));
}
module.exports = { runTest };
