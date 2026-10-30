/* ---------------- stamped ground: the map editor's maps (mapedit/) ----------------
   A map's ground is its base texture with polygons stamped over it in order, like a paint program's stamp: each fills
   with its texture by world position (so a texture runs on seamlessly from one stamp to the next), cut by the polygon,
   its edge blurred soft px so it mixes into what's under it. Textures are atlas sprites named tex_<name> (painted and
   given heights / materials in the heightmap editor like any sprite; they should tile); until one is in the atlas a
   pixel placeholder (GTEXP) stands in, flat. The same stamps paint a material map (heights R x4, reflect G, glow B) that
   the sun's height pass reads (sunHeights: GMAT). Baked once when the map is painted; gStampAdd bakes one more stamp
   (only its box) for later: craters, scorch.
   A map (G): { v: 1, id, name, w, h, base, stamps: [{ t: texture, soft: px, p: [x0, y0, x1, y1, ...] }] }.
   Shared with the editor (mapedit/), which has its own ATLAS / IMG / MIMG: nothing here may use the game's other globals. */
const GTEXP = {      // placeholder textures: [base, dark, light, speck] and how many specks
  grass: ['#3f7a2a', '#346a22', '#4b8a33', '#2b5a1c', 900], dirt: ['#7a5a3a', '#6a4c30', '#8a6a46', '#5a3e26', 700],
  sand: ['#c9b07a', '#b89f6a', '#d8c08a', '#a88e5c', 600], rock: ['#6e6c66', '#5e5c57', '#7e7c76', '#4e4c48', 800],
  snow: ['#e6edf2', '#d8e2ea', '#f4f8fb', '#c8d4de', 500], asphalt: ['#4c4c4c', '#444444', '#555555', '#3a3a3a', 900],
  mud: ['#4e3c28', '#433322', '#5a4630', '#382a1c', 800], concrete: ['#8e8b84', '#84817a', '#9a978f', '#76736c', 500]
};
/* road types (a path's rt; none: plain, just its texture): what's baked with it. walk: a pavement sw px wide each side
   (concrete, kerb edged) under the road; marks over it: dash (a dashed white centre line), dbl (a double yellow one),
   edge (white lines along the sides), ruts (two worn tracks). t / sw: what a road starts with when given the type */
const GROADS = {
  plain: { n: 'Plain', marks: [] }, street: { n: 'Street', walk: 1, marks: ['dash'], t: 'asphalt', sw: 14 },
  highway: { n: 'Highway', marks: ['dbl', 'edge'], t: 'asphalt' }, dirt: { n: 'Dirt track', marks: ['ruts'], t: 'dirt' }
};
const gRT = s => s.l && GROADS[s.rt] || GROADS.plain;
const gSW = s => gRT(s).walk ? s.sw ?? 14 : 0;
const gRng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const gCv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const gReady = im => !!(im && im.complete && im.naturalWidth);
/* every texture there is: the atlas's tex_ sprites, then the placeholders not overridden */
function gTexNames() {
  const A = typeof ATLAS !== 'undefined' ? Object.keys(ATLAS).filter(n => n.startsWith('tex_')).map(n => n.slice(4)) : [];
  return [...A, ...Object.keys(GTEXP).filter(n => !A.includes(n))];
}
/* a texture's colour and material canvases (m null: flat). Cached once the atlas has loaded (placeholders till then) */
const GTX = new Map();
function gTex(name) {
  const imOk = typeof IMG !== 'undefined' && gReady(IMG), mOk = typeof MIMG !== 'undefined' && gReady(MIMG), key = name + (imOk ? 1 : 0) + (mOk ? 1 : 0);
  let T = GTX.get(key); if (T) return T;
  const r = typeof ATLAS !== 'undefined' && ATLAS['tex_' + name];
  if (r && imOk) {
    const cut = im => { const c = gCv(r[2], r[3]); c.getContext('2d').drawImage(im, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]); return c; };
    T = { c: cut(IMG), m: mOk ? cut(MIMG) : null };
  } else {
    const P = GTEXP[name] || GTEXP.grass, c = gCv(64, 64), g = c.getContext('2d'), R = gRng([...name].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
    g.fillStyle = P[0]; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < P[4]; i++) { g.fillStyle = R() < 0.5 ? P[1] : P[2]; g.fillRect((R() * 64) | 0, (R() * 64) | 0, 1 + (R() < 0.3), 1); }
    for (let i = 0; i < P[4] / 15; i++) { g.fillStyle = P[3]; g.fillRect((R() * 64) | 0, (R() * 64) | 0, 1, 2); }
    T = { c, m: null };
  }
  if (T.m) { const d = T.m.getContext('2d').getImageData(0, 0, T.m.width, T.m.height).data; let h = 0; for (let i = 0; i < d.length; i += 4) h = Math.max(h, d[i]); T.h = h / 4; } else T.h = 0;     // its tallest px
  GTX.set(key, T); return T;
}
/* a stamp is a shape (p: a closed polygon) or a path (k 'path', l: open lines, the first the main one and the rest
   branches, all wd px wide; branches start on another line, and being one mask they join seamlessly) */
const gLines = s => s.l || [s.p];
const gOk = s => !s.off && (s.l ? s.l.some(q => q.length >= 4) : s.p && s.p.length >= 6);
/* a stamp's box (whole px): its points, the path's half width and the blur round it */
function gBox(s) {
  const e = Math.ceil((s.soft || 0) * 1.2) + 1 + (s.l ? Math.ceil((s.wd || 0) / 2 + gSW(s)) : 0); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of gLines(s)) for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  return { x: Math.floor(x0 - e), y: Math.floor(y0 - e), w: Math.ceil(x1 + e) - Math.floor(x0 - e), h: Math.ceil(y1 + e) - Math.floor(y0 - e) };
}
/* the stamp's outline as a path: corners rounded by s.r px (each cut back at most half its shorter edge, then a curve
   through the corner), sharp when 0; a path's lines open, their ends left sharp. The editor draws its outlines with this too */
function gPath(g, s) {
  const r = s.r || 0, open = !!s.l; g.beginPath();
  for (const p of gLines(s)) {
    const n = p.length / 2; if (n < 2) continue;
    if (r <= 0 || n < 3) { g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); if (!open) g.closePath(); continue; }
    const pt = i => { i = (i + n) % n; return [p[i * 2], p[i * 2 + 1]]; };
    const cut = (a, b, d) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = Math.min(d, l / 2) / l; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
    if (open) g.moveTo(p[0], p[1]);
    for (let i = open ? 1 : 0; i < (open ? n - 1 : n); i++) {
      const v = pt(i), a = cut(v, pt(i - 1), r), b = cut(v, pt(i + 1), r);
      if (i === 0) g.moveTo(a[0], a[1]); else g.lineTo(a[0], a[1]);
      g.quadraticCurveTo(v[0], v[1], b[0], b[1]);
    }
    if (open) g.lineTo(p[p.length - 2], p[p.length - 1]); else g.closePath();
  }
}
const gHit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
/* the stamp's mask over its box b: the polygon, blurred (three box blurs ~ a gaussian, sigma soft / 4: it mixes over
   about soft px across the edge). Worked at a lower resolution the softer it is (it's smooth anyway): scaled up when drawn */
const GB = { m: null, s: null };
function gMask(s, b) {
  const soft = s.soft || 0, q = soft >= 24 ? 0.25 : soft >= 8 ? 0.5 : 1, w = Math.max(1, Math.ceil(b.w * q)), h = Math.max(1, Math.ceil(b.h * q));
  const c = GB.m || (GB.m = gCv(1, 1)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.setTransform(q, 0, 0, q, -b.x * q, -b.y * q);
  gPath(g, s); if (s.l) { g.strokeStyle = '#fff'; g.lineWidth = s.wd || 1; g.lineCap = g.lineJoin = 'round'; g.stroke(); } else { g.fillStyle = '#fff'; g.fill(); }
  g.setTransform(1, 0, 0, 1, 0, 0);
  const sg = soft / 4 * q; if (sg >= 0.35) {
    const id = g.getImageData(0, 0, w, h), d = id.data, a = new Float32Array(w * h), t = new Float32Array(w * h);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    const r = Math.max(1, Math.round((Math.sqrt(4 * sg * sg + 1) - 1) / 2));     // box radius: three passes ~ sigma sg
    const pass = (src, dst, n, m, st, ln) => {     // n lines of m px, st between px, ln between lines; edges held
      for (let j = 0; j < n; j++) { const o = j * ln; let acc = 0; for (let i = -r; i <= r; i++) acc += src[o + Math.min(m - 1, Math.max(0, i)) * st];
        for (let i = 0; i < m; i++) { dst[o + i * st] = acc / (2 * r + 1); acc += src[o + Math.min(m - 1, i + r + 1) * st] - src[o + Math.max(0, i - r) * st]; } }
    };
    for (let k = 0; k < 3; k++) { pass(a, t, h, w, 1, w); pass(t, a, w, h, w, 1); }
    for (let i = 0; i < a.length; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; d[i * 4 + 3] = a[i]; }
    g.putImageData(id, 0, 0);
  }
  return { c, q };
}
/* the stamp in texture k ('c' colour, 'm' material) over its box, in the scratch canvas (one, reused: on GL its texture is too) */
function gStampCv(s, b, M, k) {
  const c = GB.s || (GB.s = gCv(1, 1)); if (c.width !== b.w || c.height !== b.h) { c.width = b.w; c.height = b.h; }
  const g = c.getContext('2d'), T = gTex(s.t); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, b.w, b.h);
  const src = k === 'm' ? T.m : T.c; if (src) { g.translate(-b.x, -b.y); g.fillStyle = g.createPattern(src, 'repeat'); g.fillRect(b.x, b.y, b.w, b.h); g.setTransform(1, 0, 0, 1, 0, 0); } else { g.fillStyle = '#000'; g.fillRect(0, 0, b.w, b.h); }
  g.globalCompositeOperation = 'destination-in'; g.imageSmoothingEnabled = true; g.drawImage(M.c, 0, 0, M.c.width, M.c.height, 0, 0, M.c.width / M.q, M.c.height / M.q); g.globalCompositeOperation = 'source-over';
  return c;
}
/* junctions: wherever road lines meet or cross (any roads: one stamp's branches, separate stamps). Found from the lines'
   points (not their rounding): a line's end on another line is a T, two segments crossing an X; ones closer than the
   roads' half widths are one. Each: { x, y, r (half the widest road there), arms: [{ a: angle out, wd, s }], cw (crosswalks),
   cut (markings cleared within) }. A junction with under 3 arms is a bend, not a junction. G.jx: the editor's overrides,
   [{ x, y, off: 1 (no junction), cw: 0 / 1 (crosswalks off / on; none: on where a street meets it) }], the nearest within 40 px */
function gJunctions(G) {
  const L = []; for (const s of G.stamps) if (s.l && gOk(s)) for (const p of s.l) if (p.length >= 4) L.push({ s, p, wd: s.wd || 1, n: p.length });
  const J = [], ang = a => Math.atan2(Math.sin(a), Math.cos(a));
  const armsOf = (A, i, x, y, only) => {     // arms of line A through (x, y) on its segment i: both ways, less a way it ends right there
    const a = Math.atan2(A.p[i + 3] - A.p[i + 1], A.p[i + 2] - A.p[i]), e = A.wd / 2, out = [];
    if (only !== -1 && Math.hypot(A.p[A.n - 2] - x, A.p[A.n - 1] - y) > e) out.push({ a, wd: A.wd, s: A.s });
    if (only !== 1 && Math.hypot(A.p[0] - x, A.p[1] - y) > e) out.push({ a: ang(a + Math.PI), wd: A.wd, s: A.s });
    return out;
  };
  const add = (x, y, arms) => {
    const r = Math.max(...arms.map(q => q.wd / 2)); let j = J.find(q => Math.hypot(q.x - x, q.y - y) < Math.max(q.r, r));
    if (!j) J.push(j = { x, y, r, arms: [] }); j.r = Math.max(j.r, r);
    for (const q of arms) if (!j.arms.some(b => Math.abs(ang(b.a - q.a)) < 0.6)) j.arms.push(q);
  };
  for (const E of L) for (const end of [0, 1]) {     // T: a line's end on another line
    const k = end ? E.n - 2 : 0, x = E.p[k], y = E.p[k + 1], ia = end ? E.n - 4 : 0;
    let b = null; for (const A of L) { if (A === E) continue; for (let i = 0; i + 3 < A.n; i += 2) { const [d, px, py] = gSegNear(A.p, i, x, y); if (d < A.wd / 2 + 4 && (!b || d < b[0])) b = [d, px, py, A, i]; } }
    if (!b) continue;
    const ain = end ? Math.atan2(E.p[ia + 1] - y, E.p[ia] - x) : Math.atan2(E.p[3] - y, E.p[2] - x);
    add(b[1], b[2], [{ a: ain, wd: E.wd, s: E.s }, ...armsOf(b[3], b[4], b[1], b[2])]);
  }
  for (let u = 0; u < L.length; u++) for (let v = u + 1; v < L.length; v++) {     // X: two lines crossing
    const A = L[u], B = L[v];
    for (let i = 0; i + 3 < A.n; i += 2) for (let k = 0; k + 3 < B.n; k += 2) {
      const ax = A.p[i], ay = A.p[i + 1], dx = A.p[i + 2] - ax, dy = A.p[i + 3] - ay, bx = B.p[k], by = B.p[k + 1], ex = B.p[k + 2] - bx, ey = B.p[k + 3] - by;
      const den = dx * ey - dy * ex; if (Math.abs(den) < 1e-6) continue;
      const t = ((bx - ax) * ey - (by - ay) * ex) / den, w = ((bx - ax) * dy - (by - ay) * dx) / den; if (t < 0 || t > 1 || w < 0 || w > 1) continue;
      const x = ax + dx * t, y = ay + dy * t;
      if ([[A.p[0], A.p[1]], [A.p[A.n - 2], A.p[A.n - 1]], [B.p[0], B.p[1]], [B.p[B.n - 2], B.p[B.n - 1]]].some(([qx, qy]) => Math.hypot(qx - x, qy - y) < 2)) continue;     // an end: a T
      add(x, y, [...armsOf(A, i, x, y), ...armsOf(B, k, x, y)]);
    }
  }
  const out = [];
  for (const j of J) {
    if (j.arms.length < 3) continue;
    const o = (G.jx || []).find(q => Math.hypot(q.x - j.x, q.y - j.y) < 40);
    j.o = o || null; if (o && o.off) { j.off = 1; out.push(j); continue; }
    j.cw = o && o.cw !== undefined ? !!o.cw : j.arms.some(q => q.s.rt === 'street');
    j.cut = j.r + (j.cw ? 36 : 8); out.push(j);
  }
  return out;
}
/* the nearest point of segment i of line p to (x, y): [distance, x, y] */
function gSegNear(p, i, x, y) {
  const ax = p[i], ay = p[i + 1], dx = p[i + 2] - ax, dy = p[i + 3] - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0, px = ax + dx * t, py = ay + dy * t;
  return [Math.hypot(px - x, py - y), px, py];
}
/* a junction's crosswalks: white bars across each arm just outside the crossing, drawn on a scratch canvas round it, then in one image */
function gCrosswalks(gc, j) {
  const e = Math.ceil(j.r + 70), c = GB.x || (GB.x = gCv(1, 1)); if (c.width !== e * 2 || c.height !== e * 2) { c.width = c.height = e * 2; }
  const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e * 2, e * 2); g.fillStyle = 'rgba(236,234,224,0.82)';
  for (const q of j.arms) {
    if (q.s.rt === 'dirt') continue;
    g.setTransform(Math.cos(q.a), Math.sin(q.a), -Math.sin(q.a), Math.cos(q.a), e, e);     // x along the arm, out of the junction
    const hw = q.wd / 2 - 6; for (let y = -hw; y + 6 <= hw; y += 11) g.fillRect(j.r + 10, y, 18, 6);
  }
  gc.drawImage(c, Math.round(j.x) - e, Math.round(j.y) - e);
}
/* a road type's layers over the stamp's box: 'walk' (the pavement, under the road; k 'm': flat) or 'marks' (colour only).
   A line along the road's side is a wide stroke with a narrower one cut out of it, so it follows the curves; markings
   stop short of where a branch leaves (its first point) */
function gRoadCv(s, b, part, k, G, J) {
  const c = GB.r || (GB.r = gCv(1, 1)); if (c.width !== b.w || c.height !== b.h) { c.width = b.w; c.height = b.h; }
  const g = c.getContext('2d'), wd = s.wd || 1; g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, b.w, b.h); g.translate(-b.x, -b.y);
  g.lineCap = g.lineJoin = 'round'; g.setLineDash([]);
  const line = (w, col, cut) => {     // a stroke w wide, with a cut-out cut wide down its middle (on its own canvas, then over)
    const t = GB.t || (GB.t = gCv(1, 1)); if (t.width !== b.w || t.height !== b.h) { t.width = b.w; t.height = b.h; }
    const q = t.getContext('2d'); q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'source-over'; q.clearRect(0, 0, b.w, b.h); q.translate(-b.x, -b.y); q.lineCap = q.lineJoin = 'round';
    gPath(q, s); q.strokeStyle = col; q.lineWidth = w; q.stroke();
    if (cut) { q.globalCompositeOperation = 'destination-out'; gPath(q, s); q.lineWidth = cut; q.stroke(); }
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(t, 0, 0); g.translate(-b.x, -b.y);
  };
  if (part === 'walk') {
    const sw = gSW(s), W = wd + sw * 2;
    if (k === 'm') { gPath(g, s); g.strokeStyle = '#000'; g.lineWidth = W; g.stroke(); return c; }
    gPath(g, s); g.strokeStyle = '#4a4843'; g.lineWidth = W; g.stroke();
    gPath(g, s); g.strokeStyle = g.createPattern(gTex('concrete').c, 'repeat'); g.lineWidth = W - 4; g.stroke();
    if (G) { g.globalCompositeOperation = 'destination-out'; g.strokeStyle = '#000'; for (const o of G.stamps) if (o !== s && o.l && gOk(o) && gHit(gBox(o), b)) { gPath(g, o); g.lineWidth = o.wd || 1; g.stroke(); } g.globalCompositeOperation = 'source-over'; }
    return c;
  }
  for (const m of gRT(s).marks) {
    if (m === 'dash') { gPath(g, s); g.strokeStyle = 'rgba(236,234,224,0.85)'; g.lineWidth = 3; g.lineCap = 'butt'; g.setLineDash([18, 16]); g.stroke(); g.setLineDash([]); g.lineCap = 'round'; }
    if (m === 'dbl') line(10, 'rgba(222,178,52,0.9)', 4);
    if (m === 'edge') line(wd - 8, 'rgba(236,234,224,0.8)', wd - 13);
    if (m === 'ruts') line(wd * 0.62, 'rgba(30,20,10,0.22)', wd * 0.3);
  }
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
  for (const j of J || []) if (!j.off) { g.beginPath(); g.arc(j.x, j.y, j.cut, 0, 7); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  return c;
}
/* bake map G's ground within box r (all of it if none; no G.base: only its stamps, over what's there) into gc (colour) and gm (material; may be null): 2D contexts,
   or GX's on GL surfaces. Returns the tallest painted height (px) */
function gBake(G, gc, gm, r) {
  r = r || { x: 0, y: 0, w: G.w, h: G.h }; const T = [[gc, 'c'], [gm, 'm']].filter(t => t[0]); let hmax = G.base ? gTex(G.base).h : 0;
  for (const [g, k] of T) {
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = false;
    g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    if (!G.base) continue; const B = gTex(G.base), src = k === 'm' ? B.m : B.c; g.fillStyle = src ? g.createPattern(src, 'repeat') : '#000'; g.fillRect(r.x, r.y, r.w, r.h);
  }
  const J = gJunctions(G);
  for (const s of G.stamps) {
    if (!gOk(s)) continue; const b = gBox(s); if (!gHit(b, r)) continue;
    const M = gMask(s, b), R = gRT(s); hmax = Math.max(hmax, gTex(s.t).h);
    if (R.walk) for (const [g, k] of T) g.drawImage(gRoadCv(s, b, 'walk', k, G), b.x, b.y);
    for (const [g, k] of T) g.drawImage(gStampCv(s, b, M, k), b.x, b.y);
    if (R.marks.length && gc) gc.drawImage(gRoadCv(s, b, 'marks', 'c', G, J), b.x, b.y);
  }
  if (gc) for (const j of J) if (j.cw && !j.off && Math.abs(j.x - (r.x + r.w / 2)) < r.w / 2 + j.r + 70 && Math.abs(j.y - (r.y + r.h / 2)) < r.h / 2 + j.r + 70) gCrosswalks(gc, j);
  if (gc && G.bounds && G.bounds.p.length >= 6) gOob(gc, G, r);
  for (const [g] of T) g.restore();
  return hmax;
}

/* the battlefield edge (G.bounds: {p, r}, a shape inside the map; none: the whole map): outside it tinted as the skirt is,
   the edge dashed. Drawn on a 2D scratch canvas over the rect, then in one image (gc may be GX's) */
function gOob(gc, G, r) {
  const c = GB.o || (GB.o = gCv(1, 1)); if (c.width !== r.w || c.height !== r.h) { c.width = r.w; c.height = r.h; }
  const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, r.w, r.h); g.translate(-r.x, -r.y);
  gPath(g, G.bounds); g.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2); g.fillStyle = 'rgba(40,6,2,0.38)'; g.fill('evenodd');
  gPath(g, G.bounds); g.strokeStyle = 'rgba(255,90,60,0.55)'; g.lineWidth = 3; g.setLineDash([18, 12]); g.stroke();
  gc.drawImage(c, r.x, r.y);
}
/* the edge as a grid of s px cells, 1 inside (outOfBounds reads it), or null for the whole map */
function gBoundsMask(G) {
  if (!G.bounds || G.bounds.p.length < 6) return null;
  const s = 8, w = Math.ceil(G.w / s) + 1, h = Math.ceil(G.h / s) + 1, c = gCv(w, h), g = c.getContext('2d');
  g.scale(1 / s, 1 / s); gPath(g, G.bounds); g.fillStyle = '#fff'; g.fill();
  const d = g.getImageData(0, 0, w, h).data, a = new Uint8Array(w * h); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  return { s, w, h, a };
}

/* ---------------- in the game ---------------- */
/* the maps: built in (GMAPS: maps/*.json, put in at build) and the editor's (Send to game: this browser only, mmgl.maplab),
   listed after the others as 'g:<id>' */
const GMAP_LAB = typeof store !== 'undefined' ? store.get('maplab', {}) : {};
function gMapOf(id) { const k = id.slice(2); return GMAP_LAB[k] || (typeof GMAPS !== 'undefined' ? GMAPS.find(G => G.id === k) : null); }
function gMapList() {
  if (typeof MAPNAMES === 'undefined') return;
  const all = [...(typeof GMAPS !== 'undefined' ? GMAPS : []), ...Object.values(GMAP_LAB)];
  for (const G of all) { const id = 'g:' + G.id, n = (G.name || G.id).toUpperCase(), e = MAPNAMES.find(m => m[0] === id); if (e) e[1] = n; else MAPNAMES.push([id, n]); }
}
gMapList();
if (typeof addEventListener !== 'undefined' && typeof store !== 'undefined') addEventListener('storage', e => { if (e.key !== 'mmgl.maplab') return; for (const k in GMAP_LAB) delete GMAP_LAB[k]; Object.assign(GMAP_LAB, store.get('maplab', {})); gMapList(); });
/* the ground of a stamped map: colour into the ground, material into GMAT (GL only: the sun pass is GL only) */
let GMAT = null, GMAX = 0;
function paintStamped() {
  const G = MAP.gmap;
  if (typeof GL !== 'undefined' && GL) { if (!GMAT || GMAT.width !== WW || GMAT.height !== WH) GMAT = mkG(WW, WH); } else GMAT = null;
  GMAX = gBake(G, gx, GMAT && GMAT.getContext('2d'), null);
  if (!gReady(IMG) || (typeof MIMG !== 'undefined' && MIMG && !gReady(MIMG))) for (const im of [IMG, typeof MIMG !== 'undefined' ? MIMG : null]) if (im && !gReady(im)) im.addEventListener('load', () => { if (MAP && MAP.gmap === G) paintGround(); }, { once: true });     // the atlas came late: again with the real textures
}
/* one more stamp, baked over only its box (destruction later: a crater, scorch) */
function gStampAdd(s) {
  const G = MAP.gmap; if (!G) return; G.stamps.push(s); const b = gBox(s), x = Math.max(0, b.x), y = Math.max(0, b.y);
  GMAX = Math.max(GMAX, gBake(G, gx, GMAT && GMAT.getContext('2d'), { x, y, w: Math.min(G.w, b.x + b.w) - x, h: Math.min(G.h, b.y + b.h) - y }) || 0);     // the whole box again (the stamps under it, the edge's tint)
}
