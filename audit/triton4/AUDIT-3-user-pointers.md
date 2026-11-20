# AUDIT 3: user pointers into the path syscalls (delivery 3, follow-up)
**Auditor:** Kehai Interim · **Date:** 2026-11-18 (ET) · **Prompted by:** Ren's leads in
`ren-mailbox/2026-11-18_2102_ren-to-kehai_triton4-cartridge-test-app-draft.md`.
**Verdict:** AUDIT-2's acceptance stands for what it tested (the unit-26 channel is gone), but delivery 3 has a
**kernel memory-safety hole**: the path syscalls take user pointers without any bounds check.

Delivered files untouched. Work done on a scratch extract of `delivery-3/triton4-tritos-desktop-2.0.zip`
(sha256 `f52287b0…fdd5f6`, matches `ARRIVED-3.md`).

## Measured: user pointers are not checked (lead 3 holds)
Probe: `audit-tools/audit3-probe-user-pointers.js`, output in `audit-tools/audit3-probe-user-pointers.log`. It uses the
delivered d20 harness unmodified. The user-mode agent (`D20_AGENT_ASM`) passes non-sentinel args to the syscall raw,
so I only had to hand it raw addresses. Results are identical on `TritonJS` and `TritonWASM`:

- **Control:** `SYS_FS2_READ` (#52) of a 30-tryte file into the agent's own buffer → r0 = 30, data matches.
- `SYS_FS2_READ` with the destination in **kernel bank 100** (1,968,800) → r0 = 30, the 30 trytes there now equal
  the file.
- Destination in **another task's segment** (slot 7, 472,892) → r0 = 30, overwritten with the file.
- Destination **inside the TCB table** (6,400 = `TCB_BASE` + slot 6 + 16) → r0 = 30, overwritten.
- `SYS_FS2_WRITE` (#53) with the **source in kernel bank 74** (1,456,542), 40 trytes → r0 = 0, and the file on the
  exported home disk equals kernel memory tryte for tryte (10 of 40 nonzero).
- The machine didn't halt in any of these.

So any user app can write file contents anywhere in physical memory and read any memory out into a file.
(Reading guest memory here is the auditor observing; nothing in the delivered harness was changed.)

## Measured: why (static)
- The syscall bridge (`guest-200.asm` ~1067) jumps to `k_fs2_syscall_dispatch` (~19691) with the user's registers.
- `drv_fs_read_impl` (~22710) keeps R1 as `dst_buf_ptr` and passes it to `fs_read_chain`, which validates sectors
  and chain loops but never the destination. No `UBASE`/`ULIMIT` (TCB +36/+39) check appears on this path.
- Side note: `max_trytes <= 0` means "read the whole file" (`CMPI R7, #0 / JNPX dfri_len_ok`), so a caller can't
  even bound the write by length. Unit 0 reads default to 19,683 trytes.

## Lead (not measured)
- **Privilege escalation is likely one step away.** The TCB holds each task's saved ESR at +33. A file whose bytes
  are a crafted TCB image, read over the caller's own TCB, should resume it with PRIV = 0 (supervisor). I didn't
  build that exploit.
- The other pointer-taking syscalls (#50 list, #51 stat, #54..#65 path and buffer args) go through the same
  dispatch and very likely share the hole. I only probed #52 and #53.

## Measured: Ren's leads 1 and 2 (doc vs code)
- **§7 syscall numbers are wrong in `DESKTOP.md`.** Code (`k_fs2_syscall_dispatch`): 50 list, 51 stat, 52 read,
  53 write, 54 mkdir, 55 delete, 56 rename, 57 copy, 58 unit info, 59 format, 60 fsck, 61 copy legacy, 62
  RTC/hint/unmount multiplexer, 63 doc save, 64 doc load, 65 app install. The doc says 50 unit info, 51 format,
  55 list, 57 read, 58 write, 60 delete, 63 fsck, and so on. The tests and our audits use the code's numbers.
- **§8.1 start state is wrong.** Doc: PC = 0 (relocated), SP = 39,000, ESR = 95, R0..R8 = 0. Code (~1540): R8 =
  UBASE, PC = UBASE, SP = UBASE + 4500 (6950 for app 6, 4980 for app 11), ESR = 108. User addresses are physical.
- `ERR_FS_*` codes aren't listed anywhere. `drv_fs_read_impl` only returns −1 on every error.

## What this means for AUDIT-1 / AUDIT-2
Neither audit claimed user/kernel isolation for syscall arguments, and neither tested it, so nothing they measured
changes. But "a user-mode agent drives the tests" doesn't imply the user/kernel boundary holds: it doesn't.

## Recommended (for Kham to decide; nothing sent)
- A small fix spec: every pointer-taking syscall bounds-checks the full range against the caller's
  `[UBASE, ULIMIT)` and returns a documented error without touching memory; regenerate §7/§8.1 from the source;
  plus a positive control (a build flag that drops the check must fail the test). Ren's Part C C.6.1 already words
  this; it can ship alone as Desktop 2.0.1.
