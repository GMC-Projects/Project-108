"""Tree and shrub cards for the valley in /gratitude, from Poly Haven's models
(CC0): each rendered from VIEWS ways round, a little from above, as the
camera sees the hills, into one sheet (a row per plant, a column per view).

    blender -b -P scripts/valley/bake_impostors.py -- <poly-haven-models-dir>

Writes public/gratitude/plants-grain.webp (the plant's own light and dark,
evened, and its outline in alpha) and plants-normal.webp (which way each
point faces, in the view's own axes: x right, y up, z toward the eye, 0..1),
and public/gratitude/plants.json: the plants, in row order, with each one's
height over its width as drawn. The page lights the cards itself, by the
moon, in the brief's colours.

Then pad the sheets past each outline (pad_impostors.py), or far plants
show black.
"""
import bpy, json, math, os, sys
import mathutils
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
OUT = os.path.join(ROOT, "public", "gratitude")
SRC = sys.argv[sys.argv.index("--") + 1]
PLANTS = ["island_tree_01", "island_tree_02", "tree_small_02", "wild_rooibos_bush"]
VIEWS = 8
TILE = 256
ELEV = math.radians(18)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def emit_override(kind):
    """Every material: emit its base colour (kind 'grain') or its normal in
    the camera's axes (kind 'normal'), keeping its alpha cut-out."""
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
        if not bsdf or not out:
            continue
        emit = nt.nodes.new("ShaderNodeEmission")
        if kind == "grain":
            src = bsdf.inputs["Base Color"]
            if src.is_linked:
                nt.links.new(src.links[0].from_socket, emit.inputs["Color"])
            else:
                emit.inputs["Color"].default_value = src.default_value
        else:
            geo = nt.nodes.new("ShaderNodeNewGeometry")
            vt = nt.nodes.new("ShaderNodeVectorTransform")
            vt.vector_type, vt.convert_from, vt.convert_to = "NORMAL", "WORLD", "CAMERA"
            nt.links.new(geo.outputs["Normal"], vt.inputs[0])
            # Blender's camera looks down -z: flip z so it points to the eye.
            flip = nt.nodes.new("ShaderNodeVectorMath")
            flip.operation = "MULTIPLY"
            flip.inputs[1].default_value = (0.5, 0.5, -0.5)
            nt.links.new(vt.outputs[0], flip.inputs[0])
            add = nt.nodes.new("ShaderNodeVectorMath")
            add.operation = "ADD"
            add.inputs[1].default_value = (0.5, 0.5, 0.5)
            nt.links.new(flip.outputs[0], add.inputs[0])
            nt.links.new(add.outputs[0], emit.inputs["Color"])
        # Keep the leaves' cut-out: mix with transparency by the alpha.
        alpha = bsdf.inputs["Alpha"]
        mix = nt.nodes.new("ShaderNodeMixShader")
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        if alpha.is_linked:
            nt.links.new(alpha.links[0].from_socket, mix.inputs[0])
        else:
            mix.inputs[0].default_value = alpha.default_value
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(emit.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs["Surface"])
        # (Dithered cut-out: EEVEE's Render Method since 4.2, blend_method gone.)
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "DITHERED"


def render_views(name, kind):
    clear()
    gltf = os.path.join(SRC, name, f"{name}_1k.gltf")
    bpy.ops.import_scene.gltf(filepath=gltf)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    # (Poly Haven's shrubs come several to a file, in a row: only the
    # largest of them, alone.)
    if not name.startswith(("island", "tree")) and len(meshes) > 1:
        def vol(o):
            d = o.dimensions
            return d.x * d.y * d.z
        keep = max(meshes, key=vol)
        for o in meshes:
            if o is not keep:
                bpy.data.objects.remove(o, do_unlink=True)
        meshes = [keep]
    pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
    lo = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centre = (lo + hi) / 2
    width = max(hi.x - lo.x, hi.y - lo.y)
    height = hi.z - lo.z
    emit_override(kind)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = TILE
    # (Raw values, as rendered: no colour management on the way out.)
    sc.render.image_settings.file_format = "OPEN_EXR"
    sc.render.image_settings.color_depth = "16"
    sc.world = bpy.data.worlds.new("w")
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    # Square, fitting the plant's width and height seen a little from above.
    span = max(width, height * math.cos(ELEV) + width * math.sin(ELEV)) * 1.04
    cam.data.ortho_scale = span
    sc.camera = cam
    tiles = []
    for v in range(VIEWS):
        a = v / VIEWS * 2 * math.pi
        d = mathutils.Vector((math.cos(a) * math.cos(ELEV), math.sin(a) * math.cos(ELEV), math.sin(ELEV)))
        cam.location = centre + d * span * 4
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        path = os.path.join(bpy.app.tempdir, f"{name}_{kind}_{v}.exr")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(TILE, TILE, 4)[::-1]
        # (The EXR holds colour premultiplied by alpha; the sheet wants it
        # straight, or every card's outline is darkened and its normals bent.)
        al = px[..., 3:4]
        px[..., :3] = np.where(al > 1e-4, px[..., :3] / np.maximum(al, 1e-4), 0.0)
        tiles.append(px)
        bpy.data.images.remove(img)
    print(name, kind, "w", width, "h", height)
    return np.concatenate(tiles, 1), height / width


rows_g, rows_n, info = [], [], []
for name in PLANTS:
    g, aspect = render_views(name, "grain")
    n, _ = render_views(name, "normal")
    # The grain: its light and dark only, evened to mid grey, like the ground's.
    lum = g[..., 0] * 0.3 + g[..., 1] * 0.59 + g[..., 2] * 0.11
    a = g[..., 3]
    m = lum[a > 0.5]
    lum = np.clip(0.5 + (lum - m.mean()) / max(m.std(), 1e-3) * 0.16, 0, 1) if m.size else lum
    rows_g.append(np.stack([lum, lum, lum, a], -1))
    rows_n.append(np.concatenate([n[..., :3], a[..., None]], -1))
    info.append({"name": name, "aspect": round(aspect, 3), "tree": name.startswith(("island", "tree"))})


def save(rows, fname):
    arr = np.concatenate(rows, 0)
    h, w = arr.shape[:2]
    img = bpy.data.images.new(fname, w, h, alpha=True)
    img.colorspace_settings.name = "Non-Color"
    img.pixels[:] = arr[::-1].ravel()
    img.filepath_raw = os.path.join(OUT, fname)
    img.file_format = "WEBP"
    # (Lossless: the normals' three channels are data, and lossy WebP's
    # half-resolution colour bleeds them into each other. The page ships a
    # compressed copy, made from this.)
    img.save(quality=100)
    print(fname, w, h)


save(rows_g, "plants-grain.webp")
save(rows_n, "plants-normal.webp")
with open(os.path.join(OUT, "plants.json"), "w") as f:
    json.dump({"views": VIEWS, "tile": TILE, "elevation": 18, "plants": info}, f)
