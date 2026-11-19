"""Floodlight mast of the apron, 18.2 m: a tapered eight-sided steel pole on a concrete plinth, a
service ring below the head and a head frame with six floodlights (two rows of three) tilted 30
degrees down towards +Y in Blender (the game's -Z). Lamp group lamp_flood; anchor_light at the
middle of the head, pointing the way the lights shine.
"""
import _base_kit as kit
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'base_floodlight_mast', 'atlas': 512, 'kind': 'prop', 'views': ((30, 6, 1.0), (25, -8, 4.5, (0, 0.2, 17.2)))}


def make(a):
    steel = kit.galvanised('galvanised', '#878c8f')
    dark = kit.painted_steel('housing', '#2e3231', 0.5, 0.4)
    concrete = kit.concrete('concrete', '#8f8a7f', seams=None, wear=0.6)
    lamp = sf.lamp('lamp_flood', '#fff4dc', 8.0)

    core = [
        kit.block('plinth', (1.3, 1.3, 0.5), (0, 0, 0.25), concrete),
        kit.drum('pole', 0.27, 0.5, 17.9, steel, sides=8, radius_top=0.13),
    ]
    lights, lenses = [], []
    for z in (16.95, 17.85):
        for x in (-1.25, 0.0, 1.25):
            body = mk.assign(mk.box('light', (0.78, 0.36, 0.56), (0, 0, 0)), dark)
            mk.map_points(body, lambda v: (v.x * (0.7 if v.y < 0 else 1.0), v.y, v.z * (0.7 if v.y < 0 else 1.0)))
            lens = mk.assign(mk.box('lens', (0.68, 0.03, 0.46), (0, 0.19, 0)), lamp)
            for obj in (body, lens):
                mk.transform(obj, (x, 0.42, z), (-30, 0, 0))
            lights.append(body)
            lenses.append(lens)
    a.parts_of(core + lights + lenses)

    frame = []
    for z in (16.95, 17.85):
        frame.append(kit.rod('bar', [(-1.75, 0.16, z), (1.75, 0.16, z)], 0.06, steel))
    for x in (-1.7, 1.7):
        frame.append(kit.rod('upright', [(x, 0.16, 16.6), (x, 0.16, 18.2)], 0.05, steel))
    frame.append(kit.drum('service_ring', 0.75, 15.5, 15.58, steel, sides=8, smooth=False))
    frame.append(kit.railing('ring_rail', [(0.7, 0.0, 15.58), (0.0, 0.7, 15.58), (-0.7, 0.0, 15.58), (0.0, -0.7, 15.58)], 1.0, steel, 0.025))
    frame.append(kit.block('switch_box', (0.4, 0.22, 0.6), (0, -0.36, 1.3), dark))
    for x in (-0.16, 0.16):
        frame.append(kit.rod('ladder', [(x, -0.33, 2.6), (x, -0.22, 15.5)], 0.02, steel))
    a.parts_of(frame, levels=(0,))

    a.lod_distances = (70.0, 240.0)
    a.collider_box('mast', (0.8, 0.8, 18.2), (0, 0, 9.1))
    a.anchor('light', (0, 0.7, 17.4), (-30, 0, 0))
