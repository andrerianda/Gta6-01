"""Sports coupe (the Zarco Vendaval of the vehicle catalogue): an original two-seat, front-engined
coupe and the car of the cover picture.

A low wedge 4.46 m long, 1.87 m wide and 1.29 m high on a 2.62 m wheelbase: a long hood, the
cabin set back over the rear wheels, a fastback roof with a shallow double bubble running into
a short ducktail deck, wide haunches over the rear arches, twin round tail lamps each side and
slim headlamps on the fender crests.

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
    'width': 1.87, 'height': 1.29, 'clearance': 0.11,
    'axle_r': -1.31, 'axle_f': 1.31,
    'wheel_radius': 0.34, 'tyre_width': 0.26, 'track': 1.58, 'arch_radius': 0.385,
    'tail_bow': 0.05, 'nose_bow': 0.06,
    'marks': {
        'tail': -2.22, 'deck': -1.62, 'quarter_rear': -1.22, 'door_rear': -0.62,
        'roof_rear': -0.60, 'roof_front': 0.22, 'glass_front': 0.60, 'door_front': 0.80,
        'cowl': 0.92, 'lamp_rear': 1.72, 'lamp_front': 1.98, 'hood_front': 1.98, 'nose': 2.13,
    },
    'curves': {
        'top': Curve((-2.22, 0.925), (-2.10, 0.925), (-1.85, 0.895), (-1.62, 0.935),
                     (-1.05, 1.195), (-0.60, 1.275), (-0.25, 1.290), (0.22, 1.262),
                     (0.92, 0.930), (1.31, 0.855), (1.75, 0.765), (2.00, 0.655), (2.13, 0.545)),
        'rail_z': Curve((-2.22, 0.895), (-2.10, 0.895), (-1.85, 0.880), (-1.62, 0.915),
                        (-1.05, 1.160), (-0.60, 1.232), (-0.25, 1.245), (0.22, 1.222),
                        (0.92, 0.895), (1.31, 0.835), (1.75, 0.738), (2.00, 0.625), (2.13, 0.515)),
        'rail_x': Curve((-2.22, 0.66), (-2.05, 0.775), (-1.75, 0.835), (-1.62, 0.83),
                        (-1.05, 0.69), (-0.60, 0.635), (-0.25, 0.62), (0.22, 0.615),
                        (0.92, 0.80), (1.31, 0.83), (1.75, 0.80), (2.00, 0.74), (2.13, 0.62)),
        'belt': Curve((-2.22, 0.855), (-1.85, 0.850), (-1.31, 0.890), (-0.62, 0.870),
                      (0.40, 0.850), (0.92, 0.845), (1.31, 0.805), (1.75, 0.712), (2.00, 0.598),
                      (2.13, 0.488)),
        'plan': Curve((-2.22, 0.74), (-2.05, 0.86), (-1.75, 0.908), (-1.31, 0.92), (-0.60, 0.90),
                      (0.40, 0.89), (1.31, 0.905), (1.75, 0.885), (2.00, 0.82), (2.13, 0.70)),
        'shelf': Curve((-1.75, 0.03), (-1.15, 0.075), (0.45, 0.075), (0.95, 0.03)),
        'bottom': Curve((-2.22, 0.34), (-1.95, 0.27), (-1.70, 0.20), (-0.90, 0.150), (0.90, 0.150),
                        (1.70, 0.160), (2.13, 0.180)),
        'tuck': Curve((-2.22, 0.03), (-1.0, 0.06), (0.9, 0.06), (2.13, 0.04)),
        'bubble': Curve((-1.3, 0.0), (-0.5, 0.02), (0.0, 0.02), (0.6, 0.0)),
    },
    'tail_lamps': [(0.52, 'lamp_tail', 'lamp_brake'), (0.30, 'lamp_indicator_r', 'lamp_reverse')],
    'tail_lamp_z': 0.76, 'tail_lamp_radius': 0.072,
    'exhaust_x': 0.36, 'exhaust_z': 0.30, 'plate_f_z': 0.36, 'plate_r_z': 0.52,
    'cabin': {'rear': -1.02, 'front': 0.88, 'half_width': 0.80, 'floor': 0.16, 'belt': 0.84,
              'seat_x': 0.37, 'seat_y': -0.38},
}


def make(a):
    _car.make_car(a, SPEC)


def assemble(a):
    _car.assemble_car(a)
