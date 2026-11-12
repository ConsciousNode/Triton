#!/usr/bin/env node
'use strict';

/**
 * Test 4: Privilege & Memory Protection (`tests/t3-04-protection.js`)
 * ConsciousNode SoftWorks
 *
 * Verifies:
 *   - User program that writes outside its `[UBASE, ULIMIT)` window faults to
 *     the OS (`PROT_VIOL`, Vector 3), and the OS survives with kernel memory intact.
 *   - User program that executes any supervisor-only instruction (`HALT`, `IN`,
 *     `OUT`, `IRET`, `MFSPR`, `MTSPR`) faults (`PRIV_VIOL`, Vector 2), and the OS survives.
 *   - Positive control: with protection switched off by a machine option
 *     (`protectionEnabled: false` / `PROT_EN = 0`), the same user program overwrites
 *     kernel memory at address `100`, and the test detects the corruption.
 */

const { loadHtmlModule } = require('./t3-common');
const { T } = loadHtmlModule('triton3.html');

const t0 = Date.now();

// Kernel + User test harness program written in T3 assembly
const kernelSrc = `
  .mode T3
  .equ VBR_ADDR, 1000
  .equ KERNEL_SENTINEL, 400
  .equ FAULT_LOG_COUNT, 410
  .equ FAULT_LOG_CAUSE, 413
  .equ FAULT_LOG_ADDR,  416
  .org 0
  ; Initialize kernel sentinel at Mem[100] = 7777
  LI R0, #7777
  LI R1, #KERNEL_SENTINEL
  SW R0, R1, #0

  ; Set up VBR at 1000
  LI R0, #VBR_ADDR
  MTSPR R0, #5
  LI R1, #VBR_ADDR
  LI R0, #trap_handler
  SW R0, R1, #3   ; Vec 1: ILLEGAL_OP
  SW R0, R1, #6   ; Vec 2: PRIV_VIOL
  SW R0, R1, #9   ; Vec 3: PROT_VIOL
  SW R0, R1, #12  ; Vec 4: BAD_ADDR
  LI R0, #sys_handler
  SW R0, R1, #18  ; Vec 6: SYSCALL

  ; Configure Kernel Stack Pointer KSP = 20000
  LI R0, #317
  LMI R0, #1
  MTSPR R0, #14

  ; Configure User Window [UBASE = 5000, ULIMIT = 6000)
  LI R0, #5000
  MTSPR R0, #6
  LI R0, #6000
  MTSPR R0, #7

  ; Copy user program into User Window at 5000
  LI R1, #5000
  LI R2, #user_prog_start
  LI R3, #30
  BCOPY R1, R2, R3

  ; Enter User Mode at PC = 5000, SP = 5900, ESR = 27 (PRIV=1)
  LI R0, #5000
  MTSPR R0, #9
  LI R0, #5900
  MTSPR R0, #10
  LI R0, #27
  MTSPR R0, #11
  IRET

after_user:
  ; OS survives and sets R8 = 4242
  LI R8, #4242
  HALT

trap_handler:
  ; Log fault count, ECAUSE, and EADDR, then return to OS supervisor after_user
  LI R1, #FAULT_LOG_COUNT
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  MFSPR R0, #12
  LI R1, #FAULT_LOG_CAUSE
  SW R0, R1, #0
  MFSPR R0, #13
  LI R1, #FAULT_LOG_ADDR
  SW R0, R1, #0
  LI R0, #after_user
  MTSPR R0, #9
  LI R0, #0
  MTSPR R0, #11
  IRET

sys_handler:
  LI R0, #after_user
  MTSPR R0, #9
  LI R0, #0
  MTSPR R0, #11
  IRET

user_prog_start:
  ; Attempt to overwrite kernel sentinel at Mem[100] with -999!
  LI R0, #-999
  LI R1, #KERNEL_SENTINEL
  SW R0, R1, #0
  SYSCALL #0
`;

const built = T.assemble(kernelSrc, { mode: 'T3' });

// 1. Run with protection ENABLED (default: protectionEnabled = true) on both JS and WASM
{
  const jsVm = new T.TritonJS({ archMode: 'T3', protectionEnabled: true });
  const wasmVm = T.TritonWASM.createSync({ archMode: 'T3', protectionEnabled: true });
  jsVm.loadProgram(built.trytes, 0);
  wasmVm.loadProgram(built.trytes, 0);

  jsVm.run(1000);
  wasmVm.run(1000);

  // Check that kernel sentinel at Mem[100] is untouched (7777), fault was logged (CAUSE=3, ADDR=100), and OS survived (R8=4242)
  const jsSentinel = jsVm.getMem(400);
  const wasmSentinel = wasmVm.getMem(400);
  const jsCause = jsVm.getMem(413);
  const wasmCause = wasmVm.getMem(413);
  const jsAddr = jsVm.getMem(416);
  const wasmAddr = wasmVm.getMem(416);

  if (jsSentinel !== 7777 || wasmSentinel !== 7777 ||
      jsCause !== 3 || wasmCause !== 3 ||
      jsAddr !== 400 || wasmAddr !== 400 ||
      jsVm.getWordNum(8) !== 4242 || wasmVm.getWordNum(8) !== 4242) {
    throw new Error(`[Test 4] Protection check failed: sentinel=${jsSentinel}/${wasmSentinel} cause=${jsCause}/${wasmCause}`);
  }
}

// 2. Test all Supervisor-Only Instructions in User Mode (`HALT`, `IN`, `OUT`, `IRET`, `MFSPR`, `MTSPR`)
const privOps = [
  'HALT',
  'IN R0, #0',
  'OUT R0, #0',
  'IRET',
  'MFSPR R0, #0',
  'MTSPR R0, #8'
];
for (const privIns of privOps) {
  const src = kernelSrc.replace('LI R0, #-999\n  LI R1, #KERNEL_SENTINEL\n  SW R0, R1, #0', privIns);
  const b = T.assemble(src, { mode: 'T3' });
  const jsVm = new T.TritonJS({ archMode: 'T3', protectionEnabled: true });
  const wasmVm = T.TritonWASM.createSync({ archMode: 'T3', protectionEnabled: true });
  jsVm.loadProgram(b.trytes, 0);
  wasmVm.loadProgram(b.trytes, 0);
  jsVm.run(1000);
  wasmVm.run(1000);

  if (jsVm.getMem(413) !== 2 || wasmVm.getMem(413) !== 2 ||
      jsVm.getWordNum(8) !== 4242 || wasmVm.getWordNum(8) !== 4242) {
    throw new Error(`[Test 4] Supervisor instruction '${privIns}' did not trap with PRIV_VIOL (Vector 2)`);
  }
}

// 3. Positive Control: with protection switched OFF (`protectionEnabled: false`),
//    the exact same user program corrupts kernel memory (`Mem[100] == -999`), and the test detects it!
let positiveControlCorrupted = false;
{
  const jsUnlocked = new T.TritonJS({ archMode: 'T3', protectionEnabled: false });
  const wasmUnlocked = T.TritonWASM.createSync({ archMode: 'T3', protectionEnabled: false });
  jsUnlocked.loadProgram(built.trytes, 0);
  wasmUnlocked.loadProgram(built.trytes, 0);

  jsUnlocked.run(1000);
  wasmUnlocked.run(1000);

  const jsSentinel = jsUnlocked.getMem(400);
  const wasmSentinel = wasmUnlocked.getMem(400);
  const jsFaultCount = jsUnlocked.getMem(410);
  const wasmFaultCount = wasmUnlocked.getMem(410);

  if (jsSentinel === -999 && wasmSentinel === -999 && jsFaultCount === 0 && wasmFaultCount === 0) {
    positiveControlCorrupted = true;
  }
}
if (!positiveControlCorrupted) {
  throw new Error('[Test 4] Positive control failed: unlocked user program did not corrupt kernel sentinel!');
}

console.log(`[PASS] t3-04-protection: User bounds fault (Vec 3), all 6 supervisor instructions fault (Vec 2), OS survives, and positive control detects kernel corruption in ${Date.now() - t0} ms`);
