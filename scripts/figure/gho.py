"""The gho's upper part, made as one garment on the standing body, before it
is posed (scripts/figure/build_figure_mpfb.py calls build_gho).

Made on the standing body, where the arms hang clear and every line is
easy to lay straight, and bound to the same skeleton as the body, so when
the body sits and the arms come up the garment goes with it, in one piece,
with no seams between its parts:

  - the body and sleeves: the trunk and arms' own surface lifted off the
    skin and smoothed of its small shapes, the sleeves easing in toward the
    wrist;
  - the lagey: each sleeve's end turned back over itself, a white band a
    hand long lying on the sleeve, its fold a rolled edge at the wrist;
  - the front: a V opening at the neck where the two panels meet, and from
    its point the left panel's edge crossing over the right down to the
    right hip, lying a little proud of it;
  - the neckline brought in close round the neck.

The vertex group "shade" carries the soft shadow along the overlap's edge,
for the page.
"""

import math

import bmesh
import bpy
from mathutils import Vector, kdtree


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


UPPER = ("spine", "clavicle", "shoulder", "upperarm", "lowerarm", "breast", "neck01", "pelvis")
HAND = ("wrist", "finger", "metacarpal")


def build_gho(body, rig, head_of, robe, cuff, scene):
    groups = {g.index: g.name for g in body.vertex_groups}
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    deform = bm.verts.layers.deform.active
    body_gi = next(i for i, n in groups.items() if n == "body")

    def vw(v, prefixes):
        return sum(w for gi, w in v[deform].items() if groups.get(gi, "").startswith(prefixes))

    def centre(prefix):
        total, at = 0.0, Vector()
        for v in bm.verts:
            w = vw(v, (prefix,))
            if w > 0.2 and v[deform].get(body_gi, 0) > 0.5:
                total += w
                at += v.co * w
        return at / total

    neck = centre("neck01")
    pelvis = centre("pelvis")
    zW = pelvis.z + 0.09
    arms = {}
    for sd in ("L", "R"):
        W, E = head_of(f"wrist.{sd}"), head_of(f"lowerarm01.{sd}")
        f = (E - W).normalized()  # up the forearm, from the wrist
        near = [v.co for v in bm.verts if v[deform].get(body_gi, 0) > 0.5 and 0.0 < (v.co - W).dot(f) < 0.08 and vw(v, ("lowerarm", "wrist")) > 0.5]
        radii = sorted(((p - W) - f * (p - W).dot(f)).length for p in near)
        arms[sd] = (W, f, radii[int(len(radii) * 0.8)] if radii else 0.03)

    def along_arm(co):
        """(side, distance up the forearm from the wrist, radial vector) for
        the nearer arm."""
        best = None
        for sd, (W, f, r) in arms.items():
            a = (co - W).dot(f)
            rad = (co - W) - f * a
            if best is None or rad.length < best[2].length:
                best = (sd, a, rad)
        return best

    # ── The body and sleeves: to a centimetre above the wrist.
    def keep(v):
        if v[deform].get(body_gi, 0) < 0.5 or vw(v, UPPER) < 0.5 or vw(v, ("upperleg",)) > 0.4:
            return False
        if v.co.z < zW - 0.04:
            return False
        sd, a, rad = along_arm(v.co)
        # (A little past where the sleeve will end: it is cut clean there below.)
        return not (rad.length < 0.09 and a < -0.02)

    faces = [fc for fc in bm.faces if all(keep(v) for v in fc.verts)]
    sh = bmesh.new()
    sdef = sh.verts.layers.deform.verify()
    remap = {}
    for fc in faces:
        vs = []
        for v in fc.verts:
            if v.index not in remap:
                nv = sh.verts.new(v.co + v.normal * 0.02)
                # The skeleton's hold, as the skin under it has it, but never
                # the hand's: a sleeve follows the forearm, not the turning hand.
                held = {gi: w for gi, w in v[deform].items() if not groups.get(gi, "").startswith(HAND)}
                if not held:
                    held = {gi: w for gi, w in v[deform].items()}
                total = sum(w for gi, w in held.items() if groups.get(gi, "") not in ("body",) and not groups.get(gi, "").startswith(("joint-", "helper-")))
                for gi, w in held.items():
                    nv[sdef][gi] = w / total if total > 0 and groups.get(gi, "") not in ("body",) and not groups.get(gi, "").startswith(("joint-", "helper-")) else w
                remap[v.index] = nv
            vs.append(remap[v.index])
        try:
            sh.faces.new(vs)
        except ValueError:
            pass
    for _ in range(32):
        bmesh.ops.smooth_vert(sh, verts=sh.verts[:], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.recalc_face_normals(sh, faces=sh.faces[:])
    sh.normal_update()
    for v in sh.verts:
        v.co += v.normal * 0.01

    # The sleeves easing in toward the wrist, as sleeves do, so the lagey
    # over their ends is a band, not a bell.
    for v in sh.verts:
        sd, a, rad = along_arm(v.co)
        W, f, r = arms[sd]
        if rad.length < 0.1 and -0.01 < a < 0.14:
            lim = r + 0.012 + 0.014 * smoothstep(0.04, 0.14, a)
            if rad.length > lim:
                v.co -= rad.normalized() * (rad.length - lim)

    # The neckline brought in close round the neck, lying on it.
    tree = kdtree.KDTree(len(bm.verts))
    for v in bm.verts:
        if v[deform].get(body_gi, 0) > 0.5:
            tree.insert(v.co, v.index)
    tree.balance()
    for v in sh.verts:
        d = (v.co - neck).length
        if d < 0.16 and v.co.z > neck.z - 0.14:
            co, idx, _ = tree.find(v.co)
            onto = co + bm.verts[idx].normal * 0.007
            v.co = v.co.lerp(onto, 1.0 - smoothstep(0.07, 0.16, d))

    # ── The front. The V's point, just under the throat; its top on either
    # side of the neck; the overlap's edge from the point to the right hip.
    cy = pelvis.y
    VB = Vector((neck.x - 0.01, 0, neck.z - 0.1))
    VL = Vector((neck.x + 0.05, 0, neck.z - 0.015))
    VR = Vector((neck.x - 0.05, 0, neck.z - 0.015))
    HIP = Vector((pelvis.x - 0.13, 0, zW + 0.01))

    def in_v(x, z):
        if z < VB.z or z > VL.z + 0.03:
            return False
        k = (z - VB.z) / (VL.z - VB.z)
        mid = VB.x + (neck.x - VB.x) * k
        return abs(x - mid) < 0.05 * k

    sh.faces.ensure_lookup_table()
    front = lambda co, n: n.y < -0.15 and co.y < cy  # noqa: E731
    cut = [fc for fc in sh.faces if front(fc.calc_center_median(), fc.normal) and in_v(fc.calc_center_median().x, fc.calc_center_median().z)]
    bmesh.ops.delete(sh, geom=cut, context="FACES")
    # The V's sides laid straight (a cut through the mesh leaves steps).
    for v in sh.verts:
        if v.is_boundary and v.co.y < cy and VB.z - 0.01 < v.co.z < VL.z + 0.035:
            k = max(0.0, min(1.0, (v.co.z - VB.z) / (VL.z - VB.z)))
            mid = VB.x + (neck.x - VB.x) * k
            if abs(v.co.x - mid) < 0.05 * k + 0.025:
                v.co.x = mid + math.copysign(0.05 * k, v.co.x - mid)

    # The overlap: the cloth cut along the line from the V's point to the
    # hip, in front only, so the left panel is free to lie over the right.
    d2 = Vector((HIP.x - VB.x, 0, HIP.z - VB.z)).normalized()
    plane_no = d2.cross(Vector((0, 1, 0))).normalized()
    # (The trunk's front only: the arms hang at the same height, standing.)
    def trunk(co):
        return abs(co.x - pelvis.x) < 0.2 and co.y < cy - 0.02

    tf = [fc for fc in sh.faces if all(trunk(v.co) for v in fc.verts)]
    res = bmesh.ops.bisect_plane(sh, geom=list({v for fc in tf for v in fc.verts}) + list({e for fc in tf for e in fc.edges}) + tf, plane_co=VB, plane_no=plane_no)
    on_line = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge) and all(trunk(v.co) and HIP.z - 0.01 < v.co.z < VB.z + 0.005 for v in e.verts)]
    bmesh.ops.split_edges(sh, edges=on_line)
    sh.normal_update()

    def line_dist(co):
        rel = Vector((co.x - VB.x, 0, co.z - VB.z))
        t = max(0.0, min(1.0, rel.dot(d2) / (HIP - VB).length))
        p = VB + (HIP - VB) * t
        return math.hypot(co.x - p.x, co.z - p.z), rel.dot(plane_no)

    shade_gi = len(groups)
    for v in sh.verts:
        if not trunk(v.co) or not (HIP.z - 0.03 < v.co.z < VB.z + 0.02):
            continue
        d, side = line_dist(v.co)
        # (Which side is the left panel: the one toward the wearer's left, +x.)
        left = side * plane_no.x > 0 if abs(plane_no.x) > 1e-3 else side > 0
        if left and d < 0.04:
            v.co += v.normal * 0.007 * (1.0 - d / 0.04)
        elif not left and d < 0.025:
            v[sdef][shade_gi] = 1.0 - smoothstep(0.002, 0.022, d)
            # (The right panel runs on a little way under the left, so no gap
            # shows between them: its edge drawn across and in.)
            if d < 0.004:
                v.co += Vector((plane_no.x, 0, plane_no.z)) * (0.012 if plane_no.x > 0 else -0.012) - v.normal * 0.004

    # The neckline's edge smoothed along itself (a cut through the mesh's
    # triangles leaves it stepped), keeping the V's straight sides.
    sh.verts.ensure_lookup_table()
    for _ in range(8):
        moves = {}
        for v in sh.verts:
            if not v.is_boundary or (v.co - neck).length > 0.16 or in_v(v.co.x, v.co.z - 0.004) or v.co.z < VB.z:
                continue
            ring = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(ring) == 2:
                moves[v] = (ring[0].co + ring[1].co) * 0.5
        for v, to in moves.items():
            v.co = v.co.lerp(to, 0.6)

    # ── The lagey: each sleeve cut clean across the arm a centimetre above
    # the wrist, and its end turned back over it.
    sh.verts.ensure_lookup_table()
    cuff_faces = []
    for sd, (W, f, r) in arms.items():
        near_arm = [fc for fc in sh.faces if all(((v.co - W) - f * (v.co - W).dot(f)).length < 0.1 and (v.co - W).dot(f) < 0.1 for v in fc.verts)]
        geom = list({e for fc in near_arm for e in fc.edges}) + list({v for fc in near_arm for v in fc.verts}) + near_arm
        # (Just above where the sleeve now ends, its ragged edge cut away.)
        end_a = max(((v.co - W).dot(f) for fc in near_arm for v in fc.verts if v.is_boundary), default=0.012) + 0.008
        cutres = bmesh.ops.bisect_plane(sh, geom=geom, plane_co=W + f * end_a, plane_no=f, clear_inner=True)
        rim = [v for v in cutres["geom_cut"] if isinstance(v, bmesh.types.BMVert) and v.is_valid and v.is_boundary]
        sh.verts.ensure_lookup_table()
        if len(rim) < 6:
            continue
        u = f.orthogonal().normalized()
        w2 = f.cross(u)

        def ang(v):
            rad = (v.co - W) - f * (v.co - W).dot(f)
            return math.atan2(rad.dot(w2), rad.dot(u))

        rim.sort(key=ang)
        roll, up_, lining = [], [], []
        # The sleeve's own girth where the band's edge will lie (measured, so
        # the band rests on it rather than standing off it).
        a_end = sum((v.co - W).dot(f) for v in rim) / len(rim) + 0.085
        ring = [((p.co - W) - f * (p.co - W).dot(f)).length for p in sh.verts if abs((p.co - W).dot(f) - a_end) < 0.012 and ((p.co - W) - f * (p.co - W).dot(f)).length < 0.1]
        girth = sum(ring) / len(ring) if ring else r + 0.025
        # The sleeve under the band drawn in a little, round and even, so the
        # band lies over it everywhere (a cloth surface is never quite round).
        a_rim = sum((v.co - W).dot(f) for v in rim) / len(rim)
        for p in sh.verts:
            if p in rim:
                continue
            a_ = (p.co - W).dot(f)
            rad = (p.co - W) - f * a_
            if a_rim - 0.005 < a_ < a_end + 0.01 and rad.length < 0.1:
                p.co = W + f * a_ + rad.normalized() * min(rad.length, girth - 0.006)
        for v in rim:
            rad = (v.co - W) - f * (v.co - W).dot(f)
            n = rad.normalized()
            a = sh.verts.new(v.co + n * 0.005 - f * 0.003)  # the fold, rolled
            # (Its edge up the arm, resting on the sleeve, a few millimetres proud.)
            b = sh.verts.new(W + f * a_end + n * (girth + 0.004))
            # The white lining inside, carried in from the fold to lie close
            # round the wrist, so the opening is never a hollow.
            c = sh.verts.new(W + f * ((v.co - W).dot(f) + 0.035) + n * (r + 0.006))
            for nv in (a, b, c):
                for gi, wt in v[sdef].items():
                    if gi != shade_gi:
                        nv[sdef][gi] = wt
            roll.append(a)
            up_.append(b)
            lining.append(c)
        for i in range(len(rim)):
            j = (i + 1) % len(rim)
            for quad in ((rim[i], rim[j], roll[j], roll[i]), (roll[i], roll[j], up_[j], up_[i]), (rim[i], lining[i], lining[j], rim[j])):
                try:
                    cuff_faces.append(sh.faces.new(quad))
                except ValueError:
                    pass
    for fc in cuff_faces:
        fc.material_index = 1
    bmesh.ops.recalc_face_normals(sh, faces=sh.faces[:])

    # The hold smoothed across the cloth, so it turns evenly with the arm
    # (the skin's own weighting varies point to point, and twisting the
    # forearm palm-up would crumple the sleeve into teeth).
    bones = {i for i, n in groups.items() if n in rig.data.bones}
    sh.verts.ensure_lookup_table()
    held = [{gi: w for gi, w in v[sdef].items() if gi in bones} for v in sh.verts]
    nbrs = [[e.other_vert(v).index for e in v.link_edges] for v in sh.verts]
    for _ in range(25):
        nxt = []
        for i, h in enumerate(held):
            acc = {gi: w * 0.4 for gi, w in h.items()}
            ns = nbrs[i]
            if ns:
                share = 0.6 / len(ns)
                for j in ns:
                    for gi, w in held[j].items():
                        acc[gi] = acc.get(gi, 0.0) + w * share
            else:
                acc = dict(h)
            total = sum(acc.values())
            nxt.append({gi: w / total for gi, w in acc.items() if w / total > 0.002} if total > 0 else h)
        held = nxt
    for v, h in zip(sh.verts, held):
        for gi in [g for g in v[sdef].keys() if g in bones]:
            del v[sdef][gi]
        for gi, w in h.items():
            v[sdef][gi] = w

    me = bpy.data.meshes.new("gho")
    sh.to_mesh(me)
    sh.free()
    bm.free()
    garment = bpy.data.objects.new("gho", me)
    scene.collection.objects.link(garment)
    for gi in range(len(groups)):
        garment.vertex_groups.new(name=groups[gi])
    garment.vertex_groups.new(name="shade")
    garment.data.materials.append(robe)
    garment.data.materials.append(cuff)
    # The hold smoothed across the cloth, so it turns evenly with the arm
    # (the skin's own weighting varies point to point, and twisting the
    # forearm palm-up would crumple the sleeve into teeth).
    arm = garment.modifiers.new("pose", "ARMATURE")
    arm.object = rig
    return garment, zW
