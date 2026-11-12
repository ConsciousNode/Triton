# Triton 3.0: a full balanced-ternary computer

ConsciousNode SoftWorks. Xinu rules: single-file pages, zero dependencies, offline, no network APIs.
**Inline everything, and label every inline:** any code you carry over from an attached file keeps a provenance comment naming its source file and line range.

Triton 2.1 is a working balanced-ternary computer: 27-trit words, 9-trit trytes, 9 registers, a self-hosting OS (TritOS), and JS and WASM interpreters that agree on every case we've tried. Its limit is size. Addresses are one tryte, so the whole machine has **3⁹ = 19,683 cells** of memory, and the disk region is the same size.

**Triton 3.0 is the grown-up machine.** It needs a large address space, interrupts, privilege and memory protection, real devices (a big display, keyboard, mouse, block disk, timer, network), and a compatibility mode that runs every Triton 2.x program unchanged.

Two operating systems will be written for it **later, by other builds**:
- a native ternary GUI desktop;
- a port of the studio's SpiralOS.

**Do not build either one.** Build a machine that can honestly host them, plus a small text-mode TritOS 3 that proves the machine works and assembles itself.

## Attached

- `triton.html`, `ISA.md`, `REPORT.md`, `CHANGES-2.1.md`, `AUDIT.md`, `tests/run.js`, `tests/symbols.js` and `audit/*.js`: Triton 2.1 as audited. **`triton.html` stays exactly as it is.** It is the reference 2.x machine.
- `context/spiralos-VM.md` and `context/spiralos-HARDWARE.md`: **context only.** They describe the bytecode VM and native-core contract that a future SpiralOS port will need from a host machine: memory, a timer, a framebuffer to blit into, input events and block storage. Use them to check the machine *could* host that. Do not implement any of it.

## What to build

A new single file, **`triton3.html`**, containing:
- the Triton 3 machine, as a JS interpreter and a WASM interpreter (keep the MicroWAT approach from 2.x) that run in lockstep;
- the assembler and disassembler;
- TritOS 3;
- a debugger UI.

Also deliver **`ISA-3.md`**, **`REPORT-3.md`** and **`tests/t3-*.js`**.

### M1. Two modes in one machine

- **T2 mode** behaves exactly like Triton 2.1. Addresses are 9-trit and wrap modulo 3⁹ inside a 19,683-tryte window, and every 2.x instruction does what `ISA.md` says.
- **T3 mode** is the new architecture.
- The machine resets into a documented mode. Switching modes is a privileged operation.
- T2 mode is checked **against `triton.html` itself**, by differential tests (see the Tests section). You may lift code from it, with labels. You may not call it at runtime.

### M2. T3 addressing and control flow

- **Registers** stay 27-trit. In T3 mode, `PC`, `SP` and every effective address are **27-trit words**: tryte addresses in a 3²⁷ space.
- **Physical RAM size** is a machine option. The default is **3¹⁴ = 4,782,969 trytes**, and the size must be configurable up to at least 3¹⁵. An access beyond physical RAM raises a fault. It never wraps silently.
- **Encoding.** Keep the fixed 2-tryte (18-trit) encoding. Add what a big address space needs:
  - a way to build full 27-trit constants in registers (for example, instructions that set the middle and high trytes);
  - PC-relative branches and calls;
  - register-indirect jumps and calls;
  - base + offset loads and stores using full 27-trit base registers.

  You design the opcodes, inside the free opcode space. Document every one in `ISA-3.md` with exact semantics and flags, in the same style as `ISA.md`.
- **Block copy and fill.** Add one block-copy instruction and one block-fill instruction, interruptible and restartable. A GUI needs them for blits, and their exact semantics go in the spec.

### M3. Interrupts, privilege and protection

- **Modes:** supervisor and user.
- **Supervisor-only instructions** fault in user mode. These include anything that changes mode, protection, interrupt state or device configuration.
- **Interrupts and traps** go through a vector table: timer, keyboard, mouse, disk completion, network receive, plus software traps (system calls) and faults (illegal instruction, protection, bad address, divide by zero if you choose to trap it). Each vector entry is documented, as are the saved state and the return-from-interrupt instruction.
- **Protection.** At minimum, base and limit registers for user mode, so a user task cannot touch memory outside its window. Paging is optional. If you do paging, document it fully and test it the same way.
- **Determinism.** The machine is deterministic. Interrupts arrive at defined points in a virtual clock, so the same inputs at the same virtual times produce the same run, bit for bit.

### M4. Devices

Every device is reached through architected I/O ports, or through memory-mapped regions documented in `ISA-3.md`.

| Device | Requirements |
|---|---|
| **Display** | **729 × 486** pixels: 3⁶ × 2·3⁵. **One tryte per pixel**: 2 trits per channel gives 9 levels each of R, G and B, so 729 colours. The remaining 3 trits are reserved and are 0. The framebuffer is memory-mapped, and the browser renders it. |
| **Timer** | A programmable periodic interrupt driven by the virtual clock. There is one virtual clock for the whole machine, with a documented rate. |
| **Keyboard** | Key-down and key-up events with codes, queued, raising an interrupt. |
| **Mouse** | Relative motion and three buttons, queued, raising an interrupt. Pointer lock in the browser. |
| **Block disk** | Sectors of **729 trytes**. Capacity at least **3¹³ trytes**. Commands to read and write N sectors by DMA between disk and memory, a completion interrupt, and status and error codes. Image export and import, so the disk survives a page reload as a file the user saves. |
| **Network (StudioNet NIC)** | Sends and receives frames, one byte per tryte, using the frame format in `context/STUDIONET.md` (trust the 12-byte header table; its port numbers are stale) (12-byte header + payload). Pages on one origin are linked by `BroadcastChannel`, like the other studio machines. TARGET: build it if time allows; otherwise list it as not built. |

### M5. Toolchain and TritOS 3

- **Assemblers.** The JS assembler handles both T2 and T3 source. Keep the 2.1 symbol rules: full names, case-insensitive, and undefined or duplicate labels are errors with line numbers.
- **TritOS 3** is a small **text-mode** OS in T3 mode. It has:
  - a console drawn on the framebuffer, with an 8×8 or larger font you design yourself, not copied;
  - a shell;
  - a minimal file store on the block disk (a flat named-file table is enough; document its format);
  - **an in-OS assembler that streams its source from disk sector by sector,** so source size is limited by the disk, not by RAM. The 2.x cap of 19,182 characters must be gone.
  - a user-mode program runner. The OS runs in supervisor mode, launches a user program inside a protected window, and gets control back through a system call or a fault.

## Forbidden

- **If a requirement can't be met, or conflicts with another, say so in `REPORT-3.md` and leave it failing.** Never change emulator or VM accessors, I/O, consoles, test harnesses, or the attached `audit/*.js` scripts to make a check pass.
- **An emulator must never read or write a guest's private memory.** The only exceptions are architected DMA, memory-mapped devices and the debugger, and the debugger never feeds results back to tests.
- The in-OS assembler may not call, consult or embed the JS assembler's output, or any precomputed image.
- Do not special-case test programs, labels, seeds or file names anywhere.
- T2 mode may not call into `triton.html` at runtime.
- Do not modify `triton.html` or the attached tests.
- Every figure in the docs must come from a script you deliver. No hand-typed numbers.
- Do not describe anything as working unless a test exercises it.

## Tests

Put these in `tests/t3-*.js`. Each runs headless in Node and prints its own verdict. **Each one that targets a fix or feature has a positive control** that must fail.

1. **Oracle.** Extend the trit-array oracle to every new instruction: arithmetic, address formation, branches and block ops. JS = WASM = oracle on large randomized sets, including edge values and faulting cases.
2. **Differential fuzz in T3.** At least 10,000 random programs with interrupts arriving on a seeded virtual-clock schedule. JS = WASM on every register, flag, memory checksum and device state.
3. **T2 compatibility against `triton.html` (2.1).**
   - 10,000 random 2.x programs: final state identical to the 2.1 machine.
   - TritOS 2.1 boots and runs a scripted shell session identically.
   - TritOS 2.1's self-hosting fixed point holds in T2 mode.
   - The attached `tests/run.js`, `tests/symbols.js` and `audit/*.js` still pass, unmodified, against `triton.html`.
4. **Protection.**
   - A user program that writes outside its window, or runs a supervisor instruction, faults to the OS, and the OS survives.
   - **Positive control:** with protection switched off by a machine option, the same program corrupts kernel memory, and the test detects it.
5. **Interrupts and timer.**
   - The measured timer rate matches its programmed rate on the virtual clock.
   - Masking, priority and nested delivery behave as documented.
   - The same input schedule produces a bit-identical run.
6. **Disk.**
   - Multi-sector DMA round trips, the completion interrupt, and error codes for bad sectors and commands.
   - Image export and import round trip byte for byte.
7. **Self-hosting at scale.**
   - TritOS 3's in-OS assembler assembles TritOS 3's own source, and the output equals the JS assembler's (fixed point). The self-built image boots.
   - It also assembles a generated source of **at least 100,000 characters**, matching the JS assembler.
   - **Positive control:** a machine option that limits the assembler to a single in-RAM source buffer must fail the 100k case.
8. **Display and input.**
   - Test patterns written through the framebuffer read back exactly.
   - Keyboard and mouse events go in only through the devices and their interrupts, and are observed by guest code. No harness writes into guest memory.
9. **Determinism and state export**, in both modes: two runs are bit-identical, and a state exported mid-run and resumed finishes identically on JS and WASM.
10. **Static scan.** Strict CSP, no network or storage APIs except the documented `BroadcastChannel`, and every inline labeled.
11. **Real browser.** If you can run a headless browser, load `triton3.html`, boot TritOS 3 and report any page errors. If you can't, say so plainly.

## Report (`REPORT-3.md`)

- The final opcode map, memory map, port map and vector table, all generated from the code.
- Interpreter speed, JS and WASM, in T2 and T3 modes, measured on your machine.
- How much free opcode space remains.
- **Everything not built, everything that fails, and every requirement you found impossible or contradictory**, each with the reason.
