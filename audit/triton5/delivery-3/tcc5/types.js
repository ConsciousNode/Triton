'use strict';

/**
 * ISO C11 Type System & Layout Engine (`tcc5/types.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Implements ILP32 little-endian 1-byte-per-tryte data model (ABI-5.md §2),
 * struct/union/bit-field layout (with packed & aligned attributes),
 * integer promotions, and usual arithmetic conversions.
 */

const TK = {
  VOID: 'void',
  BOOL: 'bool',
  CHAR: 'char',
  SHORT: 'short',
  INT: 'int',
  LONG: 'long',
  LLONG: 'llong',
  FLOAT: 'float',
  DOUBLE: 'double',
  PTR: 'ptr',
  ARRAY: 'array',
  STRUCT: 'struct',
  UNION: 'union',
  FUNC: 'func',
  ENUM: 'enum'
};

function makeType(kind, props = {}) {
  return Object.assign({
    kind,
    unsigned: false,
    size: 0,
    align: 1,
    isConst: false,
    isVolatile: false,
    isRestrict: false
  }, props);
}

const TY_VOID   = makeType(TK.VOID,   { size: 0, align: 1 });
const TY_BOOL   = makeType(TK.BOOL,   { unsigned: true,  size: 1, align: 1 });
const TY_SCHAR  = makeType(TK.CHAR,   { unsigned: false, size: 1, align: 1 });
const TY_UCHAR  = makeType(TK.CHAR,   { unsigned: true,  size: 1, align: 1 });
const TY_SHORT  = makeType(TK.SHORT,  { unsigned: false, size: 2, align: 2 });
const TY_USHORT = makeType(TK.SHORT,  { unsigned: true,  size: 2, align: 2 });
const TY_INT    = makeType(TK.INT,    { unsigned: false, size: 4, align: 4 });
const TY_UINT   = makeType(TK.INT,    { unsigned: true,  size: 4, align: 4 });
const TY_LONG   = makeType(TK.LONG,   { unsigned: false, size: 4, align: 4 });
const TY_ULONG  = makeType(TK.LONG,   { unsigned: true,  size: 4, align: 4 });
const TY_LLONG  = makeType(TK.LLONG,  { unsigned: false, size: 8, align: 4 });
const TY_ULLONG = makeType(TK.LLONG,  { unsigned: true,  size: 8, align: 4 });
const TY_FLOAT  = makeType(TK.FLOAT,  { unsigned: false, size: 4, align: 4 });
const TY_DOUBLE = makeType(TK.DOUBLE, { unsigned: false, size: 8, align: 4 });

function cloneType(ty, overrides = {}) {
  return Object.assign({}, ty, overrides);
}

function unqualType(ty) {
  if (!ty.isConst && !ty.isVolatile && !ty.isRestrict) return ty;
  return cloneType(ty, { isConst: false, isVolatile: false, isRestrict: false });
}

function ptrTo(base) {
  return makeType(TK.PTR, { base, size: 4, align: 4 });
}

function arrayOf(base, len, vlaExpr = null) {
  const size = (len !== null && len >= 0 && base.size !== null) ? base.size * len : 0;
  return makeType(TK.ARRAY, {
    base,
    len,           // number >= 0, or null for incomplete/VLA
    vlaExpr,       // AST expr if VLA
    isVla: vlaExpr !== null || !!base.isVla,
    size,
    align: base.align || 1
  });
}

function funcType(ret, params, isVariadic = false, hasProto = true) {
  return makeType(TK.FUNC, { ret, params, isVariadic, hasProto, size: 1, align: 1 });
}

function isInteger(ty) {
  return ty.kind === TK.BOOL || ty.kind === TK.CHAR || ty.kind === TK.SHORT ||
         ty.kind === TK.INT || ty.kind === TK.LONG || ty.kind === TK.LLONG || ty.kind === TK.ENUM;
}

function isFloat(ty) {
  return ty.kind === TK.FLOAT || ty.kind === TK.DOUBLE;
}

function isArithmetic(ty) {
  return isInteger(ty) || isFloat(ty);
}

function isScalar(ty) {
  return isArithmetic(ty) || ty.kind === TK.PTR;
}

function isAggregate(ty) {
  return ty.kind === TK.STRUCT || ty.kind === TK.UNION;
}

function is64Bit(ty) {
  return ty.kind === TK.LLONG || ty.kind === TK.DOUBLE;
}

function intRank(ty) {
  switch (ty.kind) {
    case TK.BOOL: return 1;
    case TK.CHAR: return 2;
    case TK.SHORT: return 3;
    case TK.INT: case TK.ENUM: return 4;
    case TK.LONG: return 5;
    case TK.LLONG: return 6;
    default: return 0;
  }
}

function integerPromote(ty) {
  if (ty.kind === TK.BOOL || ty.kind === TK.CHAR || ty.kind === TK.SHORT || ty.kind === TK.ENUM) {
    return TY_INT;
  }
  return unqualType(ty);
}

function usualArithConv(t1, t2) {
  if (t1.kind === TK.DOUBLE || t2.kind === TK.DOUBLE) return TY_DOUBLE;
  if (t1.kind === TK.FLOAT || t2.kind === TK.FLOAT) return TY_FLOAT;
  const a = integerPromote(t1);
  const b = integerPromote(t2);
  if (a.kind === b.kind && a.unsigned === b.unsigned) return a;
  if (a.unsigned === b.unsigned) return intRank(a) >= intRank(b) ? a : b;
  const u = a.unsigned ? a : b;
  const s = a.unsigned ? b : a;
  if (intRank(u) >= intRank(s)) return u;
  // Signed has higher rank: if signed can represent all values of unsigned (e.g. long long vs unsigned int)
  if (s.size > u.size) return s;
  // Otherwise unsigned version of signed type
  if (s.kind === TK.LONG) return TY_ULONG;
  if (s.kind === TK.LLONG) return TY_ULLONG;
  return TY_UINT;
}

function decayType(ty) {
  if (ty.kind === TK.ARRAY) return ptrTo(ty.base);
  if (ty.kind === TK.FUNC) return ptrTo(ty);
  return ty;
}

function alignUp(v, a) {
  if (a <= 1) return v;
  const r = v % a;
  return r === 0 ? v : v + (a - r);
}

function layoutStructOrUnion(ty, packed = false, forcedAlign = 0) {
  const isUnion = ty.kind === TK.UNION;
  let maxAlign = packed ? 1 : 1;
  let off = 0;
  let bitOff = 0; // bit offset within current storage unit for bit-fields
  let inBitfield = false;
  let bfUnitSize = 0;

  function flushBitfield() {
    if (inBitfield) {
      off += Math.ceil(bitOff / 8);
      bitOff = 0;
      inBitfield = false;
      bfUnitSize = 0;
    }
  }

  for (const f of ty.fields) {
    const fAlign = packed ? 1 : (f.align || f.type.align || 1);
    if (fAlign > maxAlign) maxAlign = fAlign;

    if (f.bitWidth !== null && f.bitWidth !== undefined) {
      const unitBits = (f.type.size || 4) * 8;
      if (isUnion) {
        f.offset = 0;
        f.bitOffset = 0;
        const needBytes = Math.ceil(f.bitWidth / 8);
        if (needBytes > off) off = needBytes;
        continue;
      }
      if (f.bitWidth === 0) {
        flushBitfield();
        off = alignUp(off, fAlign);
        f.offset = off;
        f.bitOffset = 0;
        continue;
      }
      if (!inBitfield) {
        if (!packed) off = alignUp(off, fAlign);
        inBitfield = true;
        bitOff = 0;
        bfUnitSize = unitBits;
      } else if (!packed && Math.floor(bitOff / unitBits) !== Math.floor((bitOff + f.bitWidth - 1) / unitBits)) {
        // Crosses storage unit boundary -> advance to next aligned unit
        flushBitfield();
        off = alignUp(off, fAlign);
        inBitfield = true;
        bitOff = 0;
        bfUnitSize = unitBits;
      }
      const byteOff = off + Math.floor(bitOff / 8);
      f.offset = byteOff;
      f.bitOffset = bitOff % 8;
      bitOff += f.bitWidth;
    } else {
      flushBitfield();
      if (isUnion) {
        f.offset = 0;
        if (f.type.size > off) off = f.type.size;
      } else {
        off = alignUp(off, fAlign);
        f.offset = off;
        off += f.type.size;
      }
    }
  }
  flushBitfield();
  if (forcedAlign > maxAlign) maxAlign = forcedAlign;
  ty.align = maxAlign;
  ty.size = alignUp(off, maxAlign);
  ty.complete = true;
}

function typesCompatible(a, b) {
  a = unqualType(a);
  b = unqualType(b);
  if (a.kind !== b.kind) {
    if (a.kind === TK.ENUM && b.kind === TK.INT && !b.unsigned) return true;
    if (b.kind === TK.ENUM && a.kind === TK.INT && !a.unsigned) return true;
    return false;
  }
  if (isInteger(a)) return a.unsigned === b.unsigned;
  if (a.kind === TK.PTR) return typesCompatible(a.base, b.base);
  if (a.kind === TK.ARRAY) {
    if (!typesCompatible(a.base, b.base)) return false;
    if (a.len !== null && b.len !== null && a.len !== b.len) return false;
    return true;
  }
  if (a.kind === TK.STRUCT || a.kind === TK.UNION) {
    return a === b || (a.tag && b.tag && a.tag === b.tag);
  }
  if (a.kind === TK.FUNC) {
    if (!typesCompatible(a.ret, b.ret)) return false;
    if (!a.hasProto || !b.hasProto) return true;
    if (a.isVariadic !== b.isVariadic || a.params.length !== b.params.length) return false;
    for (let i = 0; i < a.params.length; i++) {
      if (!typesCompatible(a.params[i].type, b.params[i].type)) return false;
    }
    return true;
  }
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TK, makeType, cloneType, unqualType,
    TY_VOID, TY_BOOL, TY_SCHAR, TY_UCHAR, TY_SHORT, TY_USHORT,
    TY_INT, TY_UINT, TY_LONG, TY_ULONG, TY_LLONG, TY_ULLONG,
    TY_FLOAT, TY_DOUBLE,
    ptrTo, arrayOf, funcType,
    isInteger, isFloat, isArithmetic, isScalar, isAggregate, is64Bit,
    intRank, integerPromote, usualArithConv, decayType,
    alignUp, layoutStructOrUnion, typesCompatible
  };
}
