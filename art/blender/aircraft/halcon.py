"""Halcón: the single-seat interceptor of the Marazul Air Guard (15.8 m long, 9.6 m span, 4.7 m to
the fin tip), exterior only. An original design: a pointed radome over a chin intake, a cropped
cranked-delta wing with leading-edge extensions and wingtip rails, low all-moving tailplanes, one
tall swept fin, a dark bubble canopy and a single afterburning nozzle. Two-tone sea grey.

Blender axes: nose to +Y, right wing to +X, wheels on Z = 0 with the gear down, the origin on the
ground under the centre of gravity (catalog flight.layout: nose wheel 4.2 m ahead, mains 0.9 m
behind and 1.4 m out, the eye at 3.6 ahead and 2.75 up, the nozzle 7.3 m behind and 1.7 m up).
"""
import _airframe_parts as ap
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'halcon', 'atlas': 2048}

COUNT = 28
EYE = (0.0, 3.6, 2.75)
WING_Z = 1.72

BODY = [
    {'y': -6.85, 'w': 1.0, 'h': 1.0, 'z': 1.7, 'power': 2.0},
    {'y': -6.3, 'w': 1.15, 'h': 1.15, 'z': 1.72, 'power': 2.1},
    {'y': -4.5, 'w': 1.4, 'h': 1.3, 'z': 1.78, 'power': 2.4},
    {'y': -2.0, 'w': 1.6, 'h': 1.4, 'z': 1.85, 'power': 2.8},
    {'y': 0.5, 'w': 1.6, 'h': 1.4, 'z': 1.9, 'power': 2.8},
    {'y': 2.2, 'w': 1.3, 'h': 1.35, 'z': 1.98, 'power': 2.5},
    {'y': 3.4, 'w': 1.15, 'h': 1.3, 'z': 2.0, 'power': 2.3},
    {'y': 4.4, 'w': 1.05, 'h': 1.2, 'z': 2.0, 'power': 2.2},
    {'y': 5.2, 'w': 0.95, 'h': 1.05, 'z': 1.97, 'power': 2.1},
    {'y': 6.4, 'w': 0.7, 'h': 0.75, 'z': 1.95, 'power': 2.0},
    {'y': 7.6, 'w': 0.34, 'h': 0.36, 'z': 1.95, 'power': 2.0},
    {'y': 8.2, 'w': 0.09, 'h': 0.09, 'z': 1.95, 'power': 2.0},
]
INTAKE = [
    {'y': 0.2, 'w': 0.9, 'h': 0.3, 'z': 1.38, 'power': 2.4},
    {'y': 1.5, 'w': 1.1, 'h': 0.6, 'z': 1.4, 'power': 2.8},
    {'y': 3.5, 'w': 1.02, 'h': 0.62, 'z': 1.4, 'power': 3.0},
    {'y': 4.75, 'w': 0.9, 'h': 0.56, 'z': 1.42, 'power': 3.2},
]
SPINE = [
    {'y': -3.6, 'w': 0.28, 'h': 0.2, 'z': 2.4}, {'y': -1.0, 'w': 0.46, 'h': 0.4, 'z': 2.42},
    {'y': 1.2, 'w': 0.5, 'h': 0.42, 'z': 2.5}, {'y': 2.1, 'w': 0.5, 'h': 0.36, 'z': 2.56},
]
CANOPY = [
    {'y': 1.8, 'w': 0.2, 'h': 0.1, 'z': 2.56}, {'y': 2.2, 'w': 0.6, 'h': 0.5, 'z': 2.58},
    {'y': 2.8, 'w': 0.86, 'h': 0.86, 'z': 2.6}, {'y': 3.5, 'w': 0.9, 'h': 0.96, 'z': 2.62},
    {'y': 4.2, 'w': 0.76, 'h': 0.62, 'z': 2.62}, {'y': 4.75, 'w': 0.3, 'h': 0.1, 'z': 2.6},
]
WING = [
    {'x': 0.0, 'y': 2.4, 'z': WING_Z, 'chord': 5.3, 'thickness': 0.045, 'camber': 0.0},
    {'x': 0.75, 'y': 2.4, 'z': WING_Z, 'chord': 5.3, 'thickness': 0.045, 'camber': 0.0},
    {'x': 2.0, 'y': 0.6, 'z': WING_Z, 'chord': 3.4, 'thickness': 0.045, 'camber': 0.0},
    {'x': 4.7, 'y': -1.4, 'z': WING_Z - 0.03, 'chord': 1.1, 'thickness': 0.04, 'camber': 0.0},
]
STRAKE = [
    {'x': 0.0, 'y': 4.5, 'z': WING_Z + 0.02, 'chord': 3.6, 'thickness': 0.028, 'camber': 0.0},
    {'x': 0.62, 'y': 4.3, 'z': WING_Z + 0.02, 'chord': 3.4, 'thickness': 0.028, 'camber': 0.0},
    {'x': 1.05, 'y': 2.9, 'z': WING_Z + 0.02, 'chord': 1.7, 'thickness': 0.03, 'camber': 0.0},
]
STABILATOR = [
    {'x': 0.6, 'y': -4.7, 'z': 1.62, 'chord': 2.3, 'thickness': 0.04, 'camber': 0.0},
    {'x': 2.6, 'y': -6.3, 'z': 1.6, 'chord': 0.9, 'thickness': 0.04, 'camber': 0.0},
]
FIN = [
    {'x': 0.0, 'y': -3.3, 'z': 2.38, 'chord': 3.5, 'thickness': 0.04, 'camber': 0.0, 'cant': 90.0},
    {'x': 0.0, 'y': -6.0, 'z': 4.7, 'chord': 1.05, 'thickness': 0.035, 'camber': 0.0, 'cant': 90.0},
]
FLAP_FROM = 0.78


def make(a):
    top = sf.coated('grey_top', '#77838c', 0.5, 0.05, 0.35, panels=(1.4, 0.7), projection='top')
    side = sf.coated('grey_side', '#77838c', 0.5, 0.05, 0.35, panels=(1.3, 0.6), projection='side')
    under = sf.coated('grey_under', '#b3bcc2', 0.5, 0.05, 0.3, panels=(1.4, 0.7), projection='top')
    radome = sf.coated('radome', '#4a5157', 0.42, 0.0, 0.2)
    dark = sf.coated('dark_metal', '#17191b', 0.55, 0.5, 0.4)
    hot = sf.bare_metal('nozzle_metal', '#6a5d52', 0.42, 0.6, panels=(0.5, 0.16), projection='side')
    steel = sf.bare_metal('gear_steel', '#b4b8bc', 0.35, 0.3)
    tyre = sf.rubber()
    glass = sf.glass('glass', '#11181d', 0.62)

    def two_tone(obj, upper):
        mk.assign(obj, upper)
        mk.assign_faces(obj, under, lambda c, n: n.z < -0.3)
        return obj

    # --- fuselage, chin intake, spine, nozzle (the unmirrored level-0 mesh) ---------------------
    body = mk.fuselage('body', BODY, COUNT)
    mk.assign(body, side)
    mk.assign_faces(body, top, lambda c, n: n.z > 0.75)
    mk.assign_faces(body, under, lambda c, n: n.z < -0.3)
    mk.assign_faces(body, radome, lambda c, n: c.y > 6.3)
    mk.assign_faces(body, dark, lambda c, n: n.y < -0.95 and c.y < -6.8)
    mk.subdivide(body, 1)
    intake = mk.fuselage('intake', INTAKE, 20)
    mk.assign(intake, under)
    mk.assign_faces(intake, dark, lambda c, n: n.y > 0.95 and c.y > 4.7)
    mk.subdivide(intake, 1)
    lip = mk.assign(mk.tube('intake_lip', [p for p in mk.ring(4.76, 0.84, 0.5, 1.42, 0.0, 20, 3.2)] + [mk.ring(4.76, 0.84, 0.5, 1.42, 0.0, 20, 3.2)[0]], 0.03, 6), side)
    spine = mk.subdivide(mk.assign(mk.fuselage('spine', SPINE, 12), top), 1)
    nozzle = mk.cylinder('nozzle', 0.43, 0.55, (0, -7.03, 1.7), 'Y', 28, 0.52)
    mk.assign(nozzle, hot)
    mk.assign_faces(nozzle, dark, lambda c, n: n.y < -0.9)
    burner = mk.assign(mk.cylinder('burner', 0.33, 0.012, (0, -7.31, 1.7), 'Y', 24), sf.lamp('lamp_burner', '#ffb060', 6.0))
    pitot = mk.assign(mk.tube('pitot', [(0, 8.1, 1.95), (0, 8.5, 1.95)], [0.03, 0.008], 8), steel)
    fin = mk.assign(ap.surface('fin', FIN, 0.0, 0.72, 10), side)
    fin_root = mk.assign(ap.surface('fin_root', ap.cut(FIN, 2.38, 2.58, 'z'), 0.72, 1.0, 4), side)
    fin_tip = mk.assign(ap.surface('fin_tip', ap.cut(FIN, 4.17, 4.7, 'z'), 0.72, 1.0, 4), side)
    fin_cap = mk.assign(mk.box('fin_cap', (0.07, 0.95, 0.12), (0, -6.5, 4.69), 0.02), radome)
    tub = mk.assign(mk.box('tub', (0.6, 1.9, 0.03), (0, 3.3, 2.63), 0.01), dark)
    seat = ap.seat('seat', 0.0, 3.35, 1.95, sf.fabric('seat_fabric', '#2c3136'), dark, 0.4, 0.2, 0.62)
    hoop_ring = mk.ring(4.18, 0.78, 0.64, 2.62, 0.0, 24)
    hoop = mk.assign(mk.tube('windscreen_hoop', [p for p in hoop_ring if p[2] >= 2.6], 0.022, 6), dark)
    lamps = [
        ap.lamp_bulb('nav_red', (-4.75, -0.9, WING_Z - 0.03), sf.lamp('lamp_nav_red', '#ff2a1a', 4.0), (0.08, 0.14, 0.08)),
        ap.lamp_bulb('nav_green', (4.75, -0.9, WING_Z - 0.03), sf.lamp('lamp_nav_green', '#2bff6a', 4.0), (0.08, 0.14, 0.08)),
        ap.lamp_bulb('beacon', (0.0, 0.4, 2.74), sf.lamp('lamp_beacon', '#ff2a1a', 5.0), (0.09, 0.14, 0.07)),
        ap.lamp_bulb('strobe', (0.0, -7.02, 4.6), sf.lamp('lamp_strobe', '#f4f6ff', 6.0), (0.05, 0.08, 0.08)),
    ]
    whole = [body, intake, lip, spine, nozzle, burner, pitot, fin, fin_root, fin_tip, fin_cap, tub, hoop] + seat + lamps
    for part in whole:
        mk.shade(part, 42)
    a.add(mk.join('lod0', whole))

    # --- wing half with its extension and tip rail: mirrored after the bake ---------------------
    half = [
        two_tone(ap.surface('wing_main', WING, 0.0, FLAP_FROM, 12), top),
        two_tone(ap.surface('wing_te_root', ap.cut(WING, 0.0, 0.82), FLAP_FROM, 1.0, 4), top),
        two_tone(ap.surface('wing_te_tip', ap.cut(WING, 4.52, 4.7), FLAP_FROM, 1.0, 4), top),
        two_tone(ap.surface('strake', STRAKE, 0.0, 1.0, 10), top),
        mk.assign(mk.tube('rail', [(4.75, -0.72, WING_Z - 0.03), (4.75, -0.95, WING_Z - 0.03), (4.75, -2.75, WING_Z - 0.03), (4.75, -2.9, WING_Z - 0.03)],
                          [0.012, 0.05, 0.05, 0.03], 10), dark),
    ]
    for part in half:
        mk.shade(part, 42)
    a.add(mk.join('wing_lod0', half), mirror=True)

    # --- control surfaces ----------------------------------------------------------------------
    for name, x0, x1 in (('flap', 0.85, 2.6), ('aileron', 2.65, 4.5)):
        sections = ap.cut(WING, x0, x1)
        right = mk.shade(two_tone(ap.surface(name + '_r', sections, FLAP_FROM, 1.0, 5), top), 42)
        left = ap.mirror_copy(right, name + '_l')
        pivot = ap.hinge(ap.cut(WING, 0.5 * (x0 + x1), x1)[0], FLAP_FROM)
        a.add(mk.set_origin(right, pivot))
        a.add(mk.set_origin(left, (-pivot[0], pivot[1], pivot[2])))
    stab_r = mk.shade(two_tone(ap.surface('stabilator_r', STABILATOR, 0.0, 1.0, 10), top), 42)
    stab_l = ap.mirror_copy(stab_r, 'stabilator_l')
    a.add(mk.set_origin(stab_r, (0.6, -5.85, 1.62)))
    a.add(mk.set_origin(stab_l, (-0.6, -5.85, 1.62)))
    rudder = mk.shade(mk.assign(ap.surface('rudder', ap.cut(FIN, 2.6, 4.15, 'z'), 0.72, 1.0, 5), side), 42)
    a.add(mk.set_origin(rudder, ap.hinge(FIN[0], 0.72)))

    # --- canopy --------------------------------------------------------------------------------
    canopy = mk.subdivide(mk.assign(mk.fuselage('canopy', CANOPY, 20), glass), 1)
    frame_ring = mk.ring(2.3, 0.66, 0.6, 2.58, 0.0, 24)
    frame = mk.assign(mk.tube('canopy_frame', [p for p in frame_ring if p[2] >= 2.58], 0.022, 6), dark)
    canopy = mk.shade(mk.join('canopy', [canopy, frame]), 60)
    a.add(mk.set_origin(canopy, (0.0, 2.0, 2.6)))

    # --- landing gear --------------------------------------------------------------------------
    nose_parts = [
        mk.assign(mk.tube('nose_leg', [(0, 4.2, 1.14), (0, 4.2, 0.62)], [0.055, 0.045], 10), steel),
        mk.assign(mk.tube('nose_fork', [(-0.11, 4.2, 0.62), (0.11, 4.2, 0.62)], 0.03, 8), steel),
        mk.assign(mk.tube('nose_fork_l', [(-0.11, 4.2, 0.62), (-0.11, 4.2, 0.27)], 0.022, 8), steel),
        mk.assign(mk.tube('nose_fork_r', [(0.11, 4.2, 0.62), (0.11, 4.2, 0.27)], 0.022, 8), steel),
        mk.assign(mk.tube('nose_drag_brace', [(0, 4.2, 0.72), (0, 3.75, 1.12)], 0.02, 6), steel),
        ap.wheel('nose_wheel', 0.27, 0.14, (0, 4.2, 0.27), tyre, steel),
        ap.lamp_bulb('landing', (0, 4.27, 0.9), sf.lamp('lamp_landing', '#fff4dc', 6.0), (0.1, 0.05, 0.1)),
    ]
    nose = mk.shade(mk.join('gear_nose', nose_parts), 50)
    a.add(mk.set_origin(nose, (0, 4.2, 1.14)))
    main_parts = [
        mk.assign(mk.tube('main_leg', [(0.9, -0.9, 1.3), (1.2, -0.9, 0.5), (1.24, -0.9, 0.32)], [0.065, 0.055, 0.05], 10), steel),
        mk.assign(mk.tube('main_axle', [(1.2, -0.9, 0.32), (1.42, -0.9, 0.32)], 0.035, 8), steel),
        mk.assign(mk.tube('main_brace', [(1.12, -0.9, 0.7), (0.95, -0.5, 1.28)], 0.022, 6), steel),
        ap.wheel('main_wheel', 0.32, 0.2, (1.4, -0.9, 0.32), tyre, steel),
    ]
    gear_r = mk.shade(mk.join('gear_r', main_parts), 50)
    gear_l = ap.mirror_copy(gear_r, 'gear_l')
    a.add(mk.set_origin(gear_r, (0.9, -0.9, 1.3)))
    a.add(mk.set_origin(gear_l, (-0.9, -0.9, 1.3)))

    # --- anchors, collision, extras ------------------------------------------------------------
    a.anchor('seat_driver', (0.0, 3.3, 2.2))
    a.anchor('camera', EYE)
    a.anchor('door_driver', (-1.5, 3.4, 0.0), (0, 0, -90))
    a.anchor('exhaust_1', (0.0, -7.3, 1.7), (0, 0, 180))
    a.anchor('wingtip_l', (-4.8, -2.0, WING_Z - 0.03))
    a.anchor('wingtip_r', (4.8, -2.0, WING_Z - 0.03))
    a.anchor('gear_nose', (0, 4.2, 0))
    a.anchor('gear_l', (-1.4, -0.9, 0))
    a.anchor('gear_r', (1.4, -0.9, 0))
    a.anchor('light_landing', (0, 4.3, 0.9))
    a.collider_box('fuselage', (1.6, 15.3, 1.6), (0, 0.65, 1.9))
    a.collider_box('wing', (9.6, 4.6, 0.25), (0, -0.4, WING_Z))
    a.collider_box('tail', (5.2, 3.7, 3.2), (0, -5.3, 3.1))
    a.extra('gear_retract', {'gear_nose': ['x', -95], 'gear_l': ['x', 95], 'gear_r': ['x', 95]})
    a.extra('canopy_open', ['x', 38])
    a.extra('eye', list(EYE))
    a.lods((0.45, 0.2), (90.0, 260.0))
