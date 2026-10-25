"""Repack the atlas: only the sprites the game draws, related sprites kept together in rows.
Colours are NOT baked in: soldiers ship one dark-green base per pose (white armband), the turret stripe and jeep emblem ship
in white, and the game recolours them once at load (src/1_core.js buildTeamSprites) and caches the result.

The atlas itself is the source of truth: every sprite already in it is copied pixel-for-pixel (hand edits to atlas.png survive
a repack). Source files are only read for sprites the atlas doesn't have yet: soldier bases + shadows (art/art3/sheet.png),
HUD icons (art/art4/icons.png), MG / dead turret / sandbag crescents (mounts.py). `python atlas_pack.py --sync` writes atlas
edits of the 1:1 sprites (icons, MGs, dead turret) back into their source files.

atlas_m.png is the material atlas, same layout, opaque (the silhouette is atlas.png's alpha): R = height above the object's
base, 4 per px (0..63 px), G = reflectivity, B = glow. Painted in heightmap/ (the editor); a repack carries every sprite's
material along with it, and a sprite that has none gets a first pass from its outline (rounded edges, flat top, a little
relief from the art's shading). `--remat` regenerates them all."""
from PIL import Image
import numpy as np, json, os, sys
SYNC = '--sync' in sys.argv; REMAT = '--remat' in sys.argv
os.chdir(os.path.dirname(os.path.abspath(__file__)))
from mounts import mount_sprites, bag_frames

meta = json.load(open('atlas.json')); meta.pop('_strip', None)
A = np.array(Image.open('atlas.png').convert('RGBA'))
extra = json.load(open('atlas_extra.json'))
def old(n): x, y, w, h, px, py = meta[n]; return (A[y:y + h, x:x + w].copy(), px, py)
AM = np.array(Image.open('atlas_m.png').convert('RGB')) if os.path.exists('atlas_m.png') and not REMAT else None

S = {}                                            # name -> (arr, px, py)
# ---- vehicles: hulls, jeeps, turret (body + separate cannon), wreck parts, mounted MG, white paint pieces
for n in ['hull%d' % i for i in range(6)] + ['jeep%d' % i for i in range(5)]: S[n] = old(n)
# ---- jeep v3 (art/art4/jeep.png, front to the right): five frames (100 / 75 / 50 / 25 % / wreck, pivots found by overlaying
# them on the v2 frame 0), the hood decal, a front tyre seen from above, a broken-off wheel and a flattened one, and the
# mounted MG (idle / firing, drawn 2 px kicked back / destroyed). Imported once (extra.jeepV), then the atlas copies are the
# source like everything else
if extra.get('jeepV') != 3:
    J = np.array(Image.open('art/art4/jeep.png').convert('RGBA'))
    def cut(x0, y0, x1, y1, px, py):                   # window, pivot in sheet coordinates -> tight sprite
        c = J[y0:y1, x0:x1]; ys, xs = np.where(c[:, :, 3] > 0)
        return c[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy(), px - x0 - xs.min(), py - y0 - ys.min()
    def piece(x0, y0, x1, y1):
        c, _, _ = cut(x0, y0, x1, y1, 0, 0); return c, c.shape[1] / 2, c.shape[0] / 2
    for i, w in enumerate([(0, 0, 87, 45, 44, 22), (96, 0, 184, 45, 140, 22), (0, 46, 89, 90, 44, 67), (96, 46, 185, 90, 140, 67), (1, 90, 90, 136, 45, 112)]):
        S['jeep%d' % i] = cut(*w)
    d = piece(116, 97, 127, 112); a = d[0]; L = a[:, :, 0].astype(int)
    a[:, :, 0] = a[:, :, 1] = a[:, :, 2] = np.where(L >= 185, 245, np.where(L >= 120, 200, L))   # greys onto the tint's bands: paint, shade, dark
    S['decal'] = d; S['jeep_tire'] = piece(112, 116, 131, 122); S['jeep_wheel'] = piece(142, 108, 162, 128); S['jeep_flat'] = piece(166, 109, 187, 127)
    S['mg'] = cut(201, 36, 238, 51, 207.5, 45.5); S['mg_f'] = cut(200, 54, 250, 77, 208.5, 65.5); S['mg_dead'] = cut(201, 80, 237, 95, 207.5, 89.5)
    extra['jeepStar'] = [24, 0]                        # hood centre, from the pivot
    extra['jeepWells'] = [[24, 16], [-22, 16]]         # front / rear wheel well centres (and mirrored to -y)
    extra['jeepV'] = 3
if 'tur11' in meta:                               # first run: split the full-length turret frame into body + cannon
    t, px, py = old('tur11'); CUT = 51            # columns 0..50 = turret + mantlet (identical in every recoil frame)
    S['tur'] = (t[:, :CUT].copy(), px, py); S['tur_gun'] = (t[:, CUT:].copy(), px - CUT, py)
else: S['tur'] = old('tur'); S['tur_gun'] = old('tur_gun')
# ---- undersides (heights only, never drawn): the hull / jeep silhouette, its art greyed as a guide for painting in heightmap/;
# the game hangs them under the lifted body (SUNP under), so the shadow has tracks / wheels with light between
for n, b in (('under_tank', 'hull0'), ('under_jeep', 'jeep0')):
    if n in meta: S[n] = old(n)
    else: a, px, py = old(b); g = a.copy(); L = (a[:, :, :3].astype(float) @ [0.3, 0.59, 0.11]) * 0.45; g[:, :, 0] = g[:, :, 1] = g[:, :, 2] = L.astype(np.uint8); S[n] = (g, px, py)
S['bar'] = old('bar' if 'bar' in meta else 'bar_white')
if 'decal' not in S: S['decal'] = old('decal' if 'decal' in meta else 'decal_white')
for n in ['jeep_tire', 'jeep_wheel', 'jeep_flat']:
    if n not in S: S[n] = old(n)
for n, v in mount_sprites(np.array(Image.open('art/art4/mounts.png').convert('RGBA'))).items():
    if n not in S: S[n] = old(n) if n in meta else v
if SYNC:
    MT = np.array(Image.open('art/art4/mounts.png').convert('RGBA'))
    for n, (y, x, h, w) in {'tur_dead': (0, 128, 42, 128)}.items():
        box = MT[y:y + h, x:x + w]; ys, xs = np.where(box[:, :, 3] > 0); a = old(n)[0]
        assert a.shape[:2] == (ys.max() + 1 - ys.min(), xs.max() + 1 - xs.min()), n
        box[ys.min():ys.max() + 1, xs.min():xs.max() + 1] = a
    Image.fromarray(MT).save('art/art4/mounts.png')
# ---- effects
for n in ['smoke0', 'smoke1', 'smoke2', 'smoke3', 'boom0', 'boom1', 'boom2', 'dust0', 'dust1', 'fire0', 'fire1', 'fire2', 'fire3', 'fire4', 'fire5']: S[n] = old(n)
# ---- soldiers: one base per pose (artist's colours: dark green uniform, white armband) + shadows
NS = np.array(Image.open('art/art3/sheet.png').convert('RGBA'))
GREENS = [(29, 30, 17), (71, 74, 37), (112, 119, 52)]
rot = lambda a: np.ascontiguousarray(np.rot90(a, 1))          # artist draws facing down; engine faces right
CELLS = {'stand': (0, 0, 32, 32), 'nogun': (32, 0, 32, 32), 'rpg': (0, 32, 32, 32), 'sit': (32, 32, 32, 32), 'dead': (64, 0, 32, 64),
         'leg0': (0, 64, 32, 32), 'leg1': (32, 64, 32, 32), 'leg2': (64, 64, 32, 32)}
nog = NS[0:32, 32:64]; m = np.zeros(nog.shape[:2], bool)
for g in GREENS[1:]: m |= (nog[:, :, 0] == g[0]) & (nog[:, :, 1] == g[1]) & (nog[:, :, 2] == g[2]) & (nog[:, :, 3] > 0)
ys, xs = np.where(m); bx, by = xs.mean() + 0.5, ys.mean() + 0.5
def piv(pose, w, h):
    if pose.startswith('leg'): ox, oy = bx, by + 16
    elif pose == 'dead':
        d = NS[0:64, 64:96]; ys2, xs2 = np.where(d[:, :, 3] > 0); ox, oy = (xs2.min() + xs2.max() + 1) / 2, (ys2.min() + ys2.max() + 1) / 2
    else: ox, oy = bx, by
    return oy, w - ox
def tight(a, px, py):
    ys, xs = np.where(a[:, :, 3] > 0); x0, y0 = xs.min(), ys.min(); return a[y0:ys.max() + 1, x0:xs.max() + 1].copy(), px - x0, py - y0
SOL = []
for pose, (x, y, w, h) in CELLS.items():
    base = NS[y:y + h, x:x + w]; sh = NS[y:y + h, x + 128:x + 128 + w]; px, py = piv(pose, w, h)
    S['sol_' + pose] = old('sol_' + pose) if 'sol_' + pose in meta else tight(rot(base), px, py); SOL.append('sol_' + pose)
    if sh[:, :, 3].any(): S['nsh_' + pose] = old('nsh_' + pose) if 'nsh_' + pose in meta else tight(rot(sh), px, py)
    if 'ab_%s_red' % pose in meta:                # check: base with the band painted red == the old baked armband sprite
        b = S['sol_' + pose][0].copy(); wm = (b[:, :, 0] == 255) & (b[:, :, 1] == 255) & (b[:, :, 2] == 255) & (b[:, :, 3] > 0); b[wm, :3] = (224, 44, 38)
        o = old('ab_%s_red' % pose)[0]; assert o.shape == b.shape and (o == b).all() and [round(float(v), 1) for v in S['sol_' + pose][1:]] == meta['ab_%s_red' % pose][4:], pose
# ---- weapon icons
for n in ['wi_ar', 'wi_lmg', 'wi_br', 'wi_sniper', 'wi_smg', 'wi_rpg', 'wi_ak', 'wi_pistol', 'wi_mp']: S[n] = old(n)
# ---- HUD icons (art/art4/icons.png, 32px cells): white fill + dark outline, the game tints the fill per use; frag / smoke are shaded and drawn as-is
IC = np.array(Image.open('art/art4/icons.png').convert('RGBA'))
for n, (cx, cy) in {'enter': (0, 0), 'exit': (32, 0), 'wheel': (0, 32), 'horn': (32, 32), 'frag': (64, 0), 'smoke': (64, 32)}.items():
    c = IC[cy:cy + 32, cx:cx + 32]; ys, xs = np.where(c[:, :, 3] > 0); x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    S['ic_' + n] = old('ic_' + n) if 'ic_' + n in meta else (c[y0:y1, x0:x1].copy(), (x1 - x0) / 2, (y1 - y0) / 2)
    if SYNC and 'ic_' + n in meta: a = old('ic_' + n)[0]; IC[cy + y0:cy + y0 + a.shape[0], cx + x0:cx + x0 + a.shape[1]] = a
if SYNC: Image.fromarray(IC).save('art/art4/icons.png')
# ---- cover: sandbag crescents (full / damaged / destroyed)
bags, bagPts = bag_frames(np.array(Image.open('art/orig/4948b42c-image.png').convert('RGBA')))
for n, v in bags.items(): S[n] = old(n) if n in meta else v
if 'bagPts' not in extra: extra['bagPts'] = bagPts

GROUPS = [['hull', 'jeep', 'tur', 'mg', 'bar', 'decal', 'under_'], ['smoke', 'boom', 'dust', 'fire'], ['sol_', 'nsh_'], ['wi_'], ['ic_'], ['bagarc']]
def group(n):
    for i, G in enumerate(GROUPS):
        if any(n.startswith(p) for p in G): return i
    raise KeyError(n)
W = 384; x = y = rowh = 0; out = {}; places = []
for gi in range(len(GROUPS)):
    names = [n for n in S if group(n) == gi]
    names.sort(key=lambda n: (GROUPS[gi].index(next(p for p in GROUPS[gi] if n.startswith(p))), n))   # same family side by side
    if x: x = 0; y += rowh + 2; rowh = 0                              # every group starts its own row
    for n in names:
        a, px, py = S[n]; h, w = a.shape[:2]
        if x + w > W: x = 0; y += rowh + 1; rowh = 0
        places.append((n, x, y)); out[n] = [x, y, w, h, round(float(px), 1), round(float(py), 1)]; x += w + 1; rowh = max(rowh, h)
H = y + rowh; atlas = np.zeros((H, W, 4), np.uint8)
for n, x, y in places: a = S[n][0]; atlas[y:y + a.shape[0], x:x + a.shape[1]] = a
Image.fromarray(atlas).save('atlas.png', optimize=True)
json.dump(out, open('atlas.json', 'w'))
# ---- material atlas: carried over per sprite (same size as before), else the first pass
MAT = {  # prefix: (height px, bevel px or 0 = a dome over the whole shape, reflectivity, relief px from shading)
    'hull': (12, 4, 90, 1.5), 'tur_gun': (3, 0, 110, 0), 'tur_dead': (8, 4, 50, 1.5), 'tur': (10, 4, 90, 1.5), 'jeep_': (4, 0, 25, 0),
    'jeep': (14, 5, 70, 1.5), 'mg': (3, 0, 110, 0), 'bagarc': (10, 5, 15, 1), 'sol_': (8, 0, 30, 1), 'smoke': (14, 0, 0, 0),
    'dust': (6, 0, 0, 0), 'boom': (16, 0, 0, 0), 'fire': (10, 0, 0, 0)}
def undergen(a, n, px, py):                                        # first pass: how far down from the body's base, R x 4 (tracks, wheels)
    m = np.zeros(a.shape[:2] + (3,), np.uint8); h, w = a.shape[:2]; ys, xs = np.mgrid[0:h, 0:w]; lx, ly = xs + 0.5 - px, ys + 0.5 - py; inside = a[:, :, 3] > 0
    if n == 'under_tank': hw = h / 2; d = np.where(np.abs(ly) > hw - 10, 5, 0)
    else: d = np.zeros((h, w))
    if n == 'under_jeep':
        for wx, wy in extra['jeepWells']:
            for sd in (-1, 1): d = np.where((lx - wx) ** 2 + (ly - wy * sd) ** 2 < 36, 5, d)
    m[:, :, 0] = np.where(inside, d * 4, 0); return m
def matgen(a, n):
    m = np.zeros(a.shape[:2] + (3,), np.uint8); al = a[:, :, 3]
    p = next((k for k in MAT if n.startswith(k)), None)
    if p is None: return m                                         # shadows, colour pieces, HUD: no material
    cap, B, refl, rel = MAT[p]; inside = al > 0; d = np.zeros(al.shape, float); e = inside.copy(); k = 0
    while e.any():                                                 # distance to the edge: erode, alternating 4 / 8 neighbours
        k += 1; d[e] = k; q = np.pad(e, 1)
        e = q[1:-1, 1:-1] & q[:-2, 1:-1] & q[2:, 1:-1] & q[1:-1, :-2] & q[1:-1, 2:]
        if k % 2: e &= q[:-2, :-2] & q[:-2, 2:] & q[2:, :-2] & q[2:, 2:]
    t = np.clip((d - 0.5) / (B or max(k, 1)), 0, 1); h = cap * np.sqrt(1 - (1 - t) ** 2) * al / 255
    lum = a[:, :, :3].astype(float) @ [0.3, 0.59, 0.11]
    if rel and inside.any(): h += (lum - np.median(lum[inside])) / 255 * rel * 2
    m[:, :, 0] = np.where(inside, np.clip(np.round(h), 0, 63) * 4, 0)
    m[:, :, 1] = np.where(inside, refl, 0)
    if p in ('fire', 'boom'): m[:, :, 2] = np.clip((lum - 90) * 1.6, 0, 255) * al / 255
    return m
AMn = np.zeros((H, W, 3), np.uint8); gen = 0
for n, x, y in places:
    a = S[n][0]; h, w = a.shape[:2]
    if AM is not None and n in meta and meta[n][2:4] == [w, h]: ox, oy = meta[n][:2]; AMn[y:y + h, x:x + w] = AM[oy:oy + h, ox:ox + w]
    else: AMn[y:y + h, x:x + w] = undergen(a, n, *S[n][1:]) if n.startswith('under_') else matgen(a, n); gen += 1
Image.fromarray(AMn).save('atlas_m.png', optimize=True)
extra['tips'] = {k: v for k, v in extra.get('tips', {}).items() if k.startswith('n_')}
json.dump(extra, open('atlas_extra.json', 'w'))
print('atlas', W, H, len(out), 'sprites', os.path.getsize('atlas.png'), 'bytes; material', gen, 'generated')
