"""Shared helper of the everyday cars: the saloon platform and the cars derived from it.

saloon() is the family saloon's description (marks, curves, cabin and cap rules; see _body and
_car). derive() stretches such a description onto other main dimensions (the four stations
tail, rear axle, front axle and nose; the width; the belt and roof heights) so that a sister
car on the same platform (the police cruiser, the taxi) shares its lines without every curve
being drawn again. Each car then replaces whatever is its own (wheels, caps, colours, fittings).

Blender axes: Z up, nose towards +Y, right side +X; y = 0 at the centre of the wheelbase.
"""
import _body as B
from _shape import Curve

GLASS, BELT = B.COL_GLASS_BASE, B.COL_BELT

HEIGHTS = ('top', 'rail_z', 'belt', 'bottom')      # curves whose values are heights
WIDTHS = ('rail_x', 'plan', 'shelf', 'tuck')       # curves whose values are half widths or insets


def saloon():
    """A fresh copy of the family saloon (the builder adds marks to the copy it is given)."""
    return {
        'color': '#A9ADB1', 'atlas': 1024,
        'width': 1.82, 'height': 1.46, 'clearance': 0.15,
        'axle_r': -1.38, 'axle_f': 1.38,
        # Stance (first Cycles sheet): 0.32 m wheels on 16-inch rims sat small and inboard in
        # tall arches; now 0.335 m on 18-inch rims, flush with the arch flares, 3.5 cm gap.
        'wheel_radius': 0.335, 'tyre_width': 0.225, 'track': 1.58, 'arch_radius': 0.37,
        'wheel': {'rim_ratio': 0.70, 'spokes': 5},
        'tail_bow': 0.09, 'nose_bow': 0.09, 'tail_bulge': 0.025, 'nose_bulge': 0.025,
        'marks': {
            'tail': -2.295, 'lamp_tail_front': -2.07, 'deck': -1.80, 'quarter_rear': -1.33,
            'roof_rear': -1.02, 'pillar_b': -0.30, 'door_rear': -0.22, 'roof_front': 0.32,
            'glass_front': 0.74, 'door_front': 0.86, 'cowl': 1.02, 'lamp_rear': 1.93,
            'hood_front': 2.10, 'nose': 2.195,
        },
        'curves': {
            'top': Curve([(-2.295, 1.030), (-2.15, 1.050), (-1.80, 1.050), (-1.02, 1.415),
                          (-0.30, 1.460), (0.32, 1.425), (0.66, 1.215), (1.00, 0.992),
                          (1.04, 0.982), (1.38, 0.935), (1.85, 0.855), (2.10, 0.775),
                          (2.195, 0.715)]),
            'rail_z': Curve([(-2.295, 1.000), (-2.15, 1.020), (-1.80, 1.020), (-1.02, 1.375),
                             (-0.30, 1.415), (0.32, 1.385), (0.66, 1.180), (1.02, 0.955),
                             (1.38, 0.905), (1.85, 0.825), (2.10, 0.745), (2.195, 0.685)]),
            'rail_x': Curve([(-2.295, 0.60), (-2.10, 0.74), (-1.80, 0.775), (-1.02, 0.64),
                             (-0.30, 0.615), (0.32, 0.61), (1.02, 0.775), (1.38, 0.80),
                             (1.85, 0.79), (2.10, 0.72), (2.195, 0.60)]),
            'belt': Curve([(-2.295, 0.955), (-2.15, 0.975), (-1.80, 0.975), (-1.00, 0.955),
                           (-0.22, 0.935), (0.86, 0.915), (1.02, 0.912), (1.38, 0.862),
                           (1.85, 0.782), (2.10, 0.702), (2.195, 0.642)]),
            'plan': Curve([(-2.295, 0.70), (-2.20, 0.80), (-2.00, 0.868), (-1.38, 0.898),
                           (-0.40, 0.91), (0.60, 0.905), (1.38, 0.898), (1.85, 0.868),
                           (2.08, 0.80), (2.195, 0.69)]),
            'shelf': Curve([(-1.90, 0.03), (-1.20, 0.07), (0.50, 0.07), (1.05, 0.03)]),
            'bottom': Curve([(-2.295, 0.33), (-2.00, 0.25), (-1.75, 0.19), (-0.95, 0.17),
                             (0.95, 0.17), (1.75, 0.18), (2.195, 0.23)]),
            'tuck': Curve([(-2.295, 0.03), (-1.00, 0.055), (0.90, 0.055), (2.195, 0.04)]),
        },
        'nose_cap': [('lamp_head', 4, 8, GLASS, BELT + 2),
                     ('lamp_indicator_r', 6, 8, BELT + 2, BELT + 3),
                     ('grille', 0, 4, GLASS + 1, BELT + 3), ('grille', 0, 5, BELT + 4, BELT + 7)],
        'tail_cap': [('lamp_tail', 5, 8, GLASS, BELT + 1), ('lamp_brake', 3, 5, GLASS, BELT + 1),
                     ('lamp_indicator_r', 5, 8, BELT + 1, BELT + 2),
                     ('lamp_reverse', 3, 5, BELT + 1, BELT + 2)],
        'exhausts': [0.48], 'exhaust_z': 0.30, 'plate_f_z': 0.36, 'plate_r_z': 0.66,
        'cabin': {'rear': -1.27, 'front': 0.98, 'half_width': 0.80, 'floor': 0.19, 'belt': 0.92,
                  'seat_x': 0.37, 'seat_y': -0.05, 'rear_seat_y': -0.88, 'shelf': 0.52},
    }


def _piecewise(pairs):
    """The linear map through (old, new) pairs, continued past the ends with the end slopes."""
    pairs = sorted(pairs)

    def apply(value):
        index = 0
        while index < len(pairs) - 2 and value > pairs[index + 1][0]:
            index += 1
        (a0, b0), (a1, b1) = pairs[index], pairs[index + 1]
        return b0 + (b1 - b0) * (value - a0) / (a1 - a0)
    return apply


def derive(base, tail, axle_r, axle_f, nose, width, heights, **own):
    """`base` stretched: stations through (tail, axle_r, axle_f, nose), half widths scaled to
    `width`, heights through the (old, new) pairs `heights` (the ground stays at 0). The
    keyword arguments in `own` then replace the derived values."""
    marks = base['marks']
    along = _piecewise([(marks['tail'], tail), (base['axle_r'], axle_r),
                        (base['axle_f'], axle_f), (marks['nose'], nose)])
    up = _piecewise([(0.0, 0.0)] + list(heights))
    wide = width / base['width']
    spec = dict(base)
    spec.update(width=width, height=up(base['height']), axle_r=axle_r, axle_f=axle_f,
                clearance=up(base['clearance']))
    spec['marks'] = {name: along(y) for name, y in marks.items()}
    spec['curves'] = {
        name: Curve([(along(t), up(v) if name in HEIGHTS else v * wide)
                     for t, v in zip(curve.t, curve.v)])
        for name, curve in base['curves'].items()}
    cabin = dict(base['cabin'])
    for key in ('rear', 'front', 'seat_y', 'rear_seat_y'):
        if key in cabin:
            cabin[key] = along(cabin[key])
    for key in ('half_width', 'seat_x'):
        cabin[key] *= wide
    for key in ('floor', 'belt'):
        cabin[key] = up(cabin[key])
    spec['cabin'] = cabin
    for key in ('exhaust_z', 'plate_f_z', 'plate_r_z'):
        spec[key] = up(base[key])
    spec['exhausts'] = [x * wide for x in base['exhausts']]
    spec['nose_cap'], spec['tail_cap'] = list(base['nose_cap']), list(base['tail_cap'])
    spec['wheel'] = dict(base.get('wheel', {}))
    spec.update(own)
    return spec
