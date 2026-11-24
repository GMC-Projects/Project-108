"""The Mao Chhu's ripples for /gratitude: a tiling field of small waves, made
as ocean surfaces are in film and games (Tessendorf's way: a Phillips
spectrum of waves of every size and heading, summed by an inverse FFT), its
waves drawn out along x, the way the river runs, as running water draws them.

    python scripts/valley/bake_water.py [size]

Writes public/gratitude/ground/water-nor.webp: red and green the surface's
slope across x and z (0.5 level), blue its height (for the crests, where
water breaks white), tiling seamlessly. TERRAIN_FRAG lays it twice, at two
scales, drifting downstream.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

N = int(sys.argv[1]) if len(sys.argv) > 1 else 512
OUT = Path(__file__).resolve().parents[2] / "public" / "gratitude" / "ground" / "water-nor.webp"
rng = np.random.default_rng(11)

# The tile as a patch of water L across, the wind (here the current) along x.
L = 40.0
WIND = np.array([1.0, 0.0])
V = 6.0  # speed setting the largest waves (L_w = V^2 / g)
g = 9.81
Lw = V * V / g
# (Damped away below a few pixels: kept, they made the tile a scratchy
# hatching rather than waves.)
small = 3.0 * L / N

k = np.fft.fftfreq(N, d=L / N) * 2 * np.pi
KX, KZ = np.meshgrid(k, k)
K = np.hypot(KX, KZ)
K[0, 0] = 1e-6
cosang = (KX * WIND[0] + KZ * WIND[1]) / K
# Phillips: waves across the flow kept a little (a river's ripples are not
# all one way), those against it fewer.
P = np.exp(-1.0 / (K * Lw) ** 2) / K**4 * np.abs(cosang) ** 4 * np.exp(-(K * small) ** 2)
P = np.where(cosang < 0, P * 0.25, P)
P[0, 0] = 0
h0 = (rng.normal(size=(N, N)) + 1j * rng.normal(size=(N, N))) * np.sqrt(P / 2)
h = np.real(np.fft.ifft2(h0))
h = (h - h.mean()) / h.std()

# Slopes by the spectrum's own derivative (exact, so the tile stays seamless).
H = np.fft.fft2(h)
sx = np.real(np.fft.ifft2(1j * KX * H))
sz = np.real(np.fft.ifft2(1j * KZ * H))
scale = 1.0 / (3.0 * max(sx.std(), sz.std()))
r = np.clip(0.5 + sx * scale, 0, 1)
gch = np.clip(0.5 + sz * scale, 0, 1)
b = np.clip(0.5 + h / 6.0, 0, 1)
img = np.stack([r, gch, b], -1)
Image.fromarray(np.round(img * 255).astype(np.uint8), "RGB").save(OUT, quality=92, method=6)
print(OUT, N, "px", OUT.stat().st_size // 1024, "KB", "slope sd", round(float(sx.std()), 4), round(float(sz.std()), 4))
