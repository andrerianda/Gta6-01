"""sport_motorcycle: a full-fairing sport bike (catalogue: Rayo Centella), 2.06 m long, 1.42 m
wheelbase, 0.82 m seat, 120/70-17 front and 180/55-17 rear tyres.

Built with motorcycles/_bike.py. A sharp full fairing with a pointed nose and twin headlamps (the
lamp faces are cut from the fairing loft and covered by a pushed-out clear lens), a smoked
wrap-round screen, a humped tank, a stepped seat and a tiny upswept tail whose tip is the tail and
brake lamp. A twin-spar alloy frame, an inline-four with its radiator, four headers into a
collector under the engine and a link pipe to an under-seat silencer with twin outlets. Upside-down
fork with gold outer tubes, twin floating discs and radial calipers; a single-sided swingarm on the
right with the chain on the left; cast five-twin-spoke wheels on real tyre profiles. Clip-on bars
with levers, mirrors on the fairing, dash, footpegs for two, a folded side stand.

Faces +Y, origin on the ground midway between the axles. The fork is an empty on the steering axis
(rake 24 degrees, trail 0.10 m); its local Z runs up the axis, local X is the bike's right.
wheel_f (child of fork) and wheel_r (child of swingarm) have their origins at the hubs and spin
about X.

Budget: the body, fork, swingarm and two wheels are separate nodes with eight game materials
(atlas, paint, glass and five lamp groups): about 13 draws at level 0, within the vehicle default;
the triangle and byte caps are set to the brief's motorcycle targets.
"""
import math

from mathutils import Vector

from lib import materials as M
from lib import modify, scene, shading

import _bike as B

ASSET = {
    'id': 'sport_motorcycle',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 14000, 'draws': 14, 'bytes': 430000},
}

WHEELBASE = 1.42
AXLE_F = (0.0, 0.5 * WHEELBASE, 0.300)
AXLE_R = (0.0, -0.5 * WHEELBASE, 0.305)
RAKE = math.radians(24.0)
FORK_OFFSET = 0.031
PIVOT = (0.0, -0.25, 0.44)                     # swingarm pivot
SEAT_Z = 0.82

# Fairing: (y, half width, bottom, top, exponent).
FAIR = [
    (1.05, 0.022, 0.770, 0.795, 2.0),
    (0.98, 0.075, 0.712, 0.855, 2.0),
    (0.86, 0.130, 0.665, 0.915, 2.1),
    (0.72, 0.190, 0.640, 0.955, 2.3),
    (0.58, 0.228, 0.615, 0.925, 2.6),
    (0.46, 0.236, 0.500, 0.845, 2.8),
    (0.36, 0.215, 0.300, 0.800, 3.0),
    (0.24, 0.207, 0.185, 0.790, 3.0),
    (0.10, 0.200, 0.165, 0.730, 3.0),
    (-0.02, 0.175, 0.180, 0.620, 2.8),
    (-0.10, 0.100, 0.230, 0.500, 2.4),
]
# Tank, seat and tail.
TANK = [
    (0.36, 0.090, 0.740, 0.860, 2.2),
    (0.28, 0.170, 0.700, 0.980, 2.4),
    (0.14, 0.200, 0.680, 1.035, 2.6),
    (-0.02, 0.190, 0.680, 1.005, 2.6),
    (-0.16, 0.160, 0.700, 0.905, 2.6),
    (-0.28, 0.145, 0.700, 0.840, 3.0),
    (-0.46, 0.140, 0.700, 0.828, 3.0),
    (-0.60, 0.120, 0.720, 0.860, 2.8),
    (-0.72, 0.110, 0.750, 0.925, 2.6),
    (-0.88, 0.090, 0.780, 0.958, 2.4),
    (-1.00, 0.070, 0.800, 0.962, 2.4),
    (-1.05, 0.052, 0.820, 0.952, 2.2),
]


def materials():
    lamp = M.lamp
    return {
        'paint': M.car_paint(color=M.hex_color('#C8281E'), metallic_flake=0.25, gloss=0.9,
                             dirt=0.2, seed=41, name='paint'),
        'trim': M.plastic(color=(0.022, 0.022, 0.024), roughness=0.5, seed=42,
                          name='trim_plastic'),
        'seat': M.leather(color=(0.025, 0.025, 0.027), grain=0.5, wear_amount=0.25, seed=43,
                          name='seat_leather'),
        'frame': M.cast_metal(color=(0.09, 0.09, 0.095), roughness=0.4, rust=0.0, seed=44,
                              name='frame_alloy'),
        'engine': M.cast_metal(color=(0.05, 0.05, 0.055), roughness=0.5, rust=0.02, seed=45,
                               name='engine_black'),
        'cover': M.cast_metal(color=(0.30, 0.30, 0.31), roughness=0.35, rust=0.0, seed=46,
                              name='cover_alloy'),
        'chrome': M.chrome(seed=47, name='chrome'),
        'exhaust': M.cast_metal(color=(0.22, 0.17, 0.13), roughness=0.5, rust=0.3, seed=48,
                                name='exhaust_metal'),
        'tip': M.cast_metal(color=(0.08, 0.08, 0.085), roughness=0.35, rust=0.0, seed=49,
                            name='exhaust_tip'),
        'grille': M.cast_metal(color=(0.03, 0.03, 0.032), roughness=0.6, rust=0.0, seed=50,
                               name='grille_metal'),
        'tyre': M.rubber(seed=51, name='tyre_rubber'),
        'rim': M.cast_metal(color=(0.035, 0.035, 0.038), roughness=0.3, rust=0.0, seed=52,
                            name='rim_black'),
        'hub': M.cast_metal(color=(0.25, 0.25, 0.26), roughness=0.4, rust=0.0, seed=53,
                            name='hub_alloy'),
        'disc': M.brushed_metal(color=(0.55, 0.55, 0.56), roughness=0.3, direction='Z',
                                seed=54, name='disc_steel'),
        'sprocket': M.cast_metal(color=(0.12, 0.12, 0.125), roughness=0.45, rust=0.1, seed=55,
                                 name='sprocket_steel'),
        'chain': M.cast_metal(color=(0.07, 0.065, 0.06), roughness=0.55, rust=0.25, seed=56,
                              name='chain_steel'),
        'caliper': M.painted_metal(color=M.hex_color('#B8862B'), gloss=0.75, chips=0.1,
                                   rust=0.0, grime=0.3, dust=0.2, fade=0.05, seed=57,
                                   name='caliper_paint'),
        'fork': M.painted_metal(color=(0.46, 0.31, 0.07), gloss=0.85, chips=0.05, rust=0.0,
                                grime=0.15, dust=0.15, fade=0.0, seed=58, name='fork_anodised'),
        'spring': M.painted_metal(color=(0.75, 0.55, 0.05), gloss=0.7, chips=0.1, rust=0.0,
                                  grime=0.3, dust=0.2, fade=0.05, seed=59, name='spring_paint'),
        'plate': M.painted_metal(color=(0.75, 0.74, 0.70), gloss=0.5, chips=0.1, rust=0.0,
                                 grime=0.3, dust=0.3, fade=0.1, seed=60, name='plate_paint'),
        'screen': M.plastic(color=(0.008, 0.01, 0.014), roughness=0.08, grain=0.0, scuffs=0.05,
                            seed=61, name='screen_black'),
        'grip': M.rubber(color=(0.02, 0.02, 0.022), seed=62, name='grip_rubber'),
        'glass': M.glass(tint=(0.32, 0.36, 0.38), opacity=0.38, seed=63, name='glass'),
        'lamp_head': lamp(color=(1.0, 0.95, 0.88), strength=9.0, seed=64, name='lamp_head'),
        'lamp_tail': lamp(color=(1.0, 0.07, 0.04), strength=5.0, seed=65, name='lamp_tail'),
        'lamp_brake': lamp(color=(1.0, 0.05, 0.03), strength=9.0, seed=66, name='lamp_brake'),
        'lamp_indicator_l': lamp(color=(1.0, 0.45, 0.05), strength=7.0, seed=67,
                                 name='lamp_indicator_l'),
        'lamp_indicator_r': lamp(color=(1.0, 0.45, 0.05), strength=7.0, seed=68,
                                 name='lamp_indicator_r'),
    }


def leg_point(x, s):
    """A point on a fork leg's centre line, s metres up the leg from the axle."""
    return (x, AXLE_F[1] - math.sin(RAKE) * s, AXLE_F[2] + math.cos(RAKE) * s)


def axis_point(z):
    """The steering axis at height z (it lies FORK_OFFSET behind the legs' line)."""
    y0 = AXLE_F[1] - math.cos(RAKE) * FORK_OFFSET
    z0 = AXLE_F[2] - math.sin(RAKE) * FORK_OFFSET
    s = (z - z0) / math.cos(RAKE)
    return (0.0, y0 - math.sin(RAKE) * s, z)


def _fairing_material(centre, normal):
    """Index into [paint, trim, lamp_head, lamp_indicator_l, lamp_indicator_r]."""
    rel = B.rel_height(FAIR, centre)
    y, side = centre.y, abs(centre.x)
    if y > 0.925 and 0.36 < rel < 0.74 and side > 0.016:
        return 2
    if y > 0.885 and 0.24 < rel < 0.84:
        return 1                                        # black mask round the lamps
    if y > 0.95 and rel < 0.24:
        return 1                                        # ram-air intake
    if 0.68 < y < 0.72 and 0.55 < rel < 0.60 and abs(normal.x) > 0.6:
        return 3 if centre.x < 0 else 4                 # flush front indicators
    if 0.06 < y < 0.30 and 0.34 < rel < 0.58 and abs(normal.x) > 0.55:
        return 1                                        # side vents
    if rel < 0.08 and y < 0.40:
        return 1                                        # belly pan
    return 0


def _tank_material(centre, normal):
    """Index into [paint, trim, seat, lamp_tail, lamp_brake]."""
    rel = B.rel_height(TANK, centre)
    y = centre.y
    if y < -0.985 and normal.y < -0.35:
        return 3 if rel > 0.45 else 4
    if -0.64 < y < -0.19 and rel > 0.60:
        return 2
    if -0.88 < y < -0.66 and rel > 0.70:
        return 2
    if rel < 0.10:
        return 1
    return 0


def windscreen(mats):
    rows = []
    for i in range(5):
        t = i / 4.0
        y, z, half = 0.80 - 0.22 * t, 0.948 + 0.15 * t, 0.165 * (1.0 - 0.3 * t)
        row = []
        for j in range(9):
            u = -1.0 + 2.0 * j / 8.0
            row.append((half * u, y + 0.035 * u * u, z - 0.075 * u * u * (1.0 - 0.3 * t)))
        rows.append(row)
    screen = shading.recalc_normals(B.build_loft('windscreen', rows))
    modify.solidify(screen, thickness=0.003, offset=0.0)
    return B.mat(screen, mats['glass'])


def body(mats):
    """The static body: fairing, tank and tail, frame, engine, exhaust, controls."""
    parts = []
    fairing = B.pod('fairing', FAIR, step=0.045)
    B.assign(fairing, [mats['paint'], mats['trim'], mats['lamp_head'], mats['lamp_indicator_l'],
                       mats['lamp_indicator_r']], _fairing_material)
    parts += [fairing, B.lens_over(fairing, 'head_lens', {'lamp_head'}, mats['glass'], 0.004)]
    tank = B.pod('tank', TANK, step=0.045)
    B.assign(tank, [mats['paint'], mats['trim'], mats['seat'], mats['lamp_tail'],
                    mats['lamp_brake']], _tank_material)
    parts += [tank, B.lens_over(tank, 'tail_lens', {'lamp_tail', 'lamp_brake'}, mats['glass'],
                                0.004)]
    parts.append(windscreen(mats))

    # Frame: steering head, twin spars, pivot plates, subframe rails.
    parts.append(B.rod('head_tube', axis_point(0.74), axis_point(0.97), 0.036, mats['frame'], 14))
    for sx in (-1.0, 1.0):
        # Tall flat box-section spars along the tank's lower edge (sections: y, x, z, w, h).
        spar = [(0.45, sx * 0.05, 0.80, 0.020, 0.050), (0.31, sx * 0.15, 0.76, 0.022, 0.060),
                (0.10, sx * 0.178, 0.72, 0.022, 0.060), (-0.10, sx * 0.178, 0.62, 0.022, 0.058),
                (-0.24, sx * 0.168, 0.50, 0.022, 0.050)]
        parts.append(B.beam(f'spar_{sx:+.0f}', spar, mats['frame']))
        parts.append(B.box(f'pivot_plate_{sx:+.0f}', (0.034, 0.17, 0.40),
                           (sx * 0.168, -0.235, 0.46), mats['frame'], bevel=0.012))
        parts.append(B.rod(f'subframe_{sx:+.0f}', (sx * 0.12, -0.22, 0.66),
                           (sx * 0.075, -0.94, 0.82), 0.013, mats['frame'], 8))
    parts.append(B.axis_cylinder('pivot_bolt', 0.022, 0.40, PIVOT, 'X', mats['cover'], 12))

    # Engine: crankcase, gearbox, forward-tilted cylinder block and head, covers, sump, radiator.
    parts.append(B.box('crankcase', (0.40, 0.42, 0.20), (0.0, -0.02, 0.32), mats['engine'],
                       bevel=0.025))
    parts.append(B.box('gearbox', (0.30, 0.18, 0.22), (0.0, -0.18, 0.40), mats['engine'],
                       bevel=0.02))
    parts.append(B.box('cylinders', (0.36, 0.18, 0.22), (0.0, 0.12, 0.50), mats['engine'],
                       rotation=(-0.52, 0.0, 0.0), bevel=0.015))
    parts.append(B.box('head', (0.34, 0.17, 0.10), (0.0, 0.20, 0.64), mats['cover'],
                       rotation=(-0.52, 0.0, 0.0), bevel=0.02))
    for k in range(4):
        parts.append(B.box(f'fin_{k}', (0.37, 0.19, 0.008), (0.0, 0.11 + 0.025 * k,
                                                              0.44 + 0.045 * k),
                           mats['engine'], rotation=(-0.52, 0.0, 0.0)))
    parts.append(B.axis_cylinder('clutch_cover', 0.090, 0.030, (0.212, -0.06, 0.33), 'X',
                                 mats['cover'], 20))
    parts.append(B.axis_cylinder('alternator_cover', 0.075, 0.030, (-0.212, 0.02, 0.32), 'X',
                                 mats['cover'], 20))
    parts.append(B.axis_cylinder('sprocket_cover', 0.055, 0.030, (-0.170, -0.13, 0.40), 'X',
                                 mats['engine'], 16))
    parts.append(B.axis_cylinder('front_sprocket', 0.045, 0.008, (-0.095, -0.13, 0.40), 'X',
                                 mats['sprocket'], 16))
    parts.append(B.box('sump', (0.24, 0.24, 0.06), (0.0, 0.04, 0.20), mats['engine'],
                       bevel=0.015))
    parts.append(B.box('radiator', (0.40, 0.05, 0.28), (0.0, 0.33, 0.50), mats['grille'],
                       rotation=(-0.17, 0.0, 0.0), bevel=0.006))

    # Exhaust: four headers into a collector under the engine, a link pipe up past the
    # swingarm to an under-seat silencer with twin outlets under the tail.
    for k, hx in enumerate((-0.15, -0.05, 0.05, 0.15)):
        path = [(hx, 0.25, 0.52), (hx * 0.95, 0.34, 0.40), (hx * 0.8, 0.33, 0.26),
                (hx * 0.5, 0.24, 0.18), (0.03, 0.05, 0.175)]
        parts.append(B.tube(f'header_{k}', B.smooth(path, 2), 0.019, mats['exhaust'], 8))
    link = [(0.03, 0.05, 0.175), (0.07, -0.16, 0.175), (0.115, -0.34, 0.27),
            (0.115, -0.52, 0.52), (0.07, -0.66, 0.70)]
    parts.append(B.tube('link_pipe', B.smooth(link, 2), 0.036, mats['exhaust'], 10))
    parts.append(B.box('silencer', (0.17, 0.34, 0.10), (0.0, -0.80, 0.735), mats['tip'],
                       bevel=0.025))
    for sx in (-1.0, 1.0):
        parts.append(B.axis_cylinder(f'outlet_{sx:+.0f}', 0.030, 0.05,
                                     (sx * 0.045, -0.975, 0.735), 'Y', mats['tip'], 14))
        parts.append(B.axis_cylinder(f'outlet_bore_{sx:+.0f}', 0.022, 0.004,
                                     (sx * 0.045, -1.001, 0.735), 'Y', mats['grille'], 12))

    # Rear shock.
    parts.append(B.rod('shock_rod', (0.0, -0.36, 0.40), (0.0, -0.17, 0.66), 0.012,
                       mats['chrome'], 8))
    parts.append(B.rod('shock_spring', (0.0, -0.31, 0.47), (0.0, -0.21, 0.605), 0.034,
                       mats['spring'], 12))

    # Footpegs, hangers, levers, side stand.
    for sx in (-1.0, 1.0):
        parts.append(B.box(f'hanger_{sx:+.0f}', (0.012, 0.13, 0.10), (sx * 0.19, -0.30, 0.38),
                           mats['frame'], bevel=0.004))
        parts.append(B.rod(f'peg_{sx:+.0f}', (sx * 0.19, -0.33, 0.34), (sx * 0.26, -0.33, 0.34),
                           0.011, mats['hub'], 8))
        parts.append(B.rod(f'pillion_hanger_{sx:+.0f}', (sx * 0.12, -0.50, 0.68),
                           (sx * 0.17, -0.59, 0.46), 0.011, mats['frame'], 8))
        parts.append(B.rod(f'pillion_peg_{sx:+.0f}', (sx * 0.17, -0.60, 0.455),
                           (sx * 0.23, -0.60, 0.455), 0.010, mats['hub'], 8))
    parts.append(B.rod('gear_lever', (-0.20, -0.27, 0.36), (-0.215, -0.15, 0.375), 0.007,
                       mats['hub'], 6))
    parts.append(B.rod('brake_pedal', (0.20, -0.27, 0.35), (0.215, -0.15, 0.33), 0.007,
                       mats['hub'], 6))
    parts.append(B.rod('side_stand', (-0.16, -0.17, 0.30), (-0.205, -0.44, 0.215), 0.012,
                       mats['engine'], 8))

    # Plate hanger, blank plate, rear indicators.
    parts.append(B.rod('plate_arm', (0.0, -0.90, 0.79), (0.0, -1.055, 0.66), 0.018,
                       mats['trim'], 8))
    parts.append(B.box('plate_holder', (0.20, 0.008, 0.15), (0.0, -1.065, 0.625), mats['trim'],
                       rotation=(-0.12, 0.0, 0.0), bevel=0.004))
    parts.append(B.box('plate', (0.175, 0.004, 0.115), (0.0, -1.071, 0.625), mats['plate'],
                       rotation=(-0.12, 0.0, 0.0)))
    for sx, lamp in ((-1.0, 'lamp_indicator_l'), (1.0, 'lamp_indicator_r')):
        parts.append(B.rod(f'rear_stalk_{sx:+.0f}', (sx * 0.02, -1.05, 0.70),
                           (sx * 0.12, -1.05, 0.70), 0.007, mats['trim'], 6))
        parts.append(B.box(f'rear_indicator_{sx:+.0f}', (0.035, 0.03, 0.018),
                           (sx * 0.135, -1.05, 0.70), mats[lamp], bevel=0.005))

    # Mirrors and dash.
    for sx in (-1.0, 1.0):
        parts.append(B.rod(f'mirror_stalk_{sx:+.0f}', (sx * 0.215, 0.68, 0.90),
                           (sx * 0.30, 0.655, 0.965), 0.008, mats['trim'], 6))
        parts.append(B.box(f'mirror_{sx:+.0f}', (0.105, 0.035, 0.056), (sx * 0.325, 0.645, 0.985),
                           mats['trim'], rotation=(0.0, 0.0, sx * 0.12), bevel=0.012))
        parts.append(B.box(f'mirror_glass_{sx:+.0f}', (0.088, 0.004, 0.042),
                           (sx * 0.325, 0.626, 0.985), mats['chrome'],
                           rotation=(0.0, 0.0, sx * 0.12)))
    parts.append(B.box('dash', (0.17, 0.05, 0.10), (0.0, 0.60, 0.965), mats['trim'],
                       rotation=(-0.95, 0.0, 0.0), bevel=0.01))
    parts.append(B.box('dash_screen', (0.12, 0.004, 0.065), (0.0, 0.585, 0.985), mats['screen'],
                       rotation=(-0.95, 0.0, 0.0)))
    return parts


def fork_mesh(mats):
    """The steered assembly, in place: legs, clamps, stem, clip-ons, levers, mudguard,
    calipers."""
    parts = []
    tilt = (RAKE, 0.0, 0.0)
    back = Vector((0.0, -math.cos(RAKE), -math.sin(RAKE)))
    for sx in (-1.0, 1.0):
        x = sx * 0.105
        parts.append(B.box(f'foot_{sx:+.0f}', (0.05, 0.06, 0.10), leg_point(x, 0.02),
                           mats['engine'], rotation=tilt, bevel=0.008))
        parts.append(B.rod(f'stanchion_{sx:+.0f}', leg_point(x, 0.04), leg_point(x, 0.36),
                           0.0215, mats['chrome'], 14))
        parts.append(B.rod(f'outer_tube_{sx:+.0f}', leg_point(x, 0.30), leg_point(x, 0.715),
                           0.0275, mats['fork'], 14))
        parts.append(B.rod(f'fork_cap_{sx:+.0f}', leg_point(x, 0.715), leg_point(x, 0.735),
                           0.020, mats['hub'], 10))
        # Radial caliper behind the leg, straddling the disc.
        hub = Vector(AXLE_F)
        centre = hub + Vector((sx * 0.068, -0.090, 0.092))
        parts.append(B.box(f'caliper_{sx:+.0f}', (0.048, 0.045, 0.110), tuple(centre),
                           mats['caliper'], rotation=(-math.pi / 4, 0.0, 0.0), bevel=0.01))
        # Clip-on, grip, lever.
        start = Vector(leg_point(x, 0.66))
        end = start + Vector((sx * 0.235, -0.07, -0.04))
        parts.append(B.rod(f'clip_on_{sx:+.0f}', tuple(start), tuple(end), 0.011, mats['hub'], 8))
        g0, g1 = start.lerp(end, 0.50), start.lerp(end, 1.02)
        parts.append(B.rod(f'grip_{sx:+.0f}', tuple(g0), tuple(g1), 0.017, mats['grip'], 10))
        parts.append(B.rod(f'lever_{sx:+.0f}', tuple(g0 + Vector((0.0, 0.035, 0.0))),
                           tuple(start.lerp(end, 0.98) + Vector((0.0, 0.065, -0.008))),
                           0.0045, mats['hub'], 6))
        parts.append(B.box(f'lever_perch_{sx:+.0f}', (0.03, 0.04, 0.03),
                           tuple(g0 + Vector((0.0, 0.012, 0.0))), mats['engine'], bevel=0.005))
    for s, name in ((0.70, 'top_clamp'), (0.52, 'bottom_clamp')):
        centre = Vector(leg_point(0.0, s)) + back * 0.016
        parts.append(B.box(name, (0.27, 0.085, 0.032), tuple(centre), mats['frame'],
                           rotation=tilt, bevel=0.012))
    parts.append(B.rod('stem', axis_point(0.76), axis_point(0.96), 0.019, mats['hub'], 10))
    parts.append(B.axis_cylinder('reservoir', 0.018, 0.04, (0.17, 0.43, 0.94), 'Z',
                                 mats['trim'], 10))
    parts.append(B.axis_cylinder('front_axle', 0.012, 0.25, AXLE_F, 'X', mats['hub'], 10))
    # Front mudguard hugging the tyre from the front to behind the top.
    rings = []
    cross = ((-0.072, -0.034), (-0.066, -0.004), (-0.040, 0.009), (0.0, 0.013), (0.040, 0.009),
             (0.066, -0.004), (0.072, -0.034))
    for i in range(10):
        phi = math.radians(28.0 + (118.0 - 28.0) * i / 9.0)
        u = Vector((0.0, math.cos(phi), math.sin(phi)))
        rings.append([tuple(Vector(AXLE_F) + Vector((x, 0.0, 0.0)) + (0.322 + r) * u)
                      for x, r in cross])
    guard = shading.recalc_normals(B.build_loft('mudguard', rings))
    modify.solidify(guard, thickness=0.004, offset=0.0)
    parts.append(B.mat(guard, mats['paint']))
    return scene.join(parts, 'fork_mesh')


def swingarm(mats):
    """Single-sided arm on the right, pivot tube, rear caliper, the chain on the left."""
    parts = [
        B.beam('arm', [(-0.20, 0.140, 0.445, 0.030, 0.050), (-0.32, 0.148, 0.425, 0.027, 0.060),
                       (-0.50, 0.150, 0.375, 0.024, 0.052), (-0.66, 0.144, 0.322, 0.024, 0.046),
                       (-0.73, 0.140, 0.305, 0.026, 0.050)], mats['frame']),
        B.axis_cylinder('arm_pivot', 0.034, 0.34, PIVOT, 'X', mats['frame'], 14),
        B.axis_cylinder('hub_carrier', 0.078, 0.05, (0.118, AXLE_R[1], AXLE_R[2]), 'X',
                        mats['frame'], 22),
        B.axis_cylinder('hub_nut', 0.035, 0.03, (0.155, AXLE_R[1], AXLE_R[2]), 'X',
                        mats['hub'], 6),
        B.box('rear_caliper', (0.040, 0.05, 0.085), (0.072, AXLE_R[1] + 0.075,
                                                      AXLE_R[2] + 0.065),
              mats['caliper'], rotation=(math.pi / 4, 0.0, 0.0), bevel=0.008),
        B.rod('chain_top', (-0.090, -0.13, 0.447), (-0.090, AXLE_R[1], AXLE_R[2] + 0.102),
              0.008, mats['chain'], 4),
        B.rod('chain_bottom', (-0.090, -0.13, 0.353), (-0.090, AXLE_R[1], AXLE_R[2] - 0.102),
              0.008, mats['chain'], 4),
        B.box('chain_guard', (0.012, 0.30, 0.05), (-0.085, -0.36, 0.475), mats['trim'],
              rotation=(0.06, 0.0, 0.0), bevel=0.004),
    ]
    arm = scene.join(parts, 'swingarm')
    scene.set_origin(arm, PIVOT)
    return arm


def make(a):
    mats = materials()
    lod0 = scene.join(body(mats), 'lod0')
    shading.smooth(lod0, math.radians(40.0))
    parts = {'lod0': a.add(lod0, unwrap='smart')}
    fork = fork_mesh(mats)
    shading.smooth(fork, math.radians(40.0))
    parts['fork_mesh'] = a.add(fork, unwrap='smart')
    arm = swingarm(mats)
    shading.smooth(arm, math.radians(40.0))
    parts['swingarm'] = a.add(arm, unwrap='smart')
    # 28 segments: round enough at the chase camera, lighter at every level (the wheels show
    # at all three).
    front = B.wheel('wheel_f', {'hub': AXLE_F, 'radius': 0.300, 'rim': 0.216, 'width': 0.122,
                                'rim_width': 0.090, 'discs': [(-0.068, 0.155, 0.105),
                                                              (0.068, 0.155, 0.105)],
                                'segments': 28}, mats)
    rear = B.wheel('wheel_r', {'hub': AXLE_R, 'radius': 0.305, 'rim': 0.216, 'width': 0.180,
                               'rim_width': 0.140, 'discs': [(0.074, 0.110, 0.075)],
                               'sprocket': (-0.090, 0.105), 'segments': 28}, mats)
    for name, obj in (('wheel_f', front), ('wheel_r', rear)):
        shading.smooth(obj, math.radians(35.0))
        parts[name] = a.add(obj, unwrap='smart')

    grip_start = Vector(leg_point(0.105, 0.66))
    grip = grip_start.lerp(grip_start + Vector((0.235, -0.07, -0.04)), 0.76)
    B.STATE[a.id] = {
        'parts': parts,
        'spec': {'lod1': 2400, 'lod2': 520, 'steer_axis': (0.0, -math.sin(RAKE), math.cos(RAKE)),
                 'steer_pivot': axis_point(0.80),
                 'grips': {'anchor_grip_l': (-grip.x, grip.y, grip.z),
                           'anchor_grip_r': (grip.x, grip.y, grip.z)}},
    }

    a.add_anchor('anchor_seat_driver', (0.0, -0.40, SEAT_Z + 0.09), forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_seat_passenger_1', (0.0, -0.76, 0.93 + 0.09), forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_foot_l', (-0.235, -0.33, 0.35), forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_foot_r', (0.235, -0.33, 0.35), forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_stand', (-0.78, -0.20, 0.0), forward=(1.0, 0.0, 0.0))
    a.add_anchor('anchor_light_head_l', (-0.055, 1.00, 0.78), forward=(0.0, 1.0, -0.03),
                 light='spot', range=45.0, angle=28.0, color=[1.0, 0.95, 0.88])
    a.add_anchor('anchor_light_tail_l', (0.0, -1.06, 0.89), forward=(0.0, -1.0, 0.0),
                 color=[1.0, 0.07, 0.04])
    a.add_anchor('anchor_exhaust_1', (0.045, -1.00, 0.735), forward=(0.0, -1.0, 0.0))
    a.add_anchor('anchor_camera', (0.0, -0.20, 1.05), forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_plate_r', (0.0, -1.075, 0.625), forward=(0.0, -1.0, 0.0), width=0.175,
                 height=0.115)
    a.collider_box('body', (0.0, 0.0, 0.58), (0.66, 2.06, 1.02))
    a.set_extra('wheelbase', WHEELBASE)
    a.set_extra('wheel_radius_f', 0.300)
    a.set_extra('wheel_radius_r', 0.305)
    a.set_extra('seat_height', SEAT_Z)
    a.set_extra('rake_degrees', 24.0)
    a.set_extra('trail', 0.10)
    a.set_extra('seats', 2)
    a.set_lod_distances(25.0, 60.0)
    a.bake(size=1024, orm_size=512, normal_size=512, occlusion_distance=0.25,
           material_texels={'tyre_rubber': 0.6, 'chain_steel': 0.4, 'sprocket_steel': 0.4,
                            'grille_metal': 0.5, 'engine_black': 0.7, 'screen_black': 0.3})


def assemble(a):
    B.assemble_bike(a)
