"""A small contact sheet of the scene as it stands (source materials before the bake, the game
materials after it): a few Cycles views on the CPU under a low warm sun, pasted into one JPEG.

A view is (azimuth, elevation, zoom) or (azimuth, elevation, zoom, (x, y, z)): azimuth in degrees
from the nose (+Y) towards the right wing, elevation above the horizon, zoom 1 frames the whole
aircraft, larger moves closer; the optional point is what the camera looks at (Blender axes).
"""
import math
import os

import bpy
from mathutils import Vector
from PIL import Image

DEFAULT_VIEWS = ((35, 14, 1.0), (90, 4, 1.0), (0, 89, 1.0), (205, 10, 1.0))


def render_sheet(path, views=DEFAULT_VIEWS, cell=(320, 180), samples=24, columns=2, ground=True):
    """Renders the views and writes the sheet (columns x rows of cells) as a JPEG."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = cell
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'Filmic' if 'Filmic' in _transforms(scene) else scene.view_settings.view_transform
    world = scene.world or bpy.data.worlds.new('preview_world')
    scene.world = world
    world.use_nodes = True
    background = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    background.inputs['Color'].default_value = (0.42, 0.56, 0.78, 1.0)
    background.inputs['Strength'].default_value = 0.9
    sun_data = bpy.data.lights.new('preview_sun', 'SUN')
    sun_data.energy = 3.2
    sun_data.color = (1.0, 0.9, 0.78)
    sun = bpy.data.objects.new('preview_sun', sun_data)
    sun.rotation_euler = (math.radians(58), 0, math.radians(140))
    scene.collection.objects.link(sun)
    meshes = [o for o in scene.objects if o.type == 'MESH' and not o.name.startswith('col_')]
    for obj in meshes:
        obj.hide_render = obj.name[-4:] in ('lod1', 'lod2') or obj.name.endswith('_blur')
    shown = [o for o in meshes if not o.hide_render]
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for obj in shown:
        for corner in obj.bound_box:
            p = obj.matrix_world @ Vector(corner)
            lo, hi = Vector(map(min, lo, p)), Vector(map(max, hi, p))
    centre, radius = (lo + hi) * 0.5, (hi - lo).length * 0.5
    extras = [sun]
    if ground:
        bpy.ops.mesh.primitive_plane_add(size=radius * 40, location=(centre.x, centre.y, 0))
        plane = bpy.context.active_object
        material = bpy.data.materials.new('preview_ground')
        material.use_nodes = True
        shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        shader.inputs['Base Color'].default_value = (0.11, 0.11, 0.11, 1)
        shader.inputs['Roughness'].default_value = 0.9
        plane.data.materials.append(material)
        extras.append(plane)
    camera_data = bpy.data.cameras.new('preview_camera')
    camera_data.lens = 50
    camera_data.clip_start, camera_data.clip_end = 0.05, radius * 60
    camera = bpy.data.objects.new('preview_camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    extras.append(camera)
    tiles = []
    for index, view in enumerate(views):
        azimuth, elevation, zoom = math.radians(view[0]), math.radians(view[1]), view[2]
        target = Vector(view[3]) if len(view) > 3 else centre
        distance = radius * 2.9 / zoom
        offset = Vector((math.sin(azimuth) * math.cos(elevation), math.cos(azimuth) * math.cos(elevation), math.sin(elevation)))
        camera.location = target + offset * distance
        camera.rotation_euler = (-offset).to_track_quat('-Z', 'Y').to_euler()
        tile = os.path.join(os.path.dirname(path), '_tile%d.png' % index)
        scene.render.filepath = tile
        bpy.ops.render.render(write_still=True)
        tiles.append(tile)
    rows = (len(tiles) + columns - 1) // columns
    sheet = Image.new('RGB', (cell[0] * columns, cell[1] * rows))
    for index, tile in enumerate(tiles):
        sheet.paste(Image.open(tile).convert('RGB'), ((index % columns) * cell[0], (index // columns) * cell[1]))
        os.remove(tile)
    sheet.save(path, quality=78)
    for obj in extras:
        bpy.data.objects.remove(obj, do_unlink=True)
    return path


def _transforms(scene):
    return [item.identifier for item in type(scene.view_settings).bl_rna.properties['view_transform'].enum_items]
