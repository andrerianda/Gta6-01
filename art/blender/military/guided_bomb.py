"""Guided glide bomb, 3.6 m long and 0.4 m across: an original design with a dark glazed seeker nose,
four long mid-body strakes and four cruciform tail fins set at 45 degrees, two suspension lugs on
top, dark olive with wear and one ochre band. The origin is the middle of the body; the nose
points to +Y in Blender (the game's -Z).
"""
import _base_kit as kit
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'guided_bomb', 'atlas': 512, 'kind': 'prop', 'ground': False, 'views': ((40, 15, 1.3), (150, 25, 1.3))}

BODY = [
    {'y': -1.8, 'w': 0.2, 'h': 0.2}, {'y': -1.72, 'w': 0.3, 'h': 0.3}, {'y': -1.25, 'w': 0.4, 'h': 0.4},
    {'y': 0.55, 'w': 0.4, 'h': 0.4}, {'y': 0.75, 'w': 0.4, 'h': 0.4}, {'y': 1.05, 'w': 0.4, 'h': 0.4},
    {'y': 1.32, 'w': 0.37, 'h': 0.37}, {'y': 1.45, 'w': 0.33, 'h': 0.33}, {'y': 1.62, 'w': 0.25, 'h': 0.25},
    {'y': 1.74, 'w': 0.15, 'h': 0.15}, {'y': 1.8, 'w': 0.04, 'h': 0.04},
]
FIN = [
    {'x': 0.15, 'y': -1.0, 'z': 0.0, 'chord': 0.74, 'thickness': 0.05, 'camber': 0.0},
    {'x': 0.56, 'y': -1.36, 'z': 0.0, 'chord': 0.36, 'thickness': 0.05, 'camber': 0.0},
]


def make(a):
    olive = kit.weathered('olive', '#3b422d', 0.62, 0.1, 0.7)
    grey = kit.painted_steel('fin_grey', '#474c47', 0.5, 0.6)
    seeker = sf.plain('seeker', '#0b0d10', 0.12, 0.0)
    band = sf.coated('band', '#a88d38', 0.6, 0.0, 0.5)

    body = mk.fuselage('body', BODY, 16)
    mk.assign(body, olive)
    mk.assign_faces(body, band, lambda c, n: 0.55 < c.y < 0.75)
    mk.assign_faces(body, seeker, lambda c, n: c.y > 1.45)
    mk.assign_faces(body, grey, lambda c, n: c.y < -1.72)
    mk.shade(body, 40)
    parts = [body]
    for turn in (45, 135, 225, 315):
        strake = mk.assign(mk.box('strake', (0.13, 1.5, 0.018), (0.255, 0.05, 0.0)), grey)
        mk.map_points(strake, lambda v: (v.x if v.x < 0.25 or abs(v.y - 0.05) < 0.55 else 0.215, v.y, v.z))
        parts.append(mk.transform(strake, rotation=(0, turn, 0)))
        fin = mk.assign(mk.wing('fin', FIN, 5), grey)
        parts.append(mk.transform(fin, rotation=(0, turn, 0)))
    for y in (-0.38, 0.38):
        parts.append(kit.block('lug', (0.05, 0.13, 0.07), (0, y, 0.215), grey))
    a.parts_of(parts, ratios=(0.5, 0.25))
    a.lod_distances = (20.0, 70.0)
    a.collider_box('body', (0.45, 3.6, 0.45), (0, 0, 0))
    a.extra('length', 3.6)
