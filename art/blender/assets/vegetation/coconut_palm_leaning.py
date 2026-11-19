"""Leaning coconut palm: two strongly leaning coconut palms in one file, three levels each, for
pits close to facades (the city turns the lean away from the wall, over the street or the beach).

The coconut palm of coconut_palm.py (slender ringed grey-brown trunk swollen at the foot, a
loose weeping crown of long fronds, coconuts, two dead fronds), but the trunk leaves the ground
at a strong lean and curves up towards the light, as palms do that grew out from under a
building's shade or towards the sea: the crown stands about 4 m (variant_a) and 3.3 m
(variant_b) out from the foot. BOTH VARIANTS LEAN TOWARDS +X in Blender, which is +X in the
game: turn the plant so its +X points away from the facade.

Everything is built by _palm.py from the SPEC below: nodes variant_a_lod0..2 and
variant_b_lod0..2, materials "atlas" (trunk, nuts) and "cutout" (fronds, foot, impostor
cards), collider col_cyl_trunk (the lowest part of the trunk only, which stands nearly
upright). Frond normals point out and up so the crown reads green from below.

Budget: two variants in one file double the triangles and the draw calls (two materials each)
of a single plant; they share one 1024 atlas.

Blender axes: Z up. variant_a stands at the origin, variant_b 10 m to its right (+X).
"""
import _palm

ASSET = {
    'id': 'coconut_palm_leaning',
    'kind': 'vegetation',
    'atlas': 1024,
    'budget': {'triangles': 6000, 'draws': 4},
}

SPEC = {
    'seed': 29,
    'trunk': {'color': (0.33, 0.28, 0.22), 'ring': 0.085, 'groove': 0.26, 'lichen': 0.3,
              'piece_radius': 0.15, 'piece_length': 2.4, 'radius': 0.135, 'flare': 0.18,
              'taper': 0.02, 'rings': (11, 5, 3), 'sides': 10},
    'cards': [
        {'name': 'frond_a', 'length': 4.6, 'seed': 73, 'color': (0.09, 0.205, 0.03),
         'stalk': (0.30, 0.31, 0.08),
         'frond': {'pairs': 58, 'reach': 0.86, 'plumose': 0.12, 'width': 0.05, 'bare': 0.12,
                   'angles': (68.0, 34.0), 'lift': 0.02, 'droop': 0.07, 'stalk_width': 1.6,
                   'profile': 'coconut'},
         'leaf': {'gloss': 0.55, 'dry': 0.12}},
        {'name': 'frond_b', 'length': 4.6, 'seed': 89, 'color': (0.12, 0.215, 0.032),
         'stalk': (0.34, 0.31, 0.09),
         'frond': {'pairs': 52, 'reach': 0.84, 'plumose': 0.12, 'width': 0.05, 'bare': 0.12,
                   'angles': (68.0, 34.0), 'lift': 0.02, 'droop': 0.09, 'stalk_width': 1.6,
                   'ragged': 0.15, 'missing': 0.06, 'profile': 'coconut'},
         'leaf': {'gloss': 0.4, 'dry': 0.45, 'turned': 0.1}},
        {'name': 'frond_dead', 'length': 3.8, 'seed': 101, 'color': (0.31, 0.21, 0.10),
         'stalk': (0.34, 0.25, 0.13), 'texels': 0.7,
         'frond': {'pairs': 40, 'reach': 0.62, 'plumose': 0.3, 'bare': 0.14, 'ragged': 0.9,
                   'missing': 0.3, 'droop': 0.1, 'stalk_width': 1.6, 'profile': 'coconut'},
         'leaf': {'gloss': 0.05, 'dry': 0.9, 'vary': 0.35}},
    ],
    'crown': {'count': 24, 'up': 70.0, 'down': -26.0, 'droop': (48.0, 64.0),
              'length': (3.9, 4.8), 'hang': (34.0, 58.0), 'neck': 0.12, 'stack': 0.45,
              'twist': 1.1, 'old': 0.66, 'dead': 2, 'power': 1.8},
    'litter': {'radius': 0.9, 'size': 2.1, 'color': (0.30, 0.25, 0.17),
               'chip_color': (0.26, 0.18, 0.10), 'grass': (0.16, 0.21, 0.06), 'tufts': 5,
               'leaves': 14},
    'collider': {'radius': 0.24, 'height': 1.6},
    'variants': [
        {'seed': 613, 'height': 7.8, 'lean': 4.0, 'curve': 2.6, 'lean_azimuth': 0.0,
         'tilt': 16.0, 'nuts': 5, 'dead': 2, 'x': 0.0},
        {'seed': 739, 'height': 6.6, 'lean': 3.3, 'curve': 2.3, 'lean_azimuth': 0.0,
         'tilt': 13.0, 'girth': 1.04, 'scale': 0.95, 'fronds': 22, 'nuts': 4, 'dead': 2,
         'x': 10.0},
    ],
}


def make(a):
    _palm.make_palm(a, SPEC)


def assemble(a):
    _palm.assemble_palm(a, SPEC)
