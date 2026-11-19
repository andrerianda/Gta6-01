"""Shapes and materials shared by the naval scripts: extruded flat-panel bodies, tapered blocks,
off-road wheels, the camouflage paint, and the two painted cutout textures (camouflage net, ship
railing). Blender axes while modelling: Z up, the front towards +Y, the right side towards +X.
"""
import math

import bpy
import numpy as np
from PIL import Image

from lib import meshkit as mk
from lib import surfaces as sf


# --- shapes ------------------------------------------------------------------------------------

def extrude_x(name, profile, x0, x1):
    """A flat-sided solid: a (y, z) outline swept from x0 to x1 (panels, cabs, fenders)."""
    n = len(profile)
    verts = [(x0, y, z) for y, z in profile] + [(x1, y, z) for y, z in profile]
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    faces += [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    return mk.recalc_normals(mk.mesh_object(name, verts, faces))


def frustum(name, base, top, z0, z1, centre=(0.0, 0.0), shift=(0.0, 0.0)):
    """A tapered block: a base rectangle (x, y) at z0 and a top rectangle at z1, the top moved by shift."""
    verts = []
    for (sx, sy), z, (ox, oy) in ((base, z0, (0.0, 0.0)), (top, z1, shift)):
        for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            verts.append((centre[0] + ox + dx * sx * 0.5, centre[1] + oy + dy * sy * 0.5, z))
    faces = [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return mk.recalc_normals(mk.mesh_object(name, verts, faces))


def mirror_copy(obj, name):
    """The left-hand twin of a right-hand part (mesh data mirrored across X = 0)."""
    return mk.transform(mk.duplicate(obj, name), scale=(-1, 1, 1))


def both(name, obj):
    """A part and its mirror image as one mesh."""
    return mk.join(name, [obj, mirror_copy(obj, name + '_mirror')])


def wheel(name, radius, width, tyre, hub, segments=16, rim=0.56):
    """An off-road wheel centred on the origin, axle along X, outer face towards +X: a square-shouldered
    tyre on a dished steel rim. Give the object a location to place it (the origin stays on the hub)."""
    profile = [(-0.5, rim * 0.72), (-0.5, rim), (-0.5, 0.86), (-0.42, 0.97), (-0.2, 1.0), (0.2, 1.0), (0.42, 0.97),
               (0.5, 0.86), (0.5, rim), (0.3, rim * 0.96), (0.26, rim * 0.5), (0.42, rim * 0.3)]
    rings = [[(side * width, math.sin(a) * radius * scale, math.cos(a) * radius * scale)
              for a in (2 * math.pi * i / segments for i in range(segments))] for side, scale in profile]
    obj = mk.loft(name, rings)
    mk.assign(obj, tyre)
    limit = radius * rim * 1.01
    mk.assign_faces(obj, hub, lambda c, n: math.hypot(c.y, c.z) < limit and c.x > -0.45 * width)
    return mk.shade(obj, 40)


def placed(obj, location, rotation=(0, 0, 0)):
    """Sets an object's location (and rotation, degrees): its mesh stays around its own origin."""
    obj.location = location
    obj.rotation_euler = [math.radians(a) for a in rotation]
    return obj


def pivot(obj, point):
    """Puts the origin (the hinge or hub in the game) at a point without moving the mesh."""
    return mk.set_origin(obj, point)


def boxes(name, material, specs, bevel=0.0):
    """Several boxes of one material as one mesh: specs are (size, centre) or (size, centre, rotation)."""
    parts = []
    for index, spec in enumerate(specs):
        if len(spec) > 2:
            part = mk.transform(mk.box('%s_%d' % (name, index), spec[0], (0, 0, 0), bevel), spec[1], spec[2])
        else:
            part = mk.box('%s_%d' % (name, index), spec[0], spec[1], bevel)
        parts.append(mk.assign(part, material))
    return mk.join(name, parts)


def seat(name, x, y, floor, cloth, width=0.46, back=0.5):
    """A plain military seat: a pad and a slightly raked back."""
    return boxes(name, cloth, [
        ((width, 0.46, 0.1), (x, y + 0.04, floor + 0.05)),
        ((width, 0.09, back), (x, y - 0.22, floor + 0.05 + back * 0.5), (-10, 0, 0)),
    ], 0.025)


def steering_wheel(name, radius, material):
    """A steering wheel around its own Z axis (the column), the rim in the local XY plane."""
    path = [(math.cos(a) * radius, math.sin(a) * radius, 0.0) for a in (2 * math.pi * i / 14 for i in range(15))]
    rim = mk.tube(name + '_rim', path, 0.016, 6)
    spokes = [mk.box(name + '_spoke', (radius * 2, 0.035, 0.012), (0, 0, -0.01)), mk.box(name + '_spoke2', (0.035, radius, 0.012), (0, -radius * 0.5, -0.01)),
              mk.cylinder(name + '_boss', 0.045, 0.05, (0, 0, -0.02), 'Z', 10), mk.cylinder(name + '_column', 0.02, 0.3, (0, 0, -0.17), 'Z', 6)]
    return mk.shade(mk.assign(mk.join(name, [rim] + spokes), material), 50)


# --- materials ---------------------------------------------------------------------------------

def matt(name, color, roughness=0.82, wear=0.35, metallic=0.0, panels=None, projection='side'):
    """A matt service coat with dirt and wear."""
    return sf.coated(name, color, roughness, metallic, wear, panels, projection, grain=0.18)


def camo_paint(name='paint', tint='#a8996b', dark=(0.46, 0.54, 0.51), scale=0.75, share=0.56):
    """Tintable camouflage: the paint colour is the light (sand) tone, and broad blotches of the
    darker tone (olive when the tint is sand) are baked into the texture as a multiplier (sRGB)."""
    mat, tree, shader = sf._principled(name)
    blotch = sf._ramp(tree, sf._noise(tree, scale, 1.6, 0.45), share - 0.012, share + 0.012)
    dirt = sf._ramp(tree, sf._noise(tree, 5.0, 4.0, 0.6), 0.25, 0.8)
    low = tuple(c ** 2.2 for c in dark) + (1.0,)
    colour = sf._mix(tree, blotch, low, (0.94, 0.94, 0.94, 1.0))
    shade = tree.nodes.new('ShaderNodeMapRange')
    shade.inputs['To Min'].default_value = 0.8
    shade.inputs['To Max'].default_value = 1.0
    tree.links.new(dirt, shade.inputs['Value'])
    colour = sf._mix(tree, 1.0, colour, shade.outputs['Result'], 'MULTIPLY')
    rough = tree.nodes.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value = 0.72
    rough.inputs['To Max'].default_value = 0.92
    tree.links.new(dirt, rough.inputs['Value'])
    bump = tree.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.12
    bump.inputs['Distance'].default_value = 0.004
    tree.links.new(sf._noise(tree, 30.0, 2.0), bump.inputs['Height'])
    tree.links.new(colour, shader.inputs['Base Color'])
    tree.links.new(rough.outputs['Result'], shader.inputs['Roughness'])
    tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    mat['paint_color'] = list(sf.hex_color(tint))
    return mat


def ring_marked(name, color, mark, centre, radius, width=0.35, roughness=0.75):
    """A deck coat with a painted circle (a landing mark) around a point, in object metres."""
    mat = sf.coated(name, color, roughness, 0.0, 0.35, None, 'top', grain=0.2)
    tree = mat.node_tree
    shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    source = shader.inputs['Base Color'].links[0].from_socket
    coords = tree.nodes.new('ShaderNodeTexCoord')
    distance = tree.nodes.new('ShaderNodeVectorMath')
    distance.operation = 'DISTANCE'
    distance.inputs[1].default_value = centre
    tree.links.new(coords.outputs['Object'], distance.inputs[0])
    offset = tree.nodes.new('ShaderNodeMath')
    offset.operation = 'SUBTRACT'
    offset.inputs[1].default_value = radius
    tree.links.new(distance.outputs['Value'], offset.inputs[0])
    absolute = tree.nodes.new('ShaderNodeMath')
    absolute.operation = 'ABSOLUTE'
    tree.links.new(offset.outputs[0], absolute.inputs[0])
    inside = tree.nodes.new('ShaderNodeMath')
    inside.operation = 'LESS_THAN'
    inside.inputs[1].default_value = width * 0.5
    tree.links.new(absolute.outputs[0], inside.inputs[0])
    tree.links.new(sf._mix(tree, inside.outputs[0], source, sf.hex_color(mark)), shader.inputs['Base Color'])
    return mat


def cutout_material(name, image_path, roughness=0.92):
    """An alpha-tested sheet (name it cutout_<what>): colour and alpha from a painted image, UVs as modelled."""
    mat, tree, shader = sf._principled(name)
    node = tree.nodes.new('ShaderNodeTexImage')
    node.image = bpy.data.images.load(image_path, check_existing=True)
    tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
    tree.links.new(node.outputs['Alpha'], shader.inputs['Alpha'])
    shader.inputs['Roughness'].default_value = roughness
    mat.use_backface_culling = False
    try:
        mat.blend_method = 'CLIP'
    except Exception:
        pass
    return mat


def uv_sheet(name, grid, uv_of):
    """A sheet through a grid of points (rows of equal length) with UVs uv_of(row, column, point)."""
    rows, columns = len(grid), len(grid[0])
    verts = [p for row in grid for p in row]
    faces = [(r * columns + c, r * columns + c + 1, (r + 1) * columns + c + 1, (r + 1) * columns + c)
             for r in range(rows - 1) for c in range(columns - 1)]
    obj = mk.mesh_object(name, verts, faces)
    layer = obj.data.uv_layers.new(name='atlas')
    for loop in obj.data.loops:
        index = loop.vertex_index
        layer.data[loop.index].uv = uv_of(index // columns, index % columns, verts[index])
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


# --- painted textures --------------------------------------------------------------------------

def _smooth_noise(rng, cells, size):
    """Tileable smooth noise 0..1: a random grid, wrapped and enlarged."""
    grid = (rng.random((cells, cells)) * 255).astype(np.uint8)
    big = Image.fromarray(np.tile(grid, (3, 3))).resize((size * 3, size * 3), Image.BICUBIC)
    return np.asarray(big, dtype=np.float32)[size:2 * size, size:2 * size] / 255.0


def _hex(text):
    text = text.lstrip('#')
    return np.array([int(text[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def net_texture(path, size=256, seed=7):
    """The camouflage net: leaf garnish in dark green, grey-green and brown tied into an open mesh."""
    rng = np.random.default_rng(seed)
    tone = _smooth_noise(rng, 7, size)
    tone2 = _smooth_noise(rng, 11, size)
    garnish = 0.6 * _smooth_noise(rng, 9, size) + 0.4 * _smooth_noise(rng, 26, size)
    colour = np.empty((size, size, 3), dtype=np.float32)
    colour[:] = _hex('#3d4731')
    colour[tone > 0.56] = _hex('#69705a')
    colour[tone2 > 0.66] = _hex('#5a4934')
    colour *= (0.82 + 0.36 * _smooth_noise(rng, 48, size))[..., None]
    step = size // 16
    yy, xx = np.mgrid[0:size, 0:size]
    mesh = ((xx % step) < 3) | ((yy % step) < 3)
    colour[mesh & (garnish <= 0.4)] = _hex('#2c3024')
    alpha = np.where((garnish > 0.4) | mesh, 255, 0).astype(np.uint8)
    image = np.dstack([np.clip(colour, 0, 255).astype(np.uint8), alpha])
    Image.fromarray(image, 'RGBA').save(path)
    return path


def rail_texture(path, size=64):
    """A ship's guard rail: one stanchion and three rails per tile, the rest see-through."""
    image = np.zeros((size, size, 4), dtype=np.uint8)
    image[..., :3] = (128, 134, 138)
    image[:, 0:5, 3] = 255
    for row in (2, 22, 42):
        image[row:row + 4, :, 3] = 255
    Image.fromarray(image, 'RGBA').save(path)
    return path
