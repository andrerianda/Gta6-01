"""Parts shared by radar_tower and radar_tower_wreck: the materials, the plinth, the equipment cabin,
tower sections and the antenna (turntable, curved reflector with its back frame, feed boom).

The antenna parts are built around the origin with the turntable base at z = 0 and the reflector
looking towards +Y; a `warp` function (Vector -> (x, y, z)) bends them for the wreck.
"""
import math
import random

import _base_kit as kit
from lib import meshkit as mk
from lib import surfaces as sf

PLINTH = (14.0, 12.0, 1.2)
CABIN_AT = (-4.6, -3.7)
CABIN = (4.6, 3.8, 3.0)
TOWER_FOOT, TOWER_TOP = 1.2, 26.0
RADIUS_FOOT, RADIUS_TOP = 2.5, 1.5
ANTENNA_BASE = 28.4


def materials(scorched=False):
    soot = '#141211' if scorched else None
    return {
        'concrete': kit.weathered('concrete', '#8f8a7f', 0.9, 0.0, 0.8 if scorched else 0.5, seams=(7.85, 3.1), seam_width=0.06,
                                  projection='front', soot=soot, soot_range=(0.36, 0.58)),
        'plinth': kit.weathered('plinth', '#858076', 0.9, 0.0, 0.8 if scorched else 0.6, soot=soot, soot_range=(0.4, 0.62)),
        'cabin': kit.weathered('cabin', '#9a9a8c', 0.7, 0.1, 0.8 if scorched else 0.45, seams=(1.15, 3.2), seam_width=0.03,
                               projection='front', soot=soot, soot_range=(0.34, 0.55)),
        'white': kit.weathered('reflector', '#b9bbb6', 0.6, 0.2, 0.8 if scorched else 0.4, seams=(0.75, 0.74), seam_width=0.05,
                               projection='front', soot=soot, soot_range=(0.4, 0.6), stagger=False),
        'steel': kit.weathered('steel', '#70767a', 0.5, 0.8, 0.8 if scorched else 0.4, soot=soot),
        'dark': kit.painted_steel('dark', '#2a2d2c', 0.5, 0.5),
        'break': kit.weathered('fracture', '#958f83', 0.95, 0.0, 0.5),
    }


def radius_at(z):
    return RADIUS_FOOT + (RADIUS_TOP - RADIUS_FOOT) * (z - TOWER_FOOT) / (TOWER_TOP - TOWER_FOOT)


def plinth(m):
    return kit.block('plinth', PLINTH, (0, 0, PLINTH[2] * 0.5), m['plinth'])


def cabin(m, door=True):
    x, y = CABIN_AT
    z = PLINTH[2]
    parts = [
        kit.block('cabin', CABIN, (x, y, z + CABIN[2] * 0.5), m['cabin']),
        kit.block('cabin_roof', (CABIN[0] + 0.4, CABIN[1] + 0.4, 0.14), (x, y, z + CABIN[2] + 0.07), m['steel']),
        kit.block('cabin_cooler', (1.1, 0.5, 0.9), (x + 1.0, y - CABIN[1] * 0.5 - 0.25, z + 1.6), m['steel']),
        kit.block('cabin_door', (1.0, 0.07, 2.1), (x - 0.8, y + CABIN[1] * 0.5 + 0.03, z + 1.05), m['dark'] if door else m['break']),
    ]
    return parts


def section(name, z0, z1, m, sides=12):
    """An upright piece of the tapered tower between two heights."""
    return kit.drum(name, radius_at(z0), z0, z1, m['concrete'], sides=sides, radius_top=radius_at(z1))


def fallen(name, z0, z1, m, centre, rotation, sides=12, seed=1):
    """A piece of the tower lying on its side (its axis along X before the rotation), ends broken."""
    length = z1 - z0
    rng = random.Random(seed)
    obj = mk.cylinder(name, radius_at(z0), length, (0, 0, 0), 'X', sides, radius_at(z1))
    jag = [rng.uniform(-0.7, 0.7) for _ in range(sides * 2)]
    mk.map_points(obj, lambda v: (v.x + jag[int((math.atan2(v.z, v.y) + math.pi) / (2 * math.pi) * sides) % sides + (sides if v.x > 0 else 0)],
                                  v.y, v.z * 0.94))
    mk.assign(obj, m['concrete'])
    mk.assign_faces(obj, m['break'], lambda c, n: abs(n.x) > 0.6)
    mk.transform(obj, centre, rotation)
    return mk.shade(obj, 50)


def platform(m, z=TOWER_TOP):
    """The deck under the antenna (around the origin at height z): soffit, slab, pedestal."""
    return [
        kit.drum('soffit', radius_at(z - 1.3) + 0.05, z - 1.3, z, m['concrete'], sides=12, radius_top=4.1),
        kit.drum('deck', 4.6, z, z + 0.4, m['concrete'], sides=12),
        kit.drum('pedestal', 1.15, z + 0.4, ANTENNA_BASE, m['steel'], sides=12),
    ]


def reflector_point(u, v):
    """A point of the reflector: u across (-1..1, 9 m), v up (0..1, 4.4 m), dished towards +Y."""
    x = 4.5 * u
    z = 0.75 + 4.4 * v
    y = 0.105 * x * x + 0.07 * (z - 2.95) ** 2 - 1.45
    return (x, y, z)


def antenna(m, warp=None):
    """The rotating antenna's parts around its vertical axis, the turntable base at z = 0."""
    nu, nv = 12, 5
    verts = [reflector_point(-1 + 2 * i / nu, j / nv) for j in range(nv + 1) for i in range(nu + 1)]
    faces = [(j * (nu + 1) + i, j * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i) for j in range(nv) for i in range(nu)]
    dish = mk.mesh_object('dish', verts, faces)
    kit.orient(dish, (0, 30, 3), False)
    mk.solidify(dish, 0.07)
    mk.assign(dish, m['white'])
    mk.shade(dish, 40)
    parts = [dish, kit.drum('turntable', 1.3, 0.0, 0.45, m['steel'], sides=12), kit.block('yoke', (2.2, 0.9, 0.7), (0, -0.5, 0.75), m['steel'])]
    for v in (0.08, 0.5, 0.92):
        path = [reflector_point(-1 + 2 * i / 6, v) for i in range(7)]
        parts.append(kit.rod('rib', [(p[0], p[1] - 0.16, p[2]) for p in path], 0.08, m['steel']))
    for u in (-0.75, -0.25, 0.25, 0.75):
        path = [reflector_point(u, j / 3) for j in range(4)]
        parts.append(kit.rod('spar', [(p[0], p[1] - 0.2, p[2]) for p in path], 0.07, m['steel']))
    for sign in (-1, 1):
        parts.append(kit.rod('strut', [(sign * 0.9, -0.6, 1.0), (sign * 2.6, -0.95, 4.3)], 0.07, m['steel']))
    parts.append(kit.rod('feed_boom', [(0, -1.0, 0.95), (0, 2.9, 2.6)], 0.07, m['steel']))
    parts.append(kit.block('feed_horn', (0.6, 0.45, 0.5), (0, 3.0, 2.75), m['dark'], (25, 0, 0)))
    if warp:
        for part in parts:
            mk.map_points(part, warp)
    return parts


def radome(m, at=(4.4, 3.3), radius=2.0, z=PLINTH[2]):
    """A small faceted radome on a drum."""
    rings = []
    for k in range(6):
        lat = math.radians(-35 + 24 * k)
        r, h = radius * math.cos(lat), z + 2.0 + radius * math.sin(lat)
        rings.append([(at[0] + r * math.cos(2 * math.pi * i / 12 + 0.26 * k), at[1] + r * math.sin(2 * math.pi * i / 12 + 0.26 * k), h) for i in range(12)])
    dome = mk.assign(mk.loft('radome', rings), m['white'])
    return [dome, kit.drum('radome_base', 1.5, z, z + 0.95, m['concrete'], at, 12)]
