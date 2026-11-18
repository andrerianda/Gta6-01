"""Kit barrio lowrise: facade modules of the modest painted-block and stucco buildings of Barrio
Hierro and the old town, 1 to 3 storeys in strong colours, an original design.

One file holds every module (see _facade.py for the module grid and the node layout): each
module is <slot>_<width>_<variant>_lod0 (the detailed bay) and ..._lod1 (a baked card). The
style: rough painted render with a contrasting dado band at the foot and a painted band under
every floor line; small shops behind iron bar grilles under hand-built canopies of corrugated
tin on pipe brackets, roll-down grilles; louvred glass windows (jalousies) behind welded bar
grilles under thin concrete hoods; open louvred timber shutters; a wrought-iron balcony on a
thin slab; an external concrete stair with an iron rail up the entrance bay; exposed electrical
conduit with junction boxes and meters; a plain parapet with a coping, rebar stubs left for the
next storey and a scupper; a water tank on a steel stand for the roof.

The upper variants are ordered so that the 4 m and the 2 m lists agree for the variant index
the assembler picks per building.

Materials by role: paint_wall (main render, baked neutral, tinted per building), paint_trim
(the bands, hoods, surrounds and shutters, tinted per building in a contrasting colour),
lamp_window_a/b/c (window panes: dark reflective glass by day, lit by group at night), atlas
(iron, tin, aluminium louvres, concrete, conduit, tank), tile_wall and tile_roof_flat.

Budget: a whole kit in one file. Every module is its own node with up to five materials, so
the draw-call and triangle ceilings of a single building do not apply; the game batches each
module separately.

Blender axes: Z up; every module faces +Y with its wall on Y = 0.
"""
import math

from lib import materials as M

from _facade import FacadeMaterials, Kit, wrap_outline

ASSET = {
    'id': 'kit_barrio_lowrise',
    'kind': 'building',
    'atlas': 1024,
    'budget': {'triangles': 16000, 'draws': 200, 'bytes': 1250000},
}

GROUND, UPPER, TOP = 4.2, 3.2, 1.2
DADO = 0.9                         # the painted band at the foot of the ground storey
BAND = (3.95, 4.2)                 # the painted band at the top of the ground storey
FLOOR_BAND = (0.0, 0.2)            # and at the foot of every upper storey
REVEAL = 0.16
SIGN = dict(forward=(0.0, 1.0, 0.0))


# ---------------------------------------------------------------------------------------------
# Shared pieces
# ---------------------------------------------------------------------------------------------

def ground_frame(s, half, openings):
    """The ground storey's render, its dado band and its top band."""
    s.wall('wall', -half, half, 0.0, GROUND, openings)
    dado = [o for o in openings if o[1] < DADO]
    xs = sorted({-half, half, *[o[0] for o in dado], *[o[2] for o in dado]})
    for x0, x1 in zip(xs, xs[1:]):
        if any(o[0] <= x0 and x1 <= o[2] for o in dado):
            continue
        s.box('trim', (x0, 0.0, 0.0), (x1, 0.015, DADO), skip='blru')
    s.box('trim', (-half, 0.0, BAND[0]), (half, 0.04, BAND[1]), skip='blr')


def upper_frame(s, half, openings):
    s.box('trim', (-half, 0.0, FLOOR_BAND[0]), (half, 0.04, FLOOR_BAND[1]), skip='blr')
    s.wall('wall', -half, half, FLOOR_BAND[1], UPPER, openings)


def grille(s, opening, y, spacing=0.12, frame=True):
    """A welded bar grille in front of an opening: flat frame, vertical bars, two rails."""
    x0, z0, x1, z1 = opening
    count = max(2, round((x1 - x0) / spacing))
    for index in range(1, count):
        x = x0 + (x1 - x0) * index / count
        s.tube('iron', [(x, y, z0), (x, y, z1)], radius=0.009, segments=4)
    for z in (z0 + 0.04, z0 + (z1 - z0) * 0.5, z1 - 0.04):
        s.box('iron', (x0, y - 0.012, z - 0.015), (x1, y + 0.012, z + 0.015), skip='blr')
    if frame:
        for x in (x0, x1 - 0.03):
            s.box('iron', (x, y - 0.015, z0), (x + 0.03, y + 0.015, z1), skip='btu')


def jalousie(s, opening, glass, depth=REVEAL):
    """A louvred glass window: the pane (lamp glass) and aluminium louvres across it."""
    x0, z0, x1, z1 = opening
    s.reveal('wall', opening, depth, sill=False)
    s.quad(glass, [(x0, -depth, z0), (x1, -depth, z0), (x1, -depth, z1), (x0, -depth, z1)],
           (0, 1, 0))
    for x in (x0, x1 - 0.04):
        s.box('alu', (x, -depth, z0), (x + 0.04, -depth + 0.05, z1), skip='btu')
    count = int((z1 - z0) / 0.11)
    for index in range(count):
        z = z0 + 0.06 + index * (z1 - z0 - 0.08) / count
        s.quad('alu', [(x0 + 0.04, -depth + 0.02, z), (x1 - 0.04, -depth + 0.02, z),
                       (x1 - 0.04, -depth + 0.07, z + 0.035), (x0 + 0.04, -depth + 0.07, z + 0.035)],
               (0.0, 0.6, -1.0))
        s.quad('alu', [(x0 + 0.04, -depth + 0.02, z), (x1 - 0.04, -depth + 0.02, z),
                       (x1 - 0.04, -depth + 0.07, z + 0.035), (x0 + 0.04, -depth + 0.07, z + 0.035)],
               (0.0, -0.6, 1.0))
    s.box('trim', (x0 - 0.06, -depth, z0 - 0.06), (x1 + 0.06, 0.06, z0), skip='b')


def hood(s, x0, x1, z, out=0.45):
    """A thin concrete sun hood over a window."""
    s.box('trim', (x0, 0.0, z), (x1, out, z + 0.08), skip='b')


def conduit(s, path, box_at=None):
    """Exposed grey conduit clipped to the wall, with a junction box."""
    s.tube('conduit', path, radius=0.016, segments=4)
    if box_at:
        x, z = box_at
        s.box('conduit', (x - 0.09, 0.0, z - 0.09), (x + 0.09, 0.07, z + 0.09), skip='b')


def tin_canopy(s, x0, x1, top=3.35, out=1.25, drop=0.35):
    """A hand-built canopy: a corrugated tin sheet on a timber fascia, held on pipe brackets."""
    front = top - drop
    sheet = [(x0, 0.0, top), (x1, 0.0, top), (x1, out, front), (x0, out, front)]
    s.quad('tin', sheet, (0.0, drop, out))
    s.quad('tin', sheet, (0.0, -drop, -out))
    s.box('timber', (x0, out - 0.06, front - 0.14), (x1, out, front), skip='')
    for x in (x0 + 0.2, (x0 + x1) / 2, x1 - 0.2):
        s.tube('iron', [(x, 0.0, top - 0.75), (x, out - 0.08, front - 0.12)], radius=0.022)
    s.box('timber', (x0, 0.0, top - 0.05), (x1, 0.08, top + 0.05), skip='blr')


def module(kit, name, slot, width, height, s, sign=None, **info):
    anchors = list(info.pop('anchors', []))
    if sign:
        anchor = f'anchor_sign_{name}'
        location, w, h = sign
        kit.a.add_anchor(anchor, location, width=w, height=h, **SIGN)
        anchors.insert(0, anchor)
    if anchors:
        info['anchors'] = anchors
    return kit.module(name, slot, width, height, s, **info)


# ---------------------------------------------------------------------------------------------
# Ground storey
# ---------------------------------------------------------------------------------------------

def ground_shop(kit):
    """A small shop: a glazed front with a door behind a bar grille, a tin canopy, a painted
    sign area on the render above it, conduit to a meter box."""
    name = 'ground_shop_4_a'
    s = kit.shell('ground')
    display, door = (-1.65, 0.75, 0.35, 2.85), (0.6, 0.0, 1.55, 2.85)
    ground_frame(s, 2.0, [display, door])
    s.reveal('wall', display, REVEAL, sill=False)
    s.window(display, REVEAL, 'glass_c', columns=2, bars=(2.35,), sill='trim', frame_width=0.05)
    s.reveal('wall', door, 0.25)
    s.window(door, 0.25, 'glass_c', bars=(1.1, 2.35), sill=None, frame_width=0.07)
    grille(s, display, 0.04)
    grille(s, (0.6, 0.0, 1.55, 2.85), 0.05, spacing=0.14)
    tin_canopy(s, -1.95, 1.95)
    conduit(s, [(1.82, 0.03, 0.0), (1.82, 0.03, 3.9), (-1.8, 0.03, 3.9)], box_at=(1.82, 1.6))
    module(kit, name, 'ground_shop', 4, GROUND, s, sign=((0.0, 0.02, 3.62), 3.2, 0.5),
           lamp=(-1.65, 0.0, 1.55, 2.85, 'glass_c'))


def ground_shop_narrow(kit):
    """A narrow shop: a doorway with its roll-down grille half lowered, a short canopy."""
    name = 'ground_shop_2_a'
    s = kit.shell('ground')
    opening = (-0.75, 0.0, 0.75, 2.8)
    ground_frame(s, 1.0, [opening])
    s.reveal('wall', opening, 0.3)
    s.window(opening, 0.3, 'glass_c', columns=2, bars=(2.3,), sill=None, frame_width=0.07)
    s.quad('shutter', [(-0.75, 0.02, 1.7), (0.75, 0.02, 1.7), (0.75, 0.02, 2.8), (-0.75, 0.02, 2.8)],
           (0, 1, 0))
    s.box('shutter', (-0.8, 0.0, 2.8), (0.8, 0.2, 3.02), skip='b')
    s.box('shutter', (-0.75, 0.02, 1.66), (0.75, 0.06, 1.72), skip='blr')
    tin_canopy(s, -0.98, 0.98, out=0.9, drop=0.25)
    module(kit, name, 'ground_shop', 2, GROUND, s, sign=((0.0, 0.02, 3.65), 1.6, 0.45),
           lamp=(-0.75, 0.0, 0.75, 2.8, 'glass_c'))


def ground_entrance(kit):
    """The way in: a steel door behind a bar gate under a concrete hood, and an external stair
    of cast concrete with an iron rail rising along the bay to the first floor, a lamp."""
    name = 'ground_entrance_4_a'
    s = kit.shell('ground')
    door = (0.75, 0.0, 1.7, 2.3)
    ground_frame(s, 2.0, [door])
    s.reveal('wall', door, 0.12)
    s.quad('door', [(0.75, -0.12, 0.0), (1.7, -0.12, 0.0), (1.7, -0.12, 2.3), (0.75, -0.12, 2.3)],
           (0, 1, 0))
    grille(s, (0.75, 0.0, 1.7, 2.3), 0.04, spacing=0.1)
    hood(s, 0.6, 1.85, 2.4, out=0.6)
    # The stair: a solid concrete flight along the wall from the street at x = -1.95 up to a
    # landing at the first floor, 0.95 m deep, on a sloping soffit.
    steps, x0, x1, deep = 14, -1.95, 0.45, 0.95
    run, rise = (x1 - x0) / steps, GROUND / (steps + 1)
    for index in range(steps):
        xa, z = x0 + run * index, rise * (index + 1)
        s.box('concrete', (xa, 0.0, z - rise), (xa + run, deep, z), skip='bu' if index else 'b')
    s.box('concrete', (x1, 0.0, GROUND - 0.18), (1.95, deep, GROUND), skip='b')
    soffit = [(x0 + run * 2, 0.0, 0.0), (x1, 0.0, GROUND - 0.45), (x1, deep, GROUND - 0.45),
              (x0 + run * 2, deep, 0.0)]
    s.quad('concrete', soffit, (0.0, 0.0, -1.0))
    rail = deep - 0.04
    s.tube('iron', [(x0 + 0.1, rail, 0.95 + rise), (x1, rail, GROUND + 0.9),
                    (1.92, rail, GROUND + 0.9), (1.92, 0.05, GROUND + 0.9)], radius=0.02)
    for index in range(0, steps, 3):
        x, z = x0 + run * (index + 0.5), rise * (index + 1)
        s.tube('iron', [(x, rail, z), (x, rail, z + 0.95)], radius=0.012)
    for x in (0.9, 1.4, 1.92):
        s.tube('iron', [(x, rail, GROUND), (x, rail, GROUND + 0.9)], radius=0.012)
    anchor = f'anchor_light_{name}'
    s.box('frame', (1.83, 0.0, 2.55), (1.97, 0.12, 2.75), skip='b')
    kit.a.add_anchor(anchor, (1.9, 0.14, 2.62), forward=(0.0, 1.0, 0.0), light='point',
                     color=[1.0, 0.86, 0.66], range=6.0)
    conduit(s, [(1.95, 0.03, 2.65), (1.95, 0.03, 3.9)])
    module(kit, name, 'ground_entrance', 4, GROUND, s, anchors=[anchor], projects=0.95)


def ground_wall(kit):
    """A windowed ground storey: a louvred window behind a bar grille under a hood, a meter
    box and conduit."""
    name = 'ground_wall_4_a'
    s = kit.shell('ground')
    opening = (-1.0, 1.1, 0.8, 2.6)
    ground_frame(s, 2.0, [opening])
    jalousie(s, opening, 'glass_a')
    grille(s, opening, 0.05)
    hood(s, -1.15, 0.95, 2.72)
    s.box('alu', (1.25, 0.0, 1.3), (1.65, 0.18, 1.85), skip='b')
    conduit(s, [(1.45, 0.03, 1.85), (1.45, 0.03, 3.9), (-2.0, 0.03, 3.9)])
    module(kit, name, 'ground_wall', 4, GROUND, s, lamp=(*opening, 'glass_a'))


def ground_door_narrow(kit):
    """A narrow bay with a steel street door and a small barred light over it."""
    name = 'ground_wall_2_a'
    s = kit.shell('ground')
    door, light = (-0.48, 0.0, 0.48, 2.25), (-0.4, 2.5, 0.4, 3.0)
    ground_frame(s, 1.0, [door, light])
    s.reveal('wall', door, 0.12)
    s.quad('door', [(-0.48, -0.12, 0.0), (0.48, -0.12, 0.0), (0.48, -0.12, 2.25), (-0.48, -0.12, 2.25)],
           (0, 1, 0))
    for z in (0.3, 1.0, 1.7):
        s.box('door', (-0.42, -0.12, z), (0.42, -0.1, z + 0.4), skip='b')
    jalousie(s, light, 'glass_b')
    grille(s, light, 0.04, spacing=0.1)
    module(kit, name, 'ground_wall', 2, GROUND, s, lamp=(*light, 'glass_b'))


def ground_garage(kit):
    """A workshop bay closed by a painted roll-down steel door in its housing."""
    name = 'ground_garage_4_a'
    s = kit.shell('ground')
    opening = (-1.6, 0.0, 1.6, 2.9)
    ground_frame(s, 2.0, [opening])
    s.reveal('wall', opening, 0.1, sill=False)
    s.quad('shutter', [(-1.6, -0.08, 0.0), (1.6, -0.08, 0.0), (1.6, -0.08, 2.9), (-1.6, -0.08, 2.9)],
           (0, 1, 0))
    s.box('shutter', (-1.6, -0.08, 0.0), (1.6, -0.04, 0.07), skip='blr')
    s.box('shutter', (-1.72, 0.0, 2.9), (1.72, 0.24, 3.18), skip='b')
    conduit(s, [(-1.85, 0.03, 0.0), (-1.85, 0.03, 3.9)], box_at=(-1.85, 3.4))
    module(kit, name, 'ground_garage', 4, GROUND, s)


# ---------------------------------------------------------------------------------------------
# Upper storeys
# ---------------------------------------------------------------------------------------------

def upper_jalousie(kit, width, variant, glass):
    """A louvred glass window behind a bar grille under a concrete hood; the 4 m bay has an
    air-conditioner on brackets under it and a run of conduit."""
    s = kit.shell()
    half = width / 2
    opening = (-1.0, 0.95, 1.0, 2.35) if width >= 4 else (-0.5, 0.95, 0.5, 2.35)
    upper_frame(s, half, [opening])
    jalousie(s, opening, glass)
    grille(s, opening, 0.05)
    hood(s, opening[0] - 0.15, opening[2] + 0.15, 2.48)
    if width >= 4:
        s.box('alu', (1.15, 0.03, 0.55), (1.85, 0.33, 1.05), skip='b')
        for x in (1.25, 1.75):
            s.box('iron', (x - 0.02, 0.0, 0.5), (x + 0.02, 0.36, 0.55), skip='b')
        conduit(s, [(-1.85, 0.03, FLOOR_BAND[1]), (-1.85, 0.03, UPPER)])
    kit.module(f'upper_window_{width}_{variant}', 'upper_window', width, UPPER, s,
               lamp=(*opening, glass))


def upper_shutters(kit):
    """Two casements, each with a pair of louvred timber shutters folded back against the wall."""
    s = kit.shell()
    windows = [(-1.45, 0.9, -0.55, 2.3), (0.55, 0.9, 1.45, 2.3)]
    upper_frame(s, 2.0, windows)
    for opening in windows:
        x0, z0, x1, z1 = opening
        s.reveal('wall', opening, REVEAL, sill=False)
        s.window(opening, REVEAL, 'glass_b', columns=2, bars=(1.85,), sill='trim',
                 frame_width=0.05)
        width = (x1 - x0) / 2
        for side in (-1.0, 1.0):
            edge = x0 if side < 0 else x1
            low, high = sorted((edge, edge + side * width))
            s.box('trim', (low, 0.0, z0), (high, 0.035, z1), skip='bu')
            for index in range(9):
                z = z0 + 0.12 + index * (z1 - z0 - 0.2) / 9
                s.box('trim', (low + 0.04, 0.035, z), (high - 0.04, 0.05, z + 0.05), skip='blr')
        s.box('trim', (x0 - 0.05, 0.0, z1), (x1 + 0.05, 0.05, z1 + 0.12), skip='b')
    kit.module('upper_window_4_b', 'upper_window', 4, UPPER, s,
               lamp=(-1.45, 0.9, 1.45, 2.3, 'glass_b'))


def upper_balcony(kit, slot, name):
    """A french door onto a thin slab with a wrought-iron railing of bars and a scroll frieze."""
    s = kit.shell()
    opening = (-0.7, 0.1, 0.7, 2.35)
    upper_frame(s, 2.0, [opening])
    s.reveal('wall', opening, REVEAL)
    s.window(opening, REVEAL, 'glass_c', columns=2, bars=(1.0, 1.8), sill=None, frame_width=0.06)
    s.box('trim', (-0.85, 0.0, 2.35), (0.85, 0.06, 2.5), skip='b')
    x0, x1, deep = -1.4, 1.4, 0.75
    s.box('concrete', (x0, 0.0, -0.02), (x1, deep, 0.1), skip='b')
    rail_y = deep - 0.04
    top = 1.05
    path = [(x0 + 0.03, 0.02, top), (x0 + 0.03, rail_y, top), (x1 - 0.03, rail_y, top),
            (x1 - 0.03, 0.02, top)]
    s.tube('iron', path, radius=0.018)
    s.tube('iron', [(x, y, 0.2) for x, y, _ in path], radius=0.012)
    s.tube('iron', [(x, y, 0.85) for x, y, _ in path], radius=0.012)
    count = 22
    for index in range(count + 1):
        x = x0 + 0.03 + (x1 - x0 - 0.06) * index / count
        s.tube('iron', [(x, rail_y, 0.1), (x, rail_y, top)], radius=0.008, segments=3)
    for index in range(7):
        x = x0 + 0.2 + index * (x1 - x0 - 0.4) / 6
        ring = [(x + 0.07 * math.cos(t), rail_y + 0.002, 0.92 + 0.06 * math.sin(t))
                for t in [math.pi * 2 * k / 6 for k in range(7)]]
        s.tube('iron', ring, radius=0.007, segments=3)
    for y in (0.25, 0.5):
        for x in (x0 + 0.03, x1 - 0.03):
            s.tube('iron', [(x, y, 0.1), (x, y, top)], radius=0.008, segments=3)
    kit.module(name, slot, 4, UPPER, s, lamp=(*opening, 'glass_c'))


def upper_blank(kit, width):
    """A blank bay with exposed conduit; the 4 m bay has a downpipe and a junction box."""
    s = kit.shell()
    half = width / 2
    upper_frame(s, half, [])
    conduit(s, [(-half, 0.03, 2.9), (half, 0.03, 2.9)])
    if width >= 4:
        conduit(s, [(0.4, 0.03, 2.9), (0.4, 0.03, 0.9)], box_at=(0.4, 0.9))
        s.tube('frame', [(1.6, 0.07, 0.0), (1.6, 0.07, UPPER)], radius=0.045)
    kit.module(f'upper_blank_{width}_a', 'upper_blank', width, UPPER, s)


# ---------------------------------------------------------------------------------------------
# Top, corners, roof
# ---------------------------------------------------------------------------------------------

def top_parapet(kit, width):
    """A plain parapet: a painted band at the roof line, a coping, a scupper, rebar stubs."""
    s = kit.shell()
    half = width / 2
    s.wall('wall', -half, half, 0.0, TOP)
    s.box('trim', (-half, 0.0, 0.0), (half, 0.05, 0.22), skip='blr')
    s.box('concrete', (-half, -0.22, TOP - 0.07), (half, 0.04, TOP), skip='lr')
    s.quad('wall', [(-half, -0.2, 0.0), (half, -0.2, 0.0), (half, -0.2, TOP - 0.07),
                    (-half, -0.2, TOP - 0.07)], (0, -1, 0))
    s.box('concrete', (0.3, 0.0, 0.24), (0.45, 0.3, 0.32), skip='b')
    for x in (-half + 0.18, -half + 0.3) if width >= 4 else (-half + 0.2,):
        s.tube('rebar', [(x, -0.1, TOP), (x, -0.1, TOP + 0.55), (x + 0.04, -0.12, TOP + 0.62)],
               radius=0.009, segments=3)
    kit.module(f'top_parapet_{width}_a', 'top_parapet', width, TOP, s)


def wrap(s, key, projection, z0, z1):
    outline = wrap_outline(projection)
    s.prism(key, outline, z0, z1, skip_edges=(0, len(outline) - 1))


def corner(kit, name, slot, height, storey, dress):
    def faces(s):
        s.quad('wall', [(-0.25, 0, 0), (0.25, 0, 0), (0.25, 0, height), (-0.25, 0, height)], (0, 1, 0))
        s.quad('wall', [(0.25, 0, 0), (0.25, -0.5, 0), (0.25, -0.5, height), (0.25, 0, height)],
               (1, 0, 0))

    s = kit.shell(storey)
    faces(s)
    dress(s)
    kit.module(name, slot, 0.5, height, s, card=faces, plan=[0.5, 0.5])


def corner_ground_dress(s):
    wrap(s, 'trim', 0.015, 0.0, DADO)
    wrap(s, 'trim', 0.04, *BAND)


def corner_upper_dress(s):
    wrap(s, 'trim', 0.04, *FLOOR_BAND)


def corner_top_dress(s):
    wrap(s, 'trim', 0.05, 0.0, 0.22)
    coping = [(-0.25, -0.22), (-0.03, -0.22), (-0.03, -0.5), (0.29, -0.5), (0.29, 0.04), (-0.25, 0.04)]
    s.prism('concrete', coping, TOP - 0.07, TOP)
    s.quad('wall', [(-0.25, -0.2, 0), (0.05, -0.2, 0), (0.05, -0.2, TOP - 0.07),
                    (-0.25, -0.2, TOP - 0.07)], (0, -1, 0))
    s.quad('wall', [(0.05, -0.2, 0), (0.05, -0.5, 0), (0.05, -0.5, TOP - 0.07),
                    (0.05, -0.2, TOP - 0.07)], (-1, 0, 0))


def roof_tank(kit):
    """roof_prop: a ribbed plastic water tank on a welded steel stand (origin at the centre of
    the stand's base), with its outlet pipe."""
    s = kit.shell()
    legs, deck = 0.55, 0.9
    for x in (-legs, legs):
        for y in (-legs, legs):
            s.box('iron', (x - 0.03, y - 0.03, 0.0), (x + 0.03, y + 0.03, deck), skip='u')
    for z in (0.3, deck - 0.05):
        s.tube('iron', [(-legs, -legs, z), (legs, -legs, z), (legs, legs, z), (-legs, legs, z),
                        (-legs, -legs, z)], radius=0.02)
    s.box('iron', (-0.62, -0.62, deck), (0.62, 0.62, deck + 0.05), skip='')
    circle = [(0.55 * math.cos(2 * math.pi * k / 14), 0.55 * math.sin(2 * math.pi * k / 14))
              for k in range(14)]
    s.prism('tank', circle, deck + 0.05, deck + 1.25, bottom=False)
    top = [(0.5 * x / 0.55, 0.5 * y / 0.55) for x, y in circle]
    s.prism('tank', top, deck + 1.25, deck + 1.33, bottom=False)
    s.prism('tank', [(0.16 * x / 0.55, 0.16 * y / 0.55) for x, y in circle[::2]], deck + 1.33,
            deck + 1.4, bottom=False)
    for z in (deck + 0.4, deck + 0.85):
        s.prism('tank', [(0.56 * x / 0.55, 0.56 * y / 0.55) for x, y in circle], z, z + 0.04,
                top=False, bottom=False)
    s.tube('conduit', [(0.4, 0.3, deck + 0.15), (0.75, 0.3, deck + 0.15), (0.75, 0.3, 0.0)],
           radius=0.025)

    def card(c):
        c.quad('tank', [(-0.6, 0, 0), (0.6, 0, 0), (0.6, 0, deck + 1.4), (-0.6, 0, deck + 1.4)],
               (0, 1, 0))

    kit.module('roof_prop_1_a', 'roof_prop', 1.2, deck + 1.4, s, card=card, plan=[1.24, 1.24])


# ---------------------------------------------------------------------------------------------

def make(a):
    frame = M.painted_metal(color=(0.62, 0.62, 0.60), gloss=0.4, chips=0.35, rust=0.35, grime=0.5,
                            dust=0.3, fade=0.3, seed=61, name='frame_white')
    plinth = M.concrete(color=(0.42, 0.41, 0.39), stains=0.7, cracks=0.4, pits=0.6, seed=62,
                        name='plinth_concrete')
    materials = FacadeMaterials(wall_color=M.hex_color('#de8a4e'), trim_color=M.hex_color('#3f8f86'),
                                frame=frame, plinth=plinth, seed=71)
    materials.add(
        iron=M.painted_metal(color=(0.04, 0.042, 0.042), gloss=0.3, chips=0.35, rust=0.55,
                             grime=0.5, dust=0.25, fade=0.25, seed=63, name='iron_black'),
        alu=M.brushed_metal(color=(0.58, 0.59, 0.60), roughness=0.4, direction='X', grime=0.5,
                            seed=64, name='aluminium'),
        tin=M.corrugated_metal(color=(0.50, 0.51, 0.50), pitch=0.076, depth=0.018,
                               direction='Y', rust=0.6, seed=65, name='tin_canopy'),
        timber=M.wood(color=(0.30, 0.20, 0.12), weathered=0.8, grain_axis='X', seed=66,
                      name='timber_fascia'),
        shutter=M.corrugated_metal(color=(0.20, 0.32, 0.42), pitch=0.08, depth=0.012,
                                   direction='X', painted=True, rust=0.45, seed=67,
                                   name='shutter_blue'),
        door=M.painted_metal(color=(0.36, 0.10, 0.08), gloss=0.35, chips=0.45, rust=0.45,
                             grime=0.5, dust=0.25, fade=0.4, seed=68, name='door_oxide'),
        concrete=M.concrete(color=(0.52, 0.51, 0.48), stains=0.6, cracks=0.3, pits=0.5, seed=69,
                            name='cast_concrete'),
        conduit=M.plastic(color=(0.42, 0.42, 0.40), roughness=0.55, scuffs=0.4, seed=70,
                          name='conduit_grey'),
        tank=M.plastic(color=(0.05, 0.12, 0.30), roughness=0.5, scuffs=0.5, seed=72,
                       name='tank_blue'),
        rebar=M.rusty_metal(rust=0.9, seed=73, name='rebar'),
    )
    kit = Kit(a, materials)

    ground_shop(kit)
    ground_shop_narrow(kit)
    ground_entrance(kit)
    ground_wall(kit)
    ground_door_narrow(kit)
    ground_garage(kit)
    corner(kit, 'corner_ground_a', 'corner_ground', GROUND, 'ground', corner_ground_dress)
    upper_jalousie(kit, 4, 'a', 'glass_a')
    upper_shutters(kit)
    upper_balcony(kit, 'upper_window', 'upper_window_4_c')
    upper_jalousie(kit, 2, 'a', 'glass_a')
    upper_balcony(kit, 'upper_balcony', 'upper_balcony_4_a')
    upper_blank(kit, 4)
    upper_blank(kit, 2)
    corner(kit, 'corner_upper_a', 'corner_upper', UPPER, 'upper', corner_upper_dress)
    top_parapet(kit, 4)
    top_parapet(kit, 2)
    corner(kit, 'corner_top_a', 'corner_top', TOP, 'upper', corner_top_dress)
    roof_tank(kit)
    kit.tiles()
    kit.finish(lod_distance=70.0)
    a.bake(size=1024, bevel_radius=0.01, occlusion_distance=1.0, occlusion_in_color=0.45,
           cage_extrusion=1.7)


def assemble(a):
    Kit.of(a).assemble()
