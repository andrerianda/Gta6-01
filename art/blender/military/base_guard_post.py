"""Guard post of the air base gate: a 3 x 4 m gatehouse (windows on three sides, a door on the -X
side, a flat roof with a 0.7 m overhang) centred on the origin, and a boom barrier beside it. The
node barrier_arm has its origin on the pivot at (2.6, 0, 1.0) in Blender (game: x 2.6, y 1.0, z 0);
the red and white arm reaches 8 m towards +X (to x = 10.6) with a counterweight behind the pivot and
rests on a fork post. Scene extra barrier_open = {axis 'y', degrees -85} in the hinge style of the
aircraft (Blender axes): that is +85 degrees about the game's +Z. Three concrete blocks keep cars on
the lane; lamp group lamp_post under the eaves.
"""
import _base_kit as kit
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'base_guard_post', 'atlas': 512, 'kind': 'building', 'views': ((30, 14, 1.15, (4.5, 0, 1.2)), (200, 28, 1.15, (4.5, 0, 1.2)))}

PIVOT = (2.6, 0.0, 1.0)


def jersey(name, location, turn, material):
    obj = mk.box(name, (2.2, 0.62, 0.82), (0, 0, 0.41))
    mk.map_points(obj, lambda v: (v.x * (0.97 if v.z > 0.4 else 1.0), v.y * (0.36 if v.z > 0.4 else 1.0), v.z))
    mk.transform(obj, location, (0, 0, turn))
    return mk.assign(obj, material)


def make(a):
    wall = kit.weathered('wall', '#a59c84', 0.85, 0.0, 0.5, blotches=('#666946',), blotch_scale=0.35)
    roof = kit.weathered('roof', '#5d5f5b', 0.75, 0.0, 0.6)
    dark = kit.painted_steel('frame', '#2a2d2b', 0.5, 0.4)
    post = kit.painted_steel('post_steel', '#53584f', 0.55, 0.6)
    concrete = kit.concrete('concrete', '#8f8a7f', seams=None, wear=0.7)
    stripes = kit.striped('arm_stripes', '#a92f27', '#d5d1c6', 1.0, 'X', 0.5, 0.35)
    glass = sf.glass('glass', '#101c20', 0.7)
    lamp = sf.lamp('lamp_post', '#fff1d0', 5.0)

    house = [
        kit.block('plinth', (3.3, 4.3, 0.14), (0, 0, 0.07), concrete),
        kit.block('walls', (3.0, 4.0, 2.56), (0, 0, 1.42), wall),
        kit.block('roof', (4.4, 5.4, 0.18), (0, 0, 2.79), roof),
        kit.block('barrier_post', (0.42, 0.42, 1.2), (PIVOT[0], -0.02, 0.6), post),
        jersey('block_1', (11.7, -1.5, 0), 90, concrete),
        jersey('block_2', (11.7, 1.5, 0), 90, concrete),
        jersey('block_3', (-2.7, 1.2, 0), 90, concrete),
    ]
    a.parts_of(house)

    fine = []
    fine += kit.window('win_road', (1.5, 0.2, 1.7), 2.4, 1.0, '+x', glass, dark)
    fine += kit.window('win_front', (0.0, 2.0, 1.7), 2.0, 1.0, '+y', glass, dark)
    fine += kit.window('win_back', (0.0, -2.0, 1.7), 2.0, 1.0, '-y', glass, dark)
    fine += kit.window('win_door', (-1.5, 0.9, 1.7), 0.9, 1.0, '-x', glass, dark)
    fine.append(kit.block('door', (0.07, 0.9, 2.05), (-1.53, -0.8, 1.17), dark))
    fine.append(kit.block('lamp_road', (0.14, 0.6, 0.1), (2.0, 0.0, 2.65), lamp))
    fine.append(kit.block('lamp_front', (0.6, 0.14, 0.1), (0.0, 2.5, 2.65), lamp))
    fine.append(kit.block('rest_post', (0.12, 0.12, 0.9), (10.45, 0.26, 0.45), post))
    fine.append(kit.block('rest_fork', (0.3, 0.3, 0.08), (10.45, 0.26, 0.9), post))
    fine.append(kit.block('roof_unit', (0.9, 0.7, 0.45), (-0.4, -0.9, 3.1), post))
    a.parts_of(fine, levels=(0, 1))

    arm = mk.join('barrier_arm', [
        kit.block('arm', (8.8, 0.09, 0.14), (PIVOT[0] + 3.6, 0.26, PIVOT[2]), stripes),
        kit.block('counterweight', (0.55, 0.3, 0.42), (PIVOT[0] - 0.62, 0.26, PIVOT[2]), post),
        kit.block('hub', (0.3, 0.16, 0.3), (PIVOT[0], 0.26, PIVOT[2]), post),
    ])
    a.moving(arm, PIVOT)

    a.lod_distances = (60.0, 200.0)
    a.extra('barrier_open', {'axis': 'y', 'degrees': -85})
    a.extra('barrier_pivot', [PIVOT[0], PIVOT[2], -PIVOT[1]])
    a.collider_box('house', (3.0, 4.0, 2.8), (0, 0, 1.4))
    a.collider_box('barrier', (8.0, 0.2, 1.2), (PIVOT[0] + 4.0, 0.26, 0.6))
    a.collider_box('block_1', (0.62, 5.3, 0.82), (11.7, 0, 0.41))
    a.collider_box('block_2', (0.62, 2.2, 0.82), (-2.7, 1.2, 0.41))
    a.anchor('guard', (2.1, 1.2, 0.0))
