"""Makes the lighter chortens for the gratitude page's row of 107 from
108.bt's chorten (used with their permission).

The page draws CHORTEN's own from 108.bt's file itself
(public/gratitude/chorten-hero.glb, a copy of their chorten.glb, and
chorten-hero-mobile.glb, of their chorten-mobile.glb), with its own textures
and materials. The row needs the same chorten lighter: this simplifies that
mesh, keeping its UVs and its coordinates exactly, so the page can dress the
light ones in the hero's own textures (base colour, normal, metal-roughness)
and they read as the same object. Geometry only, Draco-compressed.

Blender cannot read the hero's KTX2 textures, so give it the geometry-only
copy strip_textures.py makes (never the hero file itself: this writes into
public/gratitude):

  python3 scripts/chorten/strip_textures.py public/gratitude/chorten-hero.glb /tmp/chorten-geo.glb
  /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/chorten/build_chorten.py -- \\
    /tmp/chorten-geo.glb public/gratitude scripts/chorten
"""

import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :]
SRC, OUT, NOTES = (os.path.expanduser(a) for a in argv[:3])

WEIGHTS = [
    # name, triangles
    ("row", 14000),  # desktop: 107 of them, about 1.5 million triangles
    ("row-mobile", 5000),
]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
src = next(o for o in bpy.context.scene.objects if o.type == "MESH")
src_tris = sum(len(p.vertices) - 2 for p in src.data.polygons)


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


made = []
for name, target in WEIGHTS:
    o = src.copy()
    o.data = src.data.copy()
    o.name = o.data.name = "chorten"
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.clear()
    mod = o.modifiers.new("decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = target / tri_count(o)
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    path = os.path.join(OUT, f"chorten-{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="NONE",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )
    made.append((name, tri_count(o), path))
    bpy.data.objects.remove(o)

lines = [
    "# Report: the chorten models",
    "",
    "CHORTEN's own is 108.bt's chorten itself, used with their permission:",
    "public/gratitude/chorten-hero.glb is their chorten.glb, chorten-hero-mobile.glb their chorten-mobile.glb, unchanged.",
    "",
    f"The row's lighter versions are simplified from it ({src_tris:,} triangles) by scripts/chorten/build_chorten.py,",
    "geometry only, with its UVs and coordinates kept, so the page dresses them in the hero's own textures.",
    "",
    "| Model | Triangles | Size |",
    "|---|---|---|",
]
for name, tris, path in made:
    lines.append(f"| chorten-{name}.glb | {tris:,} | {os.path.getsize(path) / 1024:,.0f} KB |")
open(os.path.join(NOTES, "REPORT.md"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
