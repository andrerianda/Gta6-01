"""Floodlight mast of the apron, 18.2 m: a tapered eight-sided galvanised pole bolted to a concrete
plinth (base flange, anchor bolts, hand-hole door, cable box with its conduit), a caged ladder up
the back to an eight-sided service platform with a guard rail, and a braced head frame carrying six
floodlights (two rows of three, each a finned housing in a yoke with a visor) tilted 30 degrees
down towards +Y in Blender (the game's -Z).

The lenses are the node lamp_head (material lamp_flood, emissive; shown at every level; its origin is
the middle of the head). anchor_light sits at the same point and looks the way the lights shine.
"""
import math

import _base_kit as kit
import _ground_kit as gk
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'base_floodlight_mast', 'atlas': 512, 'kind': 'prop', 'views': ((30, 6, 1.0), (25, -8, 4.5, (0, 0.2, 17.2)))}

HEAD = (0.0, 0.7, 17.4)
TILT = -30
ROWS, COLUMNS = (16.95, 17.85), (-1.25, 0.0, 1.25)


def floodlight(x, z, dark, steel, lamp, level):
    """One floodlight around the origin, then tilted and moved to its place on the frame."""
    body = mk.assign(mk.box('light', (0.78, 0.36, 0.56), (0, 0, 0)), dark)
    mk.map_points(body, lambda v: (v.x * (0.68 if v.y < 0 else 1.0), v.y, v.z * (0.68 if v.y < 0 else 1.0)))
    parts = [body]
    if level == 0:
        parts += [kit.block('fin', (0.5, 0.1, 0.03), (0, -0.2, dz), dark) for dz in (-0.12, 0.0, 0.12)]
        parts.append(kit.block('visor', (0.86, 0.3, 0.025), (0, 0.3, 0.3), dark, (-8, 0, 0)))
        parts.append(kit.block('bezel_top', (0.8, 0.05, 0.04), (0, 0.2, 0.27), steel))
        parts.append(kit.block('bezel_bottom', (0.8, 0.05, 0.04), (0, 0.2, -0.27), steel))
    if level < 2:
        parts.append(gk.bar('yoke', [(-0.44, 0.0, 0.0), (-0.44, -0.3, 0.0), (0.44, -0.3, 0.0), (0.44, 0.0, 0.0)], 0.03, steel, 4))
    lens = mk.assign(mk.box('lens', (0.68, 0.03, 0.46), (0, 0.19, 0)), lamp)
    for obj in parts + [lens]:
        mk.transform(obj, (x, 0.42, z), (TILT, 0, 0))
    return parts, lens


def make(a):
    steel = kit.weathered('galvanised', '#878c8f', 0.5, 0.85, 0.5, soot='#6d4126', soot_range=(0.56, 0.68))
    dark = kit.painted_steel('housing', '#2e3231', 0.5, 0.5)
    concrete = kit.weathered('concrete', '#8f8a7f', 0.9, 0.0, 0.7, soot='#6f5a44', soot_range=(0.55, 0.7))
    box_paint = kit.weathered('box_grey', '#6f7672', 0.55, 0.3, 0.6, soot='#6a3d22', soot_range=(0.56, 0.68))
    lamp = sf.lamp('lamp_flood', '#fff4dc', 8.0)

    core = [kit.block('plinth', (1.3, 1.3, 0.5), (0, 0, 0.25), concrete, bevel=0.03),
            kit.drum('pole', 0.27, 0.5, 17.9, steel, sides=8, radius_top=0.13)]
    base = [kit.drum('flange', 0.44, 0.5, 0.545, steel, sides=8, smooth=False)]
    for i in range(8):
        angle = math.pi * (i + 0.5) / 4
        base.append(kit.drum('anchor_bolt', 0.028, 0.545, 0.62, dark, (0.37 * math.cos(angle), 0.37 * math.sin(angle)), 5, smooth=False))
    base.append(kit.block('hand_hole', (0.2, 0.03, 0.42), (0, 0.262, 1.15), steel))
    base.append(kit.block('cable_box', (0.42, 0.24, 0.62), (0, -0.4, 1.35), box_paint, bevel=0.01))
    base.append(kit.block('box_door', (0.34, 0.02, 0.5), (0, -0.53, 1.35), box_paint))
    base.append(kit.block('box_hood', (0.48, 0.3, 0.03), (0, -0.42, 1.68), box_paint, (-10, 0, 0)))
    base.append(gk.bar('conduit', [(0.12, -0.42, 1.04), (0.12, -0.42, 0.5), (0.12, -0.6, 0.5), (0.12, -0.6, 0.0)], 0.03, dark, 4))
    base.append(gk.bar('riser', [(-0.1, -0.33, 1.66), (-0.1, -0.2, 15.2)], 0.022, dark, 3))
    base.append(kit.block('junction_box', (0.3, 0.16, 0.34), (0, -0.22, 16.2), box_paint))
    base.append(gk.bar('spike', [(0, 0, 17.9), (0, 0, 18.2)], [0.03, 0.004], steel, 4))

    # --- head frame and floodlights -------------------------------------------------------------------
    frame, frame_fine, housings, housings_mid, housings_far, lenses = [], [], [], [], [], []
    for z in ROWS:
        frame.append(kit.block('bar', (3.5, 0.1, 0.1), (0, 0.16, z), steel))
    for x in (-1.7, 1.7):
        frame.append(kit.block('upright', (0.08, 0.08, 1.6), (x, 0.16, 17.4), steel))
        frame_fine.append(gk.bar('stay', [(x, 0.16, 16.75), (0.0, 0.0, 15.95)], 0.028, steel, 3))
    frame.append(kit.block('head_plate', (0.5, 0.3, 1.1), (0, 0.06, 17.35), steel))
    for z in ROWS:
        for x in COLUMNS:
            for level, target in enumerate((housings, housings_mid, housings_far)):
                parts, lens = floodlight(x, z, dark, steel, lamp, level)
                target += parts
                if level == 0:
                    lenses.append(lens)
                else:
                    import bpy
                    bpy.data.objects.remove(lens, do_unlink=True)

    # --- service platform, ladder and cage ---------------------------------------------------------------
    ring = [(0.78 * math.cos(math.pi * (i + 0.5) / 4), 0.78 * math.sin(math.pi * (i + 0.5) / 4), 15.58) for i in range(8)]
    platform = [kit.drum('service_ring', 0.84, 15.5, 15.58, steel, sides=8, smooth=False)]
    rails = [gk.bar('ring_rail', [(p[0], p[1], p[2] + h) for p in ring + ring[:2]], 0.022, steel, 3) for h in (1.0, 0.5)]
    rails += [gk.bar('ring_post', [p, (p[0], p[1], p[2] + 1.0)], 0.022, steel, 3) for p in ring]
    rails += [gk.bar('ring_strut', [(0.6 * math.cos(t), 0.6 * math.sin(t), 15.5), (0.2 * math.cos(t), 0.2 * math.sin(t), 14.9)], 0.025, steel, 3)
              for t in (math.pi * (i + 0.5) / 2 for i in range(4))]

    def ladder_y(z):
        return -0.36 + 0.1 * (z - 2.6) / 12.9

    ladder = [gk.bar('ladder', [(x, ladder_y(2.6), 2.6), (x, ladder_y(15.5), 15.5), (x, ladder_y(15.5), 16.5)], 0.024, steel, 4) for x in (-0.17, 0.17)]
    rungs = []
    z = 2.9
    while z < 16.4:
        rungs.append(gk.bar('rung', [(-0.17, ladder_y(min(z, 15.5)), z), (0.17, ladder_y(min(z, 15.5)), z)], 0.016, steel, 3))
        z += 0.4
    for z in (3.0, 6.0, 9.0, 12.0, 15.0):
        rungs.append(kit.block('ladder_clamp', (0.42, 0.14, 0.04), (0, ladder_y(z) + 0.07, z), steel))
    hoops = [5.0 + 1.7 * i for i in range(7)]
    for z in hoops:
        y = ladder_y(z)
        rungs.append(gk.bar('hoop', [(0.34 * math.cos(t), y - 0.03 - 0.6 * math.sin(t), z) for t in (math.pi * i / 6 for i in range(7))], 0.016, steel, 3))
    for t in (math.pi * 0.25, math.pi * 0.5, math.pi * 0.75):
        rungs.append(gk.bar('strap', [(0.34 * math.cos(t), ladder_y(z) - 0.03 - 0.6 * math.sin(t), z) for z in (hoops[0], hoops[-1])], 0.014, steel, 3))

    a.parts_of(core + frame + platform)
    a.parts_of(base + frame_fine + housings + rails + rungs, levels=(0,))
    a.parts_of(ladder, levels=(0, 1))
    a.parts_of(housings_mid, levels=(1,))
    a.parts_of(housings_far, levels=(2,))
    a.moving(mk.join('lamp_head', lenses), HEAD)

    a.lod_distances = (70.0, 240.0)
    a.collider_box('mast', (0.8, 0.8, 18.2), (0, 0, 9.1))
    a.anchor('light', HEAD, (TILT, 0, 0))
    gk.hook_finish(a, images={'atlas.base': (512, 80), 'atlas.orm': (256, 76), 'atlas.normal': (512, 70)},
                   numbers=lambda: {'sheet': gk.preview('/tmp/marazul/flight/s4/a4-base-ground/sheets/base_floodlight_mast.jpg',
                                                        ((30, 6, 1.0), (25, -8, 4.2, (0, 0.2, 17.0)), (200, 10, 5.0, (0, -0.3, 1.6))), (640, 300))})
