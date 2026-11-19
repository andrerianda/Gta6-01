"""StoryAsset and the shared helpers of the garage story models (art/build_story_garage.py).

StoryAsset wraps the aircraft pipeline's asset class (art/blender/lib/assetfile.py) for cinematic
sets and hand props: static parts are joined into ONE mesh lod0 after the bake (lods: 1), moving or
named parts (door_office, lamp_desk, lid) stay nodes of their own with the origin on the pivot. Every
part carries a texel weight, so lettered faces get more of the atlas than a ceiling does. Printed
surfaces (letterheads, labels, the photograph) are images painted with PIL (paint.py), projected by
world position and baked into the atlas with everything else; glass keeps its own painted texture.

Blender axes while modelling: Z up, the asset's front (the game's -Z) towards +Y, +X is the game's +X.
"""
import json
import math
import os
import struct

import bpy
from mathutils import Vector

from lib import assetfile, atlasbake
from lib import meshkit as mk
from lib import surfaces as sf

ATLAS_SCALE = float(os.environ.get('MARAZUL_STORY_ATLAS', '1'))
AO_SAMPLES = int(os.environ.get('MARAZUL_STORY_AO', '24'))


def unwrap(objs, margin=0.003):
    """atlasbake.unwrap with a texel weight per object (obj['texel'], 1 = the average density)."""
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
    for obj in objs:
        weight = float(obj.get('texel', 1.0))
        if abs(weight - 1.0) > 1e-3:
            for item in obj.data.uv_layers[0].data:
                item.uv = (item.uv[0] * weight, item.uv[1] * weight)
    mk._activate(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


class StoryAsset(assetfile.AircraftAsset):
    """The builder a story script's make(a) talks to."""

    def __init__(self, asset_id, atlas=1024, kind='prop'):
        super().__init__(asset_id, max(128, int(atlas * ATLAS_SCALE)))
        self.kind = kind
        self.static = []
        self.named = []
        self.joins = []
        self.occlusion_distance = 0.6

    def add(self, obj, texel=1.0):
        """A static part (joined into lod0 after the bake)."""
        obj['texel'] = texel
        self.static.append(obj)
        return obj

    def add_all(self, objs, texel=1.0):
        for obj in objs:
            self.add(obj, texel)

    def node(self, obj, pivot, texel=1.0):
        """A node of its own with its origin on the pivot."""
        obj['texel'] = texel
        mk.set_origin(obj, pivot)
        self.named.append(obj)
        return obj

    def join_into(self, obj, target):
        """An unbaked mesh (glass, lamp) that becomes part of a named node after the bake."""
        self.joins.append((obj, target))
        return obj

    def finish(self, out_path, work_dir, bake=True):
        bpy.context.view_layer.update()
        everything = self.static + self.named + [j[0] for j in self.joins]
        baked = [o for o in everything if any(sf.role_of(m.name) in ('atlas', 'paint') for m in o.data.materials)]
        if bake and baked:
            unwrap(baked)
            paths = atlasbake.bake(baked, self.atlas, work_dir, occlusion_samples=AO_SAMPLES, occlusion_in_color=0.45,
                                   occlusion_distance=self.occlusion_distance)
            atlasbake.swap_materials(baked, paths)
        for obj in everything:
            if obj not in baked and obj.data.uv_layers:
                obj.data.uv_layers[0].name = 'atlas'
        for obj, target in self.joins:
            name, pivot = target.name, target.location.copy()
            joined = mk.join(name, [target, obj])
            mk.set_origin(joined, pivot)
            atlasbake._merge_slots(joined)
        exported = list(self.named)
        if self.static:
            body = mk.join('lod0', self.static)
            atlasbake._merge_slots(body)
            exported.insert(0, body)
        self.meshes = exported
        report = self._measure(1)
        report['draws'] = sum(len(o.data.materials) for o in exported)
        scene = bpy.context.scene
        for key, value in {'asset': self.id, 'kind': self.kind, 'lods': 1, 'lod_distances': [], 'bounds': report['bounds'],
                           **self.extras}.items():
            scene[key] = value
        bpy.ops.object.select_all(action='DESELECT')
        for obj in exported + self.empties:
            obj.select_set(True)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=True, export_image_format='WEBP',
                                  export_image_quality=int(os.environ.get('MARAZUL_STORY_WEBP', '82')), export_extras=True, export_yup=True,
                                  export_apply=True, export_animations=False, export_tangents=False, export_cameras=False,
                                  export_lights=False)
        assetfile.patch_roles(out_path)
        patch_textured_glass(out_path)
        report['kind'] = self.kind
        report['bytes'] = os.path.getsize(out_path)
        report['anchors'] = {o.name: [round(o.location.x, 3), round(o.location.z, 3), round(-o.location.y, 3)] for o in self.empties}
        report['pivots'] = {o.name: [round(o.location.x, 3), round(o.location.z, 3), round(-o.location.y, 3)] for o in self.named}
        return report


def patch_textured_glass(path):
    """Glass that carries its own painted texture (rain streaks) keeps the texture's colour and alpha."""
    with open(path, 'rb') as handle:
        data = handle.read()
    length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + length].decode('utf-8'))
    rest = data[20 + length:]
    for material in document.get('materials', []):
        pbr = material.get('pbrMetallicRoughness', {})
        if sf.role_of(material.get('name', '')) == 'glass' and 'baseColorTexture' in pbr:
            pbr['baseColorFactor'] = [1.0, 1.0, 1.0, 1.0]
            material['doubleSided'] = True
    text = json.dumps(document, separators=(',', ':')).encode('utf-8')
    text += b' ' * ((4 - len(text) % 4) % 4)
    out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(text) + len(rest)) + struct.pack('<I4s', len(text), b'JSON') + text + rest
    with open(path, 'wb') as handle:
        handle.write(out)


# --- shapes ----------------------------------------------------------------------------------------

def panel(name, origin, u, v, nx=1, ny=1, lift=None):
    """A grid sheet from origin along u (width) and v (height); its normal is u x v. lift(s, t) -> metres
    along the normal (curl, sag)."""
    o, u, v = Vector(origin), Vector(u), Vector(v)
    n = u.cross(v).normalized()
    verts = []
    for j in range(ny + 1):
        for i in range(nx + 1):
            s, t = i / nx, j / ny
            verts.append(tuple(o + u * s + v * t + n * (lift(s, t) if lift else 0.0)))
    faces = [(j * (nx + 1) + i, j * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i)
             for j in range(ny) for i in range(nx)]
    obj = mk.mesh_object(name, verts, faces)
    layer = obj.data.uv_layers.new(name='UVMap')
    for loop in obj.data.loops:
        index = loop.vertex_index
        layer.data[loop.index].uv = ((index % (nx + 1)) / nx, (index // (nx + 1)) / ny)
    if nx > 1 or ny > 1:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def block(name, size, location, material, bevel=0.0, rotation=None, segments=1):
    obj = mk.box(name, size, (0, 0, 0), bevel, segments)
    if rotation:
        mk.transform(obj, (0, 0, 0), rotation)
    mk.transform(obj, location)
    if bevel > 0:
        mk.shade(obj, 40)
    return mk.assign(obj, material)


def rod(name, path, radius, material, sides=8):
    return mk.shade(mk.assign(mk.tube(name, path, radius, sides), material), 50)


def can(name, radius, z0, z1, material, location=(0, 0), sides=14, radius_top=None):
    obj = mk.cylinder(name, radius, z1 - z0, (location[0], location[1], 0.5 * (z0 + z1)), 'Z', sides, radius_top)
    return mk.shade(mk.assign(obj, material), 50)


def zloft(name, sections, material, count=20, cap=True):
    """A lofted body through superellipse sections (z, x, y, width, depth, power), bottom to top."""
    rings = []
    for z, x, y, width, depth, power in sections:
        pts = []
        for i in range(count):
            a = 2 * math.pi * i / count
            c, s = math.cos(a), math.sin(a)
            pts.append((x + math.copysign(abs(c) ** (2.0 / power), c) * width * 0.5,
                        y + math.copysign(abs(s) ** (2.0 / power), s) * depth * 0.5, z))
        rings.append(pts)
    obj = mk.loft(name, rings, cap, cap)
    return mk.shade(mk.assign(obj, material), 60)


def path_loft(name, stations, material, count=12):
    """A tube of elliptical sections along a path: stations are ((x, y, z), width, depth); sections lie
    in the plane across the path (sleeves, trouser legs, handles)."""
    rings = []
    for i, (p, width, depth) in enumerate(stations):
        p = Vector(p)
        ahead = (Vector(stations[min(i + 1, len(stations) - 1)][0]) - Vector(stations[max(i - 1, 0)][0])).normalized()
        side = ahead.cross(Vector((0, 1, 0)))
        if side.length < 1e-4:
            side = Vector((1, 0, 0))
        side.normalize()
        front = side.cross(ahead)
        rings.append([tuple(p + side * math.cos(2 * math.pi * k / count) * width * 0.5 + front * math.sin(2 * math.pi * k / count) * depth * 0.5)
                      for k in range(count)])
    obj = mk.loft(name, rings)
    mk.recalc_normals(obj)
    return mk.shade(mk.assign(obj, material), 60)


def backing(obj, material, gap=0.0004):
    """The other side of a sheet: a turned copy just behind it, in a plain material."""
    copy = mk.duplicate(obj, obj.name + '_back')
    normal = copy.data.polygons[0].normal.copy()
    mk.flip(copy)
    mk.transform(copy, tuple(-normal * gap))
    return mk.assign(copy, material)


def cut(obj, z, keep_below=True):
    """Cuts a mesh open at a height and keeps one side (an open shell)."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z), plane_no=(0, 0, 1),
                           clear_outer=keep_below, clear_inner=not keep_below)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def rounded_card(name, width, height, thickness, radius, steps=4):
    """A card with rounded corners standing in the XZ plane, centred, its faces towards +Y and -Y."""
    outline = []
    for cx, cz, start in ((width / 2 - radius, height / 2 - radius, 0), (-width / 2 + radius, height / 2 - radius, 90),
                          (-width / 2 + radius, -height / 2 + radius, 180), (width / 2 - radius, -height / 2 + radius, 270)):
        for k in range(steps + 1):
            a = math.radians(start + 90 * k / steps)
            outline.append((cx + radius * math.cos(a), cz + radius * math.sin(a)))
    count = len(outline)
    verts = [(x, thickness / 2, z) for x, z in outline] + [(x, -thickness / 2, z) for x, z in outline]
    faces = [tuple(range(count)), tuple(range(2 * count - 1, count - 1, -1))]
    faces += [(i, count + i, count + (i + 1) % count, (i + 1) % count) for i in range(count)]
    obj = mk.mesh_object(name, verts, faces)
    mk.recalc_normals(obj)
    return obj


# --- materials -------------------------------------------------------------------------------------

def printed(name, image_path, origin, u, v, roughness=0.7, metallic=0.0, back='#d9d5c8', repeat=False, bump=0.03):
    """A painted image projected by world position: origin is the image's bottom-left corner, u and v
    its full width and height vectors. Outside the image (or where it is transparent) the `back`
    colour shows. repeat tiles the image (stacked banknotes)."""
    mat, tree, shader = sf._principled(name)
    nodes, links = tree.nodes, tree.links
    geometry = nodes.new('ShaderNodeNewGeometry')
    offset = nodes.new('ShaderNodeVectorMath')
    offset.operation = 'SUBTRACT'
    links.new(geometry.outputs['Position'], offset.inputs[0])
    offset.inputs[1].default_value = tuple(origin)
    combine = nodes.new('ShaderNodeCombineXYZ')
    for index, axis in enumerate((Vector(u), Vector(v))):
        dot = nodes.new('ShaderNodeVectorMath')
        dot.operation = 'DOT_PRODUCT'
        links.new(offset.outputs['Vector'], dot.inputs[0])
        dot.inputs[1].default_value = tuple(axis / axis.length_squared)
        links.new(dot.outputs['Value'], combine.inputs[index])
    image = nodes.new('ShaderNodeTexImage')
    image.image = bpy.data.images.load(image_path, check_existing=True)
    image.extension = 'REPEAT' if repeat else 'CLIP'
    links.new(combine.outputs['Vector'], image.inputs['Vector'])
    colour = sf._mix(tree, image.outputs['Alpha'], sf.hex_color(back), image.outputs['Color'])
    links.new(colour, shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    if bump > 0:
        node = nodes.new('ShaderNodeBump')
        node.inputs['Strength'].default_value = bump
        node.inputs['Distance'].default_value = 0.002
        links.new(sf._noise(tree, 60.0, 2.0), node.inputs['Height'])
        links.new(node.outputs['Normal'], shader.inputs['Normal'])
    return mat


def printed_panel(name, image_path, origin, u, v, nx=1, ny=1, lift=None, **options):
    """A sheet with its painted image: the panel and the printed material share one frame."""
    return mk.assign(panel(name, origin, u, v, nx, ny, lift), printed('print_' + name, image_path, origin, u, v, **options))


def wood(name, color, axis='X', roughness=0.55, wear=0.4, dark=0.55):
    """Timber: long grain along an axis, worn patches, a soft sheen that varies."""
    mat, tree, shader = sf._principled(name)
    base = sf.hex_color(color)
    deep = tuple(c * dark for c in base[:3]) + (1,)
    stretch = {'X': (0.06, 1, 1), 'Y': (1, 0.06, 1), 'Z': (1, 1, 0.06)}[axis]
    grain = sf._ramp(tree, sf._noise(tree, 38.0, 4.0, 0.6, stretch), 0.32, 0.7)
    colour = sf._mix(tree, grain, deep, base)
    patches = sf._ramp(tree, sf._noise(tree, 2.6, 4.0), 0.5, 0.78)
    pale = tuple(min(1.0, c * 1.5 + 0.03) for c in base[:3]) + (1,)
    colour = sf._mix(tree, _times(tree, patches, wear), colour, pale)
    grime = sf._ramp(tree, sf._noise(tree, 1.1, 3.0), 0.45, 0.8)
    colour = sf._mix(tree, _times(tree, grime, 0.5 * wear), colour, (0.03, 0.025, 0.02, 1), 'MIX')
    tree.links.new(colour, shader.inputs['Base Color'])
    rough = tree.nodes.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value = max(0.05, roughness - 0.15)
    rough.inputs['To Max'].default_value = min(1.0, roughness + 0.3 * wear + 0.1)
    tree.links.new(patches, rough.inputs['Value'])
    tree.links.new(rough.outputs['Result'], shader.inputs['Roughness'])
    bump = tree.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.25
    bump.inputs['Distance'].default_value = 0.002
    tree.links.new(grain, bump.inputs['Height'])
    tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    return mat


def _times(tree, value, factor):
    node = tree.nodes.new('ShaderNodeMath')
    node.operation = 'MULTIPLY'
    tree.links.new(value, node.inputs[0])
    node.inputs[1].default_value = factor
    return node.outputs['Value']


def lino(name='lino', first='#6f6a52', second='#3f4a43', tile=0.305, wear=0.6):
    """Checkered lino tiles, scuffed dull along the walked paths, dark in the joints."""
    mat, tree, shader = sf._principled(name)
    coords = tree.nodes.new('ShaderNodeTexCoord')
    checker = tree.nodes.new('ShaderNodeTexChecker')
    checker.inputs['Scale'].default_value = 1.0 / tile
    checker.inputs['Color1'].default_value = sf.hex_color(first)
    checker.inputs['Color2'].default_value = sf.hex_color(second)
    tree.links.new(coords.outputs['Object'], checker.inputs['Vector'])
    colour = checker.outputs['Color']
    seams = sf._panel_lines(tree, (tile, tile), 'top', 0.01)
    colour = sf._mix(tree, seams, colour, (0.02, 0.02, 0.018, 1))
    scuff = sf._ramp(tree, sf._noise(tree, 1.3, 5.0, 0.65), 0.42, 0.7)
    colour = sf._mix(tree, _times(tree, scuff, 0.55 * wear), colour, (0.42, 0.39, 0.33, 1))
    streak = sf._ramp(tree, sf._noise(tree, 7.0, 3.0, 0.6, (1, 0.15, 1)), 0.55, 0.8)
    colour = sf._mix(tree, _times(tree, streak, 0.5 * wear), colour, (0.035, 0.03, 0.028, 1))
    stain = sf._ramp(tree, sf._noise(tree, 0.5, 2.0), 0.58, 0.7)
    colour = sf._mix(tree, _times(tree, stain, 0.5), colour, (0.05, 0.04, 0.03, 1), 'MULTIPLY')
    tree.links.new(colour, shader.inputs['Base Color'])
    rough = tree.nodes.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value = 0.28
    rough.inputs['To Max'].default_value = 0.8
    tree.links.new(scuff, rough.inputs['Value'])
    tree.links.new(rough.outputs['Result'], shader.inputs['Roughness'])
    groove = tree.nodes.new('ShaderNodeBump')
    groove.invert = True
    groove.inputs['Strength'].default_value = 0.5
    groove.inputs['Distance'].default_value = 0.002
    tree.links.new(seams, groove.inputs['Height'])
    tree.links.new(groove.outputs['Normal'], shader.inputs['Normal'])
    return mat


def plaster(name='plaster', color='#b3aa92', stain='#5d4f38', wear=0.6):
    """Painted plaster with damp stains that run down from the ceiling and grime above the skirting."""
    mat, tree, shader = sf._principled(name)
    base = sf.hex_color(color)
    coords = tree.nodes.new('ShaderNodeTexCoord')
    split = tree.nodes.new('ShaderNodeSeparateXYZ')
    tree.links.new(coords.outputs['Object'], split.inputs['Vector'])
    height = split.outputs['Z']
    mottled = sf._ramp(tree, sf._noise(tree, 1.4, 5.0, 0.6), 0.3, 0.75)
    colour = sf._mix(tree, _times(tree, mottled, 0.35), base, tuple(c * 0.6 for c in base[:3]) + (1,))
    runs = sf._ramp(tree, sf._noise(tree, 3.2, 4.0, 0.6, (1, 1, 0.07)), 0.52, 0.72)
    high = sf._ramp(tree, height, 1.2, 3.0)
    damp = tree.nodes.new('ShaderNodeMath')
    damp.operation = 'MULTIPLY'
    tree.links.new(runs, damp.inputs[0])
    tree.links.new(high, damp.inputs[1])
    colour = sf._mix(tree, _times(tree, damp.outputs['Value'], wear), colour, sf.hex_color(stain))
    low = sf._ramp(tree, height, 0.7, 0.05)
    colour = sf._mix(tree, _times(tree, low, 0.45 * wear), colour, (0.08, 0.07, 0.06, 1))
    blotch = sf._ramp(tree, sf._noise(tree, 0.45, 3.0), 0.6, 0.72)
    colour = sf._mix(tree, _times(tree, blotch, 0.4 * wear), colour, sf.hex_color(stain), 'MULTIPLY')
    tree.links.new(colour, shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = 0.9
    bump = tree.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.3
    bump.inputs['Distance'].default_value = 0.004
    tree.links.new(sf._noise(tree, 22.0, 4.0), bump.inputs['Height'])
    tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    return mat


def textured_glass(name, image_path):
    """Glass with a painted colour and alpha texture (rain streaks) on the mesh's own UVs."""
    mat, tree, shader = sf._principled(name)
    node = tree.nodes.new('ShaderNodeTexImage')
    node.image = bpy.data.images.load(image_path, check_existing=True)
    tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
    tree.links.new(node.outputs['Alpha'], shader.inputs['Alpha'])
    shader.inputs['Roughness'].default_value = 0.08
    mat['alpha'] = 1.0
    try:
        mat.blend_method = 'BLEND'
    except Exception:
        pass
    return mat
