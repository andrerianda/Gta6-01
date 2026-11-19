"""KitAsset and shared helpers of the military base kit (art/build_military.py).

KitAsset wraps the aircraft pipeline's asset class (art/blender/lib/assetfile.py) for static
structures: a script registers static PARTS with the levels of detail they appear in (all parts of a
level are joined into one mesh lod0 / lod1 / lod2 after the bake, so a level costs one draw call per
material) and MOVING nodes (barrier arm, antenna, gate leaf) that keep their own name and pivot.
`cutout*` materials are left out of the bake and written alpha-tested and double sided.

Blender axes while modelling: Z up, the asset's front (the game's -Z) towards +Y, on Z = 0.
"""
import json
import math
import os
import random
import struct

import bpy
from mathutils import Vector

from lib import assetfile, atlasbake
from lib import meshkit as mk
from lib import surfaces as sf


def image_format():
    """The embedded texture format of the shared pipeline's exports (assetfile.IMAGE_FORMAT, WebP)."""
    return getattr(assetfile, 'IMAGE_FORMAT', 'WEBP')


def role(name):
    """The material role by name, with the cutout role the aircraft library does not know."""
    if name == 'cutout' or name.startswith('cutout_'):
        return 'cutout'
    return sf.role_of(name)


class KitAsset(assetfile.AircraftAsset):
    """The builder a military script's make(a) talks to."""

    def __init__(self, asset_id, atlas=1024, kind='building'):
        super().__init__(asset_id, atlas)
        self.kind = kind
        self.parts = []
        self.lod_distances = (120.0, 400.0)

    def part(self, obj, levels=(0, 1, 2), ratios=(1.0, 1.0)):
        """A static mesh shown at the given levels; ratios are its triangle shares at levels 1 and 2."""
        self.parts.append((obj, tuple(levels), tuple(ratios)))
        return obj

    def parts_of(self, objs, levels=(0, 1, 2), ratios=(1.0, 1.0)):
        for obj in objs:
            self.part(obj, levels, ratios)

    def moving(self, obj, pivot):
        """A node of its own, shown at every level, with its origin on the pivot."""
        mk.set_origin(obj, pivot)
        self.meshes.append(obj)
        return obj

    def finish(self, out_path, work_dir, bake=True):
        static = [p[0] for p in self.parts]
        everything = static + list(self.meshes)
        baked = [o for o in everything if any(role(m.name) in ('atlas', 'paint') for m in o.data.materials)]
        if bake and baked:
            atlasbake.unwrap(baked)
            paths = atlasbake.bake(baked, self.atlas, work_dir)
            atlasbake.swap_materials(baked, paths)
        levels = 1 + max((max(p[1]) for p in self.parts), default=0)
        made = []
        for level in range(levels):
            copies = []
            for obj, shown, ratios in self.parts:
                if level not in shown:
                    continue
                copy = mk.duplicate(obj, '%s_copy%d' % (obj.name, level))
                if level > 0 and ratios[level - 1] < 0.999:
                    mk.decimate(copy, ratios[level - 1])
                copies.append(copy)
            if copies:
                joined = mk.join('lod%d' % level, copies)
                atlasbake._merge_slots(joined)
                made.append(joined)
        for obj in static:
            bpy.data.objects.remove(obj, do_unlink=True)
        for obj in made:
            obj.name = obj.name.split('.')[0]
        self.meshes = made + list(self.meshes)
        report = self._measure(levels)
        scene = bpy.context.scene
        for key, value in {'asset': self.id, 'kind': self.kind, 'lods': levels, 'lod_distances': list(self.lod_distances)[:levels - 1],
                           'bounds': report['bounds'], **self.extras}.items():
            scene[key] = value
        bpy.ops.object.select_all(action='DESELECT')
        for obj in self.meshes + self.empties:
            obj.select_set(True)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=True, export_image_format=image_format(),
                                  export_image_quality=84, export_extras=True, export_yup=True, export_apply=True,
                                  export_animations=False, export_tangents=False, export_cameras=False, export_lights=False)
        assetfile.patch_roles(out_path)
        patch_cutout(out_path)
        report['kind'] = self.kind
        report['bytes'] = os.path.getsize(out_path)
        return report


def patch_cutout(path):
    """Marks cutout materials alpha-tested and double sided in the .glb."""
    with open(path, 'rb') as handle:
        data = handle.read()
    length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + length].decode('utf-8'))
    rest = data[20 + length:]
    changed = False
    for material in document.get('materials', []):
        if role(material.get('name', '')) == 'cutout':
            material['alphaMode'] = 'MASK'
            material['alphaCutoff'] = 0.5
            material['doubleSided'] = True
            changed = True
    if not changed:
        return
    text = json.dumps(document, separators=(',', ':')).encode('utf-8')
    text += b' ' * ((4 - len(text) % 4) % 4)
    out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(text) + len(rest)) + struct.pack('<I4s', len(text), b'JSON') + text + rest
    with open(path, 'wb') as handle:
        handle.write(out)


# --- materials -------------------------------------------------------------------------------------

def weathered(name, color, roughness=0.85, metallic=0.0, wear=0.5, blotches=None, blotch_scale=0.09, seams=None,
              seam_width=0.05, projection='side', soot=None, soot_range=(0.42, 0.62), stagger=True):
    """A weathered outdoor surface: optional camouflage blotches (hex colours laid over the base in
    turn), rain streaks, broad grime, form or panel seams (length, height in metres) and soot."""
    mat, tree, shader = sf._principled(name)
    colour = sf.hex_color(color)
    for index, patch in enumerate(blotches or ()):
        field = sf._noise(tree, blotch_scale * (1.0 + 0.37 * index), 1.6, 0.45, (1.0, 1.0 + 0.3 * index, 1.0))
        low = 0.5 + 0.035 * index
        colour = sf._mix(tree, sf._ramp(tree, field, low, low + 0.025), colour, sf.hex_color(patch))
    grime = (0.32, 0.29, 0.25, 1.0)
    broad = sf._ramp(tree, sf._noise(tree, 0.35, 4.0), 0.35, 0.75)
    colour = sf._mix(tree, _scaled(tree, broad, 0.55 * wear), colour, grime, 'MULTIPLY')
    streaks = sf._ramp(tree, sf._noise(tree, 2.6, 3.0, 0.6, (1.0, 1.0, 0.05)), 0.5, 0.8)
    colour = sf._mix(tree, _scaled(tree, streaks, 0.6 * wear), colour, grime, 'MULTIPLY')
    if soot:
        colour = sf._mix(tree, sf._ramp(tree, sf._noise(tree, 0.22, 3.0), soot_range[0], soot_range[1]), colour, sf.hex_color(soot))
    height = sf._noise(tree, 14.0, 2.0)
    bump = tree.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.1 + 0.15 * wear
    bump.inputs['Distance'].default_value = 0.01
    tree.links.new(height, bump.inputs['Height'])
    normal = bump.outputs['Normal']
    if seams:
        lines = sf._panel_lines(tree, seams, projection, seam_width)
        if not stagger:
            lines.node.offset = 0.0
        colour = sf._mix(tree, _scaled(tree, lines, 0.5), colour, grime, 'MULTIPLY')
        groove = tree.nodes.new('ShaderNodeBump')
        groove.invert = True
        groove.inputs['Strength'].default_value = 0.5
        groove.inputs['Distance'].default_value = 0.01
        tree.links.new(lines, groove.inputs['Height'])
        tree.links.new(normal, groove.inputs['Normal'])
        normal = groove.outputs['Normal']
    rough = tree.nodes.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value = max(0.05, roughness - 0.12)
    rough.inputs['To Max'].default_value = min(1.0, roughness + 0.1)
    tree.links.new(sf._noise(tree, 1.8, 4.0), rough.inputs['Value'])
    tree.links.new(colour, shader.inputs['Base Color'])
    tree.links.new(rough.outputs['Result'], shader.inputs['Roughness'])
    shader.inputs['Metallic'].default_value = metallic
    tree.links.new(normal, shader.inputs['Normal'])
    return mat


def _scaled(tree, value, factor):
    node = tree.nodes.new('ShaderNodeMath')
    node.operation = 'MULTIPLY'
    node.inputs[1].default_value = factor
    tree.links.new(value, node.inputs[0])
    return node.outputs[0]


def striped(name, first, second, period=1.0, axis='X', roughness=0.5, wear=0.4):
    """Warning stripes across an axis (object coordinates, metres), a little dirty."""
    mat, tree, shader = sf._principled(name)
    coords = tree.nodes.new('ShaderNodeTexCoord')
    split = tree.nodes.new('ShaderNodeSeparateXYZ')
    tree.links.new(coords.outputs['Object'], split.inputs[0])
    value = _scaled(tree, split.outputs[axis], 1.0 / period)
    fract = tree.nodes.new('ShaderNodeMath')
    fract.operation = 'FRACT'
    tree.links.new(value, fract.inputs[0])
    step = tree.nodes.new('ShaderNodeMath')
    step.operation = 'GREATER_THAN'
    step.inputs[1].default_value = 0.5
    tree.links.new(fract.outputs[0], step.inputs[0])
    colour = sf._mix(tree, step.outputs[0], sf.hex_color(first), sf.hex_color(second))
    dirt = sf._ramp(tree, sf._noise(tree, 3.0, 3.0), 0.4, 0.8)
    colour = sf._mix(tree, _scaled(tree, dirt, wear), colour, (0.3, 0.27, 0.23, 1.0), 'MULTIPLY')
    tree.links.new(colour, shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = roughness
    return mat


def concrete(name='concrete', color='#8f8a7f', seams=(2.4, 1.2), projection='side', wear=0.5):
    return weathered(name, color, 0.88, 0.0, wear, seams=seams, projection=projection)


def camouflage(name='camo', seams=(4.0, 2.0), projection='side', scale=0.09):
    """Disruptive earth-toned paint on concrete: sand base, olive and dark green blotches, weathered."""
    return weathered(name, '#a59873', 0.85, 0.0, 0.55, blotches=('#5d6238', '#2f3a26'), blotch_scale=scale, seams=seams,
                     projection=projection)


def painted_steel(name='steel', color='#4c5449', roughness=0.55, wear=0.5):
    return weathered(name, color, roughness, 0.35, wear)


def galvanised(name='galvanised', color='#8b9094'):
    return weathered(name, color, 0.5, 0.85, 0.35)


# --- geometry --------------------------------------------------------------------------------------

def arch_profile(half_width, height, power=2.0, count=24):
    """Points (x, z) of an arch from the +X foot over the crown to the -X foot (a superellipse half)."""
    points = []
    for i in range(count + 1):
        a = math.pi * i / count
        c, s = math.cos(a), math.sin(a)
        points.append((math.copysign(abs(c) ** (2.0 / power), c) * half_width, abs(s) ** (2.0 / power) * height))
    return points


def orient(obj, point, away=True):
    """Turns the faces so that they look away from (or towards) a point."""
    point = Vector(point)
    total = sum(p.normal.dot(p.center - point) * p.area for p in obj.data.polygons)
    if (total < 0) == away:
        obj.data.flip_normals()
        obj.data.update()
    return obj


def strip(name, first, second, material=None, look_from=None, away=True, smooth=False):
    """A band of quads between two point rows of the same length."""
    count = len(first)
    faces = [(i, i + 1, count + i + 1, count + i) for i in range(count - 1)]
    obj = mk.mesh_object(name, list(first) + list(second), faces)
    if look_from is not None:
        orient(obj, look_from, away)
    if material is not None:
        mk.assign(obj, material)
    if smooth:
        mk.shade(obj, 40)
    return obj


def polygon(name, points, material=None, look_from=None, away=True):
    """One flat many-cornered face."""
    obj = mk.mesh_object(name, points, [tuple(range(len(points)))])
    if look_from is not None:
        orient(obj, look_from, away)
    if material is not None:
        mk.assign(obj, material)
    return obj


def arch_solid(name, outer, inner, y0, y1, material=None):
    """A solid arch between two profiles ((x, z) rows of the same length) from y0 to y1."""
    rings = [[(o[0], y0, o[1]), (o[0], y1, o[1]), (i[0], y1, i[1]), (i[0], y0, i[1])] for o, i in zip(outer, inner)]
    obj = mk.loft(name, rings)
    if material is not None:
        mk.assign(obj, material)
    return obj


def block(name, size, location, material, rotation=(0, 0, 0), bevel=0.0):
    """A box of full size centred on location, turned about its own centre (degrees)."""
    obj = mk.box(name, size, (0, 0, 0), bevel, 1)
    mk.transform(obj, location, rotation)
    return mk.assign(obj, material)


def drum(name, radius, z0, z1, material, location=(0, 0), sides=12, radius_top=None, smooth=True):
    """An upright cylinder or frustum from z0 to z1."""
    obj = mk.cylinder(name, radius, z1 - z0, (location[0], location[1], 0.5 * (z0 + z1)), 'Z', sides, radius_top)
    mk.assign(obj, material)
    return mk.shade(obj, 50) if smooth else obj


def rod(name, path, radius, material, sides=4):
    """A thin bar along a path of points."""
    return mk.assign(mk.tube(name, path, radius, sides), material)


def railing(name, loop, height, material, radius=0.035, closed=True, post_every=1):
    """A handrail along a loop of points (x, y, z at deck level): top and middle rails and posts."""
    path = list(loop) + ([loop[0]] if closed else [])
    parts = []
    for share in (1.0, 0.5):
        parts.append(rod(name + '_rail', [(p[0], p[1], p[2] + height * share) for p in path], radius, material))
    for index, p in enumerate(loop):
        if index % post_every == 0:
            parts.append(rod(name + '_post', [p, (p[0], p[1], p[2] + height)], radius, material))
    return mk.join(name, parts)


def window(name, centre, width, height, facing, glass, frame, depth=0.06):
    """A framed window lying on a wall: facing is '+x', '-x', '+y' or '-y' (the wall's outward side)."""
    axis, sign = (0 if facing[1] == 'x' else 1), (1 if facing[0] == '+' else -1)

    def size(w, d, h):
        return (d, w, h) if axis == 0 else (w, d, h)

    def moved(distance):
        p = list(centre)
        p[axis] += sign * distance
        return p

    surround = mk.assign(mk.box(name + '_frame', size(width + 0.14, depth, height + 0.14), moved(depth * 0.5)), frame)
    pane = mk.assign(mk.box(name + '_pane', size(width, 0.02, height), moved(depth + 0.012)), glass)
    return [surround, pane]


def rubble(name, count, centre, spread, sizes, material, seed=3):
    """Broken chunks scattered on the ground around a point."""
    rng = random.Random(seed)
    parts = []
    for index in range(count):
        s = [rng.uniform(sizes[0], sizes[1]) * rng.uniform(0.5, 1.0) for _ in range(3)]
        angle, reach = rng.uniform(0, 2 * math.pi), rng.uniform(0.25, 1.0) * spread
        chunk = mk.box('%s_%d' % (name, index), s, (0, 0, 0))
        mk.map_points(chunk, lambda v: (v.x * (1 + 0.3 * math.sin(v.z * 9 + index)), v.y * (1 + 0.25 * math.cos(v.x * 7 + index)), v.z))
        mk.transform(chunk, (centre[0] + math.cos(angle) * reach, centre[1] + math.sin(angle) * reach, s[2] * 0.3),
                     (rng.uniform(-25, 25), rng.uniform(-25, 25), rng.uniform(0, 180)))
        parts.append(mk.assign(chunk, material))
    return mk.join(name, parts)


# --- detailed assets (session 4): texel weights, shared texels, props as root nodes ------------------

def unwrap_weighted(objs, weights=(), margin=0.004):
    """atlasbake.unwrap with texel weights: (object, factor) pairs scale an object's islands before
    the packing, so what is seen closest gets the most texels."""
    for obj in objs:
        layers = obj.data.uv_layers
        while len(layers) > 0:
            layers.remove(layers[0])
        layers.new(name='atlas')
    mk._activate(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj, factor in weights:
        if abs(factor - 1.0) > 1e-3:
            for item in obj.data.uv_layers.active.data:
                item.uv = (item.uv[0] * factor, item.uv[1] * factor)
    mk._activate(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def bake_detailed(objs, size, work_dir, occlusion_samples=24, occlusion_in_color=0.3, occlusion_distance=1.5):
    """atlasbake.bake for materials that use Ambient Occlusion nodes (edge wear, crevice dirt): the
    same five passes and the same three files, but the nodes are muted during the occlusion pass, which
    needs no shading and would otherwise trace every node's rays for each of its samples."""
    import numpy as np
    os.makedirs(work_dir, exist_ok=True)
    atlasbake._setup_cycles(4)
    world = bpy.context.scene.world or bpy.data.worlds.new('bake_world')
    bpy.context.scene.world = world
    world.light_settings.distance = occlusion_distance
    target = mk.join('bake_copy', [mk.duplicate(o, o.name + '_bake') for o in objs])
    for o in objs:
        o.hide_render = True
    image = bpy.data.images.new('bake_target', size, size, alpha=False, float_buffer=True, is_data=True)
    color = atlasbake._bake_pass(target, image, 'EMIT', 'Base Color')[..., :3]
    rough = atlasbake._bake_pass(target, image, 'EMIT', 'Roughness')[..., 0]
    metal = atlasbake._bake_pass(target, image, 'EMIT', 'Metallic')[..., 0]
    normal = atlasbake._bake_pass(target, image, 'NORMAL')[..., :3]
    muted = [node for material in target.data.materials if material and material.node_tree
             for node in material.node_tree.nodes if node.type == 'AMBIENT_OCCLUSION' and not node.mute]
    for node in muted:
        node.mute = True
    occlusion = atlasbake._bake_pass(target, image, 'AO', samples=occlusion_samples)[..., 0]
    for node in muted:
        node.mute = False
    bpy.data.images.remove(image)
    bpy.data.objects.remove(target, do_unlink=True)
    for o in objs:
        o.hide_render = False
    shade = 1.0 - occlusion_in_color * (1.0 - occlusion)
    return {
        'base': atlasbake._save(atlasbake._srgb(color * shade[..., None]), os.path.join(work_dir, 'base.png')),
        'orm': atlasbake._save(np.stack([occlusion, rough, metal], axis=-1), os.path.join(work_dir, 'orm.png')),
        'normal': atlasbake._save(normal, os.path.join(work_dir, 'normal.png')),
    }


def draco_pack(path, bits=(14, 12, 9)):
    """Rewrites a .glb with its triangle meshes in KHR_draco_mesh_compression (the game's loader reads
    it, game/src/assets/AssetLibrary.js). bits: quantisation of positions, texture coordinates and
    normals. Returns False, leaving the file as it is, when the DracoPy module is not installed."""
    try:
        import DracoPy
    except Exception:
        return False
    import numpy as np
    with open(path, 'rb') as handle:
        data = handle.read()
    length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + length].decode('utf-8'))
    rest = data[20 + length:]
    binary = rest[8:8 + struct.unpack_from('<I', rest, 0)[0]] if rest else b''
    if 'KHR_draco_mesh_compression' in document.get('extensionsUsed', []):
        return True
    views, accessors = document['bufferViews'], document['accessors']
    kinds = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
    widths = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

    def array(index):
        accessor = accessors[index]
        view = views[accessor['bufferView']]
        kind, width = kinds[accessor['componentType']], widths[accessor['type']]
        start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        if view.get('byteStride', 0) not in (0, np.dtype(kind).itemsize * width):
            raise RuntimeError('draco_pack: interleaved buffers are not handled')
        return np.frombuffer(binary, dtype=kind, count=accessor['count'] * width, offset=start).reshape(accessor['count'], width)

    chunks, new_views, packed = [], [], set()
    offset = 0

    def add_view(blob, extra=None):
        nonlocal offset
        blob = bytes(blob) + b'\x00' * ((4 - len(blob) % 4) % 4)
        view = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(blob)}
        view.update(extra or {})
        chunks.append(blob)
        new_views.append(view)
        offset += len(blob)
        return len(new_views) - 1

    done = {}
    for mesh in document.get('meshes', []):
        for primitive in mesh['primitives']:
            attributes = primitive['attributes']
            key = (primitive.get('indices'), tuple(sorted(attributes.items())))
            if primitive.get('mode', 4) != 4 or 'indices' not in primitive or set(attributes) - {'POSITION', 'NORMAL', 'TEXCOORD_0'}:
                raise RuntimeError('draco_pack: a primitive this packer does not handle in mesh %s' % mesh.get('name'))
            if key in done:
                primitive.setdefault('extensions', {})['KHR_draco_mesh_compression'] = done[key]
                continue
            faces = array(primitive['indices']).astype(np.uint32).reshape(-1, 3)
            options = {}
            if 'TEXCOORD_0' in attributes:
                options.update(tex_coord=array(attributes['TEXCOORD_0']).astype(np.float64), tex_coord_quantization_bits=bits[1])
            if 'NORMAL' in attributes:
                options.update(normals=array(attributes['NORMAL']).astype(np.float64), normal_quantization_bits=bits[2])
            blob = DracoPy.encode(array(attributes['POSITION']).astype(np.float32), faces, quantization_bits=bits[0], compression_level=10, **options)
            decoded = DracoPy.decode(blob)
            ids = {{0: 'POSITION', 1: 'NORMAL', 3: 'TEXCOORD_0'}[item['attribute_type']]: item['unique_id'] for item in decoded.attributes}
            count = int(decoded.points.shape[0])
            for name in attributes:
                accessors[attributes[name]]['count'] = count
                packed.add(attributes[name])
            accessors[primitive['indices']]['count'] = int(decoded.faces.shape[0]) * 3
            if count > 65535:
                accessors[primitive['indices']]['componentType'] = 5125
            packed.add(primitive['indices'])
            done[key] = {'bufferView': add_view(blob), 'attributes': {name: ids[name] for name in attributes}}
            primitive.setdefault('extensions', {})['KHR_draco_mesh_compression'] = done[key]
    remap = {}
    for index, view in enumerate(views):
        users = [i for i, accessor in enumerate(accessors) if accessor.get('bufferView') == index]
        if users and all(i in packed for i in users):
            continue
        start = view.get('byteOffset', 0)
        remap[index] = add_view(binary[start:start + view['byteLength']], {k: v for k, v in view.items() if k not in ('buffer', 'byteOffset', 'byteLength')})
    for index, accessor in enumerate(accessors):
        if index in packed:
            accessor.pop('bufferView', None)
            accessor.pop('byteOffset', None)
        elif 'bufferView' in accessor:
            accessor['bufferView'] = remap[accessor['bufferView']]
    for image in document.get('images', []):
        if 'bufferView' in image:
            image['bufferView'] = remap[image['bufferView']]
    document['bufferViews'] = new_views
    payload = b''.join(chunks)
    document['buffers'] = [{'byteLength': len(payload)}]
    for key in ('extensionsUsed', 'extensionsRequired'):
        names = document.setdefault(key, [])
        if 'KHR_draco_mesh_compression' not in names:
            names.append('KHR_draco_mesh_compression')
    text = json.dumps(document, separators=(',', ':')).encode('utf-8')
    text += b' ' * ((4 - len(text) % 4) % 4)
    payload += b'\x00' * ((4 - len(payload) % 4) % 4)
    out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(text) + 8 + len(payload)) + struct.pack('<I4s', len(text), b'JSON') + text
    out += struct.pack('<I4s', len(payload), b'BIN\x00') + payload
    with open(path, 'wb') as handle:
        handle.write(out)
    return True


class DetailKitAsset(KitAsset):
    """KitAsset with what the realism pass needs (a script asks for it with ASSET['builder']):

    density(obj, factor)   texel weight of a part (1 = the atlas' common density)
    repeat(obj, matrices)  after the bake, copies of a part under 4x4 matrices: they share its texels
                           (door leaves, ribs, wheels, mirrored halves). A static part's copies join its
                           levels; give into=<prop object> to join them (and obj) into a prop instead
    prop(obj, slot)        a root node of its own modelled around the point slot (x, y) on the ground,
                           so that the props of one file bake side by side; in the file every prop sits
                           on the scene origin with its own origin under its centre
    child(obj, parent)     a prop that is a child node of another prop (same slot)
    """

    def __init__(self, asset_id, atlas=1024, kind='building'):
        super().__init__(asset_id, atlas, kind)
        self.weights = []
        self.repeats = []
        self.props = []
        self.sources = []
        self.margin = 0.004
        self.image_quality = 84
        self.occlusion = (24, 0.3, 1.5)
        self.draco = True
        self.map_scale = {'orm': 0.5, 'normal': 0.5}

    def density(self, obj, factor):
        self.weights.append((obj, factor))
        return obj

    def repeat(self, obj, matrices, into=None):
        self.repeats.append((obj, list(matrices), into))
        if into is not None:
            self.sources.append(obj)
        return obj

    def prop(self, obj, slot=(0.0, 0.0)):
        self.props.append((obj, (slot[0], slot[1], 0.0)))
        self.meshes.append(obj)
        return obj

    def child(self, obj, parent):
        slot = next(s for o, s in self.props if o is parent)
        self.props.append((obj, slot))
        self.meshes.append(obj)
        obj.parent = parent
        return obj

    def finish(self, out_path, work_dir, bake=True):
        static = [p[0] for p in self.parts]
        everything = static + list(self.meshes) + list(self.sources)
        baked = [o for o in everything if any(role(m.name) in ('atlas', 'paint') for m in o.data.materials)]
        if bake and baked:
            unwrap_weighted(baked, self.weights, self.margin)
            paths = bake_detailed(baked, self.atlas, work_dir, self.occlusion[0], self.occlusion[1], self.occlusion[2])
            # The occlusion-roughness-metal and normal maps may be stored smaller than the colour atlas.
            from PIL import Image
            for key, share in self.map_scale.items():
                if share < 0.999:
                    picture = Image.open(paths[key])
                    side = max(64, int(round(picture.size[0] * share)))
                    picture.resize((side, side), Image.LANCZOS).save(paths[key])
            atlasbake.swap_materials(baked, paths)
        for obj, matrices, into in self.repeats:
            copies = []
            for index, matrix in enumerate(matrices):
                copy = mk.duplicate(obj, '%s_rep%d' % (obj.name, index))
                copy.data.transform(matrix)
                if matrix.determinant() < 0:
                    copy.data.flip_normals()
                copy.data.update()
                copies.append(copy)
            if into is None:
                levels, ratios = next((p[1], p[2]) for p in self.parts if p[0] is obj)
                for copy in copies:
                    self.parts.append((copy, levels, ratios))
            else:
                name = into.name
                joined = mk.join(name, [into, obj] + copies)
                atlasbake._merge_slots(joined)
        static = [p[0] for p in self.parts]
        levels = 1 + max((max(p[1]) for p in self.parts), default=0)
        made = []
        for level in range(levels):
            copies = []
            for obj, shown, ratios in self.parts:
                if level not in shown:
                    continue
                copy = mk.duplicate(obj, '%s_copy%d' % (obj.name, level))
                if level > 0 and ratios[level - 1] < 0.999:
                    mk.decimate(copy, ratios[level - 1])
                copies.append(copy)
            if copies:
                joined = mk.join('lod%d' % level, copies)
                atlasbake._merge_slots(joined)
                made.append(joined)
        for obj in static:
            bpy.data.objects.remove(obj, do_unlink=True)
        for obj in made:
            obj.name = obj.name.split('.')[0]
        self.meshes = made + list(self.meshes)
        items = {}
        for obj, slot in self.props:
            obj.data.transform(mk.Matrix.Translation((-slot[0], -slot[1], -slot[2])))
            obj.data.update()
            lo = [min(v.co[i] for v in obj.data.vertices) for i in range(3)]
            hi = [max(v.co[i] for v in obj.data.vertices) for i in range(3)]
            items[obj.name] = {'size': [round(hi[0] - lo[0], 3), round(hi[2] - lo[2], 3), round(hi[1] - lo[1], 3)],
                               'min': [round(lo[0], 3), round(lo[2], 3), round(-hi[1], 3)],
                               'max': [round(hi[0], 3), round(hi[2], 3), round(-lo[1], 3)],
                               'triangles': mk.triangle_count(obj)}
        if items:
            self.extras['items'] = {name: {'size': item['size']} for name, item in items.items()}
        report = self._measure(levels)
        scene = bpy.context.scene
        for key, value in {'asset': self.id, 'kind': self.kind, 'lods': levels, 'lod_distances': list(self.lod_distances)[:levels - 1],
                           'bounds': report['bounds'], **self.extras}.items():
            scene[key] = value
        bpy.ops.object.select_all(action='DESELECT')
        for obj in self.meshes + self.empties:
            obj.select_set(True)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=True, export_image_format=image_format(),
                                  export_image_quality=self.image_quality, export_extras=True, export_yup=True, export_apply=True,
                                  export_animations=False, export_tangents=False, export_cameras=False, export_lights=False)
        assetfile.patch_roles(out_path)
        patch_cutout(out_path)
        report['raw_bytes'] = os.path.getsize(out_path)
        if self.draco:
            # The uncompressed file stays in the scratch directory (Blender can re-import that one).
            import shutil
            shutil.copyfile(out_path, os.path.join(work_dir, 'raw.glb'))
        report['draco'] = draco_pack(out_path) if self.draco else False
        # Back to the slots, so that a preview rendered after the build shows the props side by side.
        for obj, slot in self.props:
            if obj.parent is None:
                obj.location = slot
        bpy.context.view_layer.update()
        if items:
            report['items'] = items
        report['kind'] = self.kind
        report['bytes'] = os.path.getsize(out_path)
        return report
