"""Shared helper of the hero cars: turns a car's description into the registered asset.

make_car(a, spec) builds the shell (_body), cuts the standard panels, adds the fittings
(_parts), and registers every part, anchor and collision proxy of the contract with the game.
Only the right half of the symmetric parts is modelled and baked (a.add(..., mirror='X')); one
door, one quarter window and one wheel are baked and the others made from them after the bake.

assemble_car(a) runs after the bake: it repairs the mirrored halves' custom normals, makes the
left door, the left quarter window, the other three wheels and the steering pivot, builds lod1
and lod2 as single merged meshes (moving parts and wheels merged into the body, faces kept by
their level tag, shut gaps welded, then decimated) and hangs every moving part under the node
lod0, so that it shows at level 0 only.

A source preview (no output path) also gets mirrored stand-ins, so the whole car is seen.

Blender axes: Z up, nose towards +Y, right side +X; the driver sits on the left (-X).
"""
import math

from mathutils import Matrix

from lib import materials as M
from lib import modify, scene

import _body as B
import _mesh
import _parts

STATE = {}
MIRRORED = ('lod0', 'hood', 'trunk', 'bumper_f', 'bumper_r', 'window_front', 'window_rear')
SINGLE = (('door_fr', 'door_fl'), ('window_r', 'window_l'))
COLUMN_TILT = math.radians(25.0)


def materials(spec):
    """The source materials of a car, by the short names the helpers use."""
    return {
        # A clean, deep clear coat (the hero car holds the sunset in its reflections).
        'paint': M.car_paint(color=M.hex_color(spec['color']), metallic_flake=0.4, gloss=0.97,
                             dirt=0.04, seed=3, name='paint'),
        # Dark tint: in the engine a paler pane reads milky under the sky reflection.
        'glass': M.glass(tint=(0.07, 0.085, 0.095), opacity=0.62, name='glass'),
        # Tail-lamp lenses over the reflector and its light strips (see tail_lamp).
        'glass_lens_red': M.glass(tint=(0.62, 0.03, 0.025), opacity=0.55, roughness=0.02,
                                  name='glass_lens_red'),
        'glass_lens': M.glass(tint=(0.85, 0.86, 0.86), opacity=0.22, roughness=0.02,
                              name='glass_lens'),
        'gap': M.rubber(dust=0.2, seed=5, name='seal_rubber'),
        'liner': M.plastic(color=(0.018, 0.018, 0.02), roughness=0.7, seed=6, name='liner_plastic'),
        'underbody': M.plastic(color=(0.02, 0.02, 0.022), roughness=0.75, seed=7,
                               name='underbody_plastic'),
        'trim': M.plastic(color=(0.022, 0.022, 0.025), roughness=0.5, seed=8, name='trim_plastic'),
        'leather': M.leather(color=spec.get('leather', (0.16, 0.07, 0.04)), seed=9,
                             name='seat_leather'),
        'tyre': M.rubber(seed=10, name='tyre_rubber'),
        'alloy': M.brushed_metal(color=(0.62, 0.63, 0.65), roughness=0.28, grime=0.25, seed=11,
                                 name='rim_alloy'),
        'disc': M.cast_metal(color=(0.32, 0.32, 0.33), roughness=0.4, rust=0.1, seed=12,
                             name='brake_disc'),
        'caliper': M.painted_metal(color=M.hex_color('#b3261a'), gloss=0.7, chips=0.1, rust=0.0,
                                   grime=0.3, dust=0.2, fade=0.0, seed=13, name='caliper_enamel'),
        'dark': M.cast_metal(color=(0.03, 0.03, 0.032), seed=14, name='wheel_back'),
        'chrome': M.chrome(seed=15, name='bright_trim'),
        'lamp_head': M.lamp(color=(1.0, 0.95, 0.86), strength=10.0, name='lamp_head'),
        'lamp_tail': M.lamp(color=(0.9, 0.04, 0.03), strength=3.0, name='lamp_tail'),
        'lamp_brake': M.lamp(color=(1.0, 0.06, 0.04), strength=9.0, name='lamp_brake'),
        'lamp_reverse': M.lamp(color=(1.0, 1.0, 0.95), strength=6.0, name='lamp_reverse'),
        'lamp_indicator_r': M.lamp(color=(1.0, 0.5, 0.05), strength=6.0, name='lamp_indicator_r'),
    }


def cut_panels(shell, spec):
    """The standard division of the grid: hood, trunk, bumpers, door, glass, lamps and trim."""
    reach = spec['arch_radius'] + B.ARCH_GUARD
    spec['marks'].update(fascia_r=spec['axle_r'] - reach, sill_rear=spec['axle_r'] + reach,
                         sill_front=spec['axle_f'] - reach, fascia_f=spec['axle_f'] + reach)
    shell.rows.update(B.stations(spec)[1])
    rail, glass, belt, last = B.COL_RAIL, B.COL_GLASS_BASE, B.COL_BELT, B.COLUMNS
    shell.assign('hood', ('cowl', 'hood_front'), (0, rail - 1))
    shell.assign('trunk', ('tail', 'deck'), (0, rail - 1))
    shell.assign('bumper_f', ('hood_front', 'nose'), (0, last))
    shell.assign('bumper_f', ('fascia_f', 'hood_front'), (belt + 1, last))
    shell.assign('bumper_r', ('tail', 'fascia_r'), (belt + spec.get('bumper_column', 3), last))
    shell.assign('door_fr', ('door_rear', 'door_front'), (rail + 1, last))
    shell.assign('door_fr', ('door_rear', 'glass_front'), (rail + 1, glass), material='glass')
    shell.assign('window_front', ('roof_front', 'cowl'), (0, rail - 1), material='glass', gap=False)
    shell.assign('window_rear', ('deck', 'roof_rear'), (0, rail - 1), material='glass', gap=False)
    shell.assign('window_r', ('quarter_rear', 'door_rear'), (rail + 1, glass), material='glass',
                 gap=False)
    if spec.get('head_housing'):
        # A dark lamp housing on the fender crest with a slim bright strip set inside it
        # (columns rail + first to rail + last, inset from the housing's rear end).
        first, stop = spec['head_housing']
        shell.paint(('lamp_rear', 'lamp_front'), (rail - 1, glass + 1), 'trim')
        shell.paint((shell.row('lamp_rear') + 1, 'lamp_front'), (rail + first, rail + stop),
                    'lamp_head')
    else:
        shell.paint(('lamp_rear', 'lamp_front'), (rail - 1, glass + 1), 'lamp_head')
    for rows in (('tail', 'fascia_r'), ('sill_rear', 'sill_front'), ('fascia_f', 'nose')):
        shell.paint(rows, (last - 1, last), 'trim')
    if spec.get('side_vent', True):
        # The outlet behind the front wheel, at the head of the side scallop.
        shell.paint(('door_front', 'sill_front'), (belt + 3, belt + 6), 'trim')


LENS_OF = {'lamp_tail': 'glass_lens_red', 'lamp_brake': 'glass_lens_red',
           'lamp_reverse': 'glass_lens', 'lamp_indicator_r': 'glass_lens'}


def tail_lamp(shell, name, unit, mats):
    """One slim tail-lamp unit standing off the bowed tail face, following it across the car:
    unit = (x from, x to, z low, z high, upper lamp material, lower lamp material, standoff).
    Built in depth like a real lamp: a chrome reflector just off the body face carrying two
    emissive light strips (the upper and the lower lamp, split by a chrome divider), framed by
    chrome top and bottom walls, under a tinted glass lens domed along its middle (red over the
    tail and brake strips, clear over the indicator and reverse). A unit that starts on the
    centreline is left open there (its mirror image continues it)."""
    x0, x1, z0, z1, upper, lower, proud = unit
    zm, h = 0.5 * (z0 + z1), z1 - z0
    lip = min(0.005, 0.15 * h)
    steps = max(1, math.ceil((x1 - x0) / 0.04 - 1e-6))
    xs = [x0 + (x1 - x0) * k / steps for k in range(steps + 1)]
    ends = (x0 > 1e-6, True)

    def face(x, z):
        return shell.cap_y(0, x, z)

    def reflector(x):
        # A thin block on the body face; its outer side (toward -Y) is the reflector with the
        # two strips. Convex loop, so the faces orient outward from its centre.
        zs = [z0 + lip, zm - 0.36 * h, zm - 0.08 * h, zm + 0.08 * h, zm + 0.36 * h, z1 - lip]
        front = [(face(x, z) - 0.003, z) for z in zs]
        return [(face(x, z1 - lip) + 0.006, z1 - lip), (face(x, z0 + lip) + 0.006, z0 + lip)] + front

    pieces = _parts.sweep_x(f'{name}_reflector', xs, reflector,
                            [None, 'chrome', 'chrome', lower, 'chrome', upper, 'chrome', 'chrome'],
                            mats, ends=ends, end_material='chrome')
    for wall, (za, zb) in (('low', (z0, z0 + lip)), ('high', (z1 - lip, z1))):
        def bezel(x, za=za, zb=zb):
            return [(face(x, za) + 0.006, za), (face(x, za) - proud, za),
                    (face(x, zb) - proud, zb), (face(x, zb) + 0.006, zb)]

        pieces += _parts.sweep_x(f'{name}_{wall}', xs, bezel, [None, 'chrome', 'chrome', 'chrome'],
                                 mats, ends=ends, end_material='chrome')

    def lens(x):
        return [(face(x, z0 + lip) - proud, z0 + lip), (face(x, zm) - 1.3 * proud, zm),
                (face(x, z1 - lip) - proud, z1 - lip)]

    pieces += _parts.sweep_x(f'{name}_lens', xs, lens,
                             [LENS_OF.get(lower, 'glass_lens'), LENS_OF.get(upper, 'glass_lens'), None],
                             mats, ends=(False, False))
    def side(x):
        return [(face(x, z0) + 0.006, z0), (face(x, z0) - proud, z0),
                (face(x, zm) - 1.3 * proud, zm), (face(x, z1) - proud, z1),
                (face(x, z1) + 0.006, z1)]

    # Close the ends of the unit (not on the centreline) with chrome walls under the lens.
    for index, (closed, stations, which) in enumerate(((ends[0], [x0, x0 + 0.002], (True, False)),
                                                       (ends[1], [x1 - 0.002, x1], (False, True)))):
        if closed:
            pieces += _parts.sweep_x(f'{name}_cap{index}', stations, side, [None] * 5, mats,
                                     ends=which, end_material='chrome')
    return pieces


def plate_recess(shell, name, end, z, mats, half_width=0.20, half_height=0.062):
    """The licence-plate recess of the tail (end 0) or the nose (end -1): a dark channel
    across the centre of the end face, its floor 8 mm and its lips 22 mm off the face, so the
    plate the game paints at anchor_plate_* (14 mm off) sits back between the lips."""
    out = -1.0 if end == 0 else 1.0
    low, high = z - half_height, z + half_height
    xs = [half_width * k / 4 for k in range(5)]

    def outline(x):
        face = shell.cap_y(end, x, z)
        return [(face - out * 0.004, low - 0.012), (face + out * 0.022, low - 0.012),
                (face + out * 0.022, low), (face + out * 0.008, low + 0.006),
                (face + out * 0.008, high - 0.006), (face + out * 0.022, high),
                (face + out * 0.022, high + 0.012), (face - out * 0.004, high + 0.012)]

    return _parts.sweep_x(name, xs, outline, ['trim'] * 7 + [None], mats, ends=(False, True))


def make_car(a, spec):
    """Models the car and registers its parts, anchors and collision proxies on the builder."""
    mats = materials(spec)
    shell = B.Shell(spec)
    cut_panels(shell, spec)
    parts = shell.build(mats)
    curves, ys = spec['curves'], shell.ys
    tail, nose = ys[0] - spec['tail_bow'], ys[-1] + spec['nose_bow']
    radius, half_track = spec['wheel_radius'], 0.5 * spec['track']

    extras = []
    for index, unit in enumerate(spec['tail_lamps']):
        extras += tail_lamp(shell, f'tail{index}', unit, mats)
    extras += _parts.interior_half(spec, mats)
    parts['lod0'] = scene.join([parts['lod0']] + extras, 'lod0')

    # The rear bumper carries the tail pipes, the diffuser fins and the plate plinth; the front
    # one its plate plinth; the door its mirror and handle (they move and detach with them).
    pipe_z, plate_r, plate_f = spec['exhaust_z'], spec['plate_r_z'], spec['plate_f_z']
    rear = []
    for index, x in enumerate(spec.get('exhausts', (spec['exhaust_x'],))):
        rear += _parts.exhaust_tip(f'pipe{index}', (x, shell.cap_y(0, x, pipe_z) - 0.035, pipe_z),
                                   spec.get('exhaust_radius', 0.042), mats)
    for index, x in enumerate(spec.get('diffuser_fins', ())):
        rear += _parts.slab(f'fin{index}', (0.014, 0.16, 0.13),
                            (x, shell.cap_y(0, x, pipe_z) + 0.05, pipe_z - 0.005), mats['trim'])
    rear += plate_recess(shell, 'plate_r', 0, plate_r, mats)
    parts['bumper_r'] = scene.join([parts['bumper_r']] + rear, 'bumper_r')
    front = plate_recess(shell, 'plate_f', -1, plate_f, mats)
    if spec.get('splitter'):
        # A splitter blade under the chin that follows the bowed nose in plan.
        reach, depth, z_low, z_high = spec['splitter']
        edge = shell.points[-1, -1]
        xs = [float(edge[0]) * k / 6 for k in range(7)][:-1] + [float(edge[0]) - 0.03]

        def blade(x):
            tip = shell.cap_y(-1, x, z_high + 0.02) + reach
            return [(tip - depth, z_low), (tip, z_low + 0.004), (tip, z_high), (tip - depth, z_high)]

        front += _parts.sweep_x('splitter', xs, blade, ['trim', 'trim', 'trim', 'trim'], mats,
                                ends=(False, True))
    if spec.get('grille'):
        # Horizontal slats standing off the dark grille band, so the opening has relief.
        reach, g_low, g_high, count = spec['grille']
        slat_xs = [reach * k / 6 for k in range(7)]
        for n in range(count):
            slat_z = g_low + (g_high - g_low) * (n + 0.5) / count

            def slat(x, slat_z=slat_z):
                face = shell.cap_y(-1, x, slat_z)
                return [(face - 0.02, slat_z - 0.004), (face + 0.005, slat_z - 0.004),
                        (face + 0.005, slat_z + 0.004), (face - 0.02, slat_z + 0.004)]

            front += _parts.sweep_x(f'slat{n}', slat_xs, slat, ['trim'] * 4, mats,
                                    ends=(False, True))
    parts['bumper_f'] = scene.join([parts['bumper_f']] + front, 'bumper_f')
    mx, my, mz = shell.point('glass_front', B.COL_GLASS_BASE)
    fittings = _parts.door_mirror('mirror', (mx, my + 0.07, mz), mats)
    hx, hy, hz = shell.point(shell.near_row(ys[shell.row('door_rear')] + 0.2), B.COL_BELT + 2)
    fittings += _parts.door_handle('handle', (hx + 0.005, hy, hz), mats)
    parts['door_fr'] = scene.join([parts['door_fr']] + fittings, 'door_fr')

    def on_top(mark):
        y = ys[shell.row(mark)]
        return (0.0, y, curves['top'](y))

    def between(first, second):
        a_point, b_point = on_top(first), on_top(second)
        return tuple(0.5 * (p + q) for p, q in zip(a_point, b_point))

    origins = {'lod0': (0.0, 0.0, 0.0), 'hood': on_top('cowl'), 'trunk': on_top('deck'),
               'bumper_f': (0.0, ys[-1] - 0.15, 0.40), 'bumper_r': (0.0, ys[0] + 0.15, 0.45),
               'window_front': between('roof_front', 'cowl'),
               'window_rear': between('deck', 'roof_rear'),
               'door_fr': shell.point('door_front', B.COL_BELT + 2),
               'window_r': shell.point((shell.row('quarter_rear') + shell.row('door_rear')) // 2,
                                       B.COL_RAIL + 2)}
    for name, obj in parts.items():
        scene.set_origin(obj, origins[name])
        a.add(_mesh.single_uv(obj), mirror='X' if name in MIRRORED else None)

    hub = (half_track, spec['axle_f'], radius)
    parts['wheel_fr'] = a.add(_mesh.single_uv(
        _parts.wheel('wheel_fr', hub, radius, spec['tyre_width'], mats)))
    cabin = spec['cabin']
    steering_hub = (-cabin['seat_x'], cabin['seat_y'] + 0.68, cabin['belt'] - 0.07)
    steering = _parts.steering_wheel('steering_wheel_mesh', mats)
    modify.transform(steering, rotation=(0.5 * math.pi - COLUMN_TILT, 0.0, 0.0), location=steering_hub)
    scene.set_origin(steering, steering_hub)
    _mesh.tagged([steering], 0)
    parts['steering_wheel_mesh'] = a.add(_mesh.single_uv(steering))
    STATE[a.id] = {'spec': spec, 'parts': parts, 'steering_hub': steering_hub}

    if not a.output_path:
        # Source preview only: show the other half and the other wheels.
        for name in list(MIRRORED) + ['door_fr', 'window_r', 'wheel_fr']:
            if name in parts:
                a.add(_mesh.mirrored_copy(parts[name], f'preview_{name}'))
        for side in (parts['wheel_fr'], a.parts[-1].obj):
            rear = scene.duplicate(side, f'{side.name}_rear')
            modify.transform(rear, location=(0.0, spec['axle_r'] - spec['axle_f'], 0.0))
            a.add(rear)

    width, height = spec['width'], spec['height']
    seat_z = cabin['floor'] + 0.2
    a.add_anchor('anchor_seat_driver', (-cabin['seat_x'], cabin['seat_y'], seat_z), forward=(0, 1, 0))
    a.add_anchor('anchor_seat_passenger_1', (cabin['seat_x'], cabin['seat_y'], seat_z), forward=(0, 1, 0))
    a.add_anchor('anchor_door_driver', (-0.5 * width - 0.55, cabin['seat_y'] + 0.3, 0.0), forward=(1, 0, 0))
    a.add_anchor('anchor_door_passenger', (0.5 * width + 0.55, cabin['seat_y'] + 0.3, 0.0), forward=(-1, 0, 0))
    head = shell.point((shell.row('lamp_rear') + shell.row('lamp_front')) // 2, B.COL_RAIL)
    main = spec['tail_lamps'][0]
    lamp_x = 0.5 * (main[0] + main[1])
    lamp_y = shell.cap_y(0, lamp_x, spec['tail_lamp_z']) - main[6] - 0.01
    for side, sign in (('l', -1.0), ('r', 1.0)):
        a.add_anchor(f'anchor_light_head_{side}', (sign * head[0], head[1], head[2]), forward=(0, 1, 0))
        a.add_anchor(f'anchor_light_tail_{side}', (sign * lamp_x, lamp_y, spec['tail_lamp_z']),
                     forward=(0, -1, 0))
    for index, sign in ((1, -1.0), (2, 1.0)):
        a.add_anchor(f'anchor_exhaust_{index}',
                     (sign * spec['exhaust_x'], shell.cap_y(0, spec['exhaust_x'], pipe_z) - 0.04,
                      pipe_z), forward=(0, -1, 0))
    a.add_anchor('anchor_camera', (0.0, cabin['seat_y'], height), forward=(0, 1, 0))
    a.add_anchor('anchor_plate_f', (0.0, shell.cap_y(-1, 0.0, plate_f) + 0.014, plate_f),
                 forward=(0, 1, 0))
    a.add_anchor('anchor_plate_r', (0.0, shell.cap_y(0, 0.0, plate_r) - 0.014, plate_r),
                 forward=(0, -1, 0))

    clearance, belt = spec['clearance'], cabin['belt']
    a.collider_box('body', (0.0, 0.5 * (tail + nose), 0.5 * (clearance + belt)),
                   (width, nose - tail, belt - clearance))
    cabin_rear, cabin_front = ys[shell.row('deck')] + 0.3, ys[shell.row('cowl')] - 0.2
    a.collider_box('cabin', (0.0, 0.5 * (cabin_rear + cabin_front), 0.5 * (belt + height)),
                   (width - 0.45, cabin_front - cabin_rear, height - belt))
    a.set_extra('wheel_radius', radius)
    a.set_extra('track', spec['track'])
    a.set_extra('wheelbase', spec['axle_f'] - spec['axle_r'])
    a.set_lod_distances(30.0, 80.0)
    # Fewer samples than the GPU defaults (64, 64, 256): the bake of a car's twelve parts was
    # taking more than ten minutes, and the colour and normal passes are noise free anyway.
    atlas = spec.get('atlas', 2048)
    a.bake(size=atlas, orm_size=atlas // 2, normal_size=atlas // 2, occlusion_distance=0.5,
           color_samples=16, normal_samples=16, occlusion_samples=96)


def _world_copy(obj, matrix, name):
    """A free copy of a mesh with `matrix` baked into its vertices."""
    copy = scene.duplicate(obj, name)
    copy.parent = None
    copy.data.transform(matrix)
    copy.matrix_world = Matrix.Identity(4)
    return copy


def assemble_car(a):
    """After the bake: the left-hand copies, the wheels, the lower levels and the hierarchy."""
    state = STATE[a.id]
    spec, parts = state['spec'], state['parts']
    body, wheel = parts['lod0'], parts['wheel_fr']
    radius, half_track = spec['wheel_radius'], 0.5 * spec['track']
    for name in MIRRORED:
        if name in parts:
            _mesh.mirror_normals(parts[name])
    left = a.material('lamp_indicator_r').copy()
    left.name = 'lamp_indicator_l'
    _mesh.rename_material(body, 'lamp_indicator_r', left)
    for source, name in SINGLE:
        if source in parts:
            parts[name] = a.add_baked(_mesh.mirrored_copy(parts[source], name))

    placements = [Matrix.Translation((sign * half_track, y, radius)) @ Matrix.Rotation(turn, 4, 'Z')
                  for y in (spec['axle_f'], spec['axle_r'])
                  for sign, turn in ((1.0, 0.0), (-1.0, math.pi))]
    wheel_local = Matrix.Translation(wheel.matrix_world.translation).inverted()
    for level, target in ((1, spec.get('lod1', 3800)), (2, spec.get('lod2', 1000))):
        pieces = [_world_copy(obj, obj.matrix_world.copy(), f'piece_{name}')
                  for name, obj in parts.items() if name != 'wheel_fr']
        pieces += [_world_copy(wheel, placement @ wheel_local @ wheel.matrix_world, f'piece_wheel{n}')
                   for n, placement in enumerate(placements)]
        merged = scene.join(pieces, f'lod{level}')
        scene.set_origin(merged, (0.0, 0.0, 0.0))
        _mesh.delete_faces(merged, lambda _face, keep, _material, level=level: keep < level)
        _mesh.weld(merged, 0.0065)
        count = scene.triangle_count(merged)
        if count > target:
            modify.decimate(merged, ratio=target / count)
        _mesh.clear_normals(merged)
        _mesh.drop_unused_materials(merged)
        a.add_baked(merged)

    children = [obj for name, obj in parts.items() if name not in ('lod0', 'steering_wheel_mesh')]
    rear = scene.duplicate(wheel, 'wheel_rr', linked=True)
    rear.matrix_world = Matrix.Translation((half_track, spec['axle_r'], radius))
    children.append(a.add_baked(rear))
    for name, y in (('wheel_fl', spec['axle_f']), ('wheel_rl', spec['axle_r'])):
        pivot = scene.add_empty(name, (-half_track, y, radius))
        copy = scene.duplicate(wheel, f'{name}_mesh', linked=True)
        copy.parent = pivot
        copy.matrix_parent_inverse = Matrix.Identity(4)
        copy.location = (0.0, 0.0, 0.0)
        copy.rotation_euler = (0.0, 0.0, math.pi)
        a.extra_objects.append(pivot)
        a.add_baked(copy)
        children.append(pivot)
    column = (0.0, -math.cos(COLUMN_TILT), math.sin(COLUMN_TILT))
    pivot = scene.add_empty('steering_wheel', state['steering_hub'],
                            forward=(0.0, math.sin(COLUMN_TILT), math.cos(COLUMN_TILT)), up=column)
    scene.parent_to(parts['steering_wheel_mesh'], pivot)
    a.extra_objects.append(pivot)
    children.append(pivot)
    for child in children:
        scene.parent_to(child, body)
