"""Clipped hedge: 2 m modules of a small-leaved evergreen hedge, trimmed flat, for front yards,
verges, medians, planters, the edges of plazas and car parks. Two modules in one file, three
levels each; modules butt end to end along their X axis to make a hedge of any length.

variant_a: a tall module, 2.0 m long, 0.7 m deep, 1.1 m high.
variant_b: a low edging module, 2.0 m long, 0.55 m deep, 0.6 m high.
Dense small dark leaves with fresher, lighter growth on the top; a few stems inside; the cut
faces are flat but leafy, never a green box. The module's open ends are covered with leaves too,
so a single module can stand alone (a short hedge by a door).

Built by _broadleaf.py with a box crown (variant['box']): nodes variant_a_lod0..2 and
variant_b_lod0..2, materials "atlas" (stems) and "cutout" (leaf cards, soil, impostor cards),
collider col_box_hedge (2.0 x 0.7 x 1.1 m on the origin; the low module uses the same box).

Budget: two modules in one file double the triangles and the draw calls of one; one atlas.

Blender axes: Z up, the module's length along X. variant_a stands at the origin, variant_b
3 m to its right (+X).
"""
import _broadleaf

ASSET = {
    'id': 'hedge_clipped',
    'kind': 'vegetation',
    'atlas': 1024,
    'budget': {'triangles': 2600, 'draws': 4},
}

SPEC = {
    'seed': 71,
    'trunk': {'color': (0.16, 0.13, 0.10), 'piece_radius': 0.05, 'piece_length': 1.0,
              'radius': 0.03, 'flare': 0.01, 'fissure': 0.3, 'lichen': 0.1, 'sides': 5},
    'cards': [
        {'name': 'spray_a', 'length': 0.45, 'width': 0.45, 'seed': 19,
         'color': (0.030, 0.074, 0.018), 'twig': (0.15, 0.12, 0.08),
         'spray': {'leaf': (0.05, 0.026), 'twigs': 7, 'leaves_per_metre': 80.0},
         'leaf': {'gloss': 0.4, 'veins': 4.0, 'vary': 0.2}},
        {'name': 'spray_b', 'length': 0.45, 'width': 0.45, 'seed': 43,
         'color': (0.060, 0.130, 0.030), 'twig': (0.17, 0.14, 0.08),
         'spray': {'leaf': (0.045, 0.024), 'twigs': 7, 'leaves_per_metre': 74.0},
         'leaf': {'gloss': 0.3, 'veins': 4.0, 'vary': 0.25}},
    ],
    'crown': {'scaffolds': 3, 'sides': 1, 'cards': 92, 'cards_lod1': 26, 'card': 0.42,
              'floor': -0.88, 'lumps': 0.03, 'aspect': 0.95, 'step': 0.05},
    'litter': {'radius': 0.45, 'size': 1.1, 'color': (0.16, 0.12, 0.08),
               'chip_color': (0.24, 0.17, 0.10), 'leaves': 6},
    'collider': {'box': (2.0, 0.7, 1.1), 'name': 'hedge'},
    'variants': [
        {'seed': 901, 'clear': 0.1, 'centre': 0.6, 'radius': 1.0, 'half_height': 0.5,
         'box': (1.0, 0.35, 0.5), 'lean': 0.0, 'lean_azimuth': 0.0, 'x': 0.0},
        {'seed': 947, 'clear': 0.08, 'centre': 0.34, 'radius': 1.0, 'half_height': 0.27,
         'box': (1.0, 0.27, 0.27), 'lean': 0.0, 'lean_azimuth': 0.0, 'girth': 0.8,
         'cards': 64, 'x': 3.0},
    ],
}


def make(a):
    _broadleaf.make_tree(a, SPEC)


def assemble(a):
    _broadleaf.assemble_tree(a, SPEC)
