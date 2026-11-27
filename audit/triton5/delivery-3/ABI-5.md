# Triton 5.0 C ABI, Object & Executable Specification (`ABI-5.md`)

**ConsciousNode SoftWorks · Normative ABI Specification (Triton 5 Stage 3)**
**License:** MIT · **Target Architecture:** Triton 5.0 (`ISA-5.md`, balanced-3⁷ 2,187-tryte pages)

## 1. Compiler Name: `tcc5`
- **Name:** `tcc5` (*Triton C Compiler for Architecture 5*).
- **Why:** Follows the studio's architecture-versioned naming (`triton5.html`, `ISA-5.md`, `ABI-5.md`), distinguishing the Triton 5 C11 compiler from earlier Triton 2/3/4 assemblers and from host compilers.

## 2. C Data Model (ILP32, Little-Endian Byte-Per-Tryte)
Triton 5's smallest addressable memory unit is **1 tryte** (9 balanced trits, range `[-9841, +9841]`, 19,683 states). General-purpose registers (`R0..R8`) hold **1 Triton word** = **27 balanced trits** (`[-3,812,798,742,493, +3,812,798,742,493]`).

| C Type | `sizeof` (trytes) | Align (trytes) | Width (bits) | Register Representation | Memory Representation |
| :--- | ---: | ---: | ---: | :--- | :--- |
| `_Bool` | 1 | 1 | 1 (stored in 8) | `0` or `1` in 1 GPR | 1 tryte (`0` or `1`) |
| `char` / `signed char` | 1 | 1 | 8 | Canonical `[-128, 127]` in 1 GPR | 1 tryte (`[0, 255]` unsigned byte) |
| `unsigned char` | 1 | 1 | 8 | Canonical `[0, 255]` in 1 GPR | 1 tryte (`[0, 255]` unsigned byte) |
| `short` | 2 | 2 | 16 | Canonical `[-32768, 32767]` in 1 GPR | 2 trytes, little-endian bytes `b0, b1` |
| `unsigned short` | 2 | 2 | 16 | Canonical `[0, 65535]` in 1 GPR | 2 trytes, little-endian bytes `b0, b1` |
| `int` / `long` | 4 | 4 | 32 | Canonical `[-2^31, 2^31-1]` in 1 GPR | 4 trytes, little-endian bytes `b0..b3` |
| `unsigned int` / `unsigned long` | 4 | 4 | 32 | Canonical `[0, 2^32-1]` in 1 GPR | 4 trytes, little-endian bytes `b0..b3` |
| `long long` | 8 | 4 | 64 | Pair `(lo, hi)`: `lo ∈ [0, 2^32)`, `hi ∈ [0, 2^32)` | 8 trytes, little-endian bytes `b0..b7` |
| `unsigned long long` | 8 | 4 | 64 | Pair `(lo, hi)`: `lo ∈ [0, 2^32)`, `hi ∈ [0, 2^32)` | 8 trytes, little-endian bytes `b0..b7` |
| `void *` / `T *` / fn ptr | 4 | 4 | 32 | C-space signed `P ∈ [-2^31, 2^31-1]` in 1 GPR | 4 trytes, little-endian 2's-complement of `P` |
| `float` | 4 | 4 | 32 | IEEE 754 binary32 raw bits `[0, 2^32)` in 1 GPR | 4 trytes, little-endian IEEE 754 binary32 |
| `double` / `long double` | 8 | 4 | 64 | Pair `(lo, hi)` IEEE 754 binary64 raw bits | 8 trytes, little-endian IEEE 754 binary64 |

- **Why `CHAR_BIT = 8` and 1 C byte = 1 tryte:** ISO C11 requires `sizeof(char) == 1` and fixed-width types (`uint8_t`, `uint16_t`, `uint32_t`, `uint64_t`) with zero padding bits; storing 1 byte (`[0, 255]`) per tryte makes `memcpy`, `union` type-punning, IEEE 754 bit patterns, and NetBSD struct layouts byte-for-byte exact.
- **Why ILP32 (`int = long = pointer = 4` trytes):** Every 32-bit integer and the entire 2-level balanced-3⁷ virtual address space (`±581,130,733`) fits in a single 27-trit Triton register without register-pair splitting.
- **Why plain `char` is signed:** Matches x86-64/NetBSD convention and ensures differential equivalence against host GCC.
- **Why 4-tryte max natural alignment for 64-bit types:** Triton 5 has no hardware alignment fault on tryte loads/stores; 4-tryte alignment matches 32-bit stack slot granularity while allowing `_Alignas(N)` up to 2,187 trytes.
- **Standard typedefs:** `size_t = unsigned long`, `ptrdiff_t = long`, `intptr_t = long`, `uintptr_t = unsigned long`, `wchar_t = int`, `intmax_t = long long`, `uintmax_t = unsigned long long`.

## 3. Exact Binary Arithmetic via Stage-1 Binary-Semantics Instructions
Because 27 balanced trits hold `[-3,812,798,742,493, +3,812,798,742,493]`, every 32-bit signed (`[-2^31, 2^31)`) and unsigned (`[0, 2^32)`) integer is represented exactly in a single register without ternary overflow.

- **Wrapping (`WRAPU` / `WRAPS`):** Every unsigned `N`-bit operation (`N ∈ {8, 16, 32}`) finishes with `WRAPU rd, rd, N` (`mod 2^N`); signed conversions and overflows wrap via `WRAPS rd, rd, N` (`[-2^(N-1), 2^(N-1))`). *Why:* Eliminates ternary carry leakage and guarantees exact 2ⁿ modular arithmetic.
- **Bitwise operations:** `BAND`, `BOR`, `BXOR`, `BNOT` operate on 32-bit binary representations directly (`[0, 2^32)`). *Why:* Hardware stage-1 binary semantics avoid software trit-to-bit conversion.
- **Shifts:** `BSHL` (logical left), `BSHR` (unsigned logical right), and `BSAR` (signed arithmetic right, sign-extending negative `int`s) give exact C11 shift behaviour. *Why:* `BSAR` preserves sign bits for negative `int`, while `BSHR` zero-fills unsigned types.
- **32-bit Multiply & Divide:** `BMULLO` gives exact low 32 bits of 32×32 multiplication; Triton's `DIV` and `MOD` truncate toward zero on exact 27-trit integers, matching C11 §6.5.5 for both signed and unsigned 32-bit operands directly. *Why:* One instruction with no rounding discrepancy.
- **64-bit Register-Pair Arithmetic `(lo, hi)`:**
  - Add: `BADD r_lo, a_lo, b_lo` followed by `BADC r_hi, a_hi, b_hi` (hardware `CF` propagates bit-32 carry).
  - Sub: `BSUB r_lo, a_lo, b_lo` followed by `BSBC r_hi, a_hi, b_hi` (hardware `CF` propagates bit-32 borrow).
  - Mul: `BMULLO` + `BMULHI` cross-products summed with `BADD`.
  - Div/Mod/Shift: Runtime helpers (`__udivdi3`, `__umoddi3`, `__divdi3`, `__moddi3`, `__ashldi3`, `__lshrdi3`, `__ashrdi3`) compiled by `tcc5`.
  - *Why:* Matches `ISA-5.md` §1.3 and keeps register pressure low on a 9-register machine.
- **Software Floating Point:** `float` (binary32) and `double` (binary64) are computed in pure integer C runtime routines (`rt_softfp.c`) implementing IEEE 754-2008 round-to-nearest-even (ties-to-even), signed zeros, subnormals, infinities, and canonical quiet NaNs. *Why:* Triton 5 has no FPU; bit-exact software FP ensures NetBSD and IEEE conformance.

## 4. Register Usage & Calling Convention
Triton 5 provides 9 general-purpose 27-trit registers (`R0..R8`) plus a separate hardware stack pointer (`SP`) controlled exclusively by `PUSH`, `POP`, `CALL`, `CALLX`, `RET`, and `IRET`.

| Register | ABI Name | Role | Preservation |
| :--- | :--- | :--- | :--- |
| `R0` | `a0` / `v0` | Argument 0 / 32-bit return / 64-bit return `lo` / hidden `sret` ptr | Caller-saved |
| `R1` | `a1` / `v1` | Argument 1 / 64-bit return `hi` / scratch | Caller-saved |
| `R2` | `a2` | Argument 2 / scratch | Caller-saved |
| `R3` | `t0` | Scratch / indirect & far-call target (never live across CALL) | Caller-saved |
| `R4` | `s0` | General callee-saved register | Callee-saved |
| `R5` | `s1` | General callee-saved register | Callee-saved |
| `R6` | `s2` | General callee-saved register | Callee-saved |
| `R7` | `fp` | Frame pointer (C address space) | Callee-saved |
| `R8` | `csp` | C data stack pointer (C address space, grows downward) | Callee-saved |
| `SP` (hw) | `rsp` | Return-address & saved-register shadow stack (machine space) | Balanced per call |

- **Why separate `R8` (`csp`) from hardware `SP`:** Hardware `SP` cannot be indexed with `LT`/`ST` or adjusted by arbitrary frame sizes (`SUBI`), whereas `R8` supports direct base+displacement addressing, VLAs, and `alloca`; hardware `SP` becomes a clean shadow stack for `CALLX`/`RET` and `PUSH`/`POP`.
- **Argument passing:**
  - Non-variadic functions: First 4 scalar 32-bit slots pass in `R0..R3` (a 64-bit scalar takes 2 adjacent registers, or passes on the C stack if fewer than 2 remain). Any remaining arguments and **all struct/union arguments** pass on the C stack (`[CSP + 0]`, `[CSP + 4]`, ..., each 4-tryte aligned, left-to-right from low to high address).
  - Variadic functions (`...`): Fixed arguments follow the same rule, and the variadic callee prologue spills `R0..R3` into a 16-tryte register-save area immediately below `[FP + 0]` (at `[FP - 16 .. FP - 1]`), OR variadic callers pass all arguments on the C stack when calling variadic prototypes so `va_list` is a single contiguous `char *` walking upward in memory (`va_arg` advances by `align4(sizeof(T))`). Specifically, `tcc5` passes **all arguments to variadic functions on the C stack** (at `[CSP + 0], [CSP + 4], ...`), so `va_start(ap, last)` simply computes `(char *)&last + align4(sizeof(last))` with zero register-save complexity. *Why:* Eliminates register-area edge cases for mixed 64-bit/struct variadic arguments.
- **Return values:**
  - 1–4 tryte scalars (`char`, `short`, `int`, `long`, `float`, pointers): returned in `R0`.
  - 8-tryte scalars (`long long`, `double`): returned in `(R0 = lo, R1 = hi)`.
  - Structs and unions of any size: caller allocates return storage and passes its C-space pointer as an implicit hidden first argument (`sret`) in `R0` (or first stack slot for variadic); callee copies the return value into `*sret` and returns `sret` in `R0`. *Why:* Uniform across all struct sizes and prevents partial-member truncation.
- **Stack Frame Layout:**
  ```
  Higher C addresses:
    [FP + 0 .. +N]   Stack-passed arguments (arg_k at FP + offset)
  FP (== CSP on entry):
    [FP - 4 .. -L]   Local variables, arrays, compiler temporaries (4-tryte aligned)
    [CSP .. FP - L]  Dynamic VLA allocations (restored by MOV R8, R7 on epilogue)
  Lower C addresses (grows downward).
  ```
  - **Prologue:** `PUSH R7; PUSH R4; PUSH R5; PUSH R6; MOV R7, R8; SUBI R8, R8, frameSize` (only saving callee-saved registers actually used).
  - **Epilogue:** `MOV R8, R7; POP R6; POP R5; POP R4; POP R7; RET`.
- **Far & Indirect Calls:** Near direct calls within ±9,841 trytes use `CALLX rel9`. Far direct calls and function-pointer calls load machine target `A` into a scratch register `Rt` and emit the 3-instruction sequence `CALLX 2; JMPX 2; JR Rt`, pushing the return PC onto hardware `SP` while jumping to any 27-trit address.

## 5. C Pointers on a Balanced-Ternary Machine
Per `DECISION-PAGE-SIZE.md` and `ISA-5.md` §1.2, Triton 5 pages are **balanced-3⁷ = 2,187 trytes** (`B = (2187 - 1) / 2 = 1093`).

- **Biased C Address Space:** A C pointer holds `P = A + B` (`P = A + 1093`), where `A` is the Triton 5 machine address. Every memory load/store folds `-1093` into the instruction displacement (`LT/ST rd, base, (disp - 1093)`), and indirect function calls subtract `1093` from the function pointer before `JR`. *Why:* Maps C `NULL` (`P = 0`) to machine address `A = -1093` (virtual page 0, unconditionally unmapped in hardware) and puts C page `k` at `[k*2187 .. (k+1)*2187 - 1]` ↔ machine page `k` (`[k*2187 - 1093 .. k*2187 + 1093]`).
- **Negative Machine Addresses:** The 2-level balanced-3⁷ virtual address space spans `[-581,130,733 .. +581,130,733]`. Adding `B = 1093` yields `P ∈ [-581,129,640 .. +581,131,826]`, which lies strictly inside signed 32-bit `[-2^31, +2^31 - 1]`. Both positive user addresses and negative kernel addresses are represented without overflow.
- **Pointer Comparison (`<`, `<=`, `>`, `>=`, `==`, `!=`):** Performed as **signed 32-bit comparison** on C-space values `P`. *Why:* Preserves monotonic machine address order (`A1 < A2 ⇔ P1 < P2`) even when comparing across negative and positive machine addresses.
- **`ptrdiff_t` (`long`, signed 32-bit):** `p - q` computes `(P1 - P2) / sizeof(*p)` using exact signed 27-trit subtraction and truncated division. *Why:* Covers differences up to ±1.16×10⁹ trytes, exceeding the entire 2-level VA space.
- **`uintptr_t` (`unsigned long`, unsigned 32-bit):** `(uintptr_t)p` applies `WRAPU 32` (`P mod 2^32`); `(void *)u` applies `WRAPS 32` (sign-extending bit 31 back to `[-2^31, +2^31 - 1]`). *Why:* Guarantees a lossless round-trip `(void *)(uintptr_t)p == p` for every valid positive or negative Triton 5 address.
- **Flat Mode Compatibility:** With `.text` linked at C address `2187` (machine address `1094`) and boot trampoline at machine `0`, the exact same biased binary runs identically both with paging disabled (`SPR_PG_EN = 0`) and with balanced-3⁷ paging enabled (`SPR_PG_EN = 1`).

## 6. Object Format (`.t5o`) and Executable Format (`.t5x`)
Both formats are self-contained, deterministic, human-inspectable JSON/binary-serializable structures with exact tryte payloads and zero external dependencies.

### 6.1 Relocatable Object Format (`.t5o`)
```json
{
  "magic": "T5O1",
  "version": 1,
  "pageSize": 2187,
  "bias": 1093,
  "sections": {
    ".text":       { "trytes": [...], "align": 2, "flags": "AX" },
    ".rodata":     { "trytes": [...], "align": 4, "flags": "A" },
    ".data":       { "trytes": [...], "align": 4, "flags": "AW" },
    ".bss":        { "size": 0,       "align": 4, "flags": "AWN" },
    ".init_array": { "trytes": [...], "align": 4, "flags": "A" }
  },
  "symbols": [
    { "name": "foo", "section": ".text", "offset": 0, "bind": "GLOBAL|LOCAL|WEAK", "type": "FUNC|OBJECT|NOTYPE", "size": 24 }
  ],
  "relocs": [
    { "section": ".text", "offset": 4, "type": "R_T5_REL9|R_T5_ABS27_LO|R_T5_ABS27_MID|R_T5_ABS27_HI|R_T5_CADDR32|R_T5_CADDR27_LO|R_T5_CADDR27_MID|R_T5_CADDR27_HI", "symbol": "bar", "addend": 0 }
  ]
}
```
- **Relocation Types:**
  - `R_T5_REL9`: Patches `tryte1` of a 2-tryte PC-relative branch/call (`JMPX`/`CALLX`) with `(S_mach + A) - (P_mach + 2)`. Linker verifies range `[-9841, +9841]`.
  - `R_T5_ABS27_LO` / `MID` / `HI`: Patches `tryte1` of `LI` / `LMI` / `LHI` with the low/middle/high balanced tryte of machine address `S_mach + A`.
  - `R_T5_CADDR27_LO` / `MID` / `HI`: Patches `tryte1` of `LI` / `LMI` / `LHI` with the low/middle/high balanced tryte of C-space address `(S_mach + 1093) + A`.
  - `R_T5_CADDR32`: Patches 4 consecutive trytes in `.data`/`.rodata`/`.init_array` with the 4 little-endian bytes of C-space address `(S_mach + 1093) + A`.

### 6.2 Linked Executable Format (`.t5x`)
- **Section Alignment:** The linker (`t5ld`) aligns every output segment (`.text`, `.rodata`, `.data`, `.bss`) to **2,187 trytes (`3^7`)** (`DECISION-PAGE-SIZE.md`), starting `.text` at C address `2187` (machine address `1094`, physical frame 1).
- **Boot Trampoline:** Machine address `0` receives an 8-tryte boot stub (`LI R0, lo(_start); LMI R0, mid(_start); LHI R0, hi(_start); JR R0`) so `triton5.html` loads and executes the flat image via `loadProgram(image, 0)` with zero modifications to the emulator.
- **Fields:** `magic: "T5X1"`, `pageSize: 2187`, `bias: 1093`, `entryMach`, `entryC`, `sections` (with `cAddr`, `machAddr`, `size`, `pageCount`), `symbols`, `image` (flat `Int16Array`-compatible tryte array ready for `triton5.html`).
