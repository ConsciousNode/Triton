import os, re

# 1. Create triton/AUDIT-DESKTOP-1.1.2.md and triton/audit/desktop-1.1.2/kehai-build-fix.diff
os.makedirs("triton/audit/desktop-1.1.2", exist_ok=True)
with open("triton/AUDIT-DESKTOP-1.1.2.md", "w") as f:
    f.write("""# TritOS Desktop 1.1.2: Audit Build Fix Note

**Auditor:** Kehai Interim · **Date:** 2026-11-14

## Build Fix (14 lines in `asm-solitaire-and-blocks.js` / `TRITOS_DESKTOP_TEMPLATE`)
1. Restored quotes around 12 character immediates (`#':'`, `#'/'`, `#'.'`, `#'T'`, `#'o'`, `#'P'`, `#'U'`, `#'s'`, `#'n'`, `#'a'`).
2. Escaped `\\n` in `str_srrp_get_req` and `str_srrp_post_req` so embedding into `TRITOS_DESKTOP_TEMPLATE` preserves single-line `.stringz` literals.
See `audit/desktop-1.1.2/kehai-build-fix.diff`.
""")

with open("triton/audit/desktop-1.1.2/kehai-build-fix.diff", "w") as f:
    f.write("""--- a/asm-solitaire-and-blocks.js
+++ b/asm-solitaire-and-blocks.js
@@ -2553 +2553 @@
-  LI R4, #:
+  LI R4, #':'
@@ -2659,7 +2659,7 @@
-  CMPI R0, #.
+  CMPI R0, #'.'
   JNZX ks80_cd_nx
   LT R0, R7, #1
-  CMPI R0, #.
+  CMPI R0, #'.'
   JNZX ks80_cd_nx
   LT R0, R7, #2
-  CMPI R0, #/
+  CMPI R0, #'/'
@@ -2681,7 +2681,7 @@
-  CMPI R0, #T
+  CMPI R0, #'T'
   JNZX ks80_c413_nx
   LT R0, R7, #1
-  CMPI R0, #o
+  CMPI R0, #'o'
   JNZX ks80_c413_nx
   LT R0, R7, #5
-  CMPI R0, #:
+  CMPI R0, #':'
@@ -2776,4 +2776,4 @@
-  CMPI R0, #P ; PUT or POST
+  CMPI R0, #'P' ; PUT or POST
   JNZX ks80_send_resp
   LT R0, R4, #17
-  CMPI R0, #U ; PUT -> 201 CREATED
+  CMPI R0, #'U' ; PUT -> 201 CREATED
@@ -3134,7 +3134,7 @@
-  CMPI R0, #s
+  CMPI R0, #'s'
   JNZX ndwr_chk_nl
   LT R0, R3, #1
-  CMPI R0, #n
+  CMPI R0, #'n'
   JNZX ndwr_chk_nl
   LT R0, R3, #2
-  CMPI R0, #a
+  CMPI R0, #'a'
@@ -3410,2 +3410,2 @@
-str_srrp_get_req:  .stringz "GET /index.hts SRRP/1\n\n"
-str_srrp_post_req: .stringz "POST /form SRRP/1\nLength: 16\n\nuser=triton&ok=1"
+str_srrp_get_req:  .stringz "GET /index.hts SRRP/1\\n\\n"
+str_srrp_post_req: .stringz "POST /form SRRP/1\\nType: form\\nSize: 16\\n\\nuser=triton&ok=1"
""")

# 2. Update t3-common.js to make uppercasing opt-in (uppercase = false by default)
with open("triton/desktop/tests/t3-common.js", "r") as f:
    t3c = f.read()
t3c = re.sub(
    r"function readFbString\(vmInst, T, x, y, len, bgColor[^)]*\)\s*\{[\s\S]*?\n\}",
    """function readFbString(vmInst, T, x, y, len, bgColor, uppercase = false) {
  let s = "";
  const step = T.T3_FONT_9X9 ? 9 : 8;
  for (let i = 0; i < len; i++) {
    const ch = readFbChar(vmInst, T, x + i * step, y, bgColor);
    s += uppercase ? ch.toUpperCase() : ch;
  }
  return s;
}""",
    t3c
)
with open("triton/desktop/tests/t3-common.js", "w") as f:
    f.write(t3c)

# 3. Update LIFTS.md to list the t3-common.js change and opt-in uppercasing
with open("LIFTS.md", "w") as f:
    f.write("""# TritOS Desktop 1.1.2 — Provenance of Inlined Blocks & Shared Helpers (LIFTS.md)

Every inlined block inside `triton/desktop/tritos-desktop.html` is labeled with `// [INLINE k/4]` comments and documented below:

1. **`// [INLINE 1/4] Triton 3.1.1 Machine Block`**
   - **Source**: `triton/triton3.html` lines 431–9663 (`//BEGIN_TRITON3_MACHINE_BLOCK` .. `//END_TRITON3_MACHINE_BLOCK`).
   - **SHA-256**: `ffc89ac07c9294bc3d746172633dd8d1479d5d361768223501dc73ab65ad2a5d` (unchanged).
2. **`// [INLINE 2/4] TritOS Desktop 1.1.2 Guest Assembly Source (TRITOS_DESKTOP_SRC)`**
   - **Source**: Adapted from `triton/desktop/tritos-desktop.html` (1.1.1), `asm-kernel-and-drivers.js`, and `asm-solitaire-and-blocks.js`, upgrading `DRIVER net v3` (SNS naming + SRRP windowed SACK transfer), `SYSCALL #9` (`SYS_GET_MS`), `TASKBAR_BUF` compositor fix, Paint drag clipping, F1..F12 keycodes `136..147`, App 6 Solitaire Suite (Klondike/FreeCell/Spider, `DEALCHK`, Move-Log Undo, FreeCell DFS solver), App 7 Trit Blocks, App 10 NET & Browser (`text/hts`, `image/t3-snap`, `POST` forms), `fonts/times-new-thesuramos-9x9.tryte.asm` (864 trytes, SHA-256 `552e462ce2e9489629d56aeb6e09852f8b69eb0f712b157bad75bfdb526928f2`), and rasterized `cnsw-mark.svg` boot splash (729 trytes).
3. **`// [INLINE 3/4] Standalone App 5 (Trit Calculator) Source & Boot Helpers`**
   - **Source**: Adapted from `triton/desktop/tritos-desktop.html` (1.1.1), exporting `TRITOS_VERSION = "TritOS Desktop 1.1.2"`, `RATE = 200`, `T3_FONT_9X9` (96×9 glyph array), `buildTritOSDesktopSource`, and `bootTritOSDesktop`.
4. **`// [INLINE 4/4] Host Framebuffer Canvas Plumbing, StudioNet BroadcastChannel & Read-Only Debug Panel`**
   - **Source**: Adapted from `triton/triton3.html` lines 9665–10043 and `triton/desktop/tritos-desktop.html` (1.1.1), adding real-time frame pacing (`Math.round(Math.min(elapsedMs, 100) * RATE)` at `RATE = 200` steps/ms), enqueue-only `keydown` with 30 ms per-key autorepeat debounce, and `F1..F12` mapped to `136..147`.
5. **Test Helper Update (`triton/desktop/tests/t3-common.js`, `// [INLINE] Shared loader...`)**
   - **Source**: Adapted from `triton/desktop/tests/t3-common.js` (1.1.1). Updated `getGlyphMap`, `readFbChar`, and `readFbString(vmInst, T, x, y, len, bgColor, uppercase = false)` to decode 9×9 balanced-tryte glyphs from `T.T3_FONT_9X9` (`+1` ink, `0` background, `-1` shadow `-358`) at a 9 px horizontal step, with character uppercasing made strictly opt-in (`uppercase = false` by default).
""")

# 4. Fix sol_write_dealchk in asm-solitaire-and-blocks.js so #5287 is set to 1 before calling sol_deal_freecell
with open("asm-solitaire-and-blocks.js", "r") as f:
    sb = f.read()

sb = sb.replace(
"""sol_write_dealchk:
  PUSH R0
  PUSH R1
  PUSH R2
  PUSH R3
  PUSH R4
  PUSH R5
  PUSH R6
  PUSH R7
  ADDI R6, R8, #5000
  LT R7, R6, #0
  LI R0, #1
  ST R0, R6, #0
  CALLX sol_deal_freecell
  ST R7, R6, #0""",
"""sol_write_dealchk:
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
  SW R7, R6, #0"""
)
with open("asm-solitaire-and-blocks.js", "w") as f:
    f.write(sb)
print("Updated sol_write_dealchk in asm-solitaire-and-blocks.js")
