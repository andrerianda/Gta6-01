"""The body as a signed distance field: one continuous skin from the soles to the crown (the head
and face come from head.py, the hands from hands.py), built on the skeleton's joints so every
person's proportions follow their parameters.

Body parameters (a character module's BODY dict; everything but height has a default):
  sex 'male' | 'female', height metres, age years,
  build 0..1 (muscle: 0.2 slight, 0.5 average, 0.8 athletic), weight 0..1 (fat: 0.2 lean,
  0.4 average, 0.7 heavy), skin '#rrggbb' (the paint_skin colour),
  shoulder_width, hip_width, leg_length, arm_length, neck (multipliers about 1),
  bust 0..1 (women), belly 0..1 (extra on top of weight), face {...} (head.py).
"""
import math

import numpy as np

from . import head as headmod
from .sdf import Ellipsoid, Field, Plane, RoundCone, Sphere, Loft, frame_from, normalize

DEFAULTS = {
    'sex': 'male', 'height': 1.78, 'age': 30, 'build': 0.5, 'weight': 0.4, 'skin': '#8d5a3b',
    'shoulder_width': 1.0, 'hip_width': 1.0, 'leg_length': 1.0, 'arm_length': 1.0, 'neck': 1.0,
    'bust': 0.5, 'belly': 0.0, 'face': {},
}


def params(body):
    p = dict(DEFAULTS)
    p.update(body or {})
    p['face'] = dict(body.get('face', {})) if body else {}
    return p


def arm_axes(J, side):
    """Unit vectors of an arm at rest: along the arm, forward (thumb side), palm normal."""
    ua, el = J['upper_arm_' + side][0], J['forearm_' + side][0]
    wr = J['hand_' + side][0]
    d = normalize(wr - el)
    fwd = normalize(np.array([0.0, 1.0, 0.0]) - d * d[1])
    palm = np.cross(fwd, d) if side == 'r' else np.cross(d, fwd)   # down and in: palms down
    return normalize(el - ua), d, fwd, normalize(palm)


def forearm_prims(J, side, b, m):
    """The forearm's primitives (shared with the hand field so wrist cuts match)."""
    s = b['height'] / 1.86
    el, wr = J['forearm_' + side][0], J['hand_' + side][0]
    _, d, fwd, palm = arm_axes(J, side)
    fat = 1.0 + 0.5 * (b['weight'] - 0.4)
    fem = 0.88 if b['sex'] == 'female' else 1.0
    prims = []
    prims.append((RoundCone(el, wr + d * 0.02 * s, 0.045 * s * m * fat * fem, 0.0275 * s * fem * (0.9 + 0.1 * fat), side=fwd, squash=(1.0, 0.74)), 0.0))
    bulge = el + d * 0.075 * s + palm * -0.004 * s
    prims.append((Ellipsoid(bulge, (0.040 * s * m * fat * fem, 0.034 * s * m * fat * fem, 0.085 * s), frame_from(d, fwd)), 0.03 * s))
    return prims


def build(field, J, b, quality=1.0):
    """Adds the whole body (with head, without hands beyond the wrists) to field."""
    s = b['height'] / 1.86
    female = b['sex'] == 'female'
    m = 0.82 + 0.36 * b['build'] * (0.8 if female else 1.0)       # muscle size
    fat = 1.0 + 0.55 * (b['weight'] - 0.4)                          # fat scale
    belly = max(0.0, b['weight'] - 0.45) * 0.09 * s + b['belly'] * 0.05 * s
    age = b['age']
    hz, nz = J['hips'][0][2], J['neck'][0][2]
    trunk = nz - hz

    def Z(f):
        return hz + f * trunk

    # --- torso: lofted sections (z, y centre, half width, half depth, power)
    wf = 0.86 if female else 1.0      # waist
    hf = 1.07 if female else 1.0      # hips
    cf = 0.90 if female else 1.0      # ribcage
    sh = b['shoulder_width'] * (0.97 + 0.06 * b['build'])
    rows = [
        (-0.17, -0.016, 0.115 * hf, 0.080, 2.0),
        (-0.09, -0.022, 0.168 * hf * fat ** 0.5, 0.115 * fat ** 0.5, 2.3),
        (0.03, -0.010, 0.160 * hf * fat ** 0.6, 0.108 * fat ** 0.7, 2.3),
        (0.19, 0.000, 0.146 * wf * fat ** 0.9, 0.100 * fat ** 0.8, 2.2),
        (0.37, 0.002, 0.150 * cf * fat ** 0.6, 0.106 * fat ** 0.5, 2.3),
        (0.55, 0.004, 0.160 * cf * sh, 0.116 * (1.0 + 0.1 * (m - 1)), 2.45),
        (0.70, -0.002, 0.166 * cf * sh, 0.113, 2.45),
        (0.83, -0.012, 0.150 * cf * sh, 0.094, 2.3),
        (0.94, -0.022, 0.095 * cf * sh, 0.072, 2.1),
        (1.00, -0.024, 0.060, 0.056, 2.0),
    ]
    b['_torso_rows'] = [(Z(f), y * s, a * s, d * s, p) for f, y, a, d, p in rows]
    field.add(Loft(b['_torso_rows']).label('spine', 'torso'))
    # Chest, back and belly volumes.
    for sx in (1, -1):
        side = 'r' if sx > 0 else 'l'
        pec = np.array([sx * 0.068 * s, 0.072 * s, Z(0.63)])
        if female:
            bust = 0.5 + b['bust']
            field.add(Ellipsoid(pec + np.array([sx * 0.012 * s, 0.018 * s * bust, -0.035 * s]),
                                np.array([0.062, 0.05 * bust, 0.058]) * s, frame_from((sx * 0.25, 1, -0.2), (1, 0, 0))).label('chest', 'bust'), 0.035 * s)
        else:
            field.add(Ellipsoid(pec, np.array([0.074 * m, 0.036 * m, 0.058]) * s, frame_from((0, 0.2, 1), (1, 0, 0))).label('chest', 'pec'), 0.03 * s)
        field.add(Ellipsoid((sx * 0.083 * s, -0.082 * s, Z(0.69)), np.array([0.066, 0.032, 0.088]) * s).label('chest', 'scapula'), 0.035 * s)
        field.add(Ellipsoid((sx * 0.118 * s, -0.035 * s, Z(0.52)), np.array([0.05 * m, 0.06, 0.12]) * s).label('spine', 'lat'), 0.045 * s)
        glute = np.array([sx * 0.070 * s * hf, -0.072 * s * fat ** 0.4, Z(-0.10)])
        field.add(Ellipsoid(glute, np.array([0.082 * hf, 0.068 * fat ** 0.5, 0.098]) * s).label('hips', 'glute'), 0.03 * s)
        # Trapezius slope: from the neck to the top of the shoulder.
        ua = J['upper_arm_' + side][0]
        field.add(RoundCone((sx * 0.03 * s, -0.035 * s, nz + 0.035 * s), (ua[0] * 0.80, -0.026 * s, ua[2] - 0.002 * s),
                            0.036 * s * (0.9 + 0.2 * m), 0.026 * s).label('shoulder_' + side, 'trapezius'), 0.035 * s)
        # Collarbone ridge.
        field.add(RoundCone((sx * 0.018 * s, 0.050 * s, nz - 0.03 * s), (ua[0] * 0.86, 0.004 * s, ua[2] + 0.004 * s),
                            0.0085 * s, 0.009 * s).label('shoulder_' + side, 'clavicle'), 0.018 * s)
    field.add(Ellipsoid((0, 0.062 * s + belly * 0.6, Z(0.24)), np.array([0.112 * fat ** 0.5, 0.045, 0.13]) * s + np.array([0, belly, 0])).label('spine', 'belly'), 0.04 * s)

    # --- neck: joins the head and the trapezius
    neck_r = 0.0585 * s * b['neck'] * (0.86 if female else 1.0) * (0.95 + 0.1 * m)
    hj = J['head'][0]
    field.add(RoundCone((0, -0.010 * s, nz - 0.05 * s), (0, hj[1] - 0.004 * s, hj[2] + 0.02 * s), neck_r * 1.04, neck_r * 0.86,
                        side=(1, 0, 0), squash=(1.0, 0.98)).label('neck', 'neck'), 0.028 * s)
    if not female:
        field.add(Ellipsoid((0, hj[1] + 0.05 * s, hj[2] - 0.075 * s), np.array([0.009, 0.007, 0.012]) * s).label('neck', 'larynx'), 0.012 * s)
    for sx in (1, -1):
        # Sternocleidomastoid: from behind the ear to the top of the breastbone.
        a = np.array([sx * 0.046 * s, hj[1] - 0.004 * s, hj[2] + 0.02 * s])
        c = np.array([sx * 0.012 * s, 0.045 * s, nz - 0.025 * s])
        field.add(RoundCone(a, c, 0.015 * s, 0.011 * s).label('neck', 'scm'), 0.02 * s)

    # --- head and face
    headmod.build(field, J, b)

    # --- arms
    for sx, side in ((1, 'r'), (-1, 'l')):
        ua, el = J['upper_arm_' + side][0], J['forearm_' + side][0]
        up_dir, d, fwd, palm = arm_axes(J, side)
        F = frame_from(up_dir, fwd)
        field.add(Ellipsoid(ua + up_dir * 0.028 * s + np.array([0, -0.002 * s, 0.014 * s]), np.array([0.060 * m, 0.058 * m, 0.088]) * s,
                            F).label('upper_arm_' + side, 'deltoid'), 0.04 * s)
        field.add(RoundCone(ua + up_dir * 0.03 * s, el, 0.055 * s * m * fat ** 0.6, 0.042 * s * fat ** 0.3, side=fwd, squash=(1.0, 0.93)).label('upper_arm_' + side, 'upper_arm'), 0.035 * s)
        L = np.linalg.norm(el - ua)
        field.add(Ellipsoid(ua + up_dir * 0.52 * L + fwd * 0.014 * s, np.array([0.034 * m, 0.03 * m, 0.085]) * s, frame_from(up_dir, fwd)).label('upper_arm_' + side, 'biceps'), 0.025 * s)
        field.add(Ellipsoid(ua + up_dir * 0.45 * L - fwd * 0.016 * s, np.array([0.036 * m, 0.032 * m, 0.10]) * s, frame_from(up_dir, fwd)).label('upper_arm_' + side, 'triceps'), 0.025 * s)
        field.add(Sphere(el - fwd * 0.016 * s + up_dir * 0.004 * s, 0.017 * s).label('forearm_' + side, 'elbow'), 0.015 * s)
        for prim, k in forearm_prims(J, side, b, m):
            field.add(prim.label('forearm_' + side, 'forearm'), k)
        # Armpit fill (front and back folds) so the arm grows out of the chest, not out of a ball.
        field.add(RoundCone(np.array([sx * 0.10 * s, 0.045 * s, Z(0.66)]), ua + up_dir * 0.10 * s + fwd * 0.012 * s, 0.03 * s * m, 0.026 * s).label('chest', 'pec_fold'), 0.035 * s)
        field.add(RoundCone(np.array([sx * 0.11 * s, -0.055 * s, Z(0.60)]), ua + up_dir * 0.10 * s - fwd * 0.018 * s, 0.032 * s * m, 0.026 * s).label('chest', 'lat_fold'), 0.035 * s)

    # --- legs
    for sx, side in ((1, 'r'), (-1, 'l')):
        th, kn, an, toe = (J[n + '_' + side][0] for n in ('thigh', 'shin', 'foot', 'toe'))
        th_dir = normalize(kn - th)
        fwd = np.array([0, 1.0, 0])
        thick = fat ** 0.7
        top = th + np.array([sx * 0.012 * s, 0, 0.04 * s])
        field.add(RoundCone(top, kn, 0.095 * s * m ** 0.5 * thick * (1.04 if female else 1.0), 0.054 * s, side=(1, 0, 0), squash=(1.0, 1.0)).label('thigh_' + side, 'thigh'), 0.06 * s)
        Lt = np.linalg.norm(kn - th)
        field.add(Ellipsoid(th + th_dir * 0.45 * Lt + np.array([sx * 0.008, 0.032, 0]) * s, np.array([0.05 * m, 0.045 * m, 0.17]) * s, frame_from(th_dir, (1, 0, 0))).label('thigh_' + side, 'quads'), 0.03 * s)
        field.add(Ellipsoid(th + th_dir * 0.80 * Lt + np.array([-sx * 0.035, 0.018, 0]) * s, np.array([0.032 * m, 0.03 * m, 0.065]) * s, frame_from(th_dir, (1, 0, 0))).label('thigh_' + side, 'vastus'), 0.025 * s)
        field.add(Ellipsoid(th + th_dir * 0.42 * Lt + np.array([0, -0.03, 0]) * s, np.array([0.05 * m, 0.045 * m, 0.17]) * s, frame_from(th_dir, (1, 0, 0))).label('thigh_' + side, 'hamstring'), 0.03 * s)
        field.add(Sphere(kn + np.array([0, 0.040 * s, 0.006 * s]), 0.024 * s).label('shin_' + side, 'patella'), 0.018 * s)
        field.add(RoundCone(kn, an + np.array([0, 0, 0.01 * s]), 0.050 * s, 0.031 * s, side=(1, 0, 0), squash=(1.0, 1.0)).label('shin_' + side, 'shin'), 0.03 * s)
        Ls = np.linalg.norm(kn - an)
        field.add(Ellipsoid(kn + np.array([-sx * 0.003, -0.028, -0.30 * Ls]) * np.array([1, s, 1]) + np.array([0, 0, 0]), np.array([0.050 * m, 0.050 * m, 0.115]) * s * thick ** 0.5).label('shin_' + side, 'calf'), 0.035 * s)
        for ox in (0.024, -0.02):
            field.add(Sphere(an + np.array([sx * ox * s, -0.004 * s, 0.004 * s]), 0.016 * s).label('foot_' + side, 'ankle'), 0.012 * s)
        # Foot: heel, arch, ball and toes, flat on the ground.
        heel = np.array([an[0], an[1] - 0.034 * s, 0.032 * s])
        field.add(Sphere(heel, 0.033 * s).label('foot_' + side, 'heel'), 0.02 * s)
        ball = np.array([toe[0] + sx * 0.004 * s, toe[1], 0.024 * s])
        field.add(RoundCone(heel + np.array([0, 0.02 * s, 0.01 * s]), ball, 0.034 * s, 0.026 * s, side=(1, 0, 0), squash=(1.45, 0.85)).label('foot_' + side, 'foot'), 0.03 * s)
        field.add(RoundCone(an + np.array([0, 0.01 * s, 0]), ball + np.array([0, -0.02 * s, 0.006 * s]), 0.03 * s, 0.022 * s).label('foot_' + side, 'instep'), 0.03 * s)
        tip = J['toe_' + side][1]
        field.add(RoundCone(ball + np.array([-sx * 0.004 * s, 0.01 * s, -0.004 * s]), np.array([tip[0] - sx * 0.012 * s, tip[1] - 0.008 * s, 0.013 * s]), 0.022 * s, 0.013 * s,
                            side=(1, 0, 0), squash=(1.8, 0.8)).label('toe_' + side, 'toes'), 0.012 * s)
    field.keep(Plane((0, 0, 0.0005), (0, 0, -1)), 0.004)
    return field
