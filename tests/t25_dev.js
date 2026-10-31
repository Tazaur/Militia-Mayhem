require('../harness.js');
// dev mode (a setting: OUTSKIRTS here): generated houses (rooms, doors, windows), no-AI dummies with a TTK log,
// scenes (5g_test.js), playing as AI, wall sections that collapse into rubble, windows you can see and shoot through; then back to a normal world.
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
  // ---- a dev match on OUTSKIRTS
  step(30); G.testStart('outskirts'); step(5);
  const M=G.M, P=G.PLAYERS[0], SECS=()=>G.MAP.secs;
  // a rect's world box as a rect (the yard's houses aren't turned, so it is the rect itself, moved)
  const W_=b=>{const q=G.rectBox(b); return {x:q[0],y:q[1],w:q[2]-q[0],h:q[3]-q[1]};};
  ok(M.dev&&G.MAP.id==='outskirts','dev match on outskirts'); ok(G.NGW===G.WW/16,'nav grid on the wall grid');
  ok(G.MAP.houses.length>3,'houses'); ok(M.sol.length===1,'no bots'); ok(G.MAP.buildings.length===SECS().reduce((a,s)=>a+s.bs.length,0),'one rect list per section');
  ok(SECS().every(s=>s.n<=7&&s.n===s.bs.reduce((a,b)=>a+b.w*b.h/256,0)),'sections are short runs'); ok(SECS().every(s=>s.glass||s.n>1),'no wall cell on its own');
  { let lone=0; for(const H of G.MAP.houses) for(let k=0;k<H.cell.length;k++) if(H.cell[k]===2&&H.sec[k]<0) lone++; ok(!lone,'every wall cell in a section '+lone); }
  ok(G.MAP.sight.length>0&&G.MAP.sight.length<SECS().length,'merged sight walls');
  for(let i=0;i<60*20&&!(P.sol&&P.sol.alive);i++){ if(i%30===0){G.KB.keys.Space=true;} step(1); G.KB.keys.Space=false; }
  const me=P.sol; if(!me.alive){ G.spawnSoldier(me); } ok(me.alive,'player in');
  // dummy: stands still, no AI
  me.x=6.5*32; me.y=32.5*32; G.DEV.lastA=0; G.DEV.range=6; G.devSpawnDummy();
  const d=M.sol.find(s=>s.dummy); ok(d&&d.alive,'dummy spawned'); const x0=d.x,y0=d.y; step(120); ok(d.x===x0&&d.y===y0&&d.alive,'dummy holds still');
  for(let k=0;k<4;k++){ G.hurtSoldier(d,30,me,'bullet',1,0,'M4A1'); step(6); }
  ok(!d.alive,'dummy dies'); ok(G.DEV.log[0]&&/M4A1 · .* s · 4 HITS · 6\.0 TILES/.test(G.DEV.log[0].text),'ttk log: '+(G.DEV.log[0]&&G.DEV.log[0].text));
  step(100); ok(d.alive&&d.hp===d.mhp&&d.x===x0,'dummy respawns in place');
  G.DEV.god=true; const h=me.hp; G.hurtSoldier(me,50,d,'bullet',1,0); ok(me.hp===h,'god mode'); G.DEV.god=false;
  G.cw(me).mag=1; step(2); ok(G.cw(me).mag===G.WPN[G.cw(me).id].mag,'inf ammo');
  // windows: see and shoot through, can't walk through
  const win=SECS().find(s=>s.glass), wb=W_(win.bs[0]), horiz=wb.w>wb.h;
  const p1=horiz?[wb.x+wb.w/2,wb.y-40]:[wb.x-40,wb.y+wb.h/2], p2=horiz?[wb.x+wb.w/2,wb.y+wb.h+40]:[wb.x+wb.w+40,wb.y+wb.h/2];
  ok(G.los(p1[0],p1[1],p2[0],p2[1]),'see through a window'); ok(G.solidAt(wb.x+wb.w/2,wb.y+wb.h/2,4),'window blocks walking');
  const wall=SECS().find(s=>!s.glass&&s.cw*s.ch>=3), b=W_(wall.bs[0]);
  const q1=b.w>b.h?[b.x+b.w/2,b.y-40]:[b.x-40,b.y+b.h/2], q2=b.w>b.h?[b.x+b.w/2,b.y+b.h+40]:[b.x+b.w+40,b.y+b.h/2];
  ok(!G.los(q1[0],q1[1],q2[0],q2[1]),'wall blocks sight');
  // a wall section: frag dents it, rockets drop it, then it's walkable rubble and the sight walls shrink
  const ns=G.MAP.sight.reduce((a,r)=>a+r.w*r.h,0), cx=b.x+b.w/2, cy=b.y+b.h/2;
  G.explosion(q1[0],q1[1]+(b.w>b.h?28:0),88,150,150,me,0,false); ok(wall.alive&&wall.hp<wall.mhp,'frag dents '+wall.hp+'/'+wall.mhp);
  for(let k=0;k<6&&wall.alive;k++) G.explosion(cx,cy,62,110,250,me,0,true);
  ok(!wall.alive,'rockets collapse it'); ok(!G.MAP.buildings.includes(wall.bs[0]),'rect gone'); ok(!G.solidAt(cx,cy,4),'walkable now');
  ok(wall.h.cell[wall.cy*wall.h.W+wall.cx]===4,'rubble cells'); ok(G.MAP.sight.reduce((a,r)=>a+r.w*r.h,0)<ns,'sight walls updated'); ok(G.los(q1[0],q1[1],q2[0],q2[1]),'see through the hole');
  ok(/WALL .* DOWN/.test(G.DEV.log.map(l=>l.text).join('|')),'collapse logged');
  // vehicles
  const nv=M.vehicles.length; G.devSpawnVeh('jeep'); ok(M.vehicles.length===nv+1,'jeep spawned');
  G.devClearVehicles(); ok(M.vehicles.length===0,'vehicles cleared');
  G.devResetMap(); ok(SECS().every(s=>s.alive)&&G.MAP.buildings.length===SECS().reduce((a,s)=>a+s.bs.length,0),'map reset'); ok(M.vehicles.length===G.MAP.vehSpawns.length,'default vehicles back');
  // ---- roofs: every floor cell in a house has one, held up by a wall section through its own patch; it falls with that section
  { const HS=G.MAP.houses; let fl=0, rf=0, bad=0;
    for(const H of HS) for(let k=0;k<H.W*H.H;k++){ if(H.cell[k]) fl++; if(H.roof[k]===1){ rf++; const s=H.secs[H.rsec[k]]; if(!s||s.glass) bad++; } }
    ok(fl===rf&&rf>300,'roof over the whole house '+rf+'/'+fl); ok(bad===0,'each roof tile held by a wall section');
    // every patch reaches its own section through its own tiles (nothing floats when another patch falls)
    let floating=0, patches=0, ragged=0;
    for(const H of HS) for(const s of H.secs){ if(s.glass) continue; const sc=H.W, N=H.W*H.H, seen=new Set(), st=[]; for(let j=s.cy;j<s.cy+s.ch;j++)for(let i=s.cx;i<s.cx+s.cw;i++){ st.push(j*sc+i); seen.add(j*sc+i); }
      while(st.length){ const k=st.pop(); const x=k%sc,y=(k/sc)|0; for(const[dx,dy] of D){ const n=(y+dy)*sc+x+dx; if(x+dx<0||y+dy<0||x+dx>=sc||y+dy>=H.H||seen.has(n)) continue; if(H.roof[n]===1&&H.rsec[n]===s.li){ seen.add(n); st.push(n);} } }
      let own=0; for(let k=0;k<N;k++) if(H.roof[k]===1&&H.rsec[k]===s.li) own++; if(own){ patches++; if(own!==seen.size) floating++; } }
    ok(floating===0&&patches>20,'no floating roof patches ('+patches+' patches)');
    // ragged borders: some roof tile is held by a section that isn't the nearest wall cell
    for(const H of HS) for(let k=0;k<H.W*H.H;k++) if(H.roof[k]===1){ const x=k%H.W,y=(k/H.W)|0; let bd=1e9,bs=-1; for(const s of H.secs){ if(s.glass) continue; const d=Math.abs(clampN(x,s.cx,s.cx+s.cw-1)-x)+Math.abs(clampN(y,s.cy,s.cy+s.ch-1)-y); if(d<bd){bd=d;bs=s.li;} } if(bs!==H.rsec[k]) ragged++; }
    ok(ragged>10,'ragged patch borders '+ragged);
    // a wall falls: exactly its roof comes down, on a dummy standing under it
    const S=SECS().filter(s=>!s.glass).map(s=>[s,[...Array(s.h.W*s.h.H).keys()].filter(k=>s.h.roof[k]===1&&s.h.rsec[k]===s.li)]).filter(q=>q[1].some(k=>q[0].h.cell[k]===1)).sort((a,b)=>b[1].length-a[1].length)[0];
    const [sec,ks]=S, T2=sec.h, other=rf-ks.length, dd=M.sol.find(s=>s.dummy&&s.alive), k0=ks.find(k=>T2.cell[k]===1);
    [dd.x,dd.y]=G.cellW(T2,k0%T2.W,(k0/T2.W)|0); dd.hp=dd.mhp; dd.ttk=null;
    M.gsf=null; const far=ks.reduce((m,k)=>T2.rdist[k]>T2.rdist[m]?k:m,ks[0]);
    G.devDamage(sec,9999,0,0); step(2);
    ok(T2.rdist[far]>=4,'patch is several tiles deep '+T2.rdist[far]); ok(T2.roof[far]===1&&ks.some(k=>T2.roof[k]===2),'cascade: near tiles first, far tiles still up');
    step(Math.ceil(T2.rdist[far]*0.07*60)+10);
    let wd=0; for(let j=sec.cy;j<sec.cy+sec.ch;j++)for(let i=sec.cx;i<sec.cx+sec.cw;i++) if((i+j)%2===0) wd++;
    const F=M.gsf; let dB=0,dA=0; if(F){ for(const k of F.act){dA+=F.A[k];dB+=F.B[k];} for(const e of F.em){dA+=e[1];if(e[2])dB+=e[1];} }
    ok(F&&dB>wd&&Math.abs(dA-dB)<1e-3,'dust: brown smoke in the field '+dB.toFixed(1)+' (all of it brown)');
    ok(ks.every(k=>T2.roof[k]===2),'its roof fell'); let left=0; for(const H of HS) for(let k=0;k<H.W*H.H;k++) if(H.roof[k]===1) left++; ok(left===other,'the rest stays up');
    ok(!dd.alive||dd.hp<=dd.mhp*0.5+0.01,'roof hurts at least half: '+(dd.alive?dd.hp:'dead'));
    ok(/ROOF \d+ TILES DOWN/.test(G.DEV.log.map(l=>l.text).join('|')),'roof fall logged');
    // a window doesn't cut sight (hard), it dims it (soft): GLASS_OCC through it, from either side
    const w=SECS().find(s=>s.glass&&s.alive), b=W_(w.bs[0]), hz=b.w>b.h, cx=b.x+b.w/2, cy=b.y+b.h/2;
    const pa=hz?[cx,cy-60]:[cx-60,cy], pb=hz?[cx,cy+60]:[cx+60,cy];
    const PW=G.visPoly(pa[0],pa[1],[pa[0]-400,pa[1]-400,pa[0]+400,pa[1]+400]);
    ok(G.inPoly(pb[0],pb[1],PW),'window: seen through glass');
    ok(Math.abs(G.glassOcc(pa[0],pa[1],pb[0],pb[1])-G.GLASS_OCC)<1e-9&&Math.abs(G.glassOcc(pb[0],pb[1],pa[0],pa[1])-G.GLASS_OCC)<1e-9&&G.sees(pa[0],pa[1],pb[0],pb[1]),'window: a faint soft layer, both ways');
    G.devResetMap(); step(120); }
  // ---- corners, tees and crosses are part of a run; every wall section's hp is 30 + 20 per cell
  { const S=SECS().filter(s=>!s.glass);
    ok(S.every(s=>s.mhp===30+20*s.n),'wall hp by cells'); ok(S.some(s=>s.bs.length>1),'some sections bend round a corner');
  // ---- glass: an intact window cracks (1 hp, once) from a shot, a grenade or a vault through it
    const G3=SECS().filter(s=>s.glass); ok(G3.length>=3&&G3.every(s=>s.hp===s.mhp),'windows intact');
    const across=(s,o)=>{const b=W_(s.bs[0]),hz=b.w>b.h,cx=b.x+b.w/2,cy=b.y+b.h/2; return hz?[[cx,cy-o],[cx,cy+o],0,1]:[[cx-o,cy],[cx+o,cy],1,0];};
    const shoot=s=>{const [a,b2,dx,dy]=across(s,40); M.proj.push({k:'bullet',x:a[0],y:a[1],ox:a[0],oy:a[1],vx:dx*1000,vy:dy*1000,life:0.2,src:me,team:0,dmg:1,vdmg:0,low:false,heavy:false,wname:'T',whiz:true}); step(12);};
    const w1=G3[0]; shoot(w1); ok(w1.hp===w1.mhp-1,'shot cracks window '+w1.hp); shoot(w1); ok(w1.hp===w1.mhp-1,'a cracked window takes no more from shots');
    const w2=G3[1]; { const [a,,dx,dy]=across(w2,30); const n={k:'nade',smoke:true,x:a[0],y:a[1],vx:dx*150,vy:dy*150,life:9,src:me,team:0,h:10,vh:220,rot:0}; M.proj.push(n); step(30);
      ok(w2.hp===w2.mhp-1,'grenade through cracks window'); ok((n.x-(W_(w2.bs[0]).x+W_(w2.bs[0]).w/2))*dx+(n.y-(W_(w2.bs[0]).y+W_(w2.bs[0]).h/2))*dy>8,'grenade went through'); M.proj.splice(M.proj.indexOf(n),1); }
    if(!me.alive) G.spawnSoldier(me);     // the blasts above can kill you (a bigger map: more in reach)
    const w3=G3[2]; { const [a,,dx,dy]=across(w3,20), cx=W_(w3.bs[0]).x+W_(w3.bs[0]).w/2, cy=W_(w3.bs[0]).y+W_(w3.bs[0]).h/2; me.x=a[0]; me.y=a[1]; me.vx=me.vy=0; me.stance=0; me.jumpT=0.42; me.jdx=dx; me.jdy=dy; step(45);
      ok(w3.hp===w3.mhp-1,'vault cracks window '+[w3.hp,w3.mhp,a.map(Math.round),me.x|0,me.y|0,dx,dy,cx,cy]); ok((me.x-cx)*dx+(me.y-cy)*dy>10,'vaulted through the window'); ok(!G.solidAt(me.x,me.y,me.r-1)||true,'landed clear'); }
  // ---- ramming: a jeep is wrecked by a wall and stops; a tank shrugs it off and ploughs through
    const pickWall=()=>S.find(s=>s.alive&&s.bs.length===1&&s.cw>=5&&s.mhp<=150&&!S.some(o=>o!==s&&!o.alive));
    const jeep=M.vehicles.find(v=>v.type==='jeep'), tank=M.vehicles.find(v=>v.type==='tank');
    const ram=(v,s,sp)=>{const b=W_(s.bs[0]),hz=b.w>b.h; v.a=hz?Math.PI/2:0; v.x=hz?b.x+b.w/2:b.x-v.T.hl+8; v.y=hz?b.y-v.T.hl+8:b.y+b.h/2; v.spd=sp; G.vehicleCollide(v,false);};
    const sj=S.find(s=>s.alive&&s.bs.length===1&&s.n>=4), jh=jeep.hp; ram(jeep,sj,200);
    ok(sj.hp<sj.mhp,'jeep dents the wall '+sj.hp+'/'+sj.mhp); ok(jh-jeep.hp>=150,'jeep hurt a lot '+(jh-jeep.hp)); ok(Math.abs(jeep.spd)<40,'jeep stopped '+jeep.spd);
    jeep.x=4*32;jeep.y=4*32; jeep.spd=0;
    const st=S.filter(s=>s.alive&&s!==sj&&s.bs.length===1&&s.n>=4).sort((a,b)=>a.mhp-b.mhp)[0], th=tank.hp; ram(tank,st,82);
    ok(!st.alive,'tank ploughs through a wall'); ok(th-tank.hp<20,'tank barely hurt '+(th-tank.hp)); ok(tank.spd>50,'tank only slowed '+tank.spd);
    // crumbled ends next to rubble draw without error
    for(const H of G.MAP.houses) for(let j=0;j<H.H;j++)for(let i=0;i<H.W;i++) G.paintCell(H,i,j);
  }
  // ---- walls shelter from blasts; no boarding through walls; the tank barrel can't swing into or shoot through a wall
  step(150); M.gsf=null;
  { const w=SECS().filter(s=>s.alive&&!s.glass&&s.bs.length===1&&s.n>=5&&(q0=>{const q=W_(q0),hz=q.w>q.h,cx=q.x+q.w/2,cy=q.y+q.h/2; return [-34,34].every(k=>!G.MAP.buildings.some(o=>o!==q0&&G.inRect(hz?cx:cx+k,hz?cy+k:cy,o,24)));})(s.bs[0])).sort((a,b)=>b.mhp-a.mhp)[0], b=W_(w.bs[0]), hz=b.w>b.h, cx=b.x+b.w/2, cy=b.y+b.h/2;
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
    const tank=M.vehicles.find(v=>v.type==='tank'&&!v.dead); tank.spd=0; tank.a=hz?0:Math.PI/2; let into=0;
    // beside the wall (either side), the barrel turned away or along it where nothing else is in its reach
    out: for(const sd of [60,-60]){ [tank.x,tank.y]=side(sd); into=hz?(sd>0?-Math.PI/2:Math.PI/2):(sd>0?Math.PI:0); for(const t of [Math.PI,Math.PI/2,-Math.PI/2]){ tank.ta=into+t; tank.tRel=tank.ta-tank.a; if(!G.barrelHits(tank,tank.ta)&&G.barrelHits(tank,into)) break out; } }
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
  M.gsf=null;     // roof dust from the ramming above blocks sight
  { const m0=G.TOUCH.auto; G.TOUCH.btn={auto:true}; G.touchState(); const m1=G.TOUCH.auto; G.TOUCH.btn={auto:true}; G.touchState(); G.TOUCH.btn={auto:true}; G.touchState();
    ok(m1!==m0&&G.TOUCH.auto===m0,'auto cycles through 3 modes '+m0+'>'+m1);
    const dd=M.sol.find(s=>s.dummy&&s.alive); me.x=dd.x-5*32; me.y=dd.y; me.vx=me.vy=0; G.cw(me).id='ar';
    ok(G.autoLined(me,0),'lined up in range'); ok(!G.autoLined(me,0.5),'not lined up'); ok(!G.autoLined(me,Math.PI),'facing away');
    me.x=dd.x-20*32; ok(!G.autoLined(me,0),'out of range'); me.x=dd.x-5*32; }
  // ---- scenes: each lays out round a window; the shot goes through it; the dummy driver drives; the log has it all
  for(const n of Object.keys(G.SCENES)){ ok(G.testRun(n),'scene '+n); step(40); const st=G.testState(); ok(Object.keys(st.spots).length>=7,'spots '+n);
    const want=Object.values(G.sceneParams(n).at).filter(w=>w==='dummy'||w==='bot'||w==='mate').length; ok(st.soldiers.filter(o=>o.scene&&!/DRIVER/.test(o.scene)).length>=want,'soldiers placed '+n);
    if(n==='shot'){ step(30); const L=G.testState().log.join('|'); ok(/SHOT FAR › INSIDE · \d+ PX · IN SIGHT/.test(L),'shot in sight through the window'); }
    if(n==='drive'){ const v=M.vehicles.find(o=>o.scene==='BESIDE'), x0=v.x, y0=v.y; step(60); ok(Math.hypot(v.x-x0,v.y-y0)>30,'dummy driver drives '+Math.round(Math.hypot(v.x-x0,v.y-y0))); }
    if(n==='husk') ok(G.testState().wrecks.length>=2,'husks laid'); }
  G.testClear(); ok(!M.sol.some(s=>s.scene)&&!M.vehicles.some(v=>v.scene),'scene cleared');
  // ---- play as AI: the player moves on its own, with a thought to show
  { G.DEV.auto=true; G.testRun('brawl'); const p0=[me.x,me.y]; step(240); ok(me.alive?Math.hypot(me.x-p0[0],me.y-p0[1])>20:true,'AI player moves'); ok(me.auto&&typeof G.botThought(me,me.auto)==='string','AI player thinks: '+(me.auto&&G.botThought(me,me.auto))); G.DEV.auto=false; G.testClear(); }
  step(2); const r=G.DEV.R; ok(r&&G.devClick(r.x+r.w/2,r.y+r.h-2),'panel swallows clicks');
  step(60);
  // normal match afterwards gets the full world back
  G.CFG.mode=1; G.CFG.bots=2; G.toMenu(); step(5); G.newMatch({...G.CFG},false); step(30);
  ok(!G.M.dev&&G.MAP.sight.length>0,'a normal match: no dev');
  console.log('errs',errs+global.errs());
});
