"""Street tree: a tidy medium broadleaf for avenues, two shape variants of about 8.5 m and 7.5 m
in one file, three levels each.

A straight trunk pruned clear to about 2.4 m (room for people and car doors), grey-brown
fissured bark and a slight flare at the foot; four or five scaffold branches leave the first
fork and rise outwards, side branches carry the leaf sprays; an egg-shaped, lumpy crown of
glossy dark leaves with paler sun-bleached sprays on top and sky showing through; a mulch ring
at the foot (the tree pit; the city lays its own grate or kerb around it).

Everything is built by _broadleaf.py from the SPEC below: nodes variant_a_lod0..2 and
variant_b_lod0..2, materials "atlas" (wood) and "cutout" (leaf cards, mulch, impostor cards),
collider col_cyl_trunk (the clear trunk).

Budget: two variants in one file double the triangles (about 2,100 each at level 0) and the
draw calls (two materials each) of a single tree; they share one 1024 atlas.

Blender axes: Z up. variant_a stands at the origin, variant_b 8 m to its right (+X).
"""
import _broadleaf

ASSET = {
    'id': 'street_tree',
    'kind': 'vegetation',
    'atlas': 1024,
    'budget': {'triangles': 7000, 'draws': 4},
}

SPEC = {
    'seed': 41,
    'trunk': {'color': (0.15, 0.13, 0.11), 'piece_radius': 0.17, 'piece_length': 2.6,
              'radius': 0.15, 'flare': 0.08, 'fissure': 0.6, 'lichen': 0.35, 'sides': 10},
    'cards': [
        {'name': 'spray_a', 'length': 1.2, 'width': 1.2, 'seed': 11,
         'color': (0.032, 0.085, 0.017), 'twig': (0.15, 0.115, 0.07),
         'spray': {'leaf': (0.15, 0.075), 'twigs': 8, 'leaves_per_metre': 26.0},
         'leaf': {'gloss': 0.3, 'veins': 7.0, 'vary': 0.25}},
        {'name': 'spray_b', 'length': 1.2, 'width': 1.2, 'seed': 29,
         'color': (0.05, 0.115, 0.022), 'twig': (0.17, 0.13, 0.08),
         'spray': {'leaf': (0.14, 0.07), 'twigs': 7, 'leaves_per_metre': 23.0},
         'leaf': {'gloss': 0.25, 'veins': 7.0, 'vary': 0.3, 'turned': 0.05,
                  'turned_color': (0.36, 0.30, 0.05)}},
    ],
    'crown': {'scaffolds': 5, 'sides': 3, 'cards': 190, 'cards_lod1': 60, 'card': 1.3,
              'floor': -0.65, 'lumps': 0.14, 'aspect': 0.95, 'step': 0.22},
    'litter': {'radius': 0.75, 'size': 1.8, 'color': (0.16, 0.12, 0.08),
               'chip_color': (0.26, 0.18, 0.10), 'leaves': 18},
    'collider': {'radius': 0.2, 'height': 2.6},
    'variants': [
        {'seed': 101, 'clear': 2.5, 'centre': 5.4, 'radius': 3.1, 'half_height': 2.5,
         'lean': 0.15, 'lean_azimuth': 1.0, 'x': 0.0},
        {'seed': 233, 'clear': 2.2, 'centre': 4.8, 'radius': 2.7, 'half_height': 2.4,
         'lean': 0.25, 'lean_azimuth': 3.6, 'girth': 0.9, 'scaffolds': 4, 'cards': 165,
         'x': 8.0},
    ],
}


def make(a):
    _broadleaf.make_tree(a, SPEC)


def assemble(a):
    _broadleaf.assemble_tree(a, SPEC)
