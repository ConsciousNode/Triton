const path=require('path'); process.chdir('/tmp/s3/run');
const tcc5=require('/tmp/s3/run/tcc5/tcc5.js'); const fs=require('fs');
const {loadHtmlModule}=require('/tmp/s3/run/tests/t3-common');
const {T}=loadHtmlModule('/tmp/s3/run/triton5.html');
const [lib,src,cap]=process.argv.slice(2);
const exe=tcc5.compileAndLink([{source:fs.readFileSync(lib,'utf8'),filename:'lib.c'},{source:fs.readFileSync(src,'utf8'),filename:'t.c'}],{includePaths:['/tmp/s3/probe/inc'],defines:{},optLevel:1,includeRuntime:true});
const vm=T.TritonWASM.createSync({archMode:'T3',pageSize:2187,mmuMode:'balanced',diskSectors:2});
vm.loadProgram(exe.image,0); const t0=Date.now(); let steps=0; const C=+cap;
while(steps<C){ vm.run(20000000); steps+=20000000; if(/@@(RET|ABORT|EXIT)/.test(vm.consoleOut)) break; }
console.log(JSON.stringify(vm.consoleOut.slice(-80)), 'steps<=',steps, (Date.now()-t0)+'ms');
