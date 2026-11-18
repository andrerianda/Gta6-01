"""Tropical shrubs: flowering garden shrubs for planters, tree pits, verges, medians and front
yards, two shape variants in one file, three levels each (the first two of the brief's
shrubs_tropical set; later shifts add the others as further variants of this file).

variant_a: a hibiscus, a rounded upright shrub of about 1.6 m, dense glossy dark leaves with
large red flowers scattered over the outside of the crown.
variant_b: a low spreading flowering mound of about 1.25 m (oleander-like), lighter leaves,
the same flowers more sparsely.
A few short stems leave the ground and fork at once; the crown starts about 0.3 m up, so the
leaf litter and soil at the foot show beneath it.

Everything is built by _broadleaf.py from the SPEC below (the flowers are leaves of the second
spray coloured as blossom): nodes variant_a_lod0..2 and variant_b_lod0..2, materials "atlas"
(stems) and "cutout" (leaf cards, the litter patch, impostor cards), collider col_cyl_trunk
(the whole shrub, so people walk round it). Leaf normals point out and up so the shrub reads
green from the camera's height (see _flora.foliage_light).

Budget: two variants in one file double the triangles (under 900 each at level 0) and the draw
calls (two materials each) of one shrub; they share one 1024 atlas.

Blender axes: Z up. variant_a stands at the origin, variant_b 2.5 m to its right (+X).
"""
import _broadleaf

ASSET = {
    'id': 'shrubs_tropical',
    'kind': 'vegetation',
    'atlas': 1024,
    'budget': {'triangles': 2400, 'draws': 4},
}

SPEC = {
    'seed': 67,
    'trunk': {'color': (0.17, 0.14, 0.10), 'piece_radius': 0.05, 'piece_length': 1.0,
              'radius': 0.035, 'flare': 0.012, 'fissure': 0.3, 'lichen': 0.1, 'sides': 6},
    'cards': [
        {'name': 'spray_a', 'length': 0.6, 'width': 0.6, 'seed': 17,
         'color': (0.058, 0.115, 0.022), 'twig': (0.16, 0.13, 0.08),
         'spray': {'leaf': (0.10, 0.05), 'twigs': 6, 'leaves_per_metre': 42.0},
         'leaf': {'gloss': 0.14, 'veins': 6.0, 'vary': 0.2}},
        {'name': 'spray_b', 'length': 0.6, 'width': 0.6, 'seed': 37,
         'color': (0.075, 0.135, 0.026), 'twig': (0.17, 0.13, 0.08),
         'spray': {'leaf': (0.10, 0.06), 'twigs': 6, 'leaves_per_metre': 36.0},
         'leaf': {'gloss': 0.12, 'veins': 6.0, 'vary': 0.25, 'turned': 0.16,
                  'turned_color': (0.58, 0.05, 0.06)}},
    ],
    # Shift 8: the crowns come down to the soil (the first look in the engine showed little
    # trees on a bare stem), smaller and more cards, and stored normals with less sky in them
    # (light: up, keep, out) so the leaves read warm green instead of blue-grey.
    # Shift 9: the tops still read blue-grey in the engine: the upward cards mirrored the blue
    # sky (glossy leaves over a very dark albedo). Matte leaves (gloss 0.12-0.14) and stored
    # normals that stay nearly horizontal (little `up`, less of the card's own) so the top of
    # a crown takes the low warm sun on its side rather than the zenith. The engine still
    # showed grey-teal tops after that (shrubs_engine3.jpg): the very dark leaf albedo let the
    # sky's grazing reflection win, so the leaves are a little lighter (still under 0.14 green).
    'crown': {'scaffolds': 5, 'sides': 1, 'cards': 60, 'cards_lod1': 22, 'card': 0.46,
              'floor': -0.95, 'lumps': 0.16, 'aspect': 0.95, 'step': 0.04,
              'light': (0.1, 0.3, 0.85)},
    'litter': {'radius': 0.75, 'size': 1.7, 'color': (0.17, 0.13, 0.09),
               'chip_color': (0.26, 0.18, 0.10), 'leaves': 12},
    'collider': {'radius': 0.6, 'height': 1.2},
    'variants': [
        {'seed': 811, 'clear': 0.06, 'centre': 0.82, 'radius': 0.66, 'half_height': 0.78,
         'lean': 0.04, 'lean_azimuth': 0.4, 'x': 0.0},
        {'seed': 877, 'clear': 0.05, 'centre': 0.6, 'radius': 0.8, 'half_height': 0.56,
         'lean': 0.05, 'lean_azimuth': 2.1, 'girth': 0.9, 'cards': 56, 'x': 2.5},
    ],
}


def make(a):
    _broadleaf.make_tree(a, SPEC)


def assemble(a):
    _broadleaf.assemble_tree(a, SPEC)
