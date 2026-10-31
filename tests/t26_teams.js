require('../harness.js');
// covers: 3_sim 6_menus
// TEAM SIZE: bots fill each team up to it around the players, so both teams field the same number; 0 = players only
const press=b=>{pads[0].buttons[b].pressed=true;step(1);pads[0].buttons[b].pressed=false;step(2);};
setImmediate(()=>{
  let errs=0; const ok=(c,m)=>{if(!c){errs++;console.log('FAIL',m);}};
  step(30); pads[0]=mkPad(); step(2); press(0); step(25); press(0);
  const count=()=>[0,1].map(t=>G.M.sol.filter(s=>s.team===t).length);
  G.CFG.mode=0; G.CFG.map=0; G.CFG.bots=6; G.PLAYERS.forEach(p=>p.ready=true); G.startBattle(); step(5);
  let c=count(); ok(c[0]===6&&c[1]===6,'6 a side with a player '+c);
  G.toMenu(); step(5); G.CFG.bots=0; G.newMatch({...G.CFG},false); step(5);
  c=count(); ok(c[0]+c[1]===G.PLAYERS.length,'no bots '+c);
  console.log('errs',errs);
});
