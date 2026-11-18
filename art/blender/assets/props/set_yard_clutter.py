"""Yard clutter set: the second load of back-street junk a lived-in MARAZUL block needs, in one
file (the first is set_alley_and_yard, which already has the site toilet, the tyre stack, single
and stacked cartons, pallets, drums and dumpsters).

Sixteen objects, original designs at real size, sharing one atlas (see _setkit.py for how a set
is laid out and named). Fronts look towards +Y.

    cinder_block        one hollow concrete block, 390 x 190 x 190 mm, two cores
    cinder_stack        nine blocks stacked in three courses, the top one askew
    cinder_broken       a heap of broken blocks: one whole on its side, two halves, chunks
    cardboard_flat      two flattened cartons lying on the ground, curled, one taped
    cardboard_bundle    flattened cartons stacked and tied with two cords
    cardboard_leaning   three flattened cartons leaning on a wall (wall plane y = 0 behind)
    plastic_crate       an open moulded crate with hand holes and side vents, red
    crate_stack         three crates stacked off true and one beside them, red and blue
    skip                a 5 m roll-off container on rails, sloped front, rear door, heaped
                        with rubble and planks
    shopping_trolley    a wire shopping trolley: tapered basket, castors, handle, lower tray
                        (the wire is the cutout_wire role, alpha-tested)
    mattress_leaning    a stained single mattress leaning on a wall, sagging
    mattress_flat       the same mattress dumped flat on the ground
    tyre_loose          one car tyre lying flat
    tyre_pile           five loose tyres heaped, one on edge
    pallet_fence        a 3.3 m fence of four pallets on end between timber posts, wired
                        together, boards missing
    warning_plate       a steel warning plate on a wall: a hazard triangle with a lightning
                        pictogram over a blank band (anchor_sign: the game paints the words)
    warning_post        the same plate on a steel post

Wall-standing objects (cardboard_leaning, mattress_leaning, warning_plate) are modelled against a
wall on the plane y = 0 behind them; their origin is on the ground at the wall foot.

The budget is raised because this is seventeen objects in one file.
"""
import math
import random

from lib import build, modify
from lib import materials as M
from lib.materials import wear

import _finishes as F
import _shapes as S
from _setkit import SetKit

ASSET = {
    'id': 'set_yard_clutter',
    'kind': 'prop',
    'atlas': 1024,
    'budget': {'triangles': 9000, 'draws': 26, 'bytes': 600000},
}

FRONT = (0.0, 1.0, 0.0)
SQRT3 = math.sqrt(3.0)


def crate_plastic(name, color, seed):
    """Moulded crate plastic: rows of dark hand holes and vents in a band round each crate
    (crates are 0.28 m tall, stacked on whole multiples of that), sun-faded and scuffed."""
    def holes(graph):
        run = graph.add(graph.axis('X'), graph.axis('Y'))
        level = graph.mul(graph.math('FRACT', graph.mul(graph.axis('Z'), 1.0 / 0.28)), 0.28)
        return graph.mul(F.bands(graph, run, 0.06, share=0.55, soft=0.08),
                         F.between(graph, level, 0.06, 0.2, 0.006))

    def pattern(graph):
        return graph.mix(holes(graph), color, (0.012, 0.012, 0.012))

    def relief(graph):
        return graph.mul(holes(graph), -1.0)

    return F.coated(name, pattern, seed=seed, roughness=0.55, chips=0.45, grime=0.55, dust=0.35,
                    fade=0.55, splash=0.4, scratches=0.5, plastic=True, height=relief, bump=0.008)


def mattress_fabric(name, seed):
    """Off-white quilted ticking: diamond quilting seams, faded, with tea-brown stains."""
    def pattern(graph):
        run_a = graph.add(graph.axis('X'), graph.axis('Z'))
        run_b = graph.sub(graph.axis('X'), graph.axis('Z'))
        seams = graph.maximum(F.bands(graph, run_a, 0.16, share=0.07, soft=0.2),
                              F.bands(graph, run_b, 0.16, share=0.07, soft=0.2))
        base = graph.mix(seams, (0.56, 0.54, 0.48), (0.38, 0.36, 0.32))
        stains = graph.mask(graph.noise(scale=2.2, detail=6.0), 0.6, 0.04)
        rings = graph.mul(graph.mask(graph.noise(scale=2.2, detail=6.0), 0.55, 0.01), 0.5)
        base = graph.mix(graph.maximum(stains, rings), base, (0.36, 0.26, 0.12), blend='MULTIPLY')
        return base

    def relief(graph):
        run_a = graph.add(graph.axis('X'), graph.axis('Z'))
        run_b = graph.sub(graph.axis('X'), graph.axis('Z'))
        return graph.mul(graph.maximum(F.bands(graph, run_a, 0.16, share=0.1, soft=0.4),
                                       F.bands(graph, run_b, 0.16, share=0.1, soft=0.4)), -1.0)

    return F.coated(name, pattern, seed=seed, roughness=0.9, chips=0.0, rust=0.0, grime=0.7,
                    dust=0.4, fade=0.35, splash=0.6, scratches=0.0, height=relief, bump=0.01)


def segment(graph, u, v, a, b):
    """Distance in metres to the segment from a to b."""
    vx, vy = b[0] - a[0], b[1] - a[1]
    px, py = graph.sub(u, a[0]), graph.sub(v, a[1])
    h = graph.math('MULTIPLY', graph.add(graph.mul(px, vx), graph.mul(py, vy)),
                   1.0 / (vx * vx + vy * vy), clamp=True)
    return graph.vector_math('LENGTH', graph.combine(graph.sub(px, graph.mul(h, vx)),
                                                     graph.sub(py, graph.mul(h, vy)), 0.0))


def sign_face(graph, centre=1.6):
    """The warning plate's face: white enamel with a black border, a yellow hazard triangle
    with a black rim and a lightning pictogram, and a blank band below for the game's words."""
    u = graph.mul(graph.axis('X'), -1.0)
    v = graph.sub(graph.axis('Z'), centre)
    edge = graph.maximum(graph.sub(graph.math('ABSOLUTE', u), 0.225),
                         graph.sub(graph.math('ABSOLUTE', v), 0.3))
    border = F.between(graph, edge, -0.022, -0.012, 0.0015)
    side = 0.3
    height = side * SQRT3 / 2
    low = 0.1 - height / 3
    top = low + height
    tri = graph.mul(graph.maximum(graph.sub(low, v),
                                  graph.sub(graph.mul(graph.math('ABSOLUTE', u), SQRT3),
                                            graph.sub(top, v))), 0.5)
    rim = graph.remap(tri, 0.002, -0.002, smooth=True)
    fill = graph.remap(tri, -0.016, -0.02, smooth=True)
    bolt = [(0.035, low + 0.68 * height), (-0.022, low + 0.36 * height), (0.024, low + 0.36 * height),
            (-0.03, low + 0.08 * height)]
    stroke = graph.minimum(segment(graph, u, v, bolt[0], bolt[1]),
                           graph.minimum(segment(graph, u, v, bolt[1], bolt[2]),
                                         segment(graph, u, v, bolt[2], bolt[3])))
    zap = graph.remap(stroke, 0.011, 0.008, smooth=True)
    rule = F.between(graph, v, -0.075, -0.068, 0.0015)
    color = graph.rgb((0.72, 0.71, 0.66))
    color = graph.mix(graph.maximum(border, rule), color, (0.015, 0.015, 0.016))
    color = graph.mix(rim, color, (0.015, 0.015, 0.016))
    color = graph.mix(graph.mul(fill, graph.invert(zap)), color, (0.66, 0.44, 0.03))
    return color


def palette():
    """The materials of the set, by short name."""
    plate = F.coated('sign_enamel', sign_face, seed=430, roughness=0.35, chips=0.35, rust=0.45,
                     grime=0.45, dust=0.3, fade=0.4, scratches=0.35)
    return {
        'block': M.concrete(color=(0.5, 0.49, 0.46), stains=0.6, cracks=0.2, pits=0.8, seed=401,
                            name='block_concrete'),
        'rubble': M.concrete(color=(0.44, 0.42, 0.39), stains=0.9, cracks=0.6, pits=0.9, seed=402,
                             name='rubble_concrete'),
        'card': F.coated('cardboard', (0.5, 0.36, 0.21), seed=403, roughness=0.88, chips=0.0,
                         rust=0.0, grime=0.6, dust=0.35, fade=0.3, splash=0.6, scratches=0.15),
        'card_wet': F.coated('cardboard_soaked', (0.34, 0.23, 0.12), seed=404, roughness=0.92,
                             chips=0.0, rust=0.0, grime=0.7, dust=0.2, fade=0.15, splash=0.8,
                             scratches=0.1),
        'tape': F.coated('packing_tape', (0.6, 0.46, 0.28), seed=405, roughness=0.35, chips=0.0,
                         rust=0.0, grime=0.2, dust=0.1, fade=0.1, scratches=0.1),
        'cord': F.coated('cord', (0.48, 0.42, 0.3), seed=406, roughness=0.85, chips=0.0, rust=0.0,
                         grime=0.4, dust=0.2, fade=0.3, scratches=0.0),
        'crate_red': crate_plastic('crate_red', (0.34, 0.045, 0.035), 407),
        'crate_blue': crate_plastic('crate_blue', (0.04, 0.12, 0.32), 408),
        'skip': F.enamel('skip_enamel', M.hex_color('#6a3326'), seed=409, wear_amount=0.85,
                         splash=0.8),
        'skip_rail': F.enamel('skip_rail_enamel', M.hex_color('#2e2e2c'), seed=410, wear_amount=0.8,
                              splash=0.9),
        'skip_inside': M.rusty_metal(rust=0.85, seed=411, name='skip_rust'),
        'plank': M.wood(color=(0.5, 0.38, 0.25), weathered=0.8, grain_axis='X', seed=412,
                        name='plank_wood'),
        'board_v': M.wood(color=(0.55, 0.42, 0.28), weathered=0.75, grain_axis='Z', seed=413,
                          name='pallet_board'),
        'board_h': M.wood(color=(0.52, 0.4, 0.27), weathered=0.75, grain_axis='X', seed=414,
                          name='pallet_stringer'),
        'post': M.wood(color=(0.4, 0.3, 0.2), weathered=0.85, grain_axis='Z', seed=415,
                       name='post_wood'),
        'zinc': M.galvanized(spangle=0.2, rust=0.45, seed=416, name='trolley_zinc'),
        'wire_x': F.wire_mesh('cutout_wire', pitch=0.05, wire=0.009, axes=('X', 'Z'), seed=417,
                              rust=0.3, color=(0.55, 0.56, 0.57)),
        'wire_y': F.wire_mesh('cutout_wire', pitch=0.05, wire=0.009, axes=('Y', 'Z'), seed=418,
                              rust=0.3, color=(0.55, 0.56, 0.57)),
        'wire_floor': F.wire_mesh('cutout_wire', pitch=0.05, wire=0.009, axes=('X', 'Y'), seed=419,
                                  rust=0.3, color=(0.55, 0.56, 0.57)),
        'grip': F.moulded('trolley_grip', (0.33, 0.05, 0.04), seed=420, wear_amount=0.7),
        'castor': M.plastic(color=(0.03, 0.03, 0.032), roughness=0.6, scuffs=0.6, seed=421,
                            name='castor_plastic'),
        'mattress': mattress_fabric('mattress_ticking', 422),
        'piping': F.coated('mattress_piping', (0.3, 0.28, 0.25), seed=423, roughness=0.85,
                           chips=0.0, rust=0.0, grime=0.6, dust=0.3, fade=0.3, scratches=0.0),
        'rubber': M.rubber(dust=0.6, seed=424, name='tyre_rubber'),
        'wire': M.galvanized(spangle=0.3, rust=0.6, seed=425, name='tie_wire'),
        'plate': plate,
        'plate_back': M.galvanized(spangle=0.5, rust=0.35, seed=426, name='plate_back'),
        'pole': F.enamel('post_enamel', M.hex_color('#6c7174'), seed=427, wear_amount=0.6,
                         splash=0.5),
        'bolt': M.galvanized(spangle=0.2, rust=0.6, seed=428, name='bolt_zinc'),
    }


def quad(points, mat):
    """One face through four corners (any order around the face)."""
    obj = build.from_data('part', points, [(0, 1, 2, 3)])
    return S.done(obj, mat)


def jagged(obj, side, at, amount, seed):
    """Breaks a part's end: vertices beyond `at` along x (side +1) or before it (side -1) are
    pulled about by up to `amount`."""
    rnd = random.Random(seed)

    def shape(point):
        if (point.x - at) * side > -1e-4:
            point.x += side * rnd.uniform(-amount, amount * 0.3)
            point.z -= rnd.uniform(0.0, amount)
        return point

    modify.map_vertices(obj, shape)
    return obj


def block(m, at=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0), half=False, seed=0, mat=None):
    """A hollow concrete block, or the broken half of one, standing on `at`."""
    w, d, h, t = 0.39, 0.19, 0.19, 0.032
    x1 = 0.005 if half else w / 2
    length = x1 + w / 2
    centre = (x1 - w / 2) / 2
    parts = [S.box((length, t, h), at=(centre, y, 0.0), ground=True)
             for y in (-d / 2 + t / 2, d / 2 - t / 2)]
    webs = (-w / 2 + t / 2, 0.0 - 0.02) if half else (-w / 2 + t / 2, 0.0, w / 2 - t / 2)
    parts += [S.box((0.026 if abs(x) < 0.1 else t, d - 2 * t, h), at=(x, 0.0, 0.0), ground=True)
              for x in webs]
    piece = S.join(parts)
    if half:
        jagged(piece, 1, x1, 0.05, seed)
    S.done(piece, mat or m['block'])
    S.move(piece, at=(0.0, 0.0, -h / 2))
    S.move(piece, rot=rot)
    S.move(piece, at=(at[0], at[1], at[2] + h / 2))
    return piece


def cinder(k, m):
    """One block, a stack of nine and a broken heap."""
    one = k.object('cinder_block', [block(m)], cls='scatter', mass=13.0, lods=(0.5,),
                   distances=(15.0,), smooth=20.0)
    one.box('body', (0.0, 0.0, 0.095), (0.39, 0.19, 0.19))

    blocks = [block(m, (x, y, 0.0)) for x in (-0.2, 0.2) for y in (-0.1, 0.1)]
    blocks += [block(m, (x, 0.0, 0.19), (0.0, 0.0, math.pi / 2)) for x in (-0.2, 0.0, 0.2)]
    blocks += [block(m, (-0.18, -0.02, 0.38), (0.0, 0.0, 0.08)),
               block(m, (0.2, 0.05, 0.38), (0.0, 0.0, -0.35))]
    stack = k.object('cinder_stack', blocks, cls='knockable', mass=115.0, lods=(0.4, 0.15),
                     distances=(20.0, 50.0), smooth=20.0)
    stack.box('body', (0.0, 0.0, 0.285), (0.82, 0.42, 0.57))

    rnd = random.Random(7)
    heap = [block(m, (-0.25, 0.05, 0.0), (math.pi / 2, 0.0, 0.3)),
            block(m, (0.18, -0.12, 0.0), (0.0, 0.0, 2.2), half=True, seed=1),
            block(m, (0.25, 0.2, 0.0), (0.0, 0.25, -0.6), half=True, seed=2, mat=m['rubble'])]
    for index in range(6):
        size = (rnd.uniform(0.05, 0.12), rnd.uniform(0.04, 0.09), rnd.uniform(0.03, 0.06))
        chunk = S.box(size, mat=m['rubble'], ground=True, bevel=0.006)
        jagged(chunk, 1, -1.0, 0.012, index + 10)
        S.move(chunk, rot=(rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0, 3)))
        S.move(chunk, at=(rnd.uniform(-0.4, 0.45), rnd.uniform(-0.3, 0.32), 0.0))
        heap.append(chunk)
    broken = k.object('cinder_broken', heap, cls='scatter', mass=40.0, lods=(0.4,),
                      distances=(18.0,), smooth=20.0)
    broken.box('body', (0.0, 0.0, 0.12), (0.95, 0.75, 0.24))


def sheet(m, w, d, at, turn, curl, seed, mat=None, tape=True):
    """A flattened carton lying on the ground, its ends curling up."""
    rnd = random.Random(seed)
    obj = S.slab(w, d, segments=(6, 3))
    phase = rnd.uniform(0.0, math.tau)

    def shape(point):
        ends = max(0.0, abs(point.x) / (w / 2) - 0.55) / 0.45
        point.z += 0.006 + curl * ends * ends + 0.008 * math.sin(3.0 * point.y / d + phase)
        return point

    modify.map_vertices(obj, shape)
    parts = [S.done(obj, mat or m['card'])]
    if tape:
        parts.append(S.box((w * 0.9, 0.05, 0.002), at=(0.0, 0.0, 0.007), mat=m['tape'], ground=True,
                           skip=1))
    piece = S.join(parts)
    S.move(piece, rot=(0.0, 0.0, turn))
    S.move(piece, at=at)
    return piece


def cardboard(k, m):
    """Flattened cartons: lying, bundled, leaning on a wall."""
    flat = k.object('cardboard_flat', [sheet(m, 1.0, 0.62, (-0.12, 0.04, 0.0), 0.2, 0.05, 1),
                                       sheet(m, 0.86, 0.55, (0.2, -0.1, 0.012), -0.35, 0.07, 2,
                                             m['card_wet'], tape=False)],
                    cls='scatter', mass=1.5, lods=(0.4,), distances=(15.0,), smooth=50.0)
    flat.box('body', (0.0, 0.0, 0.03), (1.2, 0.95, 0.06))

    rnd = random.Random(11)
    layers = []
    for index in range(9):
        size = (0.95 + rnd.uniform(-0.05, 0.03), 0.62 + rnd.uniform(-0.04, 0.03), 0.011)
        board = S.box(size, at=(rnd.uniform(-0.025, 0.025), rnd.uniform(-0.02, 0.02), index * 0.0115),
                      rot=(0.0, 0.0, rnd.uniform(-0.04, 0.04)), ground=True,
                      mat=m['card'] if index % 3 else m['card_wet'])
        layers.append(board)
    top = 9 * 0.0115
    for x in (-0.28, 0.3):
        layers.append(S.pipe([(x, -0.335, -0.003), (x, 0.335, -0.003), (x, 0.335, top + 0.003),
                              (x, -0.335, top + 0.003)], 0.004, m['cord'], seg=4, closed=True))
    bundle = k.object('cardboard_bundle', layers, cls='scatter', mass=9.0, lods=(0.4,),
                      distances=(15.0,), smooth=30.0)
    bundle.box('body', (0.0, 0.0, 0.055), (1.0, 0.68, 0.11))

    lean = []
    for index, (x, w, h, a) in enumerate(((-0.35, 0.8, 1.05, 0.22), (0.05, 0.9, 1.2, 0.2),
                                          (0.42, 0.7, 0.9, 0.26))):
        board = S.box((w, 0.008, h), ground=True, mat=m['card_wet'] if index == 1 else m['card'],
                      rot=(a, 0.0, 0.0))
        S.move(board, at=(x, h * math.sin(a) + 0.03 + index * 0.012, 0.0))
        lean.append(board)
    leaning = k.object('cardboard_leaning', lean, cls='scatter', mass=3.0, lods=(0.4,),
                       distances=(15.0,), smooth=30.0)
    leaning.box('body', (0.0, 0.15, 0.6), (1.6, 0.3, 1.2))


def crate(mat, at=(0.0, 0.0, 0.0), turn=0.0):
    """An open moulded crate 0.6 x 0.4 x 0.28 standing on `at`."""
    w, d, h, t = 0.6, 0.4, 0.28, 0.012
    parts = [S.box((w, t, h), at=(0.0, y, 0.0), ground=True) for y in (-d / 2 + t / 2, d / 2 - t / 2)]
    parts += [S.box((t, d - 2 * t, h), at=(x, 0.0, 0.0), ground=True) for x in (-w / 2 + t / 2, w / 2 - t / 2)]
    parts.append(S.box((w - 0.01, d - 0.01, 0.014), at=(0.0, 0.0, 0.012), ground=True))
    parts += [S.box((w + 0.012, 0.022, 0.025), at=(0.0, y, h - 0.025), ground=True) for y in (-d / 2, d / 2)]
    parts += [S.box((0.022, d + 0.012, 0.025), at=(x, 0.0, h - 0.025), ground=True) for x in (-w / 2, w / 2)]
    parts += [S.box((0.03, 0.03, h - 0.03), at=(x, y, 0.0), ground=True)
              for x in (-w / 2 + 0.01, w / 2 - 0.01) for y in (-d / 2 + 0.01, d / 2 - 0.01)]
    piece = S.done(S.join(parts), mat)
    S.move(piece, rot=(0.0, 0.0, turn))
    S.move(piece, at=at)
    return piece


def crates(k, m):
    """One crate, and a stack."""
    one = k.object('plastic_crate', [crate(m['crate_red'])], cls='scatter', mass=1.8, lods=(0.4,),
                   distances=(15.0,), smooth=30.0)
    one.box('body', (0.0, 0.0, 0.14), (0.62, 0.42, 0.28))
    pile = [crate(m['crate_red'], (-0.02, 0.0, 0.0)), crate(m['crate_blue'], (0.01, 0.01, 0.28), 0.04),
            crate(m['crate_red'], (-0.03, -0.01, 0.56), -0.06), crate(m['crate_blue'], (0.66, 0.06, 0.0), 0.35)]
    stack = k.object('crate_stack', pile, cls='knockable', mass=9.0, lods=(0.4, 0.15),
                     distances=(18.0, 45.0), smooth=30.0)
    stack.box('body', (0.3, 0.02, 0.42), (1.28, 0.62, 0.84))


def skip(k, m):
    """A roll-off container 5 m long along X: sloped front at +X, rear door at -X, rails, rollers,
    the hook loop, heaped with rubble and broken planks."""
    length, width, height, base = 5.0, 2.3, 1.35, 0.17
    x0, x1 = -length / 2, length / 2
    wall_top = base + height
    parts = []
    body = [S.box((length - 0.3, width, 0.03), at=(-0.15, 0.0, base), ground=True)]
    for y in (-width / 2 + 0.015, width / 2 - 0.015):
        body.append(S.box((length - 0.3, 0.03, height), at=(-0.15, y, base), ground=True))
    front = S.box((0.03, width, height / math.cos(0.45)), ground=True)
    S.move(front, rot=(0.0, 0.45, 0.0))
    S.move(front, at=(x1 - 0.3, 0.0, base))
    body.append(front)
    for y in (-width / 2 + 0.015, width / 2 - 0.015):
        cheek = quad([(x1 - 0.3, y, base), (x1 - 0.3 + height * math.tan(0.45), y, wall_top),
                      (x1 - 0.3, y, wall_top), (x1 - 0.3, y, base)], None)
        body.append(cheek)
    parts.append(S.done(S.join(body), m['skip']))
    rails = [S.box((length - 0.3 + height * math.tan(0.45), 0.08, 0.08), at=(x0 + (length - 0.3 + height * math.tan(0.45)) / 2 - 0.0, y, wall_top - 0.08), ground=True)
             for y in (-width / 2 - 0.02, width / 2 + 0.02)]
    rails += [S.box((0.08, width + 0.12, 0.08), at=(x0, 0.0, wall_top - 0.08), ground=True)]
    for x in [x0 + 0.35 + 0.72 * index for index in range(6)]:
        for y in (-width / 2 - 0.04, width / 2 + 0.04):
            rails.append(S.box((0.08, 0.06, height - 0.1), at=(x, y, base + 0.02), ground=True))
    parts.append(S.done(S.join(rails), m['skip']))
    door = S.box((0.04, width - 0.04, height - 0.05), at=(x0 - 0.04, 0.0, base + 0.02), ground=True, mat=m['skip'])
    bars = S.join([S.rod((x0 - 0.075, y, base + 0.05), (x0 - 0.075, y, wall_top - 0.1), 0.018, seg=6)
                   for y in (-0.55, 0.55)]
                  + [S.box((0.05, 0.12, 0.06), at=(x0 - 0.07, y, z), ground=True)
                     for y in (-width / 2 + 0.05, width / 2 - 0.05) for z in (base + 0.25, wall_top - 0.35)])
    parts += [door, S.done(bars, m['skip_rail'], skip=1)]
    under = [S.box((length + 0.1, 0.14, base), at=(0.05, y, 0.0), ground=True) for y in (-0.55, 0.55)]
    under += [S.box((0.1, width - 0.2, 0.1), at=(x, 0.0, 0.05), ground=True) for x in (-1.6, 0.0, 1.6)]
    parts.append(S.done(S.join(under), m['skip_rail']))
    rollers = S.join([S.cyl(0.085, 0.12, at=(x0 + 0.05, y, 0.085), seg=10, axis='Y') for y in (-0.55, 0.55)])
    hook = S.torus(0.13, 0.03, at=(x1 + 0.28, 0.0, 0.62), seg=10, sides=5, axis='Y')
    parts += [S.done(rollers, m['skip_rail']), S.done(hook, m['skip_rail'])]
    parts.append(S.box((length - 0.45, width - 0.08, 0.05), at=(-0.2, 0.0, base + 0.03), ground=True,
                       mat=m['skip_inside']))
    fill = S.slab(length - 0.35, width - 0.08, at=(-0.2, 0.0, 0.0), segments=(12, 5))
    rnd = random.Random(5)
    bumps = [(rnd.uniform(-2.2, 1.8), rnd.uniform(-1.0, 1.0), rnd.uniform(0.15, 0.45), rnd.uniform(0.4, 0.9))
             for _ in range(7)]

    def heap(point):
        z = base + height * 0.62
        for bx, by, bh, br in bumps:
            z += bh * math.exp(-((point.x - bx) ** 2 + (point.y - by) ** 2) / (br * br))
        point.z = min(z, wall_top + 0.35)
        return point

    modify.map_vertices(fill, heap)
    parts.append(S.done(fill, m['rubble']))
    for index in range(5):
        plank = S.box((rnd.uniform(1.2, 2.2), 0.14, 0.025), mat=m['plank'])
        S.move(plank, rot=(rnd.uniform(-0.2, 0.2), rnd.uniform(-0.45, 0.1), rnd.uniform(-0.5, 0.5)))
        S.move(plank, at=(rnd.uniform(-1.6, 1.2), rnd.uniform(-0.7, 0.7), wall_top + rnd.uniform(-0.05, 0.25)))
        parts.append(plank)
    container = k.object('skip', parts, cls='fixed', lods=(0.4, 0.15), distances=(30.0, 80.0),
                         smooth=30.0)
    container.box('body', (0.0, 0.0, (wall_top + 0.1) / 2), (length + 0.2, width + 0.12, wall_top + 0.1))


def trolley(m):
    """The parts of a wire shopping trolley, front towards +Y, handle at -Y."""
    zinc = m['zinc']
    back, front = -0.38, 0.5
    bottom, rim = 0.5, 0.98
    hw_back, hw_front = 0.27, 0.21
    fw_back, fw_front = 0.24, 0.18
    parts = []
    parts.append(S.pipe([(-hw_back, back, rim), (-hw_front, front, rim), (hw_front, front, rim),
                         (hw_back, back, rim)], 0.008, zinc, seg=6, closed=True))
    parts.append(S.pipe([(-fw_back, back + 0.08, bottom), (-fw_front, front - 0.02, bottom + 0.04),
                         (fw_front, front - 0.02, bottom + 0.04), (fw_back, back + 0.08, bottom)],
                        0.007, zinc, seg=5, closed=True))
    for side in (-1, 1):
        parts.append(quad([(side * fw_back, back + 0.08, bottom), (side * fw_front, front - 0.02, bottom + 0.04),
                           (side * hw_front, front, rim), (side * hw_back, back, rim)], m['wire_y']))
        parts.append(S.pipe([(side * 0.25, -0.46, 0.13), (side * 0.25, -0.36, 0.13),
                             (side * 0.19, 0.48, 0.13)], 0.011, zinc, seg=6))
        parts.append(S.pipe([(side * 0.25, -0.44, 0.13), (side * 0.255, -0.44, 0.6),
                             (side * hw_back, -0.5, 1.02)], 0.012, zinc, seg=6, smooth=2))
        parts.append(S.rod((side * fw_back, back + 0.08, bottom), (side * 0.25, -0.2, 0.13), 0.008, zinc, seg=5))
    parts.append(quad([(-fw_front, front - 0.02, bottom + 0.04), (fw_front, front - 0.02, bottom + 0.04),
                       (hw_front, front, rim), (-hw_front, front, rim)], m['wire_x']))
    parts.append(quad([(-fw_back, back + 0.08, bottom), (fw_back, back + 0.08, bottom),
                       (hw_back, back, rim), (-hw_back, back, rim)], m['wire_x']))
    parts.append(quad([(-fw_back, back + 0.08, bottom), (fw_back, back + 0.08, bottom),
                       (fw_front, front - 0.02, bottom + 0.04), (-fw_front, front - 0.02, bottom + 0.04)],
                      m['wire_floor']))
    parts.append(quad([(-0.24, -0.34, 0.14), (0.24, -0.34, 0.14), (0.18, 0.42, 0.14), (-0.18, 0.42, 0.14)],
                      m['wire_floor']))
    parts.append(S.rod((-0.25, -0.36, 0.13), (0.25, -0.36, 0.13), 0.011, zinc, seg=6))
    parts.append(S.rod((-0.3, -0.52, 1.03), (0.3, -0.52, 1.03), 0.016, m['grip'], seg=8, caps=True))
    for x, y in ((-0.25, -0.4), (0.25, -0.4), (-0.19, 0.44), (0.19, 0.44)):
        parts.append(S.box((0.03, 0.04, 0.05), at=(x, y, 0.075), mat=zinc, ground=True))
        parts.append(S.cyl(0.055, 0.03, at=(x, y + 0.02, 0.055), mat=m['castor'], seg=10, axis='X'))
    return parts


def shopping_trolley(k, m):
    cart = k.object('shopping_trolley', trolley(m), cls='knockable', mass=16.0, lods=(0.4, 0.15),
                    distances=(18.0, 45.0), smooth=40.0, texel_scale=1.4)
    cart.box('body', (0.0, -0.01, 0.53), (0.6, 1.02, 1.06))


def mattress_shape(m, bow):
    """A single mattress standing on end, 0.9 m wide, 1.9 m long, 0.18 m thick, bowed."""
    body = S.rbox(0.9, 0.18, 1.9, 0.06, mat=m['mattress'], corner=2,
                  stations=[(f, 1.0) for f in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)])

    def shape(point):
        point.y += bow * math.sin(math.pi * point.z / 1.9)
        return point

    modify.map_vertices(body, shape)
    piping = S.join([S.pipe([(-0.45, y, z) for z in (0.0, 0.95, 1.9)] + [(0.45, y, z) for z in (1.9, 0.95, 0.0)],
                            0.012, None, seg=4, closed=True) for y in (-0.09, 0.09)])
    modify.map_vertices(piping, shape)
    return [body, S.done(piping, m['piping'], skip=1)]


def mattresses(k, m):
    lean = S.join(mattress_shape(m, -0.05))
    S.move(lean, rot=(0.21, 0.0, 0.0))
    S.move(lean, at=(0.0, 0.5, 0.02))
    leaning = k.object('mattress_leaning', [lean], cls='scatter', mass=18.0, lods=(0.35,),
                       distances=(20.0,), smooth=50.0)
    leaning.box('body', (0.0, 0.3, 0.92), (0.95, 0.6, 1.85))

    flat = S.join(mattress_shape(m, 0.04))
    S.move(flat, rot=(-math.pi / 2, 0.0, 0.08))
    S.move(flat, at=(0.0, 0.95, 0.09))
    dumped = k.object('mattress_flat', [flat], cls='scatter', mass=18.0, lods=(0.35,),
                      distances=(20.0,), smooth=50.0)
    dumped.box('body', (0.0, 0.0, 0.09), (1.0, 1.95, 0.2))


def tyre(m, at, rot=(0.0, 0.0, 0.0)):
    piece = S.torus(0.24, 0.095, seg=14, sides=6)
    S.move(piece, scale=(1.0, 1.0, 1.05))
    S.move(piece, rot=rot)
    S.move(piece, at=at)
    return S.done(piece, m['rubber'])


def tyres(k, m):
    loose = k.object('tyre_loose', [tyre(m, (0.0, 0.0, 0.1))], cls='scatter', mass=9.0,
                     lods=(0.35,), distances=(18.0,), smooth=50.0)
    loose.cyl('body', (0.0, 0.0, 0.1), radius=0.34, height=0.2)
    pile = [tyre(m, (-0.25, 0.05, 0.1)), tyre(m, (0.32, -0.08, 0.1)),
            tyre(m, (0.05, 0.0, 0.28), (0.12, 0.08, 0.0)),
            tyre(m, (-0.18, 0.12, 0.46), (-0.2, 0.15, 0.0)),
            tyre(m, (0.62, 0.32, 0.34), (1.35, 0.0, 0.4))]
    heap = k.object('tyre_pile', pile, cls='knockable', mass=45.0, lods=(0.35, 0.12),
                    distances=(18.0, 50.0), smooth=50.0)
    heap.box('body', (0.15, 0.08, 0.32), (1.4, 0.95, 0.64))


def pallet_upright(m, x, seed):
    """A 0.8 x 1.2 m pallet stood on end, deck facing +Y, centred on x; boards missing."""
    rnd = random.Random(seed)
    parts = []
    for index, bx in enumerate((-0.33, -0.165, 0.0, 0.165, 0.33)):
        if rnd.random() < 0.18 and index not in (0, 4):
            continue
        top = 1.2 if rnd.random() > 0.2 else rnd.uniform(0.7, 1.0)
        parts.append(S.box((0.1, 0.022, top), at=(x + bx, 0.06, 0.0), ground=True, mat=m['board_v']))
    for bz in (0.0, 0.55, 1.1):
        parts.append(S.box((0.8, 0.075, 0.1), at=(x, 0.0, bz), ground=True, mat=m['board_h']))
    for bx in (-0.33, 0.0, 0.33):
        parts.append(S.box((0.1, 0.022, 1.2), at=(x + bx, -0.05, 0.0), ground=True, mat=m['board_v']))
    return parts


def pallet_fence(k, m):
    parts = []
    for index, x in enumerate((-1.23, -0.41, 0.41, 1.23)):
        parts += pallet_upright(m, x, 30 + index)
    for x in (-1.65, 0.0, 1.65):
        parts.append(S.box((0.075, 0.075, 1.4), at=(x, -0.12, 0.0), ground=True, mat=m['post']))
    ties = [S.torus(0.05, 0.004, at=(x, -0.04, z), seg=8, sides=3, axis='X')
            for x in (-1.63, -0.82, 0.0, 0.82, 1.63) for z in (0.3, 1.0)]
    parts.append(S.done(S.join(ties), m['wire'], skip=1))
    fence = k.object('pallet_fence', parts, cls='fixed', lods=(0.4, 0.15), distances=(25.0, 60.0),
                     smooth=30.0)
    fence.box('body', (0.0, -0.02, 0.7), (3.4, 0.24, 1.4))


def plate(m, y):
    """The warning plate, 0.45 x 0.6 m, its face at y, centred 1.6 m up."""
    face = S.box((0.45, 0.004, 0.6), at=(0.0, y - 0.002, 1.3), ground=True, mat=m['plate'])
    back = S.box((0.44, 0.004, 0.59), at=(0.0, y - 0.006, 1.305), ground=True, mat=m['plate_back'])
    screws = S.nuts([(x, y, z) for x in (-0.2, 0.2) for z in (1.33, 1.87)], m['bolt'], radius=0.008,
                    height=0.004, axis='Y')
    return [face, back, screws]


def signs(k, m):
    wall_plate = k.object('warning_plate', plate(m, 0.012), cls='fixed', lods=(0.5,),
                          distances=(25.0,), smooth=30.0, texel_scale=1.6)
    wall_plate.anchor('sign', (0.0, 0.0125, 1.42), forward=FRONT, width=0.38, height=0.15, shape='rect')
    wall_plate.anchor('mount', (0.0, 0.0, 1.6), forward=FRONT)
    wall_plate.box('body', (0.0, 0.007, 1.6), (0.46, 0.014, 0.61))

    pole = S.pole(0.03, 0.03, 0.0, 2.25, m['pole'], seg=10, step=0.8)
    cap = S.cyl(0.032, 0.02, at=(0.0, 0.0, 2.25), mat=m['pole'], seg=10, ground=True)
    clamps = S.join([S.box((0.08, 0.075, 0.03), at=(0.0, 0.0, z), ground=True) for z in (1.4, 1.78)])
    S.done(clamps, m['bolt'], skip=1)
    post = k.object('warning_post', [pole, cap, clamps] + plate(m, 0.045), cls='knockable', mass=14.0,
                    lods=(0.4, 0.15), distances=(25.0, 60.0), smooth=30.0, texel_scale=1.4)
    post.anchor('sign', (0.0, 0.0455, 1.42), forward=FRONT, width=0.38, height=0.15, shape='rect')
    post.cyl('pole', (0.0, 0.0, 1.13), radius=0.04, height=2.26)


def make(a):
    m = palette()
    k = SetKit(a, gap=0.8, row_gap=1.2, row_width=12.0)
    cinder(k, m)
    crates(k, m)
    tyres(k, m)
    k.row()
    cardboard(k, m)
    mattresses(k, m)
    signs(k, m)
    k.row()
    skip(k, m)
    shopping_trolley(k, m)
    pallet_fence(k, m)
    k.layout()
    a.bake(size=1024, orm_size=512, normal_size=1024, bevel_radius=0.004, occlusion_distance=0.4,
           material_texels={'cutout_wire': 1.6, 'sign_enamel': 1.8})


def assemble(a):
    SetKit.of(a).levels()
