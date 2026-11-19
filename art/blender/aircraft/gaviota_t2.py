"""Gaviota T-2: MARAZUL's two-seat strut-braced high-wing piston trainer on a fixed tricycle gear
(8.6 m span, 6.9 m long, 2.6 m to the fin tip). An original design: a flat-four cowl with a
two-blade propeller, a glazed side-by-side cabin under a constant-chord wing with squared tips,
a slim tail cone and a swept fin. Cream tintable paint with a teal cheat line.

Blender axes: nose to +Y, right wing to +X, wheels on Z = 0, the origin on the ground under the
centre of gravity (catalog flight.layout: nose wheel 1.55 m ahead, mains 0.45 m behind and 1.1 m
out, propeller hub 2.4 m ahead and 1.25 m up, the pilot's eye at 0.3, -0.28, 1.52).
The cabin interior is `cockpit_lod0`; the game paints the gauges on the `instrument_panel` quad.
"""
import math

import _airframe_parts as ap
import _jet_parts as jp
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'gaviota_t2', 'atlas': 2048}

COUNT = 32          # points per fuselage ring: facet i spans 11.25 degrees from the right waist upwards
EYE = (-0.28, 0.3, 1.52)
HUB = (0.0, 2.4, 1.25)

STATIONS = [
    {'y': -4.25, 'w': 0.06, 'h': 0.16, 'z': 1.46, 'power': 2.1},
    {'y': -3.6, 'w': 0.22, 'h': 0.34, 'z': 1.43, 'power': 2.1},
    {'y': -2.7, 'w': 0.42, 'h': 0.56, 'z': 1.39, 'power': 2.2},
    {'y': -1.9, 'w': 0.68, 'h': 0.84, 'z': 1.34, 'power': 2.4},
    {'y': -1.35, 'w': 0.9, 'h': 1.1, 'z': 1.3, 'power': 2.6},
    {'y': -0.80, 'w': 1.08, 'h': 1.36, 'z': 1.255, 'power': 2.8},
    {'y': -0.75, 'w': 1.09, 'h': 1.38, 'z': 1.25, 'power': 2.8},
    {'y': -0.21, 'w': 1.14, 'h': 1.4, 'z': 1.25, 'power': 2.8},
    {'y': -0.15, 'w': 1.14, 'h': 1.4, 'z': 1.25, 'power': 2.8},
    {'y': 0.50, 'w': 1.14, 'h': 1.4, 'z': 1.25, 'power': 2.8},
    {'y': 0.55, 'w': 1.14, 'h': 1.4, 'z': 1.25, 'power': 2.8},
    {'y': 1.0, 'w': 1.1, 'h': 0.78, 'z': 1.06, 'power': 2.7},
    {'y': 1.3, 'w': 1.04, 'h': 0.72, 'z': 1.06, 'power': 2.6},
    {'y': 1.8, 'w': 0.96, 'h': 0.6, 'z': 1.11, 'power': 2.6},
    {'y': 2.15, 'w': 0.84, 'h': 0.52, 'z': 1.15, 'power': 2.5},
    {'y': 2.3, 'w': 0.7, 'h': 0.44, 'z': 1.18, 'power': 2.4},
]
SEG_REAR_WINDOW, SEG_DOOR, SEG_WINDSCREEN = 6, 8, 10      # ring spans between the pillars
LINER_FIRST, LINER_LAST = 5, 11                            # stations the cabin liner runs between

WING = [
    {'x': 0.0, 'y': 0.75, 'z': 2.0, 'chord': 1.45, 'thickness': 0.13, 'camber': 0.03},
    {'x': 4.2, 'y': 0.68, 'z': 2.07, 'chord': 1.32, 'thickness': 0.12, 'camber': 0.03, 'twist': -2.0},
    {'x': 4.3, 'y': 0.58, 'z': 2.072, 'chord': 1.12, 'thickness': 0.09, 'camber': 0.02, 'twist': -2.0},
]
STAB = [
    {'x': 0.0, 'y': -3.4, 'z': 1.46, 'chord': 0.9, 'thickness': 0.09, 'camber': 0.0},
    {'x': 1.45, 'y': -3.56, 'z': 1.46, 'chord': 0.66, 'thickness': 0.08, 'camber': 0.0},
]
FIN = [
    {'x': 0.0, 'y': -2.95, 'z': 1.5, 'chord': 1.32, 'thickness': 0.09, 'camber': 0.0, 'cant': 90.0},
    {'x': 0.0, 'y': -3.72, 'z': 2.6, 'chord': 0.58, 'thickness': 0.08, 'camber': 0.0, 'cant': 90.0},
]


def side_window(i):
    return 1 <= i <= 4 or 11 <= i <= 14


# --- the skin's history ----------------------------------------------------------------------------
# The game knows two tintable paints by name (paint: body, fin, struts, legs; paint_wing: wing and
# tailplane), so each is ONE material reading ONE chart: the body unrolled round its axis with the
# fin's side view standing on it as an annex, and the wing and tailplane in plan with their undersides
# drawn beside the tops. A clean aeroplane that flies every day: riveted panels, chipped leading
# edges, oil and exhaust drawn back under the cowling, boot marks at the door.
ROLL_Z, ROLL_R = 1.25, 0.55
HALF = math.pi * ROLL_R
FIN_B = HALF + 0.1 - 1.45          # the fin annex: chart b = FIN_B + z
UNDER = 5.5                        # the wing chart's undersides lie this far along b
TRIM, RED, ALLOY = '#1f6f73', '#a3322a', '#b4b6b2'
PAINT = dict(roughness=0.3, gloss=0.12, mottle=0.05, tone=0.07, tone_gloss=0.08, wear_color=ALLOY, wear_rough=0.36, wear_metal=0.8,
             grime_color='#2a231c', grime_rough=0.62, grime=0.85, tint_color='#18191a', tint_rough=0.9, seam_depth=0.003, seam_dark=0.5, rivet_depth=0.001, dust=0.12, dust_color='#8a8271')


def arc(degrees):
    return math.radians(degrees) * ROLL_R


def _ring(centre, radius, step=20):
    return [(centre[0] + radius * math.cos(math.radians(t)), centre[1] + radius * math.sin(math.radians(t))) for t in range(0, 361, step)]


def _scuffs(chart, layer, lo, hi, count, radius=(0.005, 0.02), value=(0.4, 0.9)):
    for _ in range(count):
        chart.dot(layer, (chart.rng.uniform(lo[0], hi[0]), chart.rng.uniform(lo[1], hi[1])), chart.rng.uniform(*radius), chart.rng.uniform(*value))


def body_chart():
    c = jp.Chart('body', (-4.45, -HALF - 0.03), (2.45, HALF + 1.35), 380, roll=(ROLL_Z, ROLL_R), seed=71, ink=TRIM)
    c.annex = (-2.85, 1.685, -0.093, FIN_B)
    c.rivet_radius = 0.0035
    frames = [-4.25, -3.6, -2.7, -1.9, -1.35, -0.8, -0.15, 0.55, 1.0, 1.32, 1.8, 2.3]
    ap.structure(c, lambda degrees, y: (y, arc(degrees)), [-180, -128, -78, -25, 25, 78, 128, 180], frames, merge=0.3, rivets=0.035, tone=0.5, width=0.006, row=0.012)
    c.rivets([(1.03, -HALF), (1.03, HALF)], 0.09, 0.008)            # the cowling's quick-release fasteners
    c.rivets([(1.03, arc(52)), (2.25, arc(52))], 0.11, 0.008)
    c.rivets([(1.03, -arc(52)), (2.25, -arc(52))], 0.11, 0.008)
    glare = [(1.02, -arc(24)), (2.2, -arc(15)), (2.2, arc(15)), (1.02, arc(24))]               # the anti-glare panel on the cowl, worn at its edges
    c.fill('tint', glare, 1.0)
    c.line('wear', glare + [glare[0]], 0.016, 0.7, soft=0.006)
    _scuffs(c, 'wear', (1.05, -arc(20)), (2.15, arc(20)), 30, (0.004, 0.014))
    c.hatch((1.62, arc(36)), (0.22, 0.18), chamfer=0.03, fasteners=None, latch=True)          # the oil filler door
    luggage = c.hatch((-1.15, arc(106)), (0.5, 0.4), chamfer=0.05, fasteners=None, latch=True, tone=0.4)
    c.text('EQUIPAJE MAX 20 KG', (-1.15, arc(122)), 0.026, (1.0, 0.0), (0.0, -1.0), '#30383a', align='center')
    for side in (-1, 1):
        right, up = (float(side), 0.0), (0.0, -float(side))
        c.mark_line([(-3.5, side * arc(95.5)), (2.24, side * arc(95.5))], 0.014)                  # the pinstripe under the cheat line
        c.text('GAVIOTA T-2', (1.62, side * arc(109)), 0.06, right, up, '#1d5055', align='center')
        c.dot('seam', (-1.75, side * arc(100)), 0.012)                                             # static port
        c.mark_line(_ring((-1.75, side * arc(100)), 0.035), 0.008, RED)
        # Oil and exhaust under the cowling, seeps from the cowl joint, rain marks under the sills.
        c.streak('grime', (1.2, side * arc(175)), 3.9, 0.15, 0.8, direction=(-1.0, 0.0), spread=2.0)
        c.streaks('grime', [(1.3, side * arc(148)), (1.3, side * arc(179))], 7, (0.8, 2.9), (0.02, 0.05), (0.3, 0.8), direction=(-1.0, 0.0))
        c.streaks('grime', [(1.0, side * arc(105)), (1.0, side * arc(172))], 8, (0.12, 0.5), (0.012, 0.03), (0.25, 0.6), direction=(-1.0, 0.0))
        c.streaks('grime', [(-0.75, side * arc(93)), (0.5, side * arc(93))], 9, (0.1, 0.35), (0.01, 0.022), (0.1, 0.3), direction=(-0.2, float(side)))
    c.streak('grime', (1.3, arc(153)), 2.7, 0.17, 0.95, direction=(-1.0, 0.04), spread=2.4)      # the exhaust pipe is on the right
    # The pilot's door (left): the handle's outline, how to open it, boot marks on the sill below.
    handle = c.box((-0.02, -arc(101)), (0.13, 0.04))
    c.mark_line(handle + [handle[0]], 0.007, '#30383a')
    c.text('ABRIR >', (0.2, -arc(108)), 0.026, (-1.0, 0.0), (0.0, 1.0), '#30383a', align='center')
    _scuffs(c, 'wear', (-0.2, -arc(132)), (0.55, -arc(114)), 34)
    _scuffs(c, 'grime', (-0.2, -arc(130)), (0.55, -arc(100)), 16, (0.01, 0.03), (0.2, 0.5))
    c.fill('wear', [(2.21, -HALF), (2.45, -HALF), (2.45, HALF), (2.21, HALF)], 0.85, soft=0.03)   # the cowl's nose ring, chipped
    _scuffs(c, 'wear', (1.0, -HALF), (2.2, HALF), 40, (0.004, 0.012), (0.5, 0.9))

    # The annex: the fin and rudder in side view.
    def fin(z, fraction):
        s = ap.section_at(FIN, z, 'z')
        return (s['y'] - fraction * s['chord'], FIN_B + z)

    ap.structure(c, fin, [1.56, 1.9, 2.25, 2.6], [0.0, 0.15, 0.62, 1.0], merge=0.15, rivets=0.035, tone=0.5, width=0.006, row=0.012)
    ap.edge_wear(c, [fin(1.56, 0.0), fin(2.6, 0.0)], 0.03, 0.9, reach=0.12)
    c.streaks('grime', [fin(1.66, 0.62), fin(2.5, 0.62)], 8, (0.08, 0.3), (0.008, 0.02), (0.25, 0.7), direction=(-1.0, -0.3))
    c.mark_line([fin(2.3, -0.1), fin(2.3, 1.1)], 0.07)            # the fin band: one broad and one fine stripe
    c.mark_line([fin(2.2, -0.1), fin(2.2, 1.1)], 0.018)
    return c


def plan_chart():
    c = jp.Chart('plan', (-0.1, -4.45), (4.45, 0.95 + UNDER), 380, seed=83, ink=RED)
    c.under = UNDER
    c.rivet_radius = 0.0035
    for drop in (0.0, UNDER):
        lower = drop > 0.0

        def wing(x, fraction, drop=drop):
            s = ap.section_at(WING, x)
            return (x, s['y'] - fraction * s['chord'] + drop)

        def stab(x, fraction, drop=drop):
            s = ap.section_at(STAB, x)
            return (x, s['y'] - fraction * s['chord'] + drop)

        ap.structure(c, wing, [0.6, 1.02, 1.44, 1.86, 2.35, 2.77, 3.19, 3.61, 4.1, 4.3], [0.0, 0.12, 0.3, 0.72, 1.0], merge=0.1, rivets=0.035, tone=0.5, width=0.006, row=0.012)
        ap.structure(c, stab, [0.06, 0.4, 0.75, 1.1, 1.45], [0.0, 0.25, 0.6, 1.0], merge=0.1, rivets=0.035, tone=0.5, width=0.006, row=0.012)
        ap.edge_wear(c, [wing(x, 0.0) for x in (0.5, 4.2, 4.3)], 0.035, 0.95, reach=0.16)
        ap.edge_wear(c, [stab(x, 0.0) for x in (0.0, 1.45)], 0.03, 0.9, reach=0.12)
        c.streaks('grime', [wing(0.65, 0.72), wing(4.05, 0.72)], 26 if lower else 12, (0.06, 0.32), (0.008, 0.02), (0.25, 0.8))
        c.streaks('grime', [stab(0.1, 0.6), stab(1.4, 0.6)], 10 if lower else 5, (0.05, 0.22), (0.008, 0.018), (0.25, 0.7))
        if lower:
            brace = wing(2.25, 0.3)                       # where the strut meets the wing: a fitting, grease, what runs from it
            c.hatch(brace, (0.14, 0.22), chamfer=0.02, fasteners=0.05, tone=0.7)
            c.streaks('grime', [(brace[0] - 0.06, brace[1] - 0.1), (brace[0] + 0.06, brace[1] - 0.1)], 5, (0.15, 0.55), (0.01, 0.025), (0.35, 0.85))
            for p in (wing(1.3, 0.55), wing(0.85, 0.5)):   # fuel drains
                c.dot('seam', p, 0.012)
                c.streak('grime', p, c.rng.uniform(0.25, 0.5), 0.022, 0.8, spread=2.2)
            c.dot('seam', wing(3.3, 0.3), 0.015)          # tie-down ring
            c.hatch(wing(1.6, 0.5), (0.2, 0.14), chamfer=0.02, fasteners=0.045)   # inspection covers
            c.hatch(wing(3.0, 0.5), (0.2, 0.14), chamfer=0.02, fasteners=0.045)
        else:
            cap = wing(1.5, 0.3)                          # the fuel filler: cap, red ring, a little spilt fuel
            c.dot('tone', cap, 0.04, 0.2)
            c.seam(_ring(cap, 0.04, 30), 0.006)
            c.mark_line(_ring(cap, 0.07), 0.01, RED)
            c.streak('grime', (cap[0], cap[1] - 0.04), 0.55, 0.06, 0.45)
            _scuffs(c, 'wear', (1.25, cap[1] - 0.2), (1.75, cap[1] + 0.2), 18, (0.004, 0.012))
    return c


def texel_share(name, centre, normal, material):
    if name.startswith('cockpit') or name.startswith('gear'):
        return 0.7
    return 0.9 if normal.z < -0.4 else 1.0


def make(a):
    jp.detail_pipeline(a, density=texel_share, quality={'base': 84, 'orm': 74, 'normal': 92})
    asset = ASSET['id']
    body_map, plan_map = body_chart(), plan_chart()
    cream = jp.skin('paint', '#ffffff', asset, chart=body_map, symmetric=False, paint_color='#EFE9DA', **PAINT)
    cream_wing = jp.skin('paint_wing', '#ffffff', asset, chart=plan_map, paint_color='#EFE9DA', **PAINT)
    teal = jp.skin('cheat_line', TRIM, asset, chart=body_map, symmetric=False, **dict(PAINT, roughness=0.33, tone=0.1))
    teal_tip = jp.skin('trim_teal', TRIM, asset, chart=plan_map, **dict(PAINT, roughness=0.33, tone=0.1))
    glass = sf.glass('glass', '#2a3b44', 0.3)
    dark = jp.skin('dark_metal', '#1d1f22', asset, roughness=0.55, metallic=0.6, dust=0.3)
    steel = jp.skin('steel', '#a9adb2', asset, roughness=0.34, metallic=1.0, dust=0.3)
    chrome = sf.plain('gear_chrome', '#e2e4e6', 0.09, 1.0)
    hose = sf.plain('gear_hose', '#0e0e0f', 0.55)
    tyre = jp.tyre_rubber('tyre', 0.032)
    trim = sf.coated('cabin_trim', '#6f7275', 0.8, 0.0, 0.3, grain=0.2)
    cloth = sf.fabric('seat_fabric', '#2f4a57')
    belts = sf.plain('belts', '#15171a', 0.8)
    black = sf.plain('black_plastic', '#0d0e10', 0.5)
    red = sf.plain('red_plastic', '#a01c16', 0.45)

    # --- fuselage: skin, cheat line, glazing, the pilot's door --------------------------------
    body = mk.fuselage('body', STATIONS, COUNT)
    mk.assign(body, cream)
    ap.facet_assign(body, teal, COUNT, lambda k, i: i in (0, 15) and k >= 2)
    ap.facet_assign(body, glass, COUNT, lambda k, i: (k == SEG_WINDSCREEN and 2 <= i <= 13) or (k in (SEG_REAR_WINDOW, SEG_DOOR) and side_window(i)))
    ap.facet_assign(body, dark, COUNT, lambda k, i: False)
    mk.assign_faces(body, dark, lambda c, n: n.y > 0.95 and c.y > 2.25)
    mk.shade(body, 38)
    door_skin = ap.facet_split(body, 'door_skin', COUNT, lambda k, i: k == SEG_DOOR and 11 <= i <= 20)

    liner_rings = []
    for s in STATIONS[LINER_FIRST:LINER_LAST + 1]:
        liner_rings.append(mk.ring(s['y'], s['w'] * 0.955, s['h'] * 0.955, s['z'], 0.0, COUNT, s['power']))
    liner = mk.flip(mk.loft('liner', liner_rings))
    mk.assign(liner, trim)
    mk.shade(liner, 38)
    first = LINER_FIRST
    door_liner = ap.facet_split(
        liner, 'door_liner', COUNT, lambda k, i: k + first == SEG_DOOR and 15 <= i <= 20,
        drop=lambda k, i: (k + first == SEG_WINDSCREEN and 2 <= i <= 13) or (k + first in (SEG_REAR_WINDOW, SEG_DOOR) and side_window(i)))
    door = mk.join('door_fl', [door_skin, door_liner])
    a.add(mk.set_origin(door, (-0.57, 0.5, 1.25)))

    # --- fin, exhaust, lamps (the unmirrored level-0 mesh) -------------------------------------
    fin = ap.surface('fin', FIN, 0.0, 0.62)
    mk.assign(fin, cream)
    mk.shade(fin, 40)
    fin_tip = ap.surface('fin_tip', ap.cut(FIN, 2.55, 2.6, 'z'), 0.62, 1.0, 4)
    fin_root = ap.surface('fin_root', ap.cut(FIN, 1.5, 1.62, 'z'), 0.62, 1.0, 4)
    for part in (fin_tip, fin_root):
        mk.shade(mk.assign(part, cream), 40)
    pipe = mk.assign(mk.tube('exhaust', [(0.22, 1.75, 0.86), (0.22, 1.55, 0.78), (0.22, 1.3, 0.7)], 0.03, 8), dark)
    intake = mk.assign(mk.box('chin_scoop', (0.3, 0.3, 0.1), (0.0, 2.05, 0.9), 0.04, 2), dark)
    lamps = [
        ap.lamp_bulb('nav_red', (-4.31, 0.1, 2.07), sf.lamp('lamp_nav_red', '#ff2a1a', 4.0)),
        ap.lamp_bulb('nav_green', (4.31, 0.1, 2.07), sf.lamp('lamp_nav_green', '#2bff6a', 4.0)),
        ap.lamp_bulb('beacon', (0.0, -3.95, 2.62), sf.lamp('lamp_beacon', '#ff2a1a', 5.0), (0.07, 0.1, 0.07)),
        ap.lamp_bulb('strobe', (0.0, -4.27, 1.46), sf.lamp('lamp_strobe', '#f4f6ff', 6.0), (0.05, 0.06, 0.05)),
        ap.lamp_bulb('landing', (0.0, 2.27, 0.99), sf.lamp('lamp_landing', '#fff4dc', 6.0), (0.12, 0.06, 0.08)),
    ]
    a.add(mk.join('lod0', [body, fin, fin_tip, fin_root, pipe, intake] + lamps))

    # --- wing half, tailplane half, strut: mirrored after the bake -----------------------------
    half = [ap.surface('wing_main', WING, 0.0, 0.72, 12)]
    half.append(ap.surface('wing_te_root', ap.cut(WING, 0.0, 0.6), 0.72, 1.0, 4))
    half.append(ap.surface('wing_te_tip', ap.cut(WING, 4.12, 4.3), 0.72, 1.0, 4))
    half.append(ap.surface('stab_main', STAB, 0.0, 0.6, 8))
    for part in half:
        mk.shade(mk.assign(part, cream_wing), 40)
    for part in (half[0], half[2]):      # the squared wingtips in the trim colour
        mk.assign_faces(part, teal_tip, lambda c, n: c.x > 4.2)
    strut = mk.tube('strut', [(0.5, 0.36, 0.74), (1.3, 0.34, 1.33), (2.25, 0.32, 1.97)], 0.032, 8)
    mk.map_points(strut, lambda p: (p.x, 0.34 + (p.y - 0.34) * 2.4, p.z))
    half.append(mk.shade(mk.assign(strut, cream), 60))
    a.add(mk.join('wing_lod0', half), mirror=True)

    # --- control surfaces ----------------------------------------------------------------------
    flap_sections, aileron_sections = ap.cut(WING, 0.62, 2.35), ap.cut(WING, 2.38, 4.1)
    for name, sections in (('flap', flap_sections), ('aileron', aileron_sections)):
        right = mk.shade(mk.assign(ap.surface(name + '_r', sections, 0.72, 1.0, 5), cream_wing), 40)
        left = ap.mirror_copy(right, name + '_l')
        mid = ap.cut(sections, 0.5 * (sections[0]['x'] + sections[-1]['x']), sections[-1]['x'])[0]
        pivot = ap.hinge(mid, 0.72)
        a.add(mk.set_origin(right, pivot))
        a.add(mk.set_origin(left, (-pivot[0], pivot[1], pivot[2])))
    elevator_r = mk.assign(ap.surface('elevator_half', ap.cut(STAB, 0.06, 1.45), 0.6, 1.0, 5), cream_wing)
    elevator = mk.shade(mk.join('elevator', [elevator_r, ap.mirror_copy(elevator_r, 'elevator_left')]), 40)
    a.add(mk.set_origin(elevator, ap.hinge(STAB[0], 0.6)))
    rudder = mk.shade(mk.assign(ap.surface('rudder', ap.cut(FIN, 1.63, 2.54, 'z'), 0.62, 1.0, 5), cream), 40)
    a.add(mk.set_origin(rudder, ap.hinge(FIN[0], 0.62)))

    # --- propeller -----------------------------------------------------------------------------
    blade = mk.wing('blade', [
        {'x': 0.1, 'y': HUB[1] + 0.03, 'z': HUB[2] + 0.05, 'chord': 0.11, 'thickness': 0.3, 'twist': 62},
        {'x': 0.45, 'y': HUB[1] + 0.02, 'z': HUB[2] + 0.075, 'chord': 0.155, 'thickness': 0.14, 'twist': 72},
        {'x': 0.8, 'y': HUB[1] + 0.01, 'z': HUB[2] + 0.06, 'chord': 0.12, 'thickness': 0.09, 'twist': 79},
        {'x': 0.925, 'y': HUB[1] + 0.005, 'z': HUB[2] + 0.03, 'chord': 0.06, 'thickness': 0.08, 'twist': 81},
    ], 8)
    mk.assign(blade, sf.coated('prop_black', '#17181a', 0.4, 0.0, 0.3))
    mk.assign_faces(blade, sf.coated('prop_tip', '#d8b020', 0.45), lambda c, n: c.x > 0.82)
    other = mk.duplicate(blade, 'blade_b')
    mk.transform(other, (0, 0, 2 * HUB[2]), (0, 180, 0))
    spinner = mk.loft('spinner', [
        [(HUB[0] + r * math.cos(2 * math.pi * i / 20), y, HUB[2] + r * math.sin(2 * math.pi * i / 20)) for i in range(20)]
        for y, r in ((2.3, 0.17), (2.38, 0.165), (2.47, 0.13), (2.55, 0.075), (2.6, 0.012))])
    mk.assign(spinner, steel)
    propeller = mk.shade(mk.join('propeller', [blade, other, spinner]), 45)
    a.add(mk.set_origin(propeller, HUB))
    blur = mk.assign(mk.disc('propeller_blur', 0.925, HUB, 'Y', 36), sf.glass('glass_blur', '#3a3a3a', 0.25))
    a.add(mk.set_origin(blur, HUB))

    # --- landing gear --------------------------------------------------------------------------
    def fairing(name, x, y):
        pants = mk.fuselage(name, [
            {'y': y - 0.42, 'w': 0.03, 'h': 0.05, 'z': 0.3}, {'y': y - 0.25, 'w': 0.15, 'h': 0.24, 'z': 0.31, 'x': x},
            {'y': y, 'w': 0.2, 'h': 0.3, 'z': 0.31, 'x': x}, {'y': y + 0.2, 'w': 0.17, 'h': 0.25, 'z': 0.3, 'x': x},
            {'y': y + 0.3, 'w': 0.04, 'h': 0.06, 'z': 0.28, 'x': x},
        ], 14)
        mk.map_points(pants, lambda p: (p.x if abs(p.y - y) < 0.35 else x + (p.x - x), p.y, p.z))
        return mk.shade(mk.assign(pants, cream), 50)

    nose_leg = mk.assign(mk.tube('nose_leg', [(0, 1.5, 0.82), (0, 1.512, 0.62)], [0.03, 0.028], 8), steel)
    nose_oleo = mk.assign(mk.tube('nose_oleo', [(0, 1.511, 0.64), (0, 1.535, 0.42)], 0.018, 8), chrome)
    nose_foot = mk.assign(mk.tube('nose_foot', [(0, 1.534, 0.43), (0, 1.55, 0.3)], [0.026, 0.022], 8), steel)
    nose_link = mk.assign(mk.tube('nose_link', [(0, 1.545, 0.63), (0, 1.62, 0.53), (0, 1.565, 0.43)], 0.008, 5), steel)
    nose = mk.join('gear_nose', [nose_leg, nose_oleo, nose_foot, nose_link, ap.wheel('nose_wheel', 0.2, 0.12, (0, 1.55, 0.2), tyre, steel), fairing('nose_pants', 0.0, 1.55)])
    a.add(mk.set_origin(nose, (0, 1.5, 0.82)))
    leg = mk.tube('main_leg', [(0.42, -0.4, 0.66), (0.8, -0.43, 0.42), (1.04, -0.45, 0.24)], 0.03, 8)
    mk.map_points(leg, lambda p: (p.x, -0.43 + (p.y + 0.43) * 2.6, p.z))
    mk.shade(mk.assign(leg, cream), 60)
    brake_line = mk.assign(mk.tube('brake_line', [(0.44, -0.5, 0.66), (0.8, -0.52, 0.435), (1.02, -0.53, 0.27)], 0.006, 4), hose)
    right = mk.join('gear_r', [leg, brake_line, ap.wheel('main_wheel', 0.2, 0.13, (1.1, -0.45, 0.2), tyre, steel), fairing('main_pants', 1.1, -0.45)])
    left = ap.mirror_copy(right, 'gear_l')
    a.add(mk.set_origin(right, (0.42, -0.4, 0.66)))
    a.add(mk.set_origin(left, (-0.42, -0.4, 0.66)))

    # --- cabin ---------------------------------------------------------------------------------
    floor = 0.6
    cabin = [liner, mk.assign(mk.box('floor', (1.02, 1.8, 0.03), (0, 0.1, floor - 0.015)), sf.coated('floor_mat', '#3b3d40', 0.85, 0.0, 0.5))]
    cabin += ap.seat('seat_l', -0.28, 0.22, floor, cloth, dark, belts=belts)
    cabin += ap.seat('seat_r', 0.28, 0.22, floor, cloth, dark, belts=belts)
    panel_body = mk.assign(mk.box('panel_body', (1.04, 0.07, 0.5), (0, 0.965, 1.17), 0.012), sf.coated('panel_grey', '#26282b', 0.6, 0.1, 0.2))
    coaming = mk.assign(mk.box('coaming', (1.06, 0.2, 0.035), (0, 0.93, 1.425), 0.012), sf.coated('coaming_vinyl', '#141516', 0.75, 0.0, 0.3))
    console = mk.assign(mk.box('console', (0.13, 0.62, 0.13), (0, 0.32, floor + 0.065), 0.015), sf.coated('console_grey', '#2c2e31', 0.6))
    quadrant = mk.assign(mk.box('quadrant', (0.2, 0.1, 0.16), (0, 0.9, 0.9), 0.015), dark)
    cabin += [panel_body, coaming, console, quadrant]
    cabin += ap.knob('throttle', (-0.035, 0.9, 0.93), (-0.035, 0.76, 0.95), steel, black, 0.024)
    cabin += ap.knob('mixture', (0.035, 0.9, 0.93), (0.035, 0.79, 0.945), steel, red, 0.02)
    flap_lever = mk.assign(mk.tube('flap_lever', [(0.03, 0.42, floor + 0.12), (0.03, 0.34, floor + 0.2), (0.03, 0.2, floor + 0.24)], 0.011, 6), steel)
    flap_grip = mk.assign(mk.box('flap_grip', (0.035, 0.09, 0.03), (0.03, 0.17, floor + 0.245), 0.008), black)
    trim_wheel = mk.assign(mk.cylinder('trim_wheel', 0.075, 0.025, (-0.04, 0.52, floor + 0.13), 'X', 20), black)
    cabin += [flap_lever, flap_grip, trim_wheel]
    for x in (-0.28, 0.28):
        cabin.append(mk.assign(mk.tube('yoke_column', [(x, 0.93, 1.1), (x, 0.7, 1.12)], 0.014, 8), steel))
        cabin.append(mk.assign(mk.tube('yoke_grip', [
            (x - 0.15, 0.68, 1.2), (x - 0.15, 0.69, 1.13), (x - 0.08, 0.7, 1.1), (x + 0.08, 0.7, 1.1), (x + 0.15, 0.69, 1.13), (x + 0.15, 0.68, 1.2),
        ], 0.016, 8), black))
        for dx in (-0.1, 0.1):
            cabin.append(mk.assign(mk.box('pedal', (0.09, 0.025, 0.13), (x + dx, 0.93, floor + 0.13), 0.006), steel))
    for part in cabin[1:]:
        mk.shade(part, 45)
    a.add(mk.join('cockpit_lod0', cabin))

    panel = mk.quad('instrument_panel', [(-0.475, 0.925, 1.02), (0.475, 0.925, 1.02), (0.475, 0.925, 1.38), (-0.475, 0.925, 1.38)])
    a.add(mk.assign(panel, sf.screen('screen_panel')))

    # --- anchors, collision, extras ------------------------------------------------------------
    a.anchor('seat_driver', (-0.28, 0.2, floor + 0.25))
    a.anchor('seat_passenger_1', (0.28, 0.2, floor + 0.25))
    a.anchor('camera', EYE)
    a.anchor('door_driver', (-1.45, -0.55, 0.0), (0, 0, -90))
    a.anchor('exhaust_1', (0.22, 1.3, 0.7), (0, 0, 180))
    a.anchor('wingtip_l', (-4.3, 0.0, 2.07))
    a.anchor('wingtip_r', (4.3, 0.0, 2.07))
    a.anchor('gear_nose', (0, 1.55, 0))
    a.anchor('gear_l', (-1.1, -0.45, 0))
    a.anchor('gear_r', (1.1, -0.45, 0))
    a.anchor('light_landing', (0, 2.32, 0.99))
    a.collider_box('fuselage', (1.15, 6.85, 1.4), (0, -0.85, 1.25))
    a.collider_box('wing', (8.6, 1.45, 0.2), (0, 0.03, 2.03))
    a.collider_box('tail', (2.9, 1.3, 1.2), (0, -3.7, 2.0))
    a.extra('panel_size', [0.95, 0.36])
    # (Blender cannot store a list that mixes text and numbers: axis and degrees travel as a dictionary.)
    a.extra('door_open', {'axis': 'z', 'degrees': -72})
    a.extra('eye', list(EYE))
    a.lods((0.5, 0.22), (60.0, 180.0))
