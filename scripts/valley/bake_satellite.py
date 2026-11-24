"""The valley's ground colour for /gratitude, from the real satellite image.

Sentinel-2's true colour (fetch.py), laid over the page's ground from above
(the area in public/gratitude/ground-bake.json), and made to read as the
valley did on the night of 1 November 2026:
  - Gelephu town and its airfield, which lie behind where the gatherings sat
    and were not part of the scene, replaced by fields and scrub;
  - the few small clouds over the forest filled from round them;
  - January's dry browns taken toward the greener floor of early November,
    after the monsoon;
  - the daytime sun's shading on the slopes softened: the page lights the
    land itself, by the moon.
Writes public/gratitude/ground-colour.webp. (scripts/valley/bake_ground.py
bakes the shade.)

    python bake_satellite.py <valley-data> <poly-haven-dir> [size]
"""
import sys, json, math
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

data, ph = Path(sys.argv[1]), Path(sys.argv[2])
SIZE = int(sys.argv[3]) if len(sys.argv) > 3 else 4096
root = Path(__file__).resolve().parents[2]
box = json.loads((root / "public/gratitude/ground-bake.json").read_text())
X0, X1, Z0, Z1 = box["x0"], box["x1"], box["z0"], box["z1"]

grid = json.loads((data / "grid.json").read_text())
W, S, E, N = grid["bounds"]
NX, NY = grid["nx"], grid["ny"]
rgb = np.load(data / "rgb.npy").astype(np.float32) / 255.0

# As bake.py: scene (x south, z west) to latitude and longitude.
LAT_S = 111320 / 18
LON_S = 111320 * math.cos(math.radians(26.92)) / 18
xs = X0 + (np.arange(SIZE) + 0.5) / SIZE * (X1 - X0)
zs = Z0 + (np.arange(SIZE) + 0.5) / SIZE * (Z1 - Z0)  # image rows, top = Z0
XX, ZZ = np.meshgrid(xs, zs)
lat = 26.958 - XX / LAT_S
lon = 90.509 - ZZ / LON_S
col = (lon - W) / (E - W) * NX - 0.5
row = (N - lat) / (N - S) * NY - 0.5
img = np.stack([ndimage.map_coordinates(rgb[b], [row, col], order=1, mode="nearest") for b in range(3)], -1)
print("sampled", img.shape)

px = (X1 - X0) / SIZE  # scene units per pixel


def blur(a, units):
    s = units / px
    return ndimage.gaussian_filter(a, (s, s, 0) if a.ndim == 3 else s)


def fill(a, mask, units):
    """Fill the masked pixels from round them (normalised blur)."""
    w = (~mask).astype(np.float32)
    num = blur(a * w[..., None], units)
    den = blur(w, units)[..., None]
    return np.where(mask[..., None], num / np.maximum(den, 1e-4), a)


def smooth(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


lum = img @ np.array([0.3, 0.59, 0.11], np.float32)

# The river's beds (bake.py's BED, and the tributaries are pale too): the
# gravel is kept as it is.
BED = np.array([
    [120, -2, -22], [140, 5, -15], [160, 3, -18], [180, 3, -30], [200, 5, -45], [220, 5, -50],
    [240, 3, -45], [260, 0, -40], [280, 5, -40], [300, 15, -45], [320, 25, -45], [340, 25, -45],
    [360, 25, -45], [380, 25, -45], [400, 25, -45], [420, 25, -55], [440, 22, -60], [460, 22, -60],
    [480, 22, -55], [500, 20, -45], [540, 20, -40], [580, 18, -40]], float)
bw = np.interp(XX, BED[:, 0], BED[:, 1])
be = np.interp(XX, BED[:, 0], BED[:, 2])
in_bed = (ZZ < bw + 12) & (ZZ > be - 12) & (XX > 100) & (XX < 600)

# Clouds: bright, grey, over the forest, off any bed.
sat = img.max(-1) - img.min(-1)
# (and the odd bare white scar, which reads from afar as a cloud's remnant)
cloud = (lum > 0.5) & (sat < 0.16) & ~in_bed
cloud = ndimage.binary_dilation(cloud, iterations=int(3 / px) + 1)
img = fill(img, cloud, 12.0)

# The town and the airfield: in their place, the real farmland and scrub of
# the plain across the river, north of it (the same distance along, 400
# units over), its edge broken up so no seam shows.
DONOR = -400.0
town = np.clip(smooth(270, 300, XX) * (1 - smooth(740, 770, XX)) * smooth(60, 90, ZZ) * (1 - smooth(300, 330, ZZ)), 0, 1)
edge = blur(np.random.default_rng(1).random(XX.shape).astype(np.float32), 6.0)
edge = (edge - edge.mean()) / edge.std()
town = smooth(0.35, 0.65, town + 0.12 * edge)
row_d = (N - (26.958 - XX / LAT_S)) / (N - S) * NY - 0.5
col_d = (90.509 - (ZZ + DONOR) / LON_S - W) / (E - W) * NX - 0.5
donor = np.stack([ndimage.map_coordinates(rgb[b], [row_d, col_d], order=1, mode="nearest") for b in range(3)], -1)
img = img * (1 - town[..., None]) + donor * town[..., None]

# The daytime sun's shading on the slopes, softened by half: the relief
# that is the sun's (a hillside's broad light and shade), not the canopy's
# own grain.
lum = img @ np.array([0.3, 0.59, 0.11], np.float32)
relief = blur(lum, 4.0) / np.maximum(blur(lum, 70.0), 1e-3)
# (Not on the gravel: bright against its surroundings, it would be dulled.)
pale = np.maximum(in_bed.astype(np.float32), smooth(0.35, 0.5, lum))
pale = blur(pale, 3.0)
img = img / (np.clip(relief, 0.4, 2.5)[..., None] ** (0.5 * (1 - pale[..., None])))

# Early November, not January: the green taken up where it grows, the dry
# browns of the floor a little toward green, the gravel left pale.
r, g, b = img[..., 0], img[..., 1], img[..., 2]
veg = smooth(-0.02, 0.04, g - r) * (1 - smooth(0.45, 0.6, lum))
brown = smooth(0.0, 0.06, r - g) * (1 - smooth(0.4, 0.55, lum)) * (~in_bed)
grey = img.mean(-1, keepdims=True)
img = grey + (img - grey) * (1 + 0.12 * veg[..., None])
img = img * (1 + veg[..., None] * np.array([-0.02, 0.06, -0.06], np.float32))
# (The satellite's blue haze in the forest's shade, which reads as teal.)
img[..., 2] *= 1 - 0.18 * veg
# The plain's floor, a little greener for the season, wherever it is not
# forest, gravel or bare.
floor_m = (1 - veg) * (1 - smooth(0.4, 0.55, lum)) * (~in_bed)
img = img * (1 + 0.6 * floor_m[..., None] * np.array([-0.06, 0.1, -0.06], np.float32))
img = img * (1 + 0.5 * brown[..., None] * np.array([-0.12, 0.05, -0.08], np.float32))

out = np.clip(img, 0, 1)
Image.fromarray((out * 255).astype(np.uint8)).save(root / "public/gratitude/ground-colour.webp", quality=84, method=6)
print("ground-colour.webp", SIZE)
