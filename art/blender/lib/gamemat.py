"""From procedural source materials to the final game materials.

plan() looks at the materials on the bake targets and decides which game material each becomes
(by role, see naming.py). After the bake, make_textures() turns the baked maps into 8-bit
textures and build() creates one game material per group and swaps them onto the meshes:
atlas, paint, lamp and cutout materials all share the asset's atlas textures; each tile
material has a repeating texture set of its own; glass has none. Role settings the game needs
travel as custom properties, which the exporter writes as glTF extras and export.py also
applies to the standard glTF material fields:

    role                'atlas', 'paint', 'glass', 'lamp', 'cutout' or 'tile'
    paint_color         the default tint of a paint material (linear RGB)
    emissive_strength   the lit brightness of a lamp or glowing surface
    opacity             the opacity of glass
    tile_size           the size in metres one repeat of a tile material covers
"""
import os
from dataclasses import dataclass, field

import bpy
import numpy as np

from . import bake, naming, textures
from .materials import nodes as material_nodes

OCCLUSION_GROUP = 'glTF Material Output'
ATLAS = 'atlas'


@dataclass
class Group:
    """One final game material and the source materials baked into it."""
    name: str
    role: str
    sources: list = field(default_factory=list)
    emissive_strength: float = 0.0
    emission_color: tuple = (0.0, 0.0, 0.0)
    emission_textured: bool = False
    paint_color: tuple = (1.0, 1.0, 1.0)
    opacity: float = 1.0
    tint: tuple = (1.0, 1.0, 1.0)
    roughness: float = 0.05
    coat: float = 0.0
    coat_roughness: float = 0.03
    double_sided: bool = False
    tile_size: float = 2.0
    tile_pixels: int = 512
    tile_facing: str = 'wall'
    material: bpy.types.Material = None

    @property
    def texture_key(self):
        """Which texture set the group's material reads: the atlas, or its own tile set."""
        return self.name if self.role == naming.ROLE_TILE else ATLAS


def plan(objects):
    """Groups the source materials on the objects into final game materials by role."""
    groups = {}
    for obj in objects:
        for slot in obj.material_slots:
            source = slot.material
            if source is None:
                raise ValueError(f'{obj.name}: a material slot is empty; every face needs a material')
            role = naming.material_role(source.name)
            name = naming.ROLE_ATLAS if role == naming.ROLE_ATLAS else naming.base_name(source.name)
            group = groups.setdefault(name, Group(name=name, role=role))
            if source in group.sources:
                continue
            group.sources.append(source)
            bsdf, _output = material_nodes.principled(source)
            if bake.has_emission(source):
                strength = bsdf.inputs['Emission Strength']
                value = source.get('mz_emissive_strength',
                                   1.0 if strength.is_linked else strength.default_value)
                group.emissive_strength = max(group.emissive_strength, float(value))
                color = bsdf.inputs['Emission Color']
                group.emission_color = tuple(color.default_value[:3])
                if color.is_linked or strength.is_linked or role == naming.ROLE_ATLAS:
                    group.emission_textured = True
            if role == naming.ROLE_PAINT:
                group.paint_color = tuple(source.get('mz_paint_color', (1.0, 1.0, 1.0)))
                coat = bsdf.inputs['Coat Weight']
                group.coat = 0.0 if coat.is_linked else float(coat.default_value)
                group.coat_roughness = float(bsdf.inputs['Coat Roughness'].default_value)
            if role == naming.ROLE_GLASS:
                group.opacity = float(source.get('mz_opacity', 0.35))
                group.tint = tuple(source.get('mz_tint', bsdf.inputs['Base Color'].default_value[:3]))
                group.roughness = float(bsdf.inputs['Roughness'].default_value)
                group.double_sided = not source.use_backface_culling
            if role == naming.ROLE_CUTOUT:
                group.double_sided = True
            if role == naming.ROLE_TILE:
                group.tile_size = float(source.get('mz_tile_size', 2.0))
                group.tile_pixels = int(source.get('mz_tile_pixels', 512))
                group.tile_facing = source.get('mz_tile_facing', 'wall')
    return list(groups.values())


def in_atlas(material):
    """True for a source material whose faces are baked into the atlas (not glass, not tile)."""
    return naming.material_role(material.name) not in (naming.ROLE_GLASS, naming.ROLE_TILE)


def emission_divisors(groups):
    """Material name -> the strength its emission is divided by in the bake (its group's)."""
    return {source.name: group.emissive_strength for group in groups for source in group.sources
            if group.emissive_strength > 0.0}


def tile_sizes(groups):
    """Source material name -> tile size in metres, for the tile groups."""
    return {source.name: group.tile_size for group in groups for source in group.sources
            if group.role == naming.ROLE_TILE}


@dataclass
class TextureSet:
    """The textures of an asset, ready to encode: by image name, the 8-bit pixels (top-down),
    the map kind ('base', 'orm', 'normal', 'emissive') and the Blender image."""
    arrays: dict = field(default_factory=dict)
    kinds: dict = field(default_factory=dict)
    images: dict = field(default_factory=dict)

    def image(self, key, kind):
        """The Blender image of one map of the atlas (key 'atlas') or of a tile material."""
        return self.images.get(f'{key}/{kind}')


def make_textures(asset_id, atlas_maps, tile_maps, groups, work_dir, sizes=None,
                  occlusion_in_color=0.3):
    """Turns baked maps into the asset's textures, saves them as working PNGs under `work_dir`
    and loads them as Blender images.

    atlas_maps: the maps of bake.bake_maps() for the atlas, or None when nothing is in it.
    tile_maps: {tile group name: maps} from bake.bake_tile().
    sizes: optional {'orm': 512, 'normal': 1024, 'emissive': 256} to store an atlas map smaller
    than the base colour.
    """
    sizes = sizes or {}
    os.makedirs(work_dir, exist_ok=True)
    result = TextureSet()

    def add(key, prefix, kind, array, srgb, size=None, alpha=False):
        if size and size != array.shape[0]:
            array = textures.resize(array, size)
            if kind == 'normal':
                array = textures.normalize_normals(array)
        pixels = textures.to_bytes(array, srgb=srgb)
        # The exporter names the glTF image after the file, so the file carries the full name.
        name = f'{prefix}_{kind}'
        path = textures.save_png(pixels, os.path.join(work_dir, f'{name}.png'))
        image = bpy.data.images.load(path)
        image.name = name
        image.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
        if kind == 'base':
            image.alpha_mode = 'STRAIGHT' if alpha else 'NONE'
        image.pack()
        result.arrays[name] = pixels
        result.kinds[name] = kind
        result.images[f'{key}/{kind}'] = image

    if atlas_maps is not None:
        cutout = any(group.role == naming.ROLE_CUTOUT for group in groups)
        base = atlas_maps['base']
        if occlusion_in_color > 0:
            base = textures.occlude_color(base, atlas_maps['occlusion'], strength=occlusion_in_color)
        if cutout:
            base = np.concatenate([base, atlas_maps['alpha'][..., None]], axis=-1)
        add(ATLAS, asset_id, 'base', base, True, alpha=cutout)
        add(ATLAS, asset_id, 'orm', textures.pack_orm(atlas_maps['occlusion'], atlas_maps['roughness'],
                                                      atlas_maps['metallic']), False, sizes.get('orm'))
        add(ATLAS, asset_id, 'normal', atlas_maps['normal'], False, sizes.get('normal'))
        if any(group.emission_textured for group in groups) and 'emission' in atlas_maps:
            add(ATLAS, asset_id, 'emissive', atlas_maps['emission'], True, sizes.get('emissive'))

    for name, maps in tile_maps.items():
        prefix = f'{asset_id}_{name}'
        add(name, prefix, 'base', maps['base'], True)
        add(name, prefix, 'orm', textures.pack_orm(maps['occlusion'], maps['roughness'],
                                                   maps['metallic']), False)
        add(name, prefix, 'normal', maps['normal'], False)
    return result


def build(objects, groups, texture_set):
    """Creates the final game materials and puts them on the objects in place of the sources."""
    for group in groups:
        for source in group.sources:
            source.name = f'{source.name}__source'    # frees the name for the game material
        group.material = _make_material(group, texture_set)
    lookup = {source.name: group.material for group in groups for source in group.sources}
    for obj in objects:
        replace_materials(obj, lookup)
    return groups


def _occlusion_group():
    """The node group the glTF exporter reads the occlusion texture from."""
    group = bpy.data.node_groups.get(OCCLUSION_GROUP)
    if group is None:
        group = bpy.data.node_groups.new(OCCLUSION_GROUP, 'ShaderNodeTree')
        group.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    return group


def _make_material(group, texture_set):
    """One final material: a Principled BSDF fed by its texture set."""
    material = bpy.data.materials.new(group.name)
    material['role'] = group.role
    material.use_backface_culling = not group.double_sided
    tree = material.node_tree
    bsdf, _output = material_nodes.principled(material)
    inputs = bsdf.inputs

    if group.role == naming.ROLE_GLASS:
        material['opacity'] = group.opacity
        inputs['Base Color'].default_value = (*group.tint, 1.0)
        inputs['Alpha'].default_value = group.opacity
        inputs['Roughness'].default_value = group.roughness
        inputs['Metallic'].default_value = 0.0
        return material

    def image_node(kind):
        image = texture_set.image(group.texture_key, kind)
        if image is None:
            return None
        node = tree.nodes.new('ShaderNodeTexImage')
        node.image = image
        return node

    base = image_node('base')
    if base is None:
        raise ValueError(f'game material {group.name!r} has no baked textures')
    tree.links.new(base.outputs['Color'], inputs['Base Color'])
    if group.role == naming.ROLE_PAINT:
        # The tint itself is written into the glTF as baseColorFactor by export.py.
        material['paint_color'] = [float(value) for value in group.paint_color]
        inputs['Coat Weight'].default_value = group.coat
        inputs['Coat Roughness'].default_value = group.coat_roughness
    if group.role == naming.ROLE_CUTOUT:
        tree.links.new(base.outputs['Alpha'], inputs['Alpha'])
    if group.role == naming.ROLE_TILE:
        material['tile_size'] = group.tile_size

    orm = image_node('orm')
    separate = tree.nodes.new('ShaderNodeSeparateColor')
    tree.links.new(orm.outputs['Color'], separate.inputs[0])
    tree.links.new(separate.outputs['Green'], inputs['Roughness'])
    tree.links.new(separate.outputs['Blue'], inputs['Metallic'])
    if group.role != naming.ROLE_TILE:
        occlusion = tree.nodes.new('ShaderNodeGroup')
        occlusion.node_tree = _occlusion_group()
        tree.links.new(separate.outputs['Red'], occlusion.inputs['Occlusion'])

    normal = image_node('normal')
    normal_map = tree.nodes.new('ShaderNodeNormalMap')
    tree.links.new(normal.outputs['Color'], normal_map.inputs['Color'])
    tree.links.new(normal_map.outputs['Normal'], inputs['Normal'])

    if group.emissive_strength > 0.0 and group.role != naming.ROLE_TILE:
        material['emissive_strength'] = group.emissive_strength
        inputs['Emission Strength'].default_value = group.emissive_strength
        emissive = image_node('emissive') if group.emission_textured else None
        if emissive is not None:
            tree.links.new(emissive.outputs['Color'], inputs['Emission Color'])
            material['emissive_color'] = [1.0, 1.0, 1.0]
        else:
            inputs['Emission Color'].default_value = (*group.emission_color, 1.0)
            material['emissive_color'] = [float(value) for value in group.emission_color]
    return material


def replace_materials(obj, lookup):
    """Swaps each source material for its final one and merges slots that became the same."""
    mesh = obj.data
    finals, index_map = [], []
    for slot in obj.material_slots:
        final = lookup[slot.material.name]
        if final not in finals:
            finals.append(final)
        index_map.append(finals.index(final))
    indices = np.zeros(len(mesh.polygons), dtype=np.int32)
    mesh.polygons.foreach_get('material_index', indices)
    remapped = np.asarray(index_map, dtype=np.int32)[np.clip(indices, 0, len(index_map) - 1)]
    mesh.materials.clear()
    for final in finals:
        mesh.materials.append(final)
    mesh.polygons.foreach_set('material_index', remapped)
    mesh.update()
