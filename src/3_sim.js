/* =====================================================================
   SIMULATION — match, soldiers, stances, weapons, gadgets, vehicles,
   seats, damage, projectiles, objectives, cameras
   ===================================================================== */
const VT = {
  tank: {
    drive: true, hl: 52, hw: 28, maxF: 82, maxR: 50, acc: 90, brake: 160, drag: 70, turn: 1.3, mass: 5, hp: 900, respawn: 24,
    circles: [[-34, 0, 27], [0, 0, 28], [34, 0, 27]],
    seats: [
      { n: 'DRIVER', anchor: [70, 0], pos: [20, 0], exposed: false, role: 'drive' },
      { n: 'GUNNER', anchor: [-72, 0], pos: 'turret', exposed: true, role: 'mg' },
      { n: 'LEFT RIDER', anchor: [0, -48], pos: [-30, -17], exposed: true, role: 'rifle' },
      { n: 'RIGHT RIDER', anchor: [0, 48], pos: [-30, 17], exposed: true, role: 'rifle' }],
    dpad: [0, 3, 1, 2]
  },
  jeep: {
    drive: true, hl: 41, hw: 19, maxF: 205, maxR: 85, acc: 210, brake: 380, drag: 120, turn: 2.6, mass: 1.4, hp: 260, respawn: 18,
    circles: [[-25, 0, 19], [0, 0, 20], [25, 0, 19]],
    seats: [
      { n: 'DRIVER', anchor: [2, -36], pos: [-1, -8], exposed: true, role: 'drive' },
      { n: 'PASSENGER', anchor: [2, 36], pos: [-1, 8], exposed: true, role: 'rifle' },
      { n: 'GUNNER', anchor: [-60, 0], pos: [-27, 0], exposed: true, role: 'mg' }],
    dpad: [0, 1, 2, 0]
  },
  nest: {
    drive: false, hl: 16, hw: 16, maxF: 1, maxR: 1, acc: 0, brake: 0, drag: 0, turn: 0, mass: 99, hp: 420, respawn: 30, arc: 1.25,
    circles: [[0, 0, 18]],
    seats: [{ n: 'MG NEST', anchor: [-30, 0], pos: [-10, 0], exposed: true, role: 'mg' }],
    dpad: [0, 0, 0, 0]
  }
};

function newMatch(cfg, demo) {
  engineKillAll();
  const mode = MODES[cfg.mode] || MODES[0];
  const ffa = mode.id === 'ffa';
  const teamColor = pickTeamColors(cfg, demo, ffa);
  TEAMHEX = teamColor.map(c => CHEX[c]);
  TEAMNAME = (!demo && !ffa && cfg.teamColors !== 'classic') ? teamColor.map(c => CNAME[c]) : ['WEST', 'EAST'];
  buildRings();
  buildMap(MAPNAMES[cfg.map % MAPNAMES.length][0]); paintGround(); buildNav();
  MAP.statics.forEach((s, i) => s.idx = i);
  const tk = LIMITS.team[cfg.limit] || 200;
  M = {
    cfg, demo: !!demo, mode: mode.id, ffa, time: 0, sol: [], vehicles: [], wrecks: [], proj: [], parts: [], flings: [], corpses: [], smokes: [], crates: [], items: [], feed: [], toasts: [],
    flags: [], tickets: [tk, tk], limit: ffa ? LIMITS.ffa[cfg.limit] : 0, bleedT: 0, over: false, overT: 0, winner: -1, views: [], skill: SKILL[cfg.skill] || SKILL[1],
    scoreHeld: false, lowWarn: [false, false], ff: !!cfg.ff && !demo, rain: cfg.weather === 'rain' && MAPNAMES[cfg.map][0] !== 'snowfield', snow: cfg.weather === 'snow' || (cfg.weather === 'rain' && MAPNAMES[cfg.map][0] === 'snowfield'), teamColor
  };
  if (mode.id === 'conquest') M.flags = MAP.flags.map(f => ({ ...f, r: 96, owner: -1, prog: 0, contested: false, wave: rnd(0, 6), cnt: [0, 0] }));
  if (mode.id === 'koth') M.flags = [{ ...MAP.flags[1], name: 'HILL', r: 120, owner: -1, prog: 0, contested: false, wave: 0, cnt: [0, 0] }];
  if (demo) M.tickets = [99999, 99999];
  if (mode.id === 'conquest') { M.flags[0].owner = 0; M.flags[0].prog = -1; M.flags[2].owner = 1; M.flags[2].prog = 1; }
  for (const s of MAP.vehSpawns) M.vehicles.push(makeVehicle(s));
  for (const c of MAP.crateSpots) M.crates.push({ x: c.x, y: c.y, a: rnd(-0.4, 0.4), live: true, t: 0 });
  const humans = demo ? [] : PLAYERS;
  const used = new Set(humans.map(p => p.color));
  let nameI = rint(0, BOTNAMES.length - 1);
  const nextName = () => BOTNAMES[(nameI++) % BOTNAMES.length];
  humans.forEach((p, i) => {
    const s = makeSoldier({ team: ffa ? 100 + i : p.team, color: p.color, name: p.name || 'P' + (p.id + 1), player: p });
    s.kit = p.kit || 0; s.var = p.var || 0; s.sec = p.sec || 0; s.nt = p.nt || 0; s.respawnT = 0; s.firstDeploy = true; s.deployIdle = 0;
    p.sol = s; M.sol.push(s);
  });
  if (ffa) {
    const free = COLORS.filter(c => !used.has(c));
    const nb = Math.min(cfg.bots, COLORS.length - humans.length, free.length);
    for (let i = 0; i < nb; i++) M.sol.push(makeSoldier({ team: 200 + i, color: free[i], name: nextName(), bot: true }));
  } else {
    for (const t of [0, 1]) { const nb = demo ? 7 : cfg.bots; for (let i = 0; i < nb; i++) { const b = makeSoldier({ team: t, color: teamColor[t], name: nextName(), bot: true }); b.dark = !demo && cfg.teamColors !== 'classic'; M.sol.push(b); } }
  }
  for (const s of M.sol) if (s.bot) s.respawnT = rnd(0, 0.8);
  rainAudio(M.rain && !demo || (M.rain && demo));
  layoutViews();
  if (!demo) netMatchStarted();
}
/* each team wears its first player's colour; bots on that team wear a darker shade of it */
function pickTeamColors(cfg, demo, ffa) {
  const tc = ['blue', 'red'];
  if (demo || ffa || cfg.teamColors === 'classic') return tc;
  const humans = PLAYERS.slice().sort((a, b) => a.id - b.id);
  const lead = [humans.find(p => p.team === 0), humans.find(p => p.team === 1)];
  const used = new Set(humans.map(p => p.color));
  for (const t of [0, 1]) if (lead[t]) tc[t] = lead[t].color;
  for (const t of [0, 1]) if (!lead[t]) { const other = tc[1 - t]; tc[t] = ['blue', 'red', 'green', 'orange', 'cyan', 'magenta', 'yellow'].find(c => c !== other && (!used.has(c) || !lead[1 - t])) || (other === 'red' ? 'blue' : 'red'); if (tc[t] === other) tc[t] = other === 'red' ? 'blue' : 'red'; }
  return tc;
}
function makeSoldier(o) {
  return {
    id: ++UID, x: 0, y: 0, a: 0, vx: 0, vy: 0, r: 7, hp: 100, team: o.team, color: o.color, name: o.name, player: o.player || null,
    bot: o.bot ? { thinkT: 0, goal: null, goalT: 0, path: null, pathI: 0, pathT: 0, target: null, burst: 0, rest: 0, strafe: 1, strafeT: 0, stuckT: 0, lx: 0, ly: 0, nadeCd: 3, vehCd: rnd(2, 6), react: 0, err: 0, wantSeat: null, exitCd: 0, gadCd: rnd(4, 10), proneT: 0 } : null,
    alive: false, respawnT: 1, kit: 0, var: 0, w: null, wi: 0, nades: 2, mines: 0, gcd: 0, fireCd: 0, reloadT: 0, nadeCd: 0, lastHurt: -9, protect: 0,
    stance: 0, throwT: 0, stanceT: 0, swim: false, torch: false, ads: false, bloom: 0, jumpT: 0, jdx: 0, jdy: 0, meleeCd: 0, meleeT: 0, spotCd: 0, stepAcc: 0, stepSide: 1,
    veh: null, seat: -1, seatT: 0, seatFrom: null, seatMax: 0.5, walkT: 0, moving: false, flash: 0, hurtT: 0,
    k: 0, d: 0, caps: 0, vk: 0, rk: 0, heal: 0, rep: 0, longest: 0, pts: 0, pops: [],
    spawnSel: 0, msg: null, hitT: 0, firedT: 0, spotT: 0, spotTeam: -1, deployIdle: 0
  };
}
function makeVehicle(sp) {
  const T = VT[sp.type];
  return {
    id: ++UID, type: sp.type, T, sp, x: sp.x, y: sp.y, a: sp.a, vx: 0, vy: 0, spd: 0, av: 0, rev: false,
    hp: T.hp, active: true, dead: false, respawnT: 0, seats: T.seats.map(() => null), ta: sp.a, mgA: sp.a, tRel: 0, mgRel: 0, mgAim: undefined, aimT: undefined, recoil: 0, cd: 0, mgCd: 0, heat: 0, over: 0,
    trackAcc: 0, burn: 0, lastHit: null, hitFlash: 0, eng: null, crashCd: 0, mgFlash: 0
  };
}
/* mounted guns ride on whatever they're bolted to: turret on the hull, tank MG on the turret */
function syncMounts(v) { if (v.type === 'tank') v.ta = v.a + v.tRel; v.mgA = (v.type === 'tank' ? v.ta : v.a) + v.mgRel; }
function vehTeam(v) { for (const s of v.seats) if (s) return s.team; return -1; }
function vehColor(v) { const s = v.seats[0] || v.seats.find(Boolean); return s ? s.color : null; }
function isEnemy(a, b) { return a !== b && a >= 0 && b >= 0; }
function canHurt(src, tgt) { if (!src || src === tgt) return true; if (isEnemy(src.team, tgt.team)) return true; return M.ff && src.team === tgt.team; }
function addPts(s, n, why) { if (!s) return; s.pts += n; if (s.player) { const txt = `+${n}  ${why}`; s.pops.unshift({ txt, t: 1.8 }); if (s.pops.length > 4) s.pops.length = 4; if (isNet(s.player)) netEv('pp', s.player.id, txt); else sfx('points'); } }
/* a sound only one player should hear: played here for local players, sent to a remote player's screen */
const PSFX_T = {};
function psfx(pl, name) {
  if (!pl) return; if (!isNet(pl)) { sfx(name); return; }
  const k = pl.id + name, n = performance.now(); if (PSFX_T[k] && n - PSFX_T[k] < 220) return; PSFX_T[k] = n; netEv('ps', pl.id, name);
}
function cw(s) { return s.w ? s.w[s.wi] : null; }
function giveLoadout(s) {
  const K = KITS[s.kit] || KITS[0], p = K.p[(s.var || 0) % K.p.length], sec = K.secs[(s.sec || 0) % K.secs.length], no = NADE_OPTS(K)[(s.nt || 0) % 2];
  s.w = [{ id: p, mag: WPN[p].mag, res: WPN[p].res }, { id: sec, mag: WPN[sec].mag, res: WPN[sec].res }];
  s.wi = 0; s.nades = no.f; s.smokes = no.sm; s.throwSel = s.nades > 0 ? 0 : 1; s.mines = K.g === 'mine' ? 2 : 0; s.gcd = 0;
}

/* ---------------- spawning ---------------- */
function spawnOptions(s) {
  if (M.ffa) return [{ name: 'SAFEST DROP', kind: 'rand' }, ...MAP.ffaSpawns.map((p, i) => ({ name: 'DROP ' + (i + 1), x: p.x, y: p.y, kind: 'pt' }))];
  const out = [{ name: 'BASE', x: MAP.bases[s.team].x, y: MAP.bases[s.team].y, kind: 'base' }];
  if (M.mode === 'conquest') { for (const f of M.flags) if (f.owner === s.team && !f.contested) out.push({ name: 'FLAG ' + f.name, x: f.x, y: f.y, kind: 'flag' }); }
  else out.push({ name: 'FORWARD CAMP', x: MAP.fwd[s.team].x, y: MAP.fwd[s.team].y, kind: 'pt' });
  for (const o of M.sol) {
    if (o === s || !o.player || !o.alive || o.team !== s.team) continue;
    if (o.veh) { const free = o.veh.seats.findIndex(q => !q); if (free >= 0 && o.veh.T.drive) out.push({ name: `${o.name}'S ${o.veh.type.toUpperCase()}`, x: o.veh.x, y: o.veh.y, kind: 'veh', v: o.veh }); }
    else if (M.time - o.lastHurt > 3) out.push({ name: 'ON ' + o.name, x: o.x, y: o.y, kind: 'mate', o });
  }
  return out;
}
function freeSpot(x, y) {
  for (let k = 0; k < 40; k++) {
    const a = rnd(0, TAU), d = k === 0 ? 0 : rnd(10, 30 + k * 4), px = clamp(x + Math.cos(a) * d, 40, WW - 40), py = clamp(y + Math.sin(a) * d, 40, WH - 40);
    if (!solidAt(px, py, 10) && !inWater(px, py)) return [px, py];
  }
  return [x, y];
}
function solidAt(x, y, r) {
  for (const b of MAP.buildings) if (inRect(x, y, b, r)) return true;
  staticsNear(x, y, r + 14, _near); for (const s of _near) if (Math.hypot(s.x - x, s.y - y) < s.r + r) return true;
  for (const v of M.vehicles) if (v.active && !v.dead && Math.hypot(v.x - x, v.y - y) < v.T.hl + r) return true;
  return false;
}
function spawnSoldier(s, opt) {
  if (!opt) {
    const pts = spawnOptions(s);
    if (M.ffa) opt = pts[0];
    else { const own = pts.filter(q => q.kind === 'flag' || q.kind === 'pt'); opt = own.length && Math.random() < 0.7 ? pick(own) : pts[0]; }
  }
  if (s.bot) { s.kit = pickKit(); s.var = rint(0, 1); s.sec = rint(0, 1); s.nt = 0; }
  giveLoadout(s);
  Object.assign(s, { hp: 100, alive: true, reloadT: 0, fireCd: 0.3, protect: 1.6, veh: null, seat: -1, seatT: 0, lastHurt: -9, stance: 0, stanceT: 0, swim: false, vx: 0, vy: 0, deployIdle: 0, firstDeploy: false });
  let x, y;
  if (opt.kind === 'rand') {
    let best = null, bd = -1;
    for (const q of MAP.ffaSpawns) { let md = 1e9; for (const o of M.sol) if (o.alive && o !== s) md = Math.min(md, Math.hypot(o.x - q.x, o.y - q.y)); md += rnd(0, 250); if (md > bd) { bd = md; best = q; } }
    [x, y] = freeSpot(best.x, best.y);
  } else if (opt.kind === 'veh' && opt.v.active && !opt.v.dead) {
    const free = opt.v.seats.findIndex(q => !q);
    if (free >= 0) { s.x = opt.v.x; s.y = opt.v.y; enterVehicle(s, { v: opt.v, seat: free, bump: null }, true); afterSpawn(s); return; }
    [x, y] = freeSpot(opt.x, opt.y);
  } else if (opt.kind === 'mate') { [x, y] = freeSpot(opt.o.x + rnd(-14, 14), opt.o.y + rnd(-14, 14)); }
  else [x, y] = freeSpot(opt.x + rnd(-30, 30), opt.y + rnd(-30, 30));
  s.x = x; s.y = y; netCorrect(s);
  s.a = M.ffa ? Math.atan2(WH / 2 - y, WW / 2 - x) : s.team === 0 ? 0 : Math.PI;
  afterSpawn(s);
}
function afterSpawn(s) {
  if (s.bot) { s.bot.path = null; s.bot.goal = null; s.bot.target = null; s.bot.vehCd = rnd(0.5, 3); }
  if (s.player) { psfx(s.player, 'spawn'); Object.assign(s.player, { kit: s.kit, var: s.var, sec: s.sec, nt: s.nt }); }
}
function pickKit() { const r = Math.random(); return r < 0.35 ? 0 : r < 0.6 ? 1 : r < 0.8 ? 2 : 3; }

/* ---------------- damage & death ---------------- */
function hurtSoldier(s, dmg, src, kind, dx, dy, wname) {
  if (!s.alive || s.protect > 0 || M.over) return;
  if (src && !canHurt(src, s)) return;
  if (kind === 'explosion' || kind === 'mine') dmg *= [1, 0.8, 0.6][s.stance];
  s.hp -= dmg; s.lastHurt = M.time; s.hurtT = 0.35;
  if (src && src.player && src !== s) { src.hitT = 0.15; psfx(src.player, 'hit'); }
  if (s.player) rumble(s.player, Math.min(1, dmg / 60), 0.15);
  if (kind === 'bullet' || kind === 'mg') { for (let i = 0; i < 2; i++) blood(s.x, s.y, dx, dy); sfx('hurt', s.x, s.y); netEv('b', s.x | 0, s.y | 0, Math.round(dx || 0), Math.round(dy || 0)); }
  if (s.hp <= 0) kill(s, src, kind, dx, dy, wname);
}
function blood(x, y, dx, dy) {
  const a = Math.atan2(dy || rnd(-1, 1), dx || rnd(-1, 1)) + rnd(-0.6, 0.6), sp = rnd(40, 140);
  part({ k: 'blood', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.25, 0.5), max: 0.5, sz: rnd(0.25, 0.45), rot: rnd(0, TAU), drag: 5 });
}
function kill(s, src, kind, dx, dy, wname) {
  s.alive = false; s.hp = 0; s.d++; s.respawnT = s.player ? 5 : 6; s.torch = false;
  if (s.veh) leaveSeat(s);
  if (s.player) { rumble(s.player, 1, 0.4); s.deployIdle = 0; s.deathT = 2.2; s.killer = src && src !== s ? { sol: src, veh: src.veh || null, x: src.veh ? src.veh.x : src.x, y: src.veh ? src.veh.y : src.y, name: src.name, color: src.color } : null; }
  if (!M.ffa && !M.demo) M.tickets[s.team] = Math.max(0, M.tickets[s.team] - 1);
  let how = wname || (kind === 'crush' ? 'ROADKILL' : kind === 'explosion' ? 'BLAST' : kind === 'burn' ? 'WRECK' : kind === 'mine' ? 'MINE' : 'RIFLE');
  if (src && src !== s && isEnemy(src.team, s.team)) {
    src.k++;
    const d = Math.hypot(src.x - s.x, src.y - s.y); if (d > src.longest && kind !== 'crush') src.longest = d;
    if (kind === 'crush') { src.rk++; addPts(src, 150, 'ROADKILL'); } else addPts(src, 100, 'KILL ' + s.name);
    if (src.player) src.msg = { t: 1.4, txt: (kind === 'crush' ? 'ROADKILL  ' : 'KILLED  ') + s.name };
  } else if (src && src !== s && src.team === s.team) { src.pts = Math.max(0, src.pts - 100); how = 'TEAMKILL'; }
  feed(src && src !== s ? src : null, how, s);
  if (Math.random() < 0.35 && !s.swim) M.items.push({ k: 'pouch', x: s.x, y: s.y, t: 20, team: -1 });
  const ang = Math.atan2(dy || 0, dx || 1), ki = src && src !== s ? M.sol.indexOf(src) : -1, si = M.sol.indexOf(s);
  if (kind === 'crush' || kind === 'explosion' || kind === 'burn' || kind === 'mine') {
    const sp = kind === 'crush' ? Math.hypot(dx, dy) * 1.1 + 80 : rnd(100, 200);
    netEv('k', si, 1, s.x | 0, s.y | 0, Math.round(ang * 100), sp | 0, ki);
    M.flings.push({ color: s.color, dark: s.dark, x: s.x, y: s.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t: 0, T: rnd(0.7, 1.0), rot: rnd(0, TAU), vr: rnd(-12, 12) });
    sfx('splat', s.x, s.y);
  } else if (s.swim) { netEv('k', si, 2, s.x | 0, s.y | 0, 0, 0, ki); for (let i = 0; i < 6; i++) part({ k: 'steam', x: s.x, y: s.y, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 1, max: 1, sz: 8, drag: 2 }); sfx('splash', s.x, s.y); }
  else {
    const rot = ang + Math.PI + rnd(-0.3, 0.3); netEv('k', si, 0, s.x | 0, s.y | 0, Math.round(rot * 100), Math.round(ang * 100), ki);
    addCorpse(s.color, s.dark, s.x, s.y, rot);
    for (let i = 0; i < 6; i++) blood(s.x, s.y, dx, dy);
    sfx('splat', s.x, s.y);
  }
}
/* out of bounds: anyone outside the battlefield (on foot or aboard) dies after OOB_T seconds; empty vehicles are wrecked after twice that */
function updateBounds(dt) {
  if (M.over) return;
  for (const s of M.sol) {
    const x = s.veh ? s.veh.x : s.x, y = s.veh ? s.veh.y : s.y;
    if (!s.alive || !outOfBounds(x, y)) { s.oobT = 0; continue; }
    s.oobT = (s.oobT || 0) + dt;
    if (s.oobT >= OOB_T) { s.oobT = 0; kill(s, null, 'oob', 0, 0, 'OUT OF BOUNDS'); }
  }
  for (const v of M.vehicles) {
    if (!v.active || v.dead || !v.T.drive || v.seats.some(Boolean) || !outOfBounds(v.x, v.y)) { v.oobT = 0; continue; }
    v.oobT = (v.oobT || 0) + dt; if (v.oobT >= OOB_T * 2) { v.oobT = 0; destroyVehicle(v, null); }
  }
}
function feed(a, how, b) {
  netEv('f', a ? a.name : '', a ? a.color : '', how, b.name, b.color);
  M.feed.unshift({ a: a ? { n: a.name, c: a.color } : null, how, b: { n: b.name, c: b.color }, t: 6 });
  if (M.feed.length > 6) M.feed.length = 6;
}
function hurtVehicle(v, dmg, src) {
  if (v.dead || !v.active || M.over) return;
  const vt = vehTeam(v);
  if (src && vt >= 0 && src.team === vt && !M.ff) return;
  v.hp -= dmg; v.lastHit = src; v.hitFlash = 0.08;
  if (src && src.player) { src.hitT = 0.15; psfx(src.player, 'hit'); }
  for (const s of v.seats) if (s && s.player) rumble(s.player, Math.min(1, dmg / 200), 0.2);
  if (v.hp <= 0) destroyVehicle(v, src);
}
function destroyVehicle(v, src) {
  v.dead = true; v.hp = 0;
  explosion(v.x, v.y, v.type === 'tank' ? 110 : 80, 120, 150, src, -2, true);
  const occupied = v.seats.some(Boolean), vt = vehTeam(v);
  if (src && occupied && isEnemy(src.team, vt)) { src.vk++; addPts(src, v.type === 'tank' ? 300 : 200, (v.type === 'nest' ? 'NEST' : v.type.toUpperCase()) + ' DESTROYED'); }
  for (const s of [...v.seats]) if (s) { s.protect = 0; kill(s, src, 'explosion', rnd(-1, 1), rnd(-1, 1)); }
  if (v.type !== 'nest') M.wrecks.push({ type: v.type, x: v.x, y: v.y, a: v.a, ta: v.ta, t: 180, T: 180, burn: 14, hl: v.T.hl * 0.92, hw: v.T.hw * 0.9 }) && (navDirty = 1);
  else for (let i = 0; i < 10; i++) part({ k: 'dirt', x: v.x, y: v.y, vx: rnd(-90, 90), vy: rnd(-90, 90), life: 0.8, max: 0.8, sz: 3, drag: 3 });
  if (src && src.player && !occupied) src.msg = { t: 1.4, txt: 'EMPTY ' + v.type.toUpperCase() + ' DESTROYED' };
  feed(src, 'DESTROYED', { name: v.type === 'nest' ? 'MG NEST' : v.type.toUpperCase(), color: 'white' });
  if (v.eng) { try { v.eng.o.stop(); } catch (e) { } v.eng = null; }
  v.active = false; v.respawnT = v.T.respawn;
  scorch(v.x, v.y, v.type === 'tank' ? 90 : 70);
}
function explosion(x, y, r, dmgS, dmgV, src, team, big, kind) {
  explosionFx(x, y, r, big); netEv('x', x | 0, y | 0, r | 0, big ? 1 : 0);
  for (const s of M.sol) {
    if (!s.alive) continue; if (s.veh && !s.veh.T.seats[s.seat].exposed) continue;
    const d = Math.hypot(s.x - x, s.y - y); if (d > r) continue;
    hurtSoldier(s, dmgS * Math.pow(1 - d / r, 0.6), src, kind || 'explosion', s.x - x + rnd(-1, 1), s.y - y + rnd(-1, 1));
  }
  for (const v of M.vehicles) {
    if (!v.active || v.dead) continue;
    let dmin = 1e9; for (const [ox, oy, cr] of v.T.circles) { const c = Math.cos(v.a), sn = Math.sin(v.a); const cx = v.x + ox * c - oy * sn, cy = v.y + ox * sn + oy * c; dmin = Math.min(dmin, Math.hypot(cx - x, cy - y) - cr); }
    if (dmin > r * 0.6) continue;
    const f = clamp(1 - Math.max(0, dmin) / (r * 0.6), 0.25, 1);
    hurtVehicle(v, dmgV * f, src);
    if (v.T.drive) { const k = 25 / v.T.mass * f, d = Math.hypot(v.x - x, v.y - y) + 1; v.vx += (v.x - x) / d * k; v.vy += (v.y - y) / d * k; }
  }
  staticsNear(x, y, r * 0.55, _near);
  for (const s of _near) if (Math.hypot(s.x - x, s.y - y) < r * (s.type === 'tree' ? 0.35 : 0.55)) destroyStatic(s, true);
  for (const c of M.crates) if (c.live && Math.hypot(c.x - x, c.y - y) < r * 0.5) { c.live = false; c.t = 25; }
  for (const it of M.items) if (it.k === 'mine' && it.armed !== false && Math.hypot(it.x - x, it.y - y) < r * 0.6 && !it.boom) { it.boom = true; it.t = 0; }
}
/* everything you see and hear of a blast (online clients replay this from the host's events) */
function explosionFx(x, y, r, big) {
  sfx(big ? 'bigboom' : 'boom', x, y); earRing(x, y, r);
  scorch(x, y, r * 0.7);
  const n = Math.round(r / 5);
  for (let i = 0; i < n; i++) { const a = rnd(0, TAU), sp = rnd(30, r * 1.6); part({ k: 'fire', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.3, 0.7), max: 0.7, sz: rnd(r * 0.25, r * 0.5), drag: 4 }); }
  for (let i = 0; i < n * 0.8; i++) { const a = rnd(0, TAU), sp = rnd(10, r * 0.8); part({ k: 'smoke', x: x + rnd(-r, r) * 0.3, y: y + rnd(-r, r) * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(1, 2.4), max: 2.4, sz: rnd(r * 0.3, r * 0.6), drag: 1.6 }); }
  for (let i = 0; i < n * 0.6; i++) { const a = rnd(0, TAU), sp = rnd(80, 320); part({ k: 'debris', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.4, 1), max: 1, sz: rnd(1.5, 4), rot: rnd(0, TAU), vr: rnd(-15, 15), drag: 3 }); }
  part({ k: 'flash', x, y, vx: 0, vy: 0, life: 0.16, max: 0.16, sz: r * 1.7, drag: 0 });
  part({ k: 'boom', x, y, vx: 0, vy: 0, life: 0.55, max: 0.55, sz: r / 26, rot: rnd(0, TAU), v: rint(0, 2), drag: 0 });
  if (big) part({ k: 'boom', x: x + rnd(-15, 15), y: y + rnd(-15, 15), vx: 0, vy: 0, life: 0.7, max: 0.7, sz: r / 30, rot: rnd(0, TAU), v: rint(0, 2), drag: 0 });
  part({ k: 'ring', x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, sz: r * 1.3, drag: 0 });
  if (inWater(x, y)) for (let i = 0; i < 12; i++) part({ k: 'steam', x, y, vx: rnd(-60, 60), vy: rnd(-60, 60), life: 1.4, max: 1.4, sz: rnd(10, 20), drag: 2 });
  for (const vw of M.views) { const d = Math.hypot(vw.cam.x - x, vw.cam.y - y); vw.shake = Math.min(18, vw.shake + (big ? 14 : 8) * Math.max(0, 1 - d / 700)); }
  for (const p of LOCALS()) { const s = p.sol; if (!s || !s.alive) continue; const d = Math.hypot(s.x - x, s.y - y); if (d < 400) rumble(p, (1 - d / 400) * (big ? 1 : 0.6), 0.25); }
}
function destroyStatic(s) {
  if (!s.alive) return; s.alive = false; netEv('d', s.idx);
  if (s.type === 'tree') {
    sfx('crack', s.x, s.y);
    for (let i = 0; i < 14; i++) { const a = rnd(0, TAU), sp = rnd(30, 140); part({ k: 'leaf', x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.5, 1.2), max: 1.2, sz: rnd(2, 4), rot: rnd(0, TAU), vr: rnd(-8, 8), drag: 3 }); }
    gx.fillStyle = '#3d2a14'; gx.beginPath(); gx.arc(s.x, s.y, 6, 0, TAU); gx.fill();
    gx.fillStyle = CFG.style === 'grit' ? 'rgba(45,50,28,0.6)' : 'rgba(20,60,15,0.6)'; for (let i = 0; i < 10; i++) { gx.beginPath(); gx.arc(s.x + rnd(-22, 22), s.y + rnd(-22, 22), rnd(3, 7), 0, TAU); gx.fill(); }
  } else if (s.type === 'hay') {
    sfx('crush', s.x, s.y);
    for (let i = 0; i < 16; i++) { const a = rnd(0, TAU), sp = rnd(30, 120); part({ k: 'straw', x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.5, 1.1), max: 1.1, sz: rnd(2, 4), rot: rnd(0, TAU), vr: rnd(-8, 8), drag: 3 }); }
    gx.fillStyle = 'rgba(170,140,70,0.5)'; for (let i = 0; i < 14; i++) gx.fillRect(s.x + rnd(-16, 16), s.y + rnd(-16, 16), rnd(3, 7), 1);
  } else {
    if (s.arc) s.arc.lost++;
    sfx('crush', s.x, s.y);
    for (let i = 0; i < 6; i++) { const a = rnd(0, TAU), sp = rnd(20, 90); part({ k: s.type === 'fence' ? 'splinter' : 'dirt', x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.4, 0.8), max: 0.8, sz: rnd(2, 3.5), rot: rnd(0, 3), vr: rnd(-8, 8), drag: 4 }); }
    gx.fillStyle = s.type === 'fence' ? 'rgba(80,60,40,0.55)' : 'rgba(150,120,60,0.55)'; for (let i = 0; i < 4; i++) gx.fillRect(s.x + rnd(-8, 8), s.y + rnd(-6, 6), rnd(3, 6), rnd(1, 3));
  }
  navDirty = 1;
}
function part(o) { if (M.parts.length < 1400) M.parts.push(o); }

/* ---------------- collision ---------------- */
function pushCircleRect(o, r, b) {
  if (o.x + r < b.x || o.x - r > b.x + b.w || o.y + r < b.y || o.y - r > b.y + b.h) return false;
  const nx = clamp(o.x, b.x, b.x + b.w), ny = clamp(o.y, b.y, b.y + b.h); let dx = o.x - nx, dy = o.y - ny; const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 < 1e-6) { const l = o.x - b.x, rt = b.x + b.w - o.x, t = o.y - b.y, bt = b.y + b.h - o.y, m = Math.min(l, rt, t, bt); if (m === l) o.x = b.x - r; else if (m === rt) o.x = b.x + b.w + r; else if (m === t) o.y = b.y - r; else o.y = b.y + b.h + r; return true; }
  const d = Math.sqrt(d2); o.x = nx + dx / d * r; o.y = ny + dy / d * r; return true;
}
const LOW = { bag: 1, fence: 1, hay: 1 };
/* wrecks are oriented boxes: blockers for movement, bullets and sight */
function wreckLocal(w, x, y) { const dx = x - w.x, dy = y - w.y, c = Math.cos(-w.a), s = Math.sin(-w.a); return [dx * c - dy * s, dx * s + dy * c]; }
function pushOutWreck(o, r, w) {
  if (Math.abs(o.x - w.x) > w.hl + r + 4 || Math.abs(o.y - w.y) > w.hl + r + 4) return false;
  const [lx, ly] = wreckLocal(w, o.x, o.y), cx = clamp(lx, -w.hl, w.hl), cy = clamp(ly, -w.hw, w.hw), dx = lx - cx, dy = ly - cy, d = Math.hypot(dx, dy);
  if (d >= r) return false;
  let nx, ny; if (d > 0.01) { nx = cx + dx / d * r; ny = cy + dy / d * r; } else { const px = w.hl - Math.abs(lx), py = w.hw - Math.abs(ly); if (px < py) { nx = Math.sign(lx || 1) * (w.hl + r); ny = ly; } else { nx = lx; ny = Math.sign(ly || 1) * (w.hw + r); } }
  const c = Math.cos(w.a), s = Math.sin(w.a); o.x = w.x + nx * c - ny * s; o.y = w.y + nx * s + ny * c; return true;
}
function segWreck(x0, y0, x1, y1, w) {
  if (Math.abs((x0 + x1) / 2 - w.x) > 160 || Math.abs((y0 + y1) / 2 - w.y) > 160) return -1;
  const [ax, ay] = wreckLocal(w, x0, y0), [bx, by] = wreckLocal(w, x1, y1);
  return segRect(ax, ay, bx, by, { x: -w.hl, y: -w.hw, w: w.hl * 2, h: w.hw * 2 }, 0);
}
function soldierCollide(s) {
  for (const b of MAP.buildings) pushCircleRect(s, s.r, b);
  for (const w of M.wrecks) pushOutWreck(s, s.r, w);
  staticsNear(s.x, s.y, 30, _near);
  for (const o of _near) { if (s.jumpT > 0.04 && LOW[o.type]) continue; const dx = s.x - o.x, dy = s.y - o.y, d = Math.hypot(dx, dy), m = s.r + o.r; if (d < m && d > 0.01) { s.x = o.x + dx / d * m; s.y = o.y + dy / d * m; } }
  s.x = clamp(s.x, 20 - SKIRT, WW + SKIRT - 20); s.y = clamp(s.y, 20 - SKIRT, WH + SKIRT - 20);
}
function vehCircles(v, out) { out.length = 0; const c = Math.cos(v.a), s = Math.sin(v.a); for (const [ox, oy, r] of v.T.circles) out.push([v.x + ox * c - oy * s, v.y + ox * s + oy * c, r]); return out; }
const _vc = [], _vc2 = [];
function vehicleCollide(v) {
  let hit = 0;
  for (let pass = 0; pass < 2; pass++) {
    vehCircles(v, _vc);
    for (const [cx, cy, r] of _vc) {
      const o = { x: cx, y: cy };
      for (const b of MAP.buildings) if (pushCircleRect(o, r, b)) { v.x += o.x - cx; v.y += o.y - cy; hit = 1; }
      for (const w of M.wrecks) { const o3 = { x: cx, y: cy }; if (pushOutWreck(o3, r, w)) { v.x += o3.x - cx; v.y += o3.y - cy; hit = 1; } }
      for (const w of MAP.water) { const o2 = { x: v.x + (cx - v.x), y: cy }; if (pushCircleRect(o2, r - 6, w)) { v.x += o2.x - cx; v.y += o2.y - cy; hit = 1; } }
    }
  }
  vehCircles(v, _vc);
  for (const [cx, cy, r] of _vc) {
    staticsNear(cx, cy, r + 14, _near);
    for (const s of _near) {
      const dx = cx - s.x, dy = cy - s.y, d = Math.hypot(dx, dy), m = r + s.r;
      if (d >= m || d < 0.01) continue;
      const sp = Math.abs(v.spd);
      const crush = v.type === 'tank' || (s.type === 'fence' && sp > 30) || ((s.type === 'bag' || s.type === 'hay') && sp > 110);
      if (crush) { destroyStatic(s); v.spd *= v.type === 'jeep' ? 0.82 : 0.96; }
      else { v.x += dx / d * (m - d); v.y += dy / d * (m - d); hit = 1; }
    }
  }
  for (const o of M.vehicles) {
    if (o === v || !o.active || o.dead) continue;
    if (Math.hypot(o.x - v.x, o.y - v.y) > 130) continue;
    vehCircles(v, _vc); vehCircles(o, _vc2);
    for (const [ax, ay, ar] of _vc) for (const [bx, by, br] of _vc2) {
      const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), m = ar + br;
      if (d < m && d > 0.01) {
        const push = m - d, wa = o.T.mass / (v.T.mass + o.T.mass), wb = 1 - wa;
        v.x -= dx / d * push * wa; v.y -= dy / d * push * wa;
        if (o.T.drive) { o.x += dx / d * push * wb; o.y += dy / d * push * wb; } else { v.x -= dx / d * push * wb; v.y -= dy / d * push * wb; }
        const rel = Math.hypot(v.vx - o.vx, v.vy - o.vy);
        if (rel > 70 && v.crashCd <= 0) { v.crashCd = 0.5; sfx('clang', v.x, v.y); const dm = (rel - 60) * 0.25; hurtVehicle(v, dm * Math.min(3, o.T.mass / v.T.mass), null); hurtVehicle(o, dm * (v.T.mass / Math.min(5, o.T.mass)), v.seats[0] && isEnemy(vehTeam(v), vehTeam(o)) ? v.seats[0] : null); }
        hit = 1;
      }
    }
  }
  const m = 30 - SKIRT; if (v.x < m) { v.x = m; hit = 1; } if (v.x > WW - m) { v.x = WW - m; hit = 1; } if (v.y < m) { v.y = m; hit = 1; } if (v.y > WH - m) { v.y = WH - m; hit = 1; }
  if (hit) { if (Math.abs(v.spd) > 120 && v.crashCd <= 0) { v.crashCd = 0.6; sfx('clang', v.x, v.y); if (v.type === 'jeep') hurtVehicle(v, (Math.abs(v.spd) - 110) * 0.2, null); } v.spd *= 0.6; }
}
function toLocal(v, x, y) { const dx = x - v.x, dy = y - v.y, c = Math.cos(-v.a), s = Math.sin(-v.a); return [dx * c - dy * s, dx * s + dy * c]; }
function toWorld(v, lx, ly) { const c = Math.cos(v.a), s = Math.sin(v.a); return [v.x + lx * c - ly * s, v.y + lx * s + ly * c]; }

/* ---------------- seats ---------------- */
function seatLocal(v, i) {
  const sd = v.T.seats[i];
  if (sd.pos === 'turret') { const r = v.ta - v.a, c = Math.cos(r), s = Math.sin(r); return [-4 + (-6) * c - (-9) * s, (-6) * s + (-9) * c]; }
  return sd.pos;
}
function enterCandidate(s) {
  let best = null;
  for (const v of M.vehicles) {
    if (!v.active || v.dead) continue;
    const vt = vehTeam(v);
    if (vt >= 0 && isEnemy(vt, s.team) && !(M.cfg.board && s.player)) continue;     // enemy boarding (players only) is a match option
    const [lx, ly] = toLocal(v, s.x, s.y);
    if (Math.abs(lx) > v.T.hl + 30 || Math.abs(ly) > v.T.hw + 30) continue;
    const order = v.T.seats.map((sd, i) => ({ i, d: Math.hypot(lx - sd.anchor[0], ly - sd.anchor[1]) })).sort((a, b) => a.d - b.d);
    if (!best || order[0].d < best.order[0].d) best = { v, order };
  }
  if (!best) return null;
  for (const o of best.order) {
    const occ = best.v.seats[o.i];
    if (!occ) return { v: best.v, seat: o.i, bump: null, want: best.order[0].i };
    if (s.player && !occ.player && !isEnemy(occ.team, s.team)) return { v: best.v, seat: o.i, bump: occ, want: best.order[0].i };
  }
  return { v: best.v, seat: -1, want: best.order[0].i };
}
function enterVehicle(s, c, instant) {
  const v = c.v; if (c.seat < 0) { if (s.player) s.msg = { t: 1.2, txt: 'VEHICLE FULL' }; return false; }
  if (c.bump) { const b = c.bump, free = v.seats.findIndex((o, i) => !o && i !== c.seat); if (free >= 0) moveSeat(b, free); else exitVehicle(b, true); }
  v.seats[c.seat] = s; s.veh = v; s.seat = c.seat; s.stance = 0; s.torch = false; s.swim = false;
  const [lx, ly] = toLocal(v, s.x, s.y); s.seatFrom = [lx, ly]; s.seatT = s.seatMax = instant ? 0.01 : 0.25;
  s.reloadT = 0; s.vx = s.vy = 0;
  sfx('door', v.x, v.y);
  return true;
}
function moveSeat(s, idx) {
  const v = s.veh; if (!v || idx === s.seat || idx < 0 || idx >= v.seats.length) return;
  const occ = v.seats[idx];
  if (occ && (occ.player || !s.player)) { if (s.player) s.msg = { t: 1, txt: 'SEAT TAKEN BY ' + occ.name }; return; }
  const old = s.seat, fromS = seatLocal(v, old).slice();
  if (occ) { const fromO = seatLocal(v, idx).slice(); v.seats[old] = occ; occ.seat = old; occ.seatFrom = fromO; occ.seatT = occ.seatMax = 0.5; }
  else v.seats[old] = null;
  v.seats[idx] = s; s.seat = idx; s.seatFrom = fromS; s.seatT = s.seatMax = 0.5;
  sfx('shuffle', v.x, v.y);
}
function leaveSeat(s) { const v = s.veh; if (v && v.seats[s.seat] === s) v.seats[s.seat] = null; s.veh = null; s.seat = -1; s.seatT = 0; }
function exitVehicle(s, forced) {
  const v = s.veh; if (!v) return;
  const order = [s.seat, ...v.T.seats.map((_, i) => i).filter(i => i !== s.seat)];
  const tries = [];
  for (const i of order) tries.push(v.T.seats[i].anchor);
  if (!v.T.drive) tries.push([-30, 20], [-30, -20], [0, 32], [0, -32]);
  for (const [ax, ay] of tries) {
    const [wx, wy] = toWorld(v, ax * 0.95, ay * 0.95);
    if (!solidAtExit(wx, wy, v)) { leaveSeat(s); s.x = wx; s.y = wy; s.vx = v.vx * 0.3; s.vy = v.vy * 0.3; s.a = v.T.drive ? s.a : v.mgA; sfx('door', v.x, v.y); return; }
  }
  if (forced) { leaveSeat(s); const [wx, wy] = toWorld(v, 0, v.T.hw + 14); s.x = wx; s.y = wy; }
  else if (s.player) s.msg = { t: 1, txt: 'NO ROOM TO EXIT' };
}
function solidAtExit(x, y, self) {
  if (x < 20 - SKIRT || y < 20 - SKIRT || x > WW + SKIRT - 20 || y > WH + SKIRT - 20) return true;
  for (const b of MAP.buildings) if (inRect(x, y, b, 8)) return true;
  for (const v of M.vehicles) if (v !== self && v.active && !v.dead) { const [lx, ly] = toLocal(v, x, y); if (Math.abs(lx) < v.T.hl + 6 && Math.abs(ly) < v.T.hw + 6) return true; }
  staticsNear(x, y, 20, _near); for (const s of _near) if (Math.hypot(s.x - x, s.y - y) < s.r + 6) return true;
  return false;
}

/* ---------------- weapons ---------------- */
function muzzle(s, dist) { return [s.x + Math.cos(s.a) * dist, s.y + Math.sin(s.a) * dist]; }
function gunTip(s) {
  const T_ = EXTRA.tips || {}; let o;
  if (s.veh) o = [14, 0];
  else if (s.stance === 2 && !newSet()) o = T_.walk || [24, 0];
  else { const rocket = s.w && WPN[cw(s).id].rocket, set = CFG.soldiers;
    if (set !== 'classic') o = T_['n_' + (rocket ? 'rpg' : 'stand')] || [17, 0];
    else o = rocket ? [24, 5] : (T_.stand || [22, 0]); }
  const c = Math.cos(s.a), sn = Math.sin(s.a);
  return [s.x + c * o[0] - sn * o[1], s.y + sn * o[0] + c * o[1]];
}
function fireWeapon(s) {
  const st = cw(s), W_ = WPN[st.id];
  if (W_.rocket) { fireRocket(s, st); return; }
  const [x, y] = gunTip(s);
  // accuracy: stance, movement speed, aiming down sights, and sustained-fire bloom
  const sp_ = Math.hypot(s.vx, s.vy);
  const sm = [1, 0.7, 0.45][s.stance] * (1 + clamp(sp_ / 82, 0, 1.6) * 1.3) * (s.ads ? 0.5 : 1) * (1 + s.bloom * 1.6);
  s.bloom = Math.min(1, s.bloom + (W_.rate < 0.15 ? 0.11 : 0.3));
  const n = W_.pel || 1;
  for (let i = 0; i < n; i++) {
    const a = s.a + rnd(-W_.spread, W_.spread) * sm;
    const sp = W_.spd * (W_.pel ? rnd(0.85, 1.1) : 1);
    M.proj.push({ k: 'bullet', x, y, ox: x, oy: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: W_.life * (W_.pel ? rnd(0.8, 1.1) : 1), src: s, team: s.team, dmg: W_.dmg, vdmg: W_.vdmg, low: s.stance >= 1, heavy: W_.dmg >= 40, wname: W_.s, whiz: false });
  }
  st.mag--; s.flash = 0.05; s.fireCd = W_.rate; s.firedT = 1.2; s.shotN = (s.shotN || 0) + 1;
  shotFx(s, W_, x, y);
}
function shotFx(s, W_, x, y) {
  sfx(W_.snd, x, y);
  part({ k: 'shell', x: s.x, y: s.y, vx: Math.cos(s.a + 1.6) * rnd(40, 80), vy: Math.sin(s.a + 1.6) * rnd(40, 80), life: 0.4, max: 0.4, sz: 1.5, rot: rnd(0, 3), vr: 20, drag: 4 });
  if (W_.dmg >= 90) for (const vw of M.views) if (vw.p === s.player) vw.shake = Math.min(18, vw.shake + 3);
}
function fireRocket(s, st) {
  const [x, y] = gunTip(s);
  M.proj.push({ k: 'rocket', x, y, vx: Math.cos(s.a) * 480, vy: Math.sin(s.a) * 480, life: 1.5, src: s, team: s.team, a: s.a, wname: 'RPG' });
  st.mag--; s.fireCd = 0.5; s.flash = 0.1; s.firedT = 1.5; s.shotN = (s.shotN || 0) + 1; rocketFx(s, x, y);
}
function rocketFx(s, x, y) {
  sfx('rocket', x, y);
  for (let i = 0; i < 6; i++) part({ k: 'smoke', x: s.x - Math.cos(s.a) * 14, y: s.y - Math.sin(s.a) * 14, vx: -Math.cos(s.a) * rnd(40, 120) + rnd(-30, 30), vy: -Math.sin(s.a) * rnd(40, 120) + rnd(-30, 30), life: 0.8, max: 0.8, sz: 10, drag: 3 });
}
function startReload(s) {
  const st = cw(s), W_ = WPN[st.id];
  if (s.reloadT > 0 || st.mag >= W_.mag || st.res <= 0) return;
  s.reloadT = W_.rel; s.reloadMax = W_.rel; s.reloadW = s.wi; sfx('reload', s.x, s.y, 0.6);
}
/* throws the selected throwable (frag or smoke), falling back to whatever is left */
function canThrow(s) { return s.nades > 0 || s.smokes > 0; }
function throwNade(s, dist, forceFrag) {
  let smoke = !forceFrag && s.throwSel === 1 && s.smokes > 0; if (!smoke && s.nades <= 0) { if (s.smokes > 0 && !forceFrag) smoke = true; else return; }
  const [x, y] = muzzle(s, 10); dist = clamp(dist, 60, 300);
  const sp = dist / 0.75;
  M.proj.push({ k: 'nade', smoke, x, y, vx: Math.cos(s.a) * sp, vy: Math.sin(s.a) * sp, life: smoke ? 1.4 : 1.7, src: s, team: s.team, h: 0, vh: 260, rot: 0 });
  if (smoke) s.smokes--; else s.nades--;
  s.nadeCd = 0.8; s.throwT = 0.35; s.thrownSmoke = smoke; sfx('throw', x, y);
}
/* smoke screens: grow, linger, fade; they block sight lines for bots and spotting */
function popSmoke(x, y) { netEv('sm', x | 0, y | 0); const puffs = []; for (let i = 0; i < 18; i++) { const a = rnd(0, TAU), d = i ? Math.sqrt(Math.random()) * 0.72 : 0; puffs.push([Math.cos(a) * d, Math.sin(a) * d, rint(0, 3), rnd(0, TAU), rnd(0.8, 1.2)]); } M.smokes.push({ x, y, r: 0, R: 92, t: 0, T: 18, puffs }); sfx('splash', x, y, 0.5); for (let i = 0; i < 8; i++) part({ k: 'smoke', x, y, vx: rnd(-60, 60), vy: rnd(-60, 60), life: 1.2, max: 1.2, sz: 12, drag: 2 }); }
function updateSmokes(dt) { for (const c of M.smokes) { c.t += dt; c.r = c.R * Math.min(1, c.t / 1.6); } prune(M.smokes, c => c.t < c.T); }
function smokeBlocks(x0, y0, x1, y1) {
  for (const c of M.smokes) {
    if (c.t > c.T - 2.5 || c.r < 24) continue;
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, k = clamp(((c.x - x0) * dx + (c.y - y0) * dy) / L2, 0, 1);
    if (Math.hypot(x0 + dx * k - c.x, y0 + dy * k - c.y) < c.r * 0.5) return true;
  }
  return false;
}
function fireCannon(v, s) {
  const c = Math.cos(v.ta), sn = Math.sin(v.ta), px = v.x - 4 * Math.cos(v.a), py = v.y - 4 * Math.sin(v.a);
  const x = px + c * 96, y = py + sn * 96;
  M.proj.push({ k: 'shell', x, y, vx: c * 760, vy: sn * 760, life: 1.1, src: s, team: s.team, wname: 'CANNON' });
  v.cd = 2.3; v.recoil = 1; v.spd -= 14; s.firedT = 2; v.cN = (v.cN || 0) + 1;
  cannonFx(v, x, y, s);
}
function cannonFx(v, x, y, s) {
  sfx('cannon', x, y);
  part({ k: 'flash', x, y, vx: 0, vy: 0, life: 0.1, max: 0.1, sz: 90, drag: 0 });
  for (let i = 0; i < 10; i++) { const a = v.ta + rnd(-0.5, 0.5); part({ k: 'smoke', x, y, vx: Math.cos(a) * rnd(40, 160), vy: Math.sin(a) * rnd(40, 160), life: rnd(0.6, 1.2), max: 1.2, sz: rnd(10, 20), drag: 3 }); }
  for (let i = 0; i < 8; i++) { const a = v.ta + rnd(-2.6, 2.6) + Math.PI; part({ k: 'dust', x: v.x, y: v.y, vx: Math.cos(a) * rnd(60, 140), vy: Math.sin(a) * rnd(60, 140), life: 0.7, max: 0.7, sz: rnd(14, 22), drag: 3 }); }
  for (const vw of M.views) { const d = Math.hypot(vw.cam.x - x, vw.cam.y - y); vw.shake = Math.min(18, vw.shake + 5 * Math.max(0, 1 - d / 500)); }
  if (s && s.player) rumble(s.player, 0.6, 0.2);
}
function mgPos(v) {
  if (v.type === 'tank') { const [lx, ly] = seatLocal(v, 1); return toWorld(v, lx, ly); }
  if (v.type === 'nest') return toWorld(v, 2, 0);
  return toWorld(v, -27, 0);
}
function fireMG(v, s) {
  if (v.over > 0) return;
  const [px, py] = mgPos(v), a = v.mgA + rnd(-0.05, 0.05), x = px + Math.cos(v.mgA) * 22, y = py + Math.sin(v.mgA) * 22;
  M.proj.push({ k: 'bullet', mg: true, x, y, ox: x, oy: y, vx: Math.cos(a) * 1150, vy: Math.sin(a) * 1150, life: 0.6, src: s, team: s.team, dmg: v.type === 'nest' ? 20 : 15, vdmg: 6, low: false, wname: 'MG' });
  v.mgCd = v.type === 'nest' ? 0.07 : 0.075; v.heat += v.type === 'nest' ? 0.035 : 0.05; v.mgFlash = 0.04; s.firedT = 1.2; v.mN = (v.mN || 0) + 1;
  if (v.heat >= 1) { v.over = 1.6; sfx('heat', x, y); if (s.player) s.msg = { t: 1.2, txt: 'MG OVERHEATED' }; }
  mgFx(v, px, py, x, y);
}
function mgFx(v, px, py, x, y) {
  sfx('mg', x, y);
  part({ k: 'shell', x: px, y: py, vx: Math.cos(v.mgA + 1.6) * rnd(40, 90), vy: Math.sin(v.mgA + 1.6) * rnd(40, 90), life: 0.4, max: 0.4, sz: 1.5, rot: rnd(0, 3), vr: 20, drag: 4 });
}
/* gadgets */
function useGadget(s, I, dt) {
  const K = KITS[s.kit];
  s.torch = false;
  if (K.g === 'torch') {
    if (!I.gadget) return;
    let best = null, bd = 1e9;
    for (const v of M.vehicles) { if (!v.active || v.dead || v.hp >= v.T.hp) continue; const vt = vehTeam(v); if (isEnemy(vt, s.team)) continue; const [lx, ly] = toLocal(v, s.x, s.y); if (Math.abs(lx) < v.T.hl + 26 && Math.abs(ly) < v.T.hw + 26) { const d = Math.hypot(v.x - s.x, v.y - s.y); if (d < bd) { bd = d; best = v; } } }
    if (best) {
      s.torch = true; s.a = Math.atan2(best.y - s.y, best.x - s.x);
      const amt = Math.min(best.T.hp - best.hp, (best.type === 'tank' ? 110 : 70) * dt); best.hp += amt; s.rep += amt;
      s.repAcc = (s.repAcc || 0) + amt; if (s.repAcc >= 50) { s.repAcc -= 50; addPts(s, 10, 'REPAIR'); }
      sfx('torch', s.x, s.y); const [tx, ty] = muzzle(s, 16);
      if (Math.random() < 0.8) part({ k: 'spark', x: tx, y: ty, vx: rnd(-140, 140), vy: rnd(-140, 140), life: 0.15, max: 0.15, sz: 1.4, drag: 6 });
      if (best.hp > best.T.hp * 0.25) best.burn = 0;
    } else if (I.gadgetP && s.player) s.msg = { t: 1, txt: 'NOTHING TO REPAIR HERE' };
    return;
  }
  if (!I.gadgetP || s.gcd > 0) return;
  if (K.g === 'medbag') { M.items.push({ k: 'med', x: s.x + Math.cos(s.a) * 12, y: s.y + Math.sin(s.a) * 12, t: 12, team: s.team, owner: s }); s.gcd = s.gmax = 16; s.handT = 0.45; s.handK = 'medbag'; sfx('drop', s.x, s.y); }
  if (K.g === 'ammo') { M.items.push({ k: 'ammo', x: s.x + Math.cos(s.a) * 12, y: s.y + Math.sin(s.a) * 12, t: 15, team: s.team, owner: s, given: new Map() }); s.gcd = s.gmax = 18; s.handT = 0.45; s.handK = 'ammo'; sfx('drop', s.x, s.y); }
  if (K.g === 'mine') {
    if (s.mines <= 0) { if (s.player) s.msg = { t: 1, txt: 'OUT OF MINES' }; return; }
    const mine = M.items.filter(i => i.k === 'mine' && i.owner === s); if (mine.length >= 3) mine[0].t = -1;
    M.items.push({ k: 'mine', x: s.x + Math.cos(s.a) * 14, y: s.y + Math.sin(s.a) * 14, t: 9999, team: s.team, owner: s, arm: 1.2 }); s.mines--; s.gcd = s.gmax = 1; s.handT = 0.45; s.handK = 'mine'; sfx('beep', s.x, s.y);
  }
}
function updateItems(dt) {
  for (const it of M.items) {
    it.t -= dt;
    if (it.k === 'med') {
      for (const s of M.sol) if (s.alive && !s.veh && s.team === it.team && s.hp < 100 && Math.hypot(s.x - it.x, s.y - it.y) < 58) { const h = Math.min(100 - s.hp, 14 * dt); s.hp += h; if (it.owner && it.owner !== s) { it.owner.heal += h; it.acc = (it.acc || 0) + h; if (it.acc >= 25) { it.acc -= 25; addPts(it.owner, 10, 'HEAL'); } } if (s.player) psfx(s.player, 'heal'); }
    } else if (it.k === 'ammo') {
      for (const s of M.sol) {
        if (!s.alive || s.veh || s.team !== it.team || Math.hypot(s.x - it.x, s.y - it.y) > 58) continue;
        const last = it.given.get(s.id) || -9; if (M.time - last < 2) continue;
        let gave = false;
        for (const w of s.w) { const W_ = WPN[w.id]; const add = Math.ceil(W_.res * 0.35); if (w.res < W_.res) { w.res = Math.min(W_.res, w.res + add); gave = true; } }
        if (s.nades < KITS[s.kit].nades) { s.nades++; gave = true; } else if (s.smokes < 2) { s.smokes++; gave = true; }
        if (KITS[s.kit].g === 'mine' && s.mines < 2) { s.mines++; gave = true; }
        if (gave) { it.given.set(s.id, M.time); if (it.owner && it.owner !== s) addPts(it.owner, 10, 'RESUPPLY'); if (s.player) psfx(s.player, 'pickup'); }
      }
    } else if (it.k === 'mine') {
      if (it.arm > 0) { it.arm -= dt; continue; }
      if (it.boom) { it.t = -1; explosion(it.x, it.y, 70, 140, 0, it.owner, it.team, true, 'mine'); for (const v of M.vehicles) if (v.active && !v.dead && Math.hypot(v.x - it.x, v.y - it.y) < 70) hurtVehicle(v, 460, it.owner); continue; }
      for (const v of M.vehicles) {
        if (!v.active || v.dead || !v.T.drive) continue; const vt = vehTeam(v); if (!isEnemy(vt, it.team)) continue;
        vehCircles(v, _vc); if (_vc.some(([cx, cy, r]) => Math.hypot(cx - it.x, cy - it.y) < r + 6)) { it.boom = true; sfx('beep', it.x, it.y); }
      }
    } else if (it.k === 'pouch') {
      for (const s of M.sol) if (s.alive && !s.veh && Math.hypot(s.x - it.x, s.y - it.y) < 16) { for (const w of s.w) w.res = Math.min(WPN[w.id].res, w.res + Math.ceil(WPN[w.id].res * 0.25)); if (s.nades < KITS[s.kit].nades) s.nades++; it.t = -1; if (s.player) { psfx(s.player, 'pickup'); s.msg = { t: 1.2, txt: 'AMMO POUCH' }; } break; }
    }
  }
  prune(M.items, it => it.t > 0);
}

/* segment tests */
function segRect(x0, y0, x1, y1, b, pad) {
  const l = b.x - pad, r = b.x + b.w + pad, t = b.y - pad, bt = b.y + b.h + pad, dx = x1 - x0, dy = y1 - y0;
  let t0 = 0, t1 = 1;
  for (const [p, d, mn, mx] of [[x0, dx, l, r], [y0, dy, t, bt]]) {
    if (Math.abs(d) < 1e-9) { if (p < mn || p > mx) return -1; continue; }
    let a = (mn - p) / d, c = (mx - p) / d; if (a > c) { const q = a; a = c; c = q; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return -1;
  }
  return t0;
}
function segCirc(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0, fx = x0 - cx, fy = y0 - cy, a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0; if (a < 1e-9) return -1; const det = b * b - 4 * a * c; if (det < 0) return -1;
  const t = (-b - Math.sqrt(det)) / (2 * a); return t >= 0 && t <= 1 ? t : -1;
}
function los(x0, y0, x1, y1) {
  for (const b of MAP.buildings) if (segRect(x0, y0, x1, y1, b, 0) >= 0) return false;
  for (const w of M.wrecks) if (segWreck(x0, y0, x1, y1, w) >= 0) return false;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, r = Math.hypot(x1 - x0, y1 - y0) / 2 + 20;
  staticsNear(mx, my, r, _near);
  for (const s of _near) if ((s.type === 'tree' || s.type === 'hay') && segCirc(x0, y0, x1, y1, s.x, s.y, s.type === 'hay' ? 12 : 9) >= 0) return false;
  return true;
}
/* sandbags only stop bullets for crouched or prone soldiers: standing fire passes over the bags */
let PRONE = [];
function bagBlocks(p, s) {
  if (Math.hypot(s.x - p.ox, s.y - p.oy) < 30) return false;     // shooting over your own cover
  if (p.low) return true;
  for (const o of PRONE) if (Math.abs(o.x - s.x) < 30 && Math.abs(o.y - s.y) < 30) return true;
  return false;
}
function updateProjectiles(dt) {
  PRONE = M.sol.filter(s => s.alive && s.stance >= 1 && !s.veh);
  for (const p of M.proj) {
    if (p.k === 'nade') { updateNade(p, dt); continue; }
    const x0 = p.x, y0 = p.y, x1 = x0 + p.vx * dt, y1 = y0 + p.vy * dt;
    let bt = 2, hit = null;
    for (const b of MAP.buildings) { const t = segRect(x0, y0, x1, y1, b, 0); if (t >= 0 && t < bt) { bt = t; hit = { k: 'wall' }; } }
    for (const w of M.wrecks) { const t = segWreck(x0, y0, x1, y1, w); if (t >= 0 && t < bt) { bt = t; hit = { k: 'wall' }; } }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    staticsNear(mx, my, Math.hypot(x1 - x0, y1 - y0) / 2 + 14, _near);
    for (const s of _near) {
      if (s.type === 'fence') continue;
      if (s.type === 'bag' && p.k === 'bullet' && !bagBlocks(p, s)) continue;
      const t = segCirc(x0, y0, x1, y1, s.x, s.y, s.type === 'tree' ? 9 : s.type === 'hay' ? 12 : s.r); if (t >= 0 && t < bt) { bt = t; hit = { k: 'static', s }; }
    }
    for (const s of M.sol) {
      if (!s.alive || s === p.src || !canHurt(p.src, s) || (p.src && s.team === p.src.team && !M.ff)) continue;
      if (s.veh && !s.veh.T.seats[s.seat].exposed) continue;
      const rad = s.veh ? 7 : s.swim ? 6 : [9, 6.5, 4.5][s.stance];
      const t = segCirc(x0, y0, x1, y1, s.x, s.y, rad); if (t >= 0 && t < bt) { bt = t; hit = { k: 'sol', s }; }
      else if (s.player && !p.whiz && p.k === 'bullet' && segCirc(x0, y0, x1, y1, s.x, s.y, 30) >= 0) { p.whiz = true; psfx(s.player, 'whiz'); }
    }
    for (const v of M.vehicles) {
      if (!v.active || v.dead) continue; const vt = vehTeam(v); if (vt >= 0 && p.src && vt === p.src.team && !M.ff) continue;
      if (p.src && p.src.veh === v) continue;
      if (Math.abs(v.x - mx) > 140 || Math.abs(v.y - my) > 140) continue;
      const [ax, ay] = toLocal(v, x0, y0), [bx, by] = toLocal(v, x1, y1);
      const t = segRect(ax, ay, bx, by, { x: -v.T.hl, y: -v.T.hw, w: v.T.hl * 2, h: v.T.hw * 2 }, 0);
      if (t >= 0 && t < bt) { bt = t; hit = { k: 'veh', v }; }
    }
    if ((p.k === 'rocket' || p.k === 'shell') && Math.random() < 0.8) part({ k: 'smoke', x: p.x, y: p.y, vx: rnd(-10, 10), vy: rnd(-10, 10), life: 0.6, max: 0.6, sz: p.k === 'rocket' ? 7 : 5, drag: 2 });
    if (hit) {
      const hx = lerp(x0, x1, bt), hy = lerp(y0, y1, bt);
      p.life = 0;
      if (p.k === 'shell') { explosion(hx, hy, 78, 180, 0, p.src, p.team, true); if (hit.k === 'veh') hurtVehicle(hit.v, hit.v.type === 'tank' ? 210 : 300, p.src); if (hit.k === 'sol') hurtSoldier(hit.s, 200, p.src, 'explosion', p.vx, p.vy, 'CANNON'); continue; }
      if (p.k === 'rocket') { explosion(hx, hy, 62, 110, 0, p.src, p.team, false); if (hit.k === 'veh') hurtVehicle(hit.v, hit.v.type === 'tank' ? 230 : 280, p.src); if (hit.k === 'sol') hurtSoldier(hit.s, 120, p.src, 'explosion', p.vx, p.vy, 'RPG'); continue; }
      if (hit.k === 'sol') hurtSoldier(hit.s, p.dmg, p.src, p.mg ? 'mg' : 'bullet', p.vx, p.vy, p.wname);
      else if (hit.k === 'veh') {
        const v = hit.v; let victim = null;
        for (const o of v.seats) if (o && v.T.seats[o.seat].exposed && canHurt(p.src, o) && Math.hypot(o.x - hx, o.y - hy) < 13) victim = o;
        if (victim && Math.random() < 0.6) hurtSoldier(victim, p.dmg, p.src, p.mg ? 'mg' : 'bullet', p.vx, p.vy, p.wname);
        else { hurtVehicle(v, v.type === 'tank' ? p.vdmg * 0.2 : p.vdmg, p.src); sfx('ting', hx, hy); sparks(hx, hy, 3); }
      } else { sparks(hx, hy, 2); if (hit.k === 'static' && hit.s.type === 'bag') part({ k: 'dirt', x: hx, y: hy, vx: -p.vx * 0.05 + rnd(-20, 20), vy: -p.vy * 0.05 + rnd(-20, 20), life: 0.3, max: 0.3, sz: 2, drag: 4 }); }
      continue;
    }
    p.x = x1; p.y = y1; p.life -= dt;
    if (p.x < -SKIRT || p.y < -SKIRT || p.x > WW + SKIRT || p.y > WH + SKIRT) p.life = 0;
    if (p.life <= 0 && (p.k === 'rocket' || p.k === 'shell')) explosion(p.x, p.y, p.k === 'shell' ? 78 : 62, p.k === 'shell' ? 180 : 110, p.k === 'shell' ? 60 : 50, p.src, p.team, p.k === 'shell');
    if (p.life <= 0 && p.k === 'bullet' && inWater(p.x, p.y)) part({ k: 'steam', x: p.x, y: p.y, vx: 0, vy: 0, life: 0.4, max: 0.4, sz: 4, drag: 0 });
  }
  prune(M.proj, p => p.life > 0);
}
function sparks(x, y, n) { for (let i = 0; i < n; i++) { const a = rnd(0, TAU), s = rnd(60, 200); part({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.08, 0.2), max: 0.2, sz: 1.5, drag: 6 }); } }
function updateNade(p, dt) {
  p.vh -= 700 * dt; p.h = Math.max(0, p.h + p.vh * dt); if (p.h === 0 && p.vh < 0) { p.vh = -p.vh * 0.35; if (Math.abs(p.vh) > 40) sfx('clink', p.x, p.y); p.vx *= 0.6; p.vy *= 0.6; }
  const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
  let bounced = false;
  for (const b of MAP.buildings) if (inRect(nx, ny, b, 3)) { if (p.x < b.x - 2 || p.x > b.x + b.w + 2) p.vx *= -0.5; else p.vy *= -0.5; bounced = true; }
  if (p.h < 14) { staticsNear(nx, ny, 16, _near); for (const s of _near) if (s.type !== 'fence' && Math.hypot(nx - s.x, ny - s.y) < s.r + 3) { const dx = nx - s.x, dy = ny - s.y, d = Math.hypot(dx, dy) || 1, dot = (p.vx * dx + p.vy * dy) / d; p.vx -= 1.6 * dot * dx / d; p.vy -= 1.6 * dot * dy / d; bounced = true; } }
  if (bounced) sfx('clink', p.x, p.y); else { p.x = nx; p.y = ny; }
  p.x = clamp(p.x, 10 - SKIRT, WW + SKIRT - 10); p.y = clamp(p.y, 10 - SKIRT, WH + SKIRT - 10);
  if (p.h === 0) { p.vx *= Math.exp(-dt * 3); p.vy *= Math.exp(-dt * 3); }
  p.rot += dt * 12; p.life -= dt;
  if (p.life <= 0) { if (p.smoke) popSmoke(p.x, p.y); else explosion(p.x, p.y, 88, 150, 90, p.src, p.team, false); }
}

/* ---------------- soldier control ---------------- */
function controlSoldier(s, I, dt) {
  s.flash -= dt; s.fireCd -= dt; s.nadeCd -= dt; s.protect -= dt; s.hurtT -= dt; s.hitT -= dt; s.stanceT -= dt; s.gcd -= dt; s.firedT -= dt; s.spotT -= dt; s.meleeCd -= dt; s.meleeT -= dt; s.spotCd -= dt; s.handT = (s.handT || 0) - dt;
  s.bloom = Math.max(0, s.bloom - dt * 1.8);
  if (s.msg) { s.msg.t -= dt; if (s.msg.t <= 0) s.msg = null; }
  for (const p of s.pops) p.t -= dt; prune(s.pops, p => p.t > 0);
  if (I.aimA !== null && I.aimA !== undefined) {
    if (s.stance === 2 && !s.veh) s.a += clamp(angDiff(s.a, I.aimA), -4 * dt, 4 * dt); else s.a = I.aimA;
  }
  if (M.time - s.lastHurt > 5 && s.hp < 100) s.hp = Math.min(100, s.hp + 9 * dt);
  if (s.reloadT > 0) { s.reloadT -= dt; if (s.reloadW !== s.wi) s.reloadT = 0; else if (s.reloadT <= 0) { const st = cw(s), need = WPN[st.id].mag - st.mag, take = Math.min(need, st.res); st.mag += take; st.res -= take; } }
  if (s.veh) { controlSeated(s, I, dt); return; }
  s.swim = inWater(s.x, s.y);
  if (s.swim) s.stance = 0;
  s.throwT -= dt;
  const swapTo = i => { if (i === s.wi || s.swim) return; s.wi = i; s.reloadT = 0; s.fireCd = Math.max(s.fireCd, 0.3); sfx('reload', s.x, s.y, 0.3); };
  if (I.swapW) swapTo(1 - s.wi);
  if (I.pickW !== undefined && I.pickW >= 0) swapTo(I.pickW);
  if (I.enter) { const c = enterCandidate(s); if (c && enterVehicle(s, c)) return; if (!c && I.interactSwap) swapTo(1 - s.wi); }
  // melee
  if (I.melee && s.meleeCd <= 0 && !s.swim) {
    s.meleeCd = 0.7; s.meleeT = 0.18; sfx('knife', s.x, s.y); s.vx += Math.cos(s.a) * 90; s.vy += Math.sin(s.a) * 90;
    for (const o of M.sol) { if (!o.alive || o === s || o.veh || !canHurt(s, o) || o.team === s.team && !M.ff) continue; const dx = o.x - s.x, dy = o.y - s.y; if (Math.hypot(dx, dy) < 28 && Math.abs(angDiff(s.a, Math.atan2(dy, dx))) < 1.0) { o.protect = 0; hurtSoldier(o, 100, s, 'knife', dx, dy, 'KNIFE'); sfx('thud', o.x, o.y); break; } }
  }
  // spotting: mark enemies in front of you for the whole team
  if (I.spot && s.spotCd <= 0) {
    s.spotCd = 2.5; let n = 0;
    for (const o of M.sol) { if (!o.alive || !isEnemy(s.team, o.team)) continue; const dx = o.x - s.x, dy = o.y - s.y, d = Math.hypot(dx, dy); if (d < 760 && Math.abs(angDiff(s.a, Math.atan2(dy, dx))) < 0.4 && los(s.x, s.y, o.x, o.y)) { o.spotT = 6; o.spotTeam = s.team; n++; } }
    if (s.player) { psfx(s.player, 'ping'); s.msg = { t: 1, txt: n ? `SPOTTED ${n}` : 'NOTHING SPOTTED' }; }
  }
  // jump / vault over low cover
  if (I.jump && s.jumpT <= 0 && !s.swim) {
    let dx = I.mx, dy = I.my; const l = Math.hypot(dx, dy); if (l < 0.2) { dx = Math.cos(s.a); dy = Math.sin(s.a); } else { dx /= l; dy /= l; }
    s.jumpT = 0.42; s.jdx = dx; s.jdy = dy; s.stance = 0; sfx('jump', s.x, s.y);
  }
  if (!s.swim) {
    // two stances only: standing and prone
    if (I.crouch || I.proneT) { s.stance = s.stance === 2 ? 0 : 2; s.stanceT = 0.3; sfx('rustle', s.x, s.y); }
    if (I.stanceCycle) { s.stance = s.stance === 2 ? 0 : 2; s.stanceT = 0.25; sfx('rustle', s.x, s.y); }
  }
  let mx = I.mx, my = I.my; const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
  if (I.sprint && m > 0.3 && s.stance) { s.stance = 0; s.stanceT = 0.2; }
  const sprint = I.sprint && m > 0.3 && !I.fire && s.stance === 0 && !s.swim;
  s.ads = !!I.ads && !sprint && !s.swim;
  if (I.netPos) netAuthMove(s, I.netPos, dt);        // an online joiner moves themselves; the host checks it
  else {
  const ice = onIce(s.x, s.y);
  const spd = (s.swim ? 40 : s.stance === 2 ? 34 : s.stance === 1 ? 52 : sprint ? 128 : s.torch ? 30 : 82) * (s.ads ? 0.6 : 1), k = 1 - Math.exp(-dt * (ice ? 3 : 14));
  s.vx = lerp(s.vx, mx * spd, k); s.vy = lerp(s.vy, my * spd, k);
  if (s.jumpT > 0) {
    s.jumpT -= dt; const along = s.vx * s.jdx + s.vy * s.jdy; if (along < 110) { s.vx += s.jdx * (110 - along); s.vy += s.jdy * (110 - along); }
    // don't land on top of a sandbag or fence: carry on until clear
    if (s.jumpT <= 0.04) { staticsNear(s.x, s.y, 20, _near); if (_near.some(o => LOW[o.type] && Math.hypot(o.x - s.x, o.y - s.y) < o.r + s.r) && s.jumpT > -0.4) s.jumpT = 0.05; else if (s.jumpT <= 0) { s.jumpT = 0; for (let i = 0; i < 3; i++) part({ k: 'dust', x: s.x, y: s.y, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 0.5, max: 0.5, sz: 6, drag: 3 }); } }
  }
  s.x += s.vx * dt; s.y += s.vy * dt;
  soldierCollide(s);
  }
  const v = Math.hypot(s.vx, s.vy); s.moving = v > (s.stance === 2 ? 6 : 18); s.walkT += v * dt;
  // footprints that fade over a couple of minutes
  if (s.moving && !s.swim && s.jumpT <= 0) { s.stepAcc += v * dt; if (s.stepAcc > (s.stance === 2 ? 10 : 9)) { s.stepAcc = 0; s.stepSide = -s.stepSide; footprint(s.x, s.y, Math.atan2(s.vy, s.vx), s.stance === 2 ? 0 : s.stepSide, s.stance === 2); } }
  if (s.stance === 2 && s.moving && (I.aimA === null || I.aimA === undefined)) s.a += clamp(angDiff(s.a, Math.atan2(s.vy, s.vx)), -4 * dt, 4 * dt);
  if (sprint && (I.aimA === null || I.aimA === undefined)) s.a = Math.atan2(s.vy, s.vx);
  if (s.stance >= 1 && s.moving && Math.random() < dt * (s.stance === 2 ? 3 : 1.5)) sfx('rustle', s.x, s.y, 0.5);
  if (s.swim && s.moving && Math.random() < dt * 4) { sfx('splash', s.x, s.y, 0.5); part({ k: 'ripple', x: s.x, y: s.y, vx: 0, vy: 0, life: 0.9, max: 0.9, sz: 14, drag: 0 }); }
  if (s.swim) return;
  useGadget(s, I, dt);
  const st = cw(s);
  if (I.reload || (st.mag === 0 && st.res > 0 && s.reloadT <= 0)) startReload(s);
  if (I.fire && !sprint && !s.torch && s.fireCd <= 0 && s.stanceT <= 0) {
    if (s.reloadT <= 0) { if (st.mag > 0) fireWeapon(s); else { sfx('empty', s.x, s.y); s.fireCd = 0.25; if (st.res <= 0 && s.w[1 - s.wi].mag + s.w[1 - s.wi].res > 0) { s.wi = 1 - s.wi; } } }
  }
  if (I.nadeCyc && s.smokes + s.nades > 0) { s.throwSel = 1 - s.throwSel; sfx('ui'); }
  if (I.alt && canThrow(s) && s.nadeCd <= 0) throwNade(s, I.altDist || 240, !!s.bot);
  for (const c of M.crates) if (c.live && Math.hypot(c.x - s.x, c.y - s.y) < 16) pickupCrate(s, c);
}
function pickupCrate(s, c) {
  c.live = false; c.t = 24;
  const r = Math.random(); let txt;
  if (s.hp < 60 && r < 0.6) { s.hp = 100; txt = 'MEDKIT'; }
  else if (r < 0.45) { for (const w of s.w) { w.res = WPN[w.id].res; } txt = 'FULL AMMO'; }
  else if (r < 0.75) { s.nades = Math.min(5, s.nades + 2); txt = 'GRENADES +2'; }
  else { s.hp = Math.min(100, s.hp + 40); for (const w of s.w) w.res = Math.min(WPN[w.id].res, w.res + Math.ceil(WPN[w.id].res / 2)); txt = 'FIELD KIT'; }
  if (s.player) { s.msg = { t: 1.8, txt }; psfx(s.player, 'pickup'); }
}
function controlSeated(s, I, dt) {
  const v = s.veh, sd = v.T.seats[s.seat];
  if (I.enter && s.seatT <= 0) { exitVehicle(s); return; }
  if (s.seatT > 0) { s.seatT -= dt; return; }
  if (I.seatIdx >= 0) moveSeat(s, I.seatIdx);
  else if (I.seatDir >= 0) moveSeat(s, v.T.dpad[I.seatDir]);
  else if (I.seatNext) { for (let k = 1; k < v.seats.length; k++) { const i = (s.seat + k) % v.seats.length, o = v.seats[i]; if (!o || (s.player && !o.player)) { moveSeat(s, i); break; } } }
  if (s.seatT > 0) return;
  if (sd.role === 'drive') {
    v.ctl = { mx: I.mx, my: I.my };
    if (v.type === 'tank') {
      v.aimT = I.aimA === null ? undefined : I.aimA;     // no aim input: the turret rides with the hull
      if (I.fire && v.cd <= 0 && (v.aimT === undefined || Math.abs(angDiff(v.ta, v.aimT)) < 0.35)) fireCannon(v, s);
    } else if (I.fire) sfx('horn', v.x, v.y);
  } else if (sd.role === 'mg') {
    v.mgAim = I.aimA === null ? undefined : I.aimA;
    s.a = v.mgA;
    if (I.fire && v.mgCd <= 0) fireMG(v, s);
  } else {
    const st = cw(s);
    if (WPN[st.id].rocket && s.w[0]) { s.wi = 0; }
    if (I.swapW) { s.wi = 1 - s.wi; if (WPN[cw(s).id].rocket) s.wi = 0; }
    if (I.reload || (cw(s).mag === 0 && cw(s).res > 0)) startReload(s);
    if (I.fire && s.fireCd <= 0 && s.reloadT <= 0) { if (cw(s).mag > 0) fireWeapon(s); else { sfx('empty', s.x, s.y); s.fireCd = 0.25; } }
    if (I.alt && canThrow(s) && s.nadeCd <= 0) throwNade(s, I.altDist || 220, !!s.bot);
  }
}
function updateSeatedPos(s) {
  const v = s.veh, to = seatLocal(v, s.seat);
  let lx = to[0], ly = to[1];
  if (s.seatT > 0 && s.seatFrom) { const k = 1 - s.seatT / s.seatMax, e = k * k * (3 - 2 * k); lx = lerp(s.seatFrom[0], to[0], e); ly = lerp(s.seatFrom[1], to[1], e); }
  [s.x, s.y] = toWorld(v, lx, ly); s.moving = false;
  if (v.T.seats[s.seat].role === 'drive') s.a = v.a;      // drivers face where they're driving
}

/* ---------------- vehicles ---------------- */
function updateVehicle(v, dt) {
  if (!v.active) {
    v.respawnT -= dt;
    if (v.respawnT <= 0 && !solidAt(v.sp.x, v.sp.y, 30)) {
      Object.assign(v, makeVehicle(v.sp), { id: v.id });
      for (let i = 0; i < 12; i++) part({ k: 'dust', x: v.x + rnd(-40, 40), y: v.y + rnd(-25, 25), vx: rnd(-30, 30), vy: rnd(-30, 30), life: 1, max: 1, sz: 16, drag: 2 });
    }
    return;
  }
  v.cd -= dt; v.mgCd -= dt; v.crashCd -= dt; v.recoil = Math.max(0, v.recoil - dt * 2.5); v.hitFlash -= dt; v.mgFlash -= dt;
  if (v.over > 0) { v.over -= dt; if (v.over <= 0) v.heat = 0.4; } else v.heat = Math.max(0, v.heat - dt * 0.38);
  const T = v.T;
  if (T.drive) {
    const driver = v.seats[0];
    const ctl = driver && driver.seatT <= 0 && v.ctl ? v.ctl : { mx: 0, my: 0 };
    v.ctl = null;
    let mx = ctl.mx, my = ctl.my, m = Math.min(1, Math.hypot(mx, my)), throttle = 0, steer = 0;
    if (m > 0.15) {
      const tgt = Math.atan2(my, mx), dF = angDiff(v.a, tgt);
      if (!v.rev && Math.abs(dF) > 2.25 && Math.abs(v.spd) < 90) v.rev = true; else if (v.rev && Math.abs(dF) < 1.3) v.rev = false;
      const d = v.rev ? angDiff(v.a, tgt + Math.PI) : dF;
      steer = clamp(d * 2.6, -1, 1);
      const align = Math.cos(d);
      throttle = (v.rev ? -1 : 1) * m * (v.type === 'tank' ? Math.pow(Math.max(0, align), 3) : Math.max(0.3, align));
    }
    const target = throttle * (throttle >= 0 ? T.maxF : T.maxR);
    const rate = m < 0.15 ? T.drag : (Math.sign(target) !== Math.sign(v.spd) && Math.abs(v.spd) > 5 ? T.brake : T.acc);
    v.spd = approach(v.spd, target, rate * dt);
    v.av = v.type === 'tank' ? steer * T.turn : steer * T.turn * clamp(Math.abs(v.spd) / 80, 0, 1);
    v.a += v.av * dt;
    const ice = onIce(v.x, v.y), hx = Math.cos(v.a), hy = Math.sin(v.a), grip = ice ? Math.min(1, dt * (v.type === 'tank' ? 1.6 : 1.1)) : v.type === 'tank' ? 1 : Math.min(1, dt * (M.rain || M.snow ? 4 : 6));
    v.vx = lerp(v.vx, hx * v.spd, grip); v.vy = lerp(v.vy, hy * v.spd, grip);
    const ox = v.x, oy = v.y;
    v.x += v.vx * dt; v.y += v.vy * dt;
    vehicleCollide(v);
    const moved = Math.hypot(v.x - ox, v.y - oy);
    if (v.type === 'tank' && driver && v.aimT !== undefined) v.tRel += clamp(angDiff(v.ta, v.aimT), -1.7 * dt, 1.7 * dt);
    syncMounts(v);
    vehTrackFx(v, moved + Math.abs(v.av) * dt * 20);
    // run-over
    const sp = Math.hypot(v.vx, v.vy);
    vehCircles(v, _vc);
    for (const s of M.sol) {
      if (!s.alive || s.veh) continue;
      if (Math.abs(s.x - v.x) > 80 || Math.abs(s.y - v.y) > 80) continue;
      for (const [cx, cy, r] of _vc) {
        const dx = s.x - cx, dy = s.y - cy, d = Math.hypot(dx, dy), mm = r + s.r;
        if (d >= mm) continue;
        const vt = vehTeam(v), drv = v.seats[0];
        if (sp > 50 && drv && (isEnemy(vt, s.team) || (M.ff && vt === s.team))) { s.protect = 0; hurtSoldier(s, 999, drv, 'crush', v.vx, v.vy, 'ROADKILL'); if (drv.player) rumble(drv.player, 0.5, 0.15); break; }
        if (d > 0.01) { s.x = cx + dx / d * mm; s.y = cy + dy / d * mm; } else s.x += 2;
        soldierCollide(s);
        break;
      }
    }
  }
  // MG swings toward the gunner's aim, but stays bolted to its mount
  const gunner = v.seats.find((o, i) => o && T.seats[i].role === 'mg');
  if (gunner && v.mgAim !== undefined) { v.mgRel += clamp(angDiff(v.mgA, v.mgAim), -7 * dt, 7 * dt); if (T.arc) v.mgRel = clamp(v.mgRel, -T.arc, T.arc); }
  if (!gunner) v.mgAim = undefined;
  syncMounts(v);
  if (v.hp < T.hp * 0.25) {
    v.burn += dt; hurtVehicle(v, T.hp * 0.018 * dt, v.lastHit);
  }
  vehDamageFx(v, dt);
  engineUpdate(v);
}
/* treads, dust, fire and smoke off a hurt vehicle: cosmetic, so online clients run them too */
function vehTrackFx(v, d) {
  const T = v.T; v.trackAcc += d;
  if (v.trackAcc > (v.type === 'tank' ? 5 : 6)) {
    v.trackAcc = 0;
    if (v.type === 'tank') for (const sd of [-1, 1]) { const [tx, ty] = toWorld(v, -10, sd * 21); tread(tx, ty, v.a, 13, 4, M.rain ? 0.3 : 0.22); }
    else for (const sd of [-1, 1]) { const [tx, ty] = toWorld(v, -25, sd * 15); tread(tx, ty, v.a, 3, 6, M.rain ? 0.18 : 0.1); }
    if (Math.abs(v.spd) > 60 && Math.random() < 0.3 && !M.rain) { const [dx, dy] = toWorld(v, -T.hl, rnd(-T.hw, T.hw)); part({ k: 'dust', x: dx, y: dy, vx: -v.vx * 0.2 + rnd(-10, 10), vy: -v.vy * 0.2 + rnd(-10, 10), life: 0.9, max: 0.9, sz: rnd(8, 14), drag: 2 }); }
  }
}
function vehDamageFx(v, dt) {
  const T = v.T;
  if (v.hp < T.hp * 0.25 && Math.random() < dt * 25) { const [fx, fy] = toWorld(v, rnd(-T.hl * 0.6, T.hl * 0.3), rnd(-T.hw * 0.6, T.hw * 0.6)); part({ k: 'fire', x: fx, y: fy, vx: rnd(-10, 10), vy: rnd(-10, 10), life: 0.5, max: 0.5, sz: rnd(10, 18), drag: 1 }); }
  if (v.hp < T.hp * 0.55 && Math.random() < dt * (v.hp < T.hp * 0.3 ? 14 : 5)) { const [fx, fy] = toWorld(v, rnd(-T.hl * 0.5, 0), rnd(-T.hw * 0.5, T.hw * 0.5)); part({ k: 'smoke', x: fx, y: fy, vx: rnd(-8, 8), vy: rnd(-8, 8), life: 1.6, max: 1.6, sz: rnd(8, 14), drag: 1 }); }
}

/* ---------------- objectives ---------------- */
function updateObjectives(dt) {
  if (M.ffa) { if (!M.over && !M.demo) for (const s of M.sol) if (s.k >= M.limit) { endMatch(s.team); M.winnerSol = s; break; } return; }
  for (const f of M.flags) {
    const cnt = [0, 0];
    for (const s of M.sol) if (s.alive && s.team < 2 && Math.hypot(s.x - f.x, s.y - f.y) < f.r) cnt[s.team]++;
    f.cnt = cnt; f.contested = cnt[0] > 0 && cnt[1] > 0; f.wave += dt * 6;
    if (f.contested || (!cnt[0] && !cnt[1])) continue;
    const t = cnt[0] ? 0 : 1, dir = t === 0 ? -1 : 1, n = Math.min(3, cnt[t]);
    const before = f.prog;
    f.prog = clamp(f.prog + dir * dt * 0.17 * (1 + (n - 1) * 0.5), -1, 1);
    if (f.owner !== -1 && Math.sign(f.prog) !== Math.sign(before) && before !== 0) { const lost = f.owner; f.owner = -1; announceFlag(f, lost, false); }
    if (f.owner === -1 && Math.abs(f.prog) >= 1) {
      f.owner = t; announceFlag(f, t, true);
      for (const s of M.sol) if (s.alive && s.team === t && Math.hypot(s.x - f.x, s.y - f.y) < f.r) { s.caps++; addPts(s, 200, 'CAPTURED ' + f.name); }
    }
  }
  if (M.demo) return;
  if (M.mode === 'conquest') {
    const own = [0, 0]; for (const f of M.flags) if (f.owner >= 0) own[f.owner]++;
    if (own[0] !== own[1]) { const lead = own[0] > own[1] ? 0 : 1; M.bleedT += dt * Math.abs(own[0] - own[1]); if (M.bleedT >= 3) { M.bleedT = 0; M.tickets[1 - lead] = Math.max(0, M.tickets[1 - lead] - 1); } }
  } else if (M.mode === 'koth') {
    const f = M.flags[0]; if (f.owner >= 0 && !f.contested) { M.bleedT += dt; if (M.bleedT >= 1.5) { M.bleedT = 0; M.tickets[1 - f.owner] = Math.max(0, M.tickets[1 - f.owner] - 1); } }
  }
  for (const t of [0, 1]) {
    const lim = LIMITS.team[M.cfg.limit] || 200;
    if (!M.lowWarn[t] && M.tickets[t] <= lim * 0.2) { M.lowWarn[t] = true; toast(TEAMNAME[t] + ' IS RUNNING LOW ON TICKETS', TEAMHEX[t], 3, t, 0); sfx('lost'); }
    if (M.tickets[t] <= 0 && !M.over) endMatch(1 - t);
  }
}
function announceFlag(f, team, captured) {
  if (M.demo) return;
  toast(captured ? `${TEAMNAME[team]} CAPTURED ${f.name}` : `${TEAMNAME[team]} LOST ${f.name}`, TEAMHEX[team], 2.6, team, captured ? 1 : 2);
  const humanTeams = new Set(LOCALS().map(p => p.team));
  if (captured && humanTeams.has(team)) sfx('cap'); else sfx('lost');
}
function toast(txt, c, t, team, kind) { M.toasts.push({ txt, c, t }); netEv('t', txt, c, t, team, kind); }
function endMatch(winner) { if (M.over) return; M.over = true; M.winner = winner; M.overT = 0; M.slowT = 1.5; sfx('win'); }

/* ---------------- spotting (recon passive) ---------------- */
function updateSpotting() {
  if (M.ffa) return;
  for (const r of M.sol) {
    if (!r.alive || r.kit !== 3 || r.veh) continue;
    for (const o of M.sol) if (o.alive && isEnemy(r.team, o.team) && Math.hypot(o.x - r.x, o.y - r.y) < 520 && los(r.x, r.y, o.x, o.y) && !smokeBlocks(r.x, r.y, o.x, o.y)) { o.spotT = 1.5; o.spotTeam = r.team; }
  }
}
