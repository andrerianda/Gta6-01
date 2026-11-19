"""Manta Sombra: an original tailless flying-wing bomber shaped like a manta ray, 46 m across and
19.5 m long, standing on its gear with the origin on the ground under the centre of gravity.

The wing is one skin lofted span-wise through a planform of our own: a softly curved leading edge,
two small cephalic-fin lobes either side of the nose, a pointed tail and a gently scalloped
trailing edge. On it sit a low cockpit hump with four faceted dark panes, two slit intakes whose
fairings run back to the exhaust troughs, elevons cut out of the trailing edge, closed drag-rudder
panels at the tips, a belly hatch with a folding ladder and three retracting gear legs. Inside the
hump is a two-seat glass cockpit: the game paints its four displays on the `instrument_panel` quad.
Nose to +Y, right wing to +X; layout numbers are the catalog's (game/src/catalog/vehicleCatalog.js).
"""
import math

import bpy

import _jet_parts as jp
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'manta_sombra', 'atlas': 2048}

HALF_SPAN = 23.0
EYE = (-0.55, 6.3, 4.0)
FLOOR = 2.75
HINGE_Y = -4.4
ELEVON = (8.5, 17.0)


def _raw_edges(x):
    s = min(abs(x) / HALF_SPAN, 1.0)
    le = 9.0 - 15.6 * (0.25 * s + 0.75 * s * s) + 0.9 * math.exp(-((abs(x) - 1.75) / 0.6) ** 2)
    te = -10.15 + 2.55 * s + 3.6 * math.sin(math.pi * s) - 0.45 * math.sin(5 * math.pi * s) ** 2
    fade = math.sqrt(max(1.0 - ((s - 0.97) / 0.03) ** 2, 0.0)) if s > 0.97 else 1.0
    mid, half = 0.5 * (le + te), 0.5 * (le - te) * max(fade, 0.12)
    return mid + half, mid - half


def leading(x):
    return _raw_edges(x)[0]


def trailing(x):
    return _raw_edges(x)[1]


def chord_height(x):
    s = abs(x) / HALF_SPAN
    return 2.72 - 0.25 * s * s


def thickness(x):
    s = abs(x) / HALF_SPAN
    return 0.068 + 0.037 * math.exp(-(s / 0.13) ** 2) - 0.01 * s


WING = jp.Planform(leading, trailing, chord_height, thickness, camber=0.012)

# The cockpit hump, front to back (half sections; see jp.shell_point).
HUMP = [
    {'y': 8.75, 'w': 0.3, 'h': 0.2, 'z': 3.2}, {'y': 8.4, 'w': 1.9, 'h': 0.9, 'z': 3.15},
    {'y': 8.0, 'w': 2.8, 'h': 1.6, 'z': 3.0}, {'y': 7.05, 'w': 3.5, 'h': 2.7, 'z': 3.15},
    {'y': 6.0, 'w': 3.8, 'h': 2.9, 'z': 3.15}, {'y': 4.5, 'w': 3.9, 'h': 2.9, 'z': 3.15},
    {'y': 2.5, 'w': 3.7, 'h': 2.6, 'z': 3.1}, {'y': 0.0, 'w': 3.2, 'h': 2.1, 'z': 3.05},
    {'y': -2.5, 'w': 2.4, 'h': 1.6, 'z': 3.0}, {'y': -4.5, 'w': 1.2, 'h': 1.0, 'z': 2.9},
    {'y': -5.5, 'w': 0.2, 'h': 0.3, 'z': 2.9},
]
HUMP_ANGLES = [-90, -60, -30, 0, 22, 26, 50, 54, 84, 90]
PANES = {(2, 5), (2, 7)}


def wing_stations():
    xs = [0.2 * i for i in range(19)] + [4.0 + 0.5 * i for i in range(9)]
    xs += [ELEVON[0] - 0.01] + [ELEVON[0] + 0.5 * i for i in range(18)] + [ELEVON[1] + 0.01]
    xs += [17.5 + 0.5 * i for i in range(10)] + [22.3, 22.5, 22.7, 22.85, 22.95, 22.99]
    return xs


def elevon_hinge(x):
    return HINGE_Y if ELEVON[0] <= x <= ELEVON[1] else None


def make(a):
    skin = sf.coated('skin', '#33313a', roughness=0.78, wear=0.3, panels=(3.2, 1.6), projection='top', sheen='#2a3a33', grain=0.25)
    dark = sf.plain('duct_dark', '#060607', 0.9)
    trough = sf.bare_metal('trough_metal', '#4d4844', 0.5, wear=0.7)
    rudder_skin = sf.coated('rudder_skin', '#2c2b31', roughness=0.7, wear=0.4, panels=(1.1, 0.5))
    glass = sf.glass('glass', '#080b0e', alpha=0.6)
    metal = sf.bare_metal('gear_metal', '#8d9094', 0.4, wear=0.4)
    hub = sf.bare_metal('gear_hub', '#b4b6b8', 0.3, wear=0.2)
    tyre = sf.rubber('tyre')

    # --- the mirrored outer skin ---------------------------------------------------------------
    wing = WING.wing('wing', wing_stations(), n=14, hinge=elevon_hinge)
    jp.delete_faces(wing, lambda c, n: c.x < 1.0 and 5.0 < c.y < 7.9 and n.z > 0)   # the cockpit well under the hump
    mk.assign(wing, skin)
    hump, panes = jp.half_shell('hump', HUMP, HUMP_ANGLES, holes=PANES)
    mk.assign(hump, skin)
    mk.assign(jp.flat(panes), glass)
    rings = []
    for y, h in ((0.5, 0.9), (0.2, 1.05), (-1.2, 1.15), (-3.5, 1.05), (-5.4, 0.72)):
        rings.append(mk.ring(y, 3.4, h, WING.skin_z(4.0, y) - 0.03, 4.0, 28, 3.2))
    fairing = mk.loft('engine_fairing', rings)
    mk.assign(fairing, skin)
    mk.assign_faces(fairing, dark, lambda c, n: abs(n.y) > 0.9)
    plates = []
    for x in (3.1, 4.9):
        plates.append(mk.assign(WING.patch('trough', x - 0.62, x + 0.62, -5.42, -7.35, lift=0.012, nx=3, ny=5), trough))
    plates.append(mk.assign(WING.patch('drag_rudder_top', 19.2, 21.7, lambda x: trailing(x) + 0.1, lambda x: trailing(x) + 1.05, lift=0.008, nx=6, ny=2), rudder_skin))
    plates.append(mk.assign(WING.patch('drag_rudder_low', 19.2, 21.7, lambda x: trailing(x) + 0.1, lambda x: trailing(x) + 1.05, upper=False, lift=0.008, nx=6, ny=2), rudder_skin))
    lod0 = mk.join('lod0', [mk.shade(wing, 38), mk.shade(hump, 38), panes, mk.shade(fairing, 38)] + plates)
    a.add(lod0, mirror=True)

    # --- details that differ left and right ----------------------------------------------------
    details = []
    tip_y = 0.5 * (leading(22.5) + trailing(22.5))
    details.append(mk.assign(mk.box('nav_red', (0.3, 0.22, 0.06), (-22.5, tip_y + 0.2, chord_height(22.5) + 0.02), 0.02), sf.lamp('lamp_nav_red', '#ff2a1a', 4.0)))
    details.append(mk.assign(mk.box('nav_green', (0.3, 0.22, 0.06), (22.5, tip_y + 0.2, chord_height(22.5) + 0.02), 0.02), sf.lamp('lamp_nav_green', '#20ff58', 4.0)))
    beacon = sf.lamp('lamp_beacon', '#ff2418', 5.0)
    details.append(mk.assign(mk.cylinder('beacon_top', 0.09, 0.08, (0, 3.2, 4.52), 'Z', 12, 0.05), beacon))
    details.append(mk.assign(mk.cylinder('beacon_belly', 0.09, 0.08, (0, -2.0, WING.skin_z(0, -2.0, False) - 0.03), 'Z', 12), beacon))
    details.append(mk.assign(mk.box('strobe', (0.16, 0.14, 0.05), (0, -10.02, chord_height(0)), 0.015), sf.lamp('lamp_strobe', '#f4f6ff', 6.0)))
    serial = sf.plain('serial_grey', '#4b4d52', 0.75)
    for i, (width, depth) in enumerate(((0.3, 0.46), (0.26, 0.46), (0.16, 0.1), (0.26, 0.46), (0.1, 0.46))):   # a serial suggested by blocks
        x0 = -8.2 + i * 0.42
        details.append(mk.assign(WING.patch('serial_%d' % i, x0, x0 + width, -1.2, -1.2 + depth, lift=0.006, nx=1, ny=1), serial))
    details.append(mk.assign(WING.patch('hatch_well', -0.43, 0.43, 3.62, 4.78, upper=False, lift=0.006, nx=2, ny=3), dark))
    a.add(mk.shade(mk.join('detail_lod0', details), 40))

    # --- moving parts ---------------------------------------------------------------------------
    xs = [ELEVON[0] + 0.03] + [9.0 + 0.5 * i for i in range(16)] + [ELEVON[1] - 0.03]
    hinge_z = 0.5 * (WING.skin_z(12.75, HINGE_Y) + WING.skin_z(12.75, HINGE_Y, False))
    right = WING.surface('elevon_r', xs, lambda x: HINGE_Y)
    mk.assign(right, skin)
    left = mk.duplicate(right, 'elevon_l')
    mk.transform(left, scale=(-1, 1, 1))
    a.add(mk.set_origin(mk.shade(right, 38), (12.75, HINGE_Y, hinge_z)))
    a.add(mk.set_origin(mk.shade(left, 38), (-12.75, HINGE_Y, hinge_z)))

    a.add(jp.gear_leg('gear_nose', (0.0, 6.2, WING.skin_z(0, 6.2, False) + 0.05), 0.55, (-0.3, 0.3), 0.55, 0.3, metal, tyre, hub, strut=0.13,
                      lamp=sf.lamp('lamp_landing', '#fff4dc', 6.0)))
    for name, side in (('gear_l', -1), ('gear_r', 1)):
        a.add(jp.gear_leg(name, (side * 5.5, -1.6, WING.skin_z(5.5, -1.6, False) + 0.05), 0.55, (-0.36, 0.36), 0.55, 0.36, metal, tyre, hub, strut=0.16, bogie=1.35))

    hatch = WING.patch('hatch', -0.45, 0.45, 3.6, 4.8, upper=False, lift=0.02, nx=2, ny=3)
    mk.solidify(hatch, 0.035)
    mk.assign(hatch, skin)
    a.add(mk.set_origin(mk.shade(hatch, 40), (0.45, 4.2, WING.skin_z(0.45, 4.2, False) - 0.02)))
    ladder_parts = []
    for side in (-0.2, 0.2):
        ladder_parts.append(mk.assign(mk.tube('ladder_rail', [(side, 4.75, 2.0), (side, 2.8, 2.0)], 0.018, 8), metal))
    for i in range(6):
        y = 4.5 - i * 0.3
        ladder_parts.append(mk.assign(mk.tube('ladder_rung', [(-0.2, y, 2.0), (0.2, y, 2.0)], 0.014, 6), metal))
    a.add(mk.set_origin(mk.shade(mk.join('ladder', ladder_parts), 40), (0.0, 4.75, 2.0)))

    # --- the glass cockpit ----------------------------------------------------------------------
    a.add(mk.shade(mk.join('cockpit_lod0', cockpit_parts()), 40))
    panel = mk.quad('instrument_panel', [(-0.85, 7.0, 3.37), (0.85, 7.0, 3.37), (0.85, 7.12, 3.8), (-0.85, 7.12, 3.8)])
    mk.assign(panel, sf.screen('screen_panel'))
    a.add(panel)

    # --- what the game looks for ----------------------------------------------------------------
    a.anchor('seat_driver', (-0.55, 6.15, 3.22))
    a.anchor('seat_passenger_1', (0.55, 6.15, 3.22))
    a.anchor('camera', EYE)
    a.anchor('door_driver', (0.0, 3.3, 0.0))
    for i, (x, z) in enumerate(((3.1, 3.2), (4.9, 3.1), (-3.1, 3.2), (-4.9, 3.1)), start=1):
        a.anchor('exhaust_%d' % i, (x, -5.4, z), (0, 0, 180))
    a.anchor('wingtip_l', (-22.9, tip_y, chord_height(22.9)))
    a.anchor('wingtip_r', (22.9, tip_y, chord_height(22.9)))
    a.anchor('gear_nose', (0.0, 6.2, 0.0))
    a.anchor('gear_l', (-5.5, -1.6, 0.0))
    a.anchor('gear_r', (5.5, -1.6, 0.0))
    a.anchor('light_landing', (0.0, 6.4, 1.5))
    a.collider_box('fuselage', (8.0, 19.4, 2.7), (0.0, -0.4, 3.2))
    a.collider_box('wing', (46.0, 7.0, 1.0), (0.0, -2.6, 2.7))
    a.collider_box('tail', (10.0, 4.0, 1.0), (0.0, -8.0, 2.8))
    a.extra('panel_size', [1.7, 0.45])
    a.extra('eye', list(EYE))
    jp.exact_extras(a, {
        'gear_retract': {'gear_nose': ['x', 95], 'gear_l': ['x', 95], 'gear_r': ['x', 95]},
        'hatch_open': ['y', -88], 'ladder_down': ['x', 75],
    })
    a.lods((0.45, 0.18), (150.0, 500.0))


def cockpit_parts():
    """Two seats side by side, sticks, the centre console with four throttles, panel body and lining."""
    wall = sf.coated('cabin_wall', '#2b2d31', roughness=0.75, wear=0.25, grain=0.2)
    floor = sf.coated('cabin_floor', '#202124', roughness=0.85, wear=0.5)
    console = sf.coated('console_grey', '#34373c', roughness=0.6, wear=0.3, grain=0.2)
    cloth = sf.fabric('seat_fabric', '#3b4038')
    frame = sf.bare_metal('seat_frame', '#5a5d61', 0.45)
    grip = sf.rubber('grip', '#161616')
    metal = sf.bare_metal('lever_metal', '#9a9da1', 0.35)
    parts = []
    lining, spare = jp.half_shell('lining', HUMP[1:6], HUMP_ANGLES, holes={(1, 5), (1, 7)}, inward=True, shrink=0.06)
    bpy.data.objects.remove(spare, do_unlink=True)
    parts.append(mk.assign(jp.mirrored_pair(lining), wall))
    parts.append(mk.assign(jp.panel_face('floor', [(-1.95, 4.9, FLOOR), (1.95, 4.9, FLOOR), (1.95, 8.35, FLOOR), (-1.95, 8.35, FLOOR)], (0, 0, 1)), floor))
    parts.append(mk.assign(jp.panel_face('bulkhead_rear', [(-1.95, 4.9, FLOOR), (1.95, 4.9, FLOOR), (1.95, 4.9, 4.65), (-1.95, 4.9, 4.65)], (0, 1, 0)), wall))
    parts.append(mk.assign(jp.panel_face('bulkhead_front', [(-1.5, 8.3, FLOOR), (1.5, 8.3, FLOOR), (1.5, 8.3, 3.7), (-1.5, 8.3, 3.7)], (0, -1, 0)), wall))
    for name, x in (('seat_l', -0.55), ('seat_r', 0.55)):
        parts += jp.seat(name, (x, 6.15, 3.22), cloth, frame)
        parts.append(mk.assign(mk.box(name + '_pedestal', (0.42, 0.5, 0.2), (x, 6.2, FLOOR + 0.1), 0.02), frame))
        parts += jp.stick(name + '_stick', (x, 6.78, FLOOR), 0.74, metal, grip)
    parts.append(mk.assign(mk.box('centre_console', (0.36, 1.3, 0.56), (0.0, 6.55, FLOOR + 0.28), 0.025), console))
    for i, x in enumerate((-0.105, -0.035, 0.035, 0.105)):   # four throttles
        parts += jp.lever('throttle_%d' % i, (x, 6.5, FLOOR + 0.56), 0.15, (0.05, 0.035, 0.045), metal, grip)
    parts += jp.switch_block('caution_panel', (0.0, 7.0, FLOOR + 0.585), (0.3, 0.12, 0.05), 2, 6, console, sf.plain('caution_amber', '#b9801c', 0.45))
    parts += jp.lever('gear_lever', (0.3, 7.14, 3.3), 0.14, (0.06, 0.03, 0.06), metal, sf.plain('gear_knob', '#c6c6c0', 0.5), lean=-70.0)
    parts.append(mk.assign(mk.box('panel_body', (1.96, 0.3, 0.5), (0.0, 7.3, 3.57), 0.02), console))
    parts.append(mk.assign(mk.box('coaming', (2.1, 0.34, 0.03), (0.0, 7.13, 3.83), 0.012), wall))
    for side in (-1, 1):
        parts.append(mk.assign(mk.box('side_console', (0.3, 1.6, 0.5), (side * 1.3, 6.3, FLOOR + 0.25), 0.025), console))
        parts += jp.switch_block('side_switches_%d' % side, (side * 1.3, 6.5, FLOOR + 0.515), (0.22, 0.5, 0.03), 5, 3, console, sf.plain('switch_cap', '#8c8f93', 0.5))
    return parts
