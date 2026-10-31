// Runs the tests for what changed, in parallel, with timings.
//   node tools/test.mjs              the tests covering src files changed since the last commit (git diff + untracked)
//   node tools/test.mjs t18 t26      those tests            node tools/test.mjs --all    every test
//   node tools/test.mjs --since HEAD~3                       what changed since that commit
//   --seed n   the harness seeds Math.random (1 by default), so a run repeats exactly; another seed shakes out flaky setups
// A test names what it covers on its second line: "// covers: 3_sim 6_menus" (src file names, no .js).
// A change to the harness, build.py or 1_core runs every test (everything depends on them); render-only files
// (0_gx, 5b_fog, 5e_light...) aren't covered by node tests: check those with tools/scene.mjs.
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), si = args.indexOf('--since'), since = si >= 0 ? args.splice(si, 2)[1] : 'HEAD', ei = args.indexOf('--seed'), seed = ei >= 0 ? args.splice(ei, 2)[1] : '1', all = args.includes('--all');
const names = args.filter(a => !a.startsWith('--'));
const tests = fs.readdirSync(path.join(ROOT, 'tests')).filter(f => f.endsWith('.js')).map(f => {
  const m = fs.readFileSync(path.join(ROOT, 'tests', f), 'utf8').match(/^\/\/ covers: (.+)$/m);
  return { f, n: f.slice(0, -3), covers: m ? m[1].trim().split(/\s+/) : null };
});
let pick, why;
if (all) { pick = tests; why = 'all'; }
else if (names.length) { pick = tests.filter(t => names.some(n => t.n === n || t.n.startsWith(n + '_'))); why = names.join(' '); }
else {
  const git = c => { try { return execSync(c, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); } catch (_) { return []; } };
  const changed = [...git(`git diff --name-only ${since}`), ...git('git ls-files --others --exclude-standard')];
  const src = changed.filter(f => /^src\/.+\.js$/.test(f)).map(f => path.basename(f, '.js'));
  const everything = changed.some(f => f === 'harness.js' || f === 'build.py' || f === 'src/1_core.js');
  const newTests = changed.filter(f => /^tests\/[^/]+\.js$/.test(f)).map(f => path.basename(f, '.js'));
  pick = tests.filter(t => everything || !t.covers || newTests.includes(t.n) || t.covers.some(c => src.includes(c)));
  why = everything ? 'core/harness changed: all' : 'changed: ' + ([...src, ...newTests].join(' ') || 'nothing');
}
console.log(`${why} -> ${pick.length} test(s): ${pick.map(t => t.n).join(' ')}`);
const jobs = Math.max(1, Math.min(pick.length, os.cpus().length - 2)), t0 = Date.now(), res = [];
const run = t => new Promise(r => {
  const s = Date.now(), p = spawn(process.execPath, [path.join('tests', t.f)], { cwd: ROOT, env: { ...process.env, TEST_SEED: seed } });
  let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  const kill = setTimeout(() => { p.kill(); out += '\nTIMEOUT'; }, 300000);
  p.on('close', code => {
    clearTimeout(kill);
    const fails = out.split('\n').filter(l => /FAIL|Error|TIMEOUT/.test(l)), errs = (out.match(/errs (\d+)/g) || []).map(e => +e.split(' ')[1]).reduce((a, b) => a + b, 0);
    const bad = fails.length > 0 || errs > 0 || code !== 0;
    res.push({ n: t.n, bad }); console.log(`${bad ? 'FAIL' : 'ok  '} ${t.n.padEnd(14)} ${((Date.now() - s) / 1000).toFixed(1).padStart(5)} s${bad ? '\n     ' + (fails.join('\n     ') || 'errs ' + errs + ' / exit ' + code) : ''}`);
    r();
  });
});
const queue = [...pick]; await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) await run(queue.shift()); }));
const bad = res.filter(r => r.bad);
console.log(`${res.length - bad.length}/${res.length} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s (${jobs} at a time, seed ${seed})${bad.length ? ' · failed: ' + bad.map(r => r.n).join(' ') : ''}`);
process.exit(bad.length ? 1 : 0);
