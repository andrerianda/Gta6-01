"""Shared helper of the trucks domain: mesh plumbing and the sectioned hull loft.

Mesh collects faces with a material name and a level-of-detail tag per face and turns them into a
Blender object. Every face carries the tag `keep_lod`: up to which level of detail it survives
(0 = small fittings, 1 = interior, liners, wheel detail, 2 = skin, glass, tyres), so the lower
levels are cut from the same baked mesh.

loft() is how every cab, van body and box here is made. A hull is a list of key stations along
the vehicle (y, half width w, bottom zb, top zt, top and bottom corner radii rt and rb); each
station is a rounded rectangle section and the sections are joined into an evenly tessellated
skin (stations at most `step` apart, side rows at most `level_step` apart, so the game can
deform it in crashes). The side rows run at fixed heights (`levels`), clamped under the top
corner, so door, window and band edges fall on rows and a section that is lower (a bonnet, a
raked windscreen) simply folds its upper rows away. Wheel arches are cut out of the side and
the edge vertices snapped onto the arch circle. A callback decides each face's part, material
and level from its centre and normal, which is how a hull is divided into the panels the game
moves (doors, bonnet, glass) and painted (livery bands, trim). Both ends are closed by caps of
concentric rings.

Blender axes: Z up, nose towards +Y, right side +X.
"""
import math

import bmesh
import numpy as np
from mathutils import Vector

from lib import build, modify, scene, shading

LEVEL = 'keep_lod'


def newell(points):
    """Area-weighted normal (twice the area as its length) of a polygon of 3D points."""
    normal = Vector((0.0, 0.0, 0.0))
    count = len(points)
    for index in range(count):
        a, b = Vector(points[index]), Vector(points[(index + 1) % count])
        normal.x += (a.y - b.y) * (a.z + b.z)
        normal.y += (a.z - b.z) * (a.x + b.x)
        normal.z += (a.x - b.x) * (a.y + b.y)
    return normal


class Mesh:
    """Faces under construction, each with a material name and a level tag."""

    def __init__(self):
        self.points, self.faces, self.mats, self.levels = [], [], [], []

    def point(self, position):
        self.points.append((float(position[0]), float(position[1]), float(position[2])))
        return len(self.points) - 1

    def face(self, indices, material, level=2):
        """Adds a face (counter-clockwise seen from outside); collapsed faces are dropped."""
        indices = [index for n, index in enumerate(indices) if index != indices[n - 1]]
        if len(indices) < 3 or newell([self.points[i] for i in indices]).length < 1e-8:
            return
        self.faces.append(indices)
        self.mats.append(material)
        self.levels.append(level)

    def polygon(self, positions, material, level=2):
        """Adds a face from positions (own vertices)."""
        self.face([self.point(p) for p in positions], material, level)

    def panel(self, origin, u, v, size_u, size_v, material, level=2, step=0.4, flip=False):
        """A flat rectangle from `origin` along unit vectors u and v, cut into cells no larger
        than `step`; it faces u x v (or the other way with flip). `material` is a name or a
        function (cell centre u, v in metres) -> name."""
        o, u, v = Vector(origin), Vector(u), Vector(v)
        nu, nv = max(1, math.ceil(size_u / step - 1e-6)), max(1, math.ceil(size_v / step - 1e-6))
        grid = [[self.point(o + u * (size_u * i / nu) + v * (size_v * j / nv)) for j in range(nv + 1)]
                for i in range(nu + 1)]
        for i in range(nu):
            for j in range(nv):
                corners = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]
                if flip:
                    corners.reverse()
                name = material if isinstance(material, str) else \
                    material((i + 0.5) * size_u / nu, (j + 0.5) * size_v / nv)
                if name:
                    self.face(corners, name, level)

    def block(self, low, high, material, level=2, step=0.4, inward=False, skip=()):
        """An axis-aligned box from corner `low` to `high`, each side cut into cells (faces
        out, or in with inward). `skip` names sides to leave open: '-x', '+x', '-y', ...
        `material` may be a dict by side name."""
        (x0, y0, z0), (x1, y1, z1) = low, high
        X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
        sides = {
            '-x': ((x0, y0, z0), Z, Y, z1 - z0, y1 - y0), '+x': ((x1, y0, z0), Y, Z, y1 - y0, z1 - z0),
            '-y': ((x0, y0, z0), X, Z, x1 - x0, z1 - z0), '+y': ((x0, y1, z0), Z, X, z1 - z0, x1 - x0),
            '-z': ((x0, y0, z0), Y, X, y1 - y0, x1 - x0), '+z': ((x0, y0, z1), X, Y, x1 - x0, y1 - y0),
        }
        for key, (origin, u, v, su, sv) in sides.items():
            if key not in skip:
                mat = material.get(key, material.get('*')) if isinstance(material, dict) else material
                if mat:
                    self.panel(origin, u, v, su, sv, mat, level, step, flip=inward)

    def to_object(self, name, materials, angle=35.0):
        """Builds the Blender object. materials: {material name: Blender material}."""
        obj = build.from_data(name, self.points, self.faces)
        mesh = obj.data
        used = list(dict.fromkeys(self.mats))
        for material in used:
            mesh.materials.append(materials[material])
        mesh.polygons.foreach_set('material_index', [used.index(m) for m in self.mats])
        attribute = mesh.attributes.new(LEVEL, 'INT', 'FACE')
        attribute.data.foreach_set('value', self.levels)
        mesh.update()
        shading.smooth(obj, math.radians(angle))
        return obj


def tag(obj, level, force=False):
    """Marks every face of a mesh as kept up to `level` (unless already tagged)."""
    mesh = obj.data
    attribute = mesh.attributes.get(LEVEL)
    if attribute is not None and not force:
        return obj
    if attribute is None:
        attribute = mesh.attributes.new(LEVEL, 'INT', 'FACE')
    attribute.data.foreach_set('value', [level] * len(mesh.polygons))
    return obj


def part(obj, material, level, angle=40.0):
    """A library-built part: material set, smooth-shaded, tagged."""
    if material is not None:
        scene.set_material(obj, material)
    shading.smooth(obj, math.radians(angle))
    return tag(obj, level)


def single_uv(obj):
    """Folds every UV layer into the first named build.UV_LAYER (or the first) and removes the
    others: a join of differently built meshes would export a useless second UV set."""
    layers = obj.data.uv_layers
    if len(layers) < 2:
        return obj
    main = build.UV_LAYER if build.UV_LAYER in layers else layers[0].name
    count = len(obj.data.loops)
    merged = np.zeros(count * 2, dtype=np.float32)
    layers[main].data.foreach_get('uv', merged)
    merged = merged.reshape(-1, 2)
    others = [layer.name for layer in layers if layer.name != main]
    for name in others:
        values = np.zeros(count * 2, dtype=np.float32)
        layers[name].data.foreach_get('uv', values)
        values = values.reshape(-1, 2)
        empty = np.all(merged == 0.0, axis=1)
        merged[empty] = values[empty]
    layers[main].data.foreach_set('uv', merged.ravel())
    for name in others:
        layers.remove(layers[name])
    return obj


def delete_faces(obj, select):
    """Deletes the faces for which select(level, material name) is true."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    layer = bm.faces.layers.int.get(LEVEL)
    names = [slot.material.name if slot.material else '' for slot in obj.material_slots]
    doomed = [face for face in bm.faces
              if select(face[layer] if layer is not None else 2, names[face.material_index] if names else '')]
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def weld(obj, distance):
    """Merges vertices closer than `distance`."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=distance)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def drop_unused_materials(obj):
    """Removes material slots no face uses."""
    mesh = obj.data
    used = sorted({polygon.material_index for polygon in mesh.polygons})
    if len(used) == len(mesh.materials):
        return obj
    remap = {old: new for new, old in enumerate(used)}
    materials = [mesh.materials[index] for index in used]
    indices = [remap[polygon.material_index] for polygon in mesh.polygons]
    mesh.materials.clear()
    for material in materials:
        mesh.materials.append(material)
    mesh.polygons.foreach_set('material_index', indices)
    mesh.update()
    return obj


def shrink(obj, gap, axes=(1, 2)):
    """Shrinks a panel about its bounding-box centre so it stands `gap` metres clear of its
    neighbours on every side along the given axes (the shut line)."""
    coords = np.array([v.co[:] for v in obj.data.vertices])
    low, high = coords.min(axis=0), coords.max(axis=0)
    centre = 0.5 * (low + high)
    scale = [1.0, 1.0, 1.0]
    for axis in axes:
        size = high[axis] - low[axis]
        if size > 4 * gap:
            scale[axis] = (size - 2 * gap) / size
    modify.map_vertices(obj, lambda p: Vector(tuple(centre[k] + (p[k] - centre[k]) * scale[k]
                                                    for k in range(3))))
    return obj


# ---------------------------------------------------------------------------------------------
# The hull loft
# ---------------------------------------------------------------------------------------------

class Face:
    """What the assign callback sees: the face centre (x, y, z), its unit normal n, and the
    station's half width w and top radius rt there."""

    def __init__(self, centre, normal, w, rt, zt):
        self.x, self.y, self.z = centre
        self.n, self.w, self.rt, self.zt = normal, w, rt, zt

    @property
    def side(self):
        return 1.0 if self.x >= 0.0 else -1.0

    def on_side(self):
        return abs(self.n.x) > 0.6

    def on_top(self, margin=0.0):
        return self.n.z > 0.3 and abs(self.x) < self.w - self.rt - margin + 1e-4

    def inside(self, y0, y1, z0, z1):
        return y0 <= self.y <= y1 and z0 <= self.z <= z1


def _expand(keys, step):
    """Key stations interpolated so that no two are more than `step` apart."""
    stations = [dict(keys[0])]
    for first, second in zip(keys, keys[1:]):
        count = max(1, math.ceil((second['y'] - first['y']) / step - 1e-6))
        for n in range(1, count + 1):
            t = n / count
            stations.append({key: first[key] + (second[key] - first[key]) * t for key in first})
    return stations


def _fill(levels, low, high, step):
    """Side rows: the given heights plus enough between them (and the ends) to keep rows
    at most `step` apart."""
    rows = sorted(set([low] + [z for z in levels if low < z < high] + [high]))
    out = [rows[0]]
    for a, b in zip(rows, rows[1:]):
        count = max(1, math.ceil((b - a) / step - 1e-6))
        out += [a + (b - a) * n / count for n in range(1, count + 1)]
    return out


def _section(st, rows, n_arc, n_top, n_bottom):
    """The closed ring of (x, z) points of one station: bottom centre, right side up, top
    centre, left side down."""
    w, zb, zt, rt, rb = st['w'], st['zb'], st['zt'], st['rt'], st['rb']
    lo, hi = zb + rb, zt - rt
    right = [((w - rb) * k / n_bottom, zb) for k in range(n_bottom)]
    right += [(w - rb + rb * math.cos(-0.5 * math.pi + 0.5 * math.pi * k / n_arc),
               zb + rb + rb * math.sin(-0.5 * math.pi + 0.5 * math.pi * k / n_arc)) for k in range(n_arc)]
    right += [(w, min(max(z, lo), hi)) for z in rows]
    right += [(w - rt + rt * math.cos(0.5 * math.pi * k / n_arc),
               zt - rt + rt * math.sin(0.5 * math.pi * k / n_arc)) for k in range(1, n_arc)]
    right += [((w - rt) * (1.0 - k / n_top), zt) for k in range(n_top + 1)]
    left = [(-x, z) for x, z in reversed(right[1:-1])]
    return right + left


def loft(keys, assign, levels=(), arches=(), step=0.2, level_step=0.3, n_arc=3, n_top=4,
         n_bottom=3, caps=(True, True), cap_rings=(1.0, 0.7, 0.4)):
    """Lofts a hull through key stations (dicts y, w, zb, zt, rt, rb; y ascending) and returns
    {part name: Mesh}. assign(Face) -> (part, material, level) or None to leave a hole.
    arches: (y, z, radius, depth) wheel openings cut into the outer `depth` of each side.
    caps: (rear, front) closed by concentric rings."""
    stations = _expand(keys, step)
    zb_all = min(st['zb'] + st['rb'] for st in stations)
    zt_all = max(st['zt'] - st['rt'] for st in stations)
    rows = _fill(levels, zb_all, zt_all, level_step)
    rings = [[Vector((x, st['y'], z)) for x, z in _section(st, rows, n_arc, n_top, n_bottom)]
             for st in stations]

    def in_arch(point, w):
        for ya, za, radius, depth in arches:
            if abs(point.x) > w - depth and math.hypot(point.y - ya, point.z - za) < radius:
                return (ya, za, radius)
        return None

    snapped = []
    for st, ring in zip(stations, rings):
        row = []
        for p in ring:
            hit = in_arch(p, st['w'] + 1e-4) if p.z > st['zb'] + 1e-3 else None
            if hit:
                ya, za, radius = hit
                d = Vector((0.0, p.y - ya, p.z - za))
                if d.length < 1e-6:
                    d = Vector((0.0, 0.0, 1.0))
                d = d.normalized() * radius
                p = Vector((p.x, ya + d.y, za + d.z))
            row.append(p)
        snapped.append(row)

    parts = {}

    def emit(raw, final, st_w, st_rt, st_zt):
        centre = sum(raw, Vector()) / len(raw)
        normal = newell(raw)
        if normal.length < 1e-9:
            return
        result = assign(Face(centre, normal.normalized(), st_w, st_rt, st_zt))
        if result is None:
            return
        name, material, level = result
        parts.setdefault(name, Mesh()).polygon(final, material, level)

    count = len(rings[0])
    for i in range(len(stations) - 1):
        a, b = stations[i], stations[i + 1]
        w, rt, zt = 0.5 * (a['w'] + b['w']), 0.5 * (a['rt'] + b['rt']), 0.5 * (a['zt'] + b['zt'])
        for j in range(count):
            k = (j + 1) % count
            raw = [rings[i][j], rings[i + 1][j], rings[i + 1][k], rings[i][k]]
            centre = sum(raw, Vector()) / 4
            if in_arch(centre, w):
                continue
            emit(raw, [snapped[i][j], snapped[i + 1][j], snapped[i + 1][k], snapped[i][k]], w, rt, zt)

    for end, front in ((0, False), (-1, True)):
        if not caps[1 if front else 0]:
            continue
        st, ring = stations[end], snapped[end]
        centre = Vector((0.0, st['y'], 0.5 * (st['zb'] + st['zt'])))
        loops = [[centre + (p - centre) * s for p in ring] for s in cap_rings]
        for outer, inner in zip(loops, loops[1:]):
            for j in range(count):
                k = (j + 1) % count
                quad = [outer[j], inner[j], inner[k], outer[k]] if front else \
                    [outer[j], outer[k], inner[k], inner[j]]
                emit(quad, quad, st['w'], st['rt'], st['zt'])
        last = loops[-1]
        for j in range(count):
            k = (j + 1) % count
            tri = [centre, last[k], last[j]] if front else [centre, last[j], last[k]]
            emit(tri, tri, st['w'], st['rt'], st['zt'])
    return parts


def arch_liner(mesh, y, z, radius, x_outer, depth, material, flare=None, segments=14):
    """The wheel-well liner of one arch on the side whose outer face is at x_outer (sign gives
    the side): a half tube facing the wheel, from just under the axle line over the top; with
    flare=(width, proud, material) a lip around the opening standing proud of the side."""
    sign = 1.0 if x_outer > 0 else -1.0
    angles = [math.radians(-12 + 204 * n / segments) for n in range(segments + 1)]
    x_in = x_outer - sign * depth
    for a0, a1 in zip(angles, angles[1:]):
        p = [Vector((x, y + radius * math.cos(a), z + radius * math.sin(a)))
             for x, a in ((x_in, a0), (x_outer, a0), (x_outer, a1), (x_in, a1))]
        mesh.polygon(p if sign > 0 else list(reversed(p)), material, 1)
    if flare:
        width, proud, mat = flare
        for a0, a1 in zip(angles, angles[1:]):
            r0, r1 = radius, radius + width
            xo, xp = x_outer, x_outer + sign * proud
            ring = [Vector((xo, y + r0 * math.cos(a0), z + r0 * math.sin(a0))),
                    Vector((xp, y + r0 * math.cos(a0), z + r0 * math.sin(a0))),
                    Vector((xp, y + r0 * math.cos(a1), z + r0 * math.sin(a1))),
                    Vector((xo, y + r0 * math.cos(a1), z + r0 * math.sin(a1)))]
            mesh.polygon(ring if sign > 0 else list(reversed(ring)), mat, 2)
            face = [Vector((xp, y + r0 * math.cos(a0), z + r0 * math.sin(a0))),
                    Vector((xp, y + r1 * math.cos(a0), z + r1 * math.sin(a0))),
                    Vector((xp, y + r1 * math.cos(a1), z + r1 * math.sin(a1))),
                    Vector((xp, y + r0 * math.cos(a1), z + r0 * math.sin(a1)))]
            mesh.polygon(face if sign > 0 else list(reversed(face)), mat, 2)
