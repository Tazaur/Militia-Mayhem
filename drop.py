"""An art drop in one go: python drop.py <png> [<png>]   (--check: only check them and say what changed; --no-push: stop after the commit)

Takes the heightmap editor's exports (atlas_m.png, atlas.png; either or both, any names: the opaque one is the material
atlas, the one with transparency the art), checks them (the sizes match, the atlas's table in atlas_m reads and fits: atlas_table.py), puts them in, builds,
runs the tests, notes what changed in CONTEXT.md, commits, pushes and waits for GitHub Pages to serve the build. The
table the atlas carries (its sprites' rects and pivots, undersides, what stands on what) needs nothing else: a resized
atlas or new sprites from the editor come in the same way, and the build makes atlas.json from it."""
import glob, json, shutil, subprocess, sys, time, urllib.request
import atlas_table
import numpy as np
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]; flags = set(sys.argv[1:]) - set(args)
if flags - {'--check', '--no-push'}: sys.exit('drop: unknown ' + ' '.join(flags - {'--check', '--no-push'}) + '\n' + __doc__)
push, check = '--no-push' not in flags, '--check' in flags
if not args: sys.exit(__doc__)
meta = json.load(open('atlas.json')); W, H = Image.open('atlas.png').size
def die(m): sys.exit('drop: ' + m)

new = {}
for p in args:
    im = Image.open(p).convert('RGBA'); a = np.array(im)
    k = 'atlas_m.png' if (a[..., 3] == 255).all() else 'atlas.png'
    if k in new: die(f'two {k} files given')
    new[k] = (p, a)
sizes = {a.shape[1::-1] for _, a in new.values()}
if len(sizes) > 1: die('the two PNGs are different sizes')
W2, H2 = sizes.pop()
if 'atlas_m.png' not in new and (W2, H2) != (W, H): die(f'{args[0]} is {W2}x{H2}, the atlas is {W}x{H} (a resized atlas needs its atlas_m too: the table is in it)')
if (W2, H2) != (W, H) and 'atlas.png' not in new: die(f'atlas_m is {W2}x{H2}, the art is {W}x{H}: send both')

meta2 = meta
if 'atlas_m.png' in new:          # the atlas's table (atlas_table.py): every sprite, the pool, undersides, what stands on what
    cfg = atlas_table.read(new['atlas_m.png'][1])
    if not cfg: die("atlas_m's table doesn't read (painted over, or not from the editor?)")
    bad = atlas_table.check(cfg, W2, H2)
    if bad: die('; '.join(bad))
    meta2 = atlas_table.meta(cfg, W2, H2)

# what changed, by sprite name (the art only where it's visible); sprites added / taken out / moved
def crop(a, r): return a[r[1]:r[1] + r[3], r[0]:r[0] + r[2]]
def changed(k, a):
    o = np.array(Image.open(k).convert('RGBA')); vis = lambda x: np.where(x[..., 3:] > 0, x, 0) if k == 'atlas.png' else x[..., :3]
    out = [n for n, r in meta2.items() if n[0] != '_' and n in meta and meta[n][2:4] == r[2:4] and (vis(crop(a, r)) != vis(crop(o, meta[n]))).any()]
    if k == 'atlas_m.png':
        P, P0 = meta2['_pool'], meta['_pool']
        if P[2:4] != P0[2:4] or (crop(a, P)[..., :3] != crop(o, P0)[..., :3]).any(): out.append('pool')
    return out
add = [n for n in meta2 if n[0] != '_' and n not in meta]; gone = [n for n in meta if n[0] != '_' and n not in meta2]
moved = [n for n in meta2 if n[0] != '_' and n in meta and meta2[n] != meta[n]]
notes = []
if (W2, H2) != (W, H): notes.append(f'atlas {W}x{H} -> {W2}x{H2}')
for t, L in (('new sprites', add), ('taken out', gone), ('rect / pivot', moved)):
    if L: notes.append(t + ': ' + ', '.join(L))
for k, (p, a) in new.items():
    c = changed(k, a); notes.append(f'{k}: ' + (', '.join(c) if c else 'no paint change'))
    if check: continue
    if k == 'atlas.png': shutil.copyfile(p, k)
    else: Image.fromarray(a[..., :3]).save(k, optimize=True)
print('\n'.join(notes))
if check: sys.exit(0)

def run(*c):
    r = subprocess.run(c); r.returncode and die(' '.join(c) + ' failed')
run(sys.executable, 'build.py')
from concurrent.futures import ThreadPoolExecutor     # the tests side by side (each its own node)
with ThreadPoolExecutor(10) as ex: rc = dict(zip(sorted(glob.glob('tests/*.js')), ex.map(lambda t: subprocess.run(['node', t], capture_output=True).returncode, sorted(glob.glob('tests/*.js')))))
fails = [t for t, c in rc.items() if c]
if fails: die('tests failed: ' + ', '.join(fails) + ' (the files are in and built; nothing committed)')
v = json.load(open('version.json'))['build']; print('build', v, 'tests ok')

with open('CONTEXT.md', 'a', encoding='utf-8') as f: f.write(f'\n## Build {v}\nArt drop (drop.py): ' + '; '.join(notes) + '.\n')
run('git', 'add', 'atlas.png', 'atlas_m.png', 'atlas.json', 'index.html', 'combined-arms.html', 'version.json', 'CONTEXT.md')
run('git', 'commit', '-qm', f'Art drop, build {v}: ' + '; '.join(notes))
if not push: sys.exit(0)
run('git', 'push', '-q', 'origin', 'main')
for _ in range(40):
    try:
        if json.loads(urllib.request.urlopen(f'https://tazaur.github.io/Militia-Mayhem/version.json?t={time.time()}', timeout=10).read())['build'] == v: print('live', v); break
    except Exception: pass
    time.sleep(10)
else: print('pushed; Pages hasn\'t served', v, 'yet')
