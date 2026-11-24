"""The Mao Chhu's course through the valley for /gratitude, shared by bake.py
(which cuts its gorge into the hills), bake_river.py (which draws its water
and gravel) and bake_plants.py (which keeps the trees off it).

Scene units, the page's axes: x south (downstream), z west. Three reaches:
the gorge, where it comes round from behind the hills on the east (-z) and
turns into the valley above the first of the 108; the bed, where it winds
within the gravel bed as bake.py traces it; and the plain below, where it
runs on down the valley's lowest line.
"""
import numpy as np

# The gravel bed, as bake.py traces it (x, its west and east edge z).
BED = np.array([
    [120, -2, -22], [140, 5, -15], [160, 3, -18], [180, 3, -30], [200, 5, -45], [220, 5, -50],
    [240, 3, -45], [260, 0, -40], [280, 5, -40], [300, 15, -45], [320, 25, -45], [340, 25, -45],
    [360, 25, -45], [380, 25, -45], [400, 25, -45], [420, 25, -55], [440, 22, -60], [460, 22, -60],
    [480, 22, -55], [500, 20, -45], [540, 20, -40], [580, 18, -40]], float)

# The gorge, upstream: the river comes round from behind the hills on the
# east (-z), seen from down the valley entering from the right, and turns
# into the valley well above the first of the 108 (x 130, z -37).
# (The Sentinel-2 image has its wide bed bending east between x 140 and 100;
# above that it is drawn for the view, the 30 m model too coarse to hold it.)
GORGE = np.array([
    [-130, -168], [-40, -166], [30, -164], [56, -160], [68, -148], [74, -128], [77, -106],
    [79, -84], [81, -62], [85, -46], [92, -32], [101, -23], [112, -17], [122, -14], [132, -12]], float)

# The plain, downstream: the lowest line of the land (from the DEM).
PLAIN = np.array([[600, -3], [620, 2], [640, 12], [660, 16], [680, 23], [700, 28], [720, 31],
                  [740, 37], [760, 44], [800, 48], [840, 57], [880, 62]], float)
X0, X1 = -130.0, 880.0
WIDEN = 1.2


def bed(x):
    return np.interp(x, BED[:, 0], BED[:, 1]), np.interp(x, BED[:, 0], BED[:, 2])


def smooth(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def course(x):
    """The river's centre line z and its half-width at x."""
    x = np.asarray(x, float)
    bw, be = bed(x)
    mid, half = (bw + be) / 2, (bw - be) / 2
    # In the bed: winding from side to side of it, leaving gravel bars on
    # the inside of its bends.
    swing = np.sin(x * 0.019 + 0.6) * 0.75 + np.sin(x * 0.047 + 2.0) * 0.25
    cz = mid + half * 0.4 * swing
    wid = half * (0.44 + 0.08 * np.sin(x * 0.031 + 1.1))
    # Into the gorge above, narrowing; out onto the plain below.
    up = 1 - smooth(124.0, 146.0, x)
    cz = cz * (1 - up) + np.interp(x, GORGE[:, 0], GORGE[:, 1]) * up
    wid = wid * (1 - up) + np.interp(x, [-130, 50, 90, 132], [3.0, 3.4, 4.6, 6.0]) * up
    down = smooth(560.0, 610.0, x)
    cz = cz * (1 - down) + np.interp(x, PLAIN[:, 0], PLAIN[:, 1]) * down
    wid = wid * (1 - down) + 14.0 * down
    # (A fifth wider all along than first drawn, both banks moving out and
    # the 108, laid back from the east one, with them: place_row.py.)
    return cz, wid * WIDEN, swing
