require('../harness.js');
// dev mode: the tile yard, no-AI dummies with a TTK log, structural sections that collapse into rubble, and back to a normal world.
setImmediate(()=>{
  let errs=0; const ok=(c,m)=>{if(!c){errs++;console.log('FAIL',m);}};
  step(30); G.startDev({type:'kb'}); step(5);
  const M=G.M, T=G.MAP.tiled, P=G.PLAYERS[0];
  ok(M.dev&&T&&G.WW===48*24&&G.WH===32*24,'dev yard '+G.WW+'x'+G.WH); ok(G.NGW===Math.ceil(G.WW/30),'nav grid follows');
  ok(M.sol.length===1,'no bots'); ok(G.MAP.buildings.length===T.secs.length,'one rect per section');
  for(let i=0;i<60*20&&!(P.sol&&P.sol.alive);i++){ if(i%30===0){G.KB.keys.Space=true;} step(1); G.KB.keys.Space=false; }
  const me=P.sol; if(!me.alive){ G.spawnSoldier(me); } ok(me.alive,'player in');
  // dummy: stands still, no AI
  me.x=3.5*24; me.y=16.5*24; G.DEV.lastA=0; G.DEV.range=6; G.devSpawnDummy();
  const d=M.sol.find(s=>s.dummy); ok(d&&d.alive,'dummy spawned'); const x0=d.x,y0=d.y; step(120); ok(d.x===x0&&d.y===y0&&d.alive,'dummy holds still');
  // TTK log
  for(let k=0;k<4;k++){ G.hurtSoldier(d,30,me,'bullet',1,0,'M4A1'); step(6); }
  ok(!d.alive,'dummy dies'); ok(G.DEV.log[0]&&/M4A1 · .* s · 4 HITS · 6\.0 TILES/.test(G.DEV.log[0].text),'ttk log: '+(G.DEV.log[0]&&G.DEV.log[0].text));
  step(100); ok(d.alive&&d.hp===d.mhp&&d.x===x0,'dummy respawns in place');
  // god mode
  G.DEV.god=true; const h=me.hp; G.hurtSoldier(me,50,d,'bullet',1,0); ok(me.hp===h,'god mode'); G.DEV.god=false;
  // inf ammo
  G.cw(me).mag=1; step(2); ok(G.cw(me).mag===G.WPN[G.cw(me).id].mag,'inf ammo');
  // structure: frag barely scratches brick, rockets bring a section down
  const sec=T.secs[0], b=sec.b, cx=b.x+b.w/2, ey=b.y+b.h+4;
  G.explosion(cx,ey,88,150,150,me,0,false); ok(sec.alive&&sec.hp<sec.mhp,'frag dents '+sec.hp+'/'+sec.mhp);
  for(let k=0;k<6&&sec.alive;k++) G.explosion(cx,ey,62,110,250,me,0,true);
  ok(!sec.alive,'rockets collapse it'); ok(!G.MAP.buildings.includes(b),'rect gone'); ok(!G.solidAt(cx,b.y+b.h/2,4),'walkable now');
  ok(T.rubble[sec.ty*48+sec.tx]===1,'rubble tiles'); ok(T.secs[1].alive,'neighbour section stands');
  ok(/SECTION DOWN/.test(G.DEV.log[0].text),'collapse logged');
  // vehicles
  const nv=M.vehicles.length; G.devSpawnVeh('jeep'); ok(M.vehicles.length===nv+1,'jeep spawned');
  G.devClearVehicles(); ok(M.vehicles.length===0,'vehicles cleared');
  G.devResetMap(); ok(G.MAP.tiled.secs.every(s=>s.alive)&&G.MAP.buildings.length===G.MAP.tiled.secs.length,'map reset'); ok(M.vehicles.length===3,'default vehicles back');
  // panel clicks are swallowed
  step(2); const r=G.DEV.R; ok(r&&G.devClick(r.x+r.w/2,r.y+r.h-2),'panel swallows clicks');
  step(60); ok(true,'runs');
  // height-aware sight: low brick wall (z5) at x 192..216; standing eye (10) at x 132 -> ground shadow ends at x 300
  const L=(x,e,t)=>G.los(132,540,x,540,e,t);
  ok(!L(250,10,0)&&L(320,10,0),'ground shadow is finite'); ok(L(250,10,10),'standing target seen over the wall'); ok(!L(250,10,2)&&L(400,10,2),'prone target hidden close behind, seen far');
  ok(L(250,2,10)&&!L(700,2,10),'prone eye sees a nearby head over the wall, not a far one'); ok(!G.los(132,540,250,540),'flat los still blocks');
  const sh=G.lowShadows(132,540,10,2000); ok(sh.some(P=>G.inPoly(250,540,P))&&!sh.some(P=>G.inPoly(320,540,P)),'shadow polygon matches');
  ok(!G.lowShadows(132,540,2,2000).some(P=>G.inPoly(250,540,P)),'wall taller than a prone eye is a full wall, not a shadow');
  // normal match afterwards gets the full world back
  G.CFG.mode=1; G.CFG.bots=2; G.toMenu(); step(5); G.newMatch({...G.CFG},false); step(30);
  ok(G.WW===3000&&G.WH===2000&&!G.MAP.tiled&&!G.M.dev,'normal world restored'); ok(G.NGW===100,'nav grid restored');
  console.log('errs',errs+global.errs());
});
