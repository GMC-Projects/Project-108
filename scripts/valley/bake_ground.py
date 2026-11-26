"""Bakes the valley's ground for /gratitude in Blender, as 108.bt bakes its own:
the colour of the land and the shade of its folds are worked out here, at
full quality, and the page only shows them, over its own fine detail close
by and its live night and dawn light.

An image laid flat over the valley from above (x and z, the page's own):
  public/gratitude/ground-shade.webp   red: how open each place is to the sky
                                       (ambient occlusion); green: lit by the
                                       moon (0 where a hill shades it)
and public/gratitude/ground-bake.json, the area they cover.

Run: blender -b -P scripts/valley/bake_ground.py [-- --size 4096]
"""
import bpy, bmesh, json, math, os, sys
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
OUT = os.path.join(ROOT, "public", "gratitude")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
SIZE = int(argv[argv.index("--size") + 1]) if "--size" in argv else 4096
SHADE = SIZE // 2
# The page's night light (chortenScene.ts: nightLight), in its own axes
# (x south, y up, z west); Blender's are x, -z, y.
NIGHT = (0.6113, 0.5970, -0.5195)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, "valley.glb"))
ter = next(o for o in bpy.data.objects if o.type == "MESH")
me = ter.data

# Flat UVs from above: u along x, v along the page's z (Blender's -y).
xs = [v.co.x for v in me.vertices]
ys = [v.co.y for v in me.vertices]
x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
bm = bmesh.new()
bm.from_mesh(me)
uv = bm.loops.layers.uv.new("bake")
for f in bm.faces:
    for l in f.loops:
        co = l.vert.co
        l[uv].uv = ((co.x - x0) / (x1 - x0), (co.y - y0) / (y1 - y0))
bm.to_mesh(me)
bm.free()
me.uv_layers.active = me.uv_layers["bake"]
for p in me.polygons:
    p.use_smooth = True

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


def node(nt, kind, **kw):
    n = nt.nodes.new(kind)
    for k, v in kw.items():
        setattr(n, k, v)
    return n


def lerp(nt, a, b, f):
    m = node(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MIX")
    for i, v in ((6, a), (7, b)):
        if isinstance(v, tuple):
            m.inputs[i].default_value = (*v, 1)
        else:
            nt.links.new(v, m.inputs[i])
    nt.links.new(f, m.inputs[0])
    return m.outputs[2]


def ramp(nt, src, a, b):
    """smoothstep(a, b, src) as a map range."""
    r = node(nt, "ShaderNodeMapRange", interpolation_type="SMOOTHSTEP")
    r.inputs[1].default_value, r.inputs[2].default_value = a, b
    nt.links.new(src, r.inputs[0])
    return r.outputs[0]


def noise(nt, vec, scale, detail=4.0, rough=0.55):
    n = node(nt, "ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    nt.links.new(vec, n.inputs["Vector"])
    return n.outputs["Fac"]


def math_(nt, op, a, b):
    m = node(nt, "ShaderNodeMath", operation=op)
    for i, v in ((0, a), (1, b)):
        if isinstance(v, (int, float)):
            m.inputs[i].default_value = v
        else:
            nt.links.new(v, m.inputs[i])
    return m.outputs[0]


# ── The land's colour ──
mat = bpy.data.materials.new("ground")
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
geo = node(nt, "ShaderNodeNewGeometry")
sep = node(nt, "ShaderNodeSeparateXYZ")
nt.links.new(geo.outputs["Position"], sep.inputs[0])
nsep = node(nt, "ShaderNodeSeparateXYZ")
nt.links.new(geo.outputs["Normal"], nsep.inputs[0])
pos = geo.outputs["Position"]
height = sep.outputs["Z"]  # the page's y
slope = math_(nt, "SUBTRACT", 1.0, nsep.outputs["Z"])

# Broad variation, and the forest's clumps of crowns.
macro = noise(nt, pos, 0.004, 3.0, 0.5)
mid = noise(nt, pos, 0.02, 4.0, 0.6)
crowns = noise(nt, pos, 0.35, 6.0, 0.7)
# Fields on the floor: cells, each its own shade.
vor = node(nt, "ShaderNodeTexVoronoi")
vor.inputs["Scale"].default_value = 0.09
vor.feature = "F1"
# (Their edges wander, as fields' do, and fade: not ruled polygons.)
vor.inputs["Randomness"].default_value = 0.9
warp = node(nt, "ShaderNodeTexNoise")
warp.inputs["Scale"].default_value = 0.08
warp.inputs["Detail"].default_value = 3.0
nt.links.new(pos, warp.inputs["Vector"])
wpos = node(nt, "ShaderNodeVectorMath", operation="MULTIPLY_ADD")
nt.links.new(warp.outputs["Color"], wpos.inputs[0])
wpos.inputs[1].default_value = (4.0, 4.0, 0.0)
nt.links.new(pos, wpos.inputs[2])
nt.links.new(wpos.outputs[0], vor.inputs["Vector"])
field = vor.outputs["Color"]
fsep = node(nt, "ShaderNodeSeparateColor")
nt.links.new(field, fsep.inputs[0])
fieldTone = fsep.outputs[0]

meadowA, meadowB = (0.14, 0.22, 0.06), (0.28, 0.32, 0.1)  # lush to drier
fieldDry = (0.38, 0.34, 0.14)
forestA, forestB = (0.05, 0.1, 0.04), (0.12, 0.19, 0.07)
rock = (0.2, 0.19, 0.16)

meadow = lerp(nt, meadowA, meadowB, ramp(nt, math_(nt, "ADD", macro, math_(nt, "MULTIPLY", mid, 0.6)), 0.5, 1.2))
# A patchwork of fields over the flat floor, a few dry or ploughed.
fields = lerp(nt, meadow, fieldDry, math_(nt, "MULTIPLY", ramp(nt, fieldTone, 0.55, 0.95), 0.5))
# ...and some fields a deeper, wetter green.
fields = lerp(nt, fields, meadowA, math_(nt, "MULTIPLY", ramp(nt, fieldTone, 0.3, 0.0), 0.5))
# (No fields: drawn as cells they read, from the camera, as camouflage. The
# floor is one meadow, varied softly.)
floor = meadow
forest = lerp(nt, forestA, forestB, ramp(nt, math_(nt, "ADD", crowns, math_(nt, "MULTIPLY", macro, 0.4)), 0.45, 1.05))
# Forest up from the floor's edge and on the slopes, ragged at its margin.
woods = ramp(nt, math_(nt, "ADD", math_(nt, "ADD", ramp(nt, height, 10.0, 24.0), ramp(nt, slope, 0.14, 0.32)), math_(nt, "MULTIPLY", mid, 0.6)), 0.4, 1.25)
land = lerp(nt, floor, forest, woods)
land = lerp(nt, land, rock, math_(nt, "MULTIPLY", ramp(nt, slope, 0.45, 0.7), 0.85))

emit = node(nt, "ShaderNodeEmission")
nt.links.new(land, emit.inputs["Color"])
out = node(nt, "ShaderNodeOutputMaterial")
nt.links.new(emit.outputs[0], out.inputs["Surface"])
me.materials.clear()
me.materials.append(mat)


def bake_to(name, size, kind, **kw):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    # (Kept as the numbers are: the page writes them out as they are.)
    img.colorspace_settings.name = "Non-Color"
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    for o in bpy.data.objects:
        o.select_set(o == ter)
    bpy.context.view_layer.objects.active = ter
    bpy.ops.object.bake(type=kind, margin=4, **kw)
    nt.nodes.remove(tex)
    return img


# (The colour itself is now the satellite image's, bake_satellite.py; this
# procedural one only with --colour.)
if "--colour" in argv:
    sc.cycles.samples = 1
    colour = bake_to("colour", SIZE, "EMIT")
    colour.filepath_raw = os.path.join(OUT, "ground-colour.webp")
    colour.file_format = "WEBP"
    sc.render.image_settings.quality = 82
    colour.save()
    print("colour", SIZE)

# ── The shade of the folds, and the moon's shadows ──
# The world as an even grey sky for the occlusion.
sc.world = bpy.data.worlds.new("sky")
sc.world.use_nodes = True
sc.world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
sc.cycles.samples = 64
for n in list(nt.nodes):
    if n.type not in ("OUTPUT_MATERIAL",):
        nt.nodes.remove(n)
diff = node(nt, "ShaderNodeBsdfDiffuse")
diff.inputs["Color"].default_value = (1, 1, 1, 1)
nt.links.new(diff.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
sc.world.light_settings.distance = 400.0
ao = bake_to("ao", SHADE, "AO")

# The moon's shadows, traced: from each place on the map toward the moon,
# shaded where a hill stands in the way.
import mathutils
from mathutils.bvhtree import BVHTree

dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(ter, dg)
mw = ter.matrix_world
# (From the night light's way round, but low, about 22 degrees up: from high,
# as on the page, the hills cast next to no shadow, and the land no relief.)
az = math.atan2(-NIGHT[2], NIGHT[0])
el = math.radians(22)
d = mathutils.Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
sh = np.ones((SHADE, SHADE), dtype=np.float32)
top = max(v.co.z for v in me.vertices) + 10
for r in range(SHADE):
    yy = y0 + (r + 0.5) / SHADE * (y1 - y0)
    for c in range(SHADE):
        xx = x0 + (c + 0.5) / SHADE * (x1 - x0)
        hit = bvh.ray_cast(mathutils.Vector((xx, yy, top)), mathutils.Vector((0, 0, -1)))
        if hit[0] is None:
            continue
        if bvh.ray_cast(hit[0] + d * 0.3, d)[0] is not None:
            sh[r, c] = 0.0
print("shadow traced")

a = np.array(ao.pixels[:]).reshape(SHADE, SHADE, 4)
both = bpy.data.images.new("shade", SHADE, SHADE, alpha=False)
both.colorspace_settings.name = "Non-Color"
px = np.zeros((SHADE, SHADE, 4), dtype=np.float32)
px[..., 0] = a[..., 0]
px[..., 1] = sh
px[..., 3] = 1.0
both.pixels[:] = px.ravel()
both.filepath_raw = os.path.join(OUT, "ground-shade.webp")
both.file_format = "WEBP"
# (Quality 100: lossless. A plain save() writes lossy WebP at ~90, and its
# half-resolution colour bleeds the packed channels into each other.)
both.save(quality=100)
print("shade", SHADE)

# The area they cover, in the page's x and z.
with open(os.path.join(OUT, "ground-bake.json"), "w") as f:
    json.dump({"x0": x0, "x1": x1, "z0": -y1, "z1": -y0}, f)
print("bounds", x0, x1, -y1, -y0)
