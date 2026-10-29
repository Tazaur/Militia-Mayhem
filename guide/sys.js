/* Field manual: SYSTEMS — one page per system: what it does, a live demo, its variables and the maths (numbers from the
   source at build 231) */
const tbl = (head, rows) => `<div class="tw"><table class="vars"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map((c, i) => `<td${i && i < r.length - 1 && head.length > 2 ? ' class="v"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</table></div>`;
const vars = rows => `<div class="tw"><table class="vars">${rows.map(([n, v, m]) => `<tr><td>${n}</td><td class="v" style="white-space:normal">${v}</td></tr>${m ? `<tr><td colspan="2" class="m">${m}</td></tr>` : ''}`).join('')}</table></div>`;
const MX = s => `<div class="math">${s.replace(/\/\/[^\n]*/g, m => `<span class="c">${m}</span>`)}</div>`;
const DEMO = (id, cap, ctl) => `<div class="demo"><canvas id="${id}"></canvas>${ctl ? `<div class="ctl">${ctl}</div>` : ''}${cap ? `<div class="cap">${cap}</div>` : ''}</div>`;
const RNG = (id, lab, min, max, st, v) => `<div class="range"><label for="${id}">${lab}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${st}" value="${v}"><output id="${id}o">${v}</output></div>`;
const FLOW = items => `<ul class="flow">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
const rv = (b, id) => { const e = b.querySelector('#' + id), o = b.querySelector('#' + id + 'o'); const f = () => +e.value; e.addEventListener('input', () => { if (o) o.textContent = e.value; }); return f; };
const BTNS = (id, labels, on = 0) => `<div class="seg" id="${id}">${labels.map((l, i) => `<button data-i="${i}" class="${i === on ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const seg = (b, id, fn) => { const s = b.querySelector('#' + id); s.onclick = e => { const x = e.target.closest('button'); if (!x) return; s.querySelectorAll('button').forEach(y => y.classList.toggle('on', y === x)); fn(+x.dataset.i); }; };
/* a little plot: axes, grid, curves f(x); returns the mapping */
function plot(g, o) {
  const L = o.l ?? 34, R = o.r ?? 10, T = o.t ?? 10, B = o.b ?? 24, W = g.W - L - R, H = g.H - T - B;
  const X = x => L + (x - o.x0) / (o.x1 - o.x0) * W, Y = y => T + H - (y - o.y0) / (o.y1 - o.y0) * H;
  g.strokeStyle = '#25301f'; g.lineWidth = 1; g.font = '9.5px JetBrains Mono'; g.fillStyle = '#6f725f';
  for (const x of o.gx || []) { g.beginPath(); g.moveTo(X(x), T); g.lineTo(X(x), T + H); g.stroke(); g.textAlign = 'center'; g.fillText(o.fx ? o.fx(x) : x, X(x), T + H + 13); }
  for (const y of o.gy || []) { g.beginPath(); g.moveTo(L, Y(y)); g.lineTo(L + W, Y(y)); g.stroke(); g.textAlign = 'right'; g.fillText(o.fy ? o.fy(y) : y, L - 4, Y(y) + 3); }
  g.strokeStyle = '#3d4d34'; g.strokeRect(L, T, W, H);
  if (o.xl) { g.textAlign = 'right'; g.fillStyle = '#a49f86'; g.font = '600 10px Chakra Petch'; g.fillText(o.xl, L + W, T + H + 22 > g.H ? g.H - 2 : T + H + 22); }
  if (o.yl) { g.save(); g.translate(10, T + H / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillStyle = '#a49f86'; g.font = '600 10px Chakra Petch'; g.fillText(o.yl, 0, 0); g.restore(); }
  for (const c of o.c || []) { g.strokeStyle = c.col; g.lineWidth = c.w || 2; g.setLineDash(c.dash || []); g.beginPath(); for (let i = 0; i <= 160; i++) { const x = o.x0 + (o.x1 - o.x0) * i / 160, y = c.f(x); i ? g.lineTo(X(x), Y(clamp(y, o.y0, o.y1))) : g.moveTo(X(x), Y(clamp(y, o.y0, o.y1))); } g.stroke(); g.setLineDash([]); }
  g.textAlign = 'left'; return { X, Y, L, T, W, H };
}
const dot = (g, x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
const txt = (g, s, x, y, c = '#ece4c8', f = '600 11px Chakra Petch', al = 'left') => { g.font = f; g.fillStyle = c; g.textAlign = al; g.fillText(s, x, y); g.textAlign = 'left'; };
const WPN = { ar: ['M4A1', 30, 0.11, 17, 1050, 0.5, 0.035, 1.5, 3], br: ['SCAR', 20, 0.21, 30, 1250, 0.6, 0.018, 1.8, 5], ak: ['AK-47', 30, 0.1, 19, 1000, 0.45, 0.048, 1.6, 3], smg: ['SMG', 32, 0.065, 12, 900, 0.32, 0.06, 1.3, 1], shotgun: ['SHOTGUN', 6, 0.8, 14 * 8, 880, 0.26, 0.17, 2.2, 3], lmg: ['LMG', 100, 0.085, 16, 1100, 0.6, 0.06, 3.2, 4], hmg: ['HEAVY MG', 60, 0.125, 25, 1200, 0.65, 0.05, 3, 8], sniper: ['.50 CAL', 5, 1.2, 100, 2000, 0.55, 0.003, 2.4, 20], dmr: ['DMR', 10, 0.33, 45, 1600, 0.5, 0.012, 2, 6], pistol: ['PISTOL', 12, 0.2, 22, 900, 0.36, 0.04, 1.1, 1], mp: ['M-PISTOL', 20, 0.075, 12, 850, 0.3, 0.075, 1.3, 1] };

const SYS = [];
const sys = (o) => SYS.push(o);

/* ================= BATTLE ================= */
sys({
  id: 'weapons', sec: 'BATTLE', title: 'Weapons & Spread', sub: '1_core WPN · 3_sim fireWeapon', icon: 'wi_ar', blurb: 'Every gun is a row of numbers. Spread grows with movement, stance and bloom.',
  render(b) {
    b.innerHTML = `<p class="lead">A gun is just data: one row of the <code>WPN</code> table. Firing spawns a bullet projectile with a speed, a life and a damage; where it goes depends on a spread cone that the shooter's state widens or tightens.</p>
    <h3>Damage per second</h3>${DEMO('wDps', 'DPS = damage ÷ seconds between shots. The shotgun\'s is all 8 pellets landing.')}
    <h3>The spread cone — try it</h3>${DEMO('wCone', 'Each dot is one shot. Bloom builds while you hold the trigger and cools when you stop.', BTNS('wW', ['M4', 'AK', 'SMG', 'LMG', 'SNIPER'], 0) + RNG('wSt', 'stance', 0, 1, 1, 0) + RNG('wSp', 'speed px/s', 0, 130, 1, 0) + '<button class="btn" id="wAds">ADS</button><button class="btn on" id="wFire">FIRE</button>')}
    ${MX(`sm = [1, .45][stance]              // stand / prone
   × (1 + clamp(speed / 82, 0, 1.6) × 1.3)
   × (ADS ? .5 : 1)
   × (1 + 1.6 × bloom)
angle = aim + U(−1, 1) × spread × sm
bloom += rate < .15 ? .11 : .3        // per shot (fast guns climb slower)`)}
    <h3>The table</h3>${tbl(['gun', 'mag', 'rate s', 'dmg', 'speed', 'life', 'spread', 'reload', 'vs veh'], Object.entries(WPN).map(([k, w]) => [w[0], ...w.slice(1).map((v, i) => i === 2 && k === 'shotgun' ? '14×8' : v)]))}
    <p class="muted">Range = speed × life: the M4 reaches 525 px, the .50 cal 1100. Rockets are not bullets: 480 px/s for 1.5 s, then the RPG blast. A bullet hitting a vehicle does <code>vdmg</code> (×0.2 on the tank's hull) unless it finds exposed crew.</p>`;
    { const c = b.querySelector('#wDps'), g = fitCanvas(c, 300); ART.ready(() => {
      const L = Object.entries(WPN).map(([k, w]) => [k, w[0], w[3] / w[2]]).sort((a, b) => b[2] - a[2]), mx = 200, rh = (g.H - 12) / L.length;
      loop(c, (dt, t) => { g.clearRect(0, 0, g.W, g.H); const k = Math.min(1, t / 1.2);
        L.forEach(([id, n, d], i) => { const y = 6 + i * rh, wi = 'wi_' + (id === 'hmg' ? 'lmg' : id === 'dmr' ? 'br' : id === 'shotgun' ? 'br' : id), w = (g.W - 150) * Math.min(1, d / mx) * k; if (ART.A && ART.A[wi]) sprFit(g, wi, 4, y + 2, 46, rh - 6); txt(g, n, 54, y + rh * 0.62, '#a49f86', '600 10.5px Chakra Petch'); g.fillStyle = id === 'shotgun' ? '#ff9a3c' : '#e0b72c'; g.fillRect(118, y + 4, w, rh - 9); txt(g, Math.round(d * k), 122 + w, y + rh * 0.62, '#f5d670', '10px JetBrains Mono'); });
      }); }); }
    { const c = b.querySelector('#wCone'), g = fitCanvas(c, 230), st = rv(b, 'wSt'), sp = rv(b, 'wSp'); let w = WPN.ar, ads = false, fire = true, bloom = 0, cd = 0; const shots = [];
      seg(b, 'wW', i => { w = [WPN.ar, WPN.ak, WPN.smg, WPN.lmg, WPN.sniper][i]; bloom = 0; });
      b.querySelector('#wAds').onclick = e => { ads = !ads; e.target.classList.toggle('on', ads); }; b.querySelector('#wFire').onclick = e => { fire = !fire; e.target.classList.toggle('on', fire); };
      ART.ready(() => loop(c, dt => {
        const sm = [1, 0.7, 0.45][st()] * (1 + clamp(sp() / 82, 0, 1.6) * 1.3) * (ads ? 0.5 : 1) * (1 + 1.6 * bloom), half = w[6] * sm, ox = 40, oy = g.H / 2, R = g.W - 60;
        bloom = Math.max(0, bloom - dt * 1.6); cd -= dt; if (fire && cd <= 0) { cd = w[2]; shots.push({ a: (Math.random() * 2 - 1) * half, t: 0 }); bloom = Math.min(1, bloom + (w[2] < 0.15 ? 0.11 : 0.3)); }
        g.fillStyle = '#0a0f08'; g.fillRect(0, 0, g.W, g.H);
        g.fillStyle = 'rgba(224,183,44,.12)'; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.cos(half) * R, oy + Math.sin(half) * R); g.lineTo(ox + Math.cos(-half) * R, oy + Math.sin(-half) * R); g.fill();
        g.strokeStyle = 'rgba(224,183,44,.5)'; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.cos(half) * R, oy + Math.sin(half) * R); g.moveTo(ox, oy); g.lineTo(ox + Math.cos(-half) * R, oy + Math.sin(-half) * R); g.stroke();
        for (let i = shots.length - 1; i >= 0; i--) { const s = shots[i]; s.t += dt; const d = Math.min(R, s.t * w[4] * 0.35); g.strokeStyle = `rgba(255,230,150,${1 - s.t * 0.8})`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(ox + Math.cos(s.a) * Math.max(0, d - 18), oy + Math.sin(s.a) * Math.max(0, d - 18)); g.lineTo(ox + Math.cos(s.a) * d, oy + Math.sin(s.a) * d); g.stroke(); if (d >= R) dot(g, ox + Math.cos(s.a) * R, oy + Math.sin(s.a) * R, 2, `rgba(239,90,68,${Math.max(0, 1.4 - s.t)})`); if (s.t > 1.6) shots.splice(i, 1); }
        sprDraw(g, ['sol_stand', 'sol_stand', 'sol_leg0'][st()] === 'sol_leg0' ? 'sol_leg0' : 'sol_stand', ox, oy, 0, 1.4); if (st() === 2) sprDraw(g, 'sol_stand', ox, oy, 0, 1.4);
        txt(g, `sm ${sm.toFixed(2)}   half-angle ${(half * 180 / Math.PI).toFixed(1)}°   bloom ${bloom.toFixed(2)}`, 10, g.H - 10, '#f5d670', '11px JetBrains Mono');
        g.fillStyle = '#25301f'; g.fillRect(g.W - 20, 12, 8, g.H - 40); g.fillStyle = '#ef5a44'; g.fillRect(g.W - 20, 12 + (g.H - 40) * (1 - bloom), 8, (g.H - 40) * bloom);
      })); }
  }
});
sys({
  id: 'blast', sec: 'BATTLE', title: 'Explosions', sub: '3_sim explosion · explosionFx', icon: 'boom1', blurb: 'Falloff, shelter behind walls, vehicle impulse, the particles and the light.',
  render(b) {
    b.innerHTML = `<p class="lead">One function, <code>explosion(x, y, r, dmgS, dmgV)</code>, serves grenades, rockets, shells, mines and dying vehicles. Soldiers get a curved falloff — but only if the blast can reach them (walls shelter, glass doesn't).</p>
    ${DEMO('bD', 'Tap anywhere to set off a shell blast. Numbers are the damage each soldier takes (stance changes it).', BTNS('bK', ['FRAG', 'ROCKET', 'SHELL', 'TANK DIES'], 2))}
    ${MX(`soldier dmg = dmgS × (1 − d / r)^0.6 × [1, .6][stance]
vehicle  f  = clamp(1 − dmin / (.6 r), .25, 1)
         dmg = dmgV × f,   push = 25 / mass × f
trees within .35 r and sandbags / hay within .55 r are destroyed`)}
    <h3>Falloff curve</h3>${DEMO('bC', 'The ^0.6 keeps damage high most of the way out, then drops it fast at the edge.')}
    ${vars([['frag', 'r 88', '150 soldier · 90 vehicle'], ['rocket', 'r 62', '110 / 50 · direct hit tank 230, vehicle 280, soldier 120'], ['shell', 'r 78', '180 / 60 · direct tank 210, vehicle 300, soldier 200'], ['mine', 'r 70', '+460 direct to the vehicle on it'], ['tank dies', 'r 110', 'jeep 80; kills exposed crew, +300 / +200 pts']])}
    <h3>What you see and hear</h3>${FLOW(['<b>Particles</b>: n = r / 5 fire, .8n smoke, .6n debris, a flash, the boom sprite, a shock ring (cap 1400 particles)', '<b>A real light</b>: <code>lightFx(x, y, r × 2.2)</code> — fades as (1 − u)² and lights everything around it this frame and the next ones', '<b>Sound</b>: thump 52 → 15 Hz for 1.7 s, a second thump, 2.3 s of noise, 26 crackles; <code>earRing</code> muffles your ears if you were close', '<b>Scorch</b>: a radial gradient burnt permanently into the ground canvas', '<b>Shake & rumble</b> on gamepads within 400 px'])}`;
    const K = [[88, 150, 'FRAG'], [62, 110, 'ROCKET'], [78, 180, 'SHELL'], [110, 400, 'TANK']]; let k = 2, bx = null, by = null, bt = 9;
    seg(b, 'bK', i => k = i);
    const c = b.querySelector('#bD'), g = fitCanvas(c, 250), sols = [];
    for (let i = 0; i < 9; i++) sols.push({ x: 0.1 + 0.8 * Math.random(), y: 0.15 + 0.7 * Math.random(), st: i % 2, a: Math.random() * TAU });
    const wall = { x: 0.55, y: 0.18, w: 0.04, h: 0.42 };
    c.onclick = e => { const r = c.getBoundingClientRect(); bx = e.clientX - r.left; by = e.clientY - r.top; bt = 0; };
    const segRect = (x0, y0, x1, y1, R) => { let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0; for (const [p, q] of [[-dx, x0 - R.x], [dx, R.x + R.w - x0], [-dy, y0 - R.y], [dy, R.y + R.h - y0]]) { if (p === 0) { if (q < 0) return false; } else { const t = q / p; if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t); } } return t0 <= t1; };
    ART.ready(() => loop(c, dt => {
      bt += dt; const W = g.W, H = g.H, sc = W / 520, [r, dm] = K[k], R = r * sc * 1.0, wr = { x: wall.x * W, y: wall.y * H, w: wall.w * W, h: wall.h * H };
      g.fillStyle = '#16351a'; g.fillRect(0, 0, W, H); g.fillStyle = '#6e5a46'; g.fillRect(wr.x, wr.y, wr.w, wr.h); txt(g, 'wall', wr.x - 2, wr.y - 4, '#a49f86', '10px Chakra Petch');
      if (bx !== null) { const gr = g.createRadialGradient(bx, by, 0, bx, by, R * 0.5); gr.addColorStop(0, 'rgba(20,14,8,.8)'); gr.addColorStop(1, 'rgba(20,14,8,0)'); g.fillStyle = gr; g.fillRect(bx - R, by - R, R * 2, R * 2); g.strokeStyle = 'rgba(224,183,44,.5)'; g.setLineDash([4, 4]); g.beginPath(); g.arc(bx, by, R, 0, TAU); g.stroke(); g.setLineDash([]); }
      for (const s of sols) {
        const x = s.x * W, y = s.y * H; sprDraw(g, s.st === 1 ? 'sol_leg0' : 'sol_stand', x, y, s.a, 1.1 * sc * 1.6); if (s.st === 1) sprDraw(g, 'sol_stand', x, y, s.a, 1.1 * sc * 1.6);
        txt(g, ['stand', 'prone'][s.st], x, y + 22, '#6f725f', '9px Chakra Petch', 'center');
        if (bx !== null) { const d = Math.hypot(x - bx, y - by) / sc, shel = segRect(bx, by, x, y, wr); let v = d < r && !shel ? dm * (1 - d / r) ** 0.6 * [1, 0.6][s.st] : 0; const a = clamp(2.5 - bt, 0, 1);
          txt(g, shel && d < r ? 'sheltered' : v ? '−' + Math.round(v) : '', x, y - 16 - Math.min(1, bt) * 8, shel ? '#5fd3d0' : '#ef5a44', '700 12px JetBrains Mono', 'center'); if (v && bt < 0.4) { g.strokeStyle = 'rgba(239,90,68,.6)'; g.beginPath(); g.moveTo(bx, by); g.lineTo(x, y); g.stroke(); } }
      }
      if (bx !== null && bt < 0.6) { g.globalCompositeOperation = 'lighter'; sprDraw(g, 'boom' + Math.min(2, (bt * 6) | 0), bx, by, 0, R / 30); const fl = g.createRadialGradient(bx, by, 0, bx, by, R * 2.2); fl.addColorStop(0, `rgba(255,200,120,${0.5 * (1 - bt / 0.6) ** 2})`); fl.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fl; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
      else if (bx !== null && bt < 3) for (let i = 0; i < 3; i++) sprDraw(g, 'smoke' + i, bx + i * 8 + bt * 6, by - bt * 10 - i * 4, bt * 0.5, 0.6 + bt * 0.3, Math.max(0, 0.7 - bt / 4));
      if (bx === null) txt(g, 'tap to detonate', W / 2, H / 2, '#a49f86', '600 13px Chakra Petch', 'center');
    }));
    const c2 = b.querySelector('#bC'), g2 = fitCanvas(c2, 170); const P = plot(g2, { x0: 0, x1: 1, y0: 0, y1: 1, gx: [0, 0.25, 0.5, 0.75, 1], gy: [0, 0.5, 1], xl: 'd / r', yl: 'share of dmgS', c: [{ f: x => (1 - x) ** 0.6, col: COL.acc }, { f: x => 1 - x, col: COL.faint, dash: [4, 4], w: 1 }, { f: x => clamp(1 - x / 0.6, 0.25, 1), col: COL.cyan, w: 1.5 }] });
    txt(g2, 'soldier (1−d/r)^.6', P.X(0.62), P.Y(0.92), COL.acc, '600 10px Chakra Petch'); txt(g2, 'vehicle f', P.X(0.62), P.Y(0.8), COL.cyan, '600 10px Chakra Petch'); txt(g2, 'linear', P.X(0.62), P.Y(0.68), COL.faint, '600 10px Chakra Petch');
  }
});
sys({
  id: 'vehicles', sec: 'BATTLE', title: 'Vehicles & Driving', sub: '3_sim VT · vehDrive · crash', icon: 'hull0', blurb: 'Tank turns in place, jeep slides. One stick, one target heading.',
  render(b) {
    b.innerHTML = `<p class="lead">Vehicles steer toward the stick's direction, not with left/right keys. The difference between the tank and the jeep is a handful of numbers and two throttle curves.</p>
    ${DEMO('vD', 'Drag on the field: the vehicle drives toward your finger. Watch the tank stop and pivot before it moves; the jeep slides.', BTNS('vT', ['TANK', 'JEEP'], 0))}
    ${MX(`d       = angDiff(heading, target)
steer   = clamp(2.6 d, −1, 1)
tank    throttle = m × max(0, cos d)³     // pivots first
jeep    throttle = m × max(.3, cos d)
turn    tank  steer × 1.3 rad/s
        jeep  steer × 2.6 × clamp(|spd| / 80)   // must roll to turn
reverse when |d| > 2.25 at < 90 px/s (forward again < 1.3)
grip    tank 1 (no slide) · jeep 6·dt (rain 4) · ice 1.6dt / 1.1dt
v       = lerp(v, heading × spd, grip)`)}
    <h3>Throttle vs angle off target</h3>${DEMO('vC', '')}
    ${tbl(['', 'tank', 'jeep', 'nest'], [['top speed', '82', '205 × (.7 + .3 hp%)', '—'], ['reverse', '50', '85', ''], ['accel / brake', '90 / 160', '210 / 380', ''], ['drag', '70', '120', ''], ['mass', '5', '1.4', '99'], ['hp', '1350', '390', '420'], ['respawn', '24 s', '18 s', '30 s'], ['seats', 'driver · gunner · 2 riders', 'driver · passenger · gunner', 'MG']])}
    <h3>Hitting things</h3>${FLOW(['<b>Run-over</b>: > 50 px/s with a driver kills enemies on foot (999 crush)', '<b>Crush</b>: tanks flatten every static; jeeps break fences > 30, bags / hay > 110 px/s and lose speed (×.82, tank ×.96)', '<b>Vehicle vs vehicle</b>: overlap split by mass (wA = mB / (mA + mB)); off-centre shoves add spin; closing speed > 70 hurts: (rel − 60) × .25 × mass ratio', '<b>Walls</b> at > 120 px/s: clang, the jeep takes damage ∝ (sp − CRASH_V)², spd × .6', '<b>Burning</b> below 25% hp: loses 1.8% hp/s; smoke below 55%'])}
    <h3>Turret & MG</h3>${vars([['turret slew', '1.7 rad/s', 'stops if the barrel would enter a wall'], ['cannon', 'reload 2.3 s', 'fires only within .35 rad of aim; shell 760 px/s, 88 px barrel, kick 20 px'], ['MG', '1150 px/s', 'dmg 15 (nest 20), cooldown .075, heat +.05/shot, cools .38/s, overheats 1.6 s'], ['MG swing', '7 rad/s', 'nest limited to ±1.25 rad']])}`;
    let ty = 0; seg(b, 'vT', i => { ty = i; reset(); });
    const c = b.querySelector('#vD'), g = fitCanvas(c, 260); let v, tx = null, tyy = null;
    const reset = () => { v = { x: g.W / 2, y: g.H / 2, a: 0, spd: 0, vx: 0, vy: 0, rev: false }; tx = null; }; reset();
    const at = e => { const r = c.getBoundingClientRect(); tx = e.clientX - r.left; tyy = e.clientY - r.top; };
    c.onpointerdown = e => { at(e); c.setPointerCapture(e.pointerId); }; c.onpointermove = e => { if (e.buttons || e.pointerType === 'touch') at(e); };
    const trail = [];
    ART.ready(() => loop(c, dt => {
      const T = ty ? { maxF: 205, maxR: 85, acc: 210, brake: 380, drag: 120, turn: 2.6 } : { maxF: 82, maxR: 50, acc: 90, brake: 160, drag: 70, turn: 1.3 }, sc = Math.min(1, g.W / 420);
      let tgt = 0, d = 0, thr = 0;
      if (tx !== null) { const dx = tx - v.x, dy = tyy - v.y, dist = Math.hypot(dx, dy); if (dist > 20) { const want = Math.atan2(dy, dx); d = Math.atan2(Math.sin(want - v.a), Math.cos(want - v.a)); if (!v.rev && Math.abs(d) > 2.25 && Math.abs(v.spd) < 90) v.rev = true; if (v.rev && Math.abs(Math.atan2(Math.sin(want - v.a - Math.PI), Math.cos(want - v.a - Math.PI))) > 1.3 && Math.abs(d) < 1.3) v.rev = false; const dd = v.rev ? Math.atan2(Math.sin(want - v.a - Math.PI), Math.cos(want - v.a - Math.PI)) : d, m = Math.min(1, dist / 120); thr = ty ? m * Math.max(0.3, Math.cos(dd)) : m * Math.max(0, Math.cos(dd)) ** 3; const steer = clamp(2.6 * dd, -1, 1); v.a += (ty ? steer * T.turn * clamp(Math.abs(v.spd) / 80, 0, 1) * Math.sign(v.spd || 1) : steer * T.turn) * dt; tgt = (v.rev ? -T.maxR : T.maxF) * thr; d = dd; } }
      const a = tgt === 0 ? T.drag : Math.sign(tgt - v.spd) !== Math.sign(v.spd) && v.spd ? T.brake : T.acc; v.spd += clamp(tgt - v.spd, -a * dt, a * dt);
      const grip = ty ? Math.min(1, dt * 6) : 1; v.vx = lerp(v.vx, Math.cos(v.a) * v.spd, grip); v.vy = lerp(v.vy, Math.sin(v.a) * v.spd, grip); v.x = clamp(v.x + v.vx * dt * sc, 20, g.W - 20); v.y = clamp(v.y + v.vy * dt * sc, 20, g.H - 20);
      trail.push([v.x, v.y]); if (trail.length > 120) trail.shift();
      g.fillStyle = '#2a3a1c'; g.fillRect(0, 0, g.W, g.H); g.fillStyle = 'rgba(40,30,15,.5)'; trail.forEach(([x, y], i) => i % 3 || g.fillRect(x - 1.5, y - 1.5, 3, 3));
      if (tx !== null) { g.strokeStyle = 'rgba(224,183,44,.6)'; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(v.x, v.y); g.lineTo(tx, tyy); g.stroke(); g.setLineDash([]); dot(g, tx, tyy, 5, COL.acc); }
      g.save(); g.translate(v.x, v.y); g.scale(sc * 0.9, sc * 0.9);
      if (ty) { sprDraw(g, 'jeep0', 0, 0, v.a); } else { for (const [i, fy] of [[0, -1], [1, 1]]) { const m = ART.A.track0, lx = 0.3 + m[4] - m[2] / 2, ly = [-23.5, 24.5][i] + fy * (m[5] - m[3] / 2); sprDraw(g, 'track0', lx * Math.cos(v.a) - ly * Math.sin(v.a), lx * Math.sin(v.a) + ly * Math.cos(v.a), v.a, 1, 1, fy); } sprDraw(g, 'hull0', 0, 0, v.a); sprDraw(g, 'tur_gun', -4 * Math.cos(v.a), -4 * Math.sin(v.a), v.a); sprDraw(g, 'tur', -4 * Math.cos(v.a), -4 * Math.sin(v.a), v.a); }
      g.restore();
      txt(g, `d ${(d * 180 / Math.PI).toFixed(0)}°  throttle ${thr.toFixed(2)}  spd ${v.spd.toFixed(0)} px/s${v.rev ? '  REVERSE' : ''}`, 10, g.H - 10, '#f5d670', '11px JetBrains Mono');
    }));
    const g2 = fitCanvas(b.querySelector('#vC'), 160), P = plot(g2, { x0: 0, x1: Math.PI, y0: 0, y1: 1, gx: [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI], fx: x => Math.round(x * 180 / Math.PI) + '°', gy: [0, 0.5, 1], xl: 'angle off target', c: [{ f: x => Math.max(0, Math.cos(x)) ** 3, col: COL.acc }, { f: x => Math.max(0.3, Math.cos(x)), col: COL.cyan }] });
    txt(g2, 'tank cos³', P.X(1.9), P.Y(0.85), COL.acc, '600 10px Chakra Petch'); txt(g2, 'jeep max(.3, cos)', P.X(1.9), P.Y(0.65), COL.cyan, '600 10px Chakra Petch');
  }
});
sys({
  id: 'soldiers', sec: 'BATTLE', title: 'Soldiers', sub: '3_sim controlSoldier · hurtSoldier', icon: 'sol_stand', blurb: 'Stances, speeds, hitboxes, health, regen, kits.',
  render(b) {
    b.innerHTML = `<p class="lead">Every soldier — yours, a bot's, an online player's — runs the same <code>controlSoldier(s, I, dt)</code> with an input object <code>I</code>. Only where <code>I</code> comes from differs.</p>
    ${DEMO('sD', 'Hit circle (red) shrinks as you go down; the bar is how fast you move.', BTNS('sS', ['STAND', 'PRONE', 'SPRINT'], 0))}
    ${vars([['walk', '82 px/s', 'sprint 128 · prone 34 · swim 40 · wrench 30 · ADS ×.6'], ['smoothing', 'k = 1 − e^(−14 dt)', 'velocity eases to the stick (ice: 3)'], ['hit radius', '9 / 4.5', 'stand / prone (seated 7, swimming 6)'], ['blast taken', '×1 / .6', 'by stance'], ['hp', '100', 'co-op players 200'], ['regen', '+9 hp/s', 'after 5 s without damage'], ['jump', '.42 s', 'needs ≥ 110 px/s; clears low cover'], ['knife', '28 px · ±1 rad', '100 dmg, .7 s cooldown'], ['spawn shield', '1.6 s', ''], ['respawn', '5 s / 6 s', 'player / bot']])}
    <h3>Kits</h3>${tbl(['kit', 'primary', 'second', 'nades', 'gadget'], [['RIFLEMAN', 'M4 / SCAR', 'pistol / m-pistol', '3', 'medic bag: 14 hp/s within 58 px, 12 s'], ['ENGINEER', 'AK / SMG / shotgun', 'bazooka', '1', 'wrench: 110 hp/s tank, 70 jeep'], ['SUPPORT', 'LMG / HMG', 'pistol / m-pistol', '2', 'ammo box: +35% reserve every 2 s, 15 s'], ['RECON', '.50 cal / DMR', 'pistol', '1', 'AT mines (3 max) · spots enemies']])}
    <h3>Scoring</h3>${vars([['kill', '+100', 'roadkill +150, teamkill −100'], ['flag capture', '+200', 'each soldier in the ring'], ['vehicle kill', '+300 / +200', 'tank / jeep'], ['heal / repair', '+10', 'per 25 hp healed / 50 hp repaired'], ['ammo pouch', '35%', 'dropped on death; +25% reserve']])}`;
    let st = 0; seg(b, 'sS', i => st = i);
    const c = b.querySelector('#sD'), g = fitCanvas(c, 200); let x = 40, ph = 0;
    ART.ready(() => loop(c, (dt, t) => {
      const sp = [82, 34, 128][st], hr = [9, 4.5, 9][st], sc = 2.6; x += sp * dt * 0.9; ph += dt * sp / 12; if (x > g.W + 30) x = -30;
      g.fillStyle = '#1d3a1e'; g.fillRect(0, 0, g.W, g.H); const y = g.H * 0.45;
      g.strokeStyle = 'rgba(52,92,242,.8)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, 10 * sc, 8 * sc, 0, 0, TAU); g.stroke();
      if (st === 1) sprDraw(g, 'sol_leg' + ((ph | 0) % 3), x, y, 0, sc); else { const f = Math.sin(ph) * 5; g.fillStyle = '#2b2b1e'; g.fillRect(x + f * sc - 4, y - 7 * sc, 8, 5); g.fillRect(x - f * sc - 4, y + 4 * sc, 8, 5); }
      sprDraw(g, 'sol_stand', x, y, 0, sc);
      g.strokeStyle = 'rgba(239,90,68,.9)'; g.setLineDash([3, 3]); g.beginPath(); g.arc(x, y, hr * sc, 0, TAU); g.stroke(); g.setLineDash([]);
      txt(g, `${['STAND', 'PRONE', 'SPRINT'][st]} · ${sp} px/s · hit r ${hr}`, 10, g.H - 34, '#f5d670', '11px JetBrains Mono');
      g.fillStyle = '#25301f'; g.fillRect(10, g.H - 22, g.W - 20, 8); g.fillStyle = COL.acc; g.fillRect(10, g.H - 22, (g.W - 20) * sp / 128, 8);
    }));
  }
});
sys({
  id: 'proj', sec: 'BATTLE', title: 'Bullets, Shells & Height', sub: '3_sim updateProjectiles · shotFall', icon: 'tur_gun', blurb: 'Every shot has a height. Low cover stops low bullets. Grenades arc.',
  render(b) {
    b.innerHTML = `<p class="lead">The game is top-down but shots live in 3D: each projectile carries a height <code>z</code> above the ground. It starts at the muzzle's painted height and falls; whatever it crosses is hit only if the shot is below its top.</p>
    ${DEMO('pD', 'Side view. A prone shooter\'s bullet starts low and is stopped by the sandbags; a standing one clears them.', BTNS('pS', ['STANDING', 'PRONE'], 0))}
    ${MX(`each step: segment (x0,y0,z0) → (x1,y1,z1)
nearest hit t over: ground (z ≤ 0), walls, wrecks under their top,
  statics, soldiers (circle by stance), vehicles (box under topOf(v))
bullet fall:  z' = z − (z − top/2) × speed / d   // something lower ahead
              else z × U(.8, 2) per second
shell / rocket: z falls by z / life`)}
    <h3>Grenades</h3>${DEMO('pG', 'Distance is clamped to 60–300 px; the throw is solved so it lands at the time T.')}
    ${MX(`T  = 2 × 260 / 700 ≈ .74 s
ground speed = dist / .75
vh = (350 T² − h0) / T            // up-speed so it lands at T
h'' = −700 px/s² · bounce vh × −.35 · friction e^(−3 dt)
frag fuse 1.7 s · smoke 1.4 s`)}
    ${vars([['sandbag stops a bullet', 'if', 'shooter prone, or bullet below the bag top (12), or a prone man lies within 30 px — never your own cover within 30 px'], ['vehicle crew', '60%', 'exposed crew on the line get hit if aimed at (or 60% chance); else the hull takes vdmg'], ['whiz', '30 px', 'a near miss plays a whiz to that player'], ['lag comp', 'lagAt(e, T)', 'joiners\' shots are tested against where targets were when they fired']])}`;
    let st = 0; seg(b, 'pS', i => st = i);
    const c = b.querySelector('#pD'), g = fitCanvas(c, 190); let shots = [], cd = 0;
    loop(c, dt => {
      const W = g.W, H = g.H, gy = H - 30, sx = 30, bag = W * 0.55, bagH = 12, k = (H - 60) / 40, h0 = [30, 5][st];
      cd -= dt; if (cd <= 0) { cd = 0.35; shots.push({ x: sx, z: h0 + (Math.random() - 0.5) * 2, dead: 0 }); }
      g.fillStyle = '#0a0f08'; g.fillRect(0, 0, W, H); g.fillStyle = '#2a3a1c'; g.fillRect(0, gy, W, 30);
      g.fillStyle = '#b39b52'; g.beginPath(); g.ellipse(bag, gy - bagH * k / 2, 14, bagH * k / 2, 0, 0, TAU); g.fill(); txt(g, 'sandbags · 12 px', bag, gy - bagH * k - 6, '#a49f86', '10px Chakra Petch', 'center');
      g.fillStyle = '#345cf2'; const bh = [36, 7][st]; g.fillRect(sx - 6, gy - bh * k, 12, bh * k); txt(g, 'z₀ = ' + h0, sx + 12, gy - h0 * k, '#f5d670', '10px JetBrains Mono');
      g.fillStyle = '#e02c26'; g.fillRect(W - 40, gy - 36 * k, 12, 36 * k);
      for (const s of shots) { if (!s.dead) { s.x += 900 * dt * W / 900; s.z -= s.z * 0.9 * dt; if (Math.abs(s.x - bag) < 8 && (st > 0 || s.z < bagH)) s.dead = 1; if (s.x > W - 40) s.dead = 2; } else s.dead += dt; dot(g, s.x, gy - s.z * k, 2.5, s.dead === 1 || (s.dead > 0 && s.dead < 1 && s.x < bag + 9) ? '#ef5a44' : '#ffe39a'); }
      shots = shots.filter(s => s.dead < 1.2 && s.x < W);
      txt(g, 'height ↑', 4, 14, '#6f725f', '10px Chakra Petch');
    });
    const c2 = b.querySelector('#pG'), g2 = fitCanvas(c2, 170);
    loop(c2, (dt, t) => {
      const W = g2.W, H = g2.H, gy = H - 22, T = 2 * 260 / 700, u = (t % 2.4), d = 220, sx = 30, k = (W - 60) / 300, h0 = 20, vh = (350 * T * T - h0) / T;
      g2.fillStyle = '#0a0f08'; g2.fillRect(0, 0, W, H); g2.fillStyle = '#2a3a1c'; g2.fillRect(0, gy, W, 22);
      g2.strokeStyle = 'rgba(224,183,44,.35)'; g2.setLineDash([3, 4]); g2.beginPath(); for (let i = 0; i <= 40; i++) { const tt = T * i / 40, x = sx + d / 0.75 * tt * k, h = h0 + vh * tt - 350 * tt * tt; i ? g2.lineTo(x, gy - h * 0.7) : g2.moveTo(x, gy - h * 0.7); } g2.stroke(); g2.setLineDash([]);
      let x, h; if (u < T) { x = sx + d / 0.75 * u * k; h = h0 + vh * u - 350 * u * u; } else { const e = u - T; x = sx + d * k * (T / 0.75) + 40 * k * (1 - Math.exp(-3 * e)); h = Math.max(0, vh * 0.35 * e - 350 * e * e); }
      dot(g2, x, gy - h * 0.7, 4, '#7ddc6a'); txt(g2, `t ${u.toFixed(2)} s   h ${h.toFixed(0)} px`, 10, 16, '#f5d670', '11px JetBrains Mono');
      if (u > 1.7 && u < 1.95) { g2.globalCompositeOperation = 'lighter'; const gr = g2.createRadialGradient(x, gy, 0, x, gy, 60); gr.addColorStop(0, 'rgba(255,190,90,.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g2.fillStyle = gr; g2.fillRect(x - 60, gy - 60, 120, 120); g2.globalCompositeOperation = 'source-over'; }
    });
  }
});
sys({
  id: 'bots', sec: 'BATTLE', title: 'Bots', sub: '4_ai botControl', icon: 'sol_rpg', blurb: 'They think 3–4×/s, see by the light, take cover, drive, miss like people.',
  render(b) {
    b.innerHTML = `<p class="lead">A bot is a soldier whose input <code>I</code> comes from <code>botControl</code> instead of a device. It thinks every .22–.36 s and moves every frame. What it can see depends on the actual light at the target.</p>
    <h3>Each think</h3>${FLOW(['<b>Target</b>: nearest visible enemy in range (440 px; recon 640, tank 620, seated 520), passing <code>sees()</code>. Tanks and rocket carriers prefer vehicles.', '<b>React</b>: a new target waits react × U(.7, 1.3) before shooting', '<b>Goal</b>: flags scored by distance + 900 if ours, −150 if attacked, −250 neutral, + rand 500; TDM: nearest enemy ± 400. Hurt < 45 hp → a crate within 380', '<b>Path</b>: A* on the walk grid (vehicles: drive grid), replanned every 2.5–4 s', '<b>Decide</b>: cover, smoke, repair, enter a vehicle, drop a medbag / ammo / mine, strafe, prone-snipe', '<b>Aim</b>: target + its velocity × distance / bullet speed, plus error'])}
    <h3>Seeing in the dark</h3>${DEMO('bV', 'How far a bot sees a target, by how lit the target is (litAt: sun, flashes, fires, lamps). Someone who just fired is always seen.')}
    ${MX(`range = lerp(dark, day, litAt(target))
day  [10000, 240]  stand / prone
dark [  150,  70]
seen if d ≤ range and sees(eye, target)   // no wall, smoke+glass < .5
err  = U(−1, 1) × skill.err × (1 + d / 400)  // radians
lead = target + v × d / 1050            // tank: / 760`)}
    ${tbl(['skill', 'react s', 'aim err', 'fire rate'], [['ROOKIE', '.6', '.17', '.55'], ['REGULAR', '.38', '.09', '.8'], ['VETERAN', '.22', '.05', '1']])}
    <h3>Aim error at a distance</h3>${DEMO('bE', 'Shots from a bot at 300 px for each skill. Co-op waves sharpen raiders: err × (1 − .5k), k = min(1, (wave − 1) / 9).', BTNS('bS', ['ROOKIE', 'REGULAR', 'VETERAN'], 1))}
    <h3>Movement states</h3>${vars([['duel', '< 300 px', 'approach > 260, back off < 150, strafe .8 sideways, switch every .8–1.8 s'], ['cover', '150 px', 'a sandbag crescent facing the threat (±1 rad), prone when close'], ['camp', '5%', 'a window / door post for 15–30 s (tiled maps)'], ['bursts', 'U(.4, 1.1) × rate s', 'rest U(.25, .7) / rate'], ['grenade', '8%', 'at 110–270 px; vs vehicles < 200'], ['stuck', '< 12 px in 1.2 s', 'random unstick for .5 s'], ['heard', '± 15% of d', 'shot at by someone unseen: returns fire at a guess for 2.5 s']])}`;
    const g = fitCanvas(b.querySelector('#bV'), 180), P = plot(g, { x0: 0, x1: 1, y0: 0, y1: 420, gx: [0, 0.25, 0.5, 0.75, 1], gy: [0, 100, 200, 300, 400], xl: 'litAt(target)', yl: 'px', l: 40, c: [{ f: x => lerp(150, 1e4, x), col: COL.acc }, { f: x => lerp(70, 240, x), col: COL.violet }] });
    txt(g, 'standing (→ 10 000 in daylight)', P.X(0.02), P.Y(395), COL.acc, '600 10px Chakra Petch'); txt(g, 'prone', P.X(0.8), P.Y(170), COL.violet, '600 10px Chakra Petch');
    let sk = 1; seg(b, 'bS', i => sk = i); const c = b.querySelector('#bE'), g2 = fitCanvas(c, 170); let hits = [], cd = 0;
    ART.ready(() => loop(c, dt => {
      const err = [0.17, 0.09, 0.05][sk], W = g2.W, H = g2.H, sx = 30, tx = W - 50, ty = H / 2, d = 300, sc = (tx - sx) / d; cd -= dt;
      if (cd <= 0) { cd = 0.12 / [0.55, 0.8, 1][sk]; const e = (Math.random() * 2 - 1) * err * (1 + d / 400); hits.push({ y: ty + Math.tan(e) * d * sc, t: 0 }); }
      g2.fillStyle = '#0a0f08'; g2.fillRect(0, 0, W, H); sprDraw(g2, 'sol_stand', sx, ty, 0, 1.4); sprDraw(g2, 'sol_stand', tx, ty, Math.PI, 1.4);
      g2.strokeStyle = 'rgba(239,90,68,.6)'; g2.beginPath(); g2.arc(tx, ty, 9 * sc, 0, TAU); g2.stroke();
      for (const h of hits) { h.t += dt; g2.strokeStyle = `rgba(255,230,150,${Math.max(0, 0.6 - h.t)})`; g2.beginPath(); g2.moveTo(sx + 12, ty); g2.lineTo(tx, h.y); g2.stroke(); dot(g2, tx, h.y, 2, Math.abs(h.y - ty) < 9 * sc ? '#7ddc6a' : '#ef5a44'); }
      hits = hits.filter(h => h.t < 2.5); const hr = hits.filter(h => Math.abs(h.y - ty) < 9 * sc).length / Math.max(1, hits.length);
      txt(g2, `max error ±${(err * 1.75 * 180 / Math.PI).toFixed(1)}° at 300 px · hit ${(hr * 100).toFixed(0)}%`, 10, H - 10, '#f5d670', '11px JetBrains Mono');
    }));
  }
});
sys({
  id: 'astar', sec: 'BATTLE', title: 'Pathfinding (A*)', sub: '2_maps astar · navS / navV', icon: 'ic_wheel', blurb: 'Grid A* with an octile heuristic, then string-pulled into straight runs.',
  render(b) {
    b.innerHTML = `<p class="lead">The map is rasterised into two grids of 30 px cells: <code>navS</code> for feet, <code>navV</code> for wheels (buildings padded by 38 px, water by 30). A* finds a cell path, then string pulling cuts it into the fewest straight lines.</p>
    ${DEMO('aD', 'Tap cells to add or remove walls. Watch the open set (yellow) grow toward the goal, then the path get pulled tight (cyan).', '<button class="btn" id="aR">NEW MAP</button><button class="btn on" id="aP">PULL STRING</button>')}
    ${MX(`f = g + h
h = max(dx, dy) + .414 × min(dx, dy)   // octile: exact on an 8-way grid
diagonal step 1.414, no cutting corners
open list: binary heap · cap 6000 iterations
string pull: from each point jump to the farthest
  point with lineFree (sampled every NC/2 px)`)}
    ${vars([['NC', '30 px', 'cell (tiled maps: the house grid)'], ['navS', '0 / 1 / 2', 'open / blocked / window (vault costs +5)'], ['navV pad', '+38 px', 'buildings; water +30; trees / hay 32'], ['navDirty', 'flag', 'a destroyed bag, a moved wreck → rebuild once next frame'], ['arrive', '22 px', 'waypoint radius (vehicles 45)']])}`;
    const c = b.querySelector('#aD'), g = fitCanvas(c, 260); let N, Mx, My, grid, S, G, run, path, pull = true;
    const make = () => { N = Math.max(10, Math.floor(g.W / 18)); Mx = N; My = Math.floor(g.H / (g.W / N)); grid = new Uint8Array(Mx * My); const R = Math.random; for (let i = 0; i < 9; i++) { const x = (R() * Mx) | 0, y = (R() * My) | 0, w = 1 + (R() * 4 | 0), h = 1 + (R() * 4 | 0); for (let j = y; j < Math.min(My, y + h); j++) for (let k = x; k < Math.min(Mx, x + w); k++) grid[j * Mx + k] = 1; } S = [1, (My / 2) | 0]; G = [Mx - 2, (My / 2) | 0]; grid[S[1] * Mx + S[0]] = 0; grid[G[1] * Mx + G[0]] = 0; start(); let n = 0; while (!run.done && n++ < 5000) step(); if (!path) return make(); start(); };
    const start = () => { run = { open: [[0, S[0], S[1]]], g: new Float32Array(Mx * My).fill(1e9), from: new Int32Array(Mx * My).fill(-1), closed: new Uint8Array(Mx * My), done: false, t: 0 }; run.g[S[1] * Mx + S[0]] = 0; path = null; };
    const hh = (x, y) => { const dx = Math.abs(x - G[0]), dy = Math.abs(y - G[1]); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const step = () => { const o = run.open; if (!o.length) { run.done = true; return; } o.sort((a, b) => a[0] - b[0]); const [, x, y] = o.shift(), i = y * Mx + x; if (run.closed[i]) return; run.closed[i] = 1; if (x === G[0] && y === G[1]) { run.done = true; let p = [], k = i; while (k >= 0) { p.push([k % Mx, (k / Mx) | 0]); k = run.from[k]; } path = p.reverse(); return; }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= Mx || Y >= My || grid[Y * Mx + X]) continue; if (dx && dy && (grid[y * Mx + X] || grid[Y * Mx + x])) continue; const j = Y * Mx + X, ng = run.g[i] + (dx && dy ? 1.414 : 1); if (ng < run.g[j]) { run.g[j] = ng; run.from[j] = i; o.push([ng + hh(X, Y), X, Y]); } } };
    const free = (a, b2) => { const d = Math.hypot(b2[0] - a[0], b2[1] - a[1]), n = Math.ceil(d * 4); for (let i = 0; i <= n; i++) { const x = a[0] + (b2[0] - a[0]) * i / n, y = a[1] + (b2[1] - a[1]) * i / n; for (const [ox, oy] of [[-0.3, -0.3], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3]]) if (grid[Math.floor(y + 0.5 + oy) * Mx + Math.floor(x + 0.5 + ox)]) return false; } return true; };
    const pulled = () => { if (!path) return null; const out = [path[0]]; let i = 0; while (i < path.length - 1) { let j = path.length - 1; while (j > i + 1 && !free(path[i], path[j])) j--; out.push(path[j]); i = j; } return out; };
    c.onclick = e => { const r = c.getBoundingClientRect(), cs = g.W / Mx, x = Math.floor((e.clientX - r.left) / cs), y = Math.floor((e.clientY - r.top) / cs); if (x < 0 || y < 0 || x >= Mx || y >= My || (x === S[0] && y === S[1]) || (x === G[0] && y === G[1])) return; grid[y * Mx + x] ^= 1; start(); };
    b.querySelector('#aR').onclick = make; b.querySelector('#aP').onclick = e => { pull = !pull; e.target.classList.toggle('on', pull); };
    make();
    loop(c, dt => {
      if (!run.done) for (let k = 0; k < 3; k++) step(); else { run.t += dt; if (run.t > 4) start(); }
      const cs = g.W / Mx; g.fillStyle = '#0f170d'; g.fillRect(0, 0, g.W, g.H);
      for (let y = 0; y < My; y++) for (let x = 0; x < Mx; x++) { const i = y * Mx + x; if (grid[i]) { g.fillStyle = '#5a4a3a'; g.fillRect(x * cs, y * cs, cs, cs); } else if (run.closed[i]) { g.fillStyle = `rgba(224,183,44,${0.12 + 0.18 * Math.min(1, run.g[i] / 30)})`; g.fillRect(x * cs + 1, y * cs + 1, cs - 2, cs - 2); } }
      g.strokeStyle = 'rgba(255,255,255,.04)'; for (let x = 0; x <= Mx; x++) { g.beginPath(); g.moveTo(x * cs, 0); g.lineTo(x * cs, My * cs); g.stroke(); }
      const C = p => [p[0] * cs + cs / 2, p[1] * cs + cs / 2];
      if (path) { g.strokeStyle = 'rgba(224,183,44,.8)'; g.lineWidth = 2; g.beginPath(); path.forEach((p, i) => i ? g.lineTo(...C(p)) : g.moveTo(...C(p))); g.stroke(); const pp = pull && run.t > 0.8 ? pulled() : null; if (pp) { g.strokeStyle = COL.cyan; g.lineWidth = 3; g.beginPath(); pp.forEach((p, i) => i ? g.lineTo(...C(p)) : g.moveTo(...C(p))); g.stroke(); pp.forEach(p => dot(g, ...C(p), 3.5, COL.cyan)); } g.lineWidth = 1; }
      dot(g, ...C(S), cs * 0.38, COL.blue); dot(g, ...C(G), cs * 0.38, COL.red);
      txt(g, run.done ? (path ? `path ${path.length} cells` : 'no path') : `searching… ${run.open.length} open`, 8, g.H - 8, '#f5d670', '11px JetBrains Mono');
    });
  }
});
sys({
  id: 'los', sec: 'BATTLE', title: 'Line of Sight & Fog', sub: '3_sim sees · 5b_fog visPoly', icon: 'ic_enter', blurb: 'One rule for bots, aim assist and your screen. Exact visibility polygons.',
  render(b) {
    b.innerHTML = `<p class="lead">Seeing is one function everywhere: <code>sees(a, b)</code> — no hard wall between, and the "soft" cover (smoke + glass) under one half. Your fog of war is the exact region your soldiers see, computed as a polygon.</p>
    ${DEMO('lD', 'Drag the eye. Rays go to every wall corner (plus a hair either side) — that\'s all you need for an exact polygon.', '<button class="btn on" id="lR">SHOW RAYS</button>')}
    ${MX(`sees(a, b) ⇔ no wall on the segment  and  1 − soft ≥ .5
soft = smoke along the line (faded in over 24..96 px from the eye)
     + .25 per glass pane
smoke occlusion = .5 × Σ min(1, thickness) × tiles crossed (DDA)`)}
    ${vars([['visPoly', 'exact', 'rays to each corner ± ε, sorted by angle, cut to the view box'], ['memory', '½ res', 'FOGK .5: what you last saw stays, greyed (presets: greyscale / muted / darkened / edge only)'], ['softMask', 'smoke, windows', 'dim what is inside sight but behind smoke'], ['roofs', 'cut out', 'a house you\'re in loses its roof; others keep theirs']])}`;
    const c = b.querySelector('#lD'), g = fitCanvas(c, 270); let E = [g.W * 0.3, g.H * 0.6], rays = true;
    const walls = [[0.45, 0.15, 0.12, 0.1], [0.62, 0.45, 0.08, 0.3], [0.15, 0.2, 0.15, 0.06], [0.78, 0.15, 0.1, 0.12], [0.3, 0.8, 0.22, 0.06]].map(([x, y, w, h]) => [x * g.W, y * g.H, w * g.W, h * g.H]);
    const segs = []; for (const [x, y, w, h] of walls) segs.push([x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]); segs.push([0, 0, g.W, 0], [g.W, 0, g.W, g.H], [g.W, g.H, 0, g.H], [0, g.H, 0, 0]);
    const cast = (ox, oy, a) => { const dx = Math.cos(a), dy = Math.sin(a); let best = 1e9; for (const [ax, ay, bx, by] of segs) { const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue; const t = ((ax - ox) * ey - (ay - oy) * ex) / den, u = ((ax - ox) * dy - (ay - oy) * dx) / den; if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t); } return [ox + dx * best, oy + dy * best]; };
    let drag = false; const at = e => { const r = c.getBoundingClientRect(); E = [clamp(e.clientX - r.left, 2, g.W - 2), clamp(e.clientY - r.top, 2, g.H - 2)]; };
    c.onpointerdown = e => { drag = true; at(e); c.setPointerCapture(e.pointerId); }; c.onpointermove = e => drag && at(e); c.onpointerup = () => drag = false;
    b.querySelector('#lR').onclick = e => { rays = !rays; e.target.classList.toggle('on', rays); };
    loop(c, (dt, t) => {
      if (!drag) E = [E[0] + Math.cos(t * 0.5) * 0.25, E[1] + Math.sin(t * 0.7) * 0.18];
      const pts = []; for (const s of segs) for (const [px, py] of [[s[0], s[1]]]) { const a = Math.atan2(py - E[1], px - E[0]); for (const e of [-1e-4, 0, 1e-4]) pts.push([a + e, ...cast(E[0], E[1], a + e)]); } pts.sort((a, b) => a[0] - b[0]);
      g.fillStyle = '#16301a'; g.fillRect(0, 0, g.W, g.H); for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(30,70,30,.5)'; g.fillRect((i * 97) % g.W, (i * 57) % g.H, 3, 3); }
      g.fillStyle = 'rgba(8,10,8,.75)'; g.fillRect(0, 0, g.W, g.H);
      g.save(); g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[1], p[2]) : g.moveTo(p[1], p[2])); g.closePath(); g.clip(); g.fillStyle = '#2a4a26'; g.fillRect(0, 0, g.W, g.H); for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(80,140,60,.6)'; g.fillRect((i * 97) % g.W, (i * 57) % g.H, 3, 3); } g.restore();
      if (rays) { g.strokeStyle = 'rgba(224,183,44,.25)'; for (const p of pts) { g.beginPath(); g.moveTo(...E); g.lineTo(p[1], p[2]); g.stroke(); } }
      for (const [x, y, w, h] of walls) { g.fillStyle = '#6e5a46'; g.fillRect(x, y, w, h); }
      dot(g, ...E, 7, COL.cyan); dot(g, ...E, 3, '#0a0f08');
      txt(g, `${pts.length} rays → polygon of ${pts.length} points`, 8, g.H - 8, '#f5d670', '11px JetBrains Mono');
    });
  }
});
sys({
  id: 'smoke', sec: 'BATTLE', title: 'Smoke Field', sub: '3_sim smoke cellular automaton', icon: 'smoke1', blurb: 'Smoke flows downhill tile to tile at 10 Hz and blocks sight.',
  render(b) {
    b.innerHTML = `<p class="lead">Smoke is not particles — it's a grid of 16 px tiles holding an amount <code>a</code>. Ten times a second each tile pours some of itself into lower neighbours, walls block it, and it slowly thins. Bots and your fog read it as soft cover.</p>
    ${DEMO('kD', 'Tap to throw a smoke grenade. Brown tiles are walls; the gap is a window.', '<button class="btn" id="kC">CLEAR</button>')}
    ${MX(`10 ticks/s
emitter: releases 15% of what's left per tick (min .5),
         capped so a 13×13 neighbourhood holds ≤ 360
flow:    each tile gives 35% × U(.7, 1.3) / 4 to each LOWER
         4-neighbour, lowest first (only downhill)
         walls block · cracked windows take 20%
decay:   p .1 per tick:  a −= .008 + .05 × min(a, 1)
         dies under .01 · thickness = min(1, a)`)}
    ${vars([['GS', '16 px', 'tile size'], ['SMK_HZ', '10', 'ticks per second'], ['grenade', '120', 'units of smoke'], ['SMK_K', '.5', 'sight occlusion per full tile crossed'], ['padding', '16 tiles', 'the field spills past the map edge']])}`;
    const c = b.querySelector('#kD'), g = fitCanvas(c, 250), cs = 12, W = Math.floor(g.W / cs), H = Math.floor(g.H / cs); let A = new Float32Array(W * H); const wall = new Uint8Array(W * H), em = [];
    for (let y = 4; y < H - 4; y++) if (y !== (H / 2 | 0)) wall[y * W + (W * 0.6 | 0)] = 1; for (let x = 4; x < W * 0.3; x++) wall[(H - 5) * W + x] = 1;
    c.onclick = e => { const r = c.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / cs), y = Math.floor((e.clientY - r.top) / cs); if (!wall[y * W + x]) em.push({ i: y * W + x, left: 120 }); };
    b.querySelector('#kC').onclick = () => { A.fill(0); em.length = 0; };
    em.push({ i: (H / 2 | 0) * W + (W * 0.35 | 0), left: 120 });
    let acc = 0;
    loop(c, dt => {
      acc += dt; while (acc > 0.1) { acc -= 0.1;
        for (const e of em) { let rel = Math.max(0.5, e.left * 0.15); rel = Math.min(rel, e.left); e.left -= rel; A[e.i] += rel; }
        for (let i = em.length - 1; i >= 0; i--) if (em[i].left <= 0) em.splice(i, 1);
        const B = A.slice();
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, a = A[i]; if (a < 0.01) { B[i] = 0; continue; } const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([X, Y]) => X >= 0 && Y >= 0 && X < W && Y < H && !wall[Y * W + X]).map(([X, Y]) => Y * W + X).filter(j => A[j] < a).sort((p, q) => A[p] - A[q]); for (const j of nb) { const k = Math.min(a * 0.35 * (0.7 + 0.6 * Math.random()) / 4, (a - A[j]) / 2); B[i] -= k; B[j] += k; } if (Math.random() < 0.1) B[i] = Math.max(0, B[i] - (0.008 + 0.05 * Math.min(B[i], 1))); }
        A = B;
      }
      g.fillStyle = '#16301a'; g.fillRect(0, 0, g.W, g.H); let tot = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (wall[i]) { g.fillStyle = '#6e5a46'; g.fillRect(x * cs, y * cs, cs, cs); continue; } const a = A[i]; tot += a; if (a > 0.01) { g.fillStyle = `rgba(215,215,205,${Math.min(1, a) * 0.85})`; g.fillRect(x * cs, y * cs, cs, cs); } }
      for (const e of em) dot(g, (e.i % W) * cs + cs / 2, ((e.i / W) | 0) * cs + cs / 2, 4, '#7ddc6a');
      txt(g, `smoke in field ${tot.toFixed(0)}`, 8, g.H - 8, '#f5d670', '11px JetBrains Mono');
    });
  }
});
sys({
  id: 'obj', sec: 'BATTLE', title: 'Flags, Tickets & Modes', sub: '3_sim updateObjectives', icon: 'bar', blurb: 'Capture rate, contesting, ticket bleed, the five modes.',
  render(b) {
    b.innerHTML = `<p class="lead">A flag's progress runs from −1 (team 0) to +1 (team 1). Standing in its ring pushes it your way; when both teams stand there it freezes. Owning more flags than the enemy makes their tickets bleed.</p>
    ${DEMO('oD', 'Set how many of each team stand on the flag.', RNG('oA', 'blue on flag', 0, 4, 1, 2) + RNG('oB', 'red on flag', 0, 4, 1, 0))}
    ${MX(`prog += ±.17/s × (1 + .5 (n − 1)),  n = min(3, attackers)
contested (both teams inside) → frozen
captured at |prog| = 1 → +200 pts each
conquest bleed: every 3 s / (owned difference) the trailing team −1
KOTH: owner uncontested → enemy −1 every 1.5 s
low-ticket warning at 20%`)}
    ${tbl(['mode', 'goal', 'limits'], [['CONQUEST', '3 flags (r 96); A starts blue, C red', '100 / 200 / 300 tickets'], ['TEAM DEATHMATCH', 'kills cost tickets', '100 / 200 / 300'], ['KING OF THE HILL', 'one hill (r 120) in the middle', '100 / 200 / 300'], ['FREE FOR ALL', 'everyone for themselves', '10 / 20 / 30 kills'], ['CO-OP SURVIVAL', 'humans vs raider waves', '10 / 20 / endless waves']])}
    <h3>Co-op waves</h3>${DEMO('oW', 'Raiders per wave by number of human players. Wave n arms raiders from tier n: pistols → snipers.')}
    ${MX(`size  = round((5 + 3n) × (1 + .5 (humans − 1)))
alive cap = 4 + 2n + 2 (humans − 1)
skill k = min(1, (n − 1) / 9): react, err × (1 − .5k); rate + .3k
downed, not dead: bleed 30 s; a mate within 28 px revives in 3 s
break between waves 12 s`)}`;
    const c = b.querySelector('#oD'), g = fitCanvas(c, 200), na = rv(b, 'oA'), nb = rv(b, 'oB'); let prog = 0, tk = [200, 200], bt = 0;
    ART.ready(() => loop(c, (dt, t) => {
      const A = na(), B = nb(), cont = A && B, n = Math.min(3, A || B), rate = cont || !n ? 0 : 0.17 * (1 + 0.5 * (n - 1)) * (A ? -1 : 1); prog = clamp(prog + rate * dt, -1, 1);
      bt += dt; if (bt > 3) { bt = 0; if (prog <= -1) tk[1]--; if (prog >= 1) tk[0]--; }
      const W = g.W, H = g.H, cx = W / 2, cy = H / 2 - 6, r = Math.min(70, H * 0.36);
      g.fillStyle = '#1d3a1e'; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(255,255,255,.15)'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
      g.strokeStyle = prog < 0 ? '#4c8dff' : '#ef5a44'; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.abs(prog) * TAU); g.stroke(); g.lineWidth = 1;
      for (let i = 0; i < A; i++) sprDraw(g, 'sol_stand', cx - r * 0.5 + i * 7, cy - 20 + i * 12, 0.3, 1.2); for (let i = 0; i < B; i++) sprDraw(g, 'sol_stand', cx + r * 0.5 - i * 7, cy - 20 + i * 12, Math.PI - 0.3, 1.2);
      g.fillStyle = '#ece4c8'; g.fillRect(cx - 1, cy - 26, 2, 30); g.fillStyle = Math.abs(prog) < 1 ? '#a49f86' : prog < 0 ? '#4c8dff' : '#ef5a44'; g.beginPath(); g.moveTo(cx + 1, cy - 26); g.lineTo(cx + 18 + Math.sin(t * 6) * 2, cy - 21); g.lineTo(cx + 1, cy - 15); g.fill();
      txt(g, cont ? 'CONTESTED' : `prog ${prog.toFixed(2)}  rate ${rate.toFixed(3)}/s`, 8, H - 8, cont ? '#ef5a44' : '#f5d670', '11px JetBrains Mono');
      txt(g, 'tickets ' + tk[0] + ' : ' + tk[1], W - 8, 18, '#ece4c8', '11px JetBrains Mono', 'right');
    }));
    const g2 = fitCanvas(b.querySelector('#oW'), 170), P = plot(g2, { x0: 1, x1: 20, y0: 0, y1: 130, gx: [1, 5, 10, 15, 20], gy: [0, 40, 80, 120], xl: 'wave', c: [1, 2, 3, 4].map((h, i) => ({ f: n => Math.round((5 + 3 * n) * (1 + 0.5 * (h - 1))), col: [COL.acc, COL.cyan, COL.violet, COL.red][i] })) });
    [1, 2, 3, 4].forEach((h, i) => txt(g2, h + ' human' + (h > 1 ? 's' : ''), P.L + 8, P.T + 14 + i * 13, [COL.acc, COL.cyan, COL.violet, COL.red][i], '600 10px Chakra Petch'));
  }
});

/* ================= PRESENTATION ================= */
sys({
  id: 'sun', sec: 'LOOK', title: 'Sun & Shadows', sub: '5e_light drawSun · sunTone', icon: 'tur', blurb: 'A GPU height buffer, a march toward the sun, slopes lit by their angle.',
  render(b) {
    b.innerHTML = `<p class="lead">Every solid pixel on screen knows how tall it is (from the material atlas). The sun pass reads that height buffer: a pixel is in shadow if anything between it and the sun rises above the line to the sun.</p>
    ${DEMO('uD', 'A slice through the world. Each ground point casts a ray up toward the sun; red = something taller is in the way.', RNG('uE', 'sun elevation°', 5, 80, 1, 40))}
    ${MX(`shadow(p) ⇔ ∃ d > 0 : H(p + d·sunDir) > H(p) + d · tan(el)
el ≥ 5° (SUN_MIN): shadows never longer than at 5°
lam = (.45 + .55 max(N·L, 0)) / (.45 + .55 L.z)   // slope light
colour = mix(shade, sunlit, lit) × lam + point lights
shade tint (.46, .5, .64) · warm highlight (1, .93, .8)`)}
    <h3>The light's colour through the day</h3>${DEMO('uT', 'sunTone(el): day fades in from −6° to 6°; below 30° the light goes gold and the shade purple-blue.')}
    <h3>Parts that float</h3><p>The gun barrel sits 4 px above the hull (its <code>lift</code>), an MG over a turret, a soldier mid-jump: their shadows must start away from their base. The buffer keeps one span per pixel, so overlapping floating parts are split into <b>channels</b>, each swept on its own, then merged with MAX. See the HEIGHTS view in LAYERS for the real part stacks.</p>
    ${vars([['SUN.az', '−2.36 rad', 'toward the sun: up-left'], ['SUN.el', '.7 rad (40°)', 'height of the sun; the day cycle moves it'], ['HS', '.35 / .5 / .75', 'height buffer resolution (LIGHTING QUALITY)'], ['SUNH', 'wall 40 · tree 56 · crate 10 · fence 9 · hay 14 · flag 22', 'shapes without art heights'], ['DAY_DIM', '.1', 'point lights at noon give 10% of their night strength'], ['no sun', 'drawShadowLayer', 'black silhouettes offset (2.5, 3.5) at alpha .36']])}`;
    const c = b.querySelector('#uD'), g = fitCanvas(c, 220), el = rv(b, 'uE');
    const prof = x => (x > 40 && x < 80 ? 40 : 0) + (x > 140 && x < 175 ? 12 + 10 * Math.sin((x - 140) / 35 * Math.PI) : 0) + (x > 228 && x < 240 ? 36 + 20 * Math.sqrt(1 - ((x - 234) / 6) ** 2) : 0) + (x > 268 && x < 280 ? 10 : 0);
    loop(c, (dt, t) => {
      const W = g.W, H = g.H, gy = H - 22, k = W / 300, e = el() * Math.PI / 180, te = Math.tan(e), N = 300, hs = []; for (let i = 0; i < N; i++) hs.push(prof(i));
      const shadow = i => { const h = hs[i]; for (let d = 1; i - d >= 0; d++) { const ray = h + d * te; if (ray > 60) return 0; if (hs[i - d] > ray) return d; } return 0; };
      g.fillStyle = '#0d1420'; g.fillRect(0, 0, W, H); dot(g, 22, 24, 9, '#ffd36b'); txt(g, 'sun ' + el() + '°', 36, 28, '#ffd36b', '600 10px Chakra Petch');
      for (let i = 0; i < N; i++) { const x = i * k, w = k + 0.5, h = hs[i] * k, s = shadow(i); g.fillStyle = h ? '#5a4a3a' : '#2a3a1c'; g.fillRect(x, gy - h, w, h + 22); g.fillStyle = s ? 'rgba(70,80,150,.85)' : '#d8c78f'; g.fillRect(x, gy - h - 2.5, w, 2.5); if (s && !h) { g.fillStyle = 'rgba(60,70,140,.6)'; g.fillRect(x, gy, w, 22); } }
      const pi = Math.floor(((t * 0.06) % 1) * N), ph = hs[pi], px = pi * k, hit = shadow(pi), L = hit ? hit * k : Math.min(px, (60 - ph) / te * k);
      g.strokeStyle = hit ? '#ef5a44' : '#ffd36b'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, gy - ph * k - 2); g.lineTo(px - L, gy - ph * k - 2 - L * te); g.stroke(); g.lineWidth = 1; dot(g, px, gy - ph * k - 2, 4, hit ? '#ef5a44' : '#ffd36b');
      txt(g, hit ? 'in shadow: blocked ' + hit + ' px away' : 'sunlit', 8, H - 6, hit ? '#ef5a44' : '#f5d670', '11px JetBrains Mono');
      txt(g, 'a 40 px wall: shadow ' + (40 / te).toFixed(0) + ' px', W - 8, 28, '#a49f86', '10px JetBrains Mono', 'right');
    });
    const g2 = fitCanvas(b.querySelector('#uT'), 150), W = g2.W, sm = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }, mx = (A, B, t) => A.map((v, i) => lerp(v, B[i], t));
    const tone = a => { const day = sm(-6, 6, a), gg = 1 - sm(4, 30, a), lit = mx([1, 1, 1], [1, 0.8, 0.62], gg); return { li: mx([0.24, 0.27, 0.42], lit, day), sh: mx([0.24, 0.27, 0.42], mx([0.46, 0.5, 0.64], [0.42, 0.38, 0.58], gg), day), day }; };
    const rgb = v => `rgb(${v.map(x => Math.round(x * 255)).join(',')})`;
    for (let x = 0; x < W; x++) { const a = -12 + x / W * 72, T = tone(a); g2.fillStyle = rgb(T.li); g2.fillRect(x, 0, 1, 52); g2.fillStyle = rgb(T.sh); g2.fillRect(x, 56, 1, 52); }
    txt(g2, 'SUNLIT', 6, 16, '#1b1607', '700 10px Chakra Petch'); txt(g2, 'SHADE', 6, 72, '#ece4c8', '700 10px Chakra Petch');
    for (const a of [-6, 0, 6, 30, 60]) { const x = (a + 12) / 72 * W; g2.fillStyle = '#ece4c8'; g2.fillRect(x, 108, 1, 8); txt(g2, a + '°', x, 130, '#a49f86', '10px JetBrains Mono', 'center'); }
  }
});
sys({
  id: 'lights', sec: 'LOOK', title: 'Night & Point Lights', sub: '5e_light drawLights · litAt', icon: 'fire2', blurb: 'Muzzle flashes, fires, lamps: real lights with height-aware shadows.',
  render(b) {
    b.innerHTML = `<p class="lead">No glow is painted. Anything bright calls <code>light(x, y, r, h, k)</code>; the 10 strongest in view go into one shader pass that lights each pixel by distance, by how its slope faces the light, and marches a shadow ray through the height buffer.</p>
    ${DEMO('nD', 'Night. Drag the flashlight soldier; muzzle flashes and the burning wreck are lights too.', '<button class="btn on" id="nF">FLASHES</button>')}
    ${MX(`light(x, y, r, h, k)   // reach r × LSC (4), height h, strength k
falloff  = .5 (1 − d/r)^1.3 + .5 max(0, 1 − d/40)²
facing   = clamp(N·l / max(l.z, .15), 0, 2)
lit      = colour × k × shadow × falloff × facing
spot     cone .36 rad half-angle, soft rim, far side 50% wider
litAt(x, y) = sun.day + Σ k (1 − d/r) × 1.6   // what bots use`)}
    ${vars([['LMAX', '10', 'strongest lights per frame'], ['LSC', '4', 'every light\'s reach × this'], ['LAMP', 'r 85 · k .95 · cone .36', 'flashlight; tank spotlight over the turret'], ['flash', 'lightFx(r × 2.2)', 'blast light fading (1 − u)²'], ['firing', '+.7 within 400 px', 'litAt bonus while firedT > 0'], ['burning', '.4 wreck · .3 vehicle', 'flickering 23 Hz × 9.7 Hz'], ['taillights', 'red, brighter braking', 'jeep / tank, decel > 20 px/s²']])}`;
    const c = b.querySelector('#nD'), g = fitCanvas(c, 250); let P = [g.W * 0.3, g.H * 0.5], fl = true, drag = false, last = -1;
    b.querySelector('#nF').onclick = e => { fl = !fl; e.target.classList.toggle('on', fl); };
    const at = e => { const r = c.getBoundingClientRect(); P = [e.clientX - r.left, e.clientY - r.top]; };
    c.onpointerdown = e => { drag = true; at(e); c.setPointerCapture(e.pointerId); }; c.onpointermove = e => drag && at(e); c.onpointerup = () => drag = false;
    const off = document.createElement('canvas'), lc = document.createElement('canvas');
    ART.ready(() => loop(c, (dt, t) => {
      const W = g.W, H = g.H; if (off.width !== W) { off.width = W; off.height = H; lc.width = W; lc.height = H; }
      const o = off.getContext('2d'); o.fillStyle = '#0f6a10'; o.fillRect(0, 0, W, H); const R = mulberry(5); for (let i = 0; i < 400; i++) { o.fillStyle = ['#0f6e0e', '#18871a'][i % 2]; o.fillRect(R() * W, R() * H, 2, 2); }
      o.fillStyle = '#8a6a3a'; o.fillRect(0, H * 0.62, W, 34); sprDraw(o, 'hull4', W * 0.72, H * 0.3, 0.4); sprDraw(o, 'tur_dead', W * 0.72 - 4, H * 0.3, 1.2); sprDraw(o, 'hull0', W * 0.4, H * 0.78, -0.1, 0.8); sprDraw(o, 'tur', W * 0.4 - 3, H * 0.78, -0.4, 0.8); sprDraw(o, 'sol_stand', W * 0.85, H * 0.7, 3, 1.3);
      const aim = Math.atan2(H * 0.7 - P[1], W * 0.85 - P[0]); sprDraw(o, 'sol_stand', P[0], P[1], aim, 1.3);
      const L = [[W * 0.72, H * 0.3, 95, 0.4 + 0.15 * Math.sin(t * 23) * Math.sin(t * 9.7), [1, 0.6, 0.3]]];
      const flash = fl && (t * 7 | 0) % 3 === 0; if (flash) L.push([P[0] + Math.cos(aim) * 20, P[1] + Math.sin(aim) * 20, 170, 0.9, [1, 0.85, 0.6]]);
      const l = lc.getContext('2d'); l.globalCompositeOperation = 'source-over'; l.fillStyle = 'rgb(61,69,107)'; l.fillRect(0, 0, W, H); l.globalCompositeOperation = 'lighter';
      for (const [x, y, r, k, cc] of L) { const gr = l.createRadialGradient(x, y, 0, x, y, r); for (let i = 0; i <= 6; i++) { const d = i / 6, f = k * (0.5 * (1 - d) ** 1.3 + 0.5 * Math.max(0, 1 - d * r / 40) ** 2); gr.addColorStop(d, `rgba(${cc.map(v => Math.round(v * 255 * Math.min(1, f))).join(',')},1)`); } l.fillStyle = gr; l.fillRect(x - r, y - r, r * 2, r * 2); }
      const cone = 0.36, lr = 85 * 2.2; l.save(); l.beginPath(); l.moveTo(P[0], P[1]); l.arc(P[0], P[1], lr, aim - cone, aim + cone); l.closePath(); l.clip(); const gr = l.createRadialGradient(P[0], P[1], 0, P[0], P[1], lr); gr.addColorStop(0, 'rgba(255,245,220,1)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); l.fillStyle = gr; l.fillRect(0, 0, W, H); l.restore();
      g.drawImage(off, 0, 0); g.globalCompositeOperation = 'multiply'; g.drawImage(lc, 0, 0); g.globalCompositeOperation = 'source-over';
      g.globalCompositeOperation = 'lighter'; sprDraw(g, 'fire' + ((t * 10 | 0) % 3 + 3), W * 0.72, H * 0.3, 0, 0.8, 0.9); if (flash) sprDraw(g, 'mg_f', P[0], P[1], aim, 1, 0.9); g.globalCompositeOperation = 'source-over';
      txt(g, `${L.length + 1} lights this frame (max 10)`, 8, H - 8, '#f5d670', '11px JetBrains Mono');
    }));
  }
});
sys({
  id: 'gx', sec: 'LOOK', title: 'GX: Canvas2D on WebGL', sub: '0_gx', icon: 'decal_hull', blurb: 'The old 2D drawing code, batched into triangles on the GPU.',
  render(b) {
    b.innerHTML = `<p class="lead">The game draws with the ordinary Canvas2D API (<code>drawImage</code>, <code>fill</code>, <code>arc</code>…). GX re-implements that API on WebGL2: every call becomes triangles appended to one vertex buffer, drawn in as few GPU calls as possible.</p>
    ${DEMO('gD', 'Draw calls flow into the batch. It only flushes to the GPU when something forces it.')}
    <h3>What's in a vertex</h3>${tbl(['floats', 'field', ''], [['2', 'pos', 'device px'], ['2', 'uv', 'into the texture slot'], ['1', 'colour', 'packed RGBA8'], ['1', 'mode', '0 solid · 1 texture · 2 linear · 3 radial · 4 stack'], ['1', 'slot', 'one of 6 textures bound together'], ['1', 'gradient row', 'in the 256 × 256 ramp texture'], ['1', 'r0', 'radial inner radius']])}
    <h3>Why it flushes</h3>${FLOW(['Render target changes (the screen ↔ a fog / light surface)', 'Blend mode changes (source-over · lighter · multiply · dodge…)', 'Clip or scissor changes', 'A 7th distinct texture is needed', 'More than 60 000 vertices'])}
    ${vars([['image atlas', '2048²', 'images ≤ 512 px packed with 1 px gutters (shelf allocator)'], ['paths', 'fan / stencil', 'one convex fill = triangle fan; else stencil-then-cover (nonzero / evenodd)'], ['arcs', '2 acos(1 − .3 / (r·s))', 'segment angle: error ≤ .3 px on screen'], ['text', 'cached', 'each string drawn once white in 2D, tinted on use; 2000 max, evicted after 240 frames'], ['clips', 'scissor / stencil 0x80', 'rect → scissor, anything else → stencil top bit'], ['"x" blends', 'copy dst', 'dodge, overlay… read the destination copy in the shader'], ['?2d', 'fallback', 'no WebGL2 → the plain 2D canvas, same code']])}`;
    const c = b.querySelector('#gD'), g = fitCanvas(c, 220); const items = []; let ver = 0, calls = 0, fl = 0, flashT = 0, mode = 0, sp = 0;
    const KINDS = [['drawImage', COL.acc], ['fill', COL.green], ['arc', COL.cyan], ['fillText', COL.violet], ['stroke', COL.orange]];
    loop(c, (dt, t) => {
      sp -= dt; if (sp <= 0) { sp = 0.16; const k = KINDS[Math.random() * 5 | 0]; items.push({ k, x: 10, y: 30 + Math.random() * (g.H - 100), t: 0 }); calls++; if (Math.random() < 0.08) { mode = (mode + 1) % 3; items.push({ blend: 1, x: 10, y: 40, t: 0 }); } }
      const W = g.W, H = g.H, bx = W * 0.5, bw = W * 0.2; g.fillStyle = '#0a0f08'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#3d4d34'; g.strokeRect(bx, 30, bw, H - 90); txt(g, 'vertex batch', bx + bw / 2, 22, '#a49f86', '600 10px Chakra Petch', 'center');
      g.fillStyle = 'rgba(224,183,44,.35)'; const fillH = (H - 90) * Math.min(1, ver / 600); g.fillRect(bx + 1, 30 + H - 90 - fillH, bw - 2, fillH);
      g.fillStyle = flashT > 0 ? `rgba(125,220,106,${flashT})` : '#1a2316'; g.fillRect(W - 70, H / 2 - 40, 60, 60); txt(g, 'GPU', W - 40, H / 2 - 6, '#ece4c8', '14px Black Ops One', 'center'); txt(g, fl + ' draws', W - 40, H / 2 + 12, '#a49f86', '10px JetBrains Mono', 'center');
      flashT = Math.max(0, flashT - dt * 3);
      for (let i = items.length - 1; i >= 0; i--) { const it = items[i]; it.t += dt; it.x += dt * 160; if (it.blend) { txt(g, 'blend → ' + ['source-over', 'lighter', 'multiply'][mode], it.x, it.y, '#ef5a44', '700 10px JetBrains Mono'); if (it.x > bx) { fl++; flashT = 1; ver = 0; items.splice(i, 1); } continue; } g.fillStyle = it.k[1]; g.fillRect(it.x, it.y - 9, 66, 14); txt(g, it.k[0], it.x + 4, it.y + 2, '#0a0f08', '700 9.5px JetBrains Mono'); if (it.x > bx) { ver += [4, 12, 30, 4, 18][KINDS.indexOf(it.k)]; items.splice(i, 1); if (ver > 600) { fl++; flashT = 1; ver = 0; } } }
      txt(g, `${calls} Canvas2D calls → ${fl} GPU draws`, 8, H - 10, '#f5d670', '11px JetBrains Mono');
      txt(g, `${ver} verts`, bx + bw / 2, H - 46, '#ece4c8', '10px JetBrains Mono', 'center');
    });
  }
});
sys({
  id: 'cams', sec: 'LOOK', title: 'Cameras & Split Screen', sub: '4_ai updateCams', icon: 'ic_exit', blurb: 'Up to 8 local players, zoom by vehicle and scope, smooth follow.',
  render(b) {
    b.innerHTML = `<p class="lead">Each local player gets a view (or they share one). A camera eases toward a target ahead of its soldier; zoom depends on the screen, the vehicle and the scope.</p>
    ${DEMO('cD', 'Split layouts by local player count.', RNG('cN', 'players', 1, 8, 1, 2))}
    ${MX(`baseZ = clamp(min(h / 400, w / 560), .95, 2.6)
zoom  × tank .82 · jeep .78 · nest .9 · scope .68 · ADS .92
look-ahead 70 px on foot, 110 in a vehicle (+60 ADS)
vehicle: tz × (1 − .3 f) and lead .85 v,  f = speed / maxF
follow k = 1 − e^(−4.5 dt)  (death cam 7) · zoom 1 − e^(−3 dt)
shake decays e^(−8 dt)`)}
    <h3>Follow easing</h3>${DEMO('cE', 'The camera (cyan) chasing a target that jumps (yellow): k = 1 − e^(−4.5 dt) every frame is frame-rate independent.')}
    ${vars([['layouts', '2: 2×1 · ≤4: 2×2 · ≤6: 3×2 · else 4×2', ''], ['shared', 'bounding box + 420×340', 'all players in one camera'], ['clamp', 'world + SKIRT', 'can look into the 480 px out-of-bounds band'], ['pixel snap', 'whole device px', 'the offset is rounded so sprites never shimmer']])}`;
    const c = b.querySelector('#cD'), g = fitCanvas(c, 170), n = rv(b, 'cN');
    loop(c, (dt, t) => {
      const N = n(), [cx, cy] = N <= 1 ? [1, 1] : N === 2 ? [2, 1] : N <= 4 ? [2, 2] : N <= 6 ? [3, 2] : [4, 2], W = g.W, H = g.H; g.fillStyle = '#0a0f08'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < N; i++) { const x = (i % cx) * W / cx, y = ((i / cx) | 0) * H / cy, w = W / cx, h = H / cy; g.fillStyle = ['#1d3a1e', '#22401f', '#1a361b', '#244420'][i % 4]; g.fillRect(x + 1, y + 1, w - 2, h - 2); txt(g, 'P' + (i + 1), x + 6, y + 14, [COL.blue, COL.red, COL.green, COL.acc, COL.cyan, COL.violet, COL.orange, COL.ink][i], '700 11px Chakra Petch'); dot(g, x + w / 2 + Math.sin(t + i) * w * 0.15, y + h / 2 + Math.cos(t * 1.3 + i) * h * 0.15, 4, '#ece4c8'); }
    });
    const c2 = b.querySelector('#cE'), g2 = fitCanvas(c2, 140); let T = [0.2, 0.5], C = [0.2, 0.5], jt = 0; const tr = [];
    loop(c2, dt => { jt += dt; if (jt > 1.6) { jt = 0; T = [0.1 + Math.random() * 0.8, 0.15 + Math.random() * 0.7]; } const k = 1 - Math.exp(-4.5 * dt); C = [lerp(C[0], T[0], k), lerp(C[1], T[1], k)]; tr.push(C.slice()); if (tr.length > 90) tr.shift();
      g2.fillStyle = '#0a0f08'; g2.fillRect(0, 0, g2.W, g2.H); g2.strokeStyle = 'rgba(95,211,208,.4)'; g2.beginPath(); tr.forEach((p, i) => i ? g2.lineTo(p[0] * g2.W, p[1] * g2.H) : g2.moveTo(p[0] * g2.W, p[1] * g2.H)); g2.stroke(); dot(g2, T[0] * g2.W, T[1] * g2.H, 5, COL.acc); g2.strokeStyle = COL.cyan; g2.strokeRect(C[0] * g2.W - 22, C[1] * g2.H - 14, 44, 28); });
  }
});

/* ================= PLATFORM ================= */
sys({
  id: 'input', sec: 'PLATFORM', title: 'Input Devices', sub: '1_core devState · 4_ai humanInput', icon: 'ic_frag', blurb: 'Keyboard, gamepads, touch — all turned into one input object.',
  render(b) {
    b.innerHTML = `<p class="lead">Each player has a device. Every frame <code>devState(dev)</code> turns it into the same plain state, and <code>humanInput</code> turns that into the soldier's input <code>I</code> (with aim assist for sticks and touch).</p>
    ${DEMO('iD', 'Drag the stick. The game ignores the dead zone and rescales the rest to 0..1.', BTNS('iS', ['LEFT .2', 'RIGHT .25'], 0))}
    ${MX(`m = |stick|
m < z → 0
k = min(1, (m − z) / (1 − z))      // rescaled magnitude
aim assist (pads, touch): nearest seen enemy within .13 rad
  (touch .3) and 460 px pulls aim 45% toward it
mouse: world = (mouse − (view.x + view.w/2)) / zoom + cam`)}
    ${tbl(['action', 'keyboard', 'gamepad', 'touch'], [['move', 'WASD', 'left stick', 'left 45% of screen: stick (58 px)'], ['aim', 'mouse', 'right stick', 'right side drag (ADS)'], ['fire', 'LMB', 'RT', 'fire stick: tap / drag > 24 px'], ['ADS', 'RMB', 'LT', 'aim drag'], ['sprint', 'Shift', 'L3 latch', 'stick rim ≥ .92 R held 260 ms'], ['jump', 'Space', 'A', 'button'], ['prone / stand', 'C / Z / Ctrl', 'B', 'button'], ['reload', 'R', 'X', 'button'], ['enter / use', 'E', 'Y', 'button'], ['grenade / gadget', 'G / F', 'RB / LB', 'buttons'], ['spot / lamp', 'Q / L', 'D-pad up / hold 400 ms', '—']])}
    ${vars([['edges', 'pressed', 'cleared by endInputFrame each frame: a press is seen exactly once'], ['touch stick', 'origin follows', 'if the finger goes past 1.25 R'], ['auto fire', 'on / off / range', 'range: fires when the aim line crosses a seen enemy'], ['rumble', 'dual-rumble', 'explosions, hits, tanks nearby']])}`;
    let z = 0.2; seg(b, 'iS', i => z = [0.2, 0.25][i]);
    const c = b.querySelector('#iD'), g = fitCanvas(c, 200); let S = [0.3, -0.2], drag = false;
    const at = e => { const r = c.getBoundingClientRect(), R = Math.min(70, g.H * 0.36), cx = 20 + R + 10, cy = g.H / 2; let x = (e.clientX - r.left - cx) / R, y = (e.clientY - r.top - cy) / R; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } S = [x, y]; };
    c.onpointerdown = e => { drag = true; at(e); c.setPointerCapture(e.pointerId); }; c.onpointermove = e => drag && at(e); c.onpointerup = () => { drag = false; };
    loop(c, (dt, t) => {
      if (!drag) S = [S[0] * (1 - dt * 3) + Math.cos(t) * 0.5 * dt * 3, S[1] * (1 - dt * 3) + Math.sin(t * 1.3) * 0.5 * dt * 3];
      const W = g.W, H = g.H, R = Math.min(70, H * 0.36), cx = 30 + R, cy = H / 2, m = Math.hypot(...S), k = m < z ? 0 : Math.min(1, (m - z) / (1 - z));
      g.fillStyle = '#0a0f08'; g.fillRect(0, 0, W, H); g.strokeStyle = '#3d4d34'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke(); g.fillStyle = 'rgba(239,90,68,.18)'; g.beginPath(); g.arc(cx, cy, R * z, 0, TAU); g.fill(); g.lineWidth = 1;
      dot(g, cx + S[0] * R, cy + S[1] * R, 14, k ? COL.acc : COL.red);
      const P = { x0: 0, x1: 1, y0: 0, y1: 1 }, px = cx + R + 30, pw = W - px - 14, ph = H - 50, X = v => px + v * pw, Y = v => 16 + ph - v * ph; g.strokeStyle = '#3d4d34'; g.strokeRect(px, 16, pw, ph);
      g.strokeStyle = COL.acc; g.lineWidth = 2; g.beginPath(); for (let i = 0; i <= 50; i++) { const mm = i / 50, kk = mm < z ? 0 : Math.min(1, (mm - z) / (1 - z)); i ? g.lineTo(X(mm), Y(kk)) : g.moveTo(X(mm), Y(kk)); } g.stroke(); g.lineWidth = 1; dot(g, X(Math.min(1, m)), Y(k), 4, '#ece4c8');
      txt(g, 'in |stick|', px + pw, H - 18, '#a49f86', '600 10px Chakra Petch', 'right'); txt(g, `m ${m.toFixed(2)} → k ${k.toFixed(2)}`, px + 4, 30, '#f5d670', '11px JetBrains Mono');
    });
  }
});
sys({
  id: 'audio', sec: 'PLATFORM', title: 'Sound & Music', sub: '1_core AU · 1b_audio2', icon: 'ic_horn', blurb: 'No sound files: every shot, blast and beat is synthesised live.',
  render(b) {
    b.innerHTML = `<p class="lead">The game ships no audio. Sounds are built from oscillators and filtered noise at the moment they play; distance turns into volume, pan, muffling and reverb. Tap the buttons — this page uses the same recipes.</p>
    <div class="links"><button class="btn" data-s="rifle">▶ RIFLE</button><button class="btn" data-s="sniper">▶ SNIPER</button><button class="btn" data-s="boom">▶ EXPLOSION</button></div>
    ${RNG('aD', 'distance px', 0, 900, 10, 120)}
    ${DEMO('aG', 'The signal path. Every game sound enters at sfx; music and UI skip the muffle.')}
    ${MX(`hear(x, y): R = max(view w, h) / zoom × .75, d = distance to camera
  k = d < R ? 1 − .45 d/R : max(0, .55 (1 − (d − R) / 1.4R))
  pan = (x − cam.x) / R
lowpass = 700 + 19000 × k^1.7       // far sounds lose their highs
reverb send = verb × (.45 + (1 − k) × 1.1)   // far = wetter
gunshot = highpass crack (2400 Hz, 30 ms) + thump (sine 150 → 46 Hz,
          soft-clipped) + lowpass body sweep`)}
    <h3>Music follows the fight</h3>${DEMO('aM', 'Intensity I rises with every shot nearby and when you\'re hurt; tempo and layers follow.')}
    ${MX(`I   = min(1, .25 + SND.int × .9 + hurt × .3)
SND.int += .012 × v per shot, decays e^(−.22 dt)
bpm = 116 + 30 I   (menu 84)
hats I > .25 · snare > .55 · arpeggio > .72 · heartbeat doubles when hurt`)}
    ${vars([['master', '.85', '→ ear lowpass (ringing) → limiter −4 dB 14:1 → compressor −14 dB 5:1'], ['muffle', '20 kHz / 520 Hz', 'in play / in menus and pause'], ['reverb', '2.2 s', 'generated: noise × (1 − i/L)^3.2, slap echo 110 ms'], ['earRing', '260 + (1 − k)·1600 Hz', 'close blasts: ears muffled for 1.2 + 2.2k s, 3720 / 4180 Hz whine'], ['engines', 'saw + square fifth', 'tank 34 Hz, jeep 64 Hz × (1 + 1.5 sp); track clatter 3 + 16 sp Hz'], ['scheduler', '25 ms tick', 'queues 16th notes 120 ms ahead']])}`;
    let AC = null; const dist = rv(b, 'aD');
    const play = kind => {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); const ac = AC, now = ac.currentTime, d = dist(), R = 500, k = d < R ? 1 - 0.45 * d / R : Math.max(0, 0.55 * (1 - (d - R) / (1.4 * R)));
      const out = ac.createBiquadFilter(); out.type = 'lowpass'; out.frequency.value = 700 + 19000 * k ** 1.7; const vol = ac.createGain(); vol.gain.value = 0.9 * k + 0.02; out.connect(vol); vol.connect(ac.destination);
      const N = ac.createBuffer(1, ac.sampleRate * 2.5, ac.sampleRate), ch = N.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      const noise = (f0, f1, q, type, v, t, att = 0.003) => { const s = ac.createBufferSource(); s.buffer = N; const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, now); f.frequency.exponentialRampToValueAtTime(f1, now + t); const gg = ac.createGain(); gg.gain.setValueAtTime(0.0001, now); gg.gain.exponentialRampToValueAtTime(v, now + att); gg.gain.exponentialRampToValueAtTime(0.0001, now + t); s.connect(f); f.connect(gg); gg.connect(out); s.start(now); s.stop(now + t + 0.05); };
      const thump = (f0, f1, t, v) => { const o = ac.createOscillator(); o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(f1, now + t * 0.8); const ws = ac.createWaveShaper(), cu = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; cu[i] = Math.tanh(3.2 * x) / Math.tanh(3.2); } ws.curve = cu; const gg = ac.createGain(); gg.gain.setValueAtTime(0.0001, now); gg.gain.exponentialRampToValueAtTime(v, now + 0.005); gg.gain.exponentialRampToValueAtTime(0.0001, now + t); o.connect(ws); ws.connect(gg); gg.connect(out); o.start(now); o.stop(now + t + 0.05); };
      if (kind === 'rifle') { noise(2400, 2400, 0.7, 'highpass', 0.5 * k + 0.05, 0.03); thump(150, 46, 0.12, 0.75); noise(3200, 300, 0.8, 'lowpass', 0.45, 0.18); }
      if (kind === 'sniper') { noise(2600, 2600, 0.7, 'highpass', 0.7, 0.035); thump(120, 36, 0.22, 0.9); noise(3600, 200, 0.8, 'lowpass', 0.6, 0.5); noise(900, 200, 1, 'lowpass', 0.2, 1.4, 0.2); }
      if (kind === 'boom') { thump(52, 15, 1.7, 1); noise(1400, 60, 0.7, 'lowpass', 0.9, 2.3, 0.01); for (let i = 0; i < 26; i++) { const s = ac.createBufferSource(); s.buffer = N; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 800 + Math.random() * 2400; f.Q.value = 3; const gg = ac.createGain(), t0 = now + 0.05 + Math.random() ** 1.6 * 1.2; gg.gain.setValueAtTime(0.0001, now); gg.gain.setValueAtTime(0.25, t0); gg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03); s.connect(f); f.connect(gg); gg.connect(out); s.start(now); s.stop(t0 + 0.05); } }
    };
    b.querySelectorAll('[data-s]').forEach(x => x.onclick = () => play(x.dataset.s));
    const c = b.querySelector('#aG'), g = fitCanvas(c, 210);
    const N = [['sfx', 0.08, 0.2], ['muffle', 0.3, 0.2], ['music', 0.08, 0.5], ['ui', 0.08, 0.8], ['master .85', 0.52, 0.5], ['ear ring', 0.7, 0.5], ['limiter', 0.85, 0.3], ['compressor', 0.85, 0.7], ['speakers', 0.62, 0.9]], E = [[0, 1], [1, 4], [2, 4], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8]];
    loop(c, (dt, t) => { const W = g.W, H = g.H; g.fillStyle = '#0a0f08'; g.fillRect(0, 0, W, H); const P = n => [N[n][1] * W, N[n][2] * H];
      for (const [a, z] of E) { const [x0, y0] = P(a), [x1, y1] = P(z); g.strokeStyle = '#3d4d34'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); const u = (t * 0.7 + a * 0.13) % 1; dot(g, lerp(x0, x1, u), lerp(y0, y1, u), 3, a === 2 ? COL.violet : a === 3 ? COL.cyan : COL.acc); }
      g.lineWidth = 1; for (const [n, x, y] of N) { g.font = '600 10.5px Chakra Petch'; const w = g.measureText(n).width + 14; g.fillStyle = '#1a2316'; g.strokeStyle = '#3d4d34'; g.fillRect(x * W - w / 2, y * H - 11, w, 22); g.strokeRect(x * W - w / 2, y * H - 11, w, 22); txt(g, n, x * W, y * H + 4, '#ece4c8', '600 10.5px Chakra Petch', 'center'); } });
    const c2 = b.querySelector('#aM'), g2 = fitCanvas(c2, 150); let I = 0.25, beat = 0, step = 0;
    loop(c2, (dt, t) => { const shots = Math.sin(t * 0.4) > 0.2; I = clamp(0.25 + (shots ? Math.min(0.75, (t % 15.7) * 0.06) : 0) + 0 * dt, 0, 1); const bpm = 116 + 30 * I, sd = 60 / bpm / 4; beat += dt; if (beat > sd) { beat -= sd; step = (step + 1) % 16; }
      const W = g2.W, H = g2.H; g2.fillStyle = '#0a0f08'; g2.fillRect(0, 0, W, H); const rows = [['kick', [0, 8], 0], ['hats', [0, 2, 4, 6, 8, 10, 12, 14], 0.25], ['snare', [4, 12], 0.55], ['arp', [0, 3, 6, 9, 12, 15], 0.72]], cw = (W - 60) / 16;
      rows.forEach(([n, st, th], r) => { txt(g2, n, 6, 26 + r * 24, I > th ? '#ece4c8' : '#3d4d34', '600 10px Chakra Petch'); for (let i = 0; i < 16; i++) { const on = st.includes(i) && I > th; g2.fillStyle = on ? (i === step ? '#f5d670' : '#8a7020') : i === step ? '#2f3c28' : '#141b11'; g2.fillRect(56 + i * cw, 14 + r * 24, cw - 2, 18); } });
      txt(g2, `I ${I.toFixed(2)}   bpm ${bpm.toFixed(0)}`, 8, H - 8, '#f5d670', '11px JetBrains Mono'); });
  }
});
sys({
  id: 'net', sec: 'PLATFORM', title: 'Online Play', sub: '5c_net', icon: 'ic_smoke', blurb: 'WebRTC links, base-64 snapshots, events sent 4×, rewind for fair shots.',
  render(b) {
    b.innerHTML = `<p class="lead">One player hosts and runs the real simulation. Joiners connect directly (WebRTC data channels), introduced through public <code>ntfy</code> relays. The host streams compact snapshots; joiners send input and draw everyone else a little in the past.</p>
    ${DEMO('nD', 'Packets: snapshots out (yellow) at up to 30/s, input in (cyan). Some get lost — events survive because each rides in 4 snapshots.', RNG('nL', 'packet loss %', 0, 40, 1, 10))}
    <h3>Joining</h3>${FLOW(['Host picks a 4-letter code (no 0 1 i l o) and listens on topic <code>mm1-&lt;code&gt;</code> at ntfy.sh (or two backups)', 'Joiner posts a WebRTC offer there; host answers', 'ICE finds a route (direct, STUN, or TURN relay); a data channel opens', 'Host sends the match header, roster and a full snapshot; joiner enters the deploy screen'])}
    <h3>A snapshot</h3><p>Numbers become base-64 digits (<code>pk(n, c)</code>: c characters, 0..64^c − 1). A soldier is ~15 characters:</p>
    ${DEMO('nS', 'One soldier in the snapshot string.')}
    ${MX(`pk(n, c): digits of n in base 64, alphabet A–Z a–z 0–9 - _
angle: pk(a / 2π × 4096, 2)   // 12-bit
snapshot ≤ every 33 ms: soldiers · vehicles · shells (not bullets, ≤ 30)
  · flags · tickets · per-player HUD · events (each sent 4 times, < 700 ms)
slow snapshot 4 / s: items, crates (6 per char), wrecks, scores`)}
    <h3>Fair shots: lag compensation</h3>${DEMO('nG', 'The joiner fired at where they saw the target (110 ms + ping ago). The host rewinds the target to that moment (lagAt) before testing the hit.')}
    ${vars([['NET_DELAY', '110 ms', 'others drawn this far behind (smooth interpolation)'], ['lag record', '~.6 s, ≤ 40 samples', 'per entity [t, x, y, a]; > 200 px jumps snap'], ['prediction', 'own soldier', 'joiners move themselves at once; host corrects if far off'], ['events', 'x d k f b t pp ps s sm sd', 'blast, damage, kill, flag, brass, toast, pickups, sound, smoke…'], ['errors', '101–303, 6xx, 7xx', 'signalling, ICE, link, host gone — shown with a trace line']])}`;
    const c = b.querySelector('#nD'), g = fitCanvas(c, 200), loss = rv(b, 'nL'); const pk = []; let ts = 0, ti = 0, got = 0, sent = 0;
    loop(c, dt => {
      const W = g.W, H = g.H, hx = 50, cl = [[W - 50, H * 0.22], [W - 50, H * 0.5], [W - 50, H * 0.78]]; ts -= dt; ti -= dt;
      if (ts <= 0) { ts = 0.033 * 3; cl.forEach((p, i) => { sent++; pk.push({ a: [hx, H / 2], b: p, t: 0, c: COL.acc, lost: Math.random() * 100 < loss() }); }); }
      if (ti <= 0) { ti = 0.12; const p = cl[Math.random() * 3 | 0]; pk.push({ a: p, b: [hx, H / 2], t: 0, c: COL.cyan, lost: Math.random() * 100 < loss() }); }
      g.fillStyle = '#0a0f08'; g.fillRect(0, 0, W, H);
      for (const p of cl) { g.strokeStyle = '#25301f'; g.beginPath(); g.moveTo(hx, H / 2); g.lineTo(...p); g.stroke(); }
      for (let i = pk.length - 1; i >= 0; i--) { const p = pk[i]; p.t += dt * 1.4; const u = p.t; if (p.lost && u > 0.5) { if (u < 0.7) txt(g, '×', lerp(p.a[0], p.b[0], 0.5), lerp(p.a[1], p.b[1], 0.5) + 4, '#ef5a44', '700 14px Chakra Petch', 'center'); if (u > 0.7) pk.splice(i, 1); continue; } if (u >= 1) { pk.splice(i, 1); if (p.c === COL.acc) got++; continue; } dot(g, lerp(p.a[0], p.b[0], u), lerp(p.a[1], p.b[1], u), 3.5, p.c); }
      g.fillStyle = '#1a2316'; g.fillRect(hx - 34, H / 2 - 20, 68, 40); g.strokeStyle = COL.acc; g.strokeRect(hx - 34, H / 2 - 20, 68, 40); txt(g, 'HOST', hx, H / 2 + 5, '#f5d670', '13px Black Ops One', 'center');
      cl.forEach(([x, y], i) => { g.fillStyle = '#1a2316'; g.fillRect(x - 34, y - 15, 68, 30); g.strokeStyle = COL.cyan; g.strokeRect(x - 34, y - 15, 68, 30); txt(g, 'JOIN ' + (i + 1), x, y + 4, '#ece4c8', '700 11px Chakra Petch', 'center'); });
      txt(g, `snapshots delivered ${sent ? Math.round(got / sent * 100) : 0}%  ·  event survives 4 tries: ${(100 * (1 - (loss() / 100) ** 4)).toFixed(2)}%`, 8, H - 8, '#f5d670', '10.5px JetBrains Mono');
    });
    const g2 = fitCanvas(b.querySelector('#nS'), 120), F = [['fA', 1, 'flags: alive, prone, swim, torch, ADS, shield'], ['fB', 1, 'smoke, hand, melee, spotted ×2, has ammo'], ['throw', 1, ''], ['jump', 1, ''], ['x', 2, '0..4095'], ['y', 2, ''], ['angle', 2, '12-bit'], ['gun', 1, 'WPN index'], ['shot#', 1, 'mod 64'], ['seat', 1, 'veh × 4 + seat + 1'], ['kit', 1, '+32 lamp']];
    { const W = g2.W, tot = F.reduce((s, f) => s + f[1], 0), cw = (W - 16) / tot; let x = 8; const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', ex = 'BAAAXqOc4A0AB'; let ci = 0;
      F.forEach(([n, w], i) => { g2.fillStyle = ['#3b3215', '#163033', '#2a1f3a'][i % 3]; g2.fillRect(x, 16, cw * w - 2, 36); for (let j = 0; j < w; j++) txt(g2, ex[ci++] || B[(i * 7 + j * 3) % 64], x + cw * j + cw / 2 - 1, 40, '#f5d670', '700 14px JetBrains Mono', 'center'); g2.save(); g2.translate(x + cw * w / 2, 60); g2.rotate(Math.PI / 4); txt(g2, n, 0, 0, '#a49f86', '600 9.5px Chakra Petch'); g2.restore(); x += cw * w; }); }
    const c3 = b.querySelector('#nG'), g3 = fitCanvas(c3, 170);
    ART.ready(() => loop(c3, (dt, t) => {
      const W = g3.W, H = g3.H, u = (t % 3) / 3, lag = 0.2, path = k => [40 + k * (W - 80), H / 2 + Math.sin(k * 6) * 30], now = path(u), then = path(Math.max(0, u - lag));
      g3.fillStyle = '#0a0f08'; g3.fillRect(0, 0, W, H); g3.strokeStyle = '#25301f'; g3.beginPath(); for (let i = 0; i <= 50; i++) { const p = path(i / 50); i ? g3.lineTo(...p) : g3.moveTo(...p); } g3.stroke();
      sprDraw(g3, 'sol_stand', ...now, 0, 1.3); g3.globalAlpha = 0.45; sprDraw(g3, 'sol_stand', ...then, 0, 1.3); g3.globalAlpha = 1;
      txt(g3, 'host: now', now[0], now[1] - 16, '#ece4c8', '600 10px Chakra Petch', 'center'); txt(g3, 'what the joiner saw', then[0], then[1] + 26, '#5fd3d0', '600 10px Chakra Petch', 'center');
      const sx = W / 2, sy = H - 12; g3.strokeStyle = 'rgba(95,211,208,.7)'; g3.setLineDash([4, 3]); g3.beginPath(); g3.moveTo(sx, sy); g3.lineTo(...then); g3.stroke(); g3.setLineDash([]); dot(g3, sx, sy, 5, COL.cyan); dot(g3, ...then, 9, 'rgba(125,220,106,.35)');
    }));
  }
});
sys({
  id: 'maps', sec: 'PLATFORM', title: 'Maps & World', sub: '2_maps buildMap', icon: 'bagarc0', blurb: 'Five seeded, point-symmetric battlefields, painted once.',
  render(b) {
    b.innerHTML = `<p class="lead">A map is built from a fixed seed, so every online client builds the same one with no map data sent. Builders lay out the west half; <code>sym()</code> places a mirrored copy rotated 180° around the centre, so both teams get the same ground.</p>
    ${DEMO('mD', 'Point symmetry: every object (yellow) has a twin (cyan) at (WW − x, WH − y).')}
    ${tbl(['map', 'seed', 'character'], [['CROSSROADS', '1987', 'asphalt grid, 10 mirrored buildings'], ['FARMLANDS', '2311', 'dirt roads, wheat / corn / plowed fields, fences with gates, hedgerows, hay'], ['RIVERTOWN', '4099', 'river at x 1420–1580 crossed by 3 bridges'], ['SNOWFIELD', '6151', 'ice, cabins, bunkers, 70 pines'], ['OUTSKIRTS', '8807', 'tiled destructible houses (genHouse), 3072 × 2048']])}
    ${vars([['WW × WH', '3000 × 2000', 'world px'], ['SKIRT', '480 px', 'out-of-bounds ring you can enter: 5 s to get back'], ['flags', 'A · B (1500, 1000) · C', 'sandbag crescents at r ≈ 110'], ['crates', '14', '≥ 260 px apart, mirrored; respawn 24–25 s'], ['vehicles', 'tank + 2 jeeps', 'per team; 2 MG nests facing the centre'], ['statics hash', '64 px cells', 'staticsNear(); rects bucketed in 128 px grids'], ['decals', 'fade every 3 s', 'blood, treads, bodies baked in (120 s, max 90)']])}`;
    const c = b.querySelector('#mD'), g = fitCanvas(c, 220), R = mulberry(1987), obj = []; for (let i = 0; i < 10; i++) obj.push([0.05 + R() * 0.4, 0.05 + R() * 0.9, R() < 0.5 ? 'bld' : 'tree', 0.04 + R() * 0.06]);
    loop(c, (dt, t) => {
      const W = g.W, H = g.H, k = (Math.sin(t * 0.8) + 1) / 2; g.fillStyle = '#16301a'; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(255,255,255,.12)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke(); g.setLineDash([]); dot(g, W / 2, H / 2, 4, '#ece4c8');
      for (const [x, y, ty, s] of obj) { const mx = 1 - x, my = 1 - y; const draw = (X, Y, col) => { if (ty === 'bld') { g.fillStyle = col; g.fillRect(X * W - s * W / 2, Y * H - s * W / 3, s * W, s * W * 0.66); } else dot(g, X * W, Y * H, s * W * 0.3, col); }; draw(x, y, 'rgba(224,183,44,.85)'); const ix = lerp(x, mx, k), iy = lerp(y, my, k); draw(ix, iy, `rgba(95,211,208,${0.3 + 0.6 * k})`); }
      dot(g, 0.08 * W, 0.5 * H, 7, COL.blue); dot(g, 0.92 * W, 0.5 * H, 7, COL.red); txt(g, 'A', 0.25 * W, 0.5 * H, '#ece4c8', '14px Black Ops One', 'center'); txt(g, 'B', 0.5 * W, 0.5 * H - 10, '#ece4c8', '14px Black Ops One', 'center'); txt(g, 'C', 0.75 * W, 0.5 * H, '#ece4c8', '14px Black Ops One', 'center');
    });
  }
});
sys({
  id: 'atlas', sec: 'PLATFORM', title: 'Build & Sprite Atlas', sub: 'build.py · atlas.png · atlas_m.png', icon: 'jeep0', blurb: 'One HTML file. Every sprite in one image, every height in another.',
  render(b) {
    b.innerHTML = `<p class="lead"><code>build.py</code> concatenates the 13 source files into one script inside <code>index.html</code> and embeds the art as data, so the game is a single file. The build number goes up only when the code or art actually changed.</p>
    ${DEMO('tD', 'The real atlas. Tap a sprite for its name and table entry; switch to see its heights (atlas_m: red = height × 4).', BTNS('tM', ['COLOUR', 'HEIGHTS', 'GLOSS / GLOW'], 0))}
    <div id="tI" class="card" style="min-height:52px"><span class="muted">tap a sprite</span></div>
    ${MX(`ATLAS[name] = [x, y, w, h, pivotX, pivotY]
material px: R = height × 4 · G = reflective · B = glows
the last rows of atlas_m hold a JSON table: undersides + what
  stands on what (use) — written by the heightmap editor
build: sha1(js + art) changed → build + 1 → version.json`)}
    ${FLOW(['<b>src/*.js</b> (13 files, ~9 400 lines) concatenated in name order', '<b>atlas.png</b>, <b>atlas_m.png</b>, <b>walls16.png</b> embedded as base-64', '<b>BOUNDS</b>: each sprite\'s opaque box off its pivot (for hit boxes, artHalf)', '<b>index.html</b> ≈ 1.1 MB — the whole game; also combined-arms.html', '<b>tests/</b>: node harness with a stub canvas, plus Playwright for online'])}`;
    let md = 0; seg(b, 'tM', i => { md = i; draw(); });
    const c = b.querySelector('#tD'); let g, sel = null;
    const draw = () => { if (!ART.ok) return; const W = c.parentElement.getBoundingClientRect().width, s = W / 384; g = fitCanvas(c, Math.round(673 * s)); g.fillStyle = '#0a0f08'; g.fillRect(0, 0, g.W, g.H); g.imageSmoothingEnabled = false;
      if (md === 0) g.drawImage(ART.img, 0, 0, 384, 673, 0, 0, W, 673 * s);
      else { const C = document.createElement('canvas'); C.width = 384; C.height = 673; const x = C.getContext('2d'), d = x.createImageData(384, 673); for (let i = 0; i < 384 * 673; i++) { const a = ART.ap[i * 4 + 3]; if (a < 128) continue; if (md === 1) { const h = ART.mp[i * 4] / 4 / 60; d.data[i * 4] = 255 * Math.min(1, h * 1.6); d.data[i * 4 + 1] = 255 * Math.min(1, h * 1.1); d.data[i * 4 + 2] = 60 + 195 * h; } else { d.data[i * 4] = 40; d.data[i * 4 + 1] = ART.mp[i * 4 + 1] > 8 ? 220 : 40; d.data[i * 4 + 2] = ART.mp[i * 4 + 2] > 8 ? 255 : 40; } d.data[i * 4 + 3] = 255; } x.putImageData(d, 0, 0); g.drawImage(C, 0, 0, W, 673 * s); }
      if (sel) { const m = ART.A[sel]; g.strokeStyle = COL.acc; g.lineWidth = 2; g.strokeRect(m[0] * s, m[1] * s, m[2] * s, m[3] * s); dot(g, (m[0] + m[4]) * s, (m[1] + m[5]) * s, 3, COL.red); }
    };
    c.onclick = e => { const r = c.getBoundingClientRect(), s = r.width / 384, x = (e.clientX - r.left) / s, y = (e.clientY - r.top) / s; sel = Object.keys(ART.A).filter(n => n[0] !== '_' && !n.startsWith('under_')).find(n => { const m = ART.A[n]; return x >= m[0] && y >= m[1] && x < m[0] + m[2] && y < m[1] + m[3]; }) || null; draw();
      const m = sel && ART.A[sel]; b.querySelector('#tI').innerHTML = sel ? `<b class="mono" style="font-size:15px">${sel}</b> <span class="muted">[${m.join(', ')}]</span><div class="muted" style="font-size:12.5px;margin-top:4px">${m[2]} × ${m[3]} px · pivot (${m[4]}, ${m[5]}) · tallest px ${artMax(sel)} · stands on ${ART.USE[sel] || 'the ground'}</div>` : '<span class="muted">nothing there</span>'; };
    ART.ready(draw);
  }
});

/* ---------- the grid of cards ---------- */
VIEWS.sys = {
  init() {
    const G = $('#sgrid'); let html = '', sec = '';
    SYS.forEach((s, i) => { if (s.sec !== sec) { sec = s.sec; html += `<div class="sec-t">${{ BATTLE: 'THE BATTLE', LOOK: 'HOW IT LOOKS', PLATFORM: 'UNDER THE HOOD' }[sec]}</div>`; } html += `<button class="scard" data-i="${i}"><i>${String(i + 1).padStart(2, '0')}</i><canvas></canvas><b>${s.title}</b><span>${s.blurb}</span></button>`; });
    G.innerHTML = html;
    G.onclick = e => { const b = e.target.closest('.scard'); if (b) openPage(SYS.map(s => ({ title: s.title, sub: s.sub, render: s.render })), +b.dataset.i); };
    ART.ready(() => { if (!ART.ok) return; G.querySelectorAll('.scard').forEach(b => { const s = SYS[+b.dataset.i], c = b.querySelector('canvas'), g = fitCanvas(c, 58); g.imageSmoothingEnabled = false; sprFit(g, s.icon, 4, 4, g.W - 8, 50, 0, 2.6); }); });
  }
};
