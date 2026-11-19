"""Hardened aircraft shelter: a thick concrete arch 58 m wide, 40 m deep and 15 m high (16.2 m with
the roof vents) in disruptive sand / olive / dark green paint. The whole front (+Y in Blender, the
game's -Z) is open: the clear opening is 50.4 m wide at 9 m height and 52.8 m at the floor, 10.2 m
high under the sectional blast door that is stowed in its gantry above the opening. Inside: seven
ribs, eight lamps (lamp_interior), a floor that runs 6 m out as an apron lip, exhaust louvres on the
back wall and a personnel porch on the +X side.
"""
import _base_kit as kit
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'base_hardened_shelter', 'atlas': 1024, 'kind': 'building', 'views': ((18, 7, 1.25), (150, 42, 1.05))}

N = 28
OUTER = kit.arch_profile(29.0, 15.0, 3.4, N)
INNER = kit.arch_profile(27.5, 13.2, 4.0, N)
RIB = kit.arch_profile(27.05, 12.75, 4.0, N)
FRAME = kit.arch_profile(28.9, 14.5, 3.8, N)
FRONT, BACK = 20.0, -20.0
INSIDE = (0.0, 0.0, 5.0)


def row(profile, y):
    return [(x, y, z) for x, z in profile]


def make(a):
    camo_roof = kit.camouflage('camo_roof', seams=(14.5, 5.0), projection='top')
    camo_wall = kit.camouflage('camo_wall', seams=(4.0, 2.0), projection='front')
    inside = kit.concrete('inside_concrete', '#9b978c', seams=(5.0, 5.0), projection='top', wear=0.45)
    rib = kit.concrete('rib_concrete', '#868278', seams=None, wear=0.6)
    frame = kit.concrete('frame_concrete', '#7f7b72', seams=(3.0, 1.5), projection='front', wear=0.65)
    floor = kit.weathered('floor', '#6f6c65', 0.8, 0.0, 0.6, seams=(6.0, 6.0), seam_width=0.06, projection='top')
    steel = kit.weathered('door_steel', '#465044', 0.6, 0.3, 0.6, seams=(6.25, 0.6), seam_width=0.05, projection='front')
    dark = kit.weathered('louvre', '#2c302c', 0.6, 0.4, 0.5, seams=(6.0, 0.35), seam_width=0.1, projection='front')
    hazard = kit.striped('hazard', '#b8982c', '#1c1c1a', 1.25, 'X', 0.55, 0.5)
    line = sf.coated('line', '#b39a36', 0.6, 0.0, 0.6)
    lamp = sf.lamp('lamp_interior', '#ffe8c2', 5.0)

    shell = [
        kit.strip('skin', row(OUTER, BACK), row(OUTER, FRONT), camo_roof, INSIDE, True, True),
        kit.strip('lining', row(INNER, BACK + 1.6), row(INNER, FRONT), inside, INSIDE, False, True),
        kit.strip('face', row(OUTER, FRONT), row(INNER, FRONT), camo_wall, (0, -200, 5), True),
        kit.polygon('back', row(OUTER, BACK), camo_wall, INSIDE, True),
        kit.polygon('back_lining', row(INNER, BACK + 1.6), inside, INSIDE, False),
        kit.block('slab', (55.0, 46.0, 0.1), (0, 3.0, 0.05), floor),
        mk.shade(kit.arch_solid('door_frame', FRAME, INNER, FRONT, FRONT + 1.2, frame), 40),
        # the door gantry: two guide towers, a header and the stowed sectional door with its warning edge
        kit.block('guide_r', (1.6, 1.4, 13.4), (27.2, FRONT + 1.9, 6.7), frame),
        kit.block('guide_l', (1.6, 1.4, 13.4), (-27.2, FRONT + 1.9, 6.7), frame),
        kit.block('header', (56.0, 1.5, 0.9), (0, FRONT + 1.9, 13.4), frame),
        kit.block('door', (52.8, 1.0, 2.5), (0, FRONT + 1.9, 11.7), steel),
        kit.block('door_edge', (52.8, 1.04, 0.32), (0, FRONT + 1.9, 10.36), hazard),
    ]
    a.parts_of(shell)

    detail = []
    for index in range(7):
        y = -15.0 + 5.0 * index
        detail.append(mk.shade(kit.arch_solid('rib', INNER, RIB, y - 0.35, y + 0.35, rib), 40))
    for x in (-12.0, 12.0):
        for y in (-15.0, -5.0, 5.0, 15.0):
            detail.append(kit.block('lamp', (1.8, 0.5, 0.14), (x, y, 12.52), lamp))
    detail.append(kit.block('centre_line', (0.3, 44.0, 0.02), (0, 3.5, 0.105), line))
    detail.append(kit.block('porch', (2.0, 3.0, 2.8), (29.6, -12.0, 1.4), frame))
    detail.append(kit.block('porch_door', (0.06, 1.0, 2.1), (30.62, -12.0, 1.05), steel))
    a.parts_of(detail, levels=(0,))

    mid = []
    for y in (-12.0, 0.0, 12.0):
        mid.append(kit.drum('vent_stem', 0.9, 14.8, 15.9, steel, (0, y), 10))
        mid.append(kit.drum('vent_cap', 1.35, 15.9, 16.2, steel, (0, y), 10))
    for x in (-12.0, 12.0):
        mid.append(kit.block('exhaust', (6.0, 1.2, 3.6), (x, BACK - 0.5, 4.2), dark))
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
