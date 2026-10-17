require('../harness.js');
setImmediate(()=>{
  step(5); G.newMatch({mode:0,map:0,bots:0,limit:1,skill:1,camera:'shared',weather:'clear'},false);
  const M=G.M; M.sol.length=0;
  M.wrecks.push({type:'tank',x:1500,y:1000,a:0,ta:0,t:180,T:180,burn:0,hl:46,hw:26});
  const mk=(t,x,y)=>{const s=G.makeSoldier({team:t,color:t?'red':'blue',name:'S'+t,bot:true}); G.spawnSoldier(s,{kind:'pt',x,y}); s.x=x;s.y=y;s.protect=0;s.bot.thinkT=1e9;M.sol.push(s);return s;};
  const a=mk(0,1380,1000), b=mk(1,1580,1000); let hits=0;
  for(let i=0;i<40;i++){ b.hp=100; a.a=0; a.fireCd=0; a.reloadT=0; G.cw(a).mag=30; G.fireWeapon(a); for(let k=0;k<30;k++) step(1); if(b.hp<100||!b.alive){hits++; b.alive=true; b.hp=100; b.x=1580;b.y=1000;} a.x=1380;a.y=1000;b.x=1580;b.y=1000; }
  // walking into the wreck
  a.x=1440; a.y=1000; for(let k=0;k<5;k++){ a.x+=10; step(1);} 
  console.log('hits through wreck',hits,'/40','soldier pushed out',Math.abs(a.y-1000)>20||a.x<1460, 'errs',errs());
});
