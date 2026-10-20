/* =====================================================================
   DEV MODE: a small tile-based test yard plus tools (no-AI dummies, vehicle spawns, toggles, a TTK log).
   The yard is a grid of TILE px tiles. Buildings are made of rectangular sections on that grid; each intact
   section is a solid rect in MAP.buildings, so collision, bullets, sight and paths treat it like any wall.
   A blast hurts nearby sections; one that runs out of health collapses and its tiles turn to rubble.
   ===================================================================== */
const TILE = 24, DEV_COLS = 48, DEV_ROWS = 32;
const DEV = { open: true, god: false, ammo: true, respawn: true, grid: true, secs: true, range: 6, log: [], nums: [], lastA: 0, over: false, B: [], R: null };
const DEV_RANGES = [2, 4, 6, 8, 10, 15, 20, 30];
/* section health = base + per tile */
const MATS = {
  wood: { n: 'WOOD', hp: [60, 10], c: '#8a6a44', e: '#5a4228' },
  brick: { n: 'BRICK', hp: [150, 18], c: '#9a5a48', e: '#5e342a' },
  concrete: { n: 'CONCRETE', hp: [400, 40], c: '#8e8e88', e: '#55554f' }
};
/* structural damage per blast, keyed by blast radius: rocket 62, tank shell 78, frag 88; anything else x1 */
const STRUCT_K = { 62: 1.6, 78: 2, 88: 0.35 };
/* buildings: a material and its sections [tx, ty, tw, th] in tiles */
const DEV_BUILDINGS = [
  { mat: 'brick', secs: [[14, 4, 6, 4], [20, 4, 4, 4], [14, 8, 3, 3], [17, 8, 7, 3]] },
  { mat: 'wood', secs: [[30, 18, 8, 2], [30, 20, 3, 6], [33, 20, 5, 3], [33, 23, 5, 3]] },
  { mat: 'brick', secs: [[8, 18, 1, 3], [8, 21, 1, 3], [8, 24, 1, 4]] },
  { mat: 'concrete', secs: [[40, 5, 4, 4]] },
  { mat: 'wood', secs: [[24, 23, 2, 2]] }
];
const tileC = t => (t + 0.5) * TILE;

function buildDevMap() {
  const TL = { cols: DEV_COLS, rows: DEV_ROWS, own: new Int16Array(DEV_COLS * DEV_ROWS).fill(-1), rubble: new Uint8Array(DEV_COLS * DEV_ROWS), secs: [], blds: [] };
  const m = { id: 'devyard', tiled: TL, arcs: [], roads: [], buildings: [], water: [], bridges: [], statics: [], flags: [], bases: [], crateSpots: [], vehSpawns: [], ffaSpawns: [], fields: [], fwd: [], ice: [] };
  MAP = m;
  DEV_BUILDINGS.forEach((B, bi) => {
    TL.blds.push({ mat: B.mat });
    for (const [tx, ty, tw, th] of B.secs) {
      const mt = MATS[B.mat], hp = mt.hp[0] + mt.hp[1] * tw * th;
      const sec = { i: TL.secs.length, bld: bi, mat: B.mat, tx, ty, tw, th, hp, mhp: hp, alive: true, hitT: 0 };
      sec.b = { x: tx * TILE, y: ty * TILE, w: tw * TILE, h: th * TILE, sec };
      TL.secs.push(sec); m.buildings.push(sec.b);
      for (let j = ty; j < ty + th; j++) for (let i = tx; i < tx + tw; i++) TL.own[j * DEV_COLS + i] = sec.i;
    }
  });
  const pad = { x: 0, y: 0, w: 0, h: 0 };
  m.bases = [{ team: 0, x: tileC(3), y: tileC(16), pad }, { team: 1, x: tileC(44), y: tileC(16), pad }];
  m.fwd = m.bases.map(b => ({ x: b.x, y: b.y }));
  m.ffaSpawns = [[3, 16], [44, 16], [24, 28], [24, 2]].map(([i, j]) => ({ x: tileC(i), y: tileC(j) }));
  m.vehSpawns.push({ type: 'jeep', x: tileC(5), y: tileC(4), a: 0, team: 0 }, { type: 'tank', x: 6 * TILE, y: tileC(28), a: 0, team: 0 }, { type: 'nest', x: tileC(26), y: tileC(14), a: Math.PI, team: -1 });
  // a little cover to blow up: trees, hay, one sandbag crescent
  [[11, 12], [27, 4], [36, 10], [21, 27]].forEach(([i, j], k) => m.statics.push({ type: 'tree', x: tileC(i), y: tileC(j), r: 10, v: k % 4, sc: 0.9, a: k * 1.3, alive: true, pine: false }));
  [[12, 27], [28, 11]].forEach(([i, j]) => m.statics.push({ type: 'hay', x: tileC(i), y: tileC(j), r: 13, a: 0.4, alive: true }));
  { const A = { x: tileC(20), y: tileC(16), a: 0, bags: [], lost: 0 }; m.arcs.push(A); const c = Math.cos(A.a), sn = Math.sin(A.a);
    for (const [px, py] of EXTRA.bagPts) { const st = { type: 'bag', x: A.x + px * c - py * sn, y: A.y + px * sn + py * c, a: 0, r: 8, alive: true, arc: A }; A.bags.push(st); m.statics.push(st); } }
  buildHash();
}
/* plain ground, rubble where sections fell, flat-coloured roofs */
function paintDevGround() {
  gx.setTransform(1, 0, 0, 1, 0, 0); gx.globalAlpha = 1; gx.globalCompositeOperation = 'source-over';
  gx.fillStyle = '#5b6248'; gx.fillRect(0, 0, WW, WH);
  SKIRT_PAT = '#3c4232';
  const TL = MAP.tiled;
  for (let j = 0; j < TL.rows; j++) for (let i = 0; i < TL.cols; i++) if (TL.rubble[j * TL.cols + i]) paintRubble(i, j);
  buildDevRoofs();
}
function paintRubble(i, j) {
  const x = i * TILE, y = j * TILE, R = mulberry(i * 131 + j * 7 + 1);
  gx.fillStyle = '#6e675c'; gx.fillRect(x, y, TILE, TILE);
  for (let k = 0; k < 8; k++) { const s = 2 + R() * 4; gx.fillStyle = R() < 0.5 ? '#4f4a42' : '#8a8276'; gx.fillRect(x + R() * (TILE - s), y + R() * (TILE - s), s, s); }
}
/* a building's outline runs only along its outside, so its sections read as one building */
function buildDevRoofs(bi) {
  const TL = MAP.tiled;
  const same = (sec, a, b) => { if (a < 0 || b < 0 || a >= TL.cols || b >= TL.rows) return false; const o = TL.own[b * TL.cols + a]; return o >= 0 && TL.secs[o].alive && TL.secs[o].bld === sec.bld; };
  for (const sec of TL.secs) {
    if (!sec.alive || (bi !== undefined && sec.bld !== bi)) continue;
    const c = mk(sec.tw * TILE, sec.th * TILE), g = c.getContext('2d'), mt = MATS[sec.mat];
    g.fillStyle = mt.c; g.fillRect(0, 0, sec.tw * TILE, sec.th * TILE); g.fillStyle = mt.e;
    for (let j = 0; j < sec.th; j++) for (let i = 0; i < sec.tw; i++) {
      const ti = sec.tx + i, tj = sec.ty + j, x = i * TILE, y = j * TILE;
      if (!same(sec, ti, tj - 1)) g.fillRect(x, y, TILE, 3);
      if (!same(sec, ti, tj + 1)) g.fillRect(x, y + TILE - 3, TILE, 3);
      if (!same(sec, ti - 1, tj)) g.fillRect(x, y, 3, TILE);
      if (!same(sec, ti + 1, tj)) g.fillRect(x + TILE - 3, y, 3, TILE);
    }
    sec.b.roofC = c;
  }
}

/* ---------------- structure damage ---------------- */
function devBlast(x, y, r, dmg) {
  const R = r * 0.6, k = STRUCT_K[r] || 1;
  for (const sec of MAP.tiled.secs) {
    if (!sec.alive) continue;
    const b = sec.b, nx = clamp(x, b.x, b.x + b.w), ny = clamp(y, b.y, b.y + b.h), d = Math.hypot(nx - x, ny - y); if (d > R) continue;
    const v = dmg * k * clamp(1 - d / R, 0.3, 1);
    sec.hp -= v; sec.hitT = 0.35; devNum(nx, ny, v, '#ffb060');
    if (sec.hp <= 0) devCollapse(sec);
  }
}
function devCollapse(sec) {
  const TL = MAP.tiled; sec.alive = false; sec.hp = 0;
  const bi = MAP.buildings.indexOf(sec.b); if (bi >= 0) MAP.buildings.splice(bi, 1);
  for (let j = sec.ty; j < sec.ty + sec.th; j++) for (let i = sec.tx; i < sec.tx + sec.tw; i++) {
    TL.rubble[j * TL.cols + i] = 1; paintRubble(i, j);
    const cx = tileC(i), cy = tileC(j);
    part({ k: 'dust', x: cx, y: cy, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 1.6, max: 1.6, sz: rnd(18, 30), drag: 1.5 });
    for (let n = 0; n < 2; n++) { const a = rnd(0, TAU), sp = rnd(40, 160); part({ k: 'debris', x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.4, 0.9), max: 0.9, sz: rnd(2, 4), rot: rnd(0, TAU), vr: rnd(-12, 12), drag: 3 }); }
  }
  buildDevRoofs(sec.bld); navDirty = 1; M.fogMem = null;
  sfx('boom', sec.b.x + sec.b.w / 2, sec.b.y + sec.b.h / 2);
  devLog(`${MATS[sec.mat].n} ${sec.tw}×${sec.th} SECTION DOWN`, '#ffb060');
}

/* ---------------- dummies + TTK ---------------- */
function devPlayer() { return LOCALS().find(p => p.sol && p.sol.alive) || null; }
/* a tile centre `tiles` tiles ahead of the player, along where they were last aiming */
function devAhead(tiles) {
  const p = devPlayer(); if (!p) return null; const s = p.sol, o = s.veh || s, a = DEV.lastA;
  const x = clamp(o.x + Math.cos(a) * tiles * TILE, TILE, WW - TILE), y = clamp(o.y + Math.sin(a) * tiles * TILE, TILE, WH - TILE);
  return [tileC(Math.floor(x / TILE)), tileC(Math.floor(y / TILE)), a];
}
function devSpawnDummy() {
  const q = devAhead(DEV.range); if (!q) return;
  if (solidAt(q[0], q[1], 6)) { devLog('NO ROOM THERE', '#ff7a60'); return; }
  const s = makeSoldier({ team: 1, color: M.teamColor[1], name: 'DUMMY ' + (M.sol.filter(o => o.dummy).length + 1), bot: true });
  s.dark = true; s.kit = 0; s.dummy = { x: q[0], y: q[1], a: q[2] + Math.PI };
  M.sol.push(s); devReviveDummy(s);
}
function devReviveDummy(s) {
  giveLoadout(s); const d = s.dummy;
  Object.assign(s, { x: d.x, y: d.y, a: d.a, hp: s.mhp, alive: true, down: false, protect: 0, respawnT: 1e9, veh: null, seat: -1, seatT: 0, stance: 0, stanceT: 0, swim: false, vx: 0, vy: 0, reloadT: 0, fireCd: 0, lastHurt: -9, ttk: null });
}
function devClearDummies() { M.sol = M.sol.filter(s => !s.dummy); }
function devHit(s, dmg) {
  if (!s.ttk || s.hp + dmg >= s.mhp - 0.01) s.ttk = { t0: M.time, hits: 0, dmg: 0 };
  s.ttk.hits++; s.ttk.dmg += dmg; devNum(s.x, s.y - 14, dmg, '#ffffff');
}
function devKill(s, src, kind, wname) {
  const t = s.ttk; if (!t) return;
  const o = src ? (src.veh || src) : null, d = o ? Math.hypot(o.x - s.x, o.y - s.y) / TILE : 0;
  const w = wname || (src && !src.veh && cw(src) ? WPN[cw(src).id].n : String(kind || '').toUpperCase());
  devLog(`${w} · ${(M.time - t.t0).toFixed(2)} s · ${t.hits} HIT${t.hits === 1 ? '' : 'S'} · ${d.toFixed(1)} TILES`, '#7dff7a');
}
function devNum(x, y, v, c) { DEV.nums.push({ x: x + rnd(-4, 4), y, v: Math.round(v), c, t: 0.9 }); if (DEV.nums.length > 60) DEV.nums.shift(); }
function devLog(text, c) { DEV.log.unshift({ text, c }); if (DEV.log.length > 9) DEV.log.length = 9; }

/* ---------------- vehicles / world ---------------- */
function devSpawnVeh(type) {
  const q = devAhead(type === 'tank' ? 6 : 4); if (!q) return;
  if (solidAt(q[0], q[1], VT[type].hw || 14)) { devLog('NO ROOM THERE', '#ff7a60'); return; }
  M.vehicles.push(makeVehicle({ type, x: q[0], y: q[1], a: q[2], team: -1, dev: true }));
}
function devClearVehicles() {
  for (const v of M.vehicles) if (!v.seats.some(o => o)) { if (v.eng) { try { v.eng.o.stop(); } catch (e) { } v.eng = null; } if (v.eng2) engineStop2(v); v.gone = true; }
  M.vehicles = M.vehicles.filter(v => !v.gone); M.wrecks.length = 0; navDirty = 1;
}
function devResetMap() {
  buildDevMap(); MAP.statics.forEach((s, i) => s.idx = i); paintGround(); buildNav(); M.fogMem = null; M.wrecks.length = 0;
  for (const sp of MAP.vehSpawns) if (!M.vehicles.some(v => v.sp.type === sp.type && !v.sp.dev)) M.vehicles.push(makeVehicle(sp));
  for (const s of M.sol) if (s.alive && !s.veh && solidAt(s.x, s.y, 4)) [s.x, s.y] = freeSpot(s.x, s.y);
  devLog('MAP RESET', '#ffe08a');
}
function devHeal() { const p = devPlayer(); if (!p) return; const s = p.sol; s.hp = s.mhp; if (s.veh) s.veh.hp = s.veh.T.hp; }

/* every frame of a dev match */
function devTick(dt) {
  if (KB.pressed.has('Backquote')) DEV.open = !DEV.open;
  for (const n of DEV.nums) { n.t -= dt; n.y -= dt * 18; }
  prune(DEV.nums, n => n.t > 0);
  if (MAP.tiled) for (const sec of MAP.tiled.secs) if (sec.hitT > 0) sec.hitT -= dt;
  const r = DEV.R, mx = KB.mouse.x, my = KB.mouse.y;
  DEV.over = !TOUCH.active && !!r && mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
  const p = devPlayer(); if (!p) return; const s = p.sol;
  if (!DEV.over) DEV.lastA = s.a;               // spawns go where you were aiming before the mouse went to the panel
  if (DEV.ammo) {
    for (const w of s.w || []) { w.mag = WPN[w.id].mag; w.res = WPN[w.id].res; }
    s.nades = Math.max(s.nades, 2); s.smokes = Math.max(s.smokes || 0, 1); if (KITS[s.kit].g === 'mine') s.mines = Math.max(s.mines, 2);
  }
}

/* ---------------- drawing ---------------- */
function devDrawWorld(vw) {
  const TL = MAP.tiled; worldT();
  if (TL && DEV.grid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1 / VZ; ctx.beginPath();
    for (let i = 0; i <= TL.cols; i++) { ctx.moveTo(i * TILE, 0); ctx.lineTo(i * TILE, TL.rows * TILE); }
    for (let j = 0; j <= TL.rows; j++) { ctx.moveTo(0, j * TILE); ctx.lineTo(TL.cols * TILE, j * TILE); }
    ctx.stroke();
  }
  const bar = (cx, cy, w, f) => { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - w / 2 - 1, cy - 3, w + 2, 6); ctx.fillStyle = f > 0.5 ? '#7dff7a' : f > 0.25 ? '#ffe08a' : '#ff5a45'; ctx.fillRect(cx - w / 2, cy - 2, w * clamp(f, 0, 1), 4); };
  if (TL && DEV.secs) for (const sec of TL.secs) {
    if (!sec.alive) continue; const b = sec.b, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    ctx.strokeStyle = sec.hitT > 0 ? '#ff6040' : 'rgba(255,224,138,0.85)'; ctx.lineWidth = 2 / VZ; ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
    bar(cx, cy - 4, Math.min(b.w - 8, 56), sec.hp / sec.mhp);
    stxt(Math.ceil(sec.hp) + '/' + sec.mhp, cx, cy + 9, 8, '#fff', 'center', 'middle', FD);
  }
  for (const s of M.sol) if (s.dummy && s.alive) { bar(s.x, s.y - 20, 26, s.hp / s.mhp); stxt(String(Math.ceil(s.hp)), s.x, s.y - 28, 8, '#fff', 'center', 'middle', FD); }
  for (const v of M.vehicles) if (v.active && !v.dead) { const y = v.y - (v.T.hw || 16) - 16; bar(v.x, y, 40, v.hp / v.T.hp); stxt(Math.ceil(v.hp) + '/' + v.T.hp, v.x, y - 9, 8, '#fff', 'center', 'middle', FD); }
  for (const n of DEV.nums) { ctx.globalAlpha = Math.min(1, n.t * 2); stxt(String(n.v), n.x, n.y, 10, n.c, 'center', 'middle', FD); }
  ctx.globalAlpha = 1;
}
/* top of the screen in place of the ticket bar */
function devHUD(u, top) {
  const cx = W / 2, bw = 360 * u;
  ctx.fillStyle = 'rgba(8,12,6,0.7)'; ctx.fillRect(cx - bw / 2, top, bw, 34 * u);
  stxt('DEV MODE', cx, top + 15 * u, 13 * u, '#ffe08a', 'center', 'middle', FD);
  const l = DEV.log[0]; txt(l ? l.text : (TOUCH.active ? 'TAP DEV FOR TOOLS' : '` OPENS THE TOOLS'), cx, top + 27 * u, 10 * u, l ? l.c : 'rgba(242,230,196,0.6)', 'center', 'middle', FD);
}
/* the tool panel (right side); clicks are taken in pointerdown via devClick so they never fire the gun */
function devDrawPanel() {
  screenT(); DEV.B = [];
  const u = clamp(W / 1100, 0.75, 1.1), fs = 11 * u, rh = 25 * u, gap = 5 * u, pw = 250 * u, x0 = W - SAFE.r - pw - 10 * u, y0 = SAFE.t + 52 * u;
  const btn = (label, fn, x, y, w, on) => {
    ctx.fillStyle = on === true ? 'rgba(125,255,122,0.22)' : 'rgba(32,42,26,0.95)'; ctx.fillRect(x, y, w, rh);
    ctx.strokeStyle = on === true ? '#7dff7a' : 'rgba(242,230,196,0.28)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, rh - 1);
    txt(label, x + w / 2, y + rh / 2 + 1, fs, on === false ? 'rgba(242,230,196,0.55)' : '#f2e6c4', 'center', 'middle', FD);
    DEV.B.push({ x, y, w, h: rh, fn });
  };
  if (!DEV.open) {
    const w = 64 * u; btn('DEV', () => DEV.open = true, W - SAFE.r - w - 10 * u, y0, w);
    DEV.R = { x: W - SAFE.r - w - 10 * u, y: y0, w, h: rh }; return;
  }
  const cw2 = (pw - 24 * u - gap) / 2, L = x0 + 12 * u, R2 = L + cw2 + gap;
  let y = y0 + 34 * u;
  const head = t => { txt(t, L, y + 8 * u, 10 * u, 'rgba(255,224,138,0.8)', 'left', 'middle', FD); y += 18 * u; };
  const row = (a, b) => { if (a) btn(...a.slice(0, 2), L, y, b ? cw2 : cw2 * 2 + gap, a[2]); if (b) btn(...b.slice(0, 2), R2, y, cw2, b[2]); y += rh + gap; };
  // measure first so the backdrop fits
  const H0 = 34 * u + 18 * u * 4 + (rh + gap) * 9 + Math.min(DEV.log.length, 9) * 15 * u + 16 * u;
  ctx.fillStyle = 'rgba(6,10,5,0.86)'; ctx.fillRect(x0, y0, pw, H0); ctx.strokeStyle = 'rgba(255,224,138,0.5)'; ctx.strokeRect(x0 + 0.5, y0 + 0.5, pw - 1, H0 - 1);
  DEV.R = { x: x0, y: y0, w: pw, h: H0 };
  stxt('DEV TOOLS', L, y0 + 18 * u, 15 * u, '#ffe08a', 'left', 'middle', FD);
  btn('×', () => DEV.open = false, x0 + pw - 34 * u, y0 + 6 * u, 26 * u);
  head('SPAWN');
  row(['DUMMY', devSpawnDummy], ['CLEAR DUMMIES', devClearDummies]);
  row([`‹  RANGE ${DEV.range} TILES  ›`, d => { const i = DEV_RANGES.indexOf(DEV.range); DEV.range = DEV_RANGES[clamp(i + d, 0, DEV_RANGES.length - 1)]; }]);
  row(['JEEP', () => devSpawnVeh('jeep')], ['TANK', () => devSpawnVeh('tank')]);
  row(['MG NEST', () => devSpawnVeh('nest')], ['CLEAR VEHICLES', devClearVehicles]);
  head('TOGGLES');
  row(['GOD MODE', () => DEV.god = !DEV.god, DEV.god], ['INF AMMO', () => DEV.ammo = !DEV.ammo, DEV.ammo]);
  row(['DUMMY RESPAWN', () => DEV.respawn = !DEV.respawn, DEV.respawn], ['LINE OF SIGHT', () => M.cfg.fog = M.cfg.fog === 'off' ? 'los' : 'off', M.cfg.fog !== 'off']);
  row(['GRID', () => DEV.grid = !DEV.grid, DEV.grid], ['SECTIONS', () => DEV.secs = !DEV.secs, DEV.secs]);
  head('WORLD');
  row(['RESET MAP', devResetMap], ['HEAL ME', devHeal]);
  row(['CLEAR LOG', () => DEV.log.length = 0]);
  head('LOG');
  for (const l of DEV.log) { txt(l.text, L, y + 6 * u, 10 * u, l.c, 'left', 'middle', FD); y += 15 * u; }
}
/* pointerdown on the panel: run the button, swallow the click (true) */
function devClick(x, y) {
  const r = DEV.R; if (!r) return false;
  for (const b of DEV.B) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(x < b.x + b.w / 2 ? -1 : 1); sfx('ui'); return true; }
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
/* from the main menu: straight into the yard, one player, no bots */
function startDev(dev) {
  if (NET.role) return;
  engineKillAll(); PLAYERS = []; lobbyJoin(dev && dev.type ? dev : { type: 'kb' });
  const p = PLAYERS[0]; if (!p) return; p.team = 0; p.ready = true;
  DEV.log.length = 0; DEV.nums.length = 0;
  newMatch({ ...CFG, dev: true, mode: 1, bots: 0, ff: false, weather: 'clear', fog: 'off', limit: 1, camera: 'split' }, false);
  setState('play'); Music.mode = 'battle';
}
