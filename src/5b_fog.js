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
/* what the eye at (ex, ey) can see out to R: the sight walls (MAP.sight, or `walls`) and wrecks (turned boxes) cut it.
   A ray that hits a face goes pad px (default 5) straight in through that face, so the near side of a wall shows
   (pushing along the ray instead slid along walls seen at a slant and cut them at odd angles) */
function visPoly(ex, ey, R, walls, pad) {
  const segs = [], angs = [];
  const edge = (ax, ay, bx, by) => { segs.push([ax, ay, bx, by]); const t = Math.atan2(ay - ey, ax - ex); angs.push(t - 0.0008, t + 0.0008); };
  for (const b of walls || MAP.sight) {
    if (b.x > ex + R || b.x + b.w < ex - R || b.y > ey + R || b.y + b.h < ey - R) continue;
    edge(b.x, b.y, b.x + b.w, b.y); edge(b.x + b.w, b.y, b.x + b.w, b.y + b.h); edge(b.x + b.w, b.y + b.h, b.x, b.y + b.h); edge(b.x, b.y + b.h, b.x, b.y);
  }
  for (const w of M.wrecks) {
    if (Math.abs(w.x - ex) > R + 80 || Math.abs(w.y - ey) > R + 80) continue;
    const c = Math.cos(w.a), s = Math.sin(w.a), P = [[-w.hl, -w.hw], [w.hl, -w.hw], [w.hl, w.hw], [-w.hl, w.hw]].map(([x, y]) => [w.x + x * c - y * s, w.y + x * s + y * c]);
    for (let i = 0; i < 4; i++) edge(P[i][0], P[i][1], P[(i + 1) % 4][0], P[(i + 1) % 4][1]);
  }
  for (let i = 0; i < 96; i++) angs.push(i / 96 * TAU - Math.PI);
  angs.sort((a, b) => a - b);
  const pts = [], pd = pad || 5;
  for (const t of angs) {
    const dx = Math.cos(t), dy = Math.sin(t); let best = R, hq = null;
    for (const q of segs) { const d = raySeg(ex, ey, dx, dy, q[0], q[1], q[2], q[3]); if (d < best) { best = d; hq = q; } }
    let x = ex + dx * best, y = ey + dy * best;
    if (hq) { const L = Math.hypot(hq[2] - hq[0], hq[3] - hq[1]) || 1, nx = (hq[3] - hq[1]) / L, ny = (hq[0] - hq[2]) / L, sg = nx * dx + ny * dy < 0 ? -1 : 1; x += nx * sg * pd; y += ny * sg * pd; }
    pts.push([x, y]);
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
    m = M.fogMem[key] = { c, g, st: new Map(), arc: new Map() };
    if (MAP.tiled && MAP.tiled.roof) { m.rc = mk(c.width, c.height); m.rg = m.rc.getContext('2d'); m.rg.setTransform(FOGK, 0, 0, FOGK, 0, 0); m.rg.drawImage(ROOF_G, 0, 0); }   // dev yard roofs, remembered the same way
  }
  return m;
}
/* screen-sized scratch canvases: the remembered world (OUT), a low-res soft mask for smoke shadows, and a temp */
const FOG_OUT = document.createElement('canvas'), FOG_TMP = document.createElement('canvas'), FOG_MASK = document.createElement('canvas'), FOG_MS = 6;
function fogCanvases() {
  if (FOG_OUT.width !== cv.width || FOG_OUT.height !== cv.height) {
    FOG_OUT.width = FOG_TMP.width = cv.width; FOG_OUT.height = FOG_TMP.height = cv.height;
    FOG_MASK.width = Math.ceil(cv.width / FOG_MS); FOG_MASK.height = Math.ceil(cv.height / FOG_MS);
  }
}
/* draws the remembered world for the whole view, then clips everything after it to what's in sight.
   Returns the sight polygons (caller restores the clip), or null when vision is off. */
function applyFog(vw, vis, x0, y0, x1, y1) {
  vw._fog = null;
  const eyes = fogEyes(vw); if (!eyes.length) return null;
  const R = Math.hypot(x1 - x0, y1 - y0) / 2 + 80, polys = eyes.map(([x, y]) => visPoly(x, y, R)), m = fogMemory(vw);
  // remember what is in sight now
  const bx0 = Math.max(0, Math.floor(x0)), by0 = Math.max(0, Math.floor(y0)), bx1 = Math.min(WW, Math.ceil(x1)), by1 = Math.min(WH, Math.ceil(y1)), bw = bx1 - bx0, bh = by1 - by0;
  if (bw > 0 && bh > 0) {
    m.g.save(); m.g.setTransform(FOGK, 0, 0, FOGK, 0, 0); polyPath(m.g, polys); m.g.clip();
    m.g.drawImage(ground, bx0, by0, bw, bh, bx0, by0, bw, bh); m.g.drawImage(decals, bx0, by0, bw, bh, bx0, by0, bw, bh); m.g.restore();
    if (m.rg) { m.rg.save(); polyPath(m.rg, polys); m.rg.clip(); m.rg.clearRect(bx0, by0, bw, bh); m.rg.drawImage(ROOF_G, bx0, by0, bw, bh, bx0, by0, bw, bh); m.rg.restore(); }
  }
  const seen = (x, y) => polys.some(P => inPoly(x, y, P)) && eyes.some(([ex, ey]) => 1 - smokeOcc(ex, ey, x, y) >= SIGHT_MIN);
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
  vw._fog = { polys, eye: eyes[0] };
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
/* smoke in the vision fog: the remembered view shows through by how much smoke each spot is behind, ring by ring
   (SMOKE_RINGS, the same rings bots see by). A ring's shadow is everything whose sight line passes within its radius:
   the disc plus the cone behind it between the tangents from the eye; standing inside a ring puts the whole view behind it.
   Rings add (lighter) on a low-res mask; upscaling it softens the steps. */
function drawSmokeFog(vw) {
  const F = vw._fog; if (!F || !M.smokes.length) return;
  const [ex, ey] = F.eye, k = VZ * DPR / FOG_MS, mg = FOG_MASK.getContext('2d');
  mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, FOG_MASK.width, FOG_MASK.height);
  mg.setTransform(k, 0, 0, k, VOX * DPR / FOG_MS, VOY * DPR / FOG_MS);
  let any = false; const FAR = 5000; mg.fillStyle = '#fff'; mg.globalCompositeOperation = 'lighter';
  for (const c of M.smokes) {
    const s = smokeStr(c); if (!s || c.r < 1) continue; any = true;
    const d = Math.hypot(c.x - ex, c.y - ey), a0 = Math.atan2(c.y - ey, c.x - ex); let prev = 0;
    for (const [f, v] of SMOKE_RINGS) {
      const rho = f * c.r; mg.globalAlpha = s * (v - prev); prev = v; mg.beginPath();
      if (d <= rho) mg.rect(ex - FAR, ey - FAR, FAR * 2, FAR * 2);
      else {
        const h = Math.asin(rho / d), tl = Math.sqrt(d * d - rho * rho), P = [[a0 + h, tl], [a0 + h, FAR], [a0 - h, FAR], [a0 - h, tl]].map(([t, l]) => [ex + Math.cos(t) * l, ey + Math.sin(t) * l]);
        let A = 0; for (let i = 0; i < 4; i++) A += P[i][0] * P[(i + 1) % 4][1] - P[(i + 1) % 4][0] * P[i][1]; if (A < 0) P.reverse();   // wind like arc() (+)
        P.forEach(([x, y], i) => i ? mg.lineTo(x, y) : mg.moveTo(x, y)); mg.closePath();
        mg.moveTo(c.x + rho, c.y); mg.arc(c.x, c.y, rho, 0, TAU);      // same winding as the cone, so one nonzero fill covers the union once
      }
      mg.fill();
    }
  }
  mg.globalCompositeOperation = 'source-over'; mg.globalAlpha = 1; if (!any) return;
  // close to the eye smoke thins out (SIGHT_NEAR): keep (d - near0) / (near1 - near0) of the mask
  const [n0, n1] = SIGHT_NEAR, hb = mg.createRadialGradient(ex, ey, 0, ex, ey, n1); hb.addColorStop(0, 'rgba(0,0,0,1)'); hb.addColorStop(n0 / n1, 'rgba(0,0,0,1)'); hb.addColorStop(1, 'rgba(0,0,0,0)');
  mg.globalCompositeOperation = 'destination-out'; mg.fillStyle = hb; mg.beginPath(); mg.arc(ex, ey, n1, 0, TAU); mg.fill(); mg.globalCompositeOperation = 'source-over';
  // remembered world, cut to the soft mask (upscaling the low-res mask gives the soft edge)
  const tg = FOG_TMP.getContext('2d'), X = vw.x * DPR, Y = vw.y * DPR, Wd = vw.w * DPR, Ht = vw.h * DPR;
  tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over'; tg.clearRect(X, Y, Wd, Ht);
  tg.drawImage(FOG_OUT, X, Y, Wd, Ht, X, Y, Wd, Ht);
  tg.globalCompositeOperation = 'destination-in'; tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
  tg.drawImage(FOG_MASK, 0, 0, FOG_MASK.width, FOG_MASK.height, 0, 0, FOG_MASK.width * FOG_MS, FOG_MASK.height * FOG_MS);
  tg.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(FOG_TMP, X, Y, Wd, Ht, X, Y, Wd, Ht); worldT();
}
