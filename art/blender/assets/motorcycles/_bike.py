"""Motorcycle kit: what the sport bike and the chopper share.

Shaping follows the helicopter kit's method: fairings, tanks and tails are closed lofts of
superellipse rings sampled from a short key table (y, half width, bottom, top, exponent) through a
smooth cubic in y, and faces are given materials afterwards by small predicates on (y, relative
height, side, normal), so lamp clusters, seats and vents follow the body lines. Lamp lenses are a
copy of the lamp faces pushed a few millimetres out along their normals (lens_over).

Moving parts are modelled in place in world coordinates with their origins on their pivots:
wheel (tyre, rim, spokes, hub, discs or sprocket; spins about X), the fork's mesh (legs, clamps,
bars, mudguard, calipers) and the swingarm. assemble_bike (called from an asset's assemble) makes
the `fork` empty on the steering axis (local Z along the axis, local X = the bike's right) and
hangs the fork mesh and wheel_f under it, hangs wheel_r under the swingarm, adds the grip anchors
as children of the fork, and makes lod1 and lod2 as merged, decimated copies of the body. The
wheels, fork and swingarm show at every level.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from lib import build, modify, profiles, scene, shading

STATE = {}

RELS = (0.04, 0.10, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 0.86, 0.93, 0.98)


# ---------------------------------------------------------------------------------------------
# Key tables and lofts
# ---------------------------------------------------------------------------------------------

def curve(keys, y, column):
    """Cubic Hermite through keys[i][0] -> keys[i][column] (keys sorted by y, any direction)."""
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


def station(keys, y):
    """(half width, bottom, top, exponent) at y."""
    return tuple(curve(keys, y, column) for column in (1, 2, 3, 4))


def width_factor(rel, exponent):
    return max(0.0, 1.0 - abs(2.0 * rel - 1.0) ** exponent) ** (1.0 / exponent)


def pod_ring(keys, y, rels=RELS):
    half, bottom, top, exponent = station(keys, y)
    points = [(0.0, y, bottom)]
    for rel in rels:
        points.append((half * width_factor(rel, exponent), y, bottom + (top - bottom) * rel))
    points.append((0.0, y, top))
    for rel in reversed(rels):
        points.append((-half * width_factor(rel, exponent), y, bottom + (top - bottom) * rel))
    return points


def stations(start, end, step):
    count = max(2, int(round((end - start) / step)) + 1)
    return [start + (end - start) * i / (count - 1) for i in range(count)]


def pod(name, keys, step=0.05):
    """A closed loft of pod rings from the lowest key y to the highest, capped at both ends."""
    low, high = min(key[0] for key in keys), max(key[0] for key in keys)
    obj = build.loft(name, [pod_ring(keys, y) for y in stations(low, high, step)], closed=True,
                     cap_start=True, cap_end=True)
    return shading.recalc_normals(obj)


def rel_height(keys, point):
    _half, bottom, top, _exponent = station(keys, point.y)
    return (point.z - bottom) / max(top - bottom, 1e-6)


def beam(name, sections, material):
    """A box-section beam with chamfered corners: sections (y, x, z, half width, half height)."""
    rings = []
    for y, x, z, w, h in sections:
        rings.append([(x + w, y, z - 0.6 * h), (x + w, y, z + 0.6 * h), (x + 0.6 * w, y, z + h),
                      (x - 0.6 * w, y, z + h), (x - w, y, z + 0.6 * h), (x - w, y, z - 0.6 * h),
                      (x - 0.6 * w, y, z - h), (x + 0.6 * w, y, z - h)])
    obj = build.loft(name, rings, closed=True, cap_start=True, cap_end=True)
    return mat(shading.recalc_normals(obj), material)


# ---------------------------------------------------------------------------------------------
# Materials per face and small builders
# ---------------------------------------------------------------------------------------------

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
    """Drops material slots no face uses."""
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


def lens_over(obj, name, material_names, lens, offset=0.003):
    """A clear lens: a copy of the faces whose material is in material_names, pushed out along
    the vertex normals by `offset`, in the lens material."""
    copy = scene.duplicate(obj, name)
    bm = bmesh.new()
    bm.from_mesh(copy.data)
    keep = {index for index, slot in enumerate(copy.data.materials)
            if slot is not None and slot.name in material_names}
    doomed = [face for face in bm.faces if face.material_index not in keep]
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bm.normal_update()
    for vertex in bm.verts:
        vertex.co += vertex.normal * offset
    bm.to_mesh(copy.data)
    bm.free()
    copy.data.update()
    scene.set_material(copy, lens)
    return copy


def mat(obj, material):
    scene.set_material(obj, material)
    return obj


def build_loft(name, rows):
    """An open sheet through rows of points (screens, mudguards); solidify it afterwards."""
    return build.loft(name, rows, closed=False)


def smooth(points, subdivisions=3):
    """A Catmull-Rom path through the points."""
    return profiles.smooth_path([tuple(point) for point in points], subdivisions)


def box(name, size, location, material, rotation=(0.0, 0.0, 0.0), bevel=0.0):
    obj = build.box(name, size=size)
    if bevel:
        modify.bevel(obj, width=bevel, segments=1)
    modify.transform(obj, rotation=rotation)
    modify.transform(obj, location=location)
    return mat(obj, material)


def rod(name, start, end, radius, material, segments=8, caps=True):
    obj = build.tube(name, [Vector(start), Vector(end)], radius=radius, segments=segments,
                     caps=caps)
    return mat(obj, material)


def tube(name, points, radius, material, segments=10, caps=True, radii=None):
    obj = build.tube(name, [Vector(point) for point in points], radius=radius,
                     segments=segments, caps=caps, radii=radii)
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


def lathe_x(name, profile, material, segments=32):
    """A lathe about the X axis through (radius, x) points."""
    obj = build.lathe(name, profile, segments=segments)
    modify.transform(obj, rotation=(0.0, 0.5 * math.pi, 0.0))
    # Z -> X turns +z into +x; the profile's along-axis values were authored as x.
    return mat(shading.recalc_normals(obj), material)


# ---------------------------------------------------------------------------------------------
# Wheels
# ---------------------------------------------------------------------------------------------

TYRE_PROFILE = ((0.03, -0.78), (0.25, -0.97), (0.55, -1.0), (0.78, -0.90), (0.92, -0.64),
                (0.985, -0.33), (1.0, 0.0))


def wheel(name, spec, mats):
    """A cast wheel spinning about X with its origin at the hub `spec['hub']`.

    spec: hub (x, y, z), radius (tyre), rim (rim radius), width (tyre section), rim_width,
    spokes, discs [(x, outer, inner)], sprocket (x, radius) or None, segments."""
    radius, rim, width, rim_width = spec['radius'], spec['rim'], spec['width'], spec['rim_width']
    segments = spec.get('segments', 32)
    height = radius - rim
    half = 0.5 * width
    left = [(rim + f * height, s * half) for f, s in TYRE_PROFILE]
    right = [(r, -x) for r, x in reversed(left[:-1])]
    parts = [lathe_x(name + '_tyre', left + right, mats['tyre'], segments)]
    hw = 0.5 * rim_width
    rim_profile = [(rim - 0.018, -0.92 * hw), (rim + 0.004, -hw), (rim + 0.004, -0.86 * hw),
                   (rim - 0.008, -0.74 * hw), (rim - 0.008, 0.74 * hw), (rim + 0.004, 0.86 * hw),
                   (rim + 0.004, hw), (rim - 0.018, 0.92 * hw), (rim - 0.018, -0.92 * hw)]
    parts.append(lathe_x(name + '_rim', rim_profile, mats['rim'], segments))
    parts.append(axis_cylinder(name + '_hub', 0.048, 0.62 * rim_width + 0.02, (0.0, 0.0, 0.0),
                               'X', mats['rim'], 16))
    parts.append(axis_cylinder(name + '_axle', 0.022, rim_width + 0.06, (0.0, 0.0, 0.0), 'X',
                               mats['hub'], 10))
    length = rim - 0.02 - 0.045
    count = spec.get('spokes', 5)
    for k in range(count):
        for side in (-1.0, 1.0):
            spoke = build.box(f'{name}_spoke_{k}_{side:+.0f}', size=(0.014, 0.018, length))
            modify.transform(spoke, location=(0.0, side * 0.012, 0.045 + 0.5 * length))
            modify.transform(spoke, rotation=(side * 0.10, 0.0, 0.0))
            modify.transform(spoke, rotation=(math.tau * k / count, 0.0, 0.0))
            parts.append(mat(spoke, mats['rim']))
    for x, outer, inner in spec.get('discs', ()):
        disc = lathe_x(f'{name}_disc_{x:+.2f}', [(inner, -0.0025), (outer, -0.0025),
                                                 (outer, 0.0025), (inner, 0.0025),
                                                 (inner, -0.0025)], mats['disc'], segments)
        modify.transform(disc, location=(x, 0.0, 0.0))
        parts.append(disc)
        carrier = lathe_x(f'{name}_carrier_{x:+.2f}', [(0.05, -0.002), (inner + 0.004, -0.002),
                                                       (inner + 0.004, 0.002), (0.05, 0.002),
                                                       (0.05, -0.002)], mats['hub'], 20)
        modify.transform(carrier, location=(x - math.copysign(0.004, x), 0.0, 0.0))
        parts.append(carrier)
    if spec.get('sprocket'):
        x, r = spec['sprocket']
        parts.append(axis_cylinder(name + '_sprocket', r, 0.006, (x, 0.0, 0.0), 'X',
                                   mats['sprocket'], 24))
    obj = scene.join(parts, name)
    modify.transform(obj, location=spec['hub'])
    scene.set_origin(obj, spec['hub'])
    return obj


# ---------------------------------------------------------------------------------------------
# After the bake
# ---------------------------------------------------------------------------------------------

def _world_copy(obj, name):
    copy = scene.duplicate(obj, name)
    copy.parent = None
    copy.data.transform(obj.matrix_world)
    copy.matrix_world = Matrix.Identity(4)
    return copy


def assemble_bike(a):
    """Fork pivot, parenting, grip anchors and the merged body levels."""
    state = STATE[a.id]
    parts, spec = state['parts'], state['spec']
    body = parts['lod0']
    for level, target in ((1, spec['lod1']), (2, spec['lod2'])):
        merged = _world_copy(body, f'lod{level}')
        scene.set_origin(merged, (0.0, 0.0, 0.0))
        modify.weld(merged, 0.003)
        count = scene.triangle_count(merged)
        if count > target:
            modify.decimate(merged, ratio=target / count)
        prune(merged)
        a.add_baked(merged)
    axis = Vector(spec['steer_axis']).normalized()
    forward = Vector((0.0, axis.z, -axis.y))
    fork = scene.add_empty('fork', spec['steer_pivot'], forward=forward, up=axis)
    a.extra_objects.append(fork)
    scene.parent_to(parts['fork_mesh'], fork)
    scene.parent_to(parts['wheel_f'], fork)
    scene.parent_to(parts['wheel_r'], parts['swingarm'])
    for name, location in spec['grips'].items():
        a.add_anchor(name, location, forward=(0.0, 1.0, 0.0), parent=fork)
