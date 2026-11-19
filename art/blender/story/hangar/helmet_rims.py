"""What the pilot sees of his own helmet, modelled in CAMERA space: the camera is at the origin and
looks along +Y here (the game's -Z), Z up, framed for a 60 degree vertical field of view at 16:9
(at depth d the picture is 1.026 d wide and 0.577 d high from the centre). Nothing is nearer than
0.14 m to the origin and the middle 70 % of the picture stays clear.

helmet_visor_rim: the flight helmet's padded edge roll round a wide visor opening (a dark arc along
the top, a little at the sides), the cheek pads and the top of the oxygen mask along the bottom, the
visor pivots, and the tinted visor `visor_glass` whose lower edge crosses just under the clear zone.
pressure_helmet_rim: a full pressure helmet's thick round faceplate frame with bolts and a feed
port (only its side arcs and corners are in the picture), the neck ring below, and `visor_glass`.
"""
import math
import os

import bpy
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import _base_kit as kit
import _hk as hk
from lib import meshkit as mk
from lib import surfaces as sf

A = 0.150   # half width of the visor opening at 0.16 m depth


def opening(theta, power=3.2):
    c, s = math.cos(theta), math.sin(theta)
    ex = math.copysign(abs(c) ** (2 / power), c)
    ez = math.copysign(abs(s) ** (2 / power), s)
    x = A * ex
    top = 0.077 - 0.022 * (x / A) ** 2
    bottom = 0.090 - 0.024 * math.exp(-(x / 0.04) ** 2) - 0.012 * (abs(x) / A) ** 3
    return x, ez * (top if ez >= 0 else bottom)


def glass_image(path, fog=0.2, seed=2, round_edge=False):
    """The visor's tint and alpha: a faint warm tint, smudged edges, breath fog low down, fine scratches."""
    w, h = 512, 288
    rng = np.random.default_rng(seed)

    def cloud(cells):
        small = Image.fromarray((rng.random((cells * h // w + 2, cells + 2)) * 255).astype(np.uint8))
        return np.asarray(small.resize((w, h), Image.BICUBIC), dtype=np.float32) / 255.0

    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xx / (w - 1) * 2 - 1, 1 - yy / (h - 1) * 2
    edge = np.hypot(u, v) / 1.0 if round_edge else np.maximum(np.abs(u), np.abs(v))
    alpha = 0.055 + 0.3 * np.clip((edge - 0.55) / 0.45, 0, 1) ** 2 * (0.4 + 0.9 * cloud(14))
    alpha += fog * np.clip((-v - 0.35) / 0.65, 0, 1) ** 1.5 * (0.5 + 0.7 * cloud(8))
    smudge = np.clip(cloud(5) * cloud(22) * 2.2 - 0.55, 0, 1)
    alpha += 0.12 * smudge
    colour = np.empty((h, w, 3), dtype=np.float32)
    colour[:] = (236, 196, 150)
    colour += (np.clip(alpha - 0.08, 0, 1) * 60)[..., None]
    lines = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(lines)
    for x0, y0, x1, y1 in ((120, 70, 205, 58), (330, 190, 372, 214), (410, 60, 438, 96)):
        draw.line([(x0, y0), (x1, y1)], fill=255, width=1)
    scratch = np.asarray(lines.filter(ImageFilter.GaussianBlur(0.5)), dtype=np.float32) / 255.0
    alpha += 0.4 * scratch
    colour += (scratch * 80)[..., None]
    image = np.dstack([np.clip(colour, 0, 255), np.clip(alpha, 0, 1) * 255]).astype(np.uint8)
    Image.fromarray(image, 'RGBA').save(path)
    return path


def glass_material(path):
    mat, tree, shader = sf._principled('glass_visor')
    node = tree.nodes.new('ShaderNodeTexImage')
    node.image = bpy.data.images.load(path, check_existing=True)
    tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
    tree.links.new(node.outputs['Alpha'], shader.inputs['Alpha'])
    shader.inputs['Roughness'].default_value = 0.08
    mat['alpha'] = 1.0
    mat.use_backface_culling = False
    try:
        mat.blend_method = 'BLEND'
    except Exception:
        pass
    return mat


def glass_sheet(points_of, columns, rows, material):
    """The visor: a grid with UVs 0..1 (u across, v up)."""
    verts = [points_of(i / (columns - 1), j / (rows - 1)) for j in range(rows) for i in range(columns)]
    faces = [(j * columns + i, j * columns + i + 1, (j + 1) * columns + i + 1, (j + 1) * columns + i) for j in range(rows - 1) for i in range(columns - 1)]
    obj = mk.mesh_object('visor_glass', verts, faces)
    layer = obj.data.uv_layers.new(name='UVMap')
    for loop in obj.data.loops:
        layer.data[loop.index].uv = (loop.vertex_index % columns / (columns - 1), loop.vertex_index // columns / (rows - 1))
    for poly in obj.data.polygons:
        poly.use_smooth = True
    kit.orient(obj, (0, 0, 0), False)
    return mk.assign(obj, material)


def make_visor(a, work_dir):
    pad = sf.coated('edge_roll', '#1b1c1e', 0.85, 0.0, 0.5, grain=0.3)
    shell = sf.coated('helmet_shell', '#5f6455', 0.5, 0.0, 0.45, grain=0.15)
    rubber = sf.rubber('mask_rubber', '#232527')
    cloth = hk.canvas('cheek_pad', '#2c2e2b', 0.4, 0.35)
    metal = kit.galvanised('visor_fittings', '#6f7376')
    count = 56
    profile = [(0.985, 0.146), (0.97, 0.156), (0.985, 0.166), (1.03, 0.172), (1.12, 0.174), (1.35, 0.160), (1.9, 0.11)]
    rings = []
    for scale, depth in profile:
        ring = []
        for i in range(count):
            x, z = opening(2 * math.pi * i / count)
            ring.append((x * scale, depth, z * scale))
        rings.append(ring)
    rim = mk.loft('rim', rings, cap_start=False, cap_end=False)
    kit.orient(rim, (0, 0, 0), False)
    mk.assign(rim, shell)
    mk.assign_faces(rim, pad, lambda c, n: c.y > 0.15 and math.hypot(c.x / (A * 1.09), c.z / 0.088) < 1.0 or c.y > 0.168 and abs(c.x) < A * 1.1 and abs(c.z) < 0.098)
    mk.shade(rim, 70)
    parts = [rim]
    # the top of the oxygen mask with its nose bridge, the cheek pads, the visor pivots
    parts.append(hk.ellipsoid('mask', (0.052, 0.03, 0.04), (0.0, 0.152, -0.114), rubber, 14, 8))
    parts.append(hk.ellipsoid('mask_bridge', (0.016, 0.014, 0.016), (0.0, 0.148, -0.083), rubber, 10, 6))
    for sx in (-1, 1):
        parts.append(hk.ellipsoid('cheek', (0.05, 0.03, 0.036), (sx * 0.128, 0.152, -0.112), cloth, 12, 7))
        parts.append(kit.rod('mask_strap', [(sx * 0.045, 0.158, -0.105), (sx * 0.1, 0.166, -0.1), (sx * 0.16, 0.165, -0.085)], 0.006, rubber, 5))
        parts.append(mk.shade(mk.assign(mk.cylinder('pivot', 0.018, 0.012, (sx * 0.172, 0.176, 0.022), 'Y', 10), metal), 50))
        parts.append(kit.block('pivot_arm', (0.012, 0.006, 0.05), (sx * 0.168, 0.178, 0.0), metal, (0, sx * 12, 0)))
    # the visor glass and the dark trim on its lower edge

    def low(x):
        return -0.076 - 0.004 * math.cos(math.pi * x / 0.3)

    def glass_point(u, v):
        x = -0.2 + 0.4 * u
        return (x, 0.184 - 0.55 * x * x, low(x) + (0.115 - low(x)) * v)

    trim = mk.shade(kit.rod('visor_trim', [(x, 0.1835 - 0.55 * x * x, low(x)) for x in (-0.2 + 0.4 * i / 20 for i in range(21))], 0.0022, rubber, 5), 60)
    parts.append(trim)
    a.add(mk.join('lod0', parts))
    a.add(glass_sheet(glass_point, 15, 6, glass_material(glass_image(os.path.join(work_dir, 'visor.png'), 0.2))))
    a.extra('camera', {'fov': 60, 'aspect': '16:9', 'nearest': 0.14})


def make_pressure(a, work_dir):
    metal = kit.weathered('frame_metal', '#8d9296', 0.38, 0.9, 0.4)
    dark = sf.coated('frame_seal', '#191a1c', 0.7, 0.0, 0.4, grain=0.2)
    white = sf.coated('helmet_white', '#c9c8c0', 0.45, 0.0, 0.4, grain=0.12)
    brass = kit.galvanised('feed_port', '#a08a52')
    count = 48
    profile = [(0.129, 0.146), (0.1225, 0.156), (0.127, 0.166), (0.139, 0.172), (0.160, 0.172), (0.172, 0.164), (0.182, 0.13), (0.21, 0.1)]
    rings = [[(r * math.cos(2 * math.pi * i / count), y, r * math.sin(2 * math.pi * i / count)) for i in range(count)] for r, y in profile]
    frame = mk.loft('frame', rings, cap_start=False, cap_end=False)
    kit.orient(frame, (0, 0, 0), False)
    mk.assign(frame, metal)
    mk.assign_faces(frame, dark, lambda c, n: math.hypot(c.x, c.z) < 0.1262)
    mk.assign_faces(frame, white, lambda c, n: math.hypot(c.x, c.z) > 0.176)
    mk.shade(frame, 50)
    parts = [frame]
    for i in range(16):
        angle = 2 * math.pi * (i + 0.5) / 16
        parts.append(mk.assign(mk.cylinder('bolt', 0.0062, 0.007, (0.1495 * math.cos(angle), 0.1695, 0.1495 * math.sin(angle)), 'Y', 6), brass if i % 4 == 0 else metal))
    # the feed port low on the right, with its cap chain
    angle = math.radians(-36)
    px, pz = 0.154 * math.cos(angle), 0.154 * math.sin(angle)
    parts.append(mk.shade(mk.assign(mk.cylinder('port', 0.013, 0.02, (px, 0.164, pz), 'Y', 10), brass), 50))
    parts.append(mk.shade(mk.assign(mk.cylinder('port_cap', 0.009, 0.012, (px, 0.152, pz), 'Y', 10), dark), 50))
    parts.append(kit.rod('port_chain', [(px, 0.16, pz - 0.013), (px - 0.012, 0.165, pz - 0.03), (px - 0.03, 0.168, pz - 0.028)], 0.0015, metal, 4))
    # the neck ring with its locking lugs, below the picture until he looks down
    centre = (0.0, 0.03, -0.215)
    loop = [(centre[0] + 0.165 * math.cos(2 * math.pi * i / 28), centre[1] + 0.165 * math.sin(2 * math.pi * i / 28), centre[2]) for i in range(28)]
    parts.append(mk.shade(kit.rod('neck_ring', loop + loop[:2], 0.016, metal, 6), 60))
    upper = [(p[0] * 0.97, centre[1] + (p[1] - centre[1]) * 0.97, centre[2] + 0.03) for p in loop]
    parts.append(mk.shade(kit.rod('neck_seal', upper + upper[:2], 0.011, dark, 5), 60))
    for i in range(8):
        angle = 2 * math.pi * i / 8
        parts.append(kit.block('lug', (0.03, 0.018, 0.022), (centre[0] + 0.182 * math.cos(angle), centre[1] + 0.182 * math.sin(angle), centre[2]), metal,
                               (0, 0, math.degrees(angle) + 90), 0.003))
    a.add(mk.join('lod0', parts))

    def glass_point(u, v):
        x, z = -0.15 + 0.3 * u, -0.15 + 0.3 * v
        return (x, 0.186 - 0.6 * (x * x + z * z), z)

    a.add(glass_sheet(glass_point, 11, 11, glass_material(glass_image(os.path.join(work_dir, 'faceplate.png'), 0.3, 6, True))))
    a.extra('camera', {'fov': 60, 'aspect': '16:9', 'nearest': 0.14})
