"""Broadleaf trees built from one description (a helper module, not an asset).

street_tree.py (and later the other broadleaf trees) hold a SPEC dictionary and call
make_tree(a, SPEC) and assemble_tree(a, SPEC). make_tree bakes the pieces (see _flora.py): a
straight length of bark, two leaf SPRAY cards (a twig with its side twigs and every leaf
modelled: one fresh and dense, one sun-bleached with a few turned leaves), a patch of mulch, and
one IMPOSTOR card per variant baked from that variant's whole detailed crown (branches and every
spray, the leaves broadened so they survive the alpha test at the impostor's few texels).
assemble_tree builds, for every variant, three levels:

    variant_<letter>_lod0   trunk, leader, scaffold and side branches, about 150 cupped spray
                            cards spread through an egg-shaped crown, the mulch ring
    variant_<letter>_lod1   about a quarter: trunk, leader and scaffolds, 40 larger cards
    variant_<letter>_lod2   a three-sided trunk and three crossed cards showing the impostor

The crown is a lumpy ellipsoid filled from the outside in: cards stand on the points of a golden
spiral at several depths, grow outwards, and their normals lean out from the crown's centre
(Shape.card roundness), so the crown is lit as one irregular mass with sky showing through.
Side branches run from the scaffolds towards the card groups, so the cards are held by wood.

Wind (vertex colour, see _flora.py): trunk 0, scaffolds rising to 0.15, side branches to 0.35,
cards 0.5 at their base to 1 at their tip.

Blender axes: Z up; a tree stands on Z = 0 at its node origin.
"""
import math
import random

import numpy as np
from mathutils import Vector

from lib import build, scene
from lib import materials as M

import _flora as F
import _foliage as G

LOD_DISTANCES = (30.0, 80.0)
BAKE_REACH = 7.0          # metres: how far in front of a card the bake rays start
UP = Vector((0.0, 0.0, 1.0))


# ---------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------

def bark_material(color, name, seed=0, fissure=0.5, lichen=0.4):
    """Broadleaf bark: long vertical fissures between flat plates, paler ridges, lichen and a
    damp, dirty foot."""
    graph = M.Graph(name, seed)
    z = graph.axis('Z')
    cloud = graph.noise(scale=2.5, detail=4.0)
    streak = graph.noise(scale=16.0, detail=6.0, roughness=0.65, stretch=(1.0, 1.0, 0.12))
    fine = graph.noise(scale=80.0, detail=4.0, stretch=(1.0, 1.0, 0.25))
    crack = graph.remap(streak, 0.36, 0.36 + 0.14 * fissure, 1.0, 0.0, smooth=True)
    ridge = graph.remap(streak, 0.5, 0.75, 0.0, 1.0, smooth=True)
    base = graph.hsv(color, value=graph.remap(cloud, 0.2, 0.8, 0.82, 1.15))
    base = graph.hsv(base, value=graph.remap(fine, 0.2, 0.8, 0.88, 1.1))
    base = graph.hsv(base, value=graph.remap(ridge, 0.0, 1.0, 1.0, 1.2))
    coat = M.Coat(graph, base, roughness=graph.remap(cloud, 0.2, 0.8, 0.82, 0.95),
                  height=graph.add(graph.mul(fine, 0.3), graph.mul(crack, -1.0)))
    coat.cover(graph.mul(crack, 0.8), color=tuple(value * 0.35 for value in color), roughness=0.97)
    blotch = graph.mask(graph.noise(scale=5.0, detail=5.0, roughness=0.7), 0.66 - 0.12 * lichen,
                        0.05)
    coat.cover(graph.mul(blotch, 0.55), color=(0.36, 0.40, 0.30), roughness=0.9)
    damp = graph.mul(graph.remap(z, 0.7, 0.0),
                     graph.remap(graph.noise(scale=6.0, detail=5.0), 0.2, 0.7))
    coat.cover(damp, color=(0.12, 0.10, 0.075), roughness=0.95)
    return coat.finish(bump_strength=0.9, bump_distance=0.006)


# ---------------------------------------------------------------------------------------------
# A spray of leaves: the content of one card
# ---------------------------------------------------------------------------------------------

def leaf_blade(length, width, curl=0.15, fold=0.22):
    """One leaf lying along +Y from its stalk end: elliptic, pointed, its tip curling down."""
    steps = np.linspace(0.0, 1.0, 6)
    path = np.stack([np.zeros(6), steps * length, -curl * length * steps * steps], axis=1)
    widths = width * np.sin(np.pi * np.clip(steps * 0.92 + 0.04, 0.0, 1.0)) ** 0.7
    return G.ribbon(path, widths, fold=fold)


def spray(length, seed, leaf=(0.13, 0.06), twigs=6, leaves_per_metre=15.0, broad=1.0,
          density=1.0):
    """A leafy twig lying flat along +Y with side twigs, about `length` long: (leaves, wood) as
    two Soups. broad widens every leaf, density thins them (for the impostor's crown)."""
    rng = random.Random(seed)
    leaves, wood = G.Soup(), G.Soup()

    def twig(start, angle, size, radius, lift):
        bend = rng.uniform(-0.3, 0.3)
        count = 6
        points = []
        for step in range(count + 1):
            t = step / count
            heading = angle + bend * t
            if not points:
                points.append(np.array(start, dtype=np.float64))
                continue
            delta = np.array((math.cos(heading), math.sin(heading),
                              lift * math.cos(math.pi * t))) * (size / count)
            points.append(points[-1] + delta)
        path = np.array(points)
        wood.add(G.tube(path, [radius * (1.0 - 0.65 * step / count) for step in range(count + 1)],
                        sides=5))
        number = max(2, int(size * leaves_per_metre * density))
        for index in range(number):
            t = 0.18 + 0.82 * (index + 0.5) / number
            position = path[min(count, int(round(t * count)))]
            side = 1.0 if index % 2 else -1.0
            heading = angle + bend * t + side * math.radians(rng.uniform(38.0, 66.0))
            add_leaf(position, heading, rng.uniform(0.82, 1.12) * (0.8 + 0.3 * t))
        add_leaf(path[-1], angle + bend, 1.05)
        return path

    def add_leaf(position, heading, scale):
        part = leaf_blade(leaf[0] * scale, leaf[1] * scale * broad, curl=rng.uniform(0.05, 0.3))
        turn = G.rotation('Z', heading - math.pi * 0.5)
        pitch = G.rotation('X', rng.uniform(-0.3, 0.25))
        roll = G.rotation('Y', rng.uniform(-0.45, 0.45))
        offset = np.array(position) + np.array((0.0, 0.0, rng.uniform(0.0, 0.035)))
        leaves.add(part, matrix=turn @ pitch @ roll, offset=offset)

    main = twig((0.0, 0.0, 0.0), math.pi * 0.5, length * 0.88, 0.009, 0.01)
    for index in range(twigs):
        t = 0.14 + 0.66 * index / max(1, twigs - 1) + rng.uniform(-0.04, 0.04)
        side = 1.0 if index % 2 else -1.0
        start = main[min(6, int(round(t * 6)))]
        angle = math.pi * 0.5 - side * math.radians(rng.uniform(34.0, 56.0))
        twig(start, angle, length * rng.uniform(0.28, 0.38) * (1.0 - 0.35 * t), 0.005,
             rng.uniform(0.0, 0.03))
    return leaves, wood


# ---------------------------------------------------------------------------------------------
# The plan of a tree: trunk, branches and cards of a variant (used by make and by assemble)
# ---------------------------------------------------------------------------------------------

def trunk_point(variant, z):
    """The trunk's centre line at height z: a slow lean and wobble up to the leader's top."""
    lean = F.polar(variant.get('lean', 0.0), variant.get('lean_azimuth', 0.0))
    top = variant['centre'] + variant['half_height']
    point = Vector((0.0, 0.0, z)) + lean * (z / top) ** 1.4
    point.x += 0.04 * math.sin(z * 0.9 + variant['seed'])
    point.y += 0.035 * math.sin(z * 0.7 + 1.0 + variant['seed'])
    return point


def crown_plan(spec, variant):
    """The wood and the cards of a variant: a dictionary with trunk, leader, scaffolds and
    sides (lists of (path, radii)), cards (lod0) and cards1 (lod1), each card a dictionary."""
    rng = random.Random(variant['seed'])
    crown = spec['crown']
    girth = spec['trunk']['radius'] * variant.get('girth', 1.0)
    clear, centre_z = variant['clear'], variant['centre']
    rx, rz = variant['radius'], variant['half_height']
    centre = trunk_point(variant, centre_z)
    lump_phase = rng.uniform(0.0, math.tau)

    def shell(azimuth, y, depth):
        """A point in the crown: azimuth, height -1..1 on the ellipsoid, depth 0..1 outwards."""
        r = math.sqrt(max(0.0, 1.0 - y * y))
        lump = 1.0 + crown.get('lumps', 0.14) * (math.sin(3.0 * azimuth + lump_phase)
                                                  * math.cos(2.3 * y + lump_phase))
        return centre + Vector((math.cos(azimuth) * r * rx, math.sin(azimuth) * r * rx,
                                y * rz)) * (depth * lump)

    # Trunk to the first fork, then a thinner leader up into the crown.
    zs = [0.0, 0.12, 0.35] + [clear * step / 4 for step in range(2, 5)] + [clear + 0.35]
    trunk = ([trunk_point(variant, z) for z in zs],
             [girth + spec['trunk'].get('flare', 0.1) * math.exp(-z / 0.35) - 0.12 * girth * z / clear
              for z in zs])
    top = centre_z + rz * 0.62
    leader_zs = [clear + 0.1 + (top - clear - 0.1) * step / 4 for step in range(5)]
    leader = ([trunk_point(variant, z) for z in leader_zs],
              [girth * F.lerp(0.78, 0.18, step / 4) for step in range(5)])

    scaffolds, sides, ends = [], [], []
    count = variant.get('scaffolds', crown['scaffolds'])
    for index in range(count):
        azimuth = index * F.GOLDEN_ANGLE * 1.0 + rng.uniform(-0.25, 0.25) + variant['seed']
        start_z = clear + rng.uniform(-0.15, 0.35) + index * crown.get('step', 0.25)
        start = trunk_point(variant, start_z)
        end = shell(azimuth, rng.uniform(-0.05, 0.45), 0.72)
        bow = start + (end - start) * 0.45 + UP * rng.uniform(0.3, 0.7)
        path = F.curve([start, bow, end], 6)
        radii = [girth * F.lerp(0.62, 0.12, (step / 5) ** 0.8) for step in range(6)]
        scaffolds.append((path, radii))
        for number in range(crown.get('sides', 3)):
            t = (0.42, 0.64, 0.86, 0.55)[number % 4]
            root = path[min(5, int(round(t * 5)))]
            turn = azimuth + rng.choice((-1.0, 1.0)) * rng.uniform(0.35, 0.95)
            tip = shell(turn, rng.uniform(-0.45, 0.8), rng.uniform(0.82, 0.95))
            middle = root + (tip - root) * 0.5 + UP * rng.uniform(0.1, 0.35)
            sides.append((F.curve([root, middle, tip], 4),
                          [girth * F.lerp(0.26, 0.05, step / 3) for step in range(4)]))
            ends.append(tip)
        ends.append(end)

    def cards(number, size, depths, seed):
        local = random.Random(seed)
        result = []
        floor = crown.get('floor', -0.6)
        for index in range(number):
            y = 1.0 - (1.0 - floor) * (index + 0.5) / number
            azimuth = index * F.GOLDEN_ANGLE + local.uniform(-0.2, 0.2)
            depth = local.uniform(*depths)
            point = shell(azimuth, y, depth)
            radial = F.unit(point - centre)
            jitter = Vector((local.uniform(-1, 1), local.uniform(-1, 1), local.uniform(-1, 1)))
            along = F.unit(radial + jitter * 0.45 + Vector((0.0, 0.0, -0.22)))
            across = F.unit(UP.cross(along), Vector((1.0, 0.0, 0.0)))
            spin = local.uniform(-0.6, 0.6)
            normal = along.cross(across)
            across = F.unit(across * math.cos(spin) + normal * math.sin(spin))
            length = size * local.uniform(0.85, 1.15)
            result.append({
                'base': point - along * (length * 0.45), 'along': along, 'across': across,
                'length': length, 'width': length * crown.get('aspect', 0.92),
                'card': 'spray_b' if (y > 0.25 and local.random() < 0.55) else 'spray_a',
                'mirror': local.random() < 0.5,
                'shade': F.lerp(0.55, 1.0, (y - floor) / (1.0 - floor)) * F.lerp(0.82, 1.0, depth),
                'cup': local.uniform(0.12, 0.3), 'arch': local.uniform(0.05, 0.16)})
        return result

    return {'trunk': trunk, 'leader': leader, 'scaffolds': scaffolds, 'sides': sides,
            'centre': centre,
            'cards': cards(variant.get('cards', crown['cards']), crown['card'], (0.66, 1.0),
                           variant['seed'] + 1),
            'cards1': cards(crown['cards_lod1'], crown['card'] * 1.6, (0.82, 1.0),
                            variant['seed'] + 2)}


def crown_bounds(plan):
    """(centre x, centre y, reach, low, high) of the crown with its cards: the impostor card."""
    centre = plan['centre']
    reach, low, high = 0.5, centre.z, centre.z
    for card in plan['cards']:
        for point in (card['base'], card['base'] + card['along'] * card['length']):
            reach = max(reach, math.hypot(point.x - centre.x, point.y - centre.y))
            low, high = min(low, point.z), max(high, point.z)
    return centre.x, centre.y, reach + 0.35, low - 0.3, high + 0.3


# ---------------------------------------------------------------------------------------------
# make: the pieces
# ---------------------------------------------------------------------------------------------

def make_tree(a, spec):
    bench = F.Bench(a, M.foliage(name='cutout'))
    trunk = spec['trunk']
    bark = bark_material(trunk['color'], 'tree_bark', seed=spec['seed'],
                         fissure=trunk.get('fissure', 0.5), lichen=trunk.get('lichen', 0.4))
    bench.stem_piece('bark', trunk['piece_radius'], trunk['piece_length'], bark)

    detailed = {}
    for card in spec['cards']:
        leaf = G.leaf_material(card['color'], f"{card['name']}_leaf", seed=card['seed'],
                               **card.get('leaf', {}))
        stem = G.stalk_material(card['twig'], f"{card['name']}_twig", seed=card['seed'] + 1,
                                gloss=0.15)
        leaves, wood = G.Soup(), G.Soup()
        for number in range(card.get('sprays', 1)):
            part_leaves, part_wood = spray(card['length'] / card.get('sprays', 1) ** 0.3,
                                           card['seed'] + 17 * number, **card['spray'])
            leaves.add(part_leaves.part())
            wood.add(part_wood.part())
        bench.flat_card(card['name'], card['width'], card['length'], [(leaves, leaf), (wood, stem)],
                        texel_scale=card.get('texels', 1.0))
        fat_leaves, fat_wood = spray(card['length'], card['seed'], **dict(card['spray'], broad=1.9,
                                                                          density=0.6))
        detailed[card['name']] = (fat_leaves.part(), fat_wood.part(), leaf, stem, card['length'],
                                  card['width'])

    litter = spec['litter']
    mound, chips, dead = G.litter(litter['radius'], spec['seed'] + 3, chips=litter.get('chips', 150),
                                  leaves=litter.get('leaves', 14))
    x = bench.slot(litter['size'])
    patch = build.grid('litter', size=(litter['size'], litter['size']))
    scene.set_material(patch, bench.cutout)
    patch.location = (x, 0.0, 0.0)
    soil = G.litter_material(litter['color'], 'litter_soil', seed=spec['seed'] + 4)
    chip = G.litter_material(litter['chip_color'], 'litter_chips', seed=spec['seed'] + 5,
                             speckle=0.6)
    dry = G.leaf_material((0.30, 0.20, 0.09), 'litter_leaf', seed=spec['seed'] + 6, gloss=0.05,
                          dry=0.8)
    sources = [soup.object(f'litter_source{index}', material, location=(x, 0.0, 0.0))
               for index, (soup, material) in enumerate(((mound, soil), (chips, chip), (dead, dry)))
               if not soup.empty()]
    a.add_piece(patch, sources=sources, texel_scale=0.6)

    for index, variant in enumerate(spec['variants']):
        plan = crown_plan(spec, variant)
        soups = {}
        for card in plan['cards']:
            fat_leaves, fat_wood, leaf, stem, length, _width = detailed[card['card']]
            normal = card['across'].cross(card['along'])
            if normal.dot(card['base'] - plan['centre']) < 0.0:
                normal = -normal
            right = card['along'].cross(normal)
            scale = card['length'] / length
            matrix = G.basis(tuple(right * scale), tuple(card['along'] * scale),
                             tuple(normal * scale))
            for kind, part, material in (('leaf', fat_leaves, leaf), ('wood', fat_wood, stem)):
                soup = soups.setdefault((card['card'], kind), (G.Soup(), material))[0]
                soup.add(part, matrix=matrix, offset=tuple(card['base']))
        wood = G.Soup()
        for path, radii in [plan['leader']] + plan['scaffolds'] + plan['sides']:
            wood.add(G.tube(np.array([tuple(point) for point in path]), radii, sides=6))
        soups[('branches', 'bark')] = (wood, bark)
        objects = [soup.object(f'crown{index}_source{number}', material)
                   for number, (soup, material) in enumerate(soups.values())]
        cx, _cy, reach, low, high = crown_bounds(plan)
        bench.impostor(f'crown_{F.VARIANT_LETTERS[index]}', objects, reach * 2.0, high - low,
                       cx, low, texel_scale=spec.get('impostor_texels', 0.16))

    collider = spec['collider']
    a.collider_cylinder('trunk', (0.0, 0.0, collider['height'] * 0.5), radius=collider['radius'],
                        height=collider['height'])
    a.bake(orm_size=512, normal_size=512, occlusion_ground=False, occlusion_distance=0.25,
           cage_extrusion=BAKE_REACH, max_ray_distance=0.0, occlusion_in_color=0.4)


# ---------------------------------------------------------------------------------------------
# assemble: the game meshes
# ---------------------------------------------------------------------------------------------

def add_wood(shape, a, spec, plan, level):
    trunk = spec['trunk']
    rect = a.piece_rect('bark')

    def stem(path, radii, sides, wind, shade=1.0):
        shape.tube(path, radii, sides, rect,
                   vs=F.bark_vs(path, radii, trunk['piece_radius'], trunk['piece_length']),
                   wind=[F.lerp(wind[0], wind[1], step / (len(path) - 1))
                         for step in range(len(path))], shade=shade)

    path, radii = plan['trunk']
    if level == 2:
        keep = [0, 3, len(path) - 1]
        stem([path[i] for i in keep], [radii[i] for i in keep], 3, (0.0, 0.0))
        return
    if level == 1:
        keep = [0, 2, 4, len(path) - 1]
        path, radii = [path[i] for i in keep], [radii[i] for i in keep]
    stem(path, radii, (trunk.get('sides', 10), 7)[level], (0.0, 0.0))
    path, radii = plan['leader']
    stem(path, radii, (6, 4)[level], (0.0, 0.15), shade=0.85)
    for path, radii in plan['scaffolds']:
        if level == 1:
            path, radii = [path[i] for i in (0, 2, 5)], [radii[i] for i in (0, 2, 5)]
        stem(path, radii, (6, 4)[level], (0.0, 0.15), shade=0.85)
    if level == 0:
        for path, radii in plan['sides']:
            stem(path, radii, 4, (0.15, 0.35), shade=0.75)


def add_cards(shape, a, plan, level):
    for card in plan[('cards', 'cards1')[level]]:
        shape.card(card['base'], card['along'], card['across'], card['length'], card['width'],
                   a.piece_rect(card['card']), columns=2, rows=(2, 1)[level], cup=card['cup'],
                   arch=card['arch'], centre=plan['centre'], roundness=0.6, wind=(0.5, 1.0),
                   shade=card['shade'], mirror=card['mirror'])


def add_impostor(shape, a, plan, index, cards=3):
    """Level 2 of the crown: upright cards crossing on the crown's axis, each showing the
    impostor piece; their normals look along each card's facing, a little outwards."""
    cx, cy, reach, low, high = crown_bounds(plan)
    base = Vector((cx, cy, 0.0))
    rect = a.piece_rect(f'crown_{F.VARIANT_LETTERS[index]}')
    for card in range(cards):
        angle = math.pi * card / cards
        right = F.polar(1.0, angle)
        facing = right.cross(UP)
        rows = [[base + right * (side * reach) + UP * z for side in (-1.0, 1.0)]
                for z in (low, high)]
        normals = [[F.unit(facing + right * (side * 0.6) + UP * 0.3) for side in (-1.0, 1.0)]
                   for _ in (low, high)]
        shape.grid(rows, rect, F.CUTOUT, normals=normals,
                   us=[1.0, 0.0] if card % 2 else [0.0, 1.0], wind=[0.5, 0.9])


def assemble_tree(a, spec):
    table = []
    litter = spec['litter']
    for index, variant in enumerate(spec['variants']):
        plan = crown_plan(spec, variant)
        for level in range(3):
            shape = F.Shape()
            add_wood(shape, a, spec, plan, level)
            if level < 2:
                add_cards(shape, a, plan, level)
                F.ground_patch(shape, a.piece_rect('litter'), litter['radius'],
                               seed=variant['seed'], sides=(10, 6)[level], size=litter['size'])
            else:
                add_impostor(shape, a, plan, index)
            tree = shape.build(F.variant_name(index, level), a)
            tree.location = (variant.get('x', 0.0), 0.0, 0.0)
            a.add_baked(tree)
        cx, cy, reach, _low, high = crown_bounds(plan)
        table.append({'node': f'variant_{F.VARIANT_LETTERS[index]}', 'x': variant.get('x', 0.0),
                      'height': round(high, 2), 'crown_width': round(reach * 2.0, 2),
                      'crown_base': [round(cx, 2), round(cy, 2), round(variant['clear'], 2)]})
    F.describe(a, table, LOD_DISTANCES, collider='col_cyl_trunk, about each variant node')
