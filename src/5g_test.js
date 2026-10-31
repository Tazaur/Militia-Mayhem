/* =====================================================================
   SCENES: the dev tester (dev mode's TEST tab; tools/scene.mjs runs the same headless, with screenshots and a log).
   A scene is one set of params, laid round a window of a house on the map (testSpots picks it, room round it):
     spots   INSIDE (in the room, in view through the window), POST (just in from it), WINDOW, OUTSIDE (in front of it),
             BESIDE (to one side of OUTSIDE: room for a tank), FAR (further out), DOOR (outside the nearest door),
             ROOF (the house's middle); PLAYER is wherever the player is
     at      { SPOT: what stands there } - none, dummy, bot, mate, jeep, tank, nest, husk jeep, husk tank
     drv     { SPOT: who drives the vehicle there } - dummy, bot, mate;  move { SPOT: throttle 0-1 } a dummy driver drives on
     player  the spot the player stands on (none: left where they are);  pick: which window (0, 1, ...)
     smoke   [SPOT, ...] a smoke grenade at each;  shots [[FROM, TO, after s], ...] a shot from whoever is at FROM
             (a dummy, made if nobody is) straight at TO
     and the live switches in TEST_KEYS (roofs, los, sun, time, hud, cam, zoom, brain, auto, sight, spots, ts)
   The standard: a new scene is an entry in SCENES (params only); a new switch is a TEST_KEYS entry (its options and
   what it sets); a new place is a spot in testSpots. The panel and the runner pick them up as they are.
   ===================================================================== */
const TEST = { on: false, p: null, name: 'window', S: null, log: [], t0: 0, shots: [], noHud: false, bare: false, spots: false };
const TEST_SPOTS = ['INSIDE', 'POST', 'OUTSIDE', 'BESIDE', 'FAR', 'DOOR'];
const TEST_WHAT = ['none', 'dummy', 'bot', 'mate', 'jeep', 'tank', 'nest', 'husk jeep', 'husk tank'];
const TEST_TIMES = { day: [0.7, -2.36], dusk: [0.14, -2.8], night: [-0.26, -2.36] };     // the sun's height, direction
/* live switches: set at once, no re-run. o: the options (the panel steps through them), set: what each does */
const TEST_KEYS = {
  roofs: { n: 'ROOFS', o: [true, false], set: v => DEV.L.roofs = v },
  los: { n: 'LOS', o: [true, false], set: v => M.cfg.fog = v ? 'los' : 'off' },
  sun: { n: 'SUN', o: [true, false], set: v => CFG.sun = v },
  time: { n: 'TIME', o: ['day', 'dusk', 'night'], set: v => { DEV.cyc = 0; [SUN.el, SUN.az] = TEST_TIMES[v] || TEST_TIMES.day; } },
  hud: { n: 'HUD', o: [true, false], set: v => TEST.noHud = !v },
  cam: { n: 'CAM', o: ['SCENE', 'PLAYER', 'INSIDE', 'WINDOW', 'OUTSIDE', 'BESIDE', 'FAR', 'off'], set: () => {} },
  zoom: { n: 'ZOOM', o: [1, 1.5, 2, 0.75, 0.5], set: () => {} },
  brain: { n: 'BRAINS', o: [false, true], set: v => DEV.brain = v },
  auto: { n: 'AS AI', o: [false, true], set: v => DEV.auto = v },
  sight: { n: 'SIGHT', o: [false, true], set: v => DEV.sightDbg = v },
  spots: { n: 'SPOTS', o: [false, true], set: v => TEST.spots = v },
  ts: { n: 'SPEED', o: [1, 0.25, 0.5, 2, 0], set: v => DEV.ts = v },
};
const SCENE_BASE = { pick: 0, player: 'OUTSIDE', at: {}, drv: {}, move: {}, smoke: [], shots: [], roofs: true, los: true, sun: true, time: 'day', hud: true, cam: 'SCENE', zoom: 1, brain: false, sight: false, spots: false, ts: 1 };
const SCENES = {
  window: { n: 'BY A WINDOW', at: { INSIDE: 'dummy', FAR: 'dummy', BESIDE: 'tank' } },
  husk: { n: 'HUSKS', at: { INSIDE: 'dummy', BESIDE: 'husk tank', FAR: 'husk jeep' } },
  smoke: { n: 'SMOKE', at: { INSIDE: 'dummy', FAR: 'dummy' }, smoke: ['PLAYER', 'INSIDE'] },
  shot: { n: 'SHOT THROUGH THE WINDOW', at: { INSIDE: 'dummy', FAR: 'dummy' }, shots: [['FAR', 'INSIDE', 0.4], ['FAR', 'INSIDE', 0.8]], brain: false },
  drive: { n: 'DRIVING PAST', at: { BESIDE: 'jeep', INSIDE: 'dummy' }, drv: { BESIDE: 'dummy' }, move: { BESIDE: 0.6 }, cam: 'PLAYER' },
  night: { n: 'NIGHT', at: { INSIDE: 'dummy', BESIDE: 'jeep' }, drv: { BESIDE: 'dummy' }, time: 'night' },
  indoors: { n: 'INDOORS', player: 'INSIDE', at: { POST: 'dummy', OUTSIDE: 'dummy' }, cam: 'INSIDE', zoom: 1.5 },
  brawl: { n: 'LIVE BOTS', at: { INSIDE: 'bot', DOOR: 'bot', FAR: 'mate' }, brain: true, cam: 'PLAYER' },
};
const sceneParams = (name, over) => { const s = SCENES[name] || {}, o = over || {}; return { ...SCENE_BASE, ...s, ...o, at: { ...(s.at || {}), ...(o.at || {}) }, drv: { ...(s.drv || {}), ...(o.drv || {}) }, move: { ...(s.move || {}), ...(o.move || {}) } }; };
function tlog(text) { devLog(text, '#c8d0b8'); TEST.log.push({ t: +(M.time - TEST.t0).toFixed(2), text }); if (TEST.log.length > 600) TEST.log.shift(); }
/* each window (MAP.posts: the floor cell just in from it, facing out) with room round it, as named spots */
function testSpots() {
  const C = [], P = MAP.posts || [], open = (q, r, pad) => q[0] > 60 && q[1] > 60 && q[0] < WW - 60 && q[1] < WH - 60 && !solidAt(q[0], q[1], r) && !houseAt(q[0], q[1], pad);
  for (const p of P) {
    if (p.door) continue;
    const hs = houseAt(p.x, p.y); if (!hs) continue; const H = hs[0];
    const ux = Math.cos(p.a), uy = Math.sin(p.a), vx = -uy, vy = ux;
    for (const side of [1, -1]) {
      const at = (f, s) => [p.x + ux * f + vx * s * side, p.y + uy * f + vy * s * side];
      let IN = [p.x, p.y]; for (const f of [3, 2]) { const q = at(-SUB * f, 0), c = houseAt(q[0], q[1]); if (c && hcell(c[0], c[1], c[2]) === C_FLOOR && !solidAt(q[0], q[1], 5)) { IN = q; break; } }
      const S = { INSIDE: IN, POST: [p.x, p.y], WINDOW: at(SUB, 0), OUTSIDE: at(SUB * 5, 0), BESIDE: at(SUB * 5.5, 92), FAR: at(SUB * 13, -40), ROOF: fromF(H.f, H.W * SUB / 2, H.H * SUB / 2) };
      if (!open(S.OUTSIDE, 8, 6) || !open(S.FAR, 8, 6) || !open(S.BESIDE, 40, 40) || !sees(S.OUTSIDE[0], S.OUTSIDE[1], S.INSIDE[0], S.INSIDE[1])) continue;
      let dp = null, dd = 1e9; for (const q of P) if (q.door && houseAt(q.x, q.y) && houseAt(q.x, q.y)[0] === H) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < dd) { dd = d; dp = q; } }
      S.DOOR = dp ? [dp.x + Math.cos(dp.a) * SUB * 2.5, dp.y + Math.sin(dp.a) * SUB * 2.5] : at(SUB * 5, -40);
      S.out = p.a; S.va = p.a + Math.PI / 2; S.H = H;     // facing out of the window; along the wall (vehicles)
      C.push(S);
    }
  }
  return C;
}
const testPos = k => { const S = TEST.S; if (k === 'PLAYER') { const s = (LOCALS()[0] || {}).sol; return s ? [s.veh ? s.veh.x : s.x, s.veh ? s.veh.y : s.y] : null; } return S && S[k] ? S[k] : null; };
const testWho = k => k === 'PLAYER' ? (LOCALS()[0] || {}).sol : M.sol.find(s => s.scene === k && s.alive);
/* everything a scene put down goes (its soldiers, vehicles, husks) */
function testClear() {
  if (!M || !M.sol) return;
  for (const v of M.vehicles) v.seats = v.seats.map(o => o && o.scene ? null : o);
  M.sol = M.sol.filter(s => !s.scene);
  for (const v of M.vehicles) if (v.scene) { engineOff(v); v.gone = true; }
  M.vehicles = M.vehicles.filter(v => !v.gone); M.wrecks = M.wrecks.filter(w => !w.scene); navDirty = 1;
  TEST.on = false; TEST.S = null; TEST.shots = []; EVHOOK = null;
}
function testRun(name, over) { TEST.name = name; return testApply(sceneParams(name, over)); }
function testApply(p) {
  if (!M || !M.dev) return false;
  testClear(); TEST.p = p; TEST.log = []; TEST.t0 = M.time;
  const C = testSpots(); if (!C.length) { devLog('NO WINDOW WITH ROOM ROUND IT HERE', '#ff7a60'); return false; }
  const S = TEST.S = C[((p.pick || 0) % C.length + C.length) % C.length]; TEST.on = true; EVHOOK = testEv;
  const face = k => k === 'WINDOW' || k === 'POST' ? S.out : Math.atan2(S.WINDOW[1] - S[k][1], S.WINDOW[0] - S[k][0]);
  tlog(`SCENE ${TEST.name} · WINDOW ${C.indexOf(S) + 1} OF ${C.length} · ${M.mapId}`);
  const me = (LOCALS()[0] || {}).sol;
  if (me && p.player && p.player !== 'none' && S[p.player]) {
    const [x, y] = S[p.player]; if (me.veh) exitVehicle(me, true);
    if (!me.alive) spawnSoldier(me, { kind: 'pt', x, y });
    Object.assign(me, { x, y, vx: 0, vy: 0, a: face(p.player), protect: 0 }); tlog(`PLAYER AT ${p.player}`);
  }
  for (const [k, what] of Object.entries(p.at)) if (S[k] && what && what !== 'none') testPut(k, what, face(k));
  for (const [k, who] of Object.entries(p.drv)) {
    const v = M.vehicles.find(o => o.scene === k); if (!v || !who || who === 'none') continue;
    let s;
    if (who === 'dummy') { const [x, y] = toWorld(v, ...seatLocal(v, 0)); s = devDummyAt(x, y, v.a, 1, v); }
    else { const t = who === 'mate' ? 0 : 1; s = makeSoldier({ team: t, color: M.teamColor[t], name: 'DRIVER', bot: true }); s.dark = t === 1; M.sol.push(s); spawnSoldier(s, { kind: 'veh', v, x: v.x, y: v.y }); }
    s.scene = k + ' DRIVER'; const th = p.move[k]; if (th && s.dummy) s.dummy.I = () => ({ mx: Math.cos(v.a) * th, my: Math.sin(v.a) * th });
    tlog(`${who.toUpperCase()} DRIVING THE ${v.type.toUpperCase()} AT ${k}` + (th ? ` · THROTTLE ${th}` : ''));
  }
  for (const k of p.smoke) { const q = testPos(k); if (q) { popSmoke(q[0], q[1]); tlog(`SMOKE AT ${k}`); } }
  for (const [a, b, t] of p.shots) { if (!testWho(a) && S[a]) { const s = devDummyAt(S[a][0], S[a][1], face(a), 1); s.scene = a; } TEST.shots.push({ a, b, at: TEST.t0 + (t || 0) }); }
  for (const k in TEST_KEYS) if (p[k] !== undefined) TEST_KEYS[k].set(p[k]);
  return true;
}
function testPut(k, what, a) {
  const [x, y] = TEST.S[k], S = TEST.S;
  if (what === 'dummy') { const s = devDummyAt(x, y, a, 1); s.scene = k; }
  else if (what === 'bot' || what === 'mate') {
    const t = what === 'mate' ? 0 : 1, s = makeSoldier({ team: t, color: M.teamColor[t], name: k, bot: true });
    s.dark = t === 1; M.sol.push(s); spawnSoldier(s, { kind: 'pt', x, y }); Object.assign(s, { x, y, a, protect: 0 }); s.scene = k;
  } else {
    const husk = what.startsWith('husk '), type = husk ? what.slice(5) : what; if (!VT[type]) { tlog('NO SUCH THING: ' + what); return; }
    if (solidAt(x, y, VT[type].hw || 14)) tlog(`TIGHT FOR A ${type.toUpperCase()} AT ${k}`);
    const v = makeVehicle({ type, x, y, a: type === 'nest' ? S.out + Math.PI : S.va, team: -1, dev: true });
    if (husk) { const w = wreckOf(v); Object.assign(w, { t: 1e9, T: 1e9, burn: 0, scene: k }); M.wrecks.push(w); wreckWheel(w); navDirty = 1; }
    else { v.scene = k; M.vehicles.push(v); }
  }
  tlog(`${what.toUpperCase()} AT ${k}`);
}
/* every update of a dev match with a scene on: shots due go off */
function testTick() {
  if (!TEST.on) return;
  for (const q of TEST.shots) {
    if (q.done || M.time < q.at) continue; q.done = true;
    const s = testWho(q.a), to = testPos(q.b); if (!s || !to || s.veh) { tlog(`SHOT ${q.a} › ${q.b}: NOBODY TO FIRE`); continue; }
    s.a = Math.atan2(to[1] - s.y, to[0] - s.x); const st = cw(s); st.mag = Math.max(st.mag, 1);
    tlog(`SHOT ${q.a} › ${q.b} · ${Math.round(Math.hypot(to[0] - s.x, to[1] - s.y))} PX · ${sees(s.x, s.y, to[0], to[1]) ? 'IN SIGHT' : 'NOT IN SIGHT'}`); fireWeapon(s);
  }
}
/* what the log keeps of the game's events */
const TEST_EV = /^(soldier\.(hit|death|down)|bullet\.veh|explosion|veh\.(enter|exit|crash)|prop\.break|shot|rocket\.fire|knife\.hit|spawn|nade\.throw)$/;
function testEv(name, x, y, c) {
  if (!TEST.on || !TEST_EV.test(name) || !M || !M.dev) return; c = c || {};
  if (name === 'shot' && c.s && !c.s.scene && !c.s.player) return;
  const bits = []; for (const k in c) { const v = c[k]; if (v && v.name) bits.push(`${k} ${v.name}`); else if (typeof v === 'number' || typeof v === 'string') bits.push(`${k} ${v}`); }
  tlog(`${name.toUpperCase()} ${bits.join(' · ')}` + (x !== undefined ? ` @ ${x | 0},${y | 0}` : ''));
  if (/death|down/.test(name) && c.s) devLog(`${c.s.name} ${name === 'soldier.down' ? 'DOWN' : 'DEAD'}`, '#ff9a6a');
}
/* the scene's camera (the first view): on a spot, PLAYER, or round them all (SCENE); null: the game's own */
function testCam(vw, baseZ) {
  const p = TEST.p; if (!TEST.on || !p || !p.cam || p.cam === 'off' || vw !== M.views[0]) return null;
  let q;
  if (p.cam === 'SCENE') { const L = ['INSIDE', 'OUTSIDE', ...Object.keys(p.at).filter(k => p.at[k] !== 'none')].map(testPos).filter(Boolean); q = [L.reduce((a, b) => a + b[0], 0) / L.length, L.reduce((a, b) => a + b[1], 0) / L.length]; }
  else q = testPos(p.cam);
  return q ? [q[0], q[1], baseZ * (p.zoom || 1)] : null;
}
/* SPOT NAMES: each spot, named, on the ground */
function testDraw() {
  if (!TEST.on || !TEST.spots || !TEST.S) return; const k = 1 / VZ;
  for (const n of [...TEST_SPOTS, 'WINDOW']) { const q = TEST.S[n]; if (!q) continue; ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 1.5 * k; ctx.beginPath(); ctx.arc(q[0], q[1], 5 * k, 0, TAU); ctx.stroke(); stxt(n, q[0], q[1] + 11 * k, 7, '#ff4fd8', 'center', 'middle', FD); }
}
/* what the runner reads back: the log and where everything is */
function testState() {
  const r = q => q && [Math.round(q[0]), Math.round(q[1])], S = TEST.S || {};
  return {
    scene: TEST.name, map: M.mapId, time: +(M.time - TEST.t0).toFixed(2), fps: Math.round(DEV.fps), log: TEST.log.map(l => `${l.t.toFixed(2)}  ${l.text}`),
    spots: Object.fromEntries([...TEST_SPOTS, 'WINDOW', 'ROOF'].filter(k => S[k]).map(k => [k, r(S[k])])),
    soldiers: M.sol.filter(s => s.alive).map(s => ({ name: s.name, team: s.team, at: r([s.x, s.y]), hp: Math.round(s.hp), veh: s.veh ? s.veh.type : undefined, scene: s.scene, think: s.bot && !s.dummy ? botThought(s, s.bot) : devAI(s) && s.auto ? botThought(s, s.auto) : undefined })),
    vehicles: M.vehicles.filter(v => v.active && !v.dead).map(v => ({ type: v.type, at: r([v.x, v.y]), hp: Math.round(v.hp), spd: Math.round(v.spd || 0), scene: v.scene })),
    wrecks: M.wrecks.map(w => ({ type: w.type, at: r([w.x, w.y]) })), cam: M.views[0] && r([M.views[0].cam.x, M.views[0].cam.y])
  };
}
/* the runner's way in: a local dev match on a map (one keyboard player, bots as asked) */
function testStart(map, bots) {
  if (NET.role) return false;
  engineKillAll(); PLAYERS = []; lobbyJoin({ type: 'kb' }); const p = PLAYERS[0]; if (!p) return false; p.team = 0; p.ready = true;
  const i = MAPNAMES.findIndex(m => m[0] === (map || 'outskirts'));
  newMatch({ ...CFG, dev: true, map: i < 0 ? 0 : i, mode: 1, bots: bots || 0, ff: false, weather: 'clear', fog: 'los', limit: 1, camera: 'split' }, false);
  setState('play'); return true;
}
/* the TEST tab: pick a scene, swap what stands on each spot, flip the switches; RUN lays it out (again) */
function testPanel(row, head, tog) {
  const N = Object.keys(SCENES), p = TEST.p || (TEST.p = sceneParams(TEST.name)), cyc = (A, v, d) => A[(A.indexOf(v) + d + A.length) % A.length];
  const again = () => { if (TEST.on) testApply(p); };
  head('SCENE');
  row([`‹  ${SCENES[TEST.name].n}  ›`, d => { TEST.name = cyc(N, TEST.name, d); TEST.p = sceneParams(TEST.name); }, undefined, true]);
  row([TEST.on ? 'RUN AGAIN' : 'RUN', () => testApply(p)], ['CLEAR', testClear]);
  const sw = (l, fn) => [`‹ ${l} ›`, fn, undefined, true];
  row(sw(`WINDOW ${(p.pick || 0) + 1}`, d => { p.pick = Math.max(0, (p.pick || 0) + d); again(); }), sw(`YOU ${p.player.toUpperCase()}`, d => { p.player = cyc(['none', ...TEST_SPOTS], p.player, d); again(); }));
  head('ON THE SPOTS');
  const spot = k => sw(`${k} ${(p.at[k] || 'none').toUpperCase()}`, d => { p.at[k] = cyc(TEST_WHAT, p.at[k] || 'none', d); again(); });
  for (let i = 0; i < TEST_SPOTS.length; i += 2) row(spot(TEST_SPOTS[i]), TEST_SPOTS[i + 1] && spot(TEST_SPOTS[i + 1]));
  const vk = Object.keys(p.at).find(k => /jeep|tank/.test(p.at[k]) && !/husk/.test(p.at[k]));
  if (vk) row(sw(`${vk} DRIVER: ${(p.drv[vk] || 'none').toUpperCase()}${p.move[vk] ? ' · MOVING' : ''}`, d => { const o = ['none', 'dummy', 'dummy+', 'bot', 'mate'], c = p.move[vk] && p.drv[vk] === 'dummy' ? 'dummy+' : p.drv[vk] || 'none', n = cyc(o, c, d); p.drv[vk] = n === 'dummy+' ? 'dummy' : n; p.move[vk] = n === 'dummy+' ? 0.6 : 0; again(); }));
  row(['SMOKE ON ME', () => { const q = testPos('PLAYER'); if (q) popSmoke(q[0], q[1]); }], ['SHOOT FAR›IN', () => { if (!TEST.on) return; if (!testWho('FAR')) { const s = devDummyAt(TEST.S.FAR[0], TEST.S.FAR[1], 0, 1); s.scene = 'FAR'; } TEST.shots.push({ a: 'FAR', b: 'INSIDE', at: M.time + 0.1 }); }]);
  head('SWITCHES');
  const keys = Object.keys(TEST_KEYS), lab = v => v === true ? 'ON' : v === false ? 'OFF' : String(v).toUpperCase();
  const key = k => { const K = TEST_KEYS[k]; return sw(`${K.n} ${lab(p[k])}`, d => { p[k] = cyc(K.o, p[k], d); if (k !== 'cam' && k !== 'zoom') K.set(p[k]); }); };
  for (let i = 0; i < keys.length; i += 2) row(key(keys[i]), keys[i + 1] && key(keys[i + 1]));
}
