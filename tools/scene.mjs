// Runs a dev scene (src/5g_test.js) headless in Chrome: screenshots + a log. No server needed (it serves the repo itself).
//   node tools/scene.mjs <scene> [params as JSON] [--map outskirts] [--bots 0] [--shots 0.5,2] [--size 1280x720] [--phone] [--out dir] [--keep-hud]
//   node tools/scene.mjs list                       the scenes, spots and switches
// params: any of the scene's (see SCENES / TEST_KEYS), e.g. '{"at":{"BESIDE":"husk tank"},"smoke":["INSIDE"],"cam":"INSIDE","zoom":1.5}'
// shots: seconds of game time after the scene is laid out; each one is <out>/<scene>_<t>.png. The log: <out>/<scene>.log
// --gpu: this machine's GPU (D3D11, WebGPU on), frame rate unlocked, not SwiftShader;  --cfg '{"lightQ":2}': settings first
// --bench S: after the last shot, S s of frames timed (uncapped): mean / p95 frame ms, fps, and the GPU stages if timers work
// --probe EXPR: an expression evaluated after the bench, its value added to the BENCH line
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf('--' + k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; }, bool = k => { const i = args.indexOf('--' + k); if (i < 0) return false; args.splice(i, 1); return true; };
const map = flag('map', 'outskirts'), bots = +flag('bots', 0), shots = flag('shots', '0.6').split(',').map(Number), size = flag('size', '1280x720').split('x').map(Number);
const cfg = JSON.parse(flag('cfg', '{}')), bench = +flag('bench', 0), gpu = bool('gpu');
const probe = flag('probe', '');     // --probe EXPR: its value (JSON) after the bench line
const phone = bool('phone'), keepHud = bool('keep-hud'), out = path.resolve(flag('out', path.join(os.tmpdir(), 'mm-scenes')));
const scene = args[0] || 'window', over = args[1] ? JSON.parse(args[1]) : {};
const [vw, vh] = phone ? [844, 390] : size;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => fs.existsSync(p));
if (!CHROME) { console.error('no Chrome found'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

// the repo, served
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port, dbg = 9300 + (process.pid % 500);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + dbg, '--user-data-dir=' + path.join(out, '.prof'), `--window-size=${vw},${vh}`, '--autoplay-policy=no-user-gesture-required', ...(gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--disable-gpu-vsync', '--disable-frame-rate-limit'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), 'about:blank'], { stdio: 'ignore' });
let list; for (let k = 0; k < 40; k++) { try { list = await (await fetch(`http://127.0.0.1:${dbg}/json`)).json(); if (list.find(t => t.type === 'page')) break; } catch (_) { } await sleep(250); }
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}, errs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m.result || m.error); delete pend[m.id]; } if (m.method === 'Runtime.exceptionThrown') errs.push('EXCEPTION ' + (m.params.exceptionDetails.exception || {}).description); if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) errs.push('console.' + m.params.type + ' ' + m.params.args.map(a => a.value || a.description).join(' ')); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const js = async x => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result && r.result.value; };
const until = async (x, ms = 15000) => { for (let t = 0; t < ms; t += 100) { if (await js(x)) return true; await sleep(100); } return false; };
const done = code => { ws.close(); ch.kill(); srv.close(); process.exit(code); };

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: phone ? 2 : 1, mobile: phone });
if (phone) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
if (!await until("typeof testStart === 'function' && typeof imgReady !== 'undefined' && imgReady")) { console.error('the game did not load', errs.join('\n')); done(1); }
if (scene === 'list') { console.log(await js("JSON.stringify({ scenes: Object.fromEntries(Object.entries(SCENES).map(([k, s]) => [k, s.n])), spots: [...TEST_SPOTS, 'WINDOW', 'ROOF', 'PLAYER'], what: TEST_WHAT, switches: Object.fromEntries(Object.entries(TEST_KEYS).map(([k, K]) => [k, K.o])) }, null, 1)")); done(0); }
await js(`Object.assign(CFG, ${JSON.stringify(cfg)}); if (typeof resize === 'function') resize()`);
await js(`testStart(${JSON.stringify(map)}, ${bots})`); await sleep(800);
const ok = await js(`(TEST.bare = ${!keepHud}, testRun(${JSON.stringify(scene)}, ${JSON.stringify(keepHud ? over : { hud: false, ...over })}))`);
if (!ok) { console.error('the scene did not lay out:', await js('DEV.log.map(l => l.text).join(" | ")')); done(1); }
const files = [];
for (const t of shots) {
  await until(`M.time - TEST.t0 >= ${t}`, 20000 + t * 3000);
  const r = await send('Page.captureScreenshot', { format: 'png' }), f = path.join(out, `${scene}_${t}.png`);
  fs.writeFileSync(f, Buffer.from(r.data, 'base64')); files.push(f);
}
let bres = '';
if (bench) {     // frames timed by rAF (the page's own loop draws them); the GPU stages from the FPS counter's timers when there are some
  await js(`(window._bt = [], CFG.fps = 3, (function f(t) { if (window._bp) window._bt.push(t - window._bp); window._bp = t; if (window._bt.length < 1e5) requestAnimationFrame(f); })(performance.now()), 1)`);
  await sleep(bench * 1000);
  const b = await js(`(() => { const a = window._bt.slice(10).sort((x, y) => x - y), n = a.length, m = a.reduce((x, y) => x + y, 0) / n; return { n, mean: m, p95: a[Math.floor(n * 0.95)], gt: GPUP.X ? GPUP.out.reduce((a, e) => a + e[1], 0) : 0, gpu: GPUP.X ? GPUP.out.map(([k, v]) => k + ' ' + v.toFixed(2)).join(' · ') : 'n/a', light: typeof HS !== 'undefined' ? HS : 0 } })()`);
  if (probe) b.gpu += ' · PROBE ' + JSON.stringify(await js(probe));
  bres = `BENCH ${b.n} frames · mean ${b.mean.toFixed(2)} ms (${(1000 / b.mean).toFixed(0)} fps) · p95 ${b.p95.toFixed(2)} ms · light ${b.light} · GPU ${b.gt.toFixed(2)} ms: ${b.gpu}`;
}
if (probe && !bench) bres = 'PROBE ' + JSON.stringify(await js(probe));
const st = await js('testState()');
const text = [`${scene} on ${st.map} · ${st.time} s · ${st.fps} fps`, '', ...st.log, '', 'SPOTS ' + JSON.stringify(st.spots), '', 'SOLDIERS', ...st.soldiers.map(s => '  ' + JSON.stringify(s)), 'VEHICLES', ...st.vehicles.map(v => '  ' + JSON.stringify(v)), 'WRECKS ' + JSON.stringify(st.wrecks), ...(st.wck ? ['SHADOW CACHE CHECK ' + JSON.stringify(st.wck)] : []), '', ...(errs.length ? ['ERRORS', ...errs] : ['no errors'])].join('\n');
fs.writeFileSync(path.join(out, scene + '.log'), text);
for (const [k, u] of Object.entries(await js('JSON.stringify(TEST.wckPng || {})').then(JSON.parse))) fs.writeFileSync(path.join(out, `${scene}_wck_${k}.png`), Buffer.from(u.split(',')[1], 'base64'));     // the shadow cache check's worst frames
console.log(text + '\n\n' + files.join('\n') + (bres ? '\n' + bres : ''));
done(errs.length ? 2 : 0);
