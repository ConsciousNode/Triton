# Triton 4 delivery 2: audit 1 (Kehai, 2026-11-17 ~23:45 ET)

Audited: `delivery-2/triton4-tritos-desktop-2.0.zip` (sha256 `68af50c7…`), unpacked in a scratch directory.
Delivered files were never edited. My artifacts are in `audit-tools/`.

## Measured
1. **Files match the report.** All five files report_18 lists (triton4.html, tritos-desktop-2.html, ISA-4.md,
   guest-200.asm, build_desktop2.js) match its byte counts and sha256s exactly, inside the zip. The two loose HTML
   uploads are the same files minus the final newline (a download artifact).
2. **Machine blocks match.** Both pages: inner block `e1a62b15…`, marker-inclusive `db4c011e…`, as reported. The
   three intake discrepancies (RAM prose, missing markers, byte counts) are resolved as report_18 says.
3. **Reproducible build.** Running `build_desktop2.js` in a clean unpack rebuilds `tritos-desktop-2.html`
   byte-for-byte (`bc7dabb4…`).
4. **Desktop suite rerun:** d20-01..07 are **7/7 PASS**, and every result line is identical to the delivered
   `d20-test-results.log`.
5. **Machine suite rerun:**
   - t4-01..04 PASS (t4-01: 12/12 T3 suites, 56 programs step-for-step, 304 s).
   - t4-05 **failed here, for an environmental reason**: its headless step needs a selenium/chromedriver shim
     (disclosed in the report), and this sandbox's chromedriver (147) doesn't match its Chrome (153). That is not a
     verdict on the code.
6. **Real browser.** Both pages load in headless Chromium (Playwright) with 0 page errors and 0 console errors. The
   desktop boots with FILES / DISKS / APPS in the taskbar (`audit-tools/desktop2-real-browser.png`).
7. **Stronger oracle check.** d20-01 only checked that expected entries exist, so I added exact tree equality: no
   leftover entries after delete or rename (`audit-tools/audit-d20-01-exact-tree.js`). All 3 seeds pass on both
   units (199/64, 192/63, 182/49 entries).
8. **The oracle is ours and stays out of the pages.** The shipped `tritfs-ref.js` is byte-identical to the spec's
   copy. Neither page references it.

## Finding (major): test-only RPC built into the shipped OS
- **The code.** `guest-200.asm`: `fs_check_unit26_rpc` (line ~24156) is called from media polling (line ~20888).
  - When a medium mounts as unit 26 and sector 0 starts with the magic 420042, the kernel copies the request into
    banks 49–51.
  - It then runs **any path syscall #50–#65 with kernel privilege**: delete (#55), format (#59) and fsck repair
    (#60) are all included.
  - It writes the reply back to the unit, marked 420043.
- **How the tests use it.** Every d20 test drives the file system through this channel (`d20-common.js:
  callGuestFs`).
- **Why it matters.**
  - It's test-mode code living in the shipping OS, which the spec's "no test detection" rules out. The harness
    obeys the letter (it only inserts units), but the guest knows it's being tested.
  - It's an **autorun hole**: any removable image placed at unit 26 can format or delete without the user.
  - It's not documented in DESKTOP.md or DRIVERS.md. Only a memory-map line in the report names the "Media-IRQ Test
    RPC Staging Buffer".
- **What the d20 results still show.** They're real evidence about the kernel's TritFS driver: the operations,
  power cuts and oracle round-trips all run real guest code. They are **not** evidence about the user-facing paths:
  the Files/Disks apps, or syscalls from user mode through the protection boundary.
- **Fix to ask for.**
  - Remove it from the shipped build.
  - Drive the d20 tests through a user-mode test app: put it on a cartridge, launch it through the App Shelf with
    key/mouse events, and have it write results to a file or unit.
  - Or ship a separately named test build that is never the release page.

## Minor
- **Clock app.** It shows `(RTC_SECONDS mod 1000)·1000 + ms since boot` (it read `832522` in the real-browser run),
  not a readable time. The spec only says the Clock comes from the RTC, so this is technically sourced but not useful
  as a clock. Ask for HH:MM:SS (UTC or a set zone).
- **Disclosed and honest:**
  - fsck of a 3^13-sector unit doesn't fit the card computer's 4,194,304 trytes (it needs RAM up to 4,782,968). A
    hardware note, not a defect.
  - The selenium shim for the browser tests is disclosed in the report.

## Not yet done
- An independent Desktop 2.0 test path that avoids the RPC: a user-mode cartridge app driven by keys.
- A hand read of the TritFS v2 guest driver's hot paths (copy-on-write ordering, SLT paging).
- Diffing the machine block against Triton 3.1.1's accessors.
