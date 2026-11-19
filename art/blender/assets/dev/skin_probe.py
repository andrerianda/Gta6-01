"""Skin probe: proves skeletons, skinning and animation clips from Blender to the game.

A 1.6 m tapered fabric tube standing on a small base, skinned to three bones (root, mid, tip)
with smooth weights, with two clips: "wave" bends it to its right and back, "bow" bends it
forward. An anchor rides on the tip bone. In the asset viewer, clip=wave&time=0.5 must show the
tube bent towards +X with the anchor still on its end, and time=0 the straight rest pose.
"""
import math

from lib import build, profiles, rig, scene, shading
from lib import materials as M

ASSET = {
    'id': 'skin_probe',
    'kind': 'dev',
    'atlas': 256,
}

HEIGHT = 1.6
JOINTS = (0.0, 0.55, 1.05, HEIGHT)      # root, mid and tip bones run between these heights


def make(a):
    skeleton = rig.armature('rig', [
        ('root', (0.0, 0.0, JOINTS[0]), (0.0, 0.0, JOINTS[1]), None),
        ('mid', (0.0, 0.0, JOINTS[1]), (0.0, 0.0, JOINTS[2]), 'root'),
        ('tip', (0.0, 0.0, JOINTS[2]), (0.0, 0.0, JOINTS[3]), 'mid'),
    ])

    rings = 16
    tube = build.lathe('tube', [(profiles.lerp(0.12, 0.07, step / rings), HEIGHT * step / rings)
                                for step in range(rings + 1)], segments=12, cap_top=True)
    scene.set_material(tube, M.fabric(color=M.hex_color('#d9541e'), thread=0.012, seed=3,
                                      name='tube_cloth'))
    shading.smooth(tube, angle=math.radians(50))

    def weights(position):
        # Each bone owns its span and blends into its neighbour over 0.2 m around the joint.
        mid = profiles.smoothstep(JOINTS[1] - 0.1, JOINTS[1] + 0.1, position.z)
        tip = profiles.smoothstep(JOINTS[2] - 0.1, JOINTS[2] + 0.1, position.z)
        return {'root': 1.0 - mid, 'mid': mid - tip, 'tip': tip}

    tube.name = 'body'
    rig.bind(tube, skeleton, weights)

    # Rotations are about each bone's own axes: a bone built pointing up has its local Y along
    # its length, so Z leans it sideways and X leans it forward or back.
    rig.action(skeleton, 'wave', {1: {}, 15: {'mid': (0.0, 0.0, -0.6), 'tip': (0.0, 0.0, -0.8)}, 30: {}})
    rig.action(skeleton, 'bow', {1: {}, 20: {'root': (0.5, 0.0, 0.0), 'mid': (0.5, 0.0, 0.0)}, 40: {}})

    a.add_rig(skeleton)
    a.add(tube)
    anchor = a.add_anchor('anchor_tip', (0.0, 0.0, HEIGHT), forward=(0.0, 0.0, 1.0),
                          up=(0.0, -1.0, 0.0))
    rig.attach(anchor, skeleton, 'tip')
    a.bake(size=256)
