'use strict';
const fs = require('fs');
const path = require('path');

function buildFontAndSplashAsm(rootDir) {
  const fontAsmRaw = fs.readFileSync(path.join(rootDir, 'fonts', 'times-new-thesuramos-9x9.tryte.asm'), 'utf8');
  const fontLines = fontAsmRaw.split('\n').filter(l => l.trim().startsWith('.tryte'));
  if (fontLines.length !== 96) {
    throw new Error('Expected 96 glyph lines in times-new-thesuramos-9x9.tryte.asm, got ' + fontLines.length);
  }
  const fontArray = fontLines.map(l => {
    const m = /\.tryte\s+([^;]+)/.exec(l);
    return m[1].split(',').map(s => parseInt(s.trim().replace('#', ''), 10));
  });

  // Rasterize cnsw-mark.svg into an 81x81 trit image (9x9 grid of 9x9 tryte tiles = 729 trytes)
  // +1 = square, circle, triangle, center dot; -1 = faint spiral; 0 = background
  const svg = fs.readFileSync(path.join(rootDir, 'cnsw-mark.svg'), 'utf8');
  const pathMatch = /<path d="([^"]+)"/.exec(svg);
  const pts = [];
  const re = /[ML]\s*([0-9.]+)\s+([0-9.]+)/g;
  let m;
  while ((m = re.exec(pathMatch[1])) !== null) {
    pts.push([parseFloat(m[1]), parseFloat(m[2])]);
  }
  function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  const N = 81;
  const tritsGrid = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const sx = 100 + (c + 0.5) * (600 / N);
      const sy = 100 + (r + 0.5) * (600 / N);
      const tol = (600 / N) * 0.65;
      const onSq = (sx >= 120 - tol && sx <= 680 + tol && sy >= 120 - tol && sy <= 680 + tol) &&
                   (Math.abs(sx - 120) <= tol || Math.abs(sx - 680) <= tol || Math.abs(sy - 120) <= tol || Math.abs(sy - 680) <= tol);
      const dCenter = Math.hypot(sx - 400, sy - 400);
      const onCir = Math.abs(dCenter - 280) <= tol;
      const dT1 = distToSeg(sx, sy, 400, 120, 642.49, 540);
      const dT2 = distToSeg(sx, sy, 642.49, 540, 157.51, 540);
      const dT3 = distToSeg(sx, sy, 157.51, 540, 400, 120);
      const onTri = Math.min(dT1, dT2, dT3) <= tol;
      const onDot = dCenter <= 26 + tol * 0.3;
      if (onSq || onCir || onTri || onDot) {
        tritsGrid[r][c] = 1;
      } else if (sx >= 120 && sx <= 680 && sy >= 120 && sy <= 680) {
        let minD = 1e9;
        for (let i = 0; i < pts.length - 1; i++) {
          const d = distToSeg(sx, sy, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
          if (d < minD) minD = d;
        }
        if (minD <= tol * 0.85) tritsGrid[r][c] = -1;
      }
    }
  }

  // Pack 81x81 trits into 81 tiles (ty = 0..8, tx = 0..8), each tile 9 trytes (rows 0..8)
  const splashTileLines = [];
  for (let ty = 0; ty < 9; ty++) {
    for (let tx = 0; tx < 9; tx++) {
      const rowTrytes = [];
      for (let r = 0; r < 9; r++) {
        let val = 0;
        for (let c = 0; c < 9; c++) {
          val = val * 3 + tritsGrid[ty * 9 + r][tx * 9 + c];
        }
        rowTrytes.push('#' + val);
      }
      splashTileLines.push('.tryte ' + rowTrytes.join(',') + ` ; tile (${tx},${ty})`);
    }
  }

  return {
    fontLines,
    fontArray,
    splashTileLines
  };
}

function getKernelAndCoreDriversAsm(fontLines, splashTileLines) {
  return `.mode T3
; ============================================================================
; TRITOS DESKTOP 1.1.2 — SUPERVISOR KERNEL, DRIVER LIBRARY, COMPOSITOR,
; BLOCK FS, STUDIONET 1.0 (DRIVER net v3) & 12 DESKTOP APPLICATIONS
; Written 100% in Triton 3.1 Assembly (ConsciousNode SoftWorks, MIT)
; ============================================================================

; --- Hardware I/O Ports (ISA-3.md §5) ---
.equ P_CH, 0
.equ P_NM, 1
.equ P_DX, 2
.equ P_DY, 3
.equ P_PX, 4
.equ P_DC, 5
.equ P_TM, 6
.equ P_DA, 7
.equ P_DD, 8
.equ P_TP, 9
.equ P_KC, 10
.equ P_KD, 11
.equ P_KT, 12
.equ P_MC, 13
.equ P_MX, 14
.equ P_MY, 15
.equ P_MB, 16
.equ P_DLBA, 17
.equ P_DDMA, 18
.equ P_DCNT, 19
.equ P_DCMD, 20
.equ P_DERR, 21
.equ P_NST, 22
.equ P_NID, 23
.equ P_NTX, 24
.equ P_NRX, 25
.equ P_NTF, 26
.equ P_NRF, 27

; --- Kernel & Driver Memory Map ---
.equ VEC_BASE, 5800
.equ K_CUR_TASK, 5850
.equ K_NUM_TASKS, 5851
.equ K_TRAP_CNT, 5854          ; 3-tryte word
.equ K_LAST_CAUSE, 5857        ; 3-tryte word
.equ K_LAST_EADDR, 5860        ; 3-tryte word
.equ K_LAST_FAULT_TASK, 5863
.equ K_TIMER_IRQS, 5866        ; 3-tryte word (owned by timer driver)
.equ K_KBD_IRQS, 5869          ; 3-tryte word (owned by keyboard driver)
.equ K_MOUSE_IRQS, 5872        ; 3-tryte word (owned by mouse driver)
.equ K_DISK_IRQS, 5875         ; 3-tryte word (owned by disk driver)
.equ K_DRAG_WIN, 5878          ; -1 or window idx being dragged (owned by mouse driver)
.equ K_PREV_BTN, 5879          ; previous mouse button state (owned by mouse driver)
.equ K_FAULT_BANNER_ACTIVE, 5880
.equ K_NET_IN_POLL, 5881       ; reentrancy guard for drv_net_poll
.equ K_SPLASH_DISMISSED, 5882
.equ K_TASKBAR_INIT_DONE, 5889  ; 1 once boot splash is dismissed or completed
.equ K_SAVED_R0, 5883          ; 3-tryte word scratch
.equ K_SAVED_R1, 5886          ; 3-tryte word scratch
.equ K_NUM_FMT_BUF, 5900       ; 40-tryte scratch for number formatting

.equ TCB_BASE, 6000
.equ TCB_SIZE, 64
.equ EVQ_BASE, 6512

.equ FS_DIR_LBA, 200
.equ FS_DIR_BUF, 7100
.equ FS_MAGIC_ADDR, 7804
.equ FS_FREE_LBA_ADDR, 7807
.equ FS_COUNT_ADDR, 7810
.equ FS_NAME_TMP, 7830
.equ FS_LIST_TMP, 7850

.equ SCAN_BUF, 7900
.equ WINTAB, 8700
.equ ZORDER, 8900
.equ ZCOUNT, 8908
.equ ACTIVE_WIN, 8909
.equ CUR_X, 8910               ; cursor X (owned by mouse driver)
.equ CUR_Y, 8911               ; cursor Y (owned by mouse driver)
.equ LAST_REDRAW_TRYTES, 8912  ; 3-tryte word (owned by framebuffer driver)
.equ TOTAL_REDRAW_TRYTES, 8915 ; 3-tryte word (owned by framebuffer driver)
.equ REDRAW_COUNT, 8918        ; 3-tryte word (owned by framebuffer driver)
.equ TMP_RX, 8921              ; compositor scratch 8921..8928 (owned by framebuffer driver)
.equ TMP_RY, 8922
.equ TMP_RW, 8923
.equ TMP_RH, 8924
.equ TMP_RX2, 8925
.equ TMP_RY2, 8926
.equ TMP_Y, 8927
.equ TMP_Z, 8928

; --- StudioNet Driver v3 Kernel Memory (9700..9799, 72*19683..78*19683) ---
.equ K_NET_IRQS, 9700            ; 3-tryte word
.equ K_NET_RX_PKTS, 9703         ; 3-tryte word
.equ K_NET_DROP_PKTS, 9706       ; 3-tryte word
.equ K_NET_TX_PKTS, 9709         ; 3-tryte word
.equ K_NET_SEQ, 9712             ; 3-tryte word
.equ K_NET_HEAD, 9715            ; 1 tryte (0..9)
.equ K_NET_TAIL, 9716            ; 1 tryte (0..9)
.equ K_NET_COUNT, 9717           ; 1 tryte (0..10)
.equ K_NET_PING_REPLIES, 9718    ; 3-tryte word
.equ K_NET_LAST_RTT, 9721        ; 3-tryte word (>0 steps, -1 on NO REPLY)
.equ K_NET_PING_SENT_TICKS, 9724 ; 3-tryte word
.equ K_NET_CHAT_COUNT, 9727      ; 1 tryte
.equ K_NET_SFP_RX_COUNT, 9728    ; 1 tryte
.equ K_NET_PING_PENDING, 9729    ; 1 tryte (0 or 1)
.equ K_NET_LAST_SRC, 9730        ; 3-tryte word (0..65535)
.equ K_SFP_RX_TOTAL, 9733        ; 3-tryte word
.equ K_SFP_RX_GOT, 9736          ; 3-tryte word
.equ K_SFP_RX_FIN, 9739          ; 1 tryte
.equ K_NET_DST_TMP, 9740         ; 3-tryte word
.equ K_NET_MODE_TMP, 9743        ; 1 tryte ('B' or 'T')
.equ K_NET_IDX_TMP, 9744         ; 1 tryte (chunk_idx)
.equ K_SNS_BOOT_DONE, 9745       ; 1 tryte (0 or 1)
.equ K_SNS_LAST_HELLO, 9746      ; 3-tryte word (steps)
.equ K_SNS_TOKEN, 9749           ; 3-tryte word (u32 token)
.equ K_SNS_NAMED, 9752           ; 1 tryte (0 or 1)
.equ K_SNS_NUM, 9753             ; 1 tryte (0..99)
.equ K_NET_SHARE, 9754           ; 1 tryte (0 or 1)
.equ K_SNS_CLASH, 9755           ; 1 tryte (0 or 1)
.equ K_SNS_AGE_OVR, 9756         ; 3-tryte word (-1 or age sec override)
.equ K_SRRP_RX_STATE, 9759       ; 1 tryte (0=wait, 1=recv, 2=done, 3=refused)
.equ K_SRRP_RX_S, 9760           ; 3-tryte word (start seq)
.equ K_SRRP_RX_EXPECT, 9763      ; 1 tryte (0..75)
.equ K_SRRP_RX_FIN_IDX, 9764     ; 1 tryte (-1..75)
.equ K_SRRP_RX_SINCE_ACK, 9765   ; 1 tryte
.equ K_SRRP_RX_SRC, 9766         ; 3-tryte word
.equ K_SRRP_RX_SPORT, 9769       ; 3-tryte word
.equ K_SRRP_RX_IS_RESP, 9772     ; 1 tryte (0=req, 1=resp)
.equ K_SRRP_TX_STATE, 9773       ; 1 tryte (0=idle, 1=sending, 2=done, 3=failed)
.equ K_SRRP_TX_S, 9774           ; 3-tryte word (start seq)
.equ K_SRRP_TX_CHUNKS, 9777      ; 1 tryte (1..75)
.equ K_SRRP_TX_BASE, 9778        ; 1 tryte (0..75)
.equ K_SRRP_TX_NEXT, 9779        ; 1 tryte (0..75)
.equ K_SRRP_TX_CWND, 9780        ; 1 tryte
.equ K_SRRP_TX_PEER_WIN, 9781    ; 1 tryte
.equ K_SRRP_TX_GROWN_AT, 9782    ; 1 tryte
.equ K_SRRP_TX_FAILS, 9783       ; 1 tryte
.equ K_SRRP_TX_DST, 9784         ; 3-tryte word
.equ K_SRRP_TX_SPORT, 9787       ; 3-tryte word
.equ K_SRRP_TX_DPORT, 9790       ; 3-tryte word
.equ K_SRRP_TX_SENT_TICKS, 9793  ; 3-tryte word
.equ K_SRRP_LAST_STATUS, 9796    ; 3-tryte word
.equ K_NET_CLASH_NODE, 9799      ; 3-tryte word

.equ K_NET_LAST_CHAT, 12200      ; 64 trytes (12200..12263)
.equ K_NET_LAST_FILE, 12264      ; 16 trytes (12264..12279)
.equ K_NET_STATUS_MSG, 12280     ; 20 trytes (12280..12299)
.equ K_SFP_RX_NAME, 12300        ; 16 trytes (12300..12315)
.equ K_NET_TX_BUF, 12320         ; 520 trytes (12320..12839)
.equ K_NET_Q_BASE, 12840         ; 10 slots * 516 trytes (12840..17999)
.equ K_SNS_PEERS, 1417176        ; 8 entries * 32 trytes at 72 * 19683
.equ K_SFP_BUF, 59049            ; 5952 trytes (59049..65000)

; --- Colors (729-Color Balanced-Ternary Palette [-364..+364]) ---
.equ COL_DESKTOP_BG, -280
.equ COL_TASKBAR_BG, -335
.equ COL_TASKBAR_BTN, -240
.equ COL_TASKBAR_ACT, -120
.equ COL_WIN_BG, -310
.equ COL_WIN_BORDER, 120
.equ COL_TITLE_ACT, -110
.equ COL_TITLE_INACT, -260
.equ COL_CLOSE_BTN, 280
.equ COL_WHITE, 364
.equ COL_BLACK, -364
.equ COL_SHADOW, -358
.equ COL_GREEN, 76
.equ COL_YELLOW, 355
.equ COL_CYAN, -284
.equ COL_RED, 292
.equ COL_FAULT_BG, 240

.org 0
; ==== DRIVER disk v1 ====
; Ports: P_DA (7), P_DD (8), P_DLBA (17), P_DDMA (18), P_DCNT (19), P_DCMD (20), P_DERR (21)
; Memory: 5875..5877
; IRQ: 10
; Entries: drv_disk_boot, drv_disk_irq, drv_disk_read, drv_disk_write, drv_disk_write_tryte
drv_disk_boot:
  JMP drv_disk_boot_impl
drv_disk_irq:
  JMP drv_disk_irq_impl
drv_disk_read:
  JMP drv_disk_read_impl
drv_disk_write:
  JMP drv_disk_write_impl
drv_disk_write_tryte:
  JMP drv_disk_write_tryte_impl
; --- End Entry Table ---

drv_disk_boot_impl:
  LI R0, #0
  OUT R0, #P_DLBA
  OUT R0, #P_DDMA
  LI R0, #110
  OUT R0, #P_DCNT
  LI R0, #1
  OUT R0, #P_DCMD
  JMP kernel_boot_entry

drv_disk_irq_impl:
  PUSH R0
  PUSH R1
  LI R1, #K_DISK_IRQS
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  POP R1
  POP R0
  IRET

; drv_disk_read: R0=lba, R1=dma_addr, R2=sector_count -> R0=0 (OK) or -disk_err
drv_disk_read_impl:
  OUT R0, #P_DLBA
  OUT R1, #P_DDMA
  OUT R2, #P_DCNT
  LI R0, #1
  OUT R0, #P_DCMD
  IN R0, #P_DCMD
  CMPI R0, #1
  JZ ddr_ok
  IN R0, #P_DERR
  NEG R0, R0
  RET
ddr_ok:
  LI R0, #0
  RET

; drv_disk_write: R0=lba, R1=dma_addr, R2=sector_count -> R0=0 (OK) or -disk_err
drv_disk_write_impl:
  OUT R0, #P_DLBA
  OUT R1, #P_DDMA
  OUT R2, #P_DCNT
  LI R0, #2
  OUT R0, #P_DCMD
  IN R0, #P_DCMD
  CMPI R0, #1
  JZ ddw_ok
  IN R0, #P_DERR
  NEG R0, R0
  RET
ddw_ok:
  LI R0, #0
  RET

; drv_disk_write_tryte: R0=disk_tryte_offset, R1=tryte_value -> R0=0
drv_disk_write_tryte_impl:
  OUT R0, #P_DA
  OUT R1, #P_DD
  LI R0, #0
  RET
; ==== END DRIVER disk ====

; ============================================================================
; KERNEL INITIALIZATION & VECTOR TABLE SETUP
; ============================================================================
kernel_boot_entry:
  LI R0, #9000
  ADDI R0, R0, #1190
  MTSPR R0, #14 ; SPR_KSP = 10190
  MTSPR R0, #10 ; SPR_ESP = 10190
  LI R0, #kernel_init_after_sp
  MTSPR R0, #9  ; SPR_EPC
  LI R0, #0
  MTSPR R0, #11 ; SPR_ESR (Supervisor, IE=0)
  IRET

kernel_init_after_sp:
  ; Clear kernel BSS state (5800..8929)
  LI R0, #5800
  LI R1, #0
  LI R2, #3130
  BFILL R0, R1, R2

  ; Initialize Vector Table at VEC_BASE (5800)
  LI R0, #VEC_BASE
  MTSPR R0, #5
  LI R1, #VEC_BASE
  LI R0, #drv_disk_boot
  SW R0, R1, #0   ; Vec 0: RESET
  LI R0, #fault_handler
  SW R0, R1, #3   ; Vec 1: ILLEGAL_OP
  SW R0, R1, #6   ; Vec 2: PRIV_VIOL
  SW R0, R1, #9   ; Vec 3: PROT_VIOL
  SW R0, R1, #12  ; Vec 4: BAD_ADDR
  SW R0, R1, #15  ; Vec 5: DIV_ZERO
  LI R0, #syscall_handler
  SW R0, R1, #18  ; Vec 6: SYSCALL
  LI R0, #drv_timer_irq
  SW R0, R1, #21  ; Vec 7: IRQ_TIMER
  LI R0, #drv_kbd_irq
  SW R0, R1, #24  ; Vec 8: IRQ_KBD
  LI R0, #drv_mouse_irq
  SW R0, R1, #27  ; Vec 9: IRQ_MOUSE
  LI R0, #drv_disk_irq
  SW R0, R1, #30  ; Vec 10: IRQ_DISK
  LI R0, #drv_net_irq
  SW R0, R1, #33  ; Vec 11: IRQ_NET

  ; Enable Divide-by-Zero Fault Trap (SPR_TRAP_DIV0 = 1)
  LI R0, #1
  MTSPR R0, #15

  ; Initialize Window Manager state
  LI R1, #ACTIVE_WIN
  LI R0, #-1
  ST R0, R1, #0
  LI R1, #K_LAST_FAULT_TASK
  ST R0, R1, #0

  ; Mark all 8 TCB WIN_IDs as -1
  LI R1, #TCB_BASE
  LI R2, #8
  LI R0, #-1
init_tcb_lp:
  ST R0, R1, #43
  ADDI R1, R1, #TCB_SIZE
  SUBI R2, R2, #1
  JNZ init_tcb_lp

  ; Initialize Block-Disk File System first so net driver can read persisted HOSTNAME if present
  CALL fs_init

  ; Initialize Hardware Drivers via their Entry Tables
  CALL drv_kbd_init
  CALL drv_mouse_init
  CALL drv_net_init

  ; Initialize Framebuffer (shows CNSW boot splash, then Wallpaper & Taskbar)
  CALL drv_fb_init

  ; Spawn default desktop apps: Clock (App 3) and Terminal (App 0)
  LI R0, #3
  CALL k_spawn_app
  LI R0, #0
  CALL k_spawn_app

  ; Configure Hardware Interrupt Mask (IMASK = 31) and Periodic Timer (Period = 2500 steps)
  LI R0, #31
  MTSPR R0, #3
  LI R0, #2500
  ; __DISABLE_TIMER__
  CALL drv_timer_init

  ; Start Task 0
  LI R0, #0
  LI R1, #K_CUR_TASK
  ST R0, R1, #0
  JMP sched_restore_current

; ============================================================================
; CONTEXT SAVE / RESTORE & PREEMPTIVE SCHEDULER
; ============================================================================
get_cur_tcb_r1:
  LI R1, #K_CUR_TASK
  LT R1, R1, #0
  MULI R1, R1, #TCB_SIZE
  ADDI R1, R1, #TCB_BASE
  RET

k_save_current_task:
  PUSH R0
  PUSH R1
  CALL get_cur_tcb_r1
  SW R2, R1, #6
  SW R3, R1, #9
  SW R4, R1, #12
  SW R5, R1, #15
  SW R6, R1, #18
  SW R7, R1, #21
  SW R8, R1, #24
  LI R0, #K_SAVED_R0
  LW R2, R0, #0
  SW R2, R1, #0
  LW R2, R0, #3
  SW R2, R1, #3
  MFSPR R0, #9
  SW R0, R1, #27
  MFSPR R0, #10
  SW R0, R1, #30
  MFSPR R0, #11
  SW R0, R1, #33
  POP R1
  POP R0
  RET

sched_pick_next:
  LI R1, #K_CUR_TASK
  LT R0, R1, #0
  LI R2, #8
spn_lp:
  CMPI R2, #0
  JZ spn_idle
  ADDI R0, R0, #1
  CMPI R0, #8
  JN spn_idx_ok
  LI R0, #0
spn_idx_ok:
  MULI R3, R0, #TCB_SIZE
  ADDI R3, R3, #TCB_BASE
  LT R4, R3, #42
  CMPI R4, #1
  JZ spn_found
  SUBI R2, R2, #1
  JMP spn_lp
spn_found:
  LI R1, #K_CUR_TASK
  ST R0, R1, #0
  RET
spn_idle:
  LI R0, #81
  MTSPR R0, #11
  LI R0, #kernel_idle_loop
  MTSPR R0, #9
  LI R0, #9000
  ADDI R0, R0, #1180
  MTSPR R0, #10
  IRET

kernel_idle_loop:
  NOP
  JMP kernel_idle_loop

sched_restore_current:
  LI R1, #K_CUR_TASK
  LT R0, R1, #0
  MULI R1, R0, #TCB_SIZE
  ADDI R1, R1, #TCB_BASE
  LT R0, R1, #42
  CMPI R0, #1
  JNZ spn_idle
  LW R0, R1, #36
  MTSPR R0, #6
  LW R0, R1, #39
  MTSPR R0, #7
  LW R0, R1, #27
  MTSPR R0, #9
  LW R0, R1, #30
  MTSPR R0, #10
  LW R0, R1, #33
  MTSPR R0, #11
  LW R2, R1, #6
  LW R3, R1, #9
  LW R4, R1, #12
  LW R5, R1, #15
  LW R6, R1, #18
  LW R7, R1, #21
  LW R8, R1, #24
  LW R0, R1, #0
  LW R1, R1, #3
  IRET

; ==== DRIVER timer v1 ====
; Ports: P_TM (6), P_TP (9)
; Memory: 5866..5868
; IRQ: 7
; Entries: drv_timer_init, drv_timer_irq, drv_timer_read
drv_timer_init:
  JMP drv_timer_init_impl
drv_timer_irq:
  JMP drv_timer_irq_impl
drv_timer_read:
  JMP drv_timer_read_impl
; --- End Entry Table ---

; drv_timer_init: R0=period_steps (0 disables periodic IRQ) -> R0=0
drv_timer_init_impl:
  OUT R0, #P_TP
  LI R0, #0
  RET

; drv_timer_read: none -> R0=current virtual step count
drv_timer_read_impl:
  IN R0, #P_TM
  RET

; drv_timer_irq: Vector 7 (IRQ_TIMER) handler
drv_timer_irq_impl:
  PUSH R0
  PUSH R1
  LI R1, #K_SAVED_R0
  POP R0
  SW R0, R1, #3
  POP R0
  SW R0, R1, #0

  LI R1, #K_TIMER_IRQS
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0

  MFSPR R0, #11
  CMPI R0, #95
  JN dti_from_sup

  CALL k_save_current_task
  CALL get_cur_tcb_r1
  LW R0, R1, #45
  ADDI R0, R0, #1
  SW R0, R1, #45
  JMP dti_idle_ok

dti_from_sup:
  MFSPR R0, #9
  CMPI R0, #kernel_idle_loop
  JZ dti_idle_ok
  CMPI R0, #kernel_idle_loop + 2
  JZ dti_idle_ok
  LI R1, #K_SAVED_R0
  LW R0, R1, #0
  LW R1, R1, #3
  IRET
dti_idle_ok:
  CALL drv_kbd_poll
  CALL drv_mouse_poll
  CALL drv_net_poll
  CALL sched_pick_next
  JMP sched_restore_current
; ==== END DRIVER timer ====

; ==== DRIVER keyboard v1 ====
; Ports: P_KC (10), P_KD (11), P_KT (12)
; Memory: 5869..5871
; IRQ: 8
; Entries: drv_kbd_init, drv_kbd_irq, drv_kbd_poll
drv_kbd_init:
  JMP drv_kbd_init_impl
drv_kbd_irq:
  JMP drv_kbd_irq_impl
drv_kbd_poll:
  JMP drv_kbd_poll_impl
; --- End Entry Table ---

; drv_kbd_init: resets K_KBD_IRQS and drains stale hardware key events -> R0=0
drv_kbd_init_impl:
  PUSH R1
  LI R1, #K_KBD_IRQS
  LI R0, #0
  SW R0, R1, #0
dki_drain_lp:
  IN R0, #P_KC
  CMPI R0, #0
  JNP dki_done
  IN R0, #P_KD
  IN R0, #P_KT
  JMP dki_drain_lp
dki_done:
  LI R0, #0
  POP R1
  RET

; drv_kbd_irq: Vector 8 (IRQ_KBD) handler
drv_kbd_irq_impl:
  PUSH R0
  PUSH R1
  LI R1, #K_SAVED_R0
  POP R0
  SW R0, R1, #3
  POP R0
  SW R0, R1, #0
  MFSPR R0, #11
  CMPI R0, #95
  JN dki_sup
  CALL k_save_current_task
  JMP dki_user_cont
dki_sup:
  LI R1, #K_KBD_IRQS
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  CALL drv_kbd_poll_impl
  LI R1, #K_SAVED_R0
  LW R0, R1, #0
  LW R1, R1, #3
  IRET
dki_user_cont:
  LI R1, #K_KBD_IRQS
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  CALL drv_kbd_poll_impl
  JMP sched_restore_current

; drv_kbd_poll: drains hardware keyboard queue into active window's event queue
drv_kbd_poll_impl:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
dkp_lp:
  IN R0, #P_KC
  CMPI R0, #0
  JNP dkp_done
  LI R1, #ACTIVE_WIN
  LT R0, R1, #0
  CMPI R0, #-1
  JZ dkp_dequeue_discard
  MULI R0, R0, #24
  ADDI R0, R0, #WINTAB
  LT R5, R0, #0 ; VIS
  CMPI R5, #0
  JZ dkp_dequeue_discard
  LT R0, R0, #1 ; TASK_ID
  MULI R5, R0, #TCB_SIZE
  ADDI R5, R5, #TCB_BASE
  LT R5, R5, #53 ; EV_COUNT
  CMPI R5, #16
  JNN dkp_done

  IN R2, #P_KD
  IN R3, #P_KT
  CMPI R3, #0
  JNZ dkp_lp
  LI R1, #1 ; EV_KEY = 1
  LI R3, #0
  LI R4, #0
  CALL k_push_event
  JMP dkp_lp

dkp_dequeue_discard:
  IN R2, #P_KD
  IN R3, #P_KT
  CMPI R3, #0
  JNZ dkp_lp
  LI R1, #K_SPLASH_DISMISSED
  LI R0, #1
  ST R0, R1, #0
  JMP dkp_lp

dkp_done:
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET
; ==== END DRIVER keyboard ====

; ==== DRIVER mouse v1 ====
; Ports: P_MC (13), P_MX (14), P_MY (15), P_MB (16)
; Memory: 5872..5874, 5878..5879, 8910..8911
; IRQ: 9
; Entries: drv_mouse_init, drv_mouse_irq, drv_mouse_poll
drv_mouse_init:
  JMP drv_mouse_init_impl
drv_mouse_irq:
  JMP drv_mouse_irq_impl
drv_mouse_poll:
  JMP drv_mouse_poll_impl
; --- End Entry Table ---

; drv_mouse_init: initializes cursor position and mouse driver state -> R0=0
drv_mouse_init_impl:
  PUSH R1
  LI R1, #K_MOUSE_IRQS
  LI R0, #0
  SW R0, R1, #0
  LI R1, #K_DRAG_WIN
  LI R0, #-1
  ST R0, R1, #0
  LI R1, #K_PREV_BTN
  LI R0, #0
  ST R0, R1, #0
  LI R1, #CUR_X
  LI R0, #364
  ST R0, R1, #0
  LI R0, #230
  ST R0, R1, #1
  LI R0, #0
  POP R1
  RET

; drv_mouse_irq: Vector 9 (IRQ_MOUSE) handler
drv_mouse_irq_impl:
  PUSH R0
  PUSH R1
  LI R1, #K_SAVED_R0
  POP R0
  SW R0, R1, #3
  POP R0
  SW R0, R1, #0
  MFSPR R0, #11
  CMPI R0, #95
  JN dmi_sup
  CALL k_save_current_task
  JMP dmi_user_cont
dmi_sup:
  LI R1, #K_MOUSE_IRQS
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  CALL drv_mouse_poll_impl
  LI R1, #K_SAVED_R0
  LW R0, R1, #0
  LW R1, R1, #3
  IRET
dmi_user_cont:
  LI R1, #K_MOUSE_IRQS
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  CALL drv_mouse_poll_impl
  JMP sched_restore_current

; drv_mouse_poll: drains hardware mouse queue, updates cursor & window drag, dispatches events
drv_mouse_poll_impl:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
dmp_lp:
  IN R0, #P_MC
  CMPI R0, #0
  JNP dmp_done
  LI R1, #ACTIVE_WIN
  LT R0, R1, #0
  CMPI R0, #-1
  JZ dmp_deq
  MULI R0, R0, #24
  ADDI R0, R0, #WINTAB
  LT R5, R0, #0
  CMPI R5, #0
  JZ dmp_deq
  LT R0, R0, #1
  MULI R5, R0, #TCB_SIZE
  ADDI R5, R5, #TCB_BASE
  LT R5, R5, #53
  CMPI R5, #14
  JNN dmp_done
dmp_deq:
  IN R1, #P_MX
  IN R2, #P_MY
  IN R3, #P_MB

  LI R8, #CUR_X
  LT R4, R8, #0
  LT R5, R8, #1

  ADD R6, R4, R1
  CMPI R6, #0
  JNN dmp_x0_ok
  LI R6, #0
dmp_x0_ok:
  CMPI R6, #722
  JNP dmp_x1_ok
  LI R6, #722
dmp_x1_ok:
  ADD R7, R5, R2
  CMPI R7, #0
  JNN dmp_y0_ok
  LI R7, #0
dmp_y0_ok:
  CMPI R7, #479
  JNP dmp_y1_ok
  LI R7, #479
dmp_y1_ok:
  ST R6, R8, #0
  ST R7, R8, #1

  CMP R4, R6
  JNZ dmp_moved
  CMP R5, R7
  JZ dmp_chk_btn
dmp_moved:
  PUSH R1
  PUSH R2
  PUSH R3
  MOV R0, R4
  MOV R1, R5
  LI R2, #6
  LI R3, #6
  CALL drv_fb_redraw_rect
  MOV R0, R6
  MOV R1, R7
  LI R2, #6
  LI R3, #6
  CALL drv_fb_redraw_rect
  POP R3
  POP R2
  POP R1

  LI R8, #K_DRAG_WIN
  LT R0, R8, #0
  CMPI R0, #-1
  JZ dmp_chk_btn
  CMPI R3, #0
  JZ dmp_stop_drag
  MULI R4, R0, #24
  ADDI R4, R4, #WINTAB
  LT R5, R4, #2
  ADD R1, R5, R1
  LT R5, R4, #3
  ADD R2, R5, R2
  CALL wm_move_window
  JMP dmp_lp
dmp_stop_drag:
  LI R0, #-1
  ST R0, R8, #0

dmp_chk_btn:
  LI R8, #K_PREV_BTN
  LT R0, R8, #0
  ST R3, R8, #0
  CMPI R3, #0
  JZ dmp_release
  CMPI R0, #0
  JNZ dmp_drag_client

  CALL wm_handle_mouse_down
  JMP dmp_lp

dmp_drag_client:
  CALL wm_send_mouse_to_active
  JMP dmp_lp

dmp_release:
  CMPI R0, #0
  JZ dmp_rel_done
  CALL wm_send_mouse_up_to_active
dmp_rel_done:
  LI R8, #K_DRAG_WIN
  LI R0, #-1
  ST R0, R8, #0
  JMP dmp_lp

dmp_done:
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET
; ==== END DRIVER mouse ====

; ============================================================================
; FAULT ISOLATION HANDLER (Vectors 1..5)
; ============================================================================
fault_handler:
  LI R0, #9000
  ADDI R0, R0, #1150
  MTSPR R0, #14
  LI R1, #K_TRAP_CNT
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0

  MFSPR R2, #12 ; ECAUSE
  SW R2, R1, #3
  MFSPR R3, #13 ; EADDR
  SW R3, R1, #6

  LI R4, #K_CUR_TASK
  LT R0, R4, #0
  ST R0, R1, #9
  LI R5, #1
  ST R5, R1, #26 ; K_FAULT_BANNER_ACTIVE = 1

  CALL k_kill_task_fault
  CALL sched_pick_next
  JMP sched_restore_current

k_kill_task_fault:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  MULI R1, R0, #TCB_SIZE
  ADDI R1, R1, #TCB_BASE
  LI R3, #2
  ST R3, R1, #42
  SW R2, R1, #54
  LT R3, R1, #43
  CMPI R3, #-1
  JZ kktf_no_win
  LI R0, #-1
  ST R0, R1, #43
  MOV R0, R3
  CALL wm_close_window
kktf_no_win:
  LI R1, #K_NUM_TASKS
  LT R0, R1, #0
  SUBI R0, R0, #1
  ST R0, R1, #0
  CALL drv_fb_draw_taskbar
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; ============================================================================
; SYSTEM CALL DISPATCHER (Vector 6: SYSCALL #imm9)
; ============================================================================
syscall_handler:
  PUSH R0
  PUSH R1
  LI R1, #K_SAVED_R0
  POP R0
  SW R0, R1, #3
  POP R0
  SW R0, R1, #0

  CALL k_save_current_task

  CALL get_cur_tcb_r1
  LW R0, R1, #48
  ADDI R0, R0, #1
  SW R0, R1, #48

  MFSPR R6, #12
  CMPI R6, #2
  JZ sys_yield
  PUSH R6
  CALL drv_kbd_poll
  CALL drv_mouse_poll
  POP R6

  CALL get_cur_tcb_r1
  LW R0, R1, #0
  LW R2, R1, #6
  LW R3, R1, #9
  LW R4, R1, #12
  LW R5, R1, #15
  LW R7, R1, #21
  LW R8, R1, #24
  LW R1, R1, #3
  CMPI R6, #0
  JZ sys_exit
  CMPI R6, #1
  JZ sys_putc
  CMPI R6, #2
  JZ sys_yield
  CMPI R6, #3
  JZ sys_get_ticks
  CMPI R6, #4
  JZ sys_spawn_app
  CMPI R6, #5
  JZ sys_kill_task
  CMPI R6, #6
  JZ sys_list_tasks
  CMPI R6, #7
  JZ sys_exec_buf
  CMPI R6, #8
  JZ sys_kernel_info
  CMPI R6, #9
  JZ sys_get_ms
  CMPI R6, #10
  JZ sys_win_open
  CMPI R6, #11
  JZ sys_win_close
  CMPI R6, #12
  JZ sys_win_move
  CMPI R6, #13
  JZ sys_win_focus
  CMPI R6, #20
  JZ sys_win_fill_rect
  CMPI R6, #21
  JZ sys_win_draw_text
  CMPI R6, #22
  JZ sys_win_put_pixel
  CMPI R6, #23
  JZ sys_win_get_pixel
  CMPI R6, #24
  JZ sys_win_flush
  CMPI R6, #25
  JZ sys_get_event
  CMPI R6, #26
  JZ sys_win_draw_num
  CMPI R6, #27
  JZ sys_win_blit_buf
  CMPI R6, #30
  JZ sys_fs_list
  CMPI R6, #31
  JZ sys_fs_read
  CMPI R6, #32
  JZ sys_fs_write
  CMPI R6, #33
  JZ sys_fs_delete
  CMPI R6, #36
  JZ sys_read_sector
  CMPI R6, #37
  JZ sys_load_src_sectors
  CMPI R6, #40
  JZ sys_net_get_id
  CMPI R6, #41
  JZ sys_net_send
  CMPI R6, #42
  JZ sys_net_recv
  CMPI R6, #43
  JZ sys_net_ping
  CMPI R6, #44
  JZ sys_net_send_file
  CMPI R6, #45
  JZ sys_net_status
  CMPI R6, #46
  JZ sys_net_sns
  CMPI R6, #47
  JZ sys_net_srrp

  LI R0, #-1
  JMP sys_ret_r0

sys_ret_r0:
  CALL get_cur_tcb_r1
  SW R0, R1, #0
  JMP sched_restore_current

sys_exit:
  LI R1, #K_CUR_TASK
  LT R0, R1, #0
  CALL k_kill_task_clean
  CALL sched_pick_next
  JMP sched_restore_current

sys_putc:
  JMP sched_restore_current

sys_yield:
  LI R0, #2500
  ; __DISABLE_TIMER__
  CALL drv_timer_init
  CALL sched_pick_next
  JMP sched_restore_current

sys_get_ticks:
  CALL drv_timer_read
  JMP sys_ret_r0

; --- SYSCALL #9: SYS_GET_MS (returns virtual_steps / 200 at nominal RATE = 200 steps/ms) ---
sys_get_ms:
  CALL drv_timer_read
  LI R1, #200
  DIV R0, R0, R1
  JMP sys_ret_r0

sys_spawn_app:
  CALL k_spawn_app
  CALL get_cur_tcb_r1
  SW R0, R1, #0
  CMPI R0, #0
  JN sched_restore_current
  LI R1, #K_CUR_TASK
  ST R0, R1, #0
  JMP sched_restore_current

sys_kill_task:
  CMPI R0, #0
  JN skt_err
  CMPI R0, #8
  JNN skt_err
  CALL k_kill_task_clean
  LI R1, #K_CUR_TASK
  LT R2, R1, #0
  CMP R0, R2
  JNZ skt_ok
  CALL sched_pick_next
  JMP sched_restore_current
skt_ok:
  LI R0, #0
  JMP sys_ret_r0
skt_err:
  LI R0, #-1
  JMP sys_ret_r0

sys_list_tasks:
  MOV R4, R0
  LI R5, #0
  LI R6, #0
  LI R7, #TCB_BASE
slt_lp:
  CMPI R5, #8
  JZ slt_done
  ST R5, R4, #0
  LT R0, R7, #42
  ST R0, R4, #1
  CMPI R0, #1
  JNZ slt_not_act
  ADDI R6, R6, #1
slt_not_act:
  LT R0, R7, #44
  ST R0, R4, #2
  LT R0, R7, #43
  ST R0, R4, #3
  LT R0, R7, #45
  ST R0, R4, #4
  LT R0, R7, #48
  ST R0, R4, #5
  LT R0, R7, #54
  ST R0, R4, #6
  LI R0, #0
  ST R0, R4, #7
  ADDI R4, R4, #8
  ADDI R7, R7, #TCB_SIZE
  ADDI R5, R5, #1
  JMP slt_lp
slt_done:
  MOV R0, R6
  JMP sys_ret_r0

sys_exec_buf:
  CALL k_spawn_custom_buf
  CALL get_cur_tcb_r1
  SW R0, R1, #0
  CMPI R0, #0
  JN sched_restore_current
  LI R1, #K_CUR_TASK
  ST R0, R1, #0
  JMP sched_restore_current

; --- SYSCALL #8: SYS_KERNEL_INFO (R0 = user_buf_ptr) ---
sys_kernel_info:
  MOV R4, R0
  LI R1, #0
  LI R2, #0
ski_lp:
  CMPI R1, #5000
  JNN ski_done
  LT R0, R1, #0
  MULI R2, R2, #2
  ADD R2, R2, R0
  ADDI R1, R1, #1
  JMP ski_lp
ski_done:
  SW R2, R4, #0 ; +0..2: kernel checksum
  LI R1, #K_TRAP_CNT
  LW R0, R1, #0
  SW R0, R4, #3 ; +3..5: trap_cnt
  LW R0, R1, #3
  SW R0, R4, #6 ; +6..8: last_cause
  LI R1, #LAST_REDRAW_TRYTES
  LW R0, R1, #0
  SW R0, R4, #9 ; +9..11: last_redraw_trytes
  LI R1, #K_NET_RX_PKTS
  LW R0, R1, #0
  SW R0, R4, #12 ; +12..14: net_rx_pkts
  LW R0, R1, #3
  SW R0, R4, #15 ; +15..17: net_drop_pkts
  MOV R0, R2
  JMP sys_ret_r0

sys_win_open:
  CALL wm_open_window
  JMP sys_ret_r0

sys_win_close:
  CALL get_cur_tcb_r1
  LT R0, R1, #43
  CMPI R0, #-1
  JZ swc_done
  LI R2, #-1
  ST R2, R1, #43
  CALL wm_close_window
swc_done:
  LI R0, #0
  JMP sys_ret_r0

sys_win_move:
  CMPI R0, #-1
  JNZ swm_have_id
  PUSH R1
  CALL get_cur_tcb_r1
  LT R0, R1, #43
  POP R1
swm_have_id:
  CALL wm_move_window
  LI R0, #0
  JMP sys_ret_r0

sys_win_focus:
  CALL wm_focus_window
  LI R0, #0
  JMP sys_ret_r0

sys_win_fill_rect:
  CALL wm_user_fill_rect
  LI R0, #0
  JMP sys_ret_r0

sys_win_draw_text:
  CALL wm_user_draw_text
  LI R0, #0
  JMP sys_ret_r0

sys_win_put_pixel:
  CALL wm_user_put_pixel
  LI R0, #0
  JMP sys_ret_r0

sys_win_get_pixel:
  CALL wm_user_get_pixel
  JMP sys_ret_r0

sys_win_flush:
  CALL wm_user_flush
  LI R0, #0
  JMP sys_ret_r0

sys_get_event:
  CALL get_cur_tcb_r1
  LT R0, R1, #53
  CMPI R0, #0
  JZ sge_empty
  SUBI R0, R0, #1
  ST R0, R1, #53
  LT R2, R1, #51
  ADDI R3, R2, #1
  CMPI R3, #16
  JN sge_hd_ok
  LI R3, #0
sge_hd_ok:
  ST R3, R1, #51
  LI R4, #K_CUR_TASK
  LT R4, R4, #0
  MULI R4, R4, #64
  MULI R2, R2, #4
  ADD R4, R4, R2
  ADDI R4, R4, #EVQ_BASE
  LT R0, R4, #0
  LT R2, R4, #1
  LT R3, R4, #2
  LT R5, R4, #3
  SW R0, R1, #0
  SW R2, R1, #3
  SW R3, R1, #6
  SW R5, R1, #9
  JMP sched_restore_current
sge_empty:
  LI R0, #0
  SW R0, R1, #0
  JMP sched_restore_current

sys_win_draw_num:
  CALL wm_user_draw_num
  LI R0, #0
  JMP sys_ret_r0

sys_win_blit_buf:
  CALL wm_user_blit_buf
  LI R0, #0
  JMP sys_ret_r0

sys_fs_list:
  MOV R2, R0
  LI R3, #FS_DIR_BUF
  LI R4, #44
  LI R5, #0
sfl_lp:
  CMPI R4, #0
  JZ sfl_done
  LT R0, R3, #0
  CMPI R0, #0
  JZ sfl_next
  MOV R0, R2
  MOV R1, R3
  LI R6, #16
  BCOPY R0, R1, R6
  MOV R2, R0
  ADDI R5, R5, #1
sfl_next:
  ADDI R3, R3, #16
  SUBI R4, R4, #1
  JMP sfl_lp
sfl_done:
  MOV R0, R5
  JMP sys_ret_r0

sys_fs_read:
  MOV R4, R2
  MOV R2, R1
  MOV R1, R0
  CALL fs_read
  JMP sys_ret_r0

sys_fs_write:
  MOV R4, R3
  MOV R3, R2
  MOV R2, R1
  MOV R1, R0
  CALL fs_write
  JMP sys_ret_r0

sys_fs_delete:
  MOV R1, R0
  CALL fs_delete
  JMP sys_ret_r0

sys_read_sector:
  CALL get_cur_tcb_r1
  LW R1, R1, #36
  ADDI R1, R1, #5400
  LI R2, #1
  CALL drv_disk_read
  JMP sys_ret_r0

sys_load_src_sectors:
  MOV R1, R0
  CALL fs_find
  CMPI R3, #-1
  JZ slss_nf
  LW R5, R3, #9
  LW R6, R3, #12
  LT R7, R3, #15
  LI R4, #0
slss_lp:
  CMP R4, R7
  JNN slss_done
  ADD R0, R5, R4
  LI R1, #0
  LMI R1, #71 ; FS_SEC_BUF at 71 * 19683
  LI R2, #1
  CALL drv_disk_read
  ADDI R0, R4, #1
  LI R1, #0
  LMI R1, #71
  LI R2, #1
  CALL drv_disk_write
  ADDI R4, R4, #1
  JMP slss_lp
slss_done:
  LI R0, #729
  ADD R0, R0, R6
  LI R1, #0
  CALL drv_disk_write_tryte
  MOV R0, R6
  JMP sys_ret_r0
slss_nf:
  LI R0, #-1
  JMP sys_ret_r0

; --- SYSCALL #40..47: StudioNet v3 Syscalls (Routed through DRIVER net v3 Entry Table) ---
sys_net_get_id:
  CALL drv_net_get_id
  JMP sys_ret_r0

; SYS_NET_SEND (#41): R0=dst_node, R1=msg_ptr, R2=msg_len -> sends SDP chat (proto=2, flags=PSH(4), sport=4200, dport=4200)
sys_net_send:
  MOV R7, R1 ; payload_ptr
  MOV R8, R2 ; payload_len (includes NUL)
  LI R1, #2  ; PROTO_SDP = 2
  LI R2, #4  ; FLAG_PSH = 4
  LI R3, #4200
  LI R4, #4200
  LI R5, #0  ; ack = 0
  CALL drv_net_send
  LI R0, #0
  JMP sys_ret_r0

sys_net_recv:
  CALL drv_net_poll
  LI R1, #K_NET_CHAT_COUNT
  LT R0, R1, #0
  JMP sys_ret_r0

sys_net_ping:
  CALL drv_net_ping
  JMP sys_ret_r0

sys_net_send_file:
  CALL drv_net_send_file
  JMP sys_ret_r0

sys_net_status:
  CALL drv_net_status
  JMP sys_ret_r0

sys_net_sns:
  CALL drv_net_sns
  JMP sys_ret_r0

sys_net_srrp:
  CALL drv_net_srrp
  JMP sys_ret_r0

; ============================================================================
; TASK MANAGEMENT
; ============================================================================
k_find_free_task:
  PUSH R1
  PUSH R2
  LI R0, #0
  LI R1, #TCB_BASE
kfft_lp:
  CMPI R0, #8
  JZ kfft_full
  LT R2, R1, #42
  CMPI R2, #0
  JZ kfft_ret
  ADDI R1, R1, #TCB_SIZE
  ADDI R0, R0, #1
  JMP kfft_lp
kfft_full:
  LI R0, #0
  LI R1, #TCB_BASE
kfft_lp2:
  CMPI R0, #8
  JZ kfft_evict
  LT R2, R1, #42
  CMPI R2, #1
  JNZ kfft_ret
  ADDI R1, R1, #TCB_SIZE
  ADDI R0, R0, #1
  JMP kfft_lp2
kfft_evict:
  LI R0, #2
  CALL k_kill_task_clean
  LI R0, #2
kfft_ret:
  POP R2
  POP R1
  RET

k_init_task_slot:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  MOV R4, R0 ; task_id
  MOV R5, R1 ; app_id
  CMPI R5, #4
  JZ kits_asm_bounds
  MULI R6, R4, #2
  ADDI R6, R6, #10
  LI R7, #0
  LMI R7, #1 ; 19683
  MUL R6, R6, R7
  ADD R8, R6, R7
  ADD R8, R8, R7 ; ULIMIT = UBASE + 39366
  JMP kits_bounds_ok
kits_asm_bounds:
  LI R6, #0
  LMI R6, #30
  LI R8, #0
  LMI R8, #50
kits_bounds_ok:
  MOV R0, R6
  MOV R1, R2
  MOV R2, R3
  BCOPY R0, R1, R2

  MULI R1, R4, #TCB_SIZE
  ADDI R1, R1, #TCB_BASE
  MOV R0, R1
  LI R2, #0
  LI R3, #TCB_SIZE
  BFILL R0, R2, R3

  SW R6, R1, #24 ; R8 = UBASE
  SW R6, R1, #27 ; PC = UBASE
  ADDI R0, R6, #4500
  CMPI R5, #6
  JNZ kits_chk_11
  ADDI R0, R6, #6950
  JMP kits_sp_ok
kits_chk_11:
  CMPI R5, #11
  JNZ kits_sp_ok
  ADDI R0, R6, #4980
kits_sp_ok:
  SW R0, R1, #30 ; SP = UBASE + 4500 (4980 for App 11)
  LI R0, #108
  ; __DISABLE_PROTECTION__
  SW R0, R1, #33 ; ESR
  SW R6, R1, #36 ; UBASE
  SW R8, R1, #39 ; ULIMIT
  LI R0, #1
  ST R0, R1, #42 ; STATE = 1
  LI R0, #-1
  ST R0, R1, #43 ; WIN_ID = -1
  ST R5, R1, #44 ; APP_ID = app_id

  LI R0, #0
  ST R0, R1, #51
  ST R0, R1, #52
  ST R0, R1, #53

  LI R2, #K_NUM_TASKS
  LT R0, R2, #0
  ADDI R0, R0, #1
  ST R0, R2, #0

  MOV R0, R4
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

k_spawn_app:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  MOV R4, R0
  CMPI R4, #0
  JN ksa_err
  CMPI R4, #12
  JNN ksa_err
  MULI R1, R4, #6
  ADDI R1, R1, #app_rom_table
  LW R2, R1, #0 ; ROM_ADDR
  LW R3, R1, #3 ; ROM_LEN
  CALL k_find_free_task
  CMPI R0, #-1
  JZ ksa_err
  MOV R1, R4
  CALL k_init_task_slot
  JMP ksa_done
ksa_err:
  LI R0, #-1
ksa_done:
  POP R4
  POP R3
  POP R2
  POP R1
  RET

k_spawn_custom_buf:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  MOV R3, R1
  MOV R4, R2
  MOV R2, R0
  CALL k_find_free_task
  CMPI R0, #-1
  JZ kscb_err
  MOV R1, R4
  CALL k_init_task_slot
  JMP kscb_done
kscb_err:
  LI R0, #-1
kscb_done:
  POP R4
  POP R3
  POP R2
  POP R1
  RET

k_kill_task_clean:
  PUSH R0
  PUSH R1
  PUSH R2
  MULI R1, R0, #TCB_SIZE
  ADDI R1, R1, #TCB_BASE
  LT R2, R1, #42
  CMPI R2, #1
  JNZ kktc_done
  LI R2, #0
  ST R2, R1, #42
  LT R2, R1, #43
  CMPI R2, #-1
  JZ kktc_no_win
  LI R0, #-1
  ST R0, R1, #43
  MOV R0, R2
  CALL wm_close_window
kktc_no_win:
  LI R1, #K_NUM_TASKS
  LT R0, R1, #0
  SUBI R0, R0, #1
  ST R0, R1, #0
  CALL drv_fb_draw_taskbar
kktc_done:
  POP R2
  POP R1
  POP R0
  RET

k_push_event:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  CMPI R0, #0
  JN kpe_done
  CMPI R0, #8
  JNN kpe_done
  MULI R5, R0, #TCB_SIZE
  ADDI R5, R5, #TCB_BASE
  LT R6, R5, #42
  CMPI R6, #1
  JNZ kpe_done
  LT R6, R5, #53
  CMPI R6, #16
  JNN kpe_done
  ADDI R6, R6, #1
  ST R6, R5, #53
  LT R6, R5, #52
  PUSH R6
  ADDI R6, R6, #1
  CMPI R6, #16
  JN kpe_tl_ok
  LI R6, #0
kpe_tl_ok:
  ST R6, R5, #52
  POP R6
  MULI R5, R0, #64
  MULI R6, R6, #4
  ADD R5, R5, R6
  ADDI R5, R5, #EVQ_BASE
  ST R1, R5, #0
  ST R2, R5, #1
  ST R3, R5, #2
  ST R4, R5, #3
kpe_done:
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; ============================================================================
; WINDOW MANAGER
; ============================================================================
wm_open_window:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8

  LI R6, #K_CUR_TASK
  LT R6, R6, #0
  MULI R8, R6, #24
  ADDI R8, R8, #WINTAB

  CMPI R2, #240
  JNP wow_w_ok
  LI R2, #240
wow_w_ok:
  CMPI R3, #160
  JNP wow_h_ok
  LI R3, #160
wow_h_ok:
  PUSH R0
  MULI R7, R6, #2
  ADDI R7, R7, #52
  LI R0, #0
  LMI R0, #1
  MUL R7, R7, R0
  POP R0

  LI R6, #1
  ST R6, R8, #0
  LI R6, #K_CUR_TASK
  LT R6, R6, #0
  ST R6, R8, #1
  ST R0, R8, #2
  ST R1, R8, #3
  ST R2, R8, #4
  ST R3, R8, #5
  SW R7, R8, #6
  ST R5, R8, #9
  LI R0, #COL_TITLE_ACT
  ST R0, R8, #10

  ADDI R0, R8, #11
  LI R1, #12
wow_title_lp:
  CMPI R1, #0
  JZ wow_title_done
  LT R2, R4, #0
  ST R2, R0, #0
  CMPI R2, #0
  JZ wow_title_pad_next
  ADDI R4, R4, #1
wow_title_pad_next:
  ADDI R0, R0, #1
  SUBI R1, R1, #1
  JMP wow_title_lp
wow_title_done:
  LI R2, #0
  ST R2, R8, #23

  PUSH R1
  CALL get_cur_tcb_r1
  ST R6, R1, #43
  POP R1

  MOV R0, R6
  CALL wm_paint_decorations_full

  MOV R0, R6
  CALL wm_focus_window

  MOV R0, R6
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

wm_paint_decorations_full:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  MULI R8, R0, #24
  ADDI R8, R8, #WINTAB
  LT R2, R8, #4
  LT R3, R8, #5
  LW R7, R8, #6
  LT R5, R8, #9

  MOV R0, R7
  MOV R1, R5
  MUL R4, R2, R3
  BFILL R0, R1, R4

  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  JMP wm_paint_titlebar

wm_paint_titlebar:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  MOV R6, R0
  MULI R8, R6, #24
  ADDI R8, R8, #WINTAB
  LT R0, R8, #0
  CMPI R0, #0
  JZ wpt_done
  LT R2, R8, #4
  LT R3, R8, #5
  LW R7, R8, #6

  LI R1, #ACTIVE_WIN
  LT R0, R1, #0
  LI R5, #COL_TITLE_INACT
  CMP R0, R6
  JNZ wpt_col_ok
  LI R5, #COL_TITLE_ACT
wpt_col_ok:
  ST R5, R8, #10

  MOV R0, R7
  MOV R1, R5
  MULI R4, R2, #12
  BFILL R0, R1, R4

  MOV R0, R7
  LI R1, #COL_WIN_BORDER
  MOV R4, R2
  BFILL R0, R1, R4

  MULI R4, R2, #11
  ADD R0, R7, R4
  LI R1, #COL_WIN_BORDER
  MOV R4, R2
  BFILL R0, R1, R4

  SUBI R4, R3, #1
  MUL R4, R4, R2
  ADD R0, R7, R4
  LI R1, #COL_WIN_BORDER
  MOV R4, R2
  BFILL R0, R1, R4

  MOV R0, R7
  LI R1, #COL_WIN_BORDER
  MOV R4, R3
  SUBI R5, R2, #1
wpt_lr_lp:
  CMPI R4, #0
  JZ wpt_lr_done
  ST R1, R0, #0
  ADD R6, R0, R5
  ST R1, R6, #0
  ADD R0, R0, R2
  SUBI R4, R4, #1
  JMP wpt_lr_lp
wpt_lr_done:

  SUBI R4, R2, #11
  LI R5, #2
  LI R6, #9
wpt_cls_lp:
  CMPI R6, #0
  JZ wpt_cls_done
  MUL R0, R5, R2
  ADD R0, R0, R4
  ADD R0, R0, R7
  LI R1, #COL_CLOSE_BTN
  LI R3, #9
  BFILL R0, R1, R3
  ADDI R5, R5, #1
  SUBI R6, R6, #1
  JMP wpt_cls_lp
wpt_cls_done:

  SUBI R0, R2, #11
  LI R1, #2
  LI R3, #'X'
  LI R4, #COL_WHITE
  LI R5, #COL_CLOSE_BTN
  CALL drv_fb_draw_char

  LI R0, #5
  LI R1, #2
  ADDI R4, R8, #11
  LT R5, R8, #10
wpt_str_lp:
  LT R3, R4, #0
  CMPI R3, #0
  JZ wpt_done
  ADDI R6, R0, #20
  CMP R6, R2
  JP wpt_done
  PUSH R4
  LI R4, #COL_WHITE
  CALL drv_fb_draw_char
  POP R4
  ADDI R0, R0, #9
  ADDI R4, R4, #1
  JMP wpt_str_lp

wpt_done:
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

wm_focus_window:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  MOV R4, R0
  CMPI R4, #0
  JN wfw_done
  CMPI R4, #8
  JNN wfw_done
  MULI R5, R4, #24
  ADDI R5, R5, #WINTAB
  LT R0, R5, #0
  CMPI R0, #0
  JZ wfw_done

  LI R1, #ACTIVE_WIN
  LT R6, R1, #0
  ST R4, R1, #0

  LI R1, #ZCOUNT
  LT R2, R1, #0
  LI R3, #0
wfw_find_lp:
  CMP R3, R2
  JNN wfw_append
  LI R1, #ZORDER
  ADD R1, R1, R3
  LT R0, R1, #0
  CMP R0, R4
  JZ wfw_shift
  ADDI R3, R3, #1
  JMP wfw_find_lp

wfw_shift:
  ADDI R0, R3, #1
  CMP R0, R2
  JNN wfw_put_top
  LI R1, #ZORDER
  ADD R1, R1, R3
  LT R0, R1, #1
  ST R0, R1, #0
  ADDI R3, R3, #1
  JMP wfw_shift

wfw_put_top:
  SUBI R3, R2, #1
  LI R1, #ZORDER
  ADD R1, R1, R3
  ST R4, R1, #0
  JMP wfw_repaint_titles

wfw_append:
  LI R1, #ZORDER
  ADD R1, R1, R2
  ST R4, R1, #0
  ADDI R2, R2, #1
  LI R1, #ZCOUNT
  ST R2, R1, #0

wfw_repaint_titles:
  CMPI R6, #-1
  JZ wfw_rep_new
  CMP R6, R4
  JZ wfw_done
  MOV R0, R6
  CALL wm_paint_titlebar
  MULI R5, R6, #24
  ADDI R5, R5, #WINTAB
  LT R0, R5, #2
  LT R1, R5, #3
  LT R2, R5, #4
  LI R3, #12
  CALL drv_fb_redraw_rect

wfw_rep_new:
  MOV R0, R4
  CALL wm_paint_titlebar
  MULI R5, R4, #24
  ADDI R5, R5, #WINTAB
  LT R0, R5, #2
  LT R1, R5, #3
  LT R2, R5, #4
  LT R3, R5, #5
  CALL drv_fb_redraw_rect

wfw_done:
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

wm_close_window:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  MOV R4, R0
  CMPI R4, #0
  JN wcw_done
  CMPI R4, #8
  JNN wcw_done
  MULI R5, R4, #24
  ADDI R5, R5, #WINTAB
  LT R0, R5, #0
  CMPI R0, #0
  JZ wcw_done
  LI R0, #0
  ST R0, R5, #0

  LI R1, #ZCOUNT
  LT R2, R1, #0
  LI R3, #0
wcw_find:
  CMP R3, R2
  JNN wcw_z_done
  LI R1, #ZORDER
  ADD R1, R1, R3
  LT R0, R1, #0
  CMP R0, R4
  JZ wcw_shift
  ADDI R3, R3, #1
  JMP wcw_find
wcw_shift:
  ADDI R0, R3, #1
  CMP R0, R2
  JNN wcw_dec_z
  LI R1, #ZORDER
  ADD R1, R1, R3
  LT R0, R1, #1
  ST R0, R1, #0
  ADDI R3, R3, #1
  JMP wcw_shift
wcw_dec_z:
  SUBI R2, R2, #1
  LI R1, #ZCOUNT
  ST R2, R1, #0
wcw_z_done:
  LI R1, #ZCOUNT
  LT R2, R1, #0
  CMPI R2, #0
  JZ wcw_no_act
  SUBI R2, R2, #1
  LI R1, #ZORDER
  ADD R1, R1, R2
  LT R0, R1, #0
  LI R1, #ACTIVE_WIN
  ST R0, R1, #0
  CALL wm_paint_titlebar
  MULI R1, R0, #24
  ADDI R1, R1, #WINTAB
  LT R0, R1, #2
  LT R2, R1, #4
  LT R1, R1, #3
  LI R3, #12
  CALL drv_fb_redraw_rect
  JMP wcw_redraw
wcw_no_act:
  LI R0, #-1
  LI R1, #ACTIVE_WIN
  ST R0, R1, #0
wcw_redraw:
  LT R0, R5, #2
  LT R1, R5, #3
  LT R2, R5, #4
  LT R3, R5, #5
  CALL drv_fb_redraw_rect
wcw_done:
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

wm_move_window:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  MOV R4, R0
  MOV R7, R2
  CMPI R4, #0
  JN wmw_done
  CMPI R4, #8
  JNN wmw_done
  MULI R8, R4, #24
  ADDI R8, R8, #WINTAB
  LT R0, R8, #0
  CMPI R0, #0
  JZ wmw_done

  LT R5, R8, #2
  LT R6, R8, #3
  LT R2, R8, #4
  LT R3, R8, #5

  CMPI R1, #0
  JNN wmw_nx0_ok
  LI R1, #0
wmw_nx0_ok:
  LI R0, #729
  SUB R0, R0, R2
  CMP R1, R0
  JNP wmw_nx1_ok
  MOV R1, R0
wmw_nx1_ok:
  CMPI R7, #0
  JNN wmw_ny0_ok
  LI R7, #0
wmw_ny0_ok:
  LI R0, #460
  SUB R0, R0, R3
  CMP R7, R0
  JNP wmw_ny1_ok
  MOV R7, R0
wmw_ny1_ok:
  ST R1, R8, #2
  ST R7, R8, #3

  MOV R0, R5
  MOV R1, R6
  CALL drv_fb_redraw_rect

  LT R0, R8, #2
  LT R1, R8, #3
  CALL drv_fb_redraw_rect

wmw_done:
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

wm_handle_mouse_down:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8

  CMPI R7, #462
  JN whmd_windows

  CMPI R6, #4
  JN whmd_done
  CMPI R6, #412
  JNN whmd_tb_new_apps
  SUBI R0, R6, #4
  LI R1, #68
  DIV R2, R0, R1
  JMP whmd_tb_spawn
whmd_tb_new_apps:
  CMPI R6, #650
  JNN whmd_tb_net_try
  SUBI R0, R6, #412
  LI R1, #60
  DIV R2, R0, R1
  ADDI R2, R2, #6
  JMP whmd_tb_spawn
whmd_tb_net_try:
  LI R2, #10
  CMPI R6, #693
  JN whmd_tb_spawn
  LI R2, #11
whmd_tb_spawn:
  LI R1, #K_FAULT_BANNER_ACTIVE
  LI R0, #0
  ST R0, R1, #0
  MOV R0, R2
  CALL k_spawn_app
  CMPI R0, #0
  JN whmd_done
  LI R1, #K_CUR_TASK
  ST R0, R1, #0
  JMP whmd_done

whmd_windows:
  LI R1, #ZCOUNT
  LT R2, R1, #0
  SUBI R2, R2, #1
whmd_zlp:
  CMPI R2, #0
  JN whmd_done
  LI R1, #ZORDER
  ADD R1, R1, R2
  LT R3, R1, #0
  MULI R8, R3, #24
  ADDI R8, R8, #WINTAB
  LT R0, R8, #0
  CMPI R0, #0
  JZ whmd_znext
  LT R4, R8, #2
  CMP R6, R4
  JN whmd_znext
  LT R5, R8, #4
  ADD R5, R4, R5
  CMP R6, R5
  JNN whmd_znext
  LT R4, R8, #3
  CMP R7, R4
  JN whmd_znext
  LT R5, R8, #5
  ADD R5, R4, R5
  CMP R7, R5
  JNN whmd_znext

  MOV R0, R3
  CALL wm_focus_window

  LT R4, R8, #2
  SUB R4, R6, R4
  LT R5, R8, #3
  SUB R5, R7, R5

  CMPI R5, #12
  JNN whmd_client_click

  LT R0, R8, #4
  SUBI R0, R0, #13
  CMP R4, R0
  JN whmd_start_drag

  LT R0, R8, #1
  CALL k_kill_task_clean
  JMP whmd_done

whmd_start_drag:
  LI R1, #K_DRAG_WIN
  ST R3, R1, #0
  JMP whmd_done

whmd_client_click:
  LT R0, R8, #1
  LI R1, #2 ; EV_MOUSE_DOWN = 2
  SUBI R2, R4, #1
  SUBI R3, R5, #12
  LI R4, #1
  CALL k_push_event
  JMP whmd_done

whmd_znext:
  SUBI R2, R2, #1
  JMP whmd_zlp

whmd_done:
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

wm_send_mouse_to_active:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R8
  LI R1, #ACTIVE_WIN
  LT R0, R1, #0
  CMPI R0, #-1
  JZ wsmta_done
  MULI R8, R0, #24
  ADDI R8, R8, #WINTAB
  LT R0, R8, #0
  CMPI R0, #0
  JZ wsmta_done
  LT R2, R8, #2
  SUB R2, R6, R2
  SUBI R2, R2, #1
  CMPI R2, #0
  JNN wsmta_x0_ok
  LI R2, #0
wsmta_x0_ok:
  LT R4, R8, #4
  SUBI R4, R4, #3
  CMP R2, R4
  JNP wsmta_x1_ok
  MOV R2, R4
wsmta_x1_ok:
  LT R3, R8, #3
  SUB R3, R7, R3
  SUBI R3, R3, #12
  CMPI R3, #0
  JNN wsmta_y0_ok
  LI R3, #0
wsmta_y0_ok:
  LT R4, R8, #5
  SUBI R4, R4, #14
  CMP R3, R4
  JNP wsmta_y1_ok
  MOV R3, R4
wsmta_y1_ok:
  LT R0, R8, #1
  LI R1, #3 ; EV_MOUSE_MOVE = 3
  LI R4, #1
  CALL k_push_event
wsmta_done:
  POP R8
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

wm_send_mouse_up_to_active:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R8
  LI R1, #ACTIVE_WIN
  LT R0, R1, #0
  CMPI R0, #-1
  JZ wsmua_done
  MULI R8, R0, #24
  ADDI R8, R8, #WINTAB
  LT R0, R8, #0
  CMPI R0, #0
  JZ wsmua_done
  LT R2, R8, #2
  SUB R2, R6, R2
  SUBI R2, R2, #1
  LT R3, R8, #3
  SUB R3, R7, R3
  SUBI R3, R3, #12
  LT R0, R8, #1
  LI R1, #4 ; EV_MOUSE_UP = 4
  LI R4, #0
  CALL k_push_event
wsmua_done:
  POP R8
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

wm_get_cur_win_r8:
  PUSH R0
  PUSH R1
  CALL get_cur_tcb_r1
  LT R0, R1, #43
  CMPI R0, #0
  JN wgcw_none
  CMPI R0, #8
  JNN wgcw_none
  MULI R8, R0, #24
  ADDI R8, R8, #WINTAB
  LT R0, R8, #0
  CMPI R0, #0
  JZ wgcw_none
  POP R1
  POP R0
  RET
wgcw_none:
  LI R8, #0
  POP R1
  POP R0
  RET

wm_user_fill_rect:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  CALL wm_get_cur_win_r8
  CMPI R8, #0
  JZ wufr_done
  ADDI R0, R0, #1
  ADDI R1, R1, #12
  LT R5, R8, #4
  LT R6, R8, #5
  SUBI R5, R5, #1
  SUBI R6, R6, #1
  CMPI R0, #1
  JNN wufr_x0_ok
  LI R0, #1
wufr_x0_ok:
  CMPI R1, #12
  JNN wufr_y0_ok
  LI R1, #12
wufr_y0_ok:
  ADD R7, R0, R2
  CMP R7, R5
  JNP wufr_x1_ok
  SUB R2, R5, R0
wufr_x1_ok:
  ADD R7, R1, R3
  CMP R7, R6
  JNP wufr_y1_ok
  SUB R3, R6, R1
wufr_y1_ok:
  CMPI R2, #0
  JNP wufr_done
  CMPI R3, #0
  JNP wufr_done

  LT R5, R8, #4
  LW R7, R8, #6
  MUL R6, R1, R5
  ADD R6, R6, R0
  ADD R6, R6, R7
wufr_row_lp:
  CMPI R3, #0
  JZ wufr_done
  MOV R0, R6
  MOV R1, R4
  MOV R7, R2
  BFILL R0, R1, R7
  ADD R6, R6, R5
  SUBI R3, R3, #1
  JMP wufr_row_lp
wufr_done:
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

wm_user_draw_text:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  CALL wm_get_cur_win_r8
  CMPI R8, #0
  JZ wudt_done
  ADDI R0, R0, #1
  ADDI R1, R1, #12
  LT R6, R8, #5
  ADDI R7, R1, #9
  CMP R7, R6
  JNN wudt_done
  MOV R6, R2
  MOV R5, R4
  MOV R4, R3
  LT R2, R8, #4
  LW R7, R8, #6
wudt_lp:
  LT R3, R6, #0
  CMPI R3, #0
  JZ wudt_done
  ADDI R8, R0, #9
  CMP R8, R2
  JNN wudt_done
  CALL drv_fb_draw_char
  ADDI R0, R0, #9
  ADDI R6, R6, #1
  JMP wudt_lp
wudt_done:
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

wm_user_put_pixel:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R8
  CALL wm_get_cur_win_r8
  CMPI R8, #0
  JZ wupp_done
  ADDI R0, R0, #1
  ADDI R1, R1, #12
  LT R3, R8, #4
  LT R4, R8, #5
  SUBI R3, R3, #1
  SUBI R4, R4, #1
  CMPI R0, #1
  JN wupp_done
  CMP R0, R3
  JNN wupp_done
  CMPI R1, #12
  JN wupp_done
  CMP R1, R4
  JNN wupp_done
  LT R3, R8, #4
  MUL R1, R1, R3
  ADD R1, R1, R0
  LW R4, R8, #6
  ADD R1, R1, R4
  ST R2, R1, #0
wupp_done:
  POP R8
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

wm_user_get_pixel:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R8
  CALL wm_get_cur_win_r8
  CMPI R8, #0
  JZ wugp_zero
  ADDI R0, R0, #1
  ADDI R1, R1, #12
  LT R3, R8, #4
  MUL R1, R1, R3
  ADD R1, R1, R0
  LW R4, R8, #6
  ADD R1, R1, R4
  LT R0, R1, #0
  JMP wugp_done
wugp_zero:
  LI R0, #0
wugp_done:
  POP R8
  POP R4
  POP R3
  POP R2
  POP R1
  RET

wm_user_flush:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R8
  CALL wm_get_cur_win_r8
  CMPI R8, #0
  JZ wuf_done
  LT R4, R8, #2
  LT R5, R8, #3
  CMPI R2, #0
  JZ wuf_full_client
  ADD R0, R0, R4
  ADDI R0, R0, #1
  ADD R1, R1, R5
  ADDI R1, R1, #12
  CALL drv_fb_redraw_rect
  JMP wuf_done
wuf_full_client:
  ADDI R0, R4, #1
  ADDI R1, R5, #12
  LT R2, R8, #4
  SUBI R2, R2, #2
  LT R3, R8, #5
  SUBI R3, R3, #13
  CALL drv_fb_redraw_rect
wuf_done:
  POP R8
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

wm_user_blit_buf:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  CALL wm_get_cur_win_r8
  CMPI R8, #0
  JZ wubb_done
  ADDI R0, R0, #1
  ADDI R1, R1, #12
  LT R6, R8, #4
  LW R7, R8, #6
  MUL R1, R1, R6
  ADD R1, R1, R0
  ADD R7, R7, R1
wubb_row_lp:
  CMPI R3, #0
  JNP wubb_done
  CMPI R5, #0
  JNZ wubb_from_win
  MOV R0, R7
  MOV R1, R4
  MOV R8, R2
  BCOPY R0, R1, R8
  JMP wubb_nx
wubb_from_win:
  MOV R0, R4
  MOV R1, R7
  MOV R8, R2
  BCOPY R0, R1, R8
wubb_nx:
  ADD R7, R7, R6
  ADD R4, R4, R2
  SUBI R3, R3, #1
  JMP wubb_row_lp
wubb_done:
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

wm_user_draw_num:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  MOV R6, R0
  MOV R7, R1
  MOV R0, R2
  MOV R1, R3
  CALL k_format_num
  MOV R0, R6
  MOV R1, R7
  LI R2, #K_NUM_FMT_BUF
  MOV R3, R4
  MOV R4, R5
  CALL wm_user_draw_text
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

k_format_num:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  LI R2, #K_NUM_FMT_BUF
  CMPI R1, #3
  JZ kfn_tern

  CMPI R0, #0
  JP kfn_dec_pos
  JN kfn_dec_neg
  LI R3, #'0'
  ST R3, R2, #0
  LI R3, #0
  ST R3, R2, #1
  JMP kfn_done
kfn_dec_neg:
  LI R3, #'-'
  ST R3, R2, #0
  ADDI R2, R2, #1
  NEG R0, R0
kfn_dec_pos:
  LI R3, #K_NUM_FMT_BUF + 20
  LI R4, #0
  LI R5, #10
kfn_dec_lp:
  CMPI R0, #0
  JZ kfn_dec_rev
  MOD R6, R0, R5
  DIV R0, R0, R5
  ADDI R6, R6, #48
  ST R6, R3, #0
  ADDI R3, R3, #1
  ADDI R4, R4, #1
  JMP kfn_dec_lp
kfn_dec_rev:
  CMPI R4, #0
  JZ kfn_dec_term
  SUBI R3, R3, #1
  SUBI R4, R4, #1
  LT R0, R3, #0
  ST R0, R2, #0
  ADDI R2, R2, #1
  JMP kfn_dec_rev
kfn_dec_term:
  LI R0, #0
  ST R0, R2, #0
  JMP kfn_done

kfn_tern:
  CMPI R0, #0
  JNZ kfn_tern_nz
  LI R3, #'0'
  ST R3, R2, #0
  LI R3, #0
  ST R3, R2, #1
  JMP kfn_done
kfn_tern_nz:
  LI R3, #K_NUM_FMT_BUF + 20
  LI R4, #0
  LI R5, #3
kfn_tern_lp:
  CMPI R0, #0
  JZ kfn_dec_rev
  MOD R6, R0, R5
  DIV R0, R0, R5
  CMPI R6, #2
  JNZ kfn_t_chk_n2
  LI R6, #-1
  ADDI R0, R0, #1
  JMP kfn_t_ch
kfn_t_chk_n2:
  CMPI R6, #-2
  JNZ kfn_t_ch
  LI R6, #1
  SUBI R0, R0, #1
kfn_t_ch:
  CMPI R6, #0
  JZ kfn_t_0
  JP kfn_t_1
  LI R6, #'T'
  JMP kfn_t_st
kfn_t_0:
  LI R6, #'0'
  JMP kfn_t_st
kfn_t_1:
  LI R6, #'1'
kfn_t_st:
  ST R6, R3, #0
  ADDI R3, R3, #1
  ADDI R4, R4, #1
  JMP kfn_tern_lp

kfn_done:
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; ==== DRIVER framebuffer v1 ====
; Ports: P_DC (5)
; Memory: 7900..8628, 8912..8928, 1377810..1395305, 15000000..15354293
; IRQ: None
; Entries: drv_fb_init, drv_fb_redraw_rect, drv_fb_draw_char, drv_fb_draw_taskbar
drv_fb_init:
  JMP drv_fb_init_impl
drv_fb_redraw_rect:
  JMP drv_fb_redraw_rect_impl
drv_fb_draw_char:
  JMP drv_fb_draw_char_impl
drv_fb_draw_taskbar:
  JMP drv_fb_draw_taskbar_impl
; --- End Entry Table ---

; drv_fb_init: renders CNSW boot splash + "TritOS" wordmark for ~1.5s or until key pressed,
; then clears 729x486 framebuffer, draws taskbar into TASKBAR_BUF + VRAM, zeros redraw stats -> R0=0
drv_fb_init_impl:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  LI R0, #COL_DESKTOP_BG
  OUT R0, #P_DC

  ; Render 81x81 CNSW logo (9x9 tiles at splash_logo_tiles) centered at (324, 150)
  LI R2, #729
  LI R4, #COL_GREEN
  LI R5, #COL_DESKTOP_BG
  LI R7, #1554
  LMI R7, #762 ; 15000000
  LI R3, #splash_logo_tiles - 19683
  LMI R3, #1
  LI R6, #0 ; ty = 0..8
dfbi_ty_lp:
  CMPI R6, #9
  JNN dfbi_wordmark
  LI R8, #0 ; tx = 0..8
dfbi_tx_lp:
  CMPI R8, #9
  JNN dfbi_ty_nx
  MULI R0, R8, #9
  ADDI R0, R0, #324
  MULI R1, R6, #9
  ADDI R1, R1, #150
  CALL drv_fb_draw_tile_9x9
  ADDI R3, R3, #9
  ADDI R8, R8, #1
  JMP dfbi_tx_lp
dfbi_ty_nx:
  ADDI R6, R6, #1
  JMP dfbi_ty_lp

dfbi_wordmark:
  ; Draw wordmark "TritOS" in Times New Thesuramos at (337, 245)
  LI R0, #337
  LI R1, #245
  LI R2, #729
  LI R4, #str_splash_wordmark
  LI R5, #COL_DESKTOP_BG
  LI R7, #1554
  LMI R7, #762
dfbi_wm_lp:
  LT R3, R4, #0
  CMPI R3, #0
  JZ dfbi_wait_splash
  PUSH R4
  LI R4, #COL_WHITE
  CALL drv_fb_draw_char_impl
  POP R4
  ADDI R0, R0, #9
  ADDI R4, R4, #1
  JMP dfbi_wm_lp

dfbi_wait_splash:
  CALL drv_kbd_poll
  LI R1, #K_SPLASH_DISMISSED
  LI R0, #1
  ST R0, R1, #0
  LI R0, #COL_DESKTOP_BG
  OUT R0, #P_DC
  CALL drv_fb_draw_taskbar_impl
  LI R1, #LAST_REDRAW_TRYTES
  LI R0, #0
  SW R0, R1, #0
  SW R0, R1, #3
  SW R0, R1, #6
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

; drv_fb_draw_char: R0=x, R1=y, R2=stride, R3=ascii (32..127), R4=fg, R5=bg, R7=buf_base
drv_fb_draw_char_impl:
  PUSH R3
  SUBI R3, R3, #32
  CMPI R3, #0
  JN wbdc_zero
  CMPI R3, #95
  JNP wbdc_idx_ok
wbdc_zero:
  LI R3, #0
wbdc_idx_ok:
  MULI R3, R3, #9
  PUSH R0
  LI R0, #font_9x9 - 19683
  LMI R0, #1
  ADD R3, R3, R0
  POP R0
  CALL drv_fb_draw_tile_9x9
  POP R3
  RET

; drv_fb_draw_tile_9x9: R0=x, R1=y, R2=stride, R3=tile_9trytes_ptr, R4=fg(+1), R5=bg(0), R7=buf_base (-1 -> COL_SHADOW)
drv_fb_draw_tile_9x9:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  MUL R6, R1, R2
  ADD R6, R6, R0
  ADD R6, R6, R7
  LI R8, #9
wbdc_row_lp:
  CMPI R8, #0
  JZ wbdc_done
  ST R5, R6, #0
  ST R5, R6, #1
  ST R5, R6, #2
  ST R5, R6, #3
  ST R5, R6, #4
  ST R5, R6, #5
  ST R5, R6, #6
  ST R5, R6, #7
  ST R5, R6, #8
  LT R0, R3, #0
  CMPI R0, #0
  JZ wbdc_nx_row
  SHRI R1, R0, #1
  SHLI R7, R1, #1
  SUB R7, R0, R7
  JZ wbdc_c8_done
  JN wbdc_c8_sh
  ST R4, R6, #8
  JMP wbdc_c8_done
wbdc_c8_sh:
  LI R7, #COL_SHADOW
  ST R7, R6, #8
wbdc_c8_done:
  CMPI R1, #0
  JZ wbdc_nx_row
  SHRI R0, R1, #1
  SHLI R7, R0, #1
  SUB R7, R1, R7
  JZ wbdc_c7_done
  JN wbdc_c7_sh
  ST R4, R6, #7
  JMP wbdc_c7_done
wbdc_c7_sh:
  LI R7, #COL_SHADOW
  ST R7, R6, #7
wbdc_c7_done:
  CMPI R0, #0
  JZ wbdc_nx_row
  SHRI R1, R0, #1
  SHLI R7, R1, #1
  SUB R7, R0, R7
  JZ wbdc_c6_done
  JN wbdc_c6_sh
  ST R4, R6, #6
  JMP wbdc_c6_done
wbdc_c6_sh:
  LI R7, #COL_SHADOW
  ST R7, R6, #6
wbdc_c6_done:
  CMPI R1, #0
  JZ wbdc_nx_row
  SHRI R0, R1, #1
  SHLI R7, R0, #1
  SUB R7, R1, R7
  JZ wbdc_c5_done
  JN wbdc_c5_sh
  ST R4, R6, #5
  JMP wbdc_c5_done
wbdc_c5_sh:
  LI R7, #COL_SHADOW
  ST R7, R6, #5
wbdc_c5_done:
  CMPI R0, #0
  JZ wbdc_nx_row
  SHRI R1, R0, #1
  SHLI R7, R1, #1
  SUB R7, R0, R7
  JZ wbdc_c4_done
  JN wbdc_c4_sh
  ST R4, R6, #4
  JMP wbdc_c4_done
wbdc_c4_sh:
  LI R7, #COL_SHADOW
  ST R7, R6, #4
wbdc_c4_done:
  CMPI R1, #0
  JZ wbdc_nx_row
  SHRI R0, R1, #1
  SHLI R7, R0, #1
  SUB R7, R1, R7
  JZ wbdc_c3_done
  JN wbdc_c3_sh
  ST R4, R6, #3
  JMP wbdc_c3_done
wbdc_c3_sh:
  LI R7, #COL_SHADOW
  ST R7, R6, #3
wbdc_c3_done:
  CMPI R0, #0
  JZ wbdc_nx_row
  SHRI R1, R0, #1
  SHLI R7, R1, #1
  SUB R7, R0, R7
  JZ wbdc_c2_done
  JN wbdc_c2_sh
  ST R4, R6, #2
  JMP wbdc_c2_done
wbdc_c2_sh:
  LI R7, #COL_SHADOW
  ST R7, R6, #2
wbdc_c2_done:
  CMPI R1, #0
  JZ wbdc_nx_row
  SHRI R0, R1, #1
  SHLI R7, R0, #1
  SUB R7, R1, R7
  JZ wbdc_c1_done
  JN wbdc_c1_sh
  ST R4, R6, #1
  JMP wbdc_c1_done
wbdc_c1_sh:
  LI R7, #COL_SHADOW
  ST R7, R6, #1
wbdc_c1_done:
  CMPI R0, #0
  JZ wbdc_c0_done
  JN wbdc_c0_sh
  ST R4, R6, #0
  JMP wbdc_c0_done
wbdc_c0_sh:
  LI R7, #COL_SHADOW
  ST R7, R6, #0
wbdc_c0_done:
wbdc_nx_row:
  ADDI R3, R3, #1
  ADD R6, R6, R2
  SUBI R8, R8, #1
  JMP wbdc_row_lp
wbdc_done:
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; drv_fb_redraw_rect: damage-based scanline compositor (R0=x, R1=y, R2=w, R3=h)
drv_fb_redraw_rect_impl:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8

  CMPI R0, #0
  JNN wrr_x0_ok
  ADD R2, R2, R0
  LI R0, #0
wrr_x0_ok:
  CMPI R1, #0
  JNN wrr_y0_ok
  ADD R3, R3, R1
  LI R1, #0
wrr_y0_ok:
  ADD R4, R0, R2
  CMPI R4, #729
  JNP wrr_x2_ok
  LI R4, #729
  SUB R2, R4, R0
wrr_x2_ok:
  ADD R5, R1, R3
  CMPI R5, #486
  JNP wrr_y2_ok
  LI R5, #486
  SUB R3, R5, R1
wrr_y2_ok:
  CMPI R2, #0
  JNP wrr_done
  CMPI R3, #0
  JNP wrr_done

  LI R8, #TMP_RX
  ST R0, R8, #0
  ST R1, R8, #1
  ST R2, R8, #2
  ST R3, R8, #3
  ST R4, R8, #4
  ST R5, R8, #5
  ST R1, R8, #6

  MUL R6, R2, R3
  LI R7, #LAST_REDRAW_TRYTES
  SW R6, R7, #0
  LW R0, R7, #3
  ADD R0, R0, R6
  SW R0, R7, #3
  LW R0, R7, #6
  ADDI R0, R0, #1
  SW R0, R7, #6

wrr_yloop:
  LI R8, #TMP_RX
  LT R6, R8, #6
  LT R5, R8, #5
  CMP R6, R5
  JNN wrr_done

  LI R1, #ZCOUNT
  LT R1, R1, #0
  CMPI R1, #0
  JNP wrr_slow_bg
  SUBI R1, R1, #1
  LI R2, #ZORDER
  ADD R2, R2, R1
  LT R3, R2, #0
  MULI R4, R3, #24
  ADDI R4, R4, #WINTAB
  LT R0, R4, #0
  CMPI R0, #0
  JZ wrr_slow_bg
  LT R2, R4, #3
  CMP R6, R2
  JN wrr_slow_bg
  LT R3, R4, #5
  ADD R2, R2, R3
  CMP R6, R2
  JNN wrr_slow_bg
  LT R0, R8, #0
  LT R2, R4, #2
  CMP R0, R2
  JN wrr_slow_bg
  LT R0, R8, #4
  LT R3, R4, #4
  ADD R2, R2, R3
  CMP R0, R2
  JP wrr_slow_bg
  LI R8, #TMP_Z
  ST R1, R8, #0
  JMP wrr_zloop

wrr_slow_bg:
  LI R8, #TMP_RX
  LT R0, R8, #0
  LT R2, R8, #2
  CMPI R6, #462
  JNN wrr_bg_taskbar
  ADDI R0, R0, #SCAN_BUF
  LI R1, #COL_DESKTOP_BG
  BFILL R0, R1, R2
  JMP wrr_bg_done
wrr_bg_taskbar:
  ; Copy scanline slice from TASKBAR_BUF (at 70 * 19683) so taskbar buttons & labels are preserved under cursor!
  SUBI R1, R6, #462
  MULI R1, R1, #729
  ADD R1, R1, R0
  ADDM R1, R1, #70 ; + 70 * 19683 (TASKBAR_BUF)
  ADDI R0, R0, #SCAN_BUF
  BCOPY R0, R1, R2
wrr_bg_done:

  LI R8, #TMP_Z
  LI R0, #0
  ST R0, R8, #0
wrr_zloop:
  LI R8, #ZCOUNT
  LT R1, R8, #0
  LI R8, #TMP_Z
  LT R0, R8, #0
  CMP R0, R1
  JNN wrr_zdone

  LI R2, #ZORDER
  ADD R2, R2, R0
  LT R3, R2, #0
  MULI R4, R3, #24
  ADDI R4, R4, #WINTAB

  LT R0, R4, #0
  CMPI R0, #0
  JZ wrr_znext

  LI R8, #TMP_Y
  LT R6, R8, #0
  LT R1, R4, #3
  CMP R6, R1
  JN wrr_znext
  LT R2, R4, #5
  ADD R2, R1, R2
  CMP R6, R2
  JNN wrr_znext

  LI R8, #TMP_RX
  LT R0, R8, #0
  LT R5, R8, #4
  LT R2, R4, #2
  LT R3, R4, #4
  ADD R3, R2, R3

  CMP R0, R2
  JNN wrr_ix0_ok
  MOV R0, R2
wrr_ix0_ok:
  CMP R5, R3
  JNP wrr_ix1_ok
  MOV R5, R3
wrr_ix1_ok:
  SUB R7, R5, R0
  CMPI R7, #0
  JNP wrr_znext

  SUB R6, R6, R1
  LT R3, R4, #4
  MUL R6, R6, R3
  SUB R2, R0, R2
  ADD R6, R6, R2
  LW R1, R4, #6
  ADD R1, R1, R6
  ; __PERTURB_COMPOSITOR__
  ADDI R0, R0, #SCAN_BUF
  BCOPY R0, R1, R7

wrr_znext:
  LI R8, #TMP_Z
  LT R0, R8, #0
  ADDI R0, R0, #1
  ST R0, R8, #0
  JMP wrr_zloop

wrr_zdone:
  LI R8, #TMP_Y
  LT R6, R8, #0
  LI R4, #CUR_X
  LT R1, R4, #1
  SUB R2, R6, R1
  CMPI R2, #0
  JN wrr_blit_vram
  CMPI R2, #6
  JNN wrr_blit_vram
  LT R0, R4, #0
  ADDI R0, R0, #SCAN_BUF
  LI R5, #COL_WHITE
  ST R5, R0, #0
  CMPI R2, #0
  JZ wrr_cur_r0
  ST R5, R0, #1
  CMPI R2, #1
  JZ wrr_cur_r0
  ST R5, R0, #2
wrr_cur_r0:

wrr_blit_vram:
  LI R8, #TMP_RX
  LT R0, R8, #0
  LT R6, R8, #6
  LT R2, R8, #2
  ADDI R1, R0, #SCAN_BUF
  MULI R3, R6, #729
  ADD R3, R3, R0
  LI R0, #1554
  LMI R0, #762
  ADD R0, R0, R3
  BCOPY R0, R1, R2

  LI R8, #TMP_Y
  LT R6, R8, #0
  ADDI R6, R6, #1
  ST R6, R8, #0
  JMP wrr_yloop

wrr_done:
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; drv_fb_draw_taskbar: renders taskbar (y = 462..485) and fault banner into TASKBAR_BUF (70*19683) and MMIO VRAM
drv_fb_draw_taskbar_impl:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8

  LI R1, #K_TASKBAR_INIT_DONE
  LT R0, R1, #0
  CMPI R0, #0
  JNZ wdtb_fast_fault

  ; First-time boot init of TASKBAR_BUF (70 * 19683, 17,496 trytes)
  LI R0, #1
  ST R0, R1, #0

  LI R0, #0
  LMI R0, #70
  LI R1, #COL_TASKBAR_BG
  LI R2, #17496 - 19683
  LMI R2, #1
  BFILL R0, R1, R2

  ; Top border line (729 trytes at TASKBAR_BUF + 0)
  LI R0, #0
  LMI R0, #70
  LI R1, #COL_WIN_BORDER
  LI R2, #729
  BFILL R0, R1, R2

  ; Draw 80-char taskbar buttons at x=8, y=4 inside TASKBAR_BUF
  LI R0, #8
  LI R1, #4
  LI R4, #str_taskbar_btns
  LI R2, #729
  LI R7, #0
  LMI R7, #70
wdtb_lp:
  LT R3, R4, #0
  CMPI R3, #0
  JZ wdtb_chk_fault
  PUSH R4
  LI R4, #COL_WHITE
  LI R5, #COL_TASKBAR_BTN
  CALL drv_fb_draw_char_impl
  POP R4
  ADDI R0, R0, #9
  ADDI R4, R4, #1
  JMP wdtb_lp

wdtb_fast_fault:
  ; Clear fault banner strip in TASKBAR_BUF (rows 14..22 = 9 * 729 = 6561 trytes at TASKBAR_BUF + 10206)
  LI R0, #10206 - 19683
  LMI R0, #71 ; 70*19683 + 10206
  LI R1, #COL_TASKBAR_BG
  LI R2, #6561
  BFILL R0, R1, R2

wdtb_chk_fault:
  LI R1, #K_FAULT_BANNER_ACTIVE
  LT R0, R1, #0
  CMPI R0, #0
  JZ wdtb_blit

  LI R0, #550
  LI R1, #14 ; y = 14 in TASKBAR_BUF -> screen y = 462 + 14 = 476
  LI R2, #729
  LI R7, #0
  LMI R7, #70
  LI R4, #str_fault_banner
wdtb_flp:
  LT R3, R4, #0
  CMPI R3, #0
  JZ wdtb_blit
  PUSH R4
  LI R4, #COL_WHITE
  LI R5, #COL_FAULT_BG
  CALL drv_fb_draw_char_impl
  POP R4
  ADDI R0, R0, #9
  ADDI R4, R4, #1
  JMP wdtb_flp

wdtb_blit:
  ; Copy TASKBAR_BUF (17,496 trytes) to MMIO VRAM at 15000000 + 462 * 729
  LI R0, #1554
  LMI R0, #762
  ADDI R0, R0, #2187
  ADDM R0, R0, #17
  LI R1, #0
  LMI R1, #70
  LI R2, #17496 - 19683
  LMI R2, #1
  BCOPY R0, R1, R2

  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET
; ==== END DRIVER framebuffer ====

; ============================================================================
; BLOCK-DISK FILE SYSTEM (Sector 200 Directory — Calls DRIVER disk v1 Entry Table)
; ============================================================================
fs_sync_read:
  PUSH R0
  PUSH R1
  PUSH R2
  LI R0, #FS_DIR_LBA
  LI R1, #FS_DIR_BUF
  LI R2, #1
  CALL drv_disk_read
  POP R2
  POP R1
  POP R0
  RET

fs_sync_write:
  PUSH R0
  PUSH R1
  PUSH R2
  LI R0, #FS_DIR_LBA
  LI R1, #FS_DIR_BUF
  LI R2, #1
  CALL drv_disk_write
  POP R2
  POP R1
  POP R0
  RET

fs_init:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  CALL fs_sync_read
  LI R1, #FS_MAGIC_ADDR
  LW R0, R1, #0
  LI R2, #31337 - 19683
  LMI R2, #1
  CMP R0, R2
  JZ fs_init_done

  LI R0, #FS_DIR_BUF
  LI R1, #0
  LI R2, #729
  BFILL R0, R1, R2
  LI R1, #FS_MAGIC_ADDR
  LI R0, #31337 - 19683
  LMI R0, #1
  SW R0, R1, #0
  LI R0, #210
  SW R0, R1, #3 ; NEXT_FREE_LBA = 210
  LI R0, #0
  SW R0, R1, #6 ; FILE_COUNT = 0
  CALL fs_sync_write

  LI R1, #str_fn_hello
  LI R2, #str_file_hello
  LI R3, #33
  LI R4, #1
  CALL fs_write

  LI R1, #str_fn_demo
  LI R2, #ptr_demo_src
  LW R3, R2, #3 ; length
  LW R2, R2, #0 ; start addr
  LI R4, #3
  CALL fs_write

fs_init_done:
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

fs_norm_name:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  LI R2, #FS_NAME_TMP
  LI R3, #8
fnn_lp:
  CMPI R3, #0
  JZ fnn_done
  LT R0, R1, #0
  CMPI R0, #0
  JZ fnn_pad
  CMPI R0, #32
  JZ fnn_pad
  CMPI R0, #97
  JN fnn_up_ok
  CMPI R0, #126
  JP fnn_up_ok
  SUBI R0, R0, #97
  CMPI R0, #26
  JNN fnn_rest_low
  ADDI R0, R0, #65
  JMP fnn_up_ok
fnn_rest_low:
  ADDI R0, R0, #97
fnn_up_ok:
  ST R0, R2, #0
  ADDI R1, R1, #1
  ADDI R2, R2, #1
  SUBI R3, R3, #1
  JMP fnn_lp
fnn_pad:
  LI R0, #0
  ST R0, R2, #0
  ADDI R2, R2, #1
  SUBI R3, R3, #1
  JMP fnn_lp
fnn_done:
  POP R3
  POP R2
  POP R1
  POP R0
  RET

fs_find:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R4
  PUSH R5
  CALL fs_norm_name
  LI R3, #FS_DIR_BUF
  LI R4, #44
ff_loop:
  CMPI R4, #0
  JZ ff_not_found
  LT R0, R3, #0
  CMPI R0, #0
  JZ ff_next
  LI R1, #0
ff_cmp_lp:
  CMPI R1, #8
  JZ ff_match
  ADD R2, R3, R1
  LT R0, R2, #0
  LI R2, #FS_NAME_TMP
  ADD R2, R2, R1
  LT R5, R2, #0
  CMP R0, R5
  JNZ ff_next
  ADDI R1, R1, #1
  JMP ff_cmp_lp
ff_next:
  ADDI R3, R3, #16
  SUBI R4, R4, #1
  JMP ff_loop
ff_not_found:
  LI R3, #-1
ff_match:
  POP R5
  POP R4
  POP R2
  POP R1
  POP R0
  RET

fs_write:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  MOV R0, R3
  CMPI R0, #0
  JP fw_calc_sec
  LI R5, #1
  JMP fw_sec_ok
fw_calc_sec:
  ADDI R0, R0, #728
  LI R6, #729
  DIV R5, R0, R6
fw_sec_ok:
  MOV R8, R3
  CALL fs_find
  CMPI R3, #-1
  JZ fw_new_file
  LT R6, R3, #15
  CMP R6, R5
  JN fw_alloc_lba_existing
  LW R7, R3, #9
  JMP fw_have_slot_and_lba

fw_new_file:
  LI R3, #FS_DIR_BUF
  LI R6, #44
fw_free_lp:
  CMPI R6, #0
  JZ fw_dir_full
  LT R0, R3, #0
  CMPI R0, #0
  JZ fw_alloc_new
  ADDI R3, R3, #16
  SUBI R6, R6, #1
  JMP fw_free_lp

fw_alloc_new:
  LI R6, #FS_FREE_LBA_ADDR
  LW R7, R6, #0
  ADD R0, R7, R5
  CMPI R0, #2187
  JP fw_disk_full
  SW R0, R6, #0
  LW R0, R6, #3
  ADDI R0, R0, #1
  SW R0, R6, #3
  JMP fw_have_slot_and_lba

fw_alloc_lba_existing:
  LI R6, #FS_FREE_LBA_ADDR
  LW R7, R6, #0
  ADD R0, R7, R5
  CMPI R0, #2187
  JP fw_disk_full
  SW R0, R6, #0

fw_have_slot_and_lba:
  PUSH R2
  PUSH R3
  MOV R0, R3
  LI R1, #FS_NAME_TMP
  LI R2, #8
  BCOPY R0, R1, R2
  POP R3
  POP R2
  ST R4, R3, #8
  SW R7, R3, #9
  SW R8, R3, #12
  ST R5, R3, #15

  PUSH R1
  PUSH R2
  MOV R0, R7
  MOV R1, R2
  MOV R2, R5
  CALL drv_disk_write
  POP R2
  POP R1

  PUSH R1
  MULI R0, R7, #729
  ADD R0, R0, R8
  LI R1, #0
  CALL drv_disk_write_tryte
  POP R1
  CALL fs_sync_write
  LI R0, #0
  JMP fw_exit

fw_disk_full:
  LI R0, #-1
  JMP fw_exit
fw_dir_full:
  LI R0, #-1
fw_exit:
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

.org 8940
fs_read:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  CALL fs_find
  CMPI R3, #-1
  JZ fr_nf
  LW R5, R3, #9  ; start_lba
  LW R6, R3, #12 ; file len_trytes
  CMP R6, R4
  JNP fr_len_ok
  MOV R6, R4
fr_len_ok:
  MOV R8, R6
fr_sec_lp:
  CMPI R6, #0
  JNP fr_rd_done
  PUSH R1
  PUSH R2
  MOV R0, R5
  LI R1, #0
  LMI R1, #71 ; FS_SEC_BUF at 71 * 19683
  LI R2, #1
  CALL drv_disk_read
  POP R2
  POP R1
  MOV R7, R6
  CMPI R7, #729
  JNP fr_chunk_ok
  LI R7, #729
fr_chunk_ok:
  MOV R0, R2
  LI R1, #0
  LMI R1, #71
  MOV R3, R7
  BCOPY R0, R1, R3
  MOV R2, R0
  SUB R6, R6, R7
  ADDI R5, R5, #1
  JMP fr_sec_lp
fr_rd_done:
  LI R0, #0
  ST R0, R2, #0
  MOV R0, R8
  JMP fr_exit
fr_nf:
  LI R0, #-1
fr_exit:
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

fs_delete:
  PUSH R1
  PUSH R2
  PUSH R3
  CALL fs_find
  CMPI R3, #-1
  JZ fd_nf
  LI R0, #0
  ST R0, R3, #0
  LI R1, #FS_COUNT_ADDR
  LW R2, R1, #0
  SUBI R2, R2, #1
  SW R2, R1, #0
  CALL fs_sync_write
  LI R0, #0
  JMP fd_exit
fd_nf:
  LI R0, #-1
fd_exit:
  POP R3
  POP R2
  POP R1
  RET

; ============================================================================
; APP REGISTRY TABLE & KERNEL STRINGS / FONT
; ============================================================================
app_rom_table:
  .word #app0_term_rom, #app0_term_end - app0_term_rom
  .word #app1_edit_rom, #app1_edit_end - app1_edit_rom
  .word #app2_paint_rom, #app2_paint_end - app2_paint_rom
  .word #app3_clock_rom, #app3_clock_end - app3_clock_rom
  .word #app4_asm_rom, #app4_asm_end - app4_asm_rom
  .word #app5_calc_rom, #app5_calc_end - app5_calc_rom
  .word #app6_sol_rom, #app6_sol_end - app6_sol_rom
  .word #app7_tet_rom, #app7_tet_end - app7_tet_rom
  .word #app8_write_rom, #app8_write_end - app8_write_rom
  .word #app9_sheet_rom, #app9_sheet_end - app9_sheet_rom
  .word #app10_net_rom, #app10_net_end - app10_net_rom
  .word #app11_try_rom, #app11_try_end - app11_try_rom

ptr_demo_src:
  .word #str_file_demo_asm, #str_file_demo_end - str_file_demo_asm

str_taskbar_btns:    .stringz "[TERM] [EDIT]  [PAINT] [CLOCK] [ASM]  [CALC] [SOL] [TBLK][WRITE][SHEET][NET][T3]"
str_fault_banner:    .stringz "FAULT: TASK KILLED"
str_splash_wordmark: .stringz "TritOS"
str_fn_hello:        .stringz "HELLO"
str_file_hello:      .stringz "HELLO FROM TRITOS DESKTOP 1.0 FS!"
str_fn_demo:         .stringz "DEMO"

end_of_core_kernel:

; font_9x9 moved to .org 18000
`;
}

module.exports = { buildFontAndSplashAsm, getKernelAndCoreDriversAsm };
