"""news_helicopter: Canal 6 Golfo's camera helicopter (catalogue: Golfo Aero Libelula), a light
single-engine helicopter with a teardrop bubble canopy, 9.8 m nose to tail-rotor tip, a 9.8 m
three-blade main rotor, a slender boom with an open two-blade tail rotor on the left of the fin,
skids and a gyro-stabilised camera ball under the nose.

Built with helicopters/_heli.py like the police helicopter. The pod is a loft of superellipse
rings; its faces take the channel's livery by relative height (magenta lower body, a dark pin
stripe, white upper body) and the glazing by region (a bubble canopy from the chin to the roof
with slim frames at the door edges, chin windows, rear cabin windows). The front doors are split
off the shell and hinged at their front edges. No searchlight and no sirens: a camera ball, two
microwave antenna pods and a belly dish instead. Lettering is painted by the game at the
anchor_decal_side_* anchors; the model carries none.

Faces +Y (the nose), origin on the ground under the rotor mast, resting on the skids. Pilot on
the left (-X), like the cars' driver.

Budget override: ten nodes (body levels, interior, two doors, two rotors with blur discs) and
nine game materials need about 22 draw calls at level 0 and up to about 16,000 triangles with
the interior; bytes capped at the brief's 430 kB per vehicle.
"""
import math

from lib import materials as M
from lib import build, modify, scene, shading

import _heli as H

ASSET = {
    'id': 'news_helicopter',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 17000, 'draws': 26, 'bytes': 430000},
}

HUB_Z = 3.05
ROTOR_R = 4.90
TAIL_HUB = (-0.21, -5.98, 2.12)
TAIL_R = 0.80
CAMERA_BALL = (0.0, 2.88, 0.34)

# Pod key stations: (y, half width, bottom, top, superellipse exponent). A teardrop: the bubble
# nose is round (low exponents) and the cabin tapers into the boom.
POD = [
    (-2.10, 0.30, 1.40, 2.00, 2.0),
    (-1.75, 0.45, 1.10, 2.08, 2.2),
    (-1.30, 0.63, 0.76, 2.14, 2.6),
    (-0.80, 0.73, 0.54, 2.18, 2.9),
    (-0.10, 0.75, 0.48, 2.20, 3.0),
    (0.80, 0.75, 0.47, 2.18, 2.9),
    (1.55, 0.73, 0.48, 2.11, 2.6),
    (2.20, 0.67, 0.52, 1.97, 2.3),
    (2.75, 0.55, 0.60, 1.74, 2.1),
    (3.10, 0.40, 0.72, 1.47, 2.0),
    (3.32, 0.21, 0.86, 1.22, 2.0),
    (3.42, 0.06, 0.98, 1.07, 2.0),
]
COWL = [
    (-1.95, 0.18, 2.05, 2.22, 2.2),
    (-1.60, 0.40, 2.07, 2.47, 2.6),
    (-0.90, 0.49, 2.10, 2.57, 3.0),
    (0.20, 0.49, 2.10, 2.57, 3.0),
    (0.80, 0.39, 2.10, 2.45, 2.6),
    (1.15, 0.10, 2.12, 2.20, 2.2),
]
BOOM = [(-1.95, 0.27, 1.72), (-3.8, 0.19, 1.84), (-5.95, 0.11, 1.98)]

DOOR_Y = (0.95, 2.05)
DOOR_REL = (0.07, 0.96)
SEAT_Y_FRONT, SEAT_Y_REAR, SEAT_X, HIP_Z = 1.50, 0.0, 0.35, 1.05
SKID_X = 0.98


def materials():
    lamp = M.lamp
    return {
        'paint': M.car_paint(color=M.hex_color('#F1EFEA'), metallic_flake=0.1, gloss=0.88,
                             dirt=0.25, seed=111, name='paint'),
        'secondary': M.car_paint(color=M.hex_color('#C2337A'), metallic_flake=0.25, gloss=0.88,
                                 dirt=0.2, seed=112, name='paint_secondary'),
        'accent': M.painted_metal(color=M.hex_color('#2B2F36'), gloss=0.7, chips=0.1, rust=0.0,
                                  grime=0.2, dust=0.1, fade=0.1, seed=113, name='accent_stripe'),
        'glass': M.glass(tint=(0.28, 0.34, 0.38), opacity=0.40, seed=114, name='glass'),
        'blur': M.glass(tint=(0.05, 0.05, 0.055), opacity=0.22, roughness=0.45, seed=115,
                        name='glass_rotor'),
        'trim': M.plastic(color=(0.025, 0.025, 0.028), roughness=0.5, seed=116,
                          name='trim_plastic'),
        'skid': M.painted_metal(color=(0.55, 0.56, 0.57), gloss=0.5, chips=0.35, rust=0.02,
                                grime=0.45, dust=0.4, fade=0.2, seed=117, name='skid_metal'),
        'blade': M.painted_metal(color=(0.04, 0.042, 0.046), gloss=0.35, chips=0.2, rust=0.0,
                                 grime=0.25, dust=0.2, fade=0.25, seed=118, name='blade_paint'),
        'hub': M.cast_metal(color=(0.14, 0.14, 0.145), roughness=0.45, rust=0.05, seed=119,
                            name='hub_metal'),
        'chrome': M.chrome(seed=120, name='reflector_chrome'),
        'exhaust': M.cast_metal(color=(0.20, 0.15, 0.12), roughness=0.6, rust=0.45, seed=121,
                                name='exhaust_metal'),
        'grille': M.cast_metal(color=(0.03, 0.03, 0.032), roughness=0.6, rust=0.0, seed=122,
                               name='grille_metal'),
        'housing': M.painted_metal(color=(0.07, 0.07, 0.075), gloss=0.5, chips=0.25, rust=0.0,
                                   grime=0.3, dust=0.2, fade=0.1, seed=123, name='housing_paint'),
        'turret': M.painted_metal(color=(0.62, 0.62, 0.61), gloss=0.6, chips=0.1, rust=0.0,
                                  grime=0.25, dust=0.2, fade=0.1, seed=124, name='turret_paint'),
        'screen': M.plastic(color=(0.008, 0.01, 0.014), roughness=0.08, grain=0.0, scuffs=0.05,
                            seed=125, name='screen_black'),
        'seat': M.leather(color=(0.20, 0.17, 0.14), grain=0.4, wear_amount=0.3, seed=126,
                          name='seat_leather'),
        'floor': M.rubber(seed=127, name='floor_rubber'),
        'panel': M.plastic(color=(0.035, 0.035, 0.04), roughness=0.65, seed=128,
                           name='panel_plastic'),
        'lamp_head': lamp(color=(1.0, 0.93, 0.82), strength=8.0, seed=130, name='lamp_head'),
        'lamp_nav_red': lamp(color=(1.0, 0.06, 0.04), strength=5.0, seed=131,
                             name='lamp_nav_red'),
        'lamp_nav_green': lamp(color=(0.08, 1.0, 0.3), strength=5.0, seed=132,
                               name='lamp_nav_green'),
        'lamp_tail': lamp(color=(1.0, 0.08, 0.05), strength=6.0, seed=133, name='lamp_tail'),
    }


def _on_side(centre, normal):
    return abs(normal.x) > 0.3


def _pod_material(centre, normal):
    """Index into [paint, secondary, accent, glass] for a face of the pod."""
    rel = H.rel_height(POD, centre)
    y, side = centre.y, abs(centre.x)
    if y < 3.36:
        frame = (DOOR_Y[0] < y < DOOR_Y[0] + 0.09 or DOOR_Y[1] - 0.09 < y < DOOR_Y[1]
                 or (y < 2.9 and side < 0.045))
        bubble = y > DOOR_Y[0] and 0.42 < rel < 0.975 and side > 0.03 and not frame
        chin = 2.30 < y < 3.28 and 0.13 < rel < 0.40 and side > 0.07
        cabin_window = -0.75 < y < 0.75 and 0.50 < rel < 0.90 and _on_side(centre, normal)
        if bubble or chin or cabin_window:
            return 3
    if 0.30 < rel < 0.34:
        return 2
    if rel < 0.30:
        return 1
    return 0


def _door_test(sign):
    def test(centre, normal):
        rel = H.rel_height(POD, centre)
        return (DOOR_Y[0] < centre.y < DOOR_Y[1] and DOOR_REL[0] < rel < DOOR_REL[1]
                and centre.x * sign > 0 and _on_side(centre, normal))
    return test


def shell(mats):
    """The pod with livery and glazing, the two doors split off, both given a wall."""
    extra = (DOOR_Y[0], DOOR_Y[0] + 0.09, DOOR_Y[1] - 0.09, DOOR_Y[1], -0.75, 0.75, 2.30, 2.9,
             3.28, 3.36)
    pod = H.pod('pod', POD, step=0.20, extra=extra)
    H.assign(pod, [mats['paint'], mats['secondary'], mats['accent'], mats['glass']],
             _pod_material)
    doors = {}
    for name, sign in (('door_fl', -1.0), ('door_fr', 1.0)):
        door = H.split(pod, name, _door_test(sign))
        modify.solidify(door, thickness=0.03, offset=-1.0)
        half, bottom, top, _exponent = H.station(POD, DOOR_Y[1])
        hinge = (sign * half * 0.99, DOOR_Y[1], bottom + 0.5 * (top - bottom))
        h_half, h_bottom, h_top, _e = H.station(POD, 1.25)
        handle = H.box(name + '_handle', (0.02, 0.15, 0.03),
                       (sign * (h_half + 0.012), 1.25, h_bottom + 0.36 * (h_top - h_bottom)),
                       mats['trim'])
        door = scene.join([door, handle], name)
        scene.set_origin(door, hinge)
        doors[name] = door
    modify.solidify(pod, thickness=0.025, offset=-1.0)
    return pod, doors


def exterior(mats):
    """Everything fixed outside the pod."""
    parts = []
    parts.append(H.mat(H.pod('cowl', COWL, step=0.22), mats['paint']))
    boom = H.round_boom('boom', BOOM, segments=16, step=0.5)
    H.assign(boom, [mats['paint'], mats['secondary']],
             lambda centre, normal: 1 if normal.z < -0.05 else 0)
    parts.append(boom)
    parts.append(H.build_lathe('mast_fairing', [(0.33, 2.45), (0.30, 2.62), (0.22, 2.75),
                                                (0.14, 2.82), (0.09, 2.84)], mats['trim']))
    # Intake grilles either side of the cowling, one exhaust stack angled up and right.
    for sign in (-1.0, 1.0):
        half = H.station(COWL, 0.30)[0]
        intake = H.box('intake', (0.03, 0.42, 0.16), (sign * (half - 0.004), 0.30, 2.36),
                       mats['grille'], bevel=0.01)
        lip = H.box('intake_lip', (0.024, 0.46, 0.20), (sign * (half - 0.012), 0.30, 2.36),
                    mats['trim'], bevel=0.012)
        parts += [lip, intake]
    parts.append(H.build_tube('exhaust', [(0.20, -1.40, 2.36), (0.28, -1.75, 2.45),
                                          (0.38, -2.02, 2.55)], 0.09, mats['exhaust']))
    # Tail: stabiliser, swept fin with a ventral fin and tail skid, open two-blade tail rotor
    # on the left with its gearbox.
    parts.append(H.mat(H.wing('stabiliser', [(-0.86, 0.36, 0.10, -5.05, 1.90),
                                             (-0.20, 0.44, 0.11, -5.02, 1.90),
                                             (0.20, 0.44, 0.11, -5.02, 1.90),
                                             (0.86, 0.36, 0.10, -5.05, 1.90)], axis='X'),
                       mats['paint']))
    parts.append(H.mat(H.wing('fin', [(1.95, 0.80, 0.11, -5.62, 0.0),
                                      (2.45, 0.62, 0.10, -5.95, 0.0),
                                      (2.98, 0.40, 0.08, -6.30, 0.0)], axis='Z'),
                       mats['secondary']))
    parts.append(H.mat(H.wing('ventral', [(1.15, 0.38, 0.08, -5.95, 0.0),
                                          (1.92, 0.70, 0.10, -5.70, 0.0)], axis='Z'),
                       mats['secondary']))
    parts.append(H.rod('tail_skid', (0.0, -5.85, 1.22), (0.0, -6.25, 1.02), 0.016, mats['skid'],
                       segments=6))
    parts.append(H.axis_cylinder('tail_gearbox', 0.085, 0.20, (-0.06, TAIL_HUB[1], TAIL_HUB[2]),
                                 'X', mats['hub'], segments=14))
    parts.append(H.rod('tail_shaft_cover', (0.0, -2.0, 2.05), (0.0, -5.85, 2.13), 0.035,
                       mats['trim'], segments=8))
    # Skids on arched cross tubes, boarding steps.
    for sign in (-1.0, 1.0):
        x = sign * SKID_X
        parts.append(H.build_tube('skid', H.smooth([(x, -1.65, 0.045), (x, 1.45, 0.045),
                                                    (x, 1.90, 0.075), (x, 2.15, 0.20),
                                                    (x, 2.25, 0.35)], 2), 0.042, mats['skid'],
                                  segments=8))
        parts.append(H.box('skid_shoe', (0.05, 0.30, 0.012), (x, -1.3, 0.006), mats['hub']))
        parts.append(H.box('step', (0.15, 0.32, 0.025), (sign * 0.86, 1.52, 0.38), mats['grille'],
                           bevel=0.006))
        parts.append(H.rod('step_strut', (sign * 0.86, 1.52, 0.37), (sign * 0.80, 1.22, 0.49),
                           0.015, mats['skid'], segments=6))
    for y in (1.25, -0.90):
        belly = H.station(POD, y)[1] + 0.03
        arch = [(SKID_X, y, 0.05), (SKID_X - 0.05, y, 0.29), (SKID_X - 0.18, y, 0.45),
                (0.58, y, belly + 0.02), (0.28, y, belly)]
        path = arch + [(-p[0], p[1], p[2]) for p in reversed(arch)]
        parts.append(H.build_tube('cross', H.smooth(path, 2), 0.045, mats['skid'], segments=8))
    # The camera ball under the nose: yoke mount, ball, lens window and a sun hood.
    cx, cy, cz = CAMERA_BALL
    belly = H.station(POD, cy)[1]
    parts.append(H.axis_cylinder('ball_mount', 0.08, belly - cz - 0.18 + 0.05,
                                 (cx, cy, 0.5 * (belly + cz + 0.18)), 'Z', mats['housing'], 14))
    parts.append(H.axis_cylinder('ball_collar', 0.15, 0.05, (cx, cy, cz + 0.19), 'Z',
                                 mats['housing'], 18))
    parts.append(H.dome('camera_ball', 0.21, (cx, cy, cz), mats['turret'], segments=20, rings=12))
    parts.append(H.axis_cylinder('camera_window', 0.10, 0.04, (cx, cy + 0.19, cz - 0.01), 'Y',
                                 mats['screen'], segments=18))
    parts.append(H.axis_cylinder('camera_lens', 0.055, 0.02, (cx, cy + 0.215, cz - 0.01), 'Y',
                                 mats['glass'], segments=14))
    parts.append(H.axis_cylinder('camera_aux', 0.035, 0.02, (cx + 0.11, cy + 0.17, cz + 0.07),
                                 'Y', mats['screen'], segments=10))
    # Landing light, microwave antenna pods either side of the belly, a belly dish, blade
    # antennas on the boom and the roof.
    parts.append(H.lamp_unit('landing_light', 0.065, (0.0, 2.45, H.station(POD, 2.45)[1] + 0.02),
                             (math.radians(-40.0), 0.0, 0.0), mats, mats['lamp_head']))
    for sign in (-1.0, 1.0):
        parts.append(H.dome('antenna_pod', 0.10, (sign * 0.48, -0.55, 0.47), mats['turret'],
                            scale=(1.0, 2.6, 0.9), segments=14, rings=7))
        parts.append(H.box('antenna_pod_base', (0.10, 0.36, 0.05), (sign * 0.48, -0.55, 0.53),
                           mats['trim']))
    parts.append(H.dome('belly_dish', 0.17, (0.0, -1.55, 1.12), mats['turret'],
                        scale=(1.0, 1.25, 0.75), segments=16, rings=7))
    parts.append(H.axis_cylinder('belly_dish_mount', 0.05, 0.16, (0.0, -1.55, 1.22), 'Z',
                                 mats['housing'], 10))
    parts.append(H.box('antenna_boom', (0.012, 0.14, 0.18), (0.0, -3.4, 2.10), mats['trim'],
                       rotation=(math.radians(-25.0), 0.0, 0.0)))
    parts.append(H.box('antenna_roof', (0.012, 0.12, 0.16), (0.0, 1.30, 2.18), mats['trim'],
                       rotation=(math.radians(-25.0), 0.0, 0.0)))
    # Navigation lights on the stabiliser tips, anti-collision beacons on the cowling and fin.
    parts.append(H.dome('nav_red', 0.032, (-0.88, -5.15, 1.90), mats['lamp_nav_red']))
    parts.append(H.dome('nav_green', 0.032, (0.88, -5.15, 1.90), mats['lamp_nav_green']))
    parts.append(H.dome('beacon_cowl', 0.042, (0.0, -1.45, 2.50), mats['lamp_tail'],
                        scale=(1.0, 1.0, 1.3)))
    parts.append(H.dome('beacon_fin', 0.036, (0.0, -6.52, 2.99), mats['lamp_tail'],
                        scale=(1.0, 1.3, 1.2)))
    return parts


def interior(mats):
    parts = [H.box('floor', (1.30, 3.4, 0.04), (0.0, 0.55, 0.60), mats['floor'])]
    for x in (-SEAT_X, SEAT_X):
        parts += [
            H.box('seat_base', (0.34, 0.40, 0.28), (x, SEAT_Y_FRONT, 0.76), mats['panel']),
            H.box('seat_pan', (0.46, 0.48, 0.09), (x, SEAT_Y_FRONT, 0.93), mats['seat'],
                  bevel=0.02),
            H.box('seat_back', (0.46, 0.09, 0.64), (x, SEAT_Y_FRONT - 0.26, 1.29), mats['seat'],
                  rotation=(math.radians(-12.0), 0.0, 0.0), bevel=0.02),
            H.box('headrest', (0.25, 0.08, 0.15), (x, SEAT_Y_FRONT - 0.34, 1.70), mats['seat'],
                  bevel=0.015),
            H.rod('cyclic', (x, 1.92, 0.62), (x, 1.88, 1.00), 0.016, mats['trim']),
            H.axis_cylinder('cyclic_grip', 0.022, 0.12, (x, 1.88, 1.04), 'Z', mats['panel'], 8),
            H.box('pedal_l', (0.07, 0.12, 0.02), (x - 0.12, 2.38, 0.70), mats['hub'],
                  rotation=(math.radians(50.0), 0.0, 0.0)),
            H.box('pedal_r', (0.07, 0.12, 0.02), (x + 0.12, 2.38, 0.70), mats['hub'],
                  rotation=(math.radians(50.0), 0.0, 0.0)),
        ]
    parts.append(H.rod('collective', (-0.62, 1.28, 0.70), (-0.58, 1.78, 0.88), 0.018,
                       mats['trim']))
    parts += [
        H.box('bench_base', (1.22, 0.40, 0.28), (0.0, SEAT_Y_REAR, 0.74), mats['panel']),
        H.box('bench_pan', (1.22, 0.46, 0.09), (0.0, SEAT_Y_REAR, 0.91), mats['seat'],
              bevel=0.02),
        H.box('bench_back', (1.22, 0.09, 0.64), (0.0, SEAT_Y_REAR - 0.28, 1.27), mats['seat'],
              rotation=(math.radians(-10.0), 0.0, 0.0), bevel=0.02),
        H.box('panel', (1.04, 0.26, 0.30), (0.0, 2.30, 1.12), mats['panel'], bevel=0.02),
        H.box('glareshield', (1.08, 0.32, 0.05), (0.0, 2.28, 1.29), mats['panel'], bevel=0.015),
        H.box('console', (0.24, 0.52, 0.40), (0.0, 2.05, 0.82), mats['panel'], bevel=0.02),
        H.box('monitor', (0.30, 0.04, 0.22), (0.0, 0.32, 1.40), mats['panel'], bevel=0.01),
        H.box('monitor_screen', (0.26, 0.006, 0.17), (0.0, 0.343, 1.40), mats['screen']),
    ]
    for x in (-0.30, 0.30):
        parts.append(H.box('screen', (0.22, 0.012, 0.15), (x, 2.165, 1.14), mats['screen']))
    return scene.join(parts, 'interior')


def tail_rotor(mats):
    """rotor_tail: an open two-blade rotor on the left of the fin spinning about X (origin at the
    hub), and rotor_tail_blur."""
    hub = TAIL_HUB
    parts = [H.axis_cylinder('tail_hub', 0.05, 0.10, (0.0, 0.0, 0.0), 'X', mats['hub'], 12)]
    sections = [(0.06, 0.12, 0.10, 0.0, 0.0), (0.20, 0.15, 0.10, 0.0, 0.0),
                (TAIL_R - 0.06, 0.15, 0.10, 0.0, 0.0), (TAIL_R, 0.11, 0.10, 0.0, 0.0)]
    for k in range(2):
        rings = []
        for station_value, chord, thickness, _lead, _h in sections:
            ring = []
            for along, across in H.airfoil(chord, thickness, 8):
                ring.append((across, along - 0.5 * chord, station_value))
            rings.append(ring)
        blade = shading.recalc_normals(build.loft(f'tail_blade_{k}', rings, closed=True,
                                                  cap_start=True, cap_end=True))
        H.assign(blade, [mats['blade'], mats['secondary']],
                 lambda centre, normal: 1 if centre.z > TAIL_R - 0.14 else 0)
        modify.transform(blade, rotation=(0.0, 0.0, math.radians(8.0)))
        modify.transform(blade, rotation=(math.pi * k, 0.0, 0.0))
        parts.append(blade)
    rotor = scene.join(parts, 'rotor_tail')
    modify.transform(rotor, location=hub)
    scene.set_origin(rotor, hub)
    blur = H.annulus('rotor_tail_blur', 0.07, TAIL_R + 0.01, mats['blur'], segments=32)
    modify.transform(blur, rotation=(0.0, 0.5 * math.pi, 0.0))
    modify.transform(blur, location=hub)
    scene.set_origin(blur, hub)
    return rotor, blur


def make(a):
    mats = materials()
    spec = {'hub_z': HUB_Z, 'rotor_radius': ROTOR_R, 'blades': 3, 'chord': 0.27, 'droop': 0.15,
            'blade_phase': math.radians(30.0), 'lod1': 2600, 'lod2': 520}
    pod, doors = shell(mats)
    body = scene.join([pod] + exterior(mats), 'lod0')
    shading.smooth(body, math.radians(40.0))
    parts = {'lod0': a.add(body, unwrap='smart')}
    inside = interior(mats)
    shading.smooth(inside, math.radians(35.0))
    parts['interior'] = a.add(inside, unwrap='smart')
    for name, door in doors.items():
        shading.smooth(door, math.radians(40.0))
        parts[name] = a.add(door, unwrap='smart')
    rotor, blur = H.main_rotor(spec, mats)
    shading.smooth(rotor, math.radians(40.0))
    parts['rotor_main'] = a.add(rotor, unwrap='smart')
    parts['rotor_main_blur'] = a.add(blur)
    tail, tail_blur = tail_rotor(mats)
    shading.smooth(tail, math.radians(40.0))
    parts['rotor_tail'] = a.add(tail, unwrap='smart')
    parts['rotor_tail_blur'] = a.add(tail_blur)
    H.STATE[a.id] = {'parts': parts, 'spec': spec}

    hip = HIP_Z
    a.add_anchor('anchor_seat_driver', (-SEAT_X, SEAT_Y_FRONT + 0.04, hip), forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_seat_passenger_1', (SEAT_X, SEAT_Y_FRONT + 0.04, hip),
                 forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_seat_passenger_2', (-SEAT_X, SEAT_Y_REAR + 0.04, hip - 0.02),
                 forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_seat_passenger_3', (SEAT_X, SEAT_Y_REAR + 0.04, hip - 0.02),
                 forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_door_driver', (-1.45, 1.45, 0.0), forward=(1.0, 0.0, 0.0))
    a.add_anchor('anchor_camera', (0.0, -0.8, 2.1), forward=(0.0, 1.0, 0.0))
    landing = (0.0, 2.48, H.station(POD, 2.45)[1])
    a.add_anchor('anchor_light_head_l', landing, forward=(0.0, 0.77, -0.64), light='spot',
                 range=60.0, color=[1.0, 0.93, 0.82])
    a.add_anchor('anchor_light_tail_l', (0.0, -6.52, 3.03), forward=(0.0, -1.0, 0.0),
                 color=[1.0, 0.08, 0.05])
    for name, sign in (('anchor_decal_side_l', -1.0), ('anchor_decal_side_r', 1.0)):
        half, bottom, top, exponent = H.station(POD, -0.05)
        rel = 0.22
        a.add_anchor(name, (sign * half * H.width_factor(rel, exponent), -0.05,
                            bottom + (top - bottom) * rel),
                     forward=(sign, 0.0, 0.0), width=1.6, height=0.30)
    a.collider_box('cabin', (0.0, 0.65, 1.28), (2.06, 5.6, 2.56))
    a.collider_box('tail', (0.0, -4.45, 2.05), (1.80, 4.4, 2.2))
    a.collider_cylinder('rotor', (0.0, 0.0, HUB_Z), ROTOR_R, 0.30)
    a.set_extra('rotor_radius', ROTOR_R)
    a.set_extra('rotor_hub_height', HUB_Z)
    a.set_extra('tail_rotor_radius', TAIL_R)
    a.set_extra('skid_height', 0.47)
    a.set_extra('skid_track', 2 * SKID_X)
    a.set_extra('seats', 4)
    a.set_lod_distances(45.0, 120.0)
    a.bake(size=1024, orm_size=512, normal_size=512, occlusion_distance=0.6,
           material_texels={'seat_leather': 0.35, 'floor_rubber': 0.2, 'panel_plastic': 0.4,
                            'blade_paint': 0.35, 'skid_metal': 0.6, 'hub_metal': 0.7,
                            'screen_black': 0.3})


def assemble(a):
    H.assemble_helicopter(a)
