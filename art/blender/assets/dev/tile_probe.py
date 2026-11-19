"""Tile probe: proves tiling materials next to atlas materials in one mesh.

Two stucco walls on a brick plinth meet at a corner over a paved floor, with a cast concrete
coping on top. The walls, plinth and floor use tile_* materials: each is baked once on a 2 m
square into its own repeating texture set and mapped in metres, which is how buildings get
sharp walls without a huge atlas. The coping is ordinary atlas material, baked uniquely with
its occlusion and worn edges.

In the asset viewer the stucco, brick courses and pavers must run unbroken along both walls and
across the floor, with bricks 0.25 m long in 0.0625 m rows and pavers 0.5 m square.
"""
import math

from lib import build, modify, scene, shading
from lib import materials as M

ASSET = {
    'id': 'tile_probe',
    'kind': 'dev',
    'atlas': 512,
    'budget': {'bytes': 450000},
}

PLINTH = 0.75
WALL_TOP = 3.0


def make(a):
    stucco = M.tile(M.stucco(color=M.hex_color('#f0b49c'), seed=3, name='tile_stucco'),
                    size=2.0, pixels=512)
    brick = M.tile(M.brick(brick_width=0.25, row_height=0.0625, seed=4, name='tile_brick'),
                   size=2.0, pixels=512)
    pavers = M.tile(M.tiles(size=0.5, seed=5, name='tile_pavers'), size=2.0, pixels=512,
                    facing='floor')
    concrete = M.concrete(seed=6, name='coping_concrete')

    parts = []
    # Two walls meeting at the back left corner; each is a stucco slab on a brick plinth.
    for name, size, location in (('back', (4.0, 0.3, 1.0), (0.0, 1.85, 0.0)),
                                 ('left', (0.3, 3.7, 1.0), (-1.85, -0.15, 0.0))):
        plinth = build.box(f'{name}_plinth', (size[0], size[1], PLINTH), location=location,
                           on_ground=True)
        wall = build.box(f'{name}_wall', (size[0], size[1], WALL_TOP - PLINTH),
                         location=(location[0], location[1], PLINTH), on_ground=True)
        coping = build.box(f'{name}_coping', (size[0] + 0.1, size[1] + 0.1, 0.09),
                           location=(location[0], location[1], WALL_TOP), on_ground=True)
        modify.bevel(coping, width=0.012, segments=2)
        parts += [scene.set_material(plinth, brick), scene.set_material(wall, stucco),
                  scene.set_material(coping, concrete)]
    floor = build.grid('floor', size=(4.0, 4.0), segments=(1, 1))
    parts.append(scene.set_material(floor, pavers))

    probe = scene.join(parts, 'walls')
    shading.smooth(probe, angle=math.radians(35))
    a.add(probe)
    a.collider_box('back', (0.0, 1.85, 1.5), (4.0, 0.3, 3.0))
    a.collider_box('left', (-1.85, -0.15, 1.5), (0.3, 3.7, 3.0))
    a.bake(bevel_radius=0.006)
