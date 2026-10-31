/* WebGL vs WebGPU on the light's costliest passes, with a frame's real inputs. Loaded into a scene by tools/scene.mjs:
     node tools/scene.mjs window '{"cam":"TREE","zoom":0.7}' --gpu --cfg '{"lightQ":2}' --shots 1 --probe "import('/tools/gpubench.js').then(m => m.run())"
   At the frame's light maps draw (pipe 'gpu-map', MRT) it takes that draw's textures and uniforms, times N draws of the GL
   program (a timer query), then runs the same shader ported to WGSL on WebGPU over the same textures (timestamp queries),
   and compares the two outputs (max byte difference). SHADOW CACHE off ({"shCache":0}): a sweep pass too (N 8 or past).
   Back: { maps, sweep: { webgl, webgpu: ms a draw (GPU timers), webgl_wall, webgpu_wall (the clock: phones without timers), diff } }.
   In the game: dev WORLD › GPU BENCH (devGpuBench) */
const N = 60;
const RZ = [36, 42], HZ = 127.5;

/* the maps shader (CPS: the frame's surface, Q 2: shade, highlights, glow), as WGSL. U: a0 S K V, a1 R, a2 P O, a3 L TM,
   a4 C BL, a5 W RFL, a6 LI LB, a7 SKY UL, a8 WX LY, a9 G Q UP */
const MAPS = `
struct U { a0: vec4f, a1: vec4f, a2: vec4f, a3: vec4f, a4: vec4f, a5: vec4f, a6: vec4f, a7: vec4f, a8: vec4f, a9: vec4f };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var H: texture_2d<f32>;
@group(0) @binding(2) var MT: texture_2d<f32>;
@group(0) @binding(3) var SWT: texture_2d<f32>;
@group(0) @binding(4) var UT: texture_2d<f32>;
@group(0) @binding(5) var SWL: texture_2d<f32>;
@group(0) @binding(6) var LT: texture_2d<f32>;
@group(0) @binding(7) var sl: sampler;
const HZ = ${HZ.toFixed(1)}; const PLT = vec3f(1., 0.96, 0.86);
fn at(p: vec2f) -> vec2i { return vec2i(floor(clamp(p, u.a1.xy, u.a1.zw))); }
fn tx(p: vec2f) -> vec4f { return textureLoad(H, at(p), 0); }
fn hh(p: vec2f) -> f32 { let c = tx(p); return max(c.r, c.g) * HZ; }
fn gm(p: vec2f) -> bool { let b = tx(p).b; return b > 0.2 && b < 0.6; }
fn hg(p: vec2f, g: bool) -> f32 { if (g) { return tx(p).r * HZ; } return hh(p); }
fn rf(p: vec2f) -> bool { if (u.a7.w > 0.5) { return textureLoad(UT, at(p), 0).b > 0.5; } return tx(p).b > 0.5; }
fn un(c: vec2f) -> f32 { return (c.x * 255. + c.y) / 255. * 256. - 128.; }
fn sunIn(c: vec4f, h: f32) -> f32 { let g = un(c.rg); let lo = c.b * 144. - 16.; let hi = c.a * 144. - 16.; return max(clamp((g - h + 0.75) / 1.5, 0., 1.), clamp((min(h - lo, hi - h) + 0.75) / 1.5, 0., 1.)); }
fn sunSh(p: vec2f, h0: f32) -> f32 {
  let q = vec2i(floor(p)); let sw = textureLoad(SWT, q, 0); let ur = rf(p) && h0 < ${RZ[0].toFixed(1)}; var lw = vec4f(0.); if (u.a8.w > 0.5) { lw = textureLoad(SWL, q, 0); }
  var s: f32; if (ur && u.a7.w < 0.5) { s = clamp((un(sw.rg) - h0 + 0.75) / 1.5, 0., 1.); } else { s = sunIn(sw, h0 + 0.75); }
  return 1. - max(s, max(lw.r, lw.b)); }
fn hs(p: vec2f) -> f32 { var q = fract(p.xyx * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn vn(p: vec2f) -> f32 { let i = floor(p); var f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hs(i), hs(i + vec2f(1., 0.)), f.x), mix(hs(i + vec2f(0., 1.)), hs(i + vec2f(1., 1.)), f.x), f.y); }
fn wv(w: vec2f) -> f32 { let t = u.a3.w; return vn(w * 0.06 + vec2f(t * 0.35, t * 0.25)) + 0.5 * vn(w * 0.14 - vec2f(t * 0.45, -t * 0.2)); }
fn mt(p: vec2f) -> vec4f { return textureLoad(MT, at(p), 0); }
struct O3 { @location(0) o0: vec4f, @location(1) o1: vec4f, @location(2) o2: vec4f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2. - 1.; return vec4f(p, 0., 1.); }
@fragment fn fs(@builtin(position) pos: vec4f) -> O3 {
  let G = u.a9.xy; let f = vec2f(pos.x, G.y - pos.y) - u.a2.zw; let p = vec2f(f.x, u.a0.w - f.y) + u.a2.xy; let K = u.a0.z;
  let L = u.a3.xyz; let C = u.a4.xyz; let BL = u.a4.w; let W = u.a5.xyz; let RFL = u.a5.w; let LI = u.a6.xyz; let LB = u.a6.w; let SKY = u.a7.xyz;
  let g = gm(p); let h0 = hg(p, g);
  var N = normalize(vec3f(-vec2f(hg(p + vec2f(1., 0.), g) - hg(p - vec2f(1., 0.), g), hg(p + vec2f(0., 1.), g) - hg(p - vec2f(0., 1.), g)) * K * 0.5, 1.));
  let lam = (0.45 + 0.55 * max(dot(N, L), 0.)) / (0.45 + 0.55 * L.z); let sh = sunSh(p, h0);
  var a = vec4f(0.); if (LB > 0.5) { a = (textureSampleLevel(LT, sl, (f + vec2f(-1., -1.)) / G, 0.) + textureSampleLevel(LT, sl, (f + vec2f(1., -1.)) / G, 0.) + textureSampleLevel(LT, sl, (f + vec2f(-1., 1.)) / G, 0.) + textureSampleLevel(LT, sl, (f + vec2f(1., 1.)) / G, 0.)) * 0.25; }
  let m = mt(p); let r = m.r * RFL; let gw = m.g; let pl = a.rgb * 4.; var tint = PLT; if (pl.r + pl.g + pl.b > 0.004) { tint = pl / max(max(pl.r, pl.g), pl.b); }
  var o: O3;
  o.o0 = vec4f(min(mix(C, LI, sh) * min(lam, 1.) + pl, vec3f(1.)) * (1. - r * 0.55), 1.);
  let hi = W * max(lam - 1., 0.) * 1.6 * sh + pl * 0.6 + gw * 1.5; o.o1 = vec4f(hi / (1. + hi), 1.);
  let w = (p - u.a8.xy) / u.a8.z;
  if (m.b > 0.5) { let e = vec2f(1.5, 0.); N = normalize(N + vec3f(wv(w - e.xy) - wv(w + e.xy), wv(w - e.yx) - wv(w + e.yx), 0.) * 0.9); }
  let Rv = reflect(vec3f(0., 0., -1.), N); let spec = pow(max(dot(Rv, L), 0.), mix(12., 160., r)) * sh; var b = 0.;
  if (BL > 0.) { for (var i = 0; i < 12; i++) { let t = f32(i); let q = (1. + t) / 12. * 9. * K; b += mt(p + vec2f(cos(t * 2.39996), sin(t * 2.39996)) * q).g; } }
  let sky = mix(SKY * 1.2, SKY, Rv.z);
  o.o2 = vec4f(pl * 0.45 + a.a * 2. * tint + r * (sky * 0.5 * (0.55 + 0.45 * sh) + W * spec * 2.5) + vec3f(1., 0.86, 0.62) * b / 12. * BL, 1.);
  return o;
}`;

/* a sweep pass (SP: what blocks the sun, joined with what's N px sunward), as WGSL. U: S D, R, N DH */
const SWEEP = `
struct U { S: vec2f, D: vec2f, R: vec4f, N: f32, DH: f32, z0: f32, z1: f32 };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var H: texture_2d<f32>;
@group(0) @binding(2) var B: texture_2d<f32>;
const HZ = ${HZ.toFixed(1)};
fn un(c: vec2f) -> f32 { return (c.x * 255. + c.y) / 255. * 256. - 128.; }
fn pk(v: f32) -> vec2f { let x = clamp((v + 128.) / 256., 0., 0.99998) * 255.; return vec2f(floor(x) / 255., fract(x)); }
fn outq(q: vec2f) -> bool { return any(q < u.R.xy) || any(q > u.R.zw); }
fn fold(s: ptr<function, vec2f>, g: ptr<function, f32>) { if ((*s).x <= (*s).y && (*s).x <= max(*g, 0.) + 0.5) { *g = max(*g, (*s).y); *s = vec2f(128., -16.); } }
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2. - 1.; return vec4f(p, 0., 1.); }
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let p = vec2f(pos.x, u.S.y - pos.y); let D = u.D; let DH = u.DH; var a = vec2f(128., -16.); var g = -128.;
  if (u.N < 0.5) { let q = p + D; if (!outq(q)) { let qc = floor(q) + 0.5; let dh = max(dot(qc - p, D), 0.25) * DH; let c = textureLoad(H, vec2i(qc), 0); let t = c.r * HZ; let ft = c.g * HZ;
      if (t > 0.01) { g = t - dh; } if (ft > 0.01) { a = vec2f((1. - c.a) * HZ, ft) - dh; }
      if (c.b > 0.5) { let r = vec2f(${RZ[0].toFixed(1)}, ${RZ[1].toFixed(1)}) - dh; if (a.x > a.y) { a = r; } else { a = vec2f(min(a.x, r.x), max(a.y, r.y)); } } } }
  else {
    var c = textureLoad(B, vec2i(floor(p)), 0); g = un(c.rg); a = vec2f(c.b, c.a) * 144. - 16.;
    let q = p + D * u.N;
    if (!outq(q)) { let qc = floor(q) + 0.5; let dh = dot(qc - p, D) * DH; c = textureLoad(B, vec2i(qc), 0); g = max(g, un(c.rg) - dh); var b = vec2f(c.b, c.a) * 144. - 16. - dh;
      fold(&a, &g); fold(&b, &g); fold(&a, &g);
      if (b.y > -1. && b.x <= b.y) { if (a.x > a.y) { a = b; } else if (b.x <= a.y + 0.5 && a.x <= b.y + 0.5) { a = vec2f(min(a.x, b.x), max(a.y, b.y)); } else if (b.x < a.x) { a = b; } } }
  }
  fold(&a, &g); if (a.y < -1.) { a = vec2f(128., -16.); }
  let e = clamp((a + 16.) / 144., vec2f(0.), vec2f(1.)) * 255.; return vec4f(pk(max(g, -128.)), ceil(e.x - 0.001) / 255., floor(e.y + 0.001) / 255.);
}`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
/* a GL texture's texels (RGBA8, GL row order) */
function glRead(gl, t, w, h) { const f = gl.createFramebuffer(), d = new Uint8Array(w * h * 4); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, f); gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d); gl.deleteFramebuffer(f); return d; }
const bound = (gl, u) => { gl.activeTexture(gl.TEXTURE0 + u); return gl.getParameter(gl.TEXTURE_BINDING_2D); };

/* the maps draw, caught at its pipe: its inputs, its uniforms, N draws timed, its outputs */
function catchMaps() {
  return new Promise((res, rej) => {
    const old = PIPE; setTimeout(() => { if (PIPE !== old) { PIPE = old; rej(new Error('no light maps pass (play a match, WebGL2)')); } }, 6000);
    PIPE = (k, o) => {
      if (old) old(k, o);
      if (k !== 'gpu-map' || o.q !== 'mrt') return;
      const S = _sun, gl = S.gl, C = S.CMU, P = S.CPM; if (gl.getUniform(P, C.UP) > 0.5 || gl.getUniform(P, C.Q) < 1.5) return;     // the frame's surface, all three maps
      PIPE = old;
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), w = S.MR.w, h = S.MR.h, at = gl.getParameter(gl.ACTIVE_TEXTURE), fb = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      const vp = gl.getParameter(gl.VIEWPORT), sc = gl.getParameter(gl.SCISSOR_BOX), Hs = [S.fw, S.fh];
      const tex = { H: [bound(gl, 0), ...Hs], MT: [bound(gl, 2), ...Hs], LT: [bound(gl, 3), w, h], SWT: [bound(gl, 4), ...Hs], SWL: [bound(gl, 10), ...Hs], UT: [bound(gl, 11), ...Hs] };
      gl.activeTexture(at);
      const g = n => C[n] ? gl.getUniform(P, C[n]) : n === 'S' ? Hs : 0, U = { S: g('S'), K: g('K'), V: g('V'), R: g('R'), P: g('P'), O: g('O'), L: g('L'), TM: g('TM'), C: g('C'), BL: g('BL'), W: g('W'), RFL: g('RFL'), LI: g('LI'), LB: g('LB'), SKY: g('SKY'), UL: g('UL'), WX: g('WX'), LY: g('LY'), G: g('G'), Q: g('Q'), UP: g('UP') };
      const q = ext && gl.createQuery(); gl.finish();
      if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      for (let i = 0; i < N; i++) gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (q) gl.endQuery(ext.TIME_ELAPSED_EXT);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); const t0 = performance.now(); for (let i = 0; i < N; i++) gl.drawArrays(gl.TRIANGLES, 0, 3); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); const wall = (performance.now() - t0) / N;     // no timer (phones): the wall clock, a 1 px read to wait
      const out = [0, 1, 2].map(i => { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, S.MR.fb); gl.readBuffer(gl.COLOR_ATTACHMENT0 + i); const d = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d); return d; });
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      const data = {}; for (const [k, [t, tw, th]] of Object.entries(tex)) data[k] = t && !(k === 'SWL' && !(U.LY > 0.5)) && !(k === 'UT' && !(U.UL > 0.5)) ? { d: glRead(gl, t, tw, th), w: tw, h: th } : null;     // the channels' only when read
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(...vp); gl.scissor(...sc);
      res({ U, data, out, w, h, sc, q, wall });
    };
  });
}
/* a sweep pass (N 8 or past), caught at its pipe: its heights and the pass before's, its uniforms, N draws timed, its output */
function catchSweep() {
  return new Promise((res, rej) => {
    const old = PIPE; setTimeout(() => { if (PIPE !== old) { PIPE = old; rej(new Error('no sweep pass (sun down?)')); } }, 6000);
    PIPE = (k, o) => {
      if (old) old(k, o);
      if (k !== 'gpu-sweep' || !(o.n >= 8)) return;
      PIPE = old;
      const S = _sun, gl = S.gl, C = S.SU, P = S.SP, g = n => gl.getUniform(P, C[n]), U = { S: g('S'), R: g('R'), D: g('D'), N: g('N'), DH: g('DH') }, [w, h] = U.S;
      const at = gl.getParameter(gl.ACTIVE_TEXTURE), fb = gl.getParameter(gl.FRAMEBUFFER_BINDING), sc = gl.getParameter(gl.SCISSOR_BOX), tH = bound(gl, g('H')), tB = bound(gl, g('B')); gl.activeTexture(at);
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), q = ext && gl.createQuery(); gl.useProgram(P); gl.finish();
      if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      for (let i = 0; i < N; i++) gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (q) gl.endQuery(ext.TIME_ELAPSED_EXT);
      gl.finish(); const d = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); const t0 = performance.now(); for (let i = 0; i < N; i++) gl.drawArrays(gl.TRIANGLES, 0, 3); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); const wall = (performance.now() - t0) / N;     // no timer (phones): the wall clock, a 1 px read to wait
      const data = { H: { d: glRead(gl, tH, w, h), w, h }, B: { d: glRead(gl, tB, w, h), w, h } }; gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      res({ U, data, out: [d], w, h, sc, q, wall });
    };
  });
}
async function glTime(gl, c) {
  if (!c.q) return null;
  for (let k = 0; k < 200; k++) { if (gl.getQueryParameter(c.q, gl.QUERY_RESULT_AVAILABLE)) return gl.getQueryParameter(c.q, gl.QUERY_RESULT) / 1e6 / N; await sleep(10); }
  return null;
}

/* a shader (code) on WebGPU over c's textures (keys: bindings 1.., 'smp' a linear sampler), uniforms f, n RGBA8 outputs: ms a
   draw (timestamps), its outputs against GL's (diff) */
async function gpuRun(code, keys, f, n, c) {
  const ad = await navigator.gpu.requestAdapter(); const dev = await ad.requestDevice({ requiredFeatures: ad.features.has('timestamp-query') ? ['timestamp-query'] : [] });
  const tx = k => { const s = c.data[k] || { d: new Uint8Array(4), w: 1, h: 1 }; const t = dev.createTexture({ size: [s.w, s.h], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST }); dev.queue.writeTexture({ texture: t }, s.d, { bytesPerRow: s.w * 4 }, [s.w, s.h]); return t; };
  const ub = dev.createBuffer({ size: f.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); dev.queue.writeBuffer(ub, 0, f);
  const mod = dev.createShaderModule({ code }); const info = await mod.getCompilationInfo(); const errs = info.messages.filter(m => m.type === 'error'); if (errs.length) return { error: errs.map(m => `${m.lineNum}:${m.linePos} ${m.message}`).join(' | ') };
  const fmt = 'rgba8unorm', pipe = dev.createRenderPipeline({ layout: 'auto', vertex: { module: mod, entryPoint: 'vs' }, fragment: { module: mod, entryPoint: 'fs', targets: Array.from({ length: n }, () => ({ format: fmt })) }, primitive: { topology: 'triangle-list' } });
  const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ub } }, ...keys.map((k, i) => ({ binding: i + 1, resource: k === 'smp' ? dev.createSampler({ magFilter: 'linear', minFilter: 'linear' }) : tx(k).createView() }))] });
  const { w, h, sc } = c, outs = Array.from({ length: n }, () => dev.createTexture({ size: [w, h], format: fmt, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC }));
  const ts = dev.features.has('timestamp-query'), qs = ts && dev.createQuerySet({ type: 'timestamp', count: 2 }), qb = ts && dev.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }), rb = ts && dev.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const run = m => {
    const e = dev.createCommandEncoder(), p = e.beginRenderPass({ colorAttachments: outs.map(t => ({ view: t.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] })), ...(ts ? { timestampWrites: { querySet: qs, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {}) });
    p.setPipeline(pipe); p.setBindGroup(0, bg); p.setScissorRect(sc[0], h - sc[1] - sc[3], sc[2], sc[3]);     // GL's scissor (bottom-up) as WebGPU's
    for (let i = 0; i < m; i++) p.draw(3); p.end();
    if (ts) { e.resolveQuerySet(qs, 0, 2, qb, 0); e.copyBufferToBuffer(qb, 0, rb, 0, 16); }
    dev.queue.submit([e.finish()]);
  };
  HOLD = true; let wall;     // the game idles meanwhile: the clock then times this work alone, as GL's is (drawn in one go)
  try { run(2); await dev.queue.onSubmittedWorkDone(); const t0 = performance.now(); run(N); await dev.queue.onSubmittedWorkDone(); wall = (performance.now() - t0) / N; } finally { HOLD = false; }
  let ms = null; if (ts) { await rb.mapAsync(GPUMapMode.READ); const v = new BigUint64Array(rb.getMappedRange()); ms = Number(v[1] - v[0]) / 1e6 / N; rb.unmap(); }
  // the outputs against GL's (rows flipped: GL's bottom-up), over the scissor
  const diff = [];
  for (let i = 0; i < n; i++) {
    const bpr = Math.ceil(w * 4 / 256) * 256, b = dev.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }), e = dev.createCommandEncoder();
    e.copyTextureToBuffer({ texture: outs[i] }, { buffer: b, bytesPerRow: bpr }, [w, h]); dev.queue.submit([e.finish()]); await b.mapAsync(GPUMapMode.READ); const d = new Uint8Array(b.getMappedRange());
    let mx = 0, m = 0, over = 0; const G = c.out[i];
    for (let y = sc[1]; y < sc[1] + sc[3]; y++) for (let x = sc[0]; x < sc[0] + sc[2]; x++) for (let k = 0; k < 4; k++) { const a = G[(y * w + x) * 4 + k], v = d[(h - 1 - y) * bpr + x * 4 + k], dd = Math.abs(a - v); if (dd > mx) mx = dd; if (dd > 2) over++; m++; }
    diff.push({ max: mx, over2: +(over / m * 100).toFixed(3) + '%' }); b.unmap();
  }
  dev.destroy();
  return { ms, wall, diff };
}

export async function run() {
  if (!navigator.gpu) return { error: 'no WebGPU' };
  const gl = _sun.gl, r = {}, fx = v => v == null ? null : +v.toFixed(3);
  { const c = await catchMaps(), t = await glTime(gl, c), U = c.U, f = new Float32Array(40), set = (i, ...v) => f.set(v, i * 4);
    set(0, U.S[0], U.S[1], U.K, U.V); set(1, ...U.R); set(2, U.P[0], U.P[1], U.O[0], U.O[1]); set(3, ...U.L, U.TM); set(4, ...U.C, U.BL); set(5, ...U.W, U.RFL); set(6, ...U.LI, U.LB); set(7, ...U.SKY, U.UL); set(8, ...U.WX, U.LY); set(9, U.G[0], U.G[1], U.Q, U.UP);
    const g = await gpuRun(MAPS, ['H', 'MT', 'SWT', 'UT', 'SWL', 'LT', 'smp'], f, 3, c); r.maps = { px: c.sc[2] * c.sc[3], webgl: fx(t), webgpu: fx(g.ms), webgl_wall: fx(c.wall), webgpu_wall: fx(g.wall), diff: g.diff, error: g.error }; }
  if (CFG.shCache) return r;     // the sweep: with SHADOW CACHE off (its passes each frame)
  { const c = await catchSweep(), t = await glTime(gl, c), U = c.U, f = new Float32Array([U.S[0], U.S[1], U.D[0], U.D[1], ...U.R, U.N, U.DH, 0, 0]);
    const g = await gpuRun(SWEEP, ['H', 'B'], f, 1, c); r.sweep = { px: c.sc[2] * c.sc[3], N: U.N, webgl: fx(t), webgpu: fx(g.ms), webgl_wall: fx(c.wall), webgpu_wall: fx(g.wall), diff: g.diff, error: g.error }; }
  return r;
}
