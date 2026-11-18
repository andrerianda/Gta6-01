"""SWAT van (catalogue: Brazo Baluarte, the Unidad Tactica's armoured van): the armoured police
van that arrives with lights flashing when the player causes serious trouble.

6.66 m over the ram bumper, 2.46 m wide over the slab sides (2.62 m over the running boards and
mirrors), 2.75 m high over the light bar, on a 3.92 m wheelbase with big 0.48 m wheels on a
1.98 m track. One armoured hull with chamfered edges: a short raised bonnet over a black grille
and a steel ram bumper, a near-upright windscreen with only a slit of glass behind a bar guard,
small armoured windows in the cab doors and the rear body, a livery band (paint_secondary),
running boards with tread plate, grab rails, rear double doors with slit windows, a flat light
bar at the front of the roof, a roof hatch and roof rails.

Built with the trucks helpers (_grid.loft for the hull with arches cut, the shared fittings and
_truck.make_truck / assemble_truck). Nodes: lod0..2, wheel_fl/fr/rl/rr, door_fl/fr (cab doors
with mirrors), door_rear_l/r (hinged at the outer edges), hood, bumper_f, bumper_r,
steering_wheel, window_front (the windscreen slit), window_rear (the pass-through pane in the
cab bulkhead), window_l/r (the rear body's slit windows).

Budget: the node contract (19 nodes, 12 game materials with both siren groups) needs more draw
calls at level 0 than the default vehicle budget: 48 draws; triangles 20,000. Bytes 680,000: the
geometry is stored without compression (about 590 kB of the 637 kB); the brief's 520 kB needs
lod0 nearer 12,000 triangles (next step).

Blender axes: Z up, the vehicle faces +Y, right side +X, origin on the ground at the centre of
the wheelbase.
"""
import math

import _grid as G
import _truck as T

ASSET = {
    'id': 'swat_van',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 20000, 'draws': 48, 'bytes': 680000},
}

AXLE_F, AXLE_R, RADIUS, TRACK = 1.96, -1.96, 0.48, 1.98
W, REAR, TOP = 1.23, -3.40, 2.66
DOOR = (0.42, 1.34)
SIDE_WINDOW = (-1.25, -0.55, 2.08, 2.30)
BAND = (1.30, 1.62)


def _keys():
    rows = [(REAR, W, TOP, 0.14), (-1.25, W, TOP, 0.14), (-0.55, W, TOP, 0.14), (DOOR[0], W, TOP, 0.14),
            (DOOR[1], W, TOP, 0.14), (1.62, W, TOP, 0.14), (1.72, W, 2.56, 0.12), (1.759, 1.225, 2.42, 0.12),
            (1.936, 1.205, 1.78, 0.10), (1.98, 1.20, 1.62, 0.10),
            (2.40, 1.12, 1.52, 0.10), (2.95, 1.05, 1.42, 0.10), (3.05, 1.00, 1.36, 0.09)]
    return [{'y': y, 'w': w, 'zb': 0.55, 'zt': zt, 'rt': rt, 'rb': 0.05} for y, w, zt, rt in rows]


def _assign(f):
    if f.n.y < -0.9:
        return ('lod0', 'liner', 2)
    if 1.75 <= f.y <= 1.94 and f.n.y > 0.5 and abs(f.x) < f.w - f.rt - 0.05:
        return ('window_front', 'glass', 2)
    if f.n.y > 0.9:
        return ('lod0', 'paint', 2)
    if f.z < 0.6 and f.n.z < -0.5:
        return ('lod0', 'liner', 2)
    if f.on_top(0.0) and f.y >= 2.02:
        return ('hood', 'paint', 2)
    if f.on_side():
        band = BAND[0] <= f.z <= BAND[1]
        if DOOR[0] <= f.y <= DOOR[1] and f.z >= 0.62:
            door = 'door_fr' if f.x > 0 else 'door_fl'
            if 1.78 <= f.z <= 2.30 and DOOR[0] + 0.12 <= f.y <= DOOR[1] - 0.1:
                return (door, 'glass', 2)
            return (door, 'paint_secondary' if band else 'paint', 2)
        y0, y1, z0, z1 = SIDE_WINDOW
        if f.inside(y0, y1, z0, z1):
            return ('window_r' if f.x > 0 else 'window_l', 'glass', 2)
        if band:
            return ('lod0', 'paint_secondary', 2)
    return ('lod0', 'paint', 2)


def _rear_door(name, side, mats):
    """One armoured rear door, hinged at the outer edge, with a slit window and the band."""
    x0, x1 = (0.006, 1.04) if side > 0 else (-1.04, -0.006)
    z0, y0 = 0.70, REAR - 0.045
    width = x1 - x0

    def outer(u, v):
        inner_u = u if side < 0 else width - u
        if 1.38 <= v <= 1.62 and 0.18 * width <= inner_u <= 0.82 * width:
            return 'glass'
        if BAND[0] - z0 <= v <= BAND[1] - z0:
            return 'paint_secondary'
        return 'paint'

    mesh = G.Mesh()
    mesh.block((x0, y0, z0), (x1, REAR - 0.004, 2.45), {'-y': outer, '+y': 'liner', '*': 'paint'}, 2, step=0.2)
    out = [mesh.to_object(name, mats)]
    for z in (0.95, 1.6, 2.25):
        out.append(T.box(f'{name}_hinge{z}', (0.06, 0.035, 0.12), (side * 1.04, y0 - 0.014, z), 'chassis', mats,
                         0, 0.008))
    out.append(T.box(f'{name}_handle', (0.035, 0.035, 0.26), (side * 0.14, y0 - 0.017, 1.45), 'chassis', mats,
                     0, 0.008))
    return out


def make(a):
    spec = {'color': '#2B3A42', 'secondary_color': '#1D4E7A', 'sirens': True, 'wheel_color': '#3A3D40',
            'axle_f': AXLE_F, 'axle_r': AXLE_R, 'wheel_radius': RADIUS, 'tyre_width': 0.32,
            'track': TRACK, 'rim_ratio': 0.55, 'seats': 8, 'lod1': 4800, 'lod2': 1200,
            'steering': {'hub': (-0.55, 1.34, 1.62), 'tilt': 40.0, 'radius': 0.21}}
    mats = T.materials(spec)
    arches = [(AXLE_F, RADIUS, 0.58, 0.40), (AXLE_R, RADIUS, 0.58, 0.40)]
    hull = {name: mesh.to_object(f'hull_{name}', mats) for name, mesh in
            G.loft(_keys(), _assign, levels=(0.80, 1.05, BAND[0], BAND[1], 1.78, 2.08, 2.30, 2.45),
                   arches=arches, step=0.28, level_step=0.4, n_arc=1, n_top=5).items()}

    wells = G.Mesh()
    for side in (-1.0, 1.0):
        for y in (AXLE_F, AXLE_R):
            G.arch_liner(wells, y, RADIUS, 0.58, side * W, 0.40, 'liner', flare=(0.07, 0.03, 'trim'))
    inside = G.Mesh()
    inside.block((-1.18, 0.15, 0.80), (1.18, 1.60, 2.60), 'liner', 1, step=0.6, inward=True, skip=('+y',))
    inside.block((-1.18, REAR + 0.03, 0.80), (1.18, 0.10, 2.60), 'liner', 1, step=0.6, inward=True)
    lod0 = [hull['lod0'], wells.to_object('wells', mats), inside.to_object('inside', mats)]

    # Interior: dashboard, two cab seats, benches along both walls of the rear.
    lod0.append(T.rounded_block('dash', (-1.15, 1.48, 1.05), (1.15, 1.95, 1.55), 'trim', mats, 0.05, 0.4, 1))
    for side in (-1.0, 1.0):
        lod0 += T.seat(f'seat{side}', side * 0.55, 0.85, 0.80, mats, width=0.52)
        lod0.append(T.rounded_block(f'bench{side}', (min(side * 0.75, side * 1.15), -3.0, 0.80),
                                    (max(side * 0.75, side * 1.15), -0.4, 1.25), 'seat', mats, 0.04, 0.6, 1))

    # Nose: grille with vertical bars, headlamps, windscreen guard.
    lod0.append(T.rounded_block('grille', (-0.62, 3.03, 0.75), (0.62, 3.08, 1.25), 'grille', mats, 0.015, 0.3, 2))
    for n in range(9):
        x = -0.52 + 1.04 * n / 8
        lod0.append(T.box(f'grille_bar{n}', (0.025, 0.02, 0.46), (x, 3.085, 1.0), 'chassis', mats, 0, 0.005))
    lod0 += T.lamp_unit('head_l', (-0.82, 3.05, 1.02), 0.3, 0.22, 1.0,
                        [(0.0, 0.3, 'lamp_indicator_l'), (0.3, 1.0, 'lamp_head')], mats)
    lod0 += T.lamp_unit('head_r', (0.82, 3.05, 1.02), 0.3, 0.22, 1.0,
                        [(0.0, 0.7, 'lamp_head'), (0.7, 1.0, 'lamp_indicator_r')], mats)
    slope = (-0.26, 0.94)
    length = math.hypot(*slope)
    normal = (slope[1] / length, -slope[0] / length)
    for t in (0.3, 0.5, 0.7):
        y = 1.98 + slope[0] * t + 0.05 * normal[0]
        z = 1.62 + slope[1] * t + 0.05 * normal[1]
        lod0.append(T.rail(f'guard{t}', [(-1.0, y, z), (1.0, y, z)], mats, 0.012, 'chassis', 1))
    for x in (-0.66, 0.0, 0.66):
        lod0.append(T.rail(f'guard_v{x}', [(x, 1.98 + slope[0] * 0.15 + 0.05 * normal[0], 1.62 + slope[1] * 0.15
                                            + 0.05 * normal[1]),
                                           (x, 1.98 + slope[0] * 0.85 + 0.05 * normal[0], 1.62 + slope[1] * 0.85
                                            + 0.05 * normal[1])], mats, 0.012, 'chassis', 1))

    # Sides: running boards, grab rails; roof: light bar, hatch, rails; rear: lamps, flashers.
    for side in (-1.0, 1.0):
        lo, hi = sorted((side * (W - 0.02), side * (W + 0.13)))
        lod0.append(T.rounded_block(f'board{side}', (lo, -1.30, 0.46), (hi, 1.30, 0.54), 'chassis', mats, 0.015,
                                    0.4, 2))
        lod0.append(T.box(f'board_plate{side}', (0.14, 2.56, 0.01), (side * (W + 0.055), 0.0, 0.545), 'tread',
                          mats, 1))
        x = side * (W + 0.05)
        lod0.append(T.rail(f'rail_cab{side}', [(side * W, 0.30, 1.0), (x, 0.30, 1.04), (x, 0.30, 2.0),
                                               (side * W, 0.30, 2.04)], mats, 0.017, 'chrome'))
        lod0.append(T.rail(f'rail_side{side}', [(side * W, -3.1, 1.9), (x, -3.06, 1.9), (x, -0.35, 1.9),
                                                (side * W, -0.31, 1.9)], mats, 0.017, 'chrome'))
        lod0.append(T.rail(f'roof_rail{side}', [(side * 0.95, -3.0, TOP), (side * 0.95, -2.9, TOP + 0.1),
                                                (side * 0.95, 0.6, TOP + 0.1), (side * 0.95, 0.7, TOP)],
                           mats, 0.02, 'chassis'))
        lod0.append(T.rail(f'rail_rear{side}', [(side * 1.13, REAR, 1.0), (side * 1.13, REAR - 0.05, 1.04),
                                                (side * 1.13, REAR - 0.05, 2.1), (side * 1.13, REAR, 2.14)],
                           mats, 0.017, 'chrome'))
        cells = [(0.0, 0.2, 'lamp_reverse'), (0.2, 0.46, 'lamp_brake'), (0.46, 0.72, 'lamp_tail'),
                 (0.72, 1.0, 'lamp_indicator_l' if side < 0 else 'lamp_indicator_r')]
        lod0 += T.lamp_unit(f'tail{side}', (side * 1.135, REAR, 0.98), 0.14, 0.5, -1.0, cells, mats, axis='z')
        siren = 'lamp_siren_a' if side < 0 else 'lamp_siren_b'
        lod0 += T.lamp_unit(f'flash_rear{side}', (side * 1.10, REAR, 2.48), 0.2, 0.12, -1.0, [(0.0, 1.0, siren)],
                            mats)
        lod0.append(T.box(f'flash_side{side}', (0.03, 0.22, 0.1), (side * (W + 0.012), 1.2, 2.45), siren, mats, 2,
                          0.01))
    lod0 += T.light_bar('bar', (0.0, 1.30, TOP), 1.7, mats, depth=0.28, height=0.09)
    lod0.append(T.rounded_block('hatch', (-0.42, -1.62, TOP), (0.42, -0.78, TOP + 0.07), 'paint', mats, 0.02,
                                0.3, 2))
    lod0.append(T.rounded_block('hatch_hinge', (-0.3, -1.66, TOP + 0.02), (0.3, -1.6, TOP + 0.08), 'chassis',
                                mats, 0.01, 0.3, 0))
    lod0 += T.chassis(spec, mats, REAR + 0.3, 2.8, 0.62, frame_x=0.5)
    lod0 += T.exhaust(spec, mats, 0.85, -2.95, 0.42)

    for name, side in (('door_fl', -1.0), ('door_fr', 1.0)):
        hull[name] = [T.door_panel(hull[name], thickness=0.05)]
        hull[name] += T.van_mirror(f'{name}_mirror', side, (side * W, 1.24, 1.82), mats, reach=0.2, height=0.3)
        hull[name].append(T.box(f'{name}_handle', (0.03, 0.18, 0.04), (side * (W + 0.014), 0.52, 1.55),
                                'chassis', mats, 0, 0.008))
    hood = T.lid_panel(hull['hood'])

    bumper_f = [T.rounded_block('ram', (-1.10, 3.02, 0.44), (1.10, 3.20, 0.80), 'chassis', mats, 0.03, 0.35, 2)]
    for x in (-0.55, 0.55):
        bumper_f.append(T.rounded_block(f'ram_post{x}', (x - 0.05, 3.10, 0.80), (x + 0.05, 3.22, 1.32), 'chassis',
                                        mats, 0.015, 0.3, 1))
    bumper_f += T.plate_recess('plate_f', (0.0, 3.20, 0.62), 1.0, mats)
    bumper_f += T.lamp_unit('flash_fl', (-0.78, 3.20, 0.62), 0.2, 0.09, 1.0, [(0.0, 1.0, 'lamp_siren_a')], mats)
    bumper_f += T.lamp_unit('flash_fr', (0.78, 3.20, 0.62), 0.2, 0.09, 1.0, [(0.0, 1.0, 'lamp_siren_b')], mats)
    bumper_r = [T.rounded_block('bumper_r_body', (-1.10, REAR - 0.16, 0.44), (1.10, REAR, 0.66), 'chassis', mats,
                                0.02, 0.35, 2),
                T.box('step_plate', (2.1, 0.15, 0.012), (0.0, REAR - 0.08, 0.666), 'tread', mats, 1)]
    bumper_r += T.plate_recess('plate_r', (0.0, REAR - 0.16, 0.55), -1.0, mats)

    pass_through = G.Mesh()
    pass_through.panel((0.35, 0.14, 1.75), (-1, 0, 0), (0, 0, 1), 0.7, 0.35, 'glass', 2)

    parts = {'lod0': lod0, 'hood': [hood], 'door_fl': hull['door_fl'], 'door_fr': hull['door_fr'],
             'window_front': [hull['window_front']], 'window_l': [hull['window_l']],
             'window_r': [hull['window_r']], 'window_rear': [pass_through.to_object('pass', mats)],
             'bumper_f': bumper_f, 'bumper_r': bumper_r,
             'door_rear_l': _rear_door('door_rear_l_slab', -1.0, mats),
             'door_rear_r': _rear_door('door_rear_r_slab', 1.0, mats)}
    spec['origins'] = {'hood': (0.0, 2.02, 1.6), 'door_fl': (-W, DOOR[1], 1.5), 'door_fr': (W, DOOR[1], 1.5),
                       'door_rear_l': (-1.04, REAR - 0.025, 1.6), 'door_rear_r': (1.04, REAR - 0.025, 1.6),
                       'bumper_f': (0.0, 3.11, 0.62), 'bumper_r': (0.0, REAR - 0.08, 0.55),
                       'window_front': (0.0, 1.85, 2.1), 'window_rear': (0.0, 0.14, 1.92),
                       'window_l': (-W, -0.9, 2.19), 'window_r': (W, -0.9, 2.19)}
    fwd, back, left, right = (0, 1, 0), (0, -1, 0), (-1, 0, 0), (1, 0, 0)
    spec['anchors'] = [
        ('anchor_seat_driver', (-0.55, 0.85, 1.13), fwd, {}),
        ('anchor_seat_passenger_1', (0.55, 0.85, 1.13), fwd, {}),
        ('anchor_seat_passenger_2', (-0.95, -1.5, 1.25), right, {}),
        ('anchor_seat_passenger_3', (0.95, -1.5, 1.25), left, {}),
        ('anchor_door_driver', (-W - 0.6, 0.88, 0.0), right, {}),
        ('anchor_door_passenger', (W + 0.6, 0.88, 0.0), left, {}),
        ('anchor_door_rear', (0.0, REAR - 1.0, 0.0), fwd, {}),
        ('anchor_cargo', (0.0, -1.7, 0.80), fwd, {}),
        ('anchor_light_head_l', (-0.82, 3.07, 1.02), fwd, {}),
        ('anchor_light_head_r', (0.82, 3.07, 1.02), fwd, {}),
        ('anchor_light_tail_l', (-1.135, REAR - 0.02, 0.98), back, {}),
        ('anchor_light_tail_r', (1.135, REAR - 0.02, 0.98), back, {}),
        ('anchor_exhaust_1', (0.85, -2.96, 0.42), back, {}),
        ('anchor_camera', (0.0, -0.5, 2.8), fwd, {}),
        ('anchor_plate_f', (0.0, 3.206, 0.62), fwd, {}),
        ('anchor_plate_r', (0.0, REAR - 0.166, 0.55), back, {}),
        ('anchor_decal_side_l', (-W - 0.004, -1.9, 1.05), left, {'width': 2.4, 'height': 0.5}),
        ('anchor_decal_side_r', (W + 0.004, -1.9, 1.05), right, {'width': 2.4, 'height': 0.5}),
        ('anchor_siren', (0.0, 1.30, TOP + 0.09), fwd, {}),
    ]
    spec['colliders'] = [('body', (0.0, -0.88, 1.57), (2.46, 5.2, 2.36)),
                         ('nose', (0.0, 2.46, 1.0), (2.3, 1.48, 1.2))]
    T.make_truck(a, spec, parts, mats)


def assemble(a):
    T.assemble_truck(a)
