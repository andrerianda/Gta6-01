"""Family sedan (the Tavira Estela of the vehicle catalogue): an original four-door saloon, the
car Marazul commutes in and the commonest car in traffic.

A clean three-box saloon 4.72 m long, 1.82 m wide and 1.46 m high on a 2.76 m wheelbase with
0.32 m wheels: a gently arched roof, a fast rear screen running into a short high deck, a belt
line rising a little towards the tail, a wide low grille slot between slim headlamps that wrap
round the corners, and slim wraparound tail lamps.

The car is a set of curves and marks (see _body) handed to the shared everyday-car builder
(_car): the shell is one lofted half grid cut into the panels the game moves (hood, trunk,
front doors, bumpers, the four glass panes), with one baked wheel used four times. lod1 and
lod2 are single merged meshes; the moving parts hang under the node lod0.

Budget: a car with the full node contract (wheels, doors, lids, bumpers, panes and lamp groups
as separate nodes and materials) needs more triangles and draw calls at level 0 than the
default vehicle budget: 20,000 triangles and 40 draw calls. Its geometry alone is about 620 kB
(no mesh compression, about 20 bytes per vertex), so until the vertex count is cut (shared
flange vertices, a lighter interior) the file may pass the default 1,000,000 bytes: 1,100,000.

Blender axes: Z up, the car faces +Y, right side +X, origin on the ground at the centre of the
wheelbase.
"""
import _body as B
import _car
from _shape import Curve

ASSET = {
    'id': 'family_sedan',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 20000, 'draws': 40, 'bytes': 1100000},
}

GLASS, BELT = B.COL_GLASS_BASE, B.COL_BELT

SPEC = {
    'color': '#A9ADB1', 'atlas': 1024,
    'width': 1.82, 'height': 1.46, 'clearance': 0.15,
    'axle_r': -1.38, 'axle_f': 1.38,
    'wheel_radius': 0.32, 'tyre_width': 0.215, 'track': 1.56, 'arch_radius': 0.37,
    'wheel': {'rim_ratio': 0.66, 'spokes': 5},
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
    'nose_cap': [('lamp_head', 4, 8, GLASS, BELT + 2), ('lamp_indicator_r', 6, 8, BELT + 2, BELT + 3),
                 ('grille', 0, 4, GLASS + 1, BELT + 3), ('grille', 0, 5, BELT + 4, BELT + 7)],
    'tail_cap': [('lamp_tail', 5, 8, GLASS, BELT + 1), ('lamp_brake', 3, 5, GLASS, BELT + 1),
                 ('lamp_indicator_r', 5, 8, BELT + 1, BELT + 2),
                 ('lamp_reverse', 3, 5, BELT + 1, BELT + 2)],
    'exhausts': [0.48], 'exhaust_z': 0.30, 'plate_f_z': 0.36, 'plate_r_z': 0.66,
    'cabin': {'rear': -1.27, 'front': 0.98, 'half_width': 0.80, 'floor': 0.19, 'belt': 0.92,
              'seat_x': 0.37, 'seat_y': -0.05, 'rear_seat_y': -0.88, 'shelf': 0.52},
}


def make(a):
    _car.make_car(a, SPEC)


def assemble(a):
    _car.assemble_car(a)
