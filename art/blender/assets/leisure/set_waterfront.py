"""Waterfront set, part one: the furniture of the Playa Dorada promenade and the pier, original
designs in real sizes, six objects in one file sharing one atlas.

promenade_bench   a 1.9 m bench of six weathered timber slats curving from the seat into the
                  back, on two cast-iron end frames painted sea green; seats face +Y;
                  anchor_seat_1..3. Fixed (bolted down).
bench_backless    a 1.8 m backless bench: a cast concrete plinth with a timber slat top, to sit
                  on from either side; anchor_seat_1..3 face +Y. Fixed.
railing_2m        a 2 m sea railing module along X: one sea-green steel post at its -X end on a
                  base plate, a timber handrail at 1.07 m and three stainless cables; modules
                  butt end to end (close a run with railing_post). Fixed.
railing_post      the post of railing_2m alone, with its cap, to end a run. Fixed.
promenade_lamp    our own promenade lamp, 4.6 m: an octagonal cast base, a slender fluted
                  column with collars, a round opal lantern (lamp_main) in a four-bar cage under
                  a conical cap and finial; anchor_light in the lantern. Fixed.
pier_kiosk        a hexagonal timber kiosk 2.6 m across on a plank floor: back walls closed,
                  three serving hatches in front with counters and raised canvas flaps
                  (paint_canvas), a hipped hexagonal roof with a lantern cupola, a blank sign board
                  on the front of the roof (anchor_sign: the game paints the name);
                  anchor_use at the front counter. Fixed.

Materials: "paint_canvas" (the kiosk's flaps), "lamp_main" (the promenade lamp's lantern,
switched by the game at dusk) and the atlas. Colliders and anchors are children of each object
node (see _leisure.py for the scheme).

Budget: six objects in one file, about 3,000 triangles at level 0 in all, one draw per object
(two for the kiosk and the lamp), one 1024 atlas.

Blender axes: Z up, every object faces +Y; they stand in a row along +X.
"""
import math

from lib import build, modify
from lib import materials as M

import _beach_gear as B
import _leisure as L

ASSET = {
    'id': 'set_waterfront',
    'kind': 'prop',
    'atlas': 1024,
    # Six objects in one file share one atlas: their level-0 triangles together, one draw per
    # object plus the kiosk's canvas and the lamp's lantern.
    'budget': {'triangles': 6000, 'draws': 10, 'bytes': 400000},
}

LAMP_COLOR = (1.0, 0.82, 0.58)


def own_materials(seed=0):
    return {
        'iron': M.painted_metal(color=(0.06, 0.18, 0.16), gloss=0.45, chips=0.3, rust=0.25,
                                grime=0.35, dust=0.2, fade=0.35, seed=seed, name='iron_green'),
        'slat': M.wood(color=(0.42, 0.31, 0.21), weathered=0.75, grain_axis='X', seed=seed + 1,
                       name='bench_slat'),
        'concrete': M.concrete(color=(0.62, 0.60, 0.56), stains=0.45, cracks=0.2, pits=0.4,
                               seed=seed + 2, name='bench_concrete'),
        'stainless': M.brushed_metal(color=(0.68, 0.69, 0.70), roughness=0.28, grime=0.15,
                                     seed=seed + 3, name='stainless'),
        'boards': M.painted_metal(color=(0.74, 0.76, 0.72), gloss=0.3, chips=0.5, rust=0.0,
                                  grime=0.4, dust=0.3, fade=0.4, seed=seed + 4,
                                  name='kiosk_boards'),
        'boards_blue': M.painted_metal(color=(0.16, 0.34, 0.48), gloss=0.3, chips=0.5, rust=0.0,
                                       grime=0.4, dust=0.3, fade=0.5, seed=seed + 5,
                                       name='kiosk_blue'),
        'lamp': M.lamp(color=LAMP_COLOR, strength=6.0, name='lamp_main'),
    }


def side_frame(name, outline, x, thickness, material):
    """A cast end frame: `outline` (y, z) in the YZ plane, `thickness` along X at x."""
    part = build.extrude_outline(name, outline, thickness)
    modify.transform(part, rotation=(math.radians(90.0), 0.0, math.radians(90.0)))
    modify.transform(part, location=(x - thickness * 0.5, 0.0, 0.0))
    return B.mat(part, material)


def model_promenade_bench(m, w):
    parts = []
    outline = [(0.30, 0.0), (0.27, 0.40), (0.31, 0.45), (0.24, 0.475), (-0.18, 0.445),
               (-0.30, 0.88), (-0.37, 0.87), (-0.27, 0.42), (-0.28, 0.0), (-0.20, 0.0),
               (-0.16, 0.34), (0.15, 0.36), (0.22, 0.0)]
    for sx in (-1.0, 1.0):
        parts.append(side_frame(f'frame{sx:+.0f}', outline, sx * 0.86, 0.045, w['iron']))
    for k, (y, z, tilt) in enumerate(((0.21, 0.495, 0.0), (0.12, 0.49, 0.0), (0.03, 0.482, 0.0),
                                      (-0.06, 0.474, 0.0), (-0.15, 0.466, 0.0),
                                      (-0.215, 0.56, 72.0), (-0.245, 0.66, 72.0),
                                      (-0.275, 0.76, 72.0), (-0.305, 0.85, 72.0))):
        parts.append(B.block(f'slat{k}', (1.9, 0.075, 0.032), (0.0, y, z), w['slat'],
                             rotation=(math.radians(tilt), 0.0, 0.0)))
    parts.append(B.rod('stretcher', (-0.84, -0.17, 0.2), (0.84, -0.17, 0.2), 0.015, w['iron']))
    return parts


def model_bench_backless(m, w):
    parts = [B.block('plinth', (1.5, 0.36, 0.38), (0.0, 0.0, 0.19), w['concrete'])]
    parts.append(B.block('plinth_lip', (1.6, 0.44, 0.04), (0.0, 0.0, 0.4), w['concrete']))
    for k in range(5):
        y = -0.2 + 0.1 * k
        parts.append(B.block(f'slat{k}', (1.8, 0.085, 0.04), (0.0, y, 0.44), w['slat']))
    return parts


def railing_post(prefix, x, w):
    return [B.block(f'{prefix}plate', (0.16, 0.16, 0.012), (x, 0.0, 0.006), w['iron']),
            B.block(f'{prefix}post', (0.06, 0.06, 1.02), (x, 0.0, 0.52), w['iron']),
            B.block(f'{prefix}cap', (0.1, 0.1, 0.02), (x, 0.0, 1.035), w['iron'])]


def model_railing(m, w):
    parts = railing_post('', -1.0, w)
    parts.append(B.block('handrail', (2.0, 0.1, 0.05), (0.0, 0.0, 1.07), w['slat']))
    for k, z in enumerate((0.3, 0.55, 0.8)):
        parts.append(B.rod(f'cable{k}', (-1.0, 0.0, z), (1.0, 0.0, z), 0.004, w['stainless'], 4))
    return parts


def model_railing_post(m, w):
    parts = railing_post('', 0.0, w)
    parts.append(B.block('handrail_end', (0.12, 0.1, 0.05), (0.0, 0.0, 1.07), w['slat']))
    return parts


def model_promenade_lamp(m, w):
    parts = [B.mat(build.cylinder('base', radius=0.17, radius_top=0.13, depth=0.55, segments=8,
                                  on_ground=True), w['iron'])]
    parts.append(B.mat(build.cylinder('base_cap', radius=0.15, depth=0.05, segments=8,
                                      location=(0.0, 0.0, 0.57)), w['iron']))
    profile = [(0.085, 0.58), (0.08, 1.2), (0.07, 2.4), (0.058, 3.62)]
    parts.append(B.mat(build.lathe('column', profile, segments=12), w['iron']))
    for z, r in ((1.0, 0.1), (3.0, 0.08), (3.64, 0.11)):
        parts.append(B.mat(build.cylinder(f'collar{z:.1f}', radius=r, depth=0.05, segments=12,
                                          location=(0.0, 0.0, z)), w['iron']))
    # The lantern: an opal globe-cylinder in a cage of four bars, a cap and a finial.
    parts.append(B.mat(build.cylinder('seat', radius=0.15, depth=0.06, segments=12,
                                      location=(0.0, 0.0, 3.7)), w['iron']))
    parts.append(B.mat(build.lathe('lantern', [(0.12, 3.73), (0.16, 3.85), (0.165, 4.1),
                                               (0.13, 4.22)], segments=14), w['lamp']))
    for k in range(4):
        a = math.tau * k / 4 + math.pi / 4
        x, y = 0.175 * math.cos(a), 0.175 * math.sin(a)
        parts.append(B.rod(f'bar{k}', (x, y, 3.72), (x, y, 4.24), 0.01, w['iron'], 4))
    parts.append(B.mat(build.lathe('cap', [(0.24, 4.22), (0.22, 4.27), (0.05, 4.48),
                                           (0.0, 4.5)], segments=12, cap_bottom=True), w['iron']))
    parts.append(B.mat(build.sphere('finial', radius=0.035, segments=8, rings=4,
                                    location=(0.0, 0.0, 4.55)), w['iron']))
    return parts


def model_pier_kiosk(m, w):
    parts = []
    radius, apothem = 1.3, 1.3 * math.cos(math.pi / 6)
    side = radius
    parts.append(B.mat(build.cylinder('floor', radius=radius + 0.08, depth=0.12, segments=6,
                                      on_ground=True), m['deck']))
    for k in range(6):
        corner = math.radians(60.0 * k)
        parts.append(B.block(f'corner{k}', (0.09, 0.09, 2.2),
                             (radius * math.cos(corner), radius * math.sin(corner), 1.22),
                             m['timber']))
        centre = math.radians(60.0 * k + 30.0)
        cx, cy = apothem * math.cos(centre), apothem * math.sin(centre)
        turn = (0.0, 0.0, centre - math.pi / 2)
        front = math.sin(centre) > 0.1
        parts.append(B.block(f'low{k}', (side, 0.06, 0.98), (cx, cy, 0.61),
                             w['boards_blue'], rotation=turn))
        if front:
            out = 0.16
            parts.append(B.block(f'counter{k}', (side + 0.04, 0.38, 0.05),
                                 (cx + out * math.cos(centre), cy + out * math.sin(centre), 1.12),
                                 m['counter'], rotation=turn))
            parts.append(B.block(f'header{k}', (side, 0.07, 0.24), (cx, cy, 2.2),
                                 w['boards'], rotation=turn))
            flap = B.block(f'flap{k}', (side + 0.06, 0.72, 0.03), (0.0, 0.36, 0.0), m['canvas'],
                           rotation=(0.0, 0.0, 0.0))
            modify.transform(flap, rotation=(math.radians(22.0), 0.0, centre - math.pi / 2))
            modify.transform(flap, location=(cx, cy, 2.3))
            parts.append(flap)
        else:
            parts.append(B.block(f'high{k}', (side, 0.06, 1.24), (cx, cy, 1.72), w['boards'],
                                 rotation=turn))
    parts.append(B.mat(build.cylinder('shelf', radius=0.9, depth=0.04, segments=6,
                                      location=(0.0, 0.0, 0.95)), m['interior']))
    parts.append(B.mat(build.lathe('roof', [(radius + 0.32, 2.32), (radius + 0.3, 2.38),
                                            (0.2, 3.2), (0.0, 3.22)], segments=6,
                                   cap_bottom=True), m['roof']))
    parts.append(B.mat(build.cylinder('cupola', radius=0.17, depth=0.26, segments=6,
                                      location=(0.0, 0.0, 3.32)), w['boards']))
    parts.append(B.mat(build.lathe('cupola_cap', [(0.25, 3.44), (0.0, 3.7)], segments=6,
                                   cap_bottom=True), m['roof']))
    parts.append(B.mat(build.sphere('finial', radius=0.04, segments=6, rings=4,
                                    location=(0.0, 0.0, 3.74)), w['iron']))
    parts.append(B.block('sign_board', (1.2, 0.05, 0.34), (0.0, 1.0, 2.62), m['sign'],
                         rotation=(math.radians(-8.0), 0.0, 0.0)))
    for sx in (-1.0, 1.0):
        parts.append(B.block(f'sign_leg{sx:+.0f}', (0.05, 0.05, 0.4), (sx * 0.5, 0.96, 2.45),
                             m['timber']))
    return parts


def make(a):
    m = L.materials(seed=17)
    w = own_materials(seed=53)
    layout = L.SetLayout(a, gap=1.5)
    seats = [('seat_1', (-0.6, 0.05, 0.47), (0.0, 1.0, 0.0)),
             ('seat_2', (0.0, 0.05, 0.47), (0.0, 1.0, 0.0)),
             ('seat_3', (0.6, 0.05, 0.47), (0.0, 1.0, 0.0))]
    layout.object('promenade_bench', model_promenade_bench(m, w), 1.95, cls='fixed',
                  colliders=[('box', 'bench', (0.0, -0.03, 0.45), (1.9, 0.66, 0.9))],
                  anchors=seats)
    layout.object('bench_backless', model_bench_backless(m, w), 1.8, cls='fixed',
                  colliders=[('box', 'bench', (0.0, 0.0, 0.23), (1.8, 0.48, 0.46))],
                  anchors=[(what, (x, 0.0, 0.46), fwd) for what, (x, _y, _z), fwd in seats])
    layout.object('railing_2m', model_railing(m, w), 2.1, cls='fixed',
                  colliders=[('box', 'rail', (0.0, 0.0, 0.55), (2.0, 0.1, 1.1))])
    layout.object('railing_post', model_railing_post(m, w), 0.16, cls='fixed',
                  colliders=[('box', 'post', (0.0, 0.0, 0.55), (0.1, 0.1, 1.1))])
    layout.object('promenade_lamp', model_promenade_lamp(m, w), 0.5, cls='fixed',
                  colliders=[('cyl', 'pole', (0.0, 0.0, 2.3), (0.17, 4.6))],
                  anchors=[('light', (0.0, 0.0, 3.98), (0.0, 0.0, -1.0))])
    layout.object('pier_kiosk', model_pier_kiosk(m, w), 3.3, cls='fixed',
                  colliders=[('cyl', 'kiosk', (0.0, 0.0, 1.4), (1.35, 2.8))],
                  anchors=[('sign', (0.0, 1.035, 2.62), (0.0, 1.0, 0.0)),
                           ('use', (0.0, 1.85, 0.12), (0.0, -1.0, 0.0))])
    layout.finish(lod_ratio=0.35, lod_distance=40.0)
    a.bake(occlusion_distance=0.4)
