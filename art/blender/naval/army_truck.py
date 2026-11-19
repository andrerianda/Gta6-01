"""Army cargo truck (an original design): a 6x6 with a short angular bonnet, a flat-panel cab and a
canvas tilt over a drop-side bed. 7.45 m long, 2.50 m wide, 3.12 m over the tilt (cab roof 2.66 m),
front axle to rear axle 4.60 m, the middle axle 1.35 m ahead of the rear one, track 2.04 m, wheels
0.55 m. Matt olive (tintable `paint`), olive-drab canvas.

The road-vehicle contract of the fleet (game/src/assets/registry/trucks.js): origin on the ground at
the centre of the wheelbase, front towards +Y here (the game's -Z), the driver on the left (-X). The
fleet drives four wheels: wheel_rl / wheel_rr are the REAR axle of the bogie, the middle axle's
wheels are part of the body (lod0) and do not turn.
"""
import math

import _naval_parts as np_
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'army_truck', 'atlas': 1024, 'kind': 'vehicle', 'views': ((38, 14, 1.1), (210, 22, 1.1))}

FRONT, MIDDLE, REAR, HALF_TRACK, RADIUS, TYRE = 2.3, -0.95, -2.3, 1.02, 0.55, 0.34
RAKE = 33.0


def tilt_ring(y, sag):
    """The canvas cross-section at station y; sag (0..1) lets it hang between the hoops."""
    outline = [(-1.24, 2.0), (-1.25, 2.4), (-1.24, 2.78), (-1.05, 3.0), (-0.55, 3.1), (0.0, 3.13),
               (0.55, 3.1), (1.05, 3.0), (1.24, 2.78), (1.25, 2.4), (1.24, 2.0)]
    points = []
    for x, z in outline:
        high = max(0.0, (z - 2.0) / 1.13)
        points.append((x * (1.0 - 0.018 * sag * math.sin(math.pi * high)), y, z - 0.05 * sag * high * high))
    return points


def make(a, work_dir):
    paint = sf.paint('#4d5234', 'paint', 0.82, None, 'side', 0.3)
    steel = np_.matt('steel_dark', '#24261f', 0.7, 0.5, 0.4)
    olive = np_.matt('olive_parts', '#3a4028', 0.82, 0.45)
    canvas = sf.coated('canvas', '#4b4d33', 0.95, 0.0, 0.55, grain=0.1)
    floor_mat = np_.matt('floor', '#2d2f27', 0.85, 0.6)
    recess = sf.plain('recess', '#101110', 0.8)
    cloth = sf.fabric('seat_canvas', '#5c5b43')
    tyre = sf.rubber('tyre', '#161616')
    hub = np_.matt('hub', '#434831', 0.7, 0.4)
    glass = sf.glass('glass', '#1c2a2c', 0.34)
    head = sf.lamp('lamp_head', '#fff2d8', 3.0)
    tail = sf.lamp('lamp_tail', '#b81410', 1.5)
    brake = sf.lamp('lamp_brake', '#e01a12', 3.0)
    reverse = sf.lamp('lamp_reverse', '#f2f2ea', 2.0)
    indicator_l = sf.lamp('lamp_indicator_l', '#ff9a1c', 2.5)
    indicator_r = sf.lamp('lamp_indicator_r', '#ff9a1c', 2.5)

    # --- bonnet, fenders, cab shell, bed (paint) -----------------------------------------------
    nose = mk.assign(np_.extrude_x('nose', [(2.33, 1.0), (2.33, 2.02), (3.45, 1.92), (3.62, 1.78), (3.62, 1.0)], -0.72, 0.72), paint)
    fender = np_.extrude_x('fender', [(1.55, 1.0), (1.85, 1.5), (2.9, 1.5), (3.3, 1.12), (3.3, 1.05), (2.88, 1.44), (1.87, 1.44), (1.62, 1.0)], 0.72, 1.23)
    fenders = mk.assign(np_.both('fenders', fender), paint)
    shell = np_.boxes('cab_shell', paint, [
        ((2.3, 0.06, 1.46), (0, 0.88, 1.93)), ((2.3, 1.14, 0.06), (0, 1.42, 2.63)), ((2.3, 0.06, 0.8), (0, 2.32, 1.62)),
        ((0.06, 0.12, 1.4), (-1.12, 0.9, 1.93)), ((0.06, 0.12, 1.4), (1.12, 0.9, 1.93))])
    cab_floor = np_.boxes('cab_floor', floor_mat, [((2.3, 1.5, 0.06), (0, 1.6, 1.22)), ((2.1, 0.3, 0.3), (0, 2.12, 1.86)),
                                                   ((2.1, 0.5, 0.32), (0, 1.3, 1.41))])
    frame = mk.transform(np_.boxes('screen_frame', paint, [
        ((0.07, 0.05, 0.74), (-1.115, 0, 0.36)), ((0.07, 0.05, 0.74), (1.115, 0, 0.36)), ((2.3, 0.05, 0.06), (0, 0, 0.71)),
        ((2.3, 0.05, 0.05), (0, 0, 0.02)), ((0.05, 0.05, 0.7), (0, 0, 0.36))]), (0, 2.34, 2.02), (RAKE, 0, 0))
    bed = np_.boxes('bed', paint, [((0.06, 4.07, 0.6), (-1.21, -1.585, 1.76)), ((0.06, 4.07, 0.6), (1.21, -1.585, 1.76)),
                                   ((2.44, 0.06, 0.9), (0, 0.42, 1.91)), ((2.44, 0.06, 0.6), (0, -3.6, 1.76))])
    bed_floor = mk.assign(mk.box('bed_floor', (2.44, 4.07, 0.1), (0, -1.585, 1.42)), floor_mat)
    ribs = np_.boxes('bed_ribs', olive, [((0.05, 0.09, 0.62), (sx * 1.255, y, 1.76)) for sx in (-1, 1) for y in (-3.4, -2.5, -1.6, -0.7, 0.2)]
                     + [((0.09, 0.05, 0.62), (x, -3.645, 1.76)) for x in (-0.8, 0.0, 0.8)])

    # --- canvas tilt ---------------------------------------------------------------------------
    stations = [-3.62 + 4.07 * i / 8 for i in range(9)]
    tilt = mk.loft('tilt', [tilt_ring(y, 0.0 if i % 2 == 0 else 1.0) for i, y in enumerate(stations)])
    mk.assign(tilt, canvas)
    straps = np_.boxes('tilt_straps', olive, [((0.02, 0.05, 0.42), (sx * 1.26, y, 2.2)) for sx in (-1, 1) for y in (-3.1, -2.1, -1.1, -0.1)]
                       + [((0.03, 0.02, 1.0), (0.0, -3.635, 2.55)), ((0.5, 0.02, 0.04), (0.0, -3.635, 2.3))])

    # --- frame, running gear, fittings (atlas) -------------------------------------------------
    chassis = np_.boxes('chassis', steel, [
        ((0.1, 7.0, 0.22), (-0.42, -0.1, 1.0)), ((0.1, 7.0, 0.22), (0.42, -0.1, 1.0)), ((0.9, 0.1, 0.18), (0, -3.3, 1.0)),
        ((0.9, 1.1, 0.5), (0, 2.6, 1.0)), ((0.34, 0.4, 0.34), (0.1, FRONT, 0.56)), ((0.34, 0.4, 0.34), (0.1, MIDDLE, 0.56)),
        ((0.34, 0.4, 0.34), (0.1, REAR, 0.56)), ((0.12, 1.9, 0.1), (-0.7, -1.62, 0.82)), ((0.12, 1.9, 0.1), (0.7, -1.62, 0.82)),
        ((0.34, 0.9, 0.42), (0.98, 0.3, 1.02)), ((0.34, 0.5, 0.05), (-1.02, 1.3, 0.82)), ((0.34, 0.5, 0.05), (1.02, 1.3, 0.82)),
        ((0.5, 0.03, 0.5), (-1.0, -3.0, 0.98)), ((0.5, 0.03, 0.5), (1.0, -3.0, 0.98))])
    axles = [mk.assign(mk.tube('axle', [(-0.86, y, RADIUS), (0.86, y, RADIUS)], 0.07, 8), steel) for y in (FRONT, MIDDLE, REAR)]
    tank = mk.assign(mk.cylinder('fuel_tank', 0.27, 1.0, (-0.95, 0.3, 1.0), 'Y', 14), olive)
    stack = mk.assign(mk.tube('exhaust_stack', [(1.0, 0.66, 1.05), (1.0, 0.66, 2.85), (1.0, 0.6, 2.95)], [0.06, 0.06, 0.055], 8), steel)
    hatch = mk.assign(mk.cylinder('roof_hatch', 0.34, 0.05, (0.5, 1.4, 2.68), 'Z', 14), olive)
    mirrors = np_.boxes('mirrors', steel, [((0.03, 0.14, 0.3), (-1.36, 2.2, 2.25)), ((0.03, 0.14, 0.3), (1.36, 2.2, 2.25)),
                                           ((0.26, 0.02, 0.02), (-1.24, 2.22, 2.3)), ((0.26, 0.02, 0.02), (1.24, 2.22, 2.3))])
    seats = [np_.seat('seat_l', -0.58, 1.38, 1.57, cloth, 0.56, 0.6), np_.seat('seat_r', 0.52, 1.38, 1.57, cloth, 0.9, 0.6)]
    grille = mk.assign(mk.box('grille', (0.96, 0.02, 0.5), (0, 3.622, 1.42)), recess)
    slats = np_.boxes('grille_slats', paint, [((1.0, 0.03, 0.04), (0, 3.635, 1.22 + 0.1 * i)) for i in range(5)])
    middle_wheels = []
    for sx in (-1, 1):
        obj = np_.wheel('middle_wheel', RADIUS, TYRE, tyre, hub)
        middle_wheels.append(mk.transform(obj, (sx * HALF_TRACK, MIDDLE, RADIUS), scale=(sx, 1, 1)))
    lamps = [
        mk.assign(mk.cylinder('head_l', 0.1, 0.05, (-0.56, 3.63, 1.5), 'Y', 14), head),
        mk.assign(mk.cylinder('head_r', 0.1, 0.05, (0.56, 3.63, 1.5), 'Y', 14), head),
        mk.assign(mk.box('ind_fl', (0.12, 0.03, 0.07), (-1.0, 3.3, 1.2)), indicator_l),
        mk.assign(mk.box('ind_fr', (0.12, 0.03, 0.07), (1.0, 3.3, 1.2)), indicator_r),
        mk.assign(mk.box('ind_rl', (0.1, 0.03, 0.08), (-1.1, -3.64, 1.3)), indicator_l),
        mk.assign(mk.box('ind_rr', (0.1, 0.03, 0.08), (1.1, -3.64, 1.3)), indicator_r),
        np_.boxes('tails', tail, [((0.1, 0.03, 0.08), (-0.98, -3.64, 1.3)), ((0.1, 0.03, 0.08), (0.98, -3.64, 1.3))]),
        np_.boxes('brakes', brake, [((0.1, 0.03, 0.08), (-0.86, -3.64, 1.3)), ((0.1, 0.03, 0.08), (0.86, -3.64, 1.3))]),
        mk.assign(mk.box('reverse', (0.1, 0.03, 0.07), (0.7, -3.64, 1.3)), reverse),
    ]
    whole = [nose, fenders, shell, cab_floor, frame, bed, bed_floor, ribs, tilt, straps, chassis, tank, stack, hatch, mirrors, grille, slats] \
        + axles + seats + middle_wheels + lamps
    for part in whole:
        mk.shade(part, 40)
    a.add(mk.join('lod0', whole))

    # --- moving parts (children of lod0) -------------------------------------------------------
    for name, sx, y in (('wheel_fl', -1, FRONT), ('wheel_fr', 1, FRONT), ('wheel_rl', -1, REAR), ('wheel_rr', 1, REAR)):
        obj = np_.wheel(name, RADIUS, TYRE, tyre, hub)
        if sx < 0:
            mk.transform(obj, scale=(-1, 1, 1))
        a.part(np_.placed(obj, (sx * HALF_TRACK, y, RADIUS)))
    skin = mk.assign(np_.extrude_x('door_skin', [(0.96, 1.25), (0.96, 2.02), (2.3, 2.02), (2.3, 1.25)], 1.10, 1.15), paint)
    bars = np_.boxes('door_frame', paint, [((0.05, 0.06, 0.6), (1.125, 0.99, 2.31)), ((0.05, 1.04, 0.05), (1.125, 1.47, 2.585)),
                                           ((0.05, 0.05, 0.7), (1.125, 2.13, 2.3), (RAKE, 0, 0))])
    pane = mk.assign(np_.extrude_x('door_glass', [(1.02, 2.02), (1.02, 2.56), (1.95, 2.56), (2.27, 2.04)], 1.12, 1.128), glass)
    handle = mk.assign(mk.box('door_handle', (0.02, 0.14, 0.03), (1.16, 1.1, 1.9)), steel)
    door = mk.shade(mk.join('door_fr', [skin, bars, pane, handle]), 40)
    door_l = np_.mirror_copy(door, 'door_fl')
    a.part(np_.pivot(door, (1.125, 2.3, 1.63)))
    a.part(np_.pivot(door_l, (-1.125, 2.3, 1.63)))
    hood = mk.assign(np_.extrude_x('hood', [(2.33, 2.02), (2.33, 2.06), (3.46, 1.96), (3.45, 1.92)], -0.73, 0.73), paint)
    a.part(np_.pivot(hood, (0, 2.33, 2.04)))
    bumper_f = np_.boxes('bumper_f', steel, [((2.4, 0.14, 0.26), (0, 3.72, 1.0)), ((0.5, 0.2, 0.2), (0, 3.7, 1.22)),
                                             ((0.06, 0.12, 0.16), (-0.9, 3.84, 1.0)), ((0.06, 0.12, 0.16), (0.9, 3.84, 1.0))])
    a.part(np_.pivot(bumper_f, (0, 3.72, 1.0)))
    bumper_r = np_.boxes('bumper_r', steel, [((2.2, 0.1, 0.14), (0, -3.66, 0.95)), ((0.12, 0.2, 0.16), (0, -3.72, 1.0)),
                                             ((0.08, 0.1, 0.3), (-0.42, -3.62, 1.05)), ((0.08, 0.1, 0.3), (0.42, -3.62, 1.05))])
    a.part(np_.pivot(bumper_r, (0, -3.66, 0.95)))
    screen = mk.transform(mk.assign(mk.box('window_front', (2.18, 0.008, 0.66), (0, 0, 0.365)), glass), (0, 2.34, 2.02), (RAKE, 0, 0))
    a.part(np_.pivot(screen, (0, 2.14, 2.33)))
    a.part(np_.placed(np_.steering_wheel('steering_wheel', 0.23, steel), (-0.58, 1.84, 2.0), (38, 0, 0)))

    # --- anchors, collision, extras ------------------------------------------------------------
    a.anchor('seat_driver', (-0.58, 1.38, 1.76))
    a.anchor('seat_passenger_1', (0.55, 1.38, 1.76))
    a.anchor('seat_passenger_2', (-0.85, -1.2, 1.95), (0, 0, -90))
    a.anchor('seat_passenger_3', (0.85, -1.2, 1.95), (0, 0, 90))
    a.anchor('door_driver', (-1.95, 1.6, 0.0), (0, 0, -90))
    a.anchor('door_passenger', (1.95, 1.6, 0.0), (0, 0, 90))
    a.anchor('door_rear', (0.0, -4.6, 0.0))
    a.anchor('cargo', (0.0, -1.585, 1.47))
    a.anchor('light_head_l', (-0.56, 3.67, 1.5))
    a.anchor('light_head_r', (0.56, 3.67, 1.5))
    a.anchor('light_tail_l', (-0.98, -3.67, 1.3), (0, 0, 180))
    a.anchor('light_tail_r', (0.98, -3.67, 1.3), (0, 0, 180))
    a.anchor('exhaust_1', (1.0, 0.6, 2.97), (90, 0, 0))
    a.anchor('camera', (0.0, 0.0, 2.75))
    a.anchor('plate_f', (0.0, 3.8, 1.0))
    a.anchor('plate_r', (0.0, -3.72, 0.95), (0, 0, 180))
    a.anchor('decal_side_l', (-1.27, -1.585, 2.45), (0, 0, 90), width=3.0, height=0.6)
    a.anchor('decal_side_r', (1.27, -1.585, 2.45), (0, 0, -90), width=3.0, height=0.6)
    a.collider_box('cab', (2.4, 1.55, 1.75), (0, 1.6, 1.8))
    a.collider_box('nose', (2.46, 1.45, 1.15), (0, 3.07, 1.45))
    a.collider_box('body', (2.5, 4.3, 2.25), (0, -1.55, 2.0))
    a.extra('wheel_radius', RADIUS)
    a.extra('track', 2 * HALF_TRACK)
    a.extra('wheelbase', FRONT - REAR)
    a.extra('middle_axle', -MIDDLE)
    a.extra('seats', 4)
    moving = ['door_fl', 'door_fr', 'hood', 'window_front']
    wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']
    a.level(1, [('lod0', 0.34)] + [(n, 1.0) for n in moving] + [(n, 0.45) for n in wheels] + [('bumper_f', 0.5), ('bumper_r', 0.5)])
    a.level(2, [('lod0', 0.09)] + [(n, 1.0) for n in moving] + [(n, 0.2) for n in wheels])
    a.distances(40.0, 110.0)
