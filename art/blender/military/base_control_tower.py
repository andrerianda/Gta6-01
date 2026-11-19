"""Control tower of the air base, 26 m to the antenna tips: an eight-sided concrete shaft that flares
into a walkway deck at 19 m, a glazed cab with outward-leaning panes (material glass) under a roof
with a wide overhang, railings, a beacon and whip antennas, and a low annex behind the shaft. The
shaft stands at y = +2.5 (towards the front, the game's -Z), the annex behind it.
Lamp groups: lamp_cab (the cab's ceiling light), lamp_beacon (red, on the roof mast).
"""
import math

import _base_kit as kit
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'base_control_tower', 'atlas': 1024, 'kind': 'building', 'views': ((28, 8, 1.0), (40, 12, 2.6, (0, 2.5, 20.5)))}

CY = 2.5


def ring(radius, z, count=8):
    step = 2 * math.pi / count
    return [(math.cos(step * (i + 0.5)) * radius, CY + math.sin(step * (i + 0.5)) * radius, z) for i in range(count)]


def make(a):
    concrete = kit.concrete('concrete', '#8f8a7f', seams=(6.0, 1.55), projection='front', wear=0.5)
    stucco = kit.weathered('annex_wall', '#a89f86', 0.85, 0.0, 0.5, blotches=('#6a6c48',), blotch_scale=0.16)
    roof = kit.weathered('roof', '#6d6c68', 0.8, 0.0, 0.6)
    dark = kit.painted_steel('frame', '#2b2e2c', 0.5, 0.4)
    steel = kit.galvanised()
    console = sf.coated('console', '#35393b', 0.5, 0.1, 0.3)
    glass_cab = sf.glass('glass', '#1d3336', 0.42)
    glass_win = sf.glass('glass_window', '#0e1a1e', 0.8)
    lamp_cab = sf.lamp('lamp_cab', '#fff0cf', 3.0)
    lamp_beacon = sf.lamp('lamp_beacon', '#ff2c1c', 6.0)

    shaft = mk.loft('shaft', [ring(2.7, 0.0), ring(2.45, 17.2), ring(4.9, 18.7), ring(4.9, 19.0), ring(3.78, 19.0),
                              ring(3.78, 19.9), ring(3.62, 19.9), ring(3.62, 19.06)])
    mk.assign(shaft, concrete)
    panes = mk.assign(mk.loft('panes', [ring(3.7, 19.9), ring(4.35, 22.5)], False, False), glass_cab)
    top = mk.assign(mk.loft('cab_roof', [ring(4.3, 22.45), ring(5.05, 22.6), ring(5.05, 22.95), ring(4.1, 23.25)]), roof)
    annex = [
        kit.block('annex', (14.0, 8.0, 4.2), (0, -2.5, 2.1), stucco),
        kit.block('annex_roof', (14.5, 8.5, 0.3), (0, -2.5, 4.3), roof),
        kit.block('step', (15.0, 9.0, 0.12), (0, -2.5, 0.06), roof),
    ]
    a.parts_of([shaft, panes, top] + annex)

    mid = [kit.polygon('ceiling', ring(3.3, 22.43), lamp_cab, (0, CY, 40), True)]
    mid.append(mk.assign(mk.loft('desk', [ring(3.35, 19.06), ring(3.35, 19.95), ring(2.7, 20.1), ring(2.7, 19.06)]), console))
    for low, high in zip(ring(3.72, 19.9), ring(4.37, 22.5)):
        mid.append(kit.rod('mullion', [low, high], 0.08, dark))
    mid.append(kit.rod('beacon_mast', [(0, CY, 23.2), (0, CY, 24.5)], 0.07, dark))
    mid.append(kit.block('beacon', (0.34, 0.34, 0.34), (0, CY, 24.66), lamp_beacon))
    mid.append(kit.block('roof_unit', (1.3, 1.0, 0.7), (-1.6, CY - 1.2, 23.45), steel))
    mid.append(kit.block('annex_unit_1', (1.8, 1.2, 0.9), (-4.0, -4.0, 4.9), steel))
    mid.append(kit.block('annex_unit_2', (1.8, 1.2, 0.9), (4.2, -3.0, 4.9), steel))
    a.parts_of(mid, levels=(0, 1))

    fine = [kit.railing('deck_rail', ring(4.78, 19.0), 1.1, steel, 0.04)]
    for x, y, tip in ((1.5, 1.2, 26.0), (-1.2, 1.6, 25.6), (2.2, -1.0, 25.2)):
        fine.append(kit.rod('whip', [(x, CY + y, 23.1), (x, CY + y, tip)], 0.03, dark))
    for z in (4.0, 8.0, 12.0, 15.6):
        r = (2.7 - 0.25 * z / 17.2) * math.cos(math.pi / 8)
        fine += kit.window('slit', (0, CY + r - 0.03, z), 0.7, 1.7, '+y', glass_win, dark)
    for x in (-5.2, 5.2):
        fine += kit.window('front_win', (x, 1.5, 2.4), 1.8, 1.2, '+y', glass_win, dark)
    for x in (-5.0, -1.7, 1.7, 5.0):
        fine += kit.window('rear_win', (x, -6.5, 2.4), 1.8, 1.2, '-y', glass_win, dark)
    for sign, facing in ((-1, '-x'), (1, '+x')):
        fine += kit.window('side_win', (sign * 7.0, -3.4, 2.4), 2.4, 1.2, facing, glass_win, dark)
    fine.append(kit.block('door', (1.1, 0.08, 2.2), (-3.4, 1.53, 1.22), dark))
    fine.append(kit.block('door_canopy', (1.8, 0.9, 0.1), (-3.4, 1.95, 2.55), roof))
    a.parts_of(fine, levels=(0,))

    a.lod_distances = (110.0, 380.0)
    a.collider_box('shaft', (5.0, 5.0, 19.0), (0, CY, 9.5))
    a.collider_box('cab', (9.8, 9.8, 4.4), (0, CY, 21.1))
    a.collider_box('annex', (14.0, 8.0, 4.5), (0, -2.5, 2.25))
    a.anchor('cab', (0, CY, 20.6))
    a.anchor('beacon', (0, CY, 24.7))
