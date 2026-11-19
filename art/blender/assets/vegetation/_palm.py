"""Feather palms built from one description (a helper module, not an asset).

royal_palm.py and coconut_palm.py each hold a SPEC dictionary and call make_palm(a, SPEC) and
assemble_palm(a, SPEC). make_palm bakes the pieces (see _flora.py): a straight length of ringed
trunk, the crownshaft and a coconut husk where the palm has them, three frond cards baked from
fronds with every leaflet modelled (fresh, old, dead; see _foliage.py), a patch of ground
litter, a grass tuft, and one IMPOSTOR card per variant baked from that variant's whole
detailed crown. assemble_palm builds, for every variant, three levels:

    variant_<letter>_lod0   trunk, crown of folded frond strips in two layers, nuts, the foot
    variant_<letter>_lod1   about a quarter: one layer of shorter strips, a coarser trunk
    variant_<letter>_lod2   a three-sided trunk and three crossed cards showing the impostor

The trunk stays geometry at every level, so a leaning palm keeps its true curve from any side;
only the crown is an impostor. Variant nodes stand in a row along +X (SPEC variant 'x'), so the
file shows as a group; each mesh is modelled about its own foot.

Vertex colour and wind mask: see _flora.py (R shade, G warmth, B wind; wind = 2 * (1 - B / R)).
Trunks, nuts and the foot carry wind 0, fronds 0.25 at the stalk rising to 1 at the tip.

Blender axes: Z up; a palm stands on Z = 0 at its node origin.
"""
import math
import random

from mathutils import Vector

from lib import build, scene
from lib import materials as M

import _flora as F
import _foliage as G

LOD_DISTANCES = (35.0, 90.0)
BAKE_REACH = 7.0          # metres: how far in front of a card the bake rays start


# ---------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------

def trunk_material(color, ring, name, seed=0, lichen=0.4, groove=0.2, foot=0.9):
    """A palm stem: leaf-scar rings every `ring` metres as dark grooves with a paler band
    above, fine vertical fissures, lichen blotches and a damp, dirty foot."""
    graph = M.Graph(name, seed)
    z = graph.axis('Z')
    cloud = graph.noise(scale=2.2, detail=4.0)
    fine = graph.noise(scale=75.0, detail=4.0, stretch=(1.0, 1.0, 0.1))
    rings = graph.wave(period=ring, direction='Z', distortion=0.5, detail=2.0)
    scar = graph.remap(rings, 0.0, groove, 1.0, 0.0, smooth=True)
    band = graph.remap(rings, groove, 0.6, 1.0, 0.0, smooth=True)
    base = graph.hsv(color, value=graph.remap(cloud, 0.2, 0.8, 0.8, 1.16))
    base = graph.hsv(base, value=graph.remap(fine, 0.2, 0.8, 0.86, 1.1))
    base = graph.hsv(base, value=graph.remap(band, 0.0, 1.0, 1.0, 1.14))
    coat = M.Coat(graph, base, roughness=graph.remap(cloud, 0.2, 0.8, 0.78, 0.92),
                  height=graph.add(graph.mul(fine, 0.35), graph.mul(scar, -1.0)))
    coat.cover(graph.mul(scar, 0.75), color=tuple(value * 0.4 for value in color), roughness=0.95)
    blotch = graph.mask(graph.noise(scale=4.5, detail=5.0, roughness=0.7), 0.66 - 0.12 * lichen,
                        0.05)
    coat.cover(graph.mul(blotch, 0.5), color=(0.40, 0.42, 0.33), roughness=0.9)
    damp = graph.mul(graph.remap(z, foot, 0.0),
                     graph.remap(graph.noise(scale=6.0, detail=5.0), 0.2, 0.7))
    coat.cover(damp, color=(0.15, 0.115, 0.08), roughness=0.95)
    return coat.finish(bump_strength=0.75, bump_distance=0.004)


def crownshaft_material(height, name='shaft_skin', seed=0):
    """The waxy green sheath at the top of a royal palm's trunk: fibrous, paler towards the
    top, with the papery brown rims of old leaf bases and a dry foot."""
    graph = M.Graph(name, seed)
    up = graph.remap(graph.axis('Z'), 0.0, height)
    fibres = graph.noise(scale=90.0, detail=3.0, stretch=(1.0, 1.0, 0.03))
    cloud = graph.noise(scale=2.5, detail=4.0)
    base = graph.ramp(up, [(0.0, (0.075, 0.17, 0.035)), (0.45, (0.11, 0.27, 0.05)),
                           (1.0, (0.17, 0.35, 0.07))])
    base = graph.hsv(base, value=graph.remap(fibres, 0.2, 0.8, 0.86, 1.12))
    coat = M.Coat(graph, base, roughness=graph.remap(cloud, 0.2, 0.8, 0.24, 0.38),
                  height=graph.mul(fibres, 0.3))
    rims = graph.wave(period=0.52, direction='Z', distortion=0.6, detail=2.0)
    coat.cover(graph.mul(graph.remap(rims, 0.0, 0.05, 1.0, 0.0), 0.75), color=(0.21, 0.16, 0.07),
               roughness=0.85, height=-1.0)
    dry = graph.mul(graph.remap(up, 0.22, 0.0),
                    graph.remap(graph.noise(scale=9.0, detail=5.0), 0.3, 0.7))
    coat.cover(dry, color=(0.33, 0.25, 0.12), roughness=0.85)
    return coat.finish(bump_strength=0.4, bump_distance=0.002)


def husk_material(name='husk', seed=0):
    """A coconut in its husk: green going yellow and brown in patches, faintly ribbed."""
    graph = M.Graph(name, seed)
    cloud = graph.noise(scale=7.0, detail=4.0)
    fibres = graph.noise(scale=60.0, detail=3.0, stretch=(1.0, 1.0, 0.15))
    base = graph.ramp(cloud, [(0.25, (0.20, 0.27, 0.06)), (0.55, (0.36, 0.33, 0.09)),
                              (0.8, (0.30, 0.19, 0.08))])
    base = graph.hsv(base, value=graph.remap(fibres, 0.2, 0.8, 0.88, 1.1))
    coat = M.Coat(graph, base, roughness=graph.remap(cloud, 0.2, 0.8, 0.45, 0.7),
                  height=graph.mul(fibres, 0.3))
    return coat.finish(bump_strength=0.4, bump_distance=0.002)


# ---------------------------------------------------------------------------------------------
# The plan of a palm: trunk line, fronds and nuts of a variant (used by make and by assemble)
# ---------------------------------------------------------------------------------------------

def card_width(card):
    return 2.2 * card['frond']['reach'] + 0.08


def trunk_point(variant, t):
    """The trunk's centre line at t = 0 (foot) .. 1 (top): it leaves the ground leaning and
    straightens upwards as `curve` grows; a slow wobble keeps it from being a ruled line."""
    z = variant['height'] * t
    out = variant.get('lean', 0.0) * (1.0 - (1.0 - t) ** variant.get('curve', 1.0))
    point = F.polar(out, variant.get('lean_azimuth', 0.0), z)
    point.x += 0.06 * math.sin(z * 0.33 + variant['seed'])
    point.y += 0.05 * math.sin(z * 0.21 + 1.0 + variant['seed'])
    return point


def trunk_radius(spec, variant, t):
    trunk = spec['trunk']
    z = variant['height'] * t
    belly = trunk.get('belly', 0.0) * math.exp(-((t - 0.5) / 0.25) ** 2)
    return (trunk['radius'] * variant.get('girth', 1.0) + trunk['flare'] * math.exp(-z / 0.32)
            + belly - trunk.get('taper', 0.0) * t)


def trunk_axis(variant):
    """The direction of the trunk at its top: the crown's own up."""
    return F.unit(trunk_point(variant, 1.0) - trunk_point(variant, 0.96))


def crown_base(spec, variant):
    """Where the fronds leave the palm: the top of the trunk, or of the crownshaft."""
    top = trunk_point(variant, 1.0)
    shaft = spec.get('shaft')
    return top + trunk_axis(variant) * shaft['height'] if shaft else top


def crown_fronds(spec, variant):
    """Every frond of a variant's crown about the crown base: a list of dictionaries."""
    crown = spec['crown']
    rng = random.Random(variant['seed'])
    names = [card['name'] for card in spec['cards']]
    count = variant.get('fronds', crown['count'])
    tilt = math.radians(variant.get('tilt', 0.0))
    fronds = []
    for index in range(count):
        age = index / (count - 1)                           # 0 youngest, upright; 1 oldest
        azimuth = index * F.GOLDEN_ANGLE + rng.uniform(-0.16, 0.16) + variant['seed']
        elevation = math.radians(F.lerp(crown['up'], crown['down'], age ** 0.9)
                                 + rng.uniform(-6.0, 6.0))
        elevation -= tilt * math.cos(azimuth - variant.get('lean_azimuth', 0.0))
        old = age > crown.get('old', 0.6)
        fronds.append({
            'base': F.polar(crown['neck'], azimuth, -crown['stack'] * age),
            'azimuth': azimuth, 'elevation': elevation,
            'droop': math.radians(F.lerp(crown['droop'][0], crown['droop'][1], age)
                                  + rng.uniform(-8.0, 8.0)),
            'length': F.lerp(crown['length'][0], crown['length'][1], age)
                      * rng.uniform(0.92, 1.06) * variant.get('scale', 1.0),
            'power': crown.get('power', 1.6), 'sway': rng.uniform(-0.25, 0.25),
            'roll': rng.uniform(-0.3, 0.3),
            'roll_tip': rng.uniform(-1.0, 1.0) * crown.get('twist', 0.5),
            'fold': -math.radians(F.lerp(crown['hang'][0], crown['hang'][1], age)
                                  + rng.uniform(-6.0, 6.0)),
            'card': names[1] if old else names[0], 'other': names[0] if old else names[1],
            'mirror': rng.random() < 0.5, 'dead': False})
    for _ in range(variant.get('dead', crown.get('dead', 0))):
        azimuth = rng.uniform(0.0, math.tau)
        fronds.append({
            'base': F.polar(crown['neck'], azimuth, -crown['stack'] - 0.12),
            'azimuth': azimuth, 'elevation': math.radians(rng.uniform(-52.0, -30.0)),
            'droop': math.radians(rng.uniform(28.0, 45.0)),
            'length': crown['length'][1] * rng.uniform(0.72, 0.88) * variant.get('scale', 1.0),
            'power': 1.0, 'sway': rng.uniform(-0.3, 0.3), 'roll': rng.uniform(-0.5, 0.5),
            'roll_tip': rng.uniform(-1.2, 1.2), 'fold': -math.radians(rng.uniform(55.0, 75.0)),
            'card': names[2], 'other': names[2], 'mirror': rng.random() < 0.5, 'dead': True})
    return fronds


def frames_of(frond, origin, segments):
    return F.frond_frames(origin + frond['base'], frond['azimuth'], frond['elevation'],
                          frond['droop'], frond['length'], segments, power=frond['power'],
                          sway=frond['sway'], roll=frond['roll'], roll_tip=frond['roll_tip'])


def crown_nuts(spec, variant):
    """Coconuts hanging under the crown: a list of (position about the crown base, size)."""
    rng = random.Random(variant['seed'] + 7)
    nuts = []
    for index in range(variant.get('nuts', 0)):
        angle = index * 2.2 + rng.uniform(-0.4, 0.4)
        nuts.append((F.polar(rng.uniform(0.17, 0.27), angle, rng.uniform(-0.62, -0.3)),
                     rng.uniform(0.095, 0.125)))
    return nuts


def crown_bounds(fronds):
    """(reach, low, high) of a crown about its base, with room for the leaflets: the size of
    its impostor card."""
    zero = F.polar(0.0, 0.0)
    reach, low, high = 0.5, 0.0, 0.5
    for frond in fronds:
        for point, _tangent, _side, _normal in frames_of(frond, zero, 8):
            reach = max(reach, math.hypot(point.x, point.y))
            low, high = min(low, point.z), max(high, point.z)
    return reach + 0.5, low - 0.7, high + 0.5


# ---------------------------------------------------------------------------------------------
# make: the pieces
# ---------------------------------------------------------------------------------------------

def make_palm(a, spec):
    bench = F.Bench(a, M.foliage(name='cutout'))
    trunk = spec['trunk']
    bench.stem_piece('bark', trunk['piece_radius'], trunk['piece_length'],
                     trunk_material(trunk['color'], trunk['ring'], 'trunk_bark',
                                    seed=spec['seed'], lichen=trunk.get('lichen', 0.4),
                                    groove=trunk.get('groove', 0.2)))
    if spec.get('shaft'):
        bench.stem_piece('shaft', 0.17, spec['shaft']['height'],
                         crownshaft_material(spec['shaft']['height'], seed=spec['seed'] + 1))
    husk = None
    if any(variant.get('nuts') for variant in spec['variants']):
        husk = husk_material(seed=spec['seed'] + 2)
        bench.stem_piece('husk', 0.11, 0.3, husk, texel_scale=0.8)

    # Frond cards, and for the impostors the same fronds with broader leaflets: at an
    # impostor's few texels per leaflet the true ones would fall under the alpha test.
    detailed = {}
    for card in spec['cards']:
        leaf = G.leaf_material(card['color'], f"{card['name']}_leaf", seed=card['seed'],
                               **card.get('leaf', {}))
        stem = G.stalk_material(card['stalk'], f"{card['name']}_stalk", seed=card['seed'] + 1)
        frond = dict(card['frond'])
        if frond.pop('profile', None) == 'coconut':
            frond['profile'] = G.coconut_profile
        leaves, stalk = G.pinnate_frond(card['length'], seed=card['seed'], **frond)
        bench.flat_card(card['name'], card_width(card), card['length'],
                        [(leaves, leaf), (stalk, stem)], texel_scale=card.get('texels', 1.0))
        broad = dict(frond)
        broad['width'] = broad.get('width', 0.042) * 2.2
        broad['pairs'] = max(12, int(broad['pairs'] * 0.75))
        fat_leaves, fat_stalk = G.pinnate_frond(card['length'], seed=card['seed'], **broad)
        detailed[card['name']] = (fat_leaves.part(), fat_stalk.part(), leaf, stem, card['length'])

    litter = spec['litter']
    mound, chips, dead = G.litter(litter['radius'], spec['seed'] + 3, chips=litter.get('chips', 150),
                                  leaves=litter.get('leaves', 12))
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
    grass = G.leaf_material(litter.get('grass', (0.11, 0.19, 0.04)), 'tuft_leaf',
                            seed=spec['seed'] + 8, gloss=0.2, dry=0.35, veins=3.0)
    bench.upright_card('tuft', 0.9, 0.46, [(G.grass_tuft(30, 0.42, spec['seed'] + 9, foot=0.12),
                                            grass)], texel_scale=0.8)

    zero = F.polar(0.0, 0.0)
    for index, variant in enumerate(spec['variants']):
        fronds = crown_fronds(spec, variant)
        soups = {}
        for frond in fronds:
            fat_leaves, fat_stalk, leaf, stem, length = detailed[frond['card']]
            frames = frames_of(frond, zero, 10)
            scale = frond['length'] / length
            for kind, part, material in (('leaf', fat_leaves, leaf), ('stalk', fat_stalk, stem)):
                soup = soups.setdefault((frond['card'], kind), (G.Soup(), material))[0]
                soup.add(F.bend_frond(part, frames, length, fold=frond['fold'], scale=scale))
        for position, size in crown_nuts(spec, variant):
            soup = soups.setdefault(('nuts', 'husk'), (G.Soup(), husk))[0]
            soup.add(G.ball(size, squash=(1.0, 1.0, 1.25)), offset=tuple(position))
        objects = [soup.object(f'crown{index}_source{number}', material)
                   for number, (soup, material) in enumerate(soups.values())]
        reach, low, high = crown_bounds(fronds)
        bench.impostor(f'crown_{F.VARIANT_LETTERS[index]}', objects, reach * 2.0, high - low,
                       0.0, low, texel_scale=spec.get('impostor_texels', 0.16))

    collider = spec['collider']
    a.collider_cylinder('trunk', (0.0, 0.0, collider['height'] * 0.5), radius=collider['radius'],
                        height=collider['height'])
    a.bake(orm_size=512, normal_size=512, occlusion_ground=False, occlusion_distance=0.25,
           cage_extrusion=BAKE_REACH, max_ray_distance=0.0, occlusion_in_color=0.4)


# ---------------------------------------------------------------------------------------------
# assemble: the game meshes
# ---------------------------------------------------------------------------------------------

def add_trunk(shape, a, spec, variant, level):
    trunk = spec['trunk']
    rings = trunk['rings'][level]
    sides = (trunk.get('sides', 12), 7, 3)[level]
    ts = [step / rings for step in range(rings + 1)]
    if level == 0:
        ts[1:1] = [0.1 / variant['height'], 0.32 / variant['height']]    # the flared foot
    elif level == 1:
        ts[1:1] = [0.25 / variant['height']]
    path = [trunk_point(variant, t) for t in ts]
    radii = [trunk_radius(spec, variant, t) for t in ts]
    shape.tube(path, radii, sides, a.piece_rect('bark'),
               vs=F.bark_vs(path, radii, trunk['piece_radius'], trunk['piece_length']))
    top, axis = path[-1], trunk_axis(variant)
    shaft = spec.get('shaft')
    if shaft:
        profile = [1.18, 1.16, 1.07, 0.95, 0.78, 0.58]
        count = (5, 2, 1)[level]
        scale = radii[-1]
        shape.tube([top + axis * (shaft['height'] * step / count) for step in range(count + 1)],
                   [scale * profile[round(step * 5 / count)] for step in range(count + 1)],
                   sides, a.piece_rect('shaft'))
        if level < 2:
            tip = top + axis * shaft['height']
            shape.tube([tip - axis * 0.1, tip + axis * 0.65, tip + axis * 1.4],
                       [0.07, 0.035, 0.004], 5, a.piece_rect('shaft'), wind=[0.2, 0.6, 1.0])
    elif level < 2:
        # The heart of a coconut crown: a bulge of old leaf bases the fronds grow out of.
        shape.tube([top - axis * 0.25, top + axis * 0.05, top + axis * 0.35, top + axis * 0.6],
                   [radii[-1], radii[-1] * 1.5, radii[-1] * 1.25, 0.04], sides,
                   a.piece_rect('bark'), vs=[0.45, 0.6, 0.75, 0.9], shade=0.8)


def add_crown(shape, a, spec, variant, fronds, level):
    base = crown_base(spec, variant)
    cards = {card['name']: card for card in spec['cards']}

    def shade(point):
        return 1.0 - 0.5 * (1.0 - F.smoothstep(0.15, 1.9, (point - base).length))

    # Seen from the street (nearly always from below) the fronds read green: every face is
    # wound to look down and outwards, where the camera is, and stores a normal pointing out
    # from the trunk and a little up, so it takes the sky and the low sun on its side of the
    # crown (see F.foliage_light). From above the back shows its negated, inward normal: a
    # mid green, never black.
    light = F.foliage_light(base, up=0.35)

    def face(point):
        radial = Vector((point.x - base.x, point.y - base.y, 0.0))
        radial = radial.normalized() if radial.length > 1e-6 else Vector()
        return radial * 0.7 - F.UP

    for frond in fronds:
        card = cards[frond['card']]
        frames = frames_of(frond, base, (9, 5)[level])
        half = card_width(card) * 0.5 * frond['length'] / card['length'] * (1.0, 1.18)[level]
        shape.frond(frames, a.piece_rect(frond['card']), half, frond['fold'], wind=(0.25, 1.0),
                    shade=shade, mirror=frond['mirror'], face_to=face, light=light)
        if level == 0 and not frond['dead']:
            # A second, raised layer from the other card: the many-planed, feathery look.
            shape.frond(frames, a.piece_rect(frond['other']), half * 0.9, 0.14,
                        wind=(0.25, 1.0), shade=shade, mirror=not frond['mirror'],
                        face_to=face, light=light)
    for position, size in crown_nuts(spec, variant):
        centre = base + position
        if level == 0:
            steps, radii, sides = (-1.0, -0.6, 0.0, 0.6, 1.0), (0.15, 0.78, 1.0, 0.8, 0.2), 6
        else:
            steps, radii, sides = (-1.0, 0.0, 1.0), (0.2, 1.0, 0.2), 4
        shape.tube([centre + F.UP * (size * 1.25 * step) for step in steps],
                   [size * radius for radius in radii], sides, a.piece_rect('husk'), shade=0.8)


def add_impostor(shape, a, spec, variant, fronds, index, cards=3):
    """Level 2 of the crown: upright cards crossing on the crown's axis, each showing the
    impostor piece. Their normals look along each card's facing, a little outwards, so both
    faces of the double-sided cards are lit alike."""
    base = crown_base(spec, variant)
    reach, low, high = crown_bounds(fronds)
    rect = a.piece_rect(f'crown_{F.VARIANT_LETTERS[index]}')
    for card in range(cards):
        angle = math.pi * card / cards
        right = F.polar(1.0, angle)
        facing = right.cross(F.UP)
        rows = [[base + right * (side * reach) + F.UP * z for side in (-1.0, 1.0)]
                for z in (low, high)]
        normals = [[F.unit(facing + right * (side * 0.6)) for side in (-1.0, 1.0)]
                   for _ in (low, high)]
        shape.grid(rows, rect, F.CUTOUT, normals=normals,
                   us=[1.0, 0.0] if card % 2 else [0.0, 1.0], wind=[0.5, 0.9])


def add_foot(shape, a, spec, variant, level):
    litter = spec['litter']
    F.ground_patch(shape, a.piece_rect('litter'), litter['radius'], seed=variant['seed'],
                   sides=(10, 6)[level], size=litter['size'])
    if level == 0:
        F.tuft_ring(shape, a.piece_rect('tuft'), litter.get('tufts', 6), litter['radius'] * 0.62,
                    0.8, 0.42, seed=variant['seed'] + 1)


def assemble_palm(a, spec):
    table = []
    for index, variant in enumerate(spec['variants']):
        fronds = crown_fronds(spec, variant)
        for level in range(3):
            shape = F.Shape()
            add_trunk(shape, a, spec, variant, level)
            if level < 2:
                add_crown(shape, a, spec, variant, fronds, level)
                add_foot(shape, a, spec, variant, level)
            else:
                add_impostor(shape, a, spec, variant, fronds, index)
            tree = shape.build(F.variant_name(index, level), a)
            tree.location = (variant.get('x', 0.0), 0.0, 0.0)
            a.add_baked(tree)
        base = crown_base(spec, variant)
        reach, _low, high = crown_bounds(fronds)
        table.append({'node': f'variant_{F.VARIANT_LETTERS[index]}', 'x': variant.get('x', 0.0),
                      'height': round(base.z + high, 2), 'crown_width': round(reach * 2.0, 2),
                      'crown_base': [round(base.x, 2), round(base.y, 2), round(base.z, 2)]})
    F.describe(a, table, LOD_DISTANCES, collider='col_cyl_trunk, about each variant node')
