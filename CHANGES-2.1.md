# Triton 2.1 Symbol-Table Patch (`CHANGES-2.1.md`)

**ConsciousNode SoftWorks · Patch Release 2.1 (Assembler-Only Symbol-Table & Error-Handling Patch)**

All numerical figures, memory offsets, line counts, character counts, and test metrics in this document are generated programmatically by `generate_docs_21.py` from `metrics-2.1.json` and source diff analysis.

## 1. Design of the 2.1 Symbol Table & Error Handler

### 1.1 Root Cause of the Four 2.0 Defects

In Triton 2.0 (`symbolMode: "hashOnly"`), the in-OS assembler hashed each identifier into a single 27-trit word via $h \leftarrow (h \cdot 41 + \text{upper}(c)) \bmod_{\text{bal}} 3^{27}$ and stored 4-tryte entries `[hash_w0, hash_w1, hash_w2, val_tryte]` in `STAB`, resolving labels by hash comparison alone. That caused four silent discrepancies against the JavaScript assembler:
1. **Hash collisions**: Any two distinct labels with the same 27-trit hash (such as 2-character pairs `AY` and `B0` where $65 \cdot 41 + 89 = 66 \cdot 41 + 48 = 2754$, or 9-to-12-character identifiers whose base-41 polynomial values differ by a multiple $k \cdot 3^{27}$) silently aliased to the first defined label's address.
2. **Undefined labels**: Referencing an undefined symbol in Pass 2 returned `0` from `a_sl` and silently emitted address `0` instead of reporting an error.
3. **Duplicate labels**: Defining the same label twice took the first definition in-OS and the last definition in JS instead of rejecting the program.
4. **Case sensitivity mismatch**: The in-OS lexer converted identifiers to uppercase via `toupper`, whereas the JS assembler stored mixed-case label strings verbatim.

### 1.2 Triton 2.1 Architecture (`symbolMode: "names"`)

1. **487-Bucket Open-Addressed Hash Table (`STAB`) + Full-Name String Pool (`SPOOL`)**:
   - During token lexing (`a_rt`), each character is converted to uppercase (`toupper`), appended to the null-terminated active token buffer `TBUF` (`Mem[3200..3259]`), and folded into the 27-trit rolling hash `R4` ($h \leftarrow (h \cdot 41 + \text{upper}(c)) \bmod_{\text{bal}} 3^{27}$).
   - `STAB` (`Mem[3260..5694]`) is organized as a **487-slot open-addressed hash table** with **5 trytes per slot**:
     - `slot + 0..2` (3 trytes, 1 word): 27-trit hash key `H` (`SW R4, R2, #0`).
     - `slot + 3` (1 tryte): 9-trit symbol value (`val_tryte`, label address or `.equ` constant).
     - `slot + 4` (1 tryte): 9-trit pointer `name_ptr` into the string pool `SPOOL` (`Mem[9500..18999]`), or `0` if the slot is empty.
   - On lookup (`a_sl`), the starting bucket index is computed in balanced ternary as $b = ((H \bmod 487) + 487) \bmod 487 \in [0, 486]$, mapping to slot address $\text{STAB} + 5 b$.
   - The probe loop (`asm_sl_lp`) inspects `name_ptr` at `slot + 4`:
     - If `name_ptr == 0`, the slot is empty: the symbol is **not found** (`SF = -1`), and the empty slot address is saved in `Mem[3196]` for $O(1)$ insertion by `a_sd`.
     - If `name_ptr != 0`, the 27-trit hash at `slot + 0..2` is compared against `R4` (`LW R5, R1, #0; CMP R4, R5`). Only when the 27-trit hash matches does `asm_sl_cmp` compare the null-terminated uppercase string at `TBUF` (`Mem[3200..]`) against `SPOOL[name_ptr]` character-by-character through the terminating `0` tryte.
     - If any character differs (a hash collision), linear probing advances by `+5` trytes (wrapping from `5695` to `3260`) until either the exact full name matches (`SF = 0`) or an empty slot is reached (`SF = -1`).
2. **Unified Case Rule**:
   - Both the JS assembler (`assembler.js`) and the in-OS assembler (`TRITOS_SRC`) canonicalize all label definitions, `.equ` symbols, and symbol references to ASCII uppercase.
3. **Line-Numbered Duplicate and Undefined Label Errors with Zero Output Image**:
   - The in-OS assembler tracks the 1-based line number in `LNUM` (`Mem[3194]`), initialized to `1` at the start of each pass (`a_rp`) and incremented by `+1` whenever `a_nl` consumes a newline (`\n`, ASCII `10`).
   - **Duplicate Labels (`a_err_dup`)**: Before inserting a symbol in Pass 1 (`a_sd`), `CALL a_sl` checks whether the symbol already exists. If found (`JZ a_err_dup`), the in-OS assembler sets `EFLG = 1` (`Mem[3195]`), prints `REJECTS: Line <LNUM>: Duplicate label <TBUF>\n` to the shell (`Port 0`), zeroes `OBUF` and `OLEN` (`Mem[3198] = 0`), and aborts before Pass 2.
   - **Undefined Labels (`a_err_undef`)**: When `asm_et_sym` evaluates a symbol in Pass 2 and `CALL a_sl` reports not found (`JNZ asm_et_und`), it sets `EFLG = 2`, prints `REJECTS: Line <LNUM>: Undefined label <TBUF>\n` to `Port 0`, zeroes all trytes written so far in `OBUF[0..OLEN]`, sets `OLEN = 0`, and disables further emission in `a_em`.
4. **Positive Control (`symbolMode: "hashOnly" | "names"`)**:
   - `TritonSystem.setSymbolMode("names" | "hashOnly")` switches between `TRITOS_SRC_NAMES` (2.1 default) and `TRITOS_SRC_HASHONLY` (exact 2.0 in-OS assembler source).

## 2. Memory Layout in TritOS 2.1

| Region / Symbol | Tryte Address Range | Size (Trytes) | Role in TritOS 2.1 |
| :--- | :--- | :--- | :--- |
| **Kernel, Shell, Apps & `ASM` Code** | `0 .. 3056` | `3057` | Assembled TritOS 2.1 image (`boot_reset` through `mnem_table`) |
| **`LBUF`** | `3100 .. 3169` | `70` | Interactive shell command line buffer |
| **`SBUF`** | `3170 .. 3192` | `23` | Decimal (`pdec`) and balanced-ternary (`ptern`) digit formatting scratch buffer |
| **`SPOOL_P`** | `3193` | `1` | Next free tryte pointer in `SPOOL` (initialized to `9500`) |
| **`LNUM`** | `3194` | `1` | Current 1-based source line number during assembly |
| **`EFLG`** | `3195` | `1` | Assembler error flag (`0` = OK, `1` = Duplicate label, `2` = Undefined label) |
| **`SYMC`** | `3196` | `1` | Probed `STAB` slot pointer returned by `a_sl` for `a_sd` (or symbol count in `hashOnly`) |
| **`PASS`** | `3197` | `1` | Active assembler pass (`1` or `2`) |
| **`OLEN`** | `3198` | `1` | Emitted machine-code length in trytes (`0` when `EFLG != 0`) |
| **`TBUF`** | `3200 .. 3259` | `60` | Null-terminated uppercase token string buffer populated by `a_rt` |
| **`STAB`** | `3260 .. 5694` | `2435` | 487-slot open-addressed symbol table (`5` trytes/slot: `[hash_w0, hash_w1, hash_w2, val, name_ptr]`) |
| **`OBUF`** | `6000 .. 9499` | `3500` | Assembled output image buffer |
| **`SPOOL`** | `9500 .. 18999` | `9500` | Null-terminated uppercase label name string pool |
| **System Stack (`SP`)** | `19000 .. 19682` (`-683 .. -1`) | `683` | Downward-growing subroutine call and register stack (`SP` initialized to `-1`) |
| **Disk Source Buffer (`SADR`)** | `Disk[500 .. 19682]` | `19183` | Persistent disk region holding assembly source text (max `19,182` chars + null) |

## 3. Before / After Source Size & Self-Hosting Budget

The in-OS assembler reads source text from `Disk[500..19682]`, which caps source length at **19,182 characters** (plus 1 null-terminator tryte at `Disk[19682]`).

| Metric | Triton 2.0 (`hashOnly`) | Triton 2.1 (`names`) | Delta (2.1 vs. 2.0) | Cap / Limit | Remaining Headroom |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`TRITOS_SRC` Length (chars)** | `16,774` | `18,608` | `+1,834` chars | `19,182` chars | **`574` chars** |
| **`TRITOS_SRC` Line Count** | `1,172` | `1,306` | `+134` lines | — | — |
| **Assembled Image Size (trytes)** | `2,752` | `3,057` | `+305` trytes | `3,100` trytes (`LBUF`) | **`43` trytes** |
| **`triton.html` Total Size (bytes)** | `140,039` | `159,352` | `+19,313` bytes | Single-file HTML | — |

The entire 2.1 symbol-table and error-reporting patch fits within the `19,182`-character `Disk[500..]` budget with **`574` characters of headroom** remaining, without removing or trimming any existing TritOS 2.0 feature, command, or string.

## 4. Exact Lines Changed (2.0 vs. 2.1)

### 4.1 Summary of Changed Hunks in `TRITOS_SRC` (38 hunks across 1172 $\to$ 1306 lines)

| Hunk # | Change Kind | Triton 2.0 (`TRITOS_SRC_HASHONLY`) | Triton 2.1 (`TRITOS_SRC_NAMES`) | First Line Preview |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `replace` | Lines 10–11 (2 lines) | Lines 10–15 (6 lines) | `.equ LBUF,3100` |
| 2 | `replace` | Lines 15–15 (1 lines) | Lines 19–19 (1 lines) | `.equ STAB,3260` |
| 3 | `insert` | Lines (after 17) (0 lines) | Lines 22–22 (1 lines) | `.equ SPOOL,9500` |
| 4 | `insert` | Lines (after 533) (0 lines) | Lines 539–541 (3 lines) | `LI R1,#EFLG` |
| 5 | `delete` | Lines 543–544 (2 lines) | Lines (after 550) (0 lines) | `LI R1,#SYMC` |
| 6 | `insert` | Lines (after 545) (0 lines) | Lines 552–561 (10 lines) | `ST R0,R1,#0` |
| 7 | `insert` | Lines (after 550) (0 lines) | Lines 567–569 (3 lines) | `LI R1,#EFLG` |
| 8 | `replace` | Lines 555–555 (1 lines) | Lines 574–574 (1 lines) | `a_ent_ret: RET` |
| 9 | `replace` | Lines 558–558 (1 lines) | Lines 577–583 (7 lines) | `LI R0,#1` |
| 10 | `insert` | Lines (after 578) (0 lines) | Lines 604–607 (4 lines) | `LI R1,#LNUM` |
| 11 | `replace` | Lines 580–580 (1 lines) | Lines 609–612 (4 lines) | `a_se: LI R1,#EFLG` |
| 12 | `replace` | Lines 586–586 (1 lines) | Lines 618–618 (1 lines) | `JMP a_se_lp` |
| 13 | `replace` | Lines 698–698 (1 lines) | Lines 730–736 (7 lines) | `LI R1,#PASS` |
| 14 | `replace` | Lines 701–707 (7 lines) | Lines 739–743 (5 lines) | `POP R2` |
| 15 | `insert` | Lines (after 794) (0 lines) | Lines 831–833 (3 lines) | `LI R1,#EFLG` |
| 16 | `replace` | Lines 800–800 (1 lines) | Lines 839–839 (1 lines) | `a_em_sk: POP R1` |
| 17 | `replace` | Lines 836–836 (1 lines) | Lines 875–879 (5 lines) | `a_rt: PUSH R1` |
| 18 | `insert` | Lines (after 837) (0 lines) | Lines 881–881 (1 lines) | `LI R1,#TBUF` |
| 19 | `insert` | Lines (after 859) (0 lines) | Lines 904–905 (2 lines) | `ST R0,R1,#0` |
| 20 | `replace` | Lines 864–864 (1 lines) | Lines 910–913 (4 lines) | `asm_rt_done: LI R0,#0` |
| 21 | `replace` | Lines 890–891 (2 lines) | Lines 939–945 (7 lines) | `a_sd: CALL a_sl` |
| 22 | `delete` | Lines 894–897 (4 lines) | Lines (after 947) (0 lines) | `ADDI R0,R2,#1` |
| 23 | `replace` | Lines 900–900 (1 lines) | Lines 950–961 (12 lines) | `ST R8,R2,#4` |
| 24 | `insert` | Lines (after 904) (0 lines) | Lines 966–966 (1 lines) | `PUSH R3` |
| 25 | `replace` | Lines 906–909 (4 lines) | Lines 968–977 (10 lines) | `PUSH R8` |
| 26 | `insert` | Lines (after 912) (0 lines) | Lines 981–987 (7 lines) | `JNZ asm_sl_nx` |
| 27 | `replace` | Lines 914–915 (2 lines) | Lines 989–995 (7 lines) | `ADDI R3,R3,#1` |
| 28 | `replace` | Lines 917–917 (1 lines) | Lines 997–1000 (4 lines) | `asm_sl_found: LI R2,#SYMC` |
| 29 | `insert` | Lines (after 918) (0 lines) | Lines 1002–1002 (1 lines) | `POP R3` |
| 30 | `replace` | Lines 921–922 (2 lines) | Lines 1005–1010 (6 lines) | `CMP R0,R0` |
| 31 | `insert` | Lines (after 923) (0 lines) | Lines 1012–1012 (1 lines) | `POP R3` |
| 32 | `insert` | Lines (after 925) (0 lines) | Lines 1015–1051 (37 lines) | `CMPI R0,#1` |
| 33 | `replace` | Lines 1031–1031 (1 lines) | Lines 1157–1158 (2 lines) | `asm_et_sym: CALL a_rt` |
| 34 | `delete` | Lines 1035–1035 (1 lines) | Lines (after 1161) (0 lines) | `CALL a_rt` |
| 35 | `insert` | Lines (after 1036) (0 lines) | Lines 1163–1163 (1 lines) | `JNZ asm_et_und` |
| 36 | `replace` | Lines 1039–1039 (1 lines) | Lines 1166–1168 (3 lines) | `asm_et_und: PUSH R2` |
| 37 | `insert` | Lines (after 1040) (0 lines) | Lines 1170–1171 (2 lines) | `RET` |
| 38 | `insert` | Lines (after 1055) (0 lines) | Lines 1187–1189 (3 lines) | `str_err_pfx: .stringz "REJECTS: Line "` |

### 4.2 Unified Diff of `TRITOS_SRC` (2.0 vs. 2.1)

```diff
--- TRITOS_SRC (2.0)
+++ TRITOS_SRC (2.1)
@@ -9,4 +9,8 @@
 .equ P_DD,8
-.equ LBUF,3000
-.equ SBUF,3120
+.equ LBUF,3100
+.equ SBUF,3170
+.equ TBUF,3200
+.equ SPOOL_P,3193
+.equ LNUM,3194
+.equ EFLG,3195
 .equ SYMC,3196
@@ -14,5 +18,6 @@
 .equ OLEN,3198
-.equ STAB,3200
+.equ STAB,3260
 .equ SADR,500
 .equ OBUF,6000
+.equ SPOOL,9500
 .org 0
@@ -533,2 +538,5 @@
 cmd_asm: CALL a_ent
+LI R1,#EFLG
+LT R0,R1,#0
+JNZ shell_loop
 LI R1,#str_asm_ok
@@ -542,5 +550,13 @@
 a_ent: LI R0,#0
-LI R1,#SYMC
-ST R0,R1,#0
 LI R1,#OLEN
+ST R0,R1,#0
+LI R1,#EFLG
+ST R0,R1,#0
+LI R1,#3264
+a_clr_st: ST R0,R1,#0
+ADDI R1,R1,#5
+CMPI R1,#5699
+JN a_clr_st
+LI R0,#SPOOL
+LI R1,#SPOOL_P
 ST R0,R1,#0
@@ -550,2 +566,5 @@
 CALL a_rp
+LI R1,#EFLG
+LT R0,R1,#0
+JNZ a_ent_ret
 LI R0,#2
@@ -554,6 +573,12 @@
 CALL a_rp
-RET
+a_ent_ret: RET
 a_rp: LI R6,#SADR
 LI R7,#0
-a_ll: CALL a_sh
+LI R0,#1
+LI R1,#LNUM
+ST R0,R1,#0
+a_ll: LI R1,#EFLG
+LT R0,R1,#0
+JNZ a_pd
+CALL a_sh
 CALL src_peek
@@ -578,4 +603,11 @@
 a_nl: ADDI R6,R6,#1
+LI R1,#LNUM
+LT R0,R1,#0
+ADDI R0,R0,#1
+ST R0,R1,#0
 JMP a_ll
-a_se: CALL src_peek
+a_se: LI R1,#EFLG
+LT R0,R1,#0
+JNZ a_pd
+a_se_lp: CALL src_peek
 CMPI R0,#0
@@ -585,3 +617,3 @@
 ADDI R6,R6,#1
-JMP a_se
+JMP a_se_lp
 a_pd: RET
@@ -697,12 +729,16 @@
 CALL a_rt
-PUSH R4
+LI R1,#PASS
+LT R0,R1,#0
+CMPI R0,#1
+JNZ ade_p2
+LI R5,#0
+CALL a_sd
+PUSH R2
 CALL a_sc
 CALL a_eo
-MOV R5,R0
-POP R4
-LI R1,#PASS
-LT R0,R1,#0
-CMPI R0,#1
-JNZ a_se
-CALL a_sd
+POP R2
+ST R0,R2,#3
+JMP a_se
+ade_p2: CALL a_sc
+CALL a_eo
 JMP a_se
@@ -794,2 +830,5 @@
 a_em: PUSH R1
+LI R1,#EFLG
+LT R1,R1,#0
+JNZ a_em_sk
 LI R1,#OBUF
@@ -799,3 +838,3 @@
 CALL a_um
-POP R1
+a_em_sk: POP R1
 RET
@@ -835,4 +874,9 @@
 RET
-a_rt: CALL a_sh
+a_rt: PUSH R1
+LI R1,#EFLG
+LT R0,R1,#0
+JNZ a_rt_sk
+CALL a_sh
 LI R4,#0
+LI R1,#TBUF
 asm_rt_lp: CALL src_peek
@@ -859,2 +903,4 @@
 CALL toupper
+ST R0,R1,#0
+ADDI R1,R1,#1
 MULI R4,R4,#41
@@ -863,3 +909,6 @@
 JMP asm_rt_lp
-asm_rt_done: RET
+asm_rt_done: LI R0,#0
+ST R0,R1,#0
+a_rt_sk: POP R1
+RET
 a_pr: CALL a_sh
@@ -889,13 +938,25 @@
 RET
-a_sd: PUSH R1
-PUSH R2
+a_sd: CALL a_sl
+JZ a_err_dup
+PUSH R1
+PUSH R3
+PUSH R8
+LI R1,#SPOOL_P
+LT R8,R1,#0
 LI R1,#SYMC
 LT R2,R1,#0
-ADDI R0,R2,#1
-ST R0,R1,#0
-MULI R2,R2,#4
-ADDI R2,R2,#STAB
 SW R4,R2,#0
 ST R5,R2,#3
-POP R2
+ST R8,R2,#4
+LI R3,#TBUF
+a_sd_cp: LT R0,R3,#0
+ST R0,R8,#0
+ADDI R3,R3,#1
+ADDI R8,R8,#1
+CMPI R0,#0
+JNZ a_sd_cp
+LI R1,#SPOOL_P
+ST R8,R1,#0
+POP R8
+POP R3
 POP R1
@@ -904,7 +965,14 @@
 PUSH R2
+PUSH R3
 PUSH R5
-LI R1,#SYMC
-LT R2,R1,#0
-LI R1,#STAB
-asm_sl_lp: CMPI R2,#0
+PUSH R8
+LI R2,#487
+MOD R1,R4,R2
+CMPI R1,#0
+JNN a_sl_pos
+ADDI R1,R1,#487
+a_sl_pos: MULI R1,R1,#5
+ADDI R1,R1,#STAB
+asm_sl_lp: LT R8,R1,#4
+CMPI R8,#0
 JZ asm_sl_nf
@@ -912,15 +980,73 @@
 CMP R4,R5
+JNZ asm_sl_nx
+LI R3,#TBUF
+asm_sl_cmp: LT R0,R3,#0
+LT R5,R8,#0
+CMP R0,R5
+JNZ asm_sl_nx
+CMPI R0,#0
 JZ asm_sl_found
-ADDI R1,R1,#4
-SUBI R2,R2,#1
+ADDI R3,R3,#1
+ADDI R8,R8,#1
+JMP asm_sl_cmp
+asm_sl_nx: ADDI R1,R1,#5
+CMPI R1,#5695
+JN asm_sl_lp
+LI R1,#STAB
 JMP asm_sl_lp
-asm_sl_found: LT R0,R1,#3
+asm_sl_found: LI R2,#SYMC
+ST R1,R2,#0
+LT R0,R1,#3
+POP R8
 POP R5
+POP R3
 POP R2
 POP R1
-RET
-asm_sl_nf: LI R0,#0
+CMP R0,R0
+RET
+asm_sl_nf: LI R2,#SYMC
+ST R1,R2,#0
+LI R0,#0
+POP R8
 POP R5
+POP R3
 POP R2
 POP R1
+CMPI R0,#1
+RET
+a_err_dup: LI R2,#str_err_dup
+LI R0,#1
+JMP a_err_com
+a_err_undef: LI R2,#str_err_und
+LI R0,#2
+a_err_com: PUSH R1
+PUSH R3
+LI R1,#EFLG
+LT R3,R1,#0
+JNZ a_err_done
+ST R0,R1,#0
+LI R1,#str_err_pfx
+CALL puts
+LI R1,#LNUM
+LT R0,R1,#0
+CALL pdec
+MOV R1,R2
+CALL puts
+LI R1,#TBUF
+CALL puts
+CALL put_nl
+LI R1,#OLEN
+LT R3,R1,#0
+LI R0,#0
+ST R0,R1,#0
+LI R1,#OBUF
+a_err_clr: CMPI R3,#0
+JZ a_err_done
+ST R0,R1,#0
+ADDI R1,R1,#1
+SUBI R3,R3,#1
+JMP a_err_clr
+a_err_done: POP R3
+POP R1
+LI R2,#SBUF
 RET
@@ -1030,3 +1156,4 @@
 RET
-asm_et_sym: LI R1,#PASS
+asm_et_sym: CALL a_rt
+LI R1,#PASS
 LT R0,R1,#0
@@ -1034,8 +1161,12 @@
 JZ asm_et_sym_p1
-CALL a_rt
 CALL a_sl
+JNZ asm_et_und
 MUL R0,R0,R3
 RET
-asm_et_sym_p1: CALL a_rt
+asm_et_und: PUSH R2
+CALL a_err_undef
+POP R2
 LI R0,#0
+RET
+asm_et_sym_p1: LI R0,#0
 RET
@@ -1055,2 +1186,5 @@
 str_asm_ok: .stringz "ASM OK: "
+str_err_pfx: .stringz "REJECTS: Line "
+str_err_dup: .stringz ": Duplicate label "
+str_err_und: .stringz ": Undefined label "
 str_help: .stringz "CMDS: LIST, TYPE <F>, SAVE <F> <TXT>, EDIT <F> <TXT>, RUN <P>, CALC, DRAW, GAME, ASM, REBOOT\n"
```

### 4.3 Summary of Changes in `ISA.md` and `triton.html`

- **`ISA.md`** (Lines `220–247`, `235` $\to$ `247` lines): Updated Section 9 EBNF grammar comments to state the case-insensitivity rule for identifiers and mnemonics, and added Section 9.1 documenting full-name symbol resolution (`STAB` + `SPOOL` + `TBUF`) and error reporting (`Line <N>: Duplicate label <NAME>` and `Line <N>: Undefined label <NAME>` with zero output image written on error).
- **`triton.html`** (`4336` $\to$ `5588` lines across `22` diff hunks): Updated `[INLINE 5/7]` (JS assembler case normalization and line-numbered duplicate/undefined label errors), `[INLINE 6/7]` (`TRITOS_SRC_NAMES`, `TRITOS_SRC_HASHONLY`, and `setSymbolMode`), and `[INLINE 4/7]` (`TritonWASM.createSync` module caching and `getMem`/`getConsoleOut` error-line surfacing). The ISA, VM instruction semantics, and opcode encodings are unchanged.
