'use strict';
/**
 * p-04: Generated documentation reproducibility check.
 * Running gen_desktop_doc.js reproduces the committed DESKTOP.md §7, §8.1,
 * and desktop/syscall-table.json byte-for-byte.
 */
const fs = require('fs');
const path = require('path');
const { desktopDir, sha256File, appendResult } = require('./p-common.js');
const { generateDocs } = require('../gen_desktop_doc.js');

function runTest() {
  const mdPath = path.join(desktopDir, 'DESKTOP.md');
  const jsonPath = path.join(desktopDir, 'syscall-table.json');

  const committedMd = fs.readFileSync(mdPath, 'utf8');
  const committedJson = fs.readFileSync(jsonPath, 'utf8');

  const generated = generateDocs({ write: false });

  if (generated.md !== committedMd) {
    throw new Error('DESKTOP.md does not match gen_desktop_doc.js output');
  }
  if (generated.jsonText !== committedJson) {
    throw new Error('syscall-table.json does not match gen_desktop_doc.js output');
  }

  const numbers = {
    desktopMdBytes: committedMd.length,
    desktopMdSha256: sha256File(mdPath),
    syscallTableJsonBytes: committedJson.length,
    syscallTableJsonSha256: sha256File(jsonPath),
    syscallsDocumented: generated.jsonObj.syscalls.length,
    errorCodesDocumented: generated.jsonObj.errorCodes.length
  };
  appendResult({ testId: 'p-04', backend: 'static', seed: 0, pass: true, numbers });
  return { name: 'p-04-docs', status: 'PASS', ...numbers };
}

if (require.main === module) {
  console.log(JSON.stringify(runTest()));
}
module.exports = { runTest };
