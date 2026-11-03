// Owns: loading the built page in headless Chrome at phone size: any error fails, and a screenshot is saved to look at.
//   node tools/smoke.mjs [--out dir] [--size 844x390] [--scale 2.09] [--no-timers]
//     [--taps n] [--settle ms] [--real-gpu]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const out = option('out', path.join(os.tmpdir(), 'mm-rework'));
const [width, height] = option('size', '844x390').split('x').map(Number);
const scale = Number(option('scale', '2.09'));
const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
];
const chrome = CHROMES.find((candidate) => fs.existsSync(candidate));
if (!chrome) throw new Error('no Chrome found');
fs.mkdirSync(out, { recursive: true });

const page = fs.readFileSync(path.join(ROOT, 'index.html'));
const server = http.createServer((_, response) => {
  response.setHeader('content-type', 'text/html');
  response.end(page);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const debugPort = 9800 + (process.pid % 150);
const browser = spawn(chrome, [
  '--headless=new',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${path.join(out, '.profile')}`,
  // The software renderer gives the same picture on any machine; --real-gpu times the machine's own GPU.
  ...(process.argv.includes('--real-gpu') ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
  'about:blank',
]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const errors = [];
try {
  let target;
  for (let attempt = 0; attempt < 50 && !target; attempt++) {
    await sleep(200);
    try {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      target = targets.find((candidate) => candidate.type === 'page');
    } catch {
      // Chrome is still starting.
    }
  }
  if (!target) throw new Error('Chrome did not start');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => (socket.onopen = resolve));
  let nextId = 1;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      pending.get(message.id)?.(message.result ?? message.error);
      pending.delete(message.id);
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: true });
  if (process.argv.includes('--no-timers')) {
    const source = `{
      const real = WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension = function (name) {
        return name === 'EXT_disjoint_timer_query_webgl2' ? null : real.call(this, name);
      };
    }`;
    await send('Page.addScriptToEvaluateOnNewDocument', { source });
  }
  await send('Page.navigate', { url });
  await sleep(5000);

  const facts = await evaluate(`(() => {
    const canvas = document.querySelector('canvas');
    const errorBox = document.querySelector('pre');
    return JSON.stringify({
      canvas: canvas && [canvas.width, canvas.height],
      errorBox: errorBox && errorBox.textContent,
    });
  })()`);
  const { canvas, errorBox } = JSON.parse(facts);
  if (errorBox) errors.push(errorBox);
  if (!canvas) errors.push('no canvas');
  const taps = Number(option('taps', '0'));
  if (taps > 0) {
    await evaluate(`for (let i = 0; i < ${taps}; i++) {
      document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown'));
    }`);
    await sleep(Number(option('settle', '1500')));
  }
  const reportText = await evaluate(`(() => {
    let copied = null;
    const real = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (text) => ((copied = text), Promise.resolve()) },
      configurable: true,
    });
    document.querySelector('button').click();
    if (real) Object.defineProperty(navigator, 'clipboard', { value: real, configurable: true });
    return copied;
  })()`);
  if (!reportText || !reportText.startsWith('MM REPORT')) errors.push('no report from the button');
  else fs.writeFileSync(path.join(out, 'report.txt'), reportText);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const shotFile = path.join(out, 'smoke.png');
  fs.writeFileSync(shotFile, Buffer.from(shot.data, 'base64'));
  console.log(`smoke: canvas ${canvas}, screenshot ${shotFile}`);
  socket.close();
} finally {
  browser.kill();
  server.close();
}
if (errors.length) {
  console.error(`smoke: errors\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('smoke: clean');
process.exit(0);
