"""Surface nets: the zero surface of a Field (sdf.py) as a quad mesh, on a rectilinear grid whose
spacing can be finer in bands (the face, the hands) than elsewhere.

The field is only evaluated exactly near its surface: a coarse pass (1 cm) finds where the surface
can be, and the fine grid takes its exact values only there (the field is about 1-Lipschitz, so a
coarse value far from zero proves the fine points around it are on the same side). One vertex per
grid cell the surface crosses (the mean of the crossings on the cell's edges, then projected onto
the surface) and one quad per crossed grid edge: closed, manifold where the field is smooth.
"""
import numpy as np


def axis(lo, hi, base, fine=()):
    """Grid coordinates from lo to hi: base spacing, or the spacing of a fine band (a, b, step)
    where the coordinate falls inside one. Bands fade in over a few cells."""
    out = [float(lo)]
    x = float(lo)
    while x < hi:
        step = base
        for a, b, s in fine:
            if a - 3 * base <= x <= b + 3 * base:
                if a <= x <= b:
                    step = min(step, s)
                else:
                    gap = min(abs(x - a), abs(x - b)) / (3 * base)
                    step = min(step, s + (base - s) * gap)
        x += step
        out.append(x)
    return np.asarray(out, dtype=np.float32)


def _points(xs, ys, zs, flat):
    ny, nz = len(ys), len(zs)
    i = flat // (ny * nz)
    rest = flat % (ny * nz)
    j = rest // nz
    k = rest % nz
    return np.stack([xs[i], ys[j], zs[k]], axis=1)


def sample(field, xs, ys, zs, coarse=0.01, chunk=1500000):
    """The field on the grid (nx, ny, nz), exact near the surface."""
    lo = np.array([xs[0], ys[0], zs[0]], np.float32)
    hi = np.array([xs[-1], ys[-1], zs[-1]], np.float32)
    cx, cy, cz = (np.arange(lo[a] - coarse, hi[a] + 2 * coarse, coarse, dtype=np.float32) for a in range(3))
    grid = np.stack(np.meshgrid(cx, cy, cz, indexing='ij'), axis=-1).reshape(-1, 3)
    coarse_field = np.concatenate([field(grid[s:s + chunk]) for s in range(0, len(grid), chunk)])
    coarse_field = coarse_field.reshape(len(cx), len(cy), len(cz))
    ix = np.clip(np.round((xs - cx[0]) / coarse).astype(np.int64), 0, len(cx) - 1)
    iy = np.clip(np.round((ys - cy[0]) / coarse).astype(np.int64), 0, len(cy) - 1)
    iz = np.clip(np.round((zs - cz[0]) / coarse).astype(np.int64), 0, len(cz) - 1)
    F = coarse_field[np.ix_(ix, iy, iz)]
    margin = coarse * 0.9 + 0.006
    band = np.nonzero(np.abs(F.ravel()) < margin)[0]
    flat = F.reshape(-1)
    for s in range(0, len(band), chunk):
        part = band[s:s + chunk]
        flat[part] = field(_points(xs, ys, zs, part))
    return F


def extract(F, xs, ys, zs):
    """Surface nets on a sampled grid: (verts (V, 3) float32, quads (Q, 4) int64), outward facing."""
    nx, ny, nz = F.shape
    inside = F < 0
    cells = (nx - 1, ny - 1, nz - 1)
    coords = (xs, ys, zs)
    cid_all, pts_all, quads = [], [], []
    for a in range(3):
        b, c = (a + 1) % 3, (a + 2) % 3
        sl0 = [slice(None)] * 3
        sl1 = [slice(None)] * 3
        sl0[a] = slice(0, -1)
        sl1[a] = slice(1, None)
        cross = inside[tuple(sl0)] != inside[tuple(sl1)]
        e = np.nonzero(cross)
        if len(e[0]) == 0:
            continue
        idx = [np.asarray(v, dtype=np.int64) for v in e]
        f0 = F[tuple(sl0)][e]
        f1 = F[tuple(sl1)][e]
        t = f0 / np.where(np.abs(f0 - f1) < 1e-12, 1e-12, f0 - f1)
        p = np.empty((len(t), 3), np.float32)
        for k in range(3):
            if k == a:
                p[:, k] = coords[k][idx[k]] + t * (coords[k][idx[k] + 1] - coords[k][idx[k]])
            else:
                p[:, k] = coords[k][idx[k]]
        outward = inside[tuple(sl0)][e]  # inside at the low end: the normal points along +a
        ring = []
        for db, dc in ((-1, -1), (0, -1), (0, 0), (-1, 0)):
            ci = [idx[0].copy(), idx[1].copy(), idx[2].copy()]
            ci[b] += db
            ci[c] += dc
            valid = (ci[0] >= 0) & (ci[0] < cells[0]) & (ci[1] >= 0) & (ci[1] < cells[1]) & (ci[2] >= 0) & (ci[2] < cells[2])
            lin = (ci[0] * cells[1] + ci[1]) * cells[2] + ci[2]
            ring.append((lin, valid))
            cid_all.append(lin[valid])
            pts_all.append(p[valid])
        ok = ring[0][1] & ring[1][1] & ring[2][1] & ring[3][1]
        q = np.stack([r[0] for r in ring], axis=1)[ok]
        flip = ~outward[ok]
        q[flip] = q[flip][:, ::-1]
        quads.append(q)
    cid = np.concatenate(cid_all)
    pts = np.concatenate(pts_all)
    uniq, inv = np.unique(cid, return_inverse=True)
    count = np.bincount(inv).astype(np.float32)
    verts = np.stack([np.bincount(inv, weights=pts[:, k]) for k in range(3)], axis=1).astype(np.float32) / count[:, None]
    quads = np.concatenate(quads)
    quads = np.searchsorted(uniq, quads)
    return verts, quads


def mesh(field, xs, ys, zs, coarse=0.01, project=2):
    """Samples and extracts the field; vertices projected onto the exact surface."""
    F = sample(field, xs, ys, zs, coarse)
    verts, quads = extract(F, xs, ys, zs)
    del F
    if project and len(verts):
        verts = field.project(verts, project)
    return verts, quads
