"""Fan palms built from one description (a helper module, not an asset).

fan_palm.py holds a SPEC in _palm.py's terms (trunk, crown, litter, collider, variants) whose
cards carry a 'fan' description instead of a 'frond' one, plus a 'skirt' of dead leaves, and
calls make_fan_palm(a, SPEC) and assemble_fan_palm(a, SPEC). Everything else (trunk, the crown
heart, foot, impostor, levels of detail, wind mask, the node table) is _palm.py's, so a fan palm
has the same nodes as the feather palms: variant_<letter>_lod0..2, materials "atlas" and
"cutout", collider col_cyl_trunk.

The fan leaf (fan_leaf) is modelled segment by segment, as a costapalmate leaf of a Washingtonia
or a Sabal is: a long, flat petiole ends in a short costa running into the blade; 40 to 50
pleated segments radiate from it over about 200 degrees, joined into one blade up to about half
their length, then free, narrowing to split tips that droop and curl. Alternate segments fold
up and down (the pleats catch the low sun as bright and dark bands). Baked flat onto a card,
the card is bent and folded along its length by _palm.add_crown like any frond, which gives the
blade its V and the arch of the petiole.

The skirt: rows of dead fans hanging against the trunk under the crown, shingled so each row's
blades cover the petioles of the row below (spec['skirt'], variant 'skirt_rows').

Blender axes: Z up; a palm stands on Z = 0 at its node origin.
"""
import math
import random

import numpy as np

from lib import build, scene
from lib import materials as M

import _flora as F
import _foliage as G
import _palm as P


def fan_width(card):
    """Width of a fan card: the blade's sideways reach plus a margin for curled tips."""
    return 2.0 * 0.88 * card['fan']['radius'] + 0.08


def prepare(spec):
    """Gives every fan card the 'frond' reach that _palm.card_width reads, so _palm's crown
    assembly sizes the fan cards right (card_width = 2.2 * reach + 0.08)."""
    for card in spec['cards']:
        card['frond'] = {'reach': (fan_width(card) - 0.08) / 2.2}
    return spec


def fan_leaf(length, radius, seed, segments=44, spread=200.0, split=0.5, droop=0.08,
             curl=5.0, ragged=0.0, missing=0.0, petiole=(0.035, 0.022), fold=0.5,
             bowl=0.05, costa=0.35):
    """A fan leaf lying flat along +Y: returns (blade, stalk) as two Soups.

    The petiole runs from the origin to the hastula at length - radius; the segments radiate
    from there over `spread` degrees, the outer ones shorter, joined up to `split` of their
    length; beyond it they narrow to a tip, droop by `droop` (times their length) and turn by
    up to `curl` degrees. ragged (0..1) disorders a dead leaf, missing drops segments."""
    rng = random.Random(seed)
    blade, stalk = G.Soup(), G.Soup()
    hastula = length - radius
    step = math.radians(spread) / segments
    ts = np.linspace(0.0, 1.0, 8)
    for index in range(segments):
        if rng.random() < missing:
            continue
        along = (index + 0.5) / segments
        theta = math.radians(spread) * (along - 0.5)
        theta += math.radians(rng.uniform(-1.5, 1.5) + ragged * rng.uniform(-7.0, 7.0))
        edge = min(1.0, abs(theta) / math.radians(spread * 0.5))
        reach = radius * (0.72 + 0.28 * math.cos(edge * math.pi * 0.5)) * rng.uniform(0.92, 1.05)
        reach *= 1.0 - ragged * rng.uniform(0.0, 0.3)
        free = np.clip((ts - split) / (1.0 - split), 0.0, 1.0)
        turn = math.radians(rng.uniform(-curl, curl) * (1.0 + 2.5 * ragged))
        angles = theta + turn * free * free
        rho = 0.04 + (reach - 0.04) * ts
        x = rho * np.sin(angles)
        y = hastula + rho * np.cos(angles)
        sag = droop * (1.0 + ragged * rng.uniform(0.0, 2.0)) * reach
        z = 0.015 + bowl * np.sin(math.pi * 0.8 * ts) * (1.0 - edge * 0.5) - sag * free * free
        joined = rho * step * 1.1
        width = np.where(ts <= split, joined, (0.04 + (reach - 0.04) * split) * step * 1.1
                         * (1.0 - free) * 0.95 + 0.004)
        pleat = fold * (1.0 if index % 2 else -1.0) * rng.uniform(0.8, 1.2)
        blade.add(G.ribbon(np.stack([x, y, z], axis=1), width, fold=pleat))
    # Petiole: a broad, flat stalk, slightly arched, then the costa running into the blade.
    count = 10
    spine = [(0.0, hastula * s / (count - 1), 0.012 + 0.02 * math.sin(math.pi * s / (count - 1)))
             for s in range(count)]
    radii = [G.lerp(petiole[0], petiole[1], (s / (count - 1)) ** 0.7) for s in range(count)]
    part = G.tube(spine, radii, sides=6)
    part[0][:, 0] *= 1.6
    stalk.add(part)
    rib = [(0.0, hastula + radius * costa * s / 4, 0.02 + bowl * 0.6 * math.sin(math.pi * 0.25 * s))
           for s in range(5)]
    stalk.add(G.tube(rib, [petiole[1] * 0.8 * (1.0 - 0.18 * s) for s in range(5)], sides=5))
    return blade, stalk


def fan_fronds(spec, variant):
    """The crown of _palm.crown_fronds plus the skirt of hanging dead fans."""
    fronds = P.crown_fronds(spec, variant)
    skirt = spec.get('skirt')
    rows = variant.get('skirt_rows', skirt['rows'] if skirt else 0)
    if not rows:
        return fronds
    rng = random.Random(variant['seed'] + 41)
    dead = spec['cards'][2]['name']
    per_row = skirt['per_row']
    for row in range(rows):
        for k in range(per_row):
            azimuth = math.tau * (k + 0.5 * (row % 2)) / per_row + rng.uniform(-0.18, 0.18)
            fronds.append({
                'base': F.polar(skirt['neck'] + 0.03 * row, azimuth,
                                -(skirt['top'] + skirt['step'] * row + rng.uniform(-0.08, 0.08))),
                'azimuth': azimuth,
                'elevation': math.radians(-rng.uniform(78.0, 86.0)),
                'droop': math.radians(rng.uniform(-5.0, 5.0)),
                'length': F.lerp(skirt['length'][0], skirt['length'][1], rng.random())
                          * variant.get('scale', 1.0),
                'power': 1.0, 'sway': rng.uniform(-0.2, 0.2), 'roll': rng.uniform(-0.15, 0.15),
                'roll_tip': rng.uniform(-0.4, 0.4),
                'fold': -math.radians(rng.uniform(35.0, 55.0)),
                'card': dead, 'other': dead, 'mirror': rng.random() < 0.5, 'dead': True})
    return fronds


# ---------------------------------------------------------------------------------------------
# make: the pieces (after _palm.make_palm, with fan cards and the skirt in the impostors)
# ---------------------------------------------------------------------------------------------

def make_fan_palm(a, spec):
    prepare(spec)
    bench = F.Bench(a, M.foliage(name='cutout'))
    trunk = spec['trunk']
    bench.stem_piece('bark', trunk['piece_radius'], trunk['piece_length'],
                     P.trunk_material(trunk['color'], trunk['ring'], 'trunk_bark',
                                      seed=spec['seed'], lichen=trunk.get('lichen', 0.4),
                                      groove=trunk.get('groove', 0.2)))

    # Fan cards, and for the impostors the same fans with broader segments and fewer of them,
    # so they stay above the alpha test at an impostor's few texels.
    detailed = {}
    for card in spec['cards']:
        leaf = G.leaf_material(card['color'], f"{card['name']}_leaf", seed=card['seed'],
                               **card.get('leaf', {}))
        stem = G.stalk_material(card['stalk'], f"{card['name']}_stalk", seed=card['seed'] + 1)
        fan = dict(card['fan'])
        blade, stalk = fan_leaf(card['length'], seed=card['seed'], **fan)
        bench.flat_card(card['name'], fan_width(card), card['length'],
                        [(blade, leaf), (stalk, stem)], texel_scale=card.get('texels', 1.0))
        broad = dict(fan)
        broad['segments'] = max(16, int(fan.get('segments', 44) * 0.6))
        fat_blade, fat_stalk = fan_leaf(card['length'], seed=card['seed'], **broad)
        detailed[card['name']] = (fat_blade.part(), fat_stalk.part(), leaf, stem, card['length'])

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
                            seed=spec['seed'] + 8, gloss=0.15, dry=0.35, veins=3.0)
    bench.upright_card('tuft', 0.9, 0.46, [(G.grass_tuft(30, 0.42, spec['seed'] + 9, foot=0.12),
                                            grass)], texel_scale=0.8)

    zero = F.polar(0.0, 0.0)
    for index, variant in enumerate(spec['variants']):
        fronds = fan_fronds(spec, variant)
        soups = {}
        for frond in fronds:
            fat_blade, fat_stalk, leaf, stem, length = detailed[frond['card']]
            frames = P.frames_of(frond, zero, 10)
            scale = frond['length'] / length
            for kind, part, material in (('leaf', fat_blade, leaf), ('stalk', fat_stalk, stem)):
                soup = soups.setdefault((frond['card'], kind), (G.Soup(), material))[0]
                soup.add(F.bend_frond(part, frames, length, fold=frond['fold'], scale=scale))
        objects = [soup.object(f'crown{index}_source{number}', material)
                   for number, (soup, material) in enumerate(soups.values())]
        reach, low, high = P.crown_bounds(fronds)
        bench.impostor(f'crown_{F.VARIANT_LETTERS[index]}', objects, reach * 2.0, high - low,
                       0.0, low, texel_scale=spec.get('impostor_texels', 0.16))

    collider = spec['collider']
    a.collider_cylinder('trunk', (0.0, 0.0, collider['height'] * 0.5), radius=collider['radius'],
                        height=collider['height'])
    a.bake(orm_size=512, normal_size=512, occlusion_ground=False, occlusion_distance=0.25,
           cage_extrusion=P.BAKE_REACH, max_ray_distance=0.0, occlusion_in_color=0.4)


# ---------------------------------------------------------------------------------------------
# assemble: the game meshes (after _palm.assemble_palm, with the skirt)
# ---------------------------------------------------------------------------------------------

def assemble_fan_palm(a, spec):
    prepare(spec)
    table = []
    for index, variant in enumerate(spec['variants']):
        fronds = fan_fronds(spec, variant)
        for level in range(3):
            shape = F.Shape()
            P.add_trunk(shape, a, spec, variant, level)
            if level < 2:
                P.add_crown(shape, a, spec, variant, fronds, level)
                P.add_foot(shape, a, spec, variant, level)
            else:
                P.add_impostor(shape, a, spec, variant, fronds, index)
            tree = shape.build(F.variant_name(index, level), a)
            tree.location = (variant.get('x', 0.0), 0.0, 0.0)
            a.add_baked(tree)
        base = P.crown_base(spec, variant)
        reach, _low, high = P.crown_bounds(fronds)
        table.append({'node': f'variant_{F.VARIANT_LETTERS[index]}', 'x': variant.get('x', 0.0),
                      'height': round(base.z + high, 2), 'crown_width': round(reach * 2.0, 2),
                      'crown_base': [round(base.x, 2), round(base.y, 2), round(base.z, 2)]})
    F.describe(a, table, P.LOD_DISTANCES, collider='col_cyl_trunk, about each variant node')
