/* ================= icons, button prompts, tactical map =================
   Everything here draws in screen space. Icons are flat vector glyphs sized to a square box `s`. */
function icon(kind, cx, cy, s, col, al) {
  if (kind && kind.startsWith('w:')) {     // the artist's weapon icons from the atlas, fitted to the box height (pixel crisp)
    const m = ATLAS['wi_' + kind.slice(2)]; if (!m) return; const k = iconW(kind, s) / m[2];
    ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k); ctx.imageSmoothingEnabled = false; if (al !== undefined) ctx.globalAlpha *= al;
    ctx.drawImage(IMG, m[0], m[1], m[2], m[3], -m[2] / 2, -m[3] / 2, m[2], m[3]); ctx.restore(); return;
  }
  const c = col || '#f0f0e0', k = s / 20;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k); if (al !== undefined) ctx.globalAlpha *= al;
  ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const R = (x, y, w, h) => ctx.fillRect(x, y, w, h), P = pts => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); };
  const C = (x, y, r, f) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); f === false ? ctx.stroke() : ctx.fill(); };
  switch (kind) {
    case 'gun': R(-9, -2, 15, 4); R(6, -1, 4, 2); P([[-9, -2], [-10, 4], [-6, 4], [-5, -2]]); R(-1, 2, 3, 5); R(-4, -4, 5, 2); break;
    case 'pistol': R(-6, -4, 12, 4); P([[-6, 0], [-3, 0], [-1, 7], [-5, 7]]); break;
    case 'rocket': R(-10, -2.5, 16, 5); P([[6, -4], [10, 0], [6, 4]]); R(-4, 2.5, 2, 4); break;
    case 'frag': ctx.fillStyle = col || '#7d9a54'; C(0, 2, 6.5); ctx.fillStyle = '#2a2e22'; R(-1, -7, 6, 3); R(3, -7, 2, 6); ctx.strokeStyle = '#c8c8b8'; ctx.lineWidth = 1.5; C(-3, -6, 2.5, false); break;
    case 'smoke': ctx.fillStyle = col || '#9aa0a0'; R(-4, -2, 8, 10); ctx.fillStyle = '#2a2e22'; R(-4, -3, 8, 2); ctx.fillStyle = 'rgba(220,224,224,0.9)'; C(-4, -7, 3.5); C(1, -9, 4); C(5, -6, 3); break;
    case 'medbag': ctx.fillStyle = '#f0f0e8'; ctx.beginPath(); rr(ctx, -8, -6, 16, 13, 2); ctx.fill(); ctx.fillStyle = '#d42a22'; R(-1.5, -4, 3, 9); R(-5, -1, 10, 3); R(-3, -8, 6, 2); break;
    case 'ammo': ctx.fillStyle = '#6b6a3a'; R(-9, -3, 18, 11); ctx.fillStyle = '#d6b04a'; for (const x of [-6, -1, 4]) { R(x, -8, 3, 6); } ctx.fillStyle = '#3c3c22'; R(-9, 1, 18, 2); break;
    case 'torch': ctx.rotate(-0.7); ctx.fillStyle = '#c8c8c0'; R(-10, -2, 14, 4); C(-10, 0, 2.6); R(3, -6, 3.5, 12); R(3, -6, 8, 3.4); R(3, 2.6, 8, 3.4); break;     // the repair wrench
    case 'mine': ctx.fillStyle = '#3e4232'; C(0, 1, 8); ctx.fillStyle = '#5c6048'; C(0, 1, 5); ctx.fillStyle = '#ff3a2a'; C(0, 1, 1.8); break;
    case 'reload': ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(0, 0, 6.5, -0.4, Math.PI * 1.45); ctx.stroke(); P([[6.5, -6], [8.5, 1], [1.5, -1.5]]); break;
    case 'seat': R(-5, -8, 4, 13); R(-5, 2, 11, 4); R(4, 2, 3, 7); R(-5, 5, 3, 4); break;
    case 'exit': ctx.lineWidth = 2.2; ctx.strokeRect(-8, -8, 9, 16); P([[2, -5], [9, 0], [2, 5]]); R(-3, -1.5, 6, 3); break;
    case 'map': P([[-9, -6], [-3, -8], [3, -6], [9, -8], [9, 6], [3, 8], [-3, 6], [-9, 8]]); ctx.fillStyle = 'rgba(0,0,0,0.45)'; R(-3.5, -8, 1.2, 14); R(2.4, -6, 1.2, 14); ctx.fillStyle = '#ff4a3a'; C(5, -1, 2); break;
    case 'eye': ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(0, -10, 10, 0); ctx.quadraticCurveTo(0, 10, -10, 0); ctx.fill(); ctx.fillStyle = '#141a10'; C(0, 0, 3.6); break;
    case 'shell': R(-8, -3, 11, 6); P([[3, -3], [9, 0], [3, 3]]); ctx.fillStyle = 'rgba(0,0,0,0.35)'; R(-8, -3, 2, 6); break;
    case 'heat': P([[0, -10], [6, -1], [5, 6], [0, 9], [-5, 6], [-6, -1], [-2, -4], [-1, 2]]); break;
    case 'stand': C(0, -6, 3); R(-2.5, -2.5, 5, 7); R(-2.5, 4, 2, 6); R(0.5, 4, 2, 6); R(-5, -2, 2, 6); R(3, -2, 2, 6); break;
    case 'prone': C(-7, 3, 3); R(-4, 1, 10, 4); R(6, 1.5, 4, 1.6); R(6, 3.2, 4, 1.6); R(-6, 5, 6, 1.6); break;
    case 'skull': C(0, -2, 7.5); R(-4.5, 3, 9, 5); ctx.fillStyle = '#141a10'; C(-2.8, -2, 2); C(2.8, -2, 2); R(-0.8, 3, 1.6, 2.5); break;
    case 'boom': { ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? 4 : 10; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fillStyle = col || '#ffb030'; ctx.fill(); ctx.fillStyle = '#fff2b0'; C(0, 0, 3); break; }
    case 'tire': ctx.lineWidth = 4; C(0, 0, 6.5, false); ctx.fillStyle = c; C(0, 0, 2); break;
    case 'knife': P([[-9, 2], [4, -3], [9, -3], [4, 1], [-9, 4]]); ctx.fillStyle = '#6a4a2a'; R(-10, 1, 6, 4); break;
    case 'deploy': P([[-7, -8], [7, -8], [0, 1]]); R(-9, 5, 18, 3); break;
    case 'swap': P([[-9, -3], [3, -3], [3, -7], [9, -1], [3, 5], [3, 1], [-9, 1]].map(([x, y]) => [x, y - 1])); P([[9, 3], [-3, 3], [-3, 7], [-9, 2], [-3, -3], [-3, -1], [9, -1]].map(([x, y]) => [x, y + 4])); break;
    case 'team': C(-4, -5, 3); R(-7, -1, 6, 8); C(5, -5, 3); R(2, -1, 6, 8); break;
    case 'check': ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-2, 6); ctx.lineTo(8, -6); ctx.stroke(); break;
    case 'horn': P([[-8, -3], [-2, -3], [6, -8], [6, 8], [-2, 3], [-8, 3]]); break;
    case 'cross': ctx.lineWidth = 2.4; C(0, 0, 5.5, false); ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-4, 0); ctx.moveTo(4, 0); ctx.lineTo(10, 0); ctx.moveTo(0, -10); ctx.lineTo(0, -4); ctx.moveTo(0, 4); ctx.lineTo(0, 10); ctx.stroke(); C(0, 0, 1.6); break;
    case 'run': C(3, -7, 2.6); P([[1, -4], [5, -4], [3, 2], [7, 6], [5, 8], [1, 3], [-3, 8], [-6, 6], [-1, 0], [-4, -1], [-7, 1], [-8, -1], [-3, -4]]); break;
    case 'jump': ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-7, 3); ctx.lineTo(0, -5); ctx.lineTo(7, 3); ctx.stroke(); R(-8, 6, 16, 2.5); break;
    case 'pause': R(-6, -7, 4, 14); R(2, -7, 4, 14); break;
    case 'score': R(-8, -7, 3, 3); R(-3, -7, 11, 3); R(-8, -1.5, 3, 3); R(-3, -1.5, 11, 3); R(-8, 4, 3, 3); R(-3, 4, 11, 3); break;
    case 'flag': R(-6, -9, 2, 18); P([[-4, -9], [8, -5], [-4, -1]]); break;
    case 'gear': ctx.restore(); gearIcon(cx, cy, s * 0.42, c); return;
    case 'nades': break;
  }
  ctx.restore();
}
/* cooldown: a dark pie sweeping away clockwise over an icon (fraction still to wait) */
function cooldownPie(cx, cy, r, frac) {
  if (frac <= 0) return;
  ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(frac, 0, 1)); ctx.closePath(); ctx.fill();
}
function gadgetIconKind(g) { return g === 'medbag' ? 'medbag' : g === 'ammo' ? 'ammo' : g === 'torch' ? 'torch' : 'mine'; }
function weaponIconKind(id) { if (ATLAS['wi_' + id]) return 'w:' + id; const W_ = WPN[id]; return W_.rocket ? 'rocket' : id === 'pistol' || id === 'mp' ? 'pistol' : 'gun'; }
/* drawn width of an icon in a box of size s (weapon art is wide) */
function iconW(kind, s) { if (kind && kind.startsWith('w:')) { const m = ATLAS['wi_' + kind.slice(2)]; return Math.min(s * 2.4, s * 0.95 * m[2] / m[3]) ; } return s; }

/* ---------- button prompts ---------- */
const PADCOL = { A: '#5cbf3a', B: '#d8402c', X: '#3a78d8', Y: '#e0b82a' };
/* action -> [controller button, keyboard key] */
const BIND = {
  fire: ['RT', 'LMB'], ads: ['LT', 'RMB'], jump: ['A', 'SPACE'], stance: ['B', 'C'], reload: ['X', 'R'], use: ['Y', 'E'], nade: ['RB', 'G'], gadget: ['LB', 'F'],
  melee: ['R3', 'V'], spot: ['DU', 'Q'], map: ['DD', 'M'], cycle: ['DLR', 'T'], seat: ['B', 'F'], deploy: ['A', 'SPACE'], classes: ['LBRB', 'Q E'], slot: ['DUD', '↑↓'],
  item: ['DLR', '←→'], spawn: ['LS', 'WASD'], team: ['Y', 'T'], select: ['A', 'ENTER'], back: ['B', 'ESC'], start: ['START', 'ENTER'], settings: ['VIEW', 'O'], nav: ['LS', 'ARROWS'], change: ['DLR', '←→'],
  prev: ['LB', 'Q'], next: ['RB', 'E'], go: ['START', 'P'], del: ['B', '⌫']
};
/* draws one prompt; returns its width. dev: 'pad' | 'kb' | 'touch' (touch draws nothing) */
function badge(act, dev, x, cy, h) {
  if (dev === 'touch') return 0;
  const b = BIND[act], key = b ? (dev === 'pad' ? b[0] : b[1]) : act;
  ctx.save(); ctx.font = `${Math.round(h * 0.56)}px ${FD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let w;
  if (dev === 'pad' && PADCOL[key]) {
    w = h; ctx.fillStyle = PADCOL[key]; ctx.beginPath(); ctx.arc(x + h / 2, cy, h / 2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#10140c'; ctx.fillText(key, x + h / 2, cy + 1);
  } else if (dev === 'pad' && /^D(U|D|L|R|UD|LR)$/.test(key)) {
    w = h; const a = h * 0.34, t = h * 0.32, m = x + h / 2, d = key.slice(1);
    ctx.fillStyle = 'rgba(240,240,224,0.32)'; ctx.fillRect(m - t / 2, cy - h / 2, t, h); ctx.fillRect(x, cy - t / 2, h, t);
    ctx.fillStyle = '#f0f0e0';
    if (d === 'U' || d === 'UD') ctx.fillRect(m - t / 2, cy - h / 2, t, a);
    if (d === 'D' || d === 'UD') ctx.fillRect(m - t / 2, cy + h / 2 - a, t, a);
    if (d === 'L' || d === 'LR') ctx.fillRect(x, cy - t / 2, a, t);
    if (d === 'R' || d === 'LR') ctx.fillRect(x + h - a, cy - t / 2, a, t);
  } else if (dev === 'pad' && (key === 'LS' || key === 'RS' || key === 'L3' || key === 'R3')) {
    w = h; ctx.fillStyle = '#3a3e36'; ctx.beginPath(); ctx.arc(x + h / 2, cy, h / 2, 0, TAU); ctx.fill(); ctx.strokeStyle = '#f0f0e0'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#f0f0e0'; ctx.font = `${Math.round(h * 0.46)}px ${FD}`; ctx.fillText(key, x + h / 2, cy + 1);
  } else if (dev === 'pad' && (key === 'LB' || key === 'RB')) {
    w = h * 1.7; const l = key === 'LB', big = h * 0.62, sm = h * 0.18;
    ctx.fillStyle = '#3a3e36'; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, cy - h / 2, w, h, l ? [big, sm, sm, sm] : [sm, big, sm, sm]); else ctx.rect(x, cy - h / 2, w, h);
    ctx.fill(); ctx.strokeStyle = 'rgba(240,240,224,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#f0f0e0'; ctx.font = `${Math.round(h * 0.5)}px ${FD}`; ctx.fillText(key, x + w / 2 + (l ? h * 0.08 : -h * 0.08), cy + 1);
  } else if (dev === 'pad' && key === 'LBRB') {
    const w1 = badge('LB', 'pad', x, cy, h); w = w1 + 3 + badge('RB', 'pad', x + w1 + 3, cy, h); ctx.restore(); return w;
  } else {
    const label = key; w = Math.max(h * 1.15, ctx.measureText(label).width + h * 0.6);
    const pad = dev === 'pad';
    ctx.fillStyle = pad ? '#3a3e36' : '#e8e4d4'; ctx.beginPath(); rr(ctx, x, cy - h / 2, w, h, pad ? h * 0.45 : 3); ctx.fill();
    if (!pad) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 1, cy + h / 2 - 3, w - 2, 2); }
    ctx.fillStyle = pad ? '#f0f0e0' : '#1a1a14'; ctx.fillText(label, x + w / 2, cy + 1);
  }
  ctx.restore(); return w;
}
/* the prompt pinned to an on-screen button (see button(o.key)): inside its right end, or beside / under / over it.
   Only for a keyboard or a controller: touch players just tap, and remote players aren't at this screen */
function keyDev(d) { return d === 'pad' || d === 'kb' ? d : null; }
function keyTag(act, dev, b, at) {
  const d = keyDev(dev); if (!d) return 0;
  const kh = clamp(b.h * 0.46, 15, 22) * (d === 'pad' ? 1.2 : 1), bw = badge(act, d, -9999, -9999, kh);      // round pad buttons read smaller than key caps
  if (at === 'below') badge(act, d, b.x + b.w / 2 - bw / 2, b.y + b.h + kh / 2 + 4, kh);
  else if (at === 'above') badge(act, d, b.x + b.w / 2 - bw / 2, b.y - kh / 2 - 4, kh);
  else if (at === 'left') badge(act, d, b.x - bw - 7, b.y + b.h / 2, kh);
  else if (at === 'right') badge(act, d, b.x + b.w + 7, b.y + b.h / 2, kh);
  else badge(act, d, b.x + b.w - bw - kh * 0.4, b.y + b.h / 2, kh);
  return bw;
}
/* a row of [prompt + icon/word] pairs, centred on cx */
function hintRow(items, cx, cy, h, dev, col) {
  const gap = h * 0.35, sep = h * 1.1, parts = [];
  ctx.font = `${Math.round(h * 0.62)}px ${FD}`;
  let tot = 0;
  for (const it of items) {
    const b = dev === 'touch' || !it.a ? 0 : (badge(it.a, dev, -9999, -9999, h)), lw = it.icon ? h : ctx.measureText(it.t || '').width;
    const w = (b ? b + gap : 0) + lw; parts.push({ it, b, w, lw }); tot += w + sep;
  }
  tot -= sep; let x = cx - tot / 2;
  for (const q of parts) {
    if (q.b) { badge(q.it.a, dev, x, cy, h); x += q.b + gap; }
    if (q.it.icon) icon(q.it.icon, x + h / 2, cy, h * 0.95, col || '#f0f0e0'); else txt(q.it.t, x, cy + 1, Math.round(h * 0.62), col || 'rgba(240,240,224,0.85)', 'left', 'middle', FD);
    x += q.lw + sep;
  }
}
const devOf = p => p ? p.dev.type : (anyPad() ? 'pad' : TOUCH.active ? 'touch' : 'kb');

/* ---------- tactical map (deploy screen + in-game map) ---------- */
function drawTacMap(x, y, w, h, s, o) {
  const k = Math.min(w / WW, h / WH), mw = WW * k, mh = WH * k, mx = x + (w - mw) / 2, my = y + (h - mh) / 2, u = o.u || 1;
  ctx.drawImage(ground, 0, 0, WW, WH, mx, my, mw, mh);
  for (const b of MAP.buildings) if (b.roofC) ctx.drawImage(b.roofC, mx + b.x * k, my + b.y * k, b.w * k, b.h * k);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(mx, my, mw, mh);
  for (const c of M.smokes) { ctx.fillStyle = 'rgba(210,214,214,0.5)'; ctx.beginPath(); ctx.arc(mx + c.x * k, my + c.y * k, c.r * k, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = 'rgba(242,230,196,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
  const fr = Math.max(6, 9 * u);
  for (const f of M.flags) { ctx.fillStyle = f.owner < 0 ? '#bdbdb0' : TEAMHEX[f.owner]; ctx.beginPath(); ctx.arc(mx + f.x * k, my + f.y * k, fr, 0, TAU); ctx.fill(); txt(f.name.length > 1 ? 'H' : f.name, mx + f.x * k, my + f.y * k + 1, Math.max(9, 10 * u), '#111', 'center', 'middle', FD); }
  const mine = o2 => M.ffa ? o2 === s : o2.team === s.team;
  for (const v of M.vehicles) if (v.active) { const t = vehTeam(v); if (t >= 0 && (M.ffa || t !== s.team)) continue; ctx.save(); ctx.translate(mx + v.x * k, my + v.y * k); ctx.rotate(v.a); ctx.fillStyle = t < 0 ? 'rgba(220,220,210,0.8)' : TEAMHEX[t]; ctx.fillRect(-5, -3, 10, 6); ctx.restore(); }
  for (const q of M.sol) {
    if (!q.alive) continue;
    const friend = mine(q), seen = q.spotT > 0 && q.spotTeam === s.team;
    if (!friend && !seen) continue;
    const px = mx + q.x * k, py = my + q.y * k;
    if (q === s) { ctx.save(); ctx.translate(px, py); ctx.rotate(q.a); ctx.fillStyle = CHEX[q.color]; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore(); continue; }
    ctx.fillStyle = !friend ? '#ff4030' : q.player ? CHEX[q.color] : TEAMHEX[q.team]; const r = q.player ? 3 : 2; ctx.fillRect(px - r, py - r, r * 2, r * 2);
  }
  return { mx, my, mw, mh, k };
}
