"""Skin weights from the body's anatomy: every body primitive is labelled with its bone, so a point
belongs to the bones whose shapes it is nearest to, blended by how near (a soft minimum over the
distances, a few centimetres wide), then smoothed over the mesh. The torso's loft is shared by
hips, spine and chest by height. Garments use the same function at their own vertices, so they
move with the skin under them (no poke-through, no tearing at shoulders, elbows, hips, knees).
Hands and grips blend forearm to hand over the wrist; hair, eyes and the head's parts ride the head.
"""
import numpy as np

from .skeleton import BONE_NAMES

DEFORM = [b for b in BONE_NAMES if b != 'root']


def bone_distances(field, P, J, band=0.08):
    """(N, len(DEFORM)) distance from each point to the nearest primitive of each bone."""
    P = np.asarray(P, np.float32)
    D = np.full((len(P), len(DEFORM)), 9.0, np.float32)
    index = {b: i for i, b in enumerate(DEFORM)}
    spine_z, chest_z = J['spine'][0][2], J['chest'][0][2]
    for op, prim, k in field.steps:
        if op != 'add' or prim.bone is None:
            continue
        pad = band + k
        m = np.all((P >= prim.lo - pad) & (P <= prim.hi + pad), axis=1)
        if not m.any():
            continue
        idx = np.nonzero(m)[0]
        d = prim.dist(P[idx])
        if prim.tag == 'torso':
            z = P[idx, 2]
            for bone, lo, hi in (('hips', -9, spine_z + 0.01), ('spine', spine_z - 0.03, chest_z + 0.03), ('chest', chest_z - 0.01, 9)):
                pen = 0.45 * np.maximum(0, np.maximum(lo - z, z - hi))
                c = index[bone]
                D[idx, c] = np.minimum(D[idx, c], d + pen)
            continue
        c = index.get(prim.bone)
        if c is None:
            continue
        D[idx, c] = np.minimum(D[idx, c], d)
    return D


def soft_weights(D, tau=0.012):
    dmin = D.min(axis=1, keepdims=True)
    W = np.exp(-(D - dmin) / tau)
    return W / W.sum(axis=1, keepdims=True)


def smooth(W, faces, iterations=4, keep=None):
    """Averages weights over mesh neighbours. faces: list/array of index tuples."""
    edges = []
    for f in faces:
        n = len(f)
        for i in range(n):
            edges.append((f[i], f[(i + 1) % n]))
    e = np.asarray(edges, np.int64)
    if len(e) == 0:
        return W
    e = np.concatenate([e, e[:, ::-1]])
    for _ in range(iterations):
        acc = np.zeros_like(W)
        np.add.at(acc, e[:, 0], W[e[:, 1]])
        cnt = np.bincount(e[:, 0], minlength=len(W)).astype(np.float32)[:, None]
        avg = np.where(cnt > 0, acc / np.maximum(cnt, 1), W)
        new = 0.5 * W + 0.5 * avg
        if keep is not None:
            new[keep] = W[keep]
        W = new
    return W


def top4(W):
    """Keeps the four largest influences, normalised: (indices (N, 4), weights (N, 4))."""
    order = np.argsort(-W, axis=1)[:, :4]
    w = np.take_along_axis(W, order, axis=1)
    w = np.where(w < 0.01, 0.0, w)
    w /= np.maximum(w.sum(axis=1, keepdims=True), 1e-9)
    return order, w


def hand_weights(local_v, side):
    """Wrist blend for hand meshes: local_v is the coordinate along the hand (metres, 0 at the
    wrist joint)."""
    t = np.clip((local_v + 0.018) / 0.036, 0, 1)
    t = t * t * (3 - 2 * t)
    W = np.zeros((len(local_v), len(DEFORM)), np.float32)
    W[:, DEFORM.index('forearm_' + side)] = 1 - t
    W[:, DEFORM.index('hand_' + side)] = t
    return W


def rigid(n, bone):
    W = np.zeros((n, len(DEFORM)), np.float32)
    W[:, DEFORM.index(bone)] = 1.0
    return W


def assign(obj, W):
    """Writes vertex groups (one per deforming bone) from a weight matrix."""
    order, w = top4(W)
    groups = {b: obj.vertex_groups.new(name=b) for b in DEFORM}
    for vi in range(len(order)):
        for k in range(4):
            if w[vi, k] > 0:
                groups[DEFORM[order[vi, k]]].add([vi], float(w[vi, k]), 'REPLACE')
