"""Ground-support equipment of Base Aerea Punta Garza: ten props in one file on one 2048 atlas, each a
root node with its origin on the ground under its centre, front towards +Y (the game's -Z):

  gse_fuel_truck (8.0 x 2.5 x 3.0 m bowser; child-free, has the glass material), gse_tug (3.2 m
  aircraft tractor) with the child node gse_tug_towbar, gse_stairs (maintenance stairs, platform at
  2 m), gse_generator (ground power unit on a two-wheel trailer), gse_crate_stack, gse_cone,
  gse_drum, gse_chocks, gse_fire_extinguisher_cart, gse_tool_trolley.

All wording and numbers on them are invented. Helpers and the worn material: _gse_parts.py.
"""
import math

import _base_kit as kit
import _gse_parts as gp
from _gse_parts import B, C, R, beam, decal, lathe, text_mask, wheel, worn
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {
    'id': 'base_ground_kit', 'atlas': 2048, 'kind': 'prop', 'builder': 'DetailKitAsset', 'cell': (640, 360), 'columns': 1,
    'views': ((52, 11, 2.3, (1.6, 0.2, 1.3)), (214, 14, 2.5, (1.2, 0.0, 1.3)), (24, 15, 2.6, (10.2, -0.6, 1.1)),
              (8, 24, 6.0, (7.3, -3.5, 0.3)), (32, 20, 4.4, (11.6, -2.7, 0.6))),
}

OLIVE, YELLOW, BLACK = '#4d5437', '#c59a1e', '#1b1c1a'
STENCIL, INK = '#d9d5c3', '#17180f'


def tyre(ref):
    return worn('tyre_rubber', '#171716', 0.86, 0.0, chips=0.0, rust=0.0, dirt=0.4, fade=0.5, ref=ref, dust=0.75, dust_height=1.1, bump=1.4)


def galv(ref, name='galvanised_steel'):
    return worn(name, '#8a8f90', 0.45, 0.8, chips=0.0, rust=0.3, dirt=0.5, fade=0.2, ref=ref, dust=0.4)


def hazard(ref, name='hazard_stripes', direction=(1, 0, 1), period=0.2):
    return worn(name, YELLOW, 0.5, 0.0, chips=0.6, rust=0.25, dirt=0.5, ref=ref, stripes=(BLACK, period, direction, 0.5), dust=0.5)


# --- fuel truck -------------------------------------------------------------------------------------

def fuel_truck(a, slot):
    p = gp.Prop(a, 'gse_fuel_truck', slot, 1.0)
    ref = p.ref
    big = text_mask('COMBUSTIBLE - NO FUMAR', 96)
    small = text_mask('CAP. 9000 L   JP-K', 56)
    fleet = text_mask('FA 2-417', 72)
    home = text_mask('B.A. PUNTA GARZA', 48)
    rear = text_mask(['INFLAMABLE', 'APAGUE EL MOTOR'], 64, frame=5)
    door = gp.drawn_mask('door', (256, 368), lambda d, w, h: d.rounded_rectangle((6, 6, w - 7, h - 7), 26, outline=255, width=4))
    marks = []
    for side in (1, -1):
        marks += [decal(big, (side * 1.15, -0.9, 1.98), (side, 0, 0), 0.62, STENCIL, depth=0.32),
                  decal(small, (side * 1.02, -2.9, 1.42), (side, 0, 0), 0.26, STENCIL, depth=0.3),
                  decal(fleet, (side * 1.19, 3.08, 1.52), (side, 0, 0), 0.34, STENCIL, depth=0.1),
                  decal(home, (side * 1.19, 3.08, 1.26), (side, 0, 0), 0.2, STENCIL, depth=0.1),
                  decal(door, (side * 1.17, 3.08, 1.86), (side, 0, 0), 1.66, INK, depth=0.1, strength=0.8)]
    marks.append(decal(rear, (0, -3.86, 1.95), (0, -1, 0), 0.8, '#d6c23a', depth=0.3))
    olive = worn('truck_olive', OLIVE, 0.5, 0.05, chips=0.45, rust=0.22, dirt=0.5, ref=ref, decals=marks, dust=0.5, dust_height=1.3, stains=0.35)
    hub = worn('truck_hub', OLIVE, 0.5, 0.1, chips=0.6, rust=0.4, dirt=0.7, ref=ref, dust=0.7, dust_height=1.0)
    chassis = worn('truck_chassis', BLACK, 0.6, 0.2, chips=0.5, rust=0.5, dirt=0.6, ref=ref, dust=0.8, dust_height=1.1)
    steel, rubber, stripes = galv(ref), tyre(ref), hazard(ref)
    yellow = worn('truck_yellow', YELLOW, 0.5, 0.0, chips=0.6, rust=0.3, ref=ref)
    hose = worn('hose_rubber', '#22211f', 0.75, 0.0, chips=0.0, rust=0.0, fade=0.4, ref=ref, dust=0.4)
    trim = worn('cab_trim', '#2a2b29', 0.7, 0.0, chips=0.2, rust=0.0, ref=ref, dust=0.2)
    seat = worn('seat_vinyl', '#3d3327', 0.7, 0.0, chips=0.0, rust=0.0, ref=ref, dust=0.0)
    lens = sf.plain('lens_clear', '#c9cdc8', 0.15, 0.3)
    red = sf.plain('lens_red', '#8a1612', 0.25)
    amber = sf.plain('lens_amber', '#c9741a', 0.25)
    glass = sf.glass('glass', '#16262a', 0.5)

    # cab: a hollow shell with real window openings
    def rect(z, half, y0, y1):
        return [(half, y0, z), (half, y1, z), (-half, y1, z), (-half, y0, z)]

    shell = mk.loft('cab', [rect(1.0, 1.2, 2.25, 3.9), rect(1.85, 1.2, 2.25, 3.9), rect(2.74, 1.13, 2.25, 3.68), rect(2.84, 1.02, 2.36, 3.54)])
    mk.bevel(shell, 0.035, 2)
    hollow = mk.loft('cab_in', [rect(1.06, 1.14, 2.31, 3.84), rect(1.85, 1.14, 2.31, 3.84), rect(2.72, 1.07, 2.31, 3.62)])
    mk.boolean(shell, hollow)
    for size, centre in (((2.02, 0.9, 0.72), (0, 3.85, 2.3)),((0.5, 0.86, 0.62), (1.25, 3.12, 2.28)), ((0.5, 0.86, 0.62), (-1.25, 3.12, 2.28)),
                         ((1.5, 0.4, 0.45), (0, 2.2, 2.3))):
        mk.boolean(shell, mk.box('cut', size, centre))
    p.add(mk.shade(mk.assign(shell, olive), 30))

    def front(z):
        return 3.9 - (z - 1.85) * 0.247 - 0.03

    def flank(z):
        return 1.2 - (z - 1.85) * 0.0787 - 0.03

    p.add(gp.panel('windscreen', [(-1.04, front(1.92), 1.92), (1.04, front(1.92), 1.92), (1.04, front(2.68), 2.68), (-1.04, front(2.68), 2.68)], glass, (0, 3, 2.2)))
    p.add(gp.panel('rear_window', [(-0.78, 2.28, 2.06), (0.78, 2.28, 2.06), (0.78, 2.28, 2.54), (-0.78, 2.28, 2.54)], glass, (0, 3, 2.2)))
    for side in (1, -1):
        p.add(gp.panel('side_window', [(side * flank(1.95), 2.68, 1.95), (side * flank(1.95), 3.56, 1.95), (side * flank(2.6), 3.56, 2.6),
                                       (side * flank(2.6), 2.68, 2.6)], glass, (0, 3, 2.2)))
        p.add(B('door_handle', (0.03, 0.14, 0.035), (side * 1.21, 2.62, 1.72), chassis))
        p.add(B('step', (0.16, 0.6, 0.035), (side * 1.14, 3.6, 0.62), steel), B('step_arm', (0.03, 0.04, 0.42), (side * 1.1, 3.38, 0.82), chassis),
              B('step_arm', (0.03, 0.04, 0.42), (side * 1.1, 3.82, 0.82), chassis))
        p.add(R('mirror_arm', [(side * 1.18, 3.72, 2.5), (side * 1.4, 3.84, 2.5), (side * 1.4, 3.84, 1.96), (side * 1.18, 3.72, 1.96)], 0.014, chassis, 5))
        p.add(B('mirror', (0.035, 0.17, 0.4), (side * 1.42, 3.85, 2.24), chassis, bevel=0.008))
        p.add(C('headlight', 0.105, 0.05, (side * 0.88, 3.925, 1.3), 'Y', lens, 10), C('headlight_rim', 0.125, 0.03, (side * 0.88, 3.905, 1.3), 'Y', chassis, 10))
        p.add(B('indicator', (0.14, 0.03, 0.08), (side * 0.88, 3.915, 1.5), amber))
        p.add(R('wiper', [(side * 0.2, 3.9, 1.93), (side * 0.72, 3.83, 2.2)], 0.012, chassis, 4))
        p.add(gp.guard('front_guard', (3.0, 0.5), 0.58, side * 0.88, side * 1.22, -12, 192, chassis))
        p.add(B('mud_flap', (0.62, 0.02, 0.46), (side * 0.93, -3.62, 0.52), rubber))
        p.add(B('rear_guard', (0.66, 2.62, 0.035), (side * 0.93, -2.38, 1.08), chassis, bevel=0.01))
        p.add(B('tail_light', (0.3, 0.03, 0.11), (side * 0.9, -3.985, 0.93), red), B('tail_amber', (0.12, 0.03, 0.11), (side * 0.66, -3.985, 0.93), amber))
        p.add(B('spring', (0.07, 1.25, 0.07), (side * 0.52, 3.0, 0.66), chassis), B('spring', (0.07, 2.3, 0.07), (side * 0.52, -2.38, 0.68), chassis))
        p.add(B('frame_rail', (0.09, 7.0, 0.24), (side * 0.43, -0.42, 0.86), chassis))
        p.add(B('bearer', (0.12, 5.7, 0.13), (side * 0.43, -0.9, 1.045), chassis))
        p.add(B('marker', (0.1, 0.05, 0.04), (side * 0.6, 3.5, 2.86), amber))
    p.add(B('grille', (1.3, 0.04, 0.5), (0, 3.905, 1.34), trim))
    for row in range(5):
        p.add(B('slat', (1.3, 0.03, 0.035), (0, 3.93, 1.14 + 0.1 * row), chassis))
    p.add(B('bumper', (2.46, 0.16, 0.26), (0, 3.92, 0.78), stripes, bevel=0.02), B('plate', (0.5, 0.01, 0.13), (0, 4.0, 0.78), steel))
    p.add(B('seat', (2.0, 0.5, 0.2), (0, 2.75, 1.5), seat, bevel=0.04), B('seat_back', (2.0, 0.16, 0.75), (0, 2.46, 1.9), seat, bevel=0.04))
    p.add(B('dash', (2.2, 0.36, 0.3), (0, 3.62, 1.78), trim, bevel=0.03), C('steering', 0.2, 0.03, (-0.6, 3.36, 2.0), 'Y', trim, 10))
    p.add(R('column', [(-0.6, 3.36, 2.0), (-0.6, 3.6, 1.8)], 0.025, trim, 5))
    p.add(C('beacon', 0.075, 0.12, (0, 3.0, 2.9), 'Z', amber, 8), C('beacon_base', 0.1, 0.03, (0, 3.0, 2.84), 'Z', chassis, 8))
    p.add(R('exhaust', [(-0.95, 1.9, 0.75), (-0.95, 2.12, 0.95), (-0.95, 2.12, 2.9)], 0.055, steel, 7),
          C('exhaust_shield', 0.085, 0.9, (-0.95, 2.12, 1.9), 'Z', chassis, 7))
    p.add(C('diesel_tank', 0.27, 0.9, (-0.82, 1.2, 0.72), 'Y', chassis, 10), C('air_tank', 0.14, 0.7, (0.82, 1.6, 0.72), 'Y', chassis, 8))
    p.add(B('battery_box', (0.5, 0.6, 0.4), (0.84, 0.9, 0.72), chassis, bevel=0.015))
    for y in (3.0, -1.75, -3.0):
        p.add(C('axle', 0.07, 1.9, (0, y, 0.5), 'X', chassis, 7))
    for y in (-1.75, -3.0):
        p.add(C('differential', 0.2, 0.34, (0, y, 0.5), 'Y', chassis, 8))
    p.add(R('prop_shaft', [(0, 2.2, 0.75), (0, -3.0, 0.52)], 0.045, chassis, 6))
    for y in (2.6, 1.0, -0.6, -2.3, -3.8):
        p.add(B('cross_member', (0.86, 0.1, 0.2), (0, y, 0.86), chassis))
    p.add(B('underride', (2.4, 0.1, 0.14), (0, -3.95, 0.6), stripes), B('light_bar', (2.3, 0.06, 0.22), (0, -3.94, 0.93), chassis))
    for x in (-0.6, 0.6):
        p.add(B('underride_arm', (0.06, 0.08, 0.36), (x, -3.9, 0.76), chassis))

    # tank
    w, h, zc = 2.3, 1.55, 1.93
    stations = [{'y': -3.85, 'w': 1.5, 'h': 1.0}, {'y': -3.79, 'w': 2.02, 'h': 1.36}, {'y': -3.66, 'w': w, 'h': h}, {'y': -1.9, 'w': w, 'h': h},
                {'y': 0.1, 'w': w, 'h': h}, {'y': 1.86, 'w': w, 'h': h}, {'y': 1.99, 'w': 2.02, 'h': 1.36}, {'y': 2.05, 'w': 1.5, 'h': 1.0}]
    for s in stations:
        s.update(z=zc, power=2.6)
    p.add(mk.shade(mk.assign(mk.fuselage('tank', stations, 22), olive), 40))
    for y in (-2.8, -0.9, 1.0):
        band = mk.fuselage('tank_band', [{'y': y - 0.04, 'w': w + 0.03, 'h': h + 0.03, 'z': zc, 'power': 2.6},
                                         {'y': y + 0.04, 'w': w + 0.03, 'h': h + 0.03, 'z': zc, 'power': 2.6}], 22)
        p.add(mk.shade(mk.assign(band, olive), 40))
    for y in (-3.3, -1.9, -0.4, 1.4):
        p.add(B('saddle', (1.7, 0.1, 0.22), (0, y, 1.17), chassis))
    p.add(B('catwalk', (0.6, 5.3, 0.035), (0, -0.9, 2.725), steel))
    for x in (-0.3, 0.3):
        p.add(B('toe_rail', (0.03, 5.3, 0.06), (x, -0.9, 2.76), yellow))
    for y in (0.5, -2.3):
        p.add(lathe('manhole', [(0.3, 2.7), (0.3, 2.8), (0.33, 2.8), (0.33, 2.84), (0.1, 2.87)], 'Z', (0, y, 0), olive, 12))
        p.add(R('lid_bar', [(-0.33, y, 2.86), (0.33, y, 2.86)], 0.018, yellow, 4), C('vent', 0.05, 0.1, (0.0, y + 0.55, 2.78), 'Z', steel, 6))
    rail = [(-0.31, -3.45, 2.74), (-0.31, -3.45, 2.97), (-0.31, 1.65, 2.97), (-0.31, 1.65, 2.74)]
    p.add(R('hand_rail', rail, 0.02, yellow, 5))
    for y in (-2.2, -0.9, 0.4):
        p.add(R('rail_post', [(-0.31, y, 2.74), (-0.31, y, 2.97)], 0.018, yellow, 5))
    for x in (0.34, 0.74):
        p.add(R('ladder_rail', [(x, -3.9, 0.72), (x, -3.9, 2.45), (x, -3.72, 2.72), (x, -3.45, 2.76)], 0.02, yellow, 5))
    for step in range(8):
        p.add(R('rung', [(0.34, -3.9, 0.82 + 0.23 * step), (0.74, -3.9, 0.82 + 0.23 * step)], 0.015, steel, 4))

    # pump locker (right, open, with the hose reel) and control locker (left)
    locker = mk.box('pump_locker', (0.62, 1.7, 0.72), (0.9, -0.35, 0.82), 0.02, 1)
    mk.boolean(locker, mk.box('cut', (0.6, 1.56, 0.6), (1.0, -0.35, 0.82)))
    p.add(mk.assign(locker, olive))
    reel = [(0.08, -0.42), (0.26, -0.42), (0.26, -0.39), (0.17, -0.39)]
    for turn in range(7):
        y = -0.375 + 0.108 * turn
        reel += [(0.19, y), (0.205, y + 0.02), (0.205, y + 0.07), (0.19, y + 0.09)]
    reel += [(0.17, 0.39), (0.26, 0.39), (0.26, 0.42), (0.08, 0.42)]
    drum = lathe('hose_reel', reel, 'Y', (0.95, -0.35, 0.83), hose, 12)
    mk.assign_faces(drum, yellow, lambda c, n: abs(c.y + 0.35) > 0.385)
    p.add(drum)
    p.add(gp.rope('hose', [(1.12, -0.1, 0.72), (1.2, 0.2, 0.6), (1.22, 0.42, 0.75), (1.22, 0.44, 1.0), (1.22, 0.44, 1.1)], 0.032, hose, 6))
    p.add(C('nozzle', 0.045, 0.2, (1.22, 0.44, 1.2), 'Z', steel, 7), B('nozzle_grip', (0.04, 0.16, 0.05), (1.22, 0.5, 1.26), chassis))
    p.add(B('locker_door', (0.03, 1.66, 0.7), (1.22, -0.35, 1.52), olive, (0, -8, 0), 0.008))
    box = mk.box('control_locker', (0.62, 1.7, 0.72), (-0.9, -0.35, 0.82), 0.02, 1)
    mk.boolean(box, mk.box('cut', (0.3, 1.5, 0.56), (-1.2, -0.35, 0.84)))
    dials = gp.drawn_mask('dials', (384, 144), lambda d, w, h: [d.ellipse((20 + 120 * i, 22, 110 + 120 * i, 112), outline=255, width=5) for i in range(3)]
                          + [d.line((65 + 120 * i, 67, 90 + 120 * i - 18 * i, 38 + 9 * i), fill=255, width=4) for i in range(3)])
    panel_mat = worn('truck_panel', '#2b2e2b', 0.5, 0.2, chips=0.3, rust=0.15, ref=ref,
                     decals=[decal(dials, (-1.05, -0.35, 0.96), (-1, 0, 0), 0.34, '#d9d7cc', depth=0.12)])
    p.add(mk.assign(box, panel_mat))
    mk.assign_faces(box, olive, lambda c, n: c.x > -1.04 or abs(c.z - 0.82) > 0.3 or abs(c.y + 0.35) > 0.78)
    for i, y in enumerate((-0.85, -0.35, 0.15)):
        p.add(C('valve_wheel', 0.065, 0.025, (-1.1, y, 0.68), 'X', red if i != 1 else yellow, 8), C('coupling', 0.05, 0.12, (-1.14, y + 0.24, 0.66), 'X', steel, 7))
    p.add(C('manifold', 0.07, 2.0, (0.0, -1.0, 1.0), 'Y', steel, 7))
    p.add(lathe('extinguisher', [(0.06, 0.0), (0.075, 0.02), (0.075, 0.4), (0.03, 0.46), (0.03, 0.5)], 'Z', (-1.1, 1.72, 1.0), sf.plain('ext_red', '#8f1a14', 0.4), 8))
    p.add(R('earth_strap', [(0.3, -3.9, 0.62), (0.3, -3.92, 0.3), (0.28, -3.96, 0.03)], 0.012, steel, 4))

    # wheels: one front and one rear pair baked, the others share their texels
    front_wheel = wheel('front_wheel', 0.5, 0.3, (1.07, 3.0, 0.5), rubber, hub, 1, 14, False, 6, steel)
    rear_wheel = wheel('rear_wheel', 0.5, 0.6, (0.93, -1.75, 0.5), rubber, hub, 1, 14, True, 6, steel)
    p.repeat(front_wheel, [gp.mirror_x()])
    p.repeat(rear_wheel, [gp.mirror_x(), gp.shift(y=-1.25), gp.shift(y=-1.25) @ gp.mirror_x()])
    return p.done()


# --- aircraft tug and its tow bar ---------------------------------------------------------------------

def tug(a, slot):
    p = gp.Prop(a, 'gse_tug', slot, 1.0)
    ref = p.ref
    marks = []
    number = text_mask('T-07', 80)
    warn = text_mask(['REMOLQUE', 'MAX 25 T'], 52, frame=4)
    for side in (1, -1):
        marks += [decal(number, (side * 0.9, -0.95, 0.72), (side, 0, 0), 0.3, INK, depth=0.08),
                  decal(warn, (side * 0.9, 0.9, 0.72), (side, 0, 0), 0.26, INK, depth=0.08)]
    yellow = worn('tug_yellow', YELLOW, 0.5, 0.05, chips=0.6, rust=0.3, dirt=0.55, ref=ref, decals=marks, dust=0.5, dust_height=0.9, stains=0.3)
    dark = worn('tug_dark', BLACK, 0.6, 0.2, chips=0.5, rust=0.45, dirt=0.6, ref=ref, dust=0.7, dust_height=0.8)
    hub = worn('tug_hub', '#b9b6aa', 0.5, 0.1, chips=0.5, rust=0.4, dirt=0.7, ref=ref, dust=0.7, dust_height=0.8)
    steel, rubber = galv(ref), tyre(ref)
    stripes = hazard(ref)
    seat = worn('tug_seat', '#2b2723', 0.75, 0.0, chips=0.0, rust=0.0, ref=ref, dust=0.2)
    lens = sf.plain('lens_clear', '#c9cdc8', 0.15, 0.3)
    red = sf.plain('lens_red', '#8a1612', 0.25)
    amber = sf.plain('lens_amber', '#c9741a', 0.25)

    body = mk.box('body', (1.76, 2.9, 0.62), (0, 0, 0.61), 0.05, 2)
    for y in (1.0, -1.0):
        for side in (1, -1):
            mk.boolean(body, mk.cylinder('cut', 0.47, 0.5, (side * 0.82, y, 0.38), 'X', 16))
    well = mk.box('cut', (0.74, 0.8, 0.5), (-0.38, -0.1, 0.84))
    mk.boolean(body, well)
    p.add(mk.shade(mk.assign(body, yellow), 30))
    p.add(B('hood', (1.2, 1.05, 0.26), (0, 0.9, 1.04), yellow, bevel=0.04))
    for i in range(6):
        p.add(B('louvre', (0.5, 0.025, 0.012), (0.0, 0.55 + 0.14 * i, 1.176), dark, (18, 0, 0)))
    p.add(B('rear_deck', (1.5, 0.75, 0.1), (0, -1.02, 0.96), yellow, bevel=0.02), B('ballast', (1.5, 0.12, 0.42), (0, -1.5, 0.6), dark, bevel=0.02))
    p.add(B('bumper_front', (1.8, 0.14, 0.3), (0, 1.53, 0.5), stripes, bevel=0.02), B('bumper_rear', (1.8, 0.1, 0.22), (0, -1.55, 0.36), stripes, bevel=0.02))
    p.add(B('seat', (0.5, 0.48, 0.1), (-0.38, -0.32, 0.72), seat, bevel=0.03), B('seat_back', (0.5, 0.1, 0.46), (-0.38, -0.58, 0.98), seat, bevel=0.03))
    p.add(R('column', [(-0.38, 0.3, 0.66), (-0.38, 0.1, 1.08)], 0.025, dark, 6), C('steering', 0.17, 0.028, (-0.38, 0.09, 1.1), 'Y', dark, 10))
    p.add(B('dash', (0.7, 0.1, 0.3), (-0.38, 0.33, 1.02), dark, (-20, 0, 0), 0.01), R('lever', [(0.05, -0.05, 0.9), (0.05, 0.0, 1.16)], 0.014, steel, 4),
          C('lever_knob', 0.03, 0.05, (0.05, 0.0, 1.18), 'Z', dark, 6))
    hoop = [(-0.8, -0.72, 0.9), (-0.8, -0.72, 1.56), (0.8, -0.72, 1.56), (0.8, -0.72, 0.9)]
    p.add(R('roll_bar', hoop, 0.03, dark, 6), C('beacon', 0.07, 0.11, (0.0, -0.72, 1.645), 'Z', amber, 8), C('beacon_base', 0.09, 0.03, (0, -0.72, 1.59), 'Z', dark, 8))
    for side in (1, -1):
        p.add(C('headlight', 0.08, 0.05, (side * 0.62, 1.47, 0.8), 'Y', lens, 8), B('tail_light', (0.16, 0.03, 0.08), (side * 0.66, -1.46, 0.82), red))
        p.add(R('mirror_arm', [(side * 0.62, 0.42, 1.14), (side * 0.86, 0.5, 1.4)], 0.012, dark, 4), B('mirror', (0.03, 0.12, 0.18), (side * 0.87, 0.51, 1.46), dark))
        p.add(B('side_step', (0.1, 0.5, 0.03), (side * 0.9, 0.0, 0.34), steel))
    p.add(B('hitch_plate', (0.3, 0.06, 0.3), (0, -1.6, 0.46), dark), C('hitch_pin', 0.025, 0.2, (0, -1.68, 0.47), 'Z', steel, 6),
          B('hitch_jaw', (0.14, 0.14, 0.03), (0, -1.68, 0.53), dark), B('hitch_jaw', (0.14, 0.14, 0.03), (0, -1.68, 0.41), dark))
    p.add(B('front_hitch', (0.2, 0.1, 0.12), (0, 1.62, 0.45), dark), R('exhaust', [(0.5, 0.3, 1.0), (0.5, 0.3, 1.42), (0.5, 0.22, 1.47)], 0.03, steel, 6))
    p.add(C('fuel_cap', 0.05, 0.04, (0.52, -0.95, 1.03), 'Z', steel, 7))
    for x in (0.0,):
        p.add(C('axle', 0.06, 1.5, (x, 1.0, 0.38), 'X', dark, 6), C('axle', 0.06, 1.5, (x, -1.0, 0.38), 'X', dark, 6))
    w = wheel('tug_wheel', 0.38, 0.3, (0.74, 1.0, 0.38), rubber, hub, 1, 14, False, 5, steel)
    p.repeat(w, [gp.mirror_x(), gp.shift(y=-2.0), gp.shift(y=-2.0) @ gp.mirror_x()])
    body = p.done()

    bar = gp.Prop(a, 'gse_tug_towbar', slot, 1.0)
    red_paint = worn('towbar_red', '#96241a', 0.5, 0.05, chips=0.7, rust=0.35, dirt=0.5, ref=bar.ref, dust=0.6, dust_height=0.5,
                     decals=[decal(text_mask('BARRA 12 T', 44), (0, -3.0, 0.5), (0, 0, 1), 0.09, STENCIL, up=(1, 0, 0), depth=0.08)])
    steel2, rubber2 = galv(bar.ref, 'towbar_steel'), tyre(bar.ref)
    bar.add(C('tube', 0.045, 2.5, (0, -3.02, 0.44), 'Y', red_paint, 8))
    bar.add(B('eye_plate', (0.1, 0.22, 0.035), (0, -1.74, 0.47), steel2), C('eye', 0.06, 0.036, (0, -1.68, 0.47), 'Z', steel2, 8))
    bar.add(B('head', (0.16, 0.3, 0.1), (0, -4.4, 0.44), red_paint, bevel=0.01))
    for side in (1, -1):
        bar.add(B('fork', (0.03, 0.26, 0.12), (side * 0.07, -4.62, 0.44), steel2))
        bar.add(R('leg', [(0, -3.5, 0.42), (side * 0.26, -3.62, 0.15)], 0.022, red_paint, 5))
        bar.add(wheel('bar_wheel', 0.13, 0.07, (side * 0.3, -3.62, 0.13), rubber2, steel2, side, 10))
    bar.add(C('bar_axle', 0.018, 0.6, (0, -3.62, 0.13), 'X', steel2, 5), C('shear_pin', 0.014, 0.2, (0, -4.66, 0.44), 'X', steel2, 5))
    bar.add(R('handle', [(-0.2, -2.1, 0.44), (-0.2, -2.3, 0.6), (0.2, -2.3, 0.6), (0.2, -2.1, 0.44)], 0.014, steel2, 5))
    bar.done(parent=body)
    return body


# --- maintenance stairs -------------------------------------------------------------------------------

def stairs(a, slot):
    p = gp.Prop(a, 'gse_stairs', slot, 1.0, (0.0, 0.07))
    ref = p.ref
    load = text_mask(['CARGA MAX', '250 KG'], 56, frame=4)
    brake = text_mask('FRENAR ANTES DE SUBIR', 48)
    marks = [decal(load, (s * 0.72, 1.3, 2.3), (s, 0, 0), 0.3, INK, depth=0.06) for s in (1, -1)]
    marks += [decal(brake, (s * 0.64, -0.35, 1.127), (s, 0, 0), 0.26, INK, depth=0.06, up=(0, -0.566, 0.824)) for s in (1, -1)]
    yellow = worn('stairs_yellow', YELLOW, 0.5, 0.05, chips=0.7, rust=0.35, dirt=0.5, ref=ref, decals=marks, dust=0.45, dust_height=0.7, stains=0.3)
    tread = worn('tread_plate', '#7d8283', 0.5, 0.8, chips=0.0, rust=0.35, dirt=0.7, ref=ref, dust=0.5,
                 boards=(0.06, 0.03, 'top', 0.2))
    dark, rubber, steel = worn('stairs_dark', BLACK, 0.6, 0.2, chips=0.5, rust=0.4, ref=ref, dust=0.7), tyre(ref), galv(ref)
    stripes = hazard(ref, 'nosing', (1, 0, 0), 0.16)

    half = 0.62
    # base frame
    for side in (1, -1):
        p.add(beam('base_rail', (side * half, -1.75, 0.3), (side * half, 1.75, 0.3), 0.06, 0.08, yellow, 0.006))
        # stringer from the first step to the platform
        p.add(beam('stringer', (side * half, -1.7, 0.2), (side * half, 0.92, 2.0), 0.04, 0.2, yellow, 0.006))
        for y in (0.98, 1.72):
            p.add(beam('leg', (side * half, y, 0.3), (side * half, y, 2.0), 0.06, 0.06, yellow, 0.006))
        p.add(beam('brace', (side * half, 1.72, 0.34), (side * half, 0.98, 1.9), 0.04, 0.04, yellow))
        p.add(beam('brace', (side * half, -0.55, 0.34), (side * half, 0.2, 1.4), 0.04, 0.04, yellow))
        p.add(beam('platform_side', (side * half, 0.9, 2.0), (side * half, 1.78, 2.0), 0.04, 0.1, yellow))
        p.add(B('kick_plate', (0.012, 0.86, 0.12), (side * (half + 0.02), 1.34, 2.11), yellow))
        p.add(B('sign_plate', (0.012, 0.7, 0.4), (side * (half + 0.09), 1.3, 2.3), yellow))
        # hand rails: along the flight, round the platform
        top = [(side * (half + 0.06), -1.62, 1.22), (side * (half + 0.06), 0.92, 3.0), (side * (half + 0.06), 1.76, 3.0)]
        mid = [(side * (half + 0.06), -1.62, 0.74), (side * (half + 0.06), 0.92, 2.5), (side * (half + 0.06), 1.76, 2.5)]
        p.add(R('rail_top', top, 0.022, yellow, 6), R('rail_mid', mid, 0.018, yellow, 6))
        for y, z0 in ((-1.62, 0.26), (-0.78, 0.84), (0.07, 1.42), (0.92, 2.0), (1.76, 2.0)):
            p.add(R('rail_post', [(side * (half + 0.06), y, z0), (side * (half + 0.06), y, z0 + (1.0 if y > 0.9 else 0.98))], 0.02, yellow, 6))
        p.add(R('stabiliser', [(side * (half + 0.03), -0.2, 0.3), (side * (half + 0.03), -0.2, 0.06)], 0.02, steel, 6),
              C('stabiliser_foot', 0.07, 0.03, (side * (half + 0.03), -0.2, 0.015), 'Z', dark, 8))
    for y in (-1.75, 0.0, 1.75):
        p.add(beam('base_cross', (-half, y, 0.3), (half, y, 0.3), 0.06, 0.08, yellow, 0.006))
    for y in (0.98, 1.72):
        p.add(beam('leg_cross', (-half, y, 1.15), (half, y, 1.15), 0.04, 0.04, yellow))
    p.add(beam('back_brace', (-half, 1.72, 0.36), (half, 1.72, 1.12), 0.035, 0.035, yellow), beam('back_brace', (half, 1.72, 0.36), (-half, 1.72, 1.12), 0.035, 0.035, yellow))
    for z in (2.5, 3.0):
        p.add(R('end_rail', [(-half - 0.06, 1.76, z), (half + 0.06, 1.76, z)], 0.02, yellow, 6))
    p.add(B('end_kick', (2 * half, 0.012, 0.12), (0, 1.79, 2.11), yellow))
    p.add(B('platform', (2 * half - 0.02, 0.9, 0.035), (0, 1.34, 2.035), tread))
    p.add(B('bumper_pad', (2 * half, 0.06, 0.1), (0, 1.84, 2.0), rubber, bevel=0.015))
    # treads: nine steps of 0.2 m rise
    for step in range(9):
        z = 0.2 + 0.2 * step
        y = -1.7 + (z - 0.2) * (2.62 / 1.8) + 0.02
        p.add(B('tread', (2 * half - 0.04, 0.27, 0.03), (0, y, z), tread), B('tread_nose', (2 * half - 0.04, 0.035, 0.04), (0, y - 0.135, z), stripes))
    # tow handle and casters
    p.add(R('tow_handle', [(-0.2, -1.78, 0.3), (-0.2, -2.0, 0.42), (0.2, -2.0, 0.42), (0.2, -1.78, 0.3)], 0.018, dark, 6))
    caster = mk.join('caster', [wheel('caster_wheel', 0.14, 0.07, (0, 0, 0.14), rubber, steel, 1, 10),
                                B('caster_fork', (0.11, 0.05, 0.16), (0, 0.02, 0.22), dark), C('caster_stem', 0.025, 0.06, (0, 0.02, 0.28), 'Z', steel, 6)])
    mk.transform(caster, (half, -1.55, 0.0))
    p.repeat(caster, [gp.shift(x=-2 * half), gp.shift(y=3.1), gp.shift(x=-2 * half, y=3.1)])
    return p.done()


# --- ground power unit --------------------------------------------------------------------------------

def generator(a, slot):
    p = gp.Prop(a, 'gse_generator', slot, 1.1, (-0.1, -0.17))
    ref = p.ref
    title = text_mask(['GRUPO ELECTROGENO', '28 V CC - 115 V 400 HZ'], 52)
    danger = text_mask(['PELIGRO', 'ALTA TENSION'], 48, frame=4)
    number = text_mask('GE-12', 64)
    marks = []
    for side in (1, -1):
        marks += [decal(title, (side * 0.6, -0.5, 1.2), (side, 0, 0), 0.2, STENCIL, depth=0.06),
                  decal(number, (side * 0.6, 0.15, 0.62), (side, 0, 0), 0.18, STENCIL, depth=0.06)]
    marks.append(decal(danger, (0.32, -1.31, 1.2), (0, -1, 0), 0.22, '#d6c23a', depth=0.06))
    dials = gp.drawn_mask('gen_dials', (320, 200), lambda d, w, h: [d.ellipse((16 + 100 * i, 14, 96 + 100 * i, 94), outline=255, width=5) for i in range(3)]
                          + [d.line((56 + 100 * i, 54, 80 + 100 * i - 20 * i, 28 + 8 * i), fill=255, width=4) for i in range(3)]
                          + [d.rectangle((24 + 60 * i, 130, 56 + 60 * i, 176), outline=255, width=4) for i in range(5)])
    olive = worn('gen_olive', OLIVE, 0.5, 0.05, chips=0.5, rust=0.25, dirt=0.5, ref=ref, decals=marks, dust=0.5, dust_height=0.9, stains=0.4)
    panel_mat = worn('gen_panel', '#25282a', 0.45, 0.2, chips=0.3, rust=0.1, ref=ref,
                     decals=[decal(dials, (-0.22, -1.27, 1.02), (0, -1, 0), 0.4, '#d9d7cc', depth=0.06)])
    dark = worn('gen_dark', BLACK, 0.6, 0.2, chips=0.5, rust=0.45, ref=ref, dust=0.7)
    hub = worn('gen_hub', OLIVE, 0.5, 0.1, chips=0.6, rust=0.4, dirt=0.7, ref=ref, dust=0.7)
    steel, rubber = galv(ref), tyre(ref)
    cable = worn('cable_rubber', '#1c1c1b', 0.7, 0.0, chips=0.0, rust=0.0, fade=0.5, ref=ref, dust=0.5, dust_height=0.3)
    stripes = hazard(ref)

    body = mk.box('body', (1.2, 1.9, 0.9), (0, -0.35, 1.0), 0.03, 2)
    mk.boolean(body, mk.box('cut', (0.8, 0.1, 0.5), (-0.14, -1.3, 1.02)))
    p.add(mk.shade(mk.assign(body, olive), 30))
    p.add(B('panel', (0.78, 0.02, 0.48), (-0.14, -1.26, 1.02), panel_mat))
    p.add(B('panel_lid', (0.84, 0.02, 0.54), (-0.14, -1.42, 1.52), olive, (62, 0, 0), 0.006))
    p.add(B('roof', (1.26, 1.96, 0.05), (0, -0.35, 1.47), olive, bevel=0.015))
    for side in (1, -1):
        for i in range(7):
            p.add(B('louvre', (0.02, 0.62, 0.03), (side * 0.605, 0.2, 0.82 + 0.07 * i), dark, (0, side * 28, 0)))
        p.add(B('louvre_frame', (0.015, 0.7, 0.56), (side * 0.6, 0.2, 1.03), dark))
        p.add(B('latch', (0.02, 0.05, 0.1), (side * 0.61, -0.95, 0.86), steel), B('hinge', (0.02, 0.1, 0.03), (side * 0.61, -1.1, 1.36), steel),
              B('hinge', (0.02, 0.1, 0.03), (side * 0.61, -0.3, 1.36), steel))
        p.add(gp.guard('fender', (-0.4, 0.3), 0.37, side * 0.6, side * 0.76, 5, 175, olive, 0.025))
        p.add(B('reflector', (0.1, 0.012, 0.06), (side * 0.5, -1.305, 0.62), sf.plain('lens_red', '#8a1612', 0.25)))
    p.add(B('grille', (0.9, 0.03, 0.6), (0, 0.6, 1.02), dark))
    for i in range(6):
        p.add(B('grille_bar', (0.9, 0.02, 0.025), (0, 0.615, 0.78 + 0.095 * i), steel))
    p.add(R('exhaust', [(0.35, 0.2, 1.48), (0.35, 0.2, 1.74), (0.35, 0.3, 1.8)], 0.04, steel, 7), C('lifting_eye', 0.06, 0.03, (0, -0.35, 1.55), 'X', steel, 8))
    p.add(C('fuel_cap', 0.05, 0.04, (-0.4, -1.0, 1.51), 'Z', steel, 7))
    # chassis, drawbar, jockey wheel
    p.add(B('chassis', (1.1, 1.9, 0.1), (0, -0.35, 0.5), dark), C('axle', 0.035, 1.4, (0, -0.4, 0.3), 'X', dark, 6))
    for side in (1, -1):
        p.add(beam('drawbar', (side * 0.45, 0.55, 0.48), (0.0, 1.5, 0.48), 0.06, 0.08, dark))
        p.add(B('rear_stand', (0.05, 0.05, 0.42), (side * 0.45, -1.2, 0.24), dark))
    p.add(B('coupling', (0.1, 0.22, 0.08), (0, 1.5, 0.48), dark), C('tow_ring', 0.06, 0.03, (0, 1.64, 0.48), 'Z', steel, 8))
    p.add(R('jockey', [(0.12, 1.2, 0.75), (0.12, 1.2, 0.16)], 0.025, steel, 6), wheel('jockey_wheel', 0.09, 0.05, (0.12, 1.2, 0.09), rubber, steel, 1, 8),
          R('jockey_crank', [(0.12, 1.2, 0.75), (0.12, 1.32, 0.75), (0.12, 1.32, 0.68)], 0.012, steel, 4))
    p.add(B('rear_bumper', (1.2, 0.05, 0.1), (0, -1.33, 0.5), stripes))
    # the cable: coiled on two hooks on the right side, the plug on the ground
    for y in (-0.62, -0.02):
        p.add(R('hook', [(0.6, y, 0.98), (0.72, y, 0.98), (0.72, y, 1.06)], 0.014, steel, 4))
    coil = []
    for turn in range(3):
        x = 0.655 + 0.028 * turn
        coil += [(x, -0.62, 0.99), (x, -0.32, 0.62 - 0.03 * turn), (x, -0.02, 0.99), (x, -0.32, 1.0)]
    coil += [(0.72, -0.62, 0.99), (0.76, -0.75, 0.5), (0.8, -0.95, 0.06), (0.93, -0.6, 0.03), (0.98, 0.0, 0.03), (0.9, 0.42, 0.03)]
    p.add(gp.rope('cable', coil, 0.024, cable, 6))
    p.add(B('plug', (0.09, 0.2, 0.07), (0.88, 0.52, 0.04), dark, (0, 0, 12), 0.01), B('plug_grip', (0.11, 0.07, 0.05), (0.89, 0.45, 0.04), steel, (0, 0, 12)))
    w = wheel('gen_wheel', 0.3, 0.16, (0.68, -0.4, 0.3), rubber, hub, 1, 12, False, 5, steel)
    p.repeat(w, [gp.mirror_x()])
    return p.done()


# --- crates on a pallet ---------------------------------------------------------------------------------

def crate(p, name, size, centre, turn, material, metal, rope_mat, cleats=True):
    """A lidded crate with end cleats, rope handles and two latches; centre is the middle of its base."""
    sx, sy, sz = size
    parts = [mk.assign(mk.box(name, (sx, sy, sz - 0.03), (0, 0, (sz - 0.03) * 0.5), 0.006, 1), material),
             mk.assign(mk.box(name + '_lid', (sx + 0.012, sy + 0.012, 0.03), (0, 0, sz - 0.015), 0.004, 1), material)]
    if cleats:
        for side in (1, -1):
            for y in (-sy * 0.32, sy * 0.32):
                parts.append(B('cleat', (0.022, 0.06, sz - 0.05), (side * (sx * 0.5 + 0.011), y, sz * 0.5 - 0.02), material))
            parts.append(gp.rope('handle', [(side * (sx * 0.5 + 0.02), -sy * 0.2, sz * 0.62), (side * (sx * 0.5 + 0.06), 0, sz * 0.48),
                                            (side * (sx * 0.5 + 0.02), sy * 0.2, sz * 0.62)], 0.011, rope_mat, 4))
    for x in (-sx * 0.3, sx * 0.3):
        parts.append(B('latch', (0.05, 0.012, 0.07), (x, -sy * 0.5 - 0.008, sz - 0.05), metal))
        parts.append(B('hinge', (0.06, 0.012, 0.04), (x, sy * 0.5 + 0.008, sz - 0.035), metal))
    for obj in parts:
        mk.transform(obj, centre, (0, 0, turn))
    p.add(parts)


def crate_stack(a, slot):
    p = gp.Prop(a, 'gse_crate_stack', slot, 1.15)
    ref = p.ref
    lot = text_mask(['CARTUCHOS 30 MM', '110 U - LOTE PG-0417'], 48)
    fragile = text_mask(['FRAGIL', 'ESTE LADO ARRIBA'], 44, frame=4)
    parts_text = text_mask(['REPUESTOS', 'TREN DE ATERRIZAJE'], 44)
    olive = worn('crate_olive', '#4a5034', 0.6, 0.0, chips=0.6, under=('#8d7a55', '#a08c63'), rust=0.0, dirt=0.5, ref=ref, dust=0.4, dust_height=0.5,
                 boards=(1.4, 0.115, 'front', 0.03),
                 decals=[decal(lot, (-0.3, -0.5, 0.33), (0, -1, 0), 0.2, '#d6c23a', depth=0.06), decal(lot, (0.3, -0.5, 0.33), (0, -1, 0), 0.2, '#d6c23a', depth=0.06),
                         decal(lot, (0.02, -0.09, 1.14), (0, -1, 0), 0.17, '#d6c23a', depth=0.06)])
    wood = worn('crate_wood', '#a58a5c', 0.8, 0.0, chips=0.0, rust=0.0, dirt=0.6, fade=0.5, ref=ref, dust=0.4, dust_height=0.5,
                boards=(1.6, 0.095, 'front', 0.05),
                decals=[decal(fragile, (0, -0.47, 0.76), (0, -1, 0), 0.24, '#2a211a', depth=0.08), decal(parts_text, (0.51, 0.0, 0.76), (1, 0, 0), 0.2, '#2a211a', depth=0.08),
                        decal(parts_text, (-0.51, 0.0, 0.76), (-1, 0, 0), 0.2, '#2a211a', depth=0.08)])
    pallet = worn('pallet_wood', '#8e7a58', 0.85, 0.0, chips=0.0, rust=0.0, dirt=0.8, fade=0.6, ref=ref, dust=0.6, dust_height=0.3, boards=(2.0, 0.3, 'top', 0.02))
    metal = worn('crate_metal', '#3a3d38', 0.5, 0.6, chips=0.5, rust=0.5, ref=ref, dust=0.3)
    rope_mat = worn('hemp_rope', '#9c8a66', 0.9, 0.0, chips=0.0, rust=0.0, dirt=0.7, ref=ref, dust=0.3, bump=1.5)
    strap = worn('strap_webbing', '#b7781c', 0.8, 0.0, chips=0.0, rust=0.0, dirt=0.6, fade=0.5, ref=ref, dust=0.3)

    for y in (-0.44, 0.0, 0.44):
        p.add(B('bearer', (1.2, 0.1, 0.09), (0, y, 0.065), pallet), B('skid', (1.2, 0.1, 0.02), (0, y, 0.01), pallet))
    for i in range(7):
        p.add(B('deck_board', (0.145, 1.0, 0.022), (-0.5275 + 0.1758 * i, 0, 0.121), pallet, (0, 0, (i * 37 % 5 - 2) * 0.4)))
    z = 0.132
    crate(p, 'ammo_a', (0.56, 0.96, 0.36), (-0.3, 0.0, z), 0, olive, metal, rope_mat)
    crate(p, 'ammo_b', (0.56, 0.96, 0.36), (0.3, 0.0, z), 0, olive, metal, rope_mat)
    crate(p, 'spares', (1.0, 0.9, 0.5), (0.0, 0.0, z + 0.36), 0, wood, metal, rope_mat, False)
    for side in (1, -1):
        for y in (-0.36, 0.36):
            p.add(B('batten', (0.025, 0.07, 0.5), (side * 0.512, y, z + 0.61), wood))
        p.add(B('batten', (0.025, 0.72, 0.07), (side * 0.512, 0, z + 0.4), wood), B('batten', (0.025, 0.72, 0.07), (side * 0.512, 0, z + 0.82), wood))
    crate(p, 'ammo_c', (0.5, 0.86, 0.3), (0.02, 0.17, z + 0.86), 86, olive, metal, rope_mat)
    top = z + 0.86
    # two straps round the stack (over the big crate), with ratchets
    for x in (-0.34, 0.36):
        loop = [(x, -0.488, 0.11), (x, -0.488, top + 0.012), (x, 0.488, top + 0.012), (x, 0.488, 0.11)]
        for first, second in zip(loop[:-1], loop[1:]):
            p.add(beam('strap', first, second, 0.045, 0.006, strap) if abs(first[2] - second[2]) < 0.01 else
                  B('strap', (0.045, 0.006, abs(second[2] - first[2])), (x, first[1] + (0.004 if first[1] > 0 else -0.004), 0.5 * (first[2] + second[2])), strap))
        p.add(B('ratchet', (0.07, 0.03, 0.13), (x, -0.52, 0.62), metal, bevel=0.006), B('ratchet_lever', (0.05, 0.02, 0.1), (x, -0.545, 0.68), metal, (25, 0, 0)))
    return p.done()


# --- small props --------------------------------------------------------------------------------------

def cone(a, slot):
    p = gp.Prop(a, 'gse_cone', slot, 1.4)
    ref = p.ref
    orange = worn('cone_orange', '#c9501a', 0.6, 0.0, chips=0.0, rust=0.0, dirt=0.75, fade=0.6, ref=ref, dust=0.6, dust_height=0.35)
    band = worn('cone_band', '#d9dad4', 0.3, 0.0, chips=0.35, under=('#c9501a', '#b8481a'), rust=0.0, dirt=0.5, ref=ref, dust=0.2,
                boards=(0.02, 0.02, 'front', 0.12))
    base = worn('cone_base', '#1d1d1c', 0.85, 0.0, chips=0.0, rust=0.0, fade=0.5, ref=ref, dust=0.8, dust_height=0.08)
    foot = mk.box('foot', (0.4, 0.4, 0.035), (0, 0, 0.0175), 0.012, 1)
    p.add(mk.assign(foot, base))
    body = lathe('cone', [(0.155, 0.03), (0.15, 0.05), (0.118, 0.3), (0.092, 0.5), (0.03, 0.735), (0.022, 0.75), (0.012, 0.745)], 'Z', (0, 0, 0), orange, 14)
    mk.assign_faces(body, band, lambda c, n: 0.3 < c.z < 0.5)
    p.add(body)
    return p.done()


def drum(a, slot):
    p = gp.Prop(a, 'gse_drum', slot, 1.3)
    ref = p.ref
    label = text_mask(['ACEITE HIDRAULICO', 'H-515  200 L'], 44)
    paint = worn('drum_paint', '#3f4a3a', 0.45, 0.3, chips=0.7, rust=0.6, dirt=0.6, ref=ref, dust=0.5, dust_height=0.3, stains=0.5, stain_color='#3a1f10',
                 decals=[decal(label, (0, -0.29, 0.55), (0, -1, 0), 0.16, STENCIL, depth=0.1), decal(label, (0, 0.29, 0.55), (0, 1, 0), 0.16, STENCIL, depth=0.1)],
                 stripes=None)
    band = worn('drum_band', YELLOW, 0.45, 0.3, chips=0.7, rust=0.55, ref=ref, dust=0.2)
    r = 0.286
    profile = [(r - 0.02, 0.0), (r + 0.006, 0.0), (r + 0.006, 0.02), (r, 0.03), (r, 0.275), (r + 0.011, 0.29), (r + 0.011, 0.305), (r, 0.32),
               (r, 0.565), (r + 0.011, 0.58), (r + 0.011, 0.595), (r, 0.61), (r, 0.855), (r + 0.006, 0.865), (r + 0.006, 0.885), (r - 0.012, 0.885),
               (r - 0.014, 0.868), (0.02, 0.868)]
    body = lathe('drum', profile, 'Z', (0, 0, 0), paint, 20)
    mk.assign_faces(body, band, lambda c, n: 0.66 < c.z < 0.8)

    def dent(v):
        out = [v.x, v.y, v.z]
        for angle, z, depth, reach in ((0.6, 0.45, 0.03, 0.16), (3.5, 0.2, 0.022, 0.12), (4.6, 0.7, 0.018, 0.1)):
            dx, dy = math.cos(angle), math.sin(angle)
            if math.hypot(v.x, v.y) < 0.2:
                continue
            d = math.hypot(v.x - dx * r, v.y - dy * r, v.z - z)
            push = depth * math.exp(-(d / reach) ** 2)
            out[0] -= dx * push
            out[1] -= dy * push
        return out

    mk.map_points(body, dent)
    p.add(body)
    p.add(C('bung', 0.035, 0.022, (0.17, 0.0, 0.877), 'Z', band, 8), C('bung_small', 0.02, 0.018, (-0.19, 0.03, 0.875), 'Z', band, 6))
    return p.done()


def chocks(a, slot):
    p = gp.Prop(a, 'gse_chocks', slot, 1.4)
    ref = p.ref
    yellow = worn('chock_yellow', YELLOW, 0.55, 0.0, chips=0.8, under=('#2a2a28', '#3a3a37'), rust=0.0, dirt=0.7, ref=ref, dust=0.5, dust_height=0.2,
                  stripes=(BLACK, 0.09, (1, 0, 0), 0.72))
    rope_mat = worn('chock_rope', '#a39472', 0.9, 0.0, chips=0.0, rust=0.0, dirt=0.8, ref=ref, dust=0.4, dust_height=0.1, bump=1.5)
    for sign in (1, -1):
        # a wedge: the slope faces the wheel between the two chocks
        y_out, y_in = sign * 0.4, sign * 0.17
        pts = [(-0.24, y_out, 0.0), (0.24, y_out, 0.0), (0.24, y_in, 0.0), (-0.24, y_in, 0.0),
               (-0.24, y_out, 0.19), (0.24, y_out, 0.19), (0.24, y_out - sign * 0.07, 0.19), (-0.24, y_out - sign * 0.07, 0.19)]
        wedge = mk.mesh_object('chock', pts, [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (3, 2, 6, 7), (0, 3, 7, 4), (1, 2, 6, 5)])
        mk.recalc_normals(wedge)
        mk.bevel(wedge, 0.012, 1)
        p.add(mk.assign(wedge, yellow))
        p.add(C('eyelet', 0.022, 0.03, (0.25, sign * 0.34, 0.1), 'X', rope_mat, 6))
    p.add(gp.rope('rope', [(0.27, 0.34, 0.1), (0.34, 0.3, 0.03), (0.4, 0.12, 0.014), (0.33, -0.05, 0.014), (0.42, -0.2, 0.014), (0.34, -0.3, 0.03),
                           (0.27, -0.34, 0.1)], 0.012, rope_mat, 5))
    return p.done()


def extinguisher_cart(a, slot):
    p = gp.Prop(a, 'gse_fire_extinguisher_cart', slot, 1.25)
    ref = p.ref
    label = text_mask(['EXTINTOR', 'POLVO ABC 50 KG'], 44, frame=4)
    red = worn('ext_red', '#9c1c15', 0.4, 0.2, chips=0.5, rust=0.2, dirt=0.4, ref=ref, dust=0.4, dust_height=0.3,
               decals=[decal(label, (0, 0.175, 0.62), (0, 1, 0.12), 0.2, '#e3dfd2', depth=0.1, up=(0, -0.12, 1))])
    dark = worn('ext_dark', BLACK, 0.6, 0.2, chips=0.5, rust=0.4, ref=ref, dust=0.6, dust_height=0.3)
    steel, rubber = galv(ref), tyre(ref)
    hose = worn('ext_hose', '#1f1f1e', 0.75, 0.0, chips=0.0, rust=0.0, fade=0.4, ref=ref, dust=0.3)
    lean = 7
    tank = lathe('cylinder', [(0.05, 0.14), (0.16, 0.16), (0.172, 0.2), (0.172, 0.86), (0.15, 0.95), (0.09, 1.01), (0.045, 1.03), (0.045, 1.08), (0.02, 1.08)],
                 'Z', (0, 0, 0), red, 14)
    parts = [tank, C('valve', 0.035, 0.1, (0, 0, 1.12), 'Z', steel, 7), B('valve_lever', (0.03, 0.2, 0.02), (0, 0.06, 1.18), dark, (-12, 0, 0)),
             C('gauge', 0.035, 0.02, (0.0, 0.05, 1.1), 'Y', steel, 8), C('skirt', 0.165, 0.05, (0, 0, 0.145), 'Z', dark, 12)]
    coil = []
    for turn in range(3):
        zc = 0.46 + 0.05 * turn
        coil += [(-0.12, 0.165 + 0.0 * turn, zc + 0.22), (-0.2, 0.06, zc), (-0.12, 0.165, zc - 0.2), (0.12, 0.17, zc - 0.2), (0.2, 0.06, zc + 0.02), (0.12, 0.165, zc + 0.22)]
    parts.append(gp.rope('hose', [(0.0, 0.03, 1.1), (-0.1, 0.1, 1.02)] + coil + [(0.0, 0.2, 0.86)], 0.017, hose, 5))
    parts.append(C('horn', 0.02, 0.26, (0.19, 0.08, 0.7), 'Z', hose, 7, 0.05))
    for obj in parts:
        mk.transform(obj, (0, 0.08, 0.0), (lean, 0, 0))
    p.add(parts)
    for side in (1, -1):
        p.add(R('frame', [(side * 0.2, -0.36, 1.02), (side * 0.2, -0.26, 0.9), (side * 0.2, -0.12, 0.2), (side * 0.2, 0.26, 0.03)], 0.016, dark, 6))
    p.add(R('handle', [(-0.2, -0.36, 1.02), (0.2, -0.36, 1.02)], 0.018, dark, 6), R('cross', [(-0.2, -0.19, 0.55), (0.2, -0.19, 0.55)], 0.014, dark, 5))
    p.add(R('foot', [(-0.2, 0.26, 0.03), (0.2, 0.26, 0.03)], 0.016, dark, 6), B('base_plate', (0.36, 0.34, 0.02), (0, 0.07, 0.125), dark))
    p.add(B('clamp', (0.4, 0.03, 0.04), (0, -0.2, 0.8), steel), C('axle', 0.014, 0.52, (0, -0.1, 0.19), 'X', steel, 5))
    w = wheel('ext_wheel', 0.19, 0.055, (0.26, -0.1, 0.19), rubber, steel, 1, 12)
    p.repeat(w, [gp.mirror_x()])
    return p.done()


def tool_trolley(a, slot):
    p = gp.Prop(a, 'gse_tool_trolley', slot, 1.25)
    ref = p.ref
    name = text_mask('MANTENIMIENTO L-2', 44)
    paint = worn('trolley_paint', '#555c4b', 0.5, 0.2, chips=0.7, rust=0.3, dirt=0.6, ref=ref, dust=0.4, dust_height=0.4,
                 decals=[decal(name, (s * 0.25, 0.0, 0.83), (s, 0, 0), 0.2, STENCIL, depth=0.03) for s in (1, -1)])
    dark = worn('trolley_dark', BLACK, 0.6, 0.2, chips=0.4, rust=0.3, ref=ref, dust=0.4)
    steel, rubber = galv(ref), tyre(ref)
    tool = worn('tool_steel', '#9a9c9c', 0.35, 0.9, chips=0.0, rust=0.2, dirt=0.5, ref=ref, dust=0.0)
    red = worn('toolbox_red', '#8f1f18', 0.45, 0.2, chips=0.6, rust=0.2, ref=ref, dust=0.1)
    rag = worn('rag', '#8d3b2c', 0.95, 0.0, chips=0.0, rust=0.0, dirt=0.9, ref=ref, dust=0.0, bump=1.5)
    can = worn('oil_can', '#2f5a4a', 0.4, 0.4, chips=0.5, rust=0.3, dirt=0.7, ref=ref, dust=0.0)
    for z, lip in ((0.2, 0.06), (0.52, 0.06), (0.84, 0.09)):
        tray = mk.box('tray', (0.5, 0.84, lip), (0, 0, z + lip * 0.5), 0.006, 1)
        mk.boolean(tray, mk.box('cut', (0.47, 0.81, lip), (0, 0, z + lip * 0.5 + 0.012)))
        p.add(mk.assign(tray, paint))
    for sx in (1, -1):
        for sy in (1, -1):
            p.add(beam('upright', (sx * 0.245, sy * 0.415, 0.13), (sx * 0.245, sy * 0.415, 0.93), 0.025, 0.025, paint))
    p.add(R('push_handle', [(-0.245, -0.415, 0.9), (-0.245, -0.5, 0.98), (0.245, -0.5, 0.98), (0.245, -0.415, 0.9)], 0.014, dark, 6))
    # what lies on it
    p.add(B('toolbox', (0.2, 0.44, 0.17), (0.08, 0.12, 0.618), red, (0, 0, 4), 0.008), R('toolbox_handle', [(0.08, 0.02, 0.705), (0.08, 0.02, 0.73), (0.09, 0.22, 0.73), (0.09, 0.22, 0.705)], 0.008, dark, 4))
    for i, (x, y, turn, length) in enumerate(((-0.12, 0.2, 12, 0.3), (-0.05, 0.16, -6, 0.26), (0.03, 0.22, 21, 0.22), (0.12, 0.1, -30, 0.2))):
        p.add(B('spanner', (0.022, length, 0.006), (x, y, 0.857 + 0.001 * i), tool, (0, 0, turn)), B('spanner_head', (0.045, 0.04, 0.007), (x - math.sin(math.radians(turn)) * length * 0.5,
              y + math.cos(math.radians(turn)) * length * 0.5, 0.857 + 0.001 * i), tool, (0, 0, turn)))
    p.add(C('hammer_handle', 0.013, 0.3, (0.1, -0.2, 0.868), 'Y', sf.plain('handle_wood', '#8f6f44', 0.7), 6), B('hammer_head', (0.1, 0.035, 0.035), (0.1, -0.05, 0.872), tool, bevel=0.005))
    p.add(B('socket_case', (0.16, 0.24, 0.035), (-0.12, -0.2, 0.872), dark, (0, 0, -8), 0.004))
    p.add(lathe('oil_can', [(0.05, 0.0), (0.055, 0.01), (0.055, 0.13), (0.015, 0.17), (0.008, 0.26)], 'Z', (-0.12, -0.25, 0.532), can, 8))
    p.add(lathe('spray_can', [(0.03, 0.0), (0.033, 0.005), (0.033, 0.17), (0.015, 0.185), (0.012, 0.2)], 'Z', (0.14, -0.3, 0.532), can, 8))
    p.add(C('grease_tin', 0.07, 0.07, (-0.1, 0.25, 0.567), 'Z', can, 10), B('jack', (0.18, 0.4, 0.14), (0.05, 0.1, 0.282), dark, (0, 0, -5), 0.01),
          R('jack_handle', [(0.05, -0.08, 0.3), (0.02, -0.36, 0.42)], 0.012, tool, 5))
    drape = mk.box('rag', (0.2, 0.012, 0.16), (0.02, -0.426, 0.86), 0.004, 1)
    cloth = mk.box('rag_top', (0.2, 0.1, 0.012), (0.02, -0.38, 0.94), 0.004, 1)
    p.add(mk.assign(drape, rag), mk.assign(cloth, rag))
    caster = mk.join('trolley_caster', [wheel('trolley_wheel', 0.055, 0.03, (0, 0, 0.055), rubber, steel, 1, 8), B('trolley_fork', (0.05, 0.03, 0.08), (0, 0.01, 0.1), dark),
                                        C('trolley_stem', 0.012, 0.06, (0, 0.01, 0.16), 'Z', steel, 5)])
    mk.transform(caster, (0.22, 0.38, 0.0))
    p.repeat(caster, [gp.shift(x=-0.44), gp.shift(y=-0.76), gp.shift(x=-0.44, y=-0.76)])
    return p.done()


def make(a):
    a.margin = 0.0016
    a.image_quality = 80
    a.occlusion = (24, 0.35, 1.2)
    fuel_truck(a, (0.0, 0.0))
    tug(a, (4.4, 1.6))
    stairs(a, (8.2, 0.2))
    generator(a, (11.6, 1.2))
    crate_stack(a, (11.2, -2.7))
    tool_trolley(a, (13.0, -2.6))
    extinguisher_cart(a, (9.6, -3.2))
    drum(a, (6.3, -3.5))
    cone(a, (7.3, -3.5))
    chocks(a, (8.4, -3.7))
