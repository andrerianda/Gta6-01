"""Quick contact sheets of a person: full body front, three-quarter, side and back, and a face
close-up, rendered with Cycles on the CPU at low samples (seconds to a minute). Used by
build_characters.py --preview (source shapes, no bake) and after a build (baked materials).
"""
import math
import os

import bpy
from mathutils import Vector
from PIL import Image

# (name, azimuth degrees from the front towards the person's right, elevation, framing):
# framing 'body' fits the whole person, 'face' the head, 'bust' head and shoulders.
BODY_VIEWS = (('front', 0, 3, 'body'), ('three_quarter', 35, 6, 'body'), ('side', 90, 3, 'body'), ('back', 180, 6, 'body'))
FACE_VIEWS = (('face', 18, 4, 'face'), ('face_front', 0, 0, 'face'), ('face_side', 75, 2, 'face'), ('bust', 30, 5, 'bust'))


def _world(scene):
    world = scene.world or bpy.data.worlds.new('preview_world')
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (0.55, 0.58, 0.62, 1.0)
    bg.inputs['Strength'].default_value = 0.55


def _lights(scene, height):
    made = []
    for name, energy, rot, color in (('key', 3.4, (52, 0, 38), (1.0, 0.94, 0.86)), ('rim', 1.6, (60, 0, 200), (0.85, 0.9, 1.0))):
        data = bpy.data.lights.new('preview_' + name, 'SUN')
        data.energy = energy
        data.color = color
        data.angle = math.radians(6)
        obj = bpy.data.objects.new('preview_' + name, data)
        obj.rotation_euler = tuple(math.radians(a) for a in rot)
        scene.collection.objects.link(obj)
        made.append(obj)
    return made


def render(path, objects, height, head_point, views=BODY_VIEWS + FACE_VIEWS, cell=(320, 400), samples=16, columns=4):
    """Renders the views of the objects (others hidden) into one JPEG sheet; returns its path."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    try:
        scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    scene.render.resolution_x, scene.render.resolution_y = cell
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'PNG'
    try:
        scene.view_settings.view_transform = 'AgX'
    except Exception:
        pass
    _world(scene)
    shown = set(o.name for o in objects)
    hidden = []
    for obj in scene.objects:
        if obj.type in ('MESH', 'CURVE') and obj.name not in shown and not obj.hide_render:
            obj.hide_render = True
            hidden.append(obj)
    extras = _lights(scene, height)
    cam_data = bpy.data.cameras.new('preview_cam')
    cam = bpy.data.objects.new('preview_cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    extras.append(cam)
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
    floor = bpy.context.active_object
    mat = bpy.data.materials.new('preview_floor')
    mat.use_nodes = True
    next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (0.2, 0.2, 0.2, 1)
    floor.data.materials.append(mat)
    extras.append(floor)
    tiles = []
    folder = os.path.dirname(path)
    os.makedirs(folder, exist_ok=True)
    for index, (name, az, el, framing) in enumerate(views):
        a, e = math.radians(az), math.radians(el)
        direction = Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))
        if framing == 'body':
            cam_data.type = 'ORTHO'
            cam_data.ortho_scale = height * 1.08
            target = Vector((0, 0, height * 0.5))
            distance = 6.0
        else:
            cam_data.type = 'PERSP'
            cam_data.lens = 85
            target = Vector(head_point) + (Vector((0, 0, -0.10)) if framing == 'bust' else Vector((0, 0.0, -0.025)))
            distance = 0.95 if framing == 'face' else 1.7
        cam_data.clip_start, cam_data.clip_end = 0.02, 50
        cam.location = target + direction * distance
        cam.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
        tile = os.path.join(folder, '_tile_%d.png' % index)
        scene.render.filepath = tile
        bpy.ops.render.render(write_still=True)
        tiles.append(tile)
    rows = (len(tiles) + columns - 1) // columns
    sheet = Image.new('RGB', (cell[0] * columns, cell[1] * rows))
    for index, tile in enumerate(tiles):
        sheet.paste(Image.open(tile).convert('RGB'), ((index % columns) * cell[0], (index // columns) * cell[1]))
        os.remove(tile)
    if sheet.width > 1280:
        sheet = sheet.resize((1280, int(sheet.height * 1280 / sheet.width)), Image.LANCZOS)
    sheet.save(path, quality=84)
    for obj in extras:
        bpy.data.objects.remove(obj, do_unlink=True)
    for obj in hidden:
        obj.hide_render = False
    return path
