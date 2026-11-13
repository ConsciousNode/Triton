'use strict';
const fs = require('fs');
const path = require('path');
const { loadHtmlModule } = require('./t3-common.js');

const EXPECTED_DRIVERS = ['disk', 'timer', 'keyboard', 'mouse', 'framebuffer', 'net'];

function analyzeGuestDriverLibrary(asmSource) {
  const lines = asmSource.split('\n');
  const equPorts = {};
  for (const rawLine of lines) {
    const line = rawLine.split(';')[0].trim();
    const m = /^\.equ\s+(P_[A-Z0-9_]+)\s*,\s*(-?\d+)$/i.exec(line);
    if (m) equPorts[m[1].toUpperCase()] = parseInt(m[2], 10);
  }

  const drivers = {};
  let currentDriver = null;
  let inEntryTable = false;
  const labelToDriver = {};
  const entryLabels = new Set();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const startMatch = /^;\s*====\s*DRIVER\s+([a-z0-9_]+)\s+v(\d+)\s*====\s*$/i.exec(raw.trim());
    if (startMatch) {
      if (currentDriver) {
        return { ok: false, error: `Nested driver section at line ${i + 1}` };
      }
      const name = startMatch[1].toLowerCase();
      if (drivers[name]) {
        return { ok: false, error: `Non-contiguous / duplicate driver section '${name}' at line ${i + 1}` };
      }
      currentDriver = {
        name,
        version: 'v' + startMatch[2],
        startLine: i + 1,
        endLine: -1,
        ports: [],
        memory: [],
        irq: null,
        entries: [],
        internalLabels: []
      };
      drivers[name] = currentDriver;
      inEntryTable = true;
      continue;
    }

    const endMatch = /^;\s*====\s*END\s+DRIVER\s+([a-z0-9_]+)\s*====\s*$/i.exec(raw.trim());
    if (endMatch) {
      const name = endMatch[1].toLowerCase();
      if (!currentDriver || currentDriver.name !== name) {
        return { ok: false, error: `Mismatched END DRIVER '${name}' at line ${i + 1}` };
      }
      currentDriver.endLine = i + 1;
      currentDriver = null;
      inEntryTable = false;
      continue;
    }

    if (currentDriver) {
      const portsMeta = /^;\s*Ports:\s*(.+)$/i.exec(raw.trim());
      if (portsMeta) {
        const matches = [...portsMeta[1].matchAll(/(P_[A-Z0-9_]+)\s*\((\d+)\)/gi)];
        for (const pm of matches) {
          currentDriver.ports.push({ sym: pm[1].toUpperCase(), num: parseInt(pm[2], 10) });
        }
      }
      const memMeta = /^;\s*Memory:\s*(.+)$/i.exec(raw.trim());
      if (memMeta) {
        currentDriver.memory = memMeta[1].split(',').map(s => s.trim()).filter(Boolean);
      }
      const irqMeta = /^;\s*IRQ:\s*(.+)$/i.exec(raw.trim());
      if (irqMeta) {
        const v = irqMeta[1].trim();
        currentDriver.irq = /^none$/i.test(v) ? 'None' : String(parseInt(v, 10));
      }
      if (/^;\s*---\s*End Entry Table\s*---/i.test(raw.trim())) {
        inEntryTable = false;
        continue;
      }

      const codePart = raw.split(';')[0].trim();
      const lblMatch = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(codePart);
      if (lblMatch) {
        const lbl = lblMatch[1];
        labelToDriver[lbl] = currentDriver.name;
        if (inEntryTable) {
          currentDriver.entries.push(lbl);
          entryLabels.add(lbl);
        } else {
          currentDriver.internalLabels.push(lbl);
        }
      }
    }
  }

  if (currentDriver) {
    return { ok: false, error: `Unclosed driver section '${currentDriver.name}'` };
  }

  for (const req of EXPECTED_DRIVERS) {
    if (!drivers[req]) {
      return { ok: false, error: `Missing required driver section '${req}'` };
    }
  }

  // Second pass: check every IN/OUT and every cross-boundary CALL/CALLX/JMP/JMPX
  let activeDrv = null;
  let ioCount = 0;
  let externalDriverCalls = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const startMatch = /^;\s*====\s*DRIVER\s+([a-z0-9_]+)\s+v(\d+)\s*====\s*$/i.exec(raw.trim());
    if (startMatch) { activeDrv = startMatch[1].toLowerCase(); continue; }
    const endMatch = /^;\s*====\s*END\s+DRIVER\s+([a-z0-9_]+)\s*====\s*$/i.exec(raw.trim());
    if (endMatch) { activeDrv = null; continue; }

    let code = raw.split(';')[0].trim();
    if (!code) continue;
    // Strip label prefix if present
    code = code.replace(/^[A-Za-z_][A-Za-z0-9_]*:\s*/, '').trim();
    if (!code || code.startsWith('.')) continue;

    const ioMatch = /^(IN|OUT)\s+R\d\s*,\s*#?([A-Za-z0-9_+-]+)$/i.exec(code);
    if (ioMatch) {
      ioCount++;
      if (!activeDrv) {
        return { ok: false, error: `${ioMatch[1]} instruction outside any driver section at line ${i + 1}: '${raw.trim()}'` };
      }
      const portTok = ioMatch[2].toUpperCase();
      const portNum = Object.prototype.hasOwnProperty.call(equPorts, portTok) ? equPorts[portTok] : parseInt(portTok, 10);
      const declared = drivers[activeDrv].ports.some(p => p.sym === portTok || p.num === portNum);
      if (!declared) {
        return { ok: false, error: `${ioMatch[1]} at line ${i + 1} in driver '${activeDrv}' uses undeclared port '${portTok}'` };
      }
    }

    const brMatch = /^(CALL|CALLX|JMP|JMPX|JZ|JZX|JNZ|JNZX|JN|JNX|JP|JPX|JNN|JNNX|JNP|JNPX)\s+#?([A-Za-z_][A-Za-z0-9_]*)$/i.exec(code);
    if (brMatch) {
      const target = brMatch[2];
      const targetDrv = labelToDriver[target];
      if (targetDrv && targetDrv !== activeDrv) {
        externalDriverCalls++;
        if (!entryLabels.has(target)) {
          return {
            ok: false,
            error: `Cross-boundary ${brMatch[1]} to internal label '${target}' of driver '${targetDrv}' from ${activeDrv || 'kernel'} at line ${i + 1}`
          };
        }
      }
    }
  }

  return { ok: true, drivers, ioCount, externalDriverCalls };
}

function parseDriversMarkdown(mdText) {
  const sections = {};
  const blocks = mdText.split(/^##\s+\d+\.\s+Driver:\s+/m).slice(1);
  for (const blk of blocks) {
    const hdr = /^`([a-z0-9_]+)`\s+\(`(v\d+)`\)/i.exec(blk.trim());
    if (!hdr) continue;
    const name = hdr[1].toLowerCase();
    const version = hdr[2];
    const portsLine = /-\s+\*\*Ports:\*\*\s*(.+)$/m.exec(blk);
    const memLine = /-\s+\*\*Memory:\*\*\s*(.+)$/m.exec(blk);
    const irqLine = /-\s+\*\*IRQ Vector:\*\*\s*`([^`]+)`/m.exec(blk);
    const ports = [];
    if (portsLine) {
      for (const m of portsLine[1].matchAll(/`(P_[A-Z0-9_]+)`\s*\((\d+)\)/g)) {
        ports.push({ sym: m[1], num: parseInt(m[2], 10) });
      }
    }
    const entries = [];
    for (const m of blk.matchAll(/^\|\s*`\+\d+`\s*\|\s*`([a-z0-9_]+)`\s*\|/gim)) {
      entries.push(m[1]);
    }
    sections[name] = {
      name,
      version,
      ports,
      irq: irqLine ? irqLine[1].trim() : null,
      hasMemory: !!(memLine && memLine[1].trim()),
      hasErrors: /###\s+Error Behavior/i.test(blk),
      entries
    };
  }
  return sections;
}

function runTest() {
  const { T } = loadHtmlModule('tritos-desktop.html');
  const src = T.TRITOS_DESKTOP_SRC;

  // (a) Static check on unmodified guest source
  const check = analyzeGuestDriverLibrary(src);
  if (!check.ok) {
    throw new Error('Driver library static check failed: ' + check.error);
  }

  // (b) Positive control 1: Place an OUT outside any driver section in a copy of the source -> static check must fail
  const copyOutOutside = src.replace('kernel_boot_entry:\n', 'kernel_boot_entry:\n  OUT R0, #P_DC\n');
  const ctl1 = analyzeGuestDriverLibrary(copyOutOutside);
  if (ctl1.ok) {
    throw new Error('Positive control 1 failed: OUT outside any driver section was not rejected');
  }

  // (b) Positive control 2: Call a driver's internal label (past its entry table) from the kernel in a copy -> static check must fail
  const copyInternalCall = src.replace('CALL drv_kbd_init', 'CALL drv_kbd_init_impl');
  const ctl2 = analyzeGuestDriverLibrary(copyInternalCall);
  if (ctl2.ok) {
    throw new Error('Positive control 2 failed: calling internal driver label drv_kbd_init_impl from kernel was not rejected');
  }

  // (c) Doc check: every driver, port, entry, and IRQ vector in DRIVERS.md exists in the source, and vice versa
  const mdPath = path.resolve(__dirname, '..', 'DRIVERS.md');
  const mdText = fs.readFileSync(mdPath, 'utf8');
  const docDrivers = parseDriversMarkdown(mdText);

  const srcNames = Object.keys(check.drivers).sort();
  const docNames = Object.keys(docDrivers).sort();
  if (JSON.stringify(srcNames) !== JSON.stringify(docNames)) {
    throw new Error(`Driver list mismatch between source (${srcNames}) and DRIVERS.md (${docNames})`);
  }

  for (const name of srcNames) {
    const s = check.drivers[name];
    const d = docDrivers[name];
    if (s.version !== d.version) throw new Error(`Version mismatch for ${name}: src=${s.version} doc=${d.version}`);
    if (String(s.irq) !== String(d.irq)) throw new Error(`IRQ mismatch for ${name}: src=${s.irq} doc=${d.irq}`);
    const sPorts = s.ports.map(p => `${p.sym}:${p.num}`).sort();
    const dPorts = d.ports.map(p => `${p.sym}:${p.num}`).sort();
    if (JSON.stringify(sPorts) !== JSON.stringify(dPorts)) {
      throw new Error(`Ports mismatch for ${name}: src=${JSON.stringify(sPorts)} doc=${JSON.stringify(dPorts)}`);
    }
    if (JSON.stringify(s.entries) !== JSON.stringify(d.entries)) {
      throw new Error(`Entries mismatch for ${name}: src=${JSON.stringify(s.entries)} doc=${JSON.stringify(d.entries)}`);
    }
    if (!d.hasMemory || !d.hasErrors) {
      throw new Error(`DRIVERS.md section '${name}' missing memory or error documentation`);
    }
  }

  return {
    name: '19-driver-library',
    status: 'PASS',
    driversVerified: srcNames,
    ioInstructionsChecked: check.ioCount,
    externalDriverCallsChecked: check.externalDriverCalls,
    positiveControlOutOutsideCaught: !ctl1.ok,
    positiveControlInternalCallCaught: !ctl2.ok,
    docMatch: true
  };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
module.exports = { runTest, analyzeGuestDriverLibrary };
