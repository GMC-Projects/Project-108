"""Writes a geometry-only copy of a glTF binary: its textures, images and
samplers dropped (and the extensions only they needed), so Blender, which
cannot read KTX2 (KHR_texture_basisu) textures, can import the mesh.

  python3 scripts/chorten/strip_textures.py in.glb out.glb
"""
import json
import struct
import sys

src, dst = sys.argv[1:3]
b = open(src, "rb").read()
n = struct.unpack("<I", b[12:16])[0]
j = json.loads(b[20 : 20 + n])
rest = b[20 + n :]
for k in ("textures", "images", "samplers"):
    j.pop(k, None)
for m in j.get("materials", []):
    m.pop("normalTexture", None)
    m.pop("occlusionTexture", None)
    m.pop("emissiveTexture", None)
    pbr = m.get("pbrMetallicRoughness", {})
    pbr.pop("baseColorTexture", None)
    pbr.pop("metallicRoughnessTexture", None)
for k in ("extensionsUsed", "extensionsRequired"):
    if k in j:
        j[k] = [e for e in j[k] if e != "KHR_texture_basisu"]
data = json.dumps(j, separators=(",", ":")).encode()
data += b" " * (-len(data) % 4)
out = b[:12] + struct.pack("<I", len(data)) + b"JSON" + data + rest
out = out[:8] + struct.pack("<I", len(out)) + out[12:]
open(dst, "wb").write(out)
