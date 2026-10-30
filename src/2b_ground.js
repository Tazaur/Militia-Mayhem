/* ---------------- stamped ground: the map editor's maps (mapedit/) ----------------
   A map's ground is its base texture with polygons stamped over it in order, like a paint program's stamp: each fills
   with its texture by world position (so a texture runs on seamlessly from one stamp to the next), cut by the polygon,
   its edge blurred soft px so it mixes into what's under it. Textures are atlas sprites named tex_<name> (painted and
   given heights / materials in the heightmap editor like any sprite; they should tile); until one is in the atlas a
   pixel placeholder (GTEXP) stands in, flat. The same stamps paint a material map (heights R x4, reflect G, glow B) that
   the sun's height pass reads (sunHeights: GMAT). Baked once when the map is painted; gStampAdd bakes one more stamp
   (only its box) for later: craters, scorch.
   A map (G): { v: 1, id, name, w, h, base, stamps: [{ t: texture, soft: px, p: [x0, y0, x1, y1, ...] }] }.
   Shared with the editor (mapedit/), which has its own ATLAS / IMG / MIMG: nothing here may use the game's other globals. */
const GTEXP = {      // placeholder textures: [base, dark, light, speck] and how many specks
  grass: ['#3f7a2a', '#346a22', '#4b8a33', '#2b5a1c', 900], dirt: ['#7a5a3a', '#6a4c30', '#8a6a46', '#5a3e26', 700],
  sand: ['#c9b07a', '#b89f6a', '#d8c08a', '#a88e5c', 600], rock: ['#6e6c66', '#5e5c57', '#7e7c76', '#4e4c48', 800],
  snow: ['#e6edf2', '#d8e2ea', '#f4f8fb', '#c8d4de', 500], asphalt: ['#4c4c4c', '#444444', '#555555', '#3a3a3a', 900],
  mud: ['#4e3c28', '#433322', '#5a4630', '#382a1c', 800]
};
const gRng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const gCv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const gReady = im => !!(im && im.complete && im.naturalWidth);
/* every texture there is: the atlas's tex_ sprites, then the placeholders not overridden */
function gTexNames() {
  const A = typeof ATLAS !== 'undefined' ? Object.keys(ATLAS).filter(n => n.startsWith('tex_')).map(n => n.slice(4)) : [];
  return [...A, ...Object.keys(GTEXP).filter(n => !A.includes(n))];
}
/* a texture's colour and material canvases (m null: flat). Cached once the atlas has loaded (placeholders till then) */
const GTX = new Map();
function gTex(name) {
  const imOk = typeof IMG !== 'undefined' && gReady(IMG), mOk = typeof MIMG !== 'undefined' && gReady(MIMG), key = name + (imOk ? 1 : 0) + (mOk ? 1 : 0);
  let T = GTX.get(key); if (T) return T;
  const r = typeof ATLAS !== 'undefined' && ATLAS['tex_' + name];
  if (r && imOk) {
    const cut = im => { const c = gCv(r[2], r[3]); c.getContext('2d').drawImage(im, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]); return c; };
    T = { c: cut(IMG), m: mOk ? cut(MIMG) : null };
  } else {
    const P = GTEXP[name] || GTEXP.grass, c = gCv(64, 64), g = c.getContext('2d'), R = gRng([...name].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
    g.fillStyle = P[0]; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < P[4]; i++) { g.fillStyle = R() < 0.5 ? P[1] : P[2]; g.fillRect((R() * 64) | 0, (R() * 64) | 0, 1 + (R() < 0.3), 1); }
    for (let i = 0; i < P[4] / 15; i++) { g.fillStyle = P[3]; g.fillRect((R() * 64) | 0, (R() * 64) | 0, 1, 2); }
    T = { c, m: null };
  }
  if (T.m) { const d = T.m.getContext('2d').getImageData(0, 0, T.m.width, T.m.height).data; let h = 0; for (let i = 0; i < d.length; i += 4) h = Math.max(h, d[i]); T.h = h / 4; } else T.h = 0;     // its tallest px
  GTX.set(key, T); return T;
}
/* a stamp's box (whole px): its polygon and the blur round it */
function gBox(s) {
  const p = s.p, e = Math.ceil((s.soft || 0) * 1.2) + 1; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  return { x: Math.floor(x0 - e), y: Math.floor(y0 - e), w: Math.ceil(x1 + e) - Math.floor(x0 - e), h: Math.ceil(y1 + e) - Math.floor(y0 - e) };
}
/* the stamp's outline as a path: corners rounded by s.r px (each cut back at most half its shorter edge, then a curve
   through the corner), sharp when 0. The editor draws its outlines with this too */
function gPath(g, s) {
  const p = s.p, n = p.length / 2, r = s.r || 0; g.beginPath();
  if (r <= 0 || n < 3) { for (let i = 0; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); return; }
  const pt = i => { i = (i + n) % n; return [p[i * 2], p[i * 2 + 1]]; };
  const cut = (a, b, d) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = Math.min(d, l / 2) / l; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  for (let i = 0; i < n; i++) {
    const v = pt(i), a = cut(v, pt(i - 1), r), b = cut(v, pt(i + 1), r);
    if (i === 0) g.moveTo(a[0], a[1]); else g.lineTo(a[0], a[1]);
    g.quadraticCurveTo(v[0], v[1], b[0], b[1]);
  }
  g.closePath();
}
const gHit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
/* the stamp's mask over its box b: the polygon, blurred (three box blurs ~ a gaussian, sigma soft / 4: it mixes over
   about soft px across the edge). Worked at a lower resolution the softer it is (it's smooth anyway): scaled up when drawn */
const GB = { m: null, s: null };
function gMask(s, b) {
  const soft = s.soft || 0, q = soft >= 24 ? 0.25 : soft >= 8 ? 0.5 : 1, w = Math.max(1, Math.ceil(b.w * q)), h = Math.max(1, Math.ceil(b.h * q));
  const c = GB.m || (GB.m = gCv(1, 1)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.setTransform(q, 0, 0, q, -b.x * q, -b.y * q);
  g.fillStyle = '#fff'; gPath(g, s); g.fill();
  g.setTransform(1, 0, 0, 1, 0, 0);
  const sg = soft / 4 * q; if (sg >= 0.35) {
    const id = g.getImageData(0, 0, w, h), d = id.data, a = new Float32Array(w * h), t = new Float32Array(w * h);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    const r = Math.max(1, Math.round((Math.sqrt(4 * sg * sg + 1) - 1) / 2));     // box radius: three passes ~ sigma sg
    const pass = (src, dst, n, m, st, ln) => {     // n lines of m px, st between px, ln between lines; edges held
      for (let j = 0; j < n; j++) { const o = j * ln; let acc = 0; for (let i = -r; i <= r; i++) acc += src[o + Math.min(m - 1, Math.max(0, i)) * st];
        for (let i = 0; i < m; i++) { dst[o + i * st] = acc / (2 * r + 1); acc += src[o + Math.min(m - 1, i + r + 1) * st] - src[o + Math.max(0, i - r) * st]; } }
    };
    for (let k = 0; k < 3; k++) { pass(a, t, h, w, 1, w); pass(t, a, w, h, w, 1); }
    for (let i = 0; i < a.length; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; d[i * 4 + 3] = a[i]; }
    g.putImageData(id, 0, 0);
  }
  return { c, q };
}
/* the stamp in texture k ('c' colour, 'm' material) over its box, in the scratch canvas (one, reused: on GL its texture is too) */
function gStampCv(s, b, M, k) {
  const c = GB.s || (GB.s = gCv(1, 1)); if (c.width !== b.w || c.height !== b.h) { c.width = b.w; c.height = b.h; }
  const g = c.getContext('2d'), T = gTex(s.t); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, b.w, b.h);
  const src = k === 'm' ? T.m : T.c; if (src) { g.translate(-b.x, -b.y); g.fillStyle = g.createPattern(src, 'repeat'); g.fillRect(b.x, b.y, b.w, b.h); g.setTransform(1, 0, 0, 1, 0, 0); } else { g.fillStyle = '#000'; g.fillRect(0, 0, b.w, b.h); }
  g.globalCompositeOperation = 'destination-in'; g.imageSmoothingEnabled = true; g.drawImage(M.c, 0, 0, M.c.width, M.c.height, 0, 0, M.c.width / M.q, M.c.height / M.q); g.globalCompositeOperation = 'source-over';
  return c;
}
/* bake map G's ground within box r (all of it if none; no G.base: only its stamps, over what's there) into gc (colour) and gm (material; may be null): 2D contexts,
   or GX's on GL surfaces. Returns the tallest painted height (px) */
function gBake(G, gc, gm, r) {
  r = r || { x: 0, y: 0, w: G.w, h: G.h }; const T = [[gc, 'c'], [gm, 'm']].filter(t => t[0]); let hmax = G.base ? gTex(G.base).h : 0;
  for (const [g, k] of T) {
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = false;
    g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    if (!G.base) continue; const B = gTex(G.base), src = k === 'm' ? B.m : B.c; g.fillStyle = src ? g.createPattern(src, 'repeat') : '#000'; g.fillRect(r.x, r.y, r.w, r.h);
  }
  for (const s of G.stamps) {
    if (!s.p || s.p.length < 6 || s.off) continue; const b = gBox(s); if (!gHit(b, r)) continue;
    const M = gMask(s, b); hmax = Math.max(hmax, gTex(s.t).h);
    for (const [g, k] of T) g.drawImage(gStampCv(s, b, M, k), b.x, b.y);
  }
  for (const [g] of T) g.restore();
  return hmax;
}

/* ---------------- in the game ---------------- */
/* the maps: built in (GMAPS: maps/*.json, put in at build) and the editor's (Send to game: this browser only, mmgl.maplab),
   listed after the others as 'g:<id>' */
const GMAP_LAB = typeof store !== 'undefined' ? store.get('maplab', {}) : {};
function gMapOf(id) { const k = id.slice(2); return GMAP_LAB[k] || (typeof GMAPS !== 'undefined' ? GMAPS.find(G => G.id === k) : null); }
function gMapList() {
  if (typeof MAPNAMES === 'undefined') return;
  const all = [...(typeof GMAPS !== 'undefined' ? GMAPS : []), ...Object.values(GMAP_LAB)];
  for (const G of all) { const id = 'g:' + G.id, n = (G.name || G.id).toUpperCase(), e = MAPNAMES.find(m => m[0] === id); if (e) e[1] = n; else MAPNAMES.push([id, n]); }
}
gMapList();
if (typeof addEventListener !== 'undefined' && typeof store !== 'undefined') addEventListener('storage', e => { if (e.key !== 'mmgl.maplab') return; for (const k in GMAP_LAB) delete GMAP_LAB[k]; Object.assign(GMAP_LAB, store.get('maplab', {})); gMapList(); });
/* the ground of a stamped map: colour into the ground, material into GMAT (GL only: the sun pass is GL only) */
let GMAT = null, GMAX = 0;
function paintStamped() {
  const G = MAP.gmap;
  if (typeof GL !== 'undefined' && GL) { if (!GMAT || GMAT.width !== WW || GMAT.height !== WH) GMAT = mkG(WW, WH); } else GMAT = null;
  GMAX = gBake(G, gx, GMAT && GMAT.getContext('2d'), null);
  const B = gTex(G.base); SKIRT_PAT = gx.createPattern(B.c, 'repeat');
  if (!gReady(IMG) || (typeof MIMG !== 'undefined' && MIMG && !gReady(MIMG))) for (const im of [IMG, typeof MIMG !== 'undefined' ? MIMG : null]) if (im && !gReady(im)) im.addEventListener('load', () => { if (MAP && MAP.gmap === G) paintGround(); }, { once: true });     // the atlas came late: again with the real textures
}
/* one more stamp, baked over only its box (destruction later: a crater, scorch) */
function gStampAdd(s) {
  const G = MAP.gmap; if (!G) return; G.stamps.push(s); const b = gBox(s);
  GMAX = Math.max(GMAX, gBake({ ...G, stamps: [s], base: null }, gx, GMAT && GMAT.getContext('2d'), b) || 0);
}
