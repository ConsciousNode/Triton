const path=require('path');const c=require(path.join(process.argv[2],'tests','t3-common.js'));
const {T}=c.loadHtmlModule('tritos-desktop.html');
const m=T.TritonWASM.createSync({archMode:'T3',nodeId:3});T.bootTritOSDesktop(m,false,{});m.run(300000);
for(let i=0;i<2100;i++){m.pushMouseEvent(i&1?1:-1,0,0);if(i%20==19)m.run(40000);}
m.run(3000000);console.log('mouse head/tail after 2100 moves:',m.i32[20585],m.i32[20586]);
m.pushMouseEvent(5,5,0);m.run(100000);console.log('after one more:',m.i32[20585],m.i32[20586]);
