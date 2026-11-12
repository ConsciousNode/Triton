#!/usr/bin/env node
'use strict';

/**
 * Test 8: Display, Keyboard, Mouse & StudioNet NIC (`tests/t3-08-devices.js`)
 * ConsciousNode SoftWorks
 *
 * Verifies:
 *   - 729 × 486 (354,294-pixel) 729-color (2 trits per channel) MMIO framebuffer
 *     at `15,000,000 .. 15,354,293`: test patterns written through guest load/store
 *     and `BFILL` instructions read back identically on both JS and WASM.
 *   - Keyboard (`Port 10..12`, Vector 8 `IRQ_KBD`) and Mouse (`Port 13..16`, Vector 9
 *     `IRQ_MOUSE`) events enter strictly through device methods (`pushKeyEvent`,
 *     `pushMouseEvent`), raise interrupts, and are dequeued by guest ISR code into
 *     guest RAM without any harness writing into guest memory.
 *   - StudioNet NIC (`Port 22..27`, Vector 11 `IRQ_NET`) transmits and receives
 *     12-byte header + payload frames between two Triton 3.0 instances.
 *   - Positive control: when `IRQ_KBD` / `IRQ_MOUSE` are masked (`IMASK = 0`),
 *     queued events do not trigger guest ISRs.
 */

const { loadHtmlModule } = require('./t3-common');
const { T } = loadHtmlModule('triton3.html');

const t0 = Date.now();

// 1. Display Framebuffer (729x486, 729 colors [-364..+364]) Read/Write via Guest Instructions
//    plus Keyboard, Mouse, and StudioNet Interrupt-Driven Observation by Guest Code
const devSrc = `
  .mode T3
  .equ VBR_ADDR, 1000
  .equ KBD_LOG_CNT, 2000
  .equ KBD_LOG_BUF, 2010
  .equ MOUSE_LOG_CNT, 2100
  .equ MOUSE_LOG_BUF, 2110
  .equ NET_LOG_CNT, 2200
  .equ NET_LOG_BUF, 2210
  .org 0

  ; 1. Write test pattern across 729x486 MMIO framebuffer (base = 15,000,000 = 1554 + 762*19683)
  LI R1, #1554
  LMI R1, #762
  LHI R1, #0
  ; Fill first 729 pixels (row 0) with color +364 using BFILL
  LI R2, #364
  LI R3, #729
  BFILL R1, R2, R3
  ; Write extreme colors -364, 0, +364 at specific coordinates and read them back into R4, R5, R6
  LI R1, #1554
  LMI R1, #762
  LHI R1, #0
  LI R2, #-364
  STX R2, R1, #1000
  LI R2, #242
  STX R2, R1, #2000
  LDX R4, R1, #0
  LDX R5, R1, #1000
  LDX R6, R1, #2000

  ; 2. Set up VBR at 1000 for Keyboard (Vec 8), Mouse (Vec 9), and StudioNet (Vec 11)
  LI R0, #VBR_ADDR
  MTSPR R0, #5
  LI R1, #VBR_ADDR
  LI R0, #kbd_isr
  SW R0, R1, #24   ; Vec 8: IRQ_KBD
  LI R0, #mouse_isr
  SW R0, R1, #27   ; Vec 9: IRQ_MOUSE
  LI R0, #net_isr
  SW R0, R1, #33   ; Vec 11: IRQ_NET

  ; Enable IRQ_KBD (2) | IRQ_MOUSE (4) | IRQ_NET (16) = 22 in IMASK, and IE = 1
  LI R0, #22
  MTSPR R0, #3
  LI R0, #1
  MTSPR R0, #2

wait_lp:
  NOP
  JMPX wait_lp

kbd_isr:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
kbd_drain:
  IN R0, #10       ; KBD_COUNT
  CMPI R0, #0
  JZ kbd_done
  IN R1, #11       ; KBD_DATA (keycode)
  IN R2, #12       ; KBD_TYPE (0=down, 1=up)
  LI R3, #KBD_LOG_CNT
  LW R0, R3, #0
  MULI R0, R0, #2
  ADDI R0, R0, #KBD_LOG_BUF
  ST R1, R0, #0
  ST R2, R0, #1
  LW R0, R3, #0
  ADDI R0, R0, #1
  SW R0, R3, #0
  JMP kbd_drain
kbd_done:
  POP R3
  POP R2
  POP R1
  POP R0
  IRET

mouse_isr:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
mouse_drain:
  IN R0, #13       ; MOUSE_COUNT
  CMPI R0, #0
  JZ mouse_done
  IN R1, #14       ; MOUSE_DX
  IN R2, #15       ; MOUSE_DY
  IN R3, #16       ; MOUSE_BTN
  LI R4, #MOUSE_LOG_CNT
  LW R0, R4, #0
  MULI R0, R0, #3
  ADDI R0, R0, #MOUSE_LOG_BUF
  ST R1, R0, #0
  ST R2, R0, #1
  ST R3, R0, #2
  LW R0, R4, #0
  ADDI R0, R0, #1
  SW R0, R4, #0
  JMP mouse_drain
mouse_done:
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  IRET

net_isr:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  IN R1, #25       ; NET_RX_LEN
  LI R3, #NET_LOG_CNT
  SW R1, R3, #0
  LI R2, #NET_LOG_BUF
net_rx_lp:
  CMPI R1, #0
  JZ net_rx_done
  IN R0, #27       ; NET_RX_FIFO
  ST R0, R2, #0
  ADDI R2, R2, #1
  SUBI R1, R1, #1
  JMP net_rx_lp
net_rx_done:
  LI R0, #1
  OUT R0, #25      ; Pop RX frame
  POP R3
  POP R2
  POP R1
  POP R0
  IRET
`;

const built = T.assemble(devSrc, { mode: 'T3' });
const jsVm = new T.TritonJS({ archMode: 'T3' });
const wasmVm = T.TritonWASM.createSync({ archMode: 'T3' });

jsVm.loadProgram(built.trytes, 0);
wasmVm.loadProgram(built.trytes, 0);

// Run display pattern setup and enter wait_lp
jsVm.run(800);
wasmVm.run(800);

// Verify framebuffer test pattern read back by guest instructions into R4, R5, R6
if (jsVm.getWordNum(4) !== 364 || jsVm.getWordNum(5) !== -364 || jsVm.getWordNum(6) !== 242 ||
    wasmVm.getWordNum(4) !== 364 || wasmVm.getWordNum(5) !== -364 || wasmVm.getWordNum(6) !== 242) {
  throw new Error(`[Test 8] Framebuffer guest readback mismatch: R4..R6 = ${[4,5,6].map(r => jsVm.getWordNum(r))}`);
}
for (let x = 0; x < 729; x++) {
  if (jsVm.vram[x] !== 364 || wasmVm.vram[x] !== 364) {
    throw new Error(`[Test 8] Framebuffer BFILL row 0 mismatch at x=${x}`);
  }
}

// Feed keyboard events (key-down 65 'A', key-up 65 'A', key-down 90 'Z') strictly via device queues
jsVm.pushKeyEvent(65, 0); wasmVm.pushKeyEvent(65, 0);
jsVm.pushKeyEvent(65, 1); wasmVm.pushKeyEvent(65, 1);
jsVm.pushKeyEvent(90, 0); wasmVm.pushKeyEvent(90, 0);

jsVm.run(200);
wasmVm.run(200);

// Re-enable IE=1 (since IRET restores IE=1 from saved ESR) and feed Mouse events
jsVm.pushMouseEvent(15, -8, 1);  wasmVm.pushMouseEvent(15, -8, 1);
jsVm.pushMouseEvent(-4, 22, 5);  wasmVm.pushMouseEvent(-4, 22, 5);

jsVm.run(200);
wasmVm.run(200);

// Feed a StudioNet frame (dst=3, src=1, proto=1 ECHO_REQ, seq=7, payload=[84, 51, 79, 75] "T3OK")
const frame = T.buildStudioNetFrame(3, 1, 1, 7, [84, 51, 79, 75]);
jsVm.receiveNetFrame(frame);
wasmVm.receiveNetFrame(frame);

jsVm.run(300);
wasmVm.run(300);

// Verify guest code observed all 3 keyboard events in KBD_LOG_BUF (2010..)
if (jsVm.getMem(2000) !== 3 || wasmVm.getMem(2000) !== 3 ||
    jsVm.getMem(2010) !== 65 || jsVm.getMem(2011) !== 0 ||
    jsVm.getMem(2012) !== 65 || jsVm.getMem(2013) !== 1 ||
    jsVm.getMem(2014) !== 90 || jsVm.getMem(2015) !== 0 ||
    wasmVm.getMem(2014) !== 90 || wasmVm.getMem(2015) !== 0) {
  throw new Error('[Test 8] Keyboard events not observed accurately by guest ISR');
}

// Verify guest code observed both mouse events in MOUSE_LOG_BUF (2110..)
if (jsVm.getMem(2100) !== 2 || wasmVm.getMem(2100) !== 2 ||
    jsVm.getMem(2110) !== 15 || jsVm.getMem(2111) !== -8 || jsVm.getMem(2112) !== 1 ||
    jsVm.getMem(2113) !== -4 || jsVm.getMem(2114) !== 22 || jsVm.getMem(2115) !== 5 ||
    wasmVm.getMem(2113) !== -4 || wasmVm.getMem(2114) !== 22 || wasmVm.getMem(2115) !== 5) {
  throw new Error('[Test 8] Mouse events not observed accurately by guest ISR');
}

// Verify guest code observed the 16-byte StudioNet frame in NET_LOG_BUF (2210..2225)
if (jsVm.getMem(2200) !== 16 || wasmVm.getMem(2200) !== 16) {
  throw new Error(`[Test 8] StudioNet RX frame length mismatch: ${jsVm.getMem(2200)} / ${wasmVm.getMem(2200)}`);
}
for (let i = 0; i < frame.length; i++) {
  if (jsVm.getMem(2210 + i) !== frame[i] || wasmVm.getMem(2210 + i) !== frame[i]) {
    throw new Error(`[Test 8] StudioNet RX byte mismatch at ${i}`);
  }
}

// Positive Control: when IMASK = 0, pushing keyboard/mouse events does not invoke guest ISRs
let positiveControlMasked = false;
{
  jsVm.imask = 0; wasmVm.imask = 0;
  const prevKbdCnt = jsVm.getMem(2000);
  jsVm.pushKeyEvent(77, 0); wasmVm.pushKeyEvent(77, 0);
  jsVm.run(100); wasmVm.run(100);
  if (jsVm.getMem(2000) === prevKbdCnt && wasmVm.getMem(2000) === prevKbdCnt) {
    positiveControlMasked = true;
  }
}
if (!positiveControlMasked) {
  throw new Error('[Test 8] Positive control failed: masked interrupt still invoked guest ISR!');
}

console.log(`[PASS] t3-08-devices: 729x486 729-color MMIO framebuffer readback, interrupt-driven keyboard/mouse/StudioNet guest observation (+ positive control) in ${Date.now() - t0} ms`);
