"""Luxury sedan (the Lucero Regente of the vehicle catalogue): an original four-door executive
saloon, driven by chauffeurs, lawyers and the people who need both.

The saloon platform (_platform.saloon) stretched onto the catalogue's 5.16 m length, 1.93 m
width and 1.48 m height, on a long 3.11 m wheelbase with 0.35 m wheels and 0.14 m of ground
clearance: a long bonnet, a strong raised shoulder, a more upright nose carrying a tall
shield-shaped grille of fine vertical plated bars under a plated top bar, a plated window
surround (the frame over the glass and a strip along its base), seven-spoke alloys and a
full-width tail lamp across the rear.

Budget: the everyday cars' node contract, the lamp units and the plated grille bars: 23,000
triangles, 42 draw calls and 1,200,000 bytes (the geometry is not compressed).

Blender axes: Z up, the car faces +Y, right side +X, origin on the ground at the centre of the
wheelbase; the driver sits on the left (-X).
"""
from lib import build, scene

import _body as B
import _car
import _mesh
import _platform

ASSET = {
    'id': 'luxury_sedan',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 23000, 'draws': 42, 'bytes': 1200000},
}

GLASS, BELT, RAIL = B.COL_GLASS_BASE, B.COL_BELT, B.COL_RAIL

SPEC = _platform.derive(
    _platform.saloon(), tail=-2.43, axle_r=-1.555, axle_f=1.555, nose=2.50, width=1.93,
    heights=[(0.935, 0.965), (1.46, 1.48)],
    color='#1F2A44', chrome=True, clearance=0.14,
    wheel_radius=0.35, tyre_width=0.245, track=1.64, arch_radius=0.385,
    wheel={'rim_ratio': 0.72, 'spokes': 7}, nose_bow=0.06, nose_bulge=0.012,
    seat_color=(0.16, 0.12, 0.09), lod1=4800, lod2=1150)
# A tall narrow grille (the shield) between the lamps; a full-width tail lamp band.
SPEC['nose_cap'] = [('lamp_head', 4, 8, GLASS, BELT + 1),
                    ('lamp_indicator_r', 6, 8, BELT + 1, BELT + 2),
                    ('grille', 0, 3, GLASS, BELT + 4), ('grille', 0, 5, BELT + 5, BELT + 7)]
SPEC['tail_cap'] = [('lamp_tail', 0, 8, GLASS, BELT), ('lamp_brake', 5, 8, BELT, BELT + 1),
                    ('lamp_indicator_r', 5, 8, BELT + 1, BELT + 2),
                    ('lamp_reverse', 3, 5, BELT, BELT + 2)]
# Plated window surround: the frame over the glass and a strip along its base.
SPEC['paint'] = [(('quarter_rear', 'glass_front'), (RAIL, RAIL + 1), 'chrome'),
                 (('quarter_rear', 'glass_front'), (GLASS, GLASS + 1), 'chrome')]


def grille_bars(shell, mats):
    """The right half of the shield grille: fine vertical plated bars under a plated top bar."""
    top = shell.point('nose', GLASS)[2] - 0.012
    bottom = shell.point('nose', BELT + 4)[2] + 0.012
    reach = 0.5 * shell.point('nose', BELT)[0]
    middle = 0.5 * (top + bottom)
    parts = []
    x = 0.012
    while x < reach - 0.015:
        y = max(shell.cap_y(-1, x, z) for z in (top, middle, bottom)) + 0.006
        bar = build.box(f'grille_bar{x:.3f}', (0.007, 0.014, top - bottom), location=(x, y, middle))
        parts.append(bar)
        x += 0.032
    y = max(shell.cap_y(-1, px, top) for px in (0.0, reach)) + 0.012
    parts.append(build.box('grille_top', (reach, 0.022, 0.018), location=(0.5 * reach, y, top + 0.004)))
    for part in parts:
        scene.set_material(part, mats['chrome'])
    return _mesh.tagged(parts, 1)


def fittings(shell, spec, mats):
    return {'bumper_f': grille_bars(shell, mats)}


SPEC['fittings'] = fittings


def make(a):
    _car.make_car(a, SPEC)


def assemble(a):
    _car.assemble_car(a)
