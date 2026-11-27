'use strict';

/**
 * ISO C11 Preprocessor (`tcc5/preproc.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Implements line splicing, comment removal, #define (object, function-like,
 * variadic), #undef, #include, #if/#elif/#else/#endif, #ifdef/#ifndef,
 * defined(), #line, #error, #pragma, stringizing (#), token pasting (##),
 * and standard/target predefined macros.
 */

const { BUILTIN_HEADERS } = (typeof require !== 'undefined') ? require('./headers') : globalThis.TCC5_HEADERS;

function isIdentStart(c) {
  const code = c.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || code === 36;
}
function isIdentPart(c) {
  const code = c.charCodeAt(0);
  return isIdentStart(c) || (code >= 48 && code <= 57);
}

// Phase 1-2: normalize CRLF, splice backslash-newline, strip comments while preserving line count
function stripCommentsAndSplice(src) {
  // Normalize CRLF -> LF
  let s = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Line splicing: backslash followed by newline -> removed (emit newline later or keep line numbers via markers)
  // To preserve accurate line numbers, we splice and track skipped newlines
  let out = '';
  let i = 0;
  const n = s.length;
  let pendingNewlines = 0;
  let inStr = 0; // 0, 34("), 39(')
  while (i < n) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '\n') {
      pendingNewlines++;
      i += 2;
      continue;
    }
    if (inStr) {
      out += c;
      if (c === '\\' && i + 1 < n) {
        out += s[++i];
      } else if (c.charCodeAt(0) === inStr) {
        inStr = 0;
      }
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c.charCodeAt(0);
      out += c;
      i++;
      continue;
    }
    if (c === '/' && s[i + 1] === '/') {
      i += 2;
      while (i < n && s[i] !== '\n') {
        if (s[i] === '\\' && s[i + 1] === '\n') { pendingNewlines++; i += 2; }
        else i++;
      }
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      i += 2;
      out += ' ';
      while (i < n && !(s[i] === '*' && s[i + 1] === '/')) {
        if (s[i] === '\n') out += '\n';
        i++;
      }
      if (i < n) i += 2;
      continue;
    }
    if (c === '\n') {
      out += '\n';
      while (pendingNewlines > 0) { out += '\n'; pendingNewlines--; }
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// Tokenize a single preprocessor expression/line into PP tokens
function ppTokenize(line) {
  const toks = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    const c = line[i];
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    const hadSpace = i > 0 && (line[i - 1] === ' ' || line[i - 1] === '\t');
    // String or char literal (including L"", u8"", u"", U"")
    if ((c === '"' || c === "'") ||
        ((c === 'L' || c === 'u' || c === 'U') && (line[i + 1] === '"' || line[i + 1] === "'")) ||
        (c === 'u' && line[i + 1] === '8' && line[i + 2] === '"')) {
      let start = i;
      if (c === 'u' && line[i + 1] === '8') i += 2;
      else if (c !== '"' && c !== "'") i++;
      const q = line[i++];
      while (i < n && line[i] !== q) {
        if (line[i] === '\\' && i + 1 < n) i += 2;
        else i++;
      }
      if (i < n) i++;
      toks.push({ kind: q === '"' ? 'STR' : 'CHAR', text: line.slice(start, i), space: hadSpace });
      continue;
    }
    if (isIdentStart(c)) {
      let start = i++;
      while (i < n && isIdentPart(line[i])) i++;
      toks.push({ kind: 'IDENT', text: line.slice(start, i), space: hadSpace });
      continue;
    }
    if ((c >= '0' && c <= '9') || (c === '.' && line[i + 1] >= '0' && line[i + 1] <= '9')) {
      let start = i++;
      while (i < n) {
        const ch = line[i];
        if ((ch === 'e' || ch === 'E' || ch === 'p' || ch === 'P') && (line[i + 1] === '+' || line[i + 1] === '-')) {
          i += 2;
        } else if (isIdentPart(ch) || ch === '.') {
          i++;
        } else break;
      }
      toks.push({ kind: 'NUM', text: line.slice(start, i), space: hadSpace });
      continue;
    }
    // Multi-char punctuators
    const three = line.slice(i, i + 3);
    if (three === '...' || three === '<<=' || three === '>>=') {
      toks.push({ kind: 'PUNCT', text: three, space: hadSpace });
      i += 3;
      continue;
    }
    const two = line.slice(i, i + 2);
    if (['##', '&&', '||', '==', '!=', '<=', '>=', '<<', '>>', '->', '++', '--',
         '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^='].includes(two)) {
      toks.push({ kind: 'PUNCT', text: two, space: hadSpace });
      i += 2;
      continue;
    }
    toks.push({ kind: 'PUNCT', text: c, space: hadSpace });
    i++;
  }
  return toks;
}

function tokensToString(toks) {
  let out = '';
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (i > 0) {
      if (t.space) {
        out += ' ';
      } else {
        // Prevent accidental token merging
        const prev = toks[i - 1].text;
        const cur = t.text;
        const pc = prev[prev.length - 1];
        const cc = cur[0];
        if ((isIdentPart(pc) && isIdentPart(cc)) ||
            (pc === cc && '+-&|=<>#/'.includes(pc)) ||
            (pc === '.' && cc === '.')) {
          out += ' ';
        }
      }
    }
    out += t.text;
  }
  return out;
}

function stringizeTokens(toks) {
  let s = '';
  for (let i = 0; i < toks.length; i++) {
    if (i > 0 && toks[i].space) s += ' ';
    const t = toks[i];
    if (t.kind === 'STR' || t.kind === 'CHAR') {
      s += t.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    } else {
      s += t.text;
    }
  }
  return '"' + s + '"';
}

function parsePPCharLit(text) {
  let s = text;
  if (s[0] === 'L' || s[0] === 'u' || s[0] === 'U') s = s.slice(1);
  s = s.slice(1, -1);
  if (s[0] !== '\\') return BigInt(s.charCodeAt(0));
  const c = s[1];
  if (c === 'n') return 10n;
  if (c === 'r') return 13n;
  if (c === 't') return 9n;
  if (c === '0') return 0n;
  if (c === '\\') return 92n;
  if (c === "'") return 39n;
  if (c === '"') return 34n;
  if (c === 'x') return BigInt(parseInt(s.slice(2), 16));
  if (c >= '0' && c <= '7') return BigInt(parseInt(s.slice(1), 8));
  return BigInt(c.charCodeAt(0));
}

function parsePPIntLit(text) {
  let s = text.replace(/[uUlL]+$/, '');
  if (/^0[xX]/.test(s)) return BigInt(s);
  if (/^0[bB]/.test(s)) return BigInt(s);
  if (/^0[0-7]+$/.test(s)) return BigInt('0o' + s.slice(1));
  return BigInt(s);
}

// Evaluate #if constant expression on already-expanded tokens
function evalIfExpr(toks, filename, lineNo) {
  let pos = 0;
  function peek() { return toks[pos] || null; }
  function next() { return toks[pos++] || null; }
  function match(t) { if (peek() && peek().text === t) { pos++; return true; } return false; }

  function parseTernary() {
    let c = parseLogOr();
    if (match('?')) {
      const a = parseTernary();
      if (!match(':')) throw new Error(`${filename}:${lineNo}: expected ':' in #if`);
      const b = parseTernary();
      return c !== 0n ? a : b;
    }
    return c;
  }
  function parseLogOr() {
    let v = parseLogAnd();
    while (match('||')) { const r = parseLogAnd(); v = (v !== 0n || r !== 0n) ? 1n : 0n; }
    return v;
  }
  function parseLogAnd() {
    let v = parseBitOr();
    while (match('&&')) { const r = parseBitOr(); v = (v !== 0n && r !== 0n) ? 1n : 0n; }
    return v;
  }
  function parseBitOr() {
    let v = parseBitXor();
    while (match('|')) v = v | parseBitXor();
    return v;
  }
  function parseBitXor() {
    let v = parseBitAnd();
    while (match('^')) v = v ^ parseBitAnd();
    return v;
  }
  function parseBitAnd() {
    let v = parseEq();
    while (match('&')) v = v & parseEq();
    return v;
  }
  function parseEq() {
    let v = parseRel();
    while (true) {
      if (match('==')) v = (v === parseRel()) ? 1n : 0n;
      else if (match('!=')) v = (v !== parseRel()) ? 1n : 0n;
      else break;
    }
    return v;
  }
  function parseRel() {
    let v = parseShift();
    while (true) {
      if (match('<=')) v = (v <= parseShift()) ? 1n : 0n;
      else if (match('>=')) v = (v >= parseShift()) ? 1n : 0n;
      else if (match('<')) v = (v < parseShift()) ? 1n : 0n;
      else if (match('>')) v = (v > parseShift()) ? 1n : 0n;
      else break;
    }
    return v;
  }
  function parseShift() {
    let v = parseAdd();
    while (true) {
      if (match('<<')) v = v << parseAdd();
      else if (match('>>')) v = v >> parseAdd();
      else break;
    }
    return v;
  }
  function parseAdd() {
    let v = parseMul();
    while (true) {
      if (match('+')) v = v + parseMul();
      else if (match('-')) v = v - parseMul();
      else break;
    }
    return v;
  }
  function parseMul() {
    let v = parseUnary();
    while (true) {
      if (match('*')) v = v * parseUnary();
      else if (match('/')) {
        const r = parseUnary();
        if (r === 0n) throw new Error(`${filename}:${lineNo}: division by zero in #if`);
        v = v / r;
      } else if (match('%')) {
        const r = parseUnary();
        if (r === 0n) throw new Error(`${filename}:${lineNo}: modulo by zero in #if`);
        v = v % r;
      } else break;
    }
    return v;
  }
  function parseUnary() {
    if (match('+')) return parseUnary();
    if (match('-')) return -parseUnary();
    if (match('!')) return parseUnary() === 0n ? 1n : 0n;
    if (match('~')) return ~parseUnary();
    return parsePrimary();
  }
  function parsePrimary() {
    if (match('(')) {
      const v = parseTernary();
      if (!match(')')) throw new Error(`${filename}:${lineNo}: missing ')' in #if`);
      return v;
    }
    const t = next();
    if (!t) return 0n;
    if (t.kind === 'NUM') return parsePPIntLit(t.text);
    if (t.kind === 'CHAR') return parsePPCharLit(t.text);
    if (t.kind === 'IDENT') return 0n; // C11 6.10.1p4: remaining identifiers evaluate to 0
    throw new Error(`${filename}:${lineNo}: unexpected token '${t.text}' in #if`);
  }

  return parseTernary() !== 0n;
}

function preprocess(source, options = {}) {
  const filename = options.filename || '<stdin>';
  const includePaths = options.includePaths || [];
  const virtualFiles = options.virtualFiles || {};
  const fsMod = (typeof require !== 'undefined') ? require('fs') : null;
  const pathMod = (typeof require !== 'undefined') ? require('path') : null;

  const macros = new Map();
  // Predefined macros
  const predef = {
    '__STDC__': '1',
    '__STDC_VERSION__': '201112L',
    '__STDC_HOSTED__': '0',
    '__TRITON5__': '1',
    '__TCC5__': '1',
    '__CHAR_BIT__': '8',
    '__BYTE_ORDER__': '1234',
    '__ORDER_LITTLE_ENDIAN__': '1234',
    '__ORDER_BIG_ENDIAN__': '4321',
    '__SIZEOF_CHAR__': '1',
    '__SIZEOF_SHORT__': '2',
    '__SIZEOF_INT__': '4',
    '__SIZEOF_LONG__': '4',
    '__SIZEOF_LONG_LONG__': '8',
    '__SIZEOF_POINTER__': '4',
    '__SIZEOF_FLOAT__': '4',
    '__SIZEOF_DOUBLE__': '8',
    '__SIZEOF_SIZE_T__': '4',
    '__SIZEOF_PTRDIFF_T__': '4',
    '__GNUC__': '4',
    '__GNUC_MINOR__': '2',
    '__DATE__': '"Nov 27 2026"',
    '__TIME__': '"00:00:00"'
  };
  if (options.defines) {
    for (const [k, v] of Object.entries(options.defines)) predef[k] = String(v);
  }
  for (const [k, v] of Object.entries(predef)) {
    macros.set(k, { isFunc: false, params: null, variadic: false, body: ppTokenize(v) });
  }

  let counterVal = 0;

  function expandTokens(toks, ctx, hideSet = new Set()) {
    const out = [];
    let i = 0;
    while (i < toks.length) {
      const t = toks[i];
      if (t.kind === 'IDENT' && !hideSet.has(t.text)) {
        if (t.text === '__LINE__') {
          out.push({ kind: 'NUM', text: String(ctx.line), space: t.space });
          i++; continue;
        }
        if (t.text === '__FILE__') {
          out.push({ kind: 'STR', text: JSON.stringify(ctx.file), space: t.space });
          i++; continue;
        }
        if (t.text === '__COUNTER__') {
          out.push({ kind: 'NUM', text: String(counterVal++), space: t.space });
          i++; continue;
        }
        const m = macros.get(t.text);
        if (m) {
          if (!m.isFunc) {
            const nextHide = new Set(hideSet);
            nextHide.add(t.text);
            const sub = m.body.map((bt, idx) => ({ ...bt, space: idx === 0 ? t.space : bt.space }));
            const pasted = applyTokenPasting(sub);
            const exp = expandTokens(pasted, ctx, nextHide);
            out.push(...exp);
            i++;
            continue;
          }
          // Function-like macro: must be followed by '('
          if (i + 1 < toks.length && toks[i + 1].text === '(') {
            const callStartSpace = t.space;
            i += 2; // skip name and '('
            const rawArgs = [];
            let curArg = [];
            let depth = 1;
            while (i < toks.length && depth > 0) {
              const ct = toks[i++];
              if (ct.text === '(') { depth++; curArg.push(ct); }
              else if (ct.text === ')') {
                depth--;
                if (depth > 0) curArg.push(ct);
              } else if (ct.text === ',' && depth === 1) {
                rawArgs.push(curArg);
                curArg = [];
              } else {
                curArg.push(ct);
              }
            }
            if (rawArgs.length > 0 || curArg.length > 0 || m.params.length > 0 || m.variadic) {
              rawArgs.push(curArg);
            }
            // Bind params
            const paramMap = new Map();
            const expParamMap = new Map();
            for (let pi = 0; pi < m.params.length; pi++) {
              const raw = rawArgs[pi] || [];
              paramMap.set(m.params[pi], raw);
              expParamMap.set(m.params[pi], expandTokens(raw, ctx, hideSet));
            }
            if (m.variadic) {
              const vargs = [];
              for (let vi = m.params.length; vi < rawArgs.length; vi++) {
                if (vi > m.params.length) vargs.push({ kind: 'PUNCT', text: ',', space: false });
                vargs.push(...rawArgs[vi]);
              }
              paramMap.set('__VA_ARGS__', vargs);
              expParamMap.set('__VA_ARGS__', expandTokens(vargs, ctx, hideSet));
            }
            // Substitute into body (handling # and ##)
            const subst = [];
            const body = m.body;
            for (let bi = 0; bi < body.length; bi++) {
              const bt = body[bi];
              // GNU extension: , ## __VA_ARGS__ drops comma if __VA_ARGS__ is empty
              if (bt.text === ',' && bi + 2 < body.length && body[bi + 1].text === '##' &&
                  body[bi + 2].text === '__VA_ARGS__' && m.variadic) {
                const va = paramMap.get('__VA_ARGS__') || [];
                if (va.length === 0) {
                  bi += 2;
                  continue;
                }
              }
              if (bt.text === '#' && bi + 1 < body.length && paramMap.has(body[bi + 1].text)) {
                const raw = paramMap.get(body[bi + 1].text);
                subst.push({ kind: 'STR', text: stringizeTokens(raw), space: bt.space });
                bi++;
                continue;
              }
              const prevIsPaste = bi > 0 && body[bi - 1].text === '##';
              const nextIsPaste = bi + 1 < body.length && body[bi + 1].text === '##';
              if (bt.kind === 'IDENT' && paramMap.has(bt.text)) {
                const rep = (prevIsPaste || nextIsPaste) ? paramMap.get(bt.text) : expParamMap.get(bt.text);
                for (let ri = 0; ri < rep.length; ri++) {
                  subst.push({ ...rep[ri], space: ri === 0 ? bt.space : rep[ri].space });
                }
                continue;
              }
              subst.push({ ...bt });
            }
            const pasted = applyTokenPasting(subst);
            if (pasted.length > 0) pasted[0] = { ...pasted[0], space: callStartSpace };
            const nextHide = new Set(hideSet);
            nextHide.add(t.text);
            const exp = expandTokens(pasted, ctx, nextHide);
            out.push(...exp);
            continue;
          }
        }
      }
      out.push(t);
      i++;
    }
    return out;
  }

  function applyTokenPasting(toks) {
    const out = [];
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].text === '##' && out.length > 0 && i + 1 < toks.length) {
        const lhs = out.pop();
        const rhs = toks[++i];
        const joined = lhs.text + rhs.text;
        const reToks = ppTokenize(joined);
        if (reToks.length > 0) {
          reToks[0].space = lhs.space;
          out.push(...reToks);
        }
      } else if (toks[i].text === '##') {
        // Ignore dangling ## (e.g. empty arg paste)
      } else {
        out.push(toks[i]);
      }
    }
    return out;
  }

  function expandIfTokens(toks, ctx) {
    // Resolve defined(X) / defined X before macro expansion
    const pre = [];
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].kind === 'IDENT' && toks[i].text === 'defined') {
        let name = null;
        if (i + 1 < toks.length && toks[i + 1].text === '(' && i + 3 < toks.length && toks[i + 3].text === ')') {
          name = toks[i + 2].text;
          i += 3;
        } else if (i + 1 < toks.length && toks[i + 1].kind === 'IDENT') {
          name = toks[i + 1].text;
          i += 1;
        }
        pre.push({ kind: 'NUM', text: (name && macros.has(name)) ? '1' : '0', space: toks[i].space });
      } else {
        pre.push(toks[i]);
      }
    }
    return expandTokens(pre, ctx);
  }

  function resolveInclude(incName, isAngle, curFile) {
    if (Object.prototype.hasOwnProperty.call(virtualFiles, incName)) {
      return { name: incName, content: virtualFiles[incName] };
    }
    if (isAngle && Object.prototype.hasOwnProperty.call(BUILTIN_HEADERS, incName)) {
      return { name: `<${incName}>`, content: BUILTIN_HEADERS[incName] };
    }
    if (fsMod && pathMod) {
      const candidates = [];
      if (!isAngle && curFile && !curFile.startsWith('<')) {
        candidates.push(pathMod.resolve(pathMod.dirname(curFile), incName));
      }
      for (const dir of includePaths) {
        candidates.push(pathMod.resolve(dir, incName));
      }
      for (const c of candidates) {
        if (fsMod.existsSync(c) && fsMod.statSync(c).isFile()) {
          return { name: c, content: fsMod.readFileSync(c, 'utf8') };
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(BUILTIN_HEADERS, incName)) {
      return { name: `<${incName}>`, content: BUILTIN_HEADERS[incName] };
    }
    return null;
  }

  const outLines = [];

  function processFile(src, curFile, depth = 0) {
    if (depth > 64) throw new Error(`${curFile}: #include recursion depth exceeded`);
    const cleaned = stripCommentsAndSplice(src);
    const lines = cleaned.split('\n');
    const condStack = []; // { active, parentActive, seenTrue, seenElse }
    let logicalFile = curFile;
    let lineOffset = 0;

    function isActive() {
      return condStack.length === 0 || condStack[condStack.length - 1].active;
    }

    outLines.push(`#line 1 ${JSON.stringify(logicalFile)}`);

    for (let idx = 0; idx < lines.length; idx++) {
      const lineNo = idx + 1 + lineOffset;
      const raw = lines[idx];
      const trimmed = raw.trim();

      if (trimmed.startsWith('#')) {
        const m = /^#\s*([A-Za-z_]*)\s*(.*)$/.exec(trimmed);
        const dir = m ? m[1] : '';
        const rest = m ? m[2].trim() : '';
        const ctx = { file: logicalFile, line: lineNo };

        if (dir === 'if' || dir === 'ifdef' || dir === 'ifndef') {
          const parentActive = isActive();
          let cond = false;
          if (parentActive) {
            if (dir === 'ifdef') {
              const name = rest.split(/\s+/)[0];
              cond = macros.has(name);
            } else if (dir === 'ifndef') {
              const name = rest.split(/\s+/)[0];
              cond = !macros.has(name);
            } else {
              const exp = expandIfTokens(ppTokenize(rest), ctx);
              cond = evalIfExpr(exp, logicalFile, lineNo);
            }
          }
          condStack.push({ active: parentActive && cond, parentActive, seenTrue: cond, seenElse: false });
          outLines.push('');
          continue;
        }
        if (dir === 'elif') {
          if (condStack.length === 0) throw new Error(`${logicalFile}:${lineNo}: #elif without #if`);
          const top = condStack[condStack.length - 1];
          if (top.seenElse) throw new Error(`${logicalFile}:${lineNo}: #elif after #else`);
          if (top.parentActive && !top.seenTrue) {
            const exp = expandIfTokens(ppTokenize(rest), ctx);
            const cond = evalIfExpr(exp, logicalFile, lineNo);
            top.active = cond;
            if (cond) top.seenTrue = true;
          } else {
            top.active = false;
          }
          outLines.push('');
          continue;
        }
        if (dir === 'else') {
          if (condStack.length === 0) throw new Error(`${logicalFile}:${lineNo}: #else without #if`);
          const top = condStack[condStack.length - 1];
          if (top.seenElse) throw new Error(`${logicalFile}:${lineNo}: duplicate #else`);
          top.seenElse = true;
          top.active = top.parentActive && !top.seenTrue;
          outLines.push('');
          continue;
        }
        if (dir === 'endif') {
          if (condStack.length === 0) throw new Error(`${logicalFile}:${lineNo}: #endif without #if`);
          condStack.pop();
          outLines.push('');
          continue;
        }

        if (!isActive()) {
          outLines.push('');
          continue;
        }

        if (dir === '') {
          outLines.push('');
          continue;
        }
        if (dir === 'define') {
          const dm = /^([A-Za-z_][A-Za-z0-9_]*)(\(([^)]*)\))?\s*(.*)$/.exec(rest);
          if (!dm) throw new Error(`${logicalFile}:${lineNo}: invalid #define '${rest}'`);
          const name = dm[1];
          const isFunc = dm[2] !== undefined;
          let params = null;
          let variadic = false;
          if (isFunc) {
            params = [];
            const pstr = dm[3].trim();
            if (pstr.length > 0) {
              for (const p of pstr.split(',')) {
                const pt = p.trim();
                if (pt === '...') variadic = true;
                else if (pt.endsWith('...')) { variadic = true; params.push(pt.slice(0, -3).trim()); }
                else params.push(pt);
              }
            }
          }
          const body = ppTokenize(dm[4] || '');
          macros.set(name, { isFunc, params, variadic, body });
          outLines.push('');
          continue;
        }
        if (dir === 'undef') {
          const name = rest.split(/\s+/)[0];
          macros.delete(name);
          outLines.push('');
          continue;
        }
        if (dir === 'include') {
          let incRest = rest;
          if (!incRest.startsWith('<') && !incRest.startsWith('"')) {
            incRest = tokensToString(expandTokens(ppTokenize(incRest), ctx)).trim();
          }
          const im = /^([<"])([^>"]+)[>"]/.exec(incRest);
          if (!im) throw new Error(`${logicalFile}:${lineNo}: invalid #include '${rest}'`);
          const inc = resolveInclude(im[2], im[1] === '<', logicalFile);
          if (!inc) throw new Error(`${logicalFile}:${lineNo}: header '${im[2]}' not found`);
          processFile(inc.content, inc.name, depth + 1);
          outLines.push(`#line ${lineNo + 1} ${JSON.stringify(logicalFile)}`);
          continue;
        }
        if (dir === 'line') {
          const exp = tokensToString(expandTokens(ppTokenize(rest), ctx)).trim();
          const lm = /^(\d+)(?:\s+"([^"]*)")?/.exec(exp);
          if (!lm) throw new Error(`${logicalFile}:${lineNo}: invalid #line '${rest}'`);
          const newLine = parseInt(lm[1], 10);
          lineOffset = newLine - (idx + 2);
          if (lm[2] !== undefined) logicalFile = lm[2];
          outLines.push(`#line ${newLine} ${JSON.stringify(logicalFile)}`);
          continue;
        }
        if (dir === 'error') {
          throw new Error(`${logicalFile}:${lineNo}: #error ${rest}`);
        }
        if (dir === 'warning' || dir === 'pragma') {
          outLines.push('');
          continue;
        }
        throw new Error(`${logicalFile}:${lineNo}: unknown directive #${dir}`);
      }

      if (!isActive()) {
        outLines.push('');
        continue;
      }

      if (!trimmed) {
        outLines.push('');
        continue;
      }

      const toks = ppTokenize(raw);
      const exp = expandTokens(toks, { file: logicalFile, line: lineNo });
      outLines.push(tokensToString(exp));
    }

    if (condStack.length > 0) {
      throw new Error(`${logicalFile}: unterminated #if directive`);
    }
  }

  processFile(source, filename, 0);
  return outLines.join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { preprocess };
}
