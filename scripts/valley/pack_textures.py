"""Packs Poly Haven's texture sets (CC0) for the valley's ground in /gratitude.

The page takes only each material's grain from its colour (its palette is
its own), and lights the ground by its surface detail. So: the grain (the
colour map's luminance, its contrast evened out) four materials to an image,
one to a channel, in MATERIALS order (ground-grain-0, -1); the surface detail
(OpenGL normal maps' x and y) two to an image (ground-<a>-<b>-nor).

    python pack_textures.py <poly-haven-2k-dir> [size]

The sets, by name, as Poly Haven has them (diff, nor_gl and rough maps):
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

SRC = Path(sys.argv[1])
SIZE = int(sys.argv[2]) if len(sys.argv) > 2 else 1024
OUT = Path(__file__).resolve().parents[2] / "public" / "gratitude" / "ground"
OUT.mkdir(exist_ok=True)

# Name on the page, and Poly Haven's set.
MATERIALS = [
    ("meadow", "grass_path_3"),
    ("damp", "brown_mud_leaves_01"),
    ("dirt", "dirt_aerial_03"),
    ("rock", "rock_face_03"),
    ("moss", "mossy_rock"),
    ("gravel", "river_small_rocks"),
]


def load(name, tag):
    f = next(SRC.glob(f"{name}_{tag}.*"))
    return Image.open(f).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)


def save(img, name):
    img.save(OUT / f"{name}.webp", quality=86, alpha_quality=86, method=6)
    print(name, (OUT / f"{name}.webp").stat().st_size // 1024, "KB")


grains, normals = [], []
for page, src in MATERIALS:
    lum = np.asarray(load(src, "diff").convert("L"), np.float32)
    # Evened to a mid grey with a set spread, so each reads the same weight.
    lum = np.clip(128 + (lum - lum.mean()) / max(lum.std(), 1) * 42, 0, 255)
    grains.append(lum.astype(np.uint8))
    normals.append((page, np.asarray(load(src, "nor"))[..., :2]))

for k in range(0, len(grains), 4):
    ch = grains[k : k + 4]
    while len(ch) < 4:
        ch.append(np.full_like(grains[0], 128))
    save(Image.fromarray(np.stack(ch, -1), "RGBA"), f"grain-{k // 4}")

for (a, na), (b, nb) in zip(normals[0::2], normals[1::2]):
    save(Image.fromarray(np.concatenate([na, nb], -1), "RGBA"), f"{a}-{b}-nor")
