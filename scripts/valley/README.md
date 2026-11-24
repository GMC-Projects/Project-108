# The valley for /gratitude

`public/gratitude/valley.glb` and `components/gratitude/valley/site.ts` are
generated from public data, in two steps:

```bash
python3 -m venv /tmp/valley && /tmp/valley/bin/pip install rasterio numpy pillow
/tmp/valley/bin/python scripts/valley/fetch.py /tmp/valley-data   # ~50 MB read, cropped
/tmp/valley/bin/python scripts/valley/bake.py /tmp/valley-data
npx @gltf-transform/cli@4.1.1 draco public/gratitude/valley.glb public/gratitude/valley.glb \
  --quantize-position 16 --quantize-color 10                        # 4.5 MB to ~180 KB
blender -b -P scripts/valley/bake_ground.py -- --size 4096          # the ground's colour and shade
```

- **Imagery:** Sentinel-2 L2A true colour, 18 Jan 2025 (gap filled from
  20 Jan), via the public AWS archive. Credit required on the page:
  "Contains modified Copernicus Sentinel data 2025".
- **Heights:** Copernicus DEM GLO-30 (30 m), via its public AWS archive.
- **The Mau Chhu's bed** is traced by eye from the imagery (`BED` in
  `bake.py`). The 108 stand along its east bank with 108.bt's spacing; the
  crowd on its west bank. If surveyed chorten positions become available,
  replace `row_x` / `row_z` in `bake.py` with them.

Units follow 108.bt's footer: x south, z west, about 18 m to a unit,
y = (metres − 180) × 0.045.

The .glb opens textured in Blender (File → Import → glTF). Edits made there
are overwritten if `bake.py` is run again.
