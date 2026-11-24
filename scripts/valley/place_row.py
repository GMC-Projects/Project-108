"""The 108's feet for /gratitude, placed again along the river without the
whole of bake.py (whose elevation data it needs): the same row, laid back
from the river's east edge as river_path.py now has it, each foot set on
the ground as site.ts's own HEIGHTS hold it. Rewrites FEET in site.ts.

    python scripts/valley/place_row.py [--check]

(--check: print how far the row moves, writing nothing.) Run after changing
the river's course (river_path.py); then bake_river.py, bake_bank.py,
bake_bank_shade.py and bake_plants.py, which all read the feet.
"""
import base64, re, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from river_path import course

root = Path(__file__).resolve().parents[2]
SITE = root / "components/gratitude/valley/site.ts"
site = SITE.read_text()

# --- The row, as bake.py lays it (kept in step with it by hand) ---
src = (Path(__file__).resolve().parent / "bake.py").read_text()
SPACING = np.array(eval(re.search(r"^SPACING = (\[.*\])$", src, re.M).group(1)))
ROW_START, ROW_END, SET_BACK = 130.0, 555.0, 19.0
gaps = np.diff(SPACING)
g = np.exp(-0.5 * (np.arange(-12, 13) / 4.0) ** 2); g /= g.sum()
gaps = np.convolve(np.pad(gaps, 12, mode="edge"), g, "valid")
gaps = 0.5 * gaps / gaps.sum() + 0.5 / len(gaps)
frac = np.concatenate([[0], np.cumsum(gaps)])
row_x = ROW_START + frac * (ROW_END - ROW_START)
fx = np.arange(ROW_START - 60, ROW_END + 60, 1.0)
rz, rw, _ = course(fx)
edge = np.where(fx < 140.0, np.interp(140.0, fx, rz - rw), rz - rw)
k = np.exp(-0.5 * (np.arange(-45, 46) / 12.0) ** 2); k /= k.sum()
east = np.convolve(np.pad(edge, 45, mode="edge"), k, "valid")
rng = np.random.default_rng(108)
row_z = np.interp(row_x, fx, east) - SET_BACK + 1.2 * np.sin(row_x * 0.045) + rng.normal(0, 0.25, len(row_x))
rz, rw, _ = course(row_x)
row_z = np.minimum(row_z, rz - rw - 19.0)

# --- The ground under each, as groundAt() reads HEIGHTS ---
m = re.search(r'const HEIGHTS = \{ x0: ([-\d.]+), z0: ([-\d.]+), step: ([\d.]+), nx: (\d+), nz: (\d+), data: "([^"]+)"', site)
hx0, hz0, hs, nx, nz = float(m[1]), float(m[2]), float(m[3]), int(m[4]), int(m[5])
H = np.frombuffer(base64.b64decode(m[6]), np.int16).reshape(nx, nz) / 100.0
def ground(x, z):
    u = min(max((x - hx0) / hs, 0), nx - 1.001); v = min(max((z - hz0) / hs, 0), nz - 1.001)
    i, j = int(u), int(v); fu, fv = u - i, v - j
    if fu + fv <= 1:
        return H[i, j] + (H[i + 1, j] - H[i, j]) * fu + (H[i, j + 1] - H[i, j]) * fv
    return H[i + 1, j + 1] + (H[i, j + 1] - H[i + 1, j + 1]) * (1 - fu) + (H[i + 1, j] - H[i + 1, j + 1]) * (1 - fv)
row_y = np.array([ground(x, z) for x, z in zip(row_x, row_z)])

old = np.array([[float(a), float(b), float(c)] for a, b, c in re.findall(r"\[([-\d.]+),([-\d.]+),([-\d.]+)\]", site.split("export const FEET")[1].split("];")[0])])
dz = row_z - old[:, 2]
print(f"feet {len(row_x)}; x off by at most {np.abs(row_x - old[:, 0]).max():.3f}; z moves {dz.min():.2f}..{dz.max():.2f}; y moves {np.abs(row_y - old[:, 1]).max():.2f} at most")
if "--check" not in sys.argv:
    f = lambda v: f"{v:.2f}".rstrip("0").rstrip(".")
    body = ",".join(f"[{f(x)},{f(y)},{f(z)}]" for x, y, z in zip(row_x, row_y, row_z))
    site = re.sub(r"(export const FEET: \[number, number, number\]\[\] = \[\n).*?(\n\];)", lambda mm: mm[1] + body + mm[2], site, count=1, flags=re.S)
    SITE.write_text(site)
    print("site.ts FEET rewritten")
