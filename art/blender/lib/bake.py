"""Cycles bakes into numpy maps, one atlas for all of an asset's meshes.

bake_maps() renders these passes over the packed UVs and returns them as float arrays:

    base        linear RGB base colour (through an emission shader, so metals bake correctly)
    alpha       material alpha times the coverage of the high-detail source, for cut-outs
    roughness, metallic
    emission    emission colour, divided by each material's strength so it stores 0..1
    normal      tangent-space normals: the material's bump, an optional bevel that rounds every
                hard edge, and the surface of a high-detail source mesh when a target has one
    occlusion   ambient occlusion with the whole asset (and the ground) in place
    coverage    which texels belong to a face

Sample counts follow the machine (scene.quality): cheap on this CPU, fine on the GPU machine.
Bakes are not denoised by Cycles, so occlusion gets enough samples plus a light masked blur.
"""
from dataclasses import dataclass, field

import bpy
import numpy as np

from . import build, naming, scene, textures
from .materials import nodes as material_nodes


@dataclass
class BakeSettings:
    """What an asset can tune; the defaults suit a prop on the pavement."""
    size: int = 1024                  # atlas edge in pixels
    color_samples: int = 0            # 0 = by machine: 8 on CPU, 64 on GPU
    normal_samples: int = 0           # 0 = by machine: 8 on CPU, 64 on GPU
    occlusion_samples: int = 0        # 0 = by machine: 32 on CPU, 256 on GPU
    occlusion_distance: float = 0.6   # metres an occluder may be away and still darken
    occlusion_ground: bool = True     # a ground plane at Z = 0 shades the asset's foot
    bevel_radius: float = 0.0         # metres: rounds hard edges in the normal map; 0 = off
    bevel_samples: int = 6
    cage_extrusion: float = 0.03      # metres the rays start outside a low-detail target
    max_ray_distance: float = 0.0     # metres a ray may travel to the source; 0 = no limit
    emission_divisors: dict = field(default_factory=dict)   # material name -> strength

    def samples(self, which):
        chosen = getattr(self, f'{which}_samples')
        if chosen:
            return chosen
        return {'color': scene.quality(8, 64), 'normal': scene.quality(8, 64),
                'occlusion': scene.quality(32, 256)}[which]


@dataclass
class BakeTarget:
    """A game mesh to bake, and the high-detail meshes it takes its surface from (if any)."""
    obj: bpy.types.Object
    sources: list = field(default_factory=list)


class _Rewire:
    """Temporary changes to a material's node tree, undone by restore()."""

    def __init__(self, material):
        self.material = material
        self.tree = material.node_tree
        self.bsdf, self.output = material_nodes.principled(material)
        self.added = []
        self.saved_links = []
        self.saved_values = []

    def add(self, kind, **properties):
        node = self.tree.nodes.new(kind)
        for key, value in properties.items():
            setattr(node, key, value)
        self.added.append(node)
        return node

    def source(self, input_name):
        """The socket feeding a Principled input, or its constant value."""
        socket = self.bsdf.inputs[input_name]
        if socket.is_linked:
            return socket.links[0].from_socket
        value = socket.default_value
        return tuple(value) if hasattr(value, '__len__') else float(value)

    def feed(self, socket, value):
        if isinstance(value, bpy.types.NodeSocket):
            self.tree.links.new(value, socket)
        elif isinstance(value, float):
            socket.default_value = (value, value, value, 1.0) if socket.type == 'RGBA' else value
        else:
            socket.default_value = value if socket.type == 'RGBA' else value[0]

    def relink(self, socket, new_source):
        """Points an input at another output, remembering what fed it before."""
        previous = socket.links[0].from_socket if socket.is_linked else None
        self.saved_links.append((socket, previous))
        self.tree.links.new(new_source, socket)

    def set_output(self, shader_socket):
        self.relink(self.output.inputs['Surface'], shader_socket)

    def set_value(self, socket, value):
        self.saved_values.append((socket, tuple(socket.default_value)))
        socket.default_value = value

    def restore(self):
        for socket, previous in reversed(self.saved_links):
            for link in list(socket.links):
                self.tree.links.remove(link)
            if previous is not None:
                self.tree.links.new(previous, socket)
        for socket, value in self.saved_values:
            socket.default_value = value
        for node in self.added:
            self.tree.nodes.remove(node)


def _emit(rewire, color=None, strength=1.0):
    """Routes a colour (socket or constant) straight to the surface through an Emission node."""
    emission = rewire.add('ShaderNodeEmission')
    rewire.feed(emission.inputs['Color'], color)
    rewire.feed(emission.inputs['Strength'], strength)
    rewire.set_output(emission.outputs[0])


def _prepare_base(rewire, settings):
    paint = rewire.tree.nodes.get(material_nodes.PAINT_NODE)
    if paint is not None and naming.material_role(rewire.material.name) == naming.ROLE_PAINT:
        rewire.set_value(paint.outputs[0], (1.0, 1.0, 1.0, 1.0))
    _emit(rewire, rewire.source('Base Color'))


def _prepare_surface(rewire, settings):
    combine = rewire.add('ShaderNodeCombineColor')
    for socket, name in zip(combine.inputs, ('Roughness', 'Metallic', 'Alpha')):
        value = rewire.source(name)
        if isinstance(value, bpy.types.NodeSocket):
            rewire.tree.links.new(value, socket)
        else:
            socket.default_value = value
    _emit(rewire, combine.outputs[0])


def _prepare_emission(rewire, settings):
    divisor = max(settings.emission_divisors.get(rewire.material.name, 1.0), 1e-6)
    strength = rewire.source('Emission Strength')
    if isinstance(strength, bpy.types.NodeSocket):
        scale = rewire.add('ShaderNodeMath', operation='MULTIPLY')
        rewire.tree.links.new(strength, scale.inputs[0])
        scale.inputs[1].default_value = 1.0 / divisor
        strength = scale.outputs[0]
    else:
        strength = strength / divisor
    _emit(rewire, rewire.source('Emission Color'), strength)


def _prepare_normal(rewire, settings):
    radius = rewire.material.get('mz_bevel_radius', settings.bevel_radius)
    if radius <= 0:
        return
    bevel = rewire.add('ShaderNodeBevel', samples=settings.bevel_samples)
    bevel.inputs['Radius'].default_value = radius
    socket = rewire.bsdf.inputs['Normal']
    while socket.is_linked:
        node = socket.links[0].from_node
        if 'Normal' not in node.inputs:
            return
        socket = node.inputs['Normal']
    rewire.relink(socket, bevel.outputs[0])


def _prepare_occlusion(rewire, settings):
    # A plain shader keeps the occlusion pass cheap; glass must not shade what is behind it.
    glass = naming.material_role(rewire.material.name) == naming.ROLE_GLASS
    shader = rewire.add('ShaderNodeBsdfTransparent' if glass else 'ShaderNodeBsdfDiffuse')
    rewire.set_output(shader.outputs[0])


def has_emission(material):
    """True when a material emits light (a linked or non-zero strength and colour)."""
    bsdf, _output = material_nodes.principled(material)
    strength, color = bsdf.inputs['Emission Strength'], bsdf.inputs['Emission Color']
    lit = strength.is_linked or strength.default_value > 0.0
    coloured = color.is_linked or max(color.default_value[:3]) > 0.0
    return lit and coloured


def bake_maps(targets, settings, every_material=False):
    """Bakes every pass for the targets into one atlas; returns a dict of float32 arrays.

    Faces whose material is not part of the atlas (glass and tile roles) are left out, unless
    every_material is set (bake_tile() bakes a tile material that way).
    """
    render = bpy.context.scene
    size = settings.size
    image = bpy.data.images.new('mz_bake_target', size, size, alpha=True, float_buffer=True,
                                is_data=True)
    low_materials = _materials_of([target.obj for target in targets])
    shaded = _materials_of([target.obj for target in targets if not target.sources]
                           + [source for target in targets for source in target.sources])
    # Cycles bakes every face of a target into its material's active image. Faces that are not
    # part of the atlas get a throw-away image, so they cannot paint over other islands.
    discard = bpy.data.images.new('mz_bake_discard', 8, 8, alpha=True, float_buffer=True,
                                  is_data=True)
    image_nodes = []
    for material in low_materials:
        node = material.node_tree.nodes.new('ShaderNodeTexImage')
        unbaked = not every_material and naming.material_role(material.name) in (
            naming.ROLE_GLASS, naming.ROLE_TILE)
        node.image = discard if unbaked else image
        material.node_tree.nodes.active = node
        image_nodes.append((material, node))

    ground = None
    if settings.occlusion_ground:
        ground = build.grid('mz_bake_ground', size=(60.0, 60.0), location=(0.0, 0.0, -0.002))
    if render.world is None:
        render.world = bpy.data.worlds.new('mz_bake_world')
    render.world.light_settings.distance = settings.occlusion_distance

    emissive = any(has_emission(material) for material in shaded)
    passes = [('base', 'EMIT', _prepare_base, 'color'),
              ('surface', 'EMIT', _prepare_surface, 'color'),
              ('normal', 'NORMAL', _prepare_normal, 'normal'),
              ('occlusion', 'AO', _prepare_occlusion, 'occlusion')]
    if emissive:
        passes.append(('emission', 'EMIT', _prepare_emission, 'color'))

    raw = {}
    try:
        for name, bake_type, prepare, sample_kind in passes:
            rewires = []
            for material in shaded:
                rewire = _Rewire(material)
                prepare(rewire, settings)
                rewires.append(rewire)
            render.cycles.samples = settings.samples(sample_kind)
            if ground is not None:
                ground.hide_render = name != 'occlusion'
            try:
                raw[name] = _bake_pass(image, bake_type, targets, settings)
            finally:
                for rewire in rewires:
                    rewire.restore()
    finally:
        for material, node in image_nodes:
            material.node_tree.nodes.remove(node)
        bpy.data.images.remove(image)
        bpy.data.images.remove(discard)
        if ground is not None:
            scene.delete(ground)

    return _assemble(raw, emissive)


def _materials_of(objects):
    """The distinct materials used by a list of objects."""
    found = []
    for obj in objects:
        for slot in obj.material_slots:
            if slot.material is not None and slot.material not in found:
                found.append(slot.material)
    return found


def _bake_pass(image, bake_type, targets, settings):
    """Runs one bake type for all targets into the cleared image and returns its pixels."""
    size = image.size[0]
    image.pixels.foreach_set(np.zeros(size * size * 4, dtype=np.float32))
    options = dict(type=bake_type, margin=0, use_clear=False, normal_space='TANGENT',
                   target='IMAGE_TEXTURES')
    plain = [target.obj for target in targets if not target.sources]
    if plain:
        scene.activate(plain[0], plain[1:])
        bpy.ops.object.bake(use_selected_to_active=False, **options)
    for target in targets:
        if not target.sources:
            continue
        scene.activate(target.obj, target.sources)
        bpy.ops.object.bake(use_selected_to_active=True, cage_extrusion=settings.cage_extrusion,
                            max_ray_distance=settings.max_ray_distance, **options)
    pixels = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(size, size, 4)


def _assemble(raw, emissive):
    """Turns the raw passes into filled, named maps."""
    coverage = raw['base'][..., 3] > 0.5
    surface_cover = raw['surface'][..., 3] > 0.5
    maps = {'coverage': coverage.astype(np.float32)}
    maps['base'] = textures.fill_margins(raw['base'][..., :3], coverage)
    surface = textures.fill_margins(raw['surface'][..., :3], surface_cover)
    maps['roughness'] = np.clip(surface[..., 0], 0.03, 1.0)
    maps['metallic'] = np.clip(surface[..., 1], 0.0, 1.0)
    maps['alpha'] = np.clip(raw['surface'][..., 2], 0.0, 1.0) * surface_cover
    normal_cover = raw['normal'][..., 3] > 0.5
    flat = np.broadcast_to(np.array([0.5, 0.5, 1.0], dtype=np.float32), raw['normal'][..., :3].shape)
    normal = np.where(normal_cover[..., None], raw['normal'][..., :3], flat)
    maps['normal'] = textures.normalize_normals(textures.fill_margins(normal, normal_cover))
    occlusion_cover = raw['occlusion'][..., 3] > 0.5
    occlusion = textures.smooth(raw['occlusion'][..., :1], occlusion_cover, passes=1)
    maps['occlusion'] = np.clip(textures.fill_margins(occlusion, occlusion_cover)[..., 0], 0.0, 1.0)
    if emissive:
        emission_cover = raw['emission'][..., 3] > 0.5
        maps['emission'] = np.clip(textures.fill_margins(raw['emission'][..., :3], emission_cover),
                                   0.0, 1.0)
    return maps


def bake_tile(material, size, pixels, settings, facing='wall'):
    """Bakes a material as a repeating texture set: one flat square `size` metres across,
    `pixels` texels wide, made seamless by cross-fading its borders. Returns the maps.

    facing 'wall' bakes an upright square well above the ground (rain streaks run down it,
    nothing settles on it); 'floor' bakes a level one (dust settles on it). Patterns with
    courses (brick, tiles, planks) stay aligned across the seam when half the tile is a whole
    number of courses: a 2 m tile takes 0.25 m bricks in 0.0625 m rows, or 0.5 m slabs.
    """
    from dataclasses import replace

    from . import uv
    if facing == 'floor':
        swatch = build.grid('mz_tile_swatch', size=(size, size), location=(0.0, 0.0, 200.0))
    else:
        swatch = build.card('mz_tile_swatch', width=size, height=size, location=(0.0, 0.0, 200.0))
    swatch.data.materials.append(material)
    uv.fit_uvs(swatch, (0.0, 0.0, 1.0, 1.0))
    tile_settings = replace(settings, size=pixels, occlusion_ground=False, bevel_radius=0.0)
    try:
        maps = bake_maps([BakeTarget(swatch)], tile_settings, every_material=True)
    finally:
        scene.delete(swatch)
    result = {'occlusion': np.ones((pixels, pixels), dtype=np.float32)}
    result['base'] = textures.make_tileable(maps['base'])
    result['roughness'] = textures.make_tileable(maps['roughness'][..., None])[..., 0]
    result['metallic'] = textures.make_tileable(maps['metallic'][..., None])[..., 0]
    result['normal'] = textures.normalize_normals(textures.make_tileable(maps['normal']))
    return result
