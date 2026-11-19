"""The ONDA Marea 7: the handset an incoming call raises from the lower right corner of the screen.

Our own invented brand and design, modelled at real size in millimetres scaled to metres
(72 x 152 x 8 mm): a brushed-metal frame with rounded edges, four antenna breaks, two volume keys on
the left and a ridged power key on the right, a glass front that stands proud with a polished
chamfer, a camera hole centred near the top of the screen, a speaker grille and a port in the bottom
edge, and on the back a lens capsule and the ONDA mark (three rising wave arcs under a dot).

The phone stands upright (X width, Z height, the glass faces -Y). `build()` makes the scene with a
studio of soft panels; `render_passes()` renders it twice with Cycles on a transparent film:

  body   everything, the screen a clean dark rectangle
  glass  only what lies over the live screen: the reflections on the glass and the camera hole

and returns the four corners of the screen in image pixels so the game can map its live call screen
onto the picture with a CSS matrix3d transform. art/build_phone.py is the runner.
"""
import math

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Euler, Vector

MM = 0.001
WIDTH, HEIGHT, DEPTH = 72.0, 152.0, 8.0
CORNER = 11.5
GLASS_INSET = 1.1          # frame lip around the glass
SCREEN_INSET = 3.0         # from the outline to the lit area
SCREEN_CORNER = 8.6
HOLE_Z = HEIGHT / 2 - SCREEN_INSET - 5.2
HOLE_RADIUS = 1.75

# How the hand holds it for the picture: turned so the left edge shows, leaned back so the bottom
# edge shows, and rolled a little.
POSE = {'yaw': 12.0, 'tilt': 10.0, 'roll': -2.5}


def _rounded_outline(half_w, half_h, radius, segments=20):
    points = []
    for cx, cz, start in ((half_w - radius, half_h - radius, 0), (-(half_w - radius), half_h - radius, 90),
                          (-(half_w - radius), -(half_h - radius), 180), (half_w - radius, -(half_h - radius), 270)):
        for i in range(segments + 1):
            a = math.radians(start + 90 * i / segments)
            points.append((cx + radius * math.cos(a), cz + radius * math.sin(a)))
    return points


def _slab(name, half_w, half_h, radius, y_front, y_back, material, bevel=0.0, bevel_segments=4):
    """A rounded-rectangle slab between two depths (mm), its rim bevelled."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    outline = _rounded_outline(half_w, half_h, radius)
    front = [bm.verts.new((x * MM, y_front * MM, z * MM)) for x, z in outline]
    back = [bm.verts.new((x * MM, y_back * MM, z * MM)) for x, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    count = len(outline)
    for i in range(count):
        j = (i + 1) % count
        bm.faces.new((front[j], front[i], back[i], back[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    if bevel > 0:
        modifier = obj.modifiers.new('rim', 'BEVEL')
        modifier.width = bevel * MM
        modifier.segments = bevel_segments
        modifier.limit_method = 'ANGLE'
        modifier.angle_limit = math.radians(50)
        modifier.harden_normals = True
    return obj


def _box(name, centre, size, material, bevel=0.25):
    bpy.ops.mesh.primitive_cube_add(size=1, location=[c * MM for c in centre])
    obj = bpy.context.object
    obj.name = name
    obj.scale = [s * MM for s in size]
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(material)
    if bevel > 0:
        modifier = obj.modifiers.new('rim', 'BEVEL')
        modifier.width = bevel * MM
        modifier.segments = 3
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    return obj


def _cylinder(name, centre, radius, depth, axis, material, vertices=40):
    rotation = {'y': (math.pi / 2, 0, 0), 'z': (0, 0, 0), 'x': (0, math.pi / 2, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius * MM, depth=depth * MM,
                                        location=[c * MM for c in centre], rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return obj


def _principled(name, colour, metallic, roughness, coat=0.0, emission=None):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes['Principled BSDF']
    shader.inputs['Base Color'].default_value = (*colour, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Coat Weight'].default_value = coat
    shader.inputs['Coat Roughness'].default_value = 0.03
    if emission:
        shader.inputs['Emission Color'].default_value = (*emission[0], 1)
        shader.inputs['Emission Strength'].default_value = emission[1]
    return material


def _brushed_metal():
    """Satin graphite-blue aluminium: fine lengthwise brushing in the roughness and the normal."""
    material = _principled('frame_brushed_metal', (0.42, 0.47, 0.53), 1.0, 0.3)
    tree = material.node_tree
    shader = tree.nodes['Principled BSDF']
    coordinates = tree.nodes.new('ShaderNodeTexCoord')
    mapping = tree.nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (900, 900, 9)
    noise = tree.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 6
    noise.inputs['Detail'].default_value = 5
    ramp = tree.nodes.new('ShaderNodeMapRange')
    ramp.inputs['To Min'].default_value = 0.22
    ramp.inputs['To Max'].default_value = 0.42
    bump = tree.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.06
    tree.links.new(coordinates.outputs['Object'], mapping.inputs['Vector'])
    tree.links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
    tree.links.new(noise.outputs['Fac'], ramp.inputs['Value'])
    tree.links.new(ramp.outputs['Result'], shader.inputs['Roughness'])
    tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    shader.inputs['Anisotropic'].default_value = 0.6
    return material


def _panel(name, location, size, strength, colour=(1, 1, 1), target=(0, 0, 0)):
    """A studio soft panel that shows in reflections: an emissive card, brighter at its heart."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0], size[1], 1)
    direction = Vector(target) - Vector(location)
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    out = tree.nodes.new('ShaderNodeOutputMaterial')
    emission = tree.nodes.new('ShaderNodeEmission')
    coordinates = tree.nodes.new('ShaderNodeTexCoord')
    gradient = tree.nodes.new('ShaderNodeTexGradient')
    gradient.gradient_type = 'QUADRATIC_SPHERE'
    mapping = tree.nodes.new('ShaderNodeMapping')
    mapping.inputs['Location'].default_value = (-1.0, -1.0, 0)
    mapping.inputs['Scale'].default_value = (2.0, 2.0, 1)
    scale = tree.nodes.new('ShaderNodeMath')
    scale.operation = 'MULTIPLY_ADD'
    scale.inputs[1].default_value = strength * 0.8
    scale.inputs[2].default_value = strength * 0.2
    emission.inputs['Color'].default_value = (*colour, 1)
    tree.links.new(coordinates.outputs['UV'], mapping.inputs['Vector'])
    tree.links.new(mapping.outputs['Vector'], gradient.inputs['Vector'])
    tree.links.new(gradient.outputs['Fac'], scale.inputs[0])
    tree.links.new(scale.outputs['Value'], emission.inputs['Strength'])
    tree.links.new(emission.outputs['Emission'], out.inputs['Surface'])
    obj.data.materials.append(material)
    obj.visible_camera = False
    return obj


def _wave_mark(parent_list, material, y):
    """The ONDA mark on the back: three rising wave arcs under a dot, struck 0.15 mm proud."""
    for index, radius in enumerate((3.2, 5.4, 7.6)):
        bpy.ops.mesh.primitive_torus_add(major_radius=radius * MM, minor_radius=0.42 * MM, major_segments=64, minor_segments=8,
                                         location=(0, y * MM, (8 - index * 0.0) * MM), rotation=(math.pi / 2, 0, 0))
        arc = bpy.context.object
        arc.name = f'mark_wave_{index}'
        bm = bmesh.new()
        bm.from_mesh(arc.data)
        # Keep the upper 130 degrees of each ring: a crest.
        doomed = [v for v in bm.verts if math.degrees(math.atan2(v.co.y, v.co.x)) % 360 < 25 or math.degrees(math.atan2(v.co.y, v.co.x)) % 360 > 155]
        bmesh.ops.delete(bm, geom=doomed, context='VERTS')
        bm.to_mesh(arc.data)
        bm.free()
        arc.data.materials.append(material)
        parent_list.append(arc)
    parent_list.append(_cylinder('mark_dot', (0, y, 8), 1.1, 0.5, 'y', material))


def build():
    """Clears the scene and models the phone, the studio and the camera. Returns the parts by name."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    half_w, half_h, half_d = WIDTH / 2, HEIGHT / 2, DEPTH / 2

    metal = _brushed_metal()
    key_metal = _principled('key_polished_metal', (0.55, 0.6, 0.66), 1.0, 0.16)
    glass = _principled('front_glass', (0.004, 0.005, 0.007), 0.0, 0.025, coat=1.0)
    screen_glass = _principled('screen_glass', (0.0015, 0.002, 0.003), 0.0, 0.02, coat=1.0)
    back_glass = _principled('back_frosted_glass', (0.05, 0.075, 0.1), 0.0, 0.38, coat=0.4)
    band = _principled('antenna_band', (0.09, 0.1, 0.11), 0.0, 0.5)
    dark = _principled('opening_dark', (0.004, 0.004, 0.005), 0.0, 0.6)
    lens = _principled('lens_glass', (0.002, 0.003, 0.008), 0.0, 0.0, coat=1.0)
    lens_ring = _principled('lens_ring', (0.12, 0.13, 0.15), 1.0, 0.25)

    parts = []
    parts.append(_slab('frame', half_w, half_h, CORNER, -half_d, half_d, metal, bevel=2.3, bevel_segments=6))
    parts.append(_slab('front_glass', half_w - GLASS_INSET, half_h - GLASS_INSET, CORNER - GLASS_INSET,
                       -half_d - 0.42, -half_d + 0.6, glass, bevel=0.4, bevel_segments=4))
    parts.append(_slab('back_glass', half_w - GLASS_INSET, half_h - GLASS_INSET, CORNER - GLASS_INSET,
                       half_d - 0.6, half_d + 0.3, back_glass, bevel=0.28))
    screen = _slab('screen', half_w - SCREEN_INSET, half_h - SCREEN_INSET, SCREEN_CORNER, -half_d - 0.44, -half_d - 0.2, screen_glass)
    parts.append(screen)

    hole = _cylinder('camera_hole', (0, -half_d - 0.445, HOLE_Z), HOLE_RADIUS, 0.05, 'y', lens)
    hole_ring = _cylinder('camera_hole_ring', (0, -half_d - 0.44, HOLE_Z), HOLE_RADIUS + 0.28, 0.03, 'y', lens_ring)
    hole_glint = _cylinder('camera_hole_iris', (0, -half_d - 0.45, HOLE_Z), 0.7, 0.05, 'y',
                           _principled('lens_iris', (0.02, 0.03, 0.09), 0.3, 0.1, coat=1.0))
    parts += [hole, hole_ring, hole_glint]

    # Antenna breaks: four dark bands let into the flat of the frame, two a side.
    for z in (half_h - 21, -(half_h - 21)):
        parts.append(_box(f'antenna_break_{"top" if z > 0 else "bottom"}', (0, 0, z), (WIDTH + 0.04, 3.3, 1.0), band, bevel=0))
    # And two across the top and bottom edges.
    for x in (-half_w + 19, half_w - 19):
        parts.append(_box('antenna_break_end', (x, 0, 0), (1.0, 3.3, HEIGHT + 0.04), band, bevel=0))

    # Keys: two volume keys on the left, the ridged power key on the right.
    parts.append(_box('volume_up', (-half_w - 0.25, 0, 34), (1.3, 2.6, 11), key_metal, bevel=0.5))
    parts.append(_box('volume_down', (-half_w - 0.25, 0, 20), (1.3, 2.6, 11), key_metal, bevel=0.5))
    parts.append(_box('power_key', (half_w + 0.25, 0, 26), (1.3, 2.6, 15), key_metal, bevel=0.5))
    parts.append(_box('mute_slider', (-half_w - 0.2, 0, 49), (1.1, 2.2, 5), key_metal, bevel=0.4))

    # The bottom edge: the port and a speaker grille either side of it.
    parts.append(_box('port', (0, 0, -half_h + 0.2), (8.6, 2.7, 1.2), dark, bevel=0.9))
    for i in range(5):
        for side in (-1, 1):
            parts.append(_cylinder('grille', (side * (11 + i * 2.6), 0, -half_h + 0.1), 0.62, 0.8, 'z', dark, vertices=16))
    parts.append(_cylinder('microphone', (-24.5, 0, -half_h + 0.1), 0.4, 0.8, 'z', dark, vertices=12))

    # The back: a lens capsule and the mark.
    parts.append(_slab('lens_capsule', 6.5, 15, 6.4, half_d + 0.25, half_d + 1.5, key_metal, bevel=0.5))
    parts[-1].location = (-21 * MM, 0, 50 * MM)
    for z in (57, 43):
        parts.append(_cylinder('rear_lens', (-21, half_d + 1.5, z), 4.4, 0.3, 'y', lens))
    _wave_mark(parts, key_metal, half_d + 0.35)

    root = bpy.data.objects.new('onda_phone', None)
    scene.collection.objects.link(root)
    for part in parts:
        part.parent = root
    root.rotation_euler = Euler((math.radians(-POSE['tilt']), math.radians(POSE['roll']), math.radians(-POSE['yaw'])), 'ZXY')

    # The camera: a long lens half a metre away, level with the phone.
    camera_data = bpy.data.cameras.new('camera')
    camera_data.lens = 55
    camera_data.sensor_width = 36
    camera = bpy.data.objects.new('camera', camera_data)
    scene.collection.objects.link(camera)
    camera.location = (0, -0.62, 0)
    camera.rotation_euler = (math.pi / 2, 0, 0)
    scene.camera = camera

    # The studio: a dusk sky dome and soft panels. The key panel sits where the glass mirrors it, so a
    # soft diagonal sheen crosses the screen; a rim panel catches the left edge and the keys.
    world = bpy.data.worlds.new('studio')
    world.use_nodes = True
    tree = world.node_tree
    background = tree.nodes['Background']
    coordinates = tree.nodes.new('ShaderNodeTexCoord')
    separate = tree.nodes.new('ShaderNodeSeparateXYZ')
    ramp = tree.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (0.02, 0.022, 0.03, 1)
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = (0.32, 0.4, 0.55, 1)
    remap = tree.nodes.new('ShaderNodeMapRange')
    remap.inputs['From Min'].default_value = -1
    tree.links.new(coordinates.outputs['Generated'], separate.inputs['Vector'])
    tree.links.new(separate.outputs['Z'], remap.inputs['Value'])
    tree.links.new(remap.outputs['Result'], ramp.inputs['Fac'])
    tree.links.new(ramp.outputs['Color'], background.inputs['Color'])
    background.inputs['Strength'].default_value = 0.9
    scene.world = world

    # Only the sheen panel lights the glass (so the live screen stays readable); the others are
    # linked to the metal, the keys and the back.
    metalwork = bpy.data.collections.new('metalwork')
    scene.collection.children.link(metalwork)
    for part in parts:
        if part.name not in ('front_glass', 'screen', 'camera_hole', 'camera_hole_ring', 'camera_hole_iris'):
            metalwork.objects.link(part)
    bpy.context.view_layer.update()
    normal = (root.matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized()
    towards = Vector((0, 1, 0))
    mirrored = towards - 2 * towards.dot(normal) * normal
    centre = root.matrix_world @ Vector((0.012, 0, 0.03))
    sheen = _panel('sheen_panel', centre + mirrored * 0.4, (0.075, 0.5), 1.5, (0.9, 0.95, 1.0), target=centre)
    sheen.rotation_euler = (sheen.rotation_euler.to_quaternion() @ Euler((0, 0, math.radians(-32))).to_quaternion()).to_euler()
    for panel in (_panel('key_panel', (0.42, -0.5, 0.52), (0.5, 0.26), 9.0, (1.0, 0.97, 0.92)),
                  _panel('window_panel', (0.2, -0.75, 0.3), (0.1, 0.5), 5.0, (0.8, 0.9, 1.0)),
                  _panel('rim_panel', (-0.6, -0.18, 0.1), (0.3, 0.7), 9.0, (0.85, 0.92, 1.0)),
                  _panel('floor_panel', (0.05, -0.3, -0.5), (0.6, 0.3), 4.0, (1.0, 0.82, 0.62)),
                  _panel('right_panel', (0.6, 0.1, 0.0), (0.2, 0.6), 4.0)):
        panel.light_linking.receiver_collection = metalwork

    return {'root': root, 'screen': screen, 'parts': parts, 'camera': camera,
            'overlay': [screen, hole, hole_ring, hole_glint]}


def _to_pixels(scene, camera, point, width, height):
    view = world_to_camera_view(scene, camera, point)
    return (round(view.x * width, 2), round((1 - view.y) * height, 2))


def screen_corners(model, width, height):
    """The lit area's corners in image pixels: top left, top right, bottom right, bottom left."""
    scene = bpy.context.scene
    bpy.context.view_layer.update()
    half_w, half_h = (WIDTH / 2 - SCREEN_INSET) * MM, (HEIGHT / 2 - SCREEN_INSET) * MM
    y = (-DEPTH / 2 - 0.44) * MM
    matrix = model['root'].matrix_world
    corners = [(-half_w, half_h), (half_w, half_h), (half_w, -half_h), (-half_w, -half_h)]
    return [_to_pixels(scene, model['camera'], matrix @ Vector((x, y, z)), width, height) for x, z in corners]


def camera_hole(model, width, height):
    """The camera hole in image pixels: centre x, centre y, radius."""
    scene = bpy.context.scene
    matrix = model['root'].matrix_world
    y = (-DEPTH / 2 - 0.45) * MM
    centre = _to_pixels(scene, model['camera'], matrix @ Vector((0, y, HOLE_Z * MM)), width, height)
    edge = _to_pixels(scene, model['camera'], matrix @ Vector(((HOLE_RADIUS + 0.28) * MM, y, HOLE_Z * MM)), width, height)
    return (centre[0], centre[1], round(math.hypot(edge[0] - centre[0], edge[1] - centre[1]), 2))


def frame_camera(model, width, height, margin=0.035):
    """Fits the phone in the frame by sliding the lens (shift) and the distance."""
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    camera = model['camera']
    for _ in range(6):
        bpy.context.view_layer.update()
        points = []
        for part in model['parts']:
            for corner in part.bound_box:
                view = world_to_camera_view(scene, camera, part.matrix_world @ Vector(corner))
                points.append((view.x, view.y))
        min_x, max_x = min(p[0] for p in points), max(p[0] for p in points)
        min_y, max_y = min(p[1] for p in points), max(p[1] for p in points)
        fill = max((max_x - min_x), (max_y - min_y)) / (1 - 2 * margin)
        camera.location.y *= fill
        camera.location.x += ((min_x + max_x) / 2 - 0.5) * (36 / camera.data.lens) * -camera.location.y * (1 if width >= height else width / height)
        camera.location.z += ((min_y + max_y) / 2 - 0.5) * (36 / camera.data.lens) * -camera.location.y * (height / width if width >= height else 1)


def render_passes(model, out_dir, width, height, samples, device='CPU'):
    """Renders the body pass and the glass pass as RGBA PNG files. Returns their paths."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.device = device
    if device == 'GPU':
        preferences = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA'):
            try:
                preferences.compute_device_type = kind
                preferences.get_devices()
                for item in preferences.devices:
                    item.use = True
                break
            except Exception:
                continue
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '16'
    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'Medium High Contrast'
    paths = {}
    overlay = set(model['overlay'])
    for name in ('body', 'glass'):
        for part in model['parts']:
            part.is_holdout = name == 'glass' and part not in overlay
        scene.render.filepath = f'{out_dir}/onda_phone_{name}.png'
        bpy.ops.render.render(write_still=True)
        paths[name] = scene.render.filepath
    return paths
