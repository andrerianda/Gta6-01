"""Fan palm: two shape variants in one file, three levels each.

variant_a: a stout petticoat fan palm of about 8.5 m (Washingtonia-like, our own proportions):
a thick, straight, grey-brown trunk with a swollen foot and close leaf-scar rings, a round
crown of about 20 bright fans on long petioles, and under it a long SKIRT of dead, straw-brown
fans hanging against the trunk in three shingled rows (from about 2.4 m below the crown down
to the middle of the trunk).
variant_b: a taller, slimmer cabbage-type fan palm of about 10 m (Sabal-like), its trunk
leaning a little, a denser rounder crown of strongly folded fans and a short skirt of one row.

Everything is built by _fanpalm.py (on top of _palm.py) from the SPEC below: the fan leaves are
modelled segment by segment and baked onto three cards (fresh, older, dead); nodes
variant_a_lod0..2 and variant_b_lod0..2, materials "atlas" (trunk) and "cutout" (fans, skirt,
foot, impostor cards), collider col_cyl_trunk (the lower trunk). Wind mask in vertex colour
blue as in _flora.py: trunk 0, fans 0.25 at the petiole rising to 1 at the blade tip (the
skirt carries the same mask; it moves a little, as dry fans do).

Budget: two variants in one file double the triangles (about 2,800 each at level 0 with the
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
    'trunk': {'color': (0.30, 0.26, 0.21), 'ring': 0.06, 'groove': 0.5, 'lichen': 0.2,
              'piece_radius': 0.3, 'piece_length': 2.4, 'radius': 0.25, 'flare': 0.2,
              'taper': 0.05, 'belly': 0.02, 'rings': (12, 5, 3), 'sides': 12},
    'cards': [
        {'name': 'fan_a', 'length': 2.0, 'seed': 131, 'color': (0.10, 0.20, 0.045),
         'stalk': (0.30, 0.30, 0.12),
         'fan': {'radius': 0.86, 'segments': 46, 'spread': 205.0, 'split': 0.52,
                 'droop': 0.09, 'curl': 5.0, 'fold': 0.55},
         'leaf': {'gloss': 0.2, 'veins': 3.0, 'vary': 0.15, 'dry': 0.06}},
        {'name': 'fan_b', 'length': 2.0, 'seed': 149, 'color': (0.13, 0.21, 0.05),
         'stalk': (0.33, 0.30, 0.13),
         'fan': {'radius': 0.84, 'segments': 42, 'spread': 200.0, 'split': 0.48,
                 'droop': 0.14, 'curl': 8.0, 'fold': 0.6, 'ragged': 0.12, 'missing': 0.03},
         'leaf': {'gloss': 0.15, 'veins': 3.0, 'vary': 0.2, 'dry': 0.3, 'turned': 0.08}},
        {'name': 'fan_dead', 'length': 1.6, 'seed': 167, 'color': (0.36, 0.27, 0.15),
         'stalk': (0.36, 0.28, 0.16), 'texels': 0.75,
         'fan': {'radius': 0.82, 'segments': 38, 'spread': 190.0, 'split': 0.45,
                 'droop': 0.18, 'curl': 10.0, 'fold': 0.7, 'ragged': 0.6, 'missing': 0.1},
         'leaf': {'gloss': 0.04, 'veins': 3.0, 'vary': 0.35, 'dry': 0.95}},
    ],
    # Fans on long petioles held up and out (the youngest near upright, the oldest a little
    # below level), blades folded along the costa; no dead fronds in the crown itself: the
    # dead ones hang in the skirt below.
    'crown': {'count': 20, 'up': 72.0, 'down': -18.0, 'droop': (16.0, 38.0),
              'length': (1.95, 2.35), 'hang': (24.0, 38.0), 'neck': 0.16, 'stack': 0.7,
              'twist': 0.35, 'old': 0.68, 'dead': 0, 'power': 1.5},
    'skirt': {'rows': 3, 'per_row': 7, 'top': 0.45, 'step': 0.55, 'neck': 0.3,
              'length': (1.5, 1.8)},
    'litter': {'radius': 0.95, 'size': 2.1, 'color': (0.30, 0.25, 0.17),
               'chip_color': (0.30, 0.22, 0.12), 'grass': (0.16, 0.21, 0.06), 'tufts': 5,
               'leaves': 18},
    'collider': {'radius': 0.34, 'height': 3.0},
    'variants': [
        {'seed': 613, 'height': 6.9, 'lean': 0.18, 'curve': 1.5, 'lean_azimuth': 0.8,
         'tilt': 3.0, 'x': 0.0},
        {'seed': 739, 'height': 8.6, 'lean': 0.55, 'curve': 2.0, 'lean_azimuth': 3.6,
         'tilt': 5.0, 'girth': 0.82, 'scale': 0.95, 'fronds': 22, 'skirt_rows': 1, 'x': 7.0},
    ],
}


def make(a):
    _fanpalm.make_fan_palm(a, SPEC)


def assemble(a):
    _fanpalm.assemble_fan_palm(a, SPEC)
