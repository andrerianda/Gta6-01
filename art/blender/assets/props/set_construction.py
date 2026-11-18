"""Construction set: what a building site and a street under repair leave on the pavement, in
one file. Original designs at real size, sharing one atlas (see _setkit.py for how a set is laid
out and named). Fronts look towards +Y (the game's -Z). No lettering anywhere.

    scaffold_bay       one 2.5 m bay of frame scaffold, 1.25 m deep and one 2 m lift: two
                       end frames on screw jacks and sole boards, a cross brace on the back
                       (the building side, -Y), a deck of five boards, a guard rail and toe
                       board on the street side (+Y)
    cement_mixer       a towable drum mixer: tilted orange drum with a ring gear and cement
                       crust in the mouth, cradle, hand wheel, engine box, two wheels, tow bar
    generator          a site generator on skids: yellow canopy with louvres, control panel
                       and sockets on the +X end, exhaust stub, lifting eye, wheel kit
    cable_reel         a wooden cable drum standing on its flanges (axle along X) wound with
                       black cable, a loose end trailing to the ground
    cable_reel_small   a small drum lying flat, wound with orange cable
    pipe_stack         six 6 m steel pipes stacked 3-2-1 on timber bearers (long along X)
    sofa_broken        a dumped three-seat sofa: one leg gone so it sags at +X, one seat cushion
                       fallen in front, torn foam showing
    fence_portable     a 3.5 m temporary fence panel: welded mesh (the cutout role) in a tube
                       frame, standing in two concrete feet; lay end to end at 3.5 m

The budget is raised because this is nine objects in one file.
"""
import math

from lib import materials as M

import _finishes as F
import _shapes as S
from _setkit import SetKit

ASSET = {
    'id': 'set_construction',
    'kind': 'prop',
    'atlas': 1024,
    'budget': {'triangles': 9000, 'draws': 24, 'bytes': 480000},
}

FRONT = (0.0, 1.0, 0.0)


def palette():
    coil = lambda axis: (lambda graph: F.bands(graph, graph.axis(axis), 0.03, share=0.5, soft=0.5))
    return {
        'galv': M.galvanized(spangle=0.5, rust=0.35, seed=801, name='scaffold_galv'),
        'plank': M.wood(color=(0.45, 0.36, 0.24), weathered=0.8, grain_axis='X', seed=802,
                        name='scaffold_board'),
        'orange': F.enamel('mixer_orange', (0.6, 0.2, 0.025), seed=803, wear_amount=0.65,
                           splash=0.8),
        'crust': M.concrete(color=(0.5, 0.49, 0.46), stains=0.7, cracks=0.2, pits=0.6, seed=804,
                            name='cement_crust'),
        'frame': F.enamel('frame_dark', (0.06, 0.065, 0.07), seed=805, wear_amount=0.6,
                          splash=0.6),
        'rubber': M.rubber(dust=0.6, seed=806, name='tyre_rubber'),
        'hub': F.enamel('hub_grey', (0.3, 0.31, 0.3), seed=807, wear_amount=0.6),
        'gen': F.enamel('generator_yellow', (0.6, 0.42, 0.03), seed=808, wear_amount=0.5),
        'louvre': F.slotted('generator_louvre', (0.5, 0.36, 0.03), period=0.025, axis='Z',
                            seed=809, wear_amount=0.5),
        'panel': F.coated('control_panel', F.striped((0.05, 0.05, 0.055), (0.02, 0.02, 0.02), 0.06,
                                                     axes='Z', share=0.8),
                          seed=810, roughness=0.4, chips=0.1, rust=0.0, grime=0.4, dust=0.3,
                          fade=0.2, scratches=0.3),
        'socket': M.plastic(color=(0.05, 0.12, 0.4), roughness=0.4, scuffs=0.5, seed=811,
                            name='socket_blue'),
        'exhaust': M.rusty_metal(color=(0.25, 0.24, 0.23), rust=0.7, seed=812, name='exhaust_rust'),
        'reel': M.wood(color=(0.5, 0.4, 0.27), weathered=0.7, grain_axis='Z', plank_width=0.14,
                       seed=813, name='reel_wood'),
        'cable': F.coated('cable_black', F.striped((0.035, 0.035, 0.037), (0.018, 0.018, 0.02), 0.03,
                                                   axes='X', share=0.5),
                          seed=814, roughness=0.5, chips=0.0, rust=0.0, grime=0.3, dust=0.4,
                          fade=0.2, scratches=0.2, height=coil('X'), bump=0.005),
        'cable_orange': F.coated('cable_orange', F.striped((0.6, 0.2, 0.02), (0.44, 0.13, 0.015),
                                                           0.03, axes='Z', share=0.5),
                                 seed=815, roughness=0.5, chips=0.0, rust=0.0, grime=0.4,
                                 dust=0.4, fade=0.4, scratches=0.2, height=coil('Z'), bump=0.005),
        'pipe': F.enamel('pipe_primer', (0.14, 0.15, 0.13), seed=816, wear_amount=0.8),
        'timber': M.wood(color=(0.38, 0.27, 0.16), weathered=0.9, grain_axis='Y', seed=817,
                         name='bearer_timber'),
        'fabric': M.fabric(color=(0.22, 0.18, 0.11), fade=0.6, dirt=0.75, seed=818,
                           name='sofa_fabric'),
        'foam': M.plastic(color=(0.62, 0.52, 0.25), roughness=0.9, scuffs=0.3, seed=819,
                          name='foam'),
        'leg': M.wood(color=(0.25, 0.15, 0.08), weathered=0.5, grain_axis='Z', seed=820,
                      name='sofa_leg'),
        'mesh': F.wire_mesh(name='cutout_fence', pitch=0.06, wire=0.006, axes=('X', 'Z'),
                            color=(0.5, 0.51, 0.5), seed=821, rust=0.3, pitch_b=0.15),
        'block': M.concrete(color=(0.5, 0.49, 0.47), stains=0.6, cracks=0.3, pits=0.5, seed=822,
                            name='fence_block'),
    }


def placed(part, rot=(0.0, 0.0, 0.0), at=(0.0, 0.0, 0.0)):
    """Turns a part built about the origin, then moves it into place."""
    S.move(part, rot=rot)
    S.move(part, at=at)
    return part


# -- builders -----------------------------------------------------------------------------------

def scaffold(k, m):
    parts = []
    tubes, small = [], []
    for x in (-1.25, 1.25):
        parts.append(S.box((0.22, 1.5, 0.04), at=(x, 0.0, 0.0), ground=True, mat=m['timber']))
        for y in (-0.6, 0.6):
            small.append(S.box((0.15, 0.15, 0.008), at=(x, y, 0.04), ground=True))
            small.append(S.rod((x, y, 0.048), (x, y, 0.16), 0.015, seg=6))
            tubes.append(S.rod((x, y, 0.14), (x, y, 2.0), 0.024, seg=6))
        for z in (0.4, 1.95):
            tubes.append(S.rod((x, -0.6, z), (x, 0.6, z), 0.021, seg=6))
        tubes.append(S.rod((x, -0.6, 1.62), (x, -0.3, 1.95), 0.016, seg=4))
        tubes.append(S.rod((x, 0.6, 1.62), (x, 0.3, 1.95), 0.016, seg=4))
        tubes.append(S.rod((x, 0.6, 1.98), (x, 0.6, 3.0), 0.024, seg=6))
    tubes.append(S.rod((-1.25, -0.6, 0.3), (1.25, -0.6, 1.9), 0.018, seg=6))
    tubes.append(S.rod((-1.25, -0.6, 1.9), (1.25, -0.6, 0.3), 0.018, seg=6))
    for y in (-0.6, 0.6):
        tubes.append(S.rod((-1.3, y, 0.22), (1.3, y, 0.22), 0.021, seg=6))
    for z in (2.5, 3.0):
        tubes.append(S.rod((-1.3, 0.6, z), (1.3, 0.6, z), 0.021, seg=6))
    parts.append(S.done(S.join(tubes), m['galv']))
    parts.append(S.done(S.join(small), m['galv'], skip=1))
    couplers = [S.box((0.07, 0.07, 0.06), at=(x, y, z), ground=True)
                for x in (-1.25, 1.25) for y in (-0.6, 0.6) for z in (0.19, 1.92)]
    parts.append(S.done(S.join(couplers), m['galv'], skip=1))
    boards = [S.box((2.62, 0.225, 0.04), at=(0.0, y, 1.975), ground=True) for y in (-0.48, -0.24, 0.0, 0.24, 0.48)]
    boards.append(S.box((2.6, 0.025, 0.15), at=(0.0, 0.63, 2.015), ground=True))
    parts.append(S.done(S.join(boards), m['plank']))
    bay = k.object('scaffold_bay', parts, cls='fixed', lods=(0.4, 0.15), distances=(30.0, 80.0),
                   smooth=35.0, texel_scale=0.9)
    bay.anchor('deck', (0.0, 0.0, 2.015), forward=FRONT)
    for index, x in enumerate((-1.25, 1.25), start=1):
        bay.box(f'frame_{index}', (x, 0.0, 1.0), (0.08, 1.3, 2.0))
    bay.box('deck', (0.0, 0.0, 1.99), (2.62, 1.25, 0.06))


def cement_mixer(k, m):
    drum = [S.lathe([(0.05, -0.33), (0.26, -0.3), (0.4, -0.12), (0.42, 0.05), (0.34, 0.25),
                     (0.22, 0.4), (0.19, 0.44)], m['orange'], seg=18),
            S.lathe([(0.175, 0.44), (0.2, 0.38), (0.32, 0.22)], m['crust'], seg=18),
            S.cyl(0.33, 0.01, at=(0.0, 0.0, 0.215), seg=18, mat=m['crust']),
            S.cyl(0.07, 0.06, at=(0.0, 0.0, -0.34), seg=10, mat=m['frame']),
            S.torus(0.43, 0.022, at=(0.0, 0.0, 0.0), seg=20, sides=4, mat=m['frame'])]
    parts = [placed(piece, rot=(-0.55, 0.0, 0.0), at=(0.0, 0.0, 0.95)) for piece in drum]
    frame = []
    for sx in (-1, 1):
        frame.append(S.beam((sx * 0.48, -0.1, 0.33), (sx * 0.48, 0.0, 0.95), 0.06, 0.06,
                            up=(0.0, 1.0, 0.0)))
        frame.append(S.cyl(0.06, 0.08, at=(sx * 0.45, 0.0, 0.95), axis='X', seg=10))
    frame.append(S.beam((-0.5, -0.1, 0.33), (0.5, -0.1, 0.33), 0.07, 0.07))
    frame.append(S.beam((0.0, -0.75, 0.3), (0.0, 1.0, 0.3), 0.07, 0.07))
    frame.append(S.beam((-0.6, -0.35, 0.22), (0.6, -0.35, 0.22), 0.05, 0.05))
    frame.append(S.rod((0.0, 0.88, 0.0), (0.0, 0.88, 0.27), 0.025, seg=6))
    frame.append(S.torus(0.04, 0.012, at=(0.0, 1.05, 0.3), seg=8, sides=4, axis='X'))
    parts.append(S.done(S.join(frame), m['frame']))
    wheel = [S.torus(0.17, 0.045, at=(-0.66, 0.0, 0.95), seg=16, sides=5, axis='X')]
    wheel += [S.rod((-0.66, 0.0, 0.95), (-0.66, 0.17 * math.cos(a), 0.95 + 0.17 * math.sin(a)), 0.01, seg=4)
              for a in (0.3, 0.3 + math.tau / 3, 0.3 + 2 * math.tau / 3)]
    parts.append(S.done(S.join(wheel), m['frame'], skip=1))
    for sx in (-1, 1):
        parts.append(S.cyl(0.2, 0.08, at=(sx * 0.6, -0.35, 0.2), axis='X', seg=14, mat=m['rubber']))
        parts.append(S.cyl(0.1, 0.09, at=(sx * 0.6, -0.35, 0.2), axis='X', seg=8, mat=m['hub']))
    parts.append(S.rbox(0.46, 0.34, 0.3, 0.03, at=(0.0, -0.62, 0.34), mat=m['orange']))
    parts.append(S.box((0.3, 0.012, 0.16), at=(0.0, -0.795, 0.4), ground=True, mat=m['frame'],
                       skip=1))
    mixer = k.object('cement_mixer', parts, cls='knockable', mass=160.0, lods=(0.35, 0.12),
                     distances=(22.0, 55.0), smooth=35.0, texel_scale=1.1)
    mixer.box('body', (0.0, 0.12, 0.65), (1.35, 1.9, 1.3))


def generator(k, m):
    parts = [S.box((1.3, 0.08, 0.1), at=(0.0, sy * 0.3, 0.12), ground=True, mat=m['frame'])
             for sy in (-1, 1)]
    parts.append(S.rbox(1.2, 0.68, 0.72, 0.04, at=(0.0, 0.0, 0.22), mat=m['gen']))
    for sy in (-1, 1):
        parts.append(S.box((0.5, 0.012, 0.32), at=(-0.15, sy * 0.343, 0.4), ground=True,
                           mat=m['louvre']))
        parts.append(S.cyl(0.13, 0.07, at=(-0.5, sy * 0.42, 0.13), axis='Y', seg=12, mat=m['rubber']))
        parts.append(S.cyl(0.06, 0.08, at=(-0.5, sy * 0.42, 0.13), axis='Y', seg=8, mat=m['hub']))
        parts.append(S.box((0.08, 0.12, 0.12), at=(0.55, sy * 0.3, 0.0), ground=True, mat=m['rubber']))
    parts.append(S.box((0.012, 0.44, 0.3), at=(0.606, 0.0, 0.44), ground=True, mat=m['panel']))
    sockets = [S.cyl(0.035, 0.04, at=(0.625, y, 0.5), axis='X', seg=8) for y in (-0.13, 0.0, 0.13)]
    parts.append(S.done(S.join(sockets), m['socket'], skip=1))
    parts.append(S.cyl(0.035, 0.16, at=(-0.4, 0.15, 0.92), ground=True, seg=8, mat=m['exhaust']))
    parts.append(S.cyl(0.045, 0.03, at=(0.35, -0.15, 0.94), ground=True, seg=8, mat=m['frame']))
    parts.append(S.torus(0.05, 0.012, at=(0.0, 0.0, 0.99), seg=8, sides=4, axis='Y', mat=m['galv'],
                         skip=1))
    parts.append(S.pipe([(-0.6, -0.3, 0.62), (-0.76, -0.3, 0.64), (-0.76, 0.3, 0.64), (-0.6, 0.3, 0.62)],
                        0.016, m['frame'], seg=6))
    gen = k.object('generator', parts, cls='knockable', mass=260.0, lods=(0.35, 0.12),
                   distances=(22.0, 55.0), smooth=35.0, texel_scale=1.1)
    gen.anchor('use', (0.95, 0.0, 0.0), forward=(-1.0, 0.0, 0.0))
    gen.box('body', (-0.05, 0.0, 0.48), (1.45, 0.92, 0.96))


def reels(k, m):
    parts = [S.cyl(0.62, 0.05, at=(sx * 0.36, 0.0, 0.62), axis='X', seg=22, mat=m['reel'])
             for sx in (-1, 1)]
    parts.append(S.cyl(0.44, 0.67, at=(0.0, 0.0, 0.62), axis='X', seg=22, mat=m['cable']))
    parts += [S.cyl(0.12, 0.012, at=(sx * 0.391, 0.0, 0.62), axis='X', seg=10, mat=m['galv'])
              for sx in (-1, 1)]
    bolts = [(sx * 0.39, 0.5 * math.cos(a), 0.62 + 0.5 * math.sin(a))
             for sx in (-1, 1) for a in (math.tau * i / 8 for i in range(8))]
    parts.append(S.nuts(bolts, m['galv'], radius=0.016, height=0.012, axis='X'))
    parts.append(S.pipe([(0.2, 0.05, 1.06), (0.24, 0.32, 1.0), (0.28, 0.58, 0.55), (0.3, 0.72, 0.05),
                         (0.5, 0.95, 0.02), (0.8, 1.05, 0.02)], 0.018, m['cable'], seg=6, smooth=2))
    reel = k.object('cable_reel', parts, cls='knockable', mass=280.0, lods=(0.35, 0.12),
                    distances=(22.0, 55.0), smooth=40.0, texel_scale=1.0)
    reel.box('body', (0.0, 0.0, 0.62), (0.82, 1.24, 1.24))

    parts = [S.cyl(0.4, 0.035, at=(0.0, 0.0, z), ground=True, seg=18, mat=m['reel']) for z in (0.0, 0.4)]
    parts.append(S.cyl(0.28, 0.365, at=(0.0, 0.0, 0.035), ground=True, seg=18, mat=m['cable_orange']))
    parts.append(S.cyl(0.08, 0.01, at=(0.0, 0.0, 0.435), ground=True, seg=10, mat=m['galv']))
    parts.append(S.pipe([(0.27, 0.05, 0.3), (0.45, 0.1, 0.25), (0.6, 0.3, 0.03), (0.85, 0.35, 0.02)],
                        0.012, m['cable_orange'], seg=5, smooth=2))
    small = k.object('cable_reel_small', parts, cls='knockable', mass=45.0, lods=(0.35, 0.12),
                     distances=(18.0, 45.0), smooth=40.0, texel_scale=1.1)
    small.cyl('body', (0.0, 0.0, 0.22), radius=0.4, height=0.44)


def pipe_stack(k, m):
    parts = [S.box((0.12, 1.3, 0.1), at=(x, 0.0, 0.0), ground=True, mat=m['timber']) for x in (-2.0, 2.0)]
    r, inner, half = 0.16, 0.145, 3.0
    rise = 2 * r * math.sin(math.pi / 3) + 0.004
    centres = [(y, 0.1 + r) for y in (-0.33, 0.0, 0.33)]
    centres += [(y, 0.1 + r + rise) for y in (-0.165, 0.165)]
    centres.append((0.0, 0.1 + r + 2 * rise))
    for index, (y, z) in enumerate(centres):
        shift = (0.04, -0.06, 0.1, -0.02, 0.07, -0.05)[index]
        tube = [S.lathe([(r, -half), (r, half)], m['pipe'], seg=14),
                S.lathe([(inner, half), (inner, -half)], m['pipe'], seg=14),
                S.lathe([(r, half), (inner, half)], m['pipe'], seg=14),
                S.lathe([(inner, -half), (r, -half)], m['pipe'], seg=14)]
        parts += [placed(piece, rot=(0.0, math.pi / 2, 0.0), at=(shift, y, z)) for piece in tube]
    chocks = [S.box((0.1, 0.08, 0.08), at=(x, sy * 0.52, 0.1), ground=True) for x in (-2.0, 2.0) for sy in (-1, 1)]
    parts.append(S.done(S.join(chocks), m['timber'], skip=1))
    stack = k.object('pipe_stack', parts, cls='fixed', lods=(0.4, 0.15), distances=(30.0, 70.0),
                     smooth=40.0, texel_scale=0.7)
    stack.box('body', (0.0, 0.0, 0.5), (6.2, 1.3, 1.0))


def sofa(k, m):
    body = [S.rbox(2.0, 0.85, 0.28, 0.04, at=(0.0, 0.0, 0.1), mat=m['fabric']),
            placed(S.rbox(2.0, 0.22, 0.5, 0.06, mat=m['fabric']), rot=(0.12, 0.0, 0.0),
                   at=(0.0, -0.32, 0.36)),
            S.rbox(0.2, 0.85, 0.3, 0.06, at=(-0.9, 0.0, 0.38), mat=m['fabric']),
            S.rbox(0.2, 0.85, 0.3, 0.06, at=(0.9, 0.0, 0.38), mat=m['fabric']),
            S.rbox(0.78, 0.62, 0.16, 0.05, at=(-0.4, 0.08, 0.38), mat=m['fabric']),
            S.box((0.6, 0.45, 0.02), at=(0.4, 0.06, 0.38), ground=True, mat=m['foam']),
            S.box((0.25, 0.18, 0.012), at=(-0.3, 0.12, 0.54), ground=True, mat=m['foam'], skip=1)]
    body += [S.cyl(0.03, 0.1, at=(-0.9, sy * 0.36, 0.0), ground=True, seg=8, mat=m['leg']) for sy in (-1, 1)]
    tilt = 0.0526
    parts = [placed(piece, rot=(0.0, tilt, 0.0), at=(0.0, 0.0, -0.047)) for piece in body]
    parts.append(placed(S.rbox(0.78, 0.62, 0.16, 0.05, mat=m['fabric']), rot=(0.25, 0.0, 0.4),
                        at=(0.55, 0.85, 0.03)))
    parts.append(S.cyl(0.03, 0.1, at=(1.2, 0.55, 0.03), axis='X', seg=8, mat=m['leg'], skip=1))
    couch = k.object('sofa_broken', parts, cls='knockable', mass=40.0, lods=(0.35, 0.12),
                     distances=(20.0, 50.0), smooth=50.0, texel_scale=1.0)
    couch.anchor('seat', (-0.4, 0.15, 0.5), forward=FRONT)
    couch.box('body', (0.0, 0.0, 0.42), (2.05, 0.9, 0.85))


def fence(k, m):
    parts = [S.pipe([(-1.72, 0.0, 0.12), (1.72, 0.0, 0.12), (1.72, 0.0, 2.1), (-1.72, 0.0, 2.1)],
                    0.0185, m['galv'], seg=6, closed=True)]
    pins = [S.rod((sx * 1.72, 0.0, 0.0), (sx * 1.72, 0.0, 0.12), 0.0185, seg=6) for sx in (-1, 1)]
    pins.append(S.rod((-1.72, 0.0, 1.1), (1.72, 0.0, 1.1), 0.012, seg=4))
    parts.append(S.done(S.join(pins), m['galv']))
    parts.append(S.card(3.42, 1.96, at=(0.0, 0.0, 0.13), mat=m['mesh']))
    parts += [S.rbox(0.2, 0.62, 0.14, 0.04, at=(sx * 1.72, 0.0, 0.0), mat=m['block']) for sx in (-1, 1)]
    clamps = [S.box((0.08, 0.06, 0.1), at=(1.75, 0.0, z), ground=True) for z in (0.3, 1.85)]
    parts.append(S.done(S.join(clamps), m['galv'], skip=1))
    panel = k.object('fence_portable', parts, cls='knockable', mass=45.0, lods=(0.4, 0.15),
                     distances=(30.0, 70.0), smooth=30.0, texel_scale=1.0)
    panel.box('body', (0.0, 0.0, 1.06), (3.5, 0.3, 2.12))


def make(a):
    m = palette()
    k = SetKit(a, gap=0.8, row_gap=1.2, row_width=9.0)
    scaffold(k, m)
    cement_mixer(k, m)
    generator(k, m)
    k.row()
    reels(k, m)
    sofa(k, m)
    fence(k, m)
    k.row()
    pipe_stack(k, m)
    k.layout()
    a.bake(size=1024, orm_size=512, normal_size=1024, bevel_radius=0.003, occlusion_distance=0.5,
           material_texels={'cutout_fence': 1.6, 'pipe_primer': 0.6})


def assemble(a):
    SetKit.of(a).levels()
