"""Mesh builders for the aircraft scripts: lofted bodies, wings from aerofoil sections, simple solids.

Blender axes while modelling: Z up, the nose towards +Y, the right wing towards +X, wheels on Z = 0.
Every builder returns a mesh object at identity (its data is where you asked for it), linked to the
scene. Lengths are metres, angles degrees.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector


def mesh_object(name, verts, faces):
    """A mesh object from points and faces (index lists, counter-clockwise seen from outside)."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def ring(y, width, height, z=0.0, x=0.0, count=24, power=2.0, flat_bottom=0.0):
    """A fuselage cross-section: a superellipse in the XZ plane at station y.

    power 2 is an ellipse, larger is boxier; flat_bottom (0..1) squashes the lower half.
    The points run counter-clockwise seen from the nose side (+Y looking back).
    """
    points = []
    for i in range(count):
        a = 2 * math.pi * i / count
        c, s = math.cos(a), math.sin(a)
        px = math.copysign(abs(c) ** (2.0 / power), c) * width * 0.5
        pz = math.copysign(abs(s) ** (2.0 / power), s) * height * 0.5
        if pz < 0:
            pz *= 1.0 - flat_bottom
        points.append((x + px, y, z + pz))
    return points


def loft(name, rings, cap_start=True, cap_end=True):
    """Skins a list of rings (each the same number of points) into a tube with optional end caps.

    Rings run from the tail (-Y) to the nose (+Y) for the normals to point outwards when each ring is
    counter-clockwise seen from +Y; give them in the other order and call flip(obj).
    """
    count = len(rings[0])
    verts = [p for r in rings for p in r]
    faces = []
    for k in range(len(rings) - 1):
        a, b = k * count, (k + 1) * count
        for i in range(count):
            j = (i + 1) % count
            faces.append((a + i, a + j, b + j, b + i))
    if cap_start:
        faces.append(tuple(range(count - 1, -1, -1)))
    if cap_end:
        base = (len(rings) - 1) * count
        faces.append(tuple(base + i for i in range(count)))
    obj = mesh_object(name, verts, faces)
    recalc_normals(obj)
    return obj


def fuselage(name, stations, count=24):
    """A body from stations: dicts with y, w, h and optionally z, x, power, flat (see ring())."""
    rings = [ring(s['y'], s['w'], s['h'], s.get('z', 0.0), s.get('x', 0.0), count, s.get('power', 2.0), s.get('flat', 0.0))
             for s in sorted(stations, key=lambda s: s['y'])]
    return loft(name, rings)


def aerofoil(chord, thickness=0.12, camber=0.02, count=12):
    """A closed aerofoil outline as (back, up) pairs: 0 is the leading edge, chord the trailing edge."""
    upper, lower = [], []
    for i in range(count + 1):
        t = 0.5 * (1 - math.cos(math.pi * i / count))
        half = 5 * thickness * (0.2969 * math.sqrt(t) - 0.126 * t - 0.3516 * t ** 2 + 0.2843 * t ** 3 - 0.1015 * t ** 4)
        bend = camber * 4 * t * (1 - t)
        upper.append((t * chord, (bend + half) * chord))
        lower.append((t * chord, (bend - half) * chord))
    return upper + lower[-2:0:-1]


def wing(name, sections, count=12):
    """A lifting surface lofted through sections, root first.

    Each section is a dict: x (span position), y (leading edge), z, chord, and optionally twist
    (degrees, nose up), thickness, camber, cant (degrees: 90 stands the section upright for a fin
    whose 'span' then runs along z; give x as the fin's x and z as its height).
    """
    rings = []
    for s in sections:
        outline = aerofoil(s['chord'], s.get('thickness', 0.12), s.get('camber', 0.02), count)
        twist = math.radians(s.get('twist', 0.0))
        cant = math.radians(s.get('cant', 0.0))
        points = []
        for back, up in outline:
            b = back * math.cos(twist) + up * math.sin(twist)
            u = up * math.cos(twist) - back * math.sin(twist)
            points.append((s['x'] - u * math.sin(cant), s['y'] - b, s.get('z', 0.0) + u * math.cos(cant)))
        rings.append(points)
    obj = loft(name, rings)
    recalc_normals(obj)
    return obj


def box(name, size, location=(0, 0, 0), bevel_width=0.0, segments=2):
    """A box of full size (x, y, z) centred on location, optionally with rounded edges."""
    sx, sy, sz = (0.5 * v for v in size)
    verts = [(x, y, z) for z in (-sz, sz) for y in (-sy, sy) for x in (-sx, sx)]
    faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    obj = mesh_object(name, [(v[0] + location[0], v[1] + location[1], v[2] + location[2]) for v in verts], faces)
    if bevel_width > 0:
        bevel(obj, bevel_width, segments)
    return obj


def cylinder(name, radius, depth, location=(0, 0, 0), axis='Y', segments=24, radius_end=None):
    """A cylinder (or a cone frustum with radius_end) along an axis, centred on location."""
    r1 = radius if radius_end is None else radius_end
    rings = []
    for end, r in ((-0.5 * depth, radius), (0.5 * depth, r1)):
        pts = []
        for i in range(segments):
            a = 2 * math.pi * i / segments
            c, s = math.cos(a) * max(r, 1e-4), math.sin(a) * max(r, 1e-4)
            p = {'Y': (c, end, s), 'X': (end, s, c), 'Z': (s, c, end)}[axis]
            pts.append((p[0] + location[0], p[1] + location[1], p[2] + location[2]))
        rings.append(pts)
    obj = loft(name, rings)
    recalc_normals(obj)
    return obj


def tube(name, path, radius, segments=8):
    """A round tube along a list of points (struts, pitot tubes, ladder rails)."""
    rings = []
    for i, p in enumerate(path):
        p = Vector(p)
        ahead = (Vector(path[min(i + 1, len(path) - 1)]) - Vector(path[max(i - 1, 0)])).normalized()
        side = ahead.cross(Vector((0, 0, 1)))
        if side.length < 1e-4:
            side = ahead.cross(Vector((1, 0, 0)))
        side.normalize()
        up = side.cross(ahead)
        r = radius[i] if isinstance(radius, (list, tuple)) else radius
        rings.append([tuple(p + (side * math.cos(2 * math.pi * k / segments) + up * math.sin(2 * math.pi * k / segments)) * r)
                      for k in range(segments)])
    obj = loft(name, rings)
    recalc_normals(obj)
    return obj


def quad(name, corners):
    """A flat four-cornered face with UVs 0..1: corners are bottom-left, bottom-right, top-right, top-left."""
    obj = mesh_object(name, corners, [(0, 1, 2, 3)])
    layer = obj.data.uv_layers.new(name='UVMap')
    for loop, uv in zip(obj.data.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        layer.data[loop.index].uv = uv
    return obj


def disc(name, radius, location=(0, 0, 0), axis='Y', segments=32):
    """A flat disc with UVs 0..1 across it (propeller blur, gauge faces)."""
    pts, uvs = [], []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        c, s = math.cos(a), math.sin(a)
        p = {'Y': (c, 0, s), 'X': (0, s, c), 'Z': (s, c, 0)}[axis]
        pts.append((p[0] * radius + location[0], p[1] * radius + location[1], p[2] * radius + location[2]))
        uvs.append((0.5 + 0.5 * c, 0.5 + 0.5 * s))
    obj = mesh_object(name, pts, [tuple(range(segments))])
    layer = obj.data.uv_layers.new(name='UVMap')
    for loop in obj.data.loops:
        layer.data[loop.index].uv = uvs[loop.vertex_index]
    return obj


def empty(name, location=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1)):
    """An empty (anchor or collision proxy). Rotation in degrees; an anchor points along its +Y."""
    obj = bpy.data.objects.new(name, None)
    obj.location = location
    obj.rotation_euler = [math.radians(a) for a in rotation]
    obj.scale = scale
    obj.empty_display_size = 0.2
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _activate(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def _modifier(obj, kind, **settings):
    mod = obj.modifiers.new(kind.lower(), kind)
    for key, value in settings.items():
        setattr(mod, key, value)
    _activate([obj])
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def bevel(obj, width, segments=2, angle=35.0):
    """Rounds every edge sharper than the angle."""
    return _modifier(obj, 'BEVEL', width=width, segments=segments, limit_method='ANGLE', angle_limit=math.radians(angle))


def subdivide(obj, levels=1):
    """Catmull-Clark subdivision, applied."""
    return _modifier(obj, 'SUBSURF', levels=levels, render_levels=levels)


def solidify(obj, thickness, offset=-1.0):
    """Gives a sheet a thickness (offset -1 grows inwards)."""
    return _modifier(obj, 'SOLIDIFY', thickness=thickness, offset=offset)


def decimate(obj, ratio):
    """Collapses the mesh to a share of its triangles (UVs kept)."""
    _modifier(obj, 'DECIMATE', ratio=ratio, use_collapse_triangulate=True)
    obj.data.validate()
    return obj


def boolean(obj, cutter, operation='DIFFERENCE', keep_cutter=False):
    """Cuts (or unions, or intersects) obj with cutter."""
    _modifier(obj, 'BOOLEAN', object=cutter, operation=operation, solver='EXACT')
    if not keep_cutter:
        bpy.data.objects.remove(cutter, do_unlink=True)
    return obj


def mirror_x(obj, merge=True):
    """Adds the mirror image across X = 0 (welded along the centreline when merge)."""
    return _modifier(obj, 'MIRROR', use_axis=(True, False, False), use_clip=False, use_mirror_merge=merge, merge_threshold=0.002)


def transform(obj, location=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1)):
    """Moves the mesh data (rotation in degrees about X, Y, Z, applied in that order, then moved)."""
    m = Matrix.Translation(location)
    for axis, a in zip('ZYX', (rotation[2], rotation[1], rotation[0])):
        m = m @ Matrix.Rotation(math.radians(a), 4, axis)
    m = m @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
    obj.data.transform(m)
    if scale[0] * scale[1] * scale[2] < 0:
        obj.data.flip_normals()
    obj.data.update()
    return obj


def map_points(obj, function):
    """Moves every point: function(Vector) -> (x, y, z). For tapers, bends, scallops."""
    for v in obj.data.vertices:
        v.co = function(v.co.copy())
    obj.data.update()
    return obj


def set_origin(obj, point):
    """Puts the object's origin (its pivot in the game) at a point without moving the mesh."""
    point = Vector(point)
    obj.data.transform(Matrix.Translation(obj.location - point))
    obj.location = point
    return obj


def join(name, objs):
    """Joins objects into one mesh named name (materials kept per face)."""
    objs = [o for o in objs if o is not None]
    _activate(objs)
    if len(objs) > 1:
        bpy.ops.object.join()
    out = bpy.context.view_layer.objects.active
    out.name = name
    out.data.name = name
    return out


def duplicate(obj, name):
    """A copy with its own mesh data."""
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = name
    copy.data.name = name
    bpy.context.scene.collection.objects.link(copy)
    return copy


def recalc_normals(obj):
    """Makes every face normal point outwards."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def flip(obj):
    """Turns every face over."""
    obj.data.flip_normals()
    return obj


def weld(obj, distance=0.001):
    """Merges points closer than distance."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=distance)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def shade(obj, angle=40.0):
    """Smooth shading with edges sharper than the angle kept sharp."""
    mesh = obj.data
    for poly in mesh.polygons:
        poly.use_smooth = True
    bm = bmesh.new()
    bm.from_mesh(mesh)
    limit = math.radians(angle)
    for edge in bm.edges:
        if len(edge.link_faces) == 2:
            edge.smooth = edge.calc_face_angle(0.0) < limit
    bm.to_mesh(mesh)
    bm.free()
    return obj


def assign(obj, material):
    """Gives the whole object one material."""
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj


def assign_faces(obj, material, choose):
    """Gives a material to the faces choose(centre: Vector, normal: Vector) says yes to."""
    names = [m.name for m in obj.data.materials]
    if material.name not in names:
        obj.data.materials.append(material)
        names.append(material.name)
    index = names.index(material.name)
    for poly in obj.data.polygons:
        if choose(poly.center.copy(), poly.normal.copy()):
            poly.material_index = index
    return obj


def triangle_count(obj):
    """Triangles the mesh has once triangulated."""
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)
