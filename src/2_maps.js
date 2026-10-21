/* =====================================================================
   MAPS — every map is point-symmetric around the centre so both teams
   get the same ground. Each builder lays out the west half; mirror()
   produces the east half.
   ===================================================================== */
let MAP = null;
const ground = mk(WW, WH); const gx = ground.getContext('2d');
const mirrorPt = (x, y) => [WW - x, WH - y];
const mirrorRect = r => ({ ...r, x: WW - r.x - r.w, y: WH - r.y - r.h });

function roadRect(rd, pad) {
  const [x1, y1, x2, y2] = rd.l, hw = rd.w / 2 + (rd.side || 0) + pad;
  return y1 === y2 ? { x: x1, y: y1 - hw, w: x2 - x1, h: hw * 2 } : { x: x1 - hw, y: y1, w: hw * 2, h: y2 - y1 };
}
function onRoad(x, y, pad) { for (const rd of MAP.roads) if (inRect(x, y, roadRect(rd, pad || 0))) return rd; return null; }
function inWater(x, y) { for (const w of MAP.water) if (inRect(x, y, w)) return true; return false; }
function onIce(x, y) { for (const w of MAP.ice) if (inRect(x, y, w)) return true; return false; }
const SNOWY = () => MAP && MAP.id === 'snowfield';
/* footprints live on their own layer that slowly fades (about two minutes) */
const prints = mk(WW, WH); const px_ = prints.getContext('2d');
/* everything left behind (bodies, blood, scorch marks, tread marks) lives on a decal layer that fades over ~3 minutes */
const decals = mk(WW, WH); const dgx = decals.getContext('2d');
/* every 3 s both layers lose a step: footprints 7.5 %, decals 5 % */
let layerFadeT = 0;
function fadeLayers(dt) {
  layerFadeT += dt; if (layerFadeT < 3) return; layerFadeT = 0;
  for (const [g, a] of [[px_, 0.075], [dgx, 0.05]]) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-out'; g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(0, 0, WW, WH); g.globalCompositeOperation = 'source-over'; }
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
  const R = mulberry(id === 'crossroads' ? 1987 : id === 'farmlands' ? 2311 : id === 'snowfield' ? 6151 : 4099);
  const m = { id, arcs: [], roads: [], buildings: [], water: [], bridges: [], statics: [], flags: [], bases: [], crateSpots: [], vehSpawns: [], ffaSpawns: [], fields: [], fwd: [], ice: [] };
  m.bases = [{ team: 0, x: 130, y: 1000, pad: { x: 20, y: 800, w: 340, h: 400 } }, { team: 1, x: 2870, y: 1000, pad: { x: WW - 360, y: 800, w: 340, h: 400 } }];
  MAP = m;
  const sym = (arr, o, mir) => { arr.push(o); arr.push(mir(o)); };
  const blockedFor = (x, y, pad) => {
    if (x < 50 || y < 50 || x > WW - 50 || y > WH - 50) return true;
    if (onRoad(x, y, pad)) return true;
    for (const w of m.water) if (inRect(x, y, w, pad + 10)) return true;
    for (const b of m.buildings) if (inRect(x, y, b, pad + 6)) return true;
    for (const f of m.flags) if (Math.hypot(x - f.x, y - f.y) < 118 + pad) return true;
    for (const b of m.bases) if (inRect(x, y, b.pad, pad + 30)) return true;
    return false;
  };
  const rectFree = (r, gap) => {
    if (r.x < 60 || r.y < 60 || r.x + r.w > WW - 60 || r.y + r.h > WH - 60) return false;
    for (const rd of m.roads) { const q = roadRect(rd, 10); if (r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y) return false; }
    for (const w of m.water) if (r.x < w.x + w.w + 20 && r.x + r.w > w.x - 20 && r.y < w.y + w.h + 20 && r.y + r.h > w.y - 20) return false;
    for (const w of m.ice) if (r.x < w.x + w.w + 30 && r.x + r.w > w.x - 30 && r.y < w.y + w.h + 30 && r.y + r.h > w.y - 30) return false;
    for (const b of m.buildings) if (r.x < b.x + b.w + gap && r.x + r.w > b.x - gap && r.y < b.y + b.h + gap && r.y + r.h > b.y - gap) return false;
    for (const f of m.flags) { const nx = clamp(f.x, r.x, r.x + r.w), ny = clamp(f.y, r.y, r.y + r.h); if (Math.hypot(nx - f.x, ny - f.y) < 125) return false; }
    for (const b of m.bases) { const p = b.pad; if (r.x < p.x + p.w + 60 && r.x + r.w > p.x - 60 && r.y < p.y + p.h + 60 && r.y + r.h > p.y - 60) return false; }
    // keep the mirrored copy from touching this one across the centre
    const mr = mirrorRect(r); if (r.x < mr.x + mr.w + gap && r.x + r.w > mr.x - gap && r.y < mr.y + mr.h + gap && r.y + r.h > mr.y - gap) return false;
    return true;
  };
  const placeBuildings = (n, xmax, roofs, wr, hr) => {
    let tries = 0, k = 0;
    while (k < n && tries++ < 4000) {
      const w = wr[0] + R() * (wr[1] - wr[0]), h = hr[0] + R() * (hr[1] - hr[0]), x = 60 + R() * (xmax - 60 - w), y = 60 + R() * (WH - 120 - h);
      const r = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), roof: roofs[k % roofs.length], seed: k };
      if (!rectFree(r, 48)) continue;
      sym(m.buildings, r, q => ({ ...mirrorRect(q), seed: q.seed + 50 })); k++;
    }
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
    m.roads = [[0, 1000, 3000, 1000], [900, 0, 900, 2000], [2100, 0, 2100, 2000], [1500, 420, 1500, 1580], [900, 420, 3000, 420], [0, 1580, 2100, 1580]].map(l => ({ l, w: 72, side: 14, style: 'asphalt' }));
    m.flags = [{ name: 'A', x: 720, y: 1400 }, { name: 'B', x: 1500, y: 1000 }, { name: 'C', x: 2280, y: 600 }];
    const B = [[980, 1100, 180, 130], [1180, 1290, 200, 160], [1000, 560, 200, 150], [1250, 760, 150, 150], [560, 620, 170, 150], [380, 1680, 200, 140], [1100, 1700, 220, 150], [300, 300, 180, 160], [560, 1180, 120, 110], [1240, 180, 160, 140]];
    const roofs = ['tar', 'brick', 'metal', 'concrete'];
    B.forEach(([x, y, w, h], i) => sym(m.buildings, { x, y, w, h, roof: roofs[i % 4], seed: i }, q => ({ ...mirrorRect(q), seed: q.seed + 50 })));
    for (const f of m.flags) for (let k = 0; k < 4; k++) { const c = Math.PI / 4 + k * Math.PI / 2; crescent(f.x + Math.cos(c) * 112, f.y + Math.sin(c) * 112, c, false); }
    crescent(400, 880, 0, true); crescent(400, 1120, 0, true);
    scatter(13, 120, 40, (x, y) => crescent(x, y, R() * TAU, true));
    scatter(46, 44, 26, (x, y) => tree(x, y, true));
  } else if (id === 'farmlands') {
    m.roads = [[0, 1000, 3000, 1000], [1000, 0, 1000, 2000], [2000, 0, 2000, 2000]].map(l => ({ l, w: 58, side: 0, style: 'dirt' }));
    m.flags = [{ name: 'A', x: 620, y: 1480 }, { name: 'B', x: 1500, y: 1000 }, { name: 'C', x: 2380, y: 520 }];
    const F = [{ x: 60, y: 60, w: 880, h: 520, crop: 'wheat' }, { x: 1060, y: 60, w: 400, h: 860, crop: 'corn' }, { x: 420, y: 1060, w: 520, h: 300, crop: 'plow' }, { x: 1060, y: 1340, w: 420, h: 600, crop: 'wheat' }];
    for (const f of F) sym(m.fields, f, q => ({ ...mirrorRect(q), crop: q.crop }));
    m.buildings.push({ x: 1380, y: 740, w: 200, h: 140, roof: 'barn', seed: 1 }); m.buildings.push({ ...mirrorRect(m.buildings[0]), seed: 51 });
    placeBuildings(6, 1380, ['barn', 'tin', 'thatch'], [110, 220], [90, 160]);
    // fences along the roads, with gates
    for (const rd of m.roads) {
      const [x1, y1, x2, y2] = rd.l;
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
    m.roads = [[0, 1000, 3000, 1000], [850, 0, 850, 2000], [2150, 0, 2150, 2000]].map(l => ({ l, w: 60, side: 0, style: 'dirt' }));
    m.ice = [{ x: 1250, y: 830, w: 500, h: 340 }, { x: 520, y: 260, w: 230, h: 150 }, { x: WW - 520 - 230, y: WH - 260 - 150, w: 230, h: 150 }];
    m.flags = [{ name: 'A', x: 640, y: 1460 }, { name: 'B', x: 1500, y: 1000 }, { name: 'C', x: 2360, y: 540 }];
    placeBuildings(8, 1400, ['cabin', 'bunker', 'cabin'], [100, 200], [90, 150]);
    for (const f of [m.flags[0]]) for (let k = 0; k < 4; k++) { const c = Math.PI / 4 + k * Math.PI / 2; crescent(f.x + Math.cos(c) * 110, f.y + Math.sin(c) * 110, c, true); }
    for (let k = 0; k < 3; k++) { const c = Math.PI * 0.75 + (k - 1) * 0.55; crescent(1500 + Math.cos(c) * 290, 1000 + Math.sin(c) * 215, c, true); }
    crescent(400, 880, 0, true); crescent(400, 1120, 0, true);
    scatter(8, 110, 40, (x, y) => { if (!m.ice.some(i => inRect(x, y, i, 30))) crescent(x, y, R() * TAU, true); });
    scatter(70, 40, 24, (x, y) => { if (!m.ice.some(i => inRect(x, y, i, 24))) tree(x, y, true); });
  } else {
    // river town
    m.roads = [[0, 350, 3000, 350], [0, 1000, 3000, 1000], [0, 1650, 3000, 1650], [700, 0, 700, 2000], [2300, 0, 2300, 2000]].map(l => ({ l, w: 72, side: 14, style: 'asphalt' }));
    const rx = 1420, rw = 160, cuts = [350, 1000, 1650], hw = 50;
    let y0 = 0; for (const c of cuts) { m.water.push({ x: rx, y: y0, w: rw, h: c - hw - y0 }); m.bridges.push({ x: rx - 18, y: c - hw, w: rw + 36, h: hw * 2 }); y0 = c + hw; } m.water.push({ x: rx, y: y0, w: rw, h: WH - y0 });
    m.flags = [{ name: 'A', x: 1060, y: 680 }, { name: 'B', x: 1500, y: 1000 }, { name: 'C', x: 1940, y: 1320 }];
    // town blocks: four buildings around square A, then fill
    const sq = [[790, 430, 170, 120], [1180, 430, 180, 120], [790, 820, 170, 120], [1190, 830, 170, 110]];
    sq.forEach(([x, y, w, h], i) => sym(m.buildings, { x, y, w, h, roof: ['brick', 'tar', 'concrete', 'brick'][i], seed: i }, q => ({ ...mirrorRect(q), seed: q.seed + 50 })));
    placeBuildings(9, 1400, ['brick', 'tar', 'concrete', 'metal'], [110, 210], [100, 170]);
    for (const f of m.flags) if (f.name !== 'B') for (let k = 0; k < 4; k++) { const c = Math.PI / 4 + k * Math.PI / 2; crescent(f.x + Math.cos(c) * 110, f.y + Math.sin(c) * 110, c, false); }
    for (const sd of [-1, 1]) { crescent(1500 - 215, 1000 + sd * 72, 0, false); crescent(1500 + 215, 1000 + sd * 72, Math.PI, false); }
    crescent(400, 880, 0, true); crescent(400, 1120, 0, true);
    scatter(8, 110, 40, (x, y) => crescent(x, y, R() * TAU, true));
    scatter(30, 44, 26, (x, y) => tree(x, y, true));
  }
  // crate spots, nests, spawns (shared)
  let tries = 0; while (m.crateSpots.length < 14 && tries++ < 3000) { const x = 80 + R() * (WW / 2 - 100), y = 80 + R() * (WH - 160); if (blockedFor(x, y, 10) && !onRoad(x, y, 0)) continue; if (m.buildings.some(b => inRect(x, y, b, 14)) || m.water.some(w => inRect(x, y, w, 14))) continue; if (m.statics.some(s => Math.hypot(s.x - x, s.y - y) < 30)) continue; if (m.crateSpots.some(c => Math.hypot(c.x - x, c.y - y) < 260)) continue; m.crateSpots.push({ x, y }); const [mx, my] = mirrorPt(x, y); m.crateSpots.push({ x: mx, y: my }); }
  for (const t of [0, 1]) {
    const L = [['tank', 230, 880, 0], ['jeep', 230, 1120, 0], ['jeep', 100, 1125, 0]];
    for (const [type, x, y, a] of L) { if (t === 0) m.vehSpawns.push({ type, x, y, a, team: 0 }); else { const [mx, my] = mirrorPt(x, y); m.vehSpawns.push({ type, x: mx, y: my, a: a + Math.PI, team: 1 }); } }
  }
  // machine-gun nests: covering the near flag, facing the centre
  { const f = m.flags[0]; const a = Math.atan2(1000 - f.y, 1500 - f.x);
    let best = null; for (let k = 0; k < 40; k++) { const d = 150 + k * 3, aa = a + (k % 2 ? 1 : -1) * k * 0.05; const x = f.x + Math.cos(aa) * d, y = f.y + Math.sin(aa) * d; if (!blockedFor(x, y, 18) || onRoad(x, y, 0)) { if (m.buildings.some(b => inRect(x, y, b, 30)) || m.water.some(w => inRect(x, y, w, 30)) || onRoad(x, y, 0)) continue; if (m.statics.some(s => Math.hypot(s.x - x, s.y - y) < 34)) continue; best = [x, y]; break; } }
    if (best) { const [x, y] = best, fa = Math.atan2(1000 - y, 1500 - x); m.vehSpawns.push({ type: 'nest', x, y, a: fa, team: -1 }); const [mx, my] = mirrorPt(x, y); m.vehSpawns.push({ type: 'nest', x: mx, y: my, a: fa + Math.PI, team: -1 }); }
  }
  tries = 0;
  while (m.ffaSpawns.length < 18 && tries++ < 4000) {
    const x = 80 + R() * (WW - 160), y = 80 + R() * (WH - 160);
    const bad = m.buildings.some(b => inRect(x, y, b, 40)) || m.water.some(w => inRect(x, y, w, 30)) || m.statics.some(s => Math.hypot(s.x - x, s.y - y) < 40);
    if (!bad && !m.ffaSpawns.some(p => Math.hypot(p.x - x, p.y - y) < 300)) m.ffaSpawns.push({ x, y });
  }
  m.fwd = [{ x: m.flags[0].x - 60, y: m.flags[0].y }, { x: m.flags[2].x + 60, y: m.flags[2].y }];
  m.sight = m.buildings.filter(b => !b.glass); m.glass = m.buildings.filter(b => b.glass);     // what blocks sight / dims it (the dev yard keeps its own, as wall runs)
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

/* ---------------- ground painting ---------------- */
const PALS = {
  classic: { grass: '#137a12', gA: '#0f6e0e', gB: '#18871a', gC: '#0b5e0b', patch: ['8,80,8', '40,130,30'], mud: 'rgba(110,90,40,0.18)', asph: '#5c5c5c', aA: '#545454', aB: '#656565', side: '#c9c9c4', sideL: '#b0b0aa', sideE: '#8f8f8a', dash: '#d6b417', dirt: '#8a6a3a', dA: '#7a5c30', dB: '#9a784a', water: '#2b5f86', waterL: '#4a86b8', bank: '#6d5a36', pad: '#7b7a72', padA: '#6f6e66', padB: '#878680', padL: '#62615a', wheat: ['#b8a040', '#a08a30'], corn: ['#4f8a28', '#3e7020'], plow: ['#6a4a2a', '#56391e'], bridge: '#8a7a62', rail: '#4a3e30' },
  grit: { grass: '#4a5032', gA: '#42472b', gB: '#535a38', gC: '#383c24', patch: ['50,45,25', '85,90,55'], mud: 'rgba(70,55,35,0.35)', asph: '#3c3b38', aA: '#353431', aB: '#45443f', side: '#74716a', sideL: '#5f5c55', sideE: '#4a4843', dash: '#8a7a3e', dirt: '#5c4a33', dA: '#52422c', dB: '#67533a', water: '#2b3836', waterL: '#46564f', bank: '#3e3424', pad: '#57554f', padA: '#4f4d47', padB: '#605e57', padL: '#47453f', wheat: ['#7d7448', '#6b633b'], corn: ['#4b5530', '#3e4627'], plow: ['#4a3826', '#3c2d1f'], bridge: '#5e564a', rail: '#2e2a24' }
};
PALS.snow = Object.assign({}, PALS.classic, { grass: '#e6edf2', gA: '#d8e2ea', gB: '#f4f8fb', gC: '#c8d4de', patch: ['150,170,195', '255,255,255'], mud: 'rgba(120,135,150,0.16)', dirt: '#b9bec4', dA: '#a2a8b0', dB: '#c8ccd0', pad: '#8d9298', padA: '#83888e', padB: '#979ca2', padL: '#767b80', ice: '#9cc8de', iceL: '#d4ecf6', iceD: '#6fa2bf' });
PALS.snowGrit = Object.assign({}, PALS.grit, { grass: '#c6cac6', gA: '#b8bdb9', gB: '#d2d5d0', gC: '#a9aea9', patch: ['90,95,90', '225,228,224'], mud: 'rgba(80,80,72,0.3)', dirt: '#8f8e86', dA: '#7b7a72', dB: '#9c9b93', pad: '#6a6b68', padA: '#626360', padB: '#727370', padL: '#585956', ice: '#8aa2aa', iceL: '#b4c6cc', iceD: '#64808a' });
const ROOFS = {
  classic: { cabin: ['#3a2a1e', '#e8eef2', '#cdd8e0'], bunker: ['#3e4246', '#d6dee4', '#b9c4cc'], tar: ['#3c3a37', '#55524c', '#4a4743'], brick: ['#5e2b20', '#9a4a36', '#86402f'], metal: ['#2f4a40', '#5d8676', '#4d7466'], concrete: ['#57575a', '#a4a4a0', '#929290'], barn: ['#4a1c14', '#9a3426', '#82291d'], tin: ['#4a4c50', '#8a8e94', '#75797f'], thatch: ['#5a4520', '#a8873e', '#94742f'] },
  grit: { cabin: ['#2a2420', '#c4c8c4', '#adb2ad'], bunker: ['#2c2f31', '#b8bcb8', '#9fa4a0'], tar: ['#2b2a27', '#3e3c38', '#35332f'], brick: ['#3e2620', '#61392d', '#553128'], metal: ['#26302b', '#45544c', '#3b4842'], concrete: ['#3d3d3d', '#6a6a66', '#5c5c58'], barn: ['#34201a', '#5e3027', '#512820'], tin: ['#333436', '#5a5c5f', '#4d4f52'], thatch: ['#3e3420', '#6e5e38', '#615230'] }
};
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
  ctx.save(); ctx.strokeStyle = 'rgba(255,90,60,0.55)'; ctx.lineWidth = 3; ctx.setLineDash([18, 12]); ctx.strokeRect(-2, -2, WW + 4, WH + 4); ctx.restore();
}
function paintGround() {
  const grit = CFG.style === 'grit', P = SNOWY() ? (grit ? PALS.snowGrit : PALS.snow) : (PALS[CFG.style] || PALS.classic), RF = ROOFS[CFG.style] || ROOFS.classic;
  px_.setTransform(1, 0, 0, 1, 0, 0); px_.clearRect(0, 0, WW, WH); dgx.setTransform(1, 0, 0, 1, 0, 0); dgx.clearRect(0, 0, WW, WH); if (typeof M !== 'undefined' && M) M.fogMem = null;
  if (MAP.tiled) { paintDevGround(); return; }
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
  // roads
  const side = pattern(16, 16, (g, w, h) => { g.fillStyle = P.side; g.fillRect(0, 0, w, h); g.fillStyle = P.sideL; g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h); for (let i = 0; i < 14; i++) { g.fillStyle = R() < 0.5 ? P.sideL : P.side; g.fillRect((R() * w) | 0, (R() * h) | 0, 1, 1); } });
  const asph = pattern(64, 64, (g, w, h) => { g.fillStyle = P.asph; g.fillRect(0, 0, w, h); for (let i = 0; i < 500; i++) { g.fillStyle = R() < 0.5 ? P.aA : P.aB; g.fillRect((R() * w) | 0, (R() * h) | 0, 1, 1); } });
  const dirt = pattern(48, 48, (g, w, h) => { g.fillStyle = P.dirt; g.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { g.fillStyle = R() < 0.5 ? P.dA : P.dB; g.fillRect((R() * w) | 0, (R() * h) | 0, 1 + (R() < 0.3), 1); } });
  for (const rd of MAP.roads) if (rd.style === 'asphalt') { const r = roadRect(rd, 0); gx.fillStyle = P.sideE; gx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4); gx.fillStyle = side; gx.fillRect(r.x, r.y, r.w, r.h); }
  for (const rd of MAP.roads) {
    const r = roadRect(rd, -(rd.side || 0));
    if (rd.style === 'dirt') {
      gx.fillStyle = dirt; gx.fillRect(r.x, r.y, r.w, r.h);
      // ragged edges + ruts
      const horiz = rd.l[1] === rd.l[3];
      for (let s = 0; s < (horiz ? r.w : r.h); s += 6) { const e = R() * 8; gx.fillStyle = P.dirt; if (horiz) { gx.fillRect(r.x + s, r.y - e, 6, e); gx.fillRect(r.x + s, r.y + r.h, 6, R() * 8); } else { gx.fillRect(r.x - e, r.y + s, e, 6); gx.fillRect(r.x + r.w, r.y + s, R() * 8, 6); } }
      gx.fillStyle = P.dA; if (horiz) { gx.fillRect(r.x, r.y + r.h * 0.28, r.w, 4); gx.fillRect(r.x, r.y + r.h * 0.66, r.w, 4); } else { gx.fillRect(r.x + r.w * 0.28, r.y, 4, r.h); gx.fillRect(r.x + r.w * 0.66, r.y, 4, r.h); }
    } else { gx.fillStyle = asph; gx.fillRect(r.x, r.y, r.w, r.h); }
  }
  const inter = [];
  for (const a of MAP.roads) for (const b of MAP.roads) { const A = a.l, Bl = b.l; if (A[1] === A[3] && Bl[0] === Bl[2] && Bl[0] >= A[0] && Bl[0] <= A[2] && A[1] >= Bl[1] && A[1] <= Bl[3]) inter.push([Bl[0], A[1]]); }
  gx.fillStyle = P.dash;
  for (const rd of MAP.roads) {
    if (rd.style !== 'asphalt') continue;
    const [x1, y1, x2, y2] = rd.l, horiz = y1 === y2, len = horiz ? x2 - x1 : y2 - y1;
    for (let s = 0; s < len; s += 34) {
      const px = horiz ? x1 + s : x1, py = horiz ? y1 : y1 + s;
      if (inter.some(([ix, iy]) => Math.abs(px - ix) < 62 && Math.abs(py - iy) < 62)) continue;
      if (grit && R() < 0.25) continue;
      if (horiz) gx.fillRect(px, py - 1.5, 18, 3); else gx.fillRect(px - 1.5, py, 3, 18);
    }
  }
  gx.fillStyle = grit ? 'rgba(160,155,140,0.35)' : 'rgba(235,235,230,0.55)';
  for (const [ix, iy] of inter) { const rd = MAP.roads[0]; if (rd.style !== 'asphalt') break; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = -30; k < 32; k += 9) { if (dx) gx.fillRect(ix + dx * 44 - 4, iy + k, 8, 5); else gx.fillRect(ix + k, iy + dy * 44 - 4, 5, 8); } }
  // bridges: railings over the water
  for (const b of MAP.bridges) { gx.fillStyle = P.rail; gx.fillRect(b.x, b.y - 4, b.w, 6); gx.fillRect(b.x, b.y + b.h - 2, b.w, 6); for (let x = b.x; x < b.x + b.w; x += 16) { gx.fillStyle = P.bridge; gx.fillRect(x, b.y - 3, 3, 4); gx.fillRect(x, b.y + b.h - 1, 3, 4); } }
  // grit: cracks, potholes, oil, old craters
  if (grit) {
    for (let i = 0; i < 260; i++) {
      const x = R() * WW, y = R() * WH; const rd = onRoad(x, y, 0);
      if (rd && rd.style === 'asphalt') { gx.strokeStyle = 'rgba(15,15,12,0.5)'; gx.lineWidth = 1; gx.beginPath(); gx.moveTo(x, y); let a = R() * TAU, cx = x, cy = y; for (let k = 0; k < 5; k++) { a += rnd(-0.8, 0.8); cx += Math.cos(a) * 9; cy += Math.sin(a) * 9; gx.lineTo(cx, cy); } gx.stroke(); if (R() < 0.3) { gx.fillStyle = 'rgba(20,20,18,0.55)'; gx.beginPath(); gx.ellipse(x, y, 6 + R() * 6, 4 + R() * 4, R() * 3, 0, TAU); gx.fill(); } }
    }
    for (let i = 0; i < 26; i++) { const x = 100 + R() * (WW - 200), y = 100 + R() * (WH - 200); if (MAP.buildings.some(b => inRect(x, y, b, 20))) continue; scorch(x, y, 25 + R() * 30); }
  }
  buildRoofs(RF, grit);
  gx.fillStyle = 'rgba(0,0,0,0.35)'; gx.fillRect(0, 0, WW, 12); gx.fillRect(0, WH - 12, WW, 12); gx.fillRect(0, 0, 12, WH); gx.fillRect(WW - 12, 0, 12, WH);
}
/* roofs are separate sprites so they draw ABOVE soldiers and vehicles (height layering) */
function buildRoofs(RF, grit) {
  for (const B of MAP.buildings) {
    const c = mk(B.w, B.h), g = c.getContext('2d'), b = { ...B, x: 0, y: 0 };
    const pal = RF[b.roof] || RF.tar;
    g.fillStyle = pal[0]; g.fillRect(b.x, b.y, b.w, b.h);
    g.fillStyle = pal[1]; g.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    const r2 = mulberry(b.seed + 9); g.fillStyle = pal[2];
    if (b.roof === 'metal' || b.roof === 'tin') for (let x = b.x + 8; x < b.x + b.w - 6; x += 8) g.fillRect(x, b.y + 4, 2, b.h - 8);
    else if (b.roof === 'brick') for (let y = b.y + 8; y < b.y + b.h - 6; y += 6) for (let x = b.x + 6 + ((y / 6) % 2) * 6; x < b.x + b.w - 8; x += 12) g.fillRect(x, y, 10, 1);
    else if (b.roof === 'barn') { g.fillRect(b.x + 4, b.y + b.h / 2 - 2, b.w - 8, 4); for (let x = b.x + 10; x < b.x + b.w - 6; x += 12) g.fillRect(x, b.y + 4, 1, b.h - 8); }
    else if (b.roof === 'thatch') for (let i = 0; i < b.w * b.h / 20; i++) g.fillRect(b.x + 6 + r2() * (b.w - 12), b.y + 6 + r2() * (b.h - 12), 4, 1);
    else for (let i = 0; i < b.w * b.h / 90; i++) g.fillRect(b.x + 6 + r2() * (b.w - 12), b.y + 6 + r2() * (b.h - 12), 2, 2);
    if (b.roof !== 'barn' && b.roof !== 'thatch') for (let k = 0; k < 2; k++) {
      const ux = b.x + 14 + r2() * (b.w - 46), uy = b.y + 14 + r2() * (b.h - 46);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(ux + 4, uy + 4, 22, 18);
      g.fillStyle = grit ? '#6a6a64' : '#9a9a96'; g.fillRect(ux, uy, 22, 18); g.fillStyle = grit ? '#4a4a46' : '#6c6c68'; g.fillRect(ux + 3, uy + 3, 16, 12);
      g.fillStyle = '#2a2a28'; g.beginPath(); g.arc(ux + 11, uy + 9, 5, 0, TAU); g.fill();
    }
    if (grit) { for (let i = 0; i < 6; i++) { const sx = b.x + r2() * b.w; const gr = g.createLinearGradient(sx, b.y, sx, b.y + b.h); gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(sx, b.y + 4, 2 + r2() * 4, b.h - 8); } }
    g.strokeStyle = grit ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)'; g.lineWidth = 2; g.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
      if (SNOWY()) { g.fillStyle = grit ? 'rgba(200,204,200,0.55)' : 'rgba(245,248,252,0.6)'; for (let i = 0; i < b.w * b.h / 60; i++) g.fillRect(4 + Math.random() * (b.w - 8), 4 + Math.random() * (b.h - 8), 3, 2); }
    B.roofC = c;
  }
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
function scorch(x, y, r) {
  const g = dgx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(40,22,8,0.75)'); g.addColorStop(0.5, 'rgba(70,40,12,0.45)'); g.addColorStop(1, 'rgba(70,40,12,0)');
  dgx.setTransform(1, 0, 0, 1, 0, 0); dgx.fillStyle = g; dgx.beginPath(); dgx.arc(x, y, r, 0, TAU); dgx.fill();
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
const NC = 30; let NGW = Math.ceil(WW / NC), NGH = Math.ceil(WH / NC);
let navS = null, navV = null, navDirty = 0;
function buildNav() {
  navS = new Uint8Array(NGW * NGH); navV = new Uint8Array(NGW * NGH);
  for (let j = 0; j < NGH; j++) for (let i = 0; i < NGW; i++) {
    const x = (i + 0.5) * NC, y = (j + 0.5) * NC, k = j * NGW + i;
    let s = 0, v = 0;
    if (x < 30 || y < 30 || x > WW - 30 || y > WH - 30) s = v = 1;
    if (typeof M !== 'undefined' && M && M.wrecks) for (const w of M.wrecks) { const [lx, ly] = toLocal(w, x, y); if (Math.abs(lx) < w.hl + 8 && Math.abs(ly) < w.hw + 8) s = 1; if (Math.abs(lx) < w.hl + 30 && Math.abs(ly) < w.hw + 30) v = 1; }
    for (const b of MAP.buildings) { if (inRect(x, y, b, 12)) s = 1; if (inRect(x, y, b, 38)) v = 1; }
    for (const w of MAP.water) { if (inRect(x, y, w, 4)) s = 1; if (inRect(x, y, w, 30)) v = 1; }
    navS[k] = s; navV[k] = v;
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
/* world size: the normal maps are 3000x2000, the dev yard is smaller; canvases and path grids follow */
function setWorld(w, h) {
  if (w === WW && h === WH) return; WW = w; WH = h;
  for (const c of [ground, prints, decals]) { c.width = w; c.height = h; }
  NGW = Math.ceil(WW / NC); NGH = Math.ceil(WH / NC); ASG = new Float32Array(NGW * NGH); ASF = new Int32Array(NGW * NGH); ASS = new Uint32Array(NGW * NGH); ASC = new Uint32Array(NGW * NGH);
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
function lineFree(g, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / (NC * 0.5));
  for (let k = 1; k < n; k++) { const x = lerp(x0, x1, k / n), y = lerp(y0, y1, k / n); const i = (x / NC) | 0, j = (y / NC) | 0; if (i < 0 || j < 0 || i >= NGW || j >= NGH || g[j * NGW + i]) return false; }
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
  while (H.length && iters++ < 6000) {
    const k = pop(); if (ASC[k] === asStamp) continue; ASC[k] = asStamp;
    if (k === T) { found = true; break; }
    const i = k % NGW, j = (k / NGW) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NGW || b >= NGH) continue;
      const n = b * NGW + a; if (g[n] || ASC[n] === asStamp) continue;
      if (di && dj && (g[j * NGW + a] || g[b * NGW + i])) continue;
      const ng = ASG[k] + (di && dj ? 1.414 : 1);
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
