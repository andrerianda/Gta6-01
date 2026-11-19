"""Procedural noise in numpy (vectorised over points in metres): value noise, fractal sums,
cellular (Worley) distances. Deterministic: the same point gives the same value on every machine.
"""
import numpy as np


def _hash(ix, iy, iz, seed=0):
    h = (ix.astype(np.uint32) * np.uint32(73856093)) ^ (iy.astype(np.uint32) * np.uint32(19349663)) ^ (iz.astype(np.uint32) * np.uint32(83492791))
    h ^= np.uint32(seed * 2654435761 & 0xffffffff)
    h = (h ^ (h >> np.uint32(13))) * np.uint32(1274126177)
    h ^= h >> np.uint32(16)
    return h


def _unit(h):
    return (h & np.uint32(0xffffff)).astype(np.float32) / np.float32(0xffffff)


def value(P, scale, seed=0):
    """Smooth value noise in 0..1 with features about 1/scale metres apart."""
    with np.errstate(over='ignore'):
        q = np.asarray(P, np.float64) * scale
        i = np.floor(q).astype(np.int64)
        f = (q - i).astype(np.float32)
        u = f * f * f * (f * (f * 6 - 15) + 10)
        out = np.zeros(len(q), np.float32)
        for dx in (0, 1):
            wx = u[:, 0] if dx else 1 - u[:, 0]
            for dy in (0, 1):
                wy = u[:, 1] if dy else 1 - u[:, 1]
                for dz in (0, 1):
                    wz = u[:, 2] if dz else 1 - u[:, 2]
                    out += wx * wy * wz * _unit(_hash(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed))
        return out


def fbm(P, scale, octaves=4, seed=0, gain=0.5):
    """Fractal value noise, 0..1 (mean about 0.5)."""
    total = np.zeros(len(P), np.float32)
    amp, norm, s = 1.0, 0.0, scale
    for o in range(octaves):
        total += amp * value(P, s, seed + o * 17)
        norm += amp
        amp *= gain
        s *= 2.03
    return total / norm


def cells(P, scale, seed=0):
    """Distance to the nearest feature point (cellular noise), in cells (0 .. about 1)."""
    with np.errstate(over='ignore'):
        q = np.asarray(P, np.float64) * scale
        i = np.floor(q).astype(np.int64)
        f = (q - i).astype(np.float32)
        best = np.full(len(q), 9.0, np.float32)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    h = _hash(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
                    fx = _unit(h) + dx
                    fy = _unit(h * np.uint32(48271)) + dy
                    fz = _unit(h * np.uint32(69621)) + dz
                    d = (fx - f[:, 0]) ** 2 + (fy - f[:, 1]) ** 2 + (fz - f[:, 2]) ** 2
                    best = np.minimum(best, d)
        return np.sqrt(best)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)
