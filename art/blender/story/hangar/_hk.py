"""Shared helpers of the story hangar assets (art/build_story_hangar.py): painted lettering that is
baked into the atlas (an image read through the point attribute 'duv', which survives the atlas
unwrap), ribbons (the red streamers), cloth sheets, and an unwrap that gives chosen meshes a larger
or smaller share of the atlas (object property 'texel').

Blender axes while modelling: Z up, the front (the game's -Z) towards +Y, the right towards +X.
"""
import math
import os
import random

import bpy
import numpy as np
from mathutils import Vector
from PIL import Image, ImageDraw, ImageFont

from lib import meshkit as mk
from lib import surfaces as sf

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


# --- painted images ------------------------------------------------------------------------------

def _rgb(text):
    text = text.lstrip('#')
    return tuple(int(text[i:i + 2], 16) for i in (0, 2, 4))


def board_image(path, lines, size=(512, 256), fg='#e8e4d6', bg='#2b2f2a', border=None, stripe=None, worn=0.25, seed=1):
    """A lettered board: lines are text or (text, share of the height); returns the image path."""
    w, h = size
    image = Image.new('RGB', size, _rgb(bg))
    draw = ImageDraw.Draw(image)
    top = int(h * 0.08)
    if stripe:
        band = int(h * 0.16)
        for x in range(-h, w, band * 2):
            draw.polygon([(x, 0), (x + band, 0), (x + band + band, band), (x + band, band)], fill=_rgb(stripe))
        top += band
    if border:
        draw.rectangle([3, 3, w - 4, h - 4], outline=_rgb(border), width=max(3, h // 40))
    rows = [(l, None) if isinstance(l, str) else l for l in lines]
    free = h - top - int(h * 0.06)
    default = 0.8 / max(1, len(rows))
    y = top
    for text, share in rows:
        px = int(free * (share or default))
        font = ImageFont.truetype(FONT, px)
        while draw.textlength(text, font=font) > w * 0.92 and px > 6:
            px -= 1
            font = ImageFont.truetype(FONT, px)
        draw.text(((w - draw.textlength(text, font=font)) / 2, y), text, font=font, fill=_rgb(fg))
        y += int(free * (share or default) * 1.22)
    rng = np.random.default_rng(seed)
    data = np.asarray(image, dtype=np.float32)
    small = Image.fromarray((rng.random((h // 8 + 1, w // 8 + 1)) * 255).astype(np.uint8)).resize(size, Image.BICUBIC)
    dirt = np.asarray(small, dtype=np.float32)[..., None] / 255.0
    data = data * (1.0 - worn * dirt) + worn * dirt * 70.0
    Image.fromarray(np.clip(data, 0, 255).astype(np.uint8)).save(path)
    return path


def decal_material(name, path, roughness=0.75, gloss_from_dark=0.0, metallic=0.0):
    """A material whose colour is an image read through the point attribute 'duv' (0..1)."""
    mat, tree, shader = sf._principled(name)
    attr = tree.nodes.new('ShaderNodeAttribute')
    attr.attribute_name = 'duv'
    node = tree.nodes.new('ShaderNodeTexImage')
    node.image = bpy.data.images.load(path, check_existing=True)
    node.extension = 'EXTEND'
    tree.links.new(attr.outputs['Vector'], node.inputs['Vector'])
    tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    if gloss_from_dark:
        grey = tree.nodes.new('ShaderNodeRGBToBW')
        tree.links.new(node.outputs['Color'], grey.inputs['Color'])
        ramp = tree.nodes.new('ShaderNodeMapRange')
        ramp.inputs['From Min'].default_value = 0.01
        ramp.inputs['From Max'].default_value = 0.12
        ramp.inputs['To Min'].default_value = roughness - gloss_from_dark
        ramp.inputs['To Max'].default_value = roughness
        tree.links.new(grey.outputs['Val'], ramp.inputs['Value'])
        tree.links.new(ramp.outputs['Result'], shader.inputs['Roughness'])
    return mat


def set_duv(obj, function):
    """Writes the 'duv' attribute: function(Vector point) -> (u, v)."""
    attr = obj.data.attributes.get('duv') or obj.data.attributes.new('duv', 'FLOAT_VECTOR', 'POINT')
    for v in obj.data.vertices:
        u = function(v.co)
        attr.data[v.index].vector = (u[0], u[1], 0.0)
    return obj


def sign(name, corners, material, texel=3.0):
    """A lettered flat board: corners bottom-left, bottom-right, top-right, top-left as read."""
    obj = mk.mesh_object(name, corners, [(0, 1, 2, 3)])
    attr = obj.data.attributes.new('duv', 'FLOAT_VECTOR', 'POINT')
    for i, uv in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
        attr.data[i].vector = (uv[0], uv[1], 0.0)
    obj['texel'] = texel
    return mk.assign(obj, material)


# --- cloth ---------------------------------------------------------------------------------------

def two_sided(obj):
    """Adds the back faces (the game culls back faces of atlas materials)."""
    name = obj.name
    back = mk.duplicate(obj, name + '_back')
    back.data.flip_normals()
    return mk.join(name, [obj, back])


def ribbon(name, path, width, material, twist=70.0, side=(1, 0, 0), texel=2.5, flip_back=True):
    """A flat streamer along a path, turning by `twist` degrees from start to end, lettered through
    'duv' (u along the length); both faces, the back one mirrored so its lettering reads too."""
    count = len(path)
    side = Vector(side).normalized()
    verts, uvs = [], []
    for i, p in enumerate(path):
        p = Vector(p)
        ahead = (Vector(path[min(i + 1, count - 1)]) - Vector(path[max(i - 1, 0)])).normalized()
        across = (side - ahead * side.dot(ahead)).normalized()
        normal = ahead.cross(across)
        a = math.radians(twist) * i / (count - 1)
        s = across * math.cos(a) + normal * math.sin(a)
        verts += [tuple(p - s * width * 0.5), tuple(p + s * width * 0.5)]
        uvs += [(i / (count - 1), 0.0), (i / (count - 1), 1.0)]
    faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(count - 1)]
    front = mk.mesh_object(name, verts, faces)
    back = mk.mesh_object(name + '_back', verts, [tuple(reversed(f)) for f in faces])
    for obj, mirrored in ((front, False), (back, flip_back)):
        attr = obj.data.attributes.new('duv', 'FLOAT_VECTOR', 'POINT')
        for i, (u, v) in enumerate(uvs):
            attr.data[i].vector = (u, 1.0 - v if mirrored else v, 0.0)
        for poly in obj.data.polygons:
            poly.use_smooth = True
    out = mk.assign(mk.join(name, [front, back]), material)
    out['texel'] = texel
    return out


def streamer_material(work_dir, name='streamer'):
    """The red streamer, lettered REMOVE BEFORE FLIGHT in white, with a stitched hem."""
    path = os.path.join(work_dir, name + '.png')
    w, h = 1024, 84
    image = Image.new('RGB', (w, h), _rgb('#b3161b'))
    draw = ImageDraw.Draw(image)
    for y in (5, h - 7):
        for x in range(0, w, 12):
            draw.line([(x, y), (x + 6, y)], fill=_rgb('#e0a09a'), width=2)
    font = ImageFont.truetype(FONT, 52)
    text = 'REMOVE BEFORE FLIGHT'
    draw.text(((w - draw.textlength(text, font=font)) / 2 + 20, 10), text, font=font, fill=_rgb('#f3efe6'))
    draw.rectangle([0, 0, 46, h], fill=_rgb('#8d1116'))
    draw.ellipse([14, h // 2 - 10, 34, h // 2 + 10], fill=_rgb('#b9b6ac'))
    draw.ellipse([19, h // 2 - 5, 29, h // 2 + 5], fill=_rgb('#30100f'))
    image.save(path)
    return decal_material(name, path, 0.8)


def sheet(name, rows, material=None, look_from=None, away=True):
    """A smooth sheet through rows of points (each row the same length)."""
    columns = len(rows[0])
    verts = [tuple(p) for row in rows for p in row]
    faces = [(r * columns + c, r * columns + c + 1, (r + 1) * columns + c + 1, (r + 1) * columns + c)
             for r in range(len(rows) - 1) for c in range(columns - 1)]
    obj = mk.mesh_object(name, verts, faces)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if look_from is not None:
        total = sum(p.normal.dot(p.center - Vector(look_from)) * p.area for p in obj.data.polygons)
        if (total < 0) == away:
            obj.data.flip_normals()
    if material is not None:
        mk.assign(obj, material)
    return obj


def canvas(name, color, wear=0.55, weave=0.25):
    """Heavy woven cloth: mottled, dusty, with a fine weave in the normal map."""
    return sf.coated(name, color, 0.93, 0.0, wear, grain=weave)


def ellipsoid(name, radii, location, material, segments=12, rings=7):
    rows = []
    for j in range(1, rings):
        a = math.pi * j / rings
        rows.append([(location[0] + radii[0] * math.sin(a) * math.cos(2 * math.pi * i / segments),
                      location[1] + radii[1] * math.sin(a) * math.sin(2 * math.pi * i / segments),
                      location[2] + radii[2] * math.cos(a)) for i in range(segments)])
    obj = mk.loft(name, rows)
    mk.recalc_normals(obj)
    return mk.shade(mk.assign(obj, material), 80)


def jitter(seed=5):
    rng = random.Random(seed)
    return lambda amount: rng.uniform(-amount, amount)


# --- atlas shares ---------------------------------------------------------------------------------

def weighted_unwrap(objs, margin=0.004):
    """atlasbake.unwrap, with each object's islands scaled by its 'texel' property before packing."""
    for obj in objs:
        layers = obj.data.uv_layers
        while len(layers) > 0:
            layers.remove(layers[0])
        layers.new(name='atlas')
    mk._activate(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj in objs:
        factor = float(obj.get('texel', 1.0))
        if abs(factor - 1.0) > 1e-3:
            layer = obj.data.uv_layers['atlas']
            data = np.empty(len(layer.data) * 2, dtype=np.float32)
            layer.data.foreach_get('uv', data)
            layer.data.foreach_set('uv', data * factor)
    mk._activate(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
