/* =====================================================================
   GX: THE 2D CANVAS ON WEBGL2. One context draws the world, its layers (GL surfaces, mkG) and the light; the
   2D canvas (#c) keeps the HUD and menus, over it. ?2d in the address, or no WebGL2: the 2D path, as it was
   ===================================================================== */
let GL = null, GLC = null;     // the context and its canvas (#g, under #c); null: everything 2D
(() => {
  if (typeof WebGL2RenderingContext === 'undefined' || typeof document === 'undefined' || /[?&]2d\b/.test(location.search)) return;
  try {
    const c = document.createElement('canvas'); c.id = 'g';
    const g = c.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!g) return;
    const c0 = document.getElementById('c'); c0.parentNode.insertBefore(c, c0); GL = g; GLC = c;
  } catch (e) { GL = null; }
})();
/* a 2D canvas's drawing bumps its _gv, so GX uploads it again only after it changed */
if (GL) {
  const P = CanvasRenderingContext2D.prototype;
  for (const n of ['fillRect', 'strokeRect', 'clearRect', 'fill', 'stroke', 'drawImage', 'putImageData', 'fillText', 'strokeText', 'reset']) {
    const f = P[n]; if (!f) continue;
    P[n] = n === 'drawImage' ? function (s) { if (s instanceof GSurf) { gxWarn('2D drawImage of a GL surface'); return; } this.canvas._gv = (this.canvas._gv || 0) + 1; return f.apply(this, arguments); }
      : function () { this.canvas._gv = (this.canvas._gv || 0) + 1; return f.apply(this, arguments); };
  }
  const H = HTMLCanvasElement.prototype;
  for (const n of ['width', 'height']) { const d = Object.getOwnPropertyDescriptor(H, n); Object.defineProperty(H, n, { get: d.get, set(v) { this._gv = (this._gv || 0) + 1; d.set.call(this, v); }, configurable: true, enumerable: true }); }
}
const GXW = new Set();
function gxWarn(m) { if (GXW.has(m)) return; GXW.add(m); console.warn('GX: ' + m); }
/* a recording Path2D: still a real one (2D contexts take it), and GX replays what was added */
if (GL) {
  const N = Path2D;
  window.Path2D = class extends N {
    constructor(p) { super(p); this._c = p && p._c ? p._c.slice() : []; if (typeof p === 'string') gxWarn('Path2D from SVG'); }
  };
  for (const n of ['moveTo', 'lineTo', 'closePath', 'rect', 'roundRect', 'arc', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'arcTo']) {
    const f = N.prototype[n]; if (!f) continue;
    Path2D.prototype[n] = function (...a) { this._c.push(n, a); return f.apply(this, a); };
  }
  Path2D.prototype.addPath = function (p) { if (p._c) for (const v of p._c) this._c.push(v); return N.prototype.addPath.call(this, p); };
}
/* ---------------- surfaces ---------------- */
class GSurf {
  constructor(w, h, scr) { this._w = Math.max(1, w | 0); this._h = Math.max(1, h | 0); this.scr = !!scr; this.tex = null; this.fb = null; this.sb = null; this._x = null; this.stK = 0; this.style = {}; if (!scr) this._alloc(); }
  get width() { return this._w; }
  set width(v) { this._w = Math.max(1, v | 0); this._alloc(); }
  get height() { return this._h; }
  set height(v) { this._h = Math.max(1, v | 0); this._alloc(); }
  getContext() { return this._x || (this._x = new GX(this)); }
  _alloc() {     // (re)sized: cleared, its state reset, as a canvas does
    if (this.scr) return; const g = GL; gxFlushIf(this);
    if (!this.tex) { this.tex = g.createTexture(); this.fb = g.createFramebuffer(); }
    g.activeTexture(g.TEXTURE15); g.bindTexture(g.TEXTURE_2D, this.tex); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, this._w, this._h, 0, g.RGBA, g.UNSIGNED_BYTE, null); g.activeTexture(g.TEXTURE0); GXB.dst = null;
    g.bindFramebuffer(g.FRAMEBUFFER, this.fb); g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, this.tex, 0);
    if (this.sb) { g.bindRenderbuffer(g.RENDERBUFFER, this.sb); g.renderbufferStorage(g.RENDERBUFFER, g.DEPTH24_STENCIL8, this._w, this._h); }
    GXB.fbo = undefined; this.stK = 0; if (this._x) this._x._reset();
  }
  _stencil() {
    if (this.scr || this.sb) return; const g = GL; this.sb = g.createRenderbuffer();
    g.bindRenderbuffer(g.RENDERBUFFER, this.sb); g.renderbufferStorage(g.RENDERBUFFER, g.DEPTH24_STENCIL8, this._w, this._h);
    g.bindFramebuffer(g.FRAMEBUFFER, this.fb); g.framebufferRenderbuffer(g.FRAMEBUFFER, g.DEPTH_STENCIL_ATTACHMENT, g.RENDERBUFFER, this.sb); GXB.fbo = undefined;
    const p = GXB.sc; g.disable(g.SCISSOR_TEST); g.clearStencil(0); g.stencilMask(0xff); g.clear(g.STENCIL_BUFFER_BIT); g.enable(g.SCISSOR_TEST); g.scissor(p[0], p[1], p[2], p[3]);
  }
  get gw() { return this.scr ? GLC.width : this._w; }
  get gh() { return this.scr ? GLC.height : this._h; }
}
/* a canvas for a layer the world draws from: a GL surface when GL is on */
function mkG(w, h) { return GL ? new GSurf(w, h) : mk(w, h); }
const GLSCR = GL ? new GSurf(1, 1, true) : null;     // the screen (#g's own buffer)
/* ---------------- colours ---------------- */
const GXCOL = new Map(); let GXPC = null;
function gxColor(s) {
  let c = GXCOL.get(s); if (c) return c; let m;
  if (typeof s !== 'string') c = [0, 0, 0, 1];
  else if (s[0] === '#') {
    const h = s.slice(1), x = h.length <= 4 ? [...h].map(v => parseInt(v + v, 16)) : h.match(/../g).map(v => parseInt(v, 16));
    c = [x[0] / 255, x[1] / 255, x[2] / 255, x.length > 3 ? x[3] / 255 : 1];
  } else if ((m = /^rgba?\(\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)(?:\s*[,/]\s*([-\d.]+)(%?))?\s*\)$/.exec(s))) {
    const a = m[4] === undefined ? 1 : +m[4] / (m[5] ? 100 : 1);
    c = [Math.min(255, Math.max(0, +m[1])) / 255, Math.min(255, Math.max(0, +m[2])) / 255, Math.min(255, Math.max(0, +m[3])) / 255, Math.min(1, Math.max(0, a))];
  } else if (s === 'transparent') c = [0, 0, 0, 0];
  else {
    if (!GXPC) GXPC = document.createElement('canvas').getContext('2d');
    GXPC.fillStyle = '#000'; GXPC.fillStyle = s; const v = GXPC.fillStyle; c = v === s ? [0, 0, 0, 1] : gxColor(v);
  }
  if (GXCOL.size > 4096) GXCOL.clear(); GXCOL.set(s, c); return c;
}
const gxPack = (r, g, b, a) => ((Math.round(r * a * 255)) | (Math.round(g * a * 255) << 8) | (Math.round(b * a * 255) << 16) | (Math.round(a * 255) << 24)) >>> 0;
class GXGrad {
  constructor(t, a) { this.t = t; this.a = a; this.s = []; this.row = -1; this.ep = -1; }
  addColorStop(o, c) { this.s.push([Math.min(1, Math.max(0, +o)), gxColor(c)]); this.row = -1; }
}
class GXPat { constructor(img, rep) { this.img = img; this.rep = rep; } setTransform() { gxWarn('pattern transform'); } }
/* ---------------- the batch ---------------- */
const GXB = { cap: 0, F: null, U: null, I: null, icap: 0, nv: 0, ni: 0, tgt: null, bl: 0, st: 0, sc: [0, 0, 1, 1], slots: [], ok: false, fbo: undefined, prog: null, bb: [0, 0, 0, 0], dst: null, mask: null, cm: null };
const GXP = { k: 0, mode: 0, slot: 0, col: 0, gr: 0, r0: 0, ia: 1, ib: 0, ic: 0, id: 1, ie: 0, if: 0, x0: 0, y0: 0, dx: 0, dy: 0, ir: 1, pw: 1, ph: 1 };
let GXR = null, GXK = 0, GXFR = 0;
/* blend modes: [src rgb, dst rgb, src a, dst a]; u: unbounded (cleared outside the shape), m: multiply (two passes; one onto
   an opaque target: the screen, or a surface marked opq, as FOG_OUT), x: a dst-read shader mode */
const GXBM = {};
function gxModes() {
  const g = GL, O = g.ONE, Z = g.ZERO, SA = g.SRC_ALPHA, ISA = g.ONE_MINUS_SRC_ALPHA, DA = g.DST_ALPHA, IDA = g.ONE_MINUS_DST_ALPHA;
  const B = (n, f, o) => { GXBM[n] = Object.assign({ f, i: Object.keys(GXBM).length + 1 }, o); };
  B('source-over', [O, ISA, O, ISA]); B('lighter', [O, O, O, O]); B('destination-out', [Z, ISA, Z, ISA]); B('source-atop', [DA, ISA, Z, O]);
  B('destination-over', [IDA, O, IDA, O]); B('xor', [IDA, ISA, IDA, ISA]); B('multiply', [g.DST_COLOR, ISA, Z, O], { m: [IDA, O, IDA, O] });
  B('source-in', [DA, Z, DA, Z], { u: 1 }); B('destination-in', [Z, SA, Z, SA], { u: 1 }); B('source-out', [IDA, Z, IDA, Z], { u: 1 }); B('destination-atop', [IDA, SA, IDA, SA], { u: 1 }); B('copy', [O, Z, O, Z], { u: 1 });
  B('clear', [Z, Z, Z, Z]); B('none', [O, Z, O, Z]);
  ['color-dodge', 'saturation', 'screen', 'overlay', 'darken', 'lighten', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'color', 'luminosity'].forEach((n, i) => B(n, [O, Z, O, Z], { x: i + 1 }));
}
const GXVS = `#version 300 es
layout(location = 0) in vec2 aP; layout(location = 1) in vec2 aT; layout(location = 2) in vec4 aC; layout(location = 3) in vec4 aX;
uniform vec2 uS; out vec2 vT; out vec4 vC; flat out vec4 vX;
void main() { vT = aT; vC = aC; vX = aX; gl_Position = vec4(aP.x / uS.x * 2. - 1., 1. - aP.y / uS.y * 2., 0., 1.); }`;
const GXFS = x => `#version 300 es
precision highp float;
uniform sampler2D T0, T1, T2, T3, T4, T5, GR${x ? ', D; uniform vec4 uD; uniform float uM' : ''};
in vec2 vT; in vec4 vC; flat in vec4 vX; out vec4 o;
vec4 tsl(float s, vec2 t) { if (s < 0.5) return texture(T0, t); if (s < 1.5) return texture(T1, t); if (s < 2.5) return texture(T2, t); if (s < 3.5) return texture(T3, t); if (s < 4.5) return texture(T4, t); return texture(T5, t); }     // slot s
vec4 src() {
  float m = vX.x;
  if (m < 0.5) return vC;
  if (m < 1.5) return tsl(vX.y, vT) * vC;
  if (m > 3.5) { vec4 c = tsl(vX.y, vT); for (int i = 1; i < 6; i++) { if (float(i) >= vX.z) break; vec4 d = tsl(vX.y + float(i), vT); c = d + c * (1. - d.a); } return c * vC; }     // drawStack: vX.z slots from vX.y, each over the last
  float t = m < 2.5 ? vT.x : (length(vT) - vX.w) / max(1. - vX.w, 1e-4);
  return texture(GR, vec2(clamp(t, 0., 1.) * 0.99609375 + 0.001953125, vX.z)) * vC;
}
${x ? `float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
vec3 clipC(vec3 c) { float l = lum(c), n = min(min(c.r, c.g), c.b), x = max(max(c.r, c.g), c.b); if (n < 0.) c = l + (c - l) * l / max(l - n, 1e-5); if (x > 1.) c = l + (c - l) * (1. - l) / max(x - l, 1e-5); return c; }
vec3 setLum(vec3 c, float l) { return clipC(c + (l - lum(c))); }
float sat(vec3 c) { return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b); }
vec3 setSat(vec3 c, float s) { float n = min(min(c.r, c.g), c.b), x = max(max(c.r, c.g), c.b); return x > n ? (c - n) * s / (x - n) : vec3(0.); }
vec3 bl(vec3 b, vec3 s) {     // backdrop b, source s (unpremultiplied)
  int m = int(uM + 0.5);
  if (m == 1) return vec3(b.r == 0. ? 0. : s.r >= 1. ? 1. : min(1., b.r / (1. - s.r)), b.g == 0. ? 0. : s.g >= 1. ? 1. : min(1., b.g / (1. - s.g)), b.b == 0. ? 0. : s.b >= 1. ? 1. : min(1., b.b / (1. - s.b)));
  if (m == 2) return setLum(setSat(b, sat(s)), lum(b));
  if (m == 3) return b + s - b * s;
  if (m == 4) return mix(2. * b * s, 1. - 2. * (1. - b) * (1. - s), step(0.5, b));
  if (m == 5) return min(b, s);
  if (m == 6) return max(b, s);
  if (m == 7) return vec3(b.r >= 1. ? 1. : s.r <= 0. ? 0. : 1. - min(1., (1. - b.r) / s.r), b.g >= 1. ? 1. : s.g <= 0. ? 0. : 1. - min(1., (1. - b.g) / s.g), b.b >= 1. ? 1. : s.b <= 0. ? 0. : 1. - min(1., (1. - b.b) / s.b));
  if (m == 8) return mix(2. * b * s, 1. - 2. * (1. - b) * (1. - s), step(0.5, s));
  if (m == 9) { vec3 d = mix(((16. * b - 12.) * b + 4.) * b, sqrt(b), step(0.25, b)); return mix(b - (1. - 2. * s) * b * (1. - b), b + (2. * s - 1.) * (d - b), step(0.5, s)); }
  if (m == 10) return abs(b - s);
  if (m == 11) return b + s - 2. * b * s;
  if (m == 12) return setLum(setSat(s, sat(b)), lum(b));
  if (m == 13) return setLum(s, lum(b));
  return setLum(b, lum(s));
}
void main() {
  vec4 s = src(), d = texture(D, (gl_FragCoord.xy - uD.xy) * uD.zw);
  vec3 cs = s.a > 0. ? s.rgb / s.a : vec3(0.), cd = d.a > 0. ? d.rgb / d.a : vec3(0.);
  o = vec4(s.a * (1. - d.a) * cs + s.a * d.a * bl(cd, cs) + (1. - s.a) * d.rgb, s.a + d.a * (1. - s.a));
}` : `uniform sampler2D MK; uniform vec4 uMK; uniform float uMKo;     // maskedImage: times a mask's alpha, placed by gl_FragCoord
uniform mat3 uCM; uniform vec3 uCMb; uniform float uCMo, uSHs; uniform vec4 uSH;     // withMatrix: the colour (straight) through uCM plus uCMb, then times the shade (slot uSHs, placed as the mask)
void main() { o = src(); if (uCMo > 0.5 && o.a > 0.) { o.rgb = clamp(uCM * (o.rgb / o.a) + uCMb, 0., 1.) * o.a; if (uSHs > -0.5) o.rgb *= tsl(uSHs, gl_FragCoord.xy * uSH.xy + uSH.zw).rgb; } if (uMKo > 0.5) o *= texture(MK, gl_FragCoord.xy * uMK.xy + uMK.zw).a; }`}`;
const GXFADE = `#version 300 es
precision highp float; uniform sampler2D D; uniform vec4 uD; uniform vec2 uF; out vec4 o;
void main() { vec4 c = texture(D, (gl_FragCoord.xy - uD.xy) * uD.zw); float a = clamp(c.a * uF.x + uF.y, 0., 1.); o = c.a > 0. ? vec4(c.rgb * (a / c.a), a) : vec4(0.); }`;
/* the light's three maps on the view in one pass (5e_light drawSun): what's there x shade, colour-dodged by the highlights,
   plus the glow; each map placed by gl_FragCoord (uM*: u = x a + b, v = y c + d), uOn: which of the three */
const GXLC = `#version 300 es
precision highp float; uniform sampler2D D, G; uniform vec4 uD, uM0, uM1, uM2; uniform vec3 uOn; out vec4 o;
vec3 m(vec4 M) { return texture(G, gl_FragCoord.xy * M.xy + M.zw).rgb; }
float dg(float b, float s) { return b <= 0. ? 0. : s >= 1. ? 1. : min(1., b / (1. - s)); }
void main() {
  vec3 c = texture(D, (gl_FragCoord.xy - uD.xy) * uD.zw).rgb;
  if (uOn.x > 0.5) c *= m(uM0);
  if (uOn.y > 0.5) { vec3 h = m(uM1); c = vec3(dg(c.r, h.r), dg(c.g, h.g), dg(c.b, h.b)); }
  if (uOn.z > 0.5) c = min(c + m(uM2), 1.);
  o = vec4(c, 1.);
}`;
/* a gaussian blur along uR.xy (sigma uR.z GL px), read from the copy D (1 / its size: uT) clamped to the rect uD (GL px) */
const GXBLUR = `#version 300 es
precision highp float; uniform sampler2D D; uniform vec4 uD; uniform vec3 uR; uniform vec2 uT; out vec4 o;
void main() { vec4 a = vec4(0.); float W = 0.; for (int i = -6; i <= 6; i++) { float t = float(i), w = exp(-t * t / (2. * uR.z * uR.z)); a += w * texture(D, clamp(gl_FragCoord.xy + uR.xy * t, uD.xy, uD.zw) * uT); W += w; } o = a / W; }`;
function gxInit() {
  if (GXR) return GXR; const g = GL; gxModes();
  const sh = (t, s) => { const o = g.createShader(t); g.shaderSource(o, s); g.compileShader(o); if (!g.getShaderParameter(o, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(o)); return o; };
  const prog = (fs, us) => { const P = g.createProgram(); g.attachShader(P, sh(g.VERTEX_SHADER, GXVS)); g.attachShader(P, sh(g.FRAGMENT_SHADER, fs)); g.linkProgram(P); if (!g.getProgramParameter(P, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(P)); const U = { P }; for (const n of us) U[n] = g.getUniformLocation(P, n); g.useProgram(P); ['T0', 'T1', 'T2', 'T3', 'T4', 'T5'].forEach((n, i) => U[n] && g.uniform1i(U[n], 8 + i)); U.GR && g.uniform1i(U.GR, 14); U.D && g.uniform1i(U.D, 15); U.MK && g.uniform1i(U.MK, 15); return U; };
  const base = ['uS', 'T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'GR'];
  const P0 = prog(GXFS(false), [...base, 'MK', 'uMK', 'uMKo', 'uCM', 'uCMb', 'uCMo', 'uSHs', 'uSH']), P1 = prog(GXFS(true), [...base, 'D', 'uD', 'uM']), PF = prog(GXFADE, ['uS', 'D', 'uD', 'uF']), PB = prog(GXBLUR, ['uS', 'D', 'uD', 'uR', 'uT']), PL = prog(GXLC, ['uS', 'D', 'G', 'uD', 'uM0', 'uM1', 'uM2', 'uOn']);
  const vao = g.createVertexArray(), vb = g.createBuffer(), ib = g.createBuffer(); g.bindVertexArray(vao);
  g.bindBuffer(g.ARRAY_BUFFER, vb); g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, ib);
  g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 36, 0);
  g.enableVertexAttribArray(1); g.vertexAttribPointer(1, 2, g.FLOAT, false, 36, 8);
  g.enableVertexAttribArray(2); g.vertexAttribPointer(2, 4, g.UNSIGNED_BYTE, true, 36, 16);
  g.enableVertexAttribArray(3); g.vertexAttribPointer(3, 4, g.FLOAT, false, 36, 20);
  g.bindVertexArray(null);
  const smp = (f, w) => { const s = g.createSampler(); g.samplerParameteri(s, g.TEXTURE_MIN_FILTER, f); g.samplerParameteri(s, g.TEXTURE_MAG_FILTER, f); g.samplerParameteri(s, g.TEXTURE_WRAP_S, w); g.samplerParameteri(s, g.TEXTURE_WRAP_T, w); return s; };
  const S = [smp(g.NEAREST, g.CLAMP_TO_EDGE), smp(g.LINEAR, g.CLAMP_TO_EDGE), smp(g.NEAREST, g.REPEAT), smp(g.LINEAR, g.REPEAT)];
  const tex = (w, h, f) => { const t = g.createTexture(); g.activeTexture(g.TEXTURE15); g.bindTexture(g.TEXTURE_2D, t); g.texImage2D(g.TEXTURE_2D, 0, f || g.RGBA8, w, h, 0, f === g.RGB8 ? g.RGB : g.RGBA, g.UNSIGNED_BYTE, null); g.activeTexture(g.TEXTURE0); return t; };
  const AS = Math.min(2048, g.getParameter(g.MAX_TEXTURE_SIZE));
  GXR = { P0, P1, PF, PB, PL, vao, vb, ib, S, AT: tex(AS, AS), AS, GRT: tex(256, 256), tex, dstA: null, dstC: null, own: new WeakMap(), pat: new WeakMap(), at: new WeakMap(), sh: [], ep: 1, gr: new Map(), grN: 0, grE: 1, txt: new Map(), up: 0, resets: 0 };
  gxGrow(16384, 32768);
  return GXR;
}
function gxGrow(nv, ni) {
  const B = GXB;
  if (nv > B.cap) { const c = Math.max(nv, B.cap * 2), F = new Float32Array(c * 9); if (B.F) F.set(B.F.subarray(0, B.nv * 9)); B.F = F; B.U = new Uint32Array(F.buffer); B.cap = c; }
  if (ni > B.icap) { const c = Math.max(ni, B.icap * 2), I = new Uint32Array(c); if (B.I) I.set(B.I.subarray(0, B.ni)); B.I = I; B.icap = c; }
}
/* any other GL work (the light) between GX draws: flush, leave the default vertex array; GX sets all its state again after */
function gxYield() { if (!GL || !GXR) return; gxFlush(); GL.bindVertexArray(null); GXB.ok = false; GXB.fbo = undefined; GXB.prog = null; }
function gxFlushIf(s) { if (GXB.tgt === s && GXB.ni) gxFlush(); }
function gxBindTarget(s) {
  const g = GL, B = GXB;
  if (!B.ok) {
    g.bindVertexArray(GXR.vao); g.disable(g.DEPTH_TEST); g.disable(g.CULL_FACE); g.enable(g.BLEND); g.enable(g.SCISSOR_TEST); g.blendEquation(g.FUNC_ADD);
    g.colorMask(true, true, true, true); g.disable(g.STENCIL_TEST); B.stOn = false; B.ok = true; B.fbo = undefined; B.prog = null; B.blk = null;
  }
  const fb = s.scr ? null : s.fb;
  if (B.fbo !== fb) { g.bindFramebuffer(g.FRAMEBUFFER, fb); B.fbo = fb; B.vw = null; }
  const w = s.gw, h = s.gh; if (B.vw !== w * 65536 + h) { g.viewport(0, 0, w, h); B.vw = w * 65536 + h; B.prog = null; }
}
function gxUse(U, s) { const g = GL, B = GXB; if (B.prog !== U) { g.useProgram(U.P); B.prog = U; g.uniform2f(U.uS, s.gw, s.gh); } }
function gxBlend(f) { const g = GL, B = GXB; if (B.blk !== f) { g.blendFuncSeparate(f[0], f[1], f[2], f[3]); B.blk = f; } }
/* stencil: o null: off; else [func, ref, mask, write mask, sfail, zpass(, back zpass)] */
function gxSten(o) {
  const g = GL, B = GXB;
  if (!o) { if (B.stOn) { g.disable(g.STENCIL_TEST); B.stOn = false; } return; }
  if (!B.stOn) { g.enable(g.STENCIL_TEST); B.stOn = true; }
  g.stencilFunc(o[0], o[1], o[2]); g.stencilMask(o[3]);
  if (o[6] !== undefined) { g.stencilOpSeparate(g.FRONT, o[4], o[4], o[5]); g.stencilOpSeparate(g.BACK, o[4], o[4], o[6]); } else g.stencilOp(o[4], o[4], o[5]);
}
const GXCLIP = () => [GL.EQUAL, 0x80, 0x80, 0, GL.KEEP, GL.KEEP];
function gxBindSlots() {
  const g = GL, S = GXB.slots;
  for (let i = 0; i < 6; i++) { g.activeTexture(g.TEXTURE8 + i); g.bindTexture(g.TEXTURE_2D, i < S.length ? S[i].t : null); g.bindSampler(8 + i, i < S.length ? S[i].s : null); }     // the unused emptied: a target still bound on one is a feedback loop
  g.activeTexture(g.TEXTURE14); g.bindTexture(g.TEXTURE_2D, GXR.GRT); g.bindSampler(14, GXR.S[1]);
  if (!GXB.u15) { g.activeTexture(g.TEXTURE15); g.bindTexture(g.TEXTURE_2D, null); }     // uploads leave theirs there: a target's own is a feedback loop (MK, D read it)
  g.activeTexture(g.TEXTURE0);
}
function gxUpload() {
  const g = GL, B = GXB;
  g.bindBuffer(g.ARRAY_BUFFER, GXR.vb); g.bufferData(g.ARRAY_BUFFER, B.F.subarray(0, B.nv * 9), g.STREAM_DRAW);
  g.bufferData(g.ELEMENT_ARRAY_BUFFER, B.I.subarray(0, B.ni), g.STREAM_DRAW);
}
/* the batch out: plain (its blend; multiply in two passes), or a plan of segments [first index, count, blend, stencil, colour on, program] */
function gxFlush(plan) {
  const B = GXB; if (!B.ni || !B.tgt) { B.nv = B.ni = 0; B.slots.length = 0; return; }
  const g = GL, s = B.tgt, cm = B.cm, shs = cm && cm.sh && B.slots.length < 6 ? B.slots.push({ t: cm.sh.t, s: GXR.S[1] }) - 1 : -1;     // withMatrix's shade: a slot of its own
  gxBindTarget(s); gxUpload(); gxBindSlots();
  const sc = B.sc; g.scissor(sc[0], sc[1], sc[2], sc[3]);
  if (!plan) {
    gxUse(GXR.P0, s); gxSten(B.st ? GXCLIP() : null); const m = GXB.blm, k = B.mask;
    if (k) { g.activeTexture(g.TEXTURE15); g.bindTexture(g.TEXTURE_2D, k.t); g.bindSampler(15, GXR.S[1]); g.activeTexture(g.TEXTURE0); g.uniform4f(GXR.P0.uMK, k.a, k.c, k.b, k.d); g.uniform1f(GXR.P0.uMKo, 1); }
    if (cm) { const P = GXR.P0, h = cm.sh; g.uniformMatrix3fv(P.uCM, false, cm.m); g.uniform3fv(P.uCMb, cm.b); g.uniform1f(P.uCMo, 1); g.uniform1f(P.uSHs, shs); if (h) g.uniform4f(P.uSH, h.a, h.c, h.b, h.d); }
    gxBlend(m.f); g.drawElements(g.TRIANGLES, B.ni, g.UNSIGNED_INT, 0);
    if (m.m && !s.scr && !s.opq) { gxBlend(m.m); g.drawElements(g.TRIANGLES, B.ni, g.UNSIGNED_INT, 0); }     // over an opaque target (the screen, opq) the second pass adds nothing
    if (k) { g.uniform1f(GXR.P0.uMKo, 0); GXB.dst = null; }
    if (cm) g.uniform1f(GXR.P0.uCMo, 0);
  } else for (const p of plan) {
    gxUse(p[5] || GXR.P0, s); gxSten(p[3]); if (p[4] === false) g.colorMask(false, false, false, false);
    gxBlend(p[2]); if (p[1] > 0) g.drawElements(g.TRIANGLES, p[1], g.UNSIGNED_INT, p[0] * 4);
    if (p[4] === false) g.colorMask(true, true, true, true);
  }
  GXR.dc = (GXR.dc || 0) + 1;
  B.nv = B.ni = B.i0 = 0; B.slots.length = 0; B.u15 = false;
}
function gxV(x, y, u, v) {
  const B = GXB; if (B.nv >= B.cap) gxGrow(B.nv + 1, 0);
  const o = B.nv * 9, F = B.F, P = GXP;
  F[o] = x; F[o + 1] = y;
  if (P.k === 0) { F[o + 2] = u; F[o + 3] = v; }
  else {
    const ux = P.ia * x + P.ic * y + P.ie, uy = P.ib * x + P.id * y + P.if;
    if (P.k === 1) { F[o + 2] = (ux - P.x0) * P.dx + (uy - P.y0) * P.dy; F[o + 3] = 0; }
    else if (P.k === 2) { F[o + 2] = (ux - P.x0) * P.ir; F[o + 3] = (uy - P.y0) * P.ir; }
    else { F[o + 2] = ux * P.pw; F[o + 3] = uy * P.ph; }
  }
  B.U[o + 4] = P.col; F[o + 5] = P.mode; F[o + 6] = P.slot; F[o + 7] = P.gr; F[o + 8] = P.r0;
  const b = B.bb; if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y < b[1]) b[1] = y; if (y > b[3]) b[3] = y;
  return B.nv++;
}
function gxT(a, b, c) { const B = GXB; if (B.ni + 3 > B.icap) gxGrow(0, B.ni + 3); const I = B.I; I[B.ni++] = a; I[B.ni++] = b; I[B.ni++] = c; }
/* a texture into a slot of the batch (6), with its sampler (0 nearest, 1 linear, +2 repeat); full: flushed first */
function gxSlot(t, sm) {
  const S = GXB.slots, s = GXR.S[sm];
  for (let i = 0; i < S.length; i++) if (S[i].t === t && S[i].s === s) return i;
  if (S.length >= 6) gxFlush();
  S.push({ t, s }); return S.length - 1;
}
/* an image source as a texture: { t, w, h, u0, v0, su, sv } (uv = u0 + px * su; a GL surface's rows run bottom up) */
const GXSRC = { t: null, w: 0, h: 0, u0: 0, v0: 0, su: 0, sv: 0 };
function gxSrc(img) {
  const R = GXR, S = GXSRC, g = GL;
  if (img instanceof GSurf) {
    if (img.scr) { gxWarn('drawImage of the screen'); return null; }
    gxFlushIf(img); S.t = img.tex; S.w = img._w; S.h = img._h; S.u0 = 0; S.v0 = 1; S.su = 1 / img._w; S.sv = -1 / img._h; return S;
  }
  const w = img.width, h = img.height;
  if (!w || !h || (img.complete === false)) return null;
  const gv = img._gv || 0;
  if (w <= 512 && h <= 512) {     // the shared atlas
    let e = R.at.get(img);
    if (!e || e.ep !== R.ep || e.w !== w || e.h !== h) { e = gxAlloc(w, h); if (!e) { gxAtlasReset(); e = gxAlloc(w, h); } e.gv = -1; R.at.set(img, e); }
    if (e.gv !== gv) { if (GXB.ni && GXB.slots.some(o => o.t === R.AT)) gxFlush(); gxPut(R.AT, img, e.x, e.y); e.gv = gv; }
    S.t = R.AT; S.w = w; S.h = h; S.u0 = e.x / R.AS; S.v0 = e.y / R.AS; S.su = 1 / R.AS; S.sv = 1 / R.AS; return S;
  }
  let e = R.own.get(img);
  if (!e) { e = { t: g.createTexture(), w: 0, h: 0, gv: -1 }; R.own.set(img, e); }
  if (e.gv !== gv || e.w !== w || e.h !== h) {
    if (GXB.ni && GXB.slots.some(o => o.t === e.t)) gxFlush();
    g.activeTexture(g.TEXTURE15); g.bindTexture(g.TEXTURE_2D, e.t); g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    if (e.w !== w || e.h !== h) { g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, g.RGBA, g.UNSIGNED_BYTE, img); e.w = w; e.h = h; } else g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, g.RGBA, g.UNSIGNED_BYTE, img);
    g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); g.activeTexture(g.TEXTURE0); GXB.dst = null; e.gv = gv; R.up++;
  }
  S.t = e.t; S.w = w; S.h = h; S.u0 = 0; S.v0 = 0; S.su = 1 / w; S.sv = 1 / h; return S;
}
function gxPut(t, img, x, y) {
  const g = GL; g.activeTexture(g.TEXTURE15); g.bindTexture(g.TEXTURE_2D, t); g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  g.texSubImage2D(g.TEXTURE_2D, 0, x, y, g.RGBA, g.UNSIGNED_BYTE, img);
  // edges copied out into the gutter: smoothed sampling clamps to the image like 2D does
  const w = img.width, h = img.height;
  for (const [sx, sy, ew, eh, dx, dy] of [[0, 0, w, 1, x, y - 1], [0, h - 1, w, 1, x, y + h], [0, 0, 1, h, x - 1, y], [w - 1, 0, 1, h, x + w, y]]) {
    g.pixelStorei(g.UNPACK_SKIP_PIXELS, sx); g.pixelStorei(g.UNPACK_SKIP_ROWS, sy); g.texSubImage2D(g.TEXTURE_2D, 0, dx, dy, ew, eh, g.RGBA, g.UNSIGNED_BYTE, img);
  }
  g.pixelStorei(g.UNPACK_SKIP_PIXELS, 0); g.pixelStorei(g.UNPACK_SKIP_ROWS, 0);
  g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); g.activeTexture(g.TEXTURE0); GXB.dst = null; GXR.up++;
}
/* shelves in the atlas, a px of gutter round each */
function gxAlloc(w, h) {
  const R = GXR, S = R.sh, W = w + 2, Hh = h + 2;
  for (const s of S) if (s.h >= Hh && s.h <= Hh * 1.3 + 4 && s.x + W <= R.AS) { const e = { x: s.x + 1, y: s.y + 1, w, h, ep: R.ep }; s.x += W; return e; }
  const y = S.length ? S[S.length - 1].y + S[S.length - 1].h : 0;
  if (y + Hh > R.AS) return null;
  const s = { y, h: Hh, x: W }; S.push(s); return { x: 1, y: y + 1, w, h, ep: R.ep };
}
function gxAtlasReset() {
  const R = GXR, g = GL; gxFlush(); R.ep++; R.sh.length = 0; R.resets++;
  g.activeTexture(g.TEXTURE15); g.bindTexture(g.TEXTURE_2D, R.AT); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, R.AS, R.AS, 0, g.RGBA, g.UNSIGNED_BYTE, null); g.activeTexture(g.TEXTURE0); GXB.dst = null;
}
/* a gradient's ramp: a row of GRT (256 colours, premultiplied) */
function gxRamp(G) {
  const R = GXR;
  if (G.row >= 0 && G.ep === R.grE) return G.row;
  const key = G.s.map(([o, c]) => o + ':' + c.join(',')).join(';');
  let row = R.gr.get(key);
  if (row === undefined) {
    if (R.grN >= 256) { gxFlush(); R.gr.clear(); R.grN = 0; R.grE++; }
    row = R.grN++; R.gr.set(key, row);
    const st = G.s.slice().sort((a, b) => a[0] - b[0]), d = new Uint8Array(1024);
    for (let i = 0; i < 256; i++) {
      const t = i / 255; let c;
      if (!st.length) c = [0, 0, 0, 0];
      else if (t <= st[0][0]) c = st[0][1]; else if (t >= st[st.length - 1][0]) c = st[st.length - 1][1];
      else { let k = 0; while (k < st.length - 1 && st[k + 1][0] < t) k++; const [o0, a] = st[k], [o1, b] = st[k + 1], f = o1 > o0 ? (t - o0) / (o1 - o0) : 0; c = a.map((v, j) => v + (b[j] - v) * f); }
      d[i * 4] = c[0] * c[3] * 255; d[i * 4 + 1] = c[1] * c[3] * 255; d[i * 4 + 2] = c[2] * c[3] * 255; d[i * 4 + 3] = c[3] * 255;
    }
    const g = GL; g.activeTexture(g.TEXTURE15); g.bindTexture(g.TEXTURE_2D, R.GRT); g.texSubImage2D(g.TEXTURE_2D, 0, 0, row, 256, 1, g.RGBA, g.UNSIGNED_BYTE, d); g.activeTexture(g.TEXTURE0); GXB.dst = null;
  }
  G.row = row; G.ep = R.grE; return row;
}
/* a repeating pattern's own texture */
function gxPatTex(img) {
  const R = GXR, g = GL;
  if (img instanceof GSurf) { gxWarn('pattern of a GL surface'); return null; }
  let e = R.pat.get(img); const gv = img._gv || 0;
  if (!e) { e = { t: g.createTexture(), gv: -1 }; R.pat.set(img, e); }
  if (e.gv !== gv) { if (GXB.ni && GXB.slots.some(o => o.t === e.t)) gxFlush(); g.activeTexture(g.TEXTURE15); g.bindTexture(g.TEXTURE_2D, e.t); g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, g.RGBA, g.UNSIGNED_BYTE, img); g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); g.activeTexture(g.TEXTURE0); GXB.dst = null; e.gv = gv; }
  return e.t;
}
/* the destination under box b (device px) copied out, for a blend mode the GPU can't do in its blend unit; returns uD */
function gxDst(s, b) {
  const g = GL, R = GXR, w = s.gw, h = s.gh;
  const x0 = Math.max(0, Math.floor(b[0]) - 1), x1 = Math.min(w, Math.ceil(b[2]) + 1), y0 = Math.max(0, Math.floor(b[1]) - 1), y1 = Math.min(h, Math.ceil(b[3]) + 1);
  if (x1 <= x0 || y1 <= y0) return null;
  const rgb = s.scr, k = rgb ? 'dstC' : 'dstA', cw = x1 - x0, ch = y1 - y0;
  let D = R[k]; if (!D || D.w < cw || D.h < ch) { if (D) g.deleteTexture(D.t); D = R[k] = { t: R.tex(Math.max(cw, D ? D.w : 0), Math.max(ch, D ? D.h : 0), rgb ? g.RGB8 : g.RGBA8), w: Math.max(cw, D ? D.w : 0), h: Math.max(ch, D ? D.h : 0) }; }
  gxBindTarget(s); g.activeTexture(g.TEXTURE15); g.bindTexture(g.TEXTURE_2D, D.t); g.bindSampler(15, R.S[0]);
  const gy = h - y1; g.copyTexSubImage2D(g.TEXTURE_2D, 0, 0, 0, x0, gy, cw, ch); g.activeTexture(g.TEXTURE0);
  return [x0, gy, 1 / D.w, 1 / D.h];
}
/* a GL surface read back small into a 2D canvas (the HUD's maps): once it's settled (unchanged 100 ms), or every 2 s while
   it keeps changing; a 2D canvas: itself */
function surf2D(s, maxW) {
  if (!(s instanceof GSurf)) return s;
  const now = performance.now(); let T = s._2d;
  if (T && T.w0 === s._w && T.h0 === s._h) {
    if (T.gv === s._gv) return T.c;
    if (T.pg !== s._gv) { T.pg = s._gv; T.tc = now; }
    if (now - T.t < 2000 && now - T.tc < 100) return T.c;
  }
  const k = Math.min(1, maxW / s._w), w = Math.max(1, Math.round(s._w * k)), h = Math.max(1, Math.round(s._h * k)), g = GL;
  if (!T || T.c.width !== w || T.c.height !== h) T = s._2d = { c: mk(w, h), tmp: new GSurf(w, h) };
  const x = T.tmp.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'copy'; x.imageSmoothingEnabled = true; x.drawImage(s, 0, 0, s._w, s._h, 0, 0, w, h); gxFlush();
  g.bindFramebuffer(g.FRAMEBUFFER, T.tmp.fb); const px = new Uint8Array(w * h * 4); g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px); GXB.fbo = undefined;
  const id = new ImageData(w, h), d = id.data;
  for (let y = 0; y < h; y++) for (let i = 0, o = (h - 1 - y) * w * 4, q = y * w * 4; i < w * 4; i += 4) { const a = px[o + i + 3], f = a ? 255 / a : 0; d[q + i] = px[o + i] * f; d[q + i + 1] = px[o + i + 1] * f; d[q + i + 2] = px[o + i + 2] * f; d[q + i + 3] = a; }
  T.c.getContext('2d').putImageData(id, 0, 0); T.gv = s._gv; T.t = now; T.w0 = s._w; T.h0 = s._h; return T.c;
}
const groundMini = () => surf2D(ground, 640);
function gxFrame() { if (!GXR) return; GXFR++; if (GXFR % 120 === 0) for (const [k, e] of GXR.txt) if (GXFR - e.f > 240) GXR.txt.delete(k); }
/* ---------------- the context ---------------- */
const GXST = ['fillStyle', 'strokeStyle', 'globalAlpha', 'globalCompositeOperation', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit', 'lineDashOffset', 'font', 'textAlign', 'textBaseline', 'imageSmoothingEnabled', 'imageSmoothingQuality', 'filter', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY', 'direction'];
class GX {
  constructor(sf) { this.canvas = sf; this._st = []; this._pool = []; this._sub = []; this._cur = null; this._px = 0; this._py = 0; this._reset(); }
  _reset() {
    this.fillStyle = '#000'; this.strokeStyle = '#000'; this.globalAlpha = 1; this.globalCompositeOperation = 'source-over'; this.lineWidth = 1; this.lineCap = 'butt'; this.lineJoin = 'miter'; this.miterLimit = 10;
    this.lineDashOffset = 0; this.font = '10px sans-serif'; this.textAlign = 'start'; this.textBaseline = 'alphabetic'; this.imageSmoothingEnabled = true; this.imageSmoothingQuality = 'low'; this.filter = 'none';
    this.shadowBlur = 0; this.shadowColor = 'rgba(0,0,0,0)'; this.shadowOffsetX = 0; this.shadowOffsetY = 0; this.direction = 'inherit';
    this._m = [1, 0, 0, 1, 0, 0]; this._dash = []; this._clip = null; this._st.length = 0; this.beginPath();
  }
  // ---- state
  save() { const o = { m: this._m.slice(), dash: this._dash, clip: this._clip }; for (const k of GXST) o[k] = this[k]; this._st.push(o); }
  restore() { const o = this._st.pop(); if (!o) return; for (const k of GXST) this[k] = o[k]; this._m = o.m; this._dash = o.dash; this._clip = o.clip; }
  setTransform(a, b, c, d, e, f) { const m = this._m; if (typeof a === 'object') { m[0] = a.a; m[1] = a.b; m[2] = a.c; m[3] = a.d; m[4] = a.e; m[5] = a.f; } else if (a === undefined) { m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 1; m[4] = 0; m[5] = 0; } else { m[0] = a; m[1] = b; m[2] = c; m[3] = d; m[4] = e; m[5] = f; } }
  resetTransform() { this.setTransform(1, 0, 0, 1, 0, 0); }
  getTransform() { const m = this._m; return { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5], is2D: true }; }
  transform(a, b, c, d, e, f) { const m = this._m, A = m[0], B = m[1], C = m[2], D = m[3]; m[0] = A * a + C * b; m[1] = B * a + D * b; m[2] = A * c + C * d; m[3] = B * c + D * d; m[4] += A * e + C * f; m[5] += B * e + D * f; }
  translate(x, y) { const m = this._m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; }
  scale(x, y) { const m = this._m; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; }
  rotate(a) { const c = Math.cos(a), s = Math.sin(a); this.transform(c, s, -s, c, 0, 0); }
  setLineDash(d) { this._dash = d && d.length ? (d.length % 2 ? d.concat(d) : d.slice()) : []; }
  getLineDash() { return this._dash.slice(); }
  createLinearGradient(x0, y0, x1, y1) { return new GXGrad(1, [x0, y0, x1, y1]); }
  createRadialGradient(x0, y0, r0, x1, y1, r1) { if (x0 !== x1 || y0 !== y1) gxWarn('radial gradient off centre'); return new GXGrad(2, [x1, y1, r0, r1]); }
  createPattern(img, rep) { if (rep && rep !== 'repeat') gxWarn('pattern ' + rep); return new GXPat(img, rep); }
  measureText(s) { if (!GXPC) GXPC = document.createElement('canvas').getContext('2d'); GXPC.font = this.font; return GXPC.measureText(s); }
  getImageData(x, y, w, h) { gxWarn('getImageData'); return new ImageData(Math.max(1, w), Math.max(1, h)); }
  createImageData(w, h) { return new ImageData(w, h); }
  putImageData() { gxWarn('putImageData'); }
  isPointInPath() { return false; }
  // ---- paths (device px, as the canvas keeps them)
  beginPath() { const P = this._sub; for (const s of P) { s.p.length = 0; this._pool.push(s); } P.length = 0; this._cur = null; this._reopen = false; }
  _new(x, y) { const s = this._pool.pop() || { p: [], c: false, cv: 0 }; s.c = false; s.cv = 0; s.p.length = 0; s.p.push(x, y); this._sub.push(s); this._cur = s; this._px = x; this._py = y; this._reopen = false; return s; }
  _tx(x, y) { const m = this._m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  _pt(x, y) { const m = this._m, X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5]; let s = this._cur; if (!s) { if (!this._reopen) { this._new(X, Y); return; } s = this._new(this._px, this._py); } const p = s.p; if (p[p.length - 2] !== X || p[p.length - 1] !== Y) p.push(X, Y); s.cv = 0; }
  moveTo(x, y) { if (!isFinite(x) || !isFinite(y)) return; const m = this._m; this._new(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]); }
  lineTo(x, y) { if (isFinite(x) && isFinite(y)) this._pt(x, y); }
  closePath() { const s = this._cur; if (!s) return; s.c = true; this._end(s.p[0], s.p[1]); }
  _end(x, y) { this._cur = null; this._px = x; this._py = y; this._reopen = true; }     // the next point starts a new subpath at (x, y) (device px)
  _open() { if (!this._cur && this._reopen) this._new(this._px, this._py); }
  rect(x, y, w, h) { this.moveTo(x, y); this._pt(x + w, y); this._pt(x + w, y + h); this._pt(x, y + h); const s = this._cur; s.c = true; s.cv = 1; this._end(s.p[0], s.p[1]); }
  _seg(r) { const m = this._m, k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) * r; return k < 0.5 ? 0.6 : 2 * Math.acos(Math.max(-1, 1 - 0.3 / Math.max(k, 0.3))); }
  _sweep(a0, a1, ccw) {
    const T = Math.PI * 2; let d = a1 - a0;
    if (!ccw) { if (d >= T) d = T; else { d %= T; if (d < 0) d += T; } } else { if (-d >= T) d = -T; else { d %= T; if (d > 0) d -= T; } }
    return d;
  }
  arc(x, y, r, a0, a1, ccw) { this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
  ellipse(x, y, rx, ry, rot, a0, a1, ccw) {
    if (!isFinite(x + y + rx + ry + rot + a0 + a1)) return;
    if (rx < 0 || ry < 0) return; this._open();
    const d = this._sweep(a0, a1, ccw), st = this._seg(Math.max(rx, ry)), n = Math.max(1, Math.min(512, Math.ceil(Math.abs(d) / st))), cr = Math.cos(rot), sr = Math.sin(rot);
    const fresh = !this._cur || this._cur.p.length === 0;
    for (let i = 0; i <= n; i++) { const a = a0 + d * i / n, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry; this._pt(x + ex * cr - ey * sr, y + ex * sr + ey * cr); }
    if (fresh && this._cur && this._cur.p.length / 2 === n + 1 && Math.abs(d) >= Math.PI * 2 - 1e-9) this._cur.cv = 1;
  }
  roundRect(x, y, w, h, r) {
    let R = Array.isArray(r) ? r : [r === undefined ? 0 : r]; R = R.map(v => typeof v === 'object' ? (v.x || 0) : +v || 0);
    const [tl, tr, br, bl] = R.length === 1 ? [R[0], R[0], R[0], R[0]] : R.length === 2 ? [R[0], R[1], R[0], R[1]] : R.length === 3 ? [R[0], R[1], R[2], R[1]] : R;
    const k = Math.min(1, w / Math.max(1e-9, tl + tr, bl + br), h / Math.max(1e-9, tl + bl, tr + br)), P = Math.PI;
    this.moveTo(x + tl * k, y);
    this._corner(x + w - tr * k, y + tr * k, tr * k, -P / 2, 0); this._corner(x + w - br * k, y + h - br * k, br * k, 0, P / 2);
    this._corner(x + bl * k, y + h - bl * k, bl * k, P / 2, P); this._corner(x + tl * k, y + tl * k, tl * k, P, P * 1.5);
    const s = this._cur; s.c = true; s.cv = 1; this._end(...this._tx(x, y));
  }
  _corner(cx, cy, r, a0, a1) { if (r <= 0) { this._pt(cx, cy); return; } const n = Math.max(1, Math.ceil((a1 - a0) / this._seg(r))); for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; this._pt(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } }
  quadraticCurveTo(cx, cy, x, y) {
    this._open(); if (!this._cur) this.moveTo(cx, cy); const s = this._cur, m = this._m, X0 = s.p[s.p.length - 2], Y0 = s.p[s.p.length - 1];
    const ii = this._inv(), x0 = ii[0] * X0 + ii[2] * Y0 + ii[4], y0 = ii[1] * X0 + ii[3] * Y0 + ii[5];
    const n = Math.max(4, Math.min(64, Math.ceil(Math.hypot(cx - x0, cy - y0, x - cx, y - cy) * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) / 6)));
    for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; this._pt(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y); }
  }
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    this._open(); if (!this._cur) this.moveTo(c1x, c1y); const s = this._cur, m = this._m, X0 = s.p[s.p.length - 2], Y0 = s.p[s.p.length - 1];
    const ii = this._inv(), x0 = ii[0] * X0 + ii[2] * Y0 + ii[4], y0 = ii[1] * X0 + ii[3] * Y0 + ii[5];
    const n = Math.max(4, Math.min(64, Math.ceil((Math.hypot(c1x - x0, c1y - y0) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(x - c2x, y - c2y)) * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) / 6)));
    for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; this._pt(u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x, u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y); }
  }
  arcTo(x1, y1, x2, y2, r) { gxWarn('arcTo'); this.lineTo(x1, y1); this.lineTo(x2, y2); }
  _inv() { const m = this._m, d = m[0] * m[3] - m[1] * m[2] || 1e-12, a = m[3] / d, b = -m[1] / d, c = -m[2] / d, e = m[0] / d; return [a, b, c, e, -(a * m[4] + c * m[5]), -(b * m[4] + e * m[5])]; }
  /* a Path2D's commands replayed (through the current transform) into a scratch path */
  _replay(P) {
    const keep = this._sub, kc = this._cur, kp = this._pool; this._sub = []; this._cur = null; this._reopen = false;
    const c = P._c; for (let i = 0; i < c.length; i += 2) this[c[i]](...c[i + 1]);
    const out = this._sub; this._sub = keep; this._cur = kc; this._pool = kp; return out;
  }
  _subs(a) { return a && a._c ? this._replay(a) : this._sub; }
  // ---- paint
  _paint(st, al) {
    const P = GXP;
    if (typeof st === 'string') { const c = gxColor(st); P.k = 0; P.mode = 0; P.col = gxPack(c[0], c[1], c[2], c[3] * al); P.op = c[3] * al >= 0.999; return true; }
    if (st instanceof GXGrad) {
      if (!st.s.length) return false;
      const row = gxRamp(st), i = this._inv(); P.ia = i[0]; P.ib = i[1]; P.ic = i[2]; P.id = i[3]; P.ie = i[4]; P.if = i[5];
      P.col = gxPack(1, 1, 1, al); P.gr = (row + 0.5) / 256; P.op = false;
      if (st.t === 1) { const [x0, y0, x1, y1] = st.a, dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1e-9; P.k = 1; P.mode = 2; P.x0 = x0; P.y0 = y0; P.dx = dx / L; P.dy = dy / L; }
      else { const [x, y, r0, r1] = st.a; P.k = 2; P.mode = 3; P.x0 = x; P.y0 = y; P.ir = 1 / (r1 || 1e-9); P.r0 = r0 / (r1 || 1e-9); }
      return true;
    }
    if (st instanceof GXPat) {
      const t = gxPatTex(st.img); if (!t) return false;
      const i = this._inv(); P.ia = i[0]; P.ib = i[1]; P.ic = i[2]; P.id = i[3]; P.ie = i[4]; P.if = i[5];
      P.k = 3; P.mode = 1; P.pw = 1 / st.img.width; P.ph = 1 / st.img.height; P.col = gxPack(1, 1, 1, al); P.slot = gxSlot(t, this.imageSmoothingEnabled ? 3 : 2); P.op = false; return true;
    }
    return false;
  }
  /* before a shape: the batch made this target's, blend, clip (flushed if any differ, or always when it goes alone) */
  _pre(solo) {
    if (!GXR) gxInit();
    const sf = this.canvas; sf._gv = (sf._gv || 0) + 1; const B = GXB, m = GXBM[this.globalCompositeOperation] || GXBM['source-over'], cl = this._clip;
    if (cl && cl.ps && sf.stK !== cl.k) this._clipBuild();
    const sc = this._scissor(), st = cl && cl.ps ? 1 : 0;
    if (sc[2] <= 0 || sc[3] <= 0) return null;
    const alone = solo || m.u || m.x;
    if (alone || B.tgt !== sf || B.blm !== m || B.st !== st || B.sc[0] !== sc[0] || B.sc[1] !== sc[1] || B.sc[2] !== sc[2] || B.sc[3] !== sc[3] || B.nv > 60000) {
      gxFlush(); B.tgt = sf; B.blm = m; B.st = st; B.sc[0] = sc[0]; B.sc[1] = sc[1]; B.sc[2] = sc[2]; B.sc[3] = sc[3];
    }
    const b = B.bb; b[0] = b[1] = 1e9; b[2] = b[3] = -1e9; B.i0 = B.ni;
    return m;
  }
  _scissor() {     // the clip's box in GL px (bottom up)
    const sf = this.canvas, w = sf.gw, h = sf.gh, r = this._clip && this._clip.r;
    if (!r) return [0, 0, w, h];
    const x0 = Math.max(0, r[0]), y0 = Math.max(0, r[1]), x1 = Math.min(w, r[2]), y1 = Math.min(h, r[3]);
    return [x0, h - y1, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
  }
  /* after a shape that went alone: its plan (stencil fill, once-only stroke, unbounded, dst-read) and out */
  _post(m, kind) {
    const B = GXB, g = GL, sf = this.canvas, cl = this._clip && this._clip.ps, i0 = B.i0, n = B.ni - i0;
    if (!n) return;
    if (!m.u && !m.x && !kind) return;     // batched
    if (kind || m.u) sf._stencil();
    const K = g.KEEP, Z = g.ZERO, AL = g.ALWAYS;
    let prog = GXR.P0, xu = null;
    if (m.x) { xu = gxDst(sf, B.bb); if (!xu) { B.ni = i0; return; } prog = GXR.P1; }
    const plan = [];
    const inside = kind === 1 ? (cl ? [g.LESS, 0x80, 0xff, 0x7f, K, K] : [g.NOTEQUAL, 0, 0x7f, 0x7f, K, K]) : kind === 2 ? (cl ? [g.EQUAL, 0x80, 0xff, 0x7f, K, g.INCR] : [g.EQUAL, 0, 0x7f, 0x7f, K, g.INCR]) : m.u ? (cl ? [g.EQUAL, 0x80, 0x80, 0x7f, K, g.INCR] : [AL, 0, 0x7f, 0x7f, K, g.INCR]) : (cl ? GXCLIP() : null);
    let fi = i0, fn = n;
    if (kind === 1) {     // the winding into the stencil's low bits, then a cover over the box (B.cov: its indices)
      plan.push([i0, B.cv0 - i0, GXBM.none.f, this._fillRule === 'evenodd' ? [AL, 0, 0xff, 0x7f, K, g.INVERT] : [AL, 0, 0xff, 0x7f, K, g.INCR_WRAP, g.DECR_WRAP], false]);
      fi = B.cv0; fn = B.ni - B.cv0;
    }
    plan.push([fi, fn, m.f, inside, true, prog]);
    if (m.m) plan.push([fi, fn, m.m, inside, true, prog]);
    if (m.u) {     // the clip's box where the shape isn't: cleared
      const q = this._coverQuad(true); plan.push([q, 6, GXBM.clear.f, cl ? [g.EQUAL, 0x80, 0xff, 0x7f, Z, Z] : [g.EQUAL, 0, 0x7f, 0x7f, Z, Z], true]);
    }
    if (kind || m.u) { const q = this._coverQuad(kind !== 1 || m.u); plan.push([q, 6, GXBM.none.f, [AL, 0, 0xff, 0x7f, Z, Z], false]); }     // the low bits zeroed again
    if (xu) { gxBindTarget(sf); gxUse(GXR.P1, sf); g.uniform4f(GXR.P1.uD, xu[0], xu[1], xu[2], xu[3]); g.uniform1f(GXR.P1.uM, m.x); g.activeTexture(g.TEXTURE15); g.bindTexture(g.TEXTURE_2D, GXR[sf.scr ? 'dstC' : 'dstA'].t); g.bindSampler(15, GXR.S[0]); g.activeTexture(g.TEXTURE0); B.u15 = true; }
    gxFlush(plan);
  }
  _coverQuad(whole) {     // a quad over the shape's box (whole: the clip's box), solid; its first index
    const B = GXB, sf = this.canvas, h = sf.gh, P = GXP, k = P.k, md = P.mode; P.k = 0; P.mode = 0;
    let x0, y0, x1, y1;
    if (whole) { const s = B.sc; x0 = s[0]; x1 = s[0] + s[2]; y0 = h - s[1] - s[3]; y1 = h - s[1]; } else { const b = B.bb; x0 = b[0] - 1; y0 = b[1] - 1; x1 = b[2] + 1; y1 = b[3] + 1; }
    const bb = B.bb.slice(), a = gxV(x0, y0, 0, 0), b = gxV(x1, y0, 0, 0), c = gxV(x1, y1, 0, 0), d = gxV(x0, y1, 0, 0), i = B.ni; gxT(a, b, c); gxT(a, c, d);
    B.bb[0] = bb[0]; B.bb[1] = bb[1]; B.bb[2] = bb[2]; B.bb[3] = bb[3]; P.k = k; P.mode = md; return i;
  }
  // ---- clip: a box (scissor) for axis-aligned rects, else the stencil's top bit
  clip(a, b) {
    const subs = this._subs(a), rule = typeof a === 'string' ? a : b || 'nonzero', old = this._clip;
    const S = subs.filter(s => s.p.length >= 6);
    let r = old && old.r ? old.r.slice() : null;
    const box = [1e9, 1e9, -1e9, -1e9]; for (const s of S) for (let i = 0; i < s.p.length; i += 2) { const x = s.p[i], y = s.p[i + 1]; if (x < box[0]) box[0] = x; if (x > box[2]) box[2] = x; if (y < box[1]) box[1] = y; if (y > box[3]) box[3] = y; }
    if (!S.length) { this._clip = { r: [0, 0, 0, 0], ps: old && old.ps, k: old && old.k }; return; }
    const R = Math.round, isRect = S.length === 1 && S[0].p.length === 8 && (() => { const p = S[0].p; return (p[0] === p[6] && p[1] === p[3] && p[2] === p[4] && p[5] === p[7]) || (p[0] === p[2] && p[1] === p[7] && p[4] === p[6] && p[3] === p[5]); })();
    const bx = [R(box[0]), R(box[1]), R(box[2]), R(box[3])];
    r = r ? [Math.max(r[0], bx[0]), Math.max(r[1], bx[1]), Math.min(r[2], bx[2]), Math.min(r[3], bx[3])] : bx;
    if (isRect) { this._clip = { r, ps: old && old.ps, k: old && old.k }; return; }
    const ps = (old && old.ps ? old.ps.slice() : []); ps.push({ s: S.map(s => ({ p: s.p.slice(), c: s.c, cv: s.cv })), rule });
    this._clip = { r, ps, k: ++GXK };
  }
  /* only outside the path (an extension: the stencil's top bit cleared inside it), ANDed with the clip as clip() is */
  clipOut(a, b) {
    const subs = this._subs(a), rule = typeof a === 'string' ? a : b || 'nonzero', old = this._clip, S = subs.filter(s => s.p.length >= 6);
    if (!S.length) return;
    const ps = (old && old.ps ? old.ps.slice() : []); ps.push({ s: S.map(s => ({ p: s.p.slice(), c: s.c, cv: s.cv })), rule, out: true });
    this._clip = { r: old && old.r ? old.r.slice() : null, ps, k: ++GXK };
  }
  /* drawImage, times the alpha of mask (any image source) laid over the device rect (mx, my, mw, mh): a soft cut in one pass */
  maskedImage(img, sx, sy, sw, sh, dx, dy, dw, dh, mask, mx, my, mw, mh) {
    if (!GXR) gxInit(); gxFlush(); const S = gxSrc(mask); if (!S) return; const h = this.canvas.gh;
    const a = S.w * S.su / mw, c = -S.h * S.sv / mh; GXB.mask = { t: S.t, a, b: S.u0 - mx * a, c, d: S.v0 + (h - my) * S.h * S.sv / mh };
    try { this.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh); gxFlush(); } finally { GXB.mask = null; }
  }
  /* what fn draws, its colour through a matrix as it lands (m: a mat3, column by column, b: added after), then times sh's
     colour ([image, sx, sy, sw, sh, dx, dy, dw, dh]: placed as drawImage would, device px; smoothed): a colour filter and
     a multiply at no cost of their own (plain draws only: no dst-read modes) */
  withMatrix(m, b, sh, fn) {
    if (!GXR) gxInit(); gxFlush(); let p = null;
    if (sh) { const S = gxSrc(sh[0]); if (S) { const [, sx, sy, sw, shh, dx, dy, dw, dh] = sh, h = this.canvas.gh, a = sw * S.su / dw, c = -shh * S.sv / dh; p = { t: S.t, a, b: S.u0 + sx * S.su - dx * a, c, d: S.v0 + (sy + (h - dy) * shh / dh) * S.sv }; } }
    GXB.cm = { m, b, sh: p };
    try { fn(); gxFlush(); } finally { GXB.cm = null; }
  }
  _clipBuild() {     // the clip's paths into the stencil's top bit (each one ANDed in)
    const sf = this.canvas, g = GL, cl = this._clip, B = GXB; gxFlush(); sf._stencil();
    const sc = this._scissor(); if (sc[2] <= 0 || sc[3] <= 0) return;
    B.tgt = sf; B.blm = GXBM.none; B.st = 0; B.sc[0] = sc[0]; B.sc[1] = sc[1]; B.sc[2] = sc[2]; B.sc[3] = sc[3];
    gxBindTarget(sf); g.scissor(sc[0], sc[1], sc[2], sc[3]); g.stencilMask(0xff); g.clearStencil(0x80); g.clear(g.STENCIL_BUFFER_BIT); g.clearStencil(0);
    const K = g.KEEP, Z = g.ZERO, AL = g.ALWAYS, P = GXP; P.k = 0; P.mode = 0; P.col = 0;
    for (const path of cl.ps) {
      const b = B.bb; b[0] = b[1] = 1e9; b[2] = b[3] = -1e9; const i0 = B.ni;
      for (const s of path.s) this._fan(s.p);
      const q = this._coverQuad(true);
      gxFlush([[i0, q - i0, GXBM.none.f, path.rule === 'evenodd' ? [AL, 0, 0xff, 0x7f, K, g.INVERT] : [AL, 0, 0xff, 0x7f, K, g.INCR_WRAP, g.DECR_WRAP], false],
        [q, 6, GXBM.none.f, [path.out ? g.NOTEQUAL : g.EQUAL, 0, 0x7f, 0xff, K, Z], false], [q, 6, GXBM.none.f, [AL, 0, 0xff, 0x7f, Z, Z], false]]);
    }
    sf.stK = cl.k;
  }
  _fan(p) { const n = p.length / 2; if (n < 3) return; const a = gxV(p[0], p[1], 0, 0); let b = gxV(p[2], p[3], 0, 0); for (let i = 2; i < n; i++) { const c = gxV(p[i * 2], p[i * 2 + 1], 0, 0); gxT(a, b, c); b = c; } }
  // ---- filling
  fillRect(x, y, w, h) {
    if (!w || !h) return;
    const m = this._pre(false); if (!m) return; if (!this._paint(this.fillStyle, this.globalAlpha)) return;
    const M = this._m, X = (u, v) => M[0] * u + M[2] * v + M[4], Y = (u, v) => M[1] * u + M[3] * v + M[5];
    const a = gxV(X(x, y), Y(x, y), 0, 0), b = gxV(X(x + w, y), Y(x + w, y), 0, 0), c = gxV(X(x + w, y + h), Y(x + w, y + h), 0, 0), d = gxV(X(x, y + h), Y(x, y + h), 0, 0);
    gxT(a, b, c); gxT(a, c, d); this._post(m, 0);
  }
  clearRect(x, y, w, h) {
    if (!w || !h) return;
    const op = this.globalCompositeOperation, fs = this.fillStyle, ga = this.globalAlpha; this.globalCompositeOperation = 'clear'; this.fillStyle = '#000'; this.globalAlpha = 1;
    this.fillRect(x, y, w, h); this.globalCompositeOperation = op; this.fillStyle = fs; this.globalAlpha = ga;
  }
  fill(a, b) {
    const subs = this._subs(a); this._fillRule = typeof a === 'string' ? a : b || 'nonzero';
    let n = 0, cvx = true, sg = 0; for (const s of subs) if (s.p.length >= 6) { n++; if (cvx) { const k = gxConvex(s); if (!k) cvx = false; else if (!sg) sg = k; else if (k !== sg) cvx = false; } }
    if (!n) return;
    const one = n === 1 && cvx, idem = this.globalAlpha >= 0.999 && typeof this.fillStyle === 'string' && gxColor(this.fillStyle)[3] >= 0.999 && (this.globalCompositeOperation === 'source-over' || this.globalCompositeOperation === 'destination-out');
    const simple = one || (cvx && idem && this._fillRule === 'nonzero');
    const m = this._pre(!simple); if (!m) return; if (!this._paint(this.fillStyle, this.globalAlpha)) { GXB.ni = GXB.i0; return; }
    for (const s of subs) if (s.p.length >= 6) this._fan(s.p);
    if (!simple) { GXB.cv0 = this._coverQuad(false); GXB.cv0 = GXB.ni - 6; }
    this._post(m, simple ? 0 : 1);
  }
  // ---- strokes
  strokeRect(x, y, w, h) { const keep = this._sub, kc = this._cur; this._sub = []; this._cur = null; this.rect(x, y, w, h); this.stroke(); this._sub = keep; this._cur = kc; }
  stroke(a) {
    const subs = this._subs(a), M = this._m, sc = Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2]));
    let hw = this.lineWidth * sc / 2, al = this.globalAlpha; if (!(hw > 0)) return; if (hw < 0.5) { al *= hw * 2; hw = 0.5; }
    const opq = al >= 0.999 && typeof this.strokeStyle === 'string' && gxColor(this.strokeStyle)[3] >= 0.999 && (this.globalCompositeOperation === 'source-over' || this.globalCompositeOperation === 'destination-out');
    const m = this._pre(!opq); if (!m) return; if (!this._paint(this.strokeStyle, al)) { GXB.ni = GXB.i0; return; }
    const dash = this._dash.length ? this._dash.map(v => v * sc) : null;
    for (const s of subs) {
      if (s.p.length < 4) continue;
      if (dash) for (const d of gxDash(s.p, s.c, dash, this.lineDashOffset * sc)) this._line(d, false, hw); else this._line(s.p, s.c, hw);
    }
    this._post(m, opq ? 0 : 2);
  }
  _line(p, closed, hw) {
    const n = closed ? gxN(p) : p.length / 2; if (n < 2) return;
    const cap = this.lineCap, join = this.lineJoin, ml = this.miterLimit;
    let q = p; if (!closed && cap === 'square') { q = p.slice(); const ex = (i, j, k) => { const dx = q[i] - q[j], dy = q[i + 1] - q[j + 1], L = Math.hypot(dx, dy) || 1; q[i] += dx / L * k; q[i + 1] += dy / L * k; }; ex(0, 2, hw); ex(q.length - 2, q.length - 4, hw); }
    const N = closed ? n : n - 1;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % n, x0 = q[i * 2], y0 = q[i * 2 + 1], x1 = q[j * 2], y1 = q[j * 2 + 1], dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy); if (L < 1e-6) continue;
      const nx = -dy / L * hw, ny = dx / L * hw, a = gxV(x0 + nx, y0 + ny, 0, 0), b = gxV(x1 + nx, y1 + ny, 0, 0), c = gxV(x1 - nx, y1 - ny, 0, 0), d = gxV(x0 - nx, y0 - ny, 0, 0); gxT(a, b, c); gxT(a, c, d);
    }
    const J0 = closed ? 0 : 1, J1 = closed ? n : n - 1;
    for (let i = J0; i < J1; i++) {
      const h = (i - 1 + n) % n, j = (i + 1) % n, vx = q[i * 2], vy = q[i * 2 + 1];
      let ax = vx - q[h * 2], ay = vy - q[h * 2 + 1], bx = q[j * 2] - vx, by = q[j * 2 + 1] - vy; const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by); if (la < 1e-6 || lb < 1e-6) continue;
      ax /= la; ay /= la; bx /= lb; by /= lb; const cr = ax * by - ay * bx, dt = ax * bx + ay * by; if (Math.abs(cr) < 1e-6 && dt > 0) continue;
      const s = cr > 0 ? -1 : 1, p0x = -ay * hw * s, p0y = ax * hw * s, p1x = -by * hw * s, p1y = bx * hw * s;
      if (join === 'round' && Math.acos(Math.max(-1, Math.min(1, dt))) > 0.35) { gxDisc(vx, vy, hw); continue; }
      const v = gxV(vx, vy, 0, 0), A = gxV(vx + p0x, vy + p0y, 0, 0), Bv = gxV(vx + p1x, vy + p1y, 0, 0);
      const mx = p0x + p1x, my = p0y + p1y, m2 = (mx * mx + my * my) / (hw * hw);
      if (join === 'miter' && m2 > 1e-6 && 2 / Math.sqrt(m2) <= ml) { const k = 2 / m2, T = gxV(vx + mx * k, vy + my * k, 0, 0); gxT(v, A, T); gxT(v, T, Bv); } else gxT(v, A, Bv);
    }
    if (!closed && cap === 'round') { gxDisc(q[0], q[1], hw); gxDisc(q[q.length - 2], q[q.length - 1], hw); }
  }
  // ---- images
  drawImage(img, a, b, c, d, e, f, g, h) {
    const n = arguments.length; if (!img) return;
    if (img === this.canvas) { gxWarn('drawImage of itself'); return; }
    if (!GXR) gxInit();
    let iw = img instanceof GSurf ? img._w : img.width, ih = img instanceof GSurf ? img._h : img.height; if (!iw || !ih) return;
    let sx = 0, sy = 0, sw = iw, sh = ih, dx, dy, dw, dh;
    if (n <= 3) { dx = a; dy = b; dw = iw; dh = ih; } else if (n <= 5) { dx = a; dy = b; dw = c; dh = d; } else { sx = a; sy = b; sw = c; sh = d; dx = e; dy = f; dw = g; dh = h; }
    if (sw < 0) { sx += sw; sw = -sw; } if (sh < 0) { sy += sh; sh = -sh; } if (dw < 0) { dx += dw; dw = -dw; } if (dh < 0) { dy += dh; dh = -dh; }
    if (sx < 0) { const k = -sx / sw; dx += dw * k; dw -= dw * k; sw += sx; sx = 0; } if (sy < 0) { const k = -sy / sh; dy += dh * k; dh -= dh * k; sh += sy; sy = 0; }
    if (sx + sw > iw) { const k = (sx + sw - iw) / sw; dw -= dw * k; sw = iw - sx; } if (sy + sh > ih) { const k = (sy + sh - ih) / sh; dh -= dh * k; sh = ih - sy; }
    if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
    const m = this._pre(false); if (!m) return;
    const S = gxSrc(img); if (!S) { GXB.ni = GXB.i0; return; }
    this._blit(S, sx, sy, sw, sh, dx, dy, dw, dh, gxPack(1, 1, 1, this.globalAlpha), this.imageSmoothingEnabled ? 1 : 0);
    this._post(m, 0);
  }
  /* images of one size (GL surfaces) stacked, each over the last, drawn as one (args as drawImage's 9): one pass, not one each */
  drawStack(imgs, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (imgs.some(o => !(o instanceof GSurf) || o._w !== imgs[0]._w || o._h !== imgs[0]._h || o === this.canvas)) { for (const o of imgs) this.drawImage(o, sx, sy, sw, sh, dx, dy, dw, dh); return; }
    this._stk = imgs; try { this.drawImage(imgs[0], sx, sy, sw, sh, dx, dy, dw, dh); } finally { this._stk = null; }
  }
  _blit(S, sx, sy, sw, sh, dx, dy, dw, dh, col, sm) {
    const P = GXP, K = this._stk; P.k = 0; P.mode = 1; P.col = col;
    if (K) {     // drawStack: its slots in a row
      const T = K.map(o => gxSrc(o).t), B = GXB; if (B.slots.length + T.length > 6) gxFlush();
      P.mode = 4; P.gr = T.length; P.slot = B.slots.length; for (const t of T) B.slots.push({ t, s: GXR.S[sm] });
    } else P.slot = gxSlot(S.t, sm);
    const M = this._m, u0 = S.u0 + sx * S.su, u1 = S.u0 + (sx + sw) * S.su, v0 = S.v0 + sy * S.sv, v1 = S.v0 + (sy + sh) * S.sv;
    const X = (u, v) => M[0] * u + M[2] * v + M[4], Y = (u, v) => M[1] * u + M[3] * v + M[5];
    const a = gxV(X(dx, dy), Y(dx, dy), u0, v0), b = gxV(X(dx + dw, dy), Y(dx + dw, dy), u1, v0), c = gxV(X(dx + dw, dy + dh), Y(dx + dw, dy + dh), u1, v1), d = gxV(X(dx, dy + dh), Y(dx, dy + dh), u0, v1);
    gxT(a, b, c); gxT(a, c, d);
  }
  // ---- text: each string drawn once into its own little canvas (white), then tinted
  fillText(s, x, y, mw) { this._text(s, x, y, mw, false); }
  strokeText(s, x, y, mw) { this._text(s, x, y, mw, true); }
  _text(s, x, y, mw, st) {
    s = String(s); if (!s) return; if (!GXR) gxInit();
    const M = this._m, k = Math.max(0.25, Math.round(Math.hypot(M[0], M[1]) * 4) / 4), key = (st ? 'S' + this.lineWidth + this.lineJoin : 'F') + '|' + this.font + '|' + this.textAlign + '|' + this.textBaseline + '|' + k + '|' + (mw === undefined ? '' : mw) + '|' + s;
    let e = GXR.txt.get(key);
    if (!e) {
      if (!GXPC) GXPC = document.createElement('canvas').getContext('2d');
      GXPC.font = this.font; const fm = GXPC.measureText(s), px = +((/(\d+(?:\.\d+)?)px/.exec(this.font) || [0, 10])[1]);
      const tw = Math.min(fm.width, mw === undefined ? 1e9 : mw) + (st ? this.lineWidth : 0), pad = 4 + (st ? this.lineWidth : 0) * k;
      const c = document.createElement('canvas'); c.width = Math.ceil(tw * k + pad * 2 + px * k * 0.5); c.height = Math.ceil(px * k * 3 + pad * 2);
      const ta = this.textAlign, ax = ta === 'center' ? c.width / 2 : ta === 'right' || ta === 'end' ? c.width - pad : pad, ay = c.height / 2;
      const g = c.getContext('2d'); g.font = this.font; g.textAlign = ta; g.textBaseline = this.textBaseline; g.setTransform(k, 0, 0, k, ax, ay);
      if (st) { g.strokeStyle = '#fff'; g.lineWidth = this.lineWidth; g.lineJoin = this.lineJoin; g.strokeText(s, 0, 0, mw); } else { g.fillStyle = '#fff'; g.fillText(s, 0, 0, mw); }
      e = { c, ax, ay, k }; if (GXR.txt.size > 2000) GXR.txt.clear(); GXR.txt.set(key, e);
    }
    e.f = GXFR;
    const sty = st ? this.strokeStyle : this.fillStyle, col = typeof sty === 'string' ? gxColor(sty) : sty instanceof GXGrad && sty.s.length ? sty.s[0][1] : [0, 0, 0, 1];
    const m = this._pre(false); if (!m) return;
    const S = gxSrc(e.c); if (!S) return;
    this._blit(S, 0, 0, e.c.width, e.c.height, x - e.ax / e.k, y - e.ay / e.k, e.c.width / e.k, e.c.height / e.k, gxPack(col[0], col[1], col[2], col[3] * this.globalAlpha), 1);
    this._post(m, 0);
  }
  /* decals / prints fading (2_maps fadeLayers): alpha x slope + intercept, colour kept, in tiles through a scratch copy */
  fadeAlpha(sl, ic) {
    if (!GXR) gxInit(); gxFlush(); const sf = this.canvas, g = GL, R = GXR, T = 512, w = sf.gw, h = sf.gh;
    if (!R.fade) R.fade = R.tex(T, T);
    gxBindTarget(sf); g.disable(g.BLEND); gxSten(null); gxUse(R.PF, sf); g.uniform2f(R.PF.uF, sl, ic); g.uniform4f(R.PF.uD, 0, 0, 1 / T, 1 / T);
    g.bindBuffer(g.ARRAY_BUFFER, R.vb);
    for (let y = 0; y < h; y += T) for (let x = 0; x < w; x += T) {
      const cw = Math.min(T, w - x), ch = Math.min(T, h - y);
      g.activeTexture(g.TEXTURE15); g.bindTexture(g.TEXTURE_2D, R.fade); g.bindSampler(15, R.S[0]); g.copyTexSubImage2D(g.TEXTURE_2D, 0, 0, 0, x, y, cw, ch); g.activeTexture(g.TEXTURE0);
      g.scissor(x, y, cw, ch); g.uniform4f(R.PF.uD, x, y, 1 / T, 1 / T);
      const F = new Float32Array([x, h - y, 0, 0, 0, 0, 0, 0, 0, x + cw, h - y, 0, 0, 0, 0, 0, 0, 0, x + cw, h - y - ch, 0, 0, 0, 0, 0, 0, 0, x, h - y, 0, 0, 0, 0, 0, 0, 0, x + cw, h - y - ch, 0, 0, 0, 0, 0, 0, 0, x, h - y - ch, 0, 0, 0, 0, 0, 0, 0]);
      g.bufferData(g.ARRAY_BUFFER, F, g.STREAM_DRAW); g.drawArrays(g.TRIANGLES, 0, 6);
    }
    g.enable(g.BLEND); GXB.prog = null; GXB.blk = null; const s = GXB.sc; g.scissor(s[0], s[1], s[2], s[3]);
  }
  /* the light's maps composited (drawSun): src a GL surface, at: each map's corner in it (canvas px), sw x sh of it onto
     the device rect to (an opaque target: the screen); on: [shade, highlights, glow] */
  lightComp(src, at, sw, sh, to, on) {
    if (!GXR) gxInit(); gxFlush(); const sf = this.canvas, g = GL, R = GXR, P = R.PL, H = sf.gh, [dx, dy, dw, dh] = to;
    const xu = gxDst(sf, [dx, dy, dx + dw, dy + dh]); if (!xu) return;
    gxBindTarget(sf); g.disable(g.BLEND); gxSten(null); gxUse(P, sf); g.uniform1i(P.G, 8); g.uniform4f(P.uD, xu[0], xu[1], xu[2], xu[3]); g.uniform3f(P.uOn, on[0] ? 1 : 0, on[1] ? 1 : 0, on[2] ? 1 : 0);
    const Gw = src._w, Gh = src._h, kx = sw / dw, ky = sh / dh;
    at.forEach(([sx, sy], i) => g.uniform4f(P['uM' + i], kx / Gw, ky / Gh, (sx - dx * kx) / Gw, 1 - (sy + (H - dy) * ky) / Gh));
    g.activeTexture(g.TEXTURE8); g.bindTexture(g.TEXTURE_2D, src.tex); g.bindSampler(8, R.S[1]); g.activeTexture(g.TEXTURE0);
    const x0 = Math.max(0, Math.floor(dx)), x1 = Math.min(sf.gw, Math.ceil(dx + dw)), y0 = Math.max(0, Math.floor(dy)), y1 = Math.min(H, Math.ceil(dy + dh));
    g.scissor(x0, H - y1, x1 - x0, y1 - y0); g.bindBuffer(g.ARRAY_BUFFER, R.vb);
    const F = new Float32Array(54); [[x0, y0], [x1, y0], [x1, y1], [x0, y0], [x1, y1], [x0, y1]].forEach(([a, b], i) => { F[i * 9] = a; F[i * 9 + 1] = b; });
    g.bufferData(g.ARRAY_BUFFER, F, g.STREAM_DRAW); g.drawArrays(g.TRIANGLES, 0, 6);
    g.enable(g.BLEND); GXB.prog = null; GXB.blk = null; GXB.dst = null; const s = GXB.sc; g.scissor(s[0], s[1], s[2], s[3]); sf._gv = (sf._gv || 0) + 1; R.dc = (R.dc || 0) + 1;
  }
  /* a gaussian blur (sigma r px) of the rect (canvas px) in place, as filter blur(r) would have drawn it there: two passes
     through a copy the surface's size, the rect's edge pixels held past it (the rest of the surface left alone) */
  blur(r, x = 0, y = 0, w = this.canvas.gw, h = this.canvas.gh) {
    if (!GXR) gxInit(); gxFlush(); const sf = this.canvas, g = GL, R = GXR, W = sf.gw, H = sf.gh;
    x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y)); w = Math.min(W - x, Math.ceil(w)); h = Math.min(H - y, Math.ceil(h)); const gy = H - y - h; if (w <= 0 || h <= 0 || r <= 0) return;
    if (!R.bt || R.bw < W || R.bh < H) { if (R.bt) g.deleteTexture(R.bt); R.bw = Math.max(W, R.bw || 0); R.bh = Math.max(H, R.bh || 0); R.bt = R.tex(R.bw, R.bh); }
    gxBindTarget(sf); g.disable(g.BLEND); gxSten(null); gxUse(R.PB, sf); g.uniform4f(R.PB.uD, x + 0.5, gy + 0.5, x + w - 0.5, gy + h - 0.5); g.uniform2f(R.PB.uT, 1 / R.bw, 1 / R.bh);
    g.scissor(x, gy, w, h); g.bindBuffer(g.ARRAY_BUFFER, R.vb);
    const F = new Float32Array(54), c = [[x, H - gy], [x + w, H - gy], [x + w, H - gy - h], [x, H - gy], [x + w, H - gy - h], [x, H - gy - h]];
    c.forEach(([a, b], i) => { F[i * 9] = a; F[i * 9 + 1] = b; }); g.bufferData(g.ARRAY_BUFFER, F, g.STREAM_DRAW);
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      g.activeTexture(g.TEXTURE15); g.bindTexture(g.TEXTURE_2D, R.bt); g.bindSampler(15, R.S[1]); g.copyTexSubImage2D(g.TEXTURE_2D, 0, x, gy, x, gy, w, h); g.activeTexture(g.TEXTURE0);
      g.uniform3f(R.PB.uR, dx, dy, r); g.drawArrays(g.TRIANGLES, 0, 6);
    }
    g.enable(g.BLEND); GXB.prog = null; GXB.blk = null; GXB.dst = null; const s = GXB.sc; g.scissor(s[0], s[1], s[2], s[3]); sf._gv = (sf._gv || 0) + 1;
  }
}
/* +1 / -1: a convex outline wound that way (0: not convex, or it turns more than once round) */
function gxConvex(s) {
  if (s.cv) return gxWind(s.p);
  const p = s.p, n = gxN(p); if (n < 3) return 0;
  let sg = 0, turn = 0;
  for (let i = 0; i < n; i++) {
    const h = (i + n - 1) % n, j = (i + 1) % n, ax = p[i * 2] - p[h * 2], ay = p[i * 2 + 1] - p[h * 2 + 1], bx = p[j * 2] - p[i * 2], by = p[j * 2 + 1] - p[i * 2 + 1], c = ax * by - ay * bx;
    if (Math.abs(c) < 1e-9) { if (ax * bx + ay * by < 0) return 0; continue; }
    const k = c > 0 ? 1 : -1; if (!sg) sg = k; else if (k !== sg) return 0;
    turn += Math.atan2(c, ax * bx + ay * by);
  }
  if (Math.abs(Math.abs(turn) - Math.PI * 2) > 0.01) return 0;
  return sg;
}
function gxN(p) { let n = p.length / 2; if (n > 1 && p[0] === p[n * 2 - 2] && p[1] === p[n * 2 - 1]) n--; return n; }     // points, less a last one back on the first
function gxWind(p) { let A = 0; const n = p.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; } return A >= 0 ? 1 : -1; }
function gxDisc(x, y, r) { const n = Math.max(6, Math.min(32, Math.ceil(r * 0.8) + 4)), c = gxV(x, y, 0, 0); let a = gxV(x + r, y, 0, 0); for (let i = 1; i <= n; i++) { const t = i / n * Math.PI * 2, b = gxV(x + Math.cos(t) * r, y + Math.sin(t) * r, 0, 0); gxT(c, a, b); a = b; } }
/* a polyline cut into dashes (device px) */
function gxDash(p, closed, D, off) {
  const out = []; let di = 0, left = D[0], on = true, tot = D.reduce((a, b) => a + b, 0); if (tot <= 0) return [p];
  off = ((off % tot) + tot) % tot; while (off > 0) { if (off >= left) { off -= left; di = (di + 1) % D.length; left = D[di]; on = !on; } else { left -= off; off = 0; } }
  const n = p.length / 2, N = closed ? n : n - 1; let cur = on ? [p[0], p[1]] : null;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % n; let x0 = p[i * 2], y0 = p[i * 2 + 1]; const x1 = p[j * 2], y1 = p[j * 2 + 1]; let L = Math.hypot(x1 - x0, y1 - y0);
    while (L > 0) {
      const t = Math.min(L, left), k = t / L, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k;
      if (on) cur.push(x, y);
      left -= t; L -= t; x0 = x; y0 = y;
      if (left <= 1e-9) { if (on && cur.length >= 4) out.push(cur); on = !on; di = (di + 1) % D.length; left = D[di]; cur = on ? [x, y] : null; }
    }
  }
  if (on && cur && cur.length >= 4) out.push(cur);
  return out;
}
