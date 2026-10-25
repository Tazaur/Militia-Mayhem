/* ================= front end: main menu, settings, local lobby, pause, end screen, main loop ================= */
const MAXP = 4;                                  // local play is capped at four so 2v2 / 4-way split stays even
let UIB = [];                                    // clickable regions from the last drawn frame (mouse + touch)
const PADS_CACHE = [];
const uiU = () => clamp(Math.min(W / 900, H / 520), 0.72, 1.7);
const fpx = (n, u, min) => Math.max(min || 12, n * u);
const PRIME = ['red', 'blue', 'yellow', 'green'];

/* Menus are laid out for at least UI_W x UI_H. A smaller window gets that layout drawn on a virtual screen and
   scaled down as one piece, so edges stay anchored and nothing overlaps or keeps a fixed size. */
const UI_W = 860, UI_H = 480;
function uiScaled(fn) {
  const k = Math.min(1, W / UI_W, H / UI_H);
  if (k < 1) {
    const w0 = W, h0 = H, s0 = { ...SAFE };
    W = w0 / k; H = h0 / k; for (const key in SAFE) SAFE[key] = s0[key] / k; UIS = k; screenT();
    try { fn(); } finally { W = w0; H = h0; Object.assign(SAFE, s0); UIS = 1; screenT(); }
  } else fn();
  for (const b of UIB) if (b.k === undefined) b.k = k;     // each clickable region remembers the scale it was drawn at
}
function hitUI(x, y) { for (let i = UIB.length - 1; i >= 0; i--) { const b = UIB[i], k = b.k || 1, X = x / k, Y = y / k; if (X >= b.x && X <= b.x + b.w && Y >= b.y && Y <= b.y + b.h) return b; } return null; }
function runClicks() {
  const cl = []; if (KB.mouse.lclick) cl.push({ ...KB.mouse.lclick, dev: { type: 'kb' } }); for (const t of TOUCH.taps) cl.push({ ...t, dev: { type: 'touch' } });
  for (const c of cl) { const b = hitUI(c.x, c.y); if (b && b.fn && !b.off) { b.fn(c.dev, c); break; } }
}
function hoverUpdate(set) { if (!KB.mouse.moved) return; const b = hitUI(KB.mouse.x, KB.mouse.y); if (b && b.focus !== undefined) set(b.focus); }
/* every local device, read once per frame (pads use edge detection, so never read twice) */
function allInputs() {
  for (let i = 0; i < 4; i++) PADS_CACHE[i] = padState(i);
  const out = [{ dev: { type: 'kb' }, st: kbState() }];
  for (let i = 0; i < 4; i++) if (PADS_CACHE[i]) out.push({ dev: { type: 'pad', index: i }, st: PADS_CACHE[i] });
  return out;
}
const playerInputs = () => PLAYERS.filter(p => p.raw).map(p => ({ dev: p.dev, st: p.raw, p }));
const anyPad = () => gpList.some(g => g && g.connected);

/* ---------- drawing helpers ---------- */
function panel(x, y, w, h, a) {
  ctx.fillStyle = `rgba(13,19,10,${a === undefined ? 0.97 : a})`; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(242,230,196,0.16)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function button(o) {
  const { x, y, w, h } = o, gold = o.primary && !o.off;
  ctx.fillStyle = o.off ? 'rgba(255,255,255,0.05)' : o.fill ? o.fill : gold ? (o.sel ? '#ffe08a' : '#d1aa55') : o.sel ? 'rgba(255,224,138,0.2)' : 'rgba(32,42,26,0.97)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = o.sel ? '#ffe08a' : 'rgba(242,230,196,0.22)'; ctx.lineWidth = o.sel ? 2.5 : 1; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  const fs = o.size || clamp(h * 0.42, 12, 22), kin = o.key && keyDev(o.key[1]) && !o.keyAt;
  let lx = x + w / 2;
  if (kin) {          // label moves left if the prompt would cover it
    const kw = keyTag(o.key[0], o.key[1], o), kx = x + w - kw - clamp(h * 0.46, 15, 22) * (o.key[1] === 'pad' ? 1.2 : 1) * 0.4;
    ctx.font = `${fs}px ${FD}`; const lw = o.label ? ctx.measureText(o.label).width : 0;
    if (lx + lw / 2 > kx - 6) lx = Math.max(x + lw / 2 + 6, (x + kx) / 2);
  } else if (o.key) keyTag(o.key[0], o.key[1], o, o.keyAt);
  if (o.label) txt(o.label, lx, y + h / 2 + 1, fs, o.off ? 'rgba(255,255,255,0.32)' : o.ink ? o.ink : gold || o.fill ? '#141a10' : o.sel ? '#ffe08a' : '#f0f0e0', 'center', 'middle', FD);
  UIB.push({ x, y, w, h, fn: o.fn, off: o.off, focus: o.focus });
}
function gearIcon(cx, cy, r, col) {
  ctx.fillStyle = col; ctx.beginPath();
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, rr2 = i % 2 ? r : r * 0.78; ctx.lineTo(cx + Math.cos(a - 0.1) * rr2, cy + Math.sin(a - 0.1) * rr2); ctx.lineTo(cx + Math.cos(a + 0.1) * rr2, cy + Math.sin(a + 0.1) * rr2); }
  ctx.closePath(); ctx.fill(); ctx.fillStyle = '#141a10'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.34, 0, TAU); ctx.fill();
}
/* a click already toggled it inside the tap (fsGesture); keys and pads land here with no click */
const FS_FN = (d, c) => { if (!c) toggleFullscreen(); };
function iconButton(x, y, s, kind, fn, sel, key, keyAt) {
  button({ x, y, w: s, h: s, fn, sel, key, keyAt: keyAt || 'left' });
  const cx = x + s / 2, cy = y + s / 2, col = sel ? '#ffe08a' : '#f0f0e0';
  if (kind === 'gear') gearIcon(cx, cy, s * 0.3, col);
  else if (kind === 'close') { ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, s * 0.08); ctx.beginPath(); ctx.moveTo(cx - s * 0.2, cy - s * 0.2); ctx.lineTo(cx + s * 0.2, cy + s * 0.2); ctx.moveTo(cx + s * 0.2, cy - s * 0.2); ctx.lineTo(cx - s * 0.2, cy + s * 0.2); ctx.stroke(); }
  else if (kind === 'full') {     // corners pointing out to go fullscreen, in to leave it
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, s * 0.07); const k = s * 0.22, q = s * 0.1, fs = isFS(); ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const c = fs ? k - q : k, o = fs ? k : k - q; ctx.moveTo(cx + sx * c, cy + sy * o); ctx.lineTo(cx + sx * c, cy + sy * c); ctx.lineTo(cx + sx * o, cy + sy * c); }
    ctx.stroke();
  }
}
/* shadows for UI soldiers go through the same opaque-layer-then-fade path as the game */
function uiShadowLayer(draw, alpha) {
  if (SHC.width !== cv.width || SHC.height !== cv.height) { SHC.width = cv.width; SHC.height = cv.height; SHX = SHC.getContext('2d'); }
  const main = ctx; ctx = SHX; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, SHC.width, SHC.height); ctx.imageSmoothingEnabled = false; screenT();
  draw(); ctx = main;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.drawImage(SHC, 0, 0); ctx.globalAlpha = 1; screenT();
}
function uiSoldier(color, pose, x, y, a, s, al) { uiSprR(solSpr(color, pose), x, y, a, s, al); }
function uiSoldierShadow(pose, x, y, a, s) {
  const n = solShadow(pose);
  if (n) uiSprR(n, x + 2 * s, y + 3 * s, a, s);
  else { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x + 2 * s, y + 3 * s, 9 * s, 7 * s, a, 0, TAU); ctx.fill(); }
}
function crispScale(px) { return Math.max(1, Math.round(px * 2) / 2); }

/* ================= main menu ================= */
const MENU = { sel: 0, spin: 0, msgT: 0 };
function toMenu() { if (NET.role) netShutdown(); engineKillAll(); PLAYERS = []; SET.open = false; MENU.sel = 0; demoMatch(); setState('menu'); Music.mode = 'menu'; }
function enterLobby(dev) { PLAYERS = []; LOBBY.sel = 0; setState('lobby'); if (dev) lobbyJoin(dev); else sfx('ui'); }
function menuAct(i, dev) {
  if (i === 0) enterLobby(dev);
  else if (i === 1) openNetMenu(dev);
  else if (i === 3) startDev(dev);
  else openSettings('menu');
}
function updateMenu(ins, dt) {
  MENU.msgT -= dt; MENU.spin += dt * (MENU.sel === 0 ? 0.35 : 0.08);
  for (const { dev, st } of ins) {
    const dx = st.navX || (st.tabR ? 1 : st.tabL ? -1 : 0);
    if (dx) { MENU.sel = MENU.sel >= 2 ? (dx > 0 ? 1 : 0) : clamp(MENU.sel + dx, 0, 1); sfx('ui'); }
    if (st.navY) { MENU.sel = st.navY < 0 ? (MENU.sel === 3 ? 0 : 2) : MENU.sel === 2 ? 0 : 3; sfx('ui'); }
    if (st.opt) { openSettings('menu'); return; }
    if ((st.confirm || st.pause) && stateT > 0.25) { menuAct(MENU.sel, dev); return; }
  }
  hoverUpdate(v => MENU.sel = v);
  runClicks();
}
function drawGlobe(cx, cy, r, t, al) {
  ctx.save(); ctx.globalAlpha = al;
  ctx.fillStyle = '#163f5c'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
  const land = [[0.2, 0.5, 0.34], [0.9, 0.2, 0.28], [1.5, -0.4, 0.3], [2.3, 0.35, 0.36], [3.1, -0.15, 0.24], [3.9, 0.55, 0.3], [4.6, -0.5, 0.26], [5.4, 0.1, 0.33], [5.9, -0.3, 0.2]];
  ctx.fillStyle = '#4c8a3e';
  for (const [lon, lat, sz] of land) {
    const l = lon + t * 0.45, c = Math.cos(l); if (c < -0.05) continue;
    const x = cx + r * Math.sin(l) * Math.cos(lat), y = cy - r * Math.sin(lat);
    ctx.beginPath(); ctx.ellipse(x, y, sz * r * Math.max(0.15, c) * Math.cos(lat), sz * r * 0.8, 0, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(190,225,255,0.3)'; ctx.lineWidth = Math.max(1, r * 0.03);
  for (let m = 0; m < 6; m++) { const l = ((m / 6) * Math.PI + t * 0.45) % Math.PI; ctx.beginPath(); ctx.ellipse(cx, cy, Math.abs(r * Math.cos(l)), r, 0, 0, TAU); ctx.stroke(); }
  for (const ph of [-0.9, -0.45, 0, 0.45, 0.9]) { const y = cy - r * Math.sin(ph), hw = r * Math.cos(ph); ctx.beginPath(); ctx.moveTo(cx - hw, y); ctx.lineTo(cx + hw, y); ctx.stroke(); }
  const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.35)'); ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  ctx.globalAlpha = al; ctx.strokeStyle = '#9fd0f0'; ctx.lineWidth = Math.max(1.5, r * 0.06); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
}
/* four prime-coloured soldiers: back to back (local) or facing in around a globe (network) */
function squadArt(cx, cy, sc, spin, net, al) {
  const ring = PRIME.map((c, k) => { const ang = spin + Math.PI / 4 + k * Math.PI / 2, d = (net ? 38 : 16) * sc; return { c, x: cx + Math.cos(ang) * d, y: cy + Math.sin(ang) * d, a: net ? ang + Math.PI : ang }; });
  uiShadowLayer(() => { for (const q of ring) uiSoldierShadow('stand', q.x, q.y, q.a, sc); }, 0.38 * al);
  if (net) drawGlobe(cx, cy, 17 * sc, performance.now() / 1000, al);
  for (const q of ring) uiSoldier(q.c, 'stand', q.x, q.y, q.a, sc, al);
}
function drawMenu() {
  screenT(); UIB = [];
  const u = uiU(), L = SAFE.l + 18 * u, R = W - SAFE.r - 18 * u, T = SAFE.t + 14 * u, B = H - SAFE.b - 12 * u;
  ctx.fillStyle = 'rgba(5,8,4,0.7)'; ctx.fillRect(0, 0, W, H);
  stxt('MILITIA MAYHEM', W / 2, T + fpx(46, u, 28), fpx(52, u, 30), '#f2e6c4', 'center', 'alphabetic', FD);
  txt('TANKS · JEEPS · BOOTS ON THE GROUND', W / 2, T + fpx(46, u, 28) + fpx(22, u, 16), fpx(13, u, 11), 'rgba(242,230,196,0.6)', 'center', 'alphabetic', FD);
  const ib = Math.max(44, 44 * u);
  const dv = devOf(null);
  iconButton(R - ib, T, ib, 'gear', () => openSettings('menu'), MENU.sel === 2, ['settings', dv], 'below'); UIB[UIB.length - 1].focus = 2;
  if (fsOK()) { iconButton(R - ib * 2 - 10 * u, T, ib, 'full', FS_FN); UIB[UIB.length - 1].fs = true; }
  const top = T + fpx(46, u, 28) + fpx(40, u, 26), foot = fpx(26, u, 22), avH = B - foot - top;
  const cw = Math.min((R - L - 24 * u) / 2, avH * 1.05, 430 * u), ch = Math.min(avH, cw * 0.98), y0 = top + (avH - ch) / 2;
  for (let i = 0; i < 2; i++) {
    const x = W / 2 + (i === 0 ? -cw - 12 * u : 12 * u), sel = MENU.sel === i, off = i === 1 && NET.avail === false;
    panel(x, y0, cw, ch, 0.94);
    if (sel) { ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y0 + 1.5, cw - 3, ch - 3); }
    UIB.push({ x, y: y0, w: cw, h: ch, fn: d => menuAct(i, d), focus: i });
    const sc = crispScale(Math.min(cw, ch * 1.1) / (i === 0 ? 86 : 120)), artY = y0 + ch * 0.42;
    squadArt(x + cw / 2, artY, sc, i === 0 ? MENU.spin : 0, i === 1, off ? 0.45 : 1);
    const ly = y0 + ch - fpx(46, u, 34);
    txt(i === 0 ? 'LOCAL PLAY' : 'NETWORK PLAY', x + cw / 2, ly, fpx(26, u, 18), off ? 'rgba(240,240,224,0.4)' : sel ? '#ffe08a' : '#f2e6c4', 'center', 'middle', FD);
    txt(i === 0 ? '1–4 PLAYERS · SPLIT OR SHARED SCREEN' : NET.avail === false ? 'NOT AVAILABLE IN THIS BROWSER' : 'HOST OR JOIN · UP TO 4 PLAYERS', x + cw / 2, ly + fpx(24, u, 18), fpx(12, u, 11), off ? 'rgba(240,240,224,0.35)' : '#c8d0b8', 'center', 'middle', FB);
    if (sel && !off) { ctx.font = `${fpx(26, u, 18)}px ${FD}`; const tw2 = ctx.measureText(i === 0 ? 'LOCAL PLAY' : 'NETWORK PLAY').width; keyTag('select', dv, { x: x + cw / 2 - tw2 / 2, y: ly - 17, w: 0, h: 34 }, 'left'); }
  }
  netToast(u);
  { const bw = fpx(110, u, 92), bh = fpx(24, u, 22); button({ x: R - bw, y: B - foot / 2 - bh / 2, w: bw, h: bh, fn: d => menuAct(3, d), sel: MENU.sel === 3, label: 'DEV MODE', size: fpx(12, u, 11), focus: 3 }); }
  txt(`v${VERSION.build}  ·  ${VERSION.date}`, L, B - foot / 2, fpx(11, u, 10), 'rgba(242,230,196,0.45)', 'left', 'middle', FD);
}

/* ================= network menu: host a game, join one by code or from the list ================= */
const NETM = { sel: 0, entry: null };
const CODE_KEYS = CODE_CH.split('').concat(['DEL', 'JOIN']);
const netListShown = () => NET.mode === 'p2p';
function openNetMenu(dev) { if (typeof netListRefresh === 'function') netListRefresh(); NET.err = null; NETM.sel = 0; NETM.entry = null; NETM.dev = dev && dev.type ? dev : { type: 'kb' }; setState('netmenu'); sfx('ui'); }
function netRows() { return netAllHosts().filter(h => h.n < MAXP && (h.st === 'lobby' || h.mj)); }
function netAct(i, dev) {
  if (dev && dev.type) NETM.dev = dev;
  if (!NET.avail || NET.busy) { sfx('leave'); return; }
  if (i === 0) { askName('host'); return; }
  if (i === 1) { NETM.entry = { mode: 'code', code: '', sel: 'q' }; sfx('ui'); return; }
  if (i === 2) { netListRefresh(); sfx('ui'); return; }
  const h = netRows()[i - 3]; if (h) netJoin(h, NETM.dev);
}
const NAME_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').concat(['SPACE', 'DEL', 'OK']);
const padKeys = E => E.mode === 'name' ? NAME_KEYS : CODE_KEYS;
/* on-screen QWERTY in grid units (10 wide, 5 rows); letters a code can't contain (0 1 I L O) are greyed out */
function padLayout(E) {
  const name = E.mode === 'name', valid = padKeys(E), L = [];
  const row = (s, y, x0) => [...s].forEach((c, i) => { const k = name ? c : c.toLowerCase(); L.push({ k, x: x0 + i, y, w: 1, off: !valid.includes(k) }); });
  row('1234567890', 0, 0); row('QWERTYUIOP', 1, 0); row('ASDFGHJKL', 2, 0.5); row('ZXCVBNM', 3, 1.5);
  L.push({ k: 'DEL', x: 8.5, y: 3, w: 1.5 });
  if (name) L.push({ k: 'SPACE', x: 0, y: 4, w: 6 });
  L.push({ k: name ? 'OK' : 'JOIN', x: name ? 6 : 3, y: 4, w: 4 });
  return L;
}
/* pad / arrow movement over the keys: along the row, or to the nearest key in the next row */
function padNav(E, dx, dy) {
  const L = padLayout(E).filter(b => !b.off), cx = b => b.x + b.w / 2;
  let cur = L.find(b => b.k === E.sel) || L[0];
  if (dx) { const r = L.filter(b => b.y === cur.y).sort((a, b) => a.x - b.x); cur = r[(r.indexOf(cur) + dx + r.length) % r.length]; }
  if (dy) { const y = (cur.y + dy + 5) % 5, r = L.filter(b => b.y === y); cur = r.reduce((a, b) => Math.abs(cx(b) - cx(cur)) < Math.abs(cx(a) - cx(cur)) ? b : a); }
  E.sel = cur.k;
}
/* the name step: shown before hosting and after typing a code; the name is remembered on this device */
function askName(next, code) {
  // a name this device already used goes straight through (the name button on the online menu changes it)
  if (next && NET.name) { sfx('ui'); if (next === 'host') netHost(NETM.dev); else netJoin({ c: code }, NETM.dev); return; }
  NETM.entry = { mode: 'name', name: NET.name || '', sel: 'OK', next, code }; sfx('ui'); }
function codeKey(k, kb) {
  const E = NETM.entry; if (!E) return;
  if (E.mode === 'name') {
    if (k === 'DEL') { if (E.name) E.name = E.name.slice(0, -1); else if (!kb) NETM.entry = null; sfx('ui'); return; }
    if (k === 'OK') {
      NET.name = cleanName(E.name).trim(); store.set('name', NET.name); NETM.entry = null; sfx('ui');
      if (E.next === 'host') netHost(NETM.dev); else if (E.next === 'join') netJoin({ c: E.code }, NETM.dev);
      return;
    }
    if (E.name.length < 10) { E.name = cleanName(E.name + (k === 'SPACE' ? ' ' : k)); sfx('ui'); }
    return;
  }
  if (k === 'DEL') { if (E.code) E.code = E.code.slice(0, -1); else if (!kb) NETM.entry = null; sfx('ui'); return; }
  if (k === 'JOIN') { if (E.code.length === 4) askName('join', E.code); else sfx('leave'); return; }
  if (E.code.length < 4) { E.code += k; sfx('ui'); if (E.code.length === 4) E.sel = 'JOIN'; }
}
function updateCodeEntry(ins) {
  const E = NETM.entry, K = padKeys(E), name = E.mode === 'name', done = name ? 'OK' : 'JOIN';
  for (const code of KB.typed) {
    const m = /^(Key|Digit|Numpad)(\w)$/.exec(code); if (m) { const ch = name ? m[2].toUpperCase() : m[2].toLowerCase(); if (K.includes(ch)) codeKey(ch); }
    if (code === 'Space' && name) codeKey('SPACE');
    if (code === 'Backspace') codeKey('DEL', true); if (code === 'Enter' || code === 'NumpadEnter') { codeKey(done); return; } if (code === 'Escape') { NETM.entry = null; sfx('ui'); return; }
    if (NETM.entry !== E) return;
  }
  for (const { dev, st } of ins) {
    if (dev.type !== 'pad') continue;
    if (st.navX) { padNav(E, st.navX, 0); sfx('ui'); }
    if (st.navY) { padNav(E, 0, st.navY); sfx('ui'); }
    if (st.confirm) { NETM.dev = dev; codeKey(E.sel); }
    else if (st.back) codeKey('DEL'); else if (st.pause) { NETM.dev = dev; codeKey(done); }
    if (NETM.entry !== E) return;
  }
  hoverUpdate(v => E.sel = v);
  runClicks();
}
function updateNetMenu(ins, dt) {
  MENU.spin += dt * 0.35;
  if (NET.err) {
    const E = NET.err;
    if (performance.now() - E.t > 600) for (const { st } of ins) {
      if (E.re) { if (st.navX || st.navY) { E.sel = 1 - E.sel; sfx('ui'); } if (st.confirm) { if (E.sel === 0) netReconnect(); else { NET.err = null; sfx('ui'); } return; } if (st.back) { NET.err = null; sfx('ui'); return; } }
      else if (st.confirm || st.back || st.pause) { NET.err = null; sfx('ui'); return; }
    }
    runClicks(); return;
  }
  if (NETM.entry) { updateCodeEntry(ins); return; }
  // 0 host · 1 join with code · 2 refresh the list · 3.. open games
  const list = netListShown(), rows = netRows().length, n = list ? 3 + rows : 2;
  NETM.sel = clamp(NETM.sel, 0, n - 1);
  for (const { dev, st } of ins) {
    if (st.navY) { NETM.sel = (NETM.sel + st.navY + n) % n; sfx('ui'); }
    if (st.navX > 0 && NETM.sel < 2) { NETM.sel = NETM.sel === 0 ? 1 : list ? (rows ? 3 : 2) : 1; sfx('ui'); }
    else if (st.navX < 0 && NETM.sel > 0) { NETM.sel = NETM.sel >= 2 ? 1 : 0; sfx('ui'); }
    if (st.reload && list) { netListRefresh(); sfx('ui'); }
    if (st.back && stateT > 0.25) { toMenu(); return; }
    if (st.opt) { openSettings('menu'); return; }
    if (st.confirm && stateT > 0.25) { netAct(NETM.sel, dev); return; }
  }
  hoverUpdate(v => NETM.sel = v);
  runClicks();
}
/* centred text that shrinks until it fits a width */
function fitTxtC(s, x, y, maxW, size, col, font) {
  let sz = size; ctx.font = `${sz}px ${font || FB}`;
  while (sz > 8 && ctx.measureText(s).width > maxW) { sz -= 0.5; ctx.font = `${sz}px ${font || FB}`; }
  txt(s, x, y, sz, col, 'center', 'middle', font || FB);
}
/* break a "A · B · C" status message into lines that fit */
function dotLines(s, maxW, size, font) {
  ctx.font = `${size}px ${font}`; const out = []; let line = '';
  for (const part of s.split(' · ')) { const t = line ? line + ' · ' + part : part; if (line && ctx.measureText(t).width > maxW) { out.push(line); line = part; } else line = t; }
  if (line) out.push(line); return out;
}
function netToast(u) {
  if (!(NET.msgT > 0) || !NET.msg) return;
  ctx.globalAlpha = Math.min(1, NET.msgT * 2);
  const sz = fpx(15, u, 12), maxW = W - SAFE.l - SAFE.r - 60, lines = dotLines(NET.msg, maxW, sz, FD);
  ctx.font = `${sz}px ${FD}`;
  const w = Math.min(W - 40, Math.max(...lines.map(l => ctx.measureText(l).width)) + 50 * u), lh = sz * 1.45, h = lines.length * lh + 22 * u, y = H - SAFE.b - fpx(48, u, 40) - h;
  panel(W / 2 - w / 2, y, w, h);
  lines.forEach((l, i) => fitTxtC(l, W / 2, y + 11 * u + lh * (i + 0.5), maxW, sz, '#ffe08a', FD));
  ctx.globalAlpha = 1;
}
/* a failed connection: code, what broke, what to try, and the trace (kept until dismissed) */
function drawNetErr(u) {
  const E = NET.err; if (!E) return;
  UIB = E.re ? [] : [{ x: 0, y: 0, w: W, h: H, fn: () => { if (performance.now() - E.t > 600) { NET.err = null; sfx('ui'); } } }];
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
  const pw = Math.min(W - SAFE.l - SAFE.r - 24, 720 * u), ls = fpx(12, u, 10), lh = ls * 1.5;
  const bh = Math.max(44, 46 * u), ph = Math.min(H - SAFE.t - SAFE.b - 24, fpx(150, u, 120) + E.lines.length * lh + (E.lines.length ? lh : 0) + (E.hint ? fpx(54, u, 46) : 0) + (E.re ? bh + 14 * u : 0)), px = W / 2 - pw / 2, py = H / 2 - ph / 2;
  panel(px, py, pw, ph); ctx.fillStyle = '#c0392b'; ctx.fillRect(px, py, pw, 4);
  let y = py + fpx(30, u, 24);
  fitTxtC('COULDN’T CONNECT · ERROR E' + E.code, W / 2, y, pw - 30, fpx(14, u, 12), '#ff9a8a', FD); y += fpx(30, u, 24);
  fitTxtC(E.title, W / 2, y, pw - 30, fpx(22, u, 16), '#ffe08a', FD); y += fpx(30, u, 24);
  if (E.hint) { wrapCenter(E.hint, W / 2, y, pw - 40, fpx(13, u, 11), '#c8d0b8'); y += fpx(54, u, 46); }
  if (E.lines.length) { fitTxtC('TECHNICAL DETAILS (FOR BUG REPORTS)', W / 2, y, pw - 24, fpx(10, u, 9), 'rgba(242,230,196,0.45)', FD); y += lh; }
  for (const l of E.lines) { fitTxtC(l, W / 2, y, pw - 24, ls, 'rgba(242,230,196,0.75)', FB); y += lh; }
  if (E.re) {     // lost the link mid-game: try to get back in (the host keeps the soldier for you), or close
    const bw = Math.min((pw - 40 * u) / 2, 240 * u), by = py + ph - bh - 14 * u, ok = performance.now() - E.t > 600;
    button({ x: W / 2 - bw - 6 * u, y: by, w: bw, h: bh, label: 'RECONNECT', primary: true, sel: E.sel === 0, off: !ok, fn: () => { if (ok) netReconnect(); }, size: fpx(16, u, 13) });
    button({ x: W / 2 + 6 * u, y: by, w: bw, h: bh, label: 'CLOSE', sel: E.sel === 1, off: !ok, fn: () => { if (ok) { NET.err = null; sfx('ui'); } }, size: fpx(16, u, 13) });
    return;
  }
  fitTxtC(devOf(null) === 'touch' ? 'TAP TO CLOSE' : 'PRESS ANY BUTTON TO CLOSE', W / 2, py + ph - fpx(18, u, 15), pw - 30, fpx(11, u, 10), 'rgba(242,230,196,0.45)', FD);
}
/* a client's join in progress: each step and how far it got */
function drawJoinSteps(u) {
  const tr = NET.trace, pw = Math.min(W - SAFE.l - SAFE.r - 24, 520 * u), rows = [];
  const ok = 'OK', wait = '…';
  rows.push(['GETTING ONLINE', tr && tr.sig ? ok : wait]);
  if (tr && tr.sig) {
    rows.push(['LOOKING FOR THE GAME', tr.ack ? ok : wait]);
    if (tr.ack) rows.push(['SAYING HELLO TO THE HOST', tr.answer ? ok : wait]);
    if (tr.answer) rows.push(['CONNECTING YOUR DEVICES', tr.ice === 'connected' || tr.ice === 'completed' || tr.dc ? ok : wait]);
    if (tr.dc) rows.push(['LOADING THE LOBBY', NET.lobby ? ok : wait]);
  }
  const rh = fpx(24, u, 20), ph = fpx(60, u, 50) + rows.length * rh + (tr && tr.offer ? fpx(34, u, 28) : 0), px = W / 2 - pw / 2, py = H / 2 - ph / 2;
  panel(px, py, pw, ph);
  let y = py + fpx(24, u, 20);
  txt('JOINING ' + NET.code.toUpperCase() + '…', W / 2, y, fpx(18, u, 14), '#ffe08a', 'center', 'middle', FD); y += fpx(30, u, 24);
  for (const [k, v] of rows) { txt(k, px + 24 * u, y, fpx(14, u, 12), '#f2e6c4', 'left', 'middle', FD); txt(v, px + pw - 24 * u, y, fpx(14, u, 12), v === ok ? '#9be07a' : '#ffe08a', 'right', 'middle', FD); y += rh; }
  if (tr && tr.offer) { fitTxtC(traceLine(tr, 'HOST'), W / 2, y + 2, pw - 20, fpx(11, u, 9), 'rgba(242,230,196,0.6)'); fitTxtC(traceLine2(tr), W / 2, y + fpx(16, u, 13), pw - 20, fpx(11, u, 9), 'rgba(242,230,196,0.6)'); }
}
function drawNetMenu() {
  screenT(); UIB = [];
  const u = uiU(), L = SAFE.l + 16 * u, R = W - SAFE.r - 16 * u, T = SAFE.t + 12 * u, B = H - SAFE.b - 10 * u;
  ctx.fillStyle = 'rgba(5,8,4,0.74)'; ctx.fillRect(0, 0, W, H);
  const hb = Math.max(42, 42 * u), bw0 = Math.max(96, 104 * u);
  const dv = devOf(null);
  button({ x: L, y: T, w: bw0, h: hb, label: '‹  MENU', fn: () => toMenu(), size: fpx(15, u, 13), key: ['back', dv] });
  txt('NETWORK PLAY', L + bw0 + 16 * u, T + hb / 2 + 1, fpx(26, u, 18), '#f2e6c4', 'left', 'middle', FD);
  iconButton(R - hb, T, hb, 'gear', () => openSettings('menu'), false, ['settings', dv], 'below');
  if (NET.avail) { const nw = Math.max(150, 190 * u); button({ x: R - hb - 10 * u - nw, y: T, w: nw, h: hb, label: (NET.name || 'SET NAME') + '  ✎', fn: () => askName(null), size: fpx(14, u, 12) }); }
  const top = T + hb + 14 * u, foot = fpx(24, u, 20), bodyH = B - foot - top;
  if (!NET.avail) {
    const pw = Math.min(R - L, 640 * u), px = W / 2 - pw / 2, ph = Math.min(bodyH, 230 * u), py = top + (bodyH - ph) / 2;
    panel(px, py, pw, ph);
    txt(NET.avail === null ? 'CONNECTING…' : 'THIS BROWSER CAN’T PLAY ONLINE', W / 2, py + ph * 0.3, fpx(20, u, 15), '#ffe08a', 'center', 'middle', FD);
    if (NET.avail === false) {
      wrapCenter('This browser can’t make direct connections. Open the game in Safari or Chrome.', W / 2, py + ph * 0.5, pw - 40 * u, fpx(13, u, 12), '#c8d0b8');
      txt(netDiag(), W / 2, py + ph - 18 * u, fpx(11, u, 10), 'rgba(242,230,196,0.5)', 'center', 'middle', FD);
    }
    netToast(u); return;
  }
  const room = netListShown(), gap = 14 * u;
  const card = (i, x, y, w, h, title, sub, art) => {
    const sel = NETM.sel === i; panel(x, y, w, h, 0.94);
    if (sel) { ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3); }
    UIB.push({ x, y, w, h, fn: d => netAct(i, d), focus: i });
    art(x + w / 2, y + h * 0.42, Math.min(w, h * 0.9));
    txt(title, x + w / 2, y + h - fpx(56, u, 40), fpx(24, u, 17), sel ? '#ffe08a' : '#f2e6c4', 'center', 'middle', FD);
    txt(sub, x + w / 2, y + h - fpx(30, u, 22), fpx(12, u, 11), '#c8d0b8', 'center', 'middle', FB);
    if (sel) { ctx.font = `${fpx(24, u, 17)}px ${FD}`; const tw2 = ctx.measureText(title).width; keyTag('select', dv, { x: x + w / 2 - tw2 / 2, y: y + h - fpx(56, u, 40) - 17, w: 0, h: 34 }, 'left'); }
  };
  // two big cards, plus a list of open games
  const cw = room ? clamp((R - L) * 0.3, 180, 330 * u) : (R - L - gap) / 2;
  card(0, L, top, cw, bodyH, 'HOST A GAME', 'YOU GET A CODE · FRIENDS TYPE IT', (cx, cy, m) => squadArt(cx, cy, crispScale(m / 120), MENU.spin, true, 1));
  card(1, L + cw + gap, top, cw, bodyH, 'JOIN WITH CODE', 'TYPE YOUR FRIEND’S 4 LETTERS', (cx, cy, m) => {
    const k = m / 260, bw = 46 * k, sp = 54 * k; ctx.font = `${Math.round(34 * k)}px ${FD}`;
    ['?', '?', '?', '?'].forEach((c, i) => { const x = cx + (i - 1.5) * sp; ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x - bw / 2, cy - bw * 0.65, bw, bw * 1.3); ctx.strokeStyle = 'rgba(242,230,196,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(x - bw / 2, cy - bw * 0.65, bw, bw * 1.3); txt(c, x, cy + 2, Math.round(34 * k), 'rgba(242,230,196,0.6)', 'center', 'middle', FD); });
  });
  if (room) {
    const rx = L + (cw + gap) * 2, rw = R - rx;
    panel(rx, top, rw, bodyH, 0.94);
    txt('OPEN GAMES', rx + 14 * u, top + fpx(22, u, 17), fpx(16, u, 13), '#f2e6c4', 'left', 'middle', FD);
    const rbw = Math.max(120, 136 * u), rbh = Math.max(32, 34 * u);
    button({ x: rx + rw - rbw - 10 * u, y: top + 8 * u, w: rbw, h: rbh, label: '↻ REFRESH', sel: NETM.sel === 2, fn: () => netAct(2), focus: 2, size: fpx(13, u, 11), key: ['refresh', dv] });
    const rows = netRows(), busy = netAllHosts().filter(h => !rows.includes(h)), rh = Math.max(44, 50 * u);
    let y = top + 16 * u + rbh;
    if (!rows.length && !busy.length) wrapCenter('Public games show up here. A host can hide theirs in the lobby.', rx + rw / 2, top + bodyH * 0.42, rw - 30 * u, fpx(12, u, 11), '#a8b098');
    rows.forEach((h, i) => {
      if (y + rh > top + bodyH - 8) return;
      const sel = NETM.sel === i + 3;
      button({ x: rx + 10 * u, y, w: rw - 20 * u, h: rh, sel, fn: d => netAct(i + 3, d), focus: i + 3 });
      if (sel) keyTag('select', dv, { x: rx + 10 * u, y, w: rw - 20 * u - fpx(44, u, 38), h: rh });
      fitTxt((h.nm ? h.nm + ' · ' : 'GAME ') + h.c.toUpperCase(), rx + 24 * u, y + rh * 0.36, rw - 90 * u, fpx(15, u, 13), sel ? '#ffe08a' : '#f0f0e0', FD);
      txt(`${h.st === 'play' ? 'IN BATTLE · ' : ''}${h.md} · ${h.mp}`, rx + 24 * u, y + rh * 0.72, fpx(11, u, 10), '#a8b098', 'left', 'middle', FB);
      txt(`${h.n}/${MAXP} ›`, rx + rw - 22 * u, y + rh / 2, fpx(14, u, 12), sel ? '#ffe08a' : '#d1aa55', 'right', 'middle', FD);
      y += rh + 6 * u;
    });
    busy.forEach(h => { if (y + rh > top + bodyH - 8) return; txt('GAME ' + h.c.toUpperCase() + (h.st === 'play' ? ' · IN BATTLE' : ' · FULL'), rx + 24 * u, y + rh / 2, fpx(13, u, 11), 'rgba(240,240,224,0.4)', 'left', 'middle', FD); y += rh * 0.7; });
  }
  txt('Hosting? Keep the game open on screen — your device runs the match for everyone.', W / 2, B - foot / 2 + 2, fpx(11, u, 10), 'rgba(242,230,196,0.5)', 'center', 'middle', FB);
  if (NETM.entry) drawCodeEntry(u);
  if (NET.busy) { panel(W / 2 - 200 * u, H / 2 - 30 * u, 400 * u, 60 * u); txt(NET.busy, W / 2, H / 2, fpx(17, u, 14), '#ffe08a', 'center', 'middle', FD); }
  netToast(u);
  drawNetErr(u);
}
function drawCodeEntry(u) {
  const E = NETM.entry, name = E.mode === 'name'; UIB = [];
  ctx.fillStyle = 'rgba(3,5,2,0.82)'; ctx.fillRect(0, 0, W, H);
  const kw = Math.min((W - SAFE.l - SAFE.r - 40) / 10, 66 * u), kh = Math.min(kw * 0.86, (H - SAFE.t - SAFE.b) * 0.58 / 5);
  const gw = kw * 10, x0 = W / 2 - gw / 2, slotH = Math.min(kh * 1.5, 70 * u), y0 = SAFE.t + 20 * u;
  txt(name ? 'YOUR NAME' + (E.next === 'join' ? ' · JOINING ' + E.code.toUpperCase() : '') : 'ENTER THE GAME CODE', W / 2, y0 + fpx(14, u, 12), fpx(18, u, 14), '#f2e6c4', 'center', 'middle', FD);
  const sy = y0 + fpx(34, u, 28);
  if (name) {
    const bw = Math.min(gw, 420 * u), bx = W / 2 - bw / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(bx, sy, bw, slotH); ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2; ctx.strokeRect(bx, sy, bw, slotH);
    if (E.name) txt(E.name + (Math.floor(performance.now() / 500) % 2 && E.name.length < 10 ? '_' : ''), W / 2, sy + slotH / 2 + 2, slotH * 0.5, '#fff', 'center', 'middle', FD);
    else txt('LEAVE EMPTY TO BE P1–P4', W / 2, sy + slotH / 2 + 2, fpx(13, u, 11), 'rgba(242,230,196,0.4)', 'center', 'middle', FD);
  } else {
    const sw = slotH * 0.85;
    for (let i = 0; i < 4; i++) {
      const x = W / 2 + (i - 2) * (sw + 10 * u) + 5 * u, c = E.code[i];
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x, sy, sw, slotH); ctx.strokeStyle = i === E.code.length ? '#ffe08a' : 'rgba(242,230,196,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(x, sy, sw, slotH);
      if (c) txt(c.toUpperCase(), x + sw / 2, sy + slotH / 2 + 2, slotH * 0.6, '#fff', 'center', 'middle', FD);
    }
  }
  const gy = sy + slotH + 16 * u, done = name ? 'OK' : 'JOIN', ready = name || E.code.length === 4;
  for (const b of padLayout(E)) {
    const k = b.k, lab = k === 'JOIN' ? 'JOIN ›' : k === 'OK' ? (E.next === 'host' ? 'HOST ›' : E.next === 'join' ? 'JOIN ›' : 'OK') : k === 'DEL' ? '⌫' : k === 'SPACE' ? 'SPACE' : k.toUpperCase();
    const dv = devOf(null), kk = k === done ? ['start', dv] : k === 'DEL' ? [dv === 'pad' ? 'back' : 'del', dv] : null;
    button({ x: x0 + b.x * kw + 3, y: gy + b.y * kh + 3, w: b.w * kw - 6, h: kh - 6, label: lab, sel: E.sel === k, primary: k === done && ready, off: b.off || (k === done && !ready), fn: () => codeKey(k), focus: k, size: Math.max(12, kh * 0.4), key: kk, keyAt: kk && b.w < 1.4 ? 'below' : undefined });
  }
  if (devOf(null) === 'kb') txt('TYPE ON YOUR KEYBOARD · ESC TO CANCEL', W / 2, H - SAFE.b - 22 * u, fpx(15, u, 13), 'rgba(240,240,224,0.7)', 'center', 'middle', FD);
}
/* a joiner's lobby: one player (you), the host's match settings shown read-only */
function updateNetLobby(ins) {
  const me = PLAYERS.find(p => p.mine);
  for (const { dev, st } of ins) {
    if (st.opt) { openSettings('lobby'); return; }
    if (!me) { if (st.back && stateT > 0.3) { netLeave(); return; } continue; }
    if (dev.type === 'pad' && (st.confirm || st.tabL || st.tabR || st.pause)) { NET.dev = dev; me.dev = dev; }
    const dc = st.tabR ? 1 : st.tabL ? -1 : 0; if (dc && !NET.want.r) withHostCfg(() => cycleColor(me, dc));
    if ((dev.type === 'pad' ? st.interact : st.nadeCyc) && !NET.want.r) withHostCfg(() => toggleTeam(me));
    if (st.pause && !NET.want.r) toggleReady(me);
    else if (st.confirm && stateT > 0.3) toggleReady(me);
    if (st.back && stateT > 0.3) { if (NET.want.r) toggleReady(me); else { netLeave(); return; } }
  }
  withHostCfg(runClicks);
}

/* ================= settings (main menu corner, lobby and pause) ================= */
const SET = { open: false, from: null, tab: 0, sel: 0 };
const SET_TABS = [['GRAPHICS', ['style', 'sun', 'shadows', 'teams', 'fogLook']], ['DISPLAY', ['camera', 'fullscreen']], ['AUDIO', ['sfx', 'mus', 'sound']], ['CONTROLS', null]];
const setRows = () => SET_TABS[SET.tab][1];
const CONTROLS = [['MOVE', 'LEFT STICK', 'W A S D'], ['AIM', 'RIGHT STICK', 'MOUSE'], ['FIRE', 'RT', 'LEFT CLICK'], ['AIM DOWN SIGHTS', 'LT', 'RIGHT CLICK'],
  ['SPRINT', 'L3', 'SHIFT'], ['JUMP / VAULT', 'A', 'SPACE'], ['PRONE / STAND', 'B', 'C / Z'], ['RELOAD', 'X', 'R'],
  ['USE · EXIT · SWAP', 'Y', 'E · 1 / 2'], ['GRENADE', 'RB', 'G'], ['GADGET', 'LB', 'F'], ['MELEE', 'R3', 'V'],
  ['SPOT ENEMY', 'D-PAD UP', 'Q'], ['VEHICLE SEAT', 'B / D-PAD', 'F / 1-4'], ['SCOREBOARD', 'VIEW', 'TAB'], ['PAUSE', 'START', 'ESC']];
function openSettings(from) { SET.open = true; SET.from = from; SET.tab = 0; SET.sel = 0; sfx('ui'); }
function closeSettings() { SET.open = false; sfx('ui'); }
const inMatch = () => M && !M.demo;
function setLabel(k) {
  switch (k) {
    case 'style': return ['ART STYLE', CFG.style === 'classic' ? 'CLASSIC' : 'GRIT'];
    case 'sun': return ['SUNLIGHT', CFG.sun === false ? 'OFF' : sunInit() ? 'ON (3D SHADOWS)' : 'NOT SUPPORTED'];
    case 'shadows': return ['SUN SHADOWS', CFG.shadows === 'sweep' ? 'SWEEP' : 'RAY MARCH'];
    case 'fogLook': return ['OUT OF SIGHT', { grey: 'GREYSCALE', partial: 'PARTLY GREY', dark: 'DARKENED' }[CFG.fogLook] || 'GREYSCALE'];
    case 'teams': return ['TEAM COLORS', (CFG.teamColors === 'classic' ? 'BLUE VS RED' : 'PLAYER COLOR') + (inMatch() ? '  (NEXT MATCH)' : '')];
    case 'camera': return ['MULTIPLAYER VIEW', CFG.camera === 'split' ? 'SPLIT SCREEN' : 'SHARED SCREEN'];
    case 'sound': return ['SOUND STYLE', CFG.sound === 'classic' ? 'CLASSIC' : 'EXPERIMENTAL'];
    case 'sfx': return ['SOUND EFFECTS', AU.sfxOn ? 'ON' : 'OFF'];
    case 'mus': return ['MUSIC', AU.musOn ? 'ON' : 'OFF'];
    case 'fullscreen': return ['FULLSCREEN', !fsOK() ? 'SHARE › ADD TO HOME SCREEN' : isFS() ? 'ON' : 'OFF'];
  }
}
function setChange(k, d) {
  if (k === 'style') { CFG.style = CFG.style === 'classic' ? 'grit' : 'classic'; applyStyleAssets(); if (M) { if (M.demo) demoMatch(); else paintGround(); } }
  if (k === 'fogLook') CFG.fogLook = FOG_LOOKS[(FOG_LOOKS.indexOf(CFG.fogLook) + (d || 1) + 3) % 3];
  if (k === 'sun') CFG.sun = CFG.sun === false;
  if (k === 'shadows') CFG.shadows = CFG.shadows === 'sweep' ? 'march' : 'sweep';
  if (k === 'teams') CFG.teamColors = CFG.teamColors === 'classic' ? 'player' : 'classic';
  if (k === 'camera') { CFG.camera = CFG.camera === 'split' ? 'shared' : 'split'; if (inMatch()) { M.cfg.camera = CFG.camera; layoutViews(); } }
  if (k === 'sound') { CFG.sound = CFG.sound === 'classic' ? 'exp' : 'classic'; engineKillAll(); }
  if (k === 'sfx') { AU.sfxOn = !AU.sfxOn; store.set('sfx', AU.sfxOn); applyMute(); }
  if (k === 'mus') { AU.musOn = !AU.musOn; store.set('mus', AU.musOn); applyMute(); }
  if (k === 'fullscreen' && !SET.fsClick) toggleFullscreen(); SET.fsClick = false;
  saveCfg(); sfx('ui');
}
function updateSettings(ins) {
  for (const { st } of ins) {
    if (st.back || st.opt || st.pause) { closeSettings(); return; }
    if (st.tabL || st.tabR) { SET.tab = (SET.tab + (st.tabR ? 1 : -1) + SET_TABS.length) % SET_TABS.length; SET.sel = 0; sfx('ui'); }
    const rows = setRows();
    if (rows) {
      if (st.navY) { SET.sel = (SET.sel + st.navY + rows.length) % rows.length; sfx('ui'); }
      if (st.navX) setChange(rows[SET.sel], st.navX);
      if (st.confirm) setChange(rows[SET.sel], 1);
    }
  }
  hoverUpdate(v => SET.sel = v);
  runClicks();
}
function drawSettings() {
  screenT(); UIB = [];
  const u = uiU();
  ctx.fillStyle = 'rgba(3,5,2,0.72)'; ctx.fillRect(0, 0, W, H);
  const pw = Math.min(W - SAFE.l - SAFE.r - 24, 780 * u), ph = Math.min(H - SAFE.t - SAFE.b - 20, 500 * u), px = W / 2 - pw / 2, py = Math.max(SAFE.t + 10, H / 2 - ph / 2);
  panel(px, py, pw, ph);
  const hh = Math.max(46, 50 * u), pad = 14 * u;
  txt('SETTINGS', px + pad, py + hh / 2 + 1, fpx(22, u, 17), '#f2e6c4', 'left', 'middle', FD);
  txt(`v${VERSION.build}`, px + pad, py + ph - Math.max(14, 15 * u), fpx(11, u, 10), 'rgba(242,230,196,0.4)', 'left', 'middle', FD);
  const dv = devOf(null), cs = Math.max(40, 40 * u); iconButton(px + pw - cs - 8, py + (hh - cs) / 2, cs, 'close', () => closeSettings(), false, ['back', dv]);
  // category tabs, on their own row under the title (LB / RB or Q / E cycle them)
  const kw = Math.max(34, 40 * u), nt = SET_TABS.length, tw = Math.min(170 * u, (pw - pad * 2 - kw * 2) / nt), tx = px + pw / 2 - tw * nt / 2, ty = py + hh;
  SET_TABS.forEach(([t], i) => button({ x: tx + i * tw, y: ty, w: tw - 6, h: cs, label: t, sel: SET.tab === i, fn: () => { SET.tab = i; SET.sel = 0; sfx('ui'); }, size: fpx(14, u, 11) }));
  keyTag('prev', dv, { x: tx, y: ty, w: tw - 6, h: cs }, 'left'); keyTag('next', dv, { x: tx + (nt - 1) * tw, y: ty, w: tw - 6, h: cs }, 'right');
  const bodyY = ty + cs + 12 * u, bodyH = py + ph - bodyY - Math.max(28, 30 * u), rows = setRows();
  if (rows) {
    const rh = clamp(bodyH / rows.length, 34, 56 * u);
    rows.forEach((k, i) => {
      const y = bodyY + i * rh, sel = SET.sel === i, [lab, val] = setLabel(k), x = px + pad, w = pw - pad * 2;
      if (sel) { ctx.fillStyle = 'rgba(255,224,138,0.13)'; ctx.fillRect(x, y + 2, w, rh - 4); ctx.fillStyle = '#ffe08a'; ctx.fillRect(x, y + 2, 4, rh - 4); }
      txt(lab, x + 16 * u, y + rh / 2, fpx(15, u, 13), sel ? '#fff' : '#c8d0b8', 'left', 'middle', FD);
      const aw = Math.max(40, rh * 0.95);
      txt(val, x + w - aw - 10, y + rh / 2, fpx(16, u, 13), sel ? '#ffe08a' : '#f0f0e0', 'right', 'middle', FD);
      txt('‹', x + w * 0.52, y + rh / 2, fpx(20, u, 16), 'rgba(242,230,196,0.5)', 'center', 'middle', FD);
      if (sel) keyTag('change', dv, { x: x + w * 0.52 - 12, y: y + rh * 0.2, w: 0, h: rh * 0.6 }, 'left');
      txt('›', x + w - aw / 2, y + rh / 2, fpx(20, u, 16), 'rgba(242,230,196,0.8)', 'center', 'middle', FD);
      UIB.push({ x, y, w: w * 0.55, h: rh, focus: i, fs: k === 'fullscreen', fn: () => { SET.sel = i; SET.fsClick = true; setChange(k, -1); } });
      UIB.push({ x: x + w * 0.55, y, w: w * 0.45, h: rh, focus: i, fs: k === 'fullscreen', fn: () => { SET.sel = i; SET.fsClick = true; setChange(k, 1); } });
    });
  } else {
    const cols = pw > 620 ? 2 : 1, per = Math.ceil(CONTROLS.length / cols), rh = Math.min(bodyH / (per + 1), 34 * u), colW = (pw - pad * 2) / cols, fs = fpx(13, u, 11.5);
    for (let c = 0; c < cols; c++) {
      const x = px + pad + c * colW;
      txt('ACTION', x + 8, bodyY + rh / 2, fs, '#9a9a8a', 'left', 'middle', FD); txt('CONTROLLER', x + colW * 0.48, bodyY + rh / 2, fs, '#9a9a8a', 'left', 'middle', FD); txt('KEYBOARD', x + colW * 0.74, bodyY + rh / 2, fs, '#9a9a8a', 'left', 'middle', FD);
      CONTROLS.slice(c * per, c * per + per).forEach(([a, p, k], i) => {
        const y = bodyY + (i + 1) * rh; if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(x, y, colW - 10, rh); }
        txt(a, x + 8, y + rh / 2, fs, '#ffe08a', 'left', 'middle', FB); txt(p, x + colW * 0.48, y + rh / 2, fs, '#f0f0e0', 'left', 'middle', FB); txt(k, x + colW * 0.74, y + rh / 2, fs, '#f0f0e0', 'left', 'middle', FB);
      });
    }
  }
  if (!rows) txt('TOUCH: LEFT THUMB MOVES · RIGHT THUMB AIMS AND FIRES', W / 2, py + ph - Math.max(14, 15 * u), fpx(12, u, 11), 'rgba(240,240,220,0.65)', 'center', 'middle', FD);
}

/* ================= local lobby ================= */
const LOBBY = { sel: 0 };
const MATCH_ROWS_ = ['mode', 'map', 'bots', 'limit', 'skill', 'ff', 'board', 'fog', 'weather'], MATCH_ROWS_NET = [...MATCH_ROWS_, 'midjoin', 'pub'];
const matchRows = () => (NET.role ? MATCH_ROWS_NET : MATCH_ROWS_).filter(k => !(k === 'bots' && MODES[CFG.mode].coop));   // co-op: the waves set the numbers      // online games also choose whether people can join mid-match
function deviceKey(d) { return d.type + (d.index !== undefined ? d.index : '') + (d.peer || ''); }
function devName(d) { return d.type === 'net' ? (d.peer ? 'ONLINE' : 'HOST') : d.type === 'kb' ? 'KEYBOARD + MOUSE' : d.type === 'pad' ? 'CONTROLLER ' + (d.index + 1) : 'TOUCH'; }
function lobbyJoin(dev) {
  if (PLAYERS.length >= MAXP || PLAYERS.some(p => deviceKey(p.dev) === deviceKey(dev))) { sfx('leave'); return; }
  const used = new Set(PLAYERS.map(p => p.pc || p.color));
  const id = [0, 1, 2, 3].find(i => !PLAYERS.some(p => p.id === i));
  const team = PLAYERS.filter(p => p.team === 0).length <= PLAYERS.filter(p => p.team === 1).length ? 0 : 1;
  const pref = PRIME[id], color = !used.has(pref) ? pref : COLORS.find(c => !used.has(c));
  PLAYERS.push({ id, dev, color, pc: color, team, ready: false, kit: 0, var: 0 });
  PLAYERS.sort((a, b) => a.id - b.id);
  sfx('join');
}
function leaveLobby(p) { PLAYERS = PLAYERS.filter(q => q !== p); sfx('leave'); }
/* colours: in team modes a team wears one colour (anyone on it can change it, never to the other team's); otherwise each player
   wears their own pick (p.pc). The host (or local game) settles everyone's colour every lobby frame. */
function lobbyTeamCols() {
  if (CFG.teamColors === 'classic') return ['blue', 'red'];
  const T = LOBBY.tcol || (LOBBY.tcol = [null, null]), ps = PLAYERS.slice().sort((a, b) => a.id - b.id);
  for (const t of [0, 1]) { const lead = ps.find(p => p.team === t); if (!lead) T[t] = null; else if (!T[t]) T[t] = lead.pc || lead.color; }
  if (T[0] && T[0] === T[1]) T[1] = ['red', 'blue', ...COLORS].find(c => c !== T[0]);
  const out = T.slice();
  for (const t of [0, 1]) if (!out[t]) out[t] = ['blue', 'red', 'green', 'orange', 'cyan', 'magenta', 'yellow'].find(c => c !== out[1 - t]);
  return out;
}
function syncLobbyColors() {
  const ps = PLAYERS.slice().sort((a, b) => a.id - b.id);
  for (const p of ps) if (!p.pc) p.pc = p.color;
  if (MODES[CFG.mode].team) { const tc = lobbyTeamCols(); for (const p of ps) p.color = tc[p.team]; return; }
  const used = new Set(); for (const p of ps) { const c = used.has(p.pc) ? COLORS.find(x => !used.has(x)) : p.pc; p.color = c; used.add(c); }
}
function nextColor(p, d) {
  const team = MODES[CFG.mode].team; if (team && CFG.teamColors === 'classic') return null;
  const used = new Set(PLAYERS.filter(q => q !== p && !(team && q.team === p.team)).map(q => q.color));
  let i = COLORS.indexOf(p.color); for (let k = 0; k < COLORS.length; k++) { i = (i + d + COLORS.length) % COLORS.length; if (!used.has(COLORS[i])) return COLORS[i]; }
  return null;
}
function applyColor(p, c) {
  if (!COLORS.includes(c)) return;
  if (MODES[CFG.mode].team) { if (CFG.teamColors === 'classic') return; lobbyTeamCols(); if (LOBBY.tcol[1 - p.team] === c) return; LOBBY.tcol[p.team] = c; }
  else if (PLAYERS.some(q => q !== p && q.color === c)) return;
  p.pc = c; syncLobbyColors();
}
function cycleColor(p, d) {
  const c = nextColor(p, d); if (!c) { sfx('leave'); return; }
  if (NET.role === 'client') { NET.want.c = c; NET.want.cn = (NET.want.cn || 0) + 1; NET.want.cT = performance.now(); p.color = c; }
  else applyColor(p, c);
  sfx('ui');
}
function toggleTeam(p) { if (!MODES[CFG.mode].team) return; if (NET.role === 'client') { NET.want.t = 1 - p.team; NET.want.tn = (NET.want.tn || 0) + 1; NET.want.tT = performance.now(); p.team = NET.want.t; } else p.team = 1 - p.team; sfx('ui'); }
function toggleReady(p) { if (NET.role === 'client') { NET.want.r = NET.want.r ? 0 : 1; NET.want.rT = performance.now(); p.ready = !!NET.want.r; sfx(p.ready ? 'join' : 'leave'); return; } p.ready = !p.ready; sfx(p.ready ? 'join' : 'leave'); }
function saveCfg() { store.set('cfg3', CFG); }
function changeSetting(key, d) {
  const C = CFG, prevMap = C.map, prevWeather = C.weather;
  if (key === 'mode') C.mode = (C.mode + d + MODES.length) % MODES.length;
  if (key === 'map') C.map = (C.map + d + MAPNAMES.length) % MAPNAMES.length;
  if (key === 'bots') C.bots = clamp(C.bots + d, 0, MODES[C.mode].id === 'ffa' ? 6 : 10);
  if (key === 'limit') C.limit = (C.limit + d + 3) % 3;
  if (key === 'skill') C.skill = (C.skill + d + 3) % 3;
  if (key === 'ff') C.ff = !C.ff;
  if (key === 'board') C.board = !C.board;
  if (key === 'fog') C.fog = C.fog === 'off' ? 'los' : 'off';
  if (key === 'midjoin') C.midjoin = !C.midjoin;
  if (key === 'pub') C.pub = C.pub === false;
  if (key === 'weather') { C.weather = WEATHERS[(WEATHERS.indexOf(C.weather) + d + 3) % 3]; }
  if (MODES[C.mode].id === 'ffa') C.bots = Math.min(C.bots, 6);
  saveCfg(); sfx('ui');
  if (C.map !== prevMap || C.weather !== prevWeather) demoMatch();
}
function settingLabel(key) {
  const C = CFG, ffa = MODES[C.mode].id === 'ffa';
  switch (key) {
    case 'mode': return ['MODE', MODES[C.mode].n];
    case 'map': return ['MAP', MAPNAMES[C.map][1]];
    case 'bots': return [ffa ? 'BOTS' : 'BOTS / TEAM', String(C.bots)];
    case 'limit': if (MODES[C.mode].coop) return ['WAVES', LIMITS.surv[C.limit] ? String(LIMITS.surv[C.limit]) : 'ENDLESS'];
      return ffa ? ['KILL LIMIT', String(LIMITS.ffa[C.limit])] : ['TICKETS', String(LIMITS.team[C.limit])];
    case 'skill': return ['BOT SKILL', SKILL[C.skill].name];
    case 'ff': return ['FRIENDLY FIRE', C.ff ? 'ON' : 'OFF'];
    case 'board': return ['ENEMY BOARDING', C.board ? 'ON' : 'OFF'];
    case 'fog': return ['VISION', C.fog === 'off' ? 'SEE WHOLE MAP' : 'LINE OF SIGHT'];
    case 'midjoin': return ['JOIN MID-MATCH', C.midjoin ? 'ON' : 'OFF'];
    case 'pub': return ['SERVER LIST', C.pub === false ? 'HIDDEN' : 'SHOWN'];
    case 'weather': return ['WEATHER', C.weather === 'clear' ? 'CLEAR' : C.weather === 'snow' ? 'SNOW' : MAPNAMES[C.map][0] === 'snowfield' ? 'STORM' : 'RAIN'];
  }
}
/* same settings again (a dev match keeps its own) */
function rematch() { newMatch({ ...(M.dev ? M.cfg : CFG) }, false); setState('play'); }
function demoMatch() { newMatch({ mode: 0, map: CFG.map, bots: 7, limit: 1, skill: 1, camera: 'shared', weather: CFG.weather }, true); }
/* controllers have to ready up; keyboard and touch players are readied by pressing START themselves */
const canStart = () => PLAYERS.length > 0 && PLAYERS.every(p => p.ready || (p.dev.type !== 'pad' && !isNet(p)));
function tryStart() { if (canStart()) startBattle(); else sfx('leave'); }
function startBattle() {
  if (!PLAYERS.length) return;
  for (const p of PLAYERS) p.ready = true;
  newMatch({ ...CFG }, false); setState('play'); Music.mode = 'battle'; sfx('join');
}
function toLobby() { engineKillAll(); SET.open = false; for (const p of PLAYERS) { p.ready = false; p.sol = null; } demoMatch(); setState('lobby'); Music.mode = 'menu'; }
function updateLobby(ins) {
  if (NET.role === 'client') { updateNetLobby(ins); return; }
  syncLobbyColors();
  const nRows = matchRows().length + 1;
  for (const { dev, st } of ins) {
    const p = PLAYERS.find(q => deviceKey(q.dev) === deviceKey(dev));
    if (!p) {
      if (st.join && stateT > 0.3) lobbyJoin(dev);
      else if (st.back && stateT > 0.3) { toMenu(); return; }
      else if (st.opt) { openSettings('lobby'); return; }
      continue;
    }
    if (st.opt) { openSettings('lobby'); return; }
    // bumpers: colour · D-pad / stick: match settings · Y: team · A: ready · Start: ready + start · B: un-ready, then leave
    const dc = st.tabR ? 1 : st.tabL ? -1 : 0;
    if (dc) cycleColor(p, dc);
    if (st.navY) { LOBBY.sel = (LOBBY.sel + st.navY + nRows) % nRows; sfx('ui'); }
    if (st.navX && LOBBY.sel < matchRows().length) changeSetting(matchRows()[LOBBY.sel], st.navX);
    if ((dev.type === 'pad' ? st.interact : st.nadeCyc) && MODES[CFG.mode].team) toggleTeam(p);
    if (st.confirm && stateT > 0.3) { if (LOBBY.sel === matchRows().length) { p.ready = true; tryStart(); } else toggleReady(p); }
    if (st.pause && !st.back) { p.ready = true; tryStart(); }
    if (st.back) { if (p.ready) { p.ready = false; sfx('leave'); } else leaveLobby(p); }
  }
  runClicks();
}
function teamChipColor(t) { const lc = pickTeamColors(CFG, false, false)[t]; return CFG.teamColors === 'classic' ? [[CHEX.blue, 'WEST'], [CHEX.red, 'EAST']][t] : [CHEX[lc], CNAME[lc]]; }
function drawLobby() { withHostCfg(drawLobby2); }
function drawLobby2() {
  screenT(); UIB = [];
  const u = uiU(), L = SAFE.l + 16 * u, R = W - SAFE.r - 16 * u, T = SAFE.t + 12 * u, B = H - SAFE.b - 10 * u;
  ctx.fillStyle = 'rgba(5,8,4,0.74)'; ctx.fillRect(0, 0, W, H);
  // header
  const hb = Math.max(42, 42 * u);
  const dv = devOf(null), local = PLAYERS.some(p => !isNet(p));      // once you have a slot, back leaves the slot (its ✕)
  button({ x: L, y: T, w: Math.max(96, 104 * u), h: hb, label: NET.role ? '‹  LEAVE' : '‹  MENU', fn: () => NET.role ? netLeave() : toMenu(), size: fpx(15, u, 13), key: local ? null : ['back', dv] });
  txt(NET.role ? 'ONLINE · CODE ' + NET.code.toUpperCase() : 'LOCAL PLAY', L + Math.max(96, 104 * u) + 16 * u, T + hb / 2 + 1, fpx(26, u, 18), '#f2e6c4', 'left', 'middle', FD);
  iconButton(R - hb, T, hb, 'gear', () => openSettings('lobby'), false, ['settings', dv]);
  const foot = fpx(10, u, 8), top = T + hb + 12 * u, bodyH = B - foot - top;
  // match panel (right)
  const pw = clamp(W * 0.3, 240, 380 * u), px = R - pw;
  drawMatchPanel(px, top, pw, bodyH, u);
  // player slots (4 across)
  const gap = 10 * u, areaW = px - gap * 1.5 - L, cwid = (areaW - gap * 3) / 4;
  for (let i = 0; i < MAXP; i++) drawSlot(L + i * (cwid + gap), top, cwid, bodyH, i, u);
  if (NET.role === 'client' && !NET.joined) drawJoinSteps(u);
  netToast(u);
  if (!AU.ctx && PLAYERS.some(p => p.dev.type === 'pad')) txt('CLICK ONCE TO ENABLE SOUND', R, T + hb + 2, fpx(11, u, 10), 'rgba(240,240,220,0.5)', 'right', 'top', FD);
}
function drawSlot(x, y, w, h, i, u) {
  const p = PLAYERS.find(q => q.id === i);
  if (!p) {
    ctx.fillStyle = 'rgba(13,19,10,0.6)'; ctx.fillRect(x, y, w, h);
    ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(242,230,196,0.25)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); ctx.setLineDash([]);
    const sc = crispScale(Math.min(w, h * 0.55) / 34);
    uiShadowLayer(() => uiSoldierShadow('stand', x + w / 2 - 2 * sc, y + h * 0.4 - 3 * sc, Math.PI / 2, sc), 0.35);
    txt('P' + (i + 1), x + w / 2, y + fpx(24, u, 18), fpx(20, u, 15), 'rgba(242,230,196,0.35)', 'center', 'middle', FD);
    const bh2 = fpx(20, u, 16);
    if (NET.role === 'client') { txt('OPEN', x + w / 2, y + h * 0.7, fpx(15, u, 12), 'rgba(242,230,196,0.5)', 'center', 'middle', FD); return; }
    if (NET.role) txt('WAITING FOR PLAYERS', x + w / 2, y + h * 0.58, fpx(11, u, 10), 'rgba(242,230,196,0.5)', 'center', 'middle', FD);
    if (anyPad()) hintRow([{ a: 'A', t: 'JOIN' }], x + w / 2, y + h * 0.7, bh2, 'pad', 'rgba(242,230,196,0.7)');
    hintRow([{ a: 'ENTER', t: 'JOIN' }], x + w / 2, y + h * 0.7 + (anyPad() ? bh2 * 1.5 : 0), bh2, 'kb', 'rgba(242,230,196,0.7)');
    if (TOUCH.active) txt('TAP', x + w / 2, y + h * 0.7 + bh2 * 3, fpx(15, u, 12), 'rgba(242,230,196,0.55)', 'center', 'middle', FD);
    UIB.push({ x, y, w, h, fn: d => { if (!PLAYERS.some(q => q.dev.type === d.type)) lobbyJoin(d); } });
    return;
  }
  const col = CHEX[p.color], team = MODES[CFG.mode].team, ctl = !NET.role ? true : NET.role === 'host' ? !isNet(p) : !!p.mine;
  panel(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x, y, w, 4);
  if (p.ready) { ctx.strokeStyle = '#7dff7a'; ctx.lineWidth = 2.5; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3); }
  const pad = 8 * u, cs = Math.max(34, 32 * u), pd = ctl ? (p.mine ? NET.dev && NET.dev.type : p.dev.type) : null;
  const xk = keyDev(pd) && !p.ready ? badge('back', pd, -9999, -9999, clamp(cs * 0.46, 15, 22) * (pd === 'pad' ? 1.2 : 1)) + 7 : 0;
  fitTxt(p.name || 'P' + (i + 1), x + pad, y + pad + cs / 2, w - pad * 2 - cs - xk - (p.mine ? 44 : 8), fpx(22, u, 16), col, FD);
  if (ctl || NET.role === 'host') iconButton(x + w - cs - pad, y + pad, cs, 'close', () => NET.role === 'client' ? netLeave() : isNet(p) ? netKick(p) : leaveLobby(p), false, xk ? ['back', pd] : null);
  if (p.mine) txt('YOU', x + w - cs - pad - 8 - xk, y + pad + cs / 2, fpx(12, u, 10), '#ffe08a', 'right', 'middle', FD);
  txt(devName(p.dev), x + w / 2, y + pad + cs + fpx(12, u, 11), fpx(11, u, 10), '#9a9a8a', 'center', 'middle', FD);
  // the soldier, in the current art set
  const chipH = team ? Math.max(34, 34 * u) : 0, readyH = Math.max(42, 44 * u);
  const artTop = y + pad + cs + fpx(22, u, 20), artBot = y + h - pad - readyH - chipH - (team ? 8 * u : 0) - fpx(24, u, 20);
  const sc = crispScale(Math.min(w * 0.7, (artBot - artTop)) / 26), sx = x + w / 2, sy = (artTop + artBot) / 2;
  uiShadowLayer(() => uiSoldierShadow('stand', sx, sy, Math.PI / 2, sc), 0.4);
  uiSoldier(p.color, 'stand', sx, sy, Math.PI / 2, sc);
  if (!p.ready && ctl && !(team && CFG.teamColors === 'classic')) {     // classic team colours: nothing to pick
    const ab = Math.max(36, 34 * u);
    button({ x: x + 4, y: sy - ab / 2, w: ab, h: ab, label: '‹', fn: () => cycleColor(p, -1), size: fpx(22, u, 18), key: ['prev', pd], keyAt: 'below' });
    button({ x: x + w - ab - 4, y: sy - ab / 2, w: ab, h: ab, label: '›', fn: () => cycleColor(p, 1), size: fpx(22, u, 18), key: ['next', pd], keyAt: 'below' });
  }
  txt(CNAME[p.color], sx, artBot + fpx(12, u, 10), fpx(15, u, 12), col, 'center', 'middle', FD);
  if (team) { const [tc, tn] = teamChipColor(p.team); button({ x: x + pad, y: y + h - pad - readyH - chipH - 8 * u, w: w - pad * 2, h: chipH, label: 'TEAM ' + tn, fill: tc, fn: () => { if (NET.role === 'host' && isNet(p)) { p.team = 1 - p.team; sfx('ui'); } else if (!p.ready && ctl) toggleTeam(p); }, size: fpx(14, u, 12), key: p.ready ? null : ['team', pd] }); }
  button({ x: x + pad, y: y + h - pad - readyH, w: w - pad * 2, h: readyH, label: p.ready ? '✓ READY' : 'READY', primary: !p.ready && ctl, fill: p.ready ? '#7dff7a' : undefined, fn: () => { if (ctl) toggleReady(p); }, size: fpx(17, u, 13), key: [p.ready ? 'back' : 'select', pd] });
}
function drawMatchPanel(x, y, w, h, u) {
  panel(x, y, w, h);
  const pad = 10 * u, cl = NET.role === 'client', navOn = !cl && PLAYERS.some(p => p.dev.type !== 'touch');
  txt('MATCH', x + pad, y + fpx(18, u, 15), fpx(17, u, 14), '#f2e6c4', 'left', 'middle', FD);
  const nd = navOn ? (PLAYERS.some(p => p.dev.type === 'pad') ? 'pad' : 'kb') : null;
  if (nd) keyTag('nav', nd, { x: x + w - pad, y: y + fpx(18, u, 15) - 10, w: 0, h: 20 }, 'left');
  else txt(MODES[CFG.mode].n, x + w - pad, y + fpx(18, u, 15), fpx(13, u, 11), '#9a9a8a', 'right', 'middle', FD);
  // map preview of the live demo battlefield
  const startH = Math.max(44, 46 * u), minRows = matchRows().length * Math.max(28, 32 * u), head = fpx(34, u, 28);
  const mw = w - pad * 2, mh0 = Math.min(mw * WH / WW, h - head - minRows - startH - pad * 2 - 12 * u), mh = mh0 < 46 ? 0 : mh0, mx = x + pad, my = y + head;
  const k = Math.min(mw / WW, mh / WH), dw = WW * k, dh = WH * k, dx = mx + (mw - dw) / 2;
  if (mh) ctx.drawImage(ground, 0, 0, WW, WH, dx, my, dw, dh);
  if (mh) {
  for (const b of MAP.buildings) if (b.roofC) ctx.drawImage(b.roofC, dx + b.x * k, my + b.y * k, b.w * k, b.h * k);
  for (const f of M.flags) { ctx.fillStyle = '#f2e6c4'; ctx.beginPath(); ctx.arc(dx + f.x * k, my + f.y * k, Math.max(4, 6 * u), 0, TAU); ctx.fill(); txt(f.name.length > 1 ? 'H' : f.name, dx + f.x * k, my + f.y * k + 1, fpx(9, u, 8), '#141a10', 'center', 'middle', FD); }
  ctx.strokeStyle = 'rgba(242,230,196,0.3)'; ctx.strokeRect(dx + 0.5, my + 0.5, dw - 1, dh - 1);
  if (!cl) UIB.push({ x: dx, y: my, w: dw, h: dh, fn: () => changeSetting('map', 1) }); }
  // rows
  const rowsTop = my + dh + 8 * u, rowsH = y + h - pad - startH - 8 * u - rowsTop, rh = clamp(rowsH / matchRows().length, 28, 44 * u);
  matchRows().forEach((key, i) => {
    const ry = rowsTop + i * rh, sel = navOn && LOBBY.sel === i, [lab, val] = settingLabel(key);
    if (sel) { ctx.fillStyle = 'rgba(255,224,138,0.13)'; ctx.fillRect(x + 4, ry + 1, w - 8, rh - 2); ctx.fillStyle = '#ffe08a'; ctx.fillRect(x + 4, ry + 1, 3, rh - 2); }
    txt(lab, x + pad + 4, ry + rh / 2, fpx(12.5, u, 11.5), '#a8b098', 'left', 'middle', FD);
    txt(`‹ ${val} ›`, x + w - pad, ry + rh / 2, fpx(14, u, 12), sel ? '#ffe08a' : '#f0f0e0', 'right', 'middle', FD);
    if (cl) return;
    UIB.push({ x: x + 4, y: ry, w: (w - 8) * 0.5, h: rh, fn: () => { LOBBY.sel = i; changeSetting(key, -1); } });
    UIB.push({ x: x + 4 + (w - 8) * 0.5, y: ry, w: (w - 8) * 0.5, h: rh, fn: () => { LOBBY.sel = i; changeSetting(key, 1); } });
  });
  const ok = canStart(), sel = navOn && LOBBY.sel === matchRows().length;
  if (cl) { button({ x: x + pad, y: y + h - pad - startH, w: w - pad * 2, h: startH, label: 'THE HOST STARTS THE BATTLE', off: true, size: fpx(14, u, 12) }); return; }
  button({ x: x + pad, y: y + h - pad - startH, w: w - pad * 2, h: startH, label: !PLAYERS.length ? 'JOIN TO START' : ok ? 'START BATTLE' : 'WAITING FOR READY', primary: true, off: !ok, sel, fn: () => tryStart(), size: fpx(17, u, 13), key: ok ? ['go', nd] : null });
}

/* ================= pause ================= */
const PAUSE = { by: null, sel: 0 };
const PAUSE_ITEMS = ['RESUME', 'SETTINGS', 'REDEPLOY', 'RESTART MATCH', 'BACK TO LOBBY', 'QUIT TO MENU'];
function openPause(p) { if (state !== 'play') return; PAUSE.by = p; PAUSE.sel = 0; setState('pause'); sfx('ui'); }
const pauseItems = () => {
  const l = NET.role === 'client' ? ['RESUME', 'SETTINGS', 'REDEPLOY', 'LEAVE GAME'] : NET.role === 'host' ? ['RESUME', 'SETTINGS', 'REDEPLOY', 'RESTART MATCH', 'BACK TO LOBBY', 'END GAME'] : PAUSE_ITEMS;
  const l2 = M && M.dev ? l.filter(x => x !== 'BACK TO LOBBY') : l;
  return pauseMe() ? l2 : l2.filter(x => x !== 'REDEPLOY');
};
/* who REDEPLOY kills: whoever opened the menu (or the first local player who's alive); never in co-op */
function pauseMe() {
  if (!M || M.demo || M.over || M.coop) return null;
  if (NET.role === 'client') { const s = NET.me && NET.me.sol; return s && s.alive ? s : null; }
  const p = PAUSE.by && PAUSE.by.sol && PAUSE.by.sol.alive ? PAUSE.by : LOCALS().find(q => q.sol && q.sol.alive); return p ? p.sol : null;
}
function pauseAct(i) {
  const it = pauseItems()[i];
  if (it === 'RESUME') setState('play');
  if (it === 'SETTINGS') openSettings('pause');
  if (it === 'REDEPLOY') { const s = pauseMe(); if (NET.role === 'client') { NET.rd = (NET.rd | 0) + 1; NET.rdT = performance.now(); } else redeploy(s); setState('play'); }
  if (it === 'RESTART MATCH') rematch();
  if (it === 'BACK TO LOBBY') toLobby();
  if (it === 'QUIT TO MENU' || it === 'END GAME') toMenu();
  if (it === 'LEAVE GAME') netLeave();
}
function updatePause(ins) {
  for (const { st } of ins) {
    if (st.pause || st.back) { setState('play'); return; }
    if (st.navY) { const n = pauseItems().length; PAUSE.sel = (PAUSE.sel + st.navY + n) % n; sfx('ui'); }
    if (st.opt) { openSettings('pause'); return; }
    if (st.confirm) { pauseAct(PAUSE.sel); return; }
  }
  hoverUpdate(v => PAUSE.sel = v);
  runClicks();
}
function drawPause() {
  screenT(); UIB = [];
  ctx.fillStyle = 'rgba(4,6,3,0.74)'; ctx.fillRect(0, 0, W, H);
  const u = uiU(), bw = Math.min(360 * u, W - 40), bh = Math.max(44, 46 * u), gap = 8 * u, items = pauseItems(), tot = items.length * (bh + gap);
  const hc = NET.role === 'host' && NET.code ? fpx(40, u, 30) : 0, y0 = Math.max(SAFE.t + fpx(90, u, 70) + hc, H / 2 - tot / 2 + 20 * u);
  if (hc) { txt('GAME CODE', W / 2, SAFE.t + fpx(16, u, 13), fpx(12, u, 11), 'rgba(242,230,196,0.6)', 'center', 'middle', FD); stxt(NET.code.toUpperCase(), W / 2, SAFE.t + fpx(40, u, 31), fpx(28, u, 21), '#ffe08a', 'center', 'middle', FD); }
  const ib = Math.max(44, 44 * u); if (fsOK()) { iconButton(W - SAFE.r - 14 * u - ib, SAFE.t + 12 * u, ib, 'full', FS_FN); UIB[UIB.length - 1].fs = true; }
  stxt(NET.role ? 'MENU' : 'PAUSED', W / 2, y0 - fpx(50, u, 40), fpx(44, u, 30), '#f2e6c4', 'center', 'middle', FD);
  if (NET.role) txt('ONLINE — THE BATTLE CARRIES ON', W / 2, y0 - fpx(18, u, 14) + (PAUSE.by && PAUSE.by.sol ? fpx(18, u, 14) : 0), fpx(12, u, 11), 'rgba(242,230,196,0.6)', 'center', 'middle', FD);
  if (PAUSE.by && PAUSE.by.sol) stxt('by ' + PAUSE.by.sol.name, W / 2, y0 - fpx(18, u, 14), fpx(14, u, 12), CHEX[PAUSE.by.color], 'center', 'middle', FD);
  items.forEach((it, i) => button({ x: W / 2 - bw / 2, y: y0 + i * (bh + gap), w: bw, h: bh, label: it, sel: PAUSE.sel === i, primary: i === 0, fn: () => { PAUSE.sel = i; pauseAct(i); }, focus: i, size: fpx(17, u, 14) }));
}

/* ================= end screen ================= */
function awards() {
  const list = [], all = M.sol;
  const best = (f, min) => { let b = null; for (const s of all) if (f(s) > (b ? f(b) : (min || 0))) b = s; return b; };
  const mvp = best(s => s.pts); if (mvp) list.push(['MVP', mvp, mvp.pts + ' PTS']);
  const rk = best(s => s.rk); if (rk) list.push(['ROAD RAGE', rk, rk.rk + ' ROADKILLS']);
  const vk = best(s => s.vk); if (vk) list.push(['TANK BUSTER', vk, vk.vk + ' VEHICLES']);
  const md = best(s => s.heal, 40); if (md) list.push(['FIELD MEDIC', md, Math.round(md.heal) + ' HP HEALED']);
  const rp = best(s => s.rep, 100); if (rp) list.push(['GREASE MONKEY', rp, Math.round(rp.rep) + ' HP REPAIRED']);
  const ls = best(s => s.longest, 300); if (ls) list.push(['LONG SHOT', ls, Math.round(ls.longest / 10) + ' m']);
  return list.slice(0, 4);
}
function updateEnd(ins) {
  if (stateT < 1.5) return;
  if (NET.role === 'client') { for (const { st } of ins) if (st.back) { netLeave(); return; } runClicks(); return; }
  for (const { st } of ins) {
    if (st.confirm) { rematch(); return; }
    if (st.back) { toLobby(); return; }
  }
  runClicks();
}
function drawEnd() {
  screenT(); UIB = [];
  const a = Math.min(1, stateT * 1.5); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(4,6,3,0.8)'; ctx.fillRect(0, 0, W, H);
  const u = uiU();
  let title, col;
  if (M.ffa) { const s = M.winnerSol || [...M.sol].sort((x, y) => y.k - x.k)[0]; title = `${s.name} WINS`; col = CHEX[s.color]; }
  else if (M.coop) { title = M.winner === 0 ? 'YOU SURVIVED' : 'WIPED OUT ON WAVE ' + M.wv.n; col = M.winner === 0 ? '#7dff7a' : '#ff5a45'; }
  else { title = `${TEAMNAME[M.winner]} WINS`; col = TEAMHEX[M.winner]; }
  const ty = SAFE.t + fpx(44, u, 34);
  stxt(title, W / 2, ty, fpx(46, u, 28), col, 'center', 'middle', FD);
  stxt(`${MODES.find(m => m.id === M.mode).n}  ·  ${MAPNAMES[M.cfg.map][1]}${M.ffa ? '' : M.coop ? `  ·  WAVE ${M.wv.n}` : `  ·  TICKETS ${M.tickets[0]} – ${M.tickets[1]}`}`, W / 2, ty + fpx(32, u, 24), fpx(13, u, 11), '#e8e8dc', 'center', 'middle', FD);
  const aw = awards(), awW = Math.min(200 * u, (W - 60) / Math.max(1, aw.length) - 10), ay = ty + fpx(50, u, 40), ah = fpx(62, u, 52);
  aw.forEach(([name, s, val], i) => {
    const x = W / 2 - (aw.length * (awW + 10) - 10) / 2 + i * (awW + 10);
    panel(x, ay, awW, ah);
    txt(name, x + awW / 2, ay + ah * 0.24, fpx(12, u, 11), '#ffe08a', 'center', 'middle', FD);
    txt(s.name, x + awW / 2, ay + ah * 0.54, fpx(15, u, 13), CHEX[s.color], 'center', 'middle', FD);
    txt(val, x + awW / 2, ay + ah * 0.8, fpx(11, u, 10), '#c8d0b8', 'center', 'middle', FB);
  });
  const bh = Math.max(44, 46 * u), by = H - SAFE.b - bh - 12 * u, rowH = fpx(20, u, 17), tbY = ay + ah + 12 * u;
  const rows = clamp(Math.floor((by - tbY - 44 * u) / rowH), 1, Math.min(10, M.sol.length));
  const bw = Math.min(W - 32, 700 * u), bx = W / 2 - bw / 2;
  panel(bx, tbY, bw, 34 * u + rows * rowH);
  const cols = [['SOLDIER', 0.05, 'left'], ['SCORE', 0.5, 'right'], ['KILLS', 0.63, 'right'], ['DEATHS', 0.76, 'right'], ['CAPS', 0.87, 'right'], ['VEH', 0.96, 'right']];
  for (const [n, x, al] of cols) txt(n, bx + bw * x, tbY + 20 * u, fpx(11, u, 10), '#9a9a8a', al, 'alphabetic', FD);
  let y = tbY + 34 * u + rowH * 0.7; const fs = fpx(13, u, 12);
  for (const s of [...M.sol].sort((x, y2) => y2.pts - x.pts).slice(0, rows)) {
    if (s.player) { ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(bx + 6, y - rowH * 0.7, bw - 12, rowH); }
    ctx.fillStyle = M.ffa ? CHEX[s.color] : TEAMHEX[s.team]; ctx.fillRect(bx + 8, y - rowH * 0.55, 4, rowH * 0.65);
    txt(s.name, bx + bw * 0.05, y, fs, s.player ? CHEX[s.color] : '#e8e8dc', 'left');
    txt(String(s.pts), bx + bw * 0.5, y, fs, '#ffe08a', 'right'); txt(String(s.k), bx + bw * 0.63, y, fs, '#fff', 'right'); txt(String(s.d), bx + bw * 0.76, y, fs, '#ccc', 'right'); txt(String(s.caps), bx + bw * 0.87, y, fs, '#ccc', 'right'); txt(String(s.vk), bx + bw * 0.96, y, fs, '#ccc', 'right');
    y += rowH;
  }
  const w2 = Math.min(280 * u, W / 2 - 24), pads = anyPad();
  if (NET.role === 'client') { button({ x: W / 2 - w2 - 8, y: by, w: w2, h: bh, label: 'WAITING FOR HOST', off: true, size: fpx(15, u, 12) }); button({ x: W / 2 + 8, y: by, w: w2, h: bh, label: 'LEAVE', off: stateT < 1.5, fn: () => netLeave(), size: fpx(16, u, 13) }); ctx.globalAlpha = 1; return; }
  button({ x: W / 2 - w2 - 8, y: by, w: w2, h: bh, label: 'REMATCH', primary: true, off: stateT < 1.5, fn: rematch, size: fpx(16, u, 13) });
  button({ x: W / 2 + 8, y: by, w: w2, h: bh, label: 'LOBBY', off: stateT < 1.5, fn: () => toLobby(), size: fpx(16, u, 13) });
  const dv = devOf(null); if (dv !== 'touch') { badge('select', dv, W / 2 - w2 + 4, by + bh / 2, bh * 0.5); badge('back', dv, W / 2 + 20, by + bh / 2, bh * 0.5); }
  ctx.globalAlpha = 1;
}
/* ================= main loop ================= */
function setState(s) { state = s; stateT = 0; }
function update(dt) {
  stateT += dt; pollPads();
  if (state === 'boot') { if (imgReady) { toMenu(); const m = /join=([a-z0-9]{4})/i.exec(typeof location !== 'undefined' ? location.hash || '' : ''); if (m) { openNetMenu({ type: TOUCH.active ? 'touch' : 'kb' }); NETM.entry = { mode: 'code', code: m[1].toLowerCase(), sel: 'JOIN' }; } } return; }
  netTick();
  const front = state === 'menu' || state === 'lobby' || state === 'netmenu';
  const live = !front && M && !M.demo && !!NET.role;        // an online battle never stops for one player's menu
  let ins;
  if (front) ins = allInputs(); else { readPlayers(); ins = playerInputs(); }
  if (SET.open) { if (front) updateMatch(dt); else if (live) runMatch(dt, true); updateSettings(ins); return; }
  if (state === 'menu') { updateMatch(dt); updateMenu(ins, dt); return; }
  if (state === 'netmenu') { updateMatch(dt); updateNetMenu(ins, dt); return; }
  if (state === 'lobby') { updateMatch(dt); updateLobby(ins); return; }
  if (state === 'play') {
    if (M.dev) devInputs();
    runMatch(dt, false);
    M.scoreHeld = !M.dev && LOCALS().some(p => p.raw && p.raw.score);     // dev: View is the tool panel
    for (const p of LOCALS()) if (p.raw && p.raw.pause) { openPause(p); break; }
    if (M.over && M.overT > 3) setState('end');
    return;
  }
  if (state === 'pause') { if (live) runMatch(dt, true); updatePause(ins); return; }
  if (state === 'end') { runMatch(dt * 0.5, false); updateEnd(ins); }
}
/* the match itself: simulated here, or (joining online) followed from the host */
function runMatch(dt, idle) {
  if (NET.role === 'client') { netClientUpdate(dt); return; }
  if (idle) for (const p of LOCALS()) p.raw = null;          // someone in a menu stands still
  updateMatch(dt);
}
/* in shared-screen mode every player still gets a HUD / deploy panel, laid out like split screen */
function hudViews() {
  if (!(M.shared && M.views.length === 1)) return M.views.filter(v => v.p);
  const LP = LOCALS(), v0 = M.views[0], n = LP.length, [cols, rows] = n === 2 ? [2, 1] : [2, 2], cw2 = W / cols, ch2 = H / rows;
  return LP.map((p, i) => ({ x: (i % cols) * cw2, y: Math.floor(i / cols) * ch2, w: cw2, h: ch2, p, VZ: v0.VZ, VOX: v0.VOX, VOY: v0.VOY, cam: v0.cam, sharedHud: true }));
}
function render() {
  screenT(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#0c140a'; ctx.fillRect(0, 0, W, H);
  if (!M || !imgReady) { txt('LOADING…', W / 2, H / 2, 18, '#f2e6c4', 'center', 'middle', FD); return; }
  DUI.length = 0; TB_ON = [];
  // 1) all gameplay for every view, 2) split dividers, 3) every HUD, 4) global HUD, 5) menus on top
  for (const vw of M.views) drawWorld(vw);
  screenT();
  if (state === 'menu') uiScaled(drawMenu);
  else if (state === 'netmenu') uiScaled(drawNetMenu);
  else if (state === 'lobby') uiScaled(drawLobby);
  else {
    if (M.views.length > 1) { ctx.fillStyle = '#0a0a08'; for (const vw of M.views) { if (vw.x > 0) ctx.fillRect(vw.x - 2, vw.y, 4, vw.h); if (vw.y > 0) ctx.fillRect(vw.x, vw.y - 2, vw.w, 4); } }
    for (const vw of hudViews()) drawViewHUD(vw);
    drawGlobalHUD();
    if (M.scoreHeld && state === 'play') uiScaled(drawScoreboard);
    if (state === 'pause') uiScaled(drawPause);
    { const tp = touchPlayer(); if (state === 'play' && tp && tp.sol && tp.sol.alive && !(M.dev && DEV.open)) { screenT(); drawTouch(tp.sol); } }
    if (M.dev && state === 'play') devDrawPanel();      // over the touch controls
    if (state === 'end') uiScaled(drawEnd);
    netOverlay();
  }
  if (SET.open) uiScaled(drawSettings);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  try { update(dt); render(); audioTick(); } catch (err) { console.error(err); }
  endInputFrame();
  requestAnimationFrame(frame);
}
/* a host's tab in the background still runs the battle for everyone (browsers stop drawing hidden tabs) */
const _bgTick = setInterval(() => {
  if (typeof document === 'undefined' || !document.hidden || NET.role !== 'host') return;
  const now = performance.now(), dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  try { update(dt); } catch (err) { console.error(err); }
  endInputFrame();
}, 40);
if (_bgTick && _bgTick.unref) _bgTick.unref();
resize();
requestAnimationFrame(frame);
