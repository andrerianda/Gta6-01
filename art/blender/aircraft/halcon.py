"""Halcón: the single-seat interceptor of the Marazul Air Guard (15.8 m long, 9.6 m span, 4.7 m to
the fin tip), exterior only. An original design: a pointed radome over a chin intake, a cropped
cranked-delta wing with leading-edge extensions and wingtip rails, low all-moving tailplanes, one
tall swept fin, a dark bubble canopy and a single afterburning nozzle. Two-tone sea grey.

Blender axes: nose to +Y, right wing to +X, wheels on Z = 0 with the gear down, the origin on the
ground under the centre of gravity (catalog flight.layout: nose wheel 4.2 m ahead, mains 0.9 m
behind and 1.4 m out, the eye at 3.6 ahead and 2.75 up, the nozzle 7.3 m behind and 1.7 m up).
"""
import math

import _airframe_parts as ap
import _jet_parts as jp
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


# --- the skin's history ----------------------------------------------------------------------------
# The fuselage is drawn unrolled round its axis (a = station y, b = arc from the top centreline, right
# side positive), the wing, strake and tailplane in plan, the fin in side view, one drawing per side.
ROLL_Z, ROLL_R = 1.88, 0.7
FRAMES = [-6.85, -6.3, -5.6, -4.5, -3.3, -2.0, -1.0, 0.5, 1.8, 2.2, 3.2, 4.2, 4.75, 5.2, 6.3]
LONGERONS = [-180, -140, -90, -35, 35, 90, 140, 180]
LOW_VIS, RESCUE, DANGER, STRIP = '#394147', '#c7a52a', '#a3322a', '#a9b07a'
GREY = dict(roughness=0.5, gloss=0.15, mottle=0.1, tone=0.2, tone_gloss=0.1, wear_color='#b6bab6', wear_rough=0.36, wear_metal=0.75,
            grime_color='#1a1510', grime_rough=0.72, tint_color='#1b1d1f', tint_rough=0.93, seam_depth=0.004, rivet_depth=0.0012,
            dust=0.2, dust_color='#6b6558')


def arc(degrees):
    return math.radians(degrees) * ROLL_R


def _surface(sections, key='x'):
    """at(span position, chord fraction) -> the chart point of a lifting surface drawn in plan (or the fin in side view)."""
    def at(value, fraction):
        s = ap.section_at(sections, value, key)
        return (s['y'] - fraction * s['chord'], value) if key == 'z' else (value, s['y'] - fraction * s['chord'])
    return at


def _scuffs(chart, layer, lo, hi, count, radius=(0.02, 0.07), value=(0.25, 0.5)):
    """Soft patches where the finish is going: the skin's own grain breaks them into chips."""
    for _ in range(count):
        size = chart.rng.uniform(*radius)
        chart.dot(layer, (chart.rng.uniform(lo[0], hi[0]), chart.rng.uniform(lo[1], hi[1])), size, chart.rng.uniform(*value), soft=size * 0.6)


def body_chart():
    c = jp.Chart('body', (-7.5, -arc(180) - 0.03), (8.7, arc(180) + 0.03), 250, roll=(ROLL_Z, ROLL_R), seed=5, ink=LOW_VIS)
    ap.structure(c, lambda degrees, y: (y, arc(degrees)), LONGERONS, FRAMES, merge=0.35, rivets=0.06, tone=0.55)
    for _ in range(9):   # panels repainted in a fresher or an older grey
        centre = (c.rng.uniform(-6.0, 5.0), arc(c.rng.uniform(-150, 150)))
        c.fill('tone', c.box(centre, (c.rng.uniform(0.35, 1.0), c.rng.uniform(0.2, 0.45))), 0.5 + c.rng.choice((-0.38, 0.34, 0.42)))
    # The anti-glare panel ahead of the windscreen, worn through at its edges and where hands go.
    glare = [(4.72, -0.3), (6.3, -0.13), (6.3, 0.13), (4.72, 0.3)]
    c.fill('tint', glare, 1.0)
    c.line('wear', glare + [glare[0]], 0.03, 0.6, soft=0.012)
    _scuffs(c, 'wear', (4.75, -0.26), (6.2, 0.26), 26)
    for side in (-1, 1):
        sill = [(1.8, side * arc(39)), (4.75, side * arc(39))]
        c.seam(sill, 0.012, 1.0, rivets=0.05)
        c.line('grime', sill, 0.03, 0.45, soft=0.012)
        doors = [c.hatch((5.62, side * arc(86)), (0.8, 0.42), fasteners=0.07, latch=True), c.hatch((1.2, side * arc(112)), (0.7, 0.4), fasteners=0.07, latch=True),
                 c.hatch((-2.6, side * arc(116)), (1.5, 0.6), fasteners=0.08, latch=True), c.hatch((-4.9, side * arc(110)), (1.1, 0.5), fasteners=0.08)]
        for door in doors:
            c.streaks('grime', [door[6], door[7]], 4, (0.15, 0.7), (0.012, 0.035), (0.25, 0.7), direction=(-1.0, 0.0))
        # Oil and hydraulic fluid along the belly, rain marks down the flanks, soot and heat round the tail.
        c.streaks('grime', [(3.0, side * arc(170)), (-5.6, side * arc(166))], 16, (0.5, 2.6), (0.02, 0.06), (0.3, 0.9), direction=(-1.0, 0.0))
        c.streaks('grime', [(-6.4, side * arc(35)), (4.6, side * arc(42))], 22, (0.2, 0.75), (0.012, 0.035), (0.12, 0.38), direction=(-0.25, float(side)))
        c.streaks('grime', [(-3.0, side * arc(140)), (-5.9, side * arc(140))], 6, (0.4, 1.3), (0.02, 0.05), (0.3, 0.7), direction=(-1.0, 0.0))
        # Stencils, each reading the right way on its own side.
        right, up = (float(side), 0.0), (0.0, -float(side))
        c.text('RESCATE', (3.45, side * arc(66)), 0.085, right, up, RESCUE, align='center')
        c.mark_line([(3.45, side * arc(58)), (3.45, side * arc(44))], 0.02, RESCUE)
        c.mark_fill([(3.38, side * arc(48)), (3.52, side * arc(48)), (3.45, side * arc(42))], RESCUE)
        c.text('PELIGRO', (4.15, side * arc(124)), 0.07, right, up, DANGER, align='center')
        c.text('TOMA DE AIRE', (4.15, side * arc(133)), 0.04, right, up, DANGER, align='center')
        triangle = [(4.98 - 0.11, side * arc(76)), (4.98 + 0.11, side * arc(76)), (4.98, side * arc(61))]
        c.mark_line(triangle + [triangle[0]], 0.016, DANGER)
        c.text('GUARDIA AEREA', (-1.55, side * arc(78)), 0.115, right, up, LOW_VIS, align='center')
        c.text('PUNTO DE IZADO', (0.3, side * arc(48)), 0.035, right, up, LOW_VIS, align='center')
        c.text('TIPO HALCON', (5.62, side * arc(108)), 0.04, right, up, LOW_VIS, align='center')
        c.mark_fill(c.box((-3.9, side * arc(82)), (0.7, 0.06)), STRIP)
        c.mark_fill(c.box((5.75, side * arc(58)), (0.5, 0.05)), STRIP)
        for degrees in (45, 135):   # lightning diverter strips on the radome
            c.mark_line([(6.45, side * arc(degrees)), (7.75, side * arc(degrees))], 0.012, '#8d949a')
    # Left side only: the ground power door and the single-point refuelling cap with its red ring.
    c.hatch((2.9, -arc(108)), (0.3, 0.22), fasteners=0.05, latch=True)
    c.text('TOMA EXTERNA 28V', (2.9, -arc(96)), 0.032, (-1.0, 0.0), (0.0, 1.0), LOW_VIS, align='center')
    cap = (0.15, -arc(72))
    c.dot('tone', cap, 0.06, 0.25)
    ring = [(cap[0] + 0.095 * math.cos(math.radians(t)), cap[1] + 0.095 * math.sin(math.radians(t))) for t in range(0, 361, 20)]
    c.seam([(cap[0] + 0.06 * math.cos(math.radians(t)), cap[1] + 0.06 * math.sin(math.radians(t))) for t in range(0, 361, 30)], 0.008)
    c.mark_line(ring, 0.014, DANGER)
    c.text('COMBUSTIBLE', (0.15, -arc(60)), 0.04, (-1.0, 0.0), (0.0, 1.0), DANGER, align='center')
    c.streak('grime', (0.1, -arc(74)), 0.9, 0.07, 0.6, direction=(-1.0, -0.15))
    # Right side only: the starter exhaust port and its soot.
    c.dot('seam', (-1.25, arc(104)), 0.045)
    c.streak('grime', (-1.3, arc(104)), 1.9, 0.11, 0.95, direction=(-1.0, 0.1), spread=2.2)
    band = arc(180) + 0.03
    c.fill('grime', [(-6.9, -band), (-6.5, -band), (-6.5, band), (-6.9, band)], 0.7, soft=0.1)
    c.fill('wear', [(-6.55, -band), (-6.0, -band), (-6.0, band), (-6.55, band)], 0.3, soft=0.14)
    c.fill('wear', [(7.95, -band), (8.7, -band), (8.7, band), (7.95, band)], 0.95, soft=0.05)
    return c


def plan_chart(name, upper, seed):
    c = jp.Chart(name, (-0.1, -7.5), (5.0, 5.3), 280, seed=seed, ink='#9aa1a6' if upper else '#5d666c')
    wing, stab, strake = _surface(WING), _surface(STABILATOR), _surface(STRAKE)
    stations = [0.8, 1.4, 2.0, 2.65, 3.3, 3.9, 4.5, 4.7]
    ap.structure(c, wing, stations, [0.0, 0.07, 0.24, 0.43, 0.6, FLAP_FROM, 1.0], merge=0.3, rivets=0.06, tone=0.6)
    ap.structure(c, stab, [0.6, 1.2, 1.9, 2.6], [0.0, 0.1, 0.45, 0.75, 1.0], merge=0.2, rivets=0.06, tone=0.6)
    ap.structure(c, strake, [0.62, 0.85, 1.05], [0.0, 0.25, 0.55], merge=0.0, rivets=0.06, tone=0.5)
    ap.edge_wear(c, [wing(x, 0.0) for x in stations], 0.05, 0.95)
    ap.edge_wear(c, [stab(x, 0.0) for x in (0.6, 2.6)], 0.045, 0.9)
    ap.edge_wear(c, [strake(x, 0.0) for x in (0.62, 1.05)] + [wing(0.8, 0.0)], 0.04, 0.8, reach=0.2)
    hinge = [wing(0.87, FLAP_FROM), wing(4.48, FLAP_FROM)]
    c.streaks('grime', hinge, 26 if upper else 34, (0.15, 0.8), (0.015, 0.04), (0.45, 1.0))
    for x in stations[1:-2]:   # grime that gathers along the rib joints and is drawn aft
        c.streaks('grime', [wing(x, 0.1), wing(x, 0.7)], 3, (0.2, 0.7), (0.015, 0.04), (0.2, 0.55))
    c.fill('grime', c.box((0.78, -5.85), (0.22, 0.4)), 0.8, soft=0.07)
    c.streaks('grime', [(0.7, -5.9), (1.0, -6.0)], 7, (0.2, 0.7), (0.015, 0.035), (0.3, 0.8))
    if upper:
        walk = [(0.82, -1.7), (1.36, -1.7), (1.36, 0.7), (0.82, 0.7)]   # the anti-slip walkway at the root, scuffed by boots
        c.fill('tint', walk, 1.0)
        c.mark_line(walk + [walk[0]], 0.014)
        _scuffs(c, 'wear', (0.88, -1.6), (1.3, 0.6), 22, (0.03, 0.09), (0.2, 0.42))
        door = c.hatch((2.1, -0.5), (0.7, 0.45), fasteners=0.06, latch=True)
        c.streaks('grime', [door[0], door[1]], 4, (0.15, 0.6), (0.012, 0.03), (0.25, 0.6))
        c.hatch((3.35, -1.5), (0.42, 0.26), fasteners=0.05)
        cap = (2.9, -0.55)   # the over-wing filler: cap, red ring, spilt fuel drawn aft
        c.dot('tone', cap, 0.06, 0.25)
        c.seam([(cap[0] + 0.06 * math.cos(math.radians(t)), cap[1] + 0.06 * math.sin(math.radians(t))) for t in range(0, 361, 30)], 0.008)
        c.mark_line([(cap[0] + 0.1 * math.cos(math.radians(t)), cap[1] + 0.1 * math.sin(math.radians(t))) for t in range(0, 361, 20)], 0.014, DANGER)
        c.streak('grime', (cap[0], cap[1] - 0.05), 0.9, 0.09, 0.55)
        c.mark_fill(c.box((4.42, -1.95), (0.06, 0.5)), STRIP)
    else:
        door = c.hatch((1.15, -0.9), (0.75, 1.5), chamfer=0.05, fasteners=None, seam=1.0, width=0.012)
        c.fill('grime', c.box((1.05, -0.9), (0.32, 0.55)), 0.9, soft=0.06)
        c.streaks('grime', [door[0], door[1]], 12, (0.4, 1.9), (0.015, 0.05), (0.35, 0.95))
        for x in (2.3, 3.5):   # pylon stations: a sealed rail and its attachment bolts
            c.hatch((x, wing(x, 0.45)[1]), (0.11, 0.9), chamfer=0.02, fasteners=0.2, tone=0.7)
            c.streaks('grime', [(x - 0.05, wing(x, 0.58)[1]), (x + 0.05, wing(x, 0.58)[1])], 3, (0.2, 0.8), (0.012, 0.03), (0.3, 0.7))
        for p in ((1.9, -1.75), (2.9, -1.3)):   # drains
            c.dot('seam', p, 0.018)
            c.streak('grime', p, c.rng.uniform(0.6, 1.3), 0.03, 0.9, spread=2.4)
    return c


def fin_chart(side):
    c = jp.Chart('fin_r' if side > 0 else 'fin_l', (-7.3, 2.3), (-3.2, 4.85), 280, u=(0, 1, 0), v=(0, 0, 1), seed=31, ink=LOW_VIS)
    fin = _surface(FIN, 'z')
    levels = [2.38, 2.6, 3.1, 3.6, 4.15, 4.52, 4.7]
    ap.structure(c, fin, levels, [0.0, 0.08, 0.38, 0.72, 1.0], merge=0.25, rivets=0.06, tone=0.6)
    ap.edge_wear(c, [fin(z, 0.0) for z in (2.38, 4.7)], 0.045, 0.9)
    c.fill('tone', [fin(4.52, 0.0), fin(4.52, 1.0), fin(4.7, 1.0), fin(4.7, 0.0)], 0.16)   # the dielectric fin cap
    c.streaks('grime', [fin(2.65, 0.72), fin(4.1, 0.72)], 12, (0.15, 0.6), (0.012, 0.03), (0.3, 0.8), direction=(-1.0, -0.2))
    c.streaks('grime', [fin(2.45, 0.1), fin(2.45, 0.9)], 8, (0.1, 0.3), (0.012, 0.03), (0.2, 0.5), direction=(-0.3, -1.0))
    right = (float(side), 0.0)
    c.text('GAM', (-5.05, 3.25), 0.3, right, (0.0, 1.0), LOW_VIS, weight=0.17, align='center')
    c.text('HALCON', (-5.05, 3.05), 0.07, right, (0.0, 1.0), LOW_VIS, align='center')
    c.mark_fill(c.box((-5.75, 4.3), (0.5, 0.06)), STRIP)
    return c


def texel_share(name, centre, normal, material):
    if material in ('seat_fabric',) or name.startswith('gear'):
        return 0.8
    return 0.8 if normal.z < -0.4 else 1.0


def make(a):
    jp.detail_pipeline(a, density=texel_share, quality={'base': 77, 'orm': 64, 'normal': 84})
    asset = ASSET['id']
    body_map, top_map, under_map = body_chart(), plan_chart('plan_top', True, 13), plan_chart('plan_under', False, 17)
    side = jp.skin('grey_body', '#77838c', asset, chart=body_map, symmetric=False, **GREY)
    under = jp.skin('grey_under_body', '#b3bcc2', asset, chart=body_map, symmetric=False, **dict(GREY, dust=0.28, grime=1.0))
    top = jp.skin('grey_top', '#717d86', asset, chart=top_map, **dict(GREY, tint_color='#40474c', tint_rough=0.95))
    under_plan = jp.skin('grey_under', '#b3bcc2', asset, chart=under_map, **dict(GREY, dust=0.28, grime=1.0))
    fin_right = jp.skin('grey_fin_r', '#77838c', asset, chart=fin_chart(1), symmetric=False, **GREY)
    fin_left = jp.skin('grey_fin_l', '#77838c', asset, chart=fin_chart(-1), symmetric=False, **GREY)
    radome = jp.skin('radome', '#4a5157', asset, chart=body_map, symmetric=False, **dict(GREY, roughness=0.4, tone=0.04, wear_color='#8d8573', wear_metal=None, wear_rough=0.8))
    dark = jp.skin('dark_metal', '#17191b', asset, roughness=0.5, metallic=0.5, dust=0.3)
    hot = jp.heat_metal('nozzle_metal', -6.55, -7.36, '#6c645d', 0.48, petals=(18, 1.7))
    steel = jp.skin('gear_steel', '#c0c4c7', asset, roughness=0.4, dust=0.45, grain=0.0006)
    chrome = sf.plain('gear_chrome', '#e2e4e6', 0.09, 1.0)
    hose = sf.plain('gear_hose', '#0e0e0f', 0.55)
    tyre = jp.tyre_rubber('tyre', 0.04)
    glass = sf.glass('glass', '#11181d', 0.62)

    def two_tone(obj, upper):
        mk.assign(obj, upper)
        mk.assign_faces(obj, under_plan, lambda c, n: n.z < -0.3)
        return obj

    def two_sided(obj):
        mk.assign(obj, fin_right)
        return mk.assign_faces(obj, fin_left, lambda c, n: n.x < 0.0)

    # --- fuselage, chin intake, spine, nozzle (the unmirrored level-0 mesh) ---------------------
    body = mk.fuselage('body', BODY, COUNT)
    mk.assign(body, side)
    mk.assign_faces(body, under, lambda c, n: n.z < -0.3)
    mk.assign_faces(body, radome, lambda c, n: c.y > 6.3)
    mk.assign_faces(body, dark, lambda c, n: n.y < -0.95 and c.y < -6.8)
    mk.subdivide(body, 1)
    intake = mk.fuselage('intake', INTAKE, 20)
    mk.assign(intake, under)
    mk.assign_faces(intake, dark, lambda c, n: n.y > 0.95 and c.y > 4.7)
    mk.subdivide(intake, 1)
    lip = mk.assign(mk.tube('intake_lip', [p for p in mk.ring(4.76, 0.84, 0.5, 1.42, 0.0, 20, 3.2)] + [mk.ring(4.76, 0.84, 0.5, 1.42, 0.0, 20, 3.2)[0]], 0.03, 6), side)
    spine = mk.subdivide(mk.assign(mk.fuselage('spine', SPINE, 12), side), 1)
    nozzle = mk.cylinder('nozzle', 0.43, 0.55, (0, -7.03, 1.7), 'Y', 28, 0.52)
    mk.assign(nozzle, hot)
    mk.assign_faces(nozzle, dark, lambda c, n: n.y < -0.9)
    burner = mk.assign(mk.cylinder('burner', 0.33, 0.012, (0, -7.31, 1.7), 'Y', 24), sf.lamp('lamp_burner', '#ffb060', 6.0))
    pitot = mk.assign(mk.tube('pitot', [(0, 8.1, 1.95), (0, 8.5, 1.95)], [0.03, 0.008], 8), steel)
    fin = two_sided(ap.surface('fin', FIN, 0.0, 0.72, 10))
    fin_root = two_sided(ap.surface('fin_root', ap.cut(FIN, 2.38, 2.58, 'z'), 0.72, 1.0, 4))
    fin_tip = two_sided(ap.surface('fin_tip', ap.cut(FIN, 4.17, 4.7, 'z'), 0.72, 1.0, 4))
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
    rudder = mk.shade(two_sided(ap.surface('rudder', ap.cut(FIN, 2.6, 4.15, 'z'), 0.72, 1.0, 5)), 42)
    a.add(mk.set_origin(rudder, ap.hinge(FIN[0], 0.72)))

    # --- canopy --------------------------------------------------------------------------------
    canopy = mk.subdivide(mk.assign(mk.fuselage('canopy', CANOPY, 20), glass), 1)
    frame_ring = mk.ring(2.3, 0.66, 0.6, 2.58, 0.0, 24)
    frame = mk.assign(mk.tube('canopy_frame', [p for p in frame_ring if p[2] >= 2.58], 0.022, 6), dark)
    canopy = mk.shade(mk.join('canopy', [canopy, frame]), 60)
    a.add(mk.set_origin(canopy, (0.0, 2.0, 2.6)))

    # --- landing gear --------------------------------------------------------------------------
    nose_parts = [
        mk.assign(mk.tube('nose_leg', [(0, 4.2, 1.14), (0, 4.2, 0.86)], [0.055, 0.05], 10), steel),
        mk.assign(mk.tube('nose_oleo', [(0, 4.2, 0.88), (0, 4.2, 0.62)], 0.034, 10), chrome),
        mk.assign(mk.tube('nose_link', [(0, 4.25, 0.87), (0, 4.35, 0.75), (0, 4.24, 0.64)], 0.012, 5), steel),
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
        mk.assign(mk.tube('main_leg', [(0.9, -0.9, 1.3), (1.125, -0.9, 0.7)], [0.065, 0.058], 10), steel),
        mk.assign(mk.tube('main_oleo', [(1.115, -0.9, 0.73), (1.2, -0.9, 0.5)], 0.04, 10), chrome),
        mk.assign(mk.tube('main_foot', [(1.195, -0.9, 0.52), (1.24, -0.9, 0.32)], [0.055, 0.05], 10), steel),
        mk.assign(mk.tube('main_link', [(1.07, -0.84, 0.72), (1.11, -0.74, 0.6), (1.19, -0.84, 0.5)], 0.012, 5), steel),
        mk.assign(mk.tube('main_brake_line', [(0.97, -0.96, 1.2), (1.13, -0.97, 0.7), (1.2, -0.96, 0.5), (1.3, -0.94, 0.38)], 0.008, 4), hose),
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
    # (Blender cannot store a list that mixes text and numbers: axis and degrees travel as dictionaries.)
    a.extra('gear_retract', {
        'gear_nose': {'axis': 'x', 'degrees': -95}, 'gear_l': {'axis': 'x', 'degrees': 95}, 'gear_r': {'axis': 'x', 'degrees': 95},
    })
    a.extra('canopy_open', {'axis': 'x', 'degrees': 38})
    a.extra('eye', list(EYE))
    a.lods((0.45, 0.2), (90.0, 260.0))
