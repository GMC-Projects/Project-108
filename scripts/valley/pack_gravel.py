"""Swaps the Mao Chhu's shingle in /gratitude for Poly Haven's dry_river_pebbles
(CC0): rounded river cobbles, as its bed has, in place of river_small_rocks'
flat chips, which read from the page's heights as an even grey.

    python scripts/valley/pack_gravel.py <dir with dry_river_pebbles_{diff,nor_gl,ao}_2k.png> [size]

Writes, in public/gratitude/ground (pack_textures.py's images, the rest of
them left as they are): grain-1's green (the gravel's grain), moss-gravel-nor's
blue and alpha (its surface detail), and gravel-colour.webp, the stones' own
colour with the shade between them (its AO), which the page keeps for the
gravel rather than painting it in greys.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

SRC = Path(sys.argv[1])
SIZE = int(sys.argv[2]) if len(sys.argv) > 2 else 1024
OUT = Path(__file__).resolve().parents[2] / "public" / "gratitude" / "ground"


def load(tag, mode="RGB"):
    im = Image.open(SRC / f"dry_river_pebbles_{tag}_2k.png")
    if im.mode == "I;16":
        a = np.asarray(im, np.float32) / 65535.0
        return np.asarray(Image.fromarray((a * 255).astype(np.uint8), "L").resize((SIZE, SIZE), Image.LANCZOS), np.float32) / 255.0
    return np.asarray(im.convert(mode).resize((SIZE, SIZE), Image.LANCZOS), np.float32) / 255.0


def save(arr, name, mode):
    img = Image.fromarray(np.clip(np.round(arr), 0, 255).astype(np.uint8), mode)
    img.save(OUT / f"{name}.webp", quality=86, alpha_quality=86, method=6)
    print(name, (OUT / f"{name}.webp").stat().st_size // 1024, "KB")


diff = load("diff")
ao = load("ao")
nor = load("nor_gl")

# The grain, as pack_textures.py evens it, from the stones shaded by their AO.
lum = (diff @ np.array([0.299, 0.587, 0.114], np.float32)) * (0.35 + 0.65 * ao) * 255
lum = np.clip(128 + (lum - lum.mean()) / max(lum.std(), 1) * 42, 0, 255)
g1 = np.asarray(Image.open(OUT / "grain-1.webp").convert("RGBA")).copy()
g1[..., 1] = lum.astype(np.uint8)
save(g1, "grain-1", "RGBA")

mg = np.asarray(Image.open(OUT / "moss-gravel-nor.webp").convert("RGBA")).copy()
mg[..., 2:4] = np.round(nor[..., :2] * 255).astype(np.uint8)
save(mg, "moss-gravel-nor", "RGBA")

# The colour, shade and all, evened to a mean of mid grey per channel's own
# balance (the page sets its brightness).
col = diff * (0.35 + 0.65 * ao)[..., None]
col = col / col.mean() * 0.5
save(col * 255, "gravel-colour", "RGB")
