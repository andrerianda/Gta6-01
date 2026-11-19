"""Bakes the procedural materials of an asset's meshes into one atlas with Cycles: base colour (with
a share of the ambient occlusion), an ORM map (occlusion, roughness, metalness in R, G, B: the glTF
layout) and a tangent-space normal map, then swaps the source materials for the game materials
'atlas' and 'paint*' that read those textures. Glass, lamp and screen materials are left alone.

Bakes run on the CPU unless MARAZUL_BAKE_DEVICE=GPU is set (use it through /opt/marazul-tools/gpu-run).
"""
import math
import os

import bpy
import numpy as np
from PIL import Image

from . import meshkit
from .surfaces import role_of


def unwrap(objs, margin=0.004):
    """One UV layout over all the objects: projected islands at one texel density, packed in 0..1."""
    for obj in objs:
        layers = obj.data.uv_layers
        while len(layers) > 0:
            layers.remove(layers[0])
        layers.new(name='atlas')
    meshkit._activate(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def _setup_cycles(samples):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.cycles.device = 'CPU'
    if os.environ.get('MARAZUL_BAKE_DEVICE') == 'GPU':
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = kind
                prefs.get_devices()
                for device in prefs.devices:
                    device.use = True
                scene.cycles.device = 'GPU'
                break
            except Exception:
                continue
    scene.render.bake.margin = 6
    scene.render.bake.use_clear = True
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.target = 'IMAGE_TEXTURES'


def _shader_of(material):
    return next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)


def _output_of(material):
    return next(n for n in material.node_tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)


def _bake_pass(target, image, kind, socket=None, samples=4):
    """Bakes one pass of the target mesh into the image and returns it as a (h, w, 4) float array."""
    scene = bpy.context.scene
    scene.cycles.samples = samples
    patched = []
    for material in target.data.materials:
        tree = material.node_tree
        node = tree.nodes.get('bake_target') or tree.nodes.new('ShaderNodeTexImage')
        node.name = 'bake_target'
        node.image = image
        tree.nodes.active = node
        if socket:
            shader, output = _shader_of(material), _output_of(material)
            emit = tree.nodes.new('ShaderNodeEmission')
            source = shader.inputs[socket]
            if source.is_linked:
                tree.links.new(source.links[0].from_socket, emit.inputs['Color'])
            else:
                value = source.default_value
                emit.inputs['Color'].default_value = tuple(value) if hasattr(value, '__len__') else (value, value, value, 1.0)
            tree.links.new(emit.outputs['Emission'], output.inputs['Surface'])
            patched.append((tree, shader, output, emit))
    meshkit._activate([target])
    if kind == 'NORMAL':
        bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
    else:
        bpy.ops.object.bake(type=kind)
    for tree, shader, output, emit in patched:
        tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
        tree.nodes.remove(emit)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(height, width, 4)[::-1].copy()


def _srgb(linear):
    linear = np.clip(linear, 0.0, 1.0)
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(linear, 1 / 2.4) - 0.055)


def _save(array, path):
    Image.fromarray((np.clip(array, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)).save(path)
    return path


def bake(objs, size, work_dir, occlusion_samples=24, occlusion_in_color=0.3, occlusion_distance=1.5):
    """Bakes the objects' atlas and paint materials; returns the texture paths {base, orm, normal}.

    The objects must already share one UV layout (unwrap()). A joined copy is baked, so the margin of
    one part never paints over another.
    """
    os.makedirs(work_dir, exist_ok=True)
    _setup_cycles(4)
    world = bpy.context.scene.world or bpy.data.worlds.new('bake_world')
    bpy.context.scene.world = world
    world.light_settings.distance = occlusion_distance
    target = meshkit.join('bake_copy', [meshkit.duplicate(o, o.name + '_bake') for o in objs])
    keep = [i for i, m in enumerate(target.data.materials) if role_of(m.name) in ('atlas', 'paint')]
    for poly in target.data.polygons:
        if poly.material_index not in keep:
            poly.select = True
    hidden = [o for o in bpy.context.scene.objects if o not in objs and o is not target and o.type == 'MESH']
    for o in objs:
        o.hide_render = True
    image = bpy.data.images.new('bake_target', size, size, alpha=False, float_buffer=True, is_data=True)
    color = _bake_pass(target, image, 'EMIT', 'Base Color')[..., :3]
    rough = _bake_pass(target, image, 'EMIT', 'Roughness')[..., 0]
    metal = _bake_pass(target, image, 'EMIT', 'Metallic')[..., 0]
    normal = _bake_pass(target, image, 'NORMAL')[..., :3]
    occlusion = _bake_pass(target, image, 'AO', samples=occlusion_samples)[..., 0]
    bpy.data.images.remove(image)
    bpy.data.objects.remove(target, do_unlink=True)
    for o in objs:
        o.hide_render = False
    del hidden
    shade = 1.0 - occlusion_in_color * (1.0 - occlusion)
    paths = {
        'base': _save(_srgb(color * shade[..., None]), os.path.join(work_dir, 'base.png')),
        'orm': _save(np.stack([occlusion, rough, metal], axis=-1), os.path.join(work_dir, 'orm.png')),
        'normal': _save(normal, os.path.join(work_dir, 'normal.png')),
    }
    return paths


def _occlusion_group():
    """The node group Blender's glTF exporter reads the occlusion texture from."""
    name = 'glTF Material Output'
    group = bpy.data.node_groups.get(name)
    if group is None:
        group = bpy.data.node_groups.new(name, 'ShaderNodeTree')
        group.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        group.nodes.new('NodeGroupInput')
    return group


def game_material(name, paths, tint=None):
    """The material the game draws: the three baked textures on a Principled BSDF."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True
    tree = mat.node_tree
    shader = _shader_of(mat)

    def texture(key, data):
        node = tree.nodes.new('ShaderNodeTexImage')
        node.image = bpy.data.images.load(paths[key], check_existing=True)
        node.image.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
        return node

    base, orm, normal = texture('base', False), texture('orm', True), texture('normal', True)
    tree.links.new(base.outputs['Color'], shader.inputs['Base Color'])
    split = tree.nodes.new('ShaderNodeSeparateColor')
    tree.links.new(orm.outputs['Color'], split.inputs['Color'])
    tree.links.new(split.outputs['Green'], shader.inputs['Roughness'])
    tree.links.new(split.outputs['Blue'], shader.inputs['Metallic'])
    occlusion = tree.nodes.new('ShaderNodeGroup')
    occlusion.node_tree = _occlusion_group()
    tree.links.new(split.outputs['Red'], occlusion.inputs['Occlusion'])
    bump = tree.nodes.new('ShaderNodeNormalMap')
    tree.links.new(normal.outputs['Color'], bump.inputs['Color'])
    tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    if tint is not None:
        mat['paint_color'] = list(tint)
    return mat


def swap_materials(objs, paths):
    """Replaces every atlas-role material by 'atlas' and every paint material by its baked twin."""
    made, twin = {}, {}
    for obj in objs:
        for index, source in enumerate(list(obj.data.materials)):
            # A source shared by several meshes is renamed once; find its twin by the object itself.
            if source.name not in twin:
                role = role_of(source.name)
                if role not in ('atlas', 'paint'):
                    continue
                key = source.name if role == 'paint' else 'atlas'
                if key not in made:
                    made[key] = game_material(key, paths, source.get('paint_color') if role == 'paint' else None)
                source.name = source.name + '_source'
                twin[source.name] = made[key]
            obj.data.materials[index] = twin[source.name]
        _merge_slots(obj)
    return made


def _merge_slots(obj):
    """One slot per distinct material (the exporter makes one primitive per slot)."""
    mesh = obj.data
    names, remap = [], {}
    for index, material in enumerate(mesh.materials):
        if material.name not in names:
            names.append(material.name)
        remap[index] = names.index(material.name)
    materials = [bpy.data.materials[n] for n in names]
    indices = [remap.get(p.material_index, 0) for p in mesh.polygons]
    mesh.materials.clear()
    for material in materials:
        mesh.materials.append(material)
    for poly, index in zip(mesh.polygons, indices):
        poly.material_index = index
