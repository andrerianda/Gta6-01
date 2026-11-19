"""Traffic control set: the signals, signs and barriers of MARAZUL's streets, in one file.

Nineteen objects, original designs at real size, all sharing one atlas (see _setkit.py for how a
set is laid out and named). Lenses and sign faces look towards +Y, at the driver or walker they
address; for right-hand traffic a mast arm therefore reaches to the object's right, +X.

    traffic_signal_mast   a 6.8 m galvanised mast on a bolted plate with a 7.4 m tapered arm:
                          two three-lens heads with backplates over the lanes, a third on
                          brackets on the post
    traffic_signal_post   a three-lens head on a 3 m pedestal with an eight-sided cast base
    pedestrian_signal     a two-lens head (stop above, walk below) with hoods on a slim post,
                          and a push button with its blank instruction plate on the back
    sign_octagon, sign_triangle, sign_round, sign_rectangle, sign_diamond
                          blank enamel sign faces in the common shapes on square steel posts:
                          red octagon, red-bordered triangle and disc, black-edged white
                          panel, yellow diamond. The game paints what they say on anchor_sign
    street_name_post      a pipe post with two crossed green blades (anchor_sign_1, _2)
    bollard_steel         a yellow pipe bollard on a bolted flange with a reflective band
    bollard_concrete      a turned concrete bollard with a shadow groove
    jersey_barrier        a 3 m concrete safety barrier of the usual sloped section
    traffic_cone          a 0.71 m cone with a reflective collar on a rubber foot
    traffic_barrel        a tiered orange drum with reflective bands, a handle and a tyre base
    water_barrier         a 1.8 m water-filled plastic barrier with interlocking knuckles
    work_barricade        a folding barricade: striped boards on A-frame legs, a flashing lamp
    guard_rail            a 4 m W-beam rail on two posts with blockouts (posts every 2 m)
    parking_meter         a single-space meter: domed coin head, blank display, pipe post
    sign_gantry           the 16 m freeway truss on two pipe posts with two blank 4.8 x 2.6 m
                          panels (anchor_sign_1, _2)

Lamp roles: lamp_red, lamp_amber, lamp_green on the vehicle heads; lamp_stop and lamp_walk on
the pedestrian head; lamp_warn on the barricade. Every sign anchor carries width, height and
shape.

The budget is raised because this is nineteen objects in one file: about 8,300 triangles at
level 0, one draw call per object and lamp role when all of them are drawn at once (28), and
about 0.7 MB, mostly the geometry of nineteen objects at three levels each.
"""
import math

from lib import build, modify, profiles, scene, shading
from lib import materials as M

import _finishes as F
import _shapes as S
from _setkit import SetKit

ASSET = {
    'id': 'set_traffic_control',
    'kind': 'prop',
    'atlas': 1024,
    'budget': {'triangles': 8600, 'draws': 32, 'bytes': 720000},
}

ORANGE = (0.80, 0.19, 0.03)
WHITE = (0.80, 0.80, 0.77)


def banded(spans):
    """Orange plastic with white reflective bands between the given heights."""
    def pattern(graph):
        mask = None
        for low, high in spans:
            band = F.between(graph, graph.axis('Z'), low, high)
            mask = band if mask is None else graph.maximum(mask, band)
        return graph.mix(mask, ORANGE, WHITE)
    return pattern


def palette():
    """The materials of the set, by short name."""
    black = (0.028, 0.028, 0.03)
    return {
        'galv': M.galvanized(spangle=0.5, rust=0.3, seed=71, name='mast_zinc'),
        'zinc': M.galvanized(spangle=0.4, rust=0.5, seed=72, name='bolt_zinc'),
        'yellow': F.enamel('signal_enamel', M.hex_color('#c9a11f'), seed=73, wear_amount=0.35),
        'black': F.enamel('visor_enamel', black, seed=74, wear_amount=0.3, gloss=0.3),
        'pipe': F.enamel('bollard_enamel', M.hex_color('#cfa416'), seed=75, wear_amount=0.6,
                         splash=0.7),
        'alu': M.galvanized(spangle=0.15, rust=0.1, seed=76, name='sign_back'),
        'red': M.enamel_sign(color=M.hex_color('#a31d17'), chips=0.08, rust=0.2, seed=77,
                             name='sign_red'),
        'white': M.enamel_sign(color=M.hex_color('#e6e4dc'), chips=0.08, rust=0.25, seed=78,
                               name='sign_white'),
        'amber': M.enamel_sign(color=M.hex_color('#d9a514'), chips=0.08, rust=0.2, seed=79,
                               name='sign_yellow'),
        'green': M.enamel_sign(color=M.hex_color('#1d5b3a'), chips=0.06, rust=0.2, seed=80,
                               name='sign_green'),
        'ink': M.enamel_sign(color=black, chips=0.1, rust=0.2, seed=81, name='sign_black'),
        'concrete': M.concrete(stains=0.75, cracks=0.4, seed=82, name='barrier_concrete'),
        'rubber': M.rubber(dust=0.5, seed=83, name='foot_rubber'),
        'cone': F.moulded('cone_plastic', banded([(0.44, 0.58)]), seed=84, wear_amount=0.5,
                          splash=0.4),
        'drum': F.moulded('drum_plastic', banded([(0.40, 0.60), (0.68, 0.84)]), seed=85,
                          wear_amount=0.5, splash=0.4),
        'lamp_red': M.lamp(color=(1.0, 0.07, 0.04), strength=5.0, name='lamp_red'),
        'lamp_amber': M.lamp(color=(1.0, 0.55, 0.05), strength=5.0, name='lamp_amber'),
        'lamp_green': M.lamp(color=(0.08, 1.0, 0.55), strength=5.0, name='lamp_green'),
        'lamp_stop': M.lamp(color=(1.0, 0.33, 0.04), strength=4.0, name='lamp_stop'),
        'lamp_walk': M.lamp(color=(0.88, 0.94, 1.0), strength=4.0, name='lamp_walk'),
        'lamp_warn': M.lamp(color=(1.0, 0.50, 0.04), strength=5.0, name='lamp_warn'),
        'meter': F.enamel('meter_enamel', M.hex_color('#3d4248'), seed=86, wear_amount=0.5),
        'water': F.moulded('barrier_plastic', (0.74, 0.13, 0.04), seed=87, wear_amount=0.55,
                           splash=0.5),
        'stripes': F.moulded('barricade_board', F.striped(ORANGE, WHITE, 0.30, axes='XZ'),
                             seed=88, wear_amount=0.45, splash=0.5),
    }


def face_plate(outline, inset, at, face, border, back=None, thick=0.003):
    """A thin sign plate facing +Y, centred on `at`: a border ring and the face inside it in
    one plane (nothing overlaps, so nothing flickers far away) and, with `back`, the bare
    rear side. outline: counter-clockwise (x, z) points; inset: (scale x, scale z) of the face."""
    x0, y0, z0 = at
    count = len(outline)
    outer = [(x0 + x, y0, z0 + z) for x, z in outline]
    inner = [(x0 + x * inset[0], y0, z0 + z * inset[1]) for x, z in outline]
    ring = build.from_data('part', outer + inner,
                           [(i, count + i, count + (i + 1) % count, (i + 1) % count)
                            for i in range(count)])
    middle = build.from_data('part', inner, [tuple(reversed(range(count)))])
    parts = [S.done(ring, border, solid=True), S.done(middle, face, solid=True)]
    if back is not None:
        rear = build.from_data('part', [(x, y0 - thick, z) for x, _y, z in outer],
                               [tuple(range(count))])
        parts.append(S.done(rear, back, solid=True))
    return parts


def visor(m, at, radius=0.158, length=0.25):
    """A cut-away tunnel visor over a lens centred on `at`: longest at the top, open below."""
    hood = S.lathe([(radius, 0.0), (radius, length)], seg=8, angle=1.5 * math.pi)
    S.move(hood, rot=(0.0, 0.0, math.radians(135.0)))

    def slant(point):
        if point.z > 0.01:
            point.z = length * max(0.3, 0.6 - 0.4 * point.y / radius)
        return point

    modify.map_vertices(hood, slant)
    inside = scene.duplicate(hood)
    shading.flip(inside)
    hood = S.join([hood, inside])
    S.move(hood, rot=(-math.pi / 2, 0.0, 0.0))
    S.move(hood, at=at)
    return S.done(hood, m['black'], skip=2)


def signal_head(m, at, plate=True):
    """A three-section vehicle signal head centred on `at`, facing +Y: red over amber over
    green, each lens under its visor, and optionally a black backplate with a yellow edge."""
    x, y, z = at
    front = y + 0.10
    parts = []
    for index, role in enumerate(('lamp_green', 'lamp_amber', 'lamp_red')):
        z0 = z - 0.5175 + 0.345 * index
        parts.append(S.rbox(0.34, 0.20, 0.34, 0.035, at=(x, y, z0), mat=m['yellow']))
        lens = S.lathe([(0.145, 0.0), (0.09, 0.02), (0.0, 0.028)], m[role], seg=12)
        S.move(lens, rot=(-math.pi / 2, 0.0, 0.0))
        S.move(lens, at=(x, front, z0 + 0.17))
        rim = S.lathe([(0.160, 0.0), (0.160, 0.012), (0.146, 0.012)], m['black'], seg=12, skip=1)
        S.move(rim, rot=(-math.pi / 2, 0.0, 0.0))
        S.move(rim, at=(x, front, z0 + 0.17))
        parts += [lens, rim, visor(m, (x, front + 0.008, z0 + 0.17))]
    if plate:
        outline = profiles.rounded_rectangle(0.62, 1.36, 0.06, 2)
        parts += face_plate(outline, (0.92, 0.963), (x, y + 0.03, z), m['ink'], m['amber'],
                            back=m['ink'])
    return parts


def traffic_signal_mast(k, m):
    """The mast-arm signal of the big junctions."""
    def arm_z(x):
        return 5.85 + 0.05 * x

    footing = S.cyl(0.42, 0.05, mat=m['concrete'], seg=14, ground=True, caps=(False, True))
    plate = S.box((0.52, 0.52, 0.04), at=(0.0, 0.0, 0.05), mat=m['galv'], ground=True)
    studs = S.nuts([(sx * 0.20, sy * 0.20, 0.09) for sx in (-1, 1) for sy in (-1, 1)], m['zinc'],
                   radius=0.03, height=0.05)
    collar = S.lathe([(0.20, 0.09), (0.20, 0.11), (0.165, 0.16)], m['galv'], seg=12)
    shaft = S.pole(0.160, 0.115, 0.12, 6.72, m['galv'], seg=12, step=1.3)
    cap = S.lathe([(0.115, 6.72), (0.124, 6.73), (0.124, 6.76), (0.06, 6.80), (0.0, 6.81)],
                  m['galv'], seg=12)
    door = S.box((0.12, 0.012, 0.22), at=(0.0, -0.156, 0.60), mat=m['galv'], skip=1)

    count = 8
    path = [(profiles.lerp(0.10, 7.5, i / count), 0.0, arm_z(profiles.lerp(0.10, 7.5, i / count)))
            for i in range(count + 1)]
    radii = [profiles.lerp(0.100, 0.055, i / count) for i in range(count + 1)]
    arm = S.pipe(path, 0.08, m['galv'], seg=8, radii=radii, caps=True)
    flange = S.box((0.05, 0.30, 0.38), at=(0.165, 0.0, arm_z(0.165)), mat=m['galv'], bevel=0.006)
    flange_bolts = S.nuts([(0.19, sy * 0.12, arm_z(0.19) + sz * 0.15) for sy in (-1, 1)
                           for sz in (-1, 1)], m['zinc'], radius=0.018, height=0.02, axis='X')
    gusset = S.beam((0.13, 0.0, 5.35), (0.75, 0.0, arm_z(0.75) - 0.08), 0.012, 0.10, m['galv'],
                    up=(0.0, 1.0, 0.0), skip=1)

    heads = []
    for x in (4.4, 7.0):
        z = arm_z(x)
        heads += signal_head(m, (x, 0.24, z))
        heads.append(S.rod((x, 0.115, z - 0.56), (x, 0.115, z + 0.56), 0.022, m['galv'], seg=6,
                           caps=True, skip=2))
        heads.append(S.box((0.09, 0.19, 0.11), at=(x, 0.04, z), mat=m['galv'], skip=2))
        heads += [S.box((0.06, 0.13, 0.035), at=(x, 0.17, z + side * 0.545), mat=m['galv'], skip=2)
                  for side in (-1, 1)]
    side_z = 3.45
    heads += signal_head(m, (0.0, 0.40, side_z), plate=False)
    for side in (-1, 1):
        height = side_z + side * 0.56
        heads.append(S.pipe([(0.0, 0.10, height), (0.0, 0.40, height), (0.0, 0.40, height - side * 0.05)],
                            0.024, m['galv'], seg=6, caps=True, up=(1.0, 0.0, 0.0), skip=2))
        heads.append(S.cyl(0.165, 0.05, at=(0.0, 0.0, height), mat=m['zinc'], seg=12,
                           caps=(False, False), skip=1))

    signal = k.object('traffic_signal_mast', [footing, plate, studs, collar, shaft, cap, door, arm,
                                              flange, flange_bolts, gusset, *heads],
                      cls='fixed', lods=(0.35, 0.1), distances=(35.0, 100.0), smooth=38.0,
                      texel_scale=0.65)
    signal.cyl('pole', (0.0, 0.0, 3.4), radius=0.22, height=6.8)


def traffic_signal_post(k, m):
    """The post-top signal of smaller junctions and medians."""
    base = S.lathe([(0.20, 0.0), (0.20, 0.035), (0.155, 0.07), (0.125, 0.40), (0.080, 0.45),
                    (0.080, 0.48), (0.057, 0.50)], m['yellow'], seg=8)
    studs = S.nuts(S.ring_points(0.165, 4, z=0.035, start=math.pi / 4), m['zinc'], radius=0.016,
                   height=0.02)
    shaft = S.pole(0.057, 0.057, 0.50, 3.02, m['yellow'], seg=10, step=1.3)
    fitter = S.lathe([(0.057, 3.0), (0.075, 3.02), (0.075, 3.06), (0.05, 3.085)], m['yellow'], seg=10,
                     caps=(False, True))
    head = signal_head(m, (0.0, 0.0, 3.085 + 0.5175), plate=False)
    signal = k.object('traffic_signal_post', [base, studs, shaft, fitter, *head],
                      cls='knockable', mass=95.0, lods=(0.35, 0.1), distances=(28.0, 80.0),
                      smooth=38.0)
    signal.cyl('pole', (0.0, 0.0, 2.05), radius=0.2, height=4.1)


def pedestrian_signal(k, m):
    """The walker's signal: stop above walk, and the button to ask for it."""
    plate, studs = S.base_plate(0.13, 0.015, m['galv'], m['zinc'])
    sleeve = S.lathe([(0.078, 0.015), (0.078, 0.13), (0.057, 0.17)], m['galv'], seg=10)
    shaft = S.pole(0.057, 0.057, 0.17, 2.95, m['galv'], seg=10, step=1.3)
    cap = S.lathe([(0.057, 2.95), (0.064, 2.96), (0.064, 2.985), (0.0, 3.01)], m['galv'], seg=10)
    body = S.rbox(0.36, 0.20, 0.72, 0.035, at=(0.0, 0.19, 2.13), mat=m['yellow'])
    seam = S.box((0.365, 0.205, 0.012), at=(0.0, 0.19, 2.49), mat=m['black'], skip=1)
    brackets = S.join([S.box((0.07, 0.06, 0.045), at=(0.0, 0.075, z)) for z in (2.22, 2.76)])
    S.done(brackets, m['galv'], skip=2)
    lenses, hoods = [], []
    for z, role in ((2.175, 'lamp_walk'), (2.525, 'lamp_stop')):
        lenses.append(S.card(0.28, 0.28, at=(0.0, 0.292, z), mat=m[role]))
        hoods.append(S.box((0.33, 0.14, 0.008), at=(0.0, 0.355, z + 0.292), mat=m['black'], skip=2))
        hoods += [S.box((0.008, 0.14, 0.29), at=(side * 0.161, 0.355, z + 0.145), mat=m['black'],
                        skip=2) for side in (-1, 1)]

    button_box = S.box((0.09, 0.05, 0.14), at=(0.0, -0.08, 1.07), mat=m['yellow'], bevel=0.006)
    button = S.cyl(0.022, 0.014, at=(0.0, -0.108, 1.05), mat=m['zinc'], seg=8, axis='Y', skip=1)
    notice = S.box((0.13, 0.004, 0.18), at=(0.0, -0.060, 1.31), mat=m['white'], skip=1)

    signal = k.object('pedestrian_signal', [plate, studs, sleeve, shaft, cap, body, seam, brackets,
                                            *lenses, *hoods, button_box, button, notice],
                      cls='knockable', mass=55.0, lods=(0.4, 0.14), distances=(22.0, 60.0),
                      smooth=38.0)
    signal.anchor('use', (0.0, -0.6, 0.0), forward=(0.0, 1.0, 0.0))
    signal.cyl('pole', (0.0, 0.0, 1.5), radius=0.12, height=3.0)


def sign_post(k, m, name, shape, outline, inset, face, border, width, height, centre, mass):
    """A sign on a square steel post: the plate's centre is `centre` metres up."""
    low = min(z for _x, z in outline)
    top = centre + max(z for _x, z in outline) * 0.55
    post = S.beam((0.0, 0.0, 0.0), (0.0, 0.0, top), 0.045, 0.045, m['galv'], up=(0.0, 1.0, 0.0),
                  step=1.0)
    foot = S.box((0.07, 0.07, 0.10), mat=m['zinc'], ground=True, skip=2)
    plate = face_plate(outline, inset, (0.0, 0.028, centre), face, border, back=m['alu'])
    bolts = S.nuts([(0.0, 0.029, centre + low * 0.5), (0.0, 0.029, top - 0.05)], m['zinc'],
                   radius=0.009, height=0.006, axis='Y')
    sign = k.object(name, [post, foot, *plate, bolts], cls='knockable', mass=mass,
                    lods=(0.6, 0.45), distances=(25.0, 70.0), smooth=30.0, texel_scale=1.3)
    sign.anchor('sign', (0.0, 0.029, centre), forward=(0.0, 1.0, 0.0), width=width,
                height=height, shape=shape)
    sign.cyl('post', (0.0, 0.0, top / 2), radius=0.05, height=top)


def sign_posts(k, m):
    """The five common sign shapes; their lower edges are 2.1 m above the pavement."""
    sign_post(k, m, 'sign_octagon', 'octagon', S.regular(8, 0.406), (0.93, 0.93), m['red'],
              m['white'], 0.75, 0.75, 2.475, 16.0)
    sign_post(k, m, 'sign_triangle', 'triangle', S.regular(3, 0.52, start=-math.pi / 2),
              (0.70, 0.70), m['white'], m['red'], 0.90, 0.78, 2.62, 15.0)
    sign_post(k, m, 'sign_round', 'round', profiles.circle(0.30, 16), (0.80, 0.80), m['white'],
              m['red'], 0.60, 0.60, 2.40, 14.0)
    sign_post(k, m, 'sign_rectangle', 'rectangle', profiles.rounded_rectangle(0.60, 0.75, 0.04, 2),
              (0.94, 0.952), m['white'], m['ink'], 0.60, 0.75, 2.475, 15.0)
    sign_post(k, m, 'sign_diamond', 'diamond', S.regular(4, 0.53, start=-math.pi / 2),
              (0.93, 0.93), m['amber'], m['ink'], 0.75, 0.75, 2.63, 16.0)


def street_name_post(k, m):
    """The corner post with the names of the two streets that meet there."""
    plate, studs = S.base_plate(0.09, 0.012, m['galv'], m['zinc'])
    shaft = S.pole(0.030, 0.030, 0.012, 3.0, m['galv'], seg=8, step=1.0)
    outline = profiles.rounded_rectangle(0.90, 0.20, 0.03, 2)
    inset = (0.87 / 0.90, 0.17 / 0.20)

    def blade(z, turn):
        sides = [S.join(face_plate(outline, inset, (0.0, 0.003, z), m['green'], m['white']))
                 for _side in range(2)]
        S.move(sides[1], rot=(0.0, 0.0, math.pi))
        both = S.join(sides)
        S.move(both, rot=(0.0, 0.0, turn))
        return both

    clamps = S.join([S.box((0.05, 0.05, 0.05), at=(0.0, 0.0, 3.02)),
                     S.box((0.04, 0.04, 0.03), at=(0.0, 0.0, 3.265)),
                     S.box((0.025, 0.025, 0.02), at=(0.0, 0.0, 3.49))])
    S.done(clamps, m['zinc'], skip=2)
    post = k.object('street_name_post', [plate, studs, shaft, blade(3.15, 0.0),
                                         blade(3.38, math.pi / 2), clamps],
                    cls='knockable', mass=18.0, lods=(0.6, 0.45), distances=(25.0, 70.0),
                    smooth=30.0, texel_scale=1.3)
    post.anchor('sign_1', (0.0, 0.004, 3.15), forward=(0.0, 1.0, 0.0), width=0.90, height=0.20,
                shape='blade')
    post.anchor('sign_2', (0.004, 0.0, 3.38), forward=(1.0, 0.0, 0.0), width=0.90, height=0.20,
                shape='blade')
    post.cyl('post', (0.0, 0.0, 1.75), radius=0.05, height=3.5)


def bollards(k, m):
    """A steel pipe bollard and a turned concrete one."""
    plate, studs = S.base_plate(0.14, 0.012, m['pipe'], m['zinc'])
    pipe = S.lathe([(0.084, 0.012), (0.084, 0.55), (0.084, 1.0), (0.072, 1.045), (0.042, 1.068),
                    (0.0, 1.075)], m['pipe'], seg=12)
    tape = S.lathe([(0.0848, 0.80), (0.0848, 0.90)], m['white'], seg=12)
    steel = k.object('bollard_steel', [plate, studs, pipe, tape], cls='fixed', lods=(0.45, 0.2),
                     distances=(20.0, 55.0), smooth=40.0)
    steel.cyl('body', (0.0, 0.0, 0.54), radius=0.09, height=1.08)

    stone = S.lathe([(0.165, 0.0), (0.165, 0.05), (0.150, 0.07), (0.150, 0.40), (0.150, 0.70),
                     (0.138, 0.712), (0.138, 0.742), (0.150, 0.754), (0.150, 0.83), (0.118, 0.885),
                     (0.0, 0.90)], m['concrete'], seg=14)
    concrete = k.object('bollard_concrete', [stone], cls='fixed', lods=(0.45, 0.2),
                        distances=(20.0, 55.0), smooth=40.0)
    concrete.cyl('body', (0.0, 0.0, 0.45), radius=0.165, height=0.9)


def jersey_barrier(k, m):
    """A 3 m length of concrete safety barrier, lying along X."""
    outline = [(-0.305, 0.0), (0.305, 0.0), (0.305, 0.075), (0.125, 0.33), (0.085, 0.79),
               (0.07, 0.81), (-0.07, 0.81), (-0.085, 0.79), (-0.125, 0.33), (-0.305, 0.075)]
    body = S.extrude(outline, 3.0, mat=m['concrete'], plane='YZ', centred=True)
    reflectors = S.join([S.box((0.10, 0.012, 0.06), at=(x, 0.0, 0.84)) for x in (-0.75, 0.75)])
    S.done(reflectors, m['amber'], skip=1)
    loops = S.join([S.pipe([(side * 1.5, 0.0, z - 0.05), (side * 1.56, 0.0, z - 0.05),
                            (side * 1.56, 0.0, z + 0.05), (side * 1.5, 0.0, z + 0.05)], 0.012, seg=4,
                           up=(0.0, 1.0, 0.0)) for side in (-1, 1) for z in (0.30, 0.62)])
    S.done(loops, m['zinc'], skip=1)
    barrier = k.object('jersey_barrier', [body, reflectors, loops], cls='fixed', lods=(0.5,),
                       distances=(40.0,), smooth=30.0, texel_scale=0.6)
    barrier.box('body', (0.0, 0.0, 0.405), (3.0, 0.61, 0.81))


def cone_and_barrel(k, m):
    """The road worker's markers."""
    foot = S.rbox(0.37, 0.37, 0.035, 0.05, mat=m['rubber'])
    body = S.lathe([(0.142, 0.03), (0.136, 0.05), (0.085, 0.38), (0.034, 0.69), (0.030, 0.71)],
                   m['cone'], seg=12, caps=(False, True))
    cone = k.object('traffic_cone', [foot, body], cls='scatter', mass=3.5, lods=(0.5, 0.25),
                    distances=(15.0, 40.0), smooth=40.0)
    cone.cyl('body', (0.0, 0.0, 0.355), radius=0.17, height=0.71)

    tyre = S.lathe([(0.370, 0.0), (0.375, 0.05), (0.350, 0.10), (0.290, 0.115)], m['rubber'], seg=14)
    drum = S.lathe([(0.290, 0.09), (0.288, 0.36), (0.272, 0.375), (0.268, 0.62), (0.252, 0.635),
                    (0.246, 0.86), (0.225, 0.93), (0.0, 0.94)], m['drum'], seg=14)
    handle = S.pipe([(-0.09, 0.0, 0.93), (-0.08, 0.0, 1.0), (0.08, 0.0, 1.0), (0.09, 0.0, 0.93)],
                    0.014, m['drum'], seg=5, smooth=1, up=(0.0, 1.0, 0.0), skip=2)
    barrel = k.object('traffic_barrel', [tyre, drum, handle], cls='knockable', mass=14.0,
                      lods=(0.45, 0.2), distances=(18.0, 50.0), smooth=40.0)
    barrel.cyl('body', (0.0, 0.0, 0.5), radius=0.37, height=1.0)


def parking_meter(k, m):
    """A single-space meter: a domed coin head on a painted pipe bolted to the kerb."""
    plate, studs = S.base_plate(0.075, 0.01, m['meter'], m['zinc'])
    post = S.pole(0.032, 0.032, 0.01, 1.07, m['meter'], seg=8, step=1.1)
    saddle = S.lathe([(0.032, 1.06), (0.06, 1.08), (0.06, 1.11)], m['meter'], seg=8,
                     caps=(False, True))
    head = S.rbox(0.20, 0.16, 0.34, 0.05, at=(0.0, 0.0, 1.11), mat=m['meter'],
                  stations=[(0.0, 0.9), (0.12, 1.0), (1.0, 1.0)])
    dome = S.sphere(0.10, at=(0.0, 0.0, 1.45), mat=m['meter'], seg=10, rings=6,
                    scale=(1.0, 0.8, 0.5))
    window = S.box((0.13, 0.006, 0.07), at=(0.0, 0.081, 1.37), mat=m['ink'], skip=1)
    keys = S.box((0.08, 0.006, 0.05), at=(-0.04, 0.081, 1.27), mat=m['alu'], skip=1)
    slot = S.box((0.035, 0.008, 0.01), at=(0.05, 0.082, 1.28), mat=m['zinc'], skip=1)
    notice = S.box((0.15, 0.004, 0.08), at=(0.0, 0.081, 1.17), mat=m['white'], skip=1)
    lock = S.cyl(0.025, 0.02, at=(0.0, -0.085, 1.22), mat=m['zinc'], seg=8, axis='Y', skip=1)
    meter = k.object('parking_meter', [plate, studs, post, saddle, head, dome, window, keys, slot,
                                       notice, lock],
                     cls='knockable', mass=30.0, lods=(0.45, 0.2), distances=(18.0, 50.0),
                     smooth=40.0)
    meter.anchor('use', (0.0, 0.55, 0.0), forward=(0.0, -1.0, 0.0))
    meter.cyl('body', (0.0, 0.0, 0.76), radius=0.12, height=1.52)


def guard_rail(k, m):
    """A 4 m length of W-beam guard rail along X on two steel posts with blockouts; the rail's
    face looks towards +Y (the road). Lay end to end at a 4 m pitch: posts stand every 2 m."""
    centre = 0.62
    line = []
    for index in range(13):
        z = -0.155 + 0.31 * index / 12
        line.append((0.0415 * (1.0 - math.cos(math.tau * z / 0.16)), centre + z))
    outline = [(y + 0.002, z) for y, z in line] + [(y - 0.002, z) for y, z in reversed(line)]
    rail = S.extrude(outline, 4.0, mat=m['galv'], plane='YZ', centred=True)
    flange = [(-0.05, -0.075), (0.05, -0.075), (0.05, -0.067), (0.003, -0.067), (0.003, 0.067),
              (0.05, 0.067), (0.05, 0.075), (-0.05, 0.075), (-0.05, 0.067), (-0.003, 0.067),
              (-0.003, -0.067), (-0.05, -0.067)]
    posts = S.join([S.extrude(flange, 0.72, at=(x, -0.275, 0.0), plane='XY') for x in (-1.0, 1.0)])
    S.done(posts, m['galv'])
    blocks = S.join([S.box((0.15, 0.20, 0.36), at=(x, -0.10, centre)) for x in (-1.0, 1.0)])
    S.done(blocks, m['rubber'], skip=2)
    bolts = S.nuts([(x, 0.002, centre) for x in (-1.0, 1.0)], m['zinc'], radius=0.016,
                   height=0.012, axis='Y')
    rail_object = k.object('guard_rail', [rail, posts, blocks, bolts], cls='fixed',
                           lods=(0.5, 0.25), distances=(30.0, 80.0), smooth=50.0, texel_scale=0.6)
    rail_object.box('rail', (0.0, -0.12, 0.40), (4.0, 0.40, 0.80))


def water_barrier(k, m):
    """A 1.8 m water-filled plastic barrier with interlocking knuckles at its ends."""
    outline = [(-0.25, 0.0), (0.25, 0.0), (0.25, 0.05), (0.215, 0.13), (0.17, 0.36),
               (0.145, 0.86), (0.12, 0.95), (0.07, 0.995), (-0.07, 0.995), (-0.12, 0.95),
               (-0.145, 0.86), (-0.17, 0.36), (-0.215, 0.13), (-0.25, 0.05)]
    body = S.extrude(outline, 1.8, mat=m['water'], plane='YZ', centred=True)
    knuckles = S.join([S.cyl(0.055, 0.20, at=(x, 0.0, z), seg=8)
                       for x, z in ((0.93, 0.22), (0.93, 0.72), (-0.93, 0.47))])
    S.done(knuckles, m['water'], skip=2)
    cap = S.cyl(0.065, 0.025, at=(0.55, 0.0, 0.99), mat=m['water'], seg=10, ground=True,
                caps=(False, True), skip=1)
    slots = S.join([S.box((0.30, 0.51, 0.07), at=(x, 0.0, 0.0), ground=True) for x in (-0.45, 0.45)])
    S.done(slots, m['ink'], skip=1)
    barrier = k.object('water_barrier', [body, knuckles, cap, slots], cls='knockable', mass=420.0,
                       lods=(0.5, 0.25), distances=(25.0, 60.0), smooth=35.0)
    barrier.box('body', (0.0, 0.0, 0.5), (1.8, 0.5, 1.0))


def work_barricade(k, m):
    """A folding road-works barricade: two striped boards on galvanised A-frame legs and a
    flashing amber lamp (lamp_warn) on top of the left leg."""
    spread, apex = 0.36, 1.10
    tilt = math.atan2(spread, apex)
    boards = []
    for z in (0.60, 0.94):
        y = spread * (1.0 - z / apex) + 0.030
        boards.append(S.box((1.20, 0.022, 0.20), at=(0.0, y, z), rot=(tilt, 0.0, 0.0), bevel=0.004))
    boards = S.done(S.join(boards), m['stripes'])
    legs = []
    for x in (-0.50, 0.50):
        for side in (-1, 1):
            legs.append(S.beam((x, 0.0, apex), (x, side * spread, 0.0), 0.035, 0.022,
                               up=(1.0, 0.0, 0.0)))
        legs.append(S.rod((x - 0.03, 0.0, apex), (x + 0.03, 0.0, apex), 0.016, seg=6, caps=True))
        legs.append(S.beam((x, -0.25, 0.28), (x, 0.25, 0.28), 0.02, 0.02, skip=2))
    legs = S.done(S.join(legs), m['zinc'])
    feet = S.join([S.box((0.06, 0.08, 0.02), at=(x, side * spread, 0.0), ground=True)
                   for x in (-0.50, 0.50) for side in (-1, 1)])
    S.done(feet, m['rubber'], skip=1)
    stem = S.rod((-0.50, 0.0, apex), (-0.50, 0.0, apex + 0.10), 0.012, m['zinc'], seg=6)
    housing = S.rbox(0.15, 0.08, 0.17, 0.02, at=(-0.50, 0.0, apex + 0.10), mat=m['yellow'])
    lenses = []
    for turn, y in ((-math.pi / 2, 0.04), (math.pi / 2, -0.04)):
        lens = S.lathe([(0.065, 0.0), (0.05, 0.015), (0.0, 0.02)], m['lamp_warn'], seg=10)
        S.move(lens, rot=(turn, 0.0, 0.0))
        S.move(lens, at=(-0.50, y, apex + 0.185))
        lenses.append(lens)
    barricade = k.object('work_barricade', [boards, legs, feet, stem, housing, *lenses],
                         cls='knockable', mass=14.0, lods=(0.45, 0.2), distances=(18.0, 50.0),
                         smooth=30.0)
    barricade.box('body', (0.0, 0.0, 0.6), (1.2, 0.75, 1.2))


def sign_gantry(k, m):
    """The freeway sign gantry: a 16 m Warren box truss on two pipe posts (one on the verge,
    one in the median) over one carriageway of three lanes, with two blank 4.8 by 2.6 m sign
    panels on its front (anchor_sign_1 on the left as a driver sees it, anchor_sign_2 right)."""
    half, low, high, deep = 8.0, 6.4, 7.6, 0.5
    parts = []
    for x in (-half, half):
        plate, studs = S.base_plate(0.36, 0.03, m['galv'], m['zinc'], bolts=6)
        shaft = S.pole(0.20, 0.18, 0.03, 7.9, m['galv'], seg=12, step=1.4)
        cap = S.lathe([(0.18, 7.9), (0.19, 7.92), (0.0, 7.95)], m['galv'], seg=12)
        post = S.join([plate, studs, shaft, cap])
        S.move(post, at=(x, 0.0, 0.0))
        parts.append(post)
        for z in (low, high):
            parts.append(S.beam((x, -deep - 0.08, z), (x, deep + 0.08, z), 0.12, 0.12, m['galv']))
    stations = [profiles.lerp(-half, half, index / 8) for index in range(9)]
    for y in (-deep, deep):
        for z in (low, high):
            parts.append(S.pipe([(x, y, z) for x in stations], 0.065, m['galv'], seg=6))
    lacing = []
    for index in range(8):
        x0, x1 = stations[index], stations[index + 1]
        top_first = index % 2 == 0
        for y in (-deep, deep):
            za, zb = (high, low) if top_first else (low, high)
            lacing.append(S.rod((x0, y, za), (x1, y, zb), 0.028, seg=4))
        if index % 2 == 0:
            for z in (low, high):
                lacing.append(S.rod((x0, -deep, z), (x1, deep, z), 0.024, seg=4))
    parts.append(S.done(S.join(lacing), m['galv'], skip=2))
    face_y, width, height, sign_z = deep + 0.12, 4.8, 2.6, 7.0
    outline = profiles.rounded_rectangle(width, height, 0.12, 2)
    inset = ((width - 0.12) / width, (height - 0.12) / height)
    for x in (-3.3, 3.3):
        parts += face_plate(outline, inset, (x, face_y, sign_z), m['green'], m['white'],
                            back=m['alu'])
        rails = S.join([S.box((width - 0.2, 0.05, 0.08), at=(x, face_y - 0.03, z))
                        for z in (sign_z - 0.9, sign_z, sign_z + 0.9)])
        hangers = S.join([S.box((0.08, 0.06, height - 0.1), at=(x + side * 1.6, deep + 0.065, sign_z))
                          for side in (-1, 1)])
        parts += [S.done(rails, m['zinc'], skip=2), S.done(hangers, m['zinc'], skip=1)]
    gantry = k.object('sign_gantry', parts, cls='fixed', lods=(0.4, 0.15), distances=(60.0, 160.0),
                      smooth=38.0, texel_scale=0.35)
    for index, x in enumerate((3.3, -3.3), start=1):
        gantry.anchor(f'sign_{index}', (x, face_y + 0.001, sign_z), forward=(0.0, 1.0, 0.0),
                      width=width, height=height, shape='panel')
    for index, x in enumerate((-half, half), start=1):
        gantry.cyl(f'post_{index}', (x, 0.0, 3.95), radius=0.25, height=7.9)


def make(a):
    m = palette()
    k = SetKit(a)
    cone_and_barrel(k, m)
    bollards(k, m)
    jersey_barrier(k, m)
    water_barrier(k, m)
    work_barricade(k, m)
    guard_rail(k, m)
    k.row()
    sign_posts(k, m)
    street_name_post(k, m)
    parking_meter(k, m)
    pedestrian_signal(k, m)
    traffic_signal_post(k, m)
    k.row()
    traffic_signal_mast(k, m)
    sign_gantry(k, m)
    k.layout()
    a.bake(size=1024, orm_size=512, normal_size=1024, bevel_radius=0.004, occlusion_distance=0.4)


def assemble(a):
    SetKit.of(a).levels()
