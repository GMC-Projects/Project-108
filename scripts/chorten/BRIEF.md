# Brief: the chorten models for /gratitude

Superseded: the page now uses 108.bt's chorten.glb itself for CHORTEN's own and simplifies that mesh for the row (scripts/chorten/build_chorten.py, REPORT.md). Kept for the record.

For Claude Desktop with Blender. Hand it this file as is.

## What we are making, and why

The gratitude page currently draws its chortens from a turned outline in code. It reads as a tech demo. We have permission from the 108.bt team to use their scanned chorten, and we need it in three weights:

- **Hero**: seen close, once: the chorten the contributors' lights build, and the foreground of the closing shot.
- **Mid**: the neighbours near the camera, a dozen or so at a time.
- **Far**: the rest of the row of 108, small on screen, all drawn at once.

The page lights them itself (moonlight, then first light at dawn), so the models carry materials and textures only: no lights, cameras or world.

## Source

`~/Desktop/108bt/108bt-web/app/public/landing/models/chorten-textured.glb`

- One mesh, `Chorten_Web`, about 244,000 triangles, Draco-compressed (Blender's glTF importer reads it).
- One material, `Web_Chorten`: base colour, normal and metallic-roughness textures, each 2048 × 2048 WebP.
- It stands 2 units tall, centred on the origin (y from about −0.95 to +0.95), about 1.06 units wide.

Do not edit the source file. Work on a copy.

## Deliverables

Put all three in `~/Desktop/108/Project-108/public/gratitude/`.

| File | Triangles | Textures | Size on disk |
|---|---|---|---|
| `chorten-hero.glb` | 50,000 to 60,000 | base colour, normal, ORM (occlusion in R, roughness in G, metallic in B), 2048 px WebP | under 2.5 MB |
| `chorten-mid.glb` | 5,000 to 7,000 | base colour and normal, 1024 px WebP, normal baked from the full source | under 400 KB |
| `chorten-far.glb` | 400 to 800 | base colour only, 512 px WebP, with ambient occlusion baked into it | under 80 KB |

### For all three

- **Origin** at the centre of the base, on the ground plane. The model stands on y = 0 and rises along +Y.
- **Height** exactly 1.0 unit, base to the tip of the spire. Scale uniformly. The page sets the real size.
- **Facing**: keep the source's orientation. Note which side is the front (the side with the niche, if any) in the report.
- **One mesh, one material**, named `chorten`. Transforms applied. Smooth shading where the source is smooth, sharp edges kept at the steps and the spire's rings.
- **Silhouette first**: the spire's rings (the 13 wheels), the dome and the stepped base must keep their outline at every weight. Lose detail on flat walls before you lose it on the outline.
- **No** lights, cameras, empties, animations or custom properties.

### Decimation

- Hero: Decimate (Collapse) to about 55,000 triangles, then check the spire and the steps up close. If they break up, use a lower ratio on the body and protect the spire with a vertex group.
- Mid and far: decimate from the hero, then bake from the full-detail source: the normal map for mid, and colour with ambient occlusion for far. Use Cycles, a cage or a ray distance of about 0.01 units, and 16 to 32 px of margin.

### Night look check

The page shows these at night, lit mostly by the moon and by gold lamps at their base. Before exporting, render one 1024 × 1024 PNG per model:

- a dark blue world at strength 0.05;
- a cool sun at about 45°, strength 0.6;
- a warm point light (around 3000 K) low at the base, at 30 % of the height out from it;
- the camera at chest height, 3 units away, looking slightly up.

Save them as `chorten-hero.png`, `chorten-mid.png` and `chorten-far.png` in `~/Desktop/108/Project-108/scripts/chorten/previews/`. The three should read as the same object, the far one simply softer.

## Export settings (glTF 2.0)

- Format: glTF Binary (`.glb`).
- Include: selected objects only. +Y up. Apply modifiers.
- Images: WebP.
- Compression: Draco on for `chorten-hero.glb` only (level 6, position 14 bits, normal 10, texcoord 12). None for mid and far.
- No cameras, no lights, no animation.

## Report back

When done, write `~/Desktop/108/Project-108/scripts/chorten/REPORT.md` with:

- triangle count and file size of each model;
- the scale factor and origin offset applied to the source;
- which side is the front;
- anything that did not decimate cleanly, and how you handled it.

## Not in scope

- No changes to the source file or to anything in `108bt-web`.
- No code changes in the gratitude page. I'll load the models, place them and animate the build myself once the files are in place.
