"""Body shells for the trucks domain: hulls lofted from a side outline, and the cuts made in them.

A hull is the way every cab, van body, cargo box and bus body here is built. The script gives the
side silhouette of the body as a few control points in the Y-Z plane (front of the vehicle at +Y)
and a function for the half width of the side at any (y, z). The hull is the outline swept across
the width: a band (front face, bonnet, windscreen, roof, back, floor) that is crowned and bowed by
a `bulge` per control point, rounded into the flat side by a `shoulder` radius, and closed by the
side face. An inner liner, the same shape one wall thickness smaller and far coarser, makes it a
hollow body with real wall thickness, so that an opening cut with a boolean shows a reveal, a
door cut out of it is a slab with a skin, a jamb and an inner face, and the cabin is seen through
the glass.

Everything is evenly tessellated (band segments and side grid no longer than `segment`), because
the game deforms these meshes in crashes.

Also here: 2D polygon helpers (fillets, offsets), frames and prism cutters, flat or curved sheets
cut from a polygon (glass panes, panels), and the face category attribute the levels of detail
are made from.
"""
import math

import bmesh
import bpy
from mathutils import Vector

from lib import build, modify, scene, shading

CATEGORY = 'mz_cat'

# Face categories: what a face is, so the lower levels of detail know what to keep.
SHELL, LINER, DETAIL, SMALL, INTERIOR, CHASSIS, LENS, PANE, TUB, FAR = range(10)


# ---------------------------------------------------------------------------------------------
# Polygons in 2D
# ---------------------------------------------------------------------------------------------

def area(points):
    """Signed area of a closed polygon: positive when counter-clockwise."""
    total = 0.0
    for index, (a, b) in enumerate(points):
        c, d = points[(index + 1) % len(points)]
        total += a * d - c * b
    return total / 2


def fillet(points, radii, steps=4):
    """Rounds the corners of a closed polygon. `radii` is one radius, or one per corner (0 keeps
    a corner sharp). Returns (rounded points, owners): owners[i] is the corner each point belongs
    to. A radius too large for its two edges is reduced to what fits."""
    count = len(points)
    if isinstance(radii, (int, float)):
        radii = [radii] * count
    rounded, owners = [], []
    for index in range(count):
        here = Vector(points[index])
        before = Vector(points[index - 1]) - here
        after = Vector(points[(index + 1) % count]) - here
        radius = radii[index]
        if radius <= 1e-6 or before.length < 1e-9 or after.length < 1e-9:
            rounded.append(tuple(here))
            owners.append(index)
            continue
        angle = before.angle(after)
        if angle < 1e-3 or angle > math.pi - 1e-3:
            rounded.append(tuple(here))
            owners.append(index)
            continue
        reach = min(radius / math.tan(angle / 2), 0.47 * before.length, 0.47 * after.length)
        radius = reach * math.tan(angle / 2)
        start = here + before.normalized() * reach
        end = here + after.normalized() * reach
        centre = here + (before.normalized() + after.normalized()).normalized() * (
            radius / math.sin(angle / 2))
        from_angle = math.atan2(start.y - centre.y, start.x - centre.x)
        sweep = math.atan2(end.y - centre.y, end.x - centre.x) - from_angle
        while sweep > math.pi:
            sweep -= math.tau
        while sweep < -math.pi:
            sweep += math.tau
        for step in range(steps + 1):
            turn = from_angle + sweep * step / steps
            rounded.append((centre.x + radius * math.cos(turn), centre.y + radius * math.sin(turn)))
            owners.append(index)
    return rounded, owners


def rounded(points, radii, steps=4):
    """fillet() without the owners: a polygon with rounded corners."""
    return fillet(points, radii, steps)[0]


def offset(points, distance):
    """Moves every edge of a closed counter-clockwise polygon outwards by `distance` (inwards
    when negative), keeping the corners mitred."""
    count = len(points)
    if area(points) < 0:
        distance = -distance
    moved = []
    for index in range(count):
        here = Vector(points[index])
        before = (here - Vector(points[index - 1]))
        after = (Vector(points[(index + 1) % count]) - here)
        if before.length < 1e-9 or after.length < 1e-9:
            moved.append(tuple(here))
            continue
        normal_a = Vector((before.y, -before.x)).normalized()
        normal_b = Vector((after.y, -after.x)).normalized()
        mitre = normal_a + normal_b
        if mitre.length < 1e-6:
            moved.append(tuple(here + normal_a * distance))
            continue
        mitre.normalize()
        scale = distance / max(mitre.dot(normal_a), 0.35)
        moved.append(tuple(here + mitre * scale))
    return moved


def rectangle(a0, b0, a1, b1, radius=0.0, steps=3):
    """A counter-clockwise rectangle between two corners, optionally with rounded corners."""
    corners = [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]
    return rounded(corners, radius, steps) if radius > 0 else corners


def bounds(points):
    """(min a, min b, max a, max b) of a polygon."""
    return (min(p[0] for p in points), min(p[1] for p in points),
            max(p[0] for p in points), max(p[1] for p in points))


def smooth_step(value, low, high):
    """0 below `low`, 1 above `high`, a smooth ramp between."""
    if high == low:
        return 1.0 if value >= high else 0.0
    t = min(1.0, max(0.0, (value - low) / (high - low)))
    return t * t * (3.0 - 2.0 * t)


# ---------------------------------------------------------------------------------------------
# Frames, prisms and sheets
# ---------------------------------------------------------------------------------------------

class Frame:
    """A plane in space: an origin and two unit axes u and v; n = u x v is its outward normal.
    Polygons for cutters and sheets are given in its (u, v) coordinates."""

    def __init__(self, origin, u, v):
        self.o = Vector(origin)
        self.u = Vector(u).normalized()
        self.v = Vector(v).normalized()
        self.n = self.u.cross(self.v).normalized()

    def at(self, a, b, height=0.0):
        return self.o + self.u * a + self.v * b + self.n * height

    def coords(self, point):
        offset_point = Vector(point) - self.o
        return offset_point.dot(self.u), offset_point.dot(self.v)


RIGHT = Frame((0, 0, 0), (0, 1, 0), (0, 0, 1))      # polygons in (y, z), normal +X
TOP = Frame((0, 0, 0), (1, 0, 0), (0, 1, 0))        # polygons in (x, y), normal +Z
REAR = Frame((0, 0, 0), (1, 0, 0), (0, 0, 1))       # polygons in (x, z), normal -Y
FRONT = Frame((0, 0, 0), (-1, 0, 0), (0, 0, 1))     # polygons in (-x, z), normal +Y


def prism(name, polygon, frame, near, far):
    """A closed prism: `polygon` in the frame's plane, from height `near` to `far` along its
    normal. Booleans use it as a cutter."""
    low = [tuple(frame.at(a, b, near)) for a, b in polygon]
    high = [tuple(frame.at(a, b, far)) for a, b in polygon]
    obj = build.surface(name, [low, high], closed_u=True, cap_start=True, cap_end=True)
    shading.recalc_normals(obj)
    return obj


def mirrored(obj, name=None):
    """A copy of a mesh object mirrored across X = 0 (the other side of the vehicle)."""
    copy = scene.duplicate(obj, name or f'{obj.name}_m')
    scene.move(copy, scale=(-1.0, 1.0, 1.0))
    return copy


def both_sides(obj, name=None):
    """The object joined with its mirror image across X = 0."""
    return scene.join([obj, mirrored(obj)], name or obj.name)


def cut(target, cutters, operation='DIFFERENCE', index=0):
    """Applies one boolean with all the cutters (joined). New faces take material slot `index`
    of the target."""
    cutters = [cutter for cutter in cutters if cutter is not None]
    cutter = scene.join(cutters) if len(cutters) > 1 else cutters[0]
    cutter.data.materials.clear()
    for slot in target.material_slots:
        cutter.data.materials.append(slot.material)
    cutter.data.polygons.foreach_set('material_index', [index] * len(cutter.data.polygons))
    modify.boolean(target, cutter, operation=operation, solver='EXACT')
    return target


def split(target, polygon, frame, near, far, gap=0.006, name='panel', index=0, mirror=False):
    """Cuts a panel out of a shell along `polygon` and returns it as its own object; a `gap`
    wide shut line is left all round. With mirror the cut is made on the other side of the
    vehicle (the frame and polygon are given for the right side)."""
    inner = prism(f'{name}_in', offset(polygon, -gap / 2), frame, near, far)
    outer = prism(f'{name}_out', offset(polygon, gap / 2), frame, near, far)
    if mirror:
        scene.move(inner, scale=(-1.0, 1.0, 1.0))
        scene.move(outer, scale=(-1.0, 1.0, 1.0))
    piece = scene.duplicate(target, name)
    cut(piece, [inner], 'INTERSECT', index)
    cut(target, [outer], 'DIFFERENCE', index)
    return piece


def sheet(name, polygon, frame, grid=0.0, height=None):
    """A face cut from `polygon` in a frame: a glass pane, a panel, a floor. With `grid` it is
    cut into cells that size; `height(a, b)` then lifts each point along the frame's normal, so
    a pane can follow a crowned surface. UVs are the frame coordinates in metres."""
    bm = bmesh.new()
    verts = [bm.verts.new(frame.at(a, b)) for a, b in polygon]
    face = bm.faces.new(verts)
    if frame.n.dot(_face_normal(face)) < 0:
        bmesh.ops.reverse_faces(bm, faces=[face])
    if grid > 0:
        low_a, low_b, high_a, high_b = bounds(polygon)
        planes = []
        for low, high, axis in ((low_a, high_a, frame.u), (low_b, high_b, frame.v)):
            cells = max(1, math.ceil((high - low) / grid))
            for step in range(1, cells):
                at = low + (high - low) * step / cells
                planes.append((frame.o + axis * at, axis))
        for point, normal in planes:
            geometry = list(bm.faces) + list(bm.edges) + list(bm.verts)
            bmesh.ops.bisect_plane(bm, geom=geometry, dist=1e-6, plane_co=point, plane_no=normal)
    layer = bm.loops.layers.uv.new(build.UV_LAYER)
    for vert in bm.verts:
        a, b = frame.coords(vert.co)
        if height is not None:
            vert.co = frame.at(a, b, height(a, b))
    for face in bm.faces:
        for loop in face.loops:
            loop[layer].uv = frame.coords(loop.vert.co)
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    return scene.new_object(name, mesh)


def _face_normal(face):
    face.normal_update()
    return face.normal


# ---------------------------------------------------------------------------------------------
# Face categories
# ---------------------------------------------------------------------------------------------

def tag(obj, category):
    """Marks every face of a mesh with a category (SHELL, DETAIL, INTERIOR, ...)."""
    mesh = obj.data
    attribute = mesh.attributes.get(CATEGORY) or mesh.attributes.new(CATEGORY, 'INT', 'FACE')
    attribute.data.foreach_set('value', [int(category)] * len(mesh.polygons))
    return obj


def tag_where(obj, category, select):
    """Marks the faces for which select(polygon) is true."""
    mesh = obj.data
    attribute = mesh.attributes.get(CATEGORY) or mesh.attributes.new(CATEGORY, 'INT', 'FACE')
    for polygon in mesh.polygons:
        if select(polygon):
            attribute.data[polygon.index].value = int(category)
    return obj


def categories(obj):
    """The category of every face (SHELL where a mesh was never tagged)."""
    mesh = obj.data
    attribute = mesh.attributes.get(CATEGORY)
    values = [0] * len(mesh.polygons)
    if attribute is not None:
        attribute.data.foreach_get('value', values)
    return values


def set_slot_where(obj, index, select):
    """Gives the faces for which select(polygon) is true the material in slot `index`."""
    for polygon in obj.data.polygons:
        if select(polygon):
            polygon.material_index = index
    obj.data.update()
    return obj


def face_outward(obj, toward, point):
    """Makes the normals consistent and turns the whole mesh so that its first face looks
    towards `point` (toward=True) or away from it."""
    shading.recalc_normals(obj)
    polygon = obj.data.polygons[0]
    looks = (Vector(point) - polygon.center).dot(polygon.normal) > 0
    if looks != toward:
        shading.flip(obj)
    return obj


# ---------------------------------------------------------------------------------------------
# The side of a body
# ---------------------------------------------------------------------------------------------

def side_profile(half_width, belt=None, tumble=0.0, tuck_z=None, tuck=0.0, plan=(), steps=(),
                 crown=0.0, crown_z=(0.0, 1.0)):
    """Returns side(y, z): the half width of a body side.

    half_width: at its widest. belt, tumble: above height `belt` the side leans in by `tumble`
    metres per metre (the tumblehome of a cab). tuck_z, tuck: below `tuck_z` it tucks under the
    same way. plan: (y, narrowing) pairs, smoothly interpolated along the length (a nose that
    draws in). steps: (z_low, z_high, depth) character lines: below z_low the side stands
    `depth` further in, with a chamfer between the two heights. crown, crown_z: a barrel of
    `crown` metres between two heights. The heights where the side folds are kept in
    side.features, so the hull puts edges there.
    """
    plan = sorted(plan)
    features = set()
    if belt is not None and tumble:
        features.add(belt)
    if tuck_z is not None and tuck:
        features.add(tuck_z)
    for low, high, _depth in steps:
        features.update((low, high))

    def side(y, z):
        width = half_width
        if belt is not None and z > belt:
            width -= (z - belt) * tumble
        if tuck_z is not None and z < tuck_z:
            width -= (tuck_z - z) * tuck
        for low, high, depth in steps:
            width -= depth * (1.0 - smooth_step(z, low, high)) if high > low else 0.0
        if crown:
            middle = (crown_z[0] + crown_z[1]) / 2
            half = (crown_z[1] - crown_z[0]) / 2
            width += crown * max(0.0, 1.0 - ((z - middle) / half) ** 2) - crown
        if plan:
            if y <= plan[0][0]:
                width -= plan[0][1]
            elif y >= plan[-1][0]:
                width -= plan[-1][1]
            else:
                for (y0, d0), (y1, d1) in zip(plan, plan[1:]):
                    if y0 <= y <= y1:
                        width -= d0 + (d1 - d0) * smooth_step(y, y0, y1)
                        break
        return width

    side.features = sorted(features)
    return side


# ---------------------------------------------------------------------------------------------
# Hulls
# ---------------------------------------------------------------------------------------------

def P(y, z, r=0.0, sh=None, bulge=None, tag=None):
    """A control point of a hull outline: side-view position, the radius `r` that rounds the
    silhouette there, the shoulder radius `sh` between band and side, the `bulge` of the band
    at the centre line (crown of a roof, bow of a front), and a tag to find it by. sh and
    bulge default to the previous point's."""
    return {'y': y, 'z': z, 'r': r, 'sh': sh, 'bulge': bulge, 'tag': tag}


class Band:
    """The straight stretch of a hull's band between two tagged control points: where a
    windscreen, a bonnet or a tail door is. v runs along it from the first point, x across."""

    def __init__(self, hull, first, second):
        self.hull = hull
        self.a, self.b = first, second
        direction = Vector((second['y'] - first['y'], second['z'] - first['z']))
        self.length = direction.length
        direction.normalize()
        self.dy, self.dz = direction.x, direction.y
        # The outline runs counter-clockwise in (y, z): its outward normal is (dz, -dy).
        self.ny, self.nz = self.dz, -self.dy
        along = Vector((0.0, self.dy, self.dz))
        normal = Vector((0.0, self.ny, self.nz))
        across = along.cross(normal)                # u x v = n  =>  u = v x n
        self.frame = Frame((0.0, first['y'], first['z']), across, along)

    def bulge(self, v):
        t = min(1.0, max(0.0, v / self.length))
        return self.a['bulge'] + (self.b['bulge'] - self.a['bulge']) * t

    def lift(self, a, v):
        """Height of the outer skin over the band's plane at frame coordinates (a, v)."""
        y = self.a['y'] + self.dy * v
        z = self.a['z'] + self.dz * v
        width = max(self.hull.side(y, z), 0.05)
        return self.bulge(v) * max(0.0, 1.0 - (a / width) ** 2)

    def point(self, x, v, height=0.0):
        """A point `height` above the outer skin, `v` metres along the band at lateral `x`."""
        a = x * self.frame.u.x
        return self.frame.at(a, v, self.lift(a, v) + height)

    def polygon(self, half_low, half_high, low, high, radius=0.0, steps=3):
        """A symmetric window outline in frame coordinates: half widths at v = low and high."""
        corners = [(-half_low, low), (half_low, low), (half_high, high), (-half_high, high)]
        return rounded(corners, radius, steps) if radius > 0 else corners

    def pane(self, name, polygon, depth, grid=0.3, grow=0.012):
        """A sheet `depth` below the outer skin following its crown: the glass of an opening."""
        return sheet(name, offset(polygon, grow), self.frame, grid=grid,
                     height=lambda a, v: self.lift(a, v) - depth)

    def prism(self, name, polygon, depth=None, above=0.4):
        """A cutter through the wall under `polygon`."""
        depth = depth if depth is not None else self.hull.wall + 0.05
        top = max(self.a['bulge'], self.b['bulge']) + above
        return prism(name, polygon, self.frame, -depth, top)


class Hull:
    """A hollow body shell lofted from a side outline; see the module docstring."""

    def __init__(self, name, controls, side, wall=0.045, segment=0.3, shoulder_steps=3,
                 fillet_steps=4, default_shoulder=0.04, default_bulge=0.0, lateral=None):
        self.name = name
        self.side = side
        self.wall = wall
        self.segment = segment
        self.shoulder_steps = shoulder_steps
        self.fillet_steps = fillet_steps
        self.lateral = lateral
        self.controls = []
        shoulder, bulge = default_shoulder, default_bulge
        for control in controls:
            control = dict(control)
            shoulder = control['sh'] if control['sh'] is not None else shoulder
            bulge = control['bulge'] if control['bulge'] is not None else bulge
            control['sh'], control['bulge'] = shoulder, bulge
            self.controls.append(control)
        if area([(c['y'], c['z']) for c in self.controls]) < 0:
            raise ValueError(f'{name}: list the outline counter-clockwise in (y, z): up the '
                             'front, back over the top, down the rear, forward along the floor')
        self.tags = {control['tag']: control for control in self.controls if control['tag']}
        self.features = list(getattr(side, 'features', []))

    # -- queries ------------------------------------------------------------------------------

    def at(self, tag):
        """(y, z) of a tagged control point."""
        control = self.tags[tag]
        return control['y'], control['z']

    def band(self, first, second):
        return Band(self, self.tags[first], self.tags[second])

    def length_range(self):
        return (min(c['y'] for c in self.controls), max(c['y'] for c in self.controls))

    def height_range(self):
        return (min(c['z'] for c in self.controls), max(c['z'] for c in self.controls))

    # -- construction -------------------------------------------------------------------------

    def _points(self, inset, segment, fillet_steps):
        """The outline as a dense list of points with normals, shoulder and bulge."""
        polygon = [(c['y'], c['z']) for c in self.controls]
        radii = [c['r'] for c in self.controls]
        if inset > 0:
            # The liner: the same outline one wall thickness in. A convex corner's radius
            # shrinks by the wall, a concave one's grows.
            count = len(polygon)
            adjusted = []
            for index in range(count):
                here = Vector(polygon[index])
                before = here - Vector(polygon[index - 1])
                after = Vector(polygon[(index + 1) % count]) - here
                convex = before.x * after.y - before.y * after.x > 0
                adjusted.append(max(radii[index] - inset, 0.0) if convex
                                else (radii[index] + inset if radii[index] > 0 else 0.0))
            polygon, radii = offset(polygon, -inset), adjusted
        corners, owners = fillet(polygon, radii, fillet_steps)
        dense = []
        count = len(corners)
        for index in range(count):
            here, there = corners[index], corners[(index + 1) % count]
            a, b = self.controls[owners[index]], self.controls[owners[(index + 1) % count]]
            pieces = max(1, math.ceil(math.dist(here, there) / segment))
            for step in range(pieces):
                t = step / pieces
                dense.append({
                    'y': here[0] + (there[0] - here[0]) * t,
                    'z': here[1] + (there[1] - here[1]) * t,
                    'sh': max(0.0, a['sh'] + (b['sh'] - a['sh']) * t - inset),
                    'bulge': a['bulge'] + (b['bulge'] - a['bulge']) * t,
                })
        count = len(dense)
        for index, point in enumerate(dense):
            before, after = dense[index - 1], dense[(index + 1) % count]
            edge_a = Vector((point['y'] - before['y'], point['z'] - before['z']))
            edge_b = Vector((after['y'] - point['y'], after['z'] - point['z']))
            normal = Vector((0.0, 0.0))
            for edge in (edge_a, edge_b):
                if edge.length > 1e-9:
                    normal += Vector((edge.y, -edge.x)).normalized()
            if normal.length < 1e-9:
                normal = Vector((1.0, 0.0))
            normal.normalize()
            point['ny'], point['nz'] = normal.x, normal.y
        return dense

    def _half(self, name, inset, segment, shoulder_steps, fillet_steps, grid):
        """One half (x >= 0) of a skin, `inset` metres inside the outer surface."""
        points = self._points(inset, segment, fillet_steps)

        def side(y, z):
            return max(self.side(y, z) - inset, 0.03)

        placed = []
        widest = 0.0
        for point in points:
            shoulder = point['sh']
            y_in, z_in = point['y'] - point['ny'] * shoulder, point['z'] - point['nz'] * shoulder
            width = side(y_in, z_in)
            shoulder = min(shoulder, 0.9 * width)
            widest = max(widest, width)
            placed.append((point, width, shoulder))
        lateral = self.lateral or max(2, math.ceil(widest / segment))
        if inset > 0:
            lateral = 2

        def place(point, width, x, sink):
            lift = point['bulge'] * max(0.0, 1.0 - (x / width) ** 2) - sink
            return (x, point['y'] + point['ny'] * lift, point['z'] + point['nz'] * lift)

        rings = []
        for step in range(lateral + 1):
            rings.append([place(point, width, (width - shoulder) * step / lateral, 0.0)
                          for point, width, shoulder in placed])
        for step in range(1, shoulder_steps + 1):
            turn = 0.5 * math.pi * step / shoulder_steps
            rings.append([place(point, width, width - shoulder + shoulder * math.sin(turn),
                                shoulder * (1.0 - math.cos(turn)))
                          for point, width, shoulder in placed])
        obj = build.surface(name, rings, closed_u=True, cap_end=True)

        # The side face: one polygon so far. Cut it into a grid and lay it on the side surface.
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        mark = bm.faces.layers.int.new('mz_side')
        cap = max(bm.faces, key=lambda face: len(face.verts))
        cap[mark] = 1
        low_y, high_y = min(v.co.y for v in cap.verts), max(v.co.y for v in cap.verts)
        low_z, high_z = min(v.co.z for v in cap.verts), max(v.co.z for v in cap.verts)
        planes = []
        cells = max(1, math.ceil((high_y - low_y) / grid))
        for step in range(1, cells):
            planes.append((Vector((0, low_y + (high_y - low_y) * step / cells, 0)), Vector((0, 1, 0))))
        heights = set()
        cells = max(1, math.ceil((high_z - low_z) / grid))
        for step in range(1, cells):
            heights.add(low_z + (high_z - low_z) * step / cells)
        for feature in self.features:
            if low_z + 0.02 < feature < high_z - 0.02:
                # A fold line replaces the grid line nearest to it.
                near = min(heights, key=lambda height: abs(height - feature), default=None)
                if near is not None and abs(near - feature) < 0.5 * grid:
                    heights.discard(near)
                heights.add(feature)
        for height in sorted(heights):
            planes.append((Vector((0, 0, height)), Vector((0, 0, 1))))
        for point, normal in planes:
            faces = [face for face in bm.faces if face[mark]]
            geometry = set(faces)
            for face in faces:
                geometry.update(face.edges)
                geometry.update(face.verts)
            bmesh.ops.bisect_plane(bm, geom=list(geometry), dist=1e-6, plane_co=point,
                                   plane_no=normal)
        moved = set()
        for face in bm.faces:
            if face[mark]:
                moved.update(face.verts)
        for vert in moved:
            vert.co.x = side(vert.co.y, vert.co.z)
        bm.faces.layers.int.remove(mark)
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
        return obj

    def build(self, skin, liner, trim=None, grid=None):
        """Builds the hollow shell. Material slots: 0 the outer skin, 1 the liner, 2 `trim`
        (the reveals of window openings), then whatever the caller appends."""
        grid = grid or self.segment
        outer = self._half(self.name, 0.0, self.segment, self.shoulder_steps, self.fillet_steps,
                           grid)
        modify.mirror(outer, axis='X', merge=True, stack_uv=False)
        shading.cleanup(outer, merge_distance=0.0004, recalc=True)
        inner = self._half(f'{self.name}_liner', self.wall, 2.2 * self.segment, 1, 2, 3.0 * grid)
        modify.mirror(inner, axis='X', merge=True, stack_uv=False)
        shading.cleanup(inner, merge_distance=0.0004, recalc=True)
        shading.flip(inner)
        outer.data.materials.append(skin)
        inner.data.materials.append(liner)
        tag(outer, SHELL)
        tag(inner, LINER)
        shell = scene.join([outer, inner], self.name)
        if trim is not None:
            shell.data.materials.append(trim)
        return shell

    # -- cutters in the side ------------------------------------------------------------------

    def side_prisms(self, name, polygon, sides='lr', depth=None, proud=0.3):
        """Cutters through the side wall under a (y, z) polygon, on the right, the left or
        both sides."""
        low_y, low_z, high_y, high_z = bounds(polygon)
        widths = [self.side(y, z) for y in (low_y, high_y) for z in (low_z, high_z)]
        depth = depth if depth is not None else self.wall + 0.05
        near = min(widths) - depth
        far = max(widths) + proud
        cutters = []
        if 'r' in sides:
            cutters.append(prism(f'{name}_r', polygon, RIGHT, near, far))
        if 'l' in sides:
            left = prism(f'{name}_l', polygon, RIGHT, near, far)
            scene.move(left, scale=(-1.0, 1.0, 1.0))
            cutters.append(left)
        return cutters

    def side_pane(self, name, polygon, depth=None, grow=0.012, mirror=False):
        """Glass for a side opening: the polygon laid on the side surface, `depth` inside it."""
        depth = depth if depth is not None else 0.4 * self.wall
        pane = sheet(name, offset(polygon, grow), RIGHT, grid=0.0)
        for vertex in pane.data.vertices:
            vertex.co.x = self.side(vertex.co.y, vertex.co.z) - depth
        pane.data.update()
        if mirror:
            scene.move(pane, scale=(-1.0, 1.0, 1.0))
        return pane

    def side_split(self, target, name, polygon, gap=0.006, mirror=False, index=0):
        """Cuts a side panel (a door) out of the shell."""
        low_y, low_z, high_y, high_z = bounds(polygon)
        widths = [self.side(y, z) for y in (low_y, high_y) for z in (low_z, high_z)]
        return split(target, polygon, RIGHT, min(widths) - self.wall - 0.05, max(widths) + 0.3,
                     gap=gap, name=name, index=index, mirror=mirror)
