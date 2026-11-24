"""The Mao Chhu's banks for /gratitude, from its bed (bake_river.py's
river.webp): how far each point of the stone lies in from the grass, and
how far from the water, so the page can cut the bank's step where the
meadow ends and lay the gravel falling from its foot to the water.

    python scripts/valley/bake_bank.py

Writes public/gratitude/bank.webp, over river.webp's own box and pixels:
red and green the distance into the stone from the grass (whole tenths of a
unit, and the fraction), blue the distance to the water in tenths (so 25.5
units at most). Run after
bake_river.py.

Also works out the bank's shape itself, how far the ground falls below the
meadow at each point (SINK), and leaves it for bake_bank_shade.py, which
lights it in Blender and writes it out with its shade:

    python scripts/valley/bake_bank.py
    blender -b -P scripts/valley/bake_bank_shade.py
"""
import os, tempfile
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
OUT = os.path.join(ROOT, "public", "gratitude")

river = np.array(Image.open(os.path.join(OUT, "river.webp")).convert("RGB")).astype(np.float32)
# (river.webp spans x -130 to 880, so its pixels are this many units.)
PX = 1010.0 / river.shape[1]
# (As the page reads it: stone where water and gravel together pass 60.)
stone = river[..., 0] + river[..., 1] > 60
water = river[..., 0] > 128
# (Only the stone that reaches the water: the specks and flecks of it the
# river map paints out in the meadow are its texture there, not a bed, and
# cut, they stood as bare hollows in the grass.)
lab, n = ndimage.label(stone)
keep = np.unique(lab[ndimage.binary_dilation(water, iterations=2) & stone])
stone = np.isin(lab, keep[keep > 0])
into = ndimage.distance_transform_edt(stone) * PX
to_water = ndimage.distance_transform_edt(~water) * PX
# (Over the grass, no way into the stone; the water's own distance is 0.)
into[~stone] = 0
# Smoothed over a few units, so the cut follows the bank's line and not the
# ragged edge bake_river.py paints (on a five-metre step, that raggedness
# stood up as rows of teeth); the paint keeps its raggedness at the lip.
into = ndimage.gaussian_filter(into, 2.5 / PX)
to_water = ndimage.gaussian_filter(to_water, 3.0)
# (The way in, in tenths of a unit, its whole part in red and its fraction in
# green: in 8 bits alone its slow rise after the smoothing came in terraces,
# and the cut's edge followed them in stairs. Linear in both, so it filters.)
v = np.clip(into * 10, 0, 255)
img = np.stack([np.floor(v), (v - np.floor(v)) * 255, np.clip(to_water * 10, 0, 255)], -1)
path = os.path.join(OUT, "bank.webp")
Image.fromarray(np.round(img).astype(np.uint8), "RGB").save(path, lossless=True)
print(path, os.path.getsize(path), "px", PX)

# ── The bank's shape ──
# Where the stone is narrow, on the outside of a bend where the river eats
# into the meadow, a cut bank: a steep step of earth (STEP), then gravel
# falling gently to the water. Where it is broad, a bar on the inside of a
# bend: a lower lip, a little over half the height (lower, and from the
# page's heights the bar read as level ground), then a long gentle fall. The
# water lies lowest (DROP), its bed level.
STEP, DROP = 1.0, 1.8
rng = np.random.default_rng(3)


def noise(cell):
    """Smooth noise, -0.5..0.5, its features about `cell` units across."""
    n = rng.random((int(river.shape[0] * PX / cell) + 4, int(river.shape[1] * PX / cell) + 4)).astype(np.float32)
    big = ndimage.zoom(n, cell / PX, order=3)[: river.shape[0], : river.shape[1]]
    return np.clip(big, 0, 1) - 0.5


def ss(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# The lip itself, sharp: the way in from a clean edge (the stone's outline
# smoothed, so it curves with the bank and has no pixel teeth, and only then
# measured), so the cut stands steep, 60 to 70 degrees, as a cut bank of
# silt and sand does, not the ramp the smoothed distance gave. It wanders in
# and out a little along the bank, slumped here, cut fresh there.
clean = ndimage.gaussian_filter(stone.astype(np.float32), 1.5 / PX) > 0.5
# (Signed: inward positive, out over the grass negative, so the wander only
# moves the lip about its own line and never cuts out in the meadow.)
edge = (ndimage.distance_transform_edt(clean) - ndimage.distance_transform_edt(~clean)) * PX
lip = edge + noise(6.0) * 0.5 + noise(2.0) * 0.2
t = into / np.maximum(into + to_water, 1e-3)
step = STEP * (0.55 + 0.45 * (1 - ss(3.0, 9.0, into + to_water)))
# Most of the step in a steep wall, rounded at its top where the turf holds;
# the rest in the talus at its foot, the sand fallen from it, curving out
# into the bar with no crease (a crease there drew the wall's foot as a line).
wall = ss(0.0, 0.3, lip)
talus = 1.0 - np.exp(-np.maximum(lip, 0.0) / 0.55)
cut = step * np.maximum(0.62 * wall + 0.38 * talus, t)
fall = (DROP - step) * ss(0.0, 1.0, t)
# A gravel bar's own low mounds and hollows and the old flows' channels
# across it, along the flow (x); none at the lip or in the water.
lumps = (noise(9.0) * 0.5 + noise(3.5) * 0.3 + noise(1.5) * 0.12) * 0.55
lumps *= ss(0.6, 1.6, into) * ss(0.3, 1.2, to_water)
sink = np.where(edge > -1.0, cut + fall - lumps, 0.0)
sink = np.clip(ndimage.gaussian_filter(sink, 0.12 / PX), 0, None).astype(np.float32)
cache = os.path.join(tempfile.gettempdir(), "gratitude-bank-sink.npy")
np.save(cache, sink)
print(cache, sink.shape, float(sink.max()))
