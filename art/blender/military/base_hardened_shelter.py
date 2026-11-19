"""Hardened aircraft shelter: a thick concrete arch 58 m wide, 40 m deep and 15 m high (16.2 m with
the roof vents) in weathered disruptive sand / olive / dark green paint. The whole front (+Y in
Blender, the game's -Z) is open: the clear opening is 50.4 m wide at 9 m height and 52.8 m at the
floor between the two piers, 10.2 m high under the door track. The doors are sliding-folding steel
leaves (3.2 x 10.15 m each, eight a side) that hang from the track girder and run on a floor rail:
they stand folded in two stacks in front of the piers, so the opening is clear. Above the track a
fixed ribbed steel transom carries the shelter number and the clearance stripe; three floodlights
on the lintel (lamp_door) light the threshold. Inside: seven ribs, eight lamps (lamp_interior), an
air duct under the crown, cable trays, cabinets, a floor that runs 6 m out as an apron lip. Behind:
two exhaust louvres, a caged ladder; a personnel porch on the +X side.

Texels: the roof skin is baked whole at a low density, the lining, floor and ribs are baked as
halves and mirrored, the door leaves, ribs, lamps and vents are baked once and repeated.
"""
import math

import _base_kit as kit
import _gse_parts as gp
from _gse_parts import B, C, R, beam, decal, lathe, text_mask, worn
from lib import meshkit as mk
from lib import surfaces as sf
from mathutils import Matrix

ASSET = {'id': 'base_hardened_shelter', 'atlas': 2048, 'kind': 'building', 'builder': 'DetailKitAsset', 'cell': (640, 360), 'columns': 1,
         'views': ((16, 5, 1.35, (2, 20, 6.5)), (68, 7, 3.6, (25.0, 23.5, 5.4)), (150, 38, 1.05))}

N = 28
HALF = N // 2 + 1
OUTER = kit.arch_profile(29.0, 15.0, 3.4, N)
INNER = kit.arch_profile(27.5, 13.2, 4.0, N)
RIB = kit.arch_profile(27.05, 12.75, 4.0, N)
FRAME = kit.arch_profile(28.9, 14.5, 3.8, N)
FRONT, BACK = 20.0, -20.0
INSIDE = (0.0, 0.0, 5.0)
LEAVES, LEAF_W, LEAF_H, PITCH = 8, 3.2, 10.15, 0.3
TRACK_Y = 22.9
CAMO = ('#5d6238', '#2f3a26')
BARE = ('#7d796f', '#8c887d')


def row(profile, y):
    return [(x, y, z) for x, z in profile]


def mirror():
    return Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0))


def about(x, y, degrees):
    """A turn about the vertical axis through (x, y)."""
    return Matrix.Translation((x, y, 0)) @ Matrix.Rotation(math.radians(degrees), 4, 'Z') @ Matrix.Translation((-x, -y, 0))


def make(a):
    a.image_quality = 72
    a.occlusion = (32, 0.4, 4.0)
    gp.RELIEF = 0.03
    number = text_mask('3', 160, stencil=False, frame=10, weight=5)
    clear = text_mask('ALTURA LIBRE 10,2 M', 64)
    keep = text_mask(['MANTENER', 'DESPEJADO'], 64)
    smoke = text_mask(['PROHIBIDO FUMAR', 'APAGUE MOTORES ANTES DE ENTRAR'], 72)
    staff = text_mask(['ACCESO', 'PERSONAL'], 56, frame=5)
    camo_roof = worn('camo_roof', '#a59873', 0.86, 0.0, chips=0.25, under=BARE, rust=0.0, dirt=0.7, fade=0.5, blotches=CAMO, blotch_scale=0.09,
                     boards=(14.5, 5.0, 'top', 0.05), stains=0.9, scale=0.22, dust=0.4, dust_height=2.5, edge=0.2, cavity=0.7, bump=1.3)
    camo_wall = worn('camo_wall', '#a59873', 0.86, 0.0, chips=0.3, under=BARE, rust=0.0, dirt=0.7, fade=0.5, blotches=CAMO, blotch_scale=0.09,
                     boards=(4.0, 2.0, 'front', 0.04), stains=1.0, scale=0.3, dust=0.6, dust_height=3.0, edge=0.2, cavity=0.7, bump=1.3)
    inside = worn('inside_concrete', '#9b978c', 0.88, 0.0, chips=0.0, rust=0.0, dirt=0.5, fade=0.3, boards=(5.0, 1.25, 'side', 0.03), stains=0.8,
                  scale=0.3, dust=0.3, dust_height=1.5, cavity=0.8, bump=1.2,
                  decals=[decal(smoke, (0, BACK + 1.6, 8.6), (0, 1, 0), 2.6, '#b4a23a', depth=0.3, strength=0.75)])
    rib = worn('rib_concrete', '#868278', 0.88, 0.0, chips=0.0, rust=0.0, dirt=0.6, stains=0.6, scale=0.3, dust=0.2, cavity=0.6, bump=1.2)
    frame = worn('frame_concrete', '#827e74', 0.88, 0.0, chips=0.15, under=BARE, rust=0.12, dirt=0.7, boards=(3.0, 1.5, 'front', 0.04), stains=1.0,
                 stain_color='#2a221a', scale=0.3, dust=0.6, dust_height=3.0, edge=0.15, cavity=0.7, bump=1.3)
    floor = worn('floor', '#74716a', 0.78, 0.0, chips=0.0, rust=0.0, dirt=0.9, fade=0.4, boards=(6.0, 6.0, 'top', 0.012), scale=0.25, dust=0.5,
                 dust_height=0.3, cavity=0.9, bump=1.0)
    steel = worn('door_steel', '#4a5546', 0.58, 0.3, chips=0.55, rust=0.5, dirt=0.6, boards=(2.55, 1.6, 'side', 0.02), stains=1.0, stain_color='#5c2f16',
                 scale=0.45, dust=0.6, dust_height=1.6, edge=0.08, cavity=0.5)
    transom = worn('transom_steel', '#4a5546', 0.58, 0.3, chips=0.5, rust=0.45, dirt=0.6, boards=(2.2, 1.375, 'front', 0.012), stains=1.0,
                   stain_color='#5c2f16', scale=0.4, dust=0.0, edge=0.08, cavity=0.6,
                   decals=[decal(number, (0, 22.1, 11.75), (0, 1, 0), 2.1, '#cfc23e', depth=0.2),
                           decal(clear, (-17.0, 22.1, 11.6), (0, 1, 0), 1.0, '#c9c5b2', depth=0.2),
                           decal(keep, (17.0, 22.1, 11.6), (0, 1, 0), 1.9, '#c9c5b2', depth=0.2)])
    dark = worn('louvre', '#2c302c', 0.6, 0.4, chips=0.4, rust=0.5, dirt=0.6, stains=0.6, stain_color='#5c2f16', scale=0.5, dust=0.3, cavity=0.3)
    galv = worn('galvanised', '#8b9094', 0.5, 0.8, chips=0.0, rust=0.35, dirt=0.5, scale=0.5, dust=0.3, cavity=0.3)
    hazard = worn('hazard', '#b8982c', 0.55, 0.0, chips=0.6, under=BARE, rust=0.2, dirt=0.6, stripes=('#1c1c1a', 1.0, (1, 0, 1), 0.5), scale=0.5,
                  dust=0.5, dust_height=1.0, edge=0.08, cavity=0.4)
    line = worn('line', '#b39a36', 0.6, 0.0, chips=0.9, under=('#74716a', '#6a6761'), rust=0.0, dirt=0.8, scale=0.6, dust=0.3, edge=0.05)
    porch_wall = worn('porch_concrete', '#8a867b', 0.88, 0.0, chips=0.0, rust=0.0, dirt=0.7, stains=0.9, scale=0.4, dust=0.6, dust_height=1.2, cavity=0.5,
                      decals=[decal(staff, (30.6, -12.0, 2.45), (1, 0, 0), 0.5, '#c9c5b2', depth=0.1)])
    lamp = sf.lamp('lamp_interior', '#ffe8c2', 5.0)
    lamp_door = sf.lamp('lamp_door', '#fff0d2', 6.0)

    # --- the shell (all levels) ------------------------------------------------------------------------
    skin = kit.strip('skin', row(OUTER, BACK), row(OUTER, FRONT), camo_roof, INSIDE, True, True)
    lining = kit.strip('lining', row(INNER[:HALF], BACK + 1.6), row(INNER[:HALF], FRONT), inside, INSIDE, False, True)
    face = kit.strip('face', row(OUTER, FRONT), row(INNER, FRONT), camo_wall, (0, -200, 5), True)
    back = kit.polygon('back', row(OUTER, BACK), camo_wall, INSIDE, True)
    back_lining = kit.polygon('back_lining', row(INNER, BACK + 1.6), inside, INSIDE, False)
    slab = kit.block('slab', (27.5, 46.0, 0.1), (13.75, 3.0, 0.05), floor)
    door_frame = mk.shade(kit.arch_solid('door_frame', FRAME, INNER, FRONT, FRONT + 1.2, frame), 40)
    pier = kit.block('pier', (1.6, 1.4, 13.4), (27.2, FRONT + 1.9, 6.7), frame)
    header = kit.block('header', (56.0, 1.5, 0.9), (0, FRONT + 1.9, 13.4), frame)
    panel = kit.block('transom', (52.8, 0.4, 2.6), (0, FRONT + 1.9, 11.65), transom)
    edge = kit.block('door_edge', (52.8, 0.5, 0.3), (0, FRONT + 1.95, 10.35), hazard)
    track = kit.block('track', (57.8, 0.6, 0.5), (0, TRACK_Y, 10.45), steel)
    a.parts_of([skin, lining, face, back, back_lining, slab, door_frame, pier, header, panel, edge, track])
    for obj, weight in ((skin, 0.62), (lining, 0.55), (face, 1.25), (back, 0.8), (back_lining, 0.7), (slab, 0.85), (door_frame, 1.2), (pier, 1.3),
                        (header, 1.0), (panel, 1.5), (edge, 1.2), (track, 1.0)):
        a.density(obj, weight)
    for obj in (lining, slab, pier):
        a.repeat(obj, [mirror()])

    # --- the folded door leaves --------------------------------------------------------------------------
    x0, yc = 26.56, TRACK_Y - 0.18 + LEAF_W * 0.5
    leaf = [B('leaf_plate', (0.14, LEAF_W, LEAF_H - 0.5), (x0, yc, 0.55 + (LEAF_H - 0.5) * 0.5), steel),
            B('leaf_kick', (0.17, LEAF_W, 0.5), (x0, yc, 0.3), hazard)]
    for z in (1.6, 4.3, 7.0, 9.9):
        leaf.append(B('leaf_rib', (0.26, LEAF_W - 0.1, 0.16), (x0, yc, z), steel))
    for end in (-1, 1):
        y = yc + end * (LEAF_W * 0.5 - 0.07)
        leaf.append(B('leaf_stile', (0.24, 0.14, LEAF_H), (x0, y, 0.05 + LEAF_H * 0.5), steel))
        for z in (2.6, 8.2):
            leaf.append(C('leaf_hinge', 0.075, 0.6, (x0 + end * 0.12, yc + end * LEAF_W * 0.5, z), 'Z', galv, 6))
        leaf.append(B('leaf_fork', (0.1, 0.3, 0.22), (x0, y - end * 0.3, 0.2), dark))
        leaf.append(C('leaf_roller', 0.13, 0.08, (x0, y - end * 0.3, 0.14), 'X', galv, 8))
    leaf.append(B('leaf_trolley', (0.2, 0.44, 0.34), (x0, TRACK_Y, 10.3), dark))
    for side in (1, -1):
        leaf.append(R('leaf_handle', [(x0 + side * 0.08, yc + 0.9, 1.0), (x0 + side * 0.17, yc + 0.9, 1.08), (x0 + side * 0.17, yc + 0.9, 1.5),
                                      (x0 + side * 0.08, yc + 0.9, 1.58)], 0.025, galv, 4))
    leaf.append(R('leaf_bolt', [(x0 + 0.1, yc - 1.2, 0.08), (x0 + 0.1, yc - 1.2, 1.5), (x0 + 0.2, yc - 1.2, 1.5)], 0.022, galv, 4))
    leaf = mk.join('leaf', leaf)
    a.part(leaf, levels=(0,))
    a.density(leaf, 1.7)
    plain_leaf = B('leaf_far', (0.2, LEAF_W, LEAF_H), (x0, yc, 0.05 + LEAF_H * 0.5), steel)
    a.part(plain_leaf, levels=(1, 2))
    a.density(plain_leaf, 0.6)
    stack = []
    for side in (1, -1):
        for index in range(LEAVES):
            if side == 1 and index == 0:
                continue
            fan = 2.6 if index % 2 == 0 else -2.6
            placed = Matrix.Translation((PITCH * index, 0, 0)) @ about(x0, yc, fan - 2.6)
            stack.append(placed if side == 1 else mirror() @ placed)
    # the first leaf is the baked one: give it its fan angle too
    for obj in (leaf, plain_leaf):
        a.repeat(obj, stack)
        obj.data.transform(about(x0, yc, 2.6))

    # --- fine detail (level 0) ------------------------------------------------------------------------------
    fine = []
    half_rib = mk.shade(kit.arch_solid('rib', INNER[:HALF], RIB[:HALF], -15.35, -14.65, rib), 40)
    a.part(half_rib, levels=(0,))
    a.density(half_rib, 0.6)
    a.repeat(half_rib, [Matrix.Translation((0, 5.0 * i, 0)) for i in range(1, 7)] + [Matrix.Translation((0, 5.0 * i, 0)) @ mirror() for i in range(7)])
    housing = mk.join('lamp_housing', [B('lamp_box', (2.0, 0.6, 0.2), (12.0, -15.0, 12.52), dark), B('lamp_hanger', (0.08, 0.08, 0.5), (11.3, -15.0, 12.8), dark),
                                       B('lamp_hanger', (0.08, 0.08, 0.5), (12.7, -15.0, 12.8), dark)])
    a.part(housing, levels=(0,))
    spots = [Matrix.Translation((x - 12.0, y + 15.0, 0)) for x in (-12.0, 12.0) for y in (-15.0, -5.0, 5.0, 15.0)]
    a.repeat(housing, spots[4 + 1:] + spots[:4])
    for x in (-12.0, 12.0):
        for y in (-15.0, -5.0, 5.0, 15.0):
            fine.append(kit.block('lamp', (1.8, 0.46, 0.03), (x, y, 12.41), lamp))
    fine.append(kit.block('centre_line', (0.3, 44.0, 0.02), (0, 3.5, 0.105), line))
    fine.append(kit.block('stop_bar', (9.0, 0.3, 0.02), (0, -15.0, 0.105), line))
    fine.append(kit.block('threshold', (52.6, 0.7, 0.02), (0, 20.6, 0.105), hazard))
    fine.append(kit.block('drain_grate', (52.6, 0.4, 0.025), (0, 21.6, 0.1), galv))
    fine.append(kit.block('floor_rail', (57.6, 0.16, 0.05), (0, TRACK_Y, 0.095), galv))
    # air duct under the crown with its hangers, cable trays, cabinets
    fine.append(C('duct', 0.5, 33.0, (0, -1.5, 11.9), 'Y', galv, 10))
    for y in (-15.0, -5.0, 5.0, 12.0):
        fine.append(B('duct_band', (1.1, 0.12, 1.1), (0, y, 11.9), dark))
    tray = B('cable_tray', (0.5, 35.0, 0.12), (26.35, 0.5, 6.4), galv)
    cabinet = mk.join('cabinet', [B('cabinet_box', (0.5, 1.4, 2.0), (27.2, -8.0, 1.1), dark, bevel=0.02), B('cabinet_box', (0.45, 0.9, 1.3), (27.22, -6.25, 1.25), galv, bevel=0.02),
                                  R('conduit', [(27.35, -8.0, 2.1), (26.6, -8.0, 6.4)], 0.05, galv, 5), B('ext_board', (0.08, 0.8, 1.0), (27.42, 6.0, 1.4), hazard),
                                  lathe('extinguisher', [(0.1, 0.0), (0.13, 0.03), (0.13, 0.6), (0.05, 0.7), (0.05, 0.78)], 'Z', (27.24, 6.0, 0.95), sf.plain('ext_red', '#8f1a14', 0.4), 8)])
    arm = B('track_arm', (0.16, 0.9, 0.16), (-22.0, FRONT + 2.5, 10.62), steel)
    a.part(arm, levels=(0,))
    a.repeat(arm, [Matrix.Translation((4.4 * i, 0, 0)) for i in range(1, 11)])
    a.parts_of([tray, cabinet], levels=(0,))
    a.repeat(tray, [mirror()])
    a.repeat(cabinet, [mirror()])
    # work benches and lockers along the back wall
    fine.append(B('bench', (5.0, 0.9, 0.9), (-18.0, BACK + 2.2, 0.55), dark, bevel=0.02))
    fine.append(B('bench_top', (5.2, 1.0, 0.06), (-18.0, BACK + 2.2, 1.03), galv))
    fine.append(B('lockers', (4.0, 0.6, 2.0), (18.5, BACK + 2.0, 1.1), dark, bevel=0.02))
    for x in (17.5, 18.5, 19.5):
        fine.append(B('locker_gap', (0.03, 0.02, 1.9), (x, BACK + 2.31, 1.1), galv))
    # the front: transom ribs, floodlights, door gear, pier guards
    trib = B('transom_rib', (0.14, 0.12, 2.6), (-25.3, FRONT + 2.14, 11.65), transom)
    a.part(trib, levels=(0,))
    a.repeat(trib, [Matrix.Translation((2.2 * i, 0, 0)) for i in range(1, 24)])
    flood = mk.join('flood', [B('flood_box', (1.0, 0.4, 0.45), (-16.0, FRONT + 3.0, 13.5), dark, (-35, 0, 0), 0.03), B('flood_arm', (0.1, 0.5, 0.1), (-16.0, FRONT + 2.8, 13.7), galv),
                              B('flood_visor', (1.1, 0.34, 0.04), (-16.0, FRONT + 3.2, 13.74), dark, (-12, 0, 0))])
    a.part(flood, levels=(0, 1))
    a.repeat(flood, [Matrix.Translation((16.0, 0, 0)), Matrix.Translation((32.0, 0, 0))])
    for x in (-16.0, 0.0, 16.0):
        fine.append(kit.block('flood_lens', (0.88, 0.03, 0.36), (x, FRONT + 3.185, 13.372), lamp_door, (-35, 0, 0)))
    guard = B('pier_guard', (1.66, 1.46, 1.6), (27.2, FRONT + 1.9, 0.8), hazard)
    control = mk.join('door_control', [C('beacon', 0.12, 0.2, (27.2, FRONT + 2.4, 13.5), 'Z', sf.plain('lens_amber', '#c9741a', 0.25), 8),
                                       C('beacon_base', 0.16, 0.06, (27.2, FRONT + 2.4, 13.42), 'Z', dark, 8)])
    a.parts_of([guard, control], levels=(0, 1))
    a.repeat(guard, [mirror()])
    a.repeat(control, [mirror()])
    # porch on the +X side, its door and lamp
    fine.append(kit.block('porch', (2.0, 3.0, 2.8), (29.6, -12.0, 1.4), porch_wall))
    fine.append(kit.block('porch_door', (0.06, 1.0, 2.1), (30.62, -12.0, 1.05), steel))
    fine.append(B('porch_handle', (0.02, 0.05, 0.16), (30.64, -11.62, 1.05), galv))
    fine.append(B('porch_lamp_box', (0.5, 0.1, 0.22), (29.9, -10.45, 2.45), dark))
    fine.append(kit.block('porch_lamp', (0.4, 0.03, 0.14), (29.9, -10.39, 2.45), lamp_door))
    a.parts_of(fine, levels=(0,))

    # --- middle distance (levels 0 and 1) ---------------------------------------------------------------------
    mid = []
    vent = lathe('vent', [(0.9, 14.6), (0.9, 15.55), (1.0, 15.55), (1.0, 15.62), (0.75, 15.62), (0.75, 15.86), (1.35, 15.9), (1.3, 16.08), (0.3, 16.2)], 'Z',
                 (0, -12.0, 0), dark, 12)
    a.part(vent, levels=(0, 1))
    a.repeat(vent, [Matrix.Translation((0, 12.0, 0)), Matrix.Translation((0, 24.0, 0))])
    exhaust = [B('exhaust', (6.0, 0.86, 3.6), (12.0, BACK - 0.43, 4.2), dark, bevel=0.04)]
    for i in range(8):
        exhaust.append(B('exhaust_slat', (5.6, 0.3, 0.06), (12.0, BACK - 0.96, 2.75 + 0.42 * i), galv, (38, 0, 0)))
    for x in (9.1, 14.9):
        exhaust.append(B('exhaust_cheek', (0.2, 0.24, 3.6), (x, BACK - 0.98, 4.2), dark))
    exhaust = mk.join('exhaust', exhaust)
    a.part(exhaust, levels=(0, 1))
    a.repeat(exhaust, [mirror()])
    for x in (-20.4, -19.6):
        mid.append(R('ladder_rail', [(x, BACK - 0.22, 0.0), (x, BACK - 0.22, 13.9), (x, BACK + 0.3, 14.3)], 0.04, galv, 4))
    for i in range(27):
        mid.append(R('ladder_rung', [(-20.4, BACK - 0.22, 0.5 + 0.5 * i), (-19.6, BACK - 0.22, 0.5 + 0.5 * i)], 0.025, galv, 4))
    for i in range(5):
        z = 3.5 + 2.4 * i
        mid.append(R('ladder_hoop', [(-20.4, BACK - 0.22, z), (-20.5, BACK - 0.75, z), (-20.0, BACK - 1.02, z), (-19.5, BACK - 0.75, z), (-19.6, BACK - 0.22, z)], 0.025, galv, 4))
    for x in (-20.5, -20.0, -19.5):
        mid.append(R('ladder_strap', [(x, BACK - (1.02 if x == -20.0 else 0.75), 3.5), (x, BACK - (1.02 if x == -20.0 else 0.75), 13.1)], 0.02, galv, 4))
    for x in (-27.0, 27.0, -9.0, 9.0):
        z = 15.0 * (1.0 - (abs(x) / 29.0) ** 3.4) ** (1 / 3.4)
        mid.append(R('down_pipe', [(x, BACK - 0.12, 0.0), (x, BACK - 0.12, z - 0.4), (x, BACK + 0.1, z - 0.15)], 0.09, galv, 5))
    a.parts_of(mid, levels=(0, 1))

    a.lod_distances = (170.0, 520.0)
    a.collider_box('wall_l', (3.5, 43.0, 15.0), (-27.25, 1.5, 7.5))
    a.collider_box('wall_r', (3.5, 43.0, 15.0), (27.25, 1.5, 7.5))
    a.collider_box('back', (58.0, 1.8, 15.0), (0, -19.1, 7.5))
    a.collider_box('roof', (51.0, 40.0, 3.2), (0, 0, 13.4))
    a.anchor('park', (0, -1.0, 0.1))
    a.anchor('door', (0, FRONT, 0.1))
    a.extra('door_clear', {'width': 50.4, 'height': 10.2, 'width_at_floor': 52.8})
    a.extra('inside', {'width': 54.0, 'depth': 38.4, 'height': 12.7})
