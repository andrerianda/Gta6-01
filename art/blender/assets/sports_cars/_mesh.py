"""Shared helper of the hero cars: mesh plumbing the library does not have.

MeshData collects faces with their own UVs, normals, material names and a level-of-detail tag
and turns them into a Blender object. The cars need three things beyond the mesh builders:

* Normals of the designed surface, not of the mesh. A car body is cut into panels (doors, hood,
  bumpers), and every panel computing its own normals would break the reflection at each shut
  line. The body's normals are computed once on the uncut surface and stored per face corner in
  Blender's free custom-normal attribute, which survives triangulation, joining and export.
  Blender's mirror modifier copies that attribute without mirroring it: mirror_normals() fixes
  the mirrored half afterwards.
* A tag on every face saying up to which level of detail it is kept (flanges, pocket walls and
  small fittings exist at level 0 only), so the lower levels are cut from the same baked mesh.
* Small helpers to select, copy and delete faces by that tag or by material.
"""
import math

import bmesh
import bpy
import numpy as np

from lib import build, modify, scene, shading

NORMAL_ATTRIBUTE = 'custom_normal'
LOD_ATTRIBUTE = 'keep_lod'


class MeshData:
    """Faces under construction: positions, and per face a material name, a level tag and
    optional per-corner UVs and normals."""

    def __init__(self):
        self.points = []
        self.faces = []
        self.materials = []
        self.levels = []
        self.uvs = []
        self.normals = []

    def point(self, position):
        """Adds a vertex; returns its index."""
        self.points.append((float(position[0]), float(position[1]), float(position[2])))
        return len(self.points) - 1

    def face(self, indices, material, level=0, uvs=None, normals=None):
        """Adds a face over vertex indices (counter-clockwise seen from outside). Faces that
        have collapsed to a line or a point are dropped."""
        indices = list(indices)
        keep = [n for n, index in enumerate(indices) if index != indices[n - 1]]
        if len(keep) < 3:
            return False
        if len(keep) < len(indices):
            indices = [indices[n] for n in keep]
            uvs = [uvs[n] for n in keep] if uvs is not None else None
            normals = [normals[n] for n in keep] if normals is not None else None
        if _area(self.points, indices) < 1e-9:
            return False
        self.faces.append(indices)
        self.materials.append(material)
        self.levels.append(level)
        self.uvs.append(uvs)
        self.normals.append(normals)
        return True

    def quad_grid(self, rows, material, level=0, flip=False, closed=False):
        """Adds a sheet through `rows` (lists of points, same count each), facing the side
        from which its rows run left to right and bottom to top (or the other with flip)."""
        indices = [[self.point(point) for point in row] for row in rows]
        count = len(rows[0])
        for i in range(len(rows) - 1):
            for j in range(count if closed else count - 1):
                k = (j + 1) % count
                corners = [indices[i][j], indices[i][k], indices[i + 1][k], indices[i + 1][j]]
                if flip:
                    corners.reverse()
                self.face(corners, material, level)
        return indices

    def to_object(self, name, materials):
        """Builds the Blender object. materials: {material name: Blender material}."""
        used = []
        for material in self.materials:
            if material not in used:
                used.append(material)
        uvs = [face_uvs if face_uvs is not None else [(0.0, 0.0)] * len(face)
               for face, face_uvs in zip(self.faces, self.uvs)]
        obj = build.from_data(name, self.points, self.faces, uvs)
        mesh = obj.data
        for material in used:
            mesh.materials.append(materials[material])
        mesh.polygons.foreach_set('material_index', [used.index(m) for m in self.materials])
        mesh.shade_smooth()
        mesh.update()
        level = mesh.attributes.new(LOD_ATTRIBUTE, 'INT', 'FACE')
        level.data.foreach_set('value', self.levels)
        normals = np.zeros((len(mesh.loops), 3), dtype=np.float32)
        for polygon, face_normals in zip(mesh.polygons, self.normals):
            span = range(polygon.loop_start, polygon.loop_start + polygon.loop_total)
            if face_normals is None:
                normals[span.start:span.stop] = polygon.normal
            else:
                normals[span.start:span.stop] = face_normals
        write_normals(obj, normals)
        return obj


def _area(points, indices):
    """Twice the area of a polygon (the length of its summed cross products)."""
    ax, ay, az = points[indices[0]]
    sx = sy = sz = 0.0
    for n in range(1, len(indices) - 1):
        bx, by, bz = points[indices[n]]
        cx, cy, cz = points[indices[n + 1]]
        ux, uy, uz = bx - ax, by - ay, bz - az
        vx, vy, vz = cx - ax, cy - ay, cz - az
        sx += uy * vz - uz * vy
        sy += uz * vx - ux * vz
        sz += ux * vy - uy * vx
    return math.sqrt(sx * sx + sy * sy + sz * sz)


def write_normals(obj, normals):
    """Stores per-corner normals (loops x 3) as the mesh's free custom normals."""
    mesh = obj.data
    attribute = mesh.attributes.get(NORMAL_ATTRIBUTE)
    if attribute is not None and (attribute.data_type != 'FLOAT_VECTOR' or attribute.domain != 'CORNER'):
        mesh.attributes.remove(attribute)
        attribute = None
    if attribute is None:
        attribute = mesh.attributes.new(NORMAL_ATTRIBUTE, 'FLOAT_VECTOR', 'CORNER')
    attribute.data.foreach_set('vector', np.ascontiguousarray(normals, dtype=np.float32).ravel())
    mesh.update()


def read_normals(obj):
    """The normals Blender shades each corner with, as a (loops, 3) array."""
    mesh = obj.data
    normals = np.empty(len(mesh.loops) * 3, dtype=np.float32)
    mesh.corner_normals.foreach_get('vector', normals)
    return normals.reshape(-1, 3)


def freeze_normals(obj, angle=math.radians(40)):
    """Smooth-shades a library-built mesh with edges sharper than `angle` kept hard and stores
    the result as custom normals, so the mesh can be joined with the body without either
    losing its shading. Meshes that already carry custom normals are left alone."""
    if obj.data.attributes.get(NORMAL_ATTRIBUTE) is None:
        shading.smooth(obj, angle=angle)
        write_normals(obj, read_normals(obj).copy())
    return obj


def clear_normals(obj, angle=math.radians(50)):
    """Drops the custom normals (a decimated level cannot keep them) and smooth-shades."""
    attribute = obj.data.attributes.get(NORMAL_ATTRIBUTE)
    if attribute is not None:
        obj.data.attributes.remove(attribute)
    shading.smooth(obj, angle=angle)
    return obj


def mirror_normals(obj):
    """After a mirror across X: flips the X of the custom normals on the mirrored half (the
    faces whose centre is on the negative side), which the modifier copied unchanged."""
    mesh = obj.data
    attribute = mesh.attributes.get(NORMAL_ATTRIBUTE)
    if attribute is None:
        return obj
    normals = np.empty(len(mesh.loops) * 3, dtype=np.float32)
    attribute.data.foreach_get('vector', normals)
    normals = normals.reshape(-1, 3)
    for polygon in mesh.polygons:
        if polygon.center.x < 0.0:
            normals[polygon.loop_start:polygon.loop_start + polygon.loop_total, 0] *= -1.0
    write_normals(obj, normals)
    return obj


def mirrored_copy(obj, name):
    """A real mirrored copy of a mesh across the world YZ plane (own mesh data, same UVs, so
    it shares the original's texels), with its origin mirrored too."""
    copy = scene.duplicate(obj, name)
    origin = copy.matrix_world.translation.copy()
    scene.set_origin(copy, (0.0, origin.y, origin.z))
    # Mesh.transform mirrors the custom normals with the vertices (probe_mirror.py): no fix-up.
    modify.transform(copy, scale=(-1.0, 1.0, 1.0))
    scene.set_origin(copy, (-origin.x, origin.y, origin.z))
    return copy


def single_uv(obj):
    """Folds every UV layer of a mesh into the library's one and removes the others. The
    library's box builder names its layer differently from the other builders, so a join of
    boxes with lathes or with MeshData carries two layers, and the second would be exported
    as a useless second UV set (8 bytes a vertex, and more split vertices)."""
    mesh = obj.data
    layers = mesh.uv_layers
    if len(layers) < 2:
        return obj
    main = layers[build.UV_LAYER].name if build.UV_LAYER in layers else layers[0].name
    count = len(mesh.loops)
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
    layers.active = layers[main]
    mesh.update()
    return obj


def tag_level(obj, level):
    """Marks every face of a mesh as kept up to `level` (0 = the finest level only)."""
    mesh = obj.data
    attribute = mesh.attributes.get(LOD_ATTRIBUTE)
    if attribute is None:
        attribute = mesh.attributes.new(LOD_ATTRIBUTE, 'INT', 'FACE')
    attribute.data.foreach_set('value', [level] * len(mesh.polygons))
    return obj


def tagged(objects, level, angle=math.radians(40)):
    """Prepares library-built parts for joining with the body: freezes their shading and tags
    their faces with the level of detail they are kept to. Returns the list."""
    objects = [obj for obj in objects if obj is not None]
    for obj in objects:
        freeze_normals(obj, angle)
        if obj.data.attributes.get(LOD_ATTRIBUTE) is None:
            tag_level(obj, level)
    return objects


def delete_faces(obj, select):
    """Deletes the faces for which select(face, level, material name) is true."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    layer = bm.faces.layers.int.get(LOD_ATTRIBUTE)
    names = [slot.material.name if slot.material else '' for slot in obj.material_slots]
    doomed = [face for face in bm.faces
              if select(face, face[layer] if layer is not None else 0,
                        names[face.material_index] if names else '')]
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def weld(obj, distance):
    """Merges vertices closer than `distance` (closes the panel gaps of a lower level)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=distance)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def rename_material(obj, old, new_material):
    """Gives the faces of the material named `old` that satisfy nothing else another material:
    used to turn the mirrored half's indicator lamp into the left one. Returns the object."""
    mesh = obj.data
    names = [slot.material.name if slot.material else '' for slot in obj.material_slots]
    if old not in names:
        return obj
    source = names.index(old)
    mesh.materials.append(new_material)
    target = len(mesh.materials) - 1
    for polygon in mesh.polygons:
        if polygon.material_index == source and polygon.center.x < 0.0:
            polygon.material_index = target
    mesh.update()
    return obj


def triangle_count(obj):
    """Triangles of a mesh object once triangulated."""
    return scene.triangle_count(obj)


def drop_unused_materials(obj):
    """Removes material slots no face uses (a level cut from a larger mesh keeps them all)."""
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
