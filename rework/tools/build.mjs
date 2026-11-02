// Owns: building src/ into the one file served at /rework/, and the shared build number (rule P8).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { generateAtlasTable } from './gen-atlas-table.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_FILE = path.join(ROOT, '..', 'version.json');

function sourceHash(directory, hash = crypto.createHash('sha1')) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) sourceHash(full, hash);
    // Git may check files out with CRLF on Windows. That must not count as a source change.
    else if (entry.name.endsWith('.png')) hash.update(entry.name).update(fs.readFileSync(full));
    else hash.update(entry.name).update(fs.readFileSync(full, 'utf8').replaceAll('\r\n', '\n'));
  }
  return hash;
}

/** The old game's build.py keeps `build` and its own `hash`. The number goes up when either game's source changes. */
function nextBuild() {
  const version = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
  const hash = sourceHash(path.join(ROOT, 'assets'), sourceHash(path.join(ROOT, 'src')))
    .update(PAGE)
    .digest('hex');
  if (version.rework_hash !== hash) {
    version.build += 1;
    version.rework_hash = hash;
    fs.writeFileSync(VERSION_FILE, JSON.stringify(version));
  }
  return version.build;
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Militia Mayhem</title>
<style>
html,body{margin:0;height:100%;background:#000;overflow:hidden;touch-action:none}
canvas{display:block;position:fixed;inset:0;width:100%;height:100%}
</style>
</head>
<body>
<script>/*GAME*/</script>
</body>
</html>
`;

generateAtlasTable(ROOT);
const build = nextBuild();
const dataUrl = (file) => `data:image/png;base64,${fs.readFileSync(path.join(ROOT, file)).toString('base64')}`;
const result = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/app/main.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2022',
  write: false,
  define: { BUILD_NUMBER: String(build), ATLAS_COLOR_URL: JSON.stringify(dataUrl('assets/atlas.png')) },
});
const code = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
const html = PAGE.replace('/*GAME*/', () => code);
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log(`build ${build}: index.html ${(html.length / 1024).toFixed(1)} KB`);
