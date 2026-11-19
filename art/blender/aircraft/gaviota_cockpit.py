"""Gaviota T-2, the cockpit view's own model: the side-by-side cabin of an original high-wing piston
trainer, in the airframe's frame (gaviota_t2.py: nose +Y, right wing +X, up +Z, wheels on Z = 0).

Seen from the left seat: a padded glare shield over a flat civil panel (the basic six in front of
the pilot, tachometer and fuel beside them, a radio stack, baked engine dials, rocker and toggle
switches, breakers, placards with invented wording), a wrap-round windscreen with a centre strip
and two A-pillars, the heavy carry-through bow under the wing, door windows, sun visors, two seats
with belts, rudder pedals, a centre console with the trim wheel and the flap lever, and Dez's gloved
hands: the left on the yoke (`stick`), the right on the single throttle lever (`throttles`). No
combiner. Built with the cockpit kit of _garza_cockpit_parts.py; nodes per the cockpit contract.
"""
import math
import os

from mathutils import Vector

import _garza_cockpit_parts as cp
from lib import surfaces as sf

ASSET = {'id': 'gaviota_cockpit', 'atlas': 1024}

EYE = (-0.28, 0.3, 1.52)
FOV = 62.0
GAZE = -4.0
FLOOR = 0.6
PANEL_Y = 0.92
YOKE = (-0.28, 0.70, 1.10)          # the left yoke's hub: the `stick` pivot (roll about Y, pitch about X)
HINGE = (0.0, 0.80, 0.985)          # the throttle lever's hinge in its pedestal
LEVER_LEAN = 15.0                   # degrees aft of upright at idle
# The fuselage sections of gaviota_t2.STATIONS around the cabin: y, width, height, centre z, power.
STATIONS = [(-0.80, 1.08, 1.36, 1.255, 2.8), (-0.75, 1.09, 1.38, 1.25, 2.8), (-0.21, 1.14, 1.4, 1.25, 2.8),
            (0.55, 1.14, 1.4, 1.25, 2.8), (1.0, 1.1, 0.78, 1.06, 2.7), (1.3, 1.04, 0.72, 1.06, 2.6)]
REQUIRED = ('cockpit_shell', 'canopy_glass', 'stick', 'hand_stick', 'throttles', 'hand_throttle', 'eye', 'glow_panel', 'glow_console',
            'gauge_airspeed', 'gauge_attitude', 'gauge_altitude', 'gauge_turn', 'gauge_heading', 'gauge_vsi', 'gauge_rpm', 'gauge_fuel')


def _ring(st, ang, shrink):
    w, h, zc, power = st
    a = math.radians(ang)
    c, s = math.cos(a), math.sin(a)
    return Vector((math.copysign(abs(c) ** (2 / power), c) * (w / 2 - shrink), 0.0, zc + math.copysign(abs(s) ** (2 / power), s) * (h / 2 - shrink)))


def hull(y, ang, shrink=0.0):
    """A point of the fuselage skin (the exterior's loft): ang 0 the right waist, 90 the top, 180 the left waist."""
    for (y0, *a), (y1, *b) in zip(STATIONS, STATIONS[1:]):
        if y <= y1 or y1 == STATIONS[-1][0]:
            break
    t = (y - y0) / (y1 - y0)
    p = _ring(a, ang, shrink).lerp(_ring(b, ang, shrink), t)
    return Vector((p.x, y, p.z))


def hull_in(y, ang):
    across = hull(y, ang + 1.0) - hull(y, ang - 1.0)
    along = hull(y + 0.01, ang) - hull(y - 0.01, ang)
    n = across.cross(along).normalized()
    return n if n.dot(Vector((0, y, 1.2)) - hull(y, ang)) > 0 else -n


def edge(ys, ang, shrink=0.0):
    return [(hull(y, ang, shrink), hull_in(y, ang)) for y in ys]


def top_at(y, x, shrink=0.0):
    """The height of the skin's upper half at (x, y)."""
    lo, hi = (0.0, 90.0) if x >= 0 else (90.0, 180.0)
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        if hull(y, mid, shrink).x > x:          # x falls from the right waist (0) over the top to the left waist (180)
            lo = mid
        else:
            hi = mid
    return hull(y, 0.5 * (lo + hi), shrink).z


def screen_base(x):
    """The windscreen's lower edge (it meets the glare shield) at x."""
    return top_at(0.998, x, 0.006)


def lip(x):
    return min(screen_base(x) - 0.026, 1.405)


def floor_angle(y, side, shrink):
    """The angle where the lining meets the floor on one side (side 1 right, -1 left)."""
    lo, hi = -89.0, 0.0
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        if hull(y, mid, shrink).z < FLOOR:
            lo = mid
        else:
            hi = mid
    g = 0.5 * (lo + hi)
    return g if side > 0 else 180.0 - g


def yoke(soup, x0, grip_mat, arm_mat, hub_mat):
    """A ram's-horn yoke on its column: hub, two arms sweeping out and up, ridged horn grips."""
    hub = Vector((x0, YOKE[1], YOKE[2]))
    soup.lathe(hub + Vector((0, 0.012, 0)), (0, -1, 0), [(0.0, 0.0), (0.028, 0.0), (0.034, 0.008), (0.034, 0.03), (0.026, 0.036), (0.0, 0.036)], 12, hub_mat)
    for side in (-1, 1):
        arm = cp.fillet([hub + Vector((side * 0.02, -0.012, 0.0)), hub + Vector((side * 0.09, -0.016, 0.004)), hub + Vector((side * 0.145, -0.018, 0.03)),
                         hub + Vector((side * 0.157, -0.018, 0.068))], 0.04, 4)
        soup.tube(arm, [0.017, 0.0155, 0.0145] + [0.0145] * (len(arm) - 3), 8, arm_mat, (False, False))
        rings = []
        for z, r in ((0.062, 0.0145), (0.07, 0.018), (0.09, 0.0185), (0.11, 0.0172), (0.13, 0.0186), (0.15, 0.0174), (0.17, 0.0188), (0.188, 0.0195),
                     (0.2, 0.017), (0.206, 0.009)):
            lean = (z - 0.06) * 0.12
            c = hub + Vector((side * (0.157 + lean), -0.018 - lean * 0.6, z))
            rings.append([c + Vector((r * math.cos(2 * math.pi * k / 10), 1.12 * r * math.sin(2 * math.pi * k / 10), 0.0)) for k in range(10)])
        soup.loft(rings, grip_mat, True, False, True)
    return hub


def make(a):
    kit = cp.Kit(ASSET['id'], ASSET['atlas'])
    kit.required = REQUIRED
    kit.extras.update({'eye': list(EYE), 'fov': FOV, 'gaze': GAZE, 'throttle_forward': 'negative rotation about x', 'cockpit': 'analog_six',
                       'stick_kind': 'yoke'})
    S = kit.sheet

    # --- materials (albedo 0.10-0.22; black only on bezels, knobs and rubber) ------------------------
    lining = cp.coat('trim_lining', '#837e73', rough=0.78, wear=0.3, dust=0.25, chips=0.0, metal=False, bump=0.25, scuff=0.45, vary=0.1)
    headliner = cp.coat('trim_headliner', '#8d887c', rough=0.92, wear=0.2, dust=0.3, chips=0.0, metal=False, bump=0.4, wrinkle=0.15, vary=0.08)
    frame = cp.coat('coat_frame', '#76797a', rough=0.55, wear=0.5, dust=0.15, chips=0.3)
    panel = cp.coat('coat_panel', '#56595b', rough=0.6, wear=0.35, dust=0.12, chips=0.12)
    sub = cp.coat('coat_subpanel', '#4b4e51', rough=0.55, wear=0.5, dust=0.1, chips=0.2)
    shade = cp.coat('coaming_vinyl', '#3f403f', rough=0.82, wear=0.25, dust=0.55, chips=0.0, metal=False, bump=0.35, wrinkle=0.25, scuff=0.15)
    carpet = cp.coat('floor_carpet', '#4c4b45', rough=0.96, wear=0.6, dust=0.6, chips=0.0, metal=False, bump=0.55, scuff=0.7)
    cushion = cp.coat('seat_fabric', '#4d6770', rough=0.92, wear=0.45, dust=0.15, chips=0.0, metal=False, bump=0.35, wrinkle=0.3)
    seat_shell = cp.coat('seat_shell', '#5d5f5d', rough=0.6, wear=0.5, dust=0.2, chips=0.3)
    webbing = cp.coat('belt_webbing', '#55574f', rough=0.9, wear=0.4, dust=0.1, chips=0.0, metal=False, bump=0.35)
    bezel = cp.coat('bezel_black', '#222325', rough=0.42, wear=0.6, dust=0.12, chips=0.15, under='#8e9092', vary=0.05, scuff=0.1)
    steel = cp.coat('lever_steel', '#8a8d8e', rough=0.38, wear=0.2, dust=0.1, chips=0.0, grime=0.7, vary=0.1)
    rubber = cp.coat('grip_rubber', '#2b2b2d', rough=0.8, wear=0.5, dust=0.2, chips=0.0, metal=False, bump=0.3, vary=0.08)
    sealant = cp.coat('seal_rubber', '#353533', rough=0.85, wear=0.0, dust=0.2, chips=0.0, metal=False, scuff=0.0, bump=0.3)
    tread = cp.coat('tread_metal', '#8c8e8a', rough=0.45, wear=0.3, dust=0.4, chips=0.0, grime=0.9)
    glove = cp.coat('glove_fabric', '#6f7566', rough=0.9, wear=0.35, dust=0.05, chips=0.0, metal=False, bump=0.4, scuff=0.1, grime=0.7)
    leather = cp.coat('glove_leather', '#4d463d', rough=0.62, wear=0.6, dust=0.05, chips=0.0, metal=False, bump=0.2, wrinkle=0.2, grime=0.7)
    strap = cp.coat('glove_trim', '#5f6456', rough=0.85, wear=0.3, dust=0.05, chips=0.0, metal=False, bump=0.3)
    sleeve = cp.coat('suit_sleeve', '#575d4b', rough=0.88, wear=0.3, dust=0.08, chips=0.0, metal=False, bump=0.3, wrinkle=0.7, scuff=0.1)
    boot = cp.coat('boot_leather', '#3b352f', rough=0.55, wear=0.6, dust=0.35, chips=0.0, metal=False, bump=0.2, wrinkle=0.3, scuff=0.5)
    hand_mats = [glove, leather, strap, sleeve]
    bolt_m = sf.plain('bit_bolt', '#6a6c6a', 0.45, 0.6)
    screw_m = sf.plain('bit_screw', '#2c2d2e', 0.4, 0.5)
    chrome_m = sf.plain('bit_chrome', '#b4b5b2', 0.3, 1.0)
    black_m = sf.plain('bit_black', '#1d1d1f', 0.5, 0.0)
    white_m = sf.plain('bit_white', '#c9c8bd', 0.6, 0.0)
    red_m = sf.plain('bit_red', '#9c2b20', 0.5, 0.0)
    grey_m = sf.plain('bit_grey', '#7d807f', 0.5, 0.0)
    bolts, screws, chrome = kit.bits(bolt_m), kit.bits(screw_m), kit.bits(chrome_m)
    black, white, red, grey = kit.bits(black_m), kit.bits(white_m), kit.bits(red_m), kit.bits(grey_m)
    live = cp.live_screen('screen_live')

    # --- the cabin structure: the carry-through bow, pillars, the windscreen strip, sills ---------------
    frames = kit.soup([frame, sealant], tier=1.6)
    ws = [0.555, 0.7, 0.85, 0.998]
    # The heavy bow under the wing's front spar, from sill to sill, and the door posts behind.
    arc = [6.0 + i * 168.0 / 24 for i in range(25)]
    for y0, y1, depth in ((0.49, 0.556, 0.05), (-0.215, -0.145, 0.034), (-0.79, -0.745, 0.03)):
        line = cp.bar(frames, [(hull(y0, g), hull_in(0.5 * (y0 + y1), g)) for g in arc], [(hull(y1, g), hull_in(0.5 * (y0 + y1), g)) for g in arc], depth, chamfer=0.008)
        if y0 > 0:
            cp.studs(bolts, line, 0.07, 0.004, 0.0025)
            cp.bead(frames, [(hull(y1, g), hull_in(y1, g)) for g in arc[3:-3]], mat=1)
    # A-pillars along the windscreen's sides, and the centre strip with its screws.
    for lo, hi in ((17.0, 25.0), (163.0, 155.0)):
        line = cp.bar(frames, edge(ws, lo), edge(ws, hi), 0.036)
        cp.studs(bolts, line, 0.07, 0.004, 0.0025)
        cp.bead(frames, edge(ws[:-1], hi), mat=1)
    line = cp.bar(frames, edge(ws, 88.2), edge(ws, 91.8), 0.012, chamfer=0.003)
    cp.studs(screws, line, 0.055, 0.0032, 0.0018)
    # Window sills and the rails above the side windows, both sides, over the door and the rear window.
    sills = kit.soup([frame, lining], tier=1.3)
    run = [-0.79, -0.5, -0.21, -0.15, 0.2, 0.5]
    for lo, hi in ((4.0, 12.5), (176.0, 167.5), (55.0, 62.0), (125.0, 118.0)):
        cp.bar(sills, edge(run, lo), edge(run, hi), 0.03, 0)
        cp.bead(sills, edge(run, hi if lo < 90 else hi), mat=0)

    # --- the glass -------------------------------------------------------------------------------------
    glass = cp.Soup()
    for lo, hi in ((22.5, 88.2), (91.8, 157.5)):
        angles = [lo + (hi - lo) * i / 5 for i in range(6)]
        glass.grid([[hull(y, g, 0.007) for g in angles] for y in ws], EYE)
    for ys in ([-0.15, 0.17, 0.5], [-0.75, -0.48, -0.21]):
        for lo, hi in ((11.25, 56.25), (123.75, 168.75)):
            angles = [lo + (hi - lo) * i / 3 for i in range(4)]
            glass.grid([[hull(y, g, 0.007) for g in angles] for y in ys], (0, -0.2, 1.25))
    kit.node(glass.to_object('canopy_glass', [cp.see_through('canopy_glass', '#a4b2aa', 0.12)], 30.0))

    # --- the lining: lower walls, headliner, floor, firewall, the bulkhead behind the seats --------------
    tub = kit.soup([lining, headliner, carpet, sub], tier=1.0)
    aft = [-0.77, -0.5, -0.21, -0.15, 0.15, 0.5, 0.55]
    fore = [0.55, 0.7, 0.85, 0.96]
    for side in (1, -1):
        def angles(y, top):
            g0 = floor_angle(y, side, 0.012)
            g1 = top if side > 0 else 180.0 - top
            return [g0 + (g1 - g0) * i / 7 for i in range(8)]
        tub.grid([[hull(y, g, 0.012) for g in angles(y, 12.0)] for y in aft], (0, 0.0, 1.2), 0)
        tub.grid([[hull(y, g, 0.012) for g in [(-40.0 + 62.5 * i / 7) if side > 0 else (220.0 - 62.5 * i / 7) for i in range(8)]] for y in fore], (0, 0.6, 1.2), 0)
    tub.grid([[hull(y, g, 0.014) for g in [57.0 + 66.0 * i / 8 for i in range(9)]] for y in aft[:-1]], (0, 0.0, 1.0), 1)
    # The floor, flat over the cabin, then the footwell following the skin up to the firewall.
    rows = []
    for y in (-0.77, -0.3, 0.2, 0.55):
        g0, g1 = floor_angle(y, 1, 0.012), floor_angle(y, -1, 0.012)
        rows.append([hull(y, g0, 0.012).lerp(hull(y, g1, 0.012), i / 6) for i in range(7)])
    tub.grid(rows, (0, 0.0, 2.0), 2)
    well = [[Vector((p.x, p.y, max(p.z, FLOOR))) for p in [hull(y, -40.0 - 100.0 * i / 10, 0.012) for i in range(11)]] for y in (0.55, 0.7, 0.85, 0.96)]
    tub.grid(well, (0, 0.6, 2.0), 2)
    fire = [Vector((p.x, 0.96, p.z)) for p in [hull(0.96, g, 0.013) for g in range(-180, 1, 10)] if p.z < 0.99]
    fire = [Vector((fire[0].x, 0.96, 0.99))] + fire + [Vector((fire[-1].x, 0.96, 0.99))]
    tub.polygon(fire, (0, 0.0, 0.8), 3)
    tub.polygon([hull(-0.77, g, 0.012) for g in range(0, 360, 12)], (0, 0.0, 1.2), 0)
    # Dressing on the walls: the door's armrest, pull and handle, a map pocket, the right armrest,
    # eyeball vents in the upper corners, a dome lamp.
    dress = kit.soup([lining, bezel, steel, frame], tier=1.4)
    for side in (-1, 1):
        g = 90.0 - side * 104.0
        n = hull_in(0.15, g)
        base = hull(0.15, g, 0.012)
        along = Vector((0, 1, 0))
        dress.box(base + n * 0.035 + Vector((0, 0, -0.01)), (0.07, 0.42, 0.045), 0, axes=(n * -1.0 if side > 0 else n, along, Vector((0, 0, 1))))
        vent = hull(0.4, 90 - side * 20.0, 0.014)
        vn = hull_in(0.4, 90 - side * 20.0)
        dress.lathe(vent, vn, [(0.03, 0.0), (0.03, 0.006), (0.022, 0.01), (0.0, 0.01)], 12, 1)
        dress.lathe(vent + vn * 0.008, vn + Vector((0, 0.3, -0.3)), [(0.0, -0.004), (0.016, 0.0), (0.017, 0.012), (0.012, 0.022), (0.0, 0.022)], 10, 2)
    door = hull(0.3, 184.0, 0.012)
    dn = hull_in(0.3, 184.0)
    dress.tube([door + dn * 0.005 + Vector((0, -0.08, 0.0)), door + dn * 0.04 + Vector((0, -0.06, 0.0)), door + dn * 0.04 + Vector((0, 0.06, 0.0)),
                door + dn * 0.005 + Vector((0, 0.08, 0.0))], 0.009, 6, 1, (False, False))
    handle = hull(0.42, 185.0, 0.012) + hull_in(0.42, 185.0) * 0.012
    dress.box(handle, (0.03, 0.06, 0.03), 3)
    dress.box(handle + Vector((0.03, -0.045, 0.0)), (0.016, 0.12, 0.018), 2)
    pocket = hull(0.1, 205.0, 0.012)
    pn = hull_in(0.1, 205.0)
    dress.box(pocket + pn * 0.012, (0.024, 0.34, 0.16), 0, axes=(pn, Vector((0, 1, 0)), pn.cross(Vector((0, 1, 0)))))
    dome = hull(-0.05, 90.0, 0.014)
    dress.lathe(dome, (0, 0, -1), [(0.05, 0.0), (0.05, 0.008), (0.04, 0.016), (0.0, 0.018)], 14, 3)
    roof_plane = cp.Plane(dome + Vector((0, 0, -0.019)), (1, 0, 0), (0, -1, 0))
    cp.label(kit, roof_plane, 0.0, 0.07, 'LUZ CABINA', 0.05, 0.01, tier=3.0)
    sign_l = cp.Plane(hull(0.42, 200.0, 0.012) + hull_in(0.42, 200.0) * 0.002, (0, 1, 0), (0, 0, 1))
    cp.label(kit, sign_l, 0.0, 0.0, 'PUERTA\nCERRAR ANTES DEL ARRANQUE', 0.11, 0.026, tier=3.0, border=True)

    # --- sun visors folded up against the headliner ------------------------------------------------------------
    visors = kit.soup([headliner, steel], tier=1.2)
    for x in (-0.28, 0.28):
        g = math.degrees(math.acos(max(-1.0, min(1.0, x / 0.55))))
        hinge = hull(0.47, g, 0.062)
        visors.tube([hinge + Vector((-0.17, 0, 0)), hinge + Vector((0.17, 0, 0))], 0.006, 6, 1, (True, True))
        ahead = (hull(0.62, g, 0.062) - hinge).normalized()
        n = Vector((1, 0, 0)).cross(ahead)
        if n.z > 0:
            n = -n
        visors.box(hinge + ahead * 0.085 + n * 0.012, (0.34, 0.17, 0.016), 0, axes=(Vector((1, 0, 0)), ahead, n))

    # --- the glare shield ----------------------------------------------------------------------------------
    hood = kit.soup([shade], tier=1.8)
    xs = [-0.5 + i / 14.0 for i in range(15)]
    LIP_Y = 0.852
    rows = []
    for t in (0.0, 0.3, 0.65, 1.0):
        rows.append([Vector((x, LIP_Y + (0.993 - LIP_Y) * t, lip(x) + (screen_base(x) - 0.004 - lip(x)) * t + 0.006 * math.sin(math.pi * t))) for x in xs])
    hood.grid(rows, (0, 0.6, 2.4), 0)
    hood.tube([Vector((x, LIP_Y - 0.004, lip(x) - 0.006)) for x in xs], 0.014, 8, 0, (True, True))
    under = [[Vector((x, LIP_Y, lip(x) - 0.02)), Vector((x, PANEL_Y, lip(x) - 0.03))] for x in xs]
    hood.grid([[r[0] for r in under], [r[1] for r in under]], (0, 0.6, 0.9), 0)
    for side in (-1, 1):
        x = side * 0.5
        hood.polygon([Vector((x, LIP_Y, lip(x) - 0.02)), Vector((x, 0.993, screen_base(x) - 0.004)), Vector((x, PANEL_Y, lip(x) - 0.03))], (0, 0.9, 1.2), 0)
    kit.probes['glare_shield_lip'] = (EYE[0], LIP_Y - 0.004, lip(EYE[0]) + 0.008)
    kit.probes['glare_shield_centre'] = (0.0, LIP_Y - 0.004, lip(0.0) + 0.008)
    # A compass on the centre strip, just above the glare shield.
    comp = hull(0.97, 90.0, 0.014) + Vector((0, -0.03, -0.012))
    compass = cp.Plane(comp, (1, 0, 0), (0, 0.15, 1))
    dial_soup = kit.soup([bezel], tier=2.2)
    dial_soup.lathe(comp + compass.n * -0.045, compass.n, [(0.026, 0.0), (0.029, 0.006), (0.029, 0.042), (0.025, 0.046), (0.023, 0.041)], 14, 0, ref=(1, 0, 0))
    dial_soup.box(comp + Vector((0, 0.022, 0.03)), (0.012, 0.04, 0.04), 0)
    kit.decals(tier=4.0).on(compass, 0.0, 0.0, 0.046, 0.046, S.dial(0.046, 'RUMBO', ['N', '3', '6', 'E', '12', '15', 'S'], 0.42, 250.0, 3), 0.0005)
    cp.label(kit, compass.lifted(0.002), 0.0, -0.034, 'DESVIO  VER TARJETA', 0.05, 0.007, tier=4.0)

    # --- the panel ----------------------------------------------------------------------------------------
    P = cp.Plane((0.0, PANEL_Y, 0.0), (1, 0, 0), (0, 0, 1))
    main = kit.soup([panel, sub, bezel], tier=2.4)
    outline = [(-0.5, 0.975), (0.5, 0.975)] + [(x, lip(x) - 0.03) for x in reversed(xs)]
    main.polygon([P.pt(u, v) for u, v in outline], EYE, 0)
    main.box(P.pt(0.0, 0.968, 0.012), (1.0, 0.016, 0.03), 0, P.axes())
    rings = kit.soup([bezel], tier=2.6, smooth=50.0)
    pilot = cp.plate(main, screws, P, -0.445, 1.118, -0.1, 1.326, mat=1)
    six = (('gauge_airspeed', -0.385, 1.268, 'VEL  KM/H'), ('gauge_attitude', -0.28, 1.268, 'ACTITUD'), ('gauge_altitude', -0.175, 1.268, 'ALTITUD'),
           ('gauge_turn', -0.385, 1.165, 'VIRAJE'), ('gauge_heading', -0.28, 1.165, 'RUMBO'), ('gauge_vsi', -0.175, 1.165, 'VARIO'))
    for name, x, z, text in six:
        cp.gauge_ring(rings, screws, pilot, x, z, 0.038, 24)
        cp.live_face(kit, live, pilot, x, z, 0.038, name)
    engine = cp.plate(main, screws, P, -0.098, 1.118, 0.012, lip(0.0) - 0.04, mat=1)
    cp.gauge_ring(rings, screws, engine, -0.043, 1.272, 0.034, 20)
    cp.live_face(kit, live, engine, -0.043, 1.272, 0.034, 'gauge_rpm')
    cp.label(kit, engine, -0.043, 1.226, 'RPM x100', 0.034, 0.007, tier=4.0)
    dials = kit.decals(tier=4.0)

    def baked_dial(plane, x, z, radius, rect):
        cp.gauge_ring(rings, screws, plane, x, z, radius, 16)
        dials.on(plane, x, z, radius * 2, radius * 2, rect, 0.001)

    baked_dial(engine, -0.043, 1.17, 0.026, S.dial(0.052, 'ACEITE\nTEMP  PRES', [0, 25, 50, 75, 100], 0.52, band=[(0.35, 0.8, S.GREEN), (0.92, 1.0, S.RED)]))
    # The radio stack: a com/nav set with two frequency windows, the transponder, an audio strip.
    stack = cp.plate(main, screws, P, 0.02, 1.118, 0.205, lip(0.11) - 0.04, mat=1)
    radios = kit.soup([bezel, sub], tier=2.4)
    for z, h in ((1.285, 0.06), (1.212, 0.05)):
        radios.box(stack.pt(0.112, z, 0.012), (0.17, h, 0.024), 0, P.axes())
    face_r = stack.lifted(0.024)
    dials.on(face_r, 0.075, 1.293, 0.06, 0.018, S.window('118.30', 0.06, 0.018), 0.0006)
    dials.on(face_r, 0.15, 1.293, 0.06, 0.018, S.window('121.90', 0.06, 0.018), 0.0006)
    dials.on(face_r, 0.09, 1.218, 0.06, 0.016, S.window('7000', 0.06, 0.016), 0.0006)
    for x in (0.045, 0.18):
        cp.knob(black, white, face_r, x, 1.27, 0.009, 0.012, turn=30.0)
    for i in range(4):
        cp.knob(black, white, face_r, 0.14 + i * 0.016, 1.205, 0.005, 0.007)
    cp.label(kit, face_r, 0.112, 1.262, 'COM 1        NAV 1', 0.12, 0.006, tier=5.0)
    cp.label(kit, face_r, 0.06, 1.2, 'TRANSP', 0.03, 0.006, tier=5.0)
    for i in range(6):
        black.box(stack.pt(0.045 + i * 0.026, 1.163, 0.006), (0.018, 0.012, 0.008), axes=P.axes())
    cp.label(kit, stack, 0.112, 1.147, 'AUDIO  COM 1  COM 2  NAV  ADF  ALTAV  INT', 0.16, 0.006, tier=4.0)
    cp.label(kit, stack, 0.112, 1.132, 'GAVIOTA T-2   N/S 0412', 0.07, 0.008, tier=4.0, border=True)
    # Right of the stack: fuel quantity (live), baked dials, the clock, the hour meter.
    right = cp.plate(main, screws, P, 0.215, 1.118, 0.45, 1.312, mat=1)
    cp.gauge_ring(rings, screws, right, 0.255, 1.272, 0.032, 20)
    cp.live_face(kit, live, right, 0.255, 1.272, 0.032, 'gauge_fuel')
    cp.label(kit, right, 0.255, 1.228, 'COMB  IZQ - DER', 0.05, 0.007, tier=4.0)
    baked_dial(right, 0.335, 1.272, 0.026, S.dial(0.052, 'AMP', [-60, -30, 0, 30, 60], 0.55))
    baked_dial(right, 0.405, 1.17, 0.022, S.dial(0.044, 'VACIO', [3, 4, 5, 6, 7], 0.5, band=[(0.3, 0.7, S.GREEN)]))
    baked_dial(right, 0.255, 1.17, 0.026, S.dial(0.052, 'RELOJ', [12, 2, 4, 6, 8, 10, ''], 0.31, 360.0, 2, second=0.62))
    baked_dial(right, 0.335, 1.17, 0.026, S.dial(0.052, 'TEMP\nCULATA', [100, 200, 300, 400, 500], 0.46, band=[(0.3, 0.75, S.GREEN), (0.9, 1.0, S.RED)]))
    dials.on(right, 0.4, 1.248, 0.05, 0.016, S.window('1847.3', 0.05, 0.016), 0.0006)
    cp.label(kit, right, 0.4, 1.23, 'HORAS', 0.03, 0.006, tier=4.0)
    cp.label(kit, P.lifted(0.003), 0.44, 1.05, 'MANIOBRAS ACROBATICAS\nY BARRENAS PROHIBIDAS', 0.12, 0.018, tier=4.0, ink=S.BLACK, ground=S.YELLOW, border=True)
    # The caution strip above the radios.
    tiles = kit.soup([bezel], tier=2.4)
    cp.lamp_tiles(kit, tiles, stack, 0.112, lip(0.11) - 0.058, ['VOLT BAJO', 'ACEITE', 'VACIO', 'COMB BAJO'], [S.AMBER, S.RED, S.AMBER, S.AMBER], 4, 0.036, 0.012, tier=5.0)
    # The lower panel: the master and magneto switches, rockers, a breaker row, push-pull knobs.
    lower = cp.plate(main, screws, P, -0.48, 0.985, 0.48, 1.11, mat=1)
    # Split master rocker (red), key switch for the magnetos.
    for i, dx in enumerate((-0.012, 0.012)):
        red.box(lower.pt(-0.44 + dx, 1.075, 0.006), (0.02, 0.034, 0.012), axes=P.axes())
    cp.label(kit, lower, -0.44, 1.098, 'BAT  ALT', 0.034, 0.007, tier=4.0)
    cp.knob(black, white, lower, -0.385, 1.075, 0.016, 0.012, turn=-90.0, seg=10)
    grey.box(lower.pt(-0.385, 1.075, 0.02), (0.004, 0.022, 0.012), axes=P.axes())
    cp.label(kit, lower, -0.385, 1.098, 'MAGNETOS', 0.04, 0.007, tier=4.0)
    cp.label(kit, lower, -0.385, 1.05, 'OFF  D  I  AMB  ARR', 0.05, 0.006, tier=4.0)
    for i, text in enumerate(('BOMBA', 'BALIZA', 'ATERR', 'NAV', 'ESTROB', 'PITOT', 'AVION')):
        x = -0.33 + i * 0.03
        cp.toggle(chrome, lower, x, 1.075, 22.0 if i % 3 else -22.0)
        cp.label(kit, lower, x, 1.098, text, 0.028, 0.0065, tier=4.0)
    for r in range(2):
        for c in range(8):
            cp.breaker(black, white, lower, 0.18 + c * 0.03, 1.08 - r * 0.045, out=(r, c) == (1, 5))
        cp.label(kit, lower, 0.285, 1.062 - r * 0.045, ('ALT  BAT  RADIO 1  RADIO 2  TRANSP  LUCES  PITOT  INSTR', 'BOMBA  FLAP  ARR  BALIZA  NAV  ESTROB  PANEL  TOMA')[r],
                  0.24, 0.0065, tier=4.0)
    for x, text, colour in ((-0.17, 'AIRE CARB', black), (-0.115, 'CEBADOR', black), (0.1, 'MEZCLA', red)):
        colour.lathe(lower.pt(x, 1.04, 0.0), P.n, [(0.006, 0.0), (0.006, 0.018), (0.014, 0.02), (0.016, 0.03), (0.012, 0.036), (0.0, 0.037)], 10, ref=P.r)
        cp.label(kit, lower, x, 1.012, text, 0.04, 0.0065, tier=4.0)
    cp.label(kit, lower, -0.07, 1.06, 'PANEL', 0.026, 0.0065, tier=4.0)
    cp.knob(black, white, lower, -0.07, 1.04, 0.01, 0.012, turn=40)
    kit.probes['panel_centre'] = tuple(P.pt(-0.28, 1.22))

    # --- the throttle pedestal and the yoke columns --------------------------------------------------------
    ped = kit.soup([sub, bezel, steel], tier=1.6)
    ped.box((0.0, 0.825, 0.945), (0.1, 0.19, 0.08), 0)
    TQ = cp.Plane((0.0, 0.825, 0.985), (1, 0, 0), (0, 1, 0))
    black.box(TQ.pt(0.0, -0.01, 0.0004), (0.012, 0.13, 0.0008))
    for dv, text in ((-0.075, 'RALENTI'), (0.06, 'MAX')):
        cp.label(kit, TQ, 0.03, dv, text, 0.03, 0.006, tier=4.0)
    cp.label(kit, TQ, -0.032, 0.0, 'GASES', 0.03, 0.007, tier=4.0, turn=90.0)
    ped.lathe((0.051, 0.79, 0.955), (1, 0, 0), [(0.012, 0.0), (0.012, 0.004), (0.009, 0.006), (0.008, 0.014), (0.0, 0.015)], 10, 1)
    for x in (-0.28, 0.28):
        ped.lathe((x, PANEL_Y, 1.10), (0, -1, 0), [(0.03, 0.0), (0.03, 0.006), (0.02, 0.01), (0.017, 0.01), (0.017, 0.02), (0.0, 0.02)], 12, 2)
    # The right seat's yoke (it stays put: only the pilot's yoke is a live node).
    right_yoke = kit.soup([rubber, steel, bezel], tier=1.8)
    right_yoke.tube([(0.28, PANEL_Y - 0.01, 1.10), (0.28, YOKE[1] + 0.02, 1.10)], 0.013, 8, 1, (False, False))
    yoke(right_yoke, 0.28, 0, 0, 2)

    # --- the centre console between the seats: trim wheel, flap lever, fuel selector -------------------
    con = kit.soup([sub, bezel, steel], tier=1.4)
    con.box((0.0, 0.28, 0.67), (0.13, 0.6, 0.14), 0)
    C = cp.Plane((0.0, 0.28, 0.741), (1, 0, 0), (0, 1, 0))
    con.lathe((-0.012, 0.36, 0.69), (1, 0, 0), [(0.0, 0.0), (0.072, 0.0), (0.075, 0.004), (0.075, 0.02), (0.072, 0.024), (0.0, 0.024)], 26, 1)
    for k in range(13):
        a_ = 2 * math.pi * k / 13
        black.box((0.0, 0.36 + 0.076 * math.cos(a_), 0.69 + 0.076 * math.sin(a_)), (0.022, 0.006, 0.006))
    cp.label(kit, C, 0.045, 0.1, 'TRIM\nPICAR\n\n\nENCABR', 0.03, 0.04, tier=3.0, turn=90.0)
    con.tube([(0.035, 0.12, 0.74), (0.035, 0.09, 0.8), (0.035, 0.0, 0.84)], 0.009, 6, 2, (False, False))
    con.box((0.035, -0.035, 0.845), (0.03, 0.08, 0.028), 1)
    cp.label(kit, C, -0.035, -0.12, 'FLAP\n0\n10\n20\n30', 0.025, 0.05, tier=3.0)
    sel = cp.plate(con, screws, C, -0.055, 0.18, 0.055, 0.29, mat=0)
    kit.decals(tier=3.0).on(sel, 0.0, 0.235, 0.1, 0.1, S.dial(0.1, 'COMBUSTIBLE', ['IZQ', 'AMB', 'DER', 'CERR'], 1.0 / 3.0, 270.0, 1), 0.0006)
    red.box(sel.pt(0.0, 0.235, 0.012), (0.014, 0.08, 0.022), axes=sel.axes())

    # --- rudder pedals ---------------------------------------------------------------------------------
    pedals = kit.soup([steel, tread], tier=1.0)
    lean = math.radians(20)
    axes = (Vector((1, 0, 0)), Vector((0, math.cos(lean), -math.sin(lean))), Vector((0, math.sin(lean), math.cos(lean))))
    for x0 in (-0.28, 0.28):
        for dx in (-0.1, 0.1):
            c = Vector((x0 + dx, 0.87, 0.73))
            pedals.box(c, (0.085, 0.012, 0.13), 1, axes)
            for k in (-0.045, -0.015, 0.015, 0.045):
                pedals.box(c + axes[2] * k - axes[1] * 0.008, (0.08, 0.005, 0.007), 1, axes)
            pedals.tube([c + axes[2] * 0.06 + Vector((0, 0.01, 0)), Vector((x0 + dx, 0.93, 0.86))], 0.008, 6, 0, (False, False))
    pedals.tube([(-0.47, 0.93, 0.86), (0.47, 0.93, 0.86)], 0.012, 8, 0, (True, True))

    # --- the seats ---------------------------------------------------------------------------------------
    seats = kit.soup([seat_shell, cushion, webbing, steel], tier=1.1)
    tilt = math.radians(10)
    up_b, out_b = Vector((0, -math.sin(tilt), math.cos(tilt))), Vector((0, math.cos(tilt), math.sin(tilt)))
    for x0 in (-0.28, 0.28):
        seats.box((x0, 0.3, 0.765), (0.44, 0.48, 0.04), 0)
        seats.box((x0, 0.31, 0.82), (0.42, 0.46, 0.08), 1)
        seats.tube([(x0 - 0.2, 0.545, 0.835), (x0 + 0.2, 0.545, 0.835)], 0.032, 8, 1, (True, True))
        for dx in (-0.17, 0.17):
            for y in (0.12, 0.48):
                seats.tube([(x0 + dx, y, 0.745), (x0 + dx, y, FLOOR + 0.012)], 0.011, 6, 3, (False, False))
            seats.box((x0 + dx, 0.3, FLOOR + 0.008), (0.025, 0.7, 0.016), 3)
        back = Vector((x0, 0.06, 1.13))
        seats.box(back, (0.44, 0.05, 0.62), 0, axes=(Vector((1, 0, 0)), out_b, up_b))
        seats.box(back + out_b * 0.04 + up_b * 0.01, (0.4, 0.05, 0.56), 1, axes=(Vector((1, 0, 0)), out_b, up_b))
        seats.tube([back + up_b * 0.31 + Vector((-0.2, 0, 0)) + out_b * 0.035, back + up_b * 0.31 + Vector((0.2, 0, 0)) + out_b * 0.035], 0.035, 8, 1, (True, True))
        for k in (-0.12, 0.0, 0.12):
            seats.box(back + out_b * 0.066 + up_b * (0.01 + k), (0.38, 0.004, 0.006), 1, axes=(Vector((1, 0, 0)), out_b, up_b))
    # Belts: on the empty right seat they lie loose; the pilot's lap belt is fastened over the thighs.
    for side in (-1, 1):
        x = 0.28 + side * 0.2
        seats.strip([Vector((x, 0.16, 0.81)), Vector((x - side * 0.02, 0.24, 0.863)), Vector((0.28 + side * 0.04, 0.33, 0.864))], 0.045, 0.003, Vector((0, 0, 1)), 2)
    seats.box((0.28, 0.335, 0.868), (0.06, 0.045, 0.008), 3)
    shoulder = [Vector((0.53, -0.08, 1.48)), Vector((0.42, 0.097, 1.33)), Vector((0.33, 0.132, 1.1)), Vector((0.29, 0.2, 0.875)), Vector((0.29, 0.31, 0.866))]
    seats.strip(shoulder, 0.045, 0.003, [out_b, out_b, out_b, (out_b + Vector((0, 0, 1))).normalized(), Vector((0, 0, 1))], 2)
    for side in (-1, 1):
        seats.strip([Vector((-0.28 + side * 0.21, 0.16, 0.85)), Vector((-0.28 + side * 0.19, 0.27, 1.012)), Vector((-0.28 + side * 0.04, 0.3, 1.02))], 0.045, 0.004,
                    [Vector((side, 0, 0.5)).normalized(), Vector((0, 0.3, 1)).normalized(), Vector((0, 0.3, 1)).normalized()], 2)
    seats.box((-0.28, 0.305, 1.026), (0.065, 0.05, 0.01), 3)

    # --- Dez's legs, boots on the pedals -------------------------------------------------------------------
    legs = kit.soup([sleeve, boot, rubber], tier=1.5, smooth=50.0)
    for side in (-1, 1):
        x = -0.28 + side * 0.1
        cp.leg(legs, (x, 0.17, 0.93), (x + side * 0.03, 0.55, 1.05), (x + side * 0.01, 0.77, 0.70), (x, 0.845, 0.765), (0, 1, 2))

    # --- the yoke (`stick`) with Dez's left hand -------------------------------------------------------------
    stick = kit.soup([rubber, steel, bezel], node='stick', tier=2.4)
    stick.tube([(YOKE[0], PANEL_Y - 0.02, YOKE[2]), (YOKE[0], YOKE[1] + 0.02, YOKE[2])], 0.013, 8, 1, (False, False))
    hub = yoke(stick, YOKE[0], 0, 0, 2)
    kit.bits(red_m, 'stick').lathe(hub + Vector((-0.157 - 0.016, -0.018 - 0.016, 0.205)), (0, 0, 1), [(0.0045, 0.0), (0.0045, 0.004), (0.0, 0.005)], 8)
    kit.bits(grey_m, 'stick').box(hub + Vector((-0.05, -0.02, 0.012)), (0.03, 0.006, 0.02))
    kit.bits(grey_m, 'stick').box(hub + Vector((0.05, -0.02, 0.012)), (0.03, 0.006, 0.02))
    kit.pivots['stick'] = YOKE
    grip = hub + Vector((-(0.157 + 0.07 * 0.12), -0.018 - 0.07 * 0.12 * 0.6, 0.13))
    Yh = Vector((0.36, 0.933, 0.0)).normalized()
    across = Vector((0.0, 0.0, 1.0))
    Zh = across.cross(Yh)
    wrist = grip - Yh * cp.GRIP[0] - Zh * cp.GRIP[1]
    M = cp.hand_matrix(wrist, across, Yh, Zh)
    inv = M.inverted()
    pose = {'curl': {'index': (50, 66, 24), 'middle': (62, 80, 28), 'ring': (66, 84, 30), 'little': (70, 86, 34)},
            'spread': {'index': 3.0, 'middle': 1.0, 'ring': -2.0, 'little': -5.0},
            'thumb': [(-0.02, 0.022, -0.01), (-0.044, 0.048, -0.012), (-0.056, 0.078, -0.02), (-0.057, 0.1, -0.035)]}
    reach = [inv @ Vector(p) for p in (wrist, wrist - Yh * 0.06, (-0.5, 0.36, 1.1), (-0.47, 0.18, 1.36))]
    hand_l = kit.soup(hand_mats, node='hand_stick', tier=3.0, smooth=50.0)
    hand_l.extend(cp.hand(pose, reach, left=True).transform(M))
    kit.pivots['hand_stick'] = tuple(wrist)
    kit.parents['hand_stick'] = 'stick'
    kit.probes['hand_stick'] = tuple(M @ Vector((0.03, 0.095, 0.014)))
    kit.probes['yoke_hub'] = tuple(hub)

    # --- the throttle lever with Dez's right hand ---------------------------------------------------------------
    quad = kit.soup([steel, rubber], node='throttles', tier=2.4)
    a_lean = math.radians(LEVER_LEAN)
    L = Vector((0, -math.sin(a_lean), math.cos(a_lean)))
    Lb = L.cross(Vector((1, 0, 0)))
    hinge = Vector(HINGE)
    knob_c = hinge + L * 0.125
    quad.box(hinge + L * 0.06, (0.008, 0.022, 0.125), 0, axes=(Vector((1, 0, 0)), Lb, L))
    quad.lathe(knob_c + Vector((-0.035, 0, 0)), (1, 0, 0), [(0.0, 0.0), (0.0135, 0.0), (0.0165, 0.005), (0.0165, 0.065), (0.0135, 0.07), (0.0, 0.07)], 12, 1)
    quad.tube([(-0.045, hinge.y, hinge.z), (0.045, hinge.y, hinge.z)], 0.006, 6, 0, (True, True))
    kit.pivots['throttles'] = HINGE
    Yt = Vector((0, 0.985, -0.174)).normalized()
    Zt = Vector((1, 0, 0)).cross(Yt)
    wrist_t = knob_c - Yt * cp.GRIP[0] - Zt * (cp.GRIP[1] + 0.003)
    Mt = cp.hand_matrix(wrist_t, (1, 0, 0), Yt, Zt)
    inv_t = Mt.inverted()
    pose_t = {'curl': {'index': (56, 84, 34), 'middle': (60, 86, 34), 'ring': (60, 86, 34), 'little': (62, 88, 36)},
              'spread': {'index': 4.0, 'middle': 1.0, 'ring': -2.0, 'little': -6.0},
              'thumb': [(-0.02, 0.022, -0.01), (-0.046, 0.05, -0.014), (-0.058, 0.08, -0.022), (-0.06, 0.102, -0.034)]}
    reach_t = [inv_t @ Vector(p) for p in (wrist_t, wrist_t - Yt * 0.06, (-0.04, 0.42, 1.0), (-0.12, 0.2, 1.33))]
    hand_r = kit.soup(hand_mats, node='hand_throttle', tier=3.0, smooth=50.0)
    hand_r.extend(cp.hand(pose_t, reach_t).transform(Mt))
    kit.pivots['hand_throttle'] = tuple(wrist_t)
    kit.parents['hand_throttle'] = 'throttles'
    kit.probes['hand_throttle'] = tuple(Mt @ Vector((0.0, 0.095, 0.014)))

    # --- what the game looks for -------------------------------------------------------------------------
    kit.empty('eye', EYE)
    kit.empty('glow_panel', (-0.1, PANEL_Y - 0.25, 1.2))
    kit.empty('glow_console', (0.0, 0.62, 1.05))
    kit.seal(os.path.join('/tmp/marazul/flight/art', ASSET['id']))
    a.finish = kit.finish
    cp.source_shot(kit)
