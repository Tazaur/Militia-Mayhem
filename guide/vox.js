/* HEIGHTS in 3D: the heightmap editor's renderer (heightmap/index.html · 3D view), lifted. One instanced box per painted px, as
   tall as its height; lines mark each voxel. Lit: the art lit by the sun and a sky (hemisphere ambient), reflectivity mirrors the sky
   and catches the sun (sharper the more reflective), glow emits its colour and blooms. Drawn multisampled into two targets (colour,
   glow), the glow blurred at half size and added back. One addition: each box turns with its part (a per-instance angle) */
const VOX = (() => {
  let gl = null, cv = null, prog, bgP, blP, coP, vao, vao0, ibuf, FB = null, inst = new Float32Array(0), nInst = 0;
  const SKY = { zen: [0.42, 0.52, 0.66], hor: [0.78, 0.8, 0.82], gnd: [0.3, 0.32, 0.26], sun: [1, 0.93, 0.8], k: 1.05, amb: 0.55 }, RK = 1, BK = 1;     // the editor's defaults (Game sky, reflections and bloom 100%)
  const SKYF = `uniform vec3 ZEN, HOR, GND, SL, SC;
vec3 sky(vec3 d) { return d.y > 0. ? mix(HOR, ZEN, pow(d.y, 0.55)) : mix(HOR, GND, pow(-d.y, 0.35)); }`;
  const FSV = `#version 300 es
out vec2 uv; void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); uv = p; gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
  const U = (P, n) => P.u[n] ?? (P.u[n] = gl.getUniformLocation(P, n));
  function init(c) {
    cv = c; gl = c.getContext('webgl2', { antialias: false }); if (!gl) return false;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const mk = (vs, fs) => { const P = gl.createProgram(); gl.attachShader(P, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(P, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(P); if (!gl.getProgramParameter(P, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(P)); P.u = {}; return P; };
    prog = mk(`#version 300 es
layout(location=0) in vec3 p; layout(location=1) in vec3 n; layout(location=2) in vec3 inst; layout(location=3) in vec3 col; layout(location=4) in vec3 mat; layout(location=5) in float ang;
uniform mat4 VP; uniform vec3 C; out vec3 vn, vc, wp, vm, lp, ln;
void main() { float h = inst.z > 0. ? inst.z : 0.15, c = cos(ang), s = sin(ang); vec2 q = p.xz - 0.5;
  vec3 w = vec3(inst.x + q.x * c - q.y * s, mat.z + p.y * h, inst.y + q.x * s + q.y * c); wp = w; lp = vec3(p.x, w.y, p.z); ln = n;
  vn = vec3(n.x * c - n.z * s, n.y, n.x * s + n.z * c); vc = col; vm = mat; gl_Position = VP * vec4(w - C, 1.); }`, `#version 300 es
precision highp float; in vec3 vn, vc, wp, vm, lp, ln; uniform float AMB, RK; uniform vec3 E;
${SKYF}
layout(location=0) out vec4 o; layout(location=1) out vec4 ob;
float edge(float v) { float f = fract(v), e = min(f, 1. - f); return 1. - smoothstep(0., 1.2, e / max(fwidth(v), 1e-4)); }
void main() {
  float e = abs(ln.y) < 0.5 ? max(edge(lp.y), abs(ln.x) > 0.5 ? edge(lp.z) : edge(lp.x)) : max(edge(lp.x), edge(lp.z));
  e *= 1. - smoothstep(0.12, 0.35, fwidth(wp.y) + fwidth(wp.x) + fwidth(wp.z));     // the lines fade out before they crowd together
  vec3 N = vn, V = normalize(E - wp), R = reflect(-V, N); float rf = clamp(vm.x * RK, 0., 1.), gw = vm.y, nl = max(dot(N, SL), 0.);
  vec3 dif = vc * (sky(N) * AMB + SC * nl);
  float fr = rf * (0.6 + 0.4 * pow(1. - max(dot(N, V), 0.), 5.));      // more at grazing angles
  vec3 env = sky(R) * mix(vec3(1.), vc, 0.4), sp = SC * pow(max(dot(R, SL), 0.), mix(6., 220., rf)) * rf * 1.6 * step(0., dot(N, SL));
  vec3 c = mix(dif, env, fr) + sp; c *= 1. - 0.18 * e;
  vec3 em = mix(vc, vec3(1.), 0.15) * gw * 1.4; c += em;
  o = vec4(c, 1.); ob = vec4(em + max(sp - 0.6, 0.), 1.);
}`);
    bgP = mk(FSV, `#version 300 es
precision highp float; in vec2 uv; uniform mat4 IV; uniform vec3 EY;
${SKYF}
layout(location=0) out vec4 o; layout(location=1) out vec4 ob;
void main() { vec4 w = IV * vec4(uv * 2. - 1., 1., 1.); vec3 d = normalize(w.xyz / w.w - EY), s = SC * smoothstep(0.9985, 0.9995, dot(d, SL)); o = vec4(sky(d) + s, 1.); ob = vec4(s * 0.8, 1.); }`);
    blP = mk(FSV, `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D T; uniform vec2 D; out vec4 o;
void main() { vec3 c = texture(T, uv).rgb * 0.227; float w[4] = float[](0.194, 0.122, 0.054, 0.016);
  for (int i = 0; i < 4; i++) { vec2 d = D * float(i + 1); c += (texture(T, uv + d).rgb + texture(T, uv - d).rgb) * w[i]; } o = vec4(c, 1.); }`);
    coP = mk(FSV, `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D S, B; uniform float K; out vec4 o;
void main() { vec3 c = texture(S, uv).rgb + texture(B, uv).rgb * K; o = vec4(c / (1. + max(c - 1., 0.) * 0.6), 1.); }`);     // soft shoulder over 1
    const F = [[[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]], [[-1, 0, 0], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]], [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
               [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]], [[0, 0, 1], [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]]], [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]]];
    const v = []; for (const [n, q] of F) for (const k of [0, 1, 2, 0, 2, 3]) v.push(...q[k], ...n);
    vao0 = gl.createVertexArray();
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    ibuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ibuf);
    for (const [l, k, o] of [[2, 3, 0], [3, 3, 12], [4, 3, 24], [5, 1, 36]]) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, k, gl.FLOAT, false, 40, o); gl.vertexAttribDivisor(l, 1); }
    gl.bindVertexArray(null); return true;
  }
  /* the render targets, made again when the view changes size: 4x MSAA colour + glow + depth, resolved into textures */
  function targets(w, h) {
    if (FB && FB.w === w && FB.h === h) return FB;
    if (FB) { for (const t of FB.del) (t instanceof WebGLTexture ? gl.deleteTexture : t instanceof WebGLRenderbuffer ? gl.deleteRenderbuffer : gl.deleteFramebuffer).call(gl, t); }
    const del = [], ns = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
    const rb = (fmt) => { const r = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, r); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, ns, fmt, w, h); del.push(r); return r; };
    const tex = (tw, th) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, tw, th); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); del.push(t); return t; };
    const fb = (...att) => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); att.forEach(([pt, o]) => o instanceof WebGLTexture ? gl.framebufferTexture2D(gl.FRAMEBUFFER, pt, gl.TEXTURE_2D, o, 0) : gl.framebufferRenderbuffer(gl.FRAMEBUFFER, pt, gl.RENDERBUFFER, o)); del.push(f); return f; };
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1), sc = tex(w, h), gw = tex(w, h), b1 = tex(hw, hh), b2 = tex(hw, hh);
    FB = { w, h, hw, hh, del, sc, gw, b1, b2,
      ms: fb([gl.COLOR_ATTACHMENT0, rb(gl.RGBA8)], [gl.COLOR_ATTACHMENT1, rb(gl.RGBA8)], [gl.DEPTH_ATTACHMENT, rb(gl.DEPTH_COMPONENT24)]),
      fs: fb([gl.COLOR_ATTACHMENT0, sc]), fg: fb([gl.COLOR_ATTACHMENT0, gw]), f1: fb([gl.COLOR_ATTACHMENT0, b1]), f2: fb([gl.COLOR_ATTACHMENT0, b2]) };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); return FB;
  }
  function mat(fov, asp, eye, at) {
    const f = 1 / Math.tan(fov / 2), nr = 1, fr = 5000, P = [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (fr + nr) / (nr - fr), -1, 0, 0, 2 * fr * nr / (nr - fr), 0];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], nrm = a => { const l = Math.hypot(...a); return a.map(v => v / l); }, cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const zz = nrm(sub(eye, at)), xx = nrm(cr([0, 1, 0], zz)), yy = cr(zz, xx), V = [xx[0], yy[0], zz[0], 0, xx[1], yy[1], zz[1], 0, xx[2], yy[2], zz[2], 0, -dt(xx, eye), -dt(yy, eye), -dt(zz, eye), 1];
    const R = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += P[k * 4 + r] * V[c * 4 + k]; R[c * 4 + r] = s; } return R;
  }
  function inv4(a) {         // a 4x4 inverse (column-major), for the sky's view rays
    const o = new Float32Array(16);
    o[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
    o[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
    o[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
    o[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
    o[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
    o[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
    o[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
    o[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
    o[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
    o[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
    o[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
    o[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
    o[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
    o[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
    o[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
    o[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
    const d = a[0] * o[0] + a[1] * o[4] + a[2] * o[8] + a[3] * o[12]; for (let i = 0; i < 16; i++) o[i] /= d; return o;
  }
  /* instances: 10 floats each — x, z (px centre), height, r, g, b, reflectivity, glow, base, angle */
  const data = n => { if (inst.length < n * 10) inst = new Float32Array(n * 10); return inst; };
  const upload = n => { nInst = n; gl.bindBuffer(gl.ARRAY_BUFFER, ibuf); gl.bufferData(gl.ARRAY_BUFFER, inst.subarray(0, n * 10), gl.DYNAMIC_DRAW); };
  /* cam: yaw, pitch (radians), dist, target tx, ty, tz; the sun: az (the game's screen angle toward it), el */
  function draw(cam, sun) {
    const dpr = Math.min(devicePixelRatio || 1, 2), cw = cv.clientWidth, chh = cv.clientHeight; if (!cw || !chh) return;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(chh * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(chh * dpr); }
    const T = targets(cv.width, cv.height), SL = [Math.cos(sun.el) * Math.cos(sun.az), Math.sin(sun.el), Math.cos(sun.el) * Math.sin(sun.az)], SC = SKY.sun.map(v => v * SKY.k);
    const cp = Math.cos(cam.pitch), eye = [cam.dist * cp * Math.sin(cam.yaw), cam.dist * Math.sin(cam.pitch), cam.dist * cp * Math.cos(cam.yaw)], VP = mat(0.7, cw / chh, eye, [0, cam.ty, 0]);
    const sky = P => { gl.uniform3fv(U(P, 'ZEN'), SKY.zen); gl.uniform3fv(U(P, 'HOR'), SKY.hor); gl.uniform3fv(U(P, 'GND'), SKY.gnd); gl.uniform3fv(U(P, 'SL'), SL); gl.uniform3fv(U(P, 'SC'), SC); };
    // the scene, multisampled: sky behind, then the voxels
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.ms); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]); gl.viewport(0, 0, T.w, T.h);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(bgP); gl.bindVertexArray(vao0); sky(bgP); gl.uniformMatrix4fv(U(bgP, 'IV'), false, inv4(VP)); gl.uniform3fv(U(bgP, 'EY'), eye); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    gl.useProgram(prog); gl.bindVertexArray(vao); sky(prog);
    gl.uniformMatrix4fv(U(prog, 'VP'), false, VP); gl.uniform3f(U(prog, 'C'), cam.tx, 0, cam.tz); gl.uniform3f(U(prog, 'E'), eye[0] + cam.tx, eye[1], eye[2] + cam.tz);
    gl.uniform1f(U(prog, 'AMB'), SKY.amb); gl.uniform1f(U(prog, 'RK'), RK);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, nInst); gl.bindVertexArray(null);
    // resolve both targets
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    for (const [k, f] of [[0, T.fs], [1, T.fg]]) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.ms); gl.readBuffer(gl.COLOR_ATTACHMENT0 + k); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, f); gl.blitFramebuffer(0, 0, T.w, T.h, 0, 0, T.w, T.h, gl.COLOR_BUFFER_BIT, gl.NEAREST); }
    // bloom: the glow blurred twice at half size (wider the second time), then added
    gl.useProgram(blP); gl.bindVertexArray(vao0); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(U(blP, 'T'), 0); gl.viewport(0, 0, T.hw, T.hh);
    const pass = (src, dst, dx, dy) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform2f(U(blP, 'D'), dx, dy); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    { const px = 1 / T.hw, py = 1 / T.hh; pass(T.gw, T.f1, px * 1.5, 0); pass(T.b1, T.f2, 0, py * 1.5); pass(T.b2, T.f1, px * 3.5, 0); pass(T.b1, T.f2, 0, py * 3.5); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, T.w, T.h); gl.useProgram(coP);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.sc); gl.uniform1i(U(coP, 'S'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.b2); gl.uniform1i(U(coP, 'B'), 1); gl.uniform1f(U(coP, 'K'), BK * 1.6);
    gl.drawArrays(gl.TRIANGLES, 0, 3); gl.activeTexture(gl.TEXTURE0); gl.bindVertexArray(null);
  }
  return { init, data, upload, draw };
})();
