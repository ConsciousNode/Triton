#!/usr/bin/env python3
"""Kehai's real-browser check for Triton 5 stage 2 (Playwright Chromium; Selenium isn't available here).
Loads triton5.html from file://, counts console errors and page errors, switches the UI's design selector to each
balanced mode, then, inside the page, builds balanced JS and WASM machines, maps one page, loads through it and
dereferences C NULL, comparing JS and WASM. Usage: python3 browser-balanced.py <triton5.html> <out.png>"""
import sys, pathlib
from playwright.sync_api import sync_playwright

html = pathlib.Path(sys.argv[1]).resolve()
out = sys.argv[2]
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.goto(html.as_uri())
    pg.wait_for_timeout(1500)
    opts = pg.eval_on_selector_all("#pagesize-select option", "os => os.map(o => o.value)")
    for v in ["729:balanced", "2187:balanced"]:
        pg.select_option("#pagesize-select", v)
        pg.wait_for_timeout(500)
    res = pg.evaluate("""() => {
      const T = window.TritonSystem; const out = {};
      for (const ps of [729, 2187]) {
        const B = (ps - 1) / 2, ramSize = 8 * ps;
        const ms = [new T.TritonJS({archMode:'T3', pageSize:ps, mmuMode:'balanced', ramSize, diskSectors:2}),
                    T.TritonWASM.createSync({archMode:'T3', pageSize:ps, mmuMode:'balanced', ramSize, diskSectors:2})];
        const ww = (m, a, v) => { const w = T.numberToWord(v); m.setMem(a, w[0]); m.setMem(a+1, w[1]); m.setMem(a+2, w[2]); };
        const f = T.T5_PTE.V | T.T5_PTE.R | T.T5_PTE.W | T.T5_PTE.X | T.T5_PTE.U;
        const prog = T.assemble(`
          .mode T3
          .org 0
          LT R0, R1, #0
          HALT
          .org 100
          MFSPR R2, #13
          HALT`, {mode:'T3'});
        const r = [];
        for (const m of ms) {
          ww(m, ps - 1, 2 * 512 + T.T5_PTE.V);          // L0[0] -> frame 2 (centred)
          ww(m, 2 * ps + 3 - 1, 3 * 512 + f);           // L1[1]  -> frame 3 (code)
          ww(m, 2 * ps - 3 - 1, 4 * 512 + f);           // L1[-1] -> frame 4 (data, negative vpn)
          for (let i = 0; i < prog.trytes.length; i++) m.setMem(3 * ps - B + i, prog.trytes[i]);
          m.setMem(4 * ps - 7, 1234);                    // data at offset -7 of frame 4
          m.vbr = 0; ww(m, 39, ps - B + 100);
          m.ptbr = ps; m.pgEn = 1; m.flushTlbAll();
          const run = (va) => { m.halted = 0; m.pc = ps - B; m.setWordNum(1, va); m.ecause = 0;
                                 for (let s = 0; s < 10 && !m.halted; s++) m.step(); };
          run(-ps - 7);                                  // vpn -1, off -7
          const load = m.getWordNum(0), c1 = m.ecause;
          run(-B);                                       // C NULL
          r.push({load, c1, nullCause: m.ecause, nullEaddr: m.getWordNum(2), hash: T.computeStateHash(m)});
        }
        out[ps] = {js: r[0], wasm: r[1], same: JSON.stringify(r[0]) === JSON.stringify(r[1])};
      }
      return out;
    }""")
    pg.screenshot(path=out)
    b.close()
print("options:", opts)
print("errors:", len(errors), errors[:5])
print(res)
ok = not errors and all(res[k]["same"] and res[k]["js"]["load"] == 1234 and res[k]["js"]["c1"] == 0
                        and res[k]["js"]["nullCause"] == 13 and res[k]["js"]["nullEaddr"] == -(int(k) - 1) // 2 for k in res)
print("PASS" if ok else "FAIL")
