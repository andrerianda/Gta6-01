"""Coconut palm (Cocos): two shape variants of about 12 m and 10 m in one file, three levels each.

A slender grey-brown trunk closely ringed by leaf scars, swollen at the foot, leaving the
ground at a lean and curving up towards the light; a full, loose crown of long fronds whose
leaflets hang from the midrib and whose tips twist and droop, the oldest hanging below the
horizontal with two or three dead ones against the trunk; a cluster of coconuts under the
heart of the crown.

Everything is built by _palm.py from the SPEC below (pieces baked flat, the trees assembled
from them): nodes variant_a_lod0..2 and variant_b_lod0..2, materials "atlas" (trunk, nuts)
and "cutout" (fronds, foot, impostor cards), collider col_cyl_trunk (the lower trunk).

Budget: two variants in one file double the triangles (about 2,600 each at level 0) and the
draw calls (two materials each) of a single plant; they share one 1024 atlas.

Blender axes: Z up. variant_a stands at the origin and leans towards +X; variant_b stands
9 m to its right (+X) and leans away to the back left.
"""
import _palm

ASSET = {
    'id': 'coconut_palm',
    'kind': 'vegetation',
    'atlas': 1024,
    'budget': {'triangles': 6000, 'draws': 4},
}

SPEC = {
    'seed': 23,
    'trunk': {'color': (0.33, 0.28, 0.22), 'ring': 0.085, 'groove': 0.26, 'lichen': 0.3,
              'piece_radius': 0.15, 'piece_length': 2.4, 'radius': 0.135, 'flare': 0.17,
              'taper': 0.02, 'rings': (11, 5, 3), 'sides': 10},
    'cards': [
        {'name': 'frond_a', 'length': 4.6, 'seed': 71, 'color': (0.085, 0.20, 0.028),
         'stalk': (0.30, 0.31, 0.08),
         'frond': {'pairs': 58, 'reach': 0.86, 'plumose': 0.12, 'width': 0.05, 'bare': 0.12,
                   'angles': (68.0, 34.0), 'lift': 0.02, 'droop': 0.07, 'stalk_width': 1.6,
                   'profile': 'coconut'},
         'leaf': {'gloss': 0.55, 'dry': 0.12}},
        {'name': 'frond_b', 'length': 4.6, 'seed': 83, 'color': (0.12, 0.21, 0.03),
         'stalk': (0.34, 0.31, 0.09),
         'frond': {'pairs': 52, 'reach': 0.84, 'plumose': 0.12, 'width': 0.05, 'bare': 0.12,
                   'angles': (68.0, 34.0), 'lift': 0.02, 'droop': 0.09, 'stalk_width': 1.6,
                   'ragged': 0.15, 'missing': 0.06, 'profile': 'coconut'},
         'leaf': {'gloss': 0.4, 'dry': 0.45, 'turned': 0.1}},
        {'name': 'frond_dead', 'length': 3.8, 'seed': 97, 'color': (0.31, 0.21, 0.10),
         'stalk': (0.34, 0.25, 0.13), 'texels': 0.7,
         'frond': {'pairs': 40, 'reach': 0.62, 'plumose': 0.3, 'bare': 0.14, 'ragged': 0.9,
                   'missing': 0.3, 'droop': 0.1, 'stalk_width': 1.6, 'profile': 'coconut'},
         'leaf': {'gloss': 0.05, 'dry': 0.9, 'vary': 0.35}},
    ],
    # Long fronds that leave steeply and curl over (the youngest end near level, the oldest
    # hang straight down): a loose, weeping crown rather than a star.
    'crown': {'count': 26, 'up': 70.0, 'down': -26.0, 'droop': (48.0, 64.0),
              'length': (4.0, 5.0), 'hang': (34.0, 58.0), 'neck': 0.12, 'stack': 0.45,
              'twist': 1.1, 'old': 0.66, 'dead': 2, 'power': 1.8},
    'litter': {'radius': 0.9, 'size': 2.1, 'color': (0.30, 0.25, 0.17),
               'chip_color': (0.26, 0.18, 0.10), 'grass': (0.16, 0.21, 0.06), 'tufts': 5,
               'leaves': 16},
    'collider': {'radius': 0.24, 'height': 3.0},
    'variants': [
        {'seed': 311, 'height': 8.4, 'lean': 2.5, 'curve': 2.0, 'lean_azimuth': 0.0,
         'tilt': 10.0, 'nuts': 6, 'dead': 2, 'x': 0.0},
        {'seed': 547, 'height': 6.6, 'lean': 1.5, 'curve': 1.7, 'lean_azimuth': 2.5,
         'tilt': 7.0, 'girth': 1.06, 'scale': 0.94, 'fronds': 24, 'nuts': 4, 'dead': 3,
         'x': 9.0},
    ],
}


def make(a):
    _palm.make_palm(a, SPEC)


def assemble(a):
    _palm.assemble_palm(a, SPEC)
