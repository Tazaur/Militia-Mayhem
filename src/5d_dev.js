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
const JUNC_HP = { 2: 200, 3: 260, 4: 320 };                 // corner, tee, cross (a straight section: 30 + 20 per cell)
/* ramming, per unit of speed: damage to the wall, damage to the vehicle, speed kept; a tank always hits at least min */
const RAM = { tank: { wall: 2.6, self: 0.15, keep: 0.8, min: 50, go: 12 }, jeep: { wall: 0.45, self: 1, keep: 0.15, min: 0, go: 25 } };
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];          // up, right, down, left
const DEV = { roofQ: [], open: true, god: false, ammo: true, respawn: true, grid: true, secs: true, range: 6, sel: 1, padNav: false, log: [], nums: [], lastA: 0, over: false, B: [], R: null, seed: 1 };
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
function buildDevMap() {
  const SC = DEV_COLS * TILE / SUB, SR = DEV_ROWS * TILE / SUB;
  const TL = { cols: DEV_COLS, rows: DEV_ROWS, sc: SC, sr: SR, cell: new Uint8Array(SC * SR), bld: new Int8Array(SC * SR).fill(-1), sec: new Int16Array(SC * SR).fill(-1), secs: [], houses: [] };
  const m = { id: 'devyard', tiled: TL, arcs: [], roads: [], buildings: [], water: [], bridges: [], statics: [], flags: [], bases: [], crateSpots: [], vehSpawns: [], ffaSpawns: [], fields: [], fwd: [], ice: [] };
  MAP = m;
  const R = mulberry(DEV.seed * 7919 + 13); DEV.roofQ.length = 0;
  DEV_LOTS.forEach(([ox, oy, mw, mh], hi) => {
    const h = genHouse(R, mw, mh); if (!h) return;
    TL.houses.push({ x: ox, y: oy, w: h.W, h: h.H, rooms: h.rooms });
    for (let y = 0; y < h.H; y++) for (let x = 0; x < h.W; x++) { const v = h.g[y * h.W + x]; if (v === C_OUT) continue; const k = (oy + y) * SC + ox + x; TL.cell[k] = v; TL.bld[k] = hi; }
  });
  devSections(); devRoof();
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
  const TL = MAP.tiled, sc = TL.sc; TL.secs = []; TL.sec.fill(-1);
  const t = (x, y) => x < 0 || y < 0 || x >= sc || y >= TL.sr ? C_OUT : TL.cell[y * sc + x];
  const add = (cx, cy, cw, ch, glass, hp, junc) => {
    const s = { cx, cy, cw, ch, i: TL.secs.length, glass, hp, mhp: hp, alive: true, hitT: 0, junc };
    s.b = { x: cx * SUB, y: cy * SUB, w: cw * SUB, h: ch * SUB, glass, sec: s };
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) TL.sec[(cy + j) * sc + cx + i] = s.i;
    TL.secs.push(s); MAP.buildings.push(s.b);
  };
  // corners, tees and crosses (wall both across and along): one cell each, and strong
  for (let y = 0; y < TL.sr; y++) for (let x = 0; x < sc; x++) {
    if (t(x, y) !== C_WALL) continue; let n = 0, h = 0, v = 0;
    for (let d = 0; d < 4; d++) if (t(x + DIRS[d][0], y + DIRS[d][1]) === C_WALL) { n++; if (d % 2) h = 1; else v = 1; }
    if (h && v) add(x, y, 1, 1, false, JUNC_HP[n], n);
  }
  for (const r of wallRuns(TL, (v, x, y) => (v === C_WALL || v === C_WIN) && TL.sec[y * sc + x] < 0)) {
    const len = Math.max(r.w, r.h), n = Math.ceil(len / SEC_MAX);
    for (let k = 0; k < n; k++) {
      const a = Math.round(k * len / n), b = Math.round((k + 1) * len / n), glass = r.v === C_WIN;
      if (r.w > 1) add(r.x + a, r.y, b - a, 1, glass, glass ? 20 : 30 + 20 * (b - a), 0);
      else add(r.x, r.y + a, 1, b - a, glass, glass ? 20 : 30 + 20 * (b - a), 0);
    }
  }
  devSight();
}
/* sight walls for the fog (glass is see-through) and the same with the windows in (for the roof: "seen directly") */
function devSight() {
  const TL = MAP.tiled, px = r => ({ x: r.x * SUB, y: r.y * SUB, w: r.w * SUB, h: r.h * SUB });
  MAP.sight = wallRuns(TL, v => v === C_WALL).map(px); MAP.sightD = wallRuns(TL, v => v === C_WALL || v === C_WIN).map(px);
}

/* ---------------- roofs ---------------- */
/* every floor cell in a house gets a roof tile, held up by one wall section: a shortest-path flood out from all the
   wall cells at once, with a random cost per cell. Each section's patch is joined to that section through its own
   tiles, so nothing is left floating when a neighbouring patch falls, and the borders between patches are ragged. */
const ROOF_C = document.createElement('canvas'), ROOF_G = document.createElement('canvas'), ROOF_TMP = document.createElement('canvas');
function devRoof() {
  const TL = MAP.tiled, { sc, sr } = TL, N = sc * sr, R = mulberry(DEV.seed * 31 + 7);
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
  ROOF_C.width = ROOF_G.width = WW; ROOF_C.height = ROOF_G.height = WH;
  for (let j = 0; j < TL.sr; j++) for (let i = 0; i < TL.sc; i++) if (TL.roof[j * TL.sc + i] === 1) paintRoofCell(i, j);
}
/* shingles, a dark edge wherever the roof stops */
/* (ROOF_G: the same, grey and dimmed like the fog, for out of sight) */
function paintRoofCell(i, j) {
  const TL = MAP.tiled, k = j * TL.sc + i, x = i * SUB, y = j * SUB;
  const t = ((Math.imul(i, 2654435761) ^ Math.imul(j, 40503)) >>> 0) % 7 - 3, r0 = 112 + t * 3, g0 = 72 + t * 2, b0 = 56 + t * 2, L = Math.round((0.3 * r0 + 0.59 * g0 + 0.11 * b0) * 0.78);
  const open = (a, b) => { if (a < 0 || b < 0 || a >= TL.sc || b >= TL.sr) return true; return TL.roof[b * TL.sc + a] !== 1; };
  for (const [cv2, grey] of [[ROOF_C, false], [ROOF_G, true]]) {
    const g = cv2.getContext('2d'); g.clearRect(x, y, SUB, SUB); if (TL.roof[k] !== 1) continue;
    g.fillStyle = grey ? `rgb(${L},${L},${L})` : `rgb(${r0},${g0},${b0})`; g.fillRect(x, y, SUB, SUB);
    g.fillStyle = grey ? 'rgba(16,16,16,0.45)' : 'rgba(40,22,16,0.45)';
    for (let r = 0; r < 4; r++) { g.fillRect(x, y + r * 4 + 3, SUB, 1); for (let sx = (r % 2) * 4; sx < SUB; sx += 8) g.fillRect(x + sx, y + r * 4, 1, 3); }
    g.fillStyle = grey ? '#141414' : '#2a1a12';
    if (open(i, j - 1)) g.fillRect(x, y, SUB, 2); if (open(i + 1, j)) g.fillRect(x + SUB - 2, y, 2, SUB);
    if (open(i, j + 1)) g.fillRect(x, y + SUB - 2, SUB, 2); if (open(i - 1, j)) g.fillRect(x, y, 2, SUB);
  }
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
  for (const s of M.sol) if (s.alive && !s.veh && !ev.hit.has(s) && under(s.x, s.y)) { ev.hit.add(s); hurtSoldier(s, s.mhp * rnd(0.5, 0.75), null, 'roof', 0, 0, 'ROOF'); }
  for (const v of M.vehicles) if (v.active && !v.dead && !ev.hit.has(v) && vehCircles(v, _vc).some(([x, y]) => under(x, y))) { ev.hit.add(v); hurtVehicle(v, v.type === 'tank' ? 40 : 120, null); }
}
/* the roof over the whole house, walls included (drawn above units and walls). Out of sight: solid, greyed like the rest of
   the fog. In sight it fades by distance from the eye: gone within ROOF_NEAR, ROOF_CAP at ROOF_FAR and beyond; seen through glass it keeps ROOF_GLASS more */
const ROOF_NEAR = 100, ROOF_FAR = 200, ROOF_CAP = 0.7, ROOF_GLASS = 0.15, roofOp = d => d <= ROOF_NEAR ? 0 : ROOF_CAP * Math.min(1, (d - ROOF_NEAR) / (ROOF_FAR - ROOF_NEAR));
function devDrawRoof(vw, x0, y0, x1, y1, fogPolys) {
  const TL = MAP.tiled; if (!TL || !TL.roof) return;
  if (ROOF_TMP.width !== cv.width || ROOF_TMP.height !== cv.height) { ROOF_TMP.width = cv.width; ROOF_TMP.height = cv.height; }
  const eyes = viewSols(vw).map(posOf).map(o => [o.x, o.y]);
  const R = Math.hypot(x1 - x0, y1 - y0) / 2 + 80, pw = eyes.map(([x, y]) => visPoly(x, y, R, null, SUB)), pd = eyes.map(([x, y]) => visPoly(x, y, R, MAP.sightD, SUB));   // a cell past the wall face, so the wall you look at shows
  const bx0 = Math.max(0, Math.floor(x0)), by0 = Math.max(0, Math.floor(y0)), bw = Math.min(WW, Math.ceil(x1)) - bx0, bh = Math.min(WH, Math.ceil(y1)) - by0; if (bw <= 0 || bh <= 0) return;
  const g = ROOF_TMP.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR);
  g.setTransform(VZ * DPR, 0, 0, VZ * DPR, VOX * DPR, VOY * DPR); g.imageSmoothingEnabled = false;
  const m = fogPolys && fogMemory(vw);       // out of sight: the roof as you last saw it (grey), like the ground under it
  if (m && m.rc) g.drawImage(m.rc, bx0 * FOGK, by0 * FOGK, bw * FOGK, bh * FOGK, bx0, by0, bw, bh); else g.drawImage(ROOF_C, bx0, by0, bw, bh, bx0, by0, bw, bh);
  if (fogPolys && pw.length) { g.save(); polyPath(g, pw); g.clip(); g.clearRect(bx0, by0, bw, bh); g.drawImage(ROOF_C, bx0, by0, bw, bh, bx0, by0, bw, bh); g.restore(); }   // in sight: in colour
  g.globalCompositeOperation = 'destination-out';
  // per eye: through glass the roof keeps roofOp(d) + ROOF_GLASS; seen directly, a second pass takes it down to roofOp(d)
  eyes.forEach(([ex, ey], n) => {
    for (const [P, keep] of [[pw[n], d => Math.min(1, roofOp(d) + ROOF_GLASS)], [pd[n], d => roofOp(d) / Math.min(1, roofOp(d) + ROOF_GLASS)]]) {
      const gr = g.createRadialGradient(ex, ey, 0, ex, ey, ROOF_FAR);
      for (let d = 0; d <= ROOF_FAR; d += 10) gr.addColorStop(d / ROOF_FAR, `rgba(0,0,0,${(1 - keep(d)).toFixed(3)})`);
      g.fillStyle = gr; polyPath(g, [P]); g.fill();
    }
  });
  g.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(ROOF_TMP, vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR, vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR); ctx.restore();
  vw._roof = { pw, pd };
}

/* ---------------- painting ---------------- */
function paintDevGround() {
  gx.setTransform(1, 0, 0, 1, 0, 0); gx.globalAlpha = 1; gx.globalCompositeOperation = 'source-over'; gx.imageSmoothingEnabled = false;
  gx.fillStyle = '#5b6248'; gx.fillRect(0, 0, WW, WH);
  SKIRT_PAT = '#3c4232';
  const TL = MAP.tiled;
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
  if (v === C_RUB || v === C_FLOOR) { const h = Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ (DEV.seed * 83492791); c = RUB_T; k = h & 3; flip = !!(h & 4); }   // rubble: same tile, turned / flipped per cell
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
function devBlast(x, y, r, dmg) {
  const R = r * 0.6, k = STRUCT_K[r] || 1;
  for (const sec of MAP.tiled.secs) {
    if (!sec.alive) continue;
    const b = sec.b, nx = clamp(x, b.x, b.x + b.w), ny = clamp(y, b.y, b.y + b.h), d = Math.hypot(nx - x, ny - y); if (d > R) continue;
    devDamage(sec, dmg * k * clamp(1 - d / R, 0.3, 1), nx, ny);
  }
}
function devDamage(sec, v, x, y) {
  if (!sec.alive) return;
  const intact = sec.hp >= sec.mhp;
  sec.hp -= v; sec.hitT = 0.35; devNum(x, y, v, '#ffb060');
  if (sec.hp <= 0) devCollapse(sec);
  else if (sec.glass && intact) { devRepaint(sec, 0); sfx('glass', x, y); }
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
  for (const [cx, cy, r] of _vc) for (const b of MAP.buildings) if (b.sec && !_ram.includes(b.sec) && Math.hypot(clamp(cx, b.x, b.x + b.w) - cx, clamp(cy, b.y, b.y + b.h) - cy) < r + 1) _ram.push(b.sec);
  const cd = v.ramCd || (v.ramCd = {});
  for (const sec of _ram) {
    if ((cd[sec.i] || 0) > M.time) continue; cd[sec.i] = M.time + 0.25;
    const s = Math.max(sp, P.min), b = sec.b, x = clamp(v.x, b.x, b.x + b.w), y = clamp(v.y, b.y, b.y + b.h);
    devDamage(sec, s * P.wall * (sec.glass ? 3 : 1), x, y);
    hurtVehicle(v, s * P.self * (sec.glass ? 0.1 : 1), null);
    v.spd *= sec.glass ? Math.max(P.keep, 0.7) : P.keep; v.crashCd = 0.6;
    if (!sec.glass) { sfx('crush', x, y); sparks(x, y, 3); }
  }
}
/* collapse dust: a smoke grenade's cloud, brown in a random shade, half opacity, 6-15 s */
function devDust(x, y) { popSmoke(x, y, { tint: 'brown', shade: rint(0, 3), op: 0.5, T: rnd(6, 15), quiet: true }); }
function devCollapse(sec) {
  const TL = MAP.tiled; sec.alive = false; sec.hp = 0;
  const bi = MAP.buildings.indexOf(sec.b); if (bi >= 0) MAP.buildings.splice(bi, 1);
  for (let j = sec.cy; j < sec.cy + sec.ch; j++) for (let i = sec.cx; i < sec.cx + sec.cw; i++) {
    TL.cell[j * TL.sc + i] = C_RUB;
    const cx = (i + 0.5) * SUB, cy = (j + 0.5) * SUB;
    if (!sec.glass && (i + j) % 2 === 0) devDust(cx, cy);    // dust from wall cells on a checkerboard
    if (!sec.glass) for (let q = 0; q < 3; q++) part({ k: 'dust', x: cx + rnd(-6, 6), y: cy + rnd(-6, 6), vx: rnd(-40, 40), vy: rnd(-40, 40), life: rnd(1.4, 2.4), max: 2.4, sz: rnd(14, 26), drag: 1.2 });
    for (let q = 0; q < (sec.glass ? 3 : 5); q++) { const a = rnd(0, TAU), sp = rnd(40, 190); part({ k: 'debris', x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.4, 1), max: 1, sz: rnd(2, sec.glass ? 3 : 5), rot: rnd(0, TAU), vr: rnd(-12, 12), drag: 3 }); }
  }
  // the cells and everything around them (neighbouring walls may become crumbled ends), then the roof it held up
  devRepaint(sec, 1);
  if (!sec.glass && TL.roof) { const ks = []; for (let j = sec.cy; j < sec.cy + sec.ch; j++) for (let i = sec.cx; i < sec.cx + sec.cw; i++) ks.push(j * TL.sc + i); repaintRoofAround(ks); devRoofFall(sec); }
  devSight(); navDirty = 1;          // the fog's memory isn't reset: out of sight you keep seeing it standing until you look
  sfx(sec.glass ? 'glass' : 'crumble', sec.b.x + sec.b.w / 2, sec.b.y + sec.b.h / 2);
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
  for (const v of M.vehicles) if (!v.seats.some(o => o)) { engineOff(v); v.gone = true; }
  M.vehicles = M.vehicles.filter(v => !v.gone); M.wrecks.length = 0; navDirty = 1;
}
function devResetMap() {
  buildDevMap(); MAP.statics.forEach((s, i) => s.idx = i); paintGround(); buildNav(); M.fogMem = null; M.wrecks.length = 0; M.smokes.length = 0;
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
  if (DEV.roofQ.length) { for (const q of DEV.roofQ) if (q.at <= M.time) devRoofTile(q.k, q.ev); prune(DEV.roofQ, q => q.at > M.time); }
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
    const w = 64 * u; btn('DEV', () => DEV.open = true, W - SAFE.r - w - 10 * u, y0, w);
    DEV.R = { x: W - SAFE.r - w - 10 * u, y: y0, w, h: rh }; return;
  }
  const cw2 = (pw - 24 * u - gap) / 2, L = x0 + 12 * u, R2 = L + cw2 + gap;
  let y = y0 + 34 * u;
  const head = t => { txt(t, L, y + 8 * u, 10 * u, 'rgba(255,224,138,0.8)', 'left', 'middle', FD); y += 18 * u; };
  const row = (a, b) => { if (a) btn(...a.slice(0, 2), L, y, b ? cw2 : cw2 * 2 + gap, a[2], a[3]); if (b) btn(...b.slice(0, 2), R2, y, cw2, b[2]); y += rh + gap; };
  // measure first so the backdrop fits
  const H0 = 34 * u + 18 * u * 4 + (rh + gap) * 9 + Math.min(DEV.log.length, 9) * 15 * u + 16 * u;
  ctx.fillStyle = 'rgba(6,10,5,0.86)'; ctx.fillRect(x0, y0, pw, H0); ctx.strokeStyle = 'rgba(255,224,138,0.5)'; ctx.strokeRect(x0 + 0.5, y0 + 0.5, pw - 1, H0 - 1);
  DEV.R = { x: x0, y: y0, w: pw, h: H0 };
  stxt('DEV TOOLS', L, y0 + 18 * u, 15 * u, '#ffe08a', 'left', 'middle', FD);
  btn('×', () => DEV.open = false, x0 + pw - 34 * u, y0 + 6 * u, 26 * u);
  head('SPAWN');
  row(['DUMMY', devSpawnDummy], ['CLEAR DUMMIES', devClearDummies]);
  row([`‹  RANGE ${DEV.range} TILES  ›`, d => { const i = DEV_RANGES.indexOf(DEV.range); DEV.range = DEV_RANGES[clamp(i + d, 0, DEV_RANGES.length - 1)]; }, undefined, true]);
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
