"""Guard watchtower of the air base (an original design), 9.2 m: four tapering steel legs on
concrete footings with girts and cross bracing, a plank deck at 6 m, a cabin of corner posts with a
sandbag parapet (four staggered courses, a gap at the back where the ladder arrives), a corrugated
gable roof on light trusses, a searchlight on a bracket at the front right corner (its lens is the
node lamp_search with the emissive material lamp_search), a caged ladder up the back, a loudspeaker
horn and a conduit down one leg.

Blender axes: front (the way the searchlight looks) +Y, origin on the ground at the footprint's
centre. In the file everything hangs under one root node `base_watchtower`: lod0 / lod1 / lod2,
lamp_search, anchor_search (along the beam), anchor_guard (on the deck), col_box_legs, col_box_cabin.
"""
import math
import random

import _base_kit as kit
import _ground_kit as gk
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'base_watchtower', 'atlas': 1024, 'kind': 'building', 'views': ((28, 10, 1.0), (200, 24, 1.9, (0, 0, 7.4)))}

DECK = 6.0
BASE, TOP = 1.5, 1.25      # half spacing of the legs on the ground and under the deck


def half(z):
    """Half spacing of the legs at height z."""
    return BASE + (TOP - BASE) * (z - 0.3) / (DECK - 0.12 - 0.3)


def corrugated(name, x0, x1, low, high, material, pitch=0.16, depth=0.045):
    """The top of a corrugated sheet from the eave (y, z) `low` to the ridge (y, z) `high`: a zigzag
    across x (two points per wave), smooth shaded so it reads as round corrugations."""
    dy, dz = high[0] - low[0], high[1] - low[1]
    length = math.hypot(dy, dz)
    ny, nz = -dz / length, dy / length
    if nz < 0:
        ny, nz = -ny, -nz
    count = int(round((x1 - x0) / pitch * 2))
    first, second = [], []
    for i in range(count + 1):
        x = x0 + (x1 - x0) * i / count
        d = 0.5 * depth * (1 if i % 2 else -1)
        first.append((x, low[0] + ny * d, low[1] + nz * d))
        second.append((x, high[0] + ny * d, high[1] + nz * d))
    return kit.strip(name, first, second, material, look_from=(0, 0, -50), smooth=True)


def make(a):
    steel = kit.weathered('tower_steel', '#4b5341', 0.6, 0.4, 0.65, soot='#6c3c22', soot_range=(0.52, 0.66))
    sheet = kit.weathered('roof_sheet', '#8d9193', 0.48, 0.8, 0.55, soot='#7b4a2b', soot_range=(0.5, 0.66))
    wood = sf.coated('deck_planks', '#75654a', 0.88, 0.0, 0.6, panels=(3.6, 0.2), projection='top')
    cloth = kit.weathered('sandbag', '#9b8e6c', 0.95, 0.0, 0.7)
    concrete = kit.concrete('concrete', '#8f8a7f', seams=None, wear=0.6)
    dark = kit.painted_steel('housing', '#2c302e', 0.5, 0.4)
    lamp = sf.lamp('lamp_search', '#fff6e0', 10.0)
    rng = random.Random(4)
    corners = ((1, 1), (-1, 1), (-1, -1), (1, -1))

    # --- legs, girts, bracing, footings -----------------------------------------------------------
    frame, braces = [], []
    for sx, sy in corners:
        frame.append(gk.bar('leg', [(sx * BASE, sy * BASE, 0.3), (sx * TOP, sy * TOP, DECK - 0.12)], 0.095, steel, 4))
        frame.append(kit.block('footing', (0.75, 0.75, 0.36), (sx * BASE, sy * BASE, 0.18), concrete, bevel=0.02))
        frame.append(kit.block('base_plate', (0.34, 0.34, 0.03), (sx * BASE, sy * BASE, 0.375), steel))
    levels = (0.55, 2.3, 4.1, DECK - 0.2)
    for z in levels:
        h = half(z)
        for (ax, ay), (bx, by) in zip(corners, corners[1:] + corners[:1]):
            frame.append(gk.bar('girt', [(ax * h, ay * h, z), (bx * h, by * h, z)], 0.055, steel, 4))
    for z0, z1 in zip(levels, levels[1:]):
        h0, h1 = half(z0), half(z1)
        for (ax, ay), (bx, by) in zip(corners, corners[1:] + corners[:1]):
            braces.append(gk.bar('brace', [(ax * h0, ay * h0, z0), (bx * h1, by * h1, z1)], 0.034, steel, 3))
            braces.append(gk.bar('brace', [(bx * h0, by * h0, z0), (ax * h1, ay * h1, z1)], 0.034, steel, 3))
        middle = 0.5 * (z0 + z1)
        for (ax, ay), (bx, by) in zip(corners, corners[1:] + corners[:1]):
            hm = half(middle)
            braces.append(kit.block('gusset', (0.2, 0.2, 0.012), (0.5 * (ax + bx) * hm, 0.5 * (ay + by) * hm, middle), steel,
                                    (90, 0, 0) if ay == by else (0, 90, 0)))

    # --- deck and cabin -----------------------------------------------------------------------------
    deck = [kit.block('deck', (3.5, 3.5, 0.1), (0, 0, DECK - 0.05), wood, bevel=0.01)]
    deck += [kit.block('joist', (3.4, 0.09, 0.14), (0, y, DECK - 0.17), steel) for y in (-1.3, -0.45, 0.45, 1.3)]
    deck += [kit.block('rim', (3.56, 0.05, 0.2), (0, sy * 1.76, DECK - 0.08), steel) for sy in (-1, 1)]
    deck += [kit.block('rim', (0.05, 3.56, 0.2), (sx * 1.76, 0, DECK - 0.08), steel) for sx in (-1, 1)]
    posts = [kit.block('post', (0.11, 0.11, 2.5), (sx * 1.62, sy * 1.62, DECK + 1.25), steel) for sx, sy in corners]
    posts += [kit.block('ring_beam', (3.35, 0.09, 0.13), (0, sy * 1.62, DECK + 2.44), steel) for sy in (-1, 1)]
    posts += [kit.block('ring_beam', (0.09, 3.35, 0.13), (sx * 1.62, 0, DECK + 2.44), steel) for sx in (-1, 1)]
    posts += [kit.block('sill', (3.1, 0.06, 0.05), (0, 1.62, DECK + 1.02), steel), kit.block('sill', (0.06, 3.1, 0.05), (1.62, 0, DECK + 1.02), steel),
              kit.block('sill', (0.06, 3.1, 0.05), (-1.62, 0, DECK + 1.02), steel)]
    bags, bag_blocks = [], []
    size = (0.7, 0.3, 0.2)
    for course in range(4):
        z = DECK + 0.1 + 0.2 * course
        shift = 0.35 if course % 2 else 0.0
        for side, (ux, uy, nx, ny) in enumerate(((1, 0, 0, 1), (0, 1, 1, 0), (1, 0, 0, -1), (0, 1, -1, 0))):
            for k in range(-2, 2):
                t = (k + 0.5) * 0.72 + shift * (1 if side % 2 == 0 else -1)
                if abs(t) > 1.5:
                    continue
                if side == 2 and abs(t) < 0.55:      # the gap where the ladder comes up
                    continue
                x, y = ux * t + nx * 1.4, uy * t + ny * 1.4
                bags.append(gk.pillow('bag', (0.74, 0.34, 0.24), (x, y, z), 0 if ux else 90, cloth, rng))
    for side, (ux, uy, nx, ny) in enumerate(((1, 0, 0, 1), (0, 1, 1, 0), (1, 0, 0, -1), (0, 1, -1, 0))):
        spans = ((-1.55, -0.6), (0.6, 1.55)) if side == 2 else ((-1.55, 1.55),)
        for t0, t1 in spans:
            length, middle = t1 - t0, 0.5 * (t0 + t1)
            bag_blocks.append(kit.block('bag_wall', (length if ux else 0.3, 0.3 if ux else length, 0.82),
                                        (ux * middle + nx * 1.4, uy * middle + ny * 1.4, DECK + 0.41), cloth))

    # --- roof ---------------------------------------------------------------------------------------
    eave, ridge = 8.5, 9.2
    roof = [corrugated('roof_front', -2.2, 2.2, (2.2, eave), (0.0, ridge), sheet), corrugated('roof_back', -2.2, 2.2, (-2.2, eave), (0.0, ridge), sheet)]
    roof_flat = [kit.strip('roof_flat', [(-2.2, sy * 2.2, eave), (2.2, sy * 2.2, eave)], [(-2.2, 0, ridge), (2.2, 0, ridge)], sheet, look_from=(0, 0, -50))
                 for sy in (-1, 1)]
    # what you see of the roof from the ground: a plain underside just below the corrugated top
    under = [kit.strip('roof_under', [(-2.2, sy * 2.2, eave - 0.03), (2.2, sy * 2.2, eave - 0.03)], [(-2.2, 0, ridge - 0.03), (2.2, 0, ridge - 0.03)], sheet,
                       look_from=(0, 0, 50)) for sy in (-1, 1)]
    trusses = [gk.bar('ridge_cap', [(-2.22, 0, ridge + 0.03), (2.22, 0, ridge + 0.03)], 0.07, sheet, 6)]
    for x in (-1.62, 1.62):
        trusses.append(gk.bar('rafter', [(x, -2.05, eave - 0.01), (x, 0, ridge - 0.06), (x, 2.05, eave - 0.01)], 0.04, steel, 4))
        trusses.append(gk.bar('king_post', [(x, 0, DECK + 2.5), (x, 0, ridge - 0.08)], 0.034, steel, 3))
    for y in (-1.1, 1.1):
        trusses.append(gk.bar('purlin', [(-2.1, y, eave + 0.3), (2.1, y, eave + 0.3)], 0.035, steel, 4))

    # --- searchlight, horn, conduit -------------------------------------------------------------------
    light_at, tilt = (1.62, 2.02, DECK + 1.72), -12
    housing = [mk.assign(mk.cylinder('light_body', 0.27, 0.42, (0, -0.02, 0), 'Y', 14), dark),
               mk.assign(mk.cylinder('light_rim', 0.3, 0.06, (0, 0.2, 0), 'Y', 14), dark),
               mk.assign(mk.cylinder('light_back', 0.2, 0.1, (0, -0.27, 0), 'Y', 10, 0.12), dark)]
    housing = [mk.shade(mk.transform(part, light_at, (tilt, 0, 0)), 50) for part in housing]
    lens = mk.transform(mk.assign(mk.cylinder('lamp_search', 0.255, 0.02, (0, 0.225, 0), 'Y', 14), lamp), light_at, (tilt, 0, 0))
    fittings = [kit.block('light_bracket', (0.08, 0.5, 0.08), (1.62, 1.84, DECK + 1.36), steel),
                gk.bar('light_yoke', [(1.3, 2.0, DECK + 1.72), (1.3, 2.0, DECK + 1.38), (1.94, 2.0, DECK + 1.38), (1.94, 2.0, DECK + 1.72)], 0.03, steel, 4),
                gk.bar('conduit', [(1.55, 1.62, DECK + 1.3), (1.5, 1.5, DECK - 0.1), (BASE + 0.02, BASE + 0.02, 0.5)], 0.02, dark, 4)]
    horn = mk.assign(mk.cylinder('horn', 0.06, 0.4, (0, 0, 0), 'Y', 10, 0.2), sheet)
    fittings.append(mk.shade(mk.transform(horn, (-1.62, 1.9, DECK + 2.25), (-8, 0, 0)), 50))
    fittings.append(kit.block('horn_arm', (0.05, 0.3, 0.05), (-1.62, 1.72, DECK + 2.25), steel))

    # --- ladder with its cage -----------------------------------------------------------------------
    def ladder_y(z):
        return -2.3 + 0.5 * min(z, DECK) / DECK

    ladder = [gk.bar('ladder_rail', [(sx * 0.24, ladder_y(0), 0.0), (sx * 0.24, ladder_y(DECK), DECK), (sx * 0.24, -1.76, DECK + 1.1)], 0.03, steel, 4)
              for sx in (-1, 1)]
    rungs = []
    z = 0.35
    while z < DECK:
        rungs.append(gk.bar('rung', [(-0.24, ladder_y(z), z), (0.24, ladder_y(z), z)], 0.02, steel, 3))
        z += 0.3
    for z in (2.3, 4.1):
        for sx in (-1, 1):
            rungs.append(gk.bar('standoff', [(sx * 0.24, ladder_y(z), z), (sx * 0.3, -half(z), z)], 0.022, steel, 3))
    cage = []
    hoop_zs = [2.6 + 0.8 * i for i in range(5)]
    for z in hoop_zs:
        y = ladder_y(z)
        cage.append(gk.bar('hoop', [(0.36 * math.cos(t), y - 0.04 - 0.62 * math.sin(t), z) for t in (math.pi * i / 6 for i in range(7))], 0.017, steel, 3))
    for t in (math.pi * 0.2, math.pi * 0.5, math.pi * 0.8):
        cage.append(gk.bar('strap', [(0.36 * math.cos(t), ladder_y(z) - 0.04 - 0.62 * math.sin(t), z) for z in (hoop_zs[0], hoop_zs[-1])], 0.015, steel, 3))

    gussets = [p for p in braces if p.name.startswith('gusset')]
    braces = [p for p in braces if not p.name.startswith('gusset')]
    # Levels: the file's size is its vertices, so the far levels keep only what still shows.
    pick = lambda parts, *names: [p for p in parts if p.name.split('.')[0] in names]
    rest = lambda parts, *names: [p for p in parts if p.name.split('.')[0] not in names]
    a.parts_of(pick(frame, 'leg') + pick(deck, 'deck') + pick(posts, 'post') + pick(housing, 'light_body') + under)
    a.parts_of(rest(frame, 'leg', 'base_plate') + braces + pick(deck, 'rim') + pick(posts, 'ring_beam') + ladder, levels=(0, 1))
    a.parts_of(pick(frame, 'base_plate') + gussets + pick(deck, 'joist') + pick(posts, 'sill') + rest(housing, 'light_body') + trusses + fittings
               + rungs + cage + bags + roof, levels=(0,))
    a.parts_of(bag_blocks + roof_flat, levels=(1, 2))
    a.moving(lens, light_at)

    a.lod_distances = (60.0, 200.0)
    a.collider_box('legs', (3.4, 3.4, DECK), (0, 0, DECK * 0.5))
    a.collider_box('cabin', (3.6, 3.6, 3.2), (0, 0, DECK + 1.6))
    a.anchor('search', (light_at[0], light_at[1] + 0.25, light_at[2] - 0.05), (tilt, 0, 0))
    a.anchor('guard', (0, 0, DECK))
    a.extra('deck_height', DECK)
    gk.hook_finish(a, root='base_watchtower',
                   images={'atlas.base': (1024, 80), 'atlas.orm': (512, 74), 'atlas.normal': (1024, 72)},
                   numbers=lambda: {'sheet': gk.preview('/tmp/marazul/flight/s4/a4-base-ground/sheets/base_watchtower.jpg',
                                                        ((28, 10, 1.0), (205, 22, 2.0, (0, 0, 7.3))), (640, 440))})
