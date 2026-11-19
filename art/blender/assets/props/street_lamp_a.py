"""Street lamp A: the avenue lamp of MARAZUL, an original design.

A 6 m tapered steel pole in worn teal enamel rises from a fluted cast base bolted to the
pavement. Near the top a swept arm reaches 2 m over the road, carried by a wrought scroll, and
ends in a shell-shaped head with a domed diffuser underneath. A small enamel number plate sits
at eye level.

This is the simplest complete example of an asset script: it models parts with the mesh
builders, gives them library materials, joins them into one mesh named lod0, and registers an
anchor (where the light comes from), a collision proxy, an automatic second level of detail and
the bake options. The diffuser's material is named lamp_main, so the game can switch it.

Blender axes: Z up, the lamp faces +Y (its arm reaches over the road in front of it).
"""
import math

from lib import build, modify, profiles, scene, shading
from lib import materials as M

ASSET = {
    'id': 'street_lamp_a',
    'kind': 'prop',
    'atlas': 1024,
}

LAMP_COLOR = (1.0, 0.84, 0.60)
HEAD_START, HEAD_END, HEAD_HEIGHT = 1.36, 2.04, 5.93


def model_base(enamel, zinc):
    """The bolted plate and the fluted cast base, up to where the pole begins."""
    plate = build.cylinder('plate', radius=0.25, depth=0.03, segments=24, on_ground=True)
    modify.bevel(plate, width=0.006, segments=1)
    body = build.lathe('base', [(0.205, 0.03), (0.21, 0.055), (0.188, 0.085), (0.178, 0.13),
                                (0.176, 0.18), (0.172, 0.40), (0.172, 0.44), (0.184, 0.47),
                                (0.140, 0.53), (0.106, 0.63), (0.096, 0.70), (0.104, 0.715),
                                (0.104, 0.74), (0.088, 0.76)], segments=24)

    def flute(point):
        # Six shallow flutes between 0.13 m and 0.44 m, fading out at both ends.
        if 0.13 < point.z < 0.44:
            angle = math.atan2(point.y, point.x)
            depth = 0.13 * (0.5 + 0.5 * math.cos(6.0 * angle))
            point.x *= 1.0 - depth
            point.y *= 1.0 - depth
        return point

    modify.map_vertices(body, flute)
    hatch = build.box('hatch', (0.10, 0.014, 0.17), location=(0.0, -0.166, 0.21), on_ground=True)
    modify.bevel(hatch, width=0.004, segments=1)
    for part in (plate, body, hatch):
        part.data.materials.append(enamel)

    bolts = []
    for index in range(4):
        angle = math.radians(45 + 90 * index)
        x, y = 0.218 * math.cos(angle), 0.218 * math.sin(angle)
        nut = build.cylinder(f'nut{index}', radius=0.017, depth=0.016, segments=6,
                             location=(x, y, 0.03), on_ground=True)
        stud = build.cylinder(f'stud{index}', radius=0.008, depth=0.03, segments=6,
                              location=(x, y, 0.03), on_ground=True)
        bolts += [nut, stud]
    bolts = scene.join(bolts)
    bolts.data.materials.append(zinc)
    return [plate, body, hatch, bolts]


def model_pole(enamel):
    """The tapered shaft with its cap and the two moulded collars."""
    # Rings every 1.2 m: a face is the smallest thing the UV packer can cut, and a 5 m strip
    # in one piece would dictate the texel density of the whole atlas.
    shaft = build.lathe('shaft', [(profiles.lerp(0.086, 0.056, step / 4),
                                   profiles.lerp(0.75, 5.56, step / 4)) for step in range(5)],
                        segments=12)
    cap = build.lathe('cap', [(0.056, 5.55), (0.071, 5.565), (0.071, 5.595), (0.058, 5.61),
                              (0.050, 5.66), (0.032, 5.72), (0.0, 5.75)], segments=12)
    collar = build.lathe('collar', [(0.062, 5.20), (0.074, 5.215), (0.074, 5.25), (0.062, 5.265)],
                         segments=12)
    band = build.lathe('band', [(0.079, 2.02), (0.086, 2.03), (0.086, 2.07), (0.079, 2.08)],
                       segments=12)
    for part in (shaft, cap, collar, band):
        part.data.materials.append(enamel)
    return [shaft, cap, collar, band]


def model_arm(enamel):
    """The swept arm that carries the head, and the scroll that braces it against the pole."""
    arm_path = profiles.smooth_path(
        [(0.0, 0.03, 5.29), (0.0, 0.22, 5.50), (0.0, 0.50, 5.72), (0.0, 0.84, 5.87),
         (0.0, 1.16, 5.935), (0.0, 1.42, HEAD_HEIGHT)], subdivisions=3)
    radii = [profiles.lerp(0.034, 0.026, index / (len(arm_path) - 1)) for index in range(len(arm_path))]
    arm = build.tube('arm', arm_path, radii=radii, segments=8, up=(1.0, 0.0, 0.0))
    scroll_path = profiles.smooth_path(
        [(0.0, 0.185, 5.085), (0.0, 0.21, 5.06), (0.0, 0.195, 5.03), (0.0, 0.16, 5.035),
         (0.0, 0.135, 5.08), (0.0, 0.15, 5.15), (0.0, 0.22, 5.23), (0.0, 0.34, 5.40),
         (0.0, 0.47, 5.61), (0.0, 0.56, 5.735)], subdivisions=2)
    scroll = build.tube('scroll', scroll_path, radius=0.011, segments=6, up=(1.0, 0.0, 0.0))
    tie = build.box('tie', (0.02, 0.09, 0.02), location=(0.0, 0.10, 5.07))
    for part in (arm, scroll, tie):
        part.data.materials.append(enamel)
    return [arm, scroll, tie]


def model_head(enamel, lens, plastic):
    """The shell-shaped housing, its domed diffuser and the photocell on its back."""
    stations = [(0.0, 0.030, 0.030, 0.026), (0.07, 0.066, 0.046, 0.030), (0.2, 0.108, 0.060, 0.032),
                (0.4, 0.135, 0.068, 0.034), (0.62, 0.130, 0.062, 0.034), (0.82, 0.100, 0.046, 0.030),
                (0.94, 0.056, 0.028, 0.022), (1.0, 0.012, 0.008, 0.008)]
    sections = []
    for along, half_width, top, bottom in stations:
        y = profiles.lerp(HEAD_START, HEAD_END, along)
        ring = []
        for step in range(12):
            angle = math.tau * step / 12
            up = math.cos(angle)
            ring.append((half_width * math.sin(angle), y,
                         HEAD_HEIGHT + up * (top if up > 0 else bottom)))
        sections.append(ring)
    shell = build.loft('shell', sections, cap_start=True, cap_end=True)
    shell.data.materials.append(enamel)

    diffuser = build.lathe('diffuser', [(0.0, -0.030), (0.05, -0.026), (0.085, -0.014), (0.1, 0.0)],
                           segments=14)
    modify.transform(diffuser, location=(0.0, 1.72, HEAD_HEIGHT - 0.031), scale=(1.0, 2.0, 1.0))
    diffuser.data.materials.append(lens)

    cell = build.cylinder('cell', radius=0.024, depth=0.045, segments=8,
                          location=(0.0, 1.56, HEAD_HEIGHT + 0.052), on_ground=True)
    cell.data.materials.append(plastic)
    return [shell, diffuser, cell]


def model_plate(sign, enamel, zinc):
    """The enamel number plate strapped to the pole at eye level, with its coloured header."""
    plate = build.box('number', (0.13, 0.008, 0.17), location=(0.0, 0.094, 1.80))
    modify.bevel(plate, width=0.003, segments=1)
    plate.data.materials.append(sign)
    header = build.box('header', (0.118, 0.004, 0.036), location=(0.0, 0.099, 1.858))
    header.data.materials.append(enamel)
    straps = []
    for height in (1.75, 1.85):
        strap = build.lathe(f'strap{height}', [(0.0815, height - 0.009), (0.0835, height - 0.009),
                                                (0.0835, height + 0.009), (0.0815, height + 0.009)],
                            segments=12)
        straps.append(strap)
    straps = scene.join(straps)
    straps.data.materials.append(zinc)
    return [plate, header, straps]


def make(a):
    teal = M.hex_color('#1c6a6e')
    enamel = M.painted_metal(color=teal, gloss=0.55, chips=0.4, rust=0.35, grime=0.5, dust=0.3,
                             fade=0.4, seed=11, name='pole_enamel')
    foot = M.painted_metal(color=teal, gloss=0.45, chips=0.6, rust=0.55, grime=0.65, dust=0.3,
                           fade=0.3, splash=0.6, seed=12, name='base_enamel')
    zinc = M.galvanized(spangle=0.5, rust=0.5, seed=4, name='bolt_zinc')
    lens = M.lamp(color=LAMP_COLOR, strength=6.0, name='lamp_main')
    plastic = M.plastic(color=(0.03, 0.03, 0.032), seed=2, name='cell_plastic')
    sign = M.enamel_sign(color=M.hex_color('#e9e2cf'), chips=0.04, rust=0.25, seed=7,
                         name='plate_enamel')

    parts = (model_base(foot, zinc) + model_pole(enamel) + model_arm(enamel)
             + model_head(enamel, lens, plastic) + model_plate(sign, enamel, zinc))
    lamp = scene.join(parts, 'lod0')
    shading.smooth(lamp, angle=math.radians(38))
    a.add(lamp)

    a.add_anchor('anchor_light', (0.0, 1.72, HEAD_HEIGHT - 0.07), forward=(0.0, 0.0, -1.0),
                 up=(0.0, 1.0, 0.0), light='spot', color=list(LAMP_COLOR), range=18.0,
                 cone=1.25)
    a.collider_cylinder('pole', (0.0, 0.0, 2.8), radius=0.2, height=5.6)
    a.auto_lods(ratios=(0.35,), distances=(35.0,))
    a.bake(size=1024, orm_size=512, bevel_radius=0.004, occlusion_distance=0.5)
