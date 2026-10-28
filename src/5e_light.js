/* ---------------- point lights with height-aware shadows ----------------
   A light sits h px above the ground. Around it everything has a height (walls and tree trunks: unlimited; vehicles,
   wrecks, sandbags, hay: their own), rasterised into a patch of LC px cells. Rays from the light keep the lowest
   (h - height) / distance of what they've passed: a cell at distance D, itself hc high, is lit while that stays >= (h - hc) / D.
   So something lower than the light throws a shadow that ends (a jeep beside an MG flash), a wall's runs to the edge.
   The patch is drawn smoothed (soft shadow edges) and brightens what's under it: dodged, then a little added.
   With the sun on, the sun's shader does them instead, from its height buffer (per pixel, slopes facing a light lit more) */
const LC = 4, LMAX = 10, LIGHTS = [], LFX = [], LSC = 4;     // LSC: every light's reach x this (a flash lights up a room)
const LAMP = { r: 85, k: 0.95, cone: 0.36, post: 8 };     // a flashlight: reach (before LSC), strength, half-angle (rad); post: a tank spotlight over its turret top
const LH = { tank: 30, jeep: 20, nest: 12, bag: 12, hay: 16, tree: 255 };                 // how tall things are
/* a light this frame (skip: the thing it comes from, which mustn't shade it; d: a spot's [cos, sin, cos of its half-angle],
   none for all round); lightFx: one that fades over T s */
function light(x, y, r, h, k, skip, d, c) { LIGHTS.push({ x, y, r: r * LSC, h, k, skip, d, c }); }     // c: its colour (none: LCOL, warm white)
const LCOL = [1, 0.96, 0.86];
/* a vehicle's tail lights (its lights on): two dim red point lights, 3 px over its hull's floor (the hull part's base), 3 px
   behind its art: a jeep's either side of the spare tire (TAIL.jeep: art px), a tank's at its back corners */
const TAIL = { r: 14, k: 0.35, c: [1, 0.1, 0.05], jeep: [[3.5, 10], [3.5, 32]], brake: 1.8, dec: 20 };     // brake: how much brighter slowing / reversing; dec: the slowing (px/s²) that counts
/* how hard a vehicle's tail lights are lit up (0..1): on while it slows (by more than TAIL.dec) or backs up, fading in a
   quarter second after; from its speed alone, so a joiner's screen shows it too */
function brakeK(v) {
  const t = M.time, sp = Math.abs(v.spd); if (v._bt === undefined) { v._bt = t; v._bs = sp; } const dt = t - v._bt; if (dt <= 0) return v._bk || 0;
  const slow = (v._bs - sp) / dt > TAIL.dec || v.spd < -3; v._bt = t; v._bs = sp;
  return v._bk = slow ? 1 : Math.max(0, (v._bk || 0) - dt * 4);
}
function tailLights(v, f) {
  const q = partsOf(v).find(q => /^(jeep|hull)\d/.test(q.n)); if (!q) return;
  const m = ATLAS[q.n], c = Math.cos(v.a), s = Math.sin(v.a), P = v.type === 'jeep' ? TAIL.jeep : [[-3, 6], [-3, m[3] - 6]];
  for (const [ax, ay] of P) { const lx = ax - m[4], ly = ay - m[5]; f(v.x + c * lx - s * ly, v.y + s * lx + c * ly, q.b + 3); }
}
const spotK = (d, ux, uy) => !d ? 1 : clamp((ux * d[0] + uy * d[1] - d[2]) / ((1 - d[2]) * 0.35), 0, 1);     // in the cone: 1, a soft rim
const lampD = (a, fix) => [Math.cos(a), Math.sin(a), Math.cos(fix ? fix.cone : LAMP.cone)];
/* every beam that's on, as f(x, y, h, a, o, fix): flashlights, and vehicles' lights (a jeep's two headlights, a tank's
   spotlight on top of its turret's side: the flashlight's beam, all of them); o keeps the beam's pool (lampPool); fix: a
   mounted lamp's fixed beam (FIXED: its tilt down and half-angle, rad; it doesn't dip at what's in front). The tank's is
   narrower and flatter: its lower edge just catches the front of the hull */
const FIXED = { jeep: { tilt: 0.42, cone: LAMP.cone }, tank: { tilt: 0.3, cone: 0.28 } };
function lampsOn(f) {
  for (const s of M.sol) if (s.alive && s.lamp && !s.veh) { const [x, y] = gunTip(s); f(x, y, gunH(s), s.a, s); }
  for (const v of M.vehicles) {
    if (!v.lights || !v.active || v.dead || v.type === 'nest') continue; const P = v._lp = v._lp || [{ v }, { v }];
    if (v.type === 'tank') { const m = ATLAS.tur, [px, py] = turretPivot(v), c = Math.cos(v.ta), s = Math.sin(v.ta), sd = m[3] - m[5] + 2; f(px + c * 4 - s * sd, py + s * 4 + c * sd, topOf(v) + LAMP.post, v.ta, P[0], FIXED.tank); continue; }
    const m = ATLAS.jeep0, c = Math.cos(v.a), s = Math.sin(v.a), fx = m[2] - m[4] + 1, h = Math.round(artMax('jeep0') * 0.55);
    for (const i of [0, 1]) { const sd = (i ? 1 : -1) * (m[3] / 2 - 5); f(v.x + c * fx - s * sd, v.y + s * fx + c * sd, h, v.a, P[i], FIXED.jeep); }
  }
}
/* a beam (flashlight, headlight, spotlight) is a round cone in 3D. A flashlight's tilts down so its top edge meets the
   ground POOL.max out in the open, and against what the aim first meets (aimRay, as guns aim: walls, trees, hay, bags,
   vehicles; eased) further down, so the oval it lights is centred there (midTilt); a vehicle's keeps its fixed tilt. The cone
   meets the ground in an oval, longer the lower the lamp (prone: grazing). Every beam splashes back (SPLASH): a dim point
   light just in front of what it shines on, dimmer the further off, so a jeep nosed up to a wall is lit by its own
   headlights. o keeps the eased pool and splash; returns the shader's spot w: 1 + the tilt of the beam's middle (height drop per px) */
const POOL = { min: 12, max: 260, ease: 10 }, SPLASH = { r: 30, k: 0.45, back: 13 }, SPOT_FAR = 0.5;     // SPOT_FAR: a beam's far side this much wider (its oval fans out)
function midTilt(h, D, c) {     // the tilt whose ground oval's middle is D px out (a lamp h up, half-angle c)
  let lo = c + 0.001, hi = Math.PI / 2;
  for (let i = 0; i < 14; i++) { const t = (lo + hi) / 2, m = h / 2 * (1 / Math.tan(t - c) + 1 / Math.tan(t + c)); if (m > D) lo = t; else hi = t; }
  return (lo + hi) / 2;
}
function lampPool(o, a, gx, gy, h, fix) {
  const R = LAMP.r * LSC, r = aimRay(gx, gy, a, R, o.v, true), dt = Math.min(0.1, M.time - (o.poolT || 0)), e = 1 - Math.exp(-dt * POOL.ease); o.poolT = M.time;
  o.sd = o.sd === undefined ? (r ? r.d : R) : o.sd + ((r ? r.d : o.sd) - o.sd) * e; o.sk = (o.sk || 0) + ((r ? 1 : 0) - (o.sk || 0)) * e; o.top = r ? r.top : o.top;
  const c = fix ? fix.cone : LAMP.cone, H = Math.max(h, 1);
  let tilt = fix ? fix.tilt : 0;
  if (!fix) { const D = Math.max(POOL.min, r && r.d < POOL.max ? r.d : POOL.max); o.poolD = o.poolD === undefined ? D : o.poolD + (D - o.poolD) * e; tilt = Math.max(Math.atan(H / POOL.max) + c, midTilt(H, o.poolD, c)); }
  if (o.sk > 0.02) {     // the splash: back off the surface toward the lamp, at the beam's height there (on what it hits)
    const d = Math.max(0, o.sd - SPLASH.back), z = clamp(h - Math.tan(tilt) * o.sd, 1, Math.min(h, (o.top || 99) - 1));
    light(gx + Math.cos(a) * d, gy + Math.sin(a) * d, SPLASH.r, z, LAMP.k * SPLASH.k * o.sk * Math.pow(Math.max(0, 1 - o.sd / R), 1.5));
  }
  return 1 + Math.tan(tilt);
}
/* how lit (0 dark .. 1) a spot is, for bots' eyes: the daylight, then the same lights the renderer draws from the world's
   state (blasts, fires, muzzle flashes, flashlights in whose cone and sight it is) */
function litAt(x, y) {
  let L = sunTone().day; if (L >= 1) return 1;
  const add = (k, r, ox, oy) => { const d = Math.hypot(x - ox, y - oy); if (d < r) L += k * (1 - d / r) * 1.6; };
  for (const f of LFX) { const u = (M.time - f.t0) / f.T; if (u >= 0 && u < 1) add((1 - u) ** 2, f.r * LSC, f.x, f.y); }
  for (const w of M.wrecks) if (w.burn > 0) add(0.4, 110 * LSC, w.x, w.y);
  for (const v of M.vehicles) if (v.active && !v.dead && v.type !== 'nest' && v.hp < v.T.hp * 0.25) add(0.3, 100 * LSC, v.x, v.y);
  for (const s of M.sol) {
    if (!s.alive) continue;
    if (s.firedT > 0) add(0.7, 100 * LSC, s.x, s.y);
    if (L >= 1) return 1;
  }
  lampsOn((lx, ly, h, a, o, fix) => { const dx = x - lx, dy = y - ly, d = Math.hypot(dx, dy) || 1, k = spotK(lampD(a, fix), dx / d, dy / d); if (d < LAMP.r * LSC && k > 0 && sees(lx, ly, x, y)) add(LAMP.k * k, LAMP.r * LSC, lx, ly); });
  return Math.min(1, L);
}
const DAY_DIM = 0.1;     // lights at noon (the highest sun) give this share of their night brightness
function dayDim() { return 1 - (1 - DAY_DIM) * clamp(Math.sin(SUN.el) / Math.sin(75 * Math.PI / 180), 0, 1); }
function lightFx(x, y, r, h, T) { LFX.push({ x, y, r, h, t0: M.time, T }); }
function lightsNow(vis) {          // this frame's strongest lights in view (and the queue emptied)
  for (let i = LFX.length - 1; i >= 0; i--) { const f = LFX[i], u = (M.time - f.t0) / f.T; if (u >= 1 || u < 0) LFX.splice(i, 1); else light(f.x, f.y, f.r, f.h, (1 - u) ** 2); }
  for (const w of M.wrecks) if (w.burn > 0) light(w.x, w.y, 110, topOf(w) + 6, 0.4 + 0.15 * Math.sin(M.time * 23 + w.x) * Math.sin(M.time * 9.7), w);   // still burning
  lampsOn((x, y, h, a, o, fix) => light(x, y, LAMP.r, h, LAMP.k, null, [...lampD(a, fix), lampPool(o, a, x, y, h, fix)]));     // flashlights, headlights (from the state: one out of sight still throws its beam in)
  for (const v of M.vehicles) if (v.lights && v.active && !v.dead && v.type !== 'nest') { const b = brakeK(v); tailLights(v, (x, y, h) => light(x, y, TAIL.r * (1 + 0.4 * b), h, TAIL.k * (1 + TAIL.brake * b), v, null, TAIL.c)); }
  const dk = dayDim(); if (dk < 1) for (const l of LIGHTS) l.k *= dk;
  const L = LIGHTS.filter(l => l.k > 0.02 && vis(l.x, l.y, l.r)).sort((a, b) => b.k * b.r - a.k * a.r).slice(0, LMAX); LIGHTS.length = 0; if (M.dev) DEV.lp = L;
  return L;
}
/* a point light's colour at (x, y, z) in the open air (as the light pass has it on flat ground: its falloff, a spotlight's
   3D cone; walls block it): what a smoke puff there takes */
function lightAir(L, x, y, z) {
  let r = 0, g = 0, b = 0;
  for (const l of L) {
    const vx = l.x - x, vy = l.y - y, dl = Math.hypot(vx, vy); if (dl >= l.r || l.k <= 0) continue;
    let cn = 1; const d = l.d;
    if (d && d.length > 3 && d[3] > 1) {
      const lh = l.h - z, n = (x, y, z) => { const m = Math.hypot(x, y, z) || 1; return [x / m, y / m, z / m]; }, dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
      const a = n(d[0], d[1], 1 - d[3]), R = n(-vx, -vy, -lh), sd = [-d[1], d[0], 0], up = [a[1] * sd[2] - a[2] * sd[1], a[2] * sd[0] - a[0] * sd[2], a[0] * sd[1] - a[1] * sd[0]];
      const c = Math.acos(d[2]), dv = Math.asin(clamp(dot(R, up), -1, 1)) / c, dh = Math.asin(clamp(dot(R, sd), -1, 1)) / (c * (1 + SPOT_FAR * clamp(dv, 0, 1)));
      cn = dot(R, a) > 0 ? clamp((1 - Math.hypot(dh, dv)) / 0.25, 0, 1) : 0; if (cn <= 0) continue;
    }
    if (sightBlocked(l.x, l.y, x, y)) continue;
    const f = l.k * cn * (0.5 * Math.pow(1 - dl / l.r, 1.3) + 0.5 * Math.max(0, 1 - dl / 40) ** 2), C = l.c || LCOL;
    r += C[0] * f; g += C[1] * f; b += C[2] * f;
  }
  return [r, g, b];
}
function drawLights(vis) { for (const l of lightsNow(vis)) drawLight(l); }
let _lhp = new Uint8Array(0), _lq = new Float32Array(0), _lc = null, _lg = null;
const _lid = new Map();
function drawLight(l) {
  const lc = Math.max(LC, l.r / 24);     // cells grow with the reach (24 a side at most): a big light costs a small one
  const n = Math.ceil(l.r / lc), S = n * 2, X0 = l.x - n * lc, Y0 = l.y - n * lc;
  if (_lhp.length < S * S) _lhp = new Uint8Array(S * S);
  const hp = _lhp; hp.fill(0, 0, S * S);
  // the height patch: cells whose centre is in the box (and passes test) get at least h
  const put = (x0, y0, x1, y1, h, test) => {
    const i0 = Math.max(0, Math.floor((x0 - X0) / lc)), i1 = Math.min(S - 1, Math.floor((x1 - X0) / lc)), j0 = Math.max(0, Math.floor((y0 - Y0) / lc)), j1 = Math.min(S - 1, Math.floor((y1 - Y0) / lc));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * S + i; if (hp[k] < h && (!test || test(X0 + (i + 0.5) * lc, Y0 + (j + 0.5) * lc))) hp[k] = h; }
  };
  const hull = (o, hl, hw, h) => { const R = Math.hypot(hl, hw); put(o.x - R, o.y - R, o.x + R, o.y + R, h, (x, y) => { const [lx, ly] = toLocal(o, x, y); return Math.abs(lx) < hl && Math.abs(ly) < hw; }); };
  const near = o => Math.abs(o.x - l.x) < l.r + 60 && Math.abs(o.y - l.y) < l.r + 60;
  for (const b of rectsIn(MAP.buildings, X0, Y0, X0 + S * lc, Y0 + S * lc, _rb)) if (!b.glass) put(b.x, b.y, b.x + b.w, b.y + b.h, 255);   // glass lets light through
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
      const d = (k + 0.5) * lc; q[r * n + k] = m;
      const hh = hp[Math.floor(n + uy * d / lc) * S + Math.floor(n + ux * d / lc)];
      if (hh) { const v = hh >= l.h ? -1 : (l.h - hh) / d; if (v < m) m = v; }
    }
  }
  // each cell: lit if nothing before it on its ray reaches above the line from the light down to it (walls stay dark)
  if (!_lc || _lc.width < S) { _lc = mk(Math.max(S, 128), Math.max(S, 128)); _lg = _lc.getContext('2d'); }
  let id = _lid.get(S); if (!id) { id = _lg.createImageData(S, S); _lid.set(S, id); }
  const px = id.data, C = l.c || LCOL;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const dx = (i + 0.5 - n) * lc, dy = (j + 0.5 - n) * lc, D = Math.hypot(dx, dy), o = (j * S + i) * 4, hc = hp[j * S + i]; let f = 0;
    if (D < l.r && hc < 255) { const r = (Math.round(Math.atan2(dy, dx) / TAU * N) + N) % N, k = Math.min(n - 1, Math.floor(D / lc)); if (q[r * n + k] >= (l.h - hc) / D) f = (0.5 * (1 - D / l.r) ** 1.3 + 0.5 * Math.max(0, 1 - D / 40) ** 2) * spotK(l.d, dx / D, dy / D); }     // a hot core and a wide spill (where the shadows show)
    px[o] = C[0] * 255; px[o + 1] = C[1] * 255; px[o + 2] = C[2] * 255; px[o + 3] = f * 255;
  }
  _lg.putImageData(id, 0, 0);
  worldT(); ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'color-dodge'; ctx.globalAlpha = 0.6 * l.k; ctx.drawImage(_lc, 0, 0, S, S, X0, Y0, S * lc, S * lc);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.2 * l.k; ctx.drawImage(_lc, 0, 0, S, S, X0, Y0, S * lc, S * lc);
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
   on, the light runs twice: the frame's (HT), and the memory's (FG: HTS, no point lights) into a fourth map, laid over
   what's out of sight (fogOverlay). HTS is read from the memory's heights (memOf: as last seen), so that light is now's */
const ROOF_Z = [36, 42];     // a tiled house's roof: a slab this high (px), over the walls' tops
const SUN_MIN = Math.PI / 36, sunEl = () => Math.max(SUN.el, SUN_MIN);     // shadows: never longer than at 5° (from 6° down the sun fades out: sunTone)
const SUN = { az: -2.36, el: 0.7, tint: [0.46, 0.5, 0.64], warm: [1, 0.93, 0.8], sky: [0.56, 0.7, 0.9], skyRain: [0.5, 0.53, 0.58] };     // az: toward the sun (up-left); el: its height; sky: what reflective things mirror
/* the light's colours from the sun's height: day as set; low sun golden (and its shade bluer, purpler); below the horizon
   it all goes to the night's dim blue (sunlit = shade: no sun shadows), so only point lights light things. day: 0 night .. 1 */
const NIGHT = [0.24, 0.27, 0.42], GOLD = [1, 0.8, 0.62], DUSK = [0.42, 0.38, 0.58];
let _tone = null, _toneK = '';
function sunTone() {
  const key = SUN.el + (M && M.rain ? 'r' : ''); if (key === _toneK) return _tone;
  const a = SUN.el * 180 / Math.PI, sm = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const day = sm(-6, 6, a), g = 1 - sm(4, 30, a), mx = (A, B, t) => A.map((v, i) => lerp(v, B[i], t));
  const lit = mx([1, 1, 1], GOLD, g), sky = M && M.rain ? SUN.skyRain : SUN.sky;
  _toneK = key; return _tone = { day, li: mx(NIGHT, lit, day), sh: mx(NIGHT, mx(SUN.tint, DUSK, g), day), w: SUN.warm.map((v, i) => v * lit[i] * day), sky: sky.map(v => v * lerp(0.25, 1, day)) };
}
let HS = 0.5; const LIGHT_Q = [0.35, 0.5, 0.75];                                     // height buffer resolution vs the screen (settings › LIGHTING QUALITY)
const SUNH = { flag: 22, item: 4, wall: 40, fence: 9, hay: 14, crate: 10, nest: 10, tree: [56, 36] };     // px
const SUNB = { mgNest: SUNH.nest, stand: 18, jump: 4 };     // px: the nest MG rests on its bags (drawn over them, so never lower); a soldier's legs (added to his painted height, solid); a jump's gap
/* per part (sprite name less its frame number) or shape (SUNH name): lift = an air gap (px) between it and what it rests
   on, add = px taller than painted. A part's start is the top of what's under it (+ lift); its pixels stand on that.
   A sprite on an underside (the atlas's settings, use: under_<name>, a rect in its pool, heights only, painted as depth down; or any sprite, itself too) stands on it: as high as its
   deepest pixel, so the tracks / wheels reach the ground and the clearance is whatever is painted */
const SUNP = { tur_gun: { lift: 4 }, tur_gun1: { lift: 4 } };
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
  MAT = { mp, ap, w, h }; ATLAS_CFG = atlasCfg(mp, w, h);
  const P = ATLAS._pool, C = ATLAS_CFG; for (const [n, r] of Object.entries(C.under || {})) ATLAS['under_' + n] = [r[0], P[1] + r[1], r[2], r[3], r[4], r[5]];     // undersides: where in the pool
  USE = C.use || {}; if (!C.use) for (const n in ATLAS) { const u = 'under_' + n.replace(/\d+$/, ''); if (n[0] !== '_' && !n.startsWith('under_') && C.under && ATLAS[u] && !(C.off || []).includes(n)) USE[n] = u; }     // older settings: a part's states on its underside, but the ones off
  return MAT;
}
/* the atlas's table (atlas_table.py; the heightmap editor writes it): a JSON string in atlas_m's last rows, 2 bytes of length
   then UTF-8, over its pixels' G / B bytes, the bottom row first. Its sprites are atlas.json (made from it at build); here
   the undersides { under: { name: [x, y, w, h, px, py] in the pool } } and what stands on what { use: { sprite: under_<name>
   or a sprite } } (older ones: off, the states without their part's underside) */
let ATLAS_CFG = {}, USE = {};     // USE: what each sprite stands on (a pool underside, another sprite, itself)
function atlasCfg(mp, w, h) {
  const at = k => { const y = h - 1 - (k / w | 0), i = (y * w + k % w) * 4; return mp.subarray(i + 1, i + 3); };     // the k-th byte pair, bottom row first
  const n = at(0)[0] << 8 | at(0)[1], b = new Uint8Array(n + 3); if (!n || n + 2 > w * h * 2) return {};
  for (let k = 0; k < (n + 2) / 2; k++) b.set(at(k), k * 2);
  try { const c = JSON.parse(new TextDecoder().decode(b.subarray(2, 2 + n))); return c && c.v === 2 ? c : {}; } catch (e) { return {}; }
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
function artMax(n, un, lo) {     // its tallest pixel (an underside has no art: all of it; un: a sprite stood on, the same; lo: its lowest painted one)
  const all = un || n.startsWith('under_'), k = (lo ? '<' : '') + (all ? '_' + n : n); let v = _amx.get(k); if (v !== undefined) return v; const D = matData(), m = ATLAS[n]; if (!D || !m) return 0; v = lo ? 1e9 : 0;
  for (let y = 0; y < m[3]; y++) for (let x = 0; x < m[2]; x++) { const i = ((m[1] + y) * D.w + m[0] + x) * 4; if (all || D.ap[i + 3] >= 128) v = (lo ? Math.min : Math.max)(v, D.mp[i] / 4); }
  if (v === 1e9) v = 0; _amx.set(k, v); return v;
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
function canH(v) { const q = partsOf(v).find(q => q.n.startsWith('tur_gun')), [px, py] = turretPivot(v); return q ? partH(q, px + Math.cos(v.ta) * BARREL, py + Math.sin(v.ta) * BARREL) : ZH.shot; }
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
    const GC = mkG(4, 4), gl = GL || GC.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: true });     // GL: the shared context, the maps a GL surface
    if (!gl) return false;
    const IA = GL ? { vertexAttribDivisorANGLE: (i, d) => gl.vertexAttribDivisor(i, d), drawArraysInstancedANGLE: (m, f, c, n) => gl.drawArraysInstanced(m, f, c, n) } : gl.getExtension('ANGLE_instanced_arrays'), MX = GL ? { MAX_EXT: gl.MAX, MIN_EXT: gl.MIN } : gl.getExtension('EXT_blend_minmax');
    if (GL) gxYield();
    if (!IA || !MX) throw new Error('no instancing / max blending');
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const prog = (vs, fs, at) => { const P = gl.createProgram(); gl.attachShader(P, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(P, sh(gl.FRAGMENT_SHADER, fs)); at.forEach((n, i) => gl.bindAttribLocation(P, i, n)); gl.linkProgram(P); if (!gl.getProgramParameter(P, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(P)); return P; };
    const VS = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0., 1.); }', TX = `uniform sampler2D H, HS; uniform vec2 S; uniform vec4 R; uniform float FG;
vec4 tx(vec2 p) { return texture2D(H, clamp(p, R.xy, R.zw) / S); }
float hh(vec2 p) { vec4 c = tx(p); return max(c.r, c.g) * 63.75; }     // the top: grounded (R) or floating (G), whichever's higher
float hv(vec2 p, bool o) { if (o) { vec4 c = texture2D(HS, clamp(p, R.xy, R.zw) / S); return max(c.r, c.g) * 63.75; } return hh(p); }     // the top that shows: out of sight (o), only what's remembered
float un(vec2 c) { return (c.x * 255. + c.y) / 255. * 128. - 64.; }     // a height packed in two bytes (sunSweep)
float sunIn(vec4 c, float h) { float g = un(c.rg), lo = c.b * 128. - 64., hi = c.a * 128. - 64.; return max(clamp((g - h + 0.75) / 1.5, 0., 1.), clamp((min(h - lo, hi - h) + 0.75) / 1.5, 0., 1.)); }`;     // how far height h is in the sun's shadow by a sweep's record c: under its skyline, or inside its floating span
    /* the point lights, once per pixel (pl: falloff, slope toward each, its own shadow march, each its colour PC) and their
       glow scattered in haze (smoke, rain) into LT: RGB pl / 4, A scatter / 4. The sun's slope and shadow: the maps' (CP) */
    const P = prog(VS, `precision highp float; ${TX}
uniform float K, V, HZ; uniform vec2 P; uniform vec3 L; uniform vec4 PL[${LMAX}], PD[${LMAX}]; uniform float PK[${LMAX}]; uniform vec3 PC[${LMAX}]; uniform sampler2D SWT, SWS;
float blk(vec2 p, float z, out float o, out float th) { vec4 c = texture2D(H, (floor(clamp(p, R.xy, R.zw)) + 0.5) / S); o = 1.; th = c.r * 63.75; float d = th - z;     // grounded: solid from the ground up (no soft foot)
  float ft = c.g * 63.75, fb = (1. - c.a) * 63.75; if (ft > 0.01) { float e = min(ft - z, z - fb); if (e > d) { d = e; th = ft - fb; } }     // floating: its own span, the gap under it kept
  if (c.b > 0.5) { float e = min(${ROOF_Z[1].toFixed(1)} - z, z - ${ROOF_Z[0].toFixed(1)}); if (e > d) { d = e; th = ${(ROOF_Z[1] - ROOF_Z[0]).toFixed(1)}; } }     // a roof over it (B): the slab blocks too
  return d; }     // > 0: height z is inside something here (th thick; read unblended, so a blend of two pixels isn't a span neither has); o: how much it blocks
void main() {
  vec2 p = vec2(gl_FragCoord.x, V - gl_FragCoord.y) + P;     // P: the view's place in H
  float h0 = hh(p);
  vec3 N = normalize(vec3(-vec2(hh(p + vec2(1., 0.)) - hh(p - vec2(1., 0.)), hh(p + vec2(0., 1.)) - hh(p - vec2(0., 1.))) * K * 0.5, 1.));
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));     // interleaved gradient noise: an even spread, not speckle
  vec3 pl = vec3(0.); float sc = 0.;
  for (int i = 0; i < ${LMAX}; i++) {
    if (PK[i] <= 0.) continue;
    vec2 v = PL[i].xy - p; float dl = length(v) / K, lh = PL[i].w - h0;
    if (dl >= PL[i].z) continue;
    float cn = 1.;
    if (PD[i].w > 1.) {     // a spotlight (lampPool): the cone in 3D, its middle dropping w - 1 per px (on the ground: an oval), its far side SW wider (the oval's far end fans out)
      vec3 a = normalize(vec3(PD[i].xy, 1. - PD[i].w)), r = normalize(vec3(-v / K, -lh)), sd = vec3(-PD[i].y, PD[i].x, 0.), up = cross(a, sd);
      float c = acos(PD[i].z), dv = asin(clamp(dot(r, up), -1., 1.)) / c, dh = asin(clamp(dot(r, sd), -1., 1.)) / (c * (1. + ${SPOT_FAR.toFixed(2)} * clamp(dv, 0., 1.)));
      cn = dot(r, a) > 0. ? clamp((1. - length(vec2(dh, dv))) / 0.25, 0., 1.) : 0.; if (cn <= 0.) continue; }
    float s = 1., n = clamp(length(v) / 6., 8., 64.);     // 6 buffer px apart on average (up to 64), closer toward the light (what carries it: a barrel, a hull's edge, isn't stepped over), wider near here
    for (int k = 1; k < 64; k++) { if (float(k) >= n) break; float o, th, u = (float(k) - j) / n, t = mix(u, u * (2. - u), 0.6), d = blk(p + v * t, h0 + lh * t, o, th); if (d > 0.) s = min(s, 1. - clamp(d / min(3., th * 0.35), 0., 1.) * o); }
    s *= cn;
    vec3 ld = normalize(vec3(v / K, max(lh, dl * 0.5)));     // the slope it lights: from at least a little above (a flash at hip height still lights the hull facing it)
    pl += PC[i] * PK[i] * s * (0.5 * pow(1. - dl / PL[i].z, 1.3) + 0.5 * pow(max(0., 1. - dl / 40.), 2.)) * clamp(dot(N, ld) / max(ld.z, 0.15), 0., 2.);     // what faces the light (flat ground: x 1)
    sc += PK[i] * cn * pow(1. - dl / PL[i].z, 2.);
  }
  gl_FragColor = vec4(pl * 0.25 + (j - 0.5) / 255., min(1., sc * HZ * 0.25));     // dithered: 8 bits of light show rings in the dark
}`, ['p']);
    /* the maps (Q 0 shade: multiplied, 1 highlights: dodged, 2 glow: added) from LT, the heights' normals and the materials
       (MT: R reflectivity, G glow, B water): reflective paint mirrors the sky (dims its own colour by as much) and glints
       where its slope sends the sun to the eye; water ripples; glow brightens
       its own art and blooms (BL). WX: buffer px to world px. Q 3 / 4: the heights / materials (dev) */
    const CP = prog(VS, `precision highp float; ${TX}
#define PLT vec3(1., 0.96, 0.86)
uniform sampler2D MT, LT, SWT, SWS, SWL; uniform vec2 G, P, O; uniform float K, Q, V, TM, BL, EN, RF, LB, LY; uniform vec3 L, C, W, SKY, LI; uniform vec3 WX; uniform vec4 E[2];
float ro(float d) { return ${ROOF_CAP.toFixed(2)} * clamp((d - ${ROOF_NEAR.toFixed(1)}) / ${(ROOF_FAR - ROOF_NEAR).toFixed(1)}, 0., 1.); }     // roofOp
float roofA(vec2 p, vec2 w, bool ou) {     // how much of the roof shows here (roofView's fade; out of sight, all of it)
  if (tx(p).b < 0.5 || hh(p) > ${ROOF_Z[1].toFixed(1)}) return 0.;
  if (ou) return 1.;
  float a = 1.;
  for (int i = 0; i < 4; i++) { if (float(i) >= EN) break; vec4 e = E[i / 2]; float d = length(w - (i - i / 2 * 2 == 0 ? e.xy : e.zw)); a *= i == 0 ? ro(d) : ro(d) / ${ROOF_CAP.toFixed(2)}; }
  return mix(1., a, RF); }     // RF: how far inside a house the view is (roofView's vw.rf)
vec4 mt(vec2 p) { return texture2D(MT, clamp(p, R.xy, R.zw) / S); }
vec3 hr(float t) { t = clamp(t, 0., 1.) * 4.; return t < 1. ? mix(vec3(0.04, 0.04, 0.16), vec3(0.1, 0.3, 0.95), t) : t < 2. ? mix(vec3(0.1, 0.3, 0.95), vec3(0.1, 0.85, 0.35), t - 1.) : t < 3. ? mix(vec3(0.1, 0.85, 0.35), vec3(1., 0.85, 0.1), t - 2.) : mix(vec3(1., 0.85, 0.1), vec3(1., 0.2, 0.15), t - 3.); }     // dev heights' ramp
float hs(vec2 p) { vec3 q = fract(p.xyx * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }     // fract hash: no big sin (it splits between cells)
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hs(i), hs(i + vec2(1., 0.)), f.x), mix(hs(i + vec2(0., 1.)), hs(i + vec2(1., 1.)), f.x), f.y); }
float wv(vec2 w) { return vn(w * 0.06 + vec2(TM * 0.35, TM * 0.25)) + 0.5 * vn(w * 0.14 - vec2(TM * 0.45, -TM * 0.2)); }
void main() {
  vec2 f = gl_FragCoord.xy - O, p = vec2(f.x, V - f.y) + P;     // O: where this map sits in GC (GL pixels)
  // the sun: its slope (lam) and shadow (sh: the frame's sweep, and the other channels' (SWL, LY: any)); FG: the memory's map, from what it keeps (HS, SWS)
  bool ou = FG > 0.5; float h0 = hv(p, ou), sh;
  vec3 N = normalize(vec3(-vec2(hv(p + vec2(1., 0.), ou) - hv(p - vec2(1., 0.), ou), hv(p + vec2(0., 1.), ou) - hv(p - vec2(0., 1.), ou)) * K * 0.5, 1.));
  float lam = (0.45 + 0.55 * max(dot(N, L), 0.)) / (0.45 + 0.55 * L.z);
  { vec2 q = (floor(p) + 0.5) / S; sh = 1. - max(sunIn(ou ? texture2D(SWS, q) : texture2D(SWT, q), h0), LY > 0.5 && !ou ? texture2D(SWL, q).r : 0.); }
  if (Q > 4.5) { vec4 a = texture2D(LT, f / G); gl_FragColor = vec4(Q > 5.5 ? min(a.rgb * 4. + a.a * 2. * PLT, 1.) : vec3(sh), 1.); return; }     // dev: the sun's shadow alone, the point lights alone
  if (Q > 3.5) { gl_FragColor = vec4(mt(p).rgb, 1.); return; }
  if (Q > 2.5) {     // dev HEIGHTS: the top (whatever it is) on one ramp, 0 dark blue .. 64 px red; hatched where it floats over air (not where it rests on a wheel / track): the hatch is its underside
    vec4 c = tx(p); float t = max(hh(p), c.b > 0.5 ? ${ROOF_Z[1].toFixed(1)} : 0.), fb = (1. - c.a) * 63.75;
    vec3 col = hr(t / 64.); if (c.g > c.r && fb > c.r * 63.75 + 0.5 && mod(floor(p.x + p.y), 6.) < 2.) col = hr(fb / 64.);
    gl_FragColor = vec4(col, 1.); return; }
  vec4 a = LB < 0.5 ? vec4(0.) : (texture2D(LT, (f + vec2(-1., -1.)) / G) + texture2D(LT, (f + vec2(1., -1.)) / G) + texture2D(LT, (f + vec2(-1., 1.)) / G) + texture2D(LT, (f + vec2(1., 1.)) / G)) * 0.25, m = mt(p);     // the lights blurred (4 linear taps: a 4 x 4 px footprint): their soft shadows' jittered steps blend, not dither; LB 0: no point lights, LT not read
  float r = m.r, gw = m.g; vec3 pl = a.rgb * 4., tint = pl.r + pl.g + pl.b > 0.004 ? pl / max(max(pl.r, pl.g), pl.b) : PLT;     // the point lights (LT: their colours summed); tint: their colour here (a red light's haze is red)
  vec2 w = (p - WX.xy) / WX.z;
  if (m.b > 0.5) { vec2 e = vec2(1.5, 0.); N = normalize(N + vec3(wv(w - e.xy) - wv(w + e.xy), wv(w - e.yx) - wv(w + e.yx), 0.) * 0.9); }
  vec3 Rv = reflect(vec3(0., 0., -1.), N); float spec = pow(max(dot(Rv, L), 0.), mix(12., 160., r)) * sh;
  // the memory's map (ou): shade only (no highlights, glow, gloss), roofs whole
  if (ou && Q > 0.5) { gl_FragColor = vec4(0., 0., 0., 1.); return; }
  if (ou) { pl = vec3(0.); r = 0.; }
  float ra = roofA(p, w, ou);     // the roof shows: lit as a flat top in the sun (as is: no shade, no highlight)
  if (Q < 0.5) { gl_FragColor = vec4(mix(min(mix(C, LI, sh) * min(lam, 1.) + pl, vec3(1.)) * (1. - r * 0.55), min(LI + pl, vec3(1.)), ra), 1.); return; }     // C: shade, LI: sunlit (both the night's ambient after dark)
  if (Q < 1.5) { vec3 hi = W * max(lam - 1., 0.) * 1.6 * sh + pl * 0.6 + gw * 1.5; gl_FragColor = vec4(hi / (1. + hi) * (1. - ra), 1.); return; }     // dodge by h / (1 + h): x (1 + h)
  float b = 0.;
  if (BL > 0.) for (int i = 0; i < 12; i++) { float t = float(i), q = (1. + t) / 12. * 9. * K; b += mt(p + vec2(cos(t * 2.39996), sin(t * 2.39996)) * q).g; }
  vec3 sky = mix(SKY * 1.2, SKY, Rv.z);
  gl_FragColor = vec4((pl * 0.45 + a.a * 2. * tint + r * (sky * 0.5 * (0.55 + 0.45 * sh) + W * spec * 2.5) + vec3(1., 0.86, 0.62) * b / 12. * BL) * (1. - ra), 1.);
}`, ['p']);
    /* heights: one quad per thing (i0 centre + x half-axis, i1 y half-axis + kind + p0, i2 p1 p2 + atlas uv0, i3 uv1 + its top + w,
       i4 its underside's box in its uv), to buffer px by X (scale, offset); kinds: 0 sprite (p0 base, p1 add: its painted heights
       from base up; over its underside's box, the base lowered by the underside's painted depth there, read p2 w away: the floor
       reaching down, one span; w past 2: the frame is drawn mirrored, the underside isn't: its v is w - 4 - v), 1 box (p0 top,
       p1 bottom, p2 roof over it: B 1), 2 disc (p0 centre top, p1 rim top, p2 bottom), 3 ring arc (p0 top, p1 inner radius / outer,
       p2 half angle), 5 material only (p0 reflectivity, p1 water, p2 2: a
       disc). Out: what stands on the ground (bottom under 1 px): R its top x 4; what floats (a gun past the hull, a jumper): G its
       top x 4, A 255 - its bottom x 4 (MAX: the highest top, the lowest bottom), so one over the other never fills the gap; B a roof over it (a slab ROOF_Z: casts, isn't the surface). With MM: the materials (R reflectivity, G glow, B water), the
       highest top winning (depth) */
    const HP = prog(`attribute vec2 c; attribute vec4 i0, i1, i2, i3, i4; uniform vec3 X; uniform vec2 F; uniform float MM; varying vec2 q, uv; varying vec4 k, ur; varying float ov;
void main() { vec2 w = i0.xy + i0.zw * c.x + i1.xy * c.y; gl_Position = vec4((w * X.x + X.yz) / F * 2. - 1., MM > 0.5 ? 1. - i3.z / 32. : 0., 1.); q = c; uv = mix(i2.zw, i3.xy, c * 0.5 + 0.5); k = vec4(i1.zw, i2.xy); ur = i4; ov = i3.w; }`,
`precision highp float; uniform sampler2D A; uniform float MM; varying vec2 q, uv; varying vec4 k, ur; varying float ov;
vec4 span(float t, float b, float z) { float T = clamp(t * 4. / 255., 0., 1.); return b < 1. ? vec4(T, 0., z, 0.) : vec4(0., T, z, 1. - clamp(b * 4. / 255., 0., 1.)); }     // standing on the ground: R; floating: G top, A 255 - bottom
void main() {
  float r2 = dot(q, q);
  if (k.x > 4.5) { if (MM < 0.5 || (k.w > 1.5 && r2 > 1.)) discard; gl_FragColor = vec4(k.y, 0., k.z, 1.); return; }
  if (k.x < 0.5) { vec4 m = texture2D(A, uv); if (m.a < 0.5) discard; if (MM > 0.5) { gl_FragColor = vec4(m.g, m.b, 0., 1.); return; }
    float b = k.y; if (all(greaterThanEqual(uv, ur.xy)) && all(lessThan(uv, ur.zw))) { float d = texture2D(A, ov > 2. ? vec2(uv.x + k.w, ov - 4. - uv.y) : uv + vec2(k.w, ov)).r; if (d > 0.) b = max(k.y - d * 63.75, 0.); }     // over its underside (ur): the base lowered by its painted depth
    gl_FragColor = span(m.r * 63.75 + k.y + k.z, b, 0.); return; }
  else if (k.x < 1.5) gl_FragColor = span(k.y, k.z, k.w);
  else if (k.x < 2.5) { if (r2 > 1.) discard; gl_FragColor = span(mix(k.y, k.z, sqrt(r2)), k.w, 0.); }
  else { float r = sqrt(r2); if (r > 1. || r < k.z || abs(atan(q.y, q.x)) > k.w) discard; gl_FragColor = span(k.y, 0., 0.); }
  if (MM > 0.5) gl_FragColor = vec4(0., 0., 0., 1.);
}`, ['c', 'i0', 'i1', 'i2', 'i3', 'i4']);
    /* the sweep: what blocks the sun at this pixel, in heights here (a blocker d px sunward shades heights b - d DH .. t - d DH),
       kept as two records so one never hides the other: RG the skyline of things standing on the ground (the highest t - d DH:
       exact, two bytes), B / A the span of floating things (a gun past the hull, an MG over the hood: lo / hi, a byte each;
       none: lo > hi). N 0: from the heights 1 px sunward; then N = 1, 2, 4...: joined with what's N px sunward, lowered N DH.
       A span reaching the ground or the skyline is folded into the skyline (the same heights shaded: nothing under 0 receives),
       so the slot stays free for what floats (a hull on its underside no longer pushes the turret's out). Two floating spans that don't meet: the lower one kept */
    const SP = prog(VS, `precision highp float; ${TX}
uniform sampler2D B; uniform vec2 D; uniform float N, DH;
vec2 pk(float v) { float x = clamp((v + 64.) / 128., 0., 0.99998) * 255.; return vec2(floor(x) / 255., fract(x)); }
bool out_(vec2 q) { return any(lessThan(q, R.xy)) || any(greaterThan(q, R.zw)); }
void fold(inout vec2 s, inout float g) { if (s.x <= s.y && s.x <= max(g, 0.) + 0.5) { g = max(g, s.y); s = vec2(64., -64.); } }
void main() {
  vec2 p = gl_FragCoord.xy, a = vec2(64., -64.); float g = -64.;     // a: floating (lo, hi), none; g: the skyline, none
  if (N < 0.5) { vec2 q = p + D; if (!out_(q)) { vec4 c = texture2D(H, (floor(q) + 0.5) / S); float t = c.r * 63.75, ft = c.g * 63.75; if (t > 0.01) g = t - DH; if (ft > 0.01) a = vec2((1. - c.a) * 63.75, ft) - DH; if (c.b > 0.5) { vec2 r = vec2(${ROOF_Z[0].toFixed(1)}, ${ROOF_Z[1].toFixed(1)}) - DH; a = a.x > a.y ? r : vec2(min(a.x, r.x), max(a.y, r.y)); } } }
  else {
    vec4 c = texture2D(B, (floor(p) + 0.5) / S); g = un(c.rg); a = vec2(c.b, c.a) * 128. - 64.;
    vec2 q = p + D * N;
    if (!out_(q)) { c = texture2D(B, (floor(q) + 0.5) / S); g = max(g, un(c.rg) - N * DH); vec2 b = vec2(c.b, c.a) * 128. - 64. - N * DH;
      fold(a, g); fold(b, g); fold(a, g);
      if (b.y > -1. && b.x <= b.y) { if (a.x > a.y) a = b; else if (b.x <= a.y + 0.5 && a.x <= b.y + 0.5) a = vec2(min(a.x, b.x), max(a.y, b.y)); else if (b.x < a.x) a = b; } }
  }
  fold(a, g); if (a.y < -1.) a = vec2(64., -64.);
  gl_FragColor = vec4(pk(max(g, -64.)), clamp((a + 64.) / 128., 0., 1.));
}`, ['p']);
    /* the memory's heights: PP the sight polygons (world px, X as the heights'; writes nothing: clears what's under them),
       RC its heights read back into the buffer (buffer px to world by X, to the memory's px by Z; off the map: nothing) */
    const PP = prog('attribute vec2 p; uniform vec3 X; uniform vec2 F; void main() { gl_Position = vec4((p * X.x + X.yz) / F * 2. - 1., 0., 1.); }', 'precision mediump float; void main() { gl_FragColor = vec4(0.); }', ['p']);
    const RC = prog(VS, `precision highp float; uniform sampler2D M; uniform vec3 X; uniform vec2 F; uniform float Z;
void main() { vec2 t = floor((gl_FragCoord.xy - X.yz) / X.x * Z); gl_FragColor = any(lessThan(t, vec2(0.))) || any(greaterThanEqual(t, F)) ? vec4(0.) : texture2D(M, (t + 0.5) / F); }`, ['p']);
    // a channel's sweep (B) to how far the top here is in its shadow (R), into the channels' shade (MAX: any of them)
    const RS = prog(VS, `precision highp float; ${TX} uniform sampler2D B;
void main() { vec2 p = gl_FragCoord.xy; gl_FragColor = vec4(sunIn(texture2D(B, (floor(p) + 0.5) / S), hh(p)), 0., 0., 1.); }`, ['p']);
    const buf = d => { const o = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, o); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW); return o; };
    const tri = buf(new Float32Array([-1, -1, 3, -1, -1, 3])), quad = buf(new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])), ib = {};
    for (const n in HL) ib[n] = gl.createBuffer();
    const texture = (f, data) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, f], [gl.TEXTURE_MAG_FILTER, f], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); if (data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data); return t; };
    // the material atlas: R its heights, G reflectivity, B glow, A the colour atlas's silhouette. Units: 0 heights, 1 atlas, 2 materials, 3 light
    const { mp, ap, w, h } = matData(), id = new ImageData(w, h); for (let i = 0; i < mp.length; i += 4) { id.data[i] = mp[i]; id.data[i + 1] = mp[i + 1]; id.data[i + 2] = mp[i + 2]; id.data[i + 3] = ap[i + 3] >= 128 ? 255 : 0; }
    gl.activeTexture(gl.TEXTURE1); const AT = texture(gl.NEAREST, id);
    gl.activeTexture(gl.TEXTURE2); const MT = texture(gl.NEAREST); gl.activeTexture(gl.TEXTURE3); const LT = texture(gl.LINEAR); gl.activeTexture(gl.TEXTURE0); const HT = texture(gl.LINEAR);
    gl.activeTexture(gl.TEXTURE4); const ST = [texture(gl.NEAREST), texture(gl.NEAREST)], FS = [gl.createFramebuffer(), gl.createFramebuffer()]; gl.activeTexture(gl.TEXTURE0);     // the sweep's two (ping-pong)
    gl.activeTexture(gl.TEXTURE6); const SS = [texture(gl.NEAREST), texture(gl.NEAREST)], FSS = [gl.createFramebuffer(), gl.createFramebuffer()];     // the remembered things' sweep
    gl.activeTexture(gl.TEXTURE7); const HTS = texture(gl.LINEAR), FBS = gl.createFramebuffer(); gl.activeTexture(gl.TEXTURE0);     // and their heights
    const ly = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) >= 11, L2 = {};     // the channels past the first (hLayers): 8 their heights, 9 their sweep, 10 their shade
    if (ly) { gl.activeTexture(gl.TEXTURE8); L2.H = texture(gl.NEAREST); gl.activeTexture(gl.TEXTURE9); L2.T = [texture(gl.NEAREST), texture(gl.NEAREST)]; gl.activeTexture(gl.TEXTURE10); L2.M = texture(gl.NEAREST); gl.activeTexture(gl.TEXTURE0); L2.FH = gl.createFramebuffer(); L2.F = [gl.createFramebuffer(), gl.createFramebuffer()]; L2.FM = gl.createFramebuffer(); }
    const FB = gl.createFramebuffer(), FM = gl.createFramebuffer(), FL = gl.createFramebuffer(), DB = gl.createRenderbuffer();
    const uni = (P, ns) => { const U = {}; for (const n of ns) U[n] = gl.getUniformLocation(P, n); return U; };
    const U = uni(P, ['S', 'R', 'K', 'L', 'V', 'P', 'PL', 'PD', 'PK', 'PC', 'H', 'HZ']), SU = uni(SP, ['S', 'R', 'H', 'B', 'D', 'N', 'DH']), CU = uni(CP, ['S', 'R', 'K', 'L', 'C', 'W', 'O', 'Q', 'V', 'P', 'G', 'H', 'MT', 'LT', 'TM', 'BL', 'SKY', 'LI', 'WX', 'E', 'EN', 'RF', 'FG', 'SWT', 'SWS', 'HS', 'LB', 'SWL', 'LY']), HU = uni(HP, ['X', 'F', 'A', 'MM']), PU = uni(PP, ['X', 'F']), RU = uni(RC, ['M', 'X', 'F', 'Z']), LU = uni(RS, ['S', 'R', 'H', 'B']);
    gl.useProgram(HP); gl.uniform1i(HU.A, 1); gl.useProgram(CP); gl.uniform1i(CU.H, 0); gl.uniform1i(CU.MT, 2); gl.uniform1i(CU.LT, 3); gl.uniform1i(CU.SWT, 4); gl.uniform1i(CU.SWS, 6); gl.uniform1i(CU.HS, 7); gl.uniform1i(CU.SWL, ly ? 10 : 4); gl.useProgram(P); gl.uniform1i(U.H, 0); gl.useProgram(SP); gl.uniform1i(SU.H, 0); gl.uniform1i(SU.B, 4); gl.useProgram(RC); gl.uniform1i(RU.M, 5); gl.useProgram(RS); gl.uniform1i(LU.H, 0); gl.uniform1i(LU.B, ly ? 9 : 4);
    _sun = { out: GL ? GC.fb : null, gl, GC, IA, MX, P, CP, HP, SP, PP, RC, RS, U, CU, HU, SU, PU, RU, LU, ly, L2, pb: gl.createBuffer(), pv: new Float32Array(4096), mem: new Map(), ST, FS, SS, FSS, HTS, FBS, tri, quad, ib, AT, HT, MT, LT, FB, FM, FL, DB, fw: 0, fh: 0, lw: 0, lh: 0, aw: w, ah: h, pl: new Float32Array(LMAX * 4), pd: new Float32Array(LMAX * 4), pk: new Float32Array(LMAX), pc: new Float32Array(LMAX * 3), ev: new Float32Array(8) };
  } catch (e) { console.warn('sun off:', e.message); _sun = false; }
  return _sun;
}
/* this frame's height quads: a (MAX blended), w (walls, written over: what's there is inside them) then t (trees, MAX) */
const HQ = 20, hbuf = () => ({ f: new Float32Array(HQ * 256), n: 0 }), HL = { a: hbuf(), u: hbuf(), w: hbuf(), t: hbuf(), m: hbuf(), f: hbuf(), x: hbuf(), k: hbuf() };     // u: what the memory doesn't keep (units, crates, items...); m: materials only (water...); f: floating parts waiting for their channel (hLayers); x: the channels past the first, k: the kept ones of those (the memory's)
let HMAT = 0, HMAX = 0;     // this frame: 1 something reflective in view, 2 something glowing; the tallest top in view
function hgrow(L) { if ((L.n + 1) * HQ > L.f.length) { const g = new Float32Array(L.f.length * 2); g.set(L.f); L.f = g; } return L.n++ * HQ; }
function hq(L, cx, cy, ux, uy, vx, vy, k, p0, p1, p2, u0, v0, u1, v1, z, w, R) {
  if (L !== HL.m && z > HMAX) HMAX = z;
  const o = hgrow(L), f = L.f; f[o] = cx; f[o + 1] = cy; f[o + 2] = ux; f[o + 3] = uy; f[o + 4] = vx; f[o + 5] = vy; f[o + 6] = k; f[o + 7] = p0; f[o + 8] = p1; f[o + 9] = p2; f[o + 10] = u0 || 0; f[o + 11] = v0 || 0; f[o + 12] = u1 || 0; f[o + 13] = v1 || 0; f[o + 14] = z || 0; f[o + 15] = w || 0;
  for (let i = 0; i < 4; i++) f[o + 16 + i] = R ? R[i] : 0;
}
/* a quad of half size hw x hh round (cx, cy), turned a */
function hbox(L, cx, cy, hw, hh, a, k, p0, p1, p2, z) { const c = Math.cos(a), s = Math.sin(a); hq(L, cx, cy, c * hw, s * hw, -s * hh, c * hh, k, p0, p1, p2, 0, 0, 0, 0, z ?? (k === 2 ? Math.max(p0, p1) : p0)); }
let HLA = HL.a;     // the list a sprite's heights go in (HL.u while units go in)
/* a sprite's painted heights from base up (each add px taller), where the art is opaque; pivot at (x, y), turned a */
function hspr(n, x, y, a, base, add, fy = 1, U) {     // fy -1: mirrored over its pivot's row (as spr's sy); U: its underside (undQ)
  const m = ATLAS[n]; if (!m) return; const c = Math.cos(a), s = Math.sin(a), ox = m[2] / 2 - m[4], oy = (m[3] / 2 - m[5]) * fy, S = _sun;
  hq(HLA, x + c * ox - s * oy, y + s * ox + c * oy, c * m[2] / 2, s * m[2] / 2, -s * m[3] / 2 * fy, c * m[3] / 2 * fy, 0, base || 0, add || 0, U ? U[0] : 0, m[0] / S.aw, m[1] / S.ah, (m[0] + m[2]) / S.aw, (m[1] + m[3]) / S.ah, (base || 0) + (add || 0) + artMax(n), U ? U[1] : 0, U && U.slice(2));
  HMAT |= artMat(n);
}
/* a frame's underside (n under the frame o): its painted heights hang down from the frame's base (to the ground: a track, a
   wheel), only under the frame's art and where the two overlap (pivots lined up, whole px), so a state with other edges never
   shadows from paint past them: [the offset to it in the atlas (u, v; mirrored: 4 + its row's sum), its box in the frame's uv].
   d [lx, ly, fy]: a part off the pivot the underside lines up on (a track beside the hull: its pivot off the hull's), drawn
   mirrored if fy -1 (the underside never is: the mirrored frame's rows run up it, so the left track stands on the hull's left as painted) */
function undQ(n, o, d) {
  const m = ATLAS[n], f = ATLAS[o]; if (!m || !f) return null; const S = _sun, [lx, ly, fy] = d, dx = Math.round(f[4] - lx - m[4]);
  const dy = Math.round(f[5] - ly - m[5]), K = Math.floor(ly + f[5] + m[5] - 0.5);     // the underside's row: the frame's minus dy; mirrored, K minus it
  const X0 = Math.max(0, dx), X1 = Math.min(f[2], m[2] + dx), Y0 = Math.max(0, fy > 0 ? dy : K - m[3] + 1), Y1 = Math.min(f[3], fy > 0 ? m[3] + dy : K + 1); if (X1 <= X0 || Y1 <= Y0) return null;
  return [(m[0] - dx - f[0]) / S.aw, fy > 0 ? (m[1] - dy - f[1]) / S.ah : 4 + (m[1] + K + f[1] + 1) / S.ah, (f[0] + X0) / S.aw, (f[1] + Y0) / S.ah, (f[0] + X1) / S.aw, (f[1] + Y1) / S.ah];
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
const underOf = n => { const u = USE[n]; return u && ATLAS[u] ? u : null; };     // the atlas's settings: what it stands on (none: the dirt)
function hpart(n, x, y, a, o = {}) {         // o: min (start at least), add, rx / ry (rest point), keep (others stand on it), who (the crewman), fy (-1 mirrored), at (its pivot off its underside's: hund)
  if (!ATLAS[n]) return; const P = sunP(n), un = underOf(n), f = Math.max(o.min || 0, Math.round(hUnder(o.rx ?? x, o.ry ?? y)));
  const b = f + (un ? artMax(un, true) : 0) + (P.lift || 0), add = (o.add || 0) + (P.add || 0), fy = o.fy || 1, q = { n, x, y, a, b, add, who: o.who, fy, un: un && [un, n, [...(o.at || [0, 0]), fy]] };     // un: what it stands on, hanging from its base
  if (o.keep) _stk.push(q); if (_pp) _pp.push(q); else hspr(n, x, y, a, b, add, fy, un && undQ(...q.un));
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
function topOf(o) { let t = 0; for (const q of partsOf(o)) if (!q.who) t =Math.max(t, q.b + q.add + artMax(q.n)); return t; }
function solParts(s) {
  if (s.down) { hpart('sol_dead', s.x, s.y, s.a + Math.PI); return; }
  const body = 'sol_' + bodyPose(s), up = solLift(s);     // a jump lifts him off the ground
  if (s.stance === 2) { hpart('sol_' + legFrame(s), s.x, s.y, s.a, { min: up }); hpart(body, s.x, s.y, s.a, { min: up }); }
  else hpart(body, s.x, s.y, s.a, { min: up, add: solAdd(s) });     // standing: his legs under him, solid
}
function wreckParts(w) {
  if (w.type === 'tank') { const tx = w.x - 4 * Math.cos(w.a), ty = w.y - 4 * Math.sin(w.a), t = wreckTrack(w); if (t) hpart('track2', t[0], t[1], w.a, { fy: t[4] }); hpart('hull4', w.x, w.y, w.a, { keep: 1 }); hpart('tur_dead', tx, ty, w.ta); }
  else { if (w.bx !== undefined) hpart(w.bf ? 'jeep_flat' : 'jeep_wheel', w.bx, w.by, w.ba); hpart('jeep4', w.x, w.y, w.a); }
}
function vehParts(v) {
  const [mx, my] = mgPos(v), mg = v.mgFlash > 0 ? 'mg_f' : 'mg', crew = (i, min, add) => { const s = v.seats[i]; if (s) hpart('sol_sit', s.x, s.y, s.a, { min, add, who: s }); };
  const mount = { rx: mx - Math.cos(v.mgA) * 4, ry: my - Math.sin(v.mgA) * 4 };     // mgPos is 4 px out from the mount
  if (v.type === 'nest') { hpart(mg, mx, my, v.mgA, { ...mount, min: SUNB.mgNest }); crew(0); return; }
  if (v.type === 'tank') {
    const [px, py] = turretPivot(v), kick = clamp(v.recoil, 0, 1) * KICK, tf = turFrame(v);
    for (const [n, fy, x, y, lx, ly] of tracks(v)) hpart(n, x, y, v.a, { fy, at: [lx, ly] });     // on the hull's underside, beside its pivot
    hpart('hull' + hullFrame(v), v.x, v.y, v.a, { keep: 1 }); crew(2); crew(3);
    hpart('tur_gun' + tf, px - Math.cos(v.ta) * kick, py - Math.sin(v.ta) * kick, v.ta, { rx: px, ry: py }); hpart('tur' + tf, px, py, v.ta, { keep: 1 });     // the gun rests on the hull under the turret
    hpart(mg, mx, my, v.mgA, mount); crew(1);
  } else {
    const c = Math.cos(v.a), s = Math.sin(v.a), [wx, wy] = EXTRA.jeepWells[0], st = jeepSteer(v), f = v.hp / v.T.hp;
    for (const sd of [-1, 1]) hpart('jeep_tire', v.x + c * wx - s * wy * sd, v.y + s * wx + c * wy * sd, v.a + st);
    hpart('jeep' + (f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3), v.x, v.y, v.a, { keep: 1 }); crew(0); crew(1);
    hpart(mg, mx, my, v.mgA, mount); crew(2, 0, SUNB.stand);     // the MG on its post; the gunner stands in the bed
  }
}
/* a thing's parts as heights; what floats (its base off the ground) waits in HL.f for its channel (hLayers) */
function hParts(o) {
  for (const q of partsOf(o)) {
    const fl = q.b > 0.5 && _sun && _sun.ly, L = HLA, i = HL.f.n; if (fl) HLA = HL.f;
    hspr(q.n, q.x, q.y, q.a, q.b, q.add, q.fy, q.un && undQ(...q.un)); HLA = L;
    if (fl && HL.f.n > i) HLY.p.push({ o, q, i, k: L === HL.a, b: q.b, hi: q.b + q.add + artMax(q.n) });
  }
}
/* the sweep keeps one floating span a pixel, and the heights one: two floating things over each other (or their shadows
   crossing) whose spans don't meet lose one, or fill the gap between. So what floats goes in channels, each heights and swept
   on its own (sunLayers): two go in different ones where their footprints with their shadows (sun-aligned boxes, stretched
   away from the sun by top / tan(elevation)) overlap, unless their spans always meet: of one thing, at every px both are
   painted (partsMeet: a turret on its hull, not an MG reaching past the turret's top); of two, the same base (every px of a
   part holds its base: two hulls, two turrets). Channel 0 is the frame's (into a / u); the rest go in x by channel (k: the
   kept ones again, for the memory), with their regions (world) */
const HLY = { p: [], c: [], xn: 0 }, LCH = 4;
function partsMeet(A, B) {     // parts (q): at every px both paint, their spans meet (bottoms at their bases: an underside only lowers them)
  if (A.b + A.add + artMax(A.n, 0, 1) >= B.b - 0.5 && B.b + B.add + artMax(B.n, 0, 1) >= A.b - 0.5) return true;     // even their lowest px reach: any pose
  const D = matData(); let ma = ATLAS[A.n], mb = ATLAS[B.n]; if (!D || !ma || !mb) return false;
  if (ma[2] * ma[3] < mb[2] * mb[3]) [A, B, ma, mb] = [B, A, mb, ma];     // walk the smaller one's px
  const ca = Math.cos(A.a), sa = Math.sin(A.a), cb = Math.cos(B.a), sb = Math.sin(B.a), fa = A.fy || 1, fb = B.fy || 1;
  for (let y = 0; y < mb[3]; y++) for (let x = 0; x < mb[2]; x++) {
    const ib = ((mb[1] + y) * D.w + mb[0] + x) * 4; if (D.ap[ib + 3] < 128) continue;
    const ux = x + 0.5 - mb[4], uy = (y + 0.5 - mb[5]) * fb, dx = B.x + cb * ux - sb * uy - A.x, dy = B.y + sb * ux + cb * uy - A.y;
    const lx = Math.floor(ma[4] + dx * ca + dy * sa), ly = Math.floor(ma[5] + fa * (dy * ca - dx * sa)); if (lx < 0 || ly < 0 || lx >= ma[2] || ly >= ma[3]) continue;
    const ia = ((ma[1] + ly) * D.w + ma[0] + lx) * 4; if (D.ap[ia + 3] < 128) continue;
    if (A.b + A.add + D.mp[ia] / 4 < B.b - 0.5 || B.b + B.add + D.mp[ib] / 4 < A.b - 0.5) return false;
  }
  return true;
}
function hLayers() {
  const P = HLY.p, F = HL.f.f, on = P.length > 1 && sunTone().day > 0, by = [];
  HLY.c = []; HLY.xn = 0;
  if (on) {
    const tn = Math.tan(sunEl()), dx = Math.cos(SUN.az), dy = Math.sin(SUN.az);
    for (const p of P) {
      const o = p.i * HQ, s = F[o] * dx + F[o + 1] * dy, t = F[o + 1] * dx - F[o] * dy, es = Math.abs(F[o + 2] * dx + F[o + 3] * dy) + Math.abs(F[o + 4] * dx + F[o + 5] * dy), et = Math.abs(F[o + 3] * dx - F[o + 2] * dy) + Math.abs(F[o + 5] * dx - F[o + 4] * dy);
      p.f = [s - es - Math.min(p.hi / tn, 720), s + es, t - et, t + et]; p.c = 0; let m = 0;
      for (const r of P) { if (r === p) break; if (!(m & 1 << r.c) && r.f[0] < p.f[1] && p.f[0] < r.f[1] && r.f[2] < p.f[3] && p.f[2] < r.f[3] && !(r.o === p.o ? partsMeet(r.q, p.q) : Math.abs(r.b - p.b) <= 0.5)) m |= 1 << r.c; }
      while (p.c < LCH - 1 && m & 1 << p.c) p.c++;
      if (p.c) (by[p.c] = by[p.c] || []).push(p);
    }
  }
  const cp = (L, i) => L.f.set(F.subarray(i * HQ, i * HQ + HQ), hgrow(L));
  for (const p of P) if (!on || !p.c) cp(p.k ? HL.a : HL.u, p.i);
  if (on) { const dx = Math.cos(SUN.az), dy = Math.sin(SUN.az);
    for (const L of by) if (L) {
      const s = HL.x.n, R = [];
      for (const p of L) {
        cp(HL.x, p.i); if (p.k) cp(HL.k, p.i); const b = [1e9, 1e9, -1e9, -1e9];
        for (const u of [p.f[0], p.f[1]]) for (const v of [p.f[2], p.f[3]]) { const x = u * dx - v * dy, y = u * dy + v * dx; b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
        R.push(b);
      }
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], b = R[j]; if (a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]) { a[0] = Math.min(a[0], b[0]); a[1] = Math.min(a[1], b[1]); a[2] = Math.max(a[2], b[2]); a[3] = Math.max(a[3], b[3]); R.splice(j, 1); j = i; } }     // overlapping regions joined
      HLY.c.push({ s, n: HL.x.n - s, R });
    }
    HLY.xn = HL.x.n;
  }
  HLY.p = []; HL.f.n = 0;
}
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
  hLayers();
}
/* the height quads' program, X (scale, offset) to the target's px, F its size; hInst: the per-quad attributes on / off */
function hBegin(S, X, F) { const { gl } = S; gl.useProgram(S.HP); gl.uniform3f(S.HU.X, ...X); gl.uniform2f(S.HU.F, ...F); gl.uniform1f(S.HU.MM, 0); gl.bindBuffer(gl.ARRAY_BUFFER, S.quad); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0); hInst(S, 1); }
function hInst(S, on) { const { gl, IA } = S; for (let i = 1; i <= HQ / 4; i++) { if (on) gl.enableVertexAttribArray(i); else gl.disableVertexAttribArray(i); IA.vertexAttribDivisorANGLE(i, on ? 1 : 0); } }
function hUp(S, ns) { const { gl } = S; for (const n of ns) if (HL[n].n) { gl.bindBuffer(gl.ARRAY_BUFFER, S.ib[n]); gl.bufferData(gl.ARRAY_BUFFER, HL[n].f.subarray(0, HL[n].n * HQ), gl.STREAM_DRAW); } }
function hDraw(S, n, s = 0, c = HL[n].n) { const { gl, IA } = S; if (!c) return; gl.bindBuffer(gl.ARRAY_BUFFER, S.ib[n]); for (let i = 1; i <= HQ / 4; i++) gl.vertexAttribPointer(i, 4, gl.FLOAT, false, HQ * 4, (s * HQ + (i - 1) * 4) * 4); IA.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, c); }     // c quads from the s-th
/* what the memory keeps: a and k MAX, w over (what's there is inside the walls), t MAX */
function hKept(S) { const { gl, MX } = S; gl.blendEquation(MX.MAX_EXT); gl.enable(gl.BLEND); hDraw(S, 'a'); hDraw(S, 'k'); gl.disable(gl.BLEND); hDraw(S, 'w'); gl.enable(gl.BLEND); hDraw(S, 't'); gl.disable(gl.BLEND); }
/* the quads (uploaded once, one buffer per list) into the height texture HT (box cleared, then a MAX, w over, t MAX)
   and the materials MT (depth: the highest top wins); fog: into the memory's heights where you see, then read back for
   out of sight (HTS) */
function sunDrawHeights(S, X, box, fog, vw) {
  const { gl, MX } = S, lists = ['a', 'u', 'w', 't', 'm', 'x'], draw = n => hDraw(S, n);     // x: the channels past the first, into HT after the frame's sweep (sunLayers)
  hBegin(S, X, [S.fw, S.fh]); hUp(S, [...lists, 'k']);
  gl.viewport(0, 0, S.fw, S.fh); gl.scissor(...box); gl.clearColor(0, 0, 0, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.FB); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.blendEquation(MX.MAX_EXT); gl.enable(gl.BLEND); draw('a'); pipe('gpu-h', { l: 'a' }); draw('u'); pipe('gpu-h', { l: 'u' }); gl.disable(gl.BLEND); draw('w'); pipe('gpu-h', { l: 'w' }); gl.enable(gl.BLEND); draw('t'); gl.disable(gl.BLEND); pipe('gpu-h', { l: 't' });
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.FM); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.uniform1f(S.HU.MM, 1);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); for (const n of lists) draw(n); gl.disable(gl.DEPTH_TEST); pipe('gpu-mat');
  if (fog) { memStamp(S, vw); memRecall(S, vw, X, box); pipe('gpu-hs'); }     // the remembered things alone
  hInst(S, 0);
  if (M.dev) DEV.nq = lists.reduce((a, n) => a + HL[n].n, 0);
  for (const n in HL) HL[n].n = 0;
}
/* the memory's heights (one per fog memory, the size of its picture: the map at FOGK): what it keeps (walls, trees,
   roofs, hay, fences, sandbags, wrecks) as last seen, the map as it starts where you've never looked. Out of sight the
   shadows are swept from these with the sun as it is now: they move with the day and show nothing you haven't seen (a
   wall that fell out of sight still casts until you look) */
function memOf(S, vw) {
  const { gl } = S, m = fogMemory(vw), W = m.c.width, H = m.c.height;
  for (const [k, e] of S.mem) if (!M.fogMem || M.fogMem[k] !== e.m) { gl.deleteTexture(e.t); gl.deleteFramebuffer(e.fb); gl.deleteRenderbuffer(e.sb); S.mem.delete(k); }
  let e = S.mem.get(m.key); if (e) return e;
  gl.activeTexture(gl.TEXTURE5); const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.activeTexture(gl.TEXTURE0);
  const fb = gl.createFramebuffer(), sb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, sb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, W, H);     // depth + stencil: the pairing every WebGL takes
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, sb);
  e = { m, t, fb, sb, W, H }; S.mem.set(m.key, e);
  // the whole map as it starts (its own lists, left empty for the frame's)
  const hm = HMAT, hx = HMAX; sunHeights(() => true, () => true, vw); hBegin(S, [FOGK, 0, 0], [W, H]); hUp(S, ['a', 'w', 't', 'k']);
  gl.viewport(0, 0, W, H); gl.scissor(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); hKept(S); hInst(S, 0);
  for (const n in HL) HL[n].n = 0; HLY.c = []; HLY.xn = 0; HMAT = hm; HMAX = hx; gl.bindFramebuffer(gl.FRAMEBUFFER, S.out);
  return e;
}
/* where you see (the sight polygons: a fan from each one's eye, each wall strip from its first corner; marked in the
   stencil and cleared), what the memory keeps as it is now */
function memStamp(S, vw) {
  const { gl } = S, e = memOf(S, vw), { polys, eyes } = vw._fog; let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const put = (...T) => { if (n + 6 > S.pv.length) { const g = new Float32Array(S.pv.length * 2); g.set(S.pv); S.pv = g; } for (const v of T) { S.pv[n++] = v[0]; S.pv[n++] = v[1]; x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]); } };
  polys.forEach((P, j) => { for (let i = 0; i < P.length; i++) put(eyes[j], P[i], P[(i + 1) % P.length]); for (const T of P.strips || []) for (let i = 1; i + 1 < T.length; i++) put(T[0], T[i], T[i + 1]); });
  const bx = Math.max(0, Math.floor(x0 * FOGK) - 1), by = Math.max(0, Math.floor(y0 * FOGK) - 1), bw = Math.min(e.W, Math.ceil(x1 * FOGK) + 1) - bx, bh = Math.min(e.H, Math.ceil(y1 * FOGK) + 1) - by;
  if (!n || bw <= 0 || bh <= 0) return;
  gl.bindFramebuffer(gl.FRAMEBUFFER, e.fb); gl.viewport(0, 0, e.W, e.H); gl.scissor(bx, by, bw, bh);
  gl.enable(gl.STENCIL_TEST); gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT); gl.stencilFunc(gl.ALWAYS, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
  hInst(S, 0); gl.useProgram(S.PP); gl.uniform3f(S.PU.X, FOGK, 0, 0); gl.uniform2f(S.PU.F, e.W, e.H);
  gl.bindBuffer(gl.ARRAY_BUFFER, S.pb); gl.bufferData(gl.ARRAY_BUFFER, S.pv.subarray(0, n), gl.STREAM_DRAW); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, n / 2);
  gl.stencilFunc(gl.EQUAL, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP); hBegin(S, [FOGK, 0, 0], [e.W, e.H]); hKept(S); gl.disable(gl.STENCIL_TEST);
}
/* the memory's heights read back into HTS over the view's box (buffer px by X) */
function memRecall(S, vw, X, box) {
  const { gl, RU } = S, e = memOf(S, vw); hInst(S, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.FBS); gl.viewport(0, 0, S.fw, S.fh); gl.scissor(...box);
  gl.useProgram(S.RC); gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, e.t); gl.activeTexture(gl.TEXTURE0);
  gl.uniform3f(RU.X, ...X); gl.uniform2f(RU.F, e.W, e.H); gl.uniform1f(RU.Z, FOGK);
  gl.bindBuffer(gl.ARRAY_BUFFER, S.tri); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.out);
}
/* the sweep's passes (box: the height buffer's) from the heights on unit hu into the pair T (framebuffers FS), the last
   left on unit u for the light: enough doublings to reach the tallest thing's shadow (mxh / DH px; DH: how much lower a
   blocker reads per buffer px it's sunward). Each pass only over what the passes after it read (vrs: the boxes wanted in the
   buffer (the view; a channel's regions), each reaching sunward by their steps still to come; the last: those alone) */
function sunSweep(S, K, mxh, box, reg, vrs, T, FS, u, hu) {
  const { gl, SU } = S, DH = Math.tan(sunEl()) / K, len = mxh / DH, dx = Math.cos(SUN.az), dy = Math.sin(SUN.az), st = u === 6;
  gl.useProgram(S.SP); gl.uniform2f(SU.S, S.fw, S.fh); gl.uniform4f(SU.R, ...reg); gl.uniform2f(SU.D, dx, dy); gl.uniform1f(SU.DH, DH); gl.uniform1i(SU.H, hu); gl.uniform1i(SU.B, u);
  gl.bindBuffer(gl.ARRAY_BUFFER, S.tri); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.viewport(0, 0, S.fw, S.fh); gl.activeTexture(gl.TEXTURE0 + u);
  const N = [0]; for (let n = 1; n < len; n *= 2) N.push(n);
  let left = N.reduce((a, n) => a + n, 0);     // the reach still to come after each pass (N 0 reads 1 px)
  const pass = (n, t, f) => {
    gl.bindTexture(gl.TEXTURE_2D, t); gl.bindFramebuffer(gl.FRAMEBUFFER, f); if (gl.invalidateFramebuffer) gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.COLOR_ATTACHMENT0]);     // nothing kept from before (a tiler: no load)
    gl.uniform1f(SU.N, n);
    for (const vr of vrs) { const ex = dx * left, ey = dy * left, x0 = Math.max(box[0], Math.floor(vr[0] + Math.min(0, ex)) - 2), y0 = Math.max(box[1], Math.floor(vr[1] + Math.min(0, ey)) - 2);
      gl.scissor(x0, y0, Math.min(box[0] + box[2], Math.ceil(vr[0] + vr[2] + Math.max(0, ex)) + 2) - x0, Math.min(box[1] + box[3], Math.ceil(vr[1] + vr[3] + Math.max(0, ey)) + 2) - y0); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    if (u !== 9) pipe('gpu-sweep', { fb: f, n, st }); };
  let i = 0; pass(0, T[1], FS[0]);
  for (const n of N.slice(1)) { left -= n; pass(n, T[i], FS[i ^ 1]); i ^= 1; }
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.out); gl.bindTexture(gl.TEXTURE_2D, T[i]); gl.activeTexture(gl.TEXTURE0);
}
/* the channels past the first (hLayers): their quads into the frame's heights too (its surfaces, the point lights), then
   each alone: its heights (L2.H), swept over its regions in the view (L2.T), how far the top there is in its shadow into
   the channels' shade (L2.M, MAX), read with the frame's sweep (CP SWL). false: none in view. Units 8 up are the GL
   renderer's between frames (its textures and samplers): bound again here (L2u), and 10 before the maps */
function L2u(S) { const { gl, L2 } = S; [[8, L2.H], [9, L2.T[0]], [10, L2.M]].forEach(([u, t]) => { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t); if (gl.bindSampler) gl.bindSampler(u, null); }); gl.activeTexture(gl.TEXTURE0); }
function sunLayers(S, X, box, reg, vr, K, mxh) {
  const { gl, MX, L2 } = S; let any = false; L2u(S);
  hBegin(S, X, [S.fw, S.fh]); gl.viewport(0, 0, S.fw, S.fh); gl.scissor(...box); gl.blendEquation(MX.MAX_EXT); gl.enable(gl.BLEND);
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.FB); hDraw(S, 'x', 0, HLY.xn);
  gl.bindFramebuffer(gl.FRAMEBUFFER, L2.FM); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.disable(gl.BLEND);
  for (const c of HLY.c) {
    const rs = [];
    for (const r of c.R) { const x0 = Math.max(vr[0], Math.floor(r[0] * X[0] + X[1])), y0 = Math.max(vr[1], Math.floor(r[1] * X[0] + X[2])), x1 = Math.min(vr[0] + vr[2], Math.ceil(r[2] * X[0] + X[1])), y1 = Math.min(vr[1] + vr[3], Math.ceil(r[3] * X[0] + X[2])); if (x1 > x0 && y1 > y0) rs.push([x0, y0, x1 - x0, y1 - y0]); }
    if (!rs.length) continue;
    hBegin(S, X, [S.fw, S.fh]); gl.bindFramebuffer(gl.FRAMEBUFFER, L2.FH); gl.scissor(...box); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.BLEND); hDraw(S, 'x', c.s, c.n); gl.disable(gl.BLEND); hInst(S, 0);
    sunSweep(S, K, mxh, box, reg, rs, L2.T, L2.F, 9, 8);
    gl.useProgram(S.RS); gl.uniform2f(S.LU.S, S.fw, S.fh); gl.uniform4f(S.LU.R, ...reg); gl.bindFramebuffer(gl.FRAMEBUFFER, L2.FM); gl.viewport(0, 0, S.fw, S.fh); gl.enable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER, S.tri); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); for (const r of rs) { gl.scissor(...r); gl.drawArrays(gl.TRIANGLES, 0, 3); } gl.disable(gl.BLEND); any = true;
  }
  hInst(S, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, S.out);
  return any;
}
/* the sun down (sunTone day 0: sunlit = shade): nothing to sweep, the pair's first left as nothing blocking (skyline -64, no span) on unit u */
function sunNoSweep(S, box, T, FS, u) {
  const { gl } = S; gl.bindFramebuffer(gl.FRAMEBUFFER, FS[0]); gl.viewport(0, 0, S.fw, S.fh); gl.scissor(...box); gl.clearColor(0, 0, 1, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.out); gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, T[0]); gl.activeTexture(gl.TEXTURE0);
}
function drawSun(vw, vis, hidden, fogged) {     // fogged: vision on (the memory's light too, map 3)
  HS = LIGHT_Q[CFG.lightQ] || 0.5; gxYield();
  const S = _sun, { gl, GC, U, CU } = S, w = Math.ceil(cv.width * HS), h = Math.ceil(cv.height * HS), dpr = DPR, K = VZ * dpr * HS, k = dpr * HS;
  if (GC.width !== w * 2 || GC.height !== h * 2) { GC.width = w * 2; GC.height = h * 2; S.out = GL ? GC.fb : null; gxYield(); }     // the maps 2 × 2 (4 in a row outgrew phone GPUs' 8192 px)
  const rx = Math.floor(vw.x * dpr * HS), ry = Math.floor(vw.y * dpr * HS), rw = Math.min(w - rx, Math.ceil(vw.w * dpr * HS)), rh = Math.min(h - ry, Math.ceil(vw.h * dpr * HS));
  // the height buffer reaches past the view toward the sun by the longest shadow (64 px tall), so what's off screen
  // that side still throws its shadow in (no pop-in); the view sits at (px, py) in it
  const L = Math.min(64 / Math.tan(sunEl()), 720), dx = Math.cos(SUN.az) * L * K, dy = Math.sin(SUN.az) * L * K;
  const px = Math.ceil(Math.max(0, -dx)) + 2, py = Math.ceil(Math.max(0, -dy)) + 2, bw = rw + px + Math.ceil(Math.max(0, dx)) + 2, bh = rh + py + Math.ceil(Math.max(0, dy)) + 2;
  const size = (t, w, h) => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); };
  const attach = (f, t) => { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); };
  if (S.fw < rx + bw || S.fh < ry + bh) {     // the height and material targets grow only
    S.fw = Math.max(S.fw, rx + bw + 32); S.fh = Math.max(S.fh, ry + bh + 32);
    gl.activeTexture(gl.TEXTURE2); size(S.MT, S.fw, S.fh); gl.activeTexture(gl.TEXTURE4); for (const t of S.ST) size(t, S.fw, S.fh);
    gl.activeTexture(gl.TEXTURE6); for (const t of S.SS) size(t, S.fw, S.fh); gl.activeTexture(gl.TEXTURE7); size(S.HTS, S.fw, S.fh); gl.activeTexture(gl.TEXTURE0); size(S.HT, S.fw, S.fh);
    S.ST.forEach((t, i) => attach(S.FS[i], t)); S.SS.forEach((t, i) => attach(S.FSS[i], t)); attach(S.FBS, S.HTS);
    gl.bindRenderbuffer(gl.RENDERBUFFER, S.DB); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, S.fw, S.fh);
    if (S.ly) { const L2 = S.L2; gl.activeTexture(gl.TEXTURE8); size(L2.H, S.fw, S.fh); gl.activeTexture(gl.TEXTURE9); for (const t of L2.T) size(t, S.fw, S.fh); gl.activeTexture(gl.TEXTURE10); size(L2.M, S.fw, S.fh); gl.activeTexture(gl.TEXTURE0); attach(L2.FH, L2.H); L2.T.forEach((t, i) => attach(L2.F[i], t)); attach(L2.FM, L2.M); }
    attach(S.FB, S.HT); attach(S.FM, S.MT); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, S.DB);
  }
  S.pr = { rx, ry, rw, rh, px, py, w, h };     // the view's place in the buffers (pipeline viewer)
  if (S.lw !== w || S.lh !== h) { S.lw = w; S.lh = h; gl.activeTexture(gl.TEXTURE3); size(S.LT, w, h); gl.activeTexture(gl.TEXTURE0); attach(S.FL, S.LT); }
  // heights and materials (buffer px = (world x VZ + VOX) x k + pad)
  gl.enable(gl.SCISSOR_TEST); HMAT = 0; HMAX = 0;
  const fog = vw._fog && fogged && !SUNDBG ? 1 : 0;
  gl.useProgram(S.CP); gl.uniform1f(S.CU.FG, 0);
  sunHeights((x, y, r) => vis(x, y, r + L), hidden, vw); pipe('cpu-heights', { n: { a: HL.a.n, u: HL.u.n, w: HL.w.n, t: HL.t.n, m: HL.m.n } });
  if (fog) memOf(S, vw);     // a new memory: the map as it starts, before this frame's lists
  const X = [VZ * k, VOX * k + px, VOY * k + py], box = [rx, ry, bw, bh], vr = [rx + px, ry + py, rw, rh];
  sunDrawHeights(S, X, box, fog, vw);
  const reg = [rx + 0.5, ry + 0.5, rx + bw - 0.5, ry + bh - 0.5], mxh = Math.min(64, HMAX + 1);
  const up = sunTone().day > 0, sweep = (T, F, u, hu) => up ? sunSweep(S, K, mxh, box, reg, [vr], T, F, u, hu) : sunNoSweep(S, box, T, F, u);
  sweep(S.ST, S.FS, 4, 0);
  if (fog) sweep(S.SS, S.FSS, 6, 7);     // the remembered things' shadows, for out of sight
  const ly = up && S.ly && HLY.c.length > 0 && sunLayers(S, X, box, reg, vr, K, mxh); HLY.c = [];     // what floats past the first channel (hLayers)
  // the light, once (into LT)
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.FL); gl.viewport(0, 0, w, h); gl.scissor(rx, h - ry - rh, rw, rh);
  gl.useProgram(S.P); gl.bindBuffer(gl.ARRAY_BUFFER, S.tri); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const el = sunEl(), ce = Math.cos(el), Ld = [Math.cos(SUN.az) * ce, Math.sin(SUN.az) * ce, Math.sin(el)];
  gl.uniform2f(U.S, S.fw, S.fh); gl.uniform2f(U.P, px, py); gl.uniform1f(U.V, h); gl.uniform4f(U.R, ...reg); gl.uniform1f(U.K, K);
  gl.uniform3f(U.L, ...Ld); gl.uniform1f(U.HZ, M.rain ? 0.15 : 0);
  S.pk.fill(0); S.pd.fill(0); const LN = S.ln = lightsNow(vis); if (!devOff('add')) LN.forEach((l, i) => { S.pl.set([(VZ * l.x + VOX) * k + px, (VZ * l.y + VOY) * k + py, l.r, l.h], i * 4); if (l.d) S.pd.set(l.d.length > 3 ? l.d : [...l.d, 1], i * 4); S.pk[i] = l.k; S.pc.set(l.c || LCOL, i * 3); });
  gl.uniform4fv(U.PL, S.pl); gl.uniform4fv(U.PD, S.pd); gl.uniform1fv(U.PK, S.pk); gl.uniform3fv(U.PC, S.pc);
  const light = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, S.FL); gl.viewport(0, 0, w, h); gl.scissor(rx, h - ry - rh, rw, rh); gl.useProgram(S.P); gl.bindBuffer(gl.ARRAY_BUFFER, S.tri); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindFramebuffer(gl.FRAMEBUFFER, S.out); };
  if (S.pk[0] > 0) light(); else { gl.bindFramebuffer(gl.FRAMEBUFFER, S.FL); gl.viewport(0, 0, w, h); gl.scissor(rx, h - ry - rh, rw, rh); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.bindFramebuffer(gl.FRAMEBUFFER, S.out); }     // no point lights: none to march
  pipe('gpu-light', { n: LN.length });
  // the maps
  if (S.ly) L2u(S);
  gl.useProgram(S.CP);
  gl.uniform2f(CU.S, S.fw, S.fh); gl.uniform2f(CU.P, px, py); gl.uniform1f(CU.V, h); gl.uniform4f(CU.R, ...reg); gl.uniform1f(CU.K, K); gl.uniform2f(CU.G, w, h);
  gl.uniform3f(CU.L, ...Ld); const T = sunTone(); gl.uniform3f(CU.C, ...T.sh); gl.uniform3f(CU.LI, ...T.li); gl.uniform3f(CU.W, ...T.w); gl.uniform3f(CU.SKY, ...T.sky);
  gl.uniform1f(CU.TM, M.time); gl.uniform1f(CU.BL, HMAT & 2 ? 0.9 : 0); gl.uniform3f(CU.WX, VOX * k + px, VOY * k + py, VZ * k);
  const E = MAP.tiled && MAP.tiled.roof ? viewSols(vw).map(posOf).slice(0, 4) : []; S.ev.fill(0); E.forEach((o, i) => { S.ev[i * 2] = o.x; S.ev[i * 2 + 1] = o.y; }); gl.uniform4fv(CU.E, S.ev); gl.uniform1f(CU.EN, E.length); gl.uniform1f(CU.RF, vw.rf || 0); gl.uniform1f(CU.LB, S.pk[0] > 0 ? 1 : 0); gl.uniform1f(CU.LY, ly ? 1 : 0);
  const add = S.pk[0] > 0 || HMAT || M.rain, maps = SUNDBG ? [[3, 0, 1, 2, 4, 5, 6][SUNDBG - 1]] : add ? [0, 1, 2] : [0, 1];
  const at = n => [(n & 1) * w + rx, (n >> 1) * h + ry];     // map n's view in GC (canvas pixels): 0 1 / 2 3
  const map = (q, n) => { const o = (n & 1) * w, oy = (1 - (n >> 1)) * h; gl.viewport(o, oy, w, h); gl.scissor(o + rx, oy + h - ry - rh, rw, rh); gl.uniform2f(CU.O, o, oy); gl.uniform1f(CU.Q, q); gl.drawArrays(gl.TRIANGLES, 0, 3); pipe('gpu-map', { q, o }); };
  maps.forEach((q, n) => map(q, n));
  if (fog) { gl.uniform1f(CU.FG, 1); map(0, 3); }     // the memory's shade, map 3 (out of sight: fogOverlay): what it keeps, no point lights
  gxYield(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
  const to = [vw.x * DPR, vw.y * DPR, vw.w * DPR, vw.h * DPR];
  if (SUNDBG) ctx.drawImage(GC, ...at(0), rw, rh, ...to);       // dev: 1 heights, 2 shade, 3 highlights, 4 glow, 5 materials, 6 sun shadow, 7 point lights
  else if (ctx.lightComp) { ctx.lightComp(GC, [at(0), at(1), at(2)], rw, rh, to, [!devOff('shade'), !devOff('hi'), add && !devOff('add')]); pipe('comp', { m: 'all' }); }     // GL: the three in one pass
  else { ctx.globalCompositeOperation = 'multiply'; if (!devOff('shade')) ctx.drawImage(GC, ...at(0), rw, rh, ...to); pipe('comp', { m: 'multiply' }); ctx.globalCompositeOperation = 'color-dodge'; if (!devOff('hi')) ctx.drawImage(GC, ...at(1), rw, rh, ...to); pipe('comp', { m: 'color-dodge' }); if (add && !devOff('add')) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(GC, ...at(2), rw, rh, ...to); pipe('comp', { m: 'lighter' }); } }
  ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false; worldT();
  S.fog = fog && !devOff('shade') ? [...at(3), rw, rh, ...to] : null;     // the memory's shade map (fogOverlay)
  S.lit = !SUNDBG && !devOff('shade') ? [...at(0), rw, rh] : null;     // the frame's (smoke is lit by it)     // the memory's shade map (fogOverlay)
  if (M.dev && DEV.stats) { const e = gl.getError(); if (e) devLog('GL ERROR ' + e, '#ff5a45'); S.dg = `GC ${GC.width}×${GC.height} BUF ${gl.drawingBufferWidth}×${gl.drawingBufferHeight} · MAPS ${maps.join('')} · ADD ${add ? 1 : 0}`; }
}
