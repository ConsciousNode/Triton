# TritOS 1.1.2 Hardware Driver Library (`DRIVERS.md`)

**Studio:** ConsciousNode SoftWorks · **Licence:** MIT · **Target Architecture:** Triton 3.1 (`T3` Supervisor Mode)

This document specifies the six self-contained guest assembly hardware drivers shipped in `desktop/tritos-desktop.html`. Each driver is packaged as a single contiguous assembly block delimited by `; ==== DRIVER <name> v<n> ====` and `; ==== END DRIVER <name> ====`, beginning with a fixed jump-table **entry table**. Any operating system targeting the Triton 3.1 virtual machine can copy a driver block into supervisor memory, wire its IRQ entry into the `VBR` trap table (`SPR 5`), and invoke the driver exclusively through its entry table.

---

## Summary Table

| Driver | Version | IRQ Vector | Ports Used | Owned Kernel Memory Ranges | Entry Table Labels |
|---|---|---|---|---|---|
| `disk` | `v1` | `10` | `P_DA` (7), `P_DD` (8), `P_DLBA` (17), `P_DDMA` (18), `P_DCNT` (19), `P_DCMD` (20), `P_DERR` (21) | `5875..5877` | `drv_disk_boot`, `drv_disk_irq`, `drv_disk_read`, `drv_disk_write`, `drv_disk_write_tryte` |
| `timer` | `v1` | `7` | `P_TM` (6), `P_TP` (9) | `5866..5868` | `drv_timer_init`, `drv_timer_irq`, `drv_timer_read` |
| `keyboard` | `v1` | `8` | `P_KC` (10), `P_KD` (11), `P_KT` (12) | `5869..5871` | `drv_kbd_init`, `drv_kbd_irq`, `drv_kbd_poll` |
| `mouse` | `v1` | `9` | `P_MC` (13), `P_MX` (14), `P_MY` (15), `P_MB` (16) | `5872..5874`, `5878..5879`, `8910..8911` | `drv_mouse_init`, `drv_mouse_irq`, `drv_mouse_poll` |
| `framebuffer` | `v1` | `None` | `P_DC` (5) | `7900..8628`, `8912..8928`, `15000000..15354293` | `drv_fb_init`, `drv_fb_redraw_rect`, `drv_fb_draw_char`, `drv_fb_draw_taskbar` |
| `net` | `v3` | `11` | `P_NST` (22), `P_NID` (23), `P_NTX` (24), `P_NRX` (25), `P_NTF` (26), `P_NRF` (27) | `9700..9799`, `59049..65000`, `1417176..1456541` | `drv_net_init`, `drv_net_irq`, `drv_net_poll`, `drv_net_get_id`, `drv_net_send`, `drv_net_ping`, `drv_net_send_file`, `drv_net_status`, `drv_net_sns`, `drv_net_srrp` |

---

## 1. Driver: `disk` (`v1`)

- **Markers:** `; ==== DRIVER disk v1 ====` … `; ==== END DRIVER disk ====`
- **Ports:** `P_DA` (7), `P_DD` (8), `P_DLBA` (17), `P_DDMA` (18), `P_DCNT` (19), `P_DCMD` (20), `P_DERR` (21)
- **Memory:** `5875..5877` (`K_DISK_IRQS`, 3-tryte word counting completed disk DMA interrupts)
- **IRQ Vector:** `10` (`IRQ_DISK`, mask bit 3 = `8` in `SPR_IMASK`)

### Entry Table

| Offset | Entry Label | Registers In | Registers Out | Preserved Registers | Description |
|---|---|---|---|---|---|
| `+0` | `drv_disk_boot` | None (invoked at reset `PC = 0` or `Vec 0`) | Jumps to `kernel_boot_entry` with `R0 = 1` | N/A (boot reset) | Programs DMA registers (`P_DLBA = 0`, `P_DDMA = 0`, `P_DCNT = 75`, `P_DCMD = 1`) to load the 75-sector kernel & app image (`54,675` trytes) into RAM at `0..54674`, then jumps to `kernel_boot_entry`. |
| `+2` | `drv_disk_irq` | None (hardware trap entry for Vector `10`) | Returns via `IRET` | `R0..R8` | Increments the 3-tryte `K_DISK_IRQS` counter at `5875..5877` and returns from interrupt via `IRET`. |
| `+4` | `drv_disk_read` | `R0` = start LBA (`0..2186`), `R1` = destination RAM DMA address, `R2` = sector count (`>= 1`, `729` trytes/sector) | `R0` = `0` on success, or negative error code (`-1`..`-3`) | `R1..R8` | Executes a synchronous hardware DMA read (`P_DCMD = 1`) of `R2` sectors starting at LBA `R0` into RAM at `R1`. |
| `+6` | `drv_disk_write` | `R0` = start LBA (`0..2186`), `R1` = source RAM DMA address, `R2` = sector count (`>= 1`, `729` trytes/sector) | `R0` = `0` on success, or negative error code (`-1`..`-3`) | `R1..R8` | Executes a synchronous hardware DMA write (`P_DCMD = 2`) of `R2` sectors from RAM at `R1` to LBA `R0`. |
| `+8` | `drv_disk_write_tryte` | `R0` = linear disk tryte offset (`0..1594322`), `R1` = tryte value (`-9841..+9841`) | `R0` = `0` | `R1..R8` | Writes a single tryte `R1` to linear disk offset `R0` using legacy PIO ports `P_DA` (7) and `P_DD` (8) (used for NUL-terminating files after sector DMA writes). |

### Error Behavior

After issuing a DMA command (`1` or `2`) on `P_DCMD` (Port 20), `drv_disk_read` and `drv_disk_write` inspect the status returned by `IN R0, #P_DCMD`. If status is not `1` (`OK`), the driver reads the hardware error code from `P_DERR` (Port 21: `1 = ERR_BAD_SECTOR`, `2 = ERR_BAD_DMA_ADDR`, `3 = ERR_BAD_CMD`), negates it into `R0` (`-1`, `-2`, or `-3`), and returns without faulting the kernel.

---

## 2. Driver: `timer` (`v1`)

- **Markers:** `; ==== DRIVER timer v1 ====` … `; ==== END DRIVER timer ====`
- **Ports:** `P_TM` (6), `P_TP` (9)
- **Memory:** `5866..5868` (`K_TIMER_IRQS`, 3-tryte word counting timer interrupts)
- **IRQ Vector:** `7` (`IRQ_TIMER`, mask bit 0 = `1` in `SPR_IMASK`)

### Entry Table

| Offset | Entry Label | Registers In | Registers Out | Preserved Registers | Description |
|---|---|---|---|---|---|
| `+0` | `drv_timer_init` | `R0` = timer period in virtual steps (`> 0` enables periodic IRQ; `<= 0` disables) | `R0` = `0` | `R1..R8` | Writes `R0` to `P_TP` (Port 9), resetting the hardware step down-counter and configuring the preemption quantum (`2,500` steps in TritOS). |
| `+2` | `drv_timer_irq` | None (hardware trap entry for Vector `7`) | Context-switches or returns via `IRET` | All user registers saved in TCB | Increments `K_TIMER_IRQS` (`5866..5868`). If interrupted from user mode (`ESR >= 95`) or the kernel idle loop, saves task state, polls input (`drv_kbd_poll`, `drv_mouse_poll`), advances the round-robin scheduler, and restores the next runnable task. |
| `+4` | `drv_timer_read` | None | `R0` = monotonic virtual step count | `R1..R8` | Reads the current monotonic step counter from `P_TM` (Port 6) into `R0`. |

### Error Behavior

Passing a non-positive period (`R0 <= 0`) to `drv_timer_init` cleanly disables periodic timer interrupts (`timerPeriod = 0` in hardware) without trapping. If a timer interrupt fires while the CPU is executing a non-idle supervisor critical section (`ESR < 95` and `EPC` outside `kernel_idle_loop`), `drv_timer_irq` increments `K_TIMER_IRQS` and returns immediately via `IRET` without preempting supervisor state.

---

## 3. Driver: `keyboard` (`v1`)

- **Markers:** `; ==== DRIVER keyboard v1 ====` … `; ==== END DRIVER keyboard ====`
- **Ports:** `P_KC` (10), `P_KD` (11), `P_KT` (12)
- **Memory:** `5869..5871` (`K_KBD_IRQS`, 3-tryte word counting keyboard interrupts)
- **IRQ Vector:** `8` (`IRQ_KBD`, mask bit 1 = `2` in `SPR_IMASK`)

### Entry Table

| Offset | Entry Label | Registers In | Registers Out | Preserved Registers | Description |
|---|---|---|---|---|---|
| `+0` | `drv_kbd_init` | None | `R0` = `0` | `R1..R8` | Zeros `K_KBD_IRQS` (`5869..5871`) and drains any stale key events from the hardware FIFO (`P_KC`, `P_KD`, `P_KT`). |
| `+2` | `drv_kbd_irq` | None (hardware trap entry for Vector `8`) | Returns via `IRET` or `sched_restore_current` | `R0..R8` | Increments `K_KBD_IRQS` and invokes `drv_kbd_poll` to transfer hardware keystrokes to the focused task's event queue. |
| `+4` | `drv_kbd_poll` | None | None | `R0..R8` | Loops while `P_KC` (Port 10) > 0, reading key code from `P_KD` (Port 11) and transition type from `P_KT` (Port 12), and pushes `EV_KEY` (`type = 1`) events for key-down transitions (`P_KT == 0`) to the active window's task. |

### Error Behavior

- **No active window (`ACTIVE_WIN == -1` or invisible window):** `drv_kbd_poll` dequeues `P_KD` and `P_KT` and discards the event so the hardware FIFO never stalls.
- **Task event queue full (`EV_COUNT >= 16`):** `drv_kbd_poll` stops polling before reading `P_KD`/`P_KT`, applying backpressure so remaining keystrokes stay buffered in the hardware keyboard FIFO until the task consumes queued events.

---

## 4. Driver: `mouse` (`v1`)

- **Markers:** `; ==== DRIVER mouse v1 ====` … `; ==== END DRIVER mouse ====`
- **Ports:** `P_MC` (13), `P_MX` (14), `P_MY` (15), `P_MB` (16)
- **Memory:** `5872..5874` (`K_MOUSE_IRQS`), `5878..5879` (`K_DRAG_WIN`, `K_PREV_BTN`), `8910..8911` (`CUR_X`, `CUR_Y`)
- **IRQ Vector:** `9` (`IRQ_MOUSE`, mask bit 2 = `4` in `SPR_IMASK`)

### Entry Table

| Offset | Entry Label | Registers In | Registers Out | Preserved Registers | Description |
|---|---|---|---|---|---|
| `+0` | `drv_mouse_init` | None | `R0` = `0` | `R1..R8` | Zeros `K_MOUSE_IRQS` (`5872..5874`), sets `K_DRAG_WIN = -1` (`5878`) and `K_PREV_BTN = 0` (`5879`), and centers the cursor at `CUR_X = 364` (`8910`), `CUR_Y = 230` (`8911`). |
| `+2` | `drv_mouse_irq` | None (hardware trap entry for Vector `9`) | Returns via `IRET` or `sched_restore_current` | `R0..R8` | Increments `K_MOUSE_IRQS` and invokes `drv_mouse_poll`. |
| `+4` | `drv_mouse_poll` | None | None | `R0..R8` | Drains relative motion deltas (`P_MX`, `P_MY`) and button mask (`P_MB`) while `P_MC` (Port 13) > 0, updates `CUR_X`/`CUR_Y`, repaints damaged 6×6 cursor rectangles via `drv_fb_redraw_rect`, handles window titlebar dragging, and dispatches mouse down/move/up events. |

### Error Behavior

- **Coordinate out of range:** Cursor coordinates are clamped to `[0..722]` horizontally and `[0..479]` vertically so the 6×6 cursor sprite never writes outside the 729×486 screen.
- **Event queue backpressure:** If the active window's task has `EV_COUNT >= 14`, `drv_mouse_poll` pauses hardware FIFO consumption so two slots remain reserved for button-release transitions (`EV_MOUSE_UP`), preventing stuck-drag states.

---

## 5. Driver: `framebuffer` (`v1`)

- **Markers:** `; ==== DRIVER framebuffer v1 ====` … `; ==== END DRIVER framebuffer ====`
- **Ports:** `P_DC` (5)
- **Memory:** `7900..8628` (`SCAN_BUF`, 729-tryte scanline composition buffer), `8912..8928` (`LAST_REDRAW_TRYTES`, `TOTAL_REDRAW_TRYTES`, `REDRAW_COUNT`, `TMP_RX..TMP_Z`), `15000000..15354293` (729×486 MMIO VRAM in 729-color balanced-ternary palette `-364..+364`)
- **IRQ Vector:** `None`

### Entry Table

| Offset | Entry Label | Registers In | Registers Out | Preserved Registers | Description |
|---|---|---|---|---|---|
| `+0` | `drv_fb_init` | None | `R0` = `0` | `R1..R8` | Fills the entire 729×486 framebuffer with `COL_DESKTOP_BG` (`-280`) via hardware `P_DC` (Port 5), renders the taskbar strip via `drv_fb_draw_taskbar`, and resets redraw telemetry counters at `8912..8920`. |
| `+2` | `drv_fb_redraw_rect` | `R0` = `x`, `R1` = `y`, `R2` = `w`, `R3` = `h` | None | `R0..R8` | Damage-based scanline compositor: clips `(x, y, w, h)` to `729×486`, composites desktop/taskbar background, visible windows in `ZORDER`, and the 6×6 cursor into `SCAN_BUF`, and blits each scanline to MMIO VRAM (`15000000 + y*729 + x`). |
| `+4` | `drv_fb_draw_char` | `R0` = `x`, `R1` = `y`, `R2` = buffer stride, `R3` = ASCII code, `R4` = fg color, `R5` = bg color, `R7` = target buffer base | None | `R0..R8` | Renders an 8×8 glyph from `font_8x8` into `R7 + (y + row)*stride + x`. Lowercase ASCII (`97..122`) is automatically mapped to uppercase (`65..90`). |
| `+6` | `drv_fb_draw_taskbar` | None | None | `R0..R8` | Renders the taskbar background (`y = 462..485`), top border, 11 application launcher buttons, and the red fault banner (`FAULT: TASK KILLED` when `K_FAULT_BANNER_ACTIVE != 0`) directly into MMIO VRAM. |

### Error Behavior

- **Out-of-bounds or degenerate rectangles:** `drv_fb_redraw_rect` clips negative `x`/`y` coordinates and clamps `x + w <= 729`, `y + h <= 486`. If the clipped width `w <= 0` or height `h <= 0`, it returns immediately as a no-op without modifying VRAM or counters.
- **Unprintable character codes:** `drv_fb_draw_char` maps any character code outside `32..95` (after lowercase-to-uppercase folding) to glyph index `0` (`' '`).

---

## 6. Driver: `net` (`v3`)

- **Markers:** `; ==== DRIVER net v3 ====` … `; ==== END DRIVER net ====`
- **Ports:** `P_NST` (22), `P_NID` (23), `P_NTX` (24), `P_NRX` (25), `P_NTF` (26), `P_NRF` (27)
- **Memory:** `9700..9799` (`K_NET_IRQS`..`K_NET_CLASH_NODE`), `59049..65000` (`K_SFP_BUF`), `1417176..1456541` (`K_SNS_PEERS`, `K_NET_LAST_CHAT..K_NET_Q_BASE`, `K_SRRP_BUF`)
- **IRQ Vector:** `11` (`IRQ_NET`, mask bit 4 = `16` in `SPR_IMASK`)

### Wire Format (16-Byte StudioNet Header, `spiralos/STUDIONET.md` §2)

All frames built and parsed by `net v2` use the 16-byte little-endian StudioNet header with no checksum and payload `0..480` bytes:

| Byte Offset | Field | Type | Description |
|---|---|---|---|
| `0..1` | `dst` | `u16` LE | Destination Node ID (`0x0003..0x0006` TritOS, `0x0101` TabComp, `0x0201` Hummingbird, `0x00FE` Sonder, `0xFFFF` Broadcast) |
| `2..3` | `src` | `u16` LE | Source Node ID (read from `P_NID` Port 23) |
| `4` | `proto` | `u8` | `1` = SNS, `2` = SDP (Chat port 4200, Ping port 7), `3` = SSP (File Push port 4300/4301) |
| `5` | `flags` | `u8` | `0x01` = SYN, `0x02` = ACK, `0x04` = PSH, `0x08` = FIN |
| `6..7` | `sport` | `u16` LE | Source port |
| `8..9` | `dport` | `u16` LE | Destination port |
| `10..11` | `seq` | `u16` LE | Sequence number (starts at `100`, increments by 1 per frame transmitted) |
| `12..13` | `ack` | `u16` LE | Acknowledgment number (`(rx.seq + 1) & 0xFFFF` on replies/ACKs, `0` otherwise) |
| `14..15` | `len` | `u16` LE | Payload length in bytes (`0..480`; must equal `frame.length - 16`) |
| `16..` | `payload` | `u8[len]` | Payload bytes (`1` byte per tryte in `0..255`) |

### Entry Table

| Offset | Entry Label | Registers In | Registers Out | Preserved Registers | Description |
|---|---|---|---|---|---|
| `+0` | `drv_net_init` | None | `R0` = `0` | `R1..R8` | Zeros driver state (`9700..9744`, `12200..17999`, `59049..65000`), initializes `K_NET_SEQ = 100`, probes `P_NST` (Port 22), and drains any stale hardware RX frames via `P_NRX` (Port 25). |
| `+2` | `drv_net_irq` | None (hardware trap entry for Vector `11`) | Returns via `IRET` or `sched_restore_current` | `R0..R8` | Increments `K_NET_IRQS` (`9700..9702`) and calls `drv_net_poll` to drain and process incoming frames. |
| `+4` | `drv_net_poll` | None | None | `R0..R8` | Drains up to 10 frames per burst from `P_NRX`/`P_NRF` into `K_NET_Q_BASE`, validates the 16-byte header, dispatches SDP Chat (`port 4200`), SDP Ping (`port 7`), and SSP File Push/ACK (`port 4300`/`4301`), and enforces the `250,000`-step Ping timeout budget. |
| `+6` | `drv_net_get_id` | None | `R0` = 16-bit local Node ID | `R1..R8` | Reads the station's 16-bit StudioNet Node ID from `P_NID` (Port 23). |
| `+8` | `drv_net_send` | `R0` = `dst`, `R1` = `proto`, `R2` = `flags`, `R3` = `sport`, `R4` = `dport`, `R5` = `ack`, `R7` = `payload_ptr`, `R8` = `payload_len` | `R0` = total frame bytes sent (`16 + payload_len`) | `R1..R8` | Assembles a 16-byte StudioNet header + payload into `K_NET_TX_BUF`, streams the bytes to `P_NTF` (Port 26), triggers transmission via `P_NTX` (Port 24), and increments `K_NET_TX_PKTS`. |
| `+10` | `drv_net_ping` | `R0` = `dst_node` | `R0` = `0` | `R1..R8` | Records `K_NET_PING_SENT_TICKS` via `drv_timer_read`, sets `K_NET_PING_PENDING = 1`, and sends an SDP Port 7 `PSH` request (`"PING"`, 4 bytes) to `R0`. |
| `+12` | `drv_net_send_file` | `R0` = `dst_node`, `R1` = pointer to NUL-terminated filename | `R0` = `0` (sent), `-1` (missing file), or `-2` (`TOO BIG FOR SPIRALOS`) | `R1..R8` | Reads file from TritOS FS, selects byte mode (`'B'`, all trytes in `0..255`) or tryte mode (`'T'`, signed 16-bit LE), checks the 440-byte SpiralOS limit, and transmits single-frame (`SYN\|PSH\|FIN` on port `4300`) or multi-chunk (`SYN\|PSH` on `4300`, `PSH`/`PSH\|FIN` on `4301`) SSP frames. |
| `+14` | `drv_net_status` | `R0` = destination buffer (`120` trytes) | `R0` = `K_NET_RX_PKTS` | `R1..R8` | Calls `drv_net_poll` and writes driver telemetry (`node_id`, `tx_pkts`, `rx_pkts`, `drop_pkts`, `ping_replies`, `last_rtt`, `chat_count`, `sfp_rx_count`, `last_chat[64]`, `last_file[16]`, `status_msg[20]`) to `R0`. |
| `+16` | `drv_net_sns` | `R0` = op (`0`=poll/boot, `1`=HELLO, `2`=WHO, `3`=BYE, `4`=set name, `5`=copy peers), `R1` = ptr | `R0` = peer count or status | `R1..R8` | Implements StudioNet 1.0 SNS (`PROTO_SNS = 1`, port `53`) peer table and `NameAgent` naming rules (`triton`, `tri1`..`triN`, token tie-breaking, `NODE ID CLASH`). |
| `+18` | `drv_net_srrp` | `R0` = dst_node, `R1` = verb, `R2` = path_ptr, `R3` = body_ptr, `R4` = body_len, `R5` = resp_buf | `R0` = status code (`200`, `201`, `403`, `404`, `413`, `-1` timeout) | `R1..R8` | Implements StudioNet 1.0 SRRP (`PROTO_SSP = 3`, port `80`) client and server (`GET`, `PUT`, `POST`, `LIST`, `DEL`, `Encoding: trytes16`, multi-frame SACK window, `/inbox` and `/share`). |

### Error Behavior

- **Malformed frames:** Any frame with total length `< 16` bytes or `> 512` bytes, payload length `len > 480`, header `len != frame.length - 16`, or an unrecognized protocol/port/flags combination is dropped immediately and increments `K_NET_DROP_PKTS` (`9706..9708`). Malformed frames never fault the kernel (`ESR == 0`). Note that the pinned Triton 3.1 NIC hardware filters frames `< 12` bytes before raising `IRQ_NET`; frames of `12..15` bytes reach `drv_net_poll` on `P_NRX` and are dropped and counted in `K_NET_DROP_PKTS`.
- **Receive flood protection:** `drv_net_poll` accepts at most `10` frames per drain burst into the 10-slot `K_NET_Q_BASE` ring buffer; any additional frames queued in hardware during a flood are popped via `P_NRX` and counted in `K_NET_DROP_PKTS`.
- **Ping timeout (`NO REPLY`):** If `K_NET_PING_PENDING == 1` and `drv_timer_read() - K_NET_PING_SENT_TICKS >= 250000` virtual steps elapse without a port-7 reply, `drv_net_poll` clears `K_NET_PING_PENDING = 0`, sets `K_NET_LAST_RTT = -1`, and writes `"NO REPLY"` into `K_NET_STATUS_MSG`.
- **Missing file or SpiralOS size limit:** If the filename passed to `drv_net_send_file` is empty or not found in the filesystem, `drv_net_send_file` sets `K_NET_STATUS_MSG` to `"FILE NOT FOUND"`, transmits `0` frames, and returns `-1`. If the encoded file size exceeds `440` bytes and `dst_node` is a SpiralOS node (`0x0101`, `0x0201`, or `0x00FE`), `drv_net_send_file` sets `K_NET_STATUS_MSG` to `"TOO BIG FOR SPIRALOS"`, transmits `0` frames, and returns `-2`.


---

# TritOS Desktop 2.0 Driver Library Extensions (Triton 4)

In `desktop/tritos-desktop-2.html` (`desktop/guest-200.asm`), the guest assembly driver library is extended for the Triton 4 machine (`Ports 28..32`, `Vector 12 = IRQ_MEDIA`) with upgraded `disk v2`, `timer v2`, and the Copy-on-Write filesystem driver `DRIVER fs v2`.

| Driver | Version | IRQ Vector | Ports Used | Owned Kernel Memory Ranges | Entry Table Labels |
|---|---|---|---|---|---|
| `disk` | `v2` | `10` | `P_DA` (7), `P_DD` (8), `P_DLBA` (17), `P_DDMA` (18), `P_DCNT` (19), `P_DCMD` (20), `P_DERR` (21), `P_DUNIT` (28), `P_DSIZE` (29), `P_DFLAGS` (30) | `5875..5877` | `drv_disk_boot`, `drv_disk_irq`, `drv_disk_read`, `drv_disk_write`, `drv_disk_write_tryte`, `drv_disk_select`, `drv_disk_info` |
| `timer` | `v2` | `7` | `P_TM` (6), `P_TP` (9), `P_TMODE` (31), `P_RTC` (32) | `5866..5868` | `drv_timer_init`, `drv_timer_irq`, `drv_timer_read`, `drv_timer_rtc_read`, `drv_timer_rtc_write` |
| `fs` | `v2` | `12` | *(none directly; calls `drv_disk_*` and `drv_timer_rtc_read`)* | `1456542..4782968` (`Banks 74..242`) | `drv_fs_init`, `drv_fs_media_irq`, `drv_fs_poll_media`, `drv_fs_format`, `drv_fs_mount_unit`, `drv_fs_unmount_unit`, `drv_fs_set_hint`, `drv_fs_unit_info`, `drv_fs_list`, `drv_fs_stat`, `drv_fs_read`, `drv_fs_write`, `drv_fs_mkdir`, `drv_fs_delete`, `drv_fs_rename`, `drv_fs_copy`, `drv_fs_fsck`, `drv_fs_copy_legacy`, `drv_fs_doc_save`, `drv_fs_doc_load`, `drv_fs_app_install` |

---

## 2.0 Driver: `disk` (`v2`)

- **Markers:** `; ==== DRIVER disk v2 ====` … `; ==== END DRIVER disk ====`
- **Ports:** `P_DA` (7), `P_DD` (8), `P_DLBA` (17), `P_DDMA` (18), `P_DCNT` (19), `P_DCMD` (20), `P_DERR` (21), `P_DUNIT` (28), `P_DSIZE` (29), `P_DFLAGS` (30)
- **Memory:** `5875..5877` (`K_DISK_IRQS`, 3-tryte word counting completed disk DMA interrupts)
- **IRQ Vector:** `10` (`IRQ_DISK`, mask bit 3 = `8` in `SPR_IMASK`)

### Entry Table

| Offset | Entry Label | Registers In | Registers Out | Preserved Registers | Description |
|---|---|---|---|---|---|
| `+0` | `drv_disk_boot` | None (reset entry `PC = 0`) | Jumps to `kernel_boot_entry` with `R0 = 1` | N/A | Selects Unit `0` (`P_DUNIT = 0`) and loads `135` sectors (`98,415` trytes) via DMA into RAM `0..98414`, covering the low kernel, bundled apps, and high `.org 65020..75028` (`DRIVER fs v2` + Apps 12–14). |
| `+2` | `drv_disk_irq` | None (Vector `10`) | Returns via `IRET` | `R0..R8` | Increments `K_DISK_IRQS` (`5875..5877`) and returns via `IRET`. |
| `+4` | `drv_disk_read` | `R0` = LBA, `R1` = RAM DMA addr, `R2` = sector count | `R0` = `0` on success, or negative error code (`-1`..`-4`) | `R1..R8` | Executes synchronous DMA read (`P_DCMD = 1`) on the currently selected unit. |
| `+6` | `drv_disk_write` | `R0` = LBA, `R1` = RAM DMA addr, `R2` = sector count | `R0` = `0` on success, or negative error code (`-1`..`-4`) | `R1..R8` | Executes synchronous DMA write (`P_DCMD = 2`) on the currently selected unit. |
| `+8` | `drv_disk_write_tryte` | `R0` = linear tryte offset, `R1` = tryte value | `R0` = `0` | `R1..R8` | Writes one tryte via legacy PIO ports `P_DA` (7) and `P_DD` (8). |
| `+10` | `drv_disk_select` | `R0` = unit index (`0..26`) | `R0` = selected unit index | `R1..R8` | Writes `R0` to `P_DUNIT` (Port 28) to select the active storage unit. |
| `+12` | `drv_disk_info` | `R0` = unit index (`0..26`) | `R0` = `DISK_FLAGS` (`bit 0` present, `bit 1` removable, `bit 2` write-protected, `bit 3` changed [clears on read]), `R1` = `DISK_SIZE` (sectors) | `R2..R8` | Selects unit `R0` via `P_DUNIT` (Port 28), reads `P_DFLAGS` (Port 30) into `R0` and `P_DSIZE` (Port 29) into `R1`, and restores `P_DUNIT = 0`. |

### Error Behavior

If a DMA command on `P_DCMD` (Port 20) fails (`status != 1`), `drv_disk_read` and `drv_disk_write` negate `P_DERR` (Port 21: `1 = ERR_BAD_SECTOR`, `2 = ERR_BAD_DMA_ADDR`, `3 = ERR_BAD_CMD`, `4 = ERR_BAD_UNIT`) and return `-1`..`-4` in `R0`.

---

## 2.0 Driver: `timer` (`v2`)

- **Markers:** `; ==== DRIVER timer v2 ====` … `; ==== END DRIVER timer ====`
- **Ports:** `P_TM` (6), `P_TP` (9), `P_TMODE` (31), `P_RTC` (32)
- **Memory:** `5866..5868` (`K_TIMER_IRQS`)
- **IRQ Vector:** `7` (`IRQ_TIMER`, mask bit 0 = `1` in `SPR_IMASK`)

### Entry Table

| Offset | Entry Label | Registers In | Registers Out | Preserved Registers | Description |
|---|---|---|---|---|---|
| `+0` | `drv_timer_init` | `R0` = timer period (`2,500` ticks) | `R0` = `0` | `R1..R8` | Switches `P_TMODE` (Port 31) to `1` (`200 kHz` / `5 µs` real-time ticks from the host clock) and programs `P_TP` (Port 9) to `R0`. |
| `+2` | `drv_timer_irq` | None (Vector `7`) | Context-switches or returns via `IRET` | All user registers saved in TCB | Increments `K_TIMER_IRQS`, polls keyboard/mouse/media (`k_fs2_poll_media`), and runs the round-robin scheduler. |
| `+4` | `drv_timer_read` | None | `R0` = monotonic tick count (`200 kHz` in Mode 1) | `R1..R8` | Reads `P_TM` (Port 6) into `R0`. |
| `+6` | `drv_timer_rtc_read` | None | `R0` = 27-trit seconds since `2000-01-01 00:00:00 UTC` | `R1..R8` | Reads `P_RTC` (Port 32) into `R0`. |
| `+8` | `drv_timer_rtc_write` | `R0` = new RTC seconds value | `R0` = `0` | `R1..R8` | Writes `R0` to `P_RTC` (Port 32) to set the host-relative RTC offset. |

### Error Behavior

Passing `R0 <= 0` to `drv_timer_init` disables periodic timer interrupts without trapping.

---

## 2.0 Driver: `fs` (`v2`)

- **Markers:** `; ==== DRIVER fs v2 ====` … `; ==== END DRIVER fs ====`
- **Ports:** None directly (invokes `drv_disk_select`, `drv_disk_info`, `drv_disk_read`, `drv_disk_write`, and `drv_timer_rtc_read` through their driver entry tables)
- **Memory:** `1456542..4782968` (`Banks 74..242`: unit table, 16-page SLT cache, directory/copy scratch buffers, and generation-stamped `fsck` tables)
- **IRQ Vector:** `12` (`IRQ_MEDIA`, mask bit 5 = `32` in `SPR_IMASK`, `VBR + 36`)

### Entry Table

| Offset | Entry Label | Registers In | Registers Out | Preserved Registers | Description |
|---|---|---|---|---|---|
| `+0` | `drv_fs_init` | None | `R0` = `0` | `R1..R8` | Initializes `Banks 74..75` metadata, invalidates the 16-page SLT cache, scans Units `0..26`, mounts Unit `0` as legacy (`type = 1`), auto-formats blank Unit `1` (`59,049` sectors) as `"HOME"` on first boot, and mounts all present valid TritFS v2 units (`type = 2`). |
| `+2` | `drv_fs_media_irq` | None (Vector `12` trap entry) | Returns via `IRET` | `R0..R8` | Sets `FS_MEDIA_PENDING = 1` (`1457942`) and returns via `IRET`. |
| `+4` | `drv_fs_poll_media` | None | `R0` = `0` | `R1..R8` | Polls Units `1..26` via `drv_disk_info` when `FS_MEDIA_PENDING != 0` or requested; unmounts ejected units (flushing SLT cache pages for that unit) and mounts newly inserted valid TritFS v2 units without reboot. |
| `+6` | `drv_fs_format` | `R0` = unit (`1..26`), `R1` = label ptr (`<= 24` trytes) | `R0` = `0` or negative `ERR_FS_*` | `R1..R8` | Formats unit `R0` with a TritFS v2 layout (`magic = 360808174`, `version = 2`, SLT sectors `1..slt_len`, empty root directory at `1 + slt_len`, `SLT[0..slt_len] = -2`, `SLT[root] = -1`, all remaining SLT entries `0`), writes Sector `0` last as the atomic commit point, and mounts the unit. |
| `+8` | `drv_fs_mount_unit` | `R0` = unit (`1..26`) | `R0` = `0` or negative `ERR_FS_*` | `R1..R8` | Reads Sector `0`, validates `magic == 360808174`, `version == 2`, `total_sectors == DISK_SIZE`, `slt_start == 1`, `slt_len == ceil(total_sectors / 243)`, and valid `root_sec`, computes free sector count, and marks unit mounted (`type = 2`). |
| `+10` | `drv_fs_unmount_unit` | `R0` = unit (`1..26`) | `R0` = `0` | `R1..R8` | Invalidates any cached SLT pages for unit `R0` and clears its mounted state in `FS_UNIT_TAB`. |
| `+12` | `drv_fs_set_hint` | `R0` = unit (`1..26`), `R1` = `alloc_hint` word | `R0` = `0` or negative `ERR_FS_*` | `R1..R8` | Sets the unit's in-memory and superblock `alloc_hint` (`[data_start .. total_sectors - 1]`). |
| `+14` | `drv_fs_unit_info` | `R0` = unit (`0..26`), `R1` = out_buf (`40` trytes) | `R0` = `0` or `-1` | `R1..R8` | Populates `[present, flags, mount_type, total_sectors(w), free_sectors(w), slt_len(w), root_sec(w), gen(w), label[24]]` at `R1`. |
| `+16` | `drv_fs_list` | `R0` = path_ptr, `R1` = out_buf, `R2` = max_entries | `R0` = entry count or negative `ERR_FS_*` | `R1..R8` | Resolves `U:/path` (supporting both `0:/` legacy and `1:/..26:/` TritFS v2) and copies live 40-tryte directory entries to `R1`. |
| `+18` | `drv_fs_stat` | `R0` = path_ptr, `R1` = out_buf (`40` trytes) | `R0` = `0` or negative `ERR_FS_*` | `R1..R8` | Resolves `U:/path` (including root `U:/`) and writes its 40-tryte directory metadata entry to `R1`. |
| `+20` | `drv_fs_read` | `R0` = path_ptr, `R1` = dst_buf, `R2` = max_trytes | `R0` = trytes read or negative `ERR_FS_*` | `R1..R8` | Follows the SLT chain (or contiguous LBA run on `0:/`) for `U:/path` and copies up to `R2` trytes into `R1`. |
| `+22` | `drv_fs_write` | `R0` = path_ptr, `R1` = src_buf, `R2` = len_trytes, `R3` = meta_type | `R0` = `0` or negative `ERR_FS_*` | `R1..R8` | Writes a new or overwritten file using Copy-on-Write: allocates fresh data sectors, bubbles fresh directory chains up to a new `root_sec`, flushes dirty SLT pages, writes Sector `0` (`generation + 1`, new `root_sec`), and frees superseded chains only after the Sector `0` commit succeeds. |
| `+24` | `drv_fs_mkdir` | `R0` = path_ptr | `R0` = `0` or negative `ERR_FS_*` | `R1..R8` | Creates a new empty folder (`type = 2`) at `U:/path` via CoW bubble-up and Sector `0` commit. |
| `+26` | `drv_fs_delete` | `R0` = path_ptr | `R0` = `0` or negative `ERR_FS_*` | `R1..R8` | Removes a file or empty folder via CoW bubble-up (`type = 0` tombstoned in new parent directory chain), commits Sector `0`, and frees the target's old SLT chain after commit. |
| `+28` | `drv_fs_rename` | `R0` = old_path_ptr, `R1` = new_path_ptr | `R0` = `0` or negative `ERR_FS_*` | `R1..R8` | Moves/renames an entry on the same unit (preserving its data chain and timestamps) or across units (`copy` + `delete`). |
| `+30` | `drv_fs_copy` | `R0` = src_path_ptr, `R1` = dst_path_ptr | `R0` = `0` or negative `ERR_FS_*` | `R1..R8` | Copies a file within or across units (`0:/..26:/`), preserving `meta_type` and failing cleanly without corrupting the destination unit if the source unit is ejected mid-copy. |
| `+32` | `drv_fs_fsck` | `R0` = unit (`1..26`), `R1` = repair_flag (`0`/`1`), `R2` = out_buf (`6` trytes) | `R0` = problem count or negative `ERR_FS_*` | `R1..R8` | Checks superblock, walks directory tree and SLT chains detecting bad pointers, loops, cross-links, and reserved-sector misuse, scans SLT for orphan sectors (`SLT[s] != 0` and unowned), optionally zeroes orphans and updates `free_sectors` when `R1 == 1` and `problems == 0`, and writes `[problems, orphans, fixed_orphans, free_sectors(w)]` to `R2`. |
| `+34` | `drv_fs_copy_legacy` | None | `R0` = files copied or negative `ERR_FS_*` | `R1..R8` | Ensures `1:/legacy` exists and copies every file from `0:/` (`Sector 200` directory) into `1:/legacy/<name>` tryte-for-tryte. |
| `+36` | `drv_fs_doc_save` | `R0` = legacy_name_ptr, `R1` = src_buf, `R2` = len, `R3` = type | `R0` = `0` or negative `ERR_FS_*` | `R1..R8` | Saves document to `1:/docs/<name>` when `1:/` is mounted (ensuring `1:/docs` exists) and mirrors to `0:/<name>`, falling back to `0:/<name>` if Unit `1` is absent. |
| `+38` | `drv_fs_doc_load` | `R0` = legacy_name_ptr, `R1` = dst_buf, `R2` = max_len | `R0` = trytes read or `-1` | `R1..R8` | Reads `1:/docs/<name>` if present on `1:/`, falling back to `0:/<name>`. |
| `+40` | `drv_fs_app_install` | `R0` = app_name_ptr | `R0` = `0` or negative `ERR_FS_*` | `R1..R8` | Copies `2:/apps/<name>/main` and `2:/apps/<name>/icon` (if present) into `1:/apps/<name>/` (creating `1:/apps` and `1:/apps/<name>` if needed). |

### Error Behavior & Measured `fsck` Cost

- **Error Codes:** All operations return `0` (or non-negative count/length) on success and negative `ERR_FS_*` codes on failure:
  - `-1` (`ERR_FS_NOENT`): Path or component not found
  - `-2` (`ERR_FS_EXIST`): Target already exists (`mkdir` or `rename` onto non-matching type)
  - `-3` (`ERR_FS_NOTDIR`): Path prefix component is not a directory, or `list` target is a file
  - `-4` (`ERR_FS_ISDIR`): `read` or `write` target is a directory
  - `-5` (`ERR_FS_NOTEMPTY`): `delete` target is a non-empty directory
  - `-6` (`ERR_FS_NOSPC`): Insufficient free sectors on unit for CoW data + directory bubble-up
  - `-7` (`ERR_FS_RO`): Unit is write-protected (`DISK_FLAGS` bit 2) or read-only
  - `-8` (`ERR_FS_NOMEDIA`): Unit not present, unmounted, or ejected mid-operation
  - `-9` (`ERR_FS_CORRUPT`): Invalid superblock magic/version/geometry or corrupted SLT chain (`SLT` loop or out-of-range pointer)
  - `-10` (`ERR_FS_INVAL`): Empty/invalid path, bad unit index, name `> 24` trytes, or invalid character (`/` or `\0` in name)
- **Measured `fsck` Cost:**
  - **Table Clear:** Constant-time (`1` increment of the 27-trit generation counter `FSCK_GEN` at `1457960`, avoiding any bulk clear of the `1,594,323`-tryte `FSCK_OWNER_BASE` and `FSCK_SEEN_BASE` tables).
  - **Tree & Chain Walk:** Linear in sectors used (`O(used_sectors)` SLT lookups and directory sector reads).
  - **Orphan Scan:** Linear in total sectors on the unit (`total_sectors` SLT entries inspected across `slt_len = ceil(total_sectors / 243)` SLT sectors).
