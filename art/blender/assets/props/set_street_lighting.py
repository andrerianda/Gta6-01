"""Street lighting set: the lamps of MARAZUL's districts and its utility pole, in one file.

Six objects, original designs at real size, all sharing one atlas (see _setkit.py for how a set
is laid out and named):

    lamp_arm        the 6 m avenue lamp: tapered teal pole on a fluted cast base, a swept arm
                    carried by a wrought scroll, a shell-shaped head with a domed diffuser
    lamp_avenue     a 10.4 m galvanised mast on a concrete footing with two upswept arms and
                    flat finned LED heads, one over each carriageway
    lamp_promenade  a 4.3 m cream cast-iron column for the beachfront: fluted base and shaft,
                    a ladder bar, an acorn globe in a four-rib cage under a spiked crown
    lamp_park       a 3.7 m dark green post-top lamp for parks and squares: opal drum under a
                    wide conical hat
    lamp_wall       a gooseneck wall lamp for alleys: enamel dish shade on a bent conduit arm,
                    modelled 3 m up a wall that stands on Y = 0 (anchor_mount is its fixing)
    utility_pole    a 10.8 m creosoted timber pole: cross-arm with braces and three pin
                    insulators, a transformer can on hangers with its fused cut-out and
                    jumpers, a secondary rack, a street-light arm with a cobra head, a riser
                    pipe, a hazard band and a number tag

Every lamp has a lamp_main lens and an anchor_light where its light comes from, pointing along
the beam; the pole also has anchor_wire_1..3 on its insulators (the game strings the wires
between poles, which run along X). Fronts face +Y: arms reach over the road in front.

The budget is raised because this is six objects in one file: about 6,700 triangles at level 0
and 400 kB, against 2,500 and 220 kB for a single prop.
"""
import math

from lib import build, modify, profiles, shading
from lib import materials as M

import _finishes as F
import _shapes as S
from _setkit import SetKit

ASSET = {
    'id': 'set_street_lighting',
    'kind': 'prop',
    'atlas': 2048,
    'budget': {'triangles': 7500, 'draws': 16, 'bytes': 480000},
}

LAMP_COLOR = (1.0, 0.84, 0.60)
LIGHT = {'light': 'spot', 'color': list(LAMP_COLOR)}


def palette():
    """The materials of the set, by short name."""
    return {
        'teal': M.painted_metal(color=M.hex_color('#1c6a6e'), gloss=0.55, chips=0.45, rust=0.4,
                                grime=0.55, dust=0.3, fade=0.4, splash=0.6, seed=11,
                                name='teal_enamel'),
        'cream': M.painted_metal(color=M.hex_color('#e3dcc6'), gloss=0.5, chips=0.4, rust=0.5,
                                 grime=0.6, dust=0.25, fade=0.3, splash=0.7, seed=31,
                                 name='cream_enamel'),
        'green': M.painted_metal(color=M.hex_color('#1f4a36'), gloss=0.5, chips=0.4, rust=0.35,
                                 grime=0.5, dust=0.35, fade=0.45, splash=0.6, seed=41,
                                 name='green_enamel'),
        'graphite': F.enamel('graphite_enamel', M.hex_color('#3b3f43'), seed=51, wear_amount=0.3),
        'grey': F.enamel('transformer_enamel', M.hex_color('#8b9396'), seed=52, wear_amount=0.55),
        'white': M.enamel_sign(color=M.hex_color('#e9e6dc'), chips=0.1, rust=0.2, seed=53,
                               name='reflector_enamel'),
        'sign': M.enamel_sign(color=M.hex_color('#e9e2cf'), chips=0.06, rust=0.25, seed=7,
                              name='plate_enamel'),
        'galv': M.galvanized(spangle=0.5, rust=0.25, seed=4, name='pole_zinc'),
        'zinc': M.galvanized(spangle=0.4, rust=0.5, seed=5, name='bolt_zinc'),
        'concrete': M.concrete(stains=0.6, cracks=0.3, seed=6, name='footing_concrete'),
        'wood': M.wood(color=(0.150, 0.095, 0.060), weathered=0.6, grain_axis='Z', seed=61,
                       name='pole_timber'),
        'arm_wood': M.wood(color=(0.20, 0.13, 0.08), weathered=0.7, grain_axis='Y', seed=62,
                           name='arm_timber'),
        'ceramic': F.glazed('insulator_glaze', (0.20, 0.085, 0.045), seed=63),
        'cable': M.rubber(dust=0.3, seed=64, name='cable_rubber'),
        'hazard': F.coated('hazard_band', F.striped((0.80, 0.56, 0.04), (0.02, 0.02, 0.022), 0.16,
                                                    axes='Z'), seed=65, chips=0.5, rust=0.2,
                           grime=0.5, fade=0.4),
        'plastic': M.plastic(color=(0.03, 0.03, 0.032), seed=2, name='cell_plastic'),
        'lens': M.lamp(color=LAMP_COLOR, strength=6.0, name='lamp_main'),
    }


def shell(stations, y0, y1, height, mat, ring=10):
    """A luminaire housing lofted along Y: stations are (along 0..1, half width, top, bottom)."""
    sections = []
    for along, half_width, top, bottom in stations:
        y = profiles.lerp(y0, y1, along)
        points = []
        for step in range(ring):
            angle = math.tau * step / ring
            up = math.cos(angle)
            points.append((half_width * math.sin(angle), y, height + up * (top if up > 0 else bottom)))
        sections.append(points)
    return S.done(build.loft('part', sections, cap_start=True, cap_end=True), mat)


def fluted(obj, flutes, low, high, depth):
    """Presses shallow flutes into a turned part between two heights."""
    def press(point):
        if low < point.z < high:
            angle = math.atan2(point.y, point.x)
            factor = 1.0 - depth * (0.5 + 0.5 * math.cos(flutes * angle))
            point.x *= factor
            point.y *= factor
        return point
    return modify.map_vertices(obj, press)


def lamp_arm(k, m):
    """The avenue lamp: the pipeline's first street lamp, refined and made lighter."""
    head = 5.93
    plate = S.cyl(0.25, 0.03, mat=m['teal'], seg=16, ground=True, caps=(False, True))
    studs = S.nuts(S.ring_points(0.218, 4, z=0.03, start=math.pi / 4), m['zinc'], radius=0.017,
                   height=0.02)
    base = fluted(S.lathe([(0.205, 0.03), (0.21, 0.055), (0.188, 0.085), (0.178, 0.13),
                           (0.176, 0.18), (0.172, 0.40), (0.172, 0.44), (0.184, 0.47),
                           (0.140, 0.53), (0.100, 0.66), (0.104, 0.715), (0.104, 0.74),
                           (0.088, 0.76)], m['teal'], seg=18), 6, 0.13, 0.44, 0.13)
    hatch = S.box((0.10, 0.014, 0.17), at=(0.0, -0.166, 0.295), mat=m['teal'], skip=1)
    shaft = S.pole(0.086, 0.056, 0.75, 5.56, m['teal'], seg=12, step=1.25)
    cap = S.lathe([(0.056, 5.55), (0.071, 5.565), (0.071, 5.595), (0.058, 5.61), (0.050, 5.66),
                   (0.032, 5.72), (0.0, 5.75)], m['teal'], seg=10)
    collar = S.lathe([(0.062, 5.20), (0.074, 5.215), (0.074, 5.25), (0.062, 5.265)], m['teal'],
                     seg=10, skip=1)
    band = S.lathe([(0.079, 2.02), (0.086, 2.03), (0.086, 2.07), (0.079, 2.08)], m['teal'],
                   seg=10, skip=1)

    arm_path = profiles.smooth_path(
        [(0.0, 0.03, 5.29), (0.0, 0.22, 5.50), (0.0, 0.50, 5.72), (0.0, 0.84, 5.87),
         (0.0, 1.16, 5.935), (0.0, 1.42, head)], subdivisions=2)
    radii = [profiles.lerp(0.034, 0.026, index / (len(arm_path) - 1)) for index in range(len(arm_path))]
    arm = S.pipe(arm_path, 0.03, m['teal'], seg=8, radii=radii, up=(1.0, 0.0, 0.0))
    scroll = S.pipe([(0.0, 0.185, 5.085), (0.0, 0.21, 5.06), (0.0, 0.195, 5.03), (0.0, 0.16, 5.035),
                     (0.0, 0.135, 5.08), (0.0, 0.15, 5.15), (0.0, 0.22, 5.23), (0.0, 0.34, 5.40),
                     (0.0, 0.47, 5.61), (0.0, 0.56, 5.735)], 0.011, m['teal'], seg=5, smooth=2,
                    caps=True, skip=1, up=(1.0, 0.0, 0.0))
    tie = S.box((0.02, 0.09, 0.02), at=(0.0, 0.10, 5.07), mat=m['teal'], skip=1)

    housing = shell([(0.0, 0.030, 0.030, 0.026), (0.07, 0.066, 0.046, 0.030),
                     (0.2, 0.108, 0.060, 0.032), (0.4, 0.135, 0.068, 0.034),
                     (0.62, 0.130, 0.062, 0.034), (0.82, 0.100, 0.046, 0.030),
                     (0.94, 0.056, 0.028, 0.022), (1.0, 0.012, 0.008, 0.008)],
                    1.36, 2.04, head, m['teal'])
    diffuser = S.move(S.lathe([(0.0, -0.030), (0.05, -0.026), (0.085, -0.014), (0.1, 0.0)],
                              m['lens'], seg=10), at=(0.0, 1.72, head - 0.031), scale=(1.0, 2.0, 1.0))
    cell = S.cyl(0.024, 0.045, at=(0.0, 1.56, head + 0.052), mat=m['plastic'], seg=8, ground=True,
                 skip=1)

    number = S.box((0.13, 0.008, 0.17), at=(0.0, 0.089, 1.80), mat=m['sign'], skip=1)
    header = S.box((0.118, 0.004, 0.036), at=(0.0, 0.094, 1.858), mat=m['teal'], skip=1)
    straps = S.join([S.cyl(0.0825, 0.018, at=(0.0, 0.0, z), seg=10, caps=(False, False))
                     for z in (1.75, 1.85)])
    S.done(straps, m['zinc'], skip=1)

    lamp = k.object('lamp_arm', [plate, studs, base, hatch, shaft, cap, collar, band, arm, scroll,
                                 tie, housing, diffuser, cell, number, header, straps],
                    cls='fixed', lods=(0.3, 0.06), distances=(28.0, 80.0), smooth=38.0)
    lamp.anchor('light', (0.0, 1.72, head - 0.07), forward=(0.0, 0.0, -1.0), up=(0.0, 1.0, 0.0),
                range=18.0, cone=1.25, **LIGHT)
    lamp.cyl('pole', (0.0, 0.0, 2.8), radius=0.2, height=5.6)


def led_head(m, y0, z):
    """A flat LED luminaire reaching from y0 towards +Y: housing, cooling fins and lens."""
    housing = shell([(0.0, 0.034, 0.034, 0.030), (0.10, 0.060, 0.040, 0.034),
                     (0.22, 0.150, 0.046, 0.036), (0.60, 0.158, 0.044, 0.036),
                     (0.92, 0.140, 0.034, 0.030), (1.0, 0.100, 0.014, 0.014)],
                    y0, y0 + 0.80, z, m['graphite'], ring=8)
    fins = S.join([S.box((0.22, 0.012, 0.022), at=(0.0, y0 + 0.24 + 0.065 * index, z + 0.05))
                   for index in range(6)])
    S.done(fins, m['graphite'], skip=1)
    lens = S.move(S.slab(0.23, 0.44, mat=m['lens']), rot=(math.pi, 0.0, 0.0),
                  at=(0.0, y0 + 0.44, z - 0.037))
    return [housing, fins, lens]


def lamp_avenue(k, m):
    """The tall double-arm mast for wide avenues and the freeway approaches."""
    footing = S.cyl(0.34, 0.10, mat=m['concrete'], seg=14, ground=True, caps=(False, True))
    plate = S.box((0.44, 0.44, 0.03), at=(0.0, 0.0, 0.10), mat=m['galv'], ground=True)
    studs = S.nuts([(sx * 0.17, sy * 0.17, 0.13) for sx in (-1, 1) for sy in (-1, 1)], m['zinc'],
                   radius=0.024, height=0.032)
    collar = S.lathe([(0.150, 0.13), (0.150, 0.16), (0.128, 0.20), (0.118, 0.32)], m['galv'], seg=12)
    shaft = S.pole(0.118, 0.062, 0.32, 9.70, m['galv'], seg=12, step=1.35)
    door = S.box((0.11, 0.012, 0.32), at=(0.0, -0.113, 0.86), mat=m['galv'], skip=1)
    joint = S.lathe([(0.091, 4.97), (0.097, 4.985), (0.097, 5.05), (0.090, 5.065)], m['galv'],
                    seg=12, skip=1)
    hub = S.lathe([(0.064, 9.62), (0.082, 9.66), (0.082, 9.92), (0.066, 9.96), (0.048, 10.02),
                   (0.0, 10.06)], m['galv'], seg=10)

    arm_path = profiles.smooth_path([(0.0, 0.06, 9.78), (0.0, 0.50, 9.96), (0.0, 1.10, 10.17),
                                     (0.0, 1.70, 10.31), (0.0, 2.12, 10.36)], subdivisions=2)
    radii = [profiles.lerp(0.040, 0.031, index / (len(arm_path) - 1)) for index in range(len(arm_path))]
    arm = S.pipe(arm_path, 0.035, m['galv'], seg=8, radii=radii, up=(1.0, 0.0, 0.0))
    strut = S.rod((0.0, 0.07, 9.40), (0.0, 0.92, 10.08), 0.013, m['galv'], seg=5, skip=1)
    side = S.join([arm, strut, *led_head(m, 2.06, 10.375)])
    both = S.mirrored(side, axis='Y')
    cell = S.cyl(0.026, 0.05, at=(0.0, 2.36, 10.42), mat=m['plastic'], seg=8, ground=True, skip=1)

    lamp = k.object('lamp_avenue', [footing, plate, studs, collar, shaft, door, joint, hub, both, cell],
                    cls='fixed', lods=(0.3, 0.07), distances=(32.0, 95.0), smooth=38.0)
    for index, side_y in enumerate((1.0, -1.0), start=1):
        lamp.anchor(f'light_{index}', (0.0, 2.50 * side_y, 10.33), forward=(0.0, 0.0, -1.0),
                    up=(0.0, side_y, 0.0), range=26.0, cone=1.3, **LIGHT)
    lamp.cyl('pole', (0.0, 0.0, 5.0), radius=0.22, height=10.0)


def lamp_promenade(k, m):
    """The beachfront column with its caged acorn globe."""
    plinth = S.box((0.44, 0.44, 0.06), mat=m['cream'], ground=True, bevel=0.012)
    studs = S.nuts([(sx * 0.17, sy * 0.17, 0.06) for sx in (-1, 1) for sy in (-1, 1)], m['zinc'],
                   radius=0.018, height=0.02)
    base = fluted(S.lathe([(0.170, 0.06), (0.176, 0.10), (0.150, 0.13), (0.140, 0.20),
                           (0.135, 0.50), (0.146, 0.54), (0.120, 0.60), (0.085, 0.74),
                           (0.074, 0.86), (0.086, 0.89), (0.086, 0.93), (0.068, 0.96)],
                          m['cream'], seg=20), 10, 0.13, 0.54, 0.12)
    shaft = fluted(S.pole(0.068, 0.052, 0.96, 3.30, m['cream'], seg=16, step=0.8), 8, 0.97, 3.29, 0.10)
    collar = S.lathe([(0.060, 2.16), (0.074, 2.18), (0.074, 2.22), (0.058, 2.24)], m['cream'],
                     seg=12, skip=2)
    bar = S.rod((-0.29, 0.0, 3.12), (0.29, 0.0, 3.12), 0.014, m['cream'], seg=6, caps=True, skip=2)
    knobs = S.join([S.sphere(0.03, at=(side * 0.30, 0.0, 3.12), seg=6, rings=4) for side in (-1, 1)])
    S.done(knobs, m['cream'], skip=1)
    capital = S.lathe([(0.052, 3.30), (0.070, 3.33), (0.075, 3.38), (0.055, 3.42), (0.060, 3.46),
                       (0.110, 3.50), (0.132, 3.56), (0.132, 3.585)], m['cream'], seg=12)
    globe = S.lathe([(0.100, 3.585), (0.172, 3.64), (0.212, 3.74), (0.212, 3.82), (0.172, 3.93),
                     (0.100, 4.00)], m['lens'], seg=14)
    crown = S.lathe([(0.106, 3.995), (0.122, 4.01), (0.116, 4.04), (0.070, 4.08), (0.030, 4.11),
                     (0.022, 4.16), (0.036, 4.19), (0.022, 4.22), (0.0, 4.28)], m['cream'], seg=10)
    rib = S.pipe([(0.132, 0.0, 3.585), (0.228, 0.0, 3.78), (0.110, 0.0, 4.0)], 0.007, m['cream'],
                 seg=4, smooth=3, skip=1, up=(0.0, 1.0, 0.0))
    modify.radial_array(rib, 4, axis='Z')
    S.move(rib, rot=(0.0, 0.0, math.pi / 4))

    lamp = k.object('lamp_promenade', [plinth, studs, base, shaft, collar, bar, knobs, capital,
                                       globe, crown, rib],
                    cls='knockable', mass=140.0, lods=(0.3, 0.07), distances=(25.0, 70.0),
                    smooth=38.0)
    lamp.anchor('light', (0.0, 0.0, 3.78), forward=(0.0, 0.0, -1.0), up=(0.0, 1.0, 0.0),
                range=13.0, light='point', color=list(LAMP_COLOR))
    lamp.cyl('pole', (0.0, 0.0, 2.1), radius=0.17, height=4.2)


def lamp_park(k, m):
    """The short post-top lamp of parks, squares and housing courts."""
    plate = S.cyl(0.16, 0.02, mat=m['green'], seg=12, ground=True, caps=(False, True))
    studs = S.nuts(S.ring_points(0.128, 3, z=0.02, start=math.pi / 2), m['zinc'], radius=0.015,
                   height=0.018)
    sleeve = S.lathe([(0.095, 0.02), (0.095, 0.05), (0.075, 0.09), (0.068, 0.42), (0.074, 0.44),
                      (0.074, 0.47), (0.058, 0.49)], m['green'], seg=12)
    shaft = S.pole(0.058, 0.046, 0.49, 3.02, m['green'], seg=10, step=1.3)
    neck = S.lathe([(0.046, 3.00), (0.062, 3.03), (0.062, 3.07), (0.050, 3.10), (0.050, 3.14),
                    (0.150, 3.19), (0.166, 3.20), (0.166, 3.215)], m['green'], seg=12)
    drum = S.lathe([(0.150, 3.215), (0.166, 3.33), (0.172, 3.435)], m['lens'], seg=12)
    ribs = S.box((0.012, 0.016, 0.225), at=(0.178, 0.0, 3.325), mat=m['green'], skip=1)
    modify.radial_array(ribs, 4, axis='Z')
    under = S.lathe([(0.172, 3.428), (0.300, 3.434)], m['white'], seg=14)
    hat = S.lathe([(0.300, 3.434), (0.306, 3.448), (0.220, 3.505), (0.080, 3.565), (0.030, 3.59),
                   (0.030, 3.615), (0.046, 3.63), (0.0, 3.67)], m['green'], seg=14)
    tag = S.box((0.07, 0.006, 0.05), at=(0.0, 0.060, 1.62), mat=m['sign'], skip=1)

    lamp = k.object('lamp_park', [plate, studs, sleeve, shaft, neck, drum, ribs, under, hat, tag],
                    cls='knockable', mass=58.0, lods=(0.3, 0.08), distances=(22.0, 60.0), smooth=38.0)
    lamp.anchor('light', (0.0, 0.0, 3.30), forward=(0.0, 0.0, -1.0), up=(0.0, 1.0, 0.0),
                range=11.0, light='point', color=list(LAMP_COLOR))
    lamp.cyl('pole', (0.0, 0.0, 1.8), radius=0.11, height=3.6)


def lamp_wall(k, m):
    """The alley lamp: a dish shade on a gooseneck, fixed 3 m up a wall on the plane Y = 0."""
    z = 3.0
    box = S.box((0.12, 0.045, 0.12), at=(0.0, 0.0225, z), mat=m['galv'])
    rose = S.cyl(0.05, 0.02, at=(0.0, 0.055, z), mat=m['green'], seg=10, axis='Y', caps=(False, True))
    screws = S.nuts([(sx * 0.045, 0.045, z + sz * 0.045) for sx in (-1, 1) for sz in (-1, 1)],
                    m['zinc'], radius=0.007, height=0.006, axis='Y')
    arm = S.pipe([(0.0, 0.06, z), (0.0, 0.14, z + 0.02), (0.0, 0.28, z + 0.17), (0.0, 0.42, z + 0.27),
                  (0.0, 0.53, z + 0.25), (0.0, 0.56, z + 0.16)], 0.014, m['green'], seg=6, smooth=2,
                 up=(1.0, 0.0, 0.0))
    fitter = S.cyl(0.032, 0.06, at=(0.0, 0.56, z + 0.135), mat=m['green'], seg=10)
    shade = S.lathe([(0.032, z + 0.11), (0.060, z + 0.095), (0.150, z + 0.045), (0.212, z - 0.005),
                     (0.220, z - 0.02)], m['green'], seg=14, at=(0.0, 0.56, 0.0))
    inside = S.lathe([(0.040, z + 0.085), (0.148, z + 0.032), (0.214, z - 0.018)], m['white'], seg=14,
                     at=(0.0, 0.56, 0.0))
    shading.flip(inside)
    bulb = S.lathe([(0.0, z - 0.035), (0.040, z - 0.02), (0.050, z + 0.02), (0.036, z + 0.07)],
                   m['lens'], seg=8, at=(0.0, 0.56, 0.0))

    lamp = k.object('lamp_wall', [box, rose, screws, arm, fitter, shade, inside, bulb],
                    cls='fixed', lods=(0.35, 0.1), distances=(18.0, 50.0), smooth=38.0)
    lamp.anchor('light', (0.0, 0.56, z - 0.02), forward=(0.0, 0.0, -1.0), up=(0.0, 1.0, 0.0),
                range=10.0, cone=1.2, **LIGHT)
    lamp.anchor('mount', (0.0, 0.0, z), forward=(0.0, -1.0, 0.0))
    lamp.box('shade', (0.0, 0.33, z + 0.1), (0.46, 0.66, 0.4))


def insulator(m, at):
    """A pin insulator: steel pin and ribbed glazed bell, its foot on `at`."""
    x, y, z = at
    pin = S.cyl(0.011, 0.09, at=at, mat=m['zinc'], seg=5, ground=True, caps=(False, False), skip=1)
    bell = S.lathe([(0.034, z + 0.06), (0.060, z + 0.09), (0.060, z + 0.115), (0.038, z + 0.135),
                    (0.055, z + 0.16), (0.030, z + 0.20), (0.0, z + 0.215)], m['ceramic'], seg=8,
                   at=(x, y, 0.0))
    return [pin, bell]


def utility_pole(k, m):
    """The timber pole that carries the neighbourhood's power, a transformer and a street light."""
    shaft = S.pole(0.165, 0.105, 0.0, 10.6, m['wood'], seg=10, step=1.35)
    top = S.lathe([(0.105, 10.6), (0.088, 10.635), (0.0, 10.645)], m['wood'], seg=10)
    band = S.cyl(0.162, 0.48, at=(0.0, 0.0, 1.24), mat=m['hazard'], seg=10, caps=(False, False))
    tag = S.box((0.09, 0.006, 0.12), at=(0.0, 0.158, 1.78), mat=m['sign'], skip=1)
    riser = S.rod((-0.186, 0.0, 0.0), (-0.170, 0.0, 3.2), 0.021, m['galv'], seg=5, caps=True, skip=2)
    clips = S.join([S.box((0.07, 0.03, 0.025), at=(-0.172, 0.0, z)) for z in (0.5, 1.7, 2.9)])
    S.done(clips, m['zinc'], skip=1)

    arm_z = 10.05
    arm = S.box((0.095, 2.5, 0.12), at=(0.158, 0.0, arm_z), mat=m['arm_wood'])
    braces = S.join([S.beam((0.207, side * 0.72, arm_z - 0.03), (0.125, side * 0.02, 9.32), 0.038,
                            0.007, up=(1.0, 0.0, 0.0)) for side in (-1, 1)])
    S.done(braces, m['zinc'], skip=2)
    bolts = S.nuts([(0.21, 0.0, arm_z), (0.21, -0.72, arm_z - 0.03), (0.21, 0.72, arm_z - 0.03)],
                   m['zinc'], radius=0.016, height=0.014, axis='X')
    pins = (insulator(m, (0.158, -1.1, arm_z + 0.06)) + insulator(m, (0.158, 1.1, arm_z + 0.06))
            + insulator(m, (0.0, 0.0, 10.61)))

    can_x = -0.45
    can = S.lathe([(0.0, 7.62), (0.240, 7.63), (0.250, 7.66), (0.250, 8.40), (0.262, 8.41),
                   (0.262, 8.44), (0.200, 8.47), (0.0, 8.49)], m['grey'], seg=12, at=(can_x, 0.0, 0.0))
    hangers = S.join([S.box((0.16, 0.09, 0.05), at=(-0.20, 0.0, z)) for z in (7.82, 8.30)])
    S.done(hangers, m['zinc'])
    bushings = S.join([S.lathe([(0.022, 8.46), (0.040, 8.50), (0.025, 8.53), (0.040, 8.56),
                                (0.020, 8.60), (0.0, 8.61)], seg=6, at=(can_x + 0.02, side * 0.10, 0.0))
                       for side in (-1, 1)])
    S.done(bushings, m['ceramic'], skip=1)
    label = S.box((0.004, 0.16, 0.11), at=(can_x - 0.251, 0.0, 8.05), mat=m['sign'], skip=1)
    cutout = S.rod((0.158, -0.55, arm_z - 0.07), (0.158, -0.80, 9.62), 0.026, m['ceramic'], seg=6,
                   caps=True, skip=1)
    jumpers = S.join([
        S.pipe([(0.158, -1.1, 10.30), (0.158, -0.95, 10.02), (0.158, -0.62, 9.98)], 0.007, seg=3,
               smooth=2),
        S.pipe([(0.158, -0.80, 9.62), (-0.10, -0.55, 9.05), (can_x + 0.02, -0.10, 8.61)], 0.007,
               seg=3, smooth=2),
        S.pipe([(can_x + 0.02, 0.10, 8.61), (-0.20, 0.30, 8.95), (0.0, 0.10, 10.2), (0.0, 0.0, 10.80)],
               0.007, seg=3, smooth=2)])
    S.done(jumpers, m['cable'], skip=1)

    rack = S.box((0.03, 0.02, 0.62), at=(0.0, -0.158, 7.05), mat=m['zinc'], skip=1)
    spools = S.join([S.cyl(0.036, 0.07, at=(0.0, -0.20, z), seg=6) for z in (6.84, 7.05, 7.26)])
    S.done(spools, m['ceramic'], skip=1)

    light_z = 7.30
    bracket = S.box((0.10, 0.02, 0.34), at=(0.0, 0.150, light_z - 0.08), mat=m['galv'], skip=1)
    light_arm = S.pipe([(0.0, 0.13, light_z), (0.0, 0.60, light_z + 0.22), (0.0, 1.20, light_z + 0.42),
                        (0.0, 1.86, light_z + 0.52)], 0.028, m['galv'], seg=6, smooth=2,
                       up=(1.0, 0.0, 0.0))
    stay = S.rod((0.0, 0.148, light_z - 0.36), (0.0, 0.78, light_z + 0.26), 0.012, m['galv'], seg=5,
                 skip=1)
    head_z = light_z + 0.53
    cobra = shell([(0.0, 0.040, 0.040, 0.034), (0.15, 0.085, 0.060, 0.045), (0.45, 0.140, 0.075, 0.050),
                   (0.80, 0.120, 0.055, 0.042), (1.0, 0.030, 0.012, 0.012)],
                  1.80, 2.50, head_z, m['grey'], ring=8)
    bowl = S.move(S.lathe([(0.0, -0.060), (0.060, -0.050), (0.100, -0.022), (0.110, 0.0)],
                          m['lens'], seg=8), at=(0.0, 2.20, head_z - 0.046), scale=(1.0, 1.7, 1.0))
    cell = S.cyl(0.024, 0.045, at=(0.0, 2.02, head_z + 0.06), mat=m['plastic'], seg=6, ground=True,
                 skip=1)

    pole = k.object('utility_pole', [shaft, top, band, tag, riser, clips, arm, braces, bolts, *pins,
                                     can, hangers, bushings, label, cutout, jumpers, rack, spools,
                                     bracket, light_arm, stay, cobra, bowl, cell],
                    cls='fixed', lods=(0.3, 0.07), distances=(32.0, 95.0), smooth=40.0)
    pole.anchor('wire_1', (0.158, -1.1, 10.30), forward=(1.0, 0.0, 0.0))
    pole.anchor('wire_2', (0.0, 0.0, 10.80), forward=(1.0, 0.0, 0.0))
    pole.anchor('wire_3', (0.158, 1.1, 10.30), forward=(1.0, 0.0, 0.0))
    pole.anchor('light', (0.0, 2.20, head_z - 0.10), forward=(0.0, 0.0, -1.0), up=(0.0, 1.0, 0.0),
                range=17.0, cone=1.25, **LIGHT)
    pole.cyl('pole', (0.0, 0.0, 5.3), radius=0.2, height=10.6)
    pole.box('transformer', (can_x, 0.0, 8.05), (0.54, 0.54, 0.90))


def make(a):
    m = palette()
    k = SetKit(a)
    lamp_wall(k, m)
    lamp_park(k, m)
    lamp_promenade(k, m)
    lamp_arm(k, m)
    lamp_avenue(k, m)
    utility_pole(k, m)
    k.layout()
    a.bake(size=2048, orm_size=1024, normal_size=1024, bevel_radius=0.006, occlusion_distance=0.5)


def assemble(a):
    SetKit.of(a).levels()
