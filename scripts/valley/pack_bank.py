"""Packs Poly Haven's sets (CC0) for the Mao Chhu's banks in /gratitude, as
pack_textures.py does the valley's ground: each material's grain (its colour's
luminance, shaded by its AO, its contrast evened) a channel, and its surface
detail (OpenGL normals' x and y) two to an image.

    python scripts/valley/pack_bank.py <dir with the sets' diff and ao 2k pngs> [size]

Writes public/gratitude/ground/bank-grain.webp (red damp_sand, the slope's
sand; green excavated_soil_wall, the cut's bare soil; blue grass_ground, the
worn turf at the meadow's lip; alpha that turf's green, where its grass is).
(No surface detail of its own: the page borrows the gravel's, being at the
GPU's sixteen textures for the ground.) Prints each one's mean colour,
for TERRAIN_FRAG's palette.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

SRC = Path(sys.argv[1])
SIZE = int(sys.argv[2]) if len(sys.argv) > 2 else 1024
OUT = Path(__file__).resolve().parents[2] / "public" / "gratitude" / "ground"


def load(name, tag):
    im = Image.open(SRC / f"{name}_{tag}_2k.png")
    if im.mode == "I;16":
        a = np.asarray(im, np.float32) / 65535.0
        im = Image.fromarray((a * 255).astype(np.uint8), "L")
        return np.asarray(im.resize((SIZE, SIZE), Image.LANCZOS), np.float32) / 255.0
    return np.asarray(im.convert("RGB").resize((SIZE, SIZE), Image.LANCZOS), np.float32) / 255.0


def grain(name):
    diff, ao = load(name, "diff"), load(name, "ao")
    ao = ao[..., 0] if ao.ndim == 3 else ao
    print(name, "mean colour", np.round(diff.reshape(-1, 3).mean(0), 3).tolist())
    lum = (diff @ np.array([0.299, 0.587, 0.114], np.float32)) * (0.35 + 0.65 * ao) * 255
    return np.clip(128 + (lum - lum.mean()) / max(lum.std(), 1) * 42, 0, 255), diff


def save(arr, name):
    Image.fromarray(np.clip(np.round(arr), 0, 255).astype(np.uint8), "RGBA").save(OUT / f"{name}.webp", quality=86, alpha_quality=86, method=6)
    print(name, (OUT / f"{name}.webp").stat().st_size // 1024, "KB")


sand, _ = grain("damp_sand")
soil, _ = grain("excavated_soil_wall")
turf, turf_diff = grain("grass_ground")
green = np.clip((turf_diff[..., 1] - 0.5 * (turf_diff[..., 0] + turf_diff[..., 2])) * 255 * 6, 0, 255)
save(np.stack([sand, soil, turf, green], -1), "bank-grain")
