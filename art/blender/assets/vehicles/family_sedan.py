"""Family sedan (the Tavira Estela of the vehicle catalogue): an original four-door saloon, the
car Marazul commutes in and the commonest car in traffic.

A clean three-box saloon 4.72 m long, 1.82 m wide and 1.46 m high on a 2.76 m wheelbase with
0.32 m wheels: a gently arched roof, a fast rear screen running into a short high deck, a belt
line rising a little towards the tail, a wide low grille slot between slim headlamps that wrap
round the corners, and slim wraparound tail lamps.

The car is the saloon platform itself (_platform.saloon: curves and marks, see _body) handed
to the shared everyday-car builder (_car): the shell is one lofted half grid cut into the panels
the game moves (hood, trunk, front doors, bumpers, the four glass panes), with one baked wheel
used four times. lod1 and lod2 are single merged meshes; the moving parts hang under lod0.

Budget: a car with the full node contract (wheels, doors, lids, bumpers, panes and lamp groups
as separate nodes and materials) needs more triangles and draw calls at level 0 than the
default vehicle budget: 22,000 triangles and 40 draw calls (the lamp units with lenses,
recessed beds, projector pods and light guides add about 2,000 triangles and the lens glass
one draw per lamp-carrying part). Its geometry alone is about 650 kB (no mesh compression,
about 20 bytes per vertex), so until the vertex count is cut (shared flange vertices, a
lighter interior) the file may pass the default 1,000,000 bytes: 1,100,000.

Blender axes: Z up, the car faces +Y, right side +X, origin on the ground at the centre of the
wheelbase.
"""
import _car
import _platform

ASSET = {
    'id': 'family_sedan',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 22000, 'draws': 40, 'bytes': 1100000},
}

SPEC = _platform.saloon()


def make(a):
    _car.make_car(a, SPEC)


def assemble(a):
    _car.assemble_car(a)
