"""Alley and yard set: the clutter behind and between MARAZUL's buildings, in one file.

Nineteen objects, original designs at real size, sharing one atlas (see _setkit.py for how a set
is laid out and named). Fronts look towards +Y.

    dumpster_closed     a front-load steel dumpster: sloped front, fork pockets, casters, two
                        plastic lids shut
    dumpster_open       the same with both lids thrown back and bags showing over the rim
    wheelie_bin         a 240 l two-wheeled bin, handle and wheels at the back
    bin_bags            a slumped pile of five knotted black bags
    cardboard_box       a taped carton
    cardboard_stack     four cartons stacked off true
    pallet              a 1.2 x 0.8 m block pallet
    pallet_stack        three pallets stacked off true
    crate_wood          a slatted produce crate
    drum_oil            a 200 l steel drum with rolling hoops, painted
    drum_rusty          the same drum gone to rust
    tyre_stack          four car tyres
    gas_cylinders       two tall gas cylinders with valve guards
    portable_toilet     a moulded site toilet: skid base, door, vent stack, pale roof
    ac_condenser        a split air-conditioning condenser on wall brackets, its pipes into the wall
    ac_window           a through-wall air-conditioning box on a strut bracket
    gas_meter           a gas meter with its riser from the ground, regulator and valve
    fence_panel         a 2.5 m chain-link panel between two posts (the mesh is the cutout role)
    fence_gate          a 1.2 m chain-link gate between two posts; the leaf (leaf__fence_gate)
                        turns about the hinge post

Wall-mounted objects (ac_condenser, ac_window, gas_meter) are modelled against a wall on the
plane y = 0 behind them, at their usual height above the ground at the wall foot (the object's
origin). anchor_mount marks the fixing point on the wall face and points out of the wall.

The budget is raised because this is nineteen objects in one file.
"""
import math

from lib import modify
from lib import materials as M
from lib.materials import wear

import _finishes as F
import _shapes as S
from _setkit import SetKit

ASSET = {
    'id': 'set_alley_and_yard',
    'kind': 'prop',
    'atlas': 1024,
    'budget': {'triangles': 8000, 'draws': 34, 'bytes': 680000},
}

UP = (0.0, 0.0, 1.0)
FRONT = (0.0, 1.0, 0.0)
BACK = (0.0, -1.0, 0.0)


def chain_link(name='cutout_chainlink', pitch=0.07, wire=0.012, seed=0):
    """Galvanised chain-link mesh for alpha-tested cards: diamonds `pitch` metres apart along
    both diagonals of the X-Z plane, everything between the wires cut away."""
    graph = M.Graph(name, seed)
    rising = graph.add(graph.axis('X'), graph.axis('Z'))
    falling = graph.sub(graph.axis('X'), graph.axis('Z'))
    first = F.bands(graph, rising, pitch, share=wire / pitch, soft=0.02)
    second = F.bands(graph, falling, pitch, share=wire / pitch, soft=0.02)
    wires = graph.maximum(first, second)
    coat = wear.Coat(graph, graph.vary((0.50, 0.51, 0.50), amount=0.1, scale=6.0), roughness=0.4,
                     metallic=1.0)
    wear.rust_spots(coat, amount=0.3, size=0.08, streaks=False)
    material = coat.finish()
    graph.feed(graph.bsdf.inputs['Alpha'], graph.mask(wires, 0.5, 0.2))
    return material


def palette():
    """The materials of the set, by short name."""
    return {
        'dumpster': F.enamel('dumpster_enamel', M.hex_color('#2f4b3b'), seed=201, wear_amount=0.8,
                             splash=0.7),
        'lid': M.plastic(color=(0.03, 0.03, 0.032), roughness=0.55, scuffs=0.6, seed=202,
                         name='lid_plastic'),
        'bag': M.plastic(color=(0.02, 0.02, 0.022), roughness=0.28, grain=0.1, scuffs=0.2, seed=203,
                         name='bag_plastic'),
        'wheelie': F.moulded('wheelie_plastic', (0.10, 0.20, 0.13), seed=204, wear_amount=0.5,
                             splash=0.5),
        'rubber': M.rubber(dust=0.6, seed=205, name='tyre_rubber'),
        'zinc': M.galvanized(spangle=0.4, rust=0.5, seed=206, name='bolt_zinc'),
        'galv': M.galvanized(spangle=0.5, rust=0.3, seed=207, name='fence_zinc'),
        'card': F.coated('cardboard', (0.50, 0.36, 0.21), seed=208, roughness=0.88, chips=0.0,
                         rust=0.0, grime=0.5, dust=0.3, fade=0.25, scratches=0.15),
        'tape': F.coated('packing_tape', (0.60, 0.46, 0.28), seed=209, roughness=0.35, chips=0.0,
                         rust=0.0, grime=0.2, dust=0.1, fade=0.1, scratches=0.1),
        'pallet': M.wood(color=(0.55, 0.42, 0.28), weathered=0.6, grain_axis='X', seed=210,
                         name='pallet_wood'),
        'crate': M.wood(color=(0.62, 0.50, 0.34), weathered=0.4, grain_axis='X', seed=211,
                        name='crate_wood'),
        'drum': F.enamel('drum_enamel', M.hex_color('#24507d'), seed=212, wear_amount=0.5,
                         splash=0.5),
        'rust': M.rusty_metal(rust=0.85, seed=213, name='drum_rust'),
        'cylinder': F.enamel('cylinder_enamel', M.hex_color('#c8c5bb'), seed=214, wear_amount=0.45),
        'toilet': F.moulded('toilet_plastic', M.hex_color('#2c5d86'), seed=215, wear_amount=0.5,
                            splash=0.6),
        'roof': F.moulded('toilet_roof', (0.78, 0.78, 0.74), seed=216, wear_amount=0.5),
        'black': M.plastic(color=(0.03, 0.03, 0.032), seed=217, name='black_plastic'),
        'ac': F.enamel('ac_enamel', M.hex_color('#d4d1c6'), seed=218, wear_amount=0.55),
        'grille': F.slotted('ac_grille', M.hex_color('#c7c3b6'), period=0.014, axis='Z', seed=219,
                            depth=0.004, wear_amount=0.6),
        'foam': M.plastic(color=(0.08, 0.08, 0.085), roughness=0.8, grain=0.8, seed=220,
                          name='pipe_foam'),
        'meter': F.enamel('meter_enamel', M.hex_color('#8d9193'), seed=221, wear_amount=0.5),
        'pipe': F.enamel('gas_pipe_enamel', M.hex_color('#c4a02a'), seed=222, wear_amount=0.55,
                         splash=0.5),
        'dial': M.enamel_sign(color=M.hex_color('#e3ddcc'), chips=0.05, rust=0.1, seed=223,
                              name='dial_cream'),
        'concrete': M.concrete(stains=0.7, cracks=0.4, seed=224, name='footing_concrete'),
        'chainlink': chain_link(seed=225),
    }


def lump(blob, size, seed):
    """Squashes a unit ball into a slumped sack of `size` with a flat bottom and soft bulges."""
    sx, sy, sz = size

    def shape(point):
        wobble = (1.0 + 0.09 * math.sin(3.1 * point.x + seed) * math.cos(2.3 * point.y + 2.0 * seed)
                  + 0.05 * math.sin(5.0 * point.z + seed))
        point.x *= wobble * sx
        point.y *= wobble * sy
        point.z = max(point.z, -0.55) * sz
        return point

    modify.map_vertices(blob, shape)
    return blob


def bag(m, at, size, turn, seed):
    """One knotted bin bag standing on `at`."""
    sx, sy, sz = size
    blob = lump(S.sphere(1.0, seg=8, rings=5), size, seed)
    knot = S.cyl(0.035, 0.08, at=(0.0, 0.0, sz * 0.92), top=0.012, seg=6, ground=True)
    ears = S.join([S.box((0.05, 0.012, 0.05), at=(side * 0.035, 0.0, sz * 1.0 + 0.05),
                         rot=(0.0, side * 0.5, 0.0)) for side in (-1, 1)])
    S.done(ears, skip=1)
    piece = S.join([blob, knot, ears])
    S.move(piece, rot=(0.0, 0.0, turn))
    S.move(piece, at=(at[0], at[1], at[2] + 0.55 * sz))
    return S.done(piece, m['bag'])


def dumpsters(k, m):
    """The front-load dumpster, lids shut and lids thrown back."""
    outline = [(-0.55, 0.16), (0.30, 0.16), (0.56, 0.58), (0.56, 1.16), (-0.55, 1.16)]

    def body():
        shell = S.extrude(outline, 1.80, mat=m['dumpster'], plane='YZ', centred=True)
        rim = [S.box((1.84, 0.05, 0.06), at=(0.0, y, 1.15), ground=True) for y in (-0.555, 0.565)]
        rim += [S.box((0.05, 1.13, 0.06), at=(x, 0.005, 1.15), ground=True) for x in (-0.91, 0.91)]
        rim = S.done(S.join(rim), m['dumpster'])
        pockets = S.join([S.box((0.08, 0.98, 0.15), at=(x, 0.0, 0.86), ground=True)
                          for x in (-0.94, 0.94)])
        S.done(pockets, m['dumpster'])
        ribs = S.join([S.box((0.06, 0.03, 0.96), at=(x, -0.565, 0.18), ground=True)
                       for x in (-0.6, 0.0, 0.6)])
        S.done(ribs, m['dumpster'], skip=1)
        casters = []
        for x in (-0.75, 0.75):
            for y in (-0.42, 0.22):
                casters.append(S.box((0.12, 0.12, 0.03), at=(x, y, 0.13), ground=True))
                casters.append(S.cyl(0.065, 0.045, at=(x, y, 0.065), seg=8, axis='X'))
        casters = S.done(S.join(casters), m['rubber'])
        return [shell, rim, pockets, ribs, casters]

    def lid(x, angle):
        panel = S.box((0.89, 1.16, 0.04), at=(0.0, 0.58, 0.0), ground=True, bevel=0.01)
        grip = S.box((0.30, 0.04, 0.03), at=(0.0, 1.17, 0.0), ground=True)
        piece = S.join([panel, grip])
        S.move(piece, rot=(angle, 0.0, 0.0))
        S.move(piece, at=(x, -0.58, 1.21))
        return S.done(piece, m['lid'])

    shut = k.object('dumpster_closed', body() + [lid(-0.455, 0.0), lid(0.455, 0.0)],
                    cls='knockable', mass=220.0, lods=(0.4, 0.15), distances=(25.0, 70.0),
                    smooth=30.0)
    shut.box('body', (0.0, 0.0, 0.62), (1.92, 1.14, 1.24))

    rubbish = [bag(m, (x, y, 0.92), (0.30, 0.26, 0.32), turn, seed)
               for x, y, turn, seed in ((-0.45, 0.05, 0.4, 1.0), (0.1, -0.15, 1.3, 2.0),
                                        (0.55, 0.20, 2.2, 3.0))]
    opened = k.object('dumpster_open', body() + [lid(-0.455, math.radians(105.0)),
                                                 lid(0.455, math.radians(112.0))] + rubbish,
                      cls='knockable', mass=240.0, lods=(0.4, 0.15), distances=(25.0, 70.0),
                      smooth=30.0)
    opened.box('body', (0.0, 0.0, 0.62), (1.92, 1.14, 1.24))


def wheelie_bin(k, m):
    """A 240 l wheelie bin: tapered body, overhanging lid, wheels and handle at the back (-Y)."""
    body = S.rbox(0.52, 0.64, 0.90, 0.05, at=(0.0, 0.0, 0.08), mat=m['wheelie'],
                  stations=[(0.0, (0.84, 0.82)), (1.0, 1.0)])
    lip = S.rbox(0.60, 0.74, 0.05, 0.05, at=(0.0, 0.0, 0.96), mat=m['wheelie'])
    lid = S.rbox(0.61, 0.77, 0.035, 0.05, at=(0.0, 0.015, 1.01), mat=m['wheelie'])
    grip = S.box((0.24, 0.04, 0.03), at=(0.0, 0.40, 1.0), mat=m['wheelie'], ground=True)
    handle = S.rod((-0.27, -0.40, 0.99), (0.27, -0.40, 0.99), 0.017, m['wheelie'], seg=6, caps=True)
    wheels = S.join([S.cyl(0.10, 0.05, at=(side * 0.27, -0.30, 0.10), seg=10, axis='X')
                     for side in (-1, 1)])
    S.done(wheels, m['rubber'])
    axle = S.rod((-0.25, -0.30, 0.10), (0.25, -0.30, 0.10), 0.012, m['zinc'], seg=5, skip=1)
    foot = S.box((0.36, 0.08, 0.08), at=(0.0, 0.22, 0.0), mat=m['wheelie'], ground=True)
    wheelie = k.object('wheelie_bin', [body, lip, lid, grip, handle, wheels, axle, foot],
                       cls='knockable', mass=15.0, lods=(0.35, 0.12), distances=(18.0, 50.0),
                       smooth=40.0)
    wheelie.box('body', (0.0, 0.0, 0.53), (0.62, 0.8, 1.06))


def bin_bags(k, m):
    """A slumped pile of five bags."""
    bags = [bag(m, at, size, turn, seed) for at, size, turn, seed in (
        ((-0.25, 0.05, 0.0), (0.30, 0.26, 0.34), 0.3, 1.0),
        ((0.20, -0.05, 0.0), (0.32, 0.27, 0.36), 1.1, 2.0),
        ((0.05, 0.28, 0.0), (0.26, 0.24, 0.28), 2.0, 3.0),
        ((-0.05, -0.30, 0.0), (0.27, 0.25, 0.30), 2.7, 4.0),
        ((-0.02, 0.02, 0.30), (0.25, 0.22, 0.27), 0.9, 5.0))]
    pile = k.object('bin_bags', bags, cls='scatter', mass=25.0, lods=(0.35, 0.12),
                    distances=(15.0, 40.0), smooth=60.0)
    pile.box('body', (0.0, 0.0, 0.3), (0.95, 1.0, 0.6))


def carton(m, size, at=(0.0, 0.0, 0.0), turn=0.0):
    """A taped cardboard carton standing on `at`."""
    w, d, h = size
    shell = S.box(size, mat=m['card'], ground=True, bevel=0.004)
    tape = S.join([S.box((w + 0.004, 0.05, 0.003), at=(0.0, 0.0, h), ground=True)]
                  + [S.box((0.003, 0.05, 0.12), at=(side * (w / 2 + 0.0015), 0.0, h - 0.12), ground=True)
                     for side in (-1, 1)])
    S.done(tape, m['tape'], skip=1)
    piece = S.join([shell, tape])
    S.move(piece, rot=(0.0, 0.0, turn))
    S.move(piece, at=at)
    return piece


def cardboard(k, m):
    """One carton, and four stacked off true."""
    single = k.object('cardboard_box', [carton(m, (0.60, 0.40, 0.40))], cls='scatter', mass=2.0,
                      lods=(0.4,), distances=(15.0,), smooth=30.0)
    single.box('body', (0.0, 0.0, 0.2), (0.6, 0.4, 0.4))

    stack = [carton(m, (0.60, 0.40, 0.40), (-0.30, 0.0, 0.0), 0.0),
             carton(m, (0.50, 0.40, 0.35), (0.30, 0.04, 0.0), 0.10),
             carton(m, (0.55, 0.38, 0.32), (-0.27, 0.02, 0.40), -0.12),
             carton(m, (0.40, 0.30, 0.28), (0.30, 0.02, 0.35), 0.30)]
    pile = k.object('cardboard_stack', stack, cls='scatter', mass=12.0, lods=(0.4,),
                    distances=(15.0,), smooth=30.0)
    pile.box('body', (0.0, 0.0, 0.36), (1.15, 0.5, 0.72))


def pallet_parts(z0=0.0, turn=0.0, shift=(0.0, 0.0)):
    """The twenty boards and blocks of one 1.2 x 0.8 m block pallet, its base at z0."""
    pieces = [S.box((1.2, 0.10, 0.022), at=(0.0, y, z0), ground=True) for y in (-0.35, 0.0, 0.35)]
    pieces += [S.box((0.145, 0.10, 0.078), at=(x, y, z0 + 0.022), ground=True)
               for x in (-0.5275, 0.0, 0.5275) for y in (-0.35, 0.0, 0.35)]
    pieces += [S.box((0.145, 0.80, 0.022), at=(x, 0.0, z0 + 0.10), ground=True)
               for x in (-0.5275, 0.0, 0.5275)]
    pieces += [S.box((1.2, width, 0.022), at=(0.0, y, z0 + 0.122), ground=True)
               for y, width in ((-0.3275, 0.145), (-0.16, 0.10), (0.0, 0.145), (0.16, 0.10),
                                (0.3275, 0.145))]
    piece = S.join(pieces)
    S.move(piece, rot=(0.0, 0.0, turn))
    S.move(piece, at=(shift[0], shift[1], 0.0))
    return piece


def pallets(k, m):
    """A pallet, and three stacked off true."""
    one = k.object('pallet', [S.done(pallet_parts(), m['pallet'])], cls='scatter', mass=22.0,
                   lods=(0.35,), distances=(18.0,), smooth=30.0)
    one.box('body', (0.0, 0.0, 0.072), (1.2, 0.8, 0.144))

    stack = [pallet_parts(0.0), pallet_parts(0.144, 0.05, (0.03, 0.02)),
             pallet_parts(0.288, -0.04, (-0.02, 0.03))]
    pile = k.object('pallet_stack', [S.done(S.join(stack), m['pallet'])], cls='knockable',
                    mass=66.0, lods=(0.35, 0.12), distances=(18.0, 50.0), smooth=30.0)
    pile.box('body', (0.0, 0.0, 0.216), (1.26, 0.86, 0.432))


def crate_wood(k, m):
    """A slatted produce crate, 0.6 x 0.4 x 0.32 m."""
    pieces = [S.box((0.03, 0.03, 0.32), at=(x, y, 0.0), ground=True)
              for x in (-0.285, 0.285) for y in (-0.185, 0.185)]
    pieces += [S.box((0.60, 0.012, 0.07), at=(0.0, y, z), ground=True)
               for y in (-0.194, 0.194) for z in (0.01, 0.125, 0.24)]
    pieces += [S.box((0.012, 0.40, 0.09), at=(x, 0.0, z), ground=True)
               for x in (-0.294, 0.294) for z in (0.01, 0.20)]
    pieces += [S.box((0.60, 0.11, 0.012), at=(0.0, y, 0.0), ground=True) for y in (-0.13, 0.0, 0.13)]
    crate = k.object('crate_wood', [S.done(S.join(pieces), m['crate'])], cls='scatter', mass=5.0,
                     lods=(0.35,), distances=(15.0,), smooth=30.0)
    crate.box('body', (0.0, 0.0, 0.16), (0.6, 0.4, 0.32))


def drums(k, m):
    """A 200 l steel drum, painted and rusted through."""
    profile = [(0.286, 0.0), (0.292, 0.02), (0.286, 0.04), (0.286, 0.28), (0.297, 0.29),
               (0.286, 0.30), (0.286, 0.58), (0.297, 0.59), (0.286, 0.60), (0.286, 0.85),
               (0.293, 0.875), (0.278, 0.88), (0.278, 0.872), (0.0, 0.872)]
    for name, mat, seed in (('drum_oil', m['drum'], 0.0), ('drum_rusty', m['rust'], 1.0)):
        shell = S.lathe(profile, mat, seg=14)
        bungs = S.join([S.cyl(0.03, 0.012, at=(x, 0.12, 0.872), seg=6, ground=True,
                              caps=(False, True)) for x in (-0.16, 0.16)])
        S.done(bungs, m['zinc'], skip=1)
        drum = k.object(name, [shell, bungs], cls='knockable', mass=25.0, lods=(0.35, 0.12),
                        distances=(18.0, 50.0), smooth=40.0)
        drum.cyl('body', (0.0, 0.0, 0.44), radius=0.3, height=0.88)


def tyre_stack(k, m):
    """Four car tyres stacked a little off true."""
    tyres = []
    for index, (dx, dy) in enumerate(((0.0, 0.0), (0.03, -0.02), (-0.02, 0.03), (0.02, 0.01))):
        tyre = S.torus(0.24, 0.095, seg=12, sides=6)
        S.move(tyre, scale=(1.0, 1.0, 1.05))
        S.move(tyre, at=(dx, dy, 0.10 + index * 0.20))
        tyres.append(tyre)
    stack = k.object('tyre_stack', [S.done(S.join(tyres), m['rubber'])], cls='knockable', mass=40.0,
                     lods=(0.35, 0.12), distances=(18.0, 50.0), smooth=50.0)
    stack.cyl('body', (0.0, 0.0, 0.4), radius=0.36, height=0.8)


def gas_cylinders(k, m):
    """Two tall gas cylinders with valve guards, side by side along X."""
    parts = []
    for x in (-0.2, 0.2):
        body = S.lathe([(0.17, 0.0), (0.172, 0.08), (0.187, 0.10), (0.187, 0.98), (0.15, 1.08),
                        (0.07, 1.12), (0.03, 1.13)], m['cylinder'], seg=12, caps=(False, True),
                       at=(x, 0.0, 0.0))
        guard = S.join([S.torus(0.10, 0.012, at=(x, 0.0, 1.24), seg=10, sides=4)]
                       + [S.rod((x + side * 0.10, 0.0, 1.10), (x + side * 0.10, 0.0, 1.24), 0.012, seg=4)
                          for side in (-1, 1)])
        S.done(guard, m['cylinder'])
        valve = S.join([S.cyl(0.025, 0.09, at=(x, 0.0, 1.12), seg=6, ground=True),
                        S.torus(0.035, 0.008, at=(x, 0.0, 1.21), seg=8, sides=3)])
        S.done(valve, m['zinc'], skip=1)
        parts += [body, guard, valve]
    pair = k.object('gas_cylinders', parts, cls='knockable', mass=70.0, lods=(0.35, 0.12),
                    distances=(18.0, 50.0), smooth=40.0)
    pair.box('body', (0.0, 0.0, 0.63), (0.78, 0.4, 1.26))


def portable_toilet(k, m):
    """A moulded site toilet, its door towards +Y."""
    skid = S.box((1.16, 1.16, 0.10), mat=m['toilet'], ground=True, bevel=0.01)
    body = S.rbox(1.10, 1.10, 2.10, 0.06, at=(0.0, 0.0, 0.10), mat=m['toilet'])
    roof = S.rbox(1.18, 1.18, 0.12, 0.08, at=(0.0, 0.0, 2.20), mat=m['roof'],
                  stations=[(0.0, 1.0), (1.0, 0.82)])
    door = S.box((0.80, 0.03, 1.86), at=(0.0, 0.55, 0.20), mat=m['toilet'], ground=True, bevel=0.008)
    latch = S.box((0.08, 0.012, 0.035), at=(0.30, 0.572, 1.30), mat=m['dial'], skip=1)
    handle = S.rod((0.30, 0.58, 1.08), (0.30, 0.58, 1.18), 0.012, m['black'], seg=5, caps=True, skip=1)
    ribs = S.join([S.box((0.04, 0.03, 1.7), at=(side * 0.555, y, 0.30), ground=True)
                   for side in (-1, 1) for y in (-0.3, 0.0, 0.3)])
    S.done(ribs, m['toilet'], skip=1)
    vents = S.join([S.box((0.004, 0.40, 0.12), at=(side * 0.552, 0.0, 1.92), ground=True)
                    for side in (-1, 1)])
    S.done(vents, m['grille'])
    stack = S.cyl(0.045, 0.45, at=(-0.42, -0.42, 2.0), mat=m['black'], seg=8, ground=True)
    cowl = S.cyl(0.07, 0.06, at=(-0.42, -0.42, 2.45), mat=m['black'], seg=8, ground=True)
    toilet = k.object('portable_toilet', [skid, body, roof, door, latch, handle, ribs, vents, stack,
                                          cowl],
                      cls='knockable', mass=85.0, lods=(0.4, 0.15), distances=(25.0, 70.0),
                      smooth=35.0)
    toilet.anchor('door', (0.0, 0.8, 0.0), forward=BACK)
    toilet.box('body', (0.0, 0.0, 1.16), (1.18, 1.18, 2.32))


def ac_condenser(k, m):
    """A split condenser on two wall brackets, its bottom 2.2 m up the wall."""
    brackets = []
    for x in (-0.30, 0.30):
        brackets += [S.beam((x, 0.0, 2.17), (x, 0.44, 2.17), 0.04, 0.035),
                     S.beam((x, 0.0, 1.82), (x, 0.38, 2.15), 0.03, 0.03, up=(1.0, 0.0, 0.0)),
                     S.box((0.06, 0.008, 0.42), at=(x, 0.004, 1.80), ground=True)]
    brackets = S.done(S.join(brackets), m['zinc'])
    unit = S.rbox(0.82, 0.30, 0.56, 0.015, at=(0.0, 0.23, 2.19), mat=m['ac'])
    fan = S.cyl(0.205, 0.008, at=(-0.12, 0.382, 2.47), mat=m['grille'], seg=16, axis='Y')
    rings = S.join([S.torus(radius, 0.008, at=(-0.12, 0.386, 2.47), seg=16, sides=3, axis='Y')
                    for radius in (0.205, 0.12)])
    S.done(rings, m['ac'], skip=1)
    side = S.box((0.004, 0.24, 0.44), at=(-0.412, 0.23, 2.25), mat=m['grille'], ground=True)
    panel = S.box((0.16, 0.006, 0.30), at=(0.30, 0.382, 2.48), mat=m['ac'], skip=1)
    pipes = S.join([S.pipe([(0.40, 0.20, z), (0.48, 0.20, z), (0.50, 0.12, z), (0.50, -0.02, z)],
                           radius, seg=6, smooth=1) for z, radius in ((2.26, 0.016), (2.32, 0.012))])
    S.done(pipes, m['foam'])
    drain = S.pipe([(0.2, 0.25, 2.19), (0.2, 0.25, 2.05), (0.25, 0.15, 1.70), (0.25, 0.12, 1.40)],
                   0.008, m['black'], seg=4, smooth=1, skip=2)
    condenser = k.object('ac_condenser', [brackets, unit, fan, rings, side, panel, pipes, drain],
                         cls='fixed', lods=(0.35, 0.12), distances=(25.0, 70.0), smooth=35.0)
    condenser.anchor('mount', (0.0, 0.0, 2.2), forward=FRONT)
    condenser.box('body', (0.04, 0.22, 2.47), (0.94, 0.44, 0.6))


def ac_window(k, m):
    """A through-wall air-conditioning box, its bottom 1.0 m up, on a strut bracket."""
    case = S.rbox(0.62, 0.40, 0.42, 0.012, at=(0.0, 0.15, 1.0), mat=m['ac'])
    louvres = S.join([S.box((0.004, 0.22, 0.28), at=(side * 0.312, 0.21, 1.07), ground=True)
                      for side in (-1, 1)])
    S.done(louvres, m['grille'])
    grille = S.box((0.54, 0.004, 0.34), at=(0.0, 0.352, 1.04), mat=m['grille'], ground=True)
    struts = S.join([S.beam((x, 0.0, 0.70), (x, 0.30, 0.995), 0.03, 0.03, up=(1.0, 0.0, 0.0))
                     for x in (-0.22, 0.22)]
                    + [S.beam((x, 0.0, 0.985), (x, 0.32, 0.985), 0.035, 0.02) for x in (-0.22, 0.22)])
    S.done(struts, m['zinc'])
    box = k.object('ac_window', [case, louvres, grille, struts], cls='fixed', lods=(0.4, 0.15),
                   distances=(25.0, 70.0), smooth=35.0)
    box.anchor('mount', (0.0, 0.0, 1.0), forward=FRONT)
    box.box('body', (0.0, 0.18, 1.06), (0.64, 0.36, 0.72))


def gas_meter(k, m):
    """A gas meter on the wall with its riser out of the ground, regulator and valve."""
    body = S.rbox(0.34, 0.20, 0.40, 0.02, at=(0.0, 0.13, 0.95), mat=m['meter'])
    window = S.box((0.15, 0.006, 0.09), at=(0.0, 0.232, 1.22), mat=m['black'])
    dial = S.box((0.12, 0.004, 0.06), at=(0.0, 0.236, 1.22), mat=m['dial'], skip=1)
    plate = S.box((0.12, 0.004, 0.07), at=(0.0, 0.231, 1.05), mat=m['dial'], skip=1)
    riser = S.pipe([(-0.28, 0.12, 0.0), (-0.28, 0.12, 1.48), (-0.10, 0.12, 1.48), (-0.10, 0.13, 1.35)],
                   0.017, m['pipe'], seg=6, smooth=1)
    outlet = S.pipe([(0.10, 0.13, 1.35), (0.10, 0.12, 1.48), (0.10, 0.04, 1.48), (0.10, -0.02, 1.48)],
                    0.017, m['pipe'], seg=6, smooth=1)
    regulator = S.lathe([(0.0, 0.0), (0.085, 0.0), (0.085, 0.025), (0.06, 0.065), (0.0, 0.075)],
                        m['meter'], seg=10)
    S.move(regulator, rot=(-math.pi / 2, 0.0, 0.0))
    S.move(regulator, at=(-0.28, 0.14, 0.82))
    valve = S.box((0.05, 0.05, 0.07), at=(-0.28, 0.12, 0.55), mat=m['pipe'])
    lever = S.box((0.16, 0.02, 0.02), at=(-0.20, 0.155, 0.55), mat=m['black'], skip=1)
    clips = S.join([S.box((0.05, 0.12, 0.02), at=(-0.28, 0.06, z)) for z in (0.30, 1.20)])
    S.done(clips, m['zinc'], skip=1)
    meter = k.object('gas_meter', [body, window, dial, plate, riser, outlet, regulator, valve, lever,
                                   clips],
                     cls='fixed', lods=(0.35, 0.12), distances=(20.0, 55.0), smooth=35.0)
    meter.anchor('mount', (0.0, 0.0, 0.95), forward=FRONT)
    meter.box('body', (-0.05, 0.12, 0.75), (0.62, 0.26, 1.5))


def fence_post(m, x, height, radius=0.03):
    """A chain-link line post with its dome cap and concrete collar."""
    collar = S.cyl(0.09, 0.04, at=(x, 0.0, 0.0), mat=m['concrete'], seg=8, ground=True, caps=(False, True))
    shaft = S.cyl(radius, height, at=(x, 0.0, 0.0), mat=m['galv'], seg=8, ground=True, caps=(False, False))
    cap = S.lathe([(radius + 0.006, height), (radius + 0.006, height + 0.02), (0.012, height + 0.04),
                   (0.0, height + 0.045)], m['galv'], seg=8, at=(x, 0.0, 0.0))
    bands = S.join([S.torus(radius + 0.004, 0.005, at=(x, 0.0, z), seg=8, sides=3)
                    for z in (0.3, height - 0.15)])
    S.done(bands, m['zinc'], skip=1)
    return [collar, shaft, cap, bands]


def fences(k, m):
    """A 2.5 m chain-link panel and a 1.2 m gate, both along X, 1.8 m high."""
    parts = fence_post(m, -1.25, 1.85) + fence_post(m, 1.25, 1.85)
    rail = S.rod((-1.25, 0.0, 1.80), (1.25, 0.0, 1.80), 0.02, m['galv'], seg=6)
    wire = S.rod((-1.25, 0.0, 0.07), (1.25, 0.0, 0.07), 0.004, m['galv'], seg=3, skip=2)
    mesh = S.card(2.46, 1.74, at=(0.0, 0.0, 0.06), mat=m['chainlink'])
    panel = k.object('fence_panel', parts + [rail, wire, mesh], cls='knockable', mass=45.0,
                     lods=(0.4, 0.15), distances=(25.0, 70.0), smooth=40.0, texel_scale=0.9)
    panel.box('body', (0.0, 0.0, 0.92), (2.56, 0.1, 1.85))

    posts = fence_post(m, -0.66, 1.92, 0.035) + fence_post(m, 0.66, 1.92, 0.035)
    hinges = S.join([S.box((0.06, 0.05, 0.05), at=(-0.62, 0.0, z)) for z in (0.30, 1.60)]
                    + [S.box((0.07, 0.05, 0.04), at=(0.61, 0.0, 1.00))])
    S.done(hinges, m['zinc'], skip=1)
    gate = k.object('fence_gate', posts + [hinges], cls='fixed', lods=(0.4, 0.15),
                    distances=(25.0, 70.0), smooth=40.0)
    frame = S.pipe([(-0.58, 0.0, 0.08), (0.58, 0.0, 0.08), (0.58, 0.0, 1.80), (-0.58, 0.0, 1.80)],
                   0.018, m['galv'], seg=6, closed=True)
    braces = S.join([S.rod((-0.58, 0.0, 0.94), (0.58, 0.0, 0.94), 0.014, seg=5),
                     S.rod((-0.56, 0.0, 0.10), (0.56, 0.0, 0.92), 0.012, seg=5)])
    S.done(braces, m['galv'])
    leaf_mesh = S.card(1.14, 1.70, at=(0.0, 0.0, 0.09), mat=m['chainlink'])
    gate.part('leaf', [frame, braces, leaf_mesh], (-0.62, 0.0, 0.0))
    gate.cyl('post_1', (-0.66, 0.0, 0.96), radius=0.05, height=1.92)
    gate.cyl('post_2', (0.66, 0.0, 0.96), radius=0.05, height=1.92)
    gate.box('leaf', (0.0, 0.0, 0.94), (1.2, 0.06, 1.74))


def make(a):
    m = palette()
    k = SetKit(a)
    cardboard(k, m)
    crate_wood(k, m)
    bin_bags(k, m)
    tyre_stack(k, m)
    drums(k, m)
    gas_cylinders(k, m)
    wheelie_bin(k, m)
    pallets(k, m)
    k.row()
    dumpsters(k, m)
    portable_toilet(k, m)
    ac_condenser(k, m)
    ac_window(k, m)
    gas_meter(k, m)
    k.row()
    fences(k, m)
    k.layout()
    a.bake(size=1024, orm_size=512, normal_size=1024, bevel_radius=0.004, occlusion_distance=0.4,
           material_texels={'cutout_chainlink': 2.5})


def assemble(a):
    SetKit.of(a).levels()
