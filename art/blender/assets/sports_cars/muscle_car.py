"""Muscle car (the Holloway Thunderhead of the vehicle catalogue): an original two-door,
four-seat, front-engined muscle car.

Long and upright: 4.92 m long, 1.93 m wide and 1.36 m high on a 2.90 m wheelbase. A long flat
hood with a raised power bulge down its middle running to a tall, square nose with a full-width
recessed grille holding four round lamps; a high, straight shoulder that kicks up over a wide
rear haunch; a fastback roof sloping into a short flat deck; a square tail with a full-width
dark lamp panel (tail over brake, indicator, reverse, a centre light bar) above a body-colour
bumper with two pairs of tail pipes. Fat tyres fill wide, shallow-flared arches.

The car is a set of curves and marks (see _body) handed to the shared hero-car builder (_car),
like sports_coupe; the rear bench adds anchor_seat_passenger_2 and _3.

Budget: a hero vehicle with the full node contract (wheels, doors, lids, bumpers, panes and
lamp groups as separate nodes and materials), a rear bench and four round lamps needs more
than the default vehicle budget at level 0: 26,000 triangles and 44 draw calls.

Blender axes: Z up, the car faces +Y, right side +X, origin on the ground at the centre of the
wheelbase.
"""
import _car
from _curves import Curve

ASSET = {
    'id': 'muscle_car',
    'kind': 'vehicle',
    'atlas': 2048,          # a hero car: base colour 2048, ORM and normal 1024 (_car.make_car)
    'budget': {'triangles': 26000, 'draws': 44},
}

SPEC = {
    'color': '#D9631E',
    'leather': (0.045, 0.04, 0.036),
    'width': 1.93, 'height': 1.36, 'clearance': 0.14,
    'axle_r': -1.45, 'axle_f': 1.45,
    'wheel_radius': 0.35, 'tyre_width': 0.275, 'track': 1.62, 'arch_radius': 0.40,
    'flare': 0.022,
    'tail_bow': 0.04, 'nose_bow': 0.04, 'tail_tuck': 0.10, 'nose_tuck': 0.05,
    'side_vent': False,
    'crown_power': 3.2,         # a flatter roof and hood with firmer edges than the coupe
    'marks': {
        'tail': -2.36, 'deck': -1.62, 'quarter_rear': -1.12, 'roof_rear': -0.75,
        'door_rear': -0.42, 'roof_front': 0.18, 'glass_front': 0.50, 'door_front': 0.80,
        'cowl': 0.86, 'lamp_rear': 2.20, 'hood_front': 2.40, 'lamp_front': 2.42, 'nose': 2.48,
    },
    'curves': {
        'top': Curve((-2.36, 0.985), (-2.24, 1.002), (-1.62, 1.006), (-1.10, 1.205),
                     (-0.75, 1.330), (-0.25, 1.360), (0.18, 1.345), (0.86, 1.000),
                     (1.45, 0.985), (2.20, 0.968), (2.48, 0.935)),
        'rail_z': Curve((-2.36, 0.962), (-2.24, 0.985), (-1.62, 0.992), (-1.10, 1.170),
                        (-0.75, 1.288), (-0.25, 1.316), (0.18, 1.300), (0.86, 0.982),
                        (1.45, 0.972), (2.20, 0.955), (2.48, 0.920)),
        'rail_x': Curve((-2.36, 0.78), (-2.24, 0.86), (-1.62, 0.89), (-1.10, 0.72),
                        (-0.75, 0.62), (-0.25, 0.60), (0.18, 0.61), (0.86, 0.83),
                        (1.45, 0.865), (2.20, 0.862), (2.48, 0.82)),
        'belt': Curve((-2.36, 0.930), (-1.95, 0.952), (-1.45, 0.968), (-0.90, 0.925),
                      (0.0, 0.905), (0.86, 0.900), (1.45, 0.905), (2.20, 0.905), (2.48, 0.885)),
        'plan': Curve((-2.36, 0.82), (-2.24, 0.93), (-1.90, 0.965), (-1.45, 0.965),
                      (-0.80, 0.938), (0.0, 0.930), (0.86, 0.935), (1.45, 0.945),
                      (2.20, 0.935), (2.40, 0.905), (2.48, 0.85)),
        'shelf': Curve((-1.95, 0.03), (-1.40, 0.11), (-0.75, 0.10), (0.45, 0.09), (0.95, 0.03)),
        'bottom': Curve((-2.36, 0.38), (-2.15, 0.30), (-1.90, 0.24), (-0.90, 0.19), (0.90, 0.19),
                        (1.90, 0.22), (2.30, 0.26), (2.48, 0.29)),
        'tuck': Curve((-2.36, 0.03), (-1.0, 0.06), (0.9, 0.06), (2.48, 0.03)),
        # A negative bubble raises the middle of the hood: the power bulge.
        'bubble': Curve((-2.36, 0.0), (0.92, 0.0), (1.10, -0.034), (2.10, -0.034), (2.36, 0.0)),
        'scallop': Curve((-1.0, 0.0), (-0.4, 0.008), (0.6, 0.012), (1.0, 0.0)),
    },
    # Dark areas of the end faces: (z low, z high, from, to as fractions of the half width, material).
    'tail_bands': [(0.79, 0.91, 0.0, 0.981, 'trim'), (0.38, 0.47, 0.0, 0.831, 'trim')],
    'nose_bands': [(0.50, 0.76, 0.0, 0.981, 'trim'), (0.29, 0.37, 0.0, 0.707, 'trim')],
    # Full-width lamp panel: tail over brake outboard, the indicator and the reverse lamp, then
    # a centre light bar its mirror image continues across the car.
    'tail_lamps': [(0.44, 0.78, 0.808, 0.892, 'lamp_tail', 'lamp_brake', 0.012),
                   (0.35, 0.44, 0.808, 0.892, 'lamp_indicator_r', 'lamp_indicator_r', 0.012),
                   (0.25, 0.35, 0.808, 0.892, 'lamp_reverse', 'lamp_reverse', 0.012),
                   (0.0, 0.25, 0.842, 0.858, 'lamp_tail', 'lamp_tail', 0.008)],
    'tail_lamp_z': 0.85,
    'grille': (0.40, 0.52, 0.74, 4),            # slats: half width, z low, z high, count
    'round_lamps': [(0.53, 0.63, 0.068), (0.71, 0.63, 0.074)],   # x, z, radius (inner, outer)
    'exhausts': (0.47, 0.57), 'exhaust_x': 0.52, 'exhaust_z': 0.42, 'exhaust_radius': 0.038,
    'diffuser_fins': (),
    'plate_f_z': 0.43, 'plate_r_z': 0.66,
    'cabin': {'rear': -1.20, 'front': 0.80, 'half_width': 0.80, 'floor': 0.19, 'belt': 0.92,
              'seat_x': 0.40, 'seat_y': -0.05, 'rear_seat_x': 0.38, 'rear_seat_y': -0.80},
}


def make(a):
    _car.make_car(a, SPEC)


def assemble(a):
    _car.assemble_car(a)
