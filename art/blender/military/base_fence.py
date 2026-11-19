"""Perimeter fence of the air base, built for instancing: one 6 m chain-link panel along X (posts at
both ends, top and bottom rails, three strands of barbed wire on arms angled 0.3 m towards +Y, 2.8 m
high) in 30 / 10 / 4 triangles, and the node gate_leaf, an 8 m framed leaf whose origin is its hinge
at x = -4 (the leaf closed spans x -4..+4). Everything is one alpha-tested, double-sided material
`cutout` whose 512 px texture this script paints itself: chain-link diamonds, a barbed-wire band and
a galvanised-steel band.
"""
import os

import bpy
import numpy as np
from PIL import Image

from lib import meshkit as mk

ASSET = {'id': 'base_fence', 'atlas': 512, 'kind': 'prop', 'views': ((20, 8, 1.6, (0, 0, 1.4)), (160, 20, 2.6, (-1.5, 0, 1.6)))}

WORK = '/tmp/marazul/flight/s2/art-base/base_fence'
CHAIN = (0.25, 1.0)      # v range of the chain-link rows
BARBED = (0.127, 0.248)  # the barbed-wire band
STEEL = (0.02, 0.105)    # solid galvanised steel


def paint_texture(path, size=512):
    rng = np.random.default_rng(7)
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    grey = 150.0 + rng.normal(0.0, 5.0, (size, size)).astype(np.float32)
    alpha = np.zeros((size, size), np.float32)
    shade = np.ones((size, size), np.float32)
    # chain-link: two families of diagonal wires, 16 px apart
    pitch, half = 16.0, 2.55
    a = np.minimum((x + y) % pitch, pitch - (x + y) % pitch)
    b = np.minimum((x - y) % pitch, pitch - (x - y) % pitch)
    near = np.minimum(a, b)
    chain = y < 384
    alpha[chain] = np.clip((half - near[chain]) + 0.5, 0.0, 1.0)
    shade[chain] = 0.72 + 0.4 * np.clip(1.0 - near[chain] / half, 0.0, 1.0)
    # barbed wire: three strands with barbs every 32 px
    band = (y >= 384) & (y < 448)
    wires = np.zeros((size, size), np.float32)
    for row in (395.0, 416.0, 437.0):
        wires = np.maximum(wires, np.clip(2.0 - np.abs(y - row), 0.0, 1.0))
        cx = (x % 32.0) - 16.0
        for slope in (1.0, -1.0):
            barb = np.clip(1.6 - np.abs((y - row) - slope * cx), 0.0, 1.0) * (np.abs(cx) < 5.5)
            wires = np.maximum(wires, barb)
    alpha[band] = wires[band]
    shade[band] = 0.8
    # solid steel with faint vertical streaks
    solid = y >= 448
    alpha[solid] = 1.0
    shade[solid] = (0.9 + 0.1 * np.sin(x * 0.7) * np.sin(x * 0.13))[solid]
    rgb = np.clip(grey * shade, 0, 255)
    pixels = np.stack([rgb * 0.97, rgb * 0.99, rgb, alpha * 255.0], axis=-1).astype(np.uint8)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(pixels, 'RGBA').save(path)
    return path


def cutout_material(path):
    mat = bpy.data.materials.new('cutout')
    mat.use_nodes = True
    mat.use_backface_culling = False
    tree = mat.node_tree
    shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    image = tree.nodes.new('ShaderNodeTexImage')
    image.image = bpy.data.images.load(path)
    tree.links.new(image.outputs['Color'], shader.inputs['Base Color'])
    tree.links.new(image.outputs['Alpha'], shader.inputs['Alpha'])
    shader.inputs['Roughness'].default_value = 0.55
    shader.inputs['Metallic'].default_value = 0.45
    return mat


class Sheet:
    """Collects quads with their UVs and turns them into one mesh."""

    def __init__(self):
        self.quads = []

    def quad(self, points, u, v):
        """points: bottom-left, bottom-right, top-right, top-left; u and v are (low, high)."""
        self.quads.append((points, ((u[0], v[0]), (u[1], v[0]), (u[1], v[1]), (u[0], v[1]))))

    def bar(self, start, end, width, across=(0, 1, 0)):
        """A flat steel bar from start to end, `width` wide along `across`."""
        h = [0.5 * width * c for c in across]
        self.quad([tuple(start[i] - h[i] for i in range(3)), tuple(start[i] + h[i] for i in range(3)),
                   tuple(end[i] + h[i] for i in range(3)), tuple(end[i] - h[i] for i in range(3))], (0.02, 0.06), STEEL)

    def post(self, x, y, top, size=0.08):
        s = 0.5 * size
        for (ax, ay), (bx, by) in (((-s, -s), (s, -s)), ((s, -s), (s, s)), ((s, s), (-s, s)), ((-s, s), (-s, -s))):
            self.quad([(x + ax, y + ay, 0), (x + bx, y + by, 0), (x + bx, y + by, top), (x + ax, y + ay, top)], (0.02, 0.07), STEEL)

    def mesh(self, name, material):
        verts = [p for points, _ in self.quads for p in points]
        obj = mk.mesh_object(name, verts, [tuple(range(4 * i, 4 * i + 4)) for i in range(len(self.quads))])
        layer = obj.data.uv_layers.new(name='UVMap')
        flat = [uv for _, uvs in self.quads for uv in uvs]
        for loop in obj.data.loops:
            layer.data[loop.index].uv = flat[loop.vertex_index]
        return mk.assign(obj, material)


def panel(level):
    s = Sheet()
    s.quad([(-3, 0, 0.05), (3, 0, 0.05), (3, 0, 2.5), (-3, 0, 2.5)], (0.0, 2.0), CHAIN)
    s.quad([(-3, 0.02, 2.56), (3, 0.02, 2.56), (3, 0.3, 2.8), (-3, 0.3, 2.8)], (0.0, 3.0), BARBED)
    if level == 0:
        for x in (-2.96, 2.96):
            s.post(x, 0, 2.6)
            s.bar((x, 0, 2.55), (x, 0.31, 2.81), 0.05, (1, 0, 0))
        s.bar((-3, 0, 2.5), (3, 0, 2.5), 0.06, (0, 0, 1))
        s.bar((-3, 0, 2.5), (3, 0, 2.5), 0.06, (0, 1, 0))
        s.bar((-3, 0, 0.06), (3, 0, 0.06), 0.05, (0, 0, 1))
    elif level == 1:
        for x in (-2.96, 2.96):
            s.bar((x, 0, 0), (x, 0, 2.6), 0.09, (1, 0, 0))
        s.bar((-3, 0, 2.5), (3, 0, 2.5), 0.06, (0, 0, 1))
    return s


def gate_leaf():
    s = Sheet()
    x0, x1, top = -3.96, 3.96, 2.5
    s.quad([(x0, 0, 0.12), (x1, 0, 0.12), (x1, 0, top), (x0, 0, top)], (0.0, 2.6), CHAIN)
    s.quad([(x0, 0, top + 0.02), (x1, 0, top + 0.02), (x1, 0, 2.8), (x0, 0, 2.8)], (0.0, 4.0), BARBED)
    for z in (0.12, top):
        s.bar((x0, 0, z), (x1, 0, z), 0.08, (0, 0, 1))
        s.bar((x0, 0, z), (x1, 0, z), 0.08, (0, 1, 0))
    for x in (x0, 0.0, x1):
        s.bar((x, 0, 0.12), (x, 0, top if x == 0.0 else 2.8), 0.08, (1, 0, 0))
        s.bar((x, 0, 0.12), (x, 0, top), 0.08, (0, 1, 0))
    s.bar((x0, 0.01, 0.16), (0.0, 0.01, top - 0.04), 0.06, (0, 0, 1))
    s.bar((0.0, 0.01, top - 0.04), (x1, 0.01, 0.16), 0.06, (0, 0, 1))
    s.bar((x1 - 0.5, 0, 0.0), (x1 - 0.5, 0, 0.14), 0.12, (1, 0, 0))   # the wheel under the free end
    return s


def make(a):
    material = cutout_material(paint_texture(os.path.join(WORK, 'cutout.png')))
    for level in range(3):
        a.part(panel(level).mesh('panel%d' % level, material), levels=(level,))
    a.moving(gate_leaf().mesh('gate_leaf', material), (-4.0, 0.0, 0.0))
    a.lod_distances = (45.0, 140.0)
    a.collider_box('panel', (6.0, 0.14, 2.8), (0, 0.0, 1.4))
    a.collider_box('gate_leaf', (8.0, 0.14, 2.6), (0, 0.0, 1.3))
    a.extra('panel_length', 6.0)
    a.extra('gate_leaf', {'length': 8.0, 'hinge_x': -4.0, 'axis': 'z', 'degrees': 90})
