"""The human figure: proportions, joints and the anatomical forms of body, hands and head.

Figure(height, sex, build, ...) works out where every joint of the shared skeleton sits for
that person and blocks the body in as overlapping forms: a lofted trunk (pelvis, waist, ribcage,
shoulders), tapered limbs with their muscles as separate ellipsoids, kneecaps, ankles and elbows,
a hand with a palm, a thumb and four curled fingers, and a head lofted from skull slices with
nose, lips, chin, brow, cheekbones and ears added on top. skin() fuses them, relaxes them and
sculpts what forms cannot give: eye sockets and lids, the line of the mouth, nostrils, the
hollow of the ear.

All sizes are metres for a reference adult (a 1.80 m man, a 1.66 m woman) and scale with the
person's height; girths also follow the build. Blender axes: Z up, facing +Y, right side +X.
The rest pose is an A-pose: arms straight, 40 degrees below horizontal, palms down and a little
forward; legs straight, feet hip-width apart and pointing forward.
"""
import math

import numpy as np

import _forms as F

ARM_DROP = math.radians(40.0)        # the arms hang this far below horizontal in the rest pose
PALM_TURN = math.radians(18.0)       # the palms turn this far forward from facing straight down

BUILDS = {
    #            trunk width, trunk depth, waist, limbs, belly, muscle, face fat
    'slim':     dict(width=0.94, depth=0.90, waist=0.93, limb=0.88, belly=0.0, muscle=0.25, fat=0.0),
    'average':  dict(width=1.00, depth=1.00, waist=1.00, limb=1.00, belly=0.2, muscle=0.45, fat=0.2),
    'athletic': dict(width=1.04, depth=1.02, waist=0.96, limb=1.08, belly=0.0, muscle=1.0, fat=0.0),
    'heavy':    dict(width=1.12, depth=1.22, waist=1.26, limb=1.16, belly=1.0, muscle=0.35, fat=1.0),
}

# Reference skeletons: joint positions of the right side (x, y, z) and limb lengths.
REFERENCE = {
    'm': dict(
        height=1.80, head=0.235,
        hips=(0.0, 0.0, 0.985), spine=(0.0, -0.008, 1.105), chest=(0.0, -0.022, 1.265),
        neck=(0.0, -0.030, 1.512), head_joint=(0.0, -0.012, 1.632),
        shoulder=(0.030, -0.012, 1.478), upper_arm=(0.172, -0.030, 1.455),
        upper_arm_length=0.300, forearm_length=0.265, hand_length=0.095,
        thigh=(0.092, 0.0, 0.945), shin=(0.092, 0.008, 0.505), foot=(0.092, -0.012, 0.090),
        toe=(0.095, 0.128, 0.028), toe_tip=(0.097, 0.215, 0.022),
        # The trunk as slices: height, centre y, half width, depth to the front, depth to the back.
        trunk=((0.845, 0.000, 0.085, 0.070, 0.080), (0.885, -0.003, 0.150, 0.088, 0.105),
               (0.930, -0.005, 0.172, 0.098, 0.118), (0.980, -0.005, 0.170, 0.102, 0.115),
               (1.040, -0.004, 0.156, 0.104, 0.104), (1.100, -0.004, 0.146, 0.104, 0.096),
               (1.170, -0.006, 0.150, 0.106, 0.100), (1.250, -0.010, 0.162, 0.114, 0.108),
               (1.320, -0.014, 0.172, 0.120, 0.114), (1.390, -0.018, 0.176, 0.116, 0.114),
               (1.440, -0.022, 0.168, 0.100, 0.106), (1.480, -0.026, 0.135, 0.080, 0.094),
               (1.510, -0.028, 0.090, 0.062, 0.076), (1.535, -0.026, 0.062, 0.055, 0.062)),
        waist=1.10, chest_level=1.33, hip_level=0.93,
        neck_radius=0.056, arm=1.0, leg=1.0, hand=1.0, glute=(0.085, -0.088, 0.935, 0.082, 0.070, 0.090),
    ),
    'f': dict(
        height=1.66, head=0.219,
        hips=(0.0, 0.0, 0.905), spine=(0.0, -0.008, 1.015), chest=(0.0, -0.020, 1.160),
        neck=(0.0, -0.028, 1.388), head_joint=(0.0, -0.012, 1.502),
        shoulder=(0.026, -0.012, 1.357), upper_arm=(0.152, -0.028, 1.338),
        upper_arm_length=0.275, forearm_length=0.240, hand_length=0.086,
        thigh=(0.088, 0.0, 0.868), shin=(0.088, 0.008, 0.465), foot=(0.088, -0.012, 0.085),
        toe=(0.090, 0.118, 0.026), toe_tip=(0.092, 0.198, 0.020),
        trunk=((0.775, 0.000, 0.080, 0.065, 0.078), (0.815, -0.003, 0.150, 0.085, 0.104),
               (0.860, -0.005, 0.176, 0.094, 0.118), (0.905, -0.005, 0.172, 0.096, 0.112),
               (0.960, -0.004, 0.148, 0.094, 0.096), (1.025, -0.004, 0.122, 0.090, 0.084),
               (1.090, -0.008, 0.128, 0.094, 0.090), (1.150, -0.012, 0.140, 0.100, 0.098),
               (1.205, -0.016, 0.146, 0.104, 0.102), (1.265, -0.020, 0.150, 0.100, 0.102),
               (1.315, -0.024, 0.146, 0.088, 0.096), (1.350, -0.026, 0.115, 0.070, 0.084),
               (1.378, -0.027, 0.075, 0.055, 0.068), (1.400, -0.025, 0.052, 0.048, 0.054)),
        waist=1.025, chest_level=1.205, hip_level=0.86,
        neck_radius=0.049, arm=0.84, leg=0.97, hand=0.90, glute=(0.088, -0.090, 0.862, 0.090, 0.078, 0.095),
    ),
}

# The skull and face as slices from the chin (z = 0) to the crown, for a 0.235 m head: height,
# half width, front, back, and the squareness of the front and back halves of the outline.
HEAD_SLICES = (
    (0.004, 0.020, 0.064, 0.030, 2.0, 2.0), (0.014, 0.036, 0.076, 0.005, 1.9, 2.0),
    (0.028, 0.047, 0.078, -0.020, 1.9, 2.2), (0.042, 0.054, 0.080, -0.040, 2.0, 2.3),
    (0.056, 0.058, 0.082, -0.058, 2.0, 2.3), (0.072, 0.062, 0.081, -0.074, 2.0, 2.3),
    (0.090, 0.066, 0.079, -0.088, 2.1, 2.3), (0.106, 0.0695, 0.077, -0.098, 2.2, 2.3),
    (0.122, 0.0715, 0.076, -0.105, 2.3, 2.3), (0.138, 0.0735, 0.080, -0.109, 2.3, 2.3),
    (0.156, 0.0755, 0.082, -0.110, 2.3, 2.2), (0.176, 0.0765, 0.080, -0.107, 2.2, 2.2),
    (0.196, 0.073, 0.070, -0.098, 2.1, 2.1), (0.214, 0.062, 0.050, -0.080, 2.0, 2.0),
    (0.228, 0.040, 0.022, -0.050, 2.0, 2.0), (0.2345, 0.012, -0.008, -0.028, 2.0, 2.0),
)

FACE = dict(jaw=1.0, chin=1.0, cheek=1.0, brow=1.0, nose_length=1.0, nose_width=1.0,
            nose_bridge=1.0, lips=1.0, mouth_width=1.0, eye_size=1.0, eye_tilt=4.0,
            eye_spacing=1.0, ear=1.0, age=0.3)
FACE_BY_SEX = {'m': dict(), 'f': dict(jaw=0.9, chin=0.86, brow=0.45, nose_length=0.93,
                                      nose_width=0.9, lips=1.2, eye_size=1.06)}

EYE = (0.0302, 0.0525, 0.1185)       # eyeball centre in head space (right eye): 60 mm between pupils
EYE_RADIUS = 0.0122
LID_RADIUS = 0.0134
# The opening between the lids (half width, upper and lower lid above and below the centre): a
# real adult eye is about 28 mm wide and 9 mm open, and the inner corners lie one eye width apart,
# above the wings of the nose. The iris (11 mm) is cut by both lids, so little white shows.
EYE_HALF = 0.0140
EYE_UPPER = 0.0044
EYE_LOWER = -0.0032
IRIS_RADIUS = 0.0056


def nose_tip_z(face):
    """Height of the tip of the nose in head space (the nose ends about 4.5 cm below the pupils)."""
    return 0.1225 - 0.045 * face['nose_length']

FINGERS = (
    # name, offset across the palm, bone lengths, thickness, how much more it curls
    ('index', 0.0295, (0.046, 0.026, 0.023), 1.00, 0.85),
    ('middle', 0.0085, (0.050, 0.030, 0.024), 1.03, 0.95),
    ('ring', -0.0125, (0.046, 0.028, 0.023), 0.97, 1.05),
    ('pinky', -0.0320, (0.036, 0.021, 0.021), 0.84, 1.15),
)

ALL_PARTS = ('torso', 'neck', 'head', 'arms', 'hands', 'legs', 'feet')


def superellipse_ring(z, centre_y, half_width, front, back, n_front=2.4, n_back=2.3, count=40,
                      middle=0.45):
    """One horizontal slice of a trunk or a skull: an outline `half_width` wide that reaches
    `front` and `back` (absolute y), squarer the larger the exponents."""
    angles = np.arange(count) * (math.tau / count)
    cos, sin = np.cos(angles), np.sin(angles)
    mid = back + (front - back) * middle + centre_y * 0.0
    exponent = np.where(sin >= 0.0, 2.0 / n_front, 2.0 / n_back)
    x = half_width * np.sign(cos) * np.abs(cos) ** exponent
    reach = np.where(sin >= 0.0, front - mid, mid - back)
    y = mid + reach * np.sign(sin) * np.abs(sin) ** exponent
    return np.stack([x, y + centre_y, np.full(count, z)], axis=1)


class Figure:
    """One person's proportions. joints holds every joint of the shared skeleton (and a few
    landmarks) as numpy vectors; block() and skin() make the body."""

    def __init__(self, height=1.80, sex='m', build='average', face=None, bust=1.0, shoulders=1.0,
                 hips=1.0, legs=1.0, head=1.0, barefoot=False, **tweaks):
        self.sex = sex
        self.height = float(height)
        self.reference = dict(REFERENCE[sex])
        self.build = dict(BUILDS[build])
        self.build.update(tweaks)
        self.build_name = build
        self.scale = self.height / self.reference['height']
        self.girth = self.scale ** 0.85
        self.bust = bust
        self.shoulders = shoulders
        self.hip_factor = hips
        self.head_factor = head
        self.barefoot = barefoot
        self.face = dict(FACE)
        self.face.update(FACE_BY_SEX[sex])
        self.face.update(face or {})
        self.joints = {}
        self._place_joints()

    # -- joints -------------------------------------------------------------------------------

    def _place_joints(self):
        ref, s, joints = self.reference, self.scale, self.joints

        def point(name):
            return np.array(ref[name], dtype=np.float64) * s

        joints['root'] = np.zeros(3)
        for name in ('hips', 'spine', 'chest', 'neck'):
            joints[name] = point(name)
        joints['head'] = point('head_joint')
        self.head_height = ref['head'] * s ** 0.6 * self.head_factor
        joints['head_top'] = np.array([0.0, joints['head'][1], self.height])
        self.chin = self.height - self.head_height
        widen = np.array([self.shoulders * (0.6 + 0.4 * self.build['width']) / 1.0, 1.0, 1.0])
        widen[0] = self.shoulders * (1.0 + 0.5 * (self.build['width'] - 1.0))
        right = {'shoulder': point('shoulder'), 'upper_arm': point('upper_arm') * widen}
        direction = np.array([math.cos(ARM_DROP), 0.0, -math.sin(ARM_DROP)])
        self.arm_axis = direction
        self.arm_front = np.array([0.0, 1.0, 0.0])
        self.arm_up = np.cross(direction, self.arm_front)
        upper = ref['upper_arm_length'] * s
        fore = ref['forearm_length'] * s
        right['forearm'] = right['upper_arm'] + direction * upper + np.array([0.0, -0.008, 0.0])
        right['hand'] = right['forearm'] + direction * fore + np.array([0.0, 0.008, 0.0])
        right['hand_end'] = right['hand'] + direction * ref['hand_length'] * s
        stance = np.array([self.hip_factor ** 0.5, 1.0, 1.0])
        for name in ('thigh', 'shin', 'foot', 'toe', 'toe_tip'):
            right[name] = point(name) * stance
        if self.barefoot:
            lift = np.array([0.0, 0.0, 0.018 * s])
            for name in ('foot', 'toe', 'toe_tip'):
                right[name] = right[name] - lift * (1.0 if name == 'foot' else 0.6)
        mirror = np.array([-1.0, 1.0, 1.0])
        for name, value in right.items():
            joints[f'{name}_r'] = value
            joints[f'{name}_l'] = value * mirror
        # The hand's own axes: along the fingers, across the palm towards the thumb, and out of
        # the palm (the palm faces down and a little forward).
        self.hand_along = direction
        self.hand_thumb = self.arm_front * math.cos(PALM_TURN) + self.arm_up * math.sin(PALM_TURN)
        self.hand_palm = np.cross(self.hand_thumb, self.hand_along)
        self.hand_scale = s * ref['hand']
        self.head_scale = self.head_height / 0.235
        self.head_origin = np.array([0.0, joints['head'][1], self.chin])

    def head_point(self, x, y, z, side=1.0):
        """A point given in head space (origin under the chin, 0.235 m head) in the world."""
        return self.head_origin + np.array([x * side, y, z]) * self.head_scale

    def to_head(self, points):
        """World positions in head space."""
        return (points - self.head_origin) / self.head_scale

    def neck_radius(self):
        """The neck's radius mid-neck (about 6 cm for a 1.80 m man, 12 cm across)."""
        return (self.reference['neck_radius'] * self.girth * (0.94 + 0.12 * self.build['limb'])
                * (1.0 + 0.08 * self.build['fat']))

    # -- the block-in ------------------------------------------------------------------------

    def trunk_rings(self, ease=0.0, count=40):
        ref, s, g, build = self.reference, self.scale, self.girth, self.build
        waist, chest, hip = ref['waist'], ref['chest_level'], ref['hip_level']
        rings = []
        for z, centre_y, half, front, back in ref['trunk']:
            at_waist = math.exp(-((z - waist) / 0.11) ** 2)
            at_chest = math.exp(-((z - chest) / 0.12) ** 2)
            at_hip = math.exp(-((z - hip) / 0.09) ** 2)
            wide = build['width'] * (1.0 + (build['waist'] - build['width']) * at_waist * 0.8)
            wide *= 1.0 + (self.shoulders - 1.0) * at_chest * 0.6 + (self.hip_factor - 1.0) * at_hip
            deep = build['depth'] * (1.0 + (build['waist'] - build['depth']) * at_waist * 0.5)
            rings.append(superellipse_ring(z * s, centre_y * s, half * g * wide + ease,
                                           (centre_y + front * deep * (g / s)) * s + ease,
                                           (centre_y - back * deep * (g / s)) * s - ease,
                                           count=count, middle=0.5))
        return rings

    def block(self, parts=ALL_PARTS, ease=0.0, soup=None):
        """The body blocked in as overlapping forms. `ease` swells every form by so many metres:
        the same forms, a little larger, are the first shape of a garment. parts picks regions
        ('torso', 'neck', 'head', 'arms', 'hands', 'legs', 'feet')."""
        soup = soup or F.Soup()
        side = F.Soup()
        if 'torso' in parts:
            soup.rings(self.trunk_rings(ease))
            self._torso_masses(soup, side, ease)
        if 'neck' in parts:
            self._neck(soup, side, ease)
        if 'head' in parts:
            self._skull(soup, side, ease)
        if 'arms' in parts:
            self._arm(side, ease)
        if 'hands' in parts:
            self._palm(side, ease)
        if 'legs' in parts:
            self._leg(side, ease)
        if 'feet' in parts:
            self._foot(side, ease)
        for vertices, _ in [(v, None) for v in side.vertices]:
            pass
        absorb(soup, side, mirror=True)
        return soup

    def _torso_masses(self, soup, side, ease):
        ref, s, g, build = self.reference, self.scale, self.girth, self.build
        muscle, belly = build['muscle'], build['belly']
        shoulder = self.joints['upper_arm_r']
        neck = self.joints['neck']
        d, up = self.arm_axis, self.arm_up
        # Trapezius: the slope from the neck to the point of the shoulder.
        side.tube([neck + np.array([0.040 * g, -0.012 * s, 0.022 * s]),
                   shoulder + np.array([-0.040 * g, 0.004 * s, 0.026 * s]),
                   shoulder + np.array([0.0, 0.006 * s, 0.014 * s])],
                  np.array([0.040, 0.040, 0.034]) * g * (0.9 + 0.2 * muscle) + ease)
        # Deltoid: the cap of the shoulder, running down the outside of the arm. Thin across
        # (its 'up' radius becomes the width beyond the joint once the arm hangs): with 56 mm the
        # shoulders measured 0.58 m over the deltoids with the arms down, against 0.46 to 0.50
        # for an athletic man of 1.86 m.
        axes = np.array([d, self.arm_front, up])
        side.ellipsoid(shoulder + d * 0.036 * s + up * 0.006 * s,
                       np.array([0.076, 0.056, 0.046]) * g * build['limb'] * (0.92 + 0.14 * muscle)
                       + ease, axes)
        chest_z = ref['chest_level'] * s
        if self.sex == 'm':
            # Pectoral: a broad, flat slab that only just stands proud of the ribcage.
            # (Further out, lower or thicker than this it reads as a breast.)
            side.ellipsoid([0.074 * g * build['width'], 0.044 * s * build['depth'], chest_z + 0.032 * s],
                           np.array([0.086, 0.034 + 0.006 * muscle + 0.01 * belly, 0.062]) * g + ease)
            # The tie from the chest to the front of the shoulder. Keep it shallow: at y = 0.050
            # it stood 40 mm proud of the ribcage beside the armpit and read as a breast.
            side.ellipsoid([0.140 * g * build['width'], 0.020 * s, chest_z + 0.058 * s],
                           np.array([0.058, 0.036, 0.046]) * g * (0.85 + 0.2 * muscle) + ease)
        else:
            cup = self.bust
            side.ellipsoid([0.074 * g, (0.086 + 0.012 * cup) * s * build['depth'], chest_z + 0.004 * s],
                           np.array([0.060, 0.050 * cup, 0.060]) * g * (0.9 + 0.1 * cup) + ease)
            side.ellipsoid([0.078 * g, (0.094 + 0.016 * cup) * s * build['depth'], chest_z - 0.018 * s],
                           np.array([0.050, 0.042 * cup, 0.042]) * g * (0.9 + 0.1 * cup) + ease)
        # Latissimus: the taper from the armpit to the waist.
        side.ellipsoid([0.128 * g * build['width'], -0.050 * s, chest_z - 0.040 * s],
                       np.array([0.052, 0.058, 0.130]) * g * (0.8 + 0.25 * muscle) + ease)
        # Shoulder blade.
        side.ellipsoid([0.090 * g, -0.098 * s * build['depth'], chest_z + 0.070 * s],
                       np.array([0.062, 0.024, 0.070]) * g + ease)
        gx, gy, gz, rx, ry, rz = ref['glute']
        side.ellipsoid([gx * g * self.hip_factor, (gy + 0.018) * s * build['depth'], gz * s],
                       np.array([rx, ry * (0.95 + 0.25 * belly), rz]) * g * self.hip_factor + ease)
        if belly > 0.3:
            waist_z = ref['waist'] * s
            soup.ellipsoid([0.0, (0.040 + 0.055 * belly) * s, waist_z + 0.01 * s],
                           np.array([0.120 + 0.035 * belly, 0.062 + 0.075 * belly, 0.120 + 0.03 * belly]) * g
                           + ease)
            if belly > 0.5:
                side.ellipsoid([0.150 * g, -0.012 * s, waist_z - 0.02 * s],
                               np.array([0.045, 0.085, 0.075]) * g * belly + ease)

    def _neck(self, soup, side, ease):
        s, g, ref = self.scale, self.girth, self.reference
        radius = self.neck_radius()
        # The neck as a column of elliptical rings, not a round stalk (owner 13:05, "the neck
        # looks like it floats": an 11 cm tube stood in a 17 cm collar ring with a dark void
        # round it). It flares into the trunk below the collar line, is still about 1.14 r wide
        # at the collar line (it fills the collar's inner row, ~0.072 m for a 1.86 m man), about
        # 12 cm across mid-neck and a little narrower under the skull. Each row: height above the
        # neck joint (metres of the reference), half width / r, half depth / r.
        joint = self.joints['neck']
        top = self.head_point(0.0, -0.018, 0.085)
        rows = ((-0.055, 1.30, 1.12), (-0.028, 1.22, 1.08), (0.000, 1.14, 1.04),
                (0.030, 1.03, 0.99), (None, 0.97, 0.95))
        angles = np.arange(28) * (math.tau / 28)
        rings = []
        for lift, wide, deep in rows:
            if lift is None:
                centre = top
            else:
                z = joint[2] + lift * s
                t = max(0.0, (z - joint[2]) / max(top[2] - joint[2], 1e-6))
                centre = np.array([0.0, joint[1] + 0.004 * s + (top[1] - joint[1] - 0.004 * s) * t, z])
            rings.append(centre + np.stack([np.cos(angles) * (radius * wide + ease),
                                            np.sin(angles) * (radius * deep + ease),
                                            np.zeros(len(angles))], axis=1))
        soup.rings(rings)
        # Upper trapezius: from under the back of the skull down the back of the neck and out to
        # the shoulder, so that from behind the neck widens into the back in one slope. It stays
        # inside 0.88 of the collar outline above the collar line (where clothes cut the skin).
        side.tube([self.head_point(0.026, -0.060, 0.070),
                   joint + np.array([0.034 * g, -0.030 * s, 0.012 * s]),
                   joint + np.array([0.050 * g, -0.030 * s, -0.014 * s]),
                   joint + np.array([0.088 * g, -0.026 * s, -0.038 * s])],
                  np.array([0.015, 0.017, 0.020, 0.024]) * g + ease)
        # Sternocleidomastoid: from behind the ear to the notch between the collarbones.
        side.tube([self.head_point(0.058, -0.030, 0.070), self.head_point(0.046, -0.012, 0.010),
                   self.joints['neck'] + np.array([0.022 * g, 0.050 * s, -0.030 * s])],
                  np.array([0.012, 0.0125, 0.010]) * g + ease)
        # Collarbone.
        shoulder = self.joints['upper_arm_r']
        side.tube([self.joints['neck'] + np.array([0.020 * g, 0.060 * s, -0.045 * s]),
                   self.joints['neck'] + np.array([0.090 * g, 0.052 * s, -0.036 * s]),
                   shoulder + np.array([-0.020 * g, 0.022 * s, 0.022 * s])],
                  np.array([0.0105, 0.0095, 0.010]) * g + ease)
        if self.sex == 'm':
            soup.ellipsoid(self.head_point(0.0, 0.034, -0.040), np.array([0.011, 0.010, 0.014]) * g + ease)

    def _skull(self, soup, side, ease):
        k, face, fat = self.head_scale, self.face, self.build['fat']
        rings = []
        for z, half, front, back, n_front, n_back in HEAD_SLICES:
            jaw = 1.0 + (face['jaw'] - 1.0) * math.exp(-((z - 0.04) / 0.035) ** 2)
            jaw *= 1.0 + 0.10 * fat * math.exp(-((z - 0.05) / 0.045) ** 2)
            ring = superellipse_ring(z, 0.0, half * jaw + ease / k, front + ease / k, back - ease / k,
                                     n_front, n_back, count=36)
            rings.append(self.head_origin + ring * k)
        soup.rings(rings)
        # Jaw angle and the muscle over it, cheekbone, and the fill under the jaw.
        side.ellipsoid(self.head_point(0.050 * face['jaw'], -0.020, 0.040),
                       np.array([0.012, 0.020, 0.018]) * k + ease)
        side.ellipsoid(self.head_point(0.050, 0.039, 0.103),
                       np.array([0.020, 0.021, 0.0145]) * k * (0.9 + 0.1 * face['cheek']) + ease)
        soup.ellipsoid(self.head_point(0.0, 0.020, 0.022 - 0.006 * fat),
                       np.array([0.040, 0.046, 0.024 + 0.012 * fat]) * k + ease)

    def _arm(self, side, ease):
        ref, g, build = self.reference, self.girth, self.build
        muscle = build['muscle']
        thick = g * build['limb'] * ref['arm']
        shoulder, elbow, wrist = (self.joints[name] for name in ('upper_arm_r', 'forearm_r', 'hand_r'))
        d, front, up = self.arm_axis, self.arm_front, self.arm_up
        stations = [(shoulder - d * 0.01, (0.048, 0.052)), (F.lerp(shoulder, elbow, 0.30), (0.047, 0.049)),
                    (F.lerp(shoulder, elbow, 0.70), (0.043, 0.043)), (elbow, (0.041, 0.039)),
                    (F.lerp(elbow, wrist, 0.22), (0.046, 0.041)), (F.lerp(elbow, wrist, 0.55), (0.040, 0.034)),
                    (F.lerp(elbow, wrist, 0.85), (0.032, 0.025)), (wrist, (0.0295, 0.0215))]
        radii = np.array([pair for _, pair in stations]) * thick
        radii[-2:] = radii[-2:] * (0.7 + 0.3 * self.hand_scale / (thick * 1.0)) if False else radii[-2:]
        side.tube([point for point, _ in stations], radii + ease, side=self.hand_thumb, cap=0.4)
        axes = np.array([d, front, up])
        length = np.linalg.norm(elbow - shoulder)
        side.ellipsoid(shoulder + d * 0.50 * length + front * 0.016 * thick,
                       np.array([0.30 * length, 0.030 + 0.008 * muscle, 0.036]) * thick + ease, axes)
        side.ellipsoid(shoulder + d * 0.50 * length - front * 0.018 * thick,
                       np.array([0.32 * length, 0.030 + 0.006 * muscle, 0.036]) * thick + ease, axes)
        side.ellipsoid(elbow + d * 0.075 * thick + front * 0.008 * thick + up * 0.004,
                       np.array([0.080, 0.034, 0.036 + 0.004 * muscle]) * thick + ease, axes)
        side.ellipsoid(elbow - front * 0.024 * thick - d * 0.004,
                       np.array([0.020, 0.016, 0.018]) * thick + ease, axes)

    def _palm(self, side, ease):
        h = self.hand_scale
        wrist = self.joints['hand_r']
        d, w, n = self.hand_along, self.hand_thumb, self.hand_palm
        axes = np.array([d, w, n])
        side.tube([wrist - d * 0.004 * h, wrist + d * 0.035 * h, wrist + d * 0.075 * h, wrist + d * 0.094 * h],
                  np.array([(0.0285, 0.0200), (0.0370, 0.0165), (0.0420, 0.0150), (0.0410, 0.0125)]) * h
                  + ease, side=w, cap=0.5)
        side.ellipsoid(wrist + d * 0.040 * h + w * 0.026 * h + n * 0.011 * h,
                       np.array([0.032, 0.018, 0.014]) * h + ease, axes)
        side.ellipsoid(wrist + d * 0.045 * h - w * 0.029 * h + n * 0.008 * h,
                       np.array([0.036, 0.013, 0.013]) * h + ease, axes)

    def finger_paths(self, grip=None):
        """The joints of the four fingers and the thumb of the right hand: {name: (points,
        radii)}; radii are (across, thick) pairs. grip=None is the relaxed half-closed hand of
        the body; grip='shoot' wraps the fingers round a pistol grip (whose axis runs along the
        thumb side, the barrel along the hand) with the index forward on the trigger side and the
        thumb along the far side of the frame; grip='support' wraps them round the shooting hand
        (a wider loop) with the thumb forward."""
        h = self.hand_scale
        wrist = self.joints['hand_r']
        d, w, n = self.hand_along, self.hand_thumb, self.hand_palm
        bends = {None: (38.0, 52.0, 28.0), 'shoot': (66.0, 78.0, 48.0), 'support': (58.0, 62.0, 42.0)}[grip]
        paths = {}
        for name, offset, lengths, thick, curl in FINGERS:
            start = wrist + d * (0.094 - abs(offset) * 0.28) * h + w * offset * h - n * 0.001 * h
            # Fingers wrapped round a grip lie side by side (no splay).
            splay = offset * (2.2 if grip is None else 0.5)
            points, angle = [start - d * 0.012 * h, start], 0.0
            finger_bends = bends
            if grip is not None:
                curl = 1.0 + (curl - 1.0) * 0.4
            if grip == 'shoot' and name == 'index':
                # The trigger finger: straighter at the knuckle, crooked at the middle joint
                # round the front of the trigger guard.
                finger_bends = (34.0, 70.0, 30.0)
            for length, bend in zip(lengths, finger_bends):
                angle += math.radians(bend * curl)
                step = d * math.cos(angle) + n * math.sin(angle) + w * splay * math.cos(angle)
                points.append(points[-1] + F.unit(step) * length * h)
            # Slimmer across than thick so that neighbouring fingers stay apart (about 4 mm) in
            # the voxel union instead of fusing into a paddle.
            radii = np.array([(0.0088, 0.0080), (0.0086, 0.0082), (0.0078, 0.0074),
                              (0.0072, 0.0066), (0.0063, 0.0056)]) * thick * h
            paths[name] = (np.array(points), radii)
        base = wrist + d * 0.022 * h + w * 0.030 * h + n * 0.010 * h
        # The thumb lies along the side of the index (its pad beside the index's middle joint),
        # as in a relaxed hand and along a pistol's frame; it used to stick out 5 cm sideways,
        # which read as a mitten from behind. Round a grip it crosses to the far side of the
        # frame and points forward (both thumbs forward in a two-handed hold).
        steps = [(F.unit(d * 0.70 + w * 0.45 + n * 0.45), 0.046),
                 (F.unit(d * 0.85 + w * 0.05 + n * 0.40), 0.034),
                 (F.unit(d * 0.90 - w * 0.05 + n * 0.30), 0.030)]
        if grip is not None:
            steps = [(F.unit(d * 0.55 + w * 0.20 + n * 0.80), 0.046),
                     (F.unit(d * 0.90 + w * 0.02 + n * 0.35), 0.034),
                     (F.unit(d * 0.97 - w * 0.02 + n * 0.10), 0.030)]
        points = [base]
        for step, length in steps:
            points.append(points[-1] + step * length * h)
        paths['thumb'] = (np.array(points), np.array([(0.0135, 0.0125), (0.0115, 0.0105),
                                                      (0.0100, 0.0088), (0.0088, 0.0066)]) * h)
        return paths

    def _fingers(self, side, ease=0.0, grip=None):
        w, n, h = self.hand_thumb, self.hand_palm, self.hand_scale
        axes = np.array([self.hand_along, w, n])
        for name, (points, radii) in self.finger_paths(grip).items():
            across = w if name != 'thumb' else F.unit(self.hand_palm * 0.7 - self.hand_along * 0.3 + w * 0.2)
            side.tube(points, radii + ease, side=across, segments=12, cap=0.9)
            if name != 'thumb':
                # The knuckle: the head of the metacarpal stands up on the back of the hand, so
                # the four knuckles read as a row of bumps (from behind, over the shoulder).
                side.ellipsoid(points[1] - n * 0.0035 * h, np.array([0.0085, 0.0082, 0.0072]) * h + ease, axes)
                # The middle joint, a little broader than the bones either side of it.
                side.ellipsoid(points[2], np.array([0.0065, radii[2][0] * 1.08, radii[2][1] * 1.06]) + ease,
                               np.array([F.unit(points[3] - points[2]), w, F.unit(np.cross(points[3] - points[2], w))]))

    def grip_hand(self, grip, left=False, name=None, voxel=0.0022):
        """A hand closed round a weapon's grip, on its own (the game shows it instead of the
        relaxed hand while a weapon is held): the palm, the fingers and thumb of finger_paths
        (grip='shoot' or 'support'), the knuckles, and a short stub of wrist that closes over the
        end of the forearm. Right hand unless `left` (mirrored across X)."""
        h = self.hand_scale
        wrist, d = self.joints['hand_r'], self.hand_along
        thick = self.girth * self.build['limb'] * self.reference['arm']
        forms = F.Soup()
        forms.tube([wrist - d * 0.035 * h, wrist - d * 0.010 * h, wrist + d * 0.006 * h],
                   np.array([(0.0300, 0.0222), (0.0298, 0.0218), (0.0292, 0.0212)]) * thick,
                   side=self.hand_thumb, cap=0.5)
        self._palm(forms, 0.0)
        self._fingers(forms, 0.0, grip=grip)
        soup = absorb(F.Soup(), forms)
        if left:
            soup.vertices = [vertices * np.array([-1.0, 1.0, 1.0]) for vertices in soup.vertices]
            soup.faces = [tuple(reversed(face)) for face in soup.faces]
        return soup.union(name or ('hand_l_grip' if left else 'hand_r_grip'), voxel=voxel,
                          relax_steps=5, strength=0.5)

    def _leg(self, side, ease):
        ref, g, build = self.reference, self.girth, self.build
        muscle = build['muscle']
        thick = g * build['limb'] * ref['leg']
        hip, knee, ankle = (self.joints[name] for name in ('thigh_r', 'shin_r', 'foot_r'))
        top = 1.0 + 0.5 * (self.hip_factor - 1.0) + 0.10 * build['belly']
        stations = [(hip + np.array([0.0, 0.0, 0.03]), (0.086 * top, 0.092 * top)),
                    (F.lerp(hip, knee, 0.20), (0.087 * top, 0.094 * top)),
                    (F.lerp(hip, knee, 0.50), (0.076, 0.082)), (F.lerp(hip, knee, 0.80), (0.062, 0.066)),
                    (knee, (0.054, 0.058)), (F.lerp(knee, ankle, 0.12), (0.052, 0.054)),
                    (F.lerp(knee, ankle, 0.32), (0.054, 0.058)), (F.lerp(knee, ankle, 0.65), (0.041, 0.043)),
                    (F.lerp(knee, ankle, 0.90), (0.034, 0.037)), (ankle - np.array([0.0, 0.0, 0.02]), (0.033, 0.039))]
        side.tube([point for point, _ in stations], np.array([pair for _, pair in stations]) * thick + ease,
                  side=(1.0, 0.0, 0.0), cap=0.3)
        thigh = np.linalg.norm(knee - hip)
        shin = np.linalg.norm(ankle - knee)
        side.ellipsoid(F.lerp(hip, knee, 0.42) + np.array([0.004, 0.030 * thick, 0.0]),
                       np.array([0.056, 0.044 + 0.008 * muscle, 0.38 * thigh]) * thick + ease)
        side.ellipsoid(F.lerp(hip, knee, 0.45) + np.array([0.0, -0.030 * thick, 0.0]),
                       np.array([0.052, 0.042 + 0.006 * muscle, 0.34 * thigh]) * thick + ease)
        side.ellipsoid(F.lerp(knee, ankle, 0.27) + np.array([0.0, -0.024 * thick, 0.0]),
                       np.array([0.047, 0.040 + 0.008 * muscle, 0.26 * shin]) * thick + ease)
        side.ellipsoid(knee + np.array([0.0, 0.044 * thick, 0.004]),
                       np.array([0.027, 0.017, 0.031]) * thick + ease)
        for offset in (0.033, -0.030):
            side.ellipsoid(ankle + np.array([offset * thick, -0.004, 0.004]),
                           np.array([0.013, 0.016, 0.016]) * thick + ease)

    def _foot(self, side, ease):
        """A bare foot: heel, arch, ball and instep (the toes are detail)."""
        s = self.scale
        ankle, ball, tip = (self.joints[name] for name in ('foot_r', 'toe_r', 'toe_tip_r'))
        heel = np.array([ankle[0], ankle[1] - 0.048 * s, 0.030 * s])
        side.tube([heel, np.array([ankle[0] + 0.004, ankle[1] + 0.030 * s, 0.034 * s]),
                   np.array([ball[0] + 0.004, ball[1] - 0.010 * s, 0.022 * s]),
                   np.array([ball[0] + 0.006, ball[1] + 0.022 * s, 0.016 * s])],
                  np.array([(0.031, 0.029), (0.036, 0.033), (0.047, 0.021), (0.046, 0.014)]) * s + ease,
                  side=(1.0, 0.0, 0.0), cap=0.6)
        side.ellipsoid(ankle + np.array([0.0, 0.040 * s, -0.030 * s]),
                       np.array([0.031, 0.060, 0.030]) * s + ease,
                       F.basis((0.0, 0.92, -0.38), (0.0, 0.0, 1.0))[[0, 1, 2]])
        if ease == 0.0:
            for index, (offset, length, radius) in enumerate(((-0.030, 0.038, 0.0105), (-0.012, 0.034, 0.0085),
                                                               (0.004, 0.031, 0.008), (0.019, 0.027, 0.0075),
                                                               (0.033, 0.022, 0.007))):
                start = np.array([ball[0] + 0.004 - offset, ball[1] + 0.012 * s - abs(index) * 0.006 * s, 0.013 * s])
                side.tube([start, start + np.array([0.0, length * s, -0.003 * s])],
                          np.array([radius, radius * 0.92]) * s, segments=10, cap=0.9)

    # -- detail forms -------------------------------------------------------------------------

    def _face_forms(self, soup, side):
        k, face = self.head_scale, self.face
        hp = self.head_point
        length, width, bridge = face['nose_length'], face['nose_width'], face['nose_bridge']
        tip_z = nose_tip_z(face)
        # A narrow bridge between the eyes (about 11 mm) that rises to a projecting tip: the eyes'
        # inner corners must stay clear of it.
        soup.tube([hp(0.0, 0.0770, 0.127), hp(0.0, 0.0800 + 0.012 * bridge, 0.127 - 0.021 * length),
                   hp(0.0, 0.0880 + 0.008 * bridge, tip_z + 0.007), hp(0.0, 0.0975, tip_z)],
                  np.array([(0.0056, 0.0066), (0.0062, 0.0074), (0.0076, 0.0084), (0.0084, 0.0090)]) * k
                  * np.array([width, 1.0]), side=(1.0, 0.0, 0.0), segments=14, cap=0.8)
        soup.ellipsoid(hp(0.0, 0.0975, tip_z - 0.0008), np.array([0.0088 * width, 0.0098, 0.0086]) * k)
        # The wings of the nostrils (about 36 mm across, no wider than the gap between the eyes'
        # inner corners), and low side walls that run the lower bridge out into the cheeks.
        side.ellipsoid(hp(0.0118 * width, 0.0855, tip_z - 0.0050), np.array([0.0066, 0.0092, 0.0068]) * k)
        side.ellipsoid(hp(0.0090 * width, 0.0730, tip_z + 0.0120), np.array([0.0078, 0.0100, 0.0170]) * k)
        soup.ellipsoid(hp(0.0, 0.0880, tip_z - 0.0072), np.array([0.0048, 0.0105, 0.0042]) * k)
        # The mound of the mouth, then the two lips as thin rolls across it: the upper lip about
        # 7 mm high, the lower 9 mm, standing only a few millimetres off the mound.
        full, wide = face['lips'], face['mouth_width']
        soup.ellipsoid(hp(0.0, 0.0650, 0.0545), np.array([0.0290, 0.0165, 0.0215]) * k)
        upper = [hp(x * wide, y, z) for x, y, z in ((-0.0235, 0.0705, 0.0568), (-0.0120, 0.0778, 0.0588),
                                                    (0.0, 0.0802, 0.0590), (0.0120, 0.0778, 0.0588),
                                                    (0.0235, 0.0705, 0.0568))]
        soup.tube(upper, np.array([0.0026, 0.0036, 0.0040, 0.0036, 0.0026]) * k * full, segments=12)
        lower = [hp(x * wide, y, z) for x, y, z in ((-0.0205, 0.0700, 0.0522), (-0.0100, 0.0760, 0.0506),
                                                    (0.0, 0.0778, 0.0500), (0.0100, 0.0760, 0.0506),
                                                    (0.0205, 0.0700, 0.0522))]
        soup.tube(lower, np.array([0.0030, 0.0042, 0.0048, 0.0042, 0.0030]) * k * full, segments=12)
        soup.ellipsoid(hp(0.0, 0.0655, 0.0185), np.array([0.0220 * face['jaw'], 0.0160, 0.0170]) * k * face['chin'])
        # The brow ridge lies mostly inside the forehead: only a few millimetres stand proud.
        ridge = 0.0055 + 0.0030 * face['brow']
        soup.tube([hp(-0.058, 0.045, 0.136), hp(-0.036, 0.0670, 0.1405), hp(-0.014, 0.0728, 0.1385),
                   hp(0.0, 0.0720, 0.1350), hp(0.014, 0.0728, 0.1385), hp(0.036, 0.0670, 0.1405),
                   hp(0.058, 0.045, 0.136)], np.full(7, ridge) * k, segments=12)
        ear = face['ear']
        # An ear lies nearly flat to the head: its front edge is rooted in the side of the
        # head and only its back rim stands off, by about fifteen millimetres.
        axes = F.basis((-0.30, 0.954, 0.0), (0.0, 0.17, 0.985))
        side.ellipsoid(hp(0.0752, -0.0150, 0.1170), np.array([0.0055, 0.0170, 0.0310]) * k * ear, axes)
        side.ellipsoid(hp(0.0725, -0.0080, 0.0900), np.array([0.0048, 0.0080, 0.0090]) * k * ear, axes)

    # -- the finished skin --------------------------------------------------------------------

    def skin(self, parts=ALL_PARTS, voxel=0.0024):
        """The whole body as one dense, sculpted skin (the surface textures are baked from)."""
        base = self.block(parts).union('body_block', voxel=0.005)
        self.soften(base)
        soup, side = F.Soup(), F.Soup()
        soup.mesh(base)
        from lib import scene
        scene.delete(base)
        if 'hands' in parts:
            self._fingers(side)
        if 'head' in parts:
            self._face_forms(soup, side)
        absorb(soup, side, mirror=True)
        skin = soup.union('skin', voxel=voxel, relax_steps=7, strength=0.5)
        if 'head' in parts:
            self.sculpt_face(skin)
        return skin

    def soften(self, obj, steps=40, swell=0.0012, voxel=0.005):
        """Runs the blocked-in masses into each other, so that they read as muscle under skin
        and not as balloons: a long relax (about 15 mm of blur on a 5 mm skin), lighter on the
        head, the hands and the feet whose forms are small, then a swell along the normals that
        gives back the girth the relax took."""
        s = self.scale
        points = F.positions(obj)
        weight = 0.3 + 0.7 * F.smoothstep(0.06 * s, 0.16 * s, points[:, 2])
        weight *= 1.0 - 0.6 * F.smoothstep(self.chin - 0.01, self.chin + 0.03, points[:, 2])
        for side in ('r', 'l'):
            reach = np.linalg.norm(points - self.joints[f'hand_end_{side}'], axis=1)
            weight *= 0.35 + 0.65 * F.smoothstep(0.10 * s, 0.17 * s, reach)
        F.relax(obj, steps, 0.6, weight=weight)
        points = F.positions(obj)
        points += F.normals(obj) * (swell * weight)[:, None]
        # A relax thins a limb of radius r to sqrt(r^2 - blur): put exactly that back, measured
        # from each limb bone, or forearms and shins waste away.
        blur = steps * 0.6 * voxel * voxel / 2.0 * 0.8
        for side in ('r', 'l'):
            for start, end, reach in (('upper_arm', 'forearm', 0.075), ('forearm', 'hand', 0.070),
                                      ('thigh', 'shin', 0.110), ('shin', 'foot', 0.085)):
                a, b = self.joints[f'{start}_{side}'], self.joints[f'{end}_{side}']
                length = float(np.linalg.norm(b - a))
                axis = (b - a) / length
                along = (points - a) @ axis
                radial = points - a - np.outer(along, axis)
                rho = np.maximum(np.linalg.norm(radial, axis=1), 1e-6)
                inside = (F.smoothstep(-0.02, 0.05, along) * F.smoothstep(length + 0.02, length - 0.05, along)
                          * (rho < reach * s) * weight)
                points += radial * ((np.sqrt(rho * rho + blur * inside) - rho) / rho)[:, None]
        # The same for the neck, from the collar line to just under the chin (the head keeps its
        # own shape): without it the relax thinned the neck into a stalk.
        a = self.joints['neck'] - np.array([0.0, 0.0, 0.03 * s])
        b = self.head_point(0.0, -0.018, 0.0)
        length = float(np.linalg.norm(b - a))
        axis = (b - a) / length
        along = (points - a) @ axis
        radial = points - a - np.outer(along, axis)
        rho = np.maximum(np.linalg.norm(radial, axis=1), 1e-6)
        inside = (F.smoothstep(-0.02, 0.03, along) * F.smoothstep(length + 0.005, length - 0.03, along)
                  * F.smoothstep(0.10 * s, 0.08 * s, rho))
        points += radial * ((np.sqrt(rho * rho + blur * 1.5 * inside) - rho) / rho)[:, None]
        F.set_positions(obj, points)
        return obj

    def sculpt_face(self, obj):
        """Eye sockets and lids, the line of the mouth, nostrils, the folds beside the nose and
        the hollow of the ear, cut into the fused head with brushes."""
        k, face = self.head_scale, self.face
        world = F.positions(obj)
        region = world[:, 2] > self.chin - 0.02
        points = self.to_head(world[region])
        vertex_normals = F.normals(obj)[region]
        age = face['age']
        for sign in (1.0, -1.0):
            eye = np.array([EYE[0] * face['eye_spacing'] * sign, EYE[1], EYE[2]])
            F.push(points, eye + np.array([0.0, 0.0125, 0.001]), (0.0240, 0.0200, 0.0175), (0.0, -0.0062, 0.0))
            F.push(points, eye + np.array([-0.0120 * sign, 0.0150, 0.0080]), 0.0125, (0.0, -0.0035, 0.0))
            offset = points - eye
            radius = np.linalg.norm(offset, axis=1)
            near = (radius < LID_RADIUS * 1.0) & (offset[:, 1] > -0.004)
            grow = np.where(near, LID_RADIUS / np.maximum(radius, 1e-6), 1.0)
            points[:] = eye + offset * grow[:, None]
        tip_z = nose_tip_z(face)
        wide = face['mouth_width']
        # The corners of the mouth lie under the pupils, a little inside them.
        mouth = [(x * wide, y, z) for x, y, z in ((-0.0272, 0.0688, 0.0542), (-0.0130, 0.0785, 0.0548),
                                                  (0.0, 0.0812, 0.0550), (0.0130, 0.0785, 0.0548),
                                                  (0.0272, 0.0688, 0.0542))]
        # A closed mouth: a narrow, shallow line (3.4 mm wide and 4 mm deep read as parted lips).
        F.crease(points, vertex_normals, mouth, 0.0024, 0.0026)
        # The philtrum: a short groove from the base of the nose to the upper lip.
        F.crease(points, vertex_normals, [(0.0, 0.0850, tip_z - 0.0110), (0.0, 0.0830, 0.0625)], 0.0040, 0.0010)
        F.crease(points, vertex_normals, [(-0.0150, 0.0740, 0.0385), (0.0, 0.0770, 0.0370), (0.0150, 0.0740, 0.0385)],
                 0.0070, 0.0020, taper=False)
        for sign in (1.0, -1.0):
            F.push(points, (0.0070 * sign * face['nose_width'], 0.0900, tip_z - 0.0080), 0.0042, (0.0, -0.0018, 0.0070))
            F.push(points, (0.0275 * sign * wide, 0.0705, 0.0542), 0.0060, (0.0, -0.0022, 0.0))
            fold = [(0.0175 * sign, 0.0820, tip_z - 0.0030), (0.0255 * sign, 0.0770, 0.0640),
                    (0.0310 * sign, 0.0700, 0.0500)]
            F.crease(points, vertex_normals, fold, 0.0060, 0.0006 + 0.0022 * age, taper=False)
            F.inflate(points, vertex_normals, (0.0700 * sign, 0.0380, 0.1450), 0.0220, -0.0022)
            # The bowl of the ear and the groove inside its rim.
            F.push(points, (0.0815 * sign, -0.0130, 0.1200), (0.0075, 0.0085, 0.0130), (-0.0042 * sign, 0.002, 0.0))
            eye = np.array([EYE[0] * face['eye_spacing'] * sign, EYE[1], EYE[2]])
            arc = [eye + np.array([u * sign, LID_RADIUS * 0.94 - abs(u) * 0.20, 0.0095 - (u / 0.016) ** 2 * 0.0050])
                   for u in (-0.0150, -0.0075, 0.0, 0.0075, 0.0150)]
            F.crease(points, vertex_normals, arc, 0.0028, 0.0011)
            bag = [eye + np.array([u * sign, LID_RADIUS * 0.90 - abs(u) * 0.2, -0.0098 + (u / 0.016) ** 2 * 0.003])
                   for u in (-0.0130, 0.0, 0.0130)]
            F.crease(points, vertex_normals, bag, 0.0040, 0.0003 + 0.0010 * age)
        world[region] = self.head_origin + points * k
        F.set_positions(obj, world)
        F.relax(obj, 1, 0.3, weight=region.astype(np.float64))
        return obj

    def eye_opening(self, points):
        """True for points (world space) inside the opening between the lids of either eye."""
        face = self.face
        local = self.to_head(points)
        inside = np.zeros(len(points), dtype=bool)
        size, tilt = face['eye_size'], math.tan(math.radians(face['eye_tilt']))
        for sign in (1.0, -1.0):
            eye = np.array([EYE[0] * face['eye_spacing'] * sign, EYE[1], EYE[2]])
            u = (local[:, 0] - eye[0]) * sign
            v = local[:, 2] - eye[2] - u * tilt
            span = np.clip(1.0 - ((u + 0.0005) / ((EYE_HALF + 0.0006) * size)) ** 2, 0.0, 1.0)
            upper = (EYE_UPPER + 0.0007) * size * span ** 0.75
            lower = (EYE_LOWER - 0.0006) * size * span ** 0.60
            inside |= (span > 0.0) & (v < upper) & (v > lower) & (local[:, 1] > eye[1] + 0.004)
        return inside

    def eye_centres(self):
        """The centres of the right and left eyeballs in the world, and their radius."""
        spacing = self.face['eye_spacing']
        return ([self.head_point(EYE[0] * spacing, EYE[1], EYE[2], side) for side in (1.0, -1.0)],
                EYE_RADIUS * self.head_scale)

    def face_masks(self, points):
        """Per-vertex paint masks for the skin material: (lips, brows, beard shadow)."""
        face = self.face
        local = self.to_head(points)
        wide, full = face['mouth_width'], face['lips']
        # The masks are drawn on the face as seen from the front (x and z), so they do not
        # depend on how far the lips or the brow stand out.
        flat = local * np.array([1.0, 0.0, 1.0])
        upper, _ = F.polyline_distance(flat, [(x * wide, 0.0, z) for x, z in (
            (-0.0240, 0.0560), (-0.0120, 0.0586), (0.0, 0.0590), (0.0120, 0.0586), (0.0240, 0.0560))])
        lower, _ = F.polyline_distance(flat, [(x * wide, 0.0, z) for x, z in (
            (-0.0210, 0.0522), (-0.0100, 0.0507), (0.0, 0.0500), (0.0100, 0.0507), (0.0210, 0.0522))])
        taper = np.clip(1.0 - (np.abs(local[:, 0]) / (0.0262 * wide)) ** 2, 0.0, 1.0) ** 0.5
        lips = np.maximum(1.0 - F.smoothstep(0.0022 * full, 0.0034 * full, upper / np.maximum(taper, 0.2)),
                          1.0 - F.smoothstep(0.0030 * full, 0.0044 * full, lower / np.maximum(taper, 0.2)))
        lips = lips * (local[:, 1] > 0.055)
        brows = np.zeros(len(points))
        for sign in (1.0, -1.0):
            line = [(0.0090 * sign, 0.0, 0.1395), (0.0200 * sign, 0.0, 0.1440),
                    (0.0340 * sign, 0.0, 0.1462), (0.0500 * sign, 0.0, 0.1420)]
            distance, along = F.polyline_distance(flat, line)
            distance = np.where(local[:, 1] > 0.035, distance, 1.0)
            width = 0.0052 - 0.0026 * along
            brows = np.maximum(brows, 1.0 - F.smoothstep(width * 0.55, width, distance))
            # The same dark shade draws the lash line along the upper lid and the nostril.
            size, tilt = face['eye_size'], math.tan(math.radians(face['eye_tilt']))
            eye_x = EYE[0] * face['eye_spacing'] * sign
            lash = []
            for u in np.linspace(-EYE_HALF - 0.0004, EYE_HALF, 9) * size:
                span = max(1.0 - (u / (EYE_HALF * size)) ** 2, 0.0)
                # Just over the upper edge of the eye patch (_person.eye_patches: EYE_UPPER).
                lash.append((eye_x + u * sign, 0.0, EYE[2] + (EYE_UPPER + 0.0003) * size * span ** 0.75 + u * tilt))
            distance, _ = F.polyline_distance(flat, lash)
            distance = np.where(local[:, 1] > 0.045, distance, 1.0)
            brows = np.maximum(brows, 0.85 * (1.0 - F.smoothstep(0.0011, 0.0026, distance)))
            tip_z = nose_tip_z(face)
            brows = np.maximum(brows, F.blob(local, (0.0070 * sign * face['nose_width'], 0.0890, tip_z - 0.0092),
                                             (0.0036, 0.0060, 0.0030)))
        beard = (F.smoothstep(0.086, 0.070, local[:, 2]) * F.smoothstep(-0.030, 0.000, local[:, 1])
                 * F.smoothstep(-0.050, -0.020, local[:, 2]) * (1.0 - lips))
        cheek_gap = F.blob(local * np.array([1.0, 1.0, 1.0]), (0.0, 0.085, 0.085), (0.020, 0.03, 0.012))
        beard = np.clip(beard - cheek_gap, 0.0, 1.0)
        return np.stack([lips, brows, beard], axis=1)

    def detail_weight(self, points):
        """How much detail the game mesh should keep at each vertex (0..1): the face and the
        ears most, then the hands, the rest least."""
        local = self.to_head(points)
        face = (F.smoothstep(-0.035, -0.005, local[:, 1]) * F.smoothstep(-0.02, 0.01, local[:, 2])
                * F.smoothstep(0.21, 0.17, local[:, 2]))
        ears = (np.abs(local[:, 0]) > 0.068) & (local[:, 2] > 0.08) & (local[:, 2] < 0.155) & (local[:, 1] < 0.02)
        weight = np.maximum(face, ears * 0.9)
        for side in ('r', 'l'):
            wrist = self.joints[f'hand_{side}']
            axis = self.joints[f'hand_end_{side}'] - wrist
            along = (points - wrist) @ F.unit(axis)
            near = np.linalg.norm(points - wrist, axis=1) < 0.24 * self.hand_scale
            weight = np.maximum(weight, 0.75 * ((along > -0.01) & near))
        return weight


def absorb(soup, other, mirror=False):
    """Adds every form of `other` to `soup`; with mirror, also their mirror image across X."""
    if not other.vertices:
        return soup
    vertices = np.concatenate(other.vertices)
    soup.add(vertices, other.faces)
    if mirror:
        soup.add(vertices * np.array([-1.0, 1.0, 1.0]), other.faces)
    return soup
