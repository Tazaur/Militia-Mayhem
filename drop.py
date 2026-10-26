"""An art drop in one go: python drop.py <png> [<png>]   (--check: only check them and say what changed; --no-push: stop after the commit)

Takes the heightmap editor's exports (atlas_m.png, atlas.png; either or both, any names: the opaque one is the material
atlas, the one with transparency the art), checks them (the atlas's size, the settings strip reads), puts them in, builds,
runs the tests, notes what changed in CONTEXT.md, commits, pushes and waits for GitHub Pages to serve the build. The
settings the atlas carries (undersides, states without them) need nothing else: the game reads them from atlas_m."""
import glob, json, shutil, subprocess, sys, time, urllib.request
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
    if im.size != (W, H): die(f'{p} is {im.size[0]}x{im.size[1]}, the atlas is {W}x{H}')
    k = 'atlas_m.png' if (a[..., 3] == 255).all() else 'atlas.png'
    if k in new: die(f'two {k} files given')
    new[k] = (p, a)

def cfg_of(M):          # the settings strip: 2 bytes of length, then UTF-8 JSON over G / B, row by row
    C = meta.get('_cfg')
    if not C: return {}
    b = M[C[1]:C[1] + C[3], :, 1:3].reshape(-1); n = int(b[0]) << 8 | int(b[1])
    return json.loads(bytes(b[2:2 + n]).decode()) if n else {}
if 'atlas_m.png' in new:
    try: cfg = cfg_of(new['atlas_m.png'][1])
    except ValueError: die('the settings strip in atlas_m doesn\'t read (painted over?)')
    P = meta['_pool']
    for b, r in cfg.get('under', {}).items():
        if r[0] < 0 or r[1] < 0 or r[0] + r[2] > P[2] or r[1] + r[3] > P[3]: die(f'under_{b} {r} is outside the pool')
    for n, u in cfg.get('use', {}).items():          # what each sprite stands on: a pool underside or a sprite
        if u not in meta and u[6:] not in cfg.get('under', {}): die(f'{n} stands on {u}, which isn't there')
    print('settings', json.dumps(cfg))

# what changed, by sprite (the art only where it's visible)
def changed(k, a):
    o = np.array(Image.open(k).convert('RGBA'))
    if k == 'atlas_m.png': d = (a[..., :3] != o[..., :3]).any(-1)
    else: d = (np.where(a[..., 3:] > 0, a, 0) != np.where(o[..., 3:] > 0, o, 0)).any(-1)
    out = [n for n, v in meta.items() if n[0] != '_' and d[v[1]:v[1] + v[3], v[0]:v[0] + v[2]].any()]
    for n in ('_pool', '_cfg'):
        v = meta.get(n)
        if v and d[v[1]:v[1] + v[3]].any(): out.append(n[1:])
    return out
notes = []
for k, (p, a) in new.items():
    c = changed(k, a); notes.append(f'{k}: ' + (', '.join(c) if c else 'no change'))
    if check: continue
    if k == 'atlas.png': shutil.copyfile(p, k)
    else: Image.fromarray(a[..., :3]).save(k, optimize=True)
print('\n'.join(notes))
if check: sys.exit(0)

def run(*c):
    r = subprocess.run(c); r.returncode and die(' '.join(c) + ' failed')
run(sys.executable, 'build.py')
fails = [t for t in sorted(glob.glob('tests/*.js')) if subprocess.run(['node', t], capture_output=True).returncode]
if fails: die('tests failed: ' + ', '.join(fails) + ' (the files are in and built; nothing committed)')
v = json.load(open('version.json'))['build']; print('build', v, 'tests ok')

with open('CONTEXT.md', 'a', encoding='utf-8') as f: f.write(f'\n## Build {v}\nArt drop (drop.py): ' + '; '.join(notes) + '.\n')
run('git', 'add', 'atlas.png', 'atlas_m.png', 'index.html', 'combined-arms.html', 'version.json', 'CONTEXT.md')
run('git', 'commit', '-qm', f'Art drop, build {v}: ' + '; '.join(notes))
if not push: sys.exit(0)
run('git', 'push', '-q', 'origin', 'main')
for _ in range(40):
    try:
        if json.loads(urllib.request.urlopen(f'https://tazaur.github.io/Militia-Mayhem/version.json?t={time.time()}', timeout=10).read())['build'] == v: print('live', v); break
    except Exception: pass
    time.sleep(10)
else: print('pushed; Pages hasn\'t served', v, 'yet')
