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

def bag_frames(SB, SC=0.37):
    """sandbag crescents: full / damaged / destroyed. The sheet's cells are 171 px apart (the old 196 px crop clipped the
    full one to 120 px and squashed it into a square: 1.6x too wide). Offsets line the damaged frames up on the full one.
    Returns ({name: (arr, px, py)}, collision points along the full crescent, sprite-local)."""
    from PIL import Image
    out = {}
    for n, cx, dy in (('bagarc0', 390, 0), ('bagarc1', 219, 2), ('bagarc2', 24, 3)):
        cell = np.zeros((200, 171, 4), np.uint8); part = SB[0:200, cx:cx + 171]; cell[:, :part.shape[1]] = part
        occ = (cell[180:, :, 3] > 40).sum(1); cell[180 + int(occ.argmin()):] = 0   # the next crescent down the sheet touches this one
        w, h = round(171 * SC), round(200 * SC)
        a = np.array(Image.fromarray(cell).resize((w, h), Image.LANCZOS))
        out[n] = _cut(a, 88 * w / 171, (98 + dy) * h / 200)       # pivot: bags' centre 15 px behind it, as before
    arr, bpx, bpy = out['bagarc0']; m = arr[:, :, 3] > 200; ys, xs = np.where(m); pts = []
    y0, y1 = ys.min(), ys.max() + 1
    for k in range(8):
        ya = y0 + (y1 - y0) * k / 8; yb = y0 + (y1 - y0) * (k + 1) / 8; sel = (ys >= ya) & (ys < yb)
        if sel.sum() > 3: pts.append([round(float(xs[sel].mean() - bpx), 1), round(float(ys[sel].mean() - bpy), 1)])
    return out, pts
