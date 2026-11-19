"""Hands as signed distance fields: palm, thenar and hypothenar pads, knuckles, four fingers of
three phalanges and the thumb, posed by joint angles (fingers are not bones in the rig, so each
pose is its own mesh): 'relaxed' (the hands_lod* nodes), 'grip' (hand_r_grip: round a pistol
grip, index along the trigger guard) and 'support' (hand_l_grip: wrapped round the shooting hand,
thumb forward). Built for the right hand in the hand's own frame and mirrored for the left.

Hand frame (right hand, from the anchor_hand_r convention): a along the hand (the forearm's
direction), t towards the thumb, n the palm's normal. Local coordinates (u, v, w) = along t, a,
-n (w is the back of the hand).
"""
import math

import numpy as np

from .sdf import Ellipsoid, Field, Plane, RoundCone, Sphere, Box, Fn

# (name, MCP position u, v, w (metres, 1.86 m man), lengths of three phalanges, base radius, spread deg)
FINGERS = (
    ('index', 0.0245, 0.096, 0.000, (0.043, 0.025, 0.020), 0.0099, 3.0),
    ('middle', 0.0068, 0.101, 0.001, (0.047, 0.029, 0.021), 0.0102, 0.0),
    ('ring', -0.0105, 0.097, 0.000, (0.045, 0.028, 0.020), 0.0096, -3.0),
    ('little', -0.0265, 0.088, -0.002, (0.035, 0.020, 0.018), 0.0086, -7.0),
)

POSES = {
    # flexion of MCP, PIP, DIP per finger (degrees), thumb (cmc_abduct, cmc_flex, mcp, ip)
    'relaxed': {'index': (18, 30, 14), 'middle': (22, 36, 16), 'ring': (26, 40, 18), 'little': (30, 44, 20),
                'thumb': (32, 18, 12, 12), 'grip': None},
    'grip': {'index': (34, 40, 16), 'middle': (78, 96, 48), 'ring': (80, 98, 48), 'little': (82, 98, 46),
             'thumb': (12, 52, 22, 14), 'grip': 0.0155},
    'support': {'index': (62, 70, 30), 'middle': (66, 74, 34), 'ring': (68, 76, 36), 'little': (70, 78, 38),
                'thumb': (8, 22, 10, 6), 'grip': 0.032},
}


def _rot(axis, deg):
    axis = np.asarray(axis, float)
    axis = axis / np.linalg.norm(axis)
    a = math.radians(deg)
    K = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    return np.eye(3) + math.sin(a) * K + (1 - math.cos(a)) * K @ K


class HandFrame:
    def __init__(self, wrist, a, t, scale):
        self.o = np.asarray(wrist, float)
        a = np.asarray(a, float) / np.linalg.norm(a)
        t = np.asarray(t, float) - a * np.dot(t, a)
        t /= np.linalg.norm(t)
        n = np.cross(t, a)                      # palm normal
        self.u, self.v, self.w = t, a, -n
        self.k = scale

    def p(self, u, v, w):
        return self.o + self.k * (u * self.u + v * self.v + w * self.w)

    def d(self, u, v, w):
        x = u * self.u + v * self.v + w * self.w
        return x / np.linalg.norm(x)

    def local(self, P):
        q = (np.asarray(P, float) - self.o) / self.k
        return np.stack([q @ self.u, q @ self.v, q @ self.w], axis=-1)


def frame_for(J, anchor_matrix, body):
    """The right hand's frame from the skeleton and the anchor_hand_r matrix (4x4, Blender)."""
    s = body['height'] / 1.86 * body.get('hand_size', 1.0) * (0.92 if body['sex'] == 'female' else 1.0)
    wrist = J['hand_r'][0]
    M = np.asarray(anchor_matrix)
    a = -M[:3, 2]
    t = M[:3, 1]
    return HandFrame(wrist, a, t, s)


def build(field, F, body, pose='relaxed'):
    """Adds the hand's primitives (right hand, frame F) to field; returns {'grip': (point, axis)}."""
    P = POSES[pose]
    fat = 1.0 + 0.4 * (body['weight'] - 0.4)
    lab = 'hand_r'
    # Palm: a rounded slab, a little cupped, thicker at the knuckles.
    field.add(Box(F.p(-0.001, 0.056, 0.001), F.k * np.array([0.034, 0.036, 0.0075]) * np.array([1, 1, fat]),
                  np.stack([F.u, F.v, F.w]), round=F.k * 0.0085).label(lab, 'palm'), F.k * 0.008)
    field.add(Ellipsoid(F.p(0.021, 0.034, -0.011), F.k * np.array([0.017, 0.027, 0.011]) * fat, np.stack([F.u, F.v, F.w])).label(lab, 'thenar'), F.k * 0.01)
    field.add(Ellipsoid(F.p(-0.025, 0.045, -0.008), F.k * np.array([0.011, 0.032, 0.0095]) * fat, np.stack([F.u, F.v, F.w])).label(lab, 'hypothenar'), F.k * 0.01)
    field.add(RoundCone(F.p(0, -0.012, 0.0), F.p(0, 0.022, 0.0), F.k * 0.024, F.k * 0.026, side=F.u, squash=(1.35, 0.8)).label(lab, 'wrist'), F.k * 0.012)
    grip = None
    for name, u, v, w, lengths, radius, spread in FINGERS:
        flex = P[name]
        base_dir = _rot(F.w, -spread) @ F.v if False else (_rot(F.w, spread) @ F.v)
        axis = np.cross(base_dir, F.w)      # flexion turns the finger towards the palm (-w)
        axis /= np.linalg.norm(axis)
        p = F.p(u, v, w)
        # Knuckle.
        field.add(Sphere(p + F.k * 0.004 * F.w, F.k * radius * 1.08).label(lab, 'knuckle'), F.k * 0.006)
        direction = base_dir
        r = radius
        angle = 0.0
        for seg, (length, bend) in enumerate(zip(lengths, flex)):
            angle += bend
            direction = _rot(axis, -angle) @ base_dir
            q = p + direction * length * F.k
            r_end = r * (0.93 if seg < 2 else 0.88)
            field.add(RoundCone(p, q, F.k * r, F.k * r_end, side=np.cross(direction, axis), squash=(1.0, 0.92)).label(lab, 'finger'), F.k * 0.0025)
            if seg < 2:
                # The joint's slight swelling.
                field.add(Sphere(q, F.k * r_end * 1.06).label(lab, 'finger_joint'), F.k * 0.002)
            p, r = q, r_end
    # Thumb: from the base of the palm, across towards the index finger.
    abduct, cmc, mcp, ip = P['thumb']
    t_base = F.p(0.026, 0.016, -0.006)
    d0 = F.d(0.62, 0.70, -0.30)
    d0 = _rot(F.v, -abduct * 0.5) @ d0
    t_axis = np.cross(d0, F.u * 0.4 - F.w)
    t_axis /= np.linalg.norm(t_axis)
    p = t_base
    r = 0.0125
    angle = 0.0
    for seg, (length, bend) in enumerate(zip((0.044, 0.032, 0.028), (cmc, mcp, ip))):
        angle += bend
        direction = _rot(t_axis, angle) @ d0
        q = p + direction * length * F.k
        r_end = (0.0112, 0.0102, 0.0088)[seg]
        field.add(RoundCone(p, q, F.k * r, F.k * r_end).label(lab, 'thumb'), F.k * (0.012 if seg == 0 else 0.0025))
        p, r = q, r_end
    if P['grip']:
        rg = P['grip']
        centre = F.p(0.0, 0.074, -0.0165 - rg)
        grip = (centre, F.u)
    return {'grip': grip}


def cut_plane(J, side, body):
    """Where the hand mesh meets the arm: a point and the normal pointing towards the hand."""
    wrist = J['hand_' + side][0]
    elbow = J['forearm_' + side][0]
    d = wrist - elbow
    d /= np.linalg.norm(d)
    return wrist - d * 0.045 * body['height'] / 1.86, d
