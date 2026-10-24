/* ---------------- point lights with height-aware shadows ----------------
   A light sits h px above the ground. Around it everything has a height (walls and tree trunks: unlimited; vehicles,
   wrecks, sandbags, hay: their own), rasterised into a patch of LC px cells. Rays from the light keep the lowest
   (h - height) / distance of what they've passed: a cell at distance D, itself hc high, is lit while that stays >= (h - hc) / D.
   So something lower than the light throws a shadow that ends (a jeep beside an MG flash), a wall's runs to the edge.
   The patch is drawn smoothed (soft shadow edges) and brightens what's under it: dodged, then a little added */
const LC = 4, LMAX = 10, LIGHTS = [], LFX = [];
const LH = { tank: 30, jeep: 20, nest: 12, bag: 12, hay: 16, tree: 255 };                 // how tall things are
const MGH = { tank: 44, jeep: 32, nest: 22 };                                             // mounted MG muzzle height
/* a light this frame (skip: the thing it comes from, which mustn't shade it); lightFx: one that fades over T s */
function light(x, y, r, h, k, skip) { LIGHTS.push({ x, y, r, h, k, skip }); }
function lightFx(x, y, r, h, T) { LFX.push({ x, y, r, h, t0: M.time, T }); }
function drawLights(vis) {
  for (let i = LFX.length - 1; i >= 0; i--) { const f = LFX[i], u = (M.time - f.t0) / f.T; if (u >= 1 || u < 0) LFX.splice(i, 1); else light(f.x, f.y, f.r, f.h, (1 - u) ** 2); }
  for (const w of M.wrecks) if (w.burn > 0) light(w.x, w.y, 110, 34, 0.4 + 0.15 * Math.sin(M.time * 23 + w.x) * Math.sin(M.time * 9.7), w);   // still burning
  const L = LIGHTS.filter(l => l.k > 0.02 && vis(l.x, l.y, l.r)).sort((a, b) => b.k * b.r - a.k * a.r).slice(0, LMAX); LIGHTS.length = 0;
  for (const l of L) drawLight(l);
}
let _lhp = new Uint8Array(0), _lq = new Float32Array(0), _lc = null, _lg = null;
const _lid = new Map();
function drawLight(l) {
  const n = Math.ceil(l.r / LC), S = n * 2, X0 = l.x - n * LC, Y0 = l.y - n * LC;
  if (_lhp.length < S * S) _lhp = new Uint8Array(S * S);
  const hp = _lhp; hp.fill(0, 0, S * S);
  // the height patch: cells whose centre is in the box (and passes test) get at least h
  const put = (x0, y0, x1, y1, h, test) => {
    const i0 = Math.max(0, Math.floor((x0 - X0) / LC)), i1 = Math.min(S - 1, Math.floor((x1 - X0) / LC)), j0 = Math.max(0, Math.floor((y0 - Y0) / LC)), j1 = Math.min(S - 1, Math.floor((y1 - Y0) / LC));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * S + i; if (hp[k] < h && (!test || test(X0 + (i + 0.5) * LC, Y0 + (j + 0.5) * LC))) hp[k] = h; }
  };
  const hull = (o, hl, hw, h) => { const R = Math.hypot(hl, hw); put(o.x - R, o.y - R, o.x + R, o.y + R, h, (x, y) => { const [lx, ly] = toLocal(o, x, y); return Math.abs(lx) < hl && Math.abs(ly) < hw; }); };
  const near = o => Math.abs(o.x - l.x) < l.r + 60 && Math.abs(o.y - l.y) < l.r + 60;
  for (const b of rectsIn(MAP.buildings, X0, Y0, X0 + S * LC, Y0 + S * LC, _rb)) if (!b.glass) put(b.x, b.y, b.x + b.w, b.y + b.h, 255);   // glass lets light through
  for (const s of staticsNear(l.x, l.y, l.r + 16, _near)) { const h = LH[s.type]; if (!h) continue; const r = s.type === 'tree' ? 6 : s.r; put(s.x - r, s.y - r, s.x + r, s.y + r, h, (x, y) => (x - s.x) ** 2 + (y - s.y) ** 2 < r * r); }
  for (const v of M.vehicles) {
    if (!v.active || v.dead || v === l.skip || !near(v)) continue;
    if (v.type === 'nest') put(v.x - 21, v.y - 21, v.x + 21, v.y + 21, LH.nest, (x, y) => { const d = (x - v.x) ** 2 + (y - v.y) ** 2; return d > 169 && d < 441; });   // the ring of bags
    else hull(v, v.T.hl, v.T.hw, LH[v.type]);
  }
  for (const w of M.wrecks) if (w !== l.skip && near(w)) hull(w, VT[w.type].hl, VT[w.type].hw, LH[w.type] * 0.8);
  // rays: q[ray, step] = the lowest (h - height) / distance of everything before that step
  const N = Math.ceil(TAU * n);
  if (_lq.length < N * n) _lq = new Float32Array(N * n);
  const q = _lq;
  for (let r = 0; r < N; r++) {
    const a = r / N * TAU, ux = Math.cos(a), uy = Math.sin(a); let m = Infinity;
    for (let k = 0; k < n; k++) {
      const d = (k + 0.5) * LC; q[r * n + k] = m;
      const hh = hp[Math.floor(n + uy * d / LC) * S + Math.floor(n + ux * d / LC)];
      if (hh) { const v = hh >= l.h ? -1 : (l.h - hh) / d; if (v < m) m = v; }
    }
  }
  // each cell: lit if nothing before it on its ray reaches above the line from the light down to it (walls stay dark)
  if (!_lc || _lc.width < S) { _lc = mk(Math.max(S, 128), Math.max(S, 128)); _lg = _lc.getContext('2d'); }
  let id = _lid.get(S); if (!id) { id = _lg.createImageData(S, S); _lid.set(S, id); }
  const px = id.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const dx = (i + 0.5 - n) * LC, dy = (j + 0.5 - n) * LC, D = Math.hypot(dx, dy), o = (j * S + i) * 4, hc = hp[j * S + i]; let f = 0;
    if (D < l.r && hc < 255) { const r = (Math.round(Math.atan2(dy, dx) / TAU * N) + N) % N, k = Math.min(n - 1, Math.floor(D / LC)); if (q[r * n + k] >= (l.h - hc) / D) f = 0.5 * (1 - D / l.r) ** 1.3 + 0.5 * Math.max(0, 1 - D / 40) ** 2; }     // a hot core and a wide spill (where the shadows show)
    px[o] = 255; px[o + 1] = 214; px[o + 2] = 150; px[o + 3] = f * 255;
  }
  _lg.putImageData(id, 0, 0);
  worldT(); ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'color-dodge'; ctx.globalAlpha = 0.6 * l.k; ctx.drawImage(_lc, 0, 0, S, S, X0, Y0, S * LC, S * LC);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.2 * l.k; ctx.drawImage(_lc, 0, 0, S, S, X0, Y0, S * LC, S * LC);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
}
