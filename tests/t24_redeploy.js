require('../harness.js');
// covers: 6_menus 3_sim
// pause-menu REDEPLOY kills you on the spot and goes straight to the deploy screen (never in co-op);
// bodies lie 2 min then fade over 1; spent casings fade over 15 s.
const press=b=>{pads[0].buttons[b].pressed=true;step(1);pads[0].buttons[b].pressed=false;step(2);};
setImmediate(()=>{
  let errs=0; const ok=(c,m)=>{if(!c){errs++;console.log('FAIL',m);}};
  step(30); pads[0]=mkPad(); step(2); press(0); step(25); press(0);
  G.CFG.mode=0; G.CFG.map=0; G.CFG.bots=2; G.PLAYERS.forEach(p=>p.ready=true); G.startBattle(); step(5);
  const M=G.M, P=G.PLAYERS[0]; step(30); press(0); for(let i=0;i<60*20&&!(P.sol&&P.sol.alive);i++)step(1);
  const me=P.sol; ok(me.alive,'deployed');
  G.openPause(P); ok(G.state==='pause','paused');
  const items=G.pauseItems(), ri=items.indexOf('REDEPLOY'); ok(ri===2,'REDEPLOY in the menu '+items.join());
  const d0=me.d, n0=M.corpses.length; G.pauseAct(ri);
  ok(!me.alive&&me.d===d0+1,'redeploy kills'); ok(G.state==='play','back in play'); ok(me.deathT===0&&me.respawnT===0,'straight to deploy');
  ok(M.corpses.length===n0+1,'leaves a body');
  step(30); press(0); for(let i=0;i<60*6&&!me.alive;i++)step(1); ok(me.alive,'redeployed');
  // bodies
  const c=M.corpses[M.corpses.length-1]; c.t=119; step(2); ok(M.corpses.includes(c)&&c.baked,'body still there at 2 min, pool baked');
  c.t=150; step(1); ok(M.corpses.includes(c),'fading body still there');
  c.t=180.5; step(1); ok(!M.corpses.includes(c),'body gone after 3 min');
  // casings
M.brass.push({x:100,y:100,t:14.9}); M.brass.unshift({x:100,y:100,t:14.95}); step(10); ok(!M.brass.some(b=>b.x===100&&b.y===100),'casings gone after 15 s');
  // co-op: no redeploy
  G.CFG.mode=4; G.startBattle(); step(5); for(let i=0;i<60*20&&!(P.sol&&P.sol.alive);i++)step(1);
  G.openPause(P); ok(!G.pauseItems().includes('REDEPLOY'),'no redeploy in co-op'); G.redeploy(P.sol); ok(P.sol.alive,'co-op redeploy refused');
  console.log('errs',errs+global.errs());
});
