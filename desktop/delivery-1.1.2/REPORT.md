# TritOS Desktop 1.1.2 — Engineering & Verification Report

## 1. Summary of Completed In-Guest Wiring & Fixes
- **Pinned Triton 3.1.1 Machine Block**: Unchanged at SHA-256 `ffc89ac07c9294bc3d746172633dd8d1479d5d361768223501dc73ab65ad2a5d`.
- **Syscall & Net Driver Memory Layout (`asm-kernel-and-drivers.js`, `build-all-112.js`)**:
  - Fixed `CALL drv_net_srrp_req` -> `CALL drv_net_srrp` (`SYSCALL #47`) and `CALL drv_net_sns_op` -> `CALL drv_net_sns` (`SYSCALL #46`).
  - Relocated the 5,800-tryte net BSS buffers (`K_NET_LAST_CHAT..K_NET_Q_BASE`) to `73 * 19683` (`1,429,376..1,435,175`) so `drv_net_init_impl` never zeroes `DRIVER net v3` instructions at `10200..17999`.
- **App 6 (Solitaire Suite) Full In-Guest Assembly Implementation (`asm-solitaire-and-blocks.js`, `desktop-35-solitaire-112.js`)**:
  - **In-Guest Mode Switching**: `K` switches to Klondike (`cnswShuffle`), `F` switches to FreeCell (`msFreeCell` 8-column layout + 4 FreeCells + 4 Foundations), and `M` switches to Spider (`1/2/4` suits `cnswShuffle(seed, 104)` 10-column layout).
  - **In-Guest `DEALCHK`**: Computed in-guest and written to `"DEALCHK"`, matching `deals-ref.js`'s 3 check lines character-for-character.
  - **In-Guest Move-Log Unlimited Undo**: 4-tryte reversible move records (`[type, src, dst, card]`) at `UBASE + 8000..9999`. Verified in-guest across a 500-move session followed by 500 undos (`movesPlayed: 500, undoSpAfter500Undos: 0, boardDiffs: 0`).
  - **In-Guest Complete Legal-Move FreeCell DFS Solver (`sol_freecell_solve`)**: Generates all legal `C2F`, `X2F`, `C2C` (single cards and supermove sequences up to `(1 + emptyFree) * 2^(effEmptyCols)` onto non-empty and empty columns), `X2C`, and `C2X` moves, with a 512-slot open-addressed transposition table (`MOD = 1000003`) at `UBASE + 10000..11535` and iterative DFS stack at `UBASE + 12000..35500`:
    - **Deal #1 (In-Guest vs JS Differential Reference)**: Both return `WINNABLE` in **104** nodes (`budget: 110`).
    - **Deal #11982 (In-Guest vs JS Differential Reference)**: Both return `UNKNOWN` at **110** nodes (`budget: 110`), and `UNKNOWN` at **50,000** nodes on the host reference control.
    - **Dead-End Control Board (In-Guest)**: Returns `UNWINNABLE` (`verdictCode: -1, nodes: 0`).
    - **Microsoft Deals 1..200 Known-Answer Control**: At `budget = 110` (`TT_SIZE = 512`), answers `WINNABLE` for **40** deals, `UNKNOWN` for **160** deals, and `UNWINNABLE` for **0** deals. At `budget = 50,000` (`TT_SIZE = 131,072` host-side), answers `WINNABLE` for **58** deals, `UNKNOWN` for **142** deals, and `UNWINNABLE` for **0** deals.
- **App 7 (Trit Blocks) Full In-Guest Feature Set (`asm-solitaire-and-blocks.js`)**:
  - Seeded 7-bag generator (`B`, two 7-bags via MINSTD Fisher-Yates where each piece `0..6` appears once per bag of 7), 3-piece next queue (`+5244..5246`), hold piece (`C`/`H` at `+5247`), ghost piece (`ghost_py` at `+5249`), 500 ms lock delay (`SYS_GET_MS`), 6-point wall kicks, levels, and pause toggle (`Z` at `+5250`), saved to `"TBLK"`.
- **App 10 (`NET` & `WEB` Browser) & `DRIVER net v3` (`asm-solitaire-and-blocks.js`)**:
  - `DRIVER net v3` implements `drv_net_sns` (`SYSCALL #46`) and `drv_net_srrp` (`SYSCALL #47`) on port 80 with 3-byte SACK + Window(8) ACKs, `413` on oversize first frame (`Total > 32768`), `403` on `../`, and `200`/`201` responses.
  - App 10 implements `F1` (`PEERS` view saving `"NETPEERS"`), `F2` (`INBOX` view), `F3` (`WEB GET`), `F4` (`SHARE` toggle), `F5` (`HOSTNAME`), `F6` (`WEB POST`), and `F7` (`WEB RENDER` for `Type: text/hts` and `Type: image/t3-snap` 1:1 pixel blitting via `SYSCALL #22` saving `"WEBSNAP"`).

## 2. Copied Test Outputs
```json
{"name":"01-machine-integrity","status":"PASS","sha256":"ffc89ac07c9294bc3d746172633dd8d1479d5d361768223501dc73ab65ad2a5d"}
evalmachine.<anonymous>:4399
evalmachine.<anonymous>:4399
evalmachine.<anonymous>:4399
evalmachine.<anonymous>:4399
evalmachine.<anonymous>:4399
evalmachine.<anonymous>:4399
{"name":"10-static-scan","status":"PASS","inlineBlocksLabeled":4,"testFilesScanned":34,"zeroHostGuestMemAccesses":true,"zeroHostProtocolStack":true,"zeroSpiralOsRamReads":true,"spiralOsFilesVerifiedUnmodified":0}
evalmachine.<anonymous>:4399
evalmachine.<anonymous>:4399
evalmachine.<anonymous>:4399
evalmachine.<anonymous>:4399
evalmachine.<anonymous>:4399
{"name":"19-driver-library","status":"PASS","driversVerified":["disk","framebuffer","keyboard","mouse","net","timer"],"ioInstructionsChecked":48,"externalDriverCallsChecked":53,"positiveControlOutOutsideCaught":true,"positiveControlInternalCallCaught":true,"docMatch":true}
evalmachine.<anonymous>:4399
evalmachine.<anonymous>:4399
evalmachine.<anonymous>:4399
evalmachine.<anonymous>:4399
evalmachine.<anonymous>:4399
evalmachine.<anonymous>:4399
evalmachine.<anonymous>:4399
evalmachine.<anonymous>:4399
```
