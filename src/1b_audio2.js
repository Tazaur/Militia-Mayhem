/* ================= experimental sound set (Settings → SOUND STYLE) =================
   Layered, punchy, all synthesized: every shot is a transient crack + a driven low thump + a filtered body + a
   reverb tail; distance rolls off the highs. Tanks rumble in your gut as they get close, rockets sizzle in flight,
   blasts that land near you leave your ears ringing, and the score is a heartbeat that speeds up with the fight. */
const SND = { int: 0, loops: new Map(), rumbleT: 0 };
/* the Sound Lab's "Send to game": presets saved in this browser replace the built-in ones (any sound name, either sound mix) */
const SFXU = store.get('sfxlab', {});
addEventListener('storage', e => { if (e.key !== 'mmgl.sfxlab') return; for (const k in SFXU) delete SFXU[k]; Object.assign(SFXU, store.get('sfxlab', {})); });
function gainEnv(out, now, v, att, dec) { const g = AU.ctx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(v, now + att); g.gain.exponentialRampToValueAtTime(0.0001, now + att + dec); g.connect(out); return g; }
/* the music's drums: a sound layer's tone and noise voices */
function thump(out, now, f0, f1, t, v, drive) { sfxVoice(AU, Object.assign({}, SFXK.t, { f: f0, f2: f1, s: 0.8, t, dr: drive || 2.2 }), out, now, v, 1); }
function burst(out, now, o) { sfxVoice(AU, Object.assign({}, SFXK.n, { ft: o.ft || 'lowpass', f: o.f, f2: o.f2 || 0, q: o.q || 0.7, a: o.att || 0.002, t: o.t }), out, now, o.v, 1); }
/* a preset sound (1c_sfx.js): false when there's none for this name, so the classic set plays it. r: the event rule playing it */
function sfx2(name, x, y, mul, r) {
  let P = SFXU[name] && !SFXU[name].e ? SFXU[name] : CFG.sound !== 'classic' && SFXD[name]; if (!P) return false;
  const F = r && r.F ? Object.assign({}, SEVF, r.F) : SEVF;
  const h = x === undefined || P.nd ? { v: 1, p: x === undefined ? 0 : hear(x, y, F).p } : hear(x, y, F), v = (P.nd ? 1 : h.v) * (mul || 1) * (M && M.demo ? 0.35 : 1);
  if (v < 0.02 || (AU.nv > 48 && v < 0.4) || AU.nv > 80) return true;
  if (P.th && !thr('p' + name, P.th)) return true;
  if (r && r.p && r.p !== 1) P = Object.assign({}, P, { p: (P.p || 1) * r.p });
  sfxRun(AU, P, sfxOut(AU, P, h.v, h.p, AU.sfx, AU.verbIn, F), sfxT(AU), v);
  if (P.in) SND.int = Math.min(1, SND.int + P.in * h.v);
  return true;
}
/* ================= events → sounds (rules in 1d_sev.js) =================
   ev(name, x, y, ctx): something happened; each of the event's rules whose condition passes plays its sound (or effect).
   The Sound Lab's EVENTS tab edits the rules; "Send rules to game" stores them here (they replace that event's defaults). */
const SEVU = store.get('sevlab', {});
addEventListener('storage', e => { if (e.key !== 'mmgl.sevlab') return; for (const k in SEVU) delete SEVU[k]; Object.assign(SEVU, store.get('sevlab', {})); });
/* the soldiers this screen plays as (alive or not) */
function evMine() { const a = LOCALS().map(p => p.sol).filter(Boolean); if (NET.me && NET.me.sol && !a.includes(NET.me.sol)) a.push(NET.me.sol); return a; }
function ev(name, x, y, c) {
  const D = EVD[name]; if (!D) return; c = c || {};
  if (NET.role === 'host' && D[3].includes('n') && !c._net) evSend(name, x, y, c);      // only the host sees it: tell the others
  if (!AU.ctx || !AU.sfxOn) return;
  const R = SEVU[name] || SEVD[name]; if (!R || !R.length) return;
  const mine = evMine(), X = Object.assign({}, c);
  if (c.s) { X.me = mine.includes(c.s) ? 1 : 0; X.ally = mine.some(m => m.team === c.s.team) ? 1 : 0; X.bot = c.s.player ? 0 : 1; }
  if (c.team !== undefined) X.mine = mine.some(m => m.team === c.team) ? 1 : 0;
  if (x !== undefined) { const L = mine.filter(s => s.alive); X.dist = Math.round(L.length ? Math.min(...L.map(s => Math.hypot(x - s.x, y - s.y))) : M && M.views[0] ? Math.hypot(x - M.views[0].cam.x, y - M.views[0].cam.y) : 0); }
  for (let i = 0; i < R.length; i++) {
    const r = R[i]; if (r.off || !sevTest(r.if, X)) continue;
    if (r.th && !thr('e' + name + i, r.th)) continue;
    if (r.dl > 0) setTimeout(() => evPlay(r, x, y, X), r.dl * 1000); else evPlay(r, x, y, X);
  }
}
function evPlay(r, x, y, X) {
  const v = r.v === undefined ? 1 : r.v;
  if (r.fx === 'deafen') {
    if (x === undefined || !M || M.demo) return;
    const E = Object.assign({}, SEVX.deafen, r.E), reach = (X.r || 100) * E.re;
    let k = 0; for (const s of localSols()) k = Math.max(k, 1 - Math.hypot(s.x - x, s.y - y) / reach);
    if (k <= 0.05) return;
    deafen(AU, Math.min(1, k * v), E); if (E.rm) for (const p of LOCALS()) rumble(p, E.rm * k, 0.35);
    return;
  }
  if (!r.s) return;
  if (r.who === 'pl') { if (X.me) sfx(r.s, undefined, undefined, v, r); }
  else if (r.who === 'ui') sfx(r.s, undefined, undefined, v, r);
  else sfx(r.s, x, y, v, r);
}
/* host → clients: ['e', event, x, y, soldier, team, ...the event's fields in EVD order]; one soldier's repeats of an event within 120 ms are dropped */
const EVSENT = {};
function evSend(name, x, y, c) {
  const si = c.s ? M.sol.indexOf(c.s) : -1, k = name + si, n = performance.now(); if (EVSENT[k] && n - EVSENT[k] < 120) return; EVSENT[k] = n;
  netEv('e', EVLIST.indexOf(name), x === undefined ? null : x | 0, y === undefined ? null : y | 0, si, c.team === undefined ? null : c.team, ...Object.keys(EVD[name][2]).map(f => c[f] === undefined ? null : c[f]));
}
function evNet(a) {
  const name = EVLIST[a[1]], D = EVD[name]; if (!D) return;
  const c = { _net: 1 }; if (M.sol[a[4]]) c.s = M.sol[a[4]]; if (a[5] !== null && a[5] !== undefined) c.team = a[5];
  Object.keys(D[2]).forEach((f, i) => { if (a[6 + i] !== null && a[6 + i] !== undefined) c[f] = a[6 + i]; });
  ev(name, a[2] === null ? undefined : a[2], a[3] === null ? undefined : a[3], c);
}
/* rockets in flight: a crackling, sizzling loop that follows the rocket */
function loopsUpdate(dt) {
  SND.int *= Math.exp(-dt * 0.22);
  if (!AU.ctx || CFG.sound === 'classic' || !M) { if (SND.loops.size) loopsKillAll(); return; }
  const c = AU.ctx, now = c.currentTime;
  for (const p of M.proj) {
    if (p.k !== 'rocket' || p.life <= 0 || SND.loops.has(p)) continue;
    const s = c.createBufferSource(); s.buffer = AU.noise; s.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3800; bp.Q.value = 0.8;
    const am = c.createGain(); am.gain.value = 0.6; const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 27; const ld = c.createGain(); ld.gain.value = 0.4; const ls = c.createBiquadFilter(); ls.type = 'lowpass'; ls.frequency.value = 160; lfo.connect(ls); ls.connect(ld); ld.connect(am.gain);
    const g = c.createGain(); g.gain.value = 0; const pn = c.createStereoPanner ? c.createStereoPanner() : null;
    s.connect(bp); bp.connect(am); am.connect(g); if (pn) { g.connect(pn); pn.connect(AU.sfx); } else g.connect(AU.sfx);
    s.start(now, Math.random()); lfo.start(now); SND.loops.set(p, { s, lfo, g, pn, bp });
  }
  for (const [p, L] of SND.loops) {
    if (p.life <= 0 || !M.proj.includes(p)) { try { aHold(L.g.gain, now); L.g.gain.setTargetAtTime(0, now, 0.03); L.s.stop(now + 0.2); L.lfo.stop(now + 0.2); } catch (e) { } SND.loops.delete(p); continue; }
    const h = hear(p.x, p.y); L.g.gain.setTargetAtTime(0.32 * h.v * (AU.sfxOn ? 1 : 0), now, 0.03); if (L.pn) L.pn.pan.setTargetAtTime(clamp(h.p, -0.9, 0.9), now, 0.03);
    L.bp.frequency.setTargetAtTime(3200 + Math.random() * 1800, now, 0.02);
  }
  // a tank rolling up on you shakes the controller too
  SND.rumbleT -= dt;
  if (SND.rumbleT <= 0) {
    SND.rumbleT = 0.3;
    for (const p of LOCALS()) { if (!p.sol || !p.sol.alive) continue; let k = 0; for (const v of M.vehicles) if (v.type === 'tank' && v.active && !v.dead && v.seats[0] && p.sol.veh !== v) k = Math.max(k, (1 - Math.hypot(v.x - p.sol.x, v.y - p.sol.y) / 200) * (0.3 + Math.abs(v.spd) / v.T.maxF)); if (k > 0.05) rumble(p, Math.min(0.7, k * 0.6), 0.3); }
  }
}
function loopsKillAll() { const t = AU.ctx ? AU.ctx.currentTime : 0; for (const L of SND.loops.values()) { try { aHold(L.g.gain, t); L.g.gain.setTargetAtTime(0, t, 0.03); L.s.stop(t + 0.25); L.lfo.stop(t + 0.25); } catch (e) { } } SND.loops.clear(); }
/* engines: tanks get a two-oscillator growl, a track clatter tied to speed, and a sub-bass you feel as they close in */
function engineUpdate2(v) {
  engineStop(v);
  const driven = v.active && !v.dead && v.T.drive && v.seats[0], key = v.type === 'tank' ? 'eng_tank' : 'eng_car';
  if (driven && !v.eng2) v.eng2 = engBuild(AU, SFXU[key] && SFXU[key].e ? SFXU[key] : ENGD[key], AU.sfx);
  if (!driven && v.eng2) { engineStop2(v); return; }
  if (!v.eng2) return;
  let dn = 1e9; for (const s of localSols()) dn = Math.min(dn, Math.hypot(s.x - v.x, s.y - v.y));
  engSet(v.eng2, Math.min(1, Math.abs(v.spd) / v.T.maxF), hear(v.x, v.y).v, Math.pow(clamp(1 - dn / 420, 0, 1), 2), (AU.sfxOn ? 1 : 0) * (M.demo ? 0.35 : 1));
}
function engineStop2(v) { if (v.eng2) engStop(v.eng2); v.eng2 = null; }
/* ---------- music: a heartbeat that drives the fight ---------- */
/* drum voices: the sfx thump and noise burst, on the music bus */
const m2kick = (t, f0, f1, d, v) => thump(AU.mus, t, f0, f1, d, v, 1.8);
const m2hat = (t, v) => burst(AU.mus, t, { ft: 'highpass', f: 7000, t: 0.035, v, att: 0.001 });
function m2snare(t, v) { const c = AU.ctx, s = c.createBufferSource(); s.buffer = AU.noise; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8; s.connect(f); f.connect(gainEnv(AU.mus, t, v, 0.001, 0.16)); s.start(t, Math.random()); s.stop(t + 0.22); const o = c.createOscillator(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08); o.connect(gainEnv(AU.mus, t, v * 0.6, 0.002, 0.08)); o.start(t); o.stop(t + 0.12); }
function m2note(t, f, d, v, type, cut, res) { const c = AU.ctx, o = c.createOscillator(), fl = c.createBiquadFilter(); o.type = type || 'sawtooth'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.setValueAtTime(cut, t); fl.frequency.exponentialRampToValueAtTime(Math.max(80, cut * 0.35), t + d); fl.Q.value = res || 4; o.connect(fl); fl.connect(gainEnv(AU.mus, t, v, 0.006, d)); o.start(t); o.stop(t + d + 0.05); }
function music2(Mu, s, st, bar, t) {
  const battle = Mu.mode !== 'menu' && M && !M.demo;
  let hurt = 0; if (battle) for (const s of localSols()) if (s.hp < 40) hurt = Math.max(hurt, 1 - s.hp / 40);
  const I = battle ? Math.min(1, 0.25 + SND.int * 0.9 + hurt * 0.3) : 0;
  Mu.bpm = battle ? 116 + 30 * I : 84;
  const chord = [[55, 65.4, 82.4], [55, 65.4, 82.4], [43.65, 55, 65.4], [49, 61.7, 73.4]][bar % 4], root = chord[0];
  // heartbeat: lub-dub every half bar; it doubles up as the fight heats or you're hurt
  if (st === 0 || (st === 8 && (battle || bar % 2))) { m2kick(t, 78, 36, 0.32, battle ? 0.5 + hurt * 0.25 : 0.38); m2kick(t + 60 / Mu.bpm / 4 * 1.5, 70, 34, 0.26, battle ? 0.32 + hurt * 0.2 : 0.24); }
  if (battle && (I > 0.7 || hurt > 0.3) && (st === 4 || st === 12)) m2kick(t, 74, 36, 0.24, 0.3);
  if (!battle) {
    if (st === 0 && bar % 2 === 0) for (const f of chord) m2note(t, f, 3.6, 0.025, 'sawtooth', 420, 2);
    if (st === 10 && bar % 4 === 3) m2note(t, root * 8, 0.6, 0.02, 'triangle', 3000, 1);
    return;
  }
  // driving 16th-note bass, filter opens with intensity
  m2note(t, st % 4 === 2 ? root * 2 : root, 0.12, 0.055, 'sawtooth', 260 + 1700 * I, 6);
  if (I > 0.25 && st % 2 === 0) m2hat(t, st % 4 === 2 ? 0.05 : 0.025);
  if (I > 0.55 && (st === 4 || st === 12)) m2snare(t, 0.13);
  if (I > 0.55 && st % 2 === 1) m2hat(t, 0.015);
  if (st === 0 && bar % 2 === 0) for (const f of chord) m2note(t, f * 2, 60 / Mu.bpm * 7.5, 0.016 + 0.014 * I, 'sawtooth', 600 + 900 * I, 1.5);
  if (I > 0.72) { const arp = [root * 4, chord[1] * 4, chord[2] * 4, root * 8]; m2note(t, arp[st % 4], 0.09, 0.022, 'square', 2600, 2); }
}
