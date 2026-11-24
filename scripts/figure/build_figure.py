"""Builds the seated figure for /gratitude: a person sitting cross-legged in a
gho, holding an orb in cupped hands at chest height, head bowed toward it.
Exported as public/gratitude/figure.glb.

The body is one piece, grown along a skeleton by Blender's Skin modifier and
smoothed, so the gho runs from the shoulders down over the crossed legs
without seams; the lap drapes wide over the knees, with the kera (the belt)
at the waist. The head has the shapes the orb's light catches from below:
brow, nose, cheeks, chin, ears. The hands cup the orb from beneath, fingers
curled up round it, thumbs along its sides. About 4,000 triangles: it is
drawn some thousand times, seen close only once.

Built in metres, facing Blender's -Y (glTF's +Z), origin on the ground under
the lap. The orb sits where it always has (the page frames its shots on it).
Parts are separate materials, so the page can colour each: robe (tinted per
person), skin, cuff (the gho's white lagey, at the cuffs and collar), hair.
An empty, "orb", marks where the orb sits in the hands.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/figure/build_figure.py -- public/gratitude/figure.glb [preview.png]
"""

import math
import sys

import bpy
from mathutils import Euler, Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else "figure.glb"
PREVIEW = argv[1] if len(argv) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def material(name, rgb):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = 0.9
    return m


ROBE = material("robe", (0.42, 0.18, 0.2))
SKIN = material("skin", (0.45, 0.3, 0.22))
CUFF = material("cuff", (0.86, 0.84, 0.78))
HAIR = material("hair", (0.03, 0.025, 0.025))

ORB = Vector((0, -0.33, 0.6))
parts = []


def apply_all(o):
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def finish(o, mat, smooth=True):
    o.data.materials.clear()
    o.data.materials.append(mat)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    if smooth:
        bpy.ops.object.shade_smooth()
    parts.append(o)
    return o


def skinned(name, verts, edges, radii, mat, subd=2):
    """A smooth tube body grown along a little skeleton: verts with a radius each (x, y)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([Vector(v) for v in verts], edges, [])
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.modifiers.new("skin", "SKIN")
    for i, r in enumerate(radii):
        o.data.skin_vertices[0].data[i].radius = r if isinstance(r, tuple) else (r, r)
    o.data.skin_vertices[0].data[0].use_root = True
    sub = o.modifiers.new("sub", "SUBSURF")
    sub.levels = subd
    sub.render_levels = subd
    apply_all(o)
    return finish(o, mat)


def ellipsoid(name, at, size, mat, rot=(0, 0, 0), segs=16, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1, location=at, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    return finish(o, mat)


def capsule(name, a, b, r, mat, verts=8):
    """A rounded rod from a to b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object
    o.name = name
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    finish(o, mat)
    for end in (a, b):
        ellipsoid(name + "_end", end, (r, r, r), mat, segs=8, rings=5)
    return o


def ring(name, at, axis, radius, depth, mat, verts=14):
    """An open sleeve end: a short tube, its axis along `axis`."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=at, end_fill_type="NOTHING")
    o = bpy.context.object
    o.name = name
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(axis).normalized())
    sol = o.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = 0.012
    apply_all(o)
    return finish(o, mat)


# ── The body in its gho: pelvis up the spine to the neck, the legs crossed in
# front (each knee out to the side, each shin running in under the other),
# and the arms down from the shoulders, elbows out, forearms in to the hands.
verts = [
    (0, 0.0, 0.16),  # 0 pelvis (root)
    (0, -0.02, 0.32),  # 1 belly
    (0, -0.05, 0.46),  # 2 chest
    (0, -0.075, 0.58),  # 3 shoulders
    (0.13, -0.05, 0.12),  # 4 hip R
    (0.36, -0.2, 0.09),  # 5 knee R
    (-0.08, -0.32, 0.07),  # 6 ankle R (in under the left knee)
    (-0.13, -0.05, 0.12),  # 7 hip L
    (-0.36, -0.2, 0.09),  # 8 knee L
    (0.08, -0.29, 0.1),  # 9 ankle L (over the right shin)
    (0.18, -0.07, 0.57),  # 10 shoulder R
    (0.22, -0.17, 0.41),  # 11 elbow R
    (0.1, -0.29, 0.47),  # 12 wrist R
    (-0.18, -0.07, 0.57),  # 13 shoulder L
    (-0.22, -0.17, 0.41),  # 14 elbow L
    (-0.1, -0.29, 0.47),  # 15 wrist L
]
edges = [(0, 1), (1, 2), (2, 3), (0, 4), (4, 5), (5, 6), (0, 7), (7, 8), (8, 9), (3, 10), (10, 11), (11, 12), (3, 13), (13, 14), (14, 15)]
radii = [
    (0.19, 0.16), (0.17, 0.14), (0.17, 0.12), (0.15, 0.1),
    0.1, 0.085, 0.06,
    0.1, 0.085, 0.06,
    0.07, 0.062, 0.058,
    0.07, 0.062, 0.058,
]
body = skinned("gho", verts, edges, radii, ROBE, subd=1)

# The gho's skirt: it falls wide over the knees and pools on the ground.
ellipsoid("lap", (0, -0.12, 0.09), (0.42, 0.3, 0.09), ROBE, segs=24, rings=10)
# The kera, wound at the waist, and the gho bloused over it.
bpy.ops.mesh.primitive_torus_add(major_radius=0.165, minor_radius=0.03, major_segments=24, minor_segments=8, location=(0, -0.02, 0.27))
kera = bpy.context.object
kera.scale = (1.05, 0.88, 1.0)
finish(kera, ROBE)

# The lagey: the white inner collar showing at the neck, and the wide white
# cuffs folded back over the sleeves.
bpy.ops.mesh.primitive_torus_add(major_radius=0.066, minor_radius=0.019, major_segments=24, minor_segments=8, location=(0, -0.085, 0.632), rotation=(math.radians(18), 0, 0))
finish(bpy.context.object, CUFF)
for s in (1, -1):
    elbow = Vector((0.22 * s, -0.17, 0.41))
    wrist = Vector((0.1 * s, -0.29, 0.47))
    d = wrist - elbow
    ring(f"cuff_{s}", elbow.lerp(wrist, 0.8), d, 0.066, 0.075, CUFF)

# ── The head, bowed toward the orb, with the shapes its light finds from below.
HEAD = Vector((0, -0.13, 0.748))
bow = Euler((math.radians(26), 0, 0))
neck = capsule("neck", (0, -0.085, 0.6), (0, -0.11, 0.69), 0.042, SKIN)


def on_head(v):
    """A point in the head's own frame (y forward is -y), bowed and placed."""
    p = Vector(v)
    p.rotate(bow)
    return HEAD + p


def head_part(name, v, size, mat, rot=(0, 0, 0), segs=14, rings=9):
    e = Euler((bow.x + rot[0], rot[1], rot[2]))
    return ellipsoid(name, on_head(v), size, mat, rot=e, segs=segs, rings=rings)


def sculpted(name, mat, shape, segs=40, rings=28, keep=None, grow=0.0, cut=None):
    """A sphere moved point by point by shape(direction) -> its surface point
    in the head's own frame; keep(direction) drops what it says no to (the
    hair keeps only above its hairline). grow lifts it off the skin."""
    import bmesh

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    if cut:
        # A clean edge: everything on the far side of a plane through the sphere goes.
        n, c = cut
        n = Vector(n).normalized()
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=n * c, plane_no=n, clear_inner=True)
    if keep:
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(keep(v.co.normalized()) for v in f.verts)], context="FACES")
    for v in bm.verts:
        d = v.co.normalized()
        p = shape(d)
        v.co = on_head(p + d * grow)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    if grow:
        sol = o.modifiers.new("thick", "SOLIDIFY")
        sol.thickness = 0.004
        apply_all(o)
    return finish(o, mat)


def bump(d, at, width):
    """A soft rise round direction `at`, `width` across (radians)."""
    a = d.angle(Vector(at).normalized())
    return math.exp(-((a / width) ** 2))


def head_shape(d):
    """The head, as a point for each direction d from its centre (y forward is -y)."""
    x, y, z = d
    # An egg: longer front to back than across, the jaw narrowing below.
    r = Vector((0.077, 0.092, 0.098))
    p = Vector((x * r.x, y * r.y, z * r.z))
    if z < 0:
        narrow = 1 - 0.28 * min(1, -z * 1.4)
        p.x *= narrow
        p.y = p.y * (1 - 0.1 * -z) - 0.012 * -z  # the jaw and chin come forward
    # Nose: a ridge down from between the brows to a tip, with its wings.
    p.y -= 0.03 * bump(d, (0, -1, -0.14), 0.15) + 0.016 * bump(d, (0, -1, 0.1), 0.11)
    for sx in (1, -1):
        p.y -= 0.006 * bump(d, (0.13 * sx, -1, -0.2), 0.08)
        # The brow over each eye, and the hollow under it where the eye is
        # closed: the light from below leaves it in shadow.
        p.y -= 0.012 * bump(d, (0.4 * sx, -1, 0.28), 0.18)
        p += d * (-0.012 * bump(d, (0.36 * sx, -1, 0.1), 0.13))
        # Cheekbones, and the mouth's corners set in a little.
        p += d * (0.005 * bump(d, (0.55 * sx, -1, -0.15), 0.2))
        p += d * (-0.003 * bump(d, (0.25 * sx, -1, -0.5), 0.1))
    # The lips, a little full, and the chin.
    p.y -= 0.005 * bump(d, (0, -1, -0.45), 0.14) + 0.008 * bump(d, (0, -0.9, -0.78), 0.2)
    return p


sculpted("head", SKIN, head_shape)
for s in (1, -1):
    head_part(f"ear_{s}", (0.075 * s, 0.006, 0.0), (0.01, 0.02, 0.03), SKIN, rot=(0, 0, 0.3 * s), segs=10, rings=6)
# Short, close-cropped hair: a cap over the crown and down the back of the
# head, its line across the forehead and round above the ears.
sculpted(
    "hair",
    HAIR,
    head_shape,
    segs=64,
    rings=40,
    # The hairline: high over the forehead, above the ears, down to the nape.
    cut=((0, 0.5, 0.87), 0.15),
    grow=0.0035,
)

# ── The hands: cupped together under the orb, a bowl of two palms, the
# fingertips scalloped round its front, the thumbs along its sides.
R = 0.11  # the orb's radius, as the page draws it


def cup_shape(d):
    # A shell under the orb, a hand's thickness off its surface, grooved
    # between the fingers round its front, deepest where the two hands meet.
    az = math.atan2(d.x, -d.y)
    front = max(0.0, math.cos(az))
    groove = max(0.0, -math.cos(az * 8)) ** 3 * front * max(0.0, d.z + 0.6)
    meet = math.exp(-((az / 0.07) ** 2)) * max(0.0, d.z + 0.8)
    return d * (R + 0.016 - 0.006 * groove - 0.008 * meet)


def cup_keep(d):
    # Below the orb's middle, rising at the front into the fingers (eight
    # tips round the front half), lower at the back toward the wrists.
    az = math.atan2(d.x, -d.y)  # 0 at the front
    front = max(0.0, math.cos(az))
    rim = -0.46 + 0.2 * front + 0.09 * front * max(0.0, math.cos(az * 8))
    return d.z < rim


import bmesh  # noqa: E402

bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=40, radius=1.0)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(cup_keep(v.co.normalized()) for v in f.verts)], context="FACES")
for v in bm.verts:
    v.co = ORB + cup_shape(v.co.normalized())
me = bpy.data.meshes.new("hands")
bm.to_mesh(me)
bm.free()
hands = bpy.data.objects.new("hands", me)
bpy.context.collection.objects.link(hands)
sol = hands.modifiers.new("thick", "SOLIDIFY")
sol.thickness = 0.018
sol.offset = 1
sub = hands.modifiers.new("sub", "SUBSURF")
sub.levels = 1
apply_all(hands)
finish(hands, SKIN)
for s in (1, -1):
    # The heel of each hand, back to its cuff.
    capsule(f"heel_{s}", ORB + Vector((0.06 * s, 0.03, -0.095)), Vector((0.1 * s, -0.29, 0.47)), 0.028, SKIN)
    # The thumb, along the top of the hand at the orb's side.
    capsule(f"thumb_{s}", ORB + Vector((0.09 * s, 0.025, -0.085)), ORB + Vector((0.112 * s, -0.012, -0.062)), 0.012, SKIN, verts=6)

# Where the orb sits: in the cupped hands. Its radius, 0.11 m, is the page's.
bpy.ops.object.empty_add(type="SPHERE", radius=R, location=ORB)
bpy.context.object.name = "orb"

# One mesh, one primitive per material.
bpy.ops.object.select_all(action="DESELECT")
for p in parts:
    p.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
fig = bpy.context.object
fig.name = "figure"
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def export(path):
    # The figure and its orb mark only (not the preview's lamp and lights).
    bpy.ops.object.select_all(action="DESELECT")
    fig.select_set(True)
    bpy.data.objects["orb"].select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    print(f"wrote {path}: {tri_count(fig)} triangles")


if PREVIEW:
    # A look at it: lit from the orb, as the page lights it, with a little moon.
    bpy.ops.mesh.primitive_uv_sphere_add(radius=R, location=ORB)
    glow = bpy.data.materials.new("glow")
    glow.use_nodes = True
    nodes = glow.node_tree.nodes
    em = nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1, 0.8, 0.45, 1)
    em.inputs["Strength"].default_value = 6
    glow.node_tree.links.new(em.outputs[0], nodes["Material Output"].inputs[0])
    bpy.context.object.data.materials.append(glow)
    bpy.ops.object.light_add(type="POINT", location=ORB)
    bpy.context.object.data.energy = 25
    bpy.context.object.data.color = (1, 0.8, 0.5)
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), 0, math.radians(150)))
    bpy.context.object.data.energy = 0.4
    bpy.ops.object.light_add(type="AREA", location=(-1.2, -1.6, 1.4))
    fill = bpy.context.object
    fill.data.energy = 40
    fill.data.size = 2
    fill.rotation_euler = (Vector((0, 0, 0.45)) - fill.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.engine = "BLENDER_EEVEE"
    scene.world = bpy.data.worlds.new("w")
    scene.world.color = (0.03, 0.03, 0.04)
    scene.render.resolution_x = 700
    scene.render.resolution_y = 700
    # Two views: three-quarter from the right, and from in front and to the
    # left, low, as the page's close shot sees it.
    for tag, loc, aim in (("a", (0.9, -1.5, 0.75), (0, -0.1, 0.45)), ("b", (-0.5, -0.95, 0.62), (0, -0.2, 0.6))):
        bpy.ops.object.camera_add(location=loc)
        cam = bpy.context.object
        cam.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = 50
        scene.camera = cam
        scene.render.filepath = PREVIEW.replace(".png", f"-{tag}.png")
        bpy.ops.render.render(write_still=True)
        print(f"preview {scene.render.filepath}")

# Two weights: in full for the people near the camera, and simplified for the
# rows behind (figure-far.glb), where a face is a few pixels.
export(OUT)
far = OUT.replace(".glb", "-far.glb")
dec = fig.modifiers.new("dec", "DECIMATE")
dec.ratio = 1600 / tri_count(fig)
apply_all(fig)
export(far)
