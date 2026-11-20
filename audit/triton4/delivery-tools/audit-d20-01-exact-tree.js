const AUDIT_TREE = [];
'use strict';
// Test 5 (d20-01-tritfs-conformance.js):
//   1. Far-call target offset check: every far target minus 59,049 fits in [-9841..+9841].
//   2. Guest -> Reference: 500 seeded operations x 3 seeds (mkdir, write, overwrite,
//      rename, delete, cross-unit copy) executed by the guest assembly driver;
//      export .tdisk, load in tritfs-ref.js, verify fsck finds 0 problems and 0 orphans,
//      and verify every path, stat, and file content matches tryte-for-tryte.
//   3. Reference -> Guest: 3 seeded multi-folder/multi-file units built by tritfs-ref.js,
//      mounted in the guest, walked and read back tryte-for-tryte.

const {
  TritFS, Unit, T_DIR,
  bootDesktop2, guestList, guestStat, guestRead, guestWrite,
  guestMkdir, guestDelete, guestRename, guestCopy
} = require('./d20-common.js');

class SeededRng {
  constructor(seed) { this.state = (seed >>> 0) || 1; }
  nextU32() {
    let x = this.state;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }
  int(min, maxInclusive) { return min + (this.nextU32() % (maxInclusive - min + 1)); }
  pick(arr) { return arr[this.nextU32() % arr.length]; }
  trytes(len) {
    const out = new Int16Array(len);
    for (let i = 0; i < len; i++) out[i] = (this.nextU32() % 19683) - 9841;
    return out;
  }
}

function checkFarTargetOffsets(T) {
  const built = T.assemble(T.TRITOS_DESKTOP_SRC);
  if (built.errors && built.errors.length) {
    throw new Error('Assembly errors: ' + built.errors.join('; '));
  }
  const farSymbols = [
    'K_FS2_BOOT_INIT', 'K_FS2_POLL_MEDIA', 'K_FS2_FAST_FAULT',
    'K_FS2_DRAW_TB_ROW2', 'K_FS2_SYSCALL_DISPATCH',
    'DRV_FS_INIT', 'DRV_FS_MEDIA_IRQ', 'DRV_FS_POLL_MEDIA',
    'DRV_FS_FORMAT', 'DRV_FS_MOUNT_UNIT', 'DRV_FS_UNMOUNT_UNIT',
    'DRV_FS_SET_HINT', 'DRV_FS_UNIT_INFO', 'DRV_FS_LIST',
    'DRV_FS_STAT', 'DRV_FS_READ', 'DRV_FS_WRITE',
    'DRV_FS_MKDIR', 'DRV_FS_DELETE', 'DRV_FS_RENAME',
    'DRV_FS_COPY', 'DRV_FS_FSCK', 'DRV_FS_COPY_LEGACY',
    'DRV_FS_DOC_SAVE', 'DRV_FS_DOC_LOAD', 'DRV_FS_APP_INSTALL'
  ];
  const exprRe = /#([A-Za-z_][A-Za-z0-9_]*)\s*-\s*59049/g;
  let m;
  while ((m = exprRe.exec(T.TRITOS_DESKTOP_SRC)) !== null) {
    const sym = m[1].toUpperCase();
    if (!farSymbols.includes(sym)) farSymbols.push(sym);
  }
  let maxAbsOffset = 0;
  for (const sym of farSymbols) {
    const addr = built.symbols[sym];
    if (typeof addr !== 'number') throw new Error(`Missing far symbol '${sym}'`);
    const offset = addr - 59049;
    const absOff = Math.abs(offset);
    if (absOff > 9841) {
      throw new Error(`Far target '${sym}' at ${addr} has offset ${offset} from 59,049 (exceeds +-9,841)`);
    }
    if (absOff > maxAbsOffset) maxAbsOffset = absOff;
  }
  const fwExitEnd = built.symbols.FW_EXIT + 18;
  const coreEnd = built.symbols.END_OF_CORE_KERNEL;
  if (fwExitEnd > 5800) throw new Error(`FW_EXIT + 18 = ${fwExitEnd} > 5800`);
  if (coreEnd > 9460) throw new Error(`END_OF_CORE_KERNEL = ${coreEnd} > 9460`);
  return { farTargetsChecked: farSymbols.length, maxAbsOffset, limit: 9841, fwExitEnd, coreEnd };
}

function runGuestToRefSeed(seed, opsCount = 500) {
  const { vm } = bootDesktop2();
  const rng = new SeededRng(seed);
  const u2Init = new Unit(2187, { removable: true });
  TritFS.mkfs(u2Init, 'CART');
  vm.insertUnit(2, u2Init.toTdisk(), { removable: true, writeProtected: false });
  vm.run(20000);

  const state = {
    1: { dirs: ['/'], files: new Map() },
    2: { dirs: ['/'], files: new Map() }
  };
  let nextId = 1;
  const counts = { mkdir: 0, write: 0, overwrite: 0, rename: 0, delete: 0, copy: 0 };

  for (let opIdx = 0; opIdx < opsCount; opIdx++) {
    const roll = rng.int(1, 100);
    const u = rng.int(1, 10) <= 8 ? 1 : 2;
    const st = state[u];
    const filePaths = [...st.files.keys()];

    if (roll <= 14 && st.dirs.length < 24) {
      const parent = rng.pick(st.dirs);
      const depth = parent === '/' ? 1 : parent.split('/').filter(Boolean).length + 1;
      if (depth <= 5) {
        const name = 'D' + (nextId++);
        const p = (parent === '/' ? '' : parent) + '/' + name;
        const r = guestMkdir(vm, `${u}:${p}`, { steps: 12000 });
        if (r !== 0) throw new Error(`Seed ${seed} op ${opIdx} mkdir ${u}:${p} failed: ${r}`);
        st.dirs.push(p);
        counts.mkdir++;
        continue;
      }
    }

    if (roll <= 52 || filePaths.length === 0) {
      const parent = rng.pick(st.dirs);
      const name = 'F' + (nextId++);
      const p = (parent === '/' ? '' : parent) + '/' + name;
      const maxLen = u === 2 ? 1200 : (rng.int(1, 8) === 1 ? rng.int(1500, 3600) : rng.int(0, 700));
      const len = rng.int(0, 8) === 0 ? 0 : rng.int(1, maxLen);
      const data = rng.trytes(len);
      const type = rng.int(1, 4);
      const r = guestWrite(vm, `${u}:${p}`, data, type, { steps: 15000 });
      if (r !== 0) throw new Error(`Seed ${seed} op ${opIdx} write ${u}:${p} failed: ${r}`);
      st.files.set(p, { data, type });
      counts.write++;
    } else if (roll <= 68) {
      const p = rng.pick(filePaths);
      const old = st.files.get(p);
      const maxLen = u === 2 ? 1200 : (rng.int(1, 8) === 1 ? rng.int(1500, 3600) : rng.int(0, 700));
      const len = rng.int(0, 8) === 0 ? 0 : rng.int(1, maxLen);
      const data = rng.trytes(len);
      const r = guestWrite(vm, `${u}:${p}`, data, old.type, { steps: 15000 });
      if (r !== 0) throw new Error(`Seed ${seed} op ${opIdx} overwrite ${u}:${p} failed: ${r}`);
      st.files.set(p, { data, type: old.type });
      counts.overwrite++;
    } else if (roll <= 80) {
      const p = rng.pick(filePaths);
      const parts = p.split('/').filter(Boolean);
      parts.pop();
      const parent = '/' + parts.join('/');
      const newLeaf = 'R' + (nextId++);
      const newP = (parent === '/' ? '' : parent) + '/' + newLeaf;
      const r = guestRename(vm, `${u}:${p}`, newLeaf, { steps: 12000 });
      if (r !== 0) throw new Error(`Seed ${seed} op ${opIdx} rename ${u}:${p} -> ${newLeaf} failed: ${r}`);
      const val = st.files.get(p);
      st.files.delete(p);
      st.files.set(newP, val);
      counts.rename++;
    } else if (roll <= 92) {
      const p = rng.pick(filePaths);
      const r = guestDelete(vm, `${u}:${p}`, { steps: 12000 });
      if (r !== 0) throw new Error(`Seed ${seed} op ${opIdx} delete ${u}:${p} failed: ${r}`);
      st.files.delete(p);
      counts.delete++;
    } else {
      const srcU = state[1].files.size > 0 && (state[2].files.size === 0 || rng.int(0, 1) === 0) ? 1 : 2;
      const dstU = srcU === 1 ? 2 : 1;
      const srcFiles = [...state[srcU].files.keys()];
      if (srcFiles.length === 0) { opIdx--; continue; }
      const srcP = rng.pick(srcFiles);
      const srcVal = state[srcU].files.get(srcP);
      if (dstU === 2 && srcVal.data.length > 1500) { opIdx--; continue; }
      const dstParent = rng.pick(state[dstU].dirs);
      const dstLeaf = 'C' + (nextId++);
      const dstP = (dstParent === '/' ? '' : dstParent) + '/' + dstLeaf;
      const r = guestCopy(vm, `${srcU}:${srcP}`, `${dstU}:${dstP}`, { steps: 30000 });
      if (r < 0) throw new Error(`Seed ${seed} op ${opIdx} copy ${srcU}:${srcP} -> ${dstU}:${dstP} failed: ${r}`);
      state[dstU].files.set(dstP, { data: Int16Array.from(srcVal.data), type: srcVal.type });
      counts.copy++;
    }
  }

  for (const u of [1, 2]) {
    const unitObj = Unit.fromTdisk(vm.exportUnitTdisk(u));
    const ref = new TritFS(unitObj);
    const fsckRes = ref.fsck(false);
    if (fsckRes.problems.length !== 0 || fsckRes.orphans.length !== 0) {
      throw new Error(`Seed ${seed} Unit ${u} fsck failed: ${JSON.stringify(fsckRes)}`);
    }
    // AUDIT (Kehai): exact tree equality, so leftover entries after delete/rename are caught too
    const seen = new Set(); const walk = (p) => { for (const e of ref.list(p)) { const q = (p === '/' ? '' : p) + '/' + e.name; seen.add(q.toLowerCase()); if (e.type === T_DIR) walk(q); } }; walk('/');
    const want = new Set([...state[u].dirs.filter(d => d !== '/'), ...state[u].files.keys()].map(x => x.toLowerCase()));
    const extra = [...seen].filter(x => !want.has(x)), missing = [...want].filter(x => !seen.has(x));
    if (extra.length || missing.length) throw new Error(`AUDIT Seed ${seed} Unit ${u} tree mismatch extra=${extra.slice(0,5)} missing=${missing.slice(0,5)}`);
    AUDIT_TREE.push({ seed, u, entries: seen.size });
    for (const d of state[u].dirs) {
      if (d === '/') continue;
      const stEnt = ref.stat(d);
      if (!stEnt || stEnt.type !== T_DIR) throw new Error(`Seed ${seed} Unit ${u} missing dir ${d}`);
    }
    for (const [p, info] of state[u].files.entries()) {
      const stEnt = ref.stat(p);
      if (!stEnt || stEnt.type !== info.type || stEnt.len !== info.data.length) {
        throw new Error(`Seed ${seed} Unit ${u} stat mismatch on ${p}`);
      }
      const refData = ref.readFile(p);
      for (let i = 0; i < refData.length; i++) {
        if (refData[i] !== info.data[i]) throw new Error(`Seed ${seed} Unit ${u} tryte mismatch on ${p}`);
      }
    }
  }

  return {
    seed,
    totalOps: Object.values(counts).reduce((a, b) => a + b, 0),
    counts,
    u1Files: state[1].files.size,
    u2Files: state[2].files.size
  };
}

function runRefToGuestSeed(seed) {
  const { vm } = bootDesktop2();
  const rng = new SeededRng(seed);
  const unit = new Unit(2187, { removable: true });
  const ref = TritFS.mkfs(unit, 'REF' + seed);
  const dirs = ['/'];
  const files = new Map();
  for (let i = 0; i < 10; i++) {
    const parent = rng.pick(dirs);
    const depth = parent === '/' ? 1 : parent.split('/').filter(Boolean).length + 1;
    if (depth <= 5) {
      const d = (parent === '/' ? '' : parent) + '/DIR' + i;
      ref.mkdir(d, 1000 + i);
      dirs.push(d);
    }
  }
  for (let i = 0; i < 30; i++) {
    const parent = rng.pick(dirs);
    const p = (parent === '/' ? '' : parent) + '/FILE' + i;
    const len = i % 7 === 0 ? 0 : rng.int(1, 2200);
    const data = rng.trytes(len);
    const type = (i % 4) + 1;
    ref.writeFile(p, data, type, 2000 + i);
    files.set(p, { data, type });
  }
  vm.insertUnit(2, unit.toTdisk(), { removable: true, writeProtected: false });
  vm.run(25000);

  for (const d of dirs) {
    const expectedList = ref.list(d);
    const gList = guestList(vm, `2:${d}`, 64, 20000);
    if (gList.count !== expectedList.length) {
      throw new Error(`Ref->Guest seed ${seed} dir ${d} count mismatch`);
    }
  }
  for (const [p, info] of files.entries()) {
    const st = guestStat(vm, `2:${p}`);
    if (!st || st.type !== info.type || st.len !== info.data.length) {
      throw new Error(`Ref->Guest seed ${seed} stat mismatch on ${p}`);
    }
    const rd = guestRead(vm, `2:${p}`, info.data.length + 16);
    if (rd.status !== info.data.length) {
      throw new Error(`Ref->Guest seed ${seed} read status mismatch on ${p}`);
    }
    for (let i = 0; i < info.data.length; i++) {
      if (rd.data[i] !== info.data[i]) throw new Error(`Ref->Guest seed ${seed} tryte mismatch on ${p}`);
    }
  }
  return { seed, dirsChecked: dirs.length, filesChecked: files.size };
}

function runTest() {
  const { T } = bootDesktop2();
  const farCheck = checkFarTargetOffsets(T);
  const guestToRef = [101, 202, 303].map(s => runGuestToRefSeed(s, 500));
  const refToGuest = [404, 505, 606].map(s => runRefToGuestSeed(s));
  return { name: 'd20-01-tritfs-conformance', status: 'PASS', farCheck, guestToRef, refToGuest };
}

if (require.main === module) console.log(JSON.stringify(runTest()));
process.on('exit', () => console.log('AUDIT_TREE', JSON.stringify(AUDIT_TREE)));
module.exports = { runTest };
