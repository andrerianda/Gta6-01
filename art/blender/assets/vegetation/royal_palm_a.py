"""Royal palm A: a royal palm (Roystonea) about 9 m tall, in three levels of detail.

A smooth grey trunk ringed by old leaf scars, swollen at the foot and again at mid height, a
glossy green crownshaft, and a crown of twenty arching feather fronds around a central spear.

How it is built, and why: nothing of the tree is baked in its final shape. make() bakes four
flat or straight PIECES of texture instead:

    trunk_piece        3 m of trunk, a plain cylinder
    crownshaft_piece   the green crownshaft, a plain cylinder
    frond_a, frond_b   two flat cards that take colour, normals, occlusion and their cut-out
                       shape from high-detail fronds with every leaflet modelled

assemble() then builds the three trees from those pieces: the trunk reuses its 3 m piece
mirror-repeated up the stem, and each frond is a folded ribbon mapped onto one of the frond
cards, so twenty fronds (and three levels of detail) share two frond textures. The fronds use
the alpha-tested "cutout" material; everything else is the opaque "atlas" material.

Blender axes: Z up. The tree has no front; it leans a few centimetres towards +X.
"""
import math
import random

from lib import build, profiles, scene, shading
from lib import materials as M

ASSET = {
    'id': 'royal_palm_a',
    'kind': 'vegetation',
    'atlas': 1024,
}

TRUNK_PIECE_HEIGHT = 3.0
TRUNK_PIECE_RADIUS = 0.19
TRUNK_TOP = 5.6
SHAFT_HEIGHT = 1.4
FROND_WIDTH, FROND_LENGTH = 1.6, 3.8
FROND_COUNTS = (20, 14, 9)            # fronds per level of detail
FROND_WIDENING = (1.0, 1.2, 1.45)     # fewer, wider fronds keep the crown's mass at a distance
LOD_DISTANCES = (35.0, 90.0)


# ---------------------------------------------------------------------------------------------
# Materials written for this asset
# ---------------------------------------------------------------------------------------------

def crownshaft_material(seed=0):
    """The waxy green sheath at the top of the trunk: fibrous, paler towards the top, with
    the papery brown rims of old leaf bases."""
    graph = M.Graph('crownshaft', seed)
    height = graph.remap(graph.axis('Z'), 0.0, SHAFT_HEIGHT)
    fibres = graph.noise(scale=90.0, detail=3.0, stretch=(1.0, 1.0, 0.03))
    cloud = graph.noise(scale=2.5, detail=4.0)
    base = graph.ramp(height, [(0.0, (0.085, 0.15, 0.040)), (0.5, (0.12, 0.23, 0.05)),
                               (1.0, (0.20, 0.33, 0.08))])
    base = graph.hsv(base, value=graph.remap(fibres, 0.2, 0.8, 0.86, 1.12))
    coat = M.Coat(graph, base, roughness=graph.remap(cloud, 0.2, 0.8, 0.30, 0.45),
                  height=graph.mul(fibres, 0.3))
    rims = graph.wave(period=0.52, direction='Z', distortion=0.6, detail=2.0)
    coat.cover(graph.mul(graph.remap(rims, 0.0, 0.05, 1.0, 0.0), 0.75), color=(0.21, 0.16, 0.07),
               roughness=0.85, height=-1.0)
    dry = graph.mul(graph.remap(height, 0.22, 0.0),
                    graph.remap(graph.noise(scale=9.0, detail=5.0), 0.3, 0.7))
    coat.cover(dry, color=(0.33, 0.25, 0.12), roughness=0.85)
    return coat.finish(bump_strength=0.4, bump_distance=0.002)


# ---------------------------------------------------------------------------------------------
# The high-detail frond that is baked onto a card
# ---------------------------------------------------------------------------------------------

def model_frond(name, seed, leaflets, dryness, location, card_material):
    """One frond laid flat along +Y: returns (the card to bake onto, [high-detail sources])."""
    rng = random.Random(seed)
    leaf = M.foliage(color=(0.075, 0.20, 0.030), vein_axis='X', gloss=0.15, dryness=dryness,
                     seed=seed, name=f'{name}_leaf')
    stem = M.foliage(color=(0.26, 0.30, 0.085), vein_axis='Y', gloss=0.4, dryness=0.0,
                     seed=seed + 1, name=f'{name}_stem')
    base_y = -FROND_LENGTH / 2 + 0.02
    rachis_length = FROND_LENGTH - 0.28

    blades = []
    for side in (-1, 1):
        for index in range(leaflets):
            along = (index + 0.5 + 0.25 * side) / leaflets
            if along < 0.07:
                continue                                    # the bare stalk below the leaflets
            y = base_y + along * rachis_length
            length = (0.36 + 0.44 * math.sin(math.pi * min(1.0, along * 1.25) ** 0.8)) \
                * rng.uniform(0.9, 1.08)
            angle = math.radians(profiles.lerp(62.0, 32.0, along) + rng.uniform(-7.0, 7.0)
                                 + (11.0 if index % 2 else -9.0))
            lift = 0.018 if index % 2 else 0.0
            direction = (side * math.sin(angle), math.cos(angle))
            path = []
            for step in range(5):
                u = step / 4
                path.append((side * 0.012 + direction[0] * length * u, y + direction[1] * length * u,
                             0.012 + lift + 0.05 * math.sin(math.pi * 0.9 * u) - 0.035 * u * u))
            width = rng.uniform(0.85, 1.15)
            blades.append(build.ribbon(f'{name}_blade', path,
                                       [0.030 * width, 0.046 * width, 0.043 * width,
                                        0.029 * width, 0.004], columns=2, fold=0.32))
    blades = scene.join(blades, f'{name}_blades')
    scene.set_material(blades, leaf)

    rachis_path = [(0.0, base_y + rachis_length * step / 8, 0.004) for step in range(9)]
    rachis = build.tube(f'{name}_rachis', rachis_path,
                        radii=[profiles.lerp(0.020, 0.004, step / 8) for step in range(9)],
                        segments=6, up=(1.0, 0.0, 0.0))
    scene.set_material(rachis, stem)

    card = build.grid(name, size=(FROND_WIDTH, FROND_LENGTH))
    scene.set_material(card, card_material)
    for obj in (blades, rachis, card):
        obj.location = location
    return card, [blades, rachis]


def make(a):
    trunk = build.cylinder('trunk_piece', radius=TRUNK_PIECE_RADIUS, depth=TRUNK_PIECE_HEIGHT,
                           segments=24, caps=False, on_ground=True)
    scene.set_material(trunk, M.palm_trunk(color=(0.34, 0.32, 0.29), ring_spacing=0.12,
                                           lichen=0.5, foot=0.75, seed=5, name='trunk_bark'))
    trunk.location = (3.0, 0.0, 0.0)
    a.add_piece(trunk)

    shaft = build.cylinder('crownshaft_piece', radius=0.16, depth=SHAFT_HEIGHT, segments=20,
                           caps=False, on_ground=True)
    scene.set_material(shaft, crownshaft_material(seed=6))
    shaft.location = (5.0, 0.0, 0.0)
    a.add_piece(shaft)

    # The cards take everything from their sources; this material only gives their faces the
    # name, and so the role, of the game material: "cutout" is alpha-tested and double sided.
    cutout = M.foliage(name='cutout')
    card_a, sources_a = model_frond('frond_a', seed=31, leaflets=62, dryness=0.1,
                                    location=(-2.0, 0.0, 1.0), card_material=cutout)
    card_b, sources_b = model_frond('frond_b', seed=47, leaflets=54, dryness=0.4,
                                    location=(-4.5, 0.0, 1.0), card_material=cutout)
    a.add_piece(card_a, sources=sources_a)
    a.add_piece(card_b, sources=sources_b)

    a.collider_cylinder('trunk', (0.0, 0.0, 3.5), radius=0.24, height=7.0)
    a.set_lod_distances(*LOD_DISTANCES)
    a.bake(size=1024, orm_size=512, occlusion_ground=False, occlusion_distance=0.25,
           cage_extrusion=0.15, max_ray_distance=0.4, occlusion_in_color=0.4)


# ---------------------------------------------------------------------------------------------
# The trees, built from the baked pieces
# ---------------------------------------------------------------------------------------------

def trunk_centre(z):
    """The trunk's centre line: nearly straight, with a slow lean."""
    return (0.06 * math.sin(z * 0.33), 0.04 * math.sin(z * 0.21 + 1.0), z)


def trunk_radius(z):
    """Swollen foot, a belly at mid height, tapering to the crownshaft."""
    return (0.185 + 0.10 * math.exp(-z / 0.32) + 0.035 * math.exp(-((z - 3.1) / 1.5) ** 2)
            - 0.012 * z / TRUNK_TOP)


def model_trunk(a, level):
    """The stem and crownshaft: the 3 m trunk piece runs up the stem mirror-repeated, so
    every joint between two runs is seamless."""
    sides = (12, 8, 5)[level]
    u0, v0, u1, v1 = a.piece_rect('trunk_piece')
    # (from height, to height, piece V at the start, piece V at the end, rings)
    runs = [(0.0, 3.0, 0.0, 1.0, (7, 4, 2)[level]),
            (3.0, 4.95, 1.0, 0.35, (4, 2, 1)[level]),
            (4.95, TRUNK_TOP, 0.35, 0.35 + (TRUNK_TOP - 4.95) / TRUNK_PIECE_HEIGHT,
             (2, 1, 1)[level])]
    parts = []
    for index, (low, high, from_v, to_v, rings) in enumerate(runs):
        heights = [profiles.lerp(low, high, step / rings) for step in range(rings + 1)]
        if index == 0:
            heights.insert(1, 0.18)                         # one more ring for the flared foot
        path = [trunk_centre(z) for z in heights]
        rect = (u0, profiles.lerp(v0, v1, from_v), u1, profiles.lerp(v0, v1, to_v))
        parts.append(build.tube(f'trunk{index}', path, radii=[trunk_radius(z) for z in heights],
                                segments=sides, caps=False, up=(0.0, 1.0, 0.0), uv_rect=rect))

    rings = (5, 3, 1)[level]
    shaft_radii = [0.205, 0.20, 0.185, 0.165, 0.135, 0.10]
    heights = [TRUNK_TOP + SHAFT_HEIGHT * step / rings for step in range(rings + 1)]
    radii = [shaft_radii[round(step * 5 / rings)] for step in range(rings + 1)]
    parts.append(build.tube('shaft', [trunk_centre(z) for z in heights], radii=radii,
                            segments=sides, caps=False, up=(0.0, 1.0, 0.0),
                            uv_rect=a.piece_rect('crownshaft_piece')))
    if level < 2:
        top = TRUNK_TOP + SHAFT_HEIGHT
        spear = [trunk_centre(top - 0.1), trunk_centre(top + 0.6), trunk_centre(top + 1.35)]
        parts.append(build.tube('spear', spear, radii=[0.07, 0.035, 0.004], segments=5,
                                caps=False, up=(0.0, 1.0, 0.0),
                                uv_rect=a.piece_rect('crownshaft_piece')))
    return scene.set_material(scene.join(parts), a.material('atlas'))


def model_crown(a, level):
    """The fronds: each a folded ribbon along an arching path, mapped onto a frond card."""
    rng = random.Random(1907)
    count = FROND_COUNTS[level]
    segments = (10, 5, 3)[level]
    columns = 2                                             # a V section is seen from any side
    rects = [a.piece_rect('frond_a'), a.piece_rect('frond_b')]
    top = trunk_centre(TRUNK_TOP + SHAFT_HEIGHT)
    fronds = []
    for index in range(FROND_COUNTS[0]):
        age = index / (FROND_COUNTS[0] - 1)                 # 0 = youngest, upright; 1 = oldest
        azimuth = math.radians(index * 137.5 + rng.uniform(-9.0, 9.0))
        elevation = math.radians(profiles.lerp(72.0, 2.0, age ** 0.9) + rng.uniform(-5.0, 5.0))
        droop = math.radians(profiles.lerp(32.0, 72.0, age) + rng.uniform(-8.0, 8.0))
        length = profiles.lerp(3.3, 4.1, age) * rng.uniform(0.93, 1.05)
        twist = rng.uniform(-0.5, 0.5)
        total = FROND_COUNTS[0]
        if index > 0 and (index * count) // total == ((index - 1) * count) // total:
            continue                                        # lower levels keep an even subset
        point = [top[0] + 0.09 * math.cos(azimuth), top[1] + 0.09 * math.sin(azimuth),
                 top[2] - 0.12 - 0.25 * age]
        path = [tuple(point)]
        for step in range(segments):
            s = (step + 0.5) / segments
            pitch = elevation - droop * s ** 1.6
            reach = length / segments
            point = [point[0] + math.cos(azimuth) * math.cos(pitch) * reach,
                     point[1] + math.sin(azimuth) * math.cos(pitch) * reach,
                     point[2] + math.sin(pitch) * reach]
            path.append(tuple(point))
        width = FROND_WIDTH * length / FROND_LENGTH * FROND_WIDENING[level]
        widths = [width] * len(path)
        twists = [twist * step / segments for step in range(len(path))]
        rect = rects[1] if age > 0.62 else rects[0]
        hang = -0.34 - 0.22 * age
        fronds.append(build.ribbon(f'frond{index}', path, widths, columns=columns, fold=hang,
                                   twists=twists, uv_rect=rect))
        if level == 0:
            # A second, raised layer of leaflets gives the feathery, many-planed look.
            other = rects[0] if age > 0.62 else rects[1]
            fronds.append(build.ribbon(f'frond{index}_upper', path, [value * 0.88 for value in widths],
                                       columns=columns, fold=0.16, twists=twists, uv_rect=other))
    return scene.set_material(scene.join(fronds), a.material('cutout'))


def crown_shade(position):
    """Vertex shading for the crown: the fronds share two textures, so the darkness where
    they crowd together at the top of the crownshaft is painted on the vertices instead."""
    top = trunk_centre(TRUNK_TOP + SHAFT_HEIGHT)
    distance = math.dist(position, top)
    below = profiles.smoothstep(TRUNK_TOP + 0.5, TRUNK_TOP + SHAFT_HEIGHT, position.z)
    near = 1.0 - profiles.smoothstep(0.15, 1.9, distance)
    return 1.0 - 0.52 * near * max(below, 0.0)


def assemble(a):
    for level in range(3):
        tree = scene.join([model_trunk(a, level), model_crown(a, level)], f'lod{level}')
        shading.cleanup(tree, merge_distance=0.0005, recalc=False)
        shading.smooth(tree, angle=math.radians(60))
        shading.vertex_colors(tree, crown_shade)
        a.add_baked(tree)
