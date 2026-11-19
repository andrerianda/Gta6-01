"""A clean metric scene, Cycles settings for this machine or the GPU machine, and object plumbing.

Every asset build starts with reset_scene(). The Cycles settings follow the machine: on the
rented GPU machine the environment variable MARAZUL_GPU is 1 and Cycles renders on the GPU
(OptiX, else CUDA) with every thread; anywhere else it stays on the CPU with three threads so
one core is left for the other agents sharing this machine.
"""
import math
import os

import bpy
from mathutils import Matrix, Vector

CPU_THREADS = 3


def on_gpu_machine():
    """True on the rented GPU machine (MARAZUL_GPU=1): GPU rendering and high-quality defaults."""
    return os.environ.get('MARAZUL_GPU') == '1'


def quality(cpu_value, gpu_value):
    """Picks a sample count (or any setting) by machine: the cheap one on CPU, the fine one on GPU."""
    return gpu_value if on_gpu_machine() else cpu_value


def reset_scene():
    """Empties Blender, sets metric units (1 unit = 1 metre) and Cycles; returns the scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    configure_cycles(scene)
    return scene


def configure_cycles(scene, samples=16):
    """Selects Cycles on the right device with denoising; returns 'GPU' or 'CPU'."""
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = False
    if on_gpu_machine() and _enable_gpu_devices():
        scene.cycles.device = 'GPU'
        scene.render.threads_mode = 'AUTO'
        return 'GPU'
    scene.cycles.device = 'CPU'
    if on_gpu_machine():
        scene.render.threads_mode = 'AUTO'
    else:
        scene.render.threads_mode = 'FIXED'
        scene.render.threads = CPU_THREADS
    return 'CPU'


def _enable_gpu_devices():
    """Turns on every GPU device for OptiX, else CUDA; False when the machine has neither."""
    addon = bpy.context.preferences.addons.get('cycles')
    if addon is None:
        return False
    preferences = addon.preferences
    for backend in ('OPTIX', 'CUDA'):
        try:
            preferences.compute_device_type = backend
            preferences.get_devices()
        except (TypeError, RuntimeError):
            continue
        devices = [device for device in preferences.devices if device.type == backend]
        if devices:
            for device in preferences.devices:
                device.use = device.type == backend
            return True
    return False


# ---------------------------------------------------------------------------------------------
# Objects
# ---------------------------------------------------------------------------------------------

def link(obj, collection=None):
    """Links an object to a collection (the scene's root collection by default); returns it."""
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def new_object(name, mesh):
    """Wraps mesh data in an object named `name`, linked to the scene."""
    mesh.name = name
    return link(bpy.data.objects.new(name, mesh))


def activate(obj, others=()):
    """Makes `obj` the active, selected object (plus `others` selected) in object mode."""
    if bpy.context.object is not None and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for candidate in bpy.context.view_layer.objects:
        candidate.select_set(False)
    for other in others:
        other.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    return obj


def apply_transforms(obj):
    """Bakes the object's location, rotation and scale into its mesh; the object ends at identity."""
    matrix = obj.matrix_world.copy()
    obj.data.transform(matrix)
    if matrix.determinant() < 0:
        obj.data.flip_normals()
    obj.matrix_world = Matrix.Identity(4)
    obj.data.update()
    return obj


def move(obj, offset=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1)):
    """Transforms the mesh itself (scale, then XYZ Euler rotation in radians, then offset)."""
    from mathutils import Euler
    matrix = (Matrix.Translation(Vector(offset)) @ Euler(rotation, 'XYZ').to_matrix().to_4x4()
              @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0)))
    obj.data.transform(matrix)
    if matrix.determinant() < 0:
        obj.data.flip_normals()
    obj.data.update()
    return obj


def set_origin(obj, point):
    """Moves the object's origin to a world-space point without moving the mesh in the world."""
    point = Vector(point)
    local = obj.matrix_world.inverted() @ point
    obj.data.transform(Matrix.Translation(-local))
    obj.matrix_world = obj.matrix_world @ Matrix.Translation(local)
    obj.data.update()
    bpy.context.view_layer.update()
    return obj


def duplicate(obj, name=None, linked=False):
    """Copies an object (and its mesh unless `linked`); the copy is linked to the scene."""
    copy = obj.copy()
    if obj.data is not None and not linked:
        copy.data = obj.data.copy()
    if name:
        copy.name = name
        if copy.data is not None and not linked:
            copy.data.name = name
    return link(copy)


def join(objects, name=None):
    """Joins mesh objects into the first one (materials are kept per face); returns it."""
    objects = [obj for obj in objects if obj is not None]
    if not objects:
        raise ValueError('join() needs at least one object')
    target = objects[0]
    if len(objects) > 1:
        activate(target, objects[1:])
        bpy.ops.object.join()
    if name:
        target.name = name
        target.data.name = name
    return target


def delete(*objects):
    """Removes objects and their mesh data from the file."""
    for obj in objects:
        if obj is None:
            continue
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is not None and data.users == 0 and isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)


def parent_to(child, parent, keep_world=True):
    """Parents `child` to `parent`, keeping its place in the world by default."""
    bpy.context.view_layer.update()
    world = child.matrix_world.copy()
    child.parent = parent
    if keep_world:
        child.matrix_parent_inverse = Matrix.Identity(4)
        child.matrix_world = world
    bpy.context.view_layer.update()
    return child


def add_empty(name, location=(0, 0, 0), forward=None, up=(0, 0, 1), parent=None, size=0.1):
    """Adds an empty whose local +Y points along `forward` (the game's -Z) and local +Z along `up`."""
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = 'ARROWS'
    empty.empty_display_size = size
    link(empty)
    empty.matrix_world = Matrix.Translation(Vector(location)) @ facing_matrix(forward, up)
    if parent is not None:
        parent_to(empty, parent)
    return empty


def facing_matrix(forward=None, up=(0, 0, 1)):
    """A 4x4 rotation whose +Y axis is `forward` and whose +Z axis is as close to `up` as it can."""
    if forward is None:
        return Matrix.Identity(4)
    y_axis = Vector(forward).normalized()
    z_hint = Vector(up).normalized()
    if abs(y_axis.dot(z_hint)) > 0.999:
        z_hint = Vector((0, 1, 0)) if abs(y_axis.y) < 0.999 else Vector((1, 0, 0))
    x_axis = y_axis.cross(z_hint).normalized()
    z_axis = x_axis.cross(y_axis).normalized()
    rotation = Matrix((x_axis, y_axis, z_axis)).transposed()
    return rotation.to_4x4()


def world_bounds(objects):
    """The world-space bounding box of mesh objects as (minimum, maximum) Vectors."""
    bpy.context.view_layer.update()
    low = Vector((math.inf, math.inf, math.inf))
    high = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        if obj.type != 'MESH':
            continue
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            low = Vector((min(low.x, point.x), min(low.y, point.y), min(low.z, point.z)))
            high = Vector((max(high.x, point.x), max(high.y, point.y), max(high.z, point.z)))
    if low.x == math.inf:
        return Vector((0, 0, 0)), Vector((0, 0, 0))
    return low, high


def set_material(obj, material):
    """Gives the whole mesh one material, replacing whatever slots it had. Returns the object."""
    mesh = obj.data
    mesh.materials.clear()
    mesh.materials.append(material)
    mesh.polygons.foreach_set('material_index', [0] * len(mesh.polygons))
    mesh.update()
    return obj


def drop_empty_material_slots(obj):
    """Removes material slots that hold no material (a boolean on a bare mesh leaves one)."""
    mesh = obj.data
    kept = [index for index, material in enumerate(mesh.materials) if material is not None]
    if len(kept) == len(mesh.materials):
        return obj
    remap = {old: new for new, old in enumerate(kept)}
    indices = [remap.get(polygon.material_index, 0) for polygon in mesh.polygons]
    materials = [mesh.materials[index] for index in kept]
    mesh.materials.clear()
    for material in materials:
        mesh.materials.append(material)
    mesh.polygons.foreach_set('material_index', indices)
    mesh.update()
    return obj


def triangle_count(obj):
    """Triangles the object will have once triangulated (modifiers not applied)."""
    return sum(len(polygon.vertices) - 2 for polygon in obj.data.polygons)
