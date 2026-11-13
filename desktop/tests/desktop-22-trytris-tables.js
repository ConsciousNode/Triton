'use strict';
const { loadHtmlModule } = require('./t3-common.js');
const { loadTrytrisReference, PIECE_NUM_TO_ID } = require('./trytris-ref.js');

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const ref = loadTrytrisReference();
  const built = T.assemble(T.TRITOS_DESKTOP_SRC, { mode: 'T3' });

  const romBase = built.symbols.APP11_TRY_ROM;
  const metaAddr = built.symbols.TRY_PIECE_META;
  const cellsAddr = built.symbols.TRY_PIECE_CELLS;
  if (romBase === undefined || metaAddr === undefined || cellsAddr === undefined) {
    throw new Error('Missing App 11 rotation table symbols in assembled ROM');
  }

  let totalRotationsChecked = 0;
  let totalCellsChecked = 0;

  for (let num = 1; num <= 16; num++) {
    const id = PIECE_NUM_TO_ID[num];
    const refPiece = ref.PIECE_BY_ID[id];
    const mOff = metaAddr + (num - 1) * 4;
    const order = built.trytes[mOff + 0];
    const symOrder = built.trytes[mOff + 1];
    const cellOffset = built.trytes[mOff + 3];

    if (order !== refPiece.order) {
      throw new Error(`${id}: order mismatch: guest=${order}, ref=${refPiece.order}`);
    }
    if (symOrder !== refPiece.symmetryOrder) {
      throw new Error(`${id}: symmetryOrder mismatch: guest=${symOrder}, ref=${refPiece.symmetryOrder}`);
    }

    for (let rot = 0; rot < symOrder; rot++) {
      const refCells = refPiece.rotations[rot];
      const base = cellsAddr + cellOffset + rot * order * 2;
      for (let i = 0; i < order; i++) {
        const dr = built.trytes[base + i * 2];
        const dc = built.trytes[base + i * 2 + 1];
        const [refDr, refDc] = refCells[i];
        if (dr !== refDr || dc !== refDc) {
          throw new Error(`${id} rot ${rot} cell ${i} mismatch: guest=[${dr},${dc}], ref=[${refDr},${refDc}]`);
        }
        totalCellsChecked++;
      }
      totalRotationsChecked++;
    }
  }

  return {
    name: '22-trytris-rotation-tables',
    status: 'PASS',
    source: 'assembled ROM (TRY_PIECE_META, TRY_PIECE_CELLS)',
    piecesVerified: 16,
    rotationsVerified: totalRotationsChecked,
    cellsVerified: totalCellsChecked,
    refLines: `${ref.startLine}..${ref.endLine}`,
    refSha256: ref.sha256
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest };
