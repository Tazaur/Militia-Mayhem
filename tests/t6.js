require('../harness.js');
let T=0;
const hold=(b,frames)=>{pads[0].buttons[b].pressed=true;step(frames);pads[0].buttons[b].pressed=false;step(2);};
const press=(b)=>hold(b,1);
setImmediate(()=>{
  step(30); pads[0]=mkPad(); step(2); press(0); step(25); press(0);
  G.CFG.mode=0; G.CFG.map=0; G.CFG.bots=3;
  for(let i=0;i<8;i++)press(13); console.log('sel',G.LOBBY.sel); press(0);
  console.log('state',G.state);
  const me=G.PLAYERS[0].sol; step(30);
  console.log('first deploy waiting:',!me.alive,'deployIdle',me.deployIdle.toFixed(2));
  press(5); press(5); console.log('kit',G.KITS[me.kit].n); press(2); console.log('var',me.var);
  const opts=G.spawnOptions(me); console.log('spawn opts',opts.map(o=>o.name).join(', '));
  press(0); console.log('alive',me.alive,'weapon',me.w.map(w=>w.id).join('+'),'nades',me.nades,'mines',me.mines);
  // stance: tap B = crouch, hold B = prone, tap again = crouch
  press(1); console.log('after tap B stance',me.stance);
  hold(1,25); console.log('after hold B stance',me.stance);
  press(1); console.log('tap from prone ->',me.stance);
  press(1); console.log('tap again ->',me.stance);
  // gadget: support ammo box drop (kit index 2)
  press(4); console.log('items',G.M.items.map(i=>i.k).join(','),'gcd',me.gcd.toFixed(1));
  // RB swap to pistol, then back
  press(5); console.log('swap ->',me.w[me.wi].id); press(5);
  // vehicle: go to tank front, A enters, Y cycles seat
  const tank=G.M.vehicles.find(v=>v.type==='tank'&&v.sp.team===me.team&&v.active);
  for(const s of tank.seats) if(s) G.exitVehicle(s,true);
  me.x=tank.x+Math.cos(tank.a)*68; me.y=tank.y+Math.sin(tank.a)*68; step(1);
  press(3); console.log('Y entered seat',me.veh&&me.veh.T.seats[me.seat].n,'facing matches hull',Math.abs(me.a-tank.a)<0.01);
  pads[0].axes=[0,1,0,0]; step(60); pads[0].axes=[0,0,0,0]; step(5); console.log('driver faces hull after turning',Math.abs(((me.a-tank.a)+Math.PI*3)%(Math.PI*2)-Math.PI)<0.01);
  press(1); step(35); console.log('B -> seat',tank.T.seats[me.seat].n);
  press(1); step(35); console.log('B -> seat',tank.T.seats[me.seat].n);
  press(3); console.log('Y exit ->',!me.veh);
  // sandbag rule: standing shooter at a bag with a crouched target behind
  console.log('errs',errs());
});
