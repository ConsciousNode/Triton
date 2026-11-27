#!/usr/bin/env node
'use strict';

/**
 * tcc5 — Triton 5.0 C11 Compiler Driver & CLI (`tcc5/tcc5.js`)
 * ConsciousNode SoftWorks — MIT License
 *
 * Usage:
 *   node tcc5/tcc5.js [-E | -S | -c] [-O0|-O1] [-I dir] [-D NAME=VAL] [-o out] [--run] file1.c ...
 */

const fs = require('fs');
const path = require('path');
const { preprocess } = require('./preproc');
const { parseProgram } = require('./parser');
const { generateAsm } = require('./codegen');
const { assembleT5O } = require('./asm');
const { linkT5X } = require('./linker');

const RUNTIME_DIR = path.resolve(__dirname, '..', 'runtime');
let _cachedRuntimeObjs = null;

function compileCToAsm(source, options = {}) {
  const pp = preprocess(source, options);
  const ast = parseProgram(pp, options.filename || '<stdin>');
  return generateAsm(ast, options);
}

function compileCToObj(source, options = {}) {
  const asm = compileCToAsm(source, options);
  return assembleT5O(asm, options.filename || '<stdin>');
}

function buildRuntimeObjects(forceRebuild = false) {
  if (_cachedRuntimeObjs && !forceRebuild) return _cachedRuntimeObjs;
  const crt0Src = fs.readFileSync(path.join(RUNTIME_DIR, 'crt0.s'), 'utf8');
  const rtMemSrc = fs.readFileSync(path.join(RUNTIME_DIR, 'rt_mem.c'), 'utf8');
  const rtI64Src = fs.readFileSync(path.join(RUNTIME_DIR, 'rt_int64.c'), 'utf8');
  const rtFpSrc = fs.readFileSync(path.join(RUNTIME_DIR, 'rt_softfp.c'), 'utf8');

  const objs = [
    assembleT5O(crt0Src, 'runtime/crt0.s'),
    compileCToObj(rtMemSrc, { filename: 'runtime/rt_mem.c' }),
    compileCToObj(rtI64Src, { filename: 'runtime/rt_int64.c' }),
    compileCToObj(rtFpSrc, { filename: 'runtime/rt_softfp.c' })
  ];
  _cachedRuntimeObjs = objs;
  return objs;
}

function compileAndLink(sources, options = {}) {
  const objs = [];
  if (options.includeRuntime !== false) {
    objs.push(...buildRuntimeObjects());
  }
  for (const item of sources) {
    if (typeof item === 'string') {
      objs.push(compileCToObj(item, options));
    } else if (item.magic === 'T5O1') {
      objs.push(item);
    } else if (item.asm) {
      objs.push(assembleT5O(item.asm, item.filename || '<asm>'));
    } else {
      objs.push(compileCToObj(item.source, Object.assign({}, options, { filename: item.filename || '<c>' })));
    }
  }
  return linkT5X(objs, options);
}

// CLI entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  let mode = 'link'; // 'E', 'S', 'c', 'link'
  let outFile = null;
  let optLevel = 1;
  let runAfter = false;
  let noRuntime = false;
  const includePaths = [];
  const defines = {};
  const inputs = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-E') mode = 'E';
    else if (a === '-S') mode = 'S';
    else if (a === '-c') mode = 'c';
    else if (a === '-O0') optLevel = 0;
    else if (a === '-O1' || a === '-O2') optLevel = 1;
    else if (a === '--run') runAfter = true;
    else if (a === '--nostdlib') noRuntime = true;
    else if (a === '-o') outFile = args[++i];
    else if (a === '-I') includePaths.push(args[++i]);
    else if (a.startsWith('-I')) includePaths.push(a.slice(2));
    else if (a === '-D') {
      const kv = args[++i].split('=');
      defines[kv[0]] = kv.length > 1 ? kv.slice(1).join('=') : '1';
    } else if (a.startsWith('-D')) {
      const kv = a.slice(2).split('=');
      defines[kv[0]] = kv.length > 1 ? kv.slice(1).join('=') : '1';
    } else if (a === '-h' || a === '--help') {
      console.log('Usage: tcc5 [-E|-S|-c] [-O0|-O1] [-I dir] [-D K=V] [-o out] [--run] [--nostdlib] files...');
      process.exit(0);
    } else {
      inputs.push(a);
    }
  }

  if (inputs.length === 0) {
    console.error('tcc5: no input files');
    process.exit(1);
  }

  const opts = { includePaths, defines, optLevel };

  if (mode === 'E') {
    const src = fs.readFileSync(inputs[0], 'utf8');
    const out = preprocess(src, Object.assign({}, opts, { filename: inputs[0] }));
    if (outFile) fs.writeFileSync(outFile, out, 'utf8');
    else process.stdout.write(out);
    process.exit(0);
  }

  if (mode === 'S') {
    const src = fs.readFileSync(inputs[0], 'utf8');
    const out = compileCToAsm(src, Object.assign({}, opts, { filename: inputs[0] }));
    if (outFile) fs.writeFileSync(outFile, out, 'utf8');
    else process.stdout.write(out);
    process.exit(0);
  }

  if (mode === 'c') {
    const f = inputs[0];
    const src = fs.readFileSync(f, 'utf8');
    const obj = f.endsWith('.s') || f.endsWith('.asm')
      ? assembleT5O(src, f)
      : compileCToObj(src, Object.assign({}, opts, { filename: f }));
    const dest = outFile || f.replace(/\.[^.]+$/, '.t5o');
    fs.writeFileSync(dest, JSON.stringify(obj), 'utf8');
    process.exit(0);
  }

  // Link mode
  const srcItems = inputs.map(f => {
    const content = fs.readFileSync(f, 'utf8');
    if (f.endsWith('.t5o')) return JSON.parse(content);
    if (f.endsWith('.s') || f.endsWith('.asm')) return { asm: content, filename: f };
    return { source: content, filename: f };
  });

  const exe = compileAndLink(srcItems, Object.assign({}, opts, { includeRuntime: !noRuntime }));
  if (outFile) {
    const ser = Object.assign({}, exe, { image: Array.from(exe.image) });
    fs.writeFileSync(outFile, JSON.stringify(ser), 'utf8');
  }
  if (runAfter) {
    /* Lifted from tests/t3-common.js so tcc5.js --run works standalone */
    const vmMod = require('vm');
    const htmlContent = fs.readFileSync(path.resolve(__dirname, '..', 'triton5.html'), 'utf8');
    const scriptMatches = [...htmlContent.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)];
    const sb = {
      WebAssembly, Int8Array, Uint8Array, Int16Array, Int32Array, Uint32Array,
      Float32Array, Float64Array, BigInt64Array, BigUint64Array, DataView, ArrayBuffer,
      TextEncoder, TextDecoder, Math, BigInt, JSON, Array, Object, String, Number,
      Boolean, Set, Map, RegExp, Error, Date, console
    };
    sb.globalThis = sb;
    vmMod.createContext(sb);
    for (const m of scriptMatches) vmMod.runInContext(m[1], sb);
    const T = sb.TritonSystem;
    const vm = T.TritonWASM.createSync({ archMode: 'T3', pageSize: 2187, mmuMode: 'balanced', diskSectors: 2 });
    vm.loadProgram(exe.image, 0);
    vm.run(50000000);
    process.stdout.write(vm.consoleOut);
  }
}

module.exports = {
  preprocess,
  parseProgram,
  generateAsm,
  assembleT5O,
  linkT5X,
  compileCToAsm,
  compileCToObj,
  buildRuntimeObjects,
  compileAndLink
};
