/* =====================================================================
   SIMULATION — match, soldiers, stances, weapons, gadgets, vehicles,
   seats, damage, projectiles, objectives, cameras
   ===================================================================== */
const VT = {
  tank: {
    drive: true, hl: 52, hw: 28, maxF: 82, maxR: 50, acc: 90, brake: 160, drag: 70, turn: 1.3, mass: 5, hp: 1350, respawn: 24,
    circles: [[-34, 0, 27], [0, 0, 28], [34, 0, 27]],
    seats: [
      { n: 'DRIVER', anchor: [-76, 0], pos: [20, 0], exposed: false, role: 'drive' },
      { n: 'GUNNER', anchor: [0, -50], alts: [[0, 50]], pos: 'turret', exposed: true, role: 'mg' },
      { n: 'LEFT RIDER', anchor: [-58, -44], pos: [-30, -17], exposed: true, role: 'rifle' },
      { n: 'RIGHT RIDER', anchor: [-58, 44], pos: [-30, 17], exposed: true, role: 'rifle' }],
    dpad: [0, 3, 1, 2]
  },
  jeep: {
    drive: true, hl: 41, hw: 19, maxF: 205, maxR: 85, acc: 210, brake: 380, drag: 120, turn: 2.6, mass: 1.4, hp: 390, respawn: 18,
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
  const mode = (MODES[cfg.mode] || MODES[0]).coop && demo ? MODES[1] : MODES[cfg.mode] || MODES[0];   // behind a co-op lobby the title battle is a plain team fight
  const ffa = mode.id === 'ffa', coop = !!mode.coop;
  const teamColor = pickTeamColors(cfg, demo, ffa);
  TEAMHEX = teamColor.map(c => CHEX[c]);
  TEAMNAME = teamNames(cfg, demo, ffa, teamColor);
  buildRings();
  setWorld(cfg.dev ? DEV_COLS * TILE : 3000, cfg.dev ? DEV_ROWS * TILE : 2000);
  if (cfg.dev) buildDevMap(); else buildMap(MAPNAMES[cfg.map % MAPNAMES.length][0]);
  paintGround(); buildNav();
  MAP.statics.forEach((s, i) => s.idx = i);
  const tk = LIMITS.team[cfg.limit] || 200;
  M = {
    cfg, demo: !!demo, mode: mode.id, ffa, time: 0, sol: [], vehicles: [], wrecks: [], proj: [], parts: [], flings: [], corpses: [], crates: [], items: [], feed: [], toasts: [],
    flags: [], tickets: [tk, tk], limit: ffa ? LIMITS.ffa[cfg.limit] : 0, bleedT: 0, over: false, overT: 0, winner: -1, views: [], skill: SKILL[cfg.skill] || SKILL[1],
    brass: [], scoreHeld: false, lowWarn: [false, false], ff: !!cfg.ff && !demo, rain: cfg.weather === 'rain' && MAPNAMES[cfg.map][0] !== 'snowfield', snow: cfg.weather === 'snow' || (cfg.weather === 'rain' && MAPNAMES[cfg.map][0] === 'snowfield'), teamColor,
    coop, wv: coop ? { n: 0, queue: 0, left: 0, brk: 8, spT: 0, lim: LIMITS.surv[cfg.limit] || 0 } : null
  };
  if (mode.id === 'conquest') M.flags = MAP.flags.map(f => ({ ...f, r: 96, owner: -1, prog: 0, contested: false, wave: rnd(0, 6), cnt: [0, 0] }));
  if (mode.id === 'koth') M.flags = [{ ...MAP.flags[1], name: 'HILL', r: 120, owner: -1, prog: 0, contested: false, wave: 0, cnt: [0, 0] }];
  M.dev = !!cfg.dev && !demo;
  if (demo || coop || M.dev) M.tickets = [99999, 99999];
  if (mode.id === 'conquest') { M.flags[0].owner = 0; M.flags[0].prog = -1; M.flags[2].owner = 1; M.flags[2].prog = 1; }
  for (const s of MAP.vehSpawns) M.vehicles.push(makeVehicle(s));
  for (const c of MAP.crateSpots) M.crates.push({ x: c.x, y: c.y, a: rnd(-0.4, 0.4), live: true, t: 0 });
  const humans = demo ? [] : PLAYERS;
  const used = new Set(humans.map(p => p.color));
  let nameI = rint(0, BOTNAMES.length - 1);
  const nextName = () => BOTNAMES[(nameI++) % BOTNAMES.length];
  humans.forEach((p, i) => {
    if (coop) p.team = 0; else if (!ffa) p.color = teamColor[p.team];      // teammates wear the team's colour
    const s = makeSoldier({ team: ffa ? 100 + i : p.team, color: p.color, name: p.name || 'P' + (p.id + 1), player: p });
    s.kit = p.kit || 0; s.var = p.var || 0; s.sec = p.sec || 0; s.nt = p.nt || 0; s.respawnT = 0; s.firstDeploy = true; s.deployIdle = 0;
    p.sol = s; M.sol.push(s);
  });
  if (ffa) {
    const free = COLORS.filter(c => !used.has(c));
    const nb = Math.min(cfg.bots, COLORS.length - humans.length, free.length);
    for (let i = 0; i < nb; i++) M.sol.push(makeSoldier({ team: 200 + i, color: free[i], name: nextName(), bot: true }));
  } else if (coop) {
    // a fixed pool of raiders the waves draw from (the roster never changes mid-match, so online clients keep up)
    for (let i = 0; i < 24; i++) { const b = makeSoldier({ team: 1, color: teamColor[1], name: nextName(), bot: true }); b.dark = true; b.respawnT = 1e9; M.sol.push(b); }
  } else {
    for (const t of [0, 1]) { const nb = demo ? 7 : cfg.bots; for (let i = 0; i < nb; i++) { const b = makeSoldier({ team: t, color: teamColor[t], name: nextName(), bot: true }); b.dark = !demo && cfg.teamColors !== 'classic'; M.sol.push(b); } }
  }
  for (const s of M.sol) if (s.bot && !coop) s.respawnT = rnd(0, 0.8);
  rainAudio(M.rain);
  layoutViews();
  if (!demo) netMatchStarted();
}
/* each team wears its first player's colour; bots on that team wear a darker shade of it */
function pickTeamColors(cfg, demo, ffa) {
  if (!demo && MODES[cfg.mode] && MODES[cfg.mode].coop) {        // co-op: the raiders take a colour no player wears
    const used = new Set(PLAYERS.map(p => p.color));
    return [PLAYERS[0] ? PLAYERS[0].color : 'blue', ['red', 'orange', 'magenta', 'yellow', 'green', 'cyan', 'blue'].find(c => !used.has(c)) || 'red'];
  }
  if (demo || ffa || cfg.teamColors === 'classic') return ['blue', 'red'];
  return lobbyTeamCols();
}
function teamNames(cfg, demo, ffa, tc) {
  if (!demo && MODES[cfg.mode] && MODES[cfg.mode].coop) return ['SURVIVORS', 'RAIDERS'];
  return (!demo && !ffa && cfg.teamColors !== 'classic') ? tc.map(c => CNAME[c]) : ['WEST', 'EAST'];
}
function makeSoldier(o) {
  return {
    id: ++UID, x: 0, y: 0, a: 0, vx: 0, vy: 0, r: 7, hp: 100, mhp: o.player && M && M.coop ? 200 : 100, team: o.team, color: o.color, name: o.name, player: o.player || null,
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
const fullW = id => ({ id, mag: WPN[id].mag, res: WPN[id].res });
function giveLoadout(s) {
  const K = KITS[s.kit] || KITS[0], p = K.p[(s.var || 0) % K.p.length], sec = K.secs[(s.sec || 0) % K.secs.length], no = NADE_OPTS(K)[(s.nt || 0) % 2];
  s.w = [fullW(p), fullW(sec)];
  s.wi = 0; s.nades = no.f; s.smokes = no.sm; s.throwSel = s.nades > 0 ? 0 : 1; s.mines = K.g === 'mine' ? 2 : 0; s.gcd = 0;
}

/* ---------------- spawning ---------------- */
function spawnOptions(s) {
  if (M.ffa) return [{ name: 'SAFEST DROP', kind: 'rand' }, ...MAP.ffaSpawns.map((p, i) => ({ name: 'DROP ' + (i + 1), x: p.x, y: p.y, kind: 'pt' }))];
  const out = [{ name: 'BASE', x: MAP.bases[s.team].x, y: MAP.bases[s.team].y, kind: 'base' }];
  if (M.mode === 'conquest') { for (const f of M.flags) if (f.owner === s.team && !f.contested) out.push({ name: 'FLAG ' + f.name, x: f.x, y: f.y, kind: 'flag' }); }
  else out.push({ name: 'FORWARD CAMP', x: MAP.fwd[s.team].x, y: MAP.fwd[s.team].y, kind: 'pt' });
  for (const o of M.sol) {
    if (o === s || !o.player || !o.alive || o.down || o.team !== s.team) continue;
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
const canDeploy = s => M.ffa || (M.coop ? M.wv.brk > 0 : M.tickets[s.team] > 0);   // co-op: the fallen get back in between waves
function spawnSoldier(s, opt) {
  if (!opt) {
    const pts = spawnOptions(s);
    if (M.ffa) opt = pts[0];
    else { const own = pts.filter(q => q.kind === 'flag' || q.kind === 'pt'); opt = own.length && Math.random() < 0.7 ? pick(own) : pts[0]; }
  }
  if (s.bot) { s.kit = pickKit(); s.var = rint(0, 1); s.sec = rint(0, 1); s.nt = 0; }
  giveLoadout(s);
  Object.assign(s, { hp: s.mhp || 100, down: false, alive: true, reloadT: 0, fireCd: 0.3, protect: 1.6, veh: null, seat: -1, seatT: 0, lastHurt: -9, stance: 0, stanceT: 0, swim: false, vx: 0, vy: 0, deployIdle: 0, firstDeploy: false });
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
  if (!s.alive || s.down || s.protect > 0 || M.over) return;
  if (M.dev && DEV.god && s.player) return;
  if (src && !canHurt(src, s)) return;
  if (kind === 'explosion' || kind === 'mine') dmg *= [1, 0.8, 0.6][s.stance];
  s.hp -= dmg; s.lastHurt = M.time; s.hurtT = 0.35;
  if (s.dummy) devHit(s, dmg);
  if (src && src.player && src !== s) { src.hitT = 0.15; src.hitV = false; psfx(src.player, 'hit'); }
  if (s.player) rumble(s.player, Math.min(1, dmg / 60), 0.15);
  if (kind === 'bullet' || kind === 'mg') { for (let i = 0; i < 2; i++) blood(s.x, s.y, dx, dy); sfx('hurt', s.x, s.y); netEv('b', s.x | 0, s.y | 0, Math.round(dx || 0), Math.round(dy || 0)); }
  if (s.hp <= 0) { if (M.coop && s.player && !s.swim) goDown(s, src, wname); else kill(s, src, kind, dx, dy, wname); }
}
function blood(x, y, dx, dy) {
  const a = Math.atan2(dy || rnd(-1, 1), dx || rnd(-1, 1)) + rnd(-0.6, 0.6), sp = rnd(40, 140);
  part({ k: 'blood', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.25, 0.5), max: 0.5, sz: rnd(0.25, 0.45), rot: rnd(0, TAU), drag: 5 });
}
function kill(s, src, kind, dx, dy, wname) {
  s.alive = false; s.down = false; s.hp = 0; s.d++; s.respawnT = s.player ? 5 : 6; s.torch = false;
  if (s.dummy) { s.respawnT = 1.5; devKill(s, src, kind, wname); }
  if (s.veh) leaveSeat(s);
  if (s.player) { rumble(s.player, 1, 0.4); s.deployIdle = 0; s.deathT = 2.2; s.killer = src && src !== s ? { sol: src, veh: src.veh || null, x: src.veh ? src.veh.x : src.x, y: src.veh ? src.veh.y : src.y, name: src.name, color: src.color } : null; }
  if (!M.ffa && !M.demo && !M.coop) M.tickets[s.team] = Math.max(0, M.tickets[s.team] - 1);
  let how = wname || (kind === 'crush' ? 'ROADKILL' : kind === 'explosion' ? 'BLAST' : kind === 'burn' ? 'WRECK' : kind === 'mine' ? 'MINE' : 'RIFLE');
  if (src && src !== s && isEnemy(src.team, s.team)) {
    src.k++;
    const d = Math.hypot(src.x - s.x, src.y - s.y); if (d > src.longest && kind !== 'crush') src.longest = d;
    if (kind === 'crush') { src.rk++; addPts(src, 150, 'ROADKILL'); } else addPts(src, 100, 'KILL ' + s.name);
    if (src.player) src.msg = { t: 1.4, txt: (kind === 'crush' ? 'ROADKILL  ' : 'KILLED  ') + s.name };
  } else if (src && src !== s && src.team === s.team) { src.pts = Math.max(0, src.pts - 100); how = 'TEAMKILL'; }
  feed(src && src !== s ? src : null, how, s);
  if (M.coop && s.player) survCheckWipe();
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
/* pause menu REDEPLOY: drop dead on the spot and go straight to the deploy screen */
function redeploy(s) {
  if (!s || !s.alive || !M || M.demo || M.over || M.coop) return;
  s.protect = 0; kill(s, null, 'redeploy', 0, 0, 'REDEPLOY'); s.deathT = 0; s.respawnT = 0;
}
/* ---------------- co-op survival ---------------- */
/* out of health a player goes down instead of dying: a teammate standing over them for 3 s gets them back up; after 30 s they bleed out */
function goDown(s, src, wname) {
  if (s.veh) { leaveSeat(s); [s.x, s.y] = freeSpot(s.x, s.y); }
  Object.assign(s, { down: true, hp: 0, bleed: 30, rev: 0, torch: false, reloadT: 0, stance: 0, vx: 0, vy: 0, ads: false });
  if (src && src !== s && isEnemy(src.team, s.team)) src.k++;
  feed(src && src !== s ? src : null, wname || 'DOWNED', s);
  toast(s.name + ' IS DOWN', CHEX[s.color], 2.4, 0, 2); sfx('lost');
  if (s.player) rumble(s.player, 1, 0.4);
  for (let i = 0; i < 6; i++) blood(s.x, s.y, 0, 0);
  sfx('hurt', s.x, s.y);
  survCheckWipe();
}
function reviveSoldier(s, f) { s.down = false; s.hp = s.mhp * f; s.rev = 0; s.protect = 1.2; s.lastHurt = M.time; if (s.player) psfx(s.player, 'spawn'); }
function downTick(s, dt) {
  s.vx = s.vy = 0; s.bleed -= dt;
  const mate = M.sol.find(o => o !== s && o.alive && !o.down && !o.veh && o.team === s.team && Math.hypot(o.x - s.x, o.y - s.y) < 28);
  s.rev = mate ? s.rev + dt / 3 : Math.max(0, s.rev - dt * 0.5);
  if (mate && s.rev >= 1) { reviveSoldier(s, 0.5); addPts(mate, 100, 'REVIVED ' + s.name); mate.heal = (mate.heal || 0) + 1; toast(mate.name + ' REVIVED ' + s.name, CHEX[mate.color], 2, -1, 3); }
  else if (s.bleed <= 0) kill(s, null, 'bleed', 0, 0, 'BLED OUT');
}
function survCheckWipe() { if (!M.over && M.sol.some(o => o.player) && !M.sol.some(o => o.player && o.alive && !o.down)) endMatch(1); }
/* waves: bots start with pistols and bring heavier guns, grenades, rockets, then vehicles; they get sharper each wave */
const WAVE_GUNS = [['pistol'], ['pistol', 'mp', 'mp'], ['mp', 'smg', 'shotgun'], ['smg', 'shotgun', 'ak', 'ak'], ['ak', 'ar', 'shotgun', 'br'], ['ar', 'br', 'lmg', 'ak', 'dmr'], ['ar', 'br', 'lmg', 'hmg', 'dmr', 'sniper']];
const waveHumans = () => Math.max(1, M.sol.filter(s => s.player).length);
function waveSize(n) { return Math.round((5 + n * 3) * (1 + 0.5 * (waveHumans() - 1))); }
function updateWaves(dt) {
  const W = M.wv;
  if (W.brk > 0) { W.brk -= dt; if (W.brk <= 0) startWave(); return; }
  const foes = M.sol.filter(s => s.team === 1 && !s.player), up = foes.filter(s => s.alive).length;
  W.spT -= dt;
  if (W.queue > 0 && W.spT <= 0 && up < Math.min(foes.length, 4 + W.n * 2 + 2 * (waveHumans() - 1))) {
    const s = foes.find(q => !q.alive); if (s) { spawnWaveBot(s); W.queue--; }
    W.spT = rnd(0.3, 1.0);
  }
  W.left = W.queue + up;
  if (!W.left) waveCleared();
}
function startWave() {
  const W = M.wv; W.n++; W.queue = W.left = waveSize(W.n); W.spT = 0;
  const k = Math.min(1, (W.n - 1) / 9), b = SKILL[M.cfg.skill] || SKILL[1];
  M.skill = { name: b.name, react: b.react * (1 - 0.5 * k), err: b.err * (1 - 0.5 * k), rate: Math.min(1, b.rate + 0.3 * k) };
  for (const s of M.sol) if (s.player && !s.alive) spawnSoldier(s);      // anyone still picking a loadout goes in now
  toast('WAVE ' + W.n + (W.lim ? ' OF ' + W.lim : ''), '#ff7a60', 2.6, 1, 2); sfx('lost');
}
function waveCleared() {
  const W = M.wv;
  if (W.lim && W.n >= W.lim) { endMatch(0); return; }
  W.brk = 12;
  for (const s of M.sol) if (s.player) { if (!s.alive) s.respawnT = 0; else if (s.down) reviveSoldier(s, 1); else s.hp = s.mhp; }
  toast('WAVE ' + W.n + ' CLEARED', '#7dff7a', 3, 0, 1); sfx('cap');
}
function spawnWaveBot(s) {
  const ps = M.sol.filter(o => o.player && o.alive), C = [...MAP.ffaSpawns, MAP.bases[1], MAP.fwd[1]];
  const md = c => ps.reduce((m, o) => Math.min(m, Math.hypot(o.x - c.x, o.y - c.y)), 1e9);
  const far = C.filter(c => md(c) > 520), c = far.length ? pick(far) : C.reduce((a, b) => md(b) > md(a) ? b : a);
  spawnSoldier(s, { kind: 'pt', x: c.x, y: c.y, name: '' });
  const n = M.wv.n, p = pick(WAVE_GUNS[Math.min(n, WAVE_GUNS.length) - 1]);
  const sec = n >= 5 && Math.random() < Math.min(0.35, 0.1 + 0.03 * n) ? 'rpg' : n >= 2 ? pick(['pistol', 'mp']) : 'pistol';
  s.kit = sec === 'rpg' ? 1 : Math.max(0, KITS.findIndex(K => K.p.includes(p)));
  s.w = [fullW(p), fullW(sec)]; s.wi = 0;
  s.nades = n < 3 ? 0 : Math.min(3, (n - 1) >> 1); s.smokes = n < 4 ? 0 : 1; s.mines = 0; s.throwSel = s.nades ? 0 : 1;
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
  if (src && src.player) { src.hitT = 0.15; src.hitV = true; psfx(src.player, 'hit'); }      // hit marker shows chevrons for vehicles / nests
  for (const s of v.seats) if (s && s.player) rumble(s.player, Math.min(1, dmg / 200), 0.2);
  if (v.hp <= 0) destroyVehicle(v, src);
}
function destroyVehicle(v, src) {
  v.dead = true; v.hp = 0;
  // who was aboard, before the blast: it kills anyone in an exposed seat (jeep, tank riders, nest) and empties their seat
  const crew = v.seats.filter(Boolean), occupied = crew.length > 0, vt = vehTeam(v);
  explosion(v.x, v.y, v.type === 'tank' ? 110 : 80, 120, 150, src, -2, true);
  if (src && occupied && isEnemy(src.team, vt)) { src.vk++; addPts(src, v.type === 'tank' ? 300 : 200, (v.type === 'nest' ? 'NEST' : v.type.toUpperCase()) + ' DESTROYED'); }
  for (const s of crew) if (s.alive) { s.protect = 0; kill(s, src, 'explosion', rnd(-1, 1), rnd(-1, 1)); }
  if (v.type !== 'nest') M.wrecks.push({ type: v.type, x: v.x, y: v.y, a: v.a, ta: v.ta, t: 180, T: 180, burn: 14, hl: v.T.hl * 0.92, hw: v.T.hw * 0.9, vx: 0, vy: 0 }) && (navDirty = 1);
  else for (let i = 0; i < 10; i++) part({ k: 'dirt', x: v.x, y: v.y, vx: rnd(-90, 90), vy: rnd(-90, 90), life: 0.8, max: 0.8, sz: 3, drag: 3 });
  if (src && src.player && !occupied) src.msg = { t: 1.4, txt: 'EMPTY ' + v.type.toUpperCase() + ' DESTROYED' };
  feed(src, 'DESTROYED', { name: v.type === 'nest' ? 'MG NEST' : v.type.toUpperCase(), color: 'white' });
  engineOff(v);
  v.active = false; v.respawnT = v.T.respawn;
  scorch(v.x, v.y, v.type === 'tank' ? 90 : 70);
}
let EXP_REW = 0;                                  // a joiner's rocket/shell: its blast is judged where things were on their screen
/* does a blast at (x, y) reach (tx, ty)? Walls shelter, glass doesn't. Starts a hair toward the target, so a blast
   on a wall's face still reaches its own side of the wall */
function blastReaches(x, y, tx, ty, d) { const k = Math.min(4, d) / (d || 1); return los(x + (tx - x) * k, y + (ty - y) * k, tx, ty); }
function explosion(x, y, r, dmgS, dmgV, src, team, big, kind) {
  explosionFx(x, y, r, big); netEv('x', x | 0, y | 0, r | 0, big ? 1 : 0);
  const T = EXP_REW ? netNow() - EXP_REW : 0;
  for (const s of M.sol) {
    if (!s.alive) continue; if (s.veh && !s.veh.T.seats[s.seat].exposed) continue;
    const o = EXP_REW ? lagAt(s, T) : s, d = Math.hypot(o.x - x, o.y - y); if (d > r) continue;
    if (!blastReaches(x, y, o.x, o.y, d)) continue;                 // a wall between: sheltered (the blast still shakes and rings)
    hurtSoldier(s, dmgS * Math.pow(1 - d / r, 0.6), src, kind || 'explosion', o.x - x + rnd(-1, 1), o.y - y + rnd(-1, 1));
  }
  for (const v of M.vehicles) {
    if (!v.active || v.dead) continue;
    let dmin = 1e9; for (const [cx, cy, cr] of vehCircles(v, _vcE, EXP_REW ? lagAt(v, T) : v)) dmin = Math.min(dmin, Math.hypot(cx - x, cy - y) - cr);
    if (dmin > r * 0.6) continue;
    const f = clamp(1 - Math.max(0, dmin) / (r * 0.6), 0.25, 1);
    hurtVehicle(v, dmgV * f, src);
    if (v.T.drive) { const k = 25 / v.T.mass * f, d = Math.hypot(v.x - x, v.y - y) + 1; v.vx += (v.x - x) / d * k; v.vy += (v.y - y) / d * k; }
  }
  staticsNear(x, y, r * 0.55, _near);
  for (const s of _near) if (Math.hypot(s.x - x, s.y - y) < r * (s.type === 'tree' ? 0.35 : 0.55)) destroyStatic(s);
  for (const c of M.crates) if (c.live && Math.hypot(c.x - x, c.y - y) < r * 0.5) { c.live = false; c.t = 25; }
  for (const it of M.items) if (it.k === 'mine' && it.armed !== false && Math.hypot(it.x - x, it.y - y) < r * 0.6 && !it.boom) { it.boom = true; it.t = 0; }
  if (MAP.tiled) devBlast(x, y, r, dmgS);
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
  shakeAt(x, y, big ? 14 : 8, 700);
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
/* wrecks are oriented boxes: blockers for movement, bullets and blasts (not sight) */
function pushOutWreck(o, r, w) {
  if (Math.abs(o.x - w.x) > w.hl + r + 4 || Math.abs(o.y - w.y) > w.hl + r + 4) return false;
  return pushOutBox(o, r, w.x, w.y, w.a, w.hl, w.hw);
}
/* push a circle (o, radius r) out of an oriented box (centre bx,by, angle ba, half sizes hl x hw) along the shortest way */
function pushOutBox(o, r, bx, by, ba, hl, hw) {
  const ddx = o.x - bx, ddy = o.y - by, c0 = Math.cos(-ba), s0 = Math.sin(-ba), lx = ddx * c0 - ddy * s0, ly = ddx * s0 + ddy * c0;
  const cx = clamp(lx, -hl, hl), cy = clamp(ly, -hw, hw), dx = lx - cx, dy = ly - cy, d = Math.hypot(dx, dy);
  if (d >= r) return false;
  let nx, ny; if (d > 0.01) { nx = cx + dx / d * r; ny = cy + dy / d * r; } else { const px = hl - Math.abs(lx), py = hw - Math.abs(ly); if (px < py) { nx = Math.sign(lx || 1) * (hl + r); ny = ly; } else { nx = lx; ny = Math.sign(ly || 1) * (hw + r); } }
  const c = Math.cos(ba), s = Math.sin(ba); o.x = bx + nx * c - ny * s; o.y = by + nx * s + ny * c; return true;
}
/* someone on foot against a vehicle: out of the hull box (tank / jeep) or the round nest. One shape, so nothing to
   fight over: the hit circles overlap, and being pushed out of one used to shove you into the next */
function pushOutVeh(o, r, v) {
  if (v.type === 'nest') { const R = v.T.circles[0][2] + r, dx = o.x - v.x, dy = o.y - v.y, d = Math.hypot(dx, dy); if (d >= R) return false; if (d < 0.01) { o.x += R; return true; } o.x = v.x + dx / d * R; o.y = v.y + dy / d * R; return true; }
  return pushOutBox(o, r, v.x, v.y, v.a, v.T.hl, v.T.hw);
}
function segWreck(x0, y0, x1, y1, w) {
  const m = w.hl + w.hw; if (Math.min(x0, x1) > w.x + m || Math.max(x0, x1) < w.x - m || Math.min(y0, y1) > w.y + m || Math.max(y0, y1) < w.y - m) return -1;
  const [ax, ay] = toLocal(w, x0, y0), [bx, by] = toLocal(w, x1, y1);
  return segRect(ax, ay, bx, by, { x: -w.hl, y: -w.hw, w: w.hl * 2, h: w.hw * 2 }, 0);
}
function soldierCollide(s) {
  for (const b of MAP.buildings) {
    if (b.glass && s.jumpT > 0.04) { if (b.sec && inRect(s.x, s.y, b, 2)) devGlass(b.sec, s.x, s.y); continue; }     // vaulting through a window
    pushCircleRect(s, s.r, b);
  }
  for (const w of M.wrecks) pushOutWreck(s, s.r, w);
  staticsNear(s.x, s.y, 30, _near);
  for (const o of _near) { if (s.jumpT > 0.04 && LOW[o.type]) continue; const dx = s.x - o.x, dy = s.y - o.y, d = Math.hypot(dx, dy), m = s.r + o.r; if (d < m && d > 0.01) { s.x = o.x + dx / d * m; s.y = o.y + dy / d * m; } }
  s.x = clamp(s.x, 20 - SKIRT, WW + SKIRT - 20); s.y = clamp(s.y, 20 - SKIRT, WH + SKIRT - 20);
}
/* the vehicle's hit circles in the world; o: another pose to place them at (a lag-compensated {x, y, a}) */
function vehCircles(v, out, o) { o = o || v; out.length = 0; const c = Math.cos(o.a), s = Math.sin(o.a); for (const [ox, oy, r] of v.T.circles) out.push([o.x + ox * c - oy * s, o.y + ox * s + oy * c, r]); return out; }
const _vcE = [];
const _vc = [], _vc2 = [];
/* vehicles and wrecks are heavy but can be shoved: overlap is shared by mass (a jeep barely moves a tank), an
   off-centre shove turns what's hit, and shoving costs the pusher speed in proportion to what it's pushing.
   local = a joiner's own driving: what we shove only moves on our screen (o.po, until the host's picture catches up).
   auth = the host replaying a joiner's driving: the joiner already shared the overlap, so what they hit takes all of it */
const wreckMass = w => VT[w.type].mass * 1.6;
function shove(o, cx, cy, px, py, local) {
  if (local) { const P = o.po || (o.po = { x: 0, y: 0 }); P.x += px; P.y += py; o.x += px; o.y += py; return; }
  const hl = o.T && o.T.hl ? o.T.hl : o.hl;
  o.x += px; o.y += py; o.a += clamp(((cx - o.x) * py - (cy - o.y) * px) / (hl * hl) * 0.6, -0.05, 0.05);
  if (o.T && o.T.drive) return;
  // a wreck: keep it out of buildings, and let the bots' map know once it has moved a fair way
  for (let k = -1; k <= 1; k++) { const c = { x: o.x + Math.cos(o.a) * o.hl * 0.6 * k, y: o.y + Math.sin(o.a) * o.hl * 0.6 * k }, bx = c.x, by = c.y; for (const b of MAP.buildings) if (pushCircleRect(c, o.hw, b)) { o.x += c.x - bx; o.y += c.y - by; } }
  o.mv = (o.mv || 0) + Math.hypot(px, py); if (o.mv > 30) { o.mv = 0; navDirty = 1; }
}
function vehicleCollide(v, local, auth) {
  let hit = 0, hitV = 0;
  if (MAP.tiled && !local) devRams(v);
  for (let pass = 0; pass < 2; pass++) {
    vehCircles(v, _vc);
    for (const [cx, cy, r] of _vc) {
      const o = { x: cx, y: cy };
      for (const b of MAP.buildings) { const px = o.x, py = o.y; if (pushCircleRect(o, r, b)) { v.x += o.x - px; v.y += o.y - py; hit = 1; } }
      for (const w of M.wrecks) { const o3 = { x: cx, y: cy }; if (pushOutWreck(o3, r, w)) { const wa = auth ? 0 : wreckMass(w) / (v.T.mass + wreckMass(w)); v.x += (o3.x - cx) * wa; v.y += (o3.y - cy) * wa; shove(w, cx, cy, -(o3.x - cx) * (1 - wa), -(o3.y - cy) * (1 - wa), local); hitV = Math.max(hitV, wa); } }
      for (const w of MAP.water) { const o2 = { x: cx, y: cy }; if (pushCircleRect(o2, r - 6, w)) { v.x += o2.x - cx; v.y += o2.y - cy; hit = 1; } }
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
      if (crush) { if (local) { if (!s.lcr) { s.lcr = 1; v.spd *= v.type === 'jeep' ? 0.82 : 0.96; } } else { destroyStatic(s); v.spd *= v.type === 'jeep' ? 0.82 : 0.96; } }
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
        const push = m - d, wa = auth ? 0 : o.T.mass / (v.T.mass + o.T.mass), wb = 1 - wa;
        v.x -= dx / d * push * wa; v.y -= dy / d * push * wa;
        if (o.T.drive) { shove(o, bx, by, dx / d * push * wb, dy / d * push * wb, local); hitV = Math.max(hitV, wa); } else { v.x -= dx / d * push * wb; v.y -= dy / d * push * wb; hit = 1; }
        if (local) continue;
        const tch = v.tch || (v.tch = new Map()), last = tch.get(o); tch.set(o, M.time);
        if (last !== undefined && M.time - last < 0.4) continue;     // still leaning on it: pushing isn't a crash
        const rel = ((v.vx - o.vx) * dx + (v.vy - o.vy) * dy) / d;
        if (rel > 70 && v.crashCd <= 0) { v.crashCd = 0.5; sfx('clang', v.x, v.y); const dm = (rel - 60) * 0.25; hurtVehicle(v, dm * Math.min(3, o.T.mass / v.T.mass), null); hurtVehicle(o, dm * (v.T.mass / Math.min(5, o.T.mass)), v.seats[0] && isEnemy(vehTeam(v), vehTeam(o)) ? v.seats[0] : null); }
      }
    }
  }
  if (hitV && !auth) v.spd *= 1 - 0.05 * hitV;
  const m = 30 - SKIRT; if (v.x < m) { v.x = m; hit = 1; } if (v.x > WW - m) { v.x = WW - m; hit = 1; } if (v.y < m) { v.y = m; hit = 1; } if (v.y > WH - m) { v.y = WH - m; hit = 1; }
  if (hit) { if (Math.abs(v.spd) > 120 && v.crashCd <= 0 && !local) { v.crashCd = 0.6; sfx('clang', v.x, v.y); if (v.type === 'jeep') hurtVehicle(v, (Math.abs(v.spd) - 110) * 0.2, null); } v.spd *= 0.6; }
}
function toLocal(v, x, y) { const dx = x - v.x, dy = y - v.y, c = Math.cos(-v.a), s = Math.sin(-v.a); return [dx * c - dy * s, dx * s + dy * c]; }
/* nothing solid at all on the segment (walls and windows) */
function clearPath(x0, y0, x1, y1) { for (const b of MAP.buildings) if (segRect(x0, y0, x1, y1, b, 0) >= 0) return false; return true; }
function toWorld(v, lx, ly) { const c = Math.cos(v.a), s = Math.sin(v.a); return [v.x + lx * c - ly * s, v.y + lx * s + ly * c]; }

/* ---------------- seats ---------------- */
function seatLocal(v, i) {
  const sd = v.T.seats[i];
  if (v.type === 'nest' && sd.role === 'mg') { const r = v.mgA - v.a; return [2 - 7 * Math.cos(r), -7 * Math.sin(r)]; }
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
    // only seats whose door you can reach: nothing solid (glass included) between you and it
    const order = v.T.seats.map((sd, i) => { const an = nearAnchor(sd, lx, ly), [wx, wy] = toWorld(v, an[0], an[1]); return { i, d: Math.hypot(lx - an[0], ly - an[1]), ok: clearPath(s.x, s.y, wx, wy) }; }).filter(o => o.ok).sort((a, b) => a.d - b.d);
    if (!order.length) continue;
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
/* a seat can have more than one door (the tank gunner climbs up from either side): the one nearest a local point */
function nearAnchor(sd, lx, ly) {
  let an = sd.anchor; if (sd.alts) for (const b of sd.alts) if (Math.hypot(lx - b[0], ly - b[1]) < Math.hypot(lx - an[0], ly - an[1])) an = b;
  return an;
}
function seatAnchor(v, i, x, y) { const [lx, ly] = toLocal(v, x, y); return nearAnchor(v.T.seats[i], lx, ly); }
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
  for (const i of order) { const sd = v.T.seats[i]; tries.push(sd.anchor); if (sd.alts) tries.push(...sd.alts); }
  if (!v.T.drive) tries.push([-30, 20], [-30, -20], [0, 32], [0, -32]);
  for (const [ax, ay] of tries) {
    const [wx, wy] = toWorld(v, ax * 0.95, ay * 0.95);
    if (!solidAtExit(wx, wy, v) && clearPath(v.x, v.y, wx, wy)) { leaveSeat(s); s.x = wx; s.y = wy; s.vx = v.vx * 0.3; s.vy = v.vy * 0.3; s.a = v.T.drive ? s.a : v.mgA; sfx('door', v.x, v.y); return; }
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
  else { const rocket = s.w && WPN[cw(s).id].rocket; o = T_['n_' + (rocket ? 'rpg' : 'stand')] || [17, 0]; }
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
/* fires the gun in hand, or clicks on an empty one; true if it fired */
function pullTrigger(s) { if (cw(s).mag > 0) { fireWeapon(s); return true; } sfx('empty', s.x, s.y); s.fireCd = 0.25; return false; }
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
/* every view near (x, y) shakes, by amt at the spot fading to nothing at range */
function shakeAt(x, y, amt, range) { for (const vw of M.views) { const d = Math.hypot(vw.cam.x - x, vw.cam.y - y); vw.shake = Math.min(18, vw.shake + amt * Math.max(0, 1 - d / range)); } }
/* a smoke grenade, or with o = { dust: true, T: s, quiet } dust off a falling roof or wall (as thick, less of it: T / 10
   of SMK_DUST): let out into the smoke field. A grenade's (no o) goes to the clients */
function popSmoke(x, y, o) {
  if (!o) netEv('sm', x | 0, y | 0); o = o || {};
  smokeEmit(x, y, o.dust ? SMK_DUST * (o.T || 10) / 10 : SMK_NADE, !!o.dust); if (!o.quiet) sfx('splash', x, y, 0.5);
}
/* smoke (grenades, and dust off falling roofs and walls): one field of
   smoke amounts on GS px tiles (M.gsf), stepped SMK_HZ times a second (S-ticks), not every frame. Each S-tick:
   - an emitter (where a grenade / dust landed) lets out SMK_EMIT of what it has left into its tile, but only while
     the tiles round it (SMK_CAP_R each way) hold less than SMK_CAP, three grenades' worth: the rest is lost, so
     stacking smoke stops thickening after the third;
   - every tile bleeds about SMK_BLEED of its amount (a little random) to its 4 neighbours, a quarter each, lowest
     first and only downhill: a share goes only if it leaves that neighbour no higher than this tile is after passing
     it. A wall keeps its share; a cracked window is open but takes only SMK_WIN. That is the whole spread, so
     smoke flows round corners and along corridors, out of broken windows, and overlapping smokes add up;
   - random ticks (Minecraft style): a tile is picked with chance SMK_RT_P and loses SMK_RT_D, plus SMK_RT_K of its
     amount (counted up to SMK_RT_A), so it thins raggedly, and thick smoke shut in a room still clears.
   A tile's thickness is min(1, amount). Dust is the same smoke, brown (B: the brown part of a tile's amount).
   Cost goes with the tiles holding smoke, not the number of smokes. The field reaches SMK_OUT tiles past the map's
   edges, so smoke drifts off it rather than piling up there: tile i covers world x from (i - SMK_OUT) x GS. */
const SMK_OUT = 16, GS = 16, SMK_HZ = 10, SMK_EMIT = 0.15, SMK_BLEED = 0.35, SMK_WIN = 0.2, SMK_DEL = 0.01, SMK_RT_P = 0.1, SMK_RT_D = 0.008, SMK_RT_K = 0.05, SMK_RT_A = 1, SMK_NADE = 120, SMK_CAP = 3 * SMK_NADE, SMK_CAP_R = 6, SMK_DUST = 5, SMK_K = 0.5;
const NB4 = new Int32Array(4), DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function smokeField() {
  const W = Math.ceil(WW / GS) + 2 * SMK_OUT, H = Math.ceil(WH / GS) + 2 * SMK_OUT; let f = M.gsf;
  if (!f || f.W !== W || f.H !== H) { const n = W * H; f = M.gsf = { W, H, A: new Float32Array(n), B: new Float32Array(n), V: new Float32Array(n), vt: 0, dA: new Float32Array(n), dB: new Float32Array(n), S: new Uint8Array(n), on: new Uint8Array(n), act: [], em: [], acc: 0, box: [0, 0, 0, 0], dirty: 1 }; }
  if (f.dirty) smokeSolid(f);
  return f;
}
/* the tiles smoke can't enter (1: a wall, an intact window) or takes less of (2: a cracked window), by tile centre;
   and f.R, each tile's room: the open tiles between it and the nearest wall or window (square rings, at most 3) */
function smokeSolid(f) {
  f.S.fill(0); f.dirty = 0;
  for (const b of MAP.buildings) {
    const v = b.glass && b.sec && b.sec.hp < b.sec.mhp ? 2 : 1, i1 = Math.min(f.W, Math.ceil((b.x + b.w - GS / 2) / GS) + SMK_OUT), j1 = Math.min(f.H, Math.ceil((b.y + b.h - GS / 2) / GS) + SMK_OUT);
    for (let j = Math.max(0, Math.round(b.y / GS) + SMK_OUT); j < j1; j++) for (let i = Math.max(0, Math.round(b.x / GS) + SMK_OUT); i < i1; i++) f.S[j * f.W + i] = v;
  }
  const { W, H, S } = f, R = f.R || (f.R = new Uint8Array(W * H));     // distance to the nearest solid tile, two passes (capped at 4), less one
  for (let k = 0; k < R.length; k++) R[k] = S[k] ? 0 : 4;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; let d = R[k]; if (!d) continue;
    if (i > 0) d = Math.min(d, R[k - 1] + 1); if (j > 0) { d = Math.min(d, R[k - W] + 1); if (i > 0) d = Math.min(d, R[k - W - 1] + 1); if (i + 1 < W) d = Math.min(d, R[k - W + 1] + 1); } R[k] = d; }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) { const k = j * W + i; let d = R[k]; if (!d) continue;
    if (i + 1 < W) d = Math.min(d, R[k + 1] + 1); if (j + 1 < H) { d = Math.min(d, R[k + W] + 1); if (i + 1 < W) d = Math.min(d, R[k + W + 1] + 1); if (i > 0) d = Math.min(d, R[k + W - 1] + 1); } R[k] = d; }
  for (let k = 0; k < R.length; k++) R[k] = R[k] ? R[k] - 1 : 0;
}
/* an emitter: amt of smoke (brown: dust) let out into the tile at (x, y), or the nearest open one round it */
function smokeEmit(x, y, amt, brown) {
  const f = smokeField(); let i = clamp(Math.floor(x / GS) + SMK_OUT, 0, f.W - 1), j = clamp(Math.floor(y / GS) + SMK_OUT, 0, f.H - 1);
  if (f.S[j * f.W + i] === 1) { let best = Infinity; const ci = i, cj = j; for (const [dx, dy] of DIRS8) { const a = ci + dx, b = cj + dy, d = Math.hypot((a - SMK_OUT + 0.5) * GS - x, (b - SMK_OUT + 0.5) * GS - y); if (a >= 0 && b >= 0 && a < f.W && b < f.H && f.S[b * f.W + a] !== 1 && d < best) { best = d; i = a; j = b; } } }
  f.em.push([j * f.W + i, amt, brown ? 1 : 0]);
}
function updateSmokeField(dt) {
  const f = M.gsf; if (!f || (!f.act.length && !f.em.length)) return;
  f.acc += dt; if (f.acc < 1 / SMK_HZ) return; f.acc = Math.min(f.acc - 1 / SMK_HZ, 1 / SMK_HZ);      // one S-tick a frame at most
  if (f.dirty) smokeSolid(f);
  const { W, H, A, B, dA, dB, S, on, act } = f, add = k => { if (!on[k]) { on[k] = 1; f.V[k] = 0; act.push(k); } };
  for (const e of f.em) {
    let a = Math.min(e[1], Math.max(e[1] * SMK_EMIT, 0.5)), n = 0; e[1] -= a;
    const ci = e[0] % W, cj = (e[0] - ci) / W;
    for (let j = Math.max(0, cj - SMK_CAP_R); j <= Math.min(H - 1, cj + SMK_CAP_R); j++) for (let i = Math.max(0, ci - SMK_CAP_R), k = j * W + i; i <= Math.min(W - 1, ci + SMK_CAP_R); i++, k++) n += A[k];
    a = Math.min(a, SMK_CAP - n); if (a <= 0) continue;
    A[e[0]] += a; if (e[2]) B[e[0]] += a; add(e[0]);
  }
  if (f.em.length) f.em = f.em.filter(e => e[1] > 0.01);
  for (let q = 0, n = act.length; q < n; q++) {
    const k = act[q], a = A[k];
    const out = a * SMK_BLEED * (0.7 + Math.random() * 0.6) / 4, fb = B[k] / a, i = k % W; let nb = 0, gone = 0;
    for (let d = 0; d < 4; d++) {
      const nk = d === 0 ? (i + 1 < W ? k + 1 : -1) : d === 1 ? (i > 0 ? k - 1 : -1) : d === 2 ? (k + W < W * H ? k + W : -1) : k - W;
      if (nk >= 0 && S[nk] !== 1 && A[nk] < a) NB4[nb++] = nk;
    }
    for (let x = 1; x < nb; x++) for (let y = x; y > 0 && A[NB4[y]] < A[NB4[y - 1]]; y--) { const t = NB4[y]; NB4[y] = NB4[y - 1]; NB4[y - 1] = t; }   // lowest first
    for (let x = 0; x < nb; x++) {
      const nk = NB4[x], m = out * (S[nk] === 2 ? SMK_WIN / SMK_BLEED : 1) * (0.75 + Math.random() * 0.5);
      if (A[nk] + m > a - gone - m) continue;          // it would end up above this tile: not downhill
      gone += m; dA[nk] += m; dA[k] -= m; dB[nk] += m * fb; dB[k] -= m * fb; add(nk);
    }
  }
  let w = 0, i0 = W, j0 = H, i1 = 0, j1 = 0;
  for (let q = 0; q < act.length; q++) {
    const k = act[q]; let a = A[k] + dA[k], b = B[k] + dB[k]; dA[k] = dB[k] = 0;
    if (Math.random() < SMK_RT_P) { const r = Math.max(0, a - SMK_RT_D - SMK_RT_K * Math.min(a, SMK_RT_A)); b = a > 0 ? b * r / a : 0; a = r; }
    if (a < SMK_DEL) { A[k] = B[k] = 0; on[k] = 0; continue; }     // too thin: the tile's gone
    A[k] = a; B[k] = Math.max(0, Math.min(a, b)); act[w++] = k;
    const i = k % W, j = (k - i) / W; if (i < i0) i0 = i; if (i >= i1) i1 = i + 1; if (j < j0) j0 = j; if (j >= j1) j1 = j + 1;
  }
  act.length = w; f.box = [i0, j0, i1, j1];
}
/* how much the field's smoke takes off the sight line (x0, y0)-(x1, y1): thickness times the length crossed (in
   tiles), times SMK_K (two thick tiles: all of it). Cut to the box of tiles holding smoke, then tile by tile */
function fieldOcc(x0, y0, x1, y1) {
  const f = M.gsf; if (!f || !f.act.length) return 0;
  const O = SMK_OUT * GS; x0 += O; y0 += O; x1 += O; y1 += O;     // to the field's own px
  const X0 = f.box[0] * GS, Y0 = f.box[1] * GS, X1 = f.box[2] * GS, Y1 = f.box[3] * GS, dx = x1 - x0, dy = y1 - y0; let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, x0 - X0], [dx, X1 - x0], [-dy, y0 - Y0], [dy, Y1 - y0]]) {
    if (!p) { if (q < 0) return 0; continue; }
    const r = q / p; if (p < 0) { if (r > t1) return 0; if (r > t0) t0 = r; } else { if (r < t0) return 0; if (r < t1) t1 = r; }
  }
  if (t1 <= t0) return 0;
  const L = Math.hypot(dx, dy) / GS, si = Math.sign(dx), sj = Math.sign(dy), ddx = si ? GS / Math.abs(dx) : Infinity, ddy = sj ? GS / Math.abs(dy) : Infinity, A = f.A, W = f.W;
  let i = clamp(Math.floor((x0 + dx * t0) / GS), f.box[0], f.box[2] - 1), j = clamp(Math.floor((y0 + dy * t0) / GS), f.box[1], f.box[3] - 1), t = t0, o = 0;
  let tx = si ? ((i + (si > 0)) * GS - x0) / dx : Infinity, ty = sj ? ((j + (sj > 0)) * GS - y0) / dy : Infinity;
  while (t < t1) {
    const tn = Math.min(tx, ty, t1), a = A[j * W + i]; if (a) o += (a < 1 ? a : 1) * (tn - t) * L;
    t = tn; if (tx < ty) { tx += ddx; i += si; } else { ty += ddy; j += sj; }
    if (i < f.box[0] || j < f.box[1] || i >= f.box[2] || j >= f.box[3]) break;
  }
  return Math.min(1, o * SMK_K);
}
/* ---------------- line of sight: one rule for bots, spotting, aim help, the HUD and the vision fog ----------------
   Hard: standing walls (MAP.sight). Soft, adding up to 100 %: smoke, by the field's tiles the line crosses (fieldOcc),
   thinned close to the eye (SIGHT_NEAR px); and windows (MAP.glass),
   GLASS_OCC each one the line crosses, looking in or out. softMask paints exactly these, so what you see is what the
   bots get. */
const SIGHT_NEAR = [24, 96], SIGHT_MIN = 0.5, GLASS_OCC = 0.25;
/* any smoke at all */
function smokeAny() { return !!(M.gsf && M.gsf.act.length); }
function smokeOcc(x0, y0, x1, y1) {
  if (!smokeAny()) return 0;
  const near = clamp((Math.hypot(x1 - x0, y1 - y0) - SIGHT_NEAR[0]) / (SIGHT_NEAR[1] - SIGHT_NEAR[0]), 0, 1);
  return near && fieldOcc(x0, y0, x1, y1) * near;
}
function glassOcc(x0, y0, x1, y1) { let o = 0; for (const b of MAP.glass) if (segRect(x0, y0, x1, y1, b, 0) >= 0) o += GLASS_OCC; return Math.min(1, o); }
function softOcc(x0, y0, x1, y1) { return Math.min(1, smokeOcc(x0, y0, x1, y1) + glassOcc(x0, y0, x1, y1)); }
function sightBlocked(x0, y0, x1, y1) {
  for (const b of MAP.sight) if (segRect(x0, y0, x1, y1, b, 0) >= 0) return true;
  return false;
}
/* (x1, y1) is seen from (x0, y0): no wall between, and the soft layers leave at least SIGHT_MIN */
function sees(x0, y0, x1, y1) { return 1 - softOcc(x0, y0, x1, y1) >= SIGHT_MIN && !sightBlocked(x0, y0, x1, y1); }
/* the cannon barrel, turret pivot to muzzle (where shells leave) */
const BARREL = 96;
function turretPivot(v) { return [v.x - 4 * Math.cos(v.a), v.y - 4 * Math.sin(v.a)]; }
function barrelHits(v, a) {
  const [px, py] = turretPivot(v), x = px + Math.cos(a) * BARREL, y = py + Math.sin(a) * BARREL;
  for (const b of MAP.buildings) if (!b.glass && segRect(px, py, x, y, b, 0) >= 0) return true;
  return false;
}
function fireCannon(v, s) {
  const c = Math.cos(v.ta), sn = Math.sin(v.ta), [px, py] = turretPivot(v);
  const x = px + c * BARREL, y = py + sn * BARREL, inWall = barrelHits(v, v.ta);
  // a muzzle pushed through a wall doesn't shoot from behind it: the shell starts at the pivot and hits the wall
  M.proj.push({ k: 'shell', x: inWall ? px : x, y: inWall ? py : y, vx: c * 760, vy: sn * 760, life: 1.1, src: s, team: s.team, wname: 'CANNON' });
  v.cd = 2.3; v.recoil = 1; v.spd -= 14; s.firedT = 2; v.cN = (v.cN || 0) + 1;
  cannonFx(v, x, y, s);
}
function cannonFx(v, x, y, s) {
  sfx('cannon', x, y);
  part({ k: 'flash', x, y, vx: 0, vy: 0, life: 0.1, max: 0.1, sz: 90, drag: 0 });
  for (let i = 0; i < 10; i++) { const a = v.ta + rnd(-0.5, 0.5); part({ k: 'smoke', x, y, vx: Math.cos(a) * rnd(40, 160), vy: Math.sin(a) * rnd(40, 160), life: rnd(0.6, 1.2), max: 1.2, sz: rnd(10, 20), drag: 3 }); }
  for (let i = 0; i < 8; i++) { const a = v.ta + rnd(-2.6, 2.6) + Math.PI; part({ k: 'dust', x: v.x, y: v.y, vx: Math.cos(a) * rnd(60, 140), vy: Math.sin(a) * rnd(60, 140), life: 0.7, max: 0.7, sz: rnd(14, 22), drag: 3 }); }
  shakeAt(x, y, 5, 500);
  if (s && s.player) rumble(s.player, 0.6, 0.2);
}
function mgPos(v) {
  const c = Math.cos(v.mgA) * 4, s = Math.sin(v.mgA) * 4;
  if (v.type === 'tank') { const [lx, ly] = seatLocal(v, 1), [x, y] = toWorld(v, lx, ly); return [x + c, y + s]; }
  const [x, y] = toWorld(v, v.type === 'nest' ? 2 : -27, 0); return [x + c, y + s];
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
  if (K.g === 'torch') {     // (the repair wrench; the id is older than the tool)
    if (!I.gadget) return;
    let best = null, bd = 1e9;
    for (const v of M.vehicles) { if (!v.active || v.dead || v.hp >= v.T.hp) continue; const vt = vehTeam(v); if (isEnemy(vt, s.team)) continue; const [lx, ly] = toLocal(v, s.x, s.y); if (Math.abs(lx) < v.T.hl + 26 && Math.abs(ly) < v.T.hw + 26) { const d = Math.hypot(v.x - s.x, v.y - s.y); if (d < bd) { bd = d; best = v; } } }
    if (best) {
      s.torch = true; s.a = Math.atan2(best.y - s.y, best.x - s.x);
      const amt = Math.min(best.T.hp - best.hp, (best.type === 'tank' ? 110 : 70) * dt); best.hp += amt; s.rep += amt;
      s.repAcc = (s.repAcc || 0) + amt; if (s.repAcc >= 50) { s.repAcc -= 50; addPts(s, 10, 'REPAIR'); }
      sfx('torch', s.x, s.y); const [tx, ty] = muzzle(s, 20);
      if (Math.random() < 0.12) part({ k: 'spark', x: tx, y: ty, vx: rnd(-140, 140), vy: rnd(-140, 140), life: 0.15, max: 0.15, sz: 1.4, drag: 6 });
      if (best.hp > best.T.hp * 0.25) best.burn = 0;
    } else if (I.gadgetP && s.player) s.msg = { t: 1, txt: 'NOTHING TO REPAIR HERE' };
    return;
  }
  if (!I.gadgetP || s.gcd > 0) return;
  const drop = (o, d, cd, snd) => { const [x, y] = muzzle(s, d); M.items.push(Object.assign({ x, y, team: s.team, owner: s }, o)); s.gcd = s.gmax = cd; s.handT = 0.45; s.handK = K.g; sfx(snd, s.x, s.y); };
  if (K.g === 'medbag') drop({ k: 'med', t: 12 }, 12, 16, 'drop');
  if (K.g === 'ammo') drop({ k: 'ammo', t: 15, given: new Map() }, 12, 18, 'drop');
  if (K.g === 'mine') {
    if (s.mines <= 0) { if (s.player) s.msg = { t: 1, txt: 'OUT OF MINES' }; return; }
    const mine = M.items.filter(i => i.k === 'mine' && i.owner === s); if (mine.length >= 3) mine[0].t = -1;
    drop({ k: 'mine', t: 9999, arm: 1.2 }, 14, 1, 'beep'); s.mines--;
  }
}
function updateItems(dt) {
  for (const it of M.items) {
    it.t -= dt;
    if (it.k === 'med') {
      for (const s of M.sol) if (s.alive && !s.veh && s.team === it.team && !s.down && s.hp < s.mhp && Math.hypot(s.x - it.x, s.y - it.y) < 58) { const h = Math.min(s.mhp - s.hp, 14 * dt); s.hp += h; if (it.owner && it.owner !== s) { it.owner.heal += h; it.acc = (it.acc || 0) + h; if (it.acc >= 25) { it.acc -= 25; addPts(it.owner, 10, 'HEAL'); } } if (s.player) psfx(s.player, 'heal'); }
    } else if (it.k === 'ammo') {
      for (const s of M.sol) {
        if (!s.alive || s.veh || s.team !== it.team || Math.hypot(s.x - it.x, s.y - it.y) > 58) continue;
        const last = it.given.get(s.id) || -9; if (M.time - last < 2) continue;
        let gave = false;
        if (refillRes(s, 0.35)) gave = true;
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
      for (const s of M.sol) if (s.alive && !s.veh && Math.hypot(s.x - it.x, s.y - it.y) < 16) { refillRes(s, 0.25); if (s.nades < KITS[s.kit].nades) s.nades++; it.t = -1; if (s.player) { psfx(s.player, 'pickup'); s.msg = { t: 1.2, txt: 'AMMO POUCH' }; } break; }
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
/* a clear path for blasts (sight is sees / sightK) */
function los(x0, y0, x1, y1) {
  for (const b of MAP.buildings) if (!b.glass && segRect(x0, y0, x1, y1, b, 0) >= 0) return false;
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
/* shells and rockets: blast radius, splash to soldiers / vehicles (a vehicle hit square-on takes the direct damage instead), direct damage */
const BLAST = { shell: { r: 78, s: 180, v: 60, big: true, tank: 210, veh: 300, sol: 200, n: 'CANNON' }, rocket: { r: 62, s: 110, v: 50, big: false, tank: 230, veh: 280, sol: 120, n: 'RPG' } };
function updateProjectiles(dt) {
  PRONE = M.sol.filter(s => s.alive && s.stance >= 1 && !s.veh);
  for (const p of M.proj) {
    EXP_REW = 0;
    if (p.k === 'nade') { updateNade(p, dt); continue; }
    EXP_REW = p.rew || 0;
    const x0 = p.x, y0 = p.y, x1 = x0 + p.vx * dt, y1 = y0 + p.vy * dt;
    let bt = 2, hit = null, gl = null, gt = 2;
    for (const b of MAP.buildings) {
      if (b.glass) { if (b.sec && b.sec.hp >= b.sec.mhp) { const t = segRect(x0, y0, x1, y1, b, 0); if (t >= 0 && t < gt) { gt = t; gl = b; } } continue; }   // windows let shots through (an intact one cracks)
      const t = segRect(x0, y0, x1, y1, b, 0); if (t >= 0 && t < bt) { bt = t; hit = { k: 'wall' }; }
    }
    for (const w of M.wrecks) { const t = segWreck(x0, y0, x1, y1, w); if (t >= 0 && t < bt) { bt = t; hit = { k: 'wall' }; } }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    staticsNear(mx, my, Math.hypot(x1 - x0, y1 - y0) / 2 + 14, _near);
    for (const s of _near) {
      if (s.type === 'fence') continue;
      if (s.type === 'bag' && p.k === 'bullet' && !bagBlocks(p, s)) continue;
      const t = segCirc(x0, y0, x1, y1, s.x, s.y, s.type === 'tree' ? 9 : s.type === 'hay' ? 12 : s.r); if (t >= 0 && t < bt) { bt = t; hit = { k: 'static', s }; }
    }
    // a joiner's shot is judged against where things were on their screen when they pulled the trigger (lag compensation)
    const T = p.rew ? netNow() - p.rew : 0;
    for (const s of M.sol) {
      if (!s.alive || s.down || s === p.src || !canHurt(p.src, s) || (p.src && s.team === p.src.team && !M.ff)) continue;
      if (s.veh && !s.veh.T.seats[s.seat].exposed) continue;
      const rad = s.veh ? 7 : s.swim ? 6 : [9, 6.5, 4.5][s.stance], o = p.rew ? lagAt(s, T) : s;
      const t = segCirc(x0, y0, x1, y1, o.x, o.y, rad); if (t >= 0 && t < bt) { bt = t; hit = { k: 'sol', s }; }
      else if (s.player && !p.whiz && p.k === 'bullet' && segCirc(x0, y0, x1, y1, s.x, s.y, 30) >= 0) { p.whiz = true; psfx(s.player, 'whiz'); }
    }
    for (const v of M.vehicles) {
      if (!v.active || v.dead) continue; const vt = vehTeam(v); if (vt >= 0 && p.src && vt === p.src.team && !M.ff) continue;
      if (p.src && p.src.veh === v) continue;
      const vo = p.rew ? lagAt(v, T) : v;
      if (Math.abs(vo.x - mx) > 140 || Math.abs(vo.y - my) > 140) continue;
      const [ax, ay] = toLocal(vo, x0, y0), [bx, by] = toLocal(vo, x1, y1);
      const t = segRect(ax, ay, bx, by, { x: -v.T.hl, y: -v.T.hw, w: v.T.hl * 2, h: v.T.hw * 2 }, 0);
      if (t >= 0 && t < bt) { bt = t; hit = { k: 'veh', v }; }
    }
    if (gl && gt <= bt) devGlass(gl.sec, x0 + (x1 - x0) * gt, y0 + (y1 - y0) * gt);
    if ((p.k === 'rocket' || p.k === 'shell') && Math.random() < 0.8) part({ k: 'smoke', x: p.x, y: p.y, vx: rnd(-10, 10), vy: rnd(-10, 10), life: 0.6, max: 0.6, sz: p.k === 'rocket' ? 7 : 5, drag: 2 });
    if (hit) {
      const hx = lerp(x0, x1, bt), hy = lerp(y0, y1, bt);
      p.life = 0;
      const B = BLAST[p.k];
      if (B) { explosion(hx, hy, B.r, B.s, hit.k === 'veh' ? 0 : B.v, p.src, p.team, B.big); if (hit.k === 'veh') hurtVehicle(hit.v, hit.v.type === 'tank' ? B.tank : B.veh, p.src); if (hit.k === 'sol') hurtSoldier(hit.s, B.sol, p.src, 'explosion', p.vx, p.vy, B.n); continue; }
      if (hit.k === 'sol') hurtSoldier(hit.s, p.dmg, p.src, p.mg ? 'mg' : 'bullet', p.vx, p.vy, p.wname);
      else if (hit.k === 'veh') {
        const v = hit.v; let victim = null;
        for (const o of v.seats) { if (!o || !v.T.seats[o.seat].exposed || !canHurt(p.src, o)) continue; const oo = p.rew ? lagAt(o, netNow() - p.rew) : o; if (Math.hypot(oo.x - hx, oo.y - hy) < 13) victim = o; }
        if (victim && Math.random() < 0.6) hurtSoldier(victim, p.dmg, p.src, p.mg ? 'mg' : 'bullet', p.vx, p.vy, p.wname);
        else { hurtVehicle(v, v.type === 'tank' ? p.vdmg * 0.2 : p.vdmg, p.src); sfx('ting', hx, hy); sparks(hx, hy, 3); }
      } else { sparks(hx, hy, 2); if (hit.k === 'static' && hit.s.type === 'bag') part({ k: 'dirt', x: hx, y: hy, vx: -p.vx * 0.05 + rnd(-20, 20), vy: -p.vy * 0.05 + rnd(-20, 20), life: 0.3, max: 0.3, sz: 2, drag: 4 }); }
      continue;
    }
    p.x = x1; p.y = y1; p.life -= dt;
    if (p.x < -SKIRT || p.y < -SKIRT || p.x > WW + SKIRT || p.y > WH + SKIRT) p.life = 0;
    if (p.life <= 0 && BLAST[p.k]) { const B = BLAST[p.k]; explosion(p.x, p.y, B.r, B.s, B.v, p.src, p.team, B.big); }
    if (p.life <= 0 && p.k === 'bullet' && inWater(p.x, p.y)) part({ k: 'steam', x: p.x, y: p.y, vx: 0, vy: 0, life: 0.4, max: 0.4, sz: 4, drag: 0 });
  }
  EXP_REW = 0;
  prune(M.proj, p => p.life > 0);
}
/* host: the last ~0.6 s of where everyone was (host clock), so a joiner's shots can be checked against the past they saw */
function lagRecord() {
  const t = netNow(), rec = e => {
    const h = e.lh || (e.lh = []);
    if (h.length && h[h.length - 4] === t) h.length -= 4;
    h.push(t, e.x, e.y, e.a || 0); if (h.length > 160 || (h.length > 8 && t - h[0] > 600)) h.splice(0, 4);
  };
  for (const s of M.sol) if (s.alive) rec(s);
  for (const v of M.vehicles) if (v.active && !v.dead) rec(v);
}
const _lag = { x: 0, y: 0, a: 0 };
function lagAt(e, T) {
  const h = e.lh; if (!h || !h.length || T >= h[h.length - 4]) return e;
  for (let i = h.length - 8; i >= 0; i -= 4) {
    if (h[i] > T) continue;
    const j = i + 4, k = (T - h[i]) / Math.max(1, h[j] - h[i]);
    if (Math.hypot(h[j + 1] - h[i + 1], h[j + 2] - h[i + 2]) > 200) { _lag.x = h[j + 1]; _lag.y = h[j + 2]; _lag.a = h[j + 3]; return _lag; }   // a respawn or teleport: no sliding across the map
    _lag.x = lerp(h[i + 1], h[j + 1], k); _lag.y = lerp(h[i + 2], h[j + 2], k); _lag.a = lerpAng(h[i + 3], h[j + 3], k); return _lag;
  }
  _lag.x = h[1]; _lag.y = h[2]; _lag.a = h[3]; return _lag;
}
function sparks(x, y, n) { for (let i = 0; i < n; i++) { const a = rnd(0, TAU), s = rnd(60, 200); part({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.08, 0.2), max: 0.2, sz: 1.5, drag: 6 }); } }
function updateNade(p, dt) {
  p.vh -= 700 * dt; p.h = Math.max(0, p.h + p.vh * dt); if (p.h === 0 && p.vh < 0) { p.vh = -p.vh * 0.35; if (Math.abs(p.vh) > 40) sfx('clink', p.x, p.y); p.vx *= 0.6; p.vy *= 0.6; }
  const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
  let bounced = false;
  for (const b of MAP.buildings) if (inRect(nx, ny, b, 3)) { if (b.glass) { if (b.sec) devGlass(b.sec, nx, ny); continue; } if (p.x < b.x - 2 || p.x > b.x + b.w + 2) p.vx *= -0.5; else p.vy *= -0.5; bounced = true; }
  if (p.h < 14) { staticsNear(nx, ny, 16, _near); for (const s of _near) if (s.type !== 'fence' && Math.hypot(nx - s.x, ny - s.y) < s.r + 3) { const dx = nx - s.x, dy = ny - s.y, d = Math.hypot(dx, dy) || 1, dot = (p.vx * dx + p.vy * dy) / d; p.vx -= 1.6 * dot * dx / d; p.vy -= 1.6 * dot * dy / d; bounced = true; } }
  if (bounced) sfx('clink', p.x, p.y); else { p.x = nx; p.y = ny; }
  p.x = clamp(p.x, 10 - SKIRT, WW + SKIRT - 10); p.y = clamp(p.y, 10 - SKIRT, WH + SKIRT - 10);
  if (p.h === 0) { p.vx *= Math.exp(-dt * 3); p.vy *= Math.exp(-dt * 3); }
  p.rot += dt * 12; p.life -= dt;
  if (p.life <= 0) { if (p.smoke) popSmoke(p.x, p.y); else explosion(p.x, p.y, 88, 150, 90, p.src, p.team, false); }
}

/* ---------------- soldier control ---------------- */
/* someone who moved d px this frame, heading ang: walk cycle, footprints (they fade over a couple of minutes), rustling, ripples */
function stepFx(s, d, ang, dt) {
  const pr = s.stance === 2; s.moving = d / Math.max(dt, 1e-3) > (pr ? 6 : 18); s.walkT += d;
  if (s.moving && !s.swim && !(s.jumpT > 0)) { s.stepAcc += d; if (s.stepAcc > (pr ? 10 : 9)) { s.stepAcc = 0; s.stepSide = -s.stepSide; footprint(s.x, s.y, ang, pr ? 0 : s.stepSide, pr); } }
  if (pr && s.moving && Math.random() < dt * 3) sfx('rustle', s.x, s.y, 0.5);
  if (s.swim && s.moving && Math.random() < dt * 4) { sfx('splash', s.x, s.y, 0.5); part({ k: 'ripple', x: s.x, y: s.y, vx: 0, vy: 0, life: 0.9, max: 0.9, sz: 14, drag: 0 }); }
}
function controlSoldier(s, I, dt) {
  s.flash -= dt; s.fireCd -= dt; s.nadeCd -= dt; s.protect -= dt; s.hurtT -= dt; s.hitT -= dt; s.stanceT -= dt; s.gcd -= dt; s.firedT -= dt; s.spotT -= dt; s.meleeCd -= dt; s.meleeT -= dt; s.spotCd -= dt; s.handT = (s.handT || 0) - dt;
  s.bloom = Math.max(0, s.bloom - dt * 1.8);
  if (s.msg) { s.msg.t -= dt; if (s.msg.t <= 0) s.msg = null; }
  for (const p of s.pops) p.t -= dt; prune(s.pops, p => p.t > 0);
  if (I.aimA !== null && I.aimA !== undefined) {
    if (s.stance === 2 && !s.veh) s.a += clamp(angDiff(s.a, I.aimA), -4 * dt, 4 * dt); else s.a = I.aimA;
  }
  if (M.time - s.lastHurt > 5 && s.hp < s.mhp) s.hp = Math.min(s.mhp, s.hp + 9 * dt * s.mhp / 100);
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
    for (const o of M.sol) { if (!o.alive || !isEnemy(s.team, o.team)) continue; const dx = o.x - s.x, dy = o.y - s.y, d = Math.hypot(dx, dy); if (d < 760 && Math.abs(angDiff(s.a, Math.atan2(dy, dx))) < 0.4 && sees(s.x, s.y, o.x, o.y)) { o.spotT = 6; o.spotTeam = s.team; n++; } }
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
      if (s.jumpT <= 0.04) { staticsNear(s.x, s.y, 20, _near); if ((_near.some(o => LOW[o.type] && Math.hypot(o.x - s.x, o.y - s.y) < o.r + s.r) || MAP.buildings.some(b => b.glass && inRect(s.x, s.y, b, s.r))) && s.jumpT > -0.4) s.jumpT = 0.05; else if (s.jumpT <= 0) { s.jumpT = 0; for (let i = 0; i < 3; i++) part({ k: 'dust', x: s.x, y: s.y, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 0.5, max: 0.5, sz: 6, drag: 3 }); } }
    }
    s.x += s.vx * dt; s.y += s.vy * dt;
    soldierCollide(s);
  }
  stepFx(s, Math.hypot(s.vx, s.vy) * dt, Math.atan2(s.vy, s.vx), dt);
  if (s.stance === 2 && s.moving && (I.aimA === null || I.aimA === undefined)) s.a += clamp(angDiff(s.a, Math.atan2(s.vy, s.vx)), -4 * dt, 4 * dt);
  if (sprint && (I.aimA === null || I.aimA === undefined)) s.a = Math.atan2(s.vy, s.vx);
  if (s.swim) return;
  useGadget(s, I, dt);
  const st = cw(s);
  if (I.reload || (st.mag === 0 && st.res > 0 && s.reloadT <= 0)) startReload(s);
  if (I.fire && !sprint && !s.torch && s.fireCd <= 0 && s.stanceT <= 0) {
    if (s.reloadT <= 0 && !pullTrigger(s) && st.res <= 0 && s.w[1 - s.wi].mag + s.w[1 - s.wi].res > 0) s.wi = 1 - s.wi;      // dry: over to the other gun
  }
  if (I.nadeCyc && s.smokes + s.nades > 0) { s.throwSel = 1 - s.throwSel; sfx('ui'); }
  if (I.alt && canThrow(s) && s.nadeCd <= 0) throwNade(s, I.altDist || 240, !!s.bot);
  for (const c of M.crates) if (c.live && Math.hypot(c.x - s.x, c.y - s.y) < 16) pickupCrate(s, c);
}
/* tops up every weapon's reserve by a share of a full one; true if anything went in */
function refillRes(s, frac) { let gave = false; for (const w of s.w) { const R = WPN[w.id].res; if (w.res < R) { w.res = Math.min(R, w.res + Math.ceil(R * frac)); gave = true; } } return gave; }
function pickupCrate(s, c) {
  c.live = false; c.t = 24;
  const r = Math.random(); let txt;
  if (s.hp < s.mhp * 0.6 && r < 0.6) { s.hp = s.mhp; txt = 'MEDKIT'; }
  else if (r < 0.45) { for (const w of s.w) { w.res = WPN[w.id].res; } txt = 'FULL AMMO'; }
  else if (r < 0.75) { s.nades = Math.min(5, s.nades + 2); txt = 'GRENADES +2'; }
  else { s.hp = Math.min(s.mhp, s.hp + 0.4 * s.mhp); refillRes(s, 0.5); txt = 'FIELD KIT'; }
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
    if (I.fire && s.fireCd <= 0 && s.reloadT <= 0) pullTrigger(s);
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
const _po = { x: 0, y: 0 };
function updateVehicle(v, dt) {
  if (!v.active) {
    engineUpdate(v);      // a wreck's engine has to be told to stop, or it hums on at full volume until the respawn
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
    const rep = netDriveRep(v, driver);
    if (rep) netAuthDrive(v, rep, dt);              // an online joiner drives this one themselves; the host checks it
    else {
      const ox = v.x, oy = v.y;
      vehDrive(v, ctl.mx, ctl.my, dt, false);
      if (v.type === 'tank' && driver && v.aimT !== undefined) { const st = clamp(angDiff(v.ta, v.aimT), -1.7 * dt, 1.7 * dt); if (!barrelHits(v, v.ta + st) || barrelHits(v, v.ta)) v.tRel += st; }   // the barrel can't swing into a wall
      syncMounts(v);
      vehTrackFx(v, Math.hypot(v.x - ox, v.y - oy) + Math.abs(v.av) * dt * 20);
    }
  }
  // soldiers on foot: run over if it's moving fast, otherwise stepped out of the hull
  const sp = Math.hypot(v.vx, v.vy), drv = v.seats[0], vt = vehTeam(v);
  for (const s of M.sol) {
    if (!s.alive || s.veh) continue;
    if (Math.abs(s.x - v.x) > 80 || Math.abs(s.y - v.y) > 80) continue;
    _po.x = s.x; _po.y = s.y; if (!pushOutVeh(_po, s.r, v)) continue;
    if (T.drive && sp > 50 && drv && (isEnemy(vt, s.team) || (M.ff && vt === s.team))) { s.protect = 0; hurtSoldier(s, 999, drv, 'crush', v.vx, v.vy, 'ROADKILL'); if (drv.player) rumble(drv.player, 0.5, 0.15); continue; }
    s.x = _po.x; s.y = _po.y; soldierCollide(s);
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
/* engine, steering and grip for one step. `local`: a joiner driving their own vehicle, where collisions only move
   this vehicle (the host does the crushing, the shoving and the damage) */
function vehDrive(v, mx, my, dt, local) {
  const T = v.T, m = Math.min(1, Math.hypot(mx, my)); let throttle = 0, steer = 0;
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
  v.x += v.vx * dt; v.y += v.vy * dt;
  vehicleCollide(v, local);
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
    for (const o of M.sol) if (o.alive && isEnemy(r.team, o.team) && Math.hypot(o.x - r.x, o.y - r.y) < 520 && sees(r.x, r.y, o.x, o.y)) { o.spotT = 1.5; o.spotTeam = r.team; }
  }
}
