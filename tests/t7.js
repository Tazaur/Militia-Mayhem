require('../harness.js');
setImmediate(()=>{
  step(5);
  G.newMatch({mode:1,map:0,bots:0,limit:2,skill:1,camera:'split',weather:'clear'},true);
  const M=G.M; M.demo=false; M.ffa=false;
  const A=G.MAP.arcs[0]; const face=A.a+Math.PI;
  const mkS=(team,x,y)=>{const s=M.sol.find(o=>o.team===team&&!o.used); return s;};
  // use two existing bots
  const shooterT=M.sol.find(s=>s.team===0), target=M.sol.find(s=>s.team===1); M.sol=[shooterT,target]; shooterT.bot.thinkT=1e9; target.bot.thinkT=1e9;
  for(const st of [0,1,2]) {
    let hits=0;
    for(let trial=0;trial<40;trial++){
      // target sits in the arc's sheltered spot; shooter stands 250px out in the direction the arc faces
      Object.assign(target,{w:[{id:'ar',mag:30,res:90},{id:'pistol',mag:12,res:40}],wi:0,alive:true,hp:100,x:A.x,y:A.y,stance:st,protect:0,veh:null,lastHurt:-9});
      Object.assign(shooterT,{w:[{id:'ar',mag:0,res:0},{id:'pistol',mag:0,res:0}],wi:0,alive:true,hp:100,x:A.x+Math.cos(face)*250,y:A.y+Math.sin(face)*250,stance:0,veh:null});
      M.proj.length=0;
      const a=Math.atan2(target.y-shooterT.y,target.x-shooterT.x);
      M.proj.push({k:'bullet',x:shooterT.x+Math.cos(a)*22,y:shooterT.y+Math.sin(a)*22,ox:shooterT.x,oy:shooterT.y,vx:Math.cos(a)*1050,vy:Math.sin(a)*1050,life:0.5,src:shooterT,team:0,dmg:10,vdmg:1,low:false});
      const hp0=target.hp; for(let i=0;i<20;i++){ /* advance only projectiles */ }
      // run a few sim frames without AI moving them
      for(let i=0;i<20;i++){ target.x=A.x;target.y=A.y; step(1); if(!M.proj.length)break; }
      if(target.hp<hp0) hits++;
    }
    console.log(['standing','crouched','prone'][st],'behind sandbags: hit',hits,'/ 40');
  }
  console.log('errs',errs());
});
