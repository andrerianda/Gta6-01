"""Beach set: the things on the sand of Playa Dorada for the skyline picture and the beach,
original designs in real sizes, seven objects in one file sharing one atlas.

parasol_open      a beach parasol 2.2 m across: aluminium pole (0.25 m in the sand), eight
                  panels of striped canvas sagging between their ribs, a scalloped valance,
                  ribs and stretchers underneath, a finial. Knockable, 6 kg.
parasol_closed    the same parasol furled round its pole with a strap. Knockable, 5 kg.
lounger           an aluminium sun lounger 1.95 x 0.64 m, backrest raised, canvas sling,
                  wheels at the head. Feet towards +Y. Knockable, 9 kg.
lounger_towel     the lounger with a towel spread on it, hanging over the foot. 9.5 kg.
lifeguard_tower   our own lifeguard post: a pastel plank cabin with a hipped tin roof and
                  wide windows on a 2.6 m deck on four braced timber stilts 2.2 m up, a front
                  rail, a ramp with cleats down the back to the sand, a flag pole at the front
                  corner with a red-over-yellow flag. Faces the sea at +Y. Fixed.
beach_bar_kiosk   a 3.2 x 2.4 m stucco beach bar: a serving hatch over a varnished counter, a
                  striped awning, a blank sign board on the roof (anchor_sign: the game paints
                  the bar's name there), a fridge inside, three stools at the counter. Fixed.
volleyball_net    two aluminium posts 9.5 m apart, a net 1 m deep with its top 2.43 m up,
                  white bands, guy ropes to the sand. Fixed.

Materials: "paint_canvas" (the coloured stripes of the parasols, the sling of the loungers and
the kiosk's awning: tinted per instance with setPaint, default coral red) and the atlas.
Colliders and anchors are children of each object node (see _leisure.py for the scheme).

Budget: seven objects in one file: about 9,000 triangles at level 0 in all and two draw calls
for each object that has canvas (one for the others), one 1024 atlas.

Blender axes: Z up, every object faces +Y; they stand in a row along +X.
"""
import math

from mathutils import Vector

from lib import build, modify, scene

import _leisure as L

ASSET = {
    'id': 'set_beach',
    'kind': 'prop',
    'atlas': 1024,
    'budget': {'triangles': 12000, 'draws': 14, 'bytes': 520000},
}


def mat(obj, material):
    obj.data.materials.append(material)
    return obj


def rod(name, start, end, radius, material, segments=6):
    """A straight round bar from start to end."""
    return mat(build.tube(name, [tuple(start), tuple(end)], radius=radius, segments=segments,
                          caps=True, up=(0.0, 0.0, 1.0) if abs(end[2] - start[2]) < 0.9 *
                          (Vector(end) - Vector(start)).length else (1.0, 0.0, 0.0)), material)


def beam(name, start, end, size, material):
    """A timber or steel section of `size` (width, depth) from start to end."""
    start, end = Vector(start), Vector(end)
    length = (end - start).length
    part = build.box(name, (size[0], size[1], length))
    direction = (end - start).normalized()
    rotation = Vector((0.0, 0.0, 1.0)).rotation_difference(direction).to_euler()
    modify.transform(part, rotation=tuple(rotation))
    modify.transform(part, location=tuple((start + end) * 0.5))
    return mat(part, material)


def sheet(name, rows, material, thickness=0.004):
    """A cloth sheet through a grid of points (rows of equal length), given a thickness."""
    count_j = len(rows[0])
    vertices = [point for row in rows for point in row]
    faces = [(i * count_j + j, i * count_j + j + 1, (i + 1) * count_j + j + 1, (i + 1) * count_j + j)
             for i in range(len(rows) - 1) for j in range(count_j - 1)]
    uvs = [[(j / (count_j - 1), i / (len(rows) - 1)), ((j + 1) / (count_j - 1), i / (len(rows) - 1)),
            ((j + 1) / (count_j - 1), (i + 1) / (len(rows) - 1)), (j / (count_j - 1), (i + 1) / (len(rows) - 1))]
           for i in range(len(rows) - 1) for j in range(count_j - 1)]
    part = build.from_data(name, vertices, faces, uvs)
    if thickness:
        modify.solidify(part, thickness=thickness, offset=0.0)
    return mat(part, material)


# ---------------------------------------------------------------------------------------------
# Parasols
# ---------------------------------------------------------------------------------------------

APEX, RIM_Z, RIM_R, RIBS = 2.34, 1.94, 1.1, 8


def canopy_point(angle, t, side, half):
    """A point of a panel: t from the apex (0) to the rim (1); side -1..1 across the panel,
    whose edges are the ribs. The canvas sags between the ribs and runs straight rib to rib."""
    across = side * half
    reach = RIM_R * t * math.cos(half) / max(0.2, math.cos(across))
    z = APEX - (APEX - RIM_Z) * t ** 0.85 - 0.05 * (1.0 - side * side) * math.sin(math.pi * min(1.0, t * 1.1))
    return (reach * math.cos(angle + across), reach * math.sin(angle + across), z)


def model_parasol_open(m):
    parts = [rod('pole', (0.0, 0.0, -0.25), (0.0, 0.0, APEX + 0.02), 0.019, m['aluminium'], 8),
             mat(build.cylinder('collar', radius=0.03, depth=0.09, segments=8,
                                location=(0.0, 0.0, 1.55), on_ground=True), m['aluminium']),
             mat(build.cylinder('runner', radius=0.032, depth=0.07, segments=8,
                                location=(0.0, 0.0, 1.78), on_ground=True), m['plastic']),
             mat(build.sphere('finial', radius=0.035, segments=8, rings=4,
                              location=(0.0, 0.0, APEX + 0.04)), m['plastic'])]
    half = math.pi / RIBS
    for index in range(RIBS):
        angle = math.tau * index / RIBS + half
        material = m['canvas'] if index % 2 == 0 else m['canvas_white']
        rows = [[canopy_point(angle, t, side, half) for side in (-1.0, -0.5, 0.0, 0.5, 1.0)]
                for t in (0.02, 0.3, 0.6, 0.85, 1.0)]
        parts.append(sheet(f'panel{index}', rows, material))
        # The valance: a flap hanging 0.11 m from the rim, scalloped at the bottom.
        top = rows[-1]
        bottom = [(x * 1.005, y * 1.005, z - 0.11 + (0.035 if side == 0.0 else 0.0))
                  for (x, y, z), side in zip(top, (-1.0, -0.5, 0.0, 0.5, 1.0))]
        parts.append(sheet(f'valance{index}', [top, bottom], material))
        # The rib under the canvas and its stretcher from the runner.
        rib = [Vector(canopy_point(angle - half, t, 0.0, 0.0)) - Vector((0.0, 0.0, 0.012))
               for t in (0.05, 0.5, 1.0)]
        rib_angle = angle - half
        rib = [Vector((RIM_R * t * math.cos(rib_angle), RIM_R * t * math.sin(rib_angle),
                       APEX - (APEX - RIM_Z) * t ** 0.85 - 0.012)) for t in (0.04, 0.5, 1.0)]
        parts.append(mat(build.tube(f'rib{index}', [tuple(p) for p in rib], radius=0.006,
                                    segments=4, caps=False), m['aluminium']))
        middle = rib[1]
        parts.append(rod(f'stretcher{index}', (0.0, 0.0, 1.81), tuple(middle), 0.005,
                         m['aluminium'], 4))
    return parts


def model_parasol_closed(m):
    parts = [rod('pole', (0.0, 0.0, -0.25), (0.0, 0.0, 2.4), 0.019, m['aluminium'], 8),
             mat(build.sphere('finial', radius=0.035, segments=8, rings=4,
                              location=(0.0, 0.0, 2.42)), m['plastic'])]
    # The furled canvas: a slim twisted cone, darker folds of the coloured canvas.
    profile = [(0.022, 1.32), (0.06, 1.45), (0.105, 1.7), (0.12, 1.95), (0.1, 2.15),
               (0.05, 2.3), (0.02, 2.37)]
    furl = mat(build.lathe('furl', profile, segments=12), m['canvas'])

    def twist(point):
        angle = math.atan2(point.y, point.x)
        radius = math.hypot(point.x, point.y) * (1.0 + 0.12 * math.sin(4.0 * angle + point.z * 6.0))
        return Vector((radius * math.cos(angle), radius * math.sin(angle), point.z))
    modify.map_vertices(furl, twist)
    parts.append(furl)
    parts.append(mat(build.cylinder('strap', radius=0.125, depth=0.035, segments=12,
                                    location=(0.0, 0.0, 1.8), on_ground=True), m['canvas_white']))
    for index in range(RIBS):
        angle = math.tau * index / RIBS
        parts.append(mat(build.sphere(f'tip{index}', radius=0.008, segments=4, rings=2,
                                      location=(0.04 * math.cos(angle), 0.04 * math.sin(angle),
                                                1.3)), m['plastic']))
    return parts


# ---------------------------------------------------------------------------------------------
# Loungers
# ---------------------------------------------------------------------------------------------

def model_lounger(m, towel=False):
    """Feet towards +Y; the bed at 0.33 m, the backrest raised 40 degrees at the head (-Y)."""
    parts = []
    rail_z, half_w, foot_y, hinge_y = 0.33, 0.31, 0.95, -0.33
    back_len, tilt = 0.72, math.radians(40.0)
    back_top = (hinge_y - back_len * math.cos(tilt), rail_z + back_len * math.sin(tilt))
    for side in (-1.0, 1.0):
        x = side * half_w
        parts.append(rod(f'rail{side:+.0f}', (x, hinge_y, rail_z), (x, foot_y, rail_z), 0.014,
                         m['white_frame'], 6))
        parts.append(rod(f'back{side:+.0f}', (x, hinge_y, rail_z), (x, back_top[0], back_top[1]),
                         0.013, m['white_frame'], 6))
        parts.append(rod(f'tail{side:+.0f}', (x, hinge_y, rail_z), (x, -0.95, rail_z), 0.014,
                         m['white_frame'], 6))
        for y in (0.82, -0.85):
            parts.append(rod(f'leg{side:+.0f}{y:+.1f}', (x, y, rail_z), (x * 1.04, y, 0.03),
                             0.013, m['white_frame'], 6))
        parts.append(mat(build.cylinder(f'foot{side:+.0f}', radius=0.02, depth=0.03, segments=6,
                                        location=(x * 1.04, 0.82, 0.0), on_ground=True),
                         m['plastic']))
        wheel = mat(build.cylinder(f'wheel{side:+.0f}', radius=0.055, depth=0.03, segments=10),
                    m['plastic'])
        modify.transform(wheel, rotation=(0.0, math.pi * 0.5, 0.0))
        modify.transform(wheel, location=(x * 1.12, -0.85, 0.055))
        parts.append(wheel)
    for y in (foot_y, -0.95):
        parts.append(rod(f'cross{y:+.1f}', (-half_w, y, rail_z), (half_w, y, rail_z), 0.013,
                         m['white_frame'], 6))
    parts.append(rod('cross_top', (-half_w, back_top[0], back_top[1]),
                     (half_w, back_top[0], back_top[1]), 0.013, m['white_frame'], 6))
    parts.append(rod('prop', (-half_w * 0.9, hinge_y - 0.32, rail_z),
                     (half_w * 0.9, hinge_y - 0.32, rail_z), 0.01, m['white_frame'], 4))
    # The sling: canvas stretched between the rails, sagging a little, and up the backrest.
    def bed_rows(lift=0.0, wide=0.96, sag=0.025):
        rows = []
        for step in range(8):
            y = foot_y - 0.02 - (foot_y - 0.02 - hinge_y) * step / 7
            rows.append([(c * half_w * wide, y, rail_z + 0.005 + lift - sag * (1.0 - c * c))
                         for c in (-1.0, -0.5, 0.0, 0.5, 1.0)])
        for step in range(1, 5):
            t = step / 4 * 0.97
            y = hinge_y - back_len * t * math.cos(tilt)
            z = rail_z + back_len * t * math.sin(tilt)
            rows.append([(c * half_w * wide, y - lift * 0.6, z + 0.005 + lift * 0.8
                          - sag * 0.6 * (1.0 - c * c)) for c in (-1.0, -0.5, 0.0, 0.5, 1.0)])
        return rows
    parts.append(sheet('sling', bed_rows(), m['canvas'], thickness=0.006))
    if towel:
        rows = bed_rows(lift=0.012, wide=0.9, sag=0.018)
        rows = [rows[0]] + rows
        rows[0] = [(x * 1.02, y + 0.03, z - 0.24) for x, y, z in rows[1]]
        parts.append(sheet('towel', rows[:8], m['towel'], thickness=0.008))
        parts.append(sheet('towel_back', rows[7:], m['towel'], thickness=0.008))
        stripe = [[(x, y, z + 0.006) for x, y, z in row] for row in rows[2:4]]
        parts.append(sheet('towel_stripe', stripe, m['canvas_white'], thickness=0.003))
    return parts


# ---------------------------------------------------------------------------------------------
# Lifeguard tower
# ---------------------------------------------------------------------------------------------

DECK_Z, DECK = 2.2, 1.3          # deck top height, half size of the square deck
CAB_X, CAB_Y0, CAB_Y1, CAB_H = 1.0, -1.15, 0.65, 2.0


def model_lifeguard_tower(m):
    parts = []
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            x, y = sx * (DECK - 0.12), sy * (DECK - 0.12)
            parts.append(beam(f'stilt{sx:+.0f}{sy:+.0f}', (x, y, -0.3), (x, y, DECK_Z - 0.1),
                              (0.15, 0.15), m['timber']))
    # Cross bracing on the four sides, and a ring beam under the deck.
    for sx in (-1.0, 1.0):
        x = sx * (DECK - 0.12)
        parts.append(beam(f'brace_x{sx:+.0f}a', (x, -DECK + 0.2, 0.3), (x, DECK - 0.2, DECK_Z - 0.3),
                          (0.05, 0.12), m['timber']))
        parts.append(beam(f'brace_x{sx:+.0f}b', (x, DECK - 0.2, 0.3), (x, -DECK + 0.2, DECK_Z - 0.3),
                          (0.05, 0.12), m['timber']))
        parts.append(beam(f'ring_x{sx:+.0f}', (x, -DECK, DECK_Z - 0.17), (x, DECK, DECK_Z - 0.17),
                          (0.08, 0.16), m['timber']))
    for sy in (-1.0, 1.0):
        y = sy * (DECK - 0.12)
        parts.append(beam(f'brace_y{sy:+.0f}a', (-DECK + 0.2, y, 0.3), (DECK - 0.2, y, DECK_Z - 0.3),
                          (0.12, 0.05), m['timber']))
        parts.append(beam(f'brace_y{sy:+.0f}b', (DECK - 0.2, y, 0.3), (-DECK + 0.2, y, DECK_Z - 0.3),
                          (0.12, 0.05), m['timber']))
        parts.append(beam(f'ring_y{sy:+.0f}', (-DECK, y, DECK_Z - 0.17), (DECK, y, DECK_Z - 0.17),
                          (0.16, 0.08), m['timber']))
    parts.append(mat(build.box('deck', (DECK * 2.0, DECK * 2.0, 0.08),
                               location=(0.0, 0.0, DECK_Z - 0.08), on_ground=True), m['deck']))

    # The cabin: plank walls with a wide window to the sea, side windows, a door at the back.
    z0, z1 = DECK_Z, DECK_Z + CAB_H
    t = 0.07

    def wall_x(name, x, spans):
        for index, (ya, yb, za, zb) in enumerate(spans):
            parts.append(mat(build.box(f'{name}{index}', (t, yb - ya, zb - za),
                                       location=(x, (ya + yb) * 0.5, (za + zb) * 0.5)), m['cabin']))

    def wall_y(name, y, spans):
        for index, (xa, xb, za, zb) in enumerate(spans):
            parts.append(mat(build.box(f'{name}{index}', (xb - xa, t, zb - za),
                                       location=((xa + xb) * 0.5, y, (za + zb) * 0.5)), m['cabin']))
    sill, head = z0 + 0.95, z0 + 1.75
    wall_y('front', CAB_Y1, [(-CAB_X, CAB_X, z0, sill), (-CAB_X, CAB_X, head, z1),
                             (-CAB_X, -0.85, sill, head), (0.85, CAB_X, sill, head)])
    wall_y('back', CAB_Y0, [(-CAB_X, -0.05, z0, z1), (0.75, CAB_X, z0, z1),
                            (-0.05, 0.75, z0 + 1.95, z1)])
    for sx in (-1.0, 1.0):
        wall_x(f'side{sx:+.0f}', sx * CAB_X, [(CAB_Y0, CAB_Y1, z0, sill), (CAB_Y0, CAB_Y1, head, z1),
                                              (CAB_Y0, -0.6, sill, head), (0.25, CAB_Y1, sill, head)])
    # White trim: sills, corner boards, the frame of the sea window.
    parts.append(mat(build.box('sill_front', (1.84, 0.12, 0.05), location=(0.0, CAB_Y1 + 0.03, sill)),
                     m['trim']))
    for sx in (-1.0, 1.0):
        for y in (CAB_Y0, CAB_Y1):
            parts.append(mat(build.box(f'corner{sx:+.0f}{y:+.1f}', (0.1, 0.1, CAB_H),
                                       location=(sx * CAB_X, y, z0 + CAB_H * 0.5)), m['trim']))
        parts.append(mat(build.box(f'sill{sx:+.0f}', (0.12, 0.9, 0.05),
                                   location=(sx * (CAB_X + 0.03), -0.17, sill)), m['trim']))
    # A propped shutter over the sea window and a dark interior back wall.
    shutter = mat(build.box('shutter', (1.8, 0.05, 0.75)), m['cabin'])
    modify.transform(shutter, rotation=(math.radians(-62.0), 0.0, 0.0))
    modify.transform(shutter, location=(0.0, CAB_Y1 + 0.33, head + 0.18))
    parts.append(shutter)
    for sx in (-1.0, 1.0):
        parts.append(rod(f'shutter_stay{sx:+.0f}', (sx * 0.8, CAB_Y1 + 0.02, sill + 0.35),
                         (sx * 0.8, CAB_Y1 + 0.55, head + 0.33), 0.012, m['white_frame'], 4))
    parts.append(mat(build.box('interior', (2.0 - 2 * t, 0.02, CAB_H - 0.05),
                               location=(0.0, CAB_Y0 + t, z0 + CAB_H * 0.5)), m['interior']))
    # Hipped tin roof with a deep overhang, a fascia board under its edge.
    eave_x, eave_y, top = CAB_X + 0.32, (CAB_Y1 - CAB_Y0) * 0.5 + 0.32, z1 + 0.62
    cy = (CAB_Y0 + CAB_Y1) * 0.5
    sections = [[(-eave_x, cy - eave_y, z1 + 0.06), (eave_x, cy - eave_y, z1 + 0.06),
                 (eave_x, cy + eave_y, z1 + 0.06), (-eave_x, cy + eave_y, z1 + 0.06)],
                [(-0.3, cy - 0.12, top), (0.3, cy - 0.12, top), (0.3, cy + 0.12, top),
                 (-0.3, cy + 0.12, top)]]
    parts.append(mat(build.loft('roof', sections, cap_start=True, cap_end=True), m['roof']))
    parts.append(mat(build.box('fascia', (eave_x * 2.0, eave_y * 2.0, 0.12),
                               location=(0.0, cy, z1 + 0.0), on_ground=True), m['trim']))
    # The front rail round the deck before the cabin.
    rail_z = DECK_Z + 1.0
    posts = [(-DECK + 0.04, DECK - 0.04), (DECK - 0.04, DECK - 0.04), (-DECK + 0.04, CAB_Y1),
             (DECK - 0.04, CAB_Y1), (-0.4, DECK - 0.04), (0.4, DECK - 0.04)]
    for index, (x, y) in enumerate(posts):
        parts.append(beam(f'rail_post{index}', (x, y, DECK_Z), (x, y, rail_z + 0.04), (0.07, 0.07),
                          m['trim']))
    for z, size in ((rail_z, (0.1, 0.05)), (DECK_Z + 0.5, (0.06, 0.04))):
        parts.append(beam(f'rail_front{z:.1f}', (-DECK, DECK - 0.04, z), (DECK, DECK - 0.04, z),
                          (size[1], size[0]), m['trim']))
        for sx in (-1.0, 1.0):
            parts.append(beam(f'rail_side{sx:+.0f}{z:.1f}', (sx * (DECK - 0.04), CAB_Y1, z),
                              (sx * (DECK - 0.04), DECK, z), size, m['trim']))
    # The ramp down the back to the sand, with cleats and a hand rail on each side.
    ramp_x, ramp_w, ramp_len = 0.35, 0.9, 4.6
    top_y, foot_y = -DECK, -DECK - ramp_len
    parts.append(beam('ramp', (ramp_x, top_y, DECK_Z - 0.06), (ramp_x, foot_y, 0.0),
                      (ramp_w, 0.06), m['deck']))
    slope = math.atan2(DECK_Z, ramp_len)
    for step in range(1, 12):
        f = step / 12
        y, z = top_y - ramp_len * f, (DECK_Z - 0.03) * (1.0 - f) + 0.03
        parts.append(mat(build.box(f'cleat{step}', (ramp_w - 0.1, 0.04, 0.025),
                                   location=(ramp_x, y, z)), m['timber']))
    for sx in (-1.0, 1.0):
        x = ramp_x + sx * (ramp_w * 0.5 - 0.02)
        parts.append(beam(f'ramp_rail{sx:+.0f}', (x, top_y, DECK_Z + 0.95), (x, foot_y + 0.3, 0.95),
                          (0.05, 0.05), m['trim']))
        for f in (0.0, 0.5, 0.92):
            y, z = top_y - ramp_len * f, DECK_Z * (1.0 - f)
            parts.append(beam(f'ramp_post{sx:+.0f}{f:.1f}', (x, y, z), (x, y, z + 0.95 - 0.02),
                              (0.05, 0.05), m['trim']))
        parts.append(beam(f'ramp_leg{sx:+.0f}', (x, top_y - ramp_len * 0.5, -0.2),
                          (x, top_y - ramp_len * 0.5, DECK_Z * 0.5 - 0.05), (0.1, 0.1), m['timber']))
    # The flag pole at the front corner, a red-over-yellow flag stirring towards +X.
    pole_x, pole_y = -DECK + 0.1, DECK - 0.1
    parts.append(rod('flag_pole', (pole_x, pole_y, DECK_Z), (pole_x, pole_y, DECK_Z + 4.1),
                     0.028, m['white_frame'], 8))
    parts.append(mat(build.sphere('flag_ball', radius=0.045, segments=8, rings=4,
                                  location=(pole_x, pole_y, DECK_Z + 4.15)), m['white_frame']))
    for half, material in ((0, m['flag_red']), (1, m['flag_yellow'])):
        rows = []
        for i in range(2):
            z = DECK_Z + 4.0 - 0.33 * (half + i)
            rows.append([(pole_x + 0.03 + 0.9 * c, pole_y + 0.06 * math.sin(c * 5.0 + half), z
                          - 0.04 * c * c) for c in (0.0, 0.25, 0.5, 0.75, 1.0)])
        parts.append(sheet(f'flag{half}', rows, material, thickness=0.006))
    return parts


# ---------------------------------------------------------------------------------------------
# Beach bar kiosk
# ---------------------------------------------------------------------------------------------

def model_kiosk(m):
    parts = []
    hx, y0, y1, height, t = 1.6, -1.2, 1.2, 2.35, 0.12
    counter, hatch_top = 1.05, 2.1
    parts.append(mat(build.box('back', (hx * 2, t, height), location=(0.0, y0 + t * 0.5, 0.0),
                               on_ground=True), m['stucco']))
    for sx in (-1.0, 1.0):
        parts.append(mat(build.box(f'side{sx:+.0f}', (t, y1 - y0, height),
                                   location=(sx * (hx - t * 0.5), 0.0, 0.0), on_ground=True),
                         m['stucco']))
    parts.append(mat(build.box('front_low', (hx * 2, t, counter), location=(0.0, y1 - t * 0.5, 0.0),
                               on_ground=True), m['stucco']))
    parts.append(mat(build.box('front_head', (hx * 2, t, height - hatch_top),
                               location=(0.0, y1 - t * 0.5, hatch_top), on_ground=True), m['stucco']))
    parts.append(mat(build.box('plinth', (hx * 2 + 0.06, y1 - y0 + 0.06, 0.12), on_ground=True),
                     m['trim']))
    parts.append(mat(build.box('counter', (hx * 2 + 0.2, 0.5, 0.05),
                               location=(0.0, y1 + 0.1, counter), on_ground=True), m['counter']))
    parts.append(mat(build.box('inner_counter', (hx * 2 - 0.3, 0.45, 0.9),
                               location=(0.0, y1 - 0.45, 0.0), on_ground=True), m['counter']))
    parts.append(mat(build.box('interior', (hx * 2 - 0.25, 0.02, height - 0.2),
                               location=(0.0, y0 + t + 0.01, 0.1), on_ground=True), m['interior']))
    parts.append(mat(build.box('fridge', (0.7, 0.6, 1.75), location=(-0.85, y0 + 0.45, 0.0),
                               on_ground=True), m['fridge']))
    parts.append(mat(build.box('shelf', (1.4, 0.3, 0.04), location=(0.55, y0 + 0.27, 1.55),
                               on_ground=True), m['counter']))
    for index in range(7):
        parts.append(mat(build.cylinder(f'bottle{index}', radius=0.035, depth=0.26, segments=6,
                                        radius_top=0.015,
                                        location=(0.05 + 0.16 * index, y0 + 0.27, 1.59),
                                        on_ground=True), m['seat' if index % 2 else 'plastic']))
    # Flat roof slab with an overhang, a sign board on its front edge.
    parts.append(mat(build.box('roof', (hx * 2 + 0.5, y1 - y0 + 0.5, 0.14),
                               location=(0.0, 0.1, height), on_ground=True), m['trim']))
    parts.append(mat(build.box('sign', (2.4, 0.06, 0.45), location=(0.0, y1 + 0.3, height + 0.14),
                               on_ground=True), m['sign']))
    for sx in (-1.0, 1.0):
        parts.append(beam(f'sign_post{sx:+.0f}', (sx * 1.0, y1 + 0.25, height + 0.14),
                          (sx * 1.0, y1 + 0.25, height + 0.55), (0.04, 0.04), m['white_frame']))
    # The striped awning over the hatch, sloping out and down, a scalloped edge.
    stripes = 10
    for index in range(stripes):
        xa = -hx - 0.2 + (hx * 2 + 0.4) * index / stripes
        xb = -hx - 0.2 + (hx * 2 + 0.4) * (index + 1) / stripes
        material = m['canvas'] if index % 2 == 0 else m['canvas_white']
        rows = [[(x, y1 + 0.08, height - 0.04) for x in (xa, xb)],
                [(x, y1 + 0.95, height - 0.42) for x in (xa, xb)],
                [(x, y1 + 0.96, height - 0.6 + (0.04 if k else 0.0)) for k, x in enumerate((xa, xb))]]
        parts.append(sheet(f'awning{index}', rows, material, thickness=0.005))
    # Three stools at the counter.
    for index, x in enumerate((-1.0, 0.0, 1.0)):
        y = y1 + 0.55
        parts.append(rod(f'stool_leg{index}', (x, y, 0.0), (x, y, 0.72), 0.02, m['aluminium'], 6))
        parts.append(mat(build.cylinder(f'stool_foot{index}', radius=0.2, depth=0.02, segments=10,
                                        location=(x, y, 0.0), on_ground=True), m['aluminium']))
        ring = mat(build.cylinder(f'stool_ring{index}', radius=0.15, depth=0.015, segments=10,
                                  location=(x, y, 0.3), on_ground=True), m['aluminium'])
        parts.append(ring)
        parts.append(mat(build.cylinder(f'stool_seat{index}', radius=0.18, depth=0.06, segments=12,
                                        location=(x, y, 0.72), on_ground=True), m['seat']))
    return parts


# ---------------------------------------------------------------------------------------------
# Volleyball net
# ---------------------------------------------------------------------------------------------

def model_volleyball_net(m):
    parts = []
    half, top, depth = 4.75, 2.43, 1.0
    for sx in (-1.0, 1.0):
        x = sx * half
        parts.append(rod(f'post{sx:+.0f}', (x, 0.0, -0.4), (x, 0.0, 2.55), 0.045, m['aluminium'], 10))
        parts.append(mat(build.sphere(f'cap{sx:+.0f}', radius=0.05, segments=8, rings=4,
                                      location=(x, 0.0, 2.56)), m['plastic']))
        parts.append(mat(build.cylinder(f'pad{sx:+.0f}', radius=0.075, depth=1.7, segments=10,
                                        location=(x, 0.0, 0.05), on_ground=True), m['canvas']))
        parts.append(rod(f'guy{sx:+.0f}', (x, 0.0, 2.5), (x + sx * 1.3, 0.0, 0.0), 0.006,
                         m['rope'], 4))
        parts.append(mat(build.box(f'peg{sx:+.0f}', (0.06, 0.04, 0.08),
                                   location=(x + sx * 1.3, 0.0, 0.0), on_ground=True), m['plastic']))
        for z in (top - 0.03, top - depth + 0.02):
            parts.append(rod(f'tie{sx:+.0f}{z:.1f}', (sx * 4.5, 0.0, z), (x, 0.0, z), 0.005,
                             m['rope'], 4))
    # White bands along the top and bottom, the meshes of the net between them (10 cm).
    parts.append(mat(build.box('band_top', (9.0, 0.012, 0.07), location=(0.0, 0.0, top - 0.035)),
                     m['canvas_white']))
    parts.append(mat(build.box('band_bottom', (9.0, 0.01, 0.05),
                               location=(0.0, 0.0, top - depth + 0.025)), m['canvas_white']))
    rows = 9
    for index in range(1, rows):
        z = top - 0.07 - (depth - 0.12) * index / rows
        parts.append(mat(build.tube(f'cord_h{index}', [(-4.5, 0.0, z), (4.5, 0.0, z - 0.004)],
                                    radius=0.003, segments=3, caps=False, up=(0.0, 0.0, 1.0)),
                         m['cord']))
    for index in range(91):
        x = -4.5 + 9.0 * index / 90
        sag = 0.003 * math.sin(index * 1.7)
        parts.append(mat(build.tube(f'cord_v{index}', [(x, sag, top - 0.07), (x, sag, top - depth + 0.05)],
                                    radius=0.003, segments=3, caps=False, up=(1.0, 0.0, 0.0)),
                         m['cord']))
    # The two antennas over the sidelines, banded white and red.
    for sx in (-1.0, 1.0):
        x = sx * 4.0
        for band in range(6):
            za = top - depth + 0.0 + 0.3 * band
            parts.append(rod(f'antenna{sx:+.0f}{band}', (x, 0.02, za), (x, 0.02, za + 0.3), 0.005,
                             m['canvas'] if band % 2 else m['canvas_white'], 4))
    return parts


def make(a):
    m = L.materials(seed=11)
    layout = L.SetLayout(a, gap=1.5)
    layout.object('parasol_open', model_parasol_open(m), 2.4, cls='knockable', mass=6.0,
                  colliders=[('cyl', 'pole', (0.0, 0.0, 1.0), (0.06, 2.0))])
    layout.object('parasol_closed', model_parasol_closed(m), 0.4, cls='knockable', mass=5.0,
                  colliders=[('cyl', 'pole', (0.0, 0.0, 1.2), (0.13, 2.4))])
    layout.object('lounger', model_lounger(m), 0.8, cls='knockable', mass=9.0,
                  colliders=[('box', 'bed', (0.0, 0.0, 0.25), (0.66, 1.95, 0.5))])
    layout.object('lounger_towel', model_lounger(m, towel=True), 0.8, cls='knockable', mass=9.5,
                  colliders=[('box', 'bed', (0.0, 0.0, 0.25), (0.66, 1.95, 0.5))])
    layout.object('lifeguard_tower', model_lifeguard_tower(m), 2.8, cls='fixed',
                  colliders=[('box', 'cabin', (0.0, 0.0, DECK_Z + 1.4), (2.6, 2.6, 2.9))]
                  + [('cyl', f'stilt_{name}', (sx * (DECK - 0.12), sy * (DECK - 0.12), DECK_Z * 0.5),
                      (0.11, DECK_Z)) for name, sx, sy in (('fl', -1, 1), ('fr', 1, 1),
                                                          ('bl', -1, -1), ('br', 1, -1))],
                  anchors=[('use', (0.35, -DECK - 4.9, 0.0), (0.0, 1.0, 0.0)),
                           ('flag', (-DECK + 0.1, DECK - 0.1, DECK_Z + 4.1), (1.0, 0.0, 0.0))])
    layout.object('beach_bar_kiosk', model_kiosk(m), 3.6, cls='fixed',
                  colliders=[('box', 'kiosk', (0.0, 0.0, 1.2), (3.2, 2.4, 2.4))],
                  anchors=[('sign', (0.0, 1.2 + 0.335, 2.35 + 0.14 + 0.225), (0.0, 1.0, 0.0)),
                           ('use', (0.0, 1.2 + 0.85, 0.0), (0.0, -1.0, 0.0))])
    layout.object('volleyball_net', model_volleyball_net(m), 12.3, cls='fixed',
                  colliders=[('cyl', 'post_l', (-4.75, 0.0, 1.3), (0.06, 2.6)),
                             ('cyl', 'post_r', (4.75, 0.0, 1.3), (0.06, 2.6))])
    layout.finish(lod_ratio=0.35, lod_distance=40.0)
    a.bake(occlusion_distance=0.4)
