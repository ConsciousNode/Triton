'use strict';
/**
 * TritOS Desktop 2.0 Build Script (triton/desktop/build_desktop2.js)
 * Assembles desktop/guest-200.asm, verifies memory-map and far-target bounds,
 * and builds desktop/tritos-desktop-2.html from triton4.html and tritos-desktop.html.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const desktopDir = __dirname;
const repoRoot = path.resolve(desktopDir, '..');

function buildDesktop2(opts = {}) {
  const noPtrCheck = Boolean(opts.noPtrCheck);
  const outPath = opts.outPath || path.join(desktopDir, 'tritos-desktop-2.html');
  const guest200Path = path.join(desktopDir, 'guest-200.asm');
  let asm = fs.readFileSync(guest200Path, 'utf8');
  if (noPtrCheck) {
    if (!asm.includes('  ; __NO_PTR_CHECK__')) {
      throw new Error('Could not find ; __NO_PTR_CHECK__ hook in guest-200.asm');
    }
    asm = asm.replace('  ; __NO_PTR_CHECK__', '  LI R0, #0\n  RET ; --no-ptr-check');
  }

  // 1. Load triton4.html and assemble guest-200.asm
  const { loadHtmlModule } = require(path.join(desktopDir, 'tests', 't3-common.js'));
  const { T: T4 } = loadHtmlModule('../triton4.html');
  const built = T4.assemble(asm, { mode: 'T3' });

  // 2. Verify low-memory kernel bounds (< VEC_BASE=5800 and < DRV_NET_INIT=9460)
  if (built.symbols.FW_EXIT + 18 > 5800) {
    throw new Error(`Low kernel code overflowed VEC_BASE (5800): FW_EXIT=${built.symbols.FW_EXIT}`);
  }
  if (built.symbols.KFSD_65 + 6 > built.symbols.DRV_FS_INIT) {
    throw new Error(`Bridge overflowed DRIVER fs v2: KFSD_65=${built.symbols.KFSD_65} DRV_FS_INIT=${built.symbols.DRV_FS_INIT}`);
  }
  if (built.symbols.END_OF_CORE_KERNEL > 9460) {
    throw new Error(`Mid kernel code overflowed DRV_NET_INIT (9460): END_OF_CORE_KERNEL=${built.symbols.END_OF_CORE_KERNEL}`);
  }

  // 3. Verify every far target (#sym - 59049) fits within 9-trit signed immediate (±9,841)
  const farTargets = [];
  const lines = asm.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const clean = lines[i].split(';')[0];
    const m = clean.match(/#([A-Za-z0-9_]+)\s*-\s*59049/);
    if (m) {
      const sym = m[1].toUpperCase();
      const addr = built.symbols[sym];
      if (typeof addr !== 'number') {
        throw new Error(`Undefined symbol in far target at line ${i + 1}: ${m[1]}`);
      }
      const offset = addr - 59049;
      if (Math.abs(offset) > 9841) {
        throw new Error(`Far target ${m[1]} (${addr}) minus 59049 = ${offset} exceeds ±9841 at line ${i + 1}`);
      }
      farTargets.push({ line: i + 1, symbol: m[1], addr, offset });
    }
  }

  // 4. Extract machine block from triton4.html
  const d1Html = fs.readFileSync(path.join(desktopDir, 'tritos-desktop.html'), 'utf8');
  const t4FullHtml = fs.readFileSync(path.join(repoRoot, 'triton4.html'), 'utf8');
  const t4Lines = t4FullHtml.split('\n');
  const t4Start = t4Lines.findIndex((l, i) => l === '(function() {' && (t4Lines[i - 1] === '<script>' || t4Lines[i - 1] === '//BEGIN_TRITON3_MACHINE_BLOCK'));
  const t4End = t4Lines.findIndex(l => l.includes('globalThis.TritonSystem = TritonSystem;')) + 1;
  if (t4Start < 0 || t4End <= t4Start) {
    throw new Error('Could not find machine block in triton4.html');
  }
  const t4MachineBlock = t4Lines.slice(t4Start, t4End + 1).join('\n');
  const t4MachineHash = crypto.createHash('sha256').update(t4MachineBlock + '\n', 'utf8').digest('hex');

  // 5. Build template version of guest-200.asm with perturbation hooks preserved
  let templateAsm = asm;
  templateAsm = templateAsm.replace('  ; normal compositor', '  ; __PERTURB_COMPOSITOR__');
  templateAsm = templateAsm.replace('  ; normal shuffle', '  ; __PERTURB_SOLITAIRE_SHUFFLE__');
  templateAsm = templateAsm.replace('  .tryte #1,#0, #1,#1, #2,#1, #1,#2', '  ; __PERTURB_TETRIS_ROTATION__');
  templateAsm = templateAsm.replace('  ; normal checksum', '  ; __PERTURB_NET_CHECKSUM__');
  templateAsm = templateAsm.replace('  .tryte #0,#0, #0,#1, #0,#2, #0,#3 ; P1 rot 0', '  ; __PERTURB_TRY_ROTATION__');
  templateAsm = templateAsm.replace('  ; normal Mulberry32 inc', '  ; __PERTURB_TRY_PRNG__');
  templateAsm = templateAsm.replace('  LI R2, #12\n  BCOPY R0, R1, R2', '  ; __PERTURB_TRY_COLLAPSE__');
  templateAsm = templateAsm.replace('  ; same row', '  ; __PERTURB_TRY_COLLAPSE_SAME__');
  templateAsm = templateAsm.replace('  .tryte #2, #3, #4, #5, #6', '  ; __PERTURB_TRY_SCORE__');

  const shExprStart = templateAsm.indexOf('\nsh_parse_expr:\n');
  const shFactorStart = templateAsm.indexOf('\nsh_parse_factor:\n');
  if (shExprStart < 0 || shFactorStart < 0) {
    throw new Error('Could not find sh_parse_expr / sh_parse_factor');
  }
  templateAsm = templateAsm.slice(0, shExprStart) + '\n; __SHEET_EXPR_PARSER__\n' + templateAsm.slice(shFactorStart);

  templateAsm = templateAsm.replace(/TritOS Desktop 1\.1(\.\d+)?/gi, 'TritOS Desktop');
  templateAsm = templateAsm.replace(/TRITOS DESKTOP 1\.1(\.\d+)?/g, 'TRITOS DESKTOP');

  let d2Html = d1Html;

  d2Html = d2Html.replace(
    /const TRITOS_DESKTOP_TEMPLATE = [\s\S]*?;\nconst SHEET_EXPR_NORMAL =/,
    () => 'const TRITOS_DESKTOP_TEMPLATE = ' + JSON.stringify(templateAsm) + ';\nconst SHEET_EXPR_NORMAL ='
  );

  d2Html = d2Html.replace(
    'const TRITOS_VERSION = "TritOS Desktop 1.1.2";',
    'const TRITOS_VERSION = "TritOS Desktop 2.0";'
  );

  d2Html = d2Html.replace(/TRITOS DESKTOP 1\.1(\.\d+)?/g, 'TRITOS DESKTOP');
  d2Html = d2Html.replace(/TritOS Desktop 1\.0\/1\.1/g, 'TritOS Desktop');
  d2Html = d2Html.replace(/TritOS Desktop 1\.1(\.\d+)?/g, 'TritOS Desktop');
  d2Html = d2Html.replace(/ffc89ac07c9294bc3d746172633dd8d1479d5d361768223501dc73ab65ad2a5d/, t4MachineHash);
  d2Html = d2Html.replace(/triton3\.html/g, 'triton4.html');
  d2Html = d2Html.replace(/TRITON 3\.1\.1 HARDWARE INSTRUMENT/g, 'TRITON 4.0 HARDWARE INSTRUMENT');
  d2Html = d2Html.replace(/Triton 3\.1/g, 'Triton 4.0');

  d2Html = d2Html.replace(
    /\/\/BEGIN_TRITON3_MACHINE_BLOCK\n[\s\S]*?\n\/\/END_TRITON3_MACHINE_BLOCK/,
    () => '//BEGIN_TRITON3_MACHINE_BLOCK\n' + t4MachineBlock + '\n//END_TRITON3_MACHINE_BLOCK'
  );

  const oldBootFn = `function bootTritOSDesktop(vm, keepDisk = false, options = {}) {
  const src = (options && Object.keys(options).length > 0) ? buildTritOSDesktopSource(options) : TRITOS_DESKTOP_SRC;
  const built = TritonSystem.assemble(src, { mode: 'T3' });
  vm.defaultArchMode = 1;
  vm.reset(keepDisk);
  for (let i = 0; i < built.trytes.length; i++) {
    if (vm.setDisk) vm.setDisk(i, built.trytes[i]);
    else vm.disk[i] = built.trytes[i];
  }
  vm.loadProgram(built.trytes.slice(0, 32), 0);
  return built;
}`;

  const newBootFn = `function installDesktopClockPacing(vm, options = {}) {
  if (!vm || vm._desktopClockWrapped) return;
  vm._desktopClockWrapped = true;
  vm._origRun = vm.run.bind(vm);
  vm._origAdvanceClockUs = vm.advanceClockUs ? vm.advanceClockUs.bind(vm) : null;
  vm._origAdvanceClockMs = vm.advanceClockMs ? vm.advanceClockMs.bind(vm) : null;
  vm._origSetClockMs = vm.setClockMs ? vm.setClockMs.bind(vm) : null;
  vm._origSetClockSource = vm.setClockSource ? vm.setClockSource.bind(vm) : null;
  vm._explicitClock = Boolean(options.explicitClock);

  if (vm._origAdvanceClockMs) {
    vm.advanceClockMs = function(ms) {
      vm._explicitClock = true;
      return vm._origAdvanceClockMs(ms);
    };
  }
  if (vm._origAdvanceClockUs) {
    vm.advanceClockUs = function(us) {
      vm._explicitClock = true;
      return vm._origAdvanceClockUs(us);
    };
  }
  if (vm._origSetClockMs) {
    vm.setClockMs = function(ms) {
      vm._explicitClock = true;
      return vm._origSetClockMs(ms);
    };
  }
  if (vm._origSetClockSource) {
    vm.setClockSource = function(fn) {
      vm._explicitClock = true;
      return vm._origSetClockSource(fn);
    };
  }

  vm.run = function(maxSteps = 100000) {
    if (vm._explicitClock || vm.clockFn || !vm._origAdvanceClockUs) {
      return vm._origRun(maxSteps);
    }
    let rem = maxSteps | 0;
    let total = 0;
    while (rem > 0 && !vm.halted) {
      const slice = rem > 500 ? 500 : rem;
      vm._origAdvanceClockUs(slice * 5);
      const ran = vm._origRun(slice);
      total += ran;
      rem -= slice;
      if (ran < slice) break;
    }
    return total;
  };
}

function bootTritOSDesktop(vm, keepDisk = false, options = {}) {
  const src = (options && Object.keys(options).length > 0) ? buildTritOSDesktopSource(options) : TRITOS_DESKTOP_SRC;
  const built = TritonSystem.assemble(src, { mode: 'T3' });
  vm.defaultArchMode = 1;
  vm.reset(keepDisk);
  for (let i = 0; i < built.trytes.length; i++) {
    if (vm.setDisk) vm.setDisk(i, built.trytes[i]);
    else vm.disk[i] = built.trytes[i];
  }
  vm.loadProgram(built.trytes.slice(0, 32), 0);
  installDesktopClockPacing(vm, options);
  if (!keepDisk && vm.setRtcSeconds && vm.getRtcSeconds && vm.getRtcSeconds() === 0) {
    const initRtc = (options && options.initialRtcSeconds !== undefined) ? options.initialRtcSeconds : 820454400;
    vm.setRtcSeconds(initRtc);
  }
  return built;
}`;

  if (!d2Html.includes(oldBootFn)) throw new Error('Could not find oldBootFn in d1Html');
  d2Html = d2Html.replace(oldBootFn, () => newBootFn);

  // Pass the browser's real wall clock (clock: Date.now) when booting in a browser
  const oldBrowserVmInit = "    const wasmVm = T.TritonWASM.createSync({ archMode: 'T3', nodeId: initialNodeId });\n    const jsVm = new T.TritonJS({ archMode: 'T3', nodeId: initialNodeId });";
  const newBrowserVmInit = "    const wasmVm = T.TritonWASM.createSync({ archMode: 'T3', nodeId: initialNodeId, clock: Date.now });\n    const jsVm = new T.TritonJS({ archMode: 'T3', nodeId: initialNodeId, clock: Date.now });";
  if (!d2Html.includes(oldBrowserVmInit)) throw new Error('Could not find browser VM init in d1Html');
  d2Html = d2Html.replace(oldBrowserVmInit, () => newBrowserVmInit);

  fs.writeFileSync(outPath, d2Html, 'utf8');

  return {
    trytes: built.trytes.length,
    sectors: Math.ceil(built.trytes.length / 729),
    fwExit: built.symbols.FW_EXIT,
    endOfCoreKernel: built.symbols.END_OF_CORE_KERNEL,
    farTargetsCount: farTargets.length,
    farTargets,
    machineSha256: t4MachineHash,
    htmlBytes: d2Html.length
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const noPtrCheck = args.includes('--no-ptr-check');
  const outIdx = args.indexOf('--out');
  const outPath = (outIdx >= 0 && args[outIdx + 1]) ? path.resolve(args[outIdx + 1]) : undefined;
  const res = buildDesktop2({ noPtrCheck, outPath });
  console.log(JSON.stringify({
    status: 'OK',
    trytes: res.trytes,
    sectors: res.sectors,
    fwExit: res.fwExit,
    endOfCoreKernel: res.endOfCoreKernel,
    farTargetsCount: res.farTargetsCount,
    maxFarOffset: Math.max(...res.farTargets.map(t => Math.abs(t.offset))),
    machineSha256: res.machineSha256,
    htmlBytes: res.htmlBytes
  }, null, 2));
}

module.exports = { buildDesktop2 };
