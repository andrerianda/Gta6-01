"""The bank's seal on a door: two red and white tapes 1.4 m long crossed corner to corner (they span
a 0.9 m door leaf) and, stuck over the crossing, a 40 x 30 cm paper notice SEALED BY ORDER OF
BANCO MERIDIANO. Origin at the centre of the back (the face against the glass); the lettering faces
the asset's front (+Y here, the game's -Z). Seen from behind, the paper and the tapes show blank.
"""
import math

import _story_kit as kit
import paint
from lib import surfaces as sf

ASSET = {'id': 'bank_seal_notice', 'atlas': 2048, 'kind': 'prop', 'views': ((10, 4, 1.0),), 'ground': False}
LENGTH, WIDTH, ANGLE = 1.4, 0.05, 50.0


def make(a, work_dir):
    blank = sf.coated('seal_back', '#cfcab8', 0.7, 0.0, 0.25, grain=0.1)
    tape_image = paint.seal_tape(work_dir)
    c, s = math.cos(math.radians(ANGLE)), math.sin(math.radians(ANGLE))
    for index, sign in enumerate((1, -1)):
        u = (-LENGTH * c, 0, LENGTH * s * sign)
        v = (WIDTH * s * sign, 0, WIDTH * c)
        origin = (-0.5 * (u[0] + v[0]), 0.0012 + 0.0012 * index, -0.5 * (u[2] + v[2]))
        wave = lambda p, t, k=index: 0.0012 * math.sin(p * 23.0 + k * 2.0) * math.sin(math.pi * p) + 0.0004 * math.sin(p * 71.0)
        tape = kit.printed_panel('tape%d' % index, tape_image, origin, u, v, 28, 1, wave, roughness=0.4, bump=0.0)
        a.add(tape, 1.0)
        a.add(kit.backing(tape, blank), 0.25)
    w, h = 0.40, 0.30
    curl = lambda p, t: 0.0035 + 0.004 * ((2 * p - 1) ** 2 * (2 * t - 1) ** 2) ** 1.5 + 0.001 * math.sin(math.pi * t * 2)
    notice = kit.printed_panel('notice', paint.seal_notice(work_dir), (w / 2, 0, -h / 2), (-w, 0, 0), (0, 0, h), 8, 6, curl, roughness=0.6)
    a.add(notice, 2.0)
    a.add(kit.backing(notice, blank), 0.3)
    a.occlusion_distance = 0.03
