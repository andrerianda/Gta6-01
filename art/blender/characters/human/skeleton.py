"""The shared skeleton (game/src/characters/skeleton/humanSkeleton.js) from a person's body
parameters: joint positions at rest, bone rolls, the armature and the anchors.

Blender axes: Z up, the person faces +Y, their right is +X; the glTF export turns this into the
game's +Y up, -Z forward, +X right. The rest pose is the contract's A-pose: arms straight 40
degrees below horizontal, palms down, legs straight, feet hip-width apart, bones joint to joint.
Bone rolls copy the files the run-time was written against (BONE_Z below: each bone's local Z axis
at rest), so the anchors' local frames and every rest frame keep the same conventions.
"""
import math

import numpy as np

# name, parent (the run-time's order; the optional jaw is not built)
BONES = (
    ('root', None), ('hips', 'root'), ('spine', 'hips'), ('chest', 'spine'), ('neck', 'chest'), ('head', 'neck'),
    ('shoulder_l', 'chest'), ('upper_arm_l', 'shoulder_l'), ('forearm_l', 'upper_arm_l'), ('hand_l', 'forearm_l'),
    ('shoulder_r', 'chest'), ('upper_arm_r', 'shoulder_r'), ('forearm_r', 'upper_arm_r'), ('hand_r', 'forearm_r'),
    ('thigh_l', 'hips'), ('shin_l', 'thigh_l'), ('foot_l', 'shin_l'), ('toe_l', 'foot_l'),
    ('thigh_r', 'hips'), ('shin_r', 'thigh_r'), ('foot_r', 'shin_r'), ('toe_r', 'foot_r'),
)
BONE_NAMES = tuple(b for b, _ in BONES)
PARENT = dict(BONES)

# The local Z axis of each right-side and centre bone at rest (Blender axes); left bones mirror X.
BONE_Z = {
    'root': (0, -1, 0), 'hips': (0, -0.9978, -0.0665), 'spine': (0, -0.9962, -0.0872), 'chest': (0, -0.9995, -0.0324),
    'neck': (0, -0.9889, 0.1483), 'head': (0, -1, 0),
    'shoulder_r': (0.173, 0.155, 0.9726), 'upper_arm_r': (0.5051, 0.6426, 0.5762), 'forearm_r': (0.478, 0.6425, 0.5989),
    'hand_r': (0.4924, 0.6428, 0.5868),
    'thigh_r': (0, 0.9998, 0.0182), 'shin_r': (0, 0.9988, -0.0481), 'foot_r': (0.0041, 0.4048, 0.9144), 'toe_r': (0.0008, 0.0688, 0.9976),
}

# Anchors: parent bone and the local frame (position in metres for a 1.86 m body, quaternion
# x, y, z, w) relative to that bone's head, as the run-time's files define them.
ANCHORS = {
    'anchor_hand_r': ('hand_r', (-0.0228, 0.0682, -0.0142), (0.6797, -0.1949, 0.1949, 0.6797)),
    'anchor_hand_l': ('hand_l', (0.0228, 0.0682, -0.0142), (0.6797, 0.1949, -0.1949, 0.6797)),
}

ARM_DROP = 40.0  # degrees below horizontal at rest


def bone_z(name):
    if name.endswith('_l'):
        x, y, z = BONE_Z[name[:-2] + '_r']
        return (-x, y, z)
    return BONE_Z[name]


def joints(body):
    """Joint (bone head) positions and the leaf bones' tails for a body dict (see body.py
    defaults): returns {bone: (head, tail)} as numpy arrays, plus 'crown'."""
    H = body['height']
    female = body['sex'] == 'female'
    sw = body.get('shoulder_width', 1.0) * (0.92 if female else 1.0) * (0.97 + 0.06 * body.get('build', 0.5))
    hw = body.get('hip_width', 1.0) * (1.10 if female else 1.0) * (0.97 + 0.06 * body.get('weight', 0.4))
    leg = body.get('leg_length', 1.0)
    arm = body.get('arm_length', 1.0) * (0.97 if female else 1.0)
    s = H / 1.86
    # Heights as shares of the stature (a 1.86 m athletic man is the reference); the legs can be
    # longer or shorter with the trunk taking up the difference.
    hip_z = 0.547 * H * (0.5 + 0.5 * leg)
    thigh_z = hip_z - 0.0413 * s
    knee_z = 0.2805 * H * (0.5 + 0.5 * leg)
    ankle_z = 0.050 * H
    j = {}
    j['root'] = np.array([0, 0, 0.0])
    j['hips'] = np.array([0, 0, hip_z])
    trunk = (0.8400 * H - hip_z)  # hips to the base of the neck
    j['spine'] = np.array([0, -0.0083 * s, hip_z + 0.2077 * trunk])
    j['chest'] = np.array([0, -0.0227 * s, hip_z + 0.4851 * trunk])
    j['neck'] = np.array([0, -0.031 * s, 0.8400 * H])
    j['head'] = np.array([0, -0.0124 * s, 0.9067 * H])
    crown = np.array([0, -0.0124 * s, H])
    for side, sx in (('r', 1.0), ('l', -1.0)):
        j['shoulder_' + side] = np.array([sx * 0.031 * s, -0.0124 * s, 0.8212 * H])
        ua = np.array([sx * 0.0975 * H * sw, -0.031 * s, 0.8083 * H])
        j['upper_arm_' + side] = ua
        drop = math.radians(ARM_DROP)
        d = np.array([sx * math.cos(drop), 0.0, -math.sin(drop)])
        upper = 0.1667 * H * arm
        fore = 0.1473 * H * arm
        el = ua + d * upper + np.array([0, -0.008 * s, 0])
        j['forearm_' + side] = el
        wr = el + d * fore + np.array([0, 0.008 * s, 0])
        j['hand_' + side] = wr
        j['hand_tip_' + side] = wr + d * 0.105 * H * arm * 0.55
        j['thigh_' + side] = np.array([sx * 0.0511 * H * hw, 0.0, thigh_z])
        j['shin_' + side] = np.array([sx * 0.0511 * H * hw, 0.0083 * s, knee_z])
        j['foot_' + side] = np.array([sx * 0.0511 * H * hw, -0.0124 * s, ankle_z])
        j['toe_' + side] = np.array([sx * (0.0511 * H * hw + 0.0031 * s), 0.1323 * s, 0.0289 * s])
        j['toe_tip_' + side] = j['toe_' + side] + np.array([sx * 0.0015, 0.055 * s, -0.004 * s])
    j['crown'] = crown
    out = {}
    children = {}
    for name, parent in BONES:
        if parent:
            children.setdefault(parent, []).append(name)
    for name, _ in BONES:
        head = j[name]
        if name == 'root':
            tail = head + np.array([0, 0, 0.1 * s])
        elif name == 'hips':
            tail = j['spine']
        elif name == 'chest':
            tail = j['neck']
        elif name == 'head':
            tail = crown
        elif name.startswith('shoulder_'):
            tail = j['upper_arm_' + name[-1]]
        elif name.startswith('hand_'):
            tail = j['hand_tip_' + name[-1]]
        elif name.startswith('toe_'):
            tail = j['toe_tip_' + name[-1]]
        else:
            tail = j[children[name][0]]
        out[name] = (head.astype(np.float64), tail.astype(np.float64))
    out['crown'] = (crown, crown)
    return out


def bone_frame(head, tail, z_hint):
    """The bone's rest frame as columns X, Y (along the bone), Z (closest to z_hint)."""
    y = np.asarray(tail, float) - np.asarray(head, float)
    y /= np.linalg.norm(y)
    z = np.asarray(z_hint, float)
    z = z - y * np.dot(z, y)
    z /= np.linalg.norm(z)
    x = np.cross(y, z)
    return np.stack([x, y, z], axis=1)


def quat_matrix(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def anchor_frames(J, body):
    """World matrices (4x4, Blender axes) of the person anchors: {name: (bone, matrix)}."""
    s = body['height'] / 1.86
    out = {}
    for name, (bone, t, q) in ANCHORS.items():
        head, tail = J[bone]
        R = bone_frame(head, tail, bone_z(bone))
        M = np.eye(4)
        M[:3, :3] = R @ quat_matrix(q)
        M[:3, 3] = head + R @ (np.asarray(t) * s)
        out[name] = (bone, M)

    def frame(y_axis, z_axis, pos):
        y = np.asarray(y_axis, float)
        z = np.asarray(z_axis, float)
        x = np.cross(y, z)
        M = np.eye(4)
        M[:3, :3] = np.stack([x, y, z], axis=1)
        M[:3, 3] = pos
        return M
    crown = J['crown'][0]
    out['anchor_head'] = ('head', frame((0, 0, 1), (0, -1, 0), crown))
    chest = J['chest'][0]
    depth = body.get('_back_y', -0.1423 * s)
    out['anchor_back'] = ('chest', frame((0, 0, 1), (0, 1, 0), (0, depth, chest[2] + 0.129 * s)))
    hip = J['hips'][0]
    out['anchor_hip_r'] = ('hips', frame((0, 1, 0), (0, 0, 1), (body.get('_hip_side', 0.2074 * s), 0.0, hip[2] - 0.0206 * s)))
    return out


def build_armature(J, name='rig'):
    """The Blender armature object (named rig, as the run-time's files) with the 22 bones."""
    import bpy
    from mathutils import Vector
    data = bpy.data.armatures.new(name)
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    edit = {}
    for bone, parent in BONES:
        head, tail = J[bone]
        eb = data.edit_bones.new(bone)
        eb.head = Vector(head)
        eb.tail = Vector(tail)
        eb.align_roll(Vector(bone_z(bone)))
        if parent:
            eb.parent = edit[parent]
            eb.use_connect = False
        eb.use_deform = bone != 'root'
        edit[bone] = eb
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj


def add_anchors(rig, frames):
    """Empties parented to their bones at the given world matrices."""
    import bpy
    from mathutils import Matrix
    made = []
    for name, (bone, M) in frames.items():
        empty = bpy.data.objects.new(name, None)
        empty.empty_display_size = 0.03
        bpy.context.scene.collection.objects.link(empty)
        empty.parent = rig
        empty.parent_type = 'BONE'
        empty.parent_bone = bone
        bpy.context.view_layer.update()
        empty.matrix_world = Matrix([list(r) for r in M])
        made.append(empty)
    bpy.context.view_layer.update()
    return made
