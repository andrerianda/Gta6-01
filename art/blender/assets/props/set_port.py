"""Port set: the container terminal of Puerto Tamarindo in one file, so the quay and its yards
stop looking empty. Original designs at real size, sharing one atlas (see _setkit.py for how a
set is laid out and named). Fronts look towards +Y.

    container_20      a 20 ft ISO box (6.058 x 2.438 x 2.591 m): corrugated walls in real
                      geometry, corner castings, posts and rails, two doors at +X with four
                      locking bars, cams, handles and hinges; the shell is the `paint` role,
                      so every instance takes its own line colour (setPaint / instance colour)
    container_40      the same at 40 ft (12.192 m)
    container_stack   a block of eight 40 ft boxes in three columns (3, 3 and 2 high), each in
                      its own baked livery (maroon, blue, green, orange, grey, teal, red,
                      cream; two carry an invented wave mark), faces between boxes removed
    quay_crane        a ship-to-shore gantry crane: four legs on rail bogies (gauge 30.48 m,
                      legs 18 m apart along the quay), sill beams, portal beams, twin girders,
                      a boom reaching 50 m over the water (+Y), the A-frame with fore- and
                      backstays, machinery house, trolley, hanging cab and spreader
    steel_shed        one 6 m bay of a portal-frame steel shed, 14 m deep, eaves 6.5 m:
                      ribbed cladding, a roll-up door on the front (+Y), gutters, downpipes,
                      pitched roof; bays butt end to end along X at a 6 m pitch
    steel_shed_end    the gable wall that closes a run of bays, with a personnel door and a
                      louvre, standing on the plane x = 0 and facing +X
    forklift          a 3 t counterbalance forklift, forks lowered towards +Y, LPG bottle
    box_trailer       a 14.6 m dry-van semi-trailer dropped on its landing gear: white panel
                      sides, side skirts, tandem axle, rear doors with locking bars

No lettering anywhere (ART-RULES rule 3): the shipping-line and haulier names are painted by
the game at the anchor_sign* faces from game/src/catalog/brandsAndSignage.js.

The budget is raised because this is eight objects in one file, two of them very large (the
crane stands 72 m high and reaches 98 m) and the containers keep their corrugation in geometry.
"""
import math

from mathutils import Vector

from lib import build
from lib import materials as M

import _finishes as F
import _shapes as S
from _setkit import SetKit, _delete_faces

ASSET = {
    'id': 'set_port',
    'kind': 'prop',
    'atlas': 2048,
    'budget': {'triangles': 16000, 'draws': 22, 'bytes': 760000},
}

W20, W40, CW, CH = 6.058, 12.192, 2.438, 2.591
EAVE, RIDGE, SPAN = 6.5, 7.6, 7.0


# -- materials ----------------------------------------------------------------------------------

def ribs(graph, coordinate, period, share=0.5, soft=0.35):
    return F.bands(graph, coordinate, period, share=share, soft=soft)


def container_paint(name, seed, relief=None):
    """The tintable container shell: baked neutral, coloured per instance by the game."""
    return F.coated(name, lambda graph: graph.paint_color((0.3, 0.07, 0.05)), seed=seed,
                    roughness=0.55, chips=0.45, rust=0.55, grime=0.5, dust=0.3, fade=0.5,
                    splash=0.35, scratches=0.35, height=relief, bump=0.02)


def livery(name, color, seed, door, y_centre, mark=False):
    """A stacked box's baked paint: ribs on its walls, the seams of its door end, dark corner
    castings and, with mark=True, an invented two-line wave mark on its long sides."""
    def parts(graph):
        normal = graph.geometry('Normal')
        nx = graph.math('ABSOLUTE', graph.axis('X', normal))
        ny = graph.math('ABSOLUTE', graph.axis('Y', normal))
        along = graph.add(graph.mul(graph.axis('X'), ny), graph.mul(graph.axis('Y'), nx))
        rib = graph.mul(ribs(graph, along, 0.278), graph.add(nx, ny))
        level = graph.mul(graph.math('FRACT', graph.mul(graph.axis('Z'), 1.0 / CH)), CH)
        across = graph.sub(graph.axis('Y'), y_centre)
        on_door = graph.mask(graph.mul(graph.axis('X', normal), float(door)), 0.9, 0.02)
        seams = graph.maximum(
            F.between(graph, across, -0.008, 0.008, 0.002),
            graph.maximum(F.between(graph, level, 0.19, 0.21, 0.002),
                          F.between(graph, level, CH - 0.26, CH - 0.24, 0.002)))
        post = graph.mask(graph.math('ABSOLUTE', across), CW / 2 - 0.15, 0.004)
        seams = graph.mul(graph.maximum(seams, F.between(graph, graph.math('ABSOLUTE', across),
                                                          CW / 2 - 0.16, CW / 2 - 0.14, 0.003)),
                          on_door)
        end = graph.mask(graph.math('ABSOLUTE', graph.axis('X')), W40 / 2 - 0.18, 0.004)
        corner = graph.maximum(graph.mul(end, ny), graph.mul(post, nx))
        castings = graph.mul(corner, graph.maximum(graph.invert(graph.mask(level, 0.12, 0.004)),
                                                   graph.mask(level, CH - 0.12, 0.004)))
        wave = None
        if mark:
            crest = graph.add(1.3, graph.mul(graph.math('SINE', graph.mul(graph.axis('X'), 0.75)), 0.28))
            gap = graph.math('ABSOLUTE', graph.sub(level, crest))
            band = graph.maximum(F.between(graph, gap, -1.0, 0.13, 0.01),
                                 F.between(graph, gap, 0.24, 0.3, 0.01))
            span = F.between(graph, graph.mul(graph.axis('X'), float(door)), -1.0, 4.6, 0.02)
            wave = graph.mul(graph.mul(band, span), ny)
        return rib, seams, castings, wave

    def pattern(graph):
        _rib, seams, castings, wave = parts(graph)
        base = graph.rgb(color)
        if wave is not None:
            base = graph.mix(wave, base, (0.58, 0.57, 0.53))
        base = graph.mix(castings, base, (0.06, 0.045, 0.035))
        return graph.mix(seams, base, (0.015, 0.014, 0.013))

    def relief(graph):
        rib, seams, _castings, _wave = parts(graph)
        return graph.sub(rib, graph.mul(seams, 2.0))

    return F.coated(name, pattern, seed=seed, roughness=0.6, chips=0.45, rust=0.6, grime=0.5,
                    dust=0.35, fade=0.6, splash=0.3, scratches=0.35, height=relief, bump=0.03)


def cladding(name, color, axis, seed):
    """Trapezoid-profile steel sheet (ribs every 0.25 m across `axis`), factory-painted."""
    return F.coated(name, color, seed=seed, roughness=0.5, chips=0.2, rust=0.35, grime=0.55,
                    dust=0.3, fade=0.5, splash=0.6, scratches=0.15,
                    height=lambda graph: ribs(graph, graph.axis(axis), 0.25, share=0.32, soft=0.2),
                    bump=0.035)


def palette():
    """The materials of the set, by short name."""
    liveries = [
        ('livery_maroon', (0.2, 0.04, 0.03), True), ('livery_blue', (0.022, 0.07, 0.2), False),
        ('livery_green', (0.045, 0.14, 0.07), False), ('livery_orange', (0.46, 0.15, 0.025), False),
        ('livery_grey', (0.24, 0.25, 0.25), False), ('livery_teal', (0.018, 0.15, 0.17), True),
        ('livery_red', (0.36, 0.045, 0.028), False), ('livery_cream', (0.46, 0.43, 0.36), False),
    ]
    columns = [(0, 1, -CW), (1, 1, -CW), (2, 1, -CW), (3, -1, 0.0), (4, -1, 0.0), (5, -1, 0.0),
               (6, 1, CW), (7, 1, CW)]
    return {
        'paint': container_paint('paint', 501),
        'paint_door': container_paint('paint', 502, relief=lambda graph: ribs(
            graph, graph.axis('Y'), 0.2, share=0.45, soft=0.4)),
        'paint_roof': container_paint('paint', 503, relief=lambda graph: ribs(
            graph, graph.axis('X'), 0.23, share=0.5, soft=0.5)),
        'casting': F.enamel('casting_steel', (0.07, 0.06, 0.05), seed=504, wear_amount=0.9),
        'bar': M.galvanized(spangle=0.2, rust=0.55, seed=505, name='lock_bar'),
        'plate': F.coated('data_plate', (0.42, 0.42, 0.4), seed=506, roughness=0.3, chips=0.2,
                          rust=0.3, grime=0.5, dust=0.2, fade=0.2, scratches=0.3),
        'livery': [livery(name, color, 510 + index, door, y, mark)
                   for (name, color, mark), (index, door, y) in zip(liveries, columns)],
        'crane': F.enamel('crane_white', (0.6, 0.6, 0.57), seed=520, wear_amount=0.45),
        'crane_blue': F.slotted('crane_blue', (0.025, 0.09, 0.24), period=0.14, axis='Z', seed=521,
                                wear_amount=0.4),
        'trolley': F.enamel('trolley_blue', (0.025, 0.09, 0.24), seed=522, wear_amount=0.4),
        'hazard': F.coated('hazard_paint', F.striped((0.55, 0.36, 0.02), (0.02, 0.02, 0.02), 0.6,
                                                      axes='XZ'), seed=523, roughness=0.5,
                           chips=0.5, rust=0.4, grime=0.6, dust=0.3, fade=0.4, splash=0.6),
        'steel': F.enamel('steel_dark', (0.035, 0.035, 0.037), seed=524, wear_amount=0.75),
        'rope': M.galvanized(spangle=0.0, rust=0.3, seed=525, name='wire_rope'),
        'window': M.plastic(color=(0.02, 0.025, 0.03), roughness=0.08, scuffs=0.1, seed=526,
                            name='cab_window'),
        'flood': M.lamp(color=(1.0, 0.9, 0.74), strength=10.0, seed=527, name='lamp_flood'),
        'wall': cladding('shed_cladding', (0.5, 0.48, 0.42), 'X', 530),
        'gable': cladding('shed_gable', (0.5, 0.48, 0.42), 'Y', 531),
        'roof': M.corrugated_metal(color=(0.5, 0.52, 0.53), pitch=0.25, depth=0.03, direction='X',
                                   rust=0.55, seed=532, name='shed_roof'),
        'trim': F.enamel('shed_trim', (0.04, 0.09, 0.14), seed=533, wear_amount=0.5, splash=0.5),
        'shutter': F.coated('roll_door', (0.34, 0.36, 0.37), seed=534, roughness=0.45,
                            metallic=0.3, chips=0.3, rust=0.45, grime=0.6, dust=0.3, fade=0.3,
                            splash=0.7, scratches=0.4,
                            height=lambda graph: ribs(graph, graph.axis('Z'), 0.08, share=0.2,
                                                      soft=0.3), bump=0.012),
        'louvre': F.slotted('louvre', (0.04, 0.09, 0.14), period=0.06, axis='Z', seed=535),
        'concrete': M.concrete(color=(0.48, 0.47, 0.44), stains=0.7, cracks=0.3, pits=0.6,
                               seed=536, name='plinth_concrete'),
        'body': F.enamel('forklift_body', M.hex_color('#c98a12'), seed=540, wear_amount=0.6,
                         splash=0.6),
        'dark': F.enamel('forklift_dark', (0.03, 0.03, 0.032), seed=541, wear_amount=0.7),
        'fork': F.enamel('fork_steel', (0.035, 0.035, 0.035), seed=542, wear_amount=1.0),
        'rubber': M.rubber(dust=0.6, seed=543, name='tyre_rubber'),
        'rim': F.enamel('rim_red', (0.42, 0.05, 0.03), seed=544, wear_amount=0.6, splash=0.7),
        'seat': M.plastic(color=(0.02, 0.02, 0.022), roughness=0.6, scuffs=0.6, seed=545,
                          name='seat_vinyl'),
        'tank': F.enamel('lpg_tank', (0.46, 0.47, 0.47), seed=546, wear_amount=0.5),
        'lens': M.plastic(color=(0.55, 0.52, 0.45), roughness=0.12, scuffs=0.3, seed=547,
                          name='lens_clear'),
        'red': M.plastic(color=(0.36, 0.02, 0.015), roughness=0.15, scuffs=0.3, seed=548,
                         name='lens_red'),
        'amber': M.plastic(color=(0.6, 0.24, 0.01), roughness=0.15, scuffs=0.3, seed=549,
                           name='lens_amber'),
        'side': F.coated('trailer_panel', (0.6, 0.6, 0.58), seed=550, roughness=0.35, chips=0.1,
                         rust=0.1, grime=0.55, dust=0.35, fade=0.3, splash=0.7, scratches=0.4,
                         height=lambda graph: graph.mul(ribs(graph, graph.axis('Y'), 0.61,
                                                             share=0.05, soft=0.3), -1.0),
                         bump=0.006),
        'front': F.coated('trailer_front', (0.6, 0.6, 0.58), seed=551, roughness=0.35, chips=0.1,
                          rust=0.1, grime=0.6, dust=0.35, fade=0.3, splash=0.6, scratches=0.3,
                          height=lambda graph: graph.mul(ribs(graph, graph.axis('X'), 0.4,
                                                              share=0.06, soft=0.3), -1.0),
                          bump=0.006),
        'door': F.coated('trailer_door', (0.58, 0.58, 0.56), seed=552, roughness=0.4, chips=0.2,
                         rust=0.2, grime=0.6, dust=0.3, fade=0.3, splash=0.7, scratches=0.5,
                         height=lambda graph: ribs(graph, graph.axis('X'), 0.2, share=0.4, soft=0.4),
                         bump=0.01),
        'rail': M.brushed_metal(color=(0.55, 0.56, 0.57), direction='Y', grime=0.5, seed=553,
                                name='trailer_rail'),
        'under': F.enamel('undercoat', (0.03, 0.03, 0.03), seed=554, wear_amount=0.85, splash=0.9),
        'skirt': F.moulded('trailer_skirt', (0.4, 0.41, 0.41), seed=555, wear_amount=0.6, splash=0.8),
        'rim_grey': F.enamel('rim_grey', (0.42, 0.43, 0.43), seed=556, wear_amount=0.6, splash=0.8),
        'stripe': F.coated('underride_stripe', F.striped((0.4, 0.03, 0.02), (0.6, 0.6, 0.57), 0.3,
                                                         axes='X'), seed=557, roughness=0.4,
                           chips=0.4, rust=0.4, grime=0.6, dust=0.3, fade=0.4, splash=0.8),
    }


# -- shared builders ----------------------------------------------------------------------------

def poly(points, mat, facing=None, skip=0):
    """One face through the points, turned so its normal points along `facing`."""
    points = [Vector(point) for point in points]
    if facing is not None:
        a, b, c = points[:3]
        if (b - a).cross(c - a).dot(Vector(facing)) < 0:
            points.reverse()
    obj = build.from_data('part', [tuple(point) for point in points], [tuple(range(len(points)))])
    return S.done(obj, mat, skip)


def corrugated(length, z0, z1, mat, depth=0.036, pitch=0.278, crest=0.072, slope=0.068, skip=0):
    """A ribbed steel wall facing +Y: crests on y = 0, troughs at y = -depth, from
    x = -length/2 to +length/2 (the profile of an ISO container's side)."""
    half = length / 2
    trough = pitch - crest - 2 * slope

    def depth_at(u):
        phase = (u + half) % pitch
        if phase < crest:
            return 0.0
        phase -= crest
        if phase < slope:
            return -depth * phase / slope
        phase -= slope
        if phase < trough:
            return -depth
        return -depth * (1.0 - (phase - trough) / slope)

    stations = {-half, half}
    base = -half
    while base < half:
        for offset in (0.0, crest, crest + slope, crest + slope + trough):
            if -half < base + offset < half:
                stations.add(round(base + offset, 5))
        base += pitch
    stations = sorted(stations)
    verts = []
    for u in stations:
        y = depth_at(u)
        verts += [(u, y, z0), (u, y, z1)]
    faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(len(stations) - 1)]
    return S.done(build.from_data('part', verts, faces), mat, skip)


def placed(obj, turn, at):
    S.move(obj, rot=(0.0, 0.0, turn))
    return S.move(obj, at=at)


# -- containers ---------------------------------------------------------------------------------

def container(m, length):
    L, W, H = length, CW, CH
    hx, hy = L / 2, W / 2
    parts, small = [], []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for z in (0.0, H - 0.118):
                parts.append(S.box((0.178, 0.162, 0.118), at=(sx * (hx - 0.089), sy * (hy - 0.081), z),
                                   ground=True, mat=m['casting']))
            parts.append(S.box((0.15, 0.15, H - 0.236), at=(sx * (hx - 0.075), sy * (hy - 0.075), 0.118),
                               ground=True, mat=m['paint']))
    for sy in (-1, 1):
        parts.append(S.box((L - 0.356, 0.07, 0.16), at=(0.0, sy * (hy - 0.035), 0.012), ground=True,
                           mat=m['paint']))
        parts.append(S.box((L - 0.356, 0.07, 0.1), at=(0.0, sy * (hy - 0.035), H - 0.1), ground=True,
                           mat=m['paint']))
        parts.append(placed(corrugated(L - 0.3, 0.172, H - 0.1, m['paint']),
                            0.0 if sy > 0 else math.pi, (0.0, sy * (hy - 0.012), 0.0)))
    # Closed end (-X): ribbed panel between a bottom cross member and a header.
    parts.append(placed(corrugated(W - 0.3, 0.172, H - 0.1, m['paint']), math.pi / 2,
                        (-(hx - 0.012), 0.0, 0.0)))
    parts.append(S.box((0.07, W - 0.3, 0.172), at=(-(hx - 0.035), 0.0, 0.0), ground=True, mat=m['paint']))
    parts.append(S.box((0.07, W - 0.3, 0.1), at=(-(hx - 0.035), 0.0, H - 0.1), ground=True, mat=m['paint']))
    # Roof panel, a little below the top rails.
    parts.append(poly([(-(hx - 0.06), -(hy - 0.06), H - 0.014), (hx - 0.06, -(hy - 0.06), H - 0.014),
                       (hx - 0.06, hy - 0.06, H - 0.014), (-(hx - 0.06), hy - 0.06, H - 0.014)],
                      m['paint_roof'], facing=(0, 0, 1)))
    # Door end (+X): sill, header, two leaves, four locking bars with cams, handles, hinges.
    parts.append(S.box((0.1, W - 0.3, 0.2), at=(hx - 0.05, 0.0, 0.0), ground=True, mat=m['paint']))
    parts.append(S.box((0.12, W - 0.3, 0.25), at=(hx - 0.06, 0.0, H - 0.25), ground=True, mat=m['paint']))
    leaf = (W - 0.3) / 2 - 0.006
    for sy in (-1, 1):
        parts.append(S.box((0.04, leaf, H - 0.45), at=(hx - 0.06, sy * (leaf / 2 + 0.006), 0.2),
                           ground=True, mat=m['paint_door']))
    bars = []
    for y in (-0.88, -0.32, 0.32, 0.88):
        bars.append(S.rod((hx - 0.02, y, 0.21), (hx - 0.02, y, H - 0.26), 0.015, seg=6))
        inward = -1.0 if abs(y) > 0.5 else 1.0
        side = 1.0 if y > 0 else -1.0
        for z in (0.2, H - 0.3):
            small.append(S.box((0.05, 0.07, 0.08), at=(hx - 0.03, y, z), ground=True))
        small.append(S.box((0.03, 0.3, 0.035), at=(hx - 0.008, y + side * inward * 0.15, 1.12),
                           ground=True))
    parts.append(S.done(S.join(bars), m['bar']))
    parts.append(S.done(S.join(small), m['bar'], skip=1))
    hinges = [S.box((0.06, 0.1, 0.12), at=(hx - 0.03, sy * (hy - 0.19), z), ground=True)
              for sy in (-1, 1) for z in (0.42, 1.0, 1.58, 2.08)]
    parts.append(S.done(S.join(hinges), m['paint'], skip=1))
    parts.append(S.box((0.012, 0.28, 0.16), at=(hx - 0.034, -0.62, 1.5), ground=True, mat=m['plate'],
                       skip=1))
    return parts


def containers(k, m):
    for name, length, sign in (('container_20', W20, (3.6, 0.75)), ('container_40', W40, (7.6, 0.95))):
        box = k.object(name, container(m, length), cls='fixed', lods=(0.3, 0.08),
                       distances=(40.0, 120.0), smooth=20.0, texel_scale=0.55)
        width, height = sign
        box.anchor('sign_a', (-0.05 * length, CW / 2 + 0.002, CH * 0.64), forward=(0.0, 1.0, 0.0),
                   width=width, height=height, shape='rect')
        box.anchor('sign_b', (-0.05 * length, -CW / 2 - 0.002, CH * 0.64), forward=(0.0, -1.0, 0.0),
                   width=width, height=height, shape='rect')
        box.anchor('sign_door', (length / 2 + 0.004, 0.6, 1.95), forward=(1.0, 0.0, 0.0), width=0.7,
                   height=0.4, shape='rect')
        box.box('body', (0.0, 0.0, CH / 2), (length, CW, CH))


def container_stack(k, m):
    tiers, doors = (3, 3, 2), (1, -1, 1)
    parts, index = [], 0
    for column, (count, door) in enumerate(zip(tiers, doors)):
        y = (column - 1) * CW
        for tier in range(count):
            body = S.box((W40, CW - 0.004, CH - 0.004), at=(0.0, y, tier * CH), ground=True,
                         mat=m['livery'][index])
            index += 1
            above = tier + 1 < count
            left = column > 0 and tier < tiers[column - 1]
            right = column < 2 and tier < tiers[column + 1]

            def doomed(face, layers, above=above, left=left, right=right):
                n = face.normal
                return (n.z < -0.9 or (above and n.z > 0.9) or (right and n.y > 0.9)
                        or (left and n.y < -0.9))

            _delete_faces(body, doomed)
            parts.append(body)
            x = door * (W40 / 2 + 0.014)
            rods = [S.rod((x, y + dy, tier * CH + 0.24), (x, y + dy, tier * CH + CH - 0.3), 0.016, seg=4)
                    for dy in (-0.88, -0.32, 0.32, 0.88)]
            parts.append(S.done(S.join(rods), m['bar'], skip=1))
    stack = k.object('container_stack', parts, cls='fixed', lods=(0.5, 0.2), distances=(80.0, 220.0),
                     smooth=20.0, texel_scale=0.3)
    stack.anchor('sign_a', (0.0, 1.5 * CW + 0.003, CH * 1.64), forward=(0.0, 1.0, 0.0), width=7.6,
                 height=0.95, shape='rect')
    stack.anchor('sign_b', (0.0, -1.5 * CW - 0.003, CH * 2.64), forward=(0.0, -1.0, 0.0), width=7.6,
                 height=0.95, shape='rect')
    stack.box('low', (0.0, 0.0, CH), (W40, 3 * CW, 2 * CH))
    stack.box('top', (0.0, -CW / 2, 2.5 * CH), (W40, 2 * CW, CH))


# -- quay crane ---------------------------------------------------------------------------------

def quay_crane(k, m):
    gx, gy = 9.0, 15.24          # legs at x = +-9 (along the quay), rails at y = +-15.24
    parts = []
    for sx in (-1, 1):
        x = sx * gx
        for sy in (-1, 1):
            y = sy * gy
            parts.append(S.beam((x, y, 1.6), (x, y, 6.0), 1.5, 1.5, m['hazard'], up=(0.0, 1.0, 0.0)))
            parts.append(S.beam((x, y, 6.0), (x, y, 41.6), 1.5, 1.35, m['crane'], up=(0.0, 1.0, 0.0),
                                step=6.0))
            parts.append(S.box((6.0, 1.3, 1.1), at=(x, y, 0.5), ground=True, mat=m['hazard']))
            parts.append(S.box((2.2, 1.6, 0.5), at=(x, y, 1.15), ground=True, mat=m['steel']))
            wheels = [S.cyl(0.42, 0.28, at=(x + dx, y, 0.42), seg=10, axis='Y')
                      for dx in (-2.2, -0.75, 0.75, 2.2)]
            parts.append(S.done(S.join(wheels), m['steel'], skip=1))
        # Sill beam along Y at 14 m, and the landside diagonal up to the girder.
        parts.append(S.beam((x, -gy, 14.0), (x, gy, 14.0), 1.0, 1.4, m['crane'], step=6.0))
        parts.append(S.beam((x, -gy + 0.6, 14.6), (x, -gy + 10.0, 40.8), 0.8, 0.8, m['crane'],
                            up=(1.0, 0.0, 0.0), step=6.0))
    for sy in (-1, 1):
        parts.append(S.beam((-gx - 0.75, sy * gy, 40.6), (gx + 0.75, sy * gy, 40.6), 1.6, 2.2,
                            m['crane'], step=6.0))
    for sx in (-1, 1):
        x = sx * 3.0
        # Girder over the portal and backreach, then the boom, which steps down at its tip.
        parts.append(S.beam((x, -33.0, 43.2), (x, gy + 0.5, 43.2), 1.4, 3.0, m['crane'], step=6.0))
        parts.append(S.beam((x, gy + 0.5, 43.2), (x, 52.0, 43.4), 1.3, 2.6, m['crane'], step=6.0))
        parts.append(S.beam((x, 52.0, 43.6), (x, 65.0, 43.9), 1.2, 1.9, m['crane'], step=6.5))
        # A-frame: front and rear struts to the apex, fore- and backstays.
        apex = (x, 4.0, 72.0)
        parts.append(S.beam((x, gy - 0.4, 44.7), apex, 1.1, 1.1, m['crane'], up=(1.0, 0.0, 0.0), step=7.0))
        parts.append(S.beam((x, -gy + 0.4, 44.7), apex, 1.1, 1.1, m['crane'], up=(1.0, 0.0, 0.0), step=7.0))
        stays = [S.rod(apex, (x, 38.0, 44.6), 0.14, seg=5), S.rod(apex, (x, 60.0, 44.6), 0.12, seg=5),
                 S.rod(apex, (x, -31.0, 44.7), 0.16, seg=5)]
        parts.append(S.done(S.join(stays), m['crane']))
        parts.append(S.box((0.5, 0.5, 0.9), at=(x, 64.6, 44.85), ground=True, mat=m['hazard']))
    parts.append(S.beam((-3.6, 4.0, 72.0), (3.6, 4.0, 72.0), 1.2, 1.2, m['crane']))
    for y in (-28.0, -15.0, 2.0, 15.7, 30.0, 45.0, 60.0):
        parts.append(S.beam((-2.4, y, 44.55), (2.4, y, 44.55), 0.4, 0.3, m['crane']))
    # Machinery house on the backreach, trolley over the water, its hanging cab and spreader.
    parts.append(S.box((8.0, 9.0, 5.0), at=(0.0, -26.5, 44.7), ground=True, mat=m['crane_blue']))
    parts.append(S.box((8.4, 9.4, 0.3), at=(0.0, -26.5, 49.7), ground=True, mat=m['trolley']))
    parts.append(S.box((7.2, 4.6, 2.2), at=(0.0, 30.0, 44.7), ground=True, mat=m['trolley']))
    parts.append(S.box((2.5, 3.0, 2.7), at=(1.6, 27.0, 37.6), ground=True, mat=m['trolley']))
    parts.append(S.box((2.56, 3.06, 1.1), at=(1.6, 27.0, 38.9), ground=True, mat=m['window']))
    hangers = [S.rod((1.6 + dx, 27.0, 40.3), (1.6 + dx, 27.0, 44.7), 0.08, seg=4) for dx in (-0.9, 0.9)]
    parts.append(S.done(S.join(hangers), m['steel']))
    parts.append(S.box((12.2, 2.5, 0.55), at=(0.0, 30.0, 21.0), ground=True, mat=m['hazard']))
    parts.append(S.box((3.0, 2.0, 1.0), at=(0.0, 30.0, 21.55), ground=True, mat=m['steel']))
    ropes = [S.rod((dx, 30.0 + dy, 44.7), (dx * 0.8, 30.0 + dy * 0.8, 22.5), 0.035, seg=4)
             for dx in (-1.2, 1.2) for dy in (-0.7, 0.7)]
    parts.append(S.done(S.join(ropes), m['rope']))
    lamps = [S.box((0.7, 0.45, 0.25), at=(sx * 3.0, y, 41.45), ground=True)
             for sx in (-1, 1) for y in (-12.0, 24.0, 48.0)]
    parts.append(S.done(S.join(lamps), m['flood']))
    crane = k.object('quay_crane', parts, cls='fixed', lods=(0.5, 0.25), distances=(150.0, 450.0),
                     smooth=20.0, texel_scale=0.12)
    crane.anchor('cab', (1.6, 27.0, 38.4), forward=(0.0, 1.0, 0.0))
    crane.anchor('spreader', (0.0, 30.0, 21.0), forward=(0.0, 0.0, -1.0), up=(0.0, 1.0, 0.0))
    for index, (sx, sy) in enumerate(((-1, 1), (1, 1), (-1, -1), (1, -1)), start=1):
        crane.box(f'leg_{index}', (sx * gx, sy * gy, 21.0), (1.7, 1.7, 42.0))


# -- steel shed ---------------------------------------------------------------------------------

def steel_shed(k, m):
    hx = 3.0
    parts = []
    # Plinth: along the back, and either side of the door at the front.
    parts.append(S.box((6.0, 0.22, 0.3), at=(0.0, -SPAN + 0.11, 0.0), ground=True, mat=m['concrete']))
    for x0, x1 in ((-hx, -2.2), (2.2, hx)):
        parts.append(S.box((x1 - x0, 0.22, 0.3), at=((x0 + x1) / 2, SPAN - 0.11, 0.0), ground=True,
                           mat=m['concrete']))
    parts.append(poly([(-hx, -SPAN, 0.3), (hx, -SPAN, 0.3), (hx, -SPAN, EAVE), (-hx, -SPAN, EAVE)],
                      m['wall'], facing=(0, -1, 0)))
    for x0, x1 in ((-hx, -2.2), (2.2, hx)):
        parts.append(poly([(x0, SPAN, 0.3), (x1, SPAN, 0.3), (x1, SPAN, EAVE), (x0, SPAN, EAVE)],
                          m['wall'], facing=(0, 1, 0)))
    parts.append(poly([(-2.2, SPAN, 4.85), (2.2, SPAN, 4.85), (2.2, SPAN, EAVE), (-2.2, SPAN, EAVE)],
                      m['wall'], facing=(0, 1, 0)))
    parts.append(poly([(-2.1, SPAN - 0.06, 0.0), (2.1, SPAN - 0.06, 0.0), (2.1, SPAN - 0.06, 4.6),
                       (-2.1, SPAN - 0.06, 4.6)], m['shutter'], facing=(0, 1, 0)))
    parts.append(S.box((4.6, 0.45, 0.55), at=(0.0, SPAN + 0.2, 4.45), ground=True, mat=m['trim']))
    for x in (-2.18, 2.18):
        parts.append(S.box((0.1, 0.14, 4.6), at=(x, SPAN + 0.02, 0.0), ground=True, mat=m['trim']))
    parts.append(S.box((0.12, 0.3, 0.12), at=(1.9, SPAN + 0.08, 0.0), ground=True, mat=m['trim'], skip=1))
    # Roof, ridge cap, gutters and downpipes.
    for sy in (-1, 1):
        parts.append(poly([(-hx, sy * (SPAN + 0.18), EAVE - 0.03), (hx, sy * (SPAN + 0.18), EAVE - 0.03),
                           (hx, 0.0, RIDGE), (-hx, 0.0, RIDGE)], m['roof'], facing=(0, sy * 0.15, 1)))
        parts.append(S.box((6.0, 0.16, 0.16), at=(0.0, sy * (SPAN + 0.24), EAVE - 0.2), ground=True,
                           mat=m['trim']))
        parts.append(S.box((6.0, 0.06, 0.25), at=(0.0, sy * (SPAN + 0.02), EAVE - 0.22), ground=True,
                           mat=m['trim']))
        parts.append(S.pipe([(2.6, sy * (SPAN + 0.24), EAVE - 0.2), (2.6, sy * (SPAN + 0.1), EAVE - 0.6),
                             (2.6, sy * (SPAN + 0.1), 0.25), (2.6, sy * (SPAN + 0.25), 0.05)], 0.05,
                            m['trim'], seg=6))
    parts.append(S.box((6.0, 0.5, 0.08), at=(0.0, 0.0, RIDGE - 0.03), ground=True, mat=m['trim']))
    shed = k.object('steel_shed', parts, cls='fixed', lods=(0.6,), distances=(90.0,), smooth=20.0,
                    texel_scale=0.3)
    shed.anchor('sign', (0.0, SPAN + 0.005, 5.65), forward=(0.0, 1.0, 0.0), width=3.8, height=1.1,
                shape='rect')
    shed.anchor('door', (0.0, SPAN + 0.3, 0.0), forward=(0.0, -1.0, 0.0))
    shed.box('body', (0.0, 0.0, RIDGE / 2), (6.0, 2 * SPAN, RIDGE))

    end = [S.box((0.22, 2 * SPAN, 0.3), at=(-0.11, 0.0, 0.0), ground=True, mat=m['concrete'])]
    end.append(poly([(0.0, -SPAN, 0.3), (0.0, SPAN, 0.3), (0.0, SPAN, EAVE), (0.0, 0.0, RIDGE),
                     (0.0, -SPAN, EAVE)], m['gable'], facing=(1, 0, 0)))
    for sy in (-1, 1):
        end.append(S.box((0.14, 0.14, EAVE - 0.3), at=(0.03, sy * (SPAN - 0.04), 0.3), ground=True,
                         mat=m['trim']))
        end.append(S.beam((0.04, sy * (SPAN + 0.2), EAVE - 0.05), (0.04, 0.0, RIDGE + 0.04), 0.16, 0.22,
                          m['trim']))
    end.append(S.box((0.06, 1.0, 2.1), at=(0.03, -3.5, 0.3), ground=True, mat=m['trim']))
    end.append(S.box((0.08, 1.16, 0.08), at=(0.04, -3.5, 2.4), ground=True, mat=m['trim'], skip=1))
    end.append(S.box((0.5, 1.4, 0.3), at=(0.25, -3.5, 0.0), ground=True, mat=m['concrete']))
    end.append(S.box((0.06, 1.4, 0.9), at=(0.03, 0.0, 5.0), ground=True, mat=m['louvre']))
    gable = k.object('steel_shed_end', end, cls='fixed', lods=(0.6,), distances=(90.0,), smooth=20.0,
                     texel_scale=0.3)
    gable.anchor('door', (0.6, -3.5, 0.3), forward=(-1.0, 0.0, 0.0))
    gable.box('body', (-0.1, 0.0, RIDGE / 2), (0.25, 2 * SPAN, RIDGE))


# -- forklift -----------------------------------------------------------------------------------

def forklift(k, m):
    parts = []
    parts.append(S.rbox(1.1, 2.0, 0.7, 0.08, at=(0.0, -0.05, 0.22), mat=m['body']))
    parts.append(S.rbox(1.16, 0.62, 0.95, 0.22, at=(0.0, -1.12, 0.2), mat=m['body']))
    parts.append(S.rbox(1.06, 1.3, 0.18, 0.05, at=(0.0, -0.35, 0.92), mat=m['body']))
    parts.append(S.box((1.0, 0.34, 0.36), at=(0.0, 0.72, 0.92), ground=True, mat=m['body']))
    for sx in (-1, 1):
        parts.append(S.box((0.3, 0.78, 0.05), at=(sx * 0.52, 0.72, 0.68), ground=True, mat=m['body']))
        parts.append(S.cyl(0.33, 0.25, at=(sx * 0.5, 0.72, 0.33), axis='X', seg=14, mat=m['rubber']))
        parts.append(S.cyl(0.19, 0.26, at=(sx * 0.5, 0.72, 0.33), axis='X', seg=10, mat=m['rim']))
        parts.append(S.cyl(0.26, 0.2, at=(sx * 0.43, -0.8, 0.26), axis='X', seg=12, mat=m['rubber']))
        parts.append(S.cyl(0.14, 0.21, at=(sx * 0.43, -0.8, 0.26), axis='X', seg=8, mat=m['rim']))
    parts.append(S.rbox(0.5, 0.46, 0.12, 0.06, at=(0.0, -0.33, 1.1), mat=m['seat']))
    back = S.rbox(0.5, 0.1, 0.46, 0.05, mat=m['seat'])
    parts.append(S.move(S.move(back, rot=(-0.2, 0.0, 0.0)), at=(0.0, -0.6, 1.16)))
    parts.append(S.rod((0.0, 0.66, 1.25), (0.0, 0.44, 1.55), 0.03, m['dark'], seg=6))
    wheel = S.torus(0.16, 0.017, mat=m['seat'], seg=12, sides=4)
    parts.append(S.move(S.move(wheel, rot=(0.55, 0.0, 0.0)), at=(0.0, 0.43, 1.57)))
    guard = []
    for sx in (-1, 1):
        guard.append(S.rod((sx * 0.48, -0.86, 1.1), (sx * 0.48, -0.76, 2.13), 0.035, seg=6))
        guard.append(S.rod((sx * 0.48, 0.84, 1.26), (sx * 0.48, 0.62, 2.13), 0.035, seg=6))
        guard.append(S.beam((sx * 0.48, -0.8, 2.15), (sx * 0.48, 0.67, 2.15), 0.06, 0.06))
    for y in (-0.8, 0.67):
        guard.append(S.beam((-0.51, y, 2.15), (0.51, y, 2.15), 0.06, 0.06))
    for x in (-0.3, -0.15, 0.0, 0.15, 0.3):
        guard.append(S.beam((x, -0.78, 2.16), (x, 0.65, 2.16), 0.04, 0.03))
    parts.append(S.done(S.join(guard), m['dark']))
    parts.append(S.cyl(0.17, 0.78, at=(0.0, -1.05, 1.42), axis='X', seg=12, mat=m['tank']))
    parts.append(S.box((0.06, 0.3, 0.2), at=(0.0, -1.05, 1.15), ground=True, mat=m['dark'], skip=1))
    mast = []
    for sx in (-1, 1):
        mast.append(S.box((0.1, 0.13, 2.1), at=(sx * 0.37, 1.07, 0.12), ground=True))
        mast.append(S.box((0.08, 0.1, 2.0), at=(sx * 0.27, 1.13, 0.16), ground=True))
        mast.append(S.rod((sx * 0.42, 0.62, 0.78), (sx * 0.4, 1.0, 0.95), 0.04, seg=6))
    for z in (0.12, 2.1):
        mast.append(S.box((0.84, 0.12, 0.12), at=(0.0, 1.07, z), ground=True))
    mast.append(S.box((1.0, 0.06, 0.3), at=(0.0, 1.22, 0.2), ground=True))
    mast.append(S.box((1.0, 0.06, 0.1), at=(0.0, 1.22, 0.75), ground=True))
    for x in (-0.48, -0.16, 0.16, 0.48):
        mast.append(S.box((0.04, 0.04, 0.8), at=(x, 1.22, 0.5), ground=True))
    mast.append(S.box((1.0, 0.04, 0.05), at=(0.0, 1.22, 1.28), ground=True))
    parts.append(S.done(S.join(mast), m['dark']))
    parts.append(S.cyl(0.05, 1.8, at=(0.0, 1.06, 0.22), ground=True, mat=m['tank'], seg=8))
    chains = [S.box((0.03, 0.02, 1.3), at=(sx * 0.16, 1.16, 0.55), ground=True) for sx in (-1, 1)]
    parts.append(S.done(S.join(chains), m['fork'], skip=1))
    for sx in (-1, 1):
        parts.append(S.box((0.11, 0.045, 0.85), at=(sx * 0.3, 1.27, 0.05), ground=True, mat=m['fork']))
        parts.append(S.box((0.11, 1.07, 0.045), at=(sx * 0.3, 1.8, 0.05), ground=True, mat=m['fork']))
        parts.append(S.box((0.12, 0.08, 0.1), at=(sx * 0.48, 0.66, 1.98), ground=True, mat=m['lens'],
                           skip=1))
        parts.append(S.box((0.1, 0.04, 0.1), at=(sx * 0.45, -1.44, 0.9), ground=True, mat=m['red'],
                           skip=1))
    parts.append(S.cyl(0.06, 0.1, at=(0.0, -0.7, 2.18), ground=True, mat=m['amber'], seg=8, skip=1))
    truck = k.object('forklift', parts, cls='fixed', lods=(0.3, 0.1), distances=(25.0, 70.0),
                     smooth=35.0, texel_scale=1.0)
    truck.anchor('seat', (0.0, -0.33, 1.22), forward=(0.0, 1.0, 0.0))
    truck.anchor('forks', (0.0, 1.8, 0.07), forward=(0.0, 1.0, 0.0))
    truck.box('body', (0.0, -0.2, 1.1), (1.2, 2.6, 2.2))
    truck.box('forks', (0.0, 1.8, 0.1), (0.75, 1.1, 0.2))


# -- box trailer --------------------------------------------------------------------------------

def box_trailer(k, m):
    hl, hw, floor, top = 7.315, 1.295, 1.22, 4.1
    parts = []
    for sx in (-1, 1):
        parts.append(poly([(sx * hw, -hl + 0.1, floor + 0.15), (sx * hw, hl, floor + 0.15),
                           (sx * hw, hl, top - 0.13), (sx * hw, -hl + 0.1, top - 0.13)], m['side'],
                          facing=(sx, 0, 0)))
        parts.append(S.box((0.06, 2 * hl, 0.15), at=(sx * (hw - 0.02), 0.0, floor), ground=True,
                           mat=m['rail']))
        parts.append(S.box((0.06, 2 * hl, 0.13), at=(sx * (hw - 0.02), 0.0, top - 0.13), ground=True,
                           mat=m['rail']))
        parts.append(poly([(sx * (hw - 0.05), -3.9, 0.42), (sx * (hw - 0.05), 3.6, 0.42),
                           (sx * (hw - 0.05), 3.6, floor), (sx * (hw - 0.05), -3.9, floor)],
                          m['skirt'], facing=(sx, 0, 0)))
    parts.append(poly([(-hw + 0.04, -hl, top - 0.01), (hw - 0.04, -hl, top - 0.01), (hw - 0.04, hl, top - 0.01),
                       (-hw + 0.04, hl, top - 0.01)], m['side'], facing=(0, 0, 1)))
    parts.append(poly([(-hw, hl, floor), (hw, hl, floor), (hw, hl, top), (-hw, hl, top)], m['front'],
                      facing=(0, 1, 0)))
    parts.append(poly([(-hw, -hl, floor), (hw, -hl, floor), (hw, hl, floor), (-hw, hl, floor)], m['under'],
                      facing=(0, 0, -1)))
    # Rear frame, doors, locking bars, hinges, lamps, bumper.
    for sx in (-1, 1):
        parts.append(S.box((0.12, 0.12, top - floor), at=(sx * (hw - 0.06), -hl + 0.04, floor), ground=True,
                           mat=m['rail']))
        parts.append(S.box((1.17, 0.04, top - floor - 0.42), at=(sx * 0.59, -hl - 0.0, floor + 0.14),
                           ground=True, mat=m['door']))
    parts.append(S.box((2 * hw, 0.13, 0.28), at=(0.0, -hl + 0.04, top - 0.28), ground=True, mat=m['rail']))
    parts.append(S.box((2 * hw, 0.16, 0.16), at=(0.0, -hl + 0.06, floor - 0.04), ground=True, mat=m['rail']))
    bars, small = [], []
    for x in (-0.9, -0.3, 0.3, 0.9):
        bars.append(S.rod((x, -hl - 0.04, floor + 0.18), (x, -hl - 0.04, top - 0.32), 0.016, seg=6))
        side = 1.0 if x > 0 else -1.0
        inward = -1.0 if abs(x) > 0.5 else 1.0
        small.append(S.box((0.3, 0.03, 0.035), at=(x + side * inward * 0.15, -hl - 0.05, 1.95), ground=True))
        for z in (floor + 0.16, top - 0.34):
            small.append(S.box((0.07, 0.05, 0.08), at=(x, -hl - 0.03, z), ground=True))
    for sx in (-1, 1):
        for z in (1.55, 2.4, 3.25, 3.7):
            small.append(S.box((0.1, 0.06, 0.12), at=(sx * (hw - 0.16), -hl - 0.03, z), ground=True))
    parts.append(S.done(S.join(bars), m['bar']))
    parts.append(S.done(S.join(small), m['bar'], skip=1))
    for sx in (-1, 1):
        parts.append(S.box((0.09, 0.03, 0.2), at=(sx * 1.08, -hl - 0.03, floor - 0.02), ground=True,
                           mat=m['red'], skip=1))
        parts.append(S.box((0.06, 0.03, 0.06), at=(sx * 1.15, -hl - 0.03, top - 0.12), ground=True,
                           mat=m['red'], skip=1))
        parts.append(S.box((0.06, 0.03, 0.06), at=(sx * 1.15, hl + 0.02, top - 0.12), ground=True,
                           mat=m['amber'], skip=1))
        parts.append(S.box((0.1, 0.1, 0.75), at=(sx * 0.7, -hl + 0.1, 0.42), ground=True, mat=m['under']))
        parts.append(S.box((0.6, 0.02, 0.62), at=(sx * 1.0, -6.9, 0.22), ground=True, mat=m['rubber']))
    parts.append(S.box((2.4, 0.12, 0.16), at=(0.0, -hl + 0.06, 0.42), ground=True, mat=m['stripe']))
    # Chassis, landing gear, tandem axle with dual wheels.
    for sx in (-1, 1):
        parts.append(S.box((0.12, 13.4, 0.36), at=(sx * 0.5, 0.2, floor - 0.36), ground=True, mat=m['under']))
        parts.append(S.box((0.13, 0.13, 1.0), at=(sx * 0.85, 4.2, 0.08), ground=True, mat=m['under']))
        parts.append(S.box((0.3, 0.32, 0.08), at=(sx * 0.85, 4.2, 0.0), ground=True, mat=m['under']))
    parts.append(S.rod((-0.85, 4.2, 0.55), (0.85, 4.2, 0.85), 0.03, m['under'], seg=5, skip=1))
    parts.append(S.box((0.2, 0.2, 0.25), at=(1.0, 4.2, 0.85), ground=True, mat=m['under'], skip=1))
    parts.append(S.rod((1.1, 4.2, 0.97), (1.22, 4.45, 0.75), 0.015, m['bar'], seg=4, skip=1))
    for y in (-4.95, -6.2):
        parts.append(S.cyl(0.07, 2.0, at=(0.0, y, 0.5), axis='X', seg=6, mat=m['under']))
        for sx in (-1, 1):
            for x in (0.84, 1.12):
                parts.append(S.cyl(0.5, 0.25, at=(sx * x, y, 0.5), axis='X', seg=16, mat=m['rubber']))
            parts.append(S.cyl(0.29, 0.02, at=(sx * 1.25, y, 0.5), axis='X', seg=12, mat=m['rim_grey']))
            parts.append(S.cyl(0.11, 0.06, at=(sx * 1.27, y, 0.5), axis='X', seg=8, mat=m['rim_grey'], skip=1))
        parts.append(S.box((1.4, 0.3, 0.3), at=(0.0, y, 0.72), ground=True, mat=m['under'], skip=1))
    trailer = k.object('box_trailer', parts, cls='fixed', lods=(0.3, 0.1), distances=(35.0, 100.0),
                       smooth=30.0, texel_scale=0.45)
    trailer.anchor('sign_a', (hw + 0.003, 0.3, 2.75), forward=(1.0, 0.0, 0.0), width=10.5, height=1.9,
                   shape='rect')
    trailer.anchor('sign_b', (-hw - 0.003, 0.3, 2.75), forward=(-1.0, 0.0, 0.0), width=10.5, height=1.9,
                   shape='rect')
    trailer.anchor('kingpin', (0.0, 6.4, floor), forward=(0.0, 1.0, 0.0))
    trailer.box('body', (0.0, 0.0, top / 2), (2 * hw + 0.02, 2 * hl, top))


def make(a):
    m = palette()
    k = SetKit(a, gap=1.5, row_gap=2.0, row_width=34.0)
    containers(k, m)
    forklift(k, m)
    k.row()
    container_stack(k, m)
    box_trailer(k, m)
    k.row()
    steel_shed(k, m)
    k.row()
    quay_crane(k, m)
    k.layout()
    a.bake(size=2048, orm_size=512, normal_size=1024, bevel_radius=0.004, occlusion_distance=1.0,
           material_texels={'cab_window': 0.5})


def assemble(a):
    SetKit.of(a).levels()
