# TritOS Desktop 2.0.1 Changelog

## Kernel & Guest (`triton/desktop/guest-200.asm`)
- Defined `ERR_BADPTR` (`-14`), `ERR_FS_ERR` (`-1`), `ERR_FS_NO_UNIT` (`-4`), and `ERR_FS_WP` (`-5`).
- Added single pointer-validation routine `k_check_user_ptr` checking `[ptr, ptr + len - 1]` and NUL-terminated paths against TCB `UBASE` (`+36`) and `ULIMIT` (`+39`).
- Validated all pointer arguments in syscalls `#50..#65` (`k_fs2_syscall_dispatch`, `drv_fs_read_impl`, `drv_fs_doc_load_impl`), including `max_trytes <= 0` whole-file reads before any copy.
- Moved `DRIVER fs v2` `.org` from `65400` to `66000` to accommodate the validated syscall bridge.
- Fixed `dfui_cnt_lp` in `drv_fs_unit_info_impl` to stop scanning immediately when `fs_slt_get_link` returns `-99` on an ejected unit.

## Build & Browser Page (`triton/desktop/build_desktop2.js`, `triton/desktop/tritos-desktop-2.html`)
- Wired `clock: Date.now` into `TritonWASM.createSync` and `new TritonJS` during browser boot.
- Added `--no-ptr-check` and `--out` CLI flags to `build_desktop2.js`.
- Kept `triton/triton4.html` byte-identical to the 2.0 base tree.

## Documentation (`triton/desktop/gen_desktop_doc.js`, `triton/desktop/DESKTOP.md`, `triton/desktop/syscall-table.json`)
- Added `desktop/gen_desktop_doc.js` to generate `DESKTOP.md` §7, `DESKTOP.md` §8.1, and `desktop/syscall-table.json` directly from `guest-200.asm`.

## Tests (`triton/desktop/tests/p-*.js`)
- Added `p-01`..`p-07`, `p-common.js`, and `p-run-all.js` with `results.jsonl` logging.
