"""Garza Negra, the cockpit view's own model: the narrow single-seat analog office of an original
1960s high-altitude jet, in the airframe's frame (garza_negra.py: nose +Y, right wing +X, up +Z).

Seen from the eye: a deep padded glare shield over a panel crowded with round instruments (twelve
live faces sunk behind raised bezels, baked standby dials, a clock, caution tiles, guarded toggles,
breaker rows, engraved Spanish placards), a V windscreen with a heavy centre frame, bolted bows and
longerons with sealant beads, the reflector-sight glass on its bracket, side consoles (throttle
quadrant and trim wheel left, radio and oxygen right), the stick, pedals, an ejection seat, and
Dez's gloved hands on the throttles and the stick. Nodes are the cockpit model contract's; the
frames follow the exterior's glazing (same sections and angles), so they line up with its panes.
"""
import math
import os

from mathutils import Vector

import _garza_cockpit_parts as cp
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'garza_cockpit', 'atlas': 2048}

EYE = (0.0, 9.12, 3.3)
FOV = 64.0
GAZE = -3.0
FLOOR = 2.05
SILL = 2.9
GLAZING = [(10.55, 0.9, 0.3), (9.9, 1.0, 1.66), (8.4, 1.0, 1.7)]       # y, width, height: garza_negra.GLAZING
BODY = [(10.9, 1.35, 1.35), (10.2, 1.5, 1.5), (8.4, 1.55, 1.5), (6.7, 1.6, 1.5)]
WALL = [-19, -8, 4, 16, 28, 40, 50, 57.6]
STICK_PIVOT = (0.0, 9.9, FLOOR)
HINGE = (-0.3725, 9.84, 2.76)
LEVER_LEAN = 12.0          # degrees aft of upright at idle
REQUIRED = ('cockpit_shell', 'canopy_glass', 'hud_combiner', 'stick', 'hand_stick', 'throttles', 'hand_throttle', 'eye', 'glow_panel',
            'glow_console', 'gauge_airspeed', 'gauge_mach', 'gauge_attitude', 'gauge_altitude', 'gauge_heading', 'gauge_vsi',
            'gauge_skin_temp', 'gauge_egt_l', 'gauge_egt_r', 'gauge_rpm_l', 'gauge_rpm_r', 'gauge_fuel')


def _at(table, y):
    for index in range(len(table) - 1):
        (y0, *a), (y1, *b) = table[index], table[index + 1]
        if y >= y1 or index == len(table) - 2:
            t = (y - y0) / (y1 - y0)
            return [p + (q - p) * t for p, q in zip(a, b)]


def canopy(y, ang, shrink=0.0):
    """A point of the glazing: ang 0 is the right sill, 90 the top centreline, 180 the left sill."""
    w, h = _at(GLAZING, y)
    a = math.radians(ang)
    c, s = math.cos(a), math.sin(a)
    return Vector((math.copysign(abs(c) ** (2 / 2.6), c) * (w / 2 - shrink), y, SILL + abs(s) ** (2 / 2.6) * (h / 2 - shrink)))


def canopy_in(y, ang):
    across = canopy(y, min(ang + 1.0, 180.0)) - canopy(y, max(ang - 1.0, 0.0))
    along = canopy(y + 0.01, ang) - canopy(y - 0.01, ang)
    n = across.cross(along).normalized()
    return n if n.dot(Vector((0, y, SILL + 0.15)) - canopy(y, ang)) > 0 else -n


def edge(ys, ang):
    return [(canopy(y, ang), canopy_in(y, ang)) for y in ys]


def body(y, ang, side=1, shrink=0.025):
    """A point of the fuselage lining: ang from -90 (keel) to 90 (crown) up the side."""
    w, h = _at(BODY, y)
    a = math.radians(ang)
    c, s = math.cos(a), math.sin(a)
    return Vector((side * abs(c) ** (2 / 2.2) * (w / 2 - shrink), y, 2.3 + math.copysign(abs(s) ** (2 / 2.2), s) * (h / 2 - shrink)))


def body_in(y, ang, side=1):
    across = body(y, ang + 1.0, side) - body(y, ang - 1.0, side)
    along = body(y + 0.01, ang, side) - body(y - 0.01, ang, side)
    n = across.cross(along).normalized()
    return n if n.dot(Vector((0, y, 2.6)) - body(y, ang, side)) > 0 else -n


def lip(x):
    """The height of the glare shield's rear lip across the cockpit."""
    return 3.085 + 0.035 * math.cos(0.5 * math.pi * min(abs(x) / 0.45, 1.0)) ** 0.7


def make(a):
    kit = cp.Kit(ASSET['id'], ASSET['atlas'])
    kit.required = REQUIRED
    kit.extras.update({'eye': list(EYE), 'fov': FOV, 'gaze': GAZE, 'throttle_forward': 'negative rotation about x', 'cockpit': 'analog_gauges'})
    S = kit.sheet

    # --- materials (albedo 0.10-0.22 for the paints; black only on bezels and rubber) -----------
    wall = cp.coat('coat_wall', '#69726b', rough=0.68, wear=0.45, dust=0.2, chips=0.25)
    frame = cp.coat('coat_frame', '#636a65', rough=0.6, wear=0.6, dust=0.15, chips=0.35)
    sill = cp.coat('coat_sill', '#68706a', rough=0.6, wear=0.95, dust=0.3, chips=0.9, scuff=0.6)
    panel = cp.coat('coat_panel', '#5c605e', rough=0.62, wear=0.4, dust=0.12, chips=0.15)
    sub = cp.coat('coat_subpanel', '#565b5d', rough=0.55, wear=0.6, dust=0.1, chips=0.25)
    console = cp.coat('coat_console', '#5e6360', rough=0.62, wear=0.5, dust=0.35, chips=0.3)
    shade = cp.coat('coat_coaming', '#4f504e', rough=0.86, wear=0.3, dust=0.6, chips=0.0, metal=False, bump=0.3, scuff=0.15)
    pad = cp.coat('pad_leather', '#46423c', rough=0.7, wear=0.55, dust=0.3, chips=0.0, metal=False, bump=0.25, wrinkle=0.25)
    bezel = cp.coat('bezel_black', '#222325', rough=0.42, wear=0.7, dust=0.12, chips=0.2, under='#8e9092', vary=0.05, scuff=0.1)
    floor = cp.coat('coat_floor', '#5b5e58', rough=0.75, wear=0.9, dust=0.55, chips=0.9, scuff=0.8)
    tread = cp.coat('tread_metal', '#8c8e8a', rough=0.45, wear=0.3, dust=0.4, chips=0.0, grime=0.9)
    seat_frame = cp.coat('coat_seat', '#6c726d', rough=0.6, wear=0.6, dust=0.2, chips=0.4)
    cushion = cp.coat('seat_fabric', '#585a46', rough=0.92, wear=0.5, dust=0.15, chips=0.0, metal=False, bump=0.3, wrinkle=0.2)
    webbing = cp.coat('harness_webbing', '#77775a', rough=0.9, wear=0.4, dust=0.1, chips=0.0, metal=False, bump=0.35)
    steel = cp.coat('lever_steel', '#8a8d8e', rough=0.38, wear=0.2, dust=0.1, chips=0.0, grime=0.7, vary=0.1)
    rubber = cp.coat('grip_rubber', '#2a2a2c', rough=0.8, wear=0.5, dust=0.2, chips=0.0, metal=False, bump=0.3, vary=0.08)
    sealant = cp.coat('sealant', '#3b3a36', rough=0.85, wear=0.0, dust=0.2, chips=0.0, metal=False, scuff=0.0, bump=0.3)
    stripes = cp.striped('eject_stripes')
    mirror = sf.plain('mirror_glass', '#aab6c4', 0.08, 1.0)
    glove = cp.coat('glove_fabric', '#7b8172', rough=0.9, wear=0.35, dust=0.05, chips=0.0, metal=False, bump=0.4, scuff=0.1, grime=0.7)
    leather = cp.coat('glove_leather', '#4d463d', rough=0.62, wear=0.6, dust=0.05, chips=0.0, metal=False, bump=0.2, wrinkle=0.2, grime=0.7)
    strap = cp.coat('glove_trim', '#5f6456', rough=0.85, wear=0.3, dust=0.05, chips=0.0, metal=False, bump=0.3)
    sleeve = cp.coat('suit_sleeve', '#575d4b', rough=0.88, wear=0.3, dust=0.08, chips=0.0, metal=False, bump=0.3, wrinkle=0.7, scuff=0.1)
    hand_mats = [glove, leather, strap, sleeve]
    # Tiny parts: one flat texel each.
    bolt_m = sf.plain('bit_bolt', '#565957', 0.45, 0.6)
    screw_m = sf.plain('bit_screw', '#2c2d2e', 0.4, 0.5)
    chrome_m = sf.plain('bit_chrome', '#b4b5b2', 0.3, 1.0)
    black_m = sf.plain('bit_black', '#1d1d1f', 0.5, 0.0)
    white_m = sf.plain('bit_white', '#c9c8bd', 0.6, 0.0)
    red_m = sf.plain('bit_red', '#9c2b20', 0.5, 0.0)
    grey_m = sf.plain('bit_grey', '#7d807f', 0.5, 0.0)
    bolts, screws, chrome = kit.bits(bolt_m), kit.bits(screw_m), kit.bits(chrome_m)
    black, white, red, grey = kit.bits(black_m), kit.bits(white_m), kit.bits(red_m), kit.bits(grey_m)
    live = cp.live_screen('screen_live')

    # --- the canopy structure: sill rails, longerons, centre frame, bows -------------------------
    frames = kit.soup([frame, sealant], tier=2.0)
    rails = kit.soup([sill], tier=1.6)
    front = [10.55, 10.33, 10.1, 9.9]
    back = [9.9, 9.5, 9.1, 8.75, 8.4]
    full = front + back[1:]
    for lo, hi in ((0.0, 9.0), (180.0, 171.0)):
        line = cp.bar(rails, edge(full, lo), edge(full, hi), 0.035)
        cp.studs(bolts, line, 0.07)
        cp.bead(frames, edge(full, hi), mat=1)
    for lo, hi in ((43.0, 52.0), (137.0, 128.0)):
        line = cp.bar(frames, edge(full, lo), edge(full, hi), 0.03)
        cp.studs(bolts, line, 0.065)
        cp.bead(frames, edge(full, lo), mat=1)
        cp.bead(frames, edge(full, hi), mat=1)
    line = cp.bar(frames, edge(full, 86.3), edge(full, 93.7), 0.042, chamfer=0.01)
    cp.studs(bolts, line, 0.06)
    cp.bead(frames, edge(full, 86.3), mat=1)
    cp.bead(frames, edge(full, 93.7), mat=1)
    arc = [i * 180.0 / 20 for i in range(21)]
    for y0, y1, depth in ((9.935, 9.865, 0.046), (8.47, 8.41, 0.04)):
        line = cp.bar(frames, [(canopy(y0, g), canopy_in(9.2, g)) for g in arc], [(canopy(y1, g), canopy_in(9.2, g)) for g in arc], depth, chamfer=0.008)
        cp.studs(bolts, line, 0.058)
        for y in (y0, y1):
            cp.bead(frames, [(canopy(y, g), canopy_in(9.2, g)) for g in arc[1:-1]], mat=1)
    # Canopy rails under the sills, with locking hooks and the striped lock handle on the left.
    for side in (-1, 1):
        rails.box((side * 0.447, 9.15, 2.882), (0.026, 1.42, 0.03))
        for y in (8.62, 8.97, 9.32, 9.67):
            rails.box((side * 0.43, y, 2.885), (0.02, 0.045, 0.022))
            cp.bolt(bolts, (side * 0.4195, y, 2.885), (-side, 0, 0), 0.005, 0.003)
    lock = kit.soup([stripes, steel], tier=2.0)
    lock.box((-0.425, 9.5, 2.862), (0.014, 0.12, 0.02), 0)
    lock.box((-0.432, 9.44, 2.868), (0.02, 0.016, 0.03), 1)
    # Two rear-view mirrors on the front bow and a standby compass on the centre frame.
    dress = kit.soup([bezel, mirror], tier=2.2)
    for side in (-1, 1):
        p = canopy(9.9, 90 - side * 22) + canopy_in(9.9, 90 - side * 22) * 0.062
        axes = (Vector((1, 0, 0)), Vector((0, 0.94, 0.34)), Vector((0, -0.34, 0.94)))
        dress.box(p, (0.1, 0.014, 0.04), 0, axes)
        dress.box(p + axes[1] * -0.0075, (0.09, 0.002, 0.032), 1, axes)
        dress.tube([p + axes[1] * 0.006, canopy(9.9, 90 - side * 22) + canopy_in(9.9, 90 - side * 22) * 0.04], 0.004, 5, 0, (False, False))
    comp_y = 10.2
    comp = canopy(comp_y, 90) + canopy_in(comp_y, 90) * 0.075
    compass = cp.Plane(comp + Vector((0, -0.028, 0)), (1, 0, 0), (0, 0.25, 1))
    dress.lathe(comp + compass.n * -0.05, compass.n, [(0.027, 0.0), (0.03, 0.006), (0.03, 0.048), (0.026, 0.052), (0.024, 0.047)], 14, 0, ref=(1, 0, 0))
    dress.box(comp + Vector((0, 0.0, 0.035)), (0.014, 0.03, 0.045), 0)
    kit.decals(tier=5.0).on(compass, 0.0, 0.0, 0.048, 0.048, S.dial(0.048, 'RUMBO', ['N', '3', '6', 'E', '12', '15', 'S'], 0.42, 250.0, 3), 0.0005)

    # --- the glass -----------------------------------------------------------------------------
    glass = cp.Soup()
    for ys in ([10.55, 10.22, 9.9], [9.9, 9.4, 8.9, 8.4]):
        for lo, hi in ((9.0, 43.0), (52.0, 86.3), (93.7, 128.0), (137.0, 171.0)):
            angles = [lo + (hi - lo) * i / 3 for i in range(4)]
            glass.grid([[canopy(y, g, 0.004) for g in angles] for y in ys], EYE)
    pane = glass.to_object('canopy_glass', [cp.see_through('canopy_glass', '#9fb2a6', 0.12)], 30.0)
    kit.node(pane)

    # --- the tub: walls, ribs, floor, bulkheads --------------------------------------------------
    tub = kit.soup([wall, floor, tread], tier=1.0)
    stations = [8.43, 8.95, 9.5, 10.05, 10.5]
    for side in (-1, 1):
        tub.grid([[body(y, g, side) for g in WALL] for y in stations], (0, 9.4, 2.6), 0)
        for y in (8.78, 9.36, 9.94):       # ribs
            cp.bar(tub, [(body(y - 0.014, g, side), body_in(y, g, side)) for g in WALL], [(body(y + 0.014, g, side), body_in(y, g, side)) for g in WALL], 0.022, 0)
        line = cp.bar(tub, [(body(y, 43.0, side), body_in(y, 43.0, side)) for y in stations], [(body(y, 47.5, side), body_in(y, 47.5, side)) for y in stations], 0.018, 0)
        cp.studs(bolts, line, 0.11, 0.004, 0.0025)
        # The ledge between the lining and the canopy sill.
        tub.grid([[body(y, 57.6, side), canopy(y, 90 - side * 90) + Vector((-side * 0.03, 0, 0.0))] for y in stations], (0, 9.4, 3.4), 0)
    tub.grid([[(-0.74, y, FLOOR), (0.74, y, FLOOR)] for y in (8.43, 9.1, 9.8, 10.5)], (0, 9.4, 3.0), 1)
    for side in (-1, 1):
        tub.box((side * 0.17, 10.08, FLOOR + 0.002), (0.13, 0.36, 0.004), 2)
    ring_front = [body(10.5, g, 1) for g in WALL] + [body(10.5, g, -1) for g in reversed(WALL)]
    tub.polygon(ring_front, (0, 9.4, 2.6), 0)
    ring_back = [body(8.43, g, 1) for g in WALL] + [canopy(8.43, g) for g in range(0, 181, 15)] + [body(8.43, g, -1) for g in reversed(WALL)]
    tub.polygon(ring_back, (0, 9.4, 2.9), 0)
    # Wall dressing: an oxygen hose and cable runs, a map case, the canopy jettison handle.
    lines = kit.soup([rubber, wall, stripes], tier=1.2)
    hose = [(0.46, 9.36, 2.74), (0.5, 9.3, 2.82), (0.487, 9.1, 2.86), (0.47, 8.85, 2.84), (0.43, 8.7, 2.74), (0.34, 8.66, 2.6)]
    hose_pts, hose_r = cp.resample(cp.fillet(hose, 0.05, 3), [0.017] * 30, 0.012)
    lines.tube(hose_pts, [0.017 + 0.002 * math.sin(i * 3.14159) for i in range(len(hose_pts))], 8, 0, (False, False))
    for z, r in ((2.80, 0.007), (2.775, 0.005)):
        ang = 41.6 if z > 2.79 else 39.9
        lines.tube([body(y, ang, -1) + body_in(y, ang, -1) * (0.024 + r) for y in (8.5, 8.9, 9.3, 9.7, 10.1, 10.45)], r, 5, 0, (False, False))
    lines.box((0.515, 8.98, 2.8), (0.03, 0.26, 0.11), 1, axes=(body_in(9.0, 44, 1) * -1.0, Vector((0, 1, 0)), body_in(9.0, 44, 1).cross(Vector((0, 1, 0))) * -1.0))
    lines.box((0.463, 9.64, 2.845), (0.016, 0.1, 0.022), 2)
    wall_r = cp.Plane(body(9.62, 36.5, 1) + body_in(9.62, 36.5, 1) * 0.001, (0, -1, 0), body(9.62, 38, 1) - body(9.62, 35, 1))
    cp.label(kit, wall_r, 0.0, 0.0, 'ECHAR CUPULA\nTIRAR', 0.085, 0.024, tier=4.0, ink=S.BLACK, ground=S.YELLOW, border=True)
    wall_l = cp.Plane(body(9.25, 36.5, -1) + body_in(9.25, 36.5, -1) * 0.001, (0, 1, 0), body(9.25, 38, -1) - body(9.25, 35, -1))
    cp.label(kit, wall_l, 0.0, 0.0, 'CUPULA  ABRIR - CERRAR', 0.11, 0.016, tier=4.0, border=True)
    cp.label(kit, wall_l, -0.3, 0.0, 'NO SOLTAR EN VUELO', 0.09, 0.016, tier=4.0, ink=S.BLACK, ground=S.YELLOW, border=True)

    # --- the glare shield ------------------------------------------------------------------------
    P = cp.Plane((0.0, 10.0, 2.85), (1, 0, 0), (0, 0.12, 1))        # the main panel's face

    def V(z):
        return (z - 2.85) / P.u.z

    hood = kit.soup([shade, pad], tier=2.0)
    spread = [0, 12, 25, 40, 58, 75, 90, 105, 122, 140, 155, 168, 180]

    def lip_point(g, y=9.9, drop=0.0):
        c = math.cos(math.radians(g))
        x = 0.45 * math.copysign(abs(c) ** 0.8, c)
        return Vector((x, y, lip(x) - drop))

    rows = []
    for t in (0.0, 0.22, 0.5, 0.78, 1.0):
        rows.append([lip_point(g).lerp(canopy(10.56, g, 0.002) + Vector((0, 0, 0.004)), t) + Vector((0, 0, 0.012 * math.sin(math.pi * t))) for g in spread])
    hood.grid(rows, (0, 9.6, 4.0), 0)
    hood.tube([lip_point(g, 9.895, 0.006) for g in spread], 0.013, 8, 1, (True, True))
    under = []
    for g in spread:
        p = lip_point(g, 9.9, 0.019)
        q = P.pt(p.x, V(p.z + 0.008))
        under.append([p, q])
    hood.grid([[r[0] for r in under], [r[1] for r in under]], (0, 9.6, 2.6), 0)
    kit.probes['glare_shield_lip'] = (0.0, 9.895, lip(0.0) + 0.007)
    cp.studs(bolts, [(lip_point(g, 9.93, -0.0005), Vector((0, 0, 1))) for g in spread], 0.09, 0.004, 0.0022)

    # --- the reflector sight: projector box, bracket, the combiner glass -------------------------
    sight = kit.soup([bezel, steel], tier=2.4)
    top = rows[1][6].z
    sight.box((0.0, 10.175, top + 0.016), (0.11, 0.13, 0.04), 0)
    sight.lathe((0.0, 10.16, top + 0.036), (0, -0.25, 1), [(0.036, 0.0), (0.036, 0.006), (0.03, 0.008), (0.028, 0.003), (0.0, 0.003)], 16, 0)
    corners = [Vector((-0.08, 10.108, 3.158)), Vector((0.08, 10.108, 3.158)), Vector((0.08, 10.058, 3.29)), Vector((-0.08, 10.058, 3.29))]
    up = (corners[3] - corners[0]).normalized()
    out = Vector((1, 0, 0)).cross(up)
    for side in (-1, 1):
        base = Vector((side * 0.086, 10.108, 3.158))
        sight.box(base + up * 0.066, (0.006, 0.012, 0.14), 1, axes=(Vector((1, 0, 0)), out, up))
        sight.tube([Vector((side * 0.05, 10.2, top + 0.03)),Vector((side * 0.086, 10.15, 3.15)), base + up * 0.01], 0.005, 5, 1, (False, False))
        cp.bolt(bolts, base + up * 0.02 + Vector((side * 0.003, 0, 0)), (side, 0, 0), 0.004, 0.003)
        cp.bolt(bolts, base + up * 0.11 + Vector((side * 0.003, 0, 0)), (side, 0, 0), 0.004, 0.003)
    sight.box((corners[0] + corners[1]) * 0.5 - up * 0.004, (0.178, 0.012, 0.008), 1, axes=(Vector((1, 0, 0)), out, up))
    combiner = mk.quad('hud_combiner', corners)
    mk.assign(combiner, cp.see_through('hud_glass', '#a6d8b0', 0.16))
    kit.node(combiner)
    kit.probes['hud_combiner'] = tuple((corners[0] + corners[2]) * 0.5)

    # --- the main panel ----------------------------------------------------------------------------
    main = kit.soup([panel, sub, bezel], tier=3.0)
    outline = [(-0.44, V(2.55)), (0.44, V(2.55))] + [(x * 0.44 / 4, V(lip(x * 0.44 / 4) - 0.004)) for x in range(4, -5, -1)]
    main.polygon([P.pt(u, v, 0.0) for u, v in outline], EYE, 0)
    main.box(P.pt(0.0, V(2.545), -0.02), (0.88, 0.012, 0.04), 0, P.axes())
    rings = kit.soup([bezel], tier=3.2, smooth=50.0)
    flight = cp.plate(main, screws, P, -0.152, V(2.862), 0.152, V(3.066), mat=1)
    engines = cp.plate(main, screws, P, 0.166, V(2.822), 0.384, V(3.046), mat=1)
    left = cp.plate(main, screws, P, -0.42, V(2.872), -0.162, V(3.058), mat=1)
    lower = cp.plate(main, screws, P, -0.2, V(2.575), 0.15, V(2.852), mat=1)
    breakers = cp.plate(main, screws, P, 0.16, V(2.575), 0.425, V(2.812), mat=1)
    lights = cp.plate(main, screws, P, -0.425, V(2.575), -0.21, V(2.862), mat=1)
    six = (('gauge_airspeed', -0.1, 3.012, 'VEL  KT'), ('gauge_attitude', 0.0, 3.012, 'HORIZONTE'), ('gauge_altitude', 0.1, 3.012, 'ALT  PIES'),
           ('gauge_mach', -0.1, 2.915, 'MACH'), ('gauge_heading', 0.0, 2.915, 'RUMBO'), ('gauge_vsi', 0.1, 2.915, 'VARIO'))
    for name, x, z, text in six:
        cp.gauge_ring(rings, screws, flight, x, V(z), 0.037, 28)
        cp.live_face(kit, live, flight, x, V(z), 0.037, name)
    cp.label(kit, flight, 0.0, V(3.06), 'VUELO', 0.03, 0.007)
    small = (('gauge_rpm_l', 0.205, 3.0), ('gauge_rpm_r', 0.275, 3.0), ('gauge_egt_l', 0.205, 2.932), ('gauge_egt_r', 0.275, 2.932), ('gauge_fuel', 0.205, 2.864))
    for name, x, z in small:
        cp.gauge_ring(rings, screws, engines, x, V(z), 0.026, 24)
        cp.live_face(kit, live, engines, x, V(z), 0.026, name)
    for text, x, z in (('RPM %', 0.24, 3.04), ('TEMP ESCAPE', 0.24, 2.966), ('COMB', 0.205, 2.826), ('ACEITE', 0.275, 2.826), ('1', 0.168 + 0.006, 3.0), ('2', 0.312, 3.0)):
        cp.label(kit, engines, x, V(z), text, 0.006 if len(text) == 1 else 0.034, 0.0065)
    dials = kit.decals(tier=5.0)

    def baked_dial(plane, x, z, radius, rect):
        cp.gauge_ring(rings, screws, plane, x, V(z), radius, 20)
        dials.on(plane, x, V(z), radius * 2, radius * 2, rect, 0.001)

    baked_dial(engines, 0.275, 2.864, 0.026, S.dial(0.052, 'ACEITE\nPSI', [0, 20, 40, 60, 80], 0.55, band=[(0.4, 0.75, S.GREEN), (0.9, 1.0, S.RED)]))
    for i, (text, numbers, needle) in enumerate((('HID 1', [0, 1, 2, 3, 4], 0.72), ('HID 2', [0, 1, 2, 3, 4], 0.7), ('OXI\nLTS', [0, 2, 4, 6, 8, 10], 0.6))):
        baked_dial(engines, 0.348, 3.004 - i * 0.062, 0.022, S.dial(0.044, text, numbers, needle, band=[(0.6, 0.85, S.GREEN)]))
    cp.gauge_ring(rings, screws, left, -0.195, V(2.925), 0.03, 24)
    cp.live_face(kit, live, left, -0.195, V(2.925), 0.03, 'gauge_skin_temp')
    cp.label(kit, left, -0.195, V(2.884), 'TEMP PIEL', 0.036, 0.0065)
    baked_dial(left, -0.195, 3.012, 0.026, S.dial(0.052, 'RELOJ', [12, 2, 4, 6, 8, 10, ''], 0.31, 360.0, 2, second=0.78))
    baked_dial(left, -0.268, 2.925, 0.022, S.dial(0.044, 'CABINA\nALT', [0, 10, 20, 30, 40, 50], 0.34))
    # The caution tiles, the gear lever and its three lamps.
    tiles = kit.soup([bezel], tier=3.0)
    cp.lamp_tiles(kit, tiles, left, -0.325, V(3.014), ['FUEGO 1', 'FUEGO 2', 'HIDR', 'COMB BAJA', 'GEN 1', 'GEN 2', 'OXI BAJO', 'CABINA', 'ACEITE', 'TOBERA', 'ANTIHIELO', 'ESTAB'],
                  [S.RED, S.RED, S.AMBER, S.AMBER, S.AMBER, S.AMBER, S.AMBER, S.RED, S.AMBER, S.AMBER, S.GREEN, S.AMBER], 3, 0.03, 0.0155)
    cp.lamp_tiles(kit, tiles, left, -0.345, V(2.948), ['IZQ', 'NARIZ', 'DER'], [S.GREEN], 3, 0.02, 0.012)
    cp.label(kit, left, -0.345, V(2.9665), 'TREN', 0.03, 0.006)
    tiles.box(left.pt(-0.385, V(2.905), 0.003), (0.018, 0.05, 0.006), 0, left.axes())
    gear = kit.soup([steel, bezel], tier=2.4)
    gear.tube([left.pt(-0.385, V(2.9), 0.004), left.pt(-0.385, V(2.888), 0.05)], 0.0045, 6, 0, (False, True))
    gear.lathe(left.pt(-0.385 - 0.008, V(2.888), 0.05), (1, 0, 0), [(0.0, 0.0), (0.014, 0.0), (0.017, 0.003), (0.017, 0.013), (0.014, 0.016), (0.0, 0.016)], 14, 1)
    cp.label(kit, left, -0.35, V(2.903), 'ARRIBA\nABAJO', 0.026, 0.013)
    # The toggle row under the flight instruments, with two guarded switches.
    guards = kit.soup([cp.coat('guard_red', '#8e2a20', rough=0.5, wear=0.8, dust=0.1, chips=0.4)], tier=2.4)
    names = ['BAT', 'GEN 1', 'GEN 2', 'BOMBA 1', 'BOMBA 2', 'PITOT', 'ANTIH', 'LUCES', 'ARMAR', 'SOLTAR']
    for i, text in enumerate(names):
        x = -0.162 + i * 0.032
        cp.toggle(chrome, lower, x, V(2.812), 22.0 if i % 3 else -22.0, 0.0)
        cp.label(kit, lower, x, V(2.832), text, 0.028, 0.0065)
        if i >= 8:
            cp.guard(guards, lower, x, V(2.812))
    cp.label(kit, lower, -0.162 + 8.5 * 0.032, V(2.789), 'CARGA', 0.05, 0.008, ink=S.BLACK, ground=S.YELLOW, border=True)
    # Standby dials, knobs and a channel window on the lower centre plate.
    baked_dial(lower, -0.14, 2.722, 0.026, S.dial(0.052, 'VEL\nRESERVA', [0, 1, 2, 3, 4, 5, 6], 0.22))
    baked_dial(lower, -0.07, 2.722, 0.026, S.dial(0.052, 'ALT\nRESERVA', [0, 2, 4, 6, 8, ''], 0.4, 360.0, 2, second=0.12))
    baked_dial(lower, 0.0, 2.722, 0.026, S.dial(0.052, 'TOBERA\n%', [0, 25, 50, 75, 100], 0.35))
    for i, (text, x) in enumerate((('BRILLO', -0.15), ('MIRA', -0.1), ('CANAL', 0.02), ('VOL', 0.07), ('SILENC', 0.12))):
        cp.knob(black, white, lower, x, V(2.628), 0.011, 0.014, turn=-40 + 35 * i)
        cp.label(kit, lower, x, V(2.607), text, 0.03, 0.0065)
    dials.on(lower, -0.04, V(2.632), 0.05, 0.018, S.window('317.45', 0.05, 0.018), 0.0006)
    cp.label(kit, lower, -0.04, V(2.65), 'RADIO 1  MC', 0.04, 0.0065)
    cp.label(kit, lower, 0.09, V(2.722), 'NO EXCEDER\nMACH 3.2\nPIEL 320 C', 0.07, 0.03, ink=S.BLACK, ground=S.YELLOW, border=True)
    # The breaker field.
    for row in range(4):
        z = 2.79 - row * 0.05
        for col in range(9):
            cp.breaker(black, white, breakers, 0.185 + col * 0.0275, V(z), out=(row, col) in ((1, 6), (3, 2)))
        cp.label(kit, breakers, 0.2925, V(z - 0.021), ('RADIO NAV IFF HID 1 HID 2 TRIM', 'BOMBAS 1-4  ENCEND 1 2', 'LUCES PANEL FAROS ANTIH', 'TOBERA CUPULA EYECT OXI')[row], 0.24, 0.0075)
    # Lighting knobs, a data plate and warnings on the lower left plate.
    for i, text in enumerate(('PANEL', 'CONSOLA', 'INUND')):
        cp.knob(black, white, lights, -0.385 + i * 0.06, V(2.81), 0.013, 0.016, turn=30 * i - 20)
        cp.label(kit, lights, -0.385 + i * 0.06, V(2.785), text, 0.034, 0.0065)
    cp.label(kit, lights, -0.325, V(2.842), 'LUCES INTERIORES', 0.07, 0.0075)
    for i, text in enumerate(('FRENO AIRE', 'PARACAIDAS', 'ESTAB', 'AMORT GUI')):
        x = -0.395 + i * 0.046
        cp.toggle(chrome, lights, x, V(2.722), -20.0 if i == 1 else 20.0)
        cp.label(kit, lights, x, V(2.744), text, 0.042, 0.0065)
    cp.label(kit, lights, -0.32, V(2.652), 'GARZA NEGRA  GN-1\nCELULA 07   LOTE 3\nTALLER NACIONAL DE AERONAVES', 0.12, 0.034, border=True)
    cp.label(kit, lights, -0.32, V(2.604), 'PELIGRO  ASIENTO ARMADO', 0.12, 0.014, ink=S.BLACK, ground=S.YELLOW, border=True)
    kit.probes['panel_centre'] = tuple(P.pt(0.0, V(2.96)))

    # --- the pedestal between the knees -------------------------------------------------------------
    ped = kit.soup([console, sub], tier=1.6)
    ped.box((0.0, 10.08, 2.4), (0.2, 0.19, 0.3), 0)
    Q = cp.Plane((0.0, 9.985, 2.4), (1, 0, 0), (0, 0, 1))
    face = cp.plate(ped, screws, Q, -0.092, -0.14, 0.092, 0.14, mat=1)
    for i, text in enumerate(('IFF', 'NAV', 'BALIZA')):
        cp.knob(black, white, face, -0.055 + i * 0.055, 0.09, 0.012, 0.015, turn=60 * i - 50)
        cp.label(kit, face, -0.055 + i * 0.055, 0.066, text, 0.03, 0.0065, tier=4.0)
    kit.decals(tier=4.0).on(face, 0.0, 0.03, 0.07, 0.02, S.window('07 - 1 - 44', 0.07, 0.02), 0.0006)
    for i in range(5):
        cp.toggle(chrome, face, -0.064 + i * 0.032, -0.03, 20.0 if i % 2 else -20.0)
        cp.label(kit, face, -0.064 + i * 0.032, -0.052, ('CAM 1', 'CAM 2', 'FILM', 'CAL', 'PRUEBA')[i], 0.028, 0.0065, tier=4.0)
    cp.label(kit, face, 0.0, -0.1, 'CAMARAS DE RECONOCIMIENTO', 0.15, 0.012, tier=4.0, border=True)

    # --- the side consoles ---------------------------------------------------------------------------
    sides = kit.soup([console, sub, bezel, steel], tier=1.6)
    for side in (-1, 1):
        sides.box((side * 0.455, 9.29, 2.385), (0.37, 1.39, 0.67), 0)
    CL = cp.Plane((-0.455, 9.3, 2.72), (1, 0, 0), (0, 1, 0))
    CR = cp.Plane((0.455, 9.3, 2.72), (1, 0, 0), (0, 1, 0))
    # Left: the throttle quadrant base, the trim wheel, fuel and flap panels.
    sides.box((-0.38, 9.805, 2.7675), (0.17, 0.33, 0.095), 2)
    TQ = cp.Plane((-0.38, 9.805, 2.815), (1, 0, 0), (0, 1, 0))
    for x in (-0.02, 0.035):
        black.box(TQ.pt(x, 0.0, 0.0004), (0.012, 0.26, 0.0008))
    for dv, text in ((-0.112, 'CORTE'), (-0.06, 'RALENTI'), (0.045, 'MIL'), (0.112, 'POSTQ')):
        cp.label(kit, TQ, 0.064, dv, text, 0.03, 0.0065, tier=5.0)
        white.box(TQ.pt(0.044, dv, 0.0004), (0.006, 0.0012, 0.0008))
    cp.label(kit, TQ, -0.066, 0.0, 'GASES', 0.03, 0.0075, tier=5.0, turn=90.0)
    for dv in (-0.15, 0.15):
        for du in (-0.07, 0.07):
            cp.screw(screws, TQ, du, dv)
    sides.lathe((-0.2955, 9.72, 2.775), (1, 0, 0), [(0.016, 0.0), (0.016, 0.004), (0.012, 0.006), (0.011, 0.02), (0.0, 0.021)], 10, 3)
    sides.lathe((-0.268, 9.48, 2.7), (1, 0, 0), [(0.0, 0.0), (0.05, 0.0), (0.056, 0.003), (0.056, 0.013), (0.05, 0.016), (0.0, 0.016)], 22, 2)
    for i in range(22):
        ang = 2 * math.pi * i / 22
        black.box((-0.26, 9.48 + 0.0565 * math.cos(ang), 2.7 + 0.0565 * math.sin(ang)), (0.012, 0.004, 0.002),
                  axes=((1, 0, 0), (0, -math.sin(ang), math.cos(ang)), (0, -math.cos(ang), -math.sin(ang))))
    fuel = cp.plate(sides, screws, CL, -0.17, -0.07, 0.17, 0.29, mat=1)
    cp.label(kit, fuel, 0.0, 0.272, 'COMBUSTIBLE', 0.07, 0.009, tier=4.0)
    for r in range(2):
        for c in range(4):
            cp.toggle(chrome, fuel, -0.12 + c * 0.065, 0.2 - r * 0.09, 20.0 if (r + c) % 3 else -20.0)
            cp.label(kit, fuel, -0.12 + c * 0.065, 0.225 - r * 0.09, ('TANQ 1', 'TANQ 2', 'TANQ 3', 'TANQ 4', 'CRUCE', 'VACIAR', 'PRES', 'REPOSTAJE')[r * 4 + c], 0.04, 0.0075, tier=4.0)
    kit.decals(tier=4.0).on(fuel, -0.09, 0.0, 0.052, 0.052, S.dial(0.052, 'TOTAL\nx1000', [0, 10, 20, 30, 40], 0.66), 0.001)
    cp.gauge_ring(rings, screws, fuel, -0.09, 0.0, 0.026, 20)
    cp.knob(black, white, fuel, 0.06, 0.0, 0.016, 0.018, turn=40)
    cp.label(kit, fuel, 0.06, -0.035, 'SELECTOR', 0.045, 0.0075, tier=4.0)
    flap = cp.plate(sides, screws, CL, -0.17, -0.42, 0.17, -0.09, mat=1)
    black.box(flap.pt(-0.08, -0.25, 0.0004), (0.014, 0.22, 0.0008))
    sides.box(flap.pt(-0.08, -0.2, 0.03), (0.008, 0.012, 0.06), 3)
    sides.box(flap.pt(-0.08, -0.2, 0.066), (0.05, 0.022, 0.014), 2)
    cp.label(kit, flap, -0.02, -0.25, 'FRENO DE AIRE', 0.11, 0.009, tier=4.0, turn=90.0)
    for i, text in enumerate(('TRIM ALAB', 'TRIM DIR', 'RESERVA')):
        cp.knob(black, white, flap, 0.06, -0.14 - i * 0.1, 0.014, 0.016, turn=30 - 40 * i)
        cp.label(kit, flap, 0.12, -0.14 - i * 0.1, text, 0.05, 0.0075, tier=4.0)
    aft_l = cp.plate(sides, screws, CL, -0.17, -0.68, 0.17, -0.44, mat=1)
    for i in range(6):
        cp.breaker(black, white, aft_l, -0.125 + i * 0.05, -0.52)
        cp.toggle(chrome, aft_l, -0.125 + i * 0.05, -0.61, 20.0 if i % 2 else -20.0)
    cp.label(kit, aft_l, 0.0, -0.565, 'TRAJE  VISOR  CALEF  VENT  RELE 1  RELE 2', 0.3, 0.009, tier=4.0)
    cp.label(kit, CL, 0.03, 0.2, 'COMP', 0.03, 0.0075, tier=4.0)
    # Right: radio, oxygen regulator, breakers, lights.
    radio = cp.plate(sides, screws, CR, -0.17, 0.34, 0.17, 0.67, mat=1)
    cp.label(kit, radio, 0.0, 0.65, 'RADIO 2  /  NAVEGACION', 0.14, 0.009, tier=4.0)
    for i, text in enumerate(('248.10', '112.6')):
        kit.decals(tier=4.0).on(radio, -0.07 + i * 0.15, 0.6, 0.075, 0.024, S.window(text, 0.075, 0.024), 0.0006)
    for r in range(2):
        for c in range(3):
            cp.knob(black, white, radio, -0.11 + c * 0.11, 0.53 - r * 0.09, 0.015, 0.018, turn=50 * c - 30 * r)
            cp.label(kit, radio, -0.11 + c * 0.11, 0.497 - r * 0.09, ('MC', 'KC', 'MODO', 'VOL', 'SILENC', 'TONO')[r * 3 + c], 0.035, 0.0075, tier=4.0)
    oxy = cp.plate(sides, screws, CR, -0.17, -0.02, 0.17, 0.32, mat=1)
    cp.label(kit, oxy, 0.0, 0.3, 'REGULADOR DE OXIGENO', 0.14, 0.009, tier=4.0)
    kit.decals(tier=4.0).on(oxy, -0.08, 0.2, 0.06, 0.06, S.dial(0.06, 'PRESION\nPSI', [0, 100, 200, 300, 400, 500], 0.74, band=[(0.5, 0.9, S.GREEN), (0.0, 0.12, S.RED)]), 0.001)
    cp.gauge_ring(rings, screws, oxy, -0.08, 0.2, 0.03, 20)
    kit.decals(tier=4.0).on(oxy, 0.08, 0.2, 0.04, 0.03, S.window('FLUJO', 0.04, 0.03), 0.0006)
    for i, text in enumerate(('EMERG', '100 %', 'ABRIR')):
        x = -0.1 + i * 0.1
        sides.box(oxy.pt(x, 0.07, 0.006), (0.03, 0.05, 0.012), 2)
        sides.box(oxy.pt(x, 0.085, 0.02), (0.016, 0.012, 0.02), 3 if i else 2)
        cp.label(kit, oxy, x, 0.03, text, 0.04, 0.008, tier=4.0, ink=S.BLACK if i == 0 else None, ground=S.RED if i == 0 else None)
    brk = cp.plate(sides, screws, CR, -0.17, -0.4, 0.17, -0.04, mat=1)
    for r in range(4):
        for c in range(7):
            cp.breaker(black, white, brk, -0.135 + c * 0.045, -0.1 - r * 0.075, out=(r, c) == (2, 4))
        cp.label(kit, brk, 0.0, -0.137 - r * 0.075, ('INV 1  INV 2  BARRA A  BARRA B  EMERG', 'GIRO  HORIZ  RUMBO  MACH  PITOT', 'CAM 1  CAM 2  CALEF  FILM', 'MIRA  RADIO 2  BALIZA  GRAB')[r], 0.3, 0.009, tier=4.0)
    aft_r = cp.plate(sides, screws, CR, -0.17, -0.68, 0.17, -0.42, mat=1)
    for i, text in enumerate(('TEMP CABINA', 'DESEMP', 'TRAJE')):
        cp.knob(black, white, aft_r, -0.11 + i * 0.11, -0.52, 0.017, 0.02, turn=45 * i - 60)
        cp.label(kit, aft_r, -0.11 + i * 0.11, -0.56, text, 0.055, 0.0085, tier=4.0)
    for i in range(4):
        cp.toggle(chrome, aft_r, -0.12 + i * 0.08, -0.63, 20.0)

    # --- rudder pedals -------------------------------------------------------------------------------
    pedals = kit.soup([steel, tread], tier=1.0)
    lean = math.radians(24)
    axes = (Vector((1, 0, 0)), Vector((0, math.cos(lean), -math.sin(lean))) * 1.0, Vector((0, math.sin(lean), math.cos(lean))))
    for side in (-1, 1):
        c = Vector((side * 0.17, 10.3, 2.32))
        pedals.box(c, (0.105, 0.012, 0.17), 1, axes)
        for k in (-0.055, -0.02, 0.015, 0.05):
            pedals.box(c + axes[2] * k - axes[1] * 0.008, (0.1, 0.005, 0.008), 1, axes)
        pedals.box(c + axes[2] * 0.09, (0.12, 0.02, 0.014), 0, axes)
        pedals.tube([c + axes[2] * 0.08 + Vector((side * 0.045, 0.01, 0)), Vector((side * 0.215, 10.42, 2.64))], 0.009, 6, 0, (False, False))
        pedals.tube([c + axes[2] * 0.08 + Vector((-side * 0.045, 0.01, 0)), Vector((side * 0.125, 10.42, 2.64))], 0.009, 6, 0, (False, False))
    pedals.tube([(-0.26, 10.42, 2.64), (0.26, 10.42, 2.64)], 0.012, 6, 0, (True, True))

    # --- the ejection seat -----------------------------------------------------------------------------
    seat = kit.soup([seat_frame, cushion, webbing, pad, steel, stripes], tier=1.1)
    seat.box((0.0, 9.19, 2.49), (0.46, 0.5, 0.06), 0)
    for side in (-1, 1):
        seat.box((side * 0.237, 9.17, 2.57), (0.014, 0.52, 0.2), 0)
        seat.box((side * 0.19, 8.8, 2.85), (0.03, 0.045, 1.56), 0)
        seat.box((side * 0.135, 8.93, 3.36), (0.022, 0.15, 0.23), 0)
        seat.lathe((side * 0.08, 8.87, 3.49), (0, 0, 1), [(0.013, 0.0), (0.005, 0.05), (0.0, 0.056)], 6, 4)
    seat.box((0.0, 9.2, 2.545), (0.42, 0.44, 0.05), 1)
    tilt = math.radians(12)
    up_b, out_b = Vector((0, -math.sin(tilt), math.cos(tilt))), Vector((0, math.cos(tilt), math.sin(tilt)))
    back_c = Vector((0.0, 8.9, 2.87))
    seat.box(back_c, (0.44, 0.07, 0.66), 0, axes=(Vector((1, 0, 0)), out_b, up_b))
    seat.box(back_c + out_b * 0.052, (0.38, 0.04, 0.56), 1, axes=(Vector((1, 0, 0)), out_b, up_b))
    seat.box((0.0, 8.87, 3.36), (0.25, 0.1, 0.26), 0)
    seat.box((0.0, 8.932, 3.36), (0.2, 0.03, 0.2), 3)
    seat.box((0.0, 9.44, 2.555), (0.13, 0.05, 0.05), 0)
    loop = cp.fillet([(-0.04, 9.455, 2.575), (-0.052, 9.47, 2.66), (-0.03, 9.48, 2.705), (0.03, 9.48, 2.705), (0.052, 9.47, 2.66), (0.04, 9.455, 2.575)], 0.02, 3)
    seat.tube(loop, 0.0095, 8, 5, (True, True))
    seat.box((0.262, 9.25, 2.6), (0.012, 0.16, 0.022), 4)
    seat.lathe((0.262, 9.34, 2.6), (0, 1, 0), [(0.012, 0.0), (0.014, 0.01), (0.012, 0.045), (0.0, 0.05)], 8, 5)
    for side in (-1, 1):
        x = side * 0.09
        surface = back_c + out_b * 0.0745
        path = [Vector((x, 8.855, 3.2)), surface + up_b * 0.3 + Vector((x, 0, 0)), surface + up_b * 0.0 + Vector((x * 0.95, 0, 0)), surface + up_b * -0.25 + Vector((x * 0.9, 0, 0)),
                Vector((x * 0.85, 9.06, 2.574)), Vector((x * 0.3, 9.2, 2.574))]
        ups = [out_b, out_b, out_b, (out_b + Vector((0, 0, 1))).normalized(), Vector((0, 0, 1)), Vector((0, 0, 1))]
        seat.strip(path, 0.045, 0.003, ups, 2)
        seat.box(surface + up_b * 0.12 + Vector((x, 0, 0)) + out_b * 0.006, (0.055, 0.012, 0.03), 4, axes=(Vector((1, 0, 0)), out_b, up_b))
        seat.strip([Vector((side * 0.225, 9.12, 2.6)), Vector((side * 0.19, 9.14, 2.578)), Vector((side * 0.03, 9.2, 2.574))], 0.045, 0.003, Vector((0, 0, 1)), 2)
    seat.lathe((0.0, 9.2, 2.574), (0, 0, 1), [(0.03, 0.0), (0.03, 0.01), (0.022, 0.014), (0.0, 0.014)], 12, 4)
    cp.label(kit, cp.Plane((0.0, 9.414, 2.555), (1, 0, 0), (0, 0, 1)), 0.0, 0.0, 'EYECCION - TIRAR', 0.1, 0.014, tier=3.0, ink=S.BLACK, ground=S.YELLOW, border=True)

    # --- the stick ---------------------------------------------------------------------------------------
    boot = kit.soup([rubber, steel], tier=1.2)
    boot.lathe(STICK_PIVOT, (0, 0, 1), [(0.085, 0.0), (0.085, 0.004), (0.072, 0.006), (0.066, 0.022), (0.05, 0.03), (0.054, 0.05), (0.036, 0.06), (0.04, 0.08), (0.024, 0.09),
                                          (0.026, 0.11), (0.017, 0.122)], 14, 0)
    stick = kit.soup([steel, rubber], node='stick', tier=2.6)
    stick.tube(cp.fillet([(0, 9.9, FLOOR + 0.02), (0, 9.9, 2.32), (0, 9.86, 2.62), (0, 9.85, 2.77)], 0.06, 3), 0.014, 8, 0, (False, False))
    grip_rings = []
    for z, rx, ry, dy in ((2.755, 0.015, 0.015, 0.0), (2.762, 0.028, 0.03, 0.0), (2.77, 0.028, 0.03, 0.0), (2.774, 0.0195, 0.021, 0.0), (2.8, 0.019, 0.021, 0.0),
                          (2.84, 0.0185, 0.0205, 0.0), (2.885, 0.0195, 0.0215, 0.0), (2.905, 0.022, 0.025, -0.002), (2.93, 0.0235, 0.029, -0.004),
                          (2.955, 0.021, 0.026, -0.004), (2.966, 0.013, 0.017, -0.004)):
        grip_rings.append([Vector((rx * math.cos(2 * math.pi * k / 12), 9.85 + dy + ry * math.sin(2 * math.pi * k / 12), z)) for k in range(12)])
    stick.loft(grip_rings, 1, True, False, True)
    grey_s, red_s, black_s = kit.bits(grey_m, 'stick'), kit.bits(red_m, 'stick'), kit.bits(black_m, 'stick')
    grey_s.lathe((-0.007, 9.838, 2.964), (0, -0.4, 1), [(0.003, 0.0), (0.003, 0.006), (0.0075, 0.006), (0.0065, 0.01), (0.0, 0.011)], 8)
    red_s.lathe((0.011, 9.852, 2.964), (0, 0, 1), [(0.0055, 0.0), (0.0055, 0.004), (0.0, 0.005)], 8)
    black_s.box((0.0, 9.879, 2.898), (0.008, 0.012, 0.03))
    black_s.box((0.0, 9.874, 2.8), (0.006, 0.012, 0.022))
    kit.pivots['stick'] = STICK_PIVOT
    Yh = Vector((-0.406, 0.914, 0.0)).normalized()
    Zh = Vector((0, 0, -1)).cross(Yh)
    wrist = Vector((0.0, 9.85, 2.862)) - Yh * cp.GRIP[0] - Zh * cp.GRIP[1]
    M = cp.hand_matrix(wrist, (0, 0, -1), Yh, Zh)
    inv = M.inverted()
    pose = {'curl': {'index': (46, 62, 22), 'middle': (62, 80, 28), 'ring': (66, 84, 30), 'little': (70, 86, 34)},
            'spread': {'index': 3.0, 'middle': 1.0, 'ring': -2.0, 'little': -5.0},
            'thumb': [(-0.02, 0.022, -0.01), (-0.045, 0.045, -0.03), (-0.074, 0.039, -0.034), (-0.097, 0.043, -0.036)]}
    reach = [inv @ Vector(p) for p in (wrist, wrist - Yh * 0.06, (0.25, 9.4, 2.8), (0.2, 9.02, 3.04))]
    hand_r = kit.soup(hand_mats, node='hand_stick', tier=3.2, smooth=50.0)
    hand_r.extend(cp.hand(pose, reach).transform(M))
    kit.pivots['hand_stick'] = tuple(wrist)
    kit.parents['hand_stick'] = 'stick'
    kit.probes['hand_stick'] = tuple(M @ Vector((-0.03, 0.095, 0.014)))
    kit.probes['stick_top'] = (0.0, 9.846, 2.966)

    # --- the throttles ---------------------------------------------------------------------------------------
    quad = kit.soup([steel, rubber, bezel], node='throttles', tier=2.6)
    a_lean = math.radians(LEVER_LEAN)
    L = Vector((0, -math.sin(a_lean), math.cos(a_lean)))
    Lb = L.cross(Vector((1, 0, 0)))
    hinge = Vector(HINGE)
    knob_c = hinge + L * 0.125
    for i, x in enumerate((-0.4, -0.345)):
        base = Vector((x, hinge.y, hinge.z))
        quad.box(base + L * 0.06, (0.007, 0.022, 0.125), 0, axes=(Vector((1, 0, 0)), Lb, L))
        quad.lathe(base + L * 0.125 + Vector((-0.025, 0, 0)), (1, 0, 0), [(0.0, 0.0), (0.0135, 0.0), (0.0165, 0.004), (0.0165, 0.046), (0.0135, 0.05), (0.0, 0.05)], 12, 1 if i == 0 else 2)
    quad.tube([(-0.415, hinge.y, hinge.z), (-0.33, hinge.y, hinge.z)], 0.006, 6, 0, (True, True))
    kit.bits(red_m, 'throttles').lathe(knob_c + Vector((0.0525, 0, 0.004)), (1, 0, 0), [(0.005, 0.0), (0.005, 0.004), (0.0, 0.005)], 8)
    kit.bits(grey_m, 'throttles').box(knob_c + Vector((0.04, 0.0, 0.0165)), (0.012, 0.01, 0.006))
    kit.pivots['throttles'] = HINGE
    Yt = Vector((0, 0.985, -0.174)).normalized()
    Zt = Vector((1, 0, 0)).cross(Yt)
    wrist_t = knob_c - Yt * cp.GRIP[0] - Zt * (cp.GRIP[1] + 0.003)
    Mt = cp.hand_matrix(wrist_t, (1, 0, 0), Yt, Zt)
    inv_t = Mt.inverted()
    pose_t = {'curl': {'index': (56, 84, 34), 'middle': (60, 86, 34), 'ring': (60, 86, 34), 'little': (62, 88, 36)},
              'spread': {'index': 4.0, 'middle': 1.0, 'ring': -2.0, 'little': -6.0},
              'thumb': [(-0.02, 0.022, -0.01), (-0.046, 0.05, -0.014), (-0.058, 0.08, -0.022), (-0.06, 0.102, -0.034)]}
    reach_t = [inv_t @ Vector(p) for p in (wrist_t, wrist_t - Yt * 0.06, (-0.4, 9.44, 2.85), (-0.22, 9.02, 3.04))]
    hand_l = kit.soup(hand_mats, node='hand_throttle', tier=3.2, smooth=50.0)
    hand_l.extend(cp.hand(pose_t, reach_t, left=True).transform(Mt))
    kit.pivots['hand_throttle'] = tuple(wrist_t)
    kit.parents['hand_throttle'] = 'throttles'
    kit.probes['hand_throttle'] = tuple(Mt @ Vector((0.0, 0.095, 0.014)))

    # --- what the game looks for ---------------------------------------------------------------------------
    kit.empty('eye', EYE)
    kit.empty('glow_panel', (0.0, 9.75, 2.93))
    kit.empty('glow_console', (-0.38, 9.72, 3.02))
    kit.seal(os.path.join('/tmp/marazul/flight/art', ASSET['id']))
    a.finish = kit.finish
    cp.source_shot(kit)
