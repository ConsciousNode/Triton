'use strict';

/**
 * Triton 5.0 ISA Constants, Balanced-Ternary Helpers & Instruction Codec (`tcc5/isa.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Inline/Lift Note:
 * - Balanced-ternary helpers (`balRem`, `balQuot`, `numberToWord`, `wordToNumber`,
 *   `encodeInstruction`, `decodeInstruction`) lifted from `triton5.html` (stage 2 accepted).
 */

const TRYTE_MOD = 19683;              // 3^9
const TRYTE_HALF = 9841;              // (3^9 - 1) / 2
const WORD_MOD_BIG = 7625597484987n;  // 3^27
const WORD_HALF_BIG = 3812798742493n; // (3^27 - 1) / 2
const PAGE_SIZE = 2187;               // 3^7 (DECISION-PAGE-SIZE.md)
const PAGE_BIAS = 1093;               // (3^7 - 1) / 2

function balRem(n, mod, half) {
  let r = n % mod;
  if (r > half) r -= mod;
  if (r < -half) r += mod;
  return r === 0 ? 0 : r;
}

function balQuot(n, mod, half) {
  const r = balRem(n, mod, half);
  return Math.trunc((n - r) / mod);
}

function numberToWord(n) {
  const w0 = balRem(n, TRYTE_MOD, TRYTE_HALF);
  const q1 = Math.trunc((n - w0) / TRYTE_MOD);
  const w1 = balRem(q1, TRYTE_MOD, TRYTE_HALF);
  const q2 = Math.trunc((q1 - w1) / TRYTE_MOD);
  const w2 = balRem(q2, TRYTE_MOD, TRYTE_HALF);
  return [w0, w1, w2];
}

function wordToNumber(w0, w1, w2) {
  return w0 + w1 * 19683 + w2 * 387420489;
}

function encodeInstruction(op, rd, rs1, t1) {
  const ed = balRem(rd, 9, 4);
  const e1 = balRem(rs1, 9, 4);
  const tryte0 = op * 81 + ed * 9 + e1;
  const tryte1 = balRem(t1, TRYTE_MOD, TRYTE_HALF);
  return [tryte0 === 0 ? 0 : tryte0, tryte1 === 0 ? 0 : tryte1];
}

function decodeInstruction(tryte0, tryte1) {
  const e1 = balRem(tryte0, 9, 4);
  const q1 = balQuot(tryte0, 9, 4);
  const ed = balRem(q1, 9, 4);
  const op = balQuot(q1, 9, 4);
  const rs1 = (e1 + 9) % 9;
  const rd = (ed + 9) % 9;
  const e2 = balRem(tryte1, 9, 4);
  const rs2 = (e2 + 9) % 9;
  const imm9 = balRem(tryte1, TRYTE_MOD, TRYTE_HALF);
  return { op, rd, rs1, rs2, imm9 };
}

// Complete Triton 5.0 Opcode Table (89 opcodes, from ISA-5.md)
// Format kinds:
//   NONE:   op (0,0,0)
//   RD_IMM: op rd, imm9
//   RD_RS1: op rd, rs1
//   RRR:    op rd, rs1, rs2
//   RRI:    op rd, rs1, imm9
//   RS1_RS2:op rs1, rs2 (CMP)
//   RS1_IMM:op rs1, imm9 (CMPI, MTSPR)
//   RS1:    op rs1 (PUSH, JR, TLBINV)
//   RD:     op rd (POP, RDTLS)
//   IMM:    op imm9 (JMP, JN, ..., CALL, SYSCALL)
//   REL:    op target (JMPX, JNX, ..., CALLX)
const OPCODES = {
  HALT:     { op: -1,  fmt: 'NONE' },
  NOP:      { op: 0,   fmt: 'NONE' },
  LI:       { op: 1,   fmt: 'RD_IMM' },
  LUI:      { op: 2,   fmt: 'RD_IMM' },
  MOV:      { op: 3,   fmt: 'RD_RS1' },
  ADD:      { op: 4,   fmt: 'RRR' },
  ADDI:     { op: 5,   fmt: 'RRI' },
  ADC:      { op: 6,   fmt: 'RRR' },
  SUB:      { op: 7,   fmt: 'RRR' },
  SUBI:     { op: 8,   fmt: 'RRI' },
  SBC:      { op: 9,   fmt: 'RRR' },
  MUL:      { op: 10,  fmt: 'RRR' },
  MULI:     { op: 11,  fmt: 'RRI' },
  DIV:      { op: 12,  fmt: 'RRR' },
  MOD:      { op: 13,  fmt: 'RRR' },
  NEG:      { op: 14,  fmt: 'RD_RS1' },
  LT:       { op: 15,  fmt: 'RRI' },
  ST:       { op: 16,  fmt: 'RRI' },
  LW:       { op: 17,  fmt: 'RRI' },
  SW:       { op: 18,  fmt: 'RRI' },
  PUSH:     { op: 19,  fmt: 'RS1' },
  POP:      { op: 20,  fmt: 'RD' },
  JMP:      { op: 21,  fmt: 'IMM' },
  JN:       { op: 22,  fmt: 'IMM' },
  JZ:       { op: 23,  fmt: 'IMM' },
  JP:       { op: 24,  fmt: 'IMM' },
  JNZ:      { op: 25,  fmt: 'IMM' },
  JNP:      { op: 26,  fmt: 'IMM' },
  JNN:      { op: 27,  fmt: 'IMM' },
  JR:       { op: 28,  fmt: 'RS1' },
  CALL:     { op: 29,  fmt: 'IMM' },
  RET:      { op: 30,  fmt: 'NONE' },
  IN:       { op: 31,  fmt: 'RD_IMM' },
  OUT:      { op: 32,  fmt: 'RD_IMM' },
  CMP:      { op: -2,  fmt: 'RS1_RS2' },
  CMPI:     { op: -3,  fmt: 'RS1_IMM' },
  TMIN:     { op: -4,  fmt: 'RRR' },
  TMAX:     { op: -5,  fmt: 'RRR' },
  TCON:     { op: -6,  fmt: 'RRR' },
  TANY:     { op: -7,  fmt: 'RRR' },
  TXOR:     { op: -8,  fmt: 'RRR' },
  TUNARY:   { op: -9,  fmt: 'RRI' },
  SHL:      { op: -10, fmt: 'RRR' },
  SHLI:     { op: -11, fmt: 'RRI' },
  SHR:      { op: -12, fmt: 'RRR' },
  SHRI:     { op: -13, fmt: 'RRI' },
  LMI:      { op: 33,  fmt: 'RD_IMM' },
  LHI:      { op: 34,  fmt: 'RD_IMM' },
  ADDM:     { op: 35,  fmt: 'RRI' },
  ADDH:     { op: 36,  fmt: 'RRI' },
  LDX:      { op: 37,  fmt: 'RRI' },
  STX:      { op: 38,  fmt: 'RRI' },
  LWX:      { op: 39,  fmt: 'RRI' },
  SWX:      { op: 40,  fmt: 'RRI' },
  JMPX:     { op: 41,  fmt: 'REL' },
  JNX:      { op: 42,  fmt: 'REL' },
  JZX:      { op: 43,  fmt: 'REL' },
  JPX:      { op: 44,  fmt: 'REL' },
  JNZX:     { op: 45,  fmt: 'REL' },
  JNPX:     { op: 46,  fmt: 'REL' },
  JNNX:     { op: 47,  fmt: 'REL' },
  CALLX:    { op: 48,  fmt: 'REL' },
  JALR:     { op: 49,  fmt: 'RRI' },
  BCOPY:    { op: 50,  fmt: 'RRR' },
  BFILL:    { op: 51,  fmt: 'RRR' },
  SYSCALL:  { op: 52,  fmt: 'IMM' },
  IRET:     { op: 53,  fmt: 'NONE' },
  MFSPR:    { op: 54,  fmt: 'RD_IMM' },
  MTSPR:    { op: 55,  fmt: 'RS1_IMM' },
  WRAPU:    { op: 56,  fmt: 'RRI' },
  WRAPS:    { op: 57,  fmt: 'RRI' },
  BAND:     { op: 58,  fmt: 'RRR' },
  BOR:      { op: 59,  fmt: 'RRR' },
  BXOR:     { op: 60,  fmt: 'RRR' },
  BNOT:     { op: 61,  fmt: 'RD_RS1' },
  BSHL:     { op: 62,  fmt: 'RRR' },
  BSHR:     { op: 63,  fmt: 'RRR' },
  BSAR:     { op: 64,  fmt: 'RRR' },
  BADD:     { op: 65,  fmt: 'RRR' },
  BADC:     { op: 66,  fmt: 'RRR' },
  BSUB:     { op: 67,  fmt: 'RRR' },
  BSBC:     { op: 68,  fmt: 'RRR' },
  BMULLO:   { op: 69,  fmt: 'RRR' },
  BMULHI:   { op: 70,  fmt: 'RRR' },
  CAS:      { op: 71,  fmt: 'RRR' },
  WFI:      { op: 72,  fmt: 'NONE' },
  TLBFLUSH: { op: 73,  fmt: 'NONE' },
  TLBINV:   { op: 74,  fmt: 'RS1' },
  RDTLS:    { op: 75,  fmt: 'RD' }
};

const REG_ALIASES = {
  R0: 0, R1: 1, R2: 2, R3: 3, R4: 4, R5: 5, R6: 6, R7: 7, R8: 8,
  A0: 0, V0: 0, A1: 1, V1: 1, A2: 2, T0: 3, S0: 4, S1: 5, S2: 6, FP: 7, CSP: 8
};

function parseReg(tok, lineNo) {
  const k = tok.trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(REG_ALIASES, k)) return REG_ALIASES[k];
  throw new Error(`Line ${lineNo}: invalid register '${tok}'`);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TRYTE_MOD, TRYTE_HALF, WORD_MOD_BIG, WORD_HALF_BIG,
    PAGE_SIZE, PAGE_BIAS,
    balRem, balQuot, numberToWord, wordToNumber,
    encodeInstruction, decodeInstruction,
    OPCODES, REG_ALIASES, parseReg
  };
}
