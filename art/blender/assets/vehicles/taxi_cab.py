"""Taxi cab (the Tavira Estela Cab of the vehicle catalogue): the Cangrejo cab company's car.

The family saloon's own body (_platform.saloon, 4.72 x 1.82 m on a 2.76 m wheelbase) with
the taxi's equipment:
- a lit roof sign shaped like a low arch, standing crosswise over the front seats on a dark
  plinth with two rubber pads: a frame in the livery's dark accent round two light panels
  (lamp_sign, front and back, standing a few millimetres proud; the game paints the lettering
  on them at run time), as one extra node `roof_sign` under lod0. 1.59 m high over the sign;
- black steel wheels with plated hub caps;
- crab orange over a cream band (paint_secondary) along the sills, wrapping round the bumper
  corners and the lower ends of both caps.
anchor_sign_roof is the centre of the sign's front panel, facing forward.

Budget: the everyday cars' node contract plus the sign node and two more materials
(paint_secondary, lamp_sign), and the lamp units with depth: 23,500 triangles, 44 draw calls
and 1,250,000 bytes (the geometry is not compressed).

Blender axes: Z up, the car faces +Y, right side +X, origin on the ground at the centre of the
wheelbase; the driver sits on the left (-X).
"""
import math

import bmesh

from lib import build, modify, scene

import _body as B
import _car
import _lamps
import _mesh
import _platform

ASSET = {
    'id': 'taxi_cab',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 23500, 'draws': 44, 'bytes': 1250000},
}

SIGN_Y, SIGN_DEPTH, SIGN_HALF = -0.08, 0.13, 0.31     # centre station, depth, half width
SIGN_END, SIGN_CROWN, FRAME = 0.072, 0.03, 0.014      # height at the ends, rise of the arch

SPEC = _platform.saloon()
SPEC.update(color='#E8703A', secondary_color='#F3E9D2',
            wheel={'style': 'steel', 'rim_ratio': 0.64}, lod1=4700, lod2=1150)
_BAND = (B.COL_BELT + 5, B.COLUMNS - 1)               # the lower side above the black sill strip
SPEC['secondary'] = [(('sill_rear', 'sill_front'), _BAND), (('tail', 'fascia_r'), _BAND),
                     (('fascia_f', 'nose'), _BAND)]


def _roof(x):
    """The roof's height at half width x over the sign's station."""
    curves = SPEC['curves']
    top, rail_x, rail_z = curves['top'](SIGN_Y), curves['rail_x'](SIGN_Y), curves['rail_z'](SIGN_Y)
    return top - (top - rail_z) * min(1.0, abs(x) / rail_x) ** SPEC.get('crown_power', 2.4)


PLINTH = _roof(0.0) + 0.03                            # the top of the plinth, foot of the sign
SPEC['anchors'] = [('anchor_sign_roof', (0.0, SIGN_Y + 0.5 * SIGN_DEPTH + 0.004,
                                         PLINTH + 0.5 * (SIGN_END + SIGN_CROWN)), (0, 1, 0))]


def _arch(inset=0.0, steps=12):
    """The sign's outline in its own plane (x across, y up): a flat foot, upright ends with a
    chamfered shoulder and a low arch on top, shrunk by `inset` all round."""
    half, end, chamfer = SIGN_HALF - inset, SIGN_END - inset, 0.015
    outline = [(-half, inset), (half, inset), (half, end - chamfer)]
    for n in range(steps + 1):
        x = (half - chamfer) * (1.0 - 2.0 * n / steps)
        outline.append((x, end + SIGN_CROWN * (1.0 - (x / SIGN_HALF) ** 2)))
    outline.append((-half, end - chamfer))
    return outline


def _outward(obj):
    """Makes the faces of a closed mesh point outwards."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def _slab(name, outline, depth, material):
    """The outline extruded across the car, centred on the sign's station, foot on the plinth."""
    obj = build.extrude_outline(name, outline, depth)
    modify.transform(obj, rotation=(0.5 * math.pi, 0.0, 0.0),
                     location=(0.0, SIGN_Y + 0.5 * depth, PLINTH))
    _outward(obj)
    scene.set_material(obj, material)
    return obj


def roof_sign(mats):
    """The whole roof sign: frame, the two light panels, plinth and pads."""
    glow = _lamps.lamp((1.0, 0.86, 0.58), 5.0, 'lamp_sign', value=0.95, saturation=0.45)
    frame = _slab('sign_frame', _arch(), SIGN_DEPTH, mats['trim'])
    panel = _slab('sign_panel', _arch(FRAME), SIGN_DEPTH + 0.006, glow)
    plinth = build.box('sign_plinth', (2.0 * SIGN_HALF - 0.03, SIGN_DEPTH + 0.03, 0.022),
                       location=(0.0, SIGN_Y, PLINTH - 0.011))
    modify.bevel(plinth, width=0.008, segments=2)
    scene.set_material(plinth, mats['trim'])
    pads = []
    for sign in (-1.0, 1.0):
        low = _roof(0.2) - 0.004
        pad = build.box(f'sign_pad{sign}', (0.09, 0.12, PLINTH - 0.022 - low),
                        location=(sign * 0.2, SIGN_Y, 0.5 * (PLINTH - 0.022 + low)))
        scene.set_material(pad, mats['gap'])
        pads.append(pad)
    return (_mesh.tagged([frame, panel], 2, angle=math.radians(30)) + _mesh.tagged([plinth], 1)
            + _mesh.tagged(pads, 0))


def fittings(shell, spec, mats):
    return {'roof_sign': roof_sign(mats)}


SPEC['fittings'] = fittings


def make(a):
    _car.make_car(a, SPEC)


def assemble(a):
    _car.assemble_car(a)
