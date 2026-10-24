'use strict';
/* =====================================================================
   MILITIA MAYHEM — local multiplayer top-down battle (landscape)
   Sprites: the player's original art, packed into ATLAS at build time.
   Files: 1_core (utils, data, assets, audio, input) · 2_maps · 3_sim · 4_ai · 5_ui
   ===================================================================== */

/* ---------------- utils ---------------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const approach = (v, t, d) => v < t ? Math.min(t, v + d) : Math.max(t, v - d);
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; }
function prune(arr, f) { let j = 0; for (let i = 0; i < arr.length; i++) { const o = arr[i]; if (f(o)) arr[j++] = o; } arr.length = j; }
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const store = {
  get(k, d) { try { const v = localStorage.getItem('combinedarms.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('combinedarms.' + k, JSON.stringify(v)); } catch (e) { } }
};
let UID = 0;
function inRect(x, y, r, pad) { pad = pad || 0; return x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad; }
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }

/* ---------------- game data ---------------- */
let WW = 3000, WH = 2000;                // the dev yard shrinks the world (setWorld)
/* out of bounds: a band of terrain around the battlefield you can enter, but staying out for OOB_T seconds kills you */
const SKIRT = 480, OOB_T = 5;
const outOfBounds = (x, y) => x < 0 || y < 0 || x > WW || y > WH;
const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'cyan', 'magenta'];   // the playable colours (art also has white/black, unused)
const CHEX_C = { red: '#e02c26', orange: '#f07c16', yellow: '#e8cc20', green: '#2cc036', blue: '#345cf2', cyan: '#22cce4', magenta: '#cc36cc', white: '#f0f0f0', black: '#4a4a4a' };
const CHEX_G = { red: '#b04a3e', orange: '#bd7838', yellow: '#b9ac4c', green: '#638f48', blue: '#516fae', cyan: '#5299a6', magenta: '#8f5190', white: '#cbc6b8', black: '#4a4a44' };
const TEAMHEX_C = ['#5a96ff', '#ff5c4a'], TEAMHEX_G = ['#7393c4', '#c46f5c'];
let CHEX = CHEX_C, TEAMHEX = TEAMHEX_C;
let TEAMNAME = ['WEST', 'EAST'];
const CNAME = { red: 'RED', orange: 'ORANGE', yellow: 'YELLOW', green: 'GREEN', blue: 'BLUE', cyan: 'CYAN', magenta: 'PURPLE' };
const TEAMBOT = ['blue', 'red'];
const FD = "'Black Ops One',Impact,'Arial Black',sans-serif";
const FB = "'Chakra Petch','Trebuchet MS',Arial,sans-serif";
const BOTNAMES = ['Novak', 'Reyes', 'Okafor', 'Lind', 'Moreau', 'Sato', 'Kowal', 'Brandt', 'Ivers', 'Haddad', 'Quinn', 'Petrov', 'Abara', 'Duarte', 'Falk', 'Mbeki', 'Tanaka', 'Holt', 'Varga', 'Ochoa', 'Rask', 'Benz', 'Kim', 'Silva', 'Dunn', 'Arce'];
const SKILL = [
  { name: 'ROOKIE', react: 0.6, err: 0.17, rate: 0.55 },
  { name: 'REGULAR', react: 0.38, err: 0.09, rate: 0.8 },
  { name: 'VETERAN', react: 0.22, err: 0.05, rate: 1 }];
const MODES = [
  { id: 'conquest', n: 'CONQUEST', team: true, desc: 'Hold flags to drain enemy tickets.' },
  { id: 'tdm', n: 'TEAM DEATHMATCH', team: true, desc: 'Every death costs a ticket.' },
  { id: 'koth', n: 'KING OF THE HILL', team: true, desc: 'One flag in the middle. Hold it.' },
  { id: 'ffa', n: 'DEATHMATCH', team: false, desc: 'Everyone for themselves.' },
  { id: 'surv', n: 'CO-OP SURVIVAL', team: false, coop: true, desc: 'Survive waves of bots together. Revive downed friends.' }];
const MAPNAMES = [['crossroads', 'CROSSROADS'], ['farmlands', 'FARMLANDS'], ['rivertown', 'RIVER TOWN'], ['snowfield', 'SNOWFIELD'], ['outskirts', 'OUTSKIRTS']];
const LIMITS = { team: [100, 200, 300], ffa: [10, 20, 30], surv: [10, 20, 0] };      // survival: waves to win (0 = endless)

/* weapons: dmg per bullet, vdmg = damage to light vehicles */
const WPN = {
  ar: { n: 'M4A1', s: 'M4A1', mag: 30, res: 150, rate: 0.11, dmg: 17, spd: 1050, life: 0.5, spread: 0.035, rel: 1.5, snd: 'rifle', vdmg: 3 },
  br: { n: 'SCAR', s: 'SCAR', mag: 20, res: 100, rate: 0.21, dmg: 30, spd: 1250, life: 0.6, spread: 0.018, rel: 1.8, snd: 'br', vdmg: 5 },
  ak: { n: 'AK-47', s: 'AK', mag: 30, res: 150, rate: 0.1, dmg: 19, spd: 1000, life: 0.45, spread: 0.048, rel: 1.6, snd: 'br', vdmg: 3 },
  smg: { n: 'SMG', s: 'SMG', mag: 32, res: 160, rate: 0.065, dmg: 12, spd: 900, life: 0.32, spread: 0.06, rel: 1.3, snd: 'rifle', vdmg: 1 },
  shotgun: { n: 'SHOTGUN', s: 'SHOTGUN', mag: 6, res: 36, rate: 0.8, dmg: 14, pel: 8, spd: 880, life: 0.26, spread: 0.17, rel: 2.2, snd: 'shotgun', vdmg: 3 },
  lmg: { n: 'LMG', s: 'LMG', mag: 100, res: 200, rate: 0.085, dmg: 16, spd: 1100, life: 0.6, spread: 0.06, rel: 3.2, snd: 'mg', vdmg: 4 },
  hmg: { n: 'HEAVY MG', s: 'HMG', mag: 60, res: 180, rate: 0.125, dmg: 25, spd: 1200, life: 0.65, spread: 0.05, rel: 3.0, snd: 'mg', vdmg: 8 },
  sniper: { n: '.50 CAL', s: '.50 CAL', mag: 5, res: 30, rate: 1.2, dmg: 100, spd: 2000, life: 0.55, spread: 0.003, rel: 2.4, snd: 'sniper', vdmg: 20, scope: 1 },
  dmr: { n: 'MARKSMAN RIFLE', s: 'DMR', mag: 10, res: 60, rate: 0.33, dmg: 45, spd: 1600, life: 0.5, spread: 0.012, rel: 2.0, snd: 'br', vdmg: 6, scope: 1 },
  pistol: { n: 'PISTOL', s: 'PISTOL', mag: 12, res: 60, rate: 0.2, dmg: 22, spd: 900, life: 0.36, spread: 0.04, rel: 1.1, snd: 'pistol', vdmg: 1 },
  mp: { n: 'MACHINE PISTOL', s: 'M-PISTOL', mag: 20, res: 80, rate: 0.075, dmg: 12, spd: 850, life: 0.3, spread: 0.075, rel: 1.3, snd: 'pistol', vdmg: 1 },
  rpg: { n: 'BAZOOKA', s: 'BAZOOKA', mag: 1, res: 4, rate: 0.5, rel: 1.8, rocket: 1, snd: 'rocket' }
};
const KITS = [
  { id: 'rifleman', n: 'RIFLEMAN', p: ['ar', 'br'], s: 'pistol', secs: ['pistol', 'mp'], nades: 3, g: 'medbag', gn: 'MEDIC BAG', desc: 'Front-line all-rounder. Drops bags that heal everyone nearby.' },
  { id: 'engineer', n: 'ENGINEER', p: ['ak', 'smg', 'shotgun'], s: 'rpg', secs: ['rpg'], nades: 1, g: 'torch', gn: 'REPAIR WRENCH', desc: 'Kills armor with rockets. Hold the gadget to repair vehicles.' },
  { id: 'support', n: 'SUPPORT', p: ['lmg', 'hmg'], s: 'pistol', secs: ['pistol', 'mp'], nades: 2, g: 'ammo', gn: 'AMMO BOX', desc: 'Suppress from cover. Drops boxes that refill ammo and grenades.' },
  { id: 'recon', n: 'RECON', p: ['sniper', 'dmr'], s: 'pistol', secs: ['pistol', 'mp'], nades: 1, g: 'mine', gn: 'AT MINES', desc: 'Long-range kills. Spots enemies for the team. Mines roads.' }];

/* throwable loadouts: everyone carries frags and smokes, the split is the choice */
const NADE_OPTS = K => [{ f: K.nades, sm: 1 }, { f: Math.max(0, K.nades - 1), sm: 2 }];
/* loadout slots shown on the deploy screen; each returns its options for a class */
const SLOTS = [
  { id: 'var', n: 'PRIMARY', opts: K => K.p.map(id => ({ wid: id, txt: WPN[id].n })) },
  { id: 'sec', n: 'SIDEARM', opts: K => K.secs.map(id => ({ wid: id, txt: WPN[id].n })) },
  { id: 'nt', n: 'THROWABLES', opts: K => NADE_OPTS(K).map(o => ({ icon: 'nades', f: o.f, sm: o.sm, txt: `${o.f}  ${o.sm}` })) },
  { id: 'gad', n: 'GADGET', opts: K => [{ icon: K.g, txt: K.gn }] }];

/* ---------------- canvas ---------------- */
const cv = document.getElementById('c');
let ctx = cv.getContext('2d');
/* soldier/vehicle shadows are drawn opaque into their own layer, then that whole layer is faded once, so overlaps never darken */
const SHC = document.createElement('canvas'); let SHX = SHC.getContext('2d');
let W = 0, H = 0, DPR = 1;
const SAFE = { t: 0, r: 0, b: 0, l: 0 };
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
document.body.appendChild(probe);
let ROT = false; const TOUCHDEV = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  // a phone held upright: the canvas turns sideways so the game is always landscape
  ROT = TOUCHDEV && innerHeight > innerWidth * 1.05; W = ROT ? innerHeight : innerWidth; H = ROT ? innerWidth : innerHeight;
  cv.style.width = ROT ? W + 'px' : ''; cv.style.height = ROT ? H + 'px' : ''; cv.style.right = cv.style.bottom = ROT ? 'auto' : '';
  cv.style.transformOrigin = ROT ? '0 0' : ''; cv.style.transform = ROT ? `translateX(${innerWidth}px) rotate(90deg)` : '';
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  const cs = getComputedStyle(probe), st = parseFloat(cs.paddingTop) || 0, sr = parseFloat(cs.paddingRight) || 0, sb = parseFloat(cs.paddingBottom) || 0, sl = parseFloat(cs.paddingLeft) || 0;
  if (ROT) { SAFE.t = sr; SAFE.r = sb; SAFE.b = sl; SAFE.l = st; } else { SAFE.t = st; SAFE.r = sr; SAFE.b = sb; SAFE.l = sl; }
  if (typeof M !== 'undefined' && M) layoutViews();
}
addEventListener('resize', resize);
/* screen point → game point (the canvas may be turned sideways) */
const ptXY = e => ROT ? [e.clientY, innerWidth - e.clientX] : [e.clientX, e.clientY];
/* iPhone Safari has no page fullscreen: there it's Share → Add to Home Screen */
const fsOK = () => { const el = document.documentElement; return !!(el && (el.requestFullscreen || el.webkitRequestFullscreen)); };
const isFS = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function toggleFullscreen() {
  if (!isFS()) { goFullscreen(); return; }
  try { const ex = document.exitFullscreen || document.webkitExitFullscreen, p = ex && ex.call(document); if (p && p.catch) p.catch(() => { }); } catch (e) { }
}
function goFullscreen() {
  const el = document.documentElement, rq = el.requestFullscreen || el.webkitRequestFullscreen;
  try { const p = rq && rq.call(el, { navigationUI: 'hide' }); if (p && p.then) p.then(() => { try { const o = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (o && o.catch) o.catch(() => { }); } catch (e) { } }).catch(() => { }); } catch (e) { }
}

/* ---------------- assets ---------------- */
const IMG = new Image();
let imgReady = false, SRC = IMG, BASE = IMG, GRIT_ATLAS = null;
IMG.onload = () => { imgReady = true; buildAssets(); };
/* The atlas ships one dark-green soldier per pose with a white armband. Each team colour gets its own copy (armband painted
   in that colour), laid out below the shipped atlas and registered as ATLAS['sol_<pose>_<colour>'] right away, so lookups
   work before the image loads; the pixels are painted once when it does (buildTeamSprites). */
const SOL_POSES = Object.keys(ATLAS).filter(n => n.startsWith('sol_')).map(n => n.slice(4));
const TEAM_SPR = [];
{
  let aw = 0, ah = 0; for (const n in ATLAS) { const m = ATLAS[n]; aw = Math.max(aw, m[0] + m[2]); ah = Math.max(ah, m[1] + m[3]); }
  let x = 0, y = ah + 2, rowh = 0;
  for (const c of ['red', 'orange', 'yellow', 'green', 'blue', 'cyan', 'magenta', 'white', 'black']) for (const p of SOL_POSES) {
    const b = ATLAS['sol_' + p]; if (x + b[2] > aw) { x = 0; y += rowh + 1; rowh = 0; }
    ATLAS['sol_' + p + '_' + c] = [x, y, b[2], b[3], b[4], b[5]]; TEAM_SPR.push(['sol_' + p, c, x, y]); x += b[2] + 1; rowh = Math.max(rowh, b[3]);
  }
  TEAM_SPR.w = aw; TEAM_SPR.h = y + rowh;
}
const hexRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function buildTeamSprites() {
  const c = mk(Math.max(IMG.width, TEAM_SPR.w), Math.max(IMG.height, TEAM_SPR.h)), g = c.getContext('2d'); g.drawImage(IMG, 0, 0);
  try {
    for (const [base, col, x, y] of TEAM_SPR) {
      const b = ATLAS[base], d = g.getImageData(b[0], b[1], b[2], b[3]), p = d.data, [r, gg, bb] = hexRGB(CHEX_C[col]);
      for (let i = 0; i < p.length; i += 4) if (p[i + 3] && p[i] === 255 && p[i + 1] === 255 && p[i + 2] === 255) { p[i] = r; p[i + 1] = gg; p[i + 2] = bb; }
      g.putImageData(d, x, y);
    }
  } catch (e) { for (const [base, , x, y] of TEAM_SPR) { const b = ATLAS[base]; g.drawImage(IMG, b[0], b[1], b[2], b[3], x, y, b[2], b[3]); } }
  BASE = c;
}
/* a white sprite (turret stripe, jeep emblem) in a team colour, cached. Its grey levels pick the tone, as in the artist's
   coloured versions: pure white = highlight, near-white = the colour, light grey = shade, darker greys = metal with a hint of it */
const TINTS = new Map();
function tinted(name, col) {
  const key = name + '|' + col + '|' + CFG.style; let c = TINTS.get(key); if (c) return c;
  const m = ATLAS[name]; c = mk(m[2], m[3]); const g = c.getContext('2d'); g.drawImage(BASE, m[0], m[1], m[2], m[3], 0, 0, m[2], m[3]);
  try {
    const d = g.getImageData(0, 0, m[2], m[3]), p = d.data, [r, gg, bb] = hexRGB(CHEX_C[col] || '#ffffff'), grit = CFG.style === 'grit';
    const hi = Math.max(r, gg, bb, 1), C = [r * 255 / hi, gg * 255 / hi, bb * 255 / hi];      // the colour at full brightness, like the artist's paint
    for (let i = 0; i < p.length; i += 4) {
      if (!p[i + 3]) continue; const L = p[i];
      for (let k = 0; k < 3; k++) p[i + k] = L >= 255 ? lerp(C[k], 255, 0.48) : L >= 240 ? C[k] : L >= 160 ? C[k] * 0.54 : lerp(L, L * C[k] / 255, 0.5) * 0.85;
      if (grit) gritPx(p, i);
    }
    g.putImageData(d, 0, 0);
  } catch (e) { g.globalCompositeOperation = 'multiply'; g.fillStyle = CHEX_C[col] || '#fff'; g.fillRect(0, 0, m[2], m[3]); g.globalCompositeOperation = 'destination-in'; g.drawImage(BASE, m[0], m[1], m[2], m[3], 0, 0, m[2], m[3]); }
  TINTS.set(key, c); return c;
}
IMG.src = ATLAS_SRC;
const SPR = {};
function softDot(rgb, size, stops) {
  const c = mk(size, size), g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [t, a] of stops || [[0, 1], [0.45, 0.55], [1, 0]]) gr.addColorStop(t, `rgba(${rgb},${a})`);
  g.fillStyle = gr; g.fillRect(0, 0, size, size); return c;
}
/* a tracer streak, head at the right end (x = L): white-hot tip, orange core fading out toward the tail, a soft glow of
   3 rows either side. cr: core rows */
function tracer(L, cr) {
  const W = L + 2, H = cr + 6, c = mk(W, H), g = c.getContext('2d'), d = g.createImageData(W, H), GL = [0, 0.32, 0.15, 0.05];
  for (let x = 0; x < W; x++) {     // the glow follows the core's fade, so it never outlasts it (no twin tails)
    const t = Math.min(1, x / L), hot = clamp((x - L + 5) / 4, 0, 1), tip = x > L ? 0.35 : 1;
    for (let y = 0; y < H; y++) {
      const r = y < 3 ? 3 - y : y >= 3 + cr ? y - 2 - cr : 0, core = t ** 1.3, a = (r ? GL[r] * Math.min(1, core * 1.5) : core) * tip, i = (y * W + x) * 4, h = r ? hot * 0.4 : hot;
      d.data[i] = 255; d.data[i + 1] = Math.round(167 + 66 * h); d.data[i + 2] = Math.round(193 * h); d.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(d, 0, 0); c.L = L; return c;
}
/* muted "grit" version of the whole atlas: desaturate, olive tint, slight crush */
function gritPx(p, i) {
  const r = p[i], gg = p[i + 1], b = p[i + 2], l = 0.3 * r + 0.59 * gg + 0.11 * b, k = 0.45;
  let nr = lerp(r, l, k) * 0.94, ng = lerp(gg, l, k) * 0.92, nb = lerp(b, l, k) * 0.8;
  const blood = r > 120 && gg < 60 && b < 60; if (blood) { nr = r * 0.62; ng = gg * 0.4; nb = b * 0.4; }
  p[i] = nr; p[i + 1] = ng; p[i + 2] = nb;
}
function buildGrit() {
  const c = mk(BASE.width, BASE.height), g = c.getContext('2d'); g.drawImage(BASE, 0, 0);
  try {
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) if (p[i + 3]) gritPx(p, i);
    g.putImageData(d, 0, 0);
  } catch (e) { g.filter = 'saturate(0.5) sepia(0.2) brightness(0.9)'; g.drawImage(BASE, 0, 0); }
  GRIT_ATLAS = c;
}
function buildAssets() {
  buildTeamSprites();
  buildGrit();
  SPR.smoke = softDot('70,70,70', 64); SPR.dust = softDot('150,135,95', 64); SPR.fire = softDot('255,150,40', 64);
  SPR.hot = softDot('255,240,180', 64); SPR.flash = softDot('255,220,120', 64);
  SPR.flashSoft = softDot('255,226,150', 64, [[0, 0.8], [0.15, 0.62], [0.4, 0.3], [0.7, 0.09], [1, 0]]);     // MG core: no hard white disc
  SPR.tracer = [tracer(26, 1), tracer(34, 2), tracer(42, 2)];     // rifle, MG, heavy rounds
  SPR.steam = softDot('200,200,200', 64); SPR.puffs = { grey: [[236, 238, 236], [214, 218, 218], [246, 244, 236], [196, 200, 200]], brown: [[150, 112, 76], [136, 104, 74], [162, 126, 90], [126, 96, 68]] };
  for (const k in SPR.puffs) SPR.puffs[k] = SPR.puffs[k].map(c => [softDot(c.join(','), 64), softDot(c.map(v => Math.round(v * 0.72)).join(','), 64)]);   // smoke grey / dust brown: light + dark puff per shade
  // grain tile
  { const c = mk(256, 256), g = c.getContext('2d'), d = g.createImageData(256, 256); for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); SPR.grain = c; }
  // crate
  { const c = mk(18, 18), g = c.getContext('2d');
    g.fillStyle = '#5a2c00'; g.fillRect(0, 0, 18, 18); g.fillStyle = '#f08a14'; g.fillRect(1, 1, 16, 16); g.fillStyle = '#ffae40'; g.fillRect(1, 1, 16, 2);
    g.fillStyle = '#5a2c00'; g.font = 'bold 13px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 9, 10); SPR.crate = c; }
  applyStyleAssets();
}
/* style-dependent sprites: rings, sandbags, trees */
function applyStyleAssets() {
  const grit = CFG.style === 'grit';
  SRC = grit && GRIT_ATLAS ? GRIT_ATLAS : BASE;
  CHEX = grit ? CHEX_G : CHEX_C;
  TEAMHEX = (typeof M !== 'undefined' && M && M.teamColor) ? M.teamColor.map(c => CHEX[c]) : [CHEX.blue, CHEX.red];
  SKINS.clear(); DARK.clear(); TINTS.clear();
  buildRings();
  { const c = mk(16, 10), g = c.getContext('2d');
    g.fillStyle = grit ? '#3a3020' : '#5c4518'; rr(g, 0, 0, 16, 10, 4); g.fill();
    g.fillStyle = grit ? '#8a7a56' : '#c9a24a'; rr(g, 1, 1, 14, 8, 3); g.fill();
    g.fillStyle = grit ? '#9c8c66' : '#e0bd66'; g.fillRect(3, 2, 9, 2);
    g.fillStyle = grit ? '#5e5238' : '#8a6a28'; g.fillRect(4, 6, 8, 1); g.fillRect(7, 2, 1, 6); SPR.bag = c; }
  SPR.pines = [];
  { const pr = mulberry(91);
    for (let v = 0; v < 4; v++) {
      const S = 72, c = mk(S, S), g = c.getContext('2d'), cx = S / 2, cy = S / 2, spikes = 9 + v;
      const ring = (r0, r1, col, rot) => { g.fillStyle = col; g.beginPath(); for (let i = 0; i <= spikes * 2; i++) { const a = rot + i * Math.PI / spikes, r = i % 2 ? r1 : r0; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.fill(); };
      const rot = pr() * TAU;
      ring(30, 20, grit ? '#141a14' : '#0c2a16', rot); ring(25, 16, grit ? '#24302a' : '#16452a', rot + 0.2); ring(18, 11, grit ? '#34423a' : '#1f5a36', rot + 0.4);
      g.fillStyle = grit ? 'rgba(220,224,226,0.75)' : 'rgba(250,252,255,0.85)'; for (let i = 0; i < 26; i++) { const a = pr() * TAU, r = 6 + pr() * 22; g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2 + pr() * 3, 2); }
      g.fillStyle = grit ? '#3e2e22' : '#4a3020'; g.beginPath(); g.arc(cx, cy, 3, 0, TAU); g.fill();
      SPR.pines.push(c);
    } }
  SPR.trees = [];
  const tr = mulberry(77);
  const tc = grit ? [['#1b2112', 2, 2, 3], ['#2b3519', 0, 0, 0], ['#3b4622', -3, -2, -2], ['#4f5a2e', -8, -4, -4]] : [['#062c06', 2, 2, 3], ['#0e4e0e', 0, 0, 0], ['#1b6a19', -3, -2, -2], ['#2e8a26', -8, -4, -4]];
  for (let v = 0; v < 4; v++) {
    const S = 72, c = mk(S, S), g = c.getContext('2d');
    const blobs = []; for (let i = 0; i < 7; i++) blobs.push([S / 2 + (tr() - 0.5) * 26, S / 2 + (tr() - 0.5) * 26, 12 + tr() * 9]);
    for (const [col, grow, dx, dy] of tc) for (const [x, y, r] of blobs) { g.fillStyle = col; g.beginPath(); g.arc(x + dx, y + dy, Math.max(2, r + grow), 0, TAU); g.fill(); }
    SPR.trees.push(c);
  }
}
function buildRings() {
  if (typeof document === 'undefined') return;
  SPR.ring = [];
  for (const col of ['#c8c8c8', TEAMHEX[0], TEAMHEX[1]]) {
    const c = mk(128, 128), g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.59)'; g.beginPath(); g.arc(64, 64, 63.3, 0, TAU); g.arc(64, 64, 42.6, 0, TAU, true); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.fillRect(63, 0, 2, 128); g.fillRect(0, 63, 128, 2);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = col; g.globalAlpha = 0.8; g.fillRect(0, 0, 128, 128);
    SPR.ring.push(c);
  }
}
/* vehicle paint: grey stripes + your emblem layer, recolored to whoever is aboard */
const SKINS = new Map();
function vehSkin(name, color) {
  const key = name + '|' + color; let c = SKINS.get(key); if (c) return c;
  const m = ATLAS[name]; c = mk(m[2], m[3]); const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(SRC, m[0], m[1], m[2], m[3], 0, 0, m[2], m[3]);
  const px = m[4], py = m[5];
  // the artist's colour pieces only: turret stripe bar, jeep hood emblem (white while the jeep is empty, faded to 70 %
  // on the last damage frame, none on the wreck)
  if (color && name === 'tur') { const d = ATLAS.bar; g.drawImage(tinted('bar', color), Math.round(12 - d[4] + 0.5), Math.round(py - d[5])); }
  if (/^jeep[0-3]$/.test(name)) { const d = ATLAS.decal, o = EXTRA.jeepStar; g.globalAlpha = name === 'jeep3' ? 0.7 : 1; g.drawImage(tinted('decal', color), Math.round(px + o[0] - d[4]), Math.round(py + o[1] - d[5])); g.globalAlpha = 1; }
  SKINS.set(key, c); return c;
}
/* darker copies of soldier sprites for bots, so a team reads as one colour family */
const DARK = new Map();
function darkSpr(name) {
  const key = name + '|' + CFG.style; let c = DARK.get(key); if (c) return c;
  const m = ATLAS[name]; c = mk(m[2], m[3]); const g = c.getContext('2d');
  g.drawImage(SRC, m[0], m[1], m[2], m[3], 0, 0, m[2], m[3]);
  try { const d = g.getImageData(0, 0, m[2], m[3]), p = d.data; for (let i = 0; i < p.length; i += 4) { p[i] *= 0.62; p[i + 1] *= 0.62; p[i + 2] *= 0.62; } g.putImageData(d, 0, 0); }
  catch (e) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(0, 0, m[2], m[3]); }
  DARK.set(key, c); return c;
}
/* world->screen transform for the viewport being drawn */
let VZ = 1, VOX = 0, VOY = 0;
let FLASH = 0;                                   // > 0: sprites drawn now are brightened by this much (a vehicle taking a hit)
function worldT() { ctx.setTransform(VZ * DPR, 0, 0, VZ * DPR, VOX * DPR, VOY * DPR); }
let UIS = 1;                                     // extra scale while menus are drawn on the shrunken virtual screen (see uiScaled)
function screenT() { ctx.setTransform(DPR * UIS, 0, 0, DPR * UIS, 0, 0); }
function spr(n, x, y, a, sx, sy, al) {
  const m = ATLAS[n]; if (!m) return;
  const c = Math.cos(a), s = Math.sin(a), k = VZ * DPR; sx = sx || 1; sy = sy || 1;
  ctx.setTransform(c * k * sx, s * k * sx, -s * k * sy, c * k * sy, (x * VZ + VOX) * DPR, (y * VZ + VOY) * DPR);
  if (al !== undefined) ctx.globalAlpha = al;
  ctx.drawImage(SRC, m[0], m[1], m[2], m[3], -m[4], -m[5], m[2], m[3]);
  if (FLASH) lit(() => ctx.drawImage(SRC, m[0], m[1], m[2], m[3], -m[4], -m[5], m[2], m[3]), al);
  if (al !== undefined) ctx.globalAlpha = 1;
}
/* the same draw again, added on top: the art itself brightens, nothing outside its pixels */
function lit(draw, al) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = FLASH * (al === undefined ? 1 : al); draw(); ctx.globalAlpha = al === undefined ? 1 : al; ctx.globalCompositeOperation = 'source-over'; }
function sprC(c, px, py, x, y, a, al, sx) {
  const cs = Math.cos(a), sn = Math.sin(a), k = VZ * DPR, kx = k * (sx || 1);
  ctx.setTransform(cs * kx, sn * kx, -sn * k, cs * k, (x * VZ + VOX) * DPR, (y * VZ + VOY) * DPR);
  if (al !== undefined) ctx.globalAlpha = al;
  ctx.drawImage(c, -px, -py);
  if (FLASH) lit(() => ctx.drawImage(c, -px, -py), al);
  if (al !== undefined) ctx.globalAlpha = 1;
}
function img(c, x, y, a, s, al) {
  const cs = Math.cos(a) * s, sn = Math.sin(a) * s, k = VZ * DPR;
  ctx.setTransform(cs * k, sn * k, -sn * k, cs * k, (x * VZ + VOX) * DPR, (y * VZ + VOY) * DPR);
  if (al !== undefined) ctx.globalAlpha = al;
  ctx.drawImage(c, -c.width / 2, -c.height / 2);
  if (FLASH) lit(() => ctx.drawImage(c, -c.width / 2, -c.height / 2), al);
  if (al !== undefined) ctx.globalAlpha = 1;
}
/* screen-space sprite with rotation, drawn from the active art style */
function uiSprR(n, x, y, a, s, al) {
  const m = ATLAS[n]; if (!m) return; const D = DPR * UIS, c = Math.cos(a) * s * D, sn = Math.sin(a) * s * D;
  ctx.setTransform(c, sn, -sn, c, x * D, y * D); ctx.imageSmoothingEnabled = false; if (al !== undefined) ctx.globalAlpha = al;
  ctx.drawImage(SRC, m[0], m[1], m[2], m[3], -m[4], -m[5], m[2], m[3]); ctx.globalAlpha = 1; screenT();
}
function uiSpr(n, x, y, s, al) {
  const m = ATLAS[n]; if (!m) return;
  const D = DPR * UIS; ctx.setTransform(D * s, 0, 0, D * s, x * D, y * D);
  if (al !== undefined) ctx.globalAlpha = al;
  ctx.drawImage(BASE, m[0], m[1], m[2], m[3], -m[2] / 2, -m[3] / 2, m[2], m[3]);
  ctx.globalAlpha = 1; screenT();
}

/* ---------------- audio ---------------- */
const AU = { ctx: null, sfx: null, mus: null, noise: null, sfxOn: store.get('sfx', true), musOn: store.get('mus', true), last: {}, rain: null };
function audioInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  try {
    const c = new C(); AU.ctx = c;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.connect(c.destination);
    const lim = c.createDynamicsCompressor(); lim.threshold.value = -4; lim.ratio.value = 14; lim.attack.value = 0.002; lim.release.value = 0.12; lim.connect(comp);
    AU.ear = c.createBiquadFilter(); AU.ear.type = 'lowpass'; AU.ear.frequency.value = 20000; AU.ear.Q.value = 0.5; AU.ear.connect(lim);
    const master = c.createGain(); master.gain.value = 0.85; master.connect(AU.ear); AU.master = master;
    // game sounds go through AU.muf, a lowpass that closes while a menu is up (audioTick); menu clicks skip it (AU.ui)
    AU.muf = c.createBiquadFilter(); AU.muf.type = 'lowpass'; AU.muf.frequency.value = 20000; AU.muf.Q.value = 0.6; AU.muf.connect(master);
    AU.sfx = c.createGain(); AU.sfx.connect(AU.muf); AU.ui = c.createGain(); AU.ui.connect(master); AU.mus = c.createGain(); AU.mus.connect(master);
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; AU.noise = b;
    // generated reverb tail (outdoor slap + long decay) and a soft-clip curve for punchy transients
    const L = Math.floor(c.sampleRate * 2.2), ir = c.createBuffer(2, L, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const q = ir.getChannelData(ch); for (let i = 0; i < L; i++) { const t = i / c.sampleRate; q[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, 3.2) * (t < 0.09 ? 0.35 : 1) + (Math.abs(t - 0.11 - ch * 0.013) < 0.004 ? (Math.random() - 0.5) * 1.6 : 0); } }
    AU.verb = c.createConvolver(); AU.verb.buffer = ir; AU.verbIn = c.createGain(); AU.verbIn.gain.value = 0.6; AU.verbIn.connect(AU.verb); AU.verb.connect(AU.muf);
    const cur = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cur[i] = Math.tanh(x * 3.2) / Math.tanh(3.2); } AU.curve = cur;
    applyMute(); Music.start();
  } catch (e) { AU.ctx = null; }
}
function applyMute() { if (!AU.ctx) return; AU.sfx.gain.value = AU.sfxOn && !AU.pz ? 0.75 : 0; AU.ui.gain.value = AU.sfxOn ? 0.75 : 0; AU.mus.gain.value = AU.musOn ? 0.3 : 0; }
/* menus muffle the battle behind them (the demo battle on the title screen, the match under pause / lobby / settings) */
function audioTick() {
  if (!AU.ctx || !AU.muf) return;
  const menu = SET.open || state !== 'play' || !M || M.demo, f = menu ? 520 : 20000;
  const pz = !!(M && !M.demo && (state === 'pause' || (SET.open && SET.from === 'pause')));   // paused match: battle sounds go quiet, come back on unpause
  if (AU.pz !== pz) { AU.pz = pz; AU.sfx.gain.cancelScheduledValues(AU.ctx.currentTime); AU.sfx.gain.setTargetAtTime(AU.sfxOn && !pz ? 0.75 : 0, AU.ctx.currentTime, pz ? 0.04 : 0.1); }
  if (AU.mufOn !== menu) { AU.mufOn = menu; AU.muf.frequency.cancelScheduledValues(AU.ctx.currentTime); AU.muf.frequency.setTargetAtTime(f, AU.ctx.currentTime, menu ? 0.06 : 0.12); }
}
const UISFX = { ui: 1, join: 1, leave: 1 };
function rainAudio(on) {
  if (!AU.ctx) return;
  if (on && !AU.rain) {
    const c = AU.ctx, s = c.createBufferSource(); s.buffer = AU.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.4;
    const g = c.createGain(); g.gain.value = 0.05; s.connect(f); f.connect(g); g.connect(AU.sfx); s.start(); AU.rain = { s, g };
  } else if (!on && AU.rain) { try { AU.rain.s.stop(); } catch (e) { } AU.rain = null; }
}
function outNode(pan) { const c = AU.ctx; if (!pan || !c.createStereoPanner) return AU.sfx; const p = c.createStereoPanner(); p.pan.value = clamp(pan, -0.9, 0.9); p.connect(AU.sfx); return p; }
function tone(o) {
  const c = AU.ctx; if (!c || !AU.sfxOn) return;
  const t = o.t || 0.1, v = o.v || 0.2, now = c.currentTime + (o.delay || 0);
  const os = c.createOscillator(); os.type = o.type || 'square'; os.frequency.setValueAtTime(o.f, now);
  if (o.f2) os.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), now + t);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(v, now + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, now + t);
  os.connect(g); g.connect(o.out || AU.sfx); os.start(now); os.stop(now + t + 0.03);
}
function noise(o) {
  const c = AU.ctx; if (!c || !AU.sfxOn) return;
  const t = o.t || 0.2, v = o.v || 0.2, now = c.currentTime + (o.delay || 0);
  const s = c.createBufferSource(); s.buffer = AU.noise;
  const f = c.createBiquadFilter(); f.type = o.ft || 'lowpass'; f.frequency.setValueAtTime(o.f || 1000, now); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, now + t); f.Q.value = o.q || 0.8;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(v, now + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, now + t);
  s.connect(f); f.connect(g); g.connect(o.out || AU.sfx); s.start(now, Math.random() * 1.5); s.stop(now + t + 0.03);
}
function thr(k, ms) { const n = performance.now(); if (AU.last[k] && n - AU.last[k] < ms) return false; AU.last[k] = n; return true; }
function hear(x, y) {
  if (!M || !M.views.length) return { v: 0.5, p: 0 };
  let best = 0, pan = 0;
  for (const vw of M.views) {
    const R = Math.max(vw.w, vw.h) / vw.cam.z * 0.75, d = Math.hypot(x - vw.cam.x, y - vw.cam.y);
    const k = d < R ? 1 - 0.45 * d / R : Math.max(0, 0.55 * (1 - (d - R) / (R * 1.4)));
    if (k > best) { best = k; pan = M.views.length === 1 ? (x - vw.cam.x) / R : 0; }
  }
  return { v: best, p: pan };
}
function sfx(name, x, y, mul) {
  if (!UISFX[name] || !AU.ui) return sfx1(name, x, y, mul);
  const k = AU.sfx; AU.sfx = AU.ui; try { return sfx1(name, x, y, mul); } finally { AU.sfx = k; }      // menu clicks: not muffled
}
function sfx1(name, x, y, mul) {
  if (NET.role === 'host' && x !== undefined && NETSFX_I[name] !== undefined) netEv('s', NETSFX_I[name], x | 0, y | 0, Math.round((mul || 1) * 10));
  if (!AU.ctx || !AU.sfxOn) return;
  if (CFG.sound !== 'classic' && SFX2[name] && sfx2(name, x, y, mul)) return;
  const h = x === undefined ? { v: 1, p: 0 } : hear(x, y); const v = h.v * (mul || 1) * (M && M.demo ? 0.35 : 1); if (v < 0.03) return;
  const out = outNode(h.p);
  switch (name) {
    case 'rifle': if (!thr('rifle', 35)) return; noise({ t: 0.09, v: 0.26 * v, ft: 'bandpass', f: 1500, f2: 500, q: 0.9, out }); tone({ type: 'square', f: 160, f2: 60, t: 0.06, v: 0.12 * v, out }); break;
    case 'br': if (!thr('br', 40)) return; noise({ t: 0.14, v: 0.32 * v, ft: 'bandpass', f: 1200, f2: 300, q: 0.8, out }); tone({ type: 'square', f: 120, f2: 45, t: 0.09, v: 0.16 * v, out }); break;
    case 'pistol': if (!thr('pistol', 40)) return; noise({ t: 0.07, v: 0.22 * v, ft: 'bandpass', f: 2200, f2: 800, q: 1, out }); tone({ type: 'square', f: 220, f2: 90, t: 0.05, v: 0.1 * v, out }); break;
    case 'shotgun': noise({ t: 0.25, v: 0.45 * v, f: 2400, f2: 200, q: 0.6, out }); tone({ type: 'square', f: 90, f2: 35, t: 0.15, v: 0.2 * v, out }); tone({ type: 'square', f: 900, t: 0.03, v: 0.06 * v, out, delay: 0.35 }); tone({ type: 'square', f: 700, t: 0.03, v: 0.06 * v, out, delay: 0.45 }); break;
    case 'sniper': noise({ t: 0.35, v: 0.5 * v, ft: 'bandpass', f: 2800, f2: 400, q: 0.7, out }); tone({ type: 'square', f: 140, f2: 40, t: 0.2, v: 0.22 * v, out }); tone({ type: 'square', f: 1100, t: 0.03, v: 0.06 * v, out, delay: 0.6 }); break;
    case 'mg': if (!thr('mg', 40)) return; noise({ t: 0.07, v: 0.3 * v, ft: 'bandpass', f: 2200, f2: 700, q: 1, out }); tone({ type: 'square', f: 110, f2: 50, t: 0.05, v: 0.14 * v, out }); break;
    case 'cannon': noise({ t: 0.8, v: 0.55 * v, f: 1400, f2: 80, q: 0.5, out }); tone({ type: 'sine', f: 95, f2: 30, t: 0.6, v: 0.6 * v, out }); break;
    case 'boom': if (!thr('boom', 50)) return; noise({ t: 1.1, v: 0.6 * v, f: 1800, f2: 50, q: 0.5, out }); tone({ type: 'sine', f: 80, f2: 22, t: 0.8, v: 0.6 * v, out }); break;
    case 'bigboom': noise({ t: 1.8, v: 0.7 * v, f: 1200, f2: 40, q: 0.5, out }); tone({ type: 'sine', f: 60, f2: 18, t: 1.4, v: 0.7 * v, out }); noise({ t: 0.5, v: 0.3 * v, ft: 'highpass', f: 3000, out, delay: 0.05 }); break;
    case 'rocket': noise({ t: 0.6, v: 0.32 * v, ft: 'bandpass', f: 400, f2: 2600, q: 1.2, out }); break;
    case 'throw': tone({ type: 'triangle', f: 300, f2: 500, t: 0.08, v: 0.08 * v, out }); break;
    case 'clink': if (!thr('clink', 60)) return; tone({ type: 'triangle', f: 1900, f2: 1500, t: 0.05, v: 0.1 * v, out }); break;
    case 'splat': if (!thr('splat', 40)) return; noise({ t: 0.18, v: 0.3 * v, f: 700, f2: 150, out }); tone({ type: 'sine', f: 180, f2: 55, t: 0.16, v: 0.25 * v, out }); break;
    case 'hurt': if (!thr('hurt', 120)) return; tone({ type: 'sawtooth', f: rnd(190, 240), f2: 120, t: 0.12, v: 0.1 * v, out }); break;
    case 'hit': if (!thr('hit', 45)) return; tone({ type: 'square', f: 1400, f2: 900, t: 0.03, v: 0.06, out: AU.sfx }); break;
    case 'whiz': if (!thr('whiz', 90)) return; noise({ t: 0.12, v: 0.12, ft: 'bandpass', f: 3500, f2: 1400, q: 3, out }); break;
    case 'ting': if (!thr('ting', 45)) return; tone({ type: 'triangle', f: 2400, f2: 1800, t: 0.05, v: 0.06 * v, out }); break;
    case 'reload': tone({ type: 'square', f: 900, t: 0.03, v: 0.06 * v, out }); tone({ type: 'square', f: 600, t: 0.04, v: 0.07 * v, out, delay: 0.25 }); tone({ type: 'square', f: 1100, t: 0.03, v: 0.07 * v, out, delay: 1.0 }); break;
    case 'empty': if (!thr('empty', 200)) return; tone({ type: 'square', f: 1200, t: 0.02, v: 0.05 * v, out }); break;
    case 'door': noise({ t: 0.12, v: 0.3 * v, f: 400, f2: 120, out }); tone({ type: 'square', f: 95, f2: 70, t: 0.08, v: 0.12 * v, out }); break;
    case 'shuffle': noise({ t: 0.35, v: 0.12 * v, ft: 'bandpass', f: 700, f2: 1200, q: 2, out }); break;
    case 'rustle': if (!thr('rustle', 150)) return; noise({ t: 0.18, v: 0.08 * v, ft: 'bandpass', f: 900, f2: 500, q: 1.5, out }); break;
    case 'glass': if (!thr('glass', 70)) return; noise({ t: 0.22, v: 0.22 * v, ft: 'highpass', f: 4200, out }); for (let i = 0; i < 4; i++) tone({ type: 'triangle', f: rnd(2600, 5200), f2: rnd(1800, 3000), t: 0.05, v: 0.06 * v, out, delay: i * 0.035 + rnd(0, 0.03) }); break;
    case 'crumble': if (!thr('crumble', 120)) return; noise({ t: 1.5, v: 0.5 * v, f: 700, f2: 60, q: 0.6, out }); tone({ type: 'sine', f: 60, f2: 24, t: 1, v: 0.45 * v, out });
      for (let i = 0; i < 7; i++) noise({ t: 0.06, v: 0.14 * v, ft: 'bandpass', f: rnd(700, 2200), q: 2, out, delay: 0.12 + i * 0.11 + rnd(0, 0.08) }); break;     // a rumble, then bricks landing
    case 'crush': if (!thr('crush', 80)) return; noise({ t: 0.3, v: 0.3 * v, f: 500, f2: 90, out }); break;
    case 'crack': noise({ t: 0.4, v: 0.3 * v, ft: 'bandpass', f: 900, f2: 200, q: 1.5, out }); tone({ type: 'square', f: 70, t: 0.15, v: 0.1 * v, out }); break;
    case 'clang': if (!thr('clang', 90)) return; tone({ type: 'square', f: 300, f2: 120, t: 0.12, v: 0.12 * v, out }); noise({ t: 0.1, v: 0.15 * v, f: 2000, out }); break;
    case 'horn': if (!thr('horn', 250)) return; tone({ type: 'square', f: 392, t: 0.28, v: 0.09 * v, out }); tone({ type: 'square', f: 494, t: 0.28, v: 0.07 * v, out }); break;
    case 'torch': if (!thr('torch', 150)) return; tone({ type: 'square', f: 2300 + Math.random() * 400, f2: 1500, t: 0.025, v: 0.05 * v, out }); noise({ t: 0.04, v: 0.07 * v, ft: 'bandpass', f: 3200, q: 3, out }); break;     // wrench ratchet
    case 'beep': tone({ type: 'square', f: 1800, t: 0.05, v: 0.05 * v, out }); break;
    case 'splash': if (!thr('splash', 200)) return; noise({ t: 0.25, v: 0.12 * v, ft: 'bandpass', f: 1200, f2: 400, q: 1, out }); break;
    case 'drop': tone({ type: 'square', f: 200, f2: 120, t: 0.08, v: 0.08 * v, out }); break;
    case 'heal': if (!thr('heal', 700)) return; tone({ type: 'sine', f: 880, f2: 1320, t: 0.15, v: 0.05 * v, out }); break;
    case 'pickup': [660, 880, 1320].forEach((f, i) => tone({ type: 'sine', f, t: 0.12, v: 0.12 * v, delay: i * 0.06, out })); break;
    case 'heat': tone({ type: 'sawtooth', f: 200, f2: 80, t: 0.4, v: 0.08 * v, out }); break;
    case 'cap': [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'square', f, t: i === 3 ? 0.5 : 0.14, v: 0.08, delay: i * 0.12 })); break;
    case 'lost': [392, 330, 262].forEach((f, i) => tone({ type: 'square', f, t: 0.22, v: 0.07, delay: i * 0.16 })); break;
    case 'ui': tone({ type: 'square', f: 700, f2: 1000, t: 0.04, v: 0.05 }); break;
    case 'join': tone({ type: 'square', f: 440, t: 0.08, v: 0.08 }); tone({ type: 'square', f: 880, t: 0.14, v: 0.08, delay: 0.07 }); break;
    case 'leave': tone({ type: 'square', f: 600, f2: 300, t: 0.12, v: 0.07 }); break;
    case 'spawn': tone({ type: 'triangle', f: 330, f2: 660, t: 0.18, v: 0.06 }); break;
    case 'jump': tone({ type: 'triangle', f: 180, f2: 260, t: 0.08, v: 0.06 * v, out }); noise({ t: 0.08, v: 0.08 * v, ft: 'bandpass', f: 900, q: 1, out, delay: 0.38 }); break;
    case 'knife': noise({ t: 0.12, v: 0.2 * v, ft: 'bandpass', f: 3000, f2: 1200, q: 2, out }); break;
    case 'thud': tone({ type: 'sine', f: 140, f2: 60, t: 0.12, v: 0.25 * v, out }); break;
    case 'ping': tone({ type: 'sine', f: 1568, t: 0.12, v: 0.06 }); tone({ type: 'sine', f: 2093, t: 0.18, v: 0.05, delay: 0.08 }); break;
    case 'points': if (!thr('points', 120)) return; tone({ type: 'triangle', f: 1046, t: 0.06, v: 0.04 }); break;
    case 'win': [392, 523, 659, 784, 659, 784].forEach((f, i) => tone({ type: 'square', f, t: 0.3, v: 0.08, delay: i * 0.15 })); break;
  }
}
function engineUpdate(v) {
  if (!AU.ctx) return;
  if (CFG.sound !== 'classic') { engineUpdate2(v); return; }
  if (v.eng2) engineStop2(v);
  const driven = v.active && !v.dead && v.T.drive && v.seats[0];
  if (driven && !v.eng) {
    const c = AU.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = v.type === 'tank' ? 260 : 600; g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(AU.sfx); o.start(); v.eng = { o, f, g };
  }
  if (!driven) engineStop(v);
  if (v.eng) {
    const sp = Math.abs(v.spd) / v.T.maxF, h = hear(v.x, v.y), t = AU.ctx.currentTime, base = v.type === 'tank' ? 38 : 70;
    v.eng.o.frequency.setTargetAtTime(base + sp * base * 1.4, t, 0.08);
    v.eng.g.gain.setTargetAtTime((v.type === 'tank' ? 0.1 : 0.06) * (0.4 + sp) * h.v * (AU.sfxOn ? 1 : 0) * (M.demo ? 0.35 : 1), t, 0.1);
  }
}
/* fade the classic engine out; engineOff silences both engine sets */
function engineStop(v) { const e = v.eng; if (!e) return; try { e.g.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.05); e.o.stop(AU.ctx.currentTime + 0.3); } catch (er) { } v.eng = null; }
function engineOff(v) { engineStop(v); engineStop2(v); }
function engineKillAll() { if (!M) return; for (const v of M.vehicles) engineOff(v); loopsKillAll(); }
const Music = {
  step: 0, next: 0, timer: null, bpm: 112, mode: 'menu',
  start() { if (this.timer || !AU.ctx) return; this.next = AU.ctx.currentTime + 0.1; this.timer = setInterval(() => this.tick(), 25); },
  tick() {
    const c = AU.ctx; if (!c) return; if (this.next < c.currentTime - 0.2) this.next = c.currentTime + 0.05;
    const sd = 60 / this.bpm / 4;
    while (this.next < c.currentTime + 0.12) { if (AU.musOn) this.play(this.step, this.next); this.next += sd; this.step = (this.step + 1) % 64; }
  },
  snare(t, v) { const c = AU.ctx, s = c.createBufferSource(); s.buffer = AU.noise; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.7; const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); s.connect(f); f.connect(g); g.connect(AU.mus); s.start(t, Math.random()); s.stop(t + 0.14); },
  kick(t, v) { const c = AU.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g); g.connect(AU.mus); o.start(t); o.stop(t + 0.27); },
  note(t, f, d, v, type) { const c = AU.ctx, o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter(); o.type = type || 'square'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = 1800; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(fl); fl.connect(g); g.connect(AU.mus); o.start(t); o.stop(t + d + 0.05); },
  play(s, t) {
    const st = s % 16, bar = Math.floor(s / 16);
    if (CFG.sound !== 'classic') { music2(this, s, st, bar, t); return; }
    if (this.mode === 'menu') {
      const roll = [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1];
      if (roll[st]) this.snare(t, st % 4 === 0 ? 0.28 : 0.12);
      if (st === 0 || st === 8) this.kick(t, 0.5);
      const mel = [[392, 0], [392, 3], [523, 4], [392, 6], [330, 8], [392, 10], [440, 12], [392, 14]];
      const mel2 = [[349, 0], [349, 3], [440, 4], [349, 6], [294, 8], [330, 10], [349, 12], [392, 14]];
      for (const [f, at] of (bar % 2 ? mel2 : mel)) if (at === st) this.note(t, f / 2, 0.22, 0.05, 'square');
      if (st === 0) this.note(t, bar % 2 ? 87.3 : 98, 1.6, 0.07, 'triangle');
    } else {
      if (st === 0 || st === 10) this.kick(t, 0.32);
      if (st === 4 || st === 12) this.snare(t, 0.06);
      if (st === 0) this.note(t, [55, 55, 49, 52][bar % 4], 2, 0.05, 'triangle');
    }
  }
};

/* ---------------- input ---------------- */
const KB = { keys: Object.create(null), pressed: new Set(), typed: [], wheel: 0, mouse: { x: 0, y: 0, down: false, rdown: false, rclick: false, lclick: null, moved: false } };
addEventListener('wheel', e => { KB.wheel += Math.sign(e.deltaY); }, { passive: true });
const GAMEKEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace', 'F1', 'F2', 'F3', 'F4'];
addEventListener('keydown', e => { if (GAMEKEYS.includes(e.code)) e.preventDefault(); audioInit(); if (!e.repeat) { KB.pressed.add(e.code); KB.typed.push(e.code); } KB.keys[e.code] = true; });
addEventListener('keyup', e => { KB.keys[e.code] = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
/* touch (CoD Mobile / PUBG style): floating move stick on the left (push to the rim to sprint), a fixed fire stick
   bottom-right (drag to aim + fire, tap to fire ahead), free drag on the right aims without firing,
   action buttons arc around the fire stick, contextual buttons (enter vehicle, seats) only appear when usable. */
/* auto: what the right (fire) stick's drag does: 'on' aims and fires, 'off' only aims, 'range' fires by itself when an enemy is lined up and in range */
const AUTO_MODES = ['on', 'off', 'range'];
const TOUCH = { active: false, pts: new Map(), taps: [], btn: {}, hold: {}, scoreOn: false, auto: AUTO_MODES.includes(store.get('autofire', 'on')) ? store.get('autofire', 'on') : 'on' };
const TB = {}; let TB_ON = [];            // buttons drawn this frame (only these can be pressed)
function hitB(x, y, b) { if (!b) return false; if (b.w) return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; return (x - b.x) ** 2 + (y - b.y) ** 2 < (b.r + 8) ** 2; }
cv.addEventListener('pointerdown', e => {
  audioInit(); try { cv.focus({ preventScroll: true }); } catch (_) { }
  const [x, y] = ptXY(e);
  if (e.pointerType === 'mouse' && e.button === 0) fsGesture(x, y);
  if (state === 'play' && M && M.dev && (e.pointerType !== 'mouse' || e.button === 0) && devClick(x, y, e.pointerType === 'touch')) return;   // dev tool panel
  if (e.pointerType === 'touch') {
    e.preventDefault(); TOUCH.active = true;
    const tp = touchPlayer();
    if (state === 'play' && tp && tp.sol && tp.sol.alive) {
      for (const k of TB_ON) if (k !== 'fire' && hitB(x, y, TB[k])) { TOUCH.btn[k] = true; TOUCH.hold[k] = true; TOUCH.pts.set(e.pointerId, { role: 'btn', k }); return; }
      let role, ox = x, oy = y;
      if (TB_ON.includes('fire') && hitB(x, y, { x: TB.fire.x, y: TB.fire.y, r: TB.fire.r + 18 })) role = 'fire';   // drag is measured from where the thumb lands
      else role = x < W * 0.45 ? 'move' : 'aim';
      // a stick belongs to the finger that grabbed it until that finger lifts: a stray palm touch is ignored
      if ([...TOUCH.pts.values()].some(t => t.role === role)) { TOUCH.pts.set(e.pointerId, { role: 'stray' }); return; }
      if (role === 'move' && TOUCH.lockFree) TOUCH.sprintLock = TOUCH.lockFree = false;     // back on the stick after a locked sprint: that ends it
      TOUCH.pts.set(e.pointerId, { role, ox, oy, x, y, t0: performance.now(), full: 0, drag: false });
    } else TOUCH.taps.push({ x, y });
  } else {
    KB.mouse.x = x; KB.mouse.y = y;
    if (e.button === 0) { KB.mouse.down = true; KB.mouse.lclick = { x, y }; }
    if (e.button === 2) { KB.mouse.rclick = true; KB.mouse.rdown = true; }
  }
  try { cv.setPointerCapture(e.pointerId); } catch (_) { }
}, { passive: false });
cv.addEventListener('pointermove', e => {
  const [x, y] = ptXY(e);
  if (e.pointerType === 'touch') { const t = TOUCH.pts.get(e.pointerId); if (t && t.role !== 'btn') { t.x = x; t.y = y; } }
  else { KB.mouse.x = x; KB.mouse.y = y; KB.mouse.moved = true; }
});
/* fullscreen must be asked for inside the tap itself (Safari refuses it from the game loop) */
function fsGesture(x, y) { if (typeof hitUI !== 'function') return; const b = hitUI(x, y); if (b && b.fs && !b.off) toggleFullscreen(); }
function pUp(e) {
  if (e.pointerType !== 'mouse' && e.type === 'pointerup' && state !== 'play') { const [x, y] = ptXY(e); fsGesture(x, y); }
  if (e.pointerType === 'touch') { const t = TOUCH.pts.get(e.pointerId); if (t && t.role === 'btn') TOUCH.hold[t.k] = false; TOUCH.pts.delete(e.pointerId); }
  else { if (e.button === 0 || e.type === 'pointercancel') KB.mouse.down = false; if (e.button === 2 || e.type === 'pointercancel') KB.mouse.rdown = false; }
}
cv.addEventListener('pointerup', pUp); cv.addEventListener('pointercancel', pUp);
cv.addEventListener('lostpointercapture', e => { if (e.pointerType === 'touch') pUp(e); });      // never leave a stick held by a finger we lost track of
function blurAll() { for (const k in KB.keys) KB.keys[k] = false; KB.mouse.down = false; KB.mouse.rdown = false; TOUCH.pts.clear(); TOUCH.hold = {}; if (state === 'play' && M && !M.demo) openPause(null); }
addEventListener('blur', blurAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) blurAll(); });

const PADS = [];
let gpList = [];
function pollPads() { try { gpList = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch (e) { gpList = []; } }
const DZ = (x, y, z) => { const m = Math.hypot(x, y); if (m < z) return [0, 0, 0]; const k = Math.min(1, (m - z) / (1 - z)); return [x / m * k, y / m * k, k]; };
/* Pad (Battlefield / CoD layout):
   LS move · LS-click sprint · RS aim · RS-click melee · RT fire · LT aim down sights · RB grenade · LB gadget
   A jump / vault · B go prone / stand up (in a vehicle: next seat) · X reload · Y enter/exit vehicle, else swap weapon
   D-pad on foot: up spot · down map · left/right throwable (in a vehicle the D-pad picks a seat) · Start pause · View scoreboard */
function padState(i) {
  const gp = gpList[i]; if (!gp || !gp.connected) { PADS[i] = null; return null; }
  const P = PADS[i] || (PADS[i] = { prev: [], sx: 0, sy: 0, bT: -1 });
  const cur = gp.buttons.map(b => !!b && (b.pressed || b.value > 0.45));
  const prev = P.prev; P.prev = cur;
  const b = k => !!cur[k], pr = k => !!cur[k] && !prev[k];
  const ax = gp.axes;
  const [lx, ly] = DZ(ax[0] || 0, ax[1] || 0, 0.2), [rx, ry, rm] = DZ(ax[2] || 0, ax[3] || 0, 0.25);
  const sx = Math.abs(ax[0] || 0) > 0.6 ? Math.sign(ax[0]) : 0, sy = Math.abs(ax[1] || 0) > 0.6 ? Math.sign(ax[1]) : 0;
  const dpX = pr(15) ? 1 : pr(14) ? -1 : 0, dpY = pr(13) ? 1 : pr(12) ? -1 : 0, stX = sx && sx !== P.sx ? sx : 0, stY = sy && sy !== P.sy ? sy : 0;
  let navX = dpX || stX, navY = dpY || stY; P.sx = sx; P.sy = sy;
  let crouch = false, proneT = false; const now = performance.now();
  if (pr(1)) P.bT = now;
  if (cur[1] && P.bT > 0 && now - P.bT > 300) { proneT = true; P.bT = -1; }
  if (!cur[1] && prev[1] && P.bT > 0) { crouch = true; P.bT = -1; }
  return {
    pad: gp, mx: lx, my: ly, aim: rm > 0.25 ? Math.atan2(ry, rx) : null, aimMag: rm,
    fire: b(7), ads: b(6), alt: pr(5), gadget: b(4), gadgetP: pr(4), interact: pr(3), swapW: false, reload: pr(2), crouch, proneT,
    jump: pr(0), melee: pr(11), spot: pr(12), sprint: b(10),
    seatNext: pr(1), seatDir: pr(12) ? 0 : pr(15) ? 1 : pr(13) ? 2 : pr(14) ? 3 : -1, seatIdx: -1,
    pause: pr(9), score: b(8), navX, navY, confirm: pr(0), back: pr(1), join: pr(0) || pr(9), deploy: pr(0),
    tabL: pr(4), tabR: pr(5), opt: pr(8), dpX, dpY, stX, stY, mapT: pr(13), nadeCyc: dpX
  };
}
/* Keyboard + mouse (PC shooter layout):
   WASD · mouse aim · LMB fire · RMB aim down sights · Shift sprint · Space jump/vault · C / Z / Ctrl prone
   R reload · E enter/exit vehicle · G grenade · F gadget · V melee · Q spot · 1/2 or wheel swap weapon · 1-4 / F1-F4 seats in a vehicle */
let KB_CT = -1;
function kbState() {
  const K = c => !!KB.keys[c], P = c => KB.pressed.has(c);
  let crouch = false, proneT = P('KeyZ') || P('ControlLeft'); const now = performance.now();
  if (P('KeyC')) KB_CT = now;
  if (K('KeyC') && KB_CT > 0 && now - KB_CT > 300) { proneT = true; KB_CT = -1; }
  if (!K('KeyC') && KB_CT > 0) { crouch = true; KB_CT = -1; }
  const wheel = KB.wheel; KB.wheel = 0;
  const seatIdx = P('Digit1') || P('F1') ? 0 : P('Digit2') || P('F2') ? 1 : P('Digit3') || P('F3') ? 2 : P('Digit4') || P('F4') ? 3 : -1;
  return {
    kb: true, mx: (K('KeyD') || K('ArrowRight') ? 1 : 0) - (K('KeyA') || K('ArrowLeft') ? 1 : 0),
    my: (K('KeyS') || K('ArrowDown') ? 1 : 0) - (K('KeyW') || K('ArrowUp') ? 1 : 0),
    aim: null, mouse: true, fire: KB.mouse.down, ads: KB.mouse.rdown, alt: P('KeyG'), gadget: K('KeyF'), gadgetP: P('KeyF'), interact: P('KeyE'),
    swapW: !!wheel, pickW: P('Digit1') ? 0 : P('Digit2') ? 1 : -1, reload: P('KeyR'), crouch, proneT,
    jump: P('Space'), melee: P('KeyV'), spot: P('KeyQ'), sprint: K('ShiftLeft') || K('ShiftRight'),
    seatNext: P('KeyF'), seatDir: -1, seatIdx,
    pause: P('Escape') || P('KeyP'), score: K('Tab'),
    navX: (P('ArrowRight') || P('KeyD') ? 1 : 0) - (P('ArrowLeft') || P('KeyA') ? 1 : 0),
    navY: (P('ArrowDown') || P('KeyS') ? 1 : 0) - (P('ArrowUp') || P('KeyW') ? 1 : 0),
    confirm: P('Enter') || P('Space') || P('NumpadEnter'), back: P('Escape') || P('Backspace'), join: P('Enter') || P('Space'),
    deploy: P('Space') || P('Enter'),
    tabL: P('KeyQ'), tabR: P('KeyE'), opt: P('KeyO'), mapT: P('KeyM'), nadeCyc: P('KeyT') ? 1 : 0,
    dpX: (P('ArrowRight') ? 1 : 0) - (P('ArrowLeft') ? 1 : 0), dpY: (P('ArrowDown') ? 1 : 0) - (P('ArrowUp') ? 1 : 0),
    stX: (P('KeyD') ? 1 : 0) - (P('KeyA') ? 1 : 0), stY: (P('KeyS') ? 1 : 0) - (P('KeyW') ? 1 : 0)
  };
}
const TSTICK = 58;
function touchState() {
  const T = TOUCH, now = performance.now(), tp = touchPlayer(), me = tp && tp.sol; let mx = 0, my = 0, aim = null, fire = false, sprint = false, ads = false, aimMag = 0;
  if (!me || !me.alive || me.veh || state !== 'play') T.sprintLock = T.lockFree = false;
  for (const t of T.pts.values()) {
    if (t.role === 'move') {
      let dx = t.x - t.ox, dy = t.y - t.oy; const L = Math.hypot(dx, dy), R = TSTICK;
      if (L > R * 1.25) { t.ox = t.x - dx / L * R * 1.25; t.oy = t.y - dy / L * R * 1.25; }
      const k = Math.min(1, L / R); if (L > 1) { mx = dx / L * k; my = dy / L * k; } if (k < 0.15) mx = my = 0;
      if (L >= R * 0.92 && !(me && me.stance)) { t.full = t.full || now; if (now - t.full > 260) t.auto = true; } else { t.full = 0; t.auto = false; }     // crawling: the rim never stands you up
      sprint = (t.auto || T.sprintLock) && k > 0.3; t.sprint = sprint;
    } else if (t.role === 'fire') {
      // a tap fires straight ahead; only a deliberate drag (24px) turns it into aim-and-fire, and then it stays a drag.
      // AUTO off / range (on foot): the drag only aims (range: and fires itself when lined up); holding without a drag still fires
      const dx = t.x - t.ox, dy = t.y - t.oy, L = Math.hypot(dx, dy), md = me && !me.veh ? T.auto : 'on';
      if (!t.drag && L > 24) t.drag = true;
      if (t.drag && L > 8) { aim = Math.atan2(dy, dx); aimMag = Math.min(1, L / 70); }
      if (md === 'on') fire = true;
      else if (!t.drag) fire = fire || now - t.t0 > 150;
      else if (md === 'range' && aim !== null && autoLined(me, aim)) fire = true;
      if (L > 70) { t.ox = t.x - dx / L * 70; t.oy = t.y - dy / L * 70; }
    } else if (t.role === 'aim') {
      const dx = t.x - t.ox, dy = t.y - t.oy, L = Math.hypot(dx, dy);
      if (L > 10) { aim = Math.atan2(dy, dx); aimMag = Math.min(1, L / 80); ads = true; }
      if (L > 80) { t.ox = t.x - dx / L * 80; t.oy = t.y - dy / L * 80; }
    }
  }
  if (T.hold.lfire) fire = true;                                  // left-thumb fire: shoots where you're aiming/facing
  // sprint lock: keeps running (last direction) after the stick is let go; touching the stick again ends it
  if (T.btn.sprint) { T.sprintLock = !T.sprintLock; T.lockFree = false; T.ldx = mx; T.ldy = my; }
  if (T.sprintLock) {
    if (![...T.pts.values()].some(t => t.role === 'move')) T.lockFree = true;
    if (mx || my) { T.ldx = mx; T.ldy = my; } else { mx = T.ldx || 0; my = T.ldy || 0; }
    const l = Math.hypot(mx, my); if (l > 0.01) { mx /= l; my /= l; sprint = true; } else T.sprintLock = T.lockFree = false;
  }
  T.moving = !!(mx || my);
  const b = T.btn, seatIdx = ['seat0', 'seat1', 'seat2', 'seat3'].findIndex(k => b[k]), pickW = b.w0 ? 0 : b.w1 ? 1 : -1;
  if (b.auto) { T.auto = AUTO_MODES[(AUTO_MODES.indexOf(T.auto) + 1) % 3]; store.set('autofire', T.auto); }
  if (b.score) T.scoreOn = !T.scoreOn; if (state !== 'play') T.scoreOn = false;     // the scoreboard button flips it open and shut
  const s = { touch: true, mx, my, aim, aimMag, fire, ads, alt: !!b.nade, gadget: !!T.hold.gadget, gadgetP: !!b.gadget, swapW: false, pickW, interact: !!(b.enter || b.exit), jump: !!b.jump, melee: !!b.melee, spot: false, reload: !!b.reload, stanceCycle: !!b.stance, sprint, seatNext: false, seatDir: -1, seatIdx, pause: !!b.pause, score: T.scoreOn, navX: 0, navY: 0, confirm: false, back: false, join: false, deploy: false, tabL: false, tabR: false, opt: false, mapT: !!b.map, nadeCyc: b.nadeCyc ? 1 : 0, dpX: 0, dpY: 0, stX: 0, stY: 0 };
  T.btn = {};
  return s;
}
function devState(dev) { return dev.type === 'kb' ? kbState() : dev.type === 'pad' ? padState(dev.index) : touchState(); }
function endInputFrame() { KB.pressed.clear(); KB.typed.length = 0; KB.mouse.rclick = false; KB.mouse.lclick = null; KB.mouse.moved = false; TOUCH.taps.length = 0; }
function rumble(pl, s, d) {
  if (!pl || pl.dev.type !== 'pad') return; const gp = gpList[pl.dev.index]; if (!gp) return;
  const va = gp.vibrationActuator; if (va && va.playEffect) { try { const p = va.playEffect('dual-rumble', { duration: d * 1000, strongMagnitude: s, weakMagnitude: s * 0.6 }); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
}
function touchPlayer() { return PLAYERS.find(p => p.dev.type === 'touch'); }

/* ---------------- settings ---------------- */
const CFG = Object.assign({ mode: 0, map: 0, bots: 5, limit: 1, skill: 1, ff: false, board: false, midjoin: true, camera: 'split', style: 'classic', fogLook: 'grey', weather: 'clear', teamColors: 'player', fog: 'los', sound: 'exp' }, store.get('cfg3', {}));
/* soldiers: one design (dark green, armband in the team colour); poses stand / nogun / rpg / sit / dead / leg0-2 */
function solSpr(color, pose) { return 'sol_' + pose + '_' + color; }
function solShadow(pose) { return ATLAS['nsh_' + pose] ? 'nsh_' + pose : null; }
let M = null, state = 'boot', stateT = 0;
let PLAYERS = [];
/* online play: remote players are PLAYERS with dev.type 'net'; only local ones get views, sound and HUD */
const isNet = p => !!(p && p.dev && p.dev.type === 'net');
const WEATHERS = ['clear', 'rain', 'snow'];
function LOCALS() { return PLAYERS.filter(p => !isNet(p)); }
/* living soldiers of this machine's players; of one view's players (the shared view: all of them); where one is (his vehicle if seated) */
function localSols() { return LOCALS().map(p => p.sol).filter(s => s && s.alive); }
function viewSols(vw) { return (vw.p ? [vw.p] : M.shared ? LOCALS() : []).map(p => p.sol).filter(s => s && s.alive); }
const posOf = s => s.veh || s;
