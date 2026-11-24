"""Where the valley's trees and bushes grow, for /gratitude: open hills as
108.bt has them, grass and rock on the crests, groves down the gullies and
on the lower slopes, scattered single trees and clumps between, bushes along
the gullies and the banks; none on the river's bed, or by the 108 and the
gatherings. Run in Blender (it reads the valley's own ground):

    blender -b -P scripts/valley/bake_plants.py

Writes public/gratitude/plants.bin: Uint32 count, then per plant Int16 x, y, z
(x 20; the page's axes: x south, y up, z west), Uint8 size (x 20, its width),
kind (plants.json's row), turn and shade (0..255), Int8 ridge (-127 in a
gully to 127 on a ridge), and a byte of padding; and plants-cover.webp, how
much the groves cover the ground (red, over the ground bake's area), for its
shade. The cards themselves: scripts/valley/bake_impostors.py.
"""
import bpy, math, os, random, struct, sys
import mathutils
from mathutils.bvhtree import BVHTree

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
OUT = os.path.join(ROOT, "public", "gratitude")
TREES = (0, 1, 2)  # plants.json's rows
BUSH = 3

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from river_path import X0, X1, course

# The river's bed, as site.ts has it (x, its west and east edge z).
BED = [(120, -2, -22), (140, 5, -15), (160, 3, -18), (180, 3, -30), (200, 5, -45), (220, 5, -50),
       (240, 3, -45), (260, 0, -40), (280, 5, -40), (300, 15, -45), (320, 25, -45), (340, 25, -45),
       (360, 25, -45), (380, 25, -45), (400, 25, -45), (420, 25, -55), (440, 22, -60), (460, 22, -60),
       (480, 22, -55), (500, 20, -45), (540, 20, -40), (580, 18, -40)]


def bed(x):
    if x <= BED[0][0]:
        return BED[0][1:]
    for (xa, wa, ea), (xb, wb, eb) in zip(BED, BED[1:]):
        if x <= xb:
            t = (x - xa) / (xb - xa)
            return wa + (wb - wa) * t, ea + (eb - ea) * t
    return BED[-1][1:]


# The 108's feet (site.ts), so none grows by a foundation.
import re

_site = open(os.path.join(ROOT, "components", "gratitude", "valley", "site.ts")).read()
FEET = [tuple(map(float, m)) for m in re.findall(r"\[([-\d.]+),[-\d.]+,([-\d.]+)\]", _site.split("export const FEET")[1].split("];")[0])]


def near_feet(x, z, r=10.0):
    return any((x - fx) ** 2 + (z - fz) ** 2 < r * r for fx, fz in FEET)


def noise(x, z, f, seed):
    """Smooth-ish value noise from sines, 0..1."""
    return 0.5 + 0.25 * math.sin(x * f + seed) * math.sin(z * f * 1.13 - seed * 0.7) + 0.25 * math.sin((x * 0.71 + z * 0.69) * f * 2.1 + seed * 1.9)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, "valley.glb"))
ter = next(o for o in bpy.data.objects if o.type == "MESH")
bvh = BVHTree.FromObject(ter, bpy.context.evaluated_depsgraph_get())
top = max(v.co.z for v in ter.data.vertices) + 10
down = mathutils.Vector((0, 0, -1))
rng = random.Random(108)


def ground(px, pz):
    hit = bvh.ray_cast(mathutils.Vector((px, -pz, top)), down)
    return hit if hit[0] is not None else None


# The ground's shade under the groves: over the ground bake's area.
BOX = (-692.0, 878.0, -569.0, 553.0)
RES = 1024
cover = [0.0] * (RES * RES)

# Close-set where the camera travels, wider further out, none past the land.
NEAR = (0.0, 700.0, -340.0, 230.0)
out = bytearray()
n = 0


def scatter(area, step, near):
    global n, out
    x0, x1, z0, z1 = area
    x = x0
    while x < x1:
        z = z0
        while z < z1:
            px = x + (rng.random() - 0.5) * step
            pz = z + (rng.random() - 0.5) * step
            z += step
            edge = min(px - NEAR[0], NEAR[1] - px, pz - NEAR[2], NEAR[3] - pz) / 40.0
            share = max(0.0, min(1.0, edge + 0.5))
            if rng.random() > (share if near else 1.0 - share):
                continue
            bw, be = bed(px)
            out_of_bed = max(be - pz, pz - bw)  # > 0 off the bed
            if 100 < px < 600 and out_of_bed < 4:
                continue  # on the bed
            if near_feet(px, pz):
                continue  # by a foundation
            cz, wid, _ = course(px)
            if X0 < px < X1 and abs(pz - float(cz)) < float(wid) + 5.0:
                continue  # in the river or on its stones (as through the gorge)
            hit = ground(px, pz)
            if not hit:
                continue
            y = hit[0].z
            slope = 1 - hit[1].z
            hs = [ground(px + dx, pz + dz) for dx, dz in ((7, 0), (-7, 0), (0, 7), (0, -7))]
            hs = [h[0].z for h in hs if h]
            ridge = max(-1.0, min(1.0, (y - sum(hs) / len(hs)) / 2.0)) if hs else 0.0
            by_river = 100 < px < 600 and out_of_bed < 32  # the 108's bank, the gatherings'
            # Groves: down the gullies and the lower slopes, clumped by noise;
            # none on the crests; the floor and the riverside open.
            grove = noise(px, pz, 0.05, 1.3) * 0.65 + noise(px, pz, 0.017, 4.1) * 0.35
            gullyness = max(0.0, -ridge)
            p_tree = 0.0
            if slope > 0.06 and not by_river:
                p_tree = max(0.0, min(1.0, (grove - 0.52) * 4.0)) * (0.35 + 0.9 * gullyness) * (1.0 - max(0.0, ridge) * 1.6)
                p_tree += 0.035 * (1.0 - max(0.0, ridge))  # the odd single tree
                p_tree *= 1.0 - max(0.0, min(1.0, (slope - 0.6) / 0.15))  # not on bare rock
            # Bushes: along the gullies, the groves' edges, and the banks
            # (outside the 108's and the gatherings' strip).
            p_bush = 0.06 * gullyness + 0.05 * max(0.0, min(1.0, (grove - 0.45) * 5.0)) * (1 - p_tree)
            if 100 < px < 600 and 4 < out_of_bed < 9 and not (be - 16 < pz < be + 2) and not (bw - 2 < pz < bw + 45):
                p_bush += 0.25
            r = rng.random()
            if r < p_tree:
                kind = rng.choice(TREES)
                # (Larger inside a grove, so the crowns close into canopy.)
                size = step * (1.6 + rng.random() * 1.6) * (1.0 + 0.6 * max(0.0, min(1.0, (grove - 0.52) * 4.0)))
            elif r < p_tree + p_bush:
                kind = BUSH
                size = step * (0.45 + rng.random() * 0.5)
            else:
                continue
            out += struct.pack("<hhhBBBBbx", round(px * 20), round(y * 20), round(pz * 20), min(255, round(size * 20)), kind, int(rng.random() * 255), int(rng.random() * 255), round(ridge * 127))
            n += 1
            # How much of the ground the crowns cover, for its shade.
            if kind != BUSH:
                u = int((px - BOX[0]) / (BOX[1] - BOX[0]) * RES)
                v = int((pz - BOX[2]) / (BOX[3] - BOX[2]) * RES)
                if 0 <= u < RES and 0 <= v < RES:
                    cover[v * RES + u] += size * size
        x += step


scatter(NEAR, 1.4, True)
print("near", n)
scatter((-692.0, 878.0, -569.0, 553.0), 3.0, False)
with open(os.path.join(OUT, "plants.bin"), "wb") as fh:
    fh.write(struct.pack("<I", n) + out)
print("plants", n)

# The groves' shade on the ground (red), softened so it spreads a little past
# their edge and fades: public/gratitude/plants-cover.webp.
import numpy as np

d = np.array(cover, dtype=np.float32).reshape(RES, RES)
cell = (BOX[1] - BOX[0]) / RES
d = np.clip(d / (cell * cell * 0.8), 0, 1)
for _ in range(3):
    k = 2
    pd = np.pad(d, k, mode="edge")
    d = sum(pd[k + a : k + a + RES, k + b : k + b + RES] for a in range(-k, k + 1) for b in range(-k, k + 1)) / (2 * k + 1) ** 2
img = bpy.data.images.new("cover", RES, RES, alpha=False)
img.colorspace_settings.name = "Non-Color"
px_ = np.zeros((RES, RES, 4), dtype=np.float32)
px_[..., 0] = np.clip(d * 1.6, 0, 1)[::-1]
px_[..., 3] = 1
img.pixels[:] = px_.ravel()
img.filepath_raw = os.path.join(OUT, "plants-cover.webp")
img.file_format = "WEBP"
img.save()
print("plants-cover.webp")
