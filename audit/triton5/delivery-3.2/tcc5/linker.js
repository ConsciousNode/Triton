'use strict';

/**
 * Triton 5.0 Static Linker (`tcc5/linker.js` — t5ld)
 * ConsciousNode SoftWorks — MIT License
 *
 * Links multiple `.t5o` objects into a single `.t5x` executable aligned to
 * balanced-3^7 (2,187 trytes) page boundaries (DECISION-PAGE-SIZE.md, ABI-5.md §6.2).
 */

const ISA = (typeof require !== 'undefined') ? require('./isa') : globalThis.TCC5_ISA;

function alignUp(val, align) {
  const r = val % align;
  return r === 0 ? val : val + (align - r);
}

function linkT5X(objects, options = {}) {
  const pageSize = options.pageSize || ISA.PAGE_SIZE; // 2187
  const bias = options.bias !== undefined ? options.bias : ISA.PAGE_BIAS; // 1093
  const entrySymbol = options.entry || '_start';
  const relocOffsetDelta = options.debugRelocDelta || 0; // For positive control #5 only when explicitly injected by mutant

  // Collect all section names in canonical order
  const canonicalOrder = ['.text', '.rodata', '.init_array', '.data', '.bss'];
  const allSecNames = [...canonicalOrder];
  for (const obj of objects) {
    for (const sname of Object.keys(obj.sections)) {
      if (!allSecNames.includes(sname)) allSecNames.push(sname);
    }
  }

  // Per-object section base offsets within each merged output section
  const merged = {};
  for (const sname of allSecNames) {
    const isBss = sname === '.bss' || sname.startsWith('.bss.');
    merged[sname] = { trytes: isBss ? null : [], size: 0, isBss };
  }

  const objSecOffsets = objects.map(() => ({}));
  for (let oi = 0; oi < objects.length; oi++) {
    const obj = objects[oi];
    for (const sname of allSecNames) {
      const sec = obj.sections[sname];
      if (!sec) continue;
      const sz = sec.trytes ? sec.trytes.length : sec.size;
      if (sz === 0) {
        objSecOffsets[oi][sname] = merged[sname].size;
        continue;
      }
      const m = merged[sname];
      const al = Math.max(sec.align || 1, sname === '.text' ? 2 : 4);
      const aligned = alignUp(m.size, al);
      const pad = aligned - m.size;
      if (m.trytes) {
        for (let p = 0; p < pad; p++) m.trytes.push(0);
        for (let k = 0; k < sec.trytes.length; k++) m.trytes.push(sec.trytes[k]);
        m.size = m.trytes.length;
      } else {
        m.size = aligned + sz;
      }
      objSecOffsets[oi][sname] = aligned;
    }
  }

  // Assign page-aligned C addresses (and machine addresses A = P - bias)
  // .text starts at C page 1 = pageSize (2187) => machine address 1094 (frame 1).
  let curCAddr = pageSize;
  const secLayout = {};
  for (const sname of allSecNames) {
    const m = merged[sname];
    if (m.size === 0 && !canonicalOrder.includes(sname)) continue;
    curCAddr = alignUp(curCAddr, pageSize);
    const machAddr = curCAddr - bias;
    const pageCount = m.size === 0 ? 0 : Math.ceil(m.size / pageSize);
    secLayout[sname] = {
      name: sname,
      cAddr: curCAddr,
      machAddr,
      size: m.size,
      pageCount,
      isBss: m.isBss
    };
    if (m.size > 0) {
      curCAddr = alignUp(curCAddr + m.size, pageSize);
    }
  }

  // Build global symbol table & per-object local symbol tables
  const globalSyms = new Map(); // name -> { machAddr, cAddr, bind, section, objIdx }
  const localSyms = objects.map(() => new Map());

  for (let oi = 0; oi < objects.length; oi++) {
    const obj = objects[oi];
    for (const sym of obj.symbols) {
      if (!sym.section) continue; // undefined reference
      const layout = secLayout[sym.section];
      if (!layout) throw new Error(`Linker: unknown section '${sym.section}' for symbol '${sym.name}'`);
      const offInMerged = (objSecOffsets[oi][sym.section] || 0) + sym.offset;
      const machAddr = layout.machAddr + offInMerged;
      const cAddr = layout.cAddr + offInMerged;
      const entry = { name: sym.name, machAddr, cAddr, bind: sym.bind, section: sym.section, objIdx: oi };
      if (sym.bind === 'LOCAL') {
        localSyms[oi].set(sym.name, entry);
      } else {
        const prev = globalSyms.get(sym.name);
        if (prev) {
          if (prev.bind === 'GLOBAL' && sym.bind === 'GLOBAL') {
            throw new Error(`Linker: duplicate global symbol '${sym.name}'`);
          }
          if (prev.bind === 'WEAK' && sym.bind === 'GLOBAL') {
            globalSyms.set(sym.name, entry);
          }
          // If both WEAK or prev GLOBAL & sym WEAK, keep prev
        } else {
          globalSyms.set(sym.name, entry);
        }
      }
    }
  }

  // Built-in linker-defined symbols
  const bssLay = secLayout['.bss'];
  const initLay = secLayout['.init_array'];
  const stackTopC = (options.ramSize || 4782969) - pageSize; // near top of RAM, page-aligned
  const builtinSyms = {
    '__bss_start':        { cAddr: bssLay.cAddr, machAddr: bssLay.machAddr },
    '__bss_end':          { cAddr: bssLay.cAddr + bssLay.size, machAddr: bssLay.machAddr + bssLay.size },
    '__init_array_start': { cAddr: initLay.cAddr, machAddr: initLay.machAddr },
    '__init_array_end':   { cAddr: initLay.cAddr + initLay.size, machAddr: initLay.machAddr + initLay.size },
    '_end':               { cAddr: curCAddr, machAddr: curCAddr - bias },
    '__stack_top':        { cAddr: stackTopC, machAddr: stackTopC - bias }
  };
  for (const [name, info] of Object.entries(builtinSyms)) {
    if (!globalSyms.has(name)) {
      globalSyms.set(name, { name, machAddr: info.machAddr, cAddr: info.cAddr, bind: 'GLOBAL', section: '*ABS*', objIdx: -1 });
    }
  }

  // Apply all relocations
  for (let oi = 0; oi < objects.length; oi++) {
    const obj = objects[oi];
    for (const r of obj.relocs) {
      const target = localSyms[oi].get(r.symbol) || globalSyms.get(r.symbol);
      if (!target) {
        throw new Error(`Linker: undefined symbol '${r.symbol}' referenced in ${obj.filename || 'object'}:${r.section}`);
      }
      const m = merged[r.section];
      const layout = secLayout[r.section];
      if (!m || !m.trytes) throw new Error(`Linker: cannot relocate non-allocated section '${r.section}'`);
      const pOff = (objSecOffsets[oi][r.section] || 0) + r.offset;
      const pMach = layout.machAddr + pOff;
      const sMach = target.machAddr + r.addend + relocOffsetDelta;
      const sC = target.cAddr + r.addend + relocOffsetDelta;

      switch (r.type) {
        case 'R_T5_REL9': {
          const rel = sMach - (pMach + 2);
          if (rel < -ISA.TRYTE_HALF || rel > ISA.TRYTE_HALF) {
            throw new Error(`Linker: R_T5_REL9 to '${r.symbol}' out of range (${rel})`);
          }
          m.trytes[pOff + 1] = ISA.balRem(rel, ISA.TRYTE_MOD, ISA.TRYTE_HALF);
          break;
        }
        case 'R_T5_ABS27_LO': {
          const [w0] = ISA.numberToWord(sMach);
          m.trytes[pOff + 1] = w0;
          break;
        }
        case 'R_T5_ABS27_MID': {
          const [, w1] = ISA.numberToWord(sMach);
          m.trytes[pOff + 1] = w1;
          break;
        }
        case 'R_T5_ABS27_HI': {
          const [, , w2] = ISA.numberToWord(sMach);
          m.trytes[pOff + 1] = w2;
          break;
        }
        case 'R_T5_CADDR27_LO': {
          const [w0] = ISA.numberToWord(sC);
          m.trytes[pOff + 1] = w0;
          break;
        }
        case 'R_T5_CADDR27_MID': {
          const [, w1] = ISA.numberToWord(sC);
          m.trytes[pOff + 1] = w1;
          break;
        }
        case 'R_T5_CADDR27_HI': {
          const [, , w2] = ISA.numberToWord(sC);
          m.trytes[pOff + 1] = w2;
          break;
        }
        case 'R_T5_CADDR32': {
          const u = sC >>> 0;
          m.trytes[pOff + 0] = u & 0xFF;
          m.trytes[pOff + 1] = (u >>> 8) & 0xFF;
          m.trytes[pOff + 2] = (u >>> 16) & 0xFF;
          m.trytes[pOff + 3] = (u >>> 24) & 0xFF;
          break;
        }
        default:
          throw new Error(`Linker: unknown relocation type '${r.type}'`);
      }
    }
  }

  const entry = globalSyms.get(entrySymbol);
  if (!entry) throw new Error(`Linker: entry symbol '${entrySymbol}' not defined`);

  // Build flat bootable tryte image for triton5.html (loaded at physical 0)
  let maxMachEnd = 8;
  for (const sname of Object.keys(secLayout)) {
    const lay = secLayout[sname];
    if (!lay.isBss && lay.size > 0) {
      maxMachEnd = Math.max(maxMachEnd, lay.machAddr + lay.size);
    }
  }
  const image = new Int16Array(maxMachEnd);
  // Boot trampoline at physical 0: LI R0, w0; LMI R0, w1; LHI R0, w2; JR R0
  const [e0, e1, e2] = ISA.numberToWord(entry.machAddr);
  const boot = [
    ...ISA.encodeInstruction(1, 0, 0, e0),  // LI R0, e0
    ...ISA.encodeInstruction(33, 0, 0, e1), // LMI R0, e1
    ...ISA.encodeInstruction(34, 0, 0, e2), // LHI R0, e2
    ...ISA.encodeInstruction(28, 0, 0, 0)   // JR R0
  ];
  for (let i = 0; i < boot.length; i++) image[i] = boot[i];

  // Copy non-BSS sections into flat image
  for (const sname of Object.keys(secLayout)) {
    const lay = secLayout[sname];
    const m = merged[sname];
    if (!lay.isBss && m.trytes && m.trytes.length > 0) {
      for (let i = 0; i < m.trytes.length; i++) {
        image[lay.machAddr + i] = m.trytes[i];
      }
    }
  }

  const symOut = {};
  for (const [k, v] of globalSyms.entries()) {
    symOut[k] = { machAddr: v.machAddr, cAddr: v.cAddr, section: v.section, bind: v.bind };
  }

  return {
    magic: 'T5X1',
    version: 1,
    pageSize,
    bias,
    entrySymbol,
    entryMach: entry.machAddr,
    entryC: entry.cAddr,
    sections: secLayout,
    symbols: symOut,
    image
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { linkT5X };
}
