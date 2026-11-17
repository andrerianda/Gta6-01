"""Graph: a small wrapper around a material's node tree that makes procedural materials short to
write. Every helper returns an output socket, and every argument may be a constant (number or
colour tuple) or a socket from an earlier helper.

All patterns are driven by object coordinates, so a pattern scale is "features per metre" and a
material looks the same on every mesh and across UV seams. The seed moves every texture to a
different place in its (infinite) pattern.
"""
import random

import bpy

BSDF = 'Principled BSDF'
PAINT_NODE = 'paint_color'


def rgba(color, alpha=1.0):
    """A 4-tuple from an RGB or RGBA colour (linear values, as Blender uses everywhere)."""
    color = tuple(color)
    return color if len(color) == 4 else (color[0], color[1], color[2], alpha)


def srgb(red, green, blue):
    """A linear RGB tuple from sRGB 0..1 components (what a colour picker or hex code shows)."""
    def to_linear(value):
        return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4
    return (to_linear(red), to_linear(green), to_linear(blue))


def hex_color(code):
    """A linear RGB tuple from an sRGB hex code such as '#e8c39a'."""
    code = code.lstrip('#')
    return srgb(int(code[0:2], 16) / 255.0, int(code[2:4], 16) / 255.0, int(code[4:6], 16) / 255.0)


def tile(material, size=2.0, pixels=512, facing='wall'):
    """Sets how a material named tile_<name> is baked as a tiling surface: instead of going
    into the asset's atlas it is baked once on a flat square `size` metres across into its own
    `pixels` x `pixels` texture set, which repeats over its faces. facing is 'wall' (an
    upright square) or 'floor' (a level one). Returns the material."""
    material['mz_tile_size'] = float(size)
    material['mz_tile_pixels'] = int(pixels)
    material['mz_tile_facing'] = facing
    return material


def principled(material):
    """The (Principled BSDF, Material Output) nodes of a material, created if they are missing."""
    tree = material.node_tree
    output = next((node for node in tree.nodes if node.bl_idname == 'ShaderNodeOutputMaterial'),
                  None)
    if output is None:
        output = tree.nodes.new('ShaderNodeOutputMaterial')
    bsdf = next((node for node in tree.nodes if node.bl_idname == 'ShaderNodeBsdfPrincipled'), None)
    if bsdf is None:
        bsdf = tree.nodes.new('ShaderNodeBsdfPrincipled')
        tree.links.new(bsdf.outputs[0], output.inputs['Surface'])
    return bsdf, output


def socket(sockets, identifier):
    """A node socket by identifier (names repeat on Mix and Map Range nodes; identifiers do not)."""
    for candidate in sockets:
        if candidate.identifier == identifier:
            return candidate
    raise KeyError(identifier)


class Graph:
    """A new node material with a Principled BSDF, plus helpers to wire procedural textures."""

    def __init__(self, name, seed=0):
        self.material = bpy.data.materials.new(name)
        self.material.use_backface_culling = True
        self.tree = self.material.node_tree
        self.nodes = self.tree.nodes
        self.links = self.tree.links
        self.bsdf, self.output = principled(self.material)
        self.random = random.Random(seed * 7919 + 13)
        self.seed = seed
        self._coordinates = None
        self._geometry = None
        self._column = 0

    # -- plumbing -----------------------------------------------------------------------------

    def node(self, kind, **properties):
        """Adds a node of a Blender type name and sets properties on it."""
        node = self.nodes.new(kind)
        self._column += 1
        node.location = (-220 * (1 + self._column % 9), 300 - 180 * (self._column // 9))
        for key, value in properties.items():
            setattr(node, key, value)
        return node

    def feed(self, socket, value):
        """Connects a socket, or sets a constant, on a node input."""
        if value is None:
            return
        if isinstance(value, bpy.types.NodeSocket):
            self.links.new(value, socket)
        elif isinstance(value, (int, float)):
            if socket.type in ('RGBA',):
                socket.default_value = (value, value, value, 1.0)
            elif socket.type == 'VECTOR':
                socket.default_value = (value, value, value)
            else:
                socket.default_value = value
        else:
            value = tuple(value)
            if socket.type == 'RGBA':
                socket.default_value = rgba(value)
            elif socket.type == 'VECTOR':
                socket.default_value = value[:3]
            else:
                socket.default_value = value[0]

    def random_offset(self, spread=100.0):
        """A random 3D offset that differs for every call and every seed."""
        return tuple(self.random.uniform(-spread, spread) for _ in range(3))

    # -- coordinates --------------------------------------------------------------------------

    def object_coords(self):
        """Object-space position in metres (the default vector of every texture helper)."""
        if self._coordinates is None:
            self._coordinates = self.node('ShaderNodeTexCoord')
        return self._coordinates.outputs['Object']

    def uv_coords(self):
        """The mesh's UV coordinates (use for decals and labels placed by UV, not for patterns)."""
        self.object_coords()
        return self._coordinates.outputs['UV']

    def geometry(self, output='Position'):
        """An output of the Geometry node: 'Normal', 'True Normal', 'Position', 'Pointiness'."""
        if self._geometry is None:
            self._geometry = self.node('ShaderNodeNewGeometry')
        return self._geometry.outputs[output]

    def mapped(self, vector=None, scale=1.0, offset=None, rotation=(0.0, 0.0, 0.0)):
        """Coordinates scaled, rotated (XYZ radians) and moved; a random offset by default."""
        node = self.node('ShaderNodeMapping')
        self.links.new(vector if vector is not None else self.object_coords(), node.inputs['Vector'])
        scale = (scale, scale, scale) if isinstance(scale, (int, float)) else tuple(scale)
        node.inputs['Scale'].default_value = scale
        node.inputs['Rotation'].default_value = rotation
        node.inputs['Location'].default_value = self.random_offset() if offset is None else offset
        return node.outputs['Vector']

    def axis(self, name='Z', vector=None):
        """One component ('X', 'Y' or 'Z') of a vector (object coordinates by default)."""
        node = self.node('ShaderNodeSeparateXYZ')
        self.links.new(vector if vector is not None else self.object_coords(), node.inputs[0])
        return node.outputs[name.upper()]

    def wall_coords(self):
        """Coordinates for coursed patterns (brick, tiles, planks) on any face: X runs along a
        wall whatever way it faces and Y is height; on floors and roofs they are plain X and Y."""
        position = self.object_coords()
        normal = self.geometry('True Normal')
        px, py, pz = (self.axis(name, position) for name in 'XYZ')
        nx, ny, nz = (self.axis(name, normal) for name in 'XYZ')
        along = self.sub(self.mul(py, nx), self.mul(px, ny))
        is_floor = self.math('GREATER_THAN', self.math('ABSOLUTE', nz), 0.7)
        return self.combine(self.mix_value(is_floor, along, px), self.mix_value(is_floor, pz, py))

    def combine(self, x=0.0, y=0.0, z=0.0):
        """A vector from three values."""
        node = self.node('ShaderNodeCombineXYZ')
        for socket, value in zip(node.inputs, (x, y, z)):
            self.feed(socket, value)
        return node.outputs[0]

    # -- textures -----------------------------------------------------------------------------

    def noise(self, scale=5.0, detail=4.0, roughness=0.55, distortion=0.0, stretch=None,
              vector=None, color=False, lacunarity=2.0):
        """Fractal noise, 0..1 with a mean near 0.5. `stretch` scales the pattern per axis:
        (1, 1, 0.1) gives streaks along Z."""
        node = self.node('ShaderNodeTexNoise', noise_dimensions='3D')
        node.normalize = True
        self.links.new(self.mapped(vector, scale=stretch or 1.0), node.inputs['Vector'])
        self.feed(node.inputs['Scale'], scale)
        self.feed(node.inputs['Detail'], detail)
        self.feed(node.inputs['Roughness'], roughness)
        self.feed(node.inputs['Lacunarity'], lacunarity)
        self.feed(node.inputs['Distortion'], distortion)
        return node.outputs['Color' if color else 'Factor']

    def voronoi(self, scale=5.0, feature='F1', output='Distance', randomness=1.0, stretch=None,
                vector=None, smoothness=0.0):
        """Voronoi cells: output 'Distance' (0 at cell centres, or to the edge with feature
        'DISTANCE_TO_EDGE'), 'Color' (a random colour per cell) or 'Position'."""
        node = self.node('ShaderNodeTexVoronoi', voronoi_dimensions='3D', feature=feature)
        self.links.new(self.mapped(vector, scale=stretch or 1.0), node.inputs['Vector'])
        self.feed(node.inputs['Scale'], scale)
        self.feed(node.inputs['Randomness'], randomness)
        if feature == 'SMOOTH_F1':
            self.feed(node.inputs['Smoothness'], smoothness)
        return node.outputs[output]

    def wave(self, period=0.1, distortion=0.0, detail=2.0, detail_scale=1.0, direction='X',
             rings=False, profile='SIN', vector=None, stretch=None):
        """Bands across `direction` (or rings around it) repeating every `period` metres, 0..1:
        corrugation, wood rings, ripples, cloth ribs. profile is 'SIN', 'SAW' or 'TRI'."""
        scale = 0.3141593 / period
        node = self.node('ShaderNodeTexWave', wave_type='RINGS' if rings else 'BANDS',
                         wave_profile=profile)
        if rings:
            node.rings_direction = direction
        else:
            node.bands_direction = direction
        self.links.new(self.mapped(vector, scale=stretch or 1.0, offset=(0.0, 0.0, 0.0)),
                       node.inputs['Vector'])
        self.feed(node.inputs['Scale'], scale)
        self.feed(node.inputs['Distortion'], distortion)
        self.feed(node.inputs['Detail'], detail)
        self.feed(node.inputs['Detail Scale'], detail_scale)
        return node.outputs['Factor']

    def brick(self, scale=1.0, brick_width=0.24, row_height=0.075, mortar=0.012, smooth=0.1,
              color1=(0.8, 0.8, 0.8), color2=(0.2, 0.2, 0.2), vector=None, offset=0.5):
        """Brick courses in metres on the vector's XY plane; returns (colour, mortar factor)."""
        node = self.node('ShaderNodeTexBrick', offset=offset)
        self.links.new(vector if vector is not None else self.object_coords(), node.inputs['Vector'])
        self.feed(node.inputs['Color1'], color1)
        self.feed(node.inputs['Color2'], color2)
        self.feed(node.inputs['Mortar'], (0.0, 0.0, 0.0))
        self.feed(node.inputs['Scale'], scale)
        self.feed(node.inputs['Mortar Size'], mortar)
        self.feed(node.inputs['Mortar Smooth'], smooth)
        self.feed(node.inputs['Brick Width'], brick_width)
        self.feed(node.inputs['Row Height'], row_height)
        return node.outputs['Color'], node.outputs['Factor']

    def white_noise(self, vector=None):
        """A random value 0..1 per distinct input vector (per brick, per cell, per plank)."""
        node = self.node('ShaderNodeTexWhiteNoise', noise_dimensions='3D')
        self.links.new(vector if vector is not None else self.object_coords(), node.inputs['Vector'])
        return node.outputs['Value']

    # -- arithmetic ---------------------------------------------------------------------------

    def math(self, operation, a, b=None, c=None, clamp=False):
        """A Math node: operation is Blender's name ('ADD', 'MULTIPLY', 'POWER', 'GREATER_THAN',
        'SMOOTH_MIN', 'ABSOLUTE', 'FRACT', 'SINE', ...)."""
        node = self.node('ShaderNodeMath', operation=operation, use_clamp=clamp)
        for socket, value in zip(node.inputs, (a, b, c)):
            self.feed(socket, value)
        return node.outputs[0]

    def add(self, a, b, clamp=False):
        return self.math('ADD', a, b, clamp=clamp)

    def sub(self, a, b, clamp=False):
        return self.math('SUBTRACT', a, b, clamp=clamp)

    def mul(self, a, b, clamp=False):
        return self.math('MULTIPLY', a, b, clamp=clamp)

    def power(self, a, b):
        return self.math('POWER', a, b)

    def maximum(self, a, b):
        return self.math('MAXIMUM', a, b)

    def minimum(self, a, b):
        return self.math('MINIMUM', a, b)

    def invert(self, a):
        return self.math('SUBTRACT', 1.0, a, clamp=True)

    def vector_math(self, operation, a, b=None):
        """A Vector Math node; DOT_PRODUCT and LENGTH return the value output."""
        node = self.node('ShaderNodeVectorMath', operation=operation)
        self.feed(node.inputs[0], a)
        if b is not None:
            self.feed(node.inputs[1], b)
        return node.outputs['Value' if operation in ('DOT_PRODUCT', 'LENGTH', 'DISTANCE') else 0]

    def remap(self, value, from_min=0.0, from_max=1.0, to_min=0.0, to_max=1.0, smooth=False):
        """Map Range, clamped: the workhorse for turning noise into a mask with a threshold."""
        node = self.node('ShaderNodeMapRange', clamp=True,
                         interpolation_type='SMOOTHSTEP' if smooth else 'LINEAR')
        self.feed(node.inputs['Value'], value)
        self.feed(node.inputs['From Min'], from_min)
        self.feed(node.inputs['From Max'], from_max)
        self.feed(node.inputs['To Min'], to_min)
        self.feed(node.inputs['To Max'], to_max)
        return node.outputs['Result']

    def mask(self, value, threshold=0.5, softness=0.05):
        """A 0..1 mask that turns on where `value` rises above `threshold`."""
        return self.remap(value, threshold - softness, threshold + softness, smooth=True)

    def ramp(self, factor, stops, interpolation='LINEAR'):
        """A colour ramp: stops is a list of (position, colour or grey value)."""
        node = self.node('ShaderNodeValToRGB')
        ramp = node.color_ramp
        ramp.interpolation = interpolation
        while len(ramp.elements) < len(stops):
            ramp.elements.new(0.5)
        for element, (position, color) in zip(ramp.elements, stops):
            element.position = position
            element.color = (color, color, color, 1.0) if isinstance(color, (int, float)) \
                else rgba(color)
        self.feed(node.inputs[0], factor)
        return node.outputs['Color']

    def mix(self, factor, a, b, blend='MIX'):
        """Mixes two colours: blend is 'MIX', 'MULTIPLY', 'OVERLAY', 'SCREEN', 'ADD', ..."""
        node = self.node('ShaderNodeMix', data_type='RGBA', blend_type=blend, clamp_factor=True)
        self.feed(socket(node.inputs, 'Factor_Float'), factor)
        self.feed(socket(node.inputs, 'A_Color'), a)
        self.feed(socket(node.inputs, 'B_Color'), b)
        return socket(node.outputs, 'Result_Color')

    def mix_value(self, factor, a, b):
        """Mixes two numbers."""
        node = self.node('ShaderNodeMix', data_type='FLOAT', clamp_factor=True)
        self.feed(socket(node.inputs, 'Factor_Float'), factor)
        self.feed(socket(node.inputs, 'A_Float'), a)
        self.feed(socket(node.inputs, 'B_Float'), b)
        return socket(node.outputs, 'Result_Float')

    def hsv(self, color, hue=0.5, saturation=1.0, value=1.0):
        """Shifts hue (0.5 = unchanged), saturation and value of a colour."""
        node = self.node('ShaderNodeHueSaturation')
        self.feed(node.inputs['Hue'], hue)
        self.feed(node.inputs['Saturation'], saturation)
        self.feed(node.inputs['Value'], value)
        self.feed(node.inputs['Color'], color)
        return node.outputs['Color']

    def vary(self, color, amount=0.08, scale=1.5, detail=3.0):
        """Breaks up a flat colour with large soft patches of lighter and darker value."""
        patches = self.noise(scale=scale, detail=detail)
        return self.hsv(color, value=self.remap(patches, 0.25, 0.75, 1.0 - amount, 1.0 + amount))

    def rgb(self, color, name=None):
        """A constant colour as a node of its own (named, so the pipeline can find and change it)."""
        node = self.node('ShaderNodeRGB')
        node.outputs[0].default_value = rgba(color)
        if name:
            node.name = name
            node.label = name
        return node.outputs[0]

    def paint_color(self, color):
        """The tintable colour of a paint-role material. The bake swaps it for white so the game
        can multiply any colour in; the exported material carries `color` as its default."""
        self.material['mz_paint_color'] = [float(component) for component in tuple(color)[:3]]
        return self.rgb(color, name=PAINT_NODE)

    # -- surface detail -----------------------------------------------------------------------

    def bump(self, height, strength=0.3, distance=0.005, normal=None):
        """A normal from a height value: `distance` is the real depth of the relief in metres."""
        node = self.node('ShaderNodeBump')
        self.feed(node.inputs['Strength'], strength)
        self.feed(node.inputs['Distance'], distance)
        self.feed(node.inputs['Height'], height)
        if normal is not None:
            self.links.new(normal, node.inputs['Normal'])
        return node.outputs['Normal']

    def facing_up(self, sharpness=2.0):
        """A 0..1 mask of how much the surface faces up (+Z): where dust and bleaching settle."""
        up = self.axis('Z', self.geometry('True Normal'))
        return self.power(self.remap(up, 0.0, 1.0), sharpness)

    def edges(self, radius=0.01, samples=6):
        """A 0..1 mask of exposed (convex) edges and corners within `radius` metres: where
        paint chips and metal polishes. Cycles only. It compares the surface normal with a
        rounded-off one, so thin sheets and plates work too, and drops inner corners."""
        bevel = self.node('ShaderNodeBevel', samples=samples)
        bevel.inputs['Radius'].default_value = radius
        facing = self.vector_math('DOT_PRODUCT', bevel.outputs['Normal'], self.geometry('Normal'))
        turned = self.remap(facing, 1.0, 0.80, 0.0, 1.0)
        hollow = self.node('ShaderNodeAmbientOcclusion', samples=4, inside=False, only_local=True)
        hollow.inputs['Distance'].default_value = radius
        return self.mul(turned, self.remap(hollow.outputs['AO'], 0.45, 0.75))

    def cavities(self, distance=0.05, samples=8):
        """A 0..1 mask of creases and corners where grime gathers (Cycles only)."""
        node = self.node('ShaderNodeAmbientOcclusion', samples=samples, inside=False,
                         only_local=False)
        node.inputs['Distance'].default_value = distance
        return self.invert(node.outputs['AO'])

    # -- output -------------------------------------------------------------------------------

    def surface(self, base_color=None, roughness=None, metallic=None, normal=None, alpha=None,
                emission_color=None, emission_strength=None, specular=None, coat=None,
                coat_roughness=None, transmission=None, ior=None, sheen=None, subsurface=None):
        """Feeds the Principled BSDF; anything left as None keeps its default. Returns the
        finished material."""
        inputs = self.bsdf.inputs
        self.feed(inputs['Base Color'], base_color)
        self.feed(inputs['Roughness'], roughness)
        self.feed(inputs['Metallic'], metallic)
        self.feed(inputs['Alpha'], alpha)
        self.feed(inputs['Emission Color'], emission_color)
        self.feed(inputs['Emission Strength'], emission_strength)
        self.feed(inputs['Specular IOR Level'], specular)
        self.feed(inputs['Coat Weight'], coat)
        self.feed(inputs['Coat Roughness'], coat_roughness)
        self.feed(inputs['Transmission Weight'], transmission)
        self.feed(inputs['IOR'], ior)
        self.feed(inputs['Sheen Weight'], sheen)
        self.feed(inputs['Subsurface Weight'], subsurface)
        if normal is not None:
            self.links.new(normal, inputs['Normal'])
        return self.material
