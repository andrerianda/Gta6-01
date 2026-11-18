"""SUV (the five-door sport utility of the vehicle catalogue): an original upright two-box wagon.

4.86 m long, 1.95 m wide and 1.76 m high over the roof rails, on a 2.86 m wheelbase with 0.38 m
wheels and 0.21 m of ground clearance: a tall flat clamshell bonnet over a deep bar grille
between slim headlamps, a steep windscreen, a long flat roof with rails that floats on
blacked-out rear pillars, a steeply raked rear screen over a short tailgate lip, tall vertical
tail lamps at the rear corners, and dark cladding along the sills and round the lower bumpers.

Built on the everyday cars' kit (_body, _car) with its own curves: the tailgate face is the
body's tail cap (it does not open; `trunk` is the lip under the rear screen).

Budget: the everyday cars' node contract and the lamp units, plus the roof rails: 23,000
triangles, 40 draw calls and 1,200,000 bytes (the geometry is not compressed).

Blender axes: Z up, the car faces +Y, right side +X, origin on the ground at the centre of the
wheelbase; the driver sits on the left (-X).
"""
from lib import build, scene

import _body as B
import _car
import _mesh
from _shape import Curve

ASSET = {
    'id': 'suv',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 23000, 'draws': 40, 'bytes': 1200000},
}

GLASS, BELT, LAST = B.COL_GLASS_BASE, B.COL_BELT, B.COLUMNS


def spec():
    """A fresh copy of the SUV's description (the builder adds marks to the copy it is given)."""
    return {
        'color': '#5E6A6E', 'atlas': 1024,
        'width': 1.95, 'height': 1.76, 'clearance': 0.21,
        'axle_r': -1.43, 'axle_f': 1.43,
        'wheel_radius': 0.38, 'tyre_width': 0.255, 'track': 1.68, 'arch_radius': 0.425,
        'wheel': {'rim_ratio': 0.64, 'spokes': 6},
        'tail_bow': 0.035, 'nose_bow': 0.05, 'tail_bulge': 0.012, 'nose_bulge': 0.02,
        'crown_power': 3.2, 'glass_bow': 0.01, 'widest': 0.3, 'flare': 0.016,
        # First sheet: read as a tall estate (0.6 m of side glass) and 4.98 m long: the belt and
        # the bonnet are raised (0.52 m of glass) and both ends pulled in (4.88 m over the caps).
        'marks': {
            'tail': -2.37, 'deck': -2.30, 'lamp_tail_front': -2.21, 'roof_rear': -2.06,
            'quarter_rear': -1.96, 'pillar_b': -0.14, 'door_rear': -0.06, 'roof_front': 0.42,
            'glass_front': 1.02, 'door_front': 1.10, 'cowl': 1.25, 'lamp_rear': 2.10,
            'hood_front': 2.29, 'nose': 2.40,
        },
        'curves': {
            'top': Curve([(-2.37, 1.075), (-2.335, 1.105), (-2.30, 1.125), (-2.18, 1.43),
                          (-2.06, 1.675), (-1.80, 1.715), (-0.50, 1.732), (0.25, 1.728),
                          (0.42, 1.705), (0.80, 1.44), (1.25, 1.12), (1.43, 1.112),
                          (2.00, 1.08), (2.29, 1.03), (2.40, 0.96)]),
            'rail_z': Curve([(-2.37, 1.05), (-2.335, 1.08), (-2.30, 1.10), (-2.18, 1.40),
                             (-2.06, 1.635), (-1.80, 1.672), (-0.50, 1.69), (0.25, 1.686),
                             (0.42, 1.665), (0.80, 1.405), (1.25, 1.10), (1.43, 1.09),
                             (2.00, 1.055), (2.29, 1.0), (2.40, 0.93)]),
            'rail_x': Curve([(-2.37, 0.74), (-2.30, 0.79), (-2.06, 0.74), (-1.00, 0.735),
                             (0.42, 0.73), (1.25, 0.86), (1.43, 0.875), (2.15, 0.86),
                             (2.40, 0.78)]),
            'belt': Curve([(-2.37, 1.02), (-2.30, 1.07), (-2.06, 1.15), (-1.60, 1.17),
                           (-0.10, 1.155), (1.10, 1.115), (1.25, 1.05), (1.43, 1.035),
                           (2.00, 0.995), (2.29, 0.94), (2.40, 0.87)]),
            'plan': Curve([(-2.37, 0.865), (-2.31, 0.93), (-2.12, 0.965), (-1.43, 0.975),
                           (0.00, 0.975), (1.43, 0.975), (2.05, 0.955), (2.30, 0.905),
                           (2.40, 0.84)]),
            'shelf': Curve([(-2.20, 0.06), (-1.60, 0.085), (0.60, 0.085), (1.18, 0.05)]),
            'bottom': Curve([(-2.37, 0.48), (-2.17, 0.37), (-1.90, 0.29), (-1.00, 0.27),
                             (1.00, 0.27), (1.90, 0.29), (2.20, 0.34), (2.40, 0.41)]),
            'tuck': Curve([(-2.37, 0.035), (-1.00, 0.05), (0.90, 0.05), (2.40, 0.045)]),
        },
        'nose_cap': [('lamp_head', 4, 8, GLASS, BELT + 2),
                     ('lamp_indicator_r', 6, 8, BELT + 2, BELT + 3),
                     ('grille', 0, 4, GLASS + 1, BELT + 5), ('grille', 0, 6, BELT + 6, BELT + 8)],
        # Tall corner lamps: tail over brake over indicator over reverse, in one housing.
        'tail_cap': [('lamp_tail', 5, 8, GLASS, BELT + 1), ('lamp_brake', 5, 8, BELT + 1, BELT + 2),
                     ('lamp_indicator_r', 5, 8, BELT + 2, BELT + 3),
                     ('lamp_reverse', 5, 8, BELT + 3, BELT + 4)],
        # Dark cladding: the two lowest strips all round; blacked-out rear pillars (the
        # floating roof).
        'paint': [(('tail', 'nose'), (LAST - 2, LAST), 'trim'),
                  (('deck', 'quarter_rear'), (B.COL_RAIL + 1, GLASS), 'trim')],
        'exhausts': [0.55], 'exhaust_z': 0.40, 'plate_f_z': 0.56, 'plate_r_z': 0.80,
        'cabin': {'rear': -2.05, 'front': 1.15, 'half_width': 0.86, 'floor': 0.40, 'belt': 1.06,
                  'seat_x': 0.40, 'seat_y': 0.02, 'rear_seat_y': -0.86, 'shelf': 0.3},
        'lod1': 4700, 'lod2': 1150,
    }


def roof_rails(spec, mats):
    """The right roof rail: a dark tube on two feet along the roof's edge."""
    curves = spec['curves']
    x = 0.82 * curves['rail_x'](-0.8)

    def roof(y):
        top, rail_x, rail_z = curves['top'](y), curves['rail_x'](y), curves['rail_z'](y)
        return top - (top - rail_z) * min(1.0, x / rail_x) ** spec['crown_power']

    path = [(x, y, roof(y) + 0.045) for y in (-1.86, -1.5, -0.8, -0.1, 0.3)]
    rail = build.tube('roof_rail', path, radius=0.014, segments=8, up=(0.0, 0.0, 1.0))
    scene.set_material(rail, mats['trim'])
    feet = []
    for y in (-1.84, 0.28):
        foot = build.box(f'roof_rail_foot{y}', (0.035, 0.09, 0.05), location=(x, y, roof(y) + 0.02))
        scene.set_material(foot, mats['trim'])
        feet.append(foot)
    return _mesh.tagged([rail] + feet, 1)


def fittings(shell, spec, mats):
    return {'lod0': roof_rails(spec, mats)}


SPEC = spec()
SPEC['fittings'] = fittings


def make(a):
    _car.make_car(a, SPEC)


def assemble(a):
    _car.assemble_car(a)
