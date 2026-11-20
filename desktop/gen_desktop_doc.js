#!/usr/bin/env node
'use strict';
/**
 * TritOS Desktop 2.0.1 Documentation Generator (desktop/gen_desktop_doc.js)
 * Reads desktop/guest-200.asm and deterministically generates:
 *   - desktop/DESKTOP.md §7 (Syscall Table for #50..#65 and #9, plus Error Codes)
 *   - desktop/DESKTOP.md §8.1 (Task Start State from k_init_task_slot)
 *   - desktop/syscall-table.json
 */
const fs = require('fs');
const path = require('path');

const desktopDir = __dirname;
const asmPath = path.join(desktopDir, 'guest-200.asm');
const mdPath = path.join(desktopDir, 'DESKTOP.md');
const jsonPath = path.join(desktopDir, 'syscall-table.json');

const ERROR_CODE_DESC = {
  ERR_FS_ERR: 'General filesystem error (invalid argument, bad path, not found, read-only entry, non-empty directory, disk full, or unit not mounted)',
  ERR_FS_NO_UNIT: 'Unit not present, out of range, or media removed/changed during I/O',
  ERR_FS_WP: 'Target unit is write-protected',
  ERR_BADPTR: 'Pointer argument (or range [ptr, ptr + len - 1] or NUL-terminated path) lies outside the calling task\'s [UBASE, ULIMIT)'
};

const SYSCALL_META = {
  50: {
    returns: 'R0 = active entry count (>= 0), or negative error code',
    behavior: 'Lists active 27-tryte directory entries in path into out_buf_ptr (up to max_entries, default 64 when R2 <= 0)',
    errorCodes: ['ERR_BADPTR', 'ERR_FS_ERR']
  },
  51: {
    returns: 'R0 = 0 on success, or negative error code',
    behavior: 'Writes 27-tryte directory entry for path into out_ent27_ptr',
    errorCodes: ['ERR_BADPTR', 'ERR_FS_ERR']
  },
  52: {
    returns: 'R0 = trytes read (>= 0), or negative error code',
    behavior: 'Reads up to max_trytes (or full file if R2 <= 0) from path into dst_buf_ptr; range-checks actual write length before copying',
    errorCodes: ['ERR_BADPTR', 'ERR_FS_ERR', 'ERR_FS_NO_UNIT']
  },
  53: {
    returns: 'R0 = 0 on success, or negative error code',
    behavior: 'Writes len_trytes from src_buf_ptr to path with type (1..4) and optional mtime (<= 0 uses RTC) via CoW commit',
    errorCodes: ['ERR_BADPTR', 'ERR_FS_ERR', 'ERR_FS_NO_UNIT', 'ERR_FS_WP']
  },
  54: {
    returns: 'R0 = 0 on success, or negative error code',
    behavior: 'Creates directory at path with optional mtime (<= 0 uses RTC) via CoW commit',
    errorCodes: ['ERR_BADPTR', 'ERR_FS_ERR', 'ERR_FS_NO_UNIT', 'ERR_FS_WP']
  },
  55: {
    returns: 'R0 = 0 on success, or negative error code',
    behavior: 'Deletes file or empty directory at path (refuses read-only entries and non-empty directories)',
    errorCodes: ['ERR_BADPTR', 'ERR_FS_ERR', 'ERR_FS_NO_UNIT', 'ERR_FS_WP']
  },
  56: {
    returns: 'R0 = 0 on success, or negative error code',
    behavior: 'Renames file or directory at path to new_name within its parent directory',
    errorCodes: ['ERR_BADPTR', 'ERR_FS_ERR', 'ERR_FS_NO_UNIT', 'ERR_FS_WP']
  },
  57: {
    returns: 'R0 = trytes copied (>= 0), or negative error code',
    behavior: 'Copies file from src_path_ptr to dst_path_ptr across or within units',
    errorCodes: ['ERR_BADPTR', 'ERR_FS_ERR', 'ERR_FS_NO_UNIT', 'ERR_FS_WP']
  },
  58: {
    returns: 'R0 = mounted kind (0=unmounted, 1=legacy Unit 0, 2=TritFS v2), or negative error code',
    behavior: 'Writes 32-tryte unit info struct ([present, flags, mounted, total(w), free(w), used(w), label[16], 0, clean]) to out_info32_ptr',
    errorCodes: ['ERR_BADPTR', 'ERR_FS_NO_UNIT']
  },
  59: {
    returns: 'R0 = 0 on success, or negative error code',
    behavior: 'Formats unit (1..26) as TritFS v2 with volume label at label_str_ptr and mounts it',
    errorCodes: ['ERR_BADPTR', 'ERR_FS_ERR', 'ERR_FS_NO_UNIT', 'ERR_FS_WP']
  },
  60: {
    returns: 'R0 = problems_count, R1 = orphans_count (both negative on error)',
    behavior: 'Runs TritFS v2 fsck on unit (1..26), optionally repairing orphans (R1 != 0), writing 12-tryte report [problems(w), orphans(w), repaired(w), err_flags(w)] to out_report12_ptr',
    errorCodes: ['ERR_BADPTR', 'ERR_FS_ERR']
  },
  61: {
    returns: 'R0 = number of legacy files copied (>= 0), or negative error code',
    behavior: 'Copies all files from 0:/* into 1:/legacy/<NAME>',
    errorCodes: ['ERR_FS_ERR']
  },
  62: {
    returns: 'R0 = RTC seconds (op=0), or 0 / negative error code (op=1..3)',
    behavior: 'R0=0: read RTC seconds (Port 32); R0=1: write R1 to RTC; R0=2: set unit R1 allocation hint to R2; R0=3: unmount/eject unit R1',
    errorCodes: ['ERR_FS_ERR']
  },
  63: {
    returns: 'R0 = 0 on success, or negative error code',
    behavior: 'Saves bundled-app document to 1:/docs/<name> (mirroring to 0:/<name>, or falling back to 0:/<name> if Unit 1 unmounted); direct path if name contains ":" or "/"',
    errorCodes: ['ERR_BADPTR', 'ERR_FS_ERR', 'ERR_FS_NO_UNIT', 'ERR_FS_WP']
  },
  64: {
    returns: 'R0 = trytes read (>= 0), or negative error code',
    behavior: 'Loads bundled-app document from 1:/docs/<name> (falling back to 0:/<name>); range-checks actual write length before copying',
    errorCodes: ['ERR_BADPTR', 'ERR_FS_ERR', 'ERR_FS_NO_UNIT']
  },
  65: {
    returns: 'R0 = files copied (>= 1), or negative error code',
    behavior: 'Installs cartridge app folder 2:/apps/<name> and its files to 1:/apps/<name>',
    errorCodes: ['ERR_BADPTR', 'ERR_FS_ERR']
  }
};

function parseErrorCodes(asm) {
  const codes = [];
  const map = {};
  const re = /^\.equ\s+(ERR_[A-Z0-9_]+)\s*,\s*(-?\d+)/gm;
  let m;
  while ((m = re.exec(asm)) !== null) {
    const name = m[1];
    const value = parseInt(m[2], 10);
    map[name] = value;
    codes.push({
      name,
      value,
      description: ERROR_CODE_DESC[name] || ''
    });
  }
  if (codes.length === 0) {
    throw new Error('No .equ ERR_* error codes found in guest-200.asm');
  }
  return { codes, map };
}

function parseArgList(sigStr) {
  if (/^no pointer args/i.test(sigStr.trim())) {
    if (sigStr.includes(';')) {
      return [];
    }
    return [];
  }
  const args = [];
  // Split top-level comma-separated Rk=name (optional parens)
  let cur = '';
  let depth = 0;
  const parts = [];
  for (const ch of sigStr) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());

  for (const p of parts) {
    const m = /^(R\d+)\s*=\s*([A-Za-z0-9_]+)(?:\s*\((.*)\))?$/.exec(p);
    if (!m) continue;
    const reg = m[1];
    const name = m[2];
    const meta = m[3] || '';
    const isPointer = meta.startsWith('ptr:');
    let kind = 'int';
    let lengthRule = null;
    if (isPointer) {
      const pm = /^ptr:([a-z]+)(?:,\s*len=(.+))?$/.exec(meta);
      if (pm) {
        kind = pm[1];
        lengthRule = pm[2] || (kind === 'stringz' ? 'NUL-terminated through terminating 0 before ULIMIT' : null);
      }
    }
    args.push({ reg, name, isPointer, kind, lengthRule });
  }
  return args;
}

function parsePathSyscalls(asm, errMap) {
  const dispStart = asm.indexOf('\nk_fs2_syscall_dispatch:\n');
  if (dispStart < 0) throw new Error('Could not find k_fs2_syscall_dispatch in guest-200.asm');
  const drvStart = asm.indexOf('\n; ==== DRIVER fs v2 ====', dispStart);
  if (drvStart < 0) throw new Error('Could not find DRIVER fs v2 after k_fs2_syscall_dispatch');
  const dispBlock = asm.slice(dispStart, drvStart);

  // Extract dispatch table entries: CMPI R6, #N / JZX label
  const dispatchEntries = [];
  const dRe = /CMPI\s+R6\s*,\s*#(\d+)\s*\n\s*JZX\s+([A-Za-z0-9_]+)/g;
  let dm;
  while ((dm = dRe.exec(dispBlock)) !== null) {
    dispatchEntries.push({ num: parseInt(dm[1], 10), label: dm[2] });
  }
  if (dispatchEntries.length === 0) {
    throw new Error('No dispatch entries found in k_fs2_syscall_dispatch');
  }

  const syscalls = [];
  for (let i = 0; i < dispatchEntries.length; i++) {
    const { num, label } = dispatchEntries[i];
    const lblIdx = dispBlock.indexOf(`\n${label}:\n`);
    if (lblIdx < 0) throw new Error(`Dispatch label ${label} not found`);
    let nextIdx = dispBlock.length;
    if (i + 1 < dispatchEntries.length) {
      const nextLbl = dispatchEntries[i + 1].label;
      const ni = dispBlock.indexOf(`\n${nextLbl}:\n`, lblIdx + 1);
      if (ni > lblIdx) nextIdx = ni;
    } else {
      const popIdx = dispBlock.indexOf('\nkfsd_pop1_ret:\n', lblIdx + 1);
      if (popIdx > lblIdx) nextIdx = popIdx;
    }
    const body = dispBlock.slice(lblIdx, nextIdx);

    // Parse header comment: ; SYS_NAME (#N): ...
    const hdrMatch = /;\s*(SYS_[A-Z0-9_]+)\s*\(#(\d+)\):\s*(.+)/.exec(body);
    if (!hdrMatch || parseInt(hdrMatch[2], 10) !== num) {
      throw new Error(`Missing or mismatched syscall header comment in ${label}`);
    }
    const name = hdrMatch[1];
    const sigStr = hdrMatch[3].trim();

    // Parse actual handler call from code
    const callMatches = [...body.matchAll(/CALLX?\s+([A-Za-z0-9_]+)/g)].map(x => x[1]);
    const checkCalls = callMatches.filter(c => c === 'k_check_user_ptr').length;
    const handlerCalls = callMatches.filter(c => c !== 'k_check_user_ptr');
    const handler = handlerCalls.length === 1 ? handlerCalls[0] : label;

    let args = parseArgList(sigStr);
    if (num === 62) {
      args = [
        { reg: 'R0', name: 'op', isPointer: false, kind: 'int', lengthRule: null },
        { reg: 'R1', name: 'arg1', isPointer: false, kind: 'int', lengthRule: null },
        { reg: 'R2', name: 'arg2', isPointer: false, kind: 'int', lengthRule: null }
      ];
    }

    const pointerArgs = args
      .filter(a => a.isPointer)
      .map(a => ({ reg: a.reg, name: a.name, kind: a.kind, lengthRule: a.lengthRule }));

    // Cross-check: every pointer arg in metadata must correspond to a k_check_user_ptr call in kfsd_N!
    if (pointerArgs.length !== checkCalls) {
      throw new Error(`Syscall #${num} (${name}): parsed ${pointerArgs.length} pointer args but found ${checkCalls} k_check_user_ptr calls in ${label}`);
    }

    const meta = SYSCALL_META[num];
    if (!meta) throw new Error(`Missing SYSCALL_META for #${num}`);
    const errorCodes = meta.errorCodes.map(ec => ({
      name: ec,
      value: errMap[ec]
    }));

    syscalls.push({
      num,
      name,
      dispatchLabel: label,
      handler,
      args,
      pointerArgs,
      pointerArgsSummary: pointerArgs.length === 0
        ? 'pointer args: none'
        : pointerArgs.map(p => `${p.reg} (${p.name}, ${p.kind}: ${p.lengthRule})`).join('; '),
      returns: meta.returns,
      behavior: meta.behavior,
      errorCodes
    });
  }

  return syscalls;
}

function parseTaskStartState(asm) {
  const start = asm.indexOf('\nk_init_task_slot:\n');
  if (start < 0) throw new Error('Could not find k_init_task_slot in guest-200.asm');
  const end = asm.indexOf('\nk_spawn_app:\n', start);
  if (end < 0) throw new Error('Could not find k_spawn_app after k_init_task_slot');
  const body = asm.slice(start, end);

  const bankMulMatch = /MULI\s+R6,\s*R4,\s*#(\d+)\s*\n\s*ADDI\s+R6,\s*R6,\s*#(\d+)/.exec(body);
  if (!bankMulMatch) throw new Error('Could not parse regular task bank formula in k_init_task_slot');
  const bankStep = parseInt(bankMulMatch[1], 10);
  const bankBase = parseInt(bankMulMatch[2], 10);

  const app4Match = /CMPI\s+R5,\s*#(\d+)\s*\n\s*JZ\s+kits_asm_bounds[\s\S]*?kits_asm_bounds:\s*\n\s*LI\s+R6,\s*#0\s*\n\s*LMI\s+R6,\s*#(\d+)\s*\n\s*LI\s+R8,\s*#0\s*\n\s*LMI\s+R8,\s*#(\d+)/.exec(body);
  if (!app4Match) throw new Error('Could not parse App 4 bounds in k_init_task_slot');
  const app4Id = parseInt(app4Match[1], 10);
  const app4StartBank = parseInt(app4Match[2], 10);
  const app4EndBank = parseInt(app4Match[3], 10);

  const spDefMatch = /ADDI\s+R0,\s*R6,\s*#(\d+)\s*\n\s*CMPI\s+R5,\s*#(\d+)\s*\n\s*JNZ\s+kits_chk_11\s*\n\s*ADDI\s+R0,\s*R6,\s*#(\d+)[\s\S]*?kits_chk_11:\s*\n\s*CMPI\s+R5,\s*#(\d+)\s*\n\s*JNZ\s+kits_sp_ok\s*\n\s*ADDI\s+R0,\s*R6,\s*#(\d+)/.exec(body);
  if (!spDefMatch) throw new Error('Could not parse SP offsets in k_init_task_slot');
  const spDefault = parseInt(spDefMatch[1], 10);
  const spExc1App = parseInt(spDefMatch[2], 10);
  const spExc1Off = parseInt(spDefMatch[3], 10);
  const spExc2App = parseInt(spDefMatch[4], 10);
  const spExc2Off = parseInt(spDefMatch[5], 10);

  const esrMatch = /LI\s+R0,\s*#(\d+)\s*\n\s*;\s*__DISABLE_PROTECTION__\s*\n\s*SW\s+R0,\s*R1,\s*#33/.exec(body);
  if (!esrMatch) throw new Error('Could not parse ESR in k_init_task_slot');
  const esrVal = parseInt(esrMatch[1], 10);

  const r8Off = /SW\s+R6,\s*R1,\s*#(\d+)\s*;\s*R8/.exec(body);
  const pcOff = /SW\s+R6,\s*R1,\s*#(\d+)\s*;\s*PC/.exec(body);
  const spOff = /SW\s+R0,\s*R1,\s*#(\d+)\s*;\s*SP/.exec(body);
  const ubaseOff = /SW\s+R6,\s*R1,\s*#(\d+)\s*;\s*UBASE/.exec(body);
  const ulimitOff = /SW\s+R8,\s*R1,\s*#(\d+)\s*;\s*ULIMIT/.exec(body);

  return {
    sourceFunction: 'k_init_task_slot',
    bankSizeTrytes: 19683,
    regularTask: {
      ubaseFormula: `(${bankBase} + ${bankStep} * slot) * 19,683`,
      ulimitFormula: 'UBASE + 39,366 (2 banks)',
      bankBase,
      bankStep,
      sizeTrytes: 39366
    },
    appExceptions: {
      bounds: [
        {
          appId: app4Id,
          ubase: app4StartBank * 19683,
          ulimit: app4EndBank * 19683,
          ubaseExpr: `${app4StartBank} * 19,683 (${(app4StartBank * 19683).toLocaleString('en-US')})`,
          ulimitExpr: `${app4EndBank} * 19,683 (${(app4EndBank * 19683).toLocaleString('en-US')})`,
          banks: app4EndBank - app4StartBank
        }
      ],
      sp: [
        { appId: spExc1App, spOffset: spExc1Off, spExpr: `UBASE + ${spExc1Off}` },
        { appId: spExc2App, spOffset: spExc2Off, spExpr: `UBASE + ${spExc2Off}` }
      ]
    },
    registers: {
      'R0..R7': '0 (TCB zero-filled via BFILL)',
      R8: 'UBASE',
      PC: 'UBASE',
      SP: `UBASE + ${spDefault} (exceptions: App ${spExc1App} = UBASE + ${spExc1Off}, App ${spExc2App} = UBASE + ${spExc2Off})`,
      ESR: esrVal,
      UBASE: 'TCB +36',
      ULIMIT: 'TCB +39'
    },
    tcbOffsets: {
      R8: r8Off ? parseInt(r8Off[1], 10) : 24,
      PC: pcOff ? parseInt(pcOff[1], 10) : 27,
      SP: spOff ? parseInt(spOff[1], 10) : 30,
      ESR: 33,
      UBASE: ubaseOff ? parseInt(ubaseOff[1], 10) : 36,
      ULIMIT: ulimitOff ? parseInt(ulimitOff[1], 10) : 39
    }
  };
}

function renderSection7(syscalls, errorCodes) {
  const lines = [];
  lines.push('## 7. TritOS Desktop 2.0 System Calls (Path Syscalls `#50..#65` & Time Syscalls)');
  lines.push('');
  lines.push('<!-- GENERATED BY desktop/gen_desktop_doc.js FROM desktop/guest-200.asm — DO NOT HAND-EDIT -->');
  lines.push('');
  lines.push('Legacy `SYS_FS_*` syscalls (`#30..#33`) remain compatible and operate on `0:/` (`Sector 200` format). Desktop 2.0.1 exposes `#9` (`SYS_GET_MS`) and the `#50..#65` bridge in `k_fs2_syscall_dispatch`. Every pointer argument in `#50..#65` is validated by `k_check_user_ptr` against the calling task\'s `[UBASE, ULIMIT)` (TCB `+36` and `+39`) before the kernel reads or writes guest memory.');
  lines.push('');
  lines.push('### 7.1 Syscall Table (`#9` and `#50..#65`)');
  lines.push('');
  lines.push('| Syscall | Name | Arguments (`*` = pointer) | Pointer Validation & Length | Return Value | Error Codes |');
  lines.push('|---:|---|---|---|---|---|');
  lines.push('| `#9` | `SYS_GET_MS` | None | pointer args: none | `R0` = elapsed milliseconds (`drv_timer_read / 200`) | None |');

  for (const s of syscalls) {
    const argDesc = s.args.length === 0
      ? 'None'
      : s.args.map(a => a.isPointer ? `\`${a.reg}=${a.name}\`*` : `\`${a.reg}=${a.name}\``).join(', ');
    const errDesc = s.errorCodes.map(e => `\`${e.name}\` (\`${e.value}\`)`).join(', ');
    lines.push(`| \`#${s.num}\` | \`${s.name}\` | ${argDesc} | ${s.pointerArgsSummary} | ${s.returns} | ${errDesc} |`);
  }

  lines.push('');
  lines.push('### 7.2 Path Syscall Error Codes');
  lines.push('');
  lines.push('| Name | Value | Meaning |');
  lines.push('|---|---:|---|');
  for (const ec of errorCodes) {
    lines.push(`| \`${ec.name}\` | \`${ec.value}\` | ${ec.description} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

function renderSection81(ts) {
  const b4 = ts.appExceptions.bounds[0];
  const spExcStr = ts.appExceptions.sp.map(e => `App \`${e.appId}\`: \`${e.spExpr}\``).join('; ');
  const lines = [];
  lines.push('### 8.1 `SYS_EXEC_BUF` (`SYSCALL #7`) Executable Format (`main`) & Task Start State');
  lines.push('');
  lines.push('<!-- GENERATED BY desktop/gen_desktop_doc.js FROM desktop/guest-200.asm (k_init_task_slot) — DO NOT HAND-EDIT -->');
  lines.push('');
  lines.push('- **Invocation:** `R0 = buf_ptr`, `R1 = len_trytes`, `R2 = app_id` (e.g., `15` for App Shelf launches).');
  lines.push('- **Binary Layout:** Raw Triton 3 user-mode machine code trytes assembled for origin `0` and copied into the task\'s `[UBASE, ULIMIT)` segment by `k_init_task_slot`.');
  lines.push('- **Task Start State (`k_init_task_slot`):**');
  lines.push('');
  lines.push('| Register / Field | TCB Offset | Initial Value |');
  lines.push('|---|---:|---|');
  lines.push('| `R0..R7` | `+0..+21` | `0` (TCB zero-filled via `BFILL`) |');
  lines.push(`| \`R8\` | \`+${ts.tcbOffsets.R8}\` | \`UBASE\` |`);
  lines.push(`| \`PC\` | \`+${ts.tcbOffsets.PC}\` | \`UBASE\` |`);
  lines.push(`| \`SP\` | \`+${ts.tcbOffsets.SP}\` | \`UBASE + 4500\` (per-app exceptions: ${spExcStr}) |`);
  lines.push(`| \`ESR\` | \`+${ts.tcbOffsets.ESR}\` | \`${ts.registers.ESR}\` (User Mode, protection enabled, \`IE = 1\`) |`);
  lines.push(`| \`UBASE\` | \`+${ts.tcbOffsets.UBASE}\` | Regular tasks: \`${ts.regularTask.ubaseFormula}\`; App \`${b4.appId}\` (Assembler): \`${b4.ubaseExpr}\` |`);
  lines.push(`| \`ULIMIT\` | \`+${ts.tcbOffsets.ULIMIT}\` | Regular tasks: \`${ts.regularTask.ulimitFormula}\`; App \`${b4.appId}\` (Assembler): \`${b4.ulimitExpr}\` (\`${b4.banks}\` banks) |`);
  lines.push('');
  return lines.join('\n');
}

function generateDocs({ write = true } = {}) {
  const asm = fs.readFileSync(asmPath, 'utf8');
  const { codes: errorCodes, map: errMap } = parseErrorCodes(asm);
  const syscalls = parsePathSyscalls(asm, errMap);
  const taskStartState = parseTaskStartState(asm);

  const jsonObj = {
    source: 'desktop/guest-200.asm',
    errorCodes,
    syscalls,
    timeSyscalls: [
      {
        num: 9,
        name: 'SYS_GET_MS',
        args: [],
        pointerArgs: [],
        pointerArgsSummary: 'pointer args: none',
        returns: 'R0 = elapsed milliseconds (drv_timer_read / 200)',
        errorCodes: []
      }
    ],
    taskStartState
  };

  const jsonText = JSON.stringify(jsonObj, null, 2) + '\n';

  let md = fs.readFileSync(mdPath, 'utf8');
  const sec7Start = md.indexOf('## 7. ');
  const sec8Start = md.indexOf('## 8. ');
  if (sec7Start < 0 || sec8Start < 0 || sec8Start <= sec7Start) {
    throw new Error('Could not locate ## 7. and ## 8. markers in DESKTOP.md');
  }
  const newSec7 = renderSection7(syscalls, errorCodes);
  md = md.slice(0, sec7Start) + newSec7 + md.slice(sec8Start);

  const sec81Start = md.indexOf('### 8.1 ');
  const sec82Start = md.indexOf('### 8.2 ');
  if (sec81Start < 0 || sec82Start < 0 || sec82Start <= sec81Start) {
    throw new Error('Could not locate ### 8.1 and ### 8.2 markers in DESKTOP.md');
  }
  const newSec81 = renderSection81(taskStartState);
  md = md.slice(0, sec81Start) + newSec81 + md.slice(sec82Start);

  if (write) {
    fs.writeFileSync(jsonPath, jsonText, 'utf8');
    fs.writeFileSync(mdPath, md, 'utf8');
  }

  return { jsonObj, jsonText, md, newSec7, newSec81 };
}

if (require.main === module) {
  const res = generateDocs({ write: true });
  console.log(JSON.stringify({
    status: 'OK',
    syscalls: res.jsonObj.syscalls.length,
    errorCodes: res.jsonObj.errorCodes.length,
    jsonBytes: res.jsonText.length,
    mdBytes: res.md.length
  }));
}

module.exports = { generateDocs, parseErrorCodes, parsePathSyscalls, parseTaskStartState };
