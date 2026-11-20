'use strict';
// [INLINE] Shared test helpers for TritOS Desktop 2.0 (ConsciousNode SoftWorks, MIT).
// Drives all path syscalls (#50..#65) through a user-mode test app (/apps/AGENT/main)
// placed on a cartridge, launched via App Shelf with mouse and key events, and
// communicating via files on Unit 26 (26:/rdy, 26:/cmd, 26:/res, 26:/done).
const { loadHtmlModule, readFbString, makeMouseTracker } = require('./t3-common.js');
const {
  TritFS, Unit, wordToTrytes, trytesToWord,
  SECTOR, PER_SLT, ENTRY,
  T_DATA, T_IMAGE, T_ASM, T_EXEC, T_DIR,
  L_FREE, L_END, L_BAD, L_RES
} = require('./tritfs-ref.js');

function putWord(buf, off, val) {
  const [t0, t1, t2] = wordToTrytes(val);
  buf[off] = t0;
  buf[off + 1] = t1;
  buf[off + 2] = t2;
}

function getWord(buf, off) {
  return trytesToWord(buf, off);
}

function putStrZ(buf, off, str) {
  for (let i = 0; i < str.length; i++) buf[off + i] = str.charCodeAt(i);
  buf[off + str.length] = 0;
}

function getStrZ(buf, off, maxLen = 16) {
  let s = '';
  for (let i = 0; i < maxLen; i++) {
    const c = buf[off + i];
    if (!c) break;
    s += String.fromCharCode(c);
  }
  return s;
}

// User-mode test app launched from Cartridge 2:/apps/AGENT/main via App Shelf (App 14).
const D20_AGENT_ASM = `
.mode T3
.org 0
agent_entry:
  ; Close App 14 (App Shelf) window so its TCB slot is freed and desktop windows stay clean
  LI R0, #4600
  ADD R0, R0, R8
  SYSCALL #6 ; SYS_LIST_TASKS -> 8 * 8-tryte entries at UBASE+4600
  LI R4, #0
ag_kill_shf_lp:
  CMPI R4, #8
  JNNX ag_kill_shf_dn
  MULI R1, R4, #8
  ADDI R1, R1, #4600
  ADD R1, R1, R8
  LT R0, R1, #1 ; state
  CMPI R0, #0
  JZX ag_kill_shf_nx
  LT R0, R1, #2 ; app_id
  CMPI R0, #14
  JNZX ag_kill_shf_nx
  MOV R0, R4
  SYSCALL #5 ; SYS_KILL_TASK
ag_kill_shf_nx:
  ADDI R4, R4, #1
  JMPX ag_kill_shf_lp
ag_kill_shf_dn:

  ; Initialize last_seq = 0 at UBASE + 4580
  LI R6, #4580
  ADD R6, R6, R8
  LI R0, #0
  SW R0, R6, #0

  ; Write "26:/rdy" (1 tryte = 1) to signal user-mode agent is ready
  LI R0, #1
  ST R0, R6, #6
  LI R0, #str_rdy_path - agent_entry
  ADD R0, R0, R8
  ADDI R1, R6, #6
  LI R2, #1
  LI R3, #1
  SYSCALL #53

agent_loop:
  ; Check if Unit 26 is mounted via SYSCALL #58 (SYS_FS2_UNIT_INFO)
  LI R0, #26
  LI R1, #4540
  ADD R1, R1, R8
  SYSCALL #58
  CMPI R0, #2
  JNZX ag_yield

  ; Read "26:/cmd" into UBASE + 4600 (max 34,000 trytes)
  LI R0, #str_cmd_path - agent_entry
  ADD R0, R0, R8
  LI R1, #4600
  ADD R1, R1, R8
  LI R2, #34000 - 19683
  LMI R2, #1
  SYSCALL #52 ; SYS_FS2_READ
  CMPI R0, #300
  JNX ag_yield

  LI R6, #4600
  ADD R6, R6, R8
  LW R0, R6, #0 ; magic
  LI R1, #6699
  LMI R1, #21   ; 420042
  CMP R0, R1
  JNZX ag_yield

  LW R1, R6, #3 ; seq
  LI R5, #4580
  ADD R5, R5, R8
  LW R0, R5, #0 ; last_seq
  CMP R1, R0
  JZX ag_yield
  SW R1, R5, #0 ; last_seq = seq

  ; If has_input_payload (+7) == 0, zero first 64 trytes of DATA_BUF (UBASE + 4900)
  LT R0, R6, #7
  CMPI R0, #0
  JNZX ag_pay_ok
  LI R0, #4900
  ADD R0, R0, R8
  LI R1, #0
  LI R2, #64
  BFILL R0, R1, R2
ag_pay_ok:

  ; Map arg0..arg3
  LW R0, R6, #11
  CALLX ag_map_arg
  MOV R4, R0
  LW R0, R6, #14
  CALLX ag_map_arg
  MOV R1, R0
  LW R0, R6, #17
  CALLX ag_map_arg
  MOV R2, R0
  LW R3, R6, #20
  MOV R0, R4
  LI R4, #0

  LT R5, R6, #6 ; syscall_num (50..65)
  CALLX ag_invoke_syscall

  ; R0 = primary return, R1 = secondary return
  MOV R4, R0
  MOV R5, R1
  LI R6, #4600
  ADD R6, R6, R8
  LW R2, R6, #8 ; reply_data_len
  CMPI R2, #0
  JNX ag_yield

  ; Build 12-tryte RES_HDR at UBASE + 4888
  LI R7, #4888
  ADD R7, R7, R8
  LI R0, #6700
  LMI R0, #21 ; 420043
  SW R0, R7, #0
  LW R0, R6, #3 ; seq
  SW R0, R7, #3
  SW R4, R7, #6 ; r0
  SW R5, R7, #9 ; r1

  ; Write "26:/res" from UBASE + 4888, length = 12 + reply_data_len
  LI R0, #str_res_path - agent_entry
  ADD R0, R0, R8
  MOV R1, R7
  ADDI R2, R2, #12
  LI R3, #1
  SYSCALL #53 ; SYS_FS2_WRITE

  ; Write "26:/done" (1 tryte = 1) after "26:/res" is completely committed
  LI R6, #4580
  ADD R6, R6, R8
  LI R0, #1
  ST R0, R6, #6
  LI R0, #str_done_path - agent_entry
  ADD R0, R0, R8
  ADDI R1, R6, #6
  LI R2, #1
  LI R3, #1
  SYSCALL #53

ag_yield:
  SYSCALL #2
  JMPX agent_loop

ag_map_arg:
  CMPI R0, #-9001
  JZX ag_ma_p1
  CMPI R0, #-9002
  JZX ag_ma_p2
  CMPI R0, #-9003
  JZX ag_ma_buf
  RET
ag_ma_p1:
  LI R0, #4630
  ADD R0, R0, R8
  RET
ag_ma_p2:
  LI R0, #4710
  ADD R0, R0, R8
  RET
ag_ma_buf:
  LI R0, #4900
  ADD R0, R0, R8
  RET

ag_invoke_syscall:
  CMPI R5, #50
  JZX ag_s50
  CMPI R5, #51
  JZX ag_s51
  CMPI R5, #52
  JZX ag_s52
  CMPI R5, #53
  JZX ag_s53
  CMPI R5, #54
  JZX ag_s54
  CMPI R5, #55
  JZX ag_s55
  CMPI R5, #56
  JZX ag_s56
  CMPI R5, #57
  JZX ag_s57
  CMPI R5, #58
  JZX ag_s58
  CMPI R5, #59
  JZX ag_s59
  CMPI R5, #60
  JZX ag_s60
  CMPI R5, #61
  JZX ag_s61
  CMPI R5, #62
  JZX ag_s62
  CMPI R5, #63
  JZX ag_s63
  CMPI R5, #64
  JZX ag_s64
  CMPI R5, #65
  JZX ag_s65
  LI R0, #-1
  RET
ag_s50:
  SYSCALL #50
  RET
ag_s51:
  SYSCALL #51
  RET
ag_s52:
  SYSCALL #52
  RET
ag_s53:
  SYSCALL #53
  RET
ag_s54:
  SYSCALL #54
  RET
ag_s55:
  SYSCALL #55
  RET
ag_s56:
  SYSCALL #56
  RET
ag_s57:
  SYSCALL #57
  RET
ag_s58:
  SYSCALL #58
  RET
ag_s59:
  SYSCALL #59
  RET
ag_s60:
  SYSCALL #60
  RET
ag_s61:
  SYSCALL #61
  RET
ag_s62:
  SYSCALL #62
  RET
ag_s63:
  SYSCALL #63
  RET
ag_s64:
  SYSCALL #64
  RET
ag_s65:
  SYSCALL #65
  RET

str_rdy_path:  .stringz "26:/rdy"
str_cmd_path:  .stringz "26:/cmd"
str_res_path:  .stringz "26:/res"
str_done_path: .stringz "26:/done"
`;

let cachedAgentTrytes = null;
let nextRpcSeq = 1;

function ensureTestAgentRunning(vm, T) {
  if (vm._d20AgentReady && vm.steps >= vm._d20AgentBootSteps) return;
  if (!cachedAgentTrytes) {
    const built = T.assemble(D20_AGENT_ASM, { mode: 'T3' });
    if (built.errors && built.errors.length) {
      throw new Error('Failed to assemble D20_AGENT_ASM: ' + built.errors.join('; '));
    }
    cachedAgentTrytes = built.trytes;
  }

  // Save any existing Unit 2 cartridge so we can restore it after launching AGENT
  const hadUnit2 = vm.units && vm.units[2] && vm.units[2].present;
  const savedUnit2Bytes = hadUnit2 ? vm.exportUnitTdisk(2) : null;
  const savedUnit2Opts = hadUnit2 ? {
    removable: vm.units[2].removable,
    writeProtected: vm.units[2].writeProtected
  } : null;

  // Insert blank TritFS v2 volume on Unit 26 so AGENT can write 26:/rdy
  const u26 = new Unit(2187, { removable: true });
  TritFS.mkfs(u26, 'RPC');
  vm.insertUnit(26, u26.toTdisk(), { removable: true, writeProtected: false });

  // Build cartridge with /apps/AGENT/main on Unit 2
  const cartUnit = new Unit(2187, { removable: true });
  const cartFs = TritFS.mkfs(cartUnit, 'AGENTCART');
  cartFs.mkdir('/apps');
  cartFs.mkdir('/apps/AGENT');
  cartFs.writeFile('/apps/AGENT/main', cachedAgentTrytes, T_EXEC);

  vm.insertUnit(2, cartUnit.toTdisk(), { removable: true, writeProtected: false });
  vm.run(40000);

  // Click [APPS] on taskbar Row 2 (x = 170, y = 478) and return cursor to (364, 230)
  const mouse = makeMouseTracker(vm);
  mouse.click(170, 478, 250000);
  mouse.moveTo(364, 230, 0);

  // Press Enter (13) in App Shelf to launch 2:/apps/AGENT/main via SYS_EXEC_BUF
  vm.pushKeyEvent(13, 0);
  let ready = false;
  for (let i = 0; i < 25; i++) {
    vm.run(30000);
    try {
      const checkU26 = Unit.fromTdisk(vm.exportUnitTdisk(26));
      if (new TritFS(checkU26).stat('/rdy')) {
        ready = true;
        break;
      }
    } catch (_) {}
  }
  if (!ready) {
    throw new Error('User-mode cartridge test agent failed to launch via App Shelf');
  }

  // Eject Unit 26 and bootstrap Unit 2 (or restore previous Unit 2)
  vm.ejectUnit(26);
  if (hadUnit2 && savedUnit2Bytes) {
    vm.insertUnit(2, savedUnit2Bytes, savedUnit2Opts);
  } else {
    vm.ejectUnit(2);
  }
  vm.run(25000);

  vm._d20AgentReady = true;
  vm._d20AgentBootSteps = vm.steps;
  vm._d20T = T;
}

function bootDesktop2(opts = {}) {
  const { T, htmlPath } = loadHtmlModule('tritos-desktop-2.html');
  const Backend = opts.backend === 'JS' ? T.TritonJS : T.TritonWASM;
  const vm = Backend === T.TritonJS
    ? new T.TritonJS({ archMode: 'T3', hostClock: opts.hostClock || null })
    : T.TritonWASM.createSync({ archMode: 'T3', hostClock: opts.hostClock || null });
  const origBoot = T.bootTritOSDesktop.bind(T);
  T.bootTritOSDesktop = function(v, keepDisk = false, options = {}) {
    v._d20AgentReady = false;
    v._d20AgentBootSteps = 0;
    v._d20T = T;
    return origBoot(v, keepDisk, options);
  };
  T.bootTritOSDesktop(vm, false);
  vm.run(opts.bootSteps || 300000);
  if (opts.launchAgent !== false) {
    ensureTestAgentRunning(vm, T);
  }
  return { T, vm, htmlPath };
}

function prepareGuestCmd(vm, syscallNum, {
  arg0 = 0, arg1 = 0, arg2 = 0, arg3 = 0,
  path1 = '', path2 = '', payload = null,
  replySectors = 1, replyTrytes = null
} = {}) {
  if (!vm._d20AgentReady || vm.steps < vm._d20AgentBootSteps) {
    ensureTestAgentRunning(vm, vm._d20T);
  }
  const seq = nextRpcSeq++;
  const payloadArr = payload ? (payload instanceof Int16Array ? payload : Int16Array.from(payload)) : null;
  const cmdLen = 300 + (payloadArr ? payloadArr.length : 0);
  const cmdTrytes = new Int16Array(cmdLen);

  const repDataLen = replySectors === 0
    ? -1
    : (replyTrytes !== null ? replyTrytes : (replySectors === 1 ? 64 : (replySectors - 1) * SECTOR));

  putWord(cmdTrytes, 0, 420042);
  putWord(cmdTrytes, 3, seq);
  cmdTrytes[6] = syscallNum;
  cmdTrytes[7] = payloadArr ? 1 : 0;
  putWord(cmdTrytes, 8, repDataLen);
  putWord(cmdTrytes, 11, arg0);
  putWord(cmdTrytes, 14, arg1);
  putWord(cmdTrytes, 17, arg2);
  putWord(cmdTrytes, 20, arg3);
  if (path1) putStrZ(cmdTrytes, 30, path1);
  if (path2) putStrZ(cmdTrytes, 110, path2);
  if (payloadArr) cmdTrytes.set(payloadArr, 300);

  const u26 = new Unit(2187, { removable: true });
  const fs26 = TritFS.mkfs(u26, 'RPC');
  fs26.writeFile('/cmd', cmdTrytes, T_DATA);
  vm.insertUnit(26, u26.toTdisk(), { removable: true, writeProtected: false });
  return seq;
}

function callGuestFs(vm, syscallNum, opts = {}) {
  const {
    path1 = '',
    replySectors = 1,
    steps = 60000
  } = opts;
  const seq = prepareGuestCmd(vm, syscallNum, opts);

  if (replySectors === 0) {
    vm.run(Math.max(steps, 250000));
    vm._d20AgentBootSteps = vm.steps;
    return { r0: 0, r1: 0, data: null };
  }

  const chunk = 20000;
  const maxSteps = Math.max(steps * 20, 6000000);
  let totalRan = 0;
  let resTrytes = null;
  while (totalRan < maxSteps && !vm.halted) {
    vm.run(chunk);
    totalRan += chunk;
    try {
      const outUnit = Unit.fromTdisk(vm.exportUnitTdisk(26));
      const outFs = new TritFS(outUnit);
      if (outFs.stat('/done') && outFs.stat('/res')) {
        vm.run(5000);
        const finalUnit = Unit.fromTdisk(vm.exportUnitTdisk(26));
        resTrytes = new TritFS(finalUnit).readFile('/res');
        break;
      }
    } catch (_) {
      // Mid-write on Unit 26; continue stepping until /done is committed
    }
  }
  vm.ejectUnit(26);
  vm.run(5000);
  vm._d20AgentBootSteps = vm.steps;

  if (!resTrytes) {
    throw new Error(`Guest RPC #${syscallNum} (${path1}) did not complete in ${totalRan} steps`);
  }
  const magic = getWord(resTrytes, 0);
  const gotSeq = getWord(resTrytes, 3);
  if (magic !== 420043 || gotSeq !== seq) {
    throw new Error(`Guest RPC #${syscallNum} (${path1}) mismatch: magic=${magic}, seq=${gotSeq}/${seq}`);
  }
  const r0 = getWord(resTrytes, 6);
  const r1 = getWord(resTrytes, 9);
  const data = resTrytes.slice(12);
  return { r0, r1, data };
}

function parseEntry27(buf, off = 0) {
  return {
    name: getStrZ(buf, off, 16),
    type: buf[off + 16],
    flags: buf[off + 17],
    first: getWord(buf, off + 18),
    len: getWord(buf, off + 21),
    mtime: getWord(buf, off + 24)
  };
}

function guestList(vm, pathStr, maxEntries = 64, steps = 80000) {
  const neededTrytes = maxEntries * ENTRY;
  const res = callGuestFs(vm, 50, {
    arg0: -9001,
    arg1: -9003,
    arg2: maxEntries,
    path1: pathStr,
    replySectors: 1,
    replyTrytes: neededTrytes,
    steps
  });
  if (res.r0 < 0) return { count: res.r0, entries: [] };
  const entries = [];
  const count = Math.min(res.r0, maxEntries);
  for (let i = 0; i < count; i++) {
    entries.push(parseEntry27(res.data, i * ENTRY));
  }
  return { count: res.r0, entries };
}

function guestStat(vm, pathStr) {
  const res = callGuestFs(vm, 51, {
    arg0: -9001,
    arg1: -9003,
    path1: pathStr,
    replySectors: 1,
    replyTrytes: ENTRY
  });
  if (res.r0 < 0) return null;
  return parseEntry27(res.data, 0);
}

function guestRead(vm, pathStr, maxLen = 8000) {
  const res = callGuestFs(vm, 52, {
    arg0: -9001,
    arg1: -9003,
    arg2: maxLen,
    path1: pathStr,
    replySectors: 1,
    replyTrytes: maxLen,
    steps: 80000
  });
  if (res.r0 < 0) return { status: res.r0, data: null };
  return { status: res.r0, data: res.data.slice(0, res.r0) };
}

function guestWrite(vm, pathStr, data, type = T_DATA, { replySectors = 1, steps = 100000 } = {}) {
  const arr = data instanceof Int16Array ? data : Int16Array.from(data);
  return callGuestFs(vm, 53, {
    arg0: -9001,
    arg1: -9003,
    arg2: arr.length,
    arg3: type,
    path1: pathStr,
    payload: arr,
    replySectors,
    replyTrytes: 0,
    steps
  }).r0;
}

function guestMkdir(vm, pathStr, { replySectors = 1, steps = 80000 } = {}) {
  return callGuestFs(vm, 54, { arg0: -9001, path1: pathStr, replySectors, replyTrytes: 0, steps }).r0;
}

function guestDelete(vm, pathStr, { replySectors = 1, steps = 80000 } = {}) {
  return callGuestFs(vm, 55, { arg0: -9001, path1: pathStr, replySectors, replyTrytes: 0, steps }).r0;
}

function guestRename(vm, pathStr, newNameOrPath, { replySectors = 1, steps = 80000 } = {}) {
  return callGuestFs(vm, 56, {
    arg0: -9001,
    arg1: -9002,
    path1: pathStr,
    path2: newNameOrPath,
    replySectors,
    replyTrytes: 0,
    steps
  }).r0;
}

function guestCopy(vm, srcPath, dstPath, { replySectors = 1, steps = 150000 } = {}) {
  return callGuestFs(vm, 57, {
    arg0: -9001,
    arg1: -9002,
    path1: srcPath,
    path2: dstPath,
    replySectors,
    replyTrytes: 0,
    steps
  }).r0;
}

function guestUnitInfo(vm, unit) {
  const res = callGuestFs(vm, 58, { arg0: unit, arg1: -9003, replySectors: 1, replyTrytes: 32 });
  const d = res.data;
  return {
    status: res.r0,
    present: d[0],
    flags: d[1],
    mounted: d[2],
    totalSectors: getWord(d, 3),
    freeSectors: getWord(d, 6),
    usedSectors: getWord(d, 9),
    label: getStrZ(d, 12, 16),
    clean: d[29]
  };
}

function guestFormat(vm, unit, label, steps = 400000) {
  return callGuestFs(vm, 59, { arg0: unit, arg1: -9001, path1: label, replySectors: 1, replyTrytes: 0, steps }).r0;
}

function guestFsck(vm, unit, repair = 0, steps = 600000) {
  const res = callGuestFs(vm, 60, { arg0: unit, arg1: repair ? 1 : 0, arg2: -9003, replySectors: 1, replyTrytes: 12, steps });
  return {
    r0: res.r0,
    r1: res.r1,
    problems: getWord(res.data, 0),
    orphans: getWord(res.data, 3),
    repaired: getWord(res.data, 6),
    errFlags: getWord(res.data, 9)
  };
}

function guestCopyLegacy(vm, steps = 300000) {
  return callGuestFs(vm, 61, { replySectors: 1, replyTrytes: 0, steps }).r0;
}

function guestSetHint(vm, unit, hint) {
  return callGuestFs(vm, 62, { arg0: 2, arg1: unit, arg2: hint, replySectors: 1, replyTrytes: 0 }).r0;
}

module.exports = {
  loadHtmlModule, readFbString, makeMouseTracker,
  TritFS, Unit, wordToTrytes, trytesToWord, putWord, getWord, putStrZ, getStrZ,
  SECTOR, PER_SLT, ENTRY, T_DATA, T_IMAGE, T_ASM, T_EXEC, T_DIR, L_FREE, L_END, L_BAD, L_RES,
  bootDesktop2, ensureTestAgentRunning, prepareGuestCmd, callGuestFs, parseEntry27,
  guestList, guestStat, guestRead, guestWrite, guestMkdir, guestDelete, guestRename, guestCopy,
  guestUnitInfo, guestFormat, guestFsck, guestCopyLegacy, guestSetHint
};
