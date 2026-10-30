/* the Sound Lab's MIX tab and meters: the game's master chain (auChain in ../src/1c_sfx.js) with every stage switchable,
   peak meters with clip lights, stress tests (lots of sounds at once) and an offline measurement of them.
   Shares the Sounds tab's globals; everything here runs after that script. */
'use strict';
/* the stages you can leave out. Voice / sound stages are read by sfxVoice / sfxOut (A.byp); chain stages are re-routed */
const BYP = [
  ['drive', 'Drive (waveshapers)', 'Each layer\'s distortion'],
  ['tone', 'Distance tone filter', 'The lowpass that closes with distance (and a preset\'s Tone)'],
  ['shelf', 'Bass shelf', 'A preset\'s Bass'],
  ['verb', 'Reverb sends', 'Every sound\'s send to the shared reverb'],
  ['comp', 'Glue compressor', 'Master: −16 dB, 3:1'],
  ['ceil', 'Ceiling (soft clip)', 'Master: rounds off anything past −3 dBFS so it can\'t hard-clip. Off: overs clip at the speakers'],
  ['legacy', 'Old voices (build 256)', 'Exponential 2 ms attack from −80 dB, noise that can run off the end of its buffer, no start-ahead'],
  ['oldchain', 'Old master chain (build 256)', 'Two compressors with make-up gain into the speakers, no ceiling: what crackled']
];
/* scenes: [sound, start s, level] */
const SCENE = {
  burst: ['Rifle burst', () => Array.from({ length: 12 }, (_, i) => ['rifle', i * 0.09])],
  stack: ['This sound ×6', () => Array.from({ length: 6 }, (_, i) => ['#cur', i * 0.05])],
  fight: ['Firefight', () => { const a = []; for (let i = 0; i < 20; i++) a.push(['mg', i * 0.077]); for (let i = 0; i < 8; i++) a.push(['rifle', 0.03 + i * 0.19, 0.7], ['br', 0.08 + i * 0.23, 0.6]); a.push(['boom', 0.45], ['bigboom', 1.05, 0.8]); return a; }],
  barrage: ['Barrage', () => [['bigboom', 0], ['boom', 0.1], ['boom', 0.22, 0.8], ['bigboom', 0.35, 0.7], ['cannon', 0.5], ['boom', 0.57]]]
};
/* a lab audio graph on context c: the game's chain, the old one beside it to switch to, meters' taps, the effects bus */
function labBuild(c) {
  const B = auBufs(c), K = auChain(c);
  K.verb.buffer = B.ir;
  const sfx = c.createGain(); sfx.gain.value = 0.75; sfx.connect(K.master);
  const oc = c.createDynamicsCompressor(); oc.threshold.value = -14; oc.ratio.value = 5;
  const ol = c.createDynamicsCompressor(); ol.threshold.value = -4; ol.ratio.value = 14; ol.attack.value = 0.002; ol.release.value = 0.12; ol.connect(oc);
  const busA = c.createAnalyser(), outA = c.createAnalyser(); busA.fftSize = outA.fftSize = 2048; K.master.connect(busA); K.fin.connect(outA);
  return { ctx: c, noise: B.noise, curve: B.curve, sfx, verbIn: K.verbIn, ear: K.ear, master: K.master, K, oc, ol, busA, outA, byp: {}, nv: 0 };
}
function labRoute(a, b) {
  a.byp = b; a.oc.disconnect();
  if (b.oldchain) { for (const k of ['ear', 'comp', 'trim', 'ceil']) a.K[k].disconnect(); a.K.ear.connect(a.ol); a.oc.connect(a.K.fin); }
  else a.K.route(b);
}
const byp = () => S.byp || (S.byp = {});

/* ---------- meters: peak of the last 43 ms each frame, a falling bar, a held peak, latching lights ---------- */
const MT = { buf: null, bus: { v: -90, hold: -90, ht: 0 }, out: { v: -90, hold: -90, ht: 0 }, over: 0, clip: 0, ceil: 0, run: false };
function peakOf(an) {
  const n = an.fftSize; if (!MT.buf || MT.buf.length !== n) MT.buf = new Float32Array(n);
  let p = 0;
  if (an.getFloatTimeDomainData) { an.getFloatTimeDomainData(MT.buf); for (let i = 0; i < n; i++) { const a = Math.abs(MT.buf[i]); if (a > p) p = a; } }
  else { const u = new Uint8Array(n); an.getByteTimeDomainData(u); for (let i = 0; i < n; i++) { const a = Math.abs(u[i] - 128) / 128; if (a > p) p = a; } }
  return p;
}
const dB = p => p > 0 ? 20 * Math.log10(p) : -90, mPos = d => Math.max(0, Math.min(1, (d + 48) / 54)) * 100;     // −48 … +6 dB
function meterStart() { if (MT.run) return; MT.run = true; requestAnimationFrame(meterTick); }
function meterTick(now) {
  requestAnimationFrame(meterTick);
  if (!A || document.hidden) return;
  const pb = peakOf(A.busA), po = peakOf(A.outA), oldc = byp().oldchain;
  if (pb > 1) MT.over++;
  if (po >= 0.999) MT.clip++;
  if (!oldc && !byp().ceil && po > CEIL_T) MT.ceil++;
  for (const [k, p] of [['bus', pb], ['out', po]]) { const m = MT[k], d = dB(p); m.v = Math.max(d, m.v - 1.2); if (d >= m.hold || now - m.ht > 1500) { m.hold = d; m.ht = now; } }
  const el = $('#meters'); if (!el) return;
  for (const k of ['bus', 'out']) { const m = MT[k], r = el.querySelector('.m-' + k); r.querySelector('i').style.width = mPos(m.v) + '%'; r.querySelector('i').className = m.v > -0.1 ? 'r' : m.v > -6 ? 'a' : ''; r.querySelector('b').style.left = mPos(m.hold) + '%'; r.querySelector('s').textContent = m.hold > -89 ? m.hold.toFixed(1) : '−∞'; }
  const L = (s, on) => el.querySelector(s).classList.toggle('on', on);
  L('.l-over', MT.over > 0); L('.l-ceil', MT.ceil > 0); L('.l-clip', MT.clip > 0);
  el.querySelector('.l-over').title = MT.over + ' frames had the bus past 0 dBFS (the chain had to catch them)';
  el.querySelector('.l-clip').title = MT.clip + ' frames hit 0 dBFS at the speakers: audible crackle';
  el.querySelector('.gr').title = 'Compressor gain reduction (dB) · sounds playing'; el.querySelector('.l-ceil').title = MT.ceil + ' frames the ceiling was rounding peaks off';
  el.querySelector('.gr').textContent = (oldc ? 'old' : byp().comp ? 'no comp' : 'GR ' + (A.K.comp.reduction || 0).toFixed(1)) + ' · ' + A.nv + '♪';
}
function meterReset() { MT.over = MT.clip = MT.ceil = 0; MT.bus.hold = MT.out.hold = -90; }
const meterHTML = () => `<div class="mrow m-bus" title="The mix going into the master chain"><span>BUS</span><div><i></i><b></b><u></u></div><s>−∞</s></div>
  <div class="mrow m-out" title="What reaches the speakers"><span>OUT</span><div><i></i><b></b><u></u></div><s>−∞</s></div>
  <div class="lights"><em class="l-over">BUS&gt;0</em><em class="l-ceil">CEIL</em><em class="l-clip">CLIP</em><span id="stats"></span><span class="gr"></span><button class="btn sm" id="mreset" title="Reset the lights">reset</button></div>`;

/* ---------- scenes ---------- */
function sceneList(id) { return SCENE[id][1]().map(([s, t, v]) => [s === '#cur' ? cur().P : soundFor(s) || SFXD[s], t, v || 1]).filter(e => e[0] && !e[0].e); }
function scenePlay(id) { const a = audio(), t0 = sfxT(a) + 0.03; for (const [P, t, v] of sceneList(id)) sfxRun(a, P, sfxOut(a, P, 1, 0, a.sfx, a.verbIn), t0 + t, v); S.mixLast = id; save(); }
/* offline: the scene through the chain as switched now, and through the old chain; peak, overs, ceiling work, loudness */
async function sceneMeasure(id) {
  if (!OC) return null;
  const run = async b => {
    const sr = 48000, c = new OC(2, sr * 3.6, sr), a = labBuild(c); labRoute(a, b);
    for (const [P, t, v] of sceneList(id)) sfxRun(a, P, sfxOut(a, P, 1, 0, a.sfx, a.verbIn), 0.05 + t, v);
    const r = await c.startRendering(); let pk = 0, over = 0, ceil = 0, ss = 0;
    for (let ch = 0; ch < 2; ch++) { const x = r.getChannelData(ch); for (let i = 0; i < x.length; i++) { const q = Math.abs(x[i]); if (q > pk) pk = q; if (q > 1) over++; if (q > CEIL_T) ceil++; ss += x[i] * x[i]; } }
    return { pk: dB(pk), over, ceil, rms: 10 * Math.log10(ss / (2 * sr * 3.6) || 1e-9) };
  };
  return { now: await run(Object.assign({}, byp())), old: await run({ oldchain: 1, legacy: 1 }) };
}

/* ---------- the tab ---------- */
function renderMix() {
  const b = byp();
  $('#stats').textContent = 'mix · ' + BYP.filter(([k]) => b[k]).length + ' bypassed';
  let h = `<div class="card"><h2>Stress test<span class="sp"></span></h2><p class="muted" style="margin:0 0 6px">Play many sounds at once (your edited presets) and watch the meters up top: <b>BUS&gt;0</b> means the mix went past full scale and the chain had to catch it, <b>CEIL</b> means the ceiling rounded peaks off, <b>CLIP</b> means samples hit 0 dBFS at the speakers, which is the crackle. With the new chain CLIP should stay dark.</p>
    <div class="row">${Object.entries(SCENE).map(([k, [n]]) => `<button class="btn sm${S.mixLast === k ? ' on' : ''}" data-scene="${k}">▶ ${n}</button>`).join('')}</div>
    <div class="row" style="margin-top:8px"><select id="msel">${Object.entries(SCENE).map(([k, [n]]) => `<option value="${k}"${(S.mixLast || 'fight') === k ? ' selected' : ''}>${n}</option>`).join('')}</select><button class="btn sm" id="measure">Measure offline</button></div>
    <div id="mres" class="flds" style="margin-top:6px"></div></div>
  <div class="card"><h2>Bypass stages<span class="sp"></span></h2><p class="muted" style="margin:0 0 4px">Leave a stage out to hear what it does. Applies to everything the lab plays (not the game).</p>
    ${BYP.map(([k, n, d]) => `<div class="sl"><label style="grid-column:1/4;white-space:normal"><input type="checkbox" data-byp="${k}"${b[k] ? ' checked' : ''}>${n} <span class="muted">· ${d}</span></label></div>`).join('')}
    <div class="row" style="margin-top:6px"><button class="btn sm" id="bypnone">All on</button></div></div>`;
  $('#main').innerHTML = h;
}
function mixChange(e) { const k = e.target.dataset.byp; if (k) { byp()[k] = e.target.checked ? 1 : 0; if (A) labRoute(A, byp()); save(); renderMix(); meterReset(); } }
async function mixClick(e) {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.scene) { scenePlay(t.dataset.scene); renderMix(); return; }
  if (t.id === 'bypnone') { S.byp = {}; if (A) labRoute(A, S.byp); save(); renderMix(); return; }
  if (t.id === 'measure') {
    const id = $('#msel').value, out = $('#mres'); out.textContent = 'Rendering…';
    const r = await sceneMeasure(id); if (!r) { out.textContent = 'This browser can\'t render offline'; return; }
    const row = (n, q) => `<div><b>${n}</b> peak ${q.pk.toFixed(1)} dBFS · <span style="color:${q.over ? 'var(--red)' : 'var(--green)'}">${q.over} samples over 0 dBFS</span> · ceiling on ${q.ceil} · loudness ${q.rms.toFixed(1)} dB RMS</div>`;
    out.innerHTML = row('As switched now:', r.now) + row('Build 256 (old voices + old chain):', r.old);
  }
}
