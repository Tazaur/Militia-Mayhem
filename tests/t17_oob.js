require('../harness.js');
const hold=(b,f)=>{pads[0].buttons[b].pressed=true;step(f);pads[0].buttons[b].pressed=false;step(2);};
const press=b=>hold(b,1);
setImmediate(()=>{
  step(30); pads[0]=mkPad(); step(2); press(0); step(25); press(0);
  G.CFG.mode=0; G.CFG.map=0; G.CFG.bots=3;
  for(let i=0;i<G.MATCH_ROWS.length;i++)press(13); press(0);
  const me=G.PLAYERS[0].sol; step(30); press(0); step(200);
  let errs=0; if(!me.alive){console.log('not deployed');errs++;}
  const d0=me.d; me.x=-200; me.y=500; step(60*3);
  console.log('after 3s alive',me.alive,'oobT',(me.oobT||0).toFixed(2)); if(!me.alive)errs++;
  me.x=-200; step(60*3);
  console.log('after 6s alive',me.alive,'deaths',me.d-d0); if(me.alive)errs++;
  console.log('errs',errs);
});
