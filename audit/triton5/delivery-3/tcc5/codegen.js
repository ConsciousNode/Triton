'use strict';

/**
 * Triton 5.0 Code Generator (`tcc5/codegen.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Emits Triton 5.0 assembly (for t5as / ABI-5.md) from the C11 + GNU AST.
 * Uses C-space biased pointers (bias = 1093 for balanced-3^7 2,187-tryte pages),
 * 1-byte-per-tryte little-endian memory layout, R0..R2 arg regs, R3 scratch/call target,
 * R4..R6 callee-saved, R7 = FP, R8 = CSP, hardware SP = shadow return/spill stack.
 */

const T = (typeof require !== 'undefined') ? require('./types') : globalThis.TCC5_TYPES;
const ISA = (typeof require !== 'undefined') ? require('./isa') : globalThis.TCC5_ISA;

const BIAS = ISA.PAGE_BIAS; // 1093

const _f32Buf = new ArrayBuffer(4);
const _f32View = new Float32Array(_f32Buf);
const _u32View = new Uint32Array(_f32Buf);
const _f64Buf = new ArrayBuffer(8);
const _f64View = new Float64Array(_f64Buf);
const _u64View = new Uint32Array(_f64Buf);

function floatToU32(v) {
  _f32View[0] = v;
  return _u32View[0] >>> 0;
}

function doubleToU32Pair(v) {
  _f64View[0] = v;
  return [_u64View[0] >>> 0, _u64View[1] >>> 0];
}

function align4(n) {
  return (n + 3) & ~3;
}

function generateAsm(ast, options = {}) {
  const lines = [];
  const rodataLines = [];
  const dataLines = [];
  const bssLines = [];
  const initArrayLines = [];
  const customSections = new Map(); // secName -> string[]
  let labelCounter = 0;
  let strCounter = 0;
  let curFunc = null;
  let breakStack = [];
  let continueStack = [];
  let switchStack = [];
  let funcLabelMap = null;
  const optLevel = options.optLevel !== undefined ? options.optLevel : 1;

  function emit(s) { lines.push(s); }
  function newLabel(pfx = 'L') { return `.${pfx}_${++labelCounter}`; }

  function getUserLabel(name) {
    if (!funcLabelMap.has(name)) {
      funcLabelMap.set(name, `.U_${curFunc.name}_${name}_${++labelCounter}`);
    }
    return funcLabelMap.get(name);
  }

  function addStringLit(bytes) {
    const lbl = `.STR_${++strCounter}`;
    rodataLines.push(`${lbl}:`);
    // Emit in chunks of 16 bytes
    const all = [...bytes, 0];
    for (let i = 0; i < all.length; i += 16) {
      rodataLines.push(`  .byte ${all.slice(i, i + 16).join(', ')}`);
    }
    return lbl;
  }

  // Load 32-bit constant into reg (as signed or unsigned exact 27-trit integer)
  function emitLoadConst(reg, val) {
    const n = typeof val === 'bigint' ? Number(val) : val;
    if (n >= -ISA.TRYTE_HALF && n <= ISA.TRYTE_HALF) {
      emit(`  LI ${reg}, ${n}`);
    } else {
      emit(`  LC ${reg}, ${n}`);
    }
  }

  // Emit load from C-space address in baseReg + disp into R0 (or R0,R1 for 64-bit)
  // Clobbers R3 only (and R0/R1 for result). Never clobbers baseReg unless baseReg is R0/R1.
  function emitLoad(ty, baseReg, disp = 0, isVol = false) {
    const volTag = (isVol || ty.isVolatile) ? ' ; volatile' : '';
    const sz = ty.size;
    // Ensure disp - BIAS .. disp - BIAS + sz - 1 fits in imm9 [-9841..+9841]
    let b = baseReg;
    let d = disp - BIAS;
    if (d < -ISA.TRYTE_HALF || d + sz > ISA.TRYTE_HALF) {
      // Materialize adjusted C-space address into R3 if possible, else PUSH/POP
      if (baseReg === 'R2') {
        emitLoadConst('R3', disp);
        emit(`  ADD R2, R2, R3`);
        b = 'R2'; d = -BIAS;
      } else {
        emit(`  PUSH R2`);
        emitLoadConst('R2', disp);
        emit(`  ADD R2, ${baseReg}, R2`);
        emitLoad(ty, 'R2', 0, isVol);
        emit(`  POP R2`);
        return;
      }
    }

    if (sz === 1) {
      emit(`  LT R0, ${b}, ${d}${volTag}`);
      if (ty.kind === T.TK.BOOL) {
        emit(`  WRAPU R0, R0, 8`);
      } else if (!ty.unsigned) {
        emit(`  WRAPS R0, R0, 8`);
      } else {
        emit(`  WRAPU R0, R0, 8`);
      }
      return;
    }
    if (sz === 2) {
      emit(`  LT R0, ${b}, ${d + 1}${volTag}`);
      emit(`  MULI R0, R0, 256`);
      emit(`  LT R3, ${b}, ${d}${volTag}`);
      emit(`  ADD R0, R0, R3`);
      emit(ty.unsigned ? `  WRAPU R0, R0, 16` : `  WRAPS R0, R0, 16`);
      return;
    }
    if (sz === 4) {
      // Horner's method: b3*256^3 + b2*256^2 + b1*256 + b0
      emit(`  LT R0, ${b}, ${d + 3}${volTag}`);
      emit(`  MULI R0, R0, 256`);
      emit(`  LT R3, ${b}, ${d + 2}${volTag}`);
      emit(`  ADD R0, R0, R3`);
      emit(`  MULI R0, R0, 256`);
      emit(`  LT R3, ${b}, ${d + 1}${volTag}`);
      emit(`  ADD R0, R0, R3`);
      emit(`  MULI R0, R0, 256`);
      emit(`  LT R3, ${b}, ${d}${volTag}`);
      emit(`  ADD R0, R0, R3`);
      if (ty.kind === T.TK.PTR) {
        emit(`  WRAPS R0, R0, 32`);
      } else if (ty.kind === T.TK.FLOAT || ty.unsigned) {
        emit(`  WRAPU R0, R0, 32`);
      } else {
        emit(`  WRAPS R0, R0, 32`);
      }
      return;
    }
    if (sz === 8) {
      // Load hi into R1, then lo into R0 (note: if b === 'R0', load hi first, or save b)
      let addrReg = b;
      const saveR2 = (b === 'R0' || b === 'R1');
      if (saveR2) {
        emit(`  PUSH R2`);
        emit(`  MOV R2, ${b}`);
        addrReg = 'R2';
      }
      // hi (bytes 4..7) -> R1
      emit(`  LT R1, ${addrReg}, ${d + 7}${volTag}`);
      emit(`  MULI R1, R1, 256`);
      emit(`  LT R3, ${addrReg}, ${d + 6}${volTag}`);
      emit(`  ADD R1, R1, R3`);
      emit(`  MULI R1, R1, 256`);
      emit(`  LT R3, ${addrReg}, ${d + 5}${volTag}`);
      emit(`  ADD R1, R1, R3`);
      emit(`  MULI R1, R1, 256`);
      emit(`  LT R3, ${addrReg}, ${d + 4}${volTag}`);
      emit(`  ADD R1, R1, R3`);
      emit(`  WRAPU R1, R1, 32`);
      // lo (bytes 0..3) -> R0
      emit(`  LT R0, ${addrReg}, ${d + 3}${volTag}`);
      emit(`  MULI R0, R0, 256`);
      emit(`  LT R3, ${addrReg}, ${d + 2}${volTag}`);
      emit(`  ADD R0, R0, R3`);
      emit(`  MULI R0, R0, 256`);
      emit(`  LT R3, ${addrReg}, ${d + 1}${volTag}`);
      emit(`  ADD R0, R0, R3`);
      emit(`  MULI R0, R0, 256`);
      emit(`  LT R3, ${addrReg}, ${d}${volTag}`);
      emit(`  ADD R0, R0, R3`);
      emit(`  WRAPU R0, R0, 32`);
      if (saveR2) emit(`  POP R2`);
      return;
    }
    // Aggregate/array: result is the C-space address itself
    if (disp === 0) {
      if (baseReg !== 'R0') emit(`  MOV R0, ${baseReg}`);
    } else {
      emitLoadConst('R3', disp);
      emit(`  ADD R0, ${baseReg}, R3`);
    }
  }

  // Emit store from R0 (or R0,R1 for 64-bit) to C-space address in baseReg + disp
  // Preserves R0 (and R1 for 64-bit), clobbers R3 only.
  function emitStore(ty, baseReg, disp = 0, isVol = false) {
    const volTag = (isVol || ty.isVolatile) ? ' ; volatile' : '';
    const sz = ty.size;
    let b = baseReg;
    let d = disp - BIAS;
    if (d < -ISA.TRYTE_HALF || d + sz > ISA.TRYTE_HALF) {
      emit(`  PUSH R2`);
      emitLoadConst('R2', disp);
      emit(`  ADD R2, ${baseReg}, R2`);
      emitStore(ty, 'R2', 0, isVol);
      emit(`  POP R2`);
      return;
    }

    if (sz === 1) {
      emit(`  WRAPU R3, R0, 8`);
      emit(`  ST R3, ${b}, ${d}${volTag}`);
      return;
    }
    if (sz === 2) {
      emit(`  WRAPU R3, R0, 8`);
      emit(`  ST R3, ${b}, ${d}${volTag}`);
      emit(`  LI R3, 8`);
      emit(`  BSHR R3, R0, R3`);
      emit(`  WRAPU R3, R3, 8`);
      emit(`  ST R3, ${b}, ${d + 1}${volTag}`);
      return;
    }
    if (sz === 4) {
      emit(`  WRAPU R3, R0, 8`);
      emit(`  ST R3, ${b}, ${d}${volTag}`);
      emit(`  LI R3, 8`);
      emit(`  BSHR R3, R0, R3`);
      emit(`  WRAPU R3, R3, 8`);
      emit(`  ST R3, ${b}, ${d + 1}${volTag}`);
      emit(`  LI R3, 16`);
      emit(`  BSHR R3, R0, R3`);
      emit(`  WRAPU R3, R3, 8`);
      emit(`  ST R3, ${b}, ${d + 2}${volTag}`);
      emit(`  LI R3, 24`);
      emit(`  BSHR R3, R0, R3`);
      emit(`  ST R3, ${b}, ${d + 3}${volTag}`);
      return;
    }
    if (sz === 8) {
      // Store R0 -> d..d+3
      emit(`  WRAPU R3, R0, 8`);
      emit(`  ST R3, ${b}, ${d}${volTag}`);
      emit(`  LI R3, 8`);
      emit(`  BSHR R3, R0, R3`);
      emit(`  WRAPU R3, R3, 8`);
      emit(`  ST R3, ${b}, ${d + 1}${volTag}`);
      emit(`  LI R3, 16`);
      emit(`  BSHR R3, R0, R3`);
      emit(`  WRAPU R3, R3, 8`);
      emit(`  ST R3, ${b}, ${d + 2}${volTag}`);
      emit(`  LI R3, 24`);
      emit(`  BSHR R3, R0, R3`);
      emit(`  ST R3, ${b}, ${d + 3}${volTag}`);
      // Store R1 -> d+4..d+7
      emit(`  WRAPU R3, R1, 8`);
      emit(`  ST R3, ${b}, ${d + 4}${volTag}`);
      emit(`  LI R3, 8`);
      emit(`  BSHR R3, R1, R3`);
      emit(`  WRAPU R3, R3, 8`);
      emit(`  ST R3, ${b}, ${d + 5}${volTag}`);
      emit(`  LI R3, 16`);
      emit(`  BSHR R3, R1, R3`);
      emit(`  WRAPU R3, R3, 8`);
      emit(`  ST R3, ${b}, ${d + 6}${volTag}`);
      emit(`  LI R3, 24`);
      emit(`  BSHR R3, R1, R3`);
      emit(`  ST R3, ${b}, ${d + 7}${volTag}`);
      return;
    }
  }

  // Copy sz bytes from C-space src in srcReg to C-space dst in dstReg (using BCOPY!)
  function emitMemCopy(dstReg, srcReg, sz) {
    if (sz <= 0) return;
    emit(`  PUSH R0`);
    emit(`  PUSH R1`);
    emit(`  PUSH R2`);
    if (dstReg !== 'R0') emit(`  MOV R3, ${dstReg}`);
    else emit(`  MOV R3, R0`);
    if (srcReg !== 'R1') emit(`  MOV R1, ${srcReg}`);
    emit(`  SUBI R0, R3, ${BIAS}`);
    emit(`  SUBI R1, R1, ${BIAS}`);
    emitLoadConst('R2', sz);
    emit(`  BCOPY R0, R1, R2`);
    emit(`  POP R2`);
    emit(`  POP R1`);
    emit(`  POP R0`);
  }

  // Zero sz bytes at C-space dst in dstReg (using BFILL!)
  function emitMemZero(dstReg, sz) {
    if (sz <= 0) return;
    emit(`  PUSH R0`);
    emit(`  PUSH R1`);
    emit(`  PUSH R2`);
    emit(`  SUBI R0, ${dstReg}, ${BIAS}`);
    emit(`  LI R1, 0`);
    emitLoadConst('R2', sz);
    emit(`  BFILL R0, R1, R2`);
    emit(`  POP R2`);
    emit(`  POP R1`);
    emit(`  POP R0`);
  }

  // Type conversion: value currently in R0 (or R0,R1) of type fromTy -> toTy
  function emitCast(fromTy, toTy) {
    fromTy = T.decayType(T.unqualType(fromTy));
    toTy = T.unqualType(toTy);
    if (toTy.kind === T.TK.VOID) return;
    if (fromTy.kind === toTy.kind && fromTy.unsigned === toTy.unsigned && fromTy.size === toTy.size) return;

    // To _Bool: 0 -> 0, nonzero -> 1
    if (toTy.kind === T.TK.BOOL) {
      if (fromTy.kind === T.TK.FLOAT) {
        // Float != 0.0 (both +0.0 and -0.0 are 0; NaN is nonzero -> true)
        emit(`  LI R1, 0`);
        emit(`  CALL_SYM __t5_fcmp`);
        const lblT = newLabel('bt'), lblE = newLabel('be');
        emit(`  CMPI R0, 0`);
        emit(`  JNZX ${lblT}`);
        emit(`  LI R0, 0`);
        emit(`  JMPX ${lblE}`);
        emit(`${lblT}:`);
        emit(`  LI R0, 1`);
        emit(`${lblE}:`);
        return;
      }
      if (fromTy.kind === T.TK.DOUBLE) {
        emit(`  PUSH R2`);
        emit(`  LI R2, 0`);
        emit(`  SUBI R8, R8, 8`);
        emit(`  LI R3, 0`);
        emit(`  PUSH R0`);
        emit(`  LI R0, 0`);
        emitStore(T.TY_UINT, 'R8', 0);
        emitStore(T.TY_UINT, 'R8', 4);
        emit(`  POP R0`);
        emit(`  CALL_SYM __t5_dcmp`);
        emit(`  ADDI R8, R8, 8`);
        emit(`  POP R2`);
        const lblT = newLabel('bt'), lblE = newLabel('be');
        emit(`  CMPI R0, 0`);
        emit(`  JNZX ${lblT}`);
        emit(`  LI R0, 0`);
        emit(`  JMPX ${lblE}`);
        emit(`${lblT}:`);
        emit(`  LI R0, 1`);
        emit(`${lblE}:`);
        return;
      }
      if (fromTy.kind === T.TK.LLONG) {
        emit(`  BOR R0, R0, R1`);
      }
      const lblZ = newLabel('bz'), lblD = newLabel('bd');
      emit(`  CMPI R0, 0`);
      emit(`  JZX ${lblZ}`);
      emit(`  LI R0, 1`);
      emit(`  JMPX ${lblD}`);
      emit(`${lblZ}:`);
      emit(`  LI R0, 0`);
      emit(`${lblD}:`);
      return;
    }

    // Float <-> Double
    if (fromTy.kind === T.TK.FLOAT && toTy.kind === T.TK.DOUBLE) {
      emit(`  CALL_SYM __t5_ftod`);
      return;
    }
    if (fromTy.kind === T.TK.DOUBLE && toTy.kind === T.TK.FLOAT) {
      emit(`  CALL_SYM __t5_dtof`);
      return;
    }

    // Int -> Float / Double
    if (T.isInteger(fromTy) && toTy.kind === T.TK.FLOAT) {
      if (fromTy.kind === T.TK.LLONG) {
        emit(`  CALL_SYM ${fromTy.unsigned ? '__t5_u64tof' : '__t5_i64tof'}`);
      } else {
        emit(`  CALL_SYM ${fromTy.unsigned ? '__t5_u32tof' : '__t5_i32tof'}`);
      }
      return;
    }
    if (T.isInteger(fromTy) && toTy.kind === T.TK.DOUBLE) {
      if (fromTy.kind === T.TK.LLONG) {
        emit(`  CALL_SYM ${fromTy.unsigned ? '__t5_u64tod' : '__t5_i64tod'}`);
      } else {
        emit(`  CALL_SYM ${fromTy.unsigned ? '__t5_u32tod' : '__t5_i32tod'}`);
      }
      return;
    }

    // Float / Double -> Int
    if (fromTy.kind === T.TK.FLOAT && T.isInteger(toTy)) {
      if (toTy.kind === T.TK.LLONG) {
        emit(`  CALL_SYM ${toTy.unsigned ? '__t5_ftou64' : '__t5_ftoi64'}`);
      } else {
        emit(`  CALL_SYM ${toTy.unsigned ? '__t5_ftou32' : '__t5_ftoi32'}`);
        if (toTy.size < 4) emit(`  ${toTy.unsigned ? 'WRAPU' : 'WRAPS'} R0, R0, ${toTy.size * 8}`);
      }
      return;
    }
    if (fromTy.kind === T.TK.DOUBLE && T.isInteger(toTy)) {
      if (toTy.kind === T.TK.LLONG) {
        emit(`  CALL_SYM ${toTy.unsigned ? '__t5_dtou64' : '__t5_dtoi64'}`);
      } else {
        emit(`  CALL_SYM ${toTy.unsigned ? '__t5_dtou32' : '__t5_dtoi32'}`);
        if (toTy.size < 4) emit(`  ${toTy.unsigned ? 'WRAPU' : 'WRAPS'} R0, R0, ${toTy.size * 8}`);
      }
      return;
    }

    // 32-bit / Pointer -> 64-bit integer
    if (fromTy.kind !== T.TK.LLONG && toTy.kind === T.TK.LLONG) {
      if (fromTy.unsigned) {
        emit(`  WRAPU R0, R0, 32`);
        emit(`  LI R1, 0`);
      } else {
        emit(`  LI R3, 31`);
        emit(`  BSAR R1, R0, R3`);
        emit(`  WRAPU R1, R1, 32`);
        emit(`  WRAPU R0, R0, 32`);
      }
      return;
    }

    // 64-bit integer -> 32-bit / Pointer
    if (fromTy.kind === T.TK.LLONG && toTy.kind !== T.TK.LLONG) {
      if (toTy.kind === T.TK.PTR) {
        emit(`  WRAPS R0, R0, 32`);
      } else {
        emit(`  ${toTy.unsigned ? 'WRAPU' : 'WRAPS'} R0, R0, ${toTy.size * 8}`);
      }
      return;
    }

    // 32-bit <-> 32-bit / Pointer
    if (toTy.kind === T.TK.PTR) {
      emit(`  WRAPS R0, R0, 32`);
    } else if (T.isInteger(toTy) && toTy.size <= 4) {
      emit(`  ${toTy.unsigned ? 'WRAPU' : 'WRAPS'} R0, R0, ${toTy.size * 8}`);
    }
  }

  // Generate address of an lvalue into R0 (C-space address)
  function genAddr(node) {
    switch (node.kind) {
      case 'Var': {
        const sym = node.symbol;
        if (sym.isGlobal) {
          emit(`  LA R0, ${sym.asmName || sym.name}`);
        } else if (sym.isVla) {
          // VLA local stores its pointer at [FP + sym.offset]
          emitLoad(T.ptrTo(T.TY_VOID), 'R7', sym.offset);
        } else {
          if (sym.offset >= -ISA.TRYTE_HALF && sym.offset <= ISA.TRYTE_HALF) {
            emit(`  ADDI R0, R7, ${sym.offset}`);
          } else {
            emitLoadConst('R3', sym.offset);
            emit(`  ADD R0, R7, R3`);
          }
        }
        return;
      }
      case 'Deref':
        genExpr(node.expr);
        return;
      case 'Member':
        if (node.isArrow) genExpr(node.object);
        else genAddr(node.object);
        if (node.offset !== 0) {
          if (node.offset >= -ISA.TRYTE_HALF && node.offset <= ISA.TRYTE_HALF) {
            emit(`  ADDI R0, R0, ${node.offset}`);
          } else {
            emitLoadConst('R3', node.offset);
            emit(`  ADD R0, R0, R3`);
          }
        }
        return;
      case 'StrLit': {
        const lbl = addStringLit(node.bytes);
        emit(`  LA R0, ${lbl}`);
        return;
      }
      case 'CompoundLit': {
        // Allocate temporary space on C stack (aligned to 4)
        const sz = align4(Math.max(node.type.size, 4));
        if (sz <= ISA.TRYTE_HALF) emit(`  SUBI R8, R8, ${sz}`);
        else { emitLoadConst('R3', sz); emit(`  SUB R8, R8, R3`); }
        emit(`  MOV R0, R8`);
        emit(`  PUSH R0`);
        genLocalInit(node.type, 'R8', 0, node.init);
        emit(`  POP R0`);
        return;
      }
      case 'Binary':
        if (node.op === ',') {
          genExpr(node.left);
          genAddr(node.right);
          return;
        }
        throw new Error(`Cannot take address of binary '${node.op}'`);
      case 'Call':
      case 'Ternary':
      case 'StmtExpr':
      case 'Assign':
        if (T.isAggregate(node.type)) { genExpr(node); return; }
        throw new Error(`Cannot take address of AST node '${node.kind}'`);
      default:
        throw new Error(`Cannot take address of AST node '${node.kind}'`);
    }
  }

  // Bit-field load helper (address of member's byte offset is in R0)
  function emitBitfieldLoad(field) {
    const bw = field.bitWidth;
    const bo = field.bitOffset;
    const byteCount = Math.ceil((bo + bw) / 8);
    const loadTy = byteCount <= 1 ? T.TY_UCHAR : (byteCount <= 2 ? T.TY_USHORT : T.TY_UINT);
    emit(`  MOV R2, R0`);
    emitLoad(loadTy, 'R2', 0, field.type.isVolatile);
    if (bo > 0) {
      emit(`  LI R3, ${bo}`);
      emit(`  BSHR R0, R0, R3`);
    }
    emit(`  ${field.type.unsigned ? 'WRAPU' : 'WRAPS'} R0, R0, ${bw}`);
  }

  // Bit-field store helper (value in R0, address of member's byte offset on top of HW stack)
  function emitBitfieldStore(field) {
    const bw = field.bitWidth;
    const bo = field.bitOffset;
    const byteCount = Math.ceil((bo + bw) / 8);
    const loadTy = byteCount <= 1 ? T.TY_UCHAR : (byteCount <= 2 ? T.TY_USHORT : T.TY_UINT);
    const mask = ((1n << BigInt(bw)) - 1n) << BigInt(bo);
    const invMask = Number((~mask) & 0xFFFFFFFFn);
    emit(`  POP R2`); // R2 = address
    emit(`  PUSH R0`); // save raw value to return
    emit(`  WRAPU R0, R0, ${bw}`);
    if (bo > 0) {
      emit(`  LI R3, ${bo}`);
      emit(`  BSHL R0, R0, R3`);
    }
    emit(`  PUSH R0`); // shifted new bits
    emitLoad(loadTy, 'R2', 0, field.type.isVolatile);
    emitLoadConst('R3', invMask);
    emit(`  BAND R0, R0, R3`);
    emit(`  POP R3`);
    emit(`  BOR R0, R0, R3`);
    emitStore(loadTy, 'R2', 0, field.type.isVolatile);
    emit(`  POP R0`);
    emit(`  ${field.type.unsigned ? 'WRAPU' : 'WRAPS'} R0, R0, ${bw}`);
  }

  // Emit boolean test of R0 (or R0,R1) -> sets flags (SF != 0 iff true)
  function emitTestTruth(ty) {
    ty = T.decayType(T.unqualType(ty));
    if (ty.kind === T.TK.FLOAT || ty.kind === T.TK.DOUBLE) {
      emitCast(ty, T.TY_BOOL);
      emit(`  CMPI R0, 0`);
      return;
    }
    if (ty.kind === T.TK.LLONG) {
      emit(`  BOR R0, R0, R1`);
    }
    emit(`  CMPI R0, 0`);
  }

  // Helper to pass 2 doubles to a runtime helper: (R0,R1) = a, (R2,R3) = b -> stack [CSP+0..7] = b
  function emitDoubleBinCall(fnName) {
    emit(`  SUBI R8, R8, 8`);
    emit(`  PUSH R0`);
    emit(`  PUSH R3`);
    emit(`  MOV R0, R2`);
    emitStore(T.TY_UINT, 'R8', 0);
    emit(`  POP R0`);
    emitStore(T.TY_UINT, 'R8', 4);
    emit(`  POP R0`);
    emit(`  CALL_SYM ${fnName}`);
    emit(`  ADDI R8, R8, 8`);
  }

  // Helper to pass 2 uint64/int64 to a runtime helper: (R0,R1) = a, (R2,R3) = b -> stack [CSP+0..7] = b
  function emitI64BinCall(fnName) {
    emitDoubleBinCall(fnName);
  }

  // Generate expression value into R0 (or R0,R1 for 64-bit)
  function genExpr(node) {
    switch (node.kind) {
      case 'IntLit': {
        const ty = node.type;
        if (ty.kind === T.TK.LLONG) {
          const u = BigInt.asUintN(64, node.value);
          const lo = Number(u & 0xFFFFFFFFn);
          const hi = Number((u >> 32n) & 0xFFFFFFFFn);
          emitLoadConst('R0', lo);
          emitLoadConst('R1', hi);
        } else {
          const bits = ty.size * 8;
          const v = ty.unsigned ? Number(BigInt.asUintN(bits, node.value)) : Number(BigInt.asIntN(bits, node.value));
          emitLoadConst('R0', v);
        }
        return;
      }
      case 'FloatLit': {
        if (node.type.kind === T.TK.FLOAT) {
          emitLoadConst('R0', floatToU32(node.value));
        } else {
          const [lo, hi] = doubleToU32Pair(node.value);
          emitLoadConst('R0', lo);
          emitLoadConst('R1', hi);
        }
        return;
      }
      case 'StrLit': {
        const lbl = addStringLit(node.bytes);
        emit(`  LA R0, ${lbl}`);
        return;
      }
      case 'SizeofType':
        emitLoadConst('R0', node.targetType.size);
        return;
      case 'SizeofExpr':
        if (node.exprType.isVla && node.expr.kind === 'Var' && node.expr.symbol.vlaSizeOffset !== undefined) {
          emitLoad(T.TY_ULONG, 'R7', node.expr.symbol.vlaSizeOffset);
        } else {
          emitLoadConst('R0', node.exprType.size);
        }
        return;
      case 'AlignofType':
        emitLoadConst('R0', node.targetType.align);
        return;
      case 'Offsetof':
        emitLoadConst('R0', node.offset);
        return;
      case 'BuiltinConstP':
        emitLoadConst('R0', ast.evalConstExpr ? (() => { try { ast.evalConstExpr(node.arg); return 1; } catch (_) { return 0; } })() : 0);
        return;
      case 'BuiltinUnreachable':
        emit(`  HALT`);
        return;
      case 'LabelAddr': {
        const asmLbl = getUserLabel(node.label);
        emit(`  LA R0, ${asmLbl}`);
        return;
      }
      case 'Var': {
        const ty = node.type;
        if (ty.kind === T.TK.ARRAY || ty.kind === T.TK.FUNC || T.isAggregate(ty)) {
          genAddr(node);
          return;
        }
        const sym = node.symbol;
        if (sym.isLocal && !sym.isVla) {
          emitLoad(ty, 'R7', sym.offset, ty.isVolatile);
        } else {
          genAddr(node);
          emit(`  MOV R2, R0`);
          emitLoad(ty, 'R2', 0, ty.isVolatile);
        }
        return;
      }
      case 'AddrOf':
        genAddr(node.expr);
        return;
      case 'Deref': {
        genExpr(node.expr);
        const ty = node.type;
        if (ty.kind === T.TK.ARRAY || ty.kind === T.TK.FUNC || T.isAggregate(ty)) {
          return;
        }
        emit(`  MOV R2, R0`);
        emitLoad(ty, 'R2', 0, ty.isVolatile);
        return;
      }
      case 'Member': {
        genAddr(node);
        if (node.field.bitWidth !== null && node.field.bitWidth !== undefined) {
          emitBitfieldLoad(node.field);
          return;
        }
        const ty = node.type;
        if (ty.kind === T.TK.ARRAY || T.isAggregate(ty)) return;
        emit(`  MOV R2, R0`);
        emitLoad(ty, 'R2', 0, ty.isVolatile);
        return;
      }
      case 'CompoundLit': {
        genAddr(node);
        const ty = node.type;
        if (ty.kind !== T.TK.ARRAY && !T.isAggregate(ty)) {
          emit(`  MOV R2, R0`);
          emitLoad(ty, 'R2', 0);
        }
        return;
      }
      case 'StmtExpr': {
        const stmts = node.block.stmts;
        for (let i = 0; i < stmts.length; i++) {
          if (i === stmts.length - 1 && stmts[i].kind === 'ExprStmt') {
            genExpr(stmts[i].expr);
          } else {
            genStmt(stmts[i]);
          }
        }
        return;
      }
      case 'Cast':
        genExpr(node.expr);
        emitCast(node.expr.type, node.type);
        return;
      case 'Unary': {
        genExpr(node.expr);
        const ty = node.type;
        if (node.op === '+') {
          emitCast(node.expr.type, ty);
          return;
        }
        if (node.op === '-') {
          emitCast(node.expr.type, ty);
          if (ty.kind === T.TK.FLOAT) {
            emitLoadConst('R3', 0x80000000);
            emit(`  BXOR R0, R0, R3`);
          } else if (ty.kind === T.TK.DOUBLE) {
            emitLoadConst('R3', 0x80000000);
            emit(`  BXOR R1, R1, R3`);
          } else if (ty.kind === T.TK.LLONG) {
            emit(`  MOV R2, R0`);
            emit(`  MOV R3, R1`);
            emit(`  LI R0, 0`);
            emit(`  LI R1, 0`);
            emit(`  BSUB R0, R0, R2`);
            emit(`  BSBC R1, R1, R3`);
          } else {
            emit(`  NEG R0, R0`);
            emit(`  ${ty.unsigned ? 'WRAPU' : 'WRAPS'} R0, R0, 32`);
          }
          return;
        }
        if (node.op === '~') {
          emitCast(node.expr.type, ty);
          if (ty.kind === T.TK.LLONG) {
            emit(`  BNOT R0, R0`);
            emit(`  BNOT R1, R1`);
          } else {
            emit(`  BNOT R0, R0`);
            emit(`  ${ty.unsigned ? 'WRAPU' : 'WRAPS'} R0, R0, 32`);
          }
          return;
        }
        if (node.op === '!') {
          emitTestTruth(node.expr.type);
          const lblT = newLabel('nt'), lblE = newLabel('ne');
          emit(`  JZX ${lblT}`);
          emit(`  LI R0, 0`);
          emit(`  JMPX ${lblE}`);
          emit(`${lblT}:`);
          emit(`  LI R0, 1`);
          emit(`${lblE}:`);
          return;
        }
        throw new Error(`Unhandled unary op '${node.op}'`);
      }
      case 'PreIncDec':
      case 'PostIncDec':
        break;
      case 'Assign': {
        const lhs = node.left;
        const lhsTy = T.unqualType(lhs.type);
        const isBf = lhs.kind === 'Member' && lhs.field.bitWidth !== null && lhs.field.bitWidth !== undefined;

        if (node.op === '=') {
          if (T.isAggregate(lhsTy)) {
            genAddr(lhs);
            emit(`  PUSH R0`);
            genAddr(node.right);
            emit(`  MOV R1, R0`);
            emit(`  POP R0`);
            emitMemCopy('R0', 'R1', lhsTy.size);
            return;
          }
          genAddr(lhs);
          emit(`  PUSH R0`);
          genExpr(node.right);
          emitCast(node.right.type, lhsTy);
          if (isBf) {
            emitBitfieldStore(lhs.field);
          } else {
            emit(`  POP R2`);
            emitStore(lhsTy, 'R2', 0, lhs.type.isVolatile);
          }
          return;
        }

        // Compound assignment: lhs op= rhs
        const baseOp = node.op.slice(0, -1);
        genAddr(lhs);
        emit(`  PUSH R0`); // save addr
        if (isBf) {
          emitBitfieldLoad(lhs.field);
        } else {
          emit(`  MOV R2, R0`);
          emitLoad(lhsTy, 'R2', 0, lhs.type.isVolatile);
        }
        // Evaluate binary op between lhs (currently in R0/R1) and rhs
        let opTy;
        if ((baseOp === '+' || baseOp === '-') && lhsTy.kind === T.TK.PTR) {
          opTy = lhsTy;
        } else if (baseOp === '<<' || baseOp === '>>') {
          opTy = T.integerPromote(lhsTy);
        } else {
          opTy = T.usualArithConv(lhsTy, node.right.type);
        }
        emitCast(lhsTy, opTy);
        if (T.is64Bit(opTy)) { emit(`  PUSH R0`); emit(`  PUSH R1`); }
        else emit(`  PUSH R0`);
        genExpr(node.right);
        if ((baseOp === '+' || baseOp === '-') && opTy.kind === T.TK.PTR) {
          emitCast(node.right.type, T.TY_LONG);
          const elemSz = Math.max(opTy.base.size, 1);
          if (elemSz > 1) {
            emitLoadConst('R3', elemSz);
            emit(`  BMULLO R0, R0, R3`);
          }
          emit(`  MOV R2, R0`);
          emit(`  POP R0`);
          emit(baseOp === '+' ? `  ADD R0, R0, R2` : `  SUB R0, R0, R2`);
          emit(`  WRAPS R0, R0, 32`);
        } else {
          emitBinaryOp(baseOp, opTy, node.right.type);
        }
        emitCast(opTy, lhsTy);
        if (isBf) {
          emitBitfieldStore(lhs.field);
        } else {
          emit(`  POP R2`);
          emitStore(lhsTy, 'R2', 0, lhs.type.isVolatile);
        }
        return;
      }
      case 'Ternary': {
        const lblElse = newLabel('te'), lblEnd = newLabel('td');
        genExpr(node.cond);
        if (!node.thenExpr) {
          // GNU a ?: b
          if (T.is64Bit(node.type)) { emit(`  PUSH R0`); emit(`  PUSH R1`); }
          else emit(`  PUSH R0`);
          emitTestTruth(node.cond.type);
          emit(`  JZX ${lblElse}`);
          if (T.is64Bit(node.type)) { emit(`  POP R1`); emit(`  POP R0`); }
          else emit(`  POP R0`);
          emitCast(node.cond.type, node.type);
          emit(`  JMPX ${lblEnd}`);
          emit(`${lblElse}:`);
          if (T.is64Bit(node.type)) { emit(`  POP R1`); emit(`  POP R0`); }
          else emit(`  POP R0`);
          genExpr(node.elseExpr);
          emitCast(node.elseExpr.type, node.type);
          emit(`${lblEnd}:`);
          return;
        }
        emitTestTruth(node.cond.type);
        emit(`  JZX ${lblElse}`);
        genExpr(node.thenExpr);
        emitCast(node.thenExpr.type, node.type);
        emit(`  JMPX ${lblEnd}`);
        emit(`${lblElse}:`);
        genExpr(node.elseExpr);
        emitCast(node.elseExpr.type, node.type);
        emit(`${lblEnd}:`);
        return;
      }
      case 'Binary': {
        const op = node.op;
        if (op === ',') {
          genExpr(node.left);
          genExpr(node.right);
          return;
        }
        if (op === '&&') {
          const lblFalse = newLabel('af'), lblEnd = newLabel('ae');
          genExpr(node.left);
          emitTestTruth(node.left.type);
          emit(`  JZX ${lblFalse}`);
          genExpr(node.right);
          emitTestTruth(node.right.type);
          emit(`  JZX ${lblFalse}`);
          emit(`  LI R0, 1`);
          emit(`  JMPX ${lblEnd}`);
          emit(`${lblFalse}:`);
          emit(`  LI R0, 0`);
          emit(`${lblEnd}:`);
          return;
        }
        if (op === '||') {
          const lblTrue = newLabel('ot'), lblEnd = newLabel('oe');
          genExpr(node.left);
          emitTestTruth(node.left.type);
          emit(`  JNZX ${lblTrue}`);
          genExpr(node.right);
          emitTestTruth(node.right.type);
          emit(`  JNZX ${lblTrue}`);
          emit(`  LI R0, 0`);
          emit(`  JMPX ${lblEnd}`);
          emit(`${lblTrue}:`);
          emit(`  LI R0, 1`);
          emit(`${lblEnd}:`);
          return;
        }

        const lt = T.decayType(node.left.type);
        const rt = T.decayType(node.right.type);

        // Pointer arithmetic
        if (op === '+' && (lt.kind === T.TK.PTR || rt.kind === T.TK.PTR)) {
          const ptrNode = lt.kind === T.TK.PTR ? node.left : node.right;
          const idxNode = lt.kind === T.TK.PTR ? node.right : node.left;
          const pTy = lt.kind === T.TK.PTR ? lt : rt;
          const elemSz = Math.max(pTy.base.size, 1);
          genExpr(ptrNode);
          emit(`  PUSH R0`);
          genExpr(idxNode);
          emitCast(idxNode.type, T.TY_LONG);
          if (elemSz > 1) {
            emitLoadConst('R3', elemSz);
            emit(`  BMULLO R0, R0, R3`);
          }
          emit(`  MOV R2, R0`);
          emit(`  POP R0`);
          emit(`  ADD R0, R0, R2`);
          emit(`  WRAPS R0, R0, 32`);
          return;
        }
        if (op === '-' && lt.kind === T.TK.PTR && rt.kind === T.TK.PTR) {
          const elemSz = Math.max(lt.base.size, 1);
          genExpr(node.left);
          emit(`  PUSH R0`);
          genExpr(node.right);
          emit(`  MOV R2, R0`);
          emit(`  POP R0`);
          emit(`  SUB R0, R0, R2`);
          if (elemSz > 1) {
            emitLoadConst('R3', elemSz);
            emit(`  DIV R0, R0, R3`);
          }
          emit(`  WRAPS R0, R0, 32`);
          return;
        }
        if (op === '-' && lt.kind === T.TK.PTR) {
          const elemSz = Math.max(lt.base.size, 1);
          genExpr(node.left);
          emit(`  PUSH R0`);
          genExpr(node.right);
          emitCast(node.right.type, T.TY_LONG);
          if (elemSz > 1) {
            emitLoadConst('R3', elemSz);
            emit(`  BMULLO R0, R0, R3`);
          }
          emit(`  MOV R2, R0`);
          emit(`  POP R0`);
          emit(`  SUB R0, R0, R2`);
          emit(`  WRAPS R0, R0, 32`);
          return;
        }

        // Comparison ops
        if (['==', '!=', '<', '<=', '>', '>='].includes(op)) {
          let cmpTy;
          if (lt.kind === T.TK.PTR || rt.kind === T.TK.PTR) {
            cmpTy = T.TY_LONG; // Signed C-space pointer comparison (ABI-5.md §5)
          } else {
            cmpTy = T.usualArithConv(lt, rt);
          }
          genExpr(node.left);
          emitCast(lt, cmpTy);
          if (T.is64Bit(cmpTy)) { emit(`  PUSH R0`); emit(`  PUSH R1`); }
          else emit(`  PUSH R0`);
          genExpr(node.right);
          emitCast(rt, cmpTy);
          emitCompare(op, cmpTy);
          return;
        }

        // Shifts
        if (op === '<<' || op === '>>') {
          const opTy = T.integerPromote(lt);
          genExpr(node.left);
          emitCast(lt, opTy);
          if (T.is64Bit(opTy)) { emit(`  PUSH R0`); emit(`  PUSH R1`); }
          else emit(`  PUSH R0`);
          genExpr(node.right);
          emitBinaryOp(op, opTy, rt);
          return;
        }

        // Arithmetic & bitwise binary ops
        const opTy = T.usualArithConv(lt, rt);
        genExpr(node.left);
        emitCast(lt, opTy);
        if (T.is64Bit(opTy)) { emit(`  PUSH R0`); emit(`  PUSH R1`); }
        else emit(`  PUSH R0`);
        genExpr(node.right);
        emitBinaryOp(op, opTy, rt);
        return;
      }
      case 'Call': {
        genCall(node);
        return;
      }
      case 'BuiltinBit': {
        genBuiltinBit(node);
        return;
      }
      case 'BuiltinAtomic': {
        genBuiltinAtomic(node);
        return;
      }
      default:
        throw new Error(`Codegen: unhandled expression kind '${node.kind}'`);
    }

    // Re-enter cleanly for PreIncDec / PostIncDec (avoiding stack ordering ambiguity)
    if (node.kind === 'PreIncDec' || node.kind === 'PostIncDec') {
      const isPost = node.kind === 'PostIncDec';
      const isInc = node.op === '++';
      const ty = node.type;
      const isBf = node.expr.kind === 'Member' && node.expr.field.bitWidth !== null && node.expr.field.bitWidth !== undefined;
      genAddr(node.expr);
      emit(`  PUSH R4`);
      emit(`  MOV R4, R0`); // R4 = address (callee-saved, preserved across calls!)
      if (isBf) {
        emitBitfieldLoad(node.expr.field);
      } else {
        emitLoad(ty, 'R4', 0, node.expr.type.isVolatile);
      }
      if (isPost) {
        if (T.is64Bit(ty)) { emit(`  PUSH R0`); emit(`  PUSH R1`); }
        else emit(`  PUSH R0`);
      }
      if (ty.kind === T.TK.PTR) {
        const step = Math.max(ty.base.size, 1);
        emitLoadConst('R3', isInc ? step : -step);
        emit(`  ADD R0, R0, R3`);
        emit(`  WRAPS R0, R0, 32`);
      } else if (ty.kind === T.TK.FLOAT) {
        emitLoadConst('R1', floatToU32(1.0));
        emit(`  CALL_SYM ${isInc ? '__t5_fadd' : '__t5_fsub'}`);
      } else if (ty.kind === T.TK.DOUBLE) {
        const [lo, hi] = doubleToU32Pair(1.0);
        emitLoadConst('R2', lo);
        emitLoadConst('R3', hi);
        emitDoubleBinCall(isInc ? '__t5_dadd' : '__t5_dsub');
      } else if (ty.kind === T.TK.LLONG) {
        emit(`  LI R2, 1`);
        emit(`  LI R3, 0`);
        if (isInc) { emit(`  BADD R0, R0, R2`); emit(`  BADC R1, R1, R3`); }
        else { emit(`  BSUB R0, R0, R2`); emit(`  BSBC R1, R1, R3`); }
      } else if (ty.kind === T.TK.BOOL) {
        if (isInc) emit(`  LI R0, 1`);
        else { emit(`  SUBI R0, R0, 1`); emitCast(T.TY_INT, T.TY_BOOL); }
      } else {
        emit(isInc ? `  ADDI R0, R0, 1` : `  SUBI R0, R0, 1`);
        emit(`  ${ty.unsigned ? 'WRAPU' : 'WRAPS'} R0, R0, ${ty.size * 8}`);
      }
      if (isBf) {
        emit(`  PUSH R4`);
        emitBitfieldStore(node.expr.field);
      } else {
        emitStore(ty, 'R4', 0, node.expr.type.isVolatile);
      }
      if (isPost) {
        if (T.is64Bit(ty)) { emit(`  POP R1`); emit(`  POP R0`); }
        else emit(`  POP R0`);
      }
      emit(`  POP R4`);
    }
  }

  // Binary op helper: left is on HW stack (pushed as R0 or R0,R1), right is in R0 (or R0,R1)
  function emitBinaryOp(op, opTy, rightRawTy) {
    if (op === '<<' || op === '>>') {
      emitCast(rightRawTy, T.TY_INT);
      if (opTy.kind === T.TK.LLONG) {
        emit(`  MOV R2, R0`);
        emit(`  POP R1`);
        emit(`  POP R0`);
        const fn = op === '<<' ? '__ashldi3' : (opTy.unsigned ? '__lshrdi3' : '__ashrdi3');
        emit(`  CALL_SYM ${fn}`);
        return;
      }
      emit(`  MOV R2, R0`);
      emit(`  POP R0`);
      if (op === '<<') {
        emit(`  BSHL R0, R0, R2`);
        emit(`  ${opTy.unsigned ? 'WRAPU' : 'WRAPS'} R0, R0, 32`);
      } else if (opTy.unsigned) {
        emit(`  BSHR R0, R0, R2`);
      } else {
        emit(`  BSAR R0, R0, R2`);
      }
      return;
    }

    emitCast(rightRawTy, opTy);

    if (opTy.kind === T.TK.FLOAT) {
      emit(`  MOV R1, R0`);
      emit(`  POP R0`);
      const fnMap = { '+': '__t5_fadd', '-': '__t5_fsub', '*': '__t5_fmul', '/': '__t5_fdiv' };
      emit(`  CALL_SYM ${fnMap[op]}`);
      return;
    }
    if (opTy.kind === T.TK.DOUBLE) {
      emit(`  MOV R2, R0`);
      emit(`  MOV R3, R1`);
      emit(`  POP R1`);
      emit(`  POP R0`);
      const fnMap = { '+': '__t5_dadd', '-': '__t5_dsub', '*': '__t5_dmul', '/': '__t5_ddiv' };
      emitDoubleBinCall(fnMap[op]);
      return;
    }
    if (opTy.kind === T.TK.LLONG) {
      emit(`  MOV R2, R0`);
      emit(`  MOV R3, R1`);
      emit(`  POP R1`);
      emit(`  POP R0`);
      if (op === '+') { emit(`  BADD R0, R0, R2`); emit(`  BADC R1, R1, R3`); return; }
      if (op === '-') { emit(`  BSUB R0, R0, R2`); emit(`  BSBC R1, R1, R3`); return; }
      if (op === '&') { emit(`  BAND R0, R0, R2`); emit(`  BAND R1, R1, R3`); return; }
      if (op === '|') { emit(`  BOR R0, R0, R2`);  emit(`  BOR R1, R1, R3`);  return; }
      if (op === '^') { emit(`  BXOR R0, R0, R2`); emit(`  BXOR R1, R1, R3`); return; }
      if (op === '*') {
        // 64x64->64 multiply using BMULLO/BMULHI (ISA-5.md §1.3)
        emit(`  PUSH R4`);
        emit(`  PUSH R5`);
        emit(`  BMULLO R4, R0, R2`); // r_lo
        emit(`  BMULHI R5, R0, R2`); // hi0
        emit(`  BMULLO R3, R0, R3`); // a_lo * b_hi
        emit(`  BADD R5, R5, R3`);
        emit(`  BMULLO R3, R1, R2`); // a_hi * b_lo
        emit(`  BADD R1, R5, R3`);   // r_hi
        emit(`  MOV R0, R4`);
        emit(`  POP R5`);
        emit(`  POP R4`);
        return;
      }
      if (op === '/') { emitI64BinCall(opTy.unsigned ? '__udivdi3' : '__divdi3'); return; }
      if (op === '%') { emitI64BinCall(opTy.unsigned ? '__umoddi3' : '__moddi3'); return; }
      throw new Error(`Unhandled 64-bit op '${op}'`);
    }

    // 32-bit integer ops
    emit(`  MOV R2, R0`);
    emit(`  POP R0`);
    const wrap = opTy.unsigned ? 'WRAPU R0, R0, 32' : 'WRAPS R0, R0, 32';
    switch (op) {
      case '+': emit(`  ADD R0, R0, R2`); emit(`  ${wrap}`); break;
      case '-': emit(`  SUB R0, R0, R2`); emit(`  ${wrap}`); break;
      case '*': emit(`  BMULLO R0, R0, R2`); if (!opTy.unsigned) emit(`  WRAPS R0, R0, 32`); break;
      case '/': emit(`  DIV R0, R0, R2`); emit(`  ${wrap}`); break;
      case '%': emit(`  MOD R0, R0, R2`); emit(`  ${wrap}`); break;
      case '&': emit(`  BAND R0, R0, R2`); if (!opTy.unsigned) emit(`  WRAPS R0, R0, 32`); break;
      case '|': emit(`  BOR R0, R0, R2`);  if (!opTy.unsigned) emit(`  WRAPS R0, R0, 32`); break;
      case '^': emit(`  BXOR R0, R0, R2`); if (!opTy.unsigned) emit(`  WRAPS R0, R0, 32`); break;
      default: throw new Error(`Unhandled 32-bit op '${op}'`);
    }
  }

  // Compare left (on HW stack) vs right (in R0 or R0,R1) -> 0 or 1 in R0
  function emitCompare(op, cmpTy) {
    if (cmpTy.kind === T.TK.FLOAT || cmpTy.kind === T.TK.DOUBLE) {
      if (cmpTy.kind === T.TK.FLOAT) {
        emit(`  MOV R1, R0`);
        emit(`  POP R0`);
        emit(`  CALL_SYM __t5_fcmp`);
      } else {
        emit(`  MOV R2, R0`);
        emit(`  MOV R3, R1`);
        emit(`  POP R1`);
        emit(`  POP R0`);
        emitDoubleBinCall('__t5_dcmp');
      }
      // __t5_fcmp / __t5_dcmp returns: -1 (a<b), 0 (a==b), 1 (a>b), 2 (unordered/NaN)
      const lblT = newLabel('ft'), lblE = newLabel('fe');
      if (op === '==') {
        emit(`  CMPI R0, 0`); emit(`  JZX ${lblT}`);
      } else if (op === '!=') {
        emit(`  CMPI R0, 0`); emit(`  JNZX ${lblT}`);
      } else if (op === '<') {
        emit(`  CMPI R0, -1`); emit(`  JZX ${lblT}`);
      } else if (op === '<=') {
        emit(`  CMPI R0, 0`); emit(`  JNPX ${lblT}`); // -1 or 0
      } else if (op === '>') {
        emit(`  CMPI R0, 1`); emit(`  JZX ${lblT}`);
      } else if (op === '>=') {
        const lblF = newLabel('ff');
        emit(`  CMPI R0, 2`); emit(`  JZX ${lblF}`);
        emit(`  CMPI R0, 0`); emit(`  JNNX ${lblT}`);
        emit(`${lblF}:`);
      }
      emit(`  LI R0, 0`);
      emit(`  JMPX ${lblE}`);
      emit(`${lblT}:`);
      emit(`  LI R0, 1`);
      emit(`${lblE}:`);
      return;
    }

    if (cmpTy.kind === T.TK.LLONG) {
      emit(`  MOV R2, R0`);
      emit(`  MOV R3, R1`);
      emit(`  POP R1`);
      emit(`  POP R0`);
      const lblT = newLabel('c64t'), lblF = newLabel('c64f'), lblE = newLabel('c64e');
      if (op === '==' || op === '!=') {
        emit(`  CMP R0, R2`);
        emit(`  JNZX ${op === '==' ? lblF : lblT}`);
        emit(`  CMP R1, R3`);
        emit(`  JNZX ${op === '==' ? lblF : lblT}`);
        emit(`  JMPX ${op === '==' ? lblT : lblF}`);
      } else {
        if (!cmpTy.unsigned) {
          emit(`  WRAPS R1, R1, 32`);
          emit(`  WRAPS R3, R3, 32`);
        }
        emit(`  CMP R1, R3`);
        if (op === '<' || op === '<=') {
          emit(`  JNX ${lblT}`);
          emit(`  JPX ${lblF}`);
        } else {
          emit(`  JPX ${lblT}`);
          emit(`  JNX ${lblF}`);
        }
        // High limbs equal -> compare low limbs unsigned!
        emit(`  CMP R0, R2`);
        if (op === '<') emit(`  JNX ${lblT}`);
        else if (op === '<=') emit(`  JNPX ${lblT}`);
        else if (op === '>') emit(`  JPX ${lblT}`);
        else if (op === '>=') emit(`  JNNX ${lblT}`);
        emit(`  JMPX ${lblF}`);
      }
      emit(`${lblT}:`);
      emit(`  LI R0, 1`);
      emit(`  JMPX ${lblE}`);
      emit(`${lblF}:`);
      emit(`  LI R0, 0`);
      emit(`${lblE}:`);
      return;
    }

    // 32-bit comparison (both signed and unsigned fit exactly in 27-trit word!)
    emit(`  MOV R2, R0`);
    emit(`  POP R0`);
    emit(`  CMP R0, R2`);
    const lblT = newLabel('ct'), lblE = newLabel('ce');
    const brMap = { '==': 'JZX', '!=': 'JNZX', '<': 'JNX', '<=': 'JNPX', '>': 'JPX', '>=': 'JNNX' };
    emit(`  ${brMap[op]} ${lblT}`);
    emit(`  LI R0, 0`);
    emit(`  JMPX ${lblE}`);
    emit(`${lblT}:`);
    emit(`  LI R0, 1`);
    emit(`${lblE}:`);
  }

  // Function call codegen (ABI-5.md §4)
  function genCall(node) {
    const ft = node.funcType;
    const isVariadic = ft.kind === T.TK.FUNC && ft.isVariadic;
    const retTy = node.type;
    const isSret = T.isAggregate(retTy);

    // If struct return, allocate caller return buffer on C stack
    let sretSize = 0;
    if (isSret) {
      sretSize = align4(Math.max(retTy.size, 4));
      if (sretSize <= ISA.TRYTE_HALF) emit(`  SUBI R8, R8, ${sretSize}`);
      else { emitLoadConst('R3', sretSize); emit(`  SUB R8, R8, R3`); }
      emit(`  PUSH R8`); // save sret pointer on HW stack
    }

    // Determine target: direct symbol or indirect function pointer
    const isDirect = node.callee.kind === 'Var' && node.callee.type.kind === T.TK.FUNC;
    if (!isDirect) {
      genExpr(node.callee);
      emit(`  SUBI R0, R0, ${BIAS}`); // convert C function pointer to machine address
      emit(`  PUSH R0`); // save machine target on HW stack
    }

    // Plan argument placement (registers R0..R2 vs C stack)
    const regPlan = []; // { reg, expr, paramTy, is64 }
    const stackPlan = []; // { off, expr, paramTy, size }
    let nextReg = isSret ? 1 : 0; // R0 reserved for sret if non-variadic struct return
    let stackOff = 0;
    if (isVariadic && isSret) {
      // Variadic + sret: sret goes at stack offset 0
      stackOff += 4;
    }

    const params = (ft.kind === T.TK.FUNC && ft.hasProto) ? ft.params : [];
    for (let i = 0; i < node.args.length; i++) {
      const arg = node.args[i];
      let pTy = i < params.length ? params[i].type : null;
      if (!pTy) {
        // Default argument promotions (C11 6.5.2.2p6)
        const dt = T.decayType(T.unqualType(arg.type));
        if (dt.kind === T.TK.FLOAT) pTy = T.TY_DOUBLE;
        else if (T.isInteger(dt) && dt.size < 4) pTy = T.TY_INT;
        else pTy = dt;
      }

      if (isVariadic || T.isAggregate(pTy)) {
        const sz = align4(Math.max(pTy.size, 4));
        stackPlan.push({ off: stackOff, expr: arg, paramTy: pTy, size: pTy.size });
        stackOff += sz;
      } else if (T.is64Bit(pTy)) {
        if (nextReg + 2 <= 3) {
          regPlan.push({ reg: nextReg, expr: arg, paramTy: pTy, is64: true });
          nextReg += 2;
        } else {
          stackPlan.push({ off: stackOff, expr: arg, paramTy: pTy, size: 8 });
          stackOff += 8;
        }
      } else {
        if (nextReg < 3) {
          regPlan.push({ reg: nextReg, expr: arg, paramTy: pTy, is64: false });
          nextReg += 1;
        } else {
          stackPlan.push({ off: stackOff, expr: arg, paramTy: pTy, size: 4 });
          stackOff += 4;
        }
      }
    }

    // Allocate outgoing C stack argument area
    if (stackOff > 0) {
      if (stackOff <= ISA.TRYTE_HALF) emit(`  SUBI R8, R8, ${stackOff}`);
      else { emitLoadConst('R3', stackOff); emit(`  SUB R8, R8, R3`); }
    }

    // Evaluate and store stack arguments
    for (const sp of stackPlan) {
      if (T.isAggregate(sp.paramTy)) {
        genAddr(sp.expr);
        emit(`  MOV R1, R0`);
        if (sp.off === 0) emit(`  MOV R0, R8`);
        else { emitLoadConst('R3', sp.off); emit(`  ADD R0, R8, R3`); }
        emitMemCopy('R0', 'R1', sp.size);
      } else {
        genExpr(sp.expr);
        emitCast(sp.expr.type, sp.paramTy);
        emitStore(sp.paramTy, 'R8', sp.off);
      }
    }

    // Evaluate register arguments onto HW stack, then pop into R0..R2
    for (const rp of regPlan) {
      genExpr(rp.expr);
      emitCast(rp.expr.type, rp.paramTy);
      if (rp.is64) { emit(`  PUSH R0`); emit(`  PUSH R1`); }
      else emit(`  PUSH R0`);
    }
    for (let i = regPlan.length - 1; i >= 0; i--) {
      const rp = regPlan[i];
      if (rp.is64) {
        emit(`  POP R${rp.reg + 1}`);
        emit(`  POP R${rp.reg}`);
      } else {
        emit(`  POP R${rp.reg}`);
      }
    }

    // Pop indirect target if needed
    if (!isDirect) {
      emit(`  POP R3`);
    }

    // Handle sret pointer
    if (isSret) {
      // Peek/pop sret pointer (it is at top of HW stack now)
      if (isVariadic) {
        emit(`  POP R2`); // wait: don't clobber R2 if non-variadic! In variadic, R0..R2 are unused.
        emit(`  PUSH R2`); // keep sret ptr for after call
        emit(`  PUSH R0`);
        emit(`  MOV R0, R2`);
        emitStore(T.ptrTo(T.TY_VOID), 'R8', 0);
        emit(`  POP R0`);
      } else {
        emit(`  POP R0`);
        emit(`  PUSH R0`); // keep for after call? Actually callee returns sret in R0!
      }
    }

    if (isDirect) {
      const symName = node.callee.symbol.asmName || node.callee.name;
      emit(`  CALL_SYM ${symName}`);
    } else {
      emit(`  CALLX 2`);
      emit(`  JMPX 2`);
      emit(`  JR R3`);
    }

    // Clean up outgoing C stack args
    if (stackOff > 0) {
      if (stackOff <= ISA.TRYTE_HALF) emit(`  ADDI R8, R8, ${stackOff}`);
      else { emitLoadConst('R3', stackOff); emit(`  ADD R8, R8, R3`); }
    }
    if (isSret) {
      emit(`  POP R0`); // return C-space pointer to struct buffer
    }
  }

  // GNU bit builtins
  function genBuiltinBit(node) {
    const nm = node.name;
    genExpr(node.arg);
    if (nm === '__builtin_bswap16') {
      emit(`  WRAPU R0, R0, 16`);
      emit(`  LI R3, 8`);
      emit(`  BSHR R2, R0, R3`);
      emit(`  WRAPU R0, R0, 8`);
      emit(`  BSHL R0, R0, R3`);
      emit(`  BOR R0, R0, R2`);
      emit(`  WRAPU R0, R0, 16`);
      return;
    }
    if (nm === '__builtin_bswap32') {
      emit(`  CALL_SYM __t5_bswap32`);
      return;
    }
    if (nm === '__builtin_bswap64') {
      emit(`  CALL_SYM __t5_bswap64`);
      return;
    }
    if (nm === '__builtin_clz' || nm === '__builtin_clzl') { emit(`  CALL_SYM __t5_clz32`); return; }
    if (nm === '__builtin_clzll') { emit(`  CALL_SYM __t5_clz64`); return; }
    if (nm === '__builtin_ctz' || nm === '__builtin_ctzl') { emit(`  CALL_SYM __t5_ctz32`); return; }
    if (nm === '__builtin_ctzll') { emit(`  CALL_SYM __t5_ctz64`); return; }
    if (nm === '__builtin_popcount' || nm === '__builtin_popcountl') { emit(`  CALL_SYM __t5_popcount32`); return; }
    if (nm === '__builtin_popcountll') { emit(`  CALL_SYM __t5_popcount64`); return; }
    throw new Error(`Unhandled bit builtin '${nm}'`);
  }

  // GNU __sync_* and __atomic_* builtins on Triton 5 stage-1 CAS (+71)
  function genBuiltinAtomic(node) {
    const nm = node.name;
    const args = node.args;
    if (nm === '__sync_synchronize' || nm === '__atomic_thread_fence') {
      emit(`  NOP ; memory barrier`);
      return;
    }
    if (nm === '__sync_lock_release') {
      genExpr(args[0]);
      emit(`  MOV R2, R0`);
      emit(`  LI R0, 0`);
      emitStore(args[0].type.base, 'R2', 0, true);
      return;
    }
    if (nm === '__atomic_load_n') {
      genExpr(args[0]);
      emit(`  MOV R2, R0`);
      emitLoad(args[0].type.base, 'R2', 0, true);
      return;
    }
    if (nm === '__atomic_store_n') {
      genExpr(args[0]);
      emit(`  PUSH R0`);
      genExpr(args[1]);
      emitCast(args[1].type, args[0].type.base);
      emit(`  POP R2`);
      emitStore(args[0].type.base, 'R2', 0, true);
      return;
    }
    if (nm === '__sync_val_compare_and_swap' || nm === '__sync_bool_compare_and_swap') {
      // (ptr, oldval, newval) -> __t5_cas32(ptr, old, new)
      genExpr(args[0]); emit(`  PUSH R0`);
      genExpr(args[1]); emitCast(args[1].type, T.TY_UINT); emit(`  PUSH R0`);
      genExpr(args[2]); emitCast(args[2].type, T.TY_UINT); emit(`  MOV R2, R0`);
      emit(`  POP R1`);
      emit(`  POP R0`);
      emit(`  CALL_SYM ${nm === '__sync_bool_compare_and_swap' ? '__t5_cas32_bool' : '__t5_cas32_val'}`);
      return;
    }
    if (nm === '__atomic_compare_exchange_n') {
      // (ptr, expected_ptr, desired, weak, succ_mo, fail_mo)
      genExpr(args[0]); emit(`  PUSH R0`);
      genExpr(args[1]); emit(`  PUSH R0`);
      genExpr(args[2]); emitCast(args[2].type, T.TY_UINT); emit(`  MOV R2, R0`);
      emit(`  POP R1`);
      emit(`  POP R0`);
      emit(`  CALL_SYM __t5_atomic_cmpxchg32`);
      return;
    }
    if (nm === '__sync_lock_test_and_set' || nm === '__atomic_exchange_n') {
      genExpr(args[0]); emit(`  PUSH R0`);
      genExpr(args[1]); emitCast(args[1].type, T.TY_UINT); emit(`  MOV R1, R0`);
      emit(`  POP R0`);
      emit(`  CALL_SYM __t5_atomic_xchg32`);
      return;
    }
    const fetchOps = {
      '__sync_fetch_and_add': '__t5_atomic_fetch_add32',
      '__atomic_fetch_add':   '__t5_atomic_fetch_add32',
      '__sync_add_and_fetch': '__t5_atomic_add_fetch32',
      '__sync_fetch_and_sub': '__t5_atomic_fetch_sub32',
      '__atomic_fetch_sub':   '__t5_atomic_fetch_sub32',
      '__sync_sub_and_fetch': '__t5_atomic_sub_fetch32',
      '__sync_fetch_and_and': '__t5_atomic_fetch_and32',
      '__atomic_fetch_and':   '__t5_atomic_fetch_and32',
      '__sync_fetch_and_or':  '__t5_atomic_fetch_or32',
      '__atomic_fetch_or':    '__t5_atomic_fetch_or32',
      '__sync_fetch_and_xor': '__t5_atomic_fetch_xor32',
      '__atomic_fetch_xor':   '__t5_atomic_fetch_xor32'
    };
    if (fetchOps[nm]) {
      genExpr(args[0]); emit(`  PUSH R0`);
      genExpr(args[1]); emitCast(args[1].type, T.TY_UINT); emit(`  MOV R1, R0`);
      emit(`  POP R0`);
      emit(`  CALL_SYM ${fetchOps[nm]}`);
      return;
    }
    throw new Error(`Unhandled atomic builtin '${nm}'`);
  }

  // Inline assembly codegen
  function genAsmStmt(node) {
    // Allocate registers R0..R6 for operands
    const ops = [...node.outputs, ...node.inputs];
    const opRegs = [];
    const usedRegs = [];
    const avail = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6'];
    let regCursor = 0;

    // Save callee-saved regs if we borrow R4..R6
    for (let i = 0; i < ops.length; i++) {
      const c = ops[i].constraint;
      if (c.includes('i') || c.includes('n')) {
        opRegs.push(String(ast.evalConstExpr(ops[i].expr)));
      } else {
        const r = avail[regCursor++];
        opRegs.push(r);
        if (['R4', 'R5', 'R6'].includes(r)) usedRegs.push(r);
      }
    }
    for (const r of usedRegs) emit(`  PUSH ${r}`);

    // Load input operands (and '+' read-write outputs) into their assigned registers
    for (let i = 0; i < ops.length; i++) {
      const isOut = i < node.outputs.length;
      const c = ops[i].constraint;
      if (c.includes('i') || c.includes('n')) continue;
      if (!isOut || c.includes('+')) {
        genExpr(ops[i].expr);
        emit(`  PUSH R0`);
      }
    }
    // Pop in reverse order into assigned registers
    for (let i = ops.length - 1; i >= 0; i--) {
      const isOut = i < node.outputs.length;
      const c = ops[i].constraint;
      if (c.includes('i') || c.includes('n')) continue;
      if (!isOut || c.includes('+')) {
        emit(`  POP ${opRegs[i]}`);
      }
    }

    // Substitute %0, %1, %[name] in template
    let rendered = node.template.replace(/%%|%(\d+)|%\[([A-Za-z_][A-Za-z0-9_]*)\]/g, (m, idxStr, sym) => {
      if (m === '%%') return '%';
      if (idxStr !== undefined) return opRegs[parseInt(idxStr, 10)];
      const idx = ops.findIndex(o => o.name === sym);
      if (idx >= 0) return opRegs[idx];
      return m;
    });
    for (const asmLine of rendered.split(/[;\n]/)) {
      const t = asmLine.trim();
      if (t) emit(`  ${t} ; inline-asm`);
    }

    // Store output operands back to their C lvalues
    for (let i = 0; i < node.outputs.length; i++) {
      const r = opRegs[i];
      emit(`  PUSH ${r}`);
    }
    for (let i = node.outputs.length - 1; i >= 0; i--) {
      const out = node.outputs[i];
      genAddr(out.expr);
      emit(`  MOV R2, R0`);
      emit(`  POP R0`);
      emitStore(out.expr.type, 'R2', 0, true);
    }

    for (let i = usedRegs.length - 1; i >= 0; i--) emit(`  POP ${usedRegs[i]}`);
  }

  // Local initializer codegen (supports scalars, arrays, structs, unions, designated initializers)
  function genLocalInit(ty, baseReg, baseOff, init) {
    if (!init) return;
    if (init.kind === 'StrLit' && ty.kind === T.TK.ARRAY && ty.base.kind === T.TK.CHAR) {
      const lbl = addStringLit(init.bytes);
      emit(`  LA R1, ${lbl}`);
      emitLoadConst('R3', baseOff);
      emit(`  ADD R0, ${baseReg}, R3`);
      const copyLen = Math.min(init.bytes.length + 1, ty.size);
      emitMemCopy('R0', 'R1', copyLen);
      if (ty.size > copyLen) {
        emitLoadConst('R3', baseOff + copyLen);
        emit(`  ADD R0, ${baseReg}, R3`);
        emitMemZero('R0', ty.size - copyLen);
      }
      return;
    }
    if (init.kind !== 'InitList') {
      if (T.isAggregate(ty)) {
        genAddr(init);
        emit(`  MOV R1, R0`);
        emitLoadConst('R3', baseOff);
        emit(`  ADD R0, ${baseReg}, R3`);
        emitMemCopy('R0', 'R1', ty.size);
      } else {
        genExpr(init);
        emitCast(init.type, ty);
        emitStore(ty, baseReg, baseOff);
      }
      return;
    }

    // Zero entire aggregate/array first (ISO C11 6.7.9p19-21)
    if (ty.size > 0) {
      emitLoadConst('R3', baseOff);
      emit(`  ADD R0, ${baseReg}, R3`);
      emitMemZero('R0', ty.size);
    }

    if (ty.kind === T.TK.ARRAY) {
      let idx = 0;
      for (const it of init.items) {
        if (it.desigs.length > 0 && it.desigs[0].kind === 'index') {
          for (let k = it.desigs[0].lo; k <= it.desigs[0].hi; k++) {
            genDesigLocalInit(ty.base, baseReg, baseOff + k * ty.base.size, it.desigs.slice(1), it.value);
          }
          idx = it.desigs[0].hi + 1;
        } else {
          genDesigLocalInit(ty.base, baseReg, baseOff + idx * ty.base.size, it.desigs, it.value);
          idx++;
        }
      }
    } else if (T.isAggregate(ty)) {
      let fi = 0;
      for (const it of init.items) {
        let field = null;
        if (it.desigs.length > 0 && it.desigs[0].kind === 'field') {
          const fname = it.desigs[0].name;
          fi = ty.fields.findIndex(f => f.name === fname);
          if (fi < 0) throw new Error(`Initializer: unknown field '${fname}'`);
          field = ty.fields[fi];
          genDesigLocalInit(field.type, baseReg, baseOff + field.offset, it.desigs.slice(1), it.value, field);
          fi++;
        } else {
          while (fi < ty.fields.length && ty.fields[fi].bitWidth === 0) fi++;
          if (fi >= ty.fields.length) break;
          field = ty.fields[fi];
          genDesigLocalInit(field.type, baseReg, baseOff + field.offset, it.desigs, it.value, field);
          fi++;
        }
      }
    } else if (init.items.length > 0) {
      genLocalInit(ty, baseReg, baseOff, init.items[0].value);
    }
  }

  function genDesigLocalInit(ty, baseReg, off, remDesigs, val, field = null) {
    if (remDesigs.length === 0) {
      if (field && field.bitWidth !== null && field.bitWidth !== undefined) {
        emitLoadConst('R3', off);
        emit(`  ADD R0, ${baseReg}, R3`);
        emit(`  PUSH R0`);
        genExpr(val);
        emitCast(val.type, field.type);
        emitBitfieldStore(field);
      } else {
        genLocalInit(ty, baseReg, off, val);
      }
      return;
    }
    const d = remDesigs[0];
    if (d.kind === 'field') {
      const f = ty.fields.find(ff => ff.name === d.name);
      if (!f) throw new Error(`Designated init: unknown field '${d.name}'`);
      genDesigLocalInit(f.type, baseReg, off + f.offset, remDesigs.slice(1), val, f);
    } else if (d.kind === 'index') {
      for (let k = d.lo; k <= d.hi; k++) {
        genDesigLocalInit(ty.base, baseReg, off + k * ty.base.size, remDesigs.slice(1), val);
      }
    }
  }

  // Statement codegen
  function genStmt(stmt) {
    switch (stmt.kind) {
      case 'EmptyStmt':
        return;
      case 'ExprStmt':
        genExpr(stmt.expr);
        return;
      case 'AsmStmt':
        genAsmStmt(stmt);
        return;
      case 'Block':
        for (const s of stmt.stmts) genStmt(s);
        return;
      case 'LocalDecl': {
        const sym = stmt.symbol;
        if (sym.isVla) {
          // Compute VLA byte size dynamically and allocate on C stack R8
          let elemSz = sym.type.base.size || 1;
          genExpr(sym.type.vlaExpr);
          emitCast(sym.type.vlaExpr.type, T.TY_ULONG);
          if (elemSz > 1) {
            emitLoadConst('R3', elemSz);
            emit(`  BMULLO R0, R0, R3`);
          }
          // Store dynamic size for sizeof(vla)
          emitStore(T.TY_ULONG, 'R7', sym.vlaSizeOffset);
          // Align up to 4 and subtract from R8
          emit(`  ADDI R0, R0, 3`);
          emitLoadConst('R3', ~3 >>> 0);
          emit(`  BAND R0, R0, R3`);
          emit(`  SUB R8, R8, R0`);
          emit(`  MOV R0, R8`);
          emitStore(T.ptrTo(T.TY_VOID), 'R7', sym.offset);
        } else if (stmt.init) {
          genLocalInit(sym.type, 'R7', sym.offset, stmt.init);
        }
        return;
      }
      case 'IfStmt': {
        const lblElse = newLabel('ie'), lblEnd = newLabel('id');
        genExpr(stmt.cond);
        emitTestTruth(stmt.cond.type);
        emit(`  JZX ${stmt.elseStmt ? lblElse : lblEnd}`);
        genStmt(stmt.thenStmt);
        if (stmt.elseStmt) {
          emit(`  JMPX ${lblEnd}`);
          emit(`${lblElse}:`);
          genStmt(stmt.elseStmt);
        }
        emit(`${lblEnd}:`);
        return;
      }
      case 'WhileStmt': {
        const lblTop = newLabel('wt'), lblEnd = newLabel('we');
        breakStack.push(lblEnd);
        continueStack.push(lblTop);
        emit(`${lblTop}:`);
        genExpr(stmt.cond);
        emitTestTruth(stmt.cond.type);
        emit(`  JZX ${lblEnd}`);
        genStmt(stmt.body);
        emit(`  JMPX ${lblTop}`);
        emit(`${lblEnd}:`);
        breakStack.pop();
        continueStack.pop();
        return;
      }
      case 'DoWhileStmt': {
        const lblTop = newLabel('dt'), lblCont = newLabel('dc'), lblEnd = newLabel('de');
        breakStack.push(lblEnd);
        continueStack.push(lblCont);
        emit(`${lblTop}:`);
        genStmt(stmt.body);
        emit(`${lblCont}:`);
        genExpr(stmt.cond);
        emitTestTruth(stmt.cond.type);
        emit(`  JNZX ${lblTop}`);
        emit(`${lblEnd}:`);
        breakStack.pop();
        continueStack.pop();
        return;
      }
      case 'ForStmt': {
        const lblTop = newLabel('ft'), lblCont = newLabel('fc'), lblEnd = newLabel('fe');
        if (stmt.init) {
          if (stmt.init.kind === 'ForDecls') {
            for (const d of stmt.init.decls) genStmt(d);
          } else {
            genExpr(stmt.init);
          }
        }
        breakStack.push(lblEnd);
        continueStack.push(lblCont);
        emit(`${lblTop}:`);
        if (stmt.cond) {
          genExpr(stmt.cond);
          emitTestTruth(stmt.cond.type);
          emit(`  JZX ${lblEnd}`);
        }
        genStmt(stmt.body);
        emit(`${lblCont}:`);
        if (stmt.step) genExpr(stmt.step);
        emit(`  JMPX ${lblTop}`);
        emit(`${lblEnd}:`);
        breakStack.pop();
        continueStack.pop();
        return;
      }
      case 'SwitchStmt': {
        const lblEnd = newLabel('swe');
        const sw = { cases: [], defaultLbl: null, endLbl: lblEnd };
        // Pre-scan body for CaseStmt / DefaultStmt (not crossing nested SwitchStmt)
        function collectCases(s) {
          if (!s || s.kind === 'SwitchStmt') return;
          if (s.kind === 'CaseStmt') {
            s._lbl = newLabel('swc');
            sw.cases.push({ lo: s.lo, hi: s.hi, lbl: s._lbl });
            collectCases(s.stmt);
          } else if (s.kind === 'DefaultStmt') {
            s._lbl = newLabel('swd');
            sw.defaultLbl = s._lbl;
            collectCases(s.stmt);
          } else if (s.kind === 'Block') {
            for (const st of s.stmts) collectCases(st);
          } else if (s.kind === 'IfStmt') {
            collectCases(s.thenStmt); collectCases(s.elseStmt);
          } else if (s.kind === 'WhileStmt' || s.kind === 'DoWhileStmt' || s.kind === 'ForStmt') {
            collectCases(s.body);
          } else if (s.kind === 'LabelStmt') {
            collectCases(s.stmt);
          }
        }
        collectCases(stmt.body);
        genExpr(stmt.cond);
        const is64 = stmt.cond.type.kind === T.TK.LLONG;
        for (const c of sw.cases) {
          if (c.lo === c.hi) {
            if (is64) {
              const u = BigInt.asUintN(64, c.lo);
              const skip = newLabel('sws');
              emitLoadConst('R3', Number(u & 0xFFFFFFFFn));
              emit(`  CMP R0, R3`);
              emit(`  JNZX ${skip}`);
              emitLoadConst('R3', Number((u >> 32n) & 0xFFFFFFFFn));
              emit(`  CMP R1, R3`);
              emit(`  JZX ${c.lbl}`);
              emit(`${skip}:`);
            } else {
              const v = stmt.cond.type.unsigned ? Number(BigInt.asUintN(32, c.lo)) : Number(BigInt.asIntN(32, c.lo));
              emitLoadConst('R3', v);
              emit(`  CMP R0, R3`);
              emit(`  JZX ${c.lbl}`);
            }
          } else {
            const skip = newLabel('swr');
            emitLoadConst('R3', Number(c.lo));
            emit(`  CMP R0, R3`);
            emit(`  JNX ${skip}`);
            emitLoadConst('R3', Number(c.hi));
            emit(`  CMP R0, R3`);
            emit(`  JNPX ${c.lbl}`);
            emit(`${skip}:`);
          }
        }
        emit(`  JMPX ${sw.defaultLbl || lblEnd}`);
        breakStack.push(lblEnd);
        switchStack.push(sw);
        genStmt(stmt.body);
        switchStack.pop();
        breakStack.pop();
        emit(`${lblEnd}:`);
        return;
      }
      case 'CaseStmt':
      case 'DefaultStmt':
        emit(`${stmt._lbl}:`);
        genStmt(stmt.stmt);
        return;
      case 'BreakStmt':
        emit(`  JMPX ${breakStack[breakStack.length - 1]}`);
        return;
      case 'ContinueStmt':
        emit(`  JMPX ${continueStack[continueStack.length - 1]}`);
        return;
      case 'LabelStmt':
        emit(`${getUserLabel(stmt.label)}:`);
        genStmt(stmt.stmt);
        return;
      case 'GotoStmt':
        emit(`  JMPX ${getUserLabel(stmt.label)}`);
        return;
      case 'ComputedGotoStmt':
        genExpr(stmt.expr);
        emit(`  SUBI R0, R0, ${BIAS}`);
        emit(`  JR R0`);
        return;
      case 'ReturnStmt': {
        const retTy = curFunc.type.ret;
        if (stmt.expr) {
          if (T.isAggregate(retTy)) {
            genAddr(stmt.expr);
            emit(`  MOV R1, R0`);
            emitLoad(T.ptrTo(T.TY_VOID), 'R7', curFunc.sretOffset);
            emitMemCopy('R0', 'R1', retTy.size);
          } else {
            genExpr(stmt.expr);
            emitCast(stmt.expr.type, retTy);
          }
        }
        emit(`  JMP_SYM ${curFunc.epilogueLabel}`);
        return;
      }
      default:
        throw new Error(`Codegen: unhandled stmt '${stmt.kind}'`);
    }
  }

  // Emit static/global variable initializer into .data / .rodata / .bss
  function emitGlobalVar(sym) {
    const ty = sym.type;
    const name = sym.asmName || sym.name;
    const attrs = sym.attrs || {};
    let targetSec = null;
    if (attrs.section) {
      if (!customSections.has(attrs.section)) customSections.set(attrs.section, []);
      targetSec = customSections.get(attrs.section);
    }
    const isBss = !sym.init && !attrs.section;
    const buf = targetSec || (isBss ? bssLines : (ty.isConst ? rodataLines : dataLines));

    if (sym.storage !== 'static') {
      buf.push(attrs.weak ? `.weak ${name}` : `.globl ${name}`);
    }
    if (ty.align > 1) buf.push(`.align ${ty.align}`);
    buf.push(`${name}:`);

    if (isBss) {
      buf.push(`  .zero ${Math.max(ty.size, 1)}`);
      return;
    }
    if (!sym.init) {
      buf.push(`  .zero ${Math.max(ty.size, 1)}`);
      return;
    }

    // Flatten static initializer into a byte array + symbolic relocations
    const size = Math.max(ty.size, 1);
    const bytes = new Uint8Array(size);
    const symRelocs = new Map(); // offset -> { sym, addend }

    function fillStatic(t, off, init, field = null) {
      if (!init) return;
      if (init.kind === 'StrLit') {
        if (t.kind === T.TK.ARRAY && t.base.kind === T.TK.CHAR) {
          for (let i = 0; i < init.bytes.length && off + i < size; i++) {
            bytes[off + i] = init.bytes[i];
          }
          return;
        }
        if (t.kind === T.TK.PTR) {
          const lbl = addStringLit(init.bytes);
          symRelocs.set(off, { sym: lbl, addend: 0 });
          return;
        }
      }
      if (init.kind === 'InitList') {
        if (t.kind === T.TK.ARRAY) {
          let idx = 0;
          for (const it of init.items) {
            if (it.desigs.length > 0 && it.desigs[0].kind === 'index') {
              for (let k = it.desigs[0].lo; k <= it.desigs[0].hi; k++) {
                fillDesigStatic(t.base, off + k * t.base.size, it.desigs.slice(1), it.value);
              }
              idx = it.desigs[0].hi + 1;
            } else {
              fillDesigStatic(t.base, off + idx * t.base.size, it.desigs, it.value);
              idx++;
            }
          }
          return;
        }
        if (T.isAggregate(t)) {
          let fi = 0;
          for (const it of init.items) {
            if (it.desigs.length > 0 && it.desigs[0].kind === 'field') {
              const fname = it.desigs[0].name;
              fi = t.fields.findIndex(f => f.name === fname);
              if (fi < 0) throw new Error(`Static init: unknown field '${fname}'`);
              const f = t.fields[fi];
              fillDesigStatic(f.type, off + f.offset, it.desigs.slice(1), it.value, f);
              fi++;
            } else {
              while (fi < t.fields.length && t.fields[fi].bitWidth === 0) fi++;
              if (fi >= t.fields.length) break;
              const f = t.fields[fi];
              fillDesigStatic(f.type, off + f.offset, it.desigs, it.value, f);
              fi++;
            }
          }
          return;
        }
        if (init.items.length > 0) fillStatic(t, off, init.items[0].value);
        return;
      }

      // Scalar static initializer: check address constant first
      const addrConst = tryEvalAddrConst(init);
      if (addrConst) {
        symRelocs.set(off, addrConst);
        return;
      }

      if (t.kind === T.TK.FLOAT) {
        const val = evalFloatConst(init);
        const u = floatToU32(val);
        bytes[off] = u & 0xFF; bytes[off + 1] = (u >>> 8) & 0xFF;
        bytes[off + 2] = (u >>> 16) & 0xFF; bytes[off + 3] = (u >>> 24) & 0xFF;
        return;
      }
      if (t.kind === T.TK.DOUBLE) {
        const val = evalFloatConst(init);
        const [lo, hi] = doubleToU32Pair(val);
        bytes[off] = lo & 0xFF; bytes[off + 1] = (lo >>> 8) & 0xFF;
        bytes[off + 2] = (lo >>> 16) & 0xFF; bytes[off + 3] = (lo >>> 24) & 0xFF;
        bytes[off + 4] = hi & 0xFF; bytes[off + 5] = (hi >>> 8) & 0xFF;
        bytes[off + 6] = (hi >>> 16) & 0xFF; bytes[off + 7] = (hi >>> 24) & 0xFF;
        return;
      }

      const v = ast.evalConstExpr(init);
      if (field && field.bitWidth !== null && field.bitWidth !== undefined) {
        const bw = field.bitWidth;
        const bo = field.bitOffset;
        const mask = (1n << BigInt(bw)) - 1n;
        const bits = (v & mask) << BigInt(bo);
        const nb = Math.ceil((bo + bw) / 8);
        for (let k = 0; k < nb && off + k < size; k++) {
          bytes[off + k] |= Number((bits >> BigInt(k * 8)) & 0xFFn);
        }
        return;
      }
      const u = BigInt.asUintN(t.size * 8, v);
      for (let k = 0; k < t.size && off + k < size; k++) {
        bytes[off + k] = Number((u >> BigInt(k * 8)) & 0xFFn);
      }
    }

    function fillDesigStatic(t, off, rem, val, field = null) {
      if (rem.length === 0) { fillStatic(t, off, val, field); return; }
      const d = rem[0];
      if (d.kind === 'field') {
        const f = t.fields.find(ff => ff.name === d.name);
        fillDesigStatic(f.type, off + f.offset, rem.slice(1), val, f);
      } else {
        for (let k = d.lo; k <= d.hi; k++) {
          fillDesigStatic(t.base, off + k * t.base.size, rem.slice(1), val);
        }
      }
    }

    function evalFloatConst(n) {
      if (n.kind === 'FloatLit') return n.value;
      if (n.kind === 'IntLit') return Number(n.value);
      if (n.kind === 'Cast') return evalFloatConst(n.expr);
      if (n.kind === 'Unary' && n.op === '-') return -evalFloatConst(n.expr);
      if (n.kind === 'Unary' && n.op === '+') return evalFloatConst(n.expr);
      return Number(ast.evalConstExpr(n));
    }

    function tryEvalAddrConst(n) {
      if (n.kind === 'Cast') return tryEvalAddrConst(n.expr);
      if (n.kind === 'StrLit') {
        const lbl = addStringLit(n.bytes);
        return { sym: lbl, addend: 0 };
      }
      if (n.kind === 'Var' && n.symbol.isGlobal && (n.type.kind === T.TK.ARRAY || n.type.kind === T.TK.FUNC)) {
        return { sym: n.symbol.asmName || n.name, addend: 0 };
      }
      if (n.kind === 'AddrOf') {
        if (n.expr.kind === 'Var' && n.expr.symbol.isGlobal) {
          return { sym: n.expr.symbol.asmName || n.expr.name, addend: 0 };
        }
        if (n.expr.kind === 'Member') {
          const base = tryEvalAddrConst({ kind: 'AddrOf', expr: n.expr.object });
          if (base) return { sym: base.sym, addend: base.addend + n.expr.offset };
        }
      }
      if (n.kind === 'Binary' && (n.op === '+' || n.op === '-')) {
        const l = tryEvalAddrConst(n.left);
        if (l) {
          const elemSz = (n.left.type.kind === T.TK.PTR || n.left.type.kind === T.TK.ARRAY)
            ? Math.max(n.left.type.base.size, 1) : 1;
          const off = Number(ast.evalConstExpr(n.right)) * elemSz;
          return { sym: l.sym, addend: l.addend + (n.op === '-' ? -off : off) };
        }
      }
      return null;
    }

    fillStatic(ty, 0, sym.init);

    let i = 0;
    while (i < size) {
      if (symRelocs.has(i)) {
        const r = symRelocs.get(i);
        const expr = r.addend === 0 ? r.sym : (r.addend > 0 ? `${r.sym} + ${r.addend}` : `${r.sym} - ${-r.addend}`);
        buf.push(`  .caddr32 ${expr}`);
        i += 4;
      } else {
        const chunk = [];
        while (i < size && !symRelocs.has(i) && chunk.length < 16) {
          chunk.push(bytes[i++]);
        }
        buf.push(`  .byte ${chunk.join(', ')}`);
      }
    }
  }

  // Emit function definition
  function emitFuncDef(fn) {
    curFunc = fn;
    funcLabelMap = new Map();
    fn.epilogueLabel = `.EP_${fn.name}_${++labelCounter}`;

    const isVariadic = fn.type.isVariadic;
    const isSret = T.isAggregate(fn.type.ret);
    const attrs = fn.attrs || {};

    if (attrs.section) {
      emit(`.section "${attrs.section}"`);
    } else {
      emit(`.text`);
    }
    if (fn.symbol.storage !== 'static') {
      emit(attrs.weak ? `.weak ${fn.name}` : `.globl ${fn.name}`);
    }
    if (Object.prototype.hasOwnProperty.call(attrs, 'constructor')) {
      initArrayLines.push(`  .caddr32 ${fn.name}`);
    }
    emit(`${fn.name}:`);

    // Assign frame offsets to parameters and locals
    // Stack-passed args live at [FP + 0], [FP + 4], ...
    // Reg-passed args & locals live at [FP - off]
    let nextReg = isSret ? 1 : 0;
    let inStackOff = 0;
    let localOff = 0;
    const regParamSaves = []; // { reg, offset, type, is64 }

    if (isSret) {
      if (isVariadic) {
        fn.sretOffset = 0;
        inStackOff += 4;
      } else {
        localOff += 4;
        fn.sretOffset = -localOff;
        regParamSaves.push({ reg: 0, offset: fn.sretOffset, type: T.ptrTo(T.TY_VOID), is64: false });
      }
    }

    for (const p of fn.params) {
      if (isVariadic || T.isAggregate(p.type)) {
        p.offset = inStackOff;
        inStackOff += align4(Math.max(p.type.size, 4));
      } else if (T.is64Bit(p.type)) {
        if (nextReg + 2 <= 3) {
          localOff = align4(localOff + 8);
          p.offset = -localOff;
          regParamSaves.push({ reg: nextReg, offset: p.offset, type: p.type, is64: true });
          nextReg += 2;
        } else {
          p.offset = inStackOff;
          inStackOff += 8;
        }
      } else {
        if (nextReg < 3) {
          localOff = align4(localOff + 4);
          p.offset = -localOff;
          regParamSaves.push({ reg: nextReg, offset: p.offset, type: p.type, is64: false });
          nextReg += 1;
        } else {
          p.offset = inStackOff;
          inStackOff += 4;
        }
      }
    }

    for (const loc of fn.locals) {
      if (loc.isVla) {
        localOff = align4(localOff + 4);
        loc.offset = -localOff;
        localOff = align4(localOff + 4);
        loc.vlaSizeOffset = -localOff;
      } else {
        const al = Math.max(loc.type.align || 1, 4);
        const sz = Math.max(loc.type.size, 1);
        localOff = T.alignUp(localOff + sz, al);
        loc.offset = -localOff;
      }
    }
    const frameSize = align4(localOff);

    // Prologue
    emit(`  PUSH R7`);
    emit(`  MOV R7, R8`);
    if (frameSize > 0) {
      if (frameSize <= ISA.TRYTE_HALF) emit(`  SUBI R8, R8, ${frameSize}`);
      else { emitLoadConst('R3', frameSize); emit(`  SUB R8, R8, R3`); }
    }

    // Spill register parameters into their frame slots (preserve R0..R2 while spilling)
    if (regParamSaves.length > 0) {
      // Push R0, R1, R2 only if needed — easier: spill in reverse or use R0 directly
      // Note: emitStore reads from R0 (or R0,R1)! So save R0..R2 on HW stack first
      emit(`  PUSH R2`);
      emit(`  PUSH R1`);
      emit(`  PUSH R0`);
      for (const s of regParamSaves) {
        // Reload from saved stack? Even cleaner: move from R0/R1/R2 before clobbering!
      }
      // Undo the 3 pushes above and just move cleanly:
      lines.length -= 3;
      // Save R0, R1, R2 to R4, R5, R6? Better: push R0..R2 only if >1 regParamSave
      if (regParamSaves.length === 1 && regParamSaves[0].reg === 0) {
        emitStore(regParamSaves[0].type, 'R7', regParamSaves[0].offset);
      } else {
        // Save R4..R6? No, just spill R0 first (if reg 0), then R1->R0, then R2->R0!
        // Because emitStore preserves R1 and R2 (clobbers R3 only)!
        for (const s of regParamSaves) {
          if (s.is64) {
            if (s.reg === 0) {
              emitStore(s.type, 'R7', s.offset);
            } else {
              // s.reg === 1: (R1, R2) -> move R1->R0, R2->R1
              emit(`  MOV R0, R1`);
              emit(`  MOV R1, R2`);
              emitStore(s.type, 'R7', s.offset);
            }
          } else {
            if (s.reg === 0) {
              emitStore(s.type, 'R7', s.offset);
            } else {
              emit(`  MOV R0, R${s.reg}`);
              emitStore(s.type, 'R7', s.offset);
            }
          }
        }
      }
    }

    genStmt(fn.body);

    // Default return 0 for main if falling off the end (C11 5.1.2.2.3)
    if (fn.name === 'main') {
      emit(`  LI R0, 0`);
    }

    emit(`${fn.epilogueLabel}:`);
    emit(`  MOV R8, R7`);
    emit(`  POP R7`);
    emit(`  RET`);
    curFunc = null;
  }

  // Emit all top-level declarations
  for (const decl of ast.decls) {
    if (decl.kind === 'FuncDef') emitFuncDef(decl);
    else if (decl.kind === 'GlobalVar') emitGlobalVar(decl.symbol);
    else if (decl.kind === 'AsmStmt') {
      emit(`.text`);
      emit(`  ${decl.template}`);
    }
  }

  // Assemble final output sections
  let finalLines = [...lines];
  if (rodataLines.length > 0) {
    finalLines.push('.rodata', ...rodataLines);
  }
  if (initArrayLines.length > 0) {
    finalLines.push('.init_array', ...initArrayLines);
  }
  if (dataLines.length > 0) {
    finalLines.push('.data', ...dataLines);
  }
  if (bssLines.length > 0) {
    finalLines.push('.bss', ...bssLines);
  }
  for (const [secName, secLines] of customSections.entries()) {
    finalLines.push(`.section "${secName}"`, ...secLines);
  }

  // Safe peephole optimization (-O1): NEVER touches any line tagged `; volatile` or `; inline-asm`
  if (optLevel >= 1) {
    finalLines = peepholeOptimize(finalLines);
  }

  return finalLines.join('\n') + '\n';
}

function peepholeOptimize(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    // Never touch volatile or inline-asm lines
    if (cur.includes('; volatile') || cur.includes('; inline-asm')) {
      out.push(cur);
      continue;
    }
    const next = i + 1 < lines.length ? lines[i + 1] : '';
    if (next.includes('; volatile') || next.includes('; inline-asm')) {
      out.push(cur);
      continue;
    }
    // Pattern 1: PUSH Rx ; POP Rx -> eliminate
    const mPush = /^\s*PUSH\s+(R\d+)\s*$/.exec(cur);
    if (mPush) {
      const mPop = /^\s*POP\s+(R\d+)\s*$/.exec(next);
      if (mPop) {
        if (mPush[1] === mPop[1]) { i++; continue; }
        out.push(`  MOV ${mPop[1]}, ${mPush[1]}`);
        i++; continue;
      }
    }
    // Pattern 2: MOV Rx, Rx -> eliminate
    const mMov = /^\s*MOV\s+(R\d+),\s*(R\d+)\s*$/.exec(cur);
    if (mMov && mMov[1] === mMov[2]) continue;
    // Pattern 3: ADDI Rx, Ry, 0 -> MOV Rx, Ry (or eliminate if Rx === Ry)
    const mAdd0 = /^\s*ADDI\s+(R\d+),\s*(R\d+),\s*0\s*$/.exec(cur);
    if (mAdd0) {
      if (mAdd0[1] === mAdd0[2]) continue;
      out.push(`  MOV ${mAdd0[1]}, ${mAdd0[2]}`);
      continue;
    }
    // Pattern 4: duplicate identical WRAPU/WRAPS on same reg
    const mWrap = /^\s*(WRAPU|WRAPS)\s+(R\d+),\s*(R\d+),\s*(\d+)\s*$/.exec(cur);
    if (mWrap && out.length > 0 && out[out.length - 1] === cur) continue;

    out.push(cur);
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateAsm, floatToU32, doubleToU32Pair };
}
