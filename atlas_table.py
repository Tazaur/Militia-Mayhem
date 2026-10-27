"""The atlas's table: what's where in it, carried in atlas_m itself, so the two PNGs are the whole atlas.

The settings strip is atlas_m's last rows: 2 bytes of length, then UTF-8 JSON, over the pixels' G / B bytes, the bottom
row first (left to right), then the row above, so it's found whatever the atlas's size. The JSON:
  v: 2, rows: the strip's rows, pool: [y, h] (the underside pool's rows),
  spr: { name: [x, y, w, h, px, py] } (every sprite: its rect and pivot),
  under: { name: [x, y, w, h, px, py] inside the pool }, use: { sprite: what it stands on } (the heightmap editor's).
atlas.json is made from it (meta): the sprites plus _pool / _cfg."""
import json
import numpy as np

ROWS = 16

def read(M):
    """The table in an atlas_m (H x W x 3+ array), or {} (none, or not this format)."""
    b = M[::-1, :, 1:3].reshape(-1); n = int(b[0]) << 8 | int(b[1])
    if not n or n + 2 > b.size: return {}
    try: c = json.loads(bytes(b[2:2 + n]).decode())
    except ValueError: return {}
    return c if isinstance(c, dict) and c.get('v') == 2 else {}

def read_old(M, rect):
    """The older strip: forward from its top row (atlas.json's _cfg)."""
    b = M[rect[1]:rect[1] + rect[3], :, 1:3].reshape(-1); n = int(b[0]) << 8 | int(b[1])
    try: return json.loads(bytes(b[2:2 + n]).decode()) if n else {}
    except ValueError: return {}

def write(M, c):
    """Into M's last c['rows'] rows (in place)."""
    rows = c.setdefault('rows', ROWS); c['v'] = 2; H, W = M.shape[:2]
    t = json.dumps(c, separators=(',', ':')).encode(); b = np.zeros(rows * W * 2, np.uint8)
    assert len(t) + 2 <= len(b), f'the atlas table is {len(t)} bytes, the strip holds {len(b) - 2}'
    b[0], b[1] = len(t) >> 8, len(t) & 255; b[2:2 + len(t)] = np.frombuffer(t, np.uint8)
    M[H - rows:H][::-1, :, 1:3] = b.reshape(rows, W, 2)

def meta(c, W, H):
    """atlas.json from the table."""
    out = {n: r for n, r in c['spr'].items()}; P = c['pool']
    out['_pool'] = [0, P[0], W, P[1], 0, 0]; out['_cfg'] = [0, H - c['rows'], W, c['rows'], 0, 0]
    return out

def check(c, W, H):
    """What's wrong with a table (a list of messages)."""
    bad = []; S = c.get('spr') or {}; P = c.get('pool') or [0, 0]
    if not S: bad.append('no sprites in the table')
    if P[0] < 0 or P[0] + P[1] > H - c.get('rows', ROWS): bad.append(f'the pool {P} is outside the atlas')
    for n, r in S.items():
        if r[0] < 0 or r[1] < 0 or r[0] + r[2] > W or r[1] + r[3] > P[0]: bad.append(f'{n} {r[:4]} is outside the art area')
    for b, r in (c.get('under') or {}).items():
        if r[0] < 0 or r[1] < 0 or r[0] + r[2] > W or r[1] + r[3] > P[1]: bad.append(f'under_{b} {r} is outside the pool')
    for n, u in (c.get('use') or {}).items():
        if u not in S and u[6:] not in (c.get('under') or {}): bad.append(f"{n} stands on {u}, which isn't there")
    return bad
