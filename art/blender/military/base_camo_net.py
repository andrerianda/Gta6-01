"""Camouflage netting draped on poles (an original design), 24 x 18 m over the pegs and 6.2 m high:
a 22 x 16 m net hung on eight 6 m main poles (two rows of four, 8 m apart) and on a ring of hem
poles, sagging between them. The front hem (+Y in Blender, the game's -Z) is propped 4 m high so
vehicles drive in; the sides and the back come down to 2 m. Guy ropes run from every hem pole to
two steel pegs, ridge ropes sag between the main pole tops, sandbags weigh the pole feet.

The net is the alpha-tested material cutout_net: its texture is baked from real geometry (a knotted
cord mesh with scrim strips and ragged patches in two greens and a brown, _ground_kit.net_source),
about half of it see-through; its UVs follow the sagging surface and drift slowly, so the repeats of
the 3 m tile do not line up in rows.

In the file everything hangs under one root node `base_camo_net`: lod0 / lod1 / lod2, anchor_park,
col_box_pole_1..8.
"""
import math
import random

import _base_kit as kit
import _ground_kit as gk
from lib import meshkit as mk

ASSET = {'id': 'base_camo_net', 'atlas': 512, 'kind': 'building', 'views': ((25, 18, 1.1), (160, 55, 1.2))}
WORK = '/tmp/marazul/flight/s4/a4-base-ground/base_camo_net'

MAIN = [(x, y, 6.0) for y in (-4.0, 4.0) for x in (-9.0, -3.0, 3.0, 9.0)]
HEM = ([(x, 8.0, 4.0) for x in (-11.0, -5.5, 0.0, 5.5, 11.0)] + [(x, -8.0, 2.0) for x in (-11.0, -5.5, 0.0, 5.5, 11.0)]
       + [(sx * 11.0, y, h) for sx in (-1, 1) for y, h in ((4.0, 3.1), (0.0, 2.4), (-4.0, 2.0))])
SUPPORTS = MAIN + HEM
TILE = 3.0


def net_height(x, y):
    """Height of the net: hung from the supports (inverse-distance blend) and sagging between them."""
    total, weight, nearest = 0.0, 0.0, 1e9
    for sx, sy, h in SUPPORTS:
        d2 = (x - sx) ** 2 + (y - sy) ** 2
        w = 1.0 / (d2 + 0.25) ** 2
        total, weight, nearest = total + w * h, weight + w, min(nearest, d2)
    sag = 0.13 * math.sqrt(nearest) ** 1.3
    return total / weight - sag, sag


def net_grid(columns, rows, rng):
    grid, sags = [], []
    for r in range(rows):
        y = -8.0 + 16.0 * r / (rows - 1)
        row, sag_row = [], []
        for c in range(columns):
            x = -11.0 + 22.0 * c / (columns - 1)
            z, sag = net_height(x, y)
            inside = 0 < c < columns - 1 and 0 < r < rows - 1
            row.append((x, y, z + (rng.uniform(-0.05, 0.05) if inside else 0.0)))
            sag_row.append(sag)
        grid.append(row)
        sags.append(sag_row)
    return grid, sags


def net_mesh(name, columns, rows, material):
    rng = random.Random(9)
    grid, sags = net_grid(columns, rows, rng)
    return mk.assign(gk.draped_sheet(name, grid, TILE), material)


def make(a):
    pole = kit.weathered('pole_olive', '#454b33', 0.7, 0.3, 0.6, soot='#6a3f24', soot_range=(0.55, 0.68))
    rope = kit.weathered('guy_rope', '#8c7f5d', 0.95, 0.0, 0.5)
    peg = kit.galvanised('peg_steel', '#7d8183')
    cloth = kit.weathered('sandbag', '#93876a', 0.95, 0.0, 0.7)
    texture, numbers = gk.net_texture(WORK + '/net.png', TILE, 512)
    net = gk.image_material('cutout_net', texture, 0.95)

    poles, rigging, bags, details, pegs = [], [], [], [], []
    rng = random.Random(3)
    for index, (x, y, h) in enumerate(MAIN):
        poles.append(gk.bar('main_pole', [(x, y, 0.0), (x, y, h + 0.02)], 0.065, pole, 6))
        details.append(gk.bar('pole_spike', [(x, y, h), (x, y, h + 0.2)], [0.03, 0.004], pole, 3))
        details.append(kit.drum('spreader', 0.32, h - 0.05, h, pole, (x, y), 8, 0.2))
        details.append(kit.block('foot_plate', (0.4, 0.4, 0.03), (x, y, 0.015), pole))
        for k in range(3):
            angle = 2.1 * k + index
            bags.append(gk.pillow('pole_bag', (0.7, 0.34, 0.22), (x + 0.3 * math.cos(angle), y + 0.3 * math.sin(angle), 0.1 + 0.02 * k),
                                  math.degrees(angle) + 90, cloth, rng))
        a.collider_box('pole_%d' % (index + 1), (0.3, 0.3, h), (x, y, h * 0.5))
    for row in (MAIN[:4], MAIN[4:]):      # ridge ropes sagging between the pole tops
        for (x0, y0, h0), (x1, y1, h1) in zip(row, row[1:]):
            rigging.append(gk.bar('ridge_rope', [(x0 + (x1 - x0) * t, y0, h0 + 0.1 - 0.5 * math.sin(math.pi * t)) for t in (i / 4 for i in range(5))], 0.02, rope, 3))
    for x, y, h in HEM:
        ox = (1 if x > 10.5 else -1 if x < -10.5 else 0)
        oy = (1 if y > 7.5 else -1 if y < -7.5 else 0)
        length = math.hypot(ox, oy)
        ox, oy = ox / length, oy / length
        foot = (x - ox * 0.12 * h * 0.3, y - oy * 0.12 * h * 0.3, 0.0)
        poles.append(gk.bar('hem_pole', [foot, (x, y, h + 0.08)], [0.045, 0.03], pole, 4))
        for side in (-1, 1):
            px, py = x + ox * 1.0 - oy * side * 0.75, y + oy * 1.0 + ox * side * 0.75
            px, py = max(-12.0, min(12.0, px)), max(-9.0, min(9.0, py))
            rigging.append(gk.bar('guy', [(x, y, h), (px, py, 0.06)], 0.016, rope, 3))
            pegs.append(gk.bar('peg',[(px + ox * 0.03, py + oy * 0.03, 0.32), (px - ox * 0.08, py - oy * 0.08, 0.0)], [0.028, 0.012], peg, 3))

    a.parts_of(poles)
    a.parts_of(rigging, levels=(0, 1))
    a.parts_of(bags + details + pegs, levels=(0,))
    a.part(net_mesh('net0', 45, 33, net), levels=(0,))
    a.part(net_mesh('net1', 23, 17, net), levels=(1,))
    a.part(net_mesh('net2', 12, 9, net), levels=(2,))

    a.lod_distances = (90.0, 300.0)
    a.anchor('park', (0.0, 0.0, 0.0))
    a.extra('net_tile', TILE)
    a.extra('clear_height', 4.6)
    gk.hook_finish(a, root='base_camo_net', images={'atlas.base': (512, 78), 'atlas.orm': (256, 78), 'atlas.normal': (512, 70), 'cutout_net.base': (512, 82)},
                   numbers=lambda: dict(numbers, sheet=gk.preview('/tmp/marazul/flight/s4/a4-base-ground/sheets/base_camo_net.jpg',
                                                                   ((25, 12, 1.15), (150, 62, 1.25), (30, 4, 4.5, (2.0, 7.5, 3.6))), (640, 380))))
