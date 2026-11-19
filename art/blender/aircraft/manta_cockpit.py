"""Manta Sombra flight deck: the two-seat side-by-side glass cockpit seen from the left seat, a model
of its own (game/assets/aircraft/manta_cockpit.glb) in the airframe's frame and origin, shown by the
game only in the cockpit view.

    /opt/marazul-blender/bin/python art/build_aircraft.py manta_cockpit            # bake + export
    /opt/marazul-blender/bin/python art/build_aircraft.py manta_cockpit --source   # model + checks only
    /opt/marazul-blender/bin/python art/build_aircraft.py manta_cockpit --repack   # Draco-pack the written file

It fits inside the hump of manta_sombra.py: the four window openings are the exterior's four panes
(cells of the same grid on the lining, 6 cm under the skin), the floor is the exterior's. Everything
is placed from the pilot's eye (EYE), so the picture from the seat is the design: the glare shield's
lip a third of the way up, the two left displays under it either side of the stick, the combiner on
the dash, the centre post and the left side post against the sky.

Nodes: cockpit_shell, canopy_glass, display_map / _radar / _engines / _cautions, hud_combiner,
throttles > hand_throttle, stick > hand_stick, empties eye, glow_panel, glow_console.
MANTA_COCKPIT_VIEWS="eye,quarter,hands,right" renders pictures into the scratch directory.
"""
import json
import math
import os
import random
import shutil
import sys
import time

import bpy
from mathutils import Matrix, Vector

import _manta_cockpit_parts as cp
from _manta_cockpit_parts import R, S, T, Geo, frame
from lib import meshkit as mk

ASSET = {'id': 'manta_cockpit', 'atlas': 2048}
SCRATCH = '/tmp/marazul/flight/s4/a1-manta-cockpit'
MAX_BYTES = int(1.3 * 1024 * 1024)

EYE = (-0.55, 6.6, 3.85)
FOV, GAZE = 64.0, -4.0
EX, EY, EZ = EYE
FLOOR = cp.FLOOR
REAR = 5.0                                   # the bulkhead behind the seats
LIP_Y, LIP_Z = EY + 0.66, EZ - 0.157         # the glare shield's lip: 13.4 degrees under the eye's horizon
PANEL_L = 0.546
PANEL = frame((0.0, EY + 0.67, LIP_Z - 0.555), (1, 0, 0), (0.0, 0.11, 0.535))
DISPLAYS = (('display_map', -0.7625), ('display_radar', -0.4175), ('display_engines', 0.4175), ('display_cautions', 0.7625))
DISPLAY_V = 0.349
HINGE = (-0.115, EY + 0.6, EZ - 0.474)        # throttle hinge line (along X)
IDLE_LEAN = 20.0                              # the levers lean this far aft at idle
LEVER = 0.2                                   # hinge to the middle of a throttle knob
STICK_PIVOT = (EX, EY + 0.57, EZ - 0.84)
GRIP = (EX, EY + 0.54, EZ - 0.325)            # centre of the stick's grip
SHOULDER_R, SHOULDER_L = (EX + 0.19, EY - 0.08, EZ - 0.3), (EX - 0.19, EY - 0.08, EZ - 0.3)
CONSOLE_TOP = EZ - 0.8                        # side consoles (and the seat pan) lie this high
SIDE_IN, SIDE_OUT, WALL_X = 0.86, 1.3, 1.82

HI, HAND, PED, MID, SLEEVE, LOW = 3.2, 4.2, 2.2, 1.3, 1.7, 0.42
# WebP quality of each atlas map and the ORM map's size: the first rung that fits MAX_BYTES is kept.
LADDER = (({'base': 86, 'orm': 66, 'normal': 80}, 2048), ({'base': 84, 'orm': 56, 'normal': 76}, 2048), ({'base': 82, 'orm': 46, 'normal': 72}, 2048),
          ({'base': 80, 'orm': 38, 'normal': 70}, 2048), ({'base': 80, 'orm': 60, 'normal': 70}, 1536), ({'base': 78, 'orm': 60, 'normal': 66}, 1024))

WORDS = ['BAT 1', 'BAT 2', 'GEN 1', 'GEN 2', 'APU', 'HID A', 'HID B', 'IMPUL', 'PITOT', 'DESHIELO', 'LUZ CAB', 'NAV', 'RADAR', 'IFF',
         'FIRMA', 'OCULTO', 'CALEF', 'PRES', 'OXIG', 'GRAB', 'VOZ', 'DATOS', 'INERC', 'CRUCE', 'PURGA', 'ALTA', 'BAJA', 'PRUEBA',
         'LAMP', 'SEG', 'ENLACE', 'CIFRA', 'BARRA', 'TRIM', 'AMORT', 'FRENO']


# --- small layout helpers -----------------------------------------------------------------------------
def welded(geo, material, points, cells, flip=False):
    """Adds a grid: points {(i, j): xyz}, cells [(i, j)] (the quad i..i+1, j..j+1) sharing their corners."""
    index, verts, faces = {}, [], []
    for i, j in cells:
        ids = []
        for key in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)):
            if key not in index:
                index[key] = len(verts)
                verts.append(points[key])
            ids.append(index[key])
        faces.append(tuple(reversed(ids)) if flip else tuple(ids))
    geo.put((verts, faces), material)


def extrude_x(outline, x0, x1, c=0.004):
    """A closed prism: a counter-clockwise outline in (y, z), from x0 to x1. Returns (shape, matrix)."""
    length = x1 - x0
    return cp.sweep(outline, [(c, 0), (0, c), (0, length - c), (c, length)], cap=True, bottom=True), frame((x0, 0, 0), (0, 1, 0), (0, 0, 1))


def subpanel(kit, M, base, u, v, w, h, title=None, density=HI, size=0.0085, node='cockpit_shell'):
    """A removable plate on a panel with a screw in each corner and its title engraved along the top."""
    kit.geo(node, density).put(cp.pad(w, h, 0.002, 0.0008, u, v), M['plate_grey'], base)
    for su in (-1, 1):
        for sv in (-1, 1):
            kit.place('screw', base @ T(u + su * (w / 2 - 0.008), v + sv * (h / 2 - 0.008), 0.002), node)
    if title:
        kit.legends(node).text(title, size, M['legend'], base @ T(u, v + h / 2 - 0.013, 0.0026))


def label(kit, M, base, body, u, v, size=0.0065, z=0.0026, material='legend', node='cockpit_shell'):
    kit.legends(node).text(body, size, M[material], base @ T(u, v, z))


def switch_row(kit, M, base, u0, v, names, pitch=0.05, kind='toggle', z=0.002):
    for i, name in enumerate(names):
        u = u0 + i * pitch
        if kind == 'knob':
            kit.place('knob', base @ T(u, v, z) @ R('Z', (i * 67) % 240 - 120))
        elif kind == 'cover':
            kit.place('toggle_plain', base @ T(u, v, z))
            kit.place('cover', base @ T(u, v, z))
        else:
            kit.place('toggle' if (i * 7 + len(name)) % 3 else 'toggle_dn', base @ T(u, v, z))
        if name:
            label(kit, M, base, name, u, v - 0.027, 0.006, z + 0.0006)


def filler(kit, M, base, u, v, w, h, title, seed, density=MID):
    """A console panel filled from the stock: rows of switches, knobs and keys with labels."""
    rng = random.Random(seed)
    subpanel(kit, M, base, u, v, w, h, title, density)
    rows = max(1, int((h - 0.03) / 0.062))
    for row in range(rows):
        rv = v + h / 2 - 0.055 - row * 0.062
        kind = rng.choice(['toggle', 'toggle', 'knob', 'key'])
        count = max(2, int((w - 0.04) / 0.052))
        u0 = u - (count - 1) * 0.026
        if kind == 'key':
            for i in range(count * 2):
                kit.place('key', base @ T(u - (count * 2 - 1) * 0.011 + i * 0.022, rv, 0.002))
        else:
            switch_row(kit, M, base, u0, rv, [rng.choice(WORDS) for _ in range(count)], 0.052, kind)


# --- the hump's inside: lining, window frames, glass ---------------------------------------------------------
def build_lining(kit, M):
    xs = [0.0, 0.14, 0.28, 0.43, 0.57, 0.72, 0.87, 1.02, 1.16, 1.3, 1.44, 1.58, 1.72, WALL_X]
    ts = [0.012, 0.03, 0.05, 0.068, 0.085, 0.095, 0.108, 0.12, 0.135, 0.15, 0.17, 0.19, 0.215, 0.24, 0.27, 0.3]
    for side in (1, -1):
        points = {}
        for i, x in enumerate(xs):
            for j, t in enumerate(ts):
                y = max(cp.chord_y(x, t), REAR)
                z = cp.lining_z(x, y)
                for a, b, c, d in cp.PANES:      # on a window's edge the lining lies in the window's own (flat) patch
                    if a - 1e-6 <= x <= b + 1e-6 and c - 1e-6 <= t <= d + 1e-6:
                        u, v = (x - a) / (b - a), (t - c) / (d - c)
                        zs = [cp.lining_z(px, cp.chord_y(px, pt)) for px, pt in ((a, c), (b, c), (b, d), (a, d))]
                        z = zs[0] * (1 - u) * (1 - v) + zs[1] * u * (1 - v) + zs[2] * u * v + zs[3] * (1 - u) * v
                points[(i, j)] = (side * x, y, z)
        front, back = [], []
        for i in range(len(xs) - 1):
            for j in range(len(ts) - 1):
                if any(xs[i] >= a - 1e-6 and xs[i + 1] <= b + 1e-6 and ts[j] >= c - 1e-6 and ts[j + 1] <= d + 1e-6 for a, b, c, d in cp.PANES):
                    continue
                if points[(i, j)][1] <= REAR + 1e-6 and points[(i + 1, j)][1] <= REAR + 1e-6:
                    continue
                (front if points[(i, j + 1)][1] > EY - 0.5 and ts[j] >= 0.085 - 1e-6 else back).append((i, j))
        welded(kit.geo('cockpit_shell', MID), M['lining'], points, front, flip=side < 0)
        welded(kit.geo('cockpit_shell', LOW), M['lining'], points, back, flip=side < 0)
        # Formers: ribs across the roof behind the windows.
        for y in (EY - 0.95, EY - 0.42):
            path = [(side * x, y, cp.lining_z(x, y) - 0.001) for x in (0.0, 0.3, 0.6, 0.9, 1.2, 1.5, WALL_X)]
            kit.geo('cockpit_shell', LOW).put(cp.strap(path, 0.07, 0.03, (0, 0, -1)), M['frame_paint'])


def build_windows(kit, M):
    """The four openings: a bolted frame round each (the wide members meet as the centre post, the two
    side posts and the top bow), a sealant bead against the glass, and the glass itself."""
    widths_of = ([0.05, 0.07, 0.11, 0.14], [0.07, 0.08, 0.09, 0.07])   # sill, outer post, bow, inner post
    glass = Geo()
    posts = {}
    for index in (0, 1):
        for side in (1, -1):
            corners = cp.pane_corners(index, side)
            widths = list(widths_of[index])
            centre = sum(corners, Vector((0, 0, 0))) / 4.0
            normal = Vector((0, 0, 0))
            for i in range(4):
                normal += corners[i].cross(corners[(i + 1) % 4])
            normal.normalize()
            if normal.z > 0:
                normal = -normal
            ex = (corners[1] - corners[0])
            ex = (ex - normal * ex.dot(normal)).normalized()
            ey = normal.cross(ex)
            place = frame(centre, ex, ey)
            flat = [((c - centre).dot(ex), (c - centre).dot(ey)) for c in corners]
            area = sum(flat[i][0] * flat[(i + 1) % 4][1] - flat[(i + 1) % 4][0] * flat[i][1] for i in range(4))
            if area < 0:
                flat = [flat[3], flat[2], flat[1], flat[0]]
                widths = [widths[2], widths[1], widths[0], widths[3]]
            density = HI if index == 0 else MID
            geo = kit.geo('cockpit_shell', density)
            depth = 0.045
            geo.put(cp.sweep(flat, [(1, 0, -0.02), (1, 0, depth - 0.008), (1, -0.008, depth), (0, 0.013, depth), (0, 0.004, depth - 0.008),
                                    (0, 0.002, 0.011)], cap=False, widths=widths), M['frame_paint'], place)
            geo.put(cp.sweep(flat, [(0, 0.002, 0.011), (0, -0.005, 0.0115), (0, -0.011, 0.007), (0, -0.015, 0.0)], cap=False, widths=widths), M['sealant'], place)
            for row, share in ((0, None), (1, 0.78)):
                for edge in range(4):
                    w = widths[edge]
                    if row == 1 and w < 0.1:
                        continue
                    d = 0.034 if share is None else w * share
                    line = cp.inset(flat, [-d] * 4)
                    a, b = Vector(line[edge]), Vector(line[(edge + 1) % 4])
                    count = max(2, int((b - a).length / 0.068))
                    for k in range(count):
                        p = a + (b - a) * ((k + 0.5) / count)
                        kit.place('bolt', place @ T(p.x, p.y, depth) @ R('Z', (k * 37 + edge * 11) % 60))
            glass.put(([(p[0], p[1], 0.0) for p in flat], [(0, 1, 2, 3)]), M['canopy_glass'], place)
            posts[(index, side)] = (place, flat)
    obj = glass.object('canopy_glass')
    layer = obj.data.uv_layers.new(name='UVMap')
    for poly in obj.data.polygons:
        for k, loop in enumerate(poly.loop_indices):
            layer.data[loop].uv = ((0, 0), (1, 0), (1, 1), (0, 1))[k % 4]
    # A standby compass hanging from the centre post, and a grab handle on the bow over each seat.
    y = cp.chord_y(0.0, 0.15) - 0.02
    z = cp.lining_z(0.14, cp.chord_y(0.14, 0.15)) - 0.05
    box = kit.geo('cockpit_shell', HI)
    box.put(cp.block(0.07, 0.06, 0.055, 0.006), M['bezel'], T(0, y + 0.05, z - 0.07))
    box.put(cp.block(0.02, 0.02, 0.03, 0.003), M['frame_paint'], T(0, y + 0.05, z - 0.02))
    box.put(cp.sweep(cp.circle(0.024, 16), [(0, 0), (0, 0.003), (0.003, 0.004), (0.006, 0.002)], cap=False), M['metal'], T(0, y + 0.02, z - 0.043) @ R('X', 90))
    box.put(cp.disc(0.019, 16, 0.001), M['gauge_face'], T(0, y + 0.02, z - 0.043) @ R('X', 90))
    label(kit, M, T(0, y + 0.0185, z - 0.043) @ R('X', 90), 'N  03  06', 0.007, 0.0, 0.0)
    for side in (1, -1):
        yb = cp.chord_y(0.6, 0.15) - 0.075
        zb = cp.lining_z(0.6, yb) - 0.05
        path = [(side * 0.47, yb, zb), (side * 0.48, yb, zb - 0.035), (side * 0.62, yb - 0.01, zb - 0.045), (side * 0.72, yb - 0.02, zb - 0.01)]
        kit.geo('cockpit_shell', HI).put(cp.tube(path, 0.008, 8), M['metal'])
    return obj


# --- dash: glare shield, panel, displays, HUD -----------------------------------------------------------------
def build_glare(kit, M):
    geo = kit.geo('cockpit_shell', HI)
    zt = LIP_Z
    half = 1.22
    arc = [(LIP_Y + 0.015 + 0.011 * math.cos(math.radians(a)) * 1.35, zt - 0.011 + 0.011 * math.sin(math.radians(a))) for a in range(90, 271, 30)]
    outline = [(LIP_Y + 0.13, zt - 0.022), (LIP_Y + 0.13, zt)] + arc
    shape, place = extrude_x(outline, -half, half, 0.002)
    geo.put(shape, M['glare'], place)
    geo.put(cp.tube([(-half, LIP_Y + 0.07, zt + 0.0005), (half, LIP_Y + 0.07, zt + 0.0005)], 0.0032, 6, side=(0, 0, 1)), M['glare'])
    stitches = kit.legends()
    count = int(2 * half / 0.013)
    for row_y in (LIP_Y + 0.04, LIP_Y + 0.057):
        for i in range(count):
            x = -half + 0.01 + i * 0.013
            stitches.put(([(x - 0.0045, row_y - 0.001, zt + 0.0006), (x + 0.0045, row_y - 0.001, zt + 0.0006), (x + 0.0045, row_y + 0.001, zt + 0.0006),
                           (x - 0.0045, row_y + 0.001, zt + 0.0006)], [(0, 1, 2, 3)]), M['stitch'])
    columns, rows = 20, 5
    points = {}
    for i in range(columns + 1):
        x = -half + 2 * half * i / columns
        u = abs(x)
        front = cp.chord_y(min(u, 1.09), 0.095) + 0.012 - max(u - 1.09, 0.0) * 2.4
        front = max(front, LIP_Y + 0.16)
        zf = cp.lining_z(u, front) - 0.014
        for j in range(rows + 1):
            s = j / rows
            points[(i, j)] = (x, LIP_Y + 0.13 + s * (front - LIP_Y - 0.13), zt + s * (zf - zt) + 0.006 * math.sin(math.pi * s))
    welded(geo, M['glare'], points, [(i, j) for i in range(columns) for j in range(rows)])
    # Defog outlets along the windscreen's foot.
    for x in (-0.9, -0.2, 0.2, 0.9):
        y = cp.chord_y(abs(x), 0.095) - 0.14
        z = points[(0, 0)][2] + (cp.lining_z(abs(x), y + 0.14) - 0.014 - zt) * (y - LIP_Y - 0.13) / (cp.chord_y(abs(x), 0.095) - LIP_Y - 0.118)
        geo.put(cp.pad(0.16, 0.035, 0.006, 0.002), M['bezel'], T(x, y, z) @ R('Z', -math.copysign(35.8, x)))
        for k in range(5):
            geo.put(cp.pad(0.022, 0.024, 0.0015, 0.0004, (k - 2) * 0.029, 0.0), M['slot_dark'], T(x, y, z + 0.006) @ R('Z', -math.copysign(35.8, x)))


def build_panel(kit, M):
    geo = kit.geo('cockpit_shell', HI)
    geo.put(cp.sweep(cp.rect(2.24, PANEL_L, 0, PANEL_L / 2), [(0, -0.03), (0, -0.0015), (0.0015, 0)]), M['int_grey'], PANEL)
    for side in (-1, 1):
        kit.geo('cockpit_shell', MID).put(cp.sweep(cp.rect(0.74, PANEL_L, side * 1.49, PANEL_L / 2), [(0, -0.03), (0, -0.0015), (0.0015, 0)]), M['int_grey'], PANEL)
        subpanel(kit, M, PANEL, side * 1.27, 0.33, 0.26, 0.36, 'FUSIBLES', MID)
        for i in range(4):
            for j in range(5):
                kit.place('breaker', PANEL @ T(side * 1.27 + (i - 1.5) * 0.05, 0.2 + j * 0.055, 0.002))
    b = cp.BEZEL
    faces = []
    for name, u in DISPLAYS:
        kit.place('bezel', PANEL @ T(u, DISPLAY_V, 0.0))
        w, h, z = b['w'] / 2 + 0.001, b['h'] / 2 + 0.001, b['rise'] - b['sink']
        quad = mk.quad(name, [tuple(PANEL @ Vector(p)) for p in ((u - w, DISPLAY_V - h, z), (u + w, DISPLAY_V - h, z), (u + w, DISPLAY_V + h, z), (u - w, DISPLAY_V + h, z))])
        mk.assign(quad, M['screen_live'])
        faces.append(quad)
    # Annunciator strips over each pair of displays.
    pattern = ['red', 'amber', 'off', 'off', 'green', 'off', 'amber', 'off', 'off', 'green']
    words = {0: ('ALARMA', 'legend_dark'), 1: ('PRECAUC', 'legend_dark'), 4: ('AP', 'legend_dark'), 6: ('FIRMA', 'legend_dark'), 9: ('TREN', 'legend_dark')}
    for side in (-1, 1):
        for i in range(10):
            u = side * (0.59 + (i - 4.5) * 0.066)
            k = i if side < 0 else 9 - i
            kit.place('tile_' + pattern[k], PANEL @ T(u, 0.513, 0.0))
            if k in words:
                label(kit, M, PANEL, words[k][0], u, 0.513, 0.0075, 0.0046, words[k][1])
    # Centre column: the caution-light panel over the three standby instruments.
    subpanel(kit, M, PANEL, 0.0, 0.47, 0.37, 0.125)
    lights = ['amber', 'amber', 'off', 'red', 'off', 'off', 'amber', 'off', 'off', 'amber', 'green', 'off', 'amber', 'off', 'off', 'red', 'off', 'amber', 'off', 'green']
    names = {0: 'HID 1', 1: 'GEN 2', 3: 'FUEGO', 6: 'COMB BAJO', 9: 'PURGA', 10: 'FIRMA OK', 12: 'CABINA', 15: 'ACEITE', 17: 'DESHIELO', 19: 'ENLACE'}
    for k, kind in enumerate(lights):
        u, v = (k % 5 - 2) * 0.068, 0.513 - (k // 5) * 0.026
        kit.place('tile_' + kind, PANEL @ T(u, v, 0.002))
        if k in names:
            label(kit, M, PANEL, names[k], u, v, 0.0062, 0.0066, 'legend_dark')
    subpanel(kit, M, PANEL, 0.0, 0.325, 0.37, 0.13)
    kit.place('horizon', PANEL @ T(0.0, 0.325, 0.002))
    kit.place('dial', PANEL @ T(-0.118, 0.325, 0.002))
    kit.place('dial', PANEL @ T(0.118, 0.325, 0.002) @ R('Z', 150))
    label(kit, M, PANEL, 'VEL', -0.118, 0.272, 0.006)
    label(kit, M, PANEL, 'ALT', 0.118, 0.272, 0.006)
    # Left outboard: the gear lever with its wheel knob, three greens and the parking brake.
    gu = -1.03
    subpanel(kit, M, PANEL, gu, 0.36, 0.16, 0.3, 'TREN')
    geo.put(cp.pad(0.014, 0.12, 0.001, 0.0003, gu - 0.02, 0.33), M['slot_dark'], PANEL @ T(0, 0, 0.002))
    lever = PANEL @ T(gu - 0.02, 0.3, 0.002)
    geo.put(cp.tube([(0, 0, 0), (0, 0.004, 0.035), (0, 0.012, 0.07)], 0.006, 8, side=(1, 0, 0)), M['metal'], lever)
    geo.put(cp.sweep(cp.circle(0.027, 18), [(0.005, -0.011), (0, -0.007), (0, 0.007), (0.005, 0.011)], cap=True, bottom=True), M['knob'], lever @ T(0, 0.014, 0.08) @ R('Y', 90))
    geo.put(cp.sweep(cp.circle(0.011, 10), [(0.002, -0.0125), (0, -0.0115), (0, 0.0115), (0.002, 0.0125)], cap=True, bottom=True), M['metal'], lever @ T(0, 0.014, 0.08) @ R('Y', 90))
    for i in range(3):
        kit.place('lamp_green', PANEL @ T(gu + (i - 1) * 0.042, 0.455, 0.002))
    label(kit, M, PANEL, 'ARRIBA', gu + 0.04, 0.395, 0.006)
    label(kit, M, PANEL, 'ABAJO', gu + 0.04, 0.275, 0.006)
    geo.put(cp.tube([(0, 0, 0), (0, 0, 0.03)], 0.006, 8), M['metal'], PANEL @ T(gu + 0.04, 0.235, 0.002))
    geo.put(cp.tube([(-0.02, 0, 0.033), (0.02, 0, 0.033)], 0.009, 8), M['handle_yellow'], PANEL @ T(gu + 0.04, 0.235, 0.002))
    # Right outboard: cabin gauges.
    subpanel(kit, M, PANEL, -gu, 0.36, 0.16, 0.3, 'CABINA')
    kit.place('dial', PANEL @ T(-gu, 0.41, 0.002) @ R('Z', 60))
    kit.place('dial', PANEL @ T(-gu, 0.3, 0.002) @ R('Z', 240))
    # The strip under the displays: four switch panels.
    for u, title, names, kind in ((-0.86, 'LUCES', ['NAV', 'POS', 'ATERR', 'RODAJE', 'FORM', 'CABINA'], 'toggle'),
                                  (-0.43, 'COMBUSTIBLE', ['IMPUL 1', 'IMPUL 2', 'TRANSF', 'CRUCE'], 'toggle'),
                                  (0.43, 'HIDRAULICA', ['SIST A', 'SIST B', 'AUX', 'ACUM'], 'toggle'),
                                  (0.86, 'ELECTRICA', ['BAT', 'GEN 1', 'GEN 2', 'APU', 'EXT', 'BARRA'], 'toggle')):
        w = 0.42 if abs(u) > 0.5 else 0.36
        subpanel(kit, M, PANEL, u, 0.108, w, 0.185, title)
        pitch = 0.058 if len(names) == 6 else 0.07
        switch_row(kit, M, PANEL, u - (len(names) - 1) * pitch / 2, 0.118, names, pitch, kind)
        switch_row(kit, M, PANEL, u - 0.1, 0.045, ['', '', ''], 0.1, 'knob')
    kit.place('toggle_plain', PANEL @ T(-0.3, 0.118, 0.002))
    kit.place('cover', PANEL @ T(-0.3, 0.118, 0.002))
    return faces


def build_hud(kit, M):
    """The projector box on the dash, its two arms and the framed combiner glass in front of the left eye."""
    geo = kit.geo('cockpit_shell', HI)
    yc, zc = EY + 0.8, EZ - 0.012
    tilt = 20.0
    c, s = math.cos(math.radians(tilt)), math.sin(math.radians(tilt))
    place = frame((EX, yc, zc), (1, 0, 0), (0, -s, c))
    w, h = 0.17, 0.14
    glass = mk.quad('hud_combiner', [tuple(place @ Vector(p)) for p in ((-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0))])
    mk.assign(glass, M['hud_glass'])
    geo.put(cp.sweep(cp.rect(w + 0.012, h + 0.012), [(0, -0.004), (0, 0.004), (0.006, 0.004)], cap=False), M['bezel'], place)
    geo.put(cp.sweep(cp.rect(w + 0.012, h + 0.012), [(0.006, -0.004), (0, -0.004)], cap=False), M['bezel'], place)
    top = LIP_Z + 0.004
    geo.put(cp.block(0.19, 0.13, 0.05, 0.008), M['bezel'], T(EX, LIP_Y + 0.115, top - 0.006))
    geo.put(cp.sweep(cp.circle(0.045, 20), [(0, 0), (0, 0.004), (0.004, 0.006), (0.008, 0.003)], cap=False), M['metal'], T(EX, LIP_Y + 0.12, top + 0.044))
    geo.put(cp.disc(0.037, 20, 0.003), M['lcd'], T(EX, LIP_Y + 0.12, top + 0.044))
    for sx in (-1, 1):
        foot = Vector((EX + sx * 0.089, LIP_Y + 0.15, top + 0.03))
        low = place @ Vector((sx * (w / 2 + 0.006), -h / 2, 0))
        mid = place @ Vector((sx * (w / 2 + 0.006), -h / 2 + 0.05, 0))
        geo.put(cp.strap([foot, low, mid], 0.012, 0.005, (sx, 0, 0)), M['bezel'])
        kit.place('screw', T(*foot) @ R('Y', sx * 90) @ T(0, 0, 0.0055))
    for i, name in enumerate(('BRILLO', 'MODO')):
        kit.place('knob_small', T(EX - 0.05 + i * 0.1, LIP_Y + 0.05, top + 0.02) @ R('X', 90))
    # The approach indexer: a three-lamp box left of the combiner.
    face = T(EX - 0.155, LIP_Y + 0.15, top - 0.004) @ R('X', 90)       # local Y up, Z towards the pilot
    geo.put(cp.block(0.036, 0.085, 0.03, 0.004), M['bezel'], face @ T(0, 0.0425, -0.03))
    for k, kind in enumerate(('green', 'amber', 'red')):
        geo.put(cp.pad(0.022, 0.016, 0.002, 0.0006, 0.0, 0.066 - k * 0.022), M[kind], face)
    # Two mirrors under the top bow of the pilot's window.
    for x in (-0.34, 0.34):
        yb = cp.chord_y(abs(x), 0.15)
        zb = cp.lining_z(0.14, cp.chord_y(0.14, 0.15)) + (cp.lining_z(1.02, cp.chord_y(1.02, 0.15)) - cp.lining_z(0.14, cp.chord_y(0.14, 0.15))) * (abs(x) - 0.14) / 0.88
        centre = Vector((x, yb - 0.035, zb - 0.085))
        to_eye = (Vector((math.copysign(EX, x) if x > 0 else EX, EY, EZ)) - centre).normalized()
        mirror = frame(centre, Vector((0, 0, 1)).cross(to_eye), (0, 0, 1))
        geo.put(cp.sweep(cp.rect(0.13, 0.052), [(0.004, -0.012), (0, -0.008), (0, 0.0), (0.003, 0.003), (0.008, 0.003), (0.01, 0.0005)], cap=False, bottom=True), M['bezel'], mirror)
        geo.put(cp.sweep(cp.rect(0.11, 0.032), [(0, 0.0005)]), M['mirror'], mirror)
        geo.put(cp.tube([centre - to_eye * 0.01, centre - to_eye * 0.012 + Vector((0, 0.03, 0.035)), centre + Vector((0, 0.04, 0.045))], 0.006, 6), M['metal'])
    return glass


# --- pedestal, throttles, stick, pedals -----------------------------------------------------------------------
def build_pedestal(kit, M):
    half = 0.2
    top = [(EY + 0.69, EZ - 0.455), (EY + 0.4, EZ - 0.5), (EY - 0.3, EZ - 0.62), (EY - 0.36, EZ - 0.68)]
    outline = [(EY - 0.36, FLOOR), (EY + 0.69, FLOOR)] + top
    shape, place = extrude_x(outline, -half, half, 0.006)
    kit.geo('cockpit_shell', PED).put(shape, M['int_grey'], place)
    ramp = frame((0.0, EY + 0.4, EZ - 0.5), (1, 0, 0), (0.0, 0.29, 0.045))
    flat = frame((0.0, EY - 0.3, EZ - 0.62), (1, 0, 0), (0.0, 0.7, 0.12))
    geo = kit.geo('cockpit_shell', HI)
    # Throttle quadrant on the ramp, on the pilot's side of the pedestal.
    qx = HINGE[0]
    subpanel(kit, M, ramp, qx, 0.15, 0.19, 0.27)
    for x in (-0.051, -0.017, 0.017, 0.051):
        geo.put(cp.pad(0.011, 0.19, 0.0008, 0.0002, qx + x, 0.17), M['slot_dark'], ramp @ T(0, 0, 0.002))
    for sx in (-1, 1):
        cheek = [(0.04, 0.0), (0.27, 0.0), (0.27, 0.02)] + [(0.155 + 0.11 * math.cos(math.radians(a)), 0.02 + 0.045 * math.sin(math.radians(a))) for a in range(20, 161, 20)] + [(0.04, 0.02)]
        geo.put(cp.sweep(cheek, [(0.001, 0), (0, 0.001), (0, 0.005), (0.001, 0.006)], cap=True, bottom=True), M['plate_grey'],
                ramp @ T(qx + sx * 0.082 - 0.003, 0, 0.002) @ frame((0, 0, 0), (0, 1, 0), (0, 0, 1)))
    label(kit, M, ramp, 'RALENTI', qx - 0.0, 0.035, 0.0065)
    label(kit, M, ramp, 'MAX', qx, 0.272, 0.0065)
    for i, x in enumerate((-0.051, -0.017, 0.017, 0.051)):
        place = T(HINGE[0] + x, HINGE[1], HINGE[2]) @ R('X', IDLE_LEAN)
        kit.place('lever', place, 'throttles')
        kit.legends('throttles').text(str(i + 1), 0.012, M['legend'], place @ T(0, 0, LEVER + 0.0142))
    # Flap lever and trim wheel on the co-pilot's side of the ramp.
    subpanel(kit, M, ramp, 0.105, 0.15, 0.16, 0.27, 'FLAPS')
    geo.put(cp.pad(0.012, 0.15, 0.0008, 0.0002, 0.08, 0.14), M['slot_dark'], ramp @ T(0, 0, 0.002))
    kit.place('lever', ramp @ T(0.08, 0.16, -0.01) @ R('X', -12) @ S(1, 1, 0.55))
    for k, word in enumerate(('0', '15', '30')):
        label(kit, M, ramp, word, 0.125, 0.09 + k * 0.06, 0.007)
    geo.put(cp.sweep(cp.circle(0.05, 20), [(0.004, -0.008), (0, -0.004), (0, 0.004), (0.004, 0.008)], cap=True, bottom=True), M['knob'],
            ramp @ T(0.185, 0.14, -0.012) @ R('Y', 90))
    # The flat run between the seats: radio, keypad, trim and engine-start panels.
    subpanel(kit, M, flat, 0.0, 0.63, 0.36, 0.13, 'RADIO 1')
    geo.put(cp.pad(0.13, 0.032, 0.001, 0.0003, -0.09, 0.62), M['lcd'], flat @ T(0, 0, 0.002))
    label(kit, M, flat, '127.450', -0.09, 0.62, 0.014, 0.0034, 'legend_amber')
    switch_row(kit, M, flat, 0.05, 0.625, ['', ''], 0.075, 'knob')
    subpanel(kit, M, flat, 0.0, 0.475, 0.36, 0.16, 'DATOS')
    geo.put(cp.pad(0.15, 0.03, 0.001, 0.0003, -0.085, 0.505), M['lcd'], flat @ T(0, 0, 0.002))
    label(kit, M, flat, 'RUTA 04 SUR', -0.085, 0.505, 0.0095, 0.0034, 'legend_green')
    for i in range(6):
        for j in range(3):
            kit.place('key', flat @ T(-0.15 + i * 0.024, 0.415 + j * 0.02, 0.002))
    for i in range(3):
        for j in range(4):
            kit.place('key', flat @ T(0.07 + i * 0.024, 0.415 + j * 0.02, 0.002))
    subpanel(kit, M, flat, 0.0, 0.3, 0.36, 0.16, 'COMPENSADOR')
    kit.place('knob_big', flat @ T(-0.09, 0.285, 0.002) @ R('Z', 25))
    geo.put(cp.pad(0.05, 0.03, 0.008, 0.003, 0.03, 0.29), M['button'], flat @ T(0, 0, 0.002))
    switch_row(kit, M, flat, 0.1, 0.295, ['CABEC', 'GUIN'], 0.05)
    subpanel(kit, M, flat, 0.0, 0.125, 0.36, 0.16, 'ARRANQUE')
    switch_row(kit, M, flat, -0.12, 0.125, ['1', '2', '3', '4'], 0.08, 'cover')


def build_stick(kit, M):
    geo = kit.geo('stick', HI)
    place = T(*STICK_PIVOT)
    column = [(0, 0, -0.02), (0, 0, 0.14), (0, 0, 0.3), (0, -0.012, 0.36), (0, -0.03, 0.4), (0, -0.03, 0.44)]
    geo.put(cp.tube(column, 0.014, 10, side=(1, 0, 0)), M['metal'], place)
    boot = []
    for k in range(8):
        r = 0.06 - k * 0.005 + (0.007 if k % 2 else 0.0)
        boot.append([(r * math.cos(2 * math.pi * i / 14), r * math.sin(2 * math.pi * i / 14), -0.02 + k * 0.013) for i in range(14)])
    geo.put(cp.loft(boot), M['rubber'], place)
    rings = []
    for z, rx, ry, dy in ((0.425, 0.027, 0.027, 0), (0.438, 0.026, 0.026, 0), (0.45, 0.0195, 0.0215, 0), (0.5, 0.0205, 0.0225, 0), (0.55, 0.0195, 0.0215, 0),
                          (0.585, 0.0205, 0.023, 0.002), (0.602, 0.025, 0.028, 0.005), (0.635, 0.024, 0.031, 0.008), (0.648, 0.017, 0.024, 0.009)):
        rings.append([(rx * math.cos(2 * math.pi * i / 16), -0.03 + dy + ry * math.sin(2 * math.pi * i / 16), z) for i in range(16)])
    geo.put(cp.loft(rings), M['grip'], place)
    head = place @ T(0, -0.021, 0.648)
    geo.put(cp.sweep(cp.circle(0.007, 10), [(0, 0), (0, 0.004), (0.002, 0.008), (0.0045, 0.01)]), M['knob'], head @ T(0.004, -0.004, 0) @ R('X', -10))
    geo.put(cp.sweep(cp.circle(0.0045, 8), [(0, 0), (0, 0.003), (0.001, 0.004)]), M['guard_red'], head @ T(-0.009, 0.009, -0.001))
    geo.put(cp.sweep(cp.circle(0.004, 8), [(0, 0), (0, 0.002), (0.001, 0.003)]), M['metal'], head @ T(0.011, 0.01, -0.002))
    geo.put(cp.block(0.012, 0.01, 0.034, 0.003), M['guard_red'], place @ T(0, -0.03 + 0.027, 0.575) @ R('X', -12))
    # The box the stick stands on, between the pilot's feet.
    kit.geo('cockpit_shell', MID).put(cp.block(0.17, 0.22, STICK_PIVOT[2] - FLOOR - 0.02, 0.012), M['int_grey'], T(STICK_PIVOT[0], STICK_PIVOT[1], FLOOR))
    kit.geo('cockpit_shell', MID).put(cp.sweep(cp.circle(0.072, 16), [(0, 0), (0, 0.004), (0.004, 0.006), (0.014, 0.006)], cap=False), M['metal'],
                                      T(STICK_PIVOT[0], STICK_PIVOT[1], STICK_PIVOT[2] - 0.02))
    # The right seat's stick, still, part of the shell.
    twin = T(-2 * EX, 0, 0) @ place
    shell = kit.geo('cockpit_shell', MID)
    shell.put(cp.tube(column, 0.014, 10, side=(1, 0, 0)), M['metal'], twin)
    shell.put(cp.loft(boot), M['rubber'], twin)
    shell.put(cp.loft(rings), M['grip'], twin)
    shell.put(cp.block(0.17, 0.22, STICK_PIVOT[2] - FLOOR - 0.02, 0.012), M['int_grey'], T(-STICK_PIVOT[0], STICK_PIVOT[1], FLOOR))


def build_hands(kit, M):
    info = {}
    # Right hand over the four throttle knobs.
    lean = math.radians(IDLE_LEAN)
    bar = Vector((HINGE[0], HINGE[1] - LEVER * math.sin(lean), HINGE[2] + LEVER * math.cos(lean)))
    pitch = math.radians(-12.0)                  # the knuckles a little higher than the wrist
    x_l, y_l = Vector((1, 0, 0)), Vector((0, math.cos(pitch), -math.sin(pitch)))
    z_l = x_l.cross(y_l)
    grip = (0.086, -0.016 - 0.0155, 0.0155)
    wrist = bar - y_l * grip[0] - z_l * grip[1]
    hand, info['throttle'] = cp.hand_geo(M, grip, [(-0.55, 0.7, -0.45), (-0.25, 0.85, -0.46), (0.0, 0.9, -0.43)], relax=(0.001, 0.0, 0.001, 0.002),
                                         limit=(104.0, 118.0, 124.0, 130.0), spread_scale=2.2)
    kit.geo('hand_throttle', HAND).merge(hand, frame(wrist, x_l, y_l))
    elbow = wrist + Vector((-0.2, -0.93, -0.3)).normalized() * 0.26
    glove, sleeve = cp.arm_geo(M, wrist, y_l, elbow, SHOULDER_R)
    kit.geo('hand_throttle', HAND).merge(glove)
    kit.geo('hand_throttle', SLEEVE).merge(sleeve)
    info['throttle_bar'] = [round(c, 3) for c in bar]
    # Left hand round the stick's grip: the same hand through a mirror, the thumb side up.
    centre = Vector(GRIP)
    x_l, y_l = Vector((0, 0, -1)), Vector((0.22, 0.975, 0.0)).normalized()
    z_l = y_l.cross(x_l)
    grip = (0.082, -0.016 - 0.0215, 0.0215)
    wrist = centre - y_l * grip[0] - z_l * grip[1]
    hand, info['stick'] = cp.hand_geo(M, grip, [(-0.35, 0.55, -0.75), (-0.65, 0.4, -0.6), (-0.8, 0.5, -0.3)], relax=(0.003, 0.0, 0.0, 0.001))
    kit.geo('hand_stick', HAND).merge(hand, frame(wrist, x_l, y_l) @ S(1, 1, -1))
    elbow = wrist + Vector((-0.2, -0.95, -0.12)).normalized() * 0.26
    glove, sleeve = cp.arm_geo(M, wrist, y_l, elbow, SHOULDER_L)
    kit.geo('hand_stick', HAND).merge(glove)
    kit.geo('hand_stick', SLEEVE).merge(sleeve)
    return info, tuple(bar)


# --- the rest of the cabin ------------------------------------------------------------------------------------------
def build_cabin(kit, M):
    front_y = EY + 1.18
    low, mid = kit.geo('cockpit_shell', LOW), kit.geo('cockpit_shell', MID)
    # Floor (worn plates with tread strips), footwell wall, rear bulkhead.
    split = EY + 0.2
    mid.put(([(-SIDE_IN, split, FLOOR), (SIDE_IN, split, FLOOR), (SIDE_IN, front_y, FLOOR), (-SIDE_IN, front_y, FLOOR)], [(0, 1, 2, 3)]), M['floor'])
    low.put(([(-SIDE_IN, REAR, FLOOR), (SIDE_IN, REAR, FLOOR), (SIDE_IN, split, FLOOR), (-SIDE_IN, split, FLOOR)], [(0, 1, 2, 3)]), M['floor'])
    for sx in (-1, 1):
        for k in range(4):
            mid.put(cp.pad(0.3, 0.035, 0.004, 0.0015, sx * 0.55, EY + 0.62 + k * 0.1), M['tread'], T(0, 0, FLOOR))
        low.put(cp.pad(0.5, 0.9, 0.004, 0.002, sx * 0.5, REAR + 0.6), M['plate_grey'], T(0, 0, FLOOR))
    mid.put(([(-SIDE_IN, front_y, FLOOR), (SIDE_IN, front_y, FLOOR), (SIDE_IN, front_y, EZ - 0.35), (-SIDE_IN, front_y, EZ - 0.35)], [(0, 1, 2, 3)]), M['wall'])
    xs = [-WALL_X + 2 * WALL_X * i / 12 for i in range(13)]
    points = {}
    for i, x in enumerate(xs):
        points[(i, 0)] = (x, REAR, FLOOR)
        points[(i, 1)] = (x, REAR, cp.lining_z(abs(x), REAR) + 0.01)
    welded(low, M['wall'], points, [(i, 0) for i in range(12)], flip=True)
    back = frame((0.0, REAR, FLOOR), (-1, 0, 0), (0, 0, 1))      # read from the cabin, looking aft
    low.put(cp.sweep(cp.rect(0.7, 1.3, 0, 0.72), [(0, 0), (0, 0.014), (0.012, 0.02), (0.05, 0.02), (0.06, 0.008)]), M['frame_paint'], back)
    low.put(cp.tube([(0.2, 0.7, 0.012), (0.2, 0.7, 0.05), (0.2, 0.86, 0.05), (0.2, 0.86, 0.012)], 0.011, 8), M['metal'], back)
    kit.legends().text('SALIDA', 0.06, M['legend'], back @ T(0, 1.45, 0.002))
    kit.legends().text('NO BLOQUEAR', 0.03, M['legend_amber'], back @ T(0, 0.2, 0.011))
    low.put(cp.tube([(0, 0, 0), (0, 0, 0.3)], 0.055, 12), M['extinguisher'], T(0.62, REAR + 0.08, FLOOR + 0.5))
    low.put(cp.tube([(0, 0, 0.3), (0, 0, 0.36)], [0.02, 0.014], 8), M['metal'], T(0.62, REAR + 0.08, FLOOR + 0.5))
    low.put(cp.block(0.14, 0.02, 0.04, 0.004), M['metal'], T(0.62, REAR + 0.02, FLOOR + 0.62))
    kit.legends().text('EXTINTOR', 0.035, M['legend_red'], back @ T(-0.62, 1.0, 0.002))
    for sx in (-1, 1):
        low.put(cp.block(0.06, 0.05, 1.2, 0.006), M['frame_paint'], T(sx * 0.95, REAR + 0.025, FLOOR))
    # Side consoles, the sloping side walls above them.
    for side in (-1, 1):
        x0, x1 = (SIDE_IN, SIDE_OUT) if side > 0 else (-SIDE_OUT, -SIDE_IN)
        outline = [(REAR, FLOOR), (front_y, FLOOR), (front_y, CONSOLE_TOP), (REAR, CONSOLE_TOP)]
        shape, place = extrude_x(outline, x0, x1, 0.008)
        mid.put(shape, M['int_grey'], place)
        ys = [REAR + (front_y - REAR) * j / 12 for j in range(13)]
        points = {}
        for j, y in enumerate(ys):
            points[(0, j)] = (side * (SIDE_OUT - 0.03), y, CONSOLE_TOP - 0.018)
            points[(1, j)] = (side * WALL_X, y, cp.lining_z(WALL_X, y) + 0.01)
        welded(kit.geo('cockpit_shell', MID), M['wall'], points, [(0, j) for j in range(12) if ys[j] > EY - 0.9], flip=side < 0)
        welded(low, M['wall'], points, [(0, j) for j in range(12) if ys[j] <= EY - 0.9], flip=side < 0)
        top = T(side * (SIDE_IN + SIDE_OUT) / 2, 0, CONSOLE_TOP)
        titles = ['OXIGENO', 'INTERFONO', 'ILUMINACION', 'FIRMA', 'NAVEGACION', 'PRUEBAS'] if side < 0 else ['CLIMA', 'RADIO 2', 'ENLACE', 'GRABADOR', 'SENSORES', 'ARRANQUE']
        for k, title in enumerate(titles):
            filler(kit, M, top, 0.0, EY + 0.62 - k * 0.235, 0.38, 0.22, title, 11 * k + (3 if side < 0 else 7), MID if k < 4 else LOW)
        # Stencils and a document pocket on the sloping wall.
        y = EY + 0.1
        a, b = Vector((side * SIDE_OUT, y, CONSOLE_TOP)), Vector((side * WALL_X, y, cp.lining_z(WALL_X, y) + 0.01))
        wall = frame(a + (b - a) * 0.5, (0, side * -1.0, 0), b - a)
        wall = wall @ T(0, 0, 0.0015)
        kit.legends().text('NO PISAR' if side < 0 else 'ASIDERO', 0.035, M['legend'], wall @ T(0.3 * side * -1, 0.0, 0.0))
        kit.legends().text('PRESION MAX 0.6', 0.018, M['legend_amber'], wall @ T(-0.35 * side * -1, -0.06, 0.0))
        mid.put(cp.sweep(cp.rect(0.34, 0.2), [(0, 0), (0, 0.02), (0.006, 0.026), (0.02, 0.026), (0.024, 0.006)]), M['seat_fabric'], wall @ T(-0.25 * side * -1, 0.05, 0))
    # Seats: the left one is the pilot's, the right one empty.
    kit.place('seat', T(EX, EY - 0.03, FLOOR))
    kit.place('seat', T(-EX, EY - 0.03, FLOOR))
    # Rudder pedals for both seats.
    for seat in (EX, -EX):
        for sx in (-0.15, 0.15):
            kit.place('pedal', T(seat + sx, EY + 0.98, FLOOR))
    # Overhead panel behind the top bow, between the seats.
    ya, yb = EY + 0.02, EY + 0.6
    a = Vector((0, ya, cp.lining_z(0, ya) - 0.055))
    b = Vector((0, yb, cp.lining_z(0, yb) - 0.055))
    over = frame(b, (1, 0, 0), a - b)
    length = (a - b).length
    mid.put(cp.sweep(cp.rect(0.6, length, 0, length / 2), [(0, -0.07), (0, -0.004), (0.004, 0)]), M['int_grey'], over)
    for k, title in enumerate(('MOTORES', 'FUEGO', 'PRESURIZACION')):
        filler(kit, M, over, -0.145, 0.1 + k * 0.185, 0.27, 0.17, title, 40 + k)
        filler(kit, M, over, 0.145, 0.1 + k * 0.185, 0.27, 0.17, ('APU', 'ANTIHIELO', 'LUCES EXT')[k], 50 + k)


def register_stamps(kit, M):
    kit.stamp('bezel', cp.bezel_geo(M), HI)
    kit.stamp('toggle', cp.toggle_geo(M, True, 1.0), HI)
    kit.stamp('toggle_dn', cp.toggle_geo(M, True, -1.0), HI)
    kit.stamp('toggle_plain', cp.toggle_geo(M, False, 1.0), HI)
    kit.stamp('cover', cp.cover_geo(M), HI)
    kit.stamp('knob', cp.knob_geo(M, 0.011), HI)
    kit.stamp('knob_small', cp.knob_geo(M, 0.008), HI)
    kit.stamp('knob_big', cp.knob_geo(M, 0.022), HI)
    kit.stamp('key', cp.key_geo(M), HI)
    for kind in ('amber', 'red', 'green'):
        kit.stamp('tile_' + kind, cp.tile_geo(M, kind), HI)
    kit.stamp('tile_off', cp.tile_geo(M, 'tile_off'), HI)
    kit.stamp('lamp_green', cp.tile_geo(M, 'green', 0.022, 0.015), HI)
    kit.stamp('screw', cp.screw_geo(M), HI)
    kit.stamp('bolt', cp.bolt_geo(M), HI)
    kit.stamp('horizon', cp.gauge_geo(M, 0.042, 'horizon'), HI)
    kit.stamp('dial', cp.gauge_geo(M, 0.034, 'dial', 40.0), HI)
    kit.stamp('lever', cp.lever_geo(M, LEVER), HI)
    kit.stamp('pedal', cp.pedal_geo(M), MID)
    kit.stamp('seat', cp.seat_geo(M), MID)
    breaker = Geo()
    breaker.put(cp.sweep(cp.circle(0.007, 10), [(0, 0), (0, 0.004), (0.002, 0.005)]), M['knob'])
    breaker.put(cp.sweep(cp.circle(0.0045, 8), [(0, 0.005), (0, 0.011), (0.001, 0.012)]), M['legend'])
    kit.stamp('breaker', breaker, MID)


# --- checks and the finish ---------------------------------------------------------------------------------------------
NODES = ['cockpit_shell', 'canopy_glass', 'display_map', 'display_radar', 'display_engines', 'display_cautions', 'hud_combiner',
         'throttles', 'hand_throttle', 'stick', 'hand_stick', 'eye', 'glow_panel', 'glow_console']
CHILDREN = {'hand_throttle': 'throttles', 'hand_stick': 'stick'}


def inspect(state):
    """The contract by numbers, from the scene as it stands."""
    scene_objects = list(bpy.context.scene.objects)
    names = {o.name for o in scene_objects}
    report = {'missing': [n for n in NODES if n not in names]}
    report['parents_ok'] = all(bpy.data.objects[c].parent is not None and bpy.data.objects[c].parent.name == p for c, p in CHILDREN.items() if c in names)
    report['pivots'] = {n: [round(c, 3) for c in bpy.data.objects[n].matrix_world.translation] for n in ('throttles', 'stick', 'hand_throttle', 'hand_stick')}
    shown = [o for o in scene_objects if o.type == 'MESH' and o.name in NODES]
    report['triangles'] = {o.name: mk.triangle_count(o) for o in shown}
    report['triangles_total'] = sum(report['triangles'].values())
    sight = cp.Sight(shown)
    displays = {}
    for name, _ in DISPLAYS:
        obj = bpy.data.objects[name]
        centre = sum((obj.matrix_world @ v.co for v in obj.data.vertices), Vector((0, 0, 0))) / len(obj.data.vertices)
        node, _, distance = sight.first(EYE, centre)
        size = [round((obj.data.vertices[1].co - obj.data.vertices[0].co).length, 3), round((obj.data.vertices[3].co - obj.data.vertices[0].co).length, 3)]
        displays[name] = {'uv': cp.uv_range(obj), 'seen_from_eye': node == name, 'first_hit': node, 'size': size,
                          'sunk': cp.BEZEL['sink'], 'centre': [round(c, 3) for c in centre]}
    report['displays'] = displays
    report['hud_uv'] = cp.uv_range(bpy.data.objects['hud_combiner'])
    tan_v = math.tan(math.radians(FOV) / 2)
    report['lip_height_share'] = {'gaze_0': round(0.5 + ((LIP_Z - EZ) / (LIP_Y - EY)) / (2 * tan_v), 3),
                                  'gaze_rest': round(0.5 + math.tan(math.atan2(LIP_Z - EZ, LIP_Y - EY) - math.radians(GAZE)) / (2 * tan_v), 3)}
    lines, share, sky = sight.picture(EYE, FOV)
    report['view_straight'] = {'sky_share': sky, 'seen': {k: v for k, v in share.items() if k in ('hand_throttle', 'hand_stick', 'hud_combiner', 'throttles', 'stick') or k.startswith('display')}}
    lines2, share2, sky2 = sight.picture(EYE, FOV, pitch=GAZE)
    report['view_rest'] = {'sky_share': sky2, 'seen': {k: v for k, v in share2.items() if k in ('hand_throttle', 'hand_stick', 'hud_combiner') or k.startswith('display')}}
    report['backfaces'] = {'eye': sight.backfaces(EYE), 'right_seat': sight.backfaces((-EX, EY, EZ)), 'low': sight.backfaces((EX + 0.2, EY + 0.1, EZ - 0.25))}
    os.makedirs(SCRATCH, exist_ok=True)
    with open(os.path.join(SCRATCH, 'view.txt'), 'w') as handle:
        handle.write('\n'.join(lines) + '\n\n' + '\n'.join(lines2) + '\n')
        for title, yaw, pitch in (('right 75', 75, -8), ('left 80', -80, -5), ('down 40', 0, -40), ('back right 100 down 30', 100, -30)):
            handle.write('\n%s\n' % title + '\n'.join(sight.picture(EYE, FOV, pitch=pitch, yaw=yaw)[0]) + '\n')
    report['hands'] = state.get('hands')
    return report


def pictures(state, suffix):
    wanted = [v for v in os.environ.get('MANTA_COCKPIT_VIEWS', '').split(',') if v]
    glow = ((state['glow_panel'], (0.75, 0.9, 1.0), 2.5), (state['glow_console'], (1.0, 0.9, 0.75), 1.2))
    eye = Vector(EYE)
    views = {
        'eye': (eye, eye + Vector((0, 1, 0)), FOV),
        'rest': (eye, eye + Vector((0, math.cos(math.radians(GAZE)), math.sin(math.radians(GAZE)))), FOV),
        'right': (eye, eye + Vector((1, 0.45, -0.3)), FOV),
        'down': (eye, eye + Vector((0.25, 1, -0.75)), FOV),
        'quarter': (Vector((0.95, EY - 1.3, EZ + 0.22)), Vector((-0.3, EY + 0.6, EZ - 0.45)), 78.0),
        'hands': (Vector((-0.32, EY + 0.12, EZ - 0.05)), Vector((-0.33, EY + 0.6, EZ - 0.36)), 50.0),
        'stickhand': (Vector((-0.5, EY + 0.26, EZ - 0.1)), Vector(GRIP), 34.0),
        'stickhand2': (Vector((-0.3, EY + 0.63, EZ - 0.17)), Vector(GRIP) + Vector((0, 0, -0.01)), 40.0),
        'throttlehand': (Vector((-0.34, EY + 0.24, EZ - 0.06)), Vector(state['bar']), 34.0),
        'throttlehand2': (Vector((-0.34, EY + 0.635, EZ - 0.19)), Vector(state['bar']) + Vector((0, -0.02, 0)), 42.0),
    }
    out = []
    names = [v for v in os.environ.get('MANTA_COCKPIT_SHEET', '').split(',') if v]
    sight = cp.Sight([o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name in NODES and not o.name.startswith('hud')])
    for name in wanted + names:       # a camera outside the cabin or behind a part is not worth a render
        location, target, fov = views[name]
        reach = sight.first(location, target)[2]
        if location.z > cp.lining_z(location.x, location.y) - 0.03:
            out.append('%s: skipped, the camera is outside the cabin' % name)
        elif name not in ('eye', 'rest', 'right', 'down') and (reach is None or reach < 0.75 * (target - location).length):
            out.append('%s: skipped, something stands %.2f m in front of the camera' % (name, reach or -1))
        else:
            continue
        wanted, names = [v for v in wanted if v != name], [v for v in names if v != name]
    if os.environ.get('MANTA_COCKPIT_DRY'):
        return out
    for name in wanted:
        location, target, fov = views[name]
        out.append(cp.render_view(os.path.join(SCRATCH, '%s_%s.jpg' % (name, suffix)), location, target, fov, glow=glow))
    sheet = [views[v] for v in names]
    if sheet:
        out.append(cp.render_sheet(os.path.join(SCRATCH, 'sheet_%s.jpg' % suffix), sheet, glow=glow))
    return out


def finish(state, out_path, work_dir):
    started = time.time()
    kit = state['kit']
    nodes = cp.realise(kit, state['pivots'], CHILDREN, bake=(ASSET['atlas'], work_dir))
    report = {'id': ASSET['id'], 'bake_seconds': round(time.time() - started, 1)}
    report.update(inspect(state))
    objects = list(nodes.values()) + state['loose'] + state['empties']
    extras = {'asset': ASSET['id'], 'kind': 'vehicle', 'lods': 1, 'eye': list(EYE), 'fov': FOV, 'gaze': GAZE}
    raw = os.path.join(work_dir, 'raw.glb')
    cp.export_glb(objects, raw, extras, quality=80)
    report['raw_bytes'] = os.path.getsize(raw)
    report.update(pack(raw, out_path, cp.BAKED))
    report['file'] = cp.check_glb(out_path, NODES, CHILDREN)
    report['bytes'] = report['file']['bytes']
    report['within_size'] = report['bytes'] <= MAX_BYTES
    try:    # the baked colour (paint x occlusion) in linear units, percentiles 10/25/50/75/90
        import numpy as np
        from PIL import Image
        rgb = np.asarray(Image.open(os.path.join(work_dir, 'base.png')).convert('RGB'), dtype=np.float32) / 255.0
        lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4).mean(axis=2)
        lin = lin[lin > 0.003]
        report['baked_albedo_linear'] = [round(float(np.percentile(lin, p)), 3) for p in (10, 25, 50, 75, 90)]
    except Exception as error:
        report['baked_albedo_linear'] = 'failed: %s' % error
    try:
        report['pictures'] = pictures(state, 'baked')
    except Exception as error:      # a preview never costs the build
        report['pictures'] = ['failed: %s' % error]
    with open(os.path.join(SCRATCH, 'report.json'), 'w') as handle:
        json.dump(report, handle, indent=1)
    return report


def pack(raw, out_path, sources):
    """From the exporter's plain file to the game's: Draco geometry and the first texture setting of the
    LADDER that fits MAX_BYTES. Without a Draco encoder the plain file is kept beside the textures
    (work dir, raw.glb) for `--repack` on a machine that has one."""
    out = {}
    for rung, (quality, orm_size) in enumerate(LADDER):
        shutil.copyfile(raw, out_path)
        if all(os.path.exists(p) for p in sources.values()) and sources:
            cp.recompress_images(out_path, sources, quality, {'orm': orm_size})
            out['texture_setting'] = {'rung': rung, 'webp_quality': quality, 'orm_pixels': orm_size}
        out['draco_packed'] = cp.draco_pack(out_path)
        if os.path.getsize(out_path) <= MAX_BYTES - 8192 or not out['draco_packed'] or not sources:
            break
    if out['draco_packed']:
        os.remove(raw)
    return out


def make(a):
    if '--repack' in sys.argv:
        def repack(out_path, work_dir):
            raw = os.path.join(work_dir, 'raw.glb')
            if not os.path.exists(raw):
                if cp.check_glb(out_path, NODES, CHILDREN)['draco']:
                    return {'id': ASSET['id'], 'draco_packed': True, 'file': cp.check_glb(out_path, NODES, CHILDREN)}
                shutil.copyfile(out_path, raw)
            sources = {k: os.path.join(work_dir, k + '.png') for k in ('base', 'orm', 'normal')}
            report = {'id': ASSET['id']}
            report.update(pack(raw, out_path, sources if all(os.path.exists(p) for p in sources.values()) else {}))
            report['file'] = cp.check_glb(out_path, NODES, CHILDREN)
            report['within_size'] = report['file']['bytes'] <= MAX_BYTES
            return report
        a.finish = repack
        return
    M = cp.materials()
    kit = cp.Kit()
    register_stamps(kit, M)
    build_lining(kit, M)
    glass = build_windows(kit, M)
    build_glare(kit, M)
    faces = build_panel(kit, M)
    combiner = build_hud(kit, M)
    build_pedestal(kit, M)
    build_stick(kit, M)
    hands, bar = build_hands(kit, M)
    build_cabin(kit, M)
    glow_panel = tuple(PANEL @ Vector((0.0, 0.33, 0.25)))
    glow_console = (0.05, EY + 0.38, EZ - 0.2)
    empties = [mk.empty('eye', EYE), mk.empty('glow_panel', glow_panel), mk.empty('glow_console', glow_console)]
    for key, value in (('eye', list(EYE)), ('fov', FOV), ('gaze', GAZE)):
        a.extra(key, value)
    state = {'kit': kit, 'loose': [glass, combiner] + faces, 'empties': empties, 'hands': hands, 'bar': bar,
             'glow_panel': glow_panel, 'glow_console': glow_console,
             'pivots': {'throttles': HINGE, 'stick': STICK_PIVOT, 'hand_throttle': bar, 'hand_stick': GRIP}}
    print('MANTA_COCKPIT kit triangles', kit.triangles(), {'%s@%s' % k: g.triangles() for k, g in kit.unique.items()},
          {'legends ' + k: g.triangles() for k, g in kit.flat.items()},
          {k: (s['geo'].triangles(), len(s['places'])) for k, s in kit.stamps.items()})
    if '--source' in sys.argv:
        cp.realise(kit, state['pivots'], CHILDREN)
        report = inspect(state)
        report['pictures'] = pictures(state, 'source')
        with open(os.path.join(SCRATCH, 'source.json'), 'w') as handle:
            json.dump(report, handle, indent=1)
        print('MANTA_COCKPIT ' + json.dumps(report))
    else:
        a.finish = lambda out_path, work_dir: finish(state, out_path, work_dir)
