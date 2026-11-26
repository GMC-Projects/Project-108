"""The forest on the valley's hills for /gratitude: tree crowns, and where
they stand. Run in Blender (it reads the valley's own ground):

    blender -b -P scripts/valley/bake_trees.py [-- --area x0 x1 z0 z1] [--spacing 1.1]

Writes
  public/gratitude/crowns.glb  four crowns, lumpy as broadleaf canopy, each a
                               unit across at its widest, standing on its
                               origin (the page scales them)
  public/gratitude/trees.bin   Uint32 count and how many of them are near, then
                               per tree Int16 x, y, z (x 20), Uint8 size (x 30),
                               turn, shade (0..255), Int8 ridge (-127 in a
                               gully to 127 on a ridge); the page's own axes
                               (x south, y up, z west). The near come first.
  public/gratitude/forest.webp how thick the forest stands, over the ground
                               bake's area (red), for the ground under it

Trees stand only on the forested slopes: up from the valley floor, never on
the river's bed or near the 108 and the gatherings by it.
"""
import bpy, bmesh, math, os, random, struct, sys
import mathutils
from mathutils.bvhtree import BVHTree

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
OUT = os.path.join(ROOT, "public", "gratitude")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
AREA = [float(v) for v in argv[argv.index("--area") + 1 : argv.index("--area") + 5]] if "--area" in argv else [-692, 878, -569, 553]
SPACING = float(argv[argv.index("--spacing") + 1]) if "--spacing" in argv else 1.1

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


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, "valley.glb"))
ter = next(o for o in bpy.data.objects if o.type == "MESH")
bvh = BVHTree.FromObject(ter, bpy.context.evaluated_depsgraph_get())

# ── The crowns ──
rng = random.Random(108)
crowns = []
for k in range(4):
    bm = bmesh.new()
    # A few overlapping lobes, as a broadleaf crown is clumps of leaves.
    for lobe in range(3 + k % 2):
        r = 0.32 + rng.random() * 0.12
        c = mathutils.Vector(((rng.random() - 0.5) * 0.35, (rng.random() - 0.5) * 0.35, 0.45 + rng.random() * 0.25))
        if lobe == 0:
            c = mathutils.Vector((0, 0, 0.55))
            r = 0.42
        res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        for v in res["verts"]:
            n = v.co.normalized()
            v.co = c + v.co * (0.85 + 0.3 * rng.random())
            v.co.z = c.z + (v.co.z - c.z) * 0.8  # a little flattened
    # A short trunk into the ground, so it sits on the slope.
    res = bmesh.ops.create_cone(bm, cap_ends=False, segments=5, radius1=0.06, radius2=0.05, depth=0.5)
    bmesh.ops.translate(bm, vec=(0, 0, 0.1), verts=res["verts"])
    me = bpy.data.meshes.new(f"crown{k}")
    bm.to_mesh(me)
    bm.free()
    # Unit across at its widest, its base at the origin.
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    s = 1.0 / max(max(xs) - min(xs), max(ys) - min(ys))
    for v in me.vertices:
        v.co = mathutils.Vector((v.co.x * s, v.co.y * s, (v.co.z - min(zs)) * s - 0.05))
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(f"crown{k}", me)
    bpy.context.scene.collection.objects.link(o)
    crowns.append(o)
    print("crown", k, len(me.polygons), "tris")

# ...and one plain crown for the far trees, a fifth the faces: from across
# the valley they read the same.
bm = bmesh.new()
res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.5)
for v in res["verts"]:
    v.co.z = v.co.z * 0.8 + 0.45
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0.12], context="VERTS")
me = bpy.data.meshes.new("crownFar")
bm.to_mesh(me)
bm.free()
for p in me.polygons:
    p.use_smooth = True
o = bpy.data.objects.new("crownFar", me)
bpy.context.scene.collection.objects.link(o)
crowns.append(o)
print("crownFar", len(me.polygons), "tris")

for o in bpy.data.objects:
    o.select_set(o in crowns)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "crowns.glb"), export_format="GLB", use_selection=True, export_apply=True, export_materials="NONE")

# ── Where they stand ──
# Close-set where the camera travels (NEAR), and further out wider-set with
# larger crowns, which from there read the same; past the edge of the land
# the camera sees, none.
NEAR = (0.0, 700.0, -340.0, 230.0)
FAR = SPACING * 2.2
top = max(v.co.z for v in ter.data.vertices) + 10
down = mathutils.Vector((0, 0, -1))
out = bytearray()
n = 0
BOX = (-692.0, 878.0, -569.0, 553.0)  # as ground-bake.json
RES = 1024
dens = [0.0] * (RES * RES)


def ground(px, pz):
    hit = bvh.ray_cast(mathutils.Vector((px, -pz, top)), down)
    return hit if hit[0] is not None else None


def inside(px, pz, b, pad=0.0):
    return b[0] + pad < px < b[1] - pad and b[2] + pad < pz < b[3] - pad


def scatter(area, step, near):
    global n, out
    x0, x1, z0, z1 = area
    x = x0
    while x < x1:
        z = z0
        while z < z1:
            # Jittered on a grid, so they neither clump nor line up.
            px = x + (rng.random() - 0.5) * step
            pz = z + (rng.random() - 0.5) * step
            z += step
            # Each pass keeps to its own ground, the two overlapping at
            # NEAR's edge, thinning out from each, so no line shows.
            edge = min(px - NEAR[0], NEAR[1] - px, pz - NEAR[2], NEAR[3] - pz) / 40.0
            share = max(0.0, min(1.0, edge + 0.5))
            if rng.random() > (share if near else 1.0 - share):
                continue
            bw, be = bed(px)
            # Clear of the bed, the 108 and the gatherings by it: 30 out.
            if be - 30 < pz < bw + 30 and 100 < px < 600:
                continue
            hit = ground(px, pz)
            if not hit:
                continue
            nrm = hit[1]
            y = hit[0].z
            slope = 1 - nrm.z
            # The forest: on the slopes and up on the heights, not the
            # plain's floor (which rises to about 12 away from the river);
            # its edge wanders, and thins out into single trees.
            wob = 0.5 * math.sin(px * 0.031 + 1.7) * math.sin(pz * 0.027 - 0.6) + 0.3 * math.sin(px * 0.11 + pz * 0.09)
            f = max(0.0, min(1.0, (y - 14.0) / 10.0)) + max(0.0, min(1.0, (slope - 0.1 + wob * 0.06) / 0.14))
            if rng.random() > min(1.0, f) * 0.97:
                continue
            if slope > 0.75:
                continue  # bare rock
            # On a ridge or in a gully: the ground round it, 6 out, against
            # its own height (the page lights ridges' crowns, darkens
            # gullies').
            hs = [ground(px + dx, pz + dz) for dx, dz in ((6, 0), (-6, 0), (0, 6), (0, -6))]
            hs = [h[0].z for h in hs if h]
            ridge = max(-1.0, min(1.0, (y - sum(hs) / len(hs)) / 2.5)) if hs else 0.0
            # (About 40% larger than the first trial's, the canopy closing.)
            size = step * (1.55 + rng.random() * 1.25)
            out += struct.pack("<hhhBBBb", round(px * 20), round(y * 20), round(pz * 20), min(255, round(size * 30)), int(rng.random() * 255), int(rng.random() * 255), round(ridge * 127))
            n += 1
            # How thick the forest stands, for the ground under it.
            u = int((px - BOX[0]) / (BOX[1] - BOX[0]) * RES)
            v = int((pz - BOX[2]) / (BOX[3] - BOX[2]) * RES)
            if 0 <= u < RES and 0 <= v < RES:
                dens[v * RES + u] += size * size
        x += step


scatter(NEAR, SPACING, True)
near_n = n
print("near", n)
scatter((-692.0, 878.0, -569.0, 553.0), FAR, False)
with open(os.path.join(OUT, "trees.bin"), "wb") as fh:
    fh.write(struct.pack("<II", n, near_n) + out)
print("trees", n)

# The forest's cover, for the ground under it: dark where it stands thick.
import numpy as np

d = np.array(dens, dtype=np.float32).reshape(RES, RES)
cell = (BOX[1] - BOX[0]) / RES
d = np.clip(d / (cell * cell * 0.9), 0, 1)
# (Softened by a few cells: a box blur, twice.)
for _ in range(2):
    k = 2
    p = np.pad(d, k, mode="edge")
    d = sum(p[k + a : k + a + RES, k + b : k + b + RES] for a in range(-k, k + 1) for b in range(-k, k + 1)) / (2 * k + 1) ** 2
img = bpy.data.images.new("forest", RES, RES, alpha=False)
img.colorspace_settings.name = "Non-Color"
px_ = np.zeros((RES, RES, 4), dtype=np.float32)
# (Blender's rows run from the bottom: row 0 the image's last.)
px_[..., 0] = d[::-1]
px_[..., 3] = 1
img.pixels[:] = px_.ravel()
img.filepath_raw = os.path.join(OUT, "forest.webp")
img.file_format = "WEBP"
img.save(quality=100)  # (lossless; a plain save() is lossy WebP)
print("forest.webp", RES)
