"""Kit residential: facade modules of the two- and three-storey stucco apartment blocks and
houses of the residential hills and the Barrio edges, an original design.

One file holds every module (see _facade.py for the module grid and the node layout): each
module is <slot>_<width>_<variant>_lod0 (the detailed bay) and ..._lod1 (a baked card). The
style: plain trowelled render over a dark-rendered plinth, a slim painted band at every floor
line; small sash windows in white frames with sills and lintels; sliding glass doors in dark
frames onto balconies with fronts of horizontal timber slats between dark steel posts; roll-up
garage doors in steel housings at street level (one half open on a dark garage); a recessed
front door under a slatted timber canopy; through-wall air-conditioning units on brackets,
downpipes, conduit and meter boxes; a parapet with a coping and a scupper; a roof pergola of
dark posts and a timber lattice; a condenser for the roof.

Wear is baked into the render: rain streaks under the sills and under every floor band, damp
dark bases at the foot of the ground storey, patched render in slightly fresher paint, faded
paint in broad clouds, hairline cracks.

The ground storey is 4.2 m like the other kits, because the assembler lays every ground storey
at that height (buildingMeshAssembly.js): the roll-up doors are tall, as in a garage-under
block. Upper variants are ordered so that the 4 m and the 2 m lists agree for the variant index
the assembler picks per building: 4 m [a sash pair, b slatted balcony, c wide window and timber
screen], 2 m [a sash window].

Materials by role: paint_wall (render, baked neutral, tinted per building), paint_trim (bands,
lintels, sills, canopy fascia, tinted per building), lamp_window_a (sash windows), lamp_window_b
(sliding doors), lamp_window_c (wide windows, transom), atlas (frames, steel, timber, garage
doors, air conditioners, pipes, concrete), tile_wall and tile_roof_flat.

Budget: a whole kit in one file. Every module is its own node with up to eight materials, so
the draw-call and triangle ceilings of a single building do not apply; the game merges each
sector's modules per material.

Blender axes: Z up; every module faces +Y with its wall on Y = 0.
"""
import bpy

from lib import materials as M
from lib.materials import masonry, wear

from _facade import FacadeMaterials, Kit, wrap_outline

ASSET = {
    'id': 'kit_residential',
    'kind': 'building',
    'atlas': 1024,
    'budget': {'triangles': 16000, 'draws': 220, 'bytes': 1250000},
}

GROUND, UPPER, TOP = 4.2, 3.2, 1.2
PLINTH = 0.3                       # dark render at the foot of the ground storey
BAND = (4.05, 4.2)                 # the floor band at the top of the ground storey
FLOOR_BAND = (0.0, 0.15)           # and at the foot of every upper storey
SILL_UP, SILL_GROUND = 0.95, 1.15  # every window sill of the kit, for the rain streaks
REVEAL = 0.12
SIGN = dict(forward=(0.0, 1.0, 0.0))


# ---------------------------------------------------------------------------------------------
# The render, with its weathering
# ---------------------------------------------------------------------------------------------

def render(name, color, seed, ground=False, smooth=False):
    """Trowelled render, baked neutral (paint node), with the wear of an older apartment block:
    faded paint in broad clouds, patches of fresher render standing a hair proud, hairline
    cracks, rain streaks below the sill line of the kit's windows and below every floor band,
    and on the ground storey a damp dark base with a tide line."""
    graph = M.Graph(name, seed)
    paint = graph.paint_color(color)
    lumps = graph.noise(scale=38.0, detail=3.0, roughness=0.6)
    trowel = graph.noise(scale=6.0, detail=4.0, roughness=0.55, distortion=0.6)
    cloud = graph.noise(scale=0.7, detail=4.0)
    base = graph.hsv(paint, value=graph.remap(cloud, 0.2, 0.8, 0.88, 1.05),
                     saturation=graph.remap(cloud, 0.2, 0.8, 1.05, 0.82))
    relief = graph.add(graph.mul(lumps, 0.6), graph.mul(trowel, 0.4))
    base = graph.hsv(base, value=graph.remap(relief, 0.3, 0.7, 0.94, 1.04))
    texture = 0.2 if smooth else 0.5
    height = graph.add(graph.mul(lumps, texture), graph.mul(trowel, 0.8 * texture))
    coat = wear.Coat(graph, base, roughness=graph.remap(lumps, 0.2, 0.8, 0.8, 0.95), height=height)
    if not smooth:
        patch = graph.mask(graph.noise(scale=0.55, detail=2.0, roughness=0.45), 0.67, 0.012)
        coat.cover(patch, color=graph.hsv(paint, value=1.03, saturation=0.9), height=0.4)
        crack_mask = masonry._cracks(graph, scale=1.4, width=0.007, density=0.3)
        coat.cover(crack_mask, color=(0.30, 0.28, 0.25), height=-1.5)
    x, z = graph.axis('X'), graph.axis('Z')
    runs = graph.noise(scale=5.0, detail=5.0, stretch=(1.0, 1.0, 0.045), distortion=0.15)
    streak = graph.mask(runs, 0.55, 0.13)
    sill = SILL_GROUND if ground else SILL_UP
    under_sill = graph.mul(graph.remap(z, sill - 1.1, sill - 0.04, 0.0, 1.0),
                           graph.remap(z, sill - 0.04, sill, 1.0, 0.0))
    under_sill = graph.mul(under_sill, graph.remap(graph.mul(x, x), 1.1, 1.7, 1.0, 0.0))
    top = BAND[0] if ground else UPPER
    under_band = graph.remap(z, top - 0.9, top - 0.02, 0.0, 0.75)
    coat.tint(graph.mul(streak, graph.maximum(under_sill, under_band)), (0.43, 0.40, 0.35),
              strength=0.8)
    coat.tint(graph.mul(graph.mask(runs, 0.5, 0.2), graph.remap(cloud, 0.3, 0.8)),
              (0.55, 0.52, 0.47), strength=0.35)
    wear.grime(coat, amount=0.45)
    wear.sun_fade(coat, amount=0.3)
    if ground:
        damp = graph.remap(z, 0.0, 0.75, 1.0, 0.0, smooth=True)
        tide = graph.noise(scale=3.0, detail=4.0, roughness=0.6)
        damp = graph.mask(graph.add(damp, graph.mul(tide, 0.35)), 0.62, 0.05)
        coat.tint(damp, (0.62, 0.58, 0.52), strength=0.9)
        coat.cover(graph.mul(damp, 0.6), roughness=0.97)
        wear.ground_splash(coat, amount=0.35, height=0.4, color=(0.33, 0.30, 0.26))
    return coat.finish(bump_strength=0.8, bump_distance=0.008)


# ---------------------------------------------------------------------------------------------
# Shared pieces
# ---------------------------------------------------------------------------------------------

def ground_frame(s, half, openings):
    """The ground storey's render, its dark plinth and the floor band at its top."""
    s.wall('wall', -half, half, 0.0, GROUND, openings)
    low = [o for o in openings if o[1] < PLINTH]
    xs = sorted({-half, half, *[o[0] for o in low], *[o[2] for o in low]})
    for x0, x1 in zip(xs, xs[1:]):
        if any(o[0] <= x0 and x1 <= o[2] for o in low):
            continue
        s.box('plinth', (x0, 0.0, 0.0), (x1, 0.02, PLINTH), skip='blru')
    s.box('trim', (-half, 0.0, BAND[0]), (half, 0.035, BAND[1]), skip='blr')


def upper_frame(s, half, openings):
    s.box('trim', (-half, 0.0, FLOOR_BAND[0]), (half, 0.035, FLOOR_BAND[1]), skip='blr')
    s.wall('wall', -half, half, FLOOR_BAND[1], UPPER, openings)


def sash(s, opening, glass, depth=REVEAL):
    """A small sash window in a white frame: a meeting rail a little above the middle, a
    projecting sill and a shallow lintel band."""
    x0, z0, x1, z1 = opening
    s.reveal('wall', opening, depth, sill=False)
    s.window(opening, depth, glass, bars=(z0 + (z1 - z0) * 0.54,), sill='trim', frame_width=0.06)
    s.box('trim', (x0 - 0.06, 0.0, z1), (x1 + 0.06, 0.03, z1 + 0.12), skip='b')


def ac_unit(s, x, z, y0=0.0, width=0.78, height=0.52, deep=0.3, brackets=True):
    """A through-wall or split air-conditioning unit: a pale casing, a dark fan grille, louvres,
    steel brackets under it and a condensate pipe dribbling down the wall."""
    x0, x1 = x - width / 2, x + width / 2
    s.box('alu', (x0, y0 + 0.02, z), (x1, y0 + deep, z + height), skip='b')
    s.box('vent', (x0 + 0.05, y0 + deep, z + 0.06), (x + 0.1, y0 + deep + 0.012,
                                                      z + height - 0.06), skip='b')
    for index in range(3):
        zz = z + 0.12 + index * (height - 0.24) / 2
        s.box('vent', (x + 0.16, y0 + deep, zz), (x1 - 0.05, y0 + deep + 0.01, zz + 0.04), skip='b')
    if brackets:
        for bx in (x0 + 0.1, x1 - 0.1):
            s.box('post', (bx - 0.02, 0.0, z - 0.05), (bx + 0.02, y0 + deep + 0.03, z), skip='b')
    s.tube('pipe', [(x1 - 0.08, y0 + 0.08, z), (x1 - 0.08, 0.03, z - 0.08),
                    (x1 - 0.08, 0.03, max(0.05, z - 0.75))], radius=0.008, segments=3)


def downpipe(s, x, z0, z1, hopper=False):
    """A grey downpipe on brackets standing off the wall, with a hopper head at the top."""
    s.tube('pipe', [(x, 0.08, z0), (x, 0.08, z1)], radius=0.042, segments=6)
    z = z0 + 0.4
    while z < z1 - 0.2:
        s.box('pipe', (x - 0.05, 0.0, z), (x + 0.05, 0.04, z + 0.05), skip='b')
        z += 1.6
    if hopper:
        s.box('pipe', (x - 0.12, 0.0, z1 - 0.3), (x + 0.12, 0.2, z1 - 0.05), skip='b')


def conduit(s, path, box_at=None):
    """Exposed grey conduit clipped to the wall, with a junction or meter box."""
    s.tube('pipe', path, radius=0.016, segments=4)
    if box_at:
        x, z, w, h = box_at
        s.box('alu', (x - w / 2, 0.0, z - h / 2), (x + w / 2, 0.12, z + h / 2), skip='b')


def slat_front(s, x0, x1, y, z0, z1, along='X', pitch=0.12, slat=0.085):
    """Horizontal timber slats between z0 and z1 along a balcony edge (along X at depth y, or
    along Y at x = y for the returns)."""
    z = z0
    while z + slat <= z1 + 1e-6:
        if along == 'X':
            s.box('slat', (x0, y - 0.025, z), (x1, y + 0.025, z + slat), skip='lr')
        else:
            s.box('slat', (y - 0.025, x0, z), (y + 0.025, x1, z + slat), skip='fb')
        z += pitch


def post(s, x, y, z0, z1, size=0.08):
    s.box('post', (x - size / 2, y - size / 2, z0), (x + size / 2, y + size / 2, z1), skip='u')


def pergola(s, x0, x1, y_front, y_back, z0, height):
    """A pergola of dark steel posts carrying two timber beams, rafters and a lattice of laths."""
    top = z0 + height
    for x in (x0 + 0.05, x1 - 0.05):
        for y in (y_front, y_back):
            post(s, x, y, z0, top - 0.18, size=0.09)
    for y in (y_front, y_back):
        s.box('slat', (x0 - 0.12, y - 0.05, top - 0.2), (x1 + 0.12, y + 0.05, top), skip='')
    count = int((x1 - x0) / 0.36)
    for index in range(count + 1):
        x = x0 + (x1 - x0) * index / count
        s.box('slat', (x - 0.025, y_back - 0.25, top), (x + 0.025, y_front + 0.25, top + 0.12),
              skip='')
    y = y_back
    while y <= y_front + 1e-6:
        s.box('slat', (x0 - 0.05, y - 0.02, top + 0.12), (x1 + 0.05, y + 0.02, top + 0.16), skip='u')
        y += 0.3


def module(kit, name, slot, width, height, s, sign=None, light=None, **info):
    """Registers a module with its sign anchor ((location, width, height)) and its wall lamp
    (location): a small lamp box is drawn on the wall behind the lamp anchor."""
    anchors = list(info.pop('anchors', []))
    if sign:
        anchor = f'anchor_sign_{name}'
        location, w, h = sign
        kit.a.add_anchor(anchor, location, width=w, height=h, **SIGN)
        anchors.append(anchor)
    if light:
        anchor = f'anchor_light_{name}'
        x, z = light
        s.box('frame', (x - 0.07, 0.0, z - 0.11), (x + 0.07, 0.11, z + 0.11), skip='b')
        s.box('vent', (x - 0.05, 0.11, z - 0.07), (x + 0.05, 0.12, z + 0.07), skip='b')
        kit.a.add_anchor(anchor, (x, 0.14, z), forward=(0.0, 1.0, 0.0), light='point',
                         color=[1.0, 0.86, 0.66], range=6.0)
        anchors.append(anchor)
    if anchors:
        info['anchors'] = anchors
    return kit.module(name, slot, width, height, s, **info)


# ---------------------------------------------------------------------------------------------
# Ground storey
# ---------------------------------------------------------------------------------------------

def roller_door(s, opening, low):
    """A roll-up steel door in its opening, its bottom rail at `low`, guide rails and a housing."""
    x0, z0, x1, z1 = opening
    s.quad('roller', [(x0, -0.08, low), (x1, -0.08, low), (x1, -0.08, z1), (x0, -0.08, z1)],
           (0, 1, 0))
    s.box('post', (x0, -0.08, low), (x1, -0.04, low + 0.06), skip='blr')
    for x in (x0, x1 - 0.06):
        s.box('post', (x, -0.1, z0), (x + 0.06, -0.02, z1), skip='btu')
    s.box('roller', (x0 - 0.12, 0.0, z1), (x1 + 0.12, 0.26, z1 + 0.32), skip='b')


def ground_garage(kit, variant, low):
    """A garage bay under the flats: a roll-up door (variant b half open on a dark garage with
    a shelf), a wall lamp, a downpipe at the side."""
    name = f'ground_garage_4_{variant}'
    s = kit.shell('ground')
    opening = (-1.55, 0.0, 1.45, 2.9)
    ground_frame(s, 2.0, [opening])
    depth = 0.1 if low <= 0.0 else 0.7
    s.reveal('wall', opening, depth, sill=False)
    if low > 0.0:
        s.quad('interior', [(-1.55, -0.7, 0.0), (1.45, -0.7, 0.0), (1.45, -0.7, low + 0.4),
                            (-1.55, -0.7, low + 0.4)], (0, 1, 0))
        s.quad('plinth', [(-1.55, 0.0, 0.0), (1.45, 0.0, 0.0), (1.45, -0.7, 0.0),
                          (-1.55, -0.7, 0.0)], (0, 0, 1))
        s.box('post', (-1.3, -0.68, 0.0), (-0.3, -0.4, 1.5), skip='b')
        s.box('slat', (0.4, -0.66, 0.0), (0.9, -0.3, 0.45), skip='b')
    roller_door(s, opening, low)
    downpipe(s, -1.88, 0.0, GROUND, hopper=False)
    module(kit, name, 'ground_garage', 4, GROUND, s, light=(1.75, 2.7), projects=0.26)


def ground_entrance(kit):
    """The front door: a panelled timber door with a transom light, recessed in a deep reveal
    on a concrete step, under a slatted timber canopy on steel brackets; a wall lamp, a
    letter box, a small sash window beside it."""
    name = 'ground_entrance_4_a'
    s = kit.shell('ground')
    door, transom, window = (-1.0, 0.0, 0.0, 2.25), (-1.0, 2.25, 0.0, 2.7), (0.6, 1.15, 1.4, 2.55)
    recess = (-1.0, 0.0, 0.0, 2.7)
    ground_frame(s, 2.0, [recess, window])
    s.reveal('wall', recess, 0.35, sill=False)
    s.quad('door', [(-1.0, -0.35, 0.0), (0.0, -0.35, 0.0), (0.0, -0.35, 2.25), (-1.0, -0.35, 2.25)],
           (0, 1, 0))
    for z0, z1 in ((0.15, 1.0), (1.15, 2.1)):
        s.box('door', (-0.88, -0.35, z0), (-0.12, -0.32, z1), skip='b')
    s.box('frame', (-0.2, -0.32, 1.0), (-0.12, -0.27, 1.1), skip='b')
    s.window(transom, 0.35, 'glass_c', columns=2, sill=None, frame_width=0.06)
    s.box('concrete', (-1.25, 0.0, 0.0), (0.25, 0.4, 0.16), skip='b')
    s.box('concrete', (-1.0, -0.35, 0.0), (0.0, 0.0, 0.16), skip='blrb')
    s.box('trim', (-1.45, 0.0, 2.95), (0.45, 0.95, 3.02), skip='b')
    s.box('slat', (-1.45, 0.88, 2.82), (0.45, 0.95, 2.95), skip='b')
    for x in (-1.3, 0.3):
        s.box('post', (x - 0.02, 0.0, 2.55), (x + 0.02, 0.85, 2.82), skip='b')
    s.box('post', (0.5, 0.0, 1.0), (0.78, 0.1, 1.35), skip='b')
    sash(s, window, 'glass_a')
    conduit(s, [(1.75, 0.03, 0.9), (1.75, 0.03, 4.0)], box_at=(1.75, 1.3, 0.3, 0.42))
    downpipe(s, 1.92, 0.0, GROUND)
    module(kit, name, 'ground_entrance', 4, GROUND, s, sign=((-0.5, 0.02, 3.3), 0.6, 0.25),
           light=(0.15, 2.3), lamp=(-1.0, 2.25, 0.0, 2.7, 'glass_c'), projects=0.95)


def ground_wall(kit):
    """A ground-floor flat: two sash windows, an air-conditioner under one, a meter box with
    conduit, a downpipe."""
    name = 'ground_wall_4_a'
    s = kit.shell('ground')
    windows = [(-1.2, SILL_GROUND, -0.4, 2.55), (0.4, SILL_GROUND, 1.2, 2.55)]
    ground_frame(s, 2.0, windows)
    for opening in windows:
        sash(s, opening, 'glass_a')
    ac_unit(s, -0.8, 0.4)
    conduit(s, [(1.6, 0.03, 1.2), (1.6, 0.03, 4.0), (-2.0, 0.03, 4.0)], box_at=(1.6, 1.0, 0.32, 0.45))
    downpipe(s, 1.92, 0.0, GROUND)
    module(kit, name, 'ground_wall', 4, GROUND, s, lamp=(-1.2, SILL_GROUND, 1.2, 2.55, 'glass_a'),
           projects=0.33)


def ground_wall_narrow(kit):
    """A narrow bay: one sash window over a utility meter cabinet."""
    name = 'ground_wall_2_a'
    s = kit.shell('ground')
    window = (-0.4, SILL_GROUND, 0.4, 2.55)
    ground_frame(s, 1.0, [window])
    sash(s, window, 'glass_b')
    s.box('alu', (0.48, 0.0, 0.35), (0.9, 0.2, 0.95), skip='b')
    conduit(s, [(0.69, 0.03, 0.95), (0.69, 0.03, 4.0)])
    module(kit, name, 'ground_wall', 2, GROUND, s, lamp=(*window, 'glass_b'), projects=0.2)


# ---------------------------------------------------------------------------------------------
# Upper storeys
# ---------------------------------------------------------------------------------------------

def upper_sash(kit, width, variant):
    """Sash windows: a pair in the 4 m bay with an air-conditioner on brackets under one and a
    downpipe at the side, one in the 2 m bay."""
    s = kit.shell()
    if width >= 4:
        windows = [(-1.2, SILL_UP, -0.4, 2.35), (0.4, SILL_UP, 1.2, 2.35)]
    else:
        windows = [(-0.4, SILL_UP, 0.4, 2.35)]
    upper_frame(s, width / 2, windows)
    for opening in windows:
        sash(s, opening, 'glass_a')
    if width >= 4:
        ac_unit(s, 0.8, 0.28)
        downpipe(s, -1.88, 0.0, UPPER)
    kit.module(f'upper_window_{width}_{variant}', 'upper_window', width, UPPER, s,
               lamp=(windows[0][0], SILL_UP, windows[-1][2], 2.35, 'glass_a'),
               projects=0.33 if width >= 4 else 0.08)


def upper_balcony(kit, slot, name):
    """A sliding glass door in a dark frame onto a balcony slab: a front of horizontal timber
    slats with returns, dark steel posts up to the slab above, a condenser on the floor."""
    s = kit.shell()
    door = (-1.2, FLOOR_BAND[1], 1.2, 2.45)
    upper_frame(s, 2.0, [door])
    s.reveal('wall', door, REVEAL, sill=False)
    s.window(door, REVEAL, 'glass_b', frame='post', columns=2, sill=None, frame_width=0.05)
    s.box('trim', (-1.3, 0.0, 2.45), (1.3, 0.03, 2.57), skip='b')
    x0, x1, deep = -1.95, 1.95, 1.15
    s.box('trim', (x0, 0.0, -0.12), (x1, deep, 0.15), skip='b')
    for x in (x0 + 0.06, x1 - 0.06):
        post(s, x, deep - 0.06, 0.15, UPPER - 0.12)
    s.box('post', (x0 + 0.02, deep - 0.1, 1.08), (x1 - 0.02, deep - 0.02, 1.13), skip='')
    slat_front(s, x0 + 0.1, x1 - 0.1, deep - 0.06, 0.22, 1.07)
    for x in (x0 + 0.06, x1 - 0.06):
        slat_front(s, 0.02, deep - 0.1, x, 0.22, 1.07, along='Y')
    ac_unit(s, 1.35, 0.15, y0=0.05, width=0.7, height=0.5, deep=0.32, brackets=False)
    kit.module(name, slot, 4, UPPER, s, lamp=(*door, 'glass_b'), projects=deep)


def upper_screen(kit):
    """A wide three-light window and, beside it, a timber slat screen on a dark frame standing
    off the wall; conduit along the band."""
    s = kit.shell()
    window = (-1.55, SILL_UP, 0.45, 2.35)
    upper_frame(s, 2.0, [window])
    s.reveal('wall', window, REVEAL, sill=False)
    s.window(window, REVEAL, 'glass_c', columns=3, sill='trim', frame_width=0.06)
    s.box('trim', (-1.61, 0.0, 2.35), (0.51, 0.03, 2.47), skip='b')
    for x in (0.8, 1.8):
        s.box('post', (x - 0.025, 0.0, 0.25), (x + 0.025, 0.14, 2.95), skip='b')
    z = 0.3
    while z < 2.9:
        s.box('slat', (0.78, 0.1, z), (1.82, 0.15, z + 0.08), skip='b')
        z += 0.13
    conduit(s, [(-2.0, 0.03, 2.85), (0.6, 0.03, 2.85), (0.6, 0.03, 1.2)], box_at=(0.6, 1.1, 0.16, 0.16))
    kit.module('upper_window_4_c', 'upper_window', 4, UPPER, s, lamp=(*window, 'glass_c'),
               projects=0.15)


def upper_blank(kit, width):
    """A blank bay: the 4 m one carries an air-conditioner, a downpipe with its hopper and a run
    of conduit; the 2 m one a downpipe."""
    s = kit.shell()
    half = width / 2
    upper_frame(s, half, [])
    if width >= 4:
        ac_unit(s, -0.6, 1.3)
        downpipe(s, 1.4, 0.0, UPPER, hopper=True)
        conduit(s, [(-2.0, 0.03, 2.9), (0.6, 0.03, 2.9), (0.6, 0.03, 1.0)], box_at=(0.6, 0.9, 0.2, 0.2))
    else:
        downpipe(s, 0.3, 0.0, UPPER)
    kit.module(f'upper_blank_{width}_a', 'upper_blank', width, UPPER, s,
               projects=0.33 if width >= 4 else 0.12)


# ---------------------------------------------------------------------------------------------
# Top, corners, roof
# ---------------------------------------------------------------------------------------------

def parapet(s, half):
    s.wall('wall', -half, half, 0.0, TOP)
    s.box('trim', (-half, 0.0, 0.0), (half, 0.035, 0.15), skip='blr')
    s.box('concrete', (-half, -0.22, TOP - 0.07), (half, 0.05, TOP), skip='lr')
    s.quad('wall', [(-half, -0.2, 0.0), (half, -0.2, 0.0), (half, -0.2, TOP - 0.07),
                    (-half, -0.2, TOP - 0.07)], (0, -1, 0))


def top_parapet(kit, width):
    """A plain parapet with a coping and a scupper."""
    s = kit.shell()
    parapet(s, width / 2)
    if width >= 4:
        s.box('concrete', (1.0, 0.0, 0.18), (1.16, 0.28, 0.27), skip='b')
    kit.module(f'top_parapet_{width}_a', 'top_parapet', width, TOP, s, projects=0.28)


def top_crown(kit):
    """The parapet with a roof-terrace pergola behind it: dark posts, timber beams, rafters
    and a lattice of laths, rising 2.75 m above the roof (the front bays of a building)."""
    s = kit.shell()
    parapet(s, 2.0)
    pergola(s, -1.85, 1.85, -0.45, -2.75, 0.0, 2.45)
    kit.module('top_crown_4_a', 'top_crown', 4, TOP, s, crown=2.77, projects=0.05)


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
    wrap(s, 'plinth', 0.02, 0.0, PLINTH)
    wrap(s, 'trim', 0.035, *BAND)
    s.tube('pipe', [(0.33, 0.08, 0.0), (0.33, 0.08, GROUND)], radius=0.042, segments=6)


def corner_upper_dress(s):
    wrap(s, 'trim', 0.035, *FLOOR_BAND)
    s.tube('pipe', [(0.33, 0.08, 0.0), (0.33, 0.08, UPPER)], radius=0.042, segments=6)


def corner_top_dress(s):
    wrap(s, 'trim', 0.035, 0.0, 0.15)
    coping = [(-0.25, -0.22), (-0.03, -0.22), (-0.03, -0.5), (0.3, -0.5), (0.3, 0.05), (-0.25, 0.05)]
    s.prism('concrete', coping, TOP - 0.07, TOP)
    s.quad('wall', [(-0.25, -0.2, 0), (0.05, -0.2, 0), (0.05, -0.2, TOP - 0.07),
                    (-0.25, -0.2, TOP - 0.07)], (0, -1, 0))
    s.quad('wall', [(0.05, -0.2, 0), (0.05, -0.5, 0), (0.05, -0.5, TOP - 0.07),
                    (0.05, -0.2, TOP - 0.07)], (-1, 0, 0))
    s.box('pipe', (0.21, 0.0, 0.85), (0.45, 0.2, 1.1), skip='b')
    s.tube('pipe', [(0.33, 0.08, 0.0), (0.33, 0.08, 0.85)], radius=0.042, segments=6)


def roof_condenser(kit):
    """roof_prop: an air-conditioning condenser on two steel rails (origin at the centre of the
    base), its fan grille on the front, pipes into the roof."""
    s = kit.shell()
    for y in (-0.15, 0.15):
        s.box('post', (-0.5, y - 0.03, 0.0), (0.5, y + 0.03, 0.08), skip='u')
    ac_unit(s, 0.0, 0.08, y0=-0.2, width=0.9, height=0.65, deep=0.4, brackets=False)
    s.tube('pipe', [(0.38, -0.2, 0.3), (0.38, -0.32, 0.3), (0.38, -0.32, 0.0)], radius=0.02)

    def card(c):
        c.quad('alu', [(-0.45, 0.2, 0), (0.45, 0.2, 0), (0.45, 0.2, 0.73), (-0.45, 0.2, 0.73)],
               (0, 1, 0))

    kit.module('roof_prop_1_a', 'roof_prop', 0.9, 0.73, s, card=card, plan=[1.0, 0.45])


def roof_pergola(kit):
    """roof_prop: a free-standing roof-terrace pergola 3.6 by 2.6 m (origin at the centre of
    its base)."""
    s = kit.shell()
    pergola(s, -1.8, 1.8, 1.3, -1.3, 0.0, 2.45)

    def card(c):
        c.quad('slat', [(-1.9, 1.3, 2.3), (1.9, 1.3, 2.3), (1.9, 1.3, 2.75), (-1.9, 1.3, 2.75)],
               (0, 1, 0))

    kit.module('roof_prop_4_a', 'roof_prop', 3.8, 2.77, s, card=card, plan=[3.8, 3.1])


# ---------------------------------------------------------------------------------------------

def make(a):
    frame = M.painted_metal(color=(0.64, 0.64, 0.61), gloss=0.4, chips=0.3, rust=0.2, grime=0.55,
                            dust=0.35, fade=0.35, seed=81, name='frame_white')
    plinth = M.concrete(color=(0.30, 0.29, 0.27), stains=0.8, cracks=0.4, pits=0.6, seed=82,
                        name='plinth_render')
    materials = FacadeMaterials(wall_color=M.hex_color('#e3c9a3'), trim_color=M.hex_color('#b9b3a8'),
                                frame=frame, plinth=plinth, seed=91)
    # Replace FacadeMaterials' stuccos with this kit's weathered render. Remove them first, so
    # that the new materials take the exact names paint_wall / paint_trim (the game's roles).
    for old in {materials.upper['wall'], materials.ground['wall'], materials.upper['trim'],
                materials.ground['trim']}:
        bpy.data.materials.remove(old)
    materials.upper['wall'] = render('paint_wall', M.hex_color('#e3c9a3'), 91)
    materials.ground['wall'] = render('paint_wall', M.hex_color('#e3c9a3'), 91, ground=True)
    materials.upper['trim'] = render('paint_trim', M.hex_color('#b9b3a8'), 92, smooth=True)
    materials.ground['trim'] = render('paint_trim', M.hex_color('#b9b3a8'), 92, ground=True,
                                      smooth=True)
    materials.add(
        post=M.painted_metal(color=(0.05, 0.05, 0.05), gloss=0.35, chips=0.3, rust=0.45,
                             grime=0.5, dust=0.3, fade=0.3, seed=83, name='steel_dark'),
        slat=M.wood(color=(0.34, 0.22, 0.13), weathered=0.75, grain_axis='X', seed=84,
                    name='timber_slat'),
        roller=M.corrugated_metal(color=(0.55, 0.54, 0.50), pitch=0.09, depth=0.01,
                                  direction='X', painted=True, rust=0.35, seed=85,
                                  name='roller_door'),
        alu=M.plastic(color=(0.70, 0.69, 0.66), roughness=0.5, scuffs=0.5, seed=86,
                      name='casing_pale'),
        vent=M.plastic(color=(0.06, 0.06, 0.06), roughness=0.6, scuffs=0.3, seed=87,
                       name='grille_dark'),
        pipe=M.plastic(color=(0.46, 0.46, 0.44), roughness=0.55, scuffs=0.4, seed=88,
                       name='pipe_grey'),
        concrete=M.concrete(color=(0.50, 0.49, 0.46), stains=0.7, cracks=0.3, pits=0.5, seed=89,
                            name='cast_concrete'),
        interior=M.concrete(color=(0.12, 0.115, 0.11), stains=0.6, cracks=0.2, pits=0.4, seed=90,
                            name='garage_dark'),
        door=M.wood(color=(0.30, 0.17, 0.10), weathered=0.5, grain_axis='Z', seed=93,
                    name='door_timber'),
    )
    kit = Kit(a, materials)

    ground_entrance(kit)
    ground_garage(kit, 'a', 0.0)
    ground_garage(kit, 'b', 1.3)
    ground_wall(kit)
    ground_wall_narrow(kit)
    corner(kit, 'corner_ground_a', 'corner_ground', GROUND, 'ground', corner_ground_dress)
    upper_sash(kit, 4, 'a')
    upper_balcony(kit, 'upper_window', 'upper_window_4_b')
    upper_screen(kit)
    upper_sash(kit, 2, 'a')
    upper_balcony(kit, 'upper_balcony', 'upper_balcony_4_a')
    upper_blank(kit, 4)
    upper_blank(kit, 2)
    corner(kit, 'corner_upper_a', 'corner_upper', UPPER, 'upper', corner_upper_dress)
    top_parapet(kit, 4)
    top_parapet(kit, 2)
    top_crown(kit)
    corner(kit, 'corner_top_a', 'corner_top', TOP, 'upper', corner_top_dress)
    roof_condenser(kit)
    roof_pergola(kit)
    kit.tiles()
    kit.finish(lod_distance=70.0)
    a.bake(size=1024, bevel_radius=0.01, occlusion_distance=1.0, occlusion_in_color=0.45,
           cage_extrusion=1.7)


def assemble(a):
    Kit.of(a).assemble()
