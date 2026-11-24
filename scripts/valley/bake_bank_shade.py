"""Lights the Mao Chhu's banks for /gratitude in Blender, as bake_ground.py
does the valley: the bank's shape (bake_bank.py's SINK, how far the ground
falls below the meadow) built as a mesh, its shade baked in Cycles, so the
foot of the cut, the hollows and the bars' lee lie in their own shade and
the cut throws its shadow down onto the bar below it.

    blender -b -P scripts/valley/bake_bank_shade.py

Writes public/gratitude/bank-shade.webp over bank.webp's box (river.webp's,
x -130..880, z -180..75), at every STEP-th of its pixels: red the fall below the meadow (0..2 units), green how open each
place is to the sky (ambient occlusion), blue lit by the moon (0 in the
cut's shadow), alpha lit by the noon sun (from 0.3, as below). Run after
bake_bank.py.
"""
import bpy, math, os, tempfile
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
OUT = os.path.join(ROOT, "public", "gratitude")
X0, X1, Z0, Z1 = -130.0, 880.0, -180.0, 75.0
# Every STEP-th of bank.webp's pixels (0.3 units each): 0.45 units, finer
# than the page's mesh along the banks (0.5).
STEP = 1.0
# The page's night light (chortenScene.ts: nightLight; bake_ground.py's NIGHT),
# its own axes: x south, y up, z west.
NIGHT = (0.6113, 0.5970, -0.5195)
# The page's noon sun (chortenScene.ts: noonSun, in the end's picture's upper
# right, low, 0.3 radians up), the same axes.
NOON = (0.7760, 0.2955, 0.5572)

full = np.load(os.path.join(tempfile.gettempdir(), "gratitude-bank-sink.npy"))
H, W = int(full.shape[0] / STEP), int(full.shape[1] / STEP)
# (Resampled by area, rows top = Z0.)
ys = ((np.arange(H) + 0.5) * STEP).astype(int).clip(0, full.shape[0] - 1)
xs = ((np.arange(W) + 0.5) * STEP).astype(int).clip(0, full.shape[1] - 1)
sink = full[np.ix_(ys, xs)].astype(np.float32)
px = (X1 - X0) / W
print("grid", W, H, "unit", px)

# ── The bank as a mesh: the meadow at 0, the bank falling below it ──
# Blender's axes: x the page's x, y the page's -z, z up.
bpy.ops.wm.read_factory_settings(use_empty=True)
gx = X0 + (np.arange(W) + 0.5) * px
gz = Z0 + (np.arange(H) + 0.5) * (Z1 - Z0) / H
XX, ZZ = np.meshgrid(gx, gz)
co = np.stack([XX, -ZZ, -sink], -1).reshape(-1, 3).astype(np.float32)
me = bpy.data.meshes.new("bank")
me.vertices.add(len(co))
me.vertices.foreach_set("co", co.ravel())
i = np.arange(H - 1)[:, None] * W + np.arange(W - 1)[None, :]
quads = np.stack([i, i + W, i + W + 1, i + 1], -1).reshape(-1)
nq = (H - 1) * (W - 1)
me.loops.add(nq * 4)
me.loops.foreach_set("vertex_index", quads.astype(np.int32))
me.polygons.add(nq)
me.polygons.foreach_set("loop_start", (np.arange(nq) * 4).astype(np.int32))
me.polygons.foreach_set("loop_total", np.full(nq, 4, np.int32))
me.polygons.foreach_set("use_smooth", np.ones(nq, bool))
# UVs on the image's pixel centres (its rows from the bottom: the mesh's
# first row, Z0, at the top).
uv = me.uv_layers.new(name="bake")
vu = (np.arange(W) + 0.5) / W
vv = 1.0 - (np.arange(H) + 0.5) / H
VU, VV = np.meshgrid(vu, vv)
per_vert = np.stack([VU, VV], -1).reshape(-1, 2)
uv.data.foreach_set("uv", per_vert[quads].astype(np.float32).ravel())
me.update(calc_edges=True)
ob = bpy.data.objects.new("bank", me)
bpy.context.scene.collection.objects.link(ob)

sc = bpy.context.scene
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
try:
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    sc.cycles.device = "GPU"
except Exception:
    pass
sc.cycles.samples = 192
# The sky an even grey, for the occlusion: how much of it each place sees,
# within six units (the cut, its foot, the hollows; not the far hills,
# which bake_ground.py has).
sc.world = bpy.data.worlds.new("sky")
sc.world.use_nodes = True
sc.world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
sc.world.light_settings.distance = 6.0

mat = bpy.data.materials.new("bank")
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    if n.type != "OUTPUT_MATERIAL":
        nt.nodes.remove(n)
diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
nt.links.new(diff.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
me.materials.append(mat)
img = bpy.data.images.new("ao", W, H, alpha=False, float_buffer=True)
img.colorspace_settings.name = "Non-Color"
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = img
nt.nodes.active = tex
ob.select_set(True)
bpy.context.view_layer.objects.active = ob
bpy.ops.object.bake(type="AO", margin=2)
ao = np.array(img.pixels[:], np.float32).reshape(H, W, 4)[::-1, :, 0]
print("ao", float(ao.min()), float(ao.mean()))

# ── The moon's shadow and the noon sun's, cast by the cut onto the bank below ──
# Traced over the height field toward the light: shaded where the ground
# along the way rises above the line to it, softly (by how far above, over
# the distance), as the light's own breadth and the sky soften it.
h = -sink
rows, cols = np.mgrid[0:H, 0:W].astype(np.float32)


def shadow(light, steps):
    d = np.array([light[0], light[2]]) / math.hypot(light[0], light[2])
    tan = light[1] / math.hypot(light[0], light[2])
    lit = np.ones_like(h)
    for k in range(1, steps):
        s = k * px * 0.5
        c = np.clip(np.round(cols + d[0] * s / px).astype(int), 0, W - 1)
        r = np.clip(np.round(rows + d[1] * s / ((Z1 - Z0) / H)).astype(int), 0, H - 1)
        over = h[r, c] - (h + s * tan)
        lit = np.minimum(lit, np.clip(1.0 - over / (0.06 + 0.12 * s), 0, 1))
    return lit


lit = shadow(NIGHT, 28)
print("shadow", float(lit.mean()))
# (The sun lower, its shadows longer: traced further.)
sun = shadow(NOON, 60)
print("sun shadow", float(sun.mean()))

out = np.zeros((H, W, 3), np.float32)
out[..., 0] = np.clip(sink / 2.0, 0, 1)
out[..., 1] = np.clip(ao, 0, 1)
out[..., 2] = lit
pix = np.ones((H, W, 4), np.float32)
pix[..., :3] = out[::-1]
# (Never transparent, 0.3 at the least: the page reads red, the bank's depth,
# back through a canvas too, which keeps colour multiplied by alpha, and at
# little alpha the depth came back coarse. The page reads the sun as
# (a - 0.3) / 0.7.)
pix[..., 3] = 0.3 + 0.7 * sun[::-1]
res = bpy.data.images.new("bank-shade", W, H, alpha=True)
res.alpha_mode = "STRAIGHT"
res.colorspace_settings.name = "Non-Color"
res.pixels[:] = pix.ravel()
# (Saved through the scene's own output settings, which honour quality 100,
# lossless: the image's own save compressed it, and red, the bank's depth,
# came back a little off on the steep cut.)
path = os.path.join(OUT, "bank-shade.webp")
ims = sc.render.image_settings
ims.file_format = "WEBP"
ims.color_mode = "RGBA"
ims.quality = 100
ims.color_management = "OVERRIDE"
ims.view_settings.view_transform = "Standard"
res.save_render(path, scene=sc)
print("wrote", path, W, H)
