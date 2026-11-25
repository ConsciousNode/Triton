#!/usr/bin/env python3
"""Positive controls for balanced-walk.js: each mutant is applied to BOTH the JS and the WASM core, so JS/WASM
lockstep can't catch it; only the spec-only oracle can. Every mutant must make the probe fail.
Usage: python3 balanced-walk-controls.py <triton5.html>"""
import sys, subprocess, pathlib, tempfile
src = pathlib.Path(sys.argv[1]).read_text()
probe = str(pathlib.Path(__file__).with_name("balanced-walk.js"))
M = {
 "vpage0_mapped_both": [
   ("if (this.mmuMode === T5_MMU_MODE.BALANCED && vpn === 0) {", "if (false) {"),
   ("(if (i32.and (i32.eq (i32.load (i32.const 83752)) (i32.const 2)) (i64.eqz (local.get $vpn)))",
    "(if (i32.and (i32.eq (i32.load (i32.const 83752)) (i32.const 99)) (i64.eqz (local.get $vpn)))")],
 "unsigned_split_both": [
   ("return this.pageSize === 729 ? t5SplitAddrBal729(va) : t5SplitAddrBal2187(va);",
    "return this.pageSize === 729 ? t5SplitAddr729(va) : t5SplitAddr2187(va);"),
   ("(if (i32.eq (local.get $ps) (i32.const 729)) (then (return (call $split_addr_bal_729 (local.get $va)))))\n        (return (call $split_addr_bal_2187 (local.get $va)))))",
    "(if (i32.eq (local.get $ps) (i32.const 729)) (then (return (call $split_addr_729 (local.get $va)))))\n        (return (call $split_addr_2187 (local.get $va)))))")],
 "frame0_allowed_both": [
   ("if (isBal && ppn <= 0) {", "if (false) {"),
   ("(if (i32.and (i32.eq (i32.load (i32.const 83752)) (i32.const 2)) (i64.le_s (local.get $ppn) (i64.const 0)))\n      (then\n        (call $raise_page_fault (local.get $va) (local.get $acc) (i32.const 0) (i32.const 1) (local.get $spc))",
    "(if (i32.and (i32.eq (i32.load (i32.const 83752)) (i32.const 99)) (i64.le_s (local.get $ppn) (i64.const 0)))\n      (then\n        (call $raise_page_fault (local.get $va) (local.get $acc) (i32.const 0) (i32.const 1) (local.get $spc))")],
 "pte_base_entry0_both": [
   ("const pteAddr = isBal ? (l1Base + idx1 * 3 - 1) : (l1Base + idx1 * 3);", "const pteAddr = l1Base + idx1 * 3;"),
   ("(i64.add (i64.mul (local.get $ppn) (local.get $ps64)) (i64.mul (local.get $idx1) (i64.const 3)))\n        (if (result i64) (i32.eq (i32.load (i32.const 83752)) (i32.const 2)) (then (i64.const 1)) (else (i64.const 0)))))",
    "(i64.add (i64.mul (local.get $ppn) (local.get $ps64)) (i64.mul (local.get $idx1) (i64.const 3)))\n        (i64.const 0)))")],
}
ok = True
for name, edits in M.items():
    s = src
    for a, b in edits:
        if s.count(a) != 1: print(f"{name}: anchor not unique/found ({s.count(a)})"); ok = False; break
        s = s.replace(a, b)
    else:
        with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f: f.write(s)
        r = subprocess.run(["node", probe, f.name, "3000"], capture_output=True, text=True)
        caught = r.returncode != 0
        msg = (r.stderr.strip().splitlines() or [""])
        msg = next((l for l in msg if l.startswith("Error")), msg[0])
        print(f"{name}: {'CAUGHT' if caught else 'NOT CAUGHT'}  {msg[:150]}")
        ok &= caught
print("ALL CONTROLS CAUGHT" if ok else "CONTROL FAILURE")
