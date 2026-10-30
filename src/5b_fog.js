/* ================= line-of-sight vision (setting: VISION) =================
   Buildings block sight. Outside your sight you see the map as you last saw it: a half-resolution memory of
   the ground and decals, plus sandbags / fences / hay / trees in their last-seen state, dimmed. Units, vehicles,
   projectiles and effects only appear inside your sight. */
let FOGK = 0.5;     // memory scale: half resolution, except the small tile-art dev yard (full, so walls stay crisp)
function fogEyes(vw) {
  if (!M || M.demo || M.cfg.fog === 'off') return [];      // a match option (host's lobby), the same for everyone
  return viewSols(vw).map(posOf).map(o => [o.x, o.y]);
}
function raySeg(ox, oy, dx, dy, ax, ay, bx, by) {
  const sx = bx - ax, sy = by - ay, den = dx * sy - dy * sx; if (Math.abs(den) < 1e-9) return Infinity;
  const t = ((ax - ox) * sy - (ay - oy) * sx) / den, u = ((ax - ox) * dy - (ay - oy) * dx) / den;
  return t > 0 && u >= -1e-6 && u <= 1 + 1e-6 ? t : Infinity;     // a ray through a segment's end counts as a hit (float slack)
}
/* what the eye at (ex, ey) can see inside box [x0, y0, x1, y1], as an exact polygon:
   - every corner of every solid shape (sight walls / `walls`), each clipped to the box (so where a wall crosses
     the box edge is a corner too), plus the box's 4 corners, gets a ray;
   - a corner the ray doesn't reach (something nearer than VIS_TOL px short of it) is dropped;
   - an outer corner (its shape wholly to one side of the ray) sends the ray on past it to the next solid or the box edge,
     unless another shape touches it right there; that point and the corner stay together as one unit;
   - units are ordered by angle (a unit's two points: the far one first when the shape lies further round) and linked.
   Only faces turned toward the eye block (a ray always meets the front face first). Each stretch of outline that runs
   along a wall face also gets a strip pad px (default 5) deep into that wall (P.strips), so the face you see shows. */
const VIS_TOL = 2;
function clipBox(C, [X0, Y0, X1, Y1]) {      // a convex polygon cut to the box (Sutherland-Hodgman)
  for (const [ax, v, keep] of [[0, X0, 1], [0, X1, -1], [1, Y0, 1], [1, Y1, -1]]) {
    const out = [];
    for (let i = 0; i < C.length; i++) {
      const a = C[i], b = C[(i + 1) % C.length], ia = (a[ax] - v) * keep >= 0, ib = (b[ax] - v) * keep >= 0;
      if (ia) out.push(a);
      if (ia !== ib) { const t = (v - a[ax]) / (b[ax] - a[ax]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    C = out; if (C.length < 3) return null;
  }
  return C;
}
function visPoly(ex, ey, box, walls, pad) {
  const [X0, Y0, X1, Y1] = box, segs = [], corners = [], pd = pad || 5;
  let id = 0;
  const shape = (C, p) => {
    C = clipBox(C, box); if (!C) return; const n = C.length, sid = ++id, F = [];
    for (let i = 0; i < n; i++) {
      const [ax, ay] = C[i], [bx, by] = C[(i + 1) % n], L = Math.hypot(bx - ax, by - ay) || 1;
      F.push((ex - ax) * (by - ay) - (ey - ay) * (bx - ax) > 0 ? [ax, ay, bx, by, sid, p, (by - ay) / L, (ax - bx) / L] : null);   // front faces only
    }
    for (const f of F) if (f) segs.push(f);
    for (let i = 0; i < n; i++) corners.push([C[i], C[(i + n - 1) % n], C[(i + 1) % n], sid, F[(i + n - 1) % n], F[i]]);
  };
  for (const b of walls || MAP.sight) { const q = rectBox(b); if (!(q[0] > X1 || q[2] < X0 || q[1] > Y1 || q[3] < Y0)) shape(rectPts(b).map(p => p.slice()), pd); }
  const BC = [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]];
  for (let i = 0; i < 4; i++) { const [ax, ay] = BC[i], [bx, by] = BC[(i + 1) % 4]; segs.push([ax, ay, bx, by, 0, 0, 0, 0]); corners.push([BC[i], null, null, 0, null, null]); }
  const units = [];
  for (const [C, pv, nx, sid, fa, fb] of corners) {
    const dx = C[0] - ex, dy = C[1] - ey, dc = Math.hypot(dx, dy); if (dc < 0.01) continue;
    const ux = dx / dc, uy = dy / dc; let all = Infinity, ext = Infinity, eq = null;
    for (const q of segs) {
      const d = raySeg(ex, ey, ux, uy, q[0], q[1], q[2], q[3]); if (d === Infinity) continue;
      if (d < all) all = d;
      if (q[4] !== sid && d > dc - VIS_TOL && d < ext) { ext = d; eq = q; }
    }
    if (all < dc - VIS_TOL) continue;                                       // hidden: dropped
    const t = Math.atan2(dy, dx), cv = [C[0], C[1], 1, fa, fb];
    let side = 0;
    if (pv) { const s1 = dx * (pv[1] - C[1]) - dy * (pv[0] - C[0]), s2 = dx * (nx[1] - C[1]) - dy * (nx[0] - C[0]); if (s1 * s2 >= 0 && (s1 || s2)) side = Math.sign(s1 + s2); }
    if (!side || !eq || ext <= dc + VIS_TOL) { units.push([t, [cv]]); continue; }   // inner corner, a box corner, or another shape touches it
    const hv = [ex + ux * ext, ey + uy * ext, 0, eq.length > 5 && eq[5] ? eq : null, null];
    units.push([t, side > 0 ? [hv, cv] : [cv, hv]]);                        // shape further round: the far point first
  }
  units.sort((a, b) => a[0] - b[0]);
  const P = []; for (const [, vs] of units) for (const v of vs) P.push(v);
  // the strips: an outline edge whose two ends lie on the same wall face
  // (geometric: a corner of one wall can sit on another wall's face)
  const strips = [], on = (v, f) => { const sx = f[2] - f[0], sy = f[3] - f[1], L2 = sx * sx + sy * sy || 1, t = clamp(((v[0] - f[0]) * sx + (v[1] - f[1]) * sy) / L2, 0, 1); return Math.hypot(f[0] + sx * t - v[0], f[1] + sy * t - v[1]) < 0.5; };
  const EF = [];       // the wall face each outline edge runs along (or none)
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], f = [a[3], a[4], b[3], b[4]].find(f => f && f[5] && on(a, f) && on(b, f)) || segs.find(f => f[5] && on(a, f) && on(b, f)); EF.push(f || null);
  }
  // a strip's very ends (no wall face beyond them) are cut at 45 degrees, not square
  for (let i = 0, n = P.length; i < n; i++) {
    const f = EF[i]; if (!f) continue;
    const a = P[i], b = P[(i + 1) % n], k = f[5], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L;
    const e0 = EF[(i + n - 1) % n] ? 0 : 1, e1 = EF[(i + 1) % n] ? 0 : 1, c = Math.min(k, L / ((e0 + e1) || 1)), s0 = e0 * c, s1 = e1 * c, d = e0 + e1 ? c : k;   // a short edge: a shallower strip, still 45
    strips.push([[a[0], a[1]], [b[0], b[1]], [b[0] - f[6] * d - tx * s1, b[1] - f[7] * d - ty * s1], [a[0] - f[6] * d + tx * s0, a[1] - f[7] * d + ty * s0]]);
  }
  // where the outline turns from one wall face to another (a room's corner), the square between their strips too
  for (let i = 0; i < P.length; i++) {
    const f = EF[(i + P.length - 1) % P.length], g = EF[i], v = P[i]; if (!f || !g || f === g || Math.abs(f[6] * g[7] - f[7] * g[6]) < 0.5) continue;
    const k = Math.min(f[5], g[5]), [x, y] = v; strips.push([[x, y], [x - f[6] * k, y - f[7] * k], [x - (f[6] + g[6]) * k, y - (f[7] + g[7]) * k], [x - g[6] * k, y - g[7] * k]]);
  }
  const out = P.map(v => v[2] ? [v[0], v[1], 1] : [v[0], v[1]]); out.strips = strips; out.faces = segs;   // [x, y, 1] = a corner
  return out;
}
/* the box sight is worked out in: the view and every eye (an eye off screen, aiming far, still sees in: from outside the
   box every ray met its near edge first, and nothing showed) */
function sightBox(x0, y0, x1, y1, eyes) {
  const B = [x0 - 16, y0 - 16, x1 + 16, y1 + 16];
  for (const e of eyes) { const x = e.x !== undefined ? e.x : e[0], y = e.y !== undefined ? e.y : e[1]; B[0] = Math.min(B[0], x - 16); B[1] = Math.min(B[1], y - 16); B[2] = Math.max(B[2], x + 16); B[3] = Math.max(B[3], y + 16); }
  return B;
}
function inPoly(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
/* the sight polygons and their wall strips as one path, all wound the same way, so a nonzero fill / clip is their union */
function polyPath(g, polys) { if (g.beginPath) g.beginPath(); for (const P of polys) { pathPos(g, P); if (P.strips) for (const S of P.strips) pathPos(g, S); } }
function fogMemory(vw) {
  M.fogMem = M.fogMem || {};
  const key = vw.p ? 'p' + vw.p.id : 'shared';
  let m = M.fogMem[key];
  if (!m) {
    FOGK = MAP.houses.length ? 1 : 0.5;
    const c = mkG(Math.ceil(WW * FOGK), Math.ceil(WH * FOGK)), g = c.getContext('2d');
    g.setTransform(FOGK, 0, 0, FOGK, 0, 0); g.drawImage(ground, 0, 0); g.drawImage(decals, 0, 0);
    if (MAP.houses.length) g.drawImage(ROOF_C, 0, 0);      // houses you've never looked into: roofed
    m = M.fogMem[key] = { key, c, g, st: new Map(), arc: new Map() };     // the heights as last seen: the light's (memOf)
  }
  return m;
}
/* screen-sized scratch canvases: the remembered world (OUT), the low-res soft mask (smoke + windows; a second one for a
   second eye) and a temp */
const FOG_OUT = mkG(1, 1), FOG_TMP = mkG(1, 1), FOG_NOW = mkG(1, 1), FOG_MASK = document.createElement('canvas'), FOG_MASK2 = document.createElement('canvas'), FOG_MS = 10;
FOG_OUT.opq = true;     // always covered whole (applyFog: the memory and the skirt round the map): a multiply onto it is one pass
function fogCanvases() {
  if (FOG_OUT.width !== cv.width || FOG_OUT.height !== cv.height) {
    FOG_OUT.width = FOG_TMP.width = cv.width; FOG_OUT.height = FOG_TMP.height = cv.height;
    FOG_MASK.width = FOG_MASK2.width = Math.ceil(cv.width / FOG_MS) + 2; FOG_MASK.height = FOG_MASK2.height = Math.ceil(cv.height / FOG_MS) + 2;
  }
}
/* builds the remembered world for the whole view (FOG_OUT; laid over what's out of sight last, fogOverlay). In the dev yard the roof is remembered over the ground: whole, as it stands (ROOF_C), so out of
   sight a house is only ever its roof as you last saw it, never its walls or a fade. The remembered view (FOG_OUT, what
   smoke and windows let show through in sight too) has the roofs; in sight it's the world as it is now, the dev yard's
   roof as you see it (rv, faded round you), so smoke in a room never shows the roof.
   Returns the sight polygons, or null when vision is off. */
function applyFog(vw, vis, x0, y0, x1, y1, rv) {
  vw._fog = null;
  const eyes = fogEyes(vw); if (!eyes.length) return null;
  const box = sightBox(x0, y0, x1, y1, eyes), polys = eyes.map(([x, y]) => visPoly(x, y, box, null, MAP.houses.length ? SUB / 2 : 5)), m = fogMemory(vw);   // dev yard: strips half a wall deep, so the wall you look at shows
  // remember what is in sight now, roofs and all
  const bx0 = Math.max(0, Math.floor(x0)), by0 = Math.max(0, Math.floor(y0)), bx1 = Math.min(WW, Math.ceil(x1)), by1 = Math.min(WH, Math.ceil(y1)), bw = bx1 - bx0, bh = by1 - by0;
  if (bw > 0 && bh > 0 && (CFG.fogQ !== 'low' || (vw._fmF = (vw._fmF || 0) + 1) & 1)) {     // FOG QUALITY LOW: every other frame
    // built whole first, then laid in with one clipped draw: layer by layer, the clip's soft edge let each lower layer
    // (walls, floors) leak a little through the roof along every sight ray, and it built up as you moved
    if (FOG_NOW.width < bw || FOG_NOW.height < bh) { FOG_NOW.width = Math.max(FOG_NOW.width, bw); FOG_NOW.height = Math.max(FOG_NOW.height, bh); }
    const n = FOG_NOW.getContext('2d'); n.setTransform(1, 0, 0, 1, 0, 0);
    stackImg(n, [ground, decals], bx0, by0, bw, bh, 0, 0, bw, bh);
    if (MAP.houses.length) n.drawImage(ROOF_C, bx0, by0, bw, bh, 0, 0, bw, bh);
    if (smokeAny() || MAP.glass.length) fogCut(n, eyes, box, bx0, by0, bw, bh);
    pipe('fog-now'); m.g.save(); m.g.setTransform(FOGK, 0, 0, FOGK, 0, 0); polyPath(m.g, polys); m.g.clip();
    m.g.drawImage(FOG_NOW, 0, 0, bw, bh, bx0, by0, bw, bh); m.g.restore();
  }
  pipe('fog-mem'); const seen = (x, y) => polys.some(P => inPoly(x, y, P)) && eyes.some(([ex, ey]) => 1 - softOcc(ex, ey, x, y) >= SIGHT_MIN);
  for (const s of MAP.statics) if (vis(s.x, s.y, 20) && (s.type === 'fence' || s.type === 'hay' || s.type === 'tree') && seen(s.x, s.y)) m.st.set(s, s.alive);
  for (const A of MAP.arcs) if (vis(A.x, A.y, 40) && seen(A.x, A.y)) m.arc.set(A, A.lost);
  // the remembered world goes into an offscreen layer, so smoke can reuse it later
  fogCanvases();
  const main = ctx; ctx = FOG_OUT.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0);
  worldT(); ctx.imageSmoothingEnabled = false;
  if (bw > 0 && bh > 0) { ctx.imageSmoothingEnabled = FOGK < 1; ctx.drawImage(m.c, bx0 * FOGK, by0 * FOGK, bw * FOGK, bh * FOGK, bx0, by0, bw, bh); ctx.imageSmoothingEnabled = false; }
  if (bw > 0 && bh > 0 && MAP.houses.length) {
    ctx.save(); polyPath(ctx, polys); ctx.clip(); stackImg(ctx, [ground, decals], bx0, by0, bw, bh, bx0, by0, bw, bh);
    if (rv) ctx.drawImage(rv.c, 0, 0, rv.w, rv.h, rv.x, rv.y, rv.w, rv.h);
    ctx.restore(); worldT();
  }
  pipe('fog-out'); for (const A of MAP.arcs) { if (!vis(A.x, A.y, 50)) continue; const lost = m.arc.has(A) ? m.arc.get(A) : 0, f = lost / A.bags.length; spr(f < 0.25 ? 'bagarc0' : f < 0.75 ? 'bagarc1' : 'bagarc2', A.x, A.y, A.a); }
  for (const w of M.wrecks) if (vis(w.x, w.y, 70)) drawWreck(w);      // remembered like the statics
  worldT();
  for (const s of MAP.statics) {
    if ((s.type !== 'fence' && s.type !== 'hay') || !vis(s.x, s.y, 16) || !(m.st.has(s) ? m.st.get(s) : true)) continue;
    if (s.type === 'fence') { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); ctx.fillStyle = CFG.style === 'grit' ? '#5a4632' : '#8a6a42'; ctx.fillRect(-7, -1, 14, 2.5); ctx.fillStyle = CFG.style === 'grit' ? '#3e3022' : '#5e4428'; ctx.fillRect(-2, -3, 4, 6); ctx.restore(); }
    else { ctx.fillStyle = CFG.style === 'grit' ? '#857344' : '#c8a64e'; ctx.beginPath(); ctx.arc(s.x, s.y, 13, 0, TAU); ctx.fill(); }
  }
  for (const s of MAP.statics) if (s.type === 'tree' && vis(s.x, s.y, 40) && (m.st.has(s) ? m.st.get(s) : true)) { img(s.pine ? SPR.pines[s.v] : SPR.trees[s.v], s.x, s.y, s.a, s.sc, 0.94); worldT(); }
  pipe('fog-things'); ctx.setTransform(1, 0, 0, 1, 0, 0); fogLook(ctx, vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR); ctx.save(); ctx.beginPath(); ctx.rect(vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR); ctx.clip(); worldT(); fogEdge(ctx, polys); ctx.restore();
  ctx = main; worldT();
  vw._fog = { polys, eyes, box };
  return polys;
}
/* what smoke and windows hide (softMask, every eye: seen by either counts) taken out of the world as it is now (n: world
   px from bx0, by0), so the memory keeps what it had there: tread marks laid in smoke aren't remembered till seen */
const MEM_MASK = document.createElement('canvas'), MEM_MASK2 = document.createElement('canvas');
function fogCut(n, eyes, box, bx0, by0, bw, bh) {
  const w = Math.ceil(bw / FOG_MS) + 2, h = Math.ceil(bh / FOG_MS) + 2, k = 1 / FOG_MS;
  const prep = c => { if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); } const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(k, 0, 0, k, 1 - bx0 * k, 1 - by0 * k); return g; };
  const mg = prep(MEM_MASK); if (!softMask(mg, eyes[0][0], eyes[0][1], box)) return;
  for (let i = 1; i < eyes.length; i++) { softMask(prep(MEM_MASK2), eyes[i][0], eyes[i][1], box); mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalCompositeOperation = 'destination-in'; mg.drawImage(MEM_MASK2, 0, 0); mg.globalCompositeOperation = 'source-over'; }
  n.globalCompositeOperation = 'destination-out'; n.imageSmoothingEnabled = true; n.drawImage(MEM_MASK, 0, 0, w, h, -FOG_MS, -FOG_MS, w * FOG_MS, h * FOG_MS);
  n.globalCompositeOperation = 'source-over'; n.imageSmoothingEnabled = false; pipe('fog-cut');
}
/* the remembered view (FOG_OUT) lit as now: the memory's shade map (drawSun, map 3: the sun or the night, from what the
   memory keeps) multiplied in, once a frame, before anything shows it (smoke and windows in sight, out of sight alike) */
function fogShade(vw) {
  const F = vw._fog, S = _sun; if (GL || !F || F.lit || !SUNNOW || !S || !S.fog) return; F.lit = true;     // GL: as it's drawn (fogLit)
  const g = FOG_OUT.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'multiply'; g.imageSmoothingEnabled = true; g.drawImage(S.GC, ...S.fog); g.globalCompositeOperation = 'source-over'; pipe('ov-shade');
}
/* the remembered world over everything out of sight, last: FOG_OUT, shaded as remembered, with a hole cut where you see
   (H: the sight polygons + the roofs, always known). The world under it was drawn whole, nothing clipped: one plain fill
   makes the edge. The shade: the memory's shade map (drawSun: lit now, from the heights as last seen, memOf; no point
   lights) */
function fogOverlay(vw, H) {
  const g = FOG_TMP.getContext('2d'), X = vw.x * DPR, Y = vw.y * DPR, Wd = vw.w * DPR, Ht = vw.h * DPR;
  if (ctx.clipOut) { ctx.save(); ctx.clipOut(H); ctx.setTransform(1, 0, 0, 1, 0, 0); fogLit(() => ctx.drawImage(FOG_OUT, X, Y, Wd, Ht, X, Y, Wd, Ht)); ctx.restore(); worldT(); pipe('ov-draw'); return; }     // GL: straight on, outside the hole
  fogShade(vw); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(X, Y, Wd, Ht); g.drawImage(FOG_OUT, X, Y, Wd, Ht, X, Y, Wd, Ht); pipe('ov-copy');
  g.globalCompositeOperation = 'destination-out'; g.setTransform(ctx.getTransform()); g.fillStyle = '#000'; g.fill(H);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; pipe('ov-hole');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(FOG_TMP, X, Y, Wd, Ht, X, Y, Wd, Ht); worldT(); pipe('ov-draw');
}
/* a unit counts for the view if any drawn part of it, or that part's shadow, reaches the sight: drawn and casting.
   Each part is a circle round its whole sprite, swept away from the sun by its own shadow's length (its top / tan of
   the sun's height). Further out it's left out, drawn nowhere (the memory covers there) */
const _snp = [];
function sightParts(o) {         // [x, y, r, shadow length] per part
  const k = SUNNOW ? 1 / Math.tan(sunEl()) : 0; _snp.length = 0;
  for (const q of partsOf(o)) { const m = ATLAS[q.n]; if (m) _snp.push([q.x, q.y, Math.hypot(Math.max(m[4], m[2] - m[4]), Math.max(m[5], m[3] - m[5])), (q.b + q.add + artMax(q.n)) * k]); }
  return _snp;
}
function circleSeen(F, x, y, r) {         // does a circle touch any sight polygon (inside it or across an edge)
  const r2 = r * r;
  for (const P of F.polys) {
    const B = P._bb || (P._bb = P.reduce((b, [px, py]) => [Math.min(b[0], px), Math.min(b[1], py), Math.max(b[2], px), Math.max(b[3], py)], [1e9, 1e9, -1e9, -1e9]));
    if (x + r < B[0] || x - r > B[2] || y + r < B[1] || y - r > B[3]) continue;
    if (inPoly(x, y, P)) return true;
    for (let a = 0, b = P.length - 1; a < P.length; b = a++) {
      const [ax, ay] = P[b], dx = P[a][0] - ax, dy = P[a][1] - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1), ex = ax + dx * t - x, ey = ay + dy * t - y;
      if (ex * ex + ey * ey < r2) return true;
    }
  }
  return false;
}
function sightNear(vw, o) {
  const F = vw && vw._fog; if (!F) return true;
  const ux = -Math.cos(SUN.az), uy = -Math.sin(SUN.az);     // the shadow falls away from the sun
  for (const [x, y, r, L] of sightParts(o)) for (let t = 0; ; t = Math.min(L, t + Math.max(r, 4))) { if (circleSeen(F, x + ux * t, y + uy * t, r)) return true; if (t >= L) break; }
  return false;
}
/* the out-of-sight look (settings › FOG OF WAR): drained of colour (fogD %) and dimmed (fogK %) all over, plus a shadow
   along the edge of sight (fogE %) fading out over fogW screen px (fogEdge). The region of g must be opaque (a blend mode
   paints on transparent pixels). Presets: FOG_PRESETS (1_core) */
function fogLook(g, x, y, w, h) {
  if (g.withMatrix) return;     // GL: laid on as FOG_OUT is drawn (fogMatrix), no passes of its own
  if (CFG.fogD > 0) { g.globalCompositeOperation = 'saturation'; g.globalAlpha = CFG.fogD / 100; g.fillStyle = '#808080'; g.fillRect(x, y, w, h); g.globalAlpha = 1; pipe('look-sat'); }
  g.globalCompositeOperation = 'source-over'; if (CFG.fogK > 0) { g.fillStyle = `rgba(4,7,6,${(CFG.fogK / 100).toFixed(3)})`; g.fillRect(x, y, w, h); pipe('look-dark'); }
}
/* fogLook as one colour matrix (GL: FOG_OUT drawn through it, withMatrix): greyed toward its luminance by fogD (the
   saturation blend's weights), then toward the dark by fogK */
let _fogCM = null, _fogCMk = '';
function fogMatrix() {
  const a = CFG.fogD > 0 ? CFG.fogD / 100 : 0, k = CFG.fogK > 0 ? CFG.fogK / 100 : 0, key = a + ',' + k; if (key === _fogCMk) return _fogCM;
  const W = [0.3, 0.59, 0.11], m = new Float32Array(9);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) m[j * 3 + i] = (1 - k) * ((i === j ? 1 - a : 0) + a * W[j]);     // column j, row i
  _fogCMk = key; return _fogCM = { m, b: [4, 7, 6].map(v => k * v / 255) };
}
/* FOG_OUT onto the screen as fogLook, then fogShade, would leave it (GL): fn's draws through the matrix and the memory's shade */
function fogLit(fn) { const L = fogMatrix(), S = _sun; ctx.withMatrix(L.m, L.b, SUNNOW && S && S.fog ? [S.GC, ...S.fog] : null, fn); }
/* the edge shadow: the sight polygons' outlines stroked in rings, widest first, each a little dark, so it's fogE at the
   edge and gone fogW px out (inside, it's in sight, where this layer never shows). g has the world transform */
function fogEdge(g, polys) {
  if (!(CFG.fogE > 0) || !polys.length) return;
  const n = CFG.fogQ === 'low' ? 3 : 6, a = 1 - Math.pow(1 - CFG.fogE / 100, 1 / n);     // FOG QUALITY LOW: half the rings
  g.beginPath(); for (const P of polys) P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)), g.closePath();
  g.lineJoin = 'round'; g.strokeStyle = `rgba(2,4,3,${a.toFixed(3)})`;
  for (let i = n; i >= 1; i--) { g.lineWidth = 2 * CFG.fogW * i / n / VZ; g.stroke(); }
}
/* adds polygon P to g's path wound like arc() (positive), so overlapping parts of one nonzero fill cover once */
function pathPos(g, P) {
  let A = 0; for (let i = 0; i < P.length; i++) A += P[i][0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * P[i][1];
  if (A < 0) P = P.slice().reverse();
  P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
}
/* one eye's soft occlusion as alpha on mask g (world transform set), the same sums softOcc makes:
   the smoke field (fieldMask), thinned close to the eye (SIGHT_NEAR);
   then each window, GLASS_OCC over itself and everything behind it (only windows in the view box: one outside it shadows
   only what's further out). Layers add (lighter). Returns whether anything. */
function softMask(g, ex, ey, box) {
  const FAR = 5000; let any = false; g.fillStyle = '#fff'; g.globalCompositeOperation = 'lighter';
  if (M.gsf && M.gsf.act.length) any = fieldMask(g, ex, ey, box) || any;
  if (any) {   // close to the eye smoke thins out: keep (d - near0) / (near1 - near0) of it
    const [n0, n1] = SIGHT_NEAR, hb = g.createRadialGradient(ex, ey, 0, ex, ey, n1); hb.addColorStop(0, 'rgba(0,0,0,1)'); hb.addColorStop(n0 / n1, 'rgba(0,0,0,1)'); hb.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 1; g.fillStyle = hb; g.beginPath(); g.arc(ex, ey, n1, 0, TAU); g.fill();
    g.globalCompositeOperation = 'lighter'; g.fillStyle = '#fff';
  }
  g.globalAlpha = GLASS_OCC;
  for (const b of MAP.glass) {
    const q = rectBox(b); if (q[0] > box[2] || q[2] < box[0] || q[1] > box[3] || q[3] < box[1] || inRect(ex, ey, b)) continue; any = true;
    const C = rectPts(b), out = ([x, y]) => { const L = Math.hypot(x - ex, y - ey) || 1; return [x + (x - ex) / L * FAR, y + (y - ey) / L * FAR]; };
    g.beginPath(); pathPos(g, C);
    for (let i = 0; i < 4; i++) { const a = C[i], q = C[(i + 1) % 4]; if ((ex - a[0]) * (q[1] - a[1]) - (ey - a[1]) * (q[0] - a[0]) > 0) pathPos(g, [a, q, out(q), out(a)]); }   // behind each face turned to the eye
    g.fill();
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return any;
}
/* the grid smoke field on the mask: each cell of the box gets fieldOcc of the sight line to its centre, drawn a cell a
   pixel and smoothed (added to the mask). A cell is a smoke tile (FOG QUALITY LOW: 2 x 2 of them, a quarter of the rays).
   Lines that miss the smoke's tiles cost next to nothing. Kept for the frame per eye (fogCut and drawSoftFog both want it) */
const SMK_MC = [];
function fieldMask(g, ex, ey, box) {
  const G = CFG.fogQ === 'low' ? GS * 2 : GS, i0 = Math.floor(box[0] / G), j0 = Math.floor(box[1] / G), w = Math.ceil(box[2] / G) - i0 + 1, h = Math.ceil(box[3] / G) - j0 + 1;
  const key = ex + ',' + ey + ',' + i0 + ',' + j0 + ',' + w + ',' + h + ',' + G + ',' + M.time;
  let e = SMK_MC.find(e => e.key === key);
  if (!e) {
    e = SMK_MC.find(e => e.t !== M.time) || (SMK_MC[SMK_MC.length] = { c: document.createElement('canvas') });
    const c = e.c; e.key = key; e.t = M.time;
    if (c.width < w || c.height < h) { c.width = Math.max(w, c.width); c.height = Math.max(h, c.height); c.im = null; }
    const mg = c.getContext('2d'), im = c.im || (c.im = mg.createImageData(c.width, c.height)), d = im.data, Wm = c.width; let any = false; d.fill(0);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const v = fieldOcc(ex, ey, (i0 + i + 0.5) * G, (j0 + j + 0.5) * G), o = (j * Wm + i) * 4;
      d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = v * 255; if (v) any = true;
    }
    e.any = any; if (any) mg.putImageData(im, 0, 0);     // all of it (smoothing reads past the drawn part's edge)
  }
  if (!e.any) return false;
  const sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = true; g.globalAlpha = 1; g.drawImage(e.c, 0, 0, w, h, i0 * G, j0 * G, w * G, h * G); g.imageSmoothingEnabled = sm;
  return true;
}
/* the soft layers in the vision fog: the remembered view shows through the mask (smoke + windows) inside your sight.
   The hard layer (walls) is the clip around it, so the three never fight: out of sight is 100 % remembered,
   in sight it's the soft sum. Two eyes in one view: each one's mask, multiplied (seen well by either = seen well).
   The mask is low-res (1/FOG_MS); upscaling it softens the edges. Its pixels sit on a grid fixed to the world (the
   leftover fraction is a shift when it's drawn), so moving doesn't make its edges swim. */
function drawSoftFog(vw) {
  const F = vw._fog; if (!F || (!smokeAny() && !MAP.glass.length)) return;
  const k = VZ * DPR / FOG_MS, ox = VOX * DPR / FOG_MS, oy = VOY * DPR / FOG_MS, mx = Math.floor(ox) + 1, my = Math.floor(oy) + 1;
  const prep = c => { const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(k, 0, 0, k, mx, my); return g; };
  const mg = prep(FOG_MASK); if (!softMask(mg, F.eyes[0][0], F.eyes[0][1], F.box)) return;
  for (let i = 1; i < F.eyes.length; i++) {
    softMask(prep(FOG_MASK2), F.eyes[i][0], F.eyes[i][1], F.box);
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalCompositeOperation = 'destination-in'; mg.drawImage(FOG_MASK2, 0, 0); mg.globalCompositeOperation = 'source-over';
  }
  // remembered world, cut to the soft mask
  fogShade(vw); const tg = FOG_TMP.getContext('2d'), X = vw.x * DPR, Y = vw.y * DPR, Wd = vw.w * DPR, Ht = vw.h * DPR;
  if (ctx.maskedImage) { ctx.setTransform(1, 0, 0, 1, 0, 0); fogLit(() => ctx.maskedImage(FOG_OUT, X, Y, Wd, Ht, X, Y, Wd, Ht, FOG_MASK, (ox - mx) * FOG_MS, (oy - my) * FOG_MS, FOG_MASK.width * FOG_MS, FOG_MASK.height * FOG_MS)); worldT(); return; }     // GL: in one pass
  tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over'; tg.clearRect(X, Y, Wd, Ht);
  tg.drawImage(FOG_OUT, X, Y, Wd, Ht, X, Y, Wd, Ht);
  tg.globalCompositeOperation = 'destination-in'; tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
  tg.drawImage(FOG_MASK, 0, 0, FOG_MASK.width, FOG_MASK.height, (ox - mx) * FOG_MS, (oy - my) * FOG_MS, FOG_MASK.width * FOG_MS, FOG_MASK.height * FOG_MS);
  tg.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(FOG_TMP, X, Y, Wd, Ht, X, Y, Wd, Ht); worldT();
}
