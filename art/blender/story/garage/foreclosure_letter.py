"""The bank's letter: an A4 sheet (210 x 297 mm) that has been folded in three and flattened again,
its corners lifting. Letterhead of the invented Banco Meridiano, the heading FINAL NOTICE OF
FORECLOSURE, body text as lines, a red stamp 30 DAYS. It lies flat: origin under its centre, the
printed side up, the top of the page towards the asset's front (+Y here, the game's -Z).
"""
import math

import _story_kit as kit
import paint
from lib import surfaces as sf

ASSET = {'id': 'foreclosure_letter', 'atlas': 1024, 'kind': 'prop', 'views': ((180, 62, 1.25),)}
W, H = 0.210, 0.297


def lift(s, t):
    fold = 0.0035 * (1.0 - abs(math.sin(3 * math.pi * t))) * (1.0 if 0.02 < t < 0.98 else 0.0)
    corner = 0.007 * ((2 * s - 1) ** 2 * (2 * t - 1) ** 2) ** 1.5
    return 0.0006 + fold * 0.6 + corner + 0.0012 * math.sin(math.pi * s)


def make(a, work_dir):
    front = kit.printed_panel('letter_front', paint.letter(work_dir), (-W / 2, -H / 2, 0), (W, 0, 0), (0, H, 0), 10, 18, lift, roughness=0.62)
    back = kit.panel('letter_back', (W / 2, -H / 2, 0), (-W, 0, 0), (0, H, 0), 10, 18, lambda s, t: 0.0003 - lift(1 - s, t))
    back.data.materials.append(sf.coated('paper_back', '#d6d1c0', 0.7, 0.0, 0.2, grain=0.1))
    a.add(front, 1.0)
    a.add(back, 0.3)
    a.occlusion_distance = 0.05
    a.anchor('top', (0, H / 2, 0.002))
