"""Exports the finished objects as one .glb in the game's convention and compresses it.

Blender's exporter does the geometry, hierarchy, skins and animations and turns Z up into the
game's Y up (an asset authored facing +Y in Blender faces -Z in the game). Then the file is
reopened here to: store every texture as WebP at a quality chosen per map, write the role
settings into the standard glTF material fields, shrink vertex attributes, store the geometry
with Draco (KHR_draco_mesh_compression), and attach the asset's extras to the scene, where
three.js exposes them as gltf.scene.userData.
"""
import io
import os

import bpy
from mathutils import Matrix

from . import glb, naming, textures


def export_glb(path, objects, extras=None, texture_set=None, tangents=False, animations=False,
               quantize=True, compress=True):
    """Writes `objects` (meshes, empties, armatures) to `path`; returns glb.statistics().

    extras: a dictionary stored on the glTF scene (asset id, kind, LOD distances, ...).
    texture_set: the gamemat.TextureSet of the asset, so textures are encoded from the baked
    arrays themselves and not from a decoded copy.
    tangents: export vertex tangents; needed when the normal map was baked from a high-detail
    mesh, so the game shades with exactly the tangent frame the bake used.
    compress: store the geometry with Draco (glb.Document.compress) after quantising it.
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for obj in objects:
        naming.check_node_name(obj.name)
    if bpy.context.object is not None and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for candidate in bpy.context.view_layer.objects:
        candidate.select_set(False)
    for obj in objects:
        obj.hide_render = False
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]

    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True,
        export_apply=False, export_extras=True, export_image_format='AUTO',
        export_texcoords=True, export_normals=True, export_tangents=tangents,
        export_materials='EXPORT', export_vertex_color='ACTIVE',
        export_all_vertex_colors=False, export_cameras=False, export_lights=False,
        export_animations=animations, export_skins=True, export_morph=animations,
        export_def_bones=True, export_optimize_animation_size=True,
        export_animation_mode='ACTIONS', export_anim_single_armature=True)

    document = glb.Document.read(path)
    _strip_blender_extras(document)
    _compress_images(document, texture_set)
    _apply_material_roles(document)
    if quantize:
        document.quantize()
    if compress:
        summary = document.compress()
        if summary is None:                             # fail loudly: never ship plain geometry by accident
            raise RuntimeError('export: no Draco encoder (DracoPy) could be had for '
                               f'{os.path.basename(path)}; install it into this Python, or pass '
                               'a.bake(compress=False) to build without geometry compression')
        if summary['skipped'] or summary['failed']:
            print(f'export: Draco left {summary["skipped"] + summary["failed"]} primitive(s) of '
                  f'{os.path.basename(path)} uncompressed ({summary})', flush=True)
    if extras:
        scenes = document.json.setdefault('scenes', [{}])
        scenes[0].setdefault('extras', {}).update(extras)
    document.json['asset']['generator'] = 'MARAZUL asset pipeline (Blender glTF exporter)'
    size = document.write(path)
    return glb.statistics(document, file_bytes=size)


def _strip_blender_extras(document):
    """Drops empty extras objects so the JSON stays small."""
    for key in ('nodes', 'materials', 'meshes', 'scenes'):
        for item in document.json.get(key, []):
            if 'extras' in item and not item['extras']:
                del item['extras']


def _compress_images(document, texture_set):
    """Re-encodes every embedded image as WebP: from the baked arrays when the asset has a
    texture set, else from the PNG or JPEG bytes the exporter wrote."""
    kinds = texture_set.kinds if texture_set is not None else {}
    for index, image in enumerate(document.json.get('images', [])):
        kind = kinds.get(image.get('name', ''))
        if kind is not None:
            pixels = texture_set.arrays[image['name']]
        else:
            import numpy as np
            from PIL import Image
            with Image.open(io.BytesIO(document.image_bytes(index))) as opened:
                pixels = np.asarray(opened.convert('RGBA' if 'A' in opened.getbands() else 'RGB'))
            kind = 'base'
        document.set_image(index, textures.encode_webp(pixels, kind), 'image/webp')
    for sampler in document.json.get('samplers', []):
        sampler.setdefault('magFilter', 9729)
        sampler['minFilter'] = 9987


def _apply_material_roles(document):
    """Writes each material's role settings (from its extras) into the glTF material itself."""
    for material in document.json.get('materials', []):
        extras = material.get('extras', {})
        role = extras.get('role') or naming.material_role(material.get('name', ''))
        pbr = material.setdefault('pbrMetallicRoughness', {})
        material.pop('alphaMode', None)
        material.pop('alphaCutoff', None)
        if role == naming.ROLE_PAINT:
            color = list(extras.get('paint_color', (1.0, 1.0, 1.0)))[:3]
            pbr['baseColorFactor'] = [*color, 1.0]
        elif role == naming.ROLE_CUTOUT:
            material['alphaMode'] = 'MASK'
            material['alphaCutoff'] = 0.5
            material['doubleSided'] = True
        elif role == naming.ROLE_GLASS:
            factor = list(pbr.get('baseColorFactor', (1.0, 1.0, 1.0, 1.0)))
            factor[3] = float(extras.get('opacity', factor[3]))
            pbr['baseColorFactor'] = factor
            material['alphaMode'] = 'BLEND'
        strength = float(extras.get('emissive_strength', 0.0))
        if strength > 0.0:
            material['emissiveFactor'] = list(extras.get('emissive_color', (1.0, 1.0, 1.0)))[:3]
            extensions = material.setdefault('extensions', {})
            extensions['KHR_materials_emissive_strength'] = {'emissiveStrength': strength}
            document.use_extension('KHR_materials_emissive_strength')
        else:
            material.pop('emissiveFactor', None)
            material.pop('emissiveTexture', None)
            material.get('extensions', {}).pop('KHR_materials_emissive_strength', None)
        if 'extensions' in material and not material['extensions']:
            del material['extensions']


def reset_for_export(objects):
    """Bakes each mesh object's rotation and scale into its mesh, so exported nodes carry only
    a translation: the pivot a moving part turns about. Parents are handled before children,
    everything stays where it is in the world, and meshes shared by several objects (linked
    copies) are left alone, since their nodes need their own rotation."""
    bpy.context.view_layer.update()
    world = {obj: obj.matrix_world.copy() for obj in objects}

    def depth(obj):
        count = 0
        while obj.parent is not None:
            obj, count = obj.parent, count + 1
        return count

    for obj in sorted(objects, key=depth):
        matrix = world[obj]
        if obj.type == 'MESH' and obj.data.users == 1:
            location = matrix.to_translation()
            local = Matrix.Translation(-location) @ matrix
            if not _is_identity(local):
                obj.data.transform(local)
                if local.determinant() < 0:
                    obj.data.flip_normals()
                obj.data.update()
            obj.matrix_world = Matrix.Translation(location)
        else:
            obj.matrix_world = matrix
        bpy.context.view_layer.update()


def _is_identity(matrix, tolerance=1e-6):
    identity = Matrix.Identity(4)
    return all(abs(matrix[row][column] - identity[row][column]) < tolerance
               for row in range(4) for column in range(4))
