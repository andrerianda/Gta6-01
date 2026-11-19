"""A heavy weathered tarpaulin closing a hangar mouth in two halves, `curtain_l` (x -13..0) and
`curtain_r` (x 0..13), each 13 m wide and 13 m high in the plane y = 0, olive-grey: deep hanging
folds that grow towards the ground, seamed strips, brass eyelets on a head cable, a rope hem and
sewn patches. Each half's origin is its TOP OUTER corner, so the game draws it aside by scaling or
sliding it along X.
"""
import math
import random

import _base_kit as kit
import _hk as hk
from lib import meshkit as mk

WIDTH, HEIGHT = 13.0, 13.0
COLUMNS, ROWS = 44, 12


def make(a, work_dir):
    tarp = kit.weathered('tarp', '#5c6052', 0.93, 0.0, 0.8, seams=(1.62, 40.0), seam_width=0.035, projection='front', stagger=False)
    patch_a = hk.canvas('tarp_patch', '#6e715e', 0.6, 0.35)
    patch_b = hk.canvas('tarp_patch_dark', '#44483d', 0.7, 0.35)
    rope = hk.canvas('tarp_rope', '#8a7c5c', 0.5, 0.4)
    brass = kit.galvanised('eyelet', '#9a8a5a')
    steel = kit.galvanised('head_cable', '#6e7275')

    for sx, side in ((-1, 'l'), (1, 'r')):
        rng = random.Random(3 if sx < 0 else 8)
        phase = [rng.uniform(0, 6.28) for _ in range(4)]

        def fold(x, z):
            """Depth (y) of the cloth at x (0 = the centre edge .. 13 = the outer edge) and height z."""
            low = 1.0 - z / HEIGHT
            deep = 0.1 + 0.3 * low ** 1.3
            y = deep * math.sin(2 * math.pi * x / 1.3 + phase[0] + 0.5 * low * math.sin(x * 0.9 + phase[1]))
            y += 0.12 * low * math.sin(2 * math.pi * x / 4.1 + phase[2]) + 0.03 * math.sin(z * 2.3 + x * 1.7 + phase[3])
            return y

        def point(x, z, offset=0.0):
            return (sx * x, fold(x, z) + offset, z)

        rows = []
        for j in range(ROWS + 1):
            z = HEIGHT * (1 - j / ROWS) ** 1.0
            row = []
            for i in range(COLUMNS + 1):
                x = WIDTH * i / COLUMNS
                top = z - 0.07 * abs(math.sin(math.pi * x / 0.65)) if j == 0 else max(z, 0.04 + 0.03 * math.sin(x * 2.0))
                row.append(point(x, top))
            rows.append(row)
        cloth = hk.sheet('cloth_' + side, rows, tarp)
        parts = [hk.two_sided(cloth)]
        # sewn patches on both faces
        for k, (x0, z0, w, h, material) in enumerate(((2.2, 3.1, 1.5, 1.1, patch_a), (7.6, 7.4, 1.1, 1.6, patch_b), (10.1, 1.6, 1.8, 0.9, patch_a),
                                                      (4.9, 10.2, 0.9, 0.8, patch_b))):
            x0 += rng.uniform(-0.5, 0.5)
            for face, offset in ((1, 0.018), (-1, -0.018)):
                grid = [[point(x0 + w * i / 8, z0 + h * j / 3, offset) for i in range(9)] for j in range(4)]
                parts.append(hk.sheet('patch%d' % k, grid, material, (sx * x0, -50.0 * face, z0), True))
        # eyelets on the head cable, the rope hem along the foot and both edges
        for i in range(20):
            x = 0.325 + 0.65 * i
            parts.append(mk.assign(mk.cylinder('eyelet', 0.045, 0.06, point(x, HEIGHT - 0.1), 'Y', 8), brass))
            parts.append(kit.rod('lacing', [point(x, HEIGHT - 0.1), (sx * x, 0.0, HEIGHT + 0.03)], 0.008, rope, 3))
        parts.append(kit.rod('cable', [(0.0, 0.0, HEIGHT + 0.03), (sx * WIDTH, 0.0, HEIGHT + 0.03)], 0.02, steel, 5))
        parts.append(mk.shade(kit.rod('foot_rope', [point(WIDTH * i / COLUMNS, max(0.04, 0.04 + 0.03 * math.sin(WIDTH * i / COLUMNS * 2.0))) for i in range(COLUMNS + 1)],
                                      0.035, rope, 5), 60))
        for x in (0.0, WIDTH):
            parts.append(mk.shade(kit.rod('edge_rope', [point(x, HEIGHT * j / ROWS) for j in range(ROWS + 1)], 0.03, rope, 5), 60))
        half = mk.join('curtain_' + side, parts)
        a.add(mk.set_origin(half, (sx * WIDTH, 0.0, HEIGHT)))
    a.extra('half', {'width': WIDTH, 'height': HEIGHT})
