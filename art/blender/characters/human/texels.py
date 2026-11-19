"""The texel baker: rasterises the meshes' UV layout, finds for every texel its point on the rest
pose, the low-poly normal and the tangent frame the game will use, then asks the part's shader
(shaders.py) for colour, roughness, metalness and relief. The normal map holds the exact surface
normal of the part's distance field (the detail the decimation removed: folds, lids, lips, ears)
plus the shader's relief; occlusion comes from the fields too (marching a few steps along the
normal). Everything runs in numpy on the CPU: no Cycles, no GPU.

Tangent frame: the same as three.js derives per pixel when a file has no tangents (the cotangent
frame of the UV gradients, scaled by the larger), in Blender's UV orientation, which the glTF
exporter and the loader's normal-scale flip turn into the game's.
"""
import numpy as np
from PIL import Image


class Raster:
    def __init__(self, size):
        self.size = size
        self.tri = np.full((size, size), -1, np.int32)
        self.bary = np.zeros((size, size, 3), np.float32)


def rasterize(uv, size, raster=None, offset=0):
    """uv: (T, 3, 2) in 0..1 (Blender orientation, v up). Writes triangle ids (offset + t) and
    barycentric coordinates of texel centres; row 0 of the arrays is v = 1 (the image's top)."""
    r = raster or Raster(size)
    px = uv * size
    px[..., 1] = size - px[..., 1]
    lo = np.floor(px.min(axis=1)).astype(np.int64)
    hi = np.ceil(px.max(axis=1)).astype(np.int64)
    lo = np.clip(lo, 0, size - 1)
    hi = np.clip(hi, 0, size)
    for t in range(len(px)):
        x0, y0 = lo[t]
        x1, y1 = hi[t]
        if x1 <= x0 or y1 <= y0:
            continue
        xs = np.arange(x0, x1) + 0.5
        ys = np.arange(y0, y1) + 0.5
        X, Y = np.meshgrid(xs, ys)
        a, b, c = px[t]
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-12:
            continue
        w0 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / den
        w1 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / den
        w2 = 1 - w0 - w1
        eps = -0.02
        inside = (w0 >= eps) & (w1 >= eps) & (w2 >= eps)
        if not inside.any():
            continue
        iy, ix = np.nonzero(inside)
        gy, gx = iy + y0, ix + x0
        r.tri[gy, gx] = offset + t
        r.bary[gy, gx, 0] = w0[iy, ix]
        r.bary[gy, gx, 1] = w1[iy, ix]
        r.bary[gy, gx, 2] = w2[iy, ix]
    return r


def tangent_frames(pos, uv):
    """Per triangle (T, 3, 3) positions and (T, 3, 2) UVs: the gradients of u and v on the
    triangle's plane (world vectors), as the run-time's derivative frame uses them."""
    e1 = pos[:, 1] - pos[:, 0]
    e2 = pos[:, 2] - pos[:, 0]
    d1 = uv[:, 1] - uv[:, 0]
    d2 = uv[:, 2] - uv[:, 0]
    # Solve for grad u, grad v in the plane: [e1; e2] g = [du1; du2].
    n = np.cross(e1, e2)
    nn = np.sum(n * n, axis=1, keepdims=True) + 1e-20
    # Dual basis of (e1, e2) in their plane.
    b1 = np.cross(e2, n) / nn
    b2 = np.cross(n, e1) / nn
    gu = b1 * d1[:, 0:1] + b2 * d2[:, 0:1]
    gv = b1 * d1[:, 1:2] + b2 * d2[:, 1:2]
    return gu, gv


def encode_normals(target, N, gu, gv):
    """Tangent-space coefficients (a, b, c) of target in the frame (T, B, N), T and B the UV
    gradients projected off N and scaled by 1/max(|T|, |B|) (three.js perturbNormal2Arb)."""
    T = gu - N * np.sum(gu * N, axis=1, keepdims=True)
    B = gv - N * np.sum(gv * N, axis=1, keepdims=True)
    scale = 1.0 / np.sqrt(np.maximum(np.maximum(np.sum(T * T, 1), np.sum(B * B, 1)), 1e-20))
    T *= scale[:, None]
    B *= scale[:, None]
    c = np.sum(target * N, axis=1)
    rest = target - N * c[:, None]
    tt, tb, bb = np.sum(T * T, 1), np.sum(T * B, 1), np.sum(B * B, 1)
    rt, rb = np.sum(rest * T, 1), np.sum(rest * B, 1)
    det = tt * bb - tb * tb
    det = np.where(np.abs(det) < 1e-12, 1e-12, det)
    a = (rt * bb - rb * tb) / det
    b = (rb * tt - rt * tb) / det
    v = np.stack([a, b, np.maximum(c, 0.05)], axis=1)
    return v / np.linalg.norm(v, axis=1, keepdims=True)


def dilate(img, mask, steps=8):
    """Grows filled texels into empty ones (a margin against bleeding at island edges)."""
    img = img.copy()
    filled = mask.copy()
    for _ in range(steps):
        acc = np.zeros_like(img)
        cnt = np.zeros(filled.shape, np.float32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)):
            sh = np.roll(np.roll(filled, dy, 0), dx, 1)
            acc += np.roll(np.roll(img, dy, 0), dx, 1) * sh[..., None]
            cnt += sh
        grow = (~filled) & (cnt > 0)
        img[grow] = acc[grow] / cnt[grow][:, None]
        filled |= grow
    return img, filled


def srgb(linear):
    linear = np.clip(linear, 0.0, 1.0)
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(linear, 1 / 2.4) - 0.055)


def save(arr, path, size=None):
    im = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8))
    if size and size != im.width:
        im = im.resize((size, size), Image.LANCZOS)
    im.save(path)
    return path
