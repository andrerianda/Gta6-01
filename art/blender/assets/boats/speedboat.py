"""speedboat: an open sport boat with twin outboards (catalogue: Olabarria Pez Vela 32), 9.8 m
overall (hull 9.05 m), beam 2.72 m, draught 0.45 m at the keel, 2.0 m to the screen top.

Built with boats/_boat.py. Deep-vee planing hull (22 degrees deadrise at the transom, sharper
forward) with two spray rails a side, a reversed chine and flared topsides that rise to a sharp
bow; a teal hull stripe sweeping up toward the bow and a boot stripe over dark antifouling. A
non-slip foredeck with a bow rail and cleats, a raked wrap-round screen with a top rail, a helm
console to starboard (wheel, throttle, dash) and a passenger console to port, two helm seats, a
rear bench, split swim platforms either side of two cowled outboards, a stern light pole, bow
navigation lights.

Faces +Y (the bow), origin at the waterline at mid length: the hull floats on Z = 0 at rest.
engine_l / engine_r: origin on the steering pivot at the transom; swing about the vertical.
propeller_l / propeller_r (children of the engines): origin at the hub, spin about Y.
steering_wheel: an empty on the hub, local Z up the column toward the helmsman.

Budget: the body, two engines, two propellers and the wheel are separate nodes with nine game
materials (atlas, paint, paint_secondary, glass and five lamp groups): about 14 draws at level 0,
within the vehicle default; triangles and bytes capped at the brief's boat targets.
"""
import math

from lib import materials as M
from lib import modify, scene, shading

import _boat as K

ASSET = {
    'id': 'speedboat',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 16000, 'draws': 14, 'bytes': 430000},
}

TRANSOM_Y = -4.30
# Hull keys: (y, keel z, chine x, chine z, sheer x, sheer z).
HULL = [
    (-4.30, -0.42, 1.12, -0.03, 1.25, 0.88),
    (-3.00, -0.44, 1.17, -0.02, 1.32, 0.90),
    (-1.00, -0.45, 1.17, 0.00, 1.36, 0.94),
    (1.00, -0.40, 1.05, 0.06, 1.30, 1.00),
    (2.60, -0.25, 0.76, 0.21, 1.07, 1.09),
    (3.70, -0.02, 0.40, 0.45, 0.68, 1.19),
    (4.40, 0.42, 0.13, 0.75, 0.30, 1.26),
    (4.75, 1.00, 0.02, 1.10, 0.04, 1.30),
]
SOLE_Z = 0.22
HELM = (0.60, 0.45)                    # helm console centre (x, y)
WHEEL_HUB = (0.60, 0.20, 1.04)
COLUMN = (0.0, -0.80, 0.60)            # up the column, toward the helmsman
ENGINE_X = 0.34


def materials():
    lamp = M.lamp
    return {
        'paint': M.car_paint(color=M.hex_color('#F0EEE8'), metallic_flake=0.05, gloss=0.9,
                             dirt=0.15, seed=71, name='paint'),
        'secondary': M.car_paint(color=M.hex_color('#1F9AA0'), metallic_flake=0.2, gloss=0.9,
                                 dirt=0.1, seed=72, name='paint_secondary'),
        'bottom': M.painted_metal(color=(0.03, 0.05, 0.09), gloss=0.3, chips=0.2, rust=0.0,
                                  grime=0.5, dust=0.0, fade=0.3, seed=73, name='antifouling'),
        'deck': M.plastic(color=(0.62, 0.62, 0.60), roughness=0.85, grain=1.0, scuffs=0.4,
                          seed=74, name='deck_nonslip'),
        'teak': M.wood(color=(0.30, 0.19, 0.11), weathered=0.25, grain_axis='Y',
                       plank_width=0.085, varnish=0.0, seed=90, name='deck_teak'),
        'gelcoat': M.plastic(color=(0.70, 0.70, 0.68), roughness=0.3, grain=0.2, scuffs=0.3,
                             seed=75, name='gelcoat_white'),
        'seat': M.leather(color=(0.72, 0.70, 0.65), grain=0.4, wear_amount=0.3, seed=76,
                          name='seat_vinyl'),
        'trim': M.plastic(color=(0.022, 0.022, 0.024), roughness=0.5, seed=77,
                          name='trim_plastic'),
        'chrome': M.chrome(seed=78, name='stainless'),
        'cowl': M.car_paint(color=(0.05, 0.05, 0.055), metallic_flake=0.3, gloss=0.85,
                            dirt=0.1, seed=79, name='cowl_paint'),
        'engine_trim': M.painted_metal(color=(0.04, 0.04, 0.045), gloss=0.5, chips=0.2,
                                       rust=0.0, grime=0.4, dust=0.0, fade=0.2, seed=80,
                                       name='engine_paint'),
        'prop': M.brushed_metal(color=(0.55, 0.56, 0.57), roughness=0.25, seed=81,
                                name='prop_steel'),
        'wheel': M.rubber(color=(0.02, 0.02, 0.022), seed=82, name='wheel_rubber'),
        'screen': M.plastic(color=(0.008, 0.01, 0.014), roughness=0.08, grain=0.0, scuffs=0.05,
                            seed=83, name='screen_black'),
        'rubbing': M.rubber(color=(0.03, 0.03, 0.032), seed=84, name='rub_rail'),
        'glass': M.glass(tint=(0.30, 0.36, 0.38), opacity=0.36, seed=85, name='glass'),
        'lamp_head': lamp(color=(1.0, 0.96, 0.90), strength=8.0, seed=86, name='lamp_head'),
        'lamp_nav_red': lamp(color=(1.0, 0.06, 0.04), strength=5.0, seed=87,
                             name='lamp_nav_red'),
        'lamp_nav_green': lamp(color=(0.08, 1.0, 0.3), strength=5.0, seed=88,
                               name='lamp_nav_green'),
        'lamp_tail': lamp(color=(1.0, 0.96, 0.90), strength=6.0, seed=89, name='lamp_tail'),
    }


def _hull_material(centre, normal):
    """Index into [paint, secondary, bottom]: antifouling, boot stripe, hull stripe, topsides."""
    z, y = centre.z, centre.y
    if z < 0.07:
        return 2
    if z < 0.14:
        return 1
    # A sweep that rises and tapers toward the bow, ending clear of the stem.
    stripe = 0.44 + 0.050 * (y - TRANSOM_Y)
    width = 0.16 - 0.012 * (y - TRANSOM_Y)
    if y < 3.2 and stripe < z < stripe + width and abs(normal.x) > 0.5:
        return 1
    return 0


def windscreen(mats):
    rows = []
    for i in range(5):
        t = i / 4.0
        y, z = 1.42 - 0.34 * t, 1.08 + 0.45 * t
        half = 1.22 - 0.10 * t
        row = []
        for j in range(11):
            u = -1.0 + 2.0 * j / 10.0
            row.append((half * u, y - 0.55 * u * u * (1.0 - 0.15 * t), z - 0.04 * u * u))
        rows.append(row)
    screen = shading.recalc_normals(K.build_loft('windscreen', rows))
    modify.solidify(screen, thickness=0.008, offset=0.0)
    top = [rows[-1][j] for j in range(11)]
    return [K.mat(screen, mats['glass']), K.tube('screen_rail', K.smooth(top, 2), 0.016,
                                                  mats['chrome'], 8)]


def body(mats):
    parts = []
    hull = K.hull_shell('hull', HULL, step=0.30)
    K.assign(hull, [mats['paint'], mats['secondary'], mats['bottom']], _hull_material)
    parts.append(hull)
    stern = K.transom('transom', HULL)
    K.assign(stern, [mats['paint'], mats['secondary'], mats['bottom']], _hull_material)
    parts.append(stern)
    # Rub rails along the sheer, gunwale caps, foredeck, cockpit sole, side liners.
    for side in (-1.0, 1.0):
        line = K.sheer_line(HULL, side, TRANSOM_Y, 4.70, drop=0.02)
        parts.append(K.tube(f'rub_rail_{side:+.0f}', line, 0.035, mats['rubbing'], 8))
        cap = K.sheer_line(HULL, side, TRANSOM_Y, 1.55, inset=0.10, drop=-0.005)
        parts.append(K.tube(f'gunwale_{side:+.0f}', cap, 0.07, mats['gelcoat'], 6))
    parts.append(K.mat(K.deck('foredeck', HULL, 1.45, 4.72, crown=0.06), mats['deck']))
    parts.append(K.box('sole', (2.26, 5.70, 0.05), (0.0, -1.42, SOLE_Z), mats['teak']))
    parts.append(K.box('aft_deck', (2.40, 0.55, 0.06), (0.0, -4.02, 0.62), mats['teak']))
    parts += windscreen(mats)

    # Helm console (starboard) and passenger console (port).
    hx, hy = HELM
    parts.append(K.box('helm', (0.74, 0.60, 0.80), (hx, hy, SOLE_Z + 0.40), mats['gelcoat'],
                       bevel=0.06))
    parts.append(K.box('helm_dash', (0.62, 0.36, 0.05), (hx, hy - 0.10, SOLE_Z + 0.86),
                       mats['trim'], rotation=(0.45, 0.0, 0.0), bevel=0.012))
    parts.append(K.box('helm_screen', (0.30, 0.012, 0.16), (hx - 0.05, hy - 0.24, SOLE_Z + 0.90),
                       mats['screen'], rotation=(0.45, 0.0, 0.0)))
    parts.append(K.rod('column', (WHEEL_HUB[0], WHEEL_HUB[1] + 0.20, WHEEL_HUB[2] - 0.15),
                       WHEEL_HUB, 0.025, mats['trim'], 8))
    parts.append(K.box('throttle_box', (0.10, 0.16, 0.10), (hx + 0.30, hy - 0.12,
                                                           SOLE_Z + 0.86),
                       mats['trim'], bevel=0.02))
    for k in (-1.0, 1.0):
        parts.append(K.rod(f'throttle_{k:+.0f}', (hx + 0.30 + 0.025 * k, hy - 0.12,
                                                  SOLE_Z + 0.90),
                           (hx + 0.30 + 0.025 * k, hy - 0.22, SOLE_Z + 1.06), 0.008,
                           mats['chrome'], 6))
    parts.append(K.box('passenger_console', (0.70, 0.55, 0.78), (-hx, hy, SOLE_Z + 0.39),
                       mats['gelcoat'], bevel=0.06))
    parts.append(K.tube('grab_rail', [(-hx - 0.28, hy - 0.22, SOLE_Z + 0.78),
                                      (-hx - 0.28, hy - 0.30, SOLE_Z + 0.95),
                                      (-hx + 0.28, hy - 0.30, SOLE_Z + 0.95),
                                      (-hx + 0.28, hy - 0.22, SOLE_Z + 0.78)], 0.014,
                        mats['chrome'], 6))

    # Helm seats and rear bench.
    for sx in (-1.0, 1.0):
        x = sx * hx
        parts.append(K.box(f'seat_base_{sx:+.0f}', (0.50, 0.50, 0.38), (x, -0.40, SOLE_Z + 0.19),
                           mats['gelcoat'], bevel=0.04))
        parts.append(K.box(f'seat_{sx:+.0f}', (0.58, 0.56, 0.16), (x, -0.42, SOLE_Z + 0.46),
                           mats['seat'], bevel=0.06))
        parts.append(K.box(f'seat_back_{sx:+.0f}', (0.58, 0.16, 0.56), (x, -0.74, SOLE_Z + 0.78),
                           mats['seat'], rotation=(-0.18, 0.0, 0.0), bevel=0.06))
    parts.append(K.box('bench_base', (2.20, 0.62, 0.36), (0.0, -3.32, SOLE_Z + 0.18),
                       mats['gelcoat'], bevel=0.04))
    parts.append(K.box('bench', (2.24, 0.64, 0.15), (0.0, -3.32, SOLE_Z + 0.43), mats['seat'],
                       bevel=0.06))
    parts.append(K.box('bench_back', (2.30, 0.18, 0.42), (0.0, -3.70, SOLE_Z + 0.70),
                       mats['seat'], rotation=(-0.20, 0.0, 0.0), bevel=0.06))

    # Swim platforms either side of the engines, ladder, stern light pole.
    for sx in (-1.0, 1.0):
        parts.append(K.box(f'platform_{sx:+.0f}', (0.62, 0.62, 0.07),
                           (sx * 0.92, TRANSOM_Y - 0.30, 0.20), mats['deck'], bevel=0.02))
    for k in range(3):
        parts.append(K.rod(f'ladder_{k}', (0.80, TRANSOM_Y - 0.58, 0.12 - 0.22 * k),
                           (1.05, TRANSOM_Y - 0.58, 0.12 - 0.22 * k), 0.012, mats['chrome'], 6))
    parts.append(K.rod('ladder_side', (0.80, TRANSOM_Y - 0.58, 0.20),
                       (0.80, TRANSOM_Y - 0.58, -0.35), 0.012, mats['chrome'], 6))
    parts.append(K.rod('light_pole', (-1.05, -3.95, 0.92), (-1.05, -3.95, 1.75), 0.018,
                       mats['chrome'], 8))
    parts.append(K.axis_cylinder('stern_light', 0.035, 0.07, (-1.05, -3.95, 1.79), 'Z',
                                 mats['lamp_tail'], 12))

    # Bow rail with stanchions, cleats, bow and side navigation lights.
    for sx in (-1.0, 1.0):
        rail = K.sheer_line(HULL, sx, 1.9, 4.45, inset=0.07, drop=-0.30)
        parts.append(K.tube(f'bow_rail_{sx:+.0f}', rail, 0.014, mats['chrome'], 8))
        for point in rail[::3]:
            parts.append(K.rod(f'stanchion_{sx:+.0f}_{point[1]:+.2f}',
                               (point[0], point[1], point[2] - 0.30), point, 0.011,
                               mats['chrome'], 6))
        for y in (2.2, -3.9):
            _k, _cx, _cz, sxh, szh = K.hull_station(HULL, y)
            parts.append(K.box(f'cleat_{sx:+.0f}_{y:+.1f}', (0.05, 0.20, 0.04),
                               (sx * (sxh - 0.12), y, szh + 0.04), mats['chrome'], bevel=0.012))
        lamp = mats['lamp_nav_red'] if sx < 0 else mats['lamp_nav_green']
        _k, _cx, _cz, sxh, szh = K.hull_station(HULL, 3.9)
        parts.append(K.box(f'nav_light_{sx:+.0f}', (0.02, 0.10, 0.05),
                           (sx * (sxh + 0.01), 3.9, szh - 0.10), lamp, bevel=0.006))
    parts.append(K.box('bow_fitting', (0.10, 0.30, 0.05), (0.0, 4.50, 1.33), mats['chrome'],
                       bevel=0.015))
    parts.append(K.axis_cylinder('bow_light', 0.03, 0.05, (0.0, 4.36, 1.37), 'Y',
                                 mats['lamp_head'], 12))
    return parts


def make(a):
    mats = materials()
    lod0 = scene.join(body(mats), 'lod0')
    shading.smooth(lod0, math.radians(35.0))
    parts = {'lod0': a.add(lod0, unwrap='smart')}
    for side, x in (('l', -ENGINE_X), ('r', ENGINE_X)):
        engine, propeller = K.outboard(side, x, TRANSOM_Y, mats)
        shading.smooth(engine, math.radians(40.0))
        shading.smooth(propeller, math.radians(40.0))
        parts[f'engine_{side}'] = a.add(engine, unwrap='smart')
        parts[f'propeller_{side}'] = a.add(propeller, unwrap='smart')
    wheel = K.steering_wheel_mesh('steering_wheel_mesh', WHEEL_HUB, COLUMN, mats)
    shading.smooth(wheel, math.radians(40.0))
    parts['steering_wheel_mesh'] = a.add(wheel, unwrap='smart')
    K.STATE[a.id] = {'parts': parts, 'spec': {'lod1': 3500, 'lod2': 900, 'column': COLUMN,
                                              'wheel_hub': WHEEL_HUB}}

    hip = SOLE_Z + 0.62
    a.add_anchor('anchor_seat_driver', (HELM[0], -0.36, hip), forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_seat_passenger_1', (-HELM[0], -0.36, hip), forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_seat_passenger_2', (-0.55, -3.22, SOLE_Z + 0.60),
                 forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_seat_passenger_3', (0.55, -3.22, SOLE_Z + 0.60), forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_board', (0.92, TRANSOM_Y - 0.30, 0.24), forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_wake', (0.0, TRANSOM_Y - 0.05, 0.0), forward=(0.0, -1.0, 0.0))
    for name, sx in (('anchor_spray_l', -1.0), ('anchor_spray_r', 1.0)):
        _k, cx, cz, _sx, _sz = K.hull_station(HULL, 2.2)
        a.add_anchor(name, (sx * (cx + 0.05), 2.2, cz), forward=(sx * 0.8, 0.6, 0.0))
    a.add_anchor('anchor_light_head_l', (0.0, 4.40, 1.37), forward=(0.0, 1.0, 0.0),
                 color=[1.0, 0.96, 0.90])
    a.add_anchor('anchor_light_tail_l', (-1.05, -3.95, 1.79), forward=(0.0, -1.0, 0.0),
                 color=[1.0, 0.96, 0.90])
    a.add_anchor('anchor_camera', (0.0, -1.2, 1.6), forward=(0.0, 1.0, 0.0))
    coarse = [K.section(HULL, y) for y in (-4.30, -2.0, 0.5, 2.6, 4.0, 4.75)]
    coarse = [[point for index, point in enumerate(ring) if index % 4 == 0 or index == len(ring)
               - 1] for ring in coarse]
    collider = shading.recalc_normals(K.build.loft('hull_proxy', coarse, closed=True,
                                                   cap_start=True, cap_end=True))
    a.collider_mesh('hull', collider, convex=True)
    a.set_extra('hull_length', 9.05)
    a.set_extra('overall_length', 9.80)
    a.set_extra('beam', 2.72)
    a.set_extra('draught', 0.45)
    a.set_extra('freeboard', 0.99)
    a.set_extra('seats', 4)
    a.set_lod_distances(60.0, 160.0)
    a.bake(size=1024, orm_size=512, normal_size=512, occlusion_distance=0.5,
           material_texels={'antifouling': 0.4, 'deck_nonslip': 0.8, 'engine_paint': 0.6,
                            'prop_steel': 0.5, 'screen_black': 0.3, 'rub_rail': 0.5})


def assemble(a):
    K.assemble_boat(a)
