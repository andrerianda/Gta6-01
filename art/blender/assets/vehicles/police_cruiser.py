"""Police cruiser (the Holloway Warden of the vehicle catalogue): the Marazul police patrol car.

A big rear-drive pursuit saloon on the everyday cars' saloon platform (_platform.derive),
stretched to the catalogue's 5.06 m over the push bar, 1.91 m wide and 1.62 m high over the
light bar, on a 2.96 m wheelbase with 0.35 m wheels and a blunter nose. Its own equipment:
- a low roof light bar on two feet over the front seats: a dark housing with four ribbed lens
  pods, lamp_siren_a (red) on the driver's half and lamp_siren_b (blue) on the other, as one
  extra node `light_bar` under lod0 together with
- the spotlight on the driver's A pillar (black housing, plated reflector, a post through the
  pillar);
- a tubular push bar with rubber pads standing in front of the nose, part of bumper_f (it
  comes off with the bumper);
- black steel wheels with vents and plated hub caps;
- the livery's second colour (paint_secondary) on the four door skins and the roof.
anchor_siren sits on top of the light bar's centre, facing forward.

Budget: the everyday cars' node contract plus the light bar node and three more materials
(paint_secondary, lamp_siren_a, lamp_siren_b): 21,000 triangles, 46 draw calls and
1,250,000 bytes (the geometry is not compressed).

Blender axes: Z up, the car faces +Y, right side +X, origin on the ground at the centre of the
wheelbase; the driver sits on the left (-X).
"""
import math

from lib import build, modify, scene

import _body as B
import _car
import _mesh
import _platform

ASSET = {
    'id': 'police_cruiser',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 21000, 'draws': 46, 'bytes': 1250000},
}

BAR_Y, BAR_DEPTH, BAR_HALF = -0.10, 0.28, 0.58      # light bar centre station, depth, half length
PUSH_X = 0.30                                         # push bar uprights, either side

SPEC = _platform.derive(
    _platform.saloon(), tail=-2.424, axle_r=-1.48, axle_f=1.48, nose=2.321, width=1.91,
    heights=[(0.95, 1.0), (1.46, 1.49)],
    color='#F2F0E8', secondary_color='#1D4E7A', police=True,
    wheel_radius=0.35, tyre_width=0.235, track=1.64, arch_radius=0.385,
    wheel={'style': 'steel', 'rim_ratio': 0.62}, clearance=0.15,
    nose_bow=0.05, nose_bulge=0.02, lod1=4800, lod2=1200)
SPEC['secondary'] = [(('roof_rear', 'roof_front'), (0, B.COL_RAIL)),
                     (('sill_rear', 'door_front'), (B.COL_GLASS_BASE, B.COLUMNS - 1))]


def _roof(x):
    """The roof's height at half width x over the light bar's station."""
    curves = SPEC['curves']
    top, rail_x, rail_z = curves['top'](BAR_Y), curves['rail_x'](BAR_Y), curves['rail_z'](BAR_Y)
    return top - (top - rail_z) * min(1.0, abs(x) / rail_x) ** SPEC.get('crown_power', 2.4)


BAR_BASE = _roof(0.0) + 0.035
BAR_TOP = BAR_BASE + 0.105
SPEC['anchors'] = [('anchor_siren', (0.0, BAR_Y, BAR_TOP), (0, 1, 0))]


def _box(name, size, location, material, bevel=0.0, segments=2):
    obj = build.box(name, size, location=location)
    if bevel:
        modify.bevel(obj, width=bevel, segments=segments)
    scene.set_material(obj, material)
    return obj


def light_bar(mats):
    """The whole roof light bar: housing, feet, four lens pods and a centre cap."""
    parts = [_box('bar_housing', (2.0 * BAR_HALF, BAR_DEPTH, 0.045),
                  (0.0, BAR_Y, BAR_BASE + 0.0225), mats['trim'], bevel=0.016),
             _box('bar_centre', (0.13, BAR_DEPTH - 0.05, 0.05),
                  (0.0, BAR_Y, BAR_BASE + 0.065), mats['trim'], bevel=0.014)]
    for sign in (-1.0, 1.0):
        lens = mats['lamp_siren_a' if sign < 0.0 else 'lamp_siren_b']
        for x0, x1 in ((0.075, 0.31), (0.325, 0.565)):
            parts.append(_box(f'bar_pod{sign}{x0}', (x1 - x0, BAR_DEPTH - 0.025, 0.062),
                              (sign * 0.5 * (x0 + x1), BAR_Y, BAR_BASE + 0.071), lens,
                              bevel=0.022, segments=3))
        foot = _roof(0.45) - 0.006
        parts.append(_box(f'bar_foot{sign}', (0.07, 0.17, BAR_BASE - foot),
                          (sign * 0.45, BAR_Y, 0.5 * (BAR_BASE + foot)), mats['trim'], bevel=0.008,
                          segments=1))
    return _mesh.tagged(parts, 2)


def spotlight(shell, mats):
    """The spotlight on the driver's A pillar, a third of the way up from the mirror."""
    low = shell.point('glass_front', B.COL_GLASS_BASE)
    high = shell.point('roof_front', B.COL_RAIL)
    x, y, z = (p + 0.3 * (q - p) for p, q in zip(low, high))
    x = -(x + 0.075)                                    # the driver's side, clear of the pillar
    y += 0.05
    body = build.lathe('spot_body', [(0.0, -0.085), (0.034, -0.08), (0.054, -0.055),
                                     (0.061, -0.015), (0.062, 0.055), (0.056, 0.062)], segments=14)
    lens = build.lathe('spot_lens', [(0.056, 0.062), (0.03, 0.066), (0.0, 0.067)], segments=14)
    scene.set_material(body, mats['bar'])
    scene.set_material(lens, mats['chrome'])
    pieces = []
    for piece in (body, lens):
        modify.transform(piece, rotation=(-0.5 * math.pi, 0.0, 0.0), location=(x, y, z + 0.02))
        pieces.append(piece)
    post = build.tube('spot_post', [(x + 0.085, y - 0.03, z - 0.035), (x, y - 0.03, z - 0.035),
                                    (x, y - 0.02, z - 0.01)], radius=0.011, segments=6,
                      up=(0.0, 1.0, 0.0))
    scene.set_material(post, mats['bar'])
    handle = build.tube('spot_handle', [(x, y - 0.085, z + 0.02), (x + 0.1, y - 0.11, z + 0.02)],
                        radius=0.008, segments=6, up=(0.0, 0.0, 1.0))
    scene.set_material(handle, mats['bar'])
    return _mesh.tagged(pieces + [post, handle], 1)


def push_bar(shell, mats):
    """The right half of the tubular push bar in front of the nose (part of bumper_f)."""
    front = max(shell.cap_y(-1, x, z) for x in (0.0, PUSH_X) for z in (0.3, 0.45, 0.6, 0.72))
    y = front + 0.06
    frame = [build.tube('push_upright', [(PUSH_X, y, 0.24), (PUSH_X, y, 0.72),
                                         (PUSH_X - 0.015, y - 0.01, 0.775),
                                         (PUSH_X - 0.06, y - 0.02, 0.795), (0.0, y - 0.02, 0.795)],
                        radius=0.024, segments=8, up=(0.0, 1.0, 0.0)),
             build.tube('push_cross', [(PUSH_X, y, 0.50), (0.0, y, 0.50)], radius=0.02,
                        segments=8, up=(0.0, 0.0, 1.0))]
    mount = shell.cap_y(-1, PUSH_X, 0.3) - 0.22
    frame.append(build.tube('push_mount', [(PUSH_X, y, 0.27), (PUSH_X, mount, 0.27)], radius=0.022,
                            segments=8, up=(0.0, 0.0, 1.0)))
    for part in frame:
        scene.set_material(part, mats['bar'])
    pad = _box('push_pad', (0.05, 0.03, 0.34), (PUSH_X, y + 0.028, 0.47), mats['gap'], bevel=0.008,
               segments=1)
    return _mesh.tagged(frame, 2) + _mesh.tagged([pad], 1)


def fittings(shell, spec, mats):
    return {'bumper_f': push_bar(shell, mats),
            'light_bar': light_bar(mats) + spotlight(shell, mats)}


SPEC['fittings'] = fittings


def make(a):
    _car.make_car(a, SPEC)


def assemble(a):
    _car.assemble_car(a)
