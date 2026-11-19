"""Shared helper of the everyday cars: turns a car's description into the registered asset.

make_car(a, spec) builds the shell (_body), cuts the standard four-door panels, adds the
fittings (_parts), and registers every part, anchor and collision proxy of the contract with
the game. Only the right half of the symmetric parts is modelled and baked
(a.add(..., mirror='X')); one front door, one rear side window and one wheel are baked and the
others made from them after the bake. The rear doors are cut like panels (shut gaps, flanges)
but stay in the body: the game opens the front doors only.

assemble_car(a) runs after the bake: it repairs the mirrored halves' custom normals, makes the
left door, the left side window, the other three wheels and the steering pivot, builds lod1 and
lod2 as single merged meshes (moving parts and wheels merged into the body, faces kept by their
level tag, shut gaps welded, then decimated) and hangs every moving part under the node lod0,
so that it shows at level 0 only.

A source preview (no output path) also gets mirrored stand-ins, so the whole car is seen.

Blender axes: Z up, nose towards +Y, right side +X; the driver sits on the left (-X).
"""
import math

from mathutils import Matrix

from lib import materials as M
from lib import modify, scene

import _body as B
import _lamps
import _mesh
import _parts

STATE = {}
MIRRORED = ('lod0', 'hood', 'trunk', 'bumper_f', 'bumper_r', 'window_front', 'window_rear')
SINGLE = (('door_fr', 'door_fl'), ('window_r', 'window_l'))
COLUMN_TILT = math.radians(24.0)


def materials(spec):
    """The source materials of a car, by the short names the helpers use. A car with
    spec['secondary_color'] gets paint_secondary (the livery's second colour); spec['police']
    adds the light bar's two lamp groups (lamp_siren_a red, lamp_siren_b blue) and black bar
    steel; steel wheels add their paint and plated hub caps."""
    mats = _base_materials(spec)
    if 'secondary_color' in spec:
        mats['paint_secondary'] = M.car_paint(color=M.hex_color(spec['secondary_color']),
                                              metallic_flake=0.2, gloss=0.88, dirt=0.16, seed=4,
                                              name='paint_secondary')
    if spec.get('police'):
        # Deep red and blue glass when off (the library lamp would read pale pink and lilac).
        mats['lamp_siren_a'] = _lamps.lamp((1.0, 0.06, 0.04), 12.0, 'lamp_siren_a', value=0.5)
        mats['lamp_siren_b'] = _lamps.lamp((0.08, 0.28, 1.0), 12.0, 'lamp_siren_b', value=0.55)
        mats['bar'] = M.painted_metal(color=(0.025, 0.025, 0.027), gloss=0.45, chips=0.2, rust=0.05,
                                      grime=0.3, dust=0.25, fade=0.1, seed=19, name='bar_steel')
    if spec.get('police') or spec.get('chrome') or spec.get('wheel', {}).get('style') == 'steel':
        mats['chrome'] = M.chrome(smudges=0.35, seed=18, name='plated_chrome')
        mats['steel'] = M.painted_metal(color=(0.022, 0.022, 0.024), gloss=0.6, chips=0.08,
                                        rust=0.05, grime=0.35, dust=0.3, fade=0.1, seed=17,
                                        name='wheel_steel')
    return mats


def _base_materials(spec):
    """The materials every car has."""
    return {
        'paint': M.car_paint(color=M.hex_color(spec['color']), metallic_flake=0.35, gloss=0.88,
                             dirt=0.16, seed=3, name='paint'),
        'glass': M.glass(tint=(0.2, 0.25, 0.26), opacity=0.5, name='glass'),
        'gap': M.rubber(dust=0.2, seed=5, name='seal_rubber'),
        'liner': M.plastic(color=(0.018, 0.018, 0.02), roughness=0.7, seed=6, name='liner_plastic'),
        'underbody': M.plastic(color=(0.02, 0.02, 0.022), roughness=0.75, seed=7,
                               name='underbody_plastic'),
        'trim': M.plastic(color=(0.02, 0.02, 0.023), roughness=0.45, seed=8, name='trim_plastic'),
        'grille': M.plastic(color=(0.012, 0.012, 0.014), roughness=0.6, seed=16, name='grille_plastic'),
        'seat': M.leather(color=spec.get('seat_color', (0.09, 0.085, 0.08)), seed=9,
                          name='seat_cover'),
        'tyre': M.rubber(seed=10, name='tyre_rubber'),
        'alloy': M.brushed_metal(color=(0.6, 0.61, 0.63), roughness=0.3, grime=0.3, seed=11,
                                 name='rim_alloy'),
        'disc': M.cast_metal(color=(0.3, 0.3, 0.31), roughness=0.4, rust=0.15, seed=12,
                             name='brake_disc'),
        'caliper': M.cast_metal(color=(0.12, 0.12, 0.125), seed=13, name='caliper_iron'),
        'dark': M.cast_metal(color=(0.03, 0.03, 0.032), seed=14, name='wheel_back'),
        'lamp_head': M.lamp(color=(1.0, 0.95, 0.86), strength=10.0, name='lamp_head'),
        # Red and amber lenses keep their colour when off (see _lamps.lamp).
        'lamp_tail': _lamps.lamp((0.9, 0.04, 0.03), 3.0, 'lamp_tail', value=0.62),
        'lamp_brake': _lamps.lamp((1.0, 0.06, 0.04), 9.0, 'lamp_brake', value=0.58),
        'lamp_reverse': M.lamp(color=(1.0, 1.0, 0.95), strength=6.0, name='lamp_reverse'),
        'lamp_indicator_r': _lamps.lamp((1.0, 0.5, 0.05), 6.0, 'lamp_indicator_r', value=0.75),
        **_lamps.materials(),
    }


def cut_panels(shell, spec):
    """The standard division of a four-door body: hood, trunk, bumpers, front door, rear door
    (joined back into the body), glass, pillars, lamps and lower trim."""
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
    shell.assign('door_rr', ('sill_rear', 'door_rear'), (rail + 1, last))
    shell.assign('window_front', ('roof_front', 'cowl'), (0, rail - 1), material='glass', gap=False)
    shell.assign('window_rear', ('deck', 'roof_rear'), (0, rail - 1), material='glass', gap=False)
    shell.assign('window_r', ('quarter_rear', 'pillar_b'), (rail + 1, glass), material='glass',
                 gap=False)
    shell.paint(('pillar_b', 'door_rear'), (rail + 1, glass), 'trim')
    shell.paint(('quarter_rear', 'glass_front'), (rail, rail + 1), 'trim')   # window frames
    shell.paint(('lamp_rear', 'nose'), (glass, belt + 1), 'lamp_head')
    shell.paint(('tail', 'lamp_tail_front'), (glass, belt + 1), 'lamp_tail')
    shell.paint(('tail', 'lamp_tail_front'), (belt + 1, belt + 2), 'lamp_indicator_r')
    for rows in (('tail', 'fascia_r'), ('sill_rear', 'sill_front'), ('fascia_f', 'nose')):
        shell.paint(rows, (last - 1, last), 'trim')
    for rows, cols in spec.get('secondary', []):          # livery: (rows, columns) of the grid
        shell.paint(rows, cols, 'paint_secondary')
    for rows, cols, material in spec.get('paint', []):    # a car's own (cladding, dark pillars)
        shell.paint(rows, cols, material)


def make_car(a, spec):
    """Models the car and registers its parts, anchors and collision proxies on the builder."""
    mats = materials(spec)
    shell = B.Shell(spec)
    cut_panels(shell, spec)
    parts = shell.build(mats)
    # Lamp units with depth: lens over a recessed bed with pods and light guides (_lamps).
    for name in list(parts):
        inner = _lamps.recess(parts[name], mats)
        if inner:
            parts[name] = scene.join([parts[name]] + inner, name)
    curves, ys = spec['curves'], shell.ys
    tail, nose = shell.cap_y(0, 0.0, 0.6), shell.cap_y(-1, 0.0, 0.5)
    radius, half_track = spec['wheel_radius'], 0.5 * spec['track']
    cabin = spec['cabin']

    rear_door = [parts.pop('door_rr')] if 'door_rr' in parts else []
    parts['lod0'] = scene.join([parts['lod0']] + rear_door + _parts.interior_half(spec, mats), 'lod0')
    foot = shell.point('glass_front', B.COL_GLASS_BASE)
    parts['door_fr'] = scene.join([parts['door_fr']] + _parts.mirror(
        'mirror', (foot[0] - 0.02, foot[1] + 0.03, foot[2] + 0.02), mats), 'door_fr')
    # Door handles near the lock edge of each door, a little under the shoulder crease.
    for panel, lock_edge in (('door_fr', 'door_rear'), ('lod0', 'sill_rear')):
        y = ys[shell.row(lock_edge)] + 0.17
        row = min(range(len(ys)), key=lambda i: abs(ys[i] - y))
        x, _y, z = shell.point(row, B.COL_BELT + 2)
        parts[panel] = scene.join([parts[panel], *_parts.door_handle(f'handle_{panel}', (x, y, z),
                                                                     mats)], panel)
    # A car's own fittings: spec['fittings'](shell, spec, mats) -> {part: [objects]}. Objects
    # for a mirrored part (lod0, bumper_f, ...) are its right half; a new part (light_bar) is
    # modelled whole, baked once and hung under lod0 like the moving parts.
    for name, objects in (spec['fittings'](shell, spec, mats) if 'fittings' in spec else {}).items():
        parts[name] = scene.join(([parts[name]] if name in parts else []) + objects, name)

    def on_top(mark):
        y = ys[shell.row(mark)]
        return (0.0, y, curves['top'](y))

    def between(first, second):
        return tuple(0.5 * (p + q) for p, q in zip(on_top(first), on_top(second)))

    origins = {'lod0': (0.0, 0.0, 0.0), 'hood': on_top('cowl'), 'trunk': on_top('deck'),
               'bumper_f': (0.0, ys[-1] - 0.15, 0.40), 'bumper_r': (0.0, ys[0] + 0.15, 0.45),
               'window_front': between('roof_front', 'cowl'),
               'window_rear': between('deck', 'roof_rear'),
               'door_fr': shell.point('door_front', B.COL_BELT + 2),
               'window_r': shell.point((shell.row('quarter_rear') + shell.row('pillar_b')) // 2,
                                       B.COL_RAIL + 2)}
    for name, obj in parts.items():
        scene.set_origin(obj, origins.get(name, (0.0, 0.0, 0.0)))
        a.add(obj, mirror='X' if name in MIRRORED else None)

    hub = (half_track, spec['axle_f'], radius)
    parts['wheel_fr'] = a.add(_parts.wheel('wheel_fr', hub, radius, spec['tyre_width'], mats,
                                           **spec.get('wheel', {})))
    steering_hub = (-cabin['seat_x'], cabin['seat_y'] + 0.44, cabin['belt'] - 0.04)
    steering = _parts.steering_wheel('steering_wheel_mesh', mats)
    modify.transform(steering, rotation=(0.5 * math.pi - COLUMN_TILT, 0.0, 0.0), location=steering_hub)
    scene.set_origin(steering, steering_hub)
    _mesh.tagged([steering], 0)
    parts['steering_wheel_mesh'] = a.add(steering)
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
    seat_x, seat_y, seat_z = cabin['seat_x'], cabin['seat_y'], cabin['floor'] + 0.31
    a.add_anchor('anchor_seat_driver', (-seat_x, seat_y, seat_z), forward=(0, 1, 0))
    a.add_anchor('anchor_seat_passenger_1', (seat_x, seat_y, seat_z), forward=(0, 1, 0))
    if 'rear_seat_y' in cabin:
        a.add_anchor('anchor_seat_passenger_2', (-seat_x, cabin['rear_seat_y'], seat_z), forward=(0, 1, 0))
        a.add_anchor('anchor_seat_passenger_3', (seat_x, cabin['rear_seat_y'], seat_z), forward=(0, 1, 0))
    a.add_anchor('anchor_door_driver', (-0.5 * width - 0.55, seat_y + 0.25, 0.0), forward=(1, 0, 0))
    a.add_anchor('anchor_door_passenger', (0.5 * width + 0.55, seat_y + 0.25, 0.0), forward=(-1, 0, 0))
    door_y = 0.5 * (ys[shell.row('door_rear')] + ys[shell.row('door_front')])
    door = shell.point(min(range(len(ys)), key=lambda i: abs(ys[i] - door_y)), B.COL_BELT + 4)
    head = shell.point('nose', B.COL_BELT)
    lamp = shell.point('tail', B.COL_BELT)
    for side, sign in (('l', -1.0), ('r', 1.0)):
        a.add_anchor(f'anchor_decal_door_{side}', (sign * (door[0] + 0.003), door[1], door[2]),
                     forward=(sign, 0, 0))
        a.add_anchor(f'anchor_light_head_{side}', (sign * 0.85 * head[0],
                                                   shell.cap_y(-1, 0.85 * head[0], head[2]), head[2]),
                     forward=(0, 1, 0))
        a.add_anchor(f'anchor_light_tail_{side}', (sign * 0.85 * lamp[0],
                                                   shell.cap_y(0, 0.85 * lamp[0], lamp[2]), lamp[2]),
                     forward=(0, -1, 0))
    exhausts = spec.get('exhausts', [0.48])
    for index, x in enumerate(exhausts):
        a.add_anchor(f'anchor_exhaust_{index + 1}', (x, shell.cap_y(0, x, spec['exhaust_z']),
                                                     spec['exhaust_z']), forward=(0, -1, 0))
    a.add_anchor('anchor_camera', (0.0, seat_y, height), forward=(0, 1, 0))
    a.add_anchor('anchor_plate_f', (0.0, shell.cap_y(-1, 0.0, spec['plate_f_z']) + 0.004,
                                    spec['plate_f_z']), forward=(0, 1, 0))
    a.add_anchor('anchor_plate_r', (0.0, shell.cap_y(0, 0.0, spec['plate_r_z']) - 0.004,
                                    spec['plate_r_z']), forward=(0, -1, 0))
    for name, location, forward in spec.get('anchors', []):
        a.add_anchor(name, location, forward=forward)

    clearance, belt = spec['clearance'], cabin['belt']
    a.collider_box('body', (0.0, 0.5 * (tail + nose), 0.5 * (clearance + belt)),
                   (width, nose - tail, belt - clearance))
    cabin_rear, cabin_front = ys[shell.row('deck')] + 0.3, ys[shell.row('cowl')] - 0.2
    a.collider_box('cabin', (0.0, 0.5 * (cabin_rear + cabin_front), 0.5 * (belt + height)),
                   (width - 0.45, cabin_front - cabin_rear, height - belt))
    a.set_extra('wheel_radius', radius)
    a.set_extra('track', spec['track'])
    a.set_extra('wheelbase', spec['axle_f'] - spec['axle_r'])
    a.set_extra('seats', 4 if 'rear_seat_y' in cabin else 2)
    a.set_lod_distances(30.0, 80.0)
    a.bake(size=spec.get('atlas', 1024), orm_size=512, normal_size=512, occlusion_distance=0.5)


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
    left = a.material('lamp_indicator_r').copy()
    left.name = 'lamp_indicator_l'
    for name in MIRRORED:
        if name in parts:
            _mesh.mirror_normals(parts[name])
            _mesh.rename_material(parts[name], 'lamp_indicator_r', left)
    for source, name in SINGLE:
        if source in parts:
            parts[name] = a.add_baked(_mesh.mirrored_copy(parts[source], name))

    placements = [Matrix.Translation((sign * half_track, y, radius)) @ Matrix.Rotation(turn, 4, 'Z')
                  for y in (spec['axle_f'], spec['axle_r'])
                  for sign, turn in ((1.0, 0.0), (-1.0, math.pi))]
    wheel_local = Matrix.Translation(wheel.matrix_world.translation).inverted()
    for level, target in ((1, spec.get('lod1', 4600)), (2, spec.get('lod2', 1100))):
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
