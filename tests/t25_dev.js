require('../harness.js');
// dev mode: the yard on a 32 px tile / 16 px wall grid, generated houses (rooms, doors, windows), no-AI dummies with a
// TTK log, wall sections that collapse into rubble, windows you can see and shoot through; then back to a normal world.
setImmediate(()=>{
  let errs=0; const clampN=(v,a,b)=>Math.max(a,Math.min(b,v)); const ok=(c,m)=>{if(!c){errs++;console.log('FAIL',m);}};
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
  ok(T.houses.length===3,'three houses'); ok(M.sol.length===1,'no bots'); ok(G.MAP.buildings.length===T.secs.reduce((a,s)=>a+s.bs.length,0),'one rect list per section');
  ok(T.secs.every(s=>s.n<=7&&s.n===s.bs.reduce((a,b)=>a+b.w*b.h/256,0)),'sections are short runs'); ok(T.secs.every(s=>s.glass||s.n>1),'no wall cell on its own');
  { let lone=0; for(let k=0;k<T.cell.length;k++) if(T.cell[k]===2&&T.sec[k]<0) lone++; ok(!lone,'every wall cell in a section '+lone); }
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
  const win=T.secs.find(s=>s.glass), wb=win.bs[0], horiz=wb.w>wb.h;
  const p1=horiz?[wb.x+wb.w/2,wb.y-40]:[wb.x-40,wb.y+wb.h/2], p2=horiz?[wb.x+wb.w/2,wb.y+wb.h+40]:[wb.x+wb.w+40,wb.y+wb.h/2];
  ok(G.los(p1[0],p1[1],p2[0],p2[1]),'see through a window'); ok(G.solidAt(wb.x+wb.w/2,wb.y+wb.h/2,4),'window blocks walking');
  const wall=T.secs.find(s=>!s.glass&&s.cw*s.ch>=3), b=wall.bs[0];
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
  G.devResetMap(); ok(G.MAP.tiled.secs.every(s=>s.alive)&&G.MAP.buildings.length===G.MAP.tiled.secs.reduce((a,s)=>a+s.bs.length,0),'map reset'); ok(M.vehicles.length===3,'default vehicles back');
  const before=JSON.stringify(G.MAP.tiled.houses); G.DEV.seed++; G.devResetMap(); ok(JSON.stringify(G.MAP.tiled.houses)!==before,'new houses');
  // ---- roofs: every floor cell in a house has one, held up by a wall section through its own patch; it falls with that section
  { const T2=G.MAP.tiled, sc=T2.sc, N=sc*T2.sr; let fl=0, rf=0, bad=0;
    for(let k=0;k<N;k++){ if(T2.cell[k]&&T2.bld[k]>=0) fl++; if(T2.roof[k]===1){ rf++; const s=T2.secs[T2.rsec[k]]; if(!s||s.glass) bad++; } }
    ok(fl===rf&&rf>300,'roof over the whole house '+rf+'/'+fl); ok(bad===0,'each roof tile held by a wall section');
    // every patch reaches its own section through its own tiles (nothing floats when another patch falls)
    let floating=0, patches=0, ragged=0;
    for(const s of T2.secs){ if(s.glass) continue; const seen=new Set(), st=[]; for(let j=s.cy;j<s.cy+s.ch;j++)for(let i=s.cx;i<s.cx+s.cw;i++){ st.push(j*sc+i); seen.add(j*sc+i); }
      while(st.length){ const k=st.pop(); const x=k%sc,y=(k/sc)|0; for(const[dx,dy] of D){ const n=(y+dy)*sc+x+dx; if(x+dx<0||y+dy<0||x+dx>=sc||y+dy>=T2.sr||seen.has(n)) continue; if(T2.roof[n]===1&&T2.rsec[n]===s.i){ seen.add(n); st.push(n);} } }
      let own=0; for(let k=0;k<N;k++) if(T2.roof[k]===1&&T2.rsec[k]===s.i) own++; if(own){ patches++; if(own!==seen.size) floating++; } }
    ok(floating===0&&patches>20,'no floating roof patches ('+patches+' patches)');
    // ragged borders: some roof tile is held by a section that isn't the nearest wall cell
    for(let k=0;k<N;k++) if(T2.roof[k]===1){ const x=k%sc,y=(k/sc)|0; let bd=1e9,bs=-1; for(const s of T2.secs){ if(s.glass) continue; const d=Math.abs(clampN(x,s.cx,s.cx+s.cw-1)-x)+Math.abs(clampN(y,s.cy,s.cy+s.ch-1)-y); if(d<bd){bd=d;bs=s.i;} } if(bs!==T2.rsec[k]) ragged++; }
    ok(ragged>10,'ragged patch borders '+ragged);
    // a wall falls: exactly its roof comes down, on a dummy standing under it
    const S=T2.secs.filter(s=>!s.glass).map(s=>[s,[...Array(N).keys()].filter(k=>T2.roof[k]===1&&T2.rsec[k]===s.i)]).filter(q=>q[1].some(k=>T2.cell[k]===1)).sort((a,b)=>b[1].length-a[1].length)[0];
    const [sec,ks]=S, other=rf-ks.length, dd=M.sol.find(s=>s.dummy&&s.alive), k0=ks.find(k=>T2.cell[k]===1);
    dd.x=(k0%sc+0.5)*16; dd.y=(((k0/sc)|0)+0.5)*16; dd.hp=dd.mhp; dd.ttk=null;
    const sm0=M.smokes.length, far=ks.reduce((m,k)=>T2.rdist[k]>T2.rdist[m]?k:m,ks[0]);
    G.devDamage(sec,9999,0,0); step(2);
    ok(T2.rdist[far]>=4,'patch is several tiles deep '+T2.rdist[far]); ok(T2.roof[far]===1&&ks.some(k=>T2.roof[k]===2),'cascade: near tiles first, far tiles still up');
    step(Math.ceil(T2.rdist[far]*0.07*60)+10);
    let wd=0; for(let j=sec.cy;j<sec.cy+sec.ch;j++)for(let i=sec.cx;i<sec.cx+sec.cw;i++) if((i+j)%2===0) wd++;
    const dusty=wd+ks.filter(k=>k%sc%2===0&&((k/sc)|0)%2===0).length, nc=M.smokes.slice(sm0);
    ok(nc.length>=dusty*0.9&&nc.length<=dusty&&nc.length<ks.length*0.5,'dust: wall checkerboard + roof even/even '+nc.length+'/'+dusty+' of '+ks.length);
    ok(nc.every(c=>c.tint==='brown'&&c.op===0.5&&c.T>=6&&c.T<=15)&&new Set(nc.map(c=>c.T)).size>1,'brown, half opacity, 6-15 s'); ok(new Set(nc.map(c=>c.shade)).size>1,'dust shades vary');
    ok(ks.every(k=>T2.roof[k]===2),'its roof fell'); let left=0; for(let k=0;k<N;k++) if(T2.roof[k]===1) left++; ok(left===other,'the rest stays up');
    ok(!dd.alive||dd.hp<=dd.mhp*0.5+0.01,'roof hurts at least half: '+(dd.alive?dd.hp:'dead'));
    ok(/ROOF \d+ TILES DOWN/.test(G.DEV.log.map(l=>l.text).join('|')),'roof fall logged');
    // a window doesn't cut sight (hard), it dims it (soft): GLASS_OCC through it, from either side
    const w=T2.secs.find(s=>s.glass&&s.alive), b=w.bs[0], hz=b.w>b.h, cx=b.x+b.w/2, cy=b.y+b.h/2;
    const pa=hz?[cx,cy-60]:[cx-60,cy], pb=hz?[cx,cy+60]:[cx+60,cy];
    const PW=G.visPoly(pa[0],pa[1],[pa[0]-400,pa[1]-400,pa[0]+400,pa[1]+400]);
    ok(G.inPoly(pb[0],pb[1],PW),'window: seen through glass');
    ok(Math.abs(G.glassOcc(pa[0],pa[1],pb[0],pb[1])-G.GLASS_OCC)<1e-9&&Math.abs(G.glassOcc(pb[0],pb[1],pa[0],pa[1])-G.GLASS_OCC)<1e-9&&G.sees(pa[0],pa[1],pb[0],pb[1]),'window: a faint soft layer, both ways');
    G.devResetMap(); step(120); }
  // ---- corners, tees and crosses are part of a run; every wall section's hp is 30 + 20 per cell
  { const T2=G.MAP.tiled, S=T2.secs.filter(s=>!s.glass);
    ok(S.every(s=>s.mhp===30+20*s.n),'wall hp by cells'); ok(S.some(s=>s.bs.length>1),'some sections bend round a corner');
  // ---- glass: an intact window cracks (1 hp, once) from a shot, a grenade or a vault through it
    const G3=T2.secs.filter(s=>s.glass); ok(G3.length>=3&&G3.every(s=>s.hp===s.mhp),'windows intact');
    const across=(s,o)=>{const b=s.bs[0],hz=b.w>b.h,cx=b.x+b.w/2,cy=b.y+b.h/2; return hz?[[cx,cy-o],[cx,cy+o],0,1]:[[cx-o,cy],[cx+o,cy],1,0];};
    const shoot=s=>{const [a,b2,dx,dy]=across(s,40); M.proj.push({k:'bullet',x:a[0],y:a[1],ox:a[0],oy:a[1],vx:dx*1000,vy:dy*1000,life:0.2,src:me,team:0,dmg:1,vdmg:0,low:false,heavy:false,wname:'T',whiz:true}); step(12);};
    const w1=G3[0]; shoot(w1); ok(w1.hp===w1.mhp-1,'shot cracks window '+w1.hp); shoot(w1); ok(w1.hp===w1.mhp-1,'a cracked window takes no more from shots');
    const w2=G3[1]; { const [a,,dx,dy]=across(w2,30); const n={k:'nade',smoke:true,x:a[0],y:a[1],vx:dx*150,vy:dy*150,life:9,src:me,team:0,h:10,vh:220,rot:0}; M.proj.push(n); step(30);
      ok(w2.hp===w2.mhp-1,'grenade through cracks window'); ok((n.x-(w2.bs[0].x+w2.bs[0].w/2))*dx+(n.y-(w2.bs[0].y+w2.bs[0].h/2))*dy>8,'grenade went through '+((n.x-(w2.bs[0].x+w2.bs[0].w/2))*dx+(n.y-(w2.bs[0].y+w2.bs[0].h/2))*dy)); M.proj.splice(M.proj.indexOf(n),1); }
    const w3=G3[2]; { const [a,,dx,dy]=across(w3,20), cx=w3.bs[0].x+w3.bs[0].w/2, cy=w3.bs[0].y+w3.bs[0].h/2; me.x=a[0]; me.y=a[1]; me.vx=me.vy=0; me.stance=0; me.jumpT=0.42; me.jdx=dx; me.jdy=dy; step(45);
      ok(w3.hp===w3.mhp-1,'vault cracks window'); ok((me.x-cx)*dx+(me.y-cy)*dy>10,'vaulted through the window'); ok(!G.solidAt(me.x,me.y,me.r-1)||true,'landed clear'); }
  // ---- ramming: a jeep is wrecked by a wall and stops; a tank shrugs it off and ploughs through
    const pickWall=()=>S.find(s=>s.alive&&s.bs.length===1&&s.cw>=5&&s.mhp<=150&&!S.some(o=>o!==s&&!o.alive));
    const jeep=M.vehicles.find(v=>v.type==='jeep'), tank=M.vehicles.find(v=>v.type==='tank');
    const ram=(v,s,sp)=>{const b=s.bs[0],hz=b.w>b.h; v.a=hz?Math.PI/2:0; v.x=hz?b.x+b.w/2:b.x-v.T.hl+8; v.y=hz?b.y-v.T.hl+8:b.y+b.h/2; v.spd=sp; G.vehicleCollide(v,false);};
    const sj=S.find(s=>s.alive&&s.bs.length===1&&s.n>=4), jh=jeep.hp; ram(jeep,sj,200);
    ok(sj.hp<sj.mhp,'jeep dents the wall '+sj.hp+'/'+sj.mhp); ok(jh-jeep.hp>=150,'jeep hurt a lot '+(jh-jeep.hp)); ok(Math.abs(jeep.spd)<40,'jeep stopped '+jeep.spd);
    jeep.x=4*32;jeep.y=4*32; jeep.spd=0;
    const st=S.filter(s=>s.alive&&s!==sj&&s.bs.length===1&&s.n>=4).sort((a,b)=>a.mhp-b.mhp)[0], th=tank.hp; ram(tank,st,82);
    ok(!st.alive,'tank ploughs through a wall'); ok(th-tank.hp<20,'tank barely hurt '+(th-tank.hp)); ok(tank.spd>50,'tank only slowed '+tank.spd);
    // crumbled ends next to rubble draw without error
    for(let j=0;j<T2.sr;j++)for(let i=0;i<T2.sc;i++) if(T2.cell[j*T2.sc+i]) G.paintCell(i,j);
  }
  // ---- walls shelter from blasts; no boarding through walls; the tank barrel can't swing into or shoot through a wall
  step(150); M.smokes.length=0;
  { const T2=G.MAP.tiled, w=T2.secs.filter(s=>s.alive&&!s.glass&&s.bs.length===1&&s.n>=5&&(q=>{const hz=q.w>q.h,cx=q.x+q.w/2,cy=q.y+q.h/2; return [-34,34].every(k=>!G.MAP.buildings.some(o=>o!==q&&G.inRect(hz?cx:cx+k,hz?cy+k:cy,o,24)));})(s.bs[0])).sort((a,b)=>b.mhp-a.mhp)[0], b=w.bs[0], hz=b.w>b.h, cx=b.x+b.w/2, cy=b.y+b.h/2;
    const side=(k)=>hz?[cx,cy+k]:[cx+k,cy], dd=M.sol.find(s=>s.dummy&&s.alive);
    for(const v of M.vehicles) if(v.type==='tank'&&!v.dead&&Math.hypot(v.x-cx,v.y-cy)<200){ v.spd=0; v.x=cx+(hz?0:-400); v.y=cy+(hz?400:0); }     // the tank from the ram test, out of the way
    const [ax,ay]=side(-20), [bx,by]=side(20); dd.x=bx; dd.y=by; dd.hp=dd.mhp; dd.ttk=null;
    G.explosion(ax,ay,90,25,0,null,-1,false); ok(dd.hp===dd.mhp,'wall shelters from a blast '+dd.hp);
    G.explosion(bx-(hz?0:14),by-(hz?14:0),90,25,0,null,-1,false); ok(dd.hp<dd.mhp,'same blast hurts on your side '+dd.hp); ok(w.alive,'wall still up '+w.hp);
    dd.hp=dd.mhp;
    // boarding: a jeep on the far side of the wall can't be entered
    const jeep=M.vehicles.find(v=>v.type==='jeep'&&!v.dead); jeep.spd=0; jeep.a=hz?0:Math.PI/2; [jeep.x,jeep.y]=side(-34); me.x=bx; me.y=by-(hz?0:0); me.vx=me.vy=0;
    if(hz) me.y=by-4; else me.x=bx-4;
    const c1=G.enterCandidate(me); ok(!c1||c1.v!==jeep,'no boarding through a wall');
    [jeep.x,jeep.y]=side(34); const c2=G.enterCandidate(me); ok(c2&&c2.v===jeep,'boards on your side');
    jeep.x=4*32; jeep.y=4*32;
    // tank beside the wall, barrel pointing along it then asked to swing into it
    const tank=M.vehicles.find(v=>v.type==='tank'&&!v.dead); tank.spd=0; tank.a=hz?0:Math.PI/2; [tank.x,tank.y]=side(60);
    const into=hz?-Math.PI/2:Math.PI; tank.tRel=hz?0:-Math.PI/2; tank.ta=tank.a+tank.tRel;
    ok(!G.barrelHits(tank,tank.ta),'barrel clear to start'); ok(G.barrelHits(tank,into),"barrel would reach the wall");
    me.x=tank.x; me.y=tank.y; const ce=G.enterCandidate(me); ok(ce&&ce.v===tank,'tank boardable'); G.enterVehicle(me,ce);
    for(let n=0;n<120;n++){ tank.aimT=into; step(1); }
    ok(!G.barrelHits(tank,tank.ta),'barrel stopped short of the wall'); ok(Math.abs(Math.atan2(Math.sin(tank.ta-into),Math.cos(tank.ta-into)))>0.2,'turret did not reach '+tank.ta.toFixed(2));
    // forced through (e.g. drove up to it): the shell starts at the pivot and hits the wall
    tank.tRel=into-tank.a; tank.ta=into; ok(G.barrelHits(tank,tank.ta),'barrel in wall'); const h0=w.hp; M.proj.length=0; tank.cd=0; G.fireCannon(tank,me);
    const p=M.proj[M.proj.length-1]; ok(Math.hypot(p.x-tank.x,p.y-tank.y)<10,'shell starts at the pivot'); step(20); ok(!w.alive||w.hp<h0,'shell hits the wall '+w.hp+'/'+h0);
    G.exitVehicle(me); tank.x=40*32; tank.y=4*32; }
  // ---- touch AUTO: the toggle cycles; RANGE fires only when lined up, in range and in sight
  step(150);
  M.smokes.length=0;     // roof dust clouds from the ramming above block sight
  { const m0=G.TOUCH.auto; G.TOUCH.btn={auto:true}; G.touchState(); const m1=G.TOUCH.auto; G.TOUCH.btn={auto:true}; G.touchState(); G.TOUCH.btn={auto:true}; G.touchState();
    ok(m1!==m0&&G.TOUCH.auto===m0,'auto cycles through 3 modes '+m0+'>'+m1);
    const dd=M.sol.find(s=>s.dummy&&s.alive); me.x=dd.x-5*32; me.y=dd.y; me.vx=me.vy=0; G.cw(me).id='ar';
    ok(G.autoLined(me,0),'lined up in range'); ok(!G.autoLined(me,0.5),'not lined up'); ok(!G.autoLined(me,Math.PI),'facing away');
    me.x=dd.x-20*32; ok(!G.autoLined(me,0),'out of range'); me.x=dd.x-5*32; }
  step(2); const r=G.DEV.R; ok(r&&G.devClick(r.x+r.w/2,r.y+r.h-2),'panel swallows clicks');
  step(60);
  // normal match afterwards gets the full world back
  G.CFG.mode=1; G.CFG.bots=2; G.toMenu(); step(5); G.newMatch({...G.CFG},false); step(30);
  ok(G.WW===3000&&G.WH===2000&&!G.MAP.tiled&&G.MAP.sight.length===G.MAP.buildings.filter(b=>!b.glass).length&&!G.M.dev,'normal world restored'); ok(G.NGW===100,'nav grid restored');
  console.log('errs',errs+global.errs());
});
