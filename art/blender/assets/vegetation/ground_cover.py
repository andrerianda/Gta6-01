"""Ground cover: the weeds, grass and creeping cover where the city's paving meets soil, four
kinds in one file sharing one atlas, three levels each. They hide the hard line where a kerb,
a wall, a post or a tree pit meets the ground and make a street read lived in and worn.

variant_a  weeds_kerb: a 1.0 m run of small weed tufts and flat rosettes for the joint between
           kerb and gutter, the foot of walls, fences and planters. Its length runs along X
           (0.5 m each side of the origin), about 0.1 m deep, 0.1 to 0.3 m high.
variant_b  weeds_crack: one clump of weeds about 0.4 m across and 0.25 m high, a few yellow
           flower heads: cracks in the pavement, post and sign feet, tree-pit corners, lot edges.
variant_c  grass_clump: a coarse grass tuft with seed heads, about 0.7 m across and 0.45 m
           high: verges, vacant lots, dunes behind the beach, the back of tree pits.
variant_d  cover_patch: a round bed of a creeping broad-leaved ground cover on dark soil,
           about 1.3 m across and 0.12 m high in the middle, a few weeds through it: tree pits
           (lay it over the pit's soil, its rim sinks 2 cm) and planters.

Built from baked pieces (see _flora.py): an upright grass card and an upright weed card (every
blade, leaf, stalk and flower modelled), a flat rosette card and a flat ground-cover card (soil
and creeping sprays). Levels: lod0 crossed cards with a bend, lod1 about half of them, lod2 one
or two crossed cards (the patch: a coarser disc). Everything is "cutout" (alpha tested, double
sided): one draw call per variant, no "atlas" material and no collider (people walk over it).
Wind mask in COLOR_0 as for every plant: 0 at the foot to 0.8 at a blade's tip, rosettes and
the patch 0.

Budget: four variants in one file, each one draw call: four draw calls; well under the plant
triangle budget (about 30 to 70 triangles a variant at level 0).

Blender axes: Z up. variant_a at the origin, b at X = 2, c at X = 4, d at X = 6.
"""
import math
import random

import numpy as np
from mathutils import Vector

from lib import materials as M

import _broadleaf as B
import _flora as F
import _foliage as G

ASSET = {
    'id': 'ground_cover',
    'kind': 'vegetation',
    'atlas': 1024,
    'budget': {'triangles': 1200, 'draws': 4},
}

LOD_DISTANCES = (15.0, 40.0)
UP = Vector((0.0, 0.0, 1.0))
GOLDEN_ANGLE = math.radians(137.5)
VARIANTS = (('weeds_kerb', 0.0), ('weeds_crack', 2.0), ('grass_clump', 4.0), ('cover_patch', 6.0))
COVER = 1.3        # the side of the baked ground-cover square
ROSETTE = 0.36     # the side of the baked rosette square


def weed_soup(seed):
    """A clump of broad-leaved weeds in the XZ plane: strap leaves bending over, a few thin
    flower stalks with small yellow heads. Returns (leaves, stalks, flowers)."""
    rng = random.Random(seed)
    leaves = G.grass_tuft(16, 0.24, seed, spread=72.0, width=0.03, droop=0.9, foot=0.07)
    leaves.add(G.grass_tuft(10, 0.14, seed + 1, spread=80.0, width=0.026, droop=1.1,
                            foot=0.1).part())
    stalks, flowers = G.Soup(), G.Soup()
    for index in range(4):
        x0 = rng.uniform(-0.06, 0.06)
        tall = rng.uniform(0.17, 0.27)
        lean = rng.uniform(-0.08, 0.08)
        steps = np.linspace(0.0, 1.0, 5)
        path = np.stack([x0 + lean * steps * steps, rng.uniform(-0.02, 0.02) + 0.0 * steps,
                         tall * steps], axis=1)
        stalks.add(G.ribbon(path, np.full(5, 0.005), up=(0.0, -1.0, 0.0)))
        flowers.add(G.ball(0.016, squash=(1.0, 1.0, 0.55), segments=8, rings=4),
                    offset=tuple(path[-1]))
    return leaves, stalks, flowers


def rosette_soup(seed):
    """A flat rosette of leaves (a plantain or dandelion) lying on the ground about the
    middle of the rosette card. Returns a Soup."""
    rng = random.Random(seed)
    soup = G.Soup()
    centre = (0.0, ROSETTE * 0.5, 0.004)
    for index in range(11):
        angle = index * GOLDEN_ANGLE + rng.uniform(-0.2, 0.2)
        length = rng.uniform(0.11, 0.16)
        part = B.leaf_blade(length, length * rng.uniform(0.32, 0.42), curl=-0.12, fold=0.3)
        lift = G.rotation('X', rng.uniform(0.05, 0.25))
        soup.add(part, matrix=G.rotation('Z', angle - math.pi * 0.5) @ lift,
                 offset=(centre[0], centre[1], centre[2] + 0.002 * index))
    return soup


def cover_soups(seed):
    """The ground-cover square: a mound of dark soil and creeping sprays of small round
    leaves running out from the middle, denser and higher towards it. Returns
    (soil, leaves, stems)."""
    rng = random.Random(seed)
    centre = np.array((0.0, COVER * 0.5, 0.0))
    soil, _chips, _dead = G.litter(COVER * 0.46, seed, chips=0)
    leaves, stems = G.Soup(), G.Soup()
    for index in range(26):
        angle = index * GOLDEN_ANGLE + rng.uniform(-0.3, 0.3)
        start = rng.uniform(0.0, 0.3)
        length = rng.uniform(0.28, 0.42)
        part_leaves, part_stems = B.spray(length, seed + 7 * index, leaf=(0.055, 0.045),
                                          twigs=4, leaves_per_metre=48.0)
        turn = G.rotation('Z', angle - math.pi * 0.5)
        offset = centre + np.array((math.cos(angle) * start, math.sin(angle) * start,
                                    0.03 + 0.07 * (1.0 - start / 0.3) + rng.uniform(0.0, 0.02)))
        leaves.add(part_leaves.part(), matrix=turn, offset=offset)
        stems.add(part_stems.part(), matrix=turn, offset=offset)
    soil = G.Soup().add(soil.part(), offset=centre)
    return soil, leaves, stems


def make(a):
    bench = F.Bench(a, M.foliage(name='cutout'), spacing=2.0)
    grass = G.leaf_material((0.11, 0.17, 0.04), 'grass_leaf', seed=5, gloss=0.25, veins=3.0,
                            vein_strength=0.1, dry=0.25)
    seeds = G.stalk_material((0.30, 0.25, 0.13), 'seed_head', seed=6, gloss=0.1)
    weed = G.leaf_material((0.075, 0.150, 0.030), 'weed_leaf', seed=7, gloss=0.3, dry=0.15)
    stalk = G.stalk_material((0.10, 0.16, 0.05), 'weed_stalk', seed=8, gloss=0.2)
    flower = G.leaf_material((0.62, 0.42, 0.03), 'weed_flower', seed=9, gloss=0.2, veins=3.0,
                             vein_strength=0.05)
    rosette = G.leaf_material((0.060, 0.125, 0.030), 'rosette_leaf', seed=10, gloss=0.35)
    creeper = G.leaf_material((0.045, 0.110, 0.022), 'cover_leaf', seed=11, gloss=0.45,
                              vary=0.3)
    creeper_stem = G.stalk_material((0.12, 0.10, 0.06), 'cover_stem', seed=12, gloss=0.15)
    soil = G.litter_material((0.11, 0.085, 0.06), 'cover_soil', seed=13, speckle=0.5)

    tuft = G.grass_tuft(34, 0.44, 21, foot=0.14)
    heads = G.Soup()
    rng = random.Random(23)
    for index in range(5):
        x0, tall = rng.uniform(-0.1, 0.1), rng.uniform(0.38, 0.5)
        steps = np.linspace(0.0, 1.0, 6)
        path = np.stack([x0 + rng.uniform(-0.12, 0.12) * steps ** 2, 0.0 * steps,
                         tall * steps], axis=1)
        heads.add(G.ribbon(path, np.full(6, 0.004), up=(0.0, -1.0, 0.0)))
        head = path[-1]
        heads.add(G.ribbon(np.stack([np.full(4, head[0]) + np.linspace(0.0, 0.01, 4),
                                     np.zeros(4), head[2] - np.linspace(0.09, 0.0, 4)], axis=1),
                           np.array([0.006, 0.014, 0.012, 0.004]), up=(0.0, -1.0, 0.0)))
    bench.upright_card('grass', 0.9, 0.5, [(tuft, grass), (heads, seeds)], texel_scale=0.8)

    leaves, stalks, flowers = weed_soup(31)
    bench.upright_card('weed', 0.6, 0.32, [(leaves, weed), (stalks, stalk), (flowers, flower)],
                       texel_scale=1.0)
    bench.flat_card('rosette', ROSETTE, ROSETTE, [(rosette_soup(41), rosette)], texel_scale=1.0)
    cover_soil, cover_leaves, cover_stems = cover_soups(51)
    bench.flat_card('cover', COVER, COVER, [(cover_soil, soil), (cover_leaves, creeper),
                                            (cover_stems, creeper_stem)], texel_scale=0.6)
    a.bake(orm_size=512, normal_size=512, occlusion_ground=False, occlusion_distance=0.1,
           cage_extrusion=0.6, max_ray_distance=0.0, occlusion_in_color=0.4)


# ---------------------------------------------------------------------------------------------
# assemble: the game meshes
# ---------------------------------------------------------------------------------------------

def crossed(shape, rect, base, height, width, turn, lean, rng, cards=2, rows=1, shade=1.0):
    """`cards` upright cards crossing at `base`, leaning a little, wind 0 at the foot."""
    lean_dir = F.polar(lean, rng.uniform(0.0, math.tau))
    for card in range(cards):
        across = F.polar(1.0, turn + card * math.pi / cards)
        shape.card(Vector(base) + Vector((0.0, 0.0, -0.015)), UP + lean_dir, across, height,
                   width, rect, columns=1, rows=rows, arch=0.06 if rows > 1 else 0.0,
                   wind=(0.0, 0.8), shade=shade, mirror=rng.random() < 0.5)


def flat(shape, rect, centre, size, turn, shade=1.0):
    """A rosette card lying on the ground about `centre`, wound and lit facing up."""
    along = F.polar(1.0, turn)
    across = along.cross(UP)
    base = Vector(centre) - along * (size * 0.5) + Vector((0.0, 0.0, 0.006))
    shape.card(base, along, across, size, size, rect, columns=1, rows=1, wind=(0.0, 0.0),
               shade=shade, light=lambda _point, _normal: UP)


def weeds_kerb(shape, a, level, rng):
    grass, weed, rosette = (a.piece_rect(name) for name in ('grass', 'weed', 'rosette'))
    count = (8, 4, 2)[level]
    for index in range(count):
        x = -0.45 + 0.9 * (index + rng.uniform(0.2, 0.8)) / count
        base = (x, rng.uniform(-0.04, 0.04), 0.0)
        if index % 3 == 1:
            crossed(shape, grass, base, rng.uniform(0.18, 0.3), rng.uniform(0.3, 0.45),
                    rng.uniform(0.0, math.pi), 0.2, rng, rows=(2, 1, 1)[level], shade=0.9)
        else:
            crossed(shape, weed, base, rng.uniform(0.11, 0.2), rng.uniform(0.2, 0.32),
                    rng.uniform(0.0, math.pi), 0.15, rng, shade=rng.uniform(0.85, 1.0))
    if level < 2:
        for index in range((3, 1)[level]):
            flat(shape, rosette, (rng.uniform(-0.4, 0.4), rng.uniform(-0.03, 0.05), 0.0),
                 rng.uniform(0.2, 0.3), rng.uniform(0.0, math.tau), shade=0.95)


def weeds_crack(shape, a, level, rng):
    grass, weed, rosette = (a.piece_rect(name) for name in ('grass', 'weed', 'rosette'))
    for index in range((4, 2, 1)[level]):
        angle = index * GOLDEN_ANGLE
        reach = 0.0 if index == 0 else rng.uniform(0.06, 0.14)
        crossed(shape, weed, F.polar(reach, angle), rng.uniform(0.18, 0.27),
                rng.uniform(0.28, 0.4), rng.uniform(0.0, math.pi), 0.12, rng,
                cards=(3 if index == 0 and level < 2 else 2), shade=rng.uniform(0.85, 1.0))
    if level == 0:
        crossed(shape, grass, F.polar(0.12, 2.0), 0.24, 0.36, 0.4, 0.25, rng, shade=0.85)
    if level < 2:
        for index in range((2, 1)[level]):
            flat(shape, rosette, F.polar(rng.uniform(0.08, 0.16), rng.uniform(0.0, math.tau)),
                 rng.uniform(0.22, 0.3), rng.uniform(0.0, math.tau), shade=0.92)


def grass_clump(shape, a, level, rng):
    grass = a.piece_rect('grass')
    crossed(shape, grass, (0.0, 0.0, 0.0), 0.46, 0.75, rng.uniform(0.0, math.pi), 0.08, rng,
            cards=(3, 2, 2)[level], rows=(2, 1, 1)[level])
    if level < 2:
        for index in range((3, 1)[level]):
            crossed(shape, grass, F.polar(rng.uniform(0.18, 0.28), index * 2.1 + 0.5),
                    rng.uniform(0.24, 0.32), rng.uniform(0.4, 0.5), rng.uniform(0.0, math.pi),
                    0.3, rng, shade=0.9)


def cover_patch(shape, a, level, rng):
    F.ground_patch(shape, a.piece_rect('cover'), COVER * 0.48, seed=rng.randrange(1000),
                   rise=0.1, sink=0.02, sides=(14, 9, 5)[level], size=COVER)
    if level < 2:
        weed = a.piece_rect('weed')
        for index in range((4, 1)[level]):
            crossed(shape, weed, F.polar(rng.uniform(0.15, 0.5), index * GOLDEN_ANGLE + 0.7),
                    rng.uniform(0.16, 0.24), rng.uniform(0.24, 0.34), rng.uniform(0.0, math.pi),
                    0.15, rng, shade=0.9)


BUILDERS = {'weeds_kerb': weeds_kerb, 'weeds_crack': weeds_crack, 'grass_clump': grass_clump,
            'cover_patch': cover_patch}


def assemble(a):
    table = []
    for index, (name, x) in enumerate(VARIANTS):
        for level in range(3):
            shape = F.Shape()
            BUILDERS[name](shape, a, level, random.Random(97 + 13 * index))
            plant = shape.build(F.variant_name(index, level), a)
            plant.location = (x, 0.0, 0.0)
            a.add_baked(plant)
        table.append({'node': f'variant_{F.VARIANT_LETTERS[index]}', 'name': name, 'x': x})
    F.describe(a, table, LOD_DISTANCES)
