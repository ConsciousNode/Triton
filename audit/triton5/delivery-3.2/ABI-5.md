# Triton 5.0 C ABI, Object & Executable Specification (`ABI-5.md`)

**ConsciousNode SoftWorks · Normative ABI Specification (Triton 5 Stage 3.1)**
**License:** MIT · **Target Architecture:** Triton 5.0 (`ISA-5.md`, balanced-3⁷ 2,187-tryte pages)

## 1. Compiler Name: `tcc5`
- **Name:** `tcc5` (*Triton C Compiler for Architecture 5*).
- **Why:** Follows the studio's architecture-versioned naming (`triton5.html`, `ISA-5.md`, `ABI-5.md`), distinguishing the Triton 5 C11 compiler from earlier Triton assemblers and host compilers.

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

- **Why `CHAR_BIT = 8` and 1 C byte = 1 tryte:** ISO C11 requires `sizeof(char) == 1` and exact-width `<stdint.h>` types (`int8_t`..`uint64_t`) with zero padding bits; storing 1 unsigned byte (`0..255`) per tryte makes `memcpy`, `union` type-punning, IEEE 754 bit patterns, and NetBSD struct layouts byte-for-byte exact.
- **Why ILP32 (`int = long = pointer = 4` trytes):** Every 32-bit integer and the entire 2-level balanced-3⁷ virtual address space (`±581,130,733`) fits in a single 27-trit register without register-pair splitting.
- **Why plain `char` is signed:** Matches x86-64/NetBSD convention and aligns with host GCC `-fsigned-char`.
- **Standard typedefs:** `size_t = unsigned long`, `ptrdiff_t = long`, `intptr_t = long`, `uintptr_t = unsigned long`, `wchar_t = int`, `intmax_t = long long`, `uintmax_t = unsigned long long`.

### 2.1 Central ABI Tension, Worked `memcpy` Example & Byte-Per-Tryte Cost Analysis
Triton 5's native memory word (`LW`/`SW`) is **3 trytes** (27 balanced trits, base 19,683), whereas ISO C11 requires that any object of size `N` can be copied byte-by-byte through `unsigned char *` (`memcpy`), and with `CHAR_BIT = 8` a 32-bit `int` requires **4 bytes** (`4 × 8 = 32` bits; 3 bytes would only hold 24 bits).

- **Worked Example (`memcpy` of a negative `int` into 4 bytes):**
  ```c
  int x = -123456;         /* 32-bit two's complement: 0xFFFE1DC0 */
  unsigned char b[4];
  memcpy(b, &x, 4);
  ```
  - **In a register:** `x` is held as the exact 27-trit signed integer `-123,456` (canonical `[-2^31, 2^31 - 1]`).
  - **In memory (4 consecutive trytes at C addresses `P .. P+3`, machine addresses `A .. A+3` where `A = P - 1093`):**
    - Tryte `A+0`: balanced-ternary value **`+192`** (`0xC0`) → `b[0]` reads back as **`192`** (`0xC0`).
    - Tryte `A+1`: balanced-ternary value **`+29`** (`0x1D`) → `b[1]` reads back as **`29`** (`0x1D`).
    - Tryte `A+2`: balanced-ternary value **`+254`** (`0xFE`) → `b[2]` reads back as **`254`** (`0xFE`).
    - Tryte `A+3`: balanced-ternary value **`+255`** (`0xFF`) → `b[3]` reads back as **`255`** (`0xFF`).
  - Every tryte stores an unsigned value in `[0, 255]` (using 256 of the tryte's 19,683 states). `memcpy` copies those 4 trytes verbatim via `BCOPY`, and reading `x` back reconstructs `(((255*256 + 254)*256 + 29)*256 + 192) = 0xFFFE1DC0`, then `WRAPS 32` recovers `-123,456`.
- **Measured Cost of Byte-Per-Tryte Loads & Stores:**
  - **32-bit `int` store:** `13` instructions (`26` trytes of code: 4 `ST` byte stores + 3 `LI` + 3 `BSHR` + 3 `WRAPU`).
  - **32-bit `int` load:** `11` instructions (`22` trytes of code: 4 `LT` byte loads + 3 `MULI 256` + 3 `ADD` + 1 `WRAPS 32`/`WRAPU 32`).
  - **Impact on code size, speed, alignment, and DMA:** Multi-byte scalar loads/stores expand code size by ~10× per memory op compared to a single-instruction word load/store and dominate dynamic instruction count (`TritonBench-5K`: `467,205` trytes image, `1,040,095` steps). Alignment has zero hardware fault penalty on tryte accesses (packed structs crossing 3-tryte word boundaries work identically to aligned structs). Disk DMA (`DISK_DMA_ADDR`, 729 trytes/sector) transfers trytes 1:1, so each 729-tryte disk sector holds 729 raw C bytes without repacking.
- **What It Would Take to Store a Whole Word Without Breaking `memcpy`:**
  - Storing an `int` via a single native 3-tryte `SW` (`base 19,683`) breaks `memcpy` unless either:
    1. **ISA extension (preserves `CHAR_BIT = 8` & `memcpy`):** Add two 1-instruction binary load/store opcodes (`LD32B rd, rs1, imm9` and `ST32B rd, rs1, imm9`) that read/write 4 consecutive trytes in `[0..255]` little-endian format in hardware — cutting 32-bit load/store from 11–13 instructions to **1 instruction** with zero change to C semantics or `memcpy`.
    2. **Sub-tryte / non-8-bit byte ABI (`CHAR_BIT = 9` or `CHAR_BIT = 16`):** Would allow 3-tryte words to be copied by tryte, but violates `CHAR_BIT = 8` and breaks POSIX/NetBSD assumptions (`uint8_t`, network packets, binary file formats).

## 3. Exact Binary Arithmetic & IEEE 754 Canonical NaN
Because 27 balanced trits hold `[-3,812,798,742,493, +3,812,798,742,493]`, every 32-bit signed (`[-2^31, 2^31)`) and unsigned (`[0, 2^32)`) integer is represented exactly in one register without ternary overflow.

- **Wrapping:** Unsigned `N`-bit ops finish with `WRAPU rd, rd, N` (`mod 2^N`); signed conversions/ops wrap via `WRAPS rd, rd, N` (`[-2^(N-1), 2^(N-1))`).
- **Bitwise & Shifts:** `BAND`, `BOR`, `BXOR`, `BNOT`, `BSHL`, `BSHR` (unsigned logical right), `BSAR` (signed arithmetic right).
- **32-bit Mul/Div/Mod:** `BMULLO` for 32-bit multiply; `DIV`/`MOD` truncate toward zero directly on 27-trit integers.
- **64-bit Register-Pair `(lo, hi)`:** `BADD`/`BADC`, `BSUB`/`BSBC`, `BMULLO`/`BMULHI` inline; shifts and div/mod via `runtime/rt_int64.c`.
- **Software Floating Point (`runtime/rt_softfp.c`):** Bit-exact IEEE 754 binary32 (`float`) and binary64 (`double`) with round-to-nearest-even (ties-to-even).
  - **Canonical Quiet NaN:** Generated invalid operations (`0/0`, `∞ - ∞`, `0 * ∞`) produce canonical quiet NaN **`0x7FC00000U`** (`float`) and **`0x7FF8000000000000ULL`** (`double`). Propagated NaNs set the quiet bit (`| 0x00400000U` / `| 0x0008000000000000ULL`).

## 4. Register Usage & Calling Convention
Triton 5 provides 9 general-purpose 27-trit registers (`R0..R8`) plus a separate hardware stack pointer (`SP`) controlled by `PUSH`, `POP`, `CALL`, `CALLX`, `RET`, and `IRET`.

| Register | ABI Name | Role | Preservation |
| :--- | :--- | :--- | :--- |
| `R0` | `a0` / `v0` | Argument 0 / 32-bit return / 64-bit return `lo` / hidden `sret` ptr | Caller-saved |
| `R1` | `a1` / `v1` | Argument 1 / 64-bit return `hi` / scratch | Caller-saved |
| `R2` | `a2` | Argument 2 / scratch | Caller-saved |
| `R3` | `t0` | Scratch / indirect & far-call target (never live across `CALL`) | Caller-saved |
| `R4` | `s0` | General callee-saved register | Callee-saved |
| `R5` | `s1` | General callee-saved register | Callee-saved |
| `R6` | `s2` | General callee-saved register | Callee-saved |
| `R7` | `fp` | Frame pointer (C address space) | Callee-saved |
| `R8` | `csp` | C data stack pointer (C address space, grows downward) | Callee-saved |
| `SP` (hw) | `rsp` | Return-address & saved-register shadow stack (machine space, relocated to `4,000,000` by `crt0.s`) | Balanced per call |

- **Argument passing:**
  - Non-variadic functions: First **3** scalar 32-bit argument slots pass in **`R0..R2`** (`R3` is reserved for scratch and far/indirect call targets). A 64-bit scalar takes 2 adjacent registers (`(R0, R1)` or `(R1, R2)`), or passes on the C stack if fewer than 2 remain. Remaining arguments and **all struct/union arguments** pass on the C stack (`[CSP + 0]`, `[CSP + 4]`, ..., 4-tryte aligned).
  - Variadic functions (`...`): **All** arguments (including fixed arguments and `sret` if returning a struct) pass contiguously on the C stack (`[CSP + 0]`, `[CSP + 4]`, ..., 4-tryte aligned) with C11 default argument promotions (`char`/`short`/`_Bool` → `int`, `float` → `double`). `__builtin_va_start(ap, last)` sets `ap = (char *)&last + align4(sizeof(last))`.
- **Return values:** 1–4 tryte scalars in `R0`; 8-tryte scalars in `(R0 = lo, R1 = hi)`; structs/unions via hidden `sret` pointer passed in `R0` (or `[CSP + 0]` for variadic), with callee copying into `*sret` and returning `sret` in `R0`.
- **Stack frame:** `PUSH R7; MOV R7, R8; SUBI R8, R8, frameSize` (prologue); `MOV R8, R7; POP R7; RET` (epilogue, automatically freeing locals, VLAs, and `__builtin_alloca`).
- **Far & indirect calls:** Load machine target into `R3` and execute `CALLX 2; JMPX 2; JR R3`.

## 5. C Pointers on a Balanced-Ternary Machine
- **Biased C Address Space:** `P = A + 1093` (`B = (2187 - 1)/2`). `NULL` (`P = 0`) maps to machine `A = -1093` (unmapped virtual page 0). Every load/store folds `-1093` into the displacement; indirect jumps subtract `1093`.
- **Negative Machine Addresses:** The 2-level balanced-3⁷ VA space `[-581,130,733 .. +581,130,733]` maps to `P ∈ [-581,129,640 .. +581,131,826]`, strictly inside signed 32-bit `[-2^31, +2^31 - 1]`.
- **Pointer comparison (`<`, `<=`, `>`, `>=`):** Signed 32-bit comparison on `P`, preserving monotonic machine address order (`A1 < A2 ⇔ P1 < P2`) even across address zero.
- **`ptrdiff_t` (`long`, signed 32-bit):** `(P1 - P2) / sizeof(*p)`.
- **`uintptr_t` (`unsigned long`, unsigned 32-bit):** `(uintptr_t)p` applies `WRAPU 32`; `(void *)u` applies `WRAPS 32`, giving a lossless round-trip for every valid positive or negative Triton 5 address.

## 6. Object Format (`.t5o`) & Executable Format (`.t5x`)
- **`.t5o` (`magic: "T5O1"`):** Sections (`.text`, `.rodata`, `.init_array`, `.data`, `.bss`, custom), `GLOBAL`/`WEAK`/`LOCAL` symbols, and 8 relocation types (`R_T5_REL9`, `R_T5_ABS27_LO/MID/HI`, `R_T5_CADDR27_LO/MID/HI`, `R_T5_CADDR32`).
- **`.t5x` (`magic: "T5X1"`):** Linker aligns every segment to **2,187 trytes (`3^7`)**, starts `.text` at C address `2187` (machine `1094`), defines `__bss_start`/`__bss_end`/`__init_array_start`/`__init_array_end`/`_end`/`__stack_top`, and places an 8-tryte boot trampoline at machine `0` jumping to `_start`.
