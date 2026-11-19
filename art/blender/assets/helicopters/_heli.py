"""Helicopter kit: what the police and the news helicopter share.

Shaping: the fuselage pod, the engine cowling and the tail boom are lofts of rings sampled from a
short table of key stations (y, half width, bottom, top, superellipse exponent) through a smooth
cubic in y. A pod ring has fixed rows at chosen relative heights (0 = keel, 1 = roof), so a livery
band, the window sills and the door edges follow the body lines as real ones do: a face's row is
found again after the loft from its centre (rel_height). Faces are then given materials and split
off into doors by small predicates on (y, relative height, side, normal).

Moving parts are modelled in place in world coordinates (so the procedural wear sees real heights)
with their origins on their pivots: rotor_main (hub, mast, swashplate, grips, pitch links, drooped
blades), rotor_tail (a fenestron fan spinning about X), the blur discs (two-sided annuli in a
glass role, children of the rotors), the doors (origin on the front hinge) and the searchlight.

assemble_helicopter (called from an asset's assemble) parents the blur discs and the doors,
hangs anchor_searchlight on the searchlight, and makes lod1 and lod2 as single merged, decimated
copies of the shell and doors. The cabin interior is its own node, a child of lod0, so it shows
at level 0 only; rotors and the searchlight stay separate at every level so they keep moving.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from lib import build, modify, profiles, scene, shading

STATE = {}

# Relative heights of the pod's rows (between the keel point 0 and the roof point 1).
RELS = (0.025, 0.07, 0.14, 0.23, 0.32, 0.36, 0.40, 0.46, 0.52, 0.60, 0.68, 0.76, 0.84, 0.91,
        0.96, 0.99)


# ---------------------------------------------------------------------------------------------
# Key tables and rings
# ---------------------------------------------------------------------------------------------

def curve(keys, y, column):
    """Cubic Hermite through keys[i][0] -> keys[i][column] (finite-difference tangents)."""
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


def stations(start, end, step, extra=()):
    """Sample positions from start to end about `step` apart, with the `extra` ones exact."""
    count = max(2, int(round((end - start) / step)) + 1)
    values = [start + (end - start) * i / (count - 1) for i in range(count)]
    fixed = [value for value in extra if start < value < end]
    values = [v for v in values if all(abs(v - f) > 0.35 * step for f in fixed)] + fixed
    return sorted(values)


def pod(name, keys, step=0.14, extra=()):
    """A closed loft through pod rings from the first key to the last, capped at both ends."""
    ys = stations(keys[0][0], keys[-1][0], step, extra)
    obj = build.loft(name, [pod_ring(keys, y) for y in ys], closed=True, cap_start=True,
                     cap_end=True)
    return shading.recalc_normals(obj)


def rel_height(keys, point):
    _half, bottom, top, _exponent = station(keys, point.y)
    return (point.z - bottom) / max(top - bottom, 1e-6)


def round_boom(name, keys, segments=16, step=0.45):
    """A tapered round boom: keys (y, radius, centre z)."""
    ys = stations(keys[0][0], keys[-1][0], step)
    rings = []
    for y in ys:
        radius, centre = curve(keys, y, 1), curve(keys, y, 2)
        rings.append([(radius * math.cos(math.tau * j / segments), y,
                       centre + radius * math.sin(math.tau * j / segments)) for j in range(segments)])
    return shading.recalc_normals(build.loft(name, rings, closed=True, cap_start=True,
                                             cap_end=True))


def airfoil(chord, thickness, count=10):
    """(along, across) points of a symmetric section: leading edge at +0.25 chord."""
    points = []
    for k in range(count):
        u = math.tau * k / count
        s = 0.5 * (1.0 - math.cos(u))
        half = 5.0 * thickness * (0.2969 * math.sqrt(s) - 0.126 * s - 0.3516 * s * s
                                  + 0.2843 * s ** 3 - 0.1036 * s ** 4) * chord
        points.append((0.25 * chord - s * chord, half if math.sin(u) >= 0 else -half))
    return points


def wing(name, sections, axis='X', count=10):
    """A closed loft of airfoil sections. sections: (station, chord, thickness, lead, height):
    for axis 'X' (a blade or a stabiliser) station is x, the chord runs along y with its leading
    edge at `lead`, the thickness along z about `height`; for axis 'Z' (a fin) station is z, the
    chord runs along y and the thickness along x about x = height."""
    rings = []
    for station_value, chord, thickness, lead, height in sections:
        ring = []
        for along, across in airfoil(chord, thickness, count):
            y = lead - 0.25 * chord + along
            if axis == 'X':
                ring.append((station_value, y, height + across))
            else:
                ring.append((height + across, y, station_value))
        rings.append(ring)
    return shading.recalc_normals(build.loft(name, rings, closed=True, cap_start=True,
                                             cap_end=True))


# ---------------------------------------------------------------------------------------------
# Materials per face, splitting, small builders
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


def _delete_faces(obj, test):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    doomed =[face for face in bm.faces if test(face.calc_center_median(), face.normal)]
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def split(obj, name, test):
    """Moves the faces for which test(centre, normal) holds into a new object `name`."""
    part = scene.duplicate(obj, name)
    _delete_faces(part, lambda centre, normal: not test(centre, normal))
    _delete_faces(obj, test)
    prune(part)
    prune(obj)
    return part


def mat(obj, material):
    scene.set_material(obj, material)
    return obj


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


def smooth(points, subdivisions=3):
    """A Catmull-Rom path through the points."""
    return profiles.smooth_path([tuple(point) for point in points], subdivisions)


def build_tube(name, points, radius, material, segments=12, caps=True):
    obj = build.tube(name, [Vector(point) for point in points], radius=radius,
                     segments=segments, caps=caps)
    return mat(obj, material)


def build_lathe(name, profile, material, segments=24):
    """A lathe about Z through (radius, z) points, bottom to top."""
    return mat(build.lathe(name, profile, segments=segments), material)


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


def dome(name, radius, centre, material, scale=(1.0, 1.0, 1.0), segments=12, rings=6):
    obj = build.sphere(name, radius=radius, segments=segments, rings=rings)
    modify.transform(obj, scale=scale)
    modify.transform(obj, location=centre)
    return mat(obj, material)


def annulus(name, inner, outer, material, segments=48, gap=0.002):
    """A flat two-sided ring in the XY plane at z = 0 (two sheets `gap` apart)."""
    upper = build.lathe(name, [(inner, 0.5 * gap), (outer, 0.5 * gap)], segments=segments)
    lower = build.lathe(name + '_under', [(inner, -0.5 * gap), (outer, -0.5 * gap)],
                        segments=segments)
    upper_up = sum(p.normal.z for p in upper.data.polygons) > 0
    lower_up = sum(p.normal.z for p in lower.data.polygons) > 0
    if not upper_up:
        shading.flip(upper)
    if lower_up:
        shading.flip(lower)
    obj = scene.join([upper, lower], name)
    return mat(obj, material)


def lamp_unit(name, radius, centre, rotation, mats, lamp, depth=0.05):
    """A round lamp facing +Y before `rotation`: housing cup, chrome reflector ring, the lit
    bed (lamp material) recessed behind a clear lens."""
    parts = [
        axis_cylinder(name + '_cup', radius * 1.18, depth, (0.0, -0.5 * depth, 0.0), 'Y',
                      mats['housing'], segments=16),
        axis_cylinder(name + '_ring', radius * 1.12, 0.012, (0.0, 0.004, 0.0), 'Y',
                      mats['chrome'], segments=16, caps=False),
        axis_cylinder(name + '_bed', radius, 0.008, (0.0, -0.016, 0.0), 'Y', lamp, segments=16),
        axis_cylinder(name + '_lens', radius * 1.06, 0.004, (0.0, 0.006, 0.0), 'Y',
                      mats['glass'], segments=16),
    ]
    obj = scene.join(parts, name)
    modify.transform(obj, rotation=rotation)
    modify.transform(obj, location=centre)
    return obj


# ---------------------------------------------------------------------------------------------
# Rotors
# ---------------------------------------------------------------------------------------------

def main_rotor(spec, mats):
    """rotor_main (origin at the hub) and rotor_main_blur, in place."""
    hub_z, radius, blades = spec['hub_z'], spec['rotor_radius'], spec['blades']
    chord, droop = spec['chord'], spec['droop']
    parts = [
        axis_cylinder('mast', 0.075, 0.42, (0.0, 0.0, hub_z - 0.19), 'Z', mats['hub'], 16),
        axis_cylinder('swash_low', 0.23, 0.045, (0.0, 0.0, hub_z - 0.30), 'Z', mats['hub'], 16),
        axis_cylinder('swash_up', 0.20, 0.035, (0.0, 0.0, hub_z - 0.255), 'Z', mats['chrome'], 16),
        axis_cylinder('hub_plate', 0.27, 0.085, (0.0, 0.0, hub_z), 'Z', mats['hub'], 16),
        dome('hub_cap', 0.15, (0.0, 0.0, hub_z + 0.04), mats['hub'], scale=(1.0, 1.0, 0.7),
             segments=16, rings=6),
    ]
    tip = radius
    root = 0.62

    def droop_at(r):
        return -droop * ((r - root) / (tip - root)) ** 1.6

    sections = []
    for r, c, lead in ((root, 0.62 * chord, 0.06), (0.80, 0.85 * chord, 0.075),
                       (1.30, chord, 0.075), (3.2, chord, 0.075), (tip - 0.32, chord, 0.075),
                       (tip - 0.10, 0.82 * chord, 0.055), (tip, 0.55 * chord, 0.02)):
        sections.append((r, c, 0.12, lead, hub_z + droop_at(r)))
    for k in range(blades):
        angle = spec.get('blade_phase', math.radians(45.0)) + math.tau * k / blades
        blade = wing(f'blade_{k}', sections, axis='X', count=10)
        assign(blade, [mats['blade'], mats['accent']],
               lambda centre, normal: 1 if centre.x > tip - 0.30 else 0)
        grip = box(f'grip_{k}', (0.36, 0.13, 0.075), (0.45, 0.0, hub_z), mats['hub'], bevel=0.012)
        horn = box(f'horn_{k}', (0.06, 0.12, 0.03), (0.38, 0.11, hub_z - 0.05), mats['hub'])
        link = rod(f'link_{k}', (0.19, 0.13, hub_z - 0.24), (0.38, 0.14, hub_z - 0.06), 0.013,
                   mats['chrome'], segments=6)
        arm = scene.join([blade, grip, horn, link], f'arm_{k}')
        modify.transform(arm, rotation=(0.0, 0.0, angle))
        parts.append(arm)
    rotor = scene.join(parts, 'rotor_main')
    scene.set_origin(rotor, (0.0, 0.0, hub_z))
    blur = annulus('rotor_main_blur', 0.30, radius, mats['blur'], segments=48)
    modify.transform(blur, location=(0.0, 0.0, hub_z - 0.02))
    scene.set_origin(blur, (0.0, 0.0, hub_z))
    return rotor, blur


def fan_rotor(spec, mats):
    """rotor_tail: a fenestron fan spinning about X, and rotor_tail_blur."""
    hub = Vector(spec['tail_hub'])
    radius, count = spec['tail_radius'], spec.get('tail_blades', 9)
    parts = [axis_cylinder('fan_hub', 0.075, 0.13, (0.0, 0.0, 0.0), 'X', mats['hub'], 16)]
    for k in range(count):
        blade = build.box(f'fan_blade_{k}', size=(0.012, 0.07, radius - 0.07))
        modify.transform(blade, location=(0.0, 0.0, 0.07 + 0.5 * (radius - 0.07)))
        modify.transform(blade, rotation=(0.0, 0.0, math.radians(28.0)))
        modify.transform(blade, rotation=(math.tau * k / count, 0.0, 0.0))
        parts.append(mat(blade, mats['blade']))
    rotor = scene.join(parts, 'rotor_tail')
    modify.transform(rotor, location=hub)
    scene.set_origin(rotor, hub)
    blur = annulus('rotor_tail_blur', 0.08, radius + 0.01, mats['blur'], segments=24)
    modify.transform(blur, rotation=(0.0, 0.5 * math.pi, 0.0))
    modify.transform(blur, location=hub)
    scene.set_origin(blur, hub)
    return rotor, blur


# ---------------------------------------------------------------------------------------------
# After the bake
# ---------------------------------------------------------------------------------------------

def _world_copy(obj, name):
    copy = scene.duplicate(obj, name)
    copy.parent = None
    copy.data.transform(obj.matrix_world)
    copy.matrix_world = Matrix.Identity(4)
    return copy


def assemble_helicopter(a):
    state = STATE[a.id]
    parts, spec = state['parts'], state['spec']
    body = parts['lod0']
    for level, target in ((1, spec['lod1']), (2, spec['lod2'])):
        pieces = [_world_copy(parts[name], f'piece_{name}_{level}')
                  for name in ('lod0', 'door_fl', 'door_fr')]
        merged = scene.join(pieces, f'lod{level}')
        scene.set_origin(merged, (0.0, 0.0, 0.0))
        modify.weld(merged, 0.004)
        count = scene.triangle_count(merged)
        if count > target:
            modify.decimate(merged, ratio=target / count)
        prune(merged)
        a.add_baked(merged)
    for name in ('interior', 'door_fl', 'door_fr'):
        scene.parent_to(parts[name], body)
    scene.parent_to(parts['rotor_main_blur'], parts['rotor_main'])
    scene.parent_to(parts['rotor_tail_blur'], parts['rotor_tail'])
    if 'searchlight' in parts:
        location, forward, extras = state['searchlight_anchor']
        a.add_anchor('anchor_searchlight', location, forward=forward, parent=parts['searchlight'],
                     **extras)
