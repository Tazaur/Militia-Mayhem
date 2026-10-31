require('../harness.js');
// covers: 4_ai 3_sim
// a bot on a gun nest only shoots at what its gun can swing to
const hold=(b,f)=>{pads[0].buttons[b].pressed=true;step(f);pads[0].buttons[b].pressed=false;step(2);};
const press=b=>hold(b,1);
setImmediate(()=>{
  step(30); pads[0]=mkPad(); step(2); press(0); step(25); press(0);
  G.CFG.mode=0; G.CFG.map=0; G.CFG.bots=1;
  for(let i=0;i<G.MATCH_ROWS.length;i++)press(13); press(0);
  const me=G.PLAYERS[0].sol; step(30); press(0); step(120);
  const M=G.M; let errs=0;
  const nest=M.vehicles.find(v=>v.type==='nest'); const bot=M.sol.find(s=>s.bot&&s.team!==me.team);
  const others=M.sol.filter(s=>s!==me&&s!==bot); for(const o of others){o.alive=false;o.respawnT=999;}
  for(const v of M.vehicles) if(v!==nest&&v.T.drive){v.active=false;}
  bot.alive=true; bot.hp=100; if(bot.veh) G.exitVehicle(bot,true); bot.x=nest.x-20; bot.y=nest.y; G.enterVehicle(bot,{v:nest,seat:0,bump:null},true); bot.team=1-me.team;
  me.hp=1e9; me.protect=0;
  const shots=(lx,ly)=>{ const [x,y]=G.toWorld(nest,lx,ly); let n=0; for(let f=0;f<240;f++){ me.x=x; me.y=y; me.vx=me.vy=0; me.hp=1e9; const n0=M.proj.length; step(1); n+=M.proj.filter(p=>p.src===bot).length>0&&M.proj.length>n0?1:0; } return n; };
  const behind=shots(-160,0), front=shots(170,0);
  console.log('frames firing: behind',behind,'front',front, 'bot in nest', bot.veh===nest);
  if(behind>0||front===0) errs++;
  console.log('errs',errs);
});
