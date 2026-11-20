'use strict';
/**
 * p-01: Syscall #50..#65 pointer validation probes.
 * Driven by desktop/syscall-table.json, executed through the existing user-mode
 * test agent (d20-common.js on Unit 26) on BOTH TritonWASM and TritonJS.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  TritFS, Unit, T_DATA, T_EXEC,
  loadHtmlModule, bootDesktop2, ensureTestAgentRunning, callGuestFs,
  guestWrite, guestMkdir, guestStat
} = require('./d20-common.js');
const { desktopDir, appendResult } = require('./p-common.js');

const ERR_BADPTR = -14;
const BANK = 19683;
// Agent runs in TCB slot 3 (Slot 0 = Clock, Slot 1 = Terminal, Slot 2 = App Shelf killed by Agent)
const AGENT_SLOT = 3;
const AGENT_UBASE = (10 + 2 * AGENT_SLOT) * BANK; // 314928
const AGENT_ULIMIT = AGENT_UBASE + 2 * BANK;      // 354294
const TERM_SLOT = 1;
const TERM_UBASE = (10 + 2 * TERM_SLOT) * BANK;   // 236196
const TERM_ULIMIT = TERM_UBASE + 2 * BANK;        // 275562
const TCB_BASE = 6000;

function hashRamRange(vm, start, end) {
  const h = crypto.createHash('sha256');
  const buf = new Int16Array(end - start);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = vm.getMem(start + i);
  }
  h.update(Buffer.from(buf.buffer));
  return h.digest('hex');
}

function snapshotOutsideCaller(vm) {
  // Full read-only snapshot of guest RAM regions outside the caller's [AGENT_UBASE, AGENT_ULIMIT):
  // - Kernel code [0, 5800) (contains case (e) kernel memory target)
  // - TCB structural fields (UBASE, ULIMIT, STATE, APP_ID, WIN_ID for all 8 slots)
  // - Terminal live task segment [TERM_UBASE, TERM_ULIMIT) (contains case (f) target)
  // - Guard below UBASE [AGENT_UBASE - 256, AGENT_UBASE) (contains case (b) target)
  // - Guard above ULIMIT [AGENT_ULIMIT, AGENT_ULIMIT + 2048) (contains case (c)/(d) overflow targets)
  // - All other user task banks [AGENT_ULIMIT, 42 * BANK)
  const tcbStruct = [];
  for (let s = 0; s < 8; s++) {
    const base = TCB_BASE + s * 64;
    for (const off of [36, 37, 38, 39, 40, 41, 42, 43, 44]) {
      tcbStruct.push(vm.getMem(base + off));
    }
  }
  return {
    kernelCode: hashRamRange(vm, 0, 5800),
    tcbStruct: tcbStruct.join(','),
    termSeg: hashRamRange(vm, TERM_UBASE, TERM_ULIMIT),
    belowUbase: hashRamRange(vm, AGENT_UBASE - 256, AGENT_UBASE),
    aboveUlimit: hashRamRange(vm, AGENT_ULIMIT, 42 * BANK)
  };
}

function hashUnits(vm, unitList) {
  const out = {};
  for (const u of unitList) {
    if (vm.units && vm.units[u] && vm.units[u].present) {
      out[u] = crypto.createHash('sha256').update(vm.exportUnitTdisk(u)).digest('hex');
    } else {
      out[u] = null;
    }
  }
  return out;
}

function bootWithHtml(htmlFilename, backend) {
  const { T, htmlPath } = loadHtmlModule(htmlFilename);
  const Backend = backend === 'JS' ? T.TritonJS : T.TritonWASM;
  const vm = Backend === T.TritonJS
    ? new T.TritonJS({ archMode: 'T3' })
    : T.TritonWASM.createSync({ archMode: 'T3' });
  const origBoot = T.bootTritOSDesktop.bind(T);
  T.bootTritOSDesktop = function(v, keepDisk = false, options = {}) {
    v._d20AgentReady = false;
    v._d20AgentBootSteps = 0;
    v._d20T = T;
    return origBoot(v, keepDisk, options);
  };
  T.bootTritOSDesktop(vm, false);
  vm.run(300000);
  ensureTestAgentRunning(vm, T);
  return { T, vm, htmlPath };
}

function setupFixture(vm) {
  // Create fixture files/dirs on Unit 1
  const payload32 = Int16Array.from({ length: 32 }, (_, i) => 65 + (i % 26));
  const r1 = guestWrite(vm, '1:/pfile', payload32, T_DATA);
  if (r1 !== 0) throw new Error('Failed to create 1:/pfile: ' + r1);

  const r2 = guestWrite(vm, '1:/pdel', Int16Array.from([1, 2, 3, 4]), T_DATA);
  if (r2 !== 0) throw new Error('Failed to create 1:/pdel: ' + r2);

  const r3 = guestWrite(vm, '1:/pren', Int16Array.from([5, 6, 7, 8]), T_DATA);
  if (r3 !== 0) throw new Error('Failed to create 1:/pren: ' + r3);

  const r4 = guestWrite(vm, '1:/docs/pdoc', payload32, T_DATA);
  if (r4 !== 0) {
    guestMkdir(vm, '1:/docs');
    const r4b = guestWrite(vm, '1:/docs/pdoc', payload32, T_DATA);
    if (r4b !== 0) throw new Error('Failed to create 1:/docs/pdoc: ' + r4b);
  }

  // Create an 8-tryte non-NUL file and read it into [AGENT_ULIMIT - 8, AGENT_ULIMIT - 1]
  // entirely from user mode so case (h) has a genuine unterminated string right at ULIMIT!
  const nonul = Int16Array.from('1:/abcde'.split('').map(c => c.charCodeAt(0)));
  const rn = guestWrite(vm, '1:/nonul', nonul, T_DATA);
  if (rn !== 0) throw new Error('Failed to create 1:/nonul: ' + rn);
  const rr = callGuestFs(vm, 52, {
    arg0: -9001,
    arg1: AGENT_ULIMIT - 8,
    arg2: 8,
    path1: '1:/nonul',
    replySectors: 1,
    replyTrytes: 0
  });
  if (rr.r0 !== 8) {
    throw new Error(`Failed to stage unterminated path at ULIMIT-8 via SYS_FS2_READ: r0=${rr.r0}`);
  }

  // Insert Cartridge on Unit 2 with /apps/PAPP/main for #65 (SYS_FS2_APP_INSTALL)
  const u2 = new Unit(2187, { removable: true });
  const fs2 = TritFS.mkfs(u2, 'PCART');
  fs2.mkdir('/apps');
  fs2.mkdir('/apps/PAPP');
  fs2.writeFile('/apps/PAPP/main', Int16Array.from([0, 0, 0, 0]), T_EXEC);
  vm.insertUnit(2, u2.toTdisk(), { removable: true, writeProtected: false });

  // Insert blank Unit 3 for #59 (SYS_FS2_FORMAT)
  const u3 = new Unit(2187, { removable: true });
  vm.insertUnit(3, u3.toTdisk(), { removable: true, writeProtected: false });
  vm.run(20000);
}

function buildValidCallOpts(num) {
  const pay16 = Int16Array.from({ length: 16 }, (_, i) => 65 + i);
  switch (num) {
    case 50: return { arg0: -9001, arg1: -9003, arg2: 8, path1: '1:/', replyTrytes: 0 };
    case 51: return { arg0: -9001, arg1: -9003, path1: '1:/pfile', replyTrytes: 0 };
    case 52: return { arg0: -9001, arg1: -9003, arg2: 32, path1: '1:/pfile', replyTrytes: 0 };
    case 53: return { arg0: -9001, arg1: -9003, arg2: 16, arg3: T_DATA, path1: '1:/pout', payload: pay16, replyTrytes: 0 };
    case 54: return { arg0: -9001, arg1: 0, path1: '1:/pdir', replyTrytes: 0 };
    case 55: return { arg0: -9001, path1: '1:/pdel', replyTrytes: 0 };
    case 56: return { arg0: -9001, arg1: -9002, path1: '1:/pren', path2: 'pren2', replyTrytes: 0 };
    case 57: return { arg0: -9001, arg1: -9002, path1: '1:/pfile', path2: '1:/pcopy', replyTrytes: 0 };
    case 58: return { arg0: 1, arg1: -9003, replyTrytes: 0 };
    case 59: return { arg0: 3, arg1: -9001, path1: 'PFMT', replyTrytes: 0, steps: 200000 };
    case 60: return { arg0: 1, arg1: 0, arg2: -9003, replyTrytes: 0, steps: 200000 };
    case 63: return { arg0: -9001, arg1: -9003, arg2: 16, arg3: T_DATA, path1: 'pdoc2', payload: pay16, replyTrytes: 0 };
    case 64: return { arg0: -9001, arg1: -9003, arg2: 32, path1: 'pdoc', replyTrytes: 0 };
    case 65: return { arg0: -9001, path1: 'PAPP', replyTrytes: 0 };
    default: throw new Error(`No fixture for syscall #${num}`);
  }
}

function regToArgKey(reg) {
  return 'arg' + reg.slice(1);
}

function runProbesOnBackend(backend, { htmlFilename = 'tritos-desktop-2.html', filterSyscalls = null } = {}) {
  const table = JSON.parse(fs.readFileSync(path.join(desktopDir, 'syscall-table.json'), 'utf8'));
  const { vm } = bootWithHtml(htmlFilename, backend);
  setupFixture(vm);

  const unitList = [0, 1, 2, 3];
  const results = [];
  let totalCases = 0;
  let validCases = 0;
  let badCases = 0;

  for (const sc of table.syscalls) {
    if (sc.pointerArgs.length === 0) continue;
    if (filterSyscalls && !filterSyscalls.includes(sc.num)) continue;

    // 1. Run bad cases FIRST (so control calls like delete/rename/format don't mutate fixtures before bad probes)
    for (const pa of sc.pointerArgs) {
      const argKey = regToArgKey(pa.reg);
      const cases = [
        { id: 'b', label: 'UBASE-1', addr: AGENT_UBASE - 1 },
        { id: 'c', label: 'ULIMIT', addr: AGENT_ULIMIT },
        { id: 'd', label: 'straddle-ULIMIT', addr: AGENT_ULIMIT - 4 },
        { id: 'e', label: 'kernel-mem', addr: 100 },
        { id: 'f', label: 'other-task-seg', addr: TERM_UBASE + 5000 },
        { id: 'g', label: 'tcb-table', addr: TCB_BASE }
      ];
      if (pa.kind === 'stringz') {
        cases.push({ id: 'h', label: 'no-nul-before-ULIMIT', addr: AGENT_ULIMIT - 8 });
      }
      // For #52 and #64 dst_buf_ptr, also probe case (d) with max_trytes = 0 ("read whole file")
      if ((sc.num === 52 || sc.num === 64) && pa.reg === 'R1') {
        cases.push({ id: 'd_whole', label: 'straddle-ULIMIT-wholefile(max=0)', addr: AGENT_ULIMIT - 8, extra: { arg2: 0 } });
      }

      for (const c of cases) {
        const opts = buildValidCallOpts(sc.num);
        opts[argKey] = c.addr;
        if (c.extra) Object.assign(opts, c.extra);

        const ramBefore = snapshotOutsideCaller(vm);
        const unitsBefore = hashUnits(vm, unitList);

        const res = callGuestFs(vm, sc.num, opts);

        const ramAfter = snapshotOutsideCaller(vm);
        const unitsAfter = hashUnits(vm, unitList);

        const ramMatch = JSON.stringify(ramBefore) === JSON.stringify(ramAfter);
        const unitsMatch = JSON.stringify(unitsBefore) === JSON.stringify(unitsAfter);
        const ok = (res.r0 === ERR_BADPTR) && ramMatch && unitsMatch;

        results.push({
          syscall: sc.num,
          name: sc.name,
          arg: pa.reg,
          caseId: c.id,
          r0: res.r0,
          r1: res.r1,
          ramMatch,
          unitsMatch,
          ok
        });
        totalCases++;
        badCases++;
        if (!ok) {
          throw new Error(
            `[p-01 ${backend}] #${sc.num} ${sc.name} ${pa.reg} case (${c.id}:${c.label}) FAILED: ` +
            `r0=${res.r0} (expected ${ERR_BADPTR}), ramMatch=${ramMatch}, unitsMatch=${unitsMatch}`
          );
        }
      }
    }

    // 2. Run case (a): valid in-range pointer control!
    const ctrlOpts = buildValidCallOpts(sc.num);
    const ctrlRes = callGuestFs(vm, sc.num, ctrlOpts);
    const ctrlOk = ctrlRes.r0 >= 0;
    results.push({
      syscall: sc.num,
      name: sc.name,
      arg: 'all',
      caseId: 'a',
      r0: ctrlRes.r0,
      r1: ctrlRes.r1,
      ramMatch: true,
      unitsMatch: true,
      ok: ctrlOk
    });
    totalCases++;
    validCases++;
    if (!ctrlOk) {
      throw new Error(`[p-01 ${backend}] #${sc.num} ${sc.name} case (a:valid-control) FAILED: r0=${ctrlRes.r0}`);
    }
  }

  // Verify agent is still alive after all probes
  const aliveSt = guestStat(vm, '1:/pfile');
  if (!aliveSt || aliveSt.len !== 32) {
    throw new Error(`[p-01 ${backend}] Agent not responsive after probes`);
  }

  return { backend, totalCases, validCases, badCases, results };
}

function runTest() {
  const t0 = Date.now();
  const wasmRes = runProbesOnBackend('WASM');
  const jsRes = runProbesOnBackend('JS');

  if (wasmRes.results.length !== jsRes.results.length) {
    throw new Error(`JS/WASM case count mismatch: WASM=${wasmRes.results.length} vs JS=${jsRes.results.length}`);
  }
  let mismatches = 0;
  for (let i = 0; i < wasmRes.results.length; i++) {
    const w = wasmRes.results[i];
    const j = jsRes.results[i];
    if (w.r0 !== j.r0 || w.r1 !== j.r1 || w.ok !== j.ok) {
      mismatches++;
      throw new Error(`JS/WASM mismatch at #${w.syscall} ${w.arg} (${w.caseId}): WASM=${w.r0}/${w.r1} vs JS=${j.r0}/${j.r1}`);
    }
  }

  const elapsedMs = Date.now() - t0;
  const wasmNums = {
    totalCases: wasmRes.totalCases,
    validCases: wasmRes.validCases,
    badCases: wasmRes.badCases,
    jsWasmMismatches: mismatches,
    elapsedMs
  };
  appendResult({ testId: 'p-01', backend: 'TritonWASM', seed: 0, pass: true, numbers: wasmNums });
  appendResult({ testId: 'p-01', backend: 'TritonJS', seed: 0, pass: true, numbers: wasmNums });

  return {
    name: 'p-01-pointer-probes',
    status: 'PASS',
    ...wasmNums
  };
}

if (require.main === module) {
  console.log(JSON.stringify(runTest()));
}
module.exports = { runTest, runProbesOnBackend };
