require('../harness.js');
// vehicles shove vehicles and wrecks, sharing the push by mass
const hold=(b,f)=>{pads[0].buttons[b].pressed=true;step(f);pads[0].buttons[b].pressed=false;step(2);};
const press=b=>hold(b,1);
setImmediate(()=>{
  step(30); pads[0]=mkPad(); step(2); press(0); step(25); press(0);
  G.CFG.mode=0; G.CFG.map=0; G.CFG.bots=0;
  for(let i=0;i<8;i++)press(13); press(0);
  const me=G.PLAYERS[0].sol; step(30); press(0); step(200);
  const M=G.M; let errs=0;
  // an open strip of ground
  const clear=(x,y)=>!G.MAP.buildings.some(b=>G.inRect(x,y,b,70))&&!G.MAP.statics.some(o=>Math.hypot(o.x-x,o.y-y)<90)&&!G.inWater(x,y);
  let P=null; for(let k=0;k<20000&&!P;k++){const x=400+Math.random()*(G.WW-1200),y=300+Math.random()*(G.WH-600); let ok=true; for(let d=-80;d<=520;d+=20) if(!clear(x+d,y)){ok=false;break;} if(ok)P=[x,y];}
  if(!P){console.log('no open strip');console.log('errs',1);return;}
  const mkV=type=>{const v=M.vehicles.find(v=>v.type===type&&!v.dead&&!v.seats.some(Boolean)&&!v.__used);if(v)v.active=true;return v;};
  const res={};
  for(const [a,b] of [['jeep','jeep'],['jeep','tank'],['tank','jeep'],['tank','tank'],['jeep','wreck-tank'],['tank','wreck-tank'],['jeep','wreck-jeep']]){
    M.wrecks.length=0;
    if(me.veh){ const ov=me.veh; G.exitVehicle(me); ov.seats.fill(null); }
    for(const v of M.vehicles) if(v.T.drive) { v.x=P[0]-300; v.y=P[1]+600; v.active=false; }
    const va=mkV(a); if(!va){console.log('no',a,M.vehicles.map(v=>v.type+(v.active?'':'-off')+(v.dead?'-dead':'')+(v.seats.some(Boolean)?'-occ':'')).join(' '));errs++;continue;}
    va.__used=1; va.x=P[0]; va.y=P[1]; va.a=0; va.vx=va.vy=va.spd=0; va.hp=va.T.hp;
    let tgt;
    const bt=b.replace('wreck-','');
    if(b.startsWith('wreck')){ const T=G.VT[bt]; tgt={type:bt,x:P[0]+va.T.hl+T.hl+6,y:P[1],a:0,ta:0,t:999,T:999,burn:0,hl:T.hl*0.92,hw:T.hw*0.9,vx:0,vy:0}; M.wrecks.push(tgt); }
    else { tgt=M.vehicles.find(v=>v.type===bt&&!v.dead&&v!==va&&!v.seats.some(Boolean)); tgt.active=true; tgt.x=P[0]+va.T.hl+tgt.T.hl+6; tgt.y=P[1]; tgt.a=0; tgt.vx=tgt.vy=tgt.spd=0; tgt.hp=tgt.T.hp; }
    me.x=va.x; me.y=va.y+40; G.enterVehicle(me,{v:va,seat:0,bump:null},true); step(5);
    const x0=tgt.x, y0=tgt.y, a0=tgt.a; pads[0].axes[0]=1; if(process.env.DBG&&a+'>'+b===process.env.DBG){for(let f=0;f<40;f++){step(1);if(f%4==0)console.log(f,'v',va.x.toFixed(1),va.y.toFixed(1),va.spd.toFixed(0),'t',tgt.x.toFixed(1),tgt.y.toFixed(1),M.wrecks.length,M.vehicles.filter(v=>v.active).map(v=>v.type[0]+v.x.toFixed(0)).join(','));}} step(60*3); pads[0].axes[0]=0; step(5);
    res[a+'>'+b]={moved:Math.round(Math.hypot(tgt.x-x0,tgt.y-y0)),pxPerS:Math.round(Math.hypot(tgt.x-x0,tgt.y-y0)/3),contact:Math.round(Math.hypot(tgt.x-va.x,tgt.y-va.y)-va.T.hl-(tgt.T&&tgt.T.hl?tgt.T.hl:tgt.hl)),turned:+(tgt.a-a0).toFixed(2),pusherSpd:Math.round(va.spd),dmgSelf:Math.round(va.T.hp-va.hp),dmgTgt:tgt.T&&tgt.hp!==undefined?Math.round(tgt.T.hp-tgt.hp):0};
    va.__used=0;
  }
  console.log(JSON.stringify(res));
  const r=k=>res[k]?res[k].pxPerS:0;
  for(const k in res) if(res[k].dmgSelf>0) { console.log('push hurt the pusher',k); errs++; }
  if(!(r('jeep>tank')>3&&r('jeep>tank')<r('jeep>jeep')&&r('tank>jeep')>r('tank>tank')&&r('jeep>wreck-tank')<r('jeep>tank')&&r('tank>wreck-tank')>2)) errs++;
  console.log('errs',errs);
});
