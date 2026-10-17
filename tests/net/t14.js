const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');

const OUT = __dirname + '/';
const mock = fs.readFileSync(__dirname + '/mockroom.js', 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const pages = [];
  const mk = async () => { const c = await b.newContext({ viewport: { width: 1280, height: 720 } }); await c.addInitScript(mock);
    await c.exposeBinding('__relaySend', (src, m) => { for (const p of pages) if (p !== src.page) p.evaluate(x => window.__mockRecv && window.__mockRecv(x), m).catch(() => { }); });
    const p = await c.newPage(); pages.push(p); return p; };
  const A = await mk(), B = await mk();
  const errs = { A: [], B: [] };
  A.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.A.push(m.text()); }); A.on('pageerror', e => errs.A.push('PAGE ' + e.message));
  B.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.B.push(m.text()); }); B.on('pageerror', e => errs.B.push('PAGE ' + e.message));
  await A.goto('http://localhost:8765/combined-arms.html'); await B.goto('http://localhost:8765/combined-arms.html');
  await sleep(1800);
  console.log('avail', await A.evaluate(() => NET.avail), await B.evaluate(() => NET.avail));
  await sleep(10); await A.evaluate(() => { CFG.bots = +(new URLSearchParams(location.search).get('bots') || 3); CFG.mode = 0; CFG.map = 0; openNetMenu({ type: 'kb' }); netHost({ type: 'kb' }); });
  await sleep(700);
  await B.evaluate(() => openNetMenu({ type: 'kb' })); await sleep(300);
  console.log('B sees hosts', await B.evaluate(() => JSON.stringify(NET.hosts)));
  await B.screenshot({ path: OUT + 'n_menu.png' });
  await B.evaluate(() => netJoin(netRows()[0], { type: 'kb' }));
  for (let k = 0; k < 30 && !(await B.evaluate(() => NET.joined)); k++) await sleep(100);
  console.log('A players', await A.evaluate(() => PLAYERS.map(p => p.dev.type + ':' + p.color + ':' + p.team).join(' ')), '| B joined', await B.evaluate(() => NET.joined + ' pid ' + NET.myPid + ' players ' + PLAYERS.length));
  // joiner picks colour + team, readies
  await B.evaluate(() => { const me = PLAYERS.find(p => p.mine); cycleColor(me, 1); withHostCfg(() => toggleTeam(me)); }); await sleep(500);
  await B.evaluate(() => toggleReady(PLAYERS.find(p => p.mine))); await sleep(500);
  console.log('A sees remote', await A.evaluate(() => { const p = PLAYERS.find(isNet); return p.color + ' team ' + p.team + ' ready ' + p.ready; }));
  await B.screenshot({ path: OUT + 'n_lobby_B.png' }); await A.screenshot({ path: OUT + 'n_lobby_A.png' });
  await A.evaluate(() => tryStart()); await sleep(1200);
  console.log('states', await A.evaluate(() => state), await B.evaluate(() => state), 'sol', await A.evaluate(() => M.sol.length), await B.evaluate(() => M.sol.length));
  console.log('names match', await A.evaluate(() => M.sol.map(s => s.name + s.team).join()) === await B.evaluate(() => M.sol.map(s => s.name + s.team).join()));
  await A.evaluate(() => { const s = PLAYERS[0].sol; spawnSoldier(s, spawnOptions(s)[0]); });
  await B.mouse.move(700, 360); await B.keyboard.press('Space'); await sleep(900);
  const ri = await A.evaluate(() => M.sol.indexOf(PLAYERS.find(isNet).sol));
  console.log('remote alive on A', await A.evaluate(i => M.sol[i].alive, ri), 'on B', await B.evaluate(() => NET.me.sol.alive));
  await A.evaluate(i => { M.sol[i].protect = 0; }, ri);
  const x0 = await A.evaluate(i => M.sol[i].x, ri);
  await B.keyboard.down('KeyD'); await sleep(900); await B.keyboard.up('KeyD'); await sleep(300);
  const x1 = await A.evaluate(i => M.sol[i].x, ri);
  console.log('moved on host by', Math.round(x1 - x0), 'B sees itself at', await B.evaluate(() => Math.round(NET.me.sol.x)), 'host has', Math.round(x1));
  const sh0 = await A.evaluate(i => M.sol[i].shotN || 0, ri);
  await B.mouse.move(900, 300); await B.mouse.down(); await sleep(600); await B.mouse.up(); await sleep(400);
  console.log('shots on host', (await A.evaluate(i => M.sol[i].shotN || 0, ri)) - sh0, 'B mag', await B.evaluate(() => cw(NET.me.sol).mag));
  await B.mouse.down(); await sleep(120);
  await B.screenshot({ path: OUT + 'n_play_B.png' }); await B.mouse.up();
  // blast next to the joiner: zero damage, but B should see and hear it
  await A.evaluate(i => { const s = M.sol[i]; explosion(s.x + 50, s.y, 88, 0, 0, null, -1, false); }, ri); await sleep(400);
  console.log('B saw boom', await B.evaluate(() => M.parts.filter(q => q.k === 'boom' || q.k === 'fire').length));
  // grenade thrown by the joiner
  await B.keyboard.press('KeyG'); await sleep(250);
  console.log('nade on A', await A.evaluate(() => M.proj.filter(p => p.k === 'nade').length), 'on B', await B.evaluate(() => M.proj.filter(p => p.k === 'nade').length));
  await sleep(2200);
  // kill the joiner on the host
  await A.evaluate(i => { const foe = M.sol.find(o => o.alive && o.team !== M.sol[i].team); kill(M.sol[i], foe, 'bullet', 1, 0, 'M4A1'); }, ri); await sleep(500);
  console.log('B death', await B.evaluate(() => { const s = NET.me.sol; return `alive ${s.alive} deathT ${s.deathT.toFixed(2)} killer ${s.killer && s.killer.name} corpses ${M.corpses.length} feed ${M.feed.map(f => (f.a ? f.a.n : '') + '>' + f.b.n).join(',')}`; }));
  await B.screenshot({ path: OUT + 'n_death_B.png' });
  await sleep(2600);
  console.log('B deploy screen', await B.evaluate(() => !NET.me.sol.alive && !(NET.me.sol.deathT > 0)), 'respawnT', await B.evaluate(() => NET.me.sol.respawnT.toFixed(1)));
  await B.screenshot({ path: OUT + 'n_deploy_B.png' });
  // pick another class on the deploy screen, then deploy
  await B.keyboard.press('KeyE'); await sleep(200); await sleep(3000); await B.keyboard.press('Space'); await sleep(900);
  console.log('respawned with kit', await A.evaluate(i => M.sol[i].alive + ' ' + KITS[M.sol[i].kit].n, ri), '| B kit', await B.evaluate(() => KITS[NET.me.sol.kit].n));
  // let the bots fight a while
  await sleep(6000);
  const st = await A.evaluate(() => ({ maxSnap: NET.maxSnap, ev: NET.evId, mock: window.__mock }));
  console.log('host maxSnap', st.maxSnap, 'events', st.ev, 'mock', JSON.stringify(st.mock));
  console.log('B mock', JSON.stringify(await B.evaluate(() => window.__mock)), 'B buf', await B.evaluate(() => NET.buf.length), 'off', await B.evaluate(() => Math.round(NET.off)));
  console.log('kills agree', await A.evaluate(() => M.sol.map(s => s.k).join()), '|', await B.evaluate(() => M.sol.map(s => s.k).join()));
  await B.screenshot({ path: OUT + 'n_play2_B.png' });
  // joiner leaves mid-match: soldier becomes a bot
  await B.evaluate(() => netLeave()); await sleep(600);
  console.log('after leave: A players', await A.evaluate(() => PLAYERS.length), 'soldier bot', await A.evaluate(i => !!M.sol[i].bot && !M.sol[i].player, ri), 'B state', await B.evaluate(() => state));
  // join again in the lobby, then the host quits
  await A.evaluate(() => toLobby()); await sleep(500);
  await B.evaluate(() => netJoin(netRows()[0], { type: 'kb' })); await sleep(900);
  console.log('rejoined', await B.evaluate(() => NET.joined), 'A players', await A.evaluate(() => PLAYERS.length));
  await A.evaluate(() => toMenu()); await sleep(900);
  console.log('host quit -> B', await B.evaluate(() => state + ' / ' + NET.msg));
  console.log('errors A', errs.A.length, errs.A.slice(0, 5)); console.log('errors B', errs.B.length, errs.B.slice(0, 5));
  await b.close();
})();
