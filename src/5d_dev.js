/* =====================================================================
   DEV MODE: a small tile-based test yard plus tools (no-AI dummies, vehicle spawns, toggles, a TTK log).
   Two grids: TILE (32 px, about a soldier) and the SUB grid (16 px) that walls are built on.
   Houses come from genHouse: an outline (rectangle or L), split into 3-4 rooms, the fewest inner doors that join
   them, a front and a back door, 1-2 windows per room. Wall cells are drawn from the 16 px tile sheet (art/walls16.png).
   Walls are cut into structural sections (short runs of wall cells); each live section is a solid rect in
   MAP.buildings, so collision, bullets and paths need nothing new. A blast that empties a section turns its
   cells to rubble. Windows block movement but not sight or bullets (b.glass).
   ===================================================================== */
const TILE = 32, SUB = 16, DEV_COLS = 48, DEV_ROWS = 32;
const C_OUT = 0, C_FLOOR = 1, C_WALL = 2, C_WIN = 3, C_RUB = 4;
const ROOM_MIN = 36, ROOM_SIDE = 5, SEC_MAX = 6;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];          // up, right, down, left
const DEV = { open: true, god: false, ammo: true, respawn: true, grid: true, secs: true, range: 6, log: [], nums: [], lastA: 0, over: false, B: [], R: null, seed: 1 };
const DEV_RANGES = [2, 4, 6, 8, 10, 15, 20, 30];
/* structural damage per blast, keyed by blast radius: rocket 62, tank shell 78, frag 88; anything else x1 */
const STRUCT_K = { 62: 1.6, 78: 2, 88: 0.35 };
const tileC = t => (t + 0.5) * TILE;
/* house slots in SUB cells: top-left corner and the largest size a house there may take */
const DEV_LOTS = [[12, 4, 24, 20], [56, 4, 24, 20], [28, 38, 26, 22]];

/* ---------------- the tile sheet ---------------- */
const WALL_IMG = new Image();
WALL_IMG.onload = () => { if (typeof MAP !== 'undefined' && MAP && MAP.tiled) paintGround(); };
WALL_IMG.src = WALLS_SRC;
/* sheet cell [col,row] and the sides each piece joins, as drawn (bits: 1 up, 2 right, 4 down, 8 left) */
const WT = { corner: [0, 0, 2 | 4], straight: [1, 0, 8 | 2], tee: [0, 1, 8 | 2 | 1], cross: [1, 1, 15], end: [0, 2, 8] };
const WIN_T = [2, 0];                                     // window middle, drawn running left-right
const rotMask = (m, k) => { let o = 0; for (let d = 0; d < 4; d++) if (m & (1 << d)) o |= 1 << ((d + k) % 4); return o; };
/* every joint pattern -> [piece, quarter turns clockwise] */
const WALL_BY_MASK = (() => {
  const t = {};
  for (const n in WT) for (let k = 0; k < 4; k++) { const m = rotMask(WT[n][2], k); if (!t[m]) t[m] = [n, k]; }
  t[0] = ['cross', 0];                                    // a lone post
  return t;
})();

/* ---------------- house generator ---------------- */
/* returns {W, H, g} with g[y*W+x] in C_OUT / C_FLOOR / C_WALL / C_WIN, or null if no house fits */
function genHouse(R, maxW, maxH) {
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = A => A[Math.floor(R() * A.length)];
  for (let tries = 0; tries < 500; tries++) {
    const W = ri(15, maxW), H = ri(13, maxH);
    // outline: a rectangle, or an L (the top-right corner cut away; the house is flipped / turned at the end)
    const nw = ri(4, W - 7), nh = ri(ROOM_SIDE + 1, H - ROOM_SIDE - 2), L = R() < 0.45 && nw >= 4 && nh <= H - 7;
    const inShape = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !(L && x >= W - nw && y < nh);
    const g = new Uint8Array(W * H), at = (x, y) => x < 0 || y < 0 || x >= W || y >= H ? C_OUT : g[y * W + x], set = (x, y, v) => { g[y * W + x] = v; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!inShape(x, y)) continue; let edge = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!inShape(x + dx, y + dy)) edge = true;
      set(x, y, edge ? C_WALL : C_FLOOR);
    }
    // rooms: rectangles of floor; every split is a wall line (a "cut") that gets exactly one door later
    let rooms, cuts = [];
    if (!L) rooms = [{ x: 1, y: 1, w: W - 2, h: H - 2 }];
    else {
      rooms = [{ x: 1, y: 1, w: W - nw - 2, h: nh - 1 }, { x: 1, y: nh + 1, w: W - 2, h: H - nh - 2 }];
      for (let x = 1; x <= W - nw - 2; x++) set(x, nh, C_WALL);
      cuts.push({ o: 'h', at: nh, lo: 1, hi: W - nw - 2 });
    }
    if (rooms.some(r => r.w < ROOM_SIDE || r.h < ROOM_SIDE || r.w * r.h < ROOM_MIN)) continue;
    const want = ri(3, 4);
    while (rooms.length < want) {
      const opts = [];
      for (const r of rooms) for (const o of ['v', 'h']) {
        const len = o === 'v' ? r.w : r.h, side = o === 'v' ? r.h : r.w;
        for (let a = ROOM_SIDE; a <= len - 1 - ROOM_SIDE; a++) if (a * side >= ROOM_MIN && (len - 1 - a) * side >= ROOM_MIN) opts.push({ r, o, a, area: r.w * r.h });
      }
      if (!opts.length) break;
      const big = Math.max(...opts.map(q => q.area)), q = pick(opts.filter(o => o.area === big)), r = q.r;
      rooms.splice(rooms.indexOf(r), 1);
      if (q.o === 'v') {
        const cx = r.x + q.a; for (let y = r.y; y < r.y + r.h; y++) set(cx, y, C_WALL);
        rooms.push({ x: r.x, y: r.y, w: q.a, h: r.h }, { x: cx + 1, y: r.y, w: r.w - q.a - 1, h: r.h }); cuts.push({ o: 'v', at: cx, lo: r.y, hi: r.y + r.h - 1 });
      } else {
        const cy = r.y + q.a; for (let x = r.x; x < r.x + r.w; x++) set(x, cy, C_WALL);
        rooms.push({ x: r.x, y: r.y, w: r.w, h: q.a }, { x: r.x, y: cy + 1, w: r.w, h: r.h - q.a - 1 }); cuts.push({ o: 'h', at: cy, lo: r.x, hi: r.x + r.w - 1 });
      }
    }
    if (rooms.length < 3) continue;
    const roomAt = (x, y) => rooms.findIndex(r => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h);
    // inner doors: one 2-wide gap per cut, between two rooms that face each other across it
    let ok = true;
    for (const c of cuts) {
      let best = null;
      for (const a of rooms) for (const b of rooms) {
        let lo, hi;
        if (c.o === 'v') { if (a.x + a.w !== c.at || b.x !== c.at + 1) continue; lo = Math.max(a.y, b.y, c.lo); hi = Math.min(a.y + a.h - 1, b.y + b.h - 1, c.hi); }
        else { if (a.y + a.h !== c.at || b.y !== c.at + 1) continue; lo = Math.max(a.x, b.x, c.lo); hi = Math.min(a.x + a.w - 1, b.x + b.w - 1, c.hi); }
        if (hi - lo + 1 >= 2 && (!best || hi - lo > best[1] - best[0])) best = [lo, hi];
      }
      if (!best) { ok = false; break; }
      const m = best[1] - best[0] + 1 >= 4 ? 1 : 0, p = ri(best[0] + m, best[1] - 1 - m);
      for (const k of [p, p + 1]) c.o === 'v' ? set(c.at, k, C_FLOOR) : set(k, c.at, C_FLOOR);
    }
    if (!ok) continue;
    // outside wall runs that can take a door or a window: every cell, and two wall cells either side (so no wall
    // piece is left standing alone between two openings), is plain outer wall (outside one way, floor the other), all facing the same room
    const plain = (x, y, d) => at(x, y) === C_WALL && at(x + DIRS[d][0], y + DIRS[d][1]) === C_OUT && at(x - DIRS[d][0], y - DIRS[d][1]) === C_FLOOR && roomAt(x - DIRS[d][0], y - DIRS[d][1]) >= 0;
    const runs = n => {
      const out = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let d = 0; d < 4; d++) {
        const [tx, ty] = DIRS[(d + 1) % 4], cells = [];
        let fine = plain(x - tx, y - ty, d) && plain(x - tx * 2, y - ty * 2, d) && plain(x + tx * n, y + ty * n, d) && plain(x + tx * (n + 1), y + ty * (n + 1), d);
        for (let i = 0; i < n && fine; i++) { const cx = x + tx * i, cy = y + ty * i; if (!plain(cx, cy, d)) fine = false; else cells.push([cx, cy]); }
        if (!fine) continue;
        const rm = roomAt(x - DIRS[d][0], y - DIRS[d][1]);
        if (cells.every(([cx, cy]) => roomAt(cx - DIRS[d][0], cy - DIRS[d][1]) === rm)) out.push({ cells, d, room: rm });
      }
      return out;
    };
    // front door (south if it can), back door on the opposite side
    let ds = runs(2); const front = pick(ds.filter(q => q.d === 2).length ? ds.filter(q => q.d === 2) : ds); if (!front) continue;
    for (const [x, y] of front.cells) set(x, y, C_FLOOR);
    ds = runs(2); const backs = ds.filter(q => q.d === (front.d + 2) % 4), back = pick(backs.length ? backs : ds.filter(q => q.d !== front.d)); if (!back) continue;
    for (const [x, y] of back.cells) set(x, y, C_FLOOR);
    // windows: 1-2 per room, 2-3 cells, outside walls only
    for (let r = 0; r < rooms.length && ok; r++) {
      const n = ri(1, 2);
      for (let k = 0; k < n; k++) {
        let c = runs(ri(2, 3)).filter(q => q.room === r); if (!c.length) c = runs(2).filter(q => q.room === r);
        if (!c.length) { if (k === 0) ok = false; break; }
        for (const [x, y] of pick(c).cells) set(x, y, C_WIN);
      }
    }
    if (!ok) continue;
    // every floor cell reachable from the front door
    const seen = new Uint8Array(W * H), st = [front.cells[0]]; let reach = 0, floor = 0;
    for (let i = 0; i < W * H; i++) if (g[i] === C_FLOOR) floor++;
    while (st.length) { const [x, y] = st.pop(); if (at(x, y) !== C_FLOOR || seen[y * W + x]) continue; seen[y * W + x] = 1; reach++; for (const [dx, dy] of DIRS) st.push([x + dx, y + dy]); }
    if (reach !== floor) continue;
    // random flips / quarter turn
    let G = g, GW = W, GH = H;
    if (R() < 0.5 && H <= maxW && W <= maxH) { const T = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) T[x * H + y] = G[y * W + x]; G = T; GW = H; GH = W; }
    const fx = R() < 0.5, fy = R() < 0.5, F = new Uint8Array(GW * GH);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) F[(fy ? GH - 1 - y : y) * GW + (fx ? GW - 1 - x : x)] = G[y * GW + x];
    return { W: GW, H: GH, g: F, rooms: rooms.length };
  }
  return null;
}

/* ---------------- the yard ---------------- */
function buildDevMap() {
  const SC = DEV_COLS * TILE / SUB, SR = DEV_ROWS * TILE / SUB;
  const TL = { cols: DEV_COLS, rows: DEV_ROWS, sc: SC, sr: SR, cell: new Uint8Array(SC * SR), bld: new Int8Array(SC * SR).fill(-1), sec: new Int16Array(SC * SR).fill(-1), secs: [], houses: [] };
  const m = { id: 'devyard', tiled: TL, arcs: [], roads: [], buildings: [], water: [], bridges: [], statics: [], flags: [], bases: [], crateSpots: [], vehSpawns: [], ffaSpawns: [], fields: [], fwd: [], ice: [] };
  MAP = m;
  const R = mulberry(DEV.seed * 7919 + 13);
  DEV_LOTS.forEach(([ox, oy, mw, mh], hi) => {
    const h = genHouse(R, mw, mh); if (!h) return;
    TL.houses.push({ x: ox, y: oy, w: h.W, h: h.H, rooms: h.rooms });
    for (let y = 0; y < h.H; y++) for (let x = 0; x < h.W; x++) { const v = h.g[y * h.W + x]; if (v === C_OUT) continue; const k = (oy + y) * SC + ox + x; TL.cell[k] = v; TL.bld[k] = hi; }
  });
  devSections();
  const pad = { x: 0, y: 0, w: 0, h: 0 };
  m.bases = [{ team: 0, x: tileC(3), y: tileC(16), pad }, { team: 1, x: tileC(44), y: tileC(16), pad }];
  m.fwd = m.bases.map(b => ({ x: b.x, y: b.y }));
  m.ffaSpawns = [[3, 16], [44, 16], [8, 29], [40, 29]].map(([i, j]) => ({ x: tileC(i), y: tileC(j) }));
  m.vehSpawns.push({ type: 'jeep', x: tileC(4), y: tileC(4), a: 0, team: 0 }, { type: 'tank', x: 6 * TILE, y: tileC(28), a: 0, team: 0 }, { type: 'nest', x: tileC(26), y: tileC(14), a: Math.PI, team: -1 });
  [[9, 13], [24, 13], [41, 26], [12, 28]].forEach(([i, j], k) => m.statics.push({ type: 'tree', x: tileC(i), y: tileC(j), r: 10, v: k % 4, sc: 0.9, a: k * 1.3, alive: true, pine: false }));
  [[6, 22], [30, 14]].forEach(([i, j]) => m.statics.push({ type: 'hay', x: tileC(i), y: tileC(j), r: 13, a: 0.4, alive: true }));
  { const A = { x: tileC(20), y: tileC(15), a: 0, bags: [], lost: 0 }; m.arcs.push(A); const c = Math.cos(A.a), sn = Math.sin(A.a);
    for (const [px, py] of EXTRA.bagPts) { const st = { type: 'bag', x: A.x + px * c - py * sn, y: A.y + px * sn + py * c, a: 0, r: 8, alive: true, arc: A }; A.bags.push(st); m.statics.push(st); } }
  // anything standing inside a house goes
  m.statics = m.statics.filter(s => { const k = ((s.y / SUB) | 0) * SC + ((s.x / SUB) | 0); return TL.bld[k] < 0; });
  m.arcs = m.arcs.filter(A => A.bags.every(b => m.statics.includes(b)));
  buildHash();
}
/* wall and window cells -> sections: straight runs (corners and junctions join the run along their row),
   cut into pieces of at most SEC_MAX cells. Also rebuilds MAP.sight: whole runs of standing wall, for the fog. */
function wallRuns(TL, ok) {
  const { sc, sr } = TL, used = new Uint8Array(sc * sr), out = [];
  const t = (x, y) => x < 0 || y < 0 || x >= sc || y >= sr ? -1 : TL.cell[y * sc + x];
  for (let y = 0; y < sr; y++) for (let x = 0; x < sc; x++) {
    const v = t(x, y); if (!ok(v, x, y) || used[y * sc + x]) continue;
    let w = 1; while (t(x + w, y) === v && ok(v, x + w, y) && !used[y * sc + x + w]) w++;
    let h = 1;
    if (w === 1) while (t(x, y + h) === v && ok(v, x, y + h) && !used[(y + h) * sc + x] && t(x - 1, y + h) !== v && t(x + 1, y + h) !== v) h++;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) used[(y + j) * sc + x + i] = 1;
    out.push({ x, y, w, h, v });
  }
  return out;
}
function devSections() {
  const TL = MAP.tiled; TL.secs = []; TL.sec.fill(-1);
  for (const r of wallRuns(TL, v => v === C_WALL || v === C_WIN)) {
    const len = Math.max(r.w, r.h), n = Math.ceil(len / SEC_MAX);
    for (let k = 0; k < n; k++) {
      const a = Math.round(k * len / n), b = Math.round((k + 1) * len / n);
      const s = r.w > 1 ? { cx: r.x + a, cy: r.y, cw: b - a, ch: 1 } : { cx: r.x, cy: r.y + a, cw: 1, ch: b - a };
      const glass = r.v === C_WIN, cells = s.cw * s.ch, hp = glass ? 20 : 40 + 25 * cells;
      Object.assign(s, { i: TL.secs.length, glass, hp, mhp: hp, alive: true, hitT: 0 });
      s.b = { x: s.cx * SUB, y: s.cy * SUB, w: s.cw * SUB, h: s.ch * SUB, glass, sec: s };
      for (let j = 0; j < s.ch; j++) for (let i = 0; i < s.cw; i++) TL.sec[(s.cy + j) * TL.sc + s.cx + i] = s.i;
      TL.secs.push(s); MAP.buildings.push(s.b);
    }
  }
  devSight();
}
function devSight() { const TL = MAP.tiled; MAP.sight = wallRuns(TL, v => v === C_WALL).map(r => ({ x: r.x * SUB, y: r.y * SUB, w: r.w * SUB, h: r.h * SUB })); }

/* ---------------- painting ---------------- */
function paintDevGround() {
  gx.setTransform(1, 0, 0, 1, 0, 0); gx.globalAlpha = 1; gx.globalCompositeOperation = 'source-over'; gx.imageSmoothingEnabled = false;
  gx.fillStyle = '#5b6248'; gx.fillRect(0, 0, WW, WH);
  SKIRT_PAT = '#3c4232';
  const TL = MAP.tiled;
  for (let j = 0; j < TL.sr; j++) for (let i = 0; i < TL.sc; i++) if (TL.cell[j * TL.sc + i] !== C_OUT) paintCell(i, j);
}
/* one SUB cell: floor, rubble, a window, or a wall piece picked from which neighbours are wall */
function paintCell(i, j) {
  const TL = MAP.tiled, t = (x, y) => x < 0 || y < 0 || x >= TL.sc || y >= TL.sr ? C_OUT : TL.cell[y * TL.sc + x], v = t(i, j), x = i * SUB, y = j * SUB;
  const inside = TL.bld[j * TL.sc + i] >= 0;
  gx.fillStyle = inside ? '#6e5c46' : '#5b6248'; gx.fillRect(x, y, SUB, SUB);
  if (v === C_FLOOR) { gx.fillStyle = '#62513d'; gx.fillRect(x, y + (i % 2 ? 7 : 15), SUB, 1); return; }      // planks
  if (v === C_RUB) {
    const Rr = mulberry(i * 131 + j * 7 + 1); gx.fillStyle = '#6e675c'; gx.fillRect(x, y, SUB, SUB);
    for (let k = 0; k < 5; k++) { const s = 2 + Rr() * 3; gx.fillStyle = Rr() < 0.5 ? '#4f4a42' : '#8a8276'; gx.fillRect(x + Rr() * (SUB - s), y + Rr() * (SUB - s), s, s); }
    return;
  }
  if (!WALL_IMG.complete || !WALL_IMG.width) return;
  let c, k;
  if (v === C_WIN) { c = WIN_T; k = t(i - 1, j) === C_WIN || t(i + 1, j) === C_WIN ? 0 : 1; }       // windows only ever use the middle piece
  else { let m = 0; for (let d = 0; d < 4; d++) if (t(i + DIRS[d][0], j + DIRS[d][1]) === C_WALL) m |= 1 << d; const q = WALL_BY_MASK[m]; c = WT[q[0]]; k = q[1]; }   // a window beside a wall gives it an end
  gx.save(); gx.translate(x + SUB / 2, y + SUB / 2); gx.rotate(k * Math.PI / 2);
  gx.drawImage(WALL_IMG, c[0] * SUB, c[1] * SUB, SUB, SUB, -SUB / 2, -SUB / 2, SUB, SUB); gx.restore();
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
  for (let j = sec.cy; j < sec.cy + sec.ch; j++) for (let i = sec.cx; i < sec.cx + sec.cw; i++) {
    TL.cell[j * TL.sc + i] = C_RUB;
    const cx = (i + 0.5) * SUB, cy = (j + 0.5) * SUB;
    if (!sec.glass) part({ k: 'dust', x: cx, y: cy, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 1.4, max: 1.4, sz: rnd(14, 22), drag: 1.5 });
    { const a = rnd(0, TAU), sp = rnd(40, 160); part({ k: 'debris', x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.4, 0.9), max: 0.9, sz: rnd(2, 4), rot: rnd(0, TAU), vr: rnd(-12, 12), drag: 3 }); }
  }
  // the cells and everything around them (neighbouring walls may become ends)
  for (let j = sec.cy - 1; j <= sec.cy + sec.ch; j++) for (let i = sec.cx - 1; i <= sec.cx + sec.cw; i++) if (i >= 0 && j >= 0 && i < TL.sc && j < TL.sr && TL.cell[j * TL.sc + i] !== C_OUT) paintCell(i, j);
  devSight(); navDirty = 1; M.fogMem = null;
  sfx(sec.glass ? 'hit' : 'boom', sec.b.x + sec.b.w / 2, sec.b.y + sec.b.h / 2);
  devLog(sec.glass ? 'WINDOW BROKEN' : `WALL ${sec.cw * sec.ch} CELL${sec.cw * sec.ch > 1 ? 'S' : ''} DOWN`, '#ffb060');
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
    ctx.lineWidth = 1 / VZ;
    for (const [step, al] of [[SUB, 0.06], [TILE, 0.15]]) {        // 16 px wall grid, 32 px tile grid
      ctx.strokeStyle = `rgba(255,255,255,${al})`; ctx.beginPath();
      for (let x = 0; x <= WW; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, WH); }
      for (let y = 0; y <= WH; y += step) { ctx.moveTo(0, y); ctx.lineTo(WW, y); }
      ctx.stroke();
    }
  }
  const bar = (cx, cy, w, f) => { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - w / 2 - 1, cy - 3, w + 2, 6); ctx.fillStyle = f > 0.5 ? '#7dff7a' : f > 0.25 ? '#ffe08a' : '#ff5a45'; ctx.fillRect(cx - w / 2, cy - 2, w * clamp(f, 0, 1), 4); };
  if (TL && DEV.secs) for (const sec of TL.secs) {
    if (!sec.alive) continue; const b = sec.b;
    ctx.strokeStyle = sec.hitT > 0 ? '#ff6040' : sec.glass ? 'rgba(120,200,255,0.8)' : 'rgba(255,224,138,0.7)'; ctx.lineWidth = 1.5 / VZ; ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
    if (sec.hp < sec.mhp) { bar(b.x + b.w / 2, b.y + b.h / 2, Math.max(14, Math.min(b.w, 40)), sec.hp / sec.mhp); stxt(String(Math.ceil(sec.hp)), b.x + b.w / 2, b.y + b.h / 2 - 9, 8, '#fff', 'center', 'middle', FD); }
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
  row(['NEW HOUSES', () => { DEV.seed++; devResetMap(); }], ['CLEAR LOG', () => DEV.log.length = 0]);
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
  newMatch({ ...CFG, dev: true, mode: 1, bots: 0, ff: false, weather: 'clear', fog: 'los', limit: 1, camera: 'split' }, false);
  setState('play'); Music.mode = 'battle';
}
