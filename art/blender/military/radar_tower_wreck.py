"""Radar Cabo Lejano destroyed: the same station (same origin: the tower's axis on the ground) after
the strike. A broken stump stands 7 to 9 m high on the scorched plinth; the tower has toppled
towards +X: two cracked sections lie in a row from the plinth out to x = 24 m, the platform deck
leans on its edge at x = 26 m and the antenna lies bent on the ground at x = 31 m among rubble. The
cabin stands burnt with its door blown out; the radome is gone but for its drum. Needs about 37 m
of clear ground on +X.
"""
import math
import random

import _base_kit as kit
import _radar_parts as rp
from lib import meshkit as mk

ASSET = {'id': 'radar_tower_wreck', 'atlas': 1024, 'kind': 'building', 'views': ((20, 22, 1.15), (160, 12, 1.5, (14, 0, 3)))}


def stump(m):
    rng = random.Random(11)
    sides = 12

    def ring(radius, heights):
        return [(radius * math.cos(2 * math.pi * i / sides), radius * math.sin(2 * math.pi * i / sides), heights[i]) for i in range(sides)]

    crown = [rng.uniform(6.6, 9.2) for _ in range(sides)]
    rings = [ring(rp.RADIUS_FOOT, [rp.TOWER_FOOT] * sides), ring(rp.radius_at(5.6), [5.6] * sides), ring(rp.radius_at(7.5), crown),
             ring(rp.radius_at(7.5) - 0.55, [h - rng.uniform(0.3, 1.4) for h in crown]), ring(0.9, [5.4] * sides)]
    obj = mk.loft('stump', rings)
    mk.assign(obj, m['concrete'])
    mk.assign_faces(obj, m['break'], lambda c, n: c.z > 5.7 and (n.z > 0.2 or c.to_2d().length < rp.radius_at(7.5) - 0.2))
    return obj


def make(a):
    m = rp.materials(scorched=True)
    core = [rp.plinth(m), stump(m)] + rp.cabin(m, door=False)
    core.append(rp.fallen('section_a', 8.5, 17.5, m, (9.6, 0.6, 2.75), (12, 9, 5), seed=4))
    core.append(rp.fallen('section_b', 17.8, 25.4, m, (19.8, -0.9, 1.45), (-20, -1, -13), seed=9))
    deck = kit.drum('deck', 4.6, -0.2, 0.2, m['concrete'], sides=12)
    mk.map_points(deck, lambda v: (v.x, v.y, v.z + (0.5 if v.x > 2.0 and v.y > 0 else 0.0)))
    core.append(mk.transform(deck, (26.2, 1.2, 4.1), (0, 66, 12)))
    core.append(kit.drum('radome_base', 1.5, rp.PLINTH[2], rp.PLINTH[2] + 0.95, m['concrete'], (4.4, 3.3), 12))
    a.parts_of(core, ratios=(0.7, 0.45))

    def crumple(v):
        fold = max(0.0, v.x - 0.8)
        return (v.x - 0.12 * fold * fold, v.y + 0.5 * math.sin(v.x * 1.4) + 0.22 * fold * fold, v.z * (1.0 - 0.07 * abs(v.x)) + 0.3 * math.sin(v.x * 2.3 + v.z))

    bent = mk.join('antenna_wreck', rp.antenna(m, crumple))
    mk.transform(bent, (31.0, -1.8, 1.25), (-78, 6, 32))
    a.part(bent, ratios=(0.6, 0.3))

    loose = [
        kit.rubble('rubble_near', 14, (11.0, -3.6), 5.0, (0.5, 1.7), m['break'], seed=3),
        kit.rubble('rubble_far', 9, (23.0, 3.5), 4.5, (0.4, 1.3), m['concrete'], seed=8),
        kit.rubble('rubble_plinth', 6, (0.5, 4.0), 2.2, (0.4, 1.0), m['break'], seed=5),
    ]
    mk.transform(loose[2], (0, 0, rp.PLINTH[2]))
    a.parts_of(loose, levels=(0, 1), ratios=(0.5, 0.5))

    rng = random.Random(21)
    bars = []
    for k in range(9):
        angle = 2 * math.pi * k / 9 + 0.2
        r = rp.radius_at(7.5) - 0.3
        foot = (r * math.cos(angle), r * math.sin(angle), 6.6)
        bars.append(kit.rod('rebar', [foot, (foot[0] * 1.05, foot[1] * 1.05, 8.6 + rng.uniform(0, 1.2)),
                                      (foot[0] * 1.3 + rng.uniform(0.2, 1.0), foot[1] * 1.3, 9.4 + rng.uniform(0, 1.5))], 0.035, m['dark'], 3))
    a.parts_of(bars, levels=(0,))

    a.lod_distances = (140.0, 480.0)
    a.collider_box('plinth', rp.PLINTH, (0, 0, 0.6))
    a.collider_box('stump', (4.8, 4.8, 7.4), (0, 0, 4.9))
    a.collider_box('cabin', rp.CABIN, (rp.CABIN_AT[0], rp.CABIN_AT[1], 2.7))
    a.collider_box('section_a', (9.2, 4.6, 4.6), (9.6, 0.6, 2.5))
    a.collider_box('section_b', (7.8, 4.6, 3.4), (19.8, -0.9, 1.7))
    a.collider_box('deck', (3.6, 9.0, 8.2), (26.2, 1.2, 4.1))
    a.collider_box('antenna', (7.5, 8.0, 2.6), (31.0, -1.8, 1.3))
