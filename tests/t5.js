require('../harness.js');
// covers: 2_maps 2b_ground 2c_props 2d_house 3_sim 4_ai
setImmediate(()=>{
  step(5); console.log('state',G.state,'errs',errs());
  for (const map of [0,1,2,3,4]) {
    G.CFG.map=map; G.newMatch({mode:0,map,bots:7,limit:1,skill:1,camera:'shared',weather:map===2?'rain':map===3?'snow':'clear'},true);
    const t0=Date.now(); step(60*120); const ms=(Date.now()-t0)/(60*120);
    const M=G.M;
    console.log(G.MAP.id,'arcs',G.MAP.arcs.length,'bldg',G.MAP.buildings.length,'water',G.MAP.water.length,'nests',M.vehicles.filter(v=>v.type==='nest').length,
      '| flags',M.flags.map(f=>f.name+':'+f.owner).join(' '),'kills',M.sol.reduce((a,s)=>a+s.k,0),'inVeh',M.sol.filter(s=>s.veh).length,
      'kits',[0,1,2,3].map(k=>M.sol.filter(s=>s.kit===k).length).join('/'),'stances',[0,1].map(k=>M.sol.filter(s=>s.alive&&s.stance===k).length).join('/'),
      'items',M.items.map(i=>i.k).join(','),'bagsLost',G.MAP.arcs.reduce((a,A)=>a+A.lost,0),'heal',Math.round(M.sol.reduce((a,s)=>a+s.heal,0)),'rep',Math.round(M.sol.reduce((a,s)=>a+s.rep,0)),'ms',ms.toFixed(2),'errs',errs());
  }
});
