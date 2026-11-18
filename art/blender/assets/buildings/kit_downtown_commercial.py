"""Kit downtown commercial: facade modules of the stucco, brick and stone-trimmed shop and office
blocks of Centro, 2 to 6 storeys, an original design.

One file holds every module (see _facade.py for the module grid and the node layout): each
module is <slot>_<width>_<variant>_lod0 (the detailed bay) and ..._lod1 (a baked card). The
style: stone half-pilasters at both edges of every bay, so that neighbouring bays join into full
pilasters; on the ground storey stone piers carry a continuous fascia (the sign band), a bed
moulding and a projecting cornice; shopfronts with display windows over granite stall risers,
recessed glazed doors, canvas awnings on folding arms and roller shutters in steel housings; an
office entrance in a stone surround under a steel canopy on tie rods, with a lantern either
side; on the upper storeys a stone string course at every floor, tall sash windows with stone
sills and keyed lintels in stucco or in brick, a black iron fire escape on one variant, and a
deep bracketed cornice with dentils under a parapet at the top. Corner posts are stone quoins.

The upper variants are ordered so that the 4 m and the 2 m lists agree for every variant index
the assembler picks per building: a and c are stucco, b and d (4 m) and b (2 m) are brick.

Materials by role: paint_wall (main stucco, baked neutral, tinted per building), paint_trim
(the stone: pilasters, string courses, sills, lintels, cornices, quoins, surrounds),
lamp_window_a/b/c (window panes: dark reflective glass by day, lit by group at night), atlas
(brick, granite, sash paint, awning canvas, shutter steel, iron), tile_wall and tile_roof_flat.

Budget: a whole kit in one file. Every module is its own node with up to five materials, so
the draw-call and triangle ceilings of a single building do not apply; the game batches each
module separately.

Blender axes: Z up; every module faces +Y with its wall on Y = 0.
"""
from lib import materials as M

from _facade import FacadeMaterials, Kit, wrap_outline

ASSET = {
    'id': 'kit_downtown_commercial',
    'kind': 'building',
    'atlas': 1024,
    'budget': {'triangles': 16000, 'draws': 200, 'bytes': 1250000},
}

GROUND, UPPER, TOP = 4.2, 3.2, 1.2
PIER, PIER_OUT = 0.22, 0.12          # ground piers and upper pilasters: half width at a bay edge
PIL_OUT = 0.09
COURSE = 0.16                        # the string course at the foot of every upper storey
FASCIA = (3.05, 3.62)                # the sign band of the ground storey
CORNICE = (3.70, 3.88)
SASH_DEPTH = 0.2
SIGN = dict(forward=(0.0, 1.0, 0.0))


# ---------------------------------------------------------------------------------------------
# Shared pieces
# ---------------------------------------------------------------------------------------------

def piers(s, half, z0, z1, proud, cap=True):
    """Half-pilasters at both bay edges; the neighbouring bay's half completes each one."""
    top = '' if cap else 't'
    s.box('trim', (-half, 0.0, z0), (-half + PIER, proud, z1), skip='blu' + top)
    s.box('trim', (half - PIER, 0.0, z0), (half, proud, z1), skip='bru' + top)


def ground_frame(s, half, openings, sign=None, name=None):
    """The ground storey's wall, its stone piers, the fascia, bed moulding and cornice."""
    s.wall('wall', -half, half, 0.0, GROUND, openings)
    piers(s, half, 0.0, FASCIA[0], PIER_OUT)
    s.box('trim', (-half, 0.0, FASCIA[0]), (half, 0.05, FASCIA[1]), skip='blr')
    s.box('trim', (-half, 0.0, FASCIA[1]), (half, 0.11, CORNICE[0]), skip='blr')
    s.box('trim', (-half, 0.0, CORNICE[0]), (half, 0.24, CORNICE[1]), skip='blr')
    s.box('trim', (-half, 0.0, GROUND - 0.12), (half, 0.06, GROUND), skip='blr')
    if sign:
        width = 2 * half - 2 * PIER - 0.3
        s.a_anchor = (f'anchor_sign_{name}', (0.0, 0.06, sum(FASCIA) / 2), width, 0.5)


def upper_frame(s, half, infill, openings):
    """An upper storey: the string course, the infill wall (stucco or brick), the pilasters."""
    s.box('trim', (-half, 0.0, 0.0), (half, 0.07, COURSE), skip='blr')
    s.wall(infill, -half, half, COURSE, UPPER, openings)
    piers(s, half, COURSE, UPPER, PIL_OUT, cap=False)


def lintel(s, x0, x1, z1, key=True):
    """A stone lintel over an opening, with a keystone."""
    s.box('trim', (x0 - 0.1, 0.0, z1), (x1 + 0.1, 0.05, z1 + 0.22), skip='b')
    if key:
        centre = (x0 + x1) / 2
        s.box('trim', (centre - 0.08, 0.0, z1 - 0.03), (centre + 0.08, 0.08, z1 + 0.28), skip='b')


def sash(s, opening, glass, columns=1, depth=SASH_DEPTH, sill='trim', key=True):
    """A sliding sash window: reveal, pane, frame, meeting rail, stone sill and lintel."""
    x0, z0, x1, z1 = opening
    s.reveal('wall' if sill != 'brick_sill' else 'brick', opening, depth, sill=False)
    s.window(opening, depth, glass, columns=columns, bars=((z0 + z1) / 2,), sill='trim',
             frame_width=0.065)
    lintel(s, x0, x1, z1, key)


def awning(s, x0, x1, key, top=3.0, out=1.3, drop=0.5, valance=0.24):
    """A canvas awning on folding arms: sloped sheet, valance, front bar and two arms."""
    front = top - drop
    sheet = [(x0, 0.18, top), (x1, 0.18, top), (x1, out, front), (x0, out, front)]
    s.quad(key, sheet, (0.0, drop, out))
    s.quad(key, sheet, (0.0, -drop, -out))
    flap = [(x0, out, front - valance), (x1, out, front - valance), (x1, out, front), (x0, out, front)]
    s.quad(key, flap, (0.0, 1.0, 0.0))
    s.quad(key, flap, (0.0, -1.0, 0.0))
    s.tube('iron', [(x0, out - 0.02, front - 0.02), (x1, out - 0.02, front - 0.02)], radius=0.025)
    for x in (x0 + 0.15, x1 - 0.15):
        s.tube('iron', [(x, 0.03, top - 0.85), (x, out - 0.05, front - 0.04)], radius=0.018)
    s.box('iron', (x0, 0.13, top - 0.04), (x1, 0.23, top + 0.06), skip='blr')


def shutter(s, x0, x1, z_bottom, z_head, y):
    """A roller shutter lowered to z_bottom in front of the glazing, under a steel housing at
    z_head, running in guide rails."""
    s.quad('shutter', [(x0, y, z_bottom), (x1, y, z_bottom), (x1, y, z_head), (x0, y, z_head)],
           (0, 1, 0))
    s.box('shutter', (x0, y, z_bottom), (x1, y + 0.04, z_bottom + 0.06), skip='blr')
    s.box('shutter', (x0 - 0.06, -0.02, z_head), (x1 + 0.06, 0.16, z_head + 0.22), skip='b')
    for x in (x0, x1 - 0.05):
        s.box('iron', (x, y - 0.03, 0.0), (x + 0.05, y + 0.05, z_head), skip='bt')


def wall_lamp(s, kit, name, x, z):
    """A lantern on a short bracket, with its light anchor."""
    s.box('iron', (x - 0.08, 0.0, z - 0.1), (x + 0.08, 0.04, z + 0.14), skip='b')
    s.box('iron', (x - 0.09, 0.12, z - 0.22), (x + 0.09, 0.30, z + 0.1), skip='')
    s.box('frame', (x - 0.1, 0.11, z + 0.1), (x + 0.1, 0.31, z + 0.14), skip='')
    s.tube('iron', [(x, 0.04, z + 0.02), (x, 0.21, z + 0.02)], radius=0.015)
    kit.a.add_anchor(name, (x, 0.21, z - 0.12), forward=(0.0, 1.0, 0.0), light='point',
                     color=[1.0, 0.82, 0.58], range=7.0)


def module(kit, name, slot, width, height, s, **info):
    """kit.module, adding the sign anchor that ground_frame noted."""
    anchors = list(info.pop('anchors', []))
    if getattr(s, 'a_anchor', None):
        anchor, location, w, h = s.a_anchor
        kit.a.add_anchor(anchor, location, width=round(w, 2), height=h, **SIGN)
        anchors.insert(0, anchor)
    if anchors:
        info['anchors'] = anchors
    return kit.module(name, slot, width, height, s, **info)


# ---------------------------------------------------------------------------------------------
# Ground storey
# ---------------------------------------------------------------------------------------------

def shopfront(s, half, door_left, key_canvas, lit=True):
    """Display windows over a granite stall riser and a recessed glazed door between the piers."""
    inner = half - PIER
    if door_left:
        door, display = (-inner + 0.1, 0.0, -inner + 1.0, 2.9), (-inner + 1.2, 0.5, inner - 0.1, 2.9)
    else:
        display, door = (-inner + 0.1, 0.5, inner - 1.2, 2.9), (inner - 1.0, 0.0, inner - 0.1, 2.9)
    return display, door


def ground_shop(kit, width, variant, door_left=False, canvas='canvas_a', closed=False):
    """A shopfront under a canvas awning (or behind a lowered roller shutter)."""
    name = f'ground_shop_{width}_{variant}'
    s = kit.shell('ground')
    half = width / 2
    inner = half - PIER
    display, door = shopfront(s, half, door_left, canvas)
    ground_frame(s, half, [display, door], sign=True, name=name)
    s.reveal('wall', display, 0.2, sill=False)
    s.reveal('wall', door, 0.55)
    columns = max(1, round((display[2] - display[0]) / 1.0))
    s.window(display, 0.2, 'glass_c', columns=columns, bars=(2.45,), sill='frame')
    s.window(door, 0.55, 'glass_c', bars=(1.0, 2.35), sill=None, frame_width=0.09)
    handle_x = door[0] + 0.12 if not door_left else door[2] - 0.12
    s.tube('frame', [(handle_x, -0.44, 0.95), (handle_x, -0.44, 1.45)], radius=0.016)
    riser_x = (display[0], display[2])
    s.box('plinth', (riser_x[0], 0.0, 0.0), (riser_x[1], 0.035, 0.5), skip='b')
    if closed:
        shutter(s, -inner, inner, 0.0, 2.9, 0.03)
    else:
        shutter(s, -inner, inner, 2.62, 2.9, 0.03)
        awning(s, -half + 0.12, half - 0.12, canvas)
    lamp = None if closed else (-inner, 0.4, inner, 2.9, 'glass_c')
    module(kit, name, 'ground_shop', width, GROUND, s, lamp=lamp)


def ground_shop_narrow(kit):
    """A narrow shop: a glazed door with a side light, its roller shutter half lowered."""
    name = 'ground_shop_2_a'
    s = kit.shell('ground')
    half, inner = 1.0, 1.0 - PIER
    opening = (-inner, 0.0, inner, 2.9)
    ground_frame(s, half, [opening], sign=True, name=name)
    s.reveal('wall', opening, 0.3, sill=False)
    s.window(opening, 0.3, 'glass_c', columns=2, bars=(2.45,), sill=None, frame_width=0.08)
    s.box('plinth', (0.0, -0.3, 0.0), (inner, -0.2, 0.45), skip='b')
    shutter(s, -inner, inner, 1.55, 2.9, 0.03)
    module(kit, name, 'ground_shop', 2, GROUND, s, lamp=(-inner, 0.0, inner, 2.9, 'glass_c'))


def ground_shop_wide(kit):
    """An 8 m shopfront: two display windows either side of a recessed double door, one long
    awning, one long fascia."""
    name = 'ground_shop_wide_8_a'
    s = kit.shell('ground')
    half, inner = 4.0, 4.0 - PIER
    left, right = (-inner + 0.1, 0.5, -0.8, 2.9), (0.8, 0.5, inner - 0.1, 2.9)
    door = (-0.6, 0.0, 0.6, 2.9)
    ground_frame(s, half, [left, right, door], sign=True, name=name)
    for display in (left, right):
        s.reveal('wall', display, 0.2, sill=False)
        s.window(display, 0.2, 'glass_c', columns=3, bars=(2.45,), sill='frame')
        s.box('plinth', (display[0], 0.0, 0.0), (display[2], 0.035, 0.5), skip='b')
    s.reveal('wall', door, 0.6)
    s.window(door, 0.6, 'glass_c', columns=2, bars=(2.35,), sill=None, frame_width=0.09)
    for x in (-0.1, 0.1):
        s.tube('frame', [(x, -0.49, 0.95), (x, -0.49, 1.45)], radius=0.016)
    shutter(s, -inner, inner, 2.62, 2.9, 0.03)
    awning(s, -half + 0.12, half - 0.12, 'canvas_b', out=1.45, drop=0.55)
    module(kit, name, 'ground_shop_wide', 8, GROUND, s, lamp=(-inner, 0.4, inner, 2.9, 'glass_c'))


def ground_entrance(kit):
    """The office entrance: glazed double doors and a transom deep in a stone surround with a
    cornice, a steel canopy on tie rods, a lantern on either side."""
    name = 'ground_entrance_4_a'
    s = kit.shell('ground')
    opening = (-0.95, 0.0, 0.95, 2.95)
    ground_frame(s, 2.0, [opening], sign=True, name=name)
    s.reveal('wall', opening, 0.6)
    s.window((-0.95, 0.0, 0.95, 2.35), 0.6, 'glass_c', columns=2, bars=(1.1,), sill=None,
             frame_width=0.09)
    s.window((-0.95, 2.35, 0.95, 2.95), 0.6, 'glass_c', columns=3, sill=None)
    for side in (-1.0, 1.0):
        s.tube('frame', [(side * 0.12, -0.49, 0.95), (side * 0.12, -0.49, 1.5)], radius=0.018)
        low, high = sorted((side * 0.95, side * 1.22))
        s.box('trim', (low, 0.0, 0.0), (high, 0.1, 2.95), skip='bu')
    s.box('trim', (-1.32, 0.0, 2.95), (1.32, 0.12, 3.03), skip='b')
    s.box('iron', (-1.45, 0.0, 2.82), (1.45, 1.35, 2.92), skip='b')
    for side in (-1.0, 1.0):
        s.tube('iron', [(side * 1.3, 0.02, 3.55), (side * 1.3, 1.25, 2.93)], radius=0.016)
    s.box('plinth', (-1.78, 0.0, 0.0), (-1.22, 0.035, 0.5), skip='b')
    s.box('plinth', (1.22, 0.0, 0.0), (1.78, 0.035, 0.5), skip='b')
    anchors = []
    for side, tag in ((-1.0, 'l'), (1.0, 'r')):
        anchor = f'anchor_light_{name}_{tag}'
        wall_lamp(s, kit, anchor, side * 1.5, 2.25)
        anchors.append(anchor)
    module(kit, name, 'ground_entrance', 4, GROUND, s, lamp=(-0.95, 0.0, 0.95, 2.95, 'glass_c'),
           anchors=anchors)


def ground_wall(kit):
    """A windowed ground storey (a bank or an office): two tall sashes over a granite base."""
    name = 'ground_wall_4_a'
    s = kit.shell('ground')
    windows = [(-1.2, 0.95, -0.2, 2.75), (0.2, 0.95, 1.2, 2.75)]
    ground_frame(s, 2.0, windows)
    for opening in windows:
        sash(s, opening, 'glass_b', key=False)
    s.box('plinth', (-1.78, 0.0, 0.0), (1.78, 0.035, 0.6), skip='b')
    module(kit, name, 'ground_wall', 4, GROUND, s, lamp=(-1.2, 0.95, 1.2, 2.75, 'glass_b'))


def ground_service(kit):
    """A narrow service bay: a steel door with a louvred transom and a lamp over it."""
    name = 'ground_wall_2_a'
    s = kit.shell('ground')
    door, vent = (-0.5, 0.0, 0.5, 2.25), (-0.5, 2.35, 0.5, 2.7)
    ground_frame(s, 1.0, [door, vent])
    s.reveal('wall', door, 0.12)
    s.quad('door', [(-0.5, -0.12, 0.0), (0.5, -0.12, 0.0), (0.5, -0.12, 2.25), (-0.5, -0.12, 2.25)],
           (0, 1, 0))
    for z in (0.35, 1.9):
        s.box('door', (-0.42, -0.12, z), (0.42, -0.1, z + 0.04), skip='b')
    s.tube('frame', [(0.36, -0.08, 1.0), (0.36, -0.06, 1.0), (0.36, -0.06, 1.14)], radius=0.014)
    s.reveal('wall', vent, 0.1, sill=False)
    s.quad('iron', [(-0.5, -0.1, 2.35), (0.5, -0.1, 2.35), (0.5, -0.1, 2.7), (-0.5, -0.1, 2.7)],
           (0, 1, 0))
    for index in range(4):
        z = 2.39 + index * 0.08
        s.box('iron', (-0.48, -0.1, z), (0.48, -0.04, z + 0.03), skip='blr')
    s.box('trim', (-0.62, 0.0, 2.7), (0.62, 0.06, 2.84), skip='b')
    s.box('plinth', (-0.78, 0.0, 0.0), (-0.5, 0.035, 0.6), skip='b')
    s.box('plinth', (0.5, 0.0, 0.0), (0.78, 0.035, 0.6), skip='b')
    anchor = f'anchor_light_{name}'
    wall_lamp(s, kit, anchor, 0.0, 3.0)
    s.tube('frame', [(0.62, 0.05, 0.0), (0.62, 0.05, 1.6)], radius=0.03)
    module(kit, name, 'ground_wall', 2, GROUND, s, anchors=[anchor])


def ground_garage(kit):
    """A loading bay closed by a roller shutter in its housing."""
    name = 'ground_garage_4_a'
    s = kit.shell('ground')
    opening = (-1.55, 0.0, 1.55, 2.85)
    ground_frame(s, 2.0, [opening])
    s.reveal('wall', opening, 0.12, sill=False)
    shutter(s, -1.55, 1.55, 0.0, 2.85, -0.1)
    s.box('plinth', (-1.78, 0.0, 0.0), (-1.55, 0.035, 0.6), skip='b')
    s.box('plinth', (1.55, 0.0, 0.0), (1.78, 0.035, 0.6), skip='b')
    module(kit, name, 'ground_garage', 4, GROUND, s)


# ---------------------------------------------------------------------------------------------
# Upper storeys
# ---------------------------------------------------------------------------------------------

def upper_sashes(kit, variant, brick, glass):
    """Two tall sash windows with keyed lintels (a: stucco), or a pair of wide sashes divided
    by a stone mullion under one lintel (b: brick)."""
    s = kit.shell()
    infill = 'brick' if brick else 'wall'
    if brick:
        opening = (-1.2, 0.8, 1.2, 2.55)
        upper_frame(s, 2.0, infill, [opening])
        s.reveal('brick', opening, SASH_DEPTH, sill=False)
        for x0, x1 in ((-1.2, -0.08), (0.08, 1.2)):
            s.window((x0, 0.8, x1, 2.55), SASH_DEPTH, glass, columns=2, bars=(1.675,), sill=None,
                     frame_width=0.065)
        s.box('trim', (-0.08, -SASH_DEPTH, 0.8), (0.08, 0.03, 2.55), skip='btu')
        s.box('trim', (-1.28, -SASH_DEPTH, 0.72), (1.28, 0.09, 0.8), skip='b')
        s.box('trim', (-1.32, 0.0, 2.55), (1.32, 0.06, 2.8), skip='b')
        lamp = (*opening, glass)
    else:
        windows = [(-1.2, 0.85, -0.4, 2.45), (0.4, 0.85, 1.2, 2.45)]
        upper_frame(s, 2.0, infill, windows)
        for opening in windows:
            sash(s, opening, glass)
        lamp = (-1.2, 0.85, 1.2, 2.45, glass)
    panes = None if brick else [(-1.2, -0.4), (0.4, 1.2)]
    kit.module(f'upper_window_4_{variant}', 'upper_window', 4, UPPER, s, lamp=lamp, panes=panes)


def upper_tripartite(kit):
    """An office bay in brick: a wide three-light window in a stone architrave."""
    s = kit.shell()
    opening = (-1.2, 0.75, 1.2, 2.55)
    upper_frame(s, 2.0, 'brick', [opening])
    s.reveal('brick', opening, SASH_DEPTH, sill=False)
    s.window(opening, SASH_DEPTH, 'glass_a', columns=3, bars=(2.05,), sill='trim',
             frame_width=0.07, bar_width=0.06)
    for x0, x1 in ((-1.38, -1.2), (1.2, 1.38)):
        s.box('trim', (x0, 0.0, 0.68), (x1, 0.06, 2.55), skip='bu')
    s.box('trim', (-1.38, 0.0, 2.55), (1.38, 0.06, 2.75), skip='b')
    s.box('trim', (-1.46, 0.0, 2.75), (1.46, 0.12, 2.83), skip='b')
    kit.module('upper_window_4_d', 'upper_window', 4, UPPER, s, lamp=(*opening, 'glass_a'))


def upper_fire_escape(kit):
    """Two sashes in stucco (the left one tall, the way out) behind a black iron fire escape:
    a landing on brackets with railings, and a stair that rises along it to the landing of the
    storey above (stack the module in one column)."""
    s = kit.shell()
    windows = [(-1.2, 0.42, -0.4, 2.45), (0.4, 0.85, 1.2, 2.45)]
    upper_frame(s, 2.0, 'wall', windows)
    for opening in windows:
        sash(s, opening, 'glass_c')
    floor, deep = 0.3, 1.2
    s.box('iron', (-1.95, 0.08, floor - 0.06), (1.95, deep, floor), skip='')
    for x in (-1.5, 1.5):
        s.tube('iron', [(x, 0.0, floor - 0.6), (x, deep - 0.06, floor - 0.07)], radius=0.022)
        s.box('iron', (x - 0.05, 0.0, floor - 0.7), (x + 0.05, 0.03, floor - 0.4), skip='b')
    rail_y = deep - 0.03
    for x in (-1.95, -0.65, 0.65, 1.95):
        s.tube('iron', [(x, rail_y, floor), (x, rail_y, floor + 1.0)], radius=0.014)
    for z in (floor + 0.5, floor + 1.0):
        s.tube('iron', [(-1.95, 0.1, z), (-1.95, rail_y, z), (1.95, rail_y, z), (1.95, 0.1, z)],
               radius=0.016)
    treads, x0, x1 = 12, -1.75, 1.0
    run, rise = (x1 - x0) / treads, UPPER / treads
    for index in range(treads - 1):
        x, z = x0 + run * (index + 0.5), floor + rise * (index + 1)
        s.box('iron', (x - 0.12, 0.66, z - 0.03), (x + 0.12, 1.12, z), skip='b')
    for y in (0.64, 1.14):
        s.tube('iron', [(x0, y, floor), (x1, y, floor + UPPER)], radius=0.03)
    s.tube('iron', [(x0 + 0.2, 1.15, floor + 0.95), (x1, 1.15, floor + UPPER + 0.9)], radius=0.015)
    kit.module('upper_window_4_c', 'upper_window', 4, UPPER, s,
               lamp=(-1.2, 0.42, 1.2, 2.45, 'glass_c'))


def upper_narrow(kit, variant, brick):
    """A 2 m bay: one sash (a: stucco), or a paired sash under a stone lintel (b: brick)."""
    s = kit.shell()
    if brick:
        opening = (-0.55, 0.8, 0.55, 2.55)
        upper_frame(s, 1.0, 'brick', [opening])
        s.reveal('brick', opening, SASH_DEPTH, sill=False)
        s.window(opening, SASH_DEPTH, 'glass_b', columns=2, bars=(1.675,), sill='trim',
                 frame_width=0.065)
        s.box('trim', (-0.67, 0.0, 2.55), (0.67, 0.06, 2.8), skip='b')
        glass = 'glass_b'
    else:
        opening = (-0.4, 0.85, 0.4, 2.45)
        upper_frame(s, 1.0, 'wall', [opening])
        sash(s, opening, 'glass_a')
        glass = 'glass_a'
    kit.module(f'upper_window_2_{variant}', 'upper_window', 2, UPPER, s, lamp=(*opening, glass))


def upper_blank(kit, width):
    """A blank bay; the 4 m one carries a downpipe and an air-conditioning unit on brackets."""
    s = kit.shell()
    half = width / 2
    upper_frame(s, half, 'wall', [])
    if width >= 4:
        s.tube('frame', [(1.55, 0.07, 0.0), (1.55, 0.07, UPPER)], radius=0.05)
        s.box('ac', (-0.75, 0.05, 1.2), (0.15, 0.36, 1.75), skip='b')
        for x in (-0.6, 0.0):
            s.box('iron', (x - 0.02, 0.0, 1.15), (x + 0.02, 0.4, 1.2), skip='b')
        s.tube('frame', [(-0.3, 0.06, 1.2), (-0.3, 0.06, 0.6), (-0.3, 0.12, 0.6)], radius=0.012)
    kit.module(f'upper_blank_{width}_a', 'upper_blank', width, UPPER, s)


# ---------------------------------------------------------------------------------------------
# Top and corners
# ---------------------------------------------------------------------------------------------

CORNICE_TOP = [  # (z0, z1, projection): architrave, frieze lip, bed moulding, corona, cymatium
    (0.0, 0.16, 0.07), (0.40, 0.48, 0.12), (0.48, 0.56, 0.24), (0.56, 0.74, 0.5), (0.74, 0.8, 0.42)]


def top_parapet(kit, width):
    """A deep cornice: architrave, frieze, dentils, brackets, corona; a parapet with a coping."""
    s = kit.shell()
    half = width / 2
    s.wall('wall', -half, half, 0.0, TOP)
    for z0, z1, out in CORNICE_TOP:
        s.box('trim', (-half, 0.0, z0), (half, out, z1), skip='blr')
    count = int(width / 0.2)
    for index in range(count):
        x = -half + 0.2 * (index + 0.5)
        s.box('trim', (x - 0.05, 0.11, 0.38), (x + 0.05, 0.19, 0.48), skip='bt')
    for index in range(int(width / 1.0)):
        x = -half + 1.0 * (index + 0.5)
        s.box('trim', (x - 0.07, 0.24, 0.42), (x + 0.07, 0.46, 0.56), skip='bt')
    s.box('trim', (-half, -0.28, TOP - 0.08), (half, 0.06, TOP), skip='lr')
    s.quad('wall', [(-half, -0.25, 0.8), (half, -0.25, 0.8), (half, -0.25, TOP - 0.08),
                    (-half, -0.25, TOP - 0.08)], (0, -1, 0))
    kit.module(f'top_parapet_{width}_a', 'top_parapet', width, TOP, s)


def wrap(s, key, projection, z0, z1):
    outline = wrap_outline(projection)
    s.prism(key, outline, z0, z1, skip_edges=(0, len(outline) - 1))


def corner(kit, name, slot, height, storey, dress):
    """A stone corner post 0.5 m square with street faces on Y = 0 and X = +0.25."""
    def faces(s, key='trim'):
        s.quad(key, [(-0.25, 0, 0), (0.25, 0, 0), (0.25, 0, height), (-0.25, 0, height)], (0, 1, 0))
        s.quad(key, [(0.25, 0, 0), (0.25, -0.5, 0), (0.25, -0.5, height), (0.25, 0, height)],
               (1, 0, 0))

    s = kit.shell(storey)
    faces(s)
    dress(s)
    kit.module(name, slot, 0.5, height, s, card=faces, plan=[0.5, 0.5])


def quoins(s, z0, z1, count):
    """Rusticated corner stones with a sunk joint between them."""
    step = (z1 - z0) / count
    for index in range(count):
        wrap(s, 'trim', 0.04, z0 + index * step + 0.025, z0 + (index + 1) * step - 0.025)


def corner_ground_dress(s):
    quoins(s, 0.0, FASCIA[0], 6)
    wrap(s, 'trim', 0.05, FASCIA[0], FASCIA[1])
    wrap(s, 'trim', 0.11, FASCIA[1], CORNICE[0])
    wrap(s, 'trim', 0.24, CORNICE[0], CORNICE[1])
    wrap(s, 'trim', 0.06, GROUND - 0.12, GROUND)


def corner_upper_dress(s):
    wrap(s, 'trim', 0.07, 0.0, COURSE)
    quoins(s, COURSE, UPPER, 5)


def corner_top_dress(s):
    for z0, z1, out in CORNICE_TOP:
        wrap(s, 'trim', out, z0, z1)
    coping = [(-0.25, -0.28), (-0.03, -0.28), (-0.03, -0.5), (0.31, -0.5), (0.31, 0.06), (-0.25, 0.06)]
    s.prism('trim', coping, TOP - 0.08, TOP)
    s.quad('wall', [(-0.25, -0.25, 0.8), (0.0, -0.25, 0.8), (0.0, -0.25, TOP - 0.08),
                    (-0.25, -0.25, TOP - 0.08)], (0, -1, 0))
    s.quad('wall', [(0.0, -0.25, 0.8), (0.0, -0.5, 0.8), (0.0, -0.5, TOP - 0.08),
                    (0.0, -0.25, TOP - 0.08)], (-1, 0, 0))


# ---------------------------------------------------------------------------------------------

def make(a):
    frame = M.painted_metal(color=(0.70, 0.68, 0.62), gloss=0.45, chips=0.3, rust=0.05, grime=0.4,
                            dust=0.2, fade=0.25, seed=41, name='sash_paint')
    granite = M.stone(color=(0.13, 0.12, 0.12), block=(0.6, 0.5), rough=0.25, stains=0.3, seed=42,
                      name='granite')
    materials = FacadeMaterials(wall_color=M.hex_color('#e6d6bc'), trim_color=M.hex_color('#d9cdb6'),
                                frame=frame, plinth=granite, seed=51)
    materials.add(
        brick=M.brick(color=(0.40, 0.17, 0.11), mortar=(0.55, 0.52, 0.47), variation=0.5,
                      stains=0.45, seed=43, name='brick_red'),
        canvas_a=M.fabric(color=(0.07, 0.20, 0.14), thread=0.002, fade=0.45, dirt=0.3, seed=44,
                          name='canvas_green'),
        canvas_b=M.fabric(color=(0.30, 0.06, 0.06), thread=0.002, fade=0.45, dirt=0.3, seed=45,
                          name='canvas_red'),
        shutter=M.corrugated_metal(color=(0.52, 0.53, 0.53), pitch=0.08, depth=0.012,
                                   direction='X', rust=0.25, seed=46, name='shutter_steel'),
        iron=M.painted_metal(color=(0.035, 0.037, 0.038), gloss=0.35, chips=0.3, rust=0.45,
                             grime=0.5, dust=0.2, fade=0.2, seed=47, name='iron_black'),
        door=M.painted_metal(color=(0.12, 0.20, 0.17), gloss=0.4, chips=0.35, rust=0.3, grime=0.5,
                             dust=0.2, fade=0.3, seed=48, name='door_green'),
        ac=M.painted_metal(color=(0.66, 0.66, 0.63), gloss=0.35, chips=0.1, rust=0.25, grime=0.6,
                           dust=0.3, fade=0.2, seed=49, name='ac_casing'),
    )
    kit = Kit(a, materials)

    ground_shop(kit, 4, 'a')
    ground_shop(kit, 4, 'b', door_left=True, closed=True)
    ground_shop_narrow(kit)
    ground_shop_wide(kit)
    ground_entrance(kit)
    ground_wall(kit)
    ground_service(kit)
    ground_garage(kit)
    corner(kit, 'corner_ground_a', 'corner_ground', GROUND, 'ground', corner_ground_dress)
    upper_sashes(kit, 'a', brick=False, glass='glass_a')
    upper_sashes(kit, 'b', brick=True, glass='glass_b')
    upper_fire_escape(kit)
    upper_tripartite(kit)
    upper_narrow(kit, 'a', brick=False)
    upper_narrow(kit, 'b', brick=True)
    upper_blank(kit, 4)
    upper_blank(kit, 2)
    corner(kit, 'corner_upper_a', 'corner_upper', UPPER, 'upper', corner_upper_dress)
    top_parapet(kit, 4)
    top_parapet(kit, 2)
    corner(kit, 'corner_top_a', 'corner_top', TOP, 'upper', corner_top_dress)
    kit.tiles()
    kit.finish(lod_distance=70.0)
    a.bake(size=1024, bevel_radius=0.012, occlusion_distance=1.1, occlusion_in_color=0.45,
           cage_extrusion=1.7)


def assemble(a):
    Kit.of(a).assemble()
