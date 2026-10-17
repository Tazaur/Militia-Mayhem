/* ================= experimental sound set (Settings → SOUND STYLE) =================
   Layered, punchy, all synthesized: every shot is a transient crack + a driven low thump + a filtered body + a
   reverb tail; distance rolls off the highs. Tanks rumble in your gut as they get close, rockets sizzle in flight,
   blasts that land near you leave your ears ringing, and the score is a heartbeat that speeds up with the fight. */
const SND = { int: 0, loops: new Map(), rumbleT: 0 };
function chain2(h, verb) {
  const c = AU.ctx, lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700 + 19000 * Math.pow(h.v, 1.7); lp.Q.value = 0.4;
  if (c.createStereoPanner && h.p) { const pn = c.createStereoPanner(); pn.pan.value = clamp(h.p, -0.9, 0.9); lp.connect(pn); pn.connect(AU.sfx); } else lp.connect(AU.sfx);
  if (verb) { const sg = c.createGain(); sg.gain.value = verb * (0.45 + (1 - h.v) * 1.1); lp.connect(sg); sg.connect(AU.verbIn); }
  return lp;
}
function gainEnv(out, now, v, att, dec) { const g = AU.ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), now + att); g.gain.exponentialRampToValueAtTime(0.0001, now + att + dec); g.connect(out); return g; }
/* a pitch-dropping sine pushed through soft clipping: the "boom" in every shot */
function thump(out, now, f0, f1, t, v, drive) {
  const c = AU.ctx, o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), now + t * 0.8);
  const ws = c.createWaveShaper(); ws.curve = AU.curve; const pre = c.createGain(); pre.gain.value = drive || 2.2;
  o.connect(pre); pre.connect(ws); ws.connect(gainEnv(out, now, v, 0.004, t)); o.start(now); o.stop(now + t + 0.05);
}
function burst(out, now, o) {
  const c = AU.ctx, s = c.createBufferSource(); s.buffer = AU.noise;
  const f = c.createBiquadFilter(); f.type = o.ft || 'lowpass'; f.frequency.setValueAtTime(o.f, now); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, now + o.t); f.Q.value = o.q || 0.7;
  s.connect(f); f.connect(gainEnv(out, now, o.v, o.att || 0.002, o.t)); s.start(now, Math.random() * 1.5); s.stop(now + o.t + 0.05);
}
function crackle(out, now, n, span, v) { for (let i = 0; i < n; i++) { const d = Math.pow(Math.random(), 1.6) * span; burst(out, now + d, { ft: 'bandpass', f: 1200 + Math.random() * 2800, q: 3, t: 0.02 + Math.random() * 0.04, v: v * (1 - d / span) * (0.5 + Math.random() * 0.5) }); } }
function metal(out, now, v) { for (const [f, d] of [[1310, 0.28], [1874, 0.2], [2620, 0.12]]) { const o = AU.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f * (0.97 + Math.random() * 0.06); o.connect(gainEnv(out, now, v, 0.002, d)); o.start(now); o.stop(now + d + 0.05); } }
/* recipe: [crack v, thump f0, f1, t, v, body cutoff, end, t, v, reverb] */
const GUN2 = {
  rifle: [0.5, 150, 46, 0.12, 0.75, 3200, 300, 0.18, 0.45, 0.35, 30],
  br: [0.6, 120, 38, 0.17, 0.9, 2600, 240, 0.26, 0.55, 0.45, 40],
  pistol: [0.42, 190, 70, 0.08, 0.55, 3600, 600, 0.11, 0.35, 0.25, 40],
  mg: [0.5, 112, 40, 0.11, 0.85, 2600, 260, 0.15, 0.5, 0.32, 36],
  shotgun: [0.7, 90, 30, 0.3, 1.05, 2600, 170, 0.42, 0.85, 0.6, 0],
  sniper: [0.95, 80, 26, 0.48, 1.1, 2200, 110, 0.65, 0.85, 0.95, 0]
};
const SFX2 = { rifle: 1, br: 1, pistol: 1, mg: 1, shotgun: 1, sniper: 1, cannon: 1, boom: 1, bigboom: 1, rocket: 1, whiz: 1, clang: 1, splat: 1, crack: 1, crush: 1 };
function sfx2(name, x, y, mul) {
  const h = x === undefined ? { v: 1, p: 0 } : hear(x, y), v = h.v * (mul || 1) * (M && M.demo ? 0.35 : 1);
  if (v < 0.02) return true;
  const c = AU.ctx, now = c.currentTime, G = GUN2[name];
  if (G) {
    if (G[10] && !thr('g2' + name, G[10])) return true;
    const out = chain2(h, G[9]);
    burst(out, now, { ft: 'highpass', f: 2400, t: 0.03, v: G[0] * v });
    thump(out, now, G[1], G[2], G[3], G[4] * v, 2.6);
    burst(out, now, { f: G[5], f2: G[6], t: G[7], v: G[8] * v, q: 0.6 });
    if (name === 'sniper') { burst(out, now + 0.32, { f: 900, f2: 150, t: 0.5, v: 0.22 * v }); burst(out, now + 0.78, { f: 600, f2: 120, t: 0.6, v: 0.1 * v }); }
    if (name === 'shotgun') { burst(out, now + 0.42, { ft: 'bandpass', f: 2200, q: 4, t: 0.03, v: 0.18 * v }); burst(out, now + 0.52, { ft: 'bandpass', f: 1600, q: 4, t: 0.04, v: 0.2 * v }); }
    SND.int = Math.min(1, SND.int + 0.012 * h.v);
    return true;
  }
  switch (name) {
    case 'cannon': { const out = chain2(h, 1); burst(out, now, { ft: 'highpass', f: 1800, t: 0.05, v: 0.8 * v }); thump(out, now, 72, 20, 1.0, 1.25 * v, 3); burst(out, now, { f: 1800, f2: 60, t: 1.3, v: 0.95 * v, q: 0.5 }); crackle(out, now + 0.05, 10, 0.7, 0.2 * v); SND.int = Math.min(1, SND.int + 0.1 * h.v); return true; }
    case 'boom': case 'bigboom': {
      if (!thr('g2boom', 45)) return true;
      const big = name === 'bigboom', out = chain2(h, big ? 1.2 : 1);
      burst(out, now, { ft: 'highpass', f: 1500, t: 0.06, v: 0.8 * v });
      thump(out, now, big ? 52 : 66, big ? 15 : 19, big ? 1.7 : 1.15, 1.3 * v, 3.2);
      if (big) thump(out, now + 0.07, 40, 14, 1.4, 0.8 * v, 2.4);
      burst(out, now, { f: big ? 1700 : 2400, f2: 40, t: big ? 2.3 : 1.5, v: 1.0 * v, q: 0.45 });
      crackle(out, now + 0.04, big ? 26 : 14, big ? 1.4 : 0.9, 0.28 * v);
      SND.int = Math.min(1, SND.int + (big ? 0.2 : 0.13) * h.v); return true;
    }
    case 'rocket': { const out = chain2(h, 0.5); thump(out, now, 150, 60, 0.14, 0.6 * v, 2); burst(out, now, { ft: 'bandpass', f: 500, f2: 3200, q: 0.9, t: 0.5, v: 0.75 * v, att: 0.03 }); return true; }
    case 'whiz': { if (!thr('g2whiz', 80)) return true; const out = chain2({ v: 1, p: h.p }, 0); burst(out, now, { ft: 'highpass', f: 4200, t: 0.025, v: 0.4 }); burst(out, now, { ft: 'bandpass', f: 5200, f2: 1400, q: 3, t: 0.13, v: 0.22 }); return true; }
    case 'clang': { if (!thr('g2clang', 70)) return true; const out = chain2(h, 0.3); metal(out, now, 0.3 * v); burst(out, now, { ft: 'highpass', f: 3000, t: 0.02, v: 0.45 * v }); return true; }
    case 'splat': { if (!thr('g2splat', 40)) return true; const out = chain2(h, 0.2); thump(out, now, 130, 45, 0.18, 0.5 * v, 1.6); burst(out, now, { f: 900, f2: 140, t: 0.22, v: 0.35 * v }); return true; }
    case 'crack': { const out = chain2(h, 0.5); burst(out, now, { ft: 'bandpass', f: 900, f2: 180, q: 1.4, t: 0.5, v: 0.45 * v }); crackle(out, now, 8, 0.4, 0.2 * v); return true; }
    case 'crush': { if (!thr('g2crush', 80)) return true; const out = chain2(h, 0.2); thump(out, now, 90, 35, 0.25, 0.6 * v, 2.5); burst(out, now, { f: 700, f2: 90, t: 0.35, v: 0.4 * v }); return true; }
  }
  return false;
}
/* blasts close to a player: hearing muffles and a high whine rings for a couple of seconds */
function earRing(x, y, r) {
  if (!AU.ctx || CFG.sound === 'classic' || !AU.sfxOn || !M || M.demo) return;
  let k = 0; for (const p of LOCALS()) if (p.sol && p.sol.alive) { const d = Math.hypot(p.sol.x - x, p.sol.y - y); k = Math.max(k, 1 - d / (r * 1.6)); }
  if (k <= 0.05) return;
  const c = AU.ctx, now = c.currentTime, dur = 1.2 + 2.2 * k, f = AU.ear.frequency;
  f.cancelScheduledValues(now); f.setValueAtTime(Math.max(f.value, 20), now); f.exponentialRampToValueAtTime(260 + (1 - k) * 1600, now + 0.05); f.exponentialRampToValueAtTime(20000, now + dur);
  for (const [fq, vv] of [[3720, 0.05], [4180, 0.03]]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = fq; const g = c.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(vv * k, now + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, now + dur); o.connect(g); g.connect(AU.master); o.start(now); o.stop(now + dur + 0.1); }
  for (const p of LOCALS()) rumble(p, 0.8 * k, 0.35);
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
    const am = c.createGain(); am.gain.value = 0.6; const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 27; const ld = c.createGain(); ld.gain.value = 0.4; lfo.connect(ld); ld.connect(am.gain);
    const g = c.createGain(); g.gain.value = 0; const pn = c.createStereoPanner ? c.createStereoPanner() : null;
    s.connect(bp); bp.connect(am); am.connect(g); if (pn) { g.connect(pn); pn.connect(AU.sfx); } else g.connect(AU.sfx);
    s.start(now, Math.random()); lfo.start(now); SND.loops.set(p, { s, lfo, g, pn, bp });
  }
  for (const [p, L] of SND.loops) {
    if (p.life <= 0 || !M.proj.includes(p)) { try { L.g.gain.setTargetAtTime(0, now, 0.03); L.s.stop(now + 0.2); L.lfo.stop(now + 0.2); } catch (e) { } SND.loops.delete(p); continue; }
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
function loopsKillAll() { for (const L of SND.loops.values()) { try { L.s.stop(); L.lfo.stop(); } catch (e) { } } SND.loops.clear(); }
/* engines: tanks get a two-oscillator growl, a track clatter tied to speed, and a sub-bass you feel as they close in */
function engineUpdate2(v) {
  if (v.eng) { try { v.eng.g.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.05); v.eng.o.stop(AU.ctx.currentTime + 0.3); } catch (e) { } v.eng = null; }
  const driven = v.active && !v.dead && v.T.drive && v.seats[0], c = AU.ctx, now = c.currentTime, tank = v.type === 'tank';
  if (driven && !v.eng2) {
    const out = c.createGain(); out.gain.value = 0; out.connect(AU.sfx);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = tank ? 240 : 900; lp.Q.value = 2; lp.connect(out);
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; const o2 = c.createOscillator(); o2.type = 'square'; o1.connect(lp); const g2 = c.createGain(); g2.gain.value = 0.5; o2.connect(g2); g2.connect(lp);
    const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.value = tank ? 31 : 48; const sg = c.createGain(); sg.gain.value = 0; sub.connect(sg); sg.connect(AU.sfx);
    const ns = c.createBufferSource(); ns.buffer = AU.noise; ns.loop = true; const nb = c.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = tank ? 480 : 1400; nb.Q.value = 1.8;
    const ng = c.createGain(); ng.gain.value = 0; const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 6; const lg = c.createGain(); lg.gain.value = 0; lfo.connect(lg); lg.connect(ng.gain);
    ns.connect(nb); nb.connect(ng); ng.connect(out);
    for (const n of [o1, o2, sub, lfo]) n.start(now); ns.start(now, Math.random());
    v.eng2 = { out, lp, o1, o2, sub, sg, ns, ng, lfo, lg };
  }
  if (!driven && v.eng2) { engineStop2(v); return; }
  if (!v.eng2) return;
  const E = v.eng2, sp = Math.min(1, Math.abs(v.spd) / v.T.maxF), h = hear(v.x, v.y), on = AU.sfxOn ? 1 : 0, demo = M.demo ? 0.35 : 1, base = tank ? 34 : 64;
  let dn = 1e9; for (const p of LOCALS()) if (p.sol && p.sol.alive) dn = Math.min(dn, Math.hypot(p.sol.x - v.x, p.sol.y - v.y));
  const near = Math.pow(clamp(1 - dn / 420, 0, 1), 2);
  E.o1.frequency.setTargetAtTime(base + sp * base * 1.5, now, 0.1); E.o2.frequency.setTargetAtTime((base + sp * base * 1.5) * 1.51, now, 0.1);
  E.lp.frequency.setTargetAtTime((tank ? 200 : 700) + sp * (tank ? 380 : 1400), now, 0.1);
  E.out.gain.setTargetAtTime((tank ? 0.13 : 0.07) * (0.45 + sp) * h.v * on * demo, now, 0.1);
  E.sg.gain.setTargetAtTime(tank ? (0.12 + 0.55 * near) * (0.4 + sp) * on * demo * Math.max(h.v, near) : 0.05 * near * on, now, 0.12);
  E.lfo.frequency.setTargetAtTime(3 + sp * 16, now, 0.1); E.lg.gain.setTargetAtTime((tank ? 0.5 : 0.15) * sp, now, 0.1); E.ng.gain.setTargetAtTime((tank ? 0.45 : 0.1) * sp, now, 0.1);
}
function engineStop2(v) { const E = v.eng2; if (!E) return; const now = AU.ctx.currentTime; try { E.out.gain.setTargetAtTime(0, now, 0.06); E.sg.gain.setTargetAtTime(0, now, 0.06); for (const n of [E.o1, E.o2, E.sub, E.lfo, E.ns]) n.stop(now + 0.4); } catch (e) { } v.eng2 = null; }
/* ---------- music: a heartbeat that drives the fight ---------- */
function m2kick(t, f0, f1, d, v) { const c = AU.ctx, o = c.createOscillator(), ws = c.createWaveShaper(); ws.curve = AU.curve; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.7); const pre = c.createGain(); pre.gain.value = 1.8; o.connect(pre); pre.connect(ws); ws.connect(gainEnv(AU.mus, t, v, 0.003, d)); o.start(t); o.stop(t + d + 0.05); }
function m2hat(t, v, d) { const c = AU.ctx, s = c.createBufferSource(); s.buffer = AU.noise; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; s.connect(f); f.connect(gainEnv(AU.mus, t, v, 0.001, d || 0.035)); s.start(t, Math.random()); s.stop(t + (d || 0.035) + 0.05); }
function m2snare(t, v) { const c = AU.ctx, s = c.createBufferSource(); s.buffer = AU.noise; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8; s.connect(f); f.connect(gainEnv(AU.mus, t, v, 0.001, 0.16)); s.start(t, Math.random()); s.stop(t + 0.22); const o = c.createOscillator(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08); o.connect(gainEnv(AU.mus, t, v * 0.6, 0.002, 0.08)); o.start(t); o.stop(t + 0.12); }
function m2note(t, f, d, v, type, cut, res) { const c = AU.ctx, o = c.createOscillator(), fl = c.createBiquadFilter(); o.type = type || 'sawtooth'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.setValueAtTime(cut, t); fl.frequency.exponentialRampToValueAtTime(Math.max(80, cut * 0.35), t + d); fl.Q.value = res || 4; o.connect(fl); fl.connect(gainEnv(AU.mus, t, v, 0.006, d)); o.start(t); o.stop(t + d + 0.05); }
function music2(Mu, s, st, bar, t) {
  const battle = Mu.mode !== 'menu' && M && !M.demo;
  let hurt = 0; if (battle) for (const p of LOCALS()) if (p.sol && p.sol.alive && p.sol.hp < 40) hurt = Math.max(hurt, 1 - p.sol.hp / 40);
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
