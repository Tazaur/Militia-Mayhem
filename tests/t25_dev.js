require('../harness.js');
// dev mode: the yard on a 32 px tile / 16 px wall grid, generated houses (rooms, doors, windows), no-AI dummies with a
// TTK log, wall sections that collapse into rubble, windows you can see and shoot through; then back to a normal world.
setImmediate(()=>{
  let errs=0; const ok=(c,m)=>{if(!c){errs++;console.log('FAIL',m);}};
  // ---- the generator, many seeds
  const OUT=0,FL=1,WA=2,WI=3, D=[[0,-1],[1,0],[0,1],[-1,0]];
  let made=0, Ls=0;
  for(let seed=1;seed<=300;seed++){
    const h=G.genHouse(G.mulberry(seed),24,20); if(!h){ok(false,'no house for seed '+seed);continue;} made++;
    const {W,H,g}=h, at=(x,y)=>x<0||y<0||x>=W||y>=H?OUT:g[y*W+x];
    ok(W<=24&&H<=20,'fits lot'); ok(h.rooms>=3&&h.rooms<=4,'3-4 rooms '+h.rooms);
    let outCells=0; for(let i=0;i<W*H;i++) if(g[i]===OUT) outCells++; if(outCells) Ls++;
    // every floor cell reachable from any other
    const seen=new Uint8Array(W*H); let comp=0;
    for(let i=0;i<W*H;i++) if(g[i]===FL&&!seen[i]){ comp++; const st=[i]; while(st.length){const k=st.pop(); if(seen[k]||g[k]!==FL) continue; seen[k]=1; const x=k%W,y=(k/W)|0; for(const[dx,dy] of D){const nx=x+dx,ny=y+dy; if(nx>=0&&ny>=0&&nx<W&&ny<H) st.push(ny*W+nx);} } }
    ok(comp===1,'one connected inside, seed '+seed);
    // exits: floor cells on the outline (outside next to them) = doors; exactly 2 doors of 2 cells
    let exits=0; for(let y=0;y<H;y++)for(let x=0;x<W;x++) if(at(x,y)===FL&&D.some(([dx,dy])=>at(x+dx,y+dy)===OUT)) exits++;
    ok(exits===4,'front + back door (4 cells) seed '+seed+' got '+exits);
    // windows: only on the outline, runs of 2-3, a wall cell at each end
    for(let y=0;y<H;y++)for(let x=0;x<W;x++) if(at(x,y)===WI){
      ok(D.some(([dx,dy])=>at(x+dx,y+dy)===OUT),'window on outside wall');
      const hz=at(x-1,y)===WI||at(x+1,y)===WI; if(hz){ if(at(x-1,y)!==WI) ok(at(x-1,y)===WA,'wall before window'); if(at(x+1,y)!==WI) ok(at(x+1,y)===WA,'wall after window'); }
    }
    // no wall cell stands alone between two openings (it would draw as a lone post)
    for(let y=0;y<H;y++)for(let x=0;x<W;x++) if(at(x,y)===WA) ok(D.some(([dx,dy])=>at(x+dx,y+dy)===WA),'lone wall cell seed '+seed+' at '+x+','+y);
    let wins=0; for(let i=0;i<W*H;i++) if(g[i]===WI) wins++; ok(wins>=2*h.rooms,'at least one window per room');
  }
  ok(made===300,'all seeds made a house'); ok(Ls>20&&Ls<280,'mix of L and rectangle '+Ls);
  // ---- the yard
  step(30); G.startDev({type:'kb'}); step(5);
  const M=G.M, T=G.MAP.tiled, P=G.PLAYERS[0];
  ok(M.dev&&T&&G.WW===48*32&&G.WH===32*32,'dev yard '+G.WW+'x'+G.WH); ok(T.sc===96&&T.sr===64,'16 px wall grid'); ok(G.NGW===Math.ceil(G.WW/30),'nav grid follows');
  ok(T.houses.length===3,'three houses'); ok(M.sol.length===1,'no bots'); ok(G.MAP.buildings.length===T.secs.length,'one rect per section');
  ok(T.secs.every(s=>s.cw*s.ch<=6&&(s.cw===1||s.ch===1)),'sections are short straight runs');
  ok(G.MAP.sight.length>0&&G.MAP.sight.length<T.secs.length,'merged sight walls');
  for(let i=0;i<60*20&&!(P.sol&&P.sol.alive);i++){ if(i%30===0){G.KB.keys.Space=true;} step(1); G.KB.keys.Space=false; }
  const me=P.sol; if(!me.alive){ G.spawnSoldier(me); } ok(me.alive,'player in');
  // dummy: stands still, no AI
  me.x=3.5*32; me.y=16.5*32; G.DEV.lastA=0; G.DEV.range=6; G.devSpawnDummy();
  const d=M.sol.find(s=>s.dummy); ok(d&&d.alive,'dummy spawned'); const x0=d.x,y0=d.y; step(120); ok(d.x===x0&&d.y===y0&&d.alive,'dummy holds still');
  for(let k=0;k<4;k++){ G.hurtSoldier(d,30,me,'bullet',1,0,'M4A1'); step(6); }
  ok(!d.alive,'dummy dies'); ok(G.DEV.log[0]&&/M4A1 · .* s · 4 HITS · 6\.0 TILES/.test(G.DEV.log[0].text),'ttk log: '+(G.DEV.log[0]&&G.DEV.log[0].text));
  step(100); ok(d.alive&&d.hp===d.mhp&&d.x===x0,'dummy respawns in place');
  G.DEV.god=true; const h=me.hp; G.hurtSoldier(me,50,d,'bullet',1,0); ok(me.hp===h,'god mode'); G.DEV.god=false;
  G.cw(me).mag=1; step(2); ok(G.cw(me).mag===G.WPN[G.cw(me).id].mag,'inf ammo');
  // windows: see and shoot through, can't walk through
  const win=T.secs.find(s=>s.glass), wb=win.b, horiz=wb.w>wb.h;
  const p1=horiz?[wb.x+wb.w/2,wb.y-40]:[wb.x-40,wb.y+wb.h/2], p2=horiz?[wb.x+wb.w/2,wb.y+wb.h+40]:[wb.x+wb.w+40,wb.y+wb.h/2];
  ok(G.los(p1[0],p1[1],p2[0],p2[1]),'see through a window'); ok(G.solidAt(wb.x+wb.w/2,wb.y+wb.h/2,4),'window blocks walking');
  const wall=T.secs.find(s=>!s.glass&&s.cw*s.ch>=3), b=wall.b;
  const q1=b.w>b.h?[b.x+b.w/2,b.y-40]:[b.x-40,b.y+b.h/2], q2=b.w>b.h?[b.x+b.w/2,b.y+b.h+40]:[b.x+b.w+40,b.y+b.h/2];
  ok(!G.los(q1[0],q1[1],q2[0],q2[1]),'wall blocks sight');
  // a wall section: frag dents it, rockets drop it, then it's walkable rubble and the sight walls shrink
  const ns=G.MAP.sight.reduce((a,r)=>a+r.w*r.h,0), cx=b.x+b.w/2, cy=b.y+b.h/2;
  G.explosion(q1[0],q1[1]+(b.w>b.h?28:0),88,150,150,me,0,false); ok(wall.alive&&wall.hp<wall.mhp,'frag dents '+wall.hp+'/'+wall.mhp);
  for(let k=0;k<6&&wall.alive;k++) G.explosion(cx,cy,62,110,250,me,0,true);
  ok(!wall.alive,'rockets collapse it'); ok(!G.MAP.buildings.includes(b),'rect gone'); ok(!G.solidAt(cx,cy,4),'walkable now');
  ok(T.cell[wall.cy*T.sc+wall.cx]===4,'rubble cells'); ok(G.MAP.sight.reduce((a,r)=>a+r.w*r.h,0)<ns,'sight walls updated'); ok(G.los(q1[0],q1[1],q2[0],q2[1]),'see through the hole');
  ok(/WALL .* DOWN/.test(G.DEV.log.map(l=>l.text).join('|')),'collapse logged');
  // vehicles
  const nv=M.vehicles.length; G.devSpawnVeh('jeep'); ok(M.vehicles.length===nv+1,'jeep spawned');
  G.devClearVehicles(); ok(M.vehicles.length===0,'vehicles cleared');
  G.devResetMap(); ok(G.MAP.tiled.secs.every(s=>s.alive)&&G.MAP.buildings.length===G.MAP.tiled.secs.length,'map reset'); ok(M.vehicles.length===3,'default vehicles back');
  const before=JSON.stringify(G.MAP.tiled.houses); G.DEV.seed++; G.devResetMap(); ok(JSON.stringify(G.MAP.tiled.houses)!==before,'new houses');
  step(2); const r=G.DEV.R; ok(r&&G.devClick(r.x+r.w/2,r.y+r.h-2),'panel swallows clicks');
  step(60);
  // normal match afterwards gets the full world back
  G.CFG.mode=1; G.CFG.bots=2; G.toMenu(); step(5); G.newMatch({...G.CFG},false); step(30);
  ok(G.WW===3000&&G.WH===2000&&!G.MAP.tiled&&!G.MAP.sight&&!G.M.dev,'normal world restored'); ok(G.NGW===100,'nav grid restored');
  console.log('errs',errs+global.errs());
});
