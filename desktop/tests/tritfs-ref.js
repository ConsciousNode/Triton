// tritfs-ref.js: TritFS v2 reference model (Kehai Interim, 2026-11-17). MIT.
// TEST ORACLE ONLY. The guest and the host emulator must never call this.
// Format: TRITFS-V2.md. Units are sparse: Map<sector, Int16Array(729)>.
'use strict';

const SECTOR = 729, PER_SLT = 243, ENTRY = 27, PER_DIRSEC = 27;
const T_DATA = 1, T_IMAGE = 2, T_ASM = 3, T_EXEC = 4, T_DIR = 5;
const L_FREE = 0, L_END = -1, L_BAD = -2, L_RES = -3;
const MAGIC = 'TFS2', VERSION = 2;
const TMOD = 19683, THALF = 9841;

// ---- balanced tryte / word helpers ----
function balTryte(n) { let r = ((n % TMOD) + TMOD) % TMOD; return r > THALF ? r - TMOD : r; }
function wordToTrytes(v) {
  if (!Number.isSafeInteger(v)) throw new Error('word not integer');
  const t = [];
  for (let i = 0; i < 3; i++) { const d = balTryte(v); t.push(d); v = (v - d) / TMOD; }
  if (v !== 0) throw new Error('word out of 27-trit range');
  return t;
}
function trytesToWord(a, i) { return a[i] + a[i + 1] * TMOD + a[i + 2] * TMOD * TMOD; }

// ---- sparse unit ----
class Unit {
  constructor(sectors, opts = {}) {
    this.sectors = sectors; this.removable = !!opts.removable; this.writeProtected = !!opts.writeProtected;
    this.map = new Map();
  }
  read(s) {
    if (!(s >= 0 && s < this.sectors)) throw new Error('bad sector ' + s);
    const d = this.map.get(s); return d ? Int16Array.from(d) : new Int16Array(SECTOR);
  }
  write(s, data) {
    if (this.writeProtected) throw new Error('write-protected');
    if (!(s >= 0 && s < this.sectors)) throw new Error('bad sector ' + s);
    const d = Int16Array.from(data); if (d.length !== SECTOR) throw new Error('sector length');
    if (d.every(x => x === 0)) this.map.delete(s); else this.map.set(s, d);
  }
  // .tdisk: "TDSK" u16 version=1, u32 sectors, u16 flags(bit0 removable, bit1 wp), u32 count, then count × (u32 index, 729 × Int16LE), ascending.
  toTdisk() {
    const idx = [...this.map.keys()].sort((a, b) => a - b);
    const buf = new Uint8Array(16 + idx.length * (4 + SECTOR * 2)), dv = new DataView(buf.buffer);
    buf.set([84, 68, 83, 75], 0); dv.setUint16(4, 1, true); dv.setUint32(6, this.sectors, true);
    dv.setUint16(10, (this.removable ? 1 : 0) | (this.writeProtected ? 2 : 0), true); dv.setUint32(12, idx.length, true);
    let o = 16;
    for (const s of idx) { dv.setUint32(o, s, true); o += 4; const d = this.map.get(s); for (let i = 0; i < SECTOR; i++, o += 2) dv.setInt16(o, d[i], true); }
    return buf;
  }
  static fromTdisk(buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'TDSK' || dv.getUint16(4, true) !== 1) throw new Error('not a tdisk v1');
    const f = dv.getUint16(10, true), u = new Unit(dv.getUint32(6, true), { removable: f & 1 });
    const n = dv.getUint32(12, true); let o = 16, prev = -1;
    for (let k = 0; k < n; k++) {
      const s = dv.getUint32(o, true); o += 4; if (s <= prev || s >= u.sectors) throw new Error('tdisk sector order/range');
      prev = s; const d = new Int16Array(SECTOR); for (let i = 0; i < SECTOR; i++, o += 2) d[i] = dv.getInt16(o, true);
      u.write(s, d);
    }
    if (o !== buf.byteLength) throw new Error('tdisk trailing bytes');
    u.writeProtected = !!(f & 2); return u;
  }
  // Raw: sectors × 1,458 bytes, Int16LE, same as Triton 3 exportDiskImage.
  toRaw() { const b = new Uint8Array(this.sectors * SECTOR * 2), dv = new DataView(b.buffer);
    for (const [s, d] of this.map) for (let i = 0; i < SECTOR; i++) dv.setInt16((s * SECTOR + i) * 2, d[i], true); return b; }
  static fromRaw(b) { if (b.byteLength % (SECTOR * 2)) throw new Error('raw size'); const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const u = new Unit(b.byteLength / (SECTOR * 2)); for (let s = 0; s < u.sectors; s++) { const d = new Int16Array(SECTOR);
      for (let i = 0; i < SECTOR; i++) d[i] = dv.getInt16((s * SECTOR + i) * 2, true); u.write(s, d); } return u; }
}

// ---- file system ----
const nameOK = n => typeof n === 'string' && n.length >= 1 && n.length <= 16 && n === n.trim() &&
  [...n].every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126 && c !== '/' && c !== ':');
const key = n => n.toLowerCase();   // case-insensitive match, case-preserving storage

class TritFS {
  constructor(unit) { this.u = unit; this._load(); }
  static mkfs(unit, label = '', now = 0) {
    const n = unit.sectors, sltLen = Math.ceil(n / PER_SLT), sysEnd = 1 + sltLen;
    if (sysEnd + 1 >= n) throw new Error('unit too small');
    if (label && !nameOK(label)) throw new Error('bad label');
    const sb = new Int16Array(SECTOR);
    [...MAGIC].forEach((c, i) => sb[i] = c.charCodeAt(0)); sb[4] = VERSION;
    sb.set(wordToTrytes(n), 5); sb.set(wordToTrytes(1), 8); sb.set(wordToTrytes(sltLen), 11); sb.set(wordToTrytes(0), 14);
    [...label].forEach((c, i) => sb[17 + i] = c.charCodeAt(0)); sb[33] = 1; sb.set(wordToTrytes(sysEnd), 34); sb.set(wordToTrytes(0), 37);
    for (let k = 0; k < sltLen; k++) unit.write(1 + k, new Int16Array(SECTOR));
    unit.write(0, sb);
    const fs = new TritFS(unit);
    for (let s = 0; s < sysEnd; s++) fs._setLink(s, L_RES);
    fs._flushSlt(); return fs;
  }
  _load() {
    const sb = this.u.read(0);
    if (String.fromCharCode(sb[0], sb[1], sb[2], sb[3]) !== MAGIC || sb[4] !== VERSION) throw new Error('not TritFS v2');
    this.total = trytesToWord(sb, 5); this.sltStart = trytesToWord(sb, 8); this.sltLen = trytesToWord(sb, 11);
    this.root = trytesToWord(sb, 14); this.sysEnd = 1 + this.sltLen; this.hint = trytesToWord(sb, 34);
    this.label = [...sb.slice(17, 33)].filter(x => x).map(x => String.fromCharCode(x)).join('');
    this.rootLen = trytesToWord(sb, 37);
    this.slt = new Map();
  }
  // The superblock is the root directory's "parent entry": first sector at 14..16, length at 37..39.
  // Writing it (one sector) is the commit point of every change.
  _commitRoot(first, len) { const sb = this.u.read(0); sb.set(wordToTrytes(first), 14); sb.set(wordToTrytes(len), 37); this.u.write(0, sb); this.root = first; this.rootLen = len; }
  _sltSec(k) { const s = this.sltStart + k; if (!this.slt.has(s)) this.slt.set(s, this.u.read(s)); return this.slt.get(s); }
  link(s) { const d = this._sltSec(Math.floor(s / PER_SLT)); return trytesToWord(d, 3 * (s % PER_SLT)); }
  _setLink(s, v) { const d = this._sltSec(Math.floor(s / PER_SLT)); d.set(wordToTrytes(v), 3 * (s % PER_SLT)); this._dirty = true; }
  _flushSlt() { for (const [s, d] of this.slt) this.u.write(s, d); }
  _alloc() {
    for (let i = 0; i < this.total; i++) { const s = (this.hint + i) % this.total;
      if (this.link(s) === L_FREE) { this.hint = s + 1; return s; } }
    throw new Error('disk full');
  }
  _chain(first) { const out = []; const seen = new Set(); let s = first;
    while (s > 0) { if (seen.has(s) || s >= this.total) throw new Error('broken chain'); seen.add(s); out.push(s);
      const n = this.link(s); if (n === L_END) return out; if (n <= 0) throw new Error('broken chain'); s = n; }
    return out; }
  _readChain(first, len) { const out = new Int16Array(len); let o = 0;
    for (const s of (first ? this._chain(first) : [])) { if (o >= len) break; const d = this.u.read(s); const k = Math.min(SECTOR, len - o); out.set(d.subarray(0, k), o); o += k; }
    if (o < len) throw new Error('chain shorter than length'); return out; }
  // Copy-on-write (crash safety): new data sectors, then their links, then the parent directory is rewritten the same way,
  // up to the superblock (the single-sector commit). Old chains are freed only after the commit.
  _writeChain(data) {
    if (data.length === 0) return 0;
    const n = Math.ceil(data.length / SECTOR), secs = [];
    for (let i = 0; i < n; i++) { const s = this._alloc(); this._setLink(s, L_RES); secs.push(s); } // reserve while allocating
    secs.forEach((s, i) => { const d = new Int16Array(SECTOR); d.set(data.subarray(i * SECTOR, (i + 1) * SECTOR)); this.u.write(s, d); });
    secs.forEach((s, i) => this._setLink(s, i + 1 < n ? secs[i + 1] : L_END)); this._flushSlt();
    return secs[0];
  }
  _freeChain(first) { if (first > 0) for (const s of this._chain(first)) { this._setLink(s, L_FREE); this.u.write(s, new Int16Array(SECTOR)); } this._flushSlt(); }
  // directory = file of 27-tryte entries; returns {first,len,entries[]}
  _dirLoc(path) { // path: array of names; returns location of directory content
    let first = this.root, len = this.rootLen, ent = null;
    for (const nm of path) { ent = this._find({ first, len }, nm); if (!ent || ent.type !== T_DIR) throw new Error('no such directory: ' + nm);
      first = ent.first; len = ent.len; }
    return { first, len, ent };
  }
  _entries(loc) { const raw = this._readChain(loc.first, loc.len), out = [];
    for (let i = 0; i + ENTRY <= raw.length; i += ENTRY) { const e = raw.subarray(i, i + ENTRY); if (e[0] === 0) { out.push(null); continue; }
      out.push({ slot: i / ENTRY, name: [...e.subarray(0, 16)].filter(x => x).map(x => String.fromCharCode(x)).join(''),
        type: e[16], flags: e[17], first: trytesToWord(e, 18), len: trytesToWord(e, 21), mtime: trytesToWord(e, 24) }); }
    return out; }
  _find(loc, nm) { return this._entries(loc).find(e => e && key(e.name) === key(nm)) || null; }
  static encodeEntry(e) { const t = new Int16Array(ENTRY); [...e.name].forEach((c, i) => t[i] = c.charCodeAt(0));
    t[16] = e.type; t[17] = e.flags || 0; t.set(wordToTrytes(e.first), 18); t.set(wordToTrytes(e.len), 21); t.set(wordToTrytes(e.mtime || 0), 24); return t; }
  // Rewrite a directory's content (new chain), then update its parent entry (or the superblock for root), then free the old chain.
  _setDir(path, raw) {
    let n = raw.length / ENTRY; while (n > 0 && raw[(n - 1) * ENTRY] === 0) n--; raw = raw.subarray(0, n * ENTRY); // trim trailing free slots
    const loc = this._dirLoc(path), first = this._writeChain(raw), oldFirst = loc.first;
    if (path.length === 0) this._commitRoot(first, raw.length);
    else { const parent = path.slice(0, -1), pe = this._find(this._dirLoc(parent), path[path.length - 1]);
      this._putEntry(parent, pe.slot, { ...pe, first, len: raw.length }); }
    this._freeChain(oldFirst);
  }
  _putEntry(path, slot, e) { const loc = this._dirLoc(path); const raw = this._readChain(loc.first, loc.len);
    let r = raw; if ((slot + 1) * ENTRY > r.length) { r = new Int16Array((slot + 1) * ENTRY); r.set(raw); }
    if (e) r.set(TritFS.encodeEntry(e), slot * ENTRY); else r.fill(0, slot * ENTRY, (slot + 1) * ENTRY);
    this._setDir(path, r); }
  _split(p) { if (typeof p !== 'string' || !p.startsWith('/')) throw new Error('path must start with /'); const parts = p.split('/').filter(Boolean);
    parts.forEach(n => { if (!nameOK(n)) throw new Error('bad name: ' + n); }); return parts; }
  _create(p, type, data, mtime) {
    const parts = this._split(p), nm = parts.pop(), loc = this._dirLoc(parts);
    const ents = this._entries(loc); const old = ents.find(e => e && key(e.name) === key(nm));
    if (old && (old.type === T_DIR) !== (type === T_DIR)) throw new Error('exists with other kind');
    if (old && type === T_DIR) throw new Error('exists');
    if (old && (old.flags & 1)) throw new Error('read-only');
    const first = this._writeChain(data);
    const slot = old ? old.slot : (ents.findIndex(e => e === null) >= 0 ? ents.findIndex(e => e === null) : ents.length);
    this._putEntry(parts, slot, { name: old ? old.name : nm, type, flags: old ? old.flags : 0, first, len: data.length, mtime });
    if (old) this._freeChain(old.first);
  }
  // ---- public API ----
  mkdir(p, mtime = 0) { this._create(p, T_DIR, new Int16Array(0), mtime); }
  writeFile(p, data, type = T_DATA, mtime = 0) { if (type === T_DIR) throw new Error('use mkdir'); this._create(p, type, Int16Array.from(data), mtime); }
  readFile(p) { const parts = this._split(p), nm = parts.pop(), e = this._find(this._dirLoc(parts), nm);
    if (!e || e.type === T_DIR) throw new Error('no such file'); return this._readChain(e.first, e.len); }
  list(p = '/') { return this._entries(this._dirLoc(this._split(p))).filter(Boolean).map(({ slot, ...e }) => e); }
  stat(p) { const parts = this._split(p), nm = parts.pop(); const e = this._find(this._dirLoc(parts), nm); if (!e) return null; const { slot, ...r } = e; return r; }
  remove(p) { const parts = this._split(p), nm = parts.pop(), e = this._find(this._dirLoc(parts), nm);
    if (!e) throw new Error('no such entry'); if (e.flags & 1) throw new Error('read-only');
    if (e.type === T_DIR && e.len && this._entries({ first: e.first, len: e.len }).some(Boolean)) throw new Error('directory not empty');
    this._putEntry(parts, e.slot, null); this._freeChain(e.first); }
  rename(p, newName) { if (!nameOK(newName)) throw new Error('bad name'); const parts = this._split(p), nm = parts.pop(), loc = this._dirLoc(parts);
    const e = this._find(loc, nm); if (!e) throw new Error('no such entry');
    const clash = this._find(loc, newName); if (clash && clash.slot !== e.slot) throw new Error('exists');
    this._putEntry(parts, e.slot, { ...e, name: newName }); }
  freeSectors() { let n = 0; for (let s = 0; s < this.total; s++) if (this.link(s) === L_FREE) n++; return n; }
  // fsck: every chain valid, no sector in two chains, unreachable non-free sectors reported as orphans (and freed when repair=true).
  fsck(repair = false) {
    const owner = new Map(), problems = [];
    const claim = (s, who) => { if (owner.has(s)) problems.push(`cross-link at ${s}: ${owner.get(s)} and ${who}`); else owner.set(s, who); };
    for (let s = 0; s < this.sysEnd; s++) { if (this.link(s) !== L_RES) problems.push(`reserved sector ${s} not marked`); claim(s, 'system'); }
    const walk = (first, len, who, isDir) => {
      let chain; try { chain = first ? this._chain(first) : []; } catch (e) { problems.push(`${who}: ${e.message}`); return; }
      if (chain.length !== Math.ceil(len / SECTOR)) problems.push(`${who}: ${chain.length} sectors for length ${len}`);
      chain.forEach(s => claim(s, who));
      if (isDir) { let ents; try { ents = this._entries({ first, len }); } catch (e) { problems.push(`${who}: ${e.message}`); return; }
        for (const e of ents) if (e) walk(e.first, e.len, (who === '/' ? '' : who) + '/' + e.name, e.type === T_DIR); }
    };
    walk(this.root, this.rootLen, '/', true);
    const orphans = [];
    for (let s = 0; s < this.total; s++) { const l = this.link(s); if (l !== L_FREE && l !== L_BAD && !owner.has(s)) orphans.push(s); }
    if (repair && orphans.length) { orphans.forEach(s => this._setLink(s, L_FREE)); this._flushSlt(); }
    return { problems, orphans };
  }
}

module.exports = { TritFS, Unit, wordToTrytes, trytesToWord, SECTOR, PER_SLT, ENTRY,
  T_DATA, T_IMAGE, T_ASM, T_EXEC, T_DIR, L_FREE, L_END, L_BAD, L_RES };
