"""Guard post of the air base gate: a 3 x 4 m rendered gatehouse (windows on three sides, a steel door
on the -X side, a flat roof with a 0.7 m overhang, eaves lamps, an air-conditioning unit) centred on
the origin, a sandbag wall under its front window, the sign "BASE AEREA PUNTA GARZA / ALTO - CONTROL
DE ACCESO" on its front and back walls, and a boom barrier beside it. The node barrier_arm has its
origin on the pivot at (2.6, 0, 1.0) in Blender (game: x 2.6, y 1.0, z 0); the red and white arm
reaches 8 m towards +X (to x = 10.6) with a counterweight behind the pivot, carries a round ALTO
sign and rests on a fork post. Scene extra barrier_open = {axis 'y', degrees -85} in the hinge style
of the aircraft (Blender axes): that is +85 degrees about the game's +Z. Three concrete barrier
blocks keep cars on the lane; lamp group lamp_post under the eaves.
"""
import math

import _base_kit as kit
import _gse_parts as gp
from _gse_parts import B, C, R, decal, text_mask, worn
from lib import meshkit as mk
from lib import surfaces as sf
from mathutils import Matrix

ASSET = {'id': 'base_guard_post', 'atlas': 1024, 'kind': 'building', 'builder': 'DetailKitAsset', 'cell': (640, 360), 'columns': 1,
         'views': ((28, 13, 1.25, (4.2, 0, 1.2)), (205, 24, 1.25, (4.2, 0, 1.2)))}

PIVOT = (2.6, 0.0, 1.0)


def jersey(name, location, turn, material):
    """A concrete barrier block 2.2 m long, 0.62 m wide at the foot, 0.82 m high, lying along X."""
    profile = [(0.31, 0.0), (0.31, 0.08), (0.2, 0.3), (0.112, 0.82), (-0.112, 0.82), (-0.2, 0.3), (-0.31, 0.08), (-0.31, 0.0)]
    obj = mk.loft(name, [[(x, y, z) for y, z in profile] for x in (-1.1, -1.08, 1.08, 1.1)])
    mk.map_points(obj, lambda v: (v.x, v.y * (0.97 if abs(v.x) > 1.09 else 1.0), v.z * (0.985 if abs(v.x) > 1.09 else 1.0)))
    mk.transform(obj, location, (0, 0, turn))
    return mk.assign(obj, material)


def make(a):
    a.image_quality = 76
    a.occlusion = (32, 0.4, 1.5)
    gp.RELIEF = 0.015
    title = text_mask(['BASE AEREA PUNTA GARZA', 'ALTO - CONTROL DE ACCESO'], 64, stencil=False, frame=5)
    stop = text_mask('ALTO', 96, stencil=False, weight=4)
    ring_mask = gp.drawn_mask('stop_ring', (256, 256), lambda d, w, h: d.ellipse((10, 10, w - 11, h - 11), outline=255, width=12))
    ident = text_mask(['IDENTIFIQUESE', 'APAGUE LAS LUCES'], 44, frame=4)
    wall = worn('wall', '#aaa189', 0.86, 0.0, chips=0.45, under=('#8f8a7f', '#a09a8c'), rust=0.0, dirt=0.8, fade=0.4, blotches=('#77775a',), blotch_scale=0.35,
                stains=1.0, stain_color='#2b261d', scale=0.7, dust=0.7, dust_height=1.0, edge=0.05, cavity=0.35, bump=1.2,
                decals=[decal(ident, (1.5, 0.2, 0.72), (1, 0, 0), 0.5, '#d2cebd', depth=0.04)])
    roof = worn('roof', '#5d5f5b', 0.8, 0.0, chips=0.0, rust=0.0, dirt=0.9, fade=0.5, stains=0.6, scale=0.9, dust=0.5, dust_height=5.0, cavity=0.3, bump=1.5)
    dark = worn('frame', '#2a2d2b', 0.5, 0.4, chips=0.45, rust=0.3, dirt=0.5, scale=0.9, dust=0.3, edge=0.02, cavity=0.15)
    post = worn('post_steel', '#53584f', 0.55, 0.4, chips=0.6, rust=0.45, dirt=0.6, scale=0.9, dust=0.6, dust_height=0.7, edge=0.02, cavity=0.15)
    concrete = worn('concrete', '#8f8a7f', 0.88, 0.0, chips=0.5, under=('#77736a', '#a29d91'), rust=0.1, dirt=0.8, stains=0.9, scale=0.9, dust=0.7,
                    dust_height=0.5, edge=0.04, cavity=0.3, bump=1.5)
    stripes = worn('arm_stripes', '#a92f27', 0.5, 0.2, chips=0.6, rust=0.3, dirt=0.5, stripes=('#d5d1c6', 1.0, (1, 0, 0), 0.5), scale=1.0, dust=0.2, edge=0.02, cavity=0.1)
    disc = worn('stop_sign', '#a3261f', 0.45, 0.2, chips=0.4, rust=0.3, dirt=0.5, scale=1.0, dust=0.0, edge=0.01, cavity=0.1,
                decals=[decal(stop, (6.1, 0.2725, 1.0), (0, 1, 0), 0.38, '#dedbd0', depth=0.02, strength=1.0), decal(stop, (6.1, 0.2475, 1.0), (0, -1, 0), 0.38, '#dedbd0', depth=0.02, strength=1.0),
                        decal(ring_mask, (6.1, 0.2725, 1.0), (0, 1, 0), 0.74, '#dedbd0', depth=0.02, strength=1.0), decal(ring_mask, (6.1, 0.2475, 1.0), (0, -1, 0), 0.74, '#dedbd0', depth=0.02, strength=1.0)])
    board = worn('sign_board', '#c8c6b9', 0.5, 0.1, chips=0.4, rust=0.35, dirt=0.5, stains=0.8, stain_color='#5c2f16', scale=1.0, dust=0.0, edge=0.02, cavity=0.2,
                 decals=[decal(title, (0.0, 2.05, 2.46), (0, 1, 0), 0.4, '#1f2a33', depth=0.06, strength=1.0), decal(title, (0.0, -2.05, 2.46), (0, -1, 0), 0.4, '#1f2a33', depth=0.06, strength=1.0)])
    hazard = worn('hazard', '#b8982c', 0.55, 0.0, chips=0.6, rust=0.25, dirt=0.6, stripes=('#1c1c1a', 0.24, (1, 0, 1), 0.5), scale=1.0, dust=0.6, dust_height=0.5, edge=0.02, cavity=0.15)
    sack = worn('sandbag', '#9a8d6c', 0.95, 0.0, chips=0.0, rust=0.0, dirt=0.9, fade=0.6, scale=1.6, dust=0.5, dust_height=0.4, cavity=0.12, bump=2.0,
                boards=(0.012, 0.012, 'front', 0.25))
    white = worn('unit_white', '#b9bab3', 0.5, 0.2, chips=0.4, rust=0.4, dirt=0.7, stains=0.8, stain_color='#5c2f16', scale=1.0, dust=0.3, cavity=0.2, edge=0.02)
    steel = worn('galvanised', '#8b9094', 0.5, 0.85, chips=0.0, rust=0.35, dirt=0.5, scale=1.0, dust=0.3, cavity=0.15)
    red = sf.plain('lens_red', '#8a1612', 0.25)
    glass = sf.glass('glass', '#101c20', 0.7)
    lamp = sf.lamp('lamp_post', '#fff1d0', 5.0)

    house = [
        kit.block('plinth', (3.3, 4.3, 0.14), (0, 0, 0.07), concrete),
        kit.block('walls', (3.0, 4.0, 2.56), (0, 0, 1.42), wall),
        kit.block('roof', (4.36, 5.36, 0.18), (0, 0, 2.79), roof),
        kit.block('barrier_post', (0.42, 0.42, 1.2), (PIVOT[0], -0.02, 0.6), post),
    ]
    a.parts_of(house)
    a.density(house[1], 1.1)
    a.density(house[2], 0.7)
    block = jersey('block_1', (11.7, -1.5, 0), 90, concrete)
    a.part(block)
    a.repeat(block, [Matrix.Translation((0, 3.0, 0)), Matrix.Translation((-14.4, 2.7, 0))])
    far_bags = kit.block('sandbags_far', (3.0, 0.3, 0.98), (0, 2.36, 0.49), sack)
    a.part(far_bags, levels=(1, 2))
    a.density(far_bags, 0.5)

    fine = gp.Parts()
    fine += kit.window('win_road', (1.5, 0.2, 1.7), 2.4, 1.0, '+x', glass, dark)
    fine += kit.window('win_front', (0.0, 2.0, 1.7), 2.0, 1.0, '+y', glass, dark)
    fine += kit.window('win_back', (0.0, -2.0, 1.7), 2.0, 1.0, '-y', glass, dark)
    fine += kit.window('win_door', (-1.5, 0.9, 1.7), 0.9, 1.0, '-x', glass, dark)
    fine.append(B('sill_road', (0.16, 2.7, 0.07), (1.56, 0.2, 1.12), concrete))
    fine.append(B('hatch_shelf', (0.3, 0.8, 0.04), (1.66, 0.6, 1.16), steel))
    fine.append(B('sill_front', (2.3, 0.16, 0.07), (0, 2.06, 1.12), concrete))
    fine.append(B('sill_back', (2.3, 0.16, 0.07), (0, -2.06, 1.12), concrete))
    fine.append(B('door_frame', (0.1, 1.06, 2.2), (-1.5, -0.8, 1.24), dark))
    fine.append(B('door', (0.07, 0.9, 2.05), (-1.53, -0.8, 1.17), post), B('door_handle', (0.05, 0.04, 0.16), (-1.59, -0.45, 1.15), steel),
                B('door_kick', (0.02, 0.9, 0.25), (-1.575, -0.8, 0.3), steel))
    fine.append(B('door_step', (0.4, 1.2, 0.1), (-1.75, -0.8, 0.09), concrete))
    for name, size, location in (('lamp_road', (0.14, 0.6, 0.1), (2.0, 0.0, 2.65)), ('lamp_front', (0.6, 0.14, 0.1), (0.0, 2.5, 2.65))):
        fine.append(kit.block(name, size, location, lamp))
        fine.append(B(name + '_box', (size[0] + 0.06, size[1] + 0.06, 0.06), (location[0], location[1], 2.685), dark))
    fine.append(B('rest_post', (0.12, 0.12, 0.9), (10.45, 0.26, 0.45), post), B('rest_fork', (0.3, 0.3, 0.08), (10.45, 0.26, 0.9), post),
                B('rest_foot', (0.34, 0.34, 0.04), (10.45, 0.26, 0.02), post))
    for y in (0.13, 0.39):
        fine.append(B('rest_prong', (0.3, 0.03, 0.2), (10.45, y, 1.02), post))
    fine.append(gp.ac_unit('roof_unit', (0.9, 0.7, 0.445), (-0.4, -0.9, 2.88), white, dark, 180))
    fine.append(B('post_guard', (0.46, 0.46, 0.3), (PIVOT[0], -0.02, 0.15), hazard), B('post_cap', (0.5, 0.5, 0.05), (PIVOT[0], -0.02, 1.22), dark))
    fine.append(C('post_light', 0.06, 0.1, (PIVOT[0], -0.1, 1.3), 'Z', red, 6))
    fine.append(B('fascia', (4.4, 5.4, 0.07), (0, 0, 2.845), dark))
    fine.append(R('down_pipe', [(-1.56, 1.9, 2.7), (-1.56, 1.9, 0.14)], 0.045, steel, 5))
    fine.append(B('camera_arm', (0.04, 0.3, 0.04), (1.3, 2.15, 2.62), dark), B('camera', (0.1, 0.24, 0.1), (1.3, 2.36, 2.56), white, (-20, 0, 0)))
    fine.append(B('wall_box', (0.4, 0.14, 0.5), (-0.95, -2.07, 1.5), steel, bevel=0.01), R('wall_conduit', [(-0.95, -2.05, 1.75), (-0.95, -2.05, 2.7)], 0.02, steel, 4))
    a.parts_of(fine, levels=(0, 1))

    for sign_y in (1, -1):
        plate = B('sign', (2.9, 0.05, 0.44), (0.0, sign_y * 2.03, 2.46), board, bevel=0.008)
        a.part(plate, levels=(0, 1))
        a.density(plate, 2.4)

    # the sandbag wall under the front window: three bags baked, the rest repeat them
    bags = [gp.sandbag('bag_%d' % i, (0.6, 0.3, 0.17), sack, i) for i in range(3)]
    low = 0.085
    for index, bag in enumerate(bags):
        mk.transform(bag, (-1.2 + 0.6 * index, 2.36, low))
        a.part(bag, levels=(0,))
        a.density(bag, 1.2)
    spots = {0: [], 1: [], 2: []}
    count = 0
    for layer in range(6):
        offset = 0.3 if layer % 2 else 0.0
        for column in range(5 if layer % 2 == 0 else 4):
            x = -1.2 + offset + 0.6 * column
            y = 2.36 + (0.025 if (layer + column) % 3 == 0 else -0.02)
            z = low + 0.163 * layer
            which = (layer * 2 + column) % 3
            if layer == 0 and column < 3:
                continue
            source_x = -1.2 + 0.6 * which
            spots[which].append(Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(((count * 37) % 9) - 4), 4, 'Z') @ Matrix.Translation((-source_x, -2.36, -low)))
            count += 1
    # two bags thrown on the ground by the corner
    spots[1].append(Matrix.Translation((-1.9, 2.3, low)) @ Matrix.Rotation(math.radians(70), 4, 'Z') @ Matrix.Translation((0.6, -2.36, -low)))
    spots[2].append(Matrix.Translation((-1.86, 2.3, low + 0.165)) @ Matrix.Rotation(math.radians(50), 4, 'Z') @ Matrix.Translation((0.0, -2.36, -low)))
    for index, bag in enumerate(bags):
        a.repeat(bag, spots[index])

    arm_parts = [
        kit.block('arm', (8.8, 0.09, 0.14), (PIVOT[0] + 3.6, 0.26, PIVOT[2]), stripes),
        kit.block('counterweight', (0.55, 0.3, 0.42), (PIVOT[0] - 0.62, 0.26, PIVOT[2]), post),
        kit.block('hub', (0.3, 0.16, 0.3), (PIVOT[0], 0.26, PIVOT[2]), post),
        C('hub_pin', 0.06, 0.2, (PIVOT[0], 0.26, PIVOT[2]), 'Y', steel, 8),
        C('stop_sign', 0.37, 0.025, (6.1, 0.26, 1.0), 'Y', disc, 16),
        B('arm_tip', (0.12, 0.1, 0.16), (10.53, 0.26, 1.0), dark),
    ]
    for x in (4.0, 8.2):
        arm_parts.append(B('reflector', (0.3, 0.1, 0.06), (x, 0.26, 0.92), red))
    arm = mk.join('barrier_arm', arm_parts)
    a.moving(arm, PIVOT)
    a.density(arm, 1.5)

    a.lod_distances = (60.0, 200.0)
    a.extra('barrier_open', {'axis': 'y', 'degrees': -85})
    a.extra('barrier_pivot', [PIVOT[0], PIVOT[2], -PIVOT[1]])
    a.collider_box('house', (3.0, 4.0, 2.8), (0, 0, 1.4))
    a.collider_box('barrier', (8.0, 0.2, 1.2), (PIVOT[0] + 4.0, 0.26, 0.6))
    a.collider_box('block_1', (0.62, 5.3, 0.82), (11.7, 0, 0.41))
    a.collider_box('block_2', (0.62, 2.2, 0.82), (-2.7, 1.2, 0.41))
    a.anchor('guard', (2.1, 1.2, 0.0))
