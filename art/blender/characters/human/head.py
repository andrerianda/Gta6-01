"""The head and face as signed-distance primitives: skull, brow ridge, eye sockets with lids round
separate eyeballs, cheekbones, nose with alae and nostrils, lips, jaw and chin, ears.

Shapes are written for a reference head 0.235 m from crown to chin, in head space: origin between
the ear canals, +Y forward, +Z up, then scaled to the person's head. Face parameters (BODY['face'],
all optional, 1.0 or 0.0 is the average adult):
  head_width, head_length, face_length, jaw_width, jaw_angle (0 soft .. 1 square), chin (forward
  offset in cm), chin_width, cheekbones, cheeks (soft tissue), brow (ridge), eye_spacing, eye_size,
  eye_tilt (degrees, + lateral corner up), eye_depth, lid (upper-lid cover 0..1),
  nose_length, nose_width, nose_bridge (height), nose_tip (size), nose_up (tip lift, cm),
  lip_upper, lip_lower, mouth_width, ear_size, ear_out (degrees from the head).
The landmarks (world positions the texture shaders and the hair use) are stored on the body dict
as b['_head'].
"""
import math

import numpy as np

from .sdf import Ellipsoid, Fn, RoundCone, Sphere, Torus, frame_from, rot_xyz

FACE_DEFAULTS = {
    'head_width': 1.0, 'head_length': 1.0, 'face_length': 1.0, 'jaw_width': 1.0, 'jaw_angle': 0.5, 'chin': 0.0,
    'chin_width': 1.0, 'cheekbones': 1.0, 'cheeks': 1.0, 'brow': 1.0, 'eye_spacing': 1.0, 'eye_size': 1.0,
    'eye_tilt': 3.0, 'eye_depth': 1.0, 'lid': 0.5, 'nose_length': 1.0, 'nose_width': 1.0, 'nose_bridge': 1.0,
    'nose_tip': 1.0, 'nose_up': 0.0, 'lip_upper': 1.0, 'lip_lower': 1.0, 'mouth_width': 1.0, 'ear_size': 1.0,
    'ear_out': 16.0,
}

EYE_RADIUS = 0.0122


class HeadSpace:
    """Head space to world: world = origin + scale * local (the head is upright, facing +Y)."""
    def __init__(self, origin, scale):
        self.o = np.asarray(origin, np.float64)
        self.k = float(scale)

    def p(self, x, y, z):
        return self.o + self.k * np.array([x, y, z], np.float64)

    def r(self, *radii):
        return self.k * np.array(radii, np.float64)

    def l(self, v):
        return self.k * v


def face_params(b):
    f = dict(FACE_DEFAULTS)
    f.update(b.get('face', {}))
    if b['sex'] == 'female':
        for key, value in (('jaw_width', 0.92), ('brow', 0.55), ('chin_width', 0.9), ('nose_length', 0.94), ('head_width', 0.97)):
            f[key] = f[key] * value if key not in b.get('face', {}) else f[key]
    return f


def _eye_opening(f, sx):
    """The lid lines (radians of elevation) as functions of the horizontal angle (+ lateral)."""
    tilt = math.radians(f['eye_tilt'])
    med, lat = math.radians(-60.0), math.radians(66.0)
    up_h, lo_h = math.radians(23.5) * (1.0 - 0.18 * (f['lid'] - 0.5)), math.radians(18.0)

    def lines(theta):
        t = np.clip((theta - med) / (lat - med), 0.0, 1.0)          # 0 medial .. 1 lateral corner
        centre = math.radians(-1.0) + tilt * (t - 0.4)
        bump_u = np.clip(np.sin(np.pi * t ** 0.85), 0.0, 1.0) ** 0.75
        bump_l = np.clip(np.sin(np.pi * t ** 1.1), 0.0, 1.0) ** 0.9
        outside = (theta < med) | (theta > lat)
        upper = np.where(outside, centre, centre + up_h * bump_u)
        lower = np.where(outside, centre, centre - lo_h * bump_l)
        return upper, lower
    return lines


def _eye_cut(E, R, lines, sx):
    """Distance to the opening wedge in front of an eyeball (negative inside the opening)."""
    def fn(P):
        q = P - E
        x = q[:, 0] * sx
        y, z = q[:, 1], q[:, 2]
        rr = np.sqrt(x * x + y * y + z * z) + 1e-9
        theta = np.arctan2(x, y)
        phi = np.arctan2(z, np.sqrt(x * x + y * y))
        upper, lower = lines(theta)
        inside_v = np.maximum(phi - upper, lower - phi) * rr          # vertical: < 0 between the lids
        front = R * 0.55 - rr                                         # only in front of the eyeball core
        behind = -y - R * 0.2                                         # and not behind the eye
        return np.maximum(np.maximum(inside_v, front), behind)
    return fn


def _lid(E, R, lines, sx, upper):
    """A lid: a shell hugging the eyeball beyond the lid line, rounded at its margin."""
    rs, half = R + 0.0024, 0.0015

    def fn(P):
        q = P - E
        x = q[:, 0] * sx
        y, z = q[:, 1], q[:, 2]
        rr = np.sqrt(x * x + y * y + z * z) + 1e-9
        theta = np.arctan2(x, y)
        phi = np.arctan2(z, np.sqrt(x * x + y * y))
        up, lo = lines(theta)
        shell = np.abs(rr - rs) - half
        region = (up - phi) * rr if upper else (phi - lo) * rr      # < 0 where the lid covers
        front = -y + R * 0.1                                          # the lid only wraps the front
        d = np.maximum(shell, region)
        k = 0.0012
        h = np.clip(0.5 - 0.5 * (d - front) / k, 0, 1)                # smooth max(d, front)
        return d * (1 - h) + front * h + k * h * (1 - h)
    return fn


def build(field, J, b):
    f = face_params(b)
    H = b['height']
    female = b['sex'] == 'female'
    hh = 0.1305 * H * f['face_length'] ** 0.4 * (0.985 if female else 1.0)   # crown to chin
    k = hh / 0.235
    crown = J['crown'][0]
    origin = np.array([0.0, J['head'][0][1] + 0.004 * k, crown[2] - 0.125 * k])
    S = HeadSpace(origin, k)
    hw, hl, fl = f['head_width'], f['head_length'], f['face_length']
    jw, cw = f['jaw_width'], f['chin_width']
    es = f['eye_spacing']
    nw, nl = f['nose_width'], f['nose_length']
    mw = f['mouth_width']
    a = 'head'

    # Skull and forehead.
    field.add(Ellipsoid(S.p(0, -0.008, 0.040), S.r(0.0765 * hw, 0.100 * hl, 0.089)).label(a, 'skull'), S.l(0.01))
    field.add(Ellipsoid(S.p(0, 0.046, 0.046), S.r(0.064 * hw, 0.050, 0.064)).label(a, 'forehead'), S.l(0.02))
    field.add(Ellipsoid(S.p(0, -0.035, -0.02), S.r(0.062 * hw, 0.07, 0.06)).label(a, 'occiput'), S.l(0.02))
    # The face as one smooth volume first (the features sit on it, not on the skull).
    field.add(Ellipsoid(S.p(0, 0.030, -0.028 * fl), S.r(0.060 * hw, 0.058, 0.064 * fl)).label(a, 'face_mass'), S.l(0.025))
    # Brow ridge and the arcs under the eyebrows.
    br = f['brow']
    field.add(RoundCone(S.p(-0.030 * es, 0.0885, 0.023), S.p(0.030 * es, 0.0885, 0.023), S.l(0.0085 * (0.7 + 0.3 * br)), S.l(0.0085 * (0.7 + 0.3 * br))).label(a, 'brow'), S.l(0.012))
    for sx in (1, -1):
        field.add(RoundCone(S.p(sx * 0.012 * es, 0.090, 0.027), S.p(sx * 0.052 * es, 0.073, 0.025), S.l(0.0062 + 0.0018 * br), S.l(0.0052)).label(a, 'brow_arc'), S.l(0.012))
    # Cheekbones, cheeks, upper jaw.
    cb = f['cheekbones']
    for sx in (1, -1):
        field.add(Ellipsoid(S.p(sx * 0.045 * es ** 0.5 * hw, 0.063, -0.012), S.r(0.016 * cb, 0.022, 0.012 * cb), rot_xyz((0, 0, sx * -22))).label(a, 'cheekbone'), S.l(0.02))
        field.add(Ellipsoid(S.p(sx * 0.037 * jw ** 0.5, 0.056, -0.038), S.r(0.019, 0.023, 0.022) * f['cheeks']).label(a, 'cheek'), S.l(0.018))
    field.add(Ellipsoid(S.p(0, 0.064, -0.047 * fl), S.r(0.037 * mw ** 0.5, 0.032, 0.035)).label(a, 'muzzle'), S.l(0.018))
    # Jaw: ramus, body of the mandible, chin, the soft floor of the mouth.
    ja = f['jaw_angle']
    for sx in (1, -1):
        gonion = S.p(sx * 0.048 * jw, -0.004, -0.068 * fl)
        chin_side = S.p(sx * 0.015 * cw, 0.075, -0.103 * fl)
        field.add(RoundCone(S.p(sx * 0.050 * jw, -0.010, -0.018), gonion, S.l(0.009), S.l(0.008 + 0.003 * ja)).label(a, 'ramus'), S.l(0.016))
        field.add(RoundCone(gonion, chin_side, S.l(0.008 + 0.003 * ja), S.l(0.010)).label(a, 'jawline'), S.l(0.016 - 0.005 * ja))
    field.add(Ellipsoid(S.p(0, 0.030, -0.066 * fl), S.r(0.042 * jw, 0.040, 0.030)).label(a, 'jaw_fill'), S.l(0.018))
    chin_y = 0.079 + f['chin'] * 0.01
    field.add(Ellipsoid(S.p(0, chin_y, -0.099 * fl), S.r(0.0175 * cw, 0.0125, 0.0165)).label(a, 'chin'), S.l(0.012))
    field.add(Ellipsoid(S.p(0, 0.036, -0.090 * fl), S.r(0.030 * jw, 0.036, 0.012)).label(a, 'under_chin'), S.l(0.02))

    # Nose.
    nb, nt = f['nose_bridge'], f['nose_tip']
    up = f['nose_up'] * 0.01
    nasion = S.p(0, 0.0905, 0.011)
    tip = S.p(0, 0.0905 + 0.0215 * nb ** 0.5 * nl ** 0.3, 0.011 - 0.041 * nl + up)
    field.add(RoundCone(nasion, tip + S.r(0, -0.004, 0.006), S.l(0.0058 * nb ** 0.3), S.l(0.0072 * nt), side=(1, 0, 0), squash=(1.15, 1.0)).label(a, 'nose_bridge'), S.l(0.006))
    field.add(RoundCone(S.p(0, 0.085, 0.0), S.p(0, 0.094, -0.031 * nl), S.l(0.0105), S.l(0.0135 * nw ** 0.5), side=(1, 0, 0), squash=(1.25, 0.7)).label(a, 'nose_side'), S.l(0.01))
    field.add(Ellipsoid(tip, S.r(0.0098 * nt * nw ** 0.4, 0.0088 * nt, 0.0088 * nt)).label(a, 'nose_tip'), S.l(0.006))
    alar_z = 0.011 - 0.046 * nl + up * 0.5
    for sx in (1, -1):
        field.add(Ellipsoid(S.p(sx * 0.0142 * nw, 0.0975, alar_z), S.r(0.0078 * nw ** 0.6, 0.0092, 0.0072), rot_xyz((0, 0, sx * 25))).label(a, 'ala'), S.l(0.004))
    # Columella between the nostrils.
    field.add(RoundCone(tip + S.r(0, -0.002, -0.006), S.p(0, 0.094, alar_z - 0.002), S.l(0.0032), S.l(0.0035)).label(a, 'columella'), S.l(0.003))
    for sx in (1, -1):
        field.cut(Ellipsoid(S.p(sx * 0.0072 * nw, 0.1015 + 0.002 * nb, alar_z - 0.0038), S.r(0.0042 * nw ** 0.7, 0.0062, 0.0026), rot_xyz((12, 0, sx * -20))).label(a, 'nostril'), S.l(0.0015))

    # Lips and the mouth.
    lu, ll = f['lip_upper'], f['lip_lower']
    mouth_z = -0.0597 * fl + up * 0.2
    field.add(Ellipsoid(S.p(0, 0.0905, mouth_z + 0.0052 * lu), S.r(0.0245 * mw, 0.0082 * lu ** 0.7, 0.0062 * lu), rot_xyz((-8, 0, 0))).label(a, 'lip_upper'), S.l(0.0045))
    field.add(Ellipsoid(S.p(0, 0.0875, mouth_z - 0.0062 * ll), S.r(0.0215 * mw, 0.0088 * ll ** 0.7, 0.0072 * ll), rot_xyz((10, 0, 0))).label(a, 'lip_lower'), S.l(0.0045))
    for sx in (1, -1):
        field.add(RoundCone(S.p(sx * 0.0042, 0.0895, mouth_z + 0.0105), S.p(sx * 0.0048, 0.0925, alar_z - 0.002), S.l(0.0018), S.l(0.0016)).label(a, 'philtrum'), S.l(0.0035))
    field.cut(Ellipsoid(S.p(0, 0.0985, mouth_z), S.r(0.0262 * mw, 0.0125, 0.0010), rot_xyz((0, 0, 0))).label(a, 'mouth'), S.l(0.0012))
    for sx in (1, -1):
        field.cut(Sphere(S.p(sx * 0.0262 * mw, 0.0828, mouth_z), S.l(0.0024)).label(a, 'mouth_corner'), S.l(0.003))
    field.cut(RoundCone(S.p(-0.012, 0.0905, mouth_z - 0.0178 * ll), S.p(0.012, 0.0905, mouth_z - 0.0178 * ll), S.l(0.0032), S.l(0.0032)).label(a, 'sulcus'), S.l(0.006))

    # Ears.
    ear_k = f['ear_size']
    eo = math.radians(f['ear_out'])
    for sx in (1, -1):
        base = S.p(sx * 0.0715 * hw, -0.010, 0.003)
        # The ear's plane: hinged at its front edge, its back edge out by ear_out; long axis leaning back.
        u0 = np.array([-sx * math.sin(eo), math.cos(eo), 0.0])
        w = np.array([sx * math.cos(eo), math.sin(eo), 0.0])
        lean = math.radians(15)
        z = np.array([0.0, 0.0, 1.0])
        u = math.cos(lean) * u0 + math.sin(lean) * z
        v = math.cos(lean) * z - math.sin(lean) * u0
        rot = np.stack([u, v, w]).astype(np.float32)
        c = base + S.l(0.007) * w - S.l(0.009) * u + S.l(0.006) * v
        field.add(Ellipsoid(c, S.r(0.0165 * ear_k, 0.0295 * ear_k, 0.0042), rot).label(a, 'ear'), S.l(0.004))
        rim_c = c + S.l(0.0032) * w
        field.add(Torus(rim_c, S.l(0.0158 * ear_k), S.l(0.0275 * ear_k), S.l(0.0031), rot, arc=(25, 255)).label(a, 'helix'), S.l(0.002))
        field.add(Torus(rim_c - S.l(0.0012) * w + S.l(0.002) * u, S.l(0.0085 * ear_k), S.l(0.0165 * ear_k), S.l(0.0023), rot, arc=(60, 235)).label(a, 'antihelix'), S.l(0.002))
        field.cut(Ellipsoid(c + S.l(0.0062) * w + S.l(0.004) * u - S.l(0.004) * v, S.r(0.0072 * ear_k, 0.0098 * ear_k, 0.0046), rot).label(a, 'concha'), S.l(0.002))
        field.add(Ellipsoid(c - S.l(0.0235 * ear_k) * v + S.l(0.002) * u + S.l(0.0012) * w, S.r(0.0082 * ear_k, 0.0085 * ear_k, 0.0038), rot).label(a, 'lobe'), S.l(0.003))
        field.add(Sphere(c + S.l(0.0125) * u + S.l(0.0045) * w - S.l(0.005) * v, S.l(0.0040)).label(a, 'tragus'), S.l(0.003))

    # Eyes: sockets, the opening in front of each eyeball and the lids round it.
    R = EYE_RADIUS * k * f['eye_size'] ** 0.3
    eyes = []
    for sx in (1, -1):
        E = S.p(sx * 0.0318 * es, 0.0738 - 0.004 * (f['eye_depth'] - 1), 0.009)
        eyes.append(E)
        lines = _eye_opening(f, sx)
        field.cut(Ellipsoid(E + S.r(0, 0.014, 0.005), S.r(0.017, 0.007, 0.012), rot_xyz((0, 0, sx * -8))).label(a, 'socket'), S.l(0.008))
        field.add(Ellipsoid(E + S.r(sx * 0.002, 0.005, -0.013), S.r(0.017, 0.011, 0.007)).label(a, 'under_eye'), S.l(0.008))
        field.cut(Sphere(E, R + 0.0009).label(a, 'eye_pocket'), 0.0)
        cut_fn = _eye_cut(E, R, lines, sx)
        field.cut(Fn(cut_fn, E - 0.03, E + 0.03).label(a, 'eye_opening'), S.l(0.0012))
        field.add(Fn(_lid(E, R, lines, sx, True), E - 0.025, E + 0.025).label(a, 'lid_upper'), S.l(0.0016))
        field.add(Fn(_lid(E, R, lines, sx, False), E - 0.025, E + 0.025).label(a, 'lid_lower'), S.l(0.0016))
        field.cut(Sphere(E, R + 0.0006).label(a, 'eye_pocket'), 0.0)

    b['_head'] = {
        'origin': origin, 'scale': k, 'crown': crown, 'eyes': eyes, 'eye_radius': R,
        'nose_tip': tip, 'nasion': nasion, 'mouth': S.p(0, 0.093, mouth_z), 'mouth_width': S.l(0.0262 * mw),
        'chin': S.p(0, chin_y + 0.01, -0.104 * fl), 'brow_z': S.p(0, 0, 0.026)[2], 'ears': [S.p(sx * 0.075 * hw, -0.010, 0.003) for sx in (1, -1)],
        'jaw': [S.p(sx * 0.052 * jw, -0.006, -0.070 * fl) for sx in (1, -1)], 'alar_z': S.p(0, 0, alar_z)[2],
        'lip_upper': S.p(0, 0.098, mouth_z + 0.005), 'lip_lower': S.p(0, 0.096, mouth_z - 0.0062 * ll), 'hh': hh,
        'S': S, 'lines': _eye_opening(f, 1),
    }
    return S
