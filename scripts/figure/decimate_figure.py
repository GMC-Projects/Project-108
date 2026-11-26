"""A lighter copy of a /gratitude figure, for the people further off: the
simplified one (figure-far.glb) decimated again, its parts, materials and
colour sets kept, as build_figure_mpfb.py exports them.

    /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/figure/decimate_figure.py -- public/gratitude/figure-far.glb public/gratitude/figure-distant.glb 1200

(Not a rebuild of the figure: build_figure_mpfb.py makes the first two from
MPFB; this only thins the second, so the three stay one person.)
"""

import os
import sys

import bpy

SRC, OUT, TRIS = sys.argv[sys.argv.index("--") + 1 :][:3]
TRIS = int(TRIS)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
total = sum(tri_count(o) for o in meshes)
for o in meshes:
    bpy.context.view_layer.objects.active = o
    dec = o.modifiers.new("dec", "DECIMATE")
    dec.ratio = TRIS / total
    bpy.ops.object.modifier_apply(modifier=dec.name)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
    # (Both colour sets, in the order they came: the exporter's blank first
    # and the painted one, hair in red and the cloth's folds in green,
    # second, as the page reads them.)
    export_vertex_color="ACTIVE",
    export_all_vertex_colors=True,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
)
print(f"wrote {OUT}: {sum(tri_count(o) for o in meshes)} triangles (from {total}), {os.path.getsize(OUT) // 1024} KB")
