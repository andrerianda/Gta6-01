"""Compact hatch (the Tavira Pico of the vehicle catalogue): an original five-door city hatchback,
cheap, cheerful and everywhere in traffic.

3.94 m long, 1.72 m wide and 1.49 m high on a 2.51 m wheelbase with 0.30 m wheels and 0.15 m of
ground clearance: wheels pushed out to the corners under short overhangs, a short sloping
bonnet between big friendly headlamps that wrap round the corners, a tall rounded glasshouse
with a belt that rises towards the tail, a steep rear screen over a near-vertical tailgate,
and a high-mounted lamp bar joining the two corner tail lamps across the tailgate.

Built on the everyday cars' kit (_body, _car) with its own curves, like the SUV: the tailgate
face is the body's tail cap (it does not open; `trunk` is the lip under the rear screen).

Budget: the everyday cars' node contract and the lamp units: 21,000 triangles, 40 draw calls
and 1,100,000 bytes (the geometry is not compressed).

Blender axes: Z up, the car faces +Y, right side +X, origin on the ground at the centre of the
wheelbase; the driver sits on the left (-X).
"""
import _body as B
import _car
from _shape import Curve

ASSET = {
    'id': 'compact_hatch',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 21000, 'draws': 40, 'bytes': 1100000},
}

GLASS, BELT = B.COL_GLASS_BASE, B.COL_BELT

SPEC = {
    'color': '#3A8FB7', 'atlas': 1024,
    'width': 1.72, 'height': 1.49, 'clearance': 0.15,
    'axle_r': -1.255, 'axle_f': 1.255,
    'wheel_radius': 0.30, 'tyre_width': 0.195, 'track': 1.48, 'arch_radius': 0.335,
    'wheel': {'rim_ratio': 0.66, 'spokes': 5},
    'tail_bow': 0.04, 'nose_bow': 0.07, 'tail_bulge': 0.015, 'nose_bulge': 0.025,
    'crown_power': 2.6,
    # First sheet: read as a small MPV (windscreen 0.8 m long from 1.10): the screen moved back
    # 0.1 to 0.12 m for a longer bonnet, the roof drops a little towards the tailgate; the
    # parcel shelf (0.3 m) poked out through the tailgate: 0.13 m.
    'marks': {
        'tail': -1.815, 'deck': -1.755, 'lamp_tail_front': -1.70, 'roof_rear': -1.56,
        'quarter_rear': -1.47, 'pillar_b': -0.20, 'door_rear': -0.12, 'roof_front': 0.18,
        'glass_front': 0.80, 'door_front': 0.88, 'cowl': 0.99, 'lamp_rear': 1.64,
        'hood_front': 1.88, 'nose': 1.975,
    },
    'curves': {
        'top': Curve([(-1.815, 0.99), (-1.785, 1.015), (-1.755, 1.03), (-1.66, 1.24),
                      (-1.56, 1.41), (-1.30, 1.458), (-0.50, 1.484), (0.0, 1.49),
                      (0.18, 1.474), (0.48, 1.335), (0.78, 1.12), (0.99, 0.968), (1.255, 0.95),
                      (1.70, 0.895), (1.88, 0.835), (1.975, 0.75)]),
        'rail_z': Curve([(-1.815, 0.965), (-1.785, 0.99), (-1.755, 1.005), (-1.66, 1.21),
                         (-1.56, 1.375), (-1.30, 1.418), (-0.50, 1.44), (0.0, 1.445),
                         (0.18, 1.43), (0.48, 1.30), (0.78, 1.09), (0.99, 0.945),
                         (1.255, 0.927), (1.70, 0.87), (1.88, 0.81), (1.975, 0.725)]),
        'rail_x': Curve([(-1.815, 0.68), (-1.755, 0.72), (-1.56, 0.66), (-0.40, 0.635),
                         (0.18, 0.63), (0.99, 0.76), (1.40, 0.775), (1.80, 0.74), (1.975, 0.62)]),
        'belt': Curve([(-1.815, 0.94), (-1.755, 0.96), (-1.56, 1.01), (-1.00, 1.0),
                       (-0.10, 0.975), (0.88, 0.94), (0.99, 0.89), (1.255, 0.876),
                       (1.70, 0.825), (1.88, 0.765), (1.975, 0.68)]),
        'plan': Curve([(-1.815, 0.76), (-1.77, 0.82), (-1.62, 0.85), (-1.255, 0.86), (0.0, 0.86),
                       (1.255, 0.86), (1.65, 0.845), (1.86, 0.80), (1.975, 0.70)]),
        'shelf': Curve([(-1.75, 0.05), (-1.40, 0.075), (0.40, 0.075), (0.95, 0.035)]),
        'bottom': Curve([(-1.815, 0.36), (-1.65, 0.25), (-1.40, 0.19), (-0.80, 0.175),
                         (0.80, 0.175), (1.45, 0.19), (1.80, 0.22), (1.975, 0.26)]),
        'tuck': Curve([(-1.815, 0.03), (-0.80, 0.05), (0.80, 0.05), (1.975, 0.04)]),
    },
    # Big headlamps wrapping the corners over a small upper slot and a wide lower intake.
    'nose_cap': [('lamp_head', 3, 8, GLASS, BELT + 2),
                 ('lamp_indicator_r', 6, 8, BELT + 2, BELT + 3),
                 ('grille', 0, 3, GLASS + 1, BELT + 1), ('grille', 0, 5, BELT + 3, BELT + 6)],
    # Corner tail lamps joined by a high lamp bar across the tailgate.
    'tail_cap': [('lamp_tail', 5, 8, GLASS, BELT + 1), ('lamp_tail', 0, 5, GLASS, GLASS + 1),
                 ('lamp_brake', 5, 8, BELT + 1, BELT + 2),
                 ('lamp_indicator_r', 6, 8, BELT + 2, BELT + 3),
                 ('lamp_reverse', 5, 6, BELT + 2, BELT + 3)],
    'exhausts': [0.42], 'exhaust_z': 0.28, 'plate_f_z': 0.36, 'plate_r_z': 0.62,
    'cabin': {'rear': -1.60, 'front': 0.92, 'half_width': 0.75, 'floor': 0.22, 'belt': 0.94,
              'seat_x': 0.35, 'seat_y': -0.04, 'rear_seat_y': -0.80, 'shelf': 0.13},
    'lod1': 4400, 'lod2': 1000,
}


def make(a):
    _car.make_car(a, SPEC)


def assemble(a):
    _car.assemble_car(a)
