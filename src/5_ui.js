/* =====================================================================
   RENDERING, HUD, DEPLOY SCREEN, MENUS, MAIN LOOP
   ===================================================================== */
/* ---------------- trees: the atlas's tree0-2, a crown of three layers stacked (pines stay the drawn SPR.pines) ----------------
   One shadow span for the lot (SUNH.tree: the crown's underside to its top). tree0 stands in the draw queue (over the men
   under it), tree1-2 go up with the roofs (over the smoke; with the sun, lit as the roofs are). Whoever is under a crown
   fades it to half quickly (s.tf). Felled: tree0 alone, flat on the ground at 60%, still, under everything.
   TREE DETAIL (CFG.trees): ULTRA sways and also cuts a hole round whoever is under it; HIGH sways; LOW stands still. */
const TREE_L = ['tree0', 'tree1', 'tree2'], TREE_K = 0.9, TREE_HOLE = 26;     // TREE_HOLE: the cut's radius round a man (clear in the middle, faded out by its edge)
const atlasTree = s => s.type === 'tree' && !s.pine && !!ATLAS.tree0;
const treeR = s => (atlasTree(s) ? ATLAS.tree0[2] * TREE_K : (s.pine ? SPR.pines : SPR.trees)[s.v].width) / 2 * s.sc * 0.85;
/* layer k's sway now: a few px and a few degrees, in gusts that roll across the map */
function treeSway(s, k) {
  if (CFG.trees === 'low') return [0, 0, 0];
  const t = M.time, ph = s.x * 0.011 + s.y * 0.007, g = 0.6 + 0.4 * Math.sin(t * 0.31 + ph * 0.5), A = [0.6, 1.5, 2.4][k] * g;
  return [Math.sin(t * 1.4 + ph + k * 0.6) * A, Math.sin(t * 1.1 + ph * 1.3 + k * 0.6) * A * 0.6, Math.sin(t * 0.9 + ph + k * 0.8) * 0.045 * (k + 1) / 3 * g];
}
/* who is under the crown (s._u: soldiers on foot, vehicles with anyone aboard), and the fade, eased (once a frame: the queue's draw) */
function treeFade(s) {
  const now = M.time, dt = clamp(now - (s.tfT ?? now), 0, 0.1), U = s._u || (s._u = []), r = treeR(s); s.tfT = now; U.length = 0;
  for (const o of M.sol) { if (!o.alive) continue; const p = o.veh || o; if (!U.includes(p) && Math.hypot(p.x - s.x, p.y - s.y) < r + (o.veh ? p.T.hw : 4)) U.push(p); }
  s.tf = clamp((s.tf || 0) + (U.length ? 1 : -1) * dt * 6, 0, 1);
}
/* layers k0..k1, swaying, at the crown's fade; ULTRA (GL): a soft hole round whoever is under it, clearest in the middle */
const TREE_M = { c: null, R: 0 };
function treeMask(s) {     // the crown's box (world, s.x +- R) as a 64 px mask: opaque, with a radial fade cut at each one under it
  const R = treeR(s) / 0.85 + 4, c = TREE_M.c || (TREE_M.c = gCv(64, 64)), g = c.getContext('2d'), k = 64 / (2 * R), f = s.tf || 0;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.globalCompositeOperation = 'destination-out';
  for (const p of s._u) {
    const x = (p.x - s.x + R) * k, y = (p.y - s.y + R) * k, r = (p.T ? p.T.hl * 1.1 : TREE_HOLE) * k, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${0.9 * f})`); gr.addColorStop(0.45, `rgba(0,0,0,${0.65 * f})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalCompositeOperation = 'source-over'; c._gv = (c._gv || 0) + 1; TREE_M.R = R; return c;
}
function treeLayers(s, k0, k1) {
  const al = 1 - 0.5 * (s.tf || 0), sc = s.sc * TREE_K, mask = CFG.trees === 'ultra' && ctx.maskedImage && s._u && s._u.length && s.tf > 0 ? treeMask(s) : null;
  const R = TREE_M.R, D = DPR, mx = ((s.x - R) * VZ + VOX) * D, my = ((s.y - R) * VZ + VOY) * D, mw = 2 * R * VZ * D;
  for (let k = k0; k <= k1; k++) {
    const [dx, dy, da] = treeSway(s, k);
    if (!mask) { spr(TREE_L[k], s.x + dx, s.y + dy, s.a + da, sc, sc, al); continue; }
    const m = ATLAS[TREE_L[k]], c = Math.cos(s.a + da), n = Math.sin(s.a + da), z = VZ * D;
    ctx.setTransform(c * z * sc, n * z * sc, -n * z * sc, c * z * sc, ((s.x + dx) * VZ + VOX) * D, ((s.y + dy) * VZ + VOY) * D); ctx.globalAlpha = al;
    ctx.maskedImage(SRC, m[0], m[1], m[2], m[3], -m[4], -m[5], m[2], m[3], mask, mx, my, mw, mw); ctx.globalAlpha = 1;
  }
  worldT();
}
/* the solid trunk's radius (world px, at scale sc): the tree's underside painted to full depth (down to the ground) is its
   trunk; as a circle of the same area. 0 until the atlas's heights are in (the map keeps its r then) */
let TRUNK = 0;
function treeTrunk(sc) {
  if (!TRUNK) { const D = matData(), m = ATLAS.under_tree; if (!D || !m) return 0; let n = 0; for (let y = 0; y < m[3]; y++) for (let x = 0; x < m[2]; x++) if (D.mp[((m[1] + y) * D.w + m[0] + x) * 4] >= 248) n++; TRUNK = Math.sqrt(n / Math.PI) || 0; }
  return TRUNK * sc * TREE_K;
}
function drawTreeTops(vis) { for (const s of MAP.statics) if (s.alive && atlasTree(s) && vis(s.x, s.y, 60)) treeLayers(s, 1, 2); }
function drawWorld(vw) {
  FRAMEN++;
  const sh = vw.shake;
  VZ = vw.cam.z; VOX = vw.x + vw.w / 2 - (vw.cam.x + rnd(-sh, sh) / VZ) * VZ; VOY = vw.y + vw.h / 2 - (vw.cam.y + rnd(-sh, sh) / VZ) * VZ;
  VOX = Math.round(VOX * DPR) / DPR; VOY = Math.round(VOY * DPR) / DPR;     // whole screen pixels: pixel art (and the fog) shifts cleanly instead of crawling
  vw.VZ = VZ; vw.VOX = VOX; vw.VOY = VOY;
  const x0 = (vw.x - VOX) / VZ - 4, y0 = (vw.y - VOY) / VZ - 4, x1 = (vw.x + vw.w - VOX) / VZ + 4, y1 = (vw.y + vw.h - VOY) / VZ + 4;
  const vis = (x, y, r) => x + r > x0 && x - r < x1 && y + r > y0 && y - r < y1;
  screenT(); ctx.save(); ctx.beginPath(); ctx.rect(vw.x, vw.y, vw.w, vw.h); ctx.clip();
  pipe('clear');     // no fill: the ground and the skirt round the map cover the view
  worldT(); ctx.imageSmoothingEnabled = false;
  SUNNOW = sunOn();
  const rv = MAP.houses.length ? roofView(vw, x0, y0, x1, y1) : null, fogPolys = applyFog(vw, vis, x0, y0, x1, y1, rv), fogged = !!fogPolys; pipe('memory', { fogged });
  // ---- layer 0: ground + fading footprints
  const gx0 = Math.max(0, Math.floor(x0)), gy0 = Math.max(0, Math.floor(y0)), gx1 = Math.min(WW, Math.ceil(x1)), gy1 = Math.min(WH, Math.ceil(y1));
  if (gx1 > gx0 && gy1 > gy0) stackImg(ctx, [ground, decals, prints], gx0, gy0, gx1 - gx0, gy1 - gy0, gx0, gy0, gx1 - gx0, gy1 - gy0);
  pipe('ground');
  if (MAP.water.length) { ctx.globalAlpha = 0.18; ctx.fillStyle = CFG.style === 'grit' ? '#7a8a82' : '#9fd0f0'; for (const w of MAP.water) { if (!vis(w.x + w.w / 2, w.y + w.h / 2, Math.max(w.w, w.h))) continue; for (let i = 0; i < 26; i++) { const y = w.y + ((i * 97 + M.time * 14) % w.h), x = w.x + ((i * 53) % (w.w - 20)) + Math.sin(M.time + i) * 6; ctx.fillRect(x, y, 12, 1); } } ctx.globalAlpha = 1; }
  // flags
  for (const f of M.flags) {
    if (!vis(f.x, f.y, f.r + 20)) continue;
    img(SPR.ring[f.owner + 1], f.x, f.y, 0, f.r * 2 / 128 * 1.04, 0.75); worldT();
    if (f.prog !== 0 && Math.abs(f.prog) < 1) { ctx.strokeStyle = TEAMHEX[f.prog < 0 ? 0 : 1]; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.82, -Math.PI / 2, -Math.PI / 2 + TAU * Math.abs(f.prog)); ctx.stroke(); }
    if (f.contested) { ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(M.time * 10)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.9, 0, TAU); ctx.stroke(); }
    if (!SUNNOW) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(f.x + 2, f.y - 2, 22, 4); }
    ctx.fillStyle = '#d8d8d0'; ctx.beginPath(); ctx.arc(f.x, f.y, 3.5, 0, TAU); ctx.fill();
    ctx.fillStyle = f.owner < 0 ? '#e8e8e0' : TEAMHEX[f.owner]; ctx.beginPath(); ctx.moveTo(f.x, f.y - 1);
    for (let i = 0; i <= 6; i++) ctx.lineTo(f.x + i * 5, f.y - 16 + Math.sin(f.wave + i * 0.9) * 2.5);
    for (let i = 6; i >= 0; i--) ctx.lineTo(f.x + i * 5, f.y - 4 + Math.sin(f.wave + i * 0.9) * 2.5);
    ctx.fill();
    ctx.fillStyle = '#111'; ctx.font = `bold 9px ${FB}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.name.length > 1 ? 'H' : f.name, f.x + 14, f.y - 10 + Math.sin(f.wave + 2.5) * 2.5);
  }
  pipe('flags');
  // ---- everything standing on the ground, low to high by its height (px, as the sun pass has them: ZH): the taller
  // covers the lower, so jump dust stays behind the jumper, a prone man under the sandbags. Then the light over all of it
  // (roofs and canopies too), then what glows or floats in the air over the light (fire, flashes, smoke)
  const eyes = viewEyes(vw), hidden = s => smokeHides(eyes, s, vw), Q = DRAWQ; Q.length = 0;
  const at = (z, f, post) => Q.push({ z, f, post, k: AK, i: Q.length });     // AK: what it is (for the pipeline viewer)
  AK = 'crate'; for (const c of M.crates) if (c.live && vis(c.x, c.y, 14)) at(SUNH.crate, () => { worldT(); ctx.fillStyle = 'rgba(0,0,0,0.35)'; if (!SUNNOW) ctx.fillRect(c.x - 7, c.y - 6, 18, 18); img(SPR.crate, c.x, c.y, c.a, 1, CFG.style === 'grit' ? 0.85 : 1); });
  AK = 'item'; for (const it of M.items) if (vis(it.x, it.y, 30)) at(ZH.item, () => drawItem(it, vw));
  AK = 'brass'; at(0, () => { worldT(); ctx.fillStyle = '#c9a443'; for (const b of M.brass) if (vis(b.x, b.y, 4)) { ctx.globalAlpha = 0.8 * (1 - b.t / BRASS_T); ctx.fillRect(b.x, b.y, 2, 1); } ctx.globalAlpha = 1; });
  AK = 'body'; for (const c of M.corpses) if (vis(c.x, c.y, 30)) at(ZH.body, () => { worldT(); if (!c.baked) drawPool(ctx, c, c.t / POOL_T); solDraw(c, c.n, c.x, c.y, c.rot, 1, 1, c.t > BODY_T ? corpseAlpha(c) : undefined); });
  AK = 'flat shadows'; if (!SUNNOW) at(ZH.body, () => drawShadowLayer(vw, vis));     // without the sun: one shared offset shadow for soldiers, vehicles and bodies in the air
  AK = 'soldier'; for (const s of M.sol) if (s.alive && !s.veh && vis(s.x, s.y, 30) && !hidden(s) && sightNear(vw, s)) at(solZ(s), () => drawSoldier(s, vw));
  AK = 'sandbags'; for (const A of MAP.arcs) if (vis(A.x, A.y, 50)) at(artMax('bagarc0'), () => { const f = A.lost / A.bags.length; spr(f < 0.25 ? 'bagarc0' : f < 0.75 ? 'bagarc1' : 'bagarc2', A.x, A.y, A.a); });
  for (const s of MAP.statics) {
    if (!s.alive) { if (atlasTree(s) && vis(s.x, s.y, 60)) { AK = 'felled tree'; at(0.5, () => { const k = s.sc * TREE_K; spr('tree0', s.x, s.y, s.a, k, k, 0.6); worldT(); }); } continue; }
    if (!vis(s.x, s.y, s.type === 'tree' ? 60 : 16)) continue; AK = s.type;
    if (atlasTree(s)) { treeFade(s); at(SUNH.tree[1], () => { if (!SUNNOW) { worldT(); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.arc(s.x + 6, s.y + 7, treeR(s), 0, TAU); ctx.fill(); } treeLayers(s, 0, 0); }); continue; }     // no sun: one flat shadow, offset
    if (s.type === 'fence') at(SUNH.fence, () => { worldT(); ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); ctx.fillStyle = 'rgba(0,0,0,0.3)'; if (!SUNNOW) ctx.fillRect(-7, 2, 15, 3); ctx.fillStyle = CFG.style === 'grit' ? '#5a4632' : '#8a6a42'; ctx.fillRect(-7, -1, 14, 2.5); ctx.fillStyle = CFG.style === 'grit' ? '#3e3022' : '#5e4428'; ctx.fillRect(-2, -3, 4, 6); ctx.restore(); });
    else if (s.type === 'bag' && !s.arc) at(SUNH.fence, () => { worldT(); img(SPR.bag, s.x, s.y, s.a, 1); });     // a loose sandbag (a wall's are its arc sprite)
    else if (s.type === 'hay') at(SUNH.hay, () => { worldT(); ctx.fillStyle = 'rgba(0,0,0,0.3)'; if (!SUNNOW) { ctx.beginPath(); ctx.arc(s.x + 3, s.y + 4, 13, 0, TAU); ctx.fill(); } img(SPR.hay, s.x, s.y, s.a, 1); });
    else if (s.type === 'tree') at(SUNH.tree[0], () => { const tc = s.pine ? SPR.pines[s.v] : SPR.trees[s.v]; worldT(); ctx.fillStyle = 'rgba(0,0,0,0.28)'; if (!SUNNOW) { ctx.beginPath(); ctx.arc(s.x + 6, s.y + 7, 24 * s.sc, 0, TAU); ctx.fill(); } img(tc, s.x, s.y, s.a, s.sc, 0.94); });
  }
  AK = 'wreck'; for (const w of M.wrecks) if (vis(w.x, w.y, 70)) at(topOf(w), () => drawWreck(w));
  AK = 'vehicle'; for (const v of M.vehicles) if (v.active && vis(v.x, v.y, 80) && sightNear(vw, v)) at(topOf(v), () => drawVehicle(v));     // one piece: hull, crew, turret, MG in their own order
  AK = 'shot'; for (const p of M.proj) if (vis(p.x, p.y, 20)) at(shotZ(p), () => drawProj(p));
  AK = 'thrown body'; for (const f of M.flings) if (vis(f.x, f.y, 40)) { const k = f.t / f.T, h = Math.sin(Math.PI * k); at(ZH.body + h * 34, () => solDraw(f, solSpr(f.color, 'dead'), f.x, f.y - h * 34, f.rot, 1 + h * 0.6, 1 + h * 0.6)); }
  if (!devOff('parts')) partsInto(at, vis);
  // roofs over everything under them (vehicles, smoke): with the sun, after the smoke (lit already: roofView); without, the top of the queue's ground things
  const roofDraw = () => { if (rv) { worldT(); ctx.imageSmoothingEnabled = false; const f = () => ctx.drawImage(rv.c, 0, 0, rv.w, rv.h, rv.x, rv.y, rv.w, rv.h); if (SUNNOW) roofLit(f); else f(); } };
  AK = 'roofs'; if (!SUNNOW) at(SUNH.tree[0] - 1, roofDraw);
  AK = 'tree tops'; if (!SUNNOW) at(SUNH.tree[0], () => drawTreeTops(vis));
  AK = 'killer glow'; at(99, () => drawKillerGlow(vw), true);
  Q.sort((a, b) => a.z - b.z || a.i - b.i);
  for (const d of Q) if (!d.post) { d.f(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; pipe('q', d); }
  // the light, over the whole view (out of sight: the shade for the memory, no point lights, units only cast)
  if (SUNNOW) drawSun(vw, vis, hidden, fogged);
  else if (!devOff('add')) drawLights(vis); else lightsNow(vis);
  if (!SUNNOW) pipe('lights2d');
  for (const d of Q) if (d.post) { d.f(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; pipe('q', d); }
  // the soft layers (smoke, windows) over everything in sight alike: units, vehicles, roofs, trees, fire
  if (fogged && !devOff('fog')) drawSoftFog(vw); pipe('softfog');
  drawLasers(vis); pipe('lasers');     // under the smoke: a man in it doesn't give himself away
  if (!devOff('smoke')) drawSmokes(vw); pipe('smokes');
  if (SUNNOW) { roofDraw(); pipe('roofs'); roofLit(() => drawTreeTops(vis)); pipe('tree tops'); }
  // the remembered world over what's out of sight (everything above was drawn whole; dev views: the whole screen)
  if (fogged && !(SUNNOW && SUNDBG)) { const H = new Path2D(); polyPath(H, fogPolys); worldT(); fogOverlay(vw, H); if (SUNNOW && !CFG.roofFog) roofsOver(vw, rv, H); }
  // tags, reticles
  worldT(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  pipe('overlay-done'); const eyN = viewEyes(vw);
  for (const s of M.sol) {
    if (!s.alive || !s.player || !vis(s.x, s.y, 40)) continue;
    if (smokeHides(eyN, s, vw) || (fogged && eyN.length && !eyN.some(e => e.s === s || (!M.ffa && e.team === s.team) || sees(e.x, e.y, s.x, s.y)))) continue;
    const y = (s.veh ? s.veh.y - s.veh.T.hw - 14 : s.y - (s.down ? 30 : 16)), x = s.veh ? s.veh.x : s.x;
    ctx.font = `bold ${Math.round(8 / Math.max(0.8, VZ * 0.6))}px ${FB}`; ctx.globalAlpha = 0.5;      // small and faint: a label, not a sign
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(s.name, x + 1, y + 1); ctx.fillStyle = CHEX[s.color]; ctx.fillText(s.name, x, y); ctx.globalAlpha = 1;
  }
  pipe('tags');
  for (const p of (M.demo ? [] : LOCALS())) {
    const s = p.sol; if (!s.alive || (p.raw && p.raw.mouse)) continue;
    if (!vw.p && !M.shared) continue; if (vw.p && vw.p !== p) continue;
    let ox = s.x, oy = s.y, a = s.a;
    if (s.veh && s.seat === 0 && s.veh.type === 'tank') { ox = s.veh.x; oy = s.veh.y; a = s.veh.aimT === undefined ? s.veh.ta : s.veh.aimT; }
    if (s.veh && s.seat === 0 && s.veh.type === 'jeep') continue;
    const scoped = !s.veh && WPN[cw(s).id].scope;
    const d = s.veh ? 160 : scoped ? 120 + (p.aimDist || 0) : 120, rx = ox + Math.cos(a) * d, ry = oy + Math.sin(a) * d;
    ctx.strokeStyle = CHEX[p.color]; ctx.lineWidth = 2 / VZ; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(rx, ry, 6, 0, TAU); ctx.moveTo(rx - 10, ry); ctx.lineTo(rx - 4, ry); ctx.moveTo(rx + 4, ry); ctx.lineTo(rx + 10, ry); ctx.moveTo(rx, ry - 10); ctx.lineTo(rx, ry - 4); ctx.moveTo(rx, ry + 4); ctx.lineTo(rx, ry + 10); ctx.stroke();
    if (scoped) { ctx.globalAlpha = 0.25; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(ox + Math.cos(a) * 24, oy + Math.sin(a) * 24); ctx.lineTo(rx, ry); ctx.stroke(); ctx.setLineDash([]); }
    ctx.globalAlpha = 1;
  }
  pipe('reticle');
  if (M.dev) devDrawWorld(vw);
  // weather + grit grade
  screenT();
  if (M.rain) drawRain(vw);
  if (M.snow) drawSnow(vw);
  if (CFG.style === 'grit') {
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = M.rain ? '#bcbec4' : '#e2d9c2'; ctx.fillRect(vw.x, vw.y, vw.w, vw.h); ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.07; const ox = (M.time * 731) % 256, oy = (M.time * 517) % 256; ctx.translate(vw.x - ox, vw.y - oy); ctx.fillStyle = ctx.createPattern(SPR.grain, 'repeat'); ctx.fillRect(ox, oy, vw.w, vw.h); screenT(); ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(vw.x + vw.w / 2, vw.y + vw.h / 2, Math.min(vw.w, vw.h) * 0.35, vw.x + vw.w / 2, vw.y + vw.h / 2, Math.max(vw.w, vw.h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.38)'); ctx.fillStyle = g; ctx.fillRect(vw.x, vw.y, vw.w, vw.h);
  } else if (M.rain) { ctx.fillStyle = 'rgba(20,30,50,0.18)'; ctx.fillRect(vw.x, vw.y, vw.w, vw.h); }
  pipe('grade');
  ctx.restore();
}
const DRAWQ = []; let AK = '';
function drawItem(it, vw) {
  worldT();
  if (it.k === 'med' || it.k === 'ammo') {
    const pulse = 0.25 + 0.15 * Math.sin(M.time * 4);
    ctx.strokeStyle = it.k === 'med' ? `rgba(120,255,140,${pulse})` : `rgba(255,220,120,${pulse})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(it.x, it.y, 58, 0, TAU); ctx.stroke();
    if (!SUNNOW) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(it.x - 5, it.y - 4, 12, 10); }
    ctx.fillStyle = it.k === 'med' ? '#e8e8e0' : '#5b6236'; ctx.fillRect(it.x - 6, it.y - 5, 12, 10);
    if (it.k === 'med') { ctx.fillStyle = '#d02a22'; ctx.fillRect(it.x - 1, it.y - 4, 2, 8); ctx.fillRect(it.x - 4, it.y - 1, 8, 2); }
    else { ctx.fillStyle = '#d6b04a'; ctx.fillRect(it.x - 4, it.y - 3, 2, 6); ctx.fillRect(it.x - 1, it.y - 3, 2, 6); ctx.fillRect(it.x + 2, it.y - 3, 2, 6); }
  } else if (it.k === 'mine') {
    const mine = humanTeams().has(it.team) || (vw.p && vw.p.sol && Math.hypot(vw.p.sol.x - it.x, vw.p.sol.y - it.y) < 70);
    if (!mine) return;
    ctx.fillStyle = '#2a2c24'; ctx.beginPath(); ctx.arc(it.x, it.y, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#4a4c40'; ctx.beginPath(); ctx.arc(it.x, it.y, 3.5, 0, TAU); ctx.fill();
    if (Math.floor(M.time * 2) % 2) { ctx.fillStyle = it.team < 2 ? TEAMHEX[it.team] : '#f33'; ctx.fillRect(it.x - 1, it.y - 1, 2, 2); }
  } else if (it.k === 'pouch') { ctx.fillStyle = '#4c4a2c'; ctx.fillRect(it.x - 4, it.y - 3, 8, 6); ctx.fillStyle = '#6c6a40'; ctx.fillRect(it.x - 4, it.y - 3, 8, 2); }
}
function drawProj(p) {
  worldT();
  if (p.k === 'bullet') {
    const T = SPR.tracer[p.heavy ? 2 : p.mg ? 1 : 0], run = p.ox === undefined ? T.L : Math.hypot(p.x - p.ox, p.y - p.oy);     // the streak grows out of the muzzle
    sprC(T, T.L, T.height / 2, p.x, p.y, Math.atan2(p.vy, p.vx), undefined, Math.min(1, run / T.L));     // drawn as is (not added: orange on grass would go lime)
  } else if (p.k === 'nade') {
    if (!SUNNOW) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(p.x + 1, p.y + 2, 3, 0, TAU); ctx.fill(); }
    const sc = 1 + p.h / 60, ny = nadeY(p); ctx.fillStyle = '#2e4a22'; ctx.beginPath(); ctx.arc(p.x, ny, 3.2 * sc, 0, TAU); ctx.fill();
    if (p.life < 0.5 && Math.floor(p.life * 16) % 2) { ctx.fillStyle = '#ff3b2a'; ctx.beginPath(); ctx.arc(p.x, ny, 1.5, 0, TAU); ctx.fill(); }
  } else {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
    ctx.fillStyle = p.k === 'shell' ? '#2b2b2b' : '#5a6a50'; ctx.fillRect(-7, -2, 12, 4); ctx.fillStyle = '#d0c070'; ctx.fillRect(4, -1.5, 3, 3);
    ctx.restore();
    if (p.k === 'rocket') { spr('fire5', p.x - p.vx * 0.02, p.y - p.vy * 0.02, M.time * 20, 0.45, 0.45, 0.9); light(p.x - p.vx * 0.02, p.y - p.vy * 0.02, 80, shotZ(p), rnd(0.5, 0.65)); }     // its exhaust
  }
  worldT();
}
/* the smoke field; around this view's eyes it thins out (SIGHT_NEAR, as the sight rules do) down to SMOKE_KEEP, so you
   can see your feet in smoke */
const SMOKE_KEEP = 0.25;
function drawSmokes(vw) { if (M.gsf && M.gsf.act.length) { worldT(); drawSmokeField(vw, vw ? viewSols(vw).map(posOf) : []); } }
/* the smoke field, drawn in soft puffs: one on every other tile (a checkerboard; a tile off it gets
   its own when no neighbour has one), as thick as the tile (1 - e^(-SMK_VIS x amount), as light through haze) and
   SMK_PUFF tiles in radius, SMK_GROW more per tile of room round it (f.R), less when thin. So the grid says where the
   smoke is and the puffs make it round and smooth. They go into SMK_C, the walls are cut out of it (a puff never
   reaches past the wall beyond it, so a room keeps its smoke), and it's drawn twice: dark and offset away from the sun as
   its shadow on the ground, then the smoke, over the light (solid: it hides what's in it). Its volume: its own silhouette,
   dark and stepped away from the sun (SMK_SELF), laid on it; each puff a sunlit billow (softDot lit), so where more smoke stands sunward it's in shade and the sunward
   rim stays bright. Each puff drifts and breathes slowly (phase from the tile); thinned near the eyes (SMOKE_KEEP).
   A tile's look (f.V) eases to its thickness at SMK_IN a second, so new smoke swells in; a puff is fainter the smaller
   it is (down to SMK_SMALL), so a little one squeezed against a wall doesn't stand out as a hot spot. SMOKE DETAIL LOW
   (CFG.smk): one puff per 2 x 2 tiles, a third bigger, no self-shade, no lamp light in it */
const SMK_VIS = 3, SMK_PUFF = 1.5, SMK_GROW = 0.9, SMK_PAD = 5, SMK_IN = 2.5, SMK_SMALL = 0.5;     // SMK_PAD: tiles past the view whose puffs can reach in
const SMK_SELF = [[6, 0.08], [14, 0.07], [24, 0.06]], SMK_DROP = 8;     // self-shade steps (px, opacity); the ground shadow's offset
const SMK_C = mkG(1, 1), SMK_SH = mkG(1, 1), SMK_L = mkG(1, 1);
/* each puff of the field in the tile box (null: all of them): f(x, y, radius, opacity, hash, brown part). The look eases in here (once a frame) */
function smokePuffs(bx, eyes, cb) {
  const f = M.gsf, [n0, n1] = SIGHT_NEAR, { W, A, B, R, V: Vs } = f, T = M.time, ease = Math.min(1, clamp(T - f.vt, 0, 0.1) * SMK_IN); f.vt = T;
  const [i0, j0, i1, j1] = bx || [-1, -1, 1e9, 1e9]; const lo = CFG.smk === 'low', rk = lo ? 1.35 : 1;
  for (const k of f.act) {
    const i = k % W, j = (k - i) / W; if (i < i0 || j < j0 || i >= i1 || j >= j1) continue;
    if (lo) { const b = k - (i & 1) - (j & 1) * W; if (k !== b && (A[b] > 0 || (k === b + W + 1 && (A[b + 1] > 0 || A[b + W] > 0)) || (k === b + W && A[b + 1] > 0))) continue; }     // LOW: the first smoky tile of each 2 x 2
    else if ((i + j) & 1 && (A[k + 1] > 0 || A[k - 1] > 0 || A[k + W] > 0 || A[k - W] > 0)) continue;
    const a = A[k], den = Vs[k] += (1 - Math.exp(-SMK_VIS * a) - Vs[k]) * ease, h = ((k * 2654435761) >>> 0) / 4294967296, p = h * TAU;
    const x = (i - SMK_OUT + 0.5) * GS + Math.sin(T * 0.35 + p) * 3, y = (j - SMK_OUT + 0.5) * GS + Math.cos(T * 0.27 + p) * 3, r = GS * (SMK_PUFF + SMK_GROW * R[k]) * (0.6 + 0.4 * den) * rk;
    let al = den * (0.85 + 0.15 * Math.sin(T * 0.45 + p)) * (SMK_SMALL + (1 - SMK_SMALL) * Math.min(1, r / (GS * 3))); for (const o of eyes) al *= SMOKE_KEEP + (1 - SMOKE_KEEP) * clamp((Math.hypot(x - o.x, y - o.y) - n0) / (n1 - n0), 0, 1);
    cb(x, y, r, al, h, B[k] / a);
  }
}
/* the light smoke takes, at 1 / SMK_LQ the size: the day (or night) as it falls at the smoke's height (SMK_Z), shaded only by
   what stands still and taller (walls, trees: their shadows cast down to it), never by the vehicles and men in it; and the
   point lights, flat a puff (smokeLamps) */
const SMK_LO = mkG(1, 1), SMK_LP = mkG(1, 1), SMK_LQ = 4, SMK_Z = 14, SMK_PF = [];
function smokeLight(X0, Y0, pw, ph) {
  const c = SMK_LO, q = SMK_LQ, w = Math.ceil(pw / q), h = Math.ceil(ph / q), T = sunTone(), col = a => `rgb(${a.map(v => clamp(v, 0, 1) * 255 | 0)})`;
  if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
  const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.fillStyle = col(T.li); g.fillRect(0, 0, w, h);
  const el = sunEl(); if (el >= 0.03) smokeShadows(g, X0, Y0, pw, ph, el, T, col);
  pipe('smk-shadows'); if (CFG.smk !== 'low') smokeLamps(g, X0, Y0, w, h); pipe('smk-lamps');
  return c;
}
/* the static shadows at the smoke's height, into its light */
function smokeShadows(g, X0, Y0, pw, ph, el, T, col) {
  const q = SMK_LQ;
  const t = 1 / Math.tan(el), ux = -Math.cos(SUN.az) * t, uy = -Math.sin(SUN.az) * t, far = Math.min(720, (SUNH.tree[0] - SMK_Z) * t);     // a height h's shadow: (h - SMK_Z) x (ux, uy) away
  const near = (x0, y0, x1, y1) => x1 + far > X0 && x0 - far < X0 + pw && y1 + far > Y0 && y0 - far < Y0 + ph;
  g.setTransform(1 / q, 0, 0, 1 / q, -X0 / q, -Y0 / q); g.fillStyle = g.strokeStyle = col(T.sh); g.lineCap = 'round'; if (!g.blur) g.filter = 'blur(1.5px)';     // soft: a shadow through haze (GL: blurred after, the same; no filter: the upscale's own blur)
  const quad = P => { g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.fill(); };
  const d = SUNH.wall - SMK_Z, vx = ux * d, vy = uy * d;
  for (const b of MAP.buildings) {     // the box swept down its shadow: its far end and the four sides between
    if (b.glass || !near(...rectBox(b))) continue;
    const C = rectPts(b);
    quad(C.map(([x, y]) => [x + vx, y + vy])); for (let k = 0; k < 4; k++) { const a = C[k], e = C[(k + 1) % 4]; quad([a, e, [e[0] + vx, e[1] + vy], [a[0] + vx, a[1] + vy]]); }
  }
  for (const s of MAP.statics) {     // a crown: from its underside's shadow to its top's
    if (!s.alive || s.type !== 'tree' || !near(s.x - 40, s.y - 40, s.x + 40, s.y + 40)) continue;
    const r = treeR(s), d0 = Math.max(0, SUNH.tree[1] - SMK_Z), d1 = SUNH.tree[0] - SMK_Z;
    g.lineWidth = r * 2; g.beginPath(); g.moveTo(s.x + ux * d0, s.y + uy * d0); g.lineTo(s.x + ux * d1 + 0.01, s.y + uy * d1); g.stroke();
  }
  if (g.blur) { g.setTransform(1, 0, 0, 1, 0, 0); g.blur(1.5, 0, 0, Math.ceil(pw / q), Math.ceil(ph / q)); } else g.filter = 'none';
}
/* the point lights, one flat colour a puff (SMK_PF: what drawSmokeField laid, x y r alpha): each puff's light at its middle,
   stacked as the puffs are (source-over by their alpha), added on */
function smokeLamps(g, X0, Y0, w, h) {
  const L = _sun.ln, P = SMK_PF; if (!L || !L.length || !P.length) return;
  const c = SMK_LP, q = SMK_LQ; if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
  const p = c.getContext('2d'); p.setTransform(1, 0, 0, 1, 0, 0); p.globalAlpha = 1; p.fillStyle = '#000'; p.fillRect(0, 0, w, h); p.setTransform(1 / q, 0, 0, 1 / q, -X0 / q, -Y0 / q);
  let any = false;
  for (let i = 0; i < P.length; i += 4) {
    const [r, gg, b] = lightAir(L, P[i], P[i + 1], SMK_Z); if (r + gg + b < 0.01) { p.globalAlpha = P[i + 3]; p.fillStyle = '#000'; } else { any = true; p.globalAlpha = P[i + 3]; p.fillStyle = `rgb(${Math.min(255, r * 255) | 0},${Math.min(255, gg * 255) | 0},${Math.min(255, b * 255) | 0})`; }
    p.beginPath(); p.arc(P[i], P[i + 1], P[i + 2] * 0.75, 0, TAU); p.fill();
  }
  p.globalAlpha = 1; if (!any) return;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.drawImage(c, 0, 0, w, h, 0, 0, w, h); g.globalCompositeOperation = 'source-over';
}
function drawSmokeField(vw, eyes) {
  const f = M.gsf, V = vw ? [(vw.x - VOX) / VZ, (vw.y - VOY) / VZ, (vw.x + vw.w - VOX) / VZ, (vw.y + vw.h - VOY) / VZ].map(v => v / GS + SMK_OUT) : [-1e9, -1e9, 1e9, 1e9];
  if (f.dirty) smokeSolid(f);
  const i0 = Math.max(f.box[0] - SMK_PAD, Math.floor(V[0]) - SMK_PAD), j0 = Math.max(f.box[1] - SMK_PAD, Math.floor(V[1]) - SMK_PAD), i1 = Math.min(f.box[2] + SMK_PAD, Math.ceil(V[2]) + SMK_PAD), j1 = Math.min(f.box[3] + SMK_PAD, Math.ceil(V[3]) + SMK_PAD);
  const X0 = (i0 - SMK_OUT) * GS, Y0 = (j0 - SMK_OUT) * GS, pw = (i1 - i0) * GS, ph = (j1 - j0) * GS;
  if (pw <= 0 || ph <= 0) return;
  if (SMK_C.width < pw || SMK_C.height < ph) { SMK_C.width = SMK_SH.width = SMK_L.width = Math.max(pw, SMK_C.width); SMK_C.height = SMK_SH.height = SMK_L.height = Math.max(ph, SMK_C.height); }
  const g = SMK_C.getContext('2d'), gs = SMK_SH.getContext('2d');
  g.setTransform(1, 0, 0, 1, -X0, -Y0); g.globalCompositeOperation = 'source-over'; g.clearRect(X0, Y0, pw, ph);
  SMK_PF.length = 0;
  smokePuffs([i0, j0, i1, j1], eyes, (x, y, r, al, h, fb) => {
    SMK_PF.push(x, y, r, al);
    const s = (h * 16 | 0) % 4, v = (h * 64 | 0) & 1, k2 = v ? 0.7 : 1;
    if (fb < 0.98) { g.globalAlpha = al * k2 * (1 - fb); g.drawImage(SPR.puffs.grey[s][v], x - r, y - r, r * 2, r * 2); }
    if (fb > 0.02) { g.globalAlpha = al * k2 * fb; g.drawImage(SPR.puffs.brown[s][v], x - r, y - r, r * 2, r * 2); }
  });
  pipe('smk-puffs'); g.globalAlpha = 1; g.globalCompositeOperation = 'destination-out'; g.beginPath();     // the walls and intact windows: smoke stays out of them, and what's beyond
  for (const b of MAP.buildings) { const q = rectBox(b); if (q[0] < X0 + pw && q[2] > X0 && q[1] < Y0 + ph && q[3] > Y0 && !(b.glass && b.sec && b.sec.hp < b.sec.mhp)) { const C = rectPts(b); g.moveTo(C[0][0], C[0][1]); for (let k = 1; k < 4; k++) g.lineTo(C[k][0], C[k][1]); g.closePath(); } }
  g.fill(); g.globalCompositeOperation = 'source-over';
  pipe('smk-cut'); gs.globalCompositeOperation = 'copy'; gs.drawImage(SMK_C, 0, 0, pw, ph, 0, 0, pw, ph); gs.globalCompositeOperation = 'source-in'; gs.fillStyle = '#000'; gs.fillRect(0, 0, pw, ph); gs.globalCompositeOperation = 'source-over';
  const ux = -Math.cos(SUN.az), uy = -Math.sin(SUN.az);     // away from the sun
  pipe('smk-sh'); g.globalCompositeOperation = 'source-atop'; if (CFG.smk !== 'low') for (const [d, o] of SMK_SELF) { g.globalAlpha = o; g.drawImage(SMK_SH, 0, 0, pw, ph, X0 + ux * d, Y0 + uy * d, pw, ph); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  pipe('smk-self'); ctx.globalAlpha = 0.28; ctx.drawImage(SMK_SH, 0, 0, pw, ph, X0 + ux * SMK_DROP, Y0 + uy * SMK_DROP, pw, ph);
  ctx.globalAlpha = 1;
  const S = SUNNOW && vw && _sun && _sun.lit; if (!S) { ctx.drawImage(SMK_C, 0, 0, pw, ph, X0, Y0, pw, ph); return; }
  // lit as the air it's in (smokeLight: not the ground's shade under it, which carries all that's in it): the smoke over black, times that,
  // then in place of what it covers (cut out, added): exact where it's thin too
  pipe('smk-drop'); const l = SMK_L.getContext('2d'), wx = (vw.x - VOX) / VZ, wy = (vw.y - VOY) / VZ, ww = vw.w / VZ, wh = vw.h / VZ;
  l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = 'source-over'; l.fillStyle = '#000'; l.fillRect(0, 0, pw, ph); l.drawImage(SMK_C, 0, 0, pw, ph, 0, 0, pw, ph);
  l.globalCompositeOperation = 'multiply'; l.imageSmoothingEnabled = true; l.drawImage(smokeLight(X0, Y0, pw, ph), 0, 0, Math.ceil(pw / SMK_LQ), Math.ceil(ph / SMK_LQ), 0, 0, Math.ceil(pw / SMK_LQ) * SMK_LQ, Math.ceil(ph / SMK_LQ) * SMK_LQ); l.globalCompositeOperation = 'source-over';
  pipe('smk-lit'); ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
  ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(SMK_C, 0, 0, pw, ph, X0, Y0, pw, ph);
  ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(SMK_L, 0, 0, pw, ph, X0, Y0, pw, ph); ctx.restore();
}
/* a wreck: solid cover, then gone over its last 2 s (also drawn into the remembered view) */
function drawWreck(w) {
  const al = clamp(w.t / 2, 0, 1);   // solid cover, then gone over its last 2 s
  worldT(); ctx.globalAlpha = SUNNOW ? 0 : 0.3 * al; ctx.fillStyle = '#000'; const T = VT[w.type]; ctx.save(); ctx.translate(w.x + 4, w.y + 6); ctx.rotate(w.a); rr(ctx, -T.hl, -T.hw, T.hl * 2, T.hw * 2, 8); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1;     // the live vehicle's shadow
  if (w.type === 'tank') {
    const tx = w.x - 4 * Math.cos(w.a), ty = w.y - 4 * Math.sin(w.a), c = Math.cos(w.ta), s = Math.sin(w.ta);
    const t = wreckTrack(w); if (t) spr('track2', t[0], t[1], w.a, 1, t[4], al);
    spr('hull4', w.x, w.y, w.a, 1, 1, al); spr('tur_dead', tx, ty, w.ta, 1, 1, al);
    spr('mg_dead', tx - 6 * c + 9 * s, ty - 6 * s - 9 * c, w.ta + 0.9, 1, 1, al);
  } else { if (w.bx !== undefined) spr(w.bf ? 'jeep_flat' : 'jeep_wheel', w.bx, w.by, w.ba, 1, 1, al); drawJeepWheels(w.x, w.y, w.a, 0, al, w.bw); spr('jeep4', w.x, w.y, w.a, 1, 1, al); spr('mg_dead', w.x - 22 * Math.cos(w.a), w.y - 22 * Math.sin(w.a), w.a + 2.4, 1, 1, al); }
}
/* a jeep's front tyres in their wells (EXTRA.jeepWells), under the body, turned by steer; bw 0 / 1: that one broke off
   (it lies on the ground on its own, see wreckWheel) */
function drawJeepWheels(x, y, a, steer, al, bw) {
  const c = Math.cos(a), s = Math.sin(a), [wx, wy] = EXTRA.jeepWells[0];
  for (const sd of [-1, 1]) if (bw !== (sd < 0 ? 0 : 1)) spr('jeep_tire', x + c * wx - s * wy * sd, y + s * wx + c * wy * sd, a + steer, 1, 1, al);
}
/* the front wheels' angle from how the jeep is turning (tan δ = turn rate x wheelbase / speed), eased; works the same for
   joiners, from the motion they see. Reversing turns them the right way round too */
const JEEP_WB = 46, JEEP_LOCK = 0.55;
function jeepSteer(v) {
  const t = M.time, dt = t - (v._sT || 0);
  if (dt > 0 && dt < 0.5) {
    const fwd = ((v.x - v._sx) * Math.cos(v.a) + (v.y - v._sy) * Math.sin(v.a)) / dt, w = angDiff(v._sa, v.a) / dt;
    const want = Math.abs(fwd) > 12 ? clamp(Math.atan(w * JEEP_WB / fwd), -JEEP_LOCK, JEEP_LOCK) : v._wa || 0;
    v._wa = lerp(v._wa || 0, want, 1 - Math.exp(-dt * 10));
  }
  if (dt) { v._sT = t; v._sx = v.x; v._sy = v.y; v._sa = v.a; }
  return v._wa || 0;
}
/* where this view's players are looking from */
function viewEyes(vw) {
  if (!M || M.demo) return [];
  return viewSols(vw).map(s => ({ x: posOf(s).x, y: posOf(s).y, team: s.team, s }));
}
/* an enemy in smoke / behind glass: with vision on, the soft mask already fades him (only skip him once he's gone); with it
   off, hidden once it takes him under SIGHT_MIN */
function smokeHides(eyes, o, vw) {
  if (!eyes.length || (!smokeAny() && !MAP.glass.length) || eyes.some(e => e.s === o || (!M.ffa && e.team === o.team))) return false;
  let k = 0; for (const e of eyes) k = Math.max(k, 1 - softOcc(e.x, e.y, o.x, o.y));
  return vw._fog ? k < 0.02 : k < SIGHT_MIN;
}
/* recon lasers: visible to everyone, brighter when aiming down sights; they stop at the first wall, tree, hay bale, vehicle or soldier */
function drawLasers(vis) {
  worldT(); ctx.lineWidth = 1.2 / VZ + 0.4;
  for (const s of M.sol) {
    if (!s.alive || s.veh || s.swim || !s.w || !WPN[cw(s).id].scope || !vis(s.x, s.y, 900)) continue;
    const [x, y] = gunTip(s), x1 = x + Math.cos(s.a) * 900, y1 = y + Math.sin(s.a) * 900; let t = 1;
    const hit = k => { if (k >= 0 && k < t) t = k; };
    for (const b of rectsOnSeg(MAP.buildings, x, y, x1, y1, _rq)) if (!b.glass) hit(segRect(x, y, x1, y1, b, 0));
    for (const o of staticsNear((x + x1) / 2, (y + y1) / 2, 462, _near)) if (o.type === 'tree' || o.type === 'hay') hit(segCirc(x, y, x1, y1, o.x, o.y, o.type === 'hay' ? 12 : o.r - 1));
    for (const v of M.vehicles) if (v.active) { const [ax, ay] = toLocal(v, x, y), [bx, by] = toLocal(v, x1, y1); hit(segRect(ax, ay, bx, by, { x: -v.T.hl, y: -v.T.hw, w: v.T.hl * 2, h: v.T.hw * 2 }, 0)); }
    for (const o of M.sol) if (o !== s && o.alive) hit(segRect(x, y, x1, y1, { x: o.x - 8, y: o.y - 8, w: 16, h: 16 }, 0));
    const ex = x + (x1 - x) * t, ey = y + (y1 - y) * t;
    const al = s.ads ? 0.6 : 0.28;
    ctx.strokeStyle = `rgba(255,40,30,${al})`; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = s.ads ? 0.9 : 0.6; const gd = ctx.createRadialGradient(ex, ey, 0, ex, ey, 4.5); gd.addColorStop(0, 'rgba(255,70,50,0.9)'); gd.addColorStop(1, 'rgba(255,20,10,0)'); ctx.fillStyle = gd; ctx.fillRect(ex - 4.5, ey - 4.5, 9, 9); ctx.fillStyle = '#ff3020'; ctx.fillRect(ex - 1, ey - 1, 2, 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';      // red dot where it lands
  }
}
/* snow falls between the camera and the ground: five depth layers sliding 1.3x-2.3x as far as the ground when the
   camera moves (nearer = bigger, brighter), and the whole lot fades to half while the camera is moving */
const SNOWCAM = new WeakMap();
function drawSnow(vw) {
  const cam = vw.cam, st = SNOWCAM.get(cam) || { x: cam.x, y: cam.y, v: 0 };
  st.v = lerp(st.v, Math.hypot(cam.x - st.x, cam.y - st.y) * cam.z, 0.12); st.x = cam.x; st.y = cam.y; SNOWCAM.set(cam, st);
  const fade = 1 - 0.5 * clamp(st.v / 3, 0, 1), n = Math.round(vw.w * vw.h / 2600), t = M.time;
  ctx.fillStyle = CFG.style === 'grit' ? '#dcdedc' : '#fff';
  for (let L = 0; L < 5; L++) {
    const k = 1.3 + L * 0.25, r = 0.9 + L * 0.45; ctx.globalAlpha = fade * (0.45 + L * 0.1);
    for (let i = L; i < n; i += 5) {
      const sp = 30 + (i % 7) * 9 + L * 8, sx = (i * 137.5 + Math.sin(t * 0.7 + i) * 18 + t * 22 - cam.x * cam.z * k) % vw.w, sy = (i * 71.3 + t * sp - cam.y * cam.z * k) % vw.h;
      ctx.fillRect(vw.x + (sx + vw.w) % vw.w, vw.y + (sy + vw.h) % vw.h, r, r);
    }
  }
  ctx.globalAlpha = 1;
}
function humanTeams() { return new Set(LOCALS().map(p => p.sol ? p.sol.team : p.team)); }
/* which body sprite: hands busy (throwing / repairing / setting a gadget down), a launcher, or a rifle */
function bodyPose(s) { const W_ = s.w ? WPN[cw(s).id] : null; return s.throwT > 0 || s.torch || s.handT > 0 ? 'nogun' : W_ && W_.rocket ? 'rpg' : 'stand'; }
function drawRain(vw) {
  ctx.strokeStyle = CFG.style === 'grit' ? 'rgba(190,195,200,0.35)' : 'rgba(200,220,255,0.4)'; ctx.lineWidth = 1; ctx.beginPath();
  const n = Math.round(vw.w * vw.h / 3500), t = M.time;
  for (let i = 0; i < n; i++) {
    const sx = (i * 137.5 + t * 260 + vw.cam.x * -vw.cam.z * 0.2) % vw.w, sy = (i * 71.3 + t * 900) % vw.h;
    const x = vw.x + (sx + vw.w) % vw.w, y = vw.y + (sy + vw.h) % vw.h; ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 14);
  }
  ctx.stroke();
  worldT(); ctx.strokeStyle = 'rgba(220,230,240,0.35)';
  for (let i = 0; i < 18; i++) { const x = vw.cam.x + ((i * 211 + Math.floor(t * 7) * 97) % 900) - 450, y = vw.cam.y + ((i * 157 + Math.floor(t * 7) * 61) % 600) - 300, r = ((t * 7) % 1) * 6; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
  screenT();
}
function drawSoldier(s, vw) {
  worldT();
  if (s.swim) {
    ctx.strokeStyle = 'rgba(220,235,240,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(s.x, s.y, 10 + Math.sin(M.time * 6) * 1.5, 0, TAU); ctx.stroke();
    solDraw(s, solSpr(s.color, 'nogun'), s.x, s.y, s.a, 0.85, 0.85, 0.85); return;
  }
  if (s.down) { drawDowned(s); return; }
  const W_ = s.w ? WPN[cw(s).id] : null, body = bodyPose(s), gunless = body === 'nogun';
  const shadow = solShadow(body), jk = jumpK(s), lift = 1 + 0.15 * jk;
  if (!M.ffa) { ctx.strokeStyle = TEAMHEX[s.team]; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(s.x, s.y, shadow ? 14 : 11, shadow ? 14 : 11, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
  if (s.spotT > 0 && vw && vw.p && vw.p.sol && s.spotTeam === vw.p.sol.team) { ctx.strokeStyle = '#ff4030'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(s.x - 6, s.y - 22); ctx.lineTo(s.x, s.y - 16); ctx.lineTo(s.x + 6, s.y - 22); ctx.stroke(); }
  const al = s.protect > 0 && Math.floor(M.time * 12) % 2 ? 0.45 : undefined;
  if (s.stance === 1) { solDraw(s, solSpr(s.color, legFrame(s)), s.x, s.y, s.a, 1, 1, al); solDraw(s, solSpr(s.color, body), s.x, s.y, s.a, 1, 1, al); }
  else {
    if (s.moving && jk === 0) {
      const ph = Math.sin(s.walkT / 5), c = Math.cos(s.a), sn = Math.sin(s.a), w = shadow ? 5 : 3.5;
      ctx.fillStyle = '#1a1a16';
      for (const side of [-1, 1]) { const f = ph * side * 4, lx = s.x + c * f - sn * side * w, ly = s.y + sn * f + c * side * w; ctx.fillRect(lx - 1.5, ly - 1.5, 3, 3); }
    }
    const bob = (s.moving && jk === 0 ? 1 + Math.abs(Math.sin(s.walkT / 10)) * 0.05 : 1) * lift;
    solDraw(s, solSpr(s.color, body), s.x, s.y, s.a + (s.meleeT > 0 ? Math.sin(s.meleeT / 0.18 * Math.PI) * 0.5 : 0), bob, bob, al);
  }
  // what's in the soldier's hands: the repair wrench (cranking back and forth), a grenade mid-throw, or the gadget being set down
  if (s.torch) {
    worldT(); ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); ctx.translate(6, 0); ctx.rotate(Math.sin(M.time * 13 + s.id) * 0.45);
    ctx.fillStyle = '#2a2a26'; ctx.fillRect(-1, -2.4, 14, 4.8); ctx.fillStyle = '#9a9c96'; ctx.fillRect(0, -1.6, 12, 3.2);
    ctx.fillStyle = '#2a2a26'; ctx.fillRect(10.5, -5.4, 9, 10.8); ctx.fillStyle = '#b4b6b0'; ctx.fillRect(11.5, -4.4, 7, 2.8); ctx.fillRect(11.5, 1.6, 7, 2.8); ctx.fillRect(11.5, -4.4, 2.6, 8.8);
    ctx.restore();
  } else if (s.handT > 0 && s.handK) { worldT(); const [hx, hy] = muzzle(s, 11); icon(gadgetIconKind(s.handK), hx, hy, 9); }
  if (s.flash > 0 && !gunless) { const [gx, gy] = gunTip(s), r = W_ && W_.dmg >= 40 ? 14 : 10, c = Math.cos(s.a), sn = Math.sin(s.a); flashAt(gx + c * r * 0.55, gy + sn * r * 0.55, r); light(gx + c * r, gy + sn * r, r * 9, gunH(s), rnd(0.6, 0.8)); }     // at the muzzle
}
/* co-op: a downed player lies on the ground with a pulsing marker; the red ring is the time left to bleed out, the green one the revive */
function drawDowned(s) {
  solDraw(s, solSpr(s.color, 'dead'), s.x, s.y, s.a + Math.PI, 1, 1); worldT();
  const p = 0.5 + 0.5 * Math.sin(M.time * 5);
  ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,90,69,${0.25 + 0.3 * p})`; ctx.beginPath(); ctx.arc(s.x, s.y, 16, 0, TAU); ctx.stroke();
  ctx.strokeStyle = '#ff5a45'; ctx.beginPath(); ctx.arc(s.x, s.y, 16, -Math.PI / 2, -Math.PI / 2 + TAU * clamp((s.bleed || 0) / 30, 0, 1)); ctx.stroke();
  if (s.rev > 0) { ctx.lineWidth = 3; ctx.strokeStyle = '#7dff7a'; ctx.beginPath(); ctx.arc(s.x, s.y, 20, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(s.rev, 0, 1)); ctx.stroke(); }
  const cy = s.y - 22 - p * 2; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(s.x - 5, cy - 5, 10, 10);
  ctx.fillStyle = '#fff'; ctx.fillRect(s.x - 4, cy - 1.5, 8, 3); ctx.fillRect(s.x - 1.5, cy - 4, 3, 8);
}
const jumpK = s => s.jumpT > 0 ? Math.sin(Math.PI * clamp(1 - s.jumpT / 0.42, 0, 1)) : 0;
/* prone legs: frame 0 lying still, 1 / 0 / 2 / 0 while crawling */
function legFrame(s) { return s.moving ? 'leg' + [1, 0, 2, 0][Math.floor(s.walkT / 7) % 4] : 'leg0'; }
/* without the sun's light (DYNAMIC LIGHTING off): drop shadows. Every part of a soldier or vehicle (partsOf, as the light
   has them) as a black silhouette, laid from its base's height to its top's along the sun (SHD.k px per px up, capped), so
   what's taller throws further; into one layer at a quarter resolution (overlaps don't darken twice; scaled up smoothed:
   soft), laid on at one opacity. A GL surface in GL (no upload) */
const SHD = { step: 2, kMax: 0.45, q: 0.25 }, SHG = mkG(1, 1);     // q: the layer's resolution (scaled up smoothed: the softening)
function drawShadowLayer(vw, vis) {
  const C = SHG, q = SHD.q, cw = Math.ceil(cv.width * q), ch = Math.ceil(cv.height * q); if (C.width !== cw || C.height !== ch) { C.width = cw; C.height = ch; }
  const main = ctx, d0 = DPR, X = vw.x * d0, Y = vw.y * d0, Wd = vw.w * d0, Ht = vw.h * d0; ctx = C.getContext('2d'); DPR = d0 * q;     // drawn at q (spr, worldT read DPR)
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(X * q - 1, Y * q - 1, Wd * q + 2, Ht * q + 2); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 1;
  const k = Math.min(SHD.kMax, 1 / Math.tan(sunEl())), ux = -Math.cos(SUN.az) * k, uy = -Math.sin(SUN.az) * k, eyes = viewEyes(vw);
  const cast = o => { for (const p of partsOf(o)) { const b = p.b, t = p.b + p.add + artMax(p.n), n = Math.max(1, Math.ceil((t - b) * k / SHD.step)); for (let i = 0; i <= n; i++) { const h = b + (t - b) * i / n; spr(p.n, p.x + ux * h, p.y + uy * h, p.a, 1, p.fy); } } };
  for (const s of M.sol) if (s.alive && !s.down && !s.veh && !s.swim && vis(s.x, s.y, 30) && !smokeHides(eyes, s, vw)) cast(s);
  for (const v of M.vehicles) if (v.active && vis(v.x, v.y, 80)) cast(v);
  worldT(); ctx.fillStyle = '#000';
  for (const f of M.flings) { if (!vis(f.x, f.y, 40)) continue; const h = Math.sin(Math.PI * f.t / f.T); ctx.beginPath(); ctx.ellipse(f.x, f.y + 4, 10 * (1 - h * 0.3), 6 * (1 - h * 0.3), 0, 0, TAU); ctx.fill(); }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-atop'; ctx.fillRect(X * q - 1, Y * q - 1, Wd * q + 2, Ht * q + 2); ctx.globalCompositeOperation = 'source-over';     // the colours gone: silhouettes
  DPR = d0; ctx = main;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = CFG.style === 'grit' ? 0.42 : 0.36; ctx.imageSmoothingEnabled = true;
  ctx.drawImage(C, X * q, Y * q, Wd * q, Ht * q, X, Y, Wd, Ht);
  ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false; worldT();
}
function solDraw(s, n, x, y, a, sx, sy, al) {
  if (!s.dark) { spr(n, x, y, a, sx, sy, al); return; }
  const m = ATLAS[n]; if (!m) return; const c = darkSpr(n), cs = Math.cos(a), sn = Math.sin(a), k = VZ * DPR; sx = sx || 1; sy = sy || 1;
  ctx.setTransform(cs * k * sx, sn * k * sx, -sn * k * sy, cs * k * sy, (x * VZ + VOX) * DPR, (y * VZ + VOY) * DPR);
  if (al !== undefined) ctx.globalAlpha = al; ctx.drawImage(c, -m[4], -m[5]); if (al !== undefined) ctx.globalAlpha = 1;
}
/* a muzzle flash: a hot glow of radius r (soft: the gentler core the MG's light uses) */
function flashAt(x, y, r, soft) {
  worldT();
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = soft ? 0.75 : 0.9; ctx.drawImage(soft ? SPR.flashSoft : SPR.flash, x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
/* the tank's tracks (track0 / 1: the right one; the left is it mirrored), centred this far off the hull's pivot (from the
   art they were cut from): under the hull, standing on its underside. The wreck has none: at most one torn track2 at a rear
   corner (w.tr -1 the left, 1 the right, 0 neither) */
const TRACK = { x: 0.3, y: [-23.5, 24.5], wx: -64.7 };
/* where sprite n goes for its centre to be at (cx, cy) off o's pivot, mirrored if fy -1: [x, y, its pivot off o's: lx, ly] */
function trackAt(o, n, cx, cy, fy) { const m = ATLAS[n], lx = cx + m[4] - m[2] / 2, ly = cy + fy * (m[5] - m[3] / 2); return [...toWorld(o, lx, ly), lx, ly]; }
/* this frame's tracks, left then right: [name, fy, x, y, lx, ly]. Each rolls by how far its side went (turning takes one
   side back, the other on), a frame every 2 px: the links are 4 px apart, track1 is track0 rolled 2 */
function tracks(v) {
  const k = v.trk || (v.trk = { f: -1, x: v.x, y: v.y, a: v.a, d: [0, 0] });
  if (k.f !== FRAMEN) {
    const da = angDiff(k.a, v.a), fw = (v.x - k.x) * Math.cos(v.a) + (v.y - k.y) * Math.sin(v.a);
    if (Math.abs(fw) < 40) for (const i of [0, 1]) k.d[i] += fw - da * TRACK.y[i];     // not a respawn's jump
    k.f = FRAMEN; k.x = v.x; k.y = v.y; k.a = v.a;
  }
  return [0, 1].map(i => { const n = 'track' + (Math.floor(k.d[i] / 2) & 1), fy = i ? 1 : -1; return [n, fy, ...trackAt(v, n, TRACK.x, TRACK.y[i], fy)]; });
}
/* the wreck's torn track (or null): [x, y, lx, ly, fy]; the art is the left one */
const wreckTrack = w => w.tr ? [...trackAt(w, 'track2', TRACK.wx, TRACK.y[w.tr > 0 ? 1 : 0], -w.tr), -w.tr] : null;
function hullFrame(v) { const f = v.hp / v.T.hp; return f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3; }     // the wreck: hull4
function drawVehicle(v) {
  worldT(); FLASH = v.hitFlash > 0 ? 0.45 : 0;
  if (v.type !== 'nest' && v.hp < v.T.hp * 0.25) light(v.x, v.y, 100, topOf(v) + 6, 0.3 + 0.12 * Math.sin(M.time * 23 + v.x) * Math.sin(M.time * 9.7), v);     // on fire (as a burning wreck flickers)
  const col = vehColor(v);
  if (v.type === 'nest') {
    ctx.fillStyle = CFG.style === 'grit' ? '#3e3a2c' : '#5a5236'; ctx.beginPath(); ctx.arc(v.x, v.y, 18, 0, TAU); ctx.fill();
    for (let k = -3; k <= 3; k++) { const a = v.a + k * 0.42; img(SPR.bag, v.x + Math.cos(a) * 18, v.y + Math.sin(a) * 18, a + Math.PI / 2, 1); }
    worldT();
    const [mx, my] = mgPos(v);
    drawMG(v, mx, my);
    const g = v.seats[0]; if (g) drawSeated(g, true);
    FLASH = 0;
    if (v.hp < v.T.hp && v.hitFlash > -2) { const f = v.hp / v.T.hp; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(v.x - 14, v.y - 26, 28, 3); ctx.fillStyle = f > 0.5 ? '#7dff7a' : '#ff9a30'; ctx.fillRect(v.x - 14, v.y - 26, 28 * f, 3); }
    return;
  }
  if (v.type === 'tank') {
    for (const [n, fy, x, y] of tracks(v)) spr(n, x, y, v.a, 1, fy);
    const hn = 'hull' + hullFrame(v), hm = ATLAS[hn]; sprC(vehSkin(hn, col), hm[4], hm[5], v.x, v.y, v.a);
    for (const i of [2, 3]) { const s = v.seats[i]; if (s) drawSeated(s); }
    const [px, py] = turretPivot(v), kick = clamp(v.recoil, 0, 1) * KICK, tf = turFrame(v), tm = ATLAS['tur' + tf], gm = ATLAS['tur_gun' + tf];
    sprC(vehSkin('tur_gun' + tf, col), gm[4], gm[5], px - Math.cos(v.ta) * kick, py - Math.sin(v.ta) * kick, v.ta);
    sprC(vehSkin('tur' + tf, col), tm[4], tm[5], px, py, v.ta);
    const [mx, my] = mgPos(v);
    drawMG(v, mx, my);
    const g = v.seats[1]; if (g) drawSeated(g, true);
    if (v.recoil > 0.85) { const fx = px + Math.cos(v.ta) * (BARREL + 4), fy = py + Math.sin(v.ta) * (BARREL + 4); flashAt(fx, fy, 26); light(fx, fy, 220, canH(v), (v.recoil - 0.85) / 0.15, v); }
  } else {
    const f = v.hp / v.T.hp, jn = 'jeep' + (f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3), jm = ATLAS[jn];
    drawJeepWheels(v.x, v.y, v.a, jeepSteer(v), 1, -1);
    sprC(vehSkin(jn, col), jm[4], jm[5], v.x, v.y, v.a);
    for (const i of [0, 1]) { const s = v.seats[i]; if (s) drawSeated(s); }
    const [mx, my] = mgPos(v);
    drawMG(v, mx, my);
    const g = v.seats[2]; if (g) drawSeated(g, true, jeepGunner(v));
  }
  FLASH = 0;
}
/* the mounted MG (art/art4/jeep.png): firing frame + a soft glow while it shoots; drawn under its gunner, who holds the grips */
function drawMG(v, mx, my) {
  const f = v.mgFlash > 0; spr(f ? 'mg_f' : 'mg', mx, my, v.mgA);
  if (f) { const fx = mx + Math.cos(v.mgA) * 31, fy = my + Math.sin(v.mgA) * 31; flashAt(fx, fy, 8, true); light(fx, fy, 120 * rnd(0.88, 1.1), mgH(v), rnd(0.75, 1), v); }
}
function drawSeated(s, mg, at) {     // at: where he stands (the jeep's gunner, behind his gun)
  const role = s.veh.T.seats[s.seat].role, jeep = s.veh.type === 'jeep';
  // drivers, jeep passengers and the tank / nest gunners sit; the jeep's gunner stands in the bed behind the MG; tank riders keep their rifle up
  const pose = !at && (role === 'drive' || mg || (jeep && role === 'rifle' && !s.flash)) ? 'sit' : 'stand', [x, y] = at || [s.x, s.y];
  const fl = FLASH; FLASH = 0; solDraw(s, solSpr(s.color, pose), x, y, at ? s.veh.mgA : s.a, 0.9, 0.9); FLASH = fl;     // the crew doesn't flash with the vehicle
  if (s.flash > 0 && !mg && role !== 'drive') { const [mx, my] = muzzle(s, 20); flashAt(mx, my, 8); light(mx, my, 90, gunH(s), rnd(0.6, 0.8)); }
}
const FIRE = ['fire0', 'fire2', 'fire3', 'fire4'], SMOKE = ['smoke0', 'smoke1', 'smoke2', 'smoke3'], BOOM = ['boom0', 'boom1', 'boom2'];
/* each kind's height (px) in the draw order, and how it's drawn: 0 lit, 1 over the light, 2 over the light, added */
const PZ = { ripple: [0, 0], blood: [0.5, 0], shell: [1, 0], dirt: [2, 0], straw: [2, 0], dust: [3, 0], debris: [3, 0], splinter: [3, 0], leaf: [4, 0],
  ring: [1, 2], flash: [30, 2], spark: [30, 2], fire: [44, 1], boom: [44, 1], smoke: [48, 1], steam: [48, 1] };
const _pb = {};
function partsInto(at, vis) {     // one bucket per kind, each drawn at its height
  for (const k in _pb) _pb[k].length = 0;
  for (const q of M.parts) if (PZ[q.k] && vis(q.x, q.y, q.sz + 30)) (_pb[q.k] || (_pb[q.k] = [])).push(q);
  for (const k in _pb) if (_pb[k].length) (AK = 'particles · ' + k, at)(PZ[k][0], () => drawParts(k, _pb[k]), PZ[k][1] > 0);
}
function drawParts(k, qs) {
  worldT(); if (PZ[k][1] === 2) ctx.globalCompositeOperation = 'lighter';
  for (const q of qs) {
    const a = clamp(q.life / q.max, 0, 1);
    switch (k) {
      case 'smoke': { if (q.v === undefined) q.v = rint(0, 3); const sc = q.sz / 22; spr(SMOKE[q.v], q.x, q.y, q.v * 1.7 + q.life * 0.2, sc, sc, a * 0.6); break; }
      case 'dust': { if (q.v === undefined) q.v = rint(0, 1); const sc = q.sz / 26; spr('dust' + q.v, q.x, q.y, q.v * 2, sc, sc, a * 0.45); break; }
      case 'steam': ctx.globalAlpha = a * 0.5; ctx.drawImage(SPR.steam, q.x - q.sz, q.y - q.sz, q.sz * 2, q.sz * 2); break;
      case 'ripple': worldT(); ctx.globalAlpha = a * 0.5; ctx.strokeStyle = '#d8e8ee'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q.x, q.y, q.sz * (1.2 - a), 0, TAU); ctx.stroke(); break;
      case 'debris': worldT(); ctx.globalAlpha = 1; ctx.fillStyle = '#1e1e1a'; ctx.fillRect(q.x - q.sz / 2, q.y - q.sz / 2, q.sz, q.sz); break;
      case 'dirt': worldT(); ctx.globalAlpha = a; ctx.fillStyle = '#8a6a30'; ctx.fillRect(q.x - q.sz / 2, q.y - q.sz / 2, q.sz, q.sz); break;
      case 'splinter': worldT(); ctx.globalAlpha = a; ctx.fillStyle = '#6a5034'; ctx.fillRect(q.x - q.sz / 2, q.y - 0.7, q.sz, 1.4); break;
      case 'straw': worldT(); ctx.globalAlpha = a; ctx.fillStyle = '#c8a64e'; ctx.fillRect(q.x - q.sz / 2, q.y - 0.6, q.sz, 1.2); break;
      case 'leaf': worldT(); ctx.globalAlpha = a; ctx.fillStyle = CFG.style === 'grit' ? '#3b4622' : '#1f6e1a'; ctx.fillRect(q.x - q.sz / 2, q.y - q.sz / 2, q.sz, q.sz * 0.6); break;
      case 'shell': worldT(); ctx.globalAlpha = 1; ctx.fillStyle = '#d6b04a'; ctx.fillRect(q.x - 1, q.y - 0.5, 2.5, 1.2); break;
      case 'blood': worldT(); bloodDrop(ctx, q.x, q.y, q.sz * 0.8, q.rot, 1); break;
      case 'fire': { if (q.v === undefined) q.v = rint(0, 3); const sc = q.sz / 20 * (0.6 + 0.6 * (1 - a)); spr(FIRE[q.v], q.x, q.y, q.v + q.life, sc, sc, a * 0.95); break; }
      case 'boom': { const k = 1 - a, sc = q.sz * (0.6 + k * 0.9); spr(BOOM[q.v], q.x, q.y, q.rot + k * 0.6, sc, sc, Math.min(1, a * 1.6)); break; }
      case 'flash': ctx.globalAlpha = a * 0.5; ctx.drawImage(SPR.flash, q.x - q.sz / 2, q.y - q.sz / 2, q.sz, q.sz); break;
      case 'spark': ctx.globalAlpha = a; ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = q.sz; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.02, q.y - q.vy * 0.02); ctx.stroke(); break;
      case 'ring': ctx.globalAlpha = a * 0.5; ctx.strokeStyle = '#ffe2a0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(q.x, q.y, q.sz * (1 - a * 0.7), 0, TAU); ctx.stroke(); break;
    }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

/* ---------------- HUD ---------------- */
function txt(s, x, y, size, col, align, base, font) { ctx.font = `${size}px ${font || FB}`; ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.textBaseline = base || 'alphabetic'; ctx.fillText(s, x, y); }
function stxt(s, x, y, size, col, align, base, font) { ctx.font = `${size}px ${font || FB}`; ctx.textAlign = align || 'left'; ctx.textBaseline = base || 'alphabetic'; ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(s, x + 1.5, y + 1.5); ctx.fillStyle = col; ctx.fillText(s, x, y); }
function miniRect() {
  const many = M.views.length > 1, mw = clamp(W * (many ? 0.14 : 0.16), 110, 220), mh = mw * WH / WW;
  if (!many && touchPlayer() && state !== 'lobby') return { many, mw, mh, mx: SAFE.l + 12, my: SAFE.t + 52 };
  return { many, mw, mh, mx: many ? W / 2 - mw / 2 : W - SAFE.r - mw - 12, my: many ? H / 2 - mh / 2 : H - SAFE.b - mh - 12 };
}
function drawViewHUD(vw) {
  const p = vw.p; if (!p) return;
  VZ = vw.VZ || 1; VOX = vw.VOX || 0; VOY = vw.VOY || 0;
  const s = p.sol, u = clamp(Math.min(vw.w / 640, vw.h / 400), 0.66, 1.2), dev = p.dev.type, tc = dev === 'touch' && vw.w >= W - 1;
  // touch: vitals sit bottom-centre, between the thumbs
  const L = tc ? W / 2 - 112 * u : vw.x + 14 + (vw.x === 0 ? SAFE.l : 0), B = vw.y + vw.h - 14 - (vw.y + vw.h >= H - 1 ? SAFE.b : 0);
  let R = vw.x + vw.w - 14 - (vw.x + vw.w >= W - 1 ? SAFE.r : 0);
  { const mr = miniRect(); if (!mr.many && mr.my > H / 2 && R > mr.mx - 10) R = mr.mx - 14; }
  screenT(); ctx.save(); ctx.beginPath(); ctx.rect(vw.x, vw.y, vw.w, vw.h); ctx.clip();
  if (s.alive && (s.hurtT > 0 || s.hp < 35)) {
    const a = Math.max(0, s.hurtT) * 1.2 + (s.hp < 35 ? 0.25 + 0.15 * Math.sin(M.time * 6) : 0);
    const g = ctx.createRadialGradient(vw.x + vw.w / 2, vw.y + vw.h / 2, Math.min(vw.w, vw.h) * 0.3, vw.x + vw.w / 2, vw.y + vw.h / 2, Math.max(vw.w, vw.h) * 0.7);
    g.addColorStop(0, 'rgba(200,0,0,0)'); g.addColorStop(1, `rgba(200,0,0,${Math.min(0.55, a)})`); ctx.fillStyle = g; ctx.fillRect(vw.x, vw.y, vw.w, vw.h);
  }
  if (!s.alive) { if (s.deathT > 0 && !M.over) drawDeathCam(vw, p, u); else drawDeploy(vw, p); ctx.restore(); return; }
  if (s.down && !M.over) {
    const cx = vw.x + vw.w / 2, cy = vw.y + vw.h * 0.3, b = Math.ceil(s.bleed || 0) + 's';
    stxt('YOU’RE DOWN', cx, cy, 30 * u, '#ff5a45', 'center', 'middle', FD);
    stxt(s.rev > 0 ? 'GETTING BACK UP… ' + Math.round(s.rev * 100) + '%' : M.sol.some(o => o.player && o !== s && o.alive && !o.down) ? 'A TEAMMATE CAN STAND OVER YOU TO REVIVE YOU · ' + b : 'BLEEDING OUT · ' + b, cx, cy + 30 * u, 15 * u, s.rev > 0 ? '#7dff7a' : '#f2e6c4', 'center', 'middle', FD);
  }
  { // out-of-bounds warning (timed locally so online clients see it too)
    const ox = s.veh ? s.veh.x : s.x, oy = s.veh ? s.veh.y : s.y, now = performance.now() / 1000;
    if (outOfBounds(ox, oy) && !M.over) {
      if (!p.oobAt) p.oobAt = now - (s.oobT || 0);
      const left = Math.max(0, OOB_T - (now - p.oobAt)), cx = vw.x + vw.w / 2, cy = vw.y + vw.h * 0.3;
      ctx.fillStyle = 'rgba(60,6,2,0.6)'; ctx.fillRect(cx - 190 * u, cy - 30 * u, 380 * u, 62 * u);
      stxt('RETURN TO THE BATTLEFIELD', cx, cy - 6 * u, 18 * u, '#ff7a5a', 'center', 'middle', FD);
      stxt(left.toFixed(1), cx, cy + 18 * u, 20 * u, '#fff', 'center', 'middle', FD);
    } else p.oobAt = 0;
  }
  if (!tc) stxt(s.name, L, vw.y + 22 * u + (vw.y === 0 ? SAFE.t + 40 : 0), 15 * u, CHEX[p.color], 'left', 'alphabetic', FD);
  // health cross + bar
  const cx = L + 22 * u, cy = B - 26 * u, cs = 20 * u, ih = 22 * u, bh = 16 * u;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx - cs * 0.36 + 2, cy - cs + 2, cs * 0.72, cs * 2); ctx.fillRect(cx - cs + 2, cy - cs * 0.36 + 2, cs * 2, cs * 0.72);
  const hc = s.hp > (s.mhp || 100) * 0.35 ? (CFG.style === 'grit' ? '#4a68b8' : '#2b55ff') : '#e8302a';
  ctx.fillStyle = hc; ctx.fillRect(cx - cs * 0.36, cy - cs, cs * 0.72, cs * 2); ctx.fillRect(cx - cs, cy - cs * 0.36, cs * 2, cs * 0.72);
  const bx = cx + cs + 10 * u, bw = Math.min(170 * u, vw.w * 0.3);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx, cy - 13 * u, bw, 9 * u); ctx.fillStyle = hc; ctx.fillRect(bx, cy - 13 * u, bw * Math.min(1, s.hp / (s.mhp || 100)), 9 * u);
  const v = s.veh, sd = v ? v.T.seats[s.seat] : null, ry = cy + 17 * u;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx, cy + 1 * u, bw, 7 * u);
  if (!v || sd.role === 'rifle') {
    const st = cw(s), W_ = WPN[st.id];
    ctx.fillStyle = s.reloadT > 0 ? '#888' : '#e8c84a'; ctx.fillRect(bx, cy + 1 * u, bw * (s.reloadT > 0 ? 1 - s.reloadT / (s.reloadMax || 1) : st.mag / W_.mag), 7 * u);
    const wk = weaponIconKind(st.id), wiw = iconW(wk, 16 * u); icon(wk, bx + wiw / 2, ry, 16 * u, '#f2f2e6');
    if (s.reloadT > 0) { const rx = bx + wiw + 12 * u; icon('reload', rx, ry, 17 * u, '#e8c84a'); cooldownPie(rx, ry, 9.5 * u, s.reloadT / (s.reloadMax || 1)); }
    else { stxt(String(st.mag), bx + wiw + 6 * u, ry + 5 * u, 16 * u, st.mag === 0 ? '#ff5a45' : '#f2f2e6', 'left', 'alphabetic', FD); ctx.font = `${16 * u}px ${FD}`; const mw2 = ctx.measureText(String(st.mag)).width; txt('/' + st.res, bx + wiw + 8 * u + mw2, ry + 5 * u, 11 * u, '#a8a898', 'left', 'alphabetic', FD); }
    if (!v && !tc) {
      // equipment row: [LB] gadget  ·  [RB] frag / smoke
      const ey = cy - 26 * u; let x = bx;
      const K = KITS[s.kit];
      if (dev !== 'touch') x += badge('gadget', dev, x, ey, bh) + 5 * u;
      const gk = gadgetIconKind(K.g), gx = x + ih / 2, ready = K.g === 'torch' || s.gcd <= 0;
      icon(gk, gx, ey, ih, undefined, K.g === 'mine' && !s.mines ? 0.35 : 1);
      if (!ready) cooldownPie(gx, ey, ih * 0.55, s.gcd / (s.gmax || 1));
      if (K.g === 'mine') txt(String(s.mines), x + ih + 2 * u, ey + 1, 12 * u, s.mines ? '#f0f0e0' : '#777', 'left', 'middle', FD);
      x += ih + (K.g === 'mine' ? 16 : 6) * u + 10 * u;
      if (dev !== 'touch') x += badge('nade', dev, x, ey, bh) + 5 * u;
      [['frag', s.nades, 0], ['smoke', s.smokes, 1]].forEach(([k, n, i]) => {
        const on = s.throwSel === i;
        if (on) { ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 1, ey - ih / 2 - 1, ih + 16 * u, ih + 2); }
        icon(k, x + ih / 2, ey, ih * 0.92, undefined, n ? 1 : 0.35); txt(String(n), x + ih + 2 * u, ey + 1, 12 * u, n ? '#f0f0e0' : '#777', 'left', 'middle', FD); x += ih + 19 * u;
      });
      if (dev === 'pad') badge('cycle', dev, x, ey, bh * 0.9);
    }
  } else if (sd.role === 'mg') {
    const hot = v.over > 0;
    ctx.fillStyle = hot ? '#e8302a' : v.heat > 0.7 ? '#ff8c1a' : '#e8c84a'; ctx.fillRect(bx, cy + 1 * u, bw * (hot ? 1 : v.heat), 7 * u);
    icon('heat', bx + 10 * u, ry, 18 * u, hot ? (Math.floor(M.time * 6) % 2 ? '#ff3a2a' : '#fff') : v.heat > 0.7 ? '#ff8c1a' : '#e8c84a');
  } else if (v.type === 'tank') {
    const k = clamp(v.cd / 2.3, 0, 1); ctx.fillStyle = k <= 0 ? '#7dff7a' : '#e8c84a'; ctx.fillRect(bx, cy + 1 * u, bw * (1 - k), 7 * u);
    icon('shell', bx + 11 * u, ry, 20 * u, k <= 0 ? '#7dff7a' : '#e8c84a'); cooldownPie(bx + 11 * u, ry, 11 * u, k);
  } else { let x = bx; if (dev !== 'touch') x += badge('fire', dev, x, ry, bh) + 5 * u; icon('horn', x + 9 * u, ry, 18 * u, '#c8c8c0'); }
  // score popups: just the points
  s.pops.forEach((q, i) => { ctx.globalAlpha = Math.min(1, q.t * 2); stxt(q.txt.split(' ')[0], vw.x + vw.w / 2, vw.y + vw.h * 0.62 + i * 16 * u, 14 * u, '#ffe08a', 'center', 'middle', FD); ctx.globalAlpha = 1; });
  const hb = 18 * u;
  if (v) {
    const pw = 108 * u, ph = 58 * u, px = tc ? L + 230 * u : R - pw, py = B - ph;
    ctx.fillStyle = 'rgba(10,14,8,0.65)'; ctx.fillRect(px, py, pw, ph);
    const f = v.hp / v.T.hp; ctx.fillStyle = f > 0.5 ? '#7dff7a' : f > 0.25 ? '#ffb020' : '#ff3a2a'; ctx.fillRect(px + 6 * u, py + ph - 8 * u, (pw - 12 * u) * f, 4 * u);
    if (f < 0.25 && v.T.drive && Math.floor(M.time * 4) % 2) icon('exit', px + pw - 12 * u, py + 12 * u, 16 * u, '#ff3a2a');
    const dcx = px + pw / 2, dcy = py + ph / 2 - 2 * u, sc = 0.42 * u;
    ctx.save(); ctx.translate(dcx, dcy);
    ctx.fillStyle = '#3a3a36'; ctx.fillRect(-v.T.hl * sc, -v.T.hw * sc, v.T.hl * 2 * sc, v.T.hw * 2 * sc);
    ctx.fillStyle = '#e8c84a'; ctx.beginPath(); ctx.moveTo(v.T.hl * sc + 2, -4); ctx.lineTo(v.T.hl * sc + 8, 0); ctx.lineTo(v.T.hl * sc + 2, 4); ctx.fill();
    v.T.seats.forEach((sdd, i) => {
      const o = v.seats[i]; const [lx, ly] = sdd.pos === 'turret' ? [-6, 0] : sdd.pos;
      const sx = lx * sc * 1.3, sy = ly * sc * 1.6;
      ctx.fillStyle = o ? CHEX[o.color] : 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(sx, sy, 4.5 * u, 0, TAU); ctx.fill();
      if (o === s) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 7 * u, 0, TAU); ctx.stroke(); }
    });
    ctx.restore();
    if (s.seatT > 0) { const k = 1 - s.seatT / s.seatMax, w2 = 120 * u; icon(v.T.seats[s.seat].role === 'drive' ? 'wheel' : 'seat', vw.x + vw.w / 2 - w2 / 2 - 14 * u, B - 30 * u, 16 * u, '#fff'); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(vw.x + vw.w / 2 - w2 / 2, B - 32 * u, w2, 5 * u); ctx.fillStyle = '#e8c84a'; ctx.fillRect(vw.x + vw.w / 2 - w2 / 2, B - 32 * u, w2 * k, 5 * u); }
    else if (dev !== 'touch') hintRow([...(v.seats.length > 1 ? [{ a: 'seat', icon: 'seat' }] : []), { a: 'use', icon: 'exit' }], vw.x + vw.w / 2, B - hb / 2, hb, dev);
  } else {
    const c = tc ? null : enterCandidate(s);
    if (c) {
      const nm = c.seat >= 0 ? c.v.T.seats[c.seat].n : '', y = B - 40 * u;
      hintRow([{ a: 'use', icon: c.seat >= 0 ? 'enter' : 'skull' }, ...(nm ? [{ t: nm }] : []), ...(c.bump ? [{ icon: 'swap' }, { t: c.bump.name }] : [])], vw.x + vw.w / 2, y, 20 * u, dev, c.seat >= 0 ? '#fff' : '#ff8a70');
      worldT(); const an = seatAnchor(c.v, c.seat >= 0 ? c.seat : c.want, s.x, s.y); const [ax, ay] = toWorld(c.v, an[0] * 0.7, an[1] * 0.7);
      ctx.strokeStyle = CHEX[p.color]; ctx.lineWidth = 2 / VZ * 1.5; ctx.beginPath(); ctx.arc(ax, ay, 7 + Math.sin(M.time * 8) * 1.5, 0, TAU); ctx.stroke(); screenT();
    } else if (!tc && cw(s).mag === 0 && cw(s).res > 0 && s.reloadT <= 0) { const x = R - 50 * u, bw2 = badge('reload', dev, x, B - 12 * u, hb); icon('reload', x + bw2 + 14 * u, B - 12 * u, hb, '#fff'); }
    else if (s.torch) icon('torch', vw.x + vw.w / 2, B - 40 * u, 28 * u, '#9fe0ff', 0.6 + 0.4 * Math.sin(M.time * 14));
  }
  if (s.hitT > 0) {
    let hx, hy;
    if (p.raw && p.raw.mouse) { hx = KB.mouse.x; hy = KB.mouse.y; }
    else { let ox = s.x, oy = s.y, a = s.a; if (s.veh && s.seat === 0 && s.veh.type === 'tank') { ox = s.veh.x; oy = s.veh.y; a = s.veh.aimT === undefined ? s.veh.ta : s.veh.aimT; } const d = s.veh ? 160 : 120; hx = (ox + Math.cos(a) * d) * VZ + VOX; hy = (oy + Math.sin(a) * d) * VZ + VOY; }
    // people: four diagonal ticks; vehicles and nests: four right-angle chevrons pointing in
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath();
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if (s.hitV) { ctx.moveTo(hx + dx * 13, hy + dy * 6); ctx.lineTo(hx + dx * 6, hy + dy * 6); ctx.lineTo(hx + dx * 6, hy + dy * 13); }
      else { ctx.moveTo(hx + dx * 5, hy + dy * 5); ctx.lineTo(hx + dx * 11, hy + dy * 11); }
    }
    ctx.stroke();
  }
  if (s.msg) { ctx.globalAlpha = Math.min(1, s.msg.t * 2); stxt(s.msg.txt, vw.x + vw.w / 2, vw.y + vw.h * 0.3, 18 * u, '#fff3c8', 'center', 'middle', FD); ctx.globalAlpha = 1; }
  if (p.mapOpen) drawMapOverlay(vw, p, u);
  ctx.restore();
}
/* death cam overlay: who got you, while the camera sits on them */
function drawDeathCam(vw, p, u) {
  const s = p.sol, k = s.killer, cx = vw.x + vw.w / 2, y = vw.y + (vw.y === 0 ? SAFE.t + 70 : 30) * u;
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(vw.x, vw.y, vw.w, vw.h);
  ctx.font = `${18 * u}px ${FD}`; const nm = k ? k.name : '', w = 46 * u + ctx.measureText(nm).width;
  ctx.fillStyle = 'rgba(8,12,6,0.75)'; ctx.fillRect(cx - w / 2 - 10 * u, y - 18 * u, w + 20 * u, 36 * u);
  icon('skull', cx - w / 2 + 14 * u, y, 24 * u, '#ff5a45');
  if (k) txt(nm, cx - w / 2 + 34 * u, y + 1, 18 * u, CHEX[k.color] || '#fff', 'left', 'middle', FD);
}
/* the killer glows in the victim's view during the death cam */
function drawKillerGlow(vw) {
  for (const p of vw.p ? [vw.p] : M.shared ? LOCALS() : []) {
    const s = p.sol; if (!s || s.alive || !(s.deathT > 0) || !s.killer) continue;
    const k = s.killer, live = (k.veh && k.veh.active && !k.veh.dead) || (k.sol && k.sol.alive), r = k.veh && k.veh.active ? 62 : 18, pulse = 0.5 + 0.5 * Math.sin(M.time * 9);
    worldT(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = live ? 0.55 + 0.3 * pulse : 0.35;
    const g = ctx.createRadialGradient(k.x, k.y, r * 0.2, k.x, k.y, r * 1.5); g.addColorStop(0, 'rgba(255,60,40,0.9)'); g.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(k.x, k.y, r * 1.5, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ff4a30'; ctx.lineWidth = 2.5 / VZ + 1; ctx.beginPath(); ctx.arc(k.x, k.y, r + 4 + pulse * 4, 0, TAU); ctx.stroke();
    if (!live) { ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(k.x, k.y, r * 0.6, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
    if (k.sol && k.sol.alive && !k.sol.veh) drawSoldier(k.sol, vw);   // redraw on top of the glow
    else if (k.veh && k.veh.active) drawVehicle(k.veh);
  }
}
/* full tactical map over the player's view (D-pad down / M / map button) */
function drawMapOverlay(vw, p, u) {
  const s = p.sol, top = vw.y === 0 ? SAFE.t + 50 : 0, x = vw.x + vw.w * 0.07, y = vw.y + top + vw.h * 0.06, w = vw.w * 0.86, h = vw.h * 0.86 - top;
  ctx.fillStyle = 'rgba(6,9,5,0.72)'; ctx.fillRect(vw.x, vw.y, vw.w, vw.h);
  drawTacMap(x, y, w, h, s, { u });
  const dev = p.dev.type; if (dev !== 'touch') { const hb = 18 * u, bw2 = badge('map', dev, x + w - 70 * u, y + h - hb, hb); icon('map', x + w - 70 * u + bw2 + 14 * u, y + h - hb, hb, '#f0f0e0'); }
}
/* deploy screen: class tabs on top, the battlefield map (spawn points) with the loadout beside it, deploy along the bottom */
function drawDeploy(vw, p) {
  const s = p.sol;
  ctx.fillStyle = 'rgba(6,9,5,0.86)'; ctx.fillRect(vw.x, vw.y, vw.w, vw.h);
  if (M.over) return;
  const u = clamp(Math.min(vw.w / 760, vw.h / 430), 0.62, 1.5), F = (n, m) => Math.max(m || 11, n * u);
  const gu = clamp(W / 1100, 0.7, 1.15), topIn = vw.y === 0 ? SAFE.t + (M.ffa ? 54 : 46) * gu : 0;
  const pad = 8 * u, X0 = vw.x + pad + (vw.x === 0 ? SAFE.l : 0), X1 = vw.x + vw.w - pad - (vw.x + vw.w >= W - 1 ? SAFE.r : 0);
  const Y0 = vw.y + topIn + pad, Y1 = vw.y + vw.h - pad - (vw.y + vw.h >= H - 1 ? SAFE.b : 0), wid = X1 - X0, dev = p.dev.type, bh = F(16, 13);
  if (!M.ffa && !M.coop && M.tickets[s.team] <= 0) { icon('skull', vw.x + vw.w / 2, vw.y + vw.h / 2, F(60, 30), '#ff5a45'); return; }
  // class tabs
  const th = Math.max(36, 42 * u), side = dev === 'pad' ? bh * 1.5 + 6 : dev === 'kb' ? bh * 1.6 + 6 : 0, n = KITS.length, gap = 5 * u, tw = (wid - side * 2 - gap * (n - 1)) / n;
  if (side) { badge(dev === 'pad' ? 'LB' : 'Q', dev, X0, Y0 + th / 2, bh); badge(dev === 'pad' ? 'RB' : 'E', dev, X1 - side + 6, Y0 + th / 2, bh); }
  KITS.forEach((K, i) => {
    const x = X0 + side + i * (tw + gap), on = s.kit === i;
    ctx.fillStyle = on ? 'rgba(255,224,138,0.2)' : 'rgba(22,30,17,0.97)'; ctx.fillRect(x, Y0, tw, th);
    ctx.strokeStyle = on ? '#ffe08a' : 'rgba(242,230,196,0.18)'; ctx.lineWidth = on ? 2.5 : 1; ctx.strokeRect(x + 1, Y0 + 1, tw - 2, th - 2);
    const sc = crispScale(th * 0.8 / 30); uiSoldier(p.color, K.secs[0] === 'rpg' ? 'rpg' : 'stand', x + th * 0.5, Y0 + th / 2, -Math.PI / 2, sc);
    fitTxt(K.n, x + th * 0.95, Y0 + th / 2, tw - th - 4, F(14, 11), on ? '#ffe08a' : '#e8e8dc', FD);
    DUI.push({ p, x, y: Y0, w: tw, h: th, act: 'kit' + i });
  });
  // bottom bar: who + deploy
  const bb = Math.max(38, 42 * u), bY = Y1 - bb, ready = s.respawnT <= 0 && canDeploy(s), auto = clamp((s.firstDeploy ? 15 : 6) - s.deployIdle, 0, 15), autoMax = s.firstDeploy ? 15 : 6;
  const dw = Math.min(Math.max(170, 230 * u), wid * 0.5), dx = X1 - dw;
  ctx.fillStyle = ready ? '#d1aa55' : 'rgba(255,255,255,0.07)'; ctx.fillRect(dx, bY, dw, bb);
  if (!ready) { ctx.fillStyle = 'rgba(209,170,85,0.45)'; ctx.fillRect(dx, bY, dw * (1 - s.respawnT / 5), bb); }
  else { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(dx, bY + bb - 4, dw * auto / autoMax, 4); }
  ctx.strokeStyle = 'rgba(242,230,196,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(dx + 0.5, bY + 0.5, dw - 1, bb - 1);
  { let x = dx + dw / 2 - (dev === 'touch' ? 0 : bh * 1.2) - F(40, 34); if (dev !== 'touch') x += badge('deploy', dev, x, bY + bb / 2, bh) + 8 * u; icon('deploy', x + bh / 2, bY + bb / 2, bh, ready ? '#141a10' : 'rgba(255,255,255,0.4)'); txt('DEPLOY', x + bh + 8 * u, bY + bb / 2 + 1, F(16, 13), ready ? '#141a10' : 'rgba(255,255,255,0.4)', 'left', 'middle', FD); }
  DUI.push({ p, x: dx, y: bY, w: dw, h: bb, act: 'deploy' });
  if (M.coop && !canDeploy(s)) stxt('YOU’RE BACK IN WHEN THIS WAVE IS CLEARED', (X0 + X1) / 2, bY - F(14, 12), F(14, 12), '#ffe08a', 'center', 'middle', FD);
  // middle: map + loadout
  const mTop = Y0 + th + 6 * u, mBot = bY - 6 * u, mH = mBot - mTop, lw = clamp(wid * 0.34, 150, 300 * u), mapW = wid - lw - 8 * u;
  if (mH <= 20) return;
  const tm = drawTacMap(X0, mTop, mapW, mH, s, { u });
  const opts = spawnOptions(s), sel = clamp(s.spawnSel, 0, opts.length - 1), PO = o => o.x === undefined ? [WW / 2, WH / 2] : [o.x, o.y];
  opts.forEach((o, i) => {
    const [wx, wy] = PO(o), x = tm.mx + wx * tm.k, y = tm.my + wy * tm.k, on = i === sel, r = Math.max(8, 11 * u) * (on ? 1.25 : 1);
    ctx.fillStyle = on ? CHEX[p.color] : 'rgba(242,230,196,0.9)'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    ctx.beginPath(); if (o.kind === 'base') ctx.rect(x - r, y - r, r * 2, r * 2); else { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); } ctx.fill(); ctx.stroke();
    txt(o.kind === 'base' ? 'HQ' : o.kind === 'flag' ? o.name.slice(-1) : o.kind === 'rand' ? '?' : o.kind === 'veh' ? 'V' : o.kind === 'mate' ? '+' : '•', x, y + 1, F(10, 9), '#111', 'center', 'middle', FD);
    if (on) { ctx.strokeStyle = CHEX[p.color]; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r + 6 + Math.sin(M.time * 6) * 2, 0, TAU); ctx.stroke(); }
  });
  if (dev !== 'touch') { const hb2 = F(15, 12); hintRow([{ a: 'spawn', icon: 'deploy' }], tm.mx + tm.mw - 40 * u, tm.my + tm.mh - hb2 * 0.9, hb2, dev); }
  DUI.push({ p, x: tm.mx, y: tm.my, w: tm.mw, h: tm.mh, act: 'map', mx: tm.mx, my: tm.my, k: tm.k });
  // loadout slots: D-pad up/down picks the slot, left/right picks what goes in it
  const lx = X1 - lw, K = KITS[s.kit], rows = SLOTS.length, hintH = dev === 'touch' ? 0 : F(20, 16), rh = Math.min((mH - hintH) / rows, 62 * u), slotSel = p.slotSel || 0;
  ctx.fillStyle = 'rgba(14,20,11,0.95)'; ctx.fillRect(lx, mTop, lw, rh * rows + hintH);
  SLOTS.forEach((S, i) => {
    const y = mTop + i * rh, on = slotSel === i, opt = S.opts(K), cur = (S.id === 'gad' ? 0 : (s[S.id] || 0)) % opt.length, o = opt[cur], many = opt.length > 1;
    if (on) { ctx.fillStyle = 'rgba(255,224,138,0.14)'; ctx.fillRect(lx, y, lw, rh); ctx.fillStyle = '#ffe08a'; ctx.fillRect(lx, y, 3, rh); }
    ctx.fillStyle = 'rgba(242,230,196,0.08)'; ctx.fillRect(lx, y + rh - 1, lw, 1);
    txt(S.n, lx + 10 * u, y + rh * 0.25, F(10, 9), '#8a8a7c', 'left', 'middle', FD);
    const iy = y + rh * 0.62, is = Math.min(rh * 0.5, 24 * u);
    if (many) { txt('‹', lx + 12 * u, iy, F(18, 14), on ? '#ffe08a' : 'rgba(242,230,196,0.4)', 'center', 'middle', FD); txt('›', lx + lw - 12 * u, iy, F(18, 14), on ? '#ffe08a' : 'rgba(242,230,196,0.4)', 'center', 'middle', FD); }
    let x = lx + 26 * u;
    if (o.icon === 'nades') { icon('frag', x + is / 2, iy, is); txt(String(o.f), x + is + 2, iy + 1, F(14, 11), '#f0f0e0', 'left', 'middle', FD); x += is + 22 * u; icon('smoke', x + is / 2, iy, is); txt(String(o.sm), x + is + 2, iy + 1, F(14, 11), '#f0f0e0', 'left', 'middle', FD); }
    else { const ik = o.wid ? weaponIconKind(o.wid) : gadgetIconKind(o.icon), ih2 = o.wid ? is * 0.62 : is, iw = iconW(ik, ih2); icon(ik, x + iw / 2, iy, ih2, '#f0f0e0'); fitTxt(o.txt, x + iw + 8 * u, iy + 1, lw - (x - lx) - iw - 34 * u, F(13, 11), on ? '#fff' : '#d8d8c8', FD); }
    DUI.push({ p, x: lx, y, w: lw / 2, h: rh, act: 'slot' + i + ':-1' }); DUI.push({ p, x: lx + lw / 2, y, w: lw / 2, h: rh, act: 'slot' + i + ':1' });
  });
  if (hintH) hintRow([{ a: 'slot', icon: 'swap' }, { a: 'item', icon: 'gun' }], lx + lw / 2, mTop + rh * rows + hintH / 2, hintH * 0.75, dev);
}
/* left-aligned text that shrinks (then trims) to fit a width */
function fitTxt(s, x, y, maxW, size, col, font) {
  let sz = size; ctx.font = `${sz}px ${font}`;
  while (sz > 8 && ctx.measureText(s).width > maxW) { sz -= 0.5; ctx.font = `${sz}px ${font}`; }
  while (s.length > 3 && ctx.measureText(s).width > maxW) s = s.slice(0, -2) + '…';
  txt(s, x, y, sz, col, 'left', 'middle', font);
}
function wrapCenter(str, x, y, maxW, size, col) {
  ctx.font = `${size}px ${FB}`; const words = str.split(' '); let line = '', yy = y;
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { txt(line, x, yy, size, col, 'center', 'middle'); line = w; yy += size * 1.4; } else line = t; }
  if (line) txt(line, x, yy, size, col, 'center', 'middle');
}
/* touch controls, drawn above every view: only what can be used right now is on screen */
function drawTouch(s) {
  ctx.globalAlpha = CFG.tAlpha / 100; drawTouch_(s); ctx.globalAlpha = 1;     // settings › TOUCH: opacity (icons multiply it)
}
function drawTouch_(s) {
  const k = clamp(Math.min(W, H) / 390, 0.85, 1.45) * CFG.tSize / 100, v = s.veh, sd = v ? v.T.seats[s.seat] : null, rifle = !v || sd.role === 'rifle', K = KITS[s.kit];
  TB_ON = [];
  const reg = (key, b) => { TB[key] = b; TB_ON.push(key); return b; };
  const disc = (x, y, r, held, fill) => { ctx.fillStyle = held ? 'rgba(255,224,138,0.38)' : fill || 'rgba(0,0,0,0.38)'; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke(); };
  const btn = (key, x, y, r, ic, o = {}) => { reg(key, { x, y, r }); disc(x, y, r, TOUCH.hold[key], o.fill); icon(ic, x, y, r * (o.sc || 1), o.col || '#fff', o.al); };
  const F = reg('fire', { x: W - SAFE.r - CFG.tFireX * k, y: H - SAFE.b - CFG.tFireY * k, r: 50 * k });     // settings › TOUCH: where
  const at = (deg, rad) => [F.x + Math.cos(deg * Math.PI / 180) * rad * k, F.y + Math.sin(deg * Math.PI / 180) * rad * k];
  // fire stick: drag to aim + fire, tap to fire ahead
  const ft = [...TOUCH.pts.values()].find(t => t.role === 'fire');
  disc(F.x, F.y, F.r, !!ft, 'rgba(160,30,20,0.32)');
  let kx = F.x, ky = F.y; if (ft) { const dx = ft.x - F.x, dy = ft.y - F.y, L = Math.hypot(dx, dy), m = Math.min(L, F.r); if (L > 1) { kx += dx / L * m; ky += dy / L * m; } }
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.arc(kx, ky, F.r * 0.48, 0, TAU); ctx.fill();
  if (v && sd.role === 'drive' && v.type === 'jeep') icon('horn', kx, ky, F.r * 0.7);
  else if (v && sd.role === 'drive') { icon('shell', kx, ky, F.r * 0.7); cooldownPie(kx, ky, F.r * 0.48, clamp(v.cd / 2.3, 0, 1)); }
  else { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; const r = F.r * 0.26; ctx.beginPath(); ctx.arc(kx, ky, r, 0, TAU); ctx.moveTo(kx - r * 1.8, ky); ctx.lineTo(kx - r * 0.6, ky); ctx.moveTo(kx + r * 0.6, ky); ctx.lineTo(kx + r * 1.8, ky); ctx.moveTo(kx, ky - r * 1.8); ctx.lineTo(kx, ky - r * 0.6); ctx.moveTo(kx, ky + r * 0.6); ctx.lineTo(kx, ky + r * 1.8); ctx.stroke(); }
  // action arc around the fire stick
  if (!v) {
    btn('stance', ...at(180, 112), 24 * k, s.stance ? 'stand' : 'prone');
    btn('reload', ...at(214, 112), 24 * k, 'reload'); if (s.reloadT > 0) cooldownPie(...at(214, 112), 22 * k, s.reloadT / (s.reloadMax || 1));
    btn('jump', ...at(250, 112), 26 * k, 'jump');
    const [nx, ny] = at(286, 114); btn('nade', nx, ny, 26 * k, s.throwSel ? 'smoke' : 'frag', { al: (s.throwSel ? s.smokes : s.nades) ? 1 : 0.35 });
    txt(String(s.throwSel ? s.smokes : s.nades), nx + 17 * k, ny + 17 * k, 12 * k, '#ffe08a', 'center', 'middle', FD);
    if (s.nades > 0 && s.smokes > 0) btn('nadeCyc', nx - 30 * k, ny - 22 * k, 13 * k, 'swap', { sc: 1.1 });
    if (TOUCH.moving || TOUCH.sprintLock) btn('sprint', ...at(196, 182), 24 * k, 'run', { fill: TOUCH.sprintLock ? 'rgba(255,224,138,0.5)' : undefined });     // tap: sprint lock
    // AUTO: what dragging the fire stick does (ON aims + fires, OFF aims only, RNG fires itself when lined up in range)
    { const [ax, ay] = at(318, 96), r = 20 * k, md = TOUCH.auto; reg('auto', { x: ax, y: ay, r });
      disc(ax, ay, r, TOUCH.hold.auto, md === 'on' ? 'rgba(160,30,20,0.45)' : md === 'range' ? 'rgba(200,160,40,0.5)' : 'rgba(0,0,0,0.45)');
      txt('AUTO', ax, ay - 6 * k, 8 * k, 'rgba(255,255,255,0.75)', 'center', 'middle', FD); txt(md === 'range' ? 'RNG' : md.toUpperCase(), ax, ay + 5 * k, 11 * k, '#fff', 'center', 'middle', FD); }
    const [gx, gy] = at(232, 180); btn('gadget', gx, gy, 26 * k, gadgetIconKind(K.g), { al: K.g === 'mine' && !s.mines ? 0.35 : 1 });
    if (K.g !== 'torch' && s.gcd > 0) cooldownPie(gx, gy, 24 * k, s.gcd / (s.gmax || 1));
    if (K.g === 'mine') txt(String(s.mines), gx + 17 * k, gy + 17 * k, 12 * k, '#ffe08a', 'center', 'middle', FD);
    // contextual: knife when an enemy is in reach, vehicle seat when standing at a door
    enemiesOf(s, _en); if (_en.some(o => !o.veh && Math.hypot(o.x - s.x, o.y - s.y) < 46)) btn('melee', ...at(160, 182), 28 * k, 'knife', { fill: 'rgba(160,30,20,0.45)' });
    const c = enterCandidate(s);
    if (c && c.seat >= 0) { const ex = F.x - 210 * k, ey = F.y - 118 * k; btn('enter', ex, ey, 32 * k, 'enter', { fill: 'rgba(40,90,40,0.55)' }); stxt(c.v.T.seats[c.seat].n, ex, ey + 46 * k, 12 * k, '#fff', 'center', 'middle', FD); }
  } else {
    btn('exit', ...at(200, 118), 28 * k, 'exit', { fill: 'rgba(160,30,20,0.4)' });
    if (rifle) { btn('reload', ...at(214, 112), 24 * k, 'reload'); btn('nade', ...at(286, 114), 26 * k, s.throwSel ? 'smoke' : 'frag'); }
    // seat picker: one chip per seat, filled with the occupant's colour
    const n = v.seats.length, sx = W - SAFE.r - 28 * k, sy0 = F.y - F.r - 34 * k - (n - 1) * 44 * k;
    v.T.seats.forEach((S, i) => {
      const y = sy0 + i * 44 * k, o = v.seats[i], me = o === s;
      reg('seat' + i, { x: sx, y, r: 20 * k });
      disc(sx, y, 20 * k, TOUCH.hold['seat' + i], o ? (me ? 'rgba(255,224,138,0.45)' : 'rgba(0,0,0,0.55)') : 'rgba(0,0,0,0.3)');
      icon(S.role === 'drive' ? 'wheel' : 'seat', sx - 2 * k, y, 18 * k, o ? CHEX[o.color] : 'rgba(255,255,255,0.75)');
      txt(S.n, sx - 26 * k, y, 10 * k, me ? '#ffe08a' : 'rgba(255,255,255,0.75)', 'right', 'middle', FD);
    });
    if (s.seatT > 0) { const i = s.seat, y = sy0 + i * 44 * k; ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, y, 23 * k, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - s.seatT / s.seatMax)); ctx.stroke(); }
  }
  // weapon slots, bottom centre: tap the other gun to swap
  if (rifle && s.w) {
    const cw2 = 92 * k, ch2 = 34 * k, y = H - SAFE.b - 104 * k;
    s.w.forEach((w, i) => {
      const x = W / 2 + (i === 0 ? -cw2 - 4 : 4), on = s.wi === i;
      reg('w' + i, { x, y, w: cw2, h: ch2 });
      ctx.fillStyle = on ? 'rgba(255,224,138,0.22)' : 'rgba(0,0,0,0.42)'; ctx.fillRect(x, y, cw2, ch2); ctx.strokeStyle = on ? '#ffe08a' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = on ? 2 : 1; ctx.strokeRect(x + 0.5, y + 0.5, cw2 - 1, ch2 - 1);
      const ik = weaponIconKind(w.id), ih = ch2 * 0.5, iw = iconW(ik, ih); icon(ik, x + 8 * k + iw / 2, y + ch2 / 2, ih, '#fff', on ? 1 : 0.6);
      txt(String(w.mag), x + cw2 - 6 * k, y + ch2 / 2 + 1, 13 * k, on ? '#fff' : '#bbb', 'right', 'middle', FD);
    });
  }
  // left side: fire button for the left thumb (on foot or in a gun seat)
  if (CFG.tLfire !== false && (!v || sd.role !== 'drive' || v.type === 'tank')) btn('lfire', SAFE.l + 46 * k, H - SAFE.b - 196 * k, 30 * k, 'cross', { fill: 'rgba(160,30,20,0.4)', col: '#fff', sc: 1.1 });
  // top-left: pause, and the minimap opens the full map
  btn('pause', SAFE.l + 26 * k, SAFE.t + 26 * k, 19 * k, 'pause');
  btn('score', SAFE.l + 72 * k, SAFE.t + 26 * k, 19 * k, 'score', { fill: TOUCH.scoreOn ? 'rgba(255,224,138,0.5)' : undefined });
  if (!v || v.type !== 'nest') btn('lamp', SAFE.l + 118 * k, SAFE.t + 26 * k, 19 * k, 'lamp', { fill: (v ? v.lights : s.lamp) ? 'rgba(255,224,138,0.5)' : undefined });
  if (CFG.minimap !== false) { const mr = miniRect(); if (!mr.many) reg('map', { x: mr.mx, y: mr.my, w: mr.mw, h: mr.mh }); }
  // move stick: floats under the left thumb; a faint ring shows where to put it
  const mt = [...TOUCH.pts.values()].find(t => t.role === 'move');
  const bx = mt ? mt.ox : SAFE.l + 104 * k, by = mt ? mt.oy : H - SAFE.b - 100 * k;
  ctx.strokeStyle = mt ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, TSTICK, 0, TAU); ctx.stroke();
  if (mt) {
    const dx = mt.x - mt.ox, dy = mt.y - mt.oy, L = Math.hypot(dx, dy), m = Math.min(L, TSTICK);
    const qx = bx + (L > 1 ? dx / L * m : 0), qy = by + (L > 1 ? dy / L * m : 0);
    ctx.fillStyle = mt.sprint ? 'rgba(255,224,138,0.55)' : 'rgba(255,255,255,0.32)'; ctx.beginPath(); ctx.arc(qx, qy, 24, 0, TAU); ctx.fill();
    if (mt.sprint) { const a = Math.atan2(dy, dx); ctx.save(); ctx.translate(bx + Math.cos(a) * (TSTICK + 18), by + Math.sin(a) * (TSTICK + 18)); ctx.rotate(a); ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-6, -7); ctx.lineTo(1, 0); ctx.lineTo(-6, 7); ctx.moveTo(2, -7); ctx.lineTo(9, 0); ctx.lineTo(2, 7); ctx.stroke(); ctx.restore(); }
  } else { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(bx, by, 24, 0, TAU); ctx.fill(); }
  const at2 = [...TOUCH.pts.values()].find(t => t.role === 'aim');
  if (at2) { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(at2.ox, at2.oy, 40, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.arc(at2.x, at2.y, 18, 0, TAU); ctx.fill(); }
}
function drawGlobalHUD() {
  screenT();
  const top = SAFE.t + 10, u = clamp(W / 1100, 0.7, 1.15);
  if (M.dev) devHUD(u, top + 40 * u);
  if (M.coop) {
    const V = M.wv, cx = W / 2, bw = 300 * u;
    ctx.fillStyle = 'rgba(8,12,6,0.7)'; ctx.fillRect(cx - bw / 2, top, bw, 34 * u);
    stxt(V.n ? 'WAVE ' + V.n + (V.lim ? ' / ' + V.lim : '') : 'GET READY', cx - 8 * u, top + 23 * u, 17 * u, '#ffe08a', 'right', 'alphabetic', FD);
    stxt(V.brk > 0 ? 'NEXT WAVE IN ' + Math.ceil(V.brk) : V.left + ' RAIDERS LEFT', cx + 8 * u, top + 22 * u, 13 * u, V.brk > 0 ? '#7dff7a' : '#f2e6c4', 'left', 'alphabetic', FD);
  } else if (!M.ffa) {
    const bw = Math.min(230 * u, W * 0.25), cx = W / 2, lim = LIMITS.team[M.cfg.limit] || 200;
    ctx.fillStyle = 'rgba(8,12,6,0.7)'; ctx.fillRect(cx - bw - 90 * u, top, bw * 2 + 180 * u, 34 * u);
    for (const t of [0, 1]) {
      const f = clamp(M.tickets[t] / lim, 0, 1), x = t === 0 ? cx - 90 * u - bw + 8 : cx + 90 * u - 8;
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x, top + 22 * u, bw, 6 * u);
      ctx.fillStyle = TEAMHEX[t]; if (t === 0) ctx.fillRect(x + bw * (1 - f), top + 22 * u, bw * f, 6 * u); else ctx.fillRect(x, top + 22 * u, bw * f, 6 * u);
      stxt(TEAMNAME[t], t === 0 ? x + bw : x, top + 17 * u, 13 * u, TEAMHEX[t], t === 0 ? 'right' : 'left', 'alphabetic', FD);
      stxt(String(M.tickets[t]), t === 0 ? x : x + bw, top + 17 * u, 15 * u, '#fff', t === 0 ? 'left' : 'right', 'alphabetic', FD);
    }
    if (M.flags.length) M.flags.forEach((f, i) => {
      const x = cx + (i - (M.flags.length - 1) / 2) * 28 * u, y = top + 17 * u;
      ctx.fillStyle = f.owner < 0 ? '#9a9a90' : TEAMHEX[f.owner]; ctx.fillRect(x - 11 * u, y - 11 * u, 22 * u, 22 * u);
      if (f.prog !== 0 && f.owner < 0) { ctx.fillStyle = TEAMHEX[f.prog < 0 ? 0 : 1]; ctx.fillRect(x - 11 * u, y + 11 * u - 22 * u * Math.abs(f.prog), 22 * u, 22 * u * Math.abs(f.prog)); }
      if (f.contested && Math.floor(M.time * 5) % 2) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x - 11 * u, y - 11 * u, 22 * u, 22 * u); }
      txt(f.name.length > 1 ? 'H' : f.name, x, y + 1, 14 * u, '#111', 'center', 'middle', FD);
    });
    else txt('TDM', cx, top + 18 * u, 13 * u, '#c8c8b8', 'center', 'middle', FD);
  } else {
    const ranked = [...M.sol].sort((a, b) => b.k - a.k).slice(0, 3);
    ctx.fillStyle = 'rgba(8,12,6,0.7)'; ctx.fillRect(W / 2 - 170 * u, top, 340 * u, 30 * u);
    ranked.forEach((s, i) => stxt(`${i + 1}. ${s.name} ${s.k}`, W / 2 + (i - 1) * 110 * u, top + 20 * u, 13 * u, CHEX[s.color], 'center', 'alphabetic', FD));
    stxt(`FIRST TO ${M.limit}`, W / 2, top + 44 * u, 11 * u, 'rgba(255,255,255,0.7)', 'center');
  }
  // kill feed: killer [how] victim — icons instead of words; centred under the score bar in split screen
  let y = top + 8 + (M.ffa ? 50 : 44) * u;
  const centred = M.views.length > 1 || (M.shared && LOCALS().length > 1), fx = W - SAFE.r - 12, ih = 16 * u;
  const deploying = hudViews().filter(v => v.p && v.p.sol && !v.p.sol.alive && !(v.p.sol.deathT > 0));
  for (const f of M.feed) {
    ctx.font = `${12 * u}px ${FD}`;
    { const wB = ctx.measureText(f.b.n).width, wA = f.a ? ctx.measureText(f.a.n).width : 0, tw = wA + wB + iconW(feedIcon(f.how)[0], ih) + 30 * u, x0 = centred ? W / 2 - tw / 2 : fx - tw;
      if (deploying.some(v => x0 < v.x + v.w && x0 + tw > v.x && y - 13 * u < v.y + v.h && y + 6 * u > v.y)) { y += 21 * u; continue; } }
    ctx.globalAlpha = Math.min(1, f.t);
    const kind = feedIcon(f.how), kw = iconW(kind[0], ih), wB = ctx.measureText(f.b.n).width, wA = f.a ? ctx.measureText(f.a.n).width : 0, tw = wA + wB + kw + 30 * u;
    const x0 = centred ? W / 2 - tw / 2 : fx - tw;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x0, y - 13 * u, tw, 19 * u);
    let x = x0 + 8 * u;
    if (f.a) { txt(f.a.n, x, y - 3 * u, 12 * u, CHEX[f.a.c] || '#fff', 'left', 'middle', FD); x += wA + 7 * u; }
    icon(kind[0], x + kw / 2, y - 3.5 * u, ih, kind[1]); x += kw + 7 * u;
    txt(f.b.n, x, y - 3 * u, 12 * u, CHEX[f.b.c] || '#fff', 'left', 'middle', FD);
    y += 21 * u; ctx.globalAlpha = 1;
  }
  M.toasts.slice(0, 2).forEach((t, i) => { ctx.globalAlpha = Math.min(1, t.t * 2); stxt(t.txt, W / 2, top + 66 * u + i * 24 * u, 17 * u, t.c, 'center', 'alphabetic', FD); ctx.globalAlpha = 1; });
  // the deploy screens carry their own full map, so the minimap steps aside while anyone is choosing a spawn
  if (CFG.minimap !== false && !LOCALS().some(p => p.sol && !p.sol.alive && !M.over)) drawMinimap();
  if (M.shared && M.views.length === 1) {
    const vw = M.views[0];
    for (const p of LOCALS()) {
      if (!p.sol || !p.sol.alive) continue;
      const [x, y2] = focusOf(p); const sx = (x - vw.cam.x) * vw.cam.z + W / 2, sy = (y2 - vw.cam.y) * vw.cam.z + H / 2;
      if (sx > 20 && sx < W - 20 && sy > 20 && sy < H - 20) continue;
      const ex = clamp(sx, 30, W - 30), ey = clamp(sy, 40, H - 30), a = Math.atan2(sy - H / 2, sx - W / 2);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.fillStyle = CHEX[p.color]; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.fill(); ctx.restore();
      stxt(p.sol.name, ex, ey - 14, 11, CHEX[p.color], 'center');
    }
  }
}
function feedIcon(how) {
  if (how === 'ROADKILL') return ['tire', '#f0f0e0'];
  if (how === 'BLAST' || how === 'DESTROYED' || how === 'SHELL' || how === 'TANK') return ['boom'];
  if (how === 'KNIFE') return ['knife', '#e8e8e0'];
  if (how === 'MINE') return ['mine'];
  if (how === 'WRECK') return ['heat', '#ff8c1a'];
  if (how === 'TEAMKILL') return ['skull', '#ff5a45'];
  const id = Object.keys(WPN).find(k => WPN[k].s === how);
  if (id) return [weaponIconKind(id), '#f0f0e0'];
  return ['skull', '#e8e8e0'];
}
const MINI_DT = 0.5;     // s between the minimap's marker updates
function drawMinimap() {
  const { many, mw, mh, mx, my } = miniRect(), k = mw / WW;
  onGLHere(() => {     // GL: under the HUD layer, from the ground itself (a 2D copy is a readback from the GPU: a stall each time it changes)
    const g = GL ? surfMini(ground, 640) : groundMini(), gw = GL ? g._w : g.width, gh = GL ? g._h : g.height;
    ctx.fillStyle = 'rgba(8,20,8,0.82)'; ctx.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
    ctx.globalAlpha = 0.85; ctx.drawImage(g, 0, 0, gw, gh, mx, my, mw, mh); ctx.globalAlpha = 1;
  });
  for (const f of M.flags) { ctx.fillStyle = f.owner < 0 ? '#ddd' : TEAMHEX[f.owner]; ctx.beginPath(); ctx.arc(mx + f.x * k, my + f.y * k, 5, 0, TAU); ctx.fill(); txt(f.name.length > 1 ? 'H' : f.name, mx + f.x * k, my + f.y * k + 1, 8, '#000', 'center', 'middle', FB); }
  // the markers: who's where and seen, worked out twice a second (MINI_DT: a sight line per enemy each time), drawn every
  // frame from that; your own dot from where you are now
  const LS = LOCALS(), mine = o => LS.some(p => p.sol === o);
  if (!M._mm || M.time - M._mm.t >= MINI_DT || M.time < M._mm.t) {
    const myTeams = humanTeams(), eyesM = LS.map(p => p.sol).filter(s => s && s.alive), fogOn = M.cfg.fog && M.cfg.fog !== 'off', L = [];
    // an enemy shows when spotted, heard firing nearby, or in sight (fog on: line of sight, not through smoke; fog off: close by)
    const seenAt = (x, y, o) => (o && o.spotT > 0 && myTeams.has(o.spotTeam)) || (o && o.firedT > 0 && eyesM.some(e => Math.hypot(e.x - x, e.y - y) < 500))
      || eyesM.some(e => { const ex = e.veh ? e.veh.x : e.x, ey = e.veh ? e.veh.y : e.y, d = Math.hypot(ex - x, ey - y); return fogOn ? d < 700 && sees(ex, ey, x, y) : d < 300; });
    for (const v of M.vehicles) if (v.active) {
      const t = vehTeam(v), crew = v.seats.find(o => o); if (t >= 0 && crew && !(M.ffa ? v.seats.some(o => o && mine(o)) : myTeams.has(t)) && !seenAt(v.x, v.y, crew)) continue;
      L.push(null, v.x, v.y, 3, 2, t < 0 ? '#bbb' : t < 2 ? TEAMHEX[t] : '#ddd'); }
    for (const s of M.sol) {
      if (!s.alive) continue;
      const friendly = M.ffa ? mine(s) : myTeams.has(s.team);
      if (!friendly && !seenAt(s.x, s.y, s)) continue;
      const r = s.player ? 3 : 1.6; L.push(mine(s) ? s : null, s.x, s.y, r, r, s.player ? CHEX[s.color] : M.ffa ? '#ff5a45' : TEAMHEX[s.team]);
    }
    M._mm = { t: M.time, L };
  }
  const L = M._mm.L;
  for (let i = 0; i < L.length; i += 6) { const o = L[i], x = o ? o.x : L[i + 1], y = o ? o.y : L[i + 2]; if (o && !o.alive) continue; ctx.fillStyle = L[i + 5]; ctx.fillRect(mx + x * k - L[i + 3], my + y * k - L[i + 4], L[i + 3] * 2, L[i + 4] * 2); }
  if (!many && M.views[0]) { const vw = M.views[0]; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(mx + (vw.cam.x - vw.w / 2 / vw.cam.z) * k, my + (vw.cam.y - vw.h / 2 / vw.cam.z) * k, vw.w / vw.cam.z * k, vw.h / vw.cam.z * k); }
}
function drawScoreboard() {
  screenT(); const u = clamp(W / 1100, 0.65, 1.1);
  ctx.fillStyle = 'rgba(5,8,4,0.85)'; const bw = Math.min(W - 32, 820 * u), bh = Math.min(H - 60, 60 * u + M.sol.length * 20 * u + 40), bx = W / 2 - bw / 2, by = H / 2 - bh / 2;
  ctx.fillRect(bx, by, bw, bh);
  stxt('SCOREBOARD', W / 2, by + 30 * u, 20 * u, '#ffe08a', 'center', 'alphabetic', FD);
  const cols = [['NAME', 0.04, 'left'], ['CLASS', 0.3, 'left'], ['SCORE', 0.56, 'right'], ['K', 0.66, 'right'], ['D', 0.74, 'right'], ['CAPS', 0.85, 'right'], ['VEH', 0.95, 'right']];
  let y = by + 56 * u;
  for (const [n, x, al] of cols) txt(n, bx + bw * x, y, 11 * u, '#9a9a8a', al);
  y += 20 * u;
  const list = [...M.sol].sort((a, b) => (M.ffa ? 0 : a.team - b.team) || b.pts - a.pts);
  for (const s of list) {
    if (y > by + bh - 8) break;
    if (s.player) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(bx + 8, y - 14 * u, bw - 16, 18 * u); }
    ctx.fillStyle = M.ffa ? CHEX[s.color] : TEAMHEX[s.team]; ctx.fillRect(bx + 10, y - 10 * u, 4, 12 * u);
    txt(s.name, bx + bw * 0.04, y, 13 * u, s.player ? CHEX[s.color] : '#e8e8dc', 'left');
    txt(KITS[s.kit].n, bx + bw * 0.3, y, 11 * u, '#a8b098', 'left');
    txt(String(s.pts), bx + bw * 0.56, y, 13 * u, '#ffe08a', 'right');
    txt(String(s.k), bx + bw * 0.66, y, 13 * u, '#fff', 'right'); txt(String(s.d), bx + bw * 0.74, y, 13 * u, '#ccc', 'right');
    txt(String(s.caps), bx + bw * 0.85, y, 13 * u, '#ccc', 'right'); txt(String(s.vk), bx + bw * 0.95, y, 13 * u, '#ccc', 'right');
    y += 20 * u;
  }
}

