"""Shared helper of the trucks domain: materials, fittings and the contract with the game.

A truck script models its hull with _grid.loft and its own fittings, using the pieces here
(wheel, lamp_unit, light_bar, beacon, van_mirror, seat, steering_wheel, rounded_block, rail,
plate_recess, chassis), collects them by part name ({'lod0': [...], 'door_fl': [...], ...}) and
hands them to make_truck(a, spec, parts), which joins each part, sets its pivot, registers it,
adds the wheel, the steering wheel, anchors, collision boxes and extras. assemble_truck(a) runs
after the bake: the other three wheels as linked copies (the left ones under unrotated pivots
turned 180 degrees inside), the steering-wheel pivot, lod1 and lod2 as single merged meshes cut
from the baked parts by their level tags and decimated, and every moving part hung under lod0
(so they show at level 0 only).

Every part is modelled whole (no mirrored halves): the left and right lamp groups and the two
siren colours differ by side anyway.

Blender axes: Z up, nose towards +Y, right side +X; the driver sits on the left (-X).
"""
import math

from mathutils import Matrix, Vector

from lib import build, modify, scene
from lib import materials as M

import _grid as G

STATE = {}


def materials(spec):
    """The source materials of a truck by short name (material names set the game roles)."""
    mats = {
        'paint': M.car_paint(color=M.hex_color(spec['color']), metallic_flake=spec.get('flake', 0.1),
                             gloss=0.82, dirt=0.25, seed=3, name='paint'),
        'glass': M.glass(tint=(0.07, 0.085, 0.095), opacity=0.62, name='glass'),
        'liner': M.plastic(color=(0.02, 0.02, 0.022), roughness=0.75, seed=6, name='liner_plastic'),
        'trim': M.plastic(color=(0.022, 0.022, 0.025), roughness=0.5, seed=8, name='trim_plastic'),
        'grille': M.plastic(color=(0.012, 0.012, 0.014), roughness=0.6, seed=16, name='grille_plastic'),
        'seat': M.fabric(color=spec.get('seat_color', (0.05, 0.05, 0.055)), seed=9, name='seat_cloth'),
        'tyre': M.rubber(dust=0.35, seed=10, name='tyre_rubber'),
        'steel': M.painted_metal(color=M.hex_color(spec.get('wheel_color', '#B9BBBE')), gloss=0.55,
                                 chips=0.12, rust=0.08, grime=0.45, dust=0.4, fade=0.1, seed=17,
                                 name='wheel_steel'),
        'chrome': M.chrome(smudges=0.4, seed=18, name='plated_chrome'),
        'dark': M.cast_metal(color=(0.03, 0.03, 0.032), seed=14, name='wheel_back'),
        'chassis': M.painted_metal(color=(0.025, 0.025, 0.027), gloss=0.35, chips=0.25, rust=0.3,
                                   grime=0.6, dust=0.5, fade=0.1, seed=21, name='chassis_steel'),
        'tread': M.brushed_metal(color=(0.55, 0.56, 0.57), roughness=0.35, grime=0.5, seed=22,
                                 name='tread_plate'),
        'pipe': M.cast_metal(color=(0.18, 0.17, 0.16), roughness=0.5, rust=0.45, seed=23,
                             name='exhaust_pipe'),
        'lamp_head': M.lamp(color=(1.0, 0.95, 0.86), strength=10.0, name='lamp_head'),
        'lamp_tail': M.lamp(color=(0.9, 0.04, 0.03), strength=3.0, name='lamp_tail'),
        'lamp_brake': M.lamp(color=(1.0, 0.06, 0.04), strength=9.0, name='lamp_brake'),
        'lamp_reverse': M.lamp(color=(1.0, 1.0, 0.95), strength=6.0, name='lamp_reverse'),
        'lamp_indicator_l': M.lamp(color=(1.0, 0.5, 0.05), strength=6.0, name='lamp_indicator_l'),
        'lamp_indicator_r': M.lamp(color=(1.0, 0.5, 0.05), strength=6.0, name='lamp_indicator_r'),
    }
    if 'secondary_color' in spec:
        mats['paint_secondary'] = M.car_paint(color=M.hex_color(spec['secondary_color']),
                                              metallic_flake=0.05, gloss=0.8, dirt=0.25, seed=4,
                                              name='paint_secondary')
    if spec.get('sirens'):
        mats['lamp_siren_a'] = M.lamp(color=(1.0, 0.06, 0.04), strength=12.0, name='lamp_siren_a')
        mats['lamp_siren_b'] = M.lamp(color=(0.08, 0.28, 1.0), strength=12.0, name='lamp_siren_b')
    return mats


# ---------------------------------------------------------------------------------------------
# Fittings
# ---------------------------------------------------------------------------------------------

def rounded_block(name, low, high, material, mats, bevel=0.025, step=0.35, level=2, segments=2):
    """An evenly tessellated box from `low` to `high` with rounded edges."""
    mesh = G.Mesh()
    mesh.block(low, high, 'm', level, step)
    obj = mesh.to_object(name, {'m': mats[material]})
    G.weld(obj, 1e-5)
    if bevel > 0:
        modify.bevel(obj, width=bevel, segments=segments)
    return G.tag(obj, level, force=True)


def box(name, size, location, material, mats, level=1, bevel=0.0, segments=1):
    """A small library box, optionally bevelled, tagged with its level."""
    obj = build.box(name, size, location=location)
    if bevel > 0:
        modify.bevel(obj, width=bevel, segments=segments)
    return G.part(obj, mats[material], level)


def wheel(name, hub, radius, width, mats, rim_ratio=0.6, segments=20, nuts=8, twin=False):
    """A truck wheel for the right side, origin at `hub`, axle along X, outer face +X: a tyre
    with sidewall, shoulders and a tread groove, a pressed steel dish with vents, a hub dome and
    wheel nuts. twin: a second tyre and rim inboard (rear axles of heavy trucks)."""
    rim, half = radius * rim_ratio, 0.5 * width
    pieces = []
    offsets = [0.0, -(width + 0.03)] if twin else [0.0]
    for index, shift in enumerate(offsets):
        profile = [(rim, -half + 0.016), (rim + 0.035, -half), (radius - 0.04, -half + 0.004),
                   (radius - 0.012, -half + 0.03), (radius, -half + 0.065),
                   (radius, -0.02), (radius - 0.014, -0.012), (radius - 0.014, 0.012), (radius, 0.02),
                   (radius, half - 0.065), (radius - 0.012, half - 0.03), (radius - 0.04, half - 0.004),
                   (rim + 0.035, half), (rim, half - 0.016)]
        tyre = build.lathe(f'tyre{index}', [(r, z + shift) for r, z in profile], segments=segments)
        pieces.append(G.part(tyre, mats['tyre'], 2, angle=35))
        back = build.cylinder(f'back{index}', radius=rim + 0.004, depth=0.012, segments=14,
                              location=(0.0, 0.0, shift - half + 0.05))
        pieces.append(G.part(back, mats['dark'], 2))
    dish = build.lathe('dish', [(rim + 0.008, half - 0.03), (rim + 0.01, half - 0.012),
                                (rim - 0.008, half - 0.018), (rim - 0.025, half - 0.045),
                                (0.74 * rim, half - 0.085), (0.52 * rim, half - 0.08),
                                (0.40 * rim, half - 0.065)], segments=segments)
    pieces.append(G.part(dish, mats['steel'], 1, angle=30))
    dome = build.lathe('dome', [(0.40 * rim, half - 0.066), (0.36 * rim, half - 0.045),
                                (0.22 * rim, half - 0.03), (0.0, half - 0.026)], segments=14)
    pieces.append(G.part(dome, mats['steel'], 1, angle=30))
    nut = build.cylinder('nut', radius=0.016, depth=0.03, segments=6,
                         location=(0.47 * rim, 0.0, half - 0.07))
    modify.radial_array(nut, nuts, axis='Z')
    pieces.append(G.part(nut, mats['chrome'], 0))
    vent = build.cylinder('vent', radius=0.024, depth=0.008, segments=10)
    modify.transform(vent, scale=(1.0, 1.6, 1.0))
    modify.transform(vent, location=(0.0, 0.66 * rim, half - 0.083))
    modify.radial_array(vent, 6, axis='Z')
    pieces.append(G.part(vent, mats['dark'], 1))
    drum = build.cylinder('drum', radius=0.7 * rim, depth=0.12, segments=14,
                          location=(0.0, 0.0, half - 0.2))
    pieces.append(G.part(drum, mats['dark'], 1))
    obj = scene.join(pieces, name)
    modify.transform(obj, rotation=(0.0, 0.5 * math.pi, 0.0))
    modify.transform(obj, location=hub)
    scene.set_origin(obj, hub)
    return G.single_uv(obj)


def lamp_unit(name, centre, width, height, facing, cells, mats, depth=0.06, axis='x', bevel=0.012):
    """A lamp on a face looking along Y (`facing` +1 or -1): a dark bezel standing 1.5 cm proud
    and lens cells across its width (axis 'x', from -X to +X) or up its height (axis 'z', bottom
    to top); cells = [(fraction0, fraction1, material short name)]."""
    x, y, z = centre
    housing = box(f'{name}_housing', (width, depth, height), (x, y - facing * (0.5 * depth - 0.015), z),
                  'trim', mats, level=1, bevel=bevel, segments=1)
    out = [housing]
    front = y + facing * 0.015
    for index, (f0, f1, material) in enumerate(cells):
        if axis == 'x':
            size = ((f1 - f0) * width - 0.016, 0.012, height - 0.026)
            where = (x - 0.5 * width + 0.5 * (f0 + f1) * width, front + facing * 0.002, z)
        else:
            size = (width - 0.026, 0.012, (f1 - f0) * height - 0.016)
            where = (x, front + facing * 0.002, z - 0.5 * height + 0.5 * (f0 + f1) * height)
        out.append(box(f'{name}_cell{index}', size, where, material, mats, level=1,
                       bevel=min(0.006, 0.25 * min(size[0], size[2])), segments=1))
    return out


def light_bar(name, centre, length, mats, depth=0.3, height=0.11, sign=1.0):
    """A low roof light bar: a dark base and twin lens rows, lamp_siren_a on the driver's (-X)
    half and lamp_siren_b on the other, a white take-down lamp between them."""
    x, y, z = centre
    out = [box(f'{name}_base', (length, depth, 0.04), (x, y, z + 0.02), 'trim', mats, 2, 0.012)]
    half = 0.5 * length
    for material, x0, x1 in (('lamp_siren_a', -half + 0.02, -0.11), ('lamp_siren_b', 0.11, half - 0.02),
                             ('lamp_reverse', -0.1, 0.1)):
        out.append(box(f'{name}_{material}', (x1 - x0, depth - 0.04, height - 0.04),
                       (x + 0.5 * (x0 + x1), y, z + 0.04 + 0.5 * (height - 0.04)), material, mats, 2,
                       0.02, 2))
    return out


def beacon(name, centre, size, material, mats, facing=None):
    """A box beacon (corner warning lamp) of `size` on a dark plinth."""
    x, y, z = centre
    sx, sy, sz = size
    return [box(f'{name}_plinth', (sx + 0.02, sy + 0.02, 0.025), (x, y, z + 0.0125), 'trim', mats, 1),
            box(f'{name}_lens', (sx, sy, sz), (x, y, z + 0.025 + 0.5 * sz), material, mats, 2, 0.015, 2)]


def van_mirror(name, side, root, mats, reach=0.24, height=0.34):
    """A big van mirror on two arms: `root` (x, y, z) on the door skin, side +1 right, -1 left."""
    x, y, z = root
    tip = x + side * reach
    arms = []
    for index, dz in enumerate((0.0, height * 0.75)):
        path = [(x, y, z + dz), (x + side * 0.5 * reach, y + 0.02, z + dz + 0.03),
                (tip - side * 0.02, y + 0.03, z + dz + 0.04)]
        arms.append(G.part(build.tube(f'{name}_arm{index}', path, radius=0.012, segments=6), mats['trim'], 1))
    head = box(f'{name}_head', (0.08, 0.06, height), (tip, y + 0.04, z + 0.5 * height - 0.03), 'trim',
               mats, 1, 0.02, 2)
    glass = box(f'{name}_glass', (0.07, 0.006, height - 0.04), (tip, y + 0.008, z + 0.5 * height - 0.03),
                'chrome', mats, 1)
    return arms + [head, glass]


def seat(name, x, y, floor, mats, width=0.5, facing=1.0, back_height=0.66):
    """A cab seat around the hip point (x, y): base, cushion, raked back with a head restraint.
    facing +1 forward (+Y), -1 rearward."""
    s = facing
    parts = [box(f'{name}_base', (width - 0.08, 0.4, floor + 0.2 - floor), (x, y + s * 0.12, floor + 0.1),
                 'trim', mats, 1),
             box(f'{name}_cushion', (width, 0.5, 0.13), (x, y + s * 0.16, floor + 0.25), 'seat', mats, 1,
                 0.035, 2)]
    back = build.box(f'{name}_back', (width, 0.13, back_height))
    modify.bevel(back, width=0.035, segments=2)
    modify.transform(back, rotation=(math.radians(-14.0) * s, 0.0, 0.0),
                     location=(x, y - s * 0.17, floor + 0.3 + 0.5 * back_height))
    parts.append(G.part(back, mats['seat'], 1))
    parts.append(box(f'{name}_head', (0.28, 0.1, 0.2), (x, y - s * 0.25, floor + 0.33 + back_height + 0.08),
                     'seat', mats, 1, 0.03, 2))
    return parts


def steering_wheel(name, mats, radius=0.2):
    """A steering wheel in its own frame: the rim in the XY plane about the origin (the hub),
    the column along -Z."""
    count = 24
    path = [(radius * math.cos(math.tau * n / count), radius * math.sin(math.tau * n / count), 0.0)
            for n in range(count)]
    rim = build.tube('rim', path, radius=0.017, segments=6, caps=False, closed_path=True)
    parts = [rim, build.cylinder('boss', radius=0.065, depth=0.05, segments=12, location=(0.0, 0.0, -0.03))]
    for angle in (0.0, 0.5 * math.pi, math.pi):
        spoke = build.box(f'spoke{angle}', (radius - 0.04, 0.04, 0.014), location=(0.5 * radius + 0.02, 0.0, -0.018))
        modify.transform(spoke, rotation=(0.0, 0.0, angle + math.pi))
        parts.append(spoke)
    parts.append(build.cylinder('column', radius=0.032, depth=0.35, segments=8, location=(0.0, 0.0, -0.22)))
    for piece in parts:
        G.part(piece, mats['trim'], 0)
    return scene.join(parts, name)


def rail(name, points, mats, radius=0.016, material='chrome', level=1):
    """A grab rail or bar along a polyline of points."""
    return G.part(build.tube(name, points, radius=radius, segments=8), mats[material], level)


def plate_recess(name, centre, facing, mats, size=(0.34, 0.17)):
    """A dark plate recess on a face looking along Y: the game paints the plate at its centre."""
    x, y, z = centre
    return [box(name, (size[0], 0.012, size[1]), (x, y + facing * 0.004, z), 'trim', mats, 1, 0.004)]


def chassis(spec, mats, y0, y1, z_top, frame_x=0.45):
    """Ladder frame rails, axle beams, a fuel tank and a differential seen under the body."""
    out = []
    for sign in (-1.0, 1.0):
        out.append(rounded_block(f'rail{sign}', (sign * frame_x - 0.05, y0, z_top - 0.2),
                                 (sign * frame_x + 0.05, y1, z_top), 'chassis', mats, 0.0, 0.6, 1))
    radius, track = spec['wheel_radius'], spec['track']
    for y in (spec['axle_f'], spec['axle_r']):
        beam = build.cylinder(f'axle{y}', radius=0.05, depth=track - 0.2, segments=8)
        modify.transform(beam, rotation=(0.0, 0.5 * math.pi, 0.0), location=(0.0, y, radius))
        out.append(G.part(beam, mats['chassis'], 1))
    diff = build.sphere('diff', radius=0.15, segments=10, rings=6, location=(0.0, spec['axle_r'], radius))
    out.append(G.part(diff, mats['chassis'], 1))
    tank = rounded_block('tank', (-frame_x - 0.4, -0.9, z_top - 0.42), (-frame_x - 0.06, 0.1, z_top - 0.08),
                         'chassis', mats, 0.04, 0.5, 1)
    out.append(tank)
    return out


def exhaust(spec, mats, x, y, z, length=0.45):
    """A tail pipe pointing rearward, its mouth at (x, y, z)."""
    pipe = build.cylinder('exhaust', radius=0.04, depth=length, segments=10)
    modify.transform(pipe, rotation=(0.5 * math.pi, 0.0, 0.0), location=(x, y + 0.5 * length, z))
    return [G.part(pipe, mats['pipe'], 1)]


# ---------------------------------------------------------------------------------------------
# The contract
# ---------------------------------------------------------------------------------------------

def make_truck(a, spec, parts, mats):
    """Joins and registers the parts ({name: [objects]}), adds the right front wheel and the
    steering wheel, the anchors (spec['anchors'] = [(name, location, forward, extras)]), the
    collision boxes (spec['colliders'] = [(name, centre, size)]) and the extras.
    spec['origins'] = {part: pivot}."""
    joined = {}
    for name, objects in parts.items():
        objects = [obj for obj in objects if obj is not None]
        if not objects:
            continue
        obj = scene.join(objects, name) if len(objects) > 1 else objects[0]
        obj.name = name
        G.single_uv(obj)
        scene.set_origin(obj, spec['origins'].get(name, (0.0, 0.0, 0.0)))
        joined[name] = a.add(obj, unwrap='smart')
    radius, half_track = spec['wheel_radius'], 0.5 * spec['track']
    hub = (half_track, spec['axle_f'], radius)
    joined['wheel_fr'] = a.add(wheel('wheel_fr', hub, radius, spec['tyre_width'], mats,
                                     rim_ratio=spec.get('rim_ratio', 0.6)))
    if spec.get('twin_rear'):
        joined['wheel_rr'] = a.add(wheel('wheel_rr', (half_track, spec['axle_r'], radius), radius,
                                         spec['tyre_width'], mats, rim_ratio=spec.get('rim_ratio', 0.6),
                                         twin=True))
    steering = spec['steering']
    hub_point, tilt = steering['hub'], math.radians(steering['tilt'])
    mesh = steering_wheel('steering_wheel_mesh', mats, steering.get('radius', 0.2))
    modify.transform(mesh, rotation=(0.5 * math.pi - tilt, 0.0, 0.0), location=hub_point)
    scene.set_origin(mesh, hub_point)
    joined['steering_wheel_mesh'] = a.add(G.single_uv(mesh))
    STATE[a.id] = {'spec': spec, 'parts': joined}

    if not a.output_path:
        # Source preview only: stand-ins for the other wheels.
        for name, x, y, turn in (('preview_fl', -half_track, spec['axle_f'], True),
                                 ('preview_rl', -half_track, spec['axle_r'], True),
                                 ('preview_rr', half_track, spec['axle_r'], False)):
            if name == 'preview_rr' and spec.get('twin_rear'):
                continue
            copy = scene.duplicate(joined['wheel_fr'], name)
            if turn:
                modify.transform(copy, rotation=(0.0, 0.0, math.pi))
            modify.transform(copy, location=(x, y, radius))
            copy.location = (0.0, 0.0, 0.0)
            a.add(copy)

    for name, location, forward, extras in spec['anchors']:
        a.add_anchor(name, location, forward=forward, **extras)
    for name, centre, size in spec['colliders']:
        a.collider_box(name, centre, size)
    a.set_extra('wheel_radius', radius)
    a.set_extra('track', spec['track'])
    a.set_extra('wheelbase', round(spec['axle_f'] - spec['axle_r'], 3))
    a.set_extra('seats', spec['seats'])
    a.set_lod_distances(*spec.get('lod_distances', (35.0, 90.0)))
    # Texels go to what is seen: liners, chassis and seats behind glass get a fraction.
    a.bake(size=spec.get('atlas', 1024), orm_size=512, normal_size=512, occlusion_distance=0.6,
           material_texels={'liner_plastic': 0.12, 'chassis_steel': 0.3, 'seat_cloth': 0.35,
                            'exhaust_pipe': 0.5, 'wheel_back': 0.3})


def _world_copy(obj, matrix, name):
    """A free copy of a mesh with `matrix` baked into its vertices."""
    copy = scene.duplicate(obj, name)
    copy.parent = None
    copy.data.transform(matrix)
    copy.matrix_world = Matrix.Identity(4)
    return copy


def assemble_truck(a):
    """After the bake: the other wheels, the steering pivot, lod1 and lod2, the hierarchy."""
    state = STATE[a.id]
    spec, parts = state['spec'], state['parts']
    body, wheel_fr = parts['lod0'], parts['wheel_fr']
    radius, half_track = spec['wheel_radius'], 0.5 * spec['track']
    wheel_rr = parts.get('wheel_rr', wheel_fr)
    placements = []
    for source, y in ((wheel_fr, spec['axle_f']), (wheel_rr, spec['axle_r'])):
        local = Matrix.Translation(source.matrix_world.translation).inverted()
        for sign, turn in ((1.0, 0.0), (-1.0, math.pi)):
            placements.append((source, Matrix.Translation((sign * half_track, y, radius))
                               @ Matrix.Rotation(turn, 4, 'Z') @ local))
    moving = [name for name in parts if name not in ('lod0',)]
    for level, target in ((1, spec.get('lod1', 4600)), (2, spec.get('lod2', 1150))):
        pieces = [_world_copy(obj, obj.matrix_world.copy(), f'piece_{name}')
                  for name, obj in parts.items() if name not in ('wheel_fr', 'wheel_rr')]
        pieces += [_world_copy(source, placement @ source.matrix_world, f'piece_wheel{n}')
                   for n, (source, placement) in enumerate(placements)]
        merged = scene.join(pieces, f'lod{level}')
        scene.set_origin(merged, (0.0, 0.0, 0.0))
        G.delete_faces(merged, lambda keep, _material, level=level: keep < level)
        G.weld(merged, 0.008)
        count = scene.triangle_count(merged)
        if count > target:
            modify.decimate(merged, ratio=target / count)
        G.drop_unused_materials(merged)
        a.add_baked(merged)

    children = [parts[name] for name in moving if name != 'steering_wheel_mesh']
    if 'wheel_rr' not in parts:
        rear = scene.duplicate(wheel_fr, 'wheel_rr', linked=True)
        rear.matrix_world = Matrix.Translation((half_track, spec['axle_r'], radius))
        children.append(a.add_baked(rear))
    for name, source, y in (('wheel_fl', wheel_fr, spec['axle_f']), ('wheel_rl', wheel_rr, spec['axle_r'])):
        pivot = scene.add_empty(name, (-half_track, y, radius))
        copy = scene.duplicate(source, f'{name}_mesh', linked=True)
        copy.parent = pivot
        copy.matrix_parent_inverse = Matrix.Identity(4)
        copy.location = (0.0, 0.0, 0.0)
        copy.rotation_euler = (0.0, 0.0, math.pi)
        a.extra_objects.append(pivot)
        a.add_baked(copy)
        children.append(pivot)
    tilt = math.radians(spec['steering']['tilt'])
    column = (0.0, -math.cos(tilt), math.sin(tilt))
    pivot = scene.add_empty('steering_wheel', spec['steering']['hub'],
                            forward=(0.0, math.sin(tilt), math.cos(tilt)), up=column)
    scene.parent_to(parts['steering_wheel_mesh'], pivot)
    a.extra_objects.append(pivot)
    children.append(pivot)
    for child in children:
        scene.parent_to(child, body)


def door_panel(obj, gap=0.006, thickness=0.035):
    """Turns a cut-out skin panel into a door: shrunk for the shut line and given a wall."""
    G.shrink(obj, gap, axes=(1, 2))
    modify.solidify(obj, thickness=thickness, offset=-1.0)
    return G.tag(obj, 2, force=False)


def lid_panel(obj, gap=0.006, thickness=0.02):
    """A bonnet: shrunk in plan for its shut line and given a wall."""
    G.shrink(obj, gap, axes=(0, 1))
    modify.solidify(obj, thickness=thickness, offset=-1.0)
    return obj


def to_objects(meshes, mats, angle=35.0):
    """{part: Mesh} -> {part: object}."""
    return {name: mesh.to_object(name, mats, angle) for name, mesh in meshes.items()}


def vec(*values):
    return Vector(values)
