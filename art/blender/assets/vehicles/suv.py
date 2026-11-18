"""SUV (the five-door sport utility of the vehicle catalogue): an original upright two-box wagon.

4.86 m long, 1.95 m wide and 1.76 m high over the roof rails, on a 2.86 m wheelbase with 0.38 m
wheels and 0.21 m of ground clearance: a tall flat clamshell bonnet over a deep bar grille
between slim headlamps, a steep windscreen, a long flat roof with rails that floats on
blacked-out rear pillars, a steeply raked rear screen over a short tailgate lip, tall vertical
tail lamps at the rear corners, and dark cladding along the sills and round the lower bumpers.

Built on the everyday cars' kit (_body, _car) with its own curves, kept in _platform.suv() so
that the police SUV derives from the same description: the tailgate face is the body's tail
cap (it does not open; `trunk` is the lip under the rear screen).

Budget: the everyday cars' node contract and the lamp units, plus the roof rails: 23,000
triangles, 40 draw calls and 1,200,000 bytes (the geometry is not compressed).

Blender axes: Z up, the car faces +Y, right side +X, origin on the ground at the centre of the
wheelbase; the driver sits on the left (-X).
"""
from lib import build, scene

import _car
import _mesh
import _platform

ASSET = {
    'id': 'suv',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 23000, 'draws': 40, 'bytes': 1200000},
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


SPEC = _platform.suv()
SPEC['fittings'] = fittings


def make(a):
    _car.make_car(a, SPEC)


def assemble(a):
    _car.assemble_car(a)
