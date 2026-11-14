with open("build-all-112.js", "r") as f:
    b = f.read()

# 1. Update t3-common.js replacement in build-all-112.js to use uppercase = false (opt-in uppercasing)
b = b.replace("preserveCase = false", "uppercase = false")
b = b.replace("s += preserveCase ? ch : ch.toUpperCase();", "s += uppercase ? ch.toUpperCase() : ch;")

# 2. In drv_net_init_impl, zero 9700..9799 (100 trytes), zero 72*19683 (256 trytes), init [9784]=P_NID, [9787]=-1, 9740="triton"
old_init = """  LI R0, #9700
  LI R1, #0
  LI R2, #45
  BFILL R0, R1, R2"""
new_init = """  LI R0, #9700
  LI R1, #0
  LI R2, #100
  BFILL R0, R1, R2
  LI R0, #0
  LMI R0, #72
  LI R1, #0
  LI R2, #256
  BFILL R0, R1, R2
  IN R0, #P_NID
  LI R1, #9784
  SW R0, R1, #0
  LI R0, #-1
  LI R1, #9787
  SW R0, R1, #0
  LI R0, #9740
  LI R1, #str_def_triton
  LI R2, #7
  BCOPY R0, R1, R2"""

if "netAsm = netAsm.replace(\n  `  LI R0, #9700" not in b:
    b = b.replace(
        "// Upgrade Echo reply flags",
        f"netAsm = netAsm.replace({repr(old_init)}, {repr(new_init)});\n\n// Upgrade Echo reply flags"
    )

# 3. Replace knrd_proto_sns block in build-all-112.js with full name validation + displayName formatting + drv_net_name_agent_update
old_sns_start = b.index("knrd_proto_sns:")
old_sns_end = b.index("`\n);\n\n// In knrd_sdp_chat")
new_sns_block = """knrd_proto_sns:
  CMPI R2, #53
  JNZX knrd_bad_frame
  CMPI R5, #1
  JNX knrd_bad_frame
  LT R0, R4, #16 ; SNS op (1=HELLO, 2=WHO, 3=BYE)
  CMPI R0, #1
  JZX knrd_sns_hello
  CMPI R0, #2
  JZX knrd_sns_who
  CMPI R0, #3
  JZX knrd_sns_bye
  JMPX knrd_bad_frame

knrd_sns_hello:
  ; Validate HELLO: payload_len (R5) >= 18, name at R4+31 has 1..31 chars in [a-z0-9.-] and NUL at R4+16+R5-1
  CMPI R5, #18
  JNX knrd_bad_frame
  ADDI R1, R4, #31
  LI R2, #0 ; name_len
knrd_sh_val_lp:
  ADD R3, R1, R2
  LT R0, R3, #0
  CMPI R0, #0
  JZX knrd_sh_val_end
  CMPI R2, #31
  JNNX knrd_bad_frame
  ; Valid chars: 'a'..'z' (97..122), '0'..'9' (48..57), '-' (45), '.' (46)
  CMPI R0, #97
  JNX knrd_sh_chk_dig
  CMPI R0, #122
  JNPX knrd_sh_ch_ok
  JMPX knrd_bad_frame
knrd_sh_chk_dig:
  CMPI R0, #48
  JNX knrd_sh_chk_dot
  CMPI R0, #57
  JNPX knrd_sh_ch_ok
  JMPX knrd_bad_frame
knrd_sh_chk_dot:
  CMPI R0, #45
  JZX knrd_sh_ch_ok
  CMPI R0, #46
  JZX knrd_sh_ch_ok
  JMPX knrd_bad_frame
knrd_sh_ch_ok:
  ADDI R2, R2, #1
  JMPX knrd_sh_val_lp
knrd_sh_val_end:
  CMPI R2, #1
  JNX knrd_bad_frame
  ADDI R0, R2, #16 ; 15 header + name_len + 1 NUL
  CMP R0, R5
  JNZX knrd_bad_frame

  ; Check duplicate Node ID clash on HELLO (src_node == local_node_id)
  IN R0, #P_NID
  CMP R6, R0
  JNZX knrd_sh_not_clash
  CALLX knrd_count_valid_rx
  LI R0, #K_NET_CLASH_NODE
  SW R6, R0, #0
  LI R0, #K_NET_STATUS_MSG - 19683
  LMI R0, #73
  LI R3, #str_net_id_clash
  LI R7, #14
  BCOPY R0, R3, R7
  JMPX knrd_process

knrd_sh_not_clash:
  CALLX knrd_count_valid_rx
  ; Store in 8-entry peer table at K_SNS_PEERS (72*19683, 32 trytes/entry)
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
  LT R1, R4, #31 ; first_char of base name
  ST R1, R0, #15
  PUSH R0
  CALL drv_timer_read
  MOV R1, R0
  POP R0
  SW R1, R0, #12 ; +12..14: lastSeen ticks
  ; Format peer displayName at R0 + 16:
  ADDI R1, R0, #16
  LT R2, R4, #30 ; num
  CMPI R2, #0
  JZX knrd_sh_plain_nm
  LT R3, R4, #29 ; named
  CMPI R3, #1
  JZX knrd_sh_named_num
  ; Numbered default: check kind (1="tc", 2="hb", 3="tri")
  LT R3, R4, #17 ; kind
  CMPI R3, #3
  JZX knrd_sh_tri_num
  CMPI R3, #2
  JZX knrd_sh_hb_num
  CMPI R3, #1
  JZX knrd_sh_tc_num
  JMPX knrd_sh_named_num
knrd_sh_tri_num:
  LI R3, #'t'
  ST R3, R1, #0
  LI R3, #'r'
  ST R3, R1, #1
  LI R3, #'i'
  ST R3, R1, #2
  ADDI R3, R2, #48
  ST R3, R1, #3
  LI R3, #0
  ST R3, R1, #4
  JMPX knrd_sh_upd_agent
knrd_sh_hb_num:
  LI R3, #'h'
  ST R3, R1, #0
  LI R3, #'b'
  ST R3, R1, #1
  ADDI R3, R2, #48
  ST R3, R1, #2
  LI R3, #0
  ST R3, R1, #3
  JMPX knrd_sh_upd_agent
knrd_sh_tc_num:
  LI R3, #'t'
  ST R3, R1, #0
  LI R3, #'c'
  ST R3, R1, #1
  ADDI R3, R2, #48
  ST R3, R1, #2
  LI R3, #0
  ST R3, R1, #3
  JMPX knrd_sh_upd_agent
knrd_sh_named_num:
  ADDI R3, R4, #31
knrd_sh_nn_lp:
  LT R7, R3, #0
  CMPI R7, #0
  JZX knrd_sh_nn_app
  ST R7, R1, #0
  ADDI R3, R3, #1
  ADDI R1, R1, #1
  JMPX knrd_sh_nn_lp
knrd_sh_nn_app:
  ADDI R3, R2, #48
  ST R3, R1, #0
  LI R3, #0
  ST R3, R1, #1
  JMPX knrd_sh_upd_agent
knrd_sh_plain_nm:
  ADDI R2, R4, #31
  LI R3, #15
  BCOPY R1, R2, R3
  LI R2, #0
  ST R2, R1, #0
knrd_sh_upd_agent:
  CALLX drv_net_name_agent_update
  CMPI R0, #1
  JNZX knrd_process
  ; Our number changed! Announce new HELLO immediately
  LI R0, #1
  CALLX drv_net_sns_impl
  JMPX knrd_process

knrd_sns_who:
  CALLX knrd_count_valid_rx
  LI R0, #1
  CALLX drv_net_sns_impl
  JMPX knrd_process

knrd_sns_bye:
  CALLX knrd_count_valid_rx
  LI R1, #0
  LMI R1, #72
  LI R2, #0
knrd_sb_lp:
  CMPI R2, #8
  JNNX knrd_sb_done
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
knrd_sb_done:
  CALLX drv_net_name_agent_update
  JMPX knrd_process"""

b = b[:old_sns_start] + new_sns_block + b[old_sns_end:]

# 4. Also remove the premature Node ID clash check on non-HELLO frames so self-loopback or non-HELLO tests aren't affected, or keep it on all frames (it's already in knrd_no_id_clash AND knrd_sh_not_clash!)
# Wait: in knrd_no_id_clash, if src_node == local_node_id, let's also call knrd_count_valid_rx so rxPkts increments!

# 5. Wire F8 (143) -> net_do_sns_announce in App 10
b = b.replace(
    "  CMPI R1, #142 ; F7 -> WEB RENDER\\n  JZX net_do_web_render",
    "  CMPI R1, #142 ; F7 -> WEB RENDER\\n  JZX net_do_web_render\\n  CMPI R1, #143 ; F8 -> SNS ANNOUNCE\\n  JZX net_do_sns_announce"
)

# 6. Expand ; __SHEET_EXPR_PARSER__ in fullGuestAsm so guest-112.asm AND TRITOS_DESKTOP_TEMPLATE assemble directly with 0 errors!
# Let's extract SHEET_EXPR_NORMAL from tritos-desktop-1.1.1.html.bak inside build-all-112.js and replace '; __SHEET_EXPR_PARSER__' with SHEET_EXPR_NORMAL in fullGuestAsm, while updating buildTritOSDesktopSource in html to replace SHEET_EXPR_NORMAL with SHEET_EXPR_FLAT when ignoreSheetPrecedence is true!
old_write_guest = "const fullGuestAsm = coreKernelAsm + '\\n' + netAsm + '\\n' + appsAsm;\nfs.writeFileSync(path.join(ROOT, 'guest-112.asm'), fullGuestAsm, 'utf8');"
new_write_guest = """let htmlBak = fs.readFileSync(path.join(DESKTOP_DIR, 'tritos-desktop-1.1.1.html.bak'), 'utf8');
const seStart = htmlBak.indexOf('const SHEET_EXPR_NORMAL = ');
const seEnd = htmlBak.indexOf('\\nconst SHEET_EXPR_FLAT = ');
const SHEET_EXPR_NORMAL_VAL = eval(htmlBak.slice(seStart + 'const SHEET_EXPR_NORMAL = '.length, seEnd));
const fullGuestAsm = (coreKernelAsm + '\\n' + netAsm + '\\n' + appsAsm).replace('; __SHEET_EXPR_PARSER__', SHEET_EXPR_NORMAL_VAL);
fs.writeFileSync(path.join(ROOT, 'guest-112.asm'), fullGuestAsm, 'utf8');"""
b = b.replace(old_write_guest, new_write_guest)

b = b.replace(
    "const newTplLine = 'const TRITOS_VERSION = \"TritOS Desktop 1.1.2\";\\n' +",
    "html = html.replace(\"s = s.replace('; __SHEET_EXPR_PARSER__', (options.ignoreSheetPrecedence || options.perturbSheetPrec) ? SHEET_EXPR_FLAT : SHEET_EXPR_NORMAL);\", \"if (options.ignoreSheetPrecedence || options.perturbSheetPrec) s = s.replace(SHEET_EXPR_NORMAL, SHEET_EXPR_FLAT);\");\nconst newTplLine = 'const TRITOS_VERSION = \"TritOS Desktop 1.1.2\";\\n' +"
)

# 7. Restore document.title = TRITOS_VERSION in html
b = b.replace(
    "      let running = true;\n      const RATE = 200;",
    "      document.title = TRITOS_VERSION; const tbTitle = document.querySelector(\".topbar .title\"); if (tbTitle) tbTitle.textContent = TRITOS_VERSION;\n      let running = true;\n      const RATE = 200;"
)

with open("build-all-112.js", "w") as f:
    f.write(b)
print("Patched build-all-112.js")
