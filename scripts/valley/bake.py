"""Step 2 of 2 (see README.md): bake the valley for /gratitude.

Reads what fetch.py wrote and writes:
  public/gratitude/valley.glb           the terrain, with its gravel bed marked
  components/gratitude/valley/site.ts   where the 108 and the crowd stand

    python bake.py <data-dir>        (needs numpy and pillow)

Scene units are 108.bt's: x runs south (downstream), z west, 1 unit about
18 m, and y = (metres - 180) * 0.045, so heights read as on 108.bt.
"""
import base64, io, json, math, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image

data = Path(sys.argv[1])
root = Path(__file__).resolve().parents[2]
dem = np.load(data / "dem.npy")
grid = json.loads((data / "grid.json").read_text())
W, S, E, N = grid["bounds"]
NX, NY = grid["nx"], grid["ny"]

LAT_S = 111320 / 18
LON_S = 111320 * math.cos(math.radians(26.92)) / 18
def latlon(x, z):
    return 26.958 - x / LAT_S, 90.509 - z / LON_S

# A light blur takes the trees' own height out of the surface model.
k = np.ones(5) / 5
dem_s = np.apply_along_axis(lambda r: np.convolve(r, k, "same"), 1, np.nan_to_num(dem, nan=float(np.nanmean(dem))))
dem_s = np.apply_along_axis(lambda c: np.convolve(c, k, "same"), 0, dem_s)

def sample(arr, x, z):
    """Bilinear sample of a grid-aligned array at scene (x, z)."""
    lat, lon = latlon(np.asarray(x, float), np.asarray(z, float))
    c = (lon - W) / (E - W) * NX - 0.5
    r = (N - lat) / (N - S) * NY - 0.5
    c0 = np.clip(np.floor(c).astype(int), 0, NX - 2); r0 = np.clip(np.floor(r).astype(int), 0, NY - 2)
    fc = np.clip(c - c0, 0, 1); fr = np.clip(r - r0, 0, 1)
    a = arr[..., r0, c0]; b = arr[..., r0, c0 + 1]; cc = arr[..., r0 + 1, c0]; d = arr[..., r0 + 1, c0 + 1]
    return (a * (1 - fc) + b * fc) * (1 - fr) + (cc * (1 - fc) + d * fc) * fr

def smooth01(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

# --- The Mau Chhu's gravel bed, traced by eye from the Sentinel-2 image ----
# x, its west edge z, its east edge z. Below the gorge the bed braids wide;
# its east bank is where the 108 stand, its west bank where the crowd sat.
BED = np.array([
    [120,  -2, -22], [140,   5, -15], [160,   3, -18], [180,   3, -30],
    [200,   5, -45], [220,   5, -50], [240,   3, -45], [260,   0, -40],
    [280,   5, -40], [300,  15, -45], [320,  25, -45], [340,  25, -45],
    [360,  25, -45], [380,  25, -45], [400,  25, -45], [420,  25, -55],
    [440,  22, -60], [460,  22, -60], [480,  22, -55], [500,  20, -45],
    [540,  20, -40], [580,  18, -40],
], float)
def bed(x):
    return np.interp(x, BED[:, 0], BED[:, 1]), np.interp(x, BED[:, 0], BED[:, 2])

# How steep the land is (rise over run, from the 30 m model), for where the
# erosion's detail goes: only on the hills, never on the floor the 108 and
# the people stand on.
gy, gx = np.gradient(dem_s)
steep_s = np.hypot(gx, gy) / 10.0

def vnoise(x, z, f):
    """Smooth value noise at frequency f (per scene unit), 0..1."""
    x = x * f; z = z * f
    i, j = np.floor(x), np.floor(z)
    u, v = x - i, z - j
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v)
    h = lambda a, b: np.modf(np.sin(a * 127.1 + b * 311.7) * 43758.5453)[0] % 1.0
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v

def erosion(x, z):
    """Ridges and gullies finer than the 30 m model holds: ridged noise at
    three scales, in scene units (about 12 m at most)."""
    r = 0.0
    for f, a in ((0.11, 0.55), (0.23, 0.3), (0.47, 0.15)):
        r = r + a * (1.0 - np.abs(2.0 * vnoise(x + 31.0, z - 17.0, f) - 1.0))
    return (r - 0.5) * 1.3

# The gorge the river comes down from behind the hills (river_path.py): the
# 30 m model, blurred, fills it nearly to the brim, so it is cut back in, a
# floor falling gently downstream, wide enough at its mouth to be seen into
# from down the valley, narrowing further in, where its walls hide it.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from river_path import course
from scipy.spatial import cKDTree
_gx = np.arange(-160.0, 141.0, 0.5)
_gorge = cKDTree(np.stack([_gx, course(_gx)[0]], -1))

def height(x, z):
    base = (sample(dem_s, x, z) - 180.0) * 0.045
    hill = smooth01(0.12, 0.35, sample(steep_s, x, z))
    # (None by the river, where the 108 and the people are: from 25 units out
    # of the bed's edge, full by 50.)
    bw, be = bed(x)
    out = np.maximum(be - z, z - bw)
    h = base + erosion(x, z) * hill * smooth01(25.0, 50.0, out)
    d = _gorge.query(np.stack([np.ravel(x), np.ravel(z)], -1))[0].reshape(np.shape(h))
    floor = 4.4 + 0.01 * np.maximum(0.0, 120.0 - np.asarray(x, float))
    # (Fading out as it reaches the bed, which the model holds well.)
    cut = floor + 0.07 * np.maximum(0.0, d - np.interp(x, [80.0, 100.0], [2.0, 7.0])) ** 1.5 + 6.0 * smooth01(116.0, 136.0, np.asarray(x, float))
    return np.minimum(h, cut)

# --- The 108, on the east bank ----------------------------------------------
# Their spacing along the row is 108.bt's (its gelephu-route.ts, read off the
# real route's numbered placemarks), laid along this bank from just below the
# gorge to the plain. The surveyed positions would replace this.
SPACING = [0,0.00323,0.00649,0.00978,0.0131,0.01644,0.0198,0.02318,0.02658,0.02998,0.03852,0.04708,0.05563,0.06415,0.07259,0.08091,0.08898,0.09684,0.10456,0.11224,0.11994,0.12776,0.1997,0.21767,0.23565,0.25362,0.27159,0.28957,0.30754,0.32548,0.33688,0.34811,0.35915,0.37001,0.38071,0.39138,0.40206,0.41274,0.42344,0.43415,0.44001,0.44585,0.45159,0.45727,0.46293,0.46856,0.47419,0.47982,0.48544,0.49109,0.4953,0.49955,0.50382,0.5081,0.5124,0.51672,0.52108,0.52547,0.5299,0.53746,0.54514,0.55292,0.56077,0.56863,0.57646,0.58423,0.59195,0.60218,0.61227,0.62221,0.63201,0.64164,0.65058,0.65915,0.66786,0.67715,0.68727,0.69768,0.70771,0.71748,0.72727,0.73727,0.7475,0.75773,0.76789,0.77795,0.78789,0.79771,0.80746,0.81719,0.82695,0.83673,0.84655,0.85641,0.86628,0.8762,0.8862,0.89632,0.9066,0.91703,0.92746,0.93715,0.94762,0.9581,0.96858,0.97905,0.98953,1]
# (Back from the water's edge far enough to leave a bank between: wet stone,
# dry gravel, rough grass, before the foundations.)
ROW_START, ROW_END, SET_BACK = 130.0, 555.0, 19.0
# 108.bt's spacing packs the first chortens tighter than their foundations
# allow, so it is eased halfway toward even spacing: the rhythm stays (dense
# at the start, sparser through the middle), and no two foundations touch.
# The gaps are also smoothed along the row, so the jump in 108.bt's data
# between the 22nd and 23rd (a break in the real route) leaves no hole.
gaps = np.diff(SPACING)
g = np.exp(-0.5 * (np.arange(-12, 13) / 4.0) ** 2); g /= g.sum()
gaps = np.convolve(np.pad(gaps, 12, mode="edge"), g, "valid")
gaps = 0.5 * gaps / gaps.sum() + 0.5 / len(gaps)
frac = np.concatenate([[0], np.cumsum(gaps)])
row_x = ROW_START + frac * (ROW_END - ROW_START)
# The river's east edge (river_path.py), smoothed so the row bends with the
# river's own winding without following every ripple of it, with a small
# wander of its own. (Above x 140, where the river turns off into its gorge,
# held at its line there.)
fx = np.arange(ROW_START - 60, ROW_END + 60, 1.0)
rz, rw, _ = course(fx)
edge = np.where(fx < 140.0, np.interp(140.0, fx, rz - rw), rz - rw)
k = np.exp(-0.5 * (np.arange(-45, 46) / 12.0) ** 2); k /= k.sum()
east = np.convolve(np.pad(edge, 45, mode="edge"), k, "valid")
rng = np.random.default_rng(108)
row_z = np.interp(row_x, fx, east) - SET_BACK + 1.2 * np.sin(row_x * 0.045) + rng.normal(0, 0.25, len(row_x))
# Never closer to the water than this (land is toward -z): on the grass,
# clear of the stone strip, even where the smoothed line cuts a bend.
rz, rw, _ = course(row_x)
row_z = np.minimum(row_z, rz - rw - 19.0)
row_y = height(row_x, row_z)

# --- The terrain mesh ----------------------------------------------------
X0, X1, Z0, Z1 = -692.0, 878.0, -569.0, 553.0
def lines(a, b, da, db, fine, coarse):
    out = list(np.arange(a, da, coarse)) + list(np.arange(da, db, fine)) + list(np.arange(db, b, coarse)) + [b]
    return np.array(out)
# (2 units apart where the camera looks, 5 beyond: at 4 and 10, the hills
# read as clay.)
xs = lines(X0, X1, 60, 640, 2, 5)
zs = lines(Z0, Z1, -180, 140, 2, 5)
XX, ZZ = np.meshgrid(xs, zs, indexing="ij")
YY = height(XX, ZZ)
nx, nz = len(xs), len(zs)
pos = np.stack([XX, YY, ZZ], -1).reshape(-1, 3).astype(np.float32)
i = np.arange(nx - 1)[:, None] * nz + np.arange(nz - 1)[None, :]
a, b, c, d = i, i + 1, i + nz, i + nz + 1
idx = np.stack([a, b, c, b, d, c], -1).reshape(-1)
idx = idx.astype(np.uint16 if pos.shape[0] < 65536 else np.uint32)

# --- What the page paints from: the gravel bed, per vertex ----------------
# The page textures the ground itself (public/gratitude/textures), by slope
# and height; it needs only to know where the Mau Chhu's gravel lies.
bw, be = bed(XX)
inside = np.minimum(ZZ - be, bw - ZZ)                     # > 0 inside the bed
# A wide, soft edge: the page breaks it up with noise into a ragged bank.
on_bed = smooth01(-14, 10, inside) * smooth01(BED[0, 0], BED[0, 0] + 15, XX) * (1 - smooth01(BED[-1, 0] - 10, BED[-1, 0], XX))
# Green: where across the bed, 0 at its west edge to 1 at its east edge.
across = np.clip((bw - ZZ) / np.maximum(bw - be, 1), 0, 1)
col = np.stack([on_bed, across, np.zeros_like(on_bed)], -1).reshape(-1, 3).astype(np.float32)

# --- Write the .glb ----------------------------------------------------
blobs = []
def view(raw, target=None):
    off = sum(len(x) for x in blobs)
    pad = (-len(raw)) % 4
    blobs.append(raw + b"\0" * pad)
    v = {"buffer": 0, "byteOffset": off, "byteLength": len(raw)}
    if target: v["target"] = target
    return v
views = [view(pos.tobytes(), 34962), view(col.tobytes(), 34962), view(idx.tobytes(), 34963)]
gltf = {
    "asset": {"version": "2.0", "generator": "Project 108 scripts/valley/bake.py",
              "copyright": "Terrain: Copernicus DEM GLO-30, ESA"},
    "scene": 0, "scenes": [{"name": "valley", "nodes": [0]}],
    "nodes": [{"name": "terrain", "mesh": 0}],
    "meshes": [{"name": "terrain", "primitives": [{"attributes": {"POSITION": 0, "COLOR_0": 1}, "indices": 2, "material": 0}]}],
    "materials": [{"name": "terrain", "pbrMetallicRoughness": {"baseColorFactor": [0.3, 0.38, 0.22, 1], "metallicFactor": 0, "roughnessFactor": 1}}],
    "accessors": [
        {"bufferView": 0, "componentType": 5126, "count": len(pos), "type": "VEC3",
         "min": pos.min(0).tolist(), "max": pos.max(0).tolist()},
        {"bufferView": 1, "componentType": 5126, "count": len(col), "type": "VEC3"},
        {"bufferView": 2, "componentType": 5123 if idx.dtype == np.uint16 else 5125, "count": len(idx), "type": "SCALAR"},
    ],
    "bufferViews": views,
    "buffers": [{"byteLength": sum(len(x) for x in blobs)}],
}
js = json.dumps(gltf, separators=(",", ":")).encode()
js += b" " * ((-len(js)) % 4)
binary = b"".join(blobs)
glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary))
glb += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(binary), 0x004E4942) + binary
(root / "public/gratitude/valley.glb").write_bytes(glb)

# --- Write site.ts: where things stand, and the ground's height near them --
# (Every 2, on the mesh's own vertices, and read across its own triangles:
# at 4, read bilinearly, it was off by up to half a person's height, and
# the people sat sunk into the ground.)
HX0, HX1, HZ0, HZ1, HS = 60.0, 640.0, -180.0, 140.0, 2.0
hx = np.arange(HX0, HX1 + 0.1, HS); hz = np.arange(HZ0, HZ1 + 0.1, HS)
HXX, HZZ = np.meshgrid(hx, hz, indexing="ij")
hgrid = np.round(height(HXX, HZZ) * 100).astype(np.int16)
bx = np.arange(100.0, 600.1, 10.0)
west, east = bed(bx)
f = lambda v: f"{v:.2f}".rstrip("0").rstrip(".")
site = f'''/* Generated by scripts/valley/bake.py from Sentinel-2 imagery and the
   Copernicus 30 m DEM; do not edit by hand. Scene units as 108.bt's: x south,
   z west, y up, about 18 m to a unit. */

/** Where each of the 108 stands, foot of the chorten: [x, y, z]. */
export const FEET: [number, number, number][] = [
{",".join(f"[{f(x)},{f(y)},{f(z)}]" for x, y, z in zip(row_x, row_y, row_z))}
];

/** The Mau Chhu's gravel bed: from x = {f(bx[0])}, every {f(bx[1] - bx[0])}, its west and east edge z. */
export const BED = {{
  x0: {f(bx[0])},
  step: {f(bx[1] - bx[0])},
  west: [{",".join(f(v) for v in west)}],
  east: [{",".join(f(v) for v in east)}],
}};

/** The ground's height over x {f(HX0)}..{f(HX1)}, z {f(HZ0)}..{f(HZ1)}, every {f(HS)}: Int16, y * 100, x-major. */
const HEIGHTS = {{ x0: {f(HX0)}, z0: {f(HZ0)}, step: {f(HS)}, nx: {len(hx)}, nz: {len(hz)}, data: "{base64.b64encode(hgrid.tobytes()).decode()}" }};

let heights: Int16Array | null = null;
/** The ground's height at (x, z), inside the area HEIGHTS covers. */
export function groundAt(x: number, z: number): number {{
  if (!heights) {{
    const raw = atob(HEIGHTS.data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    heights = new Int16Array(bytes.buffer);
  }}
  const {{ step, nx, nz }} = HEIGHTS;
  const u = Math.min(Math.max((x - HEIGHTS.x0) / step, 0), nx - 1.001);
  const v = Math.min(Math.max((z - HEIGHTS.z0) / step, 0), nz - 1.001);
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const h = (a: number, b: number) => heights![a * nz + b] / 100;
  // (Across the mesh's own triangles, split from (i, j + 1) to (i + 1, j).)
  if (fu + fv <= 1) return h(i, j) + (h(i + 1, j) - h(i, j)) * fu + (h(i, j + 1) - h(i, j)) * fv;
  return h(i + 1, j + 1) + (h(i, j + 1) - h(i + 1, j + 1)) * (1 - fu) + (h(i + 1, j) - h(i + 1, j + 1)) * (1 - fv);
}}

/** The bed's edge at x, by interpolation: "west" or "east". */
export function bedEdge(x: number, side: "west" | "east"): number {{
  const t = Math.min(Math.max((x - BED.x0) / BED.step, 0), BED.west.length - 1.001);
  const i = Math.floor(t), k = t - i, a = BED[side];
  return a[i] + (a[i + 1] - a[i]) * k;
}}

export const ATTRIBUTION =
  "Terrain: Copernicus DEM GLO-30, ESA. Textures: Poly Haven (CC0).";
'''
(root / "components/gratitude/valley/site.ts").write_text(site)
print(f"valley.glb {len(glb) // 1024} KB ({len(pos)} vertices); site.ts written")
