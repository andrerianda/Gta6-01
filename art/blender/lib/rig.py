"""Skeletons, skinning and keyframed actions for characters and anything else that bends.

    skeleton = rig.armature('rig', [('root', (0, 0, 0), (0, 0, 0.3), None),
                                    ('spine', (0, 0, 0.3), (0, 0, 0.7), 'root')])
    rig.bind(body, skeleton, weights=lambda position: {'spine': 1.0})
    rig.action(skeleton, 'idle', {1: {}, 20: {'spine': (0.1, 0, 0)}, 40: {}})
    a.add_rig(skeleton)
    a.add(body)

Bones are named in lower case with underscores (the shared humanoid names are
naming.SKELETON_BONES); a bone's name is its node name in the game and the name of the vertex
group that follows it. Each action becomes one animation clip of that name in the .glb. The mesh
is baked in the rest pose, which is the pose the bones are created in.
"""
import bpy
from mathutils import Euler, Vector

from . import scene


def armature(name, bones):
    """Creates an armature object from (name, head, tail, parent name or None) tuples.

    Head and tail are positions in metres in Blender axes; list parents before their children.
    A bone whose head sits on its parent's tail is connected to it.
    """
    data = bpy.data.armatures.new(name)
    obj = bpy.data.objects.new(name, data)
    scene.link(obj)
    scene.activate(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    for bone_name, head, tail, parent in bones:
        bone = data.edit_bones.new(bone_name)
        bone.head = Vector(head)
        bone.tail = Vector(tail)
        if parent is not None:
            bone.parent = data.edit_bones[parent]
            bone.use_connect = (bone.parent.tail - bone.head).length < 1e-5
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj


def bind(obj, skeleton, weights=None):
    """Skins a mesh to a skeleton.

    weights: a function position -> {bone name: weight} called for every vertex (weights are
    normalised; at most four bones per vertex reach the game). Without it Blender's automatic
    weights are used, which need a closed, reasonably dense mesh.
    """
    if weights is None:
        scene.activate(skeleton, [obj])
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        return obj
    obj.parent = skeleton
    modifier = obj.modifiers.new('armature', 'ARMATURE')
    modifier.object = skeleton
    groups = {bone.name: obj.vertex_groups.new(name=bone.name) for bone in skeleton.data.bones}
    for vertex in obj.data.vertices:
        influences = sorted(weights(vertex.co.copy()).items(), key=lambda item: -item[1])[:4]
        total = sum(weight for _bone, weight in influences) or 1.0
        for bone_name, weight in influences:
            if weight > 0.0:
                groups[bone_name].add([vertex.index], weight / total, 'REPLACE')
    return obj


def action(skeleton, name, keys, fps=30):
    """Creates an animation clip from keyframes and returns the action.

    keys: {frame: {bone name: (x, y, z) rotation in radians, or ((x, y, z), (dx, dy, dz)) to
    move the bone as well}}. Bones not named in a frame are keyed at rest in that frame, so a
    clip that starts and ends with {} loops from and to the rest pose. Frames are at `fps`.
    """
    bpy.context.scene.render.fps = fps
    animation = skeleton.animation_data or skeleton.animation_data_create()
    clip = bpy.data.actions.new(name)
    animation.action = clip
    moving = sorted({bone for frame in keys.values() for bone in frame})
    shifted = {bone for frame in keys.values() for bone, value in frame.items()
               if isinstance(value[0], (tuple, list))}
    for bone_name in moving:
        skeleton.pose.bones[bone_name].rotation_mode = 'XYZ'
    for frame in sorted(keys):
        for bone_name in moving:
            pose_bone = skeleton.pose.bones[bone_name]
            value = keys[frame].get(bone_name, (0.0, 0.0, 0.0))
            rotation, offset = value if isinstance(value[0], (tuple, list)) else (value, None)
            pose_bone.rotation_euler = Euler(rotation, 'XYZ')
            pose_bone.keyframe_insert('rotation_euler', frame=frame)
            if bone_name in shifted:
                pose_bone.location = Vector(offset or (0.0, 0.0, 0.0))
                pose_bone.keyframe_insert('location', frame=frame)
    # Park the action on its own NLA track: that is where the exporter collects clips from.
    track = animation.nla_tracks.new()
    track.name = name
    track.strips.new(name, int(min(keys)), clip)
    animation.action = None
    for bone_name in moving:
        pose_bone = skeleton.pose.bones[bone_name]
        pose_bone.rotation_euler = Euler((0.0, 0.0, 0.0), 'XYZ')
        pose_bone.location = Vector((0.0, 0.0, 0.0))
    return clip


def attach(obj, skeleton, bone_name):
    """Parents an object (an anchor empty, a rigid prop) to a bone, keeping it where it is; in
    the game it is a child of that bone's node and moves with it."""
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = skeleton
    obj.parent_type = 'BONE'
    obj.parent_bone = bone_name
    bpy.context.view_layer.update()
    obj.matrix_world = world
    bpy.context.view_layer.update()
    return obj


def rest(skeleton, at_rest=True):
    """Holds the skeleton in its rest pose (for baking and export) or releases it."""
    skeleton.data.pose_position = 'REST' if at_rest else 'POSE'
    bpy.context.view_layer.update()
