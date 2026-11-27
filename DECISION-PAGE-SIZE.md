# Decision: Triton 5 pages are balanced-3⁷ (2,187 trytes)

**Decided 2026-11-27 by Kham, on Kehai's recommendation**, after both measurement rounds were audited and accepted
(`audit/triton5/AUDIT-1.md`, `AUDIT-2.md`). The measurements were taken before this decision and recommended nothing,
as their specs required. This file records the choice and the receipts it rests on.

## The choice
- **Design: balanced-3ᵏ.** A virtual address is split by tapping balanced trits directly: low 7 trits = offset,
  trits 7..12 = L1 index, trits 13..18 = L0 index. No carry chain, no divider.
- **Size: 3⁷ = 2,187 trytes per page.**
- binary-4096 and the unsigned-3ᵏ designs stay in the emulator as switchable modes for measurement and comparison.
  They are not the port's target.

## Why (from `audit/triton5/delivery-2/REPORT-5.md`, reproduced in the stage-2 audit)
| | split cost per translation | gate estimate | TLB hit, desktop | TLB hit, sparse | table memory, sparse |
| --- | ---: | ---: | ---: | ---: | ---: |
| binary-4096 | 22 divider steps | 294 ternary gates (iterative) | 99.97% | 99.68% | 12,288 trytes |
| unsigned-2187 | 19-trit carry chain | 114 | 99.96% | 87.79% | 19,683 |
| **balanced-2187** | **0** (wire tap) | **0** | **99.96%** | **87.79%** | **19,683** |
| balanced-729 | 0 | 0 | 99.92% | 63.76% | 24,057 |

- **Balanced costs nothing to split.** The hardware is wires, not a divider (binary-4096) or a borrow chain
  (unsigned-3ᵏ). On the card computer that's one less thing on every memory access's critical path.
- **2,187 rather than 729:** same zero split cost, but much fewer TLB misses on scattered access (87.79% against
  63.76% sparse; 39.07% against 12.83% on pure random access) and fewer copy-on-write faults (55 against 152 on the
  fork pattern).
- **What it costs:** 4,096 still hits more on scattered workloads (99.68% sparse, 73.13% random), mostly because its
  pages are bigger. And NetBSD has to learn that a page needn't be a power of two. That second cost is the point:
  the port teaches NetBSD something true.
- With the compiler's address bias, balanced-3ᵏ and unsigned-3ᵏ put C addresses into the **same pages** (stage-2
  audit). So this choice changes hardware cost, not paging behaviour.

## Open, for later rounds
- Centred tables split the page-number range at ±(3ʷ−1)/2. Whether the OS places part of its address space at
  negative addresses (using the other half of each centred table) is an OS-layout decision for the port.
- Every power-of-two page assumption in NetBSD (`PAGE_SHIFT`, `PAGE_MASK` arithmetic, `trunc_page`/`round_page`,
  UVM's page-size macros) has to become page-size-general. List them as the port meets them.
