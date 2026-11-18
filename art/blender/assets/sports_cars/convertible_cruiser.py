"""Convertible cruiser (the Delmara Ocaso of the vehicle catalogue): an original two-door,
four-seat classic convertible, shown with the roof down.

Very long and low: 5.42 m long, 1.99 m wide and 1.37 m high over the windscreen on a 3.16 m
wheelbase. A long flat hood between flat-topped fenders running out to round headlamps set in
the corners of a broad nose with an oval dark grille over a broad chrome bumper; a wraparound
windscreen without a header rail; an open cockpit with two front seats and a rear bench behind
deep door tops; a dark tonneau over the folded roof on the long flat deck; a plain tail with
three round lamps in chrome bezels each side (tail over brake, indicator, reverse) over a broad
chrome bumper and two tail pipes.

The car is a set of curves and marks (see _body) handed to the shared hero-car builder (_car)
with spec 'open_top': the cockpit cells of the shell are left open, the doors carry no glass,
and there is no rear or quarter window (window_front is the only pane).

Budget: a hero vehicle with the full node contract (wheels, doors, lids, bumpers, the
windscreen and the lamp groups as separate nodes and materials), an open interior with a rear
bench and eight round lamps needs more than the default vehicle budget at level 0: 26,000
triangles and 44 draw calls.

Blender axes: Z up, the car faces +Y, right side +X, origin on the ground at the centre of the
wheelbase.
"""
import _car
from _curves import Curve

ASSET = {
    'id': 'convertible_cruiser',
    'kind': 'vehicle',
    'atlas': 2048,          # a hero car: base colour 2048, ORM and normal 1024 (_car.make_car)
    'budget': {'triangles': 26000, 'draws': 44},
}

SPEC = {
    'color': '#8FD3C4',
    'leather': (0.55, 0.45, 0.33),          # cream-tan leather: the open cabin is on show
    'tonneau': (0.42, 0.36, 0.27),
    'open_top': True,
    'width': 1.99, 'height': 1.37, 'clearance': 0.15,
    'axle_r': -1.58, 'axle_f': 1.58,
    'wheel_radius': 0.36, 'tyre_width': 0.235, 'track': 1.64, 'arch_radius': 0.41,
    'flare': 0.01,
    'tail_bow': 0.04, 'nose_bow': 0.05, 'tail_tuck': 0.08, 'nose_tuck': 0.05,
    'side_vent': False,
    'crown_power': 4.0,         # flat hood and deck; the windscreen wraps down at its sides
    'glass_bow': 0.0,
    'marks': {
        # (quarter_rear only places a row: there is no quarter window)
        'tail': -2.66, 'deck': -2.05, 'quarter_rear': -1.30, 'roof_rear': -1.20, 'door_rear': -0.40,
        'roof_front': 0.42, 'glass_front': 0.62, 'door_front': 0.80, 'cowl': 0.86,
        'lamp_rear': 2.45, 'hood_front': 2.60, 'lamp_front': 2.62, 'nose': 2.68,
    },
    'curves': {
        'top': Curve((-2.66, 0.968), (-2.50, 0.990), (-1.20, 0.995), (0.31, 1.000),
                     (0.42, 1.370), (0.86, 1.000), (1.58, 0.992), (2.40, 0.978), (2.68, 0.945)),
        'rail_z': Curve((-2.66, 0.950), (-2.50, 0.978), (-1.20, 0.984), (0.31, 0.984),
                        (0.42, 1.000), (0.86, 0.978), (1.58, 0.972), (2.40, 0.958),
                        (2.68, 0.925)),
        'rail_x': Curve((-2.66, 0.82), (-2.50, 0.90), (-1.40, 0.90), (-1.20, 0.845),
                        (0.31, 0.840), (0.86, 0.86), (1.58, 0.90), (2.40, 0.90), (2.68, 0.83)),
        'belt': Curve((-2.66, 0.935), (-2.0, 0.958), (-1.20, 0.958), (0.0, 0.950),
                      (0.86, 0.948), (1.58, 0.948), (2.40, 0.932), (2.68, 0.905)),
        'plan': Curve((-2.66, 0.86), (-2.55, 0.96), (-1.58, 0.99), (0.0, 0.985),
                      (1.58, 0.995), (2.45, 0.97), (2.68, 0.88)),
        'shelf': Curve((-2.0, 0.03), (-1.35, 0.10), (0.42, 0.10), (0.95, 0.03)),
        'bottom': Curve((-2.66, 0.42), (-2.45, 0.32), (-2.20, 0.25), (-1.0, 0.22), (1.0, 0.22),
                        (2.20, 0.25), (2.50, 0.30), (2.68, 0.34)),
        'tuck': Curve((-2.66, 0.03), (-1.0, 0.05), (1.0, 0.05), (2.68, 0.03)),
        'scallop': Curve((-1.6, 0.0), (-1.0, 0.006), (1.0, 0.006), (1.5, 0.0)),
    },
    # Dark and bright areas of the end faces: (z low, z high, from, to as fractions of the half
    # width, material). Broad chrome bumpers at both ends, an oval dark grille in the nose.
    'tail_bands': [(0.42, 0.53, 0.0, 1.0, 'chrome')],
    'nose_bands': [(0.34, 0.45, 0.0, 1.0, 'chrome'), (0.49, 0.67, 0.0, 0.707, 'trim')],
    # Round tail lamps in chrome bezels: x, z, radius, ring lamp, core lamp (outboard first).
    'round_tail_lamps': [(0.66, 0.80, 0.075, 'lamp_tail', 'lamp_brake'),
                         (0.49, 0.80, 0.058, 'lamp_indicator_r', 'lamp_indicator_r'),
                         (0.35, 0.80, 0.045, 'lamp_reverse', 'lamp_reverse')],
    'tail_lamp_z': 0.80,
    'grille': (0.50, 0.50, 0.66, 3),            # slats: half width, z low, z high, count
    'round_lamps': [(0.72, 0.70, 0.085)],       # x, z, radius
    'exhausts': (0.60,), 'exhaust_x': 0.60, 'exhaust_z': 0.45, 'exhaust_radius': 0.036,
    'diffuser_fins': (),
    'plate_f_z': 0.395, 'plate_r_z': 0.62,
    'cabin': {'rear': -1.15, 'front': 0.80, 'half_width': 0.83, 'floor': 0.22, 'belt': 0.97,
              'seat_x': 0.40, 'seat_y': 0.0, 'rear_seat_x': 0.40, 'rear_seat_y': -0.75},
}


def make(a):
    _car.make_car(a, SPEC)


def assemble(a):
    _car.assemble_car(a)
