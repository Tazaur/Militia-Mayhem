/* ================= line-of-sight vision (setting: VISION) =================
   Buildings block sight. Outside your sight you see the map as you last saw it: a half-resolution memory of
   the ground and decals, plus sandbags / fences / hay / trees in their last-seen state, dimmed. Units, vehicles,
   projectiles and effects only appear inside your sight. */
let FOGK = 0.5;     // memory scale: half resolution, except the small tile-art dev yard (full, so walls stay crisp)
function fogEyes(vw) {
  if (!M || M.demo || M.cfg.fog === 'off') return [];      // a match option (host's lobby), the same for everyone
  const ps = vw.p ? [vw.p] : M.shared ? LOCALS() : [];
  return ps.map(p => p.sol).filter(s => s && s.alive).map(s => s.veh ? [s.veh.x, s.veh.y] : [s.x, s.y]);
}
function raySeg(ox, oy, dx, dy, ax, ay, bx, by) {
  const sx = bx - ax, sy = by - ay, den = dx * sy - dy * sx; if (Math.abs(den) < 1e-9) return Infinity;
  const t = ((ax - ox) * sy - (ay - oy) * sx) / den, u = ((ax - ox) * dy - (ay - oy) * dx) / den;
  return t > 0 && u >= 0 && u <= 1 ? t : Infinity;
}
function visPoly(ex, ey, R, walls, pad) {
  const segs = [], angs = [];
  for (const b of walls || MAP.sight || MAP.buildings) {   // the dev yard keeps merged wall runs in MAP.sight (windows aren't in it)
    if (b.x > ex + R || b.x + b.w < ex - R || b.y > ey + R || b.y + b.h < ey - R) continue;
    const c = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
    for (let i = 0; i < 4; i++) { const a = c[i], d = c[(i + 1) % 4]; segs.push([a[0], a[1], d[0], d[1]]); const t = Math.atan2(a[1] - ey, a[0] - ex); angs.push(t - 0.0008, t + 0.0008); }
  }
  for (let i = 0; i < 96; i++) angs.push(i / 96 * TAU - Math.PI);
  angs.sort((a, b) => a - b);
  const pts = [];
  for (const t of angs) {
    const dx = Math.cos(t), dy = Math.sin(t); let best = R;
    for (const q of segs) { const d = raySeg(ex, ey, dx, dy, q[0], q[1], q[2], q[3]); if (d < best) best = d; }
    if (best < R) best += pad || 5;                // let the near wall face show
    pts.push([ex + dx * best, ey + dy * best]);
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
  }
  const seen = (x, y) => polys.some(P => inPoly(x, y, P)) && !smokeBlocks(eyes[0][0], eyes[0][1], x, y);
  for (const s of MAP.statics) if (vis(s.x, s.y, 20) && (s.type === 'fence' || s.type === 'hay' || s.type === 'tree') && seen(s.x, s.y)) m.st.set(s, s.alive);
  for (const A of MAP.arcs) if (vis(A.x, A.y, 40) && seen(A.x, A.y)) m.arc.set(A, A.lost);
  // the remembered world goes into an offscreen layer, so smoke can reuse it later
  fogCanvases();
  const main = ctx; ctx = FOG_OUT.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR);
  ctx.fillStyle = '#0c140a'; ctx.fillRect(vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR);
  worldT(); ctx.imageSmoothingEnabled = false; drawSkirt(x0, y0, x1, y1);
  if (bw > 0 && bh > 0) { ctx.imageSmoothingEnabled = FOGK < 1; ctx.drawImage(m.c, bx0 * FOGK, by0 * FOGK, bw * FOGK, bh * FOGK, bx0, by0, bw, bh); ctx.imageSmoothingEnabled = false; }
  for (const A of MAP.arcs) { if (!vis(A.x, A.y, 50)) continue; const lost = m.arc.has(A) ? m.arc.get(A) : 0, f = lost / A.bags.length; spr(f < 0.25 ? 'bagarc0' : f < 0.75 ? 'bagarc1' : 'bagarc2', A.x, A.y, A.a); }
  worldT();
  for (const s of MAP.statics) {
    if ((s.type !== 'fence' && s.type !== 'hay') || !vis(s.x, s.y, 16) || !(m.st.has(s) ? m.st.get(s) : true)) continue;
    if (s.type === 'fence') { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); ctx.fillStyle = CFG.style === 'grit' ? '#5a4632' : '#8a6a42'; ctx.fillRect(-7, -1, 14, 2.5); ctx.fillStyle = CFG.style === 'grit' ? '#3e3022' : '#5e4428'; ctx.fillRect(-2, -3, 4, 6); ctx.restore(); }
    else { ctx.fillStyle = CFG.style === 'grit' ? '#857344' : '#c8a64e'; ctx.beginPath(); ctx.arc(s.x, s.y, 13, 0, TAU); ctx.fill(); }
  }
  for (const s of MAP.statics) if (s.type === 'tree' && vis(s.x, s.y, 40) && (m.st.has(s) ? m.st.get(s) : true)) { img(s.pine ? SPR.pines[s.v] : SPR.trees[s.v], s.x, s.y, s.a, s.sc, 0.94); worldT(); }
  // out of sight is drained of colour (and a little dimmer)
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR);
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = CFG.style === 'grit' ? 'rgba(6,6,4,0.3)' : 'rgba(4,8,6,0.22)'; ctx.fillRect(vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR);
  ctx = main;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(FOG_OUT, vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR, vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR);
  vw._fog = { polys, eye: eyes[0] };
  // everything from here on is only drawn where you can see
  worldT(); ctx.save(); polyPath(ctx, polys); ctx.clip();
  return polys;
}
/* smoke blocks sight like a soft-edged wall: the area behind each cloud (and its core) falls back to the remembered view */
function drawSmokeFog(vw) {
  const F = vw._fog; if (!F || !M.smokes.length) return;
  const [ex, ey] = F.eye, k = VZ * DPR / FOG_MS, mg = FOG_MASK.getContext('2d');
  mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, FOG_MASK.width, FOG_MASK.height);
  mg.setTransform(k, 0, 0, k, VOX * DPR / FOG_MS, VOY * DPR / FOG_MS);
  let any = false; const N = 7;
  for (const c of M.smokes) {
    const a = Math.min(1, c.t / 0.8) * Math.min(1, (c.T - c.t) / 3.5); if (c.r < 20 || a <= 0.02) continue;
    any = true; mg.fillStyle = '#fff';
    const d = Math.hypot(c.x - ex, c.y - ey), core = c.r * 0.5;
    // soft round core
    const g = mg.createRadialGradient(c.x, c.y, 0, c.x, c.y, core * 1.3); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.7, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    mg.globalAlpha = 1; mg.fillStyle = g; mg.beginPath(); mg.arc(c.x, c.y, core * 1.3, 0, TAU); mg.fill(); mg.fillStyle = '#fff';
    if (d <= core) { // standing in it: everything but a little bubble around you
      mg.globalAlpha = a; mg.fillRect(ex - 5000, ey - 5000, 10000, 10000); mg.globalCompositeOperation = 'destination-out';
      const h = mg.createRadialGradient(ex, ey, 10, ex, ey, 60); h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)'); mg.globalAlpha = 1; mg.fillStyle = h; mg.beginPath(); mg.arc(ex, ey, 60, 0, TAU); mg.fill();
      mg.globalCompositeOperation = 'source-over'; continue;
    }
    // shadow behind the cloud: stacked wedges of growing width give a feathered penumbra; each starts at the cloud's centre line
    const ux = (c.x - ex) / d, uy = (c.y - ey) / d, px = -uy, py = ux;
    for (let i = 0; i < N; i++) {
      const w = core * (0.35 + i * 0.16), FAR = 5000;
      const ax = c.x + px * w, ay = c.y + py * w, bx = c.x - px * w, by = c.y - py * w;
      const la = Math.hypot(ax - ex, ay - ey), lb = Math.hypot(bx - ex, by - ey);
      mg.globalAlpha = Math.min(1, a / N * 3); mg.globalCompositeOperation = 'lighter';
      mg.beginPath(); mg.moveTo(ax, ay); mg.lineTo(ex + (ax - ex) / la * FAR, ey + (ay - ey) / la * FAR); mg.lineTo(ex + (bx - ex) / lb * FAR, ey + (by - ey) / lb * FAR); mg.lineTo(bx, by);
      mg.arc(c.x, c.y, w, Math.atan2(by - c.y, bx - c.x), Math.atan2(ay - c.y, ax - c.x), true); mg.closePath(); mg.fill();
    }
    mg.globalCompositeOperation = 'source-over';
  }
  mg.globalAlpha = 1; if (!any) return;
  // remembered world, cut to the soft mask (upscaling the low-res mask gives the soft edge)
  const tg = FOG_TMP.getContext('2d'), X = vw.x * DPR, Y = vw.y * DPR, Wd = vw.w * DPR, Ht = vw.h * DPR;
  tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over'; tg.clearRect(X, Y, Wd, Ht);
  tg.drawImage(FOG_OUT, X, Y, Wd, Ht, X, Y, Wd, Ht);
  tg.globalCompositeOperation = 'destination-in'; tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
  tg.drawImage(FOG_MASK, 0, 0, FOG_MASK.width, FOG_MASK.height, 0, 0, FOG_MASK.width * FOG_MS, FOG_MASK.height * FOG_MS);
  tg.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(FOG_TMP, X, Y, Wd, Ht, X, Y, Wd, Ht); worldT();
}
