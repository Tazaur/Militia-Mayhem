require('../harness.js');
// blowing up a crewed vehicle (any type) scores it, never says "EMPTY"; an empty one says EMPTY. Duplicate names get nicknames.
const press=b=>{pads[0].buttons[b].pressed=true;step(1);pads[0].buttons[b].pressed=false;step(2);};
setImmediate(()=>{
  step(30); pads[0]=mkPad(); step(2); press(0); step(25); press(0);
  G.CFG.mode=0; G.CFG.map=0; G.CFG.bots=2;
  for(let i=0;i<G.MATCH_ROWS.length;i++)press(13); press(0);
  const me=G.PLAYERS[0].sol; step(30); press(0); step(120);
  const M=G.M; let errs=0;
  const foe=M.sol.find(s=>s!==me&&G.isEnemy(s.team,me.team));
  for(const type of ['jeep','tank','nest']){
    for(const crewed of [true,false]){
      const v=M.vehicles.find(v=>v.type===type&&!v.dead); if(!v){console.log('no',type);errs++;break;}
      v.seats.fill(null); if(crewed){foe.alive=true;foe.hp=100;foe.veh=null;foe.x=v.x;foe.y=v.y;G.enterVehicle(foe,{v,seat:0},true);}
      me.msg=null; const p0=me.pts; G.destroyVehicle(v,me);
      const m=me.msg&&me.msg.txt||''; const empty=/EMPTY/.test(m);
      console.log(type,crewed?'crewed':'empty','msg',JSON.stringify(m),'pts +'+(me.pts-p0),'crew alive',foe.alive);
      if(empty===crewed){errs++;}
      step(5);
    }
  }
  const P=G.PLAYERS, mk=n=>({name:n}); const fake=[P[0],mk(''),mk(''),mk('')]; P[0].base=undefined; P[0].name='Tazaur';
  G.PLAYERS.push(...fake.slice(1)); const out=fake.slice(1).map(p=>G.dupName(p,'tazaur'));
  console.log('names',P[0].name,'|',out.join(' | ')); if(out[0]!=='Also tazaur'||out[1]!=='tazaur III')errs++;
  console.log('errs',errs);
});
