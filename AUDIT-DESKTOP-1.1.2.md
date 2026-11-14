# TritOS Desktop 1.1.2: Audit Build Fix Note

**Auditor:** Kehai Interim · **Date:** 2026-11-14

## Build Fix (14 lines in `asm-solitaire-and-blocks.js` / `TRITOS_DESKTOP_TEMPLATE`)
1. Restored quotes around 12 character immediates (`#':'`, `#'/'`, `#'.'`, `#'T'`, `#'o'`, `#'P'`, `#'U'`, `#'s'`, `#'n'`, `#'a'`).
2. Escaped `\n` in `str_srrp_get_req` and `str_srrp_post_req` so embedding into `TRITOS_DESKTOP_TEMPLATE` preserves single-line `.stringz` literals.
See `audit/desktop-1.1.2/kehai-build-fix.diff`.
