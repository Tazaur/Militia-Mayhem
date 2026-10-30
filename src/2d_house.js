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

/* ---------------- roofs ---------------- */
/* roof styles. Pitched ones are hipped, whatever the house's shape: each point slopes to its nearest eave (the four ways
   along its row / column of roof), so faces meet in ridges and hips; the sun (top left) lights the faces that way.
   rows / tab: shingle courses (px) and tab width; wave: clay barrels; seam: standing-seam metal; straw: thatch; flat:
   a parapet. pals: its colours (one per house), bits: what stands on it */
const ROOF_STYLES = {
  shingle: { rows: 8, tab: 14, bits: 'chimney vent sky moss', pals: [[112, 76, 58], [80, 86, 96], [72, 94, 76], [126, 62, 50], [62, 60, 58]] },
  clay: { rows: 9, tab: 10, wave: 1, bits: 'chimney vent moss', pals: [[170, 84, 54], [186, 106, 66], [150, 72, 50]] },
  metal: { seam: 10, bits: 'vent', pals: [[78, 118, 102], [150, 54, 40], [136, 140, 146], [72, 96, 128]] },
  thatch: { straw: 1, bits: 'chimney moss', pals: [[170, 136, 64], [150, 118, 54]] },
  tar: { flat: 1, bits: 'ac vent hatch plant', pals: [[76, 74, 70], [64, 66, 68]] },
  concrete: { flat: 1, bits: 'ac vent hatch tank plant', pals: [[164, 164, 158], [146, 146, 140]] }
};
/* the styles that belong on each map (a house picks one by its seed, so a mirrored pair matches) */
const MAP_ROOFS = { crossroads: ['tar', 'concrete', 'shingle', 'clay'], farmlands: ['metal', 'metal', 'thatch', 'shingle'], rivertown: ['clay', 'shingle', 'tar', 'clay'], snowfield: ['shingle', 'metal', 'shingle'], outskirts: ['shingle', 'shingle', 'clay', 'metal', 'shingle'] };
/* a house's whole roof ({W, H, roof: 1 a cell with roof, seed}) as a canvas in its frame (the game: H.rf, roofCell copies
   tiles of it in). st: its style (else, by the seed, one of list), snow lying on it, grit: the darker look */
function roofPaint(H, st, list, snow, grit) {
  const R = gRng(H.seed * 53 + 11), pk = R(); st = ROOF_STYLES[st] ? st : list[Math.floor(pk * list.length)];
  const  S = ROOF_STYLES[st], pal = S.pals[Math.floor(R() * S.pals.length)];
  const W = H.W * SUB, HH = H.H * SUB, N = H.W * H.H, on = (i, j) => i >= 0 && j >= 0 && i < H.W && j < H.H && H.roof[j * H.W + i] === 1;
  const c = gCv(W, HH), g = c.getContext('2d'), im = g.createImageData(W, HH), D = im.data;
  // each cell's roof run: the first / last cell of it left-right (rl, rr) and up-down (ru, rd)
  const rl = new Int16Array(N), rr = new Int16Array(N), ru = new Int16Array(N), rd = new Int16Array(N);
  for (let j = 0; j < H.H; j++) { for (let i = 0; i < H.W; i++) { const k = j * H.W + i; rl[k] = on(i - 1, j) ? rl[k - 1] : i; } for (let i = H.W - 1; i >= 0; i--) { const k = j * H.W + i; rr[k] = on(i + 1, j) ? rr[k + 1] : i; } }
  for (let i = 0; i < H.W; i++) { for (let j = 0; j < H.H; j++) { const k = j * H.W + i; ru[k] = on(i, j - 1) ? ru[k - H.W] : j; } for (let j = H.H - 1; j >= 0; j--) { const k = j * H.W + i; rd[k] = on(i, j + 1) ? rd[k + H.W] : j; } }
  const dist = (x, y) => { const k = Math.floor(y / SUB) * H.W + Math.floor(x / SUB); return [y - ru[k] * SUB + 0.5, (rr[k] + 1) * SUB - x - 0.5, (rd[k] + 1) * SUB - y - 0.5, x - rl[k] * SUB + 0.5]; };     // to the eave up, right, down, left
  const hs = (a, b) => ((Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(H.seed | 0, 83492791)) >>> 0) / 4294967296;
  const blots = []; for (let n = 0; n < W * HH / 7000 + 2; n++) blots.push([R() * W, R() * HH, 10 + R() * 34, 0.05 + R() * 0.12]);     // weathering
  const SUNF = [1.1, 0.86, 0.76, 1.0]; grit = grit ? 0.8 : 1;
  for (let y = 0; y < HH; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4; if (!on(Math.floor(x / SUB), Math.floor(y / SUB))) { D[p + 3] = 0; continue; }
    const q = dist(x, y); let f = 0; for (let n = 1; n < 4; n++) if (q[n] < q[f]) f = n;
    let d2 = 1e9; for (let n = 0; n < 4; n++) if (n !== f && q[n] < d2) d2 = q[n];
    const d = q[f], al = f % 2 ? y : x;     // across the face (from its eave), along it
    let t = 1, v = S.flat ? 1 : SUNF[f];
    if (S.flat) {
      if (hs(x, y) < 0.09) t += (hs(y, x) - 0.5) * 0.5;     // gravel
      if (d < 2) t *= 0.55; else if (d < 5) t *= 1.16; else if (d < 7) t *= f === 0 || f === 3 ? 0.7 : 0.9;     // the parapet, its shadow inside
    } else {
      if (S.rows) {
        const row = Math.floor(d / S.rows), a = al + (row & 1) * S.tab / 2, ti = Math.floor(a / S.tab);
        t = 1 + (hs(row * 7 + f, ti) - 0.5) * 0.18;
        if (S.wave) t *= 0.78 + 0.32 * Math.sin(Math.PI * (a % S.tab) / S.tab);
        if (d % S.rows < 1.6) t *= 0.68; else if (!S.wave && a % S.tab < 1.2) t *= 0.8;
      } else if (S.seam) { const m = al % S.seam; t = (m < 1.5 ? 1.2 : m < 3 ? 0.76 : 1) * (0.97 + hs(Math.floor(al / S.seam), Math.floor(d / 6)) * 0.06); }
      else if (S.straw) { t = 0.82 + 0.34 * hs(Math.floor(al / 2), Math.floor(d / 6) * 31 + f); if (d % 6 < 1) t *= 0.86; }
      if (d2 - d < 1.1) t *= 0.62; else if (d2 - d < 3.5) t *= 1.12;     // ridge / hip: a line, then the cap
      if (d < 2) t *= 0.5; else if (d < 3) t *= 0.8;     // the eave
    }
    for (const [bx, by, br, bk] of blots) { const e = Math.hypot(x - bx, y - by); if (e < br) t *= 1 - bk * (1 - e / br); }
    t *= (0.96 + hs(x * 3 + 1, y * 7 + 2) * 0.08) * v * grit;
    let r = pal[0] * t, gg = pal[1] * t, b = pal[2] * t;
    if (snow) { const k = (S.flat ? 0.7 : [0.72, 0.55, 0.45, 0.66][f]) * (0.75 + hs(x, y) * 0.25) * (d < 3 ? 0.35 : 1), w = Math.min(1.1, Math.sqrt(t)); r += (232 * w - r) * k; gg += (238 * w - gg) * k; b += (246 * w - b) * k; }     // snow lying on it, the courses showing through
    D[p] = r; D[p + 1] = gg; D[p + 2] = b; D[p + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  // what stands on it, each where the roof is at least m px in from every eave and clear of the others
  const took = [], spot = (w, h, m) => {
    for (let n = 0; n < 40; n++) {
      const x = 4 + R() * (W - w - 8), y = 4 + R() * (HH - h - 8);
      if (took.some(o => x < o[0] + o[2] + 5 && x + w + 5 > o[0] && y < o[1] + o[3] + 5 && y + h + 5 > o[1])) continue;
      if ([[x, y], [x + w, y], [x, y + h], [x + w, y + h], [x + w / 2, y + h / 2]].every(([a, b]) => on(Math.floor(a / SUB), Math.floor(b / SUB)) && Math.min(...dist(Math.min(W - 1, a), Math.min(HH - 1, b))) >= m)) { took.push([x, y, w, h]); return [x, y]; }
    }
    return null;
  };
  const shade = (x, y, w, h, k) => { g.fillStyle = 'rgba(0,0,0,' + (k || 0.35) + ')'; g.fillRect(x + 4, y + 4, w, h); };
  const bits = S.bits.split(' '), has = k => bits.includes(k), area = W * HH, mt = grit < 1 ? 0.8 : 1;
  if (has('chimney') && R() < 0.75) { const q = spot(20, 16, 10); if (q) { const [x, y] = q; shade(x, y, 20, 16, 0.4); g.fillStyle = '#7a3c2c'; g.fillRect(x, y, 20, 16); g.fillStyle = '#5c2c20'; for (let r = 4; r < 16; r += 4) { g.fillRect(x, y + r, 20, 1); for (let c = (r / 4) % 2 ? 3 : 8; c < 20; c += 10) g.fillRect(x + c, y + r - 4, 1, 4); } g.fillStyle = '#9a9690'; g.fillRect(x - 1, y - 1, 22, 3); g.fillRect(x - 1, y - 1, 3, 18); g.fillStyle = '#1c1512'; g.fillRect(x + 5, y + 4, 10, 8); } }
  if (has('sky') && R() < 0.4) for (let n = 0; n < 1 + (R() < 0.4); n++) { const q = spot(14, 18, 12); if (!q) break; const [x, y] = q; g.fillStyle = '#d8d8d2'; g.fillRect(x, y, 14, 18); g.fillStyle = '#34444f'; g.fillRect(x + 2, y + 2, 10, 14); g.fillStyle = 'rgba(200,225,240,0.35)'; g.beginPath(); g.moveTo(x + 2, y + 9); g.lineTo(x + 9, y + 2); g.lineTo(x + 12, y + 2); g.lineTo(x + 2, y + 12); g.fill(); }
  if (has('ac')) for (let n = 0; n < 1 + Math.floor(R() * Math.min(4, area / 25000)); n++) { const q = spot(22, 18, 8); if (!q) break; const [x, y] = q; shade(x, y, 22, 18); g.fillStyle = grit < 1 ? '#6a6a64' : '#9a9a96'; g.fillRect(x, y, 22, 18); g.fillStyle = grit < 1 ? '#4a4a46' : '#6c6c68'; g.fillRect(x + 3, y + 3, 16, 12); g.fillStyle = '#2a2a28'; g.beginPath(); g.arc(x + 11, y + 9, 5, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#555550'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 6, y + 9); g.lineTo(x + 16, y + 9); g.moveTo(x + 11, y + 4); g.lineTo(x + 11, y + 14); g.stroke(); }
  if (has('hatch') && R() < 0.7) { const q = spot(13, 13, 8); if (q) { const [x, y] = q; shade(x, y, 13, 13, 0.25); g.fillStyle = '#5e5e5a'; g.fillRect(x, y, 13, 13); g.fillStyle = '#7a7a74'; g.fillRect(x + 2, y + 2, 9, 9); g.fillStyle = '#444'; g.fillRect(x + 9, y + 5, 2, 3); } }
  if (has('tank') && R() < 0.45) { const q = spot(24, 24, 8); if (q) { const [x, y] = q; g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(x + 16, y + 16, 12, 0, Math.PI * 2); g.fill(); g.fillStyle = '#8c8c86'; g.beginPath(); g.arc(x + 12, y + 12, 12, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#6e6e68'; g.lineWidth = 2; g.beginPath(); g.arc(x + 12, y + 12, 8, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#b0b0aa'; g.beginPath(); g.arc(x + 9, y + 9, 3, 0, Math.PI * 2); g.fill(); } }
  if (has('vent')) for (let n = 0; n < 1 + Math.floor(R() * 3); n++) { const q = spot(7, 7, 6); if (!q) break; const [x, y] = q; g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(x + 5.5, y + 5.5, 3.5, 0, Math.PI * 2); g.fill(); g.fillStyle = '#8a8a86'; g.beginPath(); g.arc(x + 3.5, y + 3.5, 3.5, 0, Math.PI * 2); g.fill(); g.fillStyle = '#2a2a28'; g.beginPath(); g.arc(x + 3.5, y + 3.5, 1.6, 0, Math.PI * 2); g.fill(); }
  const leaf = (x, y, r) => { for (let n = 0; n < 5; n++) { g.fillStyle = ['#3f5f2a', '#567a34', '#6e9440'][n % 3]; g.beginPath(); g.arc(x + (R() - 0.5) * r * 1.4, y + (R() - 0.5) * r * 1.4, r * (0.5 + R() * 0.4), 0, Math.PI * 2); g.fill(); } };
  if (has('plant') && R() < 0.6) for (let n = 0; n < 1 + Math.floor(R() * 3); n++) {     // planter boxes, potted plants
    if (R() < 0.5) { const q = spot(26, 9, 6); if (!q) break; const [x, y] = q; shade(x, y, 26, 9, 0.3); g.fillStyle = '#6a4a30'; g.fillRect(x, y, 26, 9); g.fillStyle = '#3a2a1c'; g.fillRect(x + 2, y + 2, 22, 5); for (let k = 0; k < 3; k++) leaf(x + 5 + k * 8, y + 4, 4); }
    else { const q = spot(10, 10, 6); if (!q) break; const [x, y] = q; g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(x + 8, y + 8, 5, 0, Math.PI * 2); g.fill(); g.fillStyle = '#8a5a3a'; g.beginPath(); g.arc(x + 5, y + 5, 5, 0, Math.PI * 2); g.fill(); leaf(x + 5, y + 5, 4); }
  }
  if (has('moss') && !snow && R() < 0.65) { g.globalAlpha = 0.45 * mt; for (let n = 0; n < 2 + Math.floor(R() * area / 15000); n++) { const x = R() * W, y = R() * HH; if (!on(Math.floor(x / SUB), Math.floor(y / SUB))) continue; for (let k = 0; k < 6; k++) { const a = x + (R() - 0.5) * 16, b = y + (R() - 0.5) * 10; if (!on(Math.floor(a / SUB), Math.floor(b / SUB))) continue; g.fillStyle = R() < 0.5 ? '#4e6a2c' : '#62803a'; g.beginPath(); g.arc(a, b, 2 + R() * 3, 0, Math.PI * 2); g.fill(); } } g.globalAlpha = 1; }
  return c;
}
