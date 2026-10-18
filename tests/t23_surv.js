require('../harness.js');
// team modes: teammates share one colour; free-for-all / co-op: everyone their own.
// co-op survival: 2x health, players go down and get revived, waves escalate, a wipe ends it, the dead return when a wave is cleared.
const press=(i,b)=>{pads[i].buttons[b].pressed=true;step(1);pads[i].buttons[b].pressed=false;step(2);};
setImmediate(()=>{
  let errs=0; const ok=(c,m)=>{if(!c){errs++;console.log('FAIL',m);}};
  step(30); pads[0]=mkPad(); pads[1]=mkPad(); step(2); press(0,0); step(25); press(0,0); press(1,0); step(5);
  const P=G.PLAYERS; ok(P.length===2,'two players joined');
  // ---- team colours
  G.CFG.mode=0; G.CFG.teamColors='player'; P[0].team=0; P[1].team=1; step(2);
  ok(P[0].color!==P[1].color,'opposing teams differ '+P[0].color+' '+P[1].color);
  P[1].team=0; step(2); ok(P[0].color===P[1].color,'teammates share a colour '+P[0].color+' '+P[1].color);
  const c0=P[0].color; G.cycleColor(P[1],1); step(2); ok(P[0].color===P[1].color&&P[0].color!==c0,'a teammate changes the team colour '+P[0].color);
  P[1].team=1; step(2); ok(P[0].color!==P[1].color,'split again '+P[0].color+' '+P[1].color);
  const t1=P[1].color; G.cycleColor(P[1],1); step(2); ok(P[1].color!==P[0].color,'never the other team colour');
  G.CFG.teamColors='classic'; step(2); ok(P[0].color==='blue'&&P[1].color==='red','classic blue/red'); G.CFG.teamColors='player';
  G.CFG.mode=3; step(2); ok(P[0].color!==P[1].color,'ffa: own colours '+P[0].color+' '+P[1].color);
  G.CFG.mode=4; step(2); ok(P[0].color!==P[1].color,'co-op: own colours');
  ok(!G.MATCH_ROWS.includes('bots'),'co-op hides the bots row');
  // ---- co-op survival
  G.CFG.map=0; G.CFG.limit=0; P.forEach(p=>p.ready=true); G.startBattle(); step(5);
  const M=G.M, a=P[0].sol, b=P[1].sol;
  ok(M.coop&&a.team===0&&b.team===0,'players on one side');
  ok(M.sol.filter(s=>s.team===1).length===24,'raider pool');
  for(let i=0;i<60*20&&!(a.alive&&b.alive);i++)step(1);           // the deploy screens auto-deploy
  ok(a.alive&&b.alive&&a.mhp===200&&a.hp===200,'double health '+a.hp);
  for(let i=0;i<60*12&&M.wv.n<1;i++)step(1);
  ok(M.wv.n===1,'wave 1 starts'); step(240);
  const foes=M.sol.filter(s=>s.team===1&&s.alive); ok(foes.length>0,'raiders spawned '+foes.length);
  ok(foes.every(s=>s.w[0].id==='pistol'&&s.w[1].id==='pistol'),'wave 1: pistols only '+foes.map(s=>s.w[0].id).join());
  // keep the raiders away so the test controls the fight
  const park=()=>{for(const s of M.sol)if(s.team===1&&s.alive){s.x=60;s.y=60;s.bot.goal={x:60,y:60};}};
  park(); a.protect=b.protect=0;
  G.hurtSoldier(a,500,foes[0],'bullet',1,0,'PISTOL');
  ok(a.alive&&a.down,'goes down, not dead'); ok(!M.over,'one up: no wipe');
  b.x=a.x+14; b.y=a.y; b.veh=null; for(let i=0;i<60*3.5&&a.down;i++){b.x=a.x+14;b.y=a.y;park();step(1);}
  ok(!a.down&&a.hp===100,'revived at half health '+a.hp);
  // bleed out → dead, back when the wave is cleared
  a.protect=0; G.hurtSoldier(a,500,null,'bullet',1,0); b.x=a.x+400;
  for(let i=0;i<60*31&&a.alive;i++){park();b.hp=200;b.protect=1;step(1);}
  ok(!a.alive,'bled out'); ok(!M.over,'still one up');
  for(let i=0;i<60*8;i++){park();step(1);}
  ok(!a.alive,'no respawn mid-wave');
  M.wv.queue=0; for(const s of M.sol)if(s.team===1&&s.alive)G.kill(s,b,'bullet',1,0); step(3);
  ok(M.wv.brk>0,'wave cleared');
  for(let i=0;i<60*15&&!a.alive;i++)step(1); ok(a.alive,'back in after the wave');
  // escalation
  M.wv.n=6; M.wv.brk=0.01; step(2); ok(M.wv.n===7,'wave 7'); for(let i=0;i<60*15;i++){park();step(1);}
  const late=M.sol.filter(s=>s.team===1&&s.alive); ok(late.length>0&&late.every(s=>G.WAVE_GUNS[6].includes(s.w[0].id)),'wave 7 guns '+late.map(s=>s.w[0].id+'/'+s.w[1].id).join());
  ok(M.skill.react<0.38,'bots sharpen '+M.skill.react.toFixed(2));
  // wipe
  a.protect=b.protect=0; G.hurtSoldier(a,999,null,'bullet',1,0); G.hurtSoldier(b,999,null,'bullet',1,0);
  ok(M.over&&M.winner===1,'wipe ends the match');
  console.log('errs',errs+global.errs());
});
