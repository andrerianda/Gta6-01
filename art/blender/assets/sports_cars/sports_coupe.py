"""Sports coupe (the Zarco Vendaval of the vehicle catalogue): an original two-seat, front-engined
coupe and the car of the cover picture.

A low wedge 4.50 m long, 1.90 m wide and 1.25 m high on a 2.62 m wheelbase: a long hood, a
narrow cabin with strong tumblehome set back towards the rear wheels, a fastback roof with a
shallow double bubble running into a short ducktail deck, a low belt that kicks up over wide,
flared haunches, a scalloped side with an outlet behind the front wheel, a raked, under-cut
tail with a dark panel carrying slim lamp units joined by a light bar over a diffuser with
four tail pipes, and slim headlamps on the fender crests above a wide grille and a splitter.

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
    'atlas': 2048,          # the cover car: base colour 2048, ORM and normal 1024 (_car.make_car)
    'budget': {'triangles': 22000, 'draws': 40},
}

SPEC = {
    'color': '#C2261F',
    'width': 1.90, 'height': 1.25, 'clearance': 0.11,
    'axle_r': -1.31, 'axle_f': 1.31,
    'wheel_radius': 0.35, 'tyre_width': 0.265, 'track': 1.58, 'arch_radius': 0.395,
    'flare': 0.02,
    'tail_bow': 0.09, 'nose_bow': 0.09, 'tail_tuck': 0.13, 'nose_tuck': 0.05,
    'marks': {
        'tail': -2.20, 'deck': -1.66, 'quarter_rear': -1.20, 'door_rear': -0.60,
        'roof_rear': -0.64, 'roof_front': 0.10, 'glass_front': 0.50, 'door_front': 0.72,
        'cowl': 0.82, 'lamp_rear': 1.70, 'lamp_front': 1.98, 'hood_front': 1.98, 'nose': 2.12,
    },
    'curves': {
        'top': Curve((-2.20, 0.915), (-2.08, 0.918), (-1.88, 0.890), (-1.66, 0.922),
                     (-1.10, 1.135), (-0.64, 1.228), (-0.30, 1.250), (0.10, 1.228),
                     (0.82, 0.900), (1.31, 0.840), (1.75, 0.752), (1.98, 0.655), (2.12, 0.560)),
        'rail_z': Curve((-2.20, 0.885), (-2.08, 0.888), (-1.88, 0.872), (-1.66, 0.902),
                        (-1.10, 1.100), (-0.64, 1.183), (-0.30, 1.204), (0.10, 1.186),
                        (0.82, 0.866), (1.31, 0.820), (1.75, 0.727), (1.98, 0.628), (2.12, 0.530)),
        'rail_x': Curve((-2.20, 0.60), (-2.05, 0.745), (-1.80, 0.835), (-1.66, 0.835),
                        (-1.10, 0.645), (-0.64, 0.570), (-0.30, 0.556), (0.10, 0.560),
                        (0.82, 0.775), (1.31, 0.825), (1.75, 0.795), (1.98, 0.725), (2.12, 0.585)),
        'belt': Curve((-2.20, 0.835), (-1.85, 0.848), (-1.31, 0.862), (-0.75, 0.822),
                      (0.0, 0.802), (0.82, 0.792), (1.31, 0.778), (1.75, 0.700), (1.98, 0.598),
                      (2.12, 0.500)),
        'plan': Curve((-2.20, 0.66), (-2.08, 0.80), (-1.80, 0.908), (-1.31, 0.935), (-0.60, 0.880),
                      (0.30, 0.868), (0.90, 0.893), (1.31, 0.913), (1.75, 0.89), (1.98, 0.81),
                      (2.12, 0.64)),
        'shelf': Curve((-1.80, 0.035), (-1.25, 0.15), (-0.60, 0.088), (0.45, 0.075), (0.90, 0.03)),
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
    # Slim lamp units standing off the bowed tail, outboard to the centreline: (x from, x to,
    # z low, z high, upper lens, lower lens, standoff). Tail over brake, then the indicator and
    # the reverse lamp, then a thin light bar that its mirror image continues across the car.
    'tail_lamps': [(0.30, 0.61, 0.708, 0.764, 'lamp_tail', 'lamp_brake', 0.014),
                   (0.215, 0.30, 0.708, 0.764, 'lamp_indicator_r', 'lamp_indicator_r', 0.014),
                   (0.13, 0.215, 0.708, 0.764, 'lamp_reverse', 'lamp_reverse', 0.014),
                   (0.0, 0.13, 0.730, 0.742, 'lamp_tail', 'lamp_tail', 0.008)],
    'tail_lamp_z': 0.736,
    'splitter': (0.05, 0.20, 0.155, 0.176),     # reach ahead of the chin, depth, z low, z high
    'grille': (0.40, 0.25, 0.40, 3),            # slats: half width, z low, z high, count
    'head_housing': (1, 3),                     # bright strip columns, from the crest rail
    'head_projector': 0.026,                    # projector radius under the head lens
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
