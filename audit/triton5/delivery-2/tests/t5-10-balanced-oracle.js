#!/usr/bin/env node
'use strict';

/**
 * Triton 5.0 Stage 2 Test 10: Independent Balanced-Trit & Wiring Oracle (`tests/t5-10-balanced-oracle.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Pure, independent oracle written WITHOUT using the emulator's ALU (`balRem`/`balQuot`
 * are NOT called; instead decomposes integers into explicit balanced trits {-1, 0, +1}
 * from scratch) to verify:
 *   1. Balanced-trit virtual address split (low k trits = offset in [-B..+B], upper trits =
 *      vpn, 2-level balanced indices idx1/idx0) and pure-wiring physical address assembly
 *      (PA = frame_trits || offset_trits, frame >= 1 => PA >= B+1) on 1,000,000 addresses
 *      per size (729 [k=6, B=364] and 2,187 [k=7, B=1,093] => 2,000,000 total), explicitly
 *      covering EVERY ±B and ±(B+1) boundary and negative L0/L1 indices.
 *   2. Compiler bias convention: C pointer P -> machine address A = P - B gives
 *      off = (P mod 3^k) - B and vpn = floor(P / 3^k).
 *   3. Real TritonJS & TritonWASM MMU hardware translations in balanced-3^k at both sizes,
 *      including negative L1 indices (e.g. vpn=122 for 729, vpn=365 for 2187) and negative
 *      L0 indices (vpn < 0), with JS === WASM state hash verified after EVERY step.
 */

const {
  loadHtmlModule, makeRng, sha256Str, writePhysWord, recordResult
} = require('./t5-common');

// ============================================================================
// PURE INDEPENDENT BALANCED-TRIT ORACLE (Zero emulator ALU functions used)
// ============================================================================
function intToBalTritsIndependent(val, width) {
  const trits = new Int8Array(width);
  let v = val;
  for (let i = 0; i < width; i++) {
    let rem = v % 3;
    v = Math.trunc(v / 3);
    if (rem === 2) { rem = -1; v += 1; }
    else if (rem === -2) { rem = 1; v -= 1; }
    trits[i] = rem;
  }
  return { trits, overflow: v !== 0 };
}

function balTritsToIntIndependent(trits, start, len) {
  let acc = 0;
  let pow = 1;
  for (let i = 0; i < len; i++) {
    acc += trits[start + i] * pow;
    pow *= 3;
  }
  return acc;
}

function independentBalancedSplit(va, pageSize) {
  const k = pageSize === 729 ? 6 : 7;
  const w = pageSize === 729 ? 5 : 6; // level width in balanced trits
  const totalTrits = k + 2 * w;       // 16 for 729, 19 for 2187
  const { trits, overflow } = intToBalTritsIndependent(va, totalTrits);
  if (overflow) return null;
  const off = balTritsToIntIndependent(trits, 0, k);
  const idx1 = balTritsToIntIndependent(trits, k, w);
  const idx0 = balTritsToIntIndependent(trits, k + w, w);
  const vpn = balTritsToIntIndependent(trits, k, 2 * w);
  return { off, idx1, idx0, vpn, trits };
}

function independentWirePA(ppn, offTrits, k) {
  // Pure wiring: concatenate frame's balanced trits above offset's low k balanced trits
  const { trits: frameTrits } = intToBalTritsIndependent(ppn, 20);
  const paTrits = new Int8Array(20 + k);
  for (let i = 0; i < k; i++) paTrits[i] = offTrits[i];
  for (let i = 0; i < 20; i++) paTrits[k + i] = frameTrits[i];
  return balTritsToIntIndependent(paTrits, 0, 20 + k);
}

function runBalancedOracleTest(T, addrsPerSize = 1000000, seed = 0xBA1A4CED, opts = {}) {
  const t0 = Date.now();
  const rng = makeRng(seed);
  const perSize = {};

  for (const ps of [729, 2187]) {
    const k = ps === 729 ? 6 : 7;
    const B = (ps - 1) / 2; // 364 or 1093
    const halfVa = ps === 729 ? 21523360 : 581130733; // (3^16-1)/2 or (3^19-1)/2
    const biasDelta = opts.biasDelta || 0; // positive-control hook for bias-off-by-one

    // 1. Exhaustive boundary list: every ±B, ±(B+1), ±(n*3^k ± B), ±(n*3^k ± (B+1))
    const boundaries = [];
    for (let n = -5; n <= 5; n++) {
      const c = n * ps;
      for (const d of [-B - 2, -B - 1, -B, -B + 1, -1, 0, 1, B - 1, B, B + 1, B + 2]) {
        boundaries.push(c + d);
      }
    }
    // Also level-0/level-1 sign-flip boundaries (idx1 = ±121/±364 -> ±122/±365)
    const H = ps === 729 ? 121 : 364;
    for (const vpnEdge of [-H - 1, -H, -1, 0, 1, H, H + 1]) {
      boundaries.push(vpnEdge * ps - B, vpnEdge * ps, vpnEdge * ps + B);
    }
    boundaries.push(-halfVa - 1, -halfVa, halfVa, halfVa + 1);

    const splitter = ps === 729 ? T.t5SplitAddrBal729 : T.t5SplitAddrBal2187;
    let checked = 0;
    let boundaryCount = 0;

    function verifyOneAddress(va, ppnSample) {
      const oracle = independentBalancedSplit(va, ps);
      const got = splitter(va);
      if (oracle === null) {
        if (got !== null) throw new Error(`[t5-10] ps=${ps} va=${va}: expected null (OOB), got ${JSON.stringify(got)}`);
        return;
      }
      if (!got) throw new Error(`[t5-10] ps=${ps} va=${va}: expected valid split, got null`);
      if (got.off !== oracle.off || got.idx1 !== oracle.idx1 || got.idx0 !== oracle.idx0 || got.vpn !== oracle.vpn) {
        throw new Error(`[t5-10] ps=${ps} va=${va}: split mismatch oracle=${JSON.stringify({ off: oracle.off, idx0: oracle.idx0, idx1: oracle.idx1, vpn: oracle.vpn })} got=${JSON.stringify(got)}`);
      }
      if (got.splitCost !== 0) {
        throw new Error(`[t5-10] ps=${ps} va=${va}: balanced splitCost must be 0, got ${got.splitCost}`);
      }
      // Verify physical frame wiring for ppn >= 1
      const wiredPa = independentWirePA(ppnSample, oracle.trits, k);
      const machinePa = ppnSample * ps + got.off;
      if (wiredPa !== machinePa) {
        throw new Error(`[t5-10] ps=${ps} va=${va} ppn=${ppnSample}: PA wiring mismatch wired=${wiredPa} machine=${machinePa}`);
      }
      if (machinePa < B + 1) {
        throw new Error(`[t5-10] ps=${ps} ppn=${ppnSample}: PA ${machinePa} fell into reserved 0..B (${B})`);
      }
      // Verify compiler bias convention for non-negative C pointers P = va + B
      if (va >= -B) {
        const P = va + (B + biasDelta);
        const expectedOff = (P % ps) - B;
        const expectedVpn = Math.floor(P / ps);
        if (got.off !== expectedOff || got.vpn !== expectedVpn) {
          throw new Error(`[t5-10] ps=${ps} P=${P} (va=${va}): compiler bias mismatch expected (vpn=${expectedVpn}, off=${expectedOff}) got (vpn=${got.vpn}, off=${got.off})`);
        }
      }
    }

    for (const va of boundaries) {
      verifyOneAddress(va, 1 + (Math.abs(va) % 500));
      boundaryCount++;
      checked++;
    }
    const remaining = Math.max(0, addrsPerSize - boundaryCount);
    for (let i = 0; i < remaining; i++) {
      const r = rng.u32();
      // Mix of small boundary-adjacent, negative-index, and wide balanced addresses
      let va;
      if ((i & 7) === 0) {
        va = (r % (ps * 20)) - (ps * 10);
      } else {
        va = (r % (halfVa * 2 + 1)) - halfVa;
      }
      const ppn = 1 + (r % 1000);
      verifyOneAddress(va, ppn);
      checked++;
    }

    // 2. Real JS & WASM hardware MMU execution in balanced-3^k covering:
    //    - Positive L0/L1 indices (vpn = 1, 2)
    //    - Negative L1 index with positive L0 (vpn = H+1 = 122 for 729, 365 for 2187 -> idx0=+1, idx1=-H)
    //    - Negative L0 and negative L1 index (vpn = -1 -> idx0=0, idx1=-1; and vpn = -(H+1) -> idx0=-1, idx1=+H)
    //    - Step-by-step JS === WASM state hash lockstep on every step!
    const ramSize = 25 * ps;
    const js = new T.TritonJS({ archMode: 'T3', pageSize: ps, mmuMode: 'balanced', ramSize, diskSectors: 2 });
    const wasm = T.TritonWASM.createSync({ archMode: 'T3', pageSize: ps, mmuMode: 'balanced', ramSize, diskSectors: 2 });

    // Frame layout (all frames >= 1; RAM 0..B untouched for VBR=0):
    //   Frame 1 (center = 1*ps): L0 centred table
    //   Frame 2 (center = 2*ps): L1 table for idx0 = 0
    //   Frame 3 (center = 3*ps): L1 table for idx0 = +1 (handles negative idx1 = -H at vpn = H+1!)
    //   Frame 4 (center = 4*ps): L1 table for idx0 = -1 (handles negative idx0 = -1 at vpn = -(H+1)!)
    //   Frame 5 (center = 5*ps): Code page (mapped at VA vpn=1, center = 1*ps)
    //   Frame 6 (center = 6*ps): Data page A (mapped at VA vpn=2 -> idx0=0, idx1=+2)
    //   Frame 7 (center = 7*ps): Data page B (mapped at VA vpn=H+1 -> idx0=+1, idx1=-H)
    //   Frame 8 (center = 8*ps): Data page C (mapped at VA vpn=-1 -> idx0=0, idx1=-1)
    //   Frame 9 (center = 9*ps): Data page D (mapped at VA vpn=-(H+1) -> idx0=-1, idx1=+H)
    const rwx = T.T5_PTE.V | T.T5_PTE.R | T.T5_PTE.W | T.T5_PTE.X | T.T5_PTE.U;
    const rw = T.T5_PTE.V | T.T5_PTE.R | T.T5_PTE.W | T.T5_PTE.U;
    const l0Base = 1 * ps;

    function mapBal(vms, vpn, ppn, flags) {
      const sp = independentBalancedSplit(vpn * ps, ps);
      const l1Frame = sp.idx0 === 0 ? 2 : (sp.idx0 === 1 ? 3 : 4);
      const pdeAddr = l0Base + sp.idx0 * 3 - 1;
      const pteAddr = l1Frame * ps + sp.idx1 * 3 - 1;
      for (const m of vms) {
        writePhysWord(T, m, pdeAddr, l1Frame * 512 + T.T5_PTE.V);
        writePhysWord(T, m, pteAddr, ppn * 512 + flags);
      }
    }

    mapBal([js, wasm], 1, 5, rwx);
    mapBal([js, wasm], 2, 6, rw);
    mapBal([js, wasm], H + 1, 7, rw);
    mapBal([js, wasm], -1, 8, rw);
    mapBal([js, wasm], -(H + 1), 9, rw);

    function liConst(reg, val) {
      const [w0, w1, w2] = T.numberToWord(val);
      let s = `LI ${reg}, #${w0}\n`;
      if (w1 !== 0) s += `LMI ${reg}, #${w1}\n`;
      if (w2 !== 0) s += `LHI ${reg}, #${w2}\n`;
      return s;
    }

    // Machine addresses of test words across all 4 data pages (including +B and -B offsets!)
    const vaA = 2 * ps - B;          // vpn=2, off=-B -> PA = 6*ps - B
    const vaB = (H + 1) * ps + B;    // vpn=H+1 (idx0=+1, idx1=-H), off=+B -> PA = 7*ps + B
    const vaC = (-1) * ps - B;       // vpn=-1 (idx0=0, idx1=-1), off=-B -> PA = 8*ps - B
    const vaD = (-(H + 1)) * ps + B; // vpn=-(H+1) (idx0=-1, idx1=+H), off=+B -> PA = 9*ps + B

    const prog = T.assemble(`
      .mode T3
      ${liConst('R1', vaA)}
      LI R0, #1111
      ST R0, R1, #0
      ${liConst('R2', vaB)}
      LI R0, #2222
      ST R0, R2, #0
      ${liConst('R3', vaC)}
      LI R0, #3333
      ST R0, R3, #0
      ${liConst('R4', vaD)}
      LI R0, #4444
      ST R0, R4, #0
      LT R5, R1, #0
      LT R6, R2, #0
      LT R7, R3, #0
      LT R8, R4, #0
      HALT
    `, { mode: 'T3' });

    const codeStartPa = 5 * ps - B; // lowest tryte of Frame 5
    const codeStartVa = 1 * ps - B; // lowest tryte of virtual page 1
    for (const m of [js, wasm]) {
      for (let i = 0; i < prog.trytes.length; i++) m.setMem(codeStartPa + i, prog.trytes[i]);
      m.ptbr = l0Base;
      m.pc = codeStartVa;
      m.pgEn = 1;
      m.flushTlbAll();
    }

    let lockstepSteps = 0;
    while (!js.halted && lockstepSteps < 200) {
      js.step();
      wasm.step();
      lockstepSteps++;
      if (T.computeStateHash(js) !== T.computeStateHash(wasm)) {
        throw new Error(`[t5-10] JS/WASM lockstep mismatch in balanced-${ps} at step ${lockstepSteps}`);
      }
    }
    if (!js.halted) throw new Error(`[t5-10] balanced-${ps} program did not halt`);
    // Verify exact values landed at the pure-wired physical addresses!
    if (js.getMem(6 * ps - B) !== 1111 || js.getMem(7 * ps + B) !== 2222 ||
        js.getMem(8 * ps - B) !== 3333 || js.getMem(9 * ps + B) !== 4444) {
      throw new Error(`[t5-10] balanced-${ps} wired physical memory mismatch`);
    }
    if (js.getWordNum(5) !== 1111 || js.getWordNum(6) !== 2222 ||
        js.getWordNum(7) !== 3333 || js.getWordNum(8) !== 4444) {
      throw new Error(`[t5-10] balanced-${ps} register readback mismatch`);
    }

    perSize[ps] = {
      addressesChecked: checked,
      boundariesChecked: boundaryCount,
      lockstepSteps,
      negativeIdx0AndIdx1Verified: true
    };
  }

  return {
    test: 10,
    name: 't5-10-balanced-oracle',
    status: 'PASS',
    seed,
    inputHash: sha256Str(`balanced-oracle:${seed}:${addrsPerSize}`),
    totalAddressesChecked: addrsPerSize * 2,
    perSize,
    elapsedMs: Date.now() - t0
  };
}

if (require.main === module) {
  const { T } = loadHtmlModule('triton5.html');
  const res = runBalancedOracleTest(T, 1000000);
  recordResult(res);
  console.log(`[PASS] t5-10-balanced-oracle: ${res.totalAddressesChecked.toLocaleString()} addresses (1,000,000/size x 2, all ±B/±(B+1) boundaries) + centred negative-index walks verified JS === WASM in ${res.elapsedMs} ms`);
}

module.exports = { runBalancedOracleTest, independentBalancedSplit, independentWirePA };
