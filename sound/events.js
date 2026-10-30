/* the Sound Lab's EVENTS tab: which sounds each game event plays, when (conditions with AND / OR / NOT), how they
   fall off with distance, and effects such as hearing loss. Edits the rules in ../src/1d_sev.js (SEVD); "Send to game"
   stores them for the game in this browser (mmgl.sevlab), Export gives lines to paste into SEVD.
   Shares the Sounds tab's globals ($, S, ctl, toPos, fromPos, fmt, audio, …); everything here runs after that script. */
'use strict';
const EVR = 700;      // screen falloff: px from the screen's centre to its edge (it depends on zoom; about this on a phone)
const RS = { v: ['Volume', 0, 2, 0, ''], p: ['Pitch', 0.25, 4, 1, '×'], dl: ['Delay', 0, 2, 0, 's'], th: ['Min gap', 0, 1000, 0, 'ms', 1] };
const FS = {
  m: ['Mode', 'sel', ['screen', 'world', 'flat']], a: ['Drop at edge', 0, 1, 0, ''], o: ['Fades out over', 0.1, 4, 0, '×'], n: ['Full within', 0, 2000, 0, 'px', 1],
  f: ['Silent past', 50, 6000, 1, 'px', 1], c: ['Curve', 0.2, 4, 1, ''], mu: ['Distance muffle', 0, 2, 0, '×'], rd: ['Distance reverb', 0, 3, 0, '×'], pan: ['Stereo pan', 'chk']
};
const FM = { screen: ['a', 'o'], world: ['n', 'f', 'c'], flat: [] };
const DS = {
  re: ['Reach', 0.2, 5, 0, '×'], cut: ['Muffle to', 60, 4000, 1, 'Hz'], far: ['+ further off', 0, 6000, 0, 'Hz'], d0: ['Recovers in', 0.1, 6, 0, 's'], d1: ['+ when close', 0, 8, 0, 's'],
  f1: ['Whine 1', 500, 12000, 1, 'Hz'], v1: ['Whine 1 level', 0, 0.3, 0, ''], f2: ['Whine 2', 500, 12000, 1, 'Hz'], v2: ['Whine 2 level', 0, 0.3, 0, ''], rm: ['Pad rumble', 0, 1, 0, '']
};
const TD = ['Distance', 0, 3000, 0, 'px', 1];
const XF = { me: ['1 if it\'s a soldier this screen plays'], ally: ['1 if on a local player\'s team'], bot: ['1 if a bot'] };
const OPS = ['==', '!=', '<', '<=', '>', '>=', 'in'], OPN = { '==': 'is', '!=': 'is not', '<': '<', '<=': '≤', '>': '>', '>=': '≥', in: 'is one of' };
const WHO = [['', 'At the spot (by distance)'], ['pl', 'Only that player hears it'], ['ui', 'Everyone, no position']];
const SGKEY = 'mmgl.sevlab';
const strip = o => JSON.parse(JSON.stringify(o, (k, v) => k[0] === '_' ? undefined : v));
const sgGet = () => { try { return JSON.parse(localStorage.getItem(SGKEY)) || {}; } catch (e) { return {}; } };
const sgSet = o => { try { if (Object.keys(o).length) localStorage.setItem(SGKEY, JSON.stringify(o)); else localStorage.removeItem(SGKEY); } catch (e) { } };

function evInit() { if (!S.ev || typeof S.ev.R !== 'object') S.ev = { R: {}, cur: 'shot', T: {} }; if (!EVD[S.ev.cur]) S.ev.cur = 'shot'; }
const evName = () => S.ev.cur;
/* the rules being edited: a copy of the defaults is made on the first edit */
function evRules(edit) { const n = evName(); if (edit && !S.ev.R[n]) S.ev.R[n] = clone(SEVD[n] || []); return S.ev.R[n] || SEVD[n] || []; }
const evEdited = n => !!S.ev.R[n] && JSON.stringify(strip(S.ev.R[n])) !== JSON.stringify(SEVD[n] || []);
const evInGame = n => { const g = sgGet()[n]; return !!g && JSON.stringify(g) === JSON.stringify(strip(S.ev.R[n] || SEVD[n] || [])); };
/* fields a condition can test for event n: name → [meaning, options] */
function evFields(n) { const D = EVD[n], o = Object.assign({}, D[2]); if (D[3].includes('a')) Object.assign(o, XF); o.dist = ['px to the nearest local player (the camera if none)']; return o; }
const fOpts = s => s[1] || (/^1 /.test(s[0]) ? [0, 1] : null);
function evTest() { evInit(); const n = evName(); if (!S.ev.T[n]) { const T = { dist: 0 }; for (const [f, s] of Object.entries(evFields(n))) if (f !== 'dist') { const o = fOpts(s); T[f] = o ? o[0] : 0; } if ('me' in T) T.me = 1; if ('ally' in T) T.ally = 1; if ('r' in T) T.r = 100; S.ev.T[n] = T; } return S.ev.T[n]; }
const num = v => v !== '' && isFinite(v) ? +v : v;

/* ---------- conditions ---------- */
function cAt(r, path) { let c = r.if; if (path === '') return c; for (const i of path.split('.')) c = c.c[+i]; return c; }
function cPut(r, path, v) {
  if (path === '') { if (v === undefined) delete r.if; else r.if = v; return; }
  const ix = path.split('.'), last = +ix.pop(), par = cAt(r, ix.join('.'));
  if (v === undefined) par.c.splice(last, 1); else par.c[last] = v;
}
function newTest(n) { const F = evFields(n), f = Object.keys(F).find(k => k !== 'dist') || 'dist', o = fOpts(F[f]); return { f, op: f === 'dist' ? '<' : '==', v: o ? o[0] : f === 'dist' ? 300 : 0 }; }
function condTxt(C) {
  if (!C) return '';
  const t = C.g ? (C.c.length ? '(' + C.c.map(condTxt).join(C.g === 'or' ? ' OR ' : ' AND ') + ')' : '(always)') : `${C.f} ${OPN[C.op] || C.op} ${Array.isArray(C.v) ? C.v.join(', ') : C.v}`;
  return C.n ? 'NOT ' + t : t;
}
function condUI(n, ri, C, path, depth) {
  const at = `data-ri="${ri}" data-c="${path}"`, F = evFields(n);
  const tools = `<button class="btn sm ic${C.n ? ' on' : ''}" data-ca="not" ${at} title="Invert (NOT)">¬</button><button class="btn sm ic" data-ca="del" ${at} title="Remove">✕</button>`;
  if (C.g) {
    const kids = C.c.map((k, i) => condUI(n, ri, k, path === '' ? '' + i : path + '.' + i, depth + 1)).join('') || '<div class="muted" style="padding:4px 2px">Empty group: always true</div>';
    return `<div class="cg${C.n ? ' not' : ''}"><div class="row"><select data-cg ${at}><option value="and"${C.g === 'and' ? ' selected' : ''}>ALL of these (AND)</option><option value="or"${C.g === 'or' ? ' selected' : ''}>ANY of these (OR)</option></select>${tools}</div>
      ${kids}<div class="row"><button class="btn sm" data-ca="addT" ${at}>＋ Test</button>${depth < 3 ? `<button class="btn sm" data-ca="addG" ${at}>＋ Group</button>` : ''}</div></div>`;
  }
  const s = F[C.f] || ['?'], o = fOpts(s);
  const val = o && C.op !== 'in' ? `<select data-cv ${at}>${o.map(x => `<option${String(x) === String(C.v) ? ' selected' : ''}>${x}</option>`).join('')}</select>`
    : `<input type="text" data-cv ${at} value="${esc(Array.isArray(C.v) ? C.v.join(', ') : C.v)}" placeholder="${C.op === 'in' ? 'a, b, c' : 'value'}"${o ? ` list="dl${ri}_${path}"` : ''}>${o ? `<datalist id="dl${ri}_${path}">${o.map(x => `<option value="${x}">`).join('')}</datalist>` : ''}`;
  return `<div class="ct${C.n ? ' not' : ''}"><select data-cf ${at} title="${esc(s[0])}">${Object.keys(F).map(f => `<option value="${f}"${f === C.f ? ' selected' : ''}>${f}</option>`).join('')}</select>
    <select data-co ${at}>${OPS.map(x => `<option value="${x}"${x === C.op ? ' selected' : ''}>${OPN[x]}</option>`).join('')}</select>${val}${tools}</div>`;
}

/* ---------- falloff curve ---------- */
function curveSVG(F, d) {
  const W = 300, H = 64, mx = F.m === 'world' ? F.f * 1.25 : EVR * (1 + F.o) * 1.15, pts = [];
  for (let i = 0; i <= 60; i++) { const x = mx * i / 60; pts.push((W * i / 60).toFixed(1) + ',' + (H - 2 - fallK(F, x, EVR) * (H - 6)).toFixed(1)); }
  const dx = Math.min(W, d / mx * W);
  return `<svg class="fc" viewBox="0 0 ${W} ${H + 12}" preserveAspectRatio="none"><polyline points="${pts.join(' ')}" fill="none" stroke="var(--acc)" stroke-width="2"/>
    ${F.m === 'screen' ? `<line x1="${EVR / mx * W}" x2="${EVR / mx * W}" y1="0" y2="${H}" stroke="var(--line2)" stroke-dasharray="3 3"/><text x="${EVR / mx * W + 3}" y="10">screen edge</text>` : ''}
    <line x1="${dx}" x2="${dx}" y1="0" y2="${H}" stroke="var(--blue)"/><text x="0" y="${H + 11}">0</text><text x="${W}" y="${H + 11}" text-anchor="end">${Math.round(mx)} px</text></svg>`;
}

/* ---------- sounds the rules can play ---------- */
function soundNames() { const s = new Set(GAME); for (const p of S.lib) if (!p.P.e) s.add(p.gn); for (const k in gameGet()) if (!(gameGet()[k] || {}).e) s.add(k); return [...s].sort(); }
/* what the game would play for a name, as edited here: sent to the game, else a library preset for it, else the built-in */
function soundFor(nm) { const g = gameGet()[nm]; if (g && !g.e) return g; const p = S.lib.find(q => q.b === nm) || S.lib.find(q => q.gn === nm && !q.P.e); return p ? p.P : SFXD[nm] || null; }
const ruleF = r => Object.assign({}, SEVF, r.F);
function rulePlay(r, T) {
  const a = audio(), v = r.v === undefined ? 1 : r.v;
  if (r.fx === 'deafen') { const E = Object.assign({}, SEVX.deafen, r.E), k = 1 - (T.dist || 0) / ((+T.r || 100) * E.re); if (k > 0.05) deafen(a, Math.min(1, k * v), E); return; }
  const P0 = soundFor(r.s); if (!P0) { toast('"' + r.s + '" has no preset here: the game plays its classic sound'); return; }
  const F = ruleF(r), pos = r.who !== 'pl' && r.who !== 'ui', hv = P0.nd || !pos ? 1 : fallK(F, T.dist || 0, EVR);
  if (hv * v < 0.02) return;
  const P = r.p && r.p !== 1 ? Object.assign({}, P0, { p: (P0.p || 1) * r.p }) : P0;
  const go = () => sfxRun(a, P, sfxOut(a, P, hv, 0, a.sfx, a.verbIn, pos ? F : null), sfxT(a), hv * v);
  if (r.dl > 0) setTimeout(go, r.dl * 1000); else go();
}
const rulePass = (r, T) => !r.off && sevTest(r.if, T) && (r.who !== 'pl' || +T.me === 1);
function evFire() { const T = evTest(); let n = 0; for (const r of evRules()) if (rulePass(r, T)) { rulePlay(r, T); n++; } if (!n) toast('No rule passes with these test values'); }

/* ---------- the page ---------- */
const fieldsTxt = n => Object.entries(evFields(n)).map(([f, s]) => `<div><code>${f}</code> ${esc(s[0])}${s[1] ? ': ' + s[1].join(', ') : ''}</div>`).join('');
function ruleCard(n, r, i, N, T) {
  const p = 'r' + i, pass = rulePass(r, T), names = soundNames(), F = ruleF(r), fx = r.fx === 'deafen';
  const what = `<select data-rs="${i}"><optgroup label="Effects"><option value="fx:deafen"${fx ? ' selected' : ''}>Hearing loss (muffle + ringing)</option></optgroup><optgroup label="Sounds">${names.map(s => `<option value="s:${s}"${!fx && s === r.s ? ' selected' : ''}>${s}</option>`).join('')}${!fx && r.s && !names.includes(r.s) ? `<option value="s:${esc(r.s)}" selected>${esc(r.s)}</option>` : ''}<option value="new">＋ Other name…</option></optgroup></select>`;
  let h = `<div class="card rl${r.off ? ' mute' : ''}"><div class="lh"><input type="checkbox" data-ron="${i}"${r.off ? '' : ' checked'} title="On / off"><b>${i + 1}</b>${what}
    <span class="tag ${pass ? 'g' : ''}" title="With the test values above">${pass ? '✓ plays' : '✗ skips'}</span>
    <button class="btn sm ic" data-ra="play" data-i="${i}" title="Play this rule">▶</button><button class="btn sm ic" data-ra="menu" data-i="${i}" title="Rule actions">⋯</button></div>
    ${r._a ? `<div class="row" style="margin:0 0 6px"><button class="btn sm" data-ra="dup" data-i="${i}">Duplicate</button><button class="btn sm" data-ra="up" data-i="${i}"${i ? '' : ' disabled'}>↑ Up</button><button class="btn sm" data-ra="down" data-i="${i}"${i < N - 1 ? '' : ' disabled'}>↓ Down</button><button class="btn sm" data-ra="del" data-i="${i}">Delete</button></div>` : ''}
    <div class="grp">When</div>${r.if ? condUI(n, i, r.if, '', 0) : '<div class="muted" style="padding:2px">Always (every time the event happens)</div>'}
    <div class="row" style="margin:4px 0 2px">${!r.if ? `<button class="btn sm" data-ca="root" data-ri="${i}">＋ Condition</button><button class="btn sm" data-ca="rootG" data-ri="${i}">＋ Group</button>` : !r.if.g ? `<button class="btn sm" data-ca="wrap" data-ri="${i}">Combine with more (AND / OR)</button>` : ''}</div>`;
  if (fx) {
    h += ctl(p, 'v', ['Strength', 0, 2, 0, '×'], r.v === undefined ? 1 : r.v) + ctl(p, 'dl', RS.dl, r.dl || 0);
    h += `<details${r._oc ? '' : ' open'} data-eo="${i}:_oc"><summary>Hearing loss</summary><p class="muted" style="margin:0 0 4px">A local player within reach × the blast radius (field <code>r</code>, else 100 px) is deafened; closer = stronger and longer.</p>${Object.keys(DS).map(k => ctl('D' + i, k, DS[k], (r.E || {})[k] !== undefined ? r.E[k] : SEVX.deafen[k])).join('')}</details>`;
  } else {
    h += `<div class="sl"><label>Who hears it</label><select data-rw="${i}">${WHO.map(([k, t]) => `<option value="${k}"${(r.who || '') === k ? ' selected' : ''}>${t}</option>`).join('')}</select></div>`;
    h += ['v', 'p', 'dl', 'th'].map(k => ctl(p, k, RS[k], r[k] !== undefined ? r[k] : k === 'v' || k === 'p' ? 1 : 0)).join('');
    if (!r.who) h += `<details${r._of ? ' open' : ''} data-eo="${i}:_of"><summary>Distance falloff${r.F ? ' · custom' : ''}</summary>
      <div class="sl"><label><input type="checkbox" data-rf="${i}"${r.F ? ' checked' : ''}>Custom</label><span class="muted" style="grid-column:2/4">${r.F ? '' : 'Off: the game\'s default (screen)'}</span></div>
      ${r.F ? ctl('F' + i, 'm', FS.m, F.m) + FM[F.m].concat(['mu', 'rd']).map(k => ctl('F' + i, k, FS[k], F[k])).join('') + ctl('F' + i, 'pan', FS.pan, F.pan) : ''}${curveSVG(F, T.dist || 0)}</details>`;
  }
  return h + '</div>';
}
function renderEv() {
  evInit();
  const n = evName(), D = EVD[n], R = evRules(), T = evTest(), game = sgGet(), groups = [...new Set(EVLIST.map(e => EVD[e][0]))];
  const ed = EVLIST.filter(evEdited).length;
  $('#stats').textContent = EVLIST.length + ' events · ' + ed + ' edited · ' + Object.keys(game).length + ' in game';
  let h = `<div class="card"><div class="row"><select id="evpick">${groups.map(g => `<optgroup label="${g}">${EVLIST.filter(e => EVD[e][0] === g).map(e => `<option value="${e}"${e === n ? ' selected' : ''}>${e}${evEdited(e) ? ' •' : ''}</option>`).join('')}</optgroup>`).join('')}</select></div>
    <p style="margin:8px 0 4px">${esc(D[1])}</p>
    <div class="row">${D[3].includes('n') ? '<span class="tag" title="Only the host sees it happen; it is sent on to the other players">sent to all players</span>' : ''}${evEdited(n) ? '<span class="tag">edited</span>' : ''}${evInGame(n) && game[n] ? '<span class="tag g">in game</span>' : ''}</div>
    <details${S._ef ? ' open' : ''} data-eo="f"><summary>Fields a condition can test</summary><div class="flds">${fieldsTxt(n)}</div></details></div>
  <div class="card"><h2>Test values<span class="sp"></span></h2><p class="muted" style="margin:0 0 4px">Pretend the event happened like this: ▶ TEST plays every rule that passes.</p>
    ${Object.entries(evFields(n)).filter(([f]) => f !== 'dist').map(([f, s]) => { const o = fOpts(s); return `<div class="sl"><label title="${esc(s[0])}">${f}</label>${o ? `<select data-tv="${f}">${o.map(x => `<option${String(x) === String(T[f]) ? ' selected' : ''}>${x}</option>`).join('')}</select>` : `<input type="text" data-tv="${f}" value="${esc(T[f])}" style="grid-column:2/4">`}</div>`; }).join('')}
    ${ctl('T', 'dist', TD, T.dist || 0)}</div>`;
  h += R.map((r, i) => ruleCard(n, r, i, R.length, T)).join('') || '<div class="card muted">No rules: this event is silent.</div>';
  h += `<div class="row" style="margin:10px 0"><span class="muted">Add</span><button class="btn sm" data-ra="addS">＋ Sound</button><button class="btn sm" data-ra="addD">＋ Hearing loss</button></div>`;
  h += `<div class="card"><h2>Export<span class="sp"></span></h2><textarea id="evcode" rows="3" readonly>${esc(evCode(n))}</textarea>
    <div class="row" style="margin-top:8px"><button class="btn sm" data-ra="send">Send to game</button>${game[n] ? '<button class="btn sm" data-ra="unsend">Remove from game</button>' : ''}<button class="btn sm" data-ra="copy">Copy</button><button class="btn sm" data-ra="revert"${evEdited(n) ? '' : ' disabled'}>Revert to default</button></div>
    <div class="row" style="margin-top:8px"><button class="btn sm" data-ra="sendall">Send all edited</button><button class="btn sm" data-ra="exportall">Export all edited</button><button class="btn sm" data-ra="clearall"${Object.keys(game).length ? '' : ' disabled'}>Remove all from game</button></div>
    <p class="muted" style="margin:8px 0 0"><b>Send to game</b> makes the game (this browser, same site) use these rules right away. To make them permanent for everyone, paste the line into <code>SEVD</code> in <code>src/1d_sev.js</code> (or send it to Claude). A sound name with no preset in the game plays nothing until you send one for it from the Sounds tab.</p></div>`;
  $('#main').innerHTML = h;
}
const evCode = n => "'" + n + "': " + lit(strip(evRules())) + ',';

/* ---------- editing ---------- */
const evObj = p => { const R = evRules(true); if (p === 'T') return evTest(); const r = R[+p.slice(1)]; if (p[0] === 'r') return r; if (p[0] === 'F') return r.F = r.F || {}; return r.E = r.E || {}; };
const evSpec = (p, k) => p === 'T' ? TD : p[0] === 'F' ? FS[k] : p[0] === 'D' ? DS[k] : k === 'v' && evRules()[+p.slice(1)].fx ? ['Strength', 0, 2, 0, '×'] : RS[k];
function evSetVal(el, v, live) {
  const p = el.dataset.p, k = el.dataset.k, s = evSpec(p, k); evObj(p)[k] = v;
  const row = el.closest('.sl'), r = row && row.querySelector('input[type=range]'), t = row && row.querySelector('.val');
  if (r && el !== r && typeof v === 'number') r.value = toPos(v, s);
  if (t && el !== t && typeof v === 'number') t.value = (s[5] ? Math.round(v) : fmt(v)) + (s[4] ? ' ' + s[4] : '');
  if (!live) { if (p === 'T' || p[0] === 'F') renderEv(); else $('#evcode').value = evCode(evName()); }
  else if (p === 'T' || p[0] === 'F') { const card = p === 'T' ? null : el.closest('.rl'), svgs = card ? [card.querySelector('svg.fc')] : [...document.querySelectorAll('svg.fc')]; const R = evRules(); svgs.forEach((g, j) => { if (!g) return; const i = card ? +p.slice(1) : +g.closest('.rl').querySelector('[data-ron]').dataset.ron; g.outerHTML = curveSVG(ruleF(R[i]), evTest().dist || 0); }); }
}
function evInput(e) { const el = e.target; if (el.dataset.k && el.type === 'range') evSetVal(el, fromPos(+el.value, evSpec(el.dataset.p, el.dataset.k)), true); }
function evChange(e) {
  const el = e.target, d = el.dataset, n = evName();
  if (el.id === 'evpick') { S.ev.cur = el.value; renderEv(); commit(); return; }
  if (d.tv !== undefined) { evTest()[d.tv] = num(el.value); renderEv(); save(); return; }
  if (d.ron !== undefined) { const r = evRules(true)[+d.ron]; if (el.checked) delete r.off; else r.off = 1; renderEv(); commit(); return; }
  if (d.rw !== undefined) { const r = evRules(true)[+d.rw]; if (el.value) r.who = el.value; else delete r.who; renderEv(); commit(); return; }
  if (d.rf !== undefined) { const r = evRules(true)[+d.rf]; if (el.checked) r.F = {}; else delete r.F; r._of = 1; renderEv(); commit(); return; }
  if (d.rs !== undefined) {
    const r = evRules(true)[+d.rs]; let v = el.value;
    if (v === 'new') { const nm = (prompt('Sound name (make a preset that plays as it in the Sounds tab)') || '').trim().replace(/[^\w.-]/g, ''); if (!nm) { renderEv(); return; } v = 's:' + nm; }
    if (v === 'fx:deafen') { r.fx = 'deafen'; delete r.s; delete r.who; delete r.F; } else { delete r.fx; delete r.E; r.s = v.slice(2); }
    renderEv(); commit(); return;
  }
  if (d.ri !== undefined && d.c !== undefined) {
    const r = evRules(true)[+d.ri], C = cAt(r, d.c);
    if (d.cg !== undefined) C.g = el.value;
    else if (d.cf !== undefined) { const t = newTest(n); C.f = el.value; const o = fOpts(evFields(n)[C.f] || []); C.v = o ? o[0] : C.f === 'dist' ? 300 : 0; C.op = C.f === 'dist' ? '<' : '=='; void t; }
    else if (d.co !== undefined) { C.op = el.value; if (C.op === 'in' && !Array.isArray(C.v)) C.v = [C.v]; else if (C.op !== 'in' && Array.isArray(C.v)) C.v = C.v[0]; }
    else if (d.cv !== undefined) C.v = C.op === 'in' ? el.value.split(',').map(s => num(s.trim())).filter(s => s !== '') : num(el.value);
    renderEv(); commit(); return;
  }
  if (!d.k) return;
  const s = evSpec(d.p, d.k);
  if (el.type === 'checkbox') evSetVal(el, el.checked ? 1 : 0);
  else if (el.tagName === 'SELECT') evSetVal(el, el.value);
  else if (el.type === 'range') evSetVal(el, fromPos(+el.value, s));
  else { const v = parseFloat(el.value) * (/\dk/i.test(el.value) ? 1000 : 1); if (!isFinite(v)) { renderEv(); return; } evSetVal(el, s[5] ? Math.round(v) : r4(v)); }
  if (d.p === 'T') save(); else commit();
}
function evClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset, n = evName();
  if (d.ca) {
    const r = evRules(true)[+d.ri];
    if (d.ca === 'root') r.if = newTest(n);
    else if (d.ca === 'rootG') r.if = { g: 'and', c: [newTest(n)] };
    else if (d.ca === 'wrap') r.if = { g: 'and', c: [r.if, newTest(n)] };
    else { const C = cAt(r, d.c); if (d.ca === 'not') { if (C.n) delete C.n; else C.n = 1; } else if (d.ca === 'del') cPut(r, d.c, undefined); else if (d.ca === 'addT') C.c.push(newTest(n)); else if (d.ca === 'addG') C.c.push({ g: C.g === 'and' ? 'or' : 'and', c: [newTest(n)] }); }
    renderEv(); commit(); return;
  }
  if (!d.ra) return;
  const i = +d.i, T = evTest();
  switch (d.ra) {
    case 'play': { const r = evRules()[i]; if (r.fx) { rulePlay(r, T); const nx = evRules().find(q => !q.fx && q.s); if (nx) rulePlay(Object.assign({}, nx, { dl: 0.05 }), T); } else rulePlay(Object.assign({}, r, { dl: 0 }), T); return; }
    case 'menu': { const r = evRules(true)[i]; r._a = !r._a; renderEv(); save(); return; }
    case 'dup': { const R = evRules(true); R.splice(i + 1, 0, Object.assign(clone(R[i]), { _a: 0 })); break; }
    case 'up': { const R = evRules(true); R.splice(i - 1, 0, R.splice(i, 1)[0]); break; }
    case 'down': { const R = evRules(true); R.splice(i + 1, 0, R.splice(i, 1)[0]); break; }
    case 'del': evRules(true).splice(i, 1); break;
    case 'addS': evRules(true).push({ s: (evRules().find(r => r.s) || { s: 'ui' }).s }); break;
    case 'addD': evRules(true).push({ fx: "deafen" }); break;
    case 'revert': if (!confirm('Put ' + n + ' back to the game\'s default rules?')) return; delete S.ev.R[n]; break;
    case 'copy': return copy(evCode(n));
    case 'send': { const g = sgGet(); g[n] = strip(evRules()); sgSet(g); renderEv(); toast('The game now uses these rules for ' + n); return; }
    case 'unsend': { const g = sgGet(); delete g[n]; sgSet(g); renderEv(); toast('Removed: the game uses its default rules for ' + n); return; }
    case 'sendall': { const g = sgGet(), L = EVLIST.filter(evEdited); for (const e of L) g[e] = strip(S.ev.R[e]); sgSet(g); renderEv(); toast(L.length + ' events sent to the game'); return; }
    case 'exportall': { const L = EVLIST.filter(evEdited); dlg('Edited events, ready for the game', L.length ? 'Paste into SEVD in src/1d_sev.js (replacing those events), or send to Claude.' : 'Nothing differs from the defaults yet.', L.map(e => "'" + e + "': " + lit(strip(S.ev.R[e])) + ',').join('\n')); return; }
    case 'clearall': sgSet({}); renderEv(); toast('The game uses its default rules again'); return;
    default: return;
  }
  renderEv(); commit();
}
function evToggle(e) { const o = e.target.dataset && e.target.dataset.eo; if (!o) return; if (o === 'f') S._ef = e.target.open; else { const [i, k] = o.split(":"), r = evRules()[+i]; if (r) r[k] = k === "_oc" ? !e.target.open : e.target.open; } save(); }
/* the Sounds tab's "Plays when": every event rule that plays this sound */
function playsWhen(gn) {
  evInit(); const out = [];
  for (const e of EVLIST) for (const r of S.ev.R[e] || SEVD[e] || []) if (!r.off && r.s === gn) out.push([e, (r.who === 'pl' ? 'Only that player: ' : '') + EVD[e][1] + (r.if ? ' — when ' + condTxt(r.if) : '') + (r.v !== undefined && r.v !== 1 ? ' (' + Math.round(r.v * 100) + '% volume)' : '')]);
  return out;
}
