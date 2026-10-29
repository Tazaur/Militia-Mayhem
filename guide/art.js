/* Field manual: the game's own art (atlas.png + atlas_m.png + atlas.json from the site root), the part stacking ported
   from 5e_light.js (hUnder / hpart / partsOf), the CPU version of the sun (height buffer -> sweep shadows, slope light),
   the LAYERS view (an exploded draw stack of a little battle) and the HEIGHTS view (every pixel a column). */
const ART = { ok: false, cb: [] };
ART.ready = f => ART.ok ? f() : ART.cb.push(f);
(function load() {
  const im = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const js = u => fetch(u).then(r => r.json());
  Promise.all([im('../atlas.png'), im('../atlas_m.png'), js('../atlas.json'), js('../atlas_extra.json')]).then(([img, mat, A, X]) => {
    const w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(mat, 0, 0); const mp = g.getImageData(0, 0, w, h).data; g.clearRect(0, 0, w, h); g.drawImage(img, 0, 0); const ap = g.getImageData(0, 0, w, h).data;
    // the atlas's table: JSON in atlas_m's last rows (2 length bytes then UTF-8 over G / B, bottom row first) — atlasCfg
    let cfg = {};
    try {
      const at = k => { const y = h - 1 - (k / w | 0), i = (y * w + k % w) * 4; return [mp[i + 1], mp[i + 2]]; };
      const n = at(0)[0] << 8 | at(0)[1], b = new Uint8Array(n + 3);
      for (let k = 0; k < (n + 2) / 2; k++) b.set(at(k), k * 2);
      const o = JSON.parse(new TextDecoder().decode(b.subarray(2, 2 + n))); if (o && o.v === 2) cfg = o;
    } catch (e) { }
    const P = A._pool; for (const [n, r] of Object.entries(cfg.under || {})) A['under_' + n] = [r[0], P[1] + r[1], r[2], r[3], r[4], r[5]];
    Object.assign(ART, { ok: true, img, mat, A, X, mp, ap, w, h, cfg, USE: cfg.use || {} });
    ART.cb.forEach(f => f()); ART.cb = [];
  }).catch(e => { console.warn('atlas', e); ART.fail = true; ART.cb.forEach(f => { try { f(); } catch (x) { } }); });
})();
/* draw sprite n with its pivot at (x, y), turned a, scaled s; fy -1 mirrors it (the left track) */
function sprDraw(g, n, x, y, a = 0, s = 1, al = 1, fy = 1) {
  const m = ART.A && ART.A[n]; if (!m) return;
  g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s * fy); if (al < 1) g.globalAlpha *= al;
  g.drawImage(ART.img, m[0], m[1], m[2], m[3], -m[4], -m[5], m[2], m[3]); g.restore();
}
/* sprite n as a small canvas (cached), optionally tinted for a team decal */
const _icn = new Map();
function sprCanvas(n, tint) {
  const k = n + '|' + (tint || ''); if (_icn.has(k)) return _icn.get(k);
  const m = ART.A[n], c = document.createElement('canvas'); c.width = m[2]; c.height = m[3]; const g = c.getContext('2d');
  g.drawImage(ART.img, m[0], m[1], m[2], m[3], 0, 0, m[2], m[3]);
  if (tint) { g.globalCompositeOperation = 'multiply'; g.fillStyle = tint; g.fillRect(0, 0, m[2], m[3]); g.globalCompositeOperation = 'destination-in'; g.drawImage(ART.img, m[0], m[1], m[2], m[3], 0, 0, m[2], m[3]); }
  _icn.set(k, c); return c;
}
/* a sprite fitted in a box, centred (for cards and tables) */
function sprFit(g, n, x, y, w, h, a = 0, mx = 9) {
  const m = ART.A && ART.A[n]; if (!m) return; const s = Math.min(w / m[2], h / m[3], mx);
  g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(a); g.scale(s, s); g.drawImage(ART.img, m[0], m[1], m[2], m[3], -m[2] / 2, -m[3] / 2, m[2], m[3]); g.restore();
}
/* ---------- heights (5e_light: artH / artMax / hUnder / hpart) ---------- */
const painted = (m, x, y) => ART.ap[((m[1] + y) * ART.w + m[0] + x) * 4 + 3] >= 128;
const heightPx = (m, x, y) => ART.mp[((m[1] + y) * ART.w + m[0] + x) * 4] / 4;
function artH(n, lx, ly) {
  const m = ART.A[n]; if (!m) return 0; const L = Math.hypot(lx, ly), st = L > 1 ? 1 / L : 1;
  for (let f = 1; f > 0; f -= st) { const x = Math.floor(m[4] + lx * f), y = Math.floor(m[5] + ly * f); if (x < 0 || y < 0 || x >= m[2] || y >= m[3]) continue; if (painted(m, x, y)) return heightPx(m, x, y); }
  return 0;
}
const _amx = new Map();
function artMax(n, all) {
  all = all || n.startsWith('under_'); const k = (all ? '_' : '') + n; if (_amx.has(k)) return _amx.get(k);
  const m = ART.A[n]; let v = 0; if (m) for (let y = 0; y < m[3]; y++) for (let x = 0; x < m[2]; x++) if (all || painted(m, x, y)) v = Math.max(v, heightPx(m, x, y));
  _amx.set(k, v); return v;
}
const SUNP = { tur_gun: { lift: 4 } }, SUNB = { mgNest: 10, stand: 18, jump: 4 };
const sunP = n => SUNP[n] || SUNP[n.replace(/\d+$/, '')] || {};
/* a thing's parts, bottom up; each starts on the painted height of the kept parts under its rest point (3 x 3 px) */
function stackParts(o) {
  const stk = [], out = [], A = ART.A;
  const hUnder = (x, y) => { let b = 0; for (const q of stk) { const m = A[q.n], c = Math.cos(q.a), s = Math.sin(q.a); for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const dx = x + i - q.x, dy = y + j - q.y, lx = Math.floor(m[4] + dx * c + dy * s), ly = Math.floor(m[5] - (dx * s - dy * c) * q.fy); if (lx < 0 || ly < 0 || lx >= m[2] || ly >= m[3]) continue; if (painted(m, lx, ly)) b = Math.max(b, q.b + q.add + heightPx(m, lx, ly)); } } return b; };
  const hpart = (n, x, y, a, p = {}) => {
    if (!A[n]) return; const P = sunP(n), u = ART.USE[n], un = u && A[u] ? u : null, rest = Math.round(hUnder(p.rx ?? x, p.ry ?? y)), f = Math.max(p.min || 0, rest);
    const q = { n, x, y, a, rest: f, under: un ? artMax(un, true) : 0, lift: P.lift || 0, b: f + (un ? artMax(un, true) : 0) + (P.lift || 0), add: (p.add || 0), fy: p.fy || 1, who: p.who, un, at: p.at || [0, 0], keep: !!p.keep, why: p.why || '' };
    if (p.keep) stk.push(q); out.push(q);
  };
  const W = (lx, ly) => [o.x + lx * Math.cos(o.a) - ly * Math.sin(o.a), o.y + lx * Math.sin(o.a) + ly * Math.cos(o.a)];
  if (o.type === 'tank') {
    const px = o.x - 4 * Math.cos(o.a), py = o.y - 4 * Math.sin(o.a), kick = (o.recoil || 0) * 20;
    for (const i of [0, 1]) { const n = 'track0', m = A[n], fy = i ? 1 : -1, lx = 0.3 + m[4] - m[2] / 2, ly = [-23.5, 24.5][i] + fy * (m[5] - m[3] / 2); const [x, y] = W(lx, ly); hpart(n, x, y, o.a, { fy, at: [lx, ly], why: 'on the hull\'s underside' }); }
    hpart('hull0', o.x, o.y, o.a, { keep: 1, why: 'kept: others stand on it' });
    if (o.crew) for (const sd of [-17, 17]) { const [x, y] = W(-30, sd); hpart('sol_sit', x, y, o.ta, { who: 1, why: 'rider on the deck' }); }
    hpart('tur_gun', px - Math.cos(o.ta) * kick, py - Math.sin(o.ta) * kick, o.ta, { rx: px, ry: py, why: 'rests under the turret pivot, +4 air gap' });
    hpart('tur', px, py, o.ta, { keep: 1, why: 'kept: on the hull' });
    const r = o.ta - o.a, c = Math.cos(r), s = Math.sin(r), [sx, sy] = W(-4 - 8 * c - 5 * s, -8 * s + 5 * c), mx = sx + Math.cos(o.mgA) * 4, my = sy + Math.sin(o.mgA) * 4;
    hpart('mg', mx, my, o.mgA, { rx: sx, ry: sy, why: 'on the cupola mount' });
    if (o.crew) hpart('sol_sit', sx, sy, o.mgA, { who: 1, why: 'gunner in the cupola' });
  } else if (o.type === 'jeep') {
    const c = Math.cos(o.a), s = Math.sin(o.a), [wx, wy] = ART.X.jeepWells[0];
    for (const sd of [-1, 1]) hpart('jeep_tire', o.x + c * wx - s * wy * sd, o.y + s * wx + c * wy * sd, o.a + (o.steer || 0), { why: 'front tyre, steers' });
    hpart('jeep0', o.x, o.y, o.a, { keep: 1, why: 'kept: on its underside' });
    if (o.crew) for (const sd of [-8, 8]) { const [x, y] = W(-1, sd); hpart('sol_sit', x, y, o.a, { who: 1, why: sd < 0 ? 'driver' : 'passenger' }); }
    const [kx, ky] = W(-22, 0), mx = kx + Math.cos(o.mgA) * 4, my = ky + Math.sin(o.mgA) * 4;
    hpart('mg', mx, my, o.mgA, { rx: kx, ry: ky, why: 'on its post' });
    if (o.crew) hpart('sol_sit', kx, ky, o.mgA, { add: 18, who: 1, why: 'gunner stands in the bed (+18)' });
  } else {
    const up = Math.round(SUNB.jump * (o.jump || 0));
    if (o.stance === 2) { hpart('sol_leg0', o.x, o.y, o.a, { min: up, why: 'prone legs' }); hpart('sol_stand', o.x, o.y, o.a, { min: up, why: 'prone body' }); }
    else hpart(o.pose || 'sol_stand', o.x, o.y, o.a, { min: up, add: SUNB.stand, why: 'legs under him: +18 solid' });
  }
  return out;
}
const topOf = P => P.reduce((t, q) => q.who ? t : Math.max(t, q.b + q.add + artMax(q.n)), 0);

/* ---------- the little battle used by LAYERS (world 320 x 220 px) ---------- */
const SC = { W: 320, H: 220 };
const SCENE = {
  tank: { type: 'tank', x: 172, y: 120, a: -0.25, ta: -0.25, mgA: 0.6, crew: 0 },
  jeep: { type: 'jeep', x: 72, y: 168, a: 0.35, mgA: -0.4, crew: 1 },
  sols: [{ x: 86, y: 78, a: 0.2, pose: 'sol_stand', team: '#345cf2' }, { x: 110, y: 96, a: -0.1, pose: 'sol_rpg', team: '#345cf2' }, { x: 270, y: 186, a: -2.6, pose: 'sol_stand', team: '#e02c26' }, { x: 288, y: 150, a: 2.9, pose: 'sol_nogun', team: '#e02c26' }],
  dead: [{ x: 240, y: 58, a: 1.1 }],
  crates: [{ x: 40, y: 44, a: 0.3 }],
  bags: [{ x: 128, y: 70, a: 0 }],
  trees: [{ x: 292, y: 52, r: 19 }, { x: 22, y: 116, r: 15 }],
  house: { x: 236, y: 10, w: 64, h: 30 },
  eye: [100, 96]
};
/* ground: grass with specks, a dirt road, its edges — like paintGround */
function paintGroundTo(g) {
  const R = mulberry(7); g.fillStyle = '#137a12'; g.fillRect(0, 0, SC.W, SC.H);
  for (let i = 0; i < 26; i++) { const x = R() * SC.W, y = R() * SC.H, r = 14 + R() * 30, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, R() < 0.5 ? 'rgba(8,80,8,.35)' : 'rgba(40,130,30,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  for (let i = 0; i < 700; i++) { g.fillStyle = ['#0f6e0e', '#18871a', '#0b5e0b'][i % 3]; g.fillRect(R() * SC.W | 0, R() * SC.H | 0, 1, 1); }
  g.fillStyle = '#8a6a3a'; g.beginPath(); g.moveTo(0, 128); g.bezierCurveTo(110, 100, 210, 150, 320, 112); g.lineTo(320, 150); g.bezierCurveTo(210, 188, 110, 138, 0, 166); g.fill();
  for (let i = 0; i < 300; i++) { const x = R() * SC.W, y = 108 + R() * 60; g.fillStyle = R() < 0.5 ? '#7a5c30' : '#9a784a'; g.fillRect(x | 0, y | 0, 2, 1); }
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(SCENE.house.x - 2, SCENE.house.y - 2, SCENE.house.w + 4, SCENE.house.h + 4);
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function paintDecalsTo(g) {
  // a scorch (radial gradient burnt in), blood, tank treads every 5 px, footprints
  const s = g.createRadialGradient(214, 196, 0, 214, 196, 26); s.addColorStop(0, 'rgba(20,14,8,.85)'); s.addColorStop(0.6, 'rgba(30,22,12,.45)'); s.addColorStop(1, 'rgba(30,22,12,0)'); g.fillStyle = s; g.fillRect(180, 160, 70, 70);
  g.fillStyle = 'rgba(110,8,8,.75)'; for (const [x, y, r] of [[244, 62, 9], [252, 66, 5], [236, 54, 4]]) { g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0.5, 0, TAU); g.fill(); }
  const t = SCENE.tank; g.fillStyle = 'rgba(40,30,15,.35)';
  for (let d = 40; d < 190; d += 5) for (const sd of [-23, 24]) { const x = t.x - Math.cos(t.a) * d - Math.sin(t.a) * sd, y = t.y - Math.sin(t.a) * d + Math.cos(t.a) * sd; g.save(); g.translate(x, y); g.rotate(t.a); g.fillRect(-1.5, -6, 3, 12); g.restore(); }
  g.fillStyle = 'rgba(30,24,10,.3)'; for (let i = 0; i < 9; i++) { const x = 60 + i * 9, y = 60 + i * 3 + (i % 2) * 5; g.fillRect(x, y, 3, 2); }
}
function drawParts(g, P, al = 1) { for (const q of P) sprDraw(g, q.n, q.x, q.y, q.a, 1, al, q.fy); }
function treeDraw(g, t) {
  for (const [k, c] of [[1, '#0d4f10'], [0.78, '#16661a'], [0.52, '#22802a'], [0.26, '#3a9a3a']]) { g.fillStyle = c; g.beginPath(); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, r = t.r * k * (0.86 + 0.14 * Math.sin(i * 2.7)); g.lineTo(t.x + Math.cos(a) * r - k * 3, t.y + Math.sin(a) * r - k * 3); } g.fill(); }
}
function crateDraw(g, c) { g.save(); g.translate(c.x, c.y); g.rotate(c.a); g.fillStyle = '#7a5a2c'; g.fillRect(-8, -8, 16, 16); g.strokeStyle = '#4a3416'; g.lineWidth = 1.5; g.strokeRect(-7, -7, 14, 14); g.beginPath(); g.moveTo(-7, -7); g.lineTo(7, 7); g.stroke(); g.restore(); }
function solDraw(g, s) {
  g.strokeStyle = s.team; g.globalAlpha = 0.8; g.lineWidth = 1.4; g.beginPath(); g.ellipse(s.x, s.y, 10, 8, 0, 0, TAU); g.stroke(); g.globalAlpha = 1;
  sprDraw(g, s.pose, s.x, s.y, s.a);
  g.fillStyle = s.team; g.save(); g.translate(s.x, s.y); g.rotate(s.a); g.fillRect(-3, -6, 3, 2); g.restore();
}
/* height buffer of the scene (like the GPU's HT: every solid px its top), at scale k */
function sceneHeights(k, parts) {
  const W = Math.ceil(SC.W * k), H = Math.ceil(SC.H * k), T = new Float32Array(W * H), A = ART.A;
  const put = (x, y, h) => { const i = Math.floor(y * k) * W + Math.floor(x * k); if (x >= 0 && y >= 0 && x < SC.W && y < SC.H && T[i] < h) T[i] = h; };
  for (const q of parts) {
    const m = A[q.n]; if (!m) continue; const c = Math.cos(q.a), s = Math.sin(q.a), st = Math.min(1, 1 / k / 1.5);
    for (let y = 0; y < m[3]; y += st) for (let x = 0; x < m[2]; x += st) { const xi = x | 0, yi = y | 0; if (!painted(m, xi, yi)) continue; const lx = x - m[4], ly = (y - m[5]) * q.fy; put(q.x + lx * c - ly * s, q.y + lx * s + ly * c, q.b + q.add + heightPx(m, xi, yi)); }
  }
  for (const t of SCENE.trees) for (let y = -t.r; y <= t.r; y += 1 / k) for (let x = -t.r; x <= t.r; x += 1 / k) { const d = Math.hypot(x, y) / t.r; if (d < 1) put(t.x + x, t.y + y, 36 + 20 * Math.sqrt(1 - d * d)); }
  for (const c of SCENE.crates) for (let y = -8; y <= 8; y += 1 / k) for (let x = -8; x <= 8; x += 1 / k) put(c.x + x * Math.cos(c.a) - y * Math.sin(c.a), c.y + x * Math.sin(c.a) + y * Math.cos(c.a), 10);
  const hz = SCENE.house; for (let y = hz.y; y < hz.y + hz.h; y += 1 / k) for (let x = hz.x; x < hz.x + hz.w; x += 1 / k) put(x, y, 40);
  return { T, W, H, k };
}
/* the sun on the CPU: shadowed if something toward the sun rises over the ray (top + d·tan el), found in one sweep. Slope from the
   heights' gradient: lam = (.45 + .55·max(N·L, 0)) / (.45 + .55·Lz). Out: per px the multiply colour */
const SUN = { az: -2.36, el: 0.7, tint: [0.46, 0.5, 0.64] };
function sunShade(HB, az = SUN.az, el = SUN.el) {
  const { T, W, H, k } = HB, out = new Uint8ClampedArray(W * H * 4), dx = Math.cos(az), dy = Math.sin(az), te = Math.tan(el);
  const Lz = Math.sin(el), Lx = Math.cos(el) * dx, Ly = Math.cos(el) * dy, sh = new Float32Array(W * H), C = new Float32Array(W * H); const [tr, tg, tb] = SUN.tint;
  // one sweep, sun side first: C = the highest shadow height reaching this px (its sun-side neighbour's C, dropping tan el per world px, or its own top)
  const X = Math.abs(dx) >= Math.abs(dy), m = X ? Math.abs(dx) : Math.abs(dy), sa = Math.sign(X ? dx : dy), fr = (X ? dy : dx) / m, drop = te / m / k, N = X ? W : H, M = X ? H : W;
  for (let a = sa > 0 ? N - 1 : 0; a >= 0 && a < N; a -= sa) for (let b = 0; b < M; b++) {
    const i = X ? b * W + a : a * W + b, ua = a + sa, ub = Math.round(b + fr);
    const c = ua >= 0 && ua < N && ub >= 0 && ub < M ? C[X ? ub * W + ua : ua * W + ub] - drop : -1;
    sh[i] = c > T[i] + 0.5 ? 1 : 0; C[i] = Math.max(T[i], c);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, hx = (T[y * W + Math.min(W - 1, x + 1)] - T[y * W + Math.max(0, x - 1)]) * k / 2, hy = (T[Math.min(H - 1, y + 1) * W + x] - T[Math.max(0, y - 1) * W + x]) * k / 2;
    const lam = Math.min(1.25, (0.45 + 0.55 * Math.max(0, (Lz - hx * Lx - hy * Ly) / Math.sqrt(hx * hx + hy * hy + 1))) / (0.45 + 0.55 * Lz)), j = i * 4;
    if (sh[i]) { out[j] = 255 * Math.min(1, tr * lam); out[j + 1] = 255 * Math.min(1, tg * lam); out[j + 2] = 255 * Math.min(1, tb * lam); } else out[j] = out[j + 1] = out[j + 2] = 255 * Math.min(1, lam); out[j + 3] = 255;
  }
  return { out, sh };
}

/* the draw stack, bottom up: what each layer holds, where it comes from, its height key in the queue */
const LAYERS = [
  { id: 'ground', n: 'GROUND', z: 'canvas · baked once', f: '2_maps · paintGround', d: 'A world-sized canvas painted once when the map is built from its seed: grass pattern, patches, specks, roads, fields, water, team pads. Never redrawn — the frame just copies the visible part.' },
  { id: 'decals', n: 'DECALS & PRINTS', z: 'canvas · fades', f: '2_maps · decals / prints', d: 'Two more world canvases stacked onto the ground in the same draw (stackImg): blood, scorch marks, tank treads every 5 px, bodies baked in, footprints. Every 3 s they fade: a′ = a·(1 − k) − .007 (k .05 decals, .075 prints), as a GL shader pass.' },
  { id: 'low', n: 'QUEUE · LOW', z: 'z 0 – 14', f: '5_ui · DRAWQ', d: 'The draw queue begins: everything on the ground is pushed with a real height z and sorted low → high. Brass 0, bodies 1, items 2, fences 9, crates 10, hay 14. Sorting by height (not by type) is why a soldier stands in front of a crate but behind a tank.' },
  { id: 'units', n: 'QUEUE · SOLDIERS', z: 'z = solZ ≈ 18 + art', f: '5_ui · drawSoldier', d: 'Soldiers: team ring, legs, body pose sprite (stand / rpg / nogun / sit / dead), armband in team colour. Their z = jump lift + 18 (legs) + the pose\'s tallest painted px. Sandbag arcs use artMax(\'bagarc0\').' },
  { id: 'veh', n: 'QUEUE · VEHICLES', z: 'z = topOf(v)', f: '5_ui · drawVehicle', d: 'A vehicle is ONE queue item drawn bottom-up: tracks, hull, riders, gun (slides back 20 px on recoil), turret, MG, gunner. Its z is its tallest part (topOf). The parts\' own heights come from the material atlas — see HEIGHTS.' },
  { id: 'high', n: 'QUEUE · TREES & ROOFS', z: 'z 40 – 56', f: '5_ui · SUNH', d: 'Roofs (40) and trees (56) are the tallest things on the map, so they sort last and cover whatever walks under them.' },
  { id: 'light', n: 'THE LIGHT', z: 'GL pass · multiply', f: '5e_light · drawSun', d: 'Every solid pixel above has written its height into a GPU height buffer. One pass marches each pixel toward the sun: anything rising above the ray (h + d·tan el) shades it. Slopes facing the sun get more light. The result multiplies the frame. At night: shader point lights instead.' },
  { id: 'post', n: 'OVER THE LIGHT', z: 'fire 44 · flash 30 · smoke 48', f: '5_ui · post queue', d: 'Things that make light are drawn after it so the shade never darkens them: fire, explosions, muzzle flashes, sparks (additive "lighter"), smoke puffs. Each flash also calls light(), a real point light for the next pass.' },
  { id: 'fog', n: 'VISION FOG', z: 'mask', f: '5b_fog · applyFog', d: 'An exact visibility polygon from each of your soldiers\' eyes (rays through every wall corner). Outside it the map shows your memory, greyed, at half resolution; smoke and glass soften it.' },
  { id: 'grade', n: 'WEATHER & GRADE', z: 'screen space', f: '5_ui · grit', d: 'Rain / snow streaks, then the grit look: multiply #e2d9c2, 7% film grain, 38% vignette.' },
  { id: 'hud', n: 'HUD (2D CANVAS)', z: 'separate canvas', f: '5_ui · 6_menus', d: 'Not GL: a plain 2D canvas (#c) lying over the WebGL one (#g). Ammo, tickets, minimap, kill feed, touch sticks, menus.' }
];
/* one camera for both 3D views (DRAW STACK and HEIGHTS), one set of controls on #stage:
   drag sideways = turn, drag up/down = tilt (0 top-down … 70°), pinch / wheel = zoom, tap = select. */
const CAM0 = { yaw: -32, tilt: 50, zoom: 1 }, CAM = { ...CAM0, goal: null };
function camTo(o) { CAM.goal = { ...CAM, ...o }; }
function camStep(dt) { const G = CAM.goal; if (!G) return; const k = Math.min(1, dt * 9); let done = 1; for (const f of ['yaw', 'tilt', 'zoom']) { CAM[f] += (G[f] - CAM[f]) * k; if (Math.abs(G[f] - CAM[f]) > 0.01) done = 0; else CAM[f] = G[f]; } if (done) CAM.goal = null; }
function orbit(el, onTap, onChange) {
  const P = new Map(); let base = null, moved = false, tapT = null, pinch = 0, z0 = 1;
  const dist = () => { const [a, b] = [...P.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; };
  const rebase = () => { const [x, y] = [...P.values()][0]; base = [x, y, CAM.yaw, CAM.tilt]; };
  el.addEventListener('pointerdown', e => {
    if (e.button > 0) return; CAM.goal = null; P.set(e.pointerId, [e.clientX, e.clientY]); try { el.setPointerCapture(e.pointerId); } catch (_) { }
    if (P.size === 1) { moved = false; tapT = e.target; rebase(); } else { moved = true; pinch = dist(); z0 = CAM.zoom; }
  });
  el.addEventListener('pointermove', e => {
    if (!P.has(e.pointerId)) return; P.set(e.pointerId, [e.clientX, e.clientY]);
    if (P.size > 1) CAM.zoom = clamp(z0 * dist() / pinch, 0.6, 2.5);
    else { const dx = e.clientX - base[0], dy = e.clientY - base[1]; if (Math.abs(dx) + Math.abs(dy) > 6) moved = true; if (!moved) return; CAM.yaw = base[2] - dx * 0.4; CAM.tilt = clamp(base[3] - dy * 0.35, 0, 70); }
    onChange();
  });
  const end = e => { if (!P.delete(e.pointerId)) return; if (e.type === 'pointerup' && !moved && !P.size) onTap(tapT); if (P.size === 1) { pinch = 0; rebase(); } };
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, end);
  el.addEventListener('wheel', e => { e.preventDefault(); CAM.goal = null; CAM.zoom = clamp(CAM.zoom * Math.exp(-e.deltaY * 0.0015), 0.6, 2.5); onChange(); }, { passive: false });
}
VIEWS.layers = {
  init() {
    const stack = $('#stack'), info = $('#layInfo'); let sel = 4, exp = 1, mode = 'stack', gap = 1, gapT = 1, anim = 0;
    const S = 1; // world px per canvas px
    const els = LAYERS.map((L, i) => { const d = document.createElement('div'); d.className = 'lay'; const c = document.createElement('canvas'); c.width = SC.W; c.height = SC.H; d.appendChild(c); stack.appendChild(d); return { d, c, g: c.getContext('2d') }; });
    const fin = document.createElement('div'); fin.className = 'lay'; const fc = document.createElement('canvas'); fc.width = SC.W; fc.height = SC.H; fin.appendChild(fc); stack.appendChild(fin); const fg = fc.getContext('2d');
    let size = 300;
    const place = () => {
      const r = $('#stage').getBoundingClientRect(); size = Math.min(r.width * 0.78, r.height * 1.05, 520); const h = size * SC.H / SC.W, sp = Math.min(40, r.height / 11) * gap;
      els.forEach((e, i) => { e.c.style.width = size + 'px'; e.c.style.height = h + 'px'; e.d.style.transform = `translate(${-size / 2}px,${-h / 2}px) translateZ(${(i - 5) * sp}px)`; e.d.classList.toggle('sel', i === sel && gap > 0.2); e.d.classList.toggle('dim', gap > 0.2 && sel >= 0 && i > sel && exp); });
      fc.style.width = size + 'px'; fc.style.height = h + 'px'; fin.style.transform = `translate(${-size / 2}px,${-h / 2}px) translateZ(1px)`; fin.style.opacity = gap < 0.05 ? 1 : 0; fin.style.pointerEvents = 'none';
      stack.style.transform = `scale(${CAM.zoom}) rotateX(${CAM.tilt}deg) rotateZ(${CAM.yaw}deg)`;
    };
    const pick = i => {
      sel = i; const L = LAYERS[i];
      info.innerHTML = `<div style="display:flex;gap:8px;align-items:center"><button class="btn" id="lp">‹</button><div style="flex:1;min-width:0"><h4>${i + 1}. ${L.n}</h4><span class="z">${L.z} · ${L.f}</span></div><button class="btn" id="ln">›</button></div><p style="margin:6px 0 0;font-size:13.2px;color:var(--dim)">${L.d}</p>`;
      $('#lp').onclick = () => pick((i + LAYERS.length - 1) % LAYERS.length); $('#ln').onclick = () => pick((i + 1) % LAYERS.length); place();
    };
    orbit($('#stage'), t => { const l = mode === 'stack' && t && t.closest && t.closest('.lay'), i = els.findIndex(e => e.d === l); if (i >= 0) pick(i); }, () => { if (mode === 'stack') place(); });
    $('#camR').onpointerdown = e => e.stopPropagation();
    $('#camR').onclick = () => camTo(exp ? CAM0 : { yaw: 0, tilt: 0, zoom: 1 });
    $('#layExp').onclick = e => { const b = e.target.closest('button'); if (!b) return; exp = +b.dataset.e; $$('#layExp button').forEach(x => x.classList.toggle('on', x === b)); gapT = exp; camTo(exp ? CAM0 : { yaw: 0, tilt: 0, zoom: 1 }); };
    $('#layMode').onclick = e => { const b = e.target.closest('button'); if (!b) return; mode = b.dataset.m; $$('#layMode button').forEach(x => x.classList.toggle('on', x === b)); $('#stack').style.display = mode === 'stack' ? '' : 'none'; $('#relief').style.display = mode === 'stack' ? 'none' : 'block'; $('#layExp').style.display = mode === 'stack' ? '' : 'none'; if (mode === 'stack') pick(sel); else RELIEF.start(info); };
    addEventListener('resize', place);
    pick(sel);
    ART.ready(() => {
      if (!ART.ok) { info.innerHTML = '<p class="muted">Could not load the game\'s atlas (open this page from the site, not a file).</p>'; return; }
      const ground = document.createElement('canvas'); ground.width = SC.W; ground.height = SC.H; paintGroundTo(ground.getContext('2d'));
      const dec = document.createElement('canvas'); dec.width = SC.W; dec.height = SC.H; paintDecalsTo(dec.getContext('2d'));
      const shadeC = document.createElement('canvas'), sg = shadeC.getContext('2d'); let tP = null, jP = null, stP = null;
      const staticParts = () => [...stackParts(SCENE.jeep), ...SCENE.sols.flatMap(s => stackParts(s))].concat([{ n: 'bagarc0', x: SCENE.bags[0].x, y: SCENE.bags[0].y, a: 0, b: 0, add: 0, fy: 1 }]);
      const redraw = (t, dt) => {
        const T = SCENE.tank; T.ta = T.a + Math.sin(t * 0.6) * 1.1; T.mgA = T.ta + 0.9 + Math.sin(t * 1.7) * 0.5; T.recoil = Math.max(0, (T.recoil || 0) - dt * 2.2); if ((t % 3.2) < dt) T.recoil = 1;
        tP = stackParts(T); jP = jP || stackParts(SCENE.jeep);
        const G = i => { const e = els[i]; e.g.clearRect(0, 0, SC.W, SC.H); return e.g; };
        if (!anim) { G(0).drawImage(ground, 0, 0); G(1).drawImage(dec, 0, 0); let g = G(2); for (const d of SCENE.dead) sprDraw(g, 'sol_dead', d.x, d.y, d.a); for (const c of SCENE.crates) crateDraw(g, c); for (let i = 0; i < 4; i++) { g.fillStyle = '#c9a23a'; g.fillRect(150 + i * 5, 190 + (i % 2) * 3, 3, 1.5); } g = G(5); for (const t of SCENE.trees) treeDraw(g, t); const hz = SCENE.house; g.fillStyle = '#6e4a36'; g.fillRect(hz.x, hz.y, hz.w, hz.h); g.fillStyle = '#5a3a2a'; for (let y = hz.y; y < hz.y + hz.h; y += 4) g.fillRect(hz.x, y, hz.w, 1); g.fillStyle = '#7e5a44'; g.fillRect(hz.x, hz.y + hz.h / 2 - 1, hz.w, 2); }
        let g = G(3); sprDraw(g, 'bagarc0', SCENE.bags[0].x, SCENE.bags[0].y, 0); for (const s of SCENE.sols) solDraw(g, s);
        g = G(4); drawParts(g, jP); drawParts(g, tP);
        { stP = stP || staticParts(); const HB = sceneHeights(0.5, [...tP, ...stP]), sh = sunShade(HB); shadeC.width = HB.W; shadeC.height = HB.H; sg.putImageData(new ImageData(sh.out, HB.W, HB.H), 0, 0); }
        g = G(6); g.imageSmoothingEnabled = true; g.drawImage(shadeC, 0, 0, SC.W, SC.H);
        g = G(7); const bf = Math.floor(t * 8) % 3; sprDraw(g, 'boom' + bf, 214, 196, t * 0.4, 0.7 + 0.1 * Math.sin(t * 9)); for (let i = 0; i < 3; i++) { const k = ((t * 0.25 + i / 3) % 1); sprDraw(g, 'smoke' + i, 224 + k * 30, 186 - k * 40, k * 2, 0.5 + k * 0.6, (1 - k) * 0.8); }
        if (T.recoil > 0.7) { const px = T.x - 4 * Math.cos(T.a) + Math.cos(T.ta) * 88, py = T.y - 4 * Math.sin(T.a) + Math.sin(T.ta) * 88; g.globalCompositeOperation = 'lighter'; sprDraw(g, 'fire1', px, py, T.ta, 1.2 * T.recoil); g.globalCompositeOperation = 'source-over'; }
        if ((t * 6 | 0) % 2) { const [jx, jy] = [SCENE.jeep.x - 22 * Math.cos(SCENE.jeep.a) + Math.cos(SCENE.jeep.mgA) * 26, SCENE.jeep.y - 22 * Math.sin(SCENE.jeep.a) + Math.sin(SCENE.jeep.mgA) * 26]; g.globalCompositeOperation = 'lighter'; sprDraw(g, 'fire2', jx, jy, 0, 0.45); g.globalCompositeOperation = 'source-over'; }
        if (!anim) { // fog: sight polygon from the eye (360 rays vs the house and the trees' trunks — the game casts to wall corners exactly)
          g = G(8); g.fillStyle = 'rgba(8,10,8,.72)'; g.fillRect(0, 0, SC.W, SC.H); const [ex, ey] = SCENE.eye, hz = SCENE.house; g.globalCompositeOperation = 'destination-out'; g.beginPath();
          for (let i = 0; i <= 360; i++) { const a = i / 360 * TAU, dx = Math.cos(a), dy = Math.sin(a); let tt = 400; const tx = [(hz.x - ex) / dx, (hz.x + hz.w - ex) / dx], ty = [(hz.y - ey) / dy, (hz.y + hz.h - ey) / dy], t0 = Math.max(Math.min(...tx), Math.min(...ty)), t1 = Math.min(Math.max(...tx), Math.max(...ty)); if (t1 >= t0 && t0 > 0) tt = Math.min(tt, t0); g.lineTo(ex + dx * Math.min(tt, 210), ey + dy * Math.min(tt, 210)); }
          g.fill(); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#5fd3d0'; g.beginPath(); g.arc(ex, ey, 3, 0, TAU); g.fill();
          g = G(9); const vg = g.createRadialGradient(SC.W / 2, SC.H / 2, SC.H * 0.3, SC.W / 2, SC.H / 2, SC.W * 0.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.38)'); g.fillStyle = 'rgba(226,217,194,.18)'; g.fillRect(0, 0, SC.W, SC.H); g.fillStyle = vg; g.fillRect(0, 0, SC.W, SC.H); const R = mulberry(3); for (let i = 0; i < 900; i++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.07)'; g.fillRect(R() * SC.W, R() * SC.H, 1, 1); } g.strokeStyle = 'rgba(190,210,230,.35)'; for (let i = 0; i < 40; i++) { const x = R() * SC.W, y = R() * SC.H; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 9); g.stroke(); }
          g = G(10); g.font = '700 11px Chakra Petch'; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(8, 8, 64, 44); g.strokeStyle = '#e0b72c'; g.strokeRect(8, 8, 64, 44); g.fillStyle = '#5a96ff'; g.fillRect(84, 10, 70, 6); g.fillStyle = '#ff5c4a'; g.fillRect(166, 10, 52, 6); g.fillStyle = '#ece4c8'; g.fillText('212', 84, 28); g.fillText('147', 190, 28); g.font = '20px Black Ops One'; g.fillText('24', 246, 206); g.font = '600 10px Chakra Petch'; g.fillText('/ 120', 276, 206); g.drawImage(sprCanvas('wi_ar'), 246, 168); g.fillStyle = '#7ddc6a'; g.fillRect(12, 196, 90, 6); g.strokeStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.arc(46, 160, 26, 0, TAU); g.stroke(); g.beginPath(); g.arc(46, 160, 10, 0, TAU); g.stroke();
        }
        // the final frame, composited the way the game does (shade multiplies the queue; post adds over)
        fg.clearRect(0, 0, SC.W, SC.H); for (let i = 0; i < 6; i++) fg.drawImage(els[i].c, 0, 0); fg.globalCompositeOperation = 'multiply'; fg.drawImage(els[6].c, 0, 0); fg.globalCompositeOperation = 'source-over'; for (let i = 7; i < 11; i++) fg.drawImage(els[i].c, 0, 0);
        anim = 1;
      };
      redraw(0, 0);
      loop($('#stage'), (dt, t) => { if (mode !== 'stack') return; camStep(dt); gap += (gapT - gap) * Math.min(1, dt * 7); if (Math.abs(gap - gapT) < 0.002) gap = gapT; place(); redraw(t, dt); });
    });
    this.show = place; requestAnimationFrame(place);
  }
};

/* ---------- HEIGHTS: every painted px of every part a column from its base to its top (oblique view) ---------- */
const SIDE = [0.72, 0.6, 0.5, 0.42, 0.36]; // column side shades, lit → away from the light
const rgba32 = (r, g, b, k) => ((255 << 24) | ((b * k) << 16) | ((g * k) << 8) | (r * k)) >>> 0;
const RELIEF = {
  start(info) {
    if (!ART.ok) { ART.ready(() => this.start(info)); return; }
    (this.enter = this.enter || this.make())(info);
  },
  make() {
    const cv = $('#relief'), off = document.createElement('canvas'); let img = null, buf = null, g = null, info = null, what = 'tank', spin = true, t = 0, crew = true;
    const O = { tank: { type: 'tank', x: 0, y: 0, a: 0, ta: 0, mgA: 0.5 }, jeep: { type: 'jeep', x: 0, y: 0, a: 0, mgA: 0 }, sol: { type: 'sol', x: 0, y: 0, a: 0, pose: 'sol_stand' } };
    const paintInfo = P => {
      info.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><div class="seg" id="rW"><button data-w="tank">TANK</button><button data-w="jeep">JEEP</button><button data-w="sol">SOLDIER</button></div><button class="btn${spin ? ' on' : ''}" id="rS">TURN</button><button class="btn${crew ? ' on' : ''}" id="rC">CREW</button></div>
      <p style="margin:8px 0 6px;font-size:12.5px;color:var(--dim)">Every coloured pixel of the atlas has a height in <code>atlas_m.png</code> (red = height × 4). A part starts on whatever kept part lies under its rest point: <span class="mono">b = max(min, hUnder(rest)) + underside + lift</span>. Drag to turn and tilt, pinch to zoom.</p>
      <div class="tw"><table class="vars"><tr><th>part</th><th>rests on</th><th>under</th><th>lift</th><th>b</th><th>top</th></tr>${P.map(q => `<tr><td>${q.n}</td><td class="v">${q.rest}</td><td class="v">${q.under}</td><td class="v">${q.lift + (q.add ? ' +' + q.add : '')}</td><td class="v">${q.b}</td><td class="v">${q.b + q.add + artMax(q.n)}</td></tr><tr><td colspan="6" style="font-family:var(--fb);color:var(--faint);font-size:11.5px;padding-top:0">${q.why}</td></tr>`).join('')}</table></div>
      <p class="mono" style="font-size:12px">topOf = ${topOf(P)} px → its place in the draw queue</p>`;
      $$('#rW button').forEach(b => { b.classList.toggle('on', b.dataset.w === what); b.onclick = () => { what = b.dataset.w; build(); }; });
      $('#rS').onclick = () => { spin = !spin; $('#rS').classList.toggle('on', spin); }; $('#rC').onclick = () => { crew = !crew; $('#rC').classList.toggle('on', crew); build(); };
    };
    let cols = [], P = [];
    const build = () => {
      const o = O[what]; o.crew = crew ? 1 : 0; P = stackParts(o); cols = [];
      for (const q of P) {
        const m = ART.A[q.n], un = q.un && ART.A[q.un];
        for (let y = 0; y < m[3]; y++) for (let x = 0; x < m[2]; x++) {
          if (!painted(m, x, y)) continue; const i = ((m[1] + y) * ART.w + m[0] + x) * 4, top = q.b + q.add + heightPx(m, x, y);
          let bot = q.b; if (un) { const ux = Math.floor(un[4] + q.at[0] + (x - m[4])), uy = Math.floor(un[5] + q.at[1] + (y - m[5]) * q.fy); bot = ux >= 0 && uy >= 0 && ux < un[2] && uy < un[3] ? q.b - heightPx(un, ux, uy) : q.b; }
          cols.push({ q, lx: x - m[4] + 0.5, ly: (y - m[5] + 0.5) * q.fy, top, bot: Math.max(0, bot), fc: rgba32(ART.ap[i], ART.ap[i + 1], ART.ap[i + 2], 1), sc: SIDE.map(k => rgba32(ART.ap[i], ART.ap[i + 1], ART.ap[i + 2], k)) });
        }
      }
      // a side is never seen when the same part's neighbour on that side covers it (top ≥, bottom ≤): edges 0..3 face −y, +x, +y, −x
      const at = new Map(); for (const c of cols) { let m = at.get(c.q); if (!m) at.set(c.q, m = new Map()); m.set(c.lx + ',' + c.ly, c); }
      for (const c of cols) { c.hid = 0; const m = at.get(c.q); [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([ox, oy], e) => { const o = m.get((c.lx + ox) + ',' + (c.ly + oy)); if (o && o.top >= c.top && o.bot <= c.bot) c.hid |= 1 << e; }); }
      paintInfo(P); t = 0;
    };
    const draw = (dt) => {
      if (!g || cv.width !== Math.round(cv.getBoundingClientRect().width * Math.min(2, devicePixelRatio))) g = fitCanvas(cv, cv.parentElement.getBoundingClientRect().height);
      if (!cols.length) return;
      t += dt; camStep(dt); const o = O[what], yaw = CAM.yaw * Math.PI / 180, pitch = (90 - CAM.tilt) * Math.PI / 180;
      if (spin && what !== 'sol') { const ta = Math.sin(t * 0.7) * 1.2; if (what === 'tank') { o.ta = ta; o.mgA = ta + 0.5 + Math.sin(t * 1.9) * 0.6; } else { o.mgA = ta; o.steer = Math.sin(t * 1.3) * 0.45; } P = stackParts(o); }
      const W = g.W, H = g.H, sc = Math.min(W / (what === 'sol' ? 60 : what === 'jeep' ? 120 : 175), H / (what === 'sol' ? 70 : 110)) * CAM.zoom, cy = Math.cos(yaw), sy = Math.sin(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
      g.fillStyle = '#0a0f08'; g.fillRect(0, 0, W, H);
      // ground grid
      g.strokeStyle = 'rgba(125,220,106,.09)'; g.lineWidth = 1; for (let k = -100; k <= 100; k += 10) for (const s of [0, 1]) { const p = (x, y) => { const rx = x * cy - y * sy, ry = x * sy + y * cy; return [W / 2 + rx * sc, H * 0.58 + ry * sp * sc]; }; const [a, b] = s ? [p(k, -100), p(k, 100)] : [p(-100, k), p(100, k)]; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
      // each painted px is a column standing on its own rotated 1×1 footprint: project the footprint's 4 corners (once per part
      // angle), fill the sides facing the camera (darker the more they face away from the light, upper left), then the top.
      // Painter's order = distance along the view ray: ry·cos(pitch) + top·sin(pitch) (from above: by height; from the side: by depth).
      // Filled by a small scanline rasterizer straight into an ImageData (thousands of tiny canvas paths per frame are far too slow).
      const d = cv.width / W, BW = cv.width, BH = cv.height; if (!img || img.width !== BW || img.height !== BH) { img = new ImageData(BW, BH); buf = new Uint32Array(img.data.buffer); off.width = BW; off.height = BH; } buf.fill(0);
      const list = [], qs = P, ft = new Map(), K = sc * d, scr = (x, y) => [(x * cy - y * sy) * K * 0.52, (x * sy + y * cy) * sp * K * 0.52];
      const foot = q => {
        let f = ft.get(q.a); if (f) return f;
        const A = scr(Math.cos(q.a), Math.sin(q.a)), B = scr(-Math.sin(q.a), Math.cos(q.a)), C = [[-A[0] - B[0], -A[1] - B[1]], [A[0] - B[0], A[1] - B[1]], [A[0] + B[0], A[1] + B[1]], [-A[0] + B[0], -A[1] + B[1]]], sides = [];
        for (let i = 0; i < 4; i++) { const a = C[i], b = C[(i + 1) % 4], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; let nx = b[1] - a[1], ny = a[0] - b[0]; if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; } const n = Math.hypot(nx, ny) || 1; if (ny / n > 0.02) sides.push([a, b, Math.round((1 + nx / n) * 2), 1 << i]); }
        ft.set(q.a, f = { C, sides }); return f;
      };
      let pi = -1, last = null; for (const c of cols) { if (c.q !== last) { pi++; last = c.q; } const q = qs[pi] || c.q, cs = Math.cos(q.a), sn = Math.sin(q.a), wx = q.x + c.lx * cs - c.ly * sn, wy = q.y + c.lx * sn + c.ly * cs, rx = wx * cy - wy * sy, ry = wx * sy + wy * cy, top = c.top - c.q.b + q.b, bot = Math.max(0, c.bot - c.q.b + q.b); list.push([ry * cp + top * sp, BW / 2 + rx * K, BH * 0.58 + (ry * sp - top * cp) * K, (top - bot) * cp * K, c, foot(q)]); }
      list.sort((a, b) => a[0] - b[0]);
      const Q = new Float32Array(8), poly = col => { // convex quad Q → buf, sampled at px centres
        let y0 = Math.min(Q[1], Q[3], Q[5], Q[7]), y1 = Math.max(Q[1], Q[3], Q[5], Q[7]); y0 = Math.max(0, Math.ceil(y0 - 0.5)); y1 = Math.min(BH - 1, Math.floor(y1 - 0.5));
        for (let y = y0; y <= y1; y++) {
          const yc = y + 0.5; let xl = 1e9, xr = -1e9;
          for (let i = 0, j = 3; i < 4; j = i++) { const ay = Q[j * 2 + 1], by = Q[i * 2 + 1]; if ((ay <= yc) !== (by <= yc)) { const x = Q[j * 2] + (yc - ay) / (by - ay) * (Q[i * 2] - Q[j * 2]); if (x < xl) xl = x; if (x > xr) xr = x; } }
          const xa = Math.max(0, Math.ceil(xl - 0.5)), xb = Math.min(BW - 1, Math.floor(xr - 0.5)), o = y * BW; for (let x = xa; x <= xb; x++) buf[o + x] = col;
        }
      };
      for (const [, X, Y, h, c, f] of list) {
        if (h > 0.3) for (const [a, b, k, e] of f.sides) { if (c.hid & e) continue; Q[0] = X + a[0]; Q[1] = Y + a[1]; Q[2] = X + b[0]; Q[3] = Y + b[1]; Q[4] = Q[2]; Q[5] = Q[3] + h; Q[6] = Q[0]; Q[7] = Q[1] + h; poly(c.sc[k]); }
        const C = f.C; for (let i = 0; i < 4; i++) { Q[i * 2] = X + C[i][0]; Q[i * 2 + 1] = Y + C[i][1]; } poly(c.fc);
      }
      off.getContext('2d').putImageData(img, 0, 0); g.drawImage(off, 0, 0, W, H);
      g.font = '600 11px Chakra Petch'; g.fillStyle = '#a49f86'; g.fillText('drag to turn · pinch to zoom · columns = painted height', 10, H - 10);
    };
    loop(cv, (dt) => draw(dt));
    return el => { info = el; build(); };
  }
};
