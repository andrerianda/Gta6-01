"""Ambulance (catalogue: Brazo Auxilio, Marazul Fire and Rescue): a box-body ambulance on a van
cab, the emergency vehicle that arrives with lights flashing.

6.38 m over the bumpers, 2.26 m wide over the box (2.0 m over the cab), 2.77 m high over the
corner beacons, on a 3.76 m wheelbase with 0.38 m wheels on a 1.74 m track. A van cab with a
short sloping bonnet, a big raked windscreen, a black grille between rectangular headlamps and a
black wraparound bumper; behind it the wide squared patient box with a livery band
(paint_secondary), side windows, locker outlines and a kerb-side entry door, rear double doors
with windows above a tread-plate step, tall rear lamp clusters on the corner posts, a light bar on
the cab roof, four corner beacons, side flashers and an air-conditioning pod on the box roof.

Built with the trucks helpers: two hull lofts (_grid.loft: cab and box, evenly tessellated, arches
cut), the shared fittings and the contract (_truck.make_truck / assemble_truck). Nodes: lod0..2,
wheel_fl/fr/rl/rr, door_fl/fr (cab doors, mirrors on them), door_rear_l/r (hinged at the outer
edges), hood, bumper_f, bumper_r, steering_wheel, window_front, window_rear (the pass-through
pane in the cab's back wall), window_l/r (the box's side windows).

Budget: the node contract (19 nodes, 12 game materials with both siren groups) needs more draw
calls at level 0 than the default vehicle budget: 48 draws; triangles 20,000. Bytes 680,000: the
geometry is stored without compression (about 590 kB of the 622 kB); the brief's 520 kB needs
lod0 nearer 12,000 triangles (next step).

Blender axes: Z up, the vehicle faces +Y, right side +X, origin on the ground at the centre of
the wheelbase.
"""
import _grid as G
import _truck as T

ASSET = {
    'id': 'ambulance',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 20000, 'draws': 48, 'bytes': 680000},
}

AXLE_F, AXLE_R, RADIUS, TRACK = 1.88, -1.88, 0.38, 1.74
CAB_W, BOX_W, BOX_REAR, BOX_FRONT, BOX_TOP = 1.0, 1.13, -3.26, 0.06, 2.64
DOOR = (0.22, 1.36)          # cab door, rear and front edge
SIDE_WINDOW = (-0.90, -0.40, 1.55, 2.10)


def _cab_keys():
    rows = [(0.12, 2.28, 0.16), (0.22, 2.28, 0.16), (1.10, 2.28, 0.16), (1.25, 2.25, 0.16),
            (1.36, 2.17, 0.16), (1.60, 1.93, 0.16), (1.85, 1.66, 0.16), (2.10, 1.40, 0.16),
            (2.28, 1.22, 0.16), (2.55, 1.15, 0.17), (2.75, 1.08, 0.18), (2.86, 1.00, 0.16)]
    widths = {2.55: 0.99, 2.75: 0.96, 2.86: 0.90}
    return [{'y': y, 'w': widths.get(y, CAB_W), 'zb': 0.42, 'zt': zt, 'rt': rt, 'rb': 0.08}
            for y, zt, rt in rows]


def _cab_assign(f):
    if f.n.y > 0.9:
        return ('lod0', 'paint', 2)
    if f.n.y < -0.9:
        return ('lod0', 'paint', 2)
    if f.z < 0.5:
        return ('lod0', 'trim', 2)
    if f.on_top(0.03) and 1.30 <= f.y <= 2.26:
        return ('window_front', 'glass', 2)
    if f.on_top(0.0) and f.y >= 2.30:
        return ('hood', 'paint', 2)
    if f.on_side() and DOOR[0] <= f.y <= DOOR[1]:
        door = 'door_fr' if f.x > 0 else 'door_fl'
        if 1.30 < f.z < 2.04 and f.y > DOOR[0] + 0.08:
            return (door, 'glass', 2)
        return (door, 'paint', 2)
    return ('lod0', 'paint', 2)


def _box_assign(f):
    if f.n.y < -0.9:                      # rear wall: painted corner posts round the doors
        return ('lod0', 'paint', 2)
    if f.n.y > 0.9:
        return ('lod0', 'paint', 2)
    if f.z < 0.5 and f.n.z < -0.5:
        return ('lod0', 'liner', 2)
    if f.on_side():
        y0, y1, z0, z1 = SIDE_WINDOW
        if f.inside(y0, y1, z0, z1):
            return ('window_r' if f.x > 0 else 'window_l', 'glass', 2)
        if 0.92 <= f.z <= 1.22:
            return ('lod0', 'paint_secondary', 2)
    return ('lod0', 'paint', 2)


def _outline(name, side, y0, y1, z0, z1, mats):
    """A locker or door outline on the box side: four thin dark strips and a chrome handle."""
    x = side * (BOX_W + 0.002)
    out = [T.box(f'{name}_t', (0.006, y1 - y0, 0.014), (x, 0.5 * (y0 + y1), z1), 'trim', mats, 0),
           T.box(f'{name}_b', (0.006, y1 - y0, 0.014), (x, 0.5 * (y0 + y1), z0), 'trim', mats, 0),
           T.box(f'{name}_f', (0.006, 0.014, z1 - z0), (x, y1, 0.5 * (z0 + z1)), 'trim', mats, 0),
           T.box(f'{name}_r', (0.006, 0.014, z1 - z0), (x, y0, 0.5 * (z0 + z1)), 'trim', mats, 0),
           T.box(f'{name}_h', (0.02, 0.16, 0.04), (side * (BOX_W + 0.01), y1 - 0.12, 0.5 * (z0 + z1)),
                 'chrome', mats, 0, 0.006)]
    return out


def _rear_door(name, side, mats):
    """One rear door slab, hinged at the outer edge, with a window and the livery band."""
    x0, x1 = (0.006, 0.95) if side > 0 else (-0.95, -0.006)
    z0, y0 = 0.52, BOX_REAR - 0.045
    width = x1 - x0

    def outer(u, v):
        inner_u = u if side < 0 else width - u          # distance from the hinge edge
        if 1.10 <= v <= 1.70 and 0.12 * width <= inner_u <= 0.88 * width:
            return 'glass'
        if 0.40 <= v <= 0.70:
            return 'paint_secondary'
        return 'paint'

    mesh = G.Mesh()
    mesh.block((x0, y0, z0), (x1, BOX_REAR - 0.004, 2.52),
               {'-y': outer, '+y': 'liner', '*': 'paint'}, 2, step=0.2)
    slab = mesh.to_object(name, mats)
    hinge_x = side * 0.95
    out = [slab]
    for z in (0.75, 1.55, 2.3):
        out.append(T.box(f'{name}_hinge{z}', (0.05, 0.03, 0.09), (hinge_x, y0 - 0.012, z), 'chrome', mats, 0,
                         0.006))
    out.append(T.box(f'{name}_handle', (0.03, 0.03, 0.22), (side * 0.12, y0 - 0.015, 1.35), 'chrome', mats, 0,
                     0.008))
    return out


def make(a):
    spec = {'color': '#F4F2EC', 'secondary_color': '#D8432F', 'sirens': True, 'wheel_color': '#B9BBBE',
            'axle_f': AXLE_F, 'axle_r': AXLE_R, 'wheel_radius': RADIUS, 'tyre_width': 0.235,
            'track': TRACK, 'rim_ratio': 0.58, 'seats': 4, 'lod1': 4800, 'lod2': 1200,
            'steering': {'hub': (-0.48, 1.22, 1.42), 'tilt': 40.0, 'radius': 0.2}}
    mats = T.materials(spec)
    front_arch = (AXLE_F, RADIUS, 0.47, 0.32)
    rear_arch = (AXLE_R, RADIUS, 0.47, 0.42)

    cab = G.loft(_cab_keys(), _cab_assign, levels=(0.62, 0.85, 1.05, 1.30, 1.55, 1.80, 2.04),
                 arches=[front_arch], step=0.24, n_top=4)
    box_keys = [{'y': y, 'w': BOX_W, 'zb': 0.46, 'zt': BOX_TOP, 'rt': 0.07, 'rb': 0.04}
                for y in (BOX_REAR, SIDE_WINDOW[0], SIDE_WINDOW[1], BOX_FRONT)]
    body = G.loft(box_keys, _box_assign, levels=(0.62, 0.92, 1.22, 1.55, 2.10, 2.40),
                  arches=[rear_arch], step=0.3, level_step=0.4, n_top=5)
    hull = {name: mesh.to_object(f'cab_{name}', mats) for name, mesh in cab.items()}
    box_hull = {name: mesh.to_object(f'box_{name}', mats) for name, mesh in body.items()}

    wells = G.Mesh()
    for side in (-1.0, 1.0):
        G.arch_liner(wells, AXLE_F, RADIUS, 0.47, side * CAB_W, 0.32, 'liner', flare=(0.05, 0.018, 'trim'))
        G.arch_liner(wells, AXLE_R, RADIUS, 0.47, side * BOX_W, 0.42, 'liner', flare=(0.06, 0.018, 'trim'))
    inside = G.Mesh()
    inside.block((-0.97, 0.15, 0.60), (0.97, 1.45, 2.24), 'liner', 1, step=0.6, inward=True, skip=('+y',))
    inside.block((-1.10, BOX_REAR + 0.03, 0.80), (1.10, BOX_FRONT - 0.03, BOX_TOP - 0.03), 'liner', 1,
                 step=0.6, inward=True)
    lod0 = [hull['lod0'], box_hull['lod0'], wells.to_object('wells', mats), inside.to_object('inside', mats)]

    # Cab interior: dashboard, engine cover, two seats; patient box: cabinets, stretcher, bench.
    lod0 += [T.rounded_block('dash', (-0.95, 1.45, 0.85), (0.95, 2.12, 1.18), 'trim', mats, 0.05, 0.4, 1),
             T.rounded_block('cover', (-0.22, 1.0, 0.6), (0.22, 1.9, 0.92), 'trim', mats, 0.06, 0.4, 1)]
    for side in (-1.0, 1.0):
        lod0 += T.seat(f'seat{side}', side * 0.48, 0.70, 0.62, mats)
    lod0 += [T.rounded_block('cabinet', (-1.08, BOX_REAR + 0.3, 0.80), (-0.72, -0.35, 2.42), 'trim', mats,
                             0.03, 0.6, 1),
             T.rounded_block('stretcher', (0.0, -2.9, 0.80), (0.58, -1.0, 1.12), 'seat', mats, 0.05, 0.6, 1),
             T.rounded_block('bench', (0.72, -2.7, 0.80), (1.08, -1.1, 1.22), 'seat', mats, 0.04, 0.6, 1)]

    # Nose: grille with slats, headlamps with indicators, wipers.
    lod0 += [T.rounded_block('grille', (-0.52, 2.83, 0.64), (0.52, 2.875, 0.95), 'grille', mats, 0.015, 0.3, 2)]
    for z in (0.72, 0.80, 0.88):
        lod0.append(T.box(f'slat{z}', (1.0, 0.012, 0.02), (0.0, 2.878, z), 'trim', mats, 0, 0.004))
    lod0 += T.lamp_unit('head_l', (-0.71, 2.86, 0.86), 0.34, 0.2, 1.0,
                        [(0.0, 0.3, 'lamp_indicator_l'), (0.3, 1.0, 'lamp_head')], mats)
    lod0 += T.lamp_unit('head_r', (0.71, 2.86, 0.86), 0.34, 0.2, 1.0,
                        [(0.0, 0.7, 'lamp_head'), (0.7, 1.0, 'lamp_indicator_r')], mats)
    for x in (-0.28, 0.32):
        lod0.append(T.box(f'wiper{x}', (0.6, 0.02, 0.014), (x, 2.235, 1.245), 'trim', mats, 0, 0.004))

    # Box: livery-side outlines, rear lamps, warning lamps, roof pod, step, chassis, exhaust.
    lod0 += _outline('locker_l', -1.0, -3.08, -2.08, 0.62, 2.05, mats)
    lod0 += _outline('locker_r', 1.0, -3.08, -2.08, 0.62, 2.05, mats)
    lod0 += _outline('entry', 1.0, -1.20, -0.26, 0.52, 2.30, mats)
    lod0 += T.lamp_unit('tail_l', (-1.04, BOX_REAR, 1.02), 0.15, 0.62, -1.0,
                        [(0.0, 0.2, 'lamp_reverse'), (0.2, 0.46, 'lamp_brake'), (0.46, 0.72, 'lamp_tail'),
                         (0.72, 1.0, 'lamp_indicator_l')], mats, axis='z')
    lod0 += T.lamp_unit('tail_r', (1.04, BOX_REAR, 1.02), 0.15, 0.62, -1.0,
                        [(0.0, 0.2, 'lamp_reverse'), (0.2, 0.46, 'lamp_brake'), (0.46, 0.72, 'lamp_tail'),
                         (0.72, 1.0, 'lamp_indicator_r')], mats, axis='z')
    lod0 += T.lamp_unit('flash_rl', (-1.03, BOX_REAR, 2.42), 0.17, 0.16, -1.0, [(0.0, 1.0, 'lamp_siren_a')], mats)
    lod0 += T.lamp_unit('flash_rr', (1.03, BOX_REAR, 2.42), 0.17, 0.16, -1.0, [(0.0, 1.0, 'lamp_siren_b')], mats)
    for side, material in ((-1.0, 'lamp_siren_a'), (1.0, 'lamp_siren_b')):
        for y in (BOX_FRONT - 0.18, BOX_REAR + 0.18):
            lod0 += T.beacon(f'beacon{side}{y}', (side * 0.98, y, BOX_TOP), (0.24, 0.12, 0.095), material, mats)
            lod0.append(T.box(f'flash{side}{y}', (0.03, 0.24, 0.11), (side * (BOX_W + 0.012), y, 2.36),
                              material, mats, 2, 0.01))
    lod0 += T.light_bar('bar', (0.0, 0.75, 2.28), 1.5, mats, depth=0.3, height=0.11)
    lod0.append(T.rounded_block('pod', (-0.45, -2.55, BOX_TOP), (0.45, -1.65, BOX_TOP + 0.11), 'trim', mats,
                                0.03, 0.45, 1))
    for y in (-2.4, -2.25, -2.1, -1.95, -1.8):
        lod0.append(T.box(f'pod_fin{y}', (0.8, 0.02, 0.012), (0.0, y, BOX_TOP + 0.115), 'chrome', mats, 0))
    lod0 += T.chassis(spec, mats, BOX_REAR + 0.2, 2.6, 0.56)
    lod0 += T.exhaust(spec, mats, 0.80, -2.76, 0.32)

    # Cab doors with big mirrors on arms and handles.
    for name, side in (('door_fl', -1.0), ('door_fr', 1.0)):
        hull[name] = [T.door_panel(hull[name])]
        hull[name] += T.van_mirror(f'{name}_mirror', side, (side * CAB_W, 1.28, 1.42), mats)
        hull[name].append(T.box(f'{name}_handle', (0.025, 0.16, 0.035), (side * (CAB_W + 0.012), 0.36, 1.18),
                                'trim', mats, 0, 0.008))
    hood = T.lid_panel(hull['hood'])

    bumper_f = [T.rounded_block('bumper_f_body', (-0.99, 2.80, 0.28), (0.99, 2.97, 0.60), 'trim', mats, 0.05,
                                0.35, 2)]
    bumper_f += T.plate_recess('plate_f', (0.0, 2.97, 0.44), 1.0, mats)
    bumper_r = [T.rounded_block('bumper_r_body', (-0.95, BOX_REAR - 0.16, 0.30), (0.95, BOX_REAR, 0.50),
                                'trim', mats, 0.03, 0.35, 2),
                T.box('step_plate', (1.86, 0.15, 0.012), (0.0, BOX_REAR - 0.08, 0.506), 'tread', mats, 1)]
    bumper_r += T.plate_recess('plate_r', (0.0, BOX_REAR - 0.16, 0.40), -1.0, mats)

    pass_through = G.Mesh()
    pass_through.panel((0.35, 0.14, 1.45), (-1, 0, 0), (0, 0, 1), 0.7, 0.4, 'glass', 2)

    parts = {'lod0': lod0, 'hood': [hood], 'door_fl': hull['door_fl'], 'door_fr': hull['door_fr'],
             'window_front': [hull['window_front']], 'window_l': [box_hull['window_l']],
             'window_r': [box_hull['window_r']], 'window_rear': [pass_through.to_object('pass', mats)],
             'bumper_f': bumper_f, 'bumper_r': bumper_r,
             'door_rear_l': _rear_door('door_rear_l_slab', -1.0, mats),
             'door_rear_r': _rear_door('door_rear_r_slab', 1.0, mats)}

    spec['origins'] = {'hood': (0.0, 2.30, 1.2), 'door_fl': (-CAB_W, DOOR[1], 1.2),
                       'door_fr': (CAB_W, DOOR[1], 1.2), 'door_rear_l': (-0.95, BOX_REAR - 0.025, 1.5),
                       'door_rear_r': (0.95, BOX_REAR - 0.025, 1.5), 'bumper_f': (0.0, 2.88, 0.44),
                       'bumper_r': (0.0, BOX_REAR - 0.08, 0.40), 'window_front': (0.0, 1.78, 1.70),
                       'window_rear': (0.0, 0.14, 1.65), 'window_l': (-BOX_W, -0.65, 1.82),
                       'window_r': (BOX_W, -0.65, 1.82)}
    fwd, back, left, right = (0, 1, 0), (0, -1, 0), (-1, 0, 0), (1, 0, 0)
    spec['anchors'] = [
        ('anchor_seat_driver', (-0.48, 0.70, 0.95), fwd, {}),
        ('anchor_seat_passenger_1', (0.48, 0.70, 0.95), fwd, {}),
        ('anchor_seat_passenger_2', (0.90, -1.9, 1.15), left, {}),
        ('anchor_seat_passenger_3', (-0.45, -0.7, 1.12), back, {}),
        ('anchor_door_driver', (-CAB_W - 0.55, 0.78, 0.0), right, {}),
        ('anchor_door_passenger', (CAB_W + 0.55, 0.78, 0.0), left, {}),
        ('anchor_door_rear', (0.0, BOX_REAR - 0.95, 0.0), fwd, {}),
        ('anchor_cargo', (0.2, -1.6, 0.80), fwd, {}),
        ('anchor_light_head_l', (-0.71, 2.88, 0.86), fwd, {}),
        ('anchor_light_head_r', (0.71, 2.88, 0.86), fwd, {}),
        ('anchor_light_tail_l', (-1.04, BOX_REAR - 0.02, 1.02), back, {}),
        ('anchor_light_tail_r', (1.04, BOX_REAR - 0.02, 1.02), back, {}),
        ('anchor_exhaust_1', (0.80, -2.77, 0.32), back, {}),
        ('anchor_camera', (0.0, -0.4, 2.7), fwd, {}),
        ('anchor_plate_f', (0.0, 2.976, 0.44), fwd, {}),
        ('anchor_plate_r', (0.0, BOX_REAR - 0.166, 0.40), back, {}),
        ('anchor_decal_side_l', (-BOX_W - 0.004, -2.1, 1.88), left, {'width': 2.0, 'height': 1.2}),
        ('anchor_decal_side_r', (BOX_W + 0.004, -2.1, 1.88), right, {'width': 2.0, 'height': 1.2}),
        ('anchor_siren', (0.0, 0.75, 2.39), fwd, {}),
    ]
    spec['colliders'] = [('cab', (0.0, 1.13, 1.33), (2.0, 2.06, 1.94)),
                         ('nose', (0.0, 2.58, 0.75), (2.0, 0.78, 0.9)),
                         ('body', (0.0, -1.67, 1.5), (2.26, 3.5, 2.3))]
    T.make_truck(a, spec, parts, mats)


def assemble(a):
    T.assemble_truck(a)
