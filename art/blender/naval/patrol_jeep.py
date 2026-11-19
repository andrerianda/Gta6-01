"""Patrol jeep of the Marazul army (an original design): an open-topped 4x4 of flat folded panels,
3.95 m long, 1.76 m wide, 1.88 m over the roll bar, wheelbase 2.40 m, track 1.46 m, wheels 0.40 m.
Angular fenders beside a narrow slotted nose, low half doors, a folding-frame windscreen, a roll
hoop with rear braces, a spare wheel and a jerry can on the tail, a whip antenna. Matt olive with
sand blotches: the tintable `paint` carries the sand tone, the olive is baked in (see camo_paint).

The road-vehicle contract of the fleet (game/src/assets/registry/vehicles.js): origin on the ground
at the centre of the wheelbase, front towards +Y here (the game's -Z), the driver on the left (-X).
"""
import _naval_parts as np_
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'patrol_jeep', 'atlas': 1024, 'kind': 'vehicle', 'views': ((38, 16, 1.15), (212, 24, 1.15))}

HALF_BASE, HALF_TRACK, RADIUS = 1.2, 0.73, 0.40


def make(a, work_dir):
    paint = np_.camo_paint('paint', '#a8996b')
    steel = np_.matt('steel_dark', '#262822', 0.7, 0.5, 0.4)
    olive = np_.matt('olive_parts', '#3c4229', 0.8, 0.45)
    floor_mat = np_.matt('floor', '#2f3128', 0.85, 0.6)
    recess = sf.plain('recess', '#101110', 0.8)
    canvas = sf.fabric('seat_canvas', '#6a684b')
    tyre = sf.rubber('tyre', '#161616')
    hub = np_.matt('hub', '#454a33', 0.7, 0.4)
    glass = sf.glass('glass', '#1c2a2c', 0.3)
    head = sf.lamp('lamp_head', '#fff2d8', 3.0)
    tail = sf.lamp('lamp_tail', '#b81410', 1.5)
    brake = sf.lamp('lamp_brake', '#e01a12', 3.0)
    reverse = sf.lamp('lamp_reverse', '#f2f2ea', 2.0)
    indicator_l = sf.lamp('lamp_indicator_l', '#ff9a1c', 2.5)
    indicator_r = sf.lamp('lamp_indicator_r', '#ff9a1c', 2.5)

    # --- body shell (paint) --------------------------------------------------------------------
    quarter = np_.extrude_x('quarter', [(-1.80, 0.55), (-1.80, 1.08), (-0.55, 1.08), (-0.55, 0.46), (-0.72, 0.46),
                                         (-0.90, 0.90), (-1.50, 0.90), (-1.68, 0.55)], 0.80, 0.86)
    fender = np_.extrude_x('fender', [(0.42, 0.50), (0.70, 0.94), (1.62, 0.94), (1.80, 0.70), (1.80, 0.66), (1.60, 0.90),
                                       (0.72, 0.90), (0.46, 0.50)], 0.50, 0.88)
    sill = mk.box('sill', (0.06, 0.95, 0.16), (0.83, -0.075, 0.54))
    well = mk.box('wheel_box', (0.31, 1.06, 0.38), (0.645, -1.2, 0.75))
    side = [mk.assign(np_.both(p.name, p), paint) for p in (quarter, fender, sill, well)]
    nose = mk.assign(np_.extrude_x('nose', [(0.42, 0.50), (0.42, 1.10), (1.70, 1.02), (1.76, 0.96), (1.76, 0.50)], -0.52, 0.52), paint)
    cowl = mk.assign(mk.box('cowl', (1.72, 0.16, 0.54), (0, 0.38, 0.84)), paint)
    rear = mk.assign(mk.box('rear_panel', (1.72, 0.06, 0.53), (0, -1.77, 0.815)), paint)
    slats = np_.boxes('grille_slats', paint, [((0.035, 0.03, 0.36), (x * 0.085, 1.775, 0.80)) for x in range(-3, 4)])
    grille = mk.assign(mk.box('grille', (0.62, 0.02, 0.36), (0, 1.762, 0.80)), recess)

    # --- frame, floor, running gear (atlas) ----------------------------------------------------
    floor = np_.boxes('floor', floor_mat, [((1.62, 2.26, 0.06), (0, -0.67, 0.55)), ((1.5, 0.05, 0.3), (0, 0.29, 0.92)),
                                           ((1.5, 0.22, 0.05), (0, 0.2, 1.06))])
    chassis = np_.boxes('chassis', steel, [((0.08, 3.5, 0.12), (-0.38, 0, 0.44)), ((0.08, 3.5, 0.12), (0.38, 0, 0.44)),
                                           ((0.5, 0.9, 0.28), (0, 0.9, 0.5)), ((0.3, 0.5, 0.2), (0.12, -1.35, 0.5)),
                                           ((0.22, 0.26, 0.22), (0.1, 1.2, 0.38)), ((0.22, 0.26, 0.22), (0.1, -1.2, 0.38))])
    axles = [mk.assign(mk.tube('axle', [(-0.62, y, RADIUS), (0.62, y, RADIUS)], 0.05, 8), steel) for y in (-HALF_BASE, HALF_BASE)]
    hoop = mk.assign(mk.tube('roll_hoop', [(-0.76, -0.55, 1.05), (-0.76, -0.55, 1.72), (-0.68, -0.55, 1.85), (0.68, -0.55, 1.85),
                                           (0.76, -0.55, 1.72), (0.76, -0.55, 1.05)], 0.03, 8), olive)
    braces = [mk.assign(mk.tube('roll_brace', [(x, -0.58, 1.76), (x, -1.70, 1.09)], 0.025, 6), olive) for x in (-0.75, 0.75)]
    frame = mk.transform(np_.boxes('screen_frame', olive, [
        ((0.045, 0.04, 0.62), (-0.76, 0, 0.31)), ((0.045, 0.04, 0.62), (0.76, 0, 0.31)), ((1.56, 0.04, 0.045), (0, 0, 0.60)),
        ((1.56, 0.04, 0.06), (0, 0, 0.03)), ((0.03, 0.04, 0.58), (0, 0, 0.31)),
        ((0.12, 0.02, 0.16), (-0.9, 0.0, 0.42)), ((0.12, 0.02, 0.16), (0.9, 0.0, 0.42)),
        ((0.14, 0.015, 0.015), (-0.82, 0, 0.44)), ((0.14, 0.015, 0.015), (0.82, 0, 0.44))]), (0, 0.44, 1.11), (12, 0, 0))
    seats = [np_.seat('seat_l', -0.38, -0.2, 0.78, canvas), np_.seat('seat_r', 0.38, -0.2, 0.78, canvas),
             np_.seat('bench', 0.0, -1.2, 0.74, canvas, 0.96, 0.42)]
    bases = np_.boxes('seat_bases', steel, [((0.4, 0.4, 0.2), (-0.38, -0.18, 0.68)), ((0.4, 0.4, 0.2), (0.38, -0.18, 0.68)),
                                            ((0.94, 0.4, 0.16), (0, -1.18, 0.66))])
    cabin_bits = [mk.assign(mk.tube('gear_lever', [(0.02, 0.05, 0.58), (0.0, -0.02, 0.92)], 0.012, 5), steel),
                  mk.assign(mk.box('radio', (0.26, 0.42, 0.24), (0.645, -0.95, 1.06), 0.015), olive)]
    spare = mk.transform(np_.wheel('spare', RADIUS, 0.24, tyre, hub), (0.2, -1.93, 1.0), (0, 0, -90))
    jerry = np_.boxes('jerry_can', np_.matt('jerry', '#414a2a', 0.7, 0.4), [((0.34, 0.15, 0.46), (-0.52, -1.885, 0.86))], 0.035)
    jerry_bits = np_.boxes('jerry_bits', steel, [((0.07, 0.07, 0.05), (-0.62, -1.885, 1.11)), ((0.14, 0.03, 0.03), (-0.5, -1.885, 1.12)),
                                                 ((0.38, 0.19, 0.03), (-0.52, -1.885, 0.86)), ((0.3, 0.1, 0.1), (0.2, -1.84, 1.0))])
    antenna = mk.assign(mk.tube('antenna_whip', [(0.8, -1.66, 1.08), (0.8, -1.66, 1.3), (0.8, -1.7, 2.2), (0.8, -1.82, 3.0)],
                                [0.022, 0.012, 0.008, 0.005], 5), steel)
    lamps = [
        mk.assign(mk.cylinder('head_l', 0.085, 0.05, (-0.41, 1.775, 0.84), 'Y', 14), head),
        mk.assign(mk.cylinder('head_r', 0.085, 0.05, (0.41, 1.775, 0.84), 'Y', 14), head),
        mk.assign(mk.box('ind_fl', (0.1, 0.03, 0.06), (-0.69, 1.80, 0.74)), indicator_l),
        mk.assign(mk.box('ind_fr', (0.1, 0.03, 0.06), (0.69, 1.80, 0.74)), indicator_r),
        mk.assign(mk.box('ind_rl', (0.09, 0.03, 0.07), (-0.72, -1.81, 0.72)), indicator_l),
        mk.assign(mk.box('ind_rr', (0.09, 0.03, 0.07), (0.72, -1.81, 0.72)), indicator_r),
        np_.boxes('tails', tail, [((0.09, 0.03, 0.07), (-0.72, -1.81, 0.98)), ((0.09, 0.03, 0.07), (0.72, -1.81, 0.98))]),
        np_.boxes('brakes', brake, [((0.09, 0.03, 0.07), (-0.72, -1.81, 0.88)), ((0.09, 0.03, 0.07), (0.72, -1.81, 0.88))]),
        mk.assign(mk.box('reverse', (0.08, 0.03, 0.06), (0.55, -1.81, 0.68)), reverse),
    ]
    whole = side + [nose, cowl, rear, slats, grille, floor, chassis, hoop, frame, bases, spare, jerry, jerry_bits, antenna] \
        + axles + braces + seats + cabin_bits + lamps
    for part in whole:
        mk.shade(part, 40)
    a.add(mk.join('lod0', whole))

    # --- moving parts (children of lod0) -------------------------------------------------------
    for name, sx, sy in (('wheel_fl', -1, 1), ('wheel_fr', 1, 1), ('wheel_rl', -1, -1), ('wheel_rr', 1, -1)):
        obj = np_.wheel(name, RADIUS, 0.25, tyre, hub)
        if sx < 0:
            mk.transform(obj, scale=(-1, 1, 1))
        a.part(np_.placed(obj, (sx * HALF_TRACK, sy * HALF_BASE, RADIUS)))
    door = mk.join('door_fr', [mk.assign(mk.box('door_skin', (0.05, 0.93, 0.46), (0.83, -0.075, 0.85), 0.008, 1), paint),
                               mk.assign(mk.box('door_handle', (0.02, 0.12, 0.03), (0.862, -0.42, 0.98)), steel)])
    door_l = np_.mirror_copy(door, 'door_fl')
    a.part(np_.pivot(mk.shade(door, 40), (0.83, 0.40, 0.85)))
    a.part(np_.pivot(mk.shade(door_l, 40), (-0.83, 0.40, 0.85)))
    hood = mk.assign(np_.extrude_x('hood', [(0.42, 1.10), (0.42, 1.14), (1.71, 1.06), (1.70, 1.02)], -0.53, 0.53), paint)
    a.part(np_.pivot(hood, (0, 0.42, 1.12)))
    bumper_f = np_.boxes('bumper_f', steel, [((1.62, 0.1, 0.14), (0, 1.88, 0.56)), ((0.08, 0.14, 0.1), (-0.38, 1.80, 0.52)),
                                             ((0.08, 0.14, 0.1), (0.38, 1.80, 0.52)), ((0.05, 0.1, 0.12), (-0.6, 1.96, 0.56)),
                                             ((0.05, 0.1, 0.12), (0.6, 1.96, 0.56))])
    a.part(np_.pivot(bumper_f, (0, 1.88, 0.56)))
    bumper_r = np_.boxes('bumper_r', steel, [((0.34, 0.12, 0.14), (-0.56, -1.87, 0.54)), ((0.34, 0.12, 0.14), (0.56, -1.87, 0.54)),
                                             ((0.1, 0.16, 0.1), (0, -1.86, 0.48))])
    a.part(np_.pivot(bumper_r, (0, -1.87, 0.54)))
    pane = mk.transform(mk.assign(mk.box('window_front', (1.47, 0.008, 0.53), (0, 0, 0.325)), glass), (0, 0.44, 1.11), (12, 0, 0))
    a.part(np_.pivot(pane, (0, 0.37, 1.43)))
    a.part(np_.placed(np_.steering_wheel('steering_wheel', 0.19, steel), (-0.38, 0.1, 1.17), (62, 0, 0)))

    # --- anchors, collision, extras ------------------------------------------------------------
    a.anchor('seat_driver', (-0.38, -0.2, 0.96))
    a.anchor('seat_passenger_1', (0.38, -0.2, 0.96))
    a.anchor('seat_passenger_2', (-0.27, -1.2, 0.92))
    a.anchor('seat_passenger_3', (0.27, -1.2, 0.92))
    a.anchor('door_driver', (-1.5, -0.1, 0.0), (0, 0, -90))
    a.anchor('door_passenger', (1.5, -0.1, 0.0), (0, 0, 90))
    a.anchor('light_head_l', (-0.41, 1.81, 0.84))
    a.anchor('light_head_r', (0.41, 1.81, 0.84))
    a.anchor('light_tail_l', (-0.72, -1.83, 0.93), (0, 0, 180))
    a.anchor('light_tail_r', (0.72, -1.83, 0.93), (0, 0, 180))
    a.anchor('exhaust_1', (0.5, -1.8, 0.42), (0, 0, 180))
    a.anchor('camera', (0.0, -0.2, 1.8))
    a.anchor('plate_f', (0.0, 1.94, 0.56))
    a.anchor('plate_r', (-0.1, -1.81, 0.68), (0, 0, 180))
    a.anchor('decal_door_l', (-0.86, -0.075, 0.85), (0, 0, 90), width=0.8, height=0.4)
    a.anchor('decal_door_r', (0.86, -0.075, 0.85), (0, 0, -90), width=0.8, height=0.4)
    a.collider_box('body', (1.76, 3.9, 0.72), (0, 0.0, 0.76))
    a.collider_box('cabin', (1.6, 1.3, 0.75), (0, -0.1, 1.48))
    a.extra('wheel_radius', RADIUS)
    a.extra('track', 2 * HALF_TRACK)
    a.extra('wheelbase', 2 * HALF_BASE)
    a.extra('seats', 4)
    moving = ['door_fl', 'door_fr', 'hood', 'window_front']
    wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']
    a.level(1, [('lod0', 0.34)] + [(n, 1.0) for n in moving] + [(n, 0.45) for n in wheels] + [('bumper_f', 0.5), ('bumper_r', 0.5)])
    a.level(2, [('lod0', 0.09)] + [(n, 1.0) for n in moving] + [(n, 0.2) for n in wheels])
    a.distances(35.0, 95.0)
