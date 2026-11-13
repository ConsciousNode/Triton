# TritOS 1.1.1 Hardware Driver Library (`DRIVERS.md`)

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
| `net` | `v2` | `11` | `P_NST` (22), `P_NID` (23), `P_NTX` (24), `P_NRX` (25), `P_NTF` (26), `P_NRF` (27) | `9700..9744`, `12200..17999`, `59049..65000` | `drv_net_init`, `drv_net_irq`, `drv_net_poll`, `drv_net_get_id`, `drv_net_send`, `drv_net_ping`, `drv_net_send_file`, `drv_net_status` |

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

## 6. Driver: `net` (`v2`)

- **Markers:** `; ==== DRIVER net v2 ====` … `; ==== END DRIVER net ====`
- **Ports:** `P_NST` (22), `P_NID` (23), `P_NTX` (24), `P_NRX` (25), `P_NTF` (26), `P_NRF` (27)
- **Memory:** `9700..9744` (`K_NET_IRQS`..`K_NET_IDX_TMP`), `12200..17999` (`K_NET_LAST_CHAT`, `K_NET_LAST_FILE`, `K_NET_STATUS_MSG`, `K_SFP_RX_NAME`, `K_NET_TX_BUF`, `K_NET_Q_BASE`), `59049..65000` (`K_SFP_BUF`)
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

### Error Behavior

- **Malformed frames:** Any frame with total length `< 16` bytes or `> 512` bytes, payload length `len > 480`, header `len != frame.length - 16`, or an unrecognized protocol/port/flags combination is dropped immediately and increments `K_NET_DROP_PKTS` (`9706..9708`). Malformed frames never fault the kernel (`ESR == 0`). Note that the pinned Triton 3.1 NIC hardware filters frames `< 12` bytes before raising `IRQ_NET`; frames of `12..15` bytes reach `drv_net_poll` on `P_NRX` and are dropped and counted in `K_NET_DROP_PKTS`.
- **Receive flood protection:** `drv_net_poll` accepts at most `10` frames per drain burst into the 10-slot `K_NET_Q_BASE` ring buffer; any additional frames queued in hardware during a flood are popped via `P_NRX` and counted in `K_NET_DROP_PKTS`.
- **Ping timeout (`NO REPLY`):** If `K_NET_PING_PENDING == 1` and `drv_timer_read() - K_NET_PING_SENT_TICKS >= 250000` virtual steps elapse without a port-7 reply, `drv_net_poll` clears `K_NET_PING_PENDING = 0`, sets `K_NET_LAST_RTT = -1`, and writes `"NO REPLY"` into `K_NET_STATUS_MSG`.
- **Missing file or SpiralOS size limit:** If the filename passed to `drv_net_send_file` is empty or not found in the filesystem, `drv_net_send_file` sets `K_NET_STATUS_MSG` to `"FILE NOT FOUND"`, transmits `0` frames, and returns `-1`. If the encoded file size exceeds `440` bytes and `dst_node` is a SpiralOS node (`0x0101`, `0x0201`, or `0x00FE`), `drv_net_send_file` sets `K_NET_STATUS_MSG` to `"TOO BIG FOR SPIRALOS"`, transmits `0` frames, and returns `-2`.
