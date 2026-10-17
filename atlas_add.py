"""Append the mounted-gun / dead-turret sprites (art/art4/mounts.png) and the corrected sandbag crescents to the existing atlas without re-packing it.
Re-running replaces the strip it added earlier. (build_atlas.py also knows these sprites, for a full rebuild.)"""
from PIL import Image
import numpy as np, json, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
from mounts import mount_sprites, bag_frames

meta = json.load(open('atlas.json'))
atlas = np.array(Image.open('atlas.png').convert('RGBA'))
new = mount_sprites(np.array(Image.open('art/art4/mounts.png').convert('RGBA')))
bags, bagPts = bag_frames(np.array(Image.open('art/orig/4948b42c-image.png').convert('RGBA'))); new.update(bags)
top = meta.pop('_strip', [atlas.shape[0]])[0]           # where our strip starts (old atlas height)
for n in list(meta):
    if n in new or meta[n][1] > top: meta.pop(n)          # replaced, or left in the strip by an earlier run
atlas = atlas[:top]
W = atlas.shape[1]; x = 0; y = top + 1; rowh = 0; places = []
for n, (arr, px, py) in new.items():
    h, w = arr.shape[:2]
    if x + w + 1 > W: x = 0; y += rowh + 1; rowh = 0
    places.append((n, x, y)); meta[n] = [x, y, w, h, round(float(px), 1), round(float(py), 1)]; x += w + 1; rowh = max(rowh, h)
out = np.zeros((y + rowh, W, 4), np.uint8); out[:top] = atlas
for n, x, y in places: a = new[n][0]; out[y:y + a.shape[0], x:x + a.shape[1]] = a
meta['_strip'] = [top]
Image.fromarray(out).save('atlas.png', optimize=True)
json.dump(meta, open('atlas.json', 'w'))
extra = json.load(open('atlas_extra.json')); extra['bagPts'] = bagPts; json.dump(extra, open('atlas_extra.json', 'w'))
print('atlas', W, out.shape[0], len(meta) - 1, {n: meta[n] for n in new})
