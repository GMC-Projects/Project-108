"""Step 1 of 2 (see README.md): fetch the valley's imagery and heights.

Sentinel-2 L2A true colour (10 m; 18 Jan 2025, its swath edge filled from
20 Jan) and the Copernicus GLO-30 DEM, both read from their public AWS
archives by range request and resampled onto one lat/lon grid. Writes
rgb.npy, dem.npy and grid.json to the folder given.

    python fetch.py <out-dir>        (needs numpy and rasterio)
"""
import sys, json, numpy as np, rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_bounds
out = sys.argv[1]
W, S_, E, N = 90.395, 26.805, 90.625, 27.085
NX, NY = 2400, 3000          # ~9.6 m x ~10.4 m per pixel
dst_t = from_bounds(W, S_, E, N, NX, NY)
base = "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/46/R/{t}/2025/1/{p}_46R{t}_{d}_0_L2A/TCI.tif"
rgb = np.zeros((3, NY, NX), np.uint8)
# 18 Jan 2025 (all but cloud-free), its swath edge filled from 20 Jan.
for p, d, tile in [("S2B", "20250118", "BQ"), ("S2B", "20250118", "BR"), ("S2A", "20250120", "BQ"), ("S2A", "20250120", "BR")]:
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", AWS_NO_SIGN_REQUEST="YES"):
        with rasterio.open(base.format(t=tile, p=p, d=d)) as src:
            for b in range(3):
                tmp = np.zeros((NY, NX), np.uint8)
                reproject(rasterio.band(src, b + 1), tmp, dst_transform=dst_t, dst_crs="EPSG:4326",
                          resampling=Resampling.bilinear, src_nodata=0, dst_nodata=0)
                rgb[b] = np.where(rgb[b] == 0, tmp, rgb[b])
    print("tile", tile, "done", (rgb[0] > 0).mean())
np.save(f"{out}/rgb.npy", rgb)
dem = np.full((NY, NX), np.nan, np.float32)
for lat in [26, 27]:
    name = f"Copernicus_DSM_COG_10_N{lat:02d}_00_E090_00_DEM"
    url = f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"):
        with rasterio.open(url) as src:
            tmp = np.full((NY, NX), np.nan, np.float32)
            reproject(rasterio.band(src, 1), tmp, dst_transform=dst_t, dst_crs="EPSG:4326",
                      resampling=Resampling.bilinear, dst_nodata=np.nan)
            dem = np.where(np.isnan(dem), tmp, dem)
    print("dem", lat, np.nanmin(dem), np.nanmax(dem))
np.save(f"{out}/dem.npy", dem)
json.dump(dict(bounds=[W, S_, E, N], nx=NX, ny=NY), open(f"{out}/grid.json", "w"))
