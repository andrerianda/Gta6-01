"""Supercar (the Ravello Saeta of the vehicle catalogue): an original two-seat, mid-engined
supercar.

Knee-high and wide: 4.58 m long, 1.99 m wide and 1.15 m high on a 2.68 m wheelbase. A low,
sharp nose with slim headlamps on the fender crests over a splitter and three dark intakes; a
fast windscreen in a cab-forward canopy pinched in hard above huge rear haunches; a deep
scallop down each flank ending in an air intake ahead of the rear wheel; a long smoked glass
engine cover (window_rear) sloping into a short deck with a lip; a tapered tail with a slim
full-width light blade over a dark diffuser with fins and a central pair of tail pipes.

The car is a set of curves and marks (see _body) handed to the shared hero-car builder (_car),
like sports_coupe. The rear lid (over the engine bay's tail, behind the glass cover) is trunk;
the front lid is hood.

Budget: a hero vehicle with the full node contract (wheels, doors, lids, bumpers, panes and
lamp groups as separate nodes and materials) needs more triangles and draw calls at level 0
than the default vehicle budget: 23,000 triangles and 40 draw calls.

Blender axes: Z up, the car faces +Y, right side +X, origin on the ground at the centre of the
wheelbase.
"""
import _car
from _curves import Curve

ASSET = {
    'id': 'supercar',
    'kind': 'vehicle',
    'atlas': 2048,          # a hero car: base colour 2048, ORM and normal 1024 (_car.make_car)
    'budget': {'triangles': 23000, 'draws': 40},
}

SPEC = {
    'color': '#F0603A',
    'leather': (0.05, 0.045, 0.042),
    'width': 1.99, 'height': 1.15, 'clearance': 0.10,
    'axle_r': -1.34, 'axle_f': 1.34,
    'wheel_radius': 0.35, 'tyre_width': 0.295, 'track': 1.70, 'arch_radius': 0.395,
    'flare': 0.03,
    'tail_bow': 0.06, 'nose_bow': 0.10, 'tail_tuck': 0.12, 'nose_tuck': 0.05,
    'side_vent': False,
    'side_intake': ('sill_rear', 'door_rear'),
    'marks': {
        'tail': -2.24, 'deck': -1.95, 'quarter_rear': -1.05, 'roof_rear': -0.58,
        'door_rear': -0.55, 'roof_front': -0.10, 'glass_front': 0.40, 'door_front': 0.62,
        # The lamp starts clear of the front arch (inside it the housing read as a dark patch
        # on the fender top, apart from the lit strip).
        'cowl': 0.70, 'lamp_rear': 1.84, 'lamp_front': 2.08, 'hood_front': 2.10, 'nose': 2.18,
    },
    'curves': {
        'top': Curve((-2.24, 0.880), (-2.10, 0.905), (-1.95, 0.892), (-1.40, 0.985),
                     (-0.58, 1.130), (-0.30, 1.150), (-0.10, 1.140), (0.70, 0.815),
                     (1.34, 0.808), (1.80, 0.690), (2.05, 0.570), (2.18, 0.440)),
        'rail_z': Curve((-2.24, 0.860), (-2.10, 0.885), (-1.95, 0.876), (-1.40, 0.955),
                        (-0.58, 1.095), (-0.30, 1.114), (-0.10, 1.102), (0.70, 0.792),
                        (1.34, 0.796), (1.80, 0.675), (2.05, 0.554), (2.18, 0.426)),
        'rail_x': Curve((-2.24, 0.74), (-2.10, 0.86), (-1.95, 0.92), (-1.40, 0.84),
                        (-0.58, 0.58), (-0.30, 0.55), (-0.10, 0.56), (0.70, 0.80),
                        (1.34, 0.86), (1.80, 0.84), (2.05, 0.74), (2.18, 0.55)),
        'belt': Curve((-2.24, 0.800), (-1.95, 0.822), (-1.34, 0.845), (-0.70, 0.790),
                      # Over the front wheel the shoulder stays 3 cm above the arch's crown
                      # (0.745): lower, the arch opening cut through the fender top.
                      (0.0, 0.742), (0.70, 0.745), (1.34, 0.776), (1.80, 0.650), (2.05, 0.530),
                      (2.18, 0.400)),
        'plan': Curve((-2.24, 0.78), (-2.12, 0.92), (-1.85, 0.995), (-1.34, 0.995),
                      (-0.70, 0.935), (0.0, 0.912), (0.70, 0.935), (1.34, 0.965),
                      (1.80, 0.94), (2.05, 0.86), (2.18, 0.70)),
        'shelf': Curve((-1.95, 0.03), (-1.40, 0.18), (-0.58, 0.20), (0.0, 0.14), (0.70, 0.04)),
        'bottom': Curve((-2.24, 0.34), (-2.05, 0.26), (-1.80, 0.17), (-0.90, 0.12),
                        (0.90, 0.12), (1.70, 0.13), (2.18, 0.15)),
        'tuck': Curve((-2.24, 0.04), (-1.0, 0.09), (0.9, 0.09), (2.18, 0.05)),
        'bubble': Curve((-1.2, 0.0), (-0.5, 0.015), (-0.1, 0.015), (0.4, 0.0)),
        # Deep in front of the rear wheel (the intake), fading out along the door.
        'scallop': Curve((-1.0, 0.0), (-0.80, 0.036), (-0.35, 0.028), (0.35, 0.0)),
    },
    # Dark areas of the end faces: (z low, z high, from, to as fractions of the half width, material).
    'tail_bands': [(0.76, 0.85, 0.0, 0.924, 'trim'), (0.34, 0.52, 0.0, 0.924, 'trim')],
    'nose_bands': [(0.17, 0.33, 0.0, 0.556, 'trim'), (0.17, 0.35, 0.707, 0.924, 'trim'),
                   (0.15, 0.17, 0.0, 1.0, 'trim')],
    # The slim light blade across the tail: tail over brake outboard, the indicator and the
    # reverse lamp, then a thin centre bar its mirror image continues across the car.
    'tail_lamps': [(0.36, 0.72, 0.795, 0.832, 'lamp_tail', 'lamp_brake', 0.012),
                   (0.28, 0.36, 0.795, 0.832, 'lamp_indicator_r', 'lamp_indicator_r', 0.012),
                   (0.20, 0.28, 0.795, 0.832, 'lamp_reverse', 'lamp_reverse', 0.012),
                   (0.0, 0.20, 0.808, 0.819, 'lamp_tail', 'lamp_tail', 0.008)],
    'tail_lamp_z': 0.814,
    'splitter': (0.06, 0.24, 0.135, 0.155),     # reach ahead of the chin, depth, z low, z high
    'grille': (0.30, 0.20, 0.31, 2),            # slats: half width, z low, z high, count
    'head_housing': (1, 3),                     # bright strip columns, from the crest rail
    'head_projector': 0.022,                    # projector radius under the head lens
    'exhausts': (0.075,), 'exhaust_x': 0.075, 'exhaust_z': 0.45, 'exhaust_radius': 0.045,
    'diffuser_fins': (0.17, 0.30, 0.44, 0.58),
    'plate_f_z': 0.27, 'plate_r_z': 0.60,
    'cabin': {'rear': -0.85, 'front': 0.55, 'half_width': 0.74, 'floor': 0.11, 'belt': 0.74,
              'seat_x': 0.36, 'seat_y': -0.35},
}


def make(a):
    _car.make_car(a, SPEC)


def assemble(a):
    _car.assemble_car(a)
