"""Sidewalk set: the furniture of MARAZUL's pavements, in one file.

Nineteen objects, original designs at real size, sharing one atlas (see _setkit.py for how a set
is laid out and named). Fronts look towards +Y, at the walker who uses them.

    bench_slat          a 1.8 m bench: steel end frames, four seat and three back slats
    bench_concrete      a cast concrete seat slab on two plinths
    bin_round           a louvred steel litter bin on a pedestal, a raised rain lid over the throat
    bin_box             a square steel litter bin with a hooded throat front and back
    fire_hydrant        a cast pillar hydrant: breakaway flange, two side outlets, a pumper outlet
    mailbox             a collection box on four feet: rounded top, pull-down chute, blank label
    newspaper_box       a coin-operated vending box with a glazed door and papers inside
    phone_kiosk         a pay phone on a post: steel back, glass sides, a hood with a blank sign
                        panel and a lamp under it (lamp_panel)
    bus_shelter         a 3.6 m shelter: glazed back and end, a lit double-sided advert box
                        (lamp_panel, anchor_sign_1/_2) and a perch bench
    bike_rack           three galvanised hoops; anchor_bike_1.._3 are where bicycles stand
    bicycle             a city bicycle on its kickstand (knockable on its own)
    drinking_fountain   a concrete pedestal with a steel bowl, bubbler and push button
    planter_box         a hollow concrete trough with an empty soil top (anchor_plant)
    planter_round       a round concrete bowl planter with an empty soil top (anchor_plant)
    tree_grate          a 1.2 m cast-iron grate round a trunk opening (anchor_tree); flat
    manhole_cover       a 0.66 m patterned cast cover in its frame; flat
    storm_drain         a 0.9 m gully grate in its frame; flat
    ticket_machine      a pay-and-display machine: screen, keypad, ticket cup, solar lid
    street_clock        a 4.2 m cast post clock with two faces; its four hands are moving parts
                        (hour_1, minute_1 on the front face, hour_2, minute_2 on the back)

Seats carry anchor_seat_N (where a walker sits, facing out of the seat); machines and boxes
anchor_use (where a walker stands to use them). No lettering anywhere: label plates and sign
panels stay blank for the game to paint.

The budget is raised because this is nineteen objects in one file.
"""
import math

from lib import scene, shading
from lib import materials as M

import _finishes as F
import _shapes as S
from _setkit import SetKit

ASSET = {
    'id': 'set_sidewalk',
    'kind': 'prop',
    'atlas': 1024,
    'budget': {'triangles': 7600, 'draws': 34, 'bytes': 680000},
}

UP = (0.0, 0.0, 1.0)
FRONT = (0.0, 1.0, 0.0)
BACK = (0.0, -1.0, 0.0)


def palette():
    """The materials of the set, by short name."""
    return {
        'frame': F.enamel('frame_enamel', M.hex_color('#25342e'), seed=101, wear_amount=0.45),
        'wood': M.wood(color=(0.42, 0.27, 0.15), weathered=0.55, grain_axis='X', seed=102,
                       name='slat_wood'),
        'concrete': M.concrete(color=(0.56, 0.54, 0.50), stains=0.6, cracks=0.3, seed=103,
                               name='cast_concrete'),
        'louvre': F.slotted('bin_louvres', M.hex_color('#2d4b41'), period=0.035, axis='Z',
                            seed=104, wear_amount=0.5),
        'green': F.enamel('bin_enamel', M.hex_color('#2d4b41'), seed=105, wear_amount=0.5,
                          splash=0.6),
        'charcoal': F.enamel('charcoal_enamel', M.hex_color('#34383b'), seed=106, wear_amount=0.45,
                             splash=0.5),
        'hydrant': F.enamel('hydrant_enamel', M.hex_color('#a3301d'), seed=107, wear_amount=0.55,
                            splash=0.6),
        'cap': F.enamel('cap_enamel', M.hex_color('#b8b4aa'), seed=108, wear_amount=0.5),
        'mail': F.enamel('mail_enamel', M.hex_color('#2a4a63'), seed=109, wear_amount=0.4,
                         splash=0.4),
        'news': F.enamel('news_enamel', M.hex_color('#b3842d'), seed=110, wear_amount=0.55,
                         splash=0.4),
        'steel': M.brushed_metal(color=(0.58, 0.59, 0.60), seed=111, name='kiosk_steel'),
        'black': M.plastic(color=(0.03, 0.03, 0.032), seed=112, name='black_plastic'),
        'glass': M.glass(tint=(0.58, 0.68, 0.70), opacity=0.28, seed=113, name='glass'),
        'lamp_panel': M.lamp(color=(0.96, 0.95, 0.90), strength=3.0, name='lamp_panel'),
        'galv': M.galvanized(spangle=0.5, rust=0.25, seed=114, name='rack_zinc'),
        'zinc': M.galvanized(spangle=0.4, rust=0.5, seed=115, name='bolt_zinc'),
        'iron': F.checker_plate('cover_iron', seed=116),
        'cast': M.cast_metal(seed=117, name='frame_iron'),
        'grate': F.slotted('grate_iron', (0.11, 0.105, 0.10), period=0.045, axis='X', seed=118,
                           depth=0.01, share=0.5, wear_amount=0.8),
        'soil': F.coated('planter_soil', (0.13, 0.09, 0.06), seed=119, roughness=0.95, chips=0.0,
                         rust=0.0, grime=0.0, dust=0.3, fade=0.0, scratches=0.0, variation=0.15),
        'rubber': M.rubber(dust=0.5, seed=120, name='tyre_rubber'),
        'bike': F.enamel('bike_enamel', M.hex_color('#1f5a6c'), seed=121, wear_amount=0.3,
                         gloss=0.7),
        'face': M.enamel_sign(color=M.hex_color('#e6e0cf'), chips=0.05, rust=0.1, seed=122,
                              name='label_cream'),
        'ink': M.enamel_sign(color=(0.03, 0.03, 0.032), chips=0.05, rust=0.1, seed=123,
                             name='clock_hand'),
        'machine': F.enamel('machine_enamel', M.hex_color('#3b4046'), seed=124, wear_amount=0.4),
        'screen': M.plastic(color=(0.012, 0.014, 0.018), roughness=0.15, seed=125,
                            name='screen_plastic'),
        'paper': F.coated('newsprint', (0.66, 0.64, 0.58), seed=126, roughness=0.85, chips=0.0,
                          rust=0.0, grime=0.2, dust=0.2, fade=0.1, scratches=0.0),
    }


def seats(entry, xs, y, z):
    """anchor_seat_1.. along X at a seat's front edge, facing out of the seat (+Y)."""
    for index, x in enumerate(xs, start=1):
        entry.anchor(f'seat_{index}', (x, y, z), forward=FRONT)


def benches(k, m):
    """A slatted steel-and-wood bench and a concrete one."""
    tilt = math.atan2(0.11, 0.45)
    frames = []
    for x in (-0.80, 0.80):
        frames += [
            S.beam((x, 0.22, 0.0), (x, 0.22, 0.43), 0.05, 0.05, up=FRONT),
            S.beam((x, -0.20, 0.0), (x, -0.22, 0.43), 0.05, 0.05, up=FRONT),
            S.beam((x, -0.22, 0.43), (x, -0.33, 0.88), 0.05, 0.04, up=FRONT),
            S.beam((x, 0.27, 0.42), (x, -0.25, 0.40), 0.05, 0.04),
            S.beam((x, 0.22, 0.43), (x, 0.24, 0.64), 0.04, 0.04, up=FRONT),
            S.beam((x, 0.29, 0.645), (x, -0.27, 0.665), 0.065, 0.03),
        ]
    frames = S.done(S.join(frames), m['frame'])
    feet = S.join([S.box((0.09, 0.09, 0.012), at=(x, y, 0.0), ground=True)
                   for x in (-0.80, 0.80) for y in (0.22, -0.20)])
    S.done(feet, m['zinc'], skip=1)
    slats = [S.box((1.84, 0.095, 0.035), at=(0.0, y, 0.445 - 0.03 * (0.22 - y)), bevel=0.006)
             for y in (0.20, 0.09, -0.02, -0.13)]
    for t in (0.25, 0.55, 0.85):
        slats.append(S.box((1.84, 0.032, 0.095), at=(0.0, -0.245 - 0.11 * t, 0.43 + 0.45 * t),
                           rot=(tilt, 0.0, 0.0), bevel=0.006))
    slats = S.done(S.join(slats), m['wood'])
    bolts = S.nuts([(x, y, 0.47) for x in (-0.80, 0.80) for y in (0.20, -0.13)], m['zinc'],
                   radius=0.008, height=0.006)
    bench = k.object('bench_slat', [frames, feet, slats, bolts], cls='knockable', mass=70.0,
                     lods=(0.3, 0.1), distances=(18.0, 50.0), smooth=35.0)
    seats(bench, (-0.55, 0.0, 0.55), 0.05, 0.45)
    bench.box('body', (0.0, -0.02, 0.45), (1.84, 0.62, 0.9))

    slab = S.box((1.8, 0.5, 0.10), at=(0.0, 0.0, 0.36), mat=m['concrete'], ground=True, bevel=0.015)
    plinths = S.join([S.box((0.36, 0.42, 0.36), at=(x, 0.0, 0.0), ground=True, bevel=0.01)
                      for x in (-0.6, 0.6)])
    S.done(plinths, m['concrete'])
    stone = k.object('bench_concrete', [slab, plinths], cls='fixed', lods=(0.5,),
                     distances=(30.0,), smooth=30.0)
    seats(stone, (-0.45, 0.45), 0.08, 0.46)
    stone.box('body', (0.0, 0.0, 0.23), (1.8, 0.5, 0.46))


def litter_bins(k, m):
    """A round louvred bin on a pedestal and a square hooded one."""
    plate, studs = S.base_plate(0.17, 0.012, m['charcoal'], m['zinc'], bolts=3)
    stem = S.cyl(0.05, 0.10, at=(0.0, 0.0, 0.012), mat=m['charcoal'], seg=8, ground=True,
                 caps=(False, False))
    shell = S.lathe([(0.20, 0.10), (0.23, 0.13), (0.23, 0.87), (0.215, 0.90)], m['louvre'],
                    seg=16, caps=(True, False))
    inner = S.lathe([(0.212, 0.48), (0.212, 0.90)], m['black'], seg=16)
    shading.flip(inner)
    rubbish = S.cyl(0.212, 0.01, at=(0.0, 0.0, 0.47), mat=m['black'], seg=16, ground=True,
                    caps=(False, True))
    posts = S.join([S.rod(point, (point[0], point[1], 1.0), 0.012, seg=5)
                    for point in S.ring_points(0.215, 3, z=0.88, start=math.pi / 2)])
    S.done(posts, m['green'])
    lid = S.lathe([(0.255, 1.0), (0.255, 1.03), (0.21, 1.09), (0.11, 1.13), (0.0, 1.14)],
                  m['green'], seg=16, caps=(True, False))
    round_bin = k.object('bin_round', [plate, studs, stem, shell, inner, rubbish, posts, lid],
                         cls='knockable', mass=30.0, lods=(0.35, 0.12), distances=(18.0, 50.0),
                         smooth=40.0)
    round_bin.cyl('body', (0.0, 0.0, 0.57), radius=0.25, height=1.14)

    plinth = S.box((0.44, 0.38, 0.08), mat=m['charcoal'], ground=True)
    body = S.rbox(0.48, 0.42, 0.85, 0.035, at=(0.0, 0.0, 0.08), mat=m['charcoal'])
    hood = S.rbox(0.52, 0.46, 0.20, 0.05, at=(0.0, 0.0, 0.93), mat=m['charcoal'],
                  stations=[(0.0, 1.0), (0.55, 1.0), (1.0, (0.78, 0.7))])
    throats = S.join([S.box((0.30, 0.012, 0.10), at=(0.0, side * 0.226, 1.0)) for side in (-1, 1)])
    S.done(throats, m['black'])
    door = S.box((0.38, 0.006, 0.62), at=(0.0, 0.211, 0.46), mat=m['green'], skip=1)
    lock = S.cyl(0.014, 0.012, at=(0.15, 0.216, 0.70), mat=m['zinc'], seg=6, axis='Y', skip=1)
    box_bin = k.object('bin_box', [plinth, body, hood, throats, door, lock], cls='knockable',
                       mass=40.0, lods=(0.4, 0.15), distances=(18.0, 50.0), smooth=40.0)
    box_bin.box('body', (0.0, 0.0, 0.565), (0.52, 0.46, 1.13))


def fire_hydrant(k, m):
    """A cast pillar hydrant, its pumper outlet towards the street (+Y)."""
    body = S.lathe([(0.16, 0.0), (0.16, 0.05), (0.13, 0.07), (0.13, 0.10), (0.115, 0.11),
                    (0.115, 0.55), (0.135, 0.56), (0.135, 0.60), (0.12, 0.62), (0.11, 0.70),
                    (0.07, 0.76), (0.03, 0.78), (0.03, 0.80)], m['hydrant'], seg=12,
                   caps=(False, True))
    nut = S.cyl(0.032, 0.05, at=(0.0, 0.0, 0.80), mat=m['cap'], seg=5, ground=True,
                caps=(False, True))
    bolts = S.nuts(S.ring_points(0.122, 6, z=0.10), m['cap'], radius=0.012, height=0.014)
    outlets = []
    for side in (-1, 1):
        outlets.append(S.cyl(0.045, 0.10, at=(side * 0.15, 0.0, 0.45), mat=m['hydrant'], seg=8,
                             axis='X'))
        outlets.append(S.cyl(0.052, 0.045, at=(side * 0.215, 0.0, 0.45), mat=m['cap'], seg=6,
                             axis='X'))
    outlets.append(S.cyl(0.066, 0.10, at=(0.0, 0.15, 0.40), mat=m['hydrant'], seg=10, axis='Y'))
    outlets.append(S.cyl(0.074, 0.05, at=(0.0, 0.215, 0.40), mat=m['cap'], seg=6, axis='Y'))
    chain = S.pipe([(0.20, 0.03, 0.43), (0.16, 0.10, 0.33), (0.06, 0.20, 0.36)], 0.005,
                   m['cap'], seg=4, smooth=2, skip=1)
    hydrant = k.object('fire_hydrant', [body, nut, bolts, *outlets, chain], cls='knockable',
                       mass=110.0, lods=(0.35, 0.12), distances=(18.0, 50.0), smooth=40.0)
    hydrant.anchor('water', (0.0, 0.0, 0.10), forward=UP, up=FRONT)
    hydrant.cyl('body', (0.0, 0.0, 0.425), radius=0.2, height=0.85)


def mailbox(k, m):
    """A street collection box on four feet."""
    feet = S.join([S.box((0.05, 0.05, 0.15), at=(x, y, 0.0), ground=True)
                   for x in (-0.2, 0.2) for y in (-0.2, 0.2)])
    S.done(feet, m['mail'])
    body = S.box((0.50, 0.52, 0.85), at=(0.0, 0.0, 0.14), mat=m['mail'], ground=True, bevel=0.01)
    top = S.cyl(0.25, 0.52, at=(0.0, 0.0, 0.99), mat=m['mail'], seg=16, axis='Y')
    chute = S.box((0.38, 0.03, 0.15), at=(0.0, 0.275, 0.93), rot=(0.35, 0.0, 0.0), mat=m['mail'],
                  bevel=0.006)
    handle = S.rod((-0.08, 0.30, 0.985), (0.08, 0.30, 0.985), 0.01, m['zinc'], seg=5, caps=True,
                   skip=1)
    label = S.box((0.30, 0.004, 0.18), at=(0.0, 0.262, 0.58), mat=m['face'], skip=1)
    door = S.box((0.40, 0.004, 0.30), at=(0.0, 0.261, 0.30), mat=m['mail'], skip=1)
    box = k.object('mailbox', [feet, body, top, chute, handle, label, door], cls='knockable',
                   mass=85.0, lods=(0.4, 0.15), distances=(18.0, 50.0), smooth=40.0)
    box.anchor('use', (0.0, 0.6, 0.0), forward=BACK)
    box.box('body', (0.0, 0.0, 0.62), (0.52, 0.54, 1.24))


def newspaper_box(k, m):
    """A coin-operated newspaper vending box on four legs."""
    legs = S.join([S.box((0.03, 0.03, 0.33), at=(x, y, 0.0), ground=True)
                   for x in (-0.2, 0.2) for y in (-0.17, 0.17)])
    S.done(legs, m['charcoal'])
    body = S.rbox(0.46, 0.40, 0.62, 0.02, at=(0.0, 0.0, 0.32), mat=m['news'])
    lid = S.rbox(0.48, 0.42, 0.03, 0.025, at=(0.0, 0.0, 0.94), mat=m['news'])
    coin = S.rbox(0.20, 0.13, 0.12, 0.02, at=(0.0, 0.10, 0.97), mat=m['charcoal'])
    window = S.box((0.34, 0.006, 0.24), at=(0.0, 0.202, 0.75), mat=m['glass'])
    frame = S.box((0.38, 0.004, 0.28), at=(0.0, 0.199, 0.75), mat=m['charcoal'])
    papers = S.box((0.36, 0.26, 0.10), at=(0.0, 0.0, 0.62), mat=m['paper'], ground=True)
    handle = S.rod((-0.08, 0.215, 0.60), (0.08, 0.215, 0.60), 0.009, m['zinc'], seg=5, caps=True,
                   skip=1)
    label = S.box((0.36, 0.004, 0.16), at=(0.0, 0.2005, 0.45), mat=m['face'], skip=1)
    box = k.object('newspaper_box', [legs, body, lid, coin, window, frame, papers, handle, label],
                   cls='knockable', mass=35.0, lods=(0.4, 0.15), distances=(18.0, 50.0),
                   smooth=35.0)
    box.anchor('use', (0.0, 0.55, 0.0), forward=BACK)
    box.box('body', (0.0, 0.0, 0.55), (0.48, 0.42, 1.1))


def phone_kiosk(k, m):
    """A pay phone on a post, half enclosed, with a hood light and a blank sign panel."""
    base = S.box((0.30, 0.30, 0.02), at=(0.0, -0.17, 0.0), mat=m['zinc'], ground=True)
    post = S.box((0.12, 0.12, 2.0), at=(0.0, -0.17, 0.0), mat=m['steel'], ground=True)
    back = S.box((0.78, 0.04, 1.0), at=(0.0, -0.09, 0.95), mat=m['steel'], ground=True, bevel=0.005)
    panes, rails = [], []
    for side in (-1, 1):
        panes.append(S.box((0.012, 0.42, 0.86), at=(side * 0.39, 0.13, 1.02), ground=True))
        rails += [S.box((0.03, 0.44, 0.03), at=(side * 0.39, 0.13, z), ground=True)
                  for z in (0.99, 1.88)]
    panes = S.done(S.join(panes), m['glass'])
    rails = S.done(S.join(rails), m['steel'])
    hood = S.box((0.84, 0.50, 0.26), at=(0.0, 0.13, 1.92), mat=m['steel'], ground=True, bevel=0.01)
    sign = S.box((0.74, 0.004, 0.16), at=(0.0, 0.382, 2.05), mat=m['face'], solid=True)
    light = S.slab(0.60, 0.30, mat=m['lamp_panel'])
    S.move(light, rot=(math.pi, 0.0, 0.0))
    S.move(light, at=(0.0, 0.13, 1.917))
    phone = S.rbox(0.22, 0.12, 0.44, 0.02, at=(0.0, -0.01, 1.12), mat=m['machine'])
    keypad = S.box((0.10, 0.008, 0.12), at=(0.03, 0.054, 1.30), mat=m['zinc'], skip=1)
    handset = S.box((0.06, 0.05, 0.22), at=(-0.16, 0.0, 1.42), mat=m['black'], bevel=0.012)
    cord = S.pipe([(-0.16, 0.0, 1.31), (-0.15, 0.03, 1.20), (-0.09, 0.05, 1.17), (-0.06, 0.05, 1.20)],
                  0.006, m['black'], seg=4, smooth=2, skip=2)
    shelf = S.box((0.62, 0.18, 0.025), at=(0.0, 0.04, 1.03), mat=m['steel'], ground=True)
    kiosk = k.object('phone_kiosk', [base, post, back, panes, rails, hood, sign, light, phone,
                                     keypad, handset, cord, shelf],
                     cls='knockable', mass=140.0, lods=(0.4, 0.15), distances=(22.0, 60.0),
                     smooth=35.0)
    kiosk.anchor('use', (0.0, 0.55, 0.0), forward=BACK)
    kiosk.anchor('sign', (0.0, 0.385, 2.05), forward=FRONT, width=0.74, height=0.16, shape='panel')
    kiosk.box('body', (0.0, 0.05, 1.09), (0.84, 0.55, 2.18))


def bus_shelter(k, m):
    """A 3.6 m bus shelter facing the kerb (+Y): glazed back and left end, a lit advert box at
    the right end and a perch bench along the back."""
    half, back_y, front_y = 1.75, -0.62, 0.58
    posts = S.join([S.box((0.08, 0.08, 2.40), at=(x, y, 0.0), ground=True)
                    for x in (-half, half) for y in (back_y, front_y)])
    S.done(posts, m['frame'])
    roof = S.box((3.80, 1.60, 0.08), at=(0.0, -0.02, 2.40), mat=m['frame'], ground=True, bevel=0.01)
    fascia = S.box((3.80, 0.04, 0.20), at=(0.0, 0.79, 2.30), mat=m['frame'], ground=True)
    gutter = S.box((3.80, 0.06, 0.06), at=(0.0, -0.84, 2.36), mat=m['frame'], ground=True, skip=1)
    panes = [S.box((1.10, 0.012, 1.84), at=(x, back_y, 0.26), ground=True) for x in (-1.14, 0.0, 1.14)]
    panes.append(S.box((0.012, 1.12, 1.84), at=(-half, -0.02, 0.26), ground=True))
    panes = S.done(S.join(panes), m['glass'])
    rails = [S.box((3.46, 0.05, 0.05), at=(0.0, back_y, z), ground=True) for z in (0.21, 2.10)]
    rails += [S.box((0.04, 0.05, 1.84), at=(x, back_y, 0.26), ground=True) for x in (-0.57, 0.57)]
    rails += [S.box((0.05, 1.12, 0.05), at=(-half, -0.02, z), ground=True) for z in (0.21, 2.10)]
    rails = S.done(S.join(rails), m['frame'])
    advert = S.box((0.14, 1.26, 1.92), at=(half, -0.02, 0.24), mat=m['frame'], ground=True,
                   bevel=0.008)
    faces = [S.card(1.14, 1.78, at=(half + side * 0.0715, -0.02, 0.31), mat=m['lamp_panel'],
                    rot_z=-side * math.pi / 2) for side in (-1, 1)]
    bench = S.box((2.2, 0.30, 0.04), at=(-0.45, -0.44, 0.44), mat=m['steel'], ground=True,
                  bevel=0.006)
    brackets = S.join([S.beam((x, back_y + 0.02, 0.35), (x, -0.32, 0.44), 0.04, 0.03)
                       for x in (-1.3, 0.4)])
    S.done(brackets, m['frame'], skip=1)
    shelter = k.object('bus_shelter', [posts, roof, fascia, gutter, panes, rails, advert, *faces,
                                       bench, brackets],
                       cls='fixed', lods=(0.45, 0.2), distances=(40.0, 110.0), smooth=30.0,
                       texel_scale=0.6)
    seats(shelter, (-1.2, -0.45, 0.3), -0.30, 0.48)
    shelter.anchor('sign_1', (half + 0.072, -0.02, 1.20), forward=(1.0, 0.0, 0.0), width=1.14,
                   height=1.78, shape='panel')
    shelter.anchor('sign_2', (half - 0.072, -0.02, 1.20), forward=(-1.0, 0.0, 0.0), width=1.14,
                   height=1.78, shape='panel')
    shelter.box('back', (0.0, back_y, 1.2), (3.6, 0.1, 2.4))
    shelter.box('end', (-half, -0.02, 1.2), (0.1, 1.24, 2.4))
    shelter.box('advert', (half, -0.02, 1.2), (0.16, 1.28, 2.4))


def bikes(k, m):
    """Three galvanised hoops, and a city bicycle (length along Y, front wheel towards +Y)."""
    hoops, plates = [], []
    for x in (-0.9, 0.0, 0.9):
        hoops.append(S.pipe([(x, -0.36, 0.0), (x, -0.36, 0.66), (x, -0.30, 0.79), (x, 0.30, 0.79),
                             (x, 0.36, 0.66), (x, 0.36, 0.0)], 0.024, seg=8, smooth=2))
        plates += [S.box((0.10, 0.10, 0.008), at=(x, y, 0.0), ground=True) for y in (-0.36, 0.36)]
    hoops = S.done(S.join(hoops), m['galv'])
    plates = S.done(S.join(plates), m['zinc'], skip=1)
    rack = k.object('bike_rack', [hoops, plates], cls='fixed', lods=(0.4, 0.15),
                    distances=(20.0, 55.0), smooth=50.0)
    for index, x in enumerate((-0.9, 0.0, 0.9), start=1):
        rack.anchor(f'bike_{index}', (x + 0.16, 0.0, 0.0), forward=FRONT)
    rack.box('body', (0.0, 0.0, 0.4), (1.86, 0.78, 0.8))

    axle, wheel_y = 0.35, 0.51
    parts = []
    for y in (-wheel_y, wheel_y):
        parts.append(S.torus(0.33, 0.021, at=(0.0, y, axle), mat=m['rubber'], seg=18, sides=4,
                             axis='X'))
        parts.append(S.torus(0.305, 0.011, at=(0.0, y, axle), mat=m['zinc'], seg=18, sides=3,
                             axis='X'))
        parts.append(S.cyl(0.025, 0.10, at=(0.0, y, axle), mat=m['zinc'], seg=6, axis='X'))
        spokes = [S.rod((0.0, y, axle), (0.0, y + 0.30 * math.cos(a), axle + 0.30 * math.sin(a)),
                        0.0018, seg=3) for a in (math.tau * i / 8 for i in range(8))]
        parts.append(S.done(S.join(spokes), m['zinc'], skip=1))
    bracket, seat, head_top, head_low = (0.0, -0.05, 0.28), (0.0, -0.19, 0.78), (0.0, 0.355, 0.80), (0.0, 0.40, 0.64)
    tubes = [S.rod(bracket, seat, 0.017, seg=6), S.rod((0.0, -0.18, 0.75), (0.0, 0.36, 0.77), 0.016, seg=6),
             S.rod(bracket, (0.0, 0.39, 0.67), 0.019, seg=6), S.rod(head_low, head_top, 0.021, seg=6)]
    for side in (-1, 1):
        rear = (side * 0.055, -wheel_y, axle)
        tubes += [S.rod(bracket, rear, 0.010, seg=5), S.rod((0.0, -0.18, 0.75), rear, 0.009, seg=5),
                  S.rod(head_low, (side * 0.05, wheel_y, axle), 0.012, seg=5)]
    tubes = S.done(S.join(tubes), m['bike'])
    bars = S.join([S.rod(head_top, (0.0, 0.34, 0.92), 0.013, seg=5),
                   S.pipe([(-0.27, 0.27, 0.95), (-0.22, 0.33, 0.93), (0.22, 0.33, 0.93), (0.27, 0.27, 0.95)],
                          0.011, seg=5, smooth=1),
                   S.rod((0.0, -0.19, 0.78), (0.0, -0.21, 0.90), 0.012, seg=5),
                   S.rod((0.06, -0.05, 0.28), (0.07, -0.10, 0.12), 0.01, seg=4),
                   S.rod((-0.06, -0.05, 0.28), (-0.07, 0.00, 0.44), 0.01, seg=4),
                   S.rod((0.04, -0.12, 0.28), (0.10, -0.30, 0.02), 0.008, seg=4)])
    S.done(bars, m['zinc'])
    ring = S.cyl(0.09, 0.008, at=(0.045, -0.05, 0.28), mat=m['zinc'], seg=12, axis='X')
    saddle = S.sphere(0.07, at=(0.0, -0.22, 0.92), mat=m['black'], seg=8, rings=4,
                      scale=(1.0, 1.9, 0.4))
    grips = S.join([S.rod((side * 0.27, 0.27, 0.95), (side * 0.20, 0.30, 0.935), 0.015, seg=5)
                    for side in (-1, 1)])
    S.done(grips, m['black'], skip=1)
    pedals = S.join([S.box((0.09, 0.05, 0.02), at=(0.11, -0.10, 0.12)),
                     S.box((0.09, 0.05, 0.02), at=(-0.11, 0.00, 0.44))])
    S.done(pedals, m['black'], skip=1)
    bike = k.object('bicycle', [*parts, tubes, bars, ring, saddle, grips, pedals], cls='knockable',
                    mass=13.0, lods=(0.3, 0.1), distances=(15.0, 40.0), smooth=45.0)
    bike.box('body', (0.0, 0.0, 0.5), (0.5, 1.76, 1.0))


def drinking_fountain(k, m):
    """A concrete pedestal with a steel bowl, a bubbler and a push button."""
    pedestal = S.box((0.36, 0.36, 0.80), mat=m['concrete'], ground=True, bevel=0.012)
    bowl = S.lathe([(0.0, 0.80), (0.20, 0.80), (0.24, 0.87), (0.25, 0.92), (0.235, 0.925),
                    (0.20, 0.89), (0.05, 0.87), (0.0, 0.868)], m['steel'], seg=16)
    drain = S.cyl(0.03, 0.004, at=(0.0, 0.0, 0.868), mat=m['cast'], seg=8, ground=True,
                  caps=(False, True), skip=1)
    bubbler = S.pipe([(0.0, -0.12, 0.87), (0.0, -0.12, 0.95), (0.0, -0.07, 0.97)], 0.014, m['zinc'],
                     seg=6, smooth=1, caps=True)
    button = S.cyl(0.03, 0.03, at=(0.0, 0.195, 0.72), mat=m['zinc'], seg=8, axis='Y')
    fountain = k.object('drinking_fountain', [pedestal, bowl, drain, bubbler, button], cls='fixed',
                        lods=(0.4,), distances=(25.0,), smooth=40.0)
    fountain.anchor('use', (0.0, 0.5, 0.0), forward=BACK)
    fountain.box('body', (0.0, 0.0, 0.46), (0.5, 0.5, 0.92))


def planters(k, m):
    """A hollow concrete trough and a round bowl planter, both with an empty soil top."""
    walls = [S.box((1.6, 0.08, 0.55), at=(0.0, y, 0.0), ground=True, bevel=0.01) for y in (-0.26, 0.26)]
    walls += [S.box((0.08, 0.44, 0.55), at=(x, 0.0, 0.0), ground=True, bevel=0.01) for x in (-0.76, 0.76)]
    walls = S.done(S.join(walls), m['concrete'])
    soil = S.box((1.44, 0.44, 0.48), mat=m['soil'], ground=True)
    trough = k.object('planter_box', [walls, soil], cls='fixed', lods=(0.4,), distances=(30.0,),
                      smooth=30.0)
    trough.anchor('plant', (0.0, 0.0, 0.48), forward=UP, up=FRONT)
    trough.box('body', (0.0, 0.0, 0.275), (1.6, 0.6, 0.55))

    bowl = S.lathe([(0.44, 0.0), (0.50, 0.08), (0.52, 0.54), (0.545, 0.57), (0.545, 0.62),
                    (0.48, 0.62), (0.47, 0.56), (0.465, 0.54)], m['concrete'], seg=18)
    earth = S.cyl(0.466, 0.01, at=(0.0, 0.0, 0.53), mat=m['soil'], seg=18, ground=True,
                  caps=(False, True))
    round_planter = k.object('planter_round', [bowl, earth], cls='fixed', lods=(0.4,),
                             distances=(30.0,), smooth=40.0)
    round_planter.anchor('plant', (0.0, 0.0, 0.54), forward=UP, up=FRONT)
    round_planter.cyl('body', (0.0, 0.0, 0.31), radius=0.55, height=0.62)


def ground_castings(k, m):
    """The flat ironwork set into the pavement and road: tree grate, manhole cover, gully."""
    grate = S.box((1.2, 1.2, 0.022), mat=m['grate'], ground=True)
    rim = [S.box((1.24, 0.03, 0.026), at=(0.0, y, 0.0), ground=True) for y in (-0.605, 0.605)]
    rim += [S.box((0.03, 1.18, 0.026), at=(x, 0.0, 0.0), ground=True) for x in (-0.605, 0.605)]
    rim = S.done(S.join(rim), m['cast'])
    hole = S.cyl(0.25, 0.004, at=(0.0, 0.0, 0.022), mat=m['soil'], seg=16, ground=True,
                 caps=(False, True))
    collar = S.torus(0.255, 0.012, at=(0.0, 0.0, 0.024), mat=m['cast'], seg=16, sides=4)
    tree = k.object('tree_grate', [grate, rim, hole, collar], cls='fixed', lods=(0.5,),
                    distances=(25.0,), smooth=30.0)
    tree.anchor('tree', (0.0, 0.0, 0.0), forward=UP, up=FRONT)

    cover = S.cyl(0.33, 0.018, mat=m['iron'], seg=20, ground=True, caps=(False, True))
    ring = S.lathe([(0.33, 0.018), (0.33, 0.0), (0.38, 0.0), (0.38, 0.01), (0.335, 0.02)],
                   m['cast'], seg=20)
    k.object('manhole_cover', [cover, ring], cls='fixed', lods=(0.5,), distances=(25.0,),
             smooth=30.0)

    gully = S.box((0.86, 0.40, 0.02), mat=m['grate'], ground=True)
    frame = [S.box((0.92, 0.03, 0.024), at=(0.0, y, 0.0), ground=True) for y in (-0.215, 0.215)]
    frame += [S.box((0.03, 0.40, 0.024), at=(x, 0.0, 0.0), ground=True) for x in (-0.445, 0.445)]
    frame = S.done(S.join(frame), m['cast'])
    k.object('storm_drain', [gully, frame], cls='fixed', lods=(0.5,), distances=(25.0,),
             smooth=30.0)


def ticket_machine(k, m):
    """A pay-and-display machine with a solar lid, facing the pavement (+Y)."""
    plinth = S.box((0.50, 0.36, 0.08), mat=m['concrete'], ground=True, bevel=0.008)
    body = S.rbox(0.44, 0.30, 1.42, 0.03, at=(0.0, 0.0, 0.08), mat=m['machine'])
    hood = S.box((0.52, 0.42, 0.06), at=(0.0, 0.03, 1.50), mat=m['machine'], ground=True, bevel=0.008)
    solar = S.box((0.44, 0.34, 0.02), at=(0.0, 0.0, 1.585), rot=(0.22, 0.0, 0.0), mat=m['screen'])
    screen = S.box((0.18, 0.006, 0.12), at=(0.0, 0.152, 1.26), mat=m['screen'])
    keypad = S.box((0.12, 0.008, 0.10), at=(-0.06, 0.152, 1.07), mat=m['zinc'], skip=1)
    slot = S.box((0.08, 0.01, 0.03), at=(0.11, 0.153, 1.10), mat=m['black'], skip=1)
    cup = S.box((0.16, 0.05, 0.07), at=(0.0, 0.165, 0.82), mat=m['black'], bevel=0.008)
    label = S.box((0.30, 0.004, 0.20), at=(0.0, 0.151, 0.45), mat=m['face'], skip=1)
    machine = k.object('ticket_machine', [plinth, body, hood, solar, screen, keypad, slot, cup,
                                          label],
                       cls='knockable', mass=160.0, lods=(0.4, 0.15), distances=(20.0, 55.0),
                       smooth=35.0)
    machine.anchor('use', (0.0, 0.55, 0.0), forward=BACK)
    machine.box('body', (0.0, 0.0, 0.8), (0.52, 0.42, 1.6))


def street_clock(k, m):
    """A cast post clock with two faces (front +Y and back); its hands are moving parts that
    stand at twelve and turn about the face's anchor."""
    centre = 3.75
    base = S.lathe([(0.22, 0.0), (0.22, 0.06), (0.18, 0.10), (0.16, 0.45), (0.11, 0.52),
                    (0.10, 0.60)], m['frame'], seg=12)
    column = S.pole(0.08, 0.065, 0.60, 3.20, m['frame'], seg=12, step=1.3)
    collar = S.lathe([(0.065, 3.20), (0.10, 3.24), (0.10, 3.28), (0.07, 3.36)], m['frame'], seg=12)
    case = S.cyl(0.40, 0.22, at=(0.0, 0.0, centre), mat=m['frame'], seg=20, axis='Y')
    bezels = S.join([S.torus(0.37, 0.022, at=(0.0, side * 0.11, centre), seg=20, sides=4, axis='Y')
                     for side in (-1, 1)])
    S.done(bezels, m['galv'])
    faces = S.join([S.cyl(0.355, 0.006, at=(0.0, side * 0.112, centre), seg=20, axis='Y')
                    for side in (-1, 1)])
    S.done(faces, m['face'], solid=True)
    finial = S.lathe([(0.06, 4.14), (0.07, 4.18), (0.04, 4.24), (0.012, 4.32), (0.0, 4.36)],
                     m['galv'], seg=8)
    clock = k.object('street_clock', [base, column, collar, case, bezels, faces, finial],
                     cls='fixed', lods=(0.4, 0.15), distances=(30.0, 80.0), smooth=40.0)
    for index, side in ((1, 1), (2, -1)):
        y = side * 0.119
        hour = S.box((0.03, 0.004, 0.20), at=(0.0, y, centre + 0.07), mat=m['ink'])
        minute = S.box((0.02, 0.004, 0.30), at=(0.0, y + side * 0.002, centre + 0.12), mat=m['ink'])
        clock.part(f'hour_{index}', [hour], (0.0, y, centre))
        clock.part(f'minute_{index}', [minute], (0.0, y, centre))
        clock.anchor(f'face_{index}', (0.0, y, centre), forward=(0.0, side, 0.0), radius=0.355)
    clock.cyl('pole', (0.0, 0.0, 1.65), radius=0.2, height=3.3)


def make(a):
    m = palette()
    k = SetKit(a)
    ground_castings(k, m)
    planters(k, m)
    fire_hydrant(k, m)
    litter_bins(k, m)
    mailbox(k, m)
    newspaper_box(k, m)
    k.row()
    ticket_machine(k, m)
    drinking_fountain(k, m)
    benches(k, m)
    bikes(k, m)
    phone_kiosk(k, m)
    street_clock(k, m)
    k.row()
    bus_shelter(k, m)
    k.layout()
    a.bake(size=1024, orm_size=512, normal_size=1024, bevel_radius=0.004, occlusion_distance=0.4)


def assemble(a):
    SetKit.of(a).levels()
