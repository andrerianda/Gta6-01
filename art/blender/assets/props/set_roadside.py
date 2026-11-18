"""Roadside set: what stands along the kerb of a busy street, in one file. Original designs at
real size, sharing one atlas (see _setkit.py for how a set is laid out and named). Fronts look
towards +Y (the game's -Z). No lettering anywhere (ART-RULES rule 3): every place a name, a route
or a timetable belongs is a blank face with an anchor the game paints from game/src/catalog.

    bus_stop_pole       a bus-stop post: bolted flange, grey pole, a blank flag plate (both
                        faces anchor_sign_a / _b), a dark blue route strip (anchor_routes) and a
                        glazed timetable case (anchor_timetable)
    parking_meter_twin  a two-headed meter on one post, one head per parking space, domed
                        steel hoods with display windows, coin and card slots
    bollard_stainless   a brushed stainless bollard with a domed top and two reflective bands
    bollard_flex        a flexible plastic lane delineator with red reflective bands on a
                        bolted rubber base
    cone_tall           a 1 m roadworks cone with two reflective sleeves on a square base
    cone_stack          four cones nested on top of one another, as crews leave them
    roadworks_barrier   a 2 m interlocking pedestrian barrier: red-and-white boards, red mesh
                        infill, rubber feet, hooks and eyes at the ends
    newspaper_bank      three coin-operated newspaper boxes in three colours on one rail, each
                        with a glazed window over the papers and a blank header (anchor_sign_1..3)
    phone_booth         an enclosed glazed phone booth of our own design: aluminium frame, teal
                        kick panels and roof, a lit band under the roof (lamp_booth, anchor_sign),
                        a steel phone with handset and shelf inside
    billboard_monopole  a 12 x 4 m roadside billboard on a 9 m steel monopole: concrete footing,
                        flange, ladder, saddle, stringers, a framed blank face (anchor_sign), a
                        catwalk with a rail and four floodlights (lamp_flood, anchor_light_1..4)

The budget is raised because this is ten objects in one file.
"""
import math

from lib import materials as M

import _finishes as F
import _shapes as S
from _setkit import SetKit

ASSET = {
    'id': 'set_roadside',
    'kind': 'prop',
    'atlas': 1024,
    'budget': {'triangles': 8000, 'draws': 30, 'bytes': 480000},
}

FRONT = (0.0, 1.0, 0.0)
BACK = (0.0, -1.0, 0.0)
FLOOD = {'light': 'spot', 'color': [1.0, 0.92, 0.8]}


# -- materials ----------------------------------------------------------------------------------

def palette():
    return {
        'galv': M.galvanized(spangle=0.4, rust=0.3, seed=701, name='roadside_galv'),
        'post': F.enamel('post_grey', (0.17, 0.18, 0.18), seed=702, wear_amount=0.5),
        'sign': F.coated('sign_blank', (0.56, 0.55, 0.52), seed=703, roughness=0.4, chips=0.3,
                         rust=0.1, grime=0.4, dust=0.3, fade=0.4, scratches=0.3),
        'route': F.enamel('route_blue', (0.03, 0.08, 0.2), seed=704, wear_amount=0.4),
        'case': F.enamel('case_blue', (0.04, 0.06, 0.1), seed=705, wear_amount=0.35),
        'paper': F.coated('timetable_paper', F.striped((0.6, 0.59, 0.55), (0.42, 0.42, 0.4), 0.028,
                                                       axes='Z', share=0.7),
                          seed=706, roughness=0.8, chips=0.0, rust=0.0, grime=0.3, dust=0.2,
                          fade=0.5, scratches=0.0),
        'glass': M.glass(tint=(0.6, 0.66, 0.68), opacity=0.22, seed=707, name='glass'),
        'meter': F.enamel('meter_body', (0.1, 0.13, 0.12), seed=708, wear_amount=0.55),
        'chrome': M.brushed_metal(color=(0.6, 0.61, 0.62), direction='Z', grime=0.5, seed=709,
                                  name='meter_steel'),
        'lcd': F.coated('meter_display', (0.2, 0.24, 0.2), seed=710, roughness=0.15, chips=0.0,
                        rust=0.0, grime=0.3, dust=0.2, fade=0.1, scratches=0.4),
        'black': M.plastic(color=(0.025, 0.025, 0.027), roughness=0.5, scuffs=0.6, seed=711,
                           name='black_plastic'),
        'stripe': F.moulded('barrier_stripe', F.striped((0.5, 0.05, 0.03), (0.62, 0.6, 0.56), 0.3,
                                                        axes='XZ'), seed=712, wear_amount=0.55),
        'red': F.moulded('barrier_red', (0.48, 0.06, 0.035), seed=713, wear_amount=0.55),
        'mesh': F.wire_mesh(name='cutout_mesh', pitch=0.05, wire=0.007, axes=('X', 'Z'),
                            color=(0.48, 0.06, 0.035), seed=714, rust=0.0),
        'cone': F.moulded('cone_orange', (0.68, 0.17, 0.02), seed=715, wear_amount=0.5,
                          roughness=0.45),
        'reflect': F.coated('reflective_white', (0.66, 0.66, 0.64), seed=716, roughness=0.22,
                            chips=0.2, rust=0.0, grime=0.35, dust=0.3, fade=0.1, scratches=0.4),
        'reflect_red': F.coated('reflective_red', (0.5, 0.04, 0.03), seed=717, roughness=0.22,
                                chips=0.2, rust=0.0, grime=0.35, dust=0.3, fade=0.2, scratches=0.4),
        'rubber': M.rubber(dust=0.6, seed=718, name='base_rubber'),
        'nb_blue': F.enamel('box_blue', (0.03, 0.09, 0.26), seed=719, wear_amount=0.6),
        'nb_yellow': F.enamel('box_yellow', (0.62, 0.43, 0.03), seed=720, wear_amount=0.6),
        'nb_red': F.enamel('box_red', (0.42, 0.05, 0.03), seed=721, wear_amount=0.6),
        'papers': F.coated('folded_papers', F.striped((0.58, 0.57, 0.53), (0.3, 0.3, 0.29), 0.012,
                                                      axes='Z', share=0.8),
                           seed=722, roughness=0.8, chips=0.0, rust=0.0, grime=0.3, dust=0.2,
                           fade=0.5, scratches=0.0),
        'alu': M.brushed_metal(color=(0.55, 0.56, 0.57), direction='Z', grime=0.4, seed=723,
                               name='booth_alu'),
        'booth': F.enamel('booth_teal', (0.02, 0.16, 0.17), seed=724, wear_amount=0.45),
        'booth_lamp': M.lamp(color=(0.92, 0.96, 1.0), strength=3.0, seed=725, name='lamp_booth'),
        'phone': F.enamel('phone_steel', (0.06, 0.06, 0.065), seed=726, wear_amount=0.5),
        'keys': F.coated('phone_keys', F.striped((0.5, 0.5, 0.48), (0.04, 0.04, 0.04), 0.03,
                                                 axes='Z', share=0.6),
                         seed=727, roughness=0.35, chips=0.0, rust=0.0, grime=0.4, dust=0.2,
                         fade=0.2, scratches=0.4),
        'stainless': M.brushed_metal(color=(0.62, 0.63, 0.64), direction='Z', grime=0.45,
                                     seed=728, name='stainless'),
        'flex': F.moulded('delineator_white', (0.6, 0.6, 0.57), seed=729, wear_amount=0.5),
        'steel': F.enamel('billboard_steel', (0.24, 0.25, 0.25), seed=730, wear_amount=0.6),
        'back': F.enamel('billboard_back', (0.3, 0.31, 0.31), seed=731, wear_amount=0.6),
        'face': F.coated('billboard_face', (0.6, 0.59, 0.56), seed=732, roughness=0.6, chips=0.0,
                         rust=0.1, grime=0.35, dust=0.2, fade=0.3, scratches=0.0),
        'grate': F.checker_plate('catwalk_grate', seed=733, rust=0.35),
        'flood': M.lamp(color=(1.0, 0.92, 0.8), strength=10.0, seed=734, name='lamp_flood'),
        'concrete': M.concrete(color=(0.47, 0.46, 0.44), stains=0.6, cracks=0.3, pits=0.5,
                               seed=735, name='footing_concrete'),
    }


def placed(part, rot=(0.0, 0.0, 0.0), at=(0.0, 0.0, 0.0)):
    """Turns a part built about the origin, then moves it into place."""
    S.move(part, rot=rot)
    S.move(part, at=at)
    return part


# -- builders -----------------------------------------------------------------------------------

def bus_stop(k, m):
    parts = S.base_plate(0.13, 0.012, m['galv'], m['galv'], bolts=4)
    parts.append(S.pole(0.038, 0.035, 0.0, 3.05, m['post'], seg=10))
    parts.append(S.cyl(0.042, 0.03, at=(0.0, 0.0, 3.05), ground=True, seg=10, mat=m['post']))
    parts.append(S.box((0.5, 0.02, 0.58), at=(0.0, 0.056, 2.42), ground=True, mat=m['sign']))
    parts.append(S.box((0.5, 0.02, 0.2), at=(0.0, 0.056, 2.18), ground=True, mat=m['route']))
    clamps = [S.box((0.12, 0.05, 0.035), at=(0.0, 0.03, z), ground=True) for z in (2.24, 2.62, 2.9)]
    clamps += [S.box((0.1, 0.05, 0.03), at=(0.0, 0.03, z), ground=True) for z in (1.36, 1.74)]
    parts.append(S.done(S.join(clamps), m['galv'], skip=1))
    parts.append(S.box((0.36, 0.05, 0.52), at=(0.0, 0.06, 1.3), ground=True, mat=m['case']))
    parts.append(S.box((0.31, 0.004, 0.45), at=(0.0, 0.087, 1.335), ground=True, mat=m['paper']))
    parts.append(S.box((0.33, 0.004, 0.47), at=(0.0, 0.092, 1.325), ground=True, mat=m['glass']))
    stop = k.object('bus_stop_pole', parts, cls='knockable', mass=35.0, lods=(0.35, 0.12),
                    distances=(25.0, 60.0), smooth=35.0, texel_scale=1.2)
    stop.anchor('sign_a', (0.0, 0.067, 2.71), forward=FRONT, width=0.48, height=0.56, shape='rect')
    stop.anchor('sign_b', (0.0, 0.045, 2.71), forward=BACK, width=0.48, height=0.56, shape='rect')
    stop.anchor('routes', (0.0, 0.067, 2.28), forward=FRONT, width=0.48, height=0.18, shape='rect')
    stop.anchor('timetable', (0.0, 0.0895, 1.56), forward=FRONT, width=0.31, height=0.45,
                shape='rect')
    stop.cyl('pole', (0.0, 0.0, 1.55), radius=0.06, height=3.1)


def parking_meter_twin(k, m):
    parts = S.base_plate(0.12, 0.012, m['galv'], m['galv'], bolts=4)
    parts.append(S.pole(0.038, 0.036, 0.0, 1.0, m['meter'], seg=10))
    parts.append(S.box((0.5, 0.07, 0.07), at=(0.0, 0.0, 0.98), ground=True, mat=m['meter']))
    for x in (-0.19, 0.19):
        parts.append(S.rbox(0.17, 0.15, 0.27, 0.025, at=(x, 0.0, 1.05), mat=m['meter']))
        parts.append(S.lathe([(0.088, 1.31), (0.087, 1.37), (0.072, 1.425), (0.036, 1.452),
                              (0.0, 1.457)], m['chrome'], seg=12, at=(x, 0.0, 0.0)))
        parts.append(S.box((0.11, 0.012, 0.055), at=(x, 0.088, 1.33), ground=True, mat=m['lcd']))
        parts.append(S.box((0.06, 0.01, 0.04), at=(x, 0.079, 1.2), ground=True, mat=m['chrome'],
                           skip=1))
        parts.append(S.box((0.05, 0.012, 0.016), at=(x, 0.079, 1.12), ground=True, mat=m['black'],
                           skip=1))
    meter = k.object('parking_meter_twin', parts, cls='knockable', mass=60.0, lods=(0.35, 0.12),
                     distances=(22.0, 50.0), smooth=35.0, texel_scale=1.4)
    meter.anchor('use_a', (-0.19, 0.55, 0.0), forward=BACK)
    meter.anchor('use_b', (0.19, 0.55, 0.0), forward=BACK)
    meter.cyl('post', (0.0, 0.0, 0.5), radius=0.06, height=1.0)
    meter.box('heads', (0.0, 0.0, 1.25), (0.56, 0.2, 0.42))


def bollards(k, m):
    steel = [S.lathe([(0.075, 0.0), (0.075, 0.03), (0.07, 0.035), (0.07, 0.86), (0.06, 0.885),
                      (0.035, 0.9), (0.0, 0.905)], m['stainless'], seg=16),
             S.lathe([(0.0715, 0.7), (0.0715, 0.75)], m['reflect'], seg=16),
             S.lathe([(0.0715, 0.79), (0.0715, 0.82)], m['reflect'], seg=16)]
    post = k.object('bollard_stainless', steel, cls='fixed', lods=(0.35, 0.12),
                    distances=(20.0, 50.0), smooth=40.0, texel_scale=1.3)
    post.cyl('body', (0.0, 0.0, 0.45), radius=0.08, height=0.9)

    flex = [S.cyl(0.12, 0.04, ground=True, seg=12, mat=m['black']),
            S.lathe([(0.04, 0.04), (0.035, 0.78), (0.03, 0.8), (0.0, 0.802)], m['flex'], seg=10),
            S.lathe([(0.0385, 0.55), (0.0378, 0.62)], m['reflect_red'], seg=10),
            S.lathe([(0.0376, 0.68), (0.0371, 0.75)], m['reflect_red'], seg=10),
            S.nuts(S.ring_points(0.09, 3, z=0.04, start=0.5), m['galv'], radius=0.012)]
    stick = k.object('bollard_flex', flex, cls='knockable', mass=1.5, lods=(0.35, 0.12),
                     distances=(18.0, 45.0), smooth=40.0, texel_scale=1.3)
    stick.cyl('body', (0.0, 0.0, 0.4), radius=0.06, height=0.8)


def cone_parts(m, z0=0.0):
    """A 0.95 m cone body with two reflective sleeves, its foot at z0 (no base)."""
    def radius(z):
        return 0.165 + (0.035 - 0.165) * (z - 0.05) / 0.95

    parts = [S.lathe([(0.165, z0 + 0.05), (radius(0.97), z0 + 0.97), (0.03, z0 + 1.0),
                      (0.0, z0 + 1.0)], m['cone'], seg=14)]
    for low, high in ((0.55, 0.67), (0.75, 0.83)):
        parts.append(S.lathe([(radius(low) + 0.003, z0 + low), (radius(high) + 0.003, z0 + high)],
                             m['reflect'], seg=14))
    return parts


def cones(k, m):
    parts = [S.rbox(0.4, 0.4, 0.05, 0.05, mat=m['rubber'])] + cone_parts(m)
    cone = k.object('cone_tall', parts, cls='knockable', mass=4.5, lods=(0.35, 0.12),
                    distances=(20.0, 50.0), smooth=40.0, texel_scale=1.3)
    cone.cyl('body', (0.0, 0.0, 0.5), radius=0.2, height=1.0)

    parts = []
    for index, turn in enumerate((0.0, 0.12, -0.08, 0.2)):
        base = S.rbox(0.4, 0.4, 0.05, 0.05, mat=m['rubber'])
        parts.append(placed(base, rot=(0.0, 0.0, turn), at=(0.0, 0.0, 0.065 * index)))
        if index:
            parts.append(S.lathe([(0.168, 0.065 * index - 0.012), (0.163, 0.065 * index)],
                                 m['cone'], seg=14))
    parts += cone_parts(m, z0=0.195)
    stack = k.object('cone_stack', parts, cls='knockable', mass=18.0, lods=(0.35, 0.12),
                     distances=(20.0, 50.0), smooth=40.0, texel_scale=1.3)
    stack.cyl('body', (0.0, 0.0, 0.6), radius=0.21, height=1.2)


def roadworks_barrier(k, m):
    parts = []
    for x in (-0.97, 0.97):
        parts.append(S.box((0.05, 0.05, 1.0), at=(x, 0.0, 0.0), ground=True, mat=m['red']))
        parts.append(S.rbox(0.09, 0.62, 0.07, 0.02, at=(x, 0.0, 0.0), mat=m['black']))
    parts.append(S.box((2.0, 0.045, 0.15), at=(0.0, 0.0, 0.85), ground=True, mat=m['stripe']))
    parts.append(S.box((2.0, 0.03, 0.22), at=(0.0, 0.0, 0.14), ground=True, mat=m['stripe']))
    parts.append(S.card(1.88, 0.47, at=(0.0, 0.0, 0.37), mat=m['mesh']))
    hooks = [S.rod((-1.0, 0.0, z), (-1.06, 0.0, z), 0.01, seg=4) for z in (0.3, 0.75)]
    hooks += [S.torus(0.03, 0.008, at=(1.03, 0.0, z), seg=8, sides=4) for z in (0.3, 0.75)]
    parts.append(S.done(S.join(hooks), m['red'], skip=1))
    barrier = k.object('roadworks_barrier', parts, cls='knockable', mass=14.0, lods=(0.4, 0.15),
                       distances=(25.0, 60.0), smooth=30.0, texel_scale=1.0)
    barrier.box('body', (0.0, 0.0, 0.5), (2.05, 0.62, 1.0))


def newspaper_bank(k, m):
    parts = [S.box((1.42, 0.34, 0.05), ground=True, mat=m['galv'])]
    for x, body in ((-0.47, 'nb_blue'), (0.0, 'nb_yellow'), (0.47, 'nb_red')):
        legs = [S.box((0.04, 0.3, 0.33), at=(x + sx * 0.17, 0.0, 0.05), ground=True) for sx in (-1, 1)]
        parts.append(S.done(S.join(legs), m['galv']))
        parts.append(S.rbox(0.42, 0.4, 0.62, 0.025, at=(x, 0.0, 0.38), mat=m[body]))
        parts.append(S.box((0.44, 0.42, 0.03), at=(x, 0.0, 1.0), ground=True, mat=m[body]))
        parts.append(S.box((0.36, 0.012, 0.11), at=(x, 0.206, 0.86), ground=True, mat=m['sign']))
        parts.append(S.box((0.3, 0.004, 0.26), at=(x, 0.202, 0.52), ground=True, mat=m['papers']))
        parts.append(S.box((0.33, 0.004, 0.29), at=(x, 0.208, 0.505), ground=True, mat=m['glass']))
        parts.append(S.box((0.14, 0.03, 0.025), at=(x, 0.215, 0.81), ground=True, mat=m['chrome']))
        parts.append(S.box((0.12, 0.1, 0.09), at=(x + 0.12, 0.12, 1.03), ground=True, mat=m['meter']))
        parts.append(S.box((0.03, 0.01, 0.006), at=(x + 0.12, 0.171, 1.08), ground=True,
                           mat=m['black'], skip=1))
    bank = k.object('newspaper_bank', parts, cls='knockable', mass=95.0, lods=(0.35, 0.12),
                    distances=(22.0, 50.0), smooth=35.0, texel_scale=1.2)
    for index, x in enumerate((-0.47, 0.0, 0.47), start=1):
        bank.anchor(f'sign_{index}', (x, 0.213, 0.915), forward=FRONT, width=0.34, height=0.1,
                    shape='rect')
    bank.anchor('use', (0.0, 0.7, 0.0), forward=BACK)
    bank.box('body', (0.0, 0.0, 0.56), (1.42, 0.44, 1.12))


def phone_booth(k, m):
    parts = [S.box((1.04, 1.04, 0.08), ground=True, mat=m['concrete'])]
    posts = [S.box((0.06, 0.06, 2.12), at=(sx * 0.47, sy * 0.47, 0.08), ground=True)
             for sx in (-1, 1) for sy in (-1, 1)]
    rails = []
    for z in (0.3, 1.1, 2.06):
        rails += [S.box((0.88, 0.04, 0.04), at=(0.0, sy * 0.47, z), ground=True) for sy in (-1, 1)]
        rails += [S.box((0.04, 0.88, 0.04), at=(sx * 0.47, 0.0, z), ground=True) for sx in (-1, 1)]
    stiles = [S.box((0.05, 0.045, 1.96), at=(sx * 0.415, 0.47, 0.1), ground=True) for sx in (-1, 1)]
    parts.append(S.done(S.join(posts + rails + stiles), m['alu']))
    kicks = [S.box((0.88, 0.03, 0.22), at=(0.0, -0.47, 0.08), ground=True),
             S.box((0.03, 0.88, 0.22), at=(-0.47, 0.0, 0.08), ground=True),
             S.box((0.03, 0.88, 0.22), at=(0.47, 0.0, 0.08), ground=True),
             S.box((0.78, 0.03, 0.2), at=(0.0, 0.47, 0.1), ground=True)]
    parts.append(S.done(S.join(kicks), m['booth']))
    panes = [S.box((0.86, 0.01, 1.74), at=(0.0, -0.47, 0.32), ground=True),
             S.box((0.01, 0.86, 1.74), at=(-0.47, 0.0, 0.32), ground=True),
             S.box((0.01, 0.86, 1.74), at=(0.47, 0.0, 0.32), ground=True),
             S.box((0.78, 0.01, 1.74), at=(0.0, 0.47, 0.32), ground=True)]
    parts.append(S.done(S.join(panes), m['glass']))
    parts.append(S.rod((0.33, 0.51, 0.9), (0.33, 0.51, 1.32), 0.012, m['stainless'], seg=6))
    handle = [S.rod((0.33, 0.47, z), (0.33, 0.51, z), 0.008, seg=4) for z in (0.94, 1.28)]
    parts.append(S.done(S.join(handle), m['stainless'], skip=1))
    parts.append(S.box((1.0, 1.0, 0.16), at=(0.0, 0.0, 2.2), ground=True, mat=m['booth_lamp']))
    parts.append(S.box((1.12, 1.12, 0.07), at=(0.0, 0.0, 2.36), ground=True, mat=m['booth']))
    parts.append(S.rbox(1.08, 1.08, 0.08, 0.02, at=(0.0, 0.0, 2.43), mat=m['booth'],
                        stations=[(0.0, 1.0), (1.0, 0.55)]))
    parts.append(S.box((0.3, 0.12, 0.48), at=(0.0, -0.39, 1.0), ground=True, mat=m['phone']))
    parts.append(S.box((0.12, 0.012, 0.16), at=(0.04, -0.324, 1.2), ground=True, mat=m['keys']))
    parts.append(S.box((0.055, 0.06, 0.23), at=(-0.1, -0.3, 1.13), ground=True, mat=m['black']))
    parts.append(S.pipe([(-0.1, -0.3, 1.13), (-0.09, -0.27, 1.0), (-0.06, -0.31, 0.98),
                         (-0.04, -0.33, 1.05)], 0.006, m['black'], seg=4, skip=1))
    parts.append(S.box((0.5, 0.22, 0.03), at=(0.0, -0.34, 0.9), ground=True, mat=m['phone']))
    booth = k.object('phone_booth', parts, cls='fixed', lods=(0.4, 0.15), distances=(25.0, 60.0),
                     smooth=30.0, texel_scale=1.1)
    booth.anchor('sign', (0.0, 0.502, 2.28), forward=FRONT, width=0.9, height=0.13, shape='rect')
    booth.anchor('use', (0.0, 0.0, 0.0), forward=BACK)
    booth.box('body', (0.0, 0.0, 1.25), (1.12, 1.12, 2.5))


def billboard(k, m):
    parts = [S.cyl(0.95, 0.35, ground=True, seg=16, mat=m['concrete']),
             S.cyl(0.6, 0.04, at=(0.0, 0.0, 0.35), ground=True, seg=16, mat=m['steel']),
             S.nuts(S.ring_points(0.5, 8, z=0.39), m['galv'], radius=0.03, height=0.04),
             S.pole(0.4, 0.32, 0.39, 9.1, m['steel'], seg=16, step=1.5),
             S.box((3.2, 0.5, 0.45), at=(0.0, 0.0, 8.9), ground=True, mat=m['steel'])]
    frame = [S.beam((-6.1, 0.21, z), (6.1, 0.21, z), 0.12, 0.2, step=2.0) for z in (9.55, 11.4, 13.25)]
    frame += [S.beam((x, 0.2, 9.35), (x, 0.2, 13.4), 0.12, 0.14, up=(0.0, 1.0, 0.0), step=2.0)
              for x in (-5.4, -2.7, 0.0, 2.7, 5.4)]
    frame += [S.box((0.15, 0.15, 0.2), at=(sx * 1.2, 0.0, 9.3), ground=True) for sx in (-1, 1)]
    frame += [S.beam((0.0, 0.0, 7.4), (sx * 3.2, 0.2, 9.45), 0.1, 0.1, up=(0.0, 1.0, 0.0))
              for sx in (-1, 1)]
    parts.append(S.done(S.join(frame), m['steel']))
    parts.append(S.box((12.2, 0.05, 4.2), at=(0.0, 0.3, 9.3), ground=True, mat=m['back']))
    parts.append(S.box((12.0, 0.02, 4.0), at=(0.0, 0.335, 9.4), ground=True, mat=m['face']))
    border = [S.box((12.3, 0.08, 0.1), at=(0.0, 0.34, z), ground=True) for z in (9.3, 13.4)]
    border += [S.box((0.1, 0.08, 4.2), at=(sx * 6.1, 0.34, 9.3), ground=True) for sx in (-1, 1)]
    parts.append(S.done(S.join(border), m['steel']))
    parts.append(S.box((12.4, 0.75, 0.04), at=(0.0, 0.78, 9.12), ground=True, mat=m['grate']))
    joists = [S.beam((x, 0.2, 9.08), (x, 1.15, 9.08), 0.06, 0.08) for x in (-5.5, -2.75, 0.0, 2.75, 5.5)]
    joists.append(S.box((12.4, 0.02, 0.1), at=(0.0, 1.15, 9.1), ground=True))
    parts.append(S.done(S.join(joists), m['steel']))
    rail = [S.rod((-6.2, 1.13, 10.1), (6.2, 1.13, 10.1), 0.02, seg=6)]
    rail += [S.rod((x, 1.13, 9.16), (x, 1.13, 10.1), 0.018, seg=6) for x in (-6.2, -3.1, 0.0, 3.1, 6.2)]
    rail += [S.rod((-6.2, 1.13, 9.63), (6.2, 1.13, 9.63), 0.014, seg=4)]
    parts.append(S.done(S.join(rail), m['galv'], skip=1))
    ladder = [S.rod((sx * 0.2, -0.5, 2.4), (sx * 0.2, -0.5, 8.9), 0.02, seg=6) for sx in (-1, 1)]
    ladder += [S.beam((0.0, -0.3, z), (0.0, -0.5, z), 0.06, 0.04) for z in (3.0, 5.0, 7.0, 8.6)]
    parts.append(S.done(S.join(ladder), m['galv']))
    rungs = [S.rod((-0.2, -0.5, 2.6 + 0.3 * i), (0.2, -0.5, 2.6 + 0.3 * i), 0.012, seg=4)
             for i in range(21)]
    parts.append(S.done(S.join(rungs), m['galv'], skip=1))
    tilt = 0.7
    lights = []
    for x in (-4.5, -1.5, 1.5, 4.5):
        parts.append(S.rod((x, 1.1, 9.16), (x, 1.88, 9.42), 0.025, m['steel'], seg=6))
        parts.append(placed(S.box((0.5, 0.2, 0.16), mat=m['steel']), rot=(tilt, 0.0, 0.0),
                            at=(x, 1.95, 9.5)))
        parts.append(placed(S.box((0.44, 0.15, 0.012), at=(0.0, 0.0, 0.086), mat=m['flood']),
                            rot=(tilt, 0.0, 0.0), at=(x, 1.95, 9.5)))
        lights.append((x, 1.95 - 0.09 * math.sin(tilt), 9.5 + 0.09 * math.cos(tilt)))
    sign = k.object('billboard_monopole', parts, cls='fixed', lods=(0.4, 0.15),
                    distances=(80.0, 200.0), smooth=30.0, texel_scale=0.3)
    sign.anchor('sign', (0.0, 0.346, 11.4), forward=FRONT, width=12.0, height=4.0, shape='rect')
    beam = (0.0, -math.sin(tilt), math.cos(tilt))
    for index, at in enumerate(lights, start=1):
        sign.anchor(f'light_{index}', at, forward=beam, range=14.0, cone=0.9, **FLOOD)
    sign.cyl('footing', (0.0, 0.0, 0.175), radius=0.95, height=0.35)
    sign.cyl('pole', (0.0, 0.0, 4.75), radius=0.42, height=8.7)
    sign.box('head', (0.0, 0.5, 11.2), (12.4, 1.5, 4.6))


def make(a):
    m = palette()
    k = SetKit(a, gap=0.8, row_gap=1.2, row_width=8.0)
    bus_stop(k, m)
    parking_meter_twin(k, m)
    bollards(k, m)
    cones(k, m)
    k.row()
    roadworks_barrier(k, m)
    newspaper_bank(k, m)
    phone_booth(k, m)
    k.row()
    billboard(k, m)
    k.layout()
    a.bake(size=1024, orm_size=512, normal_size=1024, bevel_radius=0.003, occlusion_distance=0.5,
           material_texels={'timetable_paper': 1.5, 'folded_papers': 1.3, 'billboard_face': 0.5,
                            'billboard_back': 0.5, 'catwalk_grate': 0.6})


def assemble(a):
    SetKit.of(a).levels()
