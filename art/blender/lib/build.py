"""Mesh builders. Each returns a new mesh object linked to the scene, at the world origin with an
identity transform, standing in Blender's axes (Z up, the asset's front towards +Y).

Grid-like builders (lathe, loft, sweep, tube, card, ribbon) write clean UV strips measured in
metres, or fitted into `uv_rect` = (u0, v0, u1, v1) when one is given, so a piece baked once can be
reused on new geometry. Everything else gets UVs from uv.unwrap(). Faces come out with outward
normals when outlines are counter-clockwise (see profiles.py).
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from . import scene

UV_LAYER = 'UVMap'


# ---------------------------------------------------------------------------------------------
# Raw data and primitives
# ---------------------------------------------------------------------------------------------

def from_data(name, vertices, faces, uvs=None):
    """A mesh from vertex positions and faces (index lists); `uvs` is per face, per corner."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in vertices], [], [tuple(f) for f in faces])
    mesh.update()
    layer = mesh.uv_layers.new(name=UV_LAYER)
    if uvs is not None:
        for polygon, face_uvs in zip(mesh.polygons, uvs):
            for loop_index, uv in zip(polygon.loop_indices, face_uvs):
                layer.data[loop_index].uv = uv
    return scene.new_object(name, mesh)


def _finish(name, bm):
    """Writes a bmesh into a new object and frees it."""
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    if not mesh.uv_layers:
        mesh.uv_layers.new(name=UV_LAYER)
    mesh.update()
    return scene.new_object(name, mesh)


def box(name, size=(1.0, 1.0, 1.0), location=(0.0, 0.0, 0.0), on_ground=False):
    """A box of full `size` centred on `location` (or resting on it with on_ground=True)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    centre = Vector(location) + (Vector((0, 0, size[2] / 2)) if on_ground else Vector())
    bmesh.ops.transform(bm, verts=bm.verts,
                        matrix=Matrix.Translation(centre) @ Matrix.Diagonal((*size, 1.0)))
    _planar_face_uvs(bm)
    return _finish(name, bm)


def _planar_face_uvs(bm):
    """Gives every face its own flat UV island in metres (each face apart from the others)."""
    uv_layer = bm.loops.layers.uv.verify()
    for index, face in enumerate(bm.faces):
        face.normal_update()
        axis_u = (face.verts[1].co - face.verts[0].co).normalized()    # along the first edge
        axis_v = face.normal.cross(axis_u)
        origin = face.calc_center_median()
        for loop in face.loops:
            offset = loop.vert.co - origin
            loop[uv_layer].uv = (offset.dot(axis_u) + index * 100.0, offset.dot(axis_v))


def cylinder(name, radius=0.5, depth=1.0, segments=16, location=(0.0, 0.0, 0.0),
             radius_top=None, caps=True, on_ground=False):
    """A Z-axis cylinder (or cone with radius_top) centred on `location`, or standing on it."""
    top = radius if radius_top is None else radius_top
    base_z = 0.0 if on_ground else -depth / 2
    obj = lathe(name, [(radius, base_z), (top, base_z + depth)], segments=segments,
                cap_bottom=caps, cap_top=caps and top > 1e-6)
    return scene.move(obj, offset=location)


def sphere(name, radius=0.5, segments=16, rings=8, location=(0.0, 0.0, 0.0)):
    """A UV sphere: `segments` around, `rings` from pole to pole."""
    profile = [(radius * math.sin(math.pi * ring / rings), -radius * math.cos(math.pi * ring / rings))
               for ring in range(rings + 1)]
    profile[0], profile[-1] = (0.0, -radius), (0.0, radius)
    return scene.move(lathe(name, profile, segments=segments), offset=location)


def icosphere(name, radius=0.5, subdivisions=2, location=(0.0, 0.0, 0.0)):
    """An icosphere: even triangles, good for rocks and blobs that get displaced afterwards."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(location))
    return _finish(name, bm)


def grid(name, size=(1.0, 1.0), segments=(1, 1), location=(0.0, 0.0, 0.0), uv_rect=None):
    """A flat grid in the XY plane facing +Z, `segments` quads along X and Y."""
    count_x, count_y = segments
    rings = []
    for iy in range(count_y + 1):
        y = -size[1] / 2 + size[1] * iy / count_y
        rings.append([(location[0] - size[0] / 2 + size[0] * ix / count_x, location[1] + y,
                       location[2]) for ix in range(count_x + 1)])
    return surface(name, rings, uv_rect=uv_rect)


def card(name, width=1.0, height=1.0, segments=(1, 1), location=(0.0, 0.0, 0.0), uv_rect=None):
    """An upright card in the XZ plane facing -Y, its bottom edge centred on `location`."""
    count_x, count_z = segments
    rings = []
    for iz in range(count_z + 1):
        z = location[2] + height * iz / count_z
        rings.append([(location[0] - width / 2 + width * ix / count_x, location[1], z)
                      for ix in range(count_x + 1)])
    return surface(name, rings, uv_rect=uv_rect)


# ---------------------------------------------------------------------------------------------
# Grid surfaces: the shared core of lathe, loft, sweep, tube and ribbon
# ---------------------------------------------------------------------------------------------

def surface(name, rings, closed_u=False, cap_start=False, cap_end=False, uv_rect=None,
            flip=False):
    """A quad surface through `rings`, a list of equal-length lists of 3D points.

    Consecutive rings are joined by quads. With closed_u each ring is a closed loop (a tube);
    cap_start and cap_end close the first and last ring with one polygon. For a closed ring that
    is counter-clockwise about the direction of travel the normals point outwards; an open sheet
    faces the side from which its rings run left to right and bottom to top. `flip` reverses that.
    U runs along a ring and V from ring to ring, in metres unless `uv_rect` is given.
    """
    ring_count, column_count = len(rings), len(rings[0])
    if any(len(ring) != column_count for ring in rings):
        raise ValueError('surface(): every ring needs the same number of points')
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new(UV_LAYER)
    verts = [[bm.verts.new(point) for point in ring] for ring in rings]

    # U per column: the mean distance along the rings; V per ring: distance between rings.
    spans = column_count if closed_u else column_count - 1
    u_values = [0.0]
    for j in range(spans):
        step = sum(math.dist(ring[j], ring[(j + 1) % column_count]) for ring in rings) / ring_count
        u_values.append(u_values[-1] + step)
    v_values = [0.0]
    for i in range(ring_count - 1):
        step = sum(math.dist(rings[i][j], rings[i + 1][j])
                   for j in range(column_count)) / column_count
        v_values.append(v_values[-1] + step)
    if uv_rect is not None:
        u0, v0, u1, v1 = uv_rect
        u_total, v_total = max(u_values[-1], 1e-9), max(v_values[-1], 1e-9)
        u_values = [u0 + (u1 - u0) * u / u_total for u in u_values]
        v_values = [v0 + (v1 - v0) * v / v_total for v in v_values]

    for i in range(ring_count - 1):
        for j in range(spans):
            k = (j + 1) % column_count
            corners = [(verts[i][j], u_values[j], v_values[i]),
                       (verts[i][k], u_values[j + 1], v_values[i]),
                       (verts[i + 1][k], u_values[j + 1], v_values[i + 1]),
                       (verts[i + 1][j], u_values[j], v_values[i + 1])]
            if flip:
                corners.reverse()
            if len({corner[0] for corner in corners}) < 3:
                continue
            face = bm.faces.new([corner[0] for corner in corners])
            for loop, corner in zip(face.loops, corners):
                loop[uv_layer].uv = (corner[1], corner[2])

    for ring, reverse, wanted in ((verts[0], not flip, cap_start), (verts[-1], flip, cap_end)):
        if wanted and closed_u:
            _cap(bm, uv_layer, list(reversed(ring)) if reverse else list(ring))
    return _finish(name, bm)


def _cap(bm, uv_layer, ring):
    """Closes a ring of BMVerts with one polygon and gives it planar UVs in metres."""
    try:
        face = bm.faces.new(ring)
    except ValueError:
        return
    centre = sum((vert.co for vert in ring), Vector()) / len(ring)
    face.normal_update()
    normal = face.normal if face.normal.length > 0 else Vector((0, 0, 1))
    longest = max(range(len(ring)), key=lambda i: (ring[i].co - ring[i - 1].co).length)
    axis_u = (ring[longest].co - ring[longest - 1].co).normalized()   # along the longest edge
    axis_u = (axis_u - normal * axis_u.dot(normal)).normalized()
    axis_v = normal.cross(axis_u)
    for loop in face.loops:
        offset = loop.vert.co - centre
        loop[uv_layer].uv = (offset.dot(axis_u), offset.dot(axis_v))


def lathe(name, profile, segments=16, angle=math.tau, cap_bottom=False, cap_top=False,
          uv_rect=None):
    """Revolves `profile`, a list of (radius, z) from bottom to top, around the Z axis.

    A full turn gives a closed surface of `segments` quads around; a smaller `angle` gives an
    open sweep. Points at radius 0 close the shape to a pole. cap_bottom / cap_top close the
    first / last ring with a disc.
    """
    full = angle >= math.tau - 1e-6
    columns = segments if full else segments + 1
    descending = profile[-1][1] < profile[0][1]
    rings = [[(radius * math.cos(angle * j / segments), radius * math.sin(angle * j / segments), z)
              for j in range(columns)] for radius, z in profile]
    obj = surface(name, rings, closed_u=full, uv_rect=uv_rect, flip=descending,
                  cap_start=cap_top if descending else cap_bottom,
                  cap_end=cap_bottom if descending else cap_top)
    _weld_poles(obj)
    return obj


def _weld_poles(obj, distance=1e-6):
    """Merges coincident points (lathe poles, closed tips) so they do not shade as open rims."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=distance)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def loft(name, sections, closed=True, cap_start=False, cap_end=False, uv_rect=None, flip=False):
    """Skins a surface through `sections`, each a list of 3D points (same count in each).

    With closed=True each section is a closed outline; list its points counter-clockwise as seen
    looking back from the end of the loft towards its start to get outward normals.
    """
    return surface(name, [[tuple(point) for point in section] for section in sections],
                   closed_u=closed, cap_start=cap_start, cap_end=cap_end, uv_rect=uv_rect,
                   flip=flip)


def path_frames(path, up=(0.0, 0.0, 1.0), closed=False):
    """Rotation-minimising frames along a path: a list of (point, tangent, normal, binormal).

    The first normal is `up` made perpendicular to the path; later frames are carried along
    without twisting, so swept sections never flip on a bend.
    """
    points = [Vector(point) for point in path]
    count = len(points)
    tangents = []
    for i in range(count):
        if closed:
            tangent = points[(i + 1) % count] - points[(i - 1) % count]
        else:
            tangent = points[min(i + 1, count - 1)] - points[max(i - 1, 0)]
        tangents.append(tangent.normalized() if tangent.length > 1e-12 else Vector((0, 0, 1)))
    normal = Vector(up) - tangents[0] * Vector(up).dot(tangents[0])
    if normal.length < 1e-6:
        normal = tangents[0].orthogonal()
    normal.normalize()
    frames = []
    for i in range(count):
        if i > 0:
            axis = tangents[i - 1].cross(tangents[i])
            if axis.length > 1e-9:
                turn = tangents[i - 1].angle(tangents[i])
                normal = Matrix.Rotation(turn, 3, axis.normalized()) @ normal
            normal = (normal - tangents[i] * normal.dot(tangents[i])).normalized()
        frames.append((points[i], tangents[i], normal.copy(), tangents[i].cross(normal)))
    return frames


def sweep(name, outline, path, up=(0.0, 0.0, 1.0), scales=None, twists=None, closed_outline=True,
          closed_path=False, caps=True, uv_rect=None):
    """Extrudes a 2D `outline` along a 3D `path` (use profiles.smooth_path for a curve).

    The outline's +Y is laid along the frame normal (`up` at the start) and its +X along the
    binormal. `scales` gives one factor, or one (x, y) pair, per path point (a taper); `twists`
    one angle in radians per path point.
    """
    frames = path_frames(path, up=up, closed=closed_path)
    rings = []
    for index, (point, _tangent, normal, binormal) in enumerate(frames):
        scale = 1.0 if scales is None else scales[index]
        scale_x, scale_y = scale if isinstance(scale, (tuple, list)) else (scale, scale)
        twist = 0.0 if twists is None else twists[index]
        cos_t, sin_t = math.cos(twist), math.sin(twist)
        ring = []
        for x, y in outline:
            x, y = x * scale_x, y * scale_y
            x, y = x * cos_t - y * sin_t, x * sin_t + y * cos_t
            ring.append(tuple(point - binormal * x + normal * y))
        rings.append(ring)
    if closed_path:
        rings.append(list(rings[0]))
    obj = surface(name, rings, closed_u=closed_outline,
                  cap_start=caps and not closed_path, cap_end=caps and not closed_path,
                  uv_rect=uv_rect)
    if closed_path:
        _weld_poles(obj)
    return obj


def tube(name, path, radius=0.05, segments=8, radii=None, caps=True, up=(0.0, 0.0, 1.0),
         closed_path=False, uv_rect=None):
    """A round tube along a path; `radii` (one per path point) overrides the constant radius."""
    outline = [(math.cos(math.tau * i / segments), math.sin(math.tau * i / segments))
               for i in range(segments)]
    scales = list(radii) if radii is not None else [radius] * len(path)
    return sweep(name, outline, path, up=up, scales=scales, caps=caps, closed_path=closed_path,
                 uv_rect=uv_rect)


def ribbon(name, path, widths, up=(0.0, 0.0, 1.0), columns=1, fold=0.0, droop=None, twists=None,
           uv_rect=None):
    """A strip along a path, for leaves, fronds, straps and cloth edges.

    The strip is `widths[i]` wide at path point i and lies flat across the frame's binormal with
    its face towards the frame normal (`up` at the start). `columns` quads across; `fold` lifts
    (positive) or drops (negative) the two edges by that fraction of the half width, giving a V
    section; `droop`, one value per path point, overrides `fold` along the strip; `twists`, one
    angle in radians per path point, rolls the strip about its own length.
    """
    frames = path_frames(path, up=up)
    rings = []
    for index, (point, tangent, normal, binormal) in enumerate(frames):
        half = widths[index] / 2
        bend = fold if droop is None else droop[index]
        if twists is not None:
            roll = Matrix.Rotation(twists[index], 3, tangent)
            normal, binormal = roll @ normal, roll @ binormal
        ring = []
        for column in range(columns + 1):
            across = -1.0 + 2.0 * column / columns
            ring.append(tuple(point + binormal * (across * half) + normal * (abs(across) * half * bend)))
        rings.append(ring)
    return surface(name, rings, uv_rect=uv_rect)


def extrude_outline(name, outline, depth, location=(0.0, 0.0, 0.0), cap=True):
    """A prism: a 2D outline in the XY plane extruded `depth` along +Z from `location`."""
    base = [(location[0] + x, location[1] + y, location[2]) for x, y in outline]
    top = [(x, y, z + depth) for x, y, z in base]
    return surface(name, [base, top], closed_u=True, cap_start=cap, cap_end=cap)
