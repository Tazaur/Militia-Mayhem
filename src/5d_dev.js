/* =====================================================================
   DEV MODE: a small tile-based test yard plus tools (no-AI dummies, vehicle spawns, toggles, a TTK log).
   Two grids: TILE (32 px, about a soldier) and the SUB grid (16 px) that walls are built on.
   Houses come from genHouse: an outline (rectangle or L), split into 3-4 rooms, the fewest inner doors that join
   them, a front and a back door, 1-2 windows per room. Wall cells are drawn from the 16 px tile sheet (art/walls16.png).
   Walls are cut into structural sections (short runs of wall cells); each live section is a solid rect in
   MAP.buildings, so collision, bullets and paths need nothing new. A blast that empties a section turns its
   cells to rubble. Windows block movement but not sight or bullets (b.glass); an intact window cracks (1 hp, the
   broken picture) the first time a shot, a grenade or a vaulting soldier goes through it. Corners, tees and
   crosses are their own one-cell sections and are much stronger. Vehicles ramming walls hurt both (RAM).
   Roofs: every floor cell has a roof tile held up by one wall section (devRoof); it comes down with that section and
   hurts whoever is under it. It covers the whole house (walls too): opaque out of sight; in sight it fades by distance (roofOp).
   ===================================================================== */
const TILE = 32, SUB = 16, DEV_COLS = 48, DEV_ROWS = 32;
const C_OUT = 0, C_FLOOR = 1, C_WALL = 2, C_WIN = 3, C_RUB = 4;
const ROOM_MIN = 36, ROOM_SIDE = 5, SEC_MAX = 6;
/* ramming, per unit of speed: damage to the wall, damage to the vehicle, speed kept; a tank always hits at least min */
const RAM = { tank: { wall: 2.6, self: 0.15, keep: 0.8, min: 50, go: 12 }, jeep: { wall: 0.45, self: 1, keep: 0.15, min: 0, go: 25 } };
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];          // up, right, down, left
const DEV = { cyc: 0, ph: 0, panH: 0, tab: 0, ts: 1, L: { shade: true, hi: true, add: true, smoke: true, parts: true, roofs: true, fog: true }, hit: false, lpts: false, hts: false, aim: false, stats: false, lp: [], nq: 0, fps: 60, um: 0, rm: 0,
  roofQ: [], open: true, god: false, ammo: true, respawn: true, grid: false, secs: false, sightDbg: false, smokeDbg: false, range: 6, sel: 1, padNav: false, log: [], nums: [], lastA: 0, over: false, B: [], R: null, seed: 1 };
const DEV_RANGES = [2, 4, 6, 8, 10, 15, 20, 30];
const DEV_TABS = ['SPAWN', 'PLAYER', 'GFX', 'WORLD'], DEV_TS = [0, 0.1, 0.25, 0.5, 1, 2], DEV_WX = ['clear', 'rain', 'snow'];
const DEV_VIEWS = ['NORMAL', 'HEIGHTS (BLUE 0 › RED 64)', 'SHADE', 'HIGHLIGHTS', 'GLOW + LIGHTS', 'MATERIALS', 'SUN SHADOWS', 'POINT LIGHTS'];     // SUNDBG
const devOff = k => M.dev && !DEV.L[k];     // a layer switched off in the GFX tab
/* the frame's cost (smoothed): fps, update and draw ms (CPU; the GPU's share shows as fps) */
/* dev WORLD › DAY CYCLE: the sun runs a day (one turn of DEV.ph) in DAY_CYC[i] s: up from the east (-30°..75°), down in the west */
const DAY_CYC = [0, 600, 240, 60];
function dayCycle(dt) {
  if (!DEV.cyc) return;
  DEV.ph = (DEV.ph + dt * TAU / DAY_CYC[DEV.cyc]) % TAU;
  SUN.el = (22.5 + 52.5 * Math.sin(DEV.ph)) * Math.PI / 180; SUN.az = -Math.PI / 2 + Math.cos(DEV.ph) * 1.3;
}
/* the cycle's time of day: DEV.ph 0 is 6:00 (the sun rising through 22.5°), π / 2 noon */
const dayClock = () => { const h = ((6 + DEV.ph / TAU * 24) % 24 + 24) % 24; return `${h | 0}:${String(Math.floor(h % 1 * 60)).padStart(2, '0')}`; };
function devTime(dt, um, rm) {
  if (M && M.dev && state === 'play') dayCycle(dt); const e = 0.08; DEV.fps += ((dt > 0 ? 1 / dt : 60) - DEV.fps) * e; DEV.um += (um - DEV.um) * e; DEV.rm += (rm - DEV.rm) * e;
  const P = GPUP, now = performance.now(); P.wk = Math.max(P.wk, dt * 1000); if (now - P.wt > 1000) { P.worst = P.wk; P.wk = 0; P.wt = now; }     // the slowest frame of the last second
}
/* settings › FPS COUNTER › GPU STAGES (GL): every pipe() hook in the frame closes a GPU timer named for the work just done
   (grouped: GPUG), read back a few frames late; averaged a frame over each second (GPUP.out: [label, ms] slowest first) */
const GPUP = { X: undefined, q: null, pend: [], A: {}, n: 0, t: 0, out: [], worst: 0, wk: 0, wt: 0 };
const GPUG = [[/^(memory|fog-)/, 'FOG MEMORY'], [/^(ground|flags|q|lights2d)/, 'SPRITES'], [/^(cpu-heights|gpu-h|gpu-mat)/, 'HEIGHTS'], [/^gpu-sweep/, 'SUN SHADOWS'],
  [/^gpu-light/, 'POINT LIGHTS'], [/^gpu-map/, 'LIGHT MAPS'], [/^comp/, 'LIGHT COMPOSITE'], [/^(softfog|ov-|overlay-done)/, 'FOG OVERLAY'], [/^(smk-|smokes)/, 'SMOKE'],
  [/^(lasers|tags|reticle)/, 'MARKS'], [/^grade/, 'WEATHER + GRADE']];
const gpuOn = () => GL && CFG.fps === 3;
function gpuOpen() { const g = GL; GPUP.q = g.createQuery(); g.beginQuery(GPUP.X.TIME_ELAPSED_EXT, GPUP.q); }
function gpuClose(k) { const g = GL, P = GPUP; if (!P.q) return; g.endQuery(P.X.TIME_ELAPSED_EXT); const G = GPUG.find(([r]) => r.test(k)); P.pend.push([P.q, G ? G[1] : k.toUpperCase()]); P.q = null; }
function gpuHook(k) { gxFlush(); gpuClose(k); gpuOpen(); }
function gpuBegin() {
  const P = GPUP; if (!gpuOn()) return; if (P.X === undefined) P.X = GL.getExtension('EXT_disjoint_timer_query_webgl2'); if (!P.X) return;
  const g = GL, dj = g.getParameter(P.X.GPU_DISJOINT_EXT);
  for (let i = 0; i < P.pend.length; i++) { const [q, k] = P.pend[i]; if (!g.getQueryParameter(q, g.QUERY_RESULT_AVAILABLE)) break; if (!dj) P.A[k] = (P.A[k] || 0) + g.getQueryParameter(q, g.QUERY_RESULT) / 1e6; g.deleteQuery(q); P.pend.splice(i--, 1); }
  const now = performance.now(); if (now - P.t > 1000 && P.n) { P.out = Object.entries(P.A).map(([k, v]) => [k, v / P.n]).sort((a, b) => b[1] - a[1]); P.A = {}; P.n = 0; P.t = now; }
  if (P.pend.length > 400) return;     // results stopped coming back: don't pile up more
  gxFlush(); gpuOpen(); PIPE = gpuHook; P.n++;
}
function gpuEnd() { if (PIPE !== gpuHook) return; gxFlush(); gpuClose('rest'); PIPE = null; }
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
const WIN_T = [2, 0], WIN_BROKE = [2, 1], CRUMB_T = [1, 2], RUB_T = [2, 2];   // window (intact / broken) drawn running left-right; crumbled end joins left like 'end'
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
/* a tiled map's grids, w x h px; seed: the roofs' and rubble's randomness (fixed per map, so online clients build the same) */
function newTiled(w, h, seed) {
  const sc = w / SUB, sr = h / SUB;
  return { cols: w / TILE, rows: h / TILE, sc, sr, seed, cell: new Uint8Array(sc * sr), bld: new Int8Array(sc * sr).fill(-1), sec: new Int16Array(sc * sr).fill(-1), secs: [], houses: [] };
}
/* a genHouse house into the grids with its top-left at SUB cell (ox, oy); mir: the copy turned half round the map centre */
function stampHouse(TL, h, ox, oy, mir) {
  const hi = TL.houses.length;
  TL.houses.push({ x: mir ? TL.sc - ox - h.W : ox, y: mir ? TL.sr - oy - h.H : oy, w: h.W, h: h.H, rooms: h.rooms });
  for (let y = 0; y < h.H; y++) for (let x = 0; x < h.W; x++) {
    const v = h.g[y * h.W + x]; if (v === C_OUT) continue;
    const k = mir ? (TL.sr - 1 - oy - y) * TL.sc + TL.sc - 1 - ox - x : (oy + y) * TL.sc + ox + x; TL.cell[k] = v; TL.bld[k] = hi;
  }
}
/* houses stamped: wall sections, roofs, posts */
function tiledFinish() { DEV.roofQ.length = 0; devSections(); devRoof(); tiledPosts(); }
/* nothing placed earlier (trees, sandbags) stands inside a house; a sandbag crescent that lost a bag goes */
function tiledClear(m) {
  const TL = m.tiled; m.statics = m.statics.filter(s => { const i = (s.x / SUB) | 0, j = (s.y / SUB) | 0; return i < 0 || j < 0 || i >= TL.sc || j >= TL.sr || TL.bld[j * TL.sc + i] < 0; });
  m.arcs = m.arcs.filter(A => A.bags.every(b => m.statics.includes(b)));
}
/* posts: where a bot holds a house from inside - the floor cell just in from each window and outside doorway cell,
   a: facing out */
function tiledPosts() {
  const TL = MAP.tiled, { sc, sr } = TL, t = (x, y) => x < 0 || y < 0 || x >= sc || y >= sr ? C_OUT : TL.cell[y * sc + x], P = MAP.posts = [];
  for (let y = 0; y < sr; y++) for (let x = 0; x < sc; x++) {
    const v = t(x, y); if ((v !== C_WIN && v !== C_FLOOR) || TL.bld[y * sc + x] < 0) continue;
    for (const [dx, dy] of DIRS) {
      if (t(x + dx, y + dy) !== C_OUT || t(x - dx, y - dy) !== C_FLOOR) continue;
      const px = (x - dx + 0.5) * SUB, py = (y - dy + 0.5) * SUB;
      if (!P.some(p => Math.hypot(p.x - px, p.y - py) < 24)) P.push({ x: px, y: py, a: Math.atan2(dy, dx), door: v === C_FLOOR });
    }
  }
}
function buildDevMap() {
  const TL = newTiled(DEV_COLS * TILE, DEV_ROWS * TILE, DEV.seed);
  const m = { id: 'devyard', tiled: TL, arcs: [], roads: [], buildings: [], water: [], bridges: [], statics: [], flags: [], bases: [], crateSpots: [], vehSpawns: [], ffaSpawns: [], fields: [], fwd: [], ice: [] };
  MAP = m;
  const R = mulberry(DEV.seed * 7919 + 13);
  for (const [ox, oy, mw, mh] of DEV_LOTS) { const h = genHouse(R, mw, mh); if (h) stampHouse(TL, h, ox, oy, false); }
  tiledFinish();
  const pad = { x: 0, y: 0, w: 0, h: 0 };
  m.bases = [{ team: 0, x: tileC(3), y: tileC(16), pad }, { team: 1, x: tileC(44), y: tileC(16), pad }];
  m.fwd = m.bases.map(b => ({ x: b.x, y: b.y }));
  m.ffaSpawns = [[3, 16], [44, 16], [8, 29], [40, 29]].map(([i, j]) => ({ x: tileC(i), y: tileC(j) }));
  m.vehSpawns.push({ type: 'jeep', x: tileC(4), y: tileC(4), a: 0, team: 0 }, { type: 'tank', x: 6 * TILE, y: tileC(28), a: 0, team: 0 }, { type: 'nest', x: tileC(26), y: tileC(14), a: Math.PI, team: -1 });
  [[9, 13], [24, 13], [41, 26], [12, 28]].forEach(([i, j], k) => m.statics.push({ type: 'tree', x: tileC(i), y: tileC(j), r: 10, v: k % 4, sc: 0.9, a: k * 1.3, alive: true, pine: false }));
  [[6, 22], [30, 14]].forEach(([i, j]) => m.statics.push({ type: 'hay', x: tileC(i), y: tileC(j), r: 13, a: 0.4, alive: true }));
  { const A = { x: tileC(20), y: tileC(15), a: 0, bags: [], lost: 0 }; m.arcs.push(A); const c = Math.cos(A.a), sn = Math.sin(A.a);
    for (const [px, py] of EXTRA.bagPts) { const st = { type: 'bag', x: A.x + px * c - py * sn, y: A.y + px * sn + py * c, a: 0, r: 8, alive: true, arc: A }; A.bags.push(st); m.statics.push(st); } }
  tiledClear(m);
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
  const TL = MAP.tiled, sc = TL.sc; TL.secs = []; TL.sec.fill(-1);
  const t = (x, y) => x < 0 || y < 0 || x >= sc || y >= TL.sr ? C_OUT : TL.cell[y * sc + x];
  // a section: one or more rects (s.bs, each in MAP.buildings) of cells; cx..ch is their bounding box, n the cell count
  const hpOf = s => s.glass ? 20 : 30 + 20 * s.n;
  const rect = (s, cx, cy, cw, ch) => {
    const b = { x: cx * SUB, y: cy * SUB, w: cw * SUB, h: ch * SUB, glass: s.glass, sec: s }; s.bs.push(b); MAP.buildings.push(b);
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) TL.sec[(cy + j) * sc + cx + i] = s.i;
    const x1 = Math.max(s.cx + s.cw, cx + cw), y1 = Math.max(s.cy + s.ch, cy + ch); s.cx = Math.min(s.cx, cx); s.cy = Math.min(s.cy, cy); s.cw = x1 - s.cx; s.ch = y1 - s.cy;
    s.n += cw * ch; s.hp = s.mhp = hpOf(s);
  };
  const add = (cx, cy, cw, ch, glass) => { const s = { cx, cy, cw, ch, n: 0, bs: [], i: TL.secs.length, glass, alive: true, hitT: 0 }; TL.secs.push(s); rect(s, cx, cy, cw, ch); };
  // straight runs (corners, tees and crosses go with the run along their row), cut to at most SEC_MAX cells
  for (const r of wallRuns(TL, v => v === C_WALL || v === C_WIN)) {
    const len = Math.max(r.w, r.h), n = Math.ceil(len / SEC_MAX);
    for (let k = 0; k < n; k++) {
      const a = Math.round(k * len / n), b = Math.round((k + 1) * len / n), glass = r.v === C_WIN;
      if (r.w > 1) add(r.x + a, r.y, b - a, 1, glass); else add(r.x, r.y + a, 1, b - a, glass);
    }
  }
  // no wall cell stands alone: a one-cell section joins the smallest wall section next to it
  for (const s of TL.secs.slice()) {
    if (s.glass || s.n !== 1) continue; let best = null;
    for (const [dx, dy] of DIRS) { const q = t(s.cx + dx, s.cy + dy) === C_WALL && TL.secs[TL.sec[(s.cy + dy) * sc + s.cx + dx]]; if (q && q !== s && q.alive && (!best || q.n < best.n)) best = q; }
    if (!best) continue;
    s.alive = false; MAP.buildings.splice(MAP.buildings.indexOf(s.bs[0]), 1); rect(best, s.cx, s.cy, 1, 1);
  }
  TL.secs = TL.secs.filter(s => s.alive); TL.sec.fill(-1);
  TL.secs.forEach((s, i) => { s.i = i; for (const b of s.bs) for (let y = b.y / SUB; y < (b.y + b.h) / SUB; y++) for (let x = b.x / SUB; x < (b.x + b.w) / SUB; x++) TL.sec[y * sc + x] = i; });
  devSight();
}
/* sight walls (hard) and windows (soft, GLASS_OCC) */
function devSight() {
  const TL = MAP.tiled, px = r => ({ x: r.x * SUB, y: r.y * SUB, w: r.w * SUB, h: r.h * SUB });
  MAP.sight = wallRuns(TL, v => v === C_WALL).map(px); if (M && M.gsf) M.gsf.dirty = 1;      // the grid smoke's walls too
  MAP.glass = TL.secs.filter(s => s.glass && s.alive && s.hp >= s.mhp).flatMap(s => s.bs);     // only intact windows dim sight
}

/* ---------------- roofs ---------------- */
/* every floor cell in a house gets a roof tile, held up by one wall section: a shortest-path flood out from all the
   wall cells at once, with a random cost per cell. Each section's patch is joined to that section through its own
   tiles, so nothing is left floating when a neighbouring patch falls, and the borders between patches are ragged. */
const ROOF_C = document.createElement('canvas'), ROOF_V = document.createElement('canvas');
function devRoof() {
  const TL = MAP.tiled, { sc, sr } = TL, N = sc * sr, R = mulberry(TL.seed * 31 + 7);
  TL.roof = new Uint8Array(N); TL.rsec = new Int16Array(N).fill(-1); TL.rdist = new Uint8Array(N);    // rdist: tiles from the holding wall
  const w = new Float32Array(N), cost = new Float32Array(N).fill(1e9), H = [];
  const up = i => { while (i) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
  const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
  for (let k = 0; k < N; k++) {
    if (TL.bld[k] < 0 || TL.cell[k] === C_OUT) continue;
    TL.roof[k] = 1; w[k] = 1 + R() * 1.6;                     // the roof covers the whole house, walls and windows too
    if (TL.cell[k] === C_WALL && TL.sec[k] >= 0) { cost[k] = 0; TL.rsec[k] = TL.sec[k]; H.push([0, k]); up(H.length - 1); }   // a wall holds the roof over itself
  }
  while (H.length) {
    const [c, k] = pop(); if (c > cost[k]) continue; const x = k % sc, y = (k / sc) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= sc || ny >= sr) continue; const n = ny * sc + nx;
      if (TL.roof[n] && c + w[n] < cost[n]) { cost[n] = c + w[n]; TL.rsec[n] = TL.rsec[k]; TL.rdist[n] = Math.min(255, TL.rdist[k] + 1); H.push([cost[n], n]); up(H.length - 1); }
    }
  }
}
function paintRoof() {
  const TL = MAP.tiled; if (!TL.roof) return;
  ROOF_C.width = WW; ROOF_C.height = WH;
  for (let j = 0; j < TL.sr; j++) for (let i = 0; i < TL.sc; i++) if (TL.roof[j * TL.sc + i] === 1) paintRoofCell(i, j);
}
/* shingles, a dark edge wherever the roof stops */
function paintRoofCell(i, j) {
  const TL = MAP.tiled, k = j * TL.sc + i, x = i * SUB, y = j * SUB;
  const t = ((Math.imul(i, 2654435761) ^ Math.imul(j, 40503)) >>> 0) % 7 - 3;
  const open = (a, b) => { if (a < 0 || b < 0 || a >= TL.sc || b >= TL.sr) return true; return TL.roof[b * TL.sc + a] !== 1; };
  const g = ROOF_C.getContext('2d'); g.clearRect(x, y, SUB, SUB); if (TL.roof[k] !== 1) return;
  g.fillStyle = `rgb(${112 + t * 3},${72 + t * 2},${56 + t * 2})`; g.fillRect(x, y, SUB, SUB);
  g.fillStyle = 'rgba(40,22,16,0.45)';
  for (let r = 0; r < 4; r++) { g.fillRect(x, y + r * 4 + 3, SUB, 1); for (let sx = (r % 2) * 4; sx < SUB; sx += 8) g.fillRect(x + sx, y + r * 4, 1, 3); }
  g.fillStyle = '#2a1a12';
  if (open(i, j - 1)) g.fillRect(x, y, SUB, 2); if (open(i + 1, j)) g.fillRect(x + SUB - 2, y, 2, SUB);
  if (open(i, j + 1)) g.fillRect(x, y + SUB - 2, SUB, 2); if (open(i - 1, j)) g.fillRect(x, y, 2, SUB);
}
function repaintRoofAround(cells) {
  const TL = MAP.tiled, done = new Set();
  for (const k of cells) { const i = k % TL.sc, j = (k / TL.sc) | 0; for (let b = j - 1; b <= j + 1; b++) for (let a = i - 1; a <= i + 1; a++) { const n = b * TL.sc + a; if (a < 0 || b < 0 || a >= TL.sc || b >= TL.sr || done.has(n)) continue; done.add(n); paintRoofCell(a, b); } }
}
/* a wall section fell: its roof comes down as a cascade, each tile ROOF_STEP s later per tile it is from the wall */
const ROOF_STEP = 0.07;
function devRoofFall(sec) {
  const TL = MAP.tiled; if (!TL.roof) return 0; const ev = { hit: new Set() }; let n = 0;
  for (let k = 0; k < TL.roof.length; k++) if (TL.roof[k] === 1 && TL.rsec[k] === sec.i) { DEV.roofQ.push({ k, at: M.time + TL.rdist[k] * ROOF_STEP, ev }); n++; }
  if (n) devLog(`ROOF ${n} TILES DOWN`, '#ffb060');
  return n;
}
/* one roof tile lands: collapse dust (even row + even column only), debris, a shake nearby, and whoever is under it is hurt (once per fall) */
function devRoofTile(k, ev) {
  const TL = MAP.tiled; if (TL.roof[k] !== 1) return; TL.roof[k] = 2;
  const i = k % TL.sc, j = (k / TL.sc) | 0, cx = (i + 0.5) * SUB, cy = (j + 0.5) * SUB;
  paintCell(i, j); repaintRoofAround([k]);
  if (i % 2 === 0 && j % 2 === 0) devDust(cx, cy);          // dust from roof tiles on an even row and even column
  { const a = rnd(0, TAU), sp = rnd(30, 120); part({ k: 'debris', x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.4, 0.9), max: 0.9, sz: rnd(2, 4), rot: rnd(0, TAU), vr: rnd(-12, 12), drag: 3 }); }
  shakeAt(cx, cy, 2.5, 420); sfx('crush', cx, cy, 0.6);
  const under = (x, y) => ((y / SUB) | 0) * TL.sc + ((x / SUB) | 0) === k;
  if (NET.role === 'client') return;          // online: the host's roof does the hurting
  for (const s of M.sol) if (s.alive && !s.veh && !ev.hit.has(s) && under(s.x, s.y)) { ev.hit.add(s); hurtSoldier(s, s.mhp * rnd(0.5, 0.75), null, 'roof', 0, 0, 'ROOF'); }
  for (const v of M.vehicles) if (v.active && !v.dead && !ev.hit.has(v) && vehCircles(v, _vc).some(([x, y]) => under(x, y))) { ev.hit.add(v); hurtVehicle(v, v.type === 'tank' ? 40 : 120, null); }
}
/* the roof over the whole house, walls included, as the eyes of this view see it: with BUILDING CLEAR LOS on
   (CFG.clearLos, the default) or from inside a house (vw.rf, eased in
   and out as you step under a roof and back out) gone within ROOF_NEAR, fading in to ROOF_CAP at ROOF_FAR and beyond;
   from outside, whole, as the memory holds it (so the wall you look at stays under it). A world-space region
   (rv.x, rv.y, rv.w, rv.h) drawn in sight above units and walls. (Out of sight the memory holds the whole roof: applyFog) */
const ROOF_NEAR = 100, ROOF_FAR = 200, ROOF_CAP = 0.7, roofOp = d => d <= ROOF_NEAR ? 0 : ROOF_CAP * Math.min(1, (d - ROOF_NEAR) / (ROOF_FAR - ROOF_NEAR));
function roofView(vw, x0, y0, x1, y1) {
  const TL = MAP.tiled; if (!TL || !TL.roof) return null;
  const x = Math.max(0, Math.floor(x0)), y = Math.max(0, Math.floor(y0)), w = Math.min(WW, Math.ceil(x1)) - x, h = Math.min(WH, Math.ceil(y1)) - y; if (w <= 0 || h <= 0) return null;
  if (ROOF_V.width < w || ROOF_V.height < h) { ROOF_V.width = Math.max(ROOF_V.width, w); ROOF_V.height = Math.max(ROOF_V.height, h); }
  const g = ROOF_V.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.drawImage(ROOF_C, x, y, w, h, 0, 0, w, h);
  const eyes = viewSols(vw).map(posOf), inside = CFG.clearLos !== false || eyes.some(o => TL.roof[((o.y / SUB) | 0) * TL.sc + ((o.x / SUB) | 0)] === 1);
  const dt = Math.min(0.1, Math.max(0, M.time - (vw.rfT ?? M.time))); vw.rfT = M.time; vw.rf = clamp((vw.rf || 0) + (inside ? dt : -dt) * 4, 0, 1);
  const f = vw.rf; if (f <= 0) return { c: ROOF_V, x, y, w, h };
  g.globalCompositeOperation = 'destination-out'; g.setTransform(1, 0, 0, 1, -x, -y);
  // the first eye fades the whole roof to its keep; any other eye only takes its own circle down further (keep / ROOF_CAP)
  eyes.forEach((o, n) => {
    const gr = g.createRadialGradient(o.x, o.y, 0, o.x, o.y, ROOF_FAR);
    for (let d = 0; d <= ROOF_FAR; d += 10) gr.addColorStop(d / ROOF_FAR, `rgba(0,0,0,${(f * (1 - roofOp(d) / (n ? ROOF_CAP : 1))).toFixed(3)})`);
    g.fillStyle = gr; if (n) { g.beginPath(); g.arc(o.x, o.y, ROOF_FAR, 0, TAU); g.fill(); } else g.fillRect(x, y, w, h);
  });
  g.globalCompositeOperation = 'source-over';
  return { c: ROOF_V, x, y, w, h };
}

/* ---------------- painting ---------------- */
function paintDevGround() {
  gx.setTransform(1, 0, 0, 1, 0, 0); gx.globalAlpha = 1; gx.globalCompositeOperation = 'source-over'; gx.imageSmoothingEnabled = false;
  gx.fillStyle = '#5b6248'; gx.fillRect(0, 0, WW, WH);
  SKIRT_PAT = '#3c4232';
  paintTiled();
}
/* a tiled map's houses (and their roofs) over whatever ground is painted */
function paintTiled() {
  const TL = MAP.tiled; gx.setTransform(1, 0, 0, 1, 0, 0); gx.imageSmoothingEnabled = false;
  for (let j = 0; j < TL.sr; j++) for (let i = 0; i < TL.sc; i++) if (TL.cell[j * TL.sc + i] !== C_OUT) paintCell(i, j);
  paintRoof();
}
/* one SUB cell: floor, rubble, a window, or a wall piece picked from which neighbours are wall */
function paintCell(i, j) {
  const TL = MAP.tiled, t = (x, y) => x < 0 || y < 0 || x >= TL.sc || y >= TL.sr ? C_OUT : TL.cell[y * TL.sc + x], v = t(i, j), x = i * SUB, y = j * SUB;
  const inside = TL.bld[j * TL.sc + i] >= 0;
  gx.fillStyle = inside ? '#6e5c46' : '#5b6248'; gx.fillRect(x, y, SUB, SUB);
  if (v === C_FLOOR) { gx.fillStyle = '#62513d'; gx.fillRect(x, y + (i % 2 ? 7 : 15), SUB, 1); }      // planks
  if (!WALL_IMG.complete || !WALL_IMG.width || (v === C_FLOOR && !(TL.roof && TL.roof[j * TL.sc + i] === 2))) return;
  let c, k, flip = false;
  if (v === C_RUB || v === C_FLOOR) { const h = Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ (TL.seed * 83492791); c = RUB_T; k = h & 3; flip = !!(h & 4); }   // rubble: same tile, turned / flipped per cell
  else if (v === C_WIN) { const s = TL.secs[TL.sec[j * TL.sc + i]]; c = s && s.hp < s.mhp ? WIN_BROKE : WIN_T; k = t(i - 1, j) === C_WIN || t(i + 1, j) === C_WIN ? 0 : 1; }   // windows only ever use the middle piece
  else {
    let m = 0, n = 0, rub = -1;
    for (let d = 0; d < 4; d++) { const o = t(i + DIRS[d][0], j + DIRS[d][1]); if (o === C_WALL) { m |= 1 << d; n++; } else if (o === C_RUB) rub = d; }
    if (n <= 1 && rub >= 0) { c = CRUMB_T; k = WALL_BY_MASK[n ? m : 1 << ((rub + 2) % 4)][1]; }    // beside a fallen wall: the broken end, jagged side away from what still stands
    else { const q = WALL_BY_MASK[m]; c = WT[q[0]]; k = q[1]; }          // a window beside a wall gives it an end
  }
  gx.save(); gx.translate(x + SUB / 2, y + SUB / 2); gx.rotate(k * Math.PI / 2); if (flip) gx.scale(-1, 1);
  gx.drawImage(WALL_IMG, c[0] * SUB, c[1] * SUB, SUB, SUB, -SUB / 2, -SUB / 2, SUB, SUB); gx.restore();
}

/* ---------------- structure damage ---------------- */
/* the point of a section nearest (x, y), and how far: [nx, ny, d] */
function secNear(sec, x, y) {
  let best = null;
  for (const b of sec.bs) { const nx = clamp(x, b.x, b.x + b.w), ny = clamp(y, b.y, b.y + b.h), d = Math.hypot(nx - x, ny - y); if (!best || d < best[2]) best = [nx, ny, d]; }
  return best;
}
/* the cells of a section */
function secCells(sec, f) { const TL = MAP.tiled; for (let j = sec.cy; j < sec.cy + sec.ch; j++) for (let i = sec.cx; i < sec.cx + sec.cw; i++) if (TL.sec[j * TL.sc + i] === sec.i) f(i, j); }
function devBlast(x, y, r, dmg) {
  const R = r * 0.6, k = STRUCT_K[r] || 1;
  for (const sec of MAP.tiled.secs) {
    if (!sec.alive) continue;
    const [nx, ny, d] = secNear(sec, x, y); if (d > R) continue;
    devDamage(sec, dmg * k * clamp(1 - d / R, 0.3, 1), nx, ny);
  }
}
/* net: the host's word on it ('sd'); online, a client's own shots and blasts leave walls to the host */
function devDamage(sec, v, x, y, net) {
  if (!sec.alive || (NET.role === 'client' && !net)) return;
  const intact = sec.hp >= sec.mhp;
  sec.hp -= v; sec.hitT = 0.35; if (M.dev) devNum(x, y, v, '#ffb060'); netEv('sd', sec.i, Math.round(sec.hp * 10), x | 0, y | 0);
  if (sec.hp <= 0) devCollapse(sec);
  else if (sec.glass && intact) { devRepaint(sec, 0); devSight(); sfx('glass', x, y); }
}
/* a shot, a grenade or a vaulting soldier through an intact window: it cracks */
function devGlass(sec, x, y) { if (sec.alive && sec.hp >= sec.mhp) devDamage(sec, 1, x, y); }
function devRepaint(sec, pad) {
  const TL = MAP.tiled;
  for (let j = sec.cy - pad; j < sec.cy + sec.ch + pad; j++) for (let i = sec.cx - pad; i < sec.cx + sec.cw + pad; i++) if (i >= 0 && j >= 0 && i < TL.sc && j < TL.sr && TL.cell[j * TL.sc + i] !== C_OUT) paintCell(i, j);
}
/* a vehicle driving into wall sections (host / offline): from vehicleCollide, before it is pushed back.
   A section that falls is gone before the push, so a tank carries on through, slowed. */
const _ram = [];
function devRams(v) {
  const P = RAM[v.type]; if (!P) return;
  const sp = Math.abs(v.spd); if (sp < P.go) return;
  _ram.length = 0; vehCircles(v, _vc);
  for (const [cx, cy, r] of _vc) for (const b of rectsIn(MAP.buildings, cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, _rb)) if (b.sec && !_ram.includes(b.sec) && Math.hypot(clamp(cx, b.x, b.x + b.w) - cx, clamp(cy, b.y, b.y + b.h) - cy) < r + 1) _ram.push(b.sec);
  const cd = v.ramCd || (v.ramCd = {});
  for (const sec of _ram) {
    if ((cd[sec.i] || 0) > M.time) continue; cd[sec.i] = M.time + 0.25;
    const s = Math.max(sp, P.min), [x, y] = secNear(sec, v.x, v.y);
    devDamage(sec, s * P.wall * (sec.glass ? 3 : 1), x, y);
    hurtVehicle(v, s * P.self * (sec.glass ? 0.1 : 1), null);
    v.spd *= sec.glass ? Math.max(P.keep, 0.7) : P.keep; v.crashCd = 0.6;
    if (!sec.glass) { sfx('crush', x, y); sparks(x, y, 3); }
  }
}
/* collapse dust: a smoke grenade's cloud, brown in a random shade, half opacity, 6-15 s */
function devDust(x, y) { popSmoke(x, y, { dust: true, T: rnd(6, 15), quiet: true }); }
function devCollapse(sec) {
  const TL = MAP.tiled; sec.alive = false; sec.hp = 0;
  for (const b of sec.bs) { const bi = MAP.buildings.indexOf(b); if (bi >= 0) MAP.buildings.splice(bi, 1); }
  secCells(sec, (i, j) => {
    TL.cell[j * TL.sc + i] = C_RUB;
    const cx = (i + 0.5) * SUB, cy = (j + 0.5) * SUB;
    if (!sec.glass && (i + j) % 2 === 0) devDust(cx, cy);    // dust from wall cells on a checkerboard
    if (!sec.glass) for (let q = 0; q < 3; q++) part({ k: 'dust', x: cx + rnd(-6, 6), y: cy + rnd(-6, 6), vx: rnd(-40, 40), vy: rnd(-40, 40), life: rnd(1.4, 2.4), max: 2.4, sz: rnd(14, 26), drag: 1.2 });
    for (let q = 0; q < (sec.glass ? 3 : 5); q++) { const a = rnd(0, TAU), sp = rnd(40, 190); part({ k: 'debris', x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.4, 1), max: 1, sz: rnd(2, sec.glass ? 3 : 5), rot: rnd(0, TAU), vr: rnd(-12, 12), drag: 3 }); }
  });
  // the cells and everything around them (neighbouring walls may become crumbled ends), then the roof it held up
  devRepaint(sec, 1);
  if (!sec.glass && TL.roof) { const ks = []; secCells(sec, (i, j) => ks.push(j * TL.sc + i)); repaintRoofAround(ks); devRoofFall(sec); }
  devSight(); navDirty = 1;          // the fog's memory isn't reset: out of sight you keep seeing it standing until you look
  sfx(sec.glass ? 'glass' : 'crumble', (sec.cx + sec.cw / 2) * SUB, (sec.cy + sec.ch / 2) * SUB);
  devLog(sec.glass ? 'WINDOW BROKEN' : `WALL ${sec.n} CELL${sec.n > 1 ? 'S' : ''} DOWN`, '#ffb060');
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
  const v = M.vehicles.find(v => { if (!v.active || v.dead) return false; const [lx, ly] = toLocal(v, q[0], q[1]); return Math.abs(lx) < v.T.hl + TILE / 2 && Math.abs(ly) < v.T.hw + TILE / 2; });     // on a vehicle: it gets in
  if (v && dummySeat(v, q[0], q[1]) < 0) { devLog('VEHICLE FULL', '#ff7a60'); return; }
  if (!v && solidAt(q[0], q[1], 6)) { devLog('NO ROOM THERE', '#ff7a60'); return; }
  const s = makeSoldier({ team: 1, color: M.teamColor[1], name: 'DUMMY ' + (M.sol.filter(o => o.dummy).length + 1), bot: true });
  s.dark = true; s.kit = 0; s.dummy = { x: q[0], y: q[1], a: q[2] + Math.PI, v };
  M.sol.push(s); devReviveDummy(s);
}
function devReviveDummy(s) {
  giveLoadout(s); const d = s.dummy;
  Object.assign(s, { x: d.x, y: d.y, a: d.a, hp: s.mhp, alive: true, down: false, protect: 0, respawnT: 1e9, veh: null, seat: -1, seatT: 0, stance: 0, stanceT: 0, swim: false, vx: 0, vy: 0, reloadT: 0, fireCd: 0, lastHurt: -9, ttk: null });
  const v = d.v, i = v && !v.dead && v.active ? dummySeat(v, d.x, d.y) : -1; if (i >= 0) enterVehicle(s, { v, seat: i }, true);     // spawned on a vehicle: back in it (any team's, any free seat)
}
/* the free seat whose door is nearest (x, y), or -1 */
function dummySeat(v, x, y) {
  let best = -1, bd = 1e9; const [lx, ly] = toLocal(v, x, y);
  v.T.seats.forEach((sd, i) => { if (v.seats[i]) return; const an = nearAnchor(sd, lx, ly), d = Math.hypot(lx - an[0], ly - an[1]); if (d < bd) { bd = d; best = i; } });
  return best;
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
  for (const v of M.vehicles) if (!v.seats.some(o => o)) { engineOff(v); v.gone = true; }
  M.vehicles = M.vehicles.filter(v => !v.gone); M.wrecks.length = 0; navDirty = 1;
}
function devResetMap() {
  buildDevMap(); MAP.statics.forEach((s, i) => s.idx = i); paintGround(); buildNav(); M.fogMem = null; M.wrecks.length = 0; M.gsf = null;
  for (const sp of MAP.vehSpawns) if (!M.vehicles.some(v => v.sp.type === sp.type && !v.sp.dev)) M.vehicles.push(makeVehicle(sp));
  for (const s of M.sol) if (s.alive && !s.veh && solidAt(s.x, s.y, 4)) [s.x, s.y] = freeSpot(s.x, s.y);
  devLog('MAP RESET', '#ffe08a');
}
function devHeal() { const p = devPlayer(); if (!p) return; const s = p.sol; s.hp = s.mhp; if (s.veh) s.veh.hp = s.veh.T.hp; }

/* every frame on a tiled map (the dev yard, OUTSKIRTS; host and clients): hit flashes wear off, roof tiles come down */
function tiledTick(dt) {
  for (const sec of MAP.tiled.secs) if (sec.hitT > 0) sec.hitT -= dt;
  if (DEV.roofQ.length) { for (const q of DEV.roofQ) if (q.at <= M.time) devRoofTile(q.k, q.ev); prune(DEV.roofQ, q => q.at > M.time); }
}
/* every frame of a dev match */
function devTick(dt) {
  if (KB.pressed.has('Backquote')) DEV.open = !DEV.open;
  for (const n of DEV.nums) { n.t -= dt; n.y -= dt * 18; }
  prune(DEV.nums, n => n.t > 0);
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
/* SIGHT LINES: how the sight polygon is built, per eye - the faces it tests (orange), a ray to every vertex (faint), the
   outline (cyan), the wall strips (cyan fill), points past a corner (white) and corners (yellow), and the counts */
function devSightDbg(vw, x0, y0, x1, y1) {
  const box = [x0 - 16, y0 - 16, x1 + 16, y1 + 16], k = 1 / VZ;
  for (const o of viewSols(vw).map(posOf)) {
    const P = visPoly(o.x, o.y, box, null, MAP.tiled ? SUB / 2 : 5);
    ctx.lineWidth = 2 * k; ctx.beginPath();
    for (const q of P.faces) if (q[4]) { ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); }
    ctx.strokeStyle = 'rgba(255,150,40,0.9)'; ctx.stroke();
    ctx.lineWidth = 1 * k; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath();
    for (const [x, y] of P) { ctx.moveTo(o.x, o.y); ctx.lineTo(x, y); } ctx.stroke();
    ctx.fillStyle = 'rgba(64,232,255,0.25)'; for (const S of P.strips) { ctx.beginPath(); pathPos(ctx, S); ctx.fill(); }
    ctx.lineWidth = 1.5 * k; ctx.strokeStyle = '#40e8ff'; ctx.beginPath(); pathPos(ctx, P); ctx.stroke();
    for (const [x, y, c] of P) { const r = (c ? 3 : 2) * k; ctx.fillStyle = c ? '#ffe040' : '#fff'; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
    stxt(`${P.length} PTS  ${P.faces.length - 4} FACES  ${P.strips.length} STRIPS`, o.x, o.y - 30, 8, '#40e8ff', 'center', 'middle', FD);
  }
}
/* SMOKE VALUES: each grid smoke tile in view tinted by its amount, the scale moving with what's in view: the thinnest
   tile blue, the thickest red (log between, so the thin edge doesn't all read as one colour), with the amount on it */
function devSmokeDbg(vw) {
  const f = M.gsf; if (!f || !f.act.length) return;
  const x0 = (vw.x - VOX) / VZ / GS + SMK_OUT - 1, y0 = (vw.y - VOY) / VZ / GS + SMK_OUT - 1, x1 = x0 + vw.w / VZ / GS + 2, y1 = y0 + vw.h / VZ / GS + 2, fs = clamp(11 / VZ, 4, 7), sh = 1 / VZ;     // about 11 px on screen, never wider than a tile; a 1 px shadow
  const ks = f.act.filter(k => { const i = k % f.W, j = (k - i) / f.W; return i >= x0 && j >= y0 && i <= x1 && j <= y1; }); if (!ks.length) return;
  let lo = Infinity, hi = 0; for (const k of ks) { lo = Math.min(lo, f.A[k]); hi = Math.max(hi, f.A[k]); }
  const span = Math.log(hi / lo) || 1;
  for (const k of ks) {
    const i = k % f.W, j = (k - i) / f.W, a = f.A[k], x = (i - SMK_OUT) * GS, y = (j - SMK_OUT) * GS, t = Math.log(a / lo) / span;
    ctx.fillStyle = `hsla(${240 * (1 - t)},100%,50%,0.45)`; ctx.fillRect(x, y, GS, GS);
    const v = a < 0.995 ? a.toFixed(2).slice(1) : a < 9.95 ? a.toFixed(1) : String(Math.round(a));
    txt(v, x + GS / 2 + sh, y + GS / 2 + sh, fs, '#000', 'center', 'middle', FB); txt(v, x + GS / 2, y + GS / 2, fs, '#fff', 'center', 'middle', FB);
  }
}
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
    if (!sec.alive) continue;
    ctx.strokeStyle = sec.hitT > 0 ? '#ff6040' : sec.glass ? 'rgba(120,200,255,0.8)' : 'rgba(255,224,138,0.7)'; ctx.lineWidth = 1.5 / VZ;
    secCells(sec, (i, j) => {     // its outline: the cell edges that face another section or nothing
      const o = (a, c) => MAP.tiled.sec[c * MAP.tiled.sc + a] !== sec.i || a < 0 || c < 0 || a >= MAP.tiled.sc || c >= MAP.tiled.sr, x = i * SUB, y = j * SUB, e = 1.5, S = SUB; ctx.beginPath();
      if (o(i, j - 1)) { ctx.moveTo(x, y + e); ctx.lineTo(x + S, y + e); } if (o(i, j + 1)) { ctx.moveTo(x, y + S - e); ctx.lineTo(x + S, y + S - e); }
      if (o(i - 1, j)) { ctx.moveTo(x + e, y); ctx.lineTo(x + e, y + S); } if (o(i + 1, j)) { ctx.moveTo(x + S - e, y); ctx.lineTo(x + S - e, y + S); }
      ctx.stroke();
    });
    const b = sec.bs.reduce((a, q) => q.w * q.h > a.w * a.h ? q : a);     // bar on its biggest rect
    if (sec.hp < sec.mhp) { bar(b.x + b.w / 2, b.y + b.h / 2, Math.max(14, Math.min(b.w, 40)), sec.hp / sec.mhp); stxt(String(Math.ceil(sec.hp)), b.x + b.w / 2, b.y + b.h / 2 - 9, 8, '#fff', 'center', 'middle', FD); }
  }
  for (const s of M.sol) if (s.dummy && s.alive) { bar(s.x, s.y - 20, 26, s.hp / s.mhp); stxt(String(Math.ceil(s.hp)), s.x, s.y - 28, 8, '#fff', 'center', 'middle', FD); }
  for (const v of M.vehicles) if (v.active && !v.dead) { const y = v.y - (v.T.hw || 16) - 16; bar(v.x, y, 40, v.hp / v.T.hp); stxt(Math.ceil(v.hp) + '/' + v.T.hp, v.x, y - 9, 8, '#fff', 'center', 'middle', FD); }
  if (DEV.smokeDbg) devSmokeDbg(vw);
  devOverlays();
  if (DEV.sightDbg) devSightDbg(vw, (vw.x - VOX) / VZ - 4, (vw.y - VOY) / VZ - 4, (vw.x + vw.w - VOX) / VZ + 4, (vw.y + vw.h - VOY) / VZ + 4);     // the same box applyFog uses
  for (const n of DEV.nums) { ctx.globalAlpha = Math.min(1, n.t * 2); stxt(String(n.v), n.x, n.y, 10, n.c, 'center', 'middle', FD); }
  ctx.globalAlpha = 1;
}
/* HITBOXES: the bullet circles (solHitR) and vehicle / wreck boxes; LIGHT POINTS: each light this frame (a point light:
   its reach, height, strength; a spotlight: its direction, the cone's sides, the oval it lights on the ground, its tilt);
   AIM RAYS: each player's gun's aim ray, where its shots go (aimRay: dim inside AIM.min, where low cover is shot over; red to what it aims down at, the height reached there; orange: something taller, hit; white: nothing, the shot falls on); HEIGHTS: the draw / spawn heights (solZ, gunH, topOf, shotZ); PIVOTS + SEATS: what things turn about (white,
   with their heading), mounts (cyan: turret, MG, their barrels), seats (yellow; an arrow where the seat sets the facing,
   the nest's arc as a wedge) and the spots you get in from (hollow) */
function devOverlays() {
  const k = 1 / VZ, lab = (t, x, y, c) => stxt(t, x, y, 7, c, 'center', 'middle', FD);
  if (DEV.piv) {
    const line = (x, y, a, l, c) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); };
    const piv = (x, y, a, l) => { ctx.fillStyle = '#fff'; ctx.fillRect(x - 2 * k, y - 2 * k, 4 * k, 4 * k); line(x, y, a, l, '#fff'); };
    const dot = (x, y, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 2.2 * k, 0, TAU); ctx.fill(); };
    ctx.lineWidth = 1.2 * k;
    for (const s of M.sol) if (s.alive && !s.veh) { piv(s.x, s.y, s.a, 10); const [gx, gy] = gunTip(s); dot(gx, gy, '#4fe0ff'); }
    for (const w of M.wrecks) piv(w.x, w.y, w.a, 14);
    for (const v of M.vehicles) {
      if (!v.active || v.dead) continue;
      piv(v.x, v.y, v.a, v.T.hl * 0.6);
      if (v.type === 'tank') { const [px, py] = turretPivot(v); dot(px, py, '#4fe0ff'); line(px, py, v.ta, BARREL, 'rgba(79,224,255,0.6)'); }
      { const [mx, my] = mgPos(v); dot(mx, my, '#4fe0ff'); line(mx, my, v.mgA, 22, 'rgba(79,224,255,0.6)'); }
      if (v.T.arc) for (const d of [-1, 1]) line(v.x, v.y, v.a + d * v.T.arc, 40, 'rgba(255,224,138,0.5)');
      v.T.seats.forEach((sd, i) => {
        const [x, y] = toWorld(v, ...seatLocal(v, i)); ctx.fillStyle = '#ffe08a'; ctx.fillRect(x - 2.5 * k, y - 2.5 * k, 5 * k, 5 * k);
        if (sd.role === 'drive') line(x, y, v.a, 9, '#ffe08a');     // drivers face the way they drive
        lab(sd.n.split(' ').map(w => w[0]).join(''), x, y - 7 * k, '#ffe08a');
        ctx.strokeStyle = 'rgba(255,224,138,0.5)'; for (const an of [sd.anchor, ...(sd.alts || [])]) { const [ax, ay] = toWorld(v, ...an); ctx.beginPath(); ctx.arc(ax, ay, 3 * k, 0, TAU); ctx.stroke(); }
      });
    }
  }
  if (DEV.hit) {
    ctx.lineWidth = 1.2 * k; ctx.strokeStyle = '#ff4fd8';
    for (const s of M.sol) if (s.alive) { ctx.beginPath(); ctx.arc(s.x, s.y, solHitR(s), 0, TAU); ctx.stroke(); }
    const box = (x, y, a, hl, hw) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.strokeRect(-hl, -hw, hl * 2, hw * 2); ctx.restore(); };
    ctx.strokeStyle = '#4fe0ff'; for (const v of M.vehicles) if (v.active && !v.dead) box(v.x, v.y, v.a, v.T.hl, v.T.hw);
    ctx.strokeStyle = '#ffb040'; for (const w of M.wrecks) box(w.x, w.y, w.a, w.hl, w.hw);
    ctx.fillStyle = '#ff4fd8'; for (const p of M.proj) ctx.fillRect(p.x - 1.5 * k, p.y - 1.5 * k, 3 * k, 3 * k);
  }
  if (DEV.lpts) for (const l of DEV.lp) {
    const col = l.c ? `rgb(${l.c.map(v => Math.round(v * 255)).join(',')})` : '#ffd678'; ctx.lineWidth = k; ctx.strokeStyle = col; ctx.fillStyle = col;
    if (l.d && l.d[3] > 1) {     // a spotlight: no reach circle (it lights only its cone)
      const [dx, dy, cc, w] = l.d, cn = Math.acos(cc), th = Math.atan(w - 1), h = Math.max(l.h, 1), a = Math.atan2(dy, dx);
      const near = Math.min(l.r, h / Math.tan(th + cn)), far = th > cn ? Math.min(l.r, h / Math.tan(th - cn)) : l.r, m = (near + far) / 2;
      const half = Math.min(l.r, th > cn ? h * Math.sin(cn) / Math.sqrt(Math.sin(th - cn) * Math.sin(th + cn)) : l.r * Math.tan(cn)), cx = l.x + dx * m, cy = l.y + dy * m;     // the cone on the ground: an ellipse
      ctx.globalAlpha = 0.45; ctx.beginPath(); for (const s of [-1, 1]) { ctx.moveTo(l.x, l.y); ctx.lineTo(cx - dy * half * s, cy + dx * half * s); } ctx.stroke();     // the cone's sides
      ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(cx, cy); ctx.stroke();     // its middle
      ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(1, (far - near) / 2), Math.max(1, half), a, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillRect(l.x - 2 * k, l.y - 2 * k, 4 * k, 4 * k); lab(`SPOT H${Math.round(l.h)} ×${l.k.toFixed(2)} ↓${Math.round(th * 180 / Math.PI)}° ${Math.round(far)}PX`, l.x, l.y - 8 * k, col);
      continue;
    }
    ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillRect(l.x - 2 * k, l.y - 2 * k, 4 * k, 4 * k); lab(`H${Math.round(l.h)} ×${l.k.toFixed(2)}`, l.x, l.y - 8 * k, col);
  }
  if (DEV.aim) for (const P of PLAYERS) {
    const s = P.sol; if (!s || !s.alive) continue; const v = s.veh, sd = v && v.T.seats[s.seat];
    let x, y, a, z;
    if (!v) { [x, y] = gunTip(s); a = s.a; z = gunH(s); }
    else if (v.type === 'tank' && s.seat === 0) { const [px, py] = turretPivot(v); a = v.ta; x = px + Math.cos(a) * BARREL; y = py + Math.sin(a) * BARREL; z = canH(v); }
    else if (sd.role === 'mg') { const [px, py] = mgPos(v); a = v.mgA; x = px + Math.cos(a) * 22; y = py + Math.sin(a) * 22; z = mgH(v); }
    else continue;
    const r = aimRay(x, y, a, AIM.max, v, true), d = r ? r.d : AIM.max, aimed = r && r.top < z, c = Math.cos(a), sn = Math.sin(a);
    ctx.lineWidth = 1.2 * k; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + c * AIM.min, y + sn * AIM.min); ctx.stroke();
    ctx.strokeStyle = aimed ? '#ff5050' : r ? '#ffb040' : 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(x + c * AIM.min, y + sn * AIM.min); ctx.lineTo(x + c * d, y + sn * d); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(x + c * d - 2 * k, y + sn * d - 2 * k, 4 * k, 4 * k);
    lab(aimed ? `${Math.round(z)} › ${Math.round(r.top * 0.5)} AT ${d}` : r ? `TALLER THAN ${Math.round(z)}: HITS AT ${d}` : `${Math.round(z)} · FALLS ON`, x + c * d, y + sn * d - 8 * k, ctx.fillStyle);
  }
  if (DEV.hts) {
    for (const s of M.sol) if (s.alive && !s.veh) lab(`${Math.round(solZ(s))} · GUN ${Math.round(gunH(s))}`, s.x, s.y + 16, '#9fffb0');
    for (const v of M.vehicles) if (v.active && !v.dead) lab(`TOP ${Math.round(topOf(v))} · MG ${Math.round(mgH(v))}` + (v.type === 'tank' ? ` · GUN ${Math.round(canH(v))}` : ''), v.x, v.y + (v.T.hw || 16) + 10, '#9fffb0');
    for (const w of M.wrecks) lab(`TOP ${Math.round(topOf(w))}`, w.x, w.y, '#9fffb0');
    for (const p of M.proj) lab(String(Math.round(shotZ(p))), p.x, p.y - 6, '#9fffb0');
  }
}
/* STATS: top left, under the player tag */
function devStats() {
  const u = clamp(W / 1100, 0.75, 1.1), x = SAFE.l + 10 * u, S = _sun, f = M.gsf;
  const L = [`${Math.round(DEV.fps)} FPS · UPDATE ${DEV.um.toFixed(1)} MS · DRAW ${DEV.rm.toFixed(1)} MS`,
    `SUN ${SUNNOW ? 'ON' : 'OFF'} · VIEW ${DEV_VIEWS[SUNDBG] || SUNDBG} · ${S ? S.lw + '×' + S.lh : '-'} PX LIGHT · ${DEV.nq} HEIGHT QUADS · TALLEST ${Math.round(HMAX)}`,
    `${M.sol.filter(s => s.alive).length} SOLDIERS · ${M.vehicles.filter(v => v.active && !v.dead).length} VEHICLES · ${M.proj.length} SHOTS · ${M.parts.length} PARTICLES`,
    `${DEV.lp.length} LIGHTS · ${f ? f.act.length : 0} SMOKE TILES · TIME ×${DEV.ts} · ${Math.round(W)}×${Math.round(H)} @${DPR.toFixed(2)}`];
  if (S && S.dg) L.push(S.dg);
  ctx.fillStyle = 'rgba(6,10,5,0.75)'; ctx.fillRect(x - 6 * u, SAFE.t + 76 * u, 430 * u, (L.length * 14 + 8) * u);
  L.forEach((t, i) => txt(t, x, SAFE.t + (86 + i * 14) * u, 10 * u, i ? '#f2e6c4' : '#7dff7a', 'left', 'middle', FD));
}
/* top of the screen in place of the ticket bar */
function devHUD(u, top) {
  const cx = W / 2, bw = 360 * u;
  ctx.fillStyle = 'rgba(8,12,6,0.7)'; ctx.fillRect(cx - bw / 2, top, bw, 34 * u);
  stxt('DEV MODE', cx, top + 15 * u, 13 * u, '#ffe08a', 'center', 'middle', FD);
  const l = DEV.log[0], dt = PLAYERS[0] && PLAYERS[0].dev.type; txt(l ? l.text : (dt === 'pad' ? 'VIEW OPENS THE TOOLS' : TOUCH.active ? 'TAP DEV FOR TOOLS' : '` OPENS THE TOOLS'), cx, top + 27 * u, 10 * u, l ? l.c : 'rgba(242,230,196,0.6)', 'center', 'middle', FD);
}
/* the tool panel (right side); clicks are taken in pointerdown via devClick so they never fire the gun */
function devDrawPanel() {
  screenT(); DEV.B = [];
  const u = clamp(W / 1100, 0.75, 1.1), fs = 11 * u, rh = 25 * u, gap = 5 * u, pw = 250 * u, x0 = W - SAFE.r - pw - 10 * u, y0 = SAFE.t + 52 * u;
  const btn = (label, fn, x, y, w, on, adj) => {
    if (DEV.padNav && DEV.B.length === DEV.sel) { ctx.fillStyle = 'rgba(255,224,138,0.9)'; ctx.fillRect(x - 3 * u, y - 3 * u, w + 6 * u, rh + 6 * u); }   // the pad's cursor
    ctx.fillStyle = on === true ? 'rgba(125,255,122,0.22)' : 'rgba(32,42,26,0.95)'; ctx.fillRect(x, y, w, rh);
    ctx.strokeStyle = on === true ? '#7dff7a' : 'rgba(242,230,196,0.28)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, rh - 1);
    txt(label, x + w / 2, y + rh / 2 + 1, fs, on === false ? 'rgba(242,230,196,0.55)' : '#f2e6c4', 'center', 'middle', FD);
    DEV.B.push({ x, y, w, h: rh, fn, adj });
  };
  if (!DEV.open) {
    if (DEV.stats) devStats();
    const w = 64 * u; btn('DEV', () => DEV.open = true, W - SAFE.r - w - 10 * u, y0, w);
    DEV.R = { x: W - SAFE.r - w - 10 * u, y: y0, w, h: rh }; return;
  }
  const cw2 = (pw - 24 * u - gap) / 2, L = x0 + 12 * u, R2 = L + cw2 + gap;
  let y = y0 + 34 * u;
  if (DEV.stats) devStats();
  const head = t => { txt(t, L, y + 8 * u, 10 * u, 'rgba(255,224,138,0.8)', 'left', 'middle', FD); y += 18 * u; };
  const row = (a, b) => { if (a) btn(...a.slice(0, 2), L, y, b ? cw2 : cw2 * 2 + gap, a[2], a[3]); if (b) btn(...b.slice(0, 2), R2, y, cw2, b[2]); y += rh + gap; };
  // the backdrop fits what was laid out last frame (DEV.panH, in u), so it grows with any row added
  const H0 = (DEV.panH || 560) * u;
  ctx.fillStyle = 'rgba(6,10,5,0.86)'; ctx.fillRect(x0, y0, pw, H0); ctx.strokeStyle = 'rgba(255,224,138,0.5)'; ctx.strokeRect(x0 + 0.5, y0 + 0.5, pw - 1, H0 - 1);
  DEV.R = { x: x0, y: y0, w: pw, h: H0 };
  stxt('DEV TOOLS', L, y0 + 18 * u, 15 * u, '#ffe08a', 'left', 'middle', FD);
  btn('×', () => DEV.open = false, x0 + pw - 34 * u, y0 + 6 * u, 26 * u);
  { const tw = (pw - 24 * u - gap * 3) / 4; DEV_TABS.forEach((t, i) => btn(t, () => DEV.tab = i, L + i * (tw + gap), y, tw, DEV.tab === i)); y += rh + gap * 2; }
  const step = (A, v, d) => A[clamp(A.indexOf(v) + d, 0, A.length - 1)], tog = (label, o, k) => [label, () => o[k] = !o[k], !!o[k]], s = (devPlayer() || {}).sol;
  if (DEV.tab === 0) {
    head('SPAWN AHEAD');
    row([`‹  RANGE ${DEV.range} TILES  ›`, d => DEV.range = step(DEV_RANGES, DEV.range, d), undefined, true]);
    row(['DUMMY', devSpawnDummy], ['CLEAR DUMMIES', devClearDummies]);
    row(tog('DUMMY RESPAWN', DEV, 'respawn'));
    row(['JEEP', () => devSpawnVeh('jeep')], ['TANK', () => devSpawnVeh('tank')]);
    row(['MG NEST', () => devSpawnVeh('nest')], ['CLEAR VEHICLES', devClearVehicles]);
    row(['SMOKE', () => { const q = devAhead(DEV.range); if (q) popSmoke(q.x, q.y); }], ['DUST', () => { const q = devAhead(DEV.range); if (q) devDust(q.x, q.y); }]);
  } else if (DEV.tab === 1) {
    head('ME');
    row(tog('GOD MODE', DEV, 'god'), tog('INF AMMO', DEV, 'ammo'));
    row(['HEAL ME', devHeal], ['KILL ME', () => { if (s && s.alive) kill(s, null, 'dev', 0, 0); }]);
    if (s && s.alive) {
      row([`‹  HP ${Math.ceil(s.hp)} / ${s.mhp}  ›`, d => s.hp = clamp(Math.round(s.hp + d * s.mhp * 0.1), 1, s.mhp), undefined, true]);
      if (!s.veh) row([`‹  KIT ${KITS[s.kit].n}  ›`, d => { s.kit = (s.kit + d + KITS.length) % KITS.length; giveLoadout(s); if (s.player) s.player.kit = s.kit; }, undefined, true]);
      row([`‹  STANCE ${['STAND', 'CROUCH', 'PRONE'][s.stance]}  ›`, d => s.stance = clamp(s.stance + d, 0, 2), undefined, true]);
      if (s.veh) row([`‹  VEHICLE HP ${Math.ceil(s.veh.hp)} / ${s.veh.T.hp}  ›`, d => s.veh.hp = clamp(Math.round(s.veh.hp + d * s.veh.T.hp * 0.1), 1, s.veh.T.hp), undefined, true]);
    }
  } else if (DEV.tab === 2) {
    head('SUN');
    row(['SUNLIGHT', () => CFG.sun = CFG.sun === false, CFG.sun !== false]);
    row([`‹  VIEW ${DEV_VIEWS[SUNDBG]}  ›`, d => SUNDBG = (SUNDBG + d + DEV_VIEWS.length) % DEV_VIEWS.length, undefined, true]);
    head('LAYERS');
    row(tog('SHADE', DEV.L, 'shade'), tog('HIGHLIGHTS', DEV.L, 'hi'));
    row(tog('LIGHTS + GLOW', DEV.L, 'add'), tog('SMOKE', DEV.L, 'smoke'));
    row(tog('PARTICLES', DEV.L, 'parts'), tog('ROOFS', DEV.L, 'roofs'));
    row(tog('SOFT FOG', DEV.L, 'fog'), ['LINE OF SIGHT', () => M.cfg.fog = M.cfg.fog === 'off' ? 'los' : 'off', M.cfg.fog !== 'off']);
    head('OVERLAYS');
    row(tog('SIGHT LINES', DEV, 'sightDbg'), tog('SMOKE VALUES', DEV, 'smokeDbg'));
    row(tog('HITBOXES', DEV, 'hit'), tog('LIGHT POINTS', DEV, 'lpts'));
    row(tog('HEIGHTS', DEV, 'hts'), tog('STATS', DEV, 'stats'));
    row(tog('PIVOTS + SEATS', DEV, 'piv'), tog('AIM RAYS', DEV, 'aim'));
  } else {
    head('WORLD');
    row(['RESET MAP', devResetMap], ['NEW HOUSES', () => { DEV.seed++; devResetMap(); }]);
    row([`‹  TIME ${DEV.ts ? '×' + DEV.ts : 'PAUSED'}  ›`, d => DEV.ts = step(DEV_TS, DEV.ts, d), undefined, true]);
    const wx = M.snow ? 'snow' : M.rain ? 'rain' : 'clear';
    row([`‹  WEATHER ${wx.toUpperCase()}  ›`, d => { const w = DEV_WX[(DEV_WX.indexOf(wx) + d + 3) % 3]; M.rain = w === 'rain'; M.snow = w === 'snow'; }, undefined, true]);
    row(tog('GRID', DEV, 'grid'), tog('SECTIONS', DEV, 'secs'));
    head('DAYLIGHT');
    row([`‹  DAY CYCLE ${['OFF', '10 MIN', '4 MIN', '1 MIN'][DEV.cyc]}${DEV.cyc ? ' · ' + dayClock() : ''}  ›`, d => { DEV.cyc = (DEV.cyc + d + DAY_CYC.length) % DAY_CYC.length; DEV.ph = Math.asin(clamp((SUN.el * 180 / Math.PI - 22.5) / 52.5, -1, 1)); }, undefined, true]);
    row([`‹  SUN DIR ${Math.round(SUN.az * 180 / Math.PI)}°  ›`, d => SUN.az = Math.atan2(Math.sin(SUN.az + d * Math.PI / 12), Math.cos(SUN.az + d * Math.PI / 12)), undefined, true]);
    { const e = Math.round(SUN.el * 180 / Math.PI); row([`‹  SUN HEIGHT ${e}°${e < -6 ? ' · NIGHT' : e < 14 ? ' · DUSK' : ''}  ›`, d => SUN.el = clamp(SUN.el + d * Math.PI / 36, -Math.PI / 6, Math.PI * 0.45), undefined, true]); }     // below the horizon: night
    row(['CLEAR LOG', () => DEV.log.length = 0]);
  }
  if (DEV.tab !== 2) { head('LOG'); for (const l of DEV.log) { txt(l.text, L, y + 6 * u, 10 * u, l.c, 'left', 'middle', FD); y += 15 * u; } }
  DEV.panH = (y + 4 * u - y0) / u;
}
/* pointerdown on the panel: run the button, swallow the click (true); a tap off the open panel closes it */
function devClick(x, y, touch) {
  const r = DEV.R; if (!r) return false; DEV.padNav = false;
  for (const b of DEV.B) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(x < b.x + b.w / 2 ? -1 : 1); sfx('ui'); return true; }
  if (touch && DEV.open && !(x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) { DEV.open = false; return true; }
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
/* View (select) opens / closes the panel. While it is open it takes over a pad or touch player's controls (they stand
   still): stick / D-pad moves between buttons, left / right steps a ‹ › row, A presses, B closes */
function devInputs() {
  for (const p of LOCALS()) {
    const st = p.raw, t = p.dev.type; if (!st) continue;
    if (t === 'pad' && st.opt) { DEV.open = !DEV.open; DEV.padNav = DEV.open; sfx('ui'); p.raw = null; continue; }
    if (DEV.open && t === 'pad') { devPad(st); p.raw = null; }
    else if (DEV.open && t === 'touch') p.raw = null;
  }
}
function devPad(st) {
  const B = DEV.B; DEV.padNav = true;
  if (st.back) { DEV.open = false; sfx('ui'); return; }
  if (st.tabL || st.tabR) { DEV.tab = (DEV.tab + (st.tabR ? 1 : -1) + DEV_TABS.length) % DEV_TABS.length; DEV.sel = 0; sfx('ui'); return; }     // bumpers: the tabs
  const i = DEV.sel = clamp(DEV.sel, 0, B.length - 1), b = B[i]; if (!b) return;
  if (st.confirm) { b.fn(1); sfx('ui'); return; }
  const dx = st.navX, dy = dx ? 0 : st.navY; if (!dx && !dy) return;
  if (dx && b.adj) { b.fn(dx); sfx('ui'); return; }
  const gapTo = (a0, a1, b0, b1) => Math.max(0, b0 - a1, a0 - b1), ahead = (a0, a1, b0, b1, s) => s > 0 ? b0 - a1 : a0 - b1;
  let best = -1, bd = 1e9;      // the nearest button wholly that way; edge to edge, sideways gaps count double
  B.forEach((o, j) => { const along = dx ? ahead(b.x, b.x + b.w, o.x, o.x + o.w, dx) : ahead(b.y, b.y + b.h, o.y, o.y + o.h, dy), side = dx ? gapTo(b.y, b.y + b.h, o.y, o.y + o.h) : gapTo(b.x, b.x + b.w, o.x, o.x + o.w), d = along + 2 * side; if (j !== i && along >= -1 && d < bd) { bd = d; best = j; } });
  if (best >= 0) { DEV.sel = best; sfx('ui'); }
}
/* from the main menu: straight into the yard, one player, no bots */
function startDev(dev) {
  if (NET.role) return;
  engineKillAll(); PLAYERS = []; lobbyJoin(dev && dev.type ? dev : { type: 'kb' });
  const p = PLAYERS[0]; if (!p) return; p.team = 0; p.ready = true;
  DEV.log.length = 0; DEV.nums.length = 0; DEV.open = !dev || !dev.type || dev.type === 'kb';     // a pad / touch player starts with the panel shut (it takes their controls)
  newMatch({ ...CFG, dev: true, mode: 1, bots: 0, ff: false, weather: 'clear', fog: 'los', limit: 1, camera: 'split' }, false);
  setState('play'); Music.mode = 'battle';
}
