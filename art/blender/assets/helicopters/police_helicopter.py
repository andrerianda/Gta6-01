"""police_helicopter: the MPD air-support helicopter (catalogue: Golfo Aero Gavilan), a light
twin-engine pod-and-boom helicopter on skids, 10.9 m long, 10.8 m four-blade main rotor, a
shrouded tail rotor in a tall fin, a nose searchlight and a sensor ball.

Built with helicopters/_heli.py. The pod is a loft of superellipse rings from a key table; its
faces take the livery by relative height (blue lower body, a gold pin stripe, white upper body),
the glazing by region (wrap-round windscreen with a centre post, chin windows, door and cabin
windows), and the two front doors are split off the shell and hinged at their front edges.
Engine cowling with intakes and twin exhausts, mast fairing, tapered boom, horizontal stabiliser
with end plates, fenestron shroud with stator vanes, skids on arched cross tubes, interior with
four seats, panel, console, cyclics and a collective.

Faces +Y (the nose), origin on the ground under the rotor mast, resting on the skids. Pilot on
the left (-X), like the cars' driver.

Budget override: eleven nodes (body levels, interior, two doors, two rotors with blur discs, the
searchlight) and twelve game materials (paint, paint_secondary, glass, glass_rotor, seven lamp
groups and the atlas) need about 28 draw calls at level 0 and about 16,000 triangles with the
interior; bytes up to 690,000 (geometry dominates: no mesh compression in this build) until the
shell and the lower levels are trimmed toward the brief's 430 kB.
"""
import math

from mathutils import Vector

from lib import materials as M
from lib import modify, scene, shading

import _heli as H

ASSET = {
    'id': 'police_helicopter',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 17000, 'draws': 30, 'bytes': 690000},
}

HUB_Z = 3.30
ROTOR_R = 5.40
TAIL_HUB = (0.0, -6.62, 1.98)
TAIL_R = 0.38
SEARCHLIGHT = Vector((0.40, 2.80, 0.30))

# Pod key stations: (y, half width, bottom, top, superellipse exponent).
POD = [
    (-2.40, 0.33, 1.44, 2.06, 2.0),
    (-2.05, 0.47, 1.17, 2.13, 2.2),
    (-1.60, 0.67, 0.80, 2.20, 2.6),
    (-1.05, 0.80, 0.54, 2.24, 2.9),
    (-0.30, 0.82, 0.48, 2.26, 3.0),
    (0.80, 0.82, 0.47, 2.25, 3.0),
    (1.60, 0.80, 0.48, 2.20, 2.9),
    (2.20, 0.77, 0.51, 2.06, 2.7),
    (2.75, 0.69, 0.57, 1.82, 2.5),
    (3.15, 0.55, 0.66, 1.55, 2.3),
    (3.45, 0.36, 0.78, 1.28, 2.1),
    (3.62, 0.12, 0.92, 1.08, 2.0),
]
COWL = [
    (-2.25, 0.20, 2.10, 2.30, 2.2),
    (-1.85, 0.45, 2.12, 2.58, 2.6),
    (-1.00, 0.56, 2.15, 2.68, 3.0),
    (0.30, 0.56, 2.15, 2.68, 3.0),
    (0.95, 0.44, 2.15, 2.56, 2.6),
    (1.35, 0.12, 2.18, 2.26, 2.2),
]
BOOM = [(-2.25, 0.31, 1.75), (-4.0, 0.25, 1.84), (-6.25, 0.17, 1.94)]

DOOR_Y = (1.00, 2.12)
DOOR_REL = (0.07, 0.96)
SEAT_Y_FRONT, SEAT_Y_REAR, SEAT_X, HIP_Z = 1.58, 0.05, 0.38, 1.06


def materials():
    lamp = M.lamp
    return {
        'paint': M.car_paint(color=M.hex_color('#F2F0E8'), metallic_flake=0.1, gloss=0.85,
                             dirt=0.3, seed=11, name='paint'),
        'secondary': M.car_paint(color=M.hex_color('#1D4E7A'), metallic_flake=0.2, gloss=0.85,
                                 dirt=0.3, seed=12, name='paint_secondary'),
        'accent': M.painted_metal(color=M.hex_color('#E8B23A'), gloss=0.7, chips=0.15, rust=0.0,
                                  grime=0.2, dust=0.1, fade=0.15, seed=13, name='accent_stripe'),
        'glass': M.glass(tint=(0.30, 0.37, 0.40), opacity=0.42, seed=14, name='glass'),
        'blur': M.glass(tint=(0.05, 0.05, 0.055), opacity=0.22, roughness=0.45, seed=15,
                        name='glass_rotor'),
        'trim': M.plastic(color=(0.025, 0.025, 0.028), roughness=0.5, seed=16, name='trim_plastic'),
        'skid': M.painted_metal(color=(0.05, 0.05, 0.055), gloss=0.45, chips=0.45, rust=0.05,
                                grime=0.5, dust=0.45, fade=0.2, seed=17, name='skid_metal'),
        'blade': M.painted_metal(color=(0.04, 0.042, 0.046), gloss=0.35, chips=0.2, rust=0.0,
                                 grime=0.25, dust=0.2, fade=0.25, seed=18, name='blade_paint'),
        'hub': M.cast_metal(color=(0.14, 0.14, 0.145), roughness=0.45, rust=0.05, seed=19,
                            name='hub_metal'),
        'chrome': M.chrome(seed=20, name='reflector_chrome'),
        'exhaust': M.cast_metal(color=(0.20, 0.15, 0.12), roughness=0.6, rust=0.45, seed=21,
                                name='exhaust_metal'),
        'grille': M.cast_metal(color=(0.03, 0.03, 0.032), roughness=0.6, rust=0.0, seed=22,
                               name='grille_metal'),
        'housing': M.painted_metal(color=(0.07, 0.07, 0.075), gloss=0.5, chips=0.25, rust=0.0,
                                   grime=0.3, dust=0.2, fade=0.1, seed=23, name='housing_paint'),
        'turret': M.painted_metal(color=(0.42, 0.43, 0.44), gloss=0.6, chips=0.15, rust=0.0,
                                  grime=0.3, dust=0.2, fade=0.1, seed=24, name='turret_paint'),
        'screen': M.plastic(color=(0.008, 0.01, 0.014), roughness=0.08, grain=0.0, scuffs=0.05,
                            seed=25, name='screen_black'),
        'seat': M.fabric(color=(0.045, 0.055, 0.07), seed=26, name='seat_fabric'),
        'floor': M.rubber(seed=27, name='floor_rubber'),
        'panel': M.plastic(color=(0.035, 0.035, 0.04), roughness=0.65, seed=28,
                           name='panel_plastic'),
        'lamp_head': lamp(color=(1.0, 0.93, 0.82), strength=8.0, seed=30, name='lamp_head'),
        'lamp_nav_red': lamp(color=(1.0, 0.06, 0.04), strength=5.0, seed=31, name='lamp_nav_red'),
        'lamp_nav_green': lamp(color=(0.08, 1.0, 0.3), strength=5.0, seed=32,
                               name='lamp_nav_green'),
        'lamp_tail': lamp(color=(1.0, 0.08, 0.05), strength=6.0, seed=33, name='lamp_tail'),
        'lamp_siren_a': lamp(color=(1.0, 0.05, 0.04), strength=10.0, seed=34,
                             name='lamp_siren_a'),
        'lamp_siren_b': lamp(color=(0.06, 0.25, 1.0), strength=10.0, seed=35,
                             name='lamp_siren_b'),
        'lamp_searchlight': lamp(color=(1.0, 0.96, 0.88), strength=14.0, seed=36,
                                 name='lamp_searchlight'),
    }


def _on_side(centre, normal):
    return abs(normal.x) > 0.3


def _pod_material(centre, normal):
    """Index into [paint, secondary, accent, glass] for a face of the pod."""
    rel = H.rel_height(POD, centre)
    y, side = centre.y, abs(centre.x)
    if y < 3.38:
        windscreen = y > 2.24 and 0.46 < rel < 0.995 and side > 0.07
        chin = 2.62 < y < 3.30 and 0.14 < rel < 0.36 and side > 0.06
        door_window = DOOR_Y[0] + 0.1 < y < DOOR_Y[1] - 0.1 and 0.52 < rel < 0.91 and _on_side(
            centre, normal)
        cabin_window = -0.85 < y < 0.75 and 0.52 < rel < 0.91 and _on_side(centre, normal)
        if windscreen or chin or door_window or cabin_window:
            return 3
    if 0.36 < rel < 0.40:
        return 2
    if rel < 0.36:
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
    extra = (DOOR_Y[0], DOOR_Y[0] + 0.1, DOOR_Y[1] - 0.1, DOOR_Y[1], 2.24, -0.85, 0.75, 2.62,
             3.30, 3.38)
    pod = H.pod('pod', POD, step=0.21, extra=extra)
    H.assign(pod, [mats['paint'], mats['secondary'], mats['accent'], mats['glass']],
             _pod_material)
    doors = {}
    for name, sign in (('door_fl', -1.0), ('door_fr', 1.0)):
        door = H.split(pod, name, _door_test(sign))
        modify.solidify(door, thickness=0.03, offset=-1.0)
        half, bottom, top, _exponent = H.station(POD, DOOR_Y[1])
        hinge = (sign * half * 0.99, DOOR_Y[1], bottom + 0.5 * (top - bottom))
        handle = H.box(name + '_handle', (0.02, 0.16, 0.035),
                       (sign * (H.station(POD, 1.35)[0] + 0.012), 1.35,
                        H.station(POD, 1.35)[1] + 0.47 * (H.station(POD, 1.35)[2]
                                                         - H.station(POD, 1.35)[1])),
                       mats['trim'])
        door = scene.join([door, handle], name)
        scene.set_origin(door, hinge)
        doors[name] = door
    modify.solidify(pod, thickness=0.025, offset=-1.0)
    return pod, doors


def exterior(mats):
    """Everything fixed outside the pod."""
    parts = []
    cowl = H.pod('cowl', COWL, step=0.22)
    parts.append(H.mat(cowl, mats['paint']))
    boom = H.round_boom('boom', BOOM, segments=16, step=0.5)
    H.assign(boom, [mats['paint'], mats['secondary']],
             lambda centre, normal: 1 if normal.z < -0.02 else 0)
    parts.append(boom)
    # Mast fairing, intakes, exhausts.
    fairing = H.build_lathe('mast_fairing', [(0.36, 2.55), (0.33, 2.72), (0.24, 2.86),
                                             (0.15, 2.94), (0.10, 2.96)], mats['trim'])
    parts.append(fairing)
    for sign in (-1.0, 1.0):
        half = H.station(COWL, 0.45)[0]
        intake = H.axis_cylinder('intake', 0.12, 0.05, (sign * (half - 0.005), 0.45, 2.42), 'X',
                                 mats['grille'], segments=16)
        modify.transform(intake, location=(0.0, -0.45, -2.42))
        modify.transform(intake, scale=(1.0, 1.6, 1.0))
        modify.transform(intake, location=(0.0, 0.45, 2.42))
        lip = H.axis_cylinder('intake_lip', 0.135, 0.03, (sign * (half + 0.01), 0.45, 2.42), 'X',
                              mats['trim'], segments=16, caps=False)
        modify.transform(lip, location=(0.0, -0.45, -2.42))
        modify.transform(lip, scale=(1.0, 1.6, 1.0))
        modify.transform(lip, location=(0.0, 0.45, 2.42))
        pipe = H.build_tube('exhaust', [(sign * 0.26, -1.55, 2.40), (sign * 0.33, -1.95, 2.50),
                                        (sign * 0.42, -2.25, 2.58)], 0.085, mats['exhaust'])
        parts += [intake, lip, pipe]
    # Tail: horizontal stabiliser with end plates, fin, fenestron shroud, stator, bumper.
    parts.append(H.mat(H.wing('stabiliser', [(-1.0, 0.42, 0.11, -5.12, 1.89),
                                             (-0.25, 0.50, 0.12, -5.10, 1.89),
                                             (0.25, 0.50, 0.12, -5.10, 1.89),
                                             (1.0, 0.42, 0.11, -5.12, 1.89)], axis='X'),
                       mats['paint']))
    for sign in (-1.0, 1.0):
        parts.append(H.mat(H.wing('end_plate', [(1.70, 0.40, 0.10, -5.10, sign * 1.01),
                                               (2.16, 0.30, 0.10, -5.18, sign * 1.01)],
                                  axis='Z'), mats['secondary']))
    shroud = H.build_lathe('shroud', [(TAIL_R + 0.02, -0.17), (0.62, -0.12), (0.66, 0.0),
                                      (0.62, 0.12), (TAIL_R + 0.02, 0.17),
                                      (TAIL_R + 0.02, -0.17)], mats['secondary'], segments=32)
    modify.transform(shroud, rotation=(0.0, 0.5 * math.pi, 0.0))
    modify.transform(shroud, location=TAIL_HUB)
    shading.recalc_normals(shroud)
    parts.append(shroud)
    parts.append(H.mat(H.wing('fin', [(2.45, 1.10, 0.10, -6.08, 0.0),
                                      (2.85, 0.86, 0.10, -6.42, 0.0),
                                      (3.20, 0.58, 0.09, -6.80, 0.0)], axis='Z'),
                       mats['paint']))
    parts.append(H.mat(H.wing('ventral', [(1.05, 0.45, 0.10, -6.40, 0.0),
                                          (1.45, 0.75, 0.10, -6.20, 0.0)], axis='Z'),
                       mats['secondary']))
    stator = [H.axis_cylinder('gearbox', 0.10, 0.16, (0.14, TAIL_HUB[1], TAIL_HUB[2]), 'X',
                              mats['hub'], segments=14)]
    for angle in (0.6, 2.5, 4.4):
        vane = H.box('vane', (0.012, 0.05, TAIL_R - 0.08), (0.0, 0.0, 0.08 + 0.5 * (TAIL_R - 0.08)),
                     mats['hub'])
        modify.transform(vane, rotation=(angle, 0.0, 0.0))
        modify.transform(vane, location=(0.12, TAIL_HUB[1], TAIL_HUB[2]))
        stator.append(vane)
    parts += stator
    # Skids on arched cross tubes.
    for sign in (-1.0, 1.0):
        x = sign * 1.12
        parts.append(H.build_tube('skid', H.smooth([(x, -1.75, 0.045), (x, 1.50, 0.045),
                                                    (x, 1.95, 0.075), (x, 2.20, 0.20),
                                                    (x, 2.30, 0.36)], 2), 0.045, mats['skid'],
                                  segments=8))
        parts.append(H.box('skid_shoe', (0.05, 0.30, 0.012), (x, -1.4, 0.006), mats['hub']))
        parts.append(H.box('step', (0.16, 0.34, 0.025), (sign * 0.98, 1.62, 0.40), mats['grille'],
                           bevel=0.006))
        parts.append(H.rod('step_strut', (sign * 0.98, 1.62, 0.39), (sign * 0.92, 1.30, 0.50),
                           0.015, mats['skid'], segments=6))
    for y in (1.30, -0.95):
        belly = H.station(POD, y)[1] + 0.03
        arch = [(1.12, y, 0.05), (1.07, y, 0.30), (0.93, y, 0.47), (0.66, y, belly + 0.02),
                (0.30, y, belly)]
        path = arch + [(-p[0], p[1], p[2]) for p in reversed(arch)]
        parts.append(H.build_tube('cross', H.smooth(path, 2), 0.048, mats['skid'], segments=8))
    # Under the nose: sensor ball (left), searchlight mount (right), landing light.
    belly = H.station(POD, 2.80)[1]
    parts.append(H.axis_cylinder('turret_mount', 0.07, belly - 0.50 + 0.04,
                                 (-0.40, 2.80, 0.5 * (belly + 0.50)), 'Z', mats['housing'], 12))
    parts.append(H.dome('turret_ball', 0.17, (-0.40, 2.80, 0.40), mats['turret'], segments=18,
                        rings=10))
    parts.append(H.axis_cylinder('turret_window', 0.09, 0.03, (-0.40, 2.955, 0.40), 'Y',
                                 mats['screen'], segments=14))
    parts.append(H.axis_cylinder('searchlight_mount', 0.045, belly - SEARCHLIGHT.z - 0.18 + 0.04,
                                 (SEARCHLIGHT.x, SEARCHLIGHT.y,
                                  0.5 * (belly + SEARCHLIGHT.z + 0.18)), 'Z', mats['housing'], 10))
    parts.append(H.lamp_unit('landing_light', 0.07, (0.0, 3.05, H.station(POD, 3.05)[1] + 0.03),
                             (math.radians(-40.0), 0.0, 0.0), mats, mats['lamp_head']))
    # Lights: sirens (red left, blue right) under the belly and on the roof, nav lights,
    # anti-collision beacons on the cowling and the fin.
    for sign, lamp in ((-1.0, 'lamp_siren_a'), (1.0, 'lamp_siren_b')):
        parts.append(H.dome('siren_belly', 0.055, (sign * 0.50, -0.40, 0.49), mats[lamp],
                            scale=(1.0, 2.6, 0.8)))
        parts.append(H.box('siren_belly_base', (0.12, 0.34, 0.03), (sign * 0.50, -0.40, 0.515),
                           mats['trim']))
        roof = H.station(POD, 1.15)[2]
        parts.append(H.dome('siren_roof', 0.05, (sign * 0.42, 1.15, roof + 0.005), mats[lamp],
                            scale=(1.0, 2.4, 0.9)))
    parts.append(H.dome('nav_red', 0.035, (-1.045, -5.24, 1.96), mats['lamp_nav_red']))
    parts.append(H.dome('nav_green', 0.035, (1.045, -5.24, 1.96), mats['lamp_nav_green']))
    parts.append(H.dome('beacon_cowl', 0.045, (0.0, -1.55, 2.60), mats['lamp_tail'],
                        scale=(1.0, 1.0, 1.3)))
    parts.append(H.dome('beacon_fin', 0.04, (0.0, -7.05, 3.215), mats['lamp_tail'],
                        scale=(1.0, 1.3, 1.2)))
    # Antennas, loudspeaker, sliding-door rails.
    parts.append(H.box('antenna_belly', (0.012, 0.16, 0.20), (0.0, -1.35, 0.50), mats['trim'],
                       rotation=(math.radians(-20.0), 0.0, 0.0)))
    parts.append(H.box('antenna_boom', (0.012, 0.14, 0.18), (0.0, -3.6, 2.16), mats['trim'],
                       rotation=(math.radians(-25.0), 0.0, 0.0)))
    parts.append(H.box('loudspeaker', (0.34, 0.26, 0.14), (0.0, 0.35, 0.42), mats['housing'],
                       bevel=0.02))
    parts.append(H.box('loudspeaker_grille', (0.30, 0.012, 0.11), (0.0, 0.48, 0.42),
                       mats['grille']))
    for sign in (-1.0, 1.0):
        rail = []
        for y in (-0.95, -0.4, 0.2, 0.85):
            half, bottom, top, exponent = H.station(POD, y)
            rel = 0.945
            rail.append((sign * (half * H.width_factor(rel, exponent) + 0.012), y,
                         bottom + (top - bottom) * rel))
        parts.append(H.build_tube('rail', rail, 0.012, mats['hub'], segments=6))
    return parts


def interior(mats):
    parts = [H.box('floor', (1.36, 3.6, 0.04), (0.0, 0.60, 0.60), mats['floor'])]
    for x in (-SEAT_X, SEAT_X):
        parts += [
            H.box('seat_base', (0.36, 0.40, 0.28), (x, SEAT_Y_FRONT, 0.76), mats['panel']),
            H.box('seat_pan', (0.48, 0.48, 0.09), (x, SEAT_Y_FRONT, 0.93), mats['seat'],
                  bevel=0.02),
            H.box('seat_back', (0.48, 0.09, 0.66), (x, SEAT_Y_FRONT - 0.26, 1.30), mats['seat'],
                  rotation=(math.radians(-12.0), 0.0, 0.0), bevel=0.02),
            H.box('headrest', (0.26, 0.08, 0.16), (x, SEAT_Y_FRONT - 0.34, 1.72), mats['seat'],
                  bevel=0.015),
            H.rod('cyclic', (x, 2.00, 0.62), (x, 1.96, 1.00), 0.016, mats['trim']),
            H.axis_cylinder('cyclic_grip', 0.022, 0.12, (x, 1.96, 1.04), 'Z', mats['panel'], 8),
            H.box('pedal_l', (0.07, 0.12, 0.02), (x - 0.12, 2.42, 0.70), mats['hub'],
                  rotation=(math.radians(50.0), 0.0, 0.0)),
            H.box('pedal_r', (0.07, 0.12, 0.02), (x + 0.12, 2.42, 0.70), mats['hub'],
                  rotation=(math.radians(50.0), 0.0, 0.0)),
        ]
    parts.append(H.rod('collective', (-0.66, 1.35, 0.70), (-0.62, 1.85, 0.88), 0.018,
                       mats['trim']))
    parts += [
        H.box('bench_base', (1.30, 0.40, 0.28), (0.0, SEAT_Y_REAR, 0.74), mats['panel']),
        H.box('bench_pan', (1.30, 0.46, 0.09), (0.0, SEAT_Y_REAR, 0.91), mats['seat'],
              bevel=0.02),
        H.box('bench_back', (1.30, 0.09, 0.66), (0.0, SEAT_Y_REAR - 0.28, 1.28), mats['seat'],
              rotation=(math.radians(-10.0), 0.0, 0.0), bevel=0.02),
        H.box('panel', (1.26, 0.28, 0.32), (0.0, 2.46, 1.20), mats['panel'], bevel=0.02),
        H.box('glareshield', (1.30, 0.36, 0.05), (0.0, 2.44, 1.38), mats['panel'], bevel=0.015),
        H.box('console', (0.26, 0.56, 0.44), (0.0, 2.18, 0.84), mats['panel'], bevel=0.02),
    ]
    for x in (-0.42, 0.0, 0.42):
        parts.append(H.box('screen', (0.22, 0.012, 0.16), (x, 2.316, 1.22), mats['screen']))
    return scene.join(parts, 'interior')


def searchlight(mats):
    """The searchlight node: drum on a yoke, its origin at the gimbal (the drum's centre)."""
    c = SEARCHLIGHT
    parts = [
        H.axis_cylinder('drum', 0.13, 0.30, (0.0, 0.0, 0.0), 'Y', mats['housing'], 20),
        H.axis_cylinder('drum_back', 0.09, 0.07, (0.0, -0.185, 0.0), 'Y', mats['housing'], 20,
                        radius_top=0.13),
        H.axis_cylinder('bezel', 0.142, 0.035, (0.0, 0.158, 0.0), 'Y', mats['chrome'], 20,
                        caps=False),
        H.axis_cylinder('bed', 0.12, 0.01, (0.0, 0.125, 0.0), 'Y', mats['lamp_searchlight'], 20),
        H.axis_cylinder('lens', 0.13, 0.006, (0.0, 0.168, 0.0), 'Y', mats['glass'], 20),
        H.box('yoke_l', (0.022, 0.09, 0.22), (-0.157, 0.0, 0.07), mats['housing'], bevel=0.006),
        H.box('yoke_r', (0.022, 0.09, 0.22), (0.157, 0.0, 0.07), mats['housing'], bevel=0.006),
        H.box('yoke_top', (0.336, 0.09, 0.026), (0.0, 0.0, 0.18), mats['housing'], bevel=0.006),
        H.axis_cylinder('pivot', 0.03, 0.06, (0.0, 0.0, 0.215), 'Z', mats['hub'], 10),
    ]
    for y in (-0.09, -0.02, 0.05):
        parts.append(H.axis_cylinder('fin', 0.138, 0.01, (0.0, y, 0.0), 'Y', mats['housing'], 20))
    obj = scene.join(parts, 'searchlight')
    modify.transform(obj, location=c)
    scene.set_origin(obj, c)
    return obj


def make(a):
    mats = materials()
    spec = {'hub_z': HUB_Z, 'rotor_radius': ROTOR_R, 'blades': 4, 'chord': 0.30, 'droop': 0.16,
            'tail_hub': TAIL_HUB, 'tail_radius': TAIL_R, 'tail_blades': 9,
            'lod1': 2600, 'lod2': 520}
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
    tail, tail_blur = H.fan_rotor(spec, mats)
    parts['rotor_tail'] = a.add(tail, unwrap='smart')
    parts['rotor_tail_blur'] = a.add(tail_blur)
    light = searchlight(mats)
    shading.smooth(light, math.radians(40.0))
    parts['searchlight'] = a.add(light, unwrap='smart')
    H.STATE[a.id] = {
        'parts': parts, 'spec': spec,
        'searchlight_anchor': ((SEARCHLIGHT.x, SEARCHLIGHT.y + 0.17, SEARCHLIGHT.z), (0.0, 1.0, 0.0),
                               {'light': 'spot', 'range': 160.0, 'angle': 9.0,
                                'color': [1.0, 0.96, 0.88]}),
    }

    hip = HIP_Z
    a.add_anchor('anchor_seat_driver', (-SEAT_X, SEAT_Y_FRONT + 0.04, hip), forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_seat_passenger_1', (SEAT_X, SEAT_Y_FRONT + 0.04, hip),
                 forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_seat_passenger_2', (-SEAT_X, SEAT_Y_REAR + 0.04, hip - 0.02),
                 forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_seat_passenger_3', (SEAT_X, SEAT_Y_REAR + 0.04, hip - 0.02),
                 forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_door_driver', (-1.55, 1.55, 0.0), forward=(1.0, 0.0, 0.0))
    a.add_anchor('anchor_camera', (0.0, -0.8, 2.2), forward=(0.0, 1.0, 0.0))
    landing = (0.0, 3.08, H.station(POD, 3.05)[1] + 0.0)
    a.add_anchor('anchor_light_head_l', landing, forward=(0.0, 0.77, -0.64), light='spot',
                 range=60.0, color=[1.0, 0.93, 0.82])
    a.add_anchor('anchor_light_tail_l', (0.0, -7.05, 3.26), forward=(0.0, -1.0, 0.0),
                 color=[1.0, 0.08, 0.05])
    for name, sign in (('anchor_decal_side_l', -1.0), ('anchor_decal_side_r', 1.0)):
        half, bottom, top, exponent = H.station(POD, -0.05)
        rel = 0.27
        a.add_anchor(name, (sign * half * H.width_factor(rel, exponent), -0.05,
                            bottom + (top - bottom) * rel),
                     forward=(sign, 0.0, 0.0), width=1.7, height=0.32)
    a.collider_box('cabin', (0.0, 0.65, 1.30), (1.66, 6.0, 1.84))
    a.collider_box('tail', (0.0, -4.75, 2.05), (0.70, 5.0, 2.4))
    a.collider_cylinder('rotor', (0.0, 0.0, HUB_Z), ROTOR_R, 0.30)
    a.set_extra('rotor_radius', ROTOR_R)
    a.set_extra('rotor_hub_height', HUB_Z)
    a.set_extra('tail_rotor_radius', TAIL_R)
    a.set_extra('skid_height', 0.47)
    a.set_extra('skid_track', 2.24)
    a.set_extra('seats', 4)
    a.set_lod_distances(45.0, 120.0)
    a.bake(size=1024, orm_size=512, normal_size=512, occlusion_distance=0.6,
           material_texels={'seat_fabric': 0.35, 'floor_rubber': 0.2, 'panel_plastic': 0.4,
                            'blade_paint': 0.35, 'skid_metal': 0.6, 'hub_metal': 0.7,
                            'screen_black': 0.3})


def assemble(a):
    H.assemble_helicopter(a)
