"""Commerce set: what shops and cafes put out on the pavement, in one file. Original designs at
real size, sharing one atlas (see _setkit.py for how a set is laid out and named). Fronts look
towards +Y. No lettering anywhere (ART-RULES rule 3): every place a name belongs is a blank face
with an anchor_sign* the game paints from game/src/catalog (shopsAndProperties, brandsAndSignage).

    awning_shop       a 3 m folding-arm shop awning on a wall at y = 0 behind it, mounted at
                      2.75 m: roller hood, sagging canvas in the `paint_awning` role (the game
                      tints it per shop), front bar, valance with anchor_sign
    aframe_board      a hinged sandwich board: two framed chalkboards, anchor_sign_a / _b
    cafe_table        a bistro table: cast cross foot, column, round top
    cafe_chair        an aluminium bistro chair with teak slats (anchor_seat)
    cafe_set          a table with three chairs and an open parasol through it
    parasol_closed    a furled market parasol on its weighted base
    vending_drinks    a drinks machine: lit front panel (lamp_panel, anchor_sign), keypad,
                      card reader, delivery flap
    vending_snacks    a snack machine: glazed front over rows of packets, lit strip inside
    news_stand        a green steel news stand: tiered racks of magazines with blank covers,
                      a tall back rack, a small roof with a fascia (anchor_sign)
    fruit_stall       a market stall: trestle table with crates of oranges, apples, limes,
                      bananas, tomatoes and mangoes, a striped canopy with a valance (anchor_sign)
    hotdog_cart       a stainless steel cart on two wheels with steam wells, condiments, a gas
                      bottle and a striped umbrella; anchor_sign on its front panel

The budget is raised because this is eleven objects in one file.
"""
import math

from mathutils import Euler, Vector

from lib import build
from lib import materials as M

import _finishes as F
import _shapes as S
from _setkit import SetKit

ASSET = {
    'id': 'set_commerce',
    'kind': 'prop',
    'atlas': 1024,
    'budget': {'triangles': 14000, 'draws': 28, 'bytes': 520000},
}

FRONT = (0.0, 1.0, 0.0)


# -- materials ----------------------------------------------------------------------------------

def cell_random(graph, size_x, size_z, axis_x='X'):
    """A 0..1 value that is constant over cells of size_x by size_z metres."""
    cx = graph.math('FLOOR', graph.mul(graph.axis(axis_x), 1.0 / size_x))
    cz = graph.math('FLOOR', graph.mul(graph.axis('Z'), 1.0 / size_z))
    seed = graph.add(graph.mul(cx, 12.9898), graph.mul(cz, 78.233))
    return graph.math('FRACT', graph.mul(graph.math('SINE', seed), 43758.5453))


COVER_COLOURS = [(0.0, (0.5, 0.06, 0.04)), (0.18, (0.05, 0.12, 0.35)), (0.34, (0.6, 0.45, 0.06)),
                 (0.5, (0.55, 0.55, 0.52)), (0.64, (0.06, 0.25, 0.1)), (0.8, (0.45, 0.12, 0.3)),
                 (0.92, (0.04, 0.04, 0.045))]


def covers(name, seed, size=(0.22, 0.3), axis='X'):
    """Magazine and packet fronts: blocks of colour per item with a pale band and a dark band
    (blank: the game paints no words here, and there are none)."""
    def pattern(graph):
        pick = cell_random(graph, size[0], size[1], axis)
        base = graph.ramp(pick, COVER_COLOURS, interpolation='CONSTANT')
        level = graph.math('FRACT', graph.mul(graph.axis('Z'), 1.0 / size[1]))
        band = F.between(graph, level, 0.62, 0.78, 0.01)
        strip = F.between(graph, level, 0.18, 0.24, 0.01)
        base = graph.mix(band, base, (0.62, 0.61, 0.58))
        base = graph.mix(graph.mul(strip, pick), base, (0.03, 0.03, 0.03))
        edge = graph.math('FRACT', graph.mul(graph.axis(axis), 1.0 / size[0]))
        gap = graph.maximum(graph.invert(graph.mask(edge, 0.04, 0.01)), graph.mask(edge, 0.96, 0.01))
        return graph.mix(gap, base, (0.02, 0.02, 0.02))

    return F.coated(name, pattern, seed=seed, roughness=0.3, chips=0.0, rust=0.0, grime=0.2,
                    dust=0.1, fade=0.3, scratches=0.0)


def produce(name, color, scale, seed, stretch=None, second=None):
    """Fruit heaped in a crate: one ball per Voronoi cell, shaded round, a few in a second tone."""
    def cells(graph):
        return graph.voronoi(scale=scale, feature='F1', randomness=0.9,
                             stretch=stretch or (1.0, 1.0, 1.0))

    def pattern(graph):
        ball = graph.remap(cells(graph), 0.0, 0.5, 1.0, 0.35, smooth=True)
        tone = graph.rgb(color)
        if second is not None:
            tone = graph.mix(graph.mask(graph.noise(scale=scale * 0.7, detail=1.0), 0.6, 0.05), tone,
                             second)
        return graph.hsv(tone, value=ball)

    return F.coated(name, pattern, seed=seed, roughness=0.35, chips=0.0, rust=0.0, grime=0.1,
                    dust=0.1, fade=0.1, scratches=0.0, variation=0.12,
                    height=lambda graph: graph.remap(cells(graph), 0.0, 0.5, 1.0, 0.0, smooth=True),
                    bump=0.03)


def gores(name, color_a, color_b, count, seed):
    """Canvas sewn from `count` gores alternating in two colours round the Z axis."""
    def pattern(graph):
        angle = graph.math('ARCTAN2', graph.axis('Y'), graph.axis('X'))
        return graph.mix(F.bands(graph, angle, math.tau / (count / 2), share=0.5, soft=0.01),
                         color_a, color_b)

    return F.coated(name, pattern, seed=seed, roughness=0.85, chips=0.0, rust=0.0, grime=0.4,
                    dust=0.3, fade=0.55, scratches=0.0)


def palette():
    canvas_seams = lambda graph: graph.mul(F.bands(graph, graph.axis('X'), 0.5, share=0.02, soft=0.5), -1.0)
    return {
        'awning': F.coated('paint_awning', lambda graph: graph.paint_color((0.05, 0.2, 0.14)),
                           seed=601, roughness=0.85, chips=0.0, rust=0.0, grime=0.5, dust=0.3,
                           fade=0.6, splash=0.0, scratches=0.0, height=canvas_seams, bump=0.004),
        'frame': F.enamel('awning_frame', (0.05, 0.05, 0.052), seed=602, wear_amount=0.5),
        'chalk': F.coated('chalkboard', (0.03, 0.04, 0.035), seed=603, roughness=0.85, chips=0.0,
                          rust=0.0, grime=0.3, dust=0.6, fade=0.2, scratches=0.6),
        'wood': M.wood(color=(0.4, 0.25, 0.13), weathered=0.5, grain_axis='Z', seed=604,
                       name='board_wood'),
        'teak': M.wood(color=(0.45, 0.3, 0.17), weathered=0.6, grain_axis='X', seed=605,
                       name='chair_teak'),
        'alu': M.brushed_metal(color=(0.55, 0.56, 0.57), direction='Z', grime=0.4, seed=606,
                               name='chair_alu'),
        'cast': M.cast_metal(color=(0.04, 0.04, 0.042), rust=0.3, seed=607, name='cast_iron'),
        'top': F.enamel('table_top', (0.34, 0.36, 0.33), seed=608, wear_amount=0.4),
        'canvas': F.coated('parasol_canvas', (0.58, 0.54, 0.44), seed=609, roughness=0.85,
                           chips=0.0, rust=0.0, grime=0.4, dust=0.3, fade=0.5, scratches=0.0,
                           height=canvas_seams, bump=0.004),
        'base': M.plastic(color=(0.04, 0.04, 0.045), roughness=0.55, scuffs=0.6, seed=610,
                          name='parasol_base'),
        'vend': F.enamel('vending_body', (0.09, 0.012, 0.012), seed=611, wear_amount=0.35),
        'vend_dark': F.enamel('vending_black', (0.025, 0.025, 0.028), seed=612, wear_amount=0.35),
        'panel': M.lamp(color=(0.8, 0.88, 1.0), strength=4.0, seed=613, name='lamp_panel'),
        'glass': M.glass(tint=(0.6, 0.66, 0.68), opacity=0.25, seed=614, name='glass'),
        'keys': F.coated('keypad', F.striped((0.5, 0.5, 0.48), (0.03, 0.03, 0.03), 0.045, axes='Z',
                                             share=0.6), seed=615, roughness=0.3, chips=0.0,
                         rust=0.0, grime=0.4, dust=0.2, fade=0.2, scratches=0.4),
        'flap': M.plastic(color=(0.02, 0.02, 0.022), roughness=0.4, scuffs=0.6, seed=616,
                          name='flap_plastic'),
        'snacks': covers('snack_rows', 617, size=(0.075, 0.2)),
        'magazines': covers('magazine_covers', 618, size=(0.22, 0.3)),
        'news': F.enamel('newsstand_green', (0.03, 0.11, 0.06), seed=619, wear_amount=0.5,
                         splash=0.5),
        'crate': M.wood(color=(0.55, 0.42, 0.27), weathered=0.6, grain_axis='X', seed=620,
                        name='crate_wood'),
        'orange': produce('fruit_orange', (0.62, 0.2, 0.015), 13.0, 621),
        'apple': produce('fruit_apple', (0.38, 0.03, 0.02), 12.0, 622, second=(0.45, 0.32, 0.05)),
        'lime': produce('fruit_lime', (0.1, 0.28, 0.02), 17.0, 623),
        'banana': produce('fruit_banana', (0.6, 0.45, 0.05), 9.0, 624, stretch=(0.35, 1.0, 1.0),
                          second=(0.25, 0.32, 0.04)),
        'tomato': produce('fruit_tomato', (0.45, 0.025, 0.012), 14.0, 625),
        'mango': produce('fruit_mango', (0.6, 0.3, 0.03), 10.0, 626, second=(0.42, 0.06, 0.03)),
        'stall': F.coated('stall_canvas', F.striped((0.42, 0.04, 0.03), (0.6, 0.58, 0.52), 0.5,
                                                    axes='X'), seed=627, roughness=0.85, chips=0.0,
                          rust=0.0, grime=0.45, dust=0.3, fade=0.6, scratches=0.0),
        'trestle': M.galvanized(spangle=0.3, rust=0.4, seed=628, name='trestle_zinc'),
        'board': M.wood(color=(0.42, 0.33, 0.22), weathered=0.8, grain_axis='X', seed=629,
                        name='table_board'),
        'steel': M.brushed_metal(color=(0.62, 0.63, 0.64), direction='X', grime=0.5, seed=630,
                                 name='stainless'),
        'rubber': M.rubber(dust=0.5, seed=631, name='tyre_rubber'),
        'umbrella': gores('umbrella_gores', (0.45, 0.05, 0.03), (0.62, 0.5, 0.08), 8, 632),
        'ketchup': M.plastic(color=(0.4, 0.02, 0.015), roughness=0.3, scuffs=0.3, seed=633,
                             name='bottle_red'),
        'mustard': M.plastic(color=(0.6, 0.42, 0.02), roughness=0.3, scuffs=0.3, seed=634,
                             name='bottle_yellow'),
        'gas': F.enamel('gas_bottle', (0.5, 0.2, 0.03), seed=635, wear_amount=0.6),
        'sign': F.coated('sign_blank', (0.56, 0.55, 0.52), seed=636, roughness=0.4, chips=0.3,
                         rust=0.1, grime=0.4, dust=0.3, fade=0.4, scratches=0.3),
    }


# -- builders -----------------------------------------------------------------------------------

def sheet(rows, mat, facing=None, double=False):
    """A quad grid through rows of points (each row the same length): one mesh."""
    width = len(rows[0])
    verts = [tuple(point) for row in rows for point in row]
    faces = [(i * width + j, i * width + j + 1, (i + 1) * width + j + 1, (i + 1) * width + j)
             for i in range(len(rows) - 1) for j in range(width - 1)]
    if facing is not None:
        a, b, c = (Vector(verts[index]) for index in faces[0][:3])
        if (b - a).cross(c - a).dot(Vector(facing)) < 0:
            faces = [tuple(reversed(face)) for face in faces]
    parts = [S.done(build.from_data('part', verts, faces), mat)]
    if double:
        flipped = [tuple(reversed(face)) for face in faces]
        parts.append(S.done(build.from_data('part', verts, flipped), mat))
    return parts


def turned(parts, angle, at=(0.0, 0.0, 0.0)):
    for part in parts:
        S.move(part, rot=(0.0, 0.0, angle))
        S.move(part, at=at)
    return parts


def awning(k, m):
    parts = [S.box((3.1, 0.1, 0.12), at=(0.0, 0.05, 2.7), ground=True, mat=m['frame']),
             S.cyl(0.075, 3.05, at=(0.0, 0.15, 2.8), axis='X', seg=10, mat=m['frame'])]
    rows = []
    for i in range(5):
        t = i / 4
        y = 0.2 + t * 1.22
        z = 2.76 - t * 0.47 - math.sin(math.pi * t) * 0.05
        rows.append([(x, y, z - (0.025 * math.sin(math.pi * t) if x == 0.0 else 0.0))
                     for x in (-1.5, 0.0, 1.5)])
    parts += sheet(rows, m['awning'], facing=(0.0, 0.3, 1.0), double=True)
    parts.append(S.box((3.02, 0.012, 0.26), at=(0.0, 1.43, 2.03), ground=True, mat=m['awning']))
    parts.append(S.box((3.06, 0.05, 0.05), at=(0.0, 1.42, 2.26), ground=True, mat=m['frame']))
    arms = [S.pipe([(sx * 1.38, 0.08, 2.45), (sx * 1.2, 0.75, 2.4), (sx * 1.36, 1.39, 2.27)], 0.018, seg=6)
            for sx in (-1, 1)]
    parts.append(S.done(S.join(arms), m['frame']))
    brackets = [S.box((0.1, 0.08, 0.18), at=(sx * 1.38, 0.04, 2.36), ground=True) for sx in (-1, 1)]
    parts.append(S.done(S.join(brackets), m['frame'], skip=1))
    obj = k.object('awning_shop', parts, cls='fixed', lods=(0.4,), distances=(40.0,), smooth=30.0,
                   texel_scale=0.8)
    obj.anchor('sign', (0.0, 1.437, 2.16), forward=FRONT, width=2.7, height=0.2, shape='rect')
    obj.anchor('mount', (0.0, 0.0, 2.75), forward=FRONT)
    obj.box('body', (0.0, 0.72, 2.42), (3.1, 1.45, 0.8))


def aframe(k, m):
    tilt = math.asin(0.27 / 0.95)

    def board():
        pieces = [S.box((0.035, 0.022, 0.95), at=(sx * 0.2825, 0.0, -0.95), ground=True, mat=m['wood'])
                  for sx in (-1, 1)]
        pieces.append(S.box((0.6, 0.022, 0.07), at=(0.0, 0.0, -0.07), ground=True, mat=m['wood']))
        pieces.append(S.box((0.6, 0.022, 0.09), at=(0.0, 0.0, -0.89), ground=True, mat=m['wood']))
        pieces.append(S.box((0.53, 0.012, 0.73), at=(0.0, 0.0, -0.8), ground=True, mat=m['chalk']))
        for piece in pieces:
            S.move(piece, rot=(-tilt, 0.0, 0.0))
            S.move(piece, at=(0.0, 0.0, 0.95 * math.cos(tilt)))
        return pieces

    front = board()
    back = turned(board(), math.pi)
    hinges = [S.cyl(0.012, 0.08, at=(sx * 0.2, 0.0, 0.92), axis='X', seg=6) for sx in (-1, 1)]
    chain = S.rod((0.27, -0.14, 0.45), (0.27, 0.14, 0.45), 0.004, seg=4)
    parts = front + back + [S.done(S.join(hinges + [chain]), m['frame'], skip=1)]
    obj = k.object('aframe_board', parts, cls='knockable', mass=7.0, lods=(0.35,), distances=(20.0,),
                   smooth=30.0, texel_scale=1.4)
    normal = (0.0, math.cos(tilt), math.sin(tilt))
    obj.anchor('sign_a', (0.0, 0.14, 0.5), forward=normal, width=0.5, height=0.7, shape='rect')
    obj.anchor('sign_b', (0.0, -0.14, 0.5), forward=(0.0, -normal[1], normal[2]), width=0.5, height=0.7,
               shape='rect')
    obj.box('body', (0.0, 0.0, 0.46), (0.62, 0.58, 0.92))


def table_parts(m, at=(0.0, 0.0)):
    x, y = at
    parts = [S.box((0.5, 0.06, 0.035), at=(x, y, 0.0), ground=True, mat=m['cast']),
             S.box((0.06, 0.5, 0.035), at=(x, y, 0.0), ground=True, mat=m['cast']),
             S.cyl(0.06, 0.06, at=(x, y, 0.0), ground=True, seg=8, mat=m['cast']),
             S.pole(0.028, 0.022, 0.06, 0.72, m['cast'], seg=8),
             S.cyl(0.3, 0.025, at=(x, y, 0.72), ground=True, seg=20, mat=m['top']),
             S.cyl(0.12, 0.02, at=(x, y, 0.70), ground=True, seg=8, mat=m['cast'], skip=1)]
    S.move(parts[3], at=(x, y, 0.0))
    return parts


def chair_parts(m):
    tubes = []
    for sx in (-1, 1):
        tubes.append(S.rod((sx * 0.2, 0.2, 0.0), (sx * 0.2, 0.19, 0.44), 0.012, seg=6))
        tubes.append(S.pipe([(sx * 0.2, -0.2, 0.0), (sx * 0.2, -0.19, 0.44), (sx * 0.19, -0.27, 0.86)],
                            0.012, seg=6))
        tubes.append(S.rod((sx * 0.2, 0.19, 0.44), (sx * 0.2, -0.19, 0.44), 0.01, seg=6))
        tubes.append(S.rod((sx * 0.2, 0.2, 0.17), (sx * 0.2, -0.2, 0.17), 0.007, seg=4, skip=1))
    tubes.append(S.rod((-0.2, 0.19, 0.44), (0.2, 0.19, 0.44), 0.01, seg=6))
    parts = [S.done(S.join(tubes), m['alu'])]
    slats = [S.box((0.42, 0.055, 0.016), at=(0.0, y, 0.445), ground=True) for y in (-0.15, -0.075, 0.0, 0.075, 0.15)]
    for index, z in enumerate((0.62, 0.72, 0.81)):
        back = S.box((0.4, 0.016, 0.065), at=(0.0, 0.0, 0.0), ground=True)
        S.move(back, rot=(-0.18, 0.0, 0.0))
        S.move(back, at=(0.0, -0.225 - 0.016 * index, z))
        slats.append(back)
    parts.append(S.done(S.join(slats), m['teak']))
    return parts


def parasol_open(m, z_top=2.45, radius=1.2):
    pole = S.pole(0.02, 0.02, 0.0, z_top, m['alu'], seg=6)
    parts = [pole]
    parts.append(S.lathe([(0.03, z_top + 0.02), (radius, z_top - 0.36)], m['canvas'], seg=8))
    parts.append(S.lathe([(radius, z_top - 0.362), (0.03, z_top + 0.018)], m['canvas'], seg=8))
    parts.append(S.lathe([(radius, z_top - 0.36), (radius, z_top - 0.5)], m['canvas'], seg=8))
    parts.append(S.lathe([(radius - 0.005, z_top - 0.5), (radius - 0.005, z_top - 0.36)], m['canvas'], seg=8))
    parts.append(S.sphere(0.04, at=(0.0, 0.0, z_top + 0.05), mat=m['alu'], seg=6, rings=4, skip=1))
    ribs = [S.rod((0.0, 0.0, z_top - 0.4), (0.6 * math.cos(a), 0.6 * math.sin(a), z_top - 0.2), 0.006, seg=4)
            for a in (math.tau * i / 8 + math.pi / 8 for i in range(8))]
    parts.append(S.done(S.join(ribs), m['alu'], skip=1))
    return parts


def cafe(k, m):
    table = k.object('cafe_table', table_parts(m), cls='knockable', mass=18.0, lods=(0.35,),
                     distances=(20.0,), smooth=40.0, texel_scale=1.3)
    table.cyl('body', (0.0, 0.0, 0.375), radius=0.31, height=0.75)

    chair = k.object('cafe_chair', chair_parts(m), cls='scatter', mass=4.0, lods=(0.3,),
                     distances=(18.0,), smooth=40.0, texel_scale=1.3)
    chair.anchor('seat', (0.0, 0.0, 0.45), forward=FRONT)
    chair.box('body', (0.0, -0.02, 0.43), (0.44, 0.5, 0.86))

    parts = table_parts(m) + parasol_open(m)
    for angle in (0.0, 2.1, 4.2):
        seat = chair_parts(m)
        for part in seat:
            S.move(part, at=(0.0, -0.62, 0.0))
        parts += turned(seat, angle)
    group = k.object('cafe_set', parts, cls='knockable', mass=50.0, lods=(0.35, 0.12),
                     distances=(20.0, 50.0), smooth=40.0, texel_scale=0.9)
    for index, angle in enumerate((0.0, 2.1, 4.2), start=1):
        seat = Vector((0.0, -0.62, 0.45))
        seat.rotate(Euler((0.0, 0.0, angle)))
        facing = Vector((0.0, 1.0, 0.0))
        facing.rotate(Euler((0.0, 0.0, angle)))
        group.anchor(f'seat_{index}', tuple(seat), forward=tuple(facing))
    group.cyl('table', (0.0, 0.0, 0.375), radius=0.35, height=0.75)
    group.cyl('chairs', (0.0, 0.0, 0.43), radius=0.9, height=0.86)

    furled = [S.cyl(0.25, 0.08, ground=True, seg=12, mat=m['base']),
              S.pole(0.022, 0.02, 0.08, 2.5, m['alu'], seg=6),
              S.lathe([(0.02, 1.15), (0.1, 1.45), (0.12, 1.9), (0.07, 2.25), (0.02, 2.45)], m['canvas'], seg=8),
              S.torus(0.115, 0.012, at=(0.0, 0.0, 1.75), seg=8, sides=3, mat=m['canvas'], skip=1),
              S.sphere(0.04, at=(0.0, 0.0, 2.52), mat=m['alu'], seg=6, rings=4, skip=1)]
    closed = k.object('parasol_closed', furled, cls='knockable', mass=25.0, lods=(0.35,),
                      distances=(25.0,), smooth=40.0, texel_scale=1.0)
    closed.cyl('body', (0.0, 0.0, 1.25), radius=0.15, height=2.5)


def vending(k, m):
    for name, body, glazed in (('vending_drinks', 'vend', False), ('vending_snacks', 'vend_dark', True)):
        parts = [S.rbox(0.9, 0.75, 1.83, 0.02, at=(0.0, 0.0, 0.0), mat=m[body]),
                 S.box((0.86, 0.7, 0.06), at=(0.0, 0.0, 0.0), ground=True, mat=m['flap'])]
        parts.append(S.box((0.22, 0.02, 0.55), at=(0.3, 0.38, 0.95), ground=True, mat=m['keys']))
        parts.append(S.box((0.14, 0.02, 0.06), at=(0.3, 0.385, 1.56), ground=True, mat=m['flap'], skip=1))
        parts.append(S.box((0.1, 0.03, 0.08), at=(0.3, 0.39, 0.8), ground=True, mat=m['flap'], skip=1))
        parts.append(S.box((0.56, 0.03, 0.2), at=(-0.12, 0.38, 0.12), ground=True, mat=m['flap']))
        if glazed:
            parts.append(S.box((0.62, 0.02, 1.32), at=(-0.12, 0.2, 0.45), ground=True, mat=m['snacks']))
            shelves = [S.box((0.62, 0.17, 0.012), at=(-0.12, 0.3, z), ground=True) for z in (0.62, 0.84, 1.06, 1.28, 1.5)]
            parts.append(S.done(S.join(shelves), m['steel']))
            parts.append(S.box((0.03, 0.02, 1.3), at=(-0.45, 0.33, 0.46), ground=True, mat=m['panel']))
            frame = [S.box((0.7, 0.04, 0.04), at=(-0.12, 0.385, z), ground=True) for z in (0.42, 1.79)]
            frame += [S.box((0.04, 0.04, 1.41), at=(x, 0.385, 0.42), ground=True) for x in (-0.47, 0.23)]
            parts.append(S.done(S.join(frame), m['vend_dark']))
            parts.append(S.box((0.66, 0.01, 1.33), at=(-0.12, 0.392, 0.44), ground=True, mat=m['glass']))
        else:
            parts.append(S.box((0.6, 0.03, 1.4), at=(-0.12, 0.375, 0.38), ground=True, mat=m['panel']))
            frame = [S.box((0.68, 0.05, 0.04), at=(-0.12, 0.39, z), ground=True) for z in (0.34, 1.78)]
            frame += [S.box((0.04, 0.05, 1.48), at=(x, 0.39, 0.34), ground=True) for x in (-0.44, 0.2)]
            parts.append(S.done(S.join(frame), m['vend_dark']))
        machine = k.object(name, parts, cls='fixed', lods=(0.4, 0.15), distances=(25.0, 60.0),
                           smooth=30.0, texel_scale=1.2)
        if not glazed:
            machine.anchor('sign',(-0.12, 0.392, 1.08), forward=FRONT, width=0.56, height=1.34, shape='rect')
        machine.anchor('use', (0.0, 0.85, 0.0), forward=(0.0, -1.0, 0.0))
        machine.box('body', (0.0, 0.0, 0.915), (0.9, 0.75, 1.83))


def news_stand(k, m):
    parts = [S.box((1.5, 0.55, 0.62), at=(0.0, 0.0, 0.0), ground=True, mat=m['news']),
             S.box((1.5, 0.12, 2.1), at=(0.0, -0.33, 0.0), ground=True, mat=m['news'])]
    for index, (y, z) in enumerate(((0.25, 0.62), (0.07, 0.8), (-0.11, 0.98))):
        tier = S.box((1.44, 0.2, 0.025), at=(0.0, 0.0, 0.0), ground=True, mat=m['magazines'])
        S.move(tier, rot=(0.35, 0.0, 0.0))
        S.move(tier, at=(0.0, y, z))
        parts.append(tier)
        lip = S.box((1.44, 0.02, 0.04), at=(0.0, y + 0.095, z - 0.04), ground=True, mat=m['news'], skip=1)
        parts.append(lip)
    parts.append(S.box((1.4, 0.03, 0.92), at=(0.0, -0.255, 1.12), ground=True, mat=m['magazines']))
    rails = [S.rod((-0.7, -0.23, z), (0.7, -0.23, z), 0.006, seg=4) for z in (1.32, 1.62, 1.92)]
    parts.append(S.done(S.join(rails), m['trestle'], skip=1))
    roof = S.box((1.7, 0.85, 0.05), at=(0.0, 0.0, 0.0), ground=True, mat=m['news'])
    S.move(roof, rot=(0.12, 0.0, 0.0))
    S.move(roof, at=(0.0, -0.02, 2.18))
    parts.append(roof)
    parts.append(S.box((1.7, 0.03, 0.22), at=(0.0, 0.41, 2.06), ground=True, mat=m['sign']))
    stand = k.object('news_stand', parts, cls='fixed', lods=(0.4, 0.15), distances=(25.0, 60.0),
                     smooth=30.0, texel_scale=1.2)
    stand.anchor('sign', (0.0, 0.427, 2.17), forward=FRONT, width=1.6, height=0.19, shape='rect')
    stand.anchor('use', (0.0, 0.9, 0.0), forward=(0.0, -1.0, 0.0))
    stand.box('body', (0.0, 0.0, 1.13), (1.7, 0.85, 2.26))


def crate(m, fruit, at, tilt=0.0):
    pieces = [S.box((0.58, 0.38, 0.2), ground=True, mat=m['crate']),
              S.sphere(0.5, at=(0.0, 0.0, 0.18), scale=(0.27, 0.17, 0.08), mat=m[fruit], seg=10, rings=5)]
    for piece in pieces:
        S.move(piece, rot=(tilt, 0.0, 0.0))
        S.move(piece, at=at)
    return pieces


def fruit_stall(k, m):
    parts = [S.box((2.0, 0.95, 0.04), at=(0.0, 0.0, 0.76), ground=True, mat=m['board'])]
    legs = [S.rod((sx * 0.85, sy * 0.4, 0.0), (sx * 0.8, sy * 0.38, 0.76), 0.02, seg=6)
            for sx in (-1, 1) for sy in (-1, 1)]
    poles = [S.rod((sx * 1.0, sy * 0.48, 0.0), (sx * 1.0, sy * 0.48, 2.2 if sy > 0 else 2.45), 0.022, seg=6)
             for sx in (-1, 1) for sy in (-1, 1)]
    parts.append(S.done(S.join(legs + poles), m['trestle']))
    parts.append(S.box((2.0, 0.4, 0.22), at=(0.0, -0.25, 0.8), ground=True, mat=m['board']))
    fruits = ('orange', 'apple', 'lime', 'banana', 'tomato', 'mango')
    for index, x in enumerate((-0.62, 0.0, 0.62)):
        parts += crate(m, fruits[index], (x, 0.22, 0.83), tilt=0.22)
        parts += crate(m, fruits[index + 3], (x, -0.25, 1.03), tilt=0.12)
    parts += crate(m, 'orange', (-0.5, 0.0, 0.0))
    parts.append(S.box((0.58, 0.38, 0.2), at=(0.45, 0.05, 0.0), ground=True, mat=m['crate']))
    parts.append(S.box((0.58, 0.38, 0.2), at=(0.47, 0.03, 0.2), ground=True, mat=m['crate']))
    rows = [[(x, y, z) for x in (-1.1, 0.0, 1.1)] for y, z in ((-0.6, 2.47), (0.0, 2.36), (0.62, 2.2))]
    parts += sheet(rows, m['stall'], facing=(0.0, 0.0, 1.0), double=True)
    parts.append(S.box((2.2, 0.012, 0.24), at=(0.0, 0.62, 1.96), ground=True, mat=m['stall']))
    stall = k.object('fruit_stall', parts, cls='fixed', lods=(0.35, 0.12), distances=(25.0, 60.0),
                     smooth=35.0, texel_scale=1.0)
    stall.anchor('sign', (0.0, 0.627, 2.08), forward=FRONT, width=2.0, height=0.2, shape='rect')
    stall.anchor('use', (0.0, -0.75, 0.0), forward=FRONT)
    stall.box('body', (0.0, 0.0, 1.2), (2.2, 1.25, 2.47))


def hotdog_cart(k, m):
    parts = [S.rbox(1.4, 0.7, 0.62, 0.04, at=(0.0, 0.0, 0.28), mat=m['steel']),
             S.box((1.44, 0.74, 0.03), at=(0.0, 0.0, 0.9), ground=True, mat=m['steel']),
             S.box((1.2, 0.012, 0.42), at=(0.0, 0.356, 0.36), ground=True, mat=m['sign'])]
    for x in (-0.38, 0.0):
        parts.append(S.lathe([(0.17, 0.93), (0.15, 1.0), (0.04, 1.03), (0.0, 1.035)], m['steel'], seg=10,
                             at=(x, 0.0, 0.0)))
    parts.append(S.box((0.4, 0.5, 0.02), at=(0.42, 0.0, 0.93), ground=True, mat=m['cast']))
    parts.append(S.cyl(0.035, 0.2, at=(0.62, 0.25, 0.93), ground=True, seg=8, mat=m['ketchup'], skip=1))
    parts.append(S.cyl(0.035, 0.2, at=(0.62, 0.17, 0.93), ground=True, seg=8, mat=m['mustard'], skip=1))
    for sy in (-1, 1):
        parts.append(S.cyl(0.25, 0.06, at=(-0.45, sy * 0.4, 0.25), axis='Y', seg=12, mat=m['rubber']))
        parts.append(S.cyl(0.08, 0.07, at=(-0.45, sy * 0.4, 0.25), axis='Y', seg=8, mat=m['steel']))
        parts.append(S.rod((0.6, sy * 0.3, 0.0), (0.6, sy * 0.3, 0.3), 0.02, m['steel'], seg=6))
    parts.append(S.pipe([(0.7, -0.3, 0.85), (0.95, -0.3, 0.95), (0.95, 0.3, 0.95), (0.7, 0.3, 0.85)],
                        0.016, m['steel'], seg=6))
    parts.append(S.cyl(0.13, 0.4, at=(0.25, 0.0, 0.02), ground=True, seg=10, mat=m['gas']))
    parts.append(S.box((1.3, 0.6, 0.02), at=(0.05, 0.0, 0.04), ground=True, mat=m['steel']))
    pole = S.pole(0.018, 0.018, 0.93, 2.3, m['alu'], seg=6)
    S.move(pole, at=(0.55, -0.25, 0.0))
    parts.append(pole)
    canopy = [S.lathe([(0.02, 2.4), (0.95, 2.12)], m['umbrella'], seg=8),
              S.lathe([(0.95, 2.118), (0.02, 2.398)], m['umbrella'], seg=8)]
    for piece in canopy:
        S.move(piece, at=(0.55, -0.25, 0.0))
    parts += canopy
    cart = k.object('hotdog_cart', parts, cls='knockable', mass=120.0, lods=(0.35, 0.12),
                    distances=(25.0, 60.0), smooth=35.0, texel_scale=1.1)
    cart.anchor('sign', (0.0, 0.364, 0.57), forward=FRONT, width=1.1, height=0.36, shape='rect')
    cart.anchor('use', (0.0, -0.75, 0.0), forward=FRONT)
    cart.box('body', (0.05, 0.0, 0.5), (1.6, 0.85, 1.0))


def make(a):
    m = palette()
    k = SetKit(a, gap=0.8, row_gap=1.2, row_width=10.0)
    awning(k, m)
    aframe(k, m)
    cafe(k, m)
    k.row()
    vending(k, m)
    news_stand(k, m)
    hotdog_cart(k, m)
    k.row()
    fruit_stall(k, m)
    k.layout()
    a.bake(size=1024, orm_size=512, normal_size=1024, bevel_radius=0.003, occlusion_distance=0.5,
           material_texels={'snack_rows': 1.5, 'magazine_covers': 1.5, 'sign_blank': 0.6})


def assemble(a):
    SetKit.of(a).levels()
