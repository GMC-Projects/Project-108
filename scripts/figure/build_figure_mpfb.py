"""Builds the seated figure for /gratitude from an MPFB (MakeHuman) human:
a person sitting cross-legged in a gho, holding an orb in cupped hands at
chest height, eyes closed, head bowed toward it. Exported as
public/gratitude/figure.glb (in full) and figure-far.glb (simplified), and
saved as figure.blend beside this script.

MPFB (Blender extension "mpfb", GPL; the humans it makes are CC0) gives the
body: real proportions, hands with fingers, a face. It is posed here with
its own skeleton, the legs and arms by inverse kinematics to where the seat
and the orb put them; then the gho is drawn over it, grown out from the
body's own surface, with the lagey's white cuffs and collar, and short hair
from the scalp.

As before: in metres, facing Blender's -Y (glTF's +Z), origin on the ground
under the lap, the orb's centre at ORB (the page frames its shots on it).
Materials robe, skin, cuff, hair; an empty, "orb", marks the orb.

Run (needs the MPFB extension enabled in this Blender):
  /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/figure/build_figure_mpfb.py -- public/gratitude/figure.glb [preview.png]
"""

import importlib
import math
import os
import sys

import addon_utils
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else "figure.glb"
PREVIEW = argv[1] if len(argv) > 1 else None

ORB = Vector((0, -0.33, 0.6))  # the orb's centre, from the ground under the lap (set by the pose below)
# Who: "man" (figure.glb), "woman" (figure-woman.glb: kira and tego, hair tied
# back), "elder" (figure-elder.glb: an older man, grey-haired). From the
# file name given, or VARIANT.
VARIANT = os.environ.get("VARIANT") or ("woman" if "woman" in OUT else "elder" if "elder" in OUT else "man")
R = 0.085  # its radius: about a head across

bpy.ops.wm.read_factory_settings(use_empty=True)
MPFB = next(m.__name__ for m in addon_utils.modules() if m.__name__.endswith(".mpfb"))
addon_utils.enable(MPFB, default_set=True)
HumanService = importlib.import_module(MPFB + ".services.humanservice").HumanService
TargetService = importlib.import_module(MPFB + ".services.targetservice").TargetService
TARGETS = os.path.join(os.path.dirname(importlib.import_module(MPFB).__file__), "data", "targets")
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
GREY = material("grey", (0.55, 0.53, 0.5))


def active(o, mode="OBJECT"):
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    if mode != "OBJECT":
        bpy.ops.object.mode_set(mode=mode)


# ── The person: an adult of the region, eyes closed.
macro = TargetService.get_default_macro_info_dict()
macro.update(
    {
        "man": {"gender": 1.0, "age": 0.5, "muscle": 0.5, "weight": 0.55, "height": 0.45},
        "woman": {"gender": 0.0, "age": 0.45, "muscle": 0.4, "weight": 0.55, "height": 0.4},
        "elder": {"gender": 1.0, "age": 0.92, "muscle": 0.35, "weight": 0.5, "height": 0.4},
    }[VARIANT]
)
macro["race"] = {"asian": 1.0, "caucasian": 0.0, "african": 0.0}
body = HumanService.create_human(scale=0.1, feet_on_ground=True, macro_detail_dict=macro)
for side in ("left", "right"):
    TargetService.load_target(body, os.path.join(TARGETS, "expression", "units", "asian", f"eye-{side}-closure.target.gz"), weight=1.0)
TargetService.bake_targets(body)
rig = HumanService.add_builtin_rig(body, "default")
pose = rig.pose.bones


def head_of(name):
    return rig.matrix_world @ pose[name].head


def tail_of(name):
    return rig.matrix_world @ pose[name].tail


def turn(name, axis, degrees):
    """Turn a bone about one of its own axes."""
    pb = pose[name]
    pb.rotation_mode = "QUATERNION"
    q = pb.rotation_quaternion.copy()
    from mathutils import Quaternion

    pb.rotation_quaternion = q @ Quaternion(Vector(axis), math.radians(degrees))


def ik(bone, target, pole, chain):
    """Reach `bone`'s tail to `target`, the joint above it bending toward `pole`."""
    for nm, at in ((f"{bone}_t", target), (f"{bone}_p", pole)):
        e = bpy.data.objects.new(nm, None)
        scene.collection.objects.link(e)
        e.location = at
    c = pose[bone].constraints.new("IK")
    c.target = bpy.data.objects[f"{bone}_t"]
    c.pole_target = bpy.data.objects[f"{bone}_p"]
    c.pole_angle = math.radians(-90)
    c.chain_count = chain
    return c


def bake_pose():
    """Make what the constraints do the bones' own pose, then drop them."""
    bpy.context.view_layer.update()
    active(rig, "POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.visual_transform_apply()
    for pb in pose:
        for c in list(pb.constraints):
            pb.constraints.remove(c)
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in [o for o in bpy.data.objects if o.type == "EMPTY" and o.name.endswith(("_t", "_p"))]:
        bpy.data.objects.remove(o)
    bpy.context.view_layer.update()


def orient(bone, F, N, Ft, Nt):
    """Turn a bone (and what hangs from it) so its own pair of directions
    (F, N, in the world) come to (Ft, Nt), about its head."""
    Nt = (Nt - Ft * Nt.dot(Ft)).normalized()
    cur = Matrix((F, N, F.cross(N))).transposed()
    tgt = Matrix((Ft, Nt, Ft.cross(Nt))).transposed()
    pb = pose[bone]
    m = rig.matrix_world @ pb.matrix
    loc = m.to_translation()
    m = Matrix.Translation(loc) @ (tgt @ cur.inverted()).to_4x4() @ Matrix.Translation(-loc) @ m
    pb.matrix = rig.matrix_world.inverted() @ m
    bpy.context.view_layer.update()


def foot_frame(side):
    """A foot's own directions: heel to toes, and out of its sole."""
    a, t1, t5 = head_of(f"foot.{side}"), head_of(f"toe1-1.{side}"), head_of(f"toe5-1.{side}")
    F = ((t1 + t5) / 2 - a).normalized()
    return F, F.cross((t1 - t5).normalized()).normalized()


# Which way each sole faces, read standing (soles down), so the sign holds.
sole_sign = {}
for sd in ("L", "R"):
    F, N = foot_frame(sd)
    sole_sign[sd] = 1.0 if N.z < 0 else -1.0

# ── The gho's upper part, made on the standing body and bound to its
# skeleton, so it is posed with it (scripts/figure/gho.py).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gho import build_gho  # noqa: E402

garment, _ = build_gho(body, rig, head_of, ROBE, CUFF, scene)
if os.environ.get("GHO_REST"):
    # (Development: the garment as made, standing, before any posing.)
    garment.modifiers["pose"].show_render = False
    body.modifiers[-1].show_render = False
    for loc, aim_ in (((0.0, -2.4, 1.2), (0, 0, 1.0)), ((-1.0, -1.2, 0.9), (-0.45, 0, 0.85))):
        bpy.ops.object.camera_add(location=loc)
        cam = bpy.context.object
        cam.rotation_euler = (Vector(aim_) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.camera = cam
        bpy.ops.object.light_add(type="SUN", rotation=(0.7, 0.2, 0.3))
        scene.render.engine = "BLENDER_EEVEE"
        scene.render.resolution_x = scene.render.resolution_y = 600
        scene.render.filepath = os.environ["GHO_REST"] + f"-{int(loc[0] * 10)}.png"
        bpy.ops.render.render(write_still=True)
    sys.exit(0)

# ── Seated cross-legged, as people sit on the ground: the knees dropped wide
# and low; both shins on the ground, the left in front of the right; each
# foot tucked under the other knee, resting on its outer edge, sole turned
# up toward the body. The back upright, leaning a little over the orb.
hipL, hipR = head_of("upperleg01.L"), head_of("upperleg01.R")
H = (hipL.z + hipR.z) / 2
Y0 = (hipL.y + hipR.y) / 2
FLOOR = H - 0.1  # the hips sit about a hand above the ground
def aim(bone, target):
    """Turn a bone about its head so it points at a place (its children with it)."""
    bpy.context.view_layer.update()
    h, t = head_of(bone), tail_of(bone)
    q = (t - h).normalized().rotation_difference((target - h).normalized())
    pb = pose[bone]
    m = rig.matrix_world @ pb.matrix
    m = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ m
    pb.matrix = rig.matrix_world.inverted() @ m
    bpy.context.view_layer.update()


def at(x, y, z):
    """A place from the ground under the seat: x to the left, y back, z up."""
    return Vector((x, Y0 + y, FLOOR + z))


# The knees wide and low, a knee's thickness off the ground; the left shin
# in front of the right, both on the ground, the feet tucked under the
# other knee (as far as the shins reach: to about the middle).
for sd, knee, ankle in (("L", at(0.42, -0.25, 0.06), at(-0.22, -0.33, 0.05)), ("R", at(-0.4, -0.16, 0.06), at(0.22, -0.15, 0.05))):
    aim(f"upperleg01.{sd}", knee)
    aim(f"upperleg02.{sd}", knee)
    aim(f"lowerleg01.{sd}", ankle)
    aim(f"lowerleg02.{sd}", ankle)
for nm in ("spine05", "spine04", "spine03", "spine02", "spine01"):
    turn(nm, (1, 0, 0), 3)
bpy.context.view_layer.update()
for s_, sd in ((1, "L"), (-1, "R")):
    F, N = foot_frame(sd)
    # Pointing across, under the other knee, a little back; the sole up and in.
    orient(f"foot.{sd}", F, N * sole_sign[sd], Vector((-s_, 0.25, -0.1)).normalized(), Vector((0.25 * s_, 0.55, 0.8)).normalized())

# Where the ground is now (the lowest of the folded legs and seat).
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
ev = body.evaluated_get(dg)
ground = min((body.matrix_world @ v.co).z for v in ev.to_mesh().vertices)
ev.to_mesh_clear()
# The orb held up in front of the face, at the chin, a forearm out: cupped
# from beneath in both hands, elbows hanging down by the sides (not out),
# the head bowed to it so the face looks down into its light.
chest = (head_of("clavicle.L") + head_of("clavicle.R")) / 2
# (At the chest, the forearms level, so the palms turn up under it.)
orb = Vector((0, chest.y - 0.3, chest.z - 0.1))
for s, side in ((1, "L"), (-1, "R")):
    # (The two hands together, little fingers touching: one cup under it.)
    wrist = orb + Vector((0.075 * s, 0.075, -R - 0.03))
    ik(f"lowerarm02.{side}", wrist, Vector((0.3 * s, Y0 + 0.25, ground + 0.05)), 4)
bake_pose()

# The hands: each turned so its palm faces up under the orb and its fingers
# point forward and a little in, the two meeting as one cradle; worked out
# from the hand's own joints, not guessed: across the knuckles, along the
# hand, and the palm's side found by the thumb, which sits on it.
bpy.context.view_layer.update()
for s_, side in ((1, "L"), (-1, "R")):
    w = head_of(f"wrist.{side}")
    a = head_of(f"finger2-1.{side}")
    b = head_of(f"finger5-1.{side}")
    th = head_of(f"finger1-2.{side}")
    F = ((a + b) / 2 - w).normalized()
    X = (a - b).normalized()
    N = F.cross(X).normalized()
    if N.dot(th - (a + b) / 2) < 0:
        N = -N
    Ft = Vector((-0.4 * s_, -1, 0.08)).normalized()
    Nt = Vector((-0.3 * s_, 0.1, 1))
    Nt = (Nt - Ft * Nt.dot(Ft)).normalized()
    cur = Matrix((F, N, F.cross(N))).transposed()
    tgt = Matrix((Ft, Nt, Ft.cross(Nt))).transposed()
    turn_w = tgt @ cur.inverted()
    pb = pose[f"wrist.{side}"]
    m = rig.matrix_world @ pb.matrix
    loc = m.to_translation()
    m = Matrix.Translation(loc) @ turn_w.to_4x4() @ Matrix.Translation(-loc) @ m
    pb.matrix = rig.matrix_world.inverted() @ m
    bpy.context.view_layer.update()
    # The fingers curved up round it, together; the thumb along its side.
    for f in range(2, 6):
        for j2 in (1, 2, 3):
            turn(f"finger{f}-{j2}.{side}", (1, 0, 0), float(os.environ.get("CURL", "22")))
    turn(f"finger1-2.{side}", (1, 0, 0), 12)
# The head bowed to it.
for nm, deg in (("neck01", 6), ("neck02", 6), ("neck03", 6), ("head", 14)):
    turn(nm, (1, 0, 0), deg)
bpy.context.view_layer.update()
# The arm's joints, for the cuffs (moved below as the body is).
joints = {f"{b}.{sd}": head_of(f"{b}.{sd}") for b in ("lowerarm01", "wrist", "lowerleg01") for sd in ("L", "R")}

# The pose made the body's own: the helpers (eyeballs, teeth, ...) and the
# skeleton's hold applied away.
active(body)
for m in list(body.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)
active(garment)
for m in list(garment.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)
if os.environ.get("GHO_POSED"):
    # (Development: the garment alone, posed.)
    body.hide_render = True
    for loc, aim_ in (((-0.8, -0.9, 0.75), (0, -0.15, 0.6)), ((0.0, -1.1, 0.8), (0, -0.1, 0.6))):
        loc = Vector(loc) + Vector((0, Y0, ground))
        aim_ = Vector(aim_) + Vector((0, Y0, ground))
        bpy.ops.object.camera_add(location=loc)
        cam = bpy.context.object
        cam.rotation_euler = (aim_ - loc).to_track_quat("-Z", "Y").to_euler()
        scene.camera = cam
        bpy.ops.object.light_add(type="SUN", rotation=(0.7, 0.2, 0.3))
        scene.render.engine = "BLENDER_EEVEE"
        scene.render.resolution_x = scene.render.resolution_y = 600
        scene.render.filepath = os.environ["GHO_POSED"] + f"-{int(loc[0] * 10)}.png"
        bpy.ops.render.render(write_still=True)
    sys.exit(0)
bpy.data.objects.remove(rig)
# On the ground under the lap, the orb at ORB.
shift = Vector((0, Y0, ground))
for o in (body, garment):
    o.location -= shift
    active(o)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
ORB = orb - shift
joints = {k: v - shift for k, v in joints.items()}
print(f"orb at {tuple(round(v, 3) for v in ORB)}")
# All three hold the orb at the same place (the man's), so the page has one
# orb for every seat: the woman and the elder scaled a little about the
# ground under them, and moved forward or back to it.
MAN_ORB = Vector([float(x) for x in os.environ.get("MAN_ORB", "0,-0.4,0.68").split(",")])
if VARIANT != "man":
    k = MAN_ORB.z / ORB.z
    dy = MAN_ORB.y - ORB.y * k
    # (Body and garment both, each made the active object first: applied with
    # the garment left active from the loop above, the body kept its scale
    # unapplied and everything read from its mesh after was unscaled.)
    for o in (body, garment):
        active(o)
        o.scale = (k, k, k)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        o.location.y = dy
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    joints = {kk: v * k + Vector((0, dy, 0)) for kk, v in joints.items()}
    ORB = MAN_ORB.copy()
    print(f"fitted by {k:.3f}")

import bmesh  # noqa: E402

SOCK = material("sock", (0.16, 0.14, 0.13))
KERA = material("kera", (0.6, 0.45, 0.2))
body.data.materials.clear()
for m in (SKIN, ROBE, CUFF, HAIR, SOCK, KERA):
    body.data.materials.append(m)
MI = {"skin": 0, "robe": 1, "cuff": 2, "hair": 3, "sock": 4, "kera": 5}
groups = {g.index: g.name for g in body.vertex_groups}


def weight_in(v, prefixes):
    return sum(g.weight for g in v.groups if groups.get(g.group, "").startswith(prefixes))


def centre_of(prefix):
    """Where a bone's flesh is: its vertices' centre, by how much it carries each."""
    total, at = 0.0, Vector()
    for v in body.data.vertices:
        w = weight_in(v, (prefix,))
        if w > 0.2:
            total += w
            at += v.co * w
    return at / total


neck = centre_of("neck01")
headC = centre_of("head")
pelvisC = centre_of("pelvis")
# The waist, where the kera is tied: a hand above the seat.
zW = pelvisC.z + 0.09


def smoothstep_(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def offset_shell(faces, push, smooth, name, mat):
    """Cloth over the given body faces: lifted off the skin by `push`, smoothed
    of the body's small shapes, then let out again (smoothing draws it in)."""
    sh = bmesh.new()
    remap = {}
    for f in faces:
        vs = []
        for v in f.verts:
            if v.index not in remap:
                remap[v.index] = sh.verts.new(v.co + v.normal * push)
            vs.append(remap[v.index])
        try:
            sh.faces.new(vs)
        except ValueError:
            pass
    for _ in range(smooth):
        bmesh.ops.smooth_vert(sh, verts=sh.verts[:], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.recalc_face_normals(sh, faces=sh.faces[:])
    sh.normal_update()
    for v in sh.verts:
        v.co += v.normal * 0.01
    me = bpy.data.meshes.new(name)
    sh.to_mesh(me)
    sh.free()
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    o.data.materials.append(mat)
    return o


bm = bmesh.new()
bm.from_mesh(body.data)
bm.verts.ensure_lookup_table()
bm.faces.ensure_lookup_table()
deform = bm.verts.layers.deform.active
gidx = {name: i for i, name in groups.items()}


def vw(v, prefixes):
    d = v[deform]
    return sum(w for gi, w in d.items() if groups.get(gi, "").startswith(prefixes))


wristP = {sd: joints[f"wrist.{sd}"] for sd in ("L", "R")}


def near_wrist(co, reach):
    return min((co - w).length for w in wristP.values()) < reach


# ── The gho's upper part: over the trunk and down the arms to a hand short
# of the wrist (the cuffs take over there), above the kera.
UPPER = ("spine", "clavicle", "shoulder", "upperarm", "lowerarm", "breast", "neck01", "pelvis")
bodice = garment
active(bodice)
th = bodice.modifiers.new("cloth", "SOLIDIFY")
th.thickness = 0.004
bpy.ops.object.modifier_apply(modifier=th.name)
bpy.ops.object.shade_smooth()

# ── The skirt of the gho, from the kera to the knees: laid over the folded
# legs from above as cloth falls, covering the thighs out to the knees and
# hanging in a curve between them over the crossed shins.
# (Onto the legs and seat only: never the arms or hands.)
lt = bmesh.new()
lt.from_mesh(body.data)
ldef = lt.verts.layers.deform.active


def lw(v, prefixes):
    return sum(w for gi, w in v[ldef].items() if groups.get(gi, "").startswith(prefixes))


bmesh.ops.delete(lt, geom=[f for f in lt.faces if not all(lw(v, ("upperleg", "lowerleg", "foot", "toe", "pelvis")) > 0.3 for v in f.verts)], context="FACES")
legs_me = bpy.data.meshes.new("legs_target")
lt.to_mesh(legs_me)
lt.free()
legs_target = bpy.data.objects.new("legs_target", legs_me)
scene.collection.objects.link(legs_target)
bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, 0.0))
floor = bpy.context.object
# (The trunk at the waist: by the spine's bones, not the seat behind it.)
torso = [v.co for v in body.data.vertices if abs(v.co.z - zW) < 0.015 and weight_in(v, ("spine",)) > 0.6 and weight_in(v, ("upperleg", "pelvis", "lowerarm", "wrist", "finger")) < 0.2]
c = sum(torso, Vector()) / len(torso)
thigh = [v.co for v in body.data.vertices if weight_in(v, ("upperleg",)) > 0.4]
# The skirt as cloth: a ring of it pinned under the gho's upper part at the
# waist, spread out flat above the folded legs, then let fall in Blender's
# cloth simulation onto the legs and the ground, so it hangs over the knees,
# sags between them and folds as cloth does.
NT, NR = 72, 22
LEN = 0.27  # from the waist to the hem, along the cloth: to the knee, no further
sk = bmesh.new()
rings = []
for r in range(NR):
    ring = []
    for a in range(NT):
        th = 2 * math.pi * a / NT
        d = Vector((math.cos(th), math.sin(th), 0))
        # The waist: the trunk's own outline there, let out for the cloth.
        rw = max([(p - c).dot(d) for p in torso if (p - c).normalized().dot(d) > 0.9] or [0.14]) + 0.025
        back = max(0.0, d.y)  # +y is behind
        if r == 0:
            rr, z = rw - 0.005, zW + 0.03
        elif r == 1:
            rr, z = rw + 0.01, zW - 0.04
        else:
            k = (r - 1) / (NR - 2)
            front = max(0.0, -d.y)
            # (Uneven, as a hem lies: a little longer and shorter round it.)
            wob = 0.025 * math.sin(th * 3 + 0.7) + 0.015 * math.sin(th * 7 + 2.1)
            rr, z = rw + 0.01 + (LEN - 0.05 * back + 0.02 * front + wob) * k, zW - 0.04 + 0.02 * k
        ring.append(sk.verts.new(Vector((c.x + d.x * rr, c.y + d.y * rr, z))))
    rings.append(ring)
for r in range(NR - 1):
    for a in range(NT):
        b = (a + 1) % NT
        sk.faces.new((rings[r][a], rings[r][b], rings[r + 1][b], rings[r + 1][a]))
skirt_me = bpy.data.meshes.new("gho_skirt")
sk.to_mesh(skirt_me)
sk.free()
skirt = bpy.data.objects.new("gho_skirt", skirt_me)
scene.collection.objects.link(skirt)
skirt.data.materials.append(ROBE)
pin = skirt.vertex_groups.new(name="pin")
pin.add(list(range(0, 2 * NT)), 1.0, "REPLACE")
for o in (legs_target, floor):
    o.modifiers.new("collide", "COLLISION")
    o.collision.thickness_outer = 0.005
    o.collision.cloth_friction = 8
cloth = skirt.modifiers.new("cloth", "CLOTH")
cs = cloth.settings
cs.quality = 8
cs.mass = 0.25
cs.tension_stiffness = 12
cs.compression_stiffness = 12
cs.shear_stiffness = 6
cs.bending_stiffness = 0.08
cs.air_damping = 2
cs.vertex_group_mass = "pin"
cloth.collision_settings.distance_min = 0.006
cloth.collision_settings.use_self_collision = True
cloth.collision_settings.self_distance_min = 0.005
FRAMES = 90
cloth.point_cache.frame_start = 1
cloth.point_cache.frame_end = FRAMES
scene.frame_start, scene.frame_end = 1, FRAMES
for f in range(1, FRAMES + 1):
    scene.frame_set(f)
active(skirt)
bpy.ops.object.modifier_apply(modifier=cloth.name)
scene.frame_set(1)
so = skirt.modifiers.new("cloth_thick", "SOLIDIFY")
so.thickness = 0.006
bpy.ops.object.modifier_apply(modifier=so.name)
sub = skirt.modifiers.new("smooth", "SUBSURF")
sub.levels = 1
bpy.ops.object.modifier_apply(modifier=sub.name)
bpy.ops.object.shade_smooth()
bpy.data.objects.remove(legs_target)
bpy.data.objects.remove(floor)

# The hemchu: the gho drawn up over the kera and let out, so it bags over
# the waist all round, deepest at the front, its fullness drooping a little
# over the belt line (which it hides). The trunk only: not the sleeves
# passing at that height.
arm_gi = {g.index for g in bodice.vertex_groups if g.name.startswith(("upperarm", "lowerarm", "shoulder"))}
for v in bodice.data.vertices:
    h = v.co.z - zW
    out = Vector((v.co.x - c.x, v.co.y - c.y, 0))
    # (Never the sleeves, though the forearms rest at that height.)
    if sum(g.weight for g in v.groups if g.group in arm_gi) > 0.2:
        continue
    if -0.05 < h < 0.16 and 1e-4 < out.length < 0.26:
        d = out.normalized()
        front = max(0.0, -d.y)
        t = (h + 0.05) / 0.21
        swell = math.sin(math.pi * t) ** 0.8
        v.co += d * (0.03 + 0.05 * front) * swell
        # (The fold hanging over the belt: its lower half drawn down.)
        if t < 0.45:
            v.co.z -= 0.02 * (0.4 + 0.6 * front) * math.sin(math.pi * t / 0.45)

def paint(obj, shade):
    """The part's own shading, for the page: in the green of its colour set
    (the red is the hair's, on the skin)."""
    me = obj.data
    ca = me.color_attributes.get("Col") or me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index]
            ca.data[li].color = (0.0, shade(v), 0.0, 1.0)


# The skirt in the pouch's shadow just under it, fading softly down.
paint(skirt, lambda v: 0.85 * smoothstep_(zW - 0.11, zW - 0.015, v.co.z))
shade_gi = bodice.vertex_groups["shade"].index
paint(bodice, lambda v: next((g.weight for g in v.groups if g.group == shade_gi), 0.0))

# ── The orb itself, resting in the palms: where the hands actually are,
# a little above their centre (the page draws its light from here too).
palmC = centre_of("metacarpal")
ORB = palmC + Vector((0, 0, R + 0.012))
print(f"orb at {tuple(round(v, 3) for v in ORB)}")
ORBM = material("orb", (1.0, 0.85, 0.6))
bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=14, radius=R * 0.97, location=ORB)
orb_ball = bpy.context.object
orb_ball.data.materials.append(ORBM)
bpy.ops.object.shade_smooth()

# ── The body under it: the skin under the gho taken out; the shins and feet
# below the skirt in knee-length socks.
# (Not round the neck and shoulders, where the gho is laid close on the skin.)
HEM = 0.14 + LEN - 0.04  # about where the hem lies, out from the waist


def flat(co):
    return math.hypot(co.x - c.x, co.y - c.y)


# (The thighs only where the skirt covers them: past the hem, to the knee,
# they stay, in the socks' colour.)
# (Nor the forearms: the arm runs on from the hand up into the sleeve, and
# the cuff's opening shows it.)
covered = [f for f in bm.faces if all(((vw(v, UPPER) > 0.5 and v.co.z > zW - 0.02 and vw(v, ("lowerarm",)) < 0.3) or (vw(v, ("upperleg", "pelvis")) > 0.5 and flat(v.co) < HEM)) and (v.co - neck).length > 0.18 for v in f.verts)]
# Knee socks: up the shin to just under the knee; the knee itself, and the
# thigh above it where the skirt leaves it, bare.
kneeP = {sd: joints[f"lowerleg01.{sd}"] for sd in ("L", "R")} if "lowerleg01.L" in joints else {}
for f in bm.faces:
    if all(vw(v, ("lowerleg", "foot", "toe")) > 0.4 and (not kneeP or min((v.co - k).length for k in kneeP.values()) > 0.06) for v in f.verts):
        f.material_index = MI["sock"]
# Hair painted on the scalp, not a cap set on it: how much of each point is
# hair, from the scalp's own weights, softened at the hairline, written as a
# colour the page reads (COLOR_0's red).
# (Only where the scalp's weight is strong: it reaches faintly over the face.)
hair_amt = {v.index: min(1.0, max(0.0, (vw(v, ("scalp",)) - 0.5) / 0.35)) for v in bm.verts}
for _ in range(4):
    hair_amt = {v.index: (hair_amt[v.index] * 2 + sum(hair_amt[e.other_vert(v).index] for e in v.link_edges)) / (2 + len(v.link_edges)) for v in bm.verts}
col = bm.loops.layers.color.new("Col")
for f in bm.faces:
    for loop in f.loops:
        a = hair_amt[loop.vert.index]
        a = a * a * (3 - 2 * a)
        loop[col] = (a, 0.0, 0.0, 1.0)
bmesh.ops.delete(bm, geom=covered, context="FACES")
bm.to_mesh(body.data)
bm.free()

# One mesh, one primitive per material.
bpy.ops.object.select_all(action="DESELECT")
paint(orb_ball, lambda v: 0.0)
for o in (body, bodice, orb_ball) + (() if os.environ.get("BARE") else (skirt,)):
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
fig = body
fig.name = "figure"
for g in list(fig.vertex_groups):
    fig.vertex_groups.remove(g)
# Only the hair's colour goes out (as COLOR_0): any other colour layer the
# parts brought with them is dropped, or the page would read that instead.
for ca in list(fig.data.color_attributes):
    if ca.name != "Col":
        fig.data.color_attributes.remove(ca)
fig.data.color_attributes.active_color = fig.data.color_attributes["Col"]
# (The exporter's "ACTIVE" colour is the render colour, not the active one:
# unset, it wrote a blank COLOR_0 and the hair's in COLOR_1, which the page
# reads as a fallback.)
fig.data.color_attributes.render_color_index = fig.data.color_attributes.active_color_index
# The V of the tego's white showing where the gho crosses over at the chest,
# for the page's shader: the neck's place in the figure's own (glTF) frame.
print(f"neck at {(round(neck.x, 3), round(neck.z, 3), round(-neck.y, 3))}")

bpy.ops.object.empty_add(type="SPHERE", radius=R, location=ORB)
bpy.context.object.name = "orb"

if os.environ.get("BARE"):
    skirt.hide_render = True
if PREVIEW:
    bpy.ops.mesh.primitive_uv_sphere_add(radius=R, location=ORB)
    glow = bpy.data.materials.new("glow")
    glow.use_nodes = True
    nodes = glow.node_tree.nodes
    em = nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1, 0.8, 0.45, 1)
    em.inputs["Strength"].default_value = 4
    glow.node_tree.links.new(em.outputs[0], nodes["Material Output"].inputs[0])
    bpy.context.object.data.materials.append(glow)
    bpy.ops.object.light_add(type="AREA", location=(-1.2, -1.6, 1.4))
    fill = bpy.context.object
    fill.data.energy = 60
    fill.data.size = 2
    fill.rotation_euler = (Vector((0, 0, 0.45)) - fill.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.light_add(type="AREA", location=(1.2, 0.8, 1.4))
    back = bpy.context.object
    back.data.energy = 25
    back.rotation_euler = (Vector((0, 0, 0.45)) - back.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.engine = "BLENDER_EEVEE"
    scene.world = bpy.data.worlds.new("w")
    scene.world.color = (0.03, 0.03, 0.04)
    scene.render.resolution_x = 600
    scene.render.resolution_y = 600
    views = (
        ("a", (0.9, -1.5, 0.75), (0, -0.1, 0.45)),
        ("b", (-0.5, -0.95, 0.62), (0, -0.2, 0.6)),
        ("c", (1.6, -0.1, 0.5), (0, -0.1, 0.4)),
        ("d", (0, -1.7, 0.5), (0, -0.1, 0.42)),
        ("e", tuple(ORB + Vector((0.15, -0.55, 0.2))), tuple(ORB - Vector((0, 0, 0.07)))),
        ("f", (0.2, 1.6, 0.6), (0, -0.1, 0.25)),
    )
    for tag, loc, aim in views:
        bpy.ops.object.camera_add(location=loc)
        cam = bpy.context.object
        cam.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = 50
        scene.camera = cam
        scene.render.filepath = PREVIEW.replace(".png", f"-{tag}.png")
        bpy.ops.render.render(write_still=True)
        print(f"preview {scene.render.filepath}")


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
        export_vertex_color="ACTIVE",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
    )
    print(f"wrote {path}: {tri_count(fig)} triangles, {os.path.getsize(path) // 1024} KB")


# The .blend beside this script, to open and adjust by hand.
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)), f"figure-{VARIANT}.blend"), check_existing=False)
# Two weights: in full for the people near the camera, and simplified for the
# rows behind (figure-far.glb), where a face is a few pixels.
active(fig)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.quads_convert_to_tris()
bpy.ops.object.mode_set(mode="OBJECT")
export(OUT)
dec = fig.modifiers.new("dec", "DECIMATE")
dec.ratio = 5000 / tri_count(fig)
bpy.ops.object.modifier_apply(modifier=dec.name)
export(OUT.replace(".glb", "-far.glb"))
