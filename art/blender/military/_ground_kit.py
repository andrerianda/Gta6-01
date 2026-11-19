"""Private helpers of the base-ground artist's assets (base_ground, base_fence, base_floodlight_mast,
base_watchtower, base_camo_net and naval/camo_net_hangar).

  Graph / V        a small expression builder for procedural node materials whose patterns are
                   PERIODIC over a rectangle (4D noise on a flat torus), so a bake of them tiles
  bake_graph       bakes named values of a Graph (colour, roughness, height, alpha) with Cycles
  bake_card        bakes real geometry lying over a rectangle onto a flat card (selected to active):
                   colour, coverage (alpha), normal, occlusion. Chain-link, wire and netting textures
  normal_map       a tangent-space normal map from a baked height map (wrapping gradients)
  write_glb        a plain .glb writer for the ground library (quads, WebP textures, texture transforms)
  hook_finish      wraps a builder's finish(): root node, image budget, extra numbers in the report

Bakes go through lib.atlasbake._setup_cycles, so MARAZUL_BAKE_DEVICE=GPU works here as everywhere.
Images here are arrays with row 0 at the TOP (glTF v = 0); Graph.v is that glTF v as well.
"""
import io
import json
import math
import os
import struct

import bpy
import numpy as np
from PIL import Image, ImageFilter

from lib import atlasbake
from lib import meshkit as mk
from lib import surfaces as sf

TAU = 2.0 * math.pi


# --- node expressions ----------------------------------------------------------------------------

class V:
    """A value in a node tree (a socket); arithmetic on it adds Math nodes."""

    def __init__(self, graph, socket):
        self.g, self.s = graph, socket

    def _math(self, operation, *others, clamp=False):
        node = self.g.tree.nodes.new('ShaderNodeMath')
        node.operation = operation
        node.use_clamp = clamp
        for index, value in enumerate((self,) + others):
            self.g.plug(value, node.inputs[index])
        return V(self.g, node.outputs[0])

    def __add__(self, other):
        return self._math('ADD', other)

    __radd__ = __add__

    def __sub__(self, other):
        return self._math('SUBTRACT', other)

    def __rsub__(self, other):
        return self._math('MULTIPLY', -1.0)._math('ADD', other)

    def __mul__(self, other):
        return self._math('MULTIPLY', other)

    __rmul__ = __mul__

    def __truediv__(self, other):
        return self._math('DIVIDE', other)

    def __neg__(self):
        return self._math('MULTIPLY', -1.0)

    def abs(self):
        return self._math('ABSOLUTE')

    def fract(self):
        return self._math('FRACT')

    def floor(self):
        return self._math('FLOOR')

    def sin(self):
        return self._math('SINE')

    def cos(self):
        return self._math('COSINE')

    def power(self, exponent):
        return self._math('POWER', exponent)

    def min(self, other):
        return self._math('MINIMUM', other)

    def max(self, other):
        return self._math('MAXIMUM', other)

    def less(self, other):
        return self._math('LESS_THAN', other)

    def greater(self, other):
        return self._math('GREATER_THAN', other)

    def clamp(self):
        return self._math('ADD', 0.0, clamp=True)

    def ramp(self, low, high, to_low=0.0, to_high=1.0, smooth=False):
        """Maps low..high to to_low..to_high, clamped (smoothstep when smooth)."""
        node = self.g.tree.nodes.new('ShaderNodeMapRange')
        node.clamp = True
        if smooth:
            node.interpolation_type = 'SMOOTHSTEP'
        self.g.plug(self, node.inputs['Value'])
        for key, value in (('From Min', low), ('From Max', high), ('To Min', to_low), ('To Max', to_high)):
            self.g.plug(value, node.inputs[key])
        return V(self.g, node.outputs['Result'])


class Graph:
    """A node material over a rectangle of `size` metres. u, v run 0..1 over it (v = 0 is the top row
    of a bake); x, y are the same in metres. Noise and Voronoi patterns are periodic along every axis
    that `periodic` marks. source 'uv' reads the UV map (a flat tile), 'object' the object position
    (real geometry lying over x 0..size[0], y 0..size[1], for bake_card)."""

    def __init__(self, name, size=(4.0, 4.0), periodic=(True, True), source='uv'):
        self.mat = bpy.data.materials.new(name)
        self.mat.use_nodes = True
        self.tree = self.mat.node_tree
        self.shader = next(n for n in self.tree.nodes if n.type == 'BSDF_PRINCIPLED')
        self.size, self.periodic = size, periodic
        coords = self.tree.nodes.new('ShaderNodeTexCoord')
        split = self.tree.nodes.new('ShaderNodeSeparateXYZ')
        self.tree.links.new(coords.outputs['UV' if source == 'uv' else 'Object'], split.inputs[0])
        if source == 'uv':
            self.u = V(self, split.outputs['X'])
            self.v = 1.0 - V(self, split.outputs['Y'])
        else:
            self.u = V(self, split.outputs['X']) / size[0]
            self.v = V(self, split.outputs['Y']) / size[1]
        self.x, self.y = self.u * size[0], self.v * size[1]
        self.outputs = {}
        self._coords = {}

    def plug(self, value, socket):
        if isinstance(value, V):
            self.tree.links.new(value.s, socket)
        else:
            socket.default_value = value

    def const(self, value):
        node = self.tree.nodes.new('ShaderNodeValue')
        node.outputs[0].default_value = value
        return V(self, node.outputs[0])

    def coords(self, stretch=(1.0, 1.0), seed=0.0):
        """4D pattern coordinates: a periodic axis is wound on a circle whose circumference is the
        rectangle's side (a flat torus: no distortion), a free axis is plain metres."""
        key = (tuple(stretch), seed)
        if key not in self._coords:
            parts = []
            for t, metres, periodic, k in ((self.u, self.size[0], self.periodic[0], stretch[0]),
                                           (self.v, self.size[1], self.periodic[1], stretch[1])):
                if periodic:
                    radius = metres / (TAU * k)
                    angle = t * TAU
                    parts += [angle.cos() * radius, angle.sin() * radius]
                else:
                    parts.append(t * (metres / k))
            parts = [p + (seed * 17.31 + 3.7 * i) for i, p in enumerate(parts)]
            while len(parts) < 4:
                parts.append(self.const(seed * 5.13))
            combine = self.tree.nodes.new('ShaderNodeCombineXYZ')
            for index in range(3):
                self.plug(parts[index], combine.inputs[index])
            self._coords[key] = (V(self, combine.outputs[0]), parts[3])
        return self._coords[key]

    def noise(self, scale, detail=3.0, roughness=0.55, stretch=(1.0, 1.0), seed=0.0, out='Fac', lacunarity=2.0):
        """Fractal noise around 0.5; features are about 1 / scale metres (stretch lengthens them per axis)."""
        vector, w = self.coords(stretch, seed)
        node = self.tree.nodes.new('ShaderNodeTexNoise')
        node.noise_dimensions = '4D'
        self.plug(vector, node.inputs['Vector'])
        self.plug(w, node.inputs['W'])
        node.inputs['Scale'].default_value = scale
        node.inputs['Detail'].default_value = detail
        node.inputs['Roughness'].default_value = roughness
        node.inputs['Lacunarity'].default_value = lacunarity
        return V(self, node.outputs[out])

    def voronoi(self, scale, feature='F1', out='Distance', stretch=(1.0, 1.0), seed=0.0, randomness=1.0):
        """Cells of about 1 / scale metres: F1 distance, DISTANCE_TO_EDGE, or the cell's random Color."""
        vector, w = self.coords(stretch, seed)
        node = self.tree.nodes.new('ShaderNodeTexVoronoi')
        node.voronoi_dimensions = '4D'
        node.feature = feature
        self.plug(vector, node.inputs['Vector'])
        self.plug(w, node.inputs['W'])
        node.inputs['Scale'].default_value = scale
        node.inputs['Randomness'].default_value = randomness
        return V(self, node.outputs[out])

    def mix(self, factor, a, b, mode='MIX'):
        """Colour mix; a and b are V or linear RGBA tuples (rgb() makes them from hex)."""
        node = self.tree.nodes.new('ShaderNodeMix')
        node.data_type = 'RGBA'
        node.blend_type = mode
        node.clamp_factor = True
        for socket, value in ((node.inputs[0], factor), (node.inputs[6], a), (node.inputs[7], b)):
            self.plug(value, socket)
        return V(self, node.outputs[2])

    def tint(self, colour, amount):
        """colour times a scalar V (or constant)."""
        return self.mix(1.0, colour, amount, 'MULTIPLY')

    def channel(self, colour, index=0):
        node = self.tree.nodes.new('ShaderNodeSeparateColor')
        self.plug(colour, node.inputs[0])
        return V(self, node.outputs[index])

    @staticmethod
    def rgb(text):
        return sf.hex_color(text)

    def box(self, x0, x1, y0, y1, soft=0.01, wobble=None):
        """A 0..1 mask of a rectangle (metres); wobble (a V in metres) roughens its edge."""
        inside = (self.x - x0).min(x1 - self.x).min((self.y - y0).min(y1 - self.y))
        if wobble is not None:
            inside = inside + wobble
        return inside.ramp(0.0, soft)

    def finish(self, colour, roughness, metallic=0.0, bump=None, bump_distance=0.004, alpha=None):
        """Wires the Principled shader, so the material also works in a lib atlas bake or a preview."""
        self.plug(colour, self.shader.inputs['Base Color'])
        self.plug(roughness, self.shader.inputs['Roughness'])
        self.plug(metallic, self.shader.inputs['Metallic'])
        if alpha is not None:
            self.plug(alpha, self.shader.inputs['Alpha'])
        if bump is not None:
            node = self.tree.nodes.new('ShaderNodeBump')
            node.inputs['Strength'].default_value = 1.0
            node.inputs['Distance'].default_value = bump_distance
            self.plug(bump, node.inputs['Height'])
            self.tree.links.new(node.outputs['Normal'], self.shader.inputs['Normal'])
        return self.mat


# --- baking ----------------------------------------------------------------------------------------

def _read(image):
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(height, width, 4)[::-1].copy()


def _target_node(material, image):
    tree = material.node_tree
    node = tree.nodes.get('bake_target') or tree.nodes.new('ShaderNodeTexImage')
    node.name = 'bake_target'
    node.image = image
    tree.nodes.active = node
    return node


def bake_graph(graph, pixels, names, samples=6):
    """Bakes graph.outputs[name] for every name over a flat tile of pixels (width, height).
    Returns {name: array (h, w, 3) linear}."""
    atlasbake._setup_cycles(samples)
    bpy.context.scene.render.bake.margin = 0
    plane = mk.quad('tile_plane', [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)])
    mk.assign(plane, graph.mat)
    image = bpy.data.images.new('tile_bake', pixels[0], pixels[1], alpha=False, float_buffer=True, is_data=True)
    _target_node(graph.mat, image)
    tree = graph.tree
    output = next(n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
    emit = tree.nodes.new('ShaderNodeEmission')
    tree.links.new(emit.outputs[0], output.inputs['Surface'])
    out = {}
    mk._activate([plane])
    for name in names:
        value = graph.outputs[name]
        for link in list(emit.inputs['Color'].links):
            tree.links.remove(link)
        if isinstance(value, V):
            tree.links.new(value.s, emit.inputs['Color'])
        else:
            emit.inputs['Color'].default_value = tuple(value) if hasattr(value, '__len__') else (value, value, value, 1.0)
        bpy.ops.object.bake(type='EMIT')
        out[name] = _read(image)[..., :3]
    tree.links.new(graph.shader.outputs[0], output.inputs['Surface'])
    tree.nodes.remove(emit)
    bpy.data.images.remove(image)
    bpy.data.objects.remove(plane, do_unlink=True)
    return out


def bake_card(source, size, pixels, samples=8, occlusion_samples=16, occlusion_distance=0.12):
    """Bakes a mesh object lying over x 0..size[0], y 0..size[1] (seen from +Z) onto a flat card.
    Returns {'color' (h, w, 3) linear and un-premultiplied, 'alpha' (h, w), 'normal' (h, w, 3) -1..1,
    'occlusion' (h, w)}; row 0 is y = size[1]."""
    atlasbake._setup_cycles(samples)
    scene = bpy.context.scene
    scene.render.bake.margin = 0
    world = scene.world or bpy.data.worlds.new('bake_world')
    scene.world = world
    world.light_settings.distance = occlusion_distance
    card = mk.quad('card', [(0, 0, 0), (size[0], 0, 0), (size[0], size[1], 0), (0, size[1], 0)])
    card_material = bpy.data.materials.new('card_bake')
    card_material.use_nodes = True
    mk.assign(card, card_material)
    image = bpy.data.images.new('card_bake', pixels[0], pixels[1], alpha=True, float_buffer=True, is_data=True)
    _target_node(card_material, image)
    hidden = [o for o in scene.objects if o.type == 'MESH' and o is not source and o is not card and not o.hide_render]
    for obj in hidden:
        obj.hide_render = True

    def run(kind, count=samples):
        scene.cycles.samples = count
        bpy.ops.object.select_all(action='DESELECT')
        source.select_set(True)
        card.select_set(True)
        bpy.context.view_layer.objects.active = card
        options = dict(use_selected_to_active=True, cage_extrusion=2.0, max_ray_distance=0.0, margin=0, use_clear=True)
        if kind == 'NORMAL':
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', **options)
        else:
            bpy.ops.object.bake(type=kind, **options)
        return _read(image)

    originals = list(source.data.materials)
    patched = []
    for material in originals:
        tree = material.node_tree
        shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
        output = next(n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
        emit = tree.nodes.new('ShaderNodeEmission')
        base = shader.inputs['Base Color']
        if base.is_linked:
            tree.links.new(base.links[0].from_socket, emit.inputs['Color'])
        else:
            emit.inputs['Color'].default_value = tuple(base.default_value)
        tree.links.new(emit.outputs[0], output.inputs['Surface'])
        patched.append((tree, shader, output, emit))
    color = run('EMIT')[..., :3]
    for tree, shader, output, emit in patched:
        emit.inputs['Color'].default_value = (1, 1, 1, 1)
        for link in list(emit.inputs['Color'].links):
            tree.links.remove(link)
    alpha = run('EMIT')[..., 0]
    for tree, shader, output, emit in patched:
        tree.links.new(shader.outputs[0], output.inputs['Surface'])
        tree.nodes.remove(emit)
    normal = run('NORMAL')[..., :3] * 2.0 - 1.0
    occlusion = run('AO', occlusion_samples)[..., 0]
    for obj in hidden:
        obj.hide_render = False
    bpy.data.images.remove(image)
    bpy.data.objects.remove(card, do_unlink=True)
    alpha = np.clip(alpha, 0.0, 1.0)
    solid = alpha > 0.04
    color = np.where(solid[..., None], color / np.maximum(alpha, 0.04)[..., None], 0.0)
    occlusion = np.where(solid, np.clip(occlusion, 0.0, 1.0), 1.0)
    normal[~solid] = (0.0, 0.0, 1.0)
    return {'color': color, 'alpha': alpha, 'normal': normal, 'occlusion': occlusion}


def lit(card, occlusion=0.55, relief=0.3):
    """A card's colour with its own occlusion and a little light from above the image's top folded in
    (for cutout textures that carry no normal map). Linear (h, w, 3)."""
    n = card['normal']
    light = np.clip(0.55 * n[..., 2] + 0.45 * n[..., 1] + 0.25, 0.0, 1.2)
    shade = (1.0 - occlusion * (1.0 - card['occlusion'])) * (1.0 - relief + relief * light)
    return card['color'] * shade[..., None]


def blur(array, radius, wrap=True):
    """Gaussian blur of a float array (h, w) or (h, w, c), wrapping at the borders when asked."""
    if array.ndim == 3:
        return np.stack([blur(array[..., i], radius, wrap) for i in range(array.shape[2])], axis=-1)
    pad = 0 if wrap else int(radius * 3) + 1
    padded = np.pad(array.astype(np.float32), pad, mode='edge') if pad else array.astype(np.float32)
    spectrum = np.fft.rfft2(padded)
    fy = np.fft.fftfreq(padded.shape[0])[:, None]
    fx = np.fft.rfftfreq(padded.shape[1])[None, :]
    spectrum *= np.exp(-2.0 * (math.pi * radius) ** 2 * (fx * fx + fy * fy))
    out = np.fft.irfft2(spectrum, s=padded.shape).astype(np.float32)
    return out[pad:-pad, pad:-pad] if pad else out


def bleed(color, alpha, wrap=True):
    """Fills the colour of see-through texels from their neighbours, so filtering shows no dark fringe."""
    out = color.copy()
    known = (alpha > 0.3).astype(np.float32)
    for radius in (1.5, 4.0, 12.0, 40.0):
        weight = blur(known, radius, wrap)
        spread = blur(out * known[..., None], radius, wrap) / np.maximum(weight, 1e-4)[..., None]
        fill = (known < 0.5) & (weight > 0.02)
        out[fill] = spread[fill]
        known = np.maximum(known, fill.astype(np.float32))
    if (known < 0.5).any():
        out[known < 0.5] = out[known > 0.5].mean(axis=0) if (known > 0.5).any() else 0.5
    return out


def normal_map(height, metres, strength=1.0, wrap=(True, True)):
    """A tangent-space normal map (0..1, OpenGL / glTF green up) from a height map in metres."""
    rows, columns = height.shape

    def gradient(axis, periodic):
        if periodic:
            return (np.roll(height, -1, axis) - np.roll(height, 1, axis)) * 0.5
        return np.gradient(height, axis=axis)

    dx = gradient(1, wrap[0]) * (columns / metres[0])
    dy = gradient(0, wrap[1]) * (rows / metres[1])
    n = np.stack([-dx * strength, dy * strength, np.ones_like(dx)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def srgb(linear):
    return atlasbake._srgb(linear)


def to_bytes(array):
    return (np.clip(array, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)


def resize(array8, pixels):
    return np.asarray(Image.fromarray(array8).resize(pixels, Image.LANCZOS))


def seam_error(array8):
    """How well an image wraps: the mean step across each border (last row to first row, last column
    to first column) over the mean step between the row / column pairs right beside that border.
    About 1.0 is seamless (the border is just another step); a visible seam gives several times that."""
    a = array8.astype(np.float32)
    if a.ndim == 2:
        a = a[..., None]
    beside_rows = 0.5 * (np.abs(a[1] - a[0]).mean() + np.abs(a[-1] - a[-2]).mean())
    beside_columns = 0.5 * (np.abs(a[:, 1] - a[:, 0]).mean() + np.abs(a[:, -1] - a[:, -2]).mean())
    return {'v': round(float(np.abs(a[0] - a[-1]).mean() / max(beside_rows, 1e-6)), 3),
            'u': round(float(np.abs(a[:, 0] - a[:, -1]).mean() / max(beside_columns, 1e-6)), 3)}


def preview(path, views, cell=(640, 400), ground=True, samples=24):
    """An artist's larger preview sheet (one view per row), rendered only when A4_PREVIEW is set."""
    if not os.environ.get('A4_PREVIEW'):
        return None
    from lib import previewsheet
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return previewsheet.render_sheet(path, views, cell, samples=samples, columns=1, ground=ground)


def webp(array8, quality=80, target=None, lossless_alpha=False):
    """WebP bytes of an (h, w, 3 or 4) uint8 image; with target (bytes) the best quality that fits."""
    image = Image.fromarray(array8, 'RGBA' if array8.shape[-1] == 4 else 'RGB')

    def encode(q):
        handle = io.BytesIO()
        image.save(handle, 'WEBP', quality=q, method=6, exact=True, alpha_quality=100 if lossless_alpha else max(60, q))
        return handle.getvalue()

    if target is None:
        return encode(quality), quality
    low, high, best = 20, 92, None
    while low <= high:
        middle = (low + high) // 2
        data = encode(middle)
        if len(data) <= target:
            best, low = (data, middle), middle + 1
        else:
            high = middle - 1
    return best or (encode(20), 20)


def save_png(array8, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(array8).save(path)
    return path


# --- .glb files ------------------------------------------------------------------------------------

def read_glb(path):
    with open(path, 'rb') as handle:
        data = handle.read()
    length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + length].decode('utf-8'))
    binary = data[20 + length + 8:]
    return document, binary


def save_glb(path, document, binary):
    text = json.dumps(document, separators=(',', ':')).encode('utf-8')
    text += b' ' * ((4 - len(text) % 4) % 4)
    binary = bytes(binary) + b'\0' * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(text) + 8 + len(binary)
    with open(path, 'wb') as handle:
        handle.write(struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(text), b'JSON') + text
                     + struct.pack('<I4s', len(binary), b'BIN\0') + binary)


def write_glb(path, quads, materials, images, extras):
    """The ground library. quads: [{'name', 'material', 'width', 'length', 'x'}] flat on the ground
    (glTF axes: +Y up; u along +X, v along +Z, UV 0..1). materials: [{'name', 'base', 'normal',
    'orm' (image indices or None), 'blend', 'roughness', 'transform' (offset, scale) or None,
    'repeat'}]. images: [bytes of WebP files]."""
    binary = bytearray()
    views, accessors = [], []

    def view(data, target=None):
        while len(binary) % 4:
            binary.append(0)
        entry = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)}
        if target:
            entry['target'] = target
        binary.extend(data)
        views.append(entry)
        return len(views) - 1

    def accessor(array, kind, component, target):
        entry = {'bufferView': view(array.tobytes(), target), 'componentType': component, 'count': len(array), 'type': kind}
        if kind == 'VEC3':
            entry['min'], entry['max'] = array.min(axis=0).tolist(), array.max(axis=0).tolist()
        accessors.append(entry)
        return len(accessors) - 1

    names = [m['name'] for m in materials]
    meshes, nodes = [], []
    for quad in quads:
        w, l = quad['width'] * 0.5, quad['length'] * 0.5
        positions = np.array([(-w, 0, -l), (w, 0, -l), (w, 0, l), (-w, 0, l)], dtype=np.float32)
        normals = np.array([(0, 1, 0)] * 4, dtype=np.float32)
        uvs = np.array([(0, 0), (1, 0), (1, 1), (0, 1)], dtype=np.float32)
        indices = np.array([0, 2, 1, 0, 3, 2], dtype=np.uint16)
        meshes.append({'name': quad['name'], 'primitives': [{
            'attributes': {'POSITION': accessor(positions, 'VEC3', 5126, 34962), 'NORMAL': accessor(normals, 'VEC3', 5126, 34962),
                           'TEXCOORD_0': accessor(uvs, 'VEC2', 5126, 34962)},
            'indices': accessor(indices, 'SCALAR', 5123, 34963), 'material': names.index(quad['material'])}]})
        nodes.append({'name': quad['name'], 'mesh': len(meshes) - 1, 'translation': [quad['x'], 0.0, 0.0],
                      'extras': {'width': quad['width'], 'length': quad['length']}})
    image_entries = [{'bufferView': view(data), 'mimeType': 'image/webp', 'name': 'image%d' % i} for i, data in enumerate(images)]
    textures, texture_of = [], {}

    def texture(image, repeat):
        key = (image, repeat)
        if key not in texture_of:
            textures.append({'sampler': 0 if repeat else 1, 'extensions': {'EXT_texture_webp': {'source': image}}})
            texture_of[key] = len(textures) - 1
        return texture_of[key]

    material_entries = []
    for m in materials:
        base = {'index': texture(m['base'], m.get('repeat', True))}
        if m.get('transform'):
            base['extensions'] = {'KHR_texture_transform': {'offset': list(m['transform'][0]), 'scale': list(m['transform'][1])}}
        pbr = {'baseColorTexture': base, 'metallicFactor': 0.0, 'roughnessFactor': m.get('roughness', 1.0)}
        entry = {'name': m['name'], 'pbrMetallicRoughness': pbr}
        if m.get('orm') is not None:
            pbr['metallicRoughnessTexture'] = {'index': texture(m['orm'], True)}
            pbr['metallicFactor'] = 1.0
        if m.get('normal') is not None:
            entry['normalTexture'] = {'index': texture(m['normal'], True), 'scale': m.get('normal_scale', 1.0)}
        if m.get('blend'):
            entry['alphaMode'] = 'BLEND'
        material_entries.append(entry)
    document = {
        'asset': {'version': '2.0', 'generator': 'marazul base_ground.py'},
        'extensionsUsed': ['EXT_texture_webp', 'KHR_texture_transform'], 'extensionsRequired': ['EXT_texture_webp'],
        'scene': 0, 'scenes': [{'name': 'Scene', 'nodes': list(range(len(nodes))), 'extras': extras}],
        'nodes': nodes, 'meshes': meshes, 'materials': material_entries, 'textures': textures, 'images': image_entries,
        'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497},
                     {'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
        'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(binary) + (4 - len(binary) % 4) % 4}],
    }
    save_glb(path, document, binary)
    return document


def reroot(path, name):
    """Puts every scene node of a .glb under one new root node."""
    document, binary = read_glb(path)
    scene = document['scenes'][document.get('scene', 0)]
    document['nodes'].append({'name': name, 'children': list(scene['nodes'])})
    scene['nodes'] = [len(document['nodes']) - 1]
    save_glb(path, document, binary)


def shrink_images(path, plan):
    """Re-encodes images of a .glb: plan {material-map key or '*': (max pixels, WebP quality)} where
    the key is '<material>.<base|orm|normal>'. Keeps alpha. Returns {key: bytes}."""
    document, binary = read_glb(path)
    use = {}
    for material in document.get('materials', []):
        pbr = material.get('pbrMetallicRoughness', {})
        for key, slot in (('base', pbr.get('baseColorTexture')), ('orm', pbr.get('metallicRoughnessTexture')),
                          ('normal', material.get('normalTexture')), ('orm', material.get('occlusionTexture'))):
            if slot is not None:
                tex = document['textures'][slot['index']]
                source = tex.get('extensions', {}).get('EXT_texture_webp', {}).get('source', tex.get('source'))
                use.setdefault(source, '%s.%s' % (material['name'], key))
    out = bytearray()
    sizes = {}
    order = sorted(range(len(document['bufferViews'])), key=lambda i: document['bufferViews'][i].get('byteOffset', 0))
    image_of_view = {image['bufferView']: index for index, image in enumerate(document.get('images', [])) if 'bufferView' in image}
    for index in order:
        entry = document['bufferViews'][index]
        start = entry.get('byteOffset', 0)
        data = binary[start:start + entry['byteLength']]
        if index in image_of_view:
            key = use.get(image_of_view[index], '?')
            rule = plan.get(key, plan.get('*'))
            if rule:
                picture = Image.open(io.BytesIO(data))
                picture = picture.convert('RGBA' if picture.mode in ('RGBA', 'LA', 'P') else 'RGB')
                if max(picture.size) > rule[0]:
                    factor = rule[0] / max(picture.size)
                    picture = picture.resize((max(1, round(picture.width * factor)), max(1, round(picture.height * factor))), Image.LANCZOS)
                data, _ = webp(np.asarray(picture), rule[1])
                document['images'][image_of_view[index]]['mimeType'] = 'image/webp'
            sizes[key] = len(data)
        while len(out) % 4:
            out.append(0)
        entry['byteOffset'] = len(out)
        entry['byteLength'] = len(data)
        out.extend(data)
    document['buffers'][0]['byteLength'] = len(out) + (4 - len(out) % 4) % 4
    save_glb(path, document, out)
    return sizes


def glb_numbers(path):
    """What the report says about the written file: nodes, materials with their alpha modes, image bytes."""
    document, binary = read_glb(path)
    images = sum(document['bufferViews'][i['bufferView']]['byteLength'] for i in document.get('images', []) if 'bufferView' in i)
    return {'file_nodes': sorted(n['name'] for n in document['nodes']),
            'file_materials': {m['name']: m.get('alphaMode', 'OPAQUE') for m in document.get('materials', [])},
            'image_bytes': images, 'bytes': os.path.getsize(path)}


def hook_finish(a, root=None, images=None, numbers=None):
    """Wraps the builder's finish(): after the export the nodes go under `root` (if given), the
    images are re-encoded to `images` (a shrink_images plan), and `numbers` (a dict, or a function
    returning one) joins the report together with what the file really holds."""
    inner = type(a).finish

    def finish(out_path, work_dir, bake=True):
        report = inner(a, out_path, work_dir, bake)
        if root:
            reroot(out_path, root)
        if images:
            report['images'] = shrink_images(out_path, images)
        report.update(numbers() if callable(numbers) else (numbers or {}))
        report.update(glb_numbers(out_path))
        return report

    a.finish = finish


# --- materials and meshes shared by the assets ---------------------------------------------------------

def image_material(name, color_path, roughness=0.9, metallic=0.0, vertex_colors=False):
    """A cutout material (name it cutout or cutout_<what>): colour and alpha from an image with its
    own UVs; with vertex_colors the mesh's colour attribute 'Color' multiplies the colour."""
    mat, tree, shader = sf._principled(name)
    node = tree.nodes.new('ShaderNodeTexImage')
    node.image = bpy.data.images.load(color_path, check_existing=True)
    colour = node.outputs['Color']
    if vertex_colors:
        attribute = tree.nodes.new('ShaderNodeVertexColor')
        attribute.layer_name = 'Color'
        mix = tree.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = 1.0
        tree.links.new(colour, mix.inputs[6])
        tree.links.new(attribute.outputs['Color'], mix.inputs[7])
        colour = mix.outputs[2]
    tree.links.new(colour, shader.inputs['Base Color'])
    tree.links.new(node.outputs['Alpha'], shader.inputs['Alpha'])
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    mat.use_backface_culling = False
    return mat


class Sheet:
    """Collects quads with their own UVs (Blender UVs: v up) and turns them into one mesh."""

    def __init__(self):
        self.quads = []

    def quad(self, points, u, v):
        """points: bottom-left, bottom-right, top-right, top-left; u and v are (low, high) in the image
        (v measured from the TOP of the image, as the texture layouts are written)."""
        self.quads.append((points, ((u[0], 1 - v[1]), (u[1], 1 - v[1]), (u[1], 1 - v[0]), (u[0], 1 - v[0]))))

    def mesh(self, name, material, uv_name='UVMap'):
        verts = [p for points, _ in self.quads for p in points]
        obj = mk.mesh_object(name, verts, [tuple(range(4 * i, 4 * i + 4)) for i in range(len(self.quads))])
        layer = obj.data.uv_layers.new(name=uv_name)
        flat = [uv for _, uvs in self.quads for uv in uvs]
        for loop in obj.data.loops:
            layer.data[loop.index].uv = flat[loop.vertex_index]
        return mk.assign(obj, material)


def periodic_field(rng, waves=3, terms=6):
    """A smooth pseudo-random function f(u, v) -> about -1..1 that is periodic over 0..1 in u and v."""
    parts = [(rng.integers(1, waves + 1), rng.integers(-waves, waves + 1), rng.uniform(0, TAU), rng.uniform(0.5, 1.0)) for _ in range(terms)]
    total = sum(p[3] for p in parts)

    def field(u, v):
        return sum(a * math.sin(TAU * (i * u + j * v) + phase) for i, j, phase, a in parts) / total * 1.8

    return field


def net_source(size=3.0, mesh=0.1, cord=0.006, cover=0.42, seed=5):
    """Real geometry of a camouflage net over x 0..size, y 0..size, periodic: a knotted square mesh
    of cords and scrim garnish (strips and ragged patches) in two greens and a brown, clustered so
    that irregular holes stay open. Returns one mesh object and its source materials."""
    rng = np.random.default_rng(seed)
    cord_graph = Graph('net_cord', (size, size), source='object')
    cord_graph.finish(cord_graph.mix(cord_graph.noise(9.0, 2.0).ramp(0.35, 0.7), Graph.rgb('#2a2c1f'), Graph.rgb('#4a4732')), 0.95)
    palette = []
    for index, (dark, light) in enumerate((('#2c3a22', '#465633'), ('#4f5a36', '#75804f'), ('#4a3a26', '#6f5a3c'))):
        g = Graph('net_scrim_%d' % index, (size, size), source='object')
        weave = g.noise(60.0, 2.0, 0.6, (1.0, 6.0)).ramp(0.3, 0.7)
        fade = g.noise(2.5, 3.0).ramp(0.3, 0.75)
        colour = g.mix(fade, Graph.rgb(dark), Graph.rgb(light))
        colour = g.tint(colour, weave.ramp(0.0, 1.0, 0.78, 1.05))
        palette.append(g.finish(colour, 0.95))
    parts = []
    count = round(size / mesh)
    for k in range(count):
        t = (k + 0.5) * mesh
        wobble = [0.006 * math.sin(i * 1.7 + k) for i in range(count * 2 + 5)]
        steps = [(-2 + i) * mesh * 0.5 for i in range(count * 2 + 5)]
        parts.append(mk.assign(mk.tube('cord_x', [(s, t + w, 0.004) for s, w in zip(steps, wobble)], cord, 5), cord_graph.mat))
        parts.append(mk.assign(mk.tube('cord_y', [(t + w, s, 0.008) for s, w in zip(steps, wobble)], cord, 5), cord_graph.mat))
    cluster, tone = periodic_field(rng, 3, 7), periodic_field(rng, 2, 5)
    target, covered, tries = cover * size * size, 0.0, 0
    faces, verts, slots = [], [], []
    while covered < target and tries < 20000:
        tries += 1
        u, v = rng.random(), rng.random()
        if cluster(u, v) + rng.normal(0.0, 0.25) < 0.05:
            continue
        angle = rng.uniform(0, TAU)
        if rng.random() < 0.55:      # a scrim strip tied in at its middle
            length, width = rng.uniform(0.3, 0.6), rng.uniform(0.05, 0.09)
            outline = [(-0.5 * length, -0.5 * width), (0.0, -0.32 * width), (0.5 * length, -0.5 * width),
                       (0.5 * length, 0.5 * width), (0.0, 0.32 * width), (-0.5 * length, 0.5 * width)]
            area = length * width * 0.85
        else:                         # a ragged leaf patch
            radius = rng.uniform(0.09, 0.2)
            corners = int(rng.integers(7, 11))
            outline = [(math.cos(TAU * i / corners) * radius * rng.uniform(0.55, 1.15), math.sin(TAU * i / corners) * radius * rng.uniform(0.55, 1.15))
                       for i in range(corners)]
            area = 2.2 * radius * radius
        choice = tone(u, v) + rng.normal(0.0, 0.3)
        slot = 0 if choice < -0.15 else (1 if choice < 0.45 else 2)
        z, tilt = rng.uniform(0.012, 0.05), rng.uniform(-0.12, 0.12)
        c, s = math.cos(angle), math.sin(angle)
        for du in (-1, 0, 1):
            for dv in (-1, 0, 1):
                cx, cy = (u + du) * size, (v + dv) * size
                if not (-0.7 < cx < size + 0.7 and -0.7 < cy < size + 0.7):
                    continue
                start = len(verts)
                verts += [(cx + px * c - py * s, cy + px * s + py * c, z + tilt * px) for px, py in outline]
                faces.append(tuple(range(start, start + len(outline))))
                slots.append(slot)
        covered += area
    scrim = mk.mesh_object('scrim', verts, faces)
    for material in palette:
        scrim.data.materials.append(material)
    for poly, slot in zip(scrim.data.polygons, slots):
        poly.material_index = slot
    return mk.join('net_source', parts + [scrim])


def net_texture(path, size=3.0, pixels=512, seed=5, cover=0.42):
    """Bakes the net tile (colour with its own shading, alpha = coverage) and saves it as a PNG.
    Returns (path, numbers): open share at the game's alpha test, seam errors."""
    source = net_source(size, seed=seed, cover=cover)
    card = bake_card(source, (size, size), (pixels, pixels))
    bpy.data.objects.remove(source, do_unlink=True)
    colour = to_bytes(srgb(bleed(lit(card, 0.6, 0.25), card['alpha'])))
    alpha = to_bytes(card['alpha'])
    save_png(np.dstack([colour, alpha]), path)
    numbers = {'net_open': round(float((alpha < 128).mean()), 3), 'net_seam': seam_error(alpha), 'net_tile_m': size}
    return path, numbers


def draped_sheet(name, grid, uv_scale, shade=None):
    """A net surface through a grid of points (rows of equal length) with UVs in metres / uv_scale
    measured along the surface, smooth shaded, and a colour attribute 'Color' from shade(row, column, point)."""
    rows, columns = len(grid), len(grid[0])
    run = []
    for row in grid:
        total = [0.0]
        for p, q in zip(row, row[1:]):
            total.append(total[-1] + math.dist(p, q))
        run.append(total)
    verts = [p for row in grid for p in row]
    faces = [(r * columns + c, r * columns + c + 1, (r + 1) * columns + c + 1, (r + 1) * columns + c)
             for r in range(rows - 1) for c in range(columns - 1)]
    obj = mk.mesh_object(name, verts, faces)
    layer = obj.data.uv_layers.new(name='atlas')
    middle = columns // 2
    for loop in obj.data.loops:
        r, c = divmod(loop.vertex_index, columns)
        layer.data[loop.index].uv = ((run[r][c] - run[r][middle]) / uv_scale, grid[r][c][1] / uv_scale)
    if shade is not None:
        colours = obj.data.color_attributes.new('Color', 'BYTE_COLOR', 'CORNER')
        for loop in obj.data.loops:
            r, c = divmod(loop.vertex_index, columns)
            value = shade(r, c, grid[r][c])
            colours.data[loop.index].color = (value[0], value[1], value[2], 1.0)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj
