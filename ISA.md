# Triton 2.0 Instruction Set Architecture (`ISA.md`)
**ConsciousNode SoftWorks · Normative Architecture Specification (Version 2.0)**
Triton 2.0 is a pure balanced-ternary computer architecture. Every datum, address, register index, status flag, pixel color, and instruction field is defined natively over balanced-ternary rings $\mathbb{Z}/3^n\mathbb{Z}$ using trits $t \in \{-1, 0, +1\}$, written canonically as `T` ($-1$), `0` ($0$), and `1` ($+1$). No binary (`2^n`) semantics exist anywhere in the architecture.
## 1. Fundamental Data Types & Word Size Justification
### 1.1 Hierarchy of Ternary Units
| Unit | Width (Trits) | Cardinality ($3^n$) | Balanced Range $[-\frac{3^n-1}{2}, +\frac{3^n-1}{2}]$ | Architectural Role |
| :--- | :--- | :--- | :--- | :--- |
| **Trit** | $1 = 3^0$ | $3$ | $[-1, +1]$ (`T`, `0`, `1`) | Atomic ternary digit; individual status flag |
| **Diad** | $2$ | $9$ | $[-4, +4]$ (`TT` .. `11`) | Register specifier (`R0`–`R8`, bijection onto $\mathbb{Z}/3^2\mathbb{Z}$) |
| **Triad** | $3 = 3^1$ | $27$ | $[-13, +13]$ (`TTT` .. `111`) | Status register (`SR`), 27-color pixel, unary truth table |
| **Tryte** | $9 = 3^2$ | $19,683$ | $[-9,841, +9,841]$ | Addressable memory/disk unit, `PC`, `SP`, immediate operand |
| **Parcel** | $18 = 2 \times 9$ | $387,420,489$ | $[-193,710,244, +193,710,244]$ | Fixed-width 2-tryte instruction parcel |
| **Word** | $27 = 3^3$ | $7,625,597,484,987$ | $[-3,812,798,742,493, +3,812,798,742,493]$ | General-purpose register width and native ALU operand |
### 1.2 Why 9-Trit Trytes and 27-Trit Words?
1. **Powers-of-Three Self-Similarity ($3^0, 3^1, 3^2, 3^3$)**: Triton-1 used 6-trit words ($3^6 = 729$, range $[-364, +364]$), which could neither address a non-trivial operating system nor perform large integer arithmetic without multi-word software routines. Choosing **9-trit trytes** ($3^2$ trits) and **27-trit words** ($3^3$ trits = 3 trytes) makes every structural width a power of 3.
2. **Unified Address Space in a Single Tryte**: One 9-trit tryte addresses $3^9 = 19,683$ trytes of RAM and $19,683$ trytes of persistent disk storage. Because a single tryte holds a full memory address, every branch target, subroutine address, and immediate offset fits into the second tryte (`Tryte 1`) of a 2-tryte instruction parcel without page tables or segment registers.
3. **42.8-Bit Dynamic Range**: A 27-trit word spans $\pm 3.81 \times 10^{12}$ ($3^{27} \approx 2^{42.8}$), exceeding 32-bit binary machines by more than three orders of magnitude while decomposing into three 9-trit trytes ($W_0, W_1, W_2 \in [-9841, +9841]$) whose pairwise products ($9841^2 = 96,845,281$) never overflow 32-bit signed host integers in limb arithmetic.
4. **Display & Peripherals Alignment**: The $243 \times 243$ display has dimension $243 = 3^5$ ($59,049 = 3^{10}$ pixels), with 3-trit ($27$-color) pixels. Three pixels pack into one 9-trit tryte, and nine pixels pack into one 27-trit word.
### 1.3 Balanced-Ternary Value & Modular Wrapping
A $k$-trit vector $\mathbf{t} = (t_{k-1}, \dots, t_1, t_0)$ with $t_i \in \{-1, 0, +1\}$ has integer value:
$$\text{val}(\mathbf{t}) = \sum_{i=0}^{k-1} t_i \cdot 3^i$$
For any integer $x \in \mathbb{Z}$ and modulus $M = 3^k$ with half-range $H = \frac{3^k - 1}{2}$, the **canonical balanced remainder** $\text{bal\_rem}(x, 3^k) \in [-H, +H]$ and **balanced quotient (carry)** $\text{bal\_quot}(x, 3^k) \in \mathbb{Z}$ are the unique integers satisfying:
$$x = \text{bal\_quot}(x, 3^k) \cdot 3^k + \text{bal\_rem}(x, 3^k), \qquad -\frac{3^k - 1}{2} \le \text{bal\_rem}(x, 3^k) \le +\frac{3^k - 1}{2}$$
All 27-trit word operations wrap via $x \bmod_{\text{bal}} 3^{27} = \text{bal\_rem}(x, 3^{27})$. All 9-trit tryte operations wrap via $x \bmod_{\text{bal}} 3^9 = \text{bal\_rem}(x, 19683)$.
## 2. Registers, Memory Addressing & Instruction Format
### 2.1 Architectural Registers
- **`R0` – `R8` (Nine 27-Trit General-Purpose Registers)**:
  Each register holds a 27-trit word $(t_{26}, \dots, t_0)$, equivalently represented as three 9-trit trytes $(W_0, W_1, W_2)$ in little-endian tryte order:
  $$R[r] = W_0 + 19683 \cdot W_1 + 387420489 \cdot W_2, \qquad W_0, W_1, W_2 \in [-9841, +9841]$$
  In instruction fields, register index $r \in \{0, 1, \dots, 8\}$ is encoded as a 2-trit balanced diad $e = \text{bal\_rem}(r, 9) \in [-4, +4]$, and decoded via $r = ((e \bmod 9) + 9) \bmod 9$:
  | Register | Index $r$ | Balanced Diad $e$ | Trit Pattern ($t_1 t_0$) |
  | :--- | :--- | :--- | :--- |
  | `R0` | `0` | `0` | `00` |
  | `R1` | `1` | `+1` | `01` |
  | `R2` | `2` | `+2` | `1T` |
  | `R3` | `3` | `+3` | `10` |
  | `R4` | `4` | `+4` | `11` |
  | `R5` | `5` | `-4` | `TT` |
  | `R6` | `6` | `-3` | `T0` |
  | `R7` | `7` | `-2` | `T1` |
  | `R8` | `8` | `-1` | `0T` |
- **`PC` (Program Counter, 9-Trit Tryte)**: Holds the tryte address of the next instruction. Initialized to `0` (`000000000`) on reset.
- **`SP` (Stack Pointer, 9-Trit Tryte)**: Holds the tryte address of the top of the stack. Initialized to `-1` (`00000000T`, physical tryte `19682`) on reset; grows downward toward `0`.
- **`SR` (Status Register, 3-Trit Triad)**:
  $$\text{SR} = \text{SF} + 3 \cdot \text{CF} + 9 \cdot \text{OF} \in [-13, +13]$$
  - **Trit 0 (`SF`, Sign Flag)**: $\text{sign}(\text{result}) \in \{\text{`T` } (-1),\ \text{`0` } (0),\ \text{`1` } (+1)\}$.
  - **Trit 1 (`CF`, Ternary Carry Flag)**: Carry/borrow trit $\in \{\text{`T` } (-1),\ \text{`0` } (0),\ \text{`1` } (+1)\}$ shifted or carried out of the word boundary.
  - **Trit 2 (`OF`, Ternary Overflow Flag)**: Ternary overflow direction $\in \{\text{`T` } (-1),\ \text{`0` } (0),\ \text{`1` } (+1)\}$ when the true mathematical result exceeds $[-\frac{3^{27}-1}{2}, +\frac{3^{27}-1}{2}]$.
### 2.2 Tryte-Addressed Memory Space ($\mathbb{Z}/3^9\mathbb{Z}$)
Main memory consists of $3^9 = 19,683$ trytes. Every 9-trit tryte address $A \in [-9841, +9841]$ maps to its canonical residue index in $[0, 19682]$ via:
$$\text{phys}(A) = ((A \bmod 19683) + 19683) \bmod 19683$$
- **Tryte Load/Store (`LT`, `ST`)**: Accesses the single 9-trit tryte at $\text{phys}(R[rs1]_0 + \text{imm9})$. `LT` sign-extends (in balanced ternary, padding high trits $t_9 \dots t_{26}$ with `0`) the 9-trit tryte into a 27-trit register. `ST` writes the low tryte $W_0$ of the source register to memory.
- **Word Load/Store (`LW`, `SW`)**: Accesses 3 consecutive trytes in little-endian tryte order at $\text{phys}(A)$, $\text{phys}(A + 1)$, and $\text{phys}(A + 2)$ corresponding to $(W_0, W_1, W_2)$.
### 2.3 Fixed-Width 2-Tryte (18-Trit) Instruction Encoding
Every instruction occupies **2 consecutive trytes** (18 trits) at `Mem[PC]` (`Tryte 0`) and `Mem[PC + 1]` (`Tryte 1`), advancing `PC` by $+2 \pmod{19683}$ before execution:
```
Tryte 0 (Control Tryte, 9 trits: t8 t7 t6 t5 t4 | t3 t2 | t1 t0):
+-------------------------------+---------------+---------------+
|       OPCODE (5 trits)        |  RD (2 trits) | RS1 (2 trits) |
|    t8  t7  t6  t5  t4         |    t3   t2    |    t1   t0    |
|   weight 3^4 = 81, [-121,121] | weight 9, e_d | weight 1, e_1 |
+-------------------------------+---------------+---------------+
Tryte 1 (Operand Tryte, 9 trits: t8 t7 t6 t5 t4 t3 t2 t1 t0):
- I/M/B/J/IO-type: Full 9-trit balanced immediate IMM9 in [-9841, +9841]
- R-type:          0000000 | RS2 (2 trits: t1 t0 = e_2 in [-4, +4])
```
Mathematically, because $e_d, e_1 \in [-4, +4]$ and $|9 e_d + e_1| \le 40 = \frac{81 - 1}{2}$, `Tryte 0` is formed with **zero inter-field carry**:
$$\text{Tryte 0} = \text{op} \cdot 81 + \text{bal\_rem}(rd, 9) \cdot 9 + \text{bal\_rem}(rs1, 9)$$
Decoding `Tryte 0` extracts fields purely via balanced division by $9 = 3^2$:
1. $e_1 = \text{bal\_rem}(\text{Tryte 0}, 9)$, $q_1 = \text{bal\_quot}(\text{Tryte 0}, 9)$, $rs1 = ((e_1 \bmod 9) + 9) \bmod 9$.
2. $e_d = \text{bal\_rem}(q_1, 9)$, $\text{op} = \text{bal\_quot}(q_1, 9)$, $rd = ((e_d \bmod 9) + 9) \bmod 9$.
3. For R-type instructions, $e_2 = \text{bal\_rem}(\text{Tryte 1}, 9)$ and $rs2 = ((e_2 \bmod 9) + 9) \bmod 9$.
Unused register fields (`RD`, `RS1`, or `RS2`) and unused immediate fields are encoded as `0` (`R0` / `000000000`). If an unallocated opcode is fetched, the machine sets `Halted = 1`.
## 3. Arithmetic Semantics (Pure Balanced Ternary)
Let $M_{27} = 3^{27} = 7,625,597,484,987$ and $H_{27} = \frac{3^{27}-1}{2} = 3,812,798,742,493$.
1. **Addition (`ADD`, `ADDI`, `ADC`)**:
   - Let $S = A + B + c_{\text{in}}$, where $c_{\text{in}} = 0$ for `ADD`/`ADDI` and $c_{\text{in}} = \text{CF} \in \{-1, 0, +1\}$ for `ADC`.
   - In a 27-stage balanced-ternary full adder, at each trit $i \in \{0 \dots 26\}$:
     $$s_i = a_i + b_i + c_i \in [-3, +3], \qquad r_i = \text{bal\_rem}(s_i, 3) \in \{-1, 0, +1\}, \qquad c_{i+1} = \text{bal\_quot}(s_i, 3) \in \{-1, 0, +1\}$$
   - Wrapped result: $R[rd] = \text{bal\_rem}(S, 3^{27})$.
   - Carry & Overflow: $\text{CF} = c_{27} = \text{bal\_quot}(S, 3^{27}) \in \{-1, 0, +1\}$, $\text{OF} = \text{CF}$, $\text{SF} = \text{sign}(R[rd])$.
2. **Subtraction (`SUB`, `SUBI`, `SBC`)**:
   - Defined identically as ternary addition of the negated subtrahend: $S = A + (-B) + c_{\text{in}}$, where $c_{\text{in}} = 0$ for `SUB`/`SUBI` and $c_{\text{in}} = \text{CF}$ for `SBC`.
   - $R[rd] = \text{bal\_rem}(S, 3^{27})$, $\text{CF} = \text{bal\_quot}(S, 3^{27}) \in \{-1, 0, +1\}$, $\text{OF} = \text{CF}$, $\text{SF} = \text{sign}(R[rd])$.
3. **Negation (`NEG`)**:
   - Flips every trit of $A$: $t'_i = -t_i$ for $i = 0 \dots 26$, so $R[rd] = -A$.
   - Because $[-H_{27}, +H_{27}]$ is symmetric around zero, negation never overflows: $\text{CF} = 0$, $\text{OF} = 0$, $\text{SF} = -\text{sign}(A)$.
4. **Multiplication (`MUL`, `MULI`)**:
   - Computes the exact 54-trit product $P = A \times B = P_{\text{hi}} \cdot 3^{27} + P_{\text{lo}}$ with $P_{\text{lo}} = \text{bal\_rem}(P, 3^{27}) \in [-H_{27}, +H_{27}]$ and $P_{\text{hi}} = \text{bal\_quot}(P, 3^{27}) \in [-H_{27}, +H_{27}]$.
   - $R[rd] = P_{\text{lo}}$, $\text{SF} = \text{sign}(P_{\text{lo}})$, $\text{CF} = \text{sign}(P_{\text{hi}}) \in \{-1, 0, +1\}$, $\text{OF} = \text{sign}(P_{\text{hi}}) \in \{-1, 0, +1\}$.
5. **Division and Remainder (`DIV`, `MOD`)**:
   - Symmetric truncated-toward-zero ternary division: for $B \ne 0$, $Q = \text{trunc}(A / B)$ and $R_{\text{rem}} = A - Q \cdot B$, satisfying $\text{sign}(Q) = \text{sign}(A) \cdot \text{sign}(B)$ (when $Q \ne 0$) and $|R_{\text{rem}}| < |B|$ with $\text{sign}(R_{\text{rem}}) = \text{sign}(A)$ (when $R_{\text{rem}} \ne 0$).
   - For $B \ne 0$: $\text{CF} = 0$, $\text{OF} = 0$, $\text{SF} = \text{sign}(R[rd])$.
   - **Division by Zero ($B = 0$)**: Deterministically handled without trapping:
     - `DIV`: $R[rd] = 0$, $\text{SF} = 0$, $\text{CF} = 0$, $\text{OF} = (A = 0 \ ?\ +1 : \text{sign}(A))$.
     - `MOD`: $R[rd] = A$, $\text{SF} = \text{sign}(A)$, $\text{CF} = 0$, $\text{OF} = (A = 0 \ ?\ +1 : \text{sign}(A))$.
6. **Comparison (`CMP`, `CMPI`)**:
   - Evaluates $D = A - B$ without modifying any general-purpose register:
     - $\text{SF} = \text{sign}(A - B) \in \{-1, 0, +1\}$ (the **true mathematical comparison** of $A$ and $B$: `T` if $A < B$, `0` if $A = B$, `1` if $A > B$).
     - $\text{CF} = \text{bal\_quot}(A - B, 3^{27})$, $\text{OF} = \text{CF}$.
## 4. Tritwise Logic & Full 1-Trit Unary Operations
All tritwise operations set $\text{SF} = \text{sign}(R[rd])$, $\text{CF} = 0$, and $\text{OF} = 0$.
### 4.1 Binary Two-Input Tritwise Operations ($i = 0 \dots 26$)
| Mnemonic | Name | Definition per Trit $t_i(rd)$ | Truth Table $(a_i, b_i) \in \{T, 0, 1\}^2$ |
| :--- | :--- | :--- | :--- |
| `TMIN` (`AND`) | Ternary Minimum (Kleene AND) | $\min(a_i, b_i)$ | `T` if either is `T`; `1` iff both `1`; else `0` |
| `TMAX` (`OR`) | Ternary Maximum (Kleene OR) | $\max(a_i, b_i)$ | `1` if either is `1`; `T` iff both `T`; else `0` |
| `TCON` (`CON`) | Consensus | $a_i$ if $a_i = b_i$, else $0$ | `1` iff both `1`; `T` iff both `T`; else `0` |
| `TANY` (`ANY`) | Accept-Anything (Gullibility) | $\text{sign}(a_i + b_i)$ | Takes non-zero trit if one is `0`; cancels `1`/`T` to `0` |
| `TXOR` (`XOR`) | Ternary Sum Modulo 3 | $\text{bal\_rem}(a_i + b_i, 3)$ | Cyclic shift in $\text{GF}(3)$ without carry |
### 4.2 Full Set of $3^3 = 27$ Unary 1-Trit Operations (`TUNARY`)
A 1-trit unary function $f: \{T, 0, 1\} \to \{T, 0, 1\}$ is completely specified by its 3-trit truth-table triad $M = (m_2, m_1, m_0) = \text{bal\_rem}(\text{imm9}, 27) \in [-13, +13]$, where $M = m_0 + 3 m_1 + 9 m_2$:
$$t_i(rd) = \begin{cases} m_0 & \text{if } t_i(rs1) = -1\ (\text{`T`}) \\ m_1 & \text{if } t_i(rs1) = 0\ (\text{`0`}) \\ m_2 & \text{if } t_i(rs1) = +1\ (\text{`1`}) \end{cases}$$
Notable instances among the 27 unary functions include:
- $M = -8$ (`T01`, $m_2=-1, m_1=0, m_0=+1$): Simple negation (`NEG` / `NOT`, $t'_i = -t_i$)
- $M = +13$ (`111`): Constant `+1` (`1`)
- $M = 0$ (`000`): Constant `0` (`0`)
- $M = -13$ (`TTT`): Constant `-1` (`T`)
- $M = +8$ (`10T`): Identity ($t'_i = t_i$)
- $M = +10$ (`101`): Trit absolute value ($|t_i|$)
- $M = -6$ (`T10`): Post-increment mod 3 ($\text{bal\_rem}(t_i + 1, 3)$)
- $M = +2$ (`01T`): Pre-decrement mod 3 ($\text{bal\_rem}(t_i - 1, 3)$)
- $M = -7$ (`T1T`): Is-Zero indicator ($+1$ if $t_i = 0$ else $-1$)
## 5. Trit Shifts (`SHL`, `SHLI`, `SHR`, `SHRI`)
Trit shifts move trits across powers of 3. Given source word $A = (a_{26}, \dots, a_0)$ and signed shift count $k$ ($R[rs2]$ for `SHL`/`SHR`, or $\text{imm9}$ for `SHLI`/`SHRI`):
- If $k < 0$, `SHL(A, k)` executes `SHR(A, -k)` and `SHR(A, k)` executes `SHL(A, -k)`.
- If $k = 0$: $R[rd] = A$, $\text{SF} = \text{sign}(A)$, $\text{CF} = 0$, $\text{OF} = 0$.
- **Left Trit Shift by $k > 0$ (`SHL` / `SHLI`)** (multiplies by $3^k \bmod_{\text{bal}} 3^{27}$):
  - For $i \in \{0 \dots 26\}$: $t'_i = a_{i - k}$ if $0 \le i - k \le 26$, else $0$.
  - $\text{CF} = a_{27 - k}$ if $1 \le k \le 27$, else $0$.
  - $\text{OF} = \text{sign}\left(\sum_{j=\max(0, 27-k)}^{26} a_j \cdot 3^j\right) \in \{-1, 0, +1\}$.
  - $\text{SF} = \text{sign}(R[rd])$.
- **Right Trit Shift by $k > 0$ (`SHR` / `SHRI`)** (divides by $3^k$, discarding the low $k$ balanced trits and filling high trits with `0`):
  - For $i \in \{0 \dots 26\}$: $t'_i = a_{i + k}$ if $0 \le i + k \le 26$, else $0$.
  - $\text{CF} = a_{k - 1}$ if $1 \le k \le 27$, else $0$.
  - $\text{OF} = 0$, $\text{SF} = \text{sign}(R[rd])$.
## 6. Control Flow & Stack Discipline
- **Three-Way & Compound Sign Branches**:
  - `JN addr`: Branch if $\text{SF} = -1$ (`T`, negative).
  - `JZ addr`: Branch if $\text{SF} = 0$ (`0`, zero).
  - `JP addr`: Branch if $\text{SF} = +1$ (`1`, positive).
  - `JNZ addr`: Branch if $\text{SF} \ne 0$.
  - `JNP addr`: Branch if $\text{SF} \le 0$ ($\text{SF} \ne +1$).
  - `JNN addr`: Branch if $\text{SF} \ge 0$ ($\text{SF} \ne -1$).
  - `JMP addr`: Unconditional branch: $\text{PC} \leftarrow \text{imm9} \bmod_{\text{bal}} 3^9$.
  - `JR rs1`: Indirect register jump: $\text{PC} \leftarrow R[rs1]_0$.
- **Subroutine Call & Return**:
  - `CALL addr`: $\text{SP} \leftarrow (\text{SP} - 1) \bmod_{\text{bal}} 3^9$; $\text{Mem}[\text{phys}(\text{SP})] \leftarrow \text{PC}$; $\text{PC} \leftarrow \text{imm9} \bmod_{\text{bal}} 3^9$.
  - `RET`: $\text{PC} \leftarrow \text{Mem}[\text{phys}(\text{SP})]$; $\text{SP} \leftarrow (\text{SP} + 1) \bmod_{\text{bal}} 3^9$.
- **Word Stack Operations**:
  - `PUSH rs1`: $\text{SP} \leftarrow (\text{SP} - 3) \bmod_{\text{bal}} 3^9$; stores 3 trytes of $R[rs1]$ at $\text{SP}, \text{SP}+1, \text{SP}+2$.
  - `POP rd`: Loads 3 trytes from $\text{SP}, \text{SP}+1, \text{SP}+2$ into $R[rd]$; $\text{SP} \leftarrow (\text{SP} + 3) \bmod_{\text{bal}} 3^9$; sets $\text{SF} = \text{sign}(R[rd])$, $\text{CF} = 0$, $\text{OF} = 0$.
## 7. I/O Port Model & Devices
`IN rd, port` reads from port $\text{port} = \text{imm9}$ into $R[rd]$ and updates $\text{SF} = \text{sign}(R[rd])$, $\text{CF} = 0$, $\text{OF} = 0$. `OUT rd, port` writes $R[rd]$ to port $\text{port} = \text{imm9}$. Every `IN` and `OUT` operation appends an entry `(step, dir, port, value)` to the architectural I/O trace.
| Port (`imm9`) | Name | `IN rd, port` (Read Semantics) | `OUT rd, port` (Write Semantics) |
| :--- | :--- | :--- | :--- |
| `0` | `CONSOLE_CHAR` | Dequeues next keyboard character code ($0$ if queue empty) | Emits character code $(R[rd]_0 \bmod 19683)$ to console & renders glyph to display |
| `1` | `CONSOLE_NUM` | Returns count of queued keyboard characters | Formats 27-trit $R[rd]$ as canonical balanced-ternary text (`T`/`0`/`1`) to console |
| `2` | `DISPLAY_X` | Reads active display X coordinate ($0 \dots 242$) | Sets `DisplayX` $\leftarrow ((R[rd]_0 \bmod 243) + 243) \bmod 243$ |
| `3` | `DISPLAY_Y` | Reads active display Y coordinate ($0 \dots 242$) | Sets `DisplayY` $\leftarrow ((R[rd]_0 \bmod 243) + 243) \bmod 243$ |
| `4` | `DISPLAY_PIXEL` | Reads 3-trit color $\in [-13, +13]$ at `(DisplayX, DisplayY)` | Writes 3-trit color $\text{bal\_rem}(R[rd]_0, 27) \in [-13, +13]$ to `(DisplayX, DisplayY)` |
| `5` | `DISPLAY_CMD` | Reads last display command value | Fills entire $243 \times 243$ display with color $\text{bal\_rem}(R[rd]_0, 27) \in [-13, +13]$ |
| `6` | `TIMER_TICKS` | Reads deterministic cycle/step timer counter | Sets deterministic timer counter to $R[rd]_0$ |
| `7` | `DISK_ADDR` | Reads current tryte disk address ($0 \dots 19682$) | Sets `DiskAddr` $\leftarrow \text{phys}(R[rd]_0)$ |
| `8` | `DISK_DATA` | Reads `Disk[DiskAddr]` into $R[rd]$; increments `DiskAddr` $\bmod\ 19683$ | Writes $R[rd]_0$ to `Disk[DiskAddr]`; increments `DiskAddr` $\bmod\ 19683$ |
## 8. Complete Instruction Encoding Table
In `Tryte 0`, `OPCODE` occupies trits $t_8 t_7 t_6 t_5 t_4$ (weight $3^4 = 81$), `RD` occupies trits $t_3 t_2$ (weight $3^2 = 9$), and `RS1` occupies trits $t_1 t_0$ (weight $3^0 = 1$).
| Mnemonic | Op Dec | Op Trits ($t_8..t_4$) | Tryte 0 Layout | Tryte 1 Layout | Assembly Syntax | Flag Updates (`SF`, `CF`, `OF`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `HALT` | `-1` | `0000T` | `0000T` \| `00` \| `00` | `000000000` | `HALT` | Unchanged (`Halted = 1`) |
| `NOP` | `0` | `00000` | `00000` \| `00` \| `00` | `000000000` | `NOP` | Unchanged |
| `LI` | `+1` | `00001` | `00001` \| `rd` \| `00` | `imm9` | `LI rd, imm9` | `SF=sign`, `CF=0`, `OF=0` |
| `LUI` | `+2` | `0001T` | `0001T` \| `rd` \| `00` | `imm9` | `LUI rd, imm9` | `SF=sign`, `CF=0`, `OF=0` |
| `MOV` | `+3` | `00010` | `00010` \| `rd` \| `rs1` | `000000000` | `MOV rd, rs1` | `SF=sign`, `CF=0`, `OF=0` |
| `ADD` | `+4` | `00011` | `00011` \| `rd` \| `rs1` | `0000000` \| `rs2` | `ADD rd, rs1, rs2` | `SF=sign`, `CF=c27`, `OF=c27` |
| `ADDI` | `+5` | `001TT` | `001TT` \| `rd` \| `rs1` | `imm9` | `ADDI rd, rs1, imm9` | `SF=sign`, `CF=c27`, `OF=c27` |
| `ADC` | `+6` | `001T0` | `001T0` \| `rd` \| `rs1` | `0000000` \| `rs2` | `ADC rd, rs1, rs2` | `SF=sign`, `CF=c27`, `OF=c27` |
| `SUB` | `+7` | `001T1` | `001T1` \| `rd` \| `rs1` | `0000000` \| `rs2` | `SUB rd, rs1, rs2` | `SF=sign`, `CF=c27`, `OF=c27` |
| `SUBI` | `+8` | `0010T` | `0010T` \| `rd` \| `rs1` | `imm9` | `SUBI rd, rs1, imm9` | `SF=sign`, `CF=c27`, `OF=c27` |
| `SBC` | `+9` | `00100` | `00100` \| `rd` \| `rs1` | `0000000` \| `rs2` | `SBC rd, rs1, rs2` | `SF=sign`, `CF=c27`, `OF=c27` |
| `MUL` | `+10` | `00101` | `00101` \| `rd` \| `rs1` | `0000000` \| `rs2` | `MUL rd, rs1, rs2` | `SF=sign`, `CF=hi`, `OF=hi` |
| `MULI` | `+11` | `0011T` | `0011T` \| `rd` \| `rs1` | `imm9` | `MULI rd, rs1, imm9` | `SF=sign`, `CF=hi`, `OF=hi` |
| `DIV` | `+12` | `00110` | `00110` \| `rd` \| `rs1` | `0000000` \| `rs2` | `DIV rd, rs1, rs2` | `SF=sign`, `CF=0`, `OF=div0` |
| `MOD` | `+13` | `00111` | `00111` \| `rd` \| `rs1` | `0000000` \| `rs2` | `MOD rd, rs1, rs2` | `SF=sign`, `CF=0`, `OF=div0` |
| `NEG` | `+14` | `01TTT` | `01TTT` \| `rd` \| `rs1` | `000000000` | `NEG rd, rs1` | `SF=sign`, `CF=0`, `OF=0` |
| `LT` | `+15` | `01TT0` | `01TT0` \| `rd` \| `rs1` | `imm9` | `LT rd, rs1, imm9` | `SF=sign`, `CF=0`, `OF=0` |
| `ST` | `+16` | `01TT1` | `01TT1` \| `rd` \| `rs1` | `imm9` | `ST rd, rs1, imm9` | Unchanged |
| `LW` | `+17` | `01T0T` | `01T0T` \| `rd` \| `rs1` | `imm9` | `LW rd, rs1, imm9` | `SF=sign`, `CF=0`, `OF=0` |
| `SW` | `+18` | `01T00` | `01T00` \| `rd` \| `rs1` | `imm9` | `SW rd, rs1, imm9` | Unchanged |
| `PUSH` | `+19` | `01T01` | `01T01` \| `00` \| `rs1` | `000000000` | `PUSH rs1` | Unchanged |
| `POP` | `+20` | `01T1T` | `01T1T` \| `rd` \| `00` | `000000000` | `POP rd` | `SF=sign`, `CF=0`, `OF=0` |
| `JMP` | `+21` | `01T10` | `01T10` \| `00` \| `00` | `imm9` | `JMP addr` | Unchanged |
| `JN` | `+22` | `01T11` | `01T11` \| `00` \| `00` | `imm9` | `JN addr` | Unchanged |
| `JZ` | `+23` | `010TT` | `010TT` \| `00` \| `00` | `imm9` | `JZ addr` | Unchanged |
| `JP` | `+24` | `010T0` | `010T0` \| `00` \| `00` | `imm9` | `JP addr` | Unchanged |
| `JNZ` | `+25` | `010T1` | `010T1` \| `00` \| `00` | `imm9` | `JNZ addr` | Unchanged |
| `JNP` | `+26` | `0100T` | `0100T` \| `00` \| `00` | `imm9` | `JNP addr` | Unchanged |
| `JNN` | `+27` | `01000` | `01000` \| `00` \| `00` | `imm9` | `JNN addr` | Unchanged |
| `JR` | `+28` | `01001` | `01001` \| `00` \| `rs1` | `000000000` | `JR rs1` | Unchanged |
| `CALL` | `+29` | `0101T` | `0101T` \| `00` \| `00` | `imm9` | `CALL addr` | Unchanged |
| `RET` | `+30` | `01010` | `01010` \| `00` \| `00` | `000000000` | `RET` | Unchanged |
| `IN` | `+31` | `01011` | `01011` \| `rd` \| `00` | `imm9` | `IN rd, port` | `SF=sign`, `CF=0`, `OF=0` |
| `OUT` | `+32` | `011TT` | `011TT` \| `rd` \| `00` | `imm9` | `OUT rd, port` | Unchanged |
| `CMP` | `-2` | `000T1` | `000T1` \| `00` \| `rs1` | `0000000` \| `rs2` | `CMP rs1, rs2` | `SF=cmp`, `CF=c27`, `OF=c27` |
| `CMPI` | `-3` | `000T0` | `000T0` \| `00` \| `rs1` | `imm9` | `CMPI rs1, imm9` | `SF=cmp`, `CF=c27`, `OF=c27` |
| `TMIN` | `-4` | `000TT` | `000TT` \| `rd` \| `rs1` | `0000000` \| `rs2` | `TMIN rd, rs1, rs2` | `SF=sign`, `CF=0`, `OF=0` |
| `TMAX` | `-5` | `00T11` | `00T11` \| `rd` \| `rs1` | `0000000` \| `rs2` | `TMAX rd, rs1, rs2` | `SF=sign`, `CF=0`, `OF=0` |
| `TCON` | `-6` | `00T10` | `00T10` \| `rd` \| `rs1` | `0000000` \| `rs2` | `TCON rd, rs1, rs2` | `SF=sign`, `CF=0`, `OF=0` |
| `TANY` | `-7` | `00T1T` | `00T1T` \| `rd` \| `rs1` | `0000000` \| `rs2` | `TANY rd, rs1, rs2` | `SF=sign`, `CF=0`, `OF=0` |
| `TXOR` | `-8` | `00T01` | `00T01` \| `rd` \| `rs1` | `0000000` \| `rs2` | `TXOR rd, rs1, rs2` | `SF=sign`, `CF=0`, `OF=0` |
| `TUNARY` | `-9` | `00T00` | `00T00` \| `rd` \| `rs1` | `imm9` | `TUNARY rd, rs1, imm9` | `SF=sign`, `CF=0`, `OF=0` |
| `SHL` | `-10` | `00T0T` | `00T0T` \| `rd` \| `rs1` | `0000000` \| `rs2` | `SHL rd, rs1, rs2` | `SF=sign`, `CF=out`, `OF=hi` |
| `SHLI` | `-11` | `00TT1` | `00TT1` \| `rd` \| `rs1` | `imm9` | `SHLI rd, rs1, imm9` | `SF=sign`, `CF=out`, `OF=hi` |
| `SHR` | `-12` | `00TT0` | `00TT0` \| `rd` \| `rs1` | `0000000` \| `rs2` | `SHR rd, rs1, rs2` | `SF=sign`, `CF=out`, `OF=0` |
| `SHRI` | `-13` | `00TTT` | `00TTT` \| `rd` \| `rs1` | `imm9` | `SHRI rd, rs1, imm9` | `SF=sign`, `CF=out`, `OF=0` |
## 9. Formal Assembly Grammar (EBNF)
```ebnf
program       = { line } ;
line          = [ label_def ] [ statement ] [ comment ] EOL ;
label_def     = identifier ":" ;
statement     = directive | instruction ;
directive     = ".org" imm_expr
              | ".tryte" imm_expr { "," imm_expr }
              | ".word" imm_expr { "," imm_expr }
              | ".string" string_lit
              | ".equ" identifier "," imm_expr ;
instruction   = mnemonic [ operand { "," operand } ] ;
operand       = register | imm_expr ;
register      = ( "R0" | "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8" ) ; (* case-insensitive *)
imm_expr      = [ "#" ] ( ternary_lit | decimal_lit | char_lit | identifier ) ;
ternary_lit   = "0t" { "T" | "0" | "1" } ; (* MSB-first balanced ternary literal *)
decimal_lit   = [ "+" | "-" ] digit { digit } ;
char_lit      = "'" character "'" ;
comment       = ";" { character } ;
```