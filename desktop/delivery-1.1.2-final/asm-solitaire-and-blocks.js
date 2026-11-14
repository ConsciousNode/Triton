'use strict';

// Complete in-guest assembly extensions for App 6 (Solitaire Suite), App 7 (Trit Blocks),
// App 10 (NET & Browser), and DRIVER net v3 (Multi-frame SACK resend).

function getApp6ExtensionsAsm() {
  return `
sol_cmd_klondike_cnsw:
  ADDI R6, R8, #5210
  LT R0, R6, #0
  CMPI R0, #-1
  JZX sckc_keep_seed
  ADDI R5, R8, #5000
  ST R0, R5, #0
  LI R0, #-1
  ST R0, R6, #0
sckc_keep_seed:
  LI R1, #5290
  ADD R1, R8, R1
  LI R0, #1
  ST R0, R1, #0 ; game_mode = 1 (Klondike CNSW)
  LI R0, #0
  SW R0, R1, #2 ; undo_sp = 0
  CALLX sol_write_dealchk
  CALLX sol_deal_cnsw_klondike
  ADDI R6, R8, #5213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_cmd_freecell:
  ADDI R6, R8, #5210
  LT R0, R6, #0
  CMPI R0, #-1
  JZX sfc_keep_seed
  ADDI R5, R8, #5000
  ST R0, R5, #0
  LI R0, #-1
  ST R0, R6, #0
  LI R5, #5284
  ADD R5, R8, R5
  LW R0, R5, #0
  SW R0, R5, #3 ; +5287 = full 27-trit seed!
sfc_keep_seed:
  LI R1, #5290
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
  ADDI R6, R8, #5213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_cmd_spider:
  LI R1, #5290
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
  ADDI R6, R8, #5213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

; 'T' key in FreeCell mode: execute a reversible step move (C2X or X2C) and push to Move-Log Undo (+6000)
sol_cmd_fc_step:
  LI R1, #5290
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
  LI R6, #5314
  ADD R6, R8, R6 ; &fc_free[0]
  CMPI R0, #0
  JNZX sfs_x2c
  ; Even step: move top of col (R5) to free[0] (type 5 = C2X)
  LI R7, #5318
  ADD R7, R8, R7
  ADD R7, R7, R5
  LT R3, R7, #0 ; len
  SUBI R3, R3, #1
  ST R3, R7, #0
  MULI R0, R5, #20
  ADD R0, R0, R3
  LI R7, #5326
  ADD R7, R8, R7
  ADD R7, R7, R0
  LT R0, R7, #0 ; card
  LI R3, #-1
  ST R3, R7, #0
  ST R0, R6, #0 ; fc_free[0] = card
  MULI R3, R2, #4
  LI R7, #6000
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
  LI R7, #5318
  ADD R7, R8, R7
  ADD R7, R7, R5
  LT R3, R7, #0 ; len
  ADDI R6, R3, #1
  ST R6, R7, #0
  MULI R6, R5, #20
  ADD R6, R6, R3
  LI R7, #5326
  ADD R7, R8, R7
  ADD R7, R7, R6
  ST R0, R7, #0
  MULI R3, R2, #4
  LI R7, #6000
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
  LI R1, #5290
  ADD R1, R8, R1
  LI R0, #2
  ST R0, R1, #0
  LI R6, #5310
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
  LI R1, #5290
  ADD R1, R8, R1
  LT R0, R1, #0
  CMPI R0, #2
  JNZX sol_ev_lp
  ADDI R6, R8, #5210
  LT R0, R6, #0
  CMPI R0, #0
  JNPX scs_def_b
  SW R0, R1, #9 ; fc_budget = next_seed
  LI R0, #-1
  ST R0, R6, #0
scs_def_b:
  CALLX sol_freecell_solve
  CALLX sol_save_fcsol
  ADDI R6, R8, #5213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_save_fcsol:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  LI R1, #5500
  ADD R1, R8, R1
  ADDI R2, R8, #5000
  LT R0, R2, #0 ; seed
  ST R0, R1, #0
  LI R2, #5290
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
  LI R2, #5310
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
  LI R1, #5302
  ADD R1, R8, R1
  LW R0, R1, #0
  LI R2, #5122
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
  LI R1, #5305
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
  LI R0, #5287
  ADD R0, R8, R0
  LW R0, R0, #0
  LI R1, #5305
  ADD R1, R8, R1
  SW R0, R1, #0
  LI R1, #5310
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
  ADDI R1, R8, #5220
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
  LI R5, #5318
  ADD R5, R8, R5
  ADD R5, R5, R4
  LT R7, R5, #0
  ADDI R0, R7, #1
  ST R0, R5, #0
  MULI R0, R4, #20
  ADD R0, R0, R7
  LI R5, #5326
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
  ADDI R1, R8, #5220
  LI R0, #0
sdck_init:
  CMPI R0, #52
  JNNX sdck_shuf
  ADD R2, R1, R0
  ST R0, R2, #0
  ADDI R0, R0, #1
  JMPX sdck_init
sdck_shuf:
  ADDI R0, R8, #5000
  LT R0, R0, #0
  CMPI R0, #0
  JPX sdck_s_ok
  LI R0, #1
sdck_s_ok:
  LI R2, #5302
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
  LI R1, #5316
  ADD R1, R8, R1
  LI R2, #0
  LI R3, #10
  BFILL R1, R2, R3
  LI R1, #5326
  ADD R1, R8, R1
  LI R2, #-1
  LI R3, #160
  BFILL R1, R2, R3
  LI R1, #5700
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
  ADDI R0, R8, #5000
  LT R0, R0, #0
  CMPI R0, #0
  JPX sdsp_s_ok
  LI R0, #1
sdsp_s_ok:
  LI R2, #5302
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
  LI R7, #5326
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
  LI R6, #5287
  ADD R6, R8, R6
  LW R7, R6, #0
  LI R0, #1
  SW R0, R6, #0
  CALLX sol_deal_freecell
  SW R7, R6, #0
  LI R0, #5700
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
  LI R5, #5326
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
  LI R1, #5700
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

  LI R1, #5290
  ADD R1, R8, R1
  LI R0, #0
  SW R0, R1, #6  ; fc_nodes = 0
  ST R0, R1, #18 ; budgetHit = 0 (+5308)
  ST R0, R1, #19 ; depth = 0 (+5309)

  CALLX fcs_hash_and_insert
  LI R0, #0
  CALLX fcs_init_frame

fcs_dfs_lp:
  LI R1, #5310
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
  LI R1, #5295
  ADD R1, R8, R1
  LI R0, #1 ; WINNABLE
  ST R0, R1, #0
  JMPX fcs_done

fcs_not_won:
  LI R1, #5309
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

  LI R6, #5296
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
  LI R6, #5296
  ADD R6, R8, R6
  LW R0, R6, #0
  ADDI R0, R0, #1
  SW R0, R6, #0

  LI R1, #5309
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
  LI R1, #5308
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
  LI R1, #5309
  ADD R1, R8, R1
  ST R2, R1, #0
  JMPX fcs_dfs_lp

fcs_hit_budget:
  LI R1, #5308
  ADD R1, R8, R1
  LI R0, #1
  ST R0, R1, #0
  CALLX fcs_unwind_all
  LI R1, #5295
  ADD R1, R8, R1
  LI R0, #0 ; UNKNOWN
  ST R0, R1, #0
  JMPX fcs_done

fcs_exhausted:
  LI R1, #5308
  ADD R1, R8, R1
  LT R0, R1, #0
  LI R2, #-1 ; UNWINNABLE
  CMPI R0, #0
  JZX fcs_set_v
  LI R2, #0  ; UNKNOWN
fcs_set_v:
  LI R1, #5295
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
  LI R1, #5309
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
  LI R6, #5318
  ADD R6, R8, R6
  ADD R6, R6, R1
  LT R4, R6, #0
  SUBI R4, R4, #1
  ST R4, R6, #0
  MULI R6, R1, #20
  ADD R6, R6, R4
  LI R7, #5326
  ADD R7, R8, R7
  ADD R7, R7, R6
  LT R4, R7, #0
  LI R6, #-1
  ST R6, R7, #0
  LI R6, #5314
  ADD R6, R8, R6
  ADD R6, R6, R2
  ST R4, R6, #0
  JMPX fam_done
fam_c2f:
  LI R6, #5318
  ADD R6, R8, R6
  ADD R6, R6, R1
  LT R4, R6, #0
  SUBI R4, R4, #1
  ST R4, R6, #0
  MULI R6, R1, #20
  ADD R6, R6, R4
  LI R7, #5326
  ADD R7, R8, R7
  ADD R7, R7, R6
  LI R6, #-1
  ST R6, R7, #0
  LI R6, #5310
  ADD R6, R8, R6
  ADD R6, R6, R2
  LT R4, R6, #0
  ADDI R4, R4, #1
  ST R4, R6, #0
  JMPX fam_done
fam_x2f:
  LI R6, #5314
  ADD R6, R8, R6
  ADD R6, R6, R1
  LT R4, R6, #0
  ST R4, R5, #3
  LI R4, #-1
  ST R4, R6, #0
  LI R6, #5310
  ADD R6, R8, R6
  ADD R6, R6, R2
  LT R4, R6, #0
  ADDI R4, R4, #1
  ST R4, R6, #0
  JMPX fam_done
fam_x2c:
  LI R6, #5314
  ADD R6, R8, R6
  ADD R6, R6, R1
  LT R4, R6, #0
  LI R7, #-1
  ST R7, R6, #0
  LI R6, #5318
  ADD R6, R8, R6
  ADD R6, R6, R2
  LT R7, R6, #0
  ADDI R0, R7, #1
  ST R0, R6, #0
  MULI R6, R2, #20
  ADD R6, R6, R7
  LI R7, #5326
  ADD R7, R8, R7
  ADD R7, R7, R6
  ST R4, R7, #0
  JMPX fam_done
fam_c2c:
  LI R6, #5318
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
  LI R7, #5326
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
  LI R6, #5314
  ADD R6, R8, R6
  ADD R6, R6, R2
  LT R4, R6, #0
  LI R7, #-1
  ST R7, R6, #0
  LI R6, #5318
  ADD R6, R8, R6
  ADD R6, R6, R1
  LT R7, R6, #0
  ADDI R0, R7, #1
  ST R0, R6, #0
  MULI R6, R1, #20
  ADD R6, R6, R7
  LI R7, #5326
  ADD R7, R8, R7
  ADD R7, R7, R6
  ST R4, R7, #0
  JMPX fum_done
fum_c2f:
  LI R6, #5310
  ADD R6, R8, R6
  ADD R6, R6, R2
  LT R4, R6, #0
  SUBI R4, R4, #1
  ST R4, R6, #0
  MULI R4, R4, #4
  ADD R4, R4, R2
  LI R6, #5318
  ADD R6, R8, R6
  ADD R6, R6, R1
  LT R7, R6, #0
  ADDI R0, R7, #1
  ST R0, R6, #0
  MULI R6, R1, #20
  ADD R6, R6, R7
  LI R7, #5326
  ADD R7, R8, R7
  ADD R7, R7, R6
  ST R4, R7, #0
  JMPX fum_done
fum_x2f:
  LI R6, #5310
  ADD R6, R8, R6
  ADD R6, R6, R2
  LT R4, R6, #0
  SUBI R4, R4, #1
  ST R4, R6, #0
  LI R6, #5314
  ADD R6, R8, R6
  ADD R6, R6, R1
  ST R3, R6, #0
  JMPX fum_done
fum_x2c:
  LI R6, #5318
  ADD R6, R8, R6
  ADD R6, R6, R2
  LT R7, R6, #0
  SUBI R7, R7, #1
  ST R7, R6, #0
  MULI R6, R2, #20
  ADD R6, R6, R7
  LI R7, #5326
  ADD R7, R8, R7
  ADD R7, R7, R6
  LT R4, R7, #0
  LI R6, #-1
  ST R6, R7, #0
  LI R6, #5314
  ADD R6, R8, R6
  ADD R6, R6, R1
  ST R4, R6, #0
  JMPX fum_done
fum_c2c:
  LI R6, #5318
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
  LI R7, #5326
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
  LI R1, #5310
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
  LI R3, #5318
  ADD R3, R8, R3
  ADD R3, R3, R1
  LT R3, R3, #0
  SUB R3, R3, R2
  CMPI R3, #0
  JNPX fcub_done
  MULI R4, R1, #20
  LI R5, #5326
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
  LI R7, #5310
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
  LI R5, #5698
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
  LI R5, #5308
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
  LI R1, #5310
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
  LI R1, #5697
  ADD R1, R8, R1
  ST R0, R1, #0
  LI R0, #0
  ST R0, R1, #1 ; count = 0

  ; 1. C2F (type = 1)
  LI R2, #0 ; c = 0..7
fif_c2f_lp:
  CMPI R2, #8
  JNNX fif_x2f
  LI R1, #5318
  ADD R1, R8, R1
  ADD R1, R1, R2
  LT R3, R1, #0 ; len
  CMPI R3, #0
  JNPX fif_c2f_nx
  SUBI R3, R3, #1
  MULI R4, R2, #20
  ADD R4, R4, R3
  LI R1, #5326
  ADD R1, R8, R1
  ADD R1, R1, R4
  LT R5, R1, #0 ; card
  LI R1, #4
  DIV R6, R5, R1 ; rank
  MOD R3, R5, R1 ; suit (dst)
  LI R1, #5310
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
  LI R1, #5314
  ADD R1, R8, R1
  ADD R1, R1, R2
  LT R5, R1, #0 ; card
  CMPI R5, #0
  JNX fif_x2f_nx
  LI R1, #4
  DIV R6, R5, R1 ; rank
  MOD R3, R5, R1 ; suit (dst)
  LI R1, #5310
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
  LI R1, #5314
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
  LI R1, #5690
  ADD R1, R8, R1
  ST R0, R1, #0 ; emptyFree
  LI R0, #0
  LI R2, #0
fif_ec_lp:
  CMPI R2, #8
  JNNX fif_ec_done
  LI R1, #5318
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
  LI R1, #5691
  ADD R1, R8, R1
  ST R0, R1, #0 ; emptyCols

  ; 3. C2C (type = 3)
  LI R2, #0 ; c = 0..7
fif_c2c_c_lp:
  CMPI R2, #8
  JNNX fif_x2c
  LI R1, #5318
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
  LI R3, #5326
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
  LI R1, #5692
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
  LI R1, #5318
  ADD R1, R8, R1
  ADD R1, R1, R3
  LT R6, R1, #0 ; dcol_len
  CMPI R6, #0
  JPX fif_c2c_nonempty
  ; dcol is empty: check firstEmptyDst (+5693)
  LI R1, #5693
  ADD R1, R8, R1
  LT R0, R1, #0
  CMPI R0, #-1
  JNZX fif_c2c_d_nx
  ST R3, R1, #0 ; firstEmptyDst = d
  ; effEmptyCols = emptyCols - 1
  LI R1, #5690
  ADD R1, R8, R1
  LT R0, R1, #0 ; emptyFree
  ADDI R0, R0, #1
  LT R4, R1, #1 ; emptyCols
  SUBI R4, R4, #1
  CALLX fcs_shl_pow2 ; R0 = (1 + emptyFree) * 2^R4
  LI R1, #5692
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
  LI R1, #5690
  ADD R1, R8, R1
  LT R0, R1, #0 ; emptyFree
  ADDI R0, R0, #1
  LT R4, R1, #1 ; emptyCols
  CALLX fcs_shl_pow2
  LI R1, #5692
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
  LI R0, #5326
  ADD R0, R8, R0
  ADD R0, R0, R1
  LT R0, R0, #0 ; topD
  LI R1, #5695
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
  LI R0, #5326
  ADD R0, R8, R0
  ADD R0, R0, R1
  LT R0, R0, #0 ; botCard
  LI R1, #5695
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
  LI R1, #5692
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
  LI R1, #5314
  ADD R1, R8, R1
  ADD R1, R1, R2
  LT R5, R1, #0 ; card = free[f]
  CMPI R5, #0
  JNX fif_x2c_f_nx
  LI R1, #5693
  ADD R1, R8, R1
  LI R0, #-1
  ST R0, R1, #0 ; firstEmptyDst = -1
  LI R3, #0 ; d = 0..7
fif_x2c_d_lp:
  CMPI R3, #8
  JNNX fif_x2c_f_nx
  LI R1, #5318
  ADD R1, R8, R1
  ADD R1, R1, R3
  LT R6, R1, #0 ; dcol_len
  CMPI R6, #0
  JPX fif_x2c_ne
  LI R1, #5693
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
  LI R0, #5326
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
  LI R1, #5314
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
  LI R1, #5318
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
  LI R1, #5698
  ADD R1, R8, R1
  LT R2, R1, #0 ; count
  LI R3, #1 ; i = 1..count-1
fif_s_ilp:
  CMP R3, R2
  JNNX fif_copy_frame
  ; cur = moves[i] at +5700 + i*5
  MULI R4, R3, #5
  LI R5, #5700
  ADD R5, R8, R5
  ADD R4, R5, R4
  ; Copy cur[0..4] to scratch +5680..5684
  LI R6, #5680
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
  LI R1, #5697
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
  LI R5, #5700
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
  LI R5, #5314
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
  LI R5, #5310
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
  LI R5, #5318
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
  LI R2, #5326
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
  LI R5, #5295
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
  LI R2, #5326
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
`;
}

function getApp7ExtensionsAsm() {
  return `
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
`;
}


function getNetV3SrrpAndSnsAsm() {
  return `
str_net_id_clash:    .stringz "NODE ID CLASH"
str_net_name_taken:  .stringz "NAME TAKEN: using "
str_net_timeout:     .stringz "TIMEOUT"
str_srrp_413:        .stringz "SRRP/1 413 TOO BIG\\nMax-Size: 32768\\nSize: 0\\n\\n"
str_srrp_403:        .stringz "SRRP/1 403 FORBIDDEN\\nSize: 0\\n\\n"
str_srrp_404:        .stringz "SRRP/1 404 NOT FOUND\\nSize: 0\\n\\n"
str_srrp_201:        .stringz "SRRP/1 201 CREATED\\nSize: 0\\n\\n"
str_srrp_200_hts:    .stringz "SRRP/1 200 OK\\nType: text/hts\\nSize: 58\\n\\n<h1>TritOS 1.1.2</h1>\\n<p>StudioNet 1.0</p>\\n<a href='/'>OK</a>"
str_srrp_legacy_bd:  .stringz "<h1>TritOS 1.1.2</h1>\\n<p>StudioNet 1.0</p>\\n"
str_srrp_put_hdr1:   .stringz "PUT /inbox/file SRRP/1\\nEncoding: trytes16\\nSize: "
str_def_triton:      .stringz "triton"
str_def_cnsw:        .stringz "cnsw"

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
  ADDI R3, R3, #16 ; peer displayName
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
  LI R4, #':'
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

; drv_net_name_agent_update: runs NameAgent.update (§3.4) against K_SNS_PEERS (72*19683)
; Updates [9759] (my_num) and 9740..9755 (my_display_name). Returns R0 = 1 if my_num changed, else 0.
drv_net_name_agent_update:
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  CALL drv_timer_read
  MOV R8, R0 ; R8 = now_ticks
  LI R1, #9787
  LW R4, R1, #0 ; my_age_override
  CMPI R4, #0
  JNNX dnna_age_ok
  LI R2, #3170
  LMI R2, #10 ; 200,000 steps/sec
  DIV R4, R8, R2 ; R4 = my_age
dnna_age_ok:
  LI R1, #9790
  SW R4, R1, #0 ; [9790] = my_age
  LI R1, #9784
  LW R0, R1, #0 ; my_token
  CMPI R0, #0
  JPX dnna_tok_ok
  IN R0, #P_NID
  SW R0, R1, #0
dnna_tok_ok:
  LI R1, #9793
  SW R0, R1, #0 ; [9793] = my_token
  IN R0, #P_NID
  LI R1, #9796
  ST R0, R1, #0 ; [9796] = my_node
  LI R0, #0
  ST R0, R1, #1 ; [9797] = group_count
  ST R0, R1, #2 ; [9798] = clash_my_num
  ST R0, R1, #3 ; [9799] = senior_unnumbered_count (k)
  LI R1, #9730
  LI R0, #0
  LI R2, #10
  BFILL R1, R0, R2 ; 9730..9739 = held[0..9]

  LI R5, #0 ; i = 0..7
dnna_scan_lp:
  CMPI R5, #8
  JNNX dnna_scan_done
  MULI R0, R5, #32
  LI R1, #0
  LMI R1, #72
  ADD R6, R1, R0 ; R6 = peer entry ptr
  LT R0, R6, #0  ; p.node
  CMPI R0, #0
  JZX dnna_scan_nx
  LI R1, #9796
  LT R2, R1, #0  ; my_node
  CMP R0, R2
  JZX dnna_scan_nx
  ; Check group membership:
  LI R1, #9758
  LT R2, R1, #0  ; my_named
  LT R3, R6, #10 ; p.named
  CMP R2, R3
  JNZX dnna_scan_nx
  CMPI R2, #1
  JZX dnna_chk_named_grp
  ; Default group: require p.kind == 3 (TRITON)
  LT R0, R6, #1
  CMPI R0, #3
  JNZX dnna_scan_nx
  JMPX dnna_in_grp
dnna_chk_named_grp:
  ; Chosen-name group: require p.first_char == my_name[0] and p.second_char == my_name[1]
  LT R0, R6, #15
  LI R1, #9760
  LT R2, R1, #0
  CMP R0, R2
  JNZX dnna_scan_nx
dnna_in_grp:
  ; Increment group_count at [9797]
  LI R1, #9797
  LT R0, R1, #0
  ADDI R0, R0, #1
  ST R0, R1, #0
  ; Extrapolate p_age: LW[R6+4] + (now_ticks - LW[R6+12]) / 200000
  LW R0, R6, #12 ; lastSeen
  SUB R0, R8, R0
  CMPI R0, #0
  JNNX dnna_dt_pos
  LI R0, #0
dnna_dt_pos:
  LI R2, #3170
  LMI R2, #10 ; 200000
  DIV R0, R0, R2
  LW R1, R6, #4
  ADD R1, R1, R0 ; R1 = p_age
  ; Compare seniority: p vs me -> R7 = 1 if senior(p, me) < 0 else 0
  LI R7, #0
  LI R2, #9790
  LW R3, R2, #0 ; my_age
  CMP R1, R3
  JPX dnna_p_is_senior
  JNX dnna_chk_p_num
  ; Ages equal -> compare token: p.token < my_token
  LW R1, R6, #7 ; p.token
  LI R2, #9793
  LW R3, R2, #0 ; my_token
  CMP R1, R3
  JNX dnna_p_is_senior
  JPX dnna_chk_p_num
  ; Tokens equal -> compare node: p.node < my_node
  LT R1, R6, #0
  LI R2, #9796
  LT R3, R2, #0
  CMP R1, R3
  JNNX dnna_chk_p_num
dnna_p_is_senior:
  LI R7, #1
dnna_chk_p_num:
  LT R0, R6, #11 ; p.num
  CMPI R0, #0
  JNPX dnna_p_unnum
  ; p.num > 0: mark held[p.num] = 1 (if p.num <= 9)
  CMPI R0, #9
  JPX dnna_chk_clash
  LI R1, #9730
  ADD R1, R1, R0
  LI R2, #1
  ST R2, R1, #0
dnna_chk_clash:
  LI R1, #9759
  LT R2, R1, #0 ; old_num
  CMP R0, R2
  JNZX dnna_scan_nx
  CMPI R7, #1
  JNZX dnna_scan_nx
  LI R1, #9798
  LI R2, #1
  ST R2, R1, #0 ; clash_my_num = 1
  JMPX dnna_scan_nx
dnna_p_unnum:
  CMPI R7, #1
  JNZX dnna_scan_nx
  LI R1, #9799
  LT R0, R1, #0
  ADDI R0, R0, #1
  ST R0, R1, #0 ; senior_unnumbered_count++
dnna_scan_nx:
  ADDI R5, R5, #1
  JMPX dnna_scan_lp

dnna_scan_done:
  LI R1, #9759
  LT R4, R1, #0 ; R4 = old_num
  LI R1, #9758
  LT R5, R1, #0 ; R5 = my_named
  ; Rule 1: if old_num > 0 && clash_my_num == 0 -> keep old_num
  CMPI R4, #0
  JNPX dnna_r2
  LI R1, #9798
  LT R0, R1, #0
  CMPI R0, #0
  JZX dnna_keep_old
dnna_r2:
  ; Rule 2: if old_num == 0 && group_count == 0 -> keep 0
  CMPI R4, #0
  JNZX dnna_r4
  LI R1, #9797
  LT R0, R1, #0
  CMPI R0, #0
  JZX dnna_keep_old
  ; Rule 3: if my_named == 1 && old_num == 0 && senior_unnumbered_count == 0 -> keep 0
  CMPI R5, #1
  JNZX dnna_r4
  LI R1, #9799
  LT R0, R1, #0
  CMPI R0, #0
  JZX dnna_keep_old
dnna_r4:
  ; Need a new number:
  LI R1, #9799
  LT R2, R1, #0 ; R2 = senior_unnumbered_count (k)
  CMPI R5, #1
  JNZX dnna_def_pick
  ; Named group: if k == 0 -> new_num = 0; else skip = k - 1, first = 2
  CMPI R2, #0
  JNPX dnna_pick_zero
  SUBI R2, R2, #1 ; skip = k - 1
  LI R3, #2       ; n = 2
  JMPX dnna_find_free_lp
dnna_pick_zero:
  LI R6, #0
  JMPX dnna_apply_num
dnna_def_pick:
  ; Default group: skip = k, first = 1
  LI R3, #1 ; n = 1
dnna_find_free_lp:
  CMPI R3, #9
  JPX dnna_got_n
  LI R1, #9730
  ADD R1, R1, R3
  LT R0, R1, #0 ; held[n]
  CMPI R0, #0
  JNZX dnna_ff_nx
  CMPI R2, #0
  JNPX dnna_got_n
  SUBI R2, R2, #1
dnna_ff_nx:
  ADDI R3, R3, #1
  JMPX dnna_find_free_lp
dnna_got_n:
  MOV R6, R3
  JMPX dnna_apply_num
dnna_keep_old:
  MOV R6, R4

dnna_apply_num:
  LI R1, #9759
  ST R6, R1, #0 ; [9759] = new_num
  ; Format my_display_name at 44*19683 + 250
  LI R0, #250
  LMI R0, #44
  CMPI R6, #0
  JPX dnna_fmt_numbered
  ; Plain name: if my_named == 1 -> copy 9760, else copy str_def_triton
  CMPI R5, #1
  JZX dnna_fmt_ch_plain
  LI R1, #str_def_triton - 19683
  LMI R1, #1
  LI R2, #7
  BCOPY R0, R1, R2
  JMPX dnna_fmt_done
dnna_fmt_ch_plain:
  LI R1, #9760
  LI R2, #15
  BCOPY R0, R1, R2
  JMPX dnna_fmt_done
dnna_fmt_numbered:
  CMPI R5, #1
  JZX dnna_fmt_ch_num
  ; Default Triton numbered: "tri" + ('0' + R6)
  LI R1, #'t'
  ST R1, R0, #0
  LI R1, #'r'
  ST R1, R0, #1
  LI R1, #'i'
  ST R1, R0, #2
  ADDI R1, R6, #48
  ST R1, R0, #3
  LI R1, #0
  ST R1, R0, #4
  JMPX dnna_fmt_done
dnna_fmt_ch_num:
  ; Chosen name numbered: copy 9760 until NUL, then append ('0' + R6) and NUL, and set NAME TAKEN status
  LI R1, #9760
dnna_fcn_lp:
  LT R2, R1, #0
  CMPI R2, #0
  JZX dnna_fcn_app
  ST R2, R0, #0
  ADDI R1, R1, #1
  ADDI R0, R0, #1
  JMPX dnna_fcn_lp
dnna_fcn_app:
  ADDI R2, R6, #48
  ST R2, R0, #0
  LI R2, #0
  ST R2, R0, #1
  ; Write "NAME TAKEN: using <display>" into K_NET_STATUS_MSG
  LI R0, #K_NET_STATUS_MSG - 19683
  LMI R0, #73
  LI R1, #str_net_name_taken - 19683
  LMI R1, #1
  LI R2, #18
  BCOPY R0, R1, R2
  LI R1, #250
  LMI R1, #44
  LI R2, #15
  BCOPY R0, R1, R2
dnna_fmt_done:
  LI R0, #0
  CMP R6, R4
  JZX dnna_ret
  LI R0, #1
dnna_ret:
  POP R8
  POP R7
  POP R6
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET

knrd_srrp_port80:
  CALLX knrd_count_valid_rx
  ; R4 = &frame[0], R5 = payload_len, R6 = src_node, R8 = flags, R1 = sport, R2 = dport
  ; Check if this is an SRRP ACK frame (flags == 2):
  CMPI R8, #2
  JNZX ks80_data
  LT R0, R4, #12
  LT R3, R4, #13
  MULI R3, R3, #256
  ADD R0, R0, R3 ; ack
  LI R3, #9770
  SW R0, R3, #0 ; K_SRRP_ACK_SEQ at 9770
  CMPI R5, #3
  JNX knrd_process
  LT R0, R4, #16 ; sack_lo
  LT R2, R4, #17 ; sack_hi
  MULI R2, R2, #256
  ADD R0, R0, R2
  SW R0, R3, #3  ; K_SRRP_SACK at 9773
  LT R0, R4, #18 ; window
  ST R0, R3, #6  ; K_SRRP_PEER_WIN at 9776
  JMPX knrd_process

ks80_data:
  ; Require PSH flag (flags & 4 != 0)
  LI R3, #8
  MOD R0, R8, R3
  CMPI R0, #4
  JNX knrd_process

  ; Extract seq = frame[10] + frame[11]*256 -> R0
  LT R0, R4, #10
  LT R3, R4, #11
  MULI R3, R3, #256
  ADD R0, R0, R3 ; R0 = seq

  ; Check if SYN bit is set (flags % 2 == 1)
  LI R3, #2
  MOD R3, R8, R3
  CMPI R3, #1
  JNZX ks80_not_syn

  ; SYN is set: check if we already have an active RX with the same syn_seq
  LI R3, #0
  LMI R3, #44 ; 44 * 19683 = K_SRRP_FRAME_GOT base
  LT R7, R3, #200 ; rx_active
  CMPI R7, #1
  JNZX ks80_new_syn
  LW R7, R3, #201 ; syn_seq
  CMP R0, R7
  JZX ks80_not_syn

ks80_new_syn:
  ; First frame of a new SRRP conversation! If dport == 80, check 403 ("../") and 413 ("Size:" / "Total:" > 32768)
  CMPI R2, #80
  JNZX ks80_init_rx
  ADDI R7, R4, #16
  LI R3, #0
ks80_chk_dot:
  CMPI R3, #36
  JNNX ks80_chk_413
  CMP R3, R5
  JNNX ks80_chk_413
  ADD R2, R7, R3
  LT R0, R2, #0
  CMPI R0, #'.'
  JNZX ks80_cd_nx
  LT R0, R2, #1
  CMPI R0, #'.'
  JNZX ks80_cd_nx
  LT R0, R2, #2
  CMPI R0, #'/'
  JZX ks80_send_403
ks80_cd_nx:
  ADDI R3, R3, #1
  JMPX ks80_chk_dot

ks80_chk_413:
  ADDI R2, R4, #16
  LI R3, #0
ks80_c413_lp:
  CMPI R3, #96
  JNNX ks80_init_rx
  CMP R3, R5
  JNNX ks80_init_rx
  ADD R7, R2, R3
  LT R0, R7, #0
  CMPI R0, #'S'
  JZX ks80_chk_size_hdr
  CMPI R0, #'T'
  JNZX ks80_c413_nx
  LT R0, R7, #1
  CMPI R0, #'o'
  JNZX ks80_c413_nx
  LT R0, R7, #5
  CMPI R0, #':'
  JNZX ks80_c413_nx
  ADDI R7, R7, #7
  JMPX ks80_parse_sz
ks80_chk_size_hdr:
  LT R0, R7, #1
  CMPI R0, #'i'
  JNZX ks80_c413_nx
  LT R0, R7, #4
  CMPI R0, #':'
  JNZX ks80_c413_nx
  ADDI R7, R7, #6
ks80_parse_sz:
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
  JMPX ks80_init_rx
ks80_c413_nx:
  ADDI R3, R3, #1
  JMPX ks80_c413_lp

ks80_send_403:
  LI R7, #str_srrp_403 - 19683
  LMI R7, #1
  LI R8, #30
  JMPX ks80_send_err
ks80_send_413:
  LI R7, #str_srrp_413 - 19683
  LMI R7, #1
  LI R8, #44
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

ks80_init_rx:
  ; Re-extract seq -> R0 and dport -> R2
  LT R0, R4, #10
  LT R3, R4, #11
  MULI R3, R3, #256
  ADD R0, R0, R3
  LT R2, R4, #8
  LT R3, R4, #9
  MULI R3, R3, #256
  ADD R2, R2, R3
  LI R3, #0
  LMI R3, #44 ; K_SRRP_FRAME_GOT
  PUSH R0
  PUSH R1
  PUSH R2
  MOV R0, R3
  LI R1, #0
  LI R2, #190
  BFILL R0, R1, R2
  POP R2
  POP R1
  POP R0
  LI R7, #1
  ST R7, R3, #200 ; rx_active = 1
  SW R0, R3, #201 ; syn_seq = seq
  LI R7, #0
  ST R7, R3, #204 ; expect_idx = 0
  ST R7, R3, #206 ; since_ack = 0
  LI R7, #-1
  ST R7, R3, #205 ; fin_idx = -1

ks80_not_syn:
  LI R3, #0
  LMI R3, #44 ; K_SRRP_FRAME_GOT
  LT R7, R3, #200 ; rx_active
  CMPI R7, #1
  JNZX knrd_process
  LW R7, R3, #201 ; syn_seq
  SUB R0, R0, R7
  LI R7, #6487
  LMI R7, #3 ; 65536
  ADD R0, R0, R7
  MOD R0, R0, R7 ; R0 = idx = (seq - syn_seq) mod 65536
  LT R7, R3, #204 ; expect_idx
  CMP R0, R7
  JNX ks80_dup_or_oow
  CMPI R0, #75
  JNNX ks80_dup_or_oow
  ADD R7, R3, R0
  LT R7, R7, #0 ; got[idx]
  CMPI R7, #1
  JZX ks80_dup_or_oow

  ; New in-window frame at index R0!
  ADD R7, R3, R0
  LI R2, #1
  ST R2, R7, #0 ; got[idx] = 1
  ADDI R7, R7, #100
  ST R5, R7, #0 ; len[idx] = payload_len

  ; Copy R5 bytes from R4 + 16 into K_SRRP_ASSEMBLE_BUF (74 * 19683) + idx * 480
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  MULI R0, R0, #480
  LI R7, #0
  LMI R7, #74 ; 74 * 19683 = K_SRRP_RX_BUF / ASSEMBLE_BUF
  ADD R0, R7, R0 ; dst
  ADDI R1, R4, #16 ; src
  MOV R2, R5 ; len
  BCOPY R0, R1, R2
  POP R3
  POP R2
  POP R1
  POP R0

  ; If FIN bit set (flags >= 8), set fin_idx = idx
  CMPI R8, #8
  JNX ks80_adv_exp
  ST R0, R3, #205 ; fin_idx = idx

ks80_adv_exp:
  ; Advance expect_idx while got[expect_idx] == 1
  LT R7, R3, #204 ; old expect_idx
  MOV R2, R7
ks80_adv_lp:
  CMPI R2, #75
  JNNX ks80_adv_done
  ADD R8, R3, R2
  LT R8, R8, #0
  CMPI R8, #1
  JNZX ks80_adv_done
  ADDI R2, R2, #1
  JMPX ks80_adv_lp
ks80_adv_done:
  ST R2, R3, #204 ; updated expect_idx
  ; Increment since_ack
  LT R8, R3, #206
  ADDI R8, R8, #1
  ST R8, R3, #206
  ; Check if complete: fin_idx >= 0 && expect_idx > fin_idx
  LT R5, R3, #205 ; fin_idx
  CMPI R5, #0
  JNX ks80_not_comp
  CMP R2, R5
  JPX ks80_is_comp
ks80_not_comp:
  ; Send ACK if gap (idx != old expect_idx) or since_ack >= 2
  CMP R0, R7
  JNZX ks80_send_sack_only
  CMPI R8, #2
  JNNX ks80_send_sack_only
  JMPX knrd_process

ks80_dup_or_oow:
  CALLX ks80_send_sack_ack
  JMPX knrd_process

ks80_send_sack_only:
  LI R7, #0
  ST R7, R3, #206 ; since_ack = 0
  CALLX ks80_send_sack_ack
  JMPX knrd_process

ks80_is_comp:
  LI R7, #0
  ST R7, R3, #206 ; since_ack = 0
  ST R7, R3, #200 ; rx_active = 0
  CALLX ks80_send_sack_ack
  ; Compute total_bytes = fin_idx * 480 + len[fin_idx]
  LT R5, R3, #205 ; fin_idx
  MULI R0, R5, #480
  ADD R7, R3, R5
  ADDI R7, R7, #100
  LT R7, R7, #0 ; len[fin_idx]
  ADD R0, R0, R7 ; R0 = total_bytes
  LI R7, #9777
  SW R0, R7, #0 ; K_SRRP_RX_LEN = total_bytes
  LI R7, #0
  LMI R7, #74
  ADD R7, R7, R0
  LI R2, #0
  ST R2, R7, #0 ; NUL-terminate K_SRRP_RX_BUF

  ; Check if this was a request to our server (dport == 80, i.e. frame[8..9] == 80)
  LT R2, R4, #8
  LT R7, R4, #9
  MULI R7, R7, #256
  ADD R2, R2, R7
  CMPI R2, #80
  JNZX knrd_process

  ; Server request completed in K_SRRP_RX_BUF (74 * 19683, length R0)!
  LI R7, #0
  LMI R7, #74
  ; Check if legacy request (no 'S','R','R','P' in first 40 bytes)
  LI R2, #0
  LI R5, #0 ; has_srrp = 0
ks80_leg_lp:
  CMPI R2, #40
  JNNX ks80_leg_done
  CMP R2, R0
  JNNX ks80_leg_done
  ADD R8, R7, R2
  LT R3, R8, #0
  CMPI R3, #'S'
  JNZX ks80_leg_nx
  LT R3, R8, #1
  CMPI R3, #'R'
  JNZX ks80_leg_nx
  LT R3, R8, #2
  CMPI R3, #'R'
  JNZX ks80_leg_nx
  LI R5, #1
  JMPX ks80_leg_done
ks80_leg_nx:
  ADDI R2, R2, #1
  JMPX ks80_leg_lp
ks80_leg_done:
  CMPI R5, #0
  JNZX ks80_chk_put_inbox
  ; Legacy SpiralHttpd request -> reply with one ACK|PSH (flags=6) frame, body only
  MOV R0, R6
  MOV R4, R1 ; dport = req.sport
  LI R1, #3
  LI R2, #6  ; ACK | PSH
  LI R3, #80
  LI R5, #0
  LI R7, #str_srrp_legacy_bd - 19683
  LMI R7, #1
  LI R8, #44
  CALLX drv_net_send_impl
  JMPX knrd_process

ks80_chk_put_inbox:
  ; Check if request starts with "PUT /inbox/"
  LT R2, R7, #0
  CMPI R2, #'P'
  JNZX ks80_send_200
  LT R2, R7, #1
  CMPI R2, #'U'
  JNZX ks80_send_200
  LT R2, R7, #5
  CMPI R2, #'i'
  JNZX ks80_send_201
  ; Extract filename at R7 + 11 ("PUT /inbox/<name> ") into 9790..9798
  ADDI R2, R7, #11
  LI R3, #9790
  LI R5, #0
ks80_fn_lp:
  CMPI R5, #8
  JNNX ks80_fn_done
  LT R8, R2, #0
  CMPI R8, #32 ; ' '
  JZX ks80_fn_done
  CMPI R8, #0
  JZX ks80_fn_done
  ST R8, R3, #0
  ADDI R2, R2, #1
  ADDI R3, R3, #1
  ADDI R5, R5, #1
  JMPX ks80_fn_lp
ks80_fn_done:
  LI R8, #0
  ST R8, R3, #0
  ; Find double-LF (10, 10) in K_SRRP_RX_BUF (R7) to locate trytes16 body
  LI R2, #0
ks80_bd_lp:
  CMP R2, R0
  JNNX ks80_send_201
  ADD R3, R7, R2
  LT R8, R3, #0
  CMPI R8, #10
  JNZX ks80_bd_nx
  LT R8, R3, #1
  CMPI R8, #10
  JZX ks80_bd_found
ks80_bd_nx:
  ADDI R2, R2, #1
  JMPX ks80_bd_lp
ks80_bd_found:
  ADDI R2, R2, #2 ; body offset
  ADD R3, R7, R2  ; R3 = body byte ptr
  SUB R0, R0, R2  ; R0 = body byte len
  LI R2, #2
  DIV R0, R0, R2  ; R0 = num_trytes = body_bytes / 2
  LI R5, #0
  LMI R5, #46     ; 46 * 19683 = K_SRRP_TRYTE_BUF
  LI R2, #0
ks80_dec_lp:
  CMP R2, R0
  JNNX ks80_dec_done
  MULI R8, R2, #2
  ADD R8, R3, R8
  LT R7, R8, #0 ; lo
  LT R8, R8, #1 ; hi
  MULI R8, R8, #256
  ADD R7, R7, R8
  LI R8, #-6598
  LMI R8, #2 ; 32768
  CMP R7, R8
  JNX ks80_dec_st
  LI R8, #6487
  LMI R8, #3 ; 65536
  SUB R7, R7, R8
ks80_dec_st:
  ADD R8, R5, R2
  ST R7, R8, #0
  ADDI R2, R2, #1
  JMPX ks80_dec_lp
ks80_dec_done:
  PUSH R1
  PUSH R4
  PUSH R6
  LI R1, #9790
  MOV R2, R5 ; 46 * 19683
  MOV R3, R0 ; num_trytes
  LI R4, #1
  CALL fs_write
  POP R6
  POP R4
  POP R1
ks80_send_201:
  LI R7, #str_srrp_201 - 19683
  LMI R7, #1
  LI R8, #28
  JMPX ks80_send_resp
ks80_send_200:
  LI R7, #str_srrp_200_hts - 19683
  LMI R7, #1
  LI R8, #98
ks80_send_resp:
  MOV R0, R6
  MOV R4, R1
  LI R1, #3
  LI R2, #13 ; SYN|PSH|FIN
  LI R3, #80
  LI R5, #0
  CALLX drv_net_send_impl
  JMPX knrd_process

; ks80_send_sack_ack: sends 3-byte SACK + Window(8) ACK based on K_SRRP_FRAME_GOT (R3 = 44*19683)
ks80_send_sack_ack:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  PUSH R8
  LW R0, R3, #201 ; syn_seq
  LT R2, R3, #204 ; expect_idx
  ADD R5, R0, R2
  LI R7, #6487
  LMI R7, #3 ; 65536
  MOD R5, R5, R7 ; R5 = ack = (syn_seq + expect_idx) mod 65536
  ; Build 16-bit SACK bitmap for b = 0..15: bit b = got[expect_idx + 1 + b]
  LI R0, #0 ; sack_bitmap
  LI R7, #1 ; bit_val = 1
  LI R8, #0 ; b = 0..15
ks80_sack_lp:
  CMPI R8, #16
  JNNX ks80_sack_done
  ADD R2, R3, R8
  LT R4, R3, #204 ; expect_idx
  ADD R2, R2, R4
  ADDI R2, R2, #1 ; expect_idx + 1 + b
  LT R2, R2, #0  ; got[expect_idx + 1 + b]
  CMPI R2, #1
  JNZX ks80_sack_nx
  ADD R0, R0, R7
ks80_sack_nx:
  MULI R7, R7, #2
  ADDI R8, R8, #1
  JMPX ks80_sack_lp
ks80_sack_done:
  LI R7, #K_NET_TX_BUF - 19683
  LMI R7, #73
  ADDI R7, R7, #220
  LI R2, #256
  MOD R4, R0, R2
  ST R4, R7, #0 ; sack_lo
  DIV R4, R0, R2
  ST R4, R7, #1 ; sack_hi
  LI R4, #8
  ST R4, R7, #2 ; Window = 8
  MOV R0, R6    ; dst = src_node
  MOV R4, R1    ; dport = rx.sport
  LI R3, #80    ; sport = 80 (or ephemeral if rx.sport == 80)
  CMPI R1, #80
  JNZX ks80_sp_ok
  LI R3, #49152 - 19683
  LMI R3, #2
ks80_sp_ok:
  LI R1, #3
  LI R2, #2 ; FLAG_ACK
  LI R8, #3
  CALLX drv_net_send_impl
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

; drv_net_sns_impl: R0 = op (1=HELLO, 2=WHO, 3=BYE, 4=set name from R1, 5=copy peers to R1, 6=toggle share, 7=set age/token, 8=update & get displayName)
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
  CMPI R0, #7
  JZX dnsns_set_age_token
  CMPI R0, #8
  JZX dnsns_get_display
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
  CALLX drv_net_name_agent_update
  LI R1, #1
  ST R1, R7, #0 ; op = 1 (HELLO)
  LI R1, #3
  ST R1, R7, #1 ; kind = 3 (TRITON)
  LI R1, #2
  ST R1, R7, #2 ; os = 2 (TRITOS)
  LI R1, #31
  LI R2, #K_NET_SHARE
  LT R2, R2, #0
  CMPI R2, #1
  JNZX dnsns_svc_ok
  ADDI R1, R1, #64 ; + SERVICE.SHARE (64)
dnsns_svc_ok:
  ST R1, R7, #3 ; services lo
  LI R1, #0
  ST R1, R7, #4 ; services hi = 0
  LI R1, #9790
  LW R0, R1, #0 ; my_age from drv_net_name_agent_update
  LI R2, #256
  MOD R1, R0, R2
  ST R1, R7, #5
  DIV R1, R0, R2
  MOD R1, R1, R2
  ST R1, R7, #6
  LI R1, #0
  ST R1, R7, #7
  ST R1, R7, #8
  LI R1, #9793
  LW R0, R1, #0 ; my_token
  MOD R1, R0, R2
  ST R1, R7, #9
  DIV R1, R0, R2
  MOD R1, R1, R2
  ST R1, R7, #10
  LI R1, #0
  ST R1, R7, #11
  ST R1, R7, #12
  LI R1, #9758
  LT R0, R1, #0 ; my_named
  ST R0, R7, #13
  LT R2, R1, #1 ; my_num at [9759]
  ST R2, R7, #14
  ADDI R3, R7, #15
  LI R1, #str_def_triton - 19683
  LMI R1, #1
  CMPI R0, #1
  JNZX dnsns_cp_nm
  LI R1, #9760
dnsns_cp_nm:
  LI R4, #0
dnsns_nm_lp:
  LT R2, R1, #0
  ST R2, R3, #0
  ADDI R1, R1, #1
  ADDI R3, R3, #1
  ADDI R4, R4, #1
  CMPI R2, #0
  JNZX dnsns_nm_lp
  ADDI R8, R4, #15 ; payload len = 15 + strlen(name) + 1
  LI R0, #65535 - 19683
  LMI R0, #3
  LI R1, #1
  LI R2, #4
  LI R3, #53
  LI R4, #53
  LI R5, #0
  CALLX drv_net_send_impl
  JMPX dnsns_done
dnsns_who:
  LI R2, #2
  ST R2, R7, #0 ; op = 2 (WHO)
  CMPI R1, #0
  JPX dnsns_who_ptr
  LI R1, #str_def_cnsw - 19683
  LMI R1, #1
dnsns_who_ptr:
  ADDI R3, R7, #1
  LI R4, #0
dnsns_w_lp:
  LT R2, R1, #0
  ST R2, R3, #0
  ADDI R1, R1, #1
  ADDI R3, R3, #1
  ADDI R4, R4, #1
  CMPI R2, #0
  JNZX dnsns_w_lp
  ADDI R8, R4, #1 ; 1 + strlen(name) + 1
  LI R0, #65535 - 19683
  LMI R0, #3
  LI R1, #1
  LI R2, #4
  LI R3, #53
  LI R4, #53
  LI R5, #0
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
  LI R0, #9758
  LI R2, #1
  ST R2, R0, #0 ; my_named = 1
  LI R2, #0
  ST R2, R0, #1 ; my_num = 0
  CALLX drv_net_name_agent_update
  JMPX dnsns_done
dnsns_set_age_token:
  LI R0, #9787
  SW R1, R0, #0 ; my_age_override = R1
  LI R0, #9784
  SW R2, R0, #0 ; my_token = R2
  LI R0, #9758
  LI R1, #0
  ST R1, R0, #0 ; my_named = 0
  ST R1, R0, #1 ; my_num = 0
  LI R0, #0
  LMI R0, #72
  LI R1, #0
  LI R2, #256
  BFILL R0, R1, R2
  CALLX drv_net_name_agent_update
  JMPX dnsns_done
dnsns_get_display:
  CALLX drv_net_poll_impl
  CALLX drv_net_name_agent_update
  CMPI R1, #0
  JNPX dnsns_gd_ret
  MOV R0, R1
  LI R1, #250
  LMI R1, #44
  LI R2, #16
  BCOPY R0, R1, R2
dnsns_gd_ret:
  LI R1, #9759
  LT R0, R1, #0
  POP R8
  POP R7
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  RET
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
  CALLX drv_net_name_agent_update
  MOV R0, R1 ; user dst ptr
  LI R1, #0
  LMI R1, #72 ; 72 * 19683 = K_SNS_PEERS
  LI R2, #256
  BCOPY R0, R1, R2
  ; Also copy local displayName (9740..9755) to R0 (user dst + 256)
  LI R1, #250
  LMI R1, #44
  LI R2, #16
  BCOPY R0, R1, R2
  ; Count active peers
  LI R1, #0
  LMI R1, #72
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
; R2 == 0: polls NIC and copies K_SRRP_RX_BUF (74*19683, len K_SRRP_RX_LEN at 9777) into user buffer R1 -> returns len in R0
; R2 > 0: sends SRRP message from R1 of length R2 to dst_node R0 (windowed multi-frame with SACK resend)
; R2 < 0: encodes (-R2) trytes from R1 as "PUT /inbox/file SRRP/1 trytes16" into 47*19683 and runs windowed SACK transfer to dst_node R0!
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
  JPX dnsrrp_send_raw
  JNX dnsrrp_send_trytes
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

dnsrrp_send_trytes:
  ; R0 = dst_node, R1 = tryte_src_ptr (0 = read 23 sectors from LBA 300 into 46*19683), R2 = -num_trytes
  MOV R6, R0 ; R6 = dst_node
  NEG R5, R2 ; R5 = num_trytes
  CMPI R1, #0
  JPX dnsrrp_src_ok
  PUSH R5
  PUSH R6
  LI R0, #300
  LI R1, #0
  LMI R1, #46
  LI R2, #23
  CALL drv_disk_read
  POP R6
  POP R5
  LI R1, #0
  LMI R1, #46
dnsrrp_src_ok:
  MULI R4, R5, #2 ; R4 = body_bytes = 2 * num_trytes
  LI R0, #0
  LMI R0, #47 ; 47 * 19683 = K_SRRP_TX_ASSEMBLE_BUF
  LI R2, #str_srrp_put_hdr1 - 19683
  LMI R2, #1
  LI R3, #48
  BCOPY R0, R2, R3 ; advances R0 by 48
  ; Format decimal R4 (body_bytes) into R0
  MOV R2, R4
  LI R3, #0 ; digit count
  LI R7, #9730 ; temp digits
dnsrrp_fmt_lp:
  LI R8, #10
  MOD R8, R2, R8
  ADDI R8, R8, #48
  PUSH R1
  ADD R1, R7, R3
  ST R8, R1, #0
  POP R1
  ADDI R3, R3, #1
  LI R8, #10
  DIV R2, R2, R8
  CMPI R2, #0
  JPX dnsrrp_fmt_lp
dnsrrp_fmt_rev:
  SUBI R3, R3, #1
  ADD R2, R7, R3
  LT R8, R2, #0
  ST R8, R0, #0
  ADDI R0, R0, #1
  CMPI R3, #0
  JPX dnsrrp_fmt_rev
  LI R8, #10 ; LF (10)
  ST R8, R0, #0
  ST R8, R0, #1
  ADDI R0, R0, #2
  ; Encode R5 trytes from R1 as trytes16 (LE) at R0
  LI R2, #0
dnsrrp_enc_lp:
  CMP R2, R5
  JNNX dnsrrp_enc_done
  ADD R3, R1, R2
  LT R7, R3, #0
  CMPI R7, #0
  JNNX dnsrrp_enc_pos
  LI R8, #6487
  LMI R8, #3 ; 65536
  ADD R7, R7, R8
dnsrrp_enc_pos:
  LI R8, #256
  MOD R3, R7, R8
  ST R3, R0, #0
  DIV R3, R7, R8
  ST R3, R0, #1
  ADDI R0, R0, #2
  ADDI R2, R2, #1
  JMPX dnsrrp_enc_lp
dnsrrp_enc_done:
  LI R1, #0
  LMI R1, #47
  SUB R2, R0, R1 ; R2 = total message length
  MOV R0, R6     ; R0 = dst_node

dnsrrp_send_raw:
  ; Reset K_SRRP_RX_LEN = 0, K_SRRP_ACK_SEQ = -1, K_SRRP_SACK = 0
  LI R3, #9777
  LI R4, #0
  SW R4, R3, #0
  LI R3, #9770
  LI R4, #-1
  SW R4, R3, #0
  LI R4, #0
  SW R4, R3, #3
  CMPI R2, #480
  JPX dnsrrp_multi
  ; Single-frame SRRP message (SYN|PSH|FIN = 13)
  MOV R7, R1
  MOV R8, R2
  LI R1, #3  ; PROTO_SSP = 3
  LI R2, #13 ; SYN | PSH | FIN
  LI R3, #49152 - 19683
  LMI R3, #2
  LI R4, #80
  LI R5, #0
  CALLX drv_net_send_impl
  JMPX dnsrrp_ret

dnsrrp_multi:
  ; Multi-frame windowed SACK sender: R0 = dst_node, R1 = msg_ptr, R2 = msg_len
  MOV R6, R0 ; R6 = dst_node
  ADDI R0, R2, #479
  LI R3, #480
  DIV R5, R0, R3 ; R5 = total_frames
  ; Initialize tx state at 44 * 19683 + 300:
  ; +300..379 = tx_acked[0..79]
  ; +380..382 = msg_ptr (R1)
  ; +383..385 = msg_len (R2)
  ; +386..388 = total_frames (R5)
  ; +389..391 = syn_seq
  ; +392 = base_idx, +393 = next_idx, +394 = cwnd, +395 = timeouts
  LI R3, #300
  LMI R3, #44 ; R3 = 44*19683 + 300
  PUSH R1
  PUSH R2
  MOV R0, R3
  LI R1, #0
  LI R2, #80
  BFILL R0, R1, R2
  POP R2
  POP R1
  SW R1, R3, #80 ; msg_ptr
  SW R2, R3, #83 ; msg_len
  SW R5, R3, #86 ; total_frames
  LI R4, #K_NET_SEQ
  LW R0, R4, #0
  SW R0, R3, #89 ; syn_seq
  LI R0, #0
  ST R0, R3, #92 ; base_idx = 0
  ST R0, R3, #93 ; next_idx = 0
  ST R0, R3, #95 ; timeouts = 0
  LI R0, #2
  ST R0, R3, #94 ; cwnd = 2

dnsrrp_win_lp:
  LT R0, R3, #92 ; base_idx
  LW R5, R3, #86 ; total_frames
  CMP R0, R5
  JNNX dnsrrp_win_done
  ; Send new frames while next_idx < total_frames && next_idx < base_idx + cwnd
  LT R4, R3, #94 ; cwnd
  ADD R4, R0, R4 ; win_limit = base_idx + cwnd
dnsrrp_tx_new_lp:
  LT R2, R3, #93 ; next_idx
  CMP R2, R5
  JNNX dnsrrp_poll_acks
  CMP R2, R4
  JNNX dnsrrp_poll_acks
  MOV R0, R2
  CALLX dnsrrp_tx_frame_idx
  ADDI R2, R2, #1
  ST R2, R3, #93 ; next_idx++
  JMPX dnsrrp_tx_new_lp

dnsrrp_poll_acks:
  PUSH R3
  PUSH R5
  PUSH R6
  CALLX drv_net_poll_impl
  POP R6
  POP R5
  POP R3
  ; Inspect K_SRRP_ACK_SEQ (9770) and K_SRRP_SACK (9773)
  LI R4, #9770
  LW R0, R4, #0 ; ack_seq
  CMPI R0, #0
  JNX dnsrrp_no_ack_yet
  LW R1, R3, #89 ; syn_seq
  SUB R0, R0, R1
  LI R1, #6487
  LMI R1, #3 ; 65536
  ADD R0, R0, R1
  MOD R0, R0, R1 ; R0 = ack_idx = (ack_seq - syn_seq) mod 65536
  LT R1, R3, #92 ; old base_idx
  LW R5, R3, #86 ; total_frames
  CMP R0, R5
  JPX dnsrrp_no_ack_yet
  ; Mark tx_acked[0 .. ack_idx - 1] = 1
  LI R2, #0
dnsrrp_mk_ack_lp:
  CMP R2, R0
  JNNX dnsrrp_mk_sack
  ADD R7, R3, R2
  LI R8, #1
  ST R8, R7, #0
  ADDI R2, R2, #1
  JMPX dnsrrp_mk_ack_lp
dnsrrp_mk_sack:
  ; Mark SACK bitmap bits relative to ack_idx: bit b (0..15) -> tx_acked[ack_idx + 1 + b] = 1
  LW R2, R4, #3 ; K_SRRP_SACK
  LI R7, #0 ; b = 0..15
dnsrrp_sk_lp:
  CMPI R7, #16
  JNNX dnsrrp_adv_base
  LI R8, #2
  MOD R8, R2, R8
  CMPI R8, #1
  JNZX dnsrrp_sk_nx
  ADD R8, R0, R7
  ADDI R8, R8, #1 ; idx = ack_idx + 1 + b
  CMP R8, R5
  JNNX dnsrrp_sk_nx
  ADD R8, R3, R8
  LI R4, #1
  ST R4, R8, #0
dnsrrp_sk_nx:
  LI R8, #2
  DIV R2, R2, R8
  ADDI R7, R7, #1
  JMPX dnsrrp_sk_lp

dnsrrp_adv_base:
  LT R2, R3, #92 ; base_idx
dnsrrp_ab_lp:
  CMP R2, R5
  JNNX dnsrrp_ab_done
  ADD R7, R3, R2
  LT R7, R7, #0
  CMPI R7, #1
  JNZX dnsrrp_ab_done
  ADDI R2, R2, #1
  JMPX dnsrrp_ab_lp
dnsrrp_ab_done:
  CMP R2, R1
  JNPX dnsrrp_chk_gap_resend
  ; base_idx advanced! Reset timeouts = 0 and grow cwnd up to 8
  ST R2, R3, #92 ; base_idx = R2
  LI R0, #0
  ST R0, R3, #95 ; timeouts = 0
  LT R0, R3, #94 ; cwnd
  CMPI R0, #8
  JNNX dnsrrp_chk_complete
  ADDI R0, R0, #1
  ST R0, R3, #94
dnsrrp_chk_complete:
  CMP R2, R5
  JNNX dnsrrp_win_done
  ; If any sent frame in base_idx .. next_idx - 1 is unacked while a later frame IS SACKed, selectively resend it!
dnsrrp_chk_gap_resend:
  LT R2, R3, #92 ; base_idx
  LT R4, R3, #93 ; next_idx
  ; Check if any frame > base_idx is already SACKed
  ADDI R7, R2, #1
  LI R8, #0 ; has_later_sack
dnsrrp_hl_lp:
  CMP R7, R4
  JNNX dnsrrp_hl_done
  ADD R0, R3, R7
  LT R0, R0, #0
  CMPI R0, #1
  JNZX dnsrrp_hl_nx
  LI R8, #1
dnsrrp_hl_nx:
  ADDI R7, R7, #1
  JMPX dnsrrp_hl_lp
dnsrrp_hl_done:
  CMPI R8, #1
  JZX dnsrrp_selective_resend
  ; If next_idx < base_idx + cwnd and next_idx < total_frames, continue sending new frames
  LT R0, R3, #94 ; cwnd
  ADD R0, R2, R0
  CMP R4, R0
  JNX dnsrrp_win_lp

dnsrrp_no_ack_yet:
  ; Timeout without base progress: increment timeouts, halve cwnd, selectively resend un-SACKed frames
  LT R0, R3, #95 ; timeouts
  ADDI R0, R0, #1
  ST R0, R3, #95
  CMPI R0, #5
  JPX dnsrrp_timeout_fail
  LT R0, R3, #94 ; cwnd
  LI R1, #2
  DIV R0, R0, R1
  CMPI R0, #1
  JNNX dnsrrp_cw_ok
  LI R0, #1
dnsrrp_cw_ok:
  ST R0, R3, #94
dnsrrp_selective_resend:
  LT R2, R3, #92 ; base_idx
  LT R4, R3, #93 ; next_idx
dnsrrp_sr_lp:
  CMP R2, R4
  JNNX dnsrrp_sr_done
  ADD R0, R3, R2
  LT R0, R0, #0 ; tx_acked[idx]
  CMPI R0, #1
  JZX dnsrrp_sr_nx
  MOV R0, R2
  CALLX dnsrrp_tx_frame_idx
dnsrrp_sr_nx:
  ADDI R2, R2, #1
  JMPX dnsrrp_sr_lp
dnsrrp_sr_done:
  PUSH R3
  PUSH R5
  PUSH R6
  CALLX drv_net_poll_impl
  POP R6
  POP R5
  POP R3
  JMPX dnsrrp_win_lp

dnsrrp_timeout_fail:
  LI R0, #K_NET_STATUS_MSG - 19683
  LMI R0, #73
  LI R1, #str_net_timeout - 19683
  LMI R1, #1
  LI R2, #8
  BCOPY R0, R1, R2
  LI R0, #-1
  JMPX dnsrrp_ret

dnsrrp_win_done:
  LW R0, R3, #86 ; return total_frames
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

; dnsrrp_tx_frame_idx: transmits frame R0 (0..total_frames-1) using state at R3 (44*19683+300) and dst_node R6
dnsrrp_tx_frame_idx:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R7
  PUSH R8
  MOV R4, R0 ; R4 = idx
  LW R0, R3, #89 ; syn_seq
  ADD R0, R0, R4
  LI R1, #6487
  LMI R1, #3 ; 65536
  MOD R0, R0, R1
  LI R1, #K_NET_SEQ
  SW R0, R1, #0  ; set K_NET_SEQ = syn_seq + idx for drv_net_send_impl
  MULI R0, R4, #480
  LW R1, R3, #80 ; msg_ptr
  ADD R7, R1, R0 ; R7 = payload_ptr
  LW R2, R3, #83 ; msg_len
  SUB R8, R2, R0 ; remaining bytes
  CMPI R8, #480
  JNPX dnsrrp_tf_len_ok
  LI R8, #480
dnsrrp_tf_len_ok:
  LI R2, #4 ; FLAG_PSH
  CMPI R4, #0
  JNZX dnsrrp_tf_chk_fin
  ADDI R2, R2, #1 ; + FLAG_SYN
dnsrrp_tf_chk_fin:
  LW R5, R3, #86 ; total_frames
  SUBI R5, R5, #1
  CMP R4, R5
  JNZX dnsrrp_tf_send
  ADDI R2, R2, #8 ; + FLAG_FIN
dnsrrp_tf_send:
  MOV R0, R6 ; dst_node
  LI R1, #3  ; PROTO_SSP
  LI R3, #49152 - 19683
  LMI R3, #2
  LI R4, #80
  LI R5, #0
  CALLX drv_net_send_impl
  POP R8
  POP R7
  POP R5
  POP R4
  POP R3
  POP R2
  POP R1
  POP R0
  RET
`;
}

function getApp10ExtensionsAsm() {
  return `
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
;   F8 (143): Broadcast SNS HELLO via SYSCALL #46 (op=1) and refresh PEERS view
; ============================================================================
net_do_sns_announce:
  LI R0, #1
  LI R1, #0
  SYSCALL #46
  JMPX net_do_peers_view

net_do_srrp_tx_1k:
  LI R0, #253
  LI R1, #0
  LI R2, #-1024
  SYSCALL #47
  JMPX net_ev_lp

net_do_srrp_tx_8k:
  LI R0, #253
  LI R1, #0
  LI R2, #-8192
  SYSCALL #47
  JMPX net_ev_lp

net_do_srrp_tx_16k:
  LI R0, #253
  LI R1, #0
  LI R2, #3299 ; 3299 - 19683 = -16384
  LMI R2, #-1
  SYSCALL #47
  JMPX net_ev_lp

net_do_peers_view:
  LI R0, #5
  LI R1, #5400
  ADD R1, R8, R1
  SYSCALL #46 ; R0 = peer_count, +5400..5655 = 8 peer entries, +5656..5671 = local displayName
  LI R6, #5128
  ADD R6, R8, R6
  LI R1, #1
  ST R1, R6, #0 ; view_mode = 1 (PEERS)
  ST R0, R6, #1 ; peer_count
  ; Save 272-tryte peer table + local displayName to "NETPEERS"
  LI R0, #str_netpeers_fn - app10_net_rom
  ADD R0, R0, R8
  LI R1, #5400
  ADD R1, R8, R1
  LI R2, #272
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
  LI R2, #55
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
  CMPI R0, #'s'
  JNZX ndwr_chk_nl
  LT R0, R3, #1
  CMPI R0, #'n'
  JNZX ndwr_chk_nl
  LT R0, R3, #2
  CMPI R0, #'a'
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
  ; Save width (R2), height (R3), total (R6) at +5124..5126 and plot each pixel 1:1 via SYSCALL #22 at (8 + x, 20 + y)!
  LI R0, #5124
  ADD R0, R8, R0
  ST R2, R0, #0 ; width
  ST R3, R0, #1 ; height
  ST R6, R0, #2 ; total
  LI R4, #0 ; y = 0..height-1
ndwr_py_lp:
  LI R0, #5124
  ADD R0, R8, R0
  LT R3, R0, #1 ; height
  CMP R4, R3
  JNNX ndwr_px_done
  LI R5, #0 ; x = 0..width-1
ndwr_px_lp:
  LI R0, #5124
  ADD R0, R8, R0
  LT R2, R0, #0 ; width
  CMP R5, R2
  JNNX ndwr_py_nx
  MUL R0, R4, R2
  ADD R0, R0, R5
  ADD R0, R7, R0
  LT R2, R0, #0 ; pixel color
  ADDI R0, R5, #8  ; win_x = 8 + x
  ADDI R1, R4, #20 ; win_y = 20 + y
  SYSCALL #22
  ADDI R5, R5, #1
  JMPX ndwr_px_lp
ndwr_py_nx:
  ADDI R4, R4, #1
  JMPX ndwr_py_lp
ndwr_px_done:
  LI R0, #5124
  ADD R0, R8, R0
  LT R6, R0, #2 ; total
  LI R0, #str_websnap_fn - app10_net_rom
  ADD R0, R0, R8
  MOV R1, R7
  MOV R2, R6
  LI R3, #1
  SYSCALL #32

ndwr_flush_win:
  ADDI R0, R8, #5000
  SYSCALL #45
  ADDI R5, R8, #5000
  LW R1, R5, #15
  MULI R1, R1, #17
  ADD R0, R0, R1
  LT R1, R5, #100
  ADD R0, R0, R1
  ADDI R6, R8, #5120
  SW R0, R6, #4
  LI R0, #0
  ST R0, R6, #7
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
  ; Also render our own local displayName at (150, 18) from +5656
  LI R0, #150
  LI R1, #18
  LI R2, #5656
  ADD R2, R8, R2
  LI R3, #COL_GREEN
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
str_peers_hdr:     .stringz "SNS PEERS:"
str_inbox_hdr:     .stringz "INBOX & SHARE (/share):"
str_srrp_get_req:  .stringz "GET /index.hts SRRP/1\\n\\n"
str_srrp_post_req: .stringz "POST /form SRRP/1\\nType: form\\nSize: 16\\n\\nuser=triton&ok=1"
`;
}

module.exports = { getApp6ExtensionsAsm, getApp7ExtensionsAsm, getNetV3SrrpAndSnsAsm, getApp10ExtensionsAsm };
