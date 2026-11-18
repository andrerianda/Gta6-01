"""Narrow street tree: the avenue broadleaf in a columnar form for narrow pavements and for pits
close to facades, two shape variants of about 9 m and 8 m in one file, three levels each.

The same tree as street_tree (straight trunk pruned clear to about 2.4 m, grey-brown fissured
bark, glossy dark leaves with paler sprays on top, a mulch ring at the foot), but its scaffold
branches rise steeply and its crown is a tall narrow egg about 3.5 m across instead of 8 to
9 m: it can stand 2 m from a wall without its crown reaching the facade, the awnings or the
balconies. Use it wherever street_tree's crown would clip a building (pits within about 4.5 m
of a facade) and along narrow streets.

Everything is built by _broadleaf.py from the SPEC below: nodes variant_a_lod0..2 and
variant_b_lod0..2, materials "atlas" (wood) and "cutout" (leaf cards, mulch, impostor cards),
collider col_cyl_trunk (the clear trunk). Leaf normals point out and up so the crown reads
green from below (see _flora.foliage_light).

Budget: two variants in one file double the triangles and the draw calls (two materials each)
of a single tree; they share one 1024 atlas.

Blender axes: Z up. variant_a stands at the origin, variant_b 6 m to its right (+X).
"""
import _broadleaf

ASSET = {
    'id': 'street_tree_narrow',
    'kind': 'vegetation',
    'atlas': 1024,
    'budget': {'triangles': 7000, 'draws': 4},
}

SPEC = {
    'seed': 53,
    'trunk': {'color': (0.14, 0.12, 0.10), 'piece_radius': 0.16, 'piece_length': 2.6,
              'radius': 0.14, 'flare': 0.07, 'fissure': 0.6, 'lichen': 0.35, 'sides': 10},
    'cards': [
        {'name': 'spray_a', 'length': 1.0, 'width': 1.0, 'seed': 13,
         'color': (0.040, 0.090, 0.015), 'twig': (0.15, 0.115, 0.07),
         'spray': {'leaf': (0.13, 0.065), 'twigs': 7, 'leaves_per_metre': 28.0},
         'leaf': {'gloss': 0.12, 'veins': 7.0, 'vary': 0.25}},
        {'name': 'spray_b', 'length': 1.0, 'width': 1.0, 'seed': 31,
         'color': (0.060, 0.120, 0.020), 'twig': (0.17, 0.13, 0.08),
         'spray': {'leaf': (0.12, 0.06), 'twigs': 6, 'leaves_per_metre': 25.0},
         'leaf': {'gloss': 0.1, 'veins': 7.0, 'vary': 0.3, 'turned': 0.05,
                  'turned_color': (0.36, 0.30, 0.05)}},
    ],
    # Shift 8: warmer underside (it read blue-grey from the street): stored normals with less
    # sky (light: up, keep, out), a warmer leaf base and a few more cards to close the gaps.
    # Shift 9: the underside now reads warm green in the engine (narrow_engine2.jpg), but the
    # top of the crown mirrored the blue sky: matte leaves and nearly horizontal stored normals.
    'crown': {'scaffolds': 4, 'sides': 3, 'cards': 175, 'cards_lod1': 56, 'card': 1.0,
              'floor': -0.7, 'lumps': 0.12, 'aspect': 0.95, 'step': 0.32,
              'light': (0.15, 0.35, 0.8)},
    'litter': {'radius': 0.7, 'size': 1.7, 'color': (0.16, 0.12, 0.08),
               'chip_color': (0.26, 0.18, 0.10), 'leaves': 14},
    'collider': {'radius': 0.18, 'height': 2.6},
    'variants': [
        {'seed': 307, 'clear': 2.6, 'centre': 6.0, 'radius': 1.35, 'half_height': 3.4,
         'lean': 0.1, 'lean_azimuth': 0.6, 'x': 0.0},
        {'seed': 419, 'clear': 2.4, 'centre': 5.3, 'radius': 1.2, 'half_height': 3.0,
         'lean': 0.12, 'lean_azimuth': 2.8, 'girth': 0.88, 'cards': 155, 'x': 6.0},
    ],
}


def make(a):
    _broadleaf.make_tree(a, SPEC)


def assemble(a):
    _broadleaf.assemble_tree(a, SPEC)
