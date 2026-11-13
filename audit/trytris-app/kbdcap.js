// Does the TritonWASM keyboard queue stop accepting events after 2048 per boot?
const path=require('path');const c=require(path.join(process.argv[2],'tests','t3-common.js'));
const {T}=c.loadHtmlModule('tritos-desktop.html');
const m=T.TritonWASM.createSync({archMode:'T3',nodeId:3});T.bootTritOSDesktop(m,false,{});m.run(300000);
const rd=()=>({head:m.i32[20581],tail:m.i32[20582],last:m.i32[20583]});
const log=[];
for(let i=0;i<2100;i++){m.pushKeyEvent(65+(i%26),i&1);if(i%50==49){m.run(20000);} if([0,1023,2046,2047,2048,2049,2099].includes(i)){m.run(20000);log.push([i,rd()]);}}
m.pushKeyEvent(90,0);m.run(50000);log.push(['after Z',rd()]);
console.log(JSON.stringify(log));
m.run(5000000);log.length=0;log.push(['drained',rd()]);
m.pushKeyEvent(90,0);m.run(200000);log.push(['push Z after drain',rd()]);
console.log(JSON.stringify(log));
// Same check on the plain Triton 3.1 machine page (pinned machine block)
const t3=c.loadHtmlModule(path.resolve(process.argv[2],'..','triton3.html')).T;
const w=t3.TritonWASM.createSync({archMode:'T3',nodeId:1});
for(let i=0;i<2050;i++)w.pushKeyEvent(65,0);
console.log('triton3.html tail after 2050 pushes:',w.i32[20582]);
