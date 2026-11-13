# TritOS Desktop 1.1 — Verification & Engineering Report

*Generated automatically by `generate_docs_and_package.js` from live assembled symbol tables and headless test runs.*

## 1. Executive Summary

- **Deliverable**: `desktop/tritos-desktop.html` (529,816 bytes, Xinu single-file architecture, zero external dependencies, offline, strict CSP, `BroadcastChannel('studionet_v1')` only).
- **Machine Core (D0)**: Migrated byte-for-byte onto **Triton 3.1** (`triton3.html` lines 431–9635, SHA-256 `24f32f41406763dbded240397639559ac98d18b15537f8d1fe5bfabe92fa3831`), wrapped in its IIFE and accessed exclusively through `TritonSystem`.
- **Audit Resolution (D1–D2)**:
  - **Zero host reads or writes of guest-private memory (`vm.mem`)** in the host page or in any test (`desktop-01` through `desktop-18`, enforced by `desktop-10-static-scan.js`).
  - **Unmodified Auditor Probe**: `node desktop/audit/calc-no-host-writes.js` passes **100 / 100** (`{"stepsPerExpr":35000,"correct":100,"wrong":0,"otherTasksStillRunning":[1,1,1,0,0,0,0,0]}`).
  - **Real Guest Disk Fill**: `desktop-05-filesystem.js` fills the block disk through the guest Terminal `FILL` command writing 50-sector (`36,450`-tryte) files via `SYS_FS_WRITE` (`SYSCALL #32`) until the file system reaches LBA `2,174 / 2,187`, returns `-1`, and displays `"DISK FULL"` on the MMIO framebuffer.
  - **Self-Hosting**: `desktop-08-selfhost.js` exercises the in-guest Assembler App (`App 4`) rebuilding `App 5: Trit Calculator` from its `4,876`-character source file `DEMO` on disk into `OUT` on disk (**597 trytes**, **0 byte-for-byte differences** vs. host assembler) and launching the rebuilt binary via `SYSCALL #7`.

## 2. Assembled Image & Component Size Table

| Component / Binary Segment | Start Addr (Tryte) | End Addr (Tryte) | Size (Trytes) | Sectors (729 Trytes) |
|---|---:|---:|---:|---:|
| Kernel Core, Compositor, FS & Scheduler | 0 | 5720 | 5720 | 7.85 |
| 8x8 Font & 16-bit XOR/Pow2 Tables | 8940 | 9722 | 782 | 1.07 |
| StudioNet Kernel Driver & SFP Engine | 10200 | 11204 | 1004 | 1.38 |
| App 3: Virtual Clock (`app3_clock_rom`) | 19683 | 19847 | 164 | 0.22 |
| App 5: Trit Calculator (`app5_calc_rom`) | 19847 | 20444 | 597 | 0.82 |
| App 1: Text Editor (`app1_edit_rom`) | 20444 | 20862 | 418 | 0.57 |
| App 2: Pixel Paint (`app2_paint_rom`) | 20862 | 21312 | 450 | 0.62 |
| App 4: Streaming Assembler (`app4_asm_rom`) | 21312 | 23586 | 2274 | 3.12 |
| App 0: Terminal Shell (`app0_term_rom`) | 23586 | 24269 | 683 | 0.94 |
| App 6: Klondike Solitaire (`app6_sol_rom`) | 24269 | 26028 | 1759 | 2.41 |
| App 7: Tetris (`app7_tet_rom`) | 26028 | 27684 | 1656 | 2.27 |
| App 8: Write Word Processor (`app8_write_rom`) | 27684 | 28816 | 1132 | 1.55 |
| App 9: Sheet Spreadsheet (`app9_sheet_rom`) | 28816 | 30892 | 2076 | 2.85 |
| App 10: StudioNet Client (`app10_net_rom`) | 30892 | 31606 | 714 | 0.98 |
| Embedded Self-Host Source (`DEMO`: App 5 Source) | 31606 | 36483 | 4877 | 6.69 |
| **Total Boot Image on Disk (LBA 0..50)** | **0** | **36484** | **36484** | **51** |

## 3. Headless & Browser Test Suite Results (`desktop-run-all.js`)

| Suite | Requirement Covered | Status | Key Measured Metrics |
|---|---|---|---|
| `desktop/audit/calc-no-host-writes.js` | Unmodified auditor probe (100 expressions, no host writes, preemption active) | **PASS** | `correct: 100, wrong: 0, stepsPerExpr: 35000, states: [1,1,1,0,0,0,0,0]` |
| `desktop-01-integrity.js` | D0: Triton 3.1 machine block SHA-256 & IIFE `TritonSystem` export | **PASS** | SHA-256 `24f32f41406763dbded240397639559ac98d18b15537f8d1fe5bfabe92fa3831` |
| `desktop-02-determinism.js` | D0/D1: 2,000-event determinism & JS/WASM lockstep equivalence | **PASS** | `events: 2000, stateHash: 0xa439e533, fbHash: 0x4780e321, lockstepChecks: 6` |
| `desktop-03-preemption.js` | D1/D2: Timer preemption under infinite loop (MMIO & `PS` file check) | **PASS** | `clockDelta: 387973, cursorDeltaX: 15, slices: [25, 12, 6]` |
| `desktop-04-fault-isolation.js` | D1/D2: 4 user faults trapped & isolated (MMIO banner & `KSTAT` file check) | **PASS** | `intact: true, trapCount: 4, causes: [3, 2, 5, 3], banner: "FAULT: TASK KILLED"` |
| `desktop-05-filesystem.js` | D1: Persistence across reboot, delete, export/import, real guest disk fill | **PASS** | `persistedFiles: 4, filesAfterGuestFill: 42, nextFreeLba: 2174, msg: "DISK FULL"` |
| `desktop-06-windowing.js` | D1: Window drag, z-order clipping, damage redraw & border check via MMIO | **PASS** | `vacatedPx: -280, borderPx: 120, overlapPx: -340, clockPx: -320, lastRedrawTrytes: 896` |
| `desktop-07-apps.js` | D1: Clock, Editor, Paint & 100 Calculator expressions via MMIO (5 tasks active) | **PASS** | `editorSaved: "HELLO TRITOS!", paintStrokePx: 364, calcExpressionsVerified: 100` |
| `desktop-08-selfhost.js` | D1: In-guest Assembler rebuilds `App 5: Trit Calculator` from `DEMO` on disk & runs it | **PASS** | `sourceChars: 4876, emittedTrytes: 597, diffs: 0, launchedEvalResult: "1T0"` |
| `desktop-12-klondike.js` | Test 3: Klondike 3 seeds deal, 20 legal & 20 illegal moves, 100-move win on seed 4456 | **PASS** | `seedDiffs: {1:0, 42:0, 4456:0}, midLegal: 20, midIllegal: 20, won: 1, banner: "YOU WIN! SOLITAIRE!"` |
| `desktop-13-tetris.js` | Test 4: Tetris 3 seeds vs ref, line clear, game over, high-score reboot persistence | **PASS** | `seedChecks: 3/3 (0 diffs), clearedLines: 1, overBanner: "GAME OVER", hiAfterReboot: 235` |
| `desktop-14-write.js` | Test 5: Write 2,092-char editing session, cursor/delete/scroll, Save-As & reopen MMIO | **PASS** | `savedFile: "WRTDOC", charCount: 2092, reopenedFirstLineCheck: "LINE 00: TRITOS"` |
| `desktop-15-sheet.js` | Test 6: Sheet 100 random sheets vs JS ref, `#CYCLE!` and `#DIV/0!` on disk & MMIO | **PASS** | `matchedSheets: 100/100, fbCycle: "#CYCLE!", fbDiv0: "#DIV/0!"` |
| `desktop-16-isolation-d3.js` | Test 7: Fault & loop isolation in all 5 D3 apps + 1,000-frame StudioNet flood | **PASS** | `5/5 apps isolated, floodFramesSent: 1000, floodAccepted: 10, floodDropped: 990` |
| `desktop-17-net.js` | Test 8a: Two TritOS desktops (Nodes 3 & 4) Chat MMIO, Ping RTT, 3-sector SFP file, csum | **PASS** | `validFrames: 14/14, lastRttSteps: 69007, rxChatOn4: "HELLO NODE 4", fileDiffs: 0 (2187 trytes)` |
| `desktop-18-spiralos-interop.js` | Test 8b: Unmodified SpiralOS 1.2 (Hummingbird) vs `STUDIONET.md` 12-byte format | **FAIL (Expected Spec Conflict)** | Documented wire-format contradiction (12-byte `STUDIONET.md` vs 16-byte `spiralos/os/net.sp`); left failing per Forbidden rule |
| `desktop-09-positive-controls.js` | Test 9: All 5 D3 positive controls + protection-off & timer-off controls | **PASS** | `perturbCompositor, perturbShuffle, perturbTetrisRot, perturbSheetPrec, perturbNetChecksum: all caught` |
| `desktop-10-static-scan.js` | Test 10a: CSP, offline, 4 inline labels, zero host/test guest-`.mem[` accesses | **PASS** | `inlineBlocksLabeled: 4, testFilesScanned: 20, zeroHostGuestMemAccesses: true` |
| `desktop-11-browser.js` | Test 10b: Real headless Chromium (Selenium), 2 tabs sharing `BroadcastChannel('studionet_v1')` | **PASS** | `tabsOpened: 2, broadcastChannelChatPixelsLit: 125, pageErrors: 0` |

## 4. Documented Specification Conflict (Test 8b: `STUDIONET.md` vs. `spiralos/os/net.sp`)

Per the **Forbidden** section of the specification:
> *"If a requirement can't be met, or conflicts with another, say so in `REPORT.md` and leave it failing. Never change accessors, devices, harnesses, the machine block or anything in `desktop/audit/` to make a check pass."*
> *"spiralos/: SpiralOS 1.2 (`spiralos.img`, `os/net.sp`, `tests/harness.js`, `tabcomp.html`, `hummingbird.html`, `core/`, `themes/`), used only for the interop test. Don't modify it."*

### Exact Technical Contradiction

1. **`STUDIONET.md` and `triton3.html` (`buildStudioNetFrame` / `parseStudioNetFrame` / `computeStudioNetChecksum`)** specify a **12-byte header**:
   - `[0..1]`: `dst_node` (u16 LE)
   - `[2..3]`: `src_node` (u16 LE; Hummingbird is documented as `0x0002`, Triton as `0x0003`)
   - `[4]`: `proto` (`1 = PROTO_ECHO_REQ`, `2 = PROTO_ECHO_REP`, `3 = PROTO_SDP`, `4 = PROTO_SHP`, `5 = PROTO_SFP`)
   - `[5]`: `ttl` (u8)
   - `[6..7]`: `seq` (u16 LE)
   - `[8..9]`: `len` (u16 LE payload byte length, `0..500`)
   - `[10..11]`: `checksum` (u16 LE additive + shifted XOR checksum over bytes `0..9` and payload)
   - `[12..]`: payload (for `PROTO_SDP = 3`, `[dst_port:u16 LE][src_port:u16 LE][data]` with SpiralChat on **port 900**).
2. **Attached unmodified `spiralos/os/net.sp` (lines 4–41) and `spiralos/os/apps1.sp` (line 150)** implement a completely different **16-byte header** with **no checksum field**:
   - `[0..1]`: `dst` (u16 LE)
   - `[2..3]`: `src` (u16 LE; Hummingbird is hardcoded as `0x0201 = 513`, TabComp as `0x0101 = 257`)
   - `[4]`: `proto` (`1 = PROTO_LOOP`, `2 = PROTO_SDP`, `3 = PROTO_SSP`)
   - `[5]`: `flags` (u8)
   - `[6..7]`: `sport` (u16 LE)
   - `[8..9]`: `dport` (u16 LE, hardcoded to **port 4200** for SpiralChat!)
   - `[10..11]`: `seq` (u16 LE)
   - `[12..13]`: `ack` (u16 LE)
   - `[14..15]`: `len` (u16 LE payload length)
   - Furthermore, `spiralos/os/net.sp` has **no Echo Request/Reply handler** (`net_poll` drops any frame with `rx_len < 16`, and the `ping` command in `spiralos/os/apps1.sp:150` simply sends a `PROTO_SDP = 2` chat datagram `"PING from SpiralSh"` to port `4200`).
3. **Observed Failure in `desktop-18-spiralos-interop.js`**:
   - When `desktop-18-spiralos-interop.js` boots Hummingbird with `spiralos.img` via `spiralos/tests/harness.js` and executes `ping`, Hummingbird emits a 35-byte frame whose bytes `[8..9]` contain `dport = 4200` rather than `payload_len`, and bytes `[10..11]` contain `seq = 101` rather than the `STUDIONET.md` checksum.
   - Consequently, `TritonSystem.parseStudioNetFrame(frame)` reads `len = 4200` at bytes `[8..9]` (which does not match `frame.length - 12 = 23`), failing the `STUDIONET.md` byte-for-byte format and checksum check.
   - As instructed, TritOS Desktop 1.1 implements `STUDIONET.md` byte-for-byte (verified in `desktop-17-net.js` across two TritOS desktops and against `TritonSystem.parseStudioNetFrame` / `computeStudioNetChecksum`), leaves `spiralos/` untouched, and leaves `desktop-18-spiralos-interop.js` failing with the exact diagnostic.

## 5. Raw Test Logs

### 5.1 Auditor Probe (`node desktop/audit/calc-no-host-writes.js`)
```json
{"stepsPerExpr":35000,"correct":100,"wrong":0,"otherTasksStillRunning":[1,1,1,0,0,0,0,0]}
```

### 5.2 Full Suite Runner (`node desktop/tests/desktop-run-all.js`)
```text
[PASS] 01-machine-integrity {"name":"01-machine-integrity","status":"PASS","sha256":"24f32f41406763dbded240397639559ac98d18b15537f8d1fe5bfabe92fa3831"}
[PASS] 02-determinism-differential {"name":"02-determinism-differential","status":"PASS","events":2000,"stateHash":"0xa439e533","fbHash":"0x4780e321","lockstepChecks":6}
[PASS] 03-preemption-fairness {"name":"03-preemption-fairness","status":"PASS","clockDelta":387973,"cursorDeltaX":15,"slices":[25,12,6],"stepsPerSlice":2500}
[PASS] 04-fault-isolation {"name":"04-fault-isolation","status":"PASS","csumBefore":3733083251454,"csumAfter":3733083251454,"intact":true,"trapCount":4,"causes":[3,2,5,3],"banner":"FAULT: TASK KILLED"}
[PASS] 05-filesystem {"name":"05-filesystem","status":"PASS","persistedFiles":4,"countAfterDelete":3,"filesAfterGuestFill":42,"nextFreeLbaAfterFill":2174,"diskFullMsg":"DISK FULL","diskBytes":3188646}
[PASS] 06-windowing-damage-redraw {"name":"06-windowing-damage-redraw","status":"PASS","vacatedPx":-280,"borderPx":120,"overlapPx":-340,"clockPx":-320,"lastRedrawTrytes":896,"fullScreenTrytes":354294}
[PASS] 07-apps {"name":"07-apps","status":"PASS","editorSaved":"HELLO TRITOS!","paintStrokePx":364,"calcExpressionsVerified":100}
[PASS] 08-self-hosting {"name":"08-self-hosting","status":"PASS","rebuiltApp":"App 5: Trit Calculator","sourceChars":4876,"emittedTrytes":597,"diffs":0,"launchedEvalResult":"1T0"}
[PASS] 12-klondike-solitaire {"name":"12-klondike-solitaire","status":"PASS","seedDiffs":{"1":0,"42":0,"4456":0},"midLegal":20,"midIllegal":20,"wonFlag":1,"totalMoves":100,"foundations":[13,13,13,13],"winBanner":"YOU WIN! SOLITAIRE!"}
[PASS] 13-tetris {"name":"13-tetris","status":"PASS","seedChecks":{"1":{"scoreMatch":true,"gridDiffs":0,"score":233,"refScore":233},"7":{"scoreMatch":true,"gridDiffs":0,"score":219,"refScore":219},"19":{"scoreMatch":true,"gridDiffs":0,"score":235,"refScore":235}},"clearedLines":1,"clearScore":208,"expectedClearScore":208,"gameOverFlag":1,"overBanner":"GAME OVER","hiBefore":235,"hiAfterReboot":235}
[PASS] 14-write-word-processor {"name":"14-write-word-processor","status":"PASS","savedFile":"WRTDOC","charCount":2092,"reopenedFirstLineCheck":"LINE 00: TRITOS"}
[PASS] 15-sheet-spreadsheet {"name":"15-sheet-spreadsheet","status":"PASS","matchedSheets":100,"totalSheets":100,"errSaved":"A1:=B1+1=#CYCLE!\nB1:=A1+1=#CYCLE!\nA2:=100/0=#DIV/0!","fbCycle":"#CYCLE!","fbDiv0":"#DIV/0!"}
[PASS] 16-isolation-d3-and-net-flood {"name":"16-isolation-d3-and-net-flood","status":"PASS","appIsolation":[{"app":"Klondike","faultBanner":"FAULT: TASK KILLED","clockDeltaUnderLoop":390789,"activeTasksUnderLoop":3},{"app":"Tetris","faultBanner":"FAULT: TASK KILLED","clockDeltaUnderLoop":413984,"activeTasksUnderLoop":3},{"app":"Write","faultBanner":"FAULT: TASK KILLED","clockDeltaUnderLoop":386272,"activeTasksUnderLoop":3},{"app":"Sheet","faultBanner":"FAULT: TASK KILLED","clockDeltaUnderLoop":390240,"activeTasksUnderLoop":3},{"app":"Net","faultBanner":"FAULT: TASK KILLED","clockDeltaUnderLoop":426852,"activeTasksUnderLoop":3}],"floodFramesSent":1000,"floodAccepted":10,"floodDropped":990}
[PASS] 17-studionet-two-node {"name":"17-studionet-two-node","status":"PASS","totalFrames":14,"validFrames":14,"invalidChecksumFrames":0,"pingReplies":1,"lastRttSteps":69007,"rxChatOn4":"HELLO NODE 4","rxChatOn3":"HI NODE 3","receivedFileTrytes":2187,"fileDiffs":0}
[FAIL] ./desktop-18-spiralos-interop.js Specification conflict (left failing per Forbidden rule): STUDIONET.md specifies a 12-byte header ([dst:u16][src:u16][proto:u8][ttl:u8][seq:u16][len:u16][checksum:u16], port 900, PROTO_ECHO_REQ=1/SDP=3), whereas unmodified spiralos/os/net.sp emits a 16-byte header without checksum ([dst:16][src:16][proto:8][flags:8][sport:16][dport:16][seq:16][ack:16][len:16], node 0x0201, port 4200, PROTO_SDP=2): parseStudioNetFrame={"dstNode":257,"srcNode":513,"proto":2,"ttl":4,"seq":4200,"len":4200,"checksum":101,"payload":{"0":0,"1":0,"2":19,"3":0,"4":80,"5":73,"6":78,"7":71,"8":32,"9":102,"10":114,"11":111,"12":109,"13":32,"14":83,"15":112,"16":105,"17":114,"18":97,"19":108,"20":83,"21":104,"22":0}}, frame.length=35, bytes[8..9]=4200 (dport 4200 vs len), bytes[10..11]=101
[PASS] 09-positive-controls {"name":"09-positive-controls","status":"PASS","perturbCompositorCaught":true,"perturbShuffleCaught":true,"perturbTetrisRotCaught":true,"perturbSheetPrecCaught":true,"perturbNetChecksumCaught":true,"protectionOffCorrupted":true,"timerOffFrozen":true}
[PASS] 10-static-scan {"name":"10-static-scan","status":"PASS","inlineBlocksLabeled":4,"testFilesScanned":20,"zeroHostGuestMemAccesses":true}
[PASS] 11-browser {"name":"11-browser","status":"PASS","engine":"selenium","tabsOpened":2,"broadcastChannelChatPixelsLit":125,"pageErrors":0,"screenshot":"tritos-desktop-screenshot.png","dbgPreview":["CORE: WASM ONLY","STATE HASH: 0x4a61251c","STEPS: 6710000  PRIV: SUP"]}
{"summary":{"passed":17,"failed":1,"skipped":0,"total":18}}
```
