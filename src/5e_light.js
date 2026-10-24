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

/* ---------------- the sun: shading and shadows from a height buffer (WebGL) ----------------
   While the world is drawn, a second, half-resolution canvas (HC) gets every solid thing's height: the material atlas
   (atlas_m.png, R = 4 per px) drawn with the same transforms, each part lifted onto what it sits on (SUNB), 'lighten' so
   the highest surface wins; walls, trees, hay, fences and crates as shapes. A WebGL pass reads it back: the slope of each
   pixel against the sun (lit faces brighter and warmer, faces turned away darker) and a march toward the sun for
   shadows that are as long as the thing is tall. Two maps come out side by side: the shade (multiplied in) and the
   highlights (colour-dodged, so they brighten the art in proportion instead of greying dark paint). It replaces the old offset shadows (SUNNOW). Off in settings, or without WebGL: the old look */
const SUN = { az: -2.36, el: 0.7, tint: [0.46, 0.5, 0.64], warm: [1, 0.93, 0.8] };     // az: toward the sun (up-left); el: its height
const HS = 0.5;                                                                       // height buffer resolution vs the screen
const SUNH = { wall: 40, fence: 9, hay: 14, crate: 10, nest: 10, tree: [56, 36] };     // px
const SUNB = { tur: 12, gun: 16, mgTank: 20, mgJeep: 8, mgNest: 4, crewTank: 12, crewJeep: 3, stand: 7 };   // px under a part
let SUNNOW = false, SUNDBG = 0, _sun = null;
const MIMG = typeof Image !== 'undefined' && typeof MAT_SRC !== 'undefined' ? new Image() : null;
if (MIMG) MIMG.src = MAT_SRC;
function sunOn() { return CFG.sun !== false && !!sunInit(); }
function sunInit() {
  if (_sun !== null) return _sun;
  if (typeof WebGLRenderingContext === 'undefined' || !MIMG || !MIMG.complete || !imgReady) return false;     // tried again once the art is in
  _sun = false;
  try {
    const GC = mk(4, 4), gl = GC.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: true });
    if (!gl) return false;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const P = gl.createProgram();
    gl.attachShader(P, sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main() { gl_Position = vec4(p, 0., 1.); }'));
    gl.attachShader(P, sh(gl.FRAGMENT_SHADER, `precision highp float;
uniform sampler2D H; uniform vec2 S; uniform vec4 R; uniform float K, T, O; uniform vec3 L, C, W; uniform vec2 D;
float hh(vec2 p) { return texture2D(H, clamp(p, R.xy, R.zw) / S).r * 63.75; }
void main() {
  vec2 p = vec2(gl_FragCoord.x - O, S.y - gl_FragCoord.y);     // O: the highlight map is drawn to the right of the shade
  float h0 = hh(p);
  vec2 g = vec2(hh(p + vec2(1., 0.)) - hh(p - vec2(1., 0.)), hh(p + vec2(0., 1.)) - hh(p - vec2(0., 1.))) * K * 0.5;
  vec3 N = normalize(vec3(-g, 1.));
  float lam = (0.45 + 0.55 * max(dot(N, L), 0.)) / (0.45 + 0.55 * L.z);
  float sh = 1., mt = (64. - h0) / T, j = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  for (int i = 0; i < 24; i++) {
    float t = mt * (float(i) + j) / 24., d = hh(p + D * t * K) - h0 - t * T;
    if (d > 0.) sh = min(sh, clamp(1. - d / (1. + t * 0.12), 0., 1.));
  }
  vec3 hi = W * max(lam - 1., 0.) * 1.6 * sh;
  gl_FragColor = vec4(O > 0. ? hi / (1. + hi) : mix(C, vec3(1.), sh) * min(lam, 1.), 1.);     // dodge by h / (1 + h): x (1 + h)
}`));
    gl.linkProgram(P); if (!gl.getProgramParameter(P, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(P));
    gl.useProgram(P);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(P, 'p'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const U = {}; for (const n of ['S', 'R', 'K', 'L', 'D', 'T', 'C', 'W', 'O']) U[n] = gl.getUniformLocation(P, n);
    // the material atlas with the colour atlas's silhouette, for matSpr
    const w = MIMG.width, h = MIMG.height, g2 = mk(w, h).getContext('2d', { willReadFrequently: true });
    g2.drawImage(MIMG, 0, 0); const mp = g2.getImageData(0, 0, w, h).data; g2.clearRect(0, 0, w, h); g2.drawImage(IMG, 0, 0); const ap = g2.getImageData(0, 0, w, h).data;
    _sun = { gl, GC, U, HC: mk(4, 4), HX: null, mp, ap, w, spr: new Map() };
  } catch (e) { console.warn('sun off:', e.message); _sun = false; }
  return _sun;
}
/* a sprite's heights lifted by base px, opaque where the art is (alpha >= 128), as a canvas (cached) */
function matSpr(n, base) {
  const S = _sun, key = n + '|' + base; let c = S.spr.get(key); if (c) return c;
  const m = ATLAS[n]; c = mk(m[2], m[3]); const g = c.getContext('2d'), d = g.createImageData(m[2], m[3]), p = d.data;
  for (let y = 0; y < m[3]; y++) for (let x = 0; x < m[2]; x++) {
    const i = ((m[1] + y) * S.w + m[0] + x) * 4, o = (y * m[2] + x) * 4; if (S.ap[i + 3] < 128) continue;
    p[o] = Math.min(255, S.mp[i] + base * 4); p[o + 1] = S.mp[i + 1]; p[o + 2] = S.mp[i + 2]; p[o + 3] = 255;
  }
  g.putImageData(d, 0, 0); S.spr.set(key, c); return c;
}
function hspr(n, x, y, a, base) { const m = ATLAS[n]; if (m) sprC(matSpr(n, base || 0), m[4], m[5], x, y, a); }
const H4 = h => `rgb(${clamp(Math.round(h * 4), 0, 255)},0,0)`;
/* everything solid, as heights (the same things, and the same hidden ones left out, as the frame draws) */
function sunHeights(vis, hidden) {
  worldT(); ctx.fillStyle = H4(SUNH.wall);
  for (const b of MAP.buildings) if (!b.glass && vis(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) ctx.fillRect(b.x, b.y, b.w, b.h);
  for (const s of MAP.statics) {
    if (!s.alive || !vis(s.x, s.y, 40)) continue;
    if (s.type === 'tree') {
      const r = (s.pine ? SPR.pines : SPR.trees)[s.v].width / 2 * s.sc * 0.85, gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      gr.addColorStop(0, H4(SUNH.tree[0])); gr.addColorStop(1, H4(SUNH.tree[1])); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill();
    } else if (s.type === 'hay') { const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 13); gr.addColorStop(0, H4(SUNH.hay)); gr.addColorStop(1, H4(SUNH.hay * 0.6)); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(s.x, s.y, 13, 0, TAU); ctx.fill(); }
    else if (s.type === 'fence') { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); ctx.fillStyle = H4(SUNH.fence); ctx.fillRect(-7, -1.5, 14, 3); ctx.restore(); }
  }
  ctx.fillStyle = H4(SUNH.crate); for (const c of M.crates) if (c.live && vis(c.x, c.y, 14)) { ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a); ctx.fillRect(-8, -8, 16, 16); ctx.restore(); }
  for (const A of MAP.arcs) { if (!vis(A.x, A.y, 50)) continue; const f = A.lost / A.bags.length; hspr(f < 0.25 ? 'bagarc0' : f < 0.75 ? 'bagarc1' : 'bagarc2', A.x, A.y, A.a); }
  for (const w of M.wrecks) {
    if (!vis(w.x, w.y, 70) || w.t < 1) continue;
    if (w.type === 'tank') { const tx = w.x - 4 * Math.cos(w.a), ty = w.y - 4 * Math.sin(w.a); hspr('hull5', w.x, w.y, w.a); hspr('tur_dead', tx, ty, w.ta, SUNB.tur * 0.8); }
    else { if (w.bx !== undefined) hspr(w.bf ? 'jeep_flat' : 'jeep_wheel', w.bx, w.by, w.ba); hspr('jeep4', w.x, w.y, w.a); }
  }
  for (const s of M.sol) {
    if (!s.alive || s.veh || s.swim || !vis(s.x, s.y, 30) || hidden(s)) continue;
    if (s.down) { hspr('sol_dead', s.x, s.y, s.a + Math.PI); continue; }
    const body = 'sol_' + bodyPose(s), k = 1 + 0.15 * jumpK(s);
    if (s.stance === 2) { hspr('sol_' + legFrame(s), s.x, s.y, s.a); hspr(body, s.x, s.y, s.a); }
    else hspr(body, s.x, s.y, s.a, Math.round(SUNB.stand * k));
  }
  for (const v of M.vehicles) {
    if (!v.active || !vis(v.x, v.y, 80)) continue;
    const [mx, my] = mgPos(v), mg = v.mgFlash > 0 ? 'mg_f' : 'mg', crew = (i, b) => { const s = v.seats[i]; if (s) hspr('sol_sit', s.x, s.y, s.a, b); };
    if (v.type === 'nest') { ctx.strokeStyle = H4(SUNH.nest); ctx.lineWidth = 8; worldT(); ctx.beginPath(); ctx.arc(v.x, v.y, 18, v.a - 1.35, v.a + 1.35); ctx.stroke(); hspr(mg, mx, my, v.mgA, SUNB.mgNest); crew(0, 0); continue; }
    if (v.type === 'tank') {
      const [px, py] = turretPivot(v), kick = clamp(v.recoil, 0, 1) * 33;
      hspr('hull' + hullFrame(v), v.x, v.y, v.a); crew(2, SUNB.crewTank); crew(3, SUNB.crewTank);
      hspr('tur_gun', px - Math.cos(v.ta) * kick, py - Math.sin(v.ta) * kick, v.ta, SUNB.gun); hspr('tur', px, py, v.ta, SUNB.tur);
      hspr(mg, mx, my, v.mgA, SUNB.mgTank); crew(1, SUNB.mgTank - 4);
    } else {
      const c = Math.cos(v.a), s = Math.sin(v.a), [wx, wy] = EXTRA.jeepWells[0], st = jeepSteer(v), f = v.hp / v.T.hp;
      for (const sd of [-1, 1]) hspr('jeep_tire', v.x + c * wx - s * wy * sd, v.y + s * wx + c * wy * sd, v.a + st);
      hspr('jeep' + (f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3), v.x, v.y, v.a); crew(0, SUNB.crewJeep); crew(1, SUNB.crewJeep);
      hspr(mg, mx, my, v.mgA, SUNB.mgJeep); crew(2, SUNB.mgJeep - 3);
    }
  }
}
function drawSun(vw, vis, hidden) {
  const S = _sun, { gl, GC, HC, U } = S, w = Math.ceil(cv.width * HS), h = Math.ceil(cv.height * HS);
  if (HC.width !== w || HC.height !== h) { HC.width = w; GC.width = w * 2; HC.height = GC.height = h; S.HX = HC.getContext('2d', { willReadFrequently: false }); }
  const rx = Math.floor(vw.x * DPR * HS), ry = Math.floor(vw.y * DPR * HS), rw = Math.min(w - rx, Math.ceil(vw.w * DPR * HS)), rh = Math.min(h - ry, Math.ceil(vw.h * DPR * HS));
  // heights
  const main = ctx, dpr = DPR, fl = FLASH; ctx = S.HX; DPR = dpr * HS; FLASH = 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(rx, ry, rw, rh);
  ctx.save(); ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip(); ctx.imageSmoothingEnabled = false; ctx.globalCompositeOperation = 'lighten';
  sunHeights(vis, hidden);
  ctx.restore(); ctx = main; DPR = dpr; FLASH = fl;
  // light
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, HC);
  gl.enable(gl.SCISSOR_TEST);
  const ce = Math.cos(SUN.el);
  gl.uniform2f(U.S, w, h); gl.uniform4f(U.R, rx + 0.5, ry + 0.5, rx + rw - 0.5, ry + rh - 0.5); gl.uniform1f(U.K, VZ * dpr * HS);
  gl.uniform3f(U.L, Math.cos(SUN.az) * ce, Math.sin(SUN.az) * ce, Math.sin(SUN.el)); gl.uniform2f(U.D, Math.cos(SUN.az), Math.sin(SUN.az)); gl.uniform1f(U.T, Math.tan(SUN.el));
  gl.uniform3f(U.C, ...SUN.tint); gl.uniform3f(U.W, ...SUN.warm);
  for (const o of [0, w]) { gl.viewport(o, 0, w, h); gl.scissor(o + rx, h - ry - rh, rw, rh); gl.uniform1f(U.O, o); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
  const to = [vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR];
  if (SUNDBG) ctx.drawImage(SUNDBG === 1 ? HC : GC, SUNDBG === 3 ? w + rx : rx, ry, rw, rh, ...to);       // dev: 1 heights, 2 shade, 3 highlights
  else { ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(GC, rx, ry, rw, rh, ...to); ctx.globalCompositeOperation = 'color-dodge'; ctx.drawImage(GC, w + rx, ry, rw, rh, ...to); }
  ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false; worldT();
}
