"""Radar Cabo Lejano: an unmanned coastal radar station, 33.6 m high. A 14 x 12 m concrete plinth
carries an equipment cabin, a small faceted radome and a tapered twelve-sided concrete tower (2.5 m
radius at the foot, 1.5 m at 26 m) with a railed platform. On its pedestal turns the node `antenna`
(origin on the vertical axis at 28.4 m): a curved reflector 9 m wide and 4.4 m high with its back
frame and feed boom, looking towards +Y in Blender (the game's -Z) at rest; turn it about the
game's Y axis. Lamp group lamp_beacon: four red lights on the platform rail.
"""
import math

import _base_kit as kit
import _radar_parts as rp
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'radar_tower', 'atlas': 1024, 'kind': 'building', 'views': ((32, 6, 0.6), (30, 10, 2.6, (0, 0, 28.5)))}


def make(a):
    m = rp.materials()
    beacon = sf.lamp('lamp_beacon', '#ff2c1c', 6.0)
    core = [rp.plinth(m), rp.section('tower', rp.TOWER_FOOT, rp.TOWER_TOP, m)] + rp.platform(m) + rp.cabin(m)
    a.parts_of(core)
    a.parts_of(rp.radome(m), ratios=(1.0, 0.5))

    mid = []
    for z in (7.4, 13.6, 19.8):
        mid.append(kit.drum('band', rp.radius_at(z) + 0.1, z - 0.15, z + 0.15, m['concrete'], sides=12))
    for k in range(4):
        angle = math.pi / 4 + k * math.pi / 2
        mid.append(kit.block('beacon', (0.3, 0.3, 0.3), (4.4 * math.cos(angle), 4.4 * math.sin(angle), rp.TOWER_TOP + 1.7), beacon))
    a.parts_of(mid, levels=(0, 1))

    fine = [kit.railing('rail', [(4.45 * math.cos(i * math.pi / 6), 4.45 * math.sin(i * math.pi / 6), rp.TOWER_TOP + 0.4) for i in range(12)],
                        1.15, m['steel'], 0.04)]
    for x in (-0.25, 0.25):
        fine.append(kit.rod('ladder', [(x, -rp.RADIUS_FOOT - 0.22, rp.TOWER_FOOT), (x, -rp.RADIUS_TOP - 0.3, rp.TOWER_TOP - 1.4)], 0.035, m['steel']))
    fine.append(kit.rod('cable_tray', [(-2.5, -3.2, 3.9), (-1.2, -1.9, 3.9), (-1.2, -1.9, 1.3)], 0.09, m['steel']))
    fine.append(kit.block('plinth_steps', (1.6, 1.2, 0.6), (-5.4, -1.2 + 0.0, 0.3 + 0.0), m['plinth']))
    a.parts_of(fine, levels=(0,))

    parts = rp.antenna(m)
    for part in parts:
        mk.transform(part, (0, 0, rp.ANTENNA_BASE))
    a.moving(mk.join('antenna', parts), (0, 0, rp.ANTENNA_BASE))

    a.lod_distances = (140.0, 480.0)
    a.collider_box('plinth', rp.PLINTH, (0, 0, 0.6))
    a.collider_box('tower', (4.4, 4.4, 24.8), (0, 0, 13.6))
    a.collider_box('platform', (9.2, 9.2, 2.6), (0, 0, 27.1))
    a.collider_box('cabin', rp.CABIN, (rp.CABIN_AT[0], rp.CABIN_AT[1], 2.7))
    a.anchor('antenna', (0, 0, rp.ANTENNA_BASE + 2.95))
    a.extra('antenna_axis', 'z')
    a.extra('antenna_height', rp.ANTENNA_BASE)
