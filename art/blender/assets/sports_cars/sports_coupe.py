"""Sports coupe (the Zarco Vendaval of the vehicle catalogue): an original two-seat, front-engined
coupe and the car of the cover picture.

A low wedge 4.50 m long, 1.88 m wide and 1.27 m high on a 2.62 m wheelbase: a long hood, a
narrow cabin set back towards the rear wheels, a fastback roof with a shallow double bubble
running into a short ducktail deck, a waisted plan with wide haunches over the rear arches, a
scalloped side with an outlet behind the front wheel, a raked tail with a dark panel holding
twin round lamps each side over a diffuser with four tail pipes, and slim headlamps on the
fender crests above a wide grille.

The car is a set of curves and marks (see _body) handed to the shared hero-car builder (_car):
the shell is one lofted half grid cut into the panels the game moves (hood, trunk, doors,
bumpers, the four glass panes), with one baked wheel used four times. lod1 and lod2 are single
merged meshes; the moving parts hang under the node lod0.

Budget: a hero vehicle with the full node contract (wheels, doors, lids, bumpers, panes and
lamp groups as separate nodes and materials) needs more triangles and draw calls at level 0
than the default vehicle budget: 22,000 triangles and 40 draw calls.

Blender axes: Z up, the car faces +Y, right side +X, origin on the ground at the centre of the
wheelbase.
"""
import _car
from _curves import Curve

ASSET = {
    'id': 'sports_coupe',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 22000, 'draws': 40},
}

SPEC = {
    'color': '#C2261F',
    'width': 1.88, 'height': 1.27, 'clearance': 0.11,
    'axle_r': -1.31, 'axle_f': 1.31,
    'wheel_radius': 0.35, 'tyre_width': 0.265, 'track': 1.58, 'arch_radius': 0.395,
    'tail_bow': 0.09, 'nose_bow': 0.09, 'tail_tuck': 0.10, 'nose_tuck': 0.05,
    'marks': {
        'tail': -2.20, 'deck': -1.66, 'quarter_rear': -1.20, 'door_rear': -0.60,
        'roof_rear': -0.64, 'roof_front': 0.10, 'glass_front': 0.50, 'door_front': 0.72,
        'cowl': 0.82, 'lamp_rear': 1.70, 'lamp_front': 1.98, 'hood_front': 1.98, 'nose': 2.12,
    },
    'curves': {
        'top': Curve((-2.20, 0.915), (-2.08, 0.918), (-1.88, 0.890), (-1.66, 0.925),
                     (-1.10, 1.150), (-0.64, 1.245), (-0.30, 1.268), (0.10, 1.245),
                     (0.82, 0.905), (1.31, 0.845), (1.75, 0.755), (1.98, 0.655), (2.12, 0.560)),
        'rail_z': Curve((-2.20, 0.885), (-2.08, 0.888), (-1.88, 0.872), (-1.66, 0.905),
                        (-1.10, 1.115), (-0.64, 1.200), (-0.30, 1.222), (0.10, 1.203),
                        (0.82, 0.870), (1.31, 0.825), (1.75, 0.730), (1.98, 0.628), (2.12, 0.530)),
        'rail_x': Curve((-2.20, 0.60), (-2.05, 0.745), (-1.80, 0.835), (-1.66, 0.835),
                        (-1.10, 0.66), (-0.64, 0.585), (-0.30, 0.572), (0.10, 0.575),
                        (0.82, 0.775), (1.31, 0.825), (1.75, 0.795), (1.98, 0.725), (2.12, 0.585)),
        'belt': Curve((-2.20, 0.835), (-1.85, 0.845), (-1.31, 0.868), (-0.75, 0.842),
                      (0.0, 0.825), (0.82, 0.812), (1.31, 0.795), (1.75, 0.705), (1.98, 0.598),
                      (2.12, 0.500)),
        'plan': Curve((-2.20, 0.66), (-2.08, 0.80), (-1.80, 0.900), (-1.31, 0.925), (-0.60, 0.885),
                      (0.30, 0.875), (0.90, 0.895), (1.31, 0.915), (1.75, 0.89), (1.98, 0.81),
                      (2.12, 0.64)),
        'shelf': Curve((-1.80, 0.03), (-1.25, 0.13), (-0.60, 0.085), (0.45, 0.075), (0.90, 0.03)),
        'bottom': Curve((-2.20, 0.36), (-1.95, 0.29), (-1.70, 0.20), (-0.90, 0.150), (0.90, 0.150),
                        (1.70, 0.160), (2.12, 0.175)),
        'tuck': Curve((-2.20, 0.04), (-1.0, 0.085), (0.9, 0.085), (2.12, 0.05)),
        'bubble': Curve((-1.3, 0.0), (-0.6, 0.02), (-0.1, 0.02), (0.5, 0.0)),
        'scallop': Curve((-0.95, 0.0), (-0.5, 0.012), (0.2, 0.028), (0.74, 0.04), (0.90, 0.0)),
    },
    # Dark areas of the end faces: (z low, z high, from, to as fractions of the half width, material).
    'tail_bands': [(0.66, 0.80, 0.0, 0.924, 'trim'), (0.36, 0.52, 0.0, 0.924, 'trim')],
    'nose_bands': [(0.25, 0.40, 0.0, 0.707, 'trim'), (0.25, 0.40, 0.831, 0.981, 'trim'),
                   (0.17, 0.215, 0.0, 1.0, 'trim')],
    'tail_lamps': [(0.50, 'lamp_tail', 'lamp_brake'), (0.335, 'lamp_indicator_r', 'lamp_reverse')],
    'tail_lamp_z': 0.73, 'tail_lamp_radius': 0.064,
    'exhausts': (0.33, 0.45), 'exhaust_x': 0.39, 'exhaust_z': 0.445, 'exhaust_radius': 0.042,
    'diffuser_fins': (0.10, 0.22, 0.56),
    'plate_f_z': 0.328, 'plate_r_z': 0.587,
    'cabin': {'rear': -1.0, 'front': 0.78, 'half_width': 0.76, 'floor': 0.16, 'belt': 0.80,
              'seat_x': 0.37, 'seat_y': -0.38},
}


def make(a):
    _car.make_car(a, SPEC)


def assemble(a):
    _car.assemble_car(a)
