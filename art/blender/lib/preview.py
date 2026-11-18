"""Cycles preview stills: one studio, shared with the in-engine viewer.

The studio is a soft gradient sky, a warm low sun and a neutral ground. Every number here (sky
colours, sun direction and strength, ground colour, camera angles, field of view, how the camera
is fitted to the asset) is repeated in tools/preview/asset-viewer.html, so a Cycles still and an
engine capture of the same asset can be compared side by side. Change them in both places.

Directions are in Blender axes: the asset faces +Y, +X is its right, +Z is up.
"""
import math
import os

import bpy
from mathutils import Matrix, Vector

from . import naming, scene

SKY_ZENITH = (0.22, 0.42, 0.78)
SKY_HORIZON = (0.78, 0.84, 0.90)
SKY_GROUND = (0.30, 0.28, 0.25)
SKY_STRENGTH = 1.0
SUN_COLOR = (1.0, 0.84, 0.66)
SUN_STRENGTH = 3.4
SUN_AZIMUTH = math.radians(-42.0)     # from the asset's front towards its right
SUN_ELEVATION = math.radians(32.0)
SUN_ANGLE = math.radians(2.5)
GROUND_COLOR = (0.33, 0.32, 0.30)
GROUND_ROUGHNESS = 0.9
FIELD_OF_VIEW = math.radians(30.0)    # vertical
FRAME_MARGIN = 1.12

# View name -> (azimuth from the front towards the right, elevation), in degrees.
VIEWS = {
    'three_quarter': (35.0, 16.0),
    'front': (0.0, 6.0),
    'side': (90.0, 6.0),
    'back': (215.0, 16.0),
    'top': (20.0, 62.0),
    'low': (35.0, 2.0),
}
TONE_VIEWS = {'aces': 'ACES 1.3', 'agx': 'AgX', 'neutral': 'Khronos PBR Neutral',
              'none': 'Standard'}
ACES_EXPOSURE_STOPS = 0.737            # three.js scales exposure by 1 / 0.6 before its ACES fit


def direction(azimuth_degrees, elevation_degrees):
    """The unit vector from the subject towards a camera or light at the given angles."""
    azimuth, elevation = math.radians(azimuth_degrees), math.radians(elevation_degrees)
    return Vector((math.sin(azimuth) * math.cos(elevation), math.cos(azimuth) * math.cos(elevation),
                   math.sin(elevation)))


def build_studio(tone='aces'):
    """Adds the sky, the sun and the ground to the scene and sets the view transform."""
    render = bpy.context.scene
    world = bpy.data.worlds.new('studio_sky')
    render.world = world
    tree = world.node_tree
    background = next((node for node in tree.nodes if node.bl_idname == 'ShaderNodeBackground'), None)
    output = next((node for node in tree.nodes if node.bl_idname == 'ShaderNodeOutputWorld'), None)
    if output is None:
        output = tree.nodes.new('ShaderNodeOutputWorld')
    if background is None:
        background = tree.nodes.new('ShaderNodeBackground')
        tree.links.new(background.outputs[0], output.inputs['Surface'])
    coordinates = tree.nodes.new('ShaderNodeTexCoord')
    separate = tree.nodes.new('ShaderNodeSeparateXYZ')
    tree.links.new(coordinates.outputs['Generated'], separate.inputs[0])

    def math_node(operation, a, b):
        node = tree.nodes.new('ShaderNodeMath')
        node.operation = operation
        node.use_clamp = True
        for socket, value in zip(node.inputs, (a, b)):
            if isinstance(value, bpy.types.NodeSocket):
                tree.links.new(value, socket)
            else:
                socket.default_value = value
        return node.outputs[0]

    def mix_node(factor, a, b):
        node = tree.nodes.new('ShaderNodeMix')
        node.data_type = 'RGBA'
        inputs = {socket.identifier: socket for socket in node.inputs}
        tree.links.new(factor, inputs['Factor_Float'])
        for key, value in (('A_Color', a), ('B_Color', b)):
            if isinstance(value, bpy.types.NodeSocket):
                tree.links.new(value, inputs[key])
            else:
                inputs[key].default_value = (*value, 1.0)
        return next(socket for socket in node.outputs if socket.identifier == 'Result_Color')

    # Up: horizon -> zenith by pow(z, 0.45). Down: horizon -> ground within z = -0.15.
    up = math_node('POWER', math_node('MAXIMUM', separate.outputs['Z'], 0.0), 0.45)
    down = math_node('MULTIPLY', math_node('MAXIMUM', math_node('MULTIPLY', separate.outputs['Z'],
                                                                 -1.0), 0.0), 1.0 / 0.15)
    sky = mix_node(up, SKY_HORIZON, SKY_ZENITH)
    color = mix_node(down, sky, SKY_GROUND)
    tree.links.new(color, background.inputs['Color'])
    background.inputs['Strength'].default_value = SKY_STRENGTH

    sun_data = bpy.data.lights.new('studio_sun', 'SUN')
    sun_data.energy = SUN_STRENGTH
    sun_data.color = SUN_COLOR
    sun_data.angle = SUN_ANGLE
    sun = bpy.data.objects.new('studio_sun', sun_data)
    scene.link(sun)
    to_sun = direction(math.degrees(SUN_AZIMUTH), math.degrees(SUN_ELEVATION))
    sun.matrix_world = to_sun.to_track_quat('Z', 'Y').to_matrix().to_4x4()

    ground_mesh = bpy.data.meshes.new('studio_ground')
    half = 200.0
    ground_mesh.from_pydata([(-half, -half, 0), (half, -half, 0), (half, half, 0), (-half, half, 0)],
                            [], [(0, 1, 2, 3)])
    ground = scene.new_object('studio_ground', ground_mesh)
    material = bpy.data.materials.new('studio_ground')
    bsdf = next(node for node in material.node_tree.nodes
                if node.bl_idname == 'ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (*GROUND_COLOR, 1.0)
    bsdf.inputs['Roughness'].default_value = GROUND_ROUGHNESS
    ground_mesh.materials.append(material)

    set_tone(tone)
    return ground


def set_tone(tone):
    """Picks the Blender view transform that matches a three.js tone mapping name."""
    render = bpy.context.scene
    render.display_settings.display_device = 'sRGB'
    render.view_settings.view_transform = TONE_VIEWS[tone]
    render.view_settings.look = 'None'
    render.view_settings.exposure = ACES_EXPOSURE_STOPS if tone == 'aces' else 0.0
    render.view_settings.gamma = 1.0


def fit_camera(low, high, azimuth_degrees, elevation_degrees, aspect, zoom=1.0, focus=None):
    """Places the scene camera so the box low..high just fills the frame from the given angles.

    zoom > 1 moves closer (a close-up); focus overrides the point looked at (default: the
    centre of the box). Returns the camera object.
    """
    render = bpy.context.scene
    camera = render.camera
    if camera is None:
        camera = bpy.data.objects.new('studio_camera', bpy.data.cameras.new('studio_camera'))
        scene.link(camera)
        render.camera = camera
    camera.data.sensor_fit = 'VERTICAL'
    camera.data.angle_y = FIELD_OF_VIEW
    camera.data.clip_start = 0.05
    camera.data.clip_end = 2000.0

    centre = (low + high) / 2 if focus is None else Vector(focus)
    back = direction(azimuth_degrees, elevation_degrees)
    right = Vector((0, 0, 1)).cross(back)
    if right.length < 1e-6:
        right = Vector((1, 0, 0))
    right.normalize()
    up = back.cross(right).normalized()
    tan_y = math.tan(FIELD_OF_VIEW / 2)
    tan_x = tan_y * aspect
    distance = 0.1
    for x in (low.x, high.x):
        for y in (low.y, high.y):
            for z in (low.z, high.z):
                offset = Vector((x, y, z)) - centre
                depth = offset.dot(back)
                distance = max(distance, abs(offset.dot(right)) / tan_x + depth,
                               abs(offset.dot(up)) / tan_y + depth)
    distance = distance * FRAME_MARGIN / zoom
    rotation = Matrix((right, up, back)).transposed().to_4x4()
    camera.matrix_world = Matrix.Translation(centre + back * distance) @ rotation
    return camera


def render_still(path, resolution=(960, 540), samples=None, jpeg_quality=70):
    """Renders the scene camera's view to a JPEG."""
    render = bpy.context.scene
    render.cycles.samples = samples or scene.quality(32, 96)
    render.cycles.use_denoising = True
    render.render.resolution_x, render.render.resolution_y = resolution
    render.render.resolution_percentage = 100
    render.render.film_transparent = False
    render.render.image_settings.file_format = 'JPEG'
    render.render.image_settings.quality = jpeg_quality
    render.render.filepath = path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    return path


def parse_shot(text, zoom=1.0, focus=None):
    """Reads one shot: 'view', 'view@zoom' or 'view@zoom@x,y,z'.

    view is a name from VIEWS or 'azimuth,elevation' in degrees; zoom > 1 moves closer; x,y,z
    is the point to look at in Blender axes. Missing parts take the given defaults. Returns
    (azimuth, elevation, zoom, focus).
    """
    parts = text.split('@')
    if parts[0] in VIEWS:
        azimuth, elevation = VIEWS[parts[0]]
    else:
        try:
            azimuth, elevation = (float(part) for part in parts[0].split(','))
        except ValueError:
            raise ValueError(f'unknown view {parts[0]!r}: use one of {sorted(VIEWS)} or '
                             '"azimuth,elevation"') from None
    if len(parts) > 1 and parts[1]:
        zoom = float(parts[1])
    if len(parts) > 2 and parts[2]:
        focus = tuple(float(part) for part in parts[2].split(','))
    return azimuth, elevation, zoom, focus


def sheet_layout(count):
    """(columns, rows) of a contact sheet of `count` shots; the viewer page uses the same."""
    columns = 1 if count <= 1 else 2 if count <= 4 else 3
    return columns, math.ceil(count / columns)


def viewer_query(asset_id, views, tone='aces', level=0, zoom=1.0, focus=None):
    """The asset-viewer query that shows the same shots in the engine (focus points turned
    from Blender axes into game axes)."""
    shots = []
    for view in views:
        azimuth, elevation, shot_zoom, shot_focus = parse_shot(view, zoom, focus)
        text = f'{azimuth:g},{elevation:g}@{shot_zoom:g}'
        if shot_focus is not None:
            text += f'@{shot_focus[0]:g},{shot_focus[2]:g},{-shot_focus[1]:g}'
        shots.append(text)
    query = f'asset={asset_id}&shots={";".join(shots)}'
    if tone != 'aces':
        query += f'&tone={tone}'
    if level:
        query += f'&lod={level}'
    return query


def render_views(path, objects, views=('three_quarter',), tone='aces', zoom=1.0, focus=None,
                 samples=None, resolution=(960, 540)):
    """Renders the objects in the studio as one or more shots (see parse_shot).

    One shot gives a single still; several give one contact sheet of the same overall size,
    which is how a turntable or a set of close-ups fits in a single image. Returns the path.
    """
    build_studio(tone)
    low, high = scene.world_bounds(objects)
    low.z = min(low.z, 0.0)
    shots = [parse_shot(view, zoom, focus) for view in views]
    if len(shots) == 1:
        azimuth, elevation, shot_zoom, shot_focus = shots[0]
        fit_camera(low, high, azimuth, elevation, resolution[0] / resolution[1], zoom=shot_zoom,
                   focus=shot_focus)
        return render_still(path, resolution, samples)

    from PIL import Image
    columns, rows = sheet_layout(len(shots))
    cell = (resolution[0] // columns, resolution[1] // rows)
    sheet = Image.new('RGB', resolution, (20, 20, 20))
    for index, (azimuth, elevation, shot_zoom, shot_focus) in enumerate(shots):
        fit_camera(low, high, azimuth, elevation, cell[0] / cell[1], zoom=shot_zoom,
                   focus=shot_focus)
        tile_path = f'{os.path.splitext(path)[0]}_tile{index}.jpg'
        render_still(tile_path, cell, samples, jpeg_quality=92)
        with Image.open(tile_path) as tile:
            sheet.paste(tile, ((index % columns) * cell[0], (index // columns) * cell[1]))
        os.remove(tile_path)
    sheet.save(path, format='JPEG', quality=70)
    return path


def turntable(count=4, elevation=14.0):
    """View angles for `count` stills around the asset, starting from the three-quarter view."""
    return [f'{35.0 + 360.0 * index / count:g},{elevation:g}' for index in range(count)]


PLAIN_DIR = '/tmp/marazul/assets/preview/plain'
IMPORTER_HELPERS = 'glTF_not_exported'      # the collection of the importer's own helper objects


def plain_copy(path, directory=PLAIN_DIR):
    """The built file as Blender's glTF importer can read it: a Draco-compressed .glb is
    decoded (glb.Document.decompress, the same decoder as the game's, so the geometry is
    exactly what ships) into a copy under `directory`; a plain file is returned as it is."""
    from . import glb
    document = glb.Document.read(path)
    if not document.decompress():
        return path
    os.makedirs(directory, exist_ok=True)
    copy = os.path.join(directory, os.path.basename(path))
    document.write(copy)
    return copy


def import_glb(path, level=0):
    """Loads a built .glb (through plain_copy) into the scene; returns the visible mesh objects
    of one level of detail (collision proxies and the other levels are hidden)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=plain_copy(path))
    imported = []
    for obj in bpy.data.objects:
        if obj in before:
            continue
        if obj.users_collection and all(collection.name.startswith(IMPORTER_HELPERS)
                                        for collection in obj.users_collection):
            obj.hide_render = obj.hide_viewport = True    # the importer's bone shape, not the asset
            continue
        imported.append(obj)

    def own_level(obj):
        while obj is not None:
            found = naming.lod_level(obj.name)
            if found is not None:
                return found
            obj = obj.parent
        return None

    def is_proxy(obj):
        while obj is not None:
            if naming.is_collider(obj.name):
                return True
            obj = obj.parent
        return False

    levels = {own_level(obj) for obj in imported if obj.type == 'MESH'} - {None}
    wanted = min(level, max(levels)) if levels else None
    visible = []
    for obj in imported:
        hidden = is_proxy(obj) or (own_level(obj) is not None and own_level(obj) != wanted)
        obj.hide_render = hidden
        obj.hide_viewport = hidden
        if obj.type == 'MESH' and not hidden:
            visible.append(obj)
    return visible


def swatch_sheet(path, materials, tone='aces', samples=None):
    """Renders a grid of test shapes, one per material, for judging the material library: a
    ball, a sharp-edged block and a slab they stand on (so worn edges and dirty creases show).
    Materials run left to right, top to bottom."""
    from . import build, shading
    columns = max(1, math.ceil(math.sqrt(len(materials) * 1.7)))
    objects = []
    for index, material in enumerate(materials):
        x = -(index % columns) * 1.45     # the camera looks from the front, so +X is on its left
        y = -(index // columns) * 1.5
        ball = build.sphere(f'swatch_ball_{index}', radius=0.36, segments=48, rings=24,
                            location=(x + 0.22, y + 0.1, 0.44))
        shading.smooth(ball)
        block = build.box(f'swatch_block_{index}', (0.42, 0.34, 0.62),
                          location=(x - 0.34, y - 0.12, 0.08), on_ground=True)
        slab = build.box(f'swatch_slab_{index}', (1.25, 1.05, 0.08), location=(x, y, 0.0),
                         on_ground=True)
        for obj in (ball, block, slab):
            obj.data.materials.append(material)
            objects.append(obj)
    return render_views(path, objects, views=('18,30',), tone=tone, samples=samples)
