"""The forged base pass: a laminated card 86 x 54 mm hanging from a strap clip on a short lanyard.
BASE AÉREA PUNTA GARZA, LT. RAMIRO OSORIO, VISITING TEST PILOT, a neutral portrait, a hologram
patch and the base's invented crest (paint.pass_card). Origin at the centre of the card, which
hangs upright and faces the asset's front (+Y here, the game's -Z); the clip and lanyard rise 12 cm.
"""
import _story_kit as kit
import paint
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'forged_pass_card', 'atlas': 1024, 'kind': 'prop', 'views': ((14, 6, 1.5, (0, 0, 0.012)),), 'ground': False}
W, H, T = 0.086, 0.054, 0.0009


def make(a, work_dir):
    card = kit.rounded_card('card', W, H, T, 0.0032)
    edge = sf.plain('card_edge', '#d9dad4', 0.4)
    front = kit.printed('print_pass_front', paint.pass_card(work_dir), (W / 2, 0, -H / 2), (-W, 0, 0), (0, 0, H), roughness=0.3, bump=0.0)
    back = kit.printed('print_pass_back', paint.pass_card(work_dir, True), (-W / 2, 0, -H / 2), (W, 0, 0), (0, 0, H), roughness=0.3, bump=0.0)
    mk.assign(card, edge)
    mk.assign_faces(card, front, lambda centre, normal: normal.y > 0.9)
    mk.assign_faces(card, back, lambda centre, normal: normal.y < -0.9)
    a.add(card, 2.5)
    steel = sf.bare_metal('clip_steel', '#b4b6b8', 0.3, 0.3)
    vinyl = sf.coated('strap_vinyl', '#c9cdc8', 0.35, 0.0, 0.2, grain=0.1)
    ribbon = sf.fabric('lanyard', '#1c2c4c')
    top = H / 2
    parts = [kit.block('strap_front', (0.011, 0.0006, 0.026), (0, T / 2 + 0.0005, top + 0.004), vinyl, 0.0002),
             kit.block('strap_back', (0.011, 0.0006, 0.026), (0, -T / 2 - 0.0005, top + 0.004), vinyl, 0.0002),
             kit.can('snap', 0.0032, 0, 0.0016, steel, (0, 0), 10),
             kit.block('clip_jaw_front', (0.012, 0.0012, 0.024), (0, 0.0022, top + 0.028), steel, 0.0005, (-6, 0, 0)),
             kit.block('clip_jaw_back', (0.012, 0.0012, 0.03), (0, -0.0022, top + 0.031), steel, 0.0005, (6, 0, 0)),
             kit.rod('clip_spring', [(-0.007, 0, top + 0.036), (0.007, 0, top + 0.036)], 0.0022, steel, 8),
             kit.rod('ring', [(0.006 * c, 0, top + 0.052 + 0.006 * s) for c, s in ((1, 0), (0.7, 0.7), (0, 1), (-0.7, 0.7), (-1, 0), (-0.7, -0.7), (0, -1), (0.7, -0.7), (1, 0))],
                     0.0008, steel, 5)]
    mk.transform(parts[2], (0, T / 2 + 0.0002, top - 0.006), (90, 0, 0))
    for sx in (-1, 1):
        parts.append(kit.path_loft('lanyard%d' % sx, [((sx * 0.002, 0.0, top + 0.057), 0.011, 0.0011), ((sx * 0.006, 0.002, top + 0.08), 0.011, 0.0011),
                                                    ((sx * 0.018, 0.006, top + 0.105), 0.011, 0.0011), ((sx * 0.034, 0.012, top + 0.122), 0.011, 0.0011)], ribbon, 6))
    a.add_all(parts, 1.0)
    a.occlusion_distance = 0.01
