"""Shared helper of the everyday cars: lamp units with depth, and lamps that keep their colour
when they are off.

recess(obj, mats) works on a body panel straight from the shell (_body.Shell.build: right
half, at identity, before it is registered). Every connected patch of lamp faces (head lamps,
tail lamps, indicators, on the end caps and wrapping round the corners) becomes a lamp unit:
- the patch itself turns into the clear lens (glass_lens: not baked, alpha blended), kept to
  level 1;
- a copy of the patch pushed DEPTH into the body keeps the lamp materials: the bed that glows
  when the game lights the group;
- walls of plated reflector_chrome join the lens edge to the bed (the housing);
- on the bed stand the inner shapes, chosen by the size and group of each cell: projector
  pods (a plated bezel round a domed bulb lens in the lamp material) on head lamps, brake and
  small square cells, light-guide rods in the lamp material on tail lamps and long strips, and
  a light guide along the top of each head lamp.
The bed and the walls are kept to level 2 (the lowest level shows the lamp recessed, without
its lens); the inner shapes to level 0.

lamp() is the library lamp with an unlit colour of the designer's choosing: the library
halves the saturation of the base colour, which made red and blue lenses read pale pink and
lilac when the game switched them off. Here the base colour is the colour of the lens glass.

Blender axes: Z up, nose towards +Y, the modelled half is the right one (+X).
"""
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

from lib import build, scene
from lib import materials as M

import _mesh

DEPTH = 0.05                 # how deep the bed sits behind the lens
SEGMENTS = 12                # around a projector pod
FACING = 0.55                # |normal.y| of a bed face that looks along the car


def lamp(color, strength, name, value=0.62, saturation=1.0):
    """A lamp_<group> material whose unlit base colour keeps `saturation` (1 = the colour as
    given) at `value` brightness: a coloured lens when off, the colour lit when on."""
    material = M.lamp(color=color, strength=strength, name=name)
    for node in material.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            hsv = _upstream(node.inputs['Base Color'], 'HUE_SAT')
            if hsv is not None:
                hsv.inputs['Saturation'].default_value = saturation
                hsv.inputs['Value'].default_value = value
    return material


def _upstream(socket, kind, depth=4):
    """The nearest node of type `kind` feeding `socket`, or None."""
    for link in socket.links:
        node = link.from_node
        if node.type == kind:
            return node
        if depth:
            for socket_in in node.inputs:
                found = _upstream(socket_in, kind, depth - 1)
                if found is not None:
                    return found
    return None


def materials():
    """The two materials every lamp unit adds: the clear lens and the plated housing."""
    return {'lens': M.glass(tint=(0.9, 0.92, 0.93), opacity=0.14, roughness=0.02, name='glass_lens'),
            'reflector': M.chrome(smudges=0.15, seed=21, name='reflector_chrome')}


def recess(obj, mats, depth=DEPTH):
    """Turns the lamp patches of a shell panel into lamp units (see the module notes).
    mats: lens, reflector. Returns the inner shapes, to be joined into the same part."""
    mesh = obj.data
    names = [slot.material.name if slot.material else '' for slot in obj.material_slots]
    lamps = {index for index, name in enumerate(names) if name.startswith('lamp_')}
    if not lamps:
        return []
    for key in ('lens', 'reflector'):
        if mats[key].name not in names:
            mesh.materials.append(mats[key])
            names.append(mats[key].name)
    lens, reflector = names.index(mats['lens'].name), names.index(mats['reflector'].name)

    bm = bmesh.new()
    bm.from_mesh(mesh)
    level = bm.faces.layers.int.get(_mesh.LOD_ATTRIBUTE)
    normal_layer = bm.loops.layers.float_vector.get(_mesh.NORMAL_ATTRIBUTE)
    uv_layer = bm.loops.layers.uv.active
    # The cap and the side grid meet in duplicate vertices: weld them so a lamp that wraps
    # round the corner is one unit.
    bmesh.ops.remove_doubles(bm, verts=list({v for f in bm.faces if f.material_index in lamps
                                             for v in f.verts}), dist=2e-4)
    bm.normal_update()
    patch = [face for face in bm.faces if face.material_index in lamps]
    inside = set(patch)

    bed = {}
    for vert in {v for face in patch for v in face.verts}:
        faces = [face for face in vert.link_faces if face in inside]
        direction = sum((face.normal for face in faces), Vector())
        if direction.length < 1e-9:
            direction = faces[0].normal.copy()
        direction.normalize()
        lean = min(max(direction.dot(face.normal), 0.5) for face in faces)
        bed[vert] = bm.verts.new(vert.co - direction * (depth / lean))

    beds = []
    for face in patch:
        copy = bm.faces.new([bed[v] for v in face.verts])
        copy.material_index = face.material_index
        copy.smooth = True
        for old, new in zip(face.loops, copy.loops):
            if uv_layer is not None:
                new[uv_layer].uv = old[uv_layer].uv
            if normal_layer is not None:
                new[normal_layer] = old[normal_layer]
        if level is not None:
            copy[level] = 2
        beds.append(copy)
    for face in patch:
        for loop in face.loops:
            if sum(1 for other in loop.edge.link_faces if other in inside) != 1:
                continue
            a, b = loop.vert, loop.link_loop_next.vert
            wall = bm.faces.new([a, b, bed[b], bed[a]])
            wall.material_index = reflector
            wall.normal_update()
            length, sink = (b.co - a.co).length, (bed[a].co - a.co).length
            for corner, uv in zip(wall.loops, ((0.0, 0.0), (length, 0.0), (length, sink), (0.0, sink))):
                if uv_layer is not None:
                    corner[uv_layer].uv = uv
                if normal_layer is not None:
                    corner[normal_layer] = wall.normal
            if level is not None:
                wall[level] = 2
        face.material_index = lens
        if level is not None:
            face[level] = 1
    bm.normal_update()
    bm.verts.index_update()
    tree = BVHTree.FromPolygons([v.co.copy() for v in bm.verts],
                                [[v.index for v in face.verts] for face in beds])
    cells = _cells(beds)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    inner = []
    for number, (material_index, faces) in enumerate(cells):
        material = mesh.materials[material_index]
        inner += _inner_shapes(f'{obj.name}_lamp{number}', faces, material, mats['reflector'], tree)
    return _mesh.tagged(inner, 0)


def _cells(beds):
    """The bed faces in connected groups of one material, as (material index, [(normal,
    [vertex positions])]) with only the faces that look along the car."""
    inside, seen, groups = set(beds), set(), []
    for start in beds:
        if start in seen:
            continue
        seen.add(start)
        stack, group = [start], []
        while stack:
            face = stack.pop()
            group.append(face)
            for edge in face.edges:
                for other in edge.link_faces:
                    if other in inside and other not in seen and other.material_index == start.material_index:
                        seen.add(other)
                        stack.append(other)
        facing = [(face.normal.copy(), [v.co.copy() for v in face.verts]) for face in group
                  if abs(face.normal.y) > FACING]
        if facing:
            groups.append((start.material_index, facing))
    return groups


def _inner_shapes(name, faces, material, reflector, tree):
    """Pods and rods standing on one cell of the bed (see the module notes)."""
    sign = 1.0 if sum(normal.y for normal, _points in faces) > 0.0 else -1.0
    points = [p for _normal, corners in faces for p in corners]
    x0, x1 = min(p.x for p in points), max(p.x for p in points)
    z0, z1 = min(p.z for p in points), max(p.z for p in points)
    width, height = x1 - x0, z1 - z0
    if width < 0.03 or height < 0.025:
        return []

    def on_bed(x, z):
        location, normal, _index, _distance = tree.ray_cast(Vector((x, sign * 50.0, z)),
                                                            Vector((0.0, -sign, 0.0)))
        if location is None:
            return None, None
        if normal.y * sign < 0.0:
            normal = -normal
        return location, normal

    group = material.name
    shapes = []
    if group == 'lamp_tail' or (group != 'lamp_head' and width > 2.2 * height):
        count = 2 if height > 0.07 else 1
        for n in range(count):
            z = z0 + height * (n + 1) / (count + 1)
            rod = _rod(f'{name}_rod{n}', on_bed, x0 + 0.014, x1 - 0.014, z, 0.0065, material)
            if rod is not None:
                shapes.append(rod)
        return shapes
    if group == 'lamp_head':
        count = max(1, min(3, int(width / 0.085)))
        radius = min(0.036, 0.36 * height, 0.38 * width / count)
        middle = z0 + 0.42 * height
        if height > 0.1:
            rod = _rod(f'{name}_guide', on_bed, x0 + 0.012, x1 - 0.012, z1 - 0.016, 0.006, material)
            if rod is not None:
                shapes.append(rod)
    else:
        count, radius, middle = 1, min(0.032, 0.36 * height, 0.36 * width), z0 + 0.5 * height
    for n in range(count):
        location, normal = on_bed(x0 + width * (n + 0.5) / count, middle)
        if location is not None:
            shapes += _pod(f'{name}_pod{n}', location, normal, radius, material, reflector)
    return shapes


def _rod(name, on_bed, x0, x1, z, radius, material):
    """A light guide: a rod across the bed from x0 to x1 at height z, standing off it."""
    path = []
    for n in range(6):
        location, normal = on_bed(x0 + (x1 - x0) * n / 5, z)
        if location is not None:
            path.append(tuple(location + normal * (radius + 0.012)))
    if len(path) < 2:
        return None
    rod = build.tube(name, path, radius=radius, segments=6, up=(0.0, 0.0, 1.0))
    scene.set_material(rod, material)
    return rod


def _pod(name, location, normal, radius, material, reflector):
    """A projector pod on the bed: plated bezel and barrel, domed lens in the lamp material."""
    rim = radius + 0.006
    bezel = build.lathe(f'{name}_bezel', [(0.0, 0.0), (rim, 0.0), (rim, 0.012), (radius, 0.017),
                                          (0.8 * radius, 0.013)], segments=SEGMENTS)
    dome = build.lathe(f'{name}_bulb', [(0.8 * radius, 0.013), (0.55 * radius, 0.025),
                                        (0.0, 0.03)], segments=SEGMENTS)
    scene.set_material(bezel, reflector)
    scene.set_material(dome, material)
    turn = Vector((0.0, 0.0, 1.0)).rotation_difference(normal).to_matrix().to_4x4()
    place = Matrix.Translation(location + normal * 0.001) @ turn
    for piece in (bezel, dome):
        piece.data.transform(place)
        piece.data.update()
    return [bezel, dome]
