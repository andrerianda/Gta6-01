"""Kit deco resort: facade modules of the streamlined pastel hotels and apartment blocks of the
beach district of MARAZUL, 3 to 8 storeys, an original design.

One file holds every module (see _facade.py for the module grid and the node layout): each
module is <slot>_<width>_<variant>_lod0 (the detailed bay) and ..._lod1 (a baked card). The
style: smooth stucco, continuous concrete eyebrows over the windows that run from bay to bay
and wrap the corner in a quarter round, three raised speed lines between the windows, steel
casements with horizontal glazing bars set 24 cm back in their reveals, curved balconies with a
solid stucco front and pipe rails, a dark tiled base course, a stepped door surround under a
rounded canopy, and a parapet with a coping and a stepped cornice band. A 2 m vertical centre
feature (ground_wall_2_a, upper_window_2_a, top_parapet_2_a stacked) carries two fins from the
ground ledge to a ziggurat crown 2.2 m above the roof line, framing a tall stair window.

Materials by role: paint_wall (main stucco, baked neutral, tinted per building), paint_trim
(eyebrows, bands, sills, canopies, surrounds), lamp_window_a/b/c (window panes: reflective
glass by day, lit by group at night), atlas (steel frames, base tiles), tile_wall and
tile_roof_flat (repeating sets for the walls and roofs that close a building).

Budget: a whole kit in one file. Every module is its own node with up to four materials, so
the draw-call and triangle ceilings of a single building do not apply; the game batches each
module separately.

Blender axes: Z up; every module faces +Y with its wall on Y = 0.
"""
from lib import materials as M

from _facade import FacadeMaterials, Kit, d_outline, inset_path, wrap_outline

ASSET = {
    'id': 'kit_deco_resort',
    'kind': 'building',
    'atlas': 1024,
    'budget': {'triangles': 16000, 'draws': 200, 'bytes': 1250000},
}

GROUND, UPPER, TOP = 4.2, 3.2, 1.2
REVEAL = 0.24
BROW_Z, BROW_OUT, BROW_THICK = 2.52, 0.55, 0.10
LINES = (1.30, 1.60, 1.90)          # speed lines between the windows of an upper storey
FRIEZE = (3.20, 3.45, 3.70)         # and in the frieze of the ground storey
PARAPET_LINES = (0.52, 0.70)
PLINTH = 0.55
SIGN = dict(forward=(0.0, 1.0, 0.0))


def eyebrow(s, x0, x1):
    """The concrete eyebrow over a row of windows, with a drip step under its root."""
    s.box('trim', (x0, 0.0, BROW_Z), (x1, BROW_OUT, BROW_Z + BROW_THICK), skip='b')
    s.box('trim', (x0, 0.0, BROW_Z - 0.05), (x1, 0.07, BROW_Z), skip='bt')


def lines(s, x0, x1, heights, proud=0.03, height=0.07):
    for z in heights:
        s.box('trim', (x0, 0.0, z), (x1, proud, z + height), skip='b')


def ledge(s, x0, x1):
    """The projecting ledge that ends every ground storey."""
    s.box('trim', (x0, 0.0, GROUND - 0.16), (x1, 0.14, GROUND), skip='b')
    s.box('trim', (x0, 0.0, GROUND - 0.23), (x1, 0.06, GROUND - 0.16), skip='bt')


def upper_window_a(kit):
    """A three-light steel casement under the eyebrow, speed lines on the piers."""
    s = kit.shell()
    opening = (-1.2, 0.9, 1.2, 2.4)
    s.wall('wall', -2.0, 2.0, 0.0, UPPER, [opening])
    s.reveal('wall', opening, REVEAL, sill=False)
    s.window(opening, REVEAL, 'glass_a', columns=3, bars=(1.95,))
    eyebrow(s, -2.0, 2.0)
    lines(s, -2.0, -1.33, LINES)
    lines(s, 1.33, 2.0, LINES)
    kit.module('upper_window_4_a', 'upper_window', 4, UPPER, s, lamp=(*opening, 'glass_a'))


def upper_window_b(kit):
    """Two tall casements with three lights each, a fluted pier between them, one long sill."""
    s = kit.shell()
    opening = (-1.2, 0.6, 1.2, 2.4)
    s.wall('wall', -2.0, 2.0, 0.0, UPPER, [opening])
    s.reveal('wall', opening, REVEAL, sill=False)
    for x0, x1 in ((-1.2, -0.2), (0.2, 1.2)):
        s.window((x0, 0.6, x1, 2.4), REVEAL, 'glass_b', bars=(1.2, 1.8), sill=None)
    s.box('trim', (-0.2, -REVEAL, 0.6), (0.2, -0.06, 2.4), skip='btu')
    for x in (-0.12, 0.0, 0.12):
        s.box('trim', (x - 0.035, -0.06, 0.6), (x + 0.035, 0.02, 2.4), skip='bu')
    s.box('trim', (-1.27, -REVEAL, 0.53), (1.27, 0.08, 0.6), skip='b')
    eyebrow(s, -2.0, 2.0)
    lines(s, -2.0, -1.33, LINES)
    lines(s, 1.33, 2.0, LINES)
    kit.module('upper_window_4_b', 'upper_window', 4, UPPER, s, lamp=(*opening, 'glass_b'))


def upper_balcony_a(kit):
    """French doors onto a curved balcony: slab, solid stucco front, two pipe rails."""
    s = kit.shell()
    opening = (-0.8, 0.12, 0.8, 2.4)
    s.wall('wall', -2.0, 2.0, 0.0, UPPER, [opening])
    s.reveal('wall', opening, REVEAL)
    s.window(opening, REVEAL, 'glass_c', columns=2, bars=(0.95, 1.7), sill=None)
    eyebrow(s, -2.0, 2.0)
    outline = d_outline(1.75, 1.25, 0.55, segments=3)
    s.prism('trim', outline, 0.0, 0.12, skip_edges=(len(outline) - 1,))
    s.band('wall', 'trim', outline, 0.12, 0.60, 0.10)
    rail = inset_path(outline, 0.05)
    for z, radius in ((0.80, 0.02), (1.02, 0.026)):
        s.tube('frame', [(x, y, z) for x, y in rail], radius=radius)
    for x, y in (rail[1], rail[4], (0.0, rail[4][1]), rail[5], rail[8]):
        s.tube('frame', [(x, y, 0.60), (x, y, 1.02)], radius=0.018)
    kit.module('upper_balcony_4_a', 'upper_balcony', 4, UPPER, s, lamp=(*opening, 'glass_c'))


FIN_X, FIN_T, FIN_OUT, CROWN = 0.62, 0.12, 0.65, 2.2


def fins(s, z0, z1, back=0.0):
    """The two fins of the vertical centre feature, 0.65 m proud of the wall."""
    for side in (-1.0, 1.0):
        low, high = sorted((side * FIN_X, side * (FIN_X + FIN_T)))
        s.box('trim', (low, back, z0), (high, FIN_OUT, z1), skip='b' if back == 0.0 else '')


def upper_window_c(kit):
    """The vertical centre feature: a tall stair window with close glazing bars between two
    fins that run unbroken from storey to storey (over ground_wall_2_a, under top_parapet_2_a),
    speed lines in the spandrels, the eyebrows of the next bays dying into the fins."""
    s = kit.shell()
    opening = (-0.42, 0.35, 0.42, 2.85)
    s.wall('wall', -1.0, 1.0, 0.0, UPPER, [opening])
    s.reveal('wall', opening, REVEAL)
    s.window(opening, REVEAL, 'glass_b', bars=(0.85, 1.35, 1.85, 2.35), sill=None)
    fins(s, 0.0, UPPER)
    for side in (-1.0, 1.0):
        low, high = sorted((side * (FIN_X + FIN_T), side * 1.0))
        eyebrow(s, low, high)
    lines(s, -FIN_X, FIN_X, (0.08, 0.21, 2.93, 3.06), height=0.06)
    kit.module('upper_window_2_a', 'upper_window', 2, UPPER, s, lamp=(*opening, 'glass_b'))


def ground_wall_b(kit):
    """The narrow ground bay at the foot of the vertical centre feature."""
    s = kit.shell('ground')
    opening = (-0.42, 0.9, 0.42, 2.4)
    s.wall('wall', -1.0, 1.0, 0.0, GROUND, [opening])
    s.reveal('wall', opening, REVEAL, sill=False)
    s.window(opening, REVEAL, 'glass_b', bars=(1.65,))
    eyebrow(s, -1.0, 1.0)
    s.box('plinth', (-1.0, 0.0, 0.0), (1.0, 0.04, PLINTH), skip='b')
    lines(s, -1.0, 1.0, FRIEZE, height=0.08)
    ledge(s, -1.0, 1.0)
    kit.module('ground_wall_2_a', 'ground_wall', 2, GROUND, s, lamp=(*opening, 'glass_b'))


def top_parapet_b(kit):
    """The crown of the vertical centre feature: the parapet continues, the fins rise to 2.2 m
    and frame a panel that steps up in three tiers (a ziggurat above the roof line)."""
    s = kit.shell()
    s.wall('wall', -1.0, 1.0, 0.0, TOP)
    s.box('trim', (-1.0, 0.0, 0.0), (1.0, 0.10, 0.14), skip='b')
    s.box('trim', (-1.0, 0.0, 0.14), (1.0, 0.05, 0.20), skip='bu')
    lines(s, -1.0, 1.0, PARAPET_LINES)
    for side in (-1.0, 1.0):
        low, high = sorted((side * (FIN_X + FIN_T), side * 1.0))
        s.box('trim', (low, -0.28, 1.06), (high, 0.07, TOP), skip='')
    s.quad('wall', [(-1.0, -0.25, 0.0), (1.0, -0.25, 0.0), (1.0, -0.25, TOP), (-1.0, -0.25, TOP)],
           (0, -1, 0))
    s.box('wall', (-FIN_X, -0.25, TOP), (FIN_X, 0.0, 1.75), skip='u')
    lines(s, -FIN_X, FIN_X, (1.32, 1.47), height=0.06)
    s.box('trim', (-0.40, -0.25, 1.75), (0.40, 0.05, 1.97), skip='u')
    s.box('trim', (-0.18, -0.25, 1.97), (0.18, 0.09, CROWN - 0.04), skip='u')
    fins(s, 0.0, CROWN, back=-0.25)

    def card(c):
        c.wall('wall', -1.0, 1.0, 0.0, TOP)
        c.quad('wall', [(-0.74, 0, TOP), (0.74, 0, TOP), (0.74, 0, CROWN), (-0.74, 0, CROWN)],
               (0, 1, 0))

    kit.module('top_parapet_2_a', 'top_parapet', 2, TOP, s, card=card, crown=CROWN)


def ground_shop_wide_a(kit):
    """An 8 m shopfront: two display windows over tiled risers either side of a recessed glazed
    double door, one long canopy and one long blank fascia."""
    s = kit.shell('ground')
    left, right, door = (-3.6, PLINTH, -0.95, 2.75), (0.95, PLINTH, 3.6, 2.75), (-0.7, 0.0, 0.7, 2.75)
    s.wall('wall', -4.0, 4.0, 0.0, GROUND, [left, right, door])
    for display in (left, right):
        s.reveal('wall', display, 0.22, sill=False)
        s.window(display, 0.22, 'glass_c', columns=3, bars=(2.3,), sill='frame')
    s.reveal('wall', door, 0.5)
    s.window(door, 0.5, 'glass_c', columns=2, bars=(2.2,), sill=None, frame_width=0.09)
    for x in (-0.12, 0.12):
        s.tube('frame', [(x, -0.38, 0.95), (x, -0.38, 1.40)], radius=0.016)
    s.box('plinth', (-4.0, 0.0, 0.0), (-0.7, 0.04, PLINTH), skip='b')
    s.box('plinth', (0.7, 0.0, 0.0), (4.0, 0.04, PLINTH), skip='b')
    s.box('trim', (-4.0, 0.0, 2.87), (4.0, 1.15, 2.99), skip='b')
    s.box('trim', (-4.0, 0.0, 2.80), (4.0, 0.08, 2.87), skip='bt')
    s.box('trim', (-3.8, 0.0, 3.15), (3.8, 0.06, 3.85), skip='b')
    ledge(s, -4.0, 4.0)
    name = 'anchor_sign_ground_shop_wide_8_a'
    kit.a.add_anchor(name, (0.0, 0.07, 3.50), width=7.4, height=0.6, **SIGN)
    kit.module('ground_shop_wide_8_a', 'ground_shop_wide', 8, GROUND, s,
               lamp=(-3.6, 0.3, 3.6, 2.75, 'glass_c'), anchors=[name])


def ground_garage_a(kit):
    """A garage bay: a ribbed sectional door 15 cm back in a plain reveal under a cast lintel,
    the base course on the piers, the frieze and the ledge above."""
    s = kit.shell('ground')
    opening = (-1.4, 0.0, 1.4, 2.6)
    s.wall('wall', -2.0, 2.0, 0.0, GROUND, [opening])
    s.reveal('wall', opening, 0.15, sill=False)
    s.quad('frame', [(-1.4, -0.15, 0.0), (1.4, -0.15, 0.0), (1.4, -0.15, 2.6), (-1.4, -0.15, 2.6)],
           (0, 1, 0))
    for index in range(1, 5):
        z = 2.6 * index / 5
        s.box('frame', (-1.4, -0.15, z - 0.025), (1.4, -0.12, z + 0.025), skip='blr')
    s.box('trim', (-1.6, 0.0, 2.6), (1.6, 0.06, 2.85), skip='b')
    for low, high in ((-2.0, -1.4), (1.4, 2.0)):
        s.box('plinth', (low, 0.0, 0.0), (high, 0.04, PLINTH), skip='b')
    lines(s, -2.0, 2.0, FRIEZE, height=0.08)
    ledge(s, -2.0, 2.0)
    kit.module('ground_garage_4_a', 'ground_garage', 4, GROUND, s)


def upper_blank(kit, width):
    """A blank bay (stair walls, party-wall ends, odd frontages): the eyebrow band and the
    speed lines run on so the storey's bands stay continuous; the 4 m bay has a downpipe."""
    s = kit.shell()
    half = width / 2
    s.wall('wall', -half, half, 0.0, UPPER)
    eyebrow(s, -half, half)
    lines(s, -half, half, LINES)
    if width >= 4:
        s.tube('frame', [(1.55, 0.06, 0.0), (1.55, 0.06, UPPER)], radius=0.05)
    kit.module(f'upper_blank_{width}_a', 'upper_blank', width, UPPER, s)


def top_parapet_a(kit):
    """The parapet: a stepped cornice band at the roof line, two speed lines, a coping."""
    s = kit.shell()
    s.wall('wall', -2.0, 2.0, 0.0, TOP)
    s.box('trim', (-2.0, 0.0, 0.0), (2.0, 0.10, 0.14), skip='b')
    s.box('trim', (-2.0, 0.0, 0.14), (2.0, 0.05, 0.20), skip='bu')
    lines(s, -2.0, 2.0, PARAPET_LINES)
    s.box('trim', (-2.0, -0.28, 1.06), (2.0, 0.07, TOP), skip='')
    s.quad('wall', [(-2.0, -0.25, 0.0), (2.0, -0.25, 0.0), (2.0, -0.25, 1.06), (-2.0, -0.25, 1.06)],
           (0, -1, 0))
    kit.module('top_parapet_4_a', 'top_parapet', 4, TOP, s)


def ground_shop_a(kit):
    """A shopfront: display window over a tiled stall riser, a recessed glazed door, a flat
    canopy and a blank fascia band for the sign."""
    s = kit.shell('ground')
    display, door = (-1.6, PLINTH, 0.45, 2.75), (0.65, 0.0, 1.6, 2.75)
    s.wall('wall', -2.0, 2.0, 0.0, GROUND, [display, door])
    s.reveal('wall', display, 0.22, sill=False)
    s.reveal('wall', door, 0.5)
    s.window(display, 0.22, 'glass_c', columns=2, bars=(2.3,), sill='frame')
    s.window(door, 0.5, 'glass_c', bars=(1.0, 2.2), sill=None, frame_width=0.09)
    s.box('frame', (0.74, -0.47, 0.09), (1.51, -0.45, 0.34), skip='b')
    s.tube('frame', [(1.38, -0.38, 0.95), (1.38, -0.38, 1.40)], radius=0.016)
    s.box('plinth', (-2.0, 0.0, 0.0), (0.65, 0.04, PLINTH), skip='b')
    s.box('plinth', (1.6, 0.0, 0.0), (2.0, 0.04, PLINTH), skip='b')
    s.box('trim', (-2.0, 0.0, 2.87), (2.0, 1.15, 2.99), skip='b')
    s.box('trim', (-2.0, 0.0, 2.80), (2.0, 0.08, 2.87), skip='bt')
    s.box('trim', (-1.8, 0.0, 3.15), (1.8, 0.06, 3.85), skip='b')
    ledge(s, -2.0, 2.0)
    kit.a.add_anchor('anchor_sign_ground_shop_4_a', (0.0, 0.07, 3.50), width=3.4, height=0.6, **SIGN)
    kit.module('ground_shop_4_a', 'ground_shop', 4, GROUND, s, lamp=(-1.6, 0.3, 1.6, 2.75, 'glass_c'),
               anchors=['anchor_sign_ground_shop_4_a'])


def ground_entrance_a(kit):
    """The main door: glazed double doors and a transom light deep in a stepped surround,
    under a rounded canopy, with a wall lamp on each pier."""
    s = kit.shell('ground')
    opening = (-1.0, 0.0, 1.0, 3.0)
    s.wall('wall', -2.0, 2.0, 0.0, GROUND, [opening])
    s.reveal('wall', opening, 0.55)
    s.window((-1.0, 0.0, 1.0, 2.35), 0.55, 'glass_c', columns=2, bars=(1.05,), sill=None,
             frame_width=0.09)
    s.window((-1.0, 2.35, 1.0, 3.0), 0.55, 'glass_c', columns=3, sill=None)
    for side in (-1.0, 1.0):
        s.tube('frame', [(side * 0.12, -0.44, 0.95), (side * 0.12, -0.44, 1.45)], radius=0.018)
        inner, outer, far = sorted((side * 1.0, side * 1.3)), sorted((side * 1.3, side * 1.55)), side
        s.box('trim', (inner[0], 0.0, 0.0), (inner[1], 0.12, 3.3), skip='b')
        s.box('trim', (outer[0], 0.0, 0.0), (outer[1], 0.06, 3.1), skip='b')
        low, high = sorted((far * 1.55, far * 2.0))
        s.box('plinth', (low, 0.0, 0.0), (high, 0.04, PLINTH), skip='b')
        s.box('frame', (far * 1.77 - 0.07, 0.0, 2.25), (far * 1.77 + 0.07, 0.13, 2.62), skip='b')
        name = 'anchor_light_ground_entrance_4_a_' + ('l' if side < 0 else 'r')
        kit.a.add_anchor(name, (far * 1.77, 0.2, 2.45), forward=(0.0, 1.0, 0.0), light='point',
                         color=[1.0, 0.82, 0.58], range=7.0)
    s.box('trim', (-1.0, 0.0, 3.0), (1.0, 0.12, 3.3), skip='blr')
    canopy = d_outline(1.55, 1.35, 0.7, segments=4)
    s.prism('trim', canopy, 3.3, 3.42, skip_edges=(len(canopy) - 1,))
    ledge(s, -2.0, 2.0)
    kit.a.add_anchor('anchor_sign_ground_entrance_4_a', (0.0, 0.03, 3.72), width=2.6, height=0.46,
                     **SIGN)
    kit.module('ground_entrance_4_a', 'ground_entrance', 4, GROUND, s,
               lamp=(-0.9, 0.1, 0.9, 2.95, 'glass_c'),
               anchors=['anchor_sign_ground_entrance_4_a', 'anchor_light_ground_entrance_4_a_l',
                        'anchor_light_ground_entrance_4_a_r'])


def ground_wall_a(kit):
    """A windowed ground storey: the upper window over the base course, speed lines in the
    frieze."""
    s = kit.shell('ground')
    opening = (-1.2, 0.9, 1.2, 2.4)
    s.wall('wall', -2.0, 2.0, 0.0, GROUND, [opening])
    s.reveal('wall', opening, REVEAL, sill=False)
    s.window(opening, REVEAL, 'glass_a', columns=3, bars=(1.95,))
    eyebrow(s, -2.0, 2.0)
    s.box('plinth', (-2.0, 0.0, 0.0), (2.0, 0.04, PLINTH), skip='b')
    lines(s, -2.0, 2.0, FRIEZE, height=0.08)
    ledge(s, -2.0, 2.0)
    kit.module('ground_wall_4_a', 'ground_wall', 4, GROUND, s, lamp=(*opening, 'glass_a'))


def corner(kit, name, slot, height, storey, dress):
    """A square corner post, 0.5 m in plan, with street faces on Y = 0 and X = +0.25; `dress`
    adds the bands that continue from the bays on both sides around the corner."""
    def faces(s):
        s.quad('wall', [(-0.25, 0, 0), (0.25, 0, 0), (0.25, 0, height), (-0.25, 0, height)], (0, 1, 0))
        s.quad('wall', [(0.25, 0, 0), (0.25, -0.5, 0), (0.25, -0.5, height), (0.25, 0, height)],
               (1, 0, 0))

    s = kit.shell(storey)
    faces(s)
    dress(s)
    kit.module(name, slot, 0.5, height, s, card=faces, plan=[0.5, 0.5])


def wrap(s, key, projection, z0, z1, segments=0):
    outline = wrap_outline(projection, segments)
    s.prism(key, outline, z0, z1, skip_edges=(0, len(outline) - 1))


def corner_upper_dress(s):
    wrap(s, 'trim', BROW_OUT, BROW_Z, BROW_Z + BROW_THICK, segments=5)
    wrap(s, 'trim', 0.07, BROW_Z - 0.05, BROW_Z)
    for z in LINES:
        wrap(s, 'trim', 0.03, z, z + 0.07)


def corner_ground_dress(s):
    wrap(s, 'plinth', 0.04, 0.0, PLINTH)
    for z in FRIEZE:
        wrap(s, 'trim', 0.03, z, z + 0.08)
    wrap(s, 'trim', 0.14, GROUND - 0.16, GROUND)
    wrap(s, 'trim', 0.06, GROUND - 0.23, GROUND - 0.16)


def corner_top_dress(s):
    wrap(s, 'trim', 0.10, 0.0, 0.14)
    wrap(s, 'trim', 0.05, 0.14, 0.20)
    for z in PARAPET_LINES:
        wrap(s, 'trim', 0.03, z, z + 0.07)
    coping = [(-0.25, -0.28), (-0.03, -0.28), (-0.03, -0.5), (0.32, -0.5), (0.32, 0.07), (-0.25, 0.07)]
    s.prism('trim', coping, 1.06, TOP)
    s.quad('wall', [(-0.25, -0.25, 0), (0.0, -0.25, 0), (0.0, -0.25, 1.06), (-0.25, -0.25, 1.06)],
           (0, -1, 0))
    s.quad('wall', [(0.0, -0.25, 0), (0.0, -0.5, 0), (0.0, -0.5, 1.06), (0.0, -0.25, 1.06)], (-1, 0, 0))


def make(a):
    frame = M.painted_metal(color=(0.60, 0.61, 0.60), gloss=0.5, chips=0.25, rust=0.2, grime=0.4,
                            dust=0.2, fade=0.2, seed=21, name='frame_enamel')
    plinth = M.tiles(color=(0.085, 0.12, 0.125), size=0.275, gloss=0.6, variation=0.4, stains=0.4,
                     seed=5, name='plinth_tiles')
    materials = FacadeMaterials(wall_color=M.hex_color('#f1c3ae'), trim_color=M.hex_color('#f4eee0'),
                                frame=frame, plinth=plinth, seed=31)
    kit = Kit(a, materials)

    ground_shop_a(kit)
    ground_entrance_a(kit)
    ground_wall_a(kit)
    corner(kit, 'corner_ground_a', 'corner_ground', GROUND, 'ground', corner_ground_dress)
    upper_window_a(kit)
    upper_window_b(kit)
    upper_balcony_a(kit)
    top_parapet_a(kit)
    ground_wall_b(kit)
    upper_window_c(kit)
    top_parapet_b(kit)
    ground_shop_wide_a(kit)
    ground_garage_a(kit)
    upper_blank(kit, 4)
    upper_blank(kit, 2)
    corner(kit, 'corner_upper_a', 'corner_upper', UPPER, 'upper', corner_upper_dress)
    corner(kit, 'corner_top_a', 'corner_top', TOP, 'upper', corner_top_dress)
    kit.tiles()
    kit.finish(lod_distance=70.0)

    # Facades live on contact shadow: occlusion reaches a whole eyebrow's depth and more of it
    # goes into the colour than on a prop. The cards look at their bay from in front of the
    # deepest projection (1.6 m by the module grid).
    a.bake(size=1024, bevel_radius=0.012, occlusion_distance=1.1, occlusion_in_color=0.45,
           cage_extrusion=1.7)


def assemble(a):
    Kit.of(a).assemble()
