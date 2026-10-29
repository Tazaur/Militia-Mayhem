/* =====================================================================
   RECORDER (settings › PERFORMANCE › RECORDER): a log of everything that happens while you play, on the device itself, to see
   what eats the frame. While it runs:
   - every game function is wrapped (the top-level ones: const helpers count in their caller): its calls, its time with what it
     called (incl) and without (self). One called over 1000 times a frame is let go after the first 2 s (wrapping it would
     cost more than it does): its calls a frame are what they were then, its time goes to its caller from then on
   - every frame: its time, the update / draw split, how many soldiers / vehicles / shots / particles, the GL draws, bytes
     uploaded, texture uploads, framebuffer switches, GPU syncs (readPixels, getError, query reads), canvas 2D calls
   - per second: each function's time and calls, each GL / canvas method's calls, the GPU stage timers (FPS COUNTER › GPU STAGES on, where the browser has them), the JS heap
   - the slowest frames whole: every function in them
   - events on the same clock: every sound (each shot, hit, blast, pickup plays one), kills, spawns, blasts, vehicles in and
     out, state changes, errors, browser long tasks
   Off: saved in this browser (IndexedDB mm-rec, the newest 5) and shared / downloaded as JSON; perf/ opens them.
   ===================================================================== */
const REC = { on: false, t0: 0, S: new Map(), L: [], st: [], fr: null, sec: [], worst: [], ev: [], lastS: 0, n: 0, wrapped: new Map(), proto: [], obs: null, cnt: null, pc: {}, note: '' };
const REC_MAX = 10 * 60e3;     // ms: a recording stops (and saves) by itself after this
const REC_EVENTS = new Set(['sfx', 'explosion', 'destroyVehicle', 'destroyStatic', 'enterVehicle', 'exitVehicle', 'kill', 'spawnSoldier', 'newMatch', 'setState', 'throwNade', 'fireCannon', 'fireRocket', 'pickupCrate', 'toast']);
const REC_COLS = ['t', 'dt', 'upd', 'draw', 'sol', 'veh', 'proj', 'parts', 'wrecks', 'glDraw', 'glKB', 'glTex', 'glFB', 'glSync', 'c2d', 'calls'];
const recNow = () => performance.now() - REC.t0;
/* one function's wrapper: counts (n, t incl, s self; f* this frame; hot: count only) */
function recWrap(k, f) {
  const s = { k, n: 0, t: 0, s: 0, fn: 0, ft: 0, fs: 0, ln: 0, lt: 0, ls: 0, hot: 0, ev: REC_EVENTS.has(k) };     // hot: let go, its calls a frame then
  REC.S.set(k, s); const ST = REC.st, L = REC.L;
  const w = function (...a) {
    s.n++; if (!s.fn++) L.push(s);
    if (s.ev) recEvent(s.k, a);
    const t0 = performance.now(); ST.push(0);
    try { return new.target ? Reflect.construct(f, a, new.target) : f.apply(this, a); }
    finally { const d = performance.now() - t0, c = ST.pop(); s.t += d; s.s += d - c; s.ft += d; s.fs += d - c; if (ST.length) ST[ST.length - 1] += d; }
  };
  Object.assign(w, f); w.__rec = f; return w;
}
function recEvent(k, a) {
  if (REC.ev.length > 60000) return; const x = [];
  for (const v of a) { if (typeof v === 'string') x.push(v.slice(0, 40)); else if (typeof v === 'number') x.push(Math.round(v * 10) / 10); else if (v && typeof v === 'object' && v.name) x.push(String(v.name).slice(0, 24)); if (x.length >= 3) break; }
  REC.ev.push([Math.round(recNow()), k, ...x]);
}
/* GL / canvas calls, counted on the prototypes (every context) */
function recProto() {
  const C = REC.cnt = { glDraw: 0, glB: 0, glTex: 0, glFB: 0, glSync: 0, c2d: 0 }, pc = REC.pc = {};
  const hook = (P, ks, f) => { if (P) for (const k of ks) { const o = P[k]; if (typeof o !== 'function') continue; pc[k] = 0; P[k] = function (...a) { pc[k]++; f(k, a); return o.apply(this, a); }; REC.proto.push([P, k, o]); } };
  const G = typeof WebGL2RenderingContext !== 'undefined' && WebGL2RenderingContext.prototype;
  hook(G, ['drawElements', 'drawArrays', 'drawArraysInstanced', 'drawElementsInstanced'], () => C.glDraw++);
  hook(G, ['bufferData', 'bufferSubData'], (k, a) => { const d = a[1]; C.glB += d && d.byteLength ? d.byteLength : typeof d === 'number' ? d : 0; });
  hook(G, ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'copyTexSubImage2D'], () => C.glTex++);
  hook(G, ['bindFramebuffer'], () => C.glFB++); hook(G, ['useProgram', 'bindTexture', 'uniform1f', 'uniform2f', 'uniform3f', 'uniform4f', 'uniform1i', 'uniformMatrix4fv', 'viewport', 'scissor', 'enable', 'disable', 'blendFunc', 'blendFuncSeparate', 'clear', 'vertexAttribPointer', 'bindBuffer', 'bindVertexArray'], () => { });
  hook(G, ['readPixels', 'getError', 'getQueryParameter', 'getParameter', 'clientWaitSync', 'finish'], () => C.glSync++);
  const D = typeof CanvasRenderingContext2D !== 'undefined' && CanvasRenderingContext2D.prototype;
  hook(D, ['drawImage', 'fill', 'stroke', 'fillRect', 'fillText', 'strokeText', 'clearRect', 'getImageData', 'putImageData', 'createRadialGradient', 'createLinearGradient', 'createPattern'], () => C.c2d++);
}
function recStart() {
  if (REC.on || typeof window === 'undefined') return;
  Object.assign(REC, { on: true, t0: performance.now(), S: new Map(), L: [], st: [], sec: [], worst: [], ev: [], lastS: 0, n: 0, wrapped: new Map(), proto: [], note: '' });
  REC.fr = Object.fromEntries(REC_COLS.map(c => [c, []]));
  for (const k of Object.keys(window)) {
    if (k.startsWith('rec') || k === 'frame' || k === 'devTime' || k === 'drawRec') continue; let f; try { f = window[k]; } catch (e) { continue; }
    if (typeof f !== 'function' || f.__rec || /\{\s*\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(f))) continue;
    const w = recWrap(k, f); try { window[k] = w; if (window[k] === w) REC.wrapped.set(k, f); } catch (e) { }
  }
  recProto();
  try { REC.obs = new PerformanceObserver(l => { for (const e of l.getEntries()) REC.ev.push([Math.round(e.startTime - REC.t0), 'longtask', Math.round(e.duration)]); }); REC.obs.observe({ type: 'longtask', buffered: false }); } catch (e) { REC.obs = null; }
  REC.onErr = e => REC.ev.push([Math.round(recNow()), 'error', String(e.message || e.reason || e).slice(0, 120)]); addEventListener('error', REC.onErr); addEventListener('unhandledrejection', REC.onErr);
  REC.ev.push([0, 'start', state, M ? M.mode : '']);
}
/* each frame (devTime): its row; each second: the functions' time */
function recFrame(dt, um, rm) {
  if (!REC.on) return; const t = recNow(), F = REC.fr, C = REC.cnt, L = REC.L, ms = dt * 1000;
  let calls = 0; for (const s of L) calls += s.fn;
  const row = [Math.round(t), ms, um, rm, M ? M.sol.filter(s => s.alive).length : 0, M ? M.vehicles.length : 0, M ? M.proj.length : 0, M ? M.parts.length : 0, M ? M.wrecks.length : 0, C.glDraw, C.glB / 1024, C.glTex, C.glFB, C.glSync, C.c2d, calls];
  REC_COLS.forEach((c, i) => F[c].push(Math.round(row[i] * 100) / 100)); REC.n++;
  // the slowest frames, whole
  const W = REC.worst; if (W.length < 40 || ms > W[W.length - 1].dt) {
    W.push({ t: Math.round(t), dt: Math.round(ms * 10) / 10, upd: Math.round(um * 10) / 10, draw: Math.round(rm * 10) / 10, cnt: row.slice(4), fns: L.filter(s => s.fs > 0.05 || s.fn > 50).sort((a, b) => b.fs - a.fs).slice(0, 40).map(s => [s.k, Math.round(s.fs * 100) / 100, Math.round(s.ft * 100) / 100, s.fn]) });
    W.sort((a, b) => b.dt - a.dt); if (W.length > 40) W.pop();
  }
  for (const s of L) { s.fn = s.ft = s.fs = 0; } L.length = 0; for (const k in C) C[k] = 0;
  if (t - REC.lastS >= 1000) recSecond(t);
  if (t > REC_MAX) { REC.note = 'stopped at the ' + REC_MAX / 60e3 + ' min limit'; recStop(); }
}
function recSecond(t) {
  const fr = REC.n - (REC.sec.length ? REC.sec[REC.sec.length - 1].n1 : 0), f = [];
  for (const s of REC.S.values()) {
    const n = s.n - s.ln; if (!n) continue; f.push([s.k, Math.round((s.s - s.ls) * 100) / 100, Math.round((s.t - s.lt) * 100) / 100, n]); s.ln = s.n; s.lt = s.t; s.ls = s.s;
    if (!s.hot && REC.sec.length >= 1 && fr > 0 && n / fr > 1000 && REC.wrapped.has(s.k)) { s.hot = Math.round(n / fr); window[s.k] = REC.wrapped.get(s.k); REC.wrapped.delete(s.k); REC.ev.push([Math.round(t), 'rec', 'let go: ' + s.k + ' (' + s.hot + ' calls a frame)']); }
  }
  const pc = {}; for (const k in REC.pc) if (REC.pc[k]) { pc[k] = REC.pc[k]; REC.pc[k] = 0; }
  const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null;
  REC.sec.push({ t: Math.round(t), n1: REC.n, frames: fr, f, pc, gpu: typeof GPUP !== 'undefined' && GPUP.X ? GPUP.out.map(([k, v]) => [k, Math.round(v * 100) / 100]) : null, mem, st: state });
  REC.lastS = t;
}
function recStop() {
  if (!REC.on) return; REC.on = false;
  for (const [k, f] of REC.wrapped) window[k] = f; for (const [P, k, o] of REC.proto) P[k] = o; REC.wrapped = new Map(); REC.proto = [];
  if (REC.obs) REC.obs.disconnect(); removeEventListener('error', REC.onErr); removeEventListener('unhandledrejection', REC.onErr);
  recSecond(recNow()); REC.ev.push([Math.round(recNow()), 'stop']);
  const R = recReport(); recSave(R); return R;
}
function recReport() {
  let gpu = ''; try { const g = GL || document.createElement('canvas').getContext('webgl2'), x = g && g.getExtension('WEBGL_debug_renderer_info'); gpu = x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { }
  const fns = [...REC.S.values()].filter(s => s.n).map(s => [s.k, Math.round(s.s * 10) / 10, Math.round(s.t * 10) / 10, s.n, s.hot]).sort((a, b) => b[1] - a[1]);
  return { v: 1, build: VERSION.build, date: new Date().toISOString(), ms: Math.round(recNow()), note: REC.note,
    dev: { ua: navigator.userAgent, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, cv: [cv.width, cv.height], gl: !!GL, gpu, cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0 },
    cfg: { ...CFG }, cols: REC_COLS, frames: REC.fr, sec: REC.sec, worst: REC.worst, fns, ev: REC.ev };
}
/* kept in this browser (perf/ lists them) and handed to the share sheet, else downloaded */
function recDB() { return new Promise((ok, no) => { const r = indexedDB.open('mm-rec', 1); r.onupgradeneeded = () => r.result.createObjectStore('recs', { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); }
async function recSave(R) {
  const name = `mm-rec-b${R.build}-${R.date.slice(0, 19).replace(/[:T]/g, '-')}.json`, txt = JSON.stringify(R);
  try {
    const db = await recDB(), tx = db.transaction('recs', 'readwrite'), os = tx.objectStore('recs'); os.put({ id: R.date, name, txt });
    const keys = await new Promise(ok => { const q = os.getAllKeys(); q.onsuccess = () => ok(q.result); }); keys.sort(); for (const k of keys.slice(0, Math.max(0, keys.length - 5))) os.delete(k);
  } catch (e) { }
  const file = typeof File !== 'undefined' ? new File([txt], name, { type: 'application/json' }) : null;
  try { if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Militia Mayhem recording' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
/* while recording: a red dot and the time, top left */
function drawRec() {
  if (!REC.on) return; screenT(); const u = uiU(), s = Math.floor(recNow() / 1000), x = SAFE.l + 12 * u, y = SAFE.t + 12 * u;
  ctx.fillStyle = (s & 1) ? '#ff3b30' : '#b3261e'; ctx.beginPath(); ctx.arc(x + 5 * u, y + 6 * u, 5 * u, 0, Math.PI * 2); ctx.fill();
  txt(`REC ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, x + 14 * u, y, fpx(11, u, 10), '#ff6b5e', 'left', 'top', FD);
}
