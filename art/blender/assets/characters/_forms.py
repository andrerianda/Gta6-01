"""Solid forms, voxel union, smoothing, sculpting and mesh surgery: the modelling core of the people.

A person is modelled the way a sculptor blocks one in: closed forms (ellipsoids for muscles,
tapered tubes for limbs and fingers, lofts for the trunk and the skull) are collected in a Soup,
fused into one skin by Blender's voxel remesher, relaxed so the forms run into each other, and
then shaped further by brushes that move vertices (inflate, push, crease). The dense result is the
surface the textures are baked from; decimate() makes the light game mesh from it.

Everything here works on numpy arrays of positions, so a brush is one line of arithmetic over a
few hundred thousand vertices. Blender axes: Z up, the person faces +Y, their right side is +X.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from lib import scene


# ---------------------------------------------------------------------------------------------
# Small vector helpers
# ---------------------------------------------------------------------------------------------

def unit(vector):
    """The vector (or each row of an array of vectors) at length one."""
    vector = np.asarray(vector, dtype=np.float64)
    length = np.linalg.norm(vector, axis=-1, keepdims=True)
    return vector / np.maximum(length, 1e-12)


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(edge0, edge1, value):
    """0 below edge0, 1 above edge1, a smooth S between (edges may be given in either order)."""
    t = np.clip((np.asarray(value, dtype=np.float64) - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def falloff(t):
    """A soft brush profile: 1 at t = 0, 0 from t = 1 on, flat at both ends."""
    t = np.clip(t, 0.0, 1.0)
    return (1.0 - t * t) ** 2


def basis(forward, up):
    """Three unit axes (side, forward, up') as rows, with `forward` kept and `up` squared to it."""
    forward = unit(forward)
    up = np.asarray(up, dtype=np.float64)
    up = unit(up - forward * np.dot(up, forward))
    return np.array([np.cross(forward, up), forward, up])


def interpolate(table, value):
    """Piecewise-linear lookup in a table of rows (key, v1, v2, ...) sorted by key."""
    table = np.asarray(table, dtype=np.float64)
    return np.array([np.interp(value, table[:, 0], table[:, column])
                     for column in range(1, table.shape[1])]).T


# ---------------------------------------------------------------------------------------------
# Soup: closed forms waiting to be fused
# ---------------------------------------------------------------------------------------------

class Soup:
    """A bag of closed meshes (they may overlap freely); union() fuses them into one skin."""

    def __init__(self):
        self.vertices = []
        self.faces = []
        self.count = 0

    def add(self, vertices, faces):
        vertices = np.asarray(vertices, dtype=np.float64).reshape(-1, 3)
        self.vertices.append(vertices)
        self.faces.extend(tuple(int(index) + self.count for index in face) for face in faces)
        self.count += len(vertices)

    def rings(self, rings):
        """A closed tube through equal-length rings of points, capped with a fan at both ends."""
        rings = np.asarray(rings, dtype=np.float64)
        count, around, _ = rings.shape
        faces = []
        for i in range(count - 1):
            for j in range(around):
                a, b = i * around + j, i * around + (j + 1) % around
                faces.append((a, b, b + around, a + around))
        first, last = count * around, count * around + 1
        faces += [(first, (j + 1) % around, j) for j in range(around)]
        base = (count - 1) * around
        faces += [(last, base + j, base + (j + 1) % around) for j in range(around)]
        vertices = np.concatenate([rings.reshape(-1, 3), rings[0].mean(axis=0)[None],
                                   rings[-1].mean(axis=0)[None]])
        self.add(vertices, faces)

    def ellipsoid(self, centre, radii, axes=None, segments=20, rings=12):
        """An ellipsoid: `radii` along the rows of `axes` (a 3x3 rotation; world axes if None)."""
        axes = np.eye(3) if axes is None else np.asarray(axes, dtype=np.float64)
        centre = np.asarray(centre, dtype=np.float64)
        radii = np.asarray(radii, dtype=np.float64)
        angles = np.arange(segments) * (math.tau / segments)
        loops = []
        for ring in range(1, rings):
            polar = math.pi * ring / rings
            local = np.stack([np.cos(angles) * math.sin(polar), np.sin(angles) * math.sin(polar),
                              np.full(segments, -math.cos(polar))], axis=1) * radii
            loops.append(centre + local @ axes)
        self.rings(loops)

    def tube(self, points, radii, side=(0.0, 1.0, 0.0), segments=16, cap=1.0):
        """A tube along `points` with rounded ends. `radii` is one radius per point, or a pair
        per point: the first across `side`, the second across the other way (flattened limbs,
        wrists, fingers). cap scales how far the round ends reach past the end points."""
        points = np.asarray(points, dtype=np.float64)
        radii = np.asarray(radii, dtype=np.float64)
        if radii.ndim == 1:
            radii = np.stack([radii, radii], axis=1)
        tangent = unit(np.gradient(points, axis=0))
        side = np.asarray(side, dtype=np.float64)
        across = unit(side - tangent * (tangent @ side)[:, None])
        other = np.cross(tangent, across)
        angles = np.arange(segments) * (math.tau / segments)
        circle = np.stack([np.cos(angles), np.sin(angles)], axis=1)

        def ring(index, shift=0.0, shrink=1.0):
            centre = points[index] + tangent[index] * shift
            return (centre + np.outer(circle[:, 0] * radii[index, 0] * shrink, across[index])
                    + np.outer(circle[:, 1] * radii[index, 1] * shrink, other[index]))

        loops = []
        reach = cap * float(radii[0].mean())
        for angle in (75.0, 50.0, 25.0):
            loops.append(ring(0, -reach * math.sin(math.radians(angle)), math.cos(math.radians(angle))))
        loops += [ring(index) for index in range(len(points))]
        reach = cap * float(radii[-1].mean())
        for angle in (25.0, 50.0, 75.0):
            loops.append(ring(len(points) - 1, reach * math.sin(math.radians(angle)),
                              math.cos(math.radians(angle))))
        self.rings(loops)

    def mesh(self, obj):
        """Adds an existing mesh object (an earlier union, say) to the soup."""
        self.add(positions(obj), [tuple(polygon.vertices) for polygon in obj.data.polygons])

    def to_object(self, name):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(np.concatenate(self.vertices).tolist(), [], self.faces)
        mesh.update()
        return scene.new_object(name, mesh)

    def union(self, name, voxel=0.004, relax_steps=0, strength=0.5):
        """Fuses every form into one closed skin of quads about `voxel` metres across and
        relaxes it, so the forms run into each other like muscle under skin."""
        obj = self.to_object(name)
        voxel_union(obj, voxel)
        if relax_steps:
            relax(obj, relax_steps, strength)
        return obj


def voxel_union(obj, voxel):
    """Replaces a mesh of overlapping closed parts by the skin of their union."""
    modifier = obj.modifiers.new('remesh', 'REMESH')
    modifier.mode = 'VOXEL'
    modifier.voxel_size = voxel
    modifier.adaptivity = 0.0
    modifier.use_smooth_shade = True
    scene.activate(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


# ---------------------------------------------------------------------------------------------
# Arrays in and out of Blender
# ---------------------------------------------------------------------------------------------

def positions(obj):
    data = np.empty(len(obj.data.vertices) * 3, dtype=np.float64)
    obj.data.vertices.foreach_get('co', data)
    return data.reshape(-1, 3)


def set_positions(obj, points):
    obj.data.vertices.foreach_set('co', np.ascontiguousarray(points, dtype=np.float64).ravel())
    obj.data.update()


def normals(obj):
    data = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
    obj.data.vertex_normals.foreach_get('vector', data)
    return data.reshape(-1, 3).astype(np.float64)


def edges(obj):
    data = np.empty(len(obj.data.edges) * 2, dtype=np.int32)
    obj.data.edges.foreach_get('vertices', data)
    return data.reshape(-1, 2)


def triangle_count(obj):
    return sum(len(polygon.vertices) - 2 for polygon in obj.data.polygons)


def face_centres(obj):
    data = np.empty(len(obj.data.polygons) * 3, dtype=np.float64)
    obj.data.polygons.foreach_get('center', data)
    return data.reshape(-1, 3)


def face_normals(obj):
    data = np.empty(len(obj.data.polygons) * 3, dtype=np.float64)
    obj.data.polygons.foreach_get('normal', data)
    return data.reshape(-1, 3)


def tree(obj):
    """A bounding-volume tree of the object's faces for ray casts and nearest-point queries."""
    return BVHTree.FromPolygons(positions(obj).tolist(),
                                [tuple(polygon.vertices) for polygon in obj.data.polygons])


# ---------------------------------------------------------------------------------------------
# Relaxing
# ---------------------------------------------------------------------------------------------

def neighbour_mean(points, pairs, values=None):
    """The mean of each vertex's neighbours (of `values`, the positions by default)."""
    values = points if values is None else values
    i = np.concatenate([pairs[:, 0], pairs[:, 1]])
    j = np.concatenate([pairs[:, 1], pairs[:, 0]])
    count = len(points)
    degree = np.maximum(np.bincount(i, minlength=count), 1)
    if values.ndim == 1:
        return np.bincount(i, weights=values[j], minlength=count) / degree
    return np.stack([np.bincount(i, weights=values[j, axis], minlength=count)
                     for axis in range(values.shape[1])], axis=1) / degree[:, None]


def relax(obj, steps=4, strength=0.5, weight=None, keep_volume=False, pinned=None):
    """Moves every vertex towards the middle of its neighbours `steps` times: rounds off the
    creases where forms meet. weight (per vertex, 0..1) limits it; keep_volume alternates
    shrinking and swelling steps so thin parts do not waste away; pinned vertices stay put."""
    points = positions(obj)
    pairs = edges(obj)
    for step in range(steps):
        amount = strength
        if keep_volume and step % 2 == 1:
            amount = -strength * 1.04
        move = (neighbour_mean(points, pairs) - points) * amount
        if weight is not None:
            move *= weight[:, None]
        if pinned is not None:
            move[pinned] = 0.0
        points += move
    set_positions(obj, points)
    return obj


def boundary_vertices(obj):
    """A boolean array: True for vertices on an open edge."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    flags = np.array([vertex.is_boundary for vertex in bm.verts], dtype=bool)
    bm.free()
    return flags


def spread(mask, pairs, steps):
    """Grows a boolean vertex mask by `steps` rings of neighbours."""
    mask = mask.copy()
    for _ in range(steps):
        grown = mask.copy()
        grown[pairs[:, 0]] |= mask[pairs[:, 1]]
        grown[pairs[:, 1]] |= mask[pairs[:, 0]]
        mask = grown
    return mask


# ---------------------------------------------------------------------------------------------
# Brushes (they change `points` in place and return the weight they used)
# ---------------------------------------------------------------------------------------------

def blob(points, centre, radii, axes=None):
    """A soft weight around `centre`: 1 there, 0 from the surface of the ellipsoid `radii`."""
    local = points - np.asarray(centre, dtype=np.float64)
    if axes is not None:
        local = local @ np.asarray(axes, dtype=np.float64).T
    radii = np.broadcast_to(np.asarray(radii, dtype=np.float64), (3,))
    return falloff(np.linalg.norm(local / radii, axis=1))


def inflate(points, vertex_normals, centre, radii, amount, axes=None):
    """Swells (or, with a negative amount, sinks) the surface around a point."""
    weight = blob(points, centre, radii, axes)
    points += vertex_normals * (weight * amount)[:, None]
    return weight


def push(points, centre, radii, offset, axes=None):
    """Drags the surface around a point by an offset vector."""
    weight = blob(points, centre, radii, axes)
    points += np.outer(weight, np.asarray(offset, dtype=np.float64))
    return weight


def polyline_distance(points, line):
    """The distance from each point to a polyline, and how far along it (0..1) the foot is."""
    line = np.asarray(line, dtype=np.float64)
    best = np.full(len(points), np.inf)
    along = np.zeros(len(points))
    lengths = np.linalg.norm(np.diff(line, axis=0), axis=1)
    total = max(float(lengths.sum()), 1e-9)
    done = 0.0
    for start, end, length in zip(line[:-1], line[1:], lengths):
        span = end - start
        t = np.clip(((points - start) @ span) / max(length * length, 1e-12), 0.0, 1.0)
        distance = np.linalg.norm(points - (start + np.outer(t, span)), axis=1)
        closer = distance < best
        best = np.where(closer, distance, best)
        along = np.where(closer, (done + t * length) / total, along)
        done += length
    return best, along


def crease(points, vertex_normals, line, width, depth, taper=True):
    """Cuts a groove (or raises a ridge with a negative depth) along a polyline; with taper it
    fades out towards both ends, like the corners of a mouth."""
    distance, along = polyline_distance(points, line)
    weight = falloff(distance / width)
    if taper:
        weight = weight * np.clip(np.sin(along * math.pi), 0.0, 1.0) ** 0.5
    points -= vertex_normals * (weight * depth)[:, None]
    return weight


# ---------------------------------------------------------------------------------------------
# Surgery
# ---------------------------------------------------------------------------------------------

def delete_vertices(obj, mask):
    """Removes the vertices where `mask` is True, with every face that uses one."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    doomed = [vertex for vertex, gone in zip(bm.verts, mask) if gone]
    bmesh.ops.delete(bm, geom=doomed, context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def delete_faces(obj, mask):
    """Removes the faces where `mask` is True and the vertices left without a face."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    doomed = [face for face, gone in zip(bm.faces, mask) if gone]
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def drop_small_islands(obj, keep_fraction=0.02):
    """Removes connected pieces with fewer vertices than a fraction of the largest piece: the
    crumbs a cut can leave behind."""
    points = len(obj.data.vertices)
    if points == 0:
        return obj
    pairs = edges(obj)
    label = np.arange(points)
    for _ in range(200):
        low = np.minimum(label[pairs[:, 0]], label[pairs[:, 1]])
        before = label.copy()
        np.minimum.at(label, pairs[:, 0], low)
        np.minimum.at(label, pairs[:, 1], low)
        label = label[label]
        if np.array_equal(before, label):
            break
    sizes = np.bincount(label, minlength=points)
    small = sizes[label] < keep_fraction * sizes.max()
    if small.any():
        delete_vertices(obj, small)
    return obj


def bisect(obj, point=(0.0, 0.0, 0.0), normal=(1.0, 0.0, 0.0), keep_positive=True):
    """Cuts the mesh by a plane and keeps one side; the cut stays open."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-6,
                           plane_co=Vector(point), plane_no=Vector(normal),
                           clear_inner=keep_positive, clear_outer=not keep_positive)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def finish_openings(obj, thickness, under=None, tuck=0.02, skip=None, material_index=None):
    """Gives every open edge of a garment a turned-in rim `thickness` deep (the cloth's visible
    thickness at a cuff, hem or collar) and, when `under` (a BVH tree of what is worn beneath)
    is given, a dark throat from the rim to the body a little way inside, so nobody can see
    through a sleeve. skip(position) -> True leaves an edge alone (the mirror cut).
    Returns the number of rim vertices made."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    rim_edges = [edge for edge in bm.edges if edge.is_boundary
                 and not (skip is not None and skip(edge.verts[0].co) and skip(edge.verts[1].co))]
    if not rim_edges:
        bm.free()
        return 0
    inward = {}
    for edge in rim_edges:
        for vertex in edge.verts:
            if vertex in inward:
                continue
            direction = Vector()
            for linked in vertex.link_edges:
                if not linked.is_boundary:
                    direction += linked.other_vert(vertex).co - vertex.co
            inward[vertex] = (direction.normalized() if direction.length > 1e-9 else Vector(),
                              vertex.normal.copy())
    made = bmesh.ops.extrude_edge_only(bm, edges=rim_edges)
    fresh = [item for item in made['geom'] if isinstance(item, bmesh.types.BMVert)]
    fresh_edges = [item for item in made['geom'] if isinstance(item, bmesh.types.BMEdge)]
    origin = {}
    for vertex in fresh:
        for linked in vertex.link_edges:
            other = linked.other_vert(vertex)
            if other in inward:
                origin[vertex] = other
    for vertex in fresh:
        direction, normal = inward[origin[vertex]]
        vertex.co = origin[vertex].co - normal * thickness + direction * (thickness * 0.3)
    new_faces = [face for vertex in fresh for face in vertex.link_faces]
    if under is not None:
        throat = bmesh.ops.extrude_edge_only(bm, edges=fresh_edges)
        deep = [item for item in throat['geom'] if isinstance(item, bmesh.types.BMVert)]
        source = {}
        for vertex in deep:
            for linked in vertex.link_edges:
                other = linked.other_vert(vertex)
                if other in origin:
                    source[vertex] = other
        for vertex in deep:
            direction, normal = inward[origin[source[vertex]]]
            probe = source[vertex].co + direction * tuck
            hit = under.find_nearest(probe)
            if hit[0] is not None:
                vertex.co = hit[0] - hit[1] * 0.0015
            else:
                vertex.co = probe - normal * 0.02
        new_faces += [face for vertex in deep for face in vertex.link_faces]
    if material_index is not None:
        for face in set(new_faces):
            face.material_index = material_index
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    count = len(fresh)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return count


def covered(inner, outer_tree, reach=0.05, margin_rings=8, start=0.0005):
    """A boolean array over the vertices of `inner`: True where the surface lies under the
    mesh behind `outer_tree` (a ray along the normal meets it within `reach`) and at least
    `margin_rings` rings of vertices away from where it shows."""
    points = positions(inner)
    vertex_normals = normals(inner)
    hidden = np.zeros(len(points), dtype=bool)
    for index in range(len(points)):
        normal = Vector(vertex_normals[index])
        hit = outer_tree.ray_cast(Vector(points[index]) + normal * start, normal, reach)
        hidden[index] = hit[0] is not None
    shown = spread(~hidden, edges(inner), margin_rings)
    return ~shown


def decimate(obj, triangles, protect=None, strength=4.0):
    """Collapses edges until about `triangles` remain. protect is a per-vertex array 0..1:
    1 keeps the most detail there (faces, hands)."""
    current = triangle_count(obj)
    if current <= triangles:
        return obj
    modifier = obj.modifiers.new('decimate', 'DECIMATE')
    modifier.decimate_type = 'COLLAPSE'
    modifier.ratio = triangles / current
    modifier.use_collapse_triangulate = True
    if protect is not None:
        group = obj.vertex_groups.new(name='mz_protect')
        levels = np.clip(np.round(np.asarray(protect) * 8.0), 0, 8).astype(int)
        for level in range(9):
            chosen = np.nonzero(levels == level)[0]
            if len(chosen):
                group.add(chosen.tolist(), level / 8.0, 'REPLACE')
        modifier.vertex_group = group.name
        modifier.invert_vertex_group = True
        modifier.vertex_group_factor = strength
    scene.activate(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    if protect is not None:
        obj.vertex_groups.remove(obj.vertex_groups['mz_protect'])
    obj.data.validate(verbose=False)
    obj.data.update()
    return obj


def set_vertex_colors(obj, colors, name='mask'):
    """Stores one RGB colour per vertex as a colour attribute a material can read (masks for
    lips, brows, seams, wear)."""
    mesh = obj.data
    attribute = mesh.color_attributes.get(name) or mesh.color_attributes.new(name, 'FLOAT_COLOR',
                                                                             'POINT')
    data = np.ones((len(mesh.vertices), 4), dtype=np.float32)
    data[:, :3] = colors
    attribute.data.foreach_set('color', data.ravel())
    mesh.update()
    return obj


def clear_vertex_colors(obj):
    """Removes every colour attribute (the game mesh must not carry the bake masks)."""
    mesh = obj.data
    while mesh.color_attributes:
        mesh.color_attributes.remove(mesh.color_attributes[0])
    return obj
