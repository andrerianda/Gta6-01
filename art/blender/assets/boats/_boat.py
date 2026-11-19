"""Boat kit: what the speedboat and the police boat share.

The hull is an open loft of sections from the port sheer down to the keel and up to the starboard
sheer. Each section is drawn from a key table (y, keel z, chine x, chine z, sheer x, sheer z)
through a smooth cubic in y: a deep-vee bottom from the keel to the chine with two spray rails
(small downward steps), a reversed chine lip, and flared topsides to the sheer. The shell is
solidified inwards, the transom is a plate cut to the stern section, and decks are sheets that
arch across between the sheers. Faces take the antifouling, boot stripe, hull stripe and topside
paint by height (a livery band can rise toward the bow).

Moving parts are modelled in place with their origins on their pivots: outboards (engine_l /
engine_r, origin on the steering pivot at the transom; the game swings them about the vertical
axis) with their propellers (origin at the hub, spinning about Y), and the helm's steering wheel
(an empty on the hub whose local Z runs up the column toward the helmsman; the wheel mesh is its
child). assemble_boat makes lod1 and lod2 as merged, decimated copies of the body.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from lib import build, modify, profiles, scene, shading

STATE = {}

# Fractions along the bottom (keel to chine) where the spray rails step down.
RAILS = (0.34, 0.66)


def curve(keys, y, column):
    """Cubic Hermite through keys[i][0] -> keys[i][column] (keys sorted by y)."""
    keys = sorted(keys, key=lambda key: key[0])
    ys = [key[0] for key in keys]
    if y <= ys[0]:
        return keys[0][column]
    if y >= ys[-1]:
        return keys[-1][column]
    i = max(index for index in range(len(ys) - 1) if ys[index] <= y)
    y0, y1 = ys[i], ys[i + 1]
    v0, v1 = keys[i][column], keys[i + 1][column]

    def slope(k):
        a, b = max(k - 1, 0), min(k + 1, len(ys) - 1)
        return (keys[b][column] - keys[a][column]) / (ys[b] - ys[a])

    h = y1 - y0
    t = (y - y0) / h
    m0, m1 = slope(i) * h, slope(i + 1) * h
    t2, t3 = t * t, t * t * t
    return ((2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * v1
            + (t3 - t2) * m1)


def hull_station(keys, y):
    """(keel z, chine x, chine z, sheer x, sheer z) at y."""
    return tuple(curve(keys, y, column) for column in (1, 2, 3, 4, 5))


def half_section(keys, y, rail_depth=0.022):
    """Starboard half of a section, keel to sheer, as (x, z) points."""
    keel, cx, cz, sx, sz = hull_station(keys, y)
    dx, dz = cx, cz - keel
    length = max(math.hypot(dx, dz), 1e-6)
    nx, nz = dz / length, -dx / length                 # outward (down and out) from the bottom
    points = [(0.0, keel), (0.04 * cx, keel + 0.04 * dz)]
    for t in RAILS:
        for f, bump in ((t - 0.035, 0.0), (t, rail_depth), (t + 0.012, 0.0)):
            points.append((f * cx + nx * bump, keel + f * dz + nz * bump))
    points.append((cx, cz))
    points.append((cx + 0.045, cz + 0.004))            # reversed chine lip
    points.append((cx + 0.050, cz + 0.045))
    for t in (0.30, 0.62, 0.88):
        flare = math.sin(0.5 * math.pi * t)
        points.append((cx + 0.05 + (sx - cx - 0.05) * flare, cz + 0.045 + (sz - cz - 0.045) * t))
    points.append((sx, sz))
    return points


def section(keys, y):
    """Port sheer -> keel -> starboard sheer, as 3D points."""
    half = half_section(keys, y)
    port = [(-x, y, z) for x, z in reversed(half[1:])]
    return port + [(x, y, z) for x, z in half]


def stations(start, end, step):
    count = max(2, int(round((end - start) / step)) + 1)
    return [start + (end - start) * i / (count - 1) for i in range(count)]


def hull_shell(name, keys, step=0.30, thickness=0.045):
    ys = stations(keys[0][0], keys[-1][0], step)
    obj = build.loft(name, [section(keys, y) for y in ys], closed=False)
    modify.solidify(obj, thickness=thickness, offset=0.0)
    return shading.recalc_normals(obj)


def transom(name, keys, thickness=0.05):
    y = keys[0][0]
    front = section(keys, y + 0.02)
    back = [(x, y - thickness + 0.02, z) for x, _y, z in front]
    obj = build.loft(name, [back, front], closed=True, cap_start=True, cap_end=True)
    return shading.recalc_normals(obj)


def deck(name, keys, start, end, step=0.25, crown=0.05, inset=0.0, lift=0.0):
    """A sheet arched across between the sheers from y=start to y=end."""
    rows = []
    for y in stations(start, end, step):
        _keel, _cx, _cz, sx, sz = hull_station(keys, y)
        half = max(sx - inset, 0.01)
        row = []
        for j in range(9):
            u = -1.0 + 2.0 * j / 8.0
            row.append((half * u, y, sz + lift + crown * half * (1.0 - u * u)))
        rows.append(row)
    obj = build.loft(name, rows, closed=False)
    modify.solidify(obj, thickness=0.03, offset=-1.0)
    return shading.recalc_normals(obj)


def sheer_line(keys, side, start, end, step=0.25, drop=0.0, inset=0.0):
    points = []
    for y in stations(start, end, step):
        _keel, _cx, _cz, sx, sz = hull_station(keys, y)
        points.append((side * (sx - inset), y, sz - drop))
    return points


def assign(obj, materials, choose):
    """Gives each face materials[choose(centre, normal)]."""
    mesh = obj.data
    mesh.materials.clear()
    for material in materials:
        mesh.materials.append(material)
    indices = [choose(polygon.center.copy(), polygon.normal.copy()) for polygon in mesh.polygons]
    mesh.polygons.foreach_set('material_index', indices)
    mesh.update()
    return prune(obj)


def prune(obj):
    mesh = obj.data
    used = sorted({polygon.material_index for polygon in mesh.polygons})
    if len(used) == len(mesh.materials):
        return obj
    materials = [mesh.materials[index] for index in used]
    remap = {old: new for new, old in enumerate(used)}
    indices = [remap[polygon.material_index] for polygon in mesh.polygons]
    mesh.materials.clear()
    for material in materials:
        mesh.materials.append(material)
    mesh.polygons.foreach_set('material_index', indices)
    mesh.update()
    return obj


def mat(obj, material):
    scene.set_material(obj, material)
    return obj


def box(name, size, location, material, rotation=(0.0, 0.0, 0.0), bevel=0.0):
    obj = build.box(name, size=size)
    if bevel:
        modify.bevel(obj, width=bevel, segments=2 if bevel > 0.03 else 1)
    modify.transform(obj, rotation=rotation)
    modify.transform(obj, location=location)
    return mat(obj, material)


def rod(name, start, end, radius, material, segments=8, caps=True):
    obj = build.tube(name, [Vector(start), Vector(end)], radius=radius, segments=segments,
                     caps=caps)
    return mat(obj, material)


def tube(name, points, radius, material, segments=8, caps=True):
    obj = build.tube(name, [Vector(point) for point in points], radius=radius,
                     segments=segments, caps=caps)
    return mat(obj, material)


def axis_cylinder(name, radius, depth, centre, axis, material, segments=16, radius_top=None,
                  caps=True):
    """A cylinder along 'X', 'Y' or 'Z' (its +Z end towards +axis) centred on `centre`."""
    obj = build.cylinder(name, radius=radius, depth=depth, segments=segments,
                         radius_top=radius_top, caps=caps)
    rotation = {'X': (0.0, 0.5 * math.pi, 0.0), 'Y': (-0.5 * math.pi, 0.0, 0.0),
                'Z': (0.0, 0.0, 0.0)}[axis]
    modify.transform(obj, rotation=rotation)
    modify.transform(obj, location=centre)
    return mat(obj, material)


def smooth(points, subdivisions=3):
    return profiles.smooth_path([tuple(point) for point in points], subdivisions)


def build_loft(name, rows):
    return build.loft(name, rows, closed=False)


def outboard(side_name, x, transom_y, mats, scale=1.0):
    """An outboard engine (origin on its steering pivot at the transom) and its propeller
    (origin at the hub, spinning about Y), in place."""
    s = scale
    pivot = (x, transom_y - 0.10 * s, 0.62 * s)
    cy = transom_y - 0.48 * s
    parts = [
        box(f'cowl_{side_name}', (0.46 * s, 0.66 * s, 0.58 * s), (x, cy - 0.02 * s, 1.08 * s),
            mats['cowl'], bevel=0.09 * s),
        box(f'cowl_cap_{side_name}', (0.40 * s, 0.56 * s, 0.10 * s), (x, cy - 0.02 * s, 1.38 * s),
            mats['cowl'], bevel=0.045 * s),
        box(f'cowl_band_{side_name}', (0.47 * s, 0.67 * s, 0.05 * s), (x, cy - 0.02 * s,
                                                                         0.84 * s),
            mats['engine_trim'], bevel=0.02 * s),
        box(f'bracket_{side_name}', (0.30 * s, 0.14 * s, 0.42 * s), (x, transom_y - 0.09 * s,
                                                                      0.66 * s),
            mats['engine_trim'], bevel=0.02 * s),
        box(f'midsection_{side_name}', (0.20 * s, 0.34 * s, 0.86 * s), (x, cy + 0.03 * s,
                                                                         0.36 * s),
            mats['engine_trim'], bevel=0.05 * s),
        box(f'cavitation_plate_{side_name}', (0.34 * s, 0.46 * s, 0.022 * s),
            (x, cy - 0.04 * s, -0.10 * s), mats['engine_trim'], bevel=0.008 * s),
        axis_cylinder(f'gearcase_{side_name}', 0.075 * s, 0.52 * s, (x, cy - 0.04 * s,
                                                                     -0.30 * s),
                      'Y', mats['engine_trim'], 14),
        box(f'gear_strut_{side_name}', (0.07 * s, 0.26 * s, 0.24 * s), (x, cy + 0.02 * s,
                                                                         -0.19 * s),
            mats['engine_trim'], bevel=0.02 * s),
        box(f'skeg_{side_name}', (0.025 * s, 0.24 * s, 0.22 * s), (x, cy - 0.02 * s, -0.46 * s),
            mats['engine_trim'], bevel=0.008 * s),
        rod(f'tilt_ram_{side_name}', (x, transom_y - 0.05 * s, 0.50 * s),
            (x, cy + 0.12 * s, 0.70 * s), 0.025 * s, mats['chrome'], 8),
    ]
    engine = scene.join(parts, f'engine_{side_name}')
    scene.set_origin(engine, pivot)
    hub = (x, cy - 0.34 * s, -0.30 * s)
    prop_parts = [axis_cylinder(f'prop_hub_{side_name}', 0.055 * s, 0.20 * s, hub, 'Y',
                                mats['prop'], 12, radius_top=0.035 * s)]
    for k in range(3):
        blade = build.box(f'prop_blade_{side_name}_{k}', size=(0.13 * s, 0.012 * s, 0.145 * s))
        modify.bevel(blade, width=0.005 * s, segments=1)
        modify.transform(blade, location=(0.0, 0.0, 0.115 * s))
        modify.transform(blade, rotation=(0.0, math.radians(18.0), 0.0))
        modify.transform(blade, rotation=(math.radians(25.0), 0.0, 0.0))
        modify.transform(blade, rotation=(0.0, math.tau * k / 3.0, 0.0))
        modify.transform(blade, location=hub)
        prop_parts.append(mat(blade, mats['prop']))
    propeller = scene.join(prop_parts, f'propeller_{side_name}')
    scene.set_origin(propeller, hub)
    return engine, propeller


def steering_wheel_mesh(name, hub, column, mats, radius=0.17):
    """A destroyer-style wheel in place: rim, three spokes, a hub, facing along `column`."""
    parts = []
    ring = [(radius * math.cos(math.tau * k / 24), radius * math.sin(math.tau * k / 24), 0.0)
            for k in range(24)]
    rim = build.tube(name + '_rim', [Vector(p) for p in ring], radius=0.014, segments=8,
                     caps=False, closed_path=True)
    parts.append(mat(rim, mats['wheel']))
    for k in range(3):
        angle = math.tau * k / 3.0 + 0.5 * math.pi
        parts.append(rod(f'{name}_spoke_{k}', (0.0, 0.0, 0.02),
                         (radius * math.cos(angle), radius * math.sin(angle), 0.0), 0.009,
                         mats['chrome'], 6))
    parts.append(axis_cylinder(name + '_hub', 0.035, 0.05, (0.0, 0.0, 0.02), 'Z',
                               mats['chrome'], 12))
    obj = scene.join(parts, name)
    frame = scene.facing_matrix(forward=_perpendicular(column), up=column)
    obj.data.transform(frame)
    modify.transform(obj, location=hub)
    return obj


def _perpendicular(column):
    c = Vector(column).normalized()
    return (0.0, c.z, -c.y)


def _world_copy(obj, name):
    copy = scene.duplicate(obj, name)
    copy.parent = None
    copy.data.transform(obj.matrix_world)
    copy.matrix_world = Matrix.Identity(4)
    return copy


def assemble_boat(a):
    """Merged body levels, the steering wheel pivot, propellers under their engines."""
    state = STATE[a.id]
    parts, spec = state['parts'], state['spec']
    for level, target in ((1, spec['lod1']), (2, spec['lod2'])):
        merged = _world_copy(parts['lod0'], f'lod{level}')
        scene.set_origin(merged, (0.0, 0.0, 0.0))
        modify.weld(merged, 0.004)
        count = scene.triangle_count(merged)
        if count > target:
            modify.decimate(merged, ratio=target / count)
        prune(merged)
        a.add_baked(merged)
    column = Vector(spec['column']).normalized()
    pivot = scene.add_empty('steering_wheel', spec['wheel_hub'], forward=_perpendicular(column),
                            up=column)
    a.extra_objects.append(pivot)
    scene.parent_to(parts['steering_wheel_mesh'], pivot)
    for side in ('l', 'r'):
        scene.parent_to(parts[f'propeller_{side}'], parts[f'engine_{side}'])
