require('../harness.js');
const press=(i,b,n=1)=>{pads[i].buttons[b].pressed=true;step(n);pads[i].buttons[b].pressed=false;step(2);};
const stick=(i,x,y)=>{pads[i].axes=[x,y,0,0];step(2);pads[i].axes=[0,0,0,0];step(2);};
setImmediate(()=>{
  step(30); console.log('boot ->',G.state);
  pads[0]=mkPad(); pads[1]=mkPad(); step(2);
  press(0,15); console.log('menu sel after right',G.MENU.sel); press(0,0); step(20); console.log('network pressed ->',G.state); press(0,1); step(20); console.log('B back ->',G.state);
  press(0,12); console.log('up -> gear',G.MENU.sel); press(0,8); console.log('View opens settings',G.SET.open); press(0,5); console.log('RB tab',G.SET.tab); press(0,1); console.log('B closes',G.SET.open);
  press(0,14); press(0,13); console.log('down -> dev',G.MENU.sel); press(0,12); console.log('sel',G.MENU.sel); press(0,0); console.log('state',G.state,'players',G.PLAYERS.length);
  step(25); press(1,0); console.log('P2 joined',G.PLAYERS.length, G.PLAYERS.map(p=>p.color).join(','));
  const c0=G.PLAYERS[0].color; press(0,5); console.log('RB color',c0,'->',G.PLAYERS[0].color); press(1,3); console.log('P2 team (Y)',G.PLAYERS[1].team); const m0=G.CFG.mode; press(1,15); console.log('unready P2 D-pad changes mode',m0,'->',G.CFG.mode); press(1,14);
  // 5th player cap
  const extra=[]; G.lobbyJoin({type:'kb'}); G.lobbyJoin({type:'touch'}); G.lobbyJoin({type:'pad',index:3}); console.log('cap',G.PLAYERS.length);
  G.PLAYERS.splice(2); 
  press(0,0); press(1,0); console.log('ready',G.PLAYERS.map(p=>p.ready).join(','));
  press(0,9); console.log('start ->',G.state,'views',G.M.views.length);
  const me=G.PLAYERS[0].sol; step(10);
  const k0=me.kit; press(0,5); press(0,5); console.log('deploy RB kit',k0,'->',me.kit);
  const o0=me.spawnSel; stick(0,1,0); stick(0,0,1); console.log('spawn sel',o0,'->',me.spawnSel,'of',G.spawnOptions(me).length);
  console.log('DUI items',G.DUI.filter(d=>d.p===G.PLAYERS[0]).map(d=>d.act).join(','));
  press(0,4); press(0,4); press(0,13); console.log('slotSel',G.PLAYERS[0].slotSel); press(0,15); console.log('sec ->',me.sec); press(0,13); press(0,15); console.log('nt ->',me.nt);
  press(0,0); console.log('deployed',me.alive,'kit',G.KITS[me.kit].n,'weapons',me.w.map(w=>w.id).join('+'),'frag',me.nades,'smoke',me.smokes);
  me.protect=0; press(0,13); console.log('map open',!!G.PLAYERS[0].mapOpen); press(0,13); console.log('map closed',!G.PLAYERS[0].mapOpen);
  press(0,15); console.log('throwSel',me.throwSel); press(0,5); step(120); console.log('smoke on field',!!(G.M.gsf&&(G.M.gsf.act.length||G.M.gsf.em.length)),'smoke left',me.smokes);
  { const foe=G.M.sol.find(o=>o.team!==me.team&&o.alive); foe.x=me.x+60; foe.y=me.y; G.kill(me, foe, 'bullet', 1, 0, 'AR'); step(3);
    const vw=G.M.views.find(v=>v.p===G.PLAYERS[0]); console.log('dead, deathT',me.deathT.toFixed(2),'killer',me.killer&&me.killer.name);
    foe.alive=false; step(70); console.log('cam near killer last spot',Math.hypot(vw.cam.x-me.killer.x,vw.cam.y-me.killer.y).toFixed(0),'deathT',me.deathT.toFixed(2));
    step(600); console.log('still on deploy after 10s (no auto deploy)',!me.alive); press(0,0); console.log('deployed by A',me.alive); }
  press(0,9); console.log('pause',G.state); press(0,13); press(0,0); console.log('settings from pause',G.SET.open); press(0,1);
  for(let i=0;i<3;i++)press(0,13); press(0,0); console.log('quit ->',G.state,'players',G.PLAYERS.length);
  console.log('errs',errs());
});
