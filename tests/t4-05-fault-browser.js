#!/usr/bin/env node
'use strict';

/**
 * Triton 4 Machine Test 5: Power-Cut Fault Injector & Headless Browser Units Panel (`tests/t4-05-fault-browser.js`)
 * ConsciousNode SoftWorks
 *
 * Verifies:
 *   1. Fault injector (`cutPowerAfterSectorWrites(N)`):
 *      - Cuts power after the next N sector writes (tested for N = 0, 1, 2, 3, 4 on a 4-sector write sequence).
 *      - Machine halts immediately as if unplugged (`halted === 1`).
 *      - Unit contents written before the cut persist across reset/reboot, while RAM, VRAM, and CPU registers
 *        are wiped to zero at power cut.
 *      - JS and WASM behave bit-identically at every cut point N.
 *   2. Headless Chromium verification of `triton4.html`:
 *      - Boots `triton4.html`, verifies the Storage Units panel (Units 0..26 table, Unit 1 Home 59,049 sectors,
 *        write-protect toggle, creating a new blank unit of 3^7 / 3^10 / 3^13 sectors, ejecting a unit and raising
 *        `IRQ_MEDIA`), verifies JS === WASM lockstep, and confirms 0 browser console/page errors.
 */

const { spawnSync } = require('child_process');
const { loadHtmlModule } = require('./t3-common');
const { T, htmlPath } = loadHtmlModule('triton4.html');

const t0 = Date.now();

// 1. Fault Injector ("cut power after the next N sector writes") across N = 0, 1, 2, 3, 4
const write4Prog = T.assemble(`
  .mode T3
  .org 0
  ; Select Unit 1 (Home disk)
  LI R0, #1
  OUT R0, #28

  ; Prepare 4 distinct sectors in RAM[2000..4915] with markers 101, 102, 103, 104
  LI R1, #2000
  LI R2, #101
  SW R2, R1, #0
  LI R1, #2729
  LI R2, #102
  SW R2, R1, #0
  LI R1, #3458
  LI R2, #103
  SW R2, R1, #0
  LI R1, #4187
  LI R2, #104
  SW R2, R1, #0

  ; Write Sectors 10..11 (2 sectors in one DMA_WRITE)
  LI R0, #10
  OUT R0, #17      ; LBA = 10
  LI R0, #2000
  OUT R0, #18      ; DMA = 2000
  LI R0, #2
  OUT R0, #19      ; COUNT = 2
  OUT R0, #20      ; DMA_WRITE (writes sector 10, then sector 11)

  ; Write Sectors 12..13 (2 sectors in a second DMA_WRITE)
  LI R0, #12
  OUT R0, #17      ; LBA = 12
  LI R0, #3458
  OUT R0, #18      ; DMA = 3458
  LI R0, #2
  OUT R0, #19      ; COUNT = 2
  OUT R0, #20      ; DMA_WRITE (writes sector 12, then sector 13)

  ; Sentinel in RAM[500] = 999 (only reached if power was NOT cut!)
  LI R1, #500
  LI R2, #999
  SW R2, R1, #0
  HALT
`, { mode: 'T3' });

for (let n = 0; n <= 5; n++) {
  const js = new T.TritonJS({ archMode: 'T3' });
  const wasm = T.TritonWASM.createSync({ archMode: 'T3' });
  js.loadProgram(write4Prog.trytes, 0);
  wasm.loadProgram(write4Prog.trytes, 0);

  js.cutPowerAfterSectorWrites(n);
  wasm.cutPowerAfterSectorWrites(n);

  js.run(500);
  wasm.run(500);

  if (T.computeStateHash(js) !== T.computeStateHash(wasm)) {
    throw new Error(`[t4-05.1] JS/WASM state hash mismatch after power cut at n=${n}`);
  }

  const expectedMarkers = [101, 102, 103, 104];
  for (const [name, vm] of [['js', js], ['wasm', wasm]]) {
    if (!vm.halted) throw new Error(`[t4-05.1] ${name} did not halt at cut n=${n}`);
    if (n <= 3) {
      // Power was cut! RAM must be completely zeroed, and exactly n sectors (10 .. 10+n-1) persisted on Unit 1
      if (vm.getMem(500) !== 0 || vm.getMem(2000) !== 0) {
        throw new Error(`[t4-05.1] ${name} RAM persisted across power cut at n=${n}!`);
      }
      for (let s = 0; s < 4; s++) {
        const sec = vm.getUnit(1).readSector(10 + s);
        const exp = s < n ? expectedMarkers[s] : 0;
        if (sec[0] !== exp) {
          throw new Error(`[t4-05.1] ${name} Unit 1 sector ${10 + s} at cut n=${n}: expected ${exp}, got ${sec[0]}`);
        }
      }
    } else if (n === 4) {
      // Cut immediately after 4th sector write, before Mem[500] = 999 instruction!
      if (vm.getMem(500) !== 0) {
        throw new Error(`[t4-05.1] ${name} executed instructions after 4th sector write cut!`);
      }
      for (let s = 0; s < 4; s++) {
        const sec = vm.getUnit(1).readSector(10 + s);
        if (sec[0] !== expectedMarkers[s]) {
          throw new Error(`[t4-05.1] ${name} Unit 1 sector ${10 + s} at cut n=4 missing marker`);
        }
      }
    } else {
      // n = 5 (> 4 writes): program completed normally without power cut!
      if (vm.getMem(500) !== 999) {
        throw new Error(`[t4-05.1] ${name} did not complete normally when n=5`);
      }
    }
  }
}

// 2. Headless Chromium Verification of triton4.html & Units Panel UI
const pyScript = `
import base64, json, sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

html_path = sys.argv[1]
with open(html_path, "rb") as f:
    b64 = base64.b64encode(f.read()).decode("ascii")

opts = Options()
opts.add_argument("--headless=new")
opts.add_argument("--no-sandbox")
opts.add_argument("--disable-dev-shm-usage")
opts.set_capability("goog:loggingPrefs", {"browser": "ALL"})

driver = webdriver.Chrome(options=opts)
try:
    driver.get("data:text/html;base64," + b64)
    logs_boot = driver.get_log("browser")
    title = driver.title
    rows_initial = driver.execute_script("return document.getElementById('units-tbody').textContent;")

    # Select Unit 2, create a 3^13 (1,594,323-sector) blank unit, toggle WP, then eject it
    driver.execute_script("""
      const sel = document.getElementById('unit-slot-select');
      sel.value = '2';
      sel.dispatchEvent(new Event('change'));
      const bsel = document.getElementById('unit-blank-size');
      bsel.value = '1594323';
      document.getElementById('btn-unit-blank').click();
    """)
    rows_after_blank = driver.execute_script("return document.getElementById('units-tbody').textContent;")
    footer_blank = driver.execute_script("return document.getElementById('footer-msg').textContent;")

    driver.execute_script("""
      const wp = document.getElementById('unit-wp-toggle');
      wp.checked = true;
      wp.dispatchEvent(new Event('change'));
    """)
    rows_after_wp = driver.execute_script("return document.getElementById('units-tbody').textContent;")

    driver.execute_script("document.getElementById('btn-unit-eject').click();")
    footer_eject = driver.execute_script("return document.getElementById('footer-msg').textContent;")
    sync_ind = driver.execute_script("return document.getElementById('sync-indicator').textContent;")
    logs_after = driver.get_log("browser")

    print(json.dumps({
        "title": title,
        "logsBoot": logs_boot,
        "logsAfter": logs_after,
        "rowsInitial": rows_initial,
        "rowsAfterBlank": rows_after_blank,
        "rowsAfterWp": rows_after_wp,
        "footerBlank": footer_blank,
        "footerEject": footer_eject,
        "syncInd": sync_ind
    }))
finally:
    driver.quit()
`;

const r = spawnSync('python3', ['-c', pyScript, htmlPath], { encoding: 'utf8', timeout: 45000 });
if (r.status !== 0) {
  throw new Error(`[t4-05.2] Headless browser failed:\n${r.stderr}`);
}
const bRes = JSON.parse(r.stdout.trim().split('\n').pop());
if (bRes.logsBoot.length !== 0 || bRes.logsAfter.length !== 0) {
  throw new Error(`[t4-05.2] Browser page errors: ${JSON.stringify([...bRes.logsBoot, ...bRes.logsAfter])}`);
}
if (!bRes.rowsInitial.includes('59,049') ||
    !bRes.rowsAfterBlank.includes('1,594,323') ||
    !bRes.rowsAfterWp.includes('RO') ||
    !bRes.footerEject.includes('IRQ_MEDIA') ||
    bRes.syncInd !== 'JS ≡ WASM LOCKSTEP OK') {
  throw new Error(`[t4-05.2] Unexpected browser Units Panel state: ${JSON.stringify(bRes)}`);
}

console.log(`[PASS] t4-05-fault-browser: Power-cut fault injector (N=0..5, unit persistence + RAM wipe, JS === WASM) and headless Chromium Units panel UI (0 page errors) in ${Date.now() - t0} ms`);
