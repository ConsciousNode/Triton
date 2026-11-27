'use strict';

/**
 * ISO C11 + GNU Extensions Lexer, Parser & Constant Evaluator (`tcc5/parser.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Parses preprocessed C11 source into a typed AST with exact file:line diagnostics.
 */

const T = (typeof require !== 'undefined') ? require('./types') : globalThis.TCC5_TYPES;

const KEYWORDS = new Set([
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
  'inline', 'int', 'long', 'register', 'restrict', 'return', 'short',
  'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union',
  'unsigned', 'void', 'volatile', 'while',
  '_Bool', '_Static_assert', '_Alignas', '_Alignof', '_Generic', '_Noreturn',
  '__attribute__', '__attribute', '__asm__', '__asm', 'asm',
  '__typeof__', '__typeof', 'typeof', '__label__',
  '__inline__', '__inline', '__const__', '__const', '__volatile__', '__volatile',
  '__restrict__', '__restrict', '__extension__', '__signed__', '__signed',
  '__alignof__', '__alignof'
]);

function decodeEscape(src, i) {
  const c = src[i];
  if (c === 'n') return { ch: 10, next: i + 1 };
  if (c === 'r') return { ch: 13, next: i + 1 };
  if (c === 't') return { ch: 9, next: i + 1 };
  if (c === 'a') return { ch: 7, next: i + 1 };
  if (c === 'b') return { ch: 8, next: i + 1 };
  if (c === 'f') return { ch: 12, next: i + 1 };
  if (c === 'v') return { ch: 11, next: i + 1 };
  if (c === '\\') return { ch: 92, next: i + 1 };
  if (c === "'") return { ch: 39, next: i + 1 };
  if (c === '"') return { ch: 34, next: i + 1 };
  if (c === '?') return { ch: 63, next: i + 1 };
  if (c === 'x') {
    let j = i + 1;
    while (j < src.length && /[0-9a-fA-F]/.test(src[j])) j++;
    return { ch: parseInt(src.slice(i + 1, j) || '0', 16) & 0xFF, next: j };
  }
  if (c >= '0' && c <= '7') {
    let j = i;
    while (j < src.length && j < i + 3 && src[j] >= '0' && src[j] <= '7') j++;
    return { ch: parseInt(src.slice(i, j), 8) & 0xFF, next: j };
  }
  return { ch: c.charCodeAt(0) & 0xFF, next: i + 1 };
}

function tokenize(src, initFile = '<stdin>') {
  const tokens = [];
  let i = 0;
  const n = src.length;
  let file = initFile;
  let line = 1;

  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }

    // #line directive emitted by preprocessor
    if (c === '#' && (i === 0 || src[i - 1] === '\n')) {
      let j = i + 1;
      while (j < n && src[j] !== '\n') j++;
      const dirLine = src.slice(i, j).trim();
      const lm = /^#\s*(?:line\s+)?(\d+)(?:\s+"([^"]*)")?/.exec(dirLine);
      if (lm) {
        line = parseInt(lm[1], 10) - 1; // newline at j will increment it
        if (lm[2] !== undefined) file = lm[2];
      }
      i = j;
      continue;
    }

    // String literal
    if (c === '"' || ((c === 'L' || c === 'u' || c === 'U') && src[i + 1] === '"') ||
        (c === 'u' && src[i + 1] === '8' && src[i + 2] === '"')) {
      const startLine = line;
      if (c === 'u' && src[i + 1] === '8') i += 2;
      else if (c !== '"') i++;
      i++; // skip '"'
      const bytes = [];
      while (i < n && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < n) {
          const esc = decodeEscape(src, i + 1);
          bytes.push(esc.ch);
          i = esc.next;
        } else {
          bytes.push(src.charCodeAt(i++) & 0xFF);
        }
      }
      if (i < n) i++;
      // Concatenate adjacent string literals (C11 translation phase 6)
      if (tokens.length > 0 && tokens[tokens.length - 1].kind === 'STR') {
        tokens[tokens.length - 1].bytes.push(...bytes);
      } else {
        tokens.push({ kind: 'STR', bytes, file, line: startLine });
      }
      continue;
    }

    // Char literal
    if (c === "'" || ((c === 'L' || c === 'u' || c === 'U') && src[i + 1] === "'")) {
      const startLine = line;
      if (c !== "'") i++;
      i++; // skip '\''
      let val = 0;
      while (i < n && src[i] !== "'") {
        if (src[i] === '\\' && i + 1 < n) {
          const esc = decodeEscape(src, i + 1);
          val = (val << 8) | esc.ch;
          i = esc.next;
        } else {
          val = (val << 8) | (src.charCodeAt(i++) & 0xFF);
        }
      }
      if (i < n) i++;
      // Single-char literal sign-extended as char (signed 8-bit -> int)
      if (val >= 128 && val <= 255) val = val - 256;
      tokens.push({ kind: 'INT', value: BigInt(val), type: T.TY_INT, file, line: startLine });
      continue;
    }

    // Number literal (int or float)
    if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      const startLine = line;
      let start = i;
      let isHex = false;
      if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        isHex = true;
        i += 2;
      } else if (c === '0' && (src[i + 1] === 'b' || src[i + 1] === 'B')) {
        i += 2;
      }
      let isFloat = false;
      while (i < n) {
        const ch = src[i];
        if (ch === '.') { isFloat = true; i++; }
        else if (!isHex && (ch === 'e' || ch === 'E')) {
          isFloat = true; i++;
          if (src[i] === '+' || src[i] === '-') i++;
        } else if (isHex && (ch === 'p' || ch === 'P')) {
          isFloat = true; i++;
          if (src[i] === '+' || src[i] === '-') i++;
        } else if (/[0-9a-zA-Z_]/.test(ch)) {
          i++;
        } else break;
      }
      const raw = src.slice(start, i);
      if (isFloat) {
        const isF = /[fF]$/.test(raw);
        const body = raw.replace(/[fFlL]+$/, '');
        let numVal;
        if (isHex && /[pP]/.test(body)) {
          // Hexadecimal floating constant (C99/C11)
          const hm = /^0[xX]([0-9a-fA-F]*)(?:\.([0-9a-fA-F]*))?[pP]([+-]?\d+)$/.exec(body);
          if (!hm) throw new Error(`${file}:${startLine}: invalid hex float '${raw}'`);
          const intPart = hm[1] ? parseInt(hm[1], 16) : 0;
          let fracPart = 0;
          if (hm[2]) {
            for (let k = 0; k < hm[2].length; k++) {
              fracPart += parseInt(hm[2][k], 16) * Math.pow(16, -(k + 1));
            }
          }
          numVal = (intPart + fracPart) * Math.pow(2, parseInt(hm[3], 10));
        } else {
          numVal = Number(body);
        }
        tokens.push({
          kind: 'FLOAT',
          value: numVal,
          type: isF ? T.TY_FLOAT : T.TY_DOUBLE,
          file,
          line: startLine
        });
      } else {
        const sm = /^(.+?)([uUlL]*)$/.exec(raw);
        const body = sm[1];
        const suf = sm[2].toLowerCase();
        const isU = suf.includes('u');
        const isLL = suf.includes('ll');
        const isL = !isLL && suf.includes('l');
        let val;
        if (/^0[xX]/.test(body)) val = BigInt(body);
        else if (/^0[bB]/.test(body)) val = BigInt(body);
        else if (/^0[0-7]+$/.test(body)) val = BigInt('0o' + body.slice(1));
        else val = BigInt(body);
        const isDec = !/^0[xXbB0]/.test(body) || body === '0';
        let ty;
        if (isLL) {
          ty = isU ? T.TY_ULLONG : (val <= 0x7FFFFFFFFFFFFFFFn ? T.TY_LLONG : T.TY_ULLONG);
        } else if (isL) {
          if (isU) ty = val <= 0xFFFFFFFFn ? T.TY_ULONG : T.TY_ULLONG;
          else if (val <= 0x7FFFFFFFn) ty = T.TY_LONG;
          else if (!isDec && val <= 0xFFFFFFFFn) ty = T.TY_ULONG;
          else if (val <= 0x7FFFFFFFFFFFFFFFn) ty = T.TY_LLONG;
          else ty = T.TY_ULLONG;
        } else if (isU) {
          ty = val <= 0xFFFFFFFFn ? T.TY_UINT : T.TY_ULLONG;
        } else {
          if (val <= 0x7FFFFFFFn) ty = T.TY_INT;
          else if (!isDec && val <= 0xFFFFFFFFn) ty = T.TY_UINT;
          else if (val <= 0x7FFFFFFFFFFFFFFFn) ty = T.TY_LLONG;
          else ty = T.TY_ULLONG;
        }
        tokens.push({ kind: 'INT', value: val, type: ty, file, line: startLine });
      }
      continue;
    }

    // Identifier / keyword
    if (/[A-Za-z_$]/.test(c)) {
      const startLine = line;
      let start = i++;
      while (i < n && /[A-Za-z0-9_$]/.test(src[i])) i++;
      const text = src.slice(start, i);
      tokens.push({
        kind: KEYWORDS.has(text) ? 'KW' : 'IDENT',
        text,
        file,
        line: startLine
      });
      continue;
    }

    // Punctuators
    const startLine = line;
    const three = src.slice(i, i + 3);
    if (three === '...' || three === '<<=' || three === '>>=') {
      tokens.push({ kind: 'PUNCT', text: three, file, line: startLine });
      i += 3; continue;
    }
    const two = src.slice(i, i + 2);
    if (['->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
         '+=', '-=', '*=', '/=', '%=', '&=', '^=', '|='].includes(two)) {
      tokens.push({ kind: 'PUNCT', text: two, file, line: startLine });
      i += 2; continue;
    }
    tokens.push({ kind: 'PUNCT', text: c, file, line: startLine });
    i++;
  }
  tokens.push({ kind: 'EOF', text: '<eof>', file, line });
  return tokens;
}

function parseProgram(preprocessedSrc, filename = '<stdin>') {
  const tokens = tokenize(preprocessedSrc, filename);
  let pos = 0;

  function peek(k = 0) { return tokens[Math.min(pos + k, tokens.length - 1)]; }
  function next() { return tokens[pos++]; }
  function err(msg, tok = peek()) {
    throw new Error(`${tok.file}:${tok.line}: error: ${msg}`);
  }
  function isP(text) { const t = peek(); return t.kind === 'PUNCT' && t.text === text; }
  function isKW(text) { const t = peek(); return t.kind === 'KW' && t.text === text; }
  function matchP(text) { if (isP(text)) { pos++; return true; } return false; }
  function matchKW(text) { if (isKW(text)) { pos++; return true; } return false; }
  function expectP(text) {
    if (!matchP(text)) err(`expected '${text}', got '${peek().text || peek().kind}'`);
  }

  // Scopes: stack of { vars: Map, typedefs: Map, tags: Map, enums: Map }
  const scopes = [];
  function pushScope() {
    scopes.push({ vars: new Map(), typedefs: new Map(), tags: new Map(), enums: new Map() });
  }
  function popScope() { scopes.pop(); }
  function curScope() { return scopes[scopes.length - 1]; }

  function lookupTypedef(name) {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i].vars.has(name) || scopes[i].enums.has(name)) return null;
      if (scopes[i].typedefs.has(name)) return scopes[i].typedefs.get(name);
    }
    return null;
  }
  function lookupTag(name, curOnly = false) {
    const end = curOnly ? scopes.length - 1 : 0;
    for (let i = scopes.length - 1; i >= end; i--) {
      if (scopes[i].tags.has(name)) return scopes[i].tags.get(name);
    }
    return null;
  }
  function lookupVar(name) {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i].vars.has(name)) return scopes[i].vars.get(name);
      if (scopes[i].enums.has(name)) return { isEnum: true, value: scopes[i].enums.get(name) };
    }
    return null;
  }

  // Track current function for return type / __func__ / local labels
  let currentFunc = null;
  let anonId = 0;

  // Constant expression evaluator (returns BigInt)
  function evalConstExpr(node) {
    if (!node) err('expected constant expression');
    switch (node.kind) {
      case 'IntLit': return node.value;
      case 'FloatLit': return BigInt(Math.trunc(node.value));
      case 'SizeofType': return BigInt(node.targetType.size);
      case 'SizeofExpr': return BigInt(node.exprType.size);
      case 'AlignofType': return BigInt(node.targetType.align);
      case 'Offsetof': return BigInt(node.offset);
      case 'BuiltinConstP': return BigInt(isConstExpr(node.arg) ? 1 : 0);
      case 'Cast': {
        const v = evalConstExpr(node.expr);
        return maskInt(v, node.type);
      }
      case 'Unary': {
        const v = evalConstExpr(node.expr);
        if (node.op === '+') return v;
        if (node.op === '-') return maskInt(-v, node.type);
        if (node.op === '~') return maskInt(~v, node.type);
        if (node.op === '!') return v === 0n ? 1n : 0n;
        err(`non-constant unary op '${node.op}'`);
      }
      case 'Binary': {
        const op = node.op;
        if (op === '&&') return evalConstExpr(node.left) !== 0n ? (evalConstExpr(node.right) !== 0n ? 1n : 0n) : 0n;
        if (op === '||') return evalConstExpr(node.left) !== 0n ? 1n : (evalConstExpr(node.right) !== 0n ? 1n : 0n);
        const l = evalConstExpr(node.left);
        const r = evalConstExpr(node.right);
        const isU = node.type && node.type.unsigned;
        const bits = (node.type && node.type.size === 8) ? 64n : 32n;
        const lu = isU ? BigInt.asUintN(Number(bits), l) : l;
        const ru = isU ? BigInt.asUintN(Number(bits), r) : r;
        switch (op) {
          case '+': return maskInt(l + r, node.type);
          case '-': return maskInt(l - r, node.type);
          case '*': return maskInt(l * r, node.type);
          case '/': if (ru === 0n) err('division by zero in constant expression'); return maskInt(lu / ru, node.type);
          case '%': if (ru === 0n) err('modulo by zero in constant expression'); return maskInt(lu % ru, node.type);
          case '<<': return maskInt(l << r, node.type);
          case '>>': return maskInt(lu >> ru, node.type);
          case '&': return maskInt(l & r, node.type);
          case '|': return maskInt(l | r, node.type);
          case '^': return maskInt(l ^ r, node.type);
          case '==': return l === r ? 1n : 0n;
          case '!=': return l !== r ? 1n : 0n;
          case '<': return lu < ru ? 1n : 0n;
          case '<=': return lu <= ru ? 1n : 0n;
          case '>': return lu > ru ? 1n : 0n;
          case '>=': return lu >= ru ? 1n : 0n;
          case ',': return r;
          default: err(`non-constant binary op '${op}'`);
        }
      }
      case 'Ternary': {
        const c = evalConstExpr(node.cond);
        return c !== 0n ? evalConstExpr(node.thenExpr) : evalConstExpr(node.elseExpr);
      }
      default:
        err(`expression kind '${node.kind}' is not a constant integer expression`);
    }
  }

  function isConstExpr(node) {
    try { evalConstExpr(node); return true; } catch (_) { return false; }
  }

  function maskInt(v, ty) {
    if (!ty || !T.isInteger(ty)) return v;
    if (ty.kind === T.TK.BOOL) return v !== 0n ? 1n : 0n;
    const bits = ty.size * 8;
    return ty.unsigned ? BigInt.asUintN(bits, v) : BigInt.asIntN(bits, v);
  }

  // Parse GNU __attribute__((...)) list
  function parseAttributes() {
    const attrs = {};
    while (isKW('__attribute__') || isKW('__attribute')) {
      next();
      expectP('(');
      expectP('(');
      while (!isP(')') && peek().kind !== 'EOF') {
        if (matchP(',')) continue;
        const tok = next();
        let name = (tok.text || '').replace(/^__/, '').replace(/__$/, '');
        if (matchP('(')) {
          const args = [];
          while (!isP(')') && peek().kind !== 'EOF') {
            if (name === 'aligned') {
              const e = parseAssignExpr();
              args.push(Number(evalConstExpr(e)));
            } else if (name === 'section') {
              const st = next();
              args.push(st.kind === 'STR' ? String.fromCharCode(...st.bytes) : (st.text || ''));
            } else if (name === 'format') {
              const ft = next();
              args.push(ft.text || String(ft.value));
            } else {
              // Skip arbitrary balanced tokens
              let depth = 0;
              while (peek().kind !== 'EOF' && !(depth === 0 && (isP(',') || isP(')')))) {
                if (isP('(')) depth++;
                else if (isP(')')) depth--;
                next();
              }
            }
            matchP(',');
          }
          expectP(')');
          attrs[name] = args.length === 1 ? args[0] : (args.length ? args : true);
        } else {
          attrs[name] = true;
        }
        matchP(',');
      }
      expectP(')');
      expectP(')');
    }
    return attrs;
  }

  function mergeAttrs(a, b) {
    return Object.assign({}, a, b);
  }

  // Check if current token starts a declaration specifier / type name
  function isTypeStart(tok = peek()) {
    if (tok.kind === 'KW') {
      return [
        'void', '_Bool', 'char', 'short', 'int', 'long', 'signed', '__signed', '__signed__',
        'unsigned', 'float', 'double', 'struct', 'union', 'enum',
        'const', '__const', '__const__', 'volatile', '__volatile', '__volatile__',
        'restrict', '__restrict', '__restrict__',
        'static', 'extern', 'auto', 'register', 'typedef',
        'inline', '__inline', '__inline__', '_Noreturn', '_Alignas',
        '__typeof__', '__typeof', 'typeof', '__attribute__', '__attribute', '__extension__'
      ].includes(tok.text);
    }
    if (tok.kind === 'IDENT') {
      return lookupTypedef(tok.text) !== null;
    }
    return false;
  }

  // Parse declaration specifiers -> { type, storage, isInline, isNoreturn, alignas, attrs }
  function parseDeclSpec() {
    let storage = null;
    let isInline = false;
    let isNoreturn = false;
    let isConst = false, isVolatile = false, isRestrict = false;
    let alignas = 0;
    let attrs = {};

    let baseType = null;
    let nVoid = 0, nBool = 0, nChar = 0, nShort = 0, nInt = 0, nLong = 0;
    let nSigned = 0, nUnsigned = 0, nFloat = 0, nDouble = 0;

    while (true) {
      if (isKW('__extension__')) { next(); continue; }
      if (isKW('__attribute__') || isKW('__attribute')) {
        attrs = mergeAttrs(attrs, parseAttributes());
        continue;
      }
      if (matchKW('typedef')) { storage = 'typedef'; continue; }
      if (matchKW('static')) { storage = 'static'; continue; }
      if (matchKW('extern')) { storage = 'extern'; continue; }
      if (matchKW('auto')) { storage = 'auto'; continue; }
      if (matchKW('register')) { storage = 'register'; continue; }
      if (matchKW('inline') || matchKW('__inline') || matchKW('__inline__')) { isInline = true; continue; }
      if (matchKW('_Noreturn')) { isNoreturn = true; continue; }
      if (matchKW('const') || matchKW('__const') || matchKW('__const__')) { isConst = true; continue; }
      if (matchKW('volatile') || matchKW('__volatile') || matchKW('__volatile__')) { isVolatile = true; continue; }
      if (matchKW('restrict') || matchKW('__restrict') || matchKW('__restrict__')) { isRestrict = true; continue; }

      if (matchKW('_Alignas')) {
        expectP('(');
        let al;
        if (isTypeStart()) {
          al = parseTypeName().align;
        } else {
          al = Number(evalConstExpr(parseCondExpr()));
        }
        expectP(')');
        if (al > alignas) alignas = al;
        continue;
      }

      if (matchKW('__typeof__') || matchKW('__typeof') || matchKW('typeof')) {
        expectP('(');
        if (isTypeStart()) {
          baseType = parseTypeName();
        } else {
          const e = parseExpr();
          baseType = e.type;
        }
        expectP(')');
        continue;
      }

      if (matchKW('void')) { nVoid++; continue; }
      if (matchKW('_Bool')) { nBool++; continue; }
      if (matchKW('char')) { nChar++; continue; }
      if (matchKW('short')) { nShort++; continue; }
      if (matchKW('int')) { nInt++; continue; }
      if (matchKW('long')) { nLong++; continue; }
      if (matchKW('signed') || matchKW('__signed') || matchKW('__signed__')) { nSigned++; continue; }
      if (matchKW('unsigned')) { nUnsigned++; continue; }
      if (matchKW('float')) { nFloat++; continue; }
      if (matchKW('double')) { nDouble++; continue; }

      if (isKW('struct') || isKW('union')) {
        baseType = parseStructOrUnion();
        continue;
      }
      if (isKW('enum')) {
        baseType = parseEnum();
        continue;
      }

      // Typedef name only if no base type specifier seen yet
      if (peek().kind === 'IDENT' && !baseType &&
          !(nVoid || nBool || nChar || nShort || nInt || nLong || nSigned || nUnsigned || nFloat || nDouble)) {
        const td = lookupTypedef(peek().text);
        if (td) {
          next();
          baseType = td;
          continue;
        }
      }
      break;
    }

    let ty;
    if (baseType) {
      ty = T.cloneType(baseType);
    } else if (nVoid) {
      ty = T.TY_VOID;
    } else if (nBool) {
      ty = T.TY_BOOL;
    } else if (nFloat) {
      ty = T.TY_FLOAT;
    } else if (nDouble) {
      ty = T.TY_DOUBLE;
    } else if (nChar) {
      ty = nUnsigned ? T.TY_UCHAR : T.TY_SCHAR;
    } else if (nShort) {
      ty = nUnsigned ? T.TY_USHORT : T.TY_SHORT;
    } else if (nLong >= 2) {
      ty = nUnsigned ? T.TY_ULLONG : T.TY_LLONG;
    } else if (nLong === 1) {
      ty = nUnsigned ? T.TY_ULONG : T.TY_LONG;
    } else if (nUnsigned) {
      ty = T.TY_UINT;
    } else {
      ty = T.TY_INT;
    }

    if (isConst || isVolatile || isRestrict || alignas || attrs.aligned) {
      const forcedAl = Math.max(alignas, typeof attrs.aligned === 'number' ? attrs.aligned : 0);
      ty = T.cloneType(ty, {
        isConst: ty.isConst || isConst,
        isVolatile: ty.isVolatile || isVolatile,
        isRestrict: ty.isRestrict || isRestrict,
        align: forcedAl > ty.align ? forcedAl : ty.align
      });
    }
    if (attrs.noreturn) isNoreturn = true;
    return { type: ty, storage, isInline, isNoreturn, alignas, attrs };
  }

  function parseStructOrUnion() {
    const isUnion = next().text === 'union';
    const kind = isUnion ? T.TK.UNION : T.TK.STRUCT;
    let attrs = parseAttributes();
    let tag = null;
    if (peek().kind === 'IDENT') {
      tag = next().text;
    }
    if (isP('{')) {
      let ty = tag ? lookupTag(tag, true) : null;
      if (!ty) {
        ty = T.makeType(kind, { tag: tag || `<anon_${++anonId}>`, fields: [], complete: false });
        if (tag) curScope().tags.set(tag, ty);
      } else if (ty.kind !== kind) {
        err(`tag '${tag}' redeclared with different kind`);
      }
      next(); // '{'
      ty.fields = [];
      while (!isP('}') && peek().kind !== 'EOF') {
        if (matchP(';')) continue;
        if (matchKW('_Static_assert')) { parseStaticAssert(); continue; }
        const ds = parseDeclSpec();
        if (isP(';')) {
          // Anonymous struct/union member (C11 6.7.2.1p13)
          if (T.isAggregate(ds.type)) {
            ty.fields.push({ name: null, type: ds.type, bitWidth: null, align: ds.alignas || ds.type.align, anon: true });
          }
          next();
          continue;
        }
        while (true) {
          let fName = null;
          let fType = ds.type;
          let bitWidth = null;
          let fAttrs = ds.attrs;
          if (!isP(':')) {
            const decl = parseDeclarator(ds.type);
            fName = decl.name;
            fType = decl.type;
            fAttrs = mergeAttrs(fAttrs, decl.attrs);
          }
          if (matchP(':')) {
            bitWidth = Number(evalConstExpr(parseCondExpr()));
          }
          fAttrs = mergeAttrs(fAttrs, parseAttributes());
          const fAlign = Math.max(ds.alignas || 0, typeof fAttrs.aligned === 'number' ? fAttrs.aligned : 0, fType.align || 1);
          ty.fields.push({ name: fName, type: fType, bitWidth, align: fAlign, attrs: fAttrs });
          if (!matchP(',')) break;
        }
        expectP(';');
      }
      expectP('}');
      attrs = mergeAttrs(attrs, parseAttributes());
      const packed = !!attrs.packed;
      const forcedAlign = typeof attrs.aligned === 'number' ? attrs.aligned : 0;
      T.layoutStructOrUnion(ty, packed, forcedAlign);
      return ty;
    }
    if (!tag) err('expected struct/union tag or body');
    let ty = lookupTag(tag, false);
    if (!ty) {
      ty = T.makeType(kind, { tag, fields: [], complete: false });
      curScope().tags.set(tag, ty);
    }
    return ty;
  }

  function parseEnum() {
    next(); // 'enum'
    let tag = null;
    if (peek().kind === 'IDENT') tag = next().text;
    let ty = tag ? lookupTag(tag, true) : null;
    if (!ty) {
      ty = T.makeType(T.TK.ENUM, { tag: tag || `<enum_${++anonId}>`, size: 4, align: 4, unsigned: false });
      if (tag) curScope().tags.set(tag, ty);
    }
    if (matchP('{')) {
      let nextVal = 0n;
      while (!isP('}') && peek().kind !== 'EOF') {
        const ename = next();
        if (ename.kind !== 'IDENT') err('expected enumerator name', ename);
        if (matchP('=')) {
          nextVal = evalConstExpr(parseCondExpr());
        }
        curScope().enums.set(ename.text, nextVal);
        nextVal += 1n;
        if (!matchP(',')) break;
      }
      expectP('}');
    }
    return ty;
  }

  // Parse pointers: * [const|volatile|restrict]* ...
  function parsePointers(base) {
    let ty = base;
    while (matchP('*')) {
      let isC = false, isV = false, isR = false;
      while (true) {
        if (matchKW('const') || matchKW('__const') || matchKW('__const__')) isC = true;
        else if (matchKW('volatile') || matchKW('__volatile') || matchKW('__volatile__')) isV = true;
        else if (matchKW('restrict') || matchKW('__restrict') || matchKW('__restrict__')) isR = true;
        else if (isKW('__attribute__') || isKW('__attribute')) parseAttributes();
        else break;
      }
      ty = T.cloneType(T.ptrTo(ty), { isConst: isC, isVolatile: isV, isRestrict: isR });
    }
    return ty;
  }

  // Full C11 declarator (handles nested (*fp)(args), (*arr)[N], etc.)
  function parseDeclarator(baseType, allowAbstract = false) {
    let ty = parsePointers(baseType);
    let name = null;
    let attrs = {};

    // Placeholder for grouped declarator: ( *name )(args)
    let placeholder = null;
    if (isP('(') && !(allowAbstract && (isP(')') || isTypeStart(peek(1))))) {
      // Save position to distinguish grouped declarator from function params in abstract declarator
      const savePos = pos;
      next(); // '('
      if (allowAbstract && (isP(')') || isTypeStart())) {
        pos = savePos;
      } else {
        placeholder = { kind: 'PLACEHOLDER' };
        const inner = parseDeclarator(placeholder, allowAbstract);
        expectP(')');
        name = inner.name;
        attrs = mergeAttrs(attrs, inner.attrs);
        const outer = parseTypeSuffix(ty);
        // Replace placeholder inside inner.type with outer
        return { name, type: replacePlaceholder(inner.type, placeholder, outer), attrs };
      }
    } else if (peek().kind === 'IDENT') {
      name = next().text;
    } else if (!allowAbstract) {
      // Allow unnamed in some contexts (e.g. params)
    }

    ty = parseTypeSuffix(ty);
    attrs = mergeAttrs(attrs, parseAttributes());
    return { name, type: ty, attrs };
  }

  function replacePlaceholder(ty, ph, replacement) {
    if (ty === ph) return replacement;
    if (ty.kind === T.TK.PTR) {
      return T.cloneType(ty, { base: replacePlaceholder(ty.base, ph, replacement) });
    }
    if (ty.kind === T.TK.ARRAY) {
      const nb = replacePlaceholder(ty.base, ph, replacement);
      return T.arrayOf(nb, ty.len, ty.vlaExpr);
    }
    if (ty.kind === T.TK.FUNC) {
      return T.funcType(replacePlaceholder(ty.ret, ph, replacement), ty.params, ty.isVariadic, ty.hasProto);
    }
    return ty;
  }

  function parseTypeSuffix(ty) {
    if (matchP('(')) {
      const params = [];
      let isVariadic = false;
      let hasProto = true;
      if (matchP(')')) {
        hasProto = false;
      } else if (isKW('void') && peek(1).kind === 'PUNCT' && peek(1).text === ')') {
        next(); next();
      } else {
        while (!isP(')') && peek().kind !== 'EOF') {
          if (matchP('...')) { isVariadic = true; break; }
          const ds = parseDeclSpec();
          const d = parseDeclarator(ds.type, true);
          let pty = d.type;
          if (pty.kind === T.TK.ARRAY) pty = T.ptrTo(pty.base);
          else if (pty.kind === T.TK.FUNC) pty = T.ptrTo(pty);
          params.push({ name: d.name, type: pty });
          if (!matchP(',')) break;
        }
        expectP(')');
      }
      const ret = parseTypeSuffix(ty);
      return T.funcType(ret, params, isVariadic, hasProto);
    }
    if (matchP('[')) {
      // Optional qualifiers / static inside []
      while (matchKW('static') || matchKW('const') || matchKW('volatile') || matchKW('restrict')) {}
      let len = null;
      let vlaExpr = null;
      if (!isP(']')) {
        if (matchP('*')) {
          len = null;
        } else {
          const e = parseAssignExpr();
          if (isConstExpr(e)) {
            len = Number(evalConstExpr(e));
            if (len < 0) err('negative array size');
          } else {
            vlaExpr = e;
          }
        }
      }
      expectP(']');
      const elem = parseTypeSuffix(ty);
      return T.arrayOf(elem, len, vlaExpr);
    }
    return ty;
  }

  function parseTypeName() {
    const ds = parseDeclSpec();
    const d = parseDeclarator(ds.type, true);
    return d.type;
  }

  function parseStaticAssert() {
    const tok = peek();
    expectP('(');
    const expr = parseCondExpr();
    let msg = '';
    if (matchP(',')) {
      const s = next();
      msg = s.kind === 'STR' ? String.fromCharCode(...s.bytes) : '';
    }
    expectP(')');
    expectP(';');
    if (evalConstExpr(expr) === 0n) {
      err(`static assertion failed: ${msg}`, tok);
    }
  }

  // Parse initializer (scalar or brace-enclosed with designations)
  function parseInitializer() {
    if (matchP('{')) {
      const items = [];
      while (!isP('}') && peek().kind !== 'EOF') {
        const desigs = [];
        while (isP('.') || isP('[')) {
          if (matchP('.')) {
            const f = next();
            if (f.kind !== 'IDENT') err('expected field name in designator', f);
            desigs.push({ kind: 'field', name: f.text });
          } else if (matchP('[')) {
            const lo = Number(evalConstExpr(parseCondExpr()));
            let hi = lo;
            if (matchP('...')) hi = Number(evalConstExpr(parseCondExpr()));
            expectP(']');
            desigs.push({ kind: 'index', lo, hi });
          }
        }
        if (desigs.length > 0) matchP('=');
        const value = parseInitializer();
        items.push({ desigs, value });
        if (!matchP(',')) break;
      }
      expectP('}');
      return { kind: 'InitList', items };
    }
    return parseAssignExpr();
  }

  // Infer incomplete array length from initializer
  function completeArrayType(ty, init) {
    if (ty.kind !== T.TK.ARRAY || ty.len !== null || !init) return ty;
    if (init.kind === 'StrLit' && ty.base.kind === T.TK.CHAR) {
      return T.arrayOf(ty.base, init.bytes.length + 1);
    }
    if (init.kind === 'InitList') {
      let maxIdx = -1;
      let curIdx = 0;
      for (const it of init.items) {
        if (it.desigs.length > 0 && it.desigs[0].kind === 'index') {
          curIdx = it.desigs[0].hi;
        }
        if (curIdx > maxIdx) maxIdx = curIdx;
        curIdx++;
      }
      return T.arrayOf(ty.base, maxIdx + 1);
    }
    return ty;
  }

  // Lookup struct/union field (including flattening anonymous struct/union members)
  function findFieldPath(structTy, name) {
    if (!structTy || !structTy.fields) return null;
    for (const f of structTy.fields) {
      if (f.name === name) return [{ field: f, offset: f.offset }];
      if (f.anon && T.isAggregate(f.type)) {
        const sub = findFieldPath(f.type, name);
        if (sub) return [{ field: f, offset: f.offset }, ...sub];
      }
    }
    return null;
  }

  // Expressions
  function parseExpr() {
    let e = parseAssignExpr();
    while (matchP(',')) {
      const r = parseAssignExpr();
      e = { kind: 'Binary', op: ',', left: e, right: r, type: T.decayType(r.type) };
    }
    return e;
  }

  function parseAssignExpr() {
    const lhs = parseCondExpr();
    const ops = ['=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '^=', '|='];
    if (peek().kind === 'PUNCT' && ops.includes(peek().text)) {
      const op = next().text;
      const rhs = parseAssignExpr();
      return { kind: 'Assign', op, left: lhs, right: rhs, type: T.unqualType(lhs.type) };
    }
    return lhs;
  }

  function parseCondExpr() {
    let c = parseLogOrExpr();
    if (matchP('?')) {
      // GNU omitted middle operand: a ?: b
      const thenExpr = isP(':') ? null : parseExpr();
      expectP(':');
      const elseExpr = parseCondExpr();
      const t1 = T.decayType(thenExpr ? thenExpr.type : c.type);
      const t2 = T.decayType(elseExpr.type);
      let resTy;
      if (t1.kind === T.TK.VOID || t2.kind === T.TK.VOID) resTy = T.TY_VOID;
      else if (T.isArithmetic(t1) && T.isArithmetic(t2)) resTy = T.usualArithConv(t1, t2);
      else if (t1.kind === T.TK.PTR && t2.kind === T.TK.PTR) {
        resTy = (t1.base.kind === T.TK.VOID) ? t2 : t1;
      } else if (t1.kind === T.TK.PTR) resTy = t1;
      else if (t2.kind === T.TK.PTR) resTy = t2;
      else resTy = t1;
      return { kind: 'Ternary', cond: c, thenExpr, elseExpr, type: resTy };
    }
    return c;
  }

  function parseLogOrExpr() {
    let e = parseLogAndExpr();
    while (matchP('||')) {
      const r = parseLogAndExpr();
      e = { kind: 'Binary', op: '||', left: e, right: r, type: T.TY_INT };
    }
    return e;
  }
  function parseLogAndExpr() {
    let e = parseBitOrExpr();
    while (matchP('&&')) {
      const r = parseBitOrExpr();
      e = { kind: 'Binary', op: '&&', left: e, right: r, type: T.TY_INT };
    }
    return e;
  }
  function parseBitOrExpr() {
    let e = parseBitXorExpr();
    while (matchP('|')) {
      const r = parseBitXorExpr();
      e = { kind: 'Binary', op: '|', left: e, right: r, type: T.usualArithConv(e.type, r.type) };
    }
    return e;
  }
  function parseBitXorExpr() {
    let e = parseBitAndExpr();
    while (matchP('^')) {
      const r = parseBitAndExpr();
      e = { kind: 'Binary', op: '^', left: e, right: r, type: T.usualArithConv(e.type, r.type) };
    }
    return e;
  }
  function parseBitAndExpr() {
    let e = parseEqExpr();
    while (matchP('&')) {
      const r = parseEqExpr();
      e = { kind: 'Binary', op: '&', left: e, right: r, type: T.usualArithConv(e.type, r.type) };
    }
    return e;
  }
  function parseEqExpr() {
    let e = parseRelExpr();
    while (isP('==') || isP('!=')) {
      const op = next().text;
      const r = parseRelExpr();
      e = { kind: 'Binary', op, left: e, right: r, type: T.TY_INT };
    }
    return e;
  }
  function parseRelExpr() {
    let e = parseShiftExpr();
    while (isP('<') || isP('<=') || isP('>') || isP('>=')) {
      const op = next().text;
      const r = parseShiftExpr();
      e = { kind: 'Binary', op, left: e, right: r, type: T.TY_INT };
    }
    return e;
  }
  function parseShiftExpr() {
    let e = parseAddExpr();
    while (isP('<<') || isP('>>')) {
      const op = next().text;
      const r = parseAddExpr();
      e = { kind: 'Binary', op, left: e, right: r, type: T.integerPromote(e.type) };
    }
    return e;
  }
  function parseAddExpr() {
    let e = parseMulExpr();
    while (isP('+') || isP('-')) {
      const op = next().text;
      const r = parseMulExpr();
      const lt = T.decayType(e.type);
      const rt = T.decayType(r.type);
      let ty;
      if (op === '+' && lt.kind === T.TK.PTR) ty = lt;
      else if (op === '+' && rt.kind === T.TK.PTR) ty = rt;
      else if (op === '-' && lt.kind === T.TK.PTR && rt.kind === T.TK.PTR) ty = T.TY_LONG; // ptrdiff_t
      else if (op === '-' && lt.kind === T.TK.PTR) ty = lt;
      else ty = T.usualArithConv(lt, rt);
      e = { kind: 'Binary', op, left: e, right: r, type: ty };
    }
    return e;
  }
  function parseMulExpr() {
    let e = parseCastExpr();
    while (isP('*') || isP('/') || isP('%')) {
      const op = next().text;
      const r = parseCastExpr();
      e = { kind: 'Binary', op, left: e, right: r, type: T.usualArithConv(e.type, r.type) };
    }
    return e;
  }

  function parseCastExpr() {
    if (isP('(') && isTypeStart(peek(1))) {
      const savePos = pos;
      next(); // '('
      const ty = parseTypeName();
      expectP(')');
      if (isP('{')) {
        // Compound literal (C99/C11) -> rewind and let parsePrimary handle postfix
        pos = savePos;
        return parseUnaryExpr();
      }
      const expr = parseCastExpr();
      return { kind: 'Cast', type: T.unqualType(ty), expr };
    }
    return parseUnaryExpr();
  }

  function parseUnaryExpr() {
    if (matchKW('__extension__')) return parseCastExpr();
    if (matchP('++')) {
      const e = parseUnaryExpr();
      return { kind: 'PreIncDec', op: '++', expr: e, type: T.unqualType(e.type) };
    }
    if (matchP('--')) {
      const e = parseUnaryExpr();
      return { kind: 'PreIncDec', op: '--', expr: e, type: T.unqualType(e.type) };
    }
    if (matchP('&&')) {
      // GNU address-of-label: &&label
      const lbl = next();
      if (lbl.kind !== 'IDENT') err('expected label name after &&', lbl);
      return { kind: 'LabelAddr', label: lbl.text, type: T.ptrTo(T.TY_VOID) };
    }
    if (matchP('&')) {
      const e = parseCastExpr();
      return { kind: 'AddrOf', expr: e, type: T.ptrTo(e.type) };
    }
    if (matchP('*')) {
      const e = parseCastExpr();
      const dt = T.decayType(e.type);
      if (dt.kind !== T.TK.PTR) err('dereference of non-pointer');
      return { kind: 'Deref', expr: e, type: dt.base };
    }
    if (matchP('+')) {
      const e = parseCastExpr();
      return { kind: 'Unary', op: '+', expr: e, type: T.isInteger(e.type) ? T.integerPromote(e.type) : e.type };
    }
    if (matchP('-')) {
      const e = parseCastExpr();
      return { kind: 'Unary', op: '-', expr: e, type: T.isInteger(e.type) ? T.integerPromote(e.type) : e.type };
    }
    if (matchP('~')) {
      const e = parseCastExpr();
      return { kind: 'Unary', op: '~', expr: e, type: T.integerPromote(e.type) };
    }
    if (matchP('!')) {
      const e = parseCastExpr();
      return { kind: 'Unary', op: '!', expr: e, type: T.TY_INT };
    }
    if (matchKW('sizeof')) {
      if (isP('(') && isTypeStart(peek(1))) {
        next();
        const ty = parseTypeName();
        expectP(')');
        return { kind: 'SizeofType', targetType: ty, type: T.TY_ULONG };
      }
      const e = parseUnaryExpr();
      return { kind: 'SizeofExpr', expr: e, exprType: e.type, type: T.TY_ULONG };
    }
    if (matchKW('_Alignof') || matchKW('__alignof__') || matchKW('__alignof')) {
      expectP('(');
      let ty;
      if (isTypeStart()) ty = parseTypeName();
      else ty = parseExpr().type;
      expectP(')');
      return { kind: 'AlignofType', targetType: ty, type: T.TY_ULONG };
    }
    return parsePostfixExpr();
  }

  function parsePostfixExpr() {
    let e = parsePrimaryExpr();
    while (true) {
      if (matchP('[')) {
        const idx = parseExpr();
        expectP(']');
        const lt = T.decayType(e.type);
        const rt = T.decayType(idx.type);
        if (lt.kind === T.TK.PTR) {
          e = { kind: 'Deref', expr: { kind: 'Binary', op: '+', left: e, right: idx, type: lt }, type: lt.base };
        } else if (rt.kind === T.TK.PTR) {
          e = { kind: 'Deref', expr: { kind: 'Binary', op: '+', left: idx, right: e, type: rt }, type: rt.base };
        } else {
          err('subscripted value is neither array nor pointer');
        }
      } else if (matchP('(')) {
        const args = [];
        if (!isP(')')) {
          while (true) {
            args.push(parseAssignExpr());
            if (!matchP(',')) break;
          }
        }
        expectP(')');
        let ft = e.type;
        if (ft.kind === T.TK.PTR && ft.base.kind === T.TK.FUNC) ft = ft.base;
        const retTy = ft.kind === T.TK.FUNC ? ft.ret : T.TY_INT;
        e = { kind: 'Call', callee: e, funcType: ft, args, type: retTy };
      } else if (matchP('.') || matchP('->')) {
        const isArrow = tokens[pos - 1].text === '->';
        const fn = next();
        if (fn.kind !== 'IDENT') err('expected member name', fn);
        let st = isArrow ? T.decayType(e.type).base : e.type;
        if (!st || !T.isAggregate(st)) err(`member access '${fn.text}' on non-struct/union`, fn);
        const path = findFieldPath(st, fn.text);
        if (!path) err(`no member named '${fn.text}' in ${st.kind} ${st.tag}`, fn);
        const totalOff = path.reduce((s, p) => s + p.offset, 0);
        const leaf = path[path.length - 1].field;
        const memType = (st.isVolatile && !leaf.type.isVolatile)
          ? T.cloneType(leaf.type, { isVolatile: true })
          : leaf.type;
        e = {
          kind: 'Member',
          object: e,
          isArrow,
          field: leaf,
          offset: totalOff,
          type: memType
        };
      } else if (matchP('++')) {
        e = { kind: 'PostIncDec', op: '++', expr: e, type: T.unqualType(e.type) };
      } else if (matchP('--')) {
        e = { kind: 'PostIncDec', op: '--', expr: e, type: T.unqualType(e.type) };
      } else {
        break;
      }
    }
    return e;
  }

  function parsePrimaryExpr() {
    const tok = peek();
    if (tok.kind === 'INT') {
      next();
      return { kind: 'IntLit', value: tok.value, type: tok.type };
    }
    if (tok.kind === 'FLOAT') {
      next();
      return { kind: 'FloatLit', value: tok.value, type: tok.type };
    }
    if (tok.kind === 'STR') {
      next();
      return { kind: 'StrLit', bytes: tok.bytes, type: T.arrayOf(T.TY_SCHAR, tok.bytes.length + 1) };
    }
    if (matchKW('_Generic')) {
      expectP('(');
      const ctrl = parseAssignExpr();
      const ctrlTy = T.decayType(T.unqualType(ctrl.type));
      expectP(',');
      let matched = null;
      let defExpr = null;
      while (!isP(')') && peek().kind !== 'EOF') {
        if (matchKW('default')) {
          expectP(':');
          defExpr = parseAssignExpr();
        } else {
          const ty = parseTypeName();
          expectP(':');
          const ex = parseAssignExpr();
          if (!matched && T.typesCompatible(ctrlTy, ty)) matched = ex;
        }
        if (!matchP(',')) break;
      }
      expectP(')');
      const res = matched || defExpr;
      if (!res) err('_Generic: no matching association', tok);
      return res;
    }
    if (isP('(')) {
      next(); // '('
      // GNU statement expression: ({ ... })
      if (isP('{')) {
        const block = parseCompoundStmt();
        expectP(')');
        const last = block.stmts[block.stmts.length - 1];
        const ty = (last && last.kind === 'ExprStmt') ? last.expr.type : T.TY_VOID;
        return { kind: 'StmtExpr', block, type: ty };
      }
      // Compound literal: (type){ init }
      if (isTypeStart()) {
        const ty = parseTypeName();
        expectP(')');
        if (isP('{')) {
          const init = parseInitializer();
          const finalTy = completeArrayType(ty, init);
          return { kind: 'CompoundLit', type: finalTy, init };
        }
        err('expected compound literal initializer');
      }
      const e = parseExpr();
      expectP(')');
      return e;
    }
    if (tok.kind === 'IDENT') {
      next();
      const name = tok.text;
      // Builtins
      if (name === '__func__' || name === '__FUNCTION__' || name === '__PRETTY_FUNCTION__') {
        const fname = currentFunc ? currentFunc.name : '';
        const bytes = Array.from(fname, c => c.charCodeAt(0) & 0xFF);
        return { kind: 'StrLit', bytes, type: T.arrayOf(T.TY_SCHAR, bytes.length + 1) };
      }
      if (name === '__builtin_offsetof') {
        expectP('(');
        let st = parseTypeName();
        expectP(',');
        let off = 0;
        while (true) {
          const fn = next();
          if (fn.kind !== 'IDENT') err('expected field name in offsetof', fn);
          const path = findFieldPath(st, fn.text);
          if (!path) err(`no member '${fn.text}' in offsetof`, fn);
          off += path.reduce((s, p) => s + p.offset, 0);
          st = path[path.length - 1].field.type;
          while (matchP('[')) {
            const idx = Number(evalConstExpr(parseCondExpr()));
            expectP(']');
            off += idx * st.base.size;
            st = st.base;
          }
          if (!matchP('.')) break;
        }
        expectP(')');
        return { kind: 'Offsetof', offset: off, type: T.TY_ULONG };
      }
      if (name === '__builtin_expect') {
        expectP('(');
        const val = parseAssignExpr();
        expectP(',');
        parseAssignExpr(); // expected hint
        expectP(')');
        return { kind: 'Cast', type: T.TY_LONG, expr: val };
      }
      if (name === '__builtin_unreachable') {
        expectP('('); expectP(')');
        return { kind: 'BuiltinUnreachable', type: T.TY_VOID };
      }
      if (name === '__builtin_constant_p') {
        expectP('(');
        const arg = parseAssignExpr();
        expectP(')');
        return { kind: 'BuiltinConstP', arg, type: T.TY_INT };
      }
      if (/^__builtin_(clz|ctz|popcount|bswap)(16|32|64|l|ll)?$/.test(name)) {
        expectP('(');
        const arg = parseAssignExpr();
        expectP(')');
        let retTy = T.TY_INT;
        if (name === '__builtin_bswap16') retTy = T.TY_USHORT;
        else if (name === '__builtin_bswap32') retTy = T.TY_UINT;
        else if (name === '__builtin_bswap64') retTy = T.TY_ULLONG;
        return { kind: 'BuiltinBit', name, arg, type: retTy };
      }
      if (name.startsWith('__sync_') || name.startsWith('__atomic_')) {
        expectP('(');
        const args = [];
        if (!isP(')')) {
          while (true) {
            args.push(parseAssignExpr());
            if (!matchP(',')) break;
          }
        }
        expectP(')');
        let retTy = T.TY_INT;
        if (name === '__sync_synchronize' || name === '__sync_lock_release' ||
            name === '__atomic_store_n' || name === '__atomic_thread_fence') {
          retTy = T.TY_VOID;
        } else if (name === '__sync_bool_compare_and_swap' || name === '__atomic_compare_exchange_n') {
          retTy = T.TY_BOOL;
        } else if (args.length > 0 && args[0].type.kind === T.TK.PTR) {
          retTy = T.unqualType(args[0].type.base);
        }
        return { kind: 'BuiltinAtomic', name, args, type: retTy };
      }

      const v = lookupVar(name);
      if (v) {
        if (v.isEnum) return { kind: 'IntLit', value: v.value, type: T.TY_INT };
        return { kind: 'Var', name, symbol: v, type: v.type };
      }
      // Implicit function declaration fallback (only if followed by '(')
      if (isP('(')) {
        const ft = T.funcType(T.TY_INT, [], true, false);
        const sym = { name, type: ft, isGlobal: true, storage: 'extern' };
        return { kind: 'Var', name, symbol: sym, type: ft };
      }
      err(`undeclared identifier '${name}'`, tok);
    }
    err(`unexpected token '${tok.text || tok.kind}' in expression`, tok);
  }

  // Inline assembly: __asm__ [volatile] ( "tmpl" [: outs [: ins [: clobbers]]] );
  function parseAsmStmt() {
    next(); // __asm__ / asm
    let isVolatile = false;
    while (matchKW('volatile') || matchKW('__volatile__') || matchKW('__volatile') || matchKW('goto')) {
      isVolatile = true;
    }
    expectP('(');
    const tmplTok = next();
    if (tmplTok.kind !== 'STR') err('expected assembly template string', tmplTok);
    const template = String.fromCharCode(...tmplTok.bytes);
    const outputs = [];
    const inputs = [];
    const clobbers = [];
    if (matchP(':')) {
      // Outputs
      if (!isP(':') && !isP(')')) {
        while (true) {
          let symName = null;
          if (matchP('[')) { symName = next().text; expectP(']'); }
          const ct = next();
          const constraint = String.fromCharCode(...ct.bytes);
          expectP('(');
          const expr = parseExpr();
          expectP(')');
          outputs.push({ name: symName, constraint, expr });
          if (!matchP(',')) break;
        }
      }
      if (matchP(':')) {
        // Inputs
        if (!isP(':') && !isP(')')) {
          while (true) {
            let symName = null;
            if (matchP('[')) { symName = next().text; expectP(']'); }
            const ct = next();
            const constraint = String.fromCharCode(...ct.bytes);
            expectP('(');
            const expr = parseExpr();
            expectP(')');
            inputs.push({ name: symName, constraint, expr });
            if (!matchP(',')) break;
          }
        }
        if (matchP(':')) {
          // Clobbers
          if (!isP(')')) {
            while (true) {
              const ct = next();
              clobbers.push(String.fromCharCode(...ct.bytes));
              if (!matchP(',')) break;
            }
          }
        }
      }
    }
    expectP(')');
    expectP(';');
    return { kind: 'AsmStmt', isVolatile, template, outputs, inputs, clobbers };
  }

  // Statements
  function parseCompoundStmt(existingScope = false) {
    expectP('{');
    if (!existingScope) pushScope();
    const stmts = [];
    const localLabels = [];
    // GNU __label__ declarations at start of block
    while (matchKW('__label__')) {
      while (true) {
        const l = next();
        localLabels.push(l.text);
        if (!matchP(',')) break;
      }
      expectP(';');
    }
    while (!isP('}') && peek().kind !== 'EOF') {
      if (matchKW('_Static_assert')) {
        parseStaticAssert();
      } else if (isTypeStart() && !(peek().kind === 'IDENT' && peek(1).text === ':')) {
        const decls = parseLocalDecl();
        stmts.push(...decls);
      } else {
        stmts.push(parseStmt());
      }
    }
    expectP('}');
    if (!existingScope) popScope();
    return { kind: 'Block', stmts, localLabels };
  }

  function parseLocalDecl() {
    const ds = parseDeclSpec();
    const out = [];
    if (matchP(';')) return out;
    while (true) {
      const d = parseDeclarator(ds.type);
      const attrs = mergeAttrs(ds.attrs, d.attrs);
      let init = null;
      if (matchP('=')) init = parseInitializer();
      let ty = completeArrayType(d.type, init);
      if (ds.alignas && ds.alignas > ty.align) ty = T.cloneType(ty, { align: ds.alignas });
      if (attrs.aligned && typeof attrs.aligned === 'number' && attrs.aligned > ty.align) {
        ty = T.cloneType(ty, { align: attrs.aligned });
      }
      if (ds.storage === 'typedef') {
        curScope().typedefs.set(d.name, ty);
      } else if (ds.storage === 'extern' || ty.kind === T.TK.FUNC) {
        const sym = { name: d.name, type: ty, isGlobal: true, storage: 'extern', attrs };
        curScope().vars.set(d.name, sym);
      } else if (ds.storage === 'static') {
        const staticName = `${currentFunc ? currentFunc.name : 'g'}.${d.name}.${++anonId}`;
        const sym = { name: d.name, asmName: staticName, type: ty, isGlobal: true, storage: 'static', init, attrs };
        curScope().vars.set(d.name, sym);
        globalDecls.push({ kind: 'GlobalVar', symbol: sym });
      } else {
        const sym = {
          name: d.name,
          type: ty,
          isGlobal: false,
          isLocal: true,
          isVla: !!ty.isVla,
          offset: 0,
          attrs
        };
        curScope().vars.set(d.name, sym);
        if (currentFunc) currentFunc.locals.push(sym);
        out.push({ kind: 'LocalDecl', symbol: sym, init });
      }
      if (!matchP(',')) break;
    }
    expectP(';');
    return out;
  }

  function parseStmt() {
    if (isP('{')) return parseCompoundStmt();
    if (matchP(';')) return { kind: 'EmptyStmt' };
    if (isKW('__asm__') || isKW('__asm') || isKW('asm')) return parseAsmStmt();

    if (matchKW('if')) {
      expectP('(');
      const cond = parseExpr();
      expectP(')');
      const thenStmt = parseStmt();
      let elseStmt = null;
      if (matchKW('else')) elseStmt = parseStmt();
      return { kind: 'IfStmt', cond, thenStmt, elseStmt };
    }
    if (matchKW('while')) {
      expectP('(');
      const cond = parseExpr();
      expectP(')');
      const body = parseStmt();
      return { kind: 'WhileStmt', cond, body };
    }
    if (matchKW('do')) {
      const body = parseStmt();
      if (!matchKW('while')) err("expected 'while' after 'do' body");
      expectP('(');
      const cond = parseExpr();
      expectP(')');
      expectP(';');
      return { kind: 'DoWhileStmt', body, cond };
    }
    if (matchKW('for')) {
      expectP('(');
      pushScope();
      let init = null;
      if (!isP(';')) {
        if (isTypeStart()) {
          init = { kind: 'ForDecls', decls: parseLocalDecl() };
        } else {
          init = parseExpr();
          expectP(';');
        }
      } else {
        next(); // ';'
      }
      let cond = null;
      if (!isP(';')) cond = parseExpr();
      expectP(';');
      let step = null;
      if (!isP(')')) step = parseExpr();
      expectP(')');
      const body = parseStmt();
      popScope();
      return { kind: 'ForStmt', init, cond, step, body };
    }
    if (matchKW('switch')) {
      expectP('(');
      const cond = parseExpr();
      expectP(')');
      const body = parseStmt();
      return { kind: 'SwitchStmt', cond, body };
    }
    if (matchKW('case')) {
      const lo = evalConstExpr(parseCondExpr());
      let hi = lo;
      if (matchP('...')) hi = evalConstExpr(parseCondExpr());
      expectP(':');
      const stmt = parseStmt();
      return { kind: 'CaseStmt', lo, hi, stmt };
    }
    if (matchKW('default')) {
      expectP(':');
      const stmt = parseStmt();
      return { kind: 'DefaultStmt', stmt };
    }
    if (matchKW('break')) { expectP(';'); return { kind: 'BreakStmt' }; }
    if (matchKW('continue')) { expectP(';'); return { kind: 'ContinueStmt' }; }
    if (matchKW('return')) {
      let expr = null;
      if (!isP(';')) expr = parseExpr();
      expectP(';');
      return { kind: 'ReturnStmt', expr };
    }
    if (matchKW('goto')) {
      if (matchP('*')) {
        const expr = parseExpr();
        expectP(';');
        return { kind: 'ComputedGotoStmt', expr };
      }
      const lbl = next();
      if (lbl.kind !== 'IDENT') err('expected label after goto', lbl);
      expectP(';');
      return { kind: 'GotoStmt', label: lbl.text };
    }
    // Label: ident ':' stmt
    if (peek().kind === 'IDENT' && peek(1).kind === 'PUNCT' && peek(1).text === ':') {
      const lbl = next().text;
      next(); // ':'
      const stmt = isP('}') ? { kind: 'EmptyStmt' } : parseStmt();
      return { kind: 'LabelStmt', label: lbl, stmt };
    }
    const expr = parseExpr();
    expectP(';');
    return { kind: 'ExprStmt', expr };
  }

  // Top-level translation unit
  pushScope();
  const globalDecls = [];

  while (peek().kind !== 'EOF') {
    if (matchP(';')) continue;
    if (matchKW('_Static_assert')) { parseStaticAssert(); continue; }
    if (isKW('__asm__') || isKW('__asm') || isKW('asm')) {
      globalDecls.push(parseAsmStmt());
      continue;
    }

    const ds = parseDeclSpec();
    if (matchP(';')) continue;

    while (true) {
      const d = parseDeclarator(ds.type);
      const attrs = mergeAttrs(ds.attrs, d.attrs);

      // Function definition
      if (d.type.kind === T.TK.FUNC && isP('{')) {
        const fnSym = {
          name: d.name,
          asmName: d.name,
          type: d.type,
          isGlobal: true,
          storage: ds.storage,
          isInline: ds.isInline,
          isNoreturn: ds.isNoreturn,
          attrs
        };
        curScope().vars.set(d.name, fnSym);
        pushScope();
        const paramSyms = [];
        for (let pi = 0; pi < d.type.params.length; pi++) {
          const p = d.type.params[pi];
          const ps = {
            name: p.name || `__arg${pi}`,
            type: p.type,
            isGlobal: false,
            isLocal: true,
            isParam: true,
            paramIdx: pi,
            offset: 0
          };
          if (p.name) curScope().vars.set(p.name, ps);
          paramSyms.push(ps);
        }
        const fnNode = {
          kind: 'FuncDef',
          name: d.name,
          symbol: fnSym,
          type: d.type,
          params: paramSyms,
          locals: [],
          body: null,
          attrs
        };
        const prevFn = currentFunc;
        currentFunc = fnNode;
        fnNode.body = parseCompoundStmt(true);
        currentFunc = prevFn;
        popScope();
        globalDecls.push(fnNode);
        break;
      }

      let init = null;
      if (matchP('=')) init = parseInitializer();
      let ty = completeArrayType(d.type, init);
      if (ds.alignas && ds.alignas > ty.align) ty = T.cloneType(ty, { align: ds.alignas });
      if (attrs.aligned && typeof attrs.aligned === 'number' && attrs.aligned > ty.align) {
        ty = T.cloneType(ty, { align: attrs.aligned });
      }

      if (ds.storage === 'typedef') {
        curScope().typedefs.set(d.name, ty);
      } else {
        const prev = curScope().vars.get(d.name);
        const sym = {
          name: d.name,
          asmName: d.name,
          type: ty,
          isGlobal: true,
          storage: ds.storage,
          init,
          attrs: prev ? mergeAttrs(prev.attrs || {}, attrs) : attrs
        };
        curScope().vars.set(d.name, sym);
        if (ty.kind !== T.TK.FUNC && ds.storage !== 'extern') {
          globalDecls.push({ kind: 'GlobalVar', symbol: sym });
        }
      }
      if (!matchP(',')) { expectP(';'); break; }
    }
  }

  return { kind: 'TranslationUnit', decls: globalDecls, evalConstExpr };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { tokenize, parseProgram };
}
