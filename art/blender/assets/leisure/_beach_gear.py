"""Beach gear for set_beach, part two (a helper module, not an asset): surfboards and their
rack, a beach shower, a sit-on-top kayak, a pedal boat, the line markers of a volleyball
court and slatted beach bins. Each model_* function returns the parts of one object, modelled
about its own ground centre (Z up, facing +Y), for _leisure.SetLayout.object.

Original designs in real sizes: a 2.1 m funboard (0.55 m wide, 7 cm thick, rockered nose,
three fins), a 3.0 m sit-on-top kayak (0.76 m beam) with a moulded seat well and a paddle, a
two-seat pedal boat of 2.7 x 1.5 m on twin pontoons, a 2.3 m shower post on a concrete pad
with a slatted duckboard, a 16 x 8 m court outlined in 5 cm tape with corner anchors, and a
0.62 m square bin of vertical timber slats round a black liner under a hinged lid.
"""
import math

from mathutils import Vector

from lib import build, modify
from lib import materials as M


def mat(obj, material):
    obj.data.materials.append(material)
    return obj


def rod(name, start, end, radius, material, segments=6):
    start, end = Vector(start), Vector(end)
    vertical = abs(end.z - start.z) > 0.9 * (end - start).length
    return mat(build.tube(name, [tuple(start), tuple(end)], radius=radius, segments=segments,
                          caps=True, up=(1.0, 0.0, 0.0) if vertical else (0.0, 0.0, 1.0)), material)


def block(name, size, location, material, rotation=(0.0, 0.0, 0.0)):
    part = build.box(name, size)
    if any(rotation):
        modify.transform(part, rotation=rotation)
    modify.transform(part, location=location)
    return mat(part, material)


def gear_materials(seed=0):
    return {
        'board_white': M.plastic(color=(0.80, 0.79, 0.74), roughness=0.22, grain=0.2, scuffs=0.35,
                                 seed=seed, name='board_white'),
        'board_teal': M.plastic(color=(0.08, 0.42, 0.46), roughness=0.22, grain=0.2, scuffs=0.35,
                                seed=seed + 1, name='board_teal'),
        'board_yellow': M.plastic(color=(0.80, 0.56, 0.10), roughness=0.22, grain=0.2,
                                  scuffs=0.35, seed=seed + 2, name='board_yellow'),
        'board_coral': M.plastic(color=(0.74, 0.27, 0.19), roughness=0.22, grain=0.2, scuffs=0.35,
                                 seed=seed + 3, name='board_coral'),
        'kayak': M.plastic(color=(0.78, 0.36, 0.05), roughness=0.38, grain=0.4, scuffs=0.5,
                           seed=seed + 4, name='kayak_plastic'),
        'hull_white': M.plastic(color=(0.78, 0.78, 0.74), roughness=0.32, grain=0.3, scuffs=0.5,
                                seed=seed + 5, name='hull_white'),
        'tape': M.fabric(color=(0.07, 0.24, 0.52), thread=0.003, fade=0.5, dirt=0.35,
                         seed=seed + 6, name='court_tape'),
        'concrete': M.concrete(color=(0.58, 0.56, 0.52), stains=0.5, cracks=0.2, pits=0.4,
                               seed=seed + 7, name='shower_pad'),
        'steel': M.brushed_metal(color=(0.66, 0.67, 0.68), roughness=0.3, grime=0.3,
                                 seed=seed + 8, name='shower_steel'),
        'lid_blue': M.plastic(color=(0.06, 0.20, 0.42), roughness=0.4, seed=seed + 9,
                              name='lid_blue'),
        'pad_black': M.rubber(color=(0.03, 0.03, 0.032), dust=0.6, seed=seed + 10,
                              name='deck_pad'),
    }


# ---------------------------------------------------------------------------------------------
# Surfboards
# ---------------------------------------------------------------------------------------------

def _table(points, t):
    for (t0, v0), (t1, v1) in zip(points, points[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * (t - t0) / max(1e-6, t1 - t0)
    return points[-1][1]


OUTLINE = [(0.0, 0.17), (0.04, 0.30), (0.2, 0.44), (0.45, 0.5), (0.65, 0.47), (0.82, 0.36),
           (0.93, 0.2), (1.0, 0.02)]
THICK = [(0.0, 0.3), (0.08, 0.62), (0.4, 1.0), (0.7, 0.9), (0.92, 0.5), (1.0, 0.18)]


def surfboard(name, material, length=2.1, width=0.55, thick=0.07, stations=14, around=10):
    """A board lying deck up along +Y, tail at y = 0, nose at y = length; returns its parts
    (shell, three fins, a deck pad)."""
    sections = []
    for i in range(stations + 1):
        t = i / stations
        half = width * _table(OUTLINE, t)
        th = thick * _table(THICK, t)
        bottom = 0.11 * max(0.0, (t - 0.58) / 0.42) ** 2 + 0.03 * max(0.0, (0.25 - t) / 0.25) ** 2
        ring = []
        for j in range(around):
            phi = math.tau * j / around
            c, s = math.cos(phi), math.sin(phi)
            x = -half * math.copysign(abs(c) ** 0.55, c)
            z = bottom + th * (0.42 + (0.58 * s ** 0.8 if s > 0 else -0.42 * (-s) ** 0.4))
            ring.append((x, length * t, z))
        sections.append(ring)
    shell = mat(build.loft(f'{name}_shell', sections, closed=True, cap_start=True, cap_end=True),
                material)
    parts = [shell]
    for k, (x, y, yaw) in enumerate(((0.0, 0.1, 0.0), (-0.16, 0.24, -0.08), (0.16, 0.24, 0.08))):
        parts.append(block(f'{name}_fin{k}', (0.008, 0.11, 0.1), (x, y, -0.04), material,
                           rotation=(0.0, 0.0, yaw)))
    return parts


def model_surfboard(m, g):
    """One board lying on the sand, deck up (fins dug in a little)."""
    parts = surfboard('board', g['board_white'])
    parts.append(block('pad', (0.34, 0.32, 0.006), (0.0, 0.24, 0.072), g['pad_black']))
    for part in parts:
        modify.transform(part, location=(0.0, -1.05, 0.05))
    return parts


def model_surfboard_rack(m, g):
    """A timber rack 2.4 m long holding four boards upright, noses up, leaning back a little
    against the top rail; feet in the sand."""
    parts = []
    for sx in (-1.0, 1.0):
        x = sx * 1.15
        for sy in (-1.0, 1.0):
            parts.append(block(f'post{sx:+.0f}{sy:+.0f}', (0.09, 0.09, 1.75),
                               (x, sy * 0.28, 0.875 - 0.2), m['timber']))
        parts.append(block(f'tie{sx:+.0f}', (0.07, 0.62, 0.07), (x, 0.0, 1.25), m['timber']))
        parts.append(block(f'foot{sx:+.0f}', (0.07, 0.62, 0.07), (x, 0.0, 0.18), m['timber']))
    parts.append(block('rail_top_back', (2.4, 0.07, 0.09), (0.0, -0.28, 1.25), m['timber']))
    parts.append(block('rail_top_front', (2.4, 0.07, 0.09), (0.0, 0.28, 1.25), m['timber']))
    parts.append(block('tray', (2.4, 0.5, 0.05), (0.0, 0.0, 0.2), m['deck']))
    parts.append(block('pad_top', (2.3, 0.05, 0.03), (0.0, -0.24, 1.31), m['rope']))
    colours = ('board_teal', 'board_white', 'board_yellow', 'board_coral')
    for k, colour in enumerate(colours):
        length = (2.1, 1.95, 2.25, 1.85)[k]
        board = surfboard(f'rack{k}', g[colour], length=length, width=(0.55, 0.52, 0.57, 0.5)[k])
        for part in board:
            # stand it: tail on the tray, nose up, deck towards +Y, leaning back on the rail
            modify.transform(part, rotation=(math.radians(-90.0 + 12.0), 0.0,
                                              math.radians((k - 1.5) * 2.0)))
            modify.transform(part, location=(-0.84 + 0.56 * k, -0.04, 0.24))
        parts.extend(board)
    return parts


# ---------------------------------------------------------------------------------------------
# Beach shower
# ---------------------------------------------------------------------------------------------

def model_beach_shower(m, g):
    parts = [block('pad', (1.2, 1.2, 0.1), (0.0, 0.0, 0.03), g['concrete'])]
    for k in range(7):
        y = -0.42 + 0.14 * k
        parts.append(block(f'slat{k}', (0.95, 0.1, 0.03), (0.0, y, 0.11), m['deck']))
    for sx in (-1.0, 1.0):
        parts.append(block(f'bearer{sx:+.0f}', (0.06, 0.98, 0.04), (sx * 0.38, 0.0, 0.08),
                           m['timber']))
    parts.append(block('column', (0.12, 0.12, 2.25), (0.0, -0.52, 1.125 + 0.08), g['steel']))
    parts.append(block('cap', (0.15, 0.15, 0.02), (0.0, -0.52, 2.34), g['steel']))
    # The arm out over the duckboard and the head.
    parts.append(rod('arm_up', (0.0, -0.52, 2.2), (0.0, -0.52, 2.42), 0.022, g['steel']))
    parts.append(rod('arm', (0.0, -0.52, 2.42), (0.0, -0.1, 2.36), 0.022, g['steel']))
    parts.append(mat(build.cylinder('head', radius=0.085, depth=0.035, segments=12,
                                    location=(0.0, -0.06, 2.32)), g['steel']))
    # Push taps: one for the shower, one low for the feet.
    for z, name in ((1.1, 'tap'), (0.45, 'foot_tap')):
        parts.append(block(f'{name}_plate', (0.1, 0.02, 0.14), (0.0, -0.455, z), g['steel']))
        parts.append(mat(build.cylinder(f'{name}_button', radius=0.025, depth=0.03, segments=8),
                         m['plastic']))
        modify.transform(parts[-1], rotation=(math.radians(90.0), 0.0, 0.0))
        modify.transform(parts[-1], location=(0.0, -0.44, z))
    parts.append(rod('foot_spout', (0.0, -0.46, 0.38), (0.0, -0.34, 0.34), 0.012, g['steel']))
    parts.append(mat(build.cylinder('drain', radius=0.07, depth=0.012, segments=10,
                                    location=(0.0, 0.0, 0.135)), g['steel']))
    return parts


# ---------------------------------------------------------------------------------------------
# Boats on the sand
# ---------------------------------------------------------------------------------------------

def hull(name, material, length, beam, depth, stations=16, around=12, keel=0.6, sheer=0.05):
    """A closed boat hull along +Y centred on the origin: a round-bilged section with a flat
    deck, pointed bow (+Y) and a narrower stern; its bottom at z = 0."""
    sections = []
    for i in range(stations + 1):
        t = i / stations
        plan = math.sin(math.pi * min(1.0, 0.08 + 0.92 * t)) ** 0.6
        plan = max(0.04, plan * (0.85 + 0.15 * t if t < 0.5 else 1.0))
        half = beam * 0.5 * plan
        rise = 0.10 * max(0.0, (t - 0.75) / 0.25) ** 2 + 0.04 * max(0.0, (0.15 - t) / 0.15) ** 2
        top = depth + sheer * (2.0 * t - 1.0) ** 2
        ring = []
        for j in range(around):
            phi = math.tau * j / around
            c, s = math.cos(phi), math.sin(phi)
            x = -half * math.copysign(abs(c) ** 0.7, c)
            if s >= 0:
                z = rise + (top - rise) * (0.55 + 0.45 * s ** 0.3)
            else:
                z = rise + (top - rise) * 0.55 * (1.0 - (-s) ** keel)
            ring.append((x, length * (t - 0.5), z))
        sections.append(ring)
    return mat(build.loft(name, sections, closed=True, cap_start=True, cap_end=True), material)


def model_kayak(m, g):
    """A sit-on-top kayak lying on the sand with its paddle across the seat well."""
    parts = [hull('kayak_hull', g['kayak'], 3.0, 0.76, 0.3, keel=0.45)]
    parts.append(block('seat_well', (0.5, 0.72, 0.03), (0.0, -0.1, 0.305), g['kayak']))
    parts.append(block('back_band', (0.42, 0.05, 0.22), (0.0, -0.5, 0.4), m['plastic'],
                       rotation=(math.radians(-15.0), 0.0, 0.0)))
    parts.append(block('seat_pad', (0.42, 0.42, 0.03), (0.0, -0.28, 0.33), m['plastic']))
    for sy in (-1.0, 1.0):
        parts.append(rod(f'handle{sy:+.0f}', (0.0, sy * 1.42, 0.26), (0.0, sy * 1.5, 0.22),
                         0.018, m['plastic'], 5))
    parts.append(block('hatch', (0.3, 0.42, 0.03), (0.0, 0.75, 0.31), m['plastic']))
    # Paddle: a shaft with two blades, feathered.
    parts.append(rod('paddle_shaft', (-1.05, 0.15, 0.36), (1.05, 0.0, 0.36), 0.015, m['aluminium']))
    for sx in (-1.0, 1.0):
        parts.append(block(f'paddle_blade{sx:+.0f}', (0.44, 0.17, 0.012),
                           (sx * 1.2, 0.075 - sx * 0.07, 0.36), g['board_yellow'],
                           rotation=(math.radians(20.0 * sx), 0.0, math.radians(-4.0))))
    for part in parts:
        modify.transform(part, rotation=(0.0, math.radians(3.0), 0.0))
    return parts


def model_pedal_boat(m, g):
    """A two-seat pedal boat on twin pontoons, pulled up on the sand."""
    parts = []
    for sx in (-1.0, 1.0):
        pontoon = hull(f'pontoon{sx:+.0f}', g['hull_white'], 2.7, 0.44, 0.46, around=10,
                       stations=12, keel=0.55)
        modify.transform(pontoon, location=(sx * 0.53, 0.0, 0.0))
        parts.append(pontoon)
        parts.append(block(f'rub{sx:+.0f}', (0.03, 2.2, 0.05), (sx * 0.76, 0.0, 0.4),
                           m['plastic']))
    parts.append(block('deck', (1.3, 2.1, 0.08), (0.0, -0.05, 0.46), g['hull_white']))
    parts.append(block('well', (0.62, 0.9, 0.2), (0.0, 0.35, 0.36), m['seat']))
    parts.append(block('console', (0.5, 0.3, 0.3), (0.0, 0.88, 0.62), g['hull_white']))
    for sx in (-1.0, 1.0):
        x = sx * 0.3
        parts.append(block(f'seat{sx:+.0f}', (0.46, 0.44, 0.08), (x, -0.25, 0.56), m['seat']))
        parts.append(block(f'back{sx:+.0f}', (0.46, 0.08, 0.5), (x, -0.5, 0.82), m['seat'],
                           rotation=(math.radians(-12.0), 0.0, 0.0)))
        parts.append(rod(f'crank{sx:+.0f}', (x * 0.6, 0.62, 0.48), (x * 0.6, 0.7, 0.4), 0.02,
                         m['plastic'], 5))
    parts.append(block('stern_box', (1.0, 0.45, 0.22), (0.0, -0.95, 0.57), g['hull_white']))
    parts.append(rod('tiller', (0.0, 0.18, 0.5), (0.0, 0.1, 0.82), 0.015, m['aluminium']))
    parts.append(mat(build.sphere('tiller_knob', radius=0.035, segments=8, rings=4,
                                  location=(0.0, 0.1, 0.84)), m['plastic']))
    parts.append(rod('paddlewheel_guard', (-0.2, -0.95, 0.15), (0.2, -0.95, 0.15), 0.12,
                     g['hull_white'], 8))
    for part in parts:
        modify.transform(part, rotation=(math.radians(2.5), 0.0, 0.0))
    return parts


# ---------------------------------------------------------------------------------------------
# Court lines and bins
# ---------------------------------------------------------------------------------------------

def model_court_lines(m, g, length=16.0, width=8.0, tape=0.05):
    """The outline of a beach volleyball court in tape lying on the sand (centred on the
    origin, long side along X, so it lies under volleyball_net turned the same way), with
    anchors at the corners and the middle of each long side."""
    parts = []
    hx, hy = length * 0.5, width * 0.5
    for sy in (-1.0, 1.0):
        parts.append(block(f'side{sy:+.0f}', (length + tape, tape, 0.006),
                           (0.0, sy * hy, 0.012), g['tape']))
    for sx in (-1.0, 1.0):
        parts.append(block(f'end{sx:+.0f}', (tape, width - tape, 0.006), (sx * hx, 0.0, 0.012),
                           g['tape']))
    for x, y in ((-hx, -hy), (hx, -hy), (-hx, hy), (hx, hy), (0.0, -hy), (0.0, hy)):
        parts.append(mat(build.cylinder(f'anchor{x:+.0f}{y:+.0f}', radius=0.045, depth=0.02,
                                        segments=8, location=(x, y, 0.012)), m['plastic']))
    return parts


def model_beach_bin(m, g, lid='timber'):
    """A 0.62 m square bin of vertical timber slats on corner posts round a black liner, a
    hinged lid with a front flap."""
    parts = []
    side, height = 0.62, 0.9
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            parts.append(block(f'corner{sx:+.0f}{sy:+.0f}', (0.06, 0.06, height + 0.1),
                               (sx * (side * 0.5 - 0.03), sy * (side * 0.5 - 0.03),
                                (height + 0.1) * 0.5 - 0.1), m['timber']))
    slats = 5
    for k in range(slats):
        u = -side * 0.5 + 0.09 + (side - 0.18) * k / (slats - 1)
        for sy in (-1.0, 1.0):
            parts.append(block(f'slat_y{sy:+.0f}{k}', (0.08, 0.022, height - 0.06),
                               (u, sy * (side * 0.5 - 0.011), height * 0.5 + 0.01), m['timber']))
        for sx in (-1.0, 1.0):
            parts.append(block(f'slat_x{sx:+.0f}{k}', (0.022, 0.08, height - 0.06),
                               (sx * (side * 0.5 - 0.011), u, height * 0.5 + 0.01), m['timber']))
    for z in (0.12, height - 0.08):
        for sy in (-1.0, 1.0):
            parts.append(block(f'band{z:.1f}{sy:+.0f}', (side + 0.01, 0.012, 0.05),
                               (0.0, sy * (side * 0.5 + 0.004), z), m['aluminium']))
    parts.append(block('liner', (side - 0.08, side - 0.08, height - 0.1),
                       (0.0, 0.0, (height - 0.1) * 0.5 + 0.05), m['plastic']))
    lid_material = g['lid_blue'] if lid == 'blue' else m['timber']
    parts.append(block('lid_back', (side + 0.04, side * 0.55, 0.04),
                       (0.0, -side * 0.225, height + 0.03), lid_material,
                       rotation=(math.radians(-6.0), 0.0, 0.0)))
    parts.append(block('lid_flap', (side + 0.04, side * 0.45, 0.03),
                       (0.0, side * 0.27, height + 0.01), lid_material,
                       rotation=(math.radians(14.0), 0.0, 0.0)))
    return parts
