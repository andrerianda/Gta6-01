"""Modifiers applied on the spot: each function changes the object's mesh and returns the object,
so calls chain and nothing is left on the modifier stack for the exporter to trip over.

Angles are radians. Widths and distances are metres.
"""
import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector, noise

from . import scene


def apply(obj, kind, **properties):
    """Adds a modifier of Blender type `kind`, sets `properties` on it and applies it."""
    modifier = obj.modifiers.new(kind.lower(), kind)
    for key, value in properties.items():
        setattr(modifier, key, value)
    scene.activate(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def mirror(obj, axis='X', merge=True, merge_distance=0.0005, bisect=False, stack_uv=True):
    """Mirrors across the object's origin plane. bisect cuts away what crosses the plane first.

    The mirrored half shares the original's UVs (and so its texture) unless stack_uv is False.
    """
    index = 'XYZ'.index(axis.upper())
    use_axis = [i == index for i in range(3)]
    properties = dict(use_axis=use_axis, use_mirror_merge=merge, merge_threshold=merge_distance,
                      use_clip=False, use_bisect_axis=use_axis if bisect else [False] * 3)
    if not stack_uv:
        properties['offset_u'] = 1.0
    return apply(obj, 'MIRROR', **properties)


def array(obj, count, offset=(1.0, 0.0, 0.0), merge=False, merge_distance=0.0005):
    """Repeats the mesh `count` times in all, each copy moved by a further `offset` metres."""
    source = obj.data.copy()
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for index in range(1, count):
        start = len(bm.verts)
        bm.from_mesh(source)
        bm.verts.ensure_lookup_table()
        bmesh.ops.translate(bm, verts=bm.verts[start:], vec=Vector(offset) * index)
    if merge:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge_distance)
    bm.to_mesh(obj.data)
    bm.free()
    bpy.data.meshes.remove(source)
    obj.data.update()
    return obj


def radial_array(obj, count, axis='Z', angle=math.tau, centre=(0.0, 0.0, 0.0), merge=False,
                 merge_distance=0.0005):
    """Repeats the mesh `count` times around an axis through `centre`, spread over `angle`."""
    source = obj.data.copy()
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    steps = count if angle >= math.tau - 1e-6 else max(count - 1, 1)
    for index in range(1, count):
        start = len(bm.verts)
        bm.from_mesh(source)
        bm.verts.ensure_lookup_table()
        bmesh.ops.rotate(bm, verts=bm.verts[start:], cent=Vector(centre),
                         matrix=Matrix.Rotation(angle * index / steps, 3, axis.upper()))
    if merge:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge_distance)
    bm.to_mesh(obj.data)
    bm.free()
    bpy.data.meshes.remove(source)
    obj.data.update()
    return obj


def bevel(obj, width=0.01, segments=2, angle=math.radians(30), profile=0.5, harden_normals=False,
          vertices_only=False, by_weight=False):
    """Bevels every edge sharper than `angle` (or only edges with a bevel weight, by_weight)."""
    return apply(obj, 'BEVEL', width=width, segments=segments, profile=profile,
                 limit_method='WEIGHT' if by_weight else 'ANGLE', angle_limit=angle,
                 harden_normals=harden_normals, affect='VERTICES' if vertices_only else 'EDGES',
                 use_clamp_overlap=True, miter_outer='MITER_ARC')


def crease(obj, angle=math.radians(40), value=1.0, boundary=None, select=None):
    """Sets subdivision creases: on edges sharper than `angle`, on open boundaries when `boundary`
    gives a value, and on edges for which select(edge) is true (a bmesh edge)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    layer = bm.edges.layers.float.get('crease_edge') or bm.edges.layers.float.new('crease_edge')
    for edge in bm.edges:
        if len(edge.link_faces) == 2:
            if angle is not None and edge.calc_face_angle(0.0) > angle:
                edge[layer] = value
        elif boundary is not None:
            edge[layer] = boundary
        if select is not None and select(edge):
            edge[layer] = value
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def subdivide(obj, levels=1, simple=False, crease_angle=None, crease_value=1.0):
    """Catmull-Clark subdivision (or `simple`); crease_angle keeps edges sharper than it crisp."""
    if crease_angle is not None:
        crease(obj, angle=crease_angle, value=crease_value)
    return apply(obj, 'SUBSURF', levels=levels, render_levels=levels,
                 subdivision_type='SIMPLE' if simple else 'CATMULL_CLARK', use_creases=True)


def boolean(obj, cutter, operation='DIFFERENCE', keep_cutter=False, solver='EXACT'):
    """Cuts (`DIFFERENCE`), merges (`UNION`) or intersects (`INTERSECT`) with another mesh object."""
    apply(obj, 'BOOLEAN', object=cutter, operation=operation, solver=solver)
    scene.drop_empty_material_slots(obj)
    if not keep_cutter:
        scene.delete(cutter)
    return obj


def solidify(obj, thickness=0.01, offset=-1.0, even=True, rim=True):
    """Gives a sheet thickness; offset -1 grows inwards, +1 outwards, 0 both ways."""
    return apply(obj, 'SOLIDIFY', thickness=thickness, offset=offset, use_even_offset=even,
                 use_rim=rim, use_quality_normals=True)


def shrinkwrap(obj, target, offset=0.0, method='NEAREST_SURFACEPOINT', project_axis=None):
    """Snaps the mesh onto `target`; with project_axis ('X', 'Y' or 'Z') it projects both ways."""
    properties = dict(target=target, offset=offset, wrap_method=method)
    if project_axis is not None:
        properties.update(wrap_method='PROJECT', use_negative_direction=True,
                          use_positive_direction=True, use_project_x=project_axis == 'X',
                          use_project_y=project_axis == 'Y', use_project_z=project_axis == 'Z')
    return apply(obj, 'SHRINKWRAP', **properties)


def decimate(obj, ratio=0.5, planar_angle=None, unsubdivide=None):
    """Reduces triangles: edge collapse to `ratio`, or planar dissolve below `planar_angle`, or
    `unsubdivide` iterations to undo subdivision levels. UVs and materials survive."""
    if planar_angle is not None:
        return apply(obj, 'DECIMATE', decimate_type='DISSOLVE', angle_limit=planar_angle,
                     delimit={'MATERIAL', 'UV', 'SHARP'})
    if unsubdivide is not None:
        return apply(obj, 'DECIMATE', decimate_type='UNSUBDIV', iterations=unsubdivide)
    return apply(obj, 'DECIMATE', decimate_type='COLLAPSE', ratio=ratio,
                 use_collapse_triangulate=True)


def weld(obj, distance=0.0005):
    """Merges vertices closer than `distance`."""
    return apply(obj, 'WELD', merge_threshold=distance)


def triangulate(obj, keep_normals=True):
    """Turns every polygon into triangles (the pipeline does this before baking)."""
    return apply(obj, 'TRIANGULATE', quad_method='SHORTEST_DIAGONAL', ngon_method='BEAUTY',
                 min_vertices=4, keep_custom_normals=keep_normals)


def wireframe(obj, thickness=0.01, replace=True):
    """Turns every edge into a bar: grilles, cages, chain-link at close range."""
    return apply(obj, 'WIREFRAME', thickness=thickness, use_replace=replace,
                 use_even_offset=True, use_boundary=True)


def deform(obj, method='BEND', angle=0.0, factor=0.0, axis='Z', origin=None):
    """Bends, twists (`angle`) or tapers and stretches (`factor`) the mesh along an axis.

    `origin` is an optional empty that places and orients the deformation, as in Blender.
    """
    properties = dict(deform_method=method.upper(), deform_axis=axis.upper())
    if method.upper() in ('BEND', 'TWIST'):
        properties['angle'] = angle
    else:
        properties['factor'] = factor
    if origin is not None:
        properties['origin'] = origin
    return apply(obj, 'SIMPLE_DEFORM', **properties)


def displace_noise(obj, amplitude=0.01, scale=1.0, seed=0, along_normal=True, octaves=3):
    """Pushes vertices by fractal noise (metres): dents, organic wobble, hand-made irregularity."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    shift = Vector((seed * 17.31, seed * -9.73, seed * 5.19))
    for vert in bm.verts:
        point = vert.co * scale + shift
        if along_normal:
            value = noise.fractal(point, 1.0, 2.0, octaves, noise_basis='PERLIN_ORIGINAL')
            vert.co += vert.normal * (value * amplitude)
        else:
            vert.co += noise.turbulence_vector(point, octaves, False) * amplitude
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def transform(obj, location=(0.0, 0.0, 0.0), rotation=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)):
    """Moves the mesh data itself: scale, then XYZ Euler rotation, then translation."""
    return scene.move(obj, offset=location, rotation=rotation, scale=scale)


def map_vertices(obj, function):
    """Replaces every vertex position by function(Vector) -> Vector: free-form shaping in code."""
    for vertex in obj.data.vertices:
        vertex.co = function(vertex.co.copy())
    obj.data.update()
    return obj


def inset_faces(obj, thickness=0.01, depth=0.0, select=None):
    """Insets each selected face on its own (select(face) on a bmesh face; all by default) and
    pushes it in by `depth`: panels, window recesses, drawer fronts."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    faces = [face for face in bm.faces if select is None or select(face)]
    bmesh.ops.inset_individual(bm, faces=faces, thickness=thickness, depth=-depth)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def rotation_matrix(rotation):
    """A 4x4 matrix from an XYZ Euler rotation in radians."""
    return Euler(rotation, 'XYZ').to_matrix().to_4x4()
