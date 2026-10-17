"""Sprites cut from art/art4/mounts.png: the mounted MG (idle, firing, wrecked) and the destroyed tank turret.
MGs point +x with the pivot on the gun body (the swivel); the turret uses the same pivot rule as tur0..tur11."""
import numpy as np

def _tight(a):
    ys, xs = np.where(a[:, :, 3] > 0)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1

def _cut(a, px, py):
    x0, y0, x1, y1 = _tight(a)
    return a[y0:y1, x0:x1].copy(), px - x0, py - y0

def _body(a):
    # the swivel = centre of the round body: dark, opaque, non-yellow pixels in the first 11 columns
    r, g, b, al = [a[:, :11, i].astype(int) for i in range(4)]
    m = (al > 20) & ~((r > 150) & (g > 120) & (b < 90))
    ys, xs = np.where(m)
    return (xs.min() + xs.max() + 1) / 2, (ys.min() + ys.max() + 1) / 2

def mount_sprites(S):
    out = {}
    idle = S[52:68, 66:101].copy(); fire = S[52:68, 14:49].copy()     # same box relative to the body, so the frames line up
    x0 = _tight(idle)[0]; px, py = _body(idle[:, x0:]); px += x0
    out['mg'] = _cut(idle, px, py)
    out['mg_f'] = _cut(fire, px, py)
    dead = S[68:88, 100:134].copy(); x0 = _tight(dead)[0]; dx, dy = _body(dead[:, x0:]); out['mg_dead'] = _cut(dead, dx + x0, dy)
    t = S[0:42, 128:256].copy(); m = t[:, :52, 3] > 0; ys, xs = np.where(m)
    out['tur_dead'] = _cut(t, (xs.min() + xs.max() + 1) / 2, (ys.min() + ys.max() + 1) / 2)
    return out

def hi_bags(SB):
    """the sandbag crescents again at 2x the game size (drawn at 0.5 with smoothing: crisp at any zoom/rotation)"""
    from PIL import Image
    out = {}
    for n, x in (('bagarcH0', 392), ('bagarcH1', 196), ('bagarcH2', 0)):
        a = np.array(Image.fromarray(SB[0:196, x:x + 196].copy()).resize((144, 144), Image.LANCZOS))
        out[n] = _cut(a, 144 * 0.62, 144 / 2)
    return out
