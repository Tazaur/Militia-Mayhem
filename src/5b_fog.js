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
  return t > 0 && u >= 0 && u <= 1 ? t : Infinity;
}
/* what the eye at (ex, ey) can see inside box [x0, y0, x1, y1], as an exact polygon. Only faces turned toward the eye
   count (a ray always meets the front face first), and rays go only where the outline can bend: a hair either side of
   each of their corners, and to the box's corners. A ray that hits a wall goes pad px (default 5) straight in through
   that face, so the near side of the wall shows; a ray that slips past a corner gets the corner itself as a point,
   so the shadow edge runs exactly from it. */
const VIS_EPS = 0.0004;
function visPoly(ex, ey, box, walls, pad) {
  const [X0, Y0, X1, Y1] = box, segs = [], rays = [], pd = pad || 5;
  const face = (ax, ay, bx, by, p) => {
    if ((ex - ax) * (by - ay) - (ey - ay) * (bx - ax) <= 0) return;       // turned away
    const L = Math.hypot(bx - ax, by - ay) || 1; segs.push([ax, ay, bx, by, (by - ay) / L * p, (ax - bx) / L * p]);
    for (const [x, y] of [[ax, ay], [bx, by]]) { const t = Math.atan2(y - ey, x - ex), d = Math.hypot(x - ex, y - ey); rays.push([t - VIS_EPS, x, y, d, -1], [t + VIS_EPS, x, y, d, 1]); }
  };
  for (const b of walls || MAP.sight) {
    if (b.x > X1 || b.x + b.w < X0 || b.y > Y1 || b.y + b.h < Y0) continue;
    face(b.x, b.y, b.x + b.w, b.y, pd); face(b.x + b.w, b.y, b.x + b.w, b.y + b.h, pd); face(b.x + b.w, b.y + b.h, b.x, b.y + b.h, pd); face(b.x, b.y + b.h, b.x, b.y, pd);
  }
  for (const w of M.wrecks) {
    const m = w.hl + w.hw; if (w.x - m > X1 || w.x + m < X0 || w.y - m > Y1 || w.y + m < Y0) continue;
    const c = Math.cos(w.a), s = Math.sin(w.a), P = [[-w.hl, -w.hw], [w.hl, -w.hw], [w.hl, w.hw], [-w.hl, w.hw]].map(([x, y]) => [w.x + x * c - y * s, w.y + x * s + y * c]);
    for (let i = 0; i < 4; i++) face(P[i][0], P[i][1], P[(i + 1) % 4][0], P[(i + 1) % 4][1], Math.min(pd, 5));
  }
  const bs = [[X0, Y0, X1, Y0], [X1, Y0, X1, Y1], [X1, Y1, X0, Y1], [X0, Y1, X0, Y0]];
  for (const q of bs) { segs.push([q[0], q[1], q[2], q[3], 0, 0]); rays.push([Math.atan2(q[1] - ey, q[0] - ex), 0, 0, 0, 0]); }
  rays.sort((a, b) => a[0] - b[0]);
  const pts = [];
  for (const [t, cx, cy, cd, side] of rays) {
    const dx = Math.cos(t), dy = Math.sin(t); let best = Infinity, hq = null;
    for (const q of segs) { const d = raySeg(ex, ey, dx, dy, q[0], q[1], q[2], q[3]); if (d < best) { best = d; hq = q; } }
    if (!hq) continue;
    const hit = [ex + dx * best - hq[4], ey + dy * best - hq[5]], past = side && best > cd + 0.5;
    if (past && side > 0) pts.push([cx, cy]);
    pts.push(hit);
    if (past && side < 0) pts.push([cx, cy]);
  }
  return pts;
}
function inPoly(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
function polyPath(g, polys) { g.beginPath(); for (const P of polys) { P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); } }
function fogMemory(vw) {
  M.fogMem = M.fogMem || {};
  const key = vw.p ? 'p' + vw.p.id : 'shared';
  let m = M.fogMem[key];
  if (!m) {
    FOGK = MAP.tiled ? 1 : 0.5;
    const c = mk(Math.ceil(WW * FOGK), Math.ceil(WH * FOGK)), g = c.getContext('2d');
    g.setTransform(FOGK, 0, 0, FOGK, 0, 0); g.drawImage(ground, 0, 0); g.drawImage(decals, 0, 0);
    if (MAP.tiled && MAP.tiled.roof) g.drawImage(ROOF_C, 0, 0);      // houses you've never looked into: roofed
    m = M.fogMem[key] = { c, g, st: new Map(), arc: new Map() };
  }
  return m;
}
/* screen-sized scratch canvases: the remembered world (OUT), the low-res soft mask (smoke + windows; a second one for a
   second eye) and a temp */
const FOG_OUT = document.createElement('canvas'), FOG_TMP = document.createElement('canvas'), FOG_MASK = document.createElement('canvas'), FOG_MASK2 = document.createElement('canvas'), FOG_MS = 10;
function fogCanvases() {
  if (FOG_OUT.width !== cv.width || FOG_OUT.height !== cv.height) {
    FOG_OUT.width = FOG_TMP.width = cv.width; FOG_OUT.height = FOG_TMP.height = cv.height;
    FOG_MASK.width = FOG_MASK2.width = Math.ceil(cv.width / FOG_MS); FOG_MASK.height = FOG_MASK2.height = Math.ceil(cv.height / FOG_MS);
  }
}
/* draws the remembered world for the whole view, then clips everything after it to what's in sight (the hard layer:
   walls and wrecks). rv: this frame's roofs as you see them (roofView), remembered with the ground under them.
   Returns the sight polygons (caller restores the clip), or null when vision is off. */
function applyFog(vw, vis, x0, y0, x1, y1, rv) {
  vw._fog = null;
  const eyes = fogEyes(vw); if (!eyes.length) return null;
  const box = [x0 - 16, y0 - 16, x1 + 16, y1 + 16], polys = eyes.map(([x, y]) => visPoly(x, y, box, null, MAP.tiled ? SUB : 5)), m = fogMemory(vw);   // dev yard: a whole cell in, so the wall you look at shows
  // remember what is in sight now, roofs and all
  const bx0 = Math.max(0, Math.floor(x0)), by0 = Math.max(0, Math.floor(y0)), bx1 = Math.min(WW, Math.ceil(x1)), by1 = Math.min(WH, Math.ceil(y1)), bw = bx1 - bx0, bh = by1 - by0;
  if (bw > 0 && bh > 0) {
    m.g.save(); m.g.setTransform(FOGK, 0, 0, FOGK, 0, 0); polyPath(m.g, polys); m.g.clip();
    m.g.drawImage(ground, bx0, by0, bw, bh, bx0, by0, bw, bh); m.g.drawImage(decals, bx0, by0, bw, bh, bx0, by0, bw, bh);
    if (rv) m.g.drawImage(rv.c, 0, 0, rv.w, rv.h, rv.x, rv.y, rv.w, rv.h);
    m.g.restore();
  }
  const seen = (x, y) => polys.some(P => inPoly(x, y, P)) && eyes.some(([ex, ey]) => 1 - softOcc(ex, ey, x, y) >= SIGHT_MIN);
  for (const s of MAP.statics) if (vis(s.x, s.y, 20) && (s.type === 'fence' || s.type === 'hay' || s.type === 'tree') && seen(s.x, s.y)) m.st.set(s, s.alive);
  for (const A of MAP.arcs) if (vis(A.x, A.y, 40) && seen(A.x, A.y)) m.arc.set(A, A.lost);
  // the remembered world goes into an offscreen layer, so smoke can reuse it later
  fogCanvases();
  const main = ctx; ctx = FOG_OUT.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR);
  ctx.fillStyle = '#0c140a'; ctx.fillRect(vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR);
  worldT(); ctx.imageSmoothingEnabled = false; drawSkirt(x0, y0, x1, y1);
  if (bw > 0 && bh > 0) { ctx.imageSmoothingEnabled = FOGK < 1; ctx.drawImage(m.c, bx0 * FOGK, by0 * FOGK, bw * FOGK, bh * FOGK, bx0, by0, bw, bh); ctx.imageSmoothingEnabled = false; }
  for (const A of MAP.arcs) { if (!vis(A.x, A.y, 50)) continue; const lost = m.arc.has(A) ? m.arc.get(A) : 0, f = lost / A.bags.length; spr(f < 0.25 ? 'bagarc0' : f < 0.75 ? 'bagarc1' : 'bagarc2', A.x, A.y, A.a); }
  for (const w of M.wrecks) if (vis(w.x, w.y, 70)) drawWreck(w);      // they block sight, so they stay drawn where you can't see
  worldT();
  for (const s of MAP.statics) {
    if ((s.type !== 'fence' && s.type !== 'hay') || !vis(s.x, s.y, 16) || !(m.st.has(s) ? m.st.get(s) : true)) continue;
    if (s.type === 'fence') { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); ctx.fillStyle = CFG.style === 'grit' ? '#5a4632' : '#8a6a42'; ctx.fillRect(-7, -1, 14, 2.5); ctx.fillStyle = CFG.style === 'grit' ? '#3e3022' : '#5e4428'; ctx.fillRect(-2, -3, 4, 6); ctx.restore(); }
    else { ctx.fillStyle = CFG.style === 'grit' ? '#857344' : '#c8a64e'; ctx.beginPath(); ctx.arc(s.x, s.y, 13, 0, TAU); ctx.fill(); }
  }
  for (const s of MAP.statics) if (s.type === 'tree' && vis(s.x, s.y, 40) && (m.st.has(s) ? m.st.get(s) : true)) { img(s.pine ? SPR.pines[s.v] : SPR.trees[s.v], s.x, s.y, s.a, s.sc, 0.94); worldT(); }
  ctx.setTransform(1, 0, 0, 1, 0, 0); fogLook(ctx, vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR);
  ctx = main;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(FOG_OUT, vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR, vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR);
  vw._fog = { polys, eyes, box };
  // everything from here on is only drawn where you can see
  worldT(); ctx.save(); polyPath(ctx, polys); ctx.clip();
  return polys;
}
/* the out-of-sight look (setting OUT OF SIGHT): drained of colour fully / by half / not at all, and dimmed (more when
   only darkened). The region of g must be opaque (a blend mode paints on transparent pixels). */
const FOG_LOOKS = ['grey', 'partial', 'dark'];
function fogLook(g, x, y, w, h) {
  const L = CFG.fogLook || 'grey';
  if (L !== 'dark') { g.globalCompositeOperation = 'saturation'; g.globalAlpha = L === 'partial' ? 0.5 : 1; g.fillStyle = '#808080'; g.fillRect(x, y, w, h); g.globalAlpha = 1; }
  g.globalCompositeOperation = 'source-over'; g.fillStyle = L === 'dark' ? 'rgba(4,6,8,0.42)' : CFG.style === 'grit' ? 'rgba(6,6,4,0.3)' : 'rgba(4,8,6,0.22)'; g.fillRect(x, y, w, h);
}
/* adds polygon P to g's path wound like arc() (positive), so overlapping parts of one nonzero fill cover once */
function pathPos(g, P) {
  let A = 0; for (let i = 0; i < P.length; i++) A += P[i][0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * P[i][1];
  if (A < 0) P = P.slice().reverse();
  P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
}
/* one eye's soft occlusion as alpha on mask g (world transform set), the same sums softOcc makes:
   smoke ring by ring (SMOKE_RINGS): a ring's shadow is everything whose sight line passes within it, the disc plus the
   cone behind it between the tangents from the eye (inside a ring: the whole view), thinned close to the eye (SIGHT_NEAR);
   then each window, GLASS_OCC over itself and everything behind it (only windows in the view box: one outside it shadows
   only what's further out). Layers add (lighter). Returns whether anything. */
function softMask(g, ex, ey, box) {
  const FAR = 5000; let any = false; g.fillStyle = '#fff'; g.globalCompositeOperation = 'lighter';
  for (const c of M.smokes) {
    const s = smokeStr(c); if (!s || c.r < 1) continue; any = true;
    const d = Math.hypot(c.x - ex, c.y - ey), a0 = Math.atan2(c.y - ey, c.x - ex); let prev = 0;
    for (const [f, v] of SMOKE_RINGS) {
      const rho = f * c.r; g.globalAlpha = s * (v - prev); prev = v; g.beginPath();
      if (d <= rho) g.rect(ex - FAR, ey - FAR, FAR * 2, FAR * 2);
      else {
        const h = Math.asin(rho / d), tl = Math.sqrt(d * d - rho * rho);
        pathPos(g, [[a0 + h, tl], [a0 + h, FAR], [a0 - h, FAR], [a0 - h, tl]].map(([t, l]) => [ex + Math.cos(t) * l, ey + Math.sin(t) * l]));
        g.moveTo(c.x + rho, c.y); g.arc(c.x, c.y, rho, 0, TAU);
      }
      g.fill();
    }
  }
  if (any) {   // close to the eye smoke thins out: keep (d - near0) / (near1 - near0) of it
    const [n0, n1] = SIGHT_NEAR, hb = g.createRadialGradient(ex, ey, 0, ex, ey, n1); hb.addColorStop(0, 'rgba(0,0,0,1)'); hb.addColorStop(n0 / n1, 'rgba(0,0,0,1)'); hb.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 1; g.fillStyle = hb; g.beginPath(); g.arc(ex, ey, n1, 0, TAU); g.fill();
    g.globalCompositeOperation = 'lighter'; g.fillStyle = '#fff';
  }
  g.globalAlpha = GLASS_OCC;
  for (const b of MAP.glass) {
    if (b.x > box[2] || b.x + b.w < box[0] || b.y > box[3] || b.y + b.h < box[1] || inRect(ex, ey, b)) continue; any = true;
    const C = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]], out = ([x, y]) => { const L = Math.hypot(x - ex, y - ey) || 1; return [x + (x - ex) / L * FAR, y + (y - ey) / L * FAR]; };
    g.beginPath(); pathPos(g, C);
    for (let i = 0; i < 4; i++) { const a = C[i], q = C[(i + 1) % 4]; if ((ex - a[0]) * (q[1] - a[1]) - (ey - a[1]) * (q[0] - a[0]) > 0) pathPos(g, [a, q, out(q), out(a)]); }   // behind each face turned to the eye
    g.fill();
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return any;
}
/* the soft layers in the vision fog: the remembered view shows through the mask (smoke + windows) inside your sight.
   The hard layer (walls, wrecks) is the clip around it, so the three never fight: out of sight is 100 % remembered,
   in sight it's the soft sum. Two eyes in one view: each one's mask, multiplied (seen well by either = seen well).
   The mask is low-res (1/FOG_MS); upscaling it softens the edges. */
function drawSoftFog(vw) {
  const F = vw._fog; if (!F || (!M.smokes.length && !MAP.glass.length)) return;
  const k = VZ * DPR / FOG_MS, prep = c => { const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(k, 0, 0, k, VOX * DPR / FOG_MS, VOY * DPR / FOG_MS); return g; };
  const mg = prep(FOG_MASK); if (!softMask(mg, F.eyes[0][0], F.eyes[0][1], F.box)) return;
  for (let i = 1; i < F.eyes.length; i++) {
    softMask(prep(FOG_MASK2), F.eyes[i][0], F.eyes[i][1], F.box);
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalCompositeOperation = 'destination-in'; mg.drawImage(FOG_MASK2, 0, 0); mg.globalCompositeOperation = 'source-over';
  }
  // remembered world, cut to the soft mask
  const tg = FOG_TMP.getContext('2d'), X = vw.x * DPR, Y = vw.y * DPR, Wd = vw.w * DPR, Ht = vw.h * DPR;
  tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over'; tg.clearRect(X, Y, Wd, Ht);
  tg.drawImage(FOG_OUT, X, Y, Wd, Ht, X, Y, Wd, Ht);
  tg.globalCompositeOperation = 'destination-in'; tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
  tg.drawImage(FOG_MASK, 0, 0, FOG_MASK.width, FOG_MASK.height, 0, 0, FOG_MASK.width * FOG_MS, FOG_MASK.height * FOG_MS);
  tg.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(FOG_TMP, X, Y, Wd, Ht, X, Y, Wd, Ht); worldT();
}
