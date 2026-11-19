"""Signed distance fields in numpy: the modelling language of the human pipeline.

A Field is an ordered list of (operation, primitive, blend) steps. Shapes are written in metres in
Blender axes (Z up, the person faces +Y, the person's right is +X). Every primitive knows its box,
so a field is only evaluated where a primitive can matter: a body of a hundred primitives is
evaluated on millions of points in seconds. Negative is inside.

Distances are exact for spheres, capsules and round cones and close (Lipschitz about 1) for the
scaled shapes, which is all the surface extraction (surfnets.py), the projection of mesh vertices
onto the surface and the texel baker (texels.py) need.
"""
import math

import numpy as np

BIG = np.float32(1e3)


def _v(x):
    return np.asarray(x, dtype=np.float32)


def normalize(v):
    v = np.asarray(v, dtype=np.float64)
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v


def frame_from(axis, side=(1.0, 0.0, 0.0)):
    """An orthonormal frame (3x3, rows u, v, w) with w along axis and u as close to side as it can be."""
    w = normalize(axis)
    s = np.asarray(side, dtype=np.float64)
    u = s - w * np.dot(s, w)
    if np.linalg.norm(u) < 1e-6:
        u = np.cross(w, (0.0, 1.0, 0.0) if abs(w[1]) < 0.9 else (1.0, 0.0, 0.0))
    u = normalize(u)
    v = np.cross(w, u)
    return np.stack([u, v, w]).astype(np.float32)


def rot_xyz(degrees):
    """A rotation matrix from XYZ Euler angles in degrees (applied X, then Y, then Z)."""
    ax, ay, az = (math.radians(a) for a in degrees)
    rx = np.array([[1, 0, 0], [0, math.cos(ax), -math.sin(ax)], [0, math.sin(ax), math.cos(ax)]])
    ry = np.array([[math.cos(ay), 0, math.sin(ay)], [0, 1, 0], [-math.sin(ay), 0, math.cos(ay)]])
    rz = np.array([[math.cos(az), -math.sin(az), 0], [math.sin(az), math.cos(az), 0], [0, 0, 1]])
    return (rz @ ry @ rx).astype(np.float32)


class Prim:
    """A primitive: dist(P) for points (N, 3); lo/hi its box; bone and tag label it."""
    lo = hi = None
    bone = None
    tag = ''

    def label(self, bone=None, tag=''):
        self.bone, self.tag = bone, tag
        return self

    def dist(self, P):
        raise NotImplementedError


class Sphere(Prim):
    def __init__(self, c, r):
        self.c, self.r = _v(c), float(r)
        self.lo, self.hi = self.c - self.r, self.c + self.r

    def dist(self, P):
        return np.linalg.norm(P - self.c, axis=1) - self.r


class Ellipsoid(Prim):
    """An ellipsoid of semi-axes radii along the rows of rot (default the world axes)."""
    def __init__(self, c, radii, rot=None):
        self.c, self.r = _v(c), _v(radii)
        self.R = _v(np.eye(3) if rot is None else rot)
        ext = np.abs(self.R.T) @ self.r
        self.lo, self.hi = self.c - ext, self.c + ext

    def dist(self, P):
        q = (P - self.c) @ self.R.T
        k0 = np.linalg.norm(q / self.r, axis=1)
        k1 = np.linalg.norm(q / (self.r * self.r), axis=1)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


class RoundCone(Prim):
    """A capsule from a (radius ra) to b (radius rb); squash scales the cross-section across
    (along side, and the other way), so limbs can be flatter than round."""
    def __init__(self, a, b, ra, rb, side=(1, 0, 0), squash=(1.0, 1.0)):
        self.a, self.b = _v(a), _v(b)
        self.ra, self.rb = float(ra), float(rb)
        self.F = frame_from(self.b - self.a, side)
        self.h = float(np.linalg.norm(self.b - self.a))
        self.sq = _v(squash)
        r = max(self.ra, self.rb) * float(max(squash))
        self.lo = np.minimum(self.a, self.b) - r
        self.hi = np.maximum(self.a, self.b) + r

    def dist(self, P):
        q = (P - self.a) @ self.F.T
        x = np.sqrt((q[:, 0] / self.sq[0]) ** 2 + (q[:, 1] / self.sq[1]) ** 2)
        y = q[:, 2]
        r1, r2, h = self.ra, self.rb, max(self.h, 1e-6)
        b = (r1 - r2) / h
        a = math.sqrt(max(1.0 - b * b, 1e-9))
        k = -b * x + a * y  # dot(q, (-b, a))
        d_side = x * a + y * b - r1
        d_lo = np.sqrt(x * x + y * y) - r1
        d_hi = np.sqrt(x * x + (y - h) ** 2) - r2
        d = np.where(k < 0.0, d_lo, np.where(k > a * h, d_hi, d_side))
        return d * float(min(self.sq))


class Box(Prim):
    """A box of half sizes half, rounded by round, in the frame rot (rows are its axes)."""
    def __init__(self, c, half, rot=None, round=0.0):
        self.c, self.half = _v(c), _v(half)
        self.R = _v(np.eye(3) if rot is None else rot)
        self.round = float(round)
        ext = np.abs(self.R.T) @ (self.half + self.round)
        self.lo, self.hi = self.c - ext, self.c + ext

    def dist(self, P):
        q = np.abs((P - self.c) @ self.R.T) - self.half
        out = np.linalg.norm(np.maximum(q, 0.0), axis=1)
        inside = np.minimum(np.max(q, axis=1), 0.0)
        return out + inside - self.round


class Torus(Prim):
    """A ring of major radii (rx, ry) around the frame's w axis, tube radius r; arc limits the ring
    to angles (degrees, from the frame's u axis towards v) inside (start, end)."""
    def __init__(self, c, rx, ry, r, rot=None, arc=None):
        self.c, self.rx, self.ry, self.r = _v(c), float(rx), float(ry), float(r)
        self.R = _v(np.eye(3) if rot is None else rot)
        self.arc = arc
        ext = np.abs(self.R.T) @ _v((rx + r, ry + r, r))
        self.lo, self.hi = self.c - ext, self.c + ext

    def dist(self, P):
        q = (P - self.c) @ self.R.T
        ang = np.arctan2(q[:, 1] / self.ry, q[:, 0] / self.rx)
        if self.arc is not None:
            a0, a1 = (math.radians(a) for a in self.arc)
            mid, half = (a0 + a1) / 2, (a1 - a0) / 2
            off = np.arctan2(np.sin(ang - mid), np.cos(ang - mid))
            ang = mid + np.clip(off, -half, half)
        rim = np.stack([np.cos(ang) * self.rx, np.sin(ang) * self.ry, np.zeros_like(ang)], axis=1)
        return np.linalg.norm(q - rim, axis=1) - self.r


class Loft(Prim):
    """A body lofted along Z through elliptical sections: rows (z, y_centre, half_width,
    half_depth, power). Between rows the section is interpolated with a smooth (Catmull-Rom like)
    curve; power 2 is an ellipse, more is boxier. x_centre is 0 unless offset is given."""
    def __init__(self, sections, offset_x=0.0):
        s = np.asarray(sorted(sections, key=lambda r: r[0]), dtype=np.float64)
        self.s = s
        self.x0 = float(offset_x)
        zlo, zhi = s[0, 0], s[-1, 0]
        w = s[:, 2].max()
        d = s[:, 3].max()
        y0, y1 = (s[:, 1] - s[:, 3]).min(), (s[:, 1] + s[:, 3]).max()
        self.lo = _v((self.x0 - w, y0, zlo - 0.02))
        self.hi = _v((self.x0 + w, y1, zhi + 0.02))
        self.zfine = np.linspace(zlo, zhi, 256)
        self.tab = np.stack([np.interp(self.zfine, s[:, 0], s[:, k]) for k in (1, 2, 3, 4)], axis=1)
        # Smooth the piecewise-linear table (a short box filter) so the surface has no kinks.
        kernel = np.ones(9) / 9.0
        for k in range(4):
            col = np.pad(self.tab[:, k], 4, mode='edge')
            self.tab[:, k] = np.convolve(col, kernel, mode='valid')

    def dist(self, P):
        z = P[:, 2]
        zc = np.clip(z, self.zfine[0], self.zfine[-1])
        t = (zc - self.zfine[0]) / (self.zfine[-1] - self.zfine[0]) * (len(self.zfine) - 1)
        i = np.clip(t.astype(np.int32), 0, len(self.zfine) - 2)
        f = (t - i)[:, None]
        row = self.tab[i] * (1 - f) + self.tab[i + 1] * f
        yc, a, b, pw = row[:, 0], row[:, 1], row[:, 2], row[:, 3]
        x = np.abs(P[:, 0] - self.x0) / a
        y = np.abs(P[:, 1] - yc) / b
        r = (x ** pw + y ** pw) ** (1.0 / pw)
        d2 = (r - 1.0) * np.minimum(a, b)
        # Cap the ends (flat).
        dz = np.maximum(self.zfine[0] - z, z - self.zfine[-1])
        return np.where(dz > 0, np.sqrt(np.maximum(d2, 0) ** 2 + dz ** 2), np.maximum(d2, dz)).astype(np.float32)


class Plane(Prim):
    """The half-space below a plane through c with outward normal n (inside: dot(p - c, n) < 0)."""
    def __init__(self, c, n, lo=None, hi=None):
        self.c, self.n = _v(c), _v(normalize(n))
        self.lo = _v(lo) if lo is not None else _v((-5, -5, -5))
        self.hi = _v(hi) if hi is not None else _v((5, 5, 5))

    def dist(self, P):
        return (P - self.c) @ self.n


class Fn(Prim):
    """Any function of the points, with a box (for shapes no class above covers)."""
    def __init__(self, fn, lo, hi):
        self.fn, self.lo, self.hi = fn, _v(lo), _v(hi)

    def dist(self, P):
        return self.fn(P).astype(np.float32)


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


class Field:
    """An ordered list of steps: ('add', prim, k) smooth union, ('cut', prim, k) smooth
    subtraction, ('keep', prim, k) smooth intersection, ('shell', None, t) hollow to thickness t,
    ('offset', None, d) grow by d, ('warp', fn, 0) displace by fn(P) (added to the distance)."""

    def __init__(self, name=''):
        self.name = name
        self.steps = []

    def add(self, prim, k=0.0):
        self.steps.append(('add', prim, float(k)))
        return prim

    def cut(self, prim, k=0.0):
        self.steps.append(('cut', prim, float(k)))
        return prim

    def keep(self, prim, k=0.0):
        self.steps.append(('keep', prim, float(k)))
        return prim

    def offset(self, d):
        self.steps.append(('offset', None, float(d)))

    def warp(self, fn, reach=0.01):
        self.steps.append(('warp', fn, float(reach)))

    def extend(self, other):
        self.steps.extend(other.steps)
        return self

    def box(self, pad=0.0):
        lo, hi = np.full(3, 1e9, np.float32), np.full(3, -1e9, np.float32)
        for op, prim, k in self.steps:
            if op == 'add':
                lo, hi = np.minimum(lo, prim.lo - k), np.maximum(hi, prim.hi + k)
        return lo - pad, hi + pad

    def __call__(self, P, band=0.03):
        """Distances at points P (N, 3). band: how far outside a primitive's box its exact value
        can matter (the blend radius is added); beyond it a primitive counts as far away."""
        P = np.asarray(P, dtype=np.float32)
        d = np.full(len(P), BIG, dtype=np.float32)
        for op, prim, k in self.steps:
            if op in ('offset',):
                d = d - k
                continue
            if op == 'warp':
                d = d + prim(P).astype(np.float32)
                continue
            pad = k + band
            m = np.all((P >= prim.lo - pad) & (P <= prim.hi + pad), axis=1)
            if op == 'keep':
                e = np.full(len(P), BIG, np.float32)
                if m.any():
                    e[m] = prim.dist(P[m])
                d = smax(d, e, k)
                continue
            if not m.any():
                continue
            idx = np.nonzero(m)[0]
            e = prim.dist(P[idx]).astype(np.float32)
            if op == 'add':
                d[idx] = smin(d[idx], e, k)
            elif op == 'cut':
                d[idx] = smax(d[idx], -e, k)
        return d

    def gradient(self, P, eps=4e-4):
        """The normalised gradient (the outward normal) at P by central differences."""
        P = np.asarray(P, dtype=np.float32)
        g = np.empty_like(P)
        for axis in range(3):
            o = np.zeros(3, np.float32)
            o[axis] = eps
            g[:, axis] = self(P + o) - self(P - o)
        n = np.linalg.norm(g, axis=1, keepdims=True)
        return g / np.maximum(n, 1e-12)

    def project(self, P, iterations=3):
        """Moves points onto the zero surface along the gradient."""
        P = np.asarray(P, dtype=np.float32).copy()
        for _ in range(iterations):
            d = self(P)
            n = self.gradient(P)
            P -= n * d[:, None]
        return P

    def labels(self, P, band=0.03):
        """For each point the primitive (its index in steps) whose surface is nearest among the
        added ones, and that distance: used to give vertices a bone and a tag."""
        P = np.asarray(P, dtype=np.float32)
        best = np.full(len(P), BIG, np.float32)
        which = np.full(len(P), -1, np.int32)
        for i, (op, prim, k) in enumerate(self.steps):
            if op != 'add':
                continue
            pad = k + band
            m = np.all((P >= prim.lo - pad) & (P <= prim.hi + pad), axis=1)
            if not m.any():
                continue
            idx = np.nonzero(m)[0]
            e = prim.dist(P[idx])
            better = e < best[idx]
            best[idx[better]] = e[better]
            which[idx[better]] = i
        return which, best
