"""Normals and mesh hygiene: smooth shading with sharp edges where the form turns, face-weighted
normals for bevelled hard surfaces, cleanup, and triangulation.

The rule for game meshes: smooth everything, keep edges sharper than about 30 to 40 degrees
sharp, and let a baked normal map (or a real bevel with weighted normals) round them off.
"""
import math

import bmesh
import bpy

from . import scene


def smooth(obj, angle=math.radians(35)):
    """Smooth shading with every edge sharper than `angle` marked sharp (a hard shading break)."""
    mesh = obj.data
    mesh.shade_smooth()
    mesh.set_sharp_from_angle(angle=angle)
    mesh.update()
    return obj


def flat(obj):
    """Flat shading on every face."""
    obj.data.shade_flat()
    obj.data.update()
    return obj


def mark_sharp(obj, select, sharp=True):
    """Marks edges for which select(edge) is true (a bmesh edge) as sharp or smooth by hand."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for edge in bm.edges:
        if select(edge):
            edge.smooth = not sharp
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def weighted_normals(obj, keep_sharp=True, weight=50):
    """Face-weighted normals: large flat faces keep flat shading and the bevels take the curve.

    Use it after modify.bevel on hard-surface models; the result is exported as custom normals.
    """
    modifier = obj.modifiers.new('weighted', 'WEIGHTED_NORMAL')
    modifier.keep_sharp = keep_sharp
    modifier.weight = weight
    modifier.mode = 'FACE_AREA'
    scene.activate(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def cleanup(obj, merge_distance=0.00005, recalc=True):
    """Merges doubles, removes degenerate and loose geometry and makes normals consistent."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge_distance)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=merge_distance)
    loose_edges = [edge for edge in bm.edges if not edge.link_faces]
    if loose_edges:
        bmesh.ops.delete(bm, geom=loose_edges, context='EDGES')
    loose_verts = [vert for vert in bm.verts if not vert.link_edges]
    if loose_verts:
        bmesh.ops.delete(bm, geom=loose_verts, context='VERTS')
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def recalc_normals(obj, inside=False):
    """Makes face normals consistent, pointing out of the volume (or into it with inside=True)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if inside:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def flip(obj):
    """Reverses every face."""
    obj.data.flip_normals()
    obj.data.update()
    return obj


def triangulate(obj):
    """Triangulates in place with bmesh (keeps UVs, materials and sharp edges)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=[face for face in bm.faces if len(face.verts) > 3],
                          quad_method='SHORT_EDGE', ngon_method='BEAUTY')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def vertex_colors(obj, color_at, name='Color'):
    """Paints a vertex colour attribute from color_at(position) -> grey value or (r, g, b).

    The exporter writes it as COLOR_0 and the game multiplies it into the base colour: cheap
    large-scale shading that no texture can hold when texture space is shared, such as the
    darkness inside a tree crown. White (1.0) leaves the surface unchanged.
    """
    mesh = obj.data
    attribute = mesh.color_attributes.get(name) or mesh.color_attributes.new(name, 'BYTE_COLOR',
                                                                             'CORNER')
    mesh.color_attributes.active_color = attribute
    for loop in mesh.loops:
        value = color_at(mesh.vertices[loop.vertex_index].co)
        rgb = (value, value, value) if isinstance(value, (int, float)) else tuple(value)[:3]
        attribute.data[loop.index].color = (rgb[0], rgb[1], rgb[2], 1.0)
    mesh.update()
    return obj


def surface_area(obj):
    """The mesh's surface area in square metres (object scale ignored: apply transforms first)."""
    return sum(polygon.area for polygon in obj.data.polygons)
