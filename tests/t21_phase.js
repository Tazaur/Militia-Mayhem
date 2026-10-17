require('../harness.js');
// walking into a parked vehicle (from every side, standing / prone, and pinned against a wall) never gets you inside its hull
const hold=(b,f)=>{pads[0].buttons[b].pressed=true;step(f);pads[0].buttons[b].pressed=false;step(2);};
const press=b=>hold(b,1);
setImmediate(()=>{
  step(30); pads[0]=mkPad(); step(2); press(0); step(25); press(0);
  G.CFG.mode=0; G.CFG.map=0; G.CFG.bots=0;
  for(let i=0;i<G.MATCH_ROWS.length;i++)press(13); press(0);
  const me=G.PLAYERS[0].sol; step(30); press(0); step(200);
  const M=G.M; let errs=0; if(!me){console.log('no soldier',G.state,G.PLAYERS.length);console.log('errs',1);return;}
  const clear=(x,y,r)=>!G.MAP.buildings.some(b=>G.inRect(x,y,b,r))&&!G.MAP.statics.some(o=>Math.hypot(o.x-x,o.y-y)<r)&&!G.inWater(x,y);
  let P=null; for(let k=0;k<20000&&!P;k++){const x=400+Math.random()*(G.WW-800),y=300+Math.random()*(G.WH-600); if(clear(x,y,160))P=[x,y];}
  // a spot right next to a building wall (for the pinned case)
  const B=G.MAP.buildings.find(b=>b.w>80&&b.h>80&&clear(b.x+b.w/2,b.y-80,60)&&clear(b.x+b.w/2,b.y-150,60));
  const depth=v=>{const [lx,ly]=G.toLocal(v,me.x,me.y);return Math.min(v.T.hl-Math.abs(lx),v.T.hw-Math.abs(ly));};   // >0: centre inside the hull box
  const res={}; if(process.env.DBG) console.log('inSol',M.sol.includes(me),'same',G.PLAYERS[0].sol===me, 'vt', M.vehicles.map(v=>v.type+':'+v.active).join(','));
  for(const type of ['tank','jeep','nest']){
    const v=M.vehicles.find(v=>v.type===type&&!v.dead); if(!v){console.log('no',type);errs++;continue;}
    for(const o of M.vehicles) if(o!==v&&o.T.drive){o.x=P[0]-900;o.y=P[1]+900;}
    let worst=-99,worstK='';
    const run=(sx,sy,ax,ay,stance,frames)=>{
      me.x=sx;me.y=sy;me.vx=me.vy=0;me.stance=stance;me.stanceT=0;
      pads[0].axes[0]=ax;pads[0].axes[1]=ay;
      for(let f=0;f<frames;f++){ // wiggle like a persistent player: aim straight in, then slide along it
        const w=Math.sin(f/9)*0.7; pads[0].axes[0]=ax-ay*w; pads[0].axes[1]=ay+ax*w; step(1);
        if(me.veh){G.exitVehicle(me);v.seats.fill(null);}
        const d=depth(v); if(process.env.DBG===type&&f%6==0&&d>-12){const [lx,ly]=G.toLocal(v,me.x,me.y);console.log(f,stance,Math.round(Math.atan2(ay,ax)*57),'l',lx.toFixed(1),ly.toFixed(1),'d',d.toFixed(1),'veh',v.x.toFixed(1),v.y.toFixed(1),v.active,me.alive);}
        if(d>worst){worst=d;worstK=`${stance}@${Math.round(Math.atan2(ay,ax)*57)}`;} }
      pads[0].axes[0]=pads[0].axes[1]=0; me.stance=0;
    };
    // open ground, 16 directions, standing and prone
    v.active=true; v.x=P[0]; v.y=P[1]; v.a=0.3; v.vx=v.vy=v.spd=v.av=0;
    for(const stance of [0,2]) for(let k=0;k<16;k++){const a=k/16*Math.PI*2; run(v.x-Math.cos(a)*(v.T.hl+40),v.y-Math.sin(a)*(v.T.hl+40),Math.cos(a),Math.sin(a),stance,150);}
    res[type]={open:+worst.toFixed(1),at:worstK};
    // vehicle parked against a wall, soldier squeezing into the gap
    if(B&&v.T.drive){ worst=-99; v.a=0; v.x=B.x+B.w/2; v.y=B.y-v.T.hw-6; for(const sx of [-1,1]) for(const stance of [0,2]) run(v.x+sx*(v.T.hl+30),v.y+v.T.hw-2,-sx,0.15,stance,240); res[type].wall=+worst.toFixed(1); res[type].wat=worstK; }
  }
  console.log(JSON.stringify(res));
  for(const k in res){ if(res[k].open>0){console.log('inside',k,'open ground');errs++;} if(res[k].wall>0){console.log('inside',k,'against a wall');errs++;} }
  console.log('errs',errs);
});
