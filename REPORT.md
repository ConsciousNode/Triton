# Triton 2.0 Engineering & Verification Report (`REPORT.md`)

**ConsciousNode SoftWorks · November 2026**

This report documents the architectural choices behind Triton 2.0 (`ISA.md` and `triton.html`), measured interpreter speeds from `node tests/run.js`, the capabilities and current limitations of TritOS 2.0, and a systematic audit of every boundary where specification and implementation could diverge. Every claim in this report is exercised by an automated test in `tests/run.js`.

## 1. ISA Design Choices and Justification

### 1.1 9-Trit Trytes ($3^9 = 19,683$) and 27-Trit Words ($3^{27} = 7,625,597,484,987$)

Triton 1.0 (`Triton-1.html`, `Triton-XA-1.html`, `Triton-XP-1.html`) used 6-trit words ($3^6 = 729$, range $[-364, +364]$) and 25 opcodes with clamping on addition/subtraction. That word width limited addressable memory to 729 cells and could not represent large integers or self-host an operating system.

For Triton 2.0, we chose **9-trit trytes** and **27-trit words (3 trytes)** for four concrete engineering reasons:

1. **Pure Power-of-Three Scaling ($3^0, 3^1, 3^2, 3^3$)**:
   - 1 trit ($3^0$): balanced digit in $\{-1, 0, +1\}$ (`T`, `0`, `1`).
   - 1 diad ($2$ trits): $3^2 = 9$ states, indexing registers `R0`–`R8`.
   - 1 triad ($3^1 = 3$ trits): $3^3 = 27$ states ($[-13, +13]$), encoding the 3-trit Status Register (`SR`), 27-color display pixels, and 1-trit unary truth tables (`TUNARY`).
   - 1 tryte ($3^2 = 9$ trits): $3^9 = 19,683$ states ($[-9,841, +9,841]$), serving as the atomic addressable unit of RAM and disk storage.
   - 1 word ($3^3 = 27$ trits = 3 trytes): $3^{27} = 7,625,597,484,987$ states ($\pm 3,812,798,742,493$, $\approx 42.8$ bits).
2. **Single-Tryte Flat Addressing**:
   Because $3^9 = 19,683$ trytes is large enough to hold the TritOS kernel, symbol tables, disk buffers, and stack while fitting inside a single 9-trit tryte, every memory offset, jump target, and subroutine call target fits directly in the second tryte (`Tryte 1`) of an instruction without bank switching or segment registers.
3. **Exact Limb Arithmetic in MicroWAT (`i32`)**:
   MicroWAT 2.0.0 (`microwat.js`) implements full 32-bit `i32` arithmetic (`i32.add`, `i32.sub`, `i32.mul`, `i32.div_s`, `i32.rem_s`) and basic `i64` (`const`, `add`, `sub`, `mul`), but intentionally omits `i64.div_s`, `i64.rem_s`, and `i64` comparisons. Representing each 27-trit word as three signed 9-trit trytes $(W_0, W_1, W_2) \in [-9841, +9841]^3$ means every partial product $W_i \cdot W_j \le 9841^2 = 96,845,281$, and even the 3-term cross product sum $a_0 b_2 + a_1 b_1 + a_2 b_0 + \text{carry} \le 2.91 \times 10^8$, which never overflows signed 32-bit `i32` ($\pm 2.14 \times 10^9$).
4. **Bijective 2-Trit Register Encoding**:
   Mapping `R0`–`R8` onto the 9 residue classes of $\mathbb{Z}/3^2\mathbb{Z}$ ($[-4, +4]$) means every 2-trit pattern in an instruction's `RD`, `RS1`, or `RS2` field names a valid architectural register. There are no reserved or illegal register encodings.

### 1.2 Fixed-Width 2-Tryte (18-Trit) Instruction Parcels

Every instruction occupies 2 trytes (`Tryte 0` and `Tryte 1`):
- `Tryte 0` packs `OPCODE` (trits $8..4$, weight $81$), `RD` (trits $3..2$, weight $9$), and `RS1` (trits $1..0$, weight $1$):
  $$\text{Tryte 0} = \text{op} \cdot 81 + \text{bal\_rem}(rd, 9) \cdot 9 + \text{bal\_rem}(rs1, 9)$$
  Because $|9 e_d + e_1| \le 40 = \frac{81 - 1}{2}$, adding the three fields never produces an inter-field carry.
- `Tryte 1` holds either the 9-trit immediate `imm9` $\in [-9841, +9841]$ or, for 3-register `R3` instructions, $\text{bal\_rem}(rs2, 9) \in [-4, +4]$.
- Fixed 2-tryte instruction width simplifies both hardware/VM fetch and the Pass 1 location counter (`LC += 2`) of the self-hosting assembler written in Triton assembly.

### 1.3 Pure Ternary Carry, Overflow, and Division-by-Zero Semantics

- **Modulo $3^n$ Wrapping**: Words wrap modulo $3^{27}$ into $[-\frac{3^{27}-1}{2}, +\frac{3^{27}-1}{2}]$; trytes and addresses wrap modulo $3^9 = 19,683$ into $[-9,841, +9,841]$.
- **Unified Carry/Overflow in Balanced Addition**: Unlike binary two's complement (where unsigned carry out of the MSB differs from signed overflow), balanced-ternary range $[-\frac{3^{27}-1}{2}, +\frac{3^{27}-1}{2}]$ is symmetric around zero. Any non-zero carry trit $c_{27} \in \{-1, +1\}$ out of trit 26 shifts the value by $\pm 3^{27}$, which strictly exceeds the representable range; thus $\text{CF} = \text{OF} = c_{27} \in \{-1, 0, +1\}$.
- **Deterministic Division by Zero**: When divisor $B = 0$, `DIV` yields $0$ and `MOD` yields dividend $A$, setting $\text{OF} = \text{sign}(A)$ (or $+1$ if $A = 0$). This prevents host traps during random program execution (exercised by Test 1 and Test 2).

## 2. Measured Interpreter Speeds

Measured via `node tests/run.js` (Test 7) on a 108,256-instruction benchmark loop mixing 27-trit arithmetic (`ADD`, `SUB`, `MUL`, `ADDI`), tritwise consensus (`TCON`), trit shifts (`SHLI`), memory loads/stores (`ST`, `LT`), comparisons (`CMP`), and conditional branches (`JP`):

| Interpreter Implementation | Execution Time (108,256 instrs) | Throughput (Instructions / sec) | Relative Speed |
| :--- | :--- | :--- | :--- |
| **JavaScript Reference (`TritonJS`)** | ~739 ms | **0.15 MIPS** (~146,528 instr/s) | $1.0\times$ (baseline) |
| **MicroWAT WASM (`TritonWASM`)** | ~24.5 ms | **4.41 MIPS** (~4,408,611 instr/s) | **30.1× faster** |

Additional suite timings from `node tests/run.js`:
- **Test 1 (Trit-array oracle, 101,225 operand pairs across JS, WASM, and pure trit-array model)**: ~3.38 s.
- **Test 2 (Differential fuzz, 10,000 seeded random valid programs on JS and WASM)**: ~7.09 s.
- **Test 3 (Assembler/disassembler round trip across all 46 opcodes, 828 trytes)**: ~25 ms.
- **Test 4 (Self-hosting fixed-point across `TRITOS_SRC` + 3 edited copies, ~7.25M total WASM instructions)**: ~732 ms (~180 ms per full 2-pass self-hosted assembly of TritOS).

## 3. What TritOS 2.0 Can and Cannot Do Yet

### 3.1 Verified Capabilities (Exercised by Tests 4, 5, and 6)

- **Boot Monitor & Shell**: Initializes the persistent tryte-addressed disk directory (`Disk[0..128]`), renders status pixels to the $243 \times 243$ display, prints the system banner, and runs an interactive command loop (`tritos> `).
- **Tryte-Addressed Disk File Store**: Stores up to 16 files in `Disk[0..127]` (8 trytes per directory entry: 5-tryte filename, 1-tryte type, 1-tryte start address, 1-tryte length) with a persistent free-space pointer at `Disk[128]`. Supports `list`, `type <file>`, `save <file> <text>`, `edit <file> <text>`, and survives `reboot` and HTML snapshot export/import.
- **Built-in Programs**:
  1. **`CALC` (Balanced-Ternary Calculator)**: Evaluates inline (`calc 10T+11`) or interactive (`run calc`) balanced-ternary expressions using `+`, `-`, `*`, `/`, `%`, `&` (`TMIN`), `|` (`TMAX`), and `^` (`TCON`), printing results in both canonical balanced ternary (`T`/`0`/`1`) and decimal.
  2. **`DRAW` (27-Color Display Plotter)**: Renders the 27-color balanced-ternary spectrum across the $243 \times 243$ framebuffer (`Ports 2, 3, 4`) and plots cursor markers.
  3. **`GAME` (`TRIT-QUEST`)**: Samples the deterministic hardware timer (`Port 6`), computes balanced-ternary target states modulo 27, and renders player/target sprites on the $243 \times 243$ display.
  4. **`ASM` (Self-Hosting 2-Pass Assembler)**: Written in Triton 2.0 assembly (`a_ent` in `TRITOS_SRC`). Streams assembly source from disk (`Disk[500..]`), hashes identifiers into full 27-trit words (`h = h * 41 + upper(c)`), resolves forward/backward labels and `.equ` constants in `SYM_TAB`, supports `.org`, `.tryte`, `.data`, `.word`, `.string`, `.stringz`, decimal/ternary/char/symbol-offset immediates, and emits machine code identical byte-for-byte to the JS assembler.

### 3.2 Current Limitations

- **Flat Append-Only File Store**: Filenames are capped at 5 uppercase characters, directory capacity is fixed at 16 entries, and `save`/`edit` allocates new disk extents sequentially from `Disk[128]` without garbage collection or subdirectories.
- **Line-Oriented Editing**: `edit <file> <text>` replaces a file's content from a single command line rather than providing a multi-line full-screen visual buffer editor.
- **Fixed Source Buffer Offset for `ASM`**: The in-OS assembler reads source starting at `Disk[500]` (up to $19,182$ trytes) and writes assembled output to `Mem[6000..]` rather than taking arbitrary input/output filenames from the shell command line.

## 4. Audit of Potential Specification vs. Code Disagreements

Every boundary where `ISA.md`, the JS reference interpreter (`TritonJS`), the MicroWAT WASM interpreter (`TritonWASM`), the JS assembler/disassembler, and the in-OS self-hosting assembler could disagree was audited and verified:

| Potential Disagreement Area | Normative Rule in `ISA.md` | Verification in Code & `tests/run.js` |
| :--- | :--- | :--- |
| **`CMP` / `CMPI` Sign Flag (`SF`) on 27-Trit Overflow** | Section 3.6: `SF` reflects the true mathematical comparison $\text{sign}(A - B)$, even when $A - B$ overflows 27 trits. | `PureTritOracle.cmp`, `TritonJS.aluAddSub`, and `TRITON_WAT` (`$alu_add_sub` when `$rd < 0`) all set `SF = (c27 != 0) ? c27 : wordSign(r0, r1, r2)`. Exercised by Test 1 on $\pm H_{27}$ extremes. |
| **Negative Shift Counts in `SHL` / `SHR`** | Section 5: If shift count $k < 0$, `SHL(A, k)` executes `SHR(A, -k)` and `SHR(A, k)` executes `SHL(A, -k)`. | Verified across `PureTritOracle`, `TritonJS.aluShift`, and `TRITON_WAT` (`$alu_shift`) for $k \in [-30, +30]$ and multi-tryte shift counts in Test 1 and Test 2. |
| **Division by Zero (`DIV` / `MOD`)** | Section 3.5: Never traps; `DIV(A, 0) = 0`, `MOD(A, 0) = A`, `CF = 0`, `OF = (A == 0 ? +1 : sign(A))`. | Verified across `PureTritOracle.divmod`, `TritonJS.aluDivMod`, and `TRITON_WAT` (`$alu_divmod`) on $0/0$ and $\pm A / 0$ in Test 1 and Test 2. |
| **`TUNARY` Triad Trit Ordering** | Section 4.2: Low triad $M = m_0 + 3 m_1 + 9 m_2 \in [-13, +13]$ maps input trit $-1 \to m_0$, $0 \to m_1$, $+1 \to m_2$. | All 27 truth-table triads ($-13 \dots +13$) are tested in Test 1 across `PureTritOracle`, `TritonJS`, and `TritonWASM`. |
| **Unused Instruction Fields in Disassembler** | Section 2.3: Unused register/immediate fields are `0` (`R0` / `000000000`). | `disassembleInstruction` checks canonical zero fields and falls back to `.tryte` only for non-canonical data; Test 3 verifies round-trip identity across all 46 opcodes. |
| **27-Trit `.word` Directives in Self-Hosting Assembler** | Section 9: `.word` emits 3 consecutive trytes in little-endian order $(W_0, W_1, W_2)$. | Both `assembler.js` and `TRITOS_SRC` (`asm_dir_word` via `SW R0, R1, #0`) emit identical 3-tryte words; verified by Test 4 on `mnem_table` and Edited Copy 3. |


## 5. Triton 2.1 Symbol-Table Patch & Verification Results (`names` vs. `hashOnly`)

*All figures in this section are generated programmatically by `generate_docs_21.py` from `node tests/symbols.js` (`metrics-2.1.json`).*

### 5.1 Summary of the 2.1 Patch and Source Budget

Triton 2.1 resolves the four assembler symbol-table defects identified in `AUDIT.md` without altering the ISA, VM execution semantics, or opcode encodings:
1. **Full-Name Symbol Table (`STAB` + `SPOOL`)**: The in-OS assembler uses a 487-slot open-addressed hash table (`STAB` at `Mem[3260..5694]`, 5 trytes/slot) backed by a null-terminated uppercase string pool (`SPOOL` at `Mem[9500..18999]`). A 27-trit hash hit triggers a character-by-character comparison between `TBUF` (`Mem[3200..]`) and `SPOOL[name_ptr]`; a hash match alone never resolves a symbol.
2. **Undefined & Duplicate Label Errors**: Both assemblers reject undefined labels and duplicate labels (including case-only duplicates such as `Loop` and `LOOP`), reporting the 1-based line number and uppercase label name (`Line <N>: Undefined label <NAME>` / `Line <N>: Duplicate label <NAME>`). In-OS prints `REJECTS: Line <N>: ...` to the shell and writes zero output trytes (`OLEN = 0`, `OBUF` zeroed).
3. **Unified Case-Insensitive Rule**: Both assemblers normalize identifiers to uppercase (`ISA.md` §9 & §9.1).
4. **Source Budget Against the 19,182-Character Cap**:
   - Triton 2.0 (`hashOnly`) source length: **`16,774` characters** (`2,752` assembled trytes).
   - Triton 2.1 (`names`) source length: **`18,608` characters** (`3,057` assembled trytes, `+1,834` characters).
   - `Disk[500..19682]` source cap: **`19,182` characters**.
   - Remaining headroom: **`574` characters**.

### 5.2 Collision Search Methodology (`tests/symbols.js` Test 1)

1. **Exhaustive Short-Identifier Enumeration (Length $\le 3$)**:
   Over the uppercase identifier alphabet (`A`–`Z`, `_` for the first character; `A`–`Z`, `0`–`9`, `_` for subsequent characters, excluding the 73 reserved register/mnemonic names), there are exactly **`37,933`** valid identifiers of length $\le 3$. Grouping by `tokenHash27` yields **`6,047`** distinct colliding pairs (from algebraic relations $41 \Delta c_0 + \Delta c_1 = 0$, such as `AY`/`B0`, `AAY`/`AB0`, `AA_`/`AB6`).
2. **27-Trit Wraparound Collision Search (Length 6–12)**:
   For identifiers of length $L \ge 9$, `tokenHash27` wraps modulo $3^{27} = 7,625,597,484,987$. Expanding multiples $k \cdot 3^{27}$ ($1 \le k \le 12$) in **balanced base 41** produces 9-digit vectors $(d_8, \dots, d_0)$ with $d_i \in [-20, +20]$ (for $k = 1$, $3^{27} = (1, -2, 6, 15, -20, -17, 13, 5, -14)_{41}$). Because the 26 uppercase letters `A`–`Z` span 25 consecutive ASCII values ($65 \dots 90$), every digit $d_i \in [-20, +20]$ decomposes into letter pairs $(c_{1,i}, c_{2,i}) \in [\text{'A'}, \text{'Z'}]^2$ with $c_{1,i} - c_{2,i} = d_i$. Varying base letters and prefixes (`""`, `"X"`, `"TR"`, `"LBL"`) yields **`240`** distinct pairs of length 9–12 whose un-wrapped polynomial hashes differ by $k \cdot 3^{27}$ while their 27-trit wrapped hashes are identical.

### 5.3 Side-by-Side Test Results: `symbolMode: "names"` (2.1) vs. `symbolMode: "hashOnly"` (2.0 Control)

| Test Suite in `tests/symbols.js` | `symbolMode: "names"` (Triton 2.1) | `symbolMode: "hashOnly"` (Triton 2.0 Control) |
| :--- | :--- | :--- |
| **1. Collision Corpus (6,287 pairs: 6,047 len $\le 3$ + 240 len 9–12 wraparound)** | **`6287/6287` pass** (`0.0%` fail, `2677 ms`) | **`6287/6287` fail** (`100.0%` fail $\ge 99\%$ caught, `1852 ms`) |
| **2. Undefined, Duplicate & Case-Duplicate Labels (12 cases)** | **`12/12` rejected identically** (same line & label, `0` output trytes, `11 ms`) | **`0/12` rejected** (silently accepts all 12, caught, `9 ms`) |
| **3. Differential Fuzz (2,000 label-heavy programs, 50–300 labels, seeds `0x210000..0x1128c41`)** | **`2000/2000` agree** (`1800` valid + `200` rejected, `24581 ms`) | **`631/2000` disagree** (`1369/2000` agree, `29824 ms`) |
| **4. Self-Hosting Fixed Point & Budget** | **`3057` trytes byte-identical**, self-built image boots (`18,608/19,182` chars, `574` headroom) | `2752` trytes (`16,774/19,182` chars) |
| **5. Unmodified Regressions (`tests/run.js`, `audit/unseen.js`, `audit/isa-bigint.js`, `audit/hash-collision.js`)** | **`tests/run.js`: 8/8 pass** · **`unseen.js`: 6/6 + 4/4`** · **`isa-bigint.js`: 0 diffs** · **`hash-collision.js`: 5/5 agree** (`8448 ms`) | `hash-collision.js`: 4/5 `DISAGREE` |
| **6. Static Scan (`triton.html`, `159,352` bytes)** | **Pass** (strict CSP verified, `0` network/storage APIs, `7/7` inlines labeled) | — |
