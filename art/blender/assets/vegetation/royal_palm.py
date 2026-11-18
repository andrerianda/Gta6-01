"""Royal palm (Roystonea): two shape variants of 13 m and 11.4 m in one file, three levels each.

A smooth grey trunk ringed by old leaf scars, swollen at the foot and again at mid height, a
glossy green crownshaft with a spear leaf, and a round crown of arching feather fronds whose
leaflets stand in several planes. The lowest fronds droop below the horizontal; a royal palm
sheds its dead fronds cleanly, so only one hangs.

Everything is built by _palm.py from the SPEC below (pieces baked flat, the trees assembled
from them): nodes variant_a_lod0..2 and variant_b_lod0..2, materials "atlas" (trunk,
crownshaft) and "cutout" (fronds, foot, impostor cards), collider col_cyl_trunk.

Budget: two variants in one file double the triangles (about 2,300 each at level 0) and the
draw calls (two materials each) of a single plant; they share one 1024 atlas.

Blender axes: Z up. variant_a stands at the origin, variant_b 7 m to its right (+X).
"""
import _palm

ASSET = {
    'id': 'royal_palm',
    'kind': 'vegetation',
    'atlas': 1024,
    'budget': {'triangles': 6000, 'draws': 4},
}

SPEC = {
    'seed': 5,
    'trunk': {'color': (0.30, 0.29, 0.27), 'ring': 0.13, 'groove': 0.16, 'lichen': 0.55,
              'piece_radius': 0.19, 'piece_length': 3.0, 'radius': 0.185, 'flare': 0.15,
              'belly': 0.04, 'taper': 0.012, 'rings': (10, 5, 2), 'sides': 12},
    'shaft': {'height': 2.4},
    'cards': [
        {'name': 'frond_a', 'length': 3.8, 'seed': 31, 'color': (0.070, 0.19, 0.028),
         'stalk': (0.26, 0.30, 0.085), 'frond': {'pairs': 72, 'reach': 0.80, 'plumose': 1.0},
         'leaf': {'gloss': 0.5, 'dry': 0.1}},
        {'name': 'frond_b', 'length': 3.8, 'seed': 47, 'color': (0.095, 0.20, 0.030),
         'stalk': (0.30, 0.31, 0.09),
         'frond': {'pairs': 62, 'reach': 0.78, 'plumose': 1.0, 'ragged': 0.12, 'missing': 0.04},
         'leaf': {'gloss': 0.4, 'dry': 0.4, 'turned': 0.07}},
        {'name': 'frond_dead', 'length': 3.3, 'seed': 63, 'color': (0.30, 0.20, 0.09),
         'stalk': (0.33, 0.24, 0.12), 'texels': 0.7,
         'frond': {'pairs': 44, 'reach': 0.60, 'plumose': 0.4, 'ragged': 0.9, 'missing': 0.25,
                   'droop': 0.08},
         'leaf': {'gloss': 0.05, 'dry': 0.9, 'vary': 0.35}},
    ],
    # Fronds leave steeply and curl over towards the tip (droop grows as s ** power): the
    # youngest end near level, the middle ones arch below it, the oldest hang at about -64,
    # clear of the crownshaft, which must show as the royal palm's green collar.
    'crown': {'count': 24, 'up': 66.0, 'down': -6.0, 'droop': (50.0, 58.0), 'power': 1.5,
              'length': (3.6, 4.4), 'hang': (26.0, 44.0), 'neck': 0.09, 'stack': 0.22,
              'twist': 0.5, 'old': 0.62, 'dead': 1},
    'litter': {'radius': 0.85, 'size': 2.0, 'color': (0.17, 0.13, 0.085),
               'chip_color': (0.27, 0.19, 0.11), 'tufts': 6},
    'collider': {'radius': 0.26, 'height': 7.0},
    'variants': [
        {'seed': 1907, 'height': 8.4, 'lean': 0.25, 'lean_azimuth': 0.4, 'x': 0.0},
        {'seed': 2311, 'height': 6.6, 'lean': 0.45, 'lean_azimuth': 2.6, 'girth': 0.94,
         'scale': 0.92, 'fronds': 22, 'tilt': 4.0, 'x': 7.0},
    ],
}


def make(a):
    _palm.make_palm(a, SPEC)


def assemble(a):
    _palm.assemble_palm(a, SPEC)
