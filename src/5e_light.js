/* ---------------- point lights with height-aware shadows ----------------
   A light sits h px above the ground. Around it everything has a height (walls and tree trunks: unlimited; vehicles,
   wrecks, sandbags, hay: their own), rasterised into a patch of LC px cells. Rays from the light keep the lowest
   (h - height) / distance of what they've passed: a cell at distance D, itself hc high, is lit while that stays >= (h - hc) / D.
   So something lower than the light throws a shadow that ends (a jeep beside an MG flash), a wall's runs to the edge.
   The patch is drawn smoothed (soft shadow edges) and brightens what's under it: dodged, then a little added.
   With the sun on, the sun's shader does them instead, from its height buffer (per pixel, slopes facing a light lit more) */
const LC = 4, LMAX = 10, LIGHTS = [], LFX = [];
const LH = { tank: 30, jeep: 20, nest: 12, bag: 12, hay: 16, tree: 255 };                 // how tall things are
/* a light this frame (skip: the thing it comes from, which mustn't shade it); lightFx: one that fades over T s */
function light(x, y, r, h, k, skip) { LIGHTS.push({ x, y, r, h, k, skip }); }
function lightFx(x, y, r, h, T) { LFX.push({ x, y, r, h, t0: M.time, T }); }
function lightsNow(vis) {          // this frame's strongest lights in view (and the queue emptied)
  for (let i = LFX.length - 1; i >= 0; i--) { const f = LFX[i], u = (M.time - f.t0) / f.T; if (u >= 1 || u < 0) LFX.splice(i, 1); else light(f.x, f.y, f.r, f.h, (1 - u) ** 2); }
  for (const w of M.wrecks) if (w.burn > 0) light(w.x, w.y, 110, topOf(w) + 6, 0.4 + 0.15 * Math.sin(M.time * 23 + w.x) * Math.sin(M.time * 9.7), w);   // still burning
  const L = LIGHTS.filter(l => l.k > 0.02 && vis(l.x, l.y, l.r)).sort((a, b) => b.k * b.r - a.k * a.r).slice(0, LMAX); LIGHTS.length = 0; if (M.dev) DEV.lp = L;
  return L;
}
function drawLights(vis) { for (const l of lightsNow(vis)) drawLight(l); }
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
    else hull(v, v.T.hl, v.T.hw, topOf(v) || LH[v.type]);
  }
  for (const w of M.wrecks) if (w !== l.skip && near(w)) hull(w, VT[w.type].hl, VT[w.type].hw, topOf(w) || LH[w.type] * 0.8);
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
   A half-resolution height texture (HT, drawn on the GPU: one instanced quad per thing, sunHeights) gets every solid
   thing's height: the material atlas (atlas_m.png, R = 4 per px) with the frame's transforms, each part lifted onto what
   it sits on, MAX blended so the highest surface wins; walls, trees, hay, fences, crates and smoke as shapes. Every pixel is a span: R = its top, G = 255 - its
   bottom (4 per px; 'lighten' keeps the highest top and the lowest bottom), so something with an air gap under it (a gun
   past the hull, a jumping soldier) throws a shadow that starts away from its base; a wall's runs from the ground. A WebGL pass reads it back: the slope of each
   pixel against the sun (lit faces brighter and warmer, faces turned away darker) and a march toward the sun for
   shadows that are as long as the thing is tall. Three maps come out in a 2 × 2 grid: the shade (multiplied in), the
   highlights (colour-dodged, so they brighten the art in proportion instead of greying dark paint) and the point lights' warm
   glow (added: dodging alone turns grass lime). The point lights
   (PL: x, y in buffer px, reach and height in world px; PK: strength) add in both: falloff as drawLight's, the slope
   toward the light, and a march to the light against the heights for their shadows (a lower thing's ends). It replaces the old offset shadows (SUNNOW). Off in settings, or without WebGL: the old look.
   The sun's shadows: the sweep (sunSweep: each pixel learns what blocks it from its neighbours sunward, doubling the reach a
   pass: exact, and the same cost however long the shadows). Two height maps: HT everything, HTS only what the out-of-sight
   memory keeps (walls, trees, roofs, hay, fences, sandbags, wrecks: list u, the rest, isn't in it), each swept. With vision
   on, the light runs twice: the frame's (HT), and the memory's (FG: HTS, no point lights) into a fourth map, which the
   memory keeps where you see it, like the ground (fogOverlay) */
const ROOF_Z = [36, 42];     // a tiled house's roof: a slab this high (px), over the walls' tops
const SUN = { az: -2.36, el: 0.7, tint: [0.46, 0.5, 0.64], warm: [1, 0.93, 0.8], sky: [0.56, 0.7, 0.9], skyRain: [0.5, 0.53, 0.58] };     // az: toward the sun (up-left); el: its height; sky: what reflective things mirror
const HS = 0.5;                                                                       // height buffer resolution vs the screen
const SUNH = { flag: 22, item: 4, wall: 40, fence: 9, hay: 14, crate: 10, nest: 10, tree: [56, 36] };     // px
const SUNB = { mgNest: SUNH.nest, stand: 18, jump: 4 };     // px: the nest MG rests on its bags (drawn over them, so never lower); a soldier's legs (added to his painted height, solid); a jump's gap
/* per part (sprite name less its frame number) or shape (SUNH name): lift = an air gap (px) between it and what it rests
   on, add = px taller than painted. A part's start is the top of what's under it (+ lift); its pixels stand on that */
const SUNP = { tur_gun: { lift: 4 } };
/* draw order: each thing's height (px, its top as the sun pass has it); drawWorld draws low to high */
const ZH = { body: 1, item: 2, shot: 12 };     // fallbacks; the rest comes from the art (topOf, artMax, shotZ)
const solZ = s => s.down ? ZH.body : solLift(s) + solAdd(s) + artMax('sol_' + bodyPose(s));
const sunP = n => SUNP[n] || SUNP[n.replace(/\d+$/, '')] || {};
let SUNNOW = false, SUNDBG = 0, _sun = null;
const MIMG = typeof Image !== 'undefined' && typeof MAT_SRC !== 'undefined' ? new Image() : null;
if (MIMG) MIMG.src = MAT_SRC;
/* the material atlas's heights (mp) beside the colour atlas's alpha (ap), readable without WebGL: draw order, spawn heights */
let MAT = null;
function matData() {
  if (MAT || !MIMG || !MIMG.complete || !MIMG.width || !imgReady) return MAT;
  const w = MIMG.width, h = MIMG.height, g2 = mk(w, h).getContext('2d', { willReadFrequently: true });
  g2.drawImage(MIMG, 0, 0); const mp = g2.getImageData(0, 0, w, h).data; g2.clearRect(0, 0, w, h); g2.drawImage(IMG, 0, 0); const ap = g2.getImageData(0, 0, w, h).data;
  return MAT = { mp, ap, w, h };
}
/* a sprite's painted height (px) at a point (from its pivot, unrotated); past its edge, the nearest pixel back toward the pivot */
function artH(n, lx, ly) {
  const D = matData(), m = ATLAS[n]; if (!D || !m) return 0;
  const L = Math.hypot(lx, ly), st = L > 1 ? 1 / L : 1;
  for (let f = 1; f > 0; f -= st) { const x = Math.floor(m[4] + lx * f), y = Math.floor(m[5] + ly * f); if (x < 0 || y < 0 || x >= m[2] || y >= m[3]) continue; const i = ((m[1] + y) * D.w + m[0] + x) * 4; if (D.ap[i + 3] >= 128) return D.mp[i] / 4; }
  return 0;
}
const _amx = new Map(), _amt = new Map();
function artMat(n) {         // 1: some of it reflects, 2: some of it glows
  let v = _amt.get(n); if (v !== undefined) return v; const D = matData(), m = ATLAS[n]; if (!D || !m) return 0; v = 0;
  for (let y = 0; y < m[3]; y++) for (let x = 0; x < m[2]; x++) { const i = ((m[1] + y) * D.w + m[0] + x) * 4; if (D.ap[i + 3] >= 128) v |= (D.mp[i + 1] > 8 ? 1 : 0) | (D.mp[i + 2] > 8 ? 2 : 0); }
  _amt.set(n, v); return v;
}
function artMax(n) {         // its tallest pixel
  let v = _amx.get(n); if (v !== undefined) return v; const D = matData(), m = ATLAS[n]; if (!D || !m) return 0; v = 0;
  for (let y = 0; y < m[3]; y++) for (let x = 0; x < m[2]; x++) { const i = ((m[1] + y) * D.w + m[0] + x) * 4; if (D.ap[i + 3] >= 128) v = Math.max(v, D.mp[i] / 4); }
  _amx.set(n, v); return v;
}
/* where things start: a soldier's gap under him (a jump) and his legs; the gun's muzzle, the throwing hand */
const solLift = s => Math.round(SUNB.jump * jumpK(s)), solAdd = s => s.stance === 2 ? 0 : SUNB.stand;
function handH(s) { return solLift(s) + solAdd(s) + artH('sol_nogun', 10, 0); }
function gunH(s) {
  if (s.veh) { const q = partsOf(s.veh).find(q => q.who === s); if (!q) return ZH.shot; const [x, y] = muzzle(s, 20); return partH(q, x, y); }
  const [x, y] = gunTip(s), c = Math.cos(s.a), sn = Math.sin(s.a), dx = x - s.x, dy = y - s.y;
  return solLift(s) + solAdd(s) + artH('sol_' + bodyPose(s), dx * c + dy * sn, -dx * sn + dy * c);
}
/* a vehicle's mounted MG and cannon at their muzzles */
function mgH(v) { const q = partsOf(v).find(q => /^mg/.test(q.n)), [mx, my] = mgPos(v); return q ? partH(q, mx + Math.cos(v.mgA) * 31, my + Math.sin(v.mgA) * 31) : ZH.shot; }
function canH(v) { const q = partsOf(v).find(q => q.n === 'tur_gun'), [px, py] = turretPivot(v); return q ? partH(q, px + Math.cos(v.ta) * BARREL, py + Math.sin(v.ta) * BARREL) : ZH.shot; }
/* a projectile's height: where it left the gun (worked out once) */
function shotZ(p) {
  if (p.k === 'nade') return p.h + 3; if (p.z !== undefined) return p.z;
  const v = p.srcV || (p.src && p.src.veh);
  return p.z = v && v.active ? (p.k === 'shell' ? canH(v) : p.mg ? mgH(v) : gunH(p.src)) : p.src && p.src.alive ? gunH(p.src) : ZH.shot;
}
/* a grenade in the air: its height above the line it was thrown along (from the hand down to where it lands) lifts it on screen */
const NADE_T = 2 * 260 / 700;
const nadeY = p => p.y - 0.3 * Math.max(0, p.h - (p.h0 || 0) * clamp(1 - ((p.T0 || p.life) - p.life) / NADE_T, 0, 1));
function sunOn() { return CFG.sun !== false && !!sunInit(); }
function sunInit() {
  if (_sun !== null) return _sun;
  if (typeof WebGLRenderingContext === 'undefined' || !MIMG || !MIMG.complete || !imgReady) return false;     // tried again once the art is in
  _sun = false;
  try {
    const GC = mk(4, 4), gl = GC.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: true });
    if (!gl) return false;
    const IA = gl.getExtension('ANGLE_instanced_arrays'), MX = gl.getExtension('EXT_blend_minmax');
    if (!IA || !MX) throw new Error('no instancing / max blending');
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const prog = (vs, fs, at) => { const P = gl.createProgram(); gl.attachShader(P, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(P, sh(gl.FRAGMENT_SHADER, fs)); at.forEach((n, i) => gl.bindAttribLocation(P, i, n)); gl.linkProgram(P); if (!gl.getProgramParameter(P, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(P)); return P; };
    const VS = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0., 1.); }', TX = `uniform sampler2D H, HS; uniform vec2 S; uniform vec4 R; uniform float FG;
vec4 tx(vec2 p) { return texture2D(H, clamp(p, R.xy, R.zw) / S); }
float hh(vec2 p) { vec4 c = tx(p); return max(c.r, c.g) * 63.75; }     // the top: grounded (R) or floating (G), whichever's higher
float hv(vec2 p, bool o) { if (o) { vec4 c = texture2D(HS, clamp(p, R.xy, R.zw) / S); return max(c.r, c.g) * 63.75; } return hh(p); }`;     // the top that shows: out of sight (o), only what's remembered
    /* the light, once per pixel: the sun's slope (lam) and shadow (sh), the point lights (pl: falloff, slope toward each,
       its own shadow march) and their glow scattered in haze (smoke, rain) into LT: sh, lam / 2, pl / 4, scatter / 4 */
    const P = prog(VS, `precision highp float; ${TX}
uniform float K, V, HZ; uniform vec2 P; uniform vec3 L; uniform vec4 PL[${LMAX}]; uniform float PK[${LMAX}]; uniform sampler2D SWT, SWS;
float un(vec2 c) { return (c.x * 255. + c.y) / 255. * 128. - 64.; }     // a height packed in two bytes (sunSweep)
float blk(vec2 p, float z, out float o, out float th) { vec4 c = texture2D(H, (floor(clamp(p, R.xy, R.zw)) + 0.5) / S); o = 1.; th = c.r * 63.75; float d = th - z;     // grounded: solid from the ground up (no soft foot)
  float ft = c.g * 63.75, fb = (1. - c.a) * 63.75; if (ft > 0.01) { float e = min(ft - z, z - fb); if (e > d) { d = e; th = ft - fb; } }     // floating: its own span, the gap under it kept
  if (c.b > 0.5) { float e = min(${ROOF_Z[1].toFixed(1)} - z, z - ${ROOF_Z[0].toFixed(1)}); if (e > d) { d = e; th = ${(ROOF_Z[1] - ROOF_Z[0]).toFixed(1)}; } }     // a roof over it (B): the slab blocks too
  return d; }     // > 0: height z is inside something here (th thick; read unblended, so a blend of two pixels isn't a span neither has); o: how much it blocks
void main() {
  vec2 p = vec2(gl_FragCoord.x, V - gl_FragCoord.y) + P;     // P: the view's place in H
  bool ou = FG > 0.5; float h0 = hv(p, ou);     // FG: the memory's light (only what it keeps, no point lights)
  vec2 g = vec2(hv(p + vec2(1., 0.), ou) - hv(p - vec2(1., 0.), ou), hv(p + vec2(0., 1.), ou) - hv(p - vec2(0., 1.), ou)) * K * 0.5;
  vec3 N = normalize(vec3(-g, 1.));
  float lam = (0.45 + 0.55 * max(dot(N, L), 0.)) / (0.45 + 0.55 * L.z);
  float sh = 1., j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));     // interleaved gradient noise: an even spread, not speckle
  { vec2 q = (floor(p) + 0.5) / S; vec4 c = ou ? texture2D(SWS, q) : texture2D(SWT, q); float g = un(c.rg), lo = c.b * 128. - 64., hi = c.a * 128. - 64.; sh = 1. - max(clamp((g - h0 + 0.75) / 1.5, 0., 1.), clamp((min(h0 - lo, hi - h0) + 0.75) / 1.5, 0., 1.)); }     // under the skyline, or inside a floating span
  float pl = 0., sc = 0.;
  for (int i = 0; i < ${LMAX}; i++) {
    if (PK[i] <= 0. || ou) continue;     // the memory's: none (they'd give a shot away)
    vec2 v = PL[i].xy - p; float dl = length(v) / K, lh = PL[i].w - h0;
    if (dl >= PL[i].z) continue;
    float s = 1.;
    for (int k = 1; k < 12; k++) { float o, th, t = (float(k) - j) / 12., d = blk(p + v * t, h0 + lh * t, o, th); if (d > 0.) s = min(s, 1. - clamp(d / min(3., th * 0.35), 0., 1.) * o); }
    vec3 ld = normalize(vec3(v / K, max(lh, dl * 0.5)));     // the slope it lights: from at least a little above (a flash at hip height still lights the hull facing it)
    pl += PK[i] * s * (0.5 * pow(1. - dl / PL[i].z, 1.3) + 0.5 * pow(max(0., 1. - dl / 40.), 2.)) * clamp(dot(N, ld) / max(ld.z, 0.15), 0., 2.);     // what faces the light (flat ground: x 1)
    sc += PK[i] * pow(1. - dl / PL[i].z, 2.);
  }
  gl_FragColor = vec4(sh, lam * 0.5, pl * 0.25, min(1., sc * HZ * 0.25));
}`, ['p']);
    /* the maps (Q 0 shade: multiplied, 1 highlights: dodged, 2 glow: added) from LT, the heights' normals and the materials
       (MT: R reflectivity, G glow, B water): reflective paint mirrors the sky (dims its own colour by as much) and glints
       where its slope sends the sun to the eye; water ripples; glow brightens
       its own art and blooms (BL). WX: buffer px to world px. Q 3 / 4: the heights / materials (dev) */
    const CP = prog(VS, `precision highp float; ${TX}
uniform sampler2D MT, LT; uniform vec2 G, P, O; uniform float K, Q, V, TM, BL, EN, RF; uniform vec3 L, C, W, SKY; uniform vec3 WX; uniform vec4 E[2];
float ro(float d) { return ${ROOF_CAP.toFixed(2)} * clamp((d - ${ROOF_NEAR.toFixed(1)}) / ${(ROOF_FAR - ROOF_NEAR).toFixed(1)}, 0., 1.); }     // roofOp
float roofA(vec2 p, vec2 w, bool ou) {     // how much of the roof shows here (roofView's fade; out of sight, all of it)
  if (tx(p).b < 0.5 || hh(p) > ${ROOF_Z[1].toFixed(1)}) return 0.;
  if (ou) return 1.;
  float a = 1.;
  for (int i = 0; i < 4; i++) { if (float(i) >= EN) break; vec4 e = E[i / 2]; float d = length(w - (i - i / 2 * 2 == 0 ? e.xy : e.zw)); a *= i == 0 ? ro(d) : ro(d) / ${ROOF_CAP.toFixed(2)}; }
  return mix(1., a, RF); }     // RF: how far inside a house the view is (roofView's vw.rf)
vec4 mt(vec2 p) { return texture2D(MT, clamp(p, R.xy, R.zw) / S); }
float hs(vec2 p) { vec3 q = fract(p.xyx * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }     // fract hash: no big sin (it splits between cells)
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hs(i), hs(i + vec2(1., 0.)), f.x), mix(hs(i + vec2(0., 1.)), hs(i + vec2(1., 1.)), f.x), f.y); }
float wv(vec2 w) { return vn(w * 0.06 + vec2(TM * 0.35, TM * 0.25)) + 0.5 * vn(w * 0.14 - vec2(TM * 0.45, -TM * 0.2)); }
void main() {
  vec2 f = gl_FragCoord.xy - O, p = vec2(f.x, V - f.y) + P;     // O: where this map sits in GC (GL pixels)
  if (Q > 4.5) { vec4 a = texture2D(LT, f / G); gl_FragColor = vec4(Q > 5.5 ? min(a.b * 4. * vec3(1., 0.84, 0.59) + a.a * 2., 1.) : vec3(a.r), 1.); return; }     // dev: the sun's shadow alone, the point lights alone
  if (Q > 2.5) { gl_FragColor = vec4(Q > 3.5 ? mt(p).rgb : tx(p).rgb, 1.); return; }
  vec4 a = texture2D(LT, f / G), m = mt(p);
  float sh = a.r, lam = a.g * 2., r = m.r, gw = m.g; vec3 tint = vec3(1., 0.84, 0.59), pl = a.b * 4. * tint;
  vec2 w = (p - WX.xy) / WX.z;
  vec3 N = normalize(vec3(-vec2(hh(p + vec2(1., 0.)) - hh(p - vec2(1., 0.)), hh(p + vec2(0., 1.)) - hh(p - vec2(0., 1.))) * K * 0.5, 1.));
  if (m.b > 0.5) { vec2 e = vec2(1.5, 0.); N = normalize(N + vec3(wv(w - e.xy) - wv(w + e.xy), wv(w - e.yx) - wv(w + e.yx), 0.) * 0.9); }
  vec3 Rv = reflect(vec3(0., 0., -1.), N); float spec = pow(max(dot(Rv, L), 0.), mix(12., 160., r)) * sh;
  bool ou = FG > 0.5;     // the memory's map: shade only (no highlights, glow, gloss), roofs whole
  if (ou && Q > 0.5) { gl_FragColor = vec4(0., 0., 0., 1.); return; }
  if (ou) { pl = vec3(0.); r = 0.; }
  float ra = roofA(p, w, ou);     // the roof shows: lit as a flat top in the sun (as is: no shade, no highlight)
  if (Q < 0.5) { gl_FragColor = vec4(mix(min(mix(C, vec3(1.), sh) * min(lam, 1.) + pl, 1.) * (1. - r * 0.55), vec3(1.), ra), 1.); return; }
  if (Q < 1.5) { vec3 hi = W * max(lam - 1., 0.) * 1.6 * sh + pl * 0.6 + gw * 1.5; gl_FragColor = vec4(hi / (1. + hi) * (1. - ra), 1.); return; }     // dodge by h / (1 + h): x (1 + h)
  float b = 0.;
  if (BL > 0.) for (int i = 0; i < 12; i++) { float t = float(i), q = (1. + t) / 12. * 9. * K; b += mt(p + vec2(cos(t * 2.39996), sin(t * 2.39996)) * q).g; }
  vec3 sky = mix(SKY * 1.2, SKY, Rv.z);
  gl_FragColor = vec4((pl * 0.45 + a.a * 2. * tint + r * (sky * 0.5 * (0.55 + 0.45 * sh) + W * spec * 2.5) + vec3(1., 0.86, 0.62) * b / 12. * BL) * (1. - ra), 1.);
}`, ['p']);
    /* heights: one quad per thing (i0 centre + x half-axis, i1 y half-axis + kind + p0, i2 p1 p2 + atlas uv0, i3 uv1 + its top),
       to buffer px by X (scale, offset); kinds: 0 sprite (p0 base, p1 add: its painted heights from base up), 1 box (p0 top,
       p1 bottom, p2 roof over it: B 1), 2 disc (p0 centre top, p1 rim top, p2 bottom), 3 ring arc (p0 top, p1 inner radius / outer,
       p2 half angle), 5 material only (p0 reflectivity, p1 water, p2 2: a
       disc). Out: what stands on the ground (bottom under 1 px): R its top x 4; what floats (a gun past the hull, a jumper): G its
       top x 4, A 255 - its bottom x 4 (MAX: the highest top, the lowest bottom), so one over the other never fills the gap; B a roof over it (a slab ROOF_Z: casts, isn't the surface). With MM: the materials (R reflectivity, G glow, B water), the
       highest top winning (depth) */
    const HP = prog(`attribute vec2 c; attribute vec4 i0, i1, i2, i3; uniform vec3 X; uniform vec2 F; uniform float MM; varying vec2 q, uv; varying vec4 k;
void main() { vec2 w = i0.xy + i0.zw * c.x + i1.xy * c.y; gl_Position = vec4((w * X.x + X.yz) / F * 2. - 1., MM > 0.5 ? 1. - i3.z / 32. : 0., 1.); q = c; uv = mix(i2.zw, i3.xy, c * 0.5 + 0.5); k = vec4(i1.zw, i2.xy); }`,
`precision highp float; uniform sampler2D A; uniform float MM; varying vec2 q, uv; varying vec4 k;
vec4 span(float t, float b, float z) { float T = clamp(t * 4. / 255., 0., 1.); return b < 1. ? vec4(T, 0., z, 0.) : vec4(0., T, z, 1. - clamp(b * 4. / 255., 0., 1.)); }     // standing on the ground: R; floating: G top, A 255 - bottom
void main() {
  float r2 = dot(q, q);
  if (k.x > 4.5) { if (MM < 0.5 || (k.w > 1.5 && r2 > 1.)) discard; gl_FragColor = vec4(k.y, 0., k.z, 1.); return; }
  if (k.x < 0.5) { vec4 m = texture2D(A, uv); if (m.a < 0.5) discard; gl_FragColor = MM > 0.5 ? vec4(m.g, m.b, 0., 1.) : span(m.r * 63.75 + k.y + k.z, k.y, 0.); return; }
  else if (k.x < 1.5) gl_FragColor = span(k.y, k.z, k.w);
  else if (k.x < 2.5) { if (r2 > 1.) discard; gl_FragColor = span(mix(k.y, k.z, sqrt(r2)), k.w, 0.); }
  else { float r = sqrt(r2); if (r > 1. || r < k.z || abs(atan(q.y, q.x)) > k.w) discard; gl_FragColor = span(k.y, 0., 0.); }
  if (MM > 0.5) gl_FragColor = vec4(0., 0., 0., 1.);
}`, ['c', 'i0', 'i1', 'i2', 'i3']);
    /* the sweep: what blocks the sun at this pixel, in heights here (a blocker d px sunward shades heights b - d DH .. t - d DH),
       kept as two records so one never hides the other: RG the skyline of things standing on the ground (the highest t - d DH:
       exact, two bytes), B / A the span of floating things (a gun past the hull, an MG over the hood: lo / hi, a byte each;
       none: lo > hi). N 0: from the heights 1 px sunward; then N = 1, 2, 4...: joined with what's N px sunward, lowered N DH.
       Two floating spans that don't meet: the lower one kept */
    const SP = prog(VS, `precision highp float; ${TX}
uniform sampler2D B; uniform vec2 D; uniform float N, DH;
float un(vec2 c) { return (c.x * 255. + c.y) / 255. * 128. - 64.; }
vec2 pk(float v) { float x = clamp((v + 64.) / 128., 0., 0.99998) * 255.; return vec2(floor(x) / 255., fract(x)); }
bool out_(vec2 q) { return any(lessThan(q, R.xy)) || any(greaterThan(q, R.zw)); }
void main() {
  vec2 p = gl_FragCoord.xy, a = vec2(64., -64.); float g = -64.;     // a: floating (lo, hi), none; g: the skyline, none
  if (N < 0.5) { vec2 q = p + D; if (!out_(q)) { vec4 c = texture2D(H, (floor(q) + 0.5) / S); float t = c.r * 63.75, ft = c.g * 63.75; if (t > 0.01) g = t - DH; if (ft > 0.01) a = vec2((1. - c.a) * 63.75, ft) - DH; if (c.b > 0.5) { vec2 r = vec2(${ROOF_Z[0].toFixed(1)}, ${ROOF_Z[1].toFixed(1)}) - DH; a = a.x > a.y ? r : vec2(min(a.x, r.x), max(a.y, r.y)); } } }
  else {
    vec4 c = texture2D(B, (floor(p) + 0.5) / S); g = un(c.rg); a = vec2(c.b, c.a) * 128. - 64.;
    vec2 q = p + D * N;
    if (!out_(q)) { c = texture2D(B, (floor(q) + 0.5) / S); g = max(g, un(c.rg) - N * DH); vec2 b = vec2(c.b, c.a) * 128. - 64. - N * DH;
      if (b.y > -1. && b.x <= b.y) { if (a.x > a.y) a = b; else if (b.x <= a.y + 0.5 && a.x <= b.y + 0.5) a = vec2(min(a.x, b.x), max(a.y, b.y)); else if (b.x < a.x) a = b; } }
  }
  if (a.y < -1.) a = vec2(64., -64.);
  gl_FragColor = vec4(pk(max(g, -64.)), clamp((a + 64.) / 128., 0., 1.));
}`, ['p']);
    const buf = d => { const o = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, o); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW); return o; };
    const tri = buf(new Float32Array([-1, -1, 3, -1, -1, 3])), quad = buf(new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])), ib = {};
    for (const n in HL) ib[n] = gl.createBuffer();
    const texture = (f, data) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, f], [gl.TEXTURE_MAG_FILTER, f], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); if (data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data); return t; };
    // the material atlas: R its heights, G reflectivity, B glow, A the colour atlas's silhouette. Units: 0 heights, 1 atlas, 2 materials, 3 light
    const { mp, ap, w, h } = matData(), id = new ImageData(w, h); for (let i = 0; i < mp.length; i += 4) { id.data[i] = mp[i]; id.data[i + 1] = mp[i + 1]; id.data[i + 2] = mp[i + 2]; id.data[i + 3] = ap[i + 3] >= 128 ? 255 : 0; }
    gl.activeTexture(gl.TEXTURE1); const AT = texture(gl.NEAREST, id);
    gl.activeTexture(gl.TEXTURE2); const MT = texture(gl.NEAREST); gl.activeTexture(gl.TEXTURE3); const LT = texture(gl.NEAREST); gl.activeTexture(gl.TEXTURE0); const HT = texture(gl.LINEAR);
    gl.activeTexture(gl.TEXTURE4); const ST = [texture(gl.NEAREST), texture(gl.NEAREST)], FS = [gl.createFramebuffer(), gl.createFramebuffer()]; gl.activeTexture(gl.TEXTURE0);     // the sweep's two (ping-pong)
    gl.activeTexture(gl.TEXTURE6); const SS = [texture(gl.NEAREST), texture(gl.NEAREST)], FSS = [gl.createFramebuffer(), gl.createFramebuffer()];     // the remembered things' sweep
    gl.activeTexture(gl.TEXTURE7); const HTS = texture(gl.LINEAR), FBS = gl.createFramebuffer(); gl.activeTexture(gl.TEXTURE0);     // and their heights
    const FB = gl.createFramebuffer(), FM = gl.createFramebuffer(), FL = gl.createFramebuffer(), DB = gl.createRenderbuffer();
    const uni = (P, ns) => { const U = {}; for (const n of ns) U[n] = gl.getUniformLocation(P, n); return U; };
    const U = uni(P, ['S', 'R', 'K', 'L', 'V', 'P', 'PL', 'PK', 'H', 'HZ', 'SWT', 'SWS', 'HS', 'FG']), SU = uni(SP, ['S', 'R', 'H', 'B', 'D', 'N', 'DH']), CU = uni(CP, ['S', 'R', 'K', 'L', 'C', 'W', 'O', 'Q', 'V', 'P', 'G', 'H', 'MT', 'LT', 'TM', 'BL', 'SKY', 'WX', 'E', 'EN', 'RF', 'FG']), HU = uni(HP, ['X', 'F', 'A', 'MM']);
    gl.useProgram(HP); gl.uniform1i(HU.A, 1); gl.useProgram(CP); gl.uniform1i(CU.H, 0); gl.uniform1i(CU.MT, 2); gl.uniform1i(CU.LT, 3); gl.useProgram(P); gl.uniform1i(U.H, 0); gl.uniform1i(U.SWS, 6); gl.uniform1i(U.HS, 7); gl.uniform1i(U.SWT, 4); gl.useProgram(SP); gl.uniform1i(SU.H, 0); gl.uniform1i(SU.B, 4);
    _sun = { gl, GC, IA, MX, P, CP, HP, SP, U, CU, HU, SU, ST, FS, SS, FSS, HTS, FBS, tri, quad, ib, AT, HT, MT, LT, FB, FM, FL, DB, fw: 0, fh: 0, lw: 0, lh: 0, aw: w, ah: h, pl: new Float32Array(LMAX * 4), pk: new Float32Array(LMAX), ev: new Float32Array(8) };
  } catch (e) { console.warn('sun off:', e.message); _sun = false; }
  return _sun;
}
/* this frame's height quads: a (MAX blended), w (walls, written over: what's there is inside them) then t (trees, MAX) */
const hbuf = () => ({ f: new Float32Array(16 * 256), n: 0 }), HL = { a: hbuf(), u: hbuf(), w: hbuf(), t: hbuf(), m: hbuf() };     // u: what the memory doesn't keep (units, crates, items...); m: materials only (water...)
let HMAT = 0, HMAX = 0;     // this frame: 1 something reflective in view, 2 something glowing; the tallest top in view
function hq(L, cx, cy, ux, uy, vx, vy, k, p0, p1, p2, u0, v0, u1, v1, z) {
  if ((L.n + 1) * 16 > L.f.length) { const g = new Float32Array(L.f.length * 2); g.set(L.f); L.f = g; }
  if (L !== HL.m && z > HMAX) HMAX = z;
  const f = L.f, o = L.n++ * 16; f[o] = cx; f[o + 1] = cy; f[o + 2] = ux; f[o + 3] = uy; f[o + 4] = vx; f[o + 5] = vy; f[o + 6] = k; f[o + 7] = p0; f[o + 8] = p1; f[o + 9] = p2; f[o + 10] = u0 || 0; f[o + 11] = v0 || 0; f[o + 12] = u1 || 0; f[o + 13] = v1 || 0; f[o + 14] = z || 0;
}
/* a quad of half size hw x hh round (cx, cy), turned a */
function hbox(L, cx, cy, hw, hh, a, k, p0, p1, p2, z) { const c = Math.cos(a), s = Math.sin(a); hq(L, cx, cy, c * hw, s * hw, -s * hh, c * hh, k, p0, p1, p2, 0, 0, 0, 0, z ?? (k === 2 ? Math.max(p0, p1) : p0)); }
let HLA = HL.a;     // the list a sprite's heights go in (HL.u while units go in)
/* a sprite's painted heights from base up (each add px taller), where the art is opaque; pivot at (x, y), turned a */
function hspr(n, x, y, a, base, add) {
  const m = ATLAS[n]; if (!m) return; const c = Math.cos(a), s = Math.sin(a), ox = m[2] / 2 - m[4], oy = m[3] / 2 - m[5], S = _sun;
  hq(HLA, x + c * ox - s * oy, y + s * ox + c * oy, c * m[2] / 2, s * m[2] / 2, -s * m[3] / 2, c * m[3] / 2, 0, base || 0, add || 0, 0, m[0] / S.aw, m[1] / S.ah, (m[0] + m[2]) / S.aw, (m[1] + m[3]) / S.ah, (base || 0) + (add || 0) + artMax(n));
  HMAT |= artMat(n);
}
/* a part starts on top of what's already under it: the painted height of the parts stacked so far (the hull, the
   turret...) at its rest point (its pivot unless given: an MG's mount, a seat), the highest within 1 px; at least min */
let _stk = [], _pp = null;
function hUnder(x, y) {
  const S = matData(); let b = 0; if (!S) return 0;
  for (const q of _stk) {
    const m = ATLAS[q.n], c = Math.cos(q.a), s = Math.sin(q.a);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const dx = x + i - q.x, dy = y + j - q.y, lx = Math.floor(m[4] + dx * c + dy * s), ly = Math.floor(m[5] - dx * s + dy * c);
      if (lx < 0 || ly < 0 || lx >= m[2] || ly >= m[3]) continue; const k = ((m[1] + ly) * S.w + m[0] + lx) * 4;
      if (S.ap[k + 3] >= 128) b = Math.max(b, q.b + q.add + S.mp[k] / 4);
    }
  }
  return b;
}
function hpart(n, x, y, a, o = {}) {         // o: min (start at least), add, rx / ry (rest point), keep (others stand on it), who (the crewman)
  if (!ATLAS[n]) return; const P = sunP(n), b = Math.max(o.min || 0, Math.round(hUnder(o.rx ?? x, o.ry ?? y))) + (P.lift || 0), add = (o.add || 0) + (P.add || 0), q = { n, x, y, a, b, add, who: o.who };
  if (o.keep) _stk.push(q); if (_pp) _pp.push(q); else hspr(n, x, y, a, b, add);
}
/* a thing's parts, bottom up, each standing on what's under it (worked out once a frame): what the height pass draws,
   and where its guns, crew and top are */
let FRAMEN = 0; const _pc = new WeakMap();
function partsOf(o) {
  let c = _pc.get(o); if (c && c.f === FRAMEN) return c.p;
  const st = _stk, pp = _pp; _stk = []; _pp = []; (o.seats ? vehParts : M.wrecks.includes(o) ? wreckParts : solParts)(o); c = { f: FRAMEN, p: _pp }; _stk = st; _pp = pp; _pc.set(o, c); return c.p;
}
function partH(q, x, y) { const c = Math.cos(q.a), s = Math.sin(q.a), dx = x - q.x, dy = y - q.y; return q.b + q.add + artH(q.n, dx * c + dy * s, -dx * s + dy * c); }
/* its top (px): the tallest part (crew left out: they don't make the hull taller in the draw order) */
function topOf(o) { let t = 0; for (const q of partsOf(o)) if (!q.who) t = Math.max(t, q.b + q.add + artMax(q.n)); return t; }
function solParts(s) {
  if (s.down) { hpart('sol_dead', s.x, s.y, s.a + Math.PI); return; }
  const body = 'sol_' + bodyPose(s), up = solLift(s);     // a jump lifts him off the ground
  if (s.stance === 2) { hpart('sol_' + legFrame(s), s.x, s.y, s.a, { min: up }); hpart(body, s.x, s.y, s.a, { min: up }); }
  else hpart(body, s.x, s.y, s.a, { min: up, add: solAdd(s) });     // standing: his legs under him, solid
}
function wreckParts(w) {
  if (w.type === 'tank') { const tx = w.x - 4 * Math.cos(w.a), ty = w.y - 4 * Math.sin(w.a); hpart('hull5', w.x, w.y, w.a, { keep: 1 }); hpart('tur_dead', tx, ty, w.ta); }
  else { if (w.bx !== undefined) hpart(w.bf ? 'jeep_flat' : 'jeep_wheel', w.bx, w.by, w.ba); hpart('jeep4', w.x, w.y, w.a); }
}
function vehParts(v) {
  const [mx, my] = mgPos(v), mg = v.mgFlash > 0 ? 'mg_f' : 'mg', crew = (i, min, add) => { const s = v.seats[i]; if (s) hpart('sol_sit', s.x, s.y, s.a, { min, add, who: s }); };
  const mount = { rx: mx - Math.cos(v.mgA) * 4, ry: my - Math.sin(v.mgA) * 4 };     // mgPos is 4 px out from the mount
  if (v.type === 'nest') { hpart(mg, mx, my, v.mgA, { ...mount, min: SUNB.mgNest }); crew(0); return; }
  if (v.type === 'tank') {
    const [px, py] = turretPivot(v), kick = clamp(v.recoil, 0, 1) * 33;
    hpart('hull' + hullFrame(v), v.x, v.y, v.a, { keep: 1 }); crew(2); crew(3);
    hpart('tur_gun', px - Math.cos(v.ta) * kick, py - Math.sin(v.ta) * kick, v.ta, { rx: px, ry: py }); hpart('tur', px, py, v.ta, { keep: 1 });     // the gun rests on the hull under the turret
    hpart(mg, mx, my, v.mgA, mount); crew(1);
  } else {
    const c = Math.cos(v.a), s = Math.sin(v.a), [wx, wy] = EXTRA.jeepWells[0], st = jeepSteer(v), f = v.hp / v.T.hp;
    for (const sd of [-1, 1]) hpart('jeep_tire', v.x + c * wx - s * wy * sd, v.y + s * wx + c * wy * sd, v.a + st);
    hpart('jeep' + (f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3), v.x, v.y, v.a, { keep: 1 }); crew(0); crew(1);
    hpart(mg, mx, my, v.mgA, mount); crew(2, 0, SUNB.stand);     // the MG on its post; the gunner stands in the bed
  }
}
const hParts = o => { for (const q of partsOf(o)) hspr(q.n, q.x, q.y, q.a, q.b, q.add); };
/* a shape's [top, bottom]: SUNH height h (+ add) standing on its lift */
const shp = (h, n) => { const P = sunP(n), b = P.lift || 0; return [h + b + (P.add || 0), b]; };
/* everything solid, as heights (the same things, and the same hidden ones left out, as the frame draws) */
function sunHeights(vis, hidden, vw) {
  const [wt, wb] = shp(SUNH.wall, 'wall');
  for (const b of MAP.buildings) if (!b.glass && vis(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) hbox(HL.w, b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 1, wt, wb, 0);
  const [t0, tb] = shp(SUNH.tree[0], 'tree'), t1 = shp(SUNH.tree[1], 'tree')[0], [h0, hb] = shp(SUNH.hay, 'hay'), [ft, fb] = shp(SUNH.fence, 'fence');
  for (const s of MAP.statics) {
    if (!s.alive || !vis(s.x, s.y, 40)) continue;
    if (s.type === 'tree') { const r = (s.pine ? SPR.pines : SPR.trees)[s.v].width / 2 * s.sc * 0.85; hbox(HL.t, s.x, s.y, r, r, 0, 2, t0, t1, tb); }
    else if (s.type === 'hay') hbox(HL.a, s.x, s.y, 13, 13, 0, 2, h0, h0 - SUNH.hay * 0.4, hb);
    else if (s.type === 'fence') hbox(HL.a, s.x, s.y, 7, 1.5, s.a, 1, ft, fb, 0);
  }
  for (const f of M.flags) if (vis(f.x, f.y, 30)) hbox(HL.u, f.x, f.y, 1, 1, 0, 1, SUNH.flag, 0, 0);
  for (const it of M.items) if ((it.k === 'med' || it.k === 'ammo') && vis(it.x, it.y, 8)) hbox(HL.u, it.x, it.y, 6, 5, 0, 1, SUNH.item, 0, 0);
  for (const p of M.proj) if (p.k === 'nade' && vis(p.x, p.y, 8)) hbox(HL.u, p.x, nadeY(p), 3, 3, 0, 2, p.h + 3, p.h + 3, p.h);
  const [ct, cb] = shp(SUNH.crate, 'crate'); for (const c of M.crates) if (c.live && vis(c.x, c.y, 14)) hbox(HL.u, c.x, c.y, 8, 8, c.a, 1, ct, cb, 0);
  for (const A of MAP.arcs) { if (!vis(A.x, A.y, 50)) continue; const f = A.lost / A.bags.length; hpart(f < 0.25 ? 'bagarc0' : f < 0.75 ? 'bagarc1' : 'bagarc2', A.x, A.y, A.a); }
  for (const w of M.wrecks) if (vis(w.x, w.y, 70) && w.t >= 1) hParts(w);
  const TL = MAP.tiled;
  if (TL && TL.roof) for (let j = 0; j < TL.sr; j++) for (let i = 0; i < TL.sc; i++) {     // the roof, a run of cells a quad
    if (TL.roof[j * TL.sc + i] !== 1) continue; let e = i; while (e + 1 < TL.sc && TL.roof[j * TL.sc + e + 1] === 1) e++;
    const x0 = i * SUB, x1 = (e + 1) * SUB, y = (j + 0.5) * SUB; i = e;
    if (vis((x0 + x1) / 2, y, (x1 - x0) / 2 + SUB)) { hbox(HL.t, (x0 + x1) / 2, y, (x1 - x0) / 2, SUB / 2, 0, 1, 0, 64, 1, 0); HMAX = Math.max(HMAX, ROOF_Z[1]); }
  }
  HLA = HL.u; for (const s of M.sol) if (s.alive && !s.veh && !s.swim && vis(s.x, s.y, 30) && !hidden(s) && sightNear(vw, s)) hParts(s);     // what's out of sight, its shadow too: left out
  const nt = shp(SUNH.nest, 'nest')[0];
  for (const v of M.vehicles) {
    if (!v.active || !vis(v.x, v.y, 80) || !sightNear(vw, v)) continue;
    if (v.type === 'nest') hbox(HL.u, v.x, v.y, 22, 22, v.a, 3, nt, 14 / 22, 1.35);     // the bags: an arc 8 wide round 18
    hParts(v);
  }
  HLA = HL.a;
  const mat = (L, refl, wave, z) => { for (const w of L) if (vis(w.x + w.w / 2, w.y + w.h / 2, Math.max(w.w, w.h))) { hbox(HL.m, w.x + w.w / 2, w.y + w.h / 2, w.w / 2, w.h / 2, 0, 5, refl, wave, 0, z); if (refl) HMAT |= 1; } };
  mat(MAP.water, 0.75, 1, 0.2); mat(MAP.ice || [], 0.45, 0, 0.2); mat(MAP.bridges, 0, 0, 0.4);     // water mirrors the sky and ripples; ice, stiller
  for (const s of M.sol) if (s.alive && s.swim && vis(s.x, s.y, 12)) hbox(HL.m, s.x, s.y, 9, 9, 0, 5, 0, 0, 2, 0.6);     // a swimmer isn't water
}
/* the quads (uploaded once, one buffer per list) into the height texture HT (box cleared, then a MAX, w over, t MAX)
   and the materials MT (depth: the highest top wins) */
function sunDrawHeights(S, X, box, fog) {
  const { gl, IA, MX } = S, lists = ['a', 'u', 'w', 't', 'm'];
  gl.useProgram(S.HP); gl.uniform3f(S.HU.X, ...X); gl.uniform2f(S.HU.F, S.fw, S.fh);
  gl.bindBuffer(gl.ARRAY_BUFFER, S.quad); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);
  for (let i = 1; i <= 4; i++) { gl.enableVertexAttribArray(i); IA.vertexAttribDivisorANGLE(i, 1); }
  for (const n of lists) if (HL[n].n) { gl.bindBuffer(gl.ARRAY_BUFFER, S.ib[n]); gl.bufferData(gl.ARRAY_BUFFER, HL[n].f.subarray(0, HL[n].n * 16), gl.STREAM_DRAW); }
  const draw = n => { const L = HL[n]; if (!L.n) return; gl.bindBuffer(gl.ARRAY_BUFFER, S.ib[n]); for (let i = 1; i <= 4; i++) gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 64, (i - 1) * 16); IA.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, L.n); };
  gl.viewport(0, 0, S.fw, S.fh); gl.scissor(...box); gl.clearColor(0, 0, 0, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.FB); gl.clear(gl.COLOR_BUFFER_BIT); gl.uniform1f(S.HU.MM, 0);
  gl.blendEquation(MX.MAX_EXT); gl.enable(gl.BLEND); draw('a'); pipe('gpu-h', { l: 'a' }); draw('u'); pipe('gpu-h', { l: 'u' }); gl.disable(gl.BLEND); draw('w'); pipe('gpu-h', { l: 'w' }); gl.enable(gl.BLEND); draw('t'); gl.disable(gl.BLEND); pipe('gpu-h', { l: 't' });
  if (fog) { gl.bindFramebuffer(gl.FRAMEBUFFER, S.FBS); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.BLEND); draw('a'); gl.disable(gl.BLEND); draw('w'); gl.enable(gl.BLEND); draw('t'); gl.disable(gl.BLEND); pipe('gpu-hs'); }     // the remembered things alone
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.FM); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.uniform1f(S.HU.MM, 1);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); for (const n of lists) draw(n); gl.disable(gl.DEPTH_TEST); pipe('gpu-mat');
  for (let i = 1; i <= 4; i++) { IA.vertexAttribDivisorANGLE(i, 0); gl.disableVertexAttribArray(i); }
  if (M.dev) DEV.nq = lists.reduce((a, n) => a + HL[n].n, 0);
  for (const n of lists) HL[n].n = 0;
}
/* the sweep's passes (box: the height buffer's) from the heights on unit hu into the pair T (framebuffers FS), the last
   left on unit u for the light: enough doublings to reach the tallest thing's shadow (mxh / DH px; DH: how much lower a
   blocker reads per buffer px it's sunward) */
function sunSweep(S, K, mxh, box, reg, T, FS, u, hu) {
  const { gl, SU } = S, DH = Math.tan(SUN.el) / K, len = mxh / DH;
  gl.useProgram(S.SP); gl.uniform2f(SU.S, S.fw, S.fh); gl.uniform4f(SU.R, ...reg); gl.uniform2f(SU.D, Math.cos(SUN.az), Math.sin(SUN.az)); gl.uniform1f(SU.DH, DH); gl.uniform1i(SU.H, hu); gl.uniform1i(SU.B, u);
  gl.bindBuffer(gl.ARRAY_BUFFER, S.tri); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.viewport(0, 0, S.fw, S.fh); gl.scissor(...box); gl.activeTexture(gl.TEXTURE0 + u);
  let i = 0; gl.bindTexture(gl.TEXTURE_2D, T[1]); gl.bindFramebuffer(gl.FRAMEBUFFER, FS[0]); gl.uniform1f(SU.N, 0); gl.drawArrays(gl.TRIANGLES, 0, 3); pipe('gpu-sweep', { fb: FS[0], n: 0, st: u === 6 });
  for (let n = 1; n < len; n *= 2, i ^= 1) { gl.bindTexture(gl.TEXTURE_2D, T[i]); gl.bindFramebuffer(gl.FRAMEBUFFER, FS[i ^ 1]); gl.uniform1f(SU.N, n); gl.drawArrays(gl.TRIANGLES, 0, 3); pipe('gpu-sweep', { fb: FS[i ^ 1], n, st: u === 6 }); }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindTexture(gl.TEXTURE_2D, T[i]); gl.activeTexture(gl.TEXTURE0);
}
function drawSun(vw, vis, hidden, fogged) {     // fogged: vision on (the memory's light too, map 3)
  const S = _sun, { gl, GC, U, CU } = S, w = Math.ceil(cv.width * HS), h = Math.ceil(cv.height * HS), dpr = DPR, K = VZ * dpr * HS, k = dpr * HS;
  if (GC.width !== w * 2 || GC.height !== h * 2) { GC.width = w * 2; GC.height = h * 2; }     // the maps 2 × 2 (4 in a row outgrew phone GPUs' 8192 px)
  const rx = Math.floor(vw.x * dpr * HS), ry = Math.floor(vw.y * dpr * HS), rw = Math.min(w - rx, Math.ceil(vw.w * dpr * HS)), rh = Math.min(h - ry, Math.ceil(vw.h * dpr * HS));
  // the height buffer reaches past the view toward the sun by the longest shadow (64 px tall), so what's off screen
  // that side still throws its shadow in (no pop-in); the view sits at (px, py) in it
  const L = 64 / Math.tan(SUN.el), dx = Math.cos(SUN.az) * L * K, dy = Math.sin(SUN.az) * L * K;
  const px = Math.ceil(Math.max(0, -dx)) + 2, py = Math.ceil(Math.max(0, -dy)) + 2, bw = rw + px + Math.ceil(Math.max(0, dx)) + 2, bh = rh + py + Math.ceil(Math.max(0, dy)) + 2;
  const size = (t, w, h) => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); };
  const attach = (f, t) => { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); };
  if (S.fw < rx + bw || S.fh < ry + bh) {     // the height and material targets grow only
    S.fw = Math.max(S.fw, rx + bw + 32); S.fh = Math.max(S.fh, ry + bh + 32);
    gl.activeTexture(gl.TEXTURE2); size(S.MT, S.fw, S.fh); gl.activeTexture(gl.TEXTURE4); for (const t of S.ST) size(t, S.fw, S.fh);
    gl.activeTexture(gl.TEXTURE6); for (const t of S.SS) size(t, S.fw, S.fh); gl.activeTexture(gl.TEXTURE7); size(S.HTS, S.fw, S.fh); gl.activeTexture(gl.TEXTURE0); size(S.HT, S.fw, S.fh);
    S.ST.forEach((t, i) => attach(S.FS[i], t)); S.SS.forEach((t, i) => attach(S.FSS[i], t)); attach(S.FBS, S.HTS);
    gl.bindRenderbuffer(gl.RENDERBUFFER, S.DB); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, S.fw, S.fh);
    attach(S.FB, S.HT); attach(S.FM, S.MT); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, S.DB);
  }
  S.pr = { rx, ry, rw, rh, px, py, w, h };     // the view's place in the buffers (pipeline viewer)
  if (S.lw !== w || S.lh !== h) { S.lw = w; S.lh = h; gl.activeTexture(gl.TEXTURE3); size(S.LT, w, h); gl.activeTexture(gl.TEXTURE0); attach(S.FL, S.LT); }
  // heights and materials (buffer px = (world x VZ + VOX) x k + pad)
  gl.enable(gl.SCISSOR_TEST); HMAT = 0; HMAX = 0;
  const fog = vw._fog && fogged && !SUNDBG ? 1 : 0;
  gl.useProgram(S.P); gl.uniform1f(S.U.FG, 0); gl.useProgram(S.CP); gl.uniform1f(S.CU.FG, 0);
  sunHeights((x, y, r) => vis(x, y, r + L), hidden, vw); pipe('cpu-heights', { n: { a: HL.a.n, u: HL.u.n, w: HL.w.n, t: HL.t.n, m: HL.m.n } });
  sunDrawHeights(S, [VZ * k, VOX * k + px, VOY * k + py], [rx, ry, bw, bh], fog);
  const reg = [rx + 0.5, ry + 0.5, rx + bw - 0.5, ry + bh - 0.5], mxh = Math.min(64, HMAX + 1);
  sunSweep(S, K, mxh, [rx, ry, bw, bh], reg, S.ST, S.FS, 4, 0);
  if (fog) sunSweep(S, K, mxh, [rx, ry, bw, bh], reg, S.SS, S.FSS, 6, 7);     // the remembered things' shadows, for out of sight
  // the light, once (into LT)
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.FL); gl.viewport(0, 0, w, h); gl.scissor(rx, h - ry - rh, rw, rh);
  gl.useProgram(S.P); gl.bindBuffer(gl.ARRAY_BUFFER, S.tri); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const ce = Math.cos(SUN.el), Ld = [Math.cos(SUN.az) * ce, Math.sin(SUN.az) * ce, Math.sin(SUN.el)];
  gl.uniform2f(U.S, S.fw, S.fh); gl.uniform2f(U.P, px, py); gl.uniform1f(U.V, h); gl.uniform4f(U.R, ...reg); gl.uniform1f(U.K, K);
  gl.uniform3f(U.L, ...Ld); gl.uniform1f(U.HZ, M.rain ? 0.15 : 0);
  S.pk.fill(0); const LN = lightsNow(vis); if (!devOff('add')) LN.forEach((l, i) => { S.pl.set([(VZ * l.x + VOX) * k + px, (VZ * l.y + VOY) * k + py, l.r, l.h], i * 4); S.pk[i] = l.k; });
  gl.uniform4fv(U.PL, S.pl); gl.uniform1fv(U.PK, S.pk);
  const light = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, S.FL); gl.viewport(0, 0, w, h); gl.scissor(rx, h - ry - rh, rw, rh); gl.useProgram(S.P); gl.bindBuffer(gl.ARRAY_BUFFER, S.tri); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindFramebuffer(gl.FRAMEBUFFER, null); };
  light(); pipe('gpu-light', { n: LN.length });
  // the maps
  gl.useProgram(S.CP);
  gl.uniform2f(CU.S, S.fw, S.fh); gl.uniform2f(CU.P, px, py); gl.uniform1f(CU.V, h); gl.uniform4f(CU.R, ...reg); gl.uniform1f(CU.K, K); gl.uniform2f(CU.G, w, h);
  gl.uniform3f(CU.L, ...Ld); gl.uniform3f(CU.C, ...SUN.tint); gl.uniform3f(CU.W, ...SUN.warm); gl.uniform3f(CU.SKY, ...(M.rain ? SUN.skyRain : SUN.sky));
  gl.uniform1f(CU.TM, M.time); gl.uniform1f(CU.BL, HMAT & 2 ? 0.9 : 0); gl.uniform3f(CU.WX, VOX * k + px, VOY * k + py, VZ * k);
  const E = MAP.tiled && MAP.tiled.roof ? viewSols(vw).map(posOf).slice(0, 4) : []; S.ev.fill(0); E.forEach((o, i) => { S.ev[i * 2] = o.x; S.ev[i * 2 + 1] = o.y; }); gl.uniform4fv(CU.E, S.ev); gl.uniform1f(CU.EN, E.length); gl.uniform1f(CU.RF, vw.rf || 0);
  const add = S.pk[0] > 0 || HMAT || M.rain, maps = SUNDBG ? [[3, 0, 1, 2, 4, 5, 6][SUNDBG - 1]] : add ? [0, 1, 2] : [0, 1];
  const at = n => [(n & 1) * w + rx, (n >> 1) * h + ry];     // map n's view in GC (canvas pixels): 0 1 / 2 3
  const map = (q, n) => { const o = (n & 1) * w, oy = (1 - (n >> 1)) * h; gl.viewport(o, oy, w, h); gl.scissor(o + rx, oy + h - ry - rh, rw, rh); gl.uniform2f(CU.O, o, oy); gl.uniform1f(CU.Q, q); gl.drawArrays(gl.TRIANGLES, 0, 3); pipe('gpu-map', { q, o }); };
  maps.forEach((q, n) => map(q, n));
  if (fog) {     // the memory's light (what it keeps, no point lights) and its shade, map 3: kept where you see it (fogOverlay)
    gl.useProgram(S.P); gl.uniform1f(U.FG, 1); light();
    gl.useProgram(S.CP); gl.uniform1f(CU.FG, 1); map(0, 3);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
  const to = [vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR];
  if (SUNDBG) ctx.drawImage(GC, ...at(0), rw, rh, ...to);       // dev: 1 heights, 2 shade, 3 highlights, 4 glow, 5 materials, 6 sun shadow, 7 point lights
  else { ctx.globalCompositeOperation = 'multiply'; if (!devOff('shade')) ctx.drawImage(GC, ...at(0), rw, rh, ...to); pipe('comp', { m: 'multiply' }); ctx.globalCompositeOperation = 'color-dodge'; if (!devOff('hi')) ctx.drawImage(GC, ...at(1), rw, rh, ...to); pipe('comp', { m: 'color-dodge' }); if (add && !devOff('add')) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(GC, ...at(2), rw, rh, ...to); pipe('comp', { m: 'lighter' }); } }
  ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false; worldT();
  S.fog = fog && !devOff('shade') ? [...at(3), rw, rh, ...to] : null;     // the memory's shade map (fogOverlay)
  if (M.dev && DEV.stats) { const e = gl.getError(); if (e) devLog('GL ERROR ' + e, '#ff5a45'); S.dg = `GC ${GC.width}×${GC.height} BUF ${gl.drawingBufferWidth}×${gl.drawingBufferHeight} · MAPS ${maps.join('')} · ADD ${add ? 1 : 0}`; }
}
