.mode T3
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

.org 9460
; ==== DRIVER net v3 ====
; Ports: P_NST (22), P_NID (23), P_NTX (24), P_NRX (25), P_NTF (26), P_NRF (27)
; Memory: 9700..9799, 12200..18899, 59049..65000, 1417176..1456541
; IRQ: 11
; Entries: drv_net_init, drv_net_irq, drv_net_poll, drv_net_get_id, drv_net_send, drv_net_ping, drv_net_send_file, drv_net_status, drv_net_sns, drv_net_srrp
drv_net_init:
  JMPX drv_net_init_impl
drv_net_irq:
  JMPX drv_net_irq_impl
drv_net_poll:
  JMPX drv_net_poll_impl
drv_net_get_id:
  JMPX drv_net_get_id_impl
drv_net_send:
  JMPX drv_net_send_impl
drv_net_ping:
  JMPX drv_net_ping_impl
drv_net_send_file:
  JMPX drv_net_send_file_impl
drv_net_status:
  JMPX drv_net_status_impl
drv_net_sns:
  JMPX drv_net_sns_impl
drv_net_srrp:
  JMPX drv_net_srrp_impl
; --- End Entry Table ---

str_net_ok_payload: .stringz "OK"
str_net_ack_ok:     .stringz "ACK OK"
str_net_noreply:    .stringz "NO REPLY"
str_net_toobig:     .stringz "TOO BIG FOR SPIRALOS"
str_net_nf:         .stringz "FILE NOT FOUND"

.org 10200
; drv_net_init_impl: clears net driver BSS (9700..9744, 11300..19600), sets K_NET_SEQ = 100, probes P_NST
drv_net_init_impl:
  PUSH R1
  PUSH R2
  LI R0, #9700
  LI R1, #0
  LI R2, #45
  BFILL R0, R1, R2
  LI R0, #12200 - 19683
  LMI R0, #73
  LI R1, #0
  LI R2, #5800
  BFILL R0, R1, R2
  LI R0, #0
  LMI R0, #3
  LI R1, #0
  LI R2, #5952
  BFILL R0, R1, R2
  LI R1, #K_NET_SEQ
  LI R0, #100
  SW R0, R1, #0
  IN R0, #P_NST
dni_drain_lp:
  IN R0, #P_NRX
  CMPI R0, #0
  JNPX dni_done
  LI R0, #1
  OUT R0, #P_NRX
  JMPX dni_drain_lp
dni_done:
  LI R0, #0
  POP R2
  POP R1
  RET

; drv_net_get_id_impl: returns R0 = local 16-bit StudioNet Node ID from Port 23 (P_NID)
drv_net_get_id_impl:
  IN R0, #P_NID
  RET

; drv_net_irq_impl: Vector 11 (IRQ_NET) interrupt handler
drv_net_irq_impl:
  PUSH R0
  PUSH R1
  LI R1, #K_SAVED_R0
  POP R0
  SW R0, R1, #3
  POP R0
  SW R0, R1, #0
  MFSPR R0, #11
  CMPI R0, #95
  JNX dni_sup
  CALL k_save_current_task
  LI R1, #K_NET_IRQS
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  CALLX drv_net_poll_impl
  JMP sched_restore_current
dni_sup:
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  LI R1, #K_NET_IRQS
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  CALLX drv_net_poll_impl
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  LI R1, #K_SAVED_R0
  LW R0, R1, #0
  LW R1, R1, #3
  IRET

; drv_net_send_impl: builds and transmits 16-byte StudioNet header + payload
; Inputs:
;   R0 = dst_node (u16)
;   R1 = proto (u8: 1=SNS, 2=SDP, 3=SSP)
;   R2 = flags (u8: 1=SYN, 2=ACK, 4=PSH, 8=FIN)
;   R3 = sport (u16)
;   R4 = dport (u16)
;   R5 = ack (u16)
;   R7 = payload_ptr
;   R8 = payload_len (0..480)
; Output:
;   R0 = total frame bytes sent (16 + payload_len)
drv_net_send_impl:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  CMPI R8, #0
  JNX dns_zero_len
  CMPI R8, #480
  JNPX dns_len_ok
  LI R8, #480
  JMPX dns_len_ok
dns_zero_len:
  LI R8, #0
dns_len_ok:
  LI R6, #K_NET_TX_BUF - 19683
  LMI R6, #73 ; R6 = K_NET_TX_BUF
  PUSH R4 ; save dport
  PUSH R5 ; save ack
  LI R4, #256
  ; 0..1: dst_node u16 LE
  MOD R5, R0, R4
  ST R5, R6, #0
  DIV R5, R0, R4
  MOD R5, R5, R4
  ST R5, R6, #1
  ; 2..3: src_node u16 LE (from Port 23 P_NID)
  IN R0, #P_NID
  MOD R5, R0, R4
  ST R5, R6, #2
  DIV R5, R0, R4
  MOD R5, R5, R4
  ST R5, R6, #3
  ; 4: proto u8
  MOD R5, R1, R4
  ST R5, R6, #4
  ; 5: flags u8
  MOD R5, R2, R4
  ST R5, R6, #5
  ; 6..7: sport u16 LE
  MOD R5, R3, R4
  ST R5, R6, #6
  DIV R5, R3, R4
  MOD R5, R5, R4
  ST R5, R6, #7
  POP R2 ; ack
  POP R1 ; dport
  ; 8..9: dport u16 LE
  MOD R5, R1, R4
  ST R5, R6, #8
  DIV R5, R1, R4
  MOD R5, R5, R4
  ST R5, R6, #9
  ; 10..11: seq u16 LE (post-increment K_NET_SEQ, starting at 100)
  LI R3, #K_NET_SEQ
  LW R0, R3, #0
  ADDI R1, R0, #1
  SW R1, R3, #0
  MOD R5, R0, R4
  ST R5, R6, #10
  DIV R5, R0, R4
  MOD R5, R5, R4
  ST R5, R6, #11
  ; 12..13: ack u16 LE
  MOD R5, R2, R4
  ST R5, R6, #12
  DIV R5, R2, R4
  MOD R5, R5, R4
  ST R5, R6, #13
  ; 14..15: len u16 LE
  MOV R0, R8
  ; __PERTURB_NET_CHECKSUM__
  MOD R5, R0, R4
  ST R5, R6, #14
  DIV R5, R0, R4
  MOD R5, R5, R4
  ST R5, R6, #15
  ; Copy R8 payload bytes (masked to 0..255) from R7 into K_NET_TX_BUF + 16
  LI R3, #0
dns_cp_lp:
  CMP R3, R8
  JNNX dns_cp_done
  ADD R0, R7, R3
  LT R0, R0, #0
  MOD R0, R0, R4
  CMPI R0, #0
  JNNX dns_b_pos
  ADDI R0, R0, #256
dns_b_pos:
  ADD R5, R6, R3
  ADDI R5, R5, #16
  ST R0, R5, #0
  ADDI R3, R3, #1
  JMPX dns_cp_lp
dns_cp_done:
  ; Push 16 + R8 bytes to Port 26 (P_NTF) and trigger Port 24 (P_NTX)
  ADDI R5, R8, #16
  LI R3, #0
dns_tx_lp:
  CMP R3, R5
  JNNX dns_tx_trig
  ADD R0, R6, R3
  LT R0, R0, #0
  OUT R0, #P_NTF
  ADDI R3, R3, #1
  JMPX dns_tx_lp
dns_tx_trig:
  OUT R5, #P_NTX
  LI R1, #K_NET_TX_PKTS
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  MOV R0, R5
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

; drv_net_ping_impl: R0 = dst_node -> sends SDP port-7 PSH request ("PING") and starts RTT timer
drv_net_ping_impl:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R7
  PUSH R8
  PUSH R0 ; save dst_node
  CALL drv_timer_read
  LI R1, #K_NET_PING_SENT_TICKS
  SW R0, R1, #0
  LI R1, #K_NET_PING_PENDING
  LI R0, #1
  ST R0, R1, #0
  LI R1, #K_NET_LAST_RTT
  LI R0, #0
  SW R0, R1, #0
  LI R1, #K_NET_STATUS_MSG - 19683
  LMI R1, #73
  ST R0, R1, #0
  ; Store 4-byte payload "PING" at K_NET_TX_BUF + 200
  LI R7, #K_NET_TX_BUF - 19683
  LMI R7, #73
  ADDI R7, R7, #200
  LI R2, #'P'
  ST R2, R7, #0
  LI R2, #'I'
  ST R2, R7, #1
  LI R2, #'N'
  ST R2, R7, #2
  LI R2, #'G'
  ST R2, R7, #3
  POP R0 ; dst_node
  LI R1, #2 ; PROTO_SDP = 2
  LI R2, #4 ; FLAG_PSH = 4
  LI R3, #7 ; sport = 7
  LI R4, #7 ; dport = 7
  LI R5, #0 ; ack = 0
  LI R8, #4 ; payload_len = 4
  CALLX drv_net_send_impl
  LI R0, #0
  POP R8
  POP R7
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

; drv_net_fmt_hex4: formats 16-bit integer R6 as 4 uppercase hex chars + ':' at R0[0..4]
drv_net_fmt_hex4:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R6
  LI R1, #3 ; pos = 3..0
  LI R2, #16
dnfh_lp:
  CMPI R1, #0
  JNX dnfh_colon
  MOD R3, R6, R2
  DIV R6, R6, R2
  CMPI R3, #10
  JNX dnfh_dig
  ADDI R3, R3, #55 ; 'A' - 10
  JMPX dnfh_st
dnfh_dig:
  ADDI R3, R3, #48 ; '0'
dnfh_st:
  ADD R4, R0, R1
  ST R3, R4, #0
  SUBI R1, R1, #1
  JMPX dnfh_lp
dnfh_colon:
  LI R3, #':'
  ST R3, R0, #4
  POP R6
  POP R4
  POP R3
  POP R2
  POP R1
  RET

; drv_net_poll_impl: drains hardware NIC RX queue into 10-slot K_NET_Q_BASE, validates 16-byte header,
; dispatches SDP Chat (4200), SDP Ping (7), SSP File Push & ACK (4300/4301), and checks Ping timeout
drv_net_poll_impl:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  LI R8, #0 ; burst accepted counter (caps at 10 per drain burst)
knrd_hw_lp:
  IN R0, #P_NRX ; pending RX frame length
  CMPI R0, #0
  JNPX knrd_process
  ; Drop and count if burst >= 10, K_NET_COUNT >= 10, frame_len < 16, or frame_len > 512
  CMPI R8, #10
  JNNX knrd_drop_hw
  LI R1, #K_NET_COUNT
  LT R2, R1, #0
  CMPI R2, #10
  JNNX knrd_drop_hw
  CMPI R0, #16
  JNX knrd_drop_hw
  CMPI R0, #512
  JPX knrd_drop_hw

  ; Accept frame into K_NET_Q_BASE + K_NET_TAIL * 516
  ADDI R2, R2, #1
  ST R2, R1, #0 ; K_NET_COUNT++
  ADDI R8, R8, #1
  LI R1, #K_NET_TAIL
  LT R3, R1, #0
  ADDI R4, R3, #1
  CMPI R4, #10
  JNX knrd_tl_ok
  LI R4, #0
knrd_tl_ok:
  ST R4, R1, #0
  MULI R3, R3, #516
  LI R4, #K_NET_Q_BASE - 19683
  LMI R4, #73
  ADD R4, R4, R3
  ST R0, R4, #0 ; slot[0] = frame_len
  ADDI R4, R4, #4
  MOV R5, R0 ; count = frame_len
knrd_rd_lp:
  CMPI R5, #0
  JNPX knrd_rd_done
  IN R6, #P_NRF
  ST R6, R4, #0
  ADDI R4, R4, #1
  SUBI R5, R5, #1
  JMPX knrd_rd_lp
knrd_rd_done:
  LI R0, #1
  OUT R0, #P_NRX ; pop hardware RX frame
  JMPX knrd_hw_lp

knrd_drop_hw:
  LI R1, #K_NET_DROP_PKTS
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  LI R0, #1
  OUT R0, #P_NRX
  JMPX knrd_hw_lp

knrd_process:
  LI R1, #K_NET_COUNT
  LT R0, R1, #0
  CMPI R0, #0
  JNPX knrd_chk_timeout
  SUBI R0, R0, #1
  ST R0, R1, #0
  LI R1, #K_NET_HEAD
  LT R2, R1, #0
  ADDI R3, R2, #1
  CMPI R3, #10
  JNX knrd_hd_ok
  LI R3, #0
knrd_hd_ok:
  ST R3, R1, #0
  MULI R2, R2, #516
  LI R4, #K_NET_Q_BASE - 19683
  LMI R4, #73
  ADD R4, R4, R2
  LT R3, R4, #0 ; frame_len
  ADDI R4, R4, #4 ; R4 = &frame[0]

  ; Validate 16-byte StudioNet header: payload_len = frame[14] + frame[15]*256
  LT R5, R4, #14
  LT R6, R4, #15
  MULI R6, R6, #256
  ADD R5, R5, R6 ; R5 = payload_len
  CMPI R5, #0
  JNX knrd_bad_frame
  CMPI R5, #480
  JPX knrd_bad_frame
  ADDI R0, R5, #16
  CMP R3, R0
  JNZX knrd_bad_frame

  ; Extract src_node = frame[2] + frame[3]*256, proto = frame[4], flags = frame[5]
  LT R6, R4, #2
  LT R7, R4, #3
  MULI R7, R7, #256
  ADD R6, R6, R7 ; R6 = src_node
  LT R7, R4, #4  ; R7 = proto
  LT R8, R4, #5  ; R8 = flags

  ; Extract sport = frame[6] + frame[7]*256 -> R1, dport = frame[8] + frame[9]*256 -> R2
  LT R1, R4, #6
  LT R0, R4, #7
  MULI R0, R0, #256
  ADD R1, R1, R0 ; R1 = sport
  LT R2, R4, #8
  LT R0, R4, #9
  MULI R0, R0, #256
  ADD R2, R2, R0 ; R2 = dport

  ; Check for duplicate Node ID clash (src_node == local_node_id)
  IN R0, #P_NID
  CMP R6, R0
  JNZX knrd_no_id_clash
  LI R0, #K_NET_CLASH_NODE
  SW R6, R0, #0
  LI R0, #K_NET_STATUS_MSG - 19683
  LMI R0, #73
  LI R3, #str_net_id_clash
  LI R7, #14
  BCOPY R0, R3, R7
  JMPX knrd_process
knrd_no_id_clash:
  CMPI R7, #1
  JZX knrd_proto_sns
  CMPI R7, #2
  JZX knrd_proto_sdp
  CMPI R7, #3
  JZX knrd_proto_ssp
  JMPX knrd_bad_frame

knrd_proto_sns:
  CMPI R2, #53
  JNZX knrd_bad_frame
  CMPI R5, #1
  JNX knrd_bad_frame
  CALLX knrd_count_valid_rx
  LT R0, R4, #16 ; SNS op (1=HELLO, 2=WHO, 3=BYE)
  CMPI R0, #1
  JZX knrd_sns_hello
  CMPI R0, #2
  JZX knrd_sns_who
  CMPI R0, #3
  JZX knrd_sns_bye
  JMPX knrd_process

knrd_sns_hello:
  ; Parse HELLO: [1, kind, os, svc_lo, svc_hi, age(4), token(4), named, num, ...name, 0]
  ; Store in 8-entry peer table at K_SNS_PEERS (18000, 32 trytes/entry)
  LI R1, #0
  LMI R1, #72
  LI R2, #0 ; idx 0..7
  LI R3, #-1 ; free_idx
knrd_sh_find:
  CMPI R2, #8
  JNNX knrd_sh_slot
  MULI R0, R2, #32
  ADD R0, R1, R0
  LT R7, R0, #0 ; node_id (0 if empty)
  CMP R7, R6
  JZX knrd_sh_found
  CMPI R7, #0
  JNZX knrd_sh_nx
  CMPI R3, #-1
  JNZX knrd_sh_nx
  MOV R3, R2
knrd_sh_nx:
  ADDI R2, R2, #1
  JMPX knrd_sh_find
knrd_sh_slot:
  MOV R2, R3
  CMPI R2, #-1
  JNZX knrd_sh_found
  LI R2, #0 ; evict slot 0 if full
knrd_sh_found:
  MULI R0, R2, #32
  ADD R0, R1, R0 ; R0 = peer entry ptr
  ST R6, R0, #0  ; +0: node_id
  LT R1, R4, #17 ; kind
  ST R1, R0, #1
  LT R1, R4, #18 ; os
  ST R1, R0, #2
  LT R1, R4, #19 ; svc_lo
  LT R2, R4, #20 ; svc_hi
  MULI R2, R2, #256
  ADD R1, R1, R2
  ST R1, R0, #3  ; +3: services
  LT R1, R4, #21 ; age_b0
  LT R2, R4, #22 ; age_b1
  MULI R2, R2, #256
  ADD R1, R1, R2
  SW R1, R0, #4  ; +4..6: age
  LT R1, R4, #25 ; tok_b0
  LT R2, R4, #26 ; tok_b1
  MULI R2, R2, #256
  ADD R1, R1, R2
  SW R1, R0, #7  ; +7..9: token_lo16
  LT R1, R4, #29 ; named
  ST R1, R0, #10
  LT R1, R4, #30 ; num
  ST R1, R0, #11
  PUSH R0
  CALL drv_timer_read
  MOV R1, R0
  POP R0
  SW R1, R0, #12 ; +12..14: lastSeen ticks
  ; Copy name from R4 + 31 into R0 + 16 (up to 15 chars)
  ADDI R1, R0, #16
  ADDI R2, R4, #31
  LI R3, #15
  BCOPY R1, R2, R3
  LI R2, #0
  ST R2, R1, #0
  JMPX knrd_process

knrd_sns_who:
  ; Reply with HELLO when WHO arrives
  LI R0, #1
  CALLX drv_net_sns_impl
  JMPX knrd_process

knrd_sns_bye:
  ; Remove src_node (R6) from peer table
  LI R1, #0
  LMI R1, #72
  LI R2, #0
knrd_sb_lp:
  CMPI R2, #8
  JNNX knrd_process
  MULI R0, R2, #32
  ADD R0, R1, R0
  LT R7, R0, #0
  CMP R7, R6
  JNZX knrd_sb_nx
  LI R7, #0
  ST R7, R0, #0
knrd_sb_nx:
  ADDI R2, R2, #1
  JMPX knrd_sb_lp

knrd_bad_frame:
  LI R1, #K_NET_DROP_PKTS
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  JMPX knrd_process

knrd_count_valid_rx:
  PUSH R0
  PUSH R1
  LI R1, #K_NET_RX_PKTS
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  LI R1, #K_NET_LAST_SRC
  SW R6, R1, #0
  POP R1
  POP R0
  RET

knrd_proto_sdp:
  ; R2 = dport, R8 = flags, R5 = payload_len
  CMPI R2, #4200
  JZX knrd_sdp_chat
  CMPI R2, #7
  JZX knrd_sdp_ping
  JMPX knrd_bad_frame

knrd_sdp_chat:
  ; Require PSH flag (flags >= 4) and payload_len >= 1
  CMPI R8, #4
  JNX knrd_bad_frame
  CMPI R5, #1
  JNX knrd_bad_frame
  CALLX knrd_count_valid_rx
  ; Format "<displayName>:<msg>" if sender in peer table, else "<HEX4>:<msg>"
  LI R0, #K_NET_LAST_CHAT - 19683
  LMI R0, #73
  CALLX drv_net_fmt_sender_prefix ; advances R0 past "<prefix>:"
  ADDI R1, R4, #16 ; src payload
  MOV R3, R5
  CMPI R3, #57
  JNPX knrd_chat_len_ok
  LI R3, #57
knrd_chat_len_ok:
  MOV R2, R3
  BCOPY R0, R1, R2
  LI R1, #0
  ST R1, R0, #0 ; ensure NUL termination
  LI R1, #K_NET_CHAT_COUNT
  LT R0, R1, #0
  ADDI R0, R0, #1
  ST R0, R1, #0
  JMPX knrd_process

knrd_sdp_ping:
  ; Distinguish request (flags == PSH = 4) vs reply (flags == ACK|PSH = 6 or ACK = 2)
  CMPI R8, #4
  JZX knrd_ping_req
  CMPI R8, #6
  JZX knrd_ping_rep
  CMPI R8, #2
  JZX knrd_ping_rep
  JMPX knrd_bad_frame

knrd_ping_req:
  CALLX knrd_count_valid_rx
  ; Extract seq = frame[10] + frame[11]*256, compute ack = (seq + 1) & 0xFFFF
  LT R0, R4, #10
  LT R3, R4, #11
  MULI R3, R3, #256
  ADD R0, R0, R3
  ADDI R0, R0, #1
  LI R3, #65536 - 19683
  LMI R3, #3
  MOD R0, R0, R3 ; R0 = ack
  ; Send SDP port-7 reply: dst=R6, proto=2, flags=6 (ACK|PSH), sport=7, dport=R1(req.sport), ack=R0, payload=R4+16, len=R5
  MOV R8, R5
  ADDI R7, R4, #16
  MOV R5, R0 ; ack
  MOV R4, R1 ; dport = req.sport
  LI R3, #7  ; sport = 7
  LI R2, #2  ; flags = ACK (2)
  LI R1, #2  ; PROTO_SDP (2)
  MOV R0, R6 ; dst = src_node
  CALLX drv_net_send_impl
  JMPX knrd_process

knrd_ping_rep:
  CALLX knrd_count_valid_rx
  CALL drv_timer_read
  LI R1, #K_NET_PING_SENT_TICKS
  LW R2, R1, #0
  SUB R0, R0, R2
  CMPI R0, #1
  JNNX knrd_rtt_ok
  LI R0, #1
knrd_rtt_ok:
  LI R1, #K_NET_LAST_RTT
  SW R0, R1, #0
  LI R1, #K_NET_PING_REPLIES
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  LI R1, #K_NET_PING_PENDING
  LI R0, #0
  ST R0, R1, #0
  LI R1, #K_NET_STATUS_MSG - 19683
  LMI R1, #73
  ST R0, R1, #0
  JMPX knrd_process

knrd_proto_ssp:
  ; R2 = dport, R1 = sport, R8 = flags, R5 = payload_len
  ; Check for SSP ACK (flags == 2) on port 4300 or 4301
  CMPI R8, #2
  JZX knrd_ssp_ack
  ; Otherwise require dport == 4300 or dport == 4301, PSH set (flags >= 4), and payload_len > 32
  CMPI R2, #80
  JZX knrd_srrp_port80
  CMPI R2, #4300
  JZX knrd_ssp_push_chk
  CMPI R2, #4301
  JZX knrd_ssp_push_chk
  JMPX knrd_bad_frame

knrd_ssp_ack:
  CMPI R1, #4300
  JZX knrd_ssp_ack_ok
  CMPI R1, #4301
  JZX knrd_ssp_ack_ok
  CMPI R2, #4300
  JZX knrd_ssp_ack_ok
  CMPI R2, #4301
  JZX knrd_ssp_ack_ok
  JMPX knrd_bad_frame
knrd_ssp_ack_ok:
  CMPI R5, #2
  JNX knrd_bad_frame
  CALLX knrd_count_valid_rx
  CALL drv_timer_read
  LI R1, #K_NET_PING_SENT_TICKS
  LW R2, R1, #0
  SUB R0, R0, R2
  CMPI R0, #1
  JNNX knrd_ack_rtt_ok
  LI R0, #1
knrd_ack_rtt_ok:
  LI R1, #K_NET_LAST_RTT
  SW R0, R1, #0
  LI R1, #K_NET_PING_REPLIES
  LW R0, R1, #0
  ADDI R0, R0, #1
  SW R0, R1, #0
  LI R0, #K_NET_STATUS_MSG - 19683
  LMI R0, #73
  LI R1, #str_net_ack_ok
  LI R2, #7
  BCOPY R0, R1, R2
  JMPX knrd_process

knrd_ssp_push_chk:
  CMPI R8, #4
  JNX knrd_bad_frame
  CMPI R5, #33
  JNX knrd_bad_frame
  CALLX knrd_count_valid_rx

  ; 1. Immediately send SSP ACK ("OK", 2 bytes, ack = seq + 1) back to src_node (R6)
  PUSH R1
  PUSH R2
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R8
  LT R0, R4, #10
  LT R3, R4, #11
  MULI R3, R3, #256
  ADD R0, R0, R3
  ADDI R5, R0, #1
  LI R3, #65536 - 19683
  LMI R3, #3
  MOD R5, R5, R3 ; ack = (seq + 1) & 0xFFFF
  MOV R3, R2     ; sport = rx.dport (4300 or 4301)
  MOV R4, R1     ; dport = rx.sport
  MOV R0, R6     ; dst = src_node
  LI R1, #3      ; PROTO_SSP = 3
  LI R2, #2      ; FLAG_ACK = 2
  LI R7, #str_net_ok_payload
  LI R8, #2      ; len = 2 ("OK")
  CALLX drv_net_send_impl
  POP R8
  POP R6
  POP R5
  POP R4
  POP R2
  POP R1

  ; 2. Inspect 32-byte name block at R4 + 16
  ADDI R1, R4, #16 ; R1 = &block[0]
  SUBI R5, R5, #32 ; R5 = data_bytes = payload_len - 32

  ; Check if TritOS metadata block: block[8] == 0 and (block[24] == 'B' or block[24] == 'T')
  LT R0, R1, #8
  CMPI R0, #0
  JNZX knrd_spiral_file
  LT R7, R1, #24 ; mode byte
  CMPI R7, #'B'
  JZX knrd_tritos_file
  CMPI R7, #'T'
  JZX knrd_tritos_file

knrd_spiral_file:
  ; File pushed by SpiralOS (single frame, no mode byte):
  ; Lands as a byte-mode file, with the name cut to TritOS's 8 characters, uppercased
  CALL fs_norm_name ; normalizes R1[0..7] uppercase into FS_NAME_TMP
  LI R0, #K_NET_LAST_FILE - 19683
  LMI R0, #73
  LI R2, #FS_NAME_TMP
  LI R3, #8
  BCOPY R0, R2, R3
  LI R2, #0
  ST R2, R0, #0
  ; Copy R5 bytes from R1 + 32 into K_SFP_BUF
  LI R0, #0
  LMI R0, #3
  ADDI R2, R1, #32
  MOV R3, R5
  BCOPY R0, R2, R3
  LI R1, #K_NET_LAST_FILE - 19683
  LMI R1, #73
  LI R2, #0
  LMI R2, #3
  MOV R3, R5
  LI R4, #1
  CALL fs_write
  LI R1, #K_NET_SFP_RX_COUNT
  LT R0, R1, #0
  ADDI R0, R0, #1
  ST R0, R1, #0
  JMPX knrd_process

knrd_tritos_file:
  ; R1 = &block[0], R7 = mode ('B' or 'T'), R5 = data_bytes, R8 = flags
  ; Extract total_trytes = block[25] + block[26]*256 (R2)
  LT R2, R1, #25
  LT R0, R1, #26
  MULI R0, R0, #256
  ADD R2, R2, R0 ; R2 = total_trytes
  ; Extract chunk_idx = block[29] + block[30]*256 (R3)
  LT R3, R1, #29
  LT R0, R1, #30
  MULI R0, R0, #256
  ADD R3, R3, R0 ; R3 = chunk_idx

  ; Check if SYN chunk (chunk_idx == 0)
  CMPI R3, #0
  JNZX knrd_tf_not_syn
  CALL fs_norm_name
  LI R0, #K_SFP_RX_NAME - 19683
  LMI R0, #73
  LI R4, #FS_NAME_TMP
  LI R6, #8
  BCOPY R0, R4, R6
  LI R4, #0
  ST R4, R0, #0
  LI R0, #K_SFP_RX_TOTAL
  SW R2, R0, #0
  LI R0, #K_SFP_RX_GOT
  SW R4, R0, #0
  LI R0, #K_SFP_RX_FIN
  ST R4, R0, #0
knrd_tf_not_syn:
  ; Check if FIN bit is set in R8 (flags >= 8)
  CMPI R8, #8
  JNX knrd_tf_unpack
  LI R0, #K_SFP_RX_FIN
  LI R4, #1
  ST R4, R0, #0

knrd_tf_unpack:
  CMPI R7, #'B'
  JZX knrd_tf_byte_mode

  ; Tryte mode ('T'): 2 bytes per tryte (signed 16-bit LE), 220 trytes per chunk
  LI R0, #2
  DIV R6, R5, R0 ; R6 = chunk_trytes = data_bytes / 2
  MULI R3, R3, #220 ; dst offset in trytes
  LI R7, #0
  LMI R7, #3
  ADD R7, R7, R3 ; dst tryte ptr
  ADDI R8, R1, #32 ; src byte ptr
  MOV R0, R6
knrd_tf_tlp:
  CMPI R0, #0
  JNPX knrd_tf_acc
  LT R4, R8, #0
  LT R5, R8, #1
  MULI R5, R5, #256
  ADD R4, R4, R5
  LI R5, #32768 - 19683
  LMI R5, #2 ; 32768
  CMP R4, R5
  JNX knrd_tf_tst
  LI R5, #65536 - 19683
  LMI R5, #3 ; 65536
  SUB R4, R4, R5
knrd_tf_tst:
  ST R4, R7, #0
  ADDI R7, R7, #1
  ADDI R8, R8, #2
  SUBI R0, R0, #1
  JMPX knrd_tf_tlp

knrd_tf_byte_mode:
  ; Byte mode ('B'): 1 byte per tryte, 440 trytes per chunk
  MOV R6, R5 ; R6 = chunk_trytes = data_bytes
  MULI R3, R3, #440
  LI R0, #0
  LMI R0, #3
  ADD R0, R0, R3 ; dst tryte ptr
  ADDI R2, R1, #32 ; src byte ptr
  MOV R3, R6
  BCOPY R0, R2, R3

knrd_tf_acc:
  LI R0, #K_SFP_RX_GOT
  LW R2, R0, #0
  ADD R2, R2, R6
  SW R2, R0, #0
  ; Only commit to FS once FIN seen AND K_SFP_RX_GOT >= K_SFP_RX_TOTAL
  LI R0, #K_SFP_RX_FIN
  LT R1, R0, #0
  CMPI R1, #0
  JZX knrd_process
  LI R0, #K_SFP_RX_TOTAL
  LW R3, R0, #0
  CMP R2, R3
  JNX knrd_process

  ; Every chunk is in! Write file to TritOS FS
  LI R0, #K_SFP_RX_FIN
  LI R1, #0
  ST R1, R0, #0
  LI R0, #K_NET_LAST_FILE - 19683
  LMI R0, #73
  LI R1, #K_SFP_RX_NAME - 19683
  LMI R1, #73
  LI R2, #8
  BCOPY R0, R1, R2
  LI R2, #0
  ST R2, R0, #0

  LI R1, #K_NET_LAST_FILE - 19683
  LMI R1, #73
  LI R2, #0
  LMI R2, #3
  ; R3 is total_trytes
  LI R4, #1
  CALL fs_write
  LI R1, #K_NET_SFP_RX_COUNT
  LT R0, R1, #0
  ADDI R0, R0, #1
  ST R0, R1, #0
  JMPX knrd_process

knrd_chk_timeout:
  ; Check Ping step budget (250,000 steps) if K_NET_PING_PENDING == 1
  LI R1, #K_NET_PING_PENDING
  LT R0, R1, #0
  CMPI R0, #0
  JZX knrd_done
  CALL drv_timer_read
  LI R2, #K_NET_PING_SENT_TICKS
  LW R2, R2, #0
  SUB R0, R0, R2
  LI R2, #-5879
  LMI R2, #13 ; -5879 + 13 * 19683 = 250000 steps
  CMP R0, R2
  JNX knrd_done
  LI R0, #0
  ST R0, R1, #0 ; K_NET_PING_PENDING = 0
  LI R1, #K_NET_LAST_RTT
  LI R0, #-1
  SW R0, R1, #0 ; K_NET_LAST_RTT = -1 (NO REPLY)
  LI R0, #K_NET_STATUS_MSG - 19683
  LMI R0, #73
  LI R1, #str_net_noreply
  LI R2, #9
  BCOPY R0, R1, R2

knrd_done:
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

; drv_net_send_file_impl: R0 = dst_node, R1 = filename_ptr -> R0 = 0 (OK), -1 (not found), -2 (too big for SpiralOS)
drv_net_send_file_impl:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  ; Save dst_node in K_NET_DST_TMP
  LI R6, #K_NET_DST_TMP
  SW R0, R6, #0
  ; Reject empty filename immediately
  LT R0, R1, #0
  CMPI R0, #0
  JZX knsff_nf
  CALL fs_find
  CMPI R3, #-1
  JZX knsff_nf
  LW R8, R3, #12 ; R8 = total_trytes
  ; Read file into K_SFP_BUF
  LI R1, #FS_NAME_TMP
  LI R2, #0
  LMI R2, #3
  MOV R4, R8
  CALL fs_read

  ; Inspect all R8 trytes in K_SFP_BUF: if every tryte is in 0..255 -> mode 'B' (66), else mode 'T' (84)
  LI R1, #0
  LMI R1, #3
  LI R2, #0
  LI R7, #'B'
knsff_scan_lp:
  CMP R2, R8
  JNNX knsff_scan_done
  ADD R3, R1, R2
  LT R0, R3, #0
  CMPI R0, #0
  JNX knsff_set_t
  CMPI R0, #255
  JPX knsff_set_t
  ADDI R2, R2, #1
  JMPX knsff_scan_lp
knsff_set_t:
  LI R7, #'T'
knsff_scan_done:
  LI R0, #K_NET_MODE_TMP
  ST R7, R0, #0

  ; Compute encoded_bytes in R5: R8 for 'B', R8 * 2 for 'T'
  MOV R5, R8
  CMPI R7, #'B'
  JZX knsff_enc_ok
  MULI R5, R8, #2
knsff_enc_ok:
  ; Check SpiralOS size limit: if encoded_bytes > 440 and dst_node in {0x0101 (257), 0x0201 (513), 0x00FE (254)} -> refuse!
  CMPI R5, #440
  JNPX knsff_size_ok
  LI R6, #K_NET_DST_TMP
  LW R0, R6, #0
  CMPI R0, #257
  JZX knsff_too_big
  CMPI R0, #513
  JZX knsff_too_big
  CMPI R0, #254
  JZX knsff_too_big
  JMPX knsff_size_ok

knsff_too_big:
  LI R0, #K_NET_STATUS_MSG - 19683
  LMI R0, #73
  LI R1, #str_net_toobig
  LI R2, #20
  BCOPY R0, R1, R2
  LI R0, #-2
  JMPX knsff_ret

knsff_size_ok:
  ; Record send timestamp for ACK RTT measurement
  CALL drv_timer_read
  LI R1, #K_NET_PING_SENT_TICKS
  SW R0, R1, #0
  LI R1, #K_NET_PING_PENDING
  LI R0, #0
  ST R0, R1, #0

  ; Loop over file trytes: R4 = tryte_offset (0..R8), K_NET_IDX_TMP = chunk_idx (0, 1, ...)
  LI R0, #K_NET_IDX_TMP
  LI R1, #0
  ST R1, R0, #0
  LI R4, #0
knsff_chunk_lp:
  CMP R4, R8
  JNNX knsff_ok
  SUB R5, R8, R4 ; remaining trytes
  LI R0, #K_NET_MODE_TMP
  LT R7, R0, #0 ; mode ('B' or 'T')
  CMPI R7, #'B'
  JZX knsff_lim_b
  ; Mode 'T': max 220 trytes (440 bytes) per chunk
  CMPI R5, #220
  JNPX knsff_c_ok
  LI R5, #220
  JMPX knsff_c_ok
knsff_lim_b:
  ; Mode 'B': max 440 trytes (440 bytes) per chunk
  CMPI R5, #440
  JNPX knsff_c_ok
  LI R5, #440
knsff_c_ok:
  ; Zero 32-byte name block at SCAN_BUF
  LI R0, #SCAN_BUF
  LI R1, #0
  LI R2, #32
  BFILL R0, R1, R2
  ; Copy normalized 8-char filename from FS_NAME_TMP into SCAN_BUF[0..7]
  LI R0, #SCAN_BUF
  LI R1, #FS_NAME_TMP
  LI R2, #8
  BCOPY R0, R1, R2
  ; Populate TritOS metadata at SCAN_BUF[24..30]
  LI R0, #SCAN_BUF
  ST R7, R0, #24 ; block[24] = mode ('B' or 'T')
  LI R2, #256
  MOD R1, R8, R2
  ST R1, R0, #25
  DIV R1, R8, R2
  MOD R1, R1, R2
  ST R1, R0, #26 ; block[25..28] = total_trytes (u32 LE)
  LI R3, #K_NET_IDX_TMP
  LT R3, R3, #0 ; chunk_idx
  MOD R1, R3, R2
  ST R1, R0, #29
  DIV R1, R3, R2
  ST R1, R0, #30 ; block[29..30] = chunk_idx (u16 LE)

  ; Encode R5 trytes from K_SFP_BUF + R4 into SCAN_BUF + 32
  LI R1, #0
  LMI R1, #3
  ADD R1, R1, R4 ; src trytes
  ADDI R2, R0, #32 ; dst bytes
  CMPI R7, #'B'
  JZX knsff_pk_b

  ; Mode 'T': pack R5 signed 16-bit LE trytes into R5 * 2 bytes
  MOV R3, R5
knsff_pk_tlp:
  CMPI R3, #0
  JNPX knsff_pk_tdone
  LT R0, R1, #0
  CMPI R0, #0
  JNNX knsff_pk_tpos
  LI R6, #65536 - 19683
  LMI R6, #3
  ADD R0, R0, R6
knsff_pk_tpos:
  LI R6, #256
  MOD R6, R0, R6
  ST R6, R2, #0
  LI R6, #256
  DIV R6, R0, R6
  ST R6, R2, #1
  ADDI R1, R1, #1
  ADDI R2, R2, #2
  SUBI R3, R3, #1
  JMPX knsff_pk_tlp
knsff_pk_tdone:
  MULI R6, R5, #2 ; R6 = chunk_data_bytes
  JMPX knsff_send_chunk

knsff_pk_b:
  ; Mode 'B': copy R5 byte trytes (0..255) directly
  MOV R0, R2
  MOV R3, R5
  BCOPY R0, R1, R3
  MOV R6, R5 ; R6 = chunk_data_bytes

knsff_send_chunk:
  ; Determine flags (R2) and port (R3/R4):
  ; Single frame (R4 == 0 and R4 + R5 >= R8): port 4300, flags = SYN|PSH|FIN (13)
  ; First chunk of multi-frame (R4 == 0 and R4 + R5 < R8): port 4300, flags = SYN|PSH (5)
  ; Middle chunk (R4 > 0 and R4 + R5 < R8): port 4301, flags = PSH (4)
  ; Last chunk (R4 > 0 and R4 + R5 >= R8): port 4301, flags = PSH|FIN (12)
  ADD R0, R4, R5 ; next_offset
  CMPI R4, #0
  JNZX knsff_after_first
  ; First chunk (chunk_idx == 0) -> port 4300
  LI R3, #4300
  CMP R0, R8
  JNNX knsff_single_flags
  LI R2, #5 ; SYN | PSH
  JMPX knsff_do_tx
knsff_single_flags:
  LI R2, #13 ; SYN | PSH | FIN
  JMPX knsff_do_tx

knsff_after_first:
  ; Subsequent chunks (chunk_idx > 0) -> port 4301
  LI R3, #4301
  CMP R0, R8
  JNNX knsff_last_flags
  LI R2, #4 ; PSH
  JMPX knsff_do_tx
knsff_last_flags:
  LI R2, #12 ; PSH | FIN

knsff_do_tx:
  PUSH R4
  PUSH R5
  PUSH R8
  LI R0, #K_NET_DST_TMP
  LW R0, R0, #0 ; dst_node
  LI R1, #3     ; PROTO_SSP = 3
  ; R2 is flags, R3 is sport
  MOV R4, R3    ; dport = sport (4300 or 4301)
  LI R5, #0     ; ack = 0
  LI R7, #SCAN_BUF
  ADDI R8, R6, #32 ; payload_len = 32 + chunk_data_bytes
  CALLX drv_net_send_impl
  POP R8
  POP R5
  POP R4

  ADD R4, R4, R5
  LI R0, #K_NET_IDX_TMP
  LT R1, R0, #0
  ADDI R1, R1, #1
  ST R1, R0, #0
  JMPX knsff_chunk_lp

knsff_ok:
  LI R0, #0
  JMPX knsff_ret
knsff_nf:
  LI R0, #K_NET_STATUS_MSG - 19683
  LMI R0, #73
  LI R1, #str_net_nf
  LI R2, #15
  BCOPY R0, R1, R2
  LI R0, #-1
knsff_ret:
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

; drv_net_status_impl: R0 = user_buf_ptr -> polls NIC & timeouts, writes status block (+0..122), returns R0 = rx_pkts
drv_net_status_impl:
  PUSH R1
  PUSH R2
  PUSH R4
  MOV R4, R0
  CALLX drv_net_poll_impl
  IN R0, #P_NID
  SW R0, R4, #0
  LI R1, #K_NET_TX_PKTS
  LW R0, R1, #0
  SW R0, R4, #3
  LI R1, #K_NET_RX_PKTS
  LW R0, R1, #0
  SW R0, R4, #6
  LI R1, #K_NET_DROP_PKTS
  LW R0, R1, #0
  SW R0, R4, #9
  LI R1, #K_NET_PING_REPLIES
  LW R0, R1, #0
  SW R0, R4, #12
  LI R1, #K_NET_LAST_RTT
  LW R0, R1, #0
  SW R0, R4, #15
  LI R1, #K_NET_CHAT_COUNT
  LT R0, R1, #0
  ST R0, R4, #18
  LT R0, R1, #1 ; K_NET_SFP_RX_COUNT
  ST R0, R4, #19
  ADDI R0, R4, #20
  LI R1, #K_NET_LAST_CHAT - 19683
  LMI R1, #73
  LI R2, #64
  BCOPY R0, R1, R2
  ADDI R0, R4, #84
  LI R1, #K_NET_LAST_FILE - 19683
  LMI R1, #73
  LI R2, #16
  BCOPY R0, R1, R2
  ADDI R0, R4, #100
  LI R1, #K_NET_STATUS_MSG - 19683
  LMI R1, #73
  LI R2, #20
  BCOPY R0, R1, R2
  LI R1, #K_NET_RX_PKTS
  LW R0, R1, #0
  POP R4
  POP R2
  POP R1
  RET


str_net_id_clash: .stringz "NODE ID CLASH"
str_srrp_413:     .stringz "SRRP/1 413 TOO BIG\nMax-Size: 32768\nLength: 0\n\n"
str_srrp_403:     .stringz "SRRP/1 403 FORBIDDEN\nLength: 0\n\n"
str_srrp_404:     .stringz "SRRP/1 404 NOT FOUND\nLength: 0\n\n"
str_srrp_201:     .stringz "SRRP/1 201 CREATED\nLength: 0\n\n"
str_srrp_200_hts: .stringz "SRRP/1 200 OK\nType: text/hts\nLength: 58\n\n<h1>TritOS 1.1.2</h1>\n<p>StudioNet 1.0</p>\n<a href=\"/\">OK</a>"
str_def_triton:   .stringz "triton"

; drv_net_fmt_sender_prefix: R6 = src_node, R0 = dst_buf -> writes "<name>:" or "<HEX4>:", advances R0
drv_net_fmt_sender_prefix:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  LI R1, #0
  LMI R1, #72
  LI R2, #0
dnfs_lp:
  CMPI R2, #8
  JNNX dnfs_hex
  MULI R3, R2, #32
  ADD R3, R1, R3
  LT R4, R3, #0
  CMP R4, R6
  JZX dnfs_found
  ADDI R2, R2, #1
  JMPX dnfs_lp
dnfs_found:
  ADDI R3, R3, #16 ; peer name
  LT R4, R3, #0
  CMPI R4, #0
  JZX dnfs_hex
dnfs_cp:
  LT R4, R3, #0
  CMPI R4, #0
  JZX dnfs_colon
  ST R4, R0, #0
  ADDI R3, R3, #1
  ADDI R0, R0, #1
  JMPX dnfs_cp
dnfs_colon:
  LI R4, #:
  ST R4, R0, #0
  ADDI R0, R0, #1
  JMPX dnfs_ret
dnfs_hex:
  CALLX drv_net_fmt_hex4
  ADDI R0, R0, #5
dnfs_ret:
  POP R4
  POP R3
  POP R2
  POP R1
  RET

knrd_srrp_port80:
  CALLX knrd_count_valid_rx
  ; R4 = &frame[0], R5 = payload_len, R6 = src_node, R8 = flags, R1 = sport, R2 = dport
  ; Check if this is an SRRP ACK frame (flags == 2, len >= 3):
  CMPI R8, #2
  JNZX ks80_data
  ; Record K_SRRP_ACK_SEQ (9770), K_SRRP_SACK (9773), K_SRRP_PEER_WIN (9776)
  LT R0, R4, #12
  LT R3, R4, #13
  MULI R3, R3, #256
  ADD R0, R0, R3 ; ack
  LI R3, #9770
  SW R0, R3, #0
  LT R0, R4, #16 ; sack_lo
  LT R2, R4, #17 ; sack_hi
  MULI R2, R2, #256
  ADD R0, R0, R2
  SW R0, R3, #3  ; K_SRRP_SACK at 9773
  LT R0, R4, #18 ; window
  ST R0, R3, #6  ; K_SRRP_PEER_WIN at 9776
  JMPX knrd_process

ks80_data:
  ; Extract seq = frame[10] + frame[11]*256 -> R0
  LT R0, R4, #10
  LT R3, R4, #11
  MULI R3, R3, #256
  ADD R0, R0, R3 ; R0 = seq

  ; Check if sport == 80 (SRRP response from server to our client request!)
  CMPI R1, #80
  JNZX ks80_req
  ; Store response payload into K_SRRP_RX_BUF (74 * 19683):
  ; If SYN (flags & 1), reset K_SRRP_RX_LEN (9777) = 0 and K_SRRP_SYN_SEQ (9780) = seq
  LI R3, #2
  MOD R2, R8, R3 ; flags % 2 == 1 if SYN set
  CMPI R2, #1
  JNZX ks80_resp_app
  LI R3, #9777
  LI R2, #0
  SW R2, R3, #0 ; K_SRRP_RX_LEN = 0
  SW R0, R3, #3 ; K_SRRP_SYN_SEQ = seq
ks80_resp_app:
  ; Compute offset = (seq - K_SRRP_SYN_SEQ) * 480 (or append at K_SRRP_RX_LEN)
  LI R3, #9777
  LW R2, R3, #0 ; cur_len
  ADD R7, R2, R5
  SW R7, R3, #0 ; K_SRRP_RX_LEN += payload_len
  LI R7, #0
  LMI R7, #74 ; 74 * 19683 = K_SRRP_RX_BUF
  ADD R7, R7, R2
  ADDI R2, R4, #16 ; payload src
  MOV R3, R5
  BCOPY R7, R2, R3
  LI R2, #0
  ST R2, R7, #0 ; NUL terminate
  ; Send 3-byte SACK + Window(8) ACK back to server
  ADDI R5, R0, #1
  LI R3, #6487
  LMI R3, #3 ; 65536
  MOD R5, R5, R3
  LI R7, #K_NET_TX_BUF - 19683
  LMI R7, #73
  ADDI R7, R7, #220
  LI R0, #1
  ST R0, R7, #0
  LI R0, #0
  ST R0, R7, #1
  LI R0, #8
  ST R0, R7, #2
  MOV R0, R6
  MOV R4, R1 ; dport = 80
  LI R1, #3
  LI R2, #2 ; FLAG_ACK
  LI R3, #49152 - 19683
  LMI R3, #2
  LI R8, #3
  CALLX drv_net_send_impl
  JMPX knrd_process

ks80_req:
  ; Incoming SRRP request to port 80!
  ; 1. Check for "../" path traversal in first 40 payload bytes -> 403 FORBIDDEN
  ADDI R2, R4, #16
  LI R3, #0
ks80_chk_dot:
  CMPI R3, #36
  JNNX ks80_chk_413
  CMP R3, R5
  JNNX ks80_chk_413
  ADD R7, R2, R3
  LT R0, R7, #0
  CMPI R0, #.
  JNZX ks80_cd_nx
  LT R0, R7, #1
  CMPI R0, #.
  JNZX ks80_cd_nx
  LT R0, R7, #2
  CMPI R0, #/
  JZX ks80_send_403
ks80_cd_nx:
  ADDI R3, R3, #1
  JMPX ks80_chk_dot

ks80_chk_413:
  ; 2. Check if header contains "Total: 9" or "Total: 6" or "Total: 5" or "Total: 4" (> 32768) -> 413 TOO BIG
  LI R3, #0
ks80_c413_lp:
  CMPI R3, #80
  JNNX ks80_ack_and_reply
  CMP R3, R5
  JNNX ks80_ack_and_reply
  ADD R7, R2, R3
  LT R0, R7, #0
  CMPI R0, #T
  JNZX ks80_c413_nx
  LT R0, R7, #1
  CMPI R0, #o
  JNZX ks80_c413_nx
  LT R0, R7, #5
  CMPI R0, #:
  JNZX ks80_c413_nx
  ; Parse integer after "Total: "
  ADDI R7, R7, #7
  LI R0, #0
ks80_p_tot:
  LT R2, R7, #0
  CMPI R2, #48
  JNX ks80_chk_tot_val
  CMPI R2, #57
  JPX ks80_chk_tot_val
  SUBI R2, R2, #48
  MULI R0, R0, #10
  ADD R0, R0, R2
  ADDI R7, R7, #1
  JMPX ks80_p_tot
ks80_chk_tot_val:
  LI R2, #-6598
  LMI R2, #2 ; 32768
  CMP R0, R2
  JPX ks80_send_413
  JMPX ks80_ack_and_reply
ks80_c413_nx:
  ADDI R3, R3, #1
  JMPX ks80_c413_lp

ks80_send_403:
  LI R7, #str_srrp_403
  LI R8, #33
  JMPX ks80_send_err
ks80_send_413:
  LI R7, #str_srrp_413
  LI R8, #47
ks80_send_err:
  LT R0, R4, #10
  LT R3, R4, #11
  MULI R3, R3, #256
  ADD R5, R0, R3
  ADDI R5, R5, #1
  MOV R0, R6
  MOV R4, R1 ; dport = req.sport
  LI R1, #3
  LI R2, #13 ; SYN|PSH|FIN
  LI R3, #80
  CALLX drv_net_send_impl
  JMPX knrd_process

ks80_ack_and_reply:
  ; Send 3-byte SACK + Window(8) ACK
  LT R0, R4, #10
  LT R3, R4, #11
  MULI R3, R3, #256
  ADD R5, R0, R3
  ADDI R5, R5, #1
  LI R3, #6487
  LMI R3, #3
  MOD R5, R5, R3
  PUSH R1
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R8
  LI R7, #K_NET_TX_BUF - 19683
  LMI R7, #73
  ADDI R7, R7, #220
  LI R0, #1
  ST R0, R7, #0
  LI R0, #0
  ST R0, R7, #1
  LI R0, #8
  ST R0, R7, #2
  MOV R0, R6
  MOV R4, R1
  LI R1, #3
  LI R2, #2
  LI R3, #80
  LI R8, #3
  CALLX drv_net_send_impl
  POP R8
  POP R6
  POP R5
  POP R4
  POP R1
  ; If FIN is set (flags >= 8), send 200 OK or 201 CREATED response
  CMPI R8, #8
  JNX knrd_process
  LI R7, #str_srrp_200_hts
  LI R8, #101
  LT R0, R4, #16
  CMPI R0, #P ; PUT or POST
  JNZX ks80_send_resp
  LT R0, R4, #17
  CMPI R0, #U ; PUT -> 201 CREATED
  JNZX ks80_send_resp
  LI R7, #str_srrp_201
  LI R8, #31
ks80_send_resp:
  MOV R0, R6
  MOV R4, R1
  LI R1, #3
  LI R2, #13 ; SYN|PSH|FIN
  LI R3, #80
  CALLX drv_net_send_impl
  JMPX knrd_process

; drv_net_sns_impl: R0 = op (1=HELLO, 2=WHO, 3=BYE, 4=set name from R1, 5=copy peers to R1, 6=toggle share)
drv_net_sns_impl:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R7
  PUSH R8
  CMPI R0, #5
  JZX dnsns_copy_peers
  CMPI R0, #6
  JZX dnsns_toggle_share
  CMPI R0, #4
  JZX dnsns_set_name
  LI R7, #K_NET_TX_BUF - 19683
  LMI R7, #73
  ADDI R7, R7, #240
  CMPI R0, #3
  JZX dnsns_bye
  CMPI R0, #2
  JZX dnsns_who
  ; Build HELLO payload
  LI R1, #1
  ST R1, R7, #0 ; op = 1 (HELLO)
  LI R1, #3
  ST R1, R7, #1 ; kind = 3 (TRITON)
  LI R1, #2
  ST R1, R7, #2 ; os = 2 (TRITOS)
  LI R1, #31
  ST R1, R7, #3 ; services lo = 31
  LI R1, #0
  ST R1, R7, #4 ; services hi = 0
  CALL drv_timer_read
  LI R2, #0
  LMI R2, #10
  DIV R0, R0, R2
  LI R2, #256
  MOD R1, R0, R2
  ST R1, R7, #5
  DIV R1, R0, R2
  MOD R1, R1, R2
  ST R1, R7, #6
  LI R1, #0
  ST R1, R7, #7
  ST R1, R7, #8
  IN R0, #P_NID
  ST R0, R7, #9
  ST R1, R7, #10
  ST R1, R7, #11
  ST R1, R7, #12
  ST R1, R7, #13 ; named = 0
  ST R1, R7, #14 ; num = 0
  ADDI R0, R7, #15
  LI R1, #str_def_triton
  LI R2, #7
  BCOPY R0, R1, R2
  LI R0, #65535 - 19683
  LMI R0, #3
  LI R1, #1
  LI R2, #4
  LI R3, #53
  LI R4, #53
  LI R5, #0
  LI R8, #22
  CALLX drv_net_send_impl
  JMPX dnsns_done
dnsns_who:
  LI R1, #2
  ST R1, R7, #0
  LI R0, #65535 - 19683
  LMI R0, #3
  LI R1, #1
  LI R2, #4
  LI R3, #53
  LI R4, #53
  LI R5, #0
  LI R8, #1
  CALLX drv_net_send_impl
  JMPX dnsns_done
dnsns_bye:
  LI R1, #3
  ST R1, R7, #0
  LI R0, #65535 - 19683
  LMI R0, #3
  LI R1, #1
  LI R2, #4
  LI R3, #53
  LI R4, #53
  LI R5, #0
  LI R8, #1
  CALLX drv_net_send_impl
  JMPX dnsns_done
dnsns_set_name:
  LI R0, #9760
  LI R2, #15
  BCOPY R0, R1, R2
  LI R2, #0
  ST R2, R0, #0
  JMPX dnsns_done
dnsns_toggle_share:
  LI R1, #K_NET_SHARE
  LT R0, R1, #0
  CMPI R0, #0
  JZX dts_on
  LI R0, #0
  JMPX dts_st
dts_on:
  LI R0, #1
dts_st:
  ST R0, R1, #0
  POP R8
  POP R7
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET
dnsns_copy_peers:
  CALLX drv_net_poll_impl
  MOV R0, R1 ; user dst ptr
  LI R1, #0
  LMI R1, #72 ; 72 * 19683 = K_SNS_PEERS
  LI R2, #256
  BCOPY R0, R1, R2
  ; Count active peers
  LI R0, #0
  LI R2, #0
dcp_lp:
  CMPI R2, #8
  JNNX dcp_ret
  MULI R3, R2, #32
  ADD R3, R1, R3
  LT R4, R3, #0
  CMPI R4, #0
  JZX dcp_nx
  ADDI R0, R0, #1
dcp_nx:
  ADDI R2, R2, #1
  JMPX dcp_lp
dcp_ret:
  POP R8
  POP R7
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET
dnsns_done:
  LI R0, #0
  POP R8
  POP R7
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

; drv_net_srrp_impl:
; If R2 == 0: polls NIC and copies K_SRRP_RX_BUF (74*19683, len K_SRRP_RX_LEN at 9777) into user buffer R1 -> returns len in R0
; If R2 > 0: sends SRRP request (single-frame or multi-frame with SACK resend) to dst_node R0 from R1 of length R2
drv_net_srrp_impl:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  CMPI R2, #0
  JPX dnsrrp_send
  CALLX drv_net_poll_impl
  LI R3, #9777
  LW R2, R3, #0 ; K_SRRP_RX_LEN
  CMPI R2, #0
  JNPX dnsrrp_empty
  MOV R0, R1
  LI R1, #0
  LMI R1, #74 ; K_SRRP_RX_BUF
  MOV R3, R2
  BCOPY R0, R1, R3
  LI R1, #0
  ST R1, R0, #0
  MOV R0, R2
  JMPX dnsrrp_ret
dnsrrp_empty:
  LI R0, #0
  JMPX dnsrrp_ret
dnsrrp_send:
  ; Reset K_SRRP_RX_LEN = 0
  LI R3, #9777
  LI R4, #0
  SW R4, R3, #0
  MOV R7, R1
  MOV R8, R2
  LI R1, #3  ; PROTO_SSP = 3
  LI R2, #13 ; SYN | PSH | FIN
  LI R3, #49152 - 19683
  LMI R3, #2
  LI R4, #80
  LI R5, #0
  CALLX drv_net_send_impl
dnsrrp_ret:
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

; ==== END DRIVER net ====

.org 18000
font_9x9:
.tryte #0,#0,#0,#0,#0,#0,#0,#0,#0  ; 32 ' '
.tryte #972,#891,#891,#162,#-81,#972,#891,#-324,#0  ; 33 '!'
.tryte #2952,#2706,#1230,#-738,#0,#0,#0,#0,#0  ; 34 '"'
.tryte #756,#3276,#420,#3276,#420,#-252,#0,#0,#0  ; 35 '#'
.tryte #243,#3267,#5958,#3240,#-585,#9798,#-2781,#-81,#0  ; 36 '

.tryte #8757,#8043,#-2844,#702,#1980,#5865,#-2199,#0,#0  ; 37 '%'
.tryte #972,#2025,#945,#2034,#5856,#3249,#-1083,#0,#0  ; 38 '&'
.tryte #972,#891,#1863,#-729,#0,#0,#0,#0,#0  ; 39 '''
.tryte #108,#936,#1863,#1458,#1458,#972,#-135,#-36,#0  ; 40 '('
.tryte #2916,#-405,#54,#54,#54,#297,#2808,#-972,#0  ; 41 ')'
.tryte #0,#2457,#1044,#3267,#1017,#2376,#-819,#0,#0  ; 42 '*'
.tryte #0,#243,#162,#3267,#-603,#162,#-81,#0,#0  ; 43 '+'
.tryte #0,#0,#0,#0,#0,#972,#162,#648,#-243  ; 44 ','
.tryte #0,#0,#0,#3240,#-1080,#0,#0,#0,#0  ; 45 '-'
.tryte #0,#0,#0,#0,#0,#972,#891,#-324,#0  ; 46 '.'
.tryte #36,#69,#216,#648,#1944,#8019,#-2916,#0,#0  ; 47 '/'
.tryte #1053,#1890,#5931,#4635,#8685,#1476,#1044,#-351,#0  ; 48 '0'
.tryte #972,#3078,#891,#891,#891,#891,#3267,#-1089,#0  ; 49 '1'
.tryte #3240,#5535,#-2088,#936,#1863,#5859,#9819,#-3276,#0  ; 50 '2'
.tryte #3240,#5535,#-2115,#1026,#-297,#6579,#3231,#-1080,#0  ; 51 '3'
.tryte #81,#297,#783,#1998,#9828,#-3114,#351,#-117,#0  ; 52 '4'
.tryte #9828,#3285,#3240,#-1026,#18,#6579,#3231,#-1080,#0  ; 53 '5'
.tryte #1080,#1827,#5832,#9801,#3348,#4392,#3231,#-1080,#0  ; 54 '6'
.tryte #9828,#3339,#-2115,#216,#648,#486,#972,#-324,#0  ; 55 '7'
.tryte #3240,#5535,#2259,#945,#2025,#5859,#3231,#-1080,#0  ; 56 '8'
.tryte #3240,#5535,#4392,#3258,#-1035,#72,#3213,#-1080,#0  ; 57 '9'
.tryte #0,#972,#891,#-324,#972,#891,#-324,#0,#0  ; 58 ':'
.tryte #0,#972,#891,#-324,#972,#162,#648,#-243,#0  ; 59 ';'
.tryte #81,#216,#648,#1944,#729,#243,#81,#-27,#0  ; 60 '<'
.tryte #0,#0,#3267,#-1089,#3267,#-1089,#0,#0,#0  ; 61 '='
.tryte #2187,#729,#243,#81,#216,#648,#1944,#-729,#0  ; 62 '>'
.tryte #3240,#5535,#-2115,#216,#162,#-81,#243,#-81,#0  ; 63 '?'
.tryte #3240,#5535,#5445,#4797,#5445,#4014,#3267,#-1089,#0  ; 64 '@'
.tryte #1053,#540,#1971,#1476,#3258,#5490,#8781,#-2928,#0  ; 65 'A'
.tryte #9801,#1161,#1476,#3231,#1161,#1476,#9792,#-3267,#0  ; 66 'B'
.tryte #1089,#1842,#5829,#4374,#4374,#2196,#1077,#-360,#0  ; 67 'C'
.tryte #9801,#1161,#1467,#1464,#1464,#1482,#9792,#-3267,#0  ; 68 'D'
.tryte #9828,#1152,#1692,#3078,#1620,#1404,#9819,#-3276,#0  ; 69 'E'
.tryte #9828,#1152,#1692,#3078,#1134,#1458,#9477,#-3159,#0  ; 70 'F'
.tryte #1080,#1881,#5823,#4725,#4311,#2205,#1044,#-351,#0  ; 71 'G'
.tryte #8784,#1473,#1476,#3258,#1152,#1476,#8055,#-2928,#0  ; 72 'H'
.tryte #3267,#-603,#162,#162,#162,#162,#3267,#-1089,#0  ; 73 'I'
.tryte #360,#-66,#18,#18,#6579,#4392,#3231,#-1080,#0  ; 74 'J'
.tryte #8856,#1503,#1674,#3078,#1620,#1539,#8127,#-2952,#0  ; 75 'K'
.tryte #9477,#1215,#1458,#1458,#1458,#1485,#9819,#-3276,#0  ; 76 'L'
.tryte #8784,#9591,#1716,#1638,#1395,#1476,#8055,#-2928,#0  ; 77 'M'
.tryte #8784,#2931,#1719,#1557,#1476,#1476,#8055,#-2928,#0  ; 78 'N'
.tryte #1053,#1890,#5841,#4380,#4380,#2211,#1044,#-351,#0  ; 79 'O'
.tryte #9801,#1161,#1476,#3231,#1107,#1458,#9477,#-3159,#0  ; 80 'P'
.tryte #1053,#1890,#5841,#4380,#4623,#2292,#1035,#-354,#0  ; 81 'Q'
.tryte #9801,#1161,#1476,#3231,#1593,#1539,#8055,#-2928,#0  ; 82 'R'
.tryte #3267,#5526,#2178,#1053,#-297,#6579,#9792,#-3267,#0  ; 83 'S'
.tryte #9837,#3786,#-2028,#162,#162,#162,#1053,#-351,#0  ; 84 'T'
.tryte #8784,#1473,#1476,#1476,#1476,#1476,#1044,#-351,#0  ; 85 'U'
.tryte #8784,#1473,#1476,#801,#540,#216,#162,#-81,#0  ; 86 'V'
.tryte #8784,#1473,#1719,#1638,#1638,#801,#540,#-270,#0  ; 87 'W'
.tryte #8784,#1473,#801,#216,#810,#1971,#8055,#-2928,#0  ; 88 'X'
.tryte #8784,#1473,#801,#216,#162,#162,#1053,#-351,#0  ; 89 'Y'
.tryte #9828,#3447,#-1971,#648,#1944,#1485,#9819,#-3276,#0  ; 90 'Z'
.tryte #1053,#378,#486,#486,#486,#486,#1053,#-351,#0  ; 91 '['
.tryte #6561,#2187,#729,#243,#81,#27,#-9,#0,#0  ; 92 '\'
.tryte #1053,#-189,#54,#54,#54,#54,#1026,#-351,#0  ; 93 ']'
.tryte #243,#810,#1971,#-738,#0,#0,#0,#0,#0  ; 94 '^'
.tryte #0,#0,#0,#0,#0,#0,#9837,#-3279,#0  ; 95 '_'
.tryte #729,#243,#-81,#0,#0,#0,#0,#0,#0  ; 96 '`'
.tryte #0,#0,#3240,#-1026,#3258,#5526,#3276,#-1092,#0  ; 97 'a'
.tryte #8748,#1458,#3240,#1161,#1476,#1476,#9792,#-3267,#0  ; 98 'b'
.tryte #0,#0,#3267,#5526,#4365,#4401,#3231,#-1080,#0  ; 99 'c'
.tryte #108,#18,#1071,#1881,#1476,#1476,#1071,#-360,#0  ; 100 'd'
.tryte #0,#0,#3240,#5535,#9819,#3285,#3240,#-1080,#0  ; 101 'e'
.tryte #351,#666,#3231,#378,#486,#486,#3159,#-1053,#0  ; 102 'f'
.tryte #0,#0,#3267,#5634,#3213,#5481,#3267,#5526,#-2196  ; 103 'g'
.tryte #8748,#1458,#3240,#1161,#1476,#1476,#8118,#-2952,#0  ; 104 'h'
.tryte #243,#-81,#972,#162,#162,#162,#1053,#-351,#0  ; 105 'i'
.tryte #81,#-27,#324,#54,#54,#54,#6615,#3132,#-1053  ; 106 'j'
.tryte #8748,#1458,#1566,#1665,#3078,#1620,#8127,#-2952,#0  ; 107 'k'
.tryte #2916,#486,#486,#486,#486,#486,#3159,#-1053,#0  ; 108 'l'
.tryte #0,#0,#9018,#1638,#1638,#1638,#8217,#-3009,#0  ; 109 'm'
.tryte #0,#0,#9072,#1404,#1476,#1476,#8118,#-2952,#0  ; 110 'n'
.tryte #0,#0,#1053,#1890,#1476,#1476,#1044,#-351,#0  ; 111 'o'
.tryte #0,#0,#9801,#1161,#1476,#3231,#1107,#9477,#-3159  ; 112 'p'
.tryte #0,#0,#3267,#5526,#4392,#3258,#-1035,#117,#-39  ; 113 'q'
.tryte #0,#0,#9099,#1395,#1449,#1458,#9477,#-3159,#0  ; 114 'r'
.tryte #0,#0,#3267,#5472,#3240,#-1026,#9792,#-3267,#0  ; 115 's'
.tryte #729,#486,#3240,#378,#486,#513,#315,#-108,#0  ; 116 't'
.tryte #0,#0,#8856,#1476,#1476,#1557,#1008,#-336,#0  ; 117 'u'
.tryte #0,#0,#8856,#1503,#1512,#945,#891,#-324,#0  ; 118 'v'
.tryte #0,#0,#8784,#1473,#1719,#1638,#801,#-270,#0  ; 119 'w'
.tryte #0,#0,#8856,#1503,#945,#2025,#8127,#-2952,#0  ; 120 'x'
.tryte #0,#0,#8856,#1503,#1512,#945,#405,#8505,#-2916  ; 121 'y'
.tryte #0,#0,#9828,#3447,#-1242,#1890,#9819,#-3276,#0  ; 122 'z'
.tryte #324,#621,#486,#1944,#729,#486,#324,#-108,#0  ; 123 '{'
.tryte #243,#162,#162,#162,#162,#162,#162,#-81,#0  ; 124 '|'
.tryte #972,#-162,#54,#27,#72,#54,#945,#-324,#0  ; 125 '}'
.tryte #0,#2943,#6147,#-2295,#0,#0,#0,#0,#0  ; 126 '~'
.tryte #0,#1053,#2376,#6003,#2373,#1044,#-351,#0,#0  ; 127 'DEL'

.org 18864
splash_logo_tiles:
.tryte #0,#0,#1093,#729,#729,#729,#729,#729,#729 ; tile (0,0)
.tryte #0,#0,#9841,#0,#0,#0,#0,#0,#-1 ; tile (1,0)
.tryte #0,#0,#9841,#-13,#-36,#-320,#-933,#-8424,#-3402 ; tile (2,0)
.tryte #0,#0,#9841,#364,#9720,#6561,#0,#0,#0 ; tile (3,0)
.tryte #0,#0,#9841,#6913,#270,#1008,#738,#2190,#8752 ; tile (4,0)
.tryte #0,#0,#9841,#9828,#40,#1,#0,#0,#0 ; tile (5,0)
.tryte #0,#0,#9841,#-4,#0,#8748,#3159,#108,#39 ; tile (6,0)
.tryte #0,#0,#9841,#0,#-8748,#-972,#-324,#-36,#-12 ; tile (7,0)
.tryte #0,#0,#9837,#9,#9,#9,#9,#9,#9 ; tile (8,0)
.tryte #729,#729,#729,#729,#729,#729,#729,#729,#729 ; tile (0,1)
.tryte #-4,#-5,#-15,#-45,#-135,#324,#972,#2916,#-4374 ; tile (1,1)
.tryte #8748,#6561,#0,#0,#0,#0,#0,#0,#0 ; tile (2,1)
.tryte #0,#1,#1,#4,#3,#9,#36,#27,#108 ; tile (3,1)
.tryte #6562,#6562,#0,#0,#0,#0,#0,#0,#0 ; tile (4,1)
.tryte #0,#6561,#6561,#8748,#2187,#729,#972,#243,#324 ; tile (5,1)
.tryte #4,#1,#0,#0,#0,#0,#0,#0,#0 ; tile (6,1)
.tryte #-4,#8748,#2916,#972,#324,#108,#36,#12,#3 ; tile (7,1)
.tryte #9,#-6552,#-2178,#-720,#-234,#-72,#-99,#-18,#9 ; tile (8,1)
.tryte #729,#730,#730,#733,#732,#735,#738,#765,#747 ; tile (0,2)
.tryte #8748,#6561,#0,#0,#0,#0,#0,#0,#0 ; tile (1,2)
.tryte #0,#0,#0,#0,#0,#0,#0,#0,#1 ; tile (2,2)
.tryte #81,#324,#972,#725,#2880,#2079,#8505,#5832,#4374 ; tile (3,2)
.tryte #0,#-121,#-9720,#-6561,#0,#0,#0,#0,#0 ; tile (4,2)
.tryte #81,#-9369,#-1017,#5,#11,#3,#4,#1,#1 ; tile (5,2)
.tryte #0,#0,#0,#0,#-8748,#-2916,#-972,#-81,#6534 ; tile (6,2)
.tryte #4,#1,#0,#0,#0,#0,#0,#0,#0 ; tile (7,2)
.tryte #9,#6570,#6570,#8757,#2196,#738,#738,#981,#252 ; tile (8,2)
.tryte #837,#783,#783,#1026,#891,#891,#891,#891,#891 ; tile (0,3)
.tryte #0,#0,#0,#0,#0,#0,#0,#0,#0 ; tile (1,3)
.tryte #4,#3,#11,#8,#33,#24,#78,#312,#234 ; tile (2,3)
.tryte #-8748,#-6561,#0,#0,#0,#0,#0,#0,#0 ; tile (3,3)
.tryte #0,#0,#0,#0,#0,#0,#0,#0,#0 ; tile (4,3)
.tryte #0,#0,#0,#0,#0,#0,#0,#0,#0 ; tile (5,3)
.tryte #8739,#2184,#2912,#728,#972,#243,#81,#108,#27 ; tile (6,3)
.tryte #0,#0,#0,#0,#-6561,#-6561,#-2187,#-2187,#-2916 ; tile (7,3)
.tryte #333,#90,#90,#117,#36,#36,#36,#36,#36 ; tile (8,3)
.tryte #891,#648,#648,#648,#648,#648,#648,#648,#945 ; tile (0,4)
.tryte #0,#0,#0,#0,#0,#1,#1,#4,#3 ; tile (1,4)
.tryte #963,#720,#2907,#2178,#6549,#6558,#-3,#-4,#-1 ; tile (2,4)
.tryte #0,#0,#0,#0,#0,#0,#0,#0,#0 ; tile (3,4)
.tryte #0,#1089,#3279,#3278,#3279,#3279,#3279,#1089,#0 ; tile (4,4)
.tryte #0,#0,#0,#-6561,#-6561,#-2187,#-2187,#-2187,#-2187 ; tile (5,4)
.tryte #36,#9,#12,#3,#1,#1,#0,#0,#0 ; tile (6,4)
.tryte #-729,#-729,#-729,#-243,#-243,#6318,#6318,#8505,#1944 ; tile (7,4)
.tryte #36,#9,#9,#9,#9,#9,#9,#9,#36 ; tile (8,4)
.tryte #945,#945,#945,#963,#963,#1044,#807,#807,#836 ; tile (0,5)
.tryte #12,#36,#27,#108,#81,#324,#243,#729,#2916 ; tile (1,5)
.tryte #-1,#0,#0,#0,#0,#0,#0,#0,#0 ; tile (2,5)
.tryte #-6561,#-8748,#-2187,#-972,#-324,#-39,#-4,#0,#0 ; tile (3,5)
.tryte #0,#0,#-1,#-1,#-12,#-117,#-9720,#0,#0 ; tile (4,5)
.tryte #-2187,#-6561,#-6561,#0,#0,#0,#0,#0,#0 ; tile (5,5)
.tryte #0,#0,#0,#0,#0,#0,#0,#0,#0 ; tile (6,5)
.tryte #2673,#972,#243,#-405,#-648,#-621,#-702,#-2907,#-2175 ; tile (7,5)
.tryte #36,#36,#36,#36,#36,#117,#90,#90,#333 ; tile (8,5)
.tryte #755,#765,#738,#739,#733,#733,#730,#730,#729 ; tile (0,6)
.tryte #2187,#8748,#4374,#4374,#-729,#9841,#-324,#6453,#8712 ; tile (1,6)
.tryte #0,#0,#0,#0,#0,#9841,#0,#0,#0 ; tile (2,6)
.tryte #0,#0,#0,#0,#0,#9841,#0,#0,#0 ; tile (3,6)
.tryte #0,#0,#0,#0,#0,#9841,#0,#0,#0 ; tile (4,6)
.tryte #0,#0,#0,#0,#0,#9841,#0,#0,#0 ; tile (5,6)
.tryte #0,#0,#0,#-1,#-4,#9841,#-9,#-27,#-108 ; tile (6,6)
.tryte #-2184,#-6557,#-6560,#1,#0,#9841,#0,#1,#4 ; tile (7,6)
.tryte #252,#981,#738,#7299,#8757,#8757,#6570,#6570,#9 ; tile (8,6)
.tryte #729,#729,#729,#729,#729,#729,#729,#729,#729 ; tile (0,7)
.tryte #2175,#2912,#972,#324,#108,#36,#12,#4,#0 ; tile (1,7)
.tryte #0,#0,#-8748,#-2916,#-324,#-117,#-4,#6561,#8748 ; tile (2,7)
.tryte #0,#0,#0,#0,#0,#0,#-6561,#-9801,#-121 ; tile (3,7)
.tryte #0,#0,#0,#0,#0,#0,#0,#-4,#-9837 ; tile (4,7)
.tryte #0,#0,#0,#-1,#-12,#-117,#-1053,#-8748,#0 ; tile (5,7)
.tryte #-324,#-972,#-8748,#-6561,#0,#0,#0,#1,#4 ; tile (6,7)
.tryte #3,#12,#36,#108,#324,#972,#2916,#8748,#0 ; tile (7,7)
.tryte #9,#9,#9,#9,#9,#9,#9,#9,#-18 ; tile (8,7)
.tryte #729,#729,#729,#729,#729,#729,#1093,#0,#0 ; tile (0,8)
.tryte #0,#0,#0,#0,#0,#0,#9841,#0,#0 ; tile (1,8)
.tryte #3159,#324,#39,#4,#0,#0,#9841,#0,#0 ; tile (2,8)
.tryte #0,#0,#0,#6561,#9720,#364,#9841,#0,#0 ; tile (3,8)
.tryte #0,#0,#0,#0,#0,#6562,#9841,#0,#0 ; tile (4,8)
.tryte #0,#0,#0,#1,#40,#9828,#9841,#0,#0 ; tile (5,8)
.tryte #39,#108,#3159,#8748,#0,#0,#9841,#0,#0 ; tile (6,8)
.tryte #0,#0,#0,#0,#0,#0,#9841,#0,#0 ; tile (7,8)
.tryte #-99,#-72,#-234,#-720,#-2178,#-8739,#9837,#0,#0 ; tile (8,8)

; ============================================================================
; USER-MODE APPLICATIONS (Apps 0..10)
; ============================================================================
.org 19683
app3_clock_rom:
  LI R0, #520
  LI R1, #12
  LI R2, #180
  LI R3, #54
  LI R4, #str_clk_title - app3_clock_rom
  ADD R4, R4, R8
  LI R5, #-320
  SYSCALL #10

  LI R0, #6
  LI R1, #8
  LI R2, #str_clk_dec - app3_clock_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-320
  SYSCALL #21

  LI R0, #6
  LI R1, #26
  LI R2, #str_clk_trn - app3_clock_rom
  ADD R2, R2, R8
  LI R3, #COL_GREEN
  LI R4, #-320
  SYSCALL #21

  LI R7, #-1

clk_loop:
  SYSCALL #25
  SYSCALL #9 ; SYS_GET_MS (virtual steps / 200)
  MOV R5, R0
  SYSCALL #3
  ADDI R6, R8, #2000
  SW R0, R6, #0
  MOV R6, R0
  CMPI R7, #-1
  JZX clk_do_draw
  SUB R0, R5, R7
  CMPI R5, #2000
  JNNX clk_late_thr
  CMPI R0, #175 ; 175 ms before 2000 ms
  JNNX clk_do_draw
  SYSCALL #2
  JMPX clk_loop
clk_late_thr:
  CMPI R0, #500 ; 500 ms = 100,000 steps after 2000 ms
  JNNX clk_do_draw
  SYSCALL #2
  JMPX clk_loop
clk_do_draw:
  MOV R7, R5
  LI R0, #40
  LI R1, #8
  LI R2, #90
  LI R3, #9
  LI R4, #-320
  SYSCALL #20
  LI R0, #40
  LI R1, #8
  MOV R2, R6
  LI R3, #10
  LI R4, #COL_WHITE
  LI R5, #-320
  SYSCALL #26
  LI R0, #40
  LI R1, #8
  LI R2, #90
  LI R3, #9
  SYSCALL #24

  LI R0, #40
  LI R1, #26
  LI R2, #90
  LI R3, #9
  LI R4, #-320
  SYSCALL #20
  LI R0, #40
  LI R1, #26
  MOV R2, R6
  LI R3, #3
  LI R4, #COL_YELLOW
  LI R5, #-320
  SYSCALL #26
  LI R0, #40
  LI R1, #26
  LI R2, #90
  LI R3, #9
  SYSCALL #24

  SYSCALL #2
  JMPX clk_loop

str_clk_title: .stringz "CLOCK"
str_clk_dec:   .stringz "DEC:"
str_clk_trn:   .stringz "TRN:"
app3_clock_end:

; ----------------------------------------------------------------------------
; APP 5: TRIT CALCULATOR
; ----------------------------------------------------------------------------
app5_calc_rom:
  LI R0, #510
  LI R1, #75
  LI R2, #216
  LI R3, #96
  LI R4, #str_calc_title-app5_calc_rom
  ADD R4, R4, R8
  LI R5, #-315
  SYSCALL #10

  LI R0, #6
  LI R1, #4
  LI R2, #str_calc_hdr-app5_calc_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-315
  SYSCALL #21

  LI R0, #6
  LI R1, #56
  LI R2, #str_calc_btns1-app5_calc_rom
  ADD R2, R2, R8
  LI R3, #COL_WHITE
  LI R4, #-240
  SYSCALL #21

  LI R0, #6
  LI R1, #72
  LI R2, #str_calc_btns2-app5_calc_rom
  ADD R2, R2, R8
  LI R3, #COL_WHITE
  LI R4, #-240
  SYSCALL #21

  LI R0, #0
  LI R1, #0
  LI R2, #0
  LI R3, #0
  SYSCALL #24

  LI R7, #0
  ADDI R6, R8, #1500
  LI R0, #0
  ST R0, R6, #0

calc_ev_lp:
  SYSCALL #25
  CMPI R0, #0
  JZX calc_idle
  CMPI R0, #1
  JZX calc_on_key
  CMPI R0, #2
  JZX calc_on_click
  JMPX calc_ev_lp

calc_idle:
  ADDI R6, R8, #1499
  LT R0, R6, #0
  CMPI R0, #0
  JZX calc_do_yield
  LI R0, #0
  ST R0, R6, #0
  CALLX calc_redraw_input
calc_do_yield:
  SYSCALL #2
  JMPX calc_ev_lp

calc_on_click:
  CMPI R2, #50
  JNX calc_ev_lp
  CMPI R2, #88
  JPX calc_ev_lp
  SUBI R0, R1, #6
  CMPI R0, #0
  JNX calc_ev_lp
  LI R3, #32
  DIV R0, R0, R3
  CMPI R0, #6
  JNNX calc_ev_lp
  CMPI R2, #69
  JNNX calc_click_r2
  LI R3, #str_calc_kmap1-app5_calc_rom
  ADD R3, R3, R8
  ADD R3, R3, R0
  LT R1, R3, #0
  JMPX calc_on_key
calc_click_r2:
  LI R3, #str_calc_kmap2-app5_calc_rom
  ADD R3, R3, R8
  ADD R3, R3, R0
  LT R1, R3, #0

calc_on_key:
  CMPI R1, #13
  JZX calc_eval
  CMPI R1, #10
  JZX calc_eval
  CMPI R1, #'='
  JZX calc_eval
  CMPI R1, #'C'
  JZX calc_clear
  CMPI R1, #'c'
  JZX calc_clear
  CMPI R1, #'S'
  JZX calc_save_file
  CMPI R1, #'s'
  JZX calc_save_file
  CMPI R1, #8
  JZX calc_bs

  CMPI R7, #24
  JNNX calc_ev_lp
  ADDI R6, R8, #1500
  ADD R6, R6, R7
  ST R1, R6, #0
  LI R0, #0
  ST R0, R6, #1
  ADDI R7, R7, #1
  ADDI R6, R8, #1499
  LI R0, #1
  ST R0, R6, #0
  JMPX calc_ev_lp

calc_bs:
  CMPI R7, #0
  JZX calc_ev_lp
  SUBI R7, R7, #1
  ADDI R6, R8, #1500
  ADD R6, R6, R7
  LI R0, #0
  ST R0, R6, #0
  ADDI R6, R8, #1499
  LI R0, #1
  ST R0, R6, #0
  JMPX calc_ev_lp

calc_clear:
  LI R7, #0
  ADDI R6, R8, #1500
  LI R0, #0
  ST R0, R6, #0
  ADDI R6, R8, #1499
  LI R0, #1
  ST R0, R6, #0
  JMPX calc_ev_lp

calc_save_file:
  LI R0, #str_calc_fn-app5_calc_rom
  ADD R0, R0, R8
  ADDI R1, R8, #2000
  LI R2, #3
  LI R3, #1
  SYSCALL #32
  JMPX calc_ev_lp

calc_redraw_input:
  LI R0, #6
  LI R1, #18
  LI R2, #176
  LI R3, #10
  LI R4, #-340
  SYSCALL #20
  LI R0, #6
  LI R1, #18
  ADDI R2, R8, #1500
  LI R3, #COL_WHITE
  LI R4, #-340
  SYSCALL #21
  LI R0, #6
  LI R1, #18
  LI R2, #176
  LI R3, #10
  SYSCALL #24
  RET

calc_eval:
  ADDI R1, R8, #1500
  CALLX calc_parse_btern
  MOV R5, R4
  CALLX calc_skip_sp
  LT R6, R1, #0
  CMPI R6, #0
  JZX calc_show_res
  ADDI R1, R1, #1
  CALLX calc_skip_sp
  CALLX calc_parse_btern
  CMPI R6, #'+'
  JNZX calc_op_sub
  ADD R5, R5, R4
  JMPX calc_show_res
calc_op_sub:
  CMPI R6, #'-'
  JNZX calc_op_mul
  SUB R5, R5, R4
  JMPX calc_show_res
calc_op_mul:
  CMPI R6, #'*'
  JNZX calc_op_div
  MUL R5, R5, R4
  JMPX calc_show_res
calc_op_div:
  CMPI R6, #'/'
  JNZX calc_op_mod
  DIV R5, R5, R4
  JMPX calc_show_res
calc_op_mod:
  CMPI R6, #'%'
  JNZX calc_op_min
  MOD R5, R5, R4
  JMPX calc_show_res
calc_op_min:
  CMPI R6, #'&'
  JNZX calc_op_max
  TMIN R5, R5, R4
  JMPX calc_show_res
calc_op_max:
  CMPI R6, #'|'
  JNZX calc_op_con
  TMAX R5, R5, R4
  JMPX calc_show_res
calc_op_con:
  CMPI R6, #'^'
  JNZX calc_op_xor
  TCON R5, R5, R4
  JMPX calc_show_res
calc_op_xor:
  TXOR R5, R5, R4

calc_show_res:
  ADDI R6, R8, #2000
  SW R5, R6, #0

  LI R0, #6
  LI R1, #36
  LI R2, #180
  LI R3, #9
  LI R4, #-350
  SYSCALL #20

  LI R0, #6
  LI R1, #36
  MOV R2, R5
  LI R3, #3
  LI R4, #COL_GREEN
  LI R5, #-350
  SYSCALL #26

  LI R0, #6
  LI R1, #36
  LI R2, #180
  LI R3, #9
  SYSCALL #24

  LI R7, #0
  ADDI R6, R8, #1499
  LI R0, #0
  ST R0, R6, #0
  ST R0, R6, #1
  JMPX calc_ev_lp

calc_skip_sp:
  LT R0, R1, #0
  CMPI R0, #32
  JNZX css_ret
  ADDI R1, R1, #1
  JMPX calc_skip_sp
css_ret:
  RET

calc_parse_btern:
  CALLX calc_skip_sp
  LI R4, #0
cpbt_lp:
  LT R0, R1, #0
  CMPI R0, #'1'
  JZX cpbt_1
  CMPI R0, #'0'
  JZX cpbt_0
  CMPI R0, #'T'
  JZX cpbt_t
  CMPI R0, #'t'
  JZX cpbt_t
  RET
cpbt_1:
  MULI R4, R4, #3
  ADDI R4, R4, #1
  ADDI R1, R1, #1
  JMPX cpbt_lp
cpbt_0:
  MULI R4, R4, #3
  ADDI R1, R1, #1
  JMPX cpbt_lp
cpbt_t:
  MULI R4, R4, #3
  SUBI R4, R4, #1
  ADDI R1, R1, #1
  JMPX cpbt_lp

str_calc_title: .stringz "TRIT CALC"
str_calc_hdr:   .stringz "EXPR (T,0,1 +-*/&|):"
str_calc_btns1: .stringz "[T] [0] [1] [+] [-] [*]"
str_calc_btns2: .stringz "[/] [%] [&] [|] [=] [C]"
str_calc_kmap1: .stringz "T01+-*"
str_calc_kmap2: .stringz "/%&|=C"
str_calc_fn:    .stringz "CALC"
app5_calc_end:

; ----------------------------------------------------------------------------
; APP 1: TEXT EDITOR
; ----------------------------------------------------------------------------
app1_edit_rom:
  LI R0, #250
  LI R1, #20
  LI R2, #224
  LI R3, #96
  LI R4, #str_edit_title - app1_edit_rom
  ADD R4, R4, R8
  LI R5, #-310
  SYSCALL #10

  ADDI R6, R8, #1400
  LI R0, #'N'
  ST R0, R6, #0
  LI R0, #'O'
  ST R0, R6, #1
  LI R0, #'T'
  ST R0, R6, #2
  LI R0, #'E'
  ST R0, R6, #3
  LI R0, #0
  ST R0, R6, #4

  LI R7, #0
  ADDI R6, R8, #1500
  LI R0, #0
  ST R0, R6, #0

  LI R0, #4
  LI R1, #2
  LI R2, #str_edit_bar - app1_edit_rom
  ADD R2, R2, R8
  LI R3, #COL_WHITE
  LI R4, #-230
  SYSCALL #21

  CALLX edit_redraw
  JMPX edit_ev_lp

edit_ev_lp:
  SYSCALL #25
  CMPI R0, #0
  JZX edit_idle
  CMPI R0, #1
  JZX edit_on_key
  CMPI R0, #2
  JZX edit_on_click
  JMPX edit_ev_lp

edit_idle:
  ADDI R6, R8, #1499
  LT R0, R6, #0
  CMPI R0, #0
  JZX edit_do_yield
  LI R0, #0
  ST R0, R6, #0
  CALLX edit_redraw
edit_do_yield:
  SYSCALL #2
  JMPX edit_ev_lp

edit_on_click:
  CMPI R2, #14
  JNNX edit_ev_lp
  CMPI R1, #54
  JNX edit_do_save
  CMPI R1, #110
  JNX edit_do_load
  CMPI R1, #165
  JNX edit_do_clear
  JMPX edit_ev_lp

edit_on_key:
  CMPI R1, #19
  JZX edit_do_save
  CMPI R1, #137 ; F2 = 137 (Save)
  JZX edit_do_save
  CMPI R1, #12
  JZX edit_do_load
  CMPI R1, #138 ; F3 = 138 (Load)
  JZX edit_do_load
  CMPI R1, #8
  JZX edit_bs
  CMPI R1, #13
  JZX edit_ev_lp

  CMPI R7, #512
  JNNX edit_ev_lp
  ADDI R6, R8, #1500
  ADD R6, R6, R7
  ST R1, R6, #0
  LI R0, #0
  ST R0, R6, #1
  ADDI R7, R7, #1
  ADDI R6, R8, #1499
  LI R0, #1
  ST R0, R6, #0
  JMPX edit_ev_lp

edit_bs:
  CMPI R7, #0
  JZX edit_ev_lp
  SUBI R7, R7, #1
  ADDI R6, R8, #1500
  ADD R6, R6, R7
  LI R0, #0
  ST R0, R6, #0
  ADDI R6, R8, #1499
  LI R0, #1
  ST R0, R6, #0
  JMPX edit_ev_lp

edit_do_clear:
  LI R7, #0
  ADDI R6, R8, #1500
  LI R0, #0
  ST R0, R6, #0
  ADDI R6, R8, #1499
  LI R0, #1
  ST R0, R6, #0
  JMPX edit_ev_lp

edit_do_save:
  ADDI R0, R8, #1400
  ADDI R1, R8, #1500
  MOV R2, R7
  LI R3, #1
  SYSCALL #32
  LI R0, #4
  LI R1, #68
  LI R2, #str_edit_saved - app1_edit_rom
  ADD R2, R2, R8
  LI R3, #COL_GREEN
  LI R4, #-310
  SYSCALL #21
  LI R0, #4
  LI R1, #68
  LI R2, #180
  LI R3, #10
  SYSCALL #24
  JMPX edit_ev_lp

edit_do_load:
  ADDI R0, R8, #1400
  ADDI R1, R8, #1500
  LI R2, #512
  SYSCALL #31
  CMPI R0, #0
  JNX edit_ev_lp
  MOV R7, R0
  ADDI R6, R8, #1499
  LI R0, #1
  ST R0, R6, #0
  JMPX edit_ev_lp

edit_redraw:
  LI R0, #4
  LI R1, #16
  LI R2, #212
  LI R3, #48
  LI R4, #-340
  SYSCALL #20

  ADDI R5, R8, #1500
  LI R6, #18
edit_rd_line:
  CMPI R6, #58
  JNNX edit_rd_flush
  LT R0, R5, #0
  CMPI R0, #0
  JZX edit_rd_flush
  ADDI R4, R8, #1420
  LI R3, #0
edit_rd_ch:
  LT R0, R5, #0
  CMPI R0, #0
  JZX edit_rd_eol
  CMPI R0, #10
  JZX edit_rd_nl
  ST R0, R4, #0
  ADDI R4, R4, #1
  ADDI R5, R5, #1
  ADDI R3, R3, #1
  CMPI R3, #20
  JNX edit_rd_ch
  JMPX edit_rd_eol
edit_rd_nl:
  ADDI R5, R5, #1
edit_rd_eol:
  LI R0, #0
  ST R0, R4, #0
  PUSH R5
  PUSH R6
  LI R0, #6
  MOV R1, R6
  ADDI R2, R8, #1420
  LI R3, #COL_WHITE
  LI R4, #-340
  SYSCALL #21
  POP R6
  POP R5
  ADDI R6, R6, #12
  JMPX edit_rd_line

edit_rd_flush:
  LI R0, #4
  LI R1, #16
  LI R2, #212
  LI R3, #48
  SYSCALL #24
  RET

str_edit_title: .stringz "TEXT EDITOR"
str_edit_bar:   .stringz "[SAVE] [LOAD] [CLR] NOTE"
str_edit_saved: .stringz "SAVED TO DISK: NOTE     "
app1_edit_end:

; ----------------------------------------------------------------------------
; APP 2: PAINT 729
; ----------------------------------------------------------------------------
app2_paint_rom:
  LI R0, #250
  LI R1, #130
  LI R2, #204
  LI R3, #96
  LI R4, #str_paint_title - app2_paint_rom
  ADD R4, R4, R8
  LI R5, #-310
  SYSCALL #10

  ADDI R6, R8, #1400
  LI R0, #'A'
  ST R0, R6, #0
  LI R0, #'R'
  ST R0, R6, #1
  LI R0, #'T'
  ST R0, R6, #2
  LI R0, #0
  ST R0, R6, #3
  LI R0, #-1
  ST R0, R6, #10 ; last_x = -1
  ST R0, R6, #11 ; last_y = -1
  LI R0, #0
  ST R0, R6, #12 ; dragging_in_canvas = 0

  LI R7, #364

  LI R0, #4
  LI R1, #2
  LI R2, #str_paint_bar - app2_paint_rom
  ADD R2, R2, R8
  LI R3, #COL_WHITE
  LI R4, #-230
  SYSCALL #21

  LI R5, #0
paint_pal_lp:
  CMPI R5, #20
  JNNX paint_pal_done
  MULI R0, R5, #8
  ADDI R0, R0, #6
  LI R1, #14
  LI R2, #8
  LI R3, #10
  MULI R4, R5, #31
  SUBI R4, R4, #356
  SYSCALL #20
  ADDI R5, R5, #1
  JMPX paint_pal_lp
paint_pal_done:

  LI R0, #10
  LI R1, #28
  LI R2, #64
  LI R3, #48
  LI R4, #-364
  SYSCALL #20
  LI R7, #364

  LI R0, #4
  LI R1, #2
  LI R2, #190
  LI R3, #24
  SYSCALL #24
  LI R0, #10
  LI R1, #28
  LI R2, #64
  LI R3, #48
  SYSCALL #24

paint_ev_lp:
  SYSCALL #25
  CMPI R0, #0
  JZX paint_idle
  CMPI R0, #1
  JZX paint_on_key
  CMPI R0, #2
  JZX paint_on_mdown
  CMPI R0, #3
  JZX paint_on_mmove
  CMPI R0, #4
  JZX paint_on_mup
  JMPX paint_ev_lp

paint_idle:
  SYSCALL #2
  JMPX paint_ev_lp

paint_on_mup:
  ADDI R6, R8, #1410
  LI R0, #-1
  ST R0, R6, #0
  ST R0, R6, #1
  LI R0, #0
  ST R0, R6, #2
  JMPX paint_ev_lp

paint_on_key:
  CMPI R1, #'S'
  JZX paint_do_save
  CMPI R1, #'s'
  JZX paint_do_save
  CMPI R1, #'F'
  JZX paint_do_save_frt
  CMPI R1, #'f'
  JZX paint_do_save_frt
  CMPI R1, #'L'
  JZX paint_do_load
  CMPI R1, #'l'
  JZX paint_do_load
  CMPI R1, #'C'
  JZX paint_do_clear
  CMPI R1, #'c'
  JZX paint_do_clear
  JMPX paint_ev_lp

paint_do_save_frt:
  ADDI R6, R8, #1400
  LI R0, #'F'
  ST R0, R6, #0
  JMPX paint_do_save

paint_on_mdown:
  ADDI R6, R8, #1410
  LI R0, #-1
  ST R0, R6, #0
  ST R0, R6, #1
  LI R0, #0
  ST R0, R6, #2

  CMPI R2, #13
  JNNX paint_chk_pal
  CMPI R1, #60
  JNX paint_do_save
  CMPI R1, #124
  JNX paint_do_load
  JMPX paint_do_clear

paint_chk_pal:
  CMPI R2, #25
  JNNX paint_md_canvas
  SUBI R0, R1, #6
  CMPI R0, #0
  JNX paint_ev_lp
  LI R3, #8
  DIV R0, R0, R3
  CMPI R0, #20
  JNNX paint_ev_lp
  MULI R7, R0, #31
  SUBI R7, R7, #356
  JMPX paint_ev_lp

paint_md_canvas:
  CMPI R1, #10
  JNX paint_ev_lp
  CMPI R1, #74
  JNNX paint_ev_lp
  CMPI R2, #28
  JNX paint_ev_lp
  CMPI R2, #76
  JNNX paint_ev_lp

  ADDI R6, R8, #1410
  ST R1, R6, #0 ; last_x = x
  ST R2, R6, #1 ; last_y = y
  LI R0, #1
  ST R0, R6, #2 ; dragging_in_canvas = 1

  MOV R0, R1
  MOV R1, R2
  MOV R2, R7
  SYSCALL #22
  LI R0, #10
  LI R1, #28
  LI R2, #64
  LI R3, #48
  SYSCALL #24
  JMPX paint_ev_lp

paint_on_mmove:
  ; Only draw on drag if stroke started inside canvas (or enters canvas), and NEVER trigger toolbar/palette on move!
  ADDI R6, R8, #1410
  LT R0, R6, #2 ; dragging_in_canvas
  CMPI R0, #0
  JZX paint_ev_lp

  ; Clamp (R1, R2) to canvas bounds [10..73] x [28..75]
  CMPI R1, #10
  JNNX pmm_x0_ok
  LI R1, #10
pmm_x0_ok:
  CMPI R1, #73
  JNPX pmm_x1_ok
  LI R1, #73
pmm_x1_ok:
  CMPI R2, #28
  JNNX pmm_y0_ok
  LI R2, #28
pmm_y0_ok:
  CMPI R2, #75
  JNPX pmm_y1_ok
  LI R2, #75
pmm_y1_ok:
  LT R3, R6, #0 ; x0 = last_x
  LT R4, R6, #1 ; y0 = last_y
  ST R1, R6, #0 ; last_x = x1
  ST R2, R6, #1 ; last_y = y1
  CALLX paint_draw_line
  LI R0, #10
  LI R1, #28
  LI R2, #64
  LI R3, #48
  SYSCALL #24
  JMPX paint_ev_lp

; paint_draw_line: Bresenham line from (R3=x0, R4=y0) to (R1=x1, R2=y1) with color R7, clipped to [10..73]x[28..75]
paint_draw_line:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  ADDI R6, R8, #1420
  ST R1, R6, #0 ; x1
  ST R2, R6, #1 ; y1
  SUB R0, R1, R3 ; dx = x1 - x0
  LI R5, #1      ; sx = 1
  CMPI R0, #0
  JNNX pdl_dx_pos
  NEG R0, R0
  LI R5, #-1     ; sx = -1
pdl_dx_pos:
  ST R0, R6, #2  ; dx = abs(x1 - x0)
  ST R5, R6, #3  ; sx

  SUB R0, R2, R4 ; dy = y1 - y0
  LI R5, #1      ; sy = 1
  CMPI R0, #0
  JNNX pdl_dy_pos
  NEG R0, R0
  LI R5, #-1     ; sy = -1
pdl_dy_pos:
  NEG R0, R0     ; dy = -abs(y1 - y0)
  ST R0, R6, #4  ; dy
  ST R5, R6, #5  ; sy

  LT R5, R6, #2  ; dx
  ADD R5, R5, R0 ; err = dx + dy (where dy <= 0)

pdl_lp:
  ; Plot (R3, R4) if within [10..73] x [28..75]
  CMPI R3, #10
  JNX pdl_skip_px
  CMPI R3, #73
  JPX pdl_skip_px
  CMPI R4, #28
  JNX pdl_skip_px
  CMPI R4, #75
  JPX pdl_skip_px
  MOV R0, R3
  MOV R1, R4
  MOV R2, R7
  SYSCALL #22
pdl_skip_px:
  LT R0, R6, #0 ; x1
  CMP R3, R0
  JNZX pdl_step
  LT R0, R6, #1 ; y1
  CMP R4, R0
  JZX pdl_done
pdl_step:
  MULI R0, R5, #2 ; e2 = 2 * err
  LT R1, R6, #4   ; dy (<= 0)
  CMP R0, R1
  JNX pdl_chk_y
  ADD R5, R5, R1  ; err += dy
  LT R2, R6, #3   ; sx
  ADD R3, R3, R2  ; x0 += sx
pdl_chk_y:
  LT R1, R6, #2   ; dx (>= 0)
  CMP R0, R1
  JPX pdl_lp
  ADD R5, R5, R1  ; err += dx
  LT R2, R6, #5   ; sy
  ADD R4, R4, R2  ; y0 += sy
  JMPX pdl_lp
pdl_done:
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

paint_do_clear:
  LI R0, #10
  LI R1, #28
  LI R2, #64
  LI R3, #48
  LI R4, #-364
  SYSCALL #20
  LI R0, #10
  LI R1, #28
  LI R2, #64
  LI R3, #48
  SYSCALL #24
  JMPX paint_ev_lp

paint_do_save:
  LI R0, #10
  LI R1, #28
  LI R2, #64
  LI R3, #48
  ADDI R4, R8, #6000
  LI R5, #1
  SYSCALL #27
  ADDI R0, R8, #1400
  ADDI R1, R8, #6000
  LI R2, #3072
  LI R3, #2
  SYSCALL #32
  CMPI R0, #0
  JNX paint_save_err
  LI R0, #10
  LI R1, #74
  LI R2, #str_paint_saved - app2_paint_rom
  ADD R2, R2, R8
  LI R3, #COL_GREEN
  LI R4, #-310
  SYSCALL #21
  JMPX paint_save_fl
paint_save_err:
  LI R0, #10
  LI R1, #74
  LI R2, #str_paint_full - app2_paint_rom
  ADD R2, R2, R8
  LI R3, #COL_RED
  LI R4, #-310
  SYSCALL #21
paint_save_fl:
  LI R0, #10
  LI R1, #74
  LI R2, #180
  LI R3, #10
  SYSCALL #24
  JMPX paint_ev_lp

paint_do_load:
  ADDI R0, R8, #1400
  ADDI R1, R8, #6000
  LI R2, #3072
  SYSCALL #31
  CMPI R0, #0
  JNPX paint_ev_lp
  LI R0, #10
  LI R1, #28
  LI R2, #64
  LI R3, #48
  ADDI R4, R8, #6000
  LI R5, #0
  SYSCALL #27
  LI R0, #10
  LI R1, #28
  LI R2, #64
  LI R3, #48
  SYSCALL #24
  JMPX paint_ev_lp

str_paint_title: .stringz "PAINT 729"
str_paint_bar:   .stringz "[SAVE][LOAD][CLR] ART"
str_paint_saved: .stringz "SAVED ART (3072 PX)"
str_paint_full:  .stringz "ERR: DISK FULL!    "
app2_paint_end:

; ----------------------------------------------------------------------------
; APP 4: IN-GUEST STREAMING ASSEMBLER APP
; Rebuilds desktop app ("DEMO" = App 5: Trit Calculator) from disk byte-for-byte,
; saves emitted machine code to disk file "OUT", and launches it via 'R'!
; ----------------------------------------------------------------------------
.equ SBUF, 5100
.equ TBUF, 5200
.equ SPOOL_P, 5310
.equ LNUM, 5313
.equ EFLG, 5316
.equ SYMC, 5319
.equ PASS, 5322
.equ OLEN, 5325
.equ CUR_LBA, 5328
.equ SEC_IDX, 5331
.equ RAM_CAP, 5334
.equ CHAR_CNT, 5337
.equ SEC_BUF, 5400
.equ STAB, 6500

app4_asm_rom:
  LI R0, #250
  LI R1, #260
  LI R2, #180
  LI R3, #90
  LI R4, #str_asm_title - app4_asm_rom
  ADD R4, R4, R8
  LI R5, #-315
  SYSCALL #10

  ADDI R6, R8, #5000
  LI R0, #'D'
  ST R0, R6, #0
  LI R0, #'E'
  ST R0, R6, #1
  LI R0, #'M'
  ST R0, R6, #2
  LI R0, #'O'
  ST R0, R6, #3
  LI R0, #0
  ST R0, R6, #4

  LI R0, #4
  LI R1, #4
  LI R2, #str_asm_bar - app4_asm_rom
  ADD R2, R2, R8
  LI R3, #COL_WHITE
  LI R4, #-230
  SYSCALL #21

  LI R0, #4
  LI R1, #22
  LI R2, #str_asm_rdy - app4_asm_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-315
  SYSCALL #21

  LI R0, #0
  LI R1, #0
  LI R2, #0
  LI R3, #0
  SYSCALL #24

asm_ev_lp:
  SYSCALL #25
  CMPI R0, #0
  JZX asm_idle
  CMPI R0, #1
  JZX asm_on_key
  CMPI R0, #2
  JZX asm_on_click
  JMPX asm_ev_lp

asm_idle:
  SYSCALL #2
  JMPX asm_ev_lp

asm_on_click:
  CMPI R2, #18
  JNNX asm_ev_lp
  CMPI R1, #48
  JNX asm_do_file
  CMPI R1, #96
  JNX asm_do_run
  JMPX asm_do_stream

asm_on_key:
  CMPI R1, #'A'
  JZX asm_do_file
  CMPI R1, #'a'
  JZX asm_do_file
  CMPI R1, #'R'
  JZX asm_do_run
  CMPI R1, #'r'
  JZX asm_do_run
  CMPI R1, #'S'
  JZX asm_do_stream
  CMPI R1, #'s'
  JZX asm_do_stream
  JMPX asm_ev_lp

asm_do_file:
  LI R0, #5000
  LMI R0, #30
  SYSCALL #37
  CMPI R0, #0
  JNX asm_ev_lp
  JMPX asm_do_stream

asm_do_stream:
  LI R0, #0
  LI R1, #RAM_CAP
  LMI R1, #30
  SW R0, R1, #0
  CALLX a_ent

  ; Save assembled binary from OBUF (35*19683) of length OLEN to disk file "OUT" (type 4)
  LI R1, #OLEN
  LMI R1, #30
  LW R2, R1, #0 ; OLEN
  CMPI R2, #0
  JNPX asm_draw_stat
  LI R0, #str_asm_out_fn - app4_asm_rom
  LMI R0, #30
  LI R1, #0
  LMI R1, #35 ; OBUF = 35 * 19683
  LI R3, #4   ; type 4 = binary
  SYSCALL #32

asm_draw_stat:
  LI R0, #4
  LI R1, #38
  LI R2, #168
  LI R3, #32
  LI R4, #-315
  SYSCALL #20

  LI R0, #4
  LI R1, #40
  LI R2, #str_asm_done - app4_asm_rom
  LMI R2, #30
  LI R3, #COL_GREEN
  LI R4, #-315
  SYSCALL #21

  LI R1, #OLEN
  LMI R1, #30
  LW R2, R1, #0
  LI R0, #4
  LI R1, #56
  LI R3, #10
  LI R4, #COL_YELLOW
  LI R5, #-315
  SYSCALL #26

  LI R0, #0
  LI R1, #0
  LI R2, #0
  LI R3, #0
  SYSCALL #24
  JMPX asm_ev_lp

asm_do_run:
  LI R1, #OLEN
  LMI R1, #30
  LW R1, R1, #0
  CMPI R1, #0
  JNPX asm_ev_lp
  LI R0, #0
  LMI R0, #35
  LI R2, #5 ; app_id = 5 (rebuilt Calculator)
  SYSCALL #7
  JMPX asm_ev_lp

str_asm_out_fn: .stringz "OUT"
toupper:
  CMPI R0, #97
  JNX toupper_ret
  CMPI R0, #128
  JPX toupper_ret
  SUBI R0, R0, #32
toupper_ret:
  RET
puts: RET
pdec: RET
put_nl: RET

a_ent: LI R0,#0
LI R1,#OLEN
LMI R1,#30
SW R0,R1,#0
LI R1,#EFLG
LMI R1,#30
SW R0,R1,#0
LI R1,#6506
LMI R1,#30
LI R2,#4706
LMI R2,#31
a_clr_st: SW R0,R1,#0
ADDI R1,R1,#9
CMP R1,R2
JNX a_clr_st
LI R0,#0
ADDI R0,R0,#5317
ADDM R0,R0,#31
LI R1,#SPOOL_P
LMI R1,#30
SW R0,R1,#0
LI R0,#1
LI R1,#PASS
LMI R1,#30
SW R0,R1,#0
CALLX a_rp
LI R1,#EFLG
LMI R1,#30
LW R0,R1,#0
JNZX a_ent_ret
LI R0,#2
LI R1,#PASS
LMI R1,#30
SW R0,R1,#0
CALLX a_rp
a_ent_ret: RET
src_reset: PUSH R0
PUSH R1
LI R0,#1
LI R1,#CUR_LBA
LMI R1,#30
SW R0,R1,#0
SYSCALL #36
LI R0,#0
LI R1,#SEC_IDX
LMI R1,#30
SW R0,R1,#0
LI R1,#CHAR_CNT
LMI R1,#30
SW R0,R1,#0
LI R6,#0
POP R1
POP R0
RET
src_peek: PUSH R1
PUSH R2
PUSH R3
LI R1,#RAM_CAP
LMI R1,#30
LW R2,R1,#0
CMPI R2,#0
JZX spk_no_cap
CMP R6,R2
JNNX spk_cap_err
spk_no_cap: LI R3,#729
DIV R1,R6,R3
ADDI R1,R1,#1
LI R2,#CUR_LBA
LMI R2,#30
LW R3,R2,#0
CMP R1,R3
JZX spk_in_buf
SW R1,R2,#0
PUSH R0
MOV R0,R1
SYSCALL #36
POP R0
spk_in_buf: LI R3,#729
MOD R1,R6,R3
ADDI R1,R1,#SEC_BUF
ADDM R1,R1,#30
LT R0,R1,#0
POP R3
POP R2
POP R1
RET
spk_cap_err: LI R2,#str_err_cap-app4_asm_rom
LMI R2,#30
LI R0,#3
CALLX a_err_com
LI R0,#0
POP R3
POP R2
POP R1
RET
src_peek_next: ADDI R6,R6,#1
CALLX src_peek
MOV R4,R0
SUBI R6,R6,#1
RET
a_rp: CALLX src_reset
LI R7,#0
LI R0,#1
LI R1,#LNUM
LMI R1,#30
SW R0,R1,#0
a_ll: LI R1,#EFLG
LMI R1,#30
LW R0,R1,#0
JNZX a_pd
CALLX a_sh
CALLX src_peek
CMPI R0,#0
JZX a_pd
CMPI R0,#10
JZX a_nl
CMPI R0,#59
JZX a_se
CALLX a_rt
CALLX src_peek
CMPI R0,#58
JNZX a_nlb
ADDI R6,R6,#1
LI R1,#PASS
LMI R1,#30
LW R0,R1,#0
CMPI R0,#1
JNZX a_ll
MOV R5,R7
CALLX a_sd
JMPX a_ll
a_nl: ADDI R6,R6,#1
LI R1,#LNUM
LMI R1,#30
LW R0,R1,#0
ADDI R0,R0,#1
SW R0,R1,#0
JMPX a_ll
a_se: LI R1,#EFLG
LMI R1,#30
LW R0,R1,#0
JNZX a_pd
a_se_lp: CALLX src_peek
CMPI R0,#0
JZX a_pd
CMPI R0,#10
JZX a_nl
ADDI R6,R6,#1
JMPX a_se_lp
a_pd: RET
a_nlb: CALLX a_lm
CMPI R3,#10
JNNX a_hd
LI R1,#PASS
LMI R1,#30
LW R0,R1,#0
CMPI R0,#1
JZX a_ip1
PUSH R2
PUSH R3
LI R4,#0
LI R5,#0
LI R8,#0
CMPI R3,#0
JZX a_ei
CMPI R3,#1
JZX asm_fmt_r3
CMPI R3,#2
JZX asm_fmt_r2
CMPI R3,#3
JZX asm_fmt_cmp
CMPI R3,#4
JZX asm_fmt_cmpi
CMPI R3,#5
JZX asm_fmt_ri
CMPI R3,#6
JZX asm_fmt_rri
CMPI R3,#7
JZX asm_fmt_r1s
CMPI R3,#8
JZX asm_fmt_r1d
CALLX a_eo
MOV R8,R0
JMPX a_ei
asm_fmt_r3: CALLX a_pr
MOV R4,R0
CALLX a_sc
CALLX a_pr
MOV R5,R0
CALLX a_sc
CALLX a_pr
CALLX asm_bal9
MOV R8,R0
JMPX a_ei
asm_fmt_r2: CALLX a_pr
MOV R4,R0
CALLX a_sc
CALLX a_pr
MOV R5,R0
JMPX a_ei
asm_fmt_cmp: CALLX a_pr
MOV R5,R0
CALLX a_sc
CALLX a_pr
CALLX asm_bal9
MOV R8,R0
JMPX a_ei
asm_fmt_cmpi: CALLX a_pr
MOV R5,R0
CALLX a_sc
CALLX a_eo
MOV R8,R0
JMPX a_ei
asm_fmt_ri: CALLX a_pr
MOV R4,R0
CALLX a_sc
CALLX a_eo
MOV R8,R0
JMPX a_ei
asm_fmt_rri: CALLX a_pr
MOV R4,R0
CALLX a_sc
CALLX a_pr
MOV R5,R0
CALLX a_sc
CALLX a_eo
MOV R8,R0
JMPX a_ei
asm_fmt_r1s: CALLX a_pr
MOV R5,R0
JMPX a_ei
asm_fmt_r1d: CALLX a_pr
MOV R4,R0
a_ei: POP R3
POP R2
MOV R0,R4
CALLX asm_bal9
MULI R0,R0,#9
MOV R4,R0
MOV R0,R5
CALLX asm_bal9
ADD R4,R4,R0
MULI R2,R2,#81
ADD R0,R2,R4
CALLX a_em
MOV R0,R8
CALLX a_em
JMPX a_se
a_ip1: ADDI R7,R7,#2
JMPX a_se
a_hd: CMPI R3,#10
JZX asm_dir_equ
CMPI R3,#11
JZX asm_dir_org
CMPI R3,#12
JZX asm_dir_tryte
CMPI R3,#13
JZX asm_dir_word
CMPI R3,#16
JZX asm_fmt_jrel
CMPI R3,#17
JZX a_se
JMPX asm_dir_string
asm_fmt_jrel: LI R1,#PASS
LMI R1,#30
LW R0,R1,#0
CMPI R0,#1
JZX a_ip1
PUSH R2
PUSH R3
CALLX a_sh
CALLX src_peek
CMPI R0,#35
JZX jrel_imm
CALLX a_eo
SUB R0,R0,R7
SUBI R0,R0,#2
MOV R8,R0
JMPX jrel_emit
jrel_imm: CALLX a_eo
MOV R8,R0
jrel_emit: LI R4,#0
LI R5,#0
JMPX a_ei
asm_dir_equ: CALLX a_sh
CALLX a_rt
LI R1,#PASS
LMI R1,#30
LW R0,R1,#0
CMPI R0,#1
JNZX ade_p2
LI R5,#0
CALLX a_sd
PUSH R2
CALLX a_sc
CALLX a_eo
POP R2
SW R0,R2,#3
JMPX a_se
ade_p2: CALLX a_sc
CALLX a_eo
JMPX a_se
asm_dir_org: CALLX a_eo
MOV R7,R0
JMPX a_se
asm_dir_tryte: CALLX a_eo
LI R1,#PASS
LMI R1,#30
LW R2,R1,#0
CMPI R2,#2
JNZX asm_dt_p1
CALLX a_em
JMPX asm_dt_next
asm_dt_p1: ADDI R7,R7,#1
asm_dt_next: CALLX a_sh
CALLX src_peek
CMPI R0,#44
JNZX a_se
ADDI R6,R6,#1
JMPX asm_dir_tryte
asm_dir_word: CALLX a_eo
LI R1,#PASS
LMI R1,#30
LW R2,R1,#0
CMPI R2,#2
JNZX asm_dw_p1
LI R1,#0
LMI R1,#35
ADD R1,R1,R7
SW R0,R1,#0
ADDI R7,R7,#3
CALLX a_um
JMPX asm_dw_next
asm_dw_p1: ADDI R7,R7,#3
asm_dw_next: CALLX a_sh
CALLX src_peek
CMPI R0,#44
JNZX a_se
ADDI R6,R6,#1
JMPX asm_dir_word
asm_dir_string: CALLX a_sh
CALLX src_peek
CMPI R0,#34
JNZX a_se
ADDI R6,R6,#1
asm_ds_lp: CALLX src_peek
CMPI R0,#0
JZX asm_ds_done
CMPI R0,#34
JZX asm_ds_close
CMPI R0,#92
JNZX asm_ds_emit
ADDI R6,R6,#1
CALLX src_peek
CMPI R0,#'n'
JNZX asm_ds_chk_r
LI R0,#10
JMPX asm_ds_emit
asm_ds_chk_r: CMPI R0,#'r'
JNZX asm_ds_chk_t
LI R0,#13
JMPX asm_ds_emit
asm_ds_chk_t: CMPI R0,#'t'
JNZX asm_ds_chk_0
LI R0,#9
JMPX asm_ds_emit
asm_ds_chk_0: CMPI R0,#'0'
JNZX asm_ds_emit
LI R0,#0
asm_ds_emit: ADDI R6,R6,#1
LI R1,#PASS
LMI R1,#30
LW R2,R1,#0
CMPI R2,#2
JNZX asm_ds_p1
CALLX a_em
JMPX asm_ds_lp
asm_ds_p1: ADDI R7,R7,#1
JMPX asm_ds_lp
asm_ds_close: ADDI R6,R6,#1
CMPI R3,#15
JNZX asm_ds_done
LI R1,#PASS
LMI R1,#30
LW R2,R1,#0
CMPI R2,#2
JNZX asm_dsz_p1
LI R0,#0
CALLX a_em
JMPX asm_ds_done
asm_dsz_p1: ADDI R7,R7,#1
asm_ds_done: JMPX a_se
a_em: PUSH R1
LI R1,#EFLG
LMI R1,#30
LW R1,R1,#0
JNZX a_em_sk
LI R1,#0
LMI R1,#35
ADD R1,R1,R7
ST R0,R1,#0
ADDI R7,R7,#1
CALLX a_um
a_em_sk: POP R1
RET
a_um: PUSH R1
PUSH R2
LI R1,#OLEN
LMI R1,#30
LW R2,R1,#0
CMP R7,R2
JNPX asm_uml_ret
SW R7,R1,#0
asm_uml_ret: POP R2
POP R1
RET
asm_bal9: CMPI R0,#4
JNPX asm_bal9_ret
SUBI R0,R0,#9
asm_bal9_ret: RET
a_sh: CALLX src_peek
CMPI R0,#32
JZX asm_sh_adv
CMPI R0,#9
JZX asm_sh_adv
CMPI R0,#13
JZX asm_sh_adv
RET
asm_sh_adv: ADDI R6,R6,#1
JMPX a_sh
a_sc: CALLX a_sh
CALLX src_peek
CMPI R0,#44
JNZX asm_sc_ret
ADDI R6,R6,#1
asm_sc_ret: CALLX a_sh
RET
a_rt: PUSH R1
LI R1,#EFLG
LMI R1,#30
LW R0,R1,#0
JNZX a_rt_sk
CALLX a_sh
LI R4,#0
LI R1,#TBUF
LMI R1,#30
asm_rt_lp: CALLX src_peek
CMPI R0,#0
JZX asm_rt_done
CMPI R0,#32
JZX asm_rt_done
CMPI R0,#9
JZX asm_rt_done
CMPI R0,#10
JZX asm_rt_done
CMPI R0,#13
JZX asm_rt_done
CMPI R0,#44
JZX asm_rt_done
CMPI R0,#58
JZX asm_rt_done
CMPI R0,#59
JZX asm_rt_done
CMPI R0,#43
JZX asm_rt_done
CMPI R0,#45
JZX asm_rt_done
CALLX toupper
ST R0,R1,#0
ADDI R1,R1,#1
MULI R4,R4,#41
ADD R4,R4,R0
ADDI R6,R6,#1
JMPX asm_rt_lp
asm_rt_done: LI R0,#0
ST R0,R1,#0
a_rt_sk: POP R1
RET
a_pr: CALLX a_sh
ADDI R6,R6,#1
CALLX src_peek
SUBI R0,R0,#48
ADDI R6,R6,#1
RET
a_lm: PUSH R1
PUSH R5
LI R1,#mnem_table-app4_asm_rom
LMI R1,#30
asm_lm_lp: LW R5,R1,#0
JZX asm_lm_nf
CMP R4,R5
JZX asm_lm_found
ADDI R1,R1,#5
JMPX asm_lm_lp
asm_lm_found: LT R2,R1,#3
LT R3,R1,#4
POP R5
POP R1
RET
asm_lm_nf: LI R2,#0
LI R3,#0
POP R5
POP R1
RET
a_sd: CALLX a_sl
JZX a_err_dup
PUSH R1
PUSH R3
PUSH R8
LI R1,#SPOOL_P
LMI R1,#30
LW R8,R1,#0
LI R1,#SYMC
LMI R1,#30
LW R2,R1,#0
SW R4,R2,#0
SW R5,R2,#3
SW R8,R2,#6
LI R3,#TBUF
LMI R3,#30
a_sd_cp: LT R0,R3,#0
ST R0,R8,#0
ADDI R3,R3,#1
ADDI R8,R8,#1
CMPI R0,#0
JNZX a_sd_cp
LI R1,#SPOOL_P
LMI R1,#30
SW R8,R1,#0
POP R8
POP R3
POP R1
RET
a_sl: PUSH R1
PUSH R2
PUSH R3
PUSH R5
PUSH R8
LI R2,#1987
MOD R1,R4,R2
CMPI R1,#0
JNNX a_sl_pos
ADDI R1,R1,#1987
a_sl_pos: MULI R1,R1,#9
ADDI R1,R1,#STAB
ADDM R1,R1,#30
asm_sl_lp: LW R8,R1,#6
CMPI R8,#0
JZX asm_sl_nf
LW R5,R1,#0
CMP R4,R5
JNZX asm_sl_nx
LI R3,#TBUF
LMI R3,#30
asm_sl_cmp: LT R0,R3,#0
LT R5,R8,#0
CMP R0,R5
JNZX asm_sl_nx
CMPI R0,#0
JZX asm_sl_found
ADDI R3,R3,#1
ADDI R8,R8,#1
JMPX asm_sl_cmp
asm_sl_nx: ADDI R1,R1,#9
LI R2,#4700
LMI R2,#31
CMP R1,R2
JNX asm_sl_lp
LI R1,#STAB
LMI R1,#30
JMPX asm_sl_lp
asm_sl_found: LI R2,#SYMC
LMI R2,#30
SW R1,R2,#0
LW R0,R1,#3
POP R8
POP R5
POP R3
POP R2
POP R1
CMP R0,R0
RET
asm_sl_nf: LI R2,#SYMC
LMI R2,#30
SW R1,R2,#0
LI R0,#0
POP R8
POP R5
POP R3
POP R2
POP R1
CMPI R0,#1
RET
a_err_dup: LI R2,#str_err_dup-app4_asm_rom
LMI R2,#30
LI R0,#1
JMPX a_err_com
a_err_undef: LI R2,#str_err_und-app4_asm_rom
LMI R2,#30
LI R0,#2
a_err_com: PUSH R1
PUSH R3
LI R1,#EFLG
LMI R1,#30
LW R3,R1,#0
JNZX a_err_done
SW R0,R1,#0
LI R1,#str_err_pfx-app4_asm_rom
LMI R1,#30
CALLX puts
LI R1,#LNUM
LMI R1,#30
LW R0,R1,#0
CALLX pdec
MOV R1,R2
CALLX puts
LI R1,#TBUF
LMI R1,#30
CALLX puts
CALLX put_nl
LI R1,#OLEN
LMI R1,#30
LW R3,R1,#0
LI R0,#0
SW R0,R1,#0
LI R1,#0
LMI R1,#35
BFILL R1,R0,R3
a_err_done: POP R3
POP R1
LI R2,#SBUF
LMI R2,#30
RET
a_eo: PUSH R2
PUSH R3
PUSH R4
CALLX a_sh
CALLX src_peek
CMPI R0,#35
JNZX asm_eo_nohash
ADDI R6,R6,#1
asm_eo_nohash: CALLX a_et
MOV R2,R0
CALLX a_sh
CALLX src_peek
CMPI R0,#43
JZX asm_eo_plus
CMPI R0,#45
JZX asm_eo_minus
MOV R0,R2
POP R4
POP R3
POP R2
RET
asm_eo_plus: ADDI R6,R6,#1
CALLX a_et
ADD R0,R2,R0
POP R4
POP R3
POP R2
RET
asm_eo_minus: ADDI R6,R6,#1
CALLX a_et
SUB R0,R2,R0
POP R4
POP R3
POP R2
RET
a_et: CALLX a_sh
CALLX src_peek
CMPI R0,#39
JZX asm_et_char
LI R3,#1
CMPI R0,#43
JZX asm_et_pos
CMPI R0,#45
JNZX asm_et_chk_num
LI R3,#-1
asm_et_pos: ADDI R6,R6,#1
CALLX src_peek
asm_et_chk_num: CMPI R0,#48
JNX asm_et_sym
CMPI R0,#57
JPX asm_et_sym
CMPI R0,#48
JNZX asm_et_dec
CALLX src_peek_next
CMPI R4,#'t'
JZX asm_et_tern
CMPI R4,#'T'
JZX asm_et_tern
asm_et_dec: LI R4,#0
asm_et_dec_lp: CALLX src_peek
CMPI R0,#48
JNX asm_et_dec_done
CMPI R0,#57
JPX asm_et_dec_done
SUBI R0,R0,#48
MULI R4,R4,#10
ADD R4,R4,R0
ADDI R6,R6,#1
JMPX asm_et_dec_lp
asm_et_dec_done: MUL R0,R4,R3
RET
asm_et_tern: ADDI R6,R6,#2
LI R4,#0
asm_et_tern_lp: CALLX src_peek
CALLX toupper
CMPI R0,#'1'
JZX asm_ett_1
CMPI R0,#'0'
JZX asm_ett_0
CMPI R0,#'T'
JZX asm_ett_t
MUL R0,R4,R3
RET
asm_ett_1: MULI R4,R4,#3
ADDI R4,R4,#1
ADDI R6,R6,#1
JMPX asm_et_tern_lp
asm_ett_0: MULI R4,R4,#3
ADDI R6,R6,#1
JMPX asm_et_tern_lp
asm_ett_t: MULI R4,R4,#3
SUBI R4,R4,#1
ADDI R6,R6,#1
JMPX asm_et_tern_lp
asm_et_char: ADDI R6,R6,#1
CALLX src_peek
CMPI R0,#92
JNZX asm_etc_norm
ADDI R6,R6,#1
CALLX src_peek
CMPI R0,#'n'
JNZX asm_etc_norm
LI R0,#10
asm_etc_norm: ADDI R6,R6,#2
RET
asm_et_sym: CALLX a_rt
LI R1,#PASS
LMI R1,#30
LW R0,R1,#0
CMPI R0,#1
JZX asm_et_sym_p1
CALLX a_sl
JNZX asm_et_und
MUL R0,R0,R3
RET
asm_et_und: PUSH R2
CALLX a_err_undef
POP R2
LI R0,#0
RET
asm_et_sym_p1: LI R0,#0
RET

str_err_pfx: .stringz "ERR"
str_err_dup: .stringz "DUP"
str_err_und: .stringz "UND"
str_err_cap: .stringz "CAP"
str_asm_title: .stringz "ASSEMBLER"
str_asm_bar:   .stringz "[ASM] [RUN] [SELF] DEMO"
str_asm_rdy:   .stringz "A:FILE S:STREAM R:RUN"
str_asm_done:  .stringz "ASM OK! EMITTED TRYTES:"

mnem_table:
.word #3289761
.tryte #100,#10
.word #3306598
.tryte #100,#11
.word #5572553814
.tryte #100,#12
.word #134784408
.tryte #100,#12
.word #136117362
.tryte #100,#13
.word #228364001197
.tryte #100,#14
.word #1737326564180
.tryte #100,#15
.word #135427579
.tryte #100,#17
.word #5074777
.tryte #-1,#0
.word #134437
.tryte #0,#0
.word #3189
.tryte #1,#5
.word #131314
.tryte #2,#5
.word #132762
.tryte #3,#2
.word #112121
.tryte #4,#1
.word #4597034
.tryte #5,#6
.word #112120
.tryte #6,#1
.word #143074
.tryte #7,#1
.word #5866107
.tryte #8,#6
.word #142296
.tryte #9,#1
.word #132998
.tryte #10,#1
.word #5452991
.tryte #11,#6
.word #117387
.tryte #12,#1
.word #132744
.tryte #13,#1
.word #134018
.tryte #14,#2
.word #3200
.tryte #15,#6
.word #3487
.tryte #16,#6
.word #3203
.tryte #17,#6
.word #3490
.tryte #18,#6
.word #5660040
.tryte #19,#7
.word #137799
.tryte #20,#8
.word #127631
.tryte #21,#9
.word #3112
.tryte #22,#9
.word #3124
.tryte #23,#9
.word #3114
.tryte #24,#9
.word #127682
.tryte #25,#9
.word #127672
.tryte #26,#9
.word #127670
.tryte #27,#9
.word #3116
.tryte #28,#7
.word #4730164
.tryte #29,#9
.word #140755
.tryte #30,#0
.word #3071
.tryte #31,#5
.word #136368
.tryte #32,#5
.word #115864
.tryte #-2,#3
.word #4750497
.tryte #-3,#4
.word #5921872
.tryte #-4,#1
.word #5921554
.tryte #-5,#1
.word #5905308
.tryte #-6,#1
.word #5901916
.tryte #-7,#1
.word #5940613
.tryte #-8,#1
.word #9977599123
.tryte #-9,#6
.word #142551
.tryte #-10,#1
.word #5844664
.tryte #-11,#6
.word #142557
.tryte #-12,#1
.word #5844910
.tryte #-13,#6
.word #130986
.tryte #33,#5
.word #130781
.tryte #34,#5
.word #4597038
.tryte #35,#6
.word #4597033
.tryte #36,#6
.word #130632
.tryte #37,#6
.word #143055
.tryte #38,#6
.word #131411
.tryte #39,#6
.word #143178
.tryte #40,#6
.word #5232959
.tryte #41,#16
.word #127680
.tryte #42,#16
.word #128172
.tryte #43,#16
.word #127762
.tryte #44,#16
.word #5235050
.tryte #45,#16
.word #5234640
.tryte #46,#16
.word #5234558
.tryte #47,#16
.word #193936812
.tryte #48,#16
.word #5212617
.tryte #49,#6
.word #191254101
.tryte #50,#1
.word #191450601
.tryte #51,#1
.word #404809122219
.tryte #52,#9
.word #5171988
.tryte #53,#0
.word #222550952
.tryte #54,#5
.word #223515846
.tryte #55,#4
.word #0
.tryte #0,#0

app4_asm_end:

; ----------------------------------------------------------------------------
; APP 0: TERMINAL SHELL
; Commands: LS, CAT <F>, RM <F>, PS, KILL <ID>, RUN <0..10>, LOOP, FAULT <1..4>, FILL, KCHK
; ----------------------------------------------------------------------------
app0_term_rom:
  LI R0, #12
  LI R1, #12
  LI R2, #180
  LI R3, #110
  LI R4, #str_term_title - app0_term_rom
  ADD R4, R4, R8
  LI R5, #-340
  SYSCALL #10

  LI R0, #4
  LI R1, #4
  LI R2, #str_term_ban - app0_term_rom
  ADD R2, R2, R8
  LI R3, #COL_GREEN
  LI R4, #-340
  SYSCALL #21

  LI R7, #0
  ADDI R6, R8, #2500
  LI R0, #0
  ST R0, R6, #0
  CALLX term_draw_cmdline

term_ev_lp:
  SYSCALL #25
  CMPI R0, #0
  JZX term_idle
  CMPI R0, #1
  JZX term_on_key
  JMPX term_ev_lp

term_idle:
  ADDI R6, R8, #2499
  LT R0, R6, #0
  CMPI R0, #0
  JZX term_do_yield
  LI R0, #0
  ST R0, R6, #0
  CALLX term_draw_cmdline
term_do_yield:
  SYSCALL #2
  JMPX term_ev_lp

term_on_key:
  CMPI R1, #13
  JZX term_exec_cmd
  CMPI R1, #10
  JZX term_exec_cmd
  CMPI R1, #8
  JZX term_bs
  CMPI R7, #24
  JNNX term_ev_lp
  CMPI R1, #97
  JNX term_ch_ok
  CMPI R1, #128
  JPX term_ch_ok
  SUBI R1, R1, #32
term_ch_ok:
  ADDI R6, R8, #2500
  ADD R6, R6, R7
  ST R1, R6, #0
  LI R0, #0
  ST R0, R6, #1
  ADDI R7, R7, #1
  ADDI R6, R8, #2499
  LI R0, #1
  ST R0, R6, #0
  JMPX term_ev_lp

term_bs:
  CMPI R7, #0
  JZX term_ev_lp
  SUBI R7, R7, #1
  ADDI R6, R8, #2500
  ADD R6, R6, R7
  LI R0, #0
  ST R0, R6, #0
  ADDI R6, R8, #2499
  LI R0, #1
  ST R0, R6, #0
  JMPX term_ev_lp

term_draw_cmdline:
  LI R0, #4
  LI R1, #18
  LI R2, #170
  LI R3, #10
  LI R4, #-340
  SYSCALL #20
  LI R0, #4
  LI R1, #18
  LI R2, #str_term_pr - app0_term_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-340
  SYSCALL #21
  LI R0, #20
  LI R1, #18
  ADDI R2, R8, #2500
  LI R3, #COL_WHITE
  LI R4, #-340
  SYSCALL #21
  LI R0, #4
  LI R1, #18
  LI R2, #170
  LI R3, #10
  SYSCALL #24
  RET

term_exec_cmd:
  LI R0, #4
  LI R1, #32
  LI R2, #170
  LI R3, #65
  LI R4, #-340
  SYSCALL #20

  ADDI R1, R8, #2500
  CALLX term_skip_sp
  LT R0, R1, #0
  CMPI R0, #0
  JZX term_cmd_done
  CMPI R0, #'L'
  JZX term_cmd_l
  CMPI R0, #'C'
  JZX term_cmd_cat
  CMPI R0, #'R'
  JZX term_cmd_r
  CMPI R0, #'P'
  JZX term_cmd_ps
  CMPI R0, #'K'
  JZX term_cmd_k
  CMPI R0, #'F'
  JZX term_cmd_f
  JMPX term_cmd_done

term_cmd_l:
  LT R0, R1, #1
  CMPI R0, #'O'
  JZX term_cmd_loop
  ADDI R0, R8, #2600
  SYSCALL #30
  MOV R5, R0
  ADDI R4, R8, #2600
  LI R6, #34
term_ls_lp:
  CMPI R5, #0
  JNPX term_cmd_done
  LI R0, #0
  ST R0, R4, #8
  PUSH R4
  PUSH R5
  PUSH R6
  LI R0, #6
  MOV R1, R6
  MOV R2, R4
  LI R3, #COL_YELLOW
  LI R4, #-340
  SYSCALL #21
  POP R6
  POP R5
  POP R4
  ADDI R4, R4, #16
  ADDI R6, R6, #12
  SUBI R5, R5, #1
  JMPX term_ls_lp

term_cmd_loop:
  LI R0, #term_loop_task_code - app0_term_rom
  ADD R0, R0, R8
  LI R1, #16
  LI R2, #7
  SYSCALL #7
  JMPX term_cmd_done

term_loop_task_code:
  ADDI R0, R0, #1
  JMPX term_loop_task_code

term_cmd_cat:
  CALLX term_skip_word
  CALLX term_skip_sp
  MOV R0, R1
  ADDI R1, R8, #2600
  LI R2, #120
  SYSCALL #31
  CMPI R0, #0
  JNX term_cmd_done
  LI R0, #6
  LI R1, #36
  ADDI R2, R8, #2600
  LI R3, #COL_WHITE
  LI R4, #-340
  SYSCALL #21
  JMPX term_cmd_done

term_cmd_r:
  LT R0, R1, #1
  CMPI R0, #'M'
  JZX term_cmd_rm
  ; RUN <0..10>
  CALLX term_skip_word
  CALLX term_skip_sp
  LI R0, #0
term_run_num_lp:
  LT R2, R1, #0
  CMPI R2, #48
  JNX term_run_go
  CMPI R2, #57
  JPX term_run_go
  SUBI R2, R2, #48
  MULI R0, R0, #10
  ADD R0, R0, R2
  ADDI R1, R1, #1
  JMPX term_run_num_lp
term_run_go:
  SYSCALL #4
  JMPX term_cmd_done

term_cmd_rm:
  CALLX term_skip_word
  CALLX term_skip_sp
  MOV R0, R1
  SYSCALL #33
  JMPX term_cmd_done

term_cmd_ps:
  ADDI R0, R8, #2600
  SYSCALL #6
  MOV R2, R0
  LI R0, #6
  LI R1, #36
  LI R3, #10
  LI R4, #COL_GREEN
  LI R5, #-340
  SYSCALL #26
  ; Also write the 64-tryte task status table at UBASE + 2600 to disk file "PS"
  LI R0, #str_term_fn_ps - app0_term_rom
  ADD R0, R0, R8
  ADDI R1, R8, #2600
  LI R2, #64
  LI R3, #1
  SYSCALL #32
  JMPX term_cmd_done

term_cmd_k:
  LT R0, R1, #1
  CMPI R0, #'C'
  JZX term_cmd_kchk
  CMPI R0, #'S'
  JZX term_cmd_kchk
  CALLX term_skip_word
  CALLX term_skip_sp
  LT R0, R1, #0
  SUBI R0, R0, #48
  SYSCALL #5
  JMPX term_cmd_done

term_cmd_kchk:
  ; KCHK: query SYS_KERNEL_INFO (#8) into UBASE + 2600 and save to disk file "KSTAT"
  ADDI R0, R8, #2600
  SYSCALL #8
  MOV R2, R0 ; kernel checksum
  LI R0, #6
  LI R1, #36
  LI R3, #10
  LI R4, #COL_GREEN
  LI R5, #-340
  SYSCALL #26
  LI R0, #str_term_fn_kstat - app0_term_rom
  ADD R0, R0, R8
  ADDI R1, R8, #2600
  LI R2, #18
  LI R3, #1
  SYSCALL #32
  JMPX term_cmd_done

term_cmd_f:
  LT R0, R1, #1
  CMPI R0, #'I'
  JZX term_cmd_fill
  ; FAULT <1..4>
  CALLX term_skip_word
  CALLX term_skip_sp
  LT R0, R1, #0
  CMPI R0, #'1'
  JZX fault_prot
  CMPI R0, #'2'
  JZX fault_priv
  CMPI R0, #'3'
  JZX fault_div0
  LI R0, #-500
  JR R0
fault_prot:
  LI R1, #100
  LI R0, #999
  ST R0, R1, #0
  JMPX term_cmd_done
fault_priv:
  LI R0, #0
  MTSPR R0, #5
  JMPX term_cmd_done
fault_div0:
  LI R0, #100
  LI R1, #0
  DIV R0, R0, R1
  JMPX term_cmd_done

term_cmd_fill:
  ; FILL: genuinely fill the block disk through the guest by saving 50-sector (36,450-tryte) files
  ; "F00", "F01", ... until SYS_FS_WRITE returns -1 (DISK FULL)!
  LI R4, #0 ; file counter 0..43
term_fill_lp:
  ADDI R5, R8, #2580 ; filename buffer
  LI R0, #'F'
  ST R0, R5, #0
  LI R0, #10
  DIV R1, R4, R0
  ADDI R1, R1, #48
  ST R1, R5, #1
  MOD R1, R4, R0
  ADDI R1, R1, #48
  ST R1, R5, #2
  LI R0, #0
  ST R0, R5, #3

  MOV R0, R5
  MOV R1, R8 ; src_ptr = UBASE
  LI R2, #36450 - 19683
  LMI R2, #2 ; 36,450 trytes = 50 sectors!
  LI R3, #1
  SYSCALL #32
  CMPI R0, #-1
  JZX term_fill_full
  ADDI R4, R4, #1
  CMPI R4, #45
  JNX term_fill_lp
term_fill_full:
  LI R0, #6
  LI R1, #36
  LI R2, #str_term_full - app0_term_rom
  ADD R2, R2, R8
  LI R3, #COL_YELLOW
  LI R4, #-340
  SYSCALL #21
  JMPX term_cmd_done

term_cmd_done:
  LI R7, #0
  ADDI R6, R8, #2500
  LI R0, #0
  ST R0, R6, #0
  CALLX term_draw_cmdline
  LI R0, #0
  LI R1, #0
  LI R2, #0
  LI R3, #0
  SYSCALL #24
  JMPX term_ev_lp

term_skip_sp:
  LT R0, R1, #0
  CMPI R0, #32
  JNZX tss_ret
  ADDI R1, R1, #1
  JMPX term_skip_sp
tss_ret:
  RET

term_skip_word:
  LT R0, R1, #0
  CMPI R0, #0
  JZX tsw_ret
  CMPI R0, #32
  JZX tsw_ret
  ADDI R1, R1, #1
  JMPX term_skip_word
tsw_ret:
  RET

str_term_title:    .stringz "TERMINAL"
str_term_ban:      .stringz "TRITOS DESKTOP SH"
str_term_pr:       .stringz "> "
str_term_fn_ps:    .stringz "PS"
str_term_fn_kstat: .stringz "KSTAT"
str_term_full:     .stringz "DISK FULL"
app0_term_end:


; ----------------------------------------------------------------------------
; APP 6: KLONDIKE SOLITAIRE (APP_ID = 6)
; Standard 7 tableau piles, stock, waste, 4 foundations, Draw-1 and Draw-3 modes,
; 729-color cards, mouse drag-and-drop, illegal move refusal, win detection,
; documented Fisher-Yates shuffle (S = (S * 127 + 259) % 6561), save state to "SOL".
; Memory layout (relative to R8 = UBASE):
;   +5000..5205: SOL_STATE (206 trytes, saved to "SOL"):
;     +5000: seed
;     +5001: draw_mode (1 or 3)
;     +5002: won (0 or 1)
;     +5003: move_count
;     +5004: illegal_count
;     +5005: stock_len (0..24)
;     +5006: waste_len (0..24)
;     +5007..5010: found_len[0..3]
;     +5011..5017: tab_len[0..6]
;     +5018..5024: tab_down[0..6]
;     +5025..5048: stock[0..23]
;     +5049..5072: waste[0..23]
;     +5073..5205: tab[0..6][0..18] (7 * 19 = 133 trytes)
;   +5210: next_seed (-1 or accumulated typed digits)
;   +5211: drag_src (-1=none, 0..6=tab, 7=waste, 8..11=found)
;   +5212: drag_idx
;   +5213: dirty
;   +5220..5271: deck[0..51]
;   +5280..5295: card label scratch
; ----------------------------------------------------------------------------
app6_sol_rom:
  LI R0, #18
  LI R1, #18
  LI R2, #232
  LI R3, #148
  LI R4, #str_sol_title - app6_sol_rom
  ADD R4, R4, R8
  LI R5, #-290
  SYSCALL #10

  ; Initialize seed = 1, draw_mode = 1, next_seed = -1, drag_src = -1
  ADDI R6, R8, #7000
  LI R0, #1
  ST R0, R6, #0 ; seed = 1
  ST R0, R6, #1 ; draw_mode = 1
  LI R0, #-1
  ST R0, R6, #210 ; next_seed = -1
  ST R0, R6, #211 ; drag_src = -1

  CALLX sol_deal
  CALLX sol_redraw

sol_ev_lp:
  SYSCALL #25
  CMPI R0, #0
  JZX sol_idle
  CMPI R0, #1
  JZX sol_on_key
  CMPI R0, #2
  JZX sol_on_mdown
  CMPI R0, #4
  JZX sol_on_mup
  JMPX sol_ev_lp

sol_idle:
  ADDI R6, R8, #7213
  LT R0, R6, #0
  CMPI R0, #0
  JZX sol_do_yield
  LI R0, #0
  ST R0, R6, #0
  CALLX sol_redraw
sol_do_yield:
  SYSCALL #2
  JMPX sol_ev_lp

sol_on_key:
  ; Isolation test triggers: 200 = fault, 201 = infinite loop
  CMPI R1, #200
  JZX sol_trig_fault
  CMPI R1, #201
  JZX sol_trig_loop

  ; Digits '0'..'9' accumulate next_seed
  CMPI R1, #48
  JNX sol_key_non_digit
  CMPI R1, #57
  JPX sol_key_non_digit
  SUBI R1, R1, #48
  ADDI R6, R8, #7210
  LT R0, R6, #0
  CMPI R0, #-1
  JNZX sol_seed_acc
  MOV R0, R1
  ST R0, R6, #0
  LI R5, #7284
  ADD R5, R8, R5
  SW R1, R5, #0
  JMPX sol_ev_lp
sol_seed_acc:
  MULI R0, R0, #10
  ADD R0, R0, R1
  ST R0, R6, #0
  LI R5, #7284
  ADD R5, R8, R5
  LW R0, R5, #0
  MULI R0, R0, #10
  ADD R0, R0, R1
  SW R0, R5, #0
  JMPX sol_ev_lp

sol_key_non_digit:
  CMPI R1, #'N'
  JZX sol_cmd_new
  CMPI R1, #'n'
  JZX sol_cmd_new
  CMPI R1, #'D'
  JZX sol_cmd_mode
  CMPI R1, #'d'
  JZX sol_cmd_mode
  CMPI R1, #'S'
  JZX sol_cmd_save
  CMPI R1, #'s'
  JZX sol_cmd_save
  CMPI R1, #'K'
  JZX sol_cmd_klondike_cnsw
  CMPI R1, #'k'
  JZX sol_cmd_klondike_cnsw
  CMPI R1, #'F'
  JZX sol_cmd_freecell
  CMPI R1, #'f'
  JZX sol_cmd_freecell
  CMPI R1, #'M'
  JZX sol_cmd_spider
  CMPI R1, #'m'
  JZX sol_cmd_spider
  CMPI R1, #'T'
  JZX sol_cmd_fc_step
  CMPI R1, #'t'
  JZX sol_cmd_fc_step
  CMPI R1, #'X'
  JZX sol_cmd_fc_deadend
  CMPI R1, #'x'
  JZX sol_cmd_fc_deadend
  CMPI R1, #'V'
  JZX sol_cmd_solve
  CMPI R1, #'v'
  JZX sol_cmd_solve
  CMPI R1, #'U'
  JZX sol_cmd_undo
  CMPI R1, #'u'
  JZX sol_cmd_undo
  CMPI R1, #'Z'
  JZX sol_cmd_undo
  CMPI R1, #'z'
  JZX sol_cmd_undo
  CMPI R1, #128 ; Left (clickwheel scroll)
  JZX sol_cw_prev
  CMPI R1, #129 ; Right (clickwheel scroll)
  JZX sol_cw_next
  CMPI R1, #130 ; Up
  JZX sol_cw_prev
  CMPI R1, #131 ; Down
  JZX sol_cw_next
  CMPI R1, #13  ; Enter (clickwheel select)
  JZX sol_cw_select
  CMPI R1, #27  ; Esc (clickwheel back)
  JZX sol_cw_back
  CMPI R1, #32 ; Space -> draw from stock
  JZX sol_cmd_draw
  JMPX sol_ev_lp

sol_cw_prev:
  ADDI R6, R8, #7214 ; cw_cursor (0..12: 0..6=tab, 7=waste, 8..11=found, 12=stock)
  LT R0, R6, #0
  SUBI R0, R0, #1
  CMPI R0, #0
  JNNX scwp_ok
  LI R0, #12
scwp_ok:
  ST R0, R6, #0
  ADDI R6, R8, #7213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_cw_next:
  ADDI R6, R8, #7214
  LT R0, R6, #0
  ADDI R0, R0, #1
  CMPI R0, #13
  JNX scwn_ok
  LI R0, #0
scwn_ok:
  ST R0, R6, #0
  ADDI R6, R8, #7213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_cw_back:
  ADDI R6, R8, #7211 ; drag_src = -1
  LI R0, #-1
  ST R0, R6, #0
  ADDI R6, R8, #7213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_cw_select:
  ADDI R6, R8, #7214
  LT R0, R6, #0 ; cw_cursor 0..12
  CMPI R0, #12
  JZX sol_cmd_draw
  ADDI R6, R8, #7211
  LT R4, R6, #0 ; drag_src
  CMPI R4, #-1
  JNZX scws_drop
  ; Select source pile R0 (for tableau 0..6, select face-up start tab_down[c])
  ST R0, R6, #0
  LI R1, #0
  CMPI R0, #7
  JNNX scws_st_idx
  ADDI R5, R8, #7018
  ADD R5, R5, R0
  LT R1, R5, #0 ; tab_down[c]
scws_st_idx:
  ST R1, R6, #1
  ADDI R6, R8, #7213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp
scws_drop:
  LT R5, R6, #1 ; drag_idx
  LI R1, #-1
  ST R1, R6, #0 ; clear drag_src
  MOV R3, R0    ; dest = cw_cursor
  CALLX sol_try_move
  JMPX sol_ev_lp

sol_cmd_undo:
  LI R1, #7290
  ADD R1, R8, R1
  LT R0, R1, #0
  CMPI R0, #2
  JNZX scu_klondike
  LW R2, R1, #2 ; undo_sp
  CMPI R2, #0
  JNPX sol_ev_lp
  SUBI R2, R2, #1
  SW R2, R1, #2
  MULI R5, R2, #4
  LI R0, #8000
  ADD R0, R8, R0
  ADD R5, R0, R5
  CALLX fcs_undo_move
  JMPX sol_ev_lp
scu_klondike:
  ADDI R6, R8, #7215 ; undo_depth
  LT R0, R6, #0
  CMPI R0, #0
  JNPX sol_ev_lp
  SUBI R0, R0, #1
  ST R0, R6, #0
  MULI R1, R0, #206
  LI R2, #8000
  ADD R2, R2, R8
  ADD R1, R2, R1 ; src snapshot
  ADDI R0, R8, #7000 ; dst SOL_STATE
  LI R2, #206
  BCOPY R0, R1, R2
  ADDI R6, R8, #7213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_trig_fault:
  LI R1, #100
  LI R0, #999
  ST R0, R1, #0
  JMPX sol_ev_lp
sol_trig_loop:
  JMPX sol_trig_loop

sol_cmd_new:
  ADDI R6, R8, #7210
  LT R0, R6, #0
  CMPI R0, #-1
  JZX sol_new_keep_seed
  ADDI R5, R8, #7000
  ST R0, R5, #0
  LI R0, #-1
  ST R0, R6, #0
sol_new_keep_seed:
  CALLX sol_deal
  ADDI R6, R8, #7213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_cmd_mode:
  ADDI R6, R8, #7001
  LT R0, R6, #0
  CMPI R0, #1
  JZX sol_set_d3
  LI R0, #1
  JMPX sol_st_mode
sol_set_d3:
  LI R0, #3
sol_st_mode:
  ST R0, R6, #0
  ADDI R6, R8, #7213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_cmd_save:
  LI R1, #7290
  ADD R1, R8, R1
  LT R0, R1, #0
  CMPI R0, #2
  JNZX scsv_klon
  CALLX sol_save_fcsol
scsv_klon:
  LI R0, #str_sol_fn - app6_sol_rom
  ADD R0, R0, R8
  ADDI R1, R8, #7000
  LI R2, #206
  LI R3, #1
  SYSCALL #32
  JMPX sol_ev_lp

sol_cmd_draw:
  CALLX sol_draw_stock
  ADDI R6, R8, #7213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_on_mdown:
  ; R1 = client_x, R2 = client_y
  ADDI R6, R8, #7211
  LI R0, #-1
  ST R0, R6, #0 ; drag_src = -1

  ; 1. Check toolbar (y < 13)
  CMPI R2, #13
  JNNX sol_md_top
  CMPI R1, #44
  JNX sol_cmd_new
  CMPI R1, #88
  JNX sol_cmd_mode
  CMPI R1, #140
  JNX sol_cmd_save
  JMPX sol_ev_lp

sol_md_top:
  ; 2. Check top row (y in 14..36): Stock (6..32), Waste (34..64), Foundations (90..210)
  CMPI R2, #37
  JNNX sol_md_tab
  CMPI R1, #6
  JNX sol_md_illegal
  CMPI R1, #32
  JNPX sol_cmd_draw
  CMPI R1, #64
  JNPX sol_md_waste
  CMPI R1, #90
  JNX sol_md_illegal
  SUBI R0, R1, #90
  LI R3, #30
  DIV R0, R0, R3 ; f = 0..3
  CMPI R0, #4
  JNNX sol_md_illegal
  ADDI R5, R8, #7007
  ADD R5, R5, R0
  LT R3, R5, #0 ; found_len[f]
  CMPI R3, #0
  JNPX sol_md_illegal
  ADDI R0, R0, #8 ; drag_src = 8 + f
  ST R0, R6, #0
  SUBI R3, R3, #1
  ST R3, R6, #1
  JMPX sol_ev_lp

sol_md_waste:
  ADDI R5, R8, #7006
  LT R3, R5, #0 ; waste_len
  CMPI R3, #0
  JNPX sol_md_illegal
  LI R0, #7
  ST R0, R6, #0 ; drag_src = 7 (waste)
  SUBI R3, R3, #1
  ST R3, R6, #1
  JMPX sol_ev_lp

sol_md_tab:
  ; 3. Tableau columns c = 0..6 at x = 6 + c*30, y >= 38
  CMPI R1, #6
  JNX sol_md_illegal
  SUBI R0, R1, #6
  LI R3, #30
  DIV R0, R0, R3 ; c = 0..6
  CMPI R0, #7
  JNNX sol_md_illegal
  ADDI R5, R8, #7011
  ADD R5, R5, R0
  LT R3, R5, #0 ; tab_len[c]
  CMPI R3, #0
  JNPX sol_md_illegal
  ; Compute card index r = (y - 40) / 5, clamped to [0, tab_len[c] - 1]
  SUBI R4, R2, #40
  CMPI R4, #0
  JNNX sol_md_r0
  LI R4, #0
  JMPX sol_md_r1
sol_md_r0:
  LI R7, #5
  DIV R4, R4, R7
sol_md_r1:
  SUBI R7, R3, #1
  CMP R4, R7
  JNPX sol_md_r2
  MOV R4, R7
sol_md_r2:
  ; Check if r < tab_down[c] (face-down card -> illegal!)
  ADDI R5, R8, #7018
  ADD R5, R5, R0
  LT R7, R5, #0 ; tab_down[c]
  CMP R4, R7
  JNX sol_md_illegal
  ST R0, R6, #0 ; drag_src = c
  ST R4, R6, #1 ; drag_idx = r
  JMPX sol_ev_lp

sol_md_illegal:
  ADDI R5, R8, #7004
  LT R0, R5, #0
  ADDI R0, R0, #1
  ST R0, R5, #0 ; illegal_count++
  ADDI R6, R8, #7213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_on_mup:
  ; R1 = drop_x, R2 = drop_y
  ADDI R6, R8, #7211
  LT R4, R6, #0 ; drag_src
  CMPI R4, #-1
  JZX sol_ev_lp
  LT R5, R6, #1 ; drag_idx
  LI R0, #-1
  ST R0, R6, #0 ; clear drag_src

  ; Determine drop target:
  ; If y in 14..36 and x >= 90 -> Foundation f = (x - 90) / 30 (dest = 8 + f)
  ; If y >= 38 and x >= 6 -> Tableau dst_c = (x - 6) / 30 (dest = dst_c)
  CMPI R2, #14
  JNX sol_mup_illegal
  CMPI R2, #37
  JNNX sol_mup_tab
  CMPI R1, #90
  JNX sol_mup_illegal
  SUBI R3, R1, #90
  LI R0, #30
  DIV R3, R3, R0 ; f = 0..3
  CMPI R3, #4
  JNNX sol_mup_illegal
  ADDI R3, R3, #8 ; dest = 8 + f
  CALLX sol_try_move
  JMPX sol_ev_lp

sol_mup_tab:
  CMPI R1, #6
  JNX sol_mup_illegal
  SUBI R3, R1, #6
  LI R0, #30
  DIV R3, R3, R0 ; dst_c = 0..6
  CMPI R3, #7
  JNNX sol_mup_illegal
  CALLX sol_try_move
  JMPX sol_ev_lp

sol_mup_illegal:
  ADDI R5, R8, #7004
  LT R0, R5, #0
  ADDI R0, R0, #1
  ST R0, R5, #0
  ADDI R6, R8, #7213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

; sol_draw_stock: draws 1 or 3 cards from stock to waste, or recycles waste to stock
sol_push_undo:
  PUSH R0
  PUSH R1
  PUSH R2
  ADDI R1, R8, #7215 ; undo_depth
  LT R0, R1, #0
  CMPI R0, #8
  JNNX spu_done
  ADDI R2, R0, #1
  ST R2, R1, #0
  MULI R0, R0, #206
  LI R2, #8000
  ADD R2, R2, R8
  ADD R0, R2, R0 ; dst snapshot
  ADDI R1, R8, #7000 ; src SOL_STATE
  LI R2, #206
  BCOPY R0, R1, R2
spu_done:
  POP R2
  POP R1
  POP R0
  RET

sol_draw_stock:
  CALLX sol_push_undo
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  ADDI R5, R8, #7000
  LT R1, R5, #5 ; stock_len
  CMPI R1, #0
  JPX sds_draw_cards
  ; Stock is empty -> check waste_len
  LT R2, R5, #6 ; waste_len
  CMPI R2, #0
  JNPX sds_illegal
  ; Recycle waste[0..R2-1] in reverse order into stock[0..R2-1]
  LI R3, #0 ; i = 0
sds_rec_lp:
  CMP R3, R2
  JNNX sds_rec_done
  SUB R4, R2, R3
  SUBI R4, R4, #1 ; waste_len - 1 - i
  ADDI R0, R5, #49
  ADD R0, R0, R4
  LT R4, R0, #0 ; card = waste[waste_len - 1 - i]
  ADDI R0, R5, #25
  ADD R0, R0, R3
  ST R4, R0, #0 ; stock[i] = card
  ADDI R3, R3, #1
  JMPX sds_rec_lp
sds_rec_done:
  ST R2, R5, #5 ; stock_len = old waste_len
  LI R0, #0
  ST R0, R5, #6 ; waste_len = 0
  ; Clear waste slots to -1
  ADDI R0, R5, #49
  LI R1, #-1
  LI R2, #24
  BFILL R0, R1, R2
  LT R0, R5, #3
  ADDI R0, R0, #1
  ST R0, R5, #3 ; move_count++
  JMPX sds_done

sds_draw_cards:
  LT R3, R5, #1 ; draw_mode (1 or 3)
sds_dc_lp:
  CMPI R3, #0
  JNPX sds_dc_ok
  LT R1, R5, #5 ; stock_len
  CMPI R1, #0
  JNPX sds_dc_ok
  SUBI R1, R1, #1
  ST R1, R5, #5 ; stock_len--
  ADDI R0, R5, #25
  ADD R0, R0, R1
  LT R4, R0, #0 ; card = stock[stock_len]
  LI R2, #-1
  ST R2, R0, #0 ; clear stock slot
  LT R2, R5, #6 ; waste_len
  ADDI R0, R5, #49
  ADD R0, R0, R2
  ST R4, R0, #0 ; waste[waste_len] = card
  ADDI R2, R2, #1
  ST R2, R5, #6 ; waste_len++
  SUBI R3, R3, #1
  JMPX sds_dc_lp
sds_dc_ok:
  LT R0, R5, #3
  ADDI R0, R0, #1
  ST R0, R5, #3 ; move_count++
  JMPX sds_done

sds_illegal:
  LT R0, R5, #4
  ADDI R0, R0, #1
  ST R0, R5, #4 ; illegal_count++
sds_done:
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; sol_try_move: R4 = drag_src (0..6=tab, 7=waste, 8..11=found), R5 = drag_idx, R3 = dest (0..6=tab, 8..11=found)
sol_try_move:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7

  ; Reject same-pile drop
  CMP R4, R3
  JZX stm_refuse

  ; Get moving card ID into R6 and card count being moved into R7
  CMPI R4, #7
  JZX stm_src_waste
  CMPI R4, #8
  JNNX stm_src_found
  ; Source is Tableau R4 at index R5
  ADDI R0, R8, #7011
  ADD R0, R0, R4
  LT R1, R0, #0 ; tab_len[src]
  SUB R7, R1, R5 ; count = tab_len[src] - drag_idx
  CMPI R7, #0
  JNPX stm_refuse
  MULI R0, R4, #19
  ADD R0, R0, R5
  ADDI R0, R0, #7073
  ADD R0, R0, R8
  LT R6, R0, #0 ; moving bottom card
  JMPX stm_have_src

stm_src_waste:
  ADDI R0, R8, #7006
  LT R1, R0, #0 ; waste_len
  CMPI R1, #0
  JNPX stm_refuse
  SUBI R1, R1, #1
  ADDI R0, R8, #7049
  ADD R0, R0, R1
  LT R6, R0, #0
  LI R7, #1
  JMPX stm_have_src

stm_src_found:
  SUBI R1, R4, #8 ; f
  ADDI R0, R8, #7007
  ADD R0, R0, R1
  LT R2, R0, #0 ; found_len[f]
  CMPI R2, #0
  JNPX stm_refuse
  SUBI R2, R2, #1
  MULI R6, R1, #13
  ADD R6, R6, R2 ; card = f*13 + (found_len[f] - 1)
  LI R7, #1

stm_have_src:
  ; Check destination R3:
  CMPI R3, #8
  JNNX stm_dst_found

  ; Destination is Tableau R3 (0..6):
  ; Check dst pile length
  ADDI R0, R8, #7011
  ADD R0, R0, R3
  LT R1, R0, #0 ; dst_len = tab_len[dst]
  LI R2, #13
  DIV R0, R6, R2 ; src_suit = card / 13
  MOD R2, R6, R2 ; src_rank = card % 13
  CMPI R1, #0
  JPX stm_dst_tab_nonempty
  ; Empty tableau pile -> only King (rank == 12) allowed!
  CMPI R2, #12
  JNZX stm_refuse
  JMPX stm_exec_tab

stm_dst_tab_nonempty:
  ; Non-empty tableau pile -> get top card at tab[dst][dst_len - 1]
  SUBI R1, R1, #1
  MULI R0, R3, #19
  ADD R0, R0, R1
  ADDI R0, R0, #7073
  ADD R0, R0, R8
  LT R1, R0, #0 ; top_card
  LI R2, #13
  DIV R0, R6, R2 ; src_suit
  DIV R1, R1, R2 ; top_suit
  ADD R0, R0, R1
  LI R2, #2
  MOD R0, R0, R2 ; (src_suit + top_suit) % 2 must be 1 (opposite colors!)
  CMPI R0, #1
  JNZX stm_refuse
  ; Check src_rank + 1 == top_rank
  ADDI R0, R8, #7011
  ADD R0, R0, R3
  LT R1, R0, #0
  SUBI R1, R1, #1
  MULI R0, R3, #19
  ADD R0, R0, R1
  ADDI R0, R0, #7073
  ADD R0, R0, R8
  LT R1, R0, #0 ; top_card
  LI R2, #13
  MOD R0, R6, R2 ; src_rank
  MOD R1, R1, R2 ; top_rank
  ADDI R0, R0, #1
  CMP R0, R1
  JNZX stm_refuse

stm_exec_tab:
  CALLX sol_push_undo
  ; Legal move to Tableau R3! Append R7 cards to tab[R3] and remove from source R4
  ADDI R0, R8, #7011
  ADD R0, R0, R3
  LT R1, R0, #0 ; dst_len
  ADD R2, R1, R7
  CMPI R2, #19
  JPX stm_refuse
  ST R2, R0, #0 ; tab_len[dst] = dst_len + R7

  ; Destination pointer in tab[dst]:
  MULI R2, R3, #19
  ADD R2, R2, R1
  ADDI R2, R2, #7073
  ADD R2, R2, R8 ; R2 = &tab[dst][dst_len]

  CMPI R4, #7
  JZX stm_et_from_waste
  CMPI R4, #8
  JNNX stm_et_from_found

  ; From Tableau R4 at R5 (count R7):
  MULI R1, R4, #19
  ADD R1, R1, R5
  ADDI R1, R1, #7073
  ADD R1, R1, R8 ; R1 = &tab[src][drag_idx]
  MOV R0, R7
stm_et_cp_lp:
  CMPI R0, #0
  JNPX stm_et_cp_done
  LT R6, R1, #0
  ST R6, R2, #0
  LI R6, #-1
  ST R6, R1, #0
  ADDI R1, R1, #1
  ADDI R2, R2, #1
  SUBI R0, R0, #1
  JMPX stm_et_cp_lp
stm_et_cp_done:
  ADDI R0, R8, #7011
  ADD R0, R0, R4
  ST R5, R0, #0 ; tab_len[src] = drag_idx
  ; Flip new top card if tab_down[src] == drag_idx and drag_idx > 0
  CMPI R5, #0
  JNPX stm_move_ok
  ADDI R0, R8, #7018
  ADD R0, R0, R4
  LT R1, R0, #0 ; tab_down[src]
  CMP R1, R5
  JNX stm_move_ok
  SUBI R1, R5, #1
  ST R1, R0, #0
  JMPX stm_move_ok

stm_et_from_waste:
  ST R6, R2, #0
  ADDI R0, R8, #7006
  LT R1, R0, #0
  SUBI R1, R1, #1
  ST R1, R0, #0
  ADDI R0, R8, #7049
  ADD R0, R0, R1
  LI R2, #-1
  ST R2, R0, #0
  JMPX stm_move_ok

stm_et_from_found:
  ST R6, R2, #0
  SUBI R1, R4, #8
  ADDI R0, R8, #7007
  ADD R0, R0, R1
  LT R2, R0, #0
  SUBI R2, R2, #1
  ST R2, R0, #0
  JMPX stm_move_ok

stm_dst_found:
  ; Destination is Foundation f = R3 - 8 (0..3)
  ; Only single card (R7 == 1) can move to Foundation!
  CMPI R7, #1
  JNZX stm_refuse
  SUBI R1, R3, #8 ; f
  LI R2, #13
  DIV R0, R6, R2 ; card_suit
  CMP R0, R1
  JNZX stm_refuse
  MOD R0, R6, R2 ; card_rank
  ADDI R2, R8, #7007
  ADD R2, R2, R1
  LT R3, R2, #0 ; found_len[f]
  CMP R0, R3
  JNZX stm_refuse

  ; Legal move to Foundation f!
  CALLX sol_push_undo
  ADDI R3, R3, #1
  ST R3, R2, #0 ; found_len[f]++

  ; Remove card from source R4
  CMPI R4, #7
  JZX stm_ef_from_waste
  CMPI R4, #8
  JNNX stm_ef_from_found
  ; From Tableau R4 at R5
  MULI R0, R4, #19
  ADD R0, R0, R5
  ADDI R0, R0, #7073
  ADD R0, R0, R8
  LI R1, #-1
  ST R1, R0, #0
  ADDI R0, R8, #7011
  ADD R0, R0, R4
  ST R5, R0, #0 ; tab_len[src] = drag_idx
  CMPI R5, #0
  JNPX stm_move_ok
  ADDI R0, R8, #7018
  ADD R0, R0, R4
  LT R1, R0, #0
  CMP R1, R5
  JNX stm_move_ok
  SUBI R1, R5, #1
  ST R1, R0, #0
  JMPX stm_move_ok

stm_ef_from_waste:
  ADDI R0, R8, #7006
  LT R1, R0, #0
  SUBI R1, R1, #1
  ST R1, R0, #0
  ADDI R0, R8, #7049
  ADD R0, R0, R1
  LI R2, #-1
  ST R2, R0, #0
  JMPX stm_move_ok

stm_ef_from_found:
  SUBI R1, R4, #8
  ADDI R0, R8, #7007
  ADD R0, R0, R1
  LT R2, R0, #0
  SUBI R2, R2, #1
  ST R2, R0, #0

stm_move_ok:
  ; Increment move_count (+5003) and check win condition (sum of found_len[0..3] == 52)
  ADDI R0, R8, #7000
  LT R1, R0, #3
  ADDI R1, R1, #1
  ST R1, R0, #3
  LT R1, R0, #7
  LT R2, R0, #8
  ADD R1, R1, R2
  LT R2, R0, #9
  ADD R1, R1, R2
  LT R2, R0, #10
  ADD R1, R1, R2
  CMPI R1, #52
  JNZX stm_mark_dirty
  LI R1, #1
  ST R1, R0, #2 ; won = 1
  JMPX stm_mark_dirty

stm_refuse:
  ADDI R0, R8, #7004
  LT R1, R0, #0
  ADDI R1, R1, #1
  ST R1, R0, #0 ; illegal_count++

stm_mark_dirty:
  ADDI R0, R8, #7213
  LI R1, #1
  ST R1, R0, #0
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; sol_deal: initializes deck[0..51], shuffles with LCG S = (S * 127 + 259) % 6561, and populates SOL_STATE
sol_deal:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7

  ; 1. Initialize deck[0..51] at UBASE + 5220
  ADDI R1, R8, #7220
  LI R0, #0
sd_init_lp:
  CMPI R0, #52
  JNNX sd_shuf_init
  ADD R2, R1, R0
  ST R0, R2, #0
  ADDI R0, R0, #1
  JMPX sd_init_lp

sd_shuf_init:
  ADDI R0, R8, #7000
  LT R2, R0, #0 ; s = seed
  LI R3, #51    ; i = 51
  LI R4, #6561  ; modulus = 6561
sd_shuf_lp:
  CMPI R3, #1
  JNX sd_clear_state
  MULI R2, R2, #127
  ADDI R2, R2, #259
  MOD R2, R2, R4 ; s = (s * 127 + 259) % 6561
  CMPI R2, #0
  JNNX sd_s_pos
  ADD R2, R2, R4
sd_s_pos:
  ADDI R5, R3, #1 ; i + 1
  MOD R6, R2, R5  ; j = s % (i + 1)
  ; __PERTURB_SOLITAIRE_SHUFFLE__
  ; Swap deck[i] and deck[j]
  ADD R5, R1, R3 ; &deck[i]
  ADD R6, R1, R6 ; &deck[j]
  LT R0, R5, #0
  LT R7, R6, #0
  ST R7, R5, #0
  ST R0, R6, #0
  SUBI R3, R3, #1
  JMPX sd_shuf_lp

sd_clear_state:
  ; Zero counters +5002..+5024
  ADDI R0, R8, #7002
  LI R2, #0
  LI R3, #23
  BFILL R0, R2, R3
  ; Fill card arrays +5025..+5205 (181 trytes) with -1
  ADDI R0, R8, #7025
  LI R2, #-1
  LI R3, #181
  BFILL R0, R2, R3

  ; Deal 28 cards into tableau piles c = 0..6
  LI R2, #0 ; deck idx = 0
  LI R3, #0 ; c = 0
sd_tab_c_lp:
  CMPI R3, #7
  JNNX sd_stock_deal
  ADDI R0, R8, #7011
  ADD R0, R0, R3
  ADDI R4, R3, #1
  ST R4, R0, #0 ; tab_len[c] = c + 1
  ADDI R0, R8, #7018
  ADD R0, R0, R3
  ST R3, R0, #0 ; tab_down[c] = c
  LI R4, #0 ; r = 0
sd_tab_r_lp:
  CMP R4, R3
  JPX sd_tab_nx_c
  ADD R0, R1, R2
  LT R5, R0, #0 ; card = deck[idx]
  ADDI R2, R2, #1
  MULI R6, R3, #19
  ADD R6, R6, R4
  ADDI R6, R6, #7073
  ADD R6, R6, R8
  ST R5, R6, #0 ; tab[c][r] = card
  ADDI R4, R4, #1
  JMPX sd_tab_r_lp
sd_tab_nx_c:
  ADDI R3, R3, #1
  JMPX sd_tab_c_lp

sd_stock_deal:
  ; Remaining 24 cards deck[28..51] go into stock[0..23]
  ADDI R0, R8, #7005
  LI R3, #24
  ST R3, R0, #0 ; stock_len = 24
  LI R3, #0 ; i = 0
sd_stk_lp:
  CMPI R3, #24
  JNNX sd_done
  ADD R0, R1, R2
  LT R5, R0, #0
  ADDI R2, R2, #1
  ADDI R6, R8, #7025
  ADD R6, R6, R3
  ST R5, R6, #0
  ADDI R3, R3, #1
  JMPX sd_stk_lp

sd_done:
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; sol_redraw: renders toolbar, stock, waste, 4 foundations, 7 tableau piles, and win banner in 729-color palette
sol_redraw:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7

  ; Clear playfield
  LI R0, #0
  LI R1, #0
  LI R2, #218
  LI R3, #135
  LI R4, #-290
  SYSCALL #20

  LI R5, #7290
  ADD R5, R8, R5
  LT R0, R5, #0
  CMPI R0, #2
  JZX sol_redraw_freecell
  CMPI R0, #3
  JZX sol_redraw_spider
  ; Draw toolbar at (4, 2)
  LI R0, #4
  LI R1, #2
  LI R2, #str_sol_bar - app6_sol_rom
  ADD R2, R2, R8
  LI R3, #COL_WHITE
  LI R4, #-230
  SYSCALL #21

  ; Draw Stock pile at (6, 15, 22, 18)
  ADDI R5, R8, #7000
  LT R0, R5, #5 ; stock_len
  LI R4, #-200
  CMPI R0, #0
  JNPX sr_stk_col
  LI R4, #-120 ; blue card back when non-empty
sr_stk_col:
  LI R0, #6
  LI R1, #15
  LI R2, #22
  LI R3, #18
  SYSCALL #20
  ADDI R5, R8, #7000
  LT R2, R5, #5
  LI R0, #8
  LI R1, #20
  LI R3, #10
  LI R4, #COL_WHITE
  LI R5, #-120
  SYSCALL #26

  ; Draw Waste pile at (34, 15, 22, 18)
  ADDI R5, R8, #7000
  LT R1, R5, #6 ; waste_len
  CMPI R1, #0
  JNPX sr_founds
  SUBI R1, R1, #1
  ADDI R0, R5, #49
  ADD R0, R0, R1
  LT R2, R0, #0 ; top waste card
  LI R0, #34
  LI R1, #15
  CALLX sol_draw_card

sr_founds:
  ; Draw 4 Foundations at x = 90 + f*30, y = 15
  LI R6, #0 ; f = 0..3
sr_f_lp:
  CMPI R6, #4
  JNNX sr_tabs
  MULI R0, R6, #30
  ADDI R0, R0, #90
  LI R1, #15
  ADDI R5, R8, #7007
  ADD R5, R5, R6
  LT R2, R5, #0 ; found_len[f]
  CMPI R2, #0
  JPX sr_f_card
  ; Empty foundation slot
  PUSH R0
  LI R2, #22
  LI R3, #18
  LI R4, #-250
  SYSCALL #20
  POP R0
  JMPX sr_f_nx
sr_f_card:
  SUBI R2, R2, #1
  MULI R3, R6, #13
  ADD R2, R3, R2 ; card = f*13 + (found_len[f] - 1)
  CALLX sol_draw_card
sr_f_nx:
  ADDI R6, R6, #1
  JMPX sr_f_lp

sr_tabs:
  ; Draw 7 Tableau piles c = 0..6 at x = 6 + c*30, y = 40 + r*5
  LI R6, #0 ; c = 0..6
sr_tc_lp:
  CMPI R6, #7
  JNNX sr_chk_win
  ADDI R5, R8, #7011
  ADD R5, R5, R6
  LT R7, R5, #0 ; tab_len[c]
  LI R4, #0 ; r = 0
sr_tr_lp:
  CMP R4, R7
  JNNX sr_tc_nx
  MULI R0, R6, #30
  ADDI R0, R0, #6 ; x
  MULI R1, R4, #5
  ADDI R1, R1, #40 ; y
  ; Check if r < tab_down[c]
  ADDI R5, R8, #7018
  ADD R5, R5, R6
  LT R3, R5, #0 ; tab_down[c]
  CMP R4, R3
  JNNX sr_tr_up
  ; Face-down card back
  PUSH R4
  LI R2, #24
  LI R3, #10
  LI R4, #-140
  SYSCALL #20
  POP R4
  JMPX sr_tr_nx
sr_tr_up:
  MULI R5, R6, #19
  ADD R5, R5, R4
  ADDI R5, R5, #7073
  ADD R5, R5, R8
  LT R2, R5, #0 ; card ID
  CALLX sol_draw_card
sr_tr_nx:
  ADDI R4, R4, #1
  JMPX sr_tr_lp
sr_tc_nx:
  ADDI R6, R6, #1
  JMPX sr_tc_lp

sr_chk_win:
  ADDI R5, R8, #7002
  LT R0, R5, #0 ; won
  CMPI R0, #0
  JZX sr_flush
  LI R0, #20
  LI R1, #60
  LI R2, #190
  LI R3, #20
  LI R4, #COL_GREEN
  SYSCALL #20
  LI R0, #32
  LI R1, #66
  LI R2, #str_sol_win - app6_sol_rom
  ADD R2, R2, R8
  LI R3, #COL_BLACK
  LI R4, #COL_GREEN
  SYSCALL #21

sr_flush:
  LI R0, #0
  LI R1, #0
  LI R2, #0
  LI R3, #0
  SYSCALL #24
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; sol_draw_card: R0=x, R1=y, R2=card_id (0..51)
sol_draw_card:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  MOV R5, R0 ; x
  MOV R6, R1 ; y
  ; Fill card face (24x12) with white (364)
  LI R2, #24
  LI R3, #12
  LI R4, #COL_WHITE
  SYSCALL #20
  ; Re-read card_id from stack [SP + 12] -> simpler: pop/push or use scratch
  ADDI R4, R8, #7280
  ; Wait: save R2 at UBASE + 5290 before SYSCALL #20!
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  ADDI R4, R8, #7280
  LI R3, #13
  DIV R5, R2, R3 ; suit 0..3
  MOD R6, R2, R3 ; rank 0..12
  LI R3, #str_sol_ranks - app6_sol_rom
  ADD R3, R3, R8
  ADD R3, R3, R6
  LT R3, R3, #0
  ST R3, R4, #0 ; rank char
  LI R3, #str_sol_suits - app6_sol_rom
  ADD R3, R3, R8
  ADD R3, R3, R5
  LT R3, R3, #0
  ST R3, R4, #1 ; suit char
  LI R3, #0
  ST R3, R4, #2
  ; Color: Red (292) for suit 1,3; Black (-364) for suit 0,2
  LI R3, #2
  MOD R5, R5, R3
  LI R3, #COL_BLACK
  CMPI R5, #0
  JZX sdc_txt
  LI R3, #COL_RED
sdc_txt:
  ADDI R0, R0, #2
  ADDI R1, R1, #2
  MOV R2, R4
  LI R4, #COL_WHITE
  SYSCALL #21
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

str_sol_title: .stringz "SOLITAIRE"
str_sol_bar:   .stringz "[NEW] [D1/3] [SAVE] SOL"
str_sol_win:   .stringz "YOU WIN! SOLITAIRE!"
str_sol_ranks: .stringz "A23456789TJQK"
str_sol_suits: .stringz "SHCD"

sol_cmd_klondike_cnsw:
  ADDI R6, R8, #7210
  LT R0, R6, #0
  CMPI R0, #-1
  JZX sckc_keep_seed
  ADDI R5, R8, #7000
  ST R0, R5, #0
  LI R0, #-1
  ST R0, R6, #0
sckc_keep_seed:
  LI R1, #7290
  ADD R1, R8, R1
  LI R0, #1
  ST R0, R1, #0 ; game_mode = 1 (Klondike CNSW)
  LI R0, #0
  SW R0, R1, #2 ; undo_sp = 0
  CALLX sol_write_dealchk
  CALLX sol_deal_cnsw_klondike
  ADDI R6, R8, #7213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_cmd_freecell:
  ADDI R6, R8, #7210
  LT R0, R6, #0
  CMPI R0, #-1
  JZX sfc_keep_seed
  ADDI R5, R8, #7000
  ST R0, R5, #0
  LI R0, #-1
  ST R0, R6, #0
  LI R5, #7284
  ADD R5, R8, R5
  LW R0, R5, #0
  SW R0, R5, #3 ; +5287 = full 27-trit seed!
sfc_keep_seed:
  LI R1, #7290
  ADD R1, R8, R1
  LI R0, #2
  ST R0, R1, #0 ; game_mode = 2 (FreeCell)
  LI R0, #0
  SW R0, R1, #2 ; undo_sp = 0
  LI R0, #-2
  ST R0, R1, #5 ; fc_verdict = -2
  LI R0, #0
  SW R0, R1, #6 ; fc_nodes = 0
  LI R0, #110
  SW R0, R1, #9 ; fc_budget = 110
  CALLX sol_deal_freecell
  CALLX sol_save_fcsol
  ADDI R6, R8, #7213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_cmd_spider:
  LI R1, #7290
  ADD R1, R8, R1
  LT R0, R1, #0
  CMPI R0, #3
  JNZX ssp_init_s1
  LT R0, R1, #1
  CMPI R0, #1
  JZX ssp_s2
  CMPI R0, #2
  JZX ssp_s4
ssp_init_s1:
  LI R0, #1
  JMPX ssp_set_s
ssp_s2:
  LI R0, #2
  JMPX ssp_set_s
ssp_s4:
  LI R0, #4
ssp_set_s:
  ST R0, R1, #1
  LI R0, #3
  ST R0, R1, #0 ; game_mode = 3 (Spider)
  LI R0, #0
  SW R0, R1, #2 ; undo_sp = 0
  CALLX sol_deal_spider
  ADDI R6, R8, #7213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

; 'T' key in FreeCell mode: execute a reversible step move (C2X or X2C) and push to Move-Log Undo (+6000)
sol_cmd_fc_step:
  LI R1, #7290
  ADD R1, R8, R1
  LT R0, R1, #0
  CMPI R0, #2
  JNZX sol_ev_lp
  LW R2, R1, #2 ; undo_sp
  LI R3, #2
  DIV R5, R2, R3 ; half = undo_sp / 2
  MOD R0, R2, R3 ; odd = undo_sp % 2
  LI R3, #8
  MOD R5, R5, R3 ; col = (undo_sp / 2) % 8
  LI R4, #0      ; slot = 0
  LI R6, #7314
  ADD R6, R8, R6 ; &fc_free[0]
  CMPI R0, #0
  JNZX sfs_x2c
  ; Even step: move top of col (R5) to free[0] (type 5 = C2X)
  LI R7, #7318
  ADD R7, R8, R7
  ADD R7, R7, R5
  LT R3, R7, #0 ; len
  SUBI R3, R3, #1
  ST R3, R7, #0
  MULI R0, R5, #20
  ADD R0, R0, R3
  LI R7, #7326
  ADD R7, R8, R7
  ADD R7, R7, R0
  LT R0, R7, #0 ; card
  LI R3, #-1
  ST R3, R7, #0
  ST R0, R6, #0 ; fc_free[0] = card
  MULI R3, R2, #4
  LI R7, #8000
  ADD R7, R8, R7
  ADD R7, R7, R3
  LI R3, #5
  ST R3, R7, #0 ; type 5 = C2X
  ST R5, R7, #1 ; src = col
  ST R4, R7, #2 ; dst = 0
  ST R0, R7, #3 ; card
  ADDI R2, R2, #1
  SW R2, R1, #2 ; undo_sp++
  JMPX sol_ev_lp
sfs_x2c:
  ; Odd step: move free[0] to (col + 1) % 8 (type 4 = X2C)
  ADDI R5, R5, #1
  LI R3, #8
  MOD R5, R5, R3 ; dst_col = (col + 1) % 8
  LT R0, R6, #0 ; card in free[0]
  LI R3, #-1
  ST R3, R6, #0 ; fc_free[0] = -1
  LI R7, #7318
  ADD R7, R8, R7
  ADD R7, R7, R5
  LT R3, R7, #0 ; len
  ADDI R6, R3, #1
  ST R6, R7, #0
  MULI R6, R5, #20
  ADD R6, R6, R3
  LI R7, #7326
  ADD R7, R8, R7
  ADD R7, R7, R6
  ST R0, R7, #0
  MULI R3, R2, #4
  LI R7, #8000
  ADD R7, R8, R7
  ADD R7, R7, R3
  LI R3, #4
  ST R3, R7, #0 ; type 4 = X2C
  ST R4, R7, #1 ; src = 0
  ST R5, R7, #2 ; dst = dst_col
  ST R0, R7, #3 ; card
  ADDI R2, R2, #1
  SW R2, R1, #2 ; undo_sp++
  JMPX sol_ev_lp

; 'X' key in FreeCell mode: set dead-end unwinnable test board
sol_cmd_fc_deadend:
  LI R1, #7290
  ADD R1, R8, R1
  LI R0, #2
  ST R0, R1, #0
  LI R6, #7310
  ADD R6, R8, R6
  LI R0, #0
  ST R0, R6, #0
  ST R0, R6, #1
  ST R0, R6, #2
  ST R0, R6, #3
  LI R0, #48
  ST R0, R6, #4
  LI R0, #49
  ST R0, R6, #5
  LI R0, #50
  ST R0, R6, #6
  LI R0, #51
  ST R0, R6, #7
  LI R2, #0
sfd_lp:
  CMPI R2, #8
  JNNX sfd_done
  ADDI R3, R6, #8
  ADD R3, R3, R2
  LI R0, #1
  ST R0, R3, #0
  MULI R3, R2, #20
  ADDI R3, R3, #16
  ADD R3, R6, R3
  LI R0, #44
  ST R0, R3, #0
  ADDI R2, R2, #1
  JMPX sfd_lp
sfd_done:
  JMPX sol_ev_lp

; 'V' key in FreeCell mode: run in-guest FreeCell DFS Solver and save "FCSOL"
sol_cmd_solve:
  LI R1, #7290
  ADD R1, R8, R1
  LT R0, R1, #0
  CMPI R0, #2
  JNZX sol_ev_lp
  ADDI R6, R8, #7210
  LT R0, R6, #0
  CMPI R0, #0
  JNPX scs_def_b
  SW R0, R1, #9 ; fc_budget = next_seed
  LI R0, #-1
  ST R0, R6, #0
scs_def_b:
  CALLX sol_freecell_solve
  CALLX sol_save_fcsol
  ADDI R6, R8, #7213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_save_fcsol:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  LI R1, #7500
  ADD R1, R8, R1
  ADDI R2, R8, #7000
  LT R0, R2, #0 ; seed
  ST R0, R1, #0
  LI R2, #7290
  ADD R2, R8, R2
  LT R0, R2, #0 ; game_mode
  ST R0, R1, #1
  LT R0, R2, #5 ; fc_verdict
  ST R0, R1, #2
  LW R0, R2, #6 ; fc_nodes
  ST R0, R1, #3
  LW R0, R2, #9 ; fc_budget
  ST R0, R1, #4
  LW R0, R2, #2 ; undo_sp
  ST R0, R1, #5
  ADDI R0, R1, #6
  LI R2, #7310
  ADD R2, R8, R2
  LI R3, #176
  BCOPY R0, R2, R3
  LI R0, #str_fcsol_fn - app6_sol_rom
  ADD R0, R0, R8
  LI R2, #182
  LI R3, #1
  SYSCALL #32
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; sol_minstd_step: advances 31-bit Park-Miller MINSTD at +5302 using Schrage's method
sol_minstd_step:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  LI R1, #7302
  ADD R1, R8, R1
  LW R0, R1, #0
  LI R2, #7122
  LMI R2, #2 ; 44488 (Q)
  DIV R3, R0, R2
  MOD R4, R0, R2
  LI R2, #8905
  LMI R2, #2 ; 48271 (A)
  MUL R4, R4, R2
  LI R2, #3399
  MUL R3, R3, R2
  SUB R0, R4, R3
  CMPI R0, #0
  JPX sms_ok
  ADDI R0, R0, #523
  ADDM R0, R0, #-8996
  ADDH R0, R0, #6 ; + 2147483647
sms_ok:
  SW R0, R1, #0
  POP R4
  POP R3
  POP R2
  POP R1
  RET

; sol_ms_rand_step: advances Microsoft 31-bit LCG at +5305 -> returns R0 = state >>> 16 (0..32767)
sol_ms_rand_step:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  LI R1, #7305
  ADD R1, R8, R1
  LW R0, R1, #0
  LI R2, #6487
  LMI R2, #3 ; 65536
  MOD R3, R0, R2 ; lo = seed % 65536
  DIV R4, R0, R2 ; hi = seed / 65536
  LI R0, #-2500
  LMI R0, #11 ; 214013
  MUL R3, R3, R0
  ADDI R3, R3, #-8096
  ADDM R3, R3, #129 ; + 2531011
  DIV R0, R3, R2 ; carry = lo_prod / 65536
  MOD R3, R3, R2 ; new_lo = lo_prod % 65536
  PUSH R0
  LI R0, #-2278
  LMI R0, #1 ; 17405
  MUL R4, R4, R0
  POP R0
  ADD R4, R4, R0
  LI R0, #-6598
  LMI R0, #2 ; 32768
  MOD R4, R4, R0 ; R4 = new_hi (0..32767)
  MUL R0, R4, R2
  ADD R0, R0, R3
  SW R0, R1, #0
  MOV R0, R4
  POP R4
  POP R3
  POP R2
  POP R1
  RET

; sol_deal_freecell: deals msFreeCell(seed) into fc_cols[0..7] at +5310..+5485
sol_deal_freecell:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  LI R0, #7287
  ADD R0, R8, R0
  LW R0, R0, #0
  LI R1, #7305
  ADD R1, R8, R1
  SW R0, R1, #0
  LI R1, #7310
  ADD R1, R8, R1
  LI R0, #0
  ST R0, R1, #0
  ST R0, R1, #1
  ST R0, R1, #2
  ST R0, R1, #3
  LI R0, #-1
  ST R0, R1, #4
  ST R0, R1, #5
  ST R0, R1, #6
  ST R0, R1, #7
  ADDI R0, R1, #8
  LI R2, #0
  LI R3, #8
  BFILL R0, R2, R3
  ADDI R0, R1, #16
  LI R2, #-1
  LI R3, #160
  BFILL R0, R2, R3
  ADDI R1, R8, #7220
  LI R0, #0
sdf_dk_lp:
  CMPI R0, #52
  JNNX sdf_deal_lp_init
  ADD R2, R1, R0
  ST R0, R2, #0
  ADDI R0, R0, #1
  JMPX sdf_dk_lp
sdf_deal_lp_init:
  LI R2, #52
  LI R3, #0
sdf_deal_lp:
  CMPI R2, #0
  JNPX sdf_done
  CALLX sol_ms_rand_step
  MOD R4, R0, R2
  ADD R5, R1, R4
  LT R6, R5, #0
  SUBI R2, R2, #1
  ADD R7, R1, R2
  LT R0, R7, #0
  ST R0, R5, #0
  LI R0, #8
  MOD R4, R3, R0
  LI R5, #7318
  ADD R5, R8, R5
  ADD R5, R5, R4
  LT R7, R5, #0
  ADDI R0, R7, #1
  ST R0, R5, #0
  MULI R0, R4, #20
  ADD R0, R0, R7
  LI R5, #7326
  ADD R5, R8, R5
  ADD R5, R5, R0
  ST R6, R5, #0
  ADDI R3, R3, #1
  JMPX sdf_deal_lp
sdf_done:
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

sol_deal_cnsw_klondike:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  ADDI R1, R8, #7220
  LI R0, #0
sdck_init:
  CMPI R0, #52
  JNNX sdck_shuf
  ADD R2, R1, R0
  ST R0, R2, #0
  ADDI R0, R0, #1
  JMPX sdck_init
sdck_shuf:
  ADDI R0, R8, #7000
  LT R0, R0, #0
  CMPI R0, #0
  JPX sdck_s_ok
  LI R0, #1
sdck_s_ok:
  LI R2, #7302
  ADD R2, R8, R2
  SW R0, R2, #0
  LI R3, #51
sdck_lp:
  CMPI R3, #1
  JNX sdck_populate
  CALLX sol_minstd_step
  ADDI R4, R3, #1
  MOD R5, R0, R4
  ADD R4, R1, R3
  ADD R5, R1, R5
  LT R6, R4, #0
  LT R7, R5, #0
  ST R7, R4, #0
  ST R6, R5, #0
  SUBI R3, R3, #1
  JMPX sdck_lp
sdck_populate:
  JMPX sd_clear_state

sol_deal_spider:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  LI R1, #7316
  ADD R1, R8, R1
  LI R2, #0
  LI R3, #10
  BFILL R1, R2, R3
  LI R1, #7326
  ADD R1, R8, R1
  LI R2, #-1
  LI R3, #160
  BFILL R1, R2, R3
  LI R1, #7700
  ADD R1, R8, R1
  LI R0, #0
sdsp_init:
  CMPI R0, #104
  JNNX sdsp_shuf
  LI R2, #52
  MOD R3, R0, R2
  ADD R2, R1, R0
  ST R3, R2, #0
  ADDI R0, R0, #1
  JMPX sdsp_init
sdsp_shuf:
  ADDI R0, R8, #7000
  LT R0, R0, #0
  CMPI R0, #0
  JPX sdsp_s_ok
  LI R0, #1
sdsp_s_ok:
  LI R2, #7302
  ADD R2, R8, R2
  SW R0, R2, #0
  LI R3, #103
sdsp_lp:
  CMPI R3, #1
  JNX sdsp_cols
  CALLX sol_minstd_step
  ADDI R4, R3, #1
  MOD R5, R0, R4
  ADD R4, R1, R3
  ADD R5, R1, R5
  LT R6, R4, #0
  LT R7, R5, #0
  ST R7, R4, #0
  ST R6, R5, #0
  SUBI R3, R3, #1
  JMPX sdsp_lp
sdsp_cols:
  LI R2, #0
sdsp_c_lp:
  CMPI R2, #54
  JNNX sdsp_done
  LI R0, #10
  MOD R3, R2, R0
  DIV R4, R2, R0
  ADD R5, R1, R2
  LT R6, R5, #0
  MULI R5, R3, #15
  ADD R5, R5, R4
  LI R7, #7326
  ADD R7, R8, R7
  ADD R7, R7, R5
  ST R6, R7, #0
  ADDI R2, R2, #1
  JMPX sdsp_c_lp
sdsp_done:
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

sol_write_dealchk:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  ADDI R6, R8, #7000
  LT R7, R6, #0
  LI R0, #1
  ST R0, R6, #0
  CALLX sol_deal_freecell
  ST R7, R6, #0
  LI R0, #7700
  ADD R0, R8, R0
  LI R1, #str_dchk_p1 - app6_sol_rom
  ADD R1, R1, R8
  LI R2, #17
  BCOPY R0, R1, R2
  LI R3, #0
swdc_c1_lp:
  CMPI R3, #8
  JNNX swdc_c1_done
  MULI R4, R3, #20
  LI R5, #7326
  ADD R5, R8, R5
  ADD R5, R5, R4
  LT R4, R5, #0
  LI R5, #4
  DIV R1, R4, R5
  MOD R2, R4, R5
  LI R5, #str_sol_ranks - app6_sol_rom
  ADD R5, R5, R8
  ADD R5, R5, R1
  LT R5, R5, #0
  ST R5, R0, #0
  LI R5, #str_fc_suits - app6_sol_rom
  ADD R5, R5, R8
  ADD R5, R5, R2
  LT R5, R5, #0
  ST R5, R0, #1
  LI R5, #32
  ST R5, R0, #2
  ADDI R0, R0, #3
  ADDI R3, R3, #1
  JMPX swdc_c1_lp
swdc_c1_done:
  LI R1, #str_dchk_p2 - app6_sol_rom
  ADD R1, R1, R8
  LI R2, #180
  BCOPY R0, R1, R2
  LI R0, #str_dealchk_fn - app6_sol_rom
  ADD R0, R0, R8
  LI R1, #7700
  ADD R1, R8, R1
  LI R2, #220
  LI R3, #1
  SYSCALL #32
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; ============================================================================
; IN-GUEST FREECELL DFS SOLVER (sol_freecell_solve)
; ============================================================================
sol_freecell_solve:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7

  LI R0, #10000 - 19683
  LMI R0, #1
  ADD R0, R8, R0
  LI R1, #0
  LI R2, #1536
  BFILL R0, R1, R2

  LI R1, #7290
  ADD R1, R8, R1
  LI R0, #0
  SW R0, R1, #6  ; fc_nodes = 0
  ST R0, R1, #18 ; budgetHit = 0 (+5308)
  ST R0, R1, #19 ; depth = 0 (+5309)

  CALLX fcs_hash_and_insert
  LI R0, #0
  CALLX fcs_init_frame

fcs_dfs_lp:
  LI R1, #7310
  ADD R1, R8, R1
  LT R0, R1, #0
  CMPI R0, #13
  JNZX fcs_not_won
  LT R0, R1, #1
  CMPI R0, #13
  JNZX fcs_not_won
  LT R0, R1, #2
  CMPI R0, #13
  JNZX fcs_not_won
  LT R0, R1, #3
  CMPI R0, #13
  JNZX fcs_not_won
  CALLX fcs_unwind_all
  LI R1, #7295
  ADD R1, R8, R1
  LI R0, #1 ; WINNABLE
  ST R0, R1, #0
  JMPX fcs_done

fcs_not_won:
  LI R1, #7309
  ADD R1, R8, R1
  LT R2, R1, #0 ; depth
  CMPI R2, #0
  JNX fcs_exhausted

  MULI R3, R2, #224
  LI R0, #12000 - 19683
  LMI R0, #1
  ADD R3, R3, R0
  ADD R3, R8, R3

  CMPI R2, #104
  JNNX fcs_hit_depth

  LT R4, R3, #0 ; move_count
  LT R5, R3, #1 ; move_idx
  CMP R5, R4
  JNNX fcs_pop_frame

  LI R6, #7296
  ADD R6, R8, R6
  LW R0, R6, #0 ; fc_nodes
  LW R7, R6, #3 ; fc_budget
  CMP R0, R7
  JNNX fcs_hit_budget

  ADDI R0, R5, #1
  ST R0, R3, #1 ; move_idx++
  MULI R5, R5, #4
  ADDI R5, R5, #6
  ADD R5, R3, R5 ; R5 = &frame.moves[idx]

  CALLX fcs_apply_move
  CALLX fcs_hash_and_insert
  CMPI R0, #0
  JZX fcs_new_state
  CALLX fcs_undo_move
  JMPX fcs_dfs_lp

fcs_new_state:
  LI R6, #7296
  ADD R6, R8, R6
  LW R0, R6, #0
  ADDI R0, R0, #1
  SW R0, R6, #0

  LI R1, #7309
  ADD R1, R8, R1
  LT R2, R1, #0
  ADDI R2, R2, #1
  ST R2, R1, #0 ; depth++
  MOV R0, R2
  CALLX fcs_init_frame
  MULI R3, R2, #224
  LI R0, #12000 - 19683
  LMI R0, #1
  ADD R3, R3, R0
  ADD R3, R8, R3
  LT R0, R5, #0
  ST R0, R3, #2
  LT R0, R5, #1
  ST R0, R3, #3
  LT R0, R5, #2
  ST R0, R3, #4
  LT R0, R5, #3
  ST R0, R3, #5
  JMPX fcs_dfs_lp

fcs_hit_depth:
  LI R1, #7308
  ADD R1, R8, R1
  LI R0, #1
  ST R0, R1, #0

fcs_pop_frame:
  CMPI R2, #0
  JNPX fcs_pop_root
  ADDI R5, R3, #2
  CALLX fcs_undo_move
fcs_pop_root:
  SUBI R2, R2, #1
  LI R1, #7309
  ADD R1, R8, R1
  ST R2, R1, #0
  JMPX fcs_dfs_lp

fcs_hit_budget:
  LI R1, #7308
  ADD R1, R8, R1
  LI R0, #1
  ST R0, R1, #0
  CALLX fcs_unwind_all
  LI R1, #7295
  ADD R1, R8, R1
  LI R0, #0 ; UNKNOWN
  ST R0, R1, #0
  JMPX fcs_done

fcs_exhausted:
  LI R1, #7308
  ADD R1, R8, R1
  LT R0, R1, #0
  LI R2, #-1 ; UNWINNABLE
  CMPI R0, #0
  JZX fcs_set_v
  LI R2, #0  ; UNKNOWN
fcs_set_v:
  LI R1, #7295
  ADD R1, R8, R1
  ST R2, R1, #0

fcs_done:
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

fcs_unwind_all:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R5
fua_lp:
  LI R1, #7309
  ADD R1, R8, R1
  LT R2, R1, #0
  CMPI R2, #0
  JNPX fua_done
  MULI R3, R2, #224
  LI R5, #12000 - 19683
  LMI R5, #1
  ADD R3, R3, R5
  ADD R3, R8, R3
  ADDI R5, R3, #2
  CALLX fcs_undo_move
  SUBI R2, R2, #1
  ST R2, R1, #0
  JMPX fua_lp
fua_done:
  POP R5
  POP R3
  POP R2
  POP R1
  RET

fcs_apply_move:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R6
  PUSH R7
  LT R0, R5, #0
  LT R1, R5, #1
  LT R2, R5, #2
  LT R3, R5, #3
  CMPI R0, #1
  JZX fam_c2f
  CMPI R0, #2
  JZX fam_x2f
  CMPI R0, #3
  JZX fam_c2c
  CMPI R0, #4
  JZX fam_x2c
  LI R6, #7318
  ADD R6, R8, R6
  ADD R6, R6, R1
  LT R4, R6, #0
  SUBI R4, R4, #1
  ST R4, R6, #0
  MULI R6, R1, #20
  ADD R6, R6, R4
  LI R7, #7326
  ADD R7, R8, R7
  ADD R7, R7, R6
  LT R4, R7, #0
  LI R6, #-1
  ST R6, R7, #0
  LI R6, #7314
  ADD R6, R8, R6
  ADD R6, R6, R2
  ST R4, R6, #0
  JMPX fam_done
fam_c2f:
  LI R6, #7318
  ADD R6, R8, R6
  ADD R6, R6, R1
  LT R4, R6, #0
  SUBI R4, R4, #1
  ST R4, R6, #0
  MULI R6, R1, #20
  ADD R6, R6, R4
  LI R7, #7326
  ADD R7, R8, R7
  ADD R7, R7, R6
  LI R6, #-1
  ST R6, R7, #0
  LI R6, #7310
  ADD R6, R8, R6
  ADD R6, R6, R2
  LT R4, R6, #0
  ADDI R4, R4, #1
  ST R4, R6, #0
  JMPX fam_done
fam_x2f:
  LI R6, #7314
  ADD R6, R8, R6
  ADD R6, R6, R1
  LT R4, R6, #0
  ST R4, R5, #3
  LI R4, #-1
  ST R4, R6, #0
  LI R6, #7310
  ADD R6, R8, R6
  ADD R6, R6, R2
  LT R4, R6, #0
  ADDI R4, R4, #1
  ST R4, R6, #0
  JMPX fam_done
fam_x2c:
  LI R6, #7314
  ADD R6, R8, R6
  ADD R6, R6, R1
  LT R4, R6, #0
  LI R7, #-1
  ST R7, R6, #0
  LI R6, #7318
  ADD R6, R8, R6
  ADD R6, R6, R2
  LT R7, R6, #0
  ADDI R0, R7, #1
  ST R0, R6, #0
  MULI R6, R2, #20
  ADD R6, R6, R7
  LI R7, #7326
  ADD R7, R8, R7
  ADD R7, R7, R6
  ST R4, R7, #0
  JMPX fam_done
fam_c2c:
  LI R6, #7318
  ADD R6, R8, R6
  ADD R7, R6, R1
  LT R4, R7, #0
  SUB R4, R4, R3
  ST R4, R7, #0
  ADD R7, R6, R2
  LT R0, R7, #0
  ADD R6, R0, R3
  ST R6, R7, #0
  MULI R1, R1, #20
  ADD R1, R1, R4
  LI R7, #7326
  ADD R7, R8, R7
  ADD R1, R7, R1
  MULI R2, R2, #20
  ADD R2, R2, R0
  ADD R2, R7, R2
fam_c2c_lp:
  CMPI R3, #0
  JNPX fam_done
  LT R0, R1, #0
  ST R0, R2, #0
  LI R0, #-1
  ST R0, R1, #0
  ADDI R1, R1, #1
  ADDI R2, R2, #1
  SUBI R3, R3, #1
  JMPX fam_c2c_lp
fam_done:
  POP R7
  POP R6
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

fcs_undo_move:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R6
  PUSH R7
  LT R0, R5, #0
  LT R1, R5, #1
  LT R2, R5, #2
  LT R3, R5, #3
  CMPI R0, #1
  JZX fum_c2f
  CMPI R0, #2
  JZX fum_x2f
  CMPI R0, #3
  JZX fum_c2c
  CMPI R0, #4
  JZX fum_x2c
  LI R6, #7314
  ADD R6, R8, R6
  ADD R6, R6, R2
  LT R4, R6, #0
  LI R7, #-1
  ST R7, R6, #0
  LI R6, #7318
  ADD R6, R8, R6
  ADD R6, R6, R1
  LT R7, R6, #0
  ADDI R0, R7, #1
  ST R0, R6, #0
  MULI R6, R1, #20
  ADD R6, R6, R7
  LI R7, #7326
  ADD R7, R8, R7
  ADD R7, R7, R6
  ST R4, R7, #0
  JMPX fum_done
fum_c2f:
  LI R6, #7310
  ADD R6, R8, R6
  ADD R6, R6, R2
  LT R4, R6, #0
  SUBI R4, R4, #1
  ST R4, R6, #0
  MULI R4, R4, #4
  ADD R4, R4, R2
  LI R6, #7318
  ADD R6, R8, R6
  ADD R6, R6, R1
  LT R7, R6, #0
  ADDI R0, R7, #1
  ST R0, R6, #0
  MULI R6, R1, #20
  ADD R6, R6, R7
  LI R7, #7326
  ADD R7, R8, R7
  ADD R7, R7, R6
  ST R4, R7, #0
  JMPX fum_done
fum_x2f:
  LI R6, #7310
  ADD R6, R8, R6
  ADD R6, R6, R2
  LT R4, R6, #0
  SUBI R4, R4, #1
  ST R4, R6, #0
  LI R6, #7314
  ADD R6, R8, R6
  ADD R6, R6, R1
  ST R3, R6, #0
  JMPX fum_done
fum_x2c:
  LI R6, #7318
  ADD R6, R8, R6
  ADD R6, R6, R2
  LT R7, R6, #0
  SUBI R7, R7, #1
  ST R7, R6, #0
  MULI R6, R2, #20
  ADD R6, R6, R7
  LI R7, #7326
  ADD R7, R8, R7
  ADD R7, R7, R6
  LT R4, R7, #0
  LI R6, #-1
  ST R6, R7, #0
  LI R6, #7314
  ADD R6, R8, R6
  ADD R6, R6, R1
  ST R4, R6, #0
  JMPX fum_done
fum_c2c:
  LI R6, #7318
  ADD R6, R8, R6
  ADD R7, R6, R2
  LT R4, R7, #0
  SUB R4, R4, R3
  ST R4, R7, #0
  ADD R7, R6, R1
  LT R0, R7, #0
  ADD R6, R0, R3
  ST R6, R7, #0
  MULI R2, R2, #20
  ADD R2, R2, R4
  LI R7, #7326
  ADD R7, R8, R7
  ADD R2, R7, R2
  MULI R1, R1, #20
  ADD R1, R1, R0
  ADD R1, R7, R1
fum_c2c_lp:
  CMPI R3, #0
  JNPX fum_done
  LT R0, R2, #0
  ST R0, R1, #0
  LI R0, #-1
  ST R0, R2, #0
  ADDI R1, R1, #1
  ADDI R2, R2, #1
  SUBI R3, R3, #1
  JMPX fum_c2c_lp
fum_done:
  POP R7
  POP R6
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

fcs_hash_and_insert:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  LI R7, #-3830
  LMI R7, #51 ; 1000003
  LI R0, #17
  LI R1, #7310
  ADD R1, R8, R1
  LI R2, #0
fhi_f_lp:
  CMPI R2, #4
  JNNX fhi_free
  MULI R0, R0, #31
  ADD R3, R1, R2
  LT R3, R3, #0
  ADD R0, R0, R3
  ADDI R0, R0, #1
  MOD R0, R0, R7
  ADDI R2, R2, #1
  JMPX fhi_f_lp
fhi_free:
  LT R2, R1, #4
  LT R3, R1, #5
  LT R4, R1, #6
  LT R5, R1, #7
  CMP R2, R3
  JNPX fhi_s1
  MOV R6, R2
  MOV R2, R3
  MOV R3, R6
fhi_s1:
  CMP R4, R5
  JNPX fhi_s2
  MOV R6, R4
  MOV R4, R5
  MOV R5, R6
fhi_s2:
  CMP R2, R4
  JNPX fhi_s3
  MOV R6, R2
  MOV R2, R4
  MOV R4, R6
fhi_s3:
  CMP R3, R5
  JNPX fhi_s4
  MOV R6, R3
  MOV R3, R5
  MOV R5, R6
fhi_s4:
  CMP R3, R4
  JNPX fhi_s5
  MOV R6, R3
  MOV R3, R4
  MOV R4, R6
fhi_s5:
  MULI R0, R0, #37
  ADD R0, R0, R2
  ADDI R0, R0, #2
  MOD R0, R0, R7
  MULI R0, R0, #37
  ADD R0, R0, R3
  ADDI R0, R0, #2
  MOD R0, R0, R7
  MULI R0, R0, #37
  ADD R0, R0, R4
  ADDI R0, R0, #2
  MOD R0, R0, R7
  MULI R0, R0, #37
  ADD R0, R0, R5
  ADDI R0, R0, #2
  MOD R0, R0, R7
  LI R2, #0
fhi_c_lp:
  CMPI R2, #8
  JNNX fhi_tt_probe
  ADDI R3, R1, #8
  ADD R3, R3, R2
  LT R3, R3, #0
  MULI R0, R0, #41
  ADD R0, R0, R3
  ADDI R0, R0, #1
  MOD R0, R0, R7
  MULI R4, R2, #20
  ADDI R4, R4, #16
  ADD R4, R1, R4
  LI R5, #0
fhi_ci_lp:
  CMP R5, R3
  JNNX fhi_c_nx
  ADD R6, R4, R5
  LT R6, R6, #0
  MULI R0, R0, #43
  ADD R0, R0, R6
  ADDI R0, R0, #2
  MOD R0, R0, R7
  ADDI R5, R5, #1
  JMPX fhi_ci_lp
fhi_c_nx:
  ADDI R2, R2, #1
  JMPX fhi_c_lp

fhi_tt_probe:
  CMPI R0, #0
  JNNX fhi_h_pos
  ADD R0, R0, R7
fhi_h_pos:
  ADDI R0, R0, #1 ; ensure h >= 1 so 0 means empty TT slot!
  LI R1, #512
  MOD R2, R0, R1
  LI R3, #10000 - 19683
  LMI R3, #1
  ADD R3, R8, R3
  LI R4, #0
fhi_p_lp:
  CMPI R4, #512
  JNNX fhi_not_found
  MULI R5, R2, #3
  ADD R5, R3, R5
  LW R6, R5, #0
  CMP R6, R0
  JZX fhi_found
  CMPI R6, #0
  JZX fhi_insert
  ADDI R2, R2, #1
  CMPI R2, #512
  JNX fhi_p_nx
  LI R2, #0
fhi_p_nx:
  ADDI R4, R4, #1
  JMPX fhi_p_lp
fhi_insert:
  SW R0, R5, #0
fhi_not_found:
  LI R0, #0
  JMPX fhi_ret
fhi_found:
  LI R0, #1
fhi_ret:
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

fcs_col_uncover_bonus:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  LI R0, #0
  LI R3, #7318
  ADD R3, R8, R3
  ADD R3, R3, R1
  LT R3, R3, #0
  SUB R3, R3, R2
  CMPI R3, #0
  JNPX fcub_done
  MULI R4, R1, #20
  LI R5, #7326
  ADD R5, R8, R5
  ADD R4, R5, R4
  LI R5, #0
fcub_lp:
  CMP R5, R3
  JNNX fcub_done
  ADD R6, R4, R5
  LT R6, R6, #0
  LI R7, #4
  DIV R1, R6, R7
  MOD R6, R6, R7
  LI R7, #7310
  ADD R7, R8, R7
  ADD R7, R7, R6
  LT R7, R7, #0
  SUB R1, R1, R7
  SUB R6, R3, R5
  CMPI R1, #0
  JNZX fcub_chk_d1
  CMPI R6, #1
  JZX fcub_b1
  CMPI R6, #2
  JZX fcub_b2
  CMPI R6, #3
  JZX fcub_b3
  CMPI R6, #7
  JNPX fcub_b_other
  LI R6, #7
fcub_b_other:
  LI R7, #8
  SUB R7, R7, R6
  MULI R7, R7, #60
  ADD R0, R0, R7
  JMPX fcub_nx
fcub_b1:
  ADDI R0, R0, #1200
  JMPX fcub_nx
fcub_b2:
  ADDI R0, R0, #750
  JMPX fcub_nx
fcub_b3:
  ADDI R0, R0, #400
  JMPX fcub_nx
fcub_chk_d1:
  CMPI R1, #1
  JNZX fcub_nx
  CMPI R6, #1
  JNZX fcub_nx
  ADDI R0, R0, #250
fcub_nx:
  ADDI R5, R5, #1
  JMPX fcub_lp
fcub_done:
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

fcs_emit_move:
  PUSH R5
  PUSH R6
  LI R5, #7698
  ADD R5, R8, R5
  LT R6, R5, #0
  CMPI R6, #54
  JNNX fem_full
  ADDI R6, R6, #1
  ST R6, R5, #0
  SUBI R6, R6, #1
  MULI R6, R6, #5
  ADDI R5, R5, #2
  ADD R5, R5, R6
  ST R1, R5, #0
  ST R2, R5, #1
  ST R3, R5, #2
  ST R4, R5, #3
  ST R0, R5, #4
  JMPX fem_done
fem_full:
  LI R5, #7308
  ADD R5, R8, R5
  LI R6, #1
  ST R6, R5, #0
fem_done:
  POP R6
  POP R5
  RET

; fcs_is_red: R0 = card -> R0 = 1 if suit in {1,2}, else 0
fcs_is_red:
  PUSH R1
  LI R1, #4
  MOD R0, R0, R1
  CMPI R0, #1
  JZX fir_yes
  CMPI R0, #2
  JZX fir_yes
  LI R0, #0
  POP R1
  RET
fir_yes:
  LI R0, #1
  POP R1
  RET

; fcs_are_opp_color: R0 = cardA, R1 = cardB -> R0 = 1 if opposite color, else 0
fcs_are_opp_color:
  PUSH R1
  PUSH R2
  CALLX fcs_is_red
  MOV R2, R0
  MOV R0, R1
  CALLX fcs_is_red
  CMP R0, R2
  JZX faoc_no
  LI R0, #1
  POP R2
  POP R1
  RET
faoc_no:
  LI R0, #0
  POP R2
  POP R1
  RET

; fcs_min_opp_found: R0 = card -> returns R0 = min(found[0],found[3]) if red, else min(found[1],found[2])
fcs_min_opp_found:
  PUSH R1
  PUSH R2
  CALLX fcs_is_red
  LI R1, #7310
  ADD R1, R8, R1
  CMPI R0, #1
  JZX fmof_red
  LT R0, R1, #1
  LT R2, R1, #2
  CMP R0, R2
  JNPX fmof_done
  MOV R0, R2
  JMPX fmof_done
fmof_red:
  LT R0, R1, #0
  LT R2, R1, #3
  CMP R0, R2
  JNPX fmof_done
  MOV R0, R2
fmof_done:
  POP R2
  POP R1
  RET

; fcs_init_frame: R0 = depth -> generates all legal moves, sorts by descending score, writes to frame R0
fcs_init_frame:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7

  ; Save target depth at +5697, zero move count at +5698
  LI R1, #7697
  ADD R1, R8, R1
  ST R0, R1, #0
  LI R0, #0
  ST R0, R1, #1 ; count = 0

  ; 1. C2F (type = 1)
  LI R2, #0 ; c = 0..7
fif_c2f_lp:
  CMPI R2, #8
  JNNX fif_x2f
  LI R1, #7318
  ADD R1, R8, R1
  ADD R1, R1, R2
  LT R3, R1, #0 ; len
  CMPI R3, #0
  JNPX fif_c2f_nx
  SUBI R3, R3, #1
  MULI R4, R2, #20
  ADD R4, R4, R3
  LI R1, #7326
  ADD R1, R8, R1
  ADD R1, R1, R4
  LT R5, R1, #0 ; card
  LI R1, #4
  DIV R6, R5, R1 ; rank
  MOD R3, R5, R1 ; suit (dst)
  LI R1, #7310
  ADD R1, R8, R1
  ADD R1, R1, R3
  LT R1, R1, #0 ; found[suit]
  CMP R1, R6
  JNZX fif_c2f_nx
  MOV R0, R5
  CALLX fcs_min_opp_found
  ADDI R0, R0, #1
  LI R7, #1800
  CMP R6, R0
  JPX fif_c2f_emit
  LI R7, #4000
fif_c2f_emit:
  MOV R0, R7
  LI R1, #1
  LI R4, #1
  CALLX fcs_emit_move
fif_c2f_nx:
  ADDI R2, R2, #1
  JMPX fif_c2f_lp

fif_x2f:
  ; 2. X2F (type = 2)
  LI R2, #0 ; f = 0..3
fif_x2f_lp:
  CMPI R2, #4
  JNNX fif_cnt_empty
  LI R1, #7314
  ADD R1, R8, R1
  ADD R1, R1, R2
  LT R5, R1, #0 ; card
  CMPI R5, #0
  JNX fif_x2f_nx
  LI R1, #4
  DIV R6, R5, R1 ; rank
  MOD R3, R5, R1 ; suit (dst)
  LI R1, #7310
  ADD R1, R8, R1
  ADD R1, R1, R3
  LT R1, R1, #0
  CMP R1, R6
  JNZX fif_x2f_nx
  MOV R0, R5
  CALLX fcs_min_opp_found
  ADDI R0, R0, #1
  LI R7, #1850
  CMP R6, R0
  JPX fif_x2f_emit
  LI R7, #4100
fif_x2f_emit:
  MOV R0, R7
  LI R1, #2
  LI R4, #1
  CALLX fcs_emit_move
fif_x2f_nx:
  ADDI R2, R2, #1
  JMPX fif_x2f_lp

fif_cnt_empty:
  ; Count emptyFree (+5690) and emptyCols (+5691)
  LI R0, #0
  LI R2, #0
fif_ef_lp:
  CMPI R2, #4
  JNNX fif_ec_init
  LI R1, #7314
  ADD R1, R8, R1
  ADD R1, R1, R2
  LT R1, R1, #0
  CMPI R1, #0
  JNNX fif_ef_nx
  ADDI R0, R0, #1
fif_ef_nx:
  ADDI R2, R2, #1
  JMPX fif_ef_lp
fif_ec_init:
  LI R1, #7690
  ADD R1, R8, R1
  ST R0, R1, #0 ; emptyFree
  LI R0, #0
  LI R2, #0
fif_ec_lp:
  CMPI R2, #8
  JNNX fif_ec_done
  LI R1, #7318
  ADD R1, R8, R1
  ADD R1, R1, R2
  LT R1, R1, #0
  CMPI R1, #0
  JPX fif_ec_nx
  ADDI R0, R0, #1
fif_ec_nx:
  ADDI R2, R2, #1
  JMPX fif_ec_lp
fif_ec_done:
  LI R1, #7691
  ADD R1, R8, R1
  ST R0, R1, #0 ; emptyCols

  ; 3. C2C (type = 3)
  LI R2, #0 ; c = 0..7
fif_c2c_c_lp:
  CMPI R2, #8
  JNNX fif_x2c
  LI R1, #7318
  ADD R1, R8, R1
  ADD R1, R1, R2
  LT R5, R1, #0 ; col_len
  CMPI R5, #0
  JNPX fif_c2c_c_nx
  ; Compute maxSeq for col c -> store at +5692
  LI R6, #1 ; maxSeq = 1
  SUBI R7, R5, #1 ; i = col_len - 1
fif_ms_lp:
  CMPI R7, #0
  JNPX fif_ms_done
  MULI R0, R2, #20
  ADD R0, R0, R7
  LI R3, #7326
  ADD R3, R8, R3
  ADD R3, R3, R0
  LT R1, R3, #0  ; col[i]
  LT R0, R3, #-1 ; col[i - 1]
  PUSH R1
  PUSH R0
  CALLX fcs_are_opp_color
  MOV R4, R0
  POP R0
  POP R1
  CMPI R4, #0
  JZX fif_ms_done
  LI R4, #4
  DIV R0, R0, R4 ; rank(col[i-1])
  DIV R1, R1, R4 ; rank(col[i])
  ADDI R1, R1, #1
  CMP R0, R1
  JNZX fif_ms_done
  ADDI R6, R6, #1
  SUBI R7, R7, #1
  JMPX fif_ms_lp
fif_ms_done:
  LI R1, #7692
  ADD R1, R8, R1
  ST R6, R1, #0 ; maxSeq
  LI R0, #-1
  ST R0, R1, #1 ; firstEmptyDst = -1 (+5693)

  LI R3, #0 ; d = 0..7
fif_c2c_d_lp:
  CMPI R3, #8
  JNNX fif_c2c_c_nx
  CMP R3, R2
  JZX fif_c2c_d_nx
  LI R1, #7318
  ADD R1, R8, R1
  ADD R1, R1, R3
  LT R6, R1, #0 ; dcol_len
  CMPI R6, #0
  JPX fif_c2c_nonempty
  ; dcol is empty: check firstEmptyDst (+5693)
  LI R1, #7693
  ADD R1, R8, R1
  LT R0, R1, #0
  CMPI R0, #-1
  JNZX fif_c2c_d_nx
  ST R3, R1, #0 ; firstEmptyDst = d
  ; effEmptyCols = emptyCols - 1
  LI R1, #7690
  ADD R1, R8, R1
  LT R0, R1, #0 ; emptyFree
  ADDI R0, R0, #1
  LT R4, R1, #1 ; emptyCols
  SUBI R4, R4, #1
  CALLX fcs_shl_pow2 ; R0 = (1 + emptyFree) * 2^R4
  LI R1, #7692
  ADD R1, R8, R1
  LT R4, R1, #0 ; maxSeq
  CMP R0, R4
  JNPX fif_c2c_e_lim
  MOV R0, R4
fif_c2c_e_lim:
  MOV R7, R0 ; maxN
  LI R4, #1 ; n = 1..maxN
fif_c2c_en_lp:
  CMP R4, R7
  JPX fif_c2c_d_nx
  LI R0, #10
  CMP R4, R5 ; col_len == n?
  JZX fif_c2c_en_emit
  MOV R1, R2
  PUSH R2
  MOV R2, R4
  CALLX fcs_col_uncover_bonus
  POP R2
  MULI R1, R4, #15
  ADDI R1, R1, #180
  ADD R0, R0, R1
fif_c2c_en_emit:
  LI R1, #3
  CALLX fcs_emit_move
  ADDI R4, R4, #1
  JMPX fif_c2c_en_lp

fif_c2c_nonempty:
  ; Non-empty dcol (len = R6)
  LI R1, #7690
  ADD R1, R8, R1
  LT R0, R1, #0 ; emptyFree
  ADDI R0, R0, #1
  LT R4, R1, #1 ; emptyCols
  CALLX fcs_shl_pow2
  LI R1, #7692
  ADD R1, R8, R1
  LT R4, R1, #0 ; maxSeq
  CMP R0, R4
  JNPX fif_c2c_ne_lim
  MOV R0, R4
fif_c2c_ne_lim:
  MOV R7, R0 ; maxN
  ; topD = fc_cols[d][dcol_len - 1] -> store at +5695
  SUBI R0, R6, #1
  MULI R1, R3, #20
  ADD R1, R1, R0
  LI R0, #7326
  ADD R0, R8, R0
  ADD R0, R0, R1
  LT R0, R0, #0 ; topD
  LI R1, #7695
  ADD R1, R8, R1
  ST R0, R1, #0 ; topD

  LI R4, #1 ; n = 1..maxN
fif_c2c_nen_lp:
  CMP R4, R7
  JPX fif_c2c_d_nx
  ; botCard = fc_cols[c][col_len - n]
  SUB R0, R5, R4
  MULI R1, R2, #20
  ADD R1, R1, R0
  LI R0, #7326
  ADD R0, R8, R0
  ADD R0, R0, R1
  LT R0, R0, #0 ; botCard
  LI R1, #7695
  ADD R1, R8, R1
  LT R1, R1, #0 ; topD
  PUSH R0
  PUSH R1
  CALLX fcs_are_opp_color
  MOV R6, R0
  POP R1
  POP R0
  CMPI R6, #0
  JZX fif_c2c_nen_nx
  LI R6, #4
  DIV R0, R0, R6 ; rank(botCard)
  DIV R1, R1, R6 ; rank(topD)
  ADDI R0, R0, #1
  CMP R0, R1
  JNZX fif_c2c_nen_nx
  ; Valid C2C move! Compute dstPen lazily here
  PUSH R2
  MOV R1, R3
  LI R2, #0
  CALLX fcs_col_uncover_bonus
  POP R2
  LI R6, #0
  CMPI R0, #0
  JNPX fif_c2c_dp_ok
  LI R6, #350
fif_c2c_dp_ok:
  LI R1, #7692
  ADD R1, R8, R1
  ST R6, R1, #2 ; dstPen (+5694)
  LT R0, R1, #0 ; maxSeq
  LI R6, #50
  CMP R4, R0
  JNZX fif_c2c_sc1
  MULI R6, R4, #20
  ADDI R6, R6, #500
fif_c2c_sc1:
  LT R0, R1, #2 ; dstPen (+5694)
  SUB R6, R6, R0
  CMP R4, R5 ; col_len == n?
  JNZX fif_c2c_sc2
  ADDI R0, R6, #300
  JMPX fif_c2c_ne_emit
fif_c2c_sc2:
  PUSH R2
  MOV R1, R2
  MOV R2, R4
  CALLX fcs_col_uncover_bonus
  POP R2
  ADD R0, R0, R6
fif_c2c_ne_emit:
  LI R1, #3
  CALLX fcs_emit_move
fif_c2c_nen_nx:
  ADDI R4, R4, #1
  JMPX fif_c2c_nen_lp

fif_c2c_d_nx:
  ADDI R3, R3, #1
  JMPX fif_c2c_d_lp
fif_c2c_c_nx:
  ADDI R2, R2, #1
  JMPX fif_c2c_c_lp

fif_x2c:
  ; 4. X2C (type = 4)
  LI R2, #0 ; f = 0..3
fif_x2c_f_lp:
  CMPI R2, #4
  JNNX fif_c2x
  LI R1, #7314
  ADD R1, R8, R1
  ADD R1, R1, R2
  LT R5, R1, #0 ; card = free[f]
  CMPI R5, #0
  JNX fif_x2c_f_nx
  LI R1, #7693
  ADD R1, R8, R1
  LI R0, #-1
  ST R0, R1, #0 ; firstEmptyDst = -1
  LI R3, #0 ; d = 0..7
fif_x2c_d_lp:
  CMPI R3, #8
  JNNX fif_x2c_f_nx
  LI R1, #7318
  ADD R1, R8, R1
  ADD R1, R1, R3
  LT R6, R1, #0 ; dcol_len
  CMPI R6, #0
  JPX fif_x2c_ne
  LI R1, #7693
  ADD R1, R8, R1
  LT R0, R1, #0
  CMPI R0, #-1
  JNZX fif_x2c_d_nx
  ST R3, R1, #0
  LI R0, #200
  LI R1, #4
  LI R4, #1
  CALLX fcs_emit_move
  JMPX fif_x2c_d_nx
fif_x2c_ne:
  SUBI R0, R6, #1
  MULI R1, R3, #20
  ADD R1, R1, R0
  LI R0, #7326
  ADD R0, R8, R0
  ADD R0, R0, R1
  LT R1, R0, #0 ; topD
  MOV R0, R5    ; card
  PUSH R1
  CALLX fcs_are_opp_color
  MOV R6, R0
  POP R1
  CMPI R6, #0
  JZX fif_x2c_d_nx
  LI R6, #4
  DIV R0, R5, R6 ; rank(card)
  DIV R1, R1, R6 ; rank(topD)
  ADDI R0, R0, #1
  CMP R0, R1
  JNZX fif_x2c_d_nx
  PUSH R2
  MOV R1, R3
  LI R2, #0
  CALLX fcs_col_uncover_bonus
  POP R2
  LI R6, #680
  CMPI R0, #0
  JNPX fif_x2c_emit
  SUBI R6, R6, #350
fif_x2c_emit:
  MOV R0, R6
  LI R1, #4
  LI R4, #1
  CALLX fcs_emit_move
fif_x2c_d_nx:
  ADDI R3, R3, #1
  JMPX fif_x2c_d_lp
fif_x2c_f_nx:
  ADDI R2, R2, #1
  JMPX fif_x2c_f_lp

fif_c2x:
  ; 5. C2X (type = 5): find first empty free cell -> R3
  LI R3, #0
fif_ff_lp:
  CMPI R3, #4
  JNNX fif_sort
  LI R1, #7314
  ADD R1, R8, R1
  ADD R1, R1, R3
  LT R0, R1, #0
  CMPI R0, #0
  JNX fif_ff_found
  ADDI R3, R3, #1
  JMPX fif_ff_lp
fif_ff_found:
  LI R2, #0 ; c = 0..7
fif_c2x_lp:
  CMPI R2, #8
  JNNX fif_sort
  LI R1, #7318
  ADD R1, R8, R1
  ADD R1, R1, R2
  LT R5, R1, #0 ; col_len
  CMPI R5, #0
  JNPX fif_c2x_nx
  PUSH R2
  MOV R1, R2
  LI R2, #1
  CALLX fcs_col_uncover_bonus
  POP R2
  LI R6, #140
  CMPI R5, #1
  JNZX fif_c2x_sc
  LI R6, #350
fif_c2x_sc:
  ADD R0, R0, R6
  LI R1, #5
  LI R4, #1
  CALLX fcs_emit_move
fif_c2x_nx:
  ADDI R2, R2, #1
  JMPX fif_c2x_lp

fif_sort:
  ; Insertion sort moves at +5700 (count at +5698) by descending score (offset +4)
  LI R1, #7698
  ADD R1, R8, R1
  LT R2, R1, #0 ; count
  LI R3, #1 ; i = 1..count-1
fif_s_ilp:
  CMP R3, R2
  JNNX fif_copy_frame
  ; cur = moves[i] at +5700 + i*5
  MULI R4, R3, #5
  LI R5, #7700
  ADD R5, R8, R5
  ADD R4, R5, R4
  ; Copy cur[0..4] to scratch +5680..5684
  LI R6, #7680
  ADD R6, R8, R6
  LT R0, R4, #0
  ST R0, R6, #0
  LT R0, R4, #1
  ST R0, R6, #1
  LT R0, R4, #2
  ST R0, R6, #2
  LT R0, R4, #3
  ST R0, R6, #3
  LT R7, R4, #4 ; cur.score
  ST R7, R6, #4
  SUBI R4, R3, #1 ; j = i - 1
fif_s_jlp:
  CMPI R4, #0
  JNX fif_s_ins
  MULI R0, R4, #5
  ADD R0, R5, R0 ; &moves[j]
  LT R1, R0, #4  ; moves[j].score
  CMP R1, R7
  JNNX fif_s_ins
  ; moves[j+1] = moves[j]
  LT R1, R0, #0
  ST R1, R0, #5
  LT R1, R0, #1
  ST R1, R0, #6
  LT R1, R0, #2
  ST R1, R0, #7
  LT R1, R0, #3
  ST R1, R0, #8
  LT R1, R0, #4
  ST R1, R0, #9
  SUBI R4, R4, #1
  JMPX fif_s_jlp
fif_s_ins:
  ADDI R4, R4, #1
  MULI R0, R4, #5
  ADD R0, R5, R0 ; &moves[j+1]
  LT R1, R6, #0
  ST R1, R0, #0
  LT R1, R6, #1
  ST R1, R0, #1
  LT R1, R6, #2
  ST R1, R0, #2
  LT R1, R6, #3
  ST R1, R0, #3
  LT R1, R6, #4
  ST R1, R0, #4
  ADDI R3, R3, #1
  JMPX fif_s_ilp

fif_copy_frame:
  ; Copy count and 4-tryte moves [type, src, dst, n] into frame at +12000 + depth * 224
  LI R1, #7697
  ADD R1, R8, R1
  LT R0, R1, #0 ; depth
  LT R2, R1, #1 ; count
  MULI R3, R0, #224
  LI R0, #12000 - 19683
  LMI R0, #1
  ADD R3, R3, R0
  ADD R3, R8, R3 ; frame ptr
  ST R2, R3, #0  ; frame.move_count = count
  LI R0, #0
  ST R0, R3, #1  ; frame.move_idx = 0
  ADDI R3, R3, #6 ; &frame.moves[0]
  LI R5, #7700
  ADD R5, R8, R5
  LI R4, #0 ; i = 0..count-1
fif_cf_lp:
  CMP R4, R2
  JNNX fif_done
  LT R0, R5, #0
  ST R0, R3, #0
  LT R0, R5, #1
  ST R0, R3, #1
  LT R0, R5, #2
  ST R0, R3, #2
  LT R0, R5, #3
  ST R0, R3, #3
  ADDI R5, R5, #5
  ADDI R3, R3, #4
  ADDI R4, R4, #1
  JMPX fif_cf_lp
fif_done:
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; fcs_shl_pow2: multiplies R0 by 2^R4
fcs_shl_pow2:
  PUSH R4
fsp2_lp:
  CMPI R4, #0
  JNPX fsp2_done
  MULI R0, R0, #2
  SUBI R4, R4, #1
  JMPX fsp2_lp
fsp2_done:
  POP R4
  RET

; ============================================================================
; IN-GUEST FREECELL & SPIDER WINDOW RENDERERS (sol_redraw_freecell, sol_redraw_spider)
; ============================================================================
sol_redraw_freecell:
  ; Draw FreeCell toolbar at (4, 2)
  LI R0, #4
  LI R1, #2
  LI R2, #str_fc_bar - app6_sol_rom
  ADD R2, R2, R8
  LI R3, #COL_WHITE
  LI R4, #-230
  SYSCALL #21

  ; Draw 4 FreeCells at x = 6 + f*24, y = 15
  LI R6, #0
srf_fc_lp:
  CMPI R6, #4
  JNNX srf_found_init
  MULI R0, R6, #24
  ADDI R0, R0, #6
  LI R1, #15
  LI R5, #7314
  ADD R5, R8, R5
  ADD R5, R5, R6
  LT R2, R5, #0 ; card in free[f]
  CMPI R2, #0
  JNNX srf_fc_card
  PUSH R0
  LI R2, #22
  LI R3, #14
  LI R4, #-240
  SYSCALL #20
  POP R0
  JMPX srf_fc_nx
srf_fc_card:
  CALLX sol_draw_fc_card
srf_fc_nx:
  ADDI R6, R6, #1
  JMPX srf_fc_lp

srf_found_init:
  ; Draw 4 Foundations at x = 114 + f*24, y = 15
  LI R6, #0
srf_fd_lp:
  CMPI R6, #4
  JNNX srf_cols_init
  MULI R0, R6, #24
  ADDI R0, R0, #114
  LI R1, #15
  LI R5, #7310
  ADD R5, R8, R5
  ADD R5, R5, R6
  LT R2, R5, #0 ; found_len[f]
  CMPI R2, #0
  JPX srf_fd_card
  PUSH R0
  LI R2, #22
  LI R3, #14
  LI R4, #-250
  SYSCALL #20
  POP R0
  JMPX srf_fd_nx
srf_fd_card:
  SUBI R2, R2, #1
  MULI R2, R2, #4
  ADD R2, R2, R6 ; card = (found_len-1)*4 + suit
  CALLX sol_draw_fc_card
srf_fd_nx:
  ADDI R6, R6, #1
  JMPX srf_fd_lp

srf_cols_init:
  ; Draw 8 FreeCell columns c = 0..7 at x = 6 + c*26, y = 36 + r*6
  LI R6, #0
srf_c_lp:
  CMPI R6, #8
  JNNX srf_verdict
  LI R5, #7318
  ADD R5, R8, R5
  ADD R5, R5, R6
  LT R7, R5, #0 ; len
  LI R4, #0
srf_r_lp:
  CMP R4, R7
  JNNX srf_c_nx
  MULI R0, R6, #26
  ADDI R0, R0, #6
  MULI R1, R4, #6
  ADDI R1, R1, #36
  MULI R5, R6, #20
  ADD R5, R5, R4
  LI R2, #7326
  ADD R2, R8, R2
  ADD R2, R2, R5
  LT R2, R2, #0
  CALLX sol_draw_fc_card
  ADDI R4, R4, #1
  JMPX srf_r_lp
srf_c_nx:
  ADDI R6, R6, #1
  JMPX srf_c_lp

srf_verdict:
  ; If fc_verdict (+5295) != -2, draw WINNABLE / UNKNOWN / UNWINNABLE banner at (6, 120)
  LI R5, #7295
  ADD R5, R8, R5
  LT R0, R5, #0
  CMPI R0, #-2
  JZX sr_flush
  LI R2, #str_fc_unk - app6_sol_rom
  CMPI R0, #1
  JNZX srf_v_chk_unw
  LI R2, #str_fc_win - app6_sol_rom
  JMPX srf_v_draw
srf_v_chk_unw:
  CMPI R0, #-1
  JNZX srf_v_draw
  LI R2, #str_fc_unw - app6_sol_rom
srf_v_draw:
  ADD R2, R2, R8
  LI R0, #6
  LI R1, #120
  LI R3, #COL_YELLOW
  LI R4, #-290
  SYSCALL #21
  JMPX sr_flush

sol_draw_fc_card:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  ; Convert MS card (4*rank + suit, where suit 0=C,1=D,2=H,3=S) to sol_draw_card format
  LI R3, #4
  DIV R4, R2, R3 ; rank 0..12
  MOD R3, R2, R3 ; suit 0..3 (C,D,H,S)
  ; Map suit C(0)->2, D(1)->3, H(2)->1, S(3)->0 so sol_draw_card ("SHCD") displays exact suit & color!
  CMPI R3, #0
  JZX sdfc_c
  CMPI R3, #1
  JZX sdfc_d
  CMPI R3, #2
  JZX sdfc_h
  LI R3, #0
  JMPX sdfc_go
sdfc_c:
  LI R3, #2
  JMPX sdfc_go
sdfc_d:
  LI R3, #3
  JMPX sdfc_go
sdfc_h:
  LI R3, #1
sdfc_go:
  MULI R2, R3, #13
  ADD R2, R2, R4
  CALLX sol_draw_card
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

sol_redraw_spider:
  LI R0, #4
  LI R1, #2
  LI R2, #str_sp_bar - app6_sol_rom
  ADD R2, R2, R8
  LI R3, #COL_WHITE
  LI R4, #-230
  SYSCALL #21
  ; Draw 10 Spider columns c = 0..9 at x = 6 + c*21, y = 24 + r*6
  LI R6, #0
srs_c_lp:
  CMPI R6, #10
  JNNX sr_flush
  LI R4, #0
srs_r_lp:
  CMPI R4, #6
  JNNX srs_c_nx
  MULI R5, R6, #15
  ADD R5, R5, R4
  LI R2, #7326
  ADD R2, R8, R2
  ADD R2, R2, R5
  LT R2, R2, #0
  CMPI R2, #0
  JNX srs_c_nx
  MULI R0, R6, #21
  ADDI R0, R0, #6
  MULI R1, R4, #6
  ADDI R1, R1, #24
  CALLX sol_draw_card
  ADDI R4, R4, #1
  JMPX srs_r_lp
srs_c_nx:
  ADDI R6, R6, #1
  JMPX srs_c_lp

str_sol_fn:    .stringz "SOL"
str_fcsol_fn:  .stringz "FCSOL"
str_dealchk_fn: .stringz "DEALCHK"
str_fc_suits:  .stringz "CDHS"
str_dchk_p1:   .stringz "MS #1 first row: "
str_dchk_p2:   .stringz "(matches the published deal)\nMINSTD(48271) 10,000th value from seed 1: 399268537 (matches the published check value)\nCNSW deal v1 seed 1222, first 8 cards: KD 5H JS QC 7H KS JH QH"
str_fc_bar:    .stringz "[KLON][FREE][SPID][UNDO]"
str_sp_bar:    .stringz "[KLON][FREE][SPID] SPIDR"
str_fc_win:    .stringz "WINNABLE"
str_fc_unk:    .stringz "UNKNOWN"
str_fc_unw:    .stringz "UNWINNABLE"
app6_sol_end:

; ----------------------------------------------------------------------------
; APP 7: TETRIS (APP_ID = 7)
; 10x20 well, 7 standard tetrominoes (I,O,T,S,Z,J,L), rotation with 6-point wall kicks,
; soft & hard drop, line clears, score, level, speed, virtual-clock gravity,
; piece generator LCG S = (S * 127 + 259) % 6561; piece = S % 7,
; high score persisted in "TETHI", board & score saved to "TETRIS" on 'P' / [SAVE].
; Memory layout (relative to R8 = UBASE):
;   +5000..5214: TET_STATE (215 trytes, saved to "TETRIS"):
;     +5000..5002: score (word)
;     +5003..5005: high_score (word)
;     +5006: lines
;     +5007: level
;     +5008: game_over
;     +5009: cur_piece (0..6)
;     +5010: cur_rot (0..3)
;     +5011: cur_px
;     +5012: cur_py
;     +5013: pieces_spawned
;     +5014: seed
;     +5015..5214: grid[0..199] (20 rows * 10 cols)
;   +5220..5222: prng_s (word)
;   +5223..5225: last_grav_ticks (word)
;   +5226: next_seed (-1 or accumulated digits)
;   +5227: dirty
; ----------------------------------------------------------------------------
app7_tet_rom:
  LI R0, #240
  LI R1, #14
  LI R2, #198
  LI R3, #148
  LI R4, #str_tet_title - app7_tet_rom
  ADD R4, R4, R8
  LI R5, #-320
  SYSCALL #10

  ; Load persisted high_score from "TETHI" if present
  ADDI R6, R8, #5000
  LI R0, #0
  SW R0, R6, #3 ; high_score = 0
  LI R0, #str_tet_hifn - app7_tet_rom
  ADD R0, R0, R8
  ADDI R1, R8, #5003
  LI R2, #3
  SYSCALL #31

  ADDI R6, R8, #5000
  LI R0, #1
  ST R0, R6, #14 ; seed = 1
  LI R0, #-1
  ST R0, R6, #226 ; next_seed = -1

  CALLX tet_new_game
  CALLX tet_redraw

tet_ev_lp:
  SYSCALL #25
  CMPI R0, #0
  JZX tet_check_grav
  CMPI R0, #1
  JZX tet_on_key
  CMPI R0, #2
  JZX tet_on_click
  JMPX tet_ev_lp

tet_check_grav:
  ; Check virtual-clock gravity if game_over == 0
  ADDI R6, R8, #5000
  LT R0, R6, #8 ; game_over
  CMPI R0, #0
  JNZX tet_idle_draw
  SYSCALL #9 ; R0 = current ms (SYS_GET_MS)
  ADDI R6, R8, #5223
  LW R1, R6, #0 ; last_grav_ms
  SUB R2, R0, R1
  LI R3, #984 ; 984 ms at level 1 (~196,800 steps)
  CMP R2, R3
  JNX tet_idle_draw
  SW R0, R6, #0 ; update last_grav_ticks
  LI R0, #0     ; soft_drop_bonus = 0
  CALLX tet_step_down
  ADDI R6, R8, #5227
  LI R0, #1
  ST R0, R6, #0

tet_idle_draw:
  ADDI R6, R8, #5227
  LT R0, R6, #0
  CMPI R0, #0
  JZX tet_do_yield
  LI R0, #0
  ST R0, R6, #0
  CALLX tet_redraw
tet_do_yield:
  SYSCALL #2
  JMPX tet_ev_lp

tet_on_click:
  CMPI R2, #13
  JNNX tet_ev_lp
  CMPI R1, #50
  JNX tet_cmd_new
  JMPX tet_cmd_save

tet_on_key:
  CMPI R1, #200
  JZX tet_trig_fault
  CMPI R1, #201
  JZX tet_trig_loop

  ; Digits '0'..'9' accumulate next_seed
  CMPI R1, #48
  JNX tet_key_act
  CMPI R1, #57
  JPX tet_key_act
  SUBI R1, R1, #48
  ADDI R6, R8, #5226
  LT R0, R6, #0
  CMPI R0, #-1
  JNZX tet_seed_acc
  ST R1, R6, #0
  JMPX tet_ev_lp
tet_seed_acc:
  MULI R0, R0, #10
  ADD R0, R0, R1
  ST R0, R6, #0
  JMPX tet_ev_lp

tet_trig_fault:
  LI R1, #100
  LI R0, #999
  ST R0, R1, #0
  JMPX tet_ev_lp
tet_trig_loop:
  JMPX tet_trig_loop

tet_key_act:
  CMPI R1, #'N'
  JZX tet_cmd_new
  CMPI R1, #'n'
  JZX tet_cmd_new
  CMPI R1, #'B'
  JZX tet_cmd_bag_new
  CMPI R1, #'b'
  JZX tet_cmd_bag_new
  CMPI R1, #'C'
  JZX tet_cmd_hold
  CMPI R1, #'c'
  JZX tet_cmd_hold
  CMPI R1, #'H'
  JZX tet_cmd_hold
  CMPI R1, #'h'
  JZX tet_cmd_hold
  CMPI R1, #'Z'
  JZX tet_cmd_pause_toggle
  CMPI R1, #'z'
  JZX tet_cmd_pause_toggle
  CMPI R1, #'P'
  JZX tet_cmd_save
  CMPI R1, #'p'
  JZX tet_cmd_save
  CMPI R1, #'V'
  JZX tet_cmd_save
  CMPI R1, #'v'
  JZX tet_cmd_save

  ; Ignore movement keys if game_over == 1
  ADDI R6, R8, #5008
  LT R0, R6, #0
  CMPI R0, #0
  JNZX tet_ev_lp

  CMPI R1, #'A'
  JZX tet_mv_left
  CMPI R1, #'a'
  JZX tet_mv_left
  CMPI R1, #128 ; ArrowLeft
  JZX tet_mv_left

  CMPI R1, #'D'
  JZX tet_mv_right
  CMPI R1, #'d'
  JZX tet_mv_right
  CMPI R1, #129 ; ArrowRight
  JZX tet_mv_right

  CMPI R1, #'W'
  JZX tet_mv_rot
  CMPI R1, #'w'
  JZX tet_mv_rot
  CMPI R1, #130 ; ArrowUp
  JZX tet_mv_rot

  CMPI R1, #'S'
  JZX tet_mv_soft
  CMPI R1, #'s'
  JZX tet_mv_soft
  CMPI R1, #131 ; ArrowDown
  JZX tet_mv_soft

  CMPI R1, #32 ; Space -> hard drop
  JZX tet_mv_hard
  JMPX tet_ev_lp

tet_cmd_new:
  ADDI R6, R8, #5226
  LT R0, R6, #0
  CMPI R0, #-1
  JZX tet_new_go
  ADDI R5, R8, #5014
  ST R0, R5, #0
  LI R0, #-1
  ST R0, R6, #0
tet_new_go:
  CALLX tet_new_game
  ADDI R6, R8, #5227
  LI R0, #1
  ST R0, R6, #0
  JMPX tet_ev_lp

tet_cmd_save:
  CALLX tet_save_tblk
  LI R0, #str_tet_fn - app7_tet_rom
  ADD R0, R0, R8
  ADDI R1, R8, #5000
  LI R2, #215
  LI R3, #1
  SYSCALL #32
  LI R0, #str_tet_hifn - app7_tet_rom
  ADD R0, R0, R8
  ADDI R1, R8, #5003
  LI R2, #3
  LI R3, #1
  SYSCALL #32
  JMPX tet_ev_lp

tet_mv_left:
  ADDI R6, R8, #5009
  LT R0, R6, #0 ; piece
  LT R1, R6, #1 ; rot
  LT R2, R6, #2 ; px
  LT R3, R6, #3 ; py
  SUBI R2, R2, #1
  CALLX tet_check_col
  CMPI R0, #0
  JNZX tet_ev_lp
  ST R2, R6, #2
  ADDI R6, R8, #5227
  LI R0, #1
  ST R0, R6, #0
  JMPX tet_ev_lp

tet_mv_right:
  ADDI R6, R8, #5009
  LT R0, R6, #0
  LT R1, R6, #1
  LT R2, R6, #2
  LT R3, R6, #3
  ADDI R2, R2, #1
  CALLX tet_check_col
  CMPI R0, #0
  JNZX tet_ev_lp
  ST R2, R6, #2
  ADDI R6, R8, #5227
  LI R0, #1
  ST R0, R6, #0
  JMPX tet_ev_lp

tet_mv_rot:
  ; Try 6 wall kicks in tet_kicks for new_rot = (cur_rot + 1) % 4
  ADDI R6, R8, #5009
  LT R4, R6, #1 ; cur_rot
  ADDI R4, R4, #1
  CMPI R4, #4
  JNX tmr_rot_ok
  LI R4, #0
tmr_rot_ok:
  LI R5, #0 ; kick idx 0..5
tmr_kick_lp:
  CMPI R5, #6
  JNNX tet_ev_lp
  LI R7, #tet_kicks - app7_tet_rom
  ADD R7, R7, R8
  MULI R0, R5, #2
  ADD R7, R7, R0
  LT R2, R6, #2 ; cur_px
  LT R0, R7, #0 ; kx
  ADD R2, R2, R0
  LT R3, R6, #3 ; cur_py
  LT R0, R7, #1 ; ky
  ADD R3, R3, R0
  LT R0, R6, #0 ; cur_piece
  MOV R1, R4    ; new_rot
  CALLX tet_check_col
  CMPI R0, #0
  JZX tmr_kick_accept
  ADDI R5, R5, #1
  JMPX tmr_kick_lp
tmr_kick_accept:
  ST R4, R6, #1 ; cur_rot = new_rot
  ST R2, R6, #2 ; cur_px
  ST R3, R6, #3 ; cur_py
  ADDI R6, R8, #5227
  LI R0, #1
  ST R0, R6, #0
  JMPX tet_ev_lp

tet_mv_soft:
  LI R0, #1 ; +1 score if soft drop moves down
  CALLX tet_step_down
  ADDI R6, R8, #5227
  LI R0, #1
  ST R0, R6, #0
  JMPX tet_ev_lp

tet_mv_hard:
  ADDI R6, R8, #5009
tmh_lp:
  LT R0, R6, #0
  LT R1, R6, #1
  LT R2, R6, #2
  LT R3, R6, #3
  ADDI R3, R3, #1
  CALLX tet_check_col
  CMPI R0, #0
  JNZX tmh_lock
  ST R3, R6, #3 ; cur_py++
  ; Add +2 to score
  ADDI R5, R8, #5000
  LW R0, R5, #0
  ADDI R0, R0, #2
  SW R0, R5, #0
  JMPX tmh_lp
tmh_lock:
  CALLX tet_lock_piece
  ADDI R6, R8, #5227
  LI R0, #1
  ST R0, R6, #0
  JMPX tet_ev_lp

; tet_step_down: R0 = bonus_per_step (1 for soft drop, 0 for gravity)
tet_step_down:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R6
  MOV R4, R0
  ADDI R6, R8, #5009
  LT R0, R6, #0
  LT R1, R6, #1
  LT R2, R6, #2
  LT R3, R6, #3
  ADDI R3, R3, #1
  CALLX tet_check_col
  CMPI R0, #0
  JNZX tsd_lock
  ST R3, R6, #3
  ADDI R6, R8, #5000
  LW R0, R6, #0
  ADD R0, R0, R4
  SW R0, R6, #0
  JMPX tsd_done
tsd_lock:
  CALLX tet_lock_piece
tsd_done:
  POP R6
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; tet_new_game: resets board, score, lines, level, prng_s = seed, and spawns first piece
tet_new_game:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R6
  ADDI R6, R8, #5000
  LI R0, #0
  SW R0, R6, #0 ; score = 0
  ST R0, R6, #6 ; lines = 0
  LI R0, #1
  ST R0, R6, #7 ; level = 1
  LI R0, #0
  ST R0, R6, #8 ; game_over = 0
  ST R0, R6, #13 ; pieces_spawned = 0
  LT R0, R6, #14 ; seed
  SW R0, R6, #220 ; prng_s = seed

  ; Clear 200-cell well (+5015..5214)
  ADDI R0, R8, #5015
  LI R1, #0
  LI R2, #200
  BFILL R0, R1, R2

  SYSCALL #9
  SW R0, R6, #223 ; last_grav_ms = ms
  CALLX tet_spawn_piece
  POP R6
  POP R2
  POP R1
  POP R0
  RET

; tet_spawn_piece: advances PRNG S = (S * 127 + 259) % 6561, piece = S % 7, px=3, py=0, rot=0
tet_spawn_piece:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R6
  ADDI R6, R8, #5000
  LW R0, R6, #220 ; prng_s
  MULI R0, R0, #127
  ADDI R0, R0, #259
  LI R1, #6561
  MOD R0, R0, R1
  CMPI R0, #0
  JNNX tsp_pos
  ADD R0, R0, R1
tsp_pos:
  SW R0, R6, #220
  LI R1, #7
  MOD R0, R0, R1 ; piece = S % 7
  ST R0, R6, #9  ; cur_piece
  LI R1, #0
  ST R1, R6, #10 ; cur_rot = 0
  LI R2, #3
  ST R2, R6, #11 ; cur_px = 3
  LI R3, #0
  ST R3, R6, #12 ; cur_py = 0
  LT R4, R6, #13
  ADDI R4, R4, #1
  ST R4, R6, #13 ; pieces_spawned++

  ; Check immediate collision -> game_over = 1
  CALLX tet_check_col
  CMPI R0, #0
  JZX tsp_done
  LI R0, #1
  ST R0, R6, #8 ; game_over = 1
  CALLX tet_update_hi
tsp_done:
  POP R6
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; tet_check_col: R0=piece, R1=rot, R2=px, R3=py -> returns R0 = 0 if valid, 1 if collision
tet_check_col:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  MULI R4, R0, #32
  MULI R5, R1, #8
  ADD R4, R4, R5
  LI R5, #tet_shapes - app7_tet_rom
  ADD R5, R5, R8
  ADD R4, R4, R5 ; R4 = &tet_shapes[piece][rot][0]
  LI R5, #4 ; 4 blocks
tcc_lp:
  CMPI R5, #0
  JNPX tcc_ok
  LT R6, R4, #0 ; dx
  ADD R6, R6, R2 ; bx = px + dx
  CMPI R6, #0
  JNX tcc_bad
  CMPI R6, #10
  JNNX tcc_bad
  LT R7, R4, #1 ; dy
  ADD R7, R7, R3 ; by = py + dy
  CMPI R7, #0
  JNX tcc_bad
  CMPI R7, #20
  JNNX tcc_bad
  MULI R7, R7, #10
  ADD R7, R7, R6
  ADDI R7, R7, #5015
  ADD R7, R7, R8
  LT R6, R7, #0
  CMPI R6, #0
  JNZX tcc_bad
  ADDI R4, R4, #2
  SUBI R5, R5, #1
  JMPX tcc_lp
tcc_ok:
  LI R0, #0
  JMPX tcc_ret
tcc_bad:
  LI R0, #1
tcc_ret:
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

; tet_lock_piece: writes cur_piece blocks to grid, clears completed lines, updates score/level/high_score, spawns next
tet_lock_piece:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  ADDI R6, R8, #5009
  LT R0, R6, #0 ; piece
  LT R1, R6, #1 ; rot
  LT R2, R6, #2 ; px
  LT R3, R6, #3 ; py
  MULI R4, R0, #32
  MULI R5, R1, #8
  ADD R4, R4, R5
  LI R5, #tet_shapes - app7_tet_rom
  ADD R5, R5, R8
  ADD R4, R4, R5
  ADDI R7, R0, #1 ; color_id = piece + 1
  LI R5, #4
tlp_wr_lp:
  CMPI R5, #0
  JNPX tlp_scan_lines
  LT R0, R4, #0
  ADD R0, R0, R2 ; bx
  LT R1, R4, #1
  ADD R1, R1, R3 ; by
  MULI R1, R1, #10
  ADD R1, R1, R0
  ADDI R1, R1, #5015
  ADD R1, R1, R8
  ST R7, R1, #0
  ADDI R4, R4, #2
  SUBI R5, R5, #1
  JMPX tlp_wr_lp

tlp_scan_lines:
  LI R4, #0  ; cleared_count = 0
  LI R5, #19 ; row y = 19 down to 0
tlp_row_lp:
  CMPI R5, #0
  JNX tlp_score_lines
  ; Check if row R5 is full (all 10 cells != 0)
  MULI R0, R5, #10
  ADDI R0, R0, #5015
  ADD R0, R0, R8
  LI R1, #0
tlp_chk_col:
  CMPI R1, #10
  JNNX tlp_row_full
  ADD R2, R0, R1
  LT R3, R2, #0
  CMPI R3, #0
  JZX tlp_row_next
  ADDI R1, R1, #1
  JMPX tlp_chk_col

tlp_row_full:
  ADDI R4, R4, #1 ; cleared_count++
  ; Shift rows R5-1 .. 0 down by 1 row
  MOV R1, R5 ; dst_r = R5
tlp_shift_lp:
  CMPI R1, #0
  JNPX tlp_clear_top
  SUBI R2, R1, #1 ; src_r = dst_r - 1
  MULI R3, R1, #10
  ADDI R3, R3, #5015
  ADD R3, R3, R8 ; dst row ptr
  MULI R2, R2, #10
  ADDI R2, R2, #5015
  ADD R2, R2, R8 ; src row ptr
  LI R6, #10
  BCOPY R3, R2, R6
  SUBI R1, R1, #1
  JMPX tlp_shift_lp
tlp_clear_top:
  ADDI R0, R8, #5015
  LI R1, #0
  LI R2, #10
  BFILL R0, R1, R2
  ; Re-check same row index R5 since rows shifted down!
  JMPX tlp_row_lp

tlp_row_next:
  SUBI R5, R5, #1
  JMPX tlp_row_lp

tlp_score_lines:
  CMPI R4, #0
  JNPX tlp_finish
  ADDI R6, R8, #5000
  LT R0, R6, #6 ; lines
  ADD R0, R0, R4
  ST R0, R6, #6 ; lines += cleared_count
  LI R1, #10
  DIV R0, R0, R1
  ADDI R0, R0, #1
  ST R0, R6, #7 ; level = 1 + lines / 10

  ; Base points: 1->100, 2->300, 3->500, 4->800
  LI R1, #100
  CMPI R4, #1
  JZX tlp_add_pts
  LI R1, #300
  CMPI R4, #2
  JZX tlp_add_pts
  LI R1, #500
  CMPI R4, #3
  JZX tlp_add_pts
  LI R1, #800
tlp_add_pts:
  LT R2, R6, #7 ; level
  MUL R1, R1, R2
  LW R0, R6, #0
  ADD R0, R0, R1
  SW R0, R6, #0

tlp_finish:
  CALLX tet_update_hi
  SYSCALL #9
  ADDI R6, R8, #5223
  SW R0, R6, #0 ; reset gravity timer
  CALLX tet_spawn_piece
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

tet_update_hi:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  ADDI R2, R8, #5000
  LW R0, R2, #0 ; score
  LW R1, R2, #3 ; high_score
  CMP R0, R1
  JNPX tuhi_done
  SW R0, R2, #3 ; high_score = score
  LI R0, #str_tet_hifn - app7_tet_rom
  ADD R0, R0, R8
  ADDI R1, R8, #5003
  LI R2, #3
  LI R3, #1
  SYSCALL #32
tuhi_done:
  POP R3
  POP R2
  POP R1
  POP R0
  RET

tet_redraw:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7

  ; Clear window body
  LI R0, #0
  LI R1, #0
  LI R2, #178
  LI R3, #135
  LI R4, #-320
  SYSCALL #20

  ; Toolbar at (4, 2)
  LI R0, #4
  LI R1, #2
  LI R2, #str_tet_bar - app7_tet_rom
  ADD R2, R2, R8
  LI R3, #COL_WHITE
  LI R4, #-230
  SYSCALL #21

  ; Draw 10x20 well background at (8, 14, 60, 120) (each cell 6x6 px)
  LI R0, #8
  LI R1, #14
  LI R2, #60
  LI R3, #120
  LI R4, #COL_BLACK
  SYSCALL #20

  ; Draw locked blocks in grid
  LI R5, #0 ; y = 0..19
trd_ylp:
  CMPI R5, #20
  JNNX trd_cur_piece
  LI R6, #0 ; x = 0..9
trd_xlp:
  CMPI R6, #10
  JNNX trd_ynx
  MULI R0, R5, #10
  ADD R0, R0, R6
  ADDI R0, R0, #5015
  ADD R0, R0, R8
  LT R4, R0, #0 ; cell value 0..7
  CMPI R4, #0
  JZX trd_xnx
  MULI R4, R4, #80
  SUBI R4, R4, #220 ; vivid 729-color per piece type
  MULI R0, R6, #6
  ADDI R0, R0, #8
  MULI R1, R5, #6
  ADDI R1, R1, #14
  LI R2, #5
  LI R3, #5
  SYSCALL #20
trd_xnx:
  ADDI R6, R6, #1
  JMPX trd_xlp
trd_ynx:
  ADDI R5, R5, #1
  JMPX trd_ylp

trd_cur_piece:
  ; Draw active falling piece
  ADDI R6, R8, #5009
  LT R0, R6, #0 ; piece
  LT R1, R6, #1 ; rot
  LT R5, R6, #2 ; px
  LT R7, R6, #3 ; py
  MULI R2, R0, #32
  MULI R3, R1, #8
  ADD R2, R2, R3
  LI R3, #tet_shapes - app7_tet_rom
  ADD R3, R3, R8
  ADD R6, R2, R3 ; shape ptr
  LI R4, #COL_CYAN
  LI R3, #4
trd_cp_lp:
  CMPI R3, #0
  JNPX trd_hud
  LT R0, R6, #0
  ADD R0, R0, R5
  MULI R0, R0, #6
  ADDI R0, R0, #8
  LT R1, R6, #1
  ADD R1, R1, R7
  MULI R1, R1, #6
  ADDI R1, R1, #14
  PUSH R3
  LI R2, #5
  LI R3, #5
  SYSCALL #20
  POP R3
  ADDI R6, R6, #2
  SUBI R3, R3, #1
  JMPX trd_cp_lp

trd_hud:
  ; Draw Score, High Score, Lines, Level on right panel (x=76)
  LI R0, #76
  LI R1, #18
  LI R2, #str_tet_sc - app7_tet_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-320
  SYSCALL #21
  ADDI R6, R8, #5000
  LW R2, R6, #0 ; score
  LI R0, #76
  LI R1, #28
  LI R3, #10
  LI R4, #COL_WHITE
  LI R5, #-320
  SYSCALL #26

  LI R0, #76
  LI R1, #44
  LI R2, #str_tet_hi - app7_tet_rom
  ADD R2, R2, R8
  LI R3, #COL_YELLOW
  LI R4, #-320
  SYSCALL #21
  ADDI R6, R8, #5003
  LW R2, R6, #0 ; high_score
  LI R0, #76
  LI R1, #54
  LI R3, #10
  LI R4, #COL_WHITE
  LI R5, #-320
  SYSCALL #26

  LI R0, #76
  LI R1, #70
  LI R2, #str_tet_ln - app7_tet_rom
  ADD R2, R2, R8
  LI R3, #COL_GREEN
  LI R4, #-320
  SYSCALL #21
  ADDI R6, R8, #5006
  LT R2, R6, #0 ; lines
  LI R0, #76
  LI R1, #80
  LI R3, #10
  LI R4, #COL_WHITE
  LI R5, #-320
  SYSCALL #26

  ADDI R6, R8, #5008
  LT R0, R6, #0 ; game_over
  CMPI R0, #0
  JZX trd_flush
  LI R0, #76
  LI R1, #104
  LI R2, #str_tet_over - app7_tet_rom
  ADD R2, R2, R8
  LI R3, #COL_RED
  LI R4, #-320
  SYSCALL #21

trd_flush:
  LI R0, #0
  LI R1, #0
  LI R2, #0
  LI R3, #0
  SYSCALL #24
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; 7 Tetrominoes x 4 Rotations x 8 trytes (dx0,dy0, dx1,dy1, dx2,dy2, dx3,dy3)
tet_shapes:
  ; 0: I
  .tryte #0,#1, #1,#1, #2,#1, #3,#1
  .tryte #2,#0, #2,#1, #2,#2, #2,#3
  .tryte #0,#2, #1,#2, #2,#2, #3,#2
  .tryte #1,#0, #1,#1, #1,#2, #1,#3
  ; 1: O
  .tryte #1,#0, #2,#0, #1,#1, #2,#1
  .tryte #1,#0, #2,#0, #1,#1, #2,#1
  .tryte #1,#0, #2,#0, #1,#1, #2,#1
  .tryte #1,#0, #2,#0, #1,#1, #2,#1
  ; 2: T
  .tryte #1,#0, #0,#1, #1,#1, #2,#1
  ; __PERTURB_TETRIS_ROTATION__
  .tryte #0,#1, #1,#1, #2,#1, #1,#2
  .tryte #1,#0, #0,#1, #1,#1, #1,#2
  ; 3: S
  .tryte #1,#0, #2,#0, #0,#1, #1,#1
  .tryte #1,#0, #1,#1, #2,#1, #2,#2
  .tryte #1,#1, #2,#1, #0,#2, #1,#2
  .tryte #0,#0, #0,#1, #1,#1, #1,#2
  ; 4: Z
  .tryte #0,#0, #1,#0, #1,#1, #2,#1
  .tryte #2,#0, #1,#1, #2,#1, #1,#2
  .tryte #0,#1, #1,#1, #1,#2, #2,#2
  .tryte #1,#0, #0,#1, #1,#1, #0,#2
  ; 5: J
  .tryte #0,#0, #0,#1, #1,#1, #2,#1
  .tryte #1,#0, #2,#0, #1,#1, #1,#2
  .tryte #0,#1, #1,#1, #2,#1, #2,#2
  .tryte #1,#0, #1,#1, #0,#2, #1,#2
  ; 6: L
  .tryte #2,#0, #0,#1, #1,#1, #2,#1
  .tryte #1,#0, #1,#1, #1,#2, #2,#2
  .tryte #0,#1, #1,#1, #2,#1, #0,#2
  .tryte #0,#0, #1,#0, #1,#1, #1,#2

tet_kicks:
  .tryte #0,#0, #-1,#0, #1,#0, #-2,#0, #2,#0, #0,#-1

str_tet_title: .stringz "TRIT BLOCKS"
str_tet_bar:   .stringz "[NEW] [SAVE] TBLK"
str_tet_sc:    .stringz "SCORE:"
str_tet_hi:    .stringz "HIGH:"
str_tet_ln:    .stringz "LINES:"
str_tet_over:  .stringz "GAME OVER"
str_tet_fn:    .stringz "TETRIS"

; ============================================================================
; TRIT BLOCKS 1.1.2 IN-GUEST EXTENSIONS (7-Bag, 3-Piece Next Queue, Hold,
; Ghost Piece, 500 ms Lock Delay via SYS_GET_MS, Pause, Seeded Play -> "TBLK")
; ============================================================================
; Memory layout in App 7 User Space (relative to R8 = UBASE):
;   +5230..5243: bag_seq[0..13] (two 7-bags generated via cnswNext(seed))
;   +5244..5246: next_queue[0..2] (3-piece next queue)
;   +5247: hold_piece (-1 or 0..6)
;   +5248: hold_used (0 or 1)
;   +5249: ghost_py (0..19)
;   +5250: paused (0 or 1)
;   +5251..5253: lock_timer_ms (3-tryte word, 500 ms lock delay via SYS_GET_MS)
;   +5254: bag_idx (0..13)
;   +5255: bag_mode (0=legacy LCG for desktop-13, 1=7-bag Trit Blocks)
;   +5300..5539: tblk_save_buf (240 trytes saved to "TBLK")

tet_cmd_bag_new:
  ; 'B' key: start seeded 7-bag Trit Blocks game!
  ADDI R6, R8, #5226
  LT R0, R6, #0 ; next_seed
  CMPI R0, #-1
  JZX tcbn_keep_seed
  ADDI R5, R8, #5014
  ST R0, R5, #0 ; seed = next_seed
  LI R0, #-1
  ST R0, R6, #0
tcbn_keep_seed:
  LI R1, #5255
  ADD R1, R8, R1
  LI R0, #1
  ST R0, R1, #0 ; bag_mode = 1
  CALLX tet_init_7bags
  CALLX tet_new_game
  ; Override cur_piece with bag_seq[0], next_queue[0..2] with bag_seq[1..3], bag_idx = 4
  LI R1, #5230
  ADD R1, R8, R1
  LT R0, R1, #0
  ADDI R2, R8, #5009
  ST R0, R2, #0 ; cur_piece = bag_seq[0]
  LT R0, R1, #1
  ST R0, R1, #14 ; next_queue[0]
  LT R0, R1, #2
  ST R0, R1, #15 ; next_queue[1]
  LT R0, R1, #3
  ST R0, R1, #16 ; next_queue[2]
  LI R0, #-1
  ST R0, R1, #17 ; hold_piece = -1
  LI R0, #0
  ST R0, R1, #18 ; hold_used = 0
  ST R0, R1, #20 ; paused = 0
  LI R0, #4
  ST R0, R1, #24 ; bag_idx = 4
  CALLX tet_compute_ghost
  CALLX tet_save_tblk
  ADDI R6, R8, #5227
  LI R0, #1
  ST R0, R6, #0
  JMPX tet_ev_lp

tet_cmd_hold:
  ; 'C' or 'H' key: swap cur_piece with hold_piece (if hold_used == 0)
  LI R1, #5247
  ADD R1, R8, R1
  LT R0, R1, #1 ; hold_used (+5248)
  CMPI R0, #0
  JNZX tet_ev_lp
  LI R0, #1
  ST R0, R1, #1 ; hold_used = 1
  ADDI R2, R8, #5009
  LT R3, R2, #0 ; cur_piece
  LT R4, R1, #0 ; old hold_piece
  ST R3, R1, #0 ; hold_piece = cur_piece
  CMPI R4, #-1
  JNZX tch_swap
  ; Pull next piece from next_queue[0] and shift next_queue
  LT R4, R1, #-3 ; next_queue[0] (+5244)
  LT R0, R1, #-2 ; next_queue[1]
  ST R0, R1, #-3
  LT R0, R1, #-1 ; next_queue[2]
  ST R0, R1, #-2
  ; Refill next_queue[2] from bag_seq[bag_idx]
  LT R5, R1, #7  ; bag_idx (+5254)
  LI R6, #5230
  ADD R6, R8, R6
  ADD R6, R6, R5
  LT R0, R6, #0
  ST R0, R1, #-1 ; next_queue[2]
  ADDI R5, R5, #1
  CMPI R5, #14
  JNX tch_bi_ok
  LI R5, #0
tch_bi_ok:
  ST R5, R1, #7
tch_swap:
  ST R4, R2, #0 ; cur_piece = R4
  LI R0, #0
  ST R0, R2, #1 ; cur_rot = 0
  LI R0, #3
  ST R0, R2, #2 ; cur_px = 3
  LI R0, #0
  ST R0, R2, #3 ; cur_py = 0
  CALLX tet_compute_ghost
  CALLX tet_save_tblk
  ADDI R6, R8, #5227
  LI R0, #1
  ST R0, R6, #0
  JMPX tet_ev_lp

tet_cmd_pause_toggle:
  ; 'Z' key: toggle paused (+5250)
  LI R1, #5250
  ADD R1, R8, R1
  LT R0, R1, #0
  CMPI R0, #0
  JZX tcpt_set1
  LI R0, #0
  JMPX tcpt_st
tcpt_set1:
  LI R0, #1
tcpt_st:
  ST R0, R1, #0
  CALLX tet_save_tblk
  ADDI R6, R8, #5227
  LI R0, #1
  ST R0, R6, #0
  JMPX tet_ev_lp

; tet_init_7bags: fills +5230..+5236 (bag 1) and +5237..+5243 (bag 2) using MINSTD Fisher-Yates of 0..6
tet_init_7bags:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  ADDI R0, R8, #5014
  LT R0, R0, #0 ; seed
  CMPI R0, #0
  JPX ti7_s_ok
  LI R0, #1
ti7_s_ok:
  LI R1, #5260
  ADD R1, R8, R1
  SW R0, R1, #0 ; minstd state at +5260
  ; Fill bag 1 at +5230 and bag 2 at +5237
  LI R7, #0 ; bag = 0..1
ti7_bag_lp:
  CMPI R7, #2
  JNNX ti7_done
  MULI R6, R7, #7
  LI R1, #5230
  ADD R1, R8, R1
  ADD R1, R1, R6 ; bag base
  LI R0, #0
ti7_fill:
  CMPI R0, #7
  JNNX ti7_shuf
  ADD R2, R1, R0
  ST R0, R2, #0
  ADDI R0, R0, #1
  JMPX ti7_fill
ti7_shuf:
  LI R3, #6 ; i = 6..1
ti7_slp:
  CMPI R3, #1
  JNX ti7_nx_bag
  ; Advance minstd at +5260
  LI R2, #5260
  ADD R2, R8, R2
  LW R0, R2, #0
  LI R4, #5122
  LMI R4, #2 ; 44488
  DIV R5, R0, R4
  MOD R6, R0, R4
  LI R4, #8905
  LMI R4, #2 ; 48271
  MUL R6, R6, R4
  LI R4, #3399
  MUL R5, R5, R4
  SUB R0, R6, R5
  CMPI R0, #0
  JPX ti7_m_ok
  ADDI R0, R0, #523
  ADDM R0, R0, #-8996
  ADDH R0, R0, #6
ti7_m_ok:
  SW R0, R2, #0
  ADDI R4, R3, #1
  MOD R5, R0, R4 ; j = rnd() % (i + 1)
  ADD R4, R1, R3
  ADD R5, R1, R5
  LT R0, R4, #0
  LT R6, R5, #0
  ST R6, R4, #0
  ST R0, R5, #0
  SUBI R3, R3, #1
  JMPX ti7_slp
ti7_nx_bag:
  ADDI R7, R7, #1
  JMPX ti7_bag_lp
ti7_done:
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; tet_compute_ghost: computes ghost_py (+5249) as lowest valid py >= cur_py
tet_compute_ghost:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  ADDI R4, R8, #5009
  LT R0, R4, #0 ; cur_piece
  LT R1, R4, #1 ; cur_rot
  LT R2, R4, #2 ; cur_px
  LT R3, R4, #3 ; cur_py
tcg_lp:
  ADDI R3, R3, #1
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  CALLX tet_check_col
  MOV R4, R0
  POP R3
  POP R2
  POP R1
  POP R0
  CMPI R4, #0
  JZX tcg_lp
  SUBI R3, R3, #1
  LI R4, #5249
  ADD R4, R8, R4
  ST R3, R4, #0 ; ghost_py
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

tet_save_tblk:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  CALLX tet_compute_ghost
  LI R0, #5300
  ADD R0, R8, R0
  ADDI R1, R8, #5000
  LI R2, #215
  BCOPY R0, R1, R2
  LI R0, #5515
  ADD R0, R8, R0
  LI R1, #5230
  ADD R1, R8, R1
  LI R2, #26
  BCOPY R0, R1, R2
  LI R0, #str_tblk_fn - app7_tet_rom
  ADD R0, R0, R8
  LI R1, #5300
  ADD R1, R8, R1
  LI R2, #241
  LI R3, #1
  SYSCALL #32
  POP R3
  POP R2
  POP R1
  POP R0
  RET

str_tet_hifn:  .stringz "TETHI"
str_tblk_fn:   .stringz "TBLK"
app7_tet_end:

; ----------------------------------------------------------------------------
; APP 8: WRITE WORD PROCESSOR (APP_ID = 8)
; Multi-line documents with 24-col word wrap, cursor movement (arrows 128..131,
; home 132, end 133, pgup 134, pgdn 135), insert, delete (127), backspace (8),
; open (Ctrl+O=15), save (Ctrl+S=19), save-as (Ctrl+W=23), status line (L, C, W).
; Memory layout (relative to R8 = UBASE):
;   +5000..5015: filename (default "DOC")
;   +5020..5022: doc_len (word)
;   +5023..5025: cursor_pos (word)
;   +5026:       scroll_row
;   +5027:       mode (0=edit, 1=open_fn, 2=saveas_fn)
;   +5028:       fn_len
;   +5029:       dirty
;   +5030:       cur_line (1-based)
;   +5031:       cur_col (1-based)
;   +5032:       word_cnt
;   +5033:       total_lines
;   +5040..5080: line_scratch
;   +5100..5999: line_starts[0..299] & line_ends[0..299] (5100..5399 starts, 5400..5699 ends)
;   +6000..9800: doc_buf (up to 3,800 chars)
; ----------------------------------------------------------------------------
app8_write_rom:
  LI R0, #60
  LI R1, #24
  LI R2, #228
  LI R3, #140
  LI R4, #str_wr_title - app8_write_rom
  ADD R4, R4, R8
  LI R5, #-310
  SYSCALL #10

  ADDI R6, R8, #5000
  LI R0, #'D'
  ST R0, R6, #0
  LI R0, #'O'
  ST R0, R6, #1
  LI R0, #'C'
  ST R0, R6, #2
  LI R0, #0
  ST R0, R6, #3

  SW R0, R6, #20 ; doc_len = 0
  SW R0, R6, #23 ; cursor_pos = 0
  ST R0, R6, #26 ; scroll_row = 0
  ST R0, R6, #27 ; mode = 0
  ST R0, R6, #28 ; fn_len = 0
  LI R0, #1
  ST R0, R6, #29 ; dirty = 1
  ADDI R6, R8, #6000
  LI R0, #0
  ST R0, R6, #0

  CALLX wr_recompute_layout
  CALLX wr_redraw

wr_ev_lp:
  SYSCALL #25
  CMPI R0, #0
  JZX wr_idle
  CMPI R0, #1
  JZX wr_on_key
  CMPI R0, #2
  JZX wr_on_click
  JMPX wr_ev_lp

wr_idle:
  ADDI R6, R8, #5029
  LT R0, R6, #0
  CMPI R0, #0
  JZX wr_do_yield
  LI R0, #0
  ST R0, R6, #0
  CALLX wr_recompute_layout
  CALLX wr_redraw
wr_do_yield:
  SYSCALL #2
  JMPX wr_ev_lp

wr_on_click:
  CMPI R2, #13
  JNNX wr_ev_lp
  CMPI R1, #48
  JNX wr_start_open
  CMPI R1, #96
  JNX wr_do_save
  JMPX wr_start_saveas

wr_on_key:
  CMPI R1, #200
  JZX wr_trig_fault
  CMPI R1, #201
  JZX wr_trig_loop

  ; Check if in filename input mode (mode == 1 or 2)
  ADDI R6, R8, #5000
  LT R0, R6, #27 ; mode
  CMPI R0, #0
  JNZX wr_key_fn_mode

  ; Mode 0 (document editing):
  CMPI R1, #19 ; Ctrl+S -> save
  JZX wr_do_save
  CMPI R1, #15 ; Ctrl+O -> open by filename
  JZX wr_start_open
  CMPI R1, #23 ; Ctrl+W -> save-as by filename
  JZX wr_start_saveas
  CMPI R1, #8  ; Backspace
  JZX wr_do_bs
  CMPI R1, #127 ; Delete
  JZX wr_do_del
  CMPI R1, #128 ; Left
  JZX wr_cur_left
  CMPI R1, #129 ; Right
  JZX wr_cur_right
  CMPI R1, #130 ; Up
  JZX wr_cur_up
  CMPI R1, #131 ; Down
  JZX wr_cur_down
  CMPI R1, #132 ; Home
  JZX wr_cur_home
  CMPI R1, #133 ; End
  JZX wr_cur_end
  CMPI R1, #134 ; PageUp
  JZX wr_cur_pgup
  CMPI R1, #135 ; PageDown
  JZX wr_cur_pgdn

  ; Map CR (13) to LF (10)
  CMPI R1, #13
  JNZX wr_chk_ins
  LI R1, #10
wr_chk_ins:
  CMPI R1, #10
  JZX wr_do_ins
  CMPI R1, #32
  JNX wr_ev_lp
  CMPI R1, #126
  JPX wr_ev_lp

wr_do_ins:
  ; Insert char R1 at cursor_pos (+5023), shifting doc_buf[cursor_pos..doc_len] right by 1
  ADDI R6, R8, #5000
  LW R2, R6, #20 ; doc_len
  LI R0, #3700
  CMP R2, R0
  JNNX wr_ev_lp
  LW R3, R6, #23 ; cursor_pos
  ; Shift backwards from i = doc_len down to cursor_pos
  MOV R4, R2 ; i = doc_len
  ADDI R5, R8, #6000
wr_ins_sh_lp:
  CMP R4, R3
  JNX wr_ins_put
  ADD R0, R5, R4
  LT R7, R0, #0
  ST R7, R0, #1
  SUBI R4, R4, #1
  JMPX wr_ins_sh_lp
wr_ins_put:
  ADD R0, R5, R3
  ST R1, R0, #0
  ADDI R2, R2, #1
  SW R2, R6, #20 ; doc_len++
  ADDI R3, R3, #1
  SW R3, R6, #23 ; cursor_pos++
  LI R0, #1
  ST R0, R6, #29 ; dirty = 1
  JMPX wr_ev_lp

wr_trig_fault:
  LI R1, #100
  LI R0, #999
  ST R0, R1, #0
  JMPX wr_ev_lp
wr_trig_loop:
  JMPX wr_trig_loop

wr_do_bs:
  ADDI R6, R8, #5000
  LW R3, R6, #23 ; cursor_pos
  CMPI R3, #0
  JNPX wr_ev_lp
  SUBI R3, R3, #1
  SW R3, R6, #23
  JMPX wr_do_del

wr_do_del:
  ADDI R6, R8, #5000
  LW R2, R6, #20 ; doc_len
  LW R3, R6, #23 ; cursor_pos
  CMP R3, R2
  JNNX wr_ev_lp
  ; Shift doc_buf[cursor_pos + 1 .. doc_len] left by 1 using BCOPY
  ADDI R5, R8, #6000
  ADD R0, R5, R3 ; dst = &doc_buf[cursor_pos]
  ADDI R1, R0, #1 ; src = &doc_buf[cursor_pos + 1]
  SUB R4, R2, R3 ; count = doc_len - cursor_pos (includes null terminator)
  BCOPY R0, R1, R4
  SUBI R2, R2, #1
  SW R2, R6, #20 ; doc_len--
  LI R0, #1
  ST R0, R6, #29 ; dirty = 1
  JMPX wr_ev_lp

wr_cur_left:
  ADDI R6, R8, #5000
  LW R3, R6, #23
  CMPI R3, #0
  JNPX wr_ev_lp
  SUBI R3, R3, #1
  SW R3, R6, #23
  LI R0, #1
  ST R0, R6, #29
  JMPX wr_ev_lp

wr_cur_right:
  ADDI R6, R8, #5000
  LW R2, R6, #20
  LW R3, R6, #23
  CMP R3, R2
  JNNX wr_ev_lp
  ADDI R3, R3, #1
  SW R3, R6, #23
  LI R0, #1
  ST R0, R6, #29
  JMPX wr_ev_lp

wr_cur_up:
  CALLX wr_recompute_layout
  ADDI R6, R8, #5000
  LT R0, R6, #30 ; cur_line (1-based)
  CMPI R0, #1
  JNPX wr_ev_lp
  SUBI R0, R0, #2 ; target 0-based line = cur_line - 2
  JMPX wr_move_to_line_col

wr_cur_down:
  CALLX wr_recompute_layout
  ADDI R6, R8, #5000
  LT R0, R6, #30 ; cur_line (1-based)
  LT R1, R6, #33 ; total_lines
  CMP R0, R1
  JNNX wr_ev_lp
  ; target 0-based line = cur_line
  JMPX wr_move_to_line_col

wr_cur_pgup:
  CALLX wr_recompute_layout
  ADDI R6, R8, #5000
  LT R0, R6, #30
  SUBI R0, R0, #9 ; (cur_line - 1) - 8
  CMPI R0, #0
  JNNX wr_move_to_line_col
  LI R0, #0
  JMPX wr_move_to_line_col

wr_cur_pgdn:
  CALLX wr_recompute_layout
  ADDI R6, R8, #5000
  LT R0, R6, #30
  ADDI R0, R0, #7 ; (cur_line - 1) + 8
  LT R1, R6, #33 ; total_lines
  SUBI R1, R1, #1
  CMP R0, R1
  JNPX wr_move_to_line_col
  MOV R0, R1

wr_move_to_line_col:
  ; R0 = target 0-based visual line index; preserve cur_col (1-based at +5031)
  ADDI R6, R8, #5000
  LT R1, R6, #31
  SUBI R1, R1, #1 ; 0-based col
  ADDI R2, R8, #5100
  ADD R2, R2, R0
  LT R3, R2, #0 ; line_start[R0]
  ADDI R2, R8, #5400
  ADD R2, R2, R0
  LT R4, R2, #0 ; line_end[R0]
  ADD R3, R3, R1
  CMP R3, R4
  JNPX wmtlc_ok
  MOV R3, R4
wmtlc_ok:
  SW R3, R6, #23 ; cursor_pos
  LI R0, #1
  ST R0, R6, #29
  JMPX wr_ev_lp

wr_cur_home:
  CALLX wr_recompute_layout
  ADDI R6, R8, #5000
  LT R0, R6, #30
  SUBI R0, R0, #1
  ADDI R2, R8, #5100
  ADD R2, R2, R0
  LT R3, R2, #0
  SW R3, R6, #23
  LI R0, #1
  ST R0, R6, #29
  JMPX wr_ev_lp

wr_cur_end:
  CALLX wr_recompute_layout
  ADDI R6, R8, #5000
  LT R0, R6, #30
  SUBI R0, R0, #1
  ADDI R2, R8, #5400
  ADD R2, R2, R0
  LT R3, R2, #0
  SW R3, R6, #23
  LI R0, #1
  ST R0, R6, #29
  JMPX wr_ev_lp

wr_start_open:
  ADDI R6, R8, #5000
  LI R0, #1
  ST R0, R6, #27 ; mode = 1 (open)
  LI R0, #0
  ST R0, R6, #28 ; fn_len = 0
  JMPX wr_ev_lp

wr_start_saveas:
  ADDI R6, R8, #5000
  LI R0, #2
  ST R0, R6, #27 ; mode = 2 (saveas)
  LI R0, #0
  ST R0, R6, #28 ; fn_len = 0
  JMPX wr_ev_lp

wr_key_fn_mode:
  ; R1 = key while typing filename for OPEN (mode=1) or SAVE-AS (mode=2)
  CMPI R1, #13
  JZX wr_fn_commit
  CMPI R1, #10
  JZX wr_fn_commit
  LT R2, R6, #28 ; fn_len
  CMPI R2, #8
  JNNX wr_ev_lp
  ADD R3, R6, R2
  ST R1, R3, #0
  LI R4, #0
  ST R4, R3, #1
  ADDI R2, R2, #1
  ST R2, R6, #28
  JMPX wr_ev_lp

wr_fn_commit:
  LT R0, R6, #27 ; mode (1=open, 2=saveas)
  LI R1, #0
  ST R1, R6, #27 ; back to mode 0
  CMPI R0, #1
  JZX wr_do_open
  JMPX wr_do_save

wr_do_save:
  ADDI R0, R8, #5000 ; filename
  ADDI R1, R8, #6000 ; doc_buf
  LW R2, R0, #20     ; doc_len
  LI R3, #1
  SYSCALL #32
  ADDI R6, R8, #5029
  LI R0, #1
  ST R0, R6, #0
  JMPX wr_ev_lp

wr_do_open:
  ADDI R0, R8, #5000
  ADDI R1, R8, #6000
  LI R2, #3700
  SYSCALL #31
  CMPI R0, #0
  JNX wr_ev_lp
  ADDI R6, R8, #5000
  SW R0, R6, #20 ; doc_len = R0
  LI R1, #0
  SW R1, R6, #23 ; cursor_pos = 0
  ST R1, R6, #26 ; scroll_row = 0
  LI R1, #1
  ST R1, R6, #29 ; dirty = 1
  JMPX wr_ev_lp

; wr_recompute_layout: computes greedy 24-col word wrap line_starts/line_ends, cursor (line, col), scroll_row, and word_cnt
wr_recompute_layout:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7

  ADDI R6, R8, #5000
  LW R2, R6, #20 ; doc_len
  ADDI R5, R8, #6000 ; doc_buf

  ; 1. Compute word_cnt
  LI R0, #0 ; i = 0
  LI R1, #0 ; in_word = 0
  LI R3, #0 ; words = 0
wrl_wc_lp:
  CMP R0, R2
  JNNX wrl_wc_done
  ADD R4, R5, R0
  LT R4, R4, #0
  CMPI R4, #32
  JZX wrl_wc_sp
  CMPI R4, #10
  JZX wrl_wc_sp
  CMPI R1, #0
  JNZX wrl_wc_nx
  LI R1, #1
  ADDI R3, R3, #1
  JMPX wrl_wc_nx
wrl_wc_sp:
  LI R1, #0
wrl_wc_nx:
  ADDI R0, R0, #1
  JMPX wrl_wc_lp
wrl_wc_done:
  ST R3, R6, #32 ; word_cnt

  ; 2. Compute wrapped visual lines (width = 24 chars)
  LI R0, #0 ; pos = 0
  LI R1, #0 ; line_idx = 0
wrl_ln_lp:
  ADDI R3, R8, #5100
  ADD R3, R3, R1
  ST R0, R3, #0 ; line_starts[line_idx] = pos
  CMP R0, R2
  JNNX wrl_ln_empty_end

  ; Scan up to 24 chars from pos (R0)
  MOV R3, R0 ; scan = pos
  LI R4, #-1 ; last_space = -1
  ADDI R7, R0, #24 ; limit = pos + 24
  CMP R7, R2
  JNPX wrl_sc_lp
  MOV R7, R2
wrl_sc_lp:
  CMP R3, R7
  JNNX wrl_sc_lim
  ADD R4, R5, R3
  LT R4, R4, #0 ; ch = doc_buf[scan]
  CMPI R4, #10 ; newline?
  JZX wrl_sc_nl
  ADDI R3, R3, #1
  JMPX wrl_sc_lp

wrl_sc_nl:
  ; Line ends at R3, next line starts at R3 + 1
  ADDI R4, R8, #5400
  ADD R4, R4, R1
  ST R3, R4, #0 ; line_ends[line_idx] = R3
  ADDI R0, R3, #1
  ADDI R1, R1, #1
  CMP R0, R2
  JNPX wrl_ln_lp
  JMPX wrl_ln_done

wrl_sc_lim:
  ; Reached limit R7 without newline. If R7 == doc_len, line ends at R7!
  CMP R7, R2
  JZX wrl_sc_eof
  ; Otherwise, look backwards from R7 down to R0 + 1 for a space (32) to word-wrap!
  MOV R4, R7
wrl_bk_lp:
  CMP R4, R0
  JNPX wrl_hard_wrap
  ADD R3, R5, R4
  LT R3, R3, #0
  CMPI R3, #32
  JZX wrl_wrap_sp
  SUBI R4, R4, #1
  JMPX wrl_bk_lp
wrl_wrap_sp:
  ADDI R3, R8, #5400
  ADD R3, R3, R1
  ST R4, R3, #0 ; line_ends[line_idx] = space_pos
  ADDI R0, R4, #1 ; next line starts after space
  ADDI R1, R1, #1
  JMPX wrl_ln_lp

wrl_hard_wrap:
  ADDI R3, R8, #5400
  ADD R3, R3, R1
  ST R7, R3, #0
  MOV R0, R7
  ADDI R1, R1, #1
  JMPX wrl_ln_lp

wrl_sc_eof:
  ADDI R3, R8, #5400
  ADD R3, R3, R1
  ST R2, R3, #0
  ADDI R1, R1, #1
  JMPX wrl_ln_done

wrl_ln_empty_end:
  ADDI R3, R8, #5400
  ADD R3, R3, R1
  ST R0, R3, #0
  ADDI R1, R1, #1

wrl_ln_done:
  ST R1, R6, #33 ; total_lines = R1

  ; 3. Locate cursor_pos (+5023) in visual lines 0..R1-1
  LW R2, R6, #23 ; cursor_pos
  LI R0, #0 ; l = 0
wrl_cur_lp:
  ADDI R3, R0, #1
  CMP R3, R1
  JNNX wrl_cur_found
  ADDI R4, R8, #5100
  ADD R4, R4, R3
  LT R4, R4, #0 ; next line start
  CMP R2, R4
  JNX wrl_cur_found
  ADDI R0, R0, #1
  JMPX wrl_cur_lp
wrl_cur_found:
  ADDI R4, R8, #5100
  ADD R4, R4, R0
  LT R4, R4, #0 ; line_start[l]
  SUB R3, R2, R4
  ADDI R3, R3, #1 ; 1-based col
  ST R3, R6, #31
  ADDI R3, R0, #1 ; 1-based line
  ST R3, R6, #30

  ; Adjust scroll_row (+5026) so 0-based line R0 is in [scroll_row, scroll_row + 7]
  LT R4, R6, #26 ; scroll_row
  CMP R0, R4
  JNNX wrl_sc_chk_bot
  ST R0, R6, #26
  JMPX wrl_done
wrl_sc_chk_bot:
  SUBI R5, R0, #7
  CMP R4, R5
  JNNX wrl_done
  ST R5, R6, #26

wrl_done:
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

wr_redraw:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7

  ; Clear window body
  LI R0, #0
  LI R1, #0
  LI R2, #226
  LI R3, #127
  LI R4, #-310
  SYSCALL #20

  ; Toolbar at (4, 2)
  LI R0, #4
  LI R1, #2
  LI R2, #str_wr_bar - app8_write_rom
  ADD R2, R2, R8
  LI R3, #COL_WHITE
  LI R4, #-230
  SYSCALL #21

  ; Text area background (4, 15, 218, 88)
  LI R0, #4
  LI R1, #15
  LI R2, #218
  LI R3, #88
  LI R4, #-340
  SYSCALL #20

  ; Draw up to 8 visible wrapped lines starting at scroll_row
  ADDI R6, R8, #5000
  LT R4, R6, #26 ; scroll_row
  LT R5, R6, #33 ; total_lines
  LI R7, #0 ; vis_r = 0..7
wrd_ln_lp:
  CMPI R7, #8
  JNNX wrd_status
  ADD R0, R4, R7 ; line_idx = scroll_row + vis_r
  CMP R0, R5
  JNNX wrd_status

  ; Copy doc_buf[line_start..line_end-1] into line_scratch (UBASE + 5040)
  ADDI R1, R8, #5100
  ADD R1, R1, R0
  LT R1, R1, #0 ; start
  ADDI R2, R8, #5400
  ADD R2, R2, R0
  LT R2, R2, #0 ; end
  SUB R3, R2, R1 ; len
  ADDI R0, R8, #5040
  ADDI R2, R8, #6000
  ADD R1, R2, R1
  BCOPY R0, R1, R3
  LI R1, #0
  ST R1, R0, #0 ; null-terminate

  LI R0, #6
  MULI R1, R7, #10
  ADDI R1, R1, #18 ; y = 18 + vis_r * 10
  ADDI R2, R8, #5040
  LI R3, #COL_WHITE
  LI R4, #-340
  SYSCALL #21
  ADDI R6, R8, #5000
  LT R4, R6, #26
  LT R5, R6, #33
  ADDI R7, R7, #1
  JMPX wrd_ln_lp

wrd_status:
  ; Draw status bar at y=108: "L:<line> C:<col> W:<words>"
  LI R0, #4
  LI R1, #108
  LI R2, #str_wr_st_l - app8_write_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-310
  SYSCALL #21

  ADDI R6, R8, #5000
  LT R2, R6, #30 ; cur_line
  LI R0, #20
  LI R1, #108
  LI R3, #10
  LI R4, #COL_YELLOW
  LI R5, #-310
  SYSCALL #26

  LI R0, #56
  LI R1, #108
  LI R2, #str_wr_st_c - app8_write_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-310
  SYSCALL #21

  LT R2, R6, #31 ; cur_col
  LI R0, #72
  LI R1, #108
  LI R3, #10
  LI R4, #COL_YELLOW
  LI R5, #-310
  SYSCALL #26

  LI R0, #104
  LI R1, #108
  LI R2, #str_wr_st_w - app8_write_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-310
  SYSCALL #21

  LT R2, R6, #32 ; word_cnt
  LI R0, #120
  LI R1, #108
  LI R3, #10
  LI R4, #COL_GREEN
  LI R5, #-310
  SYSCALL #26

  LI R0, #160
  LI R1, #108
  ADDI R2, R8, #5000 ; filename
  LI R3, #COL_WHITE
  LI R4, #-310
  SYSCALL #21

  LI R0, #0
  LI R1, #0
  LI R2, #0
  LI R3, #0
  SYSCALL #24
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

str_wr_title: .stringz "WRITE"
str_wr_bar:   .stringz "[OPEN] [SAVE] [SAVEAS]"
str_wr_st_l:  .stringz "L:"
str_wr_st_c:  .stringz "C:"
str_wr_st_w:  .stringz "W:"
app8_write_end:

; ----------------------------------------------------------------------------
; APP 9: SHEET SPREADSHEET (APP_ID = 9)
; 10 columns x 30 rows (A1..J30 = 300 cells).
; Cell holds integer, text, or formula: =, + - * /, ( ), cell refs, SUM(A1:B9), MIN, MAX.
; Recalculates on edit, detects circular references (#CYCLE!) and division by zero (#DIV/0!).
; Saves/loads documented plain-text format ("SHEET" on disk: <Col><Row>:<raw>=<val>).
; Memory layout (relative to R8 = UBASE):
;   +5000: cur_col (0..9)
;   +5001: cur_row (0..29)
;   +5002: in_len (0..31)
;   +5003: dirty
;   +5010..5049: in_buf (40 trytes: supports "@A1 =1+2" or direct cell typing)
;   +5050..5065: sheet_fn ("SHEET")
;   +5100..5399: CELL_TYPE[0..299] (0=empty, 1=num, 2=text, 3=#DIV/0!, 4=#CYCLE!)
;   +5400..5699: CELL_VISIT[0..299] (0=unvisited, 1=visiting, 2=done)
;   +5700..6599: CELL_VAL[0..299] (300 * 3-tryte words = 900 trytes)
;   +6600..13799: FORMULA_BUF[0..299] (300 * 24 trytes = 7,200 trytes)
;   +14000..22000: file_io_buf (for saving/loading plain-text "SHEET")
; ----------------------------------------------------------------------------
app9_sheet_rom:
  LI R0, #80
  LI R1, #28
  LI R2, #236
  LI R3, #140
  LI R4, #str_sh_title - app9_sheet_rom
  ADD R4, R4, R8
  LI R5, #-315
  SYSCALL #10

  ADDI R6, R8, #5050
  LI R0, #'S'
  ST R0, R6, #0
  LI R0, #'H'
  ST R0, R6, #1
  LI R0, #'E'
  ST R0, R6, #2
  LI R0, #'E'
  ST R0, R6, #3
  LI R0, #'T'
  ST R0, R6, #4
  LI R0, #0
  ST R0, R6, #5

  CALLX sh_clear_all
  CALLX sh_redraw

sh_ev_lp:
  SYSCALL #25
  CMPI R0, #0
  JZX sh_idle
  CMPI R0, #1
  JZX sh_on_key
  CMPI R0, #2
  JZX sh_on_click
  JMPX sh_ev_lp

sh_idle:
  ADDI R6, R8, #5003
  LT R0, R6, #0
  CMPI R0, #0
  JZX sh_do_yield
  LI R0, #0
  ST R0, R6, #0
  CALLX sh_recalc_all
  CALLX sh_redraw
sh_do_yield:
  SYSCALL #2
  JMPX sh_ev_lp

sh_on_click:
  CMPI R2, #13
  JNNX sh_click_grid
  CMPI R1, #50
  JNX sh_do_save
  CMPI R1, #100
  JNX sh_do_load
  CALLX sh_clear_all
  ADDI R6, R8, #5003
  LI R0, #1
  ST R0, R6, #0
  JMPX sh_ev_lp

sh_click_grid:
  ; Grid cells: cols 0..3 at x = 24 + c*46, rows 0..6 at y = 36 + r*12
  CMPI R1, #24
  JNX sh_ev_lp
  CMPI R2, #36
  JNX sh_ev_lp
  SUBI R0, R1, #24
  LI R3, #46
  DIV R0, R0, R3
  CMPI R0, #4
  JNNX sh_ev_lp
  SUBI R3, R2, #36
  LI R4, #12
  DIV R3, R3, R4
  CMPI R3, #7
  JNNX sh_ev_lp
  ADDI R6, R8, #5000
  ST R0, R6, #0 ; cur_col
  ST R3, R6, #1 ; cur_row
  LI R0, #1
  ST R0, R6, #3 ; dirty
  JMPX sh_ev_lp

sh_on_key:
  CMPI R1, #200
  JZX sh_trig_fault
  CMPI R1, #201
  JZX sh_trig_loop

  CMPI R1, #19 ; Ctrl+S -> save
  JZX sh_do_save
  CMPI R1, #12 ; Ctrl+L -> load
  JZX sh_do_load
  CMPI R1, #14 ; Ctrl+N -> clear all
  JZX sh_cmd_clear

  CMPI R1, #128 ; Left
  JZX sh_nav_left
  CMPI R1, #129 ; Right
  JZX sh_nav_right
  CMPI R1, #9   ; Tab -> Right
  JZX sh_nav_right
  CMPI R1, #130 ; Up
  JZX sh_nav_up
  CMPI R1, #131 ; Down
  JZX sh_nav_down

  CMPI R1, #13
  JZX sh_commit_in
  CMPI R1, #10
  JZX sh_commit_in
  CMPI R1, #8
  JZX sh_in_bs

  ADDI R6, R8, #5000
  LT R2, R6, #2 ; in_len
  CMPI R2, #34
  JNNX sh_ev_lp
  ADDI R3, R6, #10
  ADD R3, R3, R2
  ST R1, R3, #0
  LI R0, #0
  ST R0, R3, #1
  ADDI R2, R2, #1
  ST R2, R6, #2
  JMPX sh_ev_lp

sh_trig_fault:
  LI R1, #100
  LI R0, #999
  ST R0, R1, #0
  JMPX sh_ev_lp
sh_trig_loop:
  JMPX sh_trig_loop

sh_cmd_clear:
  CALLX sh_clear_all
  JMPX sh_ev_lp

sh_in_bs:
  ADDI R6, R8, #5000
  LT R2, R6, #2
  CMPI R2, #0
  JNPX sh_ev_lp
  SUBI R2, R2, #1
  ST R2, R6, #2
  ADDI R3, R6, #10
  ADD R3, R3, R2
  LI R0, #0
  ST R0, R3, #0
  JMPX sh_ev_lp

sh_nav_left:
  ADDI R6, R8, #5000
  LT R0, R6, #0
  CMPI R0, #0
  JNPX sh_ev_lp
  SUBI R0, R0, #1
  ST R0, R6, #0
  LI R0, #1
  ST R0, R6, #3
  JMPX sh_ev_lp

sh_nav_right:
  ADDI R6, R8, #5000
  LT R0, R6, #0
  CMPI R0, #9
  JNNX sh_ev_lp
  ADDI R0, R0, #1
  ST R0, R6, #0
  LI R0, #1
  ST R0, R6, #3
  JMPX sh_ev_lp

sh_nav_up:
  ADDI R6, R8, #5000
  LT R0, R6, #1
  CMPI R0, #0
  JNPX sh_ev_lp
  SUBI R0, R0, #1
  ST R0, R6, #1
  LI R0, #1
  ST R0, R6, #3
  JMPX sh_ev_lp

sh_nav_down:
  ADDI R6, R8, #5000
  LT R0, R6, #1
  CMPI R0, #29
  JNNX sh_ev_lp
  ADDI R0, R0, #1
  ST R0, R6, #1
  LI R0, #1
  ST R0, R6, #3
  JMPX sh_ev_lp

sh_commit_in:
  ; Commit in_buf (+5010):
  ; If in_buf starts with '@', format is "@<Col><Row> <content>" (sets cur_col, cur_row and stores <content>)
  ; Otherwise stores in_buf into (cur_col, cur_row).
  ADDI R6, R8, #5000
  LT R0, R6, #2 ; in_len
  CMPI R0, #0
  JNPX sh_ev_lp
  ADDI R1, R6, #10 ; &in_buf[0]
  LT R0, R1, #0
  CMPI R0, #'@'
  JNZX sh_commit_cur
  ADDI R1, R1, #1
  CALLX sh_parse_cell_ref ; advances R1, returns R0 = cell_idx (row*10 + col)
  CMPI R0, #0
  JNX sh_clear_in
  LI R2, #10
  DIV R3, R0, R2 ; row
  MOD R2, R0, R2 ; col
  ST R2, R6, #0 ; cur_col
  ST R3, R6, #1 ; cur_row
  ; Skip single space or ':' after cell ref
  LT R2, R1, #0
  CMPI R2, #32
  JZX sh_sk1
  CMPI R2, #':'
  JNZX sh_store_cell
sh_sk1:
  ADDI R1, R1, #1
  JMPX sh_store_cell

sh_commit_cur:
  LT R2, R6, #0 ; cur_col
  LT R3, R6, #1 ; cur_row
  MULI R0, R3, #10
  ADD R0, R0, R2 ; cell_idx

sh_store_cell:
  ; Copy up to 23 chars from R1 into FORMULA_BUF + R0 * 24
  MULI R2, R0, #24
  ADDI R2, R2, #6600
  ADD R2, R2, R8
  LI R3, #23
sh_sc_lp:
  CMPI R3, #0
  JNPX sh_sc_term
  LT R4, R1, #0
  CMPI R4, #0
  JZX sh_sc_term
  ST R4, R2, #0
  ADDI R1, R1, #1
  ADDI R2, R2, #1
  SUBI R3, R3, #1
  JMPX sh_sc_lp
sh_sc_term:
  LI R4, #0
  ST R4, R2, #0
  ADDI R6, R8, #5000
  LI R0, #1
  ST R0, R6, #3 ; dirty = 1

sh_clear_in:
  ADDI R6, R8, #5000
  LI R0, #0
  ST R0, R6, #2 ; in_len = 0
  ST R0, R6, #10 ; in_buf[0] = 0
  JMPX sh_ev_lp

sh_clear_all:
  PUSH R0
  PUSH R1
  PUSH R2
  ADDI R0, R8, #5000
  LI R1, #0
  ST R1, R0, #0
  ST R1, R0, #1
  ST R1, R0, #2
  ST R1, R0, #3
  ST R1, R0, #10
  ADDI R0, R8, #5100
  LI R1, #0
  LI R2, #1500
  BFILL R0, R1, R2
  ADDI R0, R8, #6600
  LI R1, #0
  LI R2, #300
sca_fb_lp:
  CMPI R2, #0
  JNPX sca_fb_dn
  ST R1, R0, #0
  ADDI R0, R0, #24
  SUBI R2, R2, #1
  JMPX sca_fb_lp
sca_fb_dn:
  POP R2
  POP R1
  POP R0
  RET

; sh_recalc_all: clears CELL_VISIT[0..299] and evaluates all 300 cells
sh_recalc_all:
  PUSH R0
  PUSH R1
  PUSH R2
  ADDI R0, R8, #5400
  LI R1, #0
  LI R2, #300
  BFILL R0, R1, R2
  LI R0, #0 ; cell_idx = 0..299
sra_lp:
  CMPI R0, #300
  JNNX sra_done
  MULI R1, R0, #24
  ADDI R1, R1, #6600
  ADD R1, R1, R8
  LT R1, R1, #0
  CMPI R1, #0
  JZX sra_nx
  CALLX sh_eval_cell
sra_nx:
  ADDI R0, R0, #1
  JMPX sra_lp
sra_done:
  POP R2
  POP R1
  POP R0
  RET

; sh_eval_cell: R0 = cell_idx (0..299) -> returns R2 = evaluated value, R3 = error (0=ok, 3=div0, 4=cycle)
sh_eval_cell:
  PUSH R0
  PUSH R1
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  MOV R4, R0 ; cell_idx

  ; Check CELL_VISIT[cell_idx]
  ADDI R1, R8, #5400
  ADD R1, R1, R4
  LT R0, R1, #0
  CMPI R0, #2
  JZX sec_memoized
  CMPI R0, #1
  JZX sec_cycle

  ; Mark CELL_VISIT[cell_idx] = 1 (visiting)
  LI R0, #1
  ST R0, R1, #0

  ; Inspect FORMULA_BUF + cell_idx * 24
  MULI R5, R4, #24
  ADDI R5, R5, #6600
  ADD R5, R5, R8
  LT R0, R5, #0
  CMPI R0, #0
  JZX sec_empty
  CMPI R0, #'='
  JZX sec_formula

  ; Check if literal signed integer or text
  MOV R6, R5
  CALLX sh_try_parse_int ; returns R0 = val, R1 = 1 if valid integer else 0
  CMPI R1, #1
  JZX sec_store_num
  ; Literal text!
  ADDI R1, R8, #5100
  ADD R1, R1, R4
  LI R0, #2 ; CELL_TYPE = 2 (text)
  ST R0, R1, #0
  MULI R1, R4, #3
  ADDI R1, R1, #5700
  ADD R1, R1, R8
  LI R0, #0
  SW R0, R1, #0
  ADDI R1, R8, #5400
  ADD R1, R1, R4
  LI R0, #2
  ST R0, R1, #0
  LI R2, #0
  LI R3, #0
  JMPX sec_ret

sec_empty:
  ADDI R1, R8, #5100
  ADD R1, R1, R4
  LI R0, #0
  ST R0, R1, #0
  MULI R1, R4, #3
  ADDI R1, R1, #5700
  ADD R1, R1, R8
  SW R0, R1, #0
  ADDI R1, R8, #5400
  ADD R1, R1, R4
  LI R0, #2
  ST R0, R1, #0
  LI R2, #0
  LI R3, #0
  JMPX sec_ret

sec_formula:
  ADDI R6, R5, #1 ; expr cursor past '='
  LI R7, #0       ; error accumulator = 0
  CALLX sh_parse_expr ; returns R0 = val, R7 = error
  CMPI R7, #0
  JNZX sec_store_err

sec_store_num:
  ADDI R1, R8, #5100
  ADD R1, R1, R4
  LI R2, #1 ; CELL_TYPE = 1 (number)
  ST R2, R1, #0
  MULI R1, R4, #3
  ADDI R1, R1, #5700
  ADD R1, R1, R8
  SW R0, R1, #0
  ADDI R1, R8, #5400
  ADD R1, R1, R4
  LI R2, #2
  ST R2, R1, #0
  MOV R2, R0
  LI R3, #0
  JMPX sec_ret

sec_store_err:
  ADDI R1, R8, #5100
  ADD R1, R1, R4
  ST R7, R1, #0 ; CELL_TYPE = 3 (#DIV/0!) or 4 (#CYCLE!)
  MULI R1, R4, #3
  ADDI R1, R1, #5700
  ADD R1, R1, R8
  LI R0, #0
  SW R0, R1, #0
  ADDI R1, R8, #5400
  ADD R1, R1, R4
  LI R0, #2
  ST R0, R1, #0
  LI R2, #0
  MOV R3, R7
  JMPX sec_ret

sec_cycle:
  ADDI R1, R8, #5100
  ADD R1, R1, R4
  LI R0, #4 ; #CYCLE!
  ST R0, R1, #0
  MULI R1, R4, #3
  ADDI R1, R1, #5700
  ADD R1, R1, R8
  LI R0, #0
  SW R0, R1, #0
  ADDI R1, R8, #5400
  ADD R1, R1, R4
  LI R0, #2
  ST R0, R1, #0
  LI R2, #0
  LI R3, #4
  JMPX sec_ret

sec_memoized:
  ADDI R1, R8, #5100
  ADD R1, R1, R4
  LT R3, R1, #0 ; CELL_TYPE
  MULI R1, R4, #3
  ADDI R1, R1, #5700
  ADD R1, R1, R8
  LW R2, R1, #0 ; CELL_VAL
  CMPI R3, #3
  JNNX sec_ret ; error 3 or 4
  LI R3, #0
sec_ret:
  POP R7
  POP R6
  POP R5
  POP R4
  POP R1
  POP R0
  RET

; sh_try_parse_int: R6 = str_ptr -> R0 = val, R1 = 1 if entire string is signed decimal integer else 0
sh_try_parse_int:
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R6
  LI R2, #1 ; sign = +1
  LT R0, R6, #0
  CMPI R0, #'+'
  JZX stpi_sk_s
  CMPI R0, #'-'
  JNZX stpi_chk_d
  LI R2, #-1
stpi_sk_s:
  ADDI R6, R6, #1
stpi_chk_d:
  LT R0, R6, #0
  CMPI R0, #48
  JNX stpi_no
  CMPI R0, #57
  JPX stpi_no
  LI R3, #0 ; acc = 0
stpi_lp:
  LT R0, R6, #0
  CMPI R0, #0
  JZX stpi_ok
  CMPI R0, #48
  JNX stpi_no
  CMPI R0, #57
  JPX stpi_no
  SUBI R0, R0, #48
  MULI R3, R3, #10
  ADD R3, R3, R0
  ADDI R6, R6, #1
  JMPX stpi_lp
stpi_ok:
  MUL R0, R3, R2
  LI R1, #1
  JMPX stpi_ret
stpi_no:
  LI R0, #0
  LI R1, #0
stpi_ret:
  POP R6
  POP R4
  POP R3
  POP R2
  RET

sh_skip_sp:
  PUSH R0
sh_ss_lp:
  LT R0, R6, #0
  CMPI R0, #32
  JNZX sh_ss_ret
  ADDI R6, R6, #1
  JMPX sh_ss_lp
sh_ss_ret:
  POP R0
  RET

; __SHEET_EXPR_PARSER__

sh_parse_factor:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  CALLX sh_skip_sp
  LT R0, R6, #0
  CMPI R0, #'+'
  JZX spf_uplus
  CMPI R0, #'-'
  JZX spf_uminus
  CMPI R0, #'('
  JZX spf_paren

  ; Check for SUM(, MIN(, MAX(
  CMPI R0, #'S'
  JZX spf_func_sum
  CMPI R0, #'s'
  JZX spf_func_sum
  CMPI R0, #'M'
  JZX spf_func_m
  CMPI R0, #'m'
  JZX spf_func_m

  ; Check for CellRef ('A'..'J' or 'a'..'j')
  CMPI R0, #'a'
  JNX spf_chk_ucol
  CMPI R0, #'j'
  JPX spf_num
  JMPX spf_cell_ref
spf_chk_ucol:
  CMPI R0, #'A'
  JNX spf_num
  CMPI R0, #'J'
  JNPX spf_cell_ref

spf_num:
  LI R0, #0
spf_num_lp:
  LT R1, R6, #0
  CMPI R1, #48
  JNX spf_ret
  CMPI R1, #57
  JPX spf_ret
  SUBI R1, R1, #48
  MULI R0, R0, #10
  ADD R0, R0, R1
  ADDI R6, R6, #1
  JMPX spf_num_lp

spf_uplus:
  ADDI R6, R6, #1
  CALLX sh_parse_factor
  JMPX spf_ret

spf_uminus:
  ADDI R6, R6, #1
  CALLX sh_parse_factor
  NEG R0, R0
  JMPX spf_ret

spf_paren:
  ADDI R6, R6, #1
  CALLX sh_parse_expr
  CALLX sh_skip_sp
  LT R1, R6, #0
  CMPI R1, #')'
  JNZX spf_ret
  ADDI R6, R6, #1
  JMPX spf_ret

spf_cell_ref:
  MOV R1, R6
  CALLX sh_parse_cell_ref
  MOV R6, R1
  CMPI R0, #0
  JNX spf_zero_ret
  PUSH R6
  PUSH R7
  CALLX sh_eval_cell ; R2 = val, R3 = err
  POP R7
  POP R6
  CMPI R3, #0
  JZX spf_cr_ok
  CMPI R3, #4
  JZX spf_cr_set_err
  CMPI R7, #0
  JNZX spf_cr_ok
spf_cr_set_err:
  MOV R7, R3
spf_cr_ok:
  MOV R0, R2
  JMPX spf_ret

spf_zero_ret:
  LI R0, #0
  JMPX spf_ret

spf_func_sum:
  LI R5, #0 ; op = 0 (SUM)
  ADDI R6, R6, #4 ; skip "SUM("
  JMPX spf_func_range
spf_func_m:
  LT R1, R6, #1
  LI R5, #1 ; op = 1 (MIN)
  CMPI R1, #'I'
  JZX spf_func_m_go
  CMPI R1, #'i'
  JZX spf_func_m_go
  LI R5, #2 ; op = 2 (MAX)
spf_func_m_go:
  ADDI R6, R6, #4 ; skip "MIN(" or "MAX("

spf_func_range:
  ; Parse first cell ref: c1, r1
  MOV R1, R6
  CALLX sh_parse_cell_ref ; R0 = r1*10 + c1
  MOV R6, R1
  MOV R2, R0 ; start_idx
  LT R0, R6, #0
  CMPI R0, #':'
  JNZX spf_fr_p2
  ADDI R6, R6, #1
spf_fr_p2:
  MOV R1, R6
  CALLX sh_parse_cell_ref ; R0 = r2*10 + c2
  MOV R6, R1
  MOV R3, R0 ; end_idx
  LT R0, R6, #0
  CMPI R0, #')'
  JNZX spf_fr_exec
  ADDI R6, R6, #1
spf_fr_exec:
  ; Decompose R2 -> (r1, c1) and R3 -> (r2, c2)
  ; Iterate r = r1 .. r2, c = c1 .. c2
  PUSH R6
  LI R0, #10
  DIV R1, R2, R0 ; r1
  MOD R2, R2, R0 ; c1
  DIV R4, R3, R0 ; r2
  MOD R3, R3, R0 ; c2
  ; Initialize accumulator in R6 and first_flag on stack
  LI R6, #0 ; acc = 0
  CMPI R5, #0
  JZX spf_fr_init_ok
  ; For MIN/MAX, initialize acc from first cell in range
  MULI R0, R1, #10
  ADD R0, R0, R2
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R7
  CALLX sh_eval_cell
  POP R7
  CMPI R3, #0
  JZX spf_fr_i0
  MOV R7, R3
spf_fr_i0:
  MOV R6, R2
  POP R3
  POP R2
  POP R1
spf_fr_init_ok:
  ; Loop r = R1 .. R4
spf_fr_rlp:
  CMP R1, R4
  JPX spf_fr_done
  PUSH R2 ; save c1
spf_fr_clp:
  CMP R2, R3
  JPX spf_fr_rnx
  MULI R0, R1, #10
  ADD R0, R0, R2
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R6
  PUSH R7
  CALLX sh_eval_cell ; R2 = val, R3 = err
  POP R7
  POP R6
  CMPI R3, #0
  JZX spf_fr_no_err
  CMPI R3, #4
  JZX spf_fr_st_err
  CMPI R7, #0
  JNZX spf_fr_no_err
spf_fr_st_err:
  MOV R7, R3
spf_fr_no_err:
  CMPI R5, #0
  JZX spf_fr_do_sum
  CMPI R5, #1
  JZX spf_fr_do_min
  ; MAX:
  CMP R2, R6
  JNPX spf_fr_cnx
  MOV R6, R2
  JMPX spf_fr_cnx
spf_fr_do_min:
  CMP R2, R6
  JNNX spf_fr_cnx
  MOV R6, R2
  JMPX spf_fr_cnx
spf_fr_do_sum:
  ADD R6, R6, R2
spf_fr_cnx:
  POP R3
  POP R2
  POP R1
  ADDI R2, R2, #1
  JMPX spf_fr_clp
spf_fr_rnx:
  POP R2 ; restore c1
  ADDI R1, R1, #1
  JMPX spf_fr_rlp
spf_fr_done:
  MOV R0, R6
  POP R6

spf_ret:
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

; sh_parse_cell_ref: R1 = str_ptr -> advances R1, returns R0 = row*10 + col (or -1 if invalid)
sh_parse_cell_ref:
  PUSH R2
  PUSH R3
  LT R0, R1, #0
  CMPI R0, #'a'
  JNX spcr_u
  CMPI R0, #'j'
  JPX spcr_bad
  SUBI R2, R0, #97 ; col 0..9
  JMPX spcr_row
spcr_u:
  CMPI R0, #'A'
  JNX spcr_bad
  CMPI R0, #'J'
  JPX spcr_bad
  SUBI R2, R0, #65 ; col 0..9
spcr_row:
  ADDI R1, R1, #1
  LI R3, #0 ; row_num
spcr_rlp:
  LT R0, R1, #0
  CMPI R0, #48
  JNX spcr_rdone
  CMPI R0, #57
  JPX spcr_rdone
  SUBI R0, R0, #48
  MULI R3, R3, #10
  ADD R3, R3, R0
  ADDI R1, R1, #1
  JMPX spcr_rlp
spcr_rdone:
  CMPI R3, #1
  JNX spcr_bad
  CMPI R3, #30
  JPX spcr_bad
  SUBI R3, R3, #1
  MULI R0, R3, #10
  ADD R0, R0, R2
  JMPX spcr_ret
spcr_bad:
  LI R0, #-1
spcr_ret:
  POP R3
  POP R2
  RET

; sh_do_save: serializes all non-empty cells to file_io_buf (UBASE + 14000) as "<Col><Row>:<raw>=<val>" and writes "SHEET"
sh_do_save:
  CALLX sh_recalc_all
  LI R5, #14000 - 19683
  LMI R5, #1 ; 14000
  ADD R5, R5, R8 ; dst ptr in file_io_buf
  LI R4, #0 ; cell_idx = 0..299
sds_cell_lp:
  CMPI R4, #300
  JNNX sds_wr_disk
  ADDI R0, R8, #5100
  ADD R0, R0, R4
  LT R6, R0, #0 ; CELL_TYPE
  CMPI R6, #0
  JZX sds_nx_cell

  ; Emit <Col> ('A' + cell_idx % 10)
  LI R0, #10
  MOD R1, R4, R0
  ADDI R1, R1, #65
  ST R1, R5, #0
  ADDI R5, R5, #1
  ; Emit <Row> (1 + cell_idx / 10)
  DIV R0, R4, R0
  ADDI R0, R0, #1
  CALLX sh_append_int
  ; Emit ':'
  LI R0, #':'
  ST R0, R5, #0
  ADDI R5, R5, #1
  ; Emit raw formula string from FORMULA_BUF + cell_idx * 24
  MULI R1, R4, #24
  ADDI R1, R1, #6600
  ADD R1, R1, R8
  CALLX sh_append_str
  ; Emit '='
  LI R0, #'='
  ST R0, R5, #0
  ADDI R5, R5, #1
  ; Emit evaluated value or error string
  CMPI R6, #1
  JZX sds_em_num
  CMPI R6, #2
  JZX sds_em_txt
  CMPI R6, #3
  JZX sds_em_div0
  ; #CYCLE!
  LI R1, #str_sh_cycle - app9_sheet_rom
  ADD R1, R1, R8
  CALLX sh_append_str
  JMPX sds_em_nl
sds_em_div0:
  LI R1, #str_sh_div0 - app9_sheet_rom
  ADD R1, R1, R8
  CALLX sh_append_str
  JMPX sds_em_nl
sds_em_txt:
  MULI R1, R4, #24
  ADDI R1, R1, #6600
  ADD R1, R1, R8
  CALLX sh_append_str
  JMPX sds_em_nl
sds_em_num:
  MULI R1, R4, #3
  ADDI R1, R1, #5700
  ADD R1, R1, R8
  LW R0, R1, #0
  CALLX sh_append_int
sds_em_nl:
  LI R0, #10
  ST R0, R5, #0
  ADDI R5, R5, #1
sds_nx_cell:
  ADDI R4, R4, #1
  JMPX sds_cell_lp

sds_wr_disk:
  LI R0, #0
  ST R0, R5, #0
  LI R1, #14000 - 19683
  LMI R1, #1
  ADD R1, R1, R8 ; start of file_io_buf
  SUB R2, R5, R1 ; byte length
  ADDI R0, R8, #5050 ; "SHEET"
  LI R3, #1
  SYSCALL #32
  JMPX sh_ev_lp

; sh_append_str: copies null-terminated string at R1 into R5, advancing R5
sh_append_str:
  PUSH R0
  PUSH R1
sas_lp:
  LT R0, R1, #0
  CMPI R0, #0
  JZX sas_done
  ST R0, R5, #0
  ADDI R1, R1, #1
  ADDI R5, R5, #1
  JMPX sas_lp
sas_done:
  POP R1
  POP R0
  RET

; sh_append_int: formats signed integer R0 in decimal at R5, advancing R5
sh_append_int:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  CMPI R0, #0
  JPX sai_pos
  JNX sai_neg
  LI R1, #'0'
  ST R1, R5, #0
  ADDI R5, R5, #1
  JMPX sai_done
sai_neg:
  LI R1, #'-'
  ST R1, R5, #0
  ADDI R5, R5, #1
  NEG R0, R0
sai_pos:
  ADDI R2, R8, #5070 ; reverse digit scratch
  LI R3, #0 ; count
  LI R4, #10
sai_lp:
  CMPI R0, #0
  JZX sai_rev
  MOD R1, R0, R4
  DIV R0, R0, R4
  ADDI R1, R1, #48
  ST R1, R2, #0
  ADDI R2, R2, #1
  ADDI R3, R3, #1
  JMPX sai_lp
sai_rev:
  CMPI R3, #0
  JZX sai_done
  SUBI R2, R2, #1
  SUBI R3, R3, #1
  LT R1, R2, #0
  ST R1, R5, #0
  ADDI R5, R5, #1
  JMPX sai_rev
sai_done:
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; sh_do_load: reads "SHEET" into file_io_buf, parses "<Col><Row>:<raw>=..." lines, and recalculates
sh_do_load:
  CALLX sh_clear_all
  ADDI R0, R8, #5050
  LI R1, #14000 - 19683
  LMI R1, #1
  ADD R1, R1, R8
  LI R2, #7000
  SYSCALL #31
  CMPI R0, #0
  JNPX sh_ev_lp
  LI R1, #14000 - 19683
  LMI R1, #1
  ADD R1, R1, R8 ; cursor in file_io_buf
sdl_line_lp:
  LT R0, R1, #0
  CMPI R0, #0
  JZX sdl_done
  CMPI R0, #10
  JZX sdl_sk_nl
  CALLX sh_parse_cell_ref ; R0 = cell_idx, advances R1
  CMPI R0, #0
  JNX sdl_done
  LT R2, R1, #0
  CMPI R2, #':'
  JNZX sdl_done
  ADDI R1, R1, #1
  MULI R2, R0, #24
  ADDI R2, R2, #6600
  ADD R2, R2, R8 ; dst in FORMULA_BUF
  ; Copy up to last '=' on the line (or newline)
  ; Wait: a formula starts with '=', so copy first char, then copy until '=' or 'NL'!
  LT R3, R1, #0
  CMPI R3, #0
  JZX sdl_done
  CMPI R3, #10
  JZX sdl_sk_nl
  ST R3, R2, #0
  ADDI R1, R1, #1
  ADDI R2, R2, #1
sdl_cp_raw:
  LT R3, R1, #0
  CMPI R3, #0
  JZX sdl_term_raw
  CMPI R3, #10
  JZX sdl_term_raw
  CMPI R3, #'='
  JZX sdl_term_raw
  ST R3, R2, #0
  ADDI R1, R1, #1
  ADDI R2, R2, #1
  JMPX sdl_cp_raw
sdl_term_raw:
  LI R3, #0
  ST R3, R2, #0
  ; Skip rest of line up to 'NL'
sdl_sk_eol:
  LT R3, R1, #0
  CMPI R3, #0
  JZX sdl_done
  CMPI R3, #10
  JZX sdl_sk_nl
  ADDI R1, R1, #1
  JMPX sdl_sk_eol
sdl_sk_nl:
  ADDI R1, R1, #1
  JMPX sdl_line_lp
sdl_done:
  CALLX sh_recalc_all
  ADDI R6, R8, #5003
  LI R0, #1
  ST R0, R6, #0
  JMPX sh_ev_lp

sh_redraw:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7

  LI R0, #0
  LI R1, #0
  LI R2, #218
  LI R3, #120
  LI R4, #-315
  SYSCALL #20

  ; Toolbar at (4, 2)
  LI R0, #4
  LI R1, #2
  LI R2, #str_sh_bar - app9_sheet_rom
  ADD R2, R2, R8
  LI R3, #COL_WHITE
  LI R4, #-230
  SYSCALL #21

  ; Column headers at (24, 16)
  LI R0, #4
  LI R1, #16
  LI R2, #str_sh_hdr - app9_sheet_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-315
  SYSCALL #21

  ; Draw visible rows r = 0..7, cols c = 0..3
  LI R6, #0 ; r = 0..7
shrd_rlp:
  CMPI R6, #8
  JNNX shrd_flush
  MULI R1, R6, #12
  ADDI R1, R1, #28 ; y = 28 + r * 12
  ; Row number R6 + 1 at x = 4
  LI R0, #4
  ADDI R2, R6, #1
  LI R3, #10
  LI R4, #COL_CYAN
  LI R5, #-315
  SYSCALL #26

  LI R7, #0 ; c = 0..3
shrd_clp:
  CMPI R7, #4
  JNNX shrd_rnx
  MULI R0, R6, #10
  ADD R0, R0, R7 ; cell_idx = r*10 + c
  ADDI R2, R8, #5100
  ADD R2, R2, R0
  LT R3, R2, #0 ; CELL_TYPE
  CMPI R3, #0
  JZX shrd_cnx

  MULI R4, R7, #48
  ADDI R4, R4, #26 ; x = 26 + c * 48
  MULI R1, R6, #12
  ADDI R1, R1, #28 ; y
  CMPI R3, #1
  JZX shrd_c_num
  CMPI R3, #2
  JZX shrd_c_txt
  CMPI R3, #3
  JZX shrd_c_div0
  ; #CYCLE!
  MOV R0, R4
  LI R2, #str_sh_cycle - app9_sheet_rom
  ADD R2, R2, R8
  LI R3, #COL_RED
  LI R4, #-315
  SYSCALL #21
  JMPX shrd_cnx
shrd_c_div0:
  MOV R0, R4
  LI R2, #str_sh_div0 - app9_sheet_rom
  ADD R2, R2, R8
  LI R3, #COL_RED
  LI R4, #-315
  SYSCALL #21
  JMPX shrd_cnx
shrd_c_txt:
  MULI R2, R0, #24
  ADDI R2, R2, #6600
  ADD R2, R2, R8
  MOV R0, R4
  LI R3, #COL_YELLOW
  LI R4, #-315
  SYSCALL #21
  JMPX shrd_cnx
shrd_c_num:
  MULI R2, R0, #3
  ADDI R2, R2, #5700
  ADD R2, R2, R8
  LW R2, R2, #0
  MOV R0, R4
  LI R3, #10
  LI R4, #COL_WHITE
  LI R5, #-315
  SYSCALL #26

shrd_cnx:
  ADDI R7, R7, #1
  JMPX shrd_clp
shrd_rnx:
  ADDI R6, R6, #1
  JMPX shrd_rlp

shrd_flush:
  LI R0, #0
  LI R1, #0
  LI R2, #0
  LI R3, #0
  SYSCALL #24
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

str_sh_title: .stringz "SHEET"
str_sh_bar:   .stringz "[SAVE] [LOAD] [CLR] SHEET"
str_sh_hdr:   .stringz "R   A     B     C     D"
str_sh_div0:  .stringz "#DIV/0!"
str_sh_cycle: .stringz "#CYCLE!"
app9_sheet_end:

; ----------------------------------------------------------------------------
; APP 10: STUDIONET v2 CLIENT & SERVER (APP_ID = 10)
; Speaks StudioNet 16-byte wire format (spiralos/STUDIONET.md §2 & os/net.sp):
;   - Chat: SDP (proto 2) on port 4200, flags PSH, payload = msg + NUL (shows sender hex ID)
;   - Ping: SDP (proto 2) on port 7, flags PSH / ACK|PSH, shows RTT in virtual steps or NO REPLY
;   - File push: SSP (proto 3) on port 4300 (and 4301 for multi-chunk), byte ('B') & tryte ('T') modes
; Memory layout (relative to R8 = UBASE):
;   +5000..5119: net_stat_buf (populated by SYSCALL #45 SYS_NET_STATUS, saved to "NET")
;   +5120..5122: peer_node (3-tryte word; default: 4 if local_node==3, else 3)
;   +5123:       in_len
;   +5124..5126: last_state_sig (3-tryte word)
;   +5127:       dirty
;   +5130..5189: in_buf (chat input or command)
;   +5300..5315: send_fn_buf (default "BIGFILE")
; ----------------------------------------------------------------------------
app10_net_rom:
  LI R0, #270
  LI R1, #32
  LI R2, #240
  LI R3, #140
  LI R4, #str_net_title - app10_net_rom
  ADD R4, R4, R8
  LI R5, #-320
  SYSCALL #10

  ; Determine default peer_node: if local_node == 3 -> peer = 4, else peer = 3
  SYSCALL #40 ; R0 = local node_id
  ADDI R6, R8, #5120
  LI R1, #4
  CMPI R0, #3
  JZX net_peer_ok
  LI R1, #3
net_peer_ok:
  SW R1, R6, #0 ; peer_node
  LI R0, #0
  ST R0, R6, #3 ; in_len = 0
  LI R0, #-1
  SW R0, R6, #4 ; last_state_sig = -1
  LI R0, #1
  ST R0, R6, #7 ; dirty = 1
  LI R0, #0
  ST R0, R6, #10 ; in_buf[0] = 0

  ; Default file to send: "BIGFILE" at UBASE + 5300
  ADDI R6, R8, #5300
  LI R0, #'B'
  ST R0, R6, #0
  LI R0, #'I'
  ST R0, R6, #1
  LI R0, #'G'
  ST R0, R6, #2
  LI R0, #'F'
  ST R0, R6, #3
  LI R0, #'I'
  ST R0, R6, #4
  LI R0, #'L'
  ST R0, R6, #5
  LI R0, #'E'
  ST R0, R6, #6
  LI R0, #0
  ST R0, R6, #7

  CALLX net_refresh_and_draw

net_ev_lp:
  SYSCALL #25
  CMPI R0, #0
  JZX net_idle
  CMPI R0, #1
  JZX net_on_key
  CMPI R0, #2
  JZX net_on_click
  JMPX net_ev_lp

net_idle:
  ; Poll SYS_NET_STATUS (#45) to see if rx_pkts, last_rtt, or status_msg changed
  ADDI R0, R8, #5000
  SYSCALL #45 ; R0 = rx_pkts
  ADDI R5, R8, #5000
  LW R1, R5, #15 ; last_rtt
  MULI R1, R1, #17
  ADD R0, R0, R1
  LT R1, R5, #100 ; status_msg[0]
  ADD R0, R0, R1
  ADDI R6, R8, #5120
  LW R1, R6, #4 ; last_state_sig
  CMP R0, R1
  JZX net_chk_dirty
  SW R0, R6, #4
  LI R0, #1
  ST R0, R6, #7
net_chk_dirty:
  LT R0, R6, #7
  CMPI R0, #0
  JZX net_do_yield
  LI R0, #0
  ST R0, R6, #7
  CALLX net_refresh_and_draw
net_do_yield:
  SYSCALL #2
  JMPX net_ev_lp

net_on_click:
  CMPI R2, #14
  JNNX net_ev_lp
  CMPI R1, #50
  JNX net_do_ping
  CMPI R1, #108
  JNX net_do_send_file
  CMPI R1, #160
  JNX net_do_send_chat
  JMPX net_do_save_stat

net_on_key:
  CMPI R1, #200
  JZX net_trig_fault
  CMPI R1, #201
  JZX net_trig_loop

  CMPI R1, #136 ; F1 -> PEERS view
  JZX net_do_peers_view
  CMPI R1, #137 ; F2 -> INBOX view
  JZX net_do_inbox_view
  CMPI R1, #138 ; F3 -> WEB GET
  JZX net_do_web_get
  CMPI R1, #139 ; F4 -> Toggle Share
  JZX net_do_share_toggle
  CMPI R1, #140 ; F5 -> Set Hostname
  JZX net_do_set_hostname
  CMPI R1, #141 ; F6 -> WEB POST
  JZX net_do_web_post
  CMPI R1, #142 ; F7 -> WEB RENDER
  JZX net_do_web_render
  CMPI R1, #16 ; Ctrl+P -> Ping peer
  JZX net_do_ping
  CMPI R1, #20 ; Ctrl+T -> Set peer_node from decimal in_buf
  JZX net_do_set_peer
  CMPI R1, #6  ; Ctrl+F -> Send file
  JZX net_do_send_file
  CMPI R1, #19 ; Ctrl+S -> Save net status to "NET"
  JZX net_do_save_stat
  CMPI R1, #13 ; Enter -> Send chat message
  JZX net_do_send_chat
  CMPI R1, #10
  JZX net_do_send_chat
  CMPI R1, #8
  JZX net_in_bs

  ADDI R6, R8, #5120
  LT R2, R6, #3 ; in_len
  CMPI R2, #48
  JNNX net_ev_lp
  ADDI R3, R6, #10
  ADD R3, R3, R2
  ST R1, R3, #0
  LI R0, #0
  ST R0, R3, #1
  ADDI R2, R2, #1
  ST R2, R6, #3
  LI R0, #1
  ST R0, R6, #7
  JMPX net_ev_lp

net_trig_fault:
  LI R1, #100
  LI R0, #999
  ST R0, R1, #0
  JMPX net_ev_lp
net_trig_loop:
  JMPX net_trig_loop

net_in_bs:
  ADDI R6, R8, #5120
  LT R2, R6, #3
  CMPI R2, #0
  JNPX net_ev_lp
  SUBI R2, R2, #1
  ST R2, R6, #3
  ADDI R3, R6, #10
  ADD R3, R3, R2
  LI R0, #0
  ST R0, R3, #0
  LI R0, #1
  ST R0, R6, #7
  JMPX net_ev_lp

net_do_ping:
  ADDI R6, R8, #5120
  LW R0, R6, #0 ; peer_node
  SYSCALL #43   ; SYS_NET_PING
  JMPX net_ev_lp

net_do_set_peer:
  ADDI R6, R8, #5120
  LT R2, R6, #3 ; in_len
  CMPI R2, #0
  JNPX net_ev_lp
  ADDI R3, R6, #10
  LI R0, #0
ndsp_lp:
  CMPI R2, #0
  JNPX ndsp_done
  LT R1, R3, #0
  SUBI R1, R1, #48
  MULI R0, R0, #10
  ADD R0, R0, R1
  ADDI R3, R3, #1
  SUBI R2, R2, #1
  JMPX ndsp_lp
ndsp_done:
  SW R0, R6, #0 ; peer_node = parsed int
  LI R0, #0
  ST R0, R6, #3 ; in_len = 0
  ST R0, R6, #10
  LI R0, #1
  ST R0, R6, #7
  JMPX net_ev_lp

net_do_send_file:
  ADDI R6, R8, #5120
  LT R2, R6, #3 ; if in_len > 0, copy in_buf (+5130) to +5300
  CMPI R2, #0
  JNPX ndsf_go
  ADDI R0, R8, #5300
  ADDI R1, R6, #10
  ADDI R2, R2, #1
  BCOPY R0, R1, R2
  LI R0, #0
  ST R0, R6, #3
  ST R0, R6, #10
ndsf_go:
  ADDI R6, R8, #5120
  LW R0, R6, #0 ; peer_node
  ADDI R1, R8, #5300
  SYSCALL #44   ; SYS_NET_SEND_FILE
  LI R0, #1
  ST R0, R6, #7
  JMPX net_ev_lp

net_do_send_chat:
  ; Send SDP chat on port 4200: payload = in_buf (+5130), len = in_len + 1 (includes NUL)
  ADDI R6, R8, #5120
  LT R4, R6, #3 ; in_len
  CMPI R4, #0
  JNPX net_ev_lp
  LW R0, R6, #0 ; dst_node = peer_node
  ADDI R1, R6, #10 ; msg_ptr (+5130)
  ADDI R2, R4, #1  ; msg_len = in_len + 1 (includes NUL)
  SYSCALL #41   ; SYS_NET_SEND

  ; Reset in_len = 0
  LI R0, #0
  ST R0, R6, #3
  LI R0, #1
  ST R0, R6, #7
  JMPX net_ev_lp

net_do_save_stat:
  ADDI R0, R8, #5000
  SYSCALL #45
  LI R0, #str_net_fn - app10_net_rom
  ADD R0, R0, R8
  ADDI R1, R8, #5000
  LI R2, #100
  LI R3, #1
  SYSCALL #32
  JMPX net_ev_lp

net_refresh_and_draw:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6

  ADDI R0, R8, #5000
  SYSCALL #45

  LI R0, #0
  LI R1, #0
  LI R2, #238
  LI R3, #127
  LI R4, #-320
  SYSCALL #20

  ; Toolbar at (4, 2)
  LI R0, #4
  LI R1, #2
  LI R2, #str_net_bar - app10_net_rom
  ADD R2, R2, R8
  LI R3, #COL_WHITE
  LI R4, #-230
  SYSCALL #21

  ; Node ID & RX stats at y=18
  LI R0, #6
  LI R1, #18
  LI R2, #str_net_nd - app10_net_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-320
  SYSCALL #21

  ADDI R6, R8, #5000
  LW R2, R6, #0 ; node_id
  LI R0, #48
  LI R1, #18
  LI R3, #10
  LI R4, #COL_WHITE
  LI R5, #-320
  SYSCALL #26

  LI R0, #80
  LI R1, #18
  LI R2, #str_net_rx - app10_net_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-320
  SYSCALL #21

  LW R2, R6, #6 ; rx_pkts
  LI R0, #112
  LI R1, #18
  LI R3, #10
  LI R4, #COL_GREEN
  LI R5, #-320
  SYSCALL #26

  ; Ping RTT (or NO REPLY) at y=34 (client x=48 -> screen x=319, y=78)
  LI R0, #6
  LI R1, #34
  LI R2, #str_net_rtt - app10_net_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-320
  SYSCALL #21

  LW R2, R6, #15 ; last_rtt
  CMPI R2, #0
  JNX nrad_no_reply
  LI R0, #48
  LI R1, #34
  LI R3, #10
  LI R4, #COL_YELLOW
  LI R5, #-320
  SYSCALL #26
  JMPX nrad_tx_line
nrad_no_reply:
  LI R0, #48
  LI R1, #34
  ADDI R2, R8, #5100 ; status_msg ("NO REPLY")
  LI R3, #COL_YELLOW
  LI R4, #-320
  SYSCALL #21

nrad_tx_line:
  ; Last TX chat at y=52
  LI R0, #6
  LI R1, #52
  LI R2, #str_net_txc - app10_net_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-320
  SYSCALL #21

  LI R0, #38
  LI R1, #52
  ADDI R2, R8, #5130 ; in_buf / last sent
  LI R3, #COL_WHITE
  LI R4, #-320
  SYSCALL #21

  ; Last RX Chat message (<HEX4>:<msg>) at y=70 (client x=38 -> screen x=309, y=114)
  LI R0, #6
  LI R1, #70
  LI R2, #str_net_rxc - app10_net_rom
  ADD R2, R2, R8
  LI R3, #COL_GREEN
  LI R4, #-320
  SYSCALL #21

  LI R0, #38
  LI R1, #70
  ADDI R2, R8, #5020 ; last_chat (+20 in net_stat_buf)
  LI R3, #COL_YELLOW
  LI R4, #-320
  SYSCALL #21

  ; Last RX File at y=88
  LI R0, #6
  LI R1, #88
  LI R2, #str_net_sfp - app10_net_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-320
  SYSCALL #21

  LI R0, #54
  LI R1, #88
  ADDI R2, R8, #5084 ; last_file (+84 in net_stat_buf)
  LI R3, #COL_WHITE
  LI R4, #-320
  SYSCALL #21

  ; Status message (e.g. "TOO BIG FOR SPIRALOS", "ACK OK", "NO REPLY") at y=104 (screen x=277, y=148)
  LI R0, #6
  LI R1, #104
  ADDI R2, R8, #5100 ; status_msg (+100 in net_stat_buf)
  LI R3, #COL_YELLOW
  LI R4, #-320
  SYSCALL #21

  LI R0, #0
  LI R1, #0
  LI R2, #0
  LI R3, #0
  SYSCALL #24

  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

str_net_title: .stringz "STUDIONET"
str_net_bar:   .stringz "[PING] [SENDF] [CHAT] [SV]"
str_net_nd:    .stringz "NODE:"
str_net_rx:    .stringz "RX:"
str_net_rtt:   .stringz "RTT:"
str_net_txc:   .stringz "TX:"
str_net_rxc:   .stringz "RX:"
str_net_sfp:   .stringz "FILE:"
str_net_fn:    .stringz "NET"

; ============================================================================
; APP 10 (STUDIONET & BROWSER) 1.1.2 IN-GUEST EXTENSIONS
; Views & Actions:
;   F1 (136): PEERS view -> fetches K_SNS_PEERS via SYSCALL #46 (op=5), renders peers, saves "NETPEERS"
;   F2 (137): INBOX view -> renders INBOX & SHARE status, saves "NETINBOX"
;   F3 (138): WEB view   -> sends SRRP GET /index.hts via SYSCALL #47, renders text/hts or image/t3-snap, saves "WEB"
;   F4 (139): Toggle Share (read-only /share) via SYSCALL #46 (op=6)
;   F5 (140): Set machine name from in_buf (+5130), save "HOSTNAME", call SYSCALL #46 (op=4)
;   F6 (141): Submit SRRP POST /form ("user=triton&ok=1" or in_buf) via SYSCALL #47
;   F7 (142): Render received SRRP response in K_SRRP_RX_BUF (text/hts or image/t3-snap)
; ============================================================================
net_do_peers_view:
  LI R0, #5
  LI R1, #5400
  ADD R1, R8, R1
  SYSCALL #46 ; R0 = peer_count, +5400..5655 = 8 peer entries (32 trytes each)
  LI R6, #5128
  ADD R6, R8, R6
  LI R1, #1
  ST R1, R6, #0 ; view_mode = 1 (PEERS)
  ST R0, R6, #1 ; peer_count
  ; Save 256-tryte peer table to "NETPEERS"
  LI R0, #str_netpeers_fn - app10_net_rom
  ADD R0, R0, R8
  LI R1, #5400
  ADD R1, R8, R1
  LI R2, #256
  LI R3, #1
  SYSCALL #32
  CALLX net_draw_peers_view
  JMPX net_ev_lp

net_do_inbox_view:
  LI R6, #5128
  ADD R6, R8, R6
  LI R1, #2
  ST R1, R6, #0 ; view_mode = 2 (INBOX)
  CALLX net_draw_inbox_view
  JMPX net_ev_lp

net_do_share_toggle:
  LI R0, #6
  LI R1, #0
  SYSCALL #46 ; returns new share flag (0 or 1) in R0
  LI R6, #5128
  ADD R6, R8, R6
  ST R0, R6, #2 ; share_flag
  CALLX net_draw_inbox_view
  JMPX net_ev_lp

net_do_set_hostname:
  LI R0, #str_hostname_fn - app10_net_rom
  ADD R0, R0, R8
  ADDI R1, R8, #5130
  ADDI R6, R8, #5120
  LT R2, R6, #3 ; in_len
  CMPI R2, #0
  JNPX net_ev_lp
  LI R3, #1
  SYSCALL #32
  LI R0, #4
  ADDI R1, R8, #5130
  SYSCALL #46
  LI R0, #1
  SYSCALL #46 ; broadcast HELLO
  JMPX net_ev_lp

net_do_web_get:
  LI R6, #5128
  ADD R6, R8, R6
  LI R0, #3
  ST R0, R6, #0 ; view_mode = 3 (WEB)
  ADDI R6, R8, #5120
  LW R0, R6, #0 ; peer_node
  LI R1, #str_srrp_get_req - app10_net_rom
  ADD R1, R1, R8
  LI R2, #23
  SYSCALL #47
  JMPX net_ev_lp

net_do_web_post:
  LI R6, #5128
  ADD R6, R8, R6
  LI R0, #3
  ST R0, R6, #0
  ADDI R6, R8, #5120
  LW R0, R6, #0 ; peer_node
  LI R1, #str_srrp_post_req - app10_net_rom
  ADD R1, R1, R8
  LI R2, #51
  SYSCALL #47
  JMPX net_ev_lp

net_do_web_render:
  ; Read received SRRP response from K_SRRP_RX_BUF into UBASE + 6000
  LI R0, #0
  LI R1, #6000
  ADD R1, R8, R1
  LI R2, #0
  SYSCALL #47 ; R0 = len
  CMPI R0, #0
  JNPX net_ev_lp
  MOV R7, R0 ; total response bytes
  ; Save raw response to "WEB" on disk
  LI R0, #str_web_fn - app10_net_rom
  ADD R0, R0, R8
  LI R1, #6000
  ADD R1, R8, R1
  MOV R2, R7
  LI R3, #1
  SYSCALL #32
  ; Find double-newline (10, 10) in UBASE + 6000 to locate body start -> R5
  LI R1, #6000
  ADD R1, R8, R1
  LI R2, #0
  LI R4, #0 ; is_snap = 0 (1 if header has s,n,a,p)
ndwr_hdr_lp:
  CMP R2, R7
  JNNX net_ev_lp
  ADD R3, R1, R2
  LT R0, R3, #0
  CMPI R0, #s
  JNZX ndwr_chk_nl
  LT R0, R3, #1
  CMPI R0, #n
  JNZX ndwr_chk_nl
  LT R0, R3, #2
  CMPI R0, #a
  JNZX ndwr_chk_nl
  LI R4, #1 ; is_snap = 1
ndwr_chk_nl:
  LT R0, R3, #0
  CMPI R0, #10
  JNZX ndwr_hdr_nx
  LT R0, R3, #1
  CMPI R0, #10
  JZX ndwr_body_found
ndwr_hdr_nx:
  ADDI R2, R2, #1
  JMPX ndwr_hdr_lp

ndwr_body_found:
  ADDI R2, R2, #2 ; body offset
  ADD R5, R1, R2  ; R5 = body ptr
  SUB R7, R7, R2  ; R7 = body_len
  ; Save is_snap (R4) at +5127 before SYSCALL #20
  LI R6, #5127
  ADD R6, R8, R6
  ST R4, R6, #0
  LI R0, #0
  LI R1, #14
  LI R2, #238
  LI R3, #113
  LI R4, #-320
  SYSCALL #20
  LI R6, #5127
  ADD R6, R8, R6
  LT R4, R6, #0
  CMPI R4, #1
  JZX ndwr_render_snap

ndwr_render_hts:
  ; Render text/hts body at R5 (len R7): strip <...> tags (60..62), render lines at y = 20, 32, 44...
  LI R6, #7000
  ADD R6, R8, R6 ; line buf
  LI R1, #0 ; i = 0..R7-1
  LI R2, #0 ; out_col = 0
  LI R3, #20 ; cur_y = 20
ndwr_hts_lp:
  CMP R1, R7
  JNNX ndwr_hts_flush_line
  ADD R4, R5, R1
  LT R0, R4, #0
  CMPI R0, #60 ; '<'
  JZX ndwr_skip_tag
  CMPI R0, #10 ; newline
  JZX ndwr_emit_line
  ADD R4, R6, R2
  ST R0, R4, #0
  ADDI R2, R2, #1
  ADDI R1, R1, #1
  JMPX ndwr_hts_lp
ndwr_skip_tag:
  ADDI R1, R1, #1
  CMP R1, R7
  JNNX ndwr_hts_flush_line
  ADD R4, R5, R1
  LT R0, R4, #0
  CMPI R0, #62 ; '>'
  JNZX ndwr_skip_tag
  ADDI R1, R1, #1
  JMPX ndwr_hts_lp
ndwr_emit_line:
  CMPI R2, #0
  JNPX ndwr_nl_empty
  ADD R4, R6, R2
  LI R0, #0
  ST R0, R4, #0
  PUSH R1
  PUSH R3
  PUSH R5
  PUSH R6
  PUSH R7
  LI R0, #6
  MOV R1, R3
  MOV R2, R6
  LI R3, #COL_WHITE
  LI R4, #-320
  SYSCALL #21
  POP R7
  POP R6
  POP R5
  POP R3
  POP R1
  ADDI R3, R3, #12
  LI R2, #0
ndwr_nl_empty:
  ADDI R1, R1, #1
  JMPX ndwr_hts_lp
ndwr_hts_flush_line:
  CMPI R2, #0
  JNPX ndwr_flush_win
  ADD R4, R6, R2
  LI R0, #0
  ST R0, R4, #0
  LI R0, #6
  MOV R1, R3
  MOV R2, R6
  LI R3, #COL_CYAN
  LI R4, #-320
  SYSCALL #21
  JMPX ndwr_flush_win

ndwr_render_snap:
  ; Body at R5: width = R5[0] + R5[1]*256, height = R5[2] + R5[3]*256, followed by width*height trytes16 (LE)
  LT R2, R5, #0
  LT R0, R5, #1
  MULI R0, R0, #256
  ADD R2, R2, R0 ; R2 = width
  LT R3, R5, #2
  LT R0, R5, #3
  MULI R0, R0, #256
  ADD R3, R3, R0 ; R3 = height
  MUL R6, R2, R3 ; R6 = total pixels
  ADDI R5, R5, #4 ; pixel bytes start
  LI R7, #8000
  ADD R7, R8, R7 ; decoded pixel tryte buffer at UBASE + 8000
  LI R1, #0 ; i = 0..R6-1
ndwr_sn_lp:
  CMP R1, R6
  JNNX ndwr_sn_blit
  MULI R0, R1, #2
  ADD R0, R5, R0
  LT R4, R0, #0 ; lo
  LT R0, R0, #1 ; hi
  MULI R0, R0, #256
  ADD R4, R4, R0
  LI R0, #-6598
  LMI R0, #2 ; 32768
  CMP R4, R0
  JNX ndwr_sn_st
  LI R0, #6487
  LMI R0, #3 ; 65536
  SUB R4, R4, R0
ndwr_sn_st:
  ADD R0, R7, R1
  ST R4, R0, #0
  ADDI R1, R1, #1
  JMPX ndwr_sn_lp
ndwr_sn_blit:
  PUSH R2
  PUSH R3
  PUSH R6
  LI R0, #8
  LI R1, #20
  MOV R4, R7
  MOV R5, R2 ; src_stride = width
  SYSCALL #22
  POP R6
  POP R3
  POP R2
  LI R0, #str_websnap_fn - app10_net_rom
  ADD R0, R0, R8
  MOV R1, R7
  MOV R2, R6
  LI R3, #1
  SYSCALL #32

ndwr_flush_win:
  LI R0, #0
  LI R1, #0
  LI R2, #0
  LI R3, #0
  SYSCALL #24
  JMPX net_ev_lp

net_draw_peers_view:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  LI R0, #0
  LI R1, #14
  LI R2, #238
  LI R3, #113
  LI R4, #-320
  SYSCALL #20
  LI R0, #6
  LI R1, #18
  LI R2, #str_peers_hdr - app10_net_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-320
  SYSCALL #21
  LI R5, #0
  LI R6, #32
ndpv_lp:
  CMPI R5, #8
  JNNX ndpv_done
  MULI R0, R5, #32
  LI R1, #5400
  ADD R1, R8, R1
  ADD R1, R1, R0
  LT R0, R1, #0
  CMPI R0, #0
  JZX ndpv_nx
  ADDI R2, R1, #16
  LI R0, #8
  MOV R1, R6
  LI R3, #COL_YELLOW
  LI R4, #-320
  SYSCALL #21
  ADDI R6, R6, #12
ndpv_nx:
  ADDI R5, R5, #1
  JMPX ndpv_lp
ndpv_done:
  LI R0, #0
  LI R1, #0
  LI R2, #0
  LI R3, #0
  SYSCALL #24
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

net_draw_inbox_view:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  LI R0, #0
  LI R1, #14
  LI R2, #238
  LI R3, #113
  LI R4, #-320
  SYSCALL #20
  LI R0, #6
  LI R1, #18
  LI R2, #str_inbox_hdr - app10_net_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-320
  SYSCALL #21
  LI R0, #6
  LI R1, #34
  ADDI R2, R8, #5084
  LI R3, #COL_WHITE
  LI R4, #-320
  SYSCALL #21
  LI R0, #0
  LI R1, #0
  LI R2, #0
  LI R3, #0
  SYSCALL #24
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

str_netpeers_fn:   .stringz "NETPEERS"
str_hostname_fn:   .stringz "HOSTNAME"
str_web_fn:        .stringz "WEB"
str_websnap_fn:    .stringz "WEBSNAP"
str_peers_hdr:     .stringz "SNS PEERS (NAME / OS):"
str_inbox_hdr:     .stringz "INBOX & SHARE (/share):"
str_srrp_get_req:  .stringz "GET /index.hts SRRP/1

"
str_srrp_post_req: .stringz "POST /form SRRP/1
Length: 16

user=triton&ok=1"

app10_net_end:

; ----------------------------------------------------------------------------
; APP 11: TRYTRIS (APP_ID = 11)
; Triangular falling-piece game matching trytris/index.html TrytrisEngine.
; Memory layout (relative to R8 = UBASE):
;   +5000..5354: TRY_STATE (355 trytes, saved to "TRYSTATE"):
;     +5000..5002: seed (word)
;     +5003:       mode (0=NORMAL, 1=CURSED, 2=HEXIAMOND)
;     +5004..5006: score (word)
;     +5007:       lines
;     +5008:       level (1..15)
;     +5009:       comboStreak
;     +5010:       backToBackActive (0/1)
;     +5011:       gameOver (0/1)
;     +5012:       active_id (0 or 1..16)
;     +5013:       active_rot (0..5)
;     +5014:       active_r
;     +5015:       active_c
;     +5016..5018: next_ids[0..2]
;     +5019..5354: board[0..335] (28 rows * 12 cols)
;   +5360..5362: high_score (word, persisted in "TRYHI")
;   +5363..5365: prng_a (word, Mulberry32 state)
;   +5366..5368: last_grav_ticks (word)
;   +5369..5371: pending_seed (word, -1 if none)
;   +5372:       pending_mode (0..2)
;   +5373:       pending_level (1..15)
;   +5374:       lockstep (0=LIVE, 1=LOCK)
;   +5375:       dirty (0/1)
;   +5376:       bag_len (0..31)
;   +5377:       last_vocab_sig (-1, 0=TET4, 1=CURSED16, 2=HEX12)
;   +5380..5411: bag[0..31]
;   +5420..5435: vocab_tmp[0..15]
;   +5440..5471: scratch[0..31]
;   +6000..15503: board_fb (66 x 144 pixels)
;   +16000..26367: tzf_fb (72 x 144 pixels)
; ----------------------------------------------------------------------------
app11_try_rom:
  LI R0, #10
  LI R1, #10
  LI R2, #240
  LI R3, #159
  LI R4, #str_try_title - app11_try_rom
  ADD R4, R4, R8
  LI R5, #-320
  SYSCALL #10

  ; Load persisted high_score from "TRYHI"
  LI R1, #5360
  ADD R6, R8, R1
  LI R0, #0
  SW R0, R6, #0
  LI R0, #str_try_hifn - app11_try_rom
  ADD R0, R0, R8
  MOV R1, R6
  LI R2, #3
  SYSCALL #31

  ; Init config: seed=42, pending_seed=-1, pending_mode=0, pending_level=1, lockstep=0
  LI R1, #5000
  ADD R6, R8, R1
  LI R0, #42
  SW R0, R6, #0
  LI R1, #5369
  ADD R6, R8, R1
  LI R0, #-1
  SW R0, R6, #0 ; pending_seed = -1
  LI R0, #0
  ST R0, R6, #3 ; pending_mode = 0
  LI R0, #1
  ST R0, R6, #4 ; pending_level = 1
  LI R0, #0
  ST R0, R6, #5 ; lockstep = 0
  ST R0, R6, #6 ; dirty = 0

  CALLX try_reset
  CALLX try_redraw

try_ev_lp:
  SYSCALL #25
  CMPI R0, #0
  JZX try_check_grav
  CMPI R0, #1
  JZX try_on_key
  JMPX try_ev_lp

try_check_grav:
  LI R1, #5374
  ADD R6, R8, R1
  LT R0, R6, #0 ; lockstep
  CMPI R0, #0
  JNZX try_idle_draw
  LI R1, #5011
  ADD R6, R8, R1
  LT R0, R6, #0 ; gameOver
  CMPI R0, #0
  JNZX try_idle_draw

  SYSCALL #9 ; R0 = current ms (SYS_GET_MS)
  LI R1, #5366
  ADD R6, R8, R1
  LW R1, R6, #0 ; last_grav_ms
  SUB R2, R0, R1
  ; interval_ms = max(110, 850 - (level - 1) * 50)
  LI R1, #5008
  ADD R5, R8, R1
  LT R3, R5, #0 ; level 1..15
  SUBI R3, R3, #1
  MULI R3, R3, #50
  LI R4, #850
  SUB R4, R4, R3
  LI R3, #110
  CMP R4, R3
  JNNX tcg_int_ok
  MOV R4, R3
tcg_int_ok:
  CMP R2, R4
  JNX try_idle_draw
  SW R0, R6, #0 ; update last_grav_ms
  LI R0, #0
  CALLX try_tick
  LI R1, #5375
  ADD R6, R8, R1
  LI R0, #1
  ST R0, R6, #0

try_idle_draw:
  LI R1, #5375
  ADD R6, R8, R1
  LT R0, R6, #0 ; dirty
  CMPI R0, #0
  JZX try_do_yield
  LI R0, #0
  ST R0, R6, #0
  CALLX try_redraw
try_do_yield:
  SYSCALL #2
  JMPX try_ev_lp

try_on_key:
  CMPI R1, #200
  JZX try_trig_fault
  CMPI R1, #201
  JZX try_trig_loop

  ; Digits '0'..'9' accumulate pending_seed
  CMPI R1, #48
  JNX try_key_act
  CMPI R1, #57
  JPX try_key_act
  SUBI R1, R1, #48
  LI R2, #5369
  ADD R6, R8, R2
  LW R0, R6, #0 ; pending_seed
  CMPI R0, #-1
  JNZX tok_seed_acc
  SW R1, R6, #0
  JMPX tok_mark_dirty
tok_seed_acc:
  MULI R0, R0, #10
  ADD R0, R0, R1
  LI R2, #c_pow32 - app11_try_rom
  ADD R2, R2, R8
  LW R2, R2, #0
  MOD R0, R0, R2
  SW R0, R6, #0
tok_mark_dirty:
  LI R2, #5375
  ADD R6, R8, R2
  LI R0, #1
  ST R0, R6, #0
  JMPX try_ev_lp

try_trig_fault:
  LI R1, #100
  LI R0, #999
  ST R0, R1, #0
  JMPX try_ev_lp
try_trig_loop:
  JMPX try_trig_loop

try_key_act:
  CMPI R1, #'M'
  JZX try_cmd_mode
  CMPI R1, #'m'
  JZX try_cmd_mode
  CMPI R1, #'U'
  JZX try_cmd_lvl_up
  CMPI R1, #'u'
  JZX try_cmd_lvl_up
  CMPI R1, #'D'
  JZX try_cmd_lvl_dn
  CMPI R1, #'d'
  JZX try_cmd_lvl_dn
  CMPI R1, #'K'
  JZX try_cmd_lockstep
  CMPI R1, #'k'
  JZX try_cmd_lockstep
  CMPI R1, #13
  JZX try_cmd_new
  CMPI R1, #10
  JZX try_cmd_new

  ; Gameplay / lockstep actions: L, R, X, Z, Space, N, S (and arrows)
  CMPI R1, #'L'
  JZX try_act_left
  CMPI R1, #'l'
  JZX try_act_left
  CMPI R1, #128
  JZX try_act_left
  CMPI R1, #'R'
  JZX try_act_right
  CMPI R1, #'r'
  JZX try_act_right
  CMPI R1, #129
  JZX try_act_right
  CMPI R1, #'X'
  JZX try_act_rotcw
  CMPI R1, #'x'
  JZX try_act_rotcw
  CMPI R1, #130
  JZX try_act_rotcw
  CMPI R1, #'Z'
  JZX try_act_rotccw
  CMPI R1, #'z'
  JZX try_act_rotccw
  CMPI R1, #32
  JZX try_act_hard
  CMPI R1, #'N'
  JZX try_act_null
  CMPI R1, #'n'
  JZX try_act_null
  CMPI R1, #'S'
  JZX try_act_soft
  CMPI R1, #'s'
  JZX try_act_soft
  CMPI R1, #131
  JZX try_act_soft
  JMPX try_ev_lp

try_cmd_mode:
  LI R2, #5372
  ADD R6, R8, R2
  LT R0, R6, #0
  ADDI R0, R0, #1
  CMPI R0, #3
  JNX tcm_ok
  LI R0, #0
tcm_ok:
  ST R0, R6, #0
  JMPX tok_mark_dirty

try_cmd_lvl_up:
  LI R2, #5373
  ADD R6, R8, R2
  LT R0, R6, #0
  ADDI R0, R0, #1
  CMPI R0, #16
  JNX tclu_ok
  LI R0, #1
tclu_ok:
  ST R0, R6, #0
  JMPX tok_mark_dirty

try_cmd_lvl_dn:
  LI R2, #5373
  ADD R6, R8, R2
  LT R0, R6, #0
  SUBI R0, R0, #1
  CMPI R0, #1
  JNNX tcld_ok
  LI R0, #15
tcld_ok:
  ST R0, R6, #0
  JMPX tok_mark_dirty

try_cmd_lockstep:
  LI R2, #5374
  ADD R6, R8, R2
  LT R0, R6, #0
  LI R1, #1
  SUB R0, R1, R0
  ST R0, R6, #0
  LI R2, #5375
  ADD R5, R8, R2
  LI R1, #1
  ST R1, R5, #0
  CMPI R0, #0
  JZX try_ev_lp
  CALLX try_write_state
  JMPX try_ev_lp

try_cmd_new:
  LI R2, #5369
  ADD R6, R8, R2
  LW R0, R6, #0 ; pending_seed
  CMPI R0, #-1
  JZX tcn_keep_seed
  LI R2, #5000
  ADD R5, R8, R2
  SW R0, R5, #0 ; seed = pending_seed
  LI R0, #-1
  SW R0, R6, #0 ; pending_seed = -1
tcn_keep_seed:
  CALLX try_reset
  JMPX try_post_action

try_act_left:
  LI R0, #1
  JMPX try_do_tick
try_act_right:
  LI R0, #2
  JMPX try_do_tick
try_act_rotcw:
  LI R0, #3
  JMPX try_do_tick
try_act_rotccw:
  LI R0, #4
  JMPX try_do_tick
try_act_hard:
  LI R0, #5
  JMPX try_do_tick
try_act_null:
  LI R0, #0
try_do_tick:
  CALLX try_tick
  JMPX try_post_action
try_act_soft:
  CALLX try_soft_drop

try_post_action:
  LI R2, #5375
  ADD R6, R8, R2
  LI R0, #1
  ST R0, R6, #0 ; dirty = 1
  LI R2, #5374
  ADD R6, R8, R2
  LT R0, R6, #0 ; lockstep
  CMPI R0, #0
  JZX try_ev_lp
  CALLX try_write_state
  JMPX try_ev_lp

; ----------------------------------------------------------------------------
; try_write_state: writes 355-tryte TRY_STATE (+5000) to disk file "TRYSTATE"
; ----------------------------------------------------------------------------
try_write_state:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  LI R0, #str_try_stfn - app11_try_rom
  ADD R0, R0, R8
  LI R1, #5000
  ADD R1, R1, R8
  LI R2, #355
  LI R3, #1
  SYSCALL #32
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; ----------------------------------------------------------------------------
; try_reset: reset(seed, pending_mode) followed by setLevel(pending_level)
; ----------------------------------------------------------------------------
try_reset:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R6

  LI R1, #5000
  ADD R6, R8, R1
  LW R0, R6, #0 ; seed
  LI R1, #5363
  ADD R5, R8, R1
  SW R0, R5, #0 ; prng_a = seed

  LI R1, #5372
  ADD R5, R8, R1
  LT R0, R5, #0 ; pending_mode
  ST R0, R6, #3 ; mode

  LI R0, #0
  SW R0, R6, #4 ; score = 0
  ST R0, R6, #7 ; lines = 0
  ST R0, R6, #9 ; comboStreak = 0
  ST R0, R6, #10 ; backToBackActive = 0
  ST R0, R6, #11 ; gameOver = 0
  ST R0, R6, #12 ; active_id = 0
  ST R0, R6, #13 ; active_rot = 0
  ST R0, R6, #14 ; active_r = 0
  ST R0, R6, #15 ; active_c = 0
  LI R0, #1
  ST R0, R6, #8 ; level = 1

  ; Clear bag_len=0, last_vocab_sig=-1
  LI R1, #5376
  ADD R5, R8, R1
  LI R0, #0
  ST R0, R5, #0
  LI R0, #-1
  ST R0, R5, #1

  ; Clear 336-cell board (+5019..5354)
  LI R0, #5019
  ADD R0, R0, R8
  LI R1, #0
  LI R2, #336
  BFILL R0, R1, R2

  ; Spawn first piece at level 1 (during reset)
  CALLX try_spawn_next

  ; Apply setLevel(pending_level)
  LI R1, #5373
  ADD R5, R8, R1
  LT R0, R5, #0
  ST R0, R6, #8 ; level = pending_level

  ; Update next 3 preview in TRY_STATE (+5016..5018)
  CALLX try_update_next3

  SYSCALL #9
  LI R1, #5366
  ADD R5, R8, R1
  SW R0, R5, #0 ; last_grav_ms = ms

  POP R6
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; ----------------------------------------------------------------------------
; 32-bit Unsigned Arithmetic & Mulberry32 PRNG
; try_xor32(R0, R1) -> R0
; try_imul32(R0, R1) -> R0
; try_mulberry32() -> R0 (0..4294967295)
; ----------------------------------------------------------------------------
try_xor32:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  LI R2, #0 ; result
  LI R3, #1 ; multiplier = 16^k
  LI R4, #8 ; 8 nibbles
  LI R7, #try_xor_tbl - app11_try_rom
  ADD R7, R7, R8
tx32_lp:
  CMPI R4, #0
  JNPX tx32_done
  LI R5, #16
  MOD R6, R0, R5
  DIV R0, R0, R5
  MOD R5, R1, R5
  PUSH R4
  LI R4, #16
  DIV R1, R1, R4
  MULI R6, R6, #16
  ADD R6, R6, R5
  ADD R6, R6, R7
  LT R6, R6, #0 ; nibble xor
  MUL R6, R6, R3
  ADD R2, R2, R6
  MULI R3, R3, #16
  POP R4
  SUBI R4, R4, #1
  JMPX tx32_lp
tx32_done:
  MOV R0, R2
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

try_imul32:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  LI R2, #c_pow16 - app11_try_rom
  ADD R2, R2, R8
  LW R2, R2, #0 ; 65536
  MOD R3, R0, R2 ; a_lo
  DIV R4, R0, R2 ; a_hi
  MOD R5, R1, R2 ; b_lo
  DIV R6, R1, R2 ; b_hi
  MUL R4, R4, R5 ; a_hi * b_lo
  MUL R6, R3, R6 ; a_lo * b_hi
  ADD R4, R4, R6
  MOD R4, R4, R2 ; mid % 65536
  MUL R4, R4, R2 ; mid * 65536
  MUL R3, R3, R5 ; a_lo * b_lo
  ADD R0, R3, R4
  LI R2, #c_pow32 - app11_try_rom
  ADD R2, R2, R8
  LW R2, R2, #0 ; 4294967296
  MOD R0, R0, R2
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

try_mulberry32:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  LI R1, #5363
  ADD R6, R8, R1
  LW R0, R6, #0 ; a
  LI R2, #c_mul_inc - app11_try_rom
  ADD R2, R2, R8
  LW R1, R2, #0 ; 0x6D2B79F5
  ; __PERTURB_TRY_PRNG__
  ADD R0, R0, R1
  LI R2, #c_pow32 - app11_try_rom
  ADD R2, R2, R8
  LW R4, R2, #0 ; 2^32
  MOD R0, R0, R4
  SW R0, R6, #0 ; a = t

  MOV R5, R0 ; t
  LI R2, #c_pow15 - app11_try_rom
  ADD R2, R2, R8
  LW R2, R2, #0 ; 32768
  DIV R1, R5, R2
  MOV R0, R5
  CALLX try_xor32 ; R0 = t ^ (t >>> 15)

  LI R2, #2
  MOD R1, R5, R2
  CMPI R1, #0
  JNZX tm32_odd1
  ADDI R1, R5, #1
  JMPX tm32_m1
tm32_odd1:
  MOV R1, R5
tm32_m1:
  CALLX try_imul32
  MOV R5, R0 ; t = imul(t ^ (t>>>15), t | 1)

  LI R2, #128
  DIV R1, R5, R2
  CALLX try_xor32 ; R0 = t ^ (t >>> 7)

  ; u2 = (t - (t % 64)) + 61 + ((t / 2) % 2) * 2
  LI R2, #64
  MOD R1, R5, R2
  SUB R1, R5, R1
  ADDI R1, R1, #61
  LI R2, #2
  DIV R3, R5, R2
  MOD R3, R3, R2
  MULI R3, R3, #2
  ADD R1, R1, R3 ; u2 = t | 61

  CALLX try_imul32
  ADD R1, R5, R0
  MOD R1, R1, R4 ; (t + imul(...)) % 2^32
  MOV R0, R5
  CALLX try_xor32
  MOV R5, R0 ; t ^= u3

  LI R2, #c_pow14 - app11_try_rom
  ADD R2, R2, R8
  LW R2, R2, #0 ; 16384
  DIV R1, R5, R2
  MOV R0, R5
  CALLX try_xor32 ; R0 = t ^ (t >>> 14)

  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

; ----------------------------------------------------------------------------
; Bag Generator:
; try_get_vocab_sig() -> R0 (0=TET4, 1=CURSED16, 2=HEX12)
; try_sync_bag_vocab()
; try_refill_bag()
; try_next_piece() -> R0 (piece id 1..16)
; try_update_next3()
; ----------------------------------------------------------------------------
try_get_vocab_sig:
  PUSH R1
  PUSH R2
  LI R1, #5003
  ADD R2, R8, R1
  LT R0, R2, #0 ; mode
  CMPI R0, #2
  JZX tgvs_hex
  CMPI R0, #1
  JNZX tgvs_tet
  LT R1, R2, #5 ; level (+5008)
  CMPI R1, #5
  JNX tgvs_tet
  LI R0, #1 ; CURSED16
  JMPX tgvs_done
tgvs_hex:
  LI R0, #2 ; HEX12
  JMPX tgvs_done
tgvs_tet:
  LI R0, #0 ; TET4
tgvs_done:
  POP R2
  POP R1
  RET

try_sync_bag_vocab:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  CALLX try_get_vocab_sig ; R0 = sig
  LI R1, #5377
  ADD R6, R8, R1
  LT R2, R6, #0 ; last_vocab_sig
  CMP R0, R2
  JZX tsbv_done

  ; Filter bag[0..bag_len-1] by allowed ids for sig R0
  ; sig=0 -> 1..4; sig=1 -> 1..16; sig=2 -> 5..16
  LI R1, #5376
  ADD R5, R8, R1
  LT R3, R5, #0 ; bag_len
  LI R4, #0 ; read idx
  LI R5, #0 ; write idx
  LI R1, #5380
  ADD R1, R1, R8 ; &bag[0]
tsbv_flt_lp:
  CMP R4, R3
  JNNX tsbv_flt_end
  ADD R6, R1, R4
  LT R6, R6, #0 ; id
  CMPI R0, #0
  JNZX tsbv_chk_hex
  CMPI R6, #5
  JNNX tsbv_skip
  JMPX tsbv_keep
tsbv_chk_hex:
  CMPI R0, #2
  JNZX tsbv_keep
  CMPI R6, #5
  JNX tsbv_skip
tsbv_keep:
  ADD R7, R1, R5
  ST R6, R7, #0
  ADDI R5, R5, #1
tsbv_skip:
  ADDI R4, R4, #1
  JMPX tsbv_flt_lp
tsbv_flt_end:
  ; If sig==1 (CURSED16) && last==0 (TET4) -> flush bag
  CMPI R0, #1
  JNZX tsbv_save_len
  CMPI R2, #0
  JNZX tsbv_save_len
  LI R5, #0
tsbv_save_len:
  LI R1, #5376
  ADD R6, R8, R1
  ST R5, R6, #0 ; bag_len = R5
  ST R0, R6, #1 ; last_vocab_sig = R0
tsbv_done:
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

try_refill_bag:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  CALLX try_get_vocab_sig ; R0 = 0 (1..4), 1 (1..16), 2 (5..16)
  LI R1, #5420
  ADD R5, R8, R1 ; &vocab_tmp[0]
  CMPI R0, #0
  JZX trb_tet
  CMPI R0, #1
  JZX trb_cur
  ; HEX12: 12 items 5..16
  LI R2, #12
  LI R3, #5
  JMPX trb_fill
trb_cur:
  LI R2, #16
  LI R3, #1
  JMPX trb_fill
trb_tet:
  LI R2, #4
  LI R3, #1
trb_fill:
  LI R4, #0
trb_flp:
  CMP R4, R2
  JNNX trb_shuf
  ADD R6, R5, R4
  ADD R7, R3, R4
  ST R7, R6, #0
  ADDI R4, R4, #1
  JMPX trb_flp
trb_shuf:
  ; Fisher-Yates: i = R2 - 1 down to 1
  SUBI R3, R2, #1
  LI R7, #c_pow32 - app11_try_rom
  ADD R7, R7, R8
  LW R7, R7, #0 ; 2^32
trb_slp:
  CMPI R3, #1
  JNX trb_append
  CALLX try_mulberry32 ; R0 = u32
  ADDI R4, R3, #1
  MUL R0, R0, R4
  DIV R4, R0, R7 ; j = floor(u32 * (i + 1) / 2^32)
  ADD R0, R5, R3
  ADD R1, R5, R4
  LT R6, R0, #0
  LT R4, R1, #0
  ST R4, R0, #0
  ST R6, R1, #0
  SUBI R3, R3, #1
  JMPX trb_slp
trb_append:
  LI R1, #5376
  ADD R6, R8, R1
  LT R3, R6, #0 ; bag_len
  LI R1, #5380
  ADD R1, R1, R8 ; &bag[0]
  ADD R1, R1, R3
  MOV R0, R1
  MOV R1, R5
  MOV R4, R2
  BCOPY R0, R1, R4
  ADD R3, R3, R2
  ST R3, R6, #0
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

try_next_piece:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  CALLX try_sync_bag_vocab
  LI R1, #5376
  ADD R4, R8, R1
tnp_fill_lp:
  LT R0, R4, #0 ; bag_len
  CMPI R0, #3
  JPX tnp_pop
  CALLX try_refill_bag
  JMPX tnp_fill_lp
tnp_pop:
  LI R1, #5380
  ADD R1, R1, R8
  LT R3, R1, #0 ; bag[0]
  SUBI R0, R0, #1
  ST R0, R4, #0 ; bag_len--
  ; Shift bag[1..bag_len] left by 1
  MOV R2, R0
  MOV R0, R1
  ADDI R1, R1, #1
  CMPI R2, #0
  JNPX tnp_ret
  BCOPY R0, R1, R2
tnp_ret:
  MOV R0, R3
  POP R4
  POP R3
  POP R2
  POP R1
  RET

try_update_next3:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  CALLX try_sync_bag_vocab
  LI R1, #5376
  ADD R3, R8, R1
tun3_lp:
  LT R0, R3, #0 ; bag_len
  CMPI R0, #3
  JNNX tun3_cp
  CALLX try_refill_bag
  JMPX tun3_lp
tun3_cp:
  LI R1, #5380
  ADD R1, R1, R8
  LI R2, #5016
  ADD R0, R8, R2
  LI R2, #3
  BCOPY R0, R1, R2
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; ----------------------------------------------------------------------------
; Piece Geometry & Placement
; try_get_piece_shape(R0=id 1..16, R1=rot) -> R2=order (4/6), R3=&cells[0]
; try_can_place(R0=id, R1=rot, R2=r, R3=c) -> R0=1 if valid, 0 if invalid
; ----------------------------------------------------------------------------
try_get_piece_shape:
  PUSH R0
  PUSH R1
  PUSH R4
  SUBI R0, R0, #1
  MULI R0, R0, #4
  LI R4, #try_piece_meta - app11_try_rom
  ADD R4, R4, R8
  ADD R4, R4, R0
  LT R2, R4, #0 ; order (4 or 6)
  LT R3, R4, #3 ; base cell offset
  MUL R1, R1, R2
  MULI R1, R1, #2
  ADD R3, R3, R1
  LI R4, #try_piece_cells - app11_try_rom
  ADD R4, R4, R8
  ADD R3, R3, R4
  POP R4
  POP R1
  POP R0
  RET

try_can_place:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  ; Check (r + c) parity == 0
  ADD R4, R2, R3
  LI R5, #2
  MOD R4, R4, R5
  CMPI R4, #0
  JNZX tcp_no
  MOV R4, R2 ; anchorR
  MOV R5, R3 ; anchorC
  CALLX try_get_piece_shape ; R2 = order, R3 = &cells[0]
  LI R6, #5019
  ADD R6, R6, R8 ; &board[0]
tcp_lp:
  CMPI R2, #0
  JNPX tcp_yes
  LT R0, R3, #0 ; dr
  ADD R0, R0, R4 ; r
  CMPI R0, #0
  JNX tcp_no
  CMPI R0, #28
  JNNX tcp_no
  LT R1, R3, #1 ; dc
  ADD R1, R1, R5 ; c
  CMPI R1, #0
  JNX tcp_no
  CMPI R1, #12
  JNNX tcp_no
  MULI R0, R0, #12
  ADD R0, R0, R1
  ADD R0, R0, R6
  LT R7, R0, #0
  CMPI R7, #0
  JNZX tcp_no
  ADDI R3, R3, #2
  SUBI R2, R2, #1
  JMPX tcp_lp
tcp_yes:
  LI R0, #1
  JMPX tcp_ret
tcp_no:
  LI R0, #0
tcp_ret:
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

; ----------------------------------------------------------------------------
; Engine Actions: spawn, moveHorizontal, rotate, stepGravityDown, softDrop, hardDrop, tick
; ----------------------------------------------------------------------------
try_spawn_next:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R6
  CALLX try_next_piece ; R0 = id 1..16
  LI R1, #5012
  ADD R6, R8, R1
  ST R0, R6, #0 ; active_id
  LI R1, #0
  ST R1, R6, #1 ; active_rot = 0
  LI R2, #1
  ST R2, R6, #2 ; active_r = 1
  LI R3, #3
  ST R3, R6, #3 ; active_c = 3
  CALLX try_can_place
  CMPI R0, #0
  JNZX tsn_ok
  LI R1, #1
  ST R1, R6, #-1 ; gameOver = 1 (+5011)
tsn_ok:
  CALLX try_update_next3
  POP R6
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; try_move_horiz(R0 = -1 or +1)
try_move_horiz:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  MOV R4, R0 ; dir
  LI R5, #5011
  ADD R6, R8, R5
  LT R0, R6, #0 ; gameOver
  CMPI R0, #0
  JNZX tmh_done
  LT R0, R6, #1 ; active_id
  CMPI R0, #0
  JZX tmh_done
  LT R1, R6, #2 ; active_rot
  LT R2, R6, #3 ; active_r
  LT R3, R6, #4 ; active_c
  MULI R5, R4, #2
  ADD R3, R3, R5
  CALLX try_can_place
  CMPI R0, #0
  JZX tmh_try_diag
  ST R3, R6, #4
  JMPX tmh_done
tmh_try_diag:
  LT R0, R6, #1
  LT R1, R6, #2
  LT R2, R6, #3
  LT R3, R6, #4
  ADDI R2, R2, #1
  ADD R3, R3, R4
  CALLX try_can_place
  CMPI R0, #0
  JZX tmh_done
  ST R2, R6, #3
  ST R3, R6, #4
tmh_done:
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; try_rotate(R0 = +1 or -1)
try_rotate:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  MOV R4, R0 ; dir
  LI R5, #5011
  ADD R6, R8, R5
  LT R0, R6, #0 ; gameOver
  CMPI R0, #0
  JNZX trt_done
  LT R0, R6, #1 ; active_id
  CMPI R0, #0
  JZX trt_done
  SUBI R1, R0, #1
  MULI R1, R1, #4
  LI R5, #try_piece_meta - app11_try_rom
  ADD R5, R5, R8
  ADD R5, R5, R1
  LT R5, R5, #1 ; symmetryOrder
  CMPI R5, #1
  JNPX trt_done
  LT R1, R6, #2 ; rotIndex
  ADD R1, R1, R4
  ADD R1, R1, R5
  MOD R4, R1, R5 ; nextRot
  LI R5, #0 ; kick idx 0..7
  LI R7, #try_kicks - app11_try_rom
  ADD R7, R7, R8
trt_klp:
  CMPI R5, #8
  JNNX trt_done
  MULI R1, R5, #2
  ADD R1, R1, R7
  LT R2, R6, #3 ; r
  LT R0, R1, #0 ; dr
  ADD R2, R2, R0
  LT R3, R6, #4 ; c
  LT R0, R1, #1 ; dc
  ADD R3, R3, R0
  LT R0, R6, #1 ; active_id
  MOV R1, R4    ; nextRot
  CALLX try_can_place
  CMPI R0, #0
  JNZX trt_accept
  ADDI R5, R5, #1
  JMPX trt_klp
trt_accept:
  ST R4, R6, #2
  ST R2, R6, #3
  ST R3, R6, #4
trt_done:
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; try_step_grav() -> R0=1 if moved, 0 if blocked
try_step_grav:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  LI R5, #5012
  ADD R6, R8, R5
  LT R0, R6, #0 ; active_id
  CMPI R0, #0
  JZX tsg_no
  LT R1, R6, #1 ; rot
  LT R2, R6, #2 ; r
  LT R3, R6, #3 ; c
  LI R5, #2
  MOD R4, R2, R5
  LI R5, #1
  CMPI R4, #0
  JZX tsg_zig_ok
  LI R5, #-1
tsg_zig_ok:
  ; 1. (r+1, c+zigDir)
  ADDI R2, R2, #1
  ADD R3, R3, R5
  CALLX try_can_place
  CMPI R0, #0
  JNZX tsg_yes
  ; 2. (r+1, c-zigDir)
  LT R0, R6, #0
  LT R1, R6, #1
  LT R2, R6, #2
  LT R3, R6, #3
  ADDI R2, R2, #1
  SUB R3, R3, R5
  CALLX try_can_place
  CMPI R0, #0
  JNZX tsg_yes
  ; 3. (r+2, c)
  LT R0, R6, #0
  LT R1, R6, #1
  LT R2, R6, #2
  LT R3, R6, #3
  ADDI R2, R2, #2
  CALLX try_can_place
  CMPI R0, #0
  JZX tsg_no
tsg_yes:
  ST R2, R6, #2
  ST R3, R6, #3
  LI R0, #1
  JMPX tsg_ret
tsg_no:
  LI R0, #0
tsg_ret:
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

try_soft_drop:
  PUSH R0
  PUSH R6
  LI R0, #5011
  ADD R6, R8, R0
  LT R0, R6, #0 ; gameOver
  CMPI R0, #0
  JNZX trysd_done
  LT R0, R6, #1 ; active_id
  CMPI R0, #0
  JZX trysd_done
  CALLX try_step_grav
  CMPI R0, #0
  JNZX trysd_done
  CALLX try_lock_piece
trysd_done:
  POP R6
  POP R0
  RET

try_hard_drop:
  PUSH R0
  PUSH R6
  LI R0, #5011
  ADD R6, R8, R0
  LT R0, R6, #0 ; gameOver
  CMPI R0, #0
  JNZX thd_done
  LT R0, R6, #1 ; active_id
  CMPI R0, #0
  JZX thd_done
thd_lp:
  CALLX try_step_grav
  CMPI R0, #0
  JNZX thd_lp
  CALLX try_lock_piece
thd_done:
  POP R6
  POP R0
  RET

; try_tick(R0 = 0:null, 1:LEFT, 2:RIGHT, 3:ROT_CW, 4:ROT_CCW, 5:HARD)
try_tick:
  PUSH R0
  PUSH R1
  PUSH R4
  PUSH R6
  MOV R4, R0
  LI R1, #5011
  ADD R6, R8, R1
  LT R0, R6, #0 ; gameOver
  CMPI R0, #0
  JNZX ttk_done

  ; Pre-cleared check at start of tick (lockContext = null -> R0 = 0)
  LI R0, #0
  LI R1, #0
  CALLX try_resolve_rows
  CMPI R0, #0
  JPX ttk_done

  CMPI R4, #1
  JZX ttk_left
  CMPI R4, #2
  JZX ttk_right
  CMPI R4, #3
  JZX ttk_rcw
  CMPI R4, #4
  JZX ttk_rccw
  CMPI R4, #5
  JZX ttk_hard
  JMPX ttk_grav
ttk_left:
  LI R0, #-1
  CALLX try_move_horiz
  JMPX ttk_grav
ttk_right:
  LI R0, #1
  CALLX try_move_horiz
  JMPX ttk_grav
ttk_rcw:
  LI R0, #1
  CALLX try_rotate
  JMPX ttk_grav
ttk_rccw:
  LI R0, #-1
  CALLX try_rotate
  JMPX ttk_grav
ttk_hard:
  CALLX try_hard_drop
  JMPX ttk_done
ttk_grav:
  CALLX try_step_grav
  CMPI R0, #0
  JNZX ttk_done
  CALLX try_lock_piece
ttk_done:
  POP R6
  POP R4
  POP R1
  POP R0
  RET

; try_lock_piece: writes active_id into board, resolves rows, checks buffer, spawns next
try_lock_piece:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  LI R1, #5012
  ADD R6, R8, R1
  LT R0, R6, #0 ; active_id
  CMPI R0, #0
  JZX trylp_done
  LT R1, R6, #1 ; rot
  LT R4, R6, #2 ; anchorR
  LT R5, R6, #3 ; anchorC
  CALLX try_get_piece_shape ; R2 = order, R3 = &cells[0]
  LI R7, #5019
  ADD R7, R7, R8 ; &board[0]
  PUSH R0 ; save active_id
  LI R0, #99 ; minR
  LI R1, #-1 ; maxR
trylp_wr_lp:
  CMPI R2, #0
  JNPX trylp_wr_done
  PUSH R2
  LT R2, R3, #0 ; dr
  ADD R2, R2, R4 ; r
  CMP R2, R0
  JNNX trylp_min_ok
  MOV R0, R2
trylp_min_ok:
  CMP R2, R1
  JNPX trylp_max_ok
  MOV R1, R2
trylp_max_ok:
  LT R6, R3, #1 ; dc
  ADD R6, R6, R5 ; c
  CMPI R2, #0
  JNX trylp_skip_cell
  CMPI R2, #28
  JNNX trylp_skip_cell
  CMPI R6, #0
  JNX trylp_skip_cell
  CMPI R6, #12
  JNNX trylp_skip_cell
  MULI R2, R2, #12
  ADD R2, R2, R6
  ADD R2, R2, R7
  POP R6 ; order
  POP R7 ; active_id
  ST R7, R2, #0
  PUSH R7
  PUSH R6
  LI R7, #5019
  ADD R7, R7, R8
trylp_skip_cell:
  POP R2
  ADDI R3, R3, #2
  SUBI R2, R2, #1
  JMPX trylp_wr_lp
trylp_wr_done:
  POP R2 ; active_id
  ; lockedRows.size >= 2 iff minR != maxR
  LI R3, #0
  CMP R0, R1
  JZX trylp_span_ok
  LI R3, #1
trylp_span_ok:
  ; isHexSpan2 = (mode==1 || mode==2) && active_id >= 5 && span2
  LI R0, #5003
  ADD R6, R8, R0
  LT R0, R6, #0 ; mode
  LI R1, #0
  CMPI R0, #0
  JZX trylp_res
  CMPI R2, #5
  JNX trylp_res
  MOV R1, R3
trylp_res:
  LI R0, #1 ; hasLockContext = 1
  CALLX try_resolve_rows

  ; Check buffer rows 0..3 (48 cells at +5019..5066)
  LI R7, #5019
  ADD R7, R7, R8
  LI R0, #0
trylp_buf_lp:
  CMPI R0, #48
  JNNX trylp_buf_ok
  ADD R1, R7, R0
  LT R2, R1, #0
  CMPI R2, #0
  JNZX trylp_gameover
  ADDI R0, R0, #1
  JMPX trylp_buf_lp
trylp_gameover:
  LI R1, #5011
  ADD R6, R8, R1
  LI R0, #1
  ST R0, R6, #0 ; gameOver = 1
  JMPX trylp_done
trylp_buf_ok:
  CALLX try_spawn_next
trylp_done:
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; try_resolve_rows(R0 = hasLockContext, R1 = isHexSpan2) -> R0 = count
try_resolve_rows:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  LI R2, #5440
  ADD R5, R8, R2 ; scratch: row_is_full[0..27]
  LI R2, #5019
  ADD R6, R8, R2 ; &board[0]
  LI R2, #0 ; count = 0
  PUSH R0
  LI R3, #0 ; r = 0..27
trr_scan_lp:
  CMPI R3, #28
  JNNX trr_scan_done
  MULI R4, R3, #12
  ADD R4, R4, R6
  LI R7, #0 ; c = 0..11
trr_col_lp:
  CMPI R7, #12
  JNNX trr_is_full
  ADD R0, R4, R7
  LT R0, R0, #0
  CMPI R0, #0
  JZX trr_not_full
  ADDI R7, R7, #1
  JMPX trr_col_lp
trr_is_full:
  LI R7, #1
  ADDI R2, R2, #1
  JMPX trr_st_full
trr_not_full:
  LI R7, #0
trr_st_full:
  ADD R4, R5, R3
  ST R7, R4, #0
  ADDI R3, R3, #1
  JMPX trr_scan_lp

trr_scan_done:
  POP R0
  CMPI R2, #0
  JNZX trr_collapse
  ; count == 0
  CMPI R0, #0
  JZX trr_ret0
  LI R3, #5009
  ADD R4, R8, R3
  LI R3, #0
  ST R3, R4, #0 ; comboStreak = 0
trr_ret0:
  LI R0, #0
  JMPX trr_ret

trr_collapse:
  ; Collapse non-full rows downward from r=27..0 into dst=27..0
  PUSH R0 ; save hasLockContext
  PUSH R1 ; save isHexSpan2
  PUSH R2 ; save count
  LI R3, #27 ; src r
  LI R4, #27 ; dst r
trr_col_dn:
  CMPI R3, #0
  JNX trr_fill_top
  ADD R0, R5, R3
  LT R0, R0, #0 ; is_full[r]
  CMPI R0, #0
  JNZX trr_col_skip
  CMP R3, R4
  JZX trr_col_same
  ; Copy row R3 -> row R4
  MULI R0, R4, #12
  ADD R0, R0, R6
  MULI R1, R3, #12
  ADD R1, R1, R6
  ; __PERTURB_TRY_COLLAPSE__
  JMPX trr_col_copied
trr_col_same:
  ; __PERTURB_TRY_COLLAPSE_SAME__
trr_col_copied:
  SUBI R4, R4, #1
trr_col_skip:
  SUBI R3, R3, #1
  JMPX trr_col_dn
trr_fill_top:
  CMPI R4, #0
  JNX trr_score
  MULI R0, R4, #12
  ADD R0, R0, R6
  LI R1, #0
  LI R2, #12
  BFILL R0, R1, R2
  SUBI R4, R4, #1
  JMPX trr_fill_top

trr_score:
  POP R2 ; count
  POP R1 ; isHexSpan2
  POP R0 ; hasLockContext
  LI R3, #5000
  ADD R6, R8, R3 ; &TRY_STATE

  ; baseScore = (1:100, 2:300, 3:500, 4+:800+200*(count-4)) * level
  LI R3, #100
  CMPI R2, #1
  JZX trr_base_ok
  LI R3, #300
  CMPI R2, #2
  JZX trr_base_ok
  LI R3, #500
  CMPI R2, #3
  JZX trr_base_ok
  SUBI R3, R2, #4
  MULI R3, R3, #200
  ADDI R3, R3, #800
trr_base_ok:
  LT R4, R6, #8 ; level
  MUL R3, R3, R4 ; baseScore

  ; comboStreak
  LT R4, R6, #9 ; comboStreak
  CMPI R0, #0
  JZX trr_cmb_noctx
  ADDI R4, R4, #1
  JMPX trr_cmb_ok
trr_cmb_noctx:
  CMPI R4, #1
  JNNX trr_cmb_ok
  LI R4, #1
trr_cmb_ok:
  ST R4, R6, #9 ; comboStreak

  ; comboIdx = min(4, max(0, comboStreak - 1)) -> half-units [2, 3, 4, 5, 6]
  SUBI R4, R4, #1
  CMPI R4, #0
  JNNX trr_ci0
  LI R4, #0
trr_ci0:
  CMPI R4, #4
  JNPX trr_ci1
  LI R4, #4
trr_ci1:
  LI R5, #try_combo_halves - app11_try_rom
  ADD R5, R5, R8
  ADD R5, R5, R4
  LT R4, R5, #0 ; c_half (2..6)

  ; isDifficult = (count >= 3) || (hasLockContext && isHexSpan2)
  LI R5, #0
  CMPI R2, #3
  JNNX trr_diff_yes
  CMPI R0, #0
  JZX trr_diff_ok
  CMPI R1, #0
  JZX trr_diff_ok
trr_diff_yes:
  LI R5, #1
trr_diff_ok:
  LT R7, R6, #10 ; backToBackActive
  ST R5, R6, #10 ; backToBackActive = isDifficult
  LI R0, #2 ; b_half = 2 (1.0x)
  CMPI R5, #0
  JZX trr_b2b_ok
  CMPI R7, #0
  JZX trr_b2b_ok
  LI R0, #3 ; b_half = 3 (1.5x)
trr_b2b_ok:
  ; earned = floor((baseScore * c_half * b_half + 2) / 4)
  MUL R3, R3, R4
  MUL R3, R3, R0
  ADDI R3, R3, #2
  LI R4, #4
  DIV R3, R3, R4

  LW R0, R6, #4 ; score
  ADD R0, R0, R3
  SW R0, R6, #4 ; score += earned

  ; Update high_score if score > high_score
  LI R1, #5360
  ADD R5, R8, R1
  LW R1, R5, #0 ; high_score
  CMP R0, R1
  JNPX trr_hi_ok
  SW R0, R5, #0
  LI R0, #str_try_hifn - app11_try_rom
  ADD R0, R0, R8
  MOV R1, R5
  LI R3, #1
  PUSH R2
  LI R2, #3
  SYSCALL #32
  POP R2
trr_hi_ok:
  ; lines += count; level = max(level, min(15, 1 + floor(lines / 10)))
  LT R0, R6, #7
  ADD R0, R0, R2
  ST R0, R6, #7
  LI R1, #10
  DIV R0, R0, R1
  ADDI R0, R0, #1
  CMPI R0, #15
  JNPX trr_lv_cap
  LI R0, #15
trr_lv_cap:
  LT R1, R6, #8
  CMP R0, R1
  JNPX trr_lv_done
  ST R0, R6, #8
trr_lv_done:
  MOV R0, R2
trr_ret:
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

; ----------------------------------------------------------------------------
; Rendering:
; - Triangular board (12x24 visible rows) into board_fb (66x144) -> blitted at (4, 2)
; - T/Z/F readout (12x24 visible rows) into tzf_fb (72x144) -> blitted at (162, 2)
; - HUD at x=74..158
; ----------------------------------------------------------------------------
try_draw_tri_in_buf:
  ; R0=vr (0..23), R1=c (0..11), R2=color, R3=outline_only (0=fill, 1=outline)
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  ADDI R4, R0, #4 ; r = vr + 4
  ADD R4, R4, R1
  LI R5, #2
  MOD R4, R4, R5 ; parity (0=UP, !=0=DOWN)
  MULI R0, R0, #6 ; y_top = vr * 6
  MULI R1, R1, #5 ; x_left = c * 5
  MULI R0, R0, #66
  ADD R0, R0, R1
  LI R5, #6000
  ADD R5, R5, R8
  ADD R0, R0, R5 ; ptr to (x_left, y_top) in board_fb
  LI R5, #0 ; dy = 0..5
tdtb_ylp:
  CMPI R5, #6
  JNNX tdtb_done
  CMPI R4, #0
  JZX tdtb_up
  ; DOWN: dx_start = dy, dx_end = 10 - dy
  MOV R6, R5
  LI R7, #10
  SUB R7, R7, R5
  JMPX tdtb_dx_ok
tdtb_up:
  ; UP: dx_start = 5 - dy, dx_end = 5 + dy
  LI R6, #5
  SUB R6, R6, R5
  LI R7, #5
  ADD R7, R7, R5
tdtb_dx_ok:
  CMPI R3, #0
  JNZX tdtb_outline
  ; Fill R6..R7
  PUSH R0
  ADD R0, R0, R6
  SUB R1, R7, R6
  ADDI R1, R1, #1
  BFILL R0, R2, R1
  POP R0
  JMPX tdtb_ynx
tdtb_outline:
  PUSH R0
  ADD R1, R0, R6
  ST R2, R1, #0
  ADD R1, R0, R7
  ST R2, R1, #0
  POP R0
tdtb_ynx:
  ADDI R0, R0, #66
  ADDI R5, R5, #1
  JMPX tdtb_ylp
tdtb_done:
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; try_draw_tzf_cell: R0=vr (0..23), R1=c (0..11), R2=char_idx (0='Z', 1='T', 2='F'), R3=fg
try_draw_tzf_cell:
  PUSH R0
  PUSH R1
  PUSH R4
  MULI R0, R0, #432 ; vr * 6 * 72
  MULI R1, R1, #6
  ADD R0, R0, R1
  LI R4, #16000 - 19683
  LMI R4, #1
  ADD R4, R4, R8
  ADD R0, R0, R4 ; ptr in tzf_fb
  ; Top bar (row 0, cols 0..4) is common to Z, T, F!
  ST R3, R0, #0
  ST R3, R0, #1
  ST R3, R0, #2
  ST R3, R0, #3
  ST R3, R0, #4
  CMPI R2, #1
  JZX tdtc_t
  CMPI R2, #2
  JZX tdtc_f
  ; 'Z'
  ST R3, R0, #75  ; r1 c3
  ST R3, R0, #146 ; r2 c2
  ST R3, R0, #217 ; r3 c1
  ST R3, R0, #288 ; r4 c0..4
  ST R3, R0, #289
  ST R3, R0, #290
  ST R3, R0, #291
  ST R3, R0, #292
  JMPX tdtc_done
tdtc_t:
  ; 'T'
  ST R3, R0, #74  ; r1 c2
  ST R3, R0, #146 ; r2 c2
  ST R3, R0, #218 ; r3 c2
  ST R3, R0, #290 ; r4 c2
  JMPX tdtc_done
tdtc_f:
  ; 'F'
  ST R3, R0, #72  ; r1 c0
  ST R3, R0, #144 ; r2 c0..3
  ST R3, R0, #145
  ST R3, R0, #146
  ST R3, R0, #147
  ST R3, R0, #216 ; r3 c0
  ST R3, R0, #288 ; r4 c0
tdtc_done:
  POP R4
  POP R1
  POP R0
  RET

try_redraw:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7

  ; 1. Clear board_fb (+6000, 9504 trytes) with -350 (empty)
  LI R0, #6000
  ADD R0, R0, R8
  LI R1, #-350
  LI R2, #9504
  BFILL R0, R1, R2

  ; 2. Draw locked board cells (vr=0..23 -> r=4..27)
  LI R4, #5019
  ADD R4, R4, R8
  LI R5, #0 ; vr = 0..23
tryrd_bylp:
  CMPI R5, #24
  JNNX tryrd_ghost
  LI R6, #0 ; c = 0..11
tryrd_bxlp:
  CMPI R6, #12
  JNNX tryrd_bynx
  ADDI R0, R5, #4
  MULI R0, R0, #12
  ADD R0, R0, R6
  ADD R0, R0, R4
  LT R2, R0, #0 ; piece id 0..16
  CMPI R2, #0
  JZX tryrd_bxnx
  SUBI R2, R2, #1
  MULI R2, R2, #4
  LI R3, #try_piece_meta - app11_try_rom
  ADD R3, R3, R8
  ADD R2, R2, R3
  LT R2, R2, #2 ; color
  MOV R0, R5
  MOV R1, R6
  LI R3, #0 ; fill
  CALLX try_draw_tri_in_buf
tryrd_bxnx:
  ADDI R6, R6, #1
  JMPX tryrd_bxlp
tryrd_bynx:
  ADDI R5, R5, #1
  JMPX tryrd_bylp

tryrd_ghost:
  LI R1, #5011
  ADD R6, R8, R1
  LT R0, R6, #0 ; gameOver
  CMPI R0, #0
  JNZX tryrd_tzf
  LT R0, R6, #1 ; active_id
  CMPI R0, #0
  JZX tryrd_hud
  LT R1, R6, #2 ; rot
  LT R2, R6, #3 ; r
  LT R3, R6, #4 ; c
  ; Drop ghost down to landing position
tryrd_gh_lp:
  LI R5, #2
  MOD R4, R2, R5
  LI R5, #1
  CMPI R4, #0
  JZX tryrd_gh_z
  LI R5, #-1
tryrd_gh_z:
  ADDI R2, R2, #1
  ADD R3, R3, R5
  CALLX try_can_place
  CMPI R0, #0
  JNZX tryrd_gh_lp_ok
  SUB R3, R3, R5
  SUB R3, R3, R5
  CALLX try_can_place
  CMPI R0, #0
  JNZX tryrd_gh_lp_ok
  ADD R3, R3, R5
  ADDI R2, R2, #1
  CALLX try_can_place
  CMPI R0, #0
  JNZX tryrd_gh_lp_ok
  SUBI R2, R2, #2
  JMPX tryrd_gh_draw
tryrd_gh_lp_ok:
  LT R0, R6, #1
  JMPX tryrd_gh_lp
tryrd_gh_draw:
  ; Draw ghost at (R2, R3) as outline (color -200)
  MOV R4, R2
  MOV R5, R3
  LT R0, R6, #1
  LT R1, R6, #2
  CALLX try_get_piece_shape ; R2=order, R3=&cells
tryrd_gd_lp:
  CMPI R2, #0
  JNPX tryrd_active
  LT R0, R3, #0
  ADD R0, R0, R4
  SUBI R0, R0, #4 ; vr
  CMPI R0, #0
  JNX tryrd_gd_nx
  CMPI R0, #24
  JNNX tryrd_gd_nx
  LT R1, R3, #1
  ADD R1, R1, R5 ; c
  PUSH R2
  PUSH R3
  LI R2, #-200
  LI R3, #1 ; outline only!
  CALLX try_draw_tri_in_buf
  POP R3
  POP R2
tryrd_gd_nx:
  ADDI R3, R3, #2
  SUBI R2, R2, #1
  JMPX tryrd_gd_lp

tryrd_active:
  LT R0, R6, #1 ; active_id
  LT R1, R6, #2 ; rot
  LT R4, R6, #3 ; r
  LT R5, R6, #4 ; c
  SUBI R7, R0, #1
  MULI R7, R7, #4
  LI R2, #try_piece_meta - app11_try_rom
  ADD R2, R2, R8
  ADD R7, R7, R2
  LT R7, R7, #2 ; active color
  CALLX try_get_piece_shape ; R2=order, R3=&cells
tryrd_ac_lp:
  CMPI R2, #0
  JNPX tryrd_tzf
  LT R0, R3, #0
  ADD R0, R0, R4
  SUBI R0, R0, #4 ; vr
  CMPI R0, #0
  JNX tryrd_ac_nx
  CMPI R0, #24
  JNNX tryrd_ac_nx
  LT R1, R3, #1
  ADD R1, R1, R5 ; c
  PUSH R2
  PUSH R3
  MOV R2, R7
  LI R3, #0 ; fill
  CALLX try_draw_tri_in_buf
  POP R3
  POP R2
tryrd_ac_nx:
  ADDI R3, R3, #2
  SUBI R2, R2, #1
  JMPX tryrd_ac_lp

tryrd_tzf:
  ; Build tzf_fb (+16000, 10368 trytes) from board + active piece
  LI R0, #16000 - 19683
  LMI R0, #1
  ADD R0, R0, R8
  LI R1, #COL_BLACK
  LI R2, #10368 - 19683
  LMI R2, #1
  BFILL R0, R1, R2

  ; Temporarily check each visible cell (r=4..27, c=0..11):
  ; Occupied if board[r][c] != 0 OR in activePiece
  LI R5, #0 ; vr = 0..23
tryrd_tz_rlp:
  CMPI R5, #24
  JNNX tryrd_blit
  LI R6, #0 ; c = 0..11
tryrd_tz_clp:
  CMPI R6, #12
  JNNX tryrd_tz_rnx
  ADDI R0, R5, #4
  MULI R0, R0, #12
  ADD R0, R0, R6
  LI R1, #5019
  ADD R1, R1, R8
  ADD R0, R0, R1
  LT R2, R0, #0
  CMPI R2, #0
  JNZX tryrd_tz_occ

  ; Check active piece (only if gameOver == 0)
  LI R1, #5011
  ADD R4, R8, R1
  LT R0, R4, #0 ; gameOver
  CMPI R0, #0
  JNZX tryrd_tz_empty
  LT R0, R4, #1 ; active_id
  CMPI R0, #0
  JZX tryrd_tz_empty
  LT R1, R4, #2 ; rot
  CALLX try_get_piece_shape ; R2=order, R3=&cells
  LT R0, R4, #3 ; active_r
  LT R4, R4, #4 ; active_c
  ADDI R7, R5, #4 ; target r
tryrd_tz_alp:
  CMPI R2, #0
  JNPX tryrd_tz_empty
  LT R1, R3, #0
  ADD R1, R1, R0
  CMP R1, R7
  JNZX tryrd_tz_anx
  LT R1, R3, #1
  ADD R1, R1, R4
  CMP R1, R6
  JZX tryrd_tz_occ
tryrd_tz_anx:
  ADDI R3, R3, #2
  SUBI R2, R2, #1
  JMPX tryrd_tz_alp

tryrd_tz_empty:
  LI R2, #0 ; 'Z'
  LI R3, #-250
  JMPX tryrd_tz_draw
tryrd_tz_occ:
  ADDI R0, R5, #4
  ADD R0, R0, R6
  LI R1, #2
  MOD R0, R0, R1
  CMPI R0, #0
  JNZX tryrd_tz_f
  LI R2, #1 ; 'T'
  LI R3, #COL_CYAN
  JMPX tryrd_tz_draw
tryrd_tz_f:
  LI R2, #2 ; 'F'
  LI R3, #COL_YELLOW
tryrd_tz_draw:
  MOV R0, R5
  MOV R1, R6
  CALLX try_draw_tzf_cell
  ADDI R6, R6, #1
  JMPX tryrd_tz_clp
tryrd_tz_rnx:
  ADDI R5, R5, #1
  JMPX tryrd_tz_rlp

tryrd_blit:
  ; Blit board_fb (66x144) at (4, 2)
  LI R0, #4
  LI R1, #2
  LI R2, #66
  LI R3, #144
  LI R4, #6000
  ADD R4, R4, R8
  LI R5, #0
  SYSCALL #27

  ; Blit tzf_fb (72x144) at (162, 2)
  LI R0, #162
  LI R1, #2
  LI R2, #72
  LI R3, #144
  LI R4, #16000 - 19683
  LMI R4, #1
  ADD R4, R4, R8
  LI R5, #0
  SYSCALL #27

tryrd_hud:
  ; Clear HUD column x=72..160, y=2..145
  LI R0, #72
  LI R1, #2
  LI R2, #88
  LI R3, #144
  LI R4, #-320
  SYSCALL #20

  ; Mode string (pending_mode if before game or active mode)
  LI R1, #5372
  ADD R5, R8, R1
  LT R0, R5, #0
  MULI R0, R0, #4
  LI R2, #str_try_modes - app11_try_rom
  ADD R2, R2, R8
  ADD R2, R2, R0
  LI R0, #74
  LI R1, #4
  LI R3, #COL_YELLOW
  LI R4, #-320
  SYSCALL #21

  ; Lockstep vs Live
  LI R1, #5374
  ADD R5, R8, R1
  LT R0, R5, #0
  LI R2, #str_try_live - app11_try_rom
  CMPI R0, #0
  JZX tryrd_lk_ok
  LI R2, #str_try_lock - app11_try_rom
tryrd_lk_ok:
  ADD R2, R2, R8
  LI R0, #114
  LI R1, #4
  LI R3, #COL_GREEN
  LI R4, #-320
  SYSCALL #21

  ; Level
  LI R0, #74
  LI R1, #18
  LI R2, #str_try_lv - app11_try_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-320
  SYSCALL #21
  LI R1, #5008
  ADD R5, R8, R1
  LT R2, R5, #0
  LI R0, #98
  LI R1, #18
  LI R3, #10
  LI R4, #COL_WHITE
  LI R5, #-320
  SYSCALL #26

  ; Score
  LI R0, #74
  LI R1, #30
  LI R2, #str_try_sc - app11_try_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-320
  SYSCALL #21
  LI R1, #5004
  ADD R5, R8, R1
  LW R2, R5, #0
  LI R0, #98
  LI R1, #30
  LI R3, #10
  LI R4, #COL_WHITE
  LI R5, #-320
  SYSCALL #26

  ; High Score
  LI R0, #74
  LI R1, #42
  LI R2, #str_try_hi - app11_try_rom
  ADD R2, R2, R8
  LI R3, #COL_YELLOW
  LI R4, #-320
  SYSCALL #21
  LI R1, #5360
  ADD R5, R8, R1
  LW R2, R5, #0
  LI R0, #98
  LI R1, #42
  LI R3, #10
  LI R4, #COL_WHITE
  LI R5, #-320
  SYSCALL #26

  ; Lines
  LI R0, #74
  LI R1, #54
  LI R2, #str_try_ln - app11_try_rom
  ADD R2, R2, R8
  LI R3, #COL_GREEN
  LI R4, #-320
  SYSCALL #21
  LI R1, #5007
  ADD R5, R8, R1
  LT R2, R5, #0
  LI R0, #98
  LI R1, #54
  LI R3, #10
  LI R4, #COL_WHITE
  LI R5, #-320
  SYSCALL #26

  ; Next 3 pieces
  LI R0, #74
  LI R1, #68
  LI R2, #str_try_nxt - app11_try_rom
  ADD R2, R2, R8
  LI R3, #COL_CYAN
  LI R4, #-320
  SYSCALL #21

  LI R6, #0
tryrd_n3_lp:
  CMPI R6, #3
  JNNX tryrd_chk_over
  LI R1, #5016
  ADD R5, R8, R1
  ADD R5, R5, R6
  LT R2, R5, #0 ; piece id 1..16
  SUBI R2, R2, #1
  MULI R2, R2, #4
  LI R0, #str_try_pids - app11_try_rom
  ADD R0, R0, R8
  ADD R2, R0, R2
  LI R0, #74
  MULI R1, R6, #10
  ADDI R1, R1, #80
  LI R3, #COL_WHITE
  LI R4, #-320
  SYSCALL #21
  ADDI R6, R6, #1
  JMPX tryrd_n3_lp

tryrd_chk_over:
  LI R1, #5011
  ADD R5, R8, R1
  LT R0, R5, #0
  CMPI R0, #0
  JZX tryrd_flush
  LI R0, #74
  LI R1, #120
  LI R2, #str_try_over - app11_try_rom
  ADD R2, R2, R8
  LI R3, #COL_RED
  LI R4, #-320
  SYSCALL #21

tryrd_flush:
  LI R0, #0
  LI R1, #0
  LI R2, #0
  LI R3, #0
  SYSCALL #24
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET

; ----------------------------------------------------------------------------
; Constants & Tables
; ----------------------------------------------------------------------------
c_pow14:   .word #16384
c_pow15:   .word #32768
c_pow16:   .word #65536
c_pow32:   .word #4294967296
c_mul_inc: .word #1831565813

try_kicks:
  .tryte #0,#0, #0,#2, #0,#-2, #1,#1, #1,#-1, #-1,#1, #-1,#-1, #2,#0

try_combo_halves:
  ; __PERTURB_TRY_SCORE__

try_tzf_glyphs:
  .tryte #31,#2,#4,#8,#31   ; 0: Z
  .tryte #31,#4,#4,#4,#4    ; 1: T
  .tryte #31,#16,#30,#16,#16 ; 2: F

try_xor_tbl:
  .tryte #0,#1,#2,#3,#4,#5,#6,#7,#8,#9,#10,#11,#12,#13,#14,#15
  .tryte #1,#0,#3,#2,#5,#4,#7,#6,#9,#8,#11,#10,#13,#12,#15,#14
  .tryte #2,#3,#0,#1,#6,#7,#4,#5,#10,#11,#8,#9,#14,#15,#12,#13
  .tryte #3,#2,#1,#0,#7,#6,#5,#4,#11,#10,#9,#8,#15,#14,#13,#12
  .tryte #4,#5,#6,#7,#0,#1,#2,#3,#12,#13,#14,#15,#8,#9,#10,#11
  .tryte #5,#4,#7,#6,#1,#0,#3,#2,#13,#12,#15,#14,#9,#8,#11,#10
  .tryte #6,#7,#4,#5,#2,#3,#0,#1,#14,#15,#12,#13,#10,#11,#8,#9
  .tryte #7,#6,#5,#4,#3,#2,#1,#0,#15,#14,#13,#12,#11,#10,#9,#8
  .tryte #8,#9,#10,#11,#12,#13,#14,#15,#0,#1,#2,#3,#4,#5,#6,#7
  .tryte #9,#8,#11,#10,#13,#12,#15,#14,#1,#0,#3,#2,#5,#4,#7,#6
  .tryte #10,#11,#8,#9,#14,#15,#12,#13,#2,#3,#0,#1,#6,#7,#4,#5
  .tryte #11,#10,#9,#8,#15,#14,#13,#12,#3,#2,#1,#0,#7,#6,#5,#4
  .tryte #12,#13,#14,#15,#8,#9,#10,#11,#4,#5,#6,#7,#0,#1,#2,#3
  .tryte #13,#12,#15,#14,#9,#8,#11,#10,#5,#4,#7,#6,#1,#0,#3,#2
  .tryte #14,#15,#12,#13,#10,#11,#8,#9,#6,#7,#4,#5,#2,#3,#0,#1
  .tryte #15,#14,#13,#12,#11,#10,#9,#8,#7,#6,#5,#4,#3,#2,#1,#0

; [LIFT] Trytris piece definitions & rotation tables
; Provenance: generated from trytris/index.html lines 1005-1047 (16 pieces, 72 rotations)
try_piece_meta:
  .tryte #4, #3, #-284, #0 ; 1: P1
  .tryte #4, #3, #-180, #24 ; 2: P2
  .tryte #4, #6, #310, #48 ; 3: P3
  .tryte #4, #2, #140, #96 ; 4: P4
  .tryte #6, #3, #-250, #112 ; 5: H1
  .tryte #6, #6, #292, #148 ; 6: H2
  .tryte #6, #6, #355, #220 ; 7: H3
  .tryte #6, #6, #-100, #292 ; 8: H4
  .tryte #6, #6, #280, #364 ; 9: H5
  .tryte #6, #6, #180, #436 ; 10: H6
  .tryte #6, #6, #-220, #508 ; 11: H7
  .tryte #6, #1, #260, #580 ; 12: H8
  .tryte #6, #3, #76, #592 ; 13: H9
  .tryte #6, #6, #240, #628 ; 14: H10
  .tryte #6, #6, #-270, #700 ; 15: H11
  .tryte #6, #3, #200, #772 ; 16: H12

try_piece_cells:
  ; __PERTURB_TRY_ROTATION__
  .tryte #0,#1, #0,#2, #1,#2, #1,#3 ; P1 rot 1
  .tryte #0,#2, #1,#1, #1,#2, #2,#1 ; P1 rot 2
  .tryte #0,#0, #1,#0, #1,#1, #2,#1 ; P2 rot 0
  .tryte #0,#2, #0,#3, #1,#1, #1,#2 ; P2 rot 1
  .tryte #0,#1, #0,#2, #0,#3, #0,#4 ; P2 rot 2
  .tryte #0,#0, #0,#1, #0,#2, #1,#0 ; P3 rot 0
  .tryte #0,#0, #0,#1, #0,#2, #1,#2 ; P3 rot 1
  .tryte #0,#1, #0,#2, #1,#1, #1,#2 ; P3 rot 2
  .tryte #0,#2, #1,#0, #1,#1, #1,#2 ; P3 rot 3
  .tryte #0,#0, #1,#0, #1,#1, #1,#2 ; P3 rot 4
  .tryte #0,#0, #0,#1, #1,#0, #1,#1 ; P3 rot 5
  .tryte #0,#1, #0,#2, #0,#3, #1,#2 ; P4 rot 0
  .tryte #0,#2, #1,#1, #1,#2, #1,#3 ; P4 rot 1
  .tryte #0,#0, #0,#1, #0,#2, #0,#3, #0,#4, #0,#5 ; H1 rot 0
  .tryte #0,#1, #0,#2, #1,#2, #1,#3, #2,#3, #2,#4 ; H1 rot 1
  .tryte #0,#2, #1,#1, #1,#2, #2,#0, #2,#1, #3,#0 ; H1 rot 2
  .tryte #0,#0, #0,#1, #0,#2, #0,#3, #0,#4, #1,#0 ; H2 rot 0
  .tryte #0,#0, #0,#1, #0,#2, #1,#2, #1,#3, #2,#3 ; H2 rot 1
  .tryte #0,#1, #0,#2, #1,#1, #1,#2, #2,#0, #2,#1 ; H2 rot 2
  .tryte #0,#4, #1,#0, #1,#1, #1,#2, #1,#3, #1,#4 ; H2 rot 3
  .tryte #0,#0, #1,#0, #1,#1, #2,#1, #2,#2, #2,#3 ; H2 rot 4
  .tryte #0,#2, #0,#3, #1,#1, #1,#2, #2,#1, #2,#2 ; H2 rot 5
  .tryte #0,#0, #0,#1, #0,#2, #0,#3, #0,#4, #1,#2 ; H3 rot 0
  .tryte #0,#1, #0,#2, #1,#1, #1,#2, #1,#3, #2,#3 ; H3 rot 1
  .tryte #0,#2, #1,#0, #1,#1, #1,#2, #2,#0, #2,#1 ; H3 rot 2
  .tryte #0,#2, #1,#0, #1,#1, #1,#2, #1,#3, #1,#4 ; H3 rot 3
  .tryte #0,#0, #1,#0, #1,#1, #1,#2, #2,#1, #2,#2 ; H3 rot 4
  .tryte #0,#2, #0,#3, #1,#1, #1,#2, #1,#3, #2,#1 ; H3 rot 5
  .tryte #0,#0, #0,#1, #0,#2, #0,#3, #1,#0, #1,#1 ; H4 rot 0
  .tryte #0,#0, #0,#1, #0,#2, #1,#0, #1,#2, #1,#3 ; H4 rot 1
  .tryte #0,#0, #0,#1, #0,#2, #1,#1, #1,#2, #2,#1 ; H4 rot 2
  .tryte #0,#3, #0,#4, #1,#1, #1,#2, #1,#3, #1,#4 ; H4 rot 3
  .tryte #0,#1, #0,#2, #0,#4, #1,#2, #1,#3, #1,#4 ; H4 rot 4
  .tryte #0,#2, #1,#1, #1,#2, #2,#1, #2,#2, #2,#3 ; H4 rot 5
  .tryte #0,#0, #0,#1, #0,#2, #0,#3, #1,#0, #1,#2 ; H5 rot 0
  .tryte #0,#0, #0,#1, #0,#2, #1,#1, #1,#2, #1,#3 ; H5 rot 1
  .tryte #0,#1, #0,#2, #1,#0, #1,#1, #1,#2, #2,#1 ; H5 rot 2
  .tryte #0,#2, #0,#4, #1,#1, #1,#2, #1,#3, #1,#4 ; H5 rot 3
  .tryte #0,#1, #0,#2, #0,#3, #1,#2, #1,#3, #1,#4 ; H5 rot 4
  .tryte #0,#2, #1,#1, #1,#2, #1,#3, #2,#1, #2,#2 ; H5 rot 5
  .tryte #0,#0, #0,#1, #0,#2, #0,#3, #1,#1, #1,#2 ; H6 rot 0
  .tryte #0,#1, #0,#2, #1,#0, #1,#1, #1,#2, #1,#3 ; H6 rot 1
  .tryte #0,#0, #0,#2, #1,#0, #1,#1, #1,#2, #2,#1 ; H6 rot 2
  .tryte #0,#2, #0,#3, #1,#1, #1,#2, #1,#3, #1,#4 ; H6 rot 3
  .tryte #0,#1, #0,#2, #0,#3, #0,#4, #1,#2, #1,#3 ; H6 rot 4
  .tryte #0,#2, #1,#1, #1,#2, #1,#3, #2,#1, #2,#3 ; H6 rot 5
  .tryte #0,#0, #0,#1, #0,#2, #0,#3, #1,#2, #1,#3 ; H7 rot 0
  .tryte #0,#1, #0,#2, #1,#1, #1,#2, #1,#3, #2,#1 ; H7 rot 1
  .tryte #0,#4, #1,#1, #1,#2, #1,#3, #1,#4, #2,#3 ; H7 rot 2
  .tryte #0,#1, #0,#2, #1,#1, #1,#2, #1,#3, #1,#4 ; H7 rot 3
  .tryte #0,#2, #1,#0, #1,#1, #1,#2, #2,#1, #2,#2 ; H7 rot 4
  .tryte #0,#2, #1,#1, #1,#2, #1,#3, #1,#4, #2,#1 ; H7 rot 5
  .tryte #0,#0, #0,#1, #0,#2, #1,#0, #1,#1, #1,#2 ; H8 rot 0
  .tryte #0,#0, #0,#1, #0,#2, #1,#2, #1,#3, #1,#4 ; H9 rot 0
  .tryte #0,#1, #0,#2, #1,#1, #1,#2, #2,#1, #2,#2 ; H9 rot 1
  .tryte #0,#4, #1,#1, #1,#2, #1,#3, #1,#4, #2,#1 ; H9 rot 2
  .tryte #0,#0, #1,#0, #1,#1, #2,#0, #2,#1, #2,#2 ; H10 rot 0
  .tryte #0,#2, #0,#3, #1,#0, #1,#1, #1,#2, #2,#1 ; H10 rot 1
  .tryte #0,#2, #1,#1, #1,#2, #1,#3, #1,#4, #1,#5 ; H10 rot 2
  .tryte #0,#1, #0,#2, #0,#3, #1,#2, #1,#3, #2,#3 ; H10 rot 3
  .tryte #0,#2, #1,#1, #1,#2, #1,#3, #2,#0, #2,#1 ; H10 rot 4
  .tryte #0,#1, #0,#2, #0,#3, #0,#4, #0,#5, #1,#4 ; H10 rot 5
  .tryte #0,#0, #1,#0, #1,#1, #2,#0, #2,#1, #3,#0 ; H11 rot 0
  .tryte #0,#4, #0,#5, #1,#1, #1,#2, #1,#3, #1,#4 ; H11 rot 1
  .tryte #0,#1, #0,#2, #1,#2, #1,#3, #1,#4, #1,#5 ; H11 rot 2
  .tryte #0,#2, #1,#1, #1,#2, #2,#1, #2,#2, #3,#2 ; H11 rot 3
  .tryte #0,#2, #0,#3, #0,#4, #0,#5, #1,#1, #1,#2 ; H11 rot 4
  .tryte #0,#1, #0,#2, #0,#3, #0,#4, #1,#4, #1,#5 ; H11 rot 5
  .tryte #0,#1, #0,#2, #0,#3, #1,#1, #1,#2, #1,#3 ; H12 rot 0
  .tryte #0,#2, #1,#0, #1,#1, #1,#2, #1,#3, #2,#1 ; H12 rot 1
  .tryte #0,#2, #1,#1, #1,#2, #1,#3, #1,#4, #2,#3 ; H12 rot 2

str_try_title: .stringz "TRYTRIS"
str_try_fn:    .stringz "TRYSTATE"
str_try_stfn:  .stringz "TRYSTATE"
str_try_hifn:  .stringz "TRYHI"
str_try_modes: .stringz "NRM"
               .stringz "CRS"
               .stringz "HEX"
str_try_live:  .stringz "LIVE"
str_try_lock:  .stringz "LOCK"
str_try_lv:    .stringz "LV:"
str_try_sc:    .stringz "SC:"
str_try_hi:    .stringz "HI:"
str_try_ln:    .stringz "LN:"
str_try_nxt:   .stringz "NEXT:"
str_try_over:  .stringz "GAME OVER"
str_try_pids:
  .stringz "P1 "
  .stringz "P2 "
  .stringz "P3 "
  .stringz "P4 "
  .stringz "H1 "
  .stringz "H2 "
  .stringz "H3 "
  .stringz "H4 "
  .stringz "H5 "
  .stringz "H6 "
  .stringz "H7 "
  .stringz "H8 "
  .stringz "H9 "
  .stringz "H10"
  .stringz "H11"
  .stringz "H12"
app11_try_end:


str_file_demo_asm: .stringz ".mode T3\n.org 0\n.equ COL_WHITE, 364\n.equ COL_GREEN, 76\n.equ COL_CYAN, -284\napp5_calc_rom:\n  LI R0, #510\n  LI R1, #75\n  LI R2, #216\n  LI R3, #96\n  LI R4, #str_calc_title-app5_calc_rom\n  ADD R4, R4, R8\n  LI R5, #-315\n  SYSCALL #10\n\n  LI R0, #6\n  LI R1, #4\n  LI R2, #str_calc_hdr-app5_calc_rom\n  ADD R2, R2, R8\n  LI R3, #COL_CYAN\n  LI R4, #-315\n  SYSCALL #21\n\n  LI R0, #6\n  LI R1, #56\n  LI R2, #str_calc_btns1-app5_calc_rom\n  ADD R2, R2, R8\n  LI R3, #COL_WHITE\n  LI R4, #-240\n  SYSCALL #21\n\n  LI R0, #6\n  LI R1, #72\n  LI R2, #str_calc_btns2-app5_calc_rom\n  ADD R2, R2, R8\n  LI R3, #COL_WHITE\n  LI R4, #-240\n  SYSCALL #21\n\n  LI R0, #0\n  LI R1, #0\n  LI R2, #0\n  LI R3, #0\n  SYSCALL #24\n\n  LI R7, #0\n  ADDI R6, R8, #1500\n  LI R0, #0\n  ST R0, R6, #0\n\ncalc_ev_lp:\n  SYSCALL #25\n  CMPI R0, #0\n  JZX calc_idle\n  CMPI R0, #1\n  JZX calc_on_key\n  CMPI R0, #2\n  JZX calc_on_click\n  JMPX calc_ev_lp\n\ncalc_idle:\n  ADDI R6, R8, #1499\n  LT R0, R6, #0\n  CMPI R0, #0\n  JZX calc_do_yield\n  LI R0, #0\n  ST R0, R6, #0\n  CALLX calc_redraw_input\ncalc_do_yield:\n  SYSCALL #2\n  JMPX calc_ev_lp\n\ncalc_on_click:\n  CMPI R2, #50\n  JNX calc_ev_lp\n  CMPI R2, #88\n  JPX calc_ev_lp\n  SUBI R0, R1, #6\n  CMPI R0, #0\n  JNX calc_ev_lp\n  LI R3, #32\n  DIV R0, R0, R3\n  CMPI R0, #6\n  JNNX calc_ev_lp\n  CMPI R2, #69\n  JNNX calc_click_r2\n  LI R3, #str_calc_kmap1-app5_calc_rom\n  ADD R3, R3, R8\n  ADD R3, R3, R0\n  LT R1, R3, #0\n  JMPX calc_on_key\ncalc_click_r2:\n  LI R3, #str_calc_kmap2-app5_calc_rom\n  ADD R3, R3, R8\n  ADD R3, R3, R0\n  LT R1, R3, #0\n\ncalc_on_key:\n  CMPI R1, #13\n  JZX calc_eval\n  CMPI R1, #10\n  JZX calc_eval\n  CMPI R1, #'='\n  JZX calc_eval\n  CMPI R1, #'C'\n  JZX calc_clear\n  CMPI R1, #'c'\n  JZX calc_clear\n  CMPI R1, #'S'\n  JZX calc_save_file\n  CMPI R1, #'s'\n  JZX calc_save_file\n  CMPI R1, #8\n  JZX calc_bs\n\n  CMPI R7, #24\n  JNNX calc_ev_lp\n  ADDI R6, R8, #1500\n  ADD R6, R6, R7\n  ST R1, R6, #0\n  LI R0, #0\n  ST R0, R6, #1\n  ADDI R7, R7, #1\n  ADDI R6, R8, #1499\n  LI R0, #1\n  ST R0, R6, #0\n  JMPX calc_ev_lp\n\ncalc_bs:\n  CMPI R7, #0\n  JZX calc_ev_lp\n  SUBI R7, R7, #1\n  ADDI R6, R8, #1500\n  ADD R6, R6, R7\n  LI R0, #0\n  ST R0, R6, #0\n  ADDI R6, R8, #1499\n  LI R0, #1\n  ST R0, R6, #0\n  JMPX calc_ev_lp\n\ncalc_clear:\n  LI R7, #0\n  ADDI R6, R8, #1500\n  LI R0, #0\n  ST R0, R6, #0\n  ADDI R6, R8, #1499\n  LI R0, #1\n  ST R0, R6, #0\n  JMPX calc_ev_lp\n\ncalc_save_file:\n  LI R0, #str_calc_fn-app5_calc_rom\n  ADD R0, R0, R8\n  ADDI R1, R8, #2000\n  LI R2, #3\n  LI R3, #1\n  SYSCALL #32\n  JMPX calc_ev_lp\n\ncalc_redraw_input:\n  LI R0, #6\n  LI R1, #18\n  LI R2, #176\n  LI R3, #10\n  LI R4, #-340\n  SYSCALL #20\n  LI R0, #6\n  LI R1, #18\n  ADDI R2, R8, #1500\n  LI R3, #COL_WHITE\n  LI R4, #-340\n  SYSCALL #21\n  LI R0, #6\n  LI R1, #18\n  LI R2, #176\n  LI R3, #10\n  SYSCALL #24\n  RET\n\ncalc_eval:\n  ADDI R1, R8, #1500\n  CALLX calc_parse_btern\n  MOV R5, R4\n  CALLX calc_skip_sp\n  LT R6, R1, #0\n  CMPI R6, #0\n  JZX calc_show_res\n  ADDI R1, R1, #1\n  CALLX calc_skip_sp\n  CALLX calc_parse_btern\n  CMPI R6, #'+'\n  JNZX calc_op_sub\n  ADD R5, R5, R4\n  JMPX calc_show_res\ncalc_op_sub:\n  CMPI R6, #'-'\n  JNZX calc_op_mul\n  SUB R5, R5, R4\n  JMPX calc_show_res\ncalc_op_mul:\n  CMPI R6, #'*'\n  JNZX calc_op_div\n  MUL R5, R5, R4\n  JMPX calc_show_res\ncalc_op_div:\n  CMPI R6, #'/'\n  JNZX calc_op_mod\n  DIV R5, R5, R4\n  JMPX calc_show_res\ncalc_op_mod:\n  CMPI R6, #'%'\n  JNZX calc_op_min\n  MOD R5, R5, R4\n  JMPX calc_show_res\ncalc_op_min:\n  CMPI R6, #'&'\n  JNZX calc_op_max\n  TMIN R5, R5, R4\n  JMPX calc_show_res\ncalc_op_max:\n  CMPI R6, #'|'\n  JNZX calc_op_con\n  TMAX R5, R5, R4\n  JMPX calc_show_res\ncalc_op_con:\n  CMPI R6, #'^'\n  JNZX calc_op_xor\n  TCON R5, R5, R4\n  JMPX calc_show_res\ncalc_op_xor:\n  TXOR R5, R5, R4\n\ncalc_show_res:\n  ADDI R6, R8, #2000\n  SW R5, R6, #0\n\n  LI R0, #6\n  LI R1, #36\n  LI R2, #180\n  LI R3, #9\n  LI R4, #-350\n  SYSCALL #20\n\n  LI R0, #6\n  LI R1, #36\n  MOV R2, R5\n  LI R3, #3\n  LI R4, #COL_GREEN\n  LI R5, #-350\n  SYSCALL #26\n\n  LI R0, #6\n  LI R1, #36\n  LI R2, #180\n  LI R3, #9\n  SYSCALL #24\n\n  LI R7, #0\n  ADDI R6, R8, #1499\n  LI R0, #0\n  ST R0, R6, #0\n  ST R0, R6, #1\n  JMPX calc_ev_lp\n\ncalc_skip_sp:\n  LT R0, R1, #0\n  CMPI R0, #32\n  JNZX css_ret\n  ADDI R1, R1, #1\n  JMPX calc_skip_sp\ncss_ret:\n  RET\n\ncalc_parse_btern:\n  CALLX calc_skip_sp\n  LI R4, #0\ncpbt_lp:\n  LT R0, R1, #0\n  CMPI R0, #'1'\n  JZX cpbt_1\n  CMPI R0, #'0'\n  JZX cpbt_0\n  CMPI R0, #'T'\n  JZX cpbt_t\n  CMPI R0, #'t'\n  JZX cpbt_t\n  RET\ncpbt_1:\n  MULI R4, R4, #3\n  ADDI R4, R4, #1\n  ADDI R1, R1, #1\n  JMPX cpbt_lp\ncpbt_0:\n  MULI R4, R4, #3\n  ADDI R1, R1, #1\n  JMPX cpbt_lp\ncpbt_t:\n  MULI R4, R4, #3\n  SUBI R4, R4, #1\n  ADDI R1, R1, #1\n  JMPX cpbt_lp\n\nstr_calc_title: .stringz \"TRIT CALC\"\nstr_calc_hdr:   .stringz \"EXPR (T,0,1 +-*/&|):\"\nstr_calc_btns1: .stringz \"[T] [0] [1] [+] [-] [*]\"\nstr_calc_btns2: .stringz \"[/] [%] [&] [|] [=] [C]\"\nstr_calc_kmap1: .stringz \"T01+-*\"\nstr_calc_kmap2: .stringz \"/%&|=C\"\nstr_calc_fn:    .stringz \"CALC\"\napp5_calc_end:\n"
str_file_demo_end: .tryte #0
