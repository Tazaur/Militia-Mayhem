/* ---------------- houses: the grid, the generator, the wall tiles ----------------
   Shared with the map editor (mapedit/): nothing here may use the game's other globals. A house is a W x H grid of
   SUB px cells (C_*); genHouse makes one from a random source (the game: mulberry(seed * 7919 + 13); the editor the
   same numbers from gRng). Walls are drawn from the walls16 sheet (houseTile) */
const SUB = 16;
const C_OUT = 0, C_FLOOR = 1, C_WALL = 2, C_WIN = 3, C_RUB = 4;
const ROOM_MIN = 36, ROOM_SIDE = 5;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];          // up, right, down, left
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

/* one cell's tile, drawn into g (its transform already the house's frame, px = cell x SUB): rubble (a floor cell only when
   asked), a window (broke: the broken one), or the wall piece its wall neighbours call for. at(i, j): the cell there */
function houseTile(g, img, at, i, j, seed, broke) {
  const v = at(i, j), x = i * SUB, y = j * SUB; let c, k, flip = false;
  if (v === C_RUB || v === C_FLOOR) { const h = Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ (seed * 83492791); c = RUB_T; k = h & 3; flip = !!(h & 4); }   // rubble: same tile, turned / flipped per cell
  else if (v === C_WIN) { c = broke ? WIN_BROKE : WIN_T; k = at(i - 1, j) === C_WIN || at(i + 1, j) === C_WIN ? 0 : 1; }   // windows only ever use the middle piece
  else {
    let m = 0, n = 0, rub = -1;
    for (let d = 0; d < 4; d++) { const o = at(i + DIRS[d][0], j + DIRS[d][1]); if (o === C_WALL) { m |= 1 << d; n++; } else if (o === C_RUB) rub = d; }
    if (n <= 1 && rub >= 0) { c = CRUMB_T; k = WALL_BY_MASK[n ? m : 1 << ((rub + 2) % 4)][1]; }    // beside a fallen wall: the broken end, jagged side away from what still stands
    else { const q = WALL_BY_MASK[m]; c = WT[q[0]]; k = q[1]; }          // a window beside a wall gives it an end
  }
  g.save(); g.translate(x + SUB / 2, y + SUB / 2); g.rotate(k * Math.PI / 2); if (flip) g.scale(-1, 1);
  g.drawImage(img, c[0] * SUB, c[1] * SUB, SUB, SUB, -SUB / 2, -SUB / 2, SUB, SUB); g.restore();
}
/* ---------------- house generator ---------------- */
/* returns {W, H, g} with g[y*W+x] in C_OUT / C_FLOOR / C_WALL / C_WIN, or null if no house fits */
function genHouse(R, maxW, maxH, minW, minH) {     // minW / minH: the smallest it may be (15 x 13; under 15 wide it may have fewer than 3 rooms)
  minW = minW || 15; minH = minH || 13;
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = A => A[Math.floor(R() * A.length)];
  for (let tries = 0; tries < 500; tries++) {
    const W = ri(minW, maxW), H = ri(minH, maxH);
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
    if (rooms.length < (minW < 15 ? 1 : 3)) continue;
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

