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
import bpy

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
    {'y': 17.6, 'w': 0.06, 'h': 0.06, 'z': 2.33}, {'y': 17.0, 'w': 0.2, 'h': 0.18, 'z': 2.33}, {'y': 16.0, 'w': 0.46, 'h': 0.4, 'z': 2.33},
    {'y': 14.0, 'w': 0.85, 'h': 0.75, 'z': 2.33}, {'y': 12.0, 'w': 1.15, 'h': 1.1, 'z': 2.32}, {'y': 10.9, 'w': 1.35, 'h': 1.35, 'z': 2.3},
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


def make(a):
    skin = sf.coated('skin', '#30313a', roughness=0.52, wear=0.35, panels=(1.9, 0.95), projection='top', sheen='#1c2b44', grain=0.3)
    hot = sf.bare_metal('nozzle_metal', '#77706a', 0.42, wear=0.65)
    dark = sf.plain('duct_dark', '#060607', 0.9)
    glass = sf.glass('glass', '#0b1014', alpha=0.5)
    metal = sf.bare_metal('gear_metal', '#8d9094', 0.4, wear=0.4)
    hub = sf.bare_metal('gear_hub', '#b4b6b8', 0.3, wear=0.2)
    tyre = sf.rubber('tyre')

    # --- the mirrored outer skin ---------------------------------------------------------------
    wing = WING.wing('wing', wing_stations(), n=12, hinge=elevon_hinge)
    mk.assign(wing, skin)
    body, spare = jp.half_shell('body', BODY, BODY_ANGLES, power=2.2, holes=COCKPIT_WELL)
    bpy.data.objects.remove(spare, do_unlink=True)
    mk.assign(body, skin)
    nacelle = mk.fuselage('nacelle', [
        {'y': 3.6, 'w': 1.25, 'h': 1.25}, {'y': 3.2, 'w': 1.5, 'h': 1.5}, {'y': 1.5, 'w': 1.72, 'h': 1.72}, {'y': -3.0, 'w': 1.8, 'h': 1.8},
        {'y': -7.5, 'w': 1.75, 'h': 1.75}, {'y': -9.0, 'w': 1.55, 'h': 1.55}, {'y': -9.6, 'w': 1.4, 'h': 1.4},
    ], 28)
    mk.transform(nacelle, (NACELLE_X, 0.0, 2.4))
    mk.assign(nacelle, skin)
    mk.assign_faces(nacelle, hot, lambda c, n: c.y < -7.5)
    mk.assign_faces(nacelle, dark, lambda c, n: abs(n.y) > 0.9)
    spike = mk.cylinder('spike', 0.5, 2.3, (NACELLE_X, 4.25, 2.4), 'Y', 24, 0.012)
    mk.assign(spike, skin)
    burner = mk.disc('burner', 0.56, (NACELLE_X, -9.612, 2.4), 'Y', 24)
    mk.assign(burner, sf.lamp('lamp_burner', '#ff9a3c', 6.0))
    shield, shield_panes = jp.half_shell('windshield', GLAZING[0:3], GLAZING_ANGLES, power=2.6, holes={(1, 1), (1, 3)})
    rear, rear_panes = jp.half_shell('rear_glazing', GLAZING[3:], GLAZING_ANGLES, power=2.6, holes={(1, 1)})
    for part in (shield, rear):
        mk.assign(part, skin)
    for part in (shield_panes, rear_panes):
        mk.assign(jp.flat(part), glass)
    lod0 = mk.join('lod0', [mk.shade(wing, 38), mk.shade(body, 38), mk.shade(nacelle, 38), mk.shade(spike, 38), burner,
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
    details.append(mk.assign(mk.tube('pitot', [(0.0, 17.55, 2.33), (0.0, 18.2, 2.33)], [0.02, 0.008], 8), metal))
    a.add(mk.shade(mk.join('detail_lod0', details), 40))

    # --- moving parts ---------------------------------------------------------------------------
    inner = WING.surface('elevon_in', [1.18, 1.6, 2.0, 2.5, 3.0, 3.22], lambda x: HINGE_Y, n=3)
    outer = WING.surface('elevon_out', [5.23, 5.6, 6.0, 6.5, 7.0, 7.4, 7.77], lambda x: HINGE_Y, n=3)
    right = mk.join('elevon_r', [inner, outer])
    mk.assign(right, skin)
    left = mk.duplicate(right, 'elevon_l')
    mk.transform(left, scale=(-1, 1, 1))
    a.add(mk.set_origin(mk.shade(right, 38), (4.5, HINGE_Y, WING_Z)))
    a.add(mk.set_origin(mk.shade(left, 38), (-4.5, HINGE_Y, WING_Z)))

    fin = mk.wing('rudder_r', [
        {'x': NACELLE_X, 'y': -4.9, 'z': 3.2, 'chord': 3.7, 'cant': 90, 'thickness': 0.045, 'camber': 0.0},
        {'x': NACELLE_X - 0.3, 'y': -6.15, 'z': 4.3, 'chord': 2.6, 'cant': 90, 'thickness': 0.045, 'camber': 0.0},
        {'x': NACELLE_X - 0.58, 'y': -7.3, 'z': 5.4, 'chord': 1.5, 'cant': 90, 'thickness': 0.045, 'camber': 0.0},
    ], 8)
    jp.orient(fin)
    mk.assign(fin, skin)
    fin_left = mk.duplicate(fin, 'rudder_l')
    mk.transform(fin_left, scale=(-1, 1, 1))
    a.add(mk.set_origin(mk.shade(fin, 38), (NACELLE_X, -6.6, 3.25)))
    a.add(mk.set_origin(mk.shade(fin_left, 38), (-NACELLE_X, -6.6, 3.25)))

    canopy, canopy_panes = jp.half_shell('canopy', GLAZING[2:4], GLAZING_ANGLES, power=2.6, holes={(0, 1), (0, 3)})
    lining, spare = jp.half_shell('canopy_lining', GLAZING[2:4], GLAZING_ANGLES, power=2.6, holes={(0, 1), (0, 3)}, inward=True, shrink=0.025)
    bpy.data.objects.remove(spare, do_unlink=True)
    mk.assign(canopy, skin)
    mk.assign(lining, sf.coated('canopy_frame', '#2a2b2f', roughness=0.7, wear=0.2, grain=0.2))
    mk.assign(jp.flat(canopy_panes), glass)
    canopy = mk.join('canopy', [mk.shade(canopy, 30), mk.shade(lining, 30), canopy_panes])
    a.add(mk.set_origin(canopy, (0.0, 8.4, 3.72)), mirror=True)

    a.add(jp.gear_leg('gear_nose', (0.0, 9.5, 1.62), 0.45, (-0.2, 0.2), 0.45, 0.22, metal, tyre, hub, strut=0.1,
                      lamp=sf.lamp('lamp_landing', '#fff4dc', 6.0)))
    for name, side in (('gear_l', -1), ('gear_r', 1)):
        a.add(jp.gear_leg(name, (side * 2.6, -1.8, 2.15), 0.45, (-0.24, 0.24), 0.45, 0.26, metal, tyre, hub, strut=0.12))

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
