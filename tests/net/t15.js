const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'); const mock = fs.readFileSync(__dirname + '/mockroom.js', 'utf8'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = __dirname + '/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const pages = [], errs = [];
  const mk = async (n) => { const c = await b.newContext({ viewport: { width: 1280, height: 720 } }); await c.addInitScript(mock);
    await c.exposeBinding('__relaySend', (src, m) => { for (const p of pages) if (p !== src.page) p.evaluate(x => window.__mockRecv && window.__mockRecv(x), m).catch(() => { }); });
    const p = await c.newPage(); p.on('pageerror', e => errs.push(n + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(n + ' ' + m.text()); }); pages.push(p); return p; };
  const A = await mk('A'), B = await mk('B');
  await A.goto('http://localhost:8765/combined-arms.html'); await B.goto('http://localhost:8765/combined-arms.html'); await sleep(1800);
  await A.evaluate(() => { CFG.bots = 10; CFG.mode = 0; CFG.map = 2; CFG.weather = 'rain'; openNetMenu({ type: 'kb' }); netHost({ type: 'kb' }); }); await sleep(800);
  await B.evaluate(() => { openNetMenu({ type: 'kb' }); }); for (let k = 0; k < 20 && !(await B.evaluate(() => netRows().length)); k++) await sleep(100);
  await B.evaluate(() => netJoin(netRows()[0], { type: 'kb' })); for (let k = 0; k < 30 && !(await B.evaluate(() => NET.joined)); k++) await sleep(100);
  await B.evaluate(() => toggleReady(PLAYERS.find(p => p.mine))); await sleep(500);
  await A.evaluate(() => tryStart()); await sleep(1000);
  console.log('soldiers', await B.evaluate(() => M.sol.length), 'state', await B.evaluate(() => state));
  await A.evaluate(() => { const s = PLAYERS[0].sol; spawnSoldier(s, spawnOptions(s)[0]); });
  await B.mouse.move(700, 360); await B.keyboard.press('Space'); await sleep(900);
  const ri = await A.evaluate(() => M.sol.indexOf(PLAYERS.find(isNet).sol));
  // put the joiner by a tank on the host and climb in
  const ti = await A.evaluate(i => { const s = M.sol[i]; const t = M.vehicles.findIndex(v => v.type === 'tank' && v.active && !v.seats.some(Boolean) && vehTeam(v) < 0); const v = M.vehicles[t]; const [x, y] = toWorld(v, v.T.seats[0].anchor[0] * 0.8, v.T.seats[0].anchor[1] * 0.8); s.x = x; s.y = y; s.protect = 0; return t; }, ri);
  await sleep(500); await B.keyboard.press('KeyE'); await sleep(800);
  console.log('in tank on A', await A.evaluate(i => M.sol[i].veh ? M.sol[i].veh.type + ' seat ' + M.sol[i].seat : 'no', ri), '| on B', await B.evaluate(() => NET.me.sol.veh ? NET.me.sol.veh.type + ' seat ' + NET.me.sol.seat : 'no'));
  const v0 = await A.evaluate(t => [M.vehicles[t].x, M.vehicles[t].y], ti);
  await B.keyboard.down('KeyW'); await sleep(1500); await B.keyboard.up('KeyW');
  const v1 = await A.evaluate(t => [M.vehicles[t].x, M.vehicles[t].y], ti);
  console.log('tank moved', Math.round(Math.hypot(v1[0] - v0[0], v1[1] - v0[1])), 'B tank at', await B.evaluate(t => Math.round(M.vehicles[t].x) + ',' + Math.round(M.vehicles[t].y), ti), 'A', v1.map(Math.round).join(','));
  await sleep(1200); await B.mouse.move(1000, 360); await sleep(900); await B.mouse.down(); await sleep(80); await B.mouse.up(); await sleep(250);
  console.log('cannon shots on A', await A.evaluate(t => M.vehicles[t].cN || 0, ti), 'B recoil', await B.evaluate(t => M.vehicles[t].recoil.toFixed(2), ti), 'B shells', await B.evaluate(() => M.proj.filter(p => p.k === 'shell').length));
  await sleep(150); await B.screenshot({ path: OUT + 'n_tank_B.png' });
  // gunner seat on the joiner side via seat key
  await B.keyboard.press('Digit2'); await sleep(900);
  console.log('seat after 2:', await A.evaluate(i => M.sol[i].seat, ri), await B.evaluate(() => NET.me.sol.seat));
  await B.mouse.down(); await sleep(700); await B.mouse.up(); await sleep(300);
  console.log('mg shots', await A.evaluate(t => M.vehicles[t].mN || 0, ti), 'B bullets', await B.evaluate(() => NET.bul.length));
  await B.keyboard.press('KeyE'); await sleep(800);
  console.log('exited', await A.evaluate(i => !M.sol[i].veh, ri), await B.evaluate(() => !NET.me.sol.veh));
  // big fight
  const t0 = Date.now(); let maxSz = 0, frames = [];
  for (let k = 0; k < 25; k++) { await sleep(1000); maxSz = Math.max(maxSz, await A.evaluate(() => NET.maxSnap)); }
  const fr = await B.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const L = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(L); else r(n / 2); }; requestAnimationFrame(L); }));
  console.log('host maxSnap', maxSz, 'events', await A.evaluate(() => NET.evId), 'A mock', JSON.stringify(await A.evaluate(() => window.__mock)), 'B fps', fr);
  console.log('kills A', await A.evaluate(() => M.sol.reduce((a, s) => a + s.k, 0)), 'B', await B.evaluate(() => M.sol.reduce((a, s) => a + s.k, 0)), 'tickets', await A.evaluate(() => M.tickets.join('/')), await B.evaluate(() => M.tickets.join('/')));
  console.log('statics dead A', await A.evaluate(() => MAP.statics.filter(s => !s.alive).length), 'B', await B.evaluate(() => MAP.statics.filter(s => !s.alive).length), 'wrecks', await A.evaluate(() => M.wrecks.length), await B.evaluate(() => M.wrecks.length));
  console.log('alive A', await A.evaluate(() => M.sol.map(s => s.alive ? 1 : 0).join('')), '\nalive B', await B.evaluate(() => M.sol.map(s => s.alive ? 1 : 0).join('')));
  await B.screenshot({ path: OUT + 'n_fight_B.png' });
  // end of match: drain tickets
  await A.evaluate(() => { M.tickets[1] = 1; }); await sleep(200); await A.evaluate(() => { const f = M.sol.find(s => s.team === 1 && s.alive && !s.player); f.protect = 0; kill(f, null, 'bullet', 1, 0); }); await sleep(5000);
  console.log('end states', await A.evaluate(() => state), await B.evaluate(() => state + ' over ' + M.over + ' winner ' + M.winner));
  await B.screenshot({ path: OUT + 'n_end_B.png' });
  await A.evaluate(() => { newMatch({ ...CFG }, false); setState('play'); }); await sleep(1500);
  console.log('rematch', await B.evaluate(() => state + ' match ' + NET.curMatch + ' alive ' + NET.me.sol.alive));
  console.log('errors', errs.length, errs.slice(0, 8));
  await b.close();
})();
