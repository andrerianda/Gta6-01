"""Fan palm: two shape variants in one file, three levels each.

variant_a: a stout petticoat fan palm of about 8.4 m (Washingtonia-like, our own proportions):
a thick, straight, grey-brown trunk with a swollen foot and close leaf-scar rings, a round
crown of about 24 bright fans on long petioles, and under it a long SKIRT of dead, straw-brown
fans hanging against the trunk in four shingled rows (down to about 1.7 m above the ground).
variant_b: a taller, slimmer fan palm of about 10.4 m (Sabal-like), its trunk leaning a
little, a round crown of strongly folded fans and a short skirt of two rows.

Everything is built by _fanpalm.py (on top of _palm.py) from the SPEC below: the fan leaves are
modelled segment by segment and baked onto three cards (fresh, older, dead); nodes
variant_a_lod0..2 and variant_b_lod0..2, materials "atlas" (trunk) and "cutout" (fans, skirt,
foot, impostor cards), collider col_cyl_trunk (the lower trunk). Wind mask in vertex colour
blue as in _flora.py: trunk 0, fans 0.25 at the petiole rising to 1 at the blade tip (the
skirt carries the same mask; it moves a little, as dry fans do).

Budget: two variants in one file double the triangles (3,348 and 2,772 at level 0 with the
skirt) and the draw calls (two materials each) of a single plant; they share one 1024 atlas.

Blender axes: Z up. variant_a stands at the origin; variant_b 7 m to its right (+X).
"""
import _fanpalm

ASSET = {
    'id': 'fan_palm',
    'kind': 'vegetation',
    'atlas': 1024,
    'budget': {'triangles': 6400, 'draws': 4},
}

SPEC = {
    'seed': 91,
    # First build (10:30, fan_palm_three_quarter.jpg): the trunk read as a pale pole, the crown
    # small and the skirt short. Now: a darker, thicker trunk, a fuller crown of longer fans,
    # a longer, denser skirt of less tattered dead fans, a shorter variant_a.
    'trunk': {'color': (0.22, 0.185, 0.145), 'ring': 0.05, 'groove': 0.6, 'lichen': 0.2,
              'piece_radius': 0.36, 'piece_length': 2.4, 'radius': 0.31, 'flare': 0.24,
              'taper': 0.06, 'belly': 0.02, 'rings': (12, 5, 3), 'sides': 12},
    'cards': [
        {'name': 'fan_a', 'length': 2.0, 'seed': 131, 'color': (0.12, 0.22, 0.05),
         'stalk': (0.30, 0.30, 0.12),
         'fan': {'radius': 0.86, 'segments': 46, 'spread': 205.0, 'split': 0.52,
                 'droop': 0.09, 'curl': 5.0, 'fold': 0.55},
         'leaf': {'gloss': 0.2, 'veins': 3.0, 'vary': 0.15, 'dry': 0.06}},
        {'name': 'fan_b', 'length': 2.0, 'seed': 149, 'color': (0.15, 0.23, 0.06),
         'stalk': (0.33, 0.30, 0.13),
         'fan': {'radius': 0.84, 'segments': 42, 'spread': 200.0, 'split': 0.48,
                 'droop': 0.14, 'curl': 8.0, 'fold': 0.6, 'ragged': 0.12, 'missing': 0.03},
         'leaf': {'gloss': 0.15, 'veins': 3.0, 'vary': 0.2, 'dry': 0.3, 'turned': 0.08}},
        {'name': 'fan_dead', 'length': 1.6, 'seed': 167, 'color': (0.36, 0.27, 0.15),
         'stalk': (0.36, 0.28, 0.16), 'texels': 0.75,
         'fan': {'radius': 0.82, 'segments': 38, 'spread': 190.0, 'split': 0.45,
                 'droop': 0.16, 'curl': 9.0, 'fold': 0.6, 'ragged': 0.4, 'missing': 0.04},
         'leaf': {'gloss': 0.04, 'veins': 3.0, 'vary': 0.35, 'dry': 0.95}},
    ],
    # Fans on long petioles held up and out (the youngest near upright, the oldest a little
    # below level), blades folded along the costa; no dead fronds in the crown itself: the
    # dead ones hang in the skirt below.
    'crown': {'count': 24, 'up': 70.0, 'down': -24.0, 'droop': (18.0, 42.0),
              'length': (2.3, 2.8), 'hang': (24.0, 38.0), 'neck': 0.2, 'stack': 0.8,
              'twist': 0.35, 'old': 0.68, 'dead': 0, 'power': 1.5},
    'skirt': {'rows': 4, 'per_row': 8, 'top': 0.4, 'step': 0.5, 'neck': 0.36,
              'length': (1.7, 2.1)},
    'litter': {'radius': 0.95, 'size': 2.1, 'color': (0.30, 0.25, 0.17),
               'chip_color': (0.30, 0.22, 0.12), 'grass': (0.16, 0.21, 0.06), 'tufts': 5,
               'leaves': 18},
    'collider': {'radius': 0.4, 'height': 3.0},
    'variants': [
        {'seed': 613, 'height': 5.8, 'lean': 0.18, 'curve': 1.5, 'lean_azimuth': 0.8,
         'tilt': 3.0, 'girth': 1.08, 'x': 0.0},
        {'seed': 739, 'height': 8.0, 'lean': 0.5, 'curve': 2.0, 'lean_azimuth': 3.6,
         'tilt': 5.0, 'girth': 0.84, 'scale': 0.95, 'fronds': 24, 'skirt_rows': 2, 'x': 7.0},
    ],
}


def make(a):
    _fanpalm.make_fan_palm(a, SPEC)


def assemble(a):
    _fanpalm.assemble_fan_palm(a, SPEC)
