"""Pads the plant cards' sheets (bake_impostors.py) out past each outline:
every transparent pixel takes the colour of the plant nearest it, its alpha
kept. Without it the empty ground round each plant is black in both sheets,
and a far plant, drawn from the sheets' small mipmaps, averages that black
into its grain and its normals (facing away from the moon), so it shows
near black whatever its light. Run after bake_impostors.py:

    python scripts/valley/pad_impostors.py
"""
import json, os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
OUT = os.path.join(ROOT, "public", "gratitude")
TILE = json.load(open(os.path.join(OUT, "plants.json")))["tile"]


def pad(tile, solid):
    """Grow the solid pixels' colour outward a ring at a time, each new pixel
    the mean of its solid neighbours; whatever is left, the plant's mean."""
    rgb = tile[..., :3].astype(np.float32)
    done = solid.copy()
    for _ in range(TILE):
        if done.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(done.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            d = np.roll(done, (dy, dx), (0, 1))
            acc += np.roll(rgb, (dy, dx), (0, 1)) * d[..., None]
            cnt += d
        grow = ~done & (cnt > 0)
        if not grow.any():
            break
        rgb[grow] = acc[grow] / cnt[grow][:, None]
        done |= grow
    if solid.any():
        rgb[~done] = rgb[solid].mean(0)
    tile[..., :3] = np.clip(np.round(rgb), 0, 255)


alpha = np.array(Image.open(os.path.join(OUT, "plants-grain.webp")).convert("RGBA"))[..., 3]
for fname in ("plants-grain.webp", "plants-normal.webp"):
    path = os.path.join(OUT, fname)
    im = np.array(Image.open(path).convert("RGBA"))
    for y in range(0, im.shape[0], TILE):
        for x in range(0, im.shape[1], TILE):
            pad(im[y:y + TILE, x:x + TILE], alpha[y:y + TILE, x:x + TILE] >= 128)
    Image.fromarray(im, "RGBA").save(path, lossless=True, exact=True)
    print(fname, os.path.getsize(path))
