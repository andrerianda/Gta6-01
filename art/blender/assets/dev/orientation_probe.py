"""Orientation probe: proves the axis and scale conventions from Blender to the game.

A 1 m x 2 m plate with three unmistakable markers: a yellow arrow along the asset's forward
(Blender +Y, the game's -Z), a green post pointing up to exactly 1.5 m (Blender +Z, the game's
+Y) and a red ball on its right side (+X in both). In the asset viewer the yellow arrow must
point away from the blue +Z axis line, the green post along the green +Y line, and the red ball
towards the red +X line; the plate must cover 1 x 2 squares of the 1 m grid.
"""
import math

from lib import build, modify, scene, shading
from lib import materials as M

ASSET = {
    'id': 'orientation_probe',
    'kind': 'dev',
}


def model_probe():
    grey = M.plastic(color=(0.35, 0.35, 0.36), roughness=0.6, scuffs=0.1, name='probe_grey')
    yellow = M.plastic(color=(0.85, 0.62, 0.02), roughness=0.5, scuffs=0.1, name='probe_forward')
    green = M.plastic(color=(0.05, 0.50, 0.08), roughness=0.5, scuffs=0.1, name='probe_up')
    red = M.plastic(color=(0.70, 0.03, 0.02), roughness=0.5, scuffs=0.1, name='probe_right')

    plate = build.box('plate', (1.0, 2.0, 0.1), on_ground=True)
    modify.bevel(plate, width=0.015, segments=2)
    plate.data.materials.append(grey)

    shaft = build.box('shaft', (0.16, 1.1, 0.08), location=(0.0, 0.25, 0.1), on_ground=True)
    head = build.extrude_outline('head', [(-0.26, 0.0), (0.26, 0.0), (0.0, 0.42)], 0.08,
                                 location=(0.0, 0.8, 0.1))
    arrow = scene.join([shaft, head])
    arrow.data.materials.append(yellow)

    post = build.cylinder('post', radius=0.06, depth=1.15, segments=16, location=(0.0, -0.45, 0.1),
                          on_ground=True)
    tip = build.cylinder('tip', radius=0.13, radius_top=0.0, depth=0.25, segments=16,
                         location=(0.0, -0.45, 1.25), on_ground=True)
    up = scene.join([post, tip])
    up.data.materials.append(green)

    ball = build.sphere('ball', radius=0.16, segments=24, rings=12, location=(0.5, -0.45, 0.26))
    ball.data.materials.append(red)

    probe = scene.join([plate, arrow, up, ball], 'probe')
    shading.smooth(probe, angle=math.radians(40))
    return probe


def make(a):
    a.add(model_probe())
    a.add_anchor('anchor_forward', (0.0, 1.22, 0.14), forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_up', (0.0, -0.45, 1.5), forward=(0.0, 0.0, 1.0), up=(0.0, -1.0, 0.0))
    a.collider_box('plate', (0.0, 0.0, 0.05), (1.0, 2.0, 0.1))
    a.bake(size=256, bevel_radius=0.006)
