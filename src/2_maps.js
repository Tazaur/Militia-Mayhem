/* =====================================================================
   MAPS — every map is point-symmetric around the centre so both teams
   get the same ground. Each builder lays out the west half; mirror()
   produces the east half.
   ===================================================================== */
let MAP = null;
const ground = mkG(WW, WH); const gx = ground.getContext('2d');
const mirrorPt = (x, y) => [WW - x, WH - y];
const mirrorRect = r => ({ ...r, x: WW - r.x - r.w, y: WH - r.y - r.h });

/* roads: the map editor's (2b_ground.js path stamps: lines l, width wd, type rt with its pavement); the built-in maps' straight
   [x1, y1, x2, y2] ones made the same (roadOf), so every map's roads are painted, joined and crossed one way (gBake) */
const roadOf = (l, w, side, style) => style === 'dirt' ? { k: 'path', t: 'dirt', rt: 'dirt', soft: 6, r: 0, wd: w, l: [l] } : { k: 'path', t: 'asphalt', rt: 'street', sw: side, soft: 2, r: 0, wd: w, l: [l] };
/* the road (pavement included) within pad of (x, y), or null */
function onRoad(x, y, pad) {
  for (const rd of MAP.roads) { const e = rd.wd / 2 + gSW(rd) + (pad || 0); for (const p of rd.l) for (let i = 0; i + 3 < p.length; i += 2) if (gSegNear(p, i, x, y)[0] < e) return rd; }
  return null;
}
/* a road (pavement included) within pad of rect r: the rect's points against every segment (sampled, for placing) */
function roadInRect(r, pad) {
  for (const rd of MAP.roads) { const e = rd.wd / 2 + gSW(rd) + pad; for (const p of rd.l) for (let i = 0; i + 3 < p.length; i += 2) {
    const n = Math.max(1, Math.ceil(Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]) / 8));
    for (let k = 0; k <= n; k++) { const x = p[i] + (p[i + 2] - p[i]) * k / n, y = p[i + 1] + (p[i + 3] - p[i + 1]) * k / n; if (x > r.x - e && x < r.x + r.w + e && y > r.y - e && y < r.y + r.h + e) return true; }
  } }
  return false;
}
function inWater(x, y) { for (const w of MAP.water) if (inRect(x, y, w)) return true; return false; }
function onIce(x, y) { for (const w of MAP.ice) if (inRect(x, y, w)) return true; return false; }
const SNOWY = () => MAP && MAP.id === 'snowfield';
/* footprints live on their own layer that slowly fades (about two minutes) */
const prints = mkG(WW, WH); const px_ = prints.getContext('2d');
/* everything left behind (bodies, blood, tread marks) lives on a decal layer that fades over ~3 minutes (craters don't: scorch) */
const decals = mkG(WW, WH); const dgx = decals.getContext('2d');
/* every 3 s both layers lose a step: footprints 7.5 %, decals 5 %, and a little more (FADE_CUT), so the faintest reach zero:
   erasing a share alone sticks at a faint alpha (8-bit: 5 % of 10 rounds to nothing) and leaves a ghost. As an alpha
   filter where the canvas has them; else the old erase */
const FADE_CUT = 0.007, FADE_F = typeof dgx.filter === 'string' && (() => {
  const d = document.createElement('div'); d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  d.innerHTML = `<svg width="0" height="0">${[0.075, 0.05].map((a, i) => `<filter id="fade${i}" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncA type="linear" slope="${1 - a}" intercept="${-FADE_CUT}"/></feComponentTransfer></filter>`).join('')}</svg>`;
  document.body.appendChild(d); return true;
})();
let layerFadeT = 0;
function fadeLayers(dt) {
  layerFadeT += dt; if (layerFadeT < 3) return; layerFadeT = 0;
  [[px_, 0.075], [dgx, 0.05]].forEach(([g, a], i) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (g.fadeAlpha) { g.fadeAlpha(1 - a, -FADE_CUT); return; }     // GL: a shader pass
    if (FADE_F) { g.globalCompositeOperation = 'copy'; g.filter = `url(#fade${i})`; g.drawImage(g.canvas, 0, 0); g.filter = 'none'; }
    else { g.globalCompositeOperation = 'destination-out'; g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(0, 0, WW, WH); }
    g.globalCompositeOperation = 'source-over';
  });
}
function footprint(x, y, a, side, prone) {
  const snow = SNOWY() && !onRoad(x, y, 0), road = onRoad(x, y, 0);
  const al = snow ? 0.5 : road ? (road.style === 'dirt' ? 0.3 : 0.08) : 0.2;
  const c = Math.cos(a), sn = Math.sin(a);
  px_.setTransform(c, sn, -sn, c, x - sn * side * 3, y + c * side * 3);
  px_.fillStyle = snow ? `rgba(70,90,115,${al})` : `rgba(30,24,12,${al})`;
  if (prone) px_.fillRect(-6, -5, 12, 10); else { px_.fillRect(-2.5, -1.3, 5, 2.6); }
  px_.setTransform(1, 0, 0, 1, 0, 0);
}

function buildMap(id) {
  const R = mulberry(id === 'crossroads' ? 1987 : id === 'farmlands' ? 2311 : id === 'snowfield' ? 6151 : id === 'outskirts' ? 8807 : 4099);
  const m = { id, houses: [], secs: [], arcs: [], roads: [], buildings: [], water: [], bridges: [], statics: [], flags: [], bases: [], crateSpots: [], vehSpawns: [], ffaSpawns: [], fields: [], fwd: [], ice: [] };
  m.bases = [{ team: 0, x: 130, y: WH / 2, pad: { x: 20, y: WH / 2 - 200, w: 340, h: 400 } }, { team: 1, x: WW - 130, y: WH / 2, pad: { x: WW - 360, y: WH / 2 - 200, w: 340, h: 400 } }];
  MAP = m; BOUNDM = null; SKIRT = id.startsWith('g:') ? 0 : 480;
  const sym = (arr, o, mir) => { arr.push(o); arr.push(mir(o)); };
  /* a house within pad of (x, y) */
  const inHouse = (x, y, pad) => m.houses.length > 0 && [[x, y], [x - pad, y - pad], [x + pad, y - pad], [x - pad, y + pad], [x + pad, y + pad]].some(([a, b]) => houseAt(a, b));
  /* a stamped map's battlefield edge: o (and its pad) moved to the nearest spot at least d in from it */
  const inside = (o, d) => {
    const ok = (x, y) => !outOfBounds(x, y) && [0, 1, 2, 3, 4, 5, 6, 7].every(k => !outOfBounds(x + Math.cos(k * TAU / 8) * d, y + Math.sin(k * TAU / 8) * d));
    if (ok(o.x, o.y)) return; let best = null;
    for (let r = 20; r < Math.max(WW, WH) && !best; r += 20) for (let k = 0; k < 32; k++) { const x = o.x + Math.cos(k * TAU / 32) * r, y = o.y + Math.sin(k * TAU / 32) * r; if (ok(x, y)) { best = [x, y]; break; } }
    if (!best) return; const dx = best[0] - o.x, dy = best[1] - o.y; o.x += dx; o.y += dy; if (o.pad) { o.pad.x += dx; o.pad.y += dy; }
  };
  const blockedFor = (x, y, pad) => {
    if (x < 50 || y < 50 || x > WW - 50 || y > WH - 50) return true;
    if (BOUNDM && outOfBounds(x, y)) return true;
    if (inHouse(x, y, pad + 8)) return true;
    if (onRoad(x, y, pad)) return true;
    for (const w of m.water) if (inRect(x, y, w, pad + 10)) return true;
    for (const b of m.buildings) if (inRect(x, y, b, pad + 6)) return true;
    for (const f of m.flags) if (Math.hypot(x - f.x, y - f.y) < 118 + pad) return true;
    for (const b of m.bases) if (inRect(x, y, b.pad, pad + 30)) return true;
    return false;
  };
  const rectFree = (r, gap) => {
    if (r.x < 60 || r.y < 60 || r.x + r.w > WW - 60 || r.y + r.h > WH - 60) return false;
    if (roadInRect(r, 10)) return false;
    for (const w of m.water) if (r.x < w.x + w.w + 20 && r.x + r.w > w.x - 20 && r.y < w.y + w.h + 20 && r.y + r.h > w.y - 20) return false;
    for (const w of m.ice) if (r.x < w.x + w.w + 30 && r.x + r.w > w.x - 30 && r.y < w.y + w.h + 30 && r.y + r.h > w.y - 30) return false;
    for (const b of m.buildings) if (r.x < b.x + b.w + gap && r.x + r.w > b.x - gap && r.y < b.y + b.h + gap && r.y + r.h > b.y - gap) return false;
    for (const f of m.flags) { const nx = clamp(f.x, r.x, r.x + r.w), ny = clamp(f.y, r.y, r.y + r.h); if (Math.hypot(nx - f.x, ny - f.y) < 125) return false; }
    for (const b of m.bases) { const p = b.pad; if (r.x < p.x + p.w + 60 && r.x + r.w > p.x - 60 && r.y < p.y + p.h + 60 && r.y + r.h > p.y - 60) return false; }
    // keep the mirrored copy from touching this one across the centre
    const mr = mirrorRect(r); if (r.x < mr.x + mr.w + gap && r.x + r.w > mr.x - gap && r.y < mr.y + mr.h + gap && r.y + r.h > mr.y - gap) return false;
    return true;
  };
  /* houses (the dev yard's tiled ones), each placed on the left half and mirrored half round the centre. mw, mh: the
     most cells it may take (the least 4 fewer); at(w, h): its lot (a free rect) for a house that size, or null. The lots
     hold the space while the map is placed (m.buildings), then the houses' own walls take over (tiledFinish, below) */
  const house = (mw, mh, at) => {
    const seed = Math.floor(R() * 1e9), mn = [Math.min(15, Math.max(9, mw - 4)), Math.min(13, Math.max(8, mh - 4))];
    const h = genHouse(mulberry(seed * 7919 + 13), mw, mh, ...mn); if (!h) return false;
    const r = at(h.W * SUB, h.H * SUB); if (!r) return false;
    sym(m.buildings, r, mirrorRect);
    const o = { x: r.x + r.w / 2, y: r.y + r.h / 2, a: 0, seed, mw, mh, mn };
    m.houses.push(mkHouse(o, m.houses.length), mkHouse({ ...o, x: WW - o.x, y: WH - o.y, a: Math.PI }, m.houses.length + 1)); return true;
  };
  const cells = (px, lo) => Math.max(lo, Math.round(px / SUB));
  /* houses on given lots [x, y, w, h] (centred there, as big as the lot - 10 x 9 cells at least), where they fit */
  const houseLots = B => { for (const [x, y, w, h] of B) house(cells(w, 10), cells(h, 9), (W, H) => { const r = { x: Math.round(x + w / 2 - W / 2), y: Math.round(y + h / 2 - H / 2), w: W, h: H }; return rectFree(r, 32) ? r : null; }); };
  /* n houses anywhere left of xmax, sizes (px) in wr x hr, gap px between lots */
  const placeHouses = (n, xmax, wr, hr, gap) => {
    for (let k = 0, t = 0; k < n && t < 60; t++) if (house(cells(wr[0] + R() * (wr[1] - wr[0]), 10), cells(hr[0] + R() * (hr[1] - hr[0]), 9), (W, H) => {
      for (let q = 0; q < 150; q++) { const r = { x: Math.round(60 + R() * (xmax - 60 - W)), y: Math.round(60 + R() * (WH - 120 - H)), w: W, h: H }; if (rectFree(r, gap || 48)) return r; }
      return null;
    })) k++;
  };
  const addStatic = (o, mirrorIt) => { m.statics.push(o); if (mirrorIt) { const [x, y] = mirrorPt(o.x, o.y); m.statics.push({ ...o, x, y, a: (o.a || 0) + Math.PI }); } };
  const crescent = (x, y, face, mi) => {   // face = direction the cover protects against
    const mk1 = (cx, cy, f) => { const A = { x: cx, y: cy, a: f + Math.PI, bags: [], lost: 0 }; m.arcs.push(A); const c = Math.cos(A.a), sn = Math.sin(A.a);
      for (const [px, py] of EXTRA.bagPts) { const st = { type: 'bag', x: cx + px * c - py * sn, y: cy + px * sn + py * c, a: 0, r: 8, alive: true, arc: A }; A.bags.push(st); m.statics.push(st); } };
    mk1(x, y, face); if (mi) { const [mx, my] = mirrorPt(x, y); mk1(mx, my, face + Math.PI); }
  };
  const bag = (x, y, a, mi) => addStatic({ type: 'bag', x, y, a, r: 7, alive: true }, mi);
  const arc = (cx, cy, rad, a0, a1, mi, type) => {
    const n = Math.max(2, Math.round(Math.abs(a1 - a0) * rad / (type === 'fence' ? 14 : 12)));
    for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad; if (type === 'fence') addStatic({ type: 'fence', x, y, a: a + Math.PI / 2, r: 5, alive: true }, mi); else bag(x, y, a + Math.PI / 2, mi); }
  };
  const line = (x0, y0, x1, y1, step, fn) => { const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(d / step)); for (let i = 0; i <= n; i++) fn(lerp(x0, x1, i / n), lerp(y0, y1, i / n), Math.atan2(y1 - y0, x1 - x0)); };
  const scatter = (n, minGap, pad, fn) => {
    let tries = 0, k = 0;
    while (k < n && tries++ < 6000) {
      const x = 50 + R() * (WW / 2 - 50), y = 50 + R() * (WH - 100);
      if (blockedFor(x, y, pad)) continue;
      if (m.statics.some(s => Math.hypot(s.x - x, s.y - y) < minGap)) continue;
      fn(x, y); k++;
    }
  };
  const tree = (x, y, mi) => addStatic({ type: 'tree', x, y, r: 10, v: Math.floor(R() * 4), sc: 0.75 + R() * 0.45, a: R() * TAU, alive: true, pine: id === 'snowfield' }, mi);

  if (id === 'crossroads') {
    m.roads = [[0, 1000, 3000, 1000], [900, 0, 900, 2000], [2100, 0, 2100, 2000], [1500, 420, 1500, 1580], [900, 420, 3000, 420], [0, 1580, 2100, 1580]].map(l => roadOf(l, 72, 14, 'asphalt'));
    m.flags = [{ name: 'A', x: 720, y: 1400 }, { name: 'B', x: 1500, y: 1000 }, { name: 'C', x: 2280, y: 600 }];
    const B = [[980, 1100, 180, 130], [1180, 1290, 200, 160], [1000, 560, 200, 150], [1250, 760, 150, 150], [560, 620, 170, 150], [380, 1680, 200, 140], [1100, 1700, 220, 150], [300, 300, 180, 160], [560, 1180, 120, 110], [1240, 180, 160, 140]];
    houseLots(B);
    for (const f of m.flags) for (let k = 0; k < 4; k++) { const c = Math.PI / 4 + k * Math.PI / 2; crescent(f.x + Math.cos(c) * 112, f.y + Math.sin(c) * 112, c, false); }
    crescent(400, 880, 0, true); crescent(400, 1120, 0, true);
    scatter(13, 120, 40, (x, y) => crescent(x, y, R() * TAU, true));
    scatter(46, 44, 26, (x, y) => tree(x, y, true));
  } else if (id === 'farmlands') {
    m.roads = [[0, 1000, 3000, 1000], [1000, 0, 1000, 2000], [2000, 0, 2000, 2000]].map(l => roadOf(l, 58, 0, 'dirt'));
    m.flags = [{ name: 'A', x: 620, y: 1480 }, { name: 'B', x: 1500, y: 1000 }, { name: 'C', x: 2380, y: 520 }];
    const F = [{ x: 60, y: 60, w: 880, h: 520, crop: 'wheat' }, { x: 1060, y: 60, w: 400, h: 860, crop: 'corn' }, { x: 420, y: 1060, w: 520, h: 300, crop: 'plow' }, { x: 1060, y: 1340, w: 420, h: 600, crop: 'wheat' }];
    for (const f of F) sym(m.fields, f, q => ({ ...mirrorRect(q), crop: q.crop }));
    houseLots([[1380, 740, 200, 140]]);
    placeHouses(6, 1380, [160, 240], [144, 190]);
    // fences along the roads, with gates
    for (const rd of m.roads) {
      const [x1, y1, x2, y2] = rd.l[0];
      if (y1 === y2) { for (const sd of [-1, 1]) for (let x = 60; x < WW / 2; x += 14) { if ((Math.floor(x / 160) % 3) === 2) continue; const y = y1 + sd * 42; if (blockedFor(x, y, 2) || onRoad(x, y, 0)) continue; if (m.buildings.some(b => inRect(x, y, b, 6))) continue; addStatic({ type: 'fence', x, y, a: 0, r: 5, alive: true }, true); } }
      else if (x1 < WW / 2) { for (const sd of [-1, 1]) for (let y = 60; y < WH - 60; y += 14) { if ((Math.floor(y / 150) % 3) === 1) continue; const x = x1 + sd * 42; if (onRoad(x, y, 0)) continue; if (m.flags.some(f => Math.hypot(f.x - x, f.y - y) < 130)) continue; if (m.buildings.some(b => inRect(x, y, b, 6))) continue; addStatic({ type: 'fence', x, y, a: Math.PI / 2, r: 5, alive: true }, true); } }
    }
    // hedgerows along field edges
    for (const f of F) {
      const edges = [[f.x, f.y + f.h + 16, f.x + f.w, f.y + f.h + 16], [f.x + f.w + 16, f.y, f.x + f.w + 16, f.y + f.h]];
      for (const [a, b, c, d] of edges) line(a, b, c, d, 36, (x, y) => { if (R() < 0.25) return; if (blockedFor(x, y, 20)) return; if (m.statics.some(s => Math.hypot(s.x - x, s.y - y) < 28)) return; tree(x, y, true); });
    }
    scatter(16, 60, 24, (x, y) => addStatic({ type: 'hay', x, y, r: 13, a: R() * TAU, alive: true }, true));
    for (const f of m.flags) for (let k = 0; k < 3; k++) { const c = k * TAU / 3 + 0.5; crescent(f.x + Math.cos(c) * 110, f.y + Math.sin(c) * 110, c, false); }
    crescent(400, 880, 0, true); crescent(400, 1120, 0, true);
    scatter(16, 46, 24, (x, y) => tree(x, y, true));
  } else if (id === 'snowfield') {
    // snowfield: packed-snow tracks, a frozen lake around the centre flag, cabins and pine forest
    m.roads = [[0, 1000, 3000, 1000], [850, 0, 850, 2000], [2150, 0, 2150, 2000]].map(l => roadOf(l, 60, 0, 'dirt'));
    m.ice = [{ x: 1250, y: 830, w: 500, h: 340 }, { x: 520, y: 260, w: 230, h: 150 }, { x: WW - 520 - 230, y: WH - 260 - 150, w: 230, h: 150 }];
    m.flags = [{ name: 'A', x: 640, y: 1460 }, { name: 'B', x: 1500, y: 1000 }, { name: 'C', x: 2360, y: 540 }];
    placeHouses(8, 1400, [160, 230], [144, 180]);
    for (const f of [m.flags[0]]) for (let k = 0; k < 4; k++) { const c = Math.PI / 4 + k * Math.PI / 2; crescent(f.x + Math.cos(c) * 110, f.y + Math.sin(c) * 110, c, true); }
    for (let k = 0; k < 3; k++) { const c = Math.PI * 0.75 + (k - 1) * 0.55; crescent(1500 + Math.cos(c) * 290, 1000 + Math.sin(c) * 215, c, true); }
    crescent(400, 880, 0, true); crescent(400, 1120, 0, true);
    scatter(8, 110, 40, (x, y) => { if (!m.ice.some(i => inRect(x, y, i, 30))) crescent(x, y, R() * TAU, true); });
    scatter(70, 40, 24, (x, y) => { if (!m.ice.some(i => inRect(x, y, i, 24))) tree(x, y, true); });
  } else if (id === 'outskirts') {
    // outskirts: a bigger town of tiled houses (the dev yard's: walls that break, windows to shoot and vault through,
    // roofs) around a road cross. Each house is placed on the left and mirrored; its lot holds the space while placing
    m.roads = [[0, WH / 2, WW, WH / 2], [860, 0, 860, WH], [WW - 860, 0, WW - 860, WH]].map(l => roadOf(l, 64, 12, 'asphalt'));
    m.flags = [{ name: 'A', x: 600, y: WH / 2 + 480 }, { name: 'B', x: WW / 2, y: WH / 2 }, { name: 'C', x: WW - 600, y: WH / 2 - 480 }];
    placeHouses(12, WW / 2 + 6 * SUB, [24 * SUB, 24 * SUB], [20 * SUB, 20 * SUB], 64);
    for (const f of m.flags) for (let k = 0; k < 3; k++) { const c = k * TAU / 3 + 0.3; crescent(f.x + Math.cos(c) * 112, f.y + Math.sin(c) * 112, c, false); }
    crescent(400, WH / 2 - 120, 0, true); crescent(400, WH / 2 + 120, 0, true);
    scatter(8, 110, 40, (x, y) => crescent(x, y, R() * TAU, true));
    scatter(34, 44, 26, (x, y) => tree(x, y, true));
    scatter(8, 60, 24, (x, y) => addStatic({ type: 'hay', x, y, r: 13, a: R() * TAU, alive: true }, true));
  } else if (id.startsWith('g:')) {     // a map editor map (2b_ground.js): its stamped ground and placed objects (objs); a kind with none placed is placed as the other maps' are
    m.gmap = JSON.parse(JSON.stringify(gMapOf(id))); BOUNDM = gBoundsMask(m.gmap); m.roads = m.gmap.stamps.filter(q => q.l && gOk(q));
    const O = m.gmap.objs || [], of = (...k) => O.filter(o => k.includes(o.k));
    for (const o of of('house')) { const H = mkHouse({ ...o, g: o.cells && [...o.cells].map(Number) }, m.houses.length); if (H) m.houses.push(H); }     // placed houses (tiledFinish, below)
    if (m.houses.length) tiledFinish();
    const fl = of('flag'); m.flags = fl.length ? fl.map((o, i) => ({ name: String.fromCharCode(65 + i), x: o.x, y: o.y, r: o.r })) : [{ name: 'A', x: WW * 0.22, y: WH * 0.72 }, { name: 'B', x: WW / 2, y: WH / 2 }, { name: 'C', x: WW * 0.78, y: WH * 0.28 }];
    for (const o of of('base')) { const b = m.bases[o.team ? 1 : 0]; b.x = o.x; b.y = o.y; b.pad = { x: o.x - 170, y: o.y - 200, w: 340, h: 400 }; b.placed = 1; }
    for (const o of [...(fl.length ? [] : m.flags), ...m.bases.filter(b => !b.placed)]) inside(o, 160);
    if (of('tree', 'pine', 'hay', 'bags', 'bag').length) for (const o of O) {     // details as placed
      if (o.k === 'tree' || o.k === 'pine') addStatic({ type: 'tree', x: o.x, y: o.y, r: 10, v: o.v || 0, sc: o.sc || 1, a: o.a || 0, alive: true, pine: o.k === 'pine' });
      else if (o.k === 'hay') addStatic({ type: 'hay', x: o.x, y: o.y, r: 13, a: o.a || 0, alive: true });
      else if (o.k === 'bags') crescent(o.x, o.y, o.a || 0, false);
      else if (o.k === 'bag') bag(o.x, o.y, o.a || 0);
    } else if (!of('house').length) {
      for (const f of m.flags) for (let k = 0; k < 3; k++) { const c = k * TAU / 3 + 0.4; crescent(f.x + Math.cos(c) * 110, f.y + Math.sin(c) * 110, c, false); }
      crescent(400, WH / 2 - 120, 0, true); crescent(400, WH / 2 + 120, 0, true);
      scatter(6, 110, 40, (x, y) => crescent(x, y, R() * TAU, true));
      scatter(20, 44, 26, (x, y) => tree(x, y, true));
    }
  } else {
    // river town
    m.roads = [[0, 350, 3000, 350], [0, 1000, 3000, 1000], [0, 1650, 3000, 1650], [700, 0, 700, 2000], [2300, 0, 2300, 2000]].map(l => roadOf(l, 72, 14, 'asphalt'));
    const rx = 1420, rw = 160, cuts = [350, 1000, 1650], hw = 50;
    let y0 = 0; for (const c of cuts) { m.water.push({ x: rx, y: y0, w: rw, h: c - hw - y0 }); m.bridges.push({ x: rx - 18, y: c - hw, w: rw + 36, h: hw * 2 }); y0 = c + hw; } m.water.push({ x: rx, y: y0, w: rw, h: WH - y0 });
    m.flags = [{ name: 'A', x: 1060, y: 680 }, { name: 'B', x: 1500, y: 1000 }, { name: 'C', x: 1940, y: 1320 }];
    // town blocks: four buildings around square A, then fill
    const sq = [[790, 430, 170, 120], [1180, 430, 180, 120], [790, 820, 170, 120], [1190, 830, 170, 110]];
    houseLots(sq);
    placeHouses(9, 1400, [160, 230], [144, 190]);
    for (const f of m.flags) if (f.name !== 'B') for (let k = 0; k < 4; k++) { const c = Math.PI / 4 + k * Math.PI / 2; crescent(f.x + Math.cos(c) * 110, f.y + Math.sin(c) * 110, c, false); }
    for (const sd of [-1, 1]) { crescent(1500 - 215, 1000 + sd * 72, 0, false); crescent(1500 + 215, 1000 + sd * 72, Math.PI, false); }
    crescent(400, 880, 0, true); crescent(400, 1120, 0, true);
    scatter(8, 110, 40, (x, y) => crescent(x, y, R() * TAU, true));
    scatter(30, 44, 26, (x, y) => tree(x, y, true));
  }
  // crate spots, nests, spawns (shared)
  let tries = 0; while (m.crateSpots.length < 14 && tries++ < 3000) { const x = 80 + R() * (WW / 2 - 100), y = 80 + R() * (WH - 160); if (blockedFor(x, y, 10) && !onRoad(x, y, 0)) continue; if (m.buildings.some(b => inRect(x, y, b, 14)) || m.water.some(w => inRect(x, y, w, 14))) continue; if (m.statics.some(s => Math.hypot(s.x - x, s.y - y) < 30)) continue; if (m.crateSpots.some(c => Math.hypot(c.x - x, c.y - y) < 260)) continue; m.crateSpots.push({ x, y }); const [mx, my] = mirrorPt(x, y); m.crateSpots.push({ x: mx, y: my }); }
  for (const t of [0, 1]) {
    const L = [['tank', 230, WH / 2 - 120, 0], ['jeep', 230, WH / 2 + 120, 0], ['jeep', 100, WH / 2 + 125, 0]];
    for (const [type, x, y, a] of L) { if (t === 0) m.vehSpawns.push({ type, x, y, a, team: 0 }); else { const [mx, my] = mirrorPt(x, y); m.vehSpawns.push({ type, x: mx, y: my, a: a + Math.PI, team: 1 }); } }
  }
  // machine-gun nests: covering the near flag, facing the centre
  { const f = m.flags[0]; const a = Math.atan2(WH / 2 - f.y, WW / 2 - f.x);
    let best = null; for (let k = 0; k < 40; k++) { const d = 150 + k * 3, aa = a + (k % 2 ? 1 : -1) * k * 0.05; const x = f.x + Math.cos(aa) * d, y = f.y + Math.sin(aa) * d; if (!blockedFor(x, y, 18) || onRoad(x, y, 0)) { if (m.buildings.some(b => inRect(x, y, b, 30)) || m.water.some(w => inRect(x, y, w, 30)) || onRoad(x, y, 0)) continue; if (m.statics.some(s => Math.hypot(s.x - x, s.y - y) < 34) || inHouse(x, y, 30)) continue; best = [x, y]; break; } }
    if (best) { const [x, y] = best, fa = Math.atan2(WH / 2 - y, WW / 2 - x); m.vehSpawns.push({ type: 'nest', x, y, a: fa, team: -1 }); const [mx, my] = mirrorPt(x, y); m.vehSpawns.push({ type: 'nest', x: mx, y: my, a: fa + Math.PI, team: -1 }); }
  }
  tries = 0;
  while (m.ffaSpawns.length < 18 && tries++ < 4000) {
    const x = 80 + R() * (WW - 160), y = 80 + R() * (WH - 160);
    const bad = m.buildings.some(b => inRect(x, y, b, 40)) || m.water.some(w => inRect(x, y, w, 30)) || m.statics.some(s => Math.hypot(s.x - x, s.y - y) < 40) || inHouse(x, y, 30);
    if (!bad && !m.ffaSpawns.some(p => Math.hypot(p.x - x, p.y - y) < 300)) m.ffaSpawns.push({ x, y });
  }
  m.fwd = [{ x: m.flags[0].x - 60, y: m.flags[0].y }, { x: m.flags[m.flags.length - 1].x + 60, y: m.flags[m.flags.length - 1].y }];
  if (m.gmap) {     // an editor map's placed gameplay objects stand in for the ones placed above
    const O = m.gmap.objs || [], of = k => O.filter(o => o.k === k), V = of('veh'), C = of('crate'), D = of('drop');
    if (V.length) m.vehSpawns = V.map(o => ({ type: o.type || 'tank', x: o.x, y: o.y, a: o.a || 0, team: o.team === undefined ? 0 : o.team, resp: o.resp }));
    if (C.length) m.crateSpots = C.map(o => ({ x: o.x, y: o.y }));
    if (D.length) m.ffaSpawns = D.map(o => ({ x: o.x, y: o.y }));
    for (const o of of('camp')) m.fwd[o.team ? 1 : 0] = { x: o.x, y: o.y };
  }
  if (BOUNDM) {     // a battlefield edge: what mirroring put outside it goes, spawns come in
    m.statics = m.statics.filter(s => !outOfBounds(s.x, s.y)); m.arcs = m.arcs.filter(A => A.bags.every(b => m.statics.includes(b)));
    m.crateSpots = m.crateSpots.filter(c => !outOfBounds(c.x, c.y)); m.ffaSpawns = m.ffaSpawns.filter(c => !outOfBounds(c.x, c.y));
    for (const o of [...m.vehSpawns, ...m.fwd]) inside(o, 60);
  }
  if (!m.gmap && m.houses.length) { m.buildings.length = 0; tiledFinish(); }     // the lots go: the houses' walls stand in them
  if (m.houses.length) tiledClear(m);       // houses: sight and glass are kept as wall runs (devSight)
  else { m.sight = m.buildings.filter(b => !b.glass); m.glass = m.buildings.filter(b => b.glass); }     // what blocks sight / dims it
  buildHash();
}
/* static circle spatial hash */
const HC = 64; let HASH = null;
function buildHash() { HASH = new Map(); for (const s of MAP.statics) { const k = ((s.x / HC) | 0) + ',' + ((s.y / HC) | 0); if (!HASH.has(k)) HASH.set(k, []); HASH.get(k).push(s); } }
function staticsNear(x, y, r, out) {
  out.length = 0;
  const x0 = ((x - r) / HC) | 0, x1 = ((x + r) / HC) | 0, y0 = ((y - r) / HC) | 0, y1 = ((y + r) / HC) | 0;
  for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const a = HASH.get(i + ',' + j); if (a) for (const s of a) if (s.alive) out.push(s); }
  return out;
}
const _near = [];
/* the rects of a list (MAP.buildings, MAP.sight, MAP.glass) touching a box, through a bucket grid (RB px) kept per list
   and rebuilt when its length changes (a wall coming down); short lists are just scanned. _rb for loops that act on
   what they find, _rq for yes / no questions (so one can ask inside the other's loop) */
const RB = 128, _rgrid = new WeakMap(), _rb = [], _rq = []; let _rstamp = 0;
function rectsIn(list, x0, y0, x1, y1, out) {
  out.length = 0;
  if (list.length < 40) { for (const b of list) { const q = rectBox(b); if (q[0] <= x1 && q[2] >= x0 && q[1] <= y1 && q[3] >= y0) out.push(b); } return out; }
  let g = _rgrid.get(list);
  if (!g || g.n !== list.length || g.ww !== WW || g.wh !== WH) {
    const gw = Math.ceil(WW / RB), gh = Math.ceil(WH / RB), cells = Array.from({ length: gw * gh }, () => []), ci = (v, n) => clamp(Math.floor(v / RB), 0, n - 1);
    for (const b of list) { const q = rectBox(b); for (let j = ci(q[1], gh); j <= ci(q[3], gh); j++) for (let i = ci(q[0], gw); i <= ci(q[2], gw); i++) cells[j * gw + i].push(b); }
    g = { n: list.length, ww: WW, wh: WH, gw, gh, cells }; _rgrid.set(list, g);
  }
  const st = ++_rstamp, { gw, gh, cells } = g, ci = (v, n) => clamp(Math.floor(v / RB), 0, n - 1);
  for (let j = ci(y0, gh); j <= ci(y1, gh); j++) for (let i = ci(x0, gw); i <= ci(x1, gw); i++) for (const b of cells[j * gw + i]) { if (b._rs === st) continue; const q = rectBox(b); if (q[0] <= x1 && q[2] >= x0 && q[1] <= y1 && q[3] >= y0) { b._rs = st; out.push(b); } }
  return out;
}
function rectsOnSeg(list, x0, y0, x1, y1, out) { return rectsIn(list, Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), out); }

/* ---------------- ground painting ---------------- */
const PALS = {
  classic: { grass: '#137a12', gA: '#0f6e0e', gB: '#18871a', gC: '#0b5e0b', patch: ['8,80,8', '40,130,30'], mud: 'rgba(110,90,40,0.18)', asph: '#5c5c5c', aA: '#545454', aB: '#656565', side: '#c9c9c4', sideL: '#b0b0aa', sideE: '#8f8f8a', dash: '#d6b417', dirt: '#8a6a3a', dA: '#7a5c30', dB: '#9a784a', water: '#2b5f86', waterL: '#4a86b8', bank: '#6d5a36', pad: '#7b7a72', padA: '#6f6e66', padB: '#878680', padL: '#62615a', wheat: ['#b8a040', '#a08a30'], corn: ['#4f8a28', '#3e7020'], plow: ['#6a4a2a', '#56391e'], bridge: '#8a7a62', rail: '#4a3e30' },
  grit: { grass: '#4a5032', gA: '#42472b', gB: '#535a38', gC: '#383c24', patch: ['50,45,25', '85,90,55'], mud: 'rgba(70,55,35,0.35)', asph: '#3c3b38', aA: '#353431', aB: '#45443f', side: '#74716a', sideL: '#5f5c55', sideE: '#4a4843', dash: '#8a7a3e', dirt: '#5c4a33', dA: '#52422c', dB: '#67533a', water: '#2b3836', waterL: '#46564f', bank: '#3e3424', pad: '#57554f', padA: '#4f4d47', padB: '#605e57', padL: '#47453f', wheat: ['#7d7448', '#6b633b'], corn: ['#4b5530', '#3e4627'], plow: ['#4a3826', '#3c2d1f'], bridge: '#5e564a', rail: '#2e2a24' }
};
PALS.snow = Object.assign({}, PALS.classic, { grass: '#e6edf2', gA: '#d8e2ea', gB: '#f4f8fb', gC: '#c8d4de', patch: ['150,170,195', '255,255,255'], mud: 'rgba(120,135,150,0.16)', dirt: '#b9bec4', dA: '#a2a8b0', dB: '#c8ccd0', pad: '#8d9298', padA: '#83888e', padB: '#979ca2', padL: '#767b80', ice: '#9cc8de', iceL: '#d4ecf6', iceD: '#6fa2bf' });
PALS.snowGrit = Object.assign({}, PALS.grit, { grass: '#c6cac6', gA: '#b8bdb9', gB: '#d2d5d0', gC: '#a9aea9', patch: ['90,95,90', '225,228,224'], mud: 'rgba(80,80,72,0.3)', dirt: '#8f8e86', dA: '#7b7a72', dB: '#9c9b93', pad: '#6a6b68', padA: '#626360', padB: '#727370', padL: '#585956', ice: '#8aa2aa', iceL: '#b4c6cc', iceD: '#64808a' });
function pattern(w, h, fn) { const c = mk(w, h), g = c.getContext('2d'); fn(g, w, h); return gx.createPattern(c, 'repeat'); }
let SKIRT_PAT = null;
/* the out-of-bounds ring: same grass, tinted, with a dashed line marking the battlefield edge */
function drawSkirt(x0, y0, x1, y1) {
  if (x0 >= 0 && y0 >= 0 && x1 <= WW && y1 <= WH) return;
  ctx.fillStyle = SKIRT_PAT || '#2a3a1e';
  const rs = [[x0, y0, x1 - x0, -y0], [x0, WH, x1 - x0, y1 - WH], [x0, 0, -x0, WH], [WW, 0, x1 - WW, WH]];
  for (const r of rs) if (r[2] > 0 && r[3] > 0) ctx.fillRect(r[0], r[1], r[2], r[3]);
  ctx.fillStyle = 'rgba(40,6,2,0.38)';
  for (const r of rs) if (r[2] > 0 && r[3] > 0) ctx.fillRect(r[0], r[1], r[2], r[3]);
  // the map's dashed edge, only where it's in the box (x0..y1): each side its part, dashed on from where strokeRect's
  // one run round the edge would have it (the same dashes as the camera moves)
  ctx.save(); ctx.strokeStyle = 'rgba(255,90,60,0.55)'; ctx.lineWidth = 3; ctx.setLineDash([18, 12]);
  const L = WW + 4, Hh = WH + 4, m = 4;
  for (const [ax, ay, dx, dy, n, o] of [[-2, -2, 1, 0, L, 0], [WW + 2, -2, 0, 1, Hh, L], [WW + 2, WH + 2, -1, 0, L, L + Hh], [-2, WH + 2, 0, -1, Hh, 2 * L + Hh]]) {
    const ex = ax + dx * n, ey = ay + dy * n; if (Math.max(ax, ex) < x0 - m || Math.min(ax, ex) > x1 + m || Math.max(ay, ey) < y0 - m || Math.min(ay, ey) > y1 + m) continue;
    const lo = dx ? (dx > 0 ? x0 - m - ax : ax - x1 - m) : (dy > 0 ? y0 - m - ay : ay - y1 - m), hi = dx ? (dx > 0 ? x1 + m - ax : ax - x0 + m) : (dy > 0 ? y1 + m - ay : ay - y0 + m);
    const t0 = Math.max(0, lo), t1 = Math.min(n, hi); if (t1 <= t0) continue;
    ctx.lineDashOffset = o + t0; ctx.beginPath(); ctx.moveTo(ax + dx * t0, ay + dy * t0); ctx.lineTo(ax + dx * t1, ay + dy * t1); ctx.stroke();
  }
  ctx.restore();
}
function paintGround() {
  const grit = CFG.style === 'grit', P = SNOWY() ? (grit ? PALS.snowGrit : PALS.snow) : (PALS[CFG.style] || PALS.classic);
  px_.setTransform(1, 0, 0, 1, 0, 0); px_.clearRect(0, 0, WW, WH); dgx.setTransform(1, 0, 0, 1, 0, 0); dgx.clearRect(0, 0, WW, WH); if (typeof M !== 'undefined' && M) M.fogMem = null;
  if (MAP.id === 'devyard') { paintDevGround(); return; }
  GMAT = null; if (MAP.gmap) { paintStamped(); if (MAP.houses.length) paintTiled(); return; }
  const R = mulberry(4242);
  gx.setTransform(1, 0, 0, 1, 0, 0); gx.globalAlpha = 1; gx.globalCompositeOperation = 'source-over';
  gx.fillStyle = SKIRT_PAT = pattern(96, 96, (g, w, h) => {
    g.fillStyle = P.grass; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = R() < 0.5 ? P.gA : P.gB; g.fillRect((R() * w) | 0, (R() * h) | 0, 1 + (R() < 0.3), 1); }
    for (let i = 0; i < 60; i++) { g.fillStyle = P.gC; g.fillRect((R() * w) | 0, (R() * h) | 0, 1, 2); }
  });
  gx.fillRect(0, 0, WW, WH);
  for (let i = 0; i < 160; i++) {
    const x = R() * WW, y = R() * WH, r = 60 + R() * 220, g = gx.createRadialGradient(x, y, 0, x, y, r), c = R() < 0.5 ? P.patch[0] : P.patch[1];
    g.addColorStop(0, `rgba(${c},${grit ? 0.3 : 0.22})`); g.addColorStop(1, `rgba(${c},0)`); gx.fillStyle = g; gx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < (grit ? 160 : 70); i++) { const x = R() * WW, y = R() * WH, r = 10 + R() * (grit ? 40 : 25); gx.fillStyle = P.mud; gx.beginPath(); gx.ellipse(x, y, r, r * 0.7, R() * 3, 0, TAU); gx.fill(); }
  // fields
  for (const f of MAP.fields) {
    const [a, b] = P[f.crop]; gx.fillStyle = a; gx.fillRect(f.x, f.y, f.w, f.h);
    gx.fillStyle = b; const vert = f.crop === 'corn';
    for (let k = 0; k < (vert ? f.w : f.h); k += 9) { if (vert) gx.fillRect(f.x + k, f.y, 3, f.h); else gx.fillRect(f.x, f.y + k, f.w, 3); }
    for (let i = 0; i < f.w * f.h / 120; i++) { gx.fillStyle = R() < 0.5 ? a : b; gx.fillRect(f.x + R() * f.w, f.y + R() * f.h, 2, 2); }
  }
  // water + banks
  for (const w of MAP.water) {
    gx.fillStyle = P.bank; gx.fillRect(w.x - 10, w.y, w.w + 20, w.h);
    gx.fillStyle = P.water; gx.fillRect(w.x, w.y, w.w, w.h);
    for (let i = 0; i < w.w * w.h / 300; i++) { gx.fillStyle = P.waterL; gx.globalAlpha = 0.25; gx.fillRect(w.x + R() * w.w, w.y + R() * w.h, 6 + R() * 10, 1); }
    gx.globalAlpha = 1;
  }
  for (const w of MAP.ice) {
    gx.fillStyle = P.iceD || '#6fa2bf'; rr(gx, w.x - 6, w.y - 6, w.w + 12, w.h + 12, 26); gx.fill();
    gx.fillStyle = P.ice || '#9cc8de'; rr(gx, w.x, w.y, w.w, w.h, 22); gx.fill();
    gx.strokeStyle = P.iceL || '#d4ecf6'; gx.lineWidth = 1;
    for (let i = 0; i < w.w * w.h / 2500; i++) { let x = w.x + 10 + R() * (w.w - 20), y = w.y + 10 + R() * (w.h - 20), a = R() * TAU; gx.beginPath(); gx.moveTo(x, y); for (let k = 0; k < 4; k++) { a += rnd(-0.9, 0.9); x += Math.cos(a) * 12; y += Math.sin(a) * 12; gx.lineTo(clamp(x, w.x + 4, w.x + w.w - 4), clamp(y, w.y + 4, w.y + w.h - 4)); } gx.stroke(); }
    gx.fillStyle = 'rgba(255,255,255,0.25)'; for (let i = 0; i < 6; i++) gx.fillRect(w.x + R() * w.w * 0.8, w.y + R() * w.h, 30 + R() * 50, 2);
  }
  // base pads
  for (const b of MAP.bases) {
    const p = b.pad; gx.fillStyle = '#2e2e2a'; gx.fillRect(p.x - 4, p.y - 4, p.w + 8, p.h + 8);
    gx.fillStyle = pattern(32, 32, (g, w, h) => { g.fillStyle = P.pad; g.fillRect(0, 0, w, h); for (let i = 0; i < 80; i++) { g.fillStyle = R() < 0.5 ? P.padA : P.padB; g.fillRect((R() * w) | 0, (R() * h) | 0, 1, 1); } g.fillStyle = P.padL; g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h); });
    gx.fillRect(p.x, p.y, p.w, p.h);
    gx.fillStyle = TEAMHEX[b.team]; gx.globalAlpha = grit ? 0.5 : 0.75;
    for (let y = p.y + 10; y < p.y + p.h - 10; y += 26) { const dir = b.team === 0 ? 1 : -1, x0 = b.team === 0 ? p.x + p.w - 30 : p.x + 30; gx.beginPath(); gx.moveTo(x0, y); gx.lineTo(x0 + 14 * dir, y + 8); gx.lineTo(x0, y + 16); gx.lineTo(x0 + 6 * dir, y + 8); gx.fill(); }
    gx.globalAlpha = 1; gx.font = `40px ${FD}`; gx.textAlign = 'center'; gx.textBaseline = 'middle'; gx.fillStyle = 'rgba(255,255,255,0.16)';
    gx.save(); gx.translate(p.x + p.w / 2, p.y + p.h / 2); gx.rotate(b.team === 0 ? -Math.PI / 2 : Math.PI / 2); gx.fillText(TEAMNAME[b.team] + ' BASE', 0, 0); gx.restore();
  }
  // roads: baked as the editor's are (pavements, markings, junctions)
  gBake({ w: WW, h: WH, stamps: MAP.roads }, gx, null, null);
  // bridges: railings over the water
  for (const b of MAP.bridges) { gx.fillStyle = P.rail; gx.fillRect(b.x, b.y - 4, b.w, 6); gx.fillRect(b.x, b.y + b.h - 2, b.w, 6); for (let x = b.x; x < b.x + b.w; x += 16) { gx.fillStyle = P.bridge; gx.fillRect(x, b.y - 3, 3, 4); gx.fillRect(x, b.y + b.h - 1, 3, 4); } }
  // grit: cracks, potholes, oil, old craters
  if (grit) {
    for (let i = 0; i < 260; i++) {
      const x = R() * WW, y = R() * WH; const rd = onRoad(x, y, 0);
      if (rd && rd.rt !== 'dirt') { gx.strokeStyle = 'rgba(15,15,12,0.5)'; gx.lineWidth = 1; gx.beginPath(); gx.moveTo(x, y); let a = R() * TAU, cx = x, cy = y; for (let k = 0; k < 5; k++) { a += rnd(-0.8, 0.8); cx += Math.cos(a) * 9; cy += Math.sin(a) * 9; gx.lineTo(cx, cy); } gx.stroke(); if (R() < 0.3) { gx.fillStyle = 'rgba(20,20,18,0.55)'; gx.beginPath(); gx.ellipse(x, y, 6 + R() * 6, 4 + R() * 4, R() * 3, 0, TAU); gx.fill(); } }
    }
    for (let i = 0; i < 26; i++) { const x = 100 + R() * (WW - 200), y = 100 + R() * (WH - 200); if (MAP.buildings.some(b => inRect(x, y, b, 20))) continue; scorch(x, y, 25 + R() * 30); }
  }
  if (MAP.houses.length) paintTiled();
  gx.fillStyle = 'rgba(0,0,0,0.35)'; gx.fillRect(0, 0, WW, 12); gx.fillRect(0, WH - 12, WW, 12); gx.fillRect(0, 0, 12, WH); gx.fillRect(WW - 12, 0, 12, WH);
}
function gStamp(n, x, y, a, s, al) {
  const m = ATLAS[n]; if (!m) return;
  const c = Math.cos(a) * s, sn = Math.sin(a) * s;
  dgx.setTransform(c, sn, -sn, c, x, y); dgx.globalAlpha = al === undefined ? 1 : al;
  dgx.drawImage(SRC, m[0], m[1], m[2], m[3], -m[4], -m[5], m[2], m[3]);
  dgx.setTransform(1, 0, 0, 1, 0, 0); dgx.globalAlpha = 1;
}
/* stamp a soldier sprite (darkened for bots) permanently into the ground */
function gStampS(n, dark, x, y, a) {
  const m = ATLAS[n]; if (!m) return; if (!dark) { gStamp(n, x, y, a, 1); return; }
  const c = Math.cos(a), sn = Math.sin(a); dgx.setTransform(c, sn, -sn, c, x, y); dgx.drawImage(darkSpr(n), -m[4], -m[5]); dgx.setTransform(1, 0, 0, 1, 0, 0);
}
/* bodies lie where they fell for 2 minutes, then fade out over 1; their blood pool seeps out and bakes into the ground */
const POOL_T = 4.5, BODY_T = 120, BODY_FADE = 60;
function addCorpse(color, dark, x, y, rot) {
  if (inWater(x, y)) return;
  const blobs = []; for (let i = 0; i < 6; i++) { const a = rnd(0, TAU), d = i ? rnd(2, 7) : 0; blobs.push([Math.cos(a) * d, Math.sin(a) * d, i ? rnd(0.45, 0.8) : 1]); }
  M.corpses.push({ n: solSpr(color, 'dead'), dark, x, y, rot, t: 0, R: rnd(11, 15), blobs });
  if (M.corpses.length > 90) { const c = M.corpses.shift(); if (!c.baked) bakePool(c); }
}
function drawPool(g, c, k) {
  const e = 1 - Math.pow(1 - clamp(k, 0, 1), 2.2), R = c.R * e; if (R < 0.5) return;
  g.fillStyle = CFG.style === 'grit' ? '#3e0d0a' : '#560c0a';
  for (const [bx, by, br] of c.blobs) { g.beginPath(); g.arc(c.x + bx * e, c.y + by * e, R * br, 0, TAU); g.fill(); }
  g.fillStyle = CFG.style === 'grit' ? '#521410' : '#741410'; g.beginPath(); g.arc(c.x - 1, c.y - 1, R * 0.55, 0, TAU); g.fill();
}
function bakePool(c) { dgx.setTransform(1, 0, 0, 1, 0, 0); dgx.globalAlpha = 0.92; drawPool(dgx, c, 1); dgx.globalAlpha = 1; c.baked = true; }
const corpseAlpha = c => c.t > BODY_T ? Math.max(0, 1 - (c.t - BODY_T) / BODY_FADE) : 1;
/* spent casings lie on the ground and fade out over 15 s */
const BRASS_T = 15;
function updateCorpses(dt) {
  for (const c of M.corpses) { c.t += dt; if (!c.baked && c.t >= POOL_T) bakePool(c); if (c.t >= BODY_T + BODY_FADE) c.done = true; }
  if (M.corpses.some(c => c.done)) M.corpses = M.corpses.filter(c => !c.done);
  for (const b of M.brass) b.t += dt;
  if (M.brass.length && M.brass[0].t >= BRASS_T) M.brass = M.brass.filter(b => b.t < BRASS_T);
}
/* a crater: burnt into the ground itself, so it stays for the match */
function scorch(x, y, r) {
  const g = gx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(40,22,8,0.75)'); g.addColorStop(0.5, 'rgba(70,40,12,0.45)'); g.addColorStop(1, 'rgba(70,40,12,0)');
  gx.setTransform(1, 0, 0, 1, 0, 0); gx.fillStyle = g; gx.beginPath(); gx.arc(x, y, r, 0, TAU); gx.fill();
}
function tread(x, y, a, w, l, al) {
  dgx.setTransform(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), x, y);
  dgx.fillStyle = `rgba(20,24,12,${al})`; dgx.fillRect(-l / 2, -w / 2, l, w);
  dgx.setTransform(1, 0, 0, 1, 0, 0);
}
/* blood drops in the same two reds as the pools */
const BLOOD = () => CFG.style === 'grit' ? ['#3e0d0a', '#521410'] : ['#560c0a', '#741410'];
function bloodDrop(g, x, y, sz, rot, al) {
  const [d, l] = BLOOD(), r = 1.2 + sz * 5;
  g.globalAlpha = al === undefined ? 1 : al; g.fillStyle = d;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.beginPath(); g.arc(x + Math.cos(rot) * r * 1.4, y + Math.sin(rot) * r * 1.4, r * 0.45, 0, TAU); g.fill();
  g.beginPath(); g.arc(x - Math.sin(rot) * r * 1.1, y + Math.cos(rot) * r * 1.1, r * 0.3, 0, TAU); g.fill();
  g.fillStyle = l; g.beginPath(); g.arc(x - r * 0.2, y - r * 0.2, r * 0.5, 0, TAU); g.fill(); g.globalAlpha = 1;
}

/* ---------------- nav grids + A* ---------------- */
let NC = 30, NGW = Math.ceil(WW / NC), NGH = Math.ceil(WH / NC);       // tiled maps: NC = SUB, a nav cell per wall cell
let navS = null, navV = null, navDirty = 0;
/* navS (on foot): 0 open, 1 blocked, 2 a window (open to a vault, at a cost). navV: vehicles, kept further off */
function buildNav() {
  navS = new Uint8Array(NGW * NGH); navV = new Uint8Array(NGW * NGH);
  const TL = MAP.houses.length > 0;     // houses: each nav cell whose centre is on a wall (1) or window (2) cell; vehicles kept 2 cells off
  for (const H of MAP.houses) for (let j = Math.max(0, Math.floor(H.bb[1] / NC)); j <= Math.min(NGH - 1, Math.floor(H.bb[3] / NC)); j++) for (let i = Math.max(0, Math.floor(H.bb[0] / NC)); i <= Math.min(NGW - 1, Math.floor(H.bb[2] / NC)); i++) {
    const [lx, ly] = toF(H.f, (i + 0.5) * NC, (j + 0.5) * NC), c = hcell(H, Math.floor(lx / SUB), Math.floor(ly / SUB)); if (c !== C_WALL && c !== C_WIN) continue;
    const k = j * NGW + i; navS[k] = c === C_WALL ? 1 : Math.max(navS[k], 2);
    for (let b = Math.max(0, j - 2); b <= Math.min(NGH - 1, j + 2); b++) for (let a = Math.max(0, i - 2); a <= Math.min(NGW - 1, i + 2); a++) navV[b * NGW + a] = 1;
  }
  for (let j = 0; j < NGH; j++) for (let i = 0; i < NGW; i++) {
    const x = (i + 0.5) * NC, y = (j + 0.5) * NC, k = j * NGW + i;
    let s = 0, v = 0;
    if (x < 30 || y < 30 || x > WW - 30 || y > WH - 30 || (BOUNDM && outOfBounds(x, y))) s = v = 1;
    if (!TL) for (const b of MAP.buildings) { if (inRect(x, y, b, 12)) s = 1; if (inRect(x, y, b, 38)) v = 1; }
    for (const w of MAP.water) { if (inRect(x, y, w, 4)) s = 1; if (inRect(x, y, w, 30)) v = 1; }
    if (s) navS[k] = 1; if (v) navV[k] = 1;
  }
  if (typeof M !== 'undefined' && M && M.wrecks) for (const w of M.wrecks) {
    const R = Math.hypot(w.hl, w.hw) + 30;
    for (let j = Math.max(0, Math.floor((w.y - R) / NC)); j <= Math.min(NGH - 1, Math.floor((w.y + R) / NC)); j++) for (let i = Math.max(0, Math.floor((w.x - R) / NC)); i <= Math.min(NGW - 1, Math.floor((w.x + R) / NC)); i++) {
      const [lx, ly] = toLocal(w, (i + 0.5) * NC, (j + 0.5) * NC), k = j * NGW + i;
      if (Math.abs(lx) < w.hl + 8 && Math.abs(ly) < w.hw + 8) navS[k] = 1; if (Math.abs(lx) < w.hl + 30 && Math.abs(ly) < w.hw + 30) navV[k] = 1;
    }
  }
  for (const s of MAP.statics) if (s.alive) markStatic(s);
}
function markStatic(s) {
  const pad = s.type === 'tree' ? 16 : s.type === 'hay' ? 19 : 12;
  for (let j = Math.floor((s.y - 40) / NC); j <= Math.floor((s.y + 40) / NC); j++) for (let i = Math.floor((s.x - 40) / NC); i <= Math.floor((s.x + 40) / NC); i++) {
    if (i < 0 || j < 0 || i >= NGW || j >= NGH) continue;
    const d = Math.hypot((i + 0.5) * NC - s.x, (j + 0.5) * NC - s.y);
    if (d < pad) navS[j * NGW + i] = 1;
    if ((s.type === 'tree' || s.type === 'hay') && d < 32) navV[j * NGW + i] = 1;
  }
}
let ASG = new Float32Array(NGW * NGH), ASF = new Int32Array(NGW * NGH), ASS = new Uint32Array(NGW * NGH), ASC = new Uint32Array(NGW * NGH);   // cost, came-from, seen stamp, closed stamp
/* world size (the normal maps are 3000x2000, OUTSKIRTS 3072x2048, the dev yard smaller) and nav cell size; canvases and path grids follow */
function setWorld(w, h, nc) {
  nc = nc || 30; if (w === WW && h === WH && nc === NC) return;
  if (w !== WW || h !== WH) { WW = w; WH = h; for (const c of [ground, prints, decals]) { c.width = w; c.height = h; } }
  NC = nc; NGW = Math.ceil(WW / NC); NGH = Math.ceil(WH / NC); ASG = new Float32Array(NGW * NGH); ASF = new Int32Array(NGW * NGH); ASS = new Uint32Array(NGW * NGH); ASC = new Uint32Array(NGW * NGH);
}
let asStamp = 1;
function nearestFree(g, i, j) {
  if (i >= 0 && j >= 0 && i < NGW && j < NGH && !g[j * NGW + i]) return [i, j];
  for (let r = 1; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
    const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < NGW && b < NGH && !g[b * NGW + a]) return [a, b];
  }
  return null;
}
/* a straight walk from (x0, y0) to (x1, y1) crosses no blocked cell; on the fine (tiled) grid with a body's width
   either side, so string-pulled paths don't clip wall corners */
function lineFree(g, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / (NC * 0.5)), w = NC < 30 && d ? 6 / d : 0, px = -(y1 - y0) * w, py = (x1 - x0) * w;
  const bad = (x, y) => { const i = (x / NC) | 0, j = (y / NC) | 0; return i < 0 || j < 0 || i >= NGW || j >= NGH || g[j * NGW + i]; };
  for (let k = 1; k < n; k++) { const x = lerp(x0, x1, k / n), y = lerp(y0, y1, k / n); if (bad(x, y) || (w && (bad(x + px, y + py) || bad(x - px, y - py)))) return false; }
  return true;
}
function astar(g, sx, sy, tx, ty) {
  const s = nearestFree(g, (sx / NC) | 0, (sy / NC) | 0), t = nearestFree(g, (tx / NC) | 0, (ty / NC) | 0);
  if (!s || !t) return null;
  const S = s[1] * NGW + s[0], T = t[1] * NGW + t[0];
  asStamp++; const H = [], HF = []; ASG[S] = 0; ASS[S] = asStamp; ASF[S] = -1;
  const hfn = k => { const i = k % NGW, j = (k / NGW) | 0, dx = Math.abs(i - t[0]), dy = Math.abs(j - t[1]); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  // open list: a binary heap of cells (H) with their f = cost + estimate stored beside them (HF)
  const push = k => { const fk = ASG[k] + hfn(k); let i = H.length; H.push(k); HF.push(fk); while (i > 0) { const p = (i - 1) >> 1; if (HF[p] <= fk) break; H[i] = H[p]; HF[i] = HF[p]; i = p; } H[i] = k; HF[i] = fk; };
  const pop = () => { const top = H[0], last = H.pop(), fl = HF.pop(), n = H.length; if (n) { let i = 0; for (; ;) { const l = 2 * i + 1, r = l + 1; let m = i, fm = fl; if (l < n && HF[l] < fm) { m = l; fm = HF[l]; } if (r < n && HF[r] < fm) m = r; if (m === i) break; H[i] = H[m]; HF[i] = HF[m]; i = m; } H[i] = last; HF[i] = fl; } return top; };
  push(S);
  let iters = 0, found = false;
  while (H.length && iters++ < (NC < 30 ? 24000 : 6000)) {
    const k = pop(); if (ASC[k] === asStamp) continue; ASC[k] = asStamp;
    if (k === T) { found = true; break; }
    const i = k % NGW, j = (k / NGW) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NGW || b >= NGH) continue;
      const n = b * NGW + a; if (g[n] === 1 || ASC[n] === asStamp) continue;
      if (di && dj && (g[j * NGW + a] || g[b * NGW + i] || g[n])) continue;
      const ng = ASG[k] + (di && dj ? 1.414 : 1) + (g[n] === 2 ? 5 : 0);         // a window: straight through, and only if a door is well out of the way
      if (ASS[n] !== asStamp || ng < ASG[n]) { ASS[n] = asStamp; ASG[n] = ng; ASF[n] = k; push(n); }
    }
  }
  if (!found) return null;
  const pts = []; let k = T; while (k !== -1 && k !== undefined) { pts.push([(k % NGW + 0.5) * NC, (((k / NGW) | 0) + 0.5) * NC]); if (k === S) break; k = ASF[k]; }
  pts.reverse(); pts[pts.length - 1] = [tx, ty];
  const out = []; let cur = [sx, sy], idx = 0;
  while (idx < pts.length) {
    let far = idx; for (let q = pts.length - 1; q > idx; q--) if (lineFree(g, cur[0], cur[1], pts[q][0], pts[q][1])) { far = q; break; }
    out.push(pts[far]); cur = pts[far]; idx = far + 1;
  }
  return out;
}
