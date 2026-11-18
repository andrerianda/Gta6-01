"""Set kit: how the prop sets (set_*.py) put many objects into one asset file.

A set is one asset, one bake and one atlas, holding twenty or so separate objects. This module
gives each object its place in the file and keeps the pipeline's naming contract unambiguous:

    <object>                     an empty at the object's ground centre: the node the game clones.
                                 Its extras carry class ("fixed", "knockable" or "scatter") and,
                                 for anything that can be knocked over, mass in kilograms.
    <object>_lod0, _lod1, _lod2  the object's levels of detail (children of the object node)
    <part>__<object>             a moving part, shown at every level (barrier_arm__toll_booth)
    anchor_<what>__<object>      an anchor of that object (anchor_light__lamp_arm)
    col_<shape>_<name>__<object> a collision proxy of that object (col_cyl_pole__lamp_arm)

Everything under an object node is positioned relative to it, so a clone of the node is the
whole object standing on its own origin. In the file the objects stand in rows about a metre
apart: that keeps the ambient occlusion of one out of the next during the bake and makes a
preview of the built set a contact sheet. The scene extras repeat the table for the game
(extras.objects[name] = class, mass, lods, lod_distances, origin in game axes).

Levels of detail are made here, after the bake, object by object. A part can be tagged to be
left out of the lower levels (bolts, straps, brackets); what remains is decimated to the share
of triangles the object asks for, with lamp, glass and cut-out faces thinned gently and faces
tagged solid (sign plates) copied as they are, so a far lamp still glows and a far sign keeps
its shape.

It also works around one library slip: build.box() names its UV layer differently from every
other builder, which left joined meshes with a second, unused set of texture coordinates in
the file. normalise_uv() gives every part the one layer the pipeline expects.
"""
import math

import bmesh
import bpy
from mathutils import Vector

from lib import modify, naming, scene, shading

SKIP = 'mz_skip'      # face attribute: the first level a face is left out of (0 = in every level)
SOLID = 'mz_solid'    # face attribute: 1 = copied to every level as it is, never decimated
UV_LAYER = 'UVMap'
CLASSES = ('fixed', 'knockable', 'scatter')
GENTLE_ROLES = (naming.ROLE_LAMP, naming.ROLE_GLASS, naming.ROLE_CUTOUT)
_KITS = {}


def normalise_uv(obj):
    """Leaves the mesh with exactly one UV layer, named as the pipeline expects."""
    layers = obj.data.uv_layers
    if not layers:
        layers.new(name=UV_LAYER)
    while len(layers) > 1:
        layers.remove(layers[-1])
    if layers[0].name != UV_LAYER:
        layers[0].name = UV_LAYER
    return obj


def tag(obj, skip=None, solid=None):
    """Marks every face of a part: skip=1 keeps it in level 0 only, skip=2 in levels 0 and 1;
    solid=True copies it to every level undecimated."""
    mesh = obj.data
    for name, value in ((SKIP, skip), (SOLID, solid)):
        if value is None:
            continue
        attribute = mesh.attributes.get(name) or mesh.attributes.new(name, 'INT', 'FACE')
        attribute.data.foreach_set('value', [int(value)] * len(mesh.polygons))
    mesh.update()
    return obj


def triangles(obj):
    """Triangles of a mesh object once triangulated."""
    return scene.triangle_count(obj)


class SetObject:
    """One object of a set: its node, its level-0 mesh and what hangs on it."""

    def __init__(self, kit, name, mesh, root, cls, mass, ratios, distances, smooth):
        self.kit = kit
        self.name = name
        self.mesh = mesh
        self.root = root
        self.cls = cls
        self.mass = mass
        self.ratios = tuple(ratios)
        self.distances = [float(distance) for distance in distances]
        self.smooth = smooth
        self.parts = []
        self.anchors = []
        self.colliders = []
        self.counts = []

    def anchor(self, what, at, forward=None, up=(0.0, 0.0, 1.0), **props):
        """anchor_<what>__<object> at a point of the object (its own coordinates)."""
        name = f'anchor_{what}__{self.name}'
        self.kit.a.add_anchor(name, at, forward=forward, up=up, parent=self.root, **props)
        self.anchors.append(name)
        return self

    def _proxy(self, empty):
        scene.parent_to(empty, self.root)
        self.colliders.append(empty.name)
        return self

    def box(self, name, centre, size, rotation_z=0.0):
        """col_box_<name>__<object>: full size (x, y, z) about a centre."""
        return self._proxy(self.kit.a.collider_box(f'{name}__{self.name}', centre, size, rotation_z))

    def cyl(self, name, centre, radius, height):
        """col_cyl_<name>__<object>: an upright cylinder about a centre."""
        return self._proxy(self.kit.a.collider_cylinder(f'{name}__{self.name}', centre, radius, height))

    def part(self, name, pieces, pivot, smooth=None):
        """A moving part <name>__<object>, shown at every level; its origin is `pivot`."""
        for piece in pieces:
            normalise_uv(piece)
        obj = scene.join(pieces, f'{name}__{self.name}')
        shading.smooth(obj, angle=math.radians(self.smooth if smooth is None else smooth))
        scene.set_origin(obj, pivot)
        scene.parent_to(obj, self.root)
        self.kit.a.add(obj)
        self.parts.append(obj)
        return self


class SetKit:
    """Collects the objects of one set, lays them out and builds their levels of detail."""

    def __init__(self, a, gap=1.0, row_gap=1.6, row_width=22.0):
        self.a = a
        self.gap = gap
        self.row_gap = row_gap
        self.row_width = row_width
        self.objects = []
        self.breaks = set()
        _KITS[a.id] = self

    @staticmethod
    def of(a):
        """The kit that make(a) created, for assemble(a)."""
        return _KITS[a.id]

    def row(self):
        """Starts a new row of the layout with the next object."""
        self.breaks.add(len(self.objects))

    def object(self, name, parts, cls='knockable', mass=None, lods=(0.3,), distances=(22.0,),
               smooth=40.0, texel_scale=1.0):
        """Joins `parts` into the level-0 mesh of a new object and registers it.

        cls: 'fixed' (never moves), 'knockable' (breaks from its base when a car hits it; give
        its mass in kilograms) or 'scatter' (light debris; mass too). lods: the share of level
        0's triangles kept at level 1, 2; distances: the camera distances at which they take
        over. smooth: the angle in degrees above which an edge stays sharp.
        """
        if cls not in CLASSES:
            raise ValueError(f'{name}: class must be one of {CLASSES}')
        if cls != 'fixed' and mass is None:
            raise ValueError(f'{name}: a {cls} object needs a mass')
        if len(lods) != len(distances):
            raise ValueError(f'{name}: one distance per level')
        for part in parts:
            normalise_uv(part)
        mesh = scene.join(parts, f'{name}_lod0')
        shading.smooth(mesh, angle=math.radians(smooth))
        root = scene.add_empty(name, (0.0, 0.0, 0.0), size=0.3)
        root['class'] = cls
        if mass is not None:
            root['mass'] = float(mass)
        root['lods'] = len(lods) + 1
        root['lod_distances'] = [float(distance) for distance in distances]
        scene.parent_to(mesh, root)
        self.a.extra_objects.append(root)
        self.a.add(mesh, texel_scale=texel_scale)
        entry = SetObject(self, name, mesh, root, cls, mass, lods, distances, smooth)
        self.objects.append(entry)
        return entry

    # -- layout -------------------------------------------------------------------------------

    def layout(self):
        """Stands the objects in rows (first row in front), centred on the origin, and stores
        the object table in the asset's extras. Call it last in make(a)."""
        rows, current, width = [], [], 0.0
        for index, entry in enumerate(self.objects):
            low, high = scene.world_bounds([entry.mesh, *entry.parts])
            entry.low, entry.high = low, high
            span = high.x - low.x
            if current and (index in self.breaks or width + span > self.row_width):
                rows.append(current)
                current, width = [], 0.0
            current.append(entry)
            width += span + self.gap
        if current:
            rows.append(current)

        y = 0.0
        placed = []
        for index, row in enumerate(rows):
            front = max(entry.high.y for entry in row)
            back = max(-entry.low.y for entry in row)
            if index:
                y -= front
            x = -(sum(entry.high.x - entry.low.x for entry in row) + self.gap * (len(row) - 1)) / 2
            for entry in row:
                placed.append((entry, Vector((x - entry.low.x, y, 0.0))))
                x += entry.high.x - entry.low.x + self.gap
            y -= back + self.row_gap
        centre_y = (max(origin.y + entry.high.y for entry, origin in placed)
                    + min(origin.y + entry.low.y for entry, origin in placed)) / 2
        table = {}
        for entry, origin in placed:
            origin.y -= centre_y
            entry.root.location = origin
            entry.origin = origin.copy()
            table[entry.name] = {
                'class': entry.cls, 'lods': len(entry.ratios) + 1,
                'lod_distances': entry.distances,
                # Game axes: x, y up, z = -Blender y.
                'origin': [round(origin.x, 4), 0.0, round(-origin.y, 4)],
            }
            if entry.mass is not None:
                table[entry.name]['mass'] = float(entry.mass)
        bpy.context.view_layer.update()
        self.a.set_extra('objects', table)
        longest = max(len(entry.distances) for entry in self.objects)
        self.a.set_lod_distances(*[max(entry.distances[level] for entry in self.objects
                                       if len(entry.distances) > level) for level in range(longest)])
        self.report()

    def report(self):
        """Prints the layout: one line per object with its place, size and triangles."""
        total = 0
        for entry in self.objects:
            size = entry.high - entry.low
            count = triangles(entry.mesh) + sum(triangles(part) for part in entry.parts)
            total += count
            print(f'set: {entry.name:26} at {entry.origin.x:7.2f} {entry.origin.y:7.2f}  '
                  f'size {size.x:5.2f} {size.y:5.2f} {size.z:5.2f}  {count:5d} tris  '
                  f'{entry.cls}' + (f' {entry.mass:g} kg' if entry.mass is not None else ''),
                  flush=True)
        print(f'set: {len(self.objects)} objects, {total} triangles at level 0', flush=True)

    # -- levels of detail ---------------------------------------------------------------------

    def levels(self):
        """Builds every object's lower levels from its baked level 0. Call it from assemble(a)."""
        totals = [0, 0, 0]
        for entry in self.objects:
            entry.counts = [triangles(entry.mesh)]
            previous = entry.counts[0]
            for level, ratio in enumerate(entry.ratios, start=1):
                copy = self._level(entry, level, ratio, previous)
                previous = triangles(copy)
                entry.counts.append(previous)
                self.a.add_baked(copy)
            extra = sum(triangles(part) for part in entry.parts)
            for level in range(3):
                totals[level] += entry.counts[min(level, len(entry.counts) - 1)] + extra
            print(f'set: {entry.name:26} levels {"/".join(str(count) for count in entry.counts)}'
                  + (f' + {extra} in moving parts' if extra else ''), flush=True)
        print(f'set: drawn triangles with every object at level 0/1/2: '
              f'{totals[0]}/{totals[1]}/{totals[2]}', flush=True)

    def _level(self, entry, level, ratio, previous):
        """One lower level of an object: parts tagged to be skipped are dropped, the rest is
        decimated towards `ratio` of level 0."""
        name = naming.lod_name(entry.name, level)
        base = scene.duplicate(entry.mesh, f'{name}_work')
        _delete_faces(base, lambda face, layers: 0 < _value(face, layers, SKIP) <= level)
        roles = [naming.material_role(slot.material.name) for slot in base.material_slots]

        def group_of(face, layers):
            if _value(face, layers, SOLID):
                return 'solid'
            return 'gentle' if roles[face.material_index] in GENTLE_ROLES else 'main'

        pieces = {}
        for group in ('main', 'gentle', 'solid'):
            piece = scene.duplicate(base, f'{name}_{group}')
            _delete_faces(piece, lambda face, layers, group=group: group_of(face, layers) != group)
            if len(piece.data.polygons):
                pieces[group] = piece
            else:
                scene.delete(piece)
        scene.delete(base)

        target = max(4, int(round(ratio * triangles(entry.mesh))))
        fixed = triangles(pieces['solid']) if 'solid' in pieces else 0
        if 'gentle' in pieces:
            gentle = pieces['gentle']
            keep = 0.6 if level == 1 else 0.34
            if triangles(gentle) > 8:
                modify.decimate(gentle, ratio=keep)
            fixed += triangles(gentle)
        if 'main' in pieces:
            main = pieces['main']
            share = (target - fixed) / max(triangles(main), 1)
            share = min(1.0, max(0.03, share))
            for _attempt in range(6):
                trial = scene.duplicate(main, f'{name}_trial')
                if share < 0.999:
                    modify.decimate(trial, ratio=share)
                if triangles(trial) + fixed < previous or share <= 0.03:
                    scene.delete(main)
                    pieces['main'] = trial
                    break
                scene.delete(trial)
                share *= 0.8
        ordered = [pieces[group] for group in ('main', 'gentle', 'solid') if group in pieces]
        if not ordered:
            raise ValueError(f'{entry.name}: nothing is left at level {level}')
        result = scene.join(ordered, name)
        result.data.validate(verbose=False)
        result.data.update()
        shading.smooth(result, angle=math.radians(max(entry.smooth, 45.0)))
        if triangles(result) >= previous:
            raise ValueError(f'{entry.name}: level {level} has {triangles(result)} triangles, '
                             f'not fewer than the level above ({previous})')
        return result


def _value(face, layers, name):
    layer = layers.get(name)
    return face[layer] if layer is not None else 0


def _delete_faces(obj, doomed):
    """Removes the faces for which doomed(face, layers) is true, with the points only they used."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    layers = bm.faces.layers.int
    faces = [face for face in bm.faces if doomed(face, layers)]
    if faces:
        bmesh.ops.delete(bm, geom=faces, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj
