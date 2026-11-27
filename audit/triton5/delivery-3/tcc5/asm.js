'use strict';

/**
 * Triton 5.0 Relocatable Assembler (`tcc5/asm.js` — t5as)
 * ConsciousNode SoftWorks — MIT License
 *
 * Produces `.t5o` relocatable object files (ABI-5.md §6.1) with sections,
 * local/global/weak symbols, and relocations.
 */

const ISA = (typeof require !== 'undefined') ? require('./isa') : globalThis.TCC5_ISA;

function stripComment(line) {
  let inS = false, inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && (inS || inD)) { i++; continue; }
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if ((c === ';' || (c === '/' && line[i + 1] === '/')) && !inS && !inD) {
      return line.slice(0, i);
    }
  }
  return line;
}

function splitArgs(str) {
  const out = [];
  let cur = '', inS = false, inD = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '\\' && (inS || inD) && i + 1 < str.length) {
      cur += c + str[++i];
      continue;
    }
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === ',' && !inS && !inD) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim().length > 0) out.push(cur.trim());
  return out;
}

function parseIntLit(s) {
  s = s.trim();
  if (s.startsWith('#')) s = s.slice(1).trim();
  if (/^[+-]?0x[0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
  if (/^[+-]?0b[01]+$/.test(s)) {
    const neg = s[0] === '-';
    const body = s.replace(/^[+-]?0b/, '');
    return (neg ? -1 : 1) * parseInt(body, 2);
  }
  if (/^[+-]?\d+$/.test(s)) return parseInt(s, 10);
  if (s.length >= 3 && s[0] === "'" && s[s.length - 1] === "'") {
    const inner = s.slice(1, -1);
    if (inner === '\\n') return 10;
    if (inner === '\\r') return 13;
    if (inner === '\\t') return 9;
    if (inner === '\\0') return 0;
    if (inner === '\\\\') return 92;
    if (inner === "\\'") return 39;
    return inner.charCodeAt(0);
  }
  return null;
}

function parseSymExpr(expr, equs) {
  let s = expr.trim();
  if (s.startsWith('#')) s = s.slice(1).trim();
  const n = parseIntLit(s);
  if (n !== null) return { sym: null, addend: n };
  // Check sym + off or sym - off
  const m = /^([A-Za-z_.$][A-Za-z0-9_.$]*)\s*([+-])\s*(.+)$/.exec(s);
  if (m) {
    const symName = m[1];
    const sign = m[2] === '-' ? -1 : 1;
    const rhs = parseIntLit(m[3]);
    if (rhs !== null) {
      if (equs.has(symName)) return { sym: null, addend: equs.get(symName) + sign * rhs };
      return { sym: symName, addend: sign * rhs };
    }
  }
  if (equs.has(s)) return { sym: null, addend: equs.get(s) };
  if (/^[A-Za-z_.$][A-Za-z0-9_.$]*$/.test(s)) {
    return { sym: s, addend: 0 };
  }
  return null;
}

function parseStringLit(raw, lineNo) {
  const s = raw.trim();
  if (s.length < 2 || s[0] !== '"' || s[s.length - 1] !== '"') {
    throw new Error(`Line ${lineNo}: invalid string literal ${raw}`);
  }
  const bytes = [];
  for (let i = 1; i < s.length - 1; i++) {
    if (s[i] === '\\' && i + 1 < s.length - 1) {
      const n = s[++i];
      if (n === 'n') bytes.push(10);
      else if (n === 'r') bytes.push(13);
      else if (n === 't') bytes.push(9);
      else if (n === '0') bytes.push(0);
      else if (n === '\\') bytes.push(92);
      else if (n === '"') bytes.push(34);
      else if (n === 'x') {
        const hex = s.slice(i + 1, i + 3);
        bytes.push(parseInt(hex, 16) & 0xFF);
        i += 2;
      } else {
        bytes.push(n.charCodeAt(0) & 0xFF);
      }
    } else {
      bytes.push(s.charCodeAt(i) & 0xFF);
    }
  }
  return bytes;
}

function assembleT5O(source, filename = '<asm>') {
  const lines = source.split(/\r?\n/);
  const sections = {
    '.text':       { trytes: [], size: 0, align: 2, flags: 'AX' },
    '.rodata':     { trytes: [], size: 0, align: 4, flags: 'A' },
    '.data':       { trytes: [], size: 0, align: 4, flags: 'AW' },
    '.bss':        { trytes: null, size: 0, align: 4, flags: 'AWN' },
    '.init_array': { trytes: [], size: 0, align: 4, flags: 'A' }
  };
  let curSecName = '.text';
  const symMap = new Map(); // name -> { name, section, offset, bind, type, size }
  const equs = new Map();
  const relocs = [];

  function ensureSection(name, flags = 'A') {
    if (!sections[name]) {
      const isBss = name === '.bss' || name.startsWith('.bss.');
      sections[name] = { trytes: isBss ? null : [], size: 0, align: 4, flags: isBss ? 'AWN' : flags };
    }
    return sections[name];
  }

  function curSec() { return sections[curSecName]; }
  function curOff() {
    const s = curSec();
    return s.trytes ? s.trytes.length : s.size;
  }

  function emitTryte(v) {
    const s = curSec();
    if (!s.trytes) throw new Error(`Cannot emit initialized data in ${curSecName}`);
    s.trytes.push(ISA.balRem(v, ISA.TRYTE_MOD, ISA.TRYTE_HALF));
    s.size = s.trytes.length;
  }

  function emitInstr(op, rd, rs1, t1) {
    const [t0, t1e] = ISA.encodeInstruction(op, rd, rs1, t1);
    emitTryte(t0);
    emitTryte(t1e);
  }

  function getOrCreateSym(name) {
    let s = symMap.get(name);
    if (!s) {
      s = { name, section: null, offset: 0, bind: 'LOCAL', type: 'NOTYPE', size: 0 };
      symMap.set(name, s);
    }
    return s;
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    let line = stripComment(lines[i]).trim();
    if (!line) continue;

    // Handle one or more labels on the same line
    while (true) {
      const lm = /^([A-Za-z_.$][A-Za-z0-9_.$]*):(.*)$/.exec(line);
      if (!lm) break;
      const lbl = lm[1];
      const sym = getOrCreateSym(lbl);
      sym.section = curSecName;
      sym.offset = curOff();
      if (curSecName === '.text' && sym.type === 'NOTYPE') sym.type = 'FUNC';
      line = lm[2].trim();
    }
    if (!line) continue;

    // Split mnemonic / directive and operands
    const sp = /^(\S+)(?:\s+(.*))?$/.exec(line);
    if (!sp) continue;
    const head = sp[1];
    const rest = (sp[2] || '').trim();

    if (head.startsWith('.')) {
      const dir = head.toLowerCase();
      if (dir === '.text') { curSecName = '.text'; continue; }
      if (dir === '.rodata') { curSecName = '.rodata'; continue; }
      if (dir === '.data') { curSecName = '.data'; continue; }
      if (dir === '.bss') { curSecName = '.bss'; continue; }
      if (dir === '.init_array') { curSecName = '.init_array'; continue; }
      if (dir === '.section') {
        const parts = splitArgs(rest);
        const secName = parts[0].replace(/^"|"$/g, '');
        ensureSection(secName);
        curSecName = secName;
        continue;
      }
      if (dir === '.globl' || dir === '.global') {
        for (const a of splitArgs(rest)) getOrCreateSym(a).bind = 'GLOBAL';
        continue;
      }
      if (dir === '.weak') {
        for (const a of splitArgs(rest)) getOrCreateSym(a).bind = 'WEAK';
        continue;
      }
      if (dir === '.local') {
        for (const a of splitArgs(rest)) getOrCreateSym(a).bind = 'LOCAL';
        continue;
      }
      if (dir === '.equ' || dir === '.set') {
        const parts = splitArgs(rest);
        const val = parseIntLit(parts[1]);
        if (val === null) throw new Error(`${filename}:${lineNo}: invalid .equ value '${parts[1]}'`);
        equs.set(parts[0], val);
        continue;
      }
      if (dir === '.align' || dir === '.balign') {
        const n = parseIntLit(rest);
        if (!n || n < 1) throw new Error(`${filename}:${lineNo}: invalid .align '${rest}'`);
        const s = curSec();
        if (n > s.align) s.align = n;
        const off = curOff();
        const rem = off % n;
        if (rem !== 0) {
          const pad = n - rem;
          if (s.trytes) {
            for (let p = 0; p < pad; p++) emitTryte(0);
          } else {
            s.size += pad;
          }
        }
        continue;
      }
      if (dir === '.zero' || dir === '.space' || dir === '.skip') {
        const n = parseIntLit(rest);
        if (n === null || n < 0) throw new Error(`${filename}:${lineNo}: invalid .zero '${rest}'`);
        const s = curSec();
        if (s.trytes) {
          for (let k = 0; k < n; k++) emitTryte(0);
        } else {
          s.size += n;
        }
        continue;
      }
      if (dir === '.byte' || dir === '.tryte') {
        for (const a of splitArgs(rest)) {
          const v = parseIntLit(a);
          if (v === null) throw new Error(`${filename}:${lineNo}: invalid .byte '${a}'`);
          emitTryte(dir === '.byte' ? (v & 0xFF) : v);
        }
        continue;
      }
      if (dir === '.short' || dir === '.half' || dir === '.hword') {
        for (const a of splitArgs(rest)) {
          const v = parseIntLit(a);
          if (v === null) throw new Error(`${filename}:${lineNo}: invalid .short '${a}'`);
          emitTryte(v & 0xFF);
          emitTryte((v >>> 8) & 0xFF);
        }
        continue;
      }
      if (dir === '.long' || dir === '.word' || dir === '.caddr32') {
        for (const a of splitArgs(rest)) {
          const expr = parseSymExpr(a, equs);
          if (!expr) throw new Error(`${filename}:${lineNo}: invalid .long '${a}'`);
          if (expr.sym) {
            relocs.push({
              section: curSecName,
              offset: curOff(),
              type: 'R_T5_CADDR32',
              symbol: expr.sym,
              addend: expr.addend
            });
            emitTryte(0); emitTryte(0); emitTryte(0); emitTryte(0);
          } else {
            const u = expr.addend >>> 0;
            emitTryte(u & 0xFF);
            emitTryte((u >>> 8) & 0xFF);
            emitTryte((u >>> 16) & 0xFF);
            emitTryte((u >>> 24) & 0xFF);
          }
        }
        continue;
      }
      if (dir === '.tword') {
        // Native 27-trit 3-tryte Triton word
        for (const a of splitArgs(rest)) {
          const v = parseIntLit(a);
          if (v === null) throw new Error(`${filename}:${lineNo}: invalid .tword '${a}'`);
          const [w0, w1, w2] = ISA.numberToWord(v);
          emitTryte(w0); emitTryte(w1); emitTryte(w2);
        }
        continue;
      }
      if (dir === '.ascii' || dir === '.asciz' || dir === '.string') {
        const bytes = parseStringLit(rest, lineNo);
        for (const b of bytes) emitTryte(b);
        if (dir !== '.ascii') emitTryte(0);
        continue;
      }
      if (dir === '.type' || dir === '.size' || dir === '.file' || dir === '.loc' || dir === '.ident') {
        continue;
      }
      throw new Error(`${filename}:${lineNo}: unknown directive '${head}'`);
    }

    // Pseudo-instructions and real instructions
    const mnem = head.toUpperCase();
    const args = rest ? splitArgs(rest) : [];

    // Pseudo: LC rd, imm27 (load arbitrary 27-trit constant)
    if (mnem === 'LC') {
      const rd = ISA.parseReg(args[0], lineNo);
      const val = parseIntLit(args[1]);
      if (val === null) throw new Error(`${filename}:${lineNo}: LC expects integer literal, got '${args[1]}'`);
      const [w0, w1, w2] = ISA.numberToWord(val);
      emitInstr(1, rd, 0, w0); // LI
      if (w1 !== 0) emitInstr(33, rd, 0, w1); // LMI
      if (w2 !== 0) emitInstr(34, rd, 0, w2); // LHI
      continue;
    }

    // Pseudo: LA rd, sym[+off] (load C-space address of symbol)
    if (mnem === 'LA' || mnem === 'LMA') {
      const rd = ISA.parseReg(args[0], lineNo);
      const expr = parseSymExpr(args[1], equs);
      if (!expr) throw new Error(`${filename}:${lineNo}: ${mnem} invalid expr '${args[1]}'`);
      if (!expr.sym) {
        const [w0, w1, w2] = ISA.numberToWord(expr.addend);
        emitInstr(1, rd, 0, w0);
        if (w1 !== 0) emitInstr(33, rd, 0, w1);
        if (w2 !== 0) emitInstr(34, rd, 0, w2);
      } else {
        const pfx = mnem === 'LA' ? 'R_T5_CADDR27' : 'R_T5_ABS27';
        relocs.push({ section: curSecName, offset: curOff(), type: `${pfx}_LO`, symbol: expr.sym, addend: expr.addend });
        emitInstr(1, rd, 0, 0); // LI
        relocs.push({ section: curSecName, offset: curOff(), type: `${pfx}_MID`, symbol: expr.sym, addend: expr.addend });
        emitInstr(33, rd, 0, 0); // LMI
        relocs.push({ section: curSecName, offset: curOff(), type: `${pfx}_HI`, symbol: expr.sym, addend: expr.addend });
        emitInstr(34, rd, 0, 0); // LHI
      }
      continue;
    }

    // Pseudo: CALL_SYM sym (far-safe direct call via R3 without clobbering R0..R2)
    if (mnem === 'CALL_SYM') {
      const expr = parseSymExpr(args[0], equs);
      if (!expr || !expr.sym) throw new Error(`${filename}:${lineNo}: CALL_SYM expects symbol`);
      relocs.push({ section: curSecName, offset: curOff(), type: 'R_T5_ABS27_LO', symbol: expr.sym, addend: expr.addend });
      emitInstr(1, 3, 0, 0);
      relocs.push({ section: curSecName, offset: curOff(), type: 'R_T5_ABS27_MID', symbol: expr.sym, addend: expr.addend });
      emitInstr(33, 3, 0, 0);
      relocs.push({ section: curSecName, offset: curOff(), type: 'R_T5_ABS27_HI', symbol: expr.sym, addend: expr.addend });
      emitInstr(34, 3, 0, 0);
      emitInstr(48, 0, 0, 2); // CALLX +2
      emitInstr(41, 0, 0, 2); // JMPX +2
      emitInstr(28, 0, 3, 0); // JR R3
      continue;
    }

    // Pseudo: JMP_SYM sym (far-safe direct jump via R3)
    if (mnem === 'JMP_SYM') {
      const expr = parseSymExpr(args[0], equs);
      if (!expr || !expr.sym) throw new Error(`${filename}:${lineNo}: JMP_SYM expects symbol`);
      relocs.push({ section: curSecName, offset: curOff(), type: 'R_T5_ABS27_LO', symbol: expr.sym, addend: expr.addend });
      emitInstr(1, 3, 0, 0);
      relocs.push({ section: curSecName, offset: curOff(), type: 'R_T5_ABS27_MID', symbol: expr.sym, addend: expr.addend });
      emitInstr(33, 3, 0, 0);
      relocs.push({ section: curSecName, offset: curOff(), type: 'R_T5_ABS27_HI', symbol: expr.sym, addend: expr.addend });
      emitInstr(34, 3, 0, 0);
      emitInstr(28, 0, 3, 0); // JR R3
      continue;
    }

    // Standard Triton 5 instruction
    const spec = ISA.OPCODES[mnem];
    if (!spec) throw new Error(`${filename}:${lineNo}: unknown instruction '${head}'`);

    const op = spec.op;
    switch (spec.fmt) {
      case 'NONE':
        emitInstr(op, 0, 0, 0);
        break;
      case 'RD':
        emitInstr(op, ISA.parseReg(args[0], lineNo), 0, 0);
        break;
      case 'RS1':
        emitInstr(op, 0, ISA.parseReg(args[0], lineNo), 0);
        break;
      case 'RD_RS1':
        emitInstr(op, ISA.parseReg(args[0], lineNo), ISA.parseReg(args[1], lineNo), 0);
        break;
      case 'RS1_RS2':
        emitInstr(op, 0, ISA.parseReg(args[0], lineNo), ISA.balRem(ISA.parseReg(args[1], lineNo), 9, 4));
        break;
      case 'RRR':
        emitInstr(
          op,
          ISA.parseReg(args[0], lineNo),
          ISA.parseReg(args[1], lineNo),
          ISA.balRem(ISA.parseReg(args[2], lineNo), 9, 4)
        );
        break;
      case 'RD_IMM': {
        const rd = ISA.parseReg(args[0], lineNo);
        const expr = parseSymExpr(args[1], equs);
        if (!expr) throw new Error(`${filename}:${lineNo}: bad imm '${args[1]}'`);
        if (expr.sym) {
          relocs.push({ section: curSecName, offset: curOff(), type: 'R_T5_ABS27_LO', symbol: expr.sym, addend: expr.addend });
          emitInstr(op, rd, 0, 0);
        } else {
          emitInstr(op, rd, 0, expr.addend);
        }
        break;
      }
      case 'RS1_IMM': {
        const rs1 = ISA.parseReg(args[0], lineNo);
        const expr = parseSymExpr(args[1], equs);
        if (!expr || expr.sym) throw new Error(`${filename}:${lineNo}: bad imm '${args[1]}'`);
        emitInstr(op, 0, rs1, expr.addend);
        break;
      }
      case 'RRI': {
        const rd = ISA.parseReg(args[0], lineNo);
        const rs1 = ISA.parseReg(args[1], lineNo);
        const expr = parseSymExpr(args[2], equs);
        if (!expr || expr.sym) throw new Error(`${filename}:${lineNo}: bad imm '${args[2]}'`);
        if (expr.addend < -ISA.TRYTE_HALF || expr.addend > ISA.TRYTE_HALF) {
          throw new Error(`${filename}:${lineNo}: imm9 out of range (${expr.addend})`);
        }
        emitInstr(op, rd, rs1, expr.addend);
        break;
      }
      case 'IMM': {
        const expr = parseSymExpr(args[0], equs);
        if (!expr) throw new Error(`${filename}:${lineNo}: bad imm '${args[0]}'`);
        if (expr.sym) {
          relocs.push({ section: curSecName, offset: curOff(), type: 'R_T5_ABS27_LO', symbol: expr.sym, addend: expr.addend });
          emitInstr(op, 0, 0, 0);
        } else {
          emitInstr(op, 0, 0, expr.addend);
        }
        break;
      }
      case 'REL': {
        const expr = parseSymExpr(args[0], equs);
        if (!expr) throw new Error(`${filename}:${lineNo}: bad branch target '${args[0]}'`);
        if (expr.sym) {
          relocs.push({ section: curSecName, offset: curOff(), type: 'R_T5_REL9', symbol: expr.sym, addend: expr.addend });
          emitInstr(op, 0, 0, 0);
        } else {
          emitInstr(op, 0, 0, expr.addend);
        }
        break;
      }
      default:
        throw new Error(`${filename}:${lineNo}: unhandled fmt ${spec.fmt}`);
    }
  }

  // Resolve intra-section REL9 relocations immediately when target is local and in same section
  const keptRelocs = [];
  for (const r of relocs) {
    const sym = symMap.get(r.symbol);
    if (r.type === 'R_T5_REL9' && sym && sym.section === r.section && sym.bind === 'LOCAL') {
      const rel = (sym.offset + r.addend) - (r.offset + 2);
      if (rel < -ISA.TRYTE_HALF || rel > ISA.TRYTE_HALF) {
        throw new Error(`${filename}: local branch to '${r.symbol}' out of rel9 range (${rel})`);
      }
      sections[r.section].trytes[r.offset + 1] = ISA.balRem(rel, ISA.TRYTE_MOD, ISA.TRYTE_HALF);
    } else {
      keptRelocs.push(r);
    }
  }

  return {
    magic: 'T5O1',
    version: 1,
    filename,
    pageSize: ISA.PAGE_SIZE,
    bias: ISA.PAGE_BIAS,
    sections,
    symbols: Array.from(symMap.values()),
    relocs: keptRelocs
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { assembleT5O };
}
