require('../harness.js');
// real rams still hurt (pushing doesn't), and tank doors: driver at the back, gunner either side, riders at the rear corners
const hold=(b,f)=>{pads[0].buttons[b].pressed=true;step(f);pads[0].buttons[b].pressed=false;step(2);};
const press=b=>hold(b,1);
setImmediate(()=>{
  step(30); pads[0]=mkPad(); step(2); press(0); step(25); press(0);
  G.CFG.mode=0; G.CFG.map=0; G.CFG.bots=0;
  for(let i=0;i<G.MATCH_ROWS.length;i++)press(13); press(0);
  const me=G.PLAYERS[0].sol; step(30); press(0); step(200);
  const M=G.M; let errs=0;
  const tank=M.vehicles.find(v=>v.type==='tank'&&!v.dead), seatAt=(lx,ly)=>{const [x,y]=G.toWorld(tank,lx,ly); me.x=x; me.y=y; const c=G.enterCandidate(me); return c&&c.v===tank?tank.T.seats[c.seat].n:'-';};
  const doors={back:seatAt(-80,0),left:seatAt(0,-52),right:seatAt(0,52),rearL:seatAt(-60,-46),rearR:seatAt(-60,46),front:seatAt(80,0)};
  console.log(JSON.stringify(doors));
  if(doors.back!=='DRIVER'||doors.left!=='GUNNER'||doors.right!=='GUNNER'||doors.rearL!=='LEFT RIDER'||doors.rearR!=='RIGHT RIDER') errs++;
  console.log('hp', G.VT.tank.hp, G.VT.jeep.hp);
  // ram: a jeep at speed into a parked jeep
  const clear=(x,y)=>!G.MAP.buildings.some(b=>G.inRect(x,y,b,70))&&!G.MAP.statics.some(o=>Math.hypot(o.x-x,o.y-y)<90)&&!G.inWater(x,y);
  let P=null; for(let k=0;k<20000&&!P;k++){const x=400+Math.random()*(G.WW-1200),y=300+Math.random()*(G.WH-600); let ok=true; for(let d=-80;d<=620;d+=20) if(!clear(x+d,y)){ok=false;break;} if(ok)P=[x,y];}
  const js=M.vehicles.filter(v=>v.type==='jeep'&&!v.dead); for(const v of M.vehicles) if(v.T.drive&&!js.slice(0,2).includes(v)){v.active=false;v.x=P[0]-300;v.y=P[1]+700;}
  const [a,b]=js; a.x=P[0];a.y=P[1];a.a=0;a.vx=a.vy=a.spd=0;a.hp=a.T.hp; b.x=P[0]+420;b.y=P[1];b.a=0;b.vx=b.vy=b.spd=0;b.hp=b.T.hp;
  me.x=a.x;me.y=a.y+40; G.enterVehicle(me,{v:a,seat:0,bump:null},true); step(5);
  pads[0].axes[0]=1; step(150); pads[0].axes[0]=0; step(10);
  const ram={self:Math.round(a.T.hp-a.hp),other:Math.round(b.T.hp-b.hp)}; console.log('ram',JSON.stringify(ram));
  if(!(ram.other>10)) errs++;
  console.log('errs',errs);
});
