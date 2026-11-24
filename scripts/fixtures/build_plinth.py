"""A site's stone foundation, in scene units, to public/gratitude/plinth.glb:
two laid courses, the lower sunk into the ground (the bank is uneven) and
the upper a little narrower, every edge eased. Origin at the ground at the
centre; its top at the height the chorten stands on (0.09). The page draws it
with its own stone shader, so no material.
Run: blender -b -P scripts/fixtures/build_plinth.py
"""
import bpy, bmesh, os

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "gratitude", "plinth.glb")
BASE = 0.55 * 1.5 * 2.3  # chortenScene's R0 * WALK * 2.3
TOP = 0.09

bpy.ops.wm.read_factory_settings(use_empty=True)
bm = bmesh.new()


def course(w, y0, y1):
    r = bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(w, w, y1 - y0), verts=r["verts"])
    bmesh.ops.translate(bm, vec=(0, 0, (y0 + y1) / 2), verts=r["verts"])


course(BASE, -0.12, 0.035)  # the lower course, a hand's depth in the ground
course(BASE * 0.92, 0.035, TOP)  # the upper, stepped in
me = bpy.data.meshes.new("plinth")
bm.to_mesh(me)
bm.free()
o = bpy.data.objects.new("plinth", me)
bpy.context.scene.collection.objects.link(o)
b = o.modifiers.new("b", "BEVEL")
b.width, b.segments, b.limit_method = 0.012, 2, "ANGLE"
o.modifiers.new("n", "WEIGHTED_NORMAL")
o.select_set(True)
bpy.context.view_layer.objects.active = o
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_materials="NONE")
print("wrote", os.path.abspath(OUT))
