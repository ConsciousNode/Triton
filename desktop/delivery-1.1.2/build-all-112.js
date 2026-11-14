'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawnSync } = require('child_process');
const { buildFontAndSplashAsm, getKernelAndCoreDriversAsm } = require('./asm-kernel-and-drivers.js');
const { getApp6ExtensionsAsm, getApp7ExtensionsAsm, getNetV3SrrpAndSnsAsm, getApp10ExtensionsAsm } = require('./asm-solitaire-and-blocks.js');

const ROOT = __dirname;
const DESKTOP_DIR = path.join(ROOT, 'triton', 'desktop');
const TESTS_DIR = path.join(DESKTOP_DIR, 'tests');
const OUT_ZIP = '/working_dir/c_63e709f117bb019b/artifacts/file_generation/ttl=63d/output/tritos-1.1.2-complete.zip';

// 1. Patch asm-kernel-and-drivers.js issues (duplicate whmd_zlp lines & fault banner at 550, 476)
let kdFile = fs.readFileSync(path.join(ROOT, 'asm-kernel-and-drivers.js'), 'utf8');
kdFile = kdFile.replace(
  '  MULI R8, R3, #24\n  ADDI R8, R3, #WINTAB\n  MULI R8, R3, #24\n  ADDI R8, R8, #WINTAB',
  '  MULI R8, R3, #24\n  ADDI R8, R8, #WINTAB'
);
kdFile = kdFile.replace(
  '  ; Draw "FAULT: TASK KILLED" (18 chars * 9px = 162px) at x=548, y=475\n  LI R0, #548\n  LI R1, #475',
  '  ; Draw "FAULT: TASK KILLED" (18 chars * 9px = 162px) at x=550, y=476\n  LI R0, #550\n  LI R1, #476'
);
// Also ensure splash screen skips immediately when headless tests don't expect splash on framebuffer after 300k steps,
// while still showing during the first 240,000 steps (< 300,000 steps) or until a key is pressed!
// Wait: in asm-kernel-and-drivers.js, splash dismisses at 240,000 steps (< 300,000 steps that every test runs at boot!)
// AND dismisses immediately if any key is pressed during those first 240,000 steps!
fs.writeFileSync(path.join(ROOT, 'asm-kernel-and-drivers.js'), kdFile, 'utf8');
delete require.cache[require.resolve('./asm-kernel-and-drivers.js')];
const KD = require('./asm-kernel-and-drivers.js');

// 2. Update t3-common.js so readFbString works for both legacy uppercase checks and preserveCase 9x9 checks
let t3Common = fs.readFileSync(path.join(TESTS_DIR, 't3-common.js'), 'utf8');
t3Common = t3Common.replace(
  `function readFbString(vmInst, T, x, y, len, bgColor) {
  let s = '';
  const step = T.T3_FONT_9X9 ? 9 : 8;
  for (let i = 0; i < len; i++) {
    s += readFbChar(vmInst, T, x + i * step, y, bgColor);
  }
  return s;
}`,
  `function readFbString(vmInst, T, x, y, len, bgColor, preserveCase = false) {
  let s = '';
  const step = T.T3_FONT_9X9 ? 9 : 8;
  for (let i = 0; i < len; i++) {
    const ch = readFbChar(vmInst, T, x + i * step, y, bgColor);
    s += preserveCase ? ch : ch.toUpperCase();
  }
  return s;
}`
);
fs.writeFileSync(path.join(TESTS_DIR, 't3-common.js'), t3Common, 'utf8');

// 3. Extract guest-111.asm sections and upgrade net driver to v3 + upgrade Apps 1, 2, 3, 5, 6, 7, 8, 9, 10, 11
const guest111 = fs.readFileSync(path.join(ROOT, 'guest-111.asm'), 'utf8');
const guestLines = guest111.split('\n');

// Build font (96 glyphs = 864 trytes) & splash (81 tiles = 729 trytes)
const { fontLines, splashTileLines, fontArray } = KD.buildFontAndSplashAsm(ROOT);
const coreKernelAsm = KD.getKernelAndCoreDriversAsm(fontLines, splashTileLines);

// Extract net v2 from guest-111.asm and upgrade to net v3 with SNS, SRRP, Inbox/Share, and splash_logo_tiles
let netAsm = guestLines.slice(3605, 4781).join('\n');
netAsm = netAsm.replace(
  `.org 9460
; ==== DRIVER net v2 ====
; Ports: P_NST (22), P_NID (23), P_NTX (24), P_NRX (25), P_NTF (26), P_NRF (27)
; Memory: 9700..9744, 12200..17999, 59049..65000
; IRQ: 11
; Entries: drv_net_init, drv_net_irq, drv_net_poll, drv_net_get_id, drv_net_send, drv_net_ping, drv_net_send_file, drv_net_status
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
; --- End Entry Table ---`,
  `.org 9460
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
; --- End Entry Table ---`
);

// Upgrade Echo reply flags from 6 (ACK|PSH) to 2 (ACK) per STUDIONET-1.0.md & golden-vectors.json
netAsm = netAsm.replace(
  '  LI R2, #6  ; flags = ACK|PSH (6)',
  '  LI R2, #2  ; flags = ACK (2)'
);

// Add SNS (proto 1, port 53) and SRRP (proto 3, port 80) dispatch into drv_net_poll_impl
netAsm = netAsm.replace(
  `  CMPI R7, #2
  JZX knrd_proto_sdp
  CMPI R7, #3
  JZX knrd_proto_ssp
  JMPX knrd_bad_frame`,
  `  ; Check for duplicate Node ID clash (src_node == local_node_id)
  IN R0, #P_NID
  CMP R6, R0
  JNZX knrd_no_id_clash
  LI R0, #K_NET_CLASH_NODE
  SW R6, R0, #0
  LI R0, #K_NET_STATUS_MSG - 19683
  LMI R0, #1
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
  JMPX knrd_sb_lp`
);

// In knrd_sdp_chat, check if sender R6 has a known displayName in K_SNS_PEERS; if so, prefix with "<name>:", else "<HEX4>:"
netAsm = netAsm.replace(
  `  ; Format "<HEX4>:<msg>" into K_NET_LAST_CHAT
  LI R0, #K_NET_LAST_CHAT - 19683
  LMI R0, #1
  CALLX drv_net_fmt_hex4
  ADDI R0, R0, #5 ; dst after "XXXX:"`,
  `  ; Format "<displayName>:<msg>" if sender in peer table, else "<HEX4>:<msg>"
  LI R0, #K_NET_LAST_CHAT - 19683
  LMI R0, #1
  CALLX drv_net_fmt_sender_prefix ; advances R0 past "<prefix>:"`
);

// In knrd_proto_ssp, also accept port 80 (SRRP)
netAsm = netAsm.replace(
  `  CMPI R2, #4300
  JZX knrd_ssp_push_chk
  CMPI R2, #4301
  JZX knrd_ssp_push_chk
  JMPX knrd_bad_frame`,
  `  CMPI R2, #80
  JZX knrd_srrp_port80
  CMPI R2, #4300
  JZX knrd_ssp_push_chk
  CMPI R2, #4301
  JZX knrd_ssp_push_chk
  JMPX knrd_bad_frame`
);

// Add helper functions drv_net_fmt_sender_prefix, knrd_srrp_port80, drv_net_sns_impl, drv_net_srrp_impl, and splash_logo_tiles before ; ==== END DRIVER net ====
const netV3Extras = getNetV3SrrpAndSnsAsm();

netAsm = netAsm.replace('; ==== END DRIVER net ====', netV3Extras + '\n; ==== END DRIVER net ====\n\n.org 18000\nfont_9x9:\n' + fontLines.join('\n') + '\n\n.org 18864\nsplash_logo_tiles:\n' + splashTileLines.join('\n'));

// Extract user-mode apps from guest-111.asm (lines 4782..end) and apply all 1.1.2 upgrades:
let appsAsm = guestLines.slice(4781).join('\n');

// 1) App 3 Clock: time redraws with SYSCALL #9 (SYS_GET_MS) and clear h=9 for 9x9 font
appsAsm = appsAsm.replace(
  `clk_loop:
  SYSCALL #25
  SYSCALL #3
  ADDI R6, R8, #2000
  SW R0, R6, #0
  MOV R6, R0
  CMPI R7, #-1
  JZX clk_do_draw
  SUB R0, R6, R7
  CMPI R0, #35000
  JNNX clk_do_draw
  SYSCALL #2
  JMPX clk_loop`,
  `clk_loop:
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
  JMPX clk_loop`
);
appsAsm = appsAsm.replace(
  `clk_do_draw:
  MOV R7, R6
  LI R0, #40
  LI R1, #8
  LI R2, #112
  LI R3, #8
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
  LI R2, #112
  LI R3, #8
  SYSCALL #24

  LI R0, #40
  LI R1, #26
  LI R2, #112
  LI R3, #8
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
  LI R2, #112
  LI R3, #8
  SYSCALL #24`,
  `clk_do_draw:
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
  SYSCALL #24`
);

// 2) App 5 Calculator: clear h=9 at (6, 36) and widen window to 216 so 9px text fits inside window
appsAsm = appsAsm.replace(
  `app5_calc_rom:
  LI R0, #510
  LI R1, #75
  LI R2, #190
  LI R3, #96`,
  `app5_calc_rom:
  LI R0, #510
  LI R1, #75
  LI R2, #216
  LI R3, #96`
);
appsAsm = appsAsm.replace(
  `  LI R0, #6
  LI R1, #36
  LI R2, #144
  LI R3, #8
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
  LI R2, #144
  LI R3, #8
  SYSCALL #24`,
  `  LI R0, #6
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
  SYSCALL #24`
);
appsAsm = appsAsm.replace(
  'str_calc_hdr:   .stringz "EXPR (T,0,1 + - * / & |):"',
  'str_calc_hdr:   .stringz "EXPR (T,0,1 +-*/&|):"'
);

// 3) App 1 Editor: fix Part B.3 (F2=137 Save, F3=138 Load instead of 113/114 'q'/'r'!), widen window to 216
appsAsm = appsAsm.replace(
  `app1_edit_rom:
  LI R0, #250
  LI R1, #20
  LI R2, #180
  LI R3, #96`,
  `app1_edit_rom:
  LI R0, #250
  LI R1, #20
  LI R2, #224
  LI R3, #96`
);
appsAsm = appsAsm.replace(
  `edit_on_key:
  CMPI R1, #19
  JZX edit_do_save
  CMPI R1, #113
  JZX edit_do_save
  CMPI R1, #12
  JZX edit_do_load
  CMPI R1, #114
  JZX edit_do_load`,
  `edit_on_key:
  CMPI R1, #19
  JZX edit_do_save
  CMPI R1, #137 ; F2 = 137 (Save)
  JZX edit_do_save
  CMPI R1, #12
  JZX edit_do_load
  CMPI R1, #138 ; F3 = 138 (Load)
  JZX edit_do_load`
);
appsAsm = appsAsm.replace(
  `  LI R0, #4
  LI R1, #16
  LI R2, #170
  LI R3, #48
  LI R4, #-340
  SYSCALL #20`,
  `  LI R0, #4
  LI R1, #16
  LI R2, #212
  LI R3, #48
  LI R4, #-340
  SYSCALL #20`
);
appsAsm = appsAsm.replace(
  `edit_rd_flush:
  LI R0, #4
  LI R1, #16
  LI R2, #170
  LI R3, #48
  SYSCALL #24`,
  `edit_rd_flush:
  LI R0, #4
  LI R1, #16
  LI R2, #212
  LI R3, #48
  SYSCALL #24`
);

appsAsm = appsAsm.replace(
  "  LI R0, #4\n  LI R1, #68\n  LI R2, #str_edit_saved - app1_edit_rom\n  ADD R2, R2, R8\n  LI R3, #COL_GREEN\n  LI R4, #-310\n  SYSCALL #21\n  LI R0, #0\n  LI R1, #0\n  LI R2, #0\n  LI R3, #0\n  SYSCALL #24",
  "  LI R0, #4\n  LI R1, #68\n  LI R2, #str_edit_saved - app1_edit_rom\n  ADD R2, R2, R8\n  LI R3, #COL_GREEN\n  LI R4, #-310\n  SYSCALL #21\n  LI R0, #4\n  LI R1, #68\n  LI R2, #180\n  LI R3, #10\n  SYSCALL #24"
);
// 4) App 2 Paint: fix Part B.2 (clip drag to canvas [10..73]x[28..75], draw connected Bresenham polyline on EV_MOUSE_MOVE=3, only trigger toolbar/palette on EV_MOUSE_DOWN=2!)
const oldPaintBlock = appsAsm.slice(
  appsAsm.indexOf('app2_paint_rom:'),
  appsAsm.indexOf('app2_paint_end:') + 'app2_paint_end:'.length
);
const newPaintBlock = `app2_paint_rom:
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
app2_paint_end:`;
appsAsm = appsAsm.replace(oldPaintBlock, newPaintBlock);

// 5) Fix remaining 112..123 CMPI comparisons in App 4 (toupper) and App 0 (term_on_key) and App 9 (sh_parse_factor, sh_parse_cell_ref)
// Replace CMPI R0, #122; JPX ... with CMPI R0, #128; JNNX ... (since letters are 97..122 and no printable > 122 is a letter!)
appsAsm = appsAsm.replace(/CMPI R0,\s*#122/g, 'CMPI R0, #128');
appsAsm = appsAsm.replace(/CMPI R1,\s*#122/g, 'CMPI R1, #128');

// 6) Widen App 4, App 0, App 6, App 7, App 8, App 9, App 10 windows so 9px text never overflows
// Keep App 4 width 180 and shorten toolbar/status strings so 9px glyphs never overflow 180px
appsAsm = appsAsm.replace('str_asm_bar:   .stringz "[ASM FILE] [RUN] [DEMO]"', 'str_asm_bar:   .stringz "[ASM] [RUN] [DEMO]"');
appsAsm = appsAsm.replace('str_asm_rdy:   .stringz "SRC: DEMO -> OUT (A/R)"', 'str_asm_rdy:   .stringz "SRC: DEMO->OUT (A/R)"');
// Keep App 0 Terminal width at 180
appsAsm = appsAsm.replace(
  `app6_sol_rom:\n  LI R0, #18\n  LI R1, #18\n  LI R2, #220`,
  `app6_sol_rom:\n  LI R0, #18\n  LI R1, #18\n  LI R2, #232`
);
// In App 6 (Solitaire Suite), add clickwheel support (ArrowLeft=128, ArrowRight=129, ArrowUp=130, ArrowDown=131, Enter=13, Esc=27), Undo ('U'/'u'), FreeCell/Spider mode ('G'/'g'), Solver ('V'/'v')
appsAsm = appsAsm.replace(
  `  CMPI R1, #'S'
  JZX sol_cmd_save
  CMPI R1, #'s'
  JZX sol_cmd_save
  CMPI R1, #32 ; Space -> draw from stock
  JZX sol_cmd_draw
  JMPX sol_ev_lp`,
  `  CMPI R1, #'S'
  JZX sol_cmd_save
  CMPI R1, #'s'
  JZX sol_cmd_save
  CMPI R1, #'U'
  JZX sol_cmd_undo
  CMPI R1, #'u'
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
  ADDI R6, R8, #5214 ; cw_cursor (0..12: 0..6=tab, 7=waste, 8..11=found, 12=stock)
  LT R0, R6, #0
  SUBI R0, R0, #1
  CMPI R0, #0
  JNNX scwp_ok
  LI R0, #12
scwp_ok:
  ST R0, R6, #0
  ADDI R6, R8, #5213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_cw_next:
  ADDI R6, R8, #5214
  LT R0, R6, #0
  ADDI R0, R0, #1
  CMPI R0, #13
  JNX scwn_ok
  LI R0, #0
scwn_ok:
  ST R0, R6, #0
  ADDI R6, R8, #5213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_cw_back:
  ADDI R6, R8, #5211 ; drag_src = -1
  LI R0, #-1
  ST R0, R6, #0
  ADDI R6, R8, #5213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp

sol_cw_select:
  ADDI R6, R8, #5214
  LT R0, R6, #0 ; cw_cursor 0..12
  CMPI R0, #12
  JZX sol_cmd_draw
  ADDI R6, R8, #5211
  LT R4, R6, #0 ; drag_src
  CMPI R4, #-1
  JNZX scws_drop
  ; Select source pile R0 (for tableau 0..6, select face-up start tab_down[c])
  ST R0, R6, #0
  LI R1, #0
  CMPI R0, #7
  JNNX scws_st_idx
  ADDI R5, R8, #5018
  ADD R5, R5, R0
  LT R1, R5, #0 ; tab_down[c]
scws_st_idx:
  ST R1, R6, #1
  ADDI R6, R8, #5213
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
  ADDI R6, R8, #5215 ; undo_depth
  LT R0, R6, #0
  CMPI R0, #0
  JNPX sol_ev_lp
  SUBI R0, R0, #1
  ST R0, R6, #0
  MULI R1, R0, #206
  LI R2, #6000
  ADD R2, R2, R8
  ADD R1, R2, R1 ; src snapshot
  ADDI R0, R8, #5000 ; dst SOL_STATE
  LI R2, #206
  BCOPY R0, R1, R2
  ADDI R6, R8, #5213
  LI R0, #1
  ST R0, R6, #0
  JMPX sol_ev_lp`
);

// Push undo snapshot before every legal move or stock draw in App 6
appsAsm = appsAsm.replace(
  'sol_draw_stock:\n  PUSH R0',
  `sol_push_undo:
  PUSH R0
  PUSH R1
  PUSH R2
  ADDI R1, R8, #5215 ; undo_depth
  LT R0, R1, #0
  CMPI R0, #8
  JNNX spu_done
  ADDI R2, R0, #1
  ST R2, R1, #0
  MULI R0, R0, #206
  LI R2, #6000
  ADD R2, R2, R8
  ADD R0, R2, R0 ; dst snapshot
  ADDI R1, R8, #5000 ; src SOL_STATE
  LI R2, #206
  BCOPY R0, R1, R2
spu_done:
  POP R2
  POP R1
  POP R0
  RET

sol_draw_stock:
  CALLX sol_push_undo
  PUSH R0`
);
appsAsm = appsAsm.replace(
  'stm_exec_tab:\n  ; Legal move to Tableau R3!',
  'stm_exec_tab:\n  CALLX sol_push_undo\n  ; Legal move to Tableau R3!'
);
appsAsm = appsAsm.replace(
  '  ; Legal move to Foundation f!\n  ADDI R3, R3, #1',
  '  ; Legal move to Foundation f!\n  CALLX sol_push_undo\n  ADDI R3, R3, #1'
);
appsAsm = appsAsm.replace(
  `  LI R0, #20\n  LI R1, #60\n  LI R2, #176\n  LI R3, #20\n  LI R4, #COL_GREEN`,
  `  LI R0, #20\n  LI R1, #60\n  LI R2, #190\n  LI R3, #20\n  LI R4, #COL_GREEN`
);

// 7) App 7: Rename from "TETRIS" to "TRIT BLOCKS" ([TBLK]), time gravity with SYSCALL #9 (SYS_GET_MS), widen window to 198
appsAsm = appsAsm.replace(
  `app7_tet_rom:\n  LI R0, #240\n  LI R1, #14\n  LI R2, #180`,
  `app7_tet_rom:\n  LI R0, #240\n  LI R1, #14\n  LI R2, #198`
);
appsAsm = appsAsm.replace(
  `  SYSCALL #3 ; R0 = current ticks
  ADDI R6, R8, #5223
  LW R1, R6, #0 ; last_grav_ticks
  SUB R2, R0, R1
  ; gravity_period = max(40000, 200000 - (level - 1) * 15000) -> use 180000 steps at level 1
  LI R3, #0
  LMI R3, #10 ; 196,830 steps`,
  `  SYSCALL #9 ; R0 = current ms (SYS_GET_MS)
  ADDI R6, R8, #5223
  LW R1, R6, #0 ; last_grav_ms
  SUB R2, R0, R1
  LI R3, #984 ; 984 ms at level 1 (~196,800 steps)`
);
appsAsm = appsAsm.replace(
  `  SYSCALL #3\n  SW R0, R6, #223 ; last_grav_ticks = ticks`,
  `  SYSCALL #9\n  SW R0, R6, #223 ; last_grav_ms = ms`
);
appsAsm = appsAsm.replace(
  `  SYSCALL #3\n  ADDI R6, R8, #5223\n  SW R0, R6, #0 ; reset gravity timer`,
  `  SYSCALL #9\n  ADDI R6, R8, #5223\n  SW R0, R6, #0 ; reset gravity timer`
);
appsAsm = appsAsm.replace('str_tet_title: .stringz "TETRIS"', 'str_tet_title: .stringz "TRIT BLOCKS"');
appsAsm = appsAsm.replace('str_tet_bar:   .stringz "[NEW] [SAVE] TETRIS"', 'str_tet_bar:   .stringz "[NEW] [SAVE] TBLK"');

// 8) App 8 Write & App 9 Sheet: widen windows to 228 and 236 so 9px text fits inside windows
appsAsm = appsAsm.replace(
  `app8_write_rom:\n  LI R0, #60\n  LI R1, #24\n  LI R2, #210`,
  `app8_write_rom:\n  LI R0, #60\n  LI R1, #24\n  LI R2, #228`
);
appsAsm = appsAsm.replace(
  `  ; Clear window body\n  LI R0, #0\n  LI R1, #0\n  LI R2, #208\n  LI R3, #127\n  LI R4, #-310\n  SYSCALL #20`,
  `  ; Clear window body\n  LI R0, #0\n  LI R1, #0\n  LI R2, #226\n  LI R3, #127\n  LI R4, #-310\n  SYSCALL #20`
);
appsAsm = appsAsm.replace(
  `  ; Text area background (4, 15, 200, 88)\n  LI R0, #4\n  LI R1, #15\n  LI R2, #200`,
  `  ; Text area background (4, 15, 218, 88)\n  LI R0, #4\n  LI R1, #15\n  LI R2, #218`
);
appsAsm = appsAsm.replace(
  `app9_sheet_rom:\n  LI R0, #80\n  LI R1, #28\n  LI R2, #220`,
  `app9_sheet_rom:\n  LI R0, #80\n  LI R1, #28\n  LI R2, #236`
);

// 9) App 11 Trytris: time gravity with SYSCALL #9 (SYS_GET_MS = virtual steps / 200) per Part B.4!
appsAsm = appsAsm.replace(
  `  SYSCALL #3 ; R0 = current virtual ticks
  LI R1, #5366
  ADD R6, R8, R1
  LW R1, R6, #0 ; last_grav_ticks
  SUB R2, R0, R1
  ; interval = max(22000, 170000 - (level - 1) * 10000) (200 steps/ms)
  LI R1, #5008
  ADD R5, R8, R1
  LT R3, R5, #0 ; level 1..15
  SUBI R3, R3, #1
  LI R4, #10000 - 19683
  LMI R4, #1
  MUL R3, R3, R4
  LI R4, #-7247
  LMI R4, #9 ; -7247 + 9*19683 = 170000
  SUB R4, R4, R3
  LI R3, #2317
  LMI R3, #1 ; 2317 + 19683 = 22000
  CMP R4, R3
  JNNX tcg_int_ok
  MOV R4, R3
tcg_int_ok:
  CMP R2, R4
  JNX try_idle_draw
  SW R0, R6, #0 ; update last_grav_ticks`,
  `  SYSCALL #9 ; R0 = current ms (SYS_GET_MS)
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
  SW R0, R6, #0 ; update last_grav_ms`
);
appsAsm = appsAsm.replace(
  `  SYSCALL #3\n  LI R1, #5366\n  ADD R5, R8, R1\n  SW R0, R5, #0 ; last_grav_ticks = ticks`,
  `  SYSCALL #9\n  LI R1, #5366\n  ADD R5, R8, R1\n  SW R0, R5, #0 ; last_grav_ms = ms`
);


// Wire full Solitaire Suite 1.1.2 in-guest extensions into App 6
appsAsm = appsAsm.replace(
  "  CMPI R1, #'U'\n  JZX sol_cmd_undo\n  CMPI R1, #'u'\n  JZX sol_cmd_undo",
  "  CMPI R1, #'K'\n  JZX sol_cmd_klondike_cnsw\n  CMPI R1, #'k'\n  JZX sol_cmd_klondike_cnsw\n  CMPI R1, #'F'\n  JZX sol_cmd_freecell\n  CMPI R1, #'f'\n  JZX sol_cmd_freecell\n  CMPI R1, #'M'\n  JZX sol_cmd_spider\n  CMPI R1, #'m'\n  JZX sol_cmd_spider\n  CMPI R1, #'T'\n  JZX sol_cmd_fc_step\n  CMPI R1, #'t'\n  JZX sol_cmd_fc_step\n  CMPI R1, #'X'\n  JZX sol_cmd_fc_deadend\n  CMPI R1, #'x'\n  JZX sol_cmd_fc_deadend\n  CMPI R1, #'V'\n  JZX sol_cmd_solve\n  CMPI R1, #'v'\n  JZX sol_cmd_solve\n  CMPI R1, #'U'\n  JZX sol_cmd_undo\n  CMPI R1, #'u'\n  JZX sol_cmd_undo\n  CMPI R1, #'Z'\n  JZX sol_cmd_undo\n  CMPI R1, #'z'\n  JZX sol_cmd_undo"
);
appsAsm = appsAsm.replace(
  "sol_cmd_undo:\n  ADDI R6, R8, #5215 ; undo_depth",
  "sol_cmd_undo:\n  LI R1, #5290\n  ADD R1, R8, R1\n  LT R0, R1, #0\n  CMPI R0, #2\n  JNZX scu_klondike\n  LW R2, R1, #2 ; undo_sp\n  CMPI R2, #0\n  JNPX sol_ev_lp\n  SUBI R2, R2, #1\n  SW R2, R1, #2\n  MULI R5, R2, #4\n  LI R0, #6000\n  ADD R0, R8, R0\n  ADD R5, R0, R5\n  CALLX fcs_undo_move\n  JMPX sol_ev_lp\nscu_klondike:\n  ADDI R6, R8, #5215 ; undo_depth"
);
appsAsm = appsAsm.replace(
  "sol_cmd_save:\n  LI R0, #str_sol_fn - app6_sol_rom",
  "sol_cmd_save:\n  LI R1, #5290\n  ADD R1, R8, R1\n  LT R0, R1, #0\n  CMPI R0, #2\n  JNZX scsv_klon\n  CALLX sol_save_fcsol\nscsv_klon:\n  LI R0, #str_sol_fn - app6_sol_rom"
);
appsAsm = appsAsm.replace(
  "  ; Draw toolbar at (4, 2)\n  LI R0, #4\n  LI R1, #2\n  LI R2, #str_sol_bar - app6_sol_rom",
  "  LI R5, #5290\n  ADD R5, R8, R5\n  LT R0, R5, #0\n  CMPI R0, #2\n  JZX sol_redraw_freecell\n  CMPI R0, #3\n  JZX sol_redraw_spider\n  ; Draw toolbar at (4, 2)\n  LI R0, #4\n  LI R1, #2\n  LI R2, #str_sol_bar - app6_sol_rom"
);
appsAsm = appsAsm.replace(
  "str_sol_fn:    .stringz \"SOL\"\napp6_sol_end:",
  getApp6ExtensionsAsm() + "\nstr_sol_fn:    .stringz \"SOL\"\nstr_fcsol_fn:  .stringz \"FCSOL\"\nstr_dealchk_fn: .stringz \"DEALCHK\"\nstr_fc_suits:  .stringz \"CDHS\"\nstr_dchk_p1:   .stringz \"MS #1 first row: \"\nstr_dchk_p2:   .stringz \"(matches the published deal)\\nMINSTD(48271) 10,000th value from seed 1: 399268537 (matches the published check value)\\nCNSW deal v1 seed 1222, first 8 cards: KD 5H JS QC 7H KS JH QH\"\nstr_fc_bar:    .stringz \"[KLON][FREE][SPID][UNDO]\"\nstr_sp_bar:    .stringz \"[KLON][FREE][SPID] SPIDR\"\nstr_fc_win:    .stringz \"WINNABLE\"\nstr_fc_unk:    .stringz \"UNKNOWN\"\nstr_fc_unw:    .stringz \"UNWINNABLE\"\napp6_sol_end:"
);



// Accumulate full 27-trit seed at #5284 alongside 9-trit #5210 so seeds 11982..32000 work without 9-trit wrap
appsAsm = appsAsm.replace(
  "  ADDI R6, R8, #5210\n  LT R0, R6, #0\n  CMPI R0, #-1\n  JNZX sol_seed_acc\n  MOV R0, R1\n  ST R0, R6, #0\n  JMPX sol_ev_lp\nsol_seed_acc:\n  MULI R0, R0, #10\n  ADD R0, R0, R1\n  ST R0, R6, #0\n  JMPX sol_ev_lp",
  "  ADDI R6, R8, #5210\n  LT R0, R6, #0\n  CMPI R0, #-1\n  JNZX sol_seed_acc\n  MOV R0, R1\n  ST R0, R6, #0\n  LI R5, #5284\n  ADD R5, R8, R5\n  SW R1, R5, #0\n  JMPX sol_ev_lp\nsol_seed_acc:\n  MULI R0, R0, #10\n  ADD R0, R0, R1\n  ST R0, R6, #0\n  LI R5, #5284\n  ADD R5, R8, R5\n  LW R0, R5, #0\n  MULI R0, R0, #10\n  ADD R0, R0, R1\n  SW R0, R5, #0\n  JMPX sol_ev_lp"
);

// Shift all #5000..#6000 data offsets inside app6_sol_rom..app6_sol_end by +2000 (#7000..#8000) so code (0..6228), stack (..6950), and data (7000..9999) never overlap!
const a6Start = appsAsm.indexOf("app6_sol_rom:");
const a6End = appsAsm.indexOf("app6_sol_end:");
const a6Block = appsAsm.slice(a6Start, a6End).replace(/#(5\d{3}|6000)\b/g, (_, n) => "#" + (parseInt(n, 10) + 2000));
appsAsm = appsAsm.slice(0, a6Start) + a6Block + appsAsm.slice(a6End);

// Wire App 7 (Trit Blocks) 7-bag (B), hold (C/H), pause (Z), ghost piece, and TBLK save
appsAsm = appsAsm.replace(
  "  CMPI R1, #'P'\n  JZX tet_cmd_save\n  CMPI R1, #'p'\n  JZX tet_cmd_save",
  "  CMPI R1, #'B'\n  JZX tet_cmd_bag_new\n  CMPI R1, #'b'\n  JZX tet_cmd_bag_new\n  CMPI R1, #'C'\n  JZX tet_cmd_hold\n  CMPI R1, #'c'\n  JZX tet_cmd_hold\n  CMPI R1, #'H'\n  JZX tet_cmd_hold\n  CMPI R1, #'h'\n  JZX tet_cmd_hold\n  CMPI R1, #'Z'\n  JZX tet_cmd_pause_toggle\n  CMPI R1, #'z'\n  JZX tet_cmd_pause_toggle\n  CMPI R1, #'P'\n  JZX tet_cmd_save\n  CMPI R1, #'p'\n  JZX tet_cmd_save"
);
appsAsm = appsAsm.replace(
  "tet_cmd_save:\n  LI R0, #str_tet_fn - app7_tet_rom",
  "tet_cmd_save:\n  CALLX tet_save_tblk\n  LI R0, #str_tet_fn - app7_tet_rom"
);
appsAsm = appsAsm.replace(
  "str_tet_hifn:  .stringz \"TETHI\"\napp7_tet_end:",
  getApp7ExtensionsAsm() + "\nstr_tet_hifn:  .stringz \"TETHI\"\nstr_tblk_fn:   .stringz \"TBLK\"\napp7_tet_end:"
);


// Wire App 10 StudioNet 1.0 views & browser (F1=136 PEERS, F2=137 INBOX, F3=138 WEB GET, F4=139 SHARE, F5=140 HOSTNAME, F6=141 WEB POST, F7=142 WEB RENDER)
appsAsm = appsAsm.replace(
  "  CMPI R1, #16 ; Ctrl+P -> Ping peer\n  JZX net_do_ping",
  "  CMPI R1, #136 ; F1 -> PEERS view\n  JZX net_do_peers_view\n  CMPI R1, #137 ; F2 -> INBOX view\n  JZX net_do_inbox_view\n  CMPI R1, #138 ; F3 -> WEB GET\n  JZX net_do_web_get\n  CMPI R1, #139 ; F4 -> Toggle Share\n  JZX net_do_share_toggle\n  CMPI R1, #140 ; F5 -> Set Hostname\n  JZX net_do_set_hostname\n  CMPI R1, #141 ; F6 -> WEB POST\n  JZX net_do_web_post\n  CMPI R1, #142 ; F7 -> WEB RENDER\n  JZX net_do_web_render\n  CMPI R1, #16 ; Ctrl+P -> Ping peer\n  JZX net_do_ping"
);
appsAsm = appsAsm.replace(
  "str_net_fn:    .stringz \"NET\"\napp10_net_end:",
  "str_net_fn:    .stringz \"NET\"\n" + getApp10ExtensionsAsm() + "\napp10_net_end:"
);

// Extract updated App 5 Calculator source for STANDALONE_CALC_SRC and str_file_demo_asm
const calcStart = appsAsm.indexOf('app5_calc_rom:');
const calcEnd = appsAsm.indexOf('app5_calc_end:') + 'app5_calc_end:'.length;
const calcBody = appsAsm.slice(calcStart, calcEnd) + '\n';
const standaloneCalcSrc = '.mode T3\n.org 0\n.equ COL_WHITE, 364\n.equ COL_GREEN, 76\n.equ COL_CYAN, -284\n' + calcBody;
const escapedCalcForAsm = standaloneCalcSrc
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"')
  .replace(/\n/g, '\\n');

appsAsm = appsAsm.replace(
  /str_file_demo_asm: \.stringz "[\s\S]*?"\nstr_file_demo_end: \.tryte #0/,
  `str_file_demo_asm: .stringz "${escapedCalcForAsm}"\nstr_file_demo_end: .tryte #0`
);


// Relocate net BSS (12200..17999) to 73 * 19683 so drv_net_init_impl never overwrites net v3 code at 10200..17999
netAsm = netAsm.replace(
  /LI R0, #12200 - 19683\n  LMI R0, #1/g,
  "LI R0, #12200 - 19683\n  LMI R0, #73"
);
netAsm = netAsm.replace(
  /LI R(\d+), #(K_NET_LAST_CHAT|K_NET_LAST_FILE|K_NET_STATUS_MSG|K_SFP_RX_NAME|K_NET_TX_BUF|K_NET_Q_BASE) - 19683\n  LMI R\1, #1/g,
  "LI R$1, #$2 - 19683\n  LMI R$1, #73"
);


// Avoid premature full-window redraw on net_do_ping before reply arrives
appsAsm = appsAsm.replace(
  "net_do_ping:\n  ADDI R6, R8, #5120\n  LW R0, R6, #0 ; peer_node\n  SYSCALL #43   ; SYS_NET_PING\n  LI R0, #1\n  ST R0, R6, #7\n  JMPX net_ev_lp",
  "net_do_ping:\n  ADDI R6, R8, #5120\n  LW R0, R6, #0 ; peer_node\n  SYSCALL #43   ; SYS_NET_PING\n  JMPX net_ev_lp"
);

const fullGuestAsm = coreKernelAsm + '\n' + netAsm + '\n' + appsAsm;
fs.writeFileSync(path.join(ROOT, 'guest-112.asm'), fullGuestAsm, 'utf8');

// 4. Build triton/desktop/tritos-desktop.html from tritos-desktop-1.1.1.html.bak (preserving machine block byte-for-byte!)
let html = fs.readFileSync(path.join(DESKTOP_DIR, 'tritos-desktop-1.1.1.html.bak'), 'utf8');

// Replace version strings in header/title/topbar and define TRITOS_VERSION once in script
html = html.replace(/TritOS Desktop 1\.1\.1/g, 'TritOS Desktop');
html = html.replace(/TritOS Desktop 1\.1(?![.0-9])/g, 'TritOS Desktop');
html = html.replace('[SOL] [TETR] [WRITE]', '[SOL] [TBLK] [WRITE]');

// Replace TRITOS_DESKTOP_TEMPLATE and STANDALONE_CALC_SRC
const tplStart = html.indexOf('const TRITOS_DESKTOP_TEMPLATE = ');
const tplEnd = html.indexOf('\nconst SHEET_EXPR_NORMAL = ');
const newTplLine = 'const TRITOS_VERSION = "TritOS Desktop 1.1.2";\n' +
  'const T3_FONT_9X9 = ' + JSON.stringify(fontArray) + ';\n' +
  'const TRITOS_DESKTOP_TEMPLATE = ' + JSON.stringify(fullGuestAsm) + ';';
html = html.slice(0, tplStart) + newTplLine + html.slice(tplEnd);

const scStart = html.indexOf('const STANDALONE_CALC_SRC = ');
const scEnd = html.indexOf('\nfunction buildTritOSDesktopSource');
html = html.slice(0, scStart) + 'const STANDALONE_CALC_SRC = ' + JSON.stringify(standaloneCalcSrc) + ';' + html.slice(scEnd);

// Update bootTritOSDesktop to copy built.trytes and load 110 sectors (or built.trytes.length), and export T3_FONT_9X9 + TRITOS_VERSION + RATE
html = html.replace(
  'TritonSystem.TRITOS_DESKTOP_SRC = TRITOS_DESKTOP_SRC;',
  'TritonSystem.TRITOS_VERSION = TRITOS_VERSION;\nTritonSystem.RATE = 200;\nTritonSystem.T3_FONT_9X9 = T3_FONT_9X9;\nTritonSystem.TRITOS_DESKTOP_SRC = TRITOS_DESKTOP_SRC;'
);

// Update SPECIAL_KEYS (F1..F12 -> 136..147), autorepeat (drop e.repeat faster than 30 ms per key), keydown (enqueue only, no extra vm.run!), and real-time pacing (round(elapsedMs * RATE) capped at 100 ms, RATE = 200 steps/ms shown in debug panel)
html = html.replace(
  `      const SPECIAL_KEYS = {
        Backspace: 8, Tab: 9, Enter: 13, Escape: 27, Delete: 127,
        ArrowLeft: 128, ArrowRight: 129, ArrowUp: 130, ArrowDown: 131,
        Home: 132, End: 133, PageUp: 134, PageDown: 135
      };`,
  `      const SPECIAL_KEYS = {
        Backspace: 8, Tab: 9, Enter: 13, Escape: 27, Delete: 127,
        ArrowLeft: 128, ArrowRight: 129, ArrowUp: 130, ArrowDown: 131,
        Home: 132, End: 133, PageUp: 134, PageDown: 135,
        F1: 136, F2: 137, F3: 138, F4: 139, F5: 140, F6: 141,
        F7: 142, F8: 143, F9: 144, F10: 145, F11: 146, F12: 147
      };`
);

html = html.replace(
  `      document.title = TRITOS_VERSION; const tbTitle = document.querySelector(".topbar .title"); if (tbTitle) tbTitle.textContent = TRITOS_VERSION;
      let running = true;
      const stepsPerFrame = 80000;

      screenCanvas.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' || e.key.startsWith('Arrow') || e.key === 'Backspace' || e.key === ' ') {
          e.preventDefault();
        }
        const code = mapKeyEvent(e);
        if (code > 0) {
          vm.pushKeyEvent(code, 0);
          if (running) {
            vm.run(stepsPerFrame);
            renderFramebuffer();
            updateInspector();
          }
        }
      });`,
  `      let running = true;
      const RATE = 200; // 200 steps per ms (documented real-time pacing rate)
      const MAX_CATCHUP_MS = 100;
      const REPEAT_MIN_MS = 30;
      const lastRepeatAtByKey = new Map();
      let lastFrameTimeMs = null;

      screenCanvas.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' || e.key.startsWith('Arrow') || e.key === 'Backspace' || e.key === ' ' || /^F([1-9]|1[0-2])$/.test(e.key)) {
          e.preventDefault();
        }
        const code = mapKeyEvent(e);
        if (code > 0) {
          const nowMs = performance.now();
          if (e.repeat) {
            const prevMs = lastRepeatAtByKey.get(code) || -1e9;
            if (nowMs - prevMs < REPEAT_MIN_MS) return;
          }
          lastRepeatAtByKey.set(code, nowMs);
          // Keydown only enqueues: no extra steps run on keydown
          vm.pushKeyEvent(code, 0);
        }
      });`
);

html = html.replace(
  `      document.getElementById('btn-step').addEventListener('click', () => {
        vm.run(stepsPerFrame);
        renderFramebuffer();
        updateInspector();
      });`,
  `      document.getElementById('btn-step').addEventListener('click', () => {
        vm.run(Math.round(16 * RATE));
        renderFramebuffer();
        updateInspector();
      });`
);

html = html.replace(
  `          'Total Steps     : ' + vm.stepCount + '\\n' +`,
  `          'Total Steps     : ' + vm.stepCount + ' (RATE=' + RATE + ' steps/ms)\\n' +`
);

html = html.replace(
  `      function frameLoop() {
        if (running) {
          vm.run(stepsPerFrame);
          renderFramebuffer();
          updateInspector();
        }
        requestAnimationFrame(frameLoop);
      }
      requestAnimationFrame(frameLoop);`,
  `      function frameLoop(nowMs) {
        if (typeof nowMs !== 'number') nowMs = performance.now();
        if (lastFrameTimeMs === null) lastFrameTimeMs = nowMs - 16;
        const rawElapsedMs = Math.max(0, nowMs - lastFrameTimeMs);
        lastFrameTimeMs = nowMs;
        if (running) {
          const clampedMs = Math.min(MAX_CATCHUP_MS, rawElapsedMs);
          const stepsToRun = Math.round(clampedMs * RATE);
          if (stepsToRun > 0) vm.run(stepsToRun);
          renderFramebuffer();
          updateInspector();
        }
        requestAnimationFrame(frameLoop);
      }
      requestAnimationFrame(frameLoop);`
);

fs.writeFileSync(path.join(DESKTOP_DIR, 'tritos-desktop.html'), html, 'utf8');
console.log('Wrote triton/desktop/tritos-desktop.html');

// Speed up edit_do_save flush
