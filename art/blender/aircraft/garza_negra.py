"""Garza Negra: an original long black high-altitude reconnaissance jet, 31 m long and 16.4 m
across, standing on its gear with the origin on the ground under the centre of gravity.

A needle fuselage with a long heron-neck nose carries broad thin chines that widen into a cranked
delta wing; two large nacelles sit mid-wing with spiked intakes, a glowing burner disc in each
nozzle and an inward-canted all-moving fin on top. The crew sit in tandem under small flat panes:
a fixed V windshield, an opening front canopy and a fixed rear glazing. The front cockpit is a
1960s analog office: seat, stick, twin throttles on the left console, switch blocks, a coaming and
the `instrument_panel` quad the game paints its round gauges on.
Nose to +Y, right wing to +X; layout numbers are the catalog's (game/src/catalog/vehicleCatalog.js).
"""
import math

import bpy

import _airframe_parts as ap
import _jet_parts as jp
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'garza_negra', 'atlas': 2048}

EYE = (0.0, 9.2, 3.3)
FLOOR = 2.05
WING_Z = 2.3
HINGE_Y = -8.55
ELEVON_SPANS = ((1.15, 3.25), (5.2, 7.8))
NACELLE_X = 4.2
EDGE = [(0.0, 16.5), (0.35, 15.8), (1.0, 10.0), (1.7, 5.5), (4.2, -0.5), (8.2, -8.0)]
SKIN_DEPTH = [(0.0, 0.42), (1.7, 0.42), (4.2, 0.30), (8.2, 0.07)]


def interpolate(points, x):
    x = min(max(x, points[0][0]), points[-1][0])
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return points[-1][1]


def leading(x):
    x = abs(x)
    return sum(interpolate(EDGE, max(x + d, 0.0)) for d in (-0.12, 0.0, 0.12)) / 3.0


def trailing(x):
    return -9.6 + 0.04 * abs(x)


WING = jp.Planform(leading, trailing, lambda x: WING_Z, lambda x: interpolate(SKIN_DEPTH, abs(x)) / (leading(x) - trailing(x)), camber=0.0)

# The fuselage, nose to tail (half sections).
BODY = [
    {'y': 17.6, 'w': 0.06, 'h': 0.06, 'z': 2.14}, {'y': 17.0, 'w': 0.2, 'h': 0.18, 'z': 2.18}, {'y': 16.0, 'w': 0.46, 'h': 0.4, 'z': 2.25},
    {'y': 14.0, 'w': 0.85, 'h': 0.75, 'z': 2.32}, {'y': 12.0, 'w': 1.15, 'h': 1.1, 'z': 2.32}, {'y': 10.9, 'w': 1.35, 'h': 1.35, 'z': 2.3},
    {'y': 10.2, 'w': 1.5, 'h': 1.5, 'z': 2.3}, {'y': 8.4, 'w': 1.55, 'h': 1.5, 'z': 2.3}, {'y': 6.7, 'w': 1.6, 'h': 1.5, 'z': 2.3},
    {'y': 5.2, 'w': 1.7, 'h': 1.8, 'z': 2.42}, {'y': 0.0, 'w': 1.8, 'h': 1.85, 'z': 2.42}, {'y': -5.0, 'w': 1.7, 'h': 1.7, 'z': 2.42},
    {'y': -9.0, 'w': 1.2, 'h': 1.2, 'z': 2.45}, {'y': -12.0, 'w': 0.6, 'h': 0.6, 'z': 2.5}, {'y': -13.4, 'w': 0.1, 'h': 0.1, 'z': 2.52},
]
BODY_ANGLES = [-90, -75, -60, -45, -30, -15, 0, 15, 30, 45, 54, 66, 78, 90]
COCKPIT_WELL = {(k, i) for k in (6, 7) for i in (10, 11, 12)}

# The glazing over the two cockpits, front to back (half sections above the sill).
GLAZING = [
    {'y': 10.8, 'w': 0.3, 'h': 0.1, 'z': 2.9}, {'y': 10.55, 'w': 0.9, 'h': 0.3, 'z': 2.9}, {'y': 9.9, 'w': 1.0, 'h': 1.66, 'z': 2.9},
    {'y': 8.4, 'w': 1.0, 'h': 1.7, 'z': 2.9}, {'y': 8.25, 'w': 1.0, 'h': 1.7, 'z': 2.9}, {'y': 6.7, 'w': 1.0, 'h': 1.66, 'z': 2.9},
    {'y': 5.6, 'w': 0.8, 'h': 1.0, 'z': 2.95}, {'y': 4.0, 'w': 0.4, 'h': 0.7, 'z': 3.0},
]
GLAZING_ANGLES = [0, 8, 45, 50, 88, 90]


def wing_stations():
    return [0.0, 0.2, 0.35, 0.5, 0.7, 0.85, 1.0, 1.14, 1.15, 1.4, 1.7, 2.0, 2.5, 3.0, 3.25, 3.26, 3.6, 4.2, 4.8, 5.19, 5.2,
            5.6, 6.0, 6.5, 7.0, 7.4, 7.8, 7.81, 8.0, 8.15, 8.2]


def elevon_hinge(x):
    return HINGE_Y if any(lo <= x <= hi for lo, hi in ELEVON_SPANS) else None


# --- the skin's history ----------------------------------------------------------------------------
# A blackened titanium skin: stiffening corrugations pressed along the airflow into the hot panels,
# smooth wedges along every edge, fuel and oil weeping aft from the joints, the metal showing bronze
# where heat and air have taken the black off. The wing is drawn in plan, the body and each nacelle
# unrolled round their axes, the fins in side view (one drawing per side, so the serial reads).
BODY_ROLL = (2.38, 0.85)
NACELLE_ROLL = (2.4, 0.9, NACELLE_X)
FIN = [
    {'x': NACELLE_X, 'y': -4.9, 'z': 3.2, 'chord': 3.7, 'cant': 90, 'thickness': 0.045, 'camber': 0.0},
    {'x': NACELLE_X - 0.3, 'y': -6.15, 'z': 4.3, 'chord': 2.6, 'cant': 90, 'thickness': 0.045, 'camber': 0.0},
    {'x': NACELLE_X - 0.58, 'y': -7.3, 'z': 5.4, 'chord': 1.5, 'cant': 90, 'thickness': 0.045, 'camber': 0.0},
]
BLACK = dict(color='#30313a', roughness=0.46, metallic=0.5, gloss=0.14, mottle=0.12, sheen=[('#1c2b44', 0.5)], tone=0.24, tone_gloss=0.1,
             wear_color='#5e4b3a', wear_rough=0.4, wear_metal=0.85, grime_color='#090808', grime_rough=0.22, tint_color='#292a30', tint_rough=0.56,
             tint_metal=0.15, seam_depth=0.004, rivet_depth=0.0012, dust=0.12, dust_color='#4c4a48')
SERIAL, NO_STEP, RESCUE = '#70737b', '#74332c', '#b8992c'


def roll_arc(roll, degrees):
    return math.radians(degrees) * roll[1]


def _edge(points_x):
    return [(x, leading(x)) for x in points_x]


def wing_chart(name, upper, seed):
    c = jp.Chart(name, (-0.1, -9.8), (8.4, 16.7), 120, seed=seed, ink=NO_STEP)
    c.rivet_radius = 0.008

    def at(x, y):
        return (x, max(min(y, leading(x) - 0.1), trailing(x)))

    stations = [0.45, 0.9, 1.7, 2.5, 3.3, 5.1, 5.9, 6.7, 7.5, 8.2]
    spars = [-9.6, HINGE_Y, -6.5, -4.4, -2.3, -0.2, 2.0, 4.0, 5.5, 7.0, 8.5, 10.0, 11.5, 13.0, 14.5, 16.0]
    ap.structure(c, at, stations, spars, merge=0.35, rivets=0.11, tone=0.6, seam=0.9, width=0.014, row=0.03)
    # Smooth wedges: the chine, the whole leading edge, the elevons.
    edge = _edge([0.0, 0.35, 0.6, 1.0, 1.35, 1.7, 2.5, 3.3, 4.2, 5.2, 6.2, 7.2, 8.2])
    c.fill('tint', edge[:6] + [(0.9, 5.5), (0.9, 16.2), (0.0, 16.6)], 1.0)
    c.line('tint', edge, 0.8, 1.0)
    for lo, hi in ELEVON_SPANS:
        c.fill('tint', [(lo, HINGE_Y), (hi, HINGE_Y), (hi, -9.7), (lo, -9.7)], 1.0)
        c.streaks('grime', [(lo + 0.05, HINGE_Y - 0.03), (hi - 0.05, HINGE_Y - 0.03)], 12 if upper else 18, (0.15, 0.8), (0.02, 0.05), (0.35, 0.95))
    inner = [(x, leading(x) - 0.42) for x, _ in edge[1:]]
    c.seam(inner, 0.014, 0.9, rivets=0.11, row=0.03)
    ap.edge_wear(c, edge, 0.06, 0.95, reach=0.35)
    # Fuel weeping from the tank joints and drawn aft, the skin bronzed beside the nacelle and behind it.
    for y in spars[2:8]:
        c.streaks('grime', [at(0.95, y), at(3.2, y)], 9 if upper else 14, (0.4, 2.2), (0.025, 0.08), (0.25, 0.85))
        c.streaks('grime', [at(5.2, y), at(7.6, y)], 5 if upper else 8, (0.3, 1.6), (0.025, 0.07), (0.25, 0.8))
    for x in (3.25, 5.15):
        c.line('wear', [(x, -4.5), (x, -9.6)], 0.5, 0.75, soft=0.16)
        c.line('grime', [(x, 1.5), (x, -9.4)], 0.07, 0.6, soft=0.04)
    c.fill('wear', [(3.3, -8.2), (5.1, -8.2), (5.1, -9.7), (3.3, -9.7)], 0.8, soft=0.2)
    if upper:
        for door in (c.hatch((2.1, -1.2), (0.7, 1.1), chamfer=0.05, fasteners=0.1, tone=0.7), c.hatch((2.3, -5.4), (0.9, 0.7), chamfer=0.05, fasteners=0.1, tone=0.7),
                     c.hatch((6.3, -5.6), (0.8, 0.6), chamfer=0.05, fasteners=0.1, tone=0.7)):
            c.streaks('grime', [door[0], door[1]], 3, (0.2, 0.8), (0.02, 0.05), (0.3, 0.7))
        y = 5.0
        while y > -8.2:   # the no-step line along the inner wing, dashed
            c.mark_line([(1.75, y), (1.75, y - 0.6)], 0.03)
            y -= 0.95
        c.mark_line([(0.95, 9.75), (0.95, 9.25)], 0.03, RESCUE)   # the canopy release marks on the chine
        c.mark_fill([(0.86, 9.3), (1.04, 9.3), (0.95, 9.12)], RESCUE)
    else:
        for centre, size in (((2.6, -1.9), (1.1, 2.3)), ((0.0, 9.3), (0.8, 2.4))):   # gear bays: doors, the open well, what drips from it
            door = c.hatch(centre, size, chamfer=0.06, fasteners=None, tone=0.5, seam=1.0, width=0.02)
            c.fill('grime', c.box(centre, (0.4, 0.75)), 0.9, soft=0.1)
            c.streaks('grime', [door[0], door[1]], 12, (0.6, 3.0), (0.03, 0.08), (0.3, 0.95))
        for centre in ((1.3, 2.0), (1.3, -3.4), (6.4, -6.2)):
            c.hatch(centre, (0.8, 0.6), chamfer=0.05, fasteners=0.1, tone=0.7)
    return c


def body_chart():
    c = jp.Chart('body', (-13.6, -0.03), (17.8, roll_arc(BODY_ROLL, 180) + 0.03), 120, roll=BODY_ROLL, seed=41, ink=RESCUE)
    c.rivet_radius = 0.008
    frames = [-13.4, -12.0, -10.5, -9.0, -7.0, -5.0, -3.0, -1.0, 1.0, 3.0, 5.2, 6.7, 8.4, 10.2, 10.9, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0]
    ap.structure(c, lambda degrees, y: (y, roll_arc(BODY_ROLL, degrees)), [0, 30, 60, 100, 140, 180], frames, merge=0.35, rivets=0.11, tone=0.6, width=0.014, row=0.03)
    top, low = -0.03, roll_arc(BODY_ROLL, 180) + 0.03
    c.fill('tint', [(10.9, top), (17.8, top), (17.8, low), (10.9, low)], 1.0)      # the smooth nose section
    c.fill('tint', [(-13.6, top), (-9.0, top), (-9.0, low), (-13.6, low)], 1.0)    # and the tail cone
    c.fill('wear', [(-13.6, top), (-9.6, top), (-9.6, low), (-13.6, low)], 0.55, soft=0.3)
    c.fill('wear', [(17.2, top), (17.8, top), (17.8, low), (17.2, low)], 0.9, soft=0.06)
    c.streaks('grime', [(8.0, roll_arc(BODY_ROLL, 150)), (-9.0, roll_arc(BODY_ROLL, 150))], 30, (0.6, 3.0), (0.03, 0.08), (0.3, 0.9), direction=(-1.0, 0.0))
    c.streaks('grime', [(10.0, roll_arc(BODY_ROLL, 60)), (-8.0, roll_arc(BODY_ROLL, 60))], 26, (0.2, 0.7), (0.02, 0.04), (0.12, 0.4), direction=(-0.3, 1.0))
    for centre, size in (((12.4, roll_arc(BODY_ROLL, 80)), (1.0, 0.5)), ((3.8, roll_arc(BODY_ROLL, 45)), (0.9, 0.5)), ((-1.8, roll_arc(BODY_ROLL, 40)), (1.2, 0.5)),
                         ((-6.2, roll_arc(BODY_ROLL, 45)), (0.9, 0.45)), ((14.2, roll_arc(BODY_ROLL, 130)), (0.8, 0.5))):
        door = c.hatch(centre, size, chamfer=0.05, fasteners=0.1, tone=0.7, latch=True)
        c.streaks('grime', [door[6], door[7]], 3, (0.2, 0.7), (0.02, 0.04), (0.25, 0.6), direction=(-1.0, 0.0))
    # Canopy release: an arrow up to the sill and the handle's outline, both sides alike.
    c.mark_line([(9.2, roll_arc(BODY_ROLL, 74)), (9.2, roll_arc(BODY_ROLL, 60))], 0.03)
    c.mark_fill([(9.08, roll_arc(BODY_ROLL, 62)), (9.32, roll_arc(BODY_ROLL, 62)), (9.2, roll_arc(BODY_ROLL, 56))])
    handle = c.box((9.2, roll_arc(BODY_ROLL, 82)), (0.34, 0.12))
    c.mark_line(handle + [handle[0]], 0.022)
    return c


def nacelle_chart():
    half = roll_arc(NACELLE_ROLL, 180) + 0.03
    c = jp.Chart('nacelle', (-9.7, -half), (6.6, half), 120, roll=NACELLE_ROLL, seed=53, ink=NO_STEP)
    c.rivet_radius = 0.008
    frames = [-9.6, -9.0, -7.5, -6.0, -4.5, -3.0, -1.5, 0.0, 1.5, 3.2, 3.6]
    ap.structure(c, lambda degrees, y: (y, roll_arc(NACELLE_ROLL, degrees)), [-180, -135, -90, -45, 0, 45, 90, 135, 180], frames, merge=0.3, rivets=0.11,
                 tone=0.6, width=0.014, row=0.03)
    c.fill('tint', [(3.2, -half), (6.6, -half), (6.6, half), (3.2, half)], 1.0)       # the lip and the spike are smooth
    c.fill('tint', [(-9.7, -half), (-7.4, -half), (-7.4, half), (-9.7, half)], 1.0)
    c.fill('wear', [(-9.7, -half), (-6.4, -half), (-6.4, half), (-9.7, half)], 0.85, soft=0.35)   # the hot end, bronzed
    c.fill('wear', [(3.45, -half), (3.75, -half), (3.75, half), (3.45, half)], 0.9, soft=0.05)    # the lip, eroded
    c.fill('wear', [(5.2, -half), (5.5, -half), (5.5, half), (5.2, half)], 0.9, soft=0.08)        # the spike's point
    for degrees in range(-165, 180, 30):
        bypass = c.hatch((1.1, roll_arc(NACELLE_ROLL, degrees)), (0.36, 0.13), chamfer=0.02, fasteners=None, tone=0.8, seam=1.0, width=0.016)   # bypass doors
        c.streak('grime', (0.9, roll_arc(NACELLE_ROLL, degrees)), c.rng.uniform(0.5, 1.8), 0.09, c.rng.uniform(0.3, 0.75), direction=(-1.0, 0.0))
        c.hatch((-8.3, roll_arc(NACELLE_ROLL, degrees)), (0.55, 0.3), chamfer=0.03, fasteners=None, tone=0.8, seam=1.0, width=0.016)             # ejector flaps
    for side in (-1, 1):
        door = c.hatch((-2.2, side * roll_arc(NACELLE_ROLL, 150)), (2.6, 0.75), chamfer=0.06, fasteners=0.12, tone=0.7, latch=True)
        c.streaks('grime', [(1.0, side * roll_arc(NACELLE_ROLL, 168)), (-7.0, side * roll_arc(NACELLE_ROLL, 168))], 14, (0.6, 2.8), (0.03, 0.08), (0.35, 0.95), direction=(-1.0, 0.0))
    return c


def fin_chart(side):
    c = jp.Chart('fin_r' if side > 0 else 'fin_l', (-9.2, 3.1), (-4.7, 5.5), 200, u=(0, 1, 0), v=(0, 0, 1), seed=61, ink=SERIAL)
    c.rivet_radius = 0.007

    def at(z, fraction):
        s = ap.section_at(FIN, z, 'z')
        return (s['y'] - fraction * s['chord'], z)

    levels = [3.2, 3.75, 4.3, 4.85, 5.4]
    ap.structure(c, at, levels, [0.0, 0.1, 0.4, 0.7, 1.0], merge=0.25, rivets=0.1, tone=0.6, width=0.012, row=0.028)
    leading_edge = [at(z, 0.0) for z in (3.2, 5.4)]
    c.line('tint', leading_edge, 0.5, 1.0)
    c.fill('tint', [at(5.15, 0.0), at(5.15, 1.0), at(5.4, 1.0), at(5.4, 0.0)], 1.0)
    ap.edge_wear(c, leading_edge, 0.05, 0.9, reach=0.25)
    c.fill('grime', c.box((-6.6, 3.3), (0.5, 0.22)), 0.85, soft=0.08)      # the pivot of the all-moving fin
    c.streaks('grime', [(-6.9, 3.35), (-6.3, 3.35)], 8, (0.2, 0.9), (0.02, 0.05), (0.3, 0.8), direction=(-1.0, -0.25))
    c.fill('wear', [at(3.2, 0.55), at(3.2, 1.0), at(3.9, 1.0), at(3.9, 0.7)], 0.5, soft=0.2)
    c.text('GN-01', (-6.95, 3.95), 0.3, (float(side), 0.0), (0.0, 1.0), SERIAL, weight=0.16, align='center')
    return c


def texel_share(name, centre, normal, material):
    if material.startswith('stencil_'):
        return 1.8
    if name.startswith('cockpit'):
        return 0.4
    if name.startswith('gear'):
        return 0.8
    return 0.78 if normal.z < -0.5 else 1.0


def make(a):
    jp.detail_pipeline(a, density=texel_share, quality={'base': 80, 'orm': 64, 'normal': 84})
    asset = ASSET['id']
    top_map, bottom_map, body_map, nacelle_map = wing_chart('wing_top', True, 3), wing_chart('wing_bottom', False, 9), body_chart(), nacelle_chart()
    ribbed = dict(BLACK, ribs=(0.1, 0.0035, 'a'))
    skin = jp.skin('skin_top', asset_id=asset, chart=top_map, **ribbed)
    skin_low = jp.skin('skin_bottom', asset_id=asset, chart=bottom_map, **ribbed)
    skin_body = jp.skin('skin_body', asset_id=asset, chart=body_map, **dict(BLACK, ribs=(0.1, 0.003, 'b')))
    skin_nacelle = jp.skin('skin_nacelle', asset_id=asset, chart=nacelle_map, **dict(BLACK, ribs=(0.1, 0.003, 'b')))
    skin_plain = jp.skin('skin_plain', asset_id=asset, **BLACK)
    fin_right = jp.skin('skin_fin_r', asset_id=asset, chart=fin_chart(1), symmetric=False, **dict(BLACK, ribs=(0.1, 0.003, 'b')))
    fin_left = jp.skin('skin_fin_l', asset_id=asset, chart=fin_chart(-1), symmetric=False, **dict(BLACK, ribs=(0.1, 0.003, 'b')))
    hot = jp.heat_metal('nozzle_metal', -7.3, -9.75, '#6f6862', 0.46, petals=(24, 2.4, NACELLE_X))
    dark = sf.plain('duct_dark', '#060607', 0.9)
    glass = sf.glass('glass', '#0b1014', alpha=0.5)
    metal = jp.skin('gear_metal', '#aeb2b6', asset, roughness=0.42, gloss=0.14, dust=0.45, grain=0.0006)
    hub = jp.skin('gear_hub', '#c3c5c7', asset, roughness=0.36, metallic=0.6, dust=0.5)
    chrome = sf.plain('gear_chrome', '#e2e4e6', 0.09, 1.0)
    hose = sf.plain('gear_hose', '#0e0e0f', 0.55)
    tyre = jp.tyre_rubber('tyre', 0.06)

    def two_sided(obj, upper=None, lower=None, axis='z'):
        mk.assign(obj, upper or skin)
        return mk.assign_faces(obj, lower or skin_low, lambda c, n: getattr(n, axis) < 0.0)

    def stencil(name, lines, centre, right, height, color, upper=True):
        return jp.stencil_plate(WING, asset, name, lines, centre, right, height, color,
                                lambda chart: jp.skin('stencil_' + name, asset_id=asset, chart=top_map if upper else bottom_map, decal=chart, **ribbed), upper)

    # --- the mirrored outer skin ---------------------------------------------------------------
    wing = WING.wing('wing', wing_stations(), n=12, hinge=elevon_hinge)
    two_sided(wing)
    body, spare = jp.half_shell('body', BODY, BODY_ANGLES, power=2.2, holes=COCKPIT_WELL)
    bpy.data.objects.remove(spare, do_unlink=True)
    mk.assign(body, skin_body)
    nacelle = mk.fuselage('nacelle', [
        {'y': 3.6, 'w': 1.25, 'h': 1.25}, {'y': 3.2, 'w': 1.5, 'h': 1.5}, {'y': 1.5, 'w': 1.72, 'h': 1.72}, {'y': -3.0, 'w': 1.8, 'h': 1.8},
        {'y': -7.5, 'w': 1.75, 'h': 1.75}, {'y': -9.0, 'w': 1.55, 'h': 1.55}, {'y': -9.6, 'w': 1.4, 'h': 1.4},
    ], 28)
    mk.transform(nacelle, (NACELLE_X, 0.0, 2.4))
    mk.assign(nacelle, skin_nacelle)
    mk.assign_faces(nacelle, hot, lambda c, n: c.y < -7.5)
    mk.assign_faces(nacelle, dark, lambda c, n: abs(n.y) > 0.9)
    spike = mk.cylinder('spike', 0.5, 2.3, (NACELLE_X, 4.25, 2.4), 'Y', 24, 0.012)
    mk.assign(spike, skin_nacelle)
    strake = mk.wing('strake', [   # a ventral strake under each nacelle
        {'x': NACELLE_X, 'y': -5.4, 'z': 1.58, 'chord': 2.9, 'cant': 90, 'thickness': 0.05, 'camber': 0.0},
        {'x': NACELLE_X, 'y': -6.7, 'z': 1.02, 'chord': 1.3, 'cant': 90, 'thickness': 0.05, 'camber': 0.0},
    ], 6)
    mk.assign(jp.orient(strake), skin_plain)
    spine = mk.fuselage('spine', [   # a dorsal spine from the rear glazing to the tail cone
        {'y': 4.4, 'w': 0.2, 'h': 0.2, 'z': 3.3}, {'y': 2.0, 'w': 0.5, 'h': 0.5, 'z': 3.26}, {'y': -6.0, 'w': 0.42, 'h': 0.42, 'z': 3.2},
        {'y': -10.5, 'w': 0.14, 'h': 0.14, 'z': 2.95},
    ], 12)
    jp.delete_faces(spine, lambda c, n: c.x < -0.001 or abs(n.y) > 0.9)
    mk.assign(spine, skin_body)
    burner = mk.disc('burner', 0.56, (NACELLE_X, -9.612, 2.4), 'Y', 24)
    mk.assign(burner, sf.lamp('lamp_burner', '#ff9a3c', 6.0))
    shield, shield_panes = jp.half_shell('windshield', GLAZING[0:3], GLAZING_ANGLES, power=2.6, holes={(1, 1), (1, 3)})
    rear, rear_panes = jp.half_shell('rear_glazing', GLAZING[3:], GLAZING_ANGLES, power=2.6, holes={(1, 1)})
    for part in (shield, rear):
        mk.assign(part, skin_body)
    for part in (shield_panes, rear_panes):
        mk.assign(jp.flat(part), glass)
    lod0 = mk.join('lod0', [mk.shade(wing, 38), mk.shade(body, 38), mk.shade(nacelle, 38), mk.shade(spike, 38), burner, mk.shade(strake, 38), mk.shade(spine, 38),
                            mk.shade(shield, 30), shield_panes, mk.shade(rear, 30), rear_panes])
    a.add(lod0, mirror=True)

    # --- details that differ left and right ----------------------------------------------------
    details = [
        mk.assign(mk.box('nav_red', (0.08, 0.3, 0.05), (-8.2, -8.5, WING_Z), 0.015), sf.lamp('lamp_nav_red', '#ff2a1a', 4.0)),
        mk.assign(mk.box('nav_green', (0.08, 0.3, 0.05), (8.2, -8.5, WING_Z), 0.015), sf.lamp('lamp_nav_green', '#20ff58', 4.0)),
        mk.assign(mk.box('strobe', (0.1, 0.12, 0.1), (0.0, -13.42, 2.52), 0.02), sf.lamp('lamp_strobe', '#f4f6ff', 6.0)),
    ]
    beacon = sf.lamp('lamp_beacon', '#ff2418', 5.0)
    details.append(mk.assign(mk.cylinder('beacon_top', 0.07, 0.07, (0.0, 1.5, 3.36), 'Z', 12, 0.04), beacon))
    details.append(mk.assign(mk.cylinder('beacon_belly', 0.07, 0.07, (0.0, 1.5, 1.48), 'Z', 12), beacon))
    details.append(mk.assign(mk.tube('pitot', [(0.0, 17.55, 2.14), (0.0, 17.9, 2.13)], [0.02, 0.008], 8), metal))
    # Stencils on thin plates (the skin's texels are shared by both halves, lettering cannot be).
    for side in (-1, 1):
        details.append(stencil('step_%d' % (side + 1), ['NO PISAR'], (side * 6.4, -7.9), (1.0, 0.0), 0.13, NO_STEP))
        details.append(stencil('rescue_%d' % (side + 1), ['RESCATE'], (side * 1.0, 8.55), (0.0, 1.0), 0.09, RESCUE))
        details.append(stencil('intake_%d' % (side + 1), ['PELIGRO', 'ADMISION'], (side * 2.55, 2.1), (1.0, 0.0), 0.09, NO_STEP))
    details.append(stencil('serial', ['GN-01'], (-1.15, 6.6), (0.0, 1.0), 0.2, SERIAL, upper=False))
    a.add(mk.shade(mk.join('detail_lod0', details), 40))

    # --- moving parts ---------------------------------------------------------------------------
    inner = WING.surface('elevon_in', [1.18, 1.6, 2.0, 2.5, 3.0, 3.22], lambda x: HINGE_Y, n=3)
    outer = WING.surface('elevon_out', [5.23, 5.6, 6.0, 6.5, 7.0, 7.4, 7.77], lambda x: HINGE_Y, n=3)
    right = mk.join('elevon_r', [inner, outer])
    two_sided(right)
    left = mk.duplicate(right, 'elevon_l')
    mk.transform(left, scale=(-1, 1, 1))
    a.add(mk.set_origin(mk.shade(right, 38), (4.5, HINGE_Y, WING_Z)))
    a.add(mk.set_origin(mk.shade(left, 38), (-4.5, HINGE_Y, WING_Z)))

    fin = mk.wing('rudder_r', FIN, 8)
    jp.orient(fin)
    two_sided(fin, fin_right, fin_left, 'x')
    other_fin = mk.duplicate(fin, 'rudder_l')
    mk.transform(other_fin, scale=(-1, 1, 1))
    two_sided(other_fin, fin_right, fin_left, 'x')      # each face takes the drawing that reads from its own side
    a.add(mk.set_origin(mk.shade(fin, 38), (NACELLE_X, -6.6, 3.25)))
    a.add(mk.set_origin(mk.shade(other_fin, 38), (-NACELLE_X, -6.6, 3.25)))

    canopy, canopy_panes = jp.half_shell('canopy', GLAZING[2:4], GLAZING_ANGLES, power=2.6, holes={(0, 1), (0, 3)})
    lining, spare = jp.half_shell('canopy_lining', GLAZING[2:4], GLAZING_ANGLES, power=2.6, holes={(0, 1), (0, 3)}, inward=True, shrink=0.025)
    bpy.data.objects.remove(spare, do_unlink=True)
    mk.assign(canopy, skin_body)
    mk.assign(lining, sf.coated('canopy_frame', '#2a2b2f', roughness=0.7, wear=0.2, grain=0.2))
    mk.assign(jp.flat(canopy_panes), glass)
    canopy = mk.join('canopy', [mk.shade(canopy, 30), mk.shade(lining, 30), canopy_panes])
    a.add(mk.set_origin(canopy, (0.0, 8.4, 3.72)), mirror=True)

    a.add(jp.gear_leg('gear_nose', (0.0, 9.5, 1.62), 0.45, (-0.2, 0.2), 0.45, 0.22, metal, tyre, hub, strut=0.1,
                      lamp=sf.lamp('lamp_landing', '#fff4dc', 6.0), chrome=chrome, hose=hose))
    for name, side in (('gear_l', -1), ('gear_r', 1)):
        a.add(jp.gear_leg(name, (side * 2.6, -1.8, 2.15), 0.45, (-0.24, 0.24), 0.45, 0.26, metal, tyre, hub, strut=0.12, chrome=chrome, hose=hose))

    # --- the analog cockpit ---------------------------------------------------------------------
    a.add(mk.shade(mk.join('cockpit_lod0', cockpit_parts()), 40))
    panel = mk.quad('instrument_panel', [(-0.4, 9.9, 2.62), (0.4, 9.9, 2.62), (0.4, 10.0, 3.1), (-0.4, 10.0, 3.1)])
    mk.assign(panel, sf.screen('screen_panel'))
    a.add(panel)

    # --- what the game looks for ----------------------------------------------------------------
    a.anchor('seat_driver', (0.0, 9.05, 2.55))
    a.anchor('seat_passenger_1', (0.0, 7.35, 2.55))
    a.anchor('camera', EYE)
    a.anchor('door_driver', (-1.6, 9.0, 0.0), (0, 0, -90))
    a.anchor('exhaust_1', (NACELLE_X, -9.6, 2.4), (0, 0, 180))
    a.anchor('exhaust_2', (-NACELLE_X, -9.6, 2.4), (0, 0, 180))
    a.anchor('wingtip_l', (-8.2, -8.6, WING_Z))
    a.anchor('wingtip_r', (8.2, -8.6, WING_Z))
    a.anchor('gear_nose', (0.0, 9.5, 0.0))
    a.anchor('gear_l', (-2.6, -1.8, 0.0))
    a.anchor('gear_r', (2.6, -1.8, 0.0))
    a.anchor('light_landing', (0.0, 9.7, 1.0))
    a.collider_box('fuselage', (1.9, 31.0, 1.9), (0.0, 2.1, 2.4))
    a.collider_box('wing', (16.4, 13.0, 0.6), (0.0, -3.0, WING_Z))
    a.collider_box('tail', (9.6, 4.0, 2.3), (0.0, -7.0, 4.2))
    a.extra('panel_size', [0.8, 0.49])
    a.extra('eye', list(EYE))
    jp.exact_extras(a, {
        'gear_retract': {'gear_nose': ['x', 95], 'gear_l': ['y', -88], 'gear_r': ['y', 88]},
        'canopy_open': ['x', 38],
    })
    a.lods((0.3, 0.1), (120.0, 400.0))


def cockpit_parts():
    """The tub under the glazing: lining, floor, bulkheads, two seats, the front office's controls."""
    wall = sf.coated('cabin_wall', '#3a3d3f', roughness=0.7, wear=0.4, grain=0.25)
    floor = sf.coated('cabin_floor', '#26282a', roughness=0.85, wear=0.6)
    console = sf.coated('console_black', '#1f2022', roughness=0.55, wear=0.4, grain=0.25)
    cloth = sf.fabric('seat_fabric', '#4a4636')
    frame = sf.bare_metal('seat_frame', '#5e6164', 0.45)
    grip = sf.rubber('grip', '#161616')
    metal = sf.bare_metal('lever_metal', '#a0a3a6', 0.35)
    cap = sf.plain('switch_cap', '#9a9c9e', 0.45)
    parts = []
    lining, spare = jp.half_shell('lining', BODY[5:10], BODY_ANGLES, power=2.2, holes={(k, i) for k in (1, 2) for i in (10, 11, 12)}, inward=True, shrink=0.05)
    bpy.data.objects.remove(spare, do_unlink=True)
    parts.append(mk.assign(jp.mirrored_pair(lining), wall))
    # The inside of the fixed glazing frames (the opening canopy carries its own lining).
    for name, stations, holes in (('windshield_lining', GLAZING[0:3], {(1, 1), (1, 3)}), ('rear_lining', GLAZING[3:], {(1, 1)})):
        frame_lining, spare = jp.half_shell(name, stations, GLAZING_ANGLES, power=2.6, holes=holes, inward=True, shrink=0.025)
        bpy.data.objects.remove(spare, do_unlink=True)
        parts.append(mk.assign(jp.mirrored_pair(frame_lining), wall))
    parts.append(mk.assign(jp.panel_face('floor', [(-0.62, 6.75, FLOOR), (0.62, 6.75, FLOOR), (0.62, 10.5, FLOOR), (-0.62, 10.5, FLOOR)], (0, 0, 1)), floor))
    parts.append(mk.assign(jp.panel_face('bulkhead_front', [(-0.6, 10.45, FLOOR), (0.6, 10.45, FLOOR), (0.5, 10.45, 3.0), (-0.5, 10.45, 3.0)], (0, -1, 0)), wall))
    arch = [(-0.62, FLOOR), (0.62, FLOOR), (0.5, 2.95), (0.38, 3.5), (0.0, 3.72), (-0.38, 3.5), (-0.5, 2.95)]
    parts.append(mk.assign(jp.panel_face('bulkhead_mid_front', [(x, 8.42, z) for x, z in arch], (0, 1, 0)), wall))
    parts.append(mk.assign(jp.panel_face('bulkhead_mid_rear', [(x, 8.3, z) for x, z in arch], (0, -1, 0)), wall))
    parts.append(mk.assign(jp.panel_face('bulkhead_rear', [(x, 6.78, z) for x, z in arch], (0, 1, 0)), wall))
    parts += jp.seat('seat_front', (0.0, 9.05, 2.55), cloth, frame, width=0.46)
    parts += jp.seat('seat_rear', (0.0, 7.35, 2.55), cloth, frame, width=0.46)
    parts += jp.stick('stick', (0.0, 9.62, FLOOR), 0.64, metal, grip)
    for side in (-1, 1):
        parts.append(mk.assign(mk.box('side_console_%d' % side, (0.22, 1.35, 0.5), (side * 0.53, 9.3, FLOOR + 0.3), 0.02), console))
    parts += jp.lever('throttle_l', (-0.56, 9.5, FLOOR + 0.55), 0.14, (0.04, 0.035, 0.05), metal, grip)
    parts += jp.lever('throttle_r', (-0.5, 9.5, FLOOR + 0.55), 0.14, (0.04, 0.035, 0.05), metal, grip)
    parts += jp.switch_block('switches_left', (-0.53, 9.0, FLOOR + 0.56), (0.17, 0.42, 0.025), 5, 2, console, cap)
    parts += jp.switch_block('switches_right', (0.53, 9.3, FLOOR + 0.56), (0.17, 0.95, 0.025), 9, 2, console, cap)
    parts.append(mk.assign(mk.box('panel_body', (0.94, 0.3, 0.54), (0.0, 10.2, 2.85), 0.02), console))
    parts.append(mk.assign(mk.box('coaming', (0.98, 0.34, 0.03), (0.0, 10.1, 3.125), 0.012), wall))
    parts.append(mk.assign(mk.box('rear_panel', (0.9, 0.2, 0.45), (0.0, 8.18, 2.85), 0.02), console))
    for side in (-0.16, 0.16):   # rudder pedals
        parts.append(mk.assign(mk.box('pedal', (0.11, 0.03, 0.14), (side, 10.3, FLOOR + 0.16), 0.008), metal))
    parts += jp.lever('gear_handle', (-0.4, 9.86, 2.72), 0.1, (0.05, 0.03, 0.05), metal, sf.plain('gear_knob', '#c6c6c0', 0.5), lean=-75.0)
    return parts
