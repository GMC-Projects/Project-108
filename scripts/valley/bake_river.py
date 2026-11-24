"""The Mao Chhu for /gratitude: where its water runs, its gravel lies, and
its banks, along the course river_path.py gives it.

    python bake_river.py

Writes public/gratitude/river.webp over RIVER (x0, x1, z0, z1, the page's own
axes): red the water; green the gravel, along its edges and in bars on the
inside of its bends; blue the bank, from the gravel's edge out into the
grass (1 at the edge, 0 a dozen units out), where the page roughens the
meadow and lets stones show through it.

Also writes components/gratitude/valley/river.ts: the stone's west edge, so
the page can keep the gatherings a set way back from it.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from river_path import X0, X1, bed, course, smooth

root = Path(__file__).resolve().parents[2]
RIVER = (X0, X1, -180.0, 75.0)
PX = 0.3  # scene units per pixel
W_, H_ = int((RIVER[1] - RIVER[0]) / PX), int((RIVER[3] - RIVER[2]) / PX)
xs = RIVER[0] + (np.arange(W_) + 0.5) * PX
zs = RIVER[2] + (np.arange(H_) + 0.5) * PX  # rows, top = z0
XX, ZZ = np.meshgrid(xs, zs)
rng = np.random.default_rng(7)


def noise(sigma, k=0):
    n = ndimage.gaussian_filter(rng.random(XX.shape).astype(np.float32), sigma / PX)
    return (n - n.mean()) / n.std()


cz1, wid1, swing1 = course(xs)
# (Distances across the river measured square to its line, which through
# the gorge runs nearly across x; and its width there from the nearest point
# of the line.)
lx = np.arange(X0, X1, 0.05)
lz, lw, _ = course(lx)
near_d, near_i = cKDTree(np.stack([lx, lz], -1)).query(np.stack([XX.ravel(), ZZ.ravel()], -1))
across = near_d.reshape(XX.shape)
wid = lw[near_i].reshape(XX.shape)
cz = cz1[None, :]
bw1, be1 = bed(xs)
in_bed1 = (xs > 125) & (xs < 590)

# The main river, its banks ragged at two sizes.
edge = noise(4.0) * 0.9 + noise(1.2) * 0.35
dist = across + edge
water = smooth(wid + 0.8, wid - 0.8, dist)

# Gravel bars: on the inside of each bend, where the river has swung away
# and left the most bed, lens-shaped along the flow, coming and going; and
# a strip of stone along every edge. Each bar's width, per side, along x.
def bars(side):
    room = (bw1 - (cz1 + wid1)) if side > 0 else ((cz1 - wid1) - be1)
    room = np.where(in_bed1, np.maximum(room, 0), 0)
    # Larger where the bend turns away from this side.
    inside = smooth(-0.2, 0.6, -side * swing1)
    lens = np.clip(0.7 + 0.5 * np.sin(xs * 0.043 + (1.7 if side > 0 else 4.1)), 0, 1)
    return ndimage.gaussian_filter1d(room * 0.9 * inside * lens, 8 / PX)


# (More on the west bank, where the people sat, and less on the east, the
# 108's: the shingle wide below the gatherings, a narrower band of it
# below the chortens.)
bar_w, bar_e = bars(1) * 1.25, np.minimum(bars(-1) * 0.6, 5.0)
off = ZZ - cz  # > 0 toward the west bank
bar = np.where(off > 0, bar_w[None, :], bar_e[None, :])
strip = np.where(off > 0, 4.0, 3.0)
reach = wid + strip + 0.9 * noise(6.0) + bar * (1 + 0.18 * noise(5.0))
gravel = smooth(reach + 0.8, reach - 0.8, across + edge * 0.6)
# (In the gorge: a narrow margin of stone, the walls close.)
gorge = 1 - smooth(110.0, 135.0, XX)
gravel = np.maximum(gravel * (1 - gorge), smooth(wid + 2.4, wid + 1.0, dist) * gorge)

# (Never up to the 108: the stone ends a few units short of their row,
# raggedly, where a bar would reach it.)
import re
_site = (root / "components/gratitude/valley/site.ts").read_text()
feet = np.array([[float(a), float(b)] for a, b in re.findall(r"\[([-\d.]+),[-\d.]+,([-\d.]+)\]", _site.split("export const FEET")[1].split("];")[0])])
row = np.interp(xs, feet[:, 0], feet[:, 1], left=-1e3, right=-1e3)[None, :]
gravel = gravel * smooth(row + 4.5, row + 7.5, ZZ + noise(2.0) * 0.8)
water = ndimage.gaussian_filter(water, 0.6 / PX)
gravel = np.clip(np.maximum(ndimage.gaussian_filter(gravel, 0.8 / PX), water), 0, 1) - water
gravel = np.clip(gravel, 0, 1)

# (Drawn only as far into the gorge as it can be seen from down the valley:
# past its first bend the hills hide it, and further in, where their line
# dips, a stray piece of it showed through on its own.)
seen = smooth(84.0, 92.0, XX)
water, gravel = water * seen, gravel * seen

# The bank: out from the stone into the grass.
solid = (water + gravel) > 0.5
d = ndimage.distance_transform_edt(~solid) * PX
bank = np.clip(1 - (d + 1.5 * noise(3.0)) / 12.0, 0, 1) * (~solid) + solid * 1.0

out = np.stack([water, gravel, bank], -1)
Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(root / "public/gratitude/river.webp", quality=90, method=6)
print("river.webp", W_, H_, RIVER, "water", round(float(water.mean()), 3), "gravel", round(float(gravel.mean()), 3))

# The stone's west edge (its landward edge on the gatherings' bank), smoothed
# along the river: components/gratitude/valley/river.ts.
solid = (water + gravel) > 0.3
zw = np.array([zs[np.nonzero(solid[:, i])[0].max()] if solid[:, i].any() else np.nan for i in range(W_)])
ex = np.arange(100.0, 600.1, 2.0)
west = ndimage.gaussian_filter1d(np.interp(ex, xs[~np.isnan(zw)], zw[~np.isnan(zw)]), 4.0)
f = lambda v: f"{v:.1f}"
(root / "components/gratitude/valley/river.ts").write_text(f'''/* Generated by scripts/valley/bake_river.py; do not edit by hand. */

/** The river's stone (gravel and water), its west edge z: from x = 100, every 2. */
const STONE_WEST = [{",".join(f(v) for v in west)}];

/** The stone's west edge at x, by interpolation. */
export function stoneWest(x: number): number {{
  const t = Math.min(Math.max((x - 100) / 2, 0), STONE_WEST.length - 1.001);
  const i = Math.floor(t), k = t - i;
  return STONE_WEST[i] + (STONE_WEST[i + 1] - STONE_WEST[i]) * k;
}}
''')
print("river.ts")
