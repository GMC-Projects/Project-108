"""A ground floodlight for the 108 sites, in scene units (a seated person is
0.2 tall). Three objects, exported to public/gratitude/spotlight.glb:
  base  - plate and yoke, origin on the ground, yoke arms along +-X
  head  - the lamp can, origin at the tilt pivot, pointing up (+Z here, +Y in
          glTF), trunnions along +-X
  lens  - the lit front glass, same origin as head
Run: blender -b -P scripts/fixtures/build_spotlight.py
"""
import bpy, bmesh, math, os

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "gratitude", "spotlight.glb")
PIVOT = 0.085  # tilt axis height above the ground
R = 0.044  # can radius
FRONT, BACK = 0.07, -0.045  # can ends along its axis, from the pivot

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene


def mat(name, rgb, rough, metal, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 4.0
    return m


BODY = mat("body", (0.045, 0.045, 0.048), 0.45, 0.8)
LENS = mat("lens", (1.0, 0.93, 0.8), 0.1, 0.0, emit=(1.0, 0.9, 0.72))


def obj(name, bm, m):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
    return o


def bevel(o, w, seg=2):
    md = o.modifiers.new("b", "BEVEL")
    md.width, md.segments, md.limit_method = w, seg, "ANGLE"
    o.modifiers.new("n", "WEIGHTED_NORMAL")


def box(bm, cx, cy, cz, sx, sy, sz):
    r = bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=r["verts"])
    bmesh.ops.translate(bm, vec=(cx, cy, cz), verts=r["verts"])


def cyl(bm, r, depth, z, segs=24, axis="Z", at=(0, 0)):
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=depth)
    v = res["verts"]
    bmesh.ops.translate(bm, vec=(0, 0, z), verts=v)
    if axis == "X":
        bmesh.ops.rotate(bm, verts=v, cent=(0, 0, 0), matrix=__import__("mathutils").Matrix.Rotation(math.pi / 2, 3, "Y"))
    bmesh.ops.translate(bm, vec=(0, at[0], at[1]), verts=v)


# Base: a low plate pinned to the ground, a swivel drum, and the U yoke.
bm = bmesh.new()
box(bm, 0, 0, 0.006, 0.11, 0.085, 0.012)
cyl(bm, 0.022, 0.016, 0.02)
ARM = R + 0.012
box(bm, 0, 0, 0.03, 2 * ARM + 0.012, 0.022, 0.008)  # yoke foot
for sx in (-1, 1):
    box(bm, sx * ARM, 0, (0.03 + PIVOT) / 2 + 0.004, 0.008, 0.022, PIVOT - 0.03 + 0.016)
base = obj("base", bm, BODY)
bevel(base, 0.002)

# Head: the can, a slightly wider front bezel, cooling fins at the back, and
# the trunnion knobs the yoke holds.
bm = bmesh.new()
L = FRONT - BACK
cyl(bm, R, L - 0.012, BACK + (L - 0.012) / 2, segs=32)
cyl(bm, R + 0.004, 0.012, FRONT - 0.006, segs=32)
for k in range(4):
    cyl(bm, R + 0.006, 0.003, BACK + 0.008 + k * 0.011, segs=32)
for sx in (-1, 1):
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.011, radius2=0.011, depth=0.01)
    import mathutils
    bmesh.ops.rotate(bm, verts=res["verts"], cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(math.pi / 2, 3, "Y"))
    bmesh.ops.translate(bm, vec=(sx * (R + 0.005), 0, 0), verts=res["verts"])
head = obj("head", bm, BODY)
bevel(head, 0.0015)

# Lens: the lit glass, just inside the bezel.
bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, segments=32, radius=R - 0.004)
bmesh.ops.translate(bm, vec=(0, 0, FRONT - 0.002), verts=bm.verts)
lens = obj("lens", bm, LENS)

for o in (base, head, lens):
    o.select_set(True)
bpy.context.view_layer.objects.active = base
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
print("wrote", os.path.abspath(OUT))
