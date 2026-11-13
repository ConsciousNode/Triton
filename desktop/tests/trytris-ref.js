// Reference harness for Trytris: loads TrytrisEngine and its dependencies
// unmodified from trytris/index.html by markers.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const REF_HTML_PATH = path.resolve(__dirname, '..', '..', '..', 'trytris', 'index.html');

function loadTrytrisReference() {
  const html = fs.readFileSync(REF_HTML_PATH, 'utf8');
  const lines = html.split('\n');
  const startIdx = lines.findIndex(l => l.includes('[LIFT-1] Mulberry32')) - 1;
  const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes('IN-BROWSER SELF-TEST SUITE')) - 1;
  if (startIdx < 0 || endIdx <= startIdx) {
    throw new Error('Could not locate TrytrisEngine markers in trytris/index.html');
  }
  const slice = lines.slice(startIdx, endIdx).join('\n');
  const sha256 = crypto.createHash('sha256').update(slice).digest('hex');

  const ctx = {
    Set, Map, Math, JSON, Array, Object, String, Number, Boolean,
    parseInt, parseFloat, isNaN, isFinite, Infinity, NaN
  };
  vm.createContext(ctx);
  vm.runInContext(
    slice + '\n' +
    'this.normalizeSeed = normalizeSeed;\n' +
    'this.createMulberry32 = createMulberry32;\n' +
    'this.GRID_COLS = GRID_COLS;\n' +
    'this.BUFFER_ROWS = BUFFER_ROWS;\n' +
    'this.VISIBLE_ROWS = VISIBLE_ROWS;\n' +
    'this.TOTAL_ROWS = TOTAL_ROWS;\n' +
    'this.isUpTriangle = isUpTriangle;\n' +
    'this.TETRIAMOND_SET = TETRIAMOND_SET;\n' +
    'this.HEXIAMOND_SET = HEXIAMOND_SET;\n' +
    'this.PIECE_BY_ID = PIECE_BY_ID;\n' +
    'this.getActiveVocabulary = getActiveVocabulary;\n' +
    'this.SeededBagGenerator = SeededBagGenerator;\n' +
    'this.COMBO_MULTIPLIERS = COMBO_MULTIPLIERS;\n' +
    'this.computeLineClearBaseScore = computeLineClearBaseScore;\n' +
    'this.encodeBoardBalancedTernary = encodeBoardBalancedTernary;\n' +
    'this.TrytrisEngine = TrytrisEngine;\n',
    ctx
  );

  return {
    ...ctx,
    sourcePath: REF_HTML_PATH,
    startLine: startIdx + 1,
    endLine: endIdx,
    sha256
  };
}

// Canonical piece ID <-> numeric ID (1..16) mapping used in TRYSTATE
const PIECE_NUM_TO_ID = [
  null,
  'P1', 'P2', 'P3', 'P4',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10', 'H11', 'H12'
];
const PIECE_ID_TO_NUM = {};
for (let i = 1; i < PIECE_NUM_TO_ID.length; i++) {
  PIECE_ID_TO_NUM[PIECE_NUM_TO_ID[i]] = i;
}

const MODE_NUM_TO_NAME = ['NORMAL', 'CURSED', 'HEXIAMOND'];
const MODE_NAME_TO_NUM = { NORMAL: 0, CURSED: 1, HEXIAMOND: 2 };

module.exports = {
  loadTrytrisReference,
  PIECE_NUM_TO_ID,
  PIECE_ID_TO_NUM,
  MODE_NUM_TO_NAME,
  MODE_NAME_TO_NUM
};
