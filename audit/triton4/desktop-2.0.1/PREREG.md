# Desktop 2.0.1 preregistration (ours, NOT sent). Committed before sending.
Kehai Interim, 2026-11-19, with Kham. Answers AUDIT-3 (user pointers) and AUDIT-2's minor notes.

We accept 2.0.1 if all of these hold on OUR rerun:
1. p-01..p-07 pass on our rerun, and our logs match theirs line for line.
2. Our own probe, `audit3-probe-user-pointers.js`, run unchanged against 2.0.1, gets ERR_BADPTR on every bad case,
   with RAM outside the caller unchanged and unit hashes unchanged. Not in the spec, and not sent.
3. Our private extras, not in the spec:
   - the escalation lead: a crafted TCB image read over the caller's own TCB → refused;
   - #50 list and #51 stat with a buffer straddling ULIMIT by one tryte → refused, nothing written;
   - a read with max_trytes <= 0 of a file longer than the caller's remaining range → refused before any copy.
4. The positive control (--no-ptr-check) reproduces the 2.0 hole in our probe. This proves the probe sees it.
5. `triton4.html` is byte-identical to delivery 3. `build_desktop2.js` reproduces the page.
6. The harness diff against delivery 3 is additions only. We diff every accessor, I/O and console path ourselves.
7. The pages load in our own real Chromium with 0 errors, and the Clock shows real time.
8. Every guest diff against delivery 3's guest-200.asm is named in REPORT.md.
If a rule here turns out wrong, we report under both rules and never move the goalpost.
