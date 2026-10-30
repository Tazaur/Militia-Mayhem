/* ================= sound recipes as data (shared with the Sound Lab, sound/index.html) =================
   A sound is a preset: global settings plus layers, each layer one synthesized voice. The game plays SFXD (the modern
   sound set) and ENGD (engines) through sfxRun / engBuild; the Sound Lab loads this same file, so what you hear there
   is exactly what the game plays. Presets are stored compact: a key left out takes its default from SFXK.
   Preset: v volume, p pitch, pr random pitch ±, rv reverb send, bs bass (low shelf dB), lp tone cutoff Hz,
           th throttle ms (game: repeats closer than this are dropped), in fight intensity added (music), nd: ignores distance.
   Layer k: t tone, n noise, f FM, c crackle. Shared: d delay, v level, a attack, t decay, dr drive (soft clip),
           n repeats every dt s, each ×pm pitch and ×vm level, r random detune ±.
     t: w wave, f → f2 Hz over t·s, ft/fc/q optional filter.   n: ft filter, f → f2 cutoff over t·s, q.
     f: w carrier wave, f → f2, mr modulator ratio, mi → mi2 modulation index (bells, clanks, metal).
     c: c grains over sp s, band f..f2 Hz, q, each t + random·tr long. */
const SFXK = {
  P: { v: 1, p: 1, pr: 0, rv: 0, bs: 0, lp: 20000, th: 0, in: 0, nd: 0 },
  t: { d: 0, v: 0.5, a: 0.004, t: 0.1, dr: 0, n: 1, dt: 0.1, pm: 1, vm: 1, r: 0, w: 'sine', f: 440, f2: 0, s: 1, ft: '', fc: 2000, q: 1 },
  n: { d: 0, v: 0.5, a: 0.002, t: 0.1, dr: 0, n: 1, dt: 0.1, pm: 1, vm: 1, r: 0, ft: 'lowpass', f: 1000, f2: 0, s: 1, q: 0.7 },
  f: { d: 0, v: 0.5, a: 0.002, t: 0.4, dr: 0, n: 1, dt: 0.1, pm: 1, vm: 1, r: 0, w: 'sine', f: 440, f2: 0, s: 1, mr: 1.41, mi: 3, mi2: 0, ft: '', fc: 2000, q: 1 },
  c: { d: 0, v: 0.2, c: 10, sp: 0.5, f: 1200, f2: 4000, q: 3, t: 0.02, tr: 0.04 },
  e: { v: 0.1, b: 40, sm: 1.5, w1: 'sawtooth', w2: 'square', r2: 1.51, g2: 0.5, lp: 300, lps: 600, q: 2, dr: 0, sub: 40, s0: 0, s1: 0.05, ss: 0, nf: 900, nq: 1.8, ng: 0.2, l0: 3, l1: 16, lg: 0.3 }
};
/* every shot: a highpassed crack, a driven pitch-dropping thump, a closing lowpassed body, a reverb tail */
const sfxGun = (c, f0, f1, t, v, cut, end, bt, bv, rv, th, more) => ({ rv, th, in: 0.012, L: [
  { k: 'n', ft: 'highpass', f: 2400, t: 0.03, v: c }, { k: 't', f: f0, f2: f1, s: 0.8, t, v, dr: 2.6 }, { k: 'n', f: cut, f2: end, t: bt, v: bv, q: 0.6 }].concat(more || []) });
const SFXD = {
  rifle: sfxGun(0.5, 150, 46, 0.12, 0.75, 3200, 300, 0.18, 0.45, 0.35, 30),
  br: sfxGun(0.6, 120, 38, 0.17, 0.9, 2600, 240, 0.26, 0.55, 0.45, 40),
  pistol: sfxGun(0.42, 190, 70, 0.08, 0.55, 3600, 600, 0.11, 0.35, 0.25, 40),
  mg: sfxGun(0.5, 112, 40, 0.11, 0.85, 2600, 260, 0.15, 0.5, 0.32, 36),
  shotgun: sfxGun(0.7, 90, 30, 0.3, 1.05, 2600, 170, 0.42, 0.85, 0.6, 0, [{ k: 'n', d: 0.42, ft: 'bandpass', f: 2200, q: 4, t: 0.03, v: 0.18 }, { k: 'n', d: 0.52, ft: 'bandpass', f: 1600, q: 4, t: 0.04, v: 0.2 }]),
  sniper: sfxGun(0.95, 80, 26, 0.48, 1.1, 2200, 110, 0.65, 0.85, 0.95, 0, [{ k: 'n', d: 0.32, f: 900, f2: 150, t: 0.5, v: 0.22 }, { k: 'n', d: 0.78, f: 600, f2: 120, t: 0.6, v: 0.1 }]),
  cannon: { rv: 1, in: 0.1, L: [{ k: 'n', ft: 'highpass', f: 1800, t: 0.05, v: 0.8 }, { k: 't', f: 72, f2: 20, s: 0.8, t: 1, v: 1.25, dr: 3 }, { k: 'n', f: 1800, f2: 60, t: 1.3, v: 0.95, q: 0.5 }, { k: 'c', d: 0.05, c: 10, sp: 0.7, v: 0.2 }] },
  boom: { rv: 1, th: 45, in: 0.13, L: [{ k: 'n', ft: 'highpass', f: 1500, t: 0.06, v: 0.8 }, { k: 't', f: 66, f2: 19, s: 0.8, t: 1.15, v: 1.3, dr: 3.2 }, { k: 'n', f: 2400, f2: 40, t: 1.5, v: 1, q: 0.45 }, { k: 'c', d: 0.04, c: 14, sp: 0.9, v: 0.28 }] },
  bigboom: { rv: 1.2, th: 45, in: 0.2, L: [{ k: 'n', ft: 'highpass', f: 1500, t: 0.06, v: 0.8 }, { k: 't', f: 52, f2: 15, s: 0.8, t: 1.7, v: 1.3, dr: 3.2 }, { k: 't', d: 0.07, f: 40, f2: 14, s: 0.8, t: 1.4, v: 0.8, dr: 2.4 }, { k: 'n', f: 1700, f2: 40, t: 2.3, v: 1, q: 0.45 }, { k: 'c', d: 0.04, c: 26, sp: 1.4, v: 0.28 }] },
  rocket: { rv: 0.5, L: [{ k: 't', f: 150, f2: 60, s: 0.8, t: 0.14, v: 0.6, dr: 2 }, { k: 'n', ft: 'bandpass', f: 500, f2: 3200, q: 0.9, t: 0.5, v: 0.75, a: 0.03 }] },
  whiz: { th: 80, nd: 1, L: [{ k: 'n', ft: 'highpass', f: 4200, t: 0.025, v: 0.4 }, { k: 'n', ft: 'bandpass', f: 5200, f2: 1400, q: 3, t: 0.13, v: 0.22 }] },
  clang: { rv: 0.3, th: 70, L: [{ k: 't', w: 'triangle', f: 1310, a: 0.002, t: 0.28, v: 0.3, r: 0.03 }, { k: 't', w: 'triangle', f: 1874, a: 0.002, t: 0.2, v: 0.3, r: 0.03 }, { k: 't', w: 'triangle', f: 2620, a: 0.002, t: 0.12, v: 0.3, r: 0.03 }, { k: 'n', ft: 'highpass', f: 3000, t: 0.02, v: 0.45 }] },
  splat: { rv: 0.2, th: 40, L: [{ k: 't', f: 130, f2: 45, s: 0.8, t: 0.18, v: 0.5, dr: 1.6 }, { k: 'n', f: 900, f2: 140, t: 0.22, v: 0.35 }] },
  crack: { rv: 0.5, L: [{ k: 'n', ft: 'bandpass', f: 900, f2: 180, q: 1.4, t: 0.5, v: 0.45 }, { k: 'c', c: 8, sp: 0.4, v: 0.2 }] },
  crush: { rv: 0.2, th: 80, L: [{ k: 't', f: 90, f2: 35, s: 0.8, t: 0.25, v: 0.6, dr: 2.5 }, { k: 'n', f: 700, f2: 90, t: 0.35, v: 0.4 }] }
};
/* engines: two detuned oscillators through a speed-opened lowpass, a sub you feel up close, and a track clatter */
const ENGD = {
  eng_tank: { e: 1, v: 0.13, b: 34, lp: 200, lps: 380, sub: 31, s0: 0.12, s1: 0.55, ss: 1, nf: 480, ng: 0.45, lg: 0.5 },
  eng_car: { e: 1, v: 0.07, b: 64, lp: 700, lps: 1400, sub: 48, s0: 0, s1: 0.05, ss: 0, nf: 1400, ng: 0.1, lg: 0.15 }
};
/* the noise, reverb impulse and soft-clip curve every sound shares (made once per audio context) */
function auBufs(c) {
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const L = Math.floor(c.sampleRate * 2.2), ir = c.createBuffer(2, L, c.sampleRate);     // outdoor slap + long decay
  for (let ch = 0; ch < 2; ch++) { const q = ir.getChannelData(ch); for (let i = 0; i < L; i++) { const t = i / c.sampleRate; q[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, 3.2) * (t < 0.09 ? 0.35 : 1) + (Math.abs(t - 0.11 - ch * 0.013) < 0.004 ? (Math.random() - 0.5) * 1.6 : 0); } }
  const cur = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cur[i] = Math.tanh(x * 3.2) / Math.tanh(3.2); }
  return { noise: b, ir, curve: cur };
}
/* the master chain (game and Sound Lab): master → ear (hearing-loss lowpass) → glue compressor → trim → ceiling → fin → speakers.
   The ceiling is a soft clipper: straight up to CEIL_T, then it bends smoothly toward CEIL_C, so overlapping blasts that
   would go past 0 dBFS round off instead of hard-clipping at the speakers (the crackle). It reads ±4 (+12 dB) before it clamps.
   The reverb send is highpassed: booms' sub-bass ringing for 2 s in the convolver only muddied the mix and ate headroom. */
const CEIL_T = 0.7, CEIL_C = 0.95;
function ceilCurve() {
  const n = 4096, k = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1) * 2 - 1) * 4, a = Math.abs(x); k[i] = Math.sign(x) * (a <= CEIL_T ? a : CEIL_T + (CEIL_C - CEIL_T) * Math.tanh((a - CEIL_T) / (CEIL_C - CEIL_T))); }
  return k;
}
function auChain(c) {
  const N = { fin: c.createGain() }; N.fin.connect(c.destination);
  N.ceilIn = c.createGain(); N.ceilIn.gain.value = 0.25; N.ceil = c.createWaveShaper(); N.ceil.curve = ceilCurve(); N.ceil.oversample = '4x'; N.ceilIn.connect(N.ceil);
  N.trim = c.createGain(); N.trim.gain.value = AU_TRIM;
  N.comp = c.createDynamicsCompressor(); for (const k in AU_COMP) N.comp[k].value = AU_COMP[k];
  N.ear = c.createBiquadFilter(); N.ear.type = 'lowpass'; N.ear.frequency.value = 20000; N.ear.Q.value = 0.5;
  N.master = c.createGain(); N.master.gain.value = 0.85; N.master.connect(N.ear);
  N.verbIn = c.createGain(); N.verbIn.gain.value = 0.6; N.verbHp = c.createBiquadFilter(); N.verbHp.type = 'highpass'; N.verbHp.frequency.value = 180; N.verbHp.Q.value = 0.6;
  N.verb = c.createConvolver(); N.verbIn.connect(N.verbHp); N.verbHp.connect(N.verb); N.verb.connect(N.master);
  /* b: stages to leave out (the Sound Lab's bypass switches): comp, ceil */
  N.route = (b = {}) => {
    for (const k of ['ear', 'comp', 'trim', 'ceil']) N[k].disconnect();
    let n = N.ear; if (!b.comp) { n.connect(N.comp); n = N.comp; }
    n.connect(N.trim); n = N.trim;
    if (!b.ceil) { n.connect(N.ceilIn); N.ceil.connect(N.fin); } else n.connect(N.fin);
  };
  N.route();
  return N;
}
const AU_COMP = { threshold: -16, knee: 8, ratio: 3, attack: 0.006, release: 0.18 }, AU_TRIM = 0.9;      // tuned offline: blasts as loud as before, nothing past 0 dBFS
/* when to start a sound: a little ahead of now, so its attack is never scheduled in the past (that skips the fade-in: a click) */
const sfxT = A => A.ctx.currentTime + (A.la || 0);
/* glide an AudioParam from wherever it is now (cancelScheduledValues alone snaps it back to its last set value: a step) */
function aHold(p, t) { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { const v = p.value; p.cancelScheduledValues(t); p.setValueAtTime(v, t); } }
/* where a sound goes: bass shelf → lowpass (closes with distance hv, 0..1) → pan → dest, plus a reverb send that grows with distance.
   head.k: its nodes, disconnected when the sound ends. A.byp (Sound Lab): tone / shelf / verb left out */
function sfxOut(A, P, hv, pan, dest, verbIn, F) {
  const mu = F ? 1 - (1 - hv) * F.mu : hv, rd = F ? F.rd : 1, B = A.byp || {};      // F falloff (1d_sev.js): how much distance muffles / adds reverb
  const c = A.ctx, lp = c.createBiquadFilter(), k = [lp]; lp.type = 'lowpass'; lp.frequency.value = B.tone ? c.sampleRate / 2 : Math.min(P.lp || 20000, 700 + 19000 * Math.pow(Math.max(0, mu), 1.7)); lp.Q.value = 0.4;
  if (pan && c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = Math.max(-0.9, Math.min(0.9, pan)); lp.connect(pn); pn.connect(dest); k.push(pn); } else lp.connect(dest);
  if (P.rv && verbIn && !B.verb) { const sg = c.createGain(); sg.gain.value = P.rv * (0.45 + (1 - hv) * 1.1 * rd); lp.connect(sg); sg.connect(verbIn); k.push(sg); }
  if (!P.bs || B.shelf) { lp.k = k; return lp; }
  const sh = c.createBiquadFilter(); sh.type = 'lowshelf'; sh.frequency.value = 160; sh.gain.value = P.bs; sh.connect(lp); k.push(sh); sh.k = k; return sh;
}
/* one voice of a layer at t0, level v, pitch ×k (L has its defaults filled). Returns [source, end].
   The envelope rises linearly from 0 (an exponential rise from -80 dB is flat, then jumps in its last fraction of a ms:
   effectively a step), at least 1.5 ms, which still reads as an instant crack. Noise loops, so a long layer started late in
   the 2 s buffer can't run off its end mid-sound (it used to: explosions' tails cut dead, a click). The voice's nodes are let
   go when its source ends. A.byp.legacy: the old voice (build 256) to compare against; A.byp.drive: no waveshaper */
function sfxVoice(A, L, out, t0, v, k) {
  if (!(v > 0)) return null;
  const c = A.ctx, B = A.byp || {}, old = B.legacy, at = old ? L.a : Math.max(L.a, 0.0015), end = t0 + at + L.t, env = c.createGain();
  if (old) { env.gain.setValueAtTime(0.0001, t0); env.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + at); }
  else { env.gain.setValueAtTime(0, t0); env.gain.linearRampToValueAtTime(v, t0 + at); }
  env.gain.exponentialRampToValueAtTime(0.0001, end); env.connect(out);
  let head = env, src;
  if (L.dr > 0 && !B.drive) { const pre = c.createGain(), ws = c.createWaveShaper(); pre.gain.value = L.dr; ws.curve = A.curve; pre.connect(ws); ws.connect(env); head = pre; }
  const sweep = (prm, f, m) => { prm.setValueAtTime(f * k * m, t0); if (L.f2) prm.exponentialRampToValueAtTime(Math.max(10, L.f2 * k * m), t0 + L.t * L.s); };
  const filt = () => { if (!L.ft) return head; const f = c.createBiquadFilter(); f.type = L.ft; f.frequency.value = L.fc * k; f.Q.value = L.q; f.connect(head); return f; };
  if (L.k === 'n') {
    const s = c.createBufferSource(), f = c.createBiquadFilter(); s.buffer = A.noise; s.loop = !old; f.type = L.ft; sweep(f.frequency, L.f, 1); f.Q.value = L.q;
    s.connect(f); f.connect(head); s.start(t0, Math.random() * 1.5); s.stop(end + 0.05); src = s;
  } else {
    const o = c.createOscillator(); o.type = L.w; sweep(o.frequency, L.f, 1); o.connect(filt()); o.start(t0); o.stop(end + 0.05); src = o;
    if (L.k === 'f') {
      const m = c.createOscillator(), mg = c.createGain(), mf = L.f * L.mr * k; sweep(m.frequency, L.f, L.mr);
      mg.gain.setValueAtTime(L.mi * mf, t0); mg.gain.linearRampToValueAtTime(L.mi2 * mf, end); m.connect(mg); mg.connect(o.frequency); m.start(t0); m.stop(end + 0.05);
    }
  }
  src.onended = () => env.disconnect();
  return [src, end];
}
/* play preset P into out (from sfxOut) at time now, level vol. A.nv counts the sounds still playing */
function sfxRun(A, P, out, now, vol) {
  const g = (P.v === undefined ? 1 : P.v) * vol, pk = (P.p || 1) * (1 + (Math.random() * 2 - 1) * (P.pr || 0));
  let last = null; const keep = r => { if (r && (!last || r[1] > last[1])) last = r; };
  for (const L0 of P.L) {
    if (L0.m) continue;
    const L = Object.assign({}, SFXK[L0.k], L0);
    if (L.k === 'c') {
      const N = Object.assign({}, SFXK.n, { k: 'n', ft: 'bandpass', q: L.q });
      for (let i = 0; i < L.c; i++) { const d = Math.pow(Math.random(), 1.6) * L.sp; N.f = L.f + Math.random() * (L.f2 - L.f); N.t = L.t + Math.random() * L.tr; keep(sfxVoice(A, N, out, now + L.d + d, g * L.v * (1 - d / L.sp) * (0.5 + Math.random() * 0.5), pk)); }
      continue;
    }
    for (let i = 0; i < L.n; i++) keep(sfxVoice(A, L, out, now + L.d + i * L.dt, g * L.v * Math.pow(L.vm, i), pk * Math.pow(L.pm, i) * (1 + (Math.random() * 2 - 1) * L.r)));
  }
  const done = () => { A.nv--; for (const n of out.k || [out]) n.disconnect(); };
  A.nv = (A.nv || 0) + 1; if (last) last[0].addEventListener('ended', done); else done();
}
/* how long a preset rings (s), reverb not counted */
function sfxLen(P) {
  let e = 0;
  for (const L0 of P.L) { const L = Object.assign({}, SFXK[L0.k], L0); e = Math.max(e, L.k === 'c' ? L.d + L.sp + L.t + L.tr : L.d + (L.n - 1) * L.dt + L.a + L.t); }
  return e;
}
/* an engine voice into dest; engSet drives it: sp speed 0..1, hv hearing 0..1, near 0..1 (a local player close by), k on/demo level */
function engBuild(A, E0, dest) {
  const E = Object.assign({}, SFXK.e, E0), c = A.ctx, now = c.currentTime, out = c.createGain(); out.gain.value = 0; out.connect(dest);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = E.lp; lp.Q.value = E.q;
  if (E.dr > 0) { const pre = c.createGain(), ws = c.createWaveShaper(); pre.gain.value = E.dr; ws.curve = A.curve; lp.connect(pre); pre.connect(ws); ws.connect(out); } else lp.connect(out);
  const o1 = c.createOscillator(); o1.type = E.w1; o1.connect(lp); const o2 = c.createOscillator(); o2.type = E.w2; const g2 = c.createGain(); g2.gain.value = E.g2; o2.connect(g2); g2.connect(lp);
  const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.value = E.sub; const sg = c.createGain(); sg.gain.value = 0; sub.connect(sg); sg.connect(dest);
  const ns = c.createBufferSource(); ns.buffer = A.noise; ns.loop = true; const nb = c.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = E.nf; nb.Q.value = E.nq;
  const ng = c.createGain(); ng.gain.value = 0; const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 6; const lg = c.createGain(); lg.gain.value = 0;
  const ls = c.createBiquadFilter(); ls.type = 'lowpass'; ls.frequency.value = 90; ls.Q.value = 0.5; lfo.connect(ls); ls.connect(lg); lg.connect(ng.gain);     // the chop's edges rounded (~2 ms): a square step in gain clicks
  ns.connect(nb); nb.connect(ng); ng.connect(out);
  for (const n of [o1, o2, sub, lfo]) n.start(now); ns.start(now, Math.random());
  return { E, out, lp, o1, o2, g2, sub, sg, ns, nb, ng, lfo, lg };
}
function engSet(N, sp, hv, near, k) {
  const E = N.E, now = N.out.context.currentTime, f = E.b * (1 + sp * E.sm);
  if (N.ut !== undefined && now - N.ut < 0.04 && k === N.uk) return; N.ut = now; N.uk = k;      // every frame was 60 × 8 automation events a second per engine
  N.o1.frequency.setTargetAtTime(f, now, 0.1); N.o2.frequency.setTargetAtTime(f * E.r2, now, 0.1); N.lp.frequency.setTargetAtTime(E.lp + sp * E.lps, now, 0.1);
  N.out.gain.setTargetAtTime(E.v * (0.45 + sp) * hv * k, now, 0.1);
  N.sg.gain.setTargetAtTime((E.s0 + E.s1 * near) * (1 + E.ss * (sp - 0.6)) * k * Math.max(hv, near), now, 0.12);
  N.lfo.frequency.setTargetAtTime(E.l0 + sp * E.l1, now, 0.1); N.lg.gain.setTargetAtTime(E.lg * sp, now, 0.1); N.ng.gain.setTargetAtTime(E.ng * sp, now, 0.1);
}
function engStop(N) { const now = N.out.context.currentTime; try { for (const g of [N.out.gain, N.sg.gain]) { aHold(g, now); g.setTargetAtTime(0, now, 0.05); } for (const n of [N.o1, N.o2, N.sub, N.lfo, N.ns]) n.stop(now + 0.45); N.o1.onended = () => { N.out.disconnect(); N.sg.disconnect(); }; } catch (e) { } }
