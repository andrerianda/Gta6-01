"""Vehicle kit: what the motorcycles, the boats and the helicopters share.

Three things live here.

Shaping helpers on top of lib.build: spline-skinned lofts and patches (a control grid of points,
smoothed with Catmull-Rom splines in both directions, so a tank, a fairing, a hull or a fuselage
is described by a handful of sections), rods and pipes, lathes about any axis, and shells with
real thickness.

Detail tags. A part marked with only0() shows at level of detail 0 only (bolts, cables, levers),
one marked with until1() is dropped from level 2. The tag is a face attribute, so it survives
joining, unwrapping and the bake.

Vehicle, the assembly of a machine with moving parts. The game contract wants named nodes that
turn about their own origin (wheels, a fork, a swingarm, engines, rotors, doors). Each is an
empty (a pivot, which may be tilted: a fork turns about its raked steering axis) holding a mesh
named <node>_mesh_lod0. Everything is modelled and baked in place, in world coordinates, so the
procedural materials see real heights and neighbours; after the bake Vehicle.finish() hangs the
meshes on their pivots and makes the far levels: lod1 and lod2 are single meshes with the moving
parts merged in, tagged detail removed and the rest decimated to a triangle target. Each merged
part leaves an empty placeholder named <node>_mesh_lod1/2 on its pivot, so the loader's
automatic level switching hides the separate part exactly where the merged level takes over.
Parts that must keep moving at any distance (rotors) get decimated levels of their own instead.

The boats and helicopters import this file through a small shim in their own directory.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from lib import build, lod, modify, naming, profiles, scene, shading

DETAIL = 'mz_detail'     # face attribute: 0 every level, 1 level 0 only, 2 levels 0 and 1


# ---------------------------------------------------------------------------------------------
# Detail tags and shading
# ---------------------------------------------------------------------------------------------

def _tag(objects, level):
    for obj in objects:
        mesh = obj.data
        attribute = mesh.attributes.get(DETAIL) or mesh.attributes.new(DETAIL, 'INT', 'FACE')
        attribute.data.foreach_set('value', [level] * len(mesh.polygons))
    return list(objects)


def only0(*objects):
    """Marks parts as fine detail: shown at level 0 only. Returns them as a list."""
    return _tag(objects, 1)


def until1(*objects):
    """Marks parts as medium detail: shown at levels 0 and 1. Returns them as a list."""
    return _tag(objects, 2)


def soft(obj, angle=35.0):
    """Smooth shading with edges sharper than `angle` degrees kept sharp. Returns the object."""
    return shading.smooth(obj, math.radians(angle))


def paint(obj, material):
    """Gives the whole mesh one material and returns it (for chaining)."""
    return scene.set_material(obj, material)


# ---------------------------------------------------------------------------------------------
# Shaping
# ---------------------------------------------------------------------------------------------

def spline_rings(sections, around=0, along=0, closed=True):
    """Refines a control grid with Catmull-Rom splines. `sections` is a list of rings of 3D
    points (the same count in each). Each ring gets `around` points per span (0 keeps it as it
    is: use that for outlines with deliberate corners), then every column of points through
    the rings gets `along` points per span."""
    rings = [[tuple(point) for point in ring] for ring in sections]
    if around > 1:
        rings = [profiles.smooth_path(ring, subdivisions=around, closed=closed) for ring in rings]
    if along > 1 and len(rings) > 2:
        columns = [profiles.smooth_path([ring[index] for ring in rings], subdivisions=along)
                   for index in range(len(rings[0]))]
        rings = [[column[index] for column in columns] for index in range(len(columns[0]))]
    return rings


def ring_y(y, half_width, z_bottom, z_top, exponent=2.5, count=12, waist=0.5, x=0.0):
    """A closed section in the plane Y = y: a superellipse `half_width` wide between z_bottom
    and z_top (exponent 2 is an ellipse, larger is boxier). `waist` is the share of the height
    at which it is widest; `x` moves it sideways. Use it for the sections of skin()."""
    middle = z_bottom + waist * (z_top - z_bottom)
    points = []
    for index in range(count):
        angle = math.tau * index / count
        c, s = math.cos(angle), math.sin(angle)
        reach = (z_top - middle) if s >= 0.0 else (middle - z_bottom)
        points.append((x + half_width * math.copysign(abs(c) ** (2.0 / exponent), c), y,
                       middle + reach * math.copysign(abs(s) ** (2.0 / exponent), s)))
    return points


def signed_volume(obj):
    """The signed volume enclosed by the mesh (positive when its normals point outwards)."""
    mesh = obj.data
    total = 0.0
    for polygon in mesh.polygons:
        corners = [mesh.vertices[index].co for index in polygon.vertices]
        for index in range(1, len(corners) - 1):
            total += corners[0].dot(corners[index].cross(corners[index + 1]))
    return total / 6.0


def skin(name, sections, around=0, along=0, cap_start=False, cap_end=False):
    """A closed-section loft through `sections` (see spline_rings), with normals made to point
    out of the volume whichever way the sections were listed."""
    rings = spline_rings(sections, around, along, closed=True)
    obj = build.loft(name, rings, closed=True, cap_start=cap_start, cap_end=cap_end)
    centre = sum((Vector(point) for ring in rings for point in ring), Vector()) / (
        len(rings) * len(rings[0]))
    obj.data.transform(Matrix.Translation(-centre))
    inside_out = signed_volume(obj) < 0.0
    obj.data.transform(Matrix.Translation(centre))
    if inside_out:
        obj.data.flip_normals()
    obj.data.update()
    return obj


def patch(name, rows, around=0, along=0, toward=None, thickness=0.0):
    """An open sheet through a control grid `rows` (see spline_rings). `toward` is a direction
    the finished sheet must face on average (it is flipped if it does not); `thickness` gives
    it a real inner side and rim, growing away from the visible face."""
    rings = spline_rings(rows, around, along, closed=False)
    obj = build.surface(name, rings)
    if toward is not None:
        mesh = obj.data
        mean = sum((polygon.normal * polygon.area for polygon in mesh.polygons), Vector())
        if mean.dot(Vector(toward)) < 0.0:
            mesh.flip_normals()
            mesh.update()
    if thickness > 0.0:
        modify.solidify(obj, thickness=thickness, offset=-1.0)
    return obj


def rod(name, start, end, radius, segments=8, radius_end=None, caps=True, rings=1):
    """A straight round bar between two points; `rings` spans along it (long bars need a few
    so the UV packer can cut them)."""
    start, end = Vector(start), Vector(end)
    path = [tuple(start.lerp(end, step / rings)) for step in range(rings + 1)]
    radii = None
    if radius_end is not None:
        radii = [profiles.lerp(radius, radius_end, step / rings) for step in range(rings + 1)]
    return build.tube(name, path, radius=radius, segments=segments, radii=radii, caps=caps,
                      up=(1.0, 0.0, 0.0))


def pipe(name, points, radius, segments=8, smooth=3, radius_end=None, caps=True):
    """A round tube through control points, bent smoothly (Catmull-Rom, `smooth` points per
    span; 0 keeps the corners). radius_end tapers it."""
    path = profiles.smooth_path(points, subdivisions=smooth) if smooth and len(points) > 2 \
        else [tuple(point) for point in points]
    radii = None
    if radius_end is not None:
        last = len(path) - 1
        radii = [profiles.lerp(radius, radius_end, index / last) for index in range(len(path))]
    return build.tube(name, path, radius=radius, segments=segments, radii=radii, caps=caps,
                      up=(1.0, 0.0, 0.0))


def aim(obj, origin, axis):
    """Moves a mesh built about the Z axis at the origin so that its axis lies along `axis`
    and its origin sits at `origin`."""
    turn = Vector((0.0, 0.0, 1.0)).rotation_difference(Vector(axis).normalized())
    obj.data.transform(Matrix.Translation(Vector(origin)) @ turn.to_matrix().to_4x4())
    obj.data.update()
    return obj


def turned(name, profile, origin=(0.0, 0.0, 0.0), axis=(0.0, 0.0, 1.0), segments=16, **options):
    """A lathe of `profile` ((radius, height) pairs) about any axis through `origin`. A profile
    that returns to its first point, listed counter-clockwise with radius to the right and
    height up, makes a closed ring with outward normals."""
    return aim(build.lathe(name, profile, segments=segments, **options), origin, axis)


def disc(name, radius, thickness, origin, axis, segments=16, inner=0.0):
    """A solid disc or washer about `axis`, centred on `origin`."""
    half = thickness / 2
    if inner > 0.0:
        profile = [(inner, -half), (radius, -half), (radius, half), (inner, half), (inner, -half)]
        return turned(name, profile, origin, axis, segments)
    obj = build.cylinder(name, radius=radius, depth=thickness, segments=segments)
    return aim(obj, origin, axis)


def slab(name, size, location, rotation=(0.0, 0.0, 0.0), bevel=0.0):
    """A box of full `size` centred on `location`, turned by XYZ Euler angles in degrees,
    with optionally bevelled edges."""
    obj = build.box(name, size)
    if bevel > 0.0:
        modify.bevel(obj, width=bevel, segments=1)
    modify.transform(obj, location=location, rotation=tuple(math.radians(v) for v in rotation))
    return obj


def mirrored(obj, merge=False):
    """Adds the mirror image across X = 0 (each side keeps its own texels)."""
    return modify.mirror(obj, axis='X', merge=merge, stack_uv=False)


def bolts(name, points, axis, radius=0.006, height=0.006):
    """Hexagon bolt heads at `points`, standing along `axis`; tagged as level-0 detail."""
    heads = []
    for index, point in enumerate(points):
        head = build.cylinder(f'{name}{index}', radius=radius, depth=height, segments=6)
        heads.append(aim(head, point, axis))
    return only0(scene.join(heads, name))[0]


def circle_points(centre, radius, count, axis='X', start=0.0):
    """`count` points on a circle about a principal axis through `centre`."""
    cx, cy, cz = centre
    points = []
    for index in range(count):
        angle = start + math.tau * index / count
        c, s = radius * math.cos(angle), radius * math.sin(angle)
        points.append({'X': (cx, cy + c, cz + s), 'Y': (cx + c, cy, cz + s),
                       'Z': (cx + c, cy + s, cz)}[axis])
    return points


def triangles(obj):
    """Triangles of a mesh object once triangulated."""
    return scene.triangle_count(obj)


# ---------------------------------------------------------------------------------------------
# The vehicle: pivots, mounted parts and levels of detail
# ---------------------------------------------------------------------------------------------

class _Mount:
    def __init__(self, obj, node, mode, suffix):
        self.obj = obj
        self.node = node
        self.mode = mode          # 'merge', 'separate' or 'always'
        self.suffix = suffix


class Vehicle:
    """Collects the body and the moving parts of a machine in make(a) and finishes them in
    assemble(a). The asset script keeps it as a.vehicle."""

    def __init__(self, a):
        self.a = a
        self.mounts = []
        self.bodies = []
        self.occluders = []
        self.twins = []
        a.vehicle = self

    # -- in make(a) ---------------------------------------------------------------------------

    def pivot(self, name, location, rotation=(0.0, 0.0, 0.0), parent=None):
        """A named node the game turns: an empty at `location`, tilted by XYZ Euler angles in
        radians, optionally the child of another pivot."""
        naming.check_node_name(name)
        empty = scene.add_empty(name, location)
        empty.rotation_euler = rotation
        bpy.context.view_layer.update()
        if parent is not None:
            scene.parent_to(empty, parent)
        self.a.extra_objects.append(empty)
        return empty

    @staticmethod
    def _joined(parts, name, angle):
        for part in parts:
            if not any(polygon.use_smooth for polygon in part.data.polygons):
                soft(part, angle)
        return scene.join(parts, name)

    def body(self, parts, name='lod0', angle=35.0, **options):
        """Joins the static parts into the body mesh (level 0) and registers it."""
        obj = self._joined(parts, name, angle)
        self.a.add(obj, **options)
        self.bodies.append(obj)
        return obj

    def mount(self, node, parts, mode='merge', suffix='mesh', angle=35.0, **options):
        """Joins the parts of one moving node into its mesh and registers it.

        mode 'merge': the mesh is <node>_<suffix>_lod0 and is merged into the body at the far
        levels; 'separate': it gets decimated levels of its own; 'always': it is
        <node>_<suffix>, without levels (a rotor's blur disc)."""
        name = f'{node.name}_{suffix}' if mode == 'always' else f'{node.name}_{suffix}_lod0'
        obj = self._joined(parts, name, angle)
        self.a.add(obj, **options)
        self.mounts.append(_Mount(obj, node, mode, suffix))
        return obj

    def occluder(self, obj):
        """Keeps an unregistered object in the scene during the bake (it shades and soils its
        neighbours, and shows in source previews); finish() removes it."""
        self.occluders.append(obj)
        return obj

    def twin(self, source, node, offset):
        """Declares that `node` shows the same mesh as the mounted part `source` (the object
        mount() returned), `offset` metres away: one mesh in the file, baked once, two nodes
        (the second outboard, its propeller). A stand-in takes its place during the bake."""
        stand_in = scene.duplicate(source, f'{node.name}_stand_in')
        modify.transform(stand_in, location=offset)
        self.occluder(stand_in)
        self.twins.append((source, node, Vector(offset)))

    # -- in assemble(a), after the bake ---------------------------------------------------------

    def baked(self, name):
        """The baked mesh object registered under `name`."""
        for part in self.a.parts:
            if part.obj.name == name:
                return part.obj
        raise KeyError(f'no baked part named {name!r}')

    def fuse(self, target, *others):
        """Joins baked parts (objects or names) into `target` and forgets the others."""
        objects = [self.baked(item) if isinstance(item, str) else item for item in (target, *others)]
        gone = objects[1:]
        self.a.parts = [part for part in self.a.parts if part.obj not in gone]
        self.bodies = [obj for obj in self.bodies if obj not in gone]
        self.mounts = [mount for mount in self.mounts if mount.obj not in gone]
        return scene.join(objects, objects[0].name)

    @staticmethod
    def _stripped(obj, name, level):
        """A copy of a baked mesh without the detail that level `level` drops."""
        copy = scene.duplicate(obj, name)
        copy.parent = None
        copy.matrix_world = obj.matrix_world.copy()
        mesh = copy.data
        if mesh.attributes.get(DETAIL) is not None:
            bm = bmesh.new()
            bm.from_mesh(mesh)
            layer = bm.faces.layers.int.get(DETAIL)
            doomed = [face for face in bm.faces if 0 < face[layer] <= level]
            if doomed and len(doomed) < len(bm.faces):
                bmesh.ops.delete(bm, geom=doomed, context='FACES')
            bm.to_mesh(mesh)
            bm.free()
            mesh.update()
        return copy

    @staticmethod
    def _reduce(obj, target):
        """Decimates a mesh to about `target` triangles (never below a dozen)."""
        target = max(12, int(target))
        for _attempt in range(3):
            count = triangles(obj)
            if count <= target * 1.03:
                break
            modify.decimate(obj, ratio=max(0.01, target / count))
            obj.data.validate(verbose=False)
            obj.data.update()
        return obj

    def finish(self, targets, distances, separate_ratios=(0.4, 0.15)):
        """Hangs the moving parts on their pivots and builds the far levels.

        targets: triangles of the whole vehicle at level 1, 2, ...; distances: the camera
        distances in metres at which those levels take over; separate_ratios: the share of
        their triangles that 'separate' parts keep at each far level."""
        a = self.a
        scene.delete(*self.occluders)
        self.occluders = []
        bpy.context.view_layer.update()
        mode_of = {mount.obj: mount for mount in self.mounts}
        always = sum(triangles(mount.obj) for mount in self.mounts if mount.mode == 'always')
        # What goes into the merged far levels: (baked mesh, where it is shown).
        merged_sources = [(obj, None) for obj in self.bodies]
        merged_sources += [(mount.obj, None) for mount in self.mounts if mount.mode == 'merge']
        merged_sources += [(source, offset) for source, _node, offset in self.twins
                           if mode_of[source].mode == 'merge']
        hung = []                      # (mesh, pivot) pairs to parent once every level exists
        holders = []                   # (name, pivot) of the empty placeholders
        latest = {mount: mount.obj for mount in self.mounts}
        for level, target in enumerate(targets, start=1):
            own = 0
            for mount in self.mounts:
                if mount.mode != 'separate':
                    continue
                name = naming.lod_name(f'{mount.node.name}_{mount.suffix}', level)
                copy = self._stripped(mount.obj, name, level)
                ratio = separate_ratios[min(level, len(separate_ratios)) - 1]
                self._reduce(copy, min(triangles(mount.obj) * ratio, triangles(latest[mount]) - 2))
                latest[mount] = copy
                own += triangles(copy)
                a.add_baked(copy)
                hung.append((copy, mount.node))
            pieces = []
            for index, (obj, offset) in enumerate(merged_sources):
                piece = self._stripped(obj, f'merge{level}_{index}', level)
                if offset is not None:
                    modify.transform(piece, location=offset)
                pieces.append(piece)
            merged = scene.join(pieces, naming.lod_name('', level))
            self._reduce(merged, target - own - always)
            a.add_baked(merged)
            for mount in self.mounts:
                if mount.mode == 'merge':
                    holders.append((naming.lod_name(f'{mount.node.name}_{mount.suffix}', level),
                                    mount.node))
            for source, node, _offset in self.twins:
                if mode_of[source].mode == 'merge':
                    holders.append((naming.lod_name(f'{node.name}_{mode_of[source].suffix}', level),
                                    node))
            print(f'  level {level}: {triangles(merged) + own + always:,} triangles '
                  f'(target {target:,})', flush=True)
        for mount in self.mounts:
            hung.append((mount.obj, mount.node))
        for obj, node in hung:
            scene.set_origin(obj, node.matrix_world.translation)
            scene.parent_to(obj, node)
        for source, node, _offset in self.twins:
            mount = mode_of[source]
            name = f'{node.name}_{mount.suffix}' if mount.mode == 'always' \
                else f'{node.name}_{mount.suffix}_lod0'
            copy = scene.duplicate(source, name, linked=True)
            copy.parent = None
            copy.matrix_world = Matrix.Translation(node.matrix_world.translation)
            scene.parent_to(copy, node)
            a.add_baked(copy)
        for name, node in holders:
            holder = scene.add_empty(name, node.matrix_world.translation, size=0.02)
            scene.parent_to(holder, node)
            a.extra_objects.append(holder)
        for obj in bpy.data.objects:
            if obj.type == 'MESH' and obj.data.attributes.get(DETAIL) is not None:
                obj.data.attributes.remove(obj.data.attributes[DETAIL])
        a.set_lod_distances(*distances)
