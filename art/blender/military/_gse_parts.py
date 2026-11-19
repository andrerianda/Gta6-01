"""Private helpers of the session-4 base kit (ground equipment, shelter, tower, guard post): the worn
material every one of them uses (chipped paint on edges, rust, crevice dirt, stains, dust near the
ground, stencilled text and stripes, all baked), stencil masks drawn with Pillow's built-in font (no
font file needed, so a build is the same on every machine), and small mesh builders.

Coordinates of patterns are object coordinates in metres; a prop that is modelled away from the
origin (DetailKitAsset.prop) gives its materials a reference empty (ref) so that stencils and stripes
are placed in the prop's own frame.
"""
import math

import bpy
import numpy as np
from mathutils import Matrix, Vector
from PIL import Image, ImageDraw, ImageFont

import _base_kit as kit
from lib import meshkit as mk
from lib import surfaces as sf

GRIME = (0.045, 0.038, 0.03, 1.0)
DUST = '#8f8571'


# --- stencil masks ----------------------------------------------------------------------------------

def _to_image(name, picture):
    """A Pillow 'L' picture as a Blender data image (white = ink)."""
    width, height = picture.size
    grey = np.asarray(picture, dtype=np.float32)[::-1] / 255.0
    image = bpy.data.images.new(name, width, height, alpha=False, is_data=True)
    image.pixels.foreach_set(np.repeat(grey.reshape(-1, 1), 4, axis=1).reshape(-1))
    image.pack()
    return image


def text_mask(lines, px=72, stencil=True, frame=0, weight=2):
    """A mask of stencilled lines of text. Returns (image, width / height)."""
    if isinstance(lines, str):
        lines = [lines]
    font = ImageFont.load_default(size=px)
    pad = px // 3 + frame * 3
    widths = [int(font.getlength(line)) + 2 * weight for line in lines]
    step = int(px * 1.25)
    size = (max(widths) + 2 * pad, step * len(lines) + 2 * pad - int(px * 0.15))
    picture = Image.new('L', size, 0)
    draw = ImageDraw.Draw(picture)
    for row, line in enumerate(lines):
        left = (size[0] - widths[row]) // 2
        top = pad + row * step
        draw.text((left, top), line, fill=255, font=font, stroke_width=weight, stroke_fill=255)
        if stencil:
            for index, char in enumerate(line):
                if char in ' -.:/1ITYLJ,':
                    continue
                middle = left + weight + font.getlength(line[:index]) + font.getlength(char) * 0.5
                gap = max(2, px // 14)
                draw.rectangle((middle - gap / 2, top, middle + gap / 2, top + step), fill=0)
    if frame:
        draw.rectangle((frame, frame, size[0] - frame - 1, size[1] - frame - 1), outline=255, width=frame)
    return _to_image('mask_' + '_'.join(lines)[:40], picture), size[0] / size[1]


def drawn_mask(name, size, paint):
    """A mask drawn by paint(draw, width, height) on black."""
    picture = Image.new('L', size, 0)
    paint(ImageDraw.Draw(picture), size[0], size[1])
    return _to_image('mask_' + name, picture), size[0] / size[1]


def decal(mask, centre, facing, height, color='#d8d4c4', up=(0, 0, 1), depth=0.25, strength=0.9, width=None):
    """A mask put on the surface that faces `facing` around `centre`: height metres tall."""
    image, aspect = mask
    n, v = Vector(facing).normalized(), Vector(up).normalized()
    u = (-n).cross(v).normalized()
    return {'image': image, 'centre': tuple(centre), 'u': tuple(u), 'v': tuple(v), 'n': tuple(n),
            'size': (width or height * aspect, height), 'color': color, 'depth': depth, 'strength': strength}


# --- the worn material ------------------------------------------------------------------------------

class _Graph:
    def __init__(self, tree, ref):
        self.tree = tree
        node = tree.nodes.new('ShaderNodeTexCoord')
        node.object = ref
        self.point = node.outputs['Object']

    def math(self, operation, a, b=None, clamp=False):
        node = self.tree.nodes.new('ShaderNodeMath')
        node.operation = operation
        node.use_clamp = clamp
        for socket, value in ((node.inputs[0], a), (node.inputs[1], b)):
            if value is None:
                continue
            if hasattr(value, 'node'):
                self.tree.links.new(value, socket)
            else:
                socket.default_value = value
        return node.outputs[0]

    def dot(self, a, vector):
        node = self.tree.nodes.new('ShaderNodeVectorMath')
        node.operation = 'DOT_PRODUCT'
        self.tree.links.new(a, node.inputs[0])
        node.inputs[1].default_value = vector
        return node.outputs['Value']

    def moved(self, offset):
        node = self.tree.nodes.new('ShaderNodeVectorMath')
        node.operation = 'SUBTRACT'
        self.tree.links.new(self.point, node.inputs[0])
        node.inputs[1].default_value = offset
        return node.outputs['Vector']

    def noise(self, scale, detail=3.0, roughness=0.55, stretch=(1, 1, 1)):
        return sf._noise(self.tree, scale, detail, roughness, stretch)

    def ramp(self, value, low, high):
        return sf._ramp(self.tree, value, low, high)

    def mix(self, factor, a, b, mode='MIX'):
        return sf._mix(self.tree, factor, a, b, mode)

    def occlusion(self, distance, inside=False, samples=5):
        node = self.tree.nodes.new('ShaderNodeAmbientOcclusion')
        node.inside = inside
        node.samples = samples
        node.inputs['Distance'].default_value = distance
        return node.outputs['AO']

    def image(self, image, u, v):
        combine = self.tree.nodes.new('ShaderNodeCombineXYZ')
        self.tree.links.new(u, combine.inputs[0])
        self.tree.links.new(v, combine.inputs[1])
        node = self.tree.nodes.new('ShaderNodeTexImage')
        node.image = image
        node.extension = 'CLIP'
        self.tree.links.new(combine.outputs[0], node.inputs['Vector'])
        return node.outputs['Color']


def worn(name, color, rough=0.55, metal=0.0, chips=0.5, under=('#4a2c1a', '#8a8c8a'), rust=0.25, dirt=0.5, fade=0.3,
         ref=None, decals=(), stripes=None, dust=0.35, dust_height=0.6, scale=1.0, boards=None, blotches=None,
         blotch_scale=0.09, stains=0.0, stain_color='#1c1814', edge=0.02, bump=1.0, cavity=0.15):
    """A painted or cast surface with a history.

    chips: paint chipped off at edges and in scattered flakes (0..1), showing `under` (primer / rust,
    then bare metal). rust: rust blooms from crevices and edges. dirt: grime and rain streaks. fade:
    sun-bleached patches. dust: pale dust up to dust_height above the ground. stains: long runs below
    ledges and fittings in stain_color. stripes: (hex, period, direction, duty) warning stripes.
    boards: (length, height, projection) formwork or plank joints with a tone per board.
    blotches: camouflage colours laid over the base. scale: pattern scale (1 for things of a few
    metres, about 0.25 for buildings). decals: decal() dictionaries.
    """
    mat, tree, shader = sf._principled(name)
    g = _Graph(tree, ref)
    colour = sf.hex_color(color)
    for index, patch in enumerate(blotches or ()):
        field = g.noise(blotch_scale * (1.0 + 0.37 * index), 1.6, 0.45, (1.0, 1.0 + 0.3 * index, 1.0))
        low = 0.5 + 0.035 * index
        colour = g.mix(g.ramp(field, low, low + 0.02), colour, sf.hex_color(patch))
    if stripes:
        second, period, direction, duty = stripes
        phase = g.math('FRACT', g.math('MULTIPLY', g.dot(g.point, Vector(direction).normalized()), 1.0 / period))
        colour = g.mix(g.math('GREATER_THAN', phase, duty), colour, sf.hex_color(second))
    lines = None
    if boards:
        coords = tree.nodes.new('ShaderNodeTexCoord')
        coords.object = ref
        mapping = tree.nodes.new('ShaderNodeMapping')
        mapping.inputs['Rotation'].default_value = {'top': (0, 0, 0), 'side': (0, 1.5708, 0), 'front': (1.5708, 0, 0)}[boards[2]]
        tree.links.new(coords.outputs['Object'], mapping.inputs['Vector'])
        brick = tree.nodes.new('ShaderNodeTexBrick')
        brick.inputs['Color1'].default_value = (0.78, 0.78, 0.78, 1)
        brick.inputs['Color2'].default_value = (1.0, 1.0, 1.0, 1)
        brick.inputs['Mortar'].default_value = (0.5, 0.5, 0.5, 1)
        brick.inputs['Scale'].default_value = 1.0
        brick.inputs['Mortar Size'].default_value = boards[3] if len(boards) > 3 else 0.012
        brick.inputs['Mortar Smooth'].default_value = 0.3
        brick.inputs['Brick Width'].default_value = boards[0]
        brick.inputs['Row Height'].default_value = boards[1]
        tree.links.new(mapping.outputs['Vector'], brick.inputs['Vector'])
        colour = g.mix(1.0, colour, brick.outputs['Color'], 'MULTIPLY')
        lines = brick.outputs['Fac']
    if fade > 0:
        colour = g.mix(g.math('MULTIPLY', g.ramp(g.noise(0.9 * scale, 3.0), 0.4, 0.75), 0.45 * fade), colour, (0.55, 0.53, 0.47, 1.0))
    for d in decals:
        rel = g.moved(d['centre'])
        u = g.math('ADD', g.math('MULTIPLY', g.dot(rel, d['u']), 1.0 / d['size'][0]), 0.5)
        v = g.math('ADD', g.math('MULTIPLY', g.dot(rel, d['v']), 1.0 / d['size'][1]), 0.5)
        near = g.math('LESS_THAN', g.math('ABSOLUTE', g.dot(rel, d['n'])), d['depth'])
        patchy = g.ramp(g.noise(7.0 * scale, 3.0, 0.7), 0.25, 0.5)
        mask = g.math('MULTIPLY', g.math('MULTIPLY', g.image(d['image'], u, v), near), g.math('MULTIPLY', patchy, d['strength']))
        colour = g.mix(mask, colour, sf.hex_color(d['color']))
    # grime, rain streaks, dirt in the crevices
    colour = g.mix(g.math('MULTIPLY', g.ramp(g.noise(1.4 * scale, 4.0), 0.4, 0.8), 0.6 * dirt), colour, GRIME)
    streak = g.ramp(g.noise(9.0 * scale, 3.0, 0.6, (1.0, 1.0, 0.06)), 0.5, 0.82)
    colour = g.mix(g.math('MULTIPLY', streak, 0.5 * dirt), colour, GRIME)
    crevice = g.ramp(g.occlusion(cavity), 0.92, 0.4)
    colour = g.mix(g.math('MULTIPLY', crevice, min(1.0, 0.85 * dirt + 0.1)), colour, GRIME)
    stain = None
    if stains > 0:
        below = g.ramp(g.occlusion(cavity * 8.0), 0.97, 0.55)
        runs = g.ramp(g.noise(5.0 * scale, 3.0, 0.65, (1.0, 1.0, 0.03)), 0.42, 0.75)
        stain = g.math('MULTIPLY', g.math('MULTIPLY', g.math('ADD', below, 0.18, True), runs), stains, True)
        colour = g.mix(stain, colour, sf.hex_color(stain_color))
    # chipped paint
    rim = g.ramp(g.occlusion(edge, True), 1.0, 0.62)
    low = 0.98 - 0.36 * chips
    flake = g.math('ADD', g.math('MULTIPLY', rim, 0.5), g.math('MULTIPLY', g.noise(34.0 * scale, 4.0, 0.6), 0.6))
    chip = g.ramp(flake, low, low + 0.03)
    if chips > 0:
        spots = g.math('MULTIPLY', g.ramp(g.noise(70.0 * scale, 2.0), 0.7 - 0.06 * chips, 0.72 - 0.06 * chips),
                       g.ramp(g.noise(2.4 * scale, 2.0), 0.5, 0.6))
        chip = g.math('MAXIMUM', chip, spots)
    else:
        chip = g.math('MULTIPLY', chip, 0.0)
    colour = g.mix(chip, colour, g.mix(g.ramp(g.noise(50.0 * scale, 2.0), 0.4, 0.6), sf.hex_color(under[0]), sf.hex_color(under[1])))
    # rust
    high = 0.97 - 0.5 * rust
    bloom = g.math('ADD', g.math('MULTIPLY', g.noise(5.0 * scale, 5.0, 0.7), 0.55),
                   g.math('ADD', g.math('MULTIPLY', crevice, 0.3), g.math('ADD', g.math('MULTIPLY', rim, 0.22), g.math('MULTIPLY', streak, 0.18))))
    rusty = g.ramp(bloom, high, high + 0.1) if rust > 0 else g.math('MULTIPLY', bloom, 0.0)
    colour = g.mix(rusty, colour, g.mix(g.ramp(g.noise(40.0 * scale, 3.0), 0.35, 0.65), sf.hex_color('#4f2913'), sf.hex_color('#8b4a20')))
    # dust near the ground
    height = tree.nodes.new('ShaderNodeSeparateXYZ')
    tree.links.new(g.point, height.inputs[0])
    dusty = g.math('MULTIPLY', g.math('MULTIPLY', g.ramp(height.outputs['Z'], dust_height, 0.0), g.ramp(g.noise(3.0 * scale, 4.0), 0.25, 0.7)), dust)
    colour = g.mix(dusty, colour, sf.hex_color(DUST))

    roughness = tree.nodes.new('ShaderNodeMapRange')
    roughness.inputs['To Min'].default_value = max(0.05, rough - 0.12)
    roughness.inputs['To Max'].default_value = min(1.0, rough + 0.12)
    tree.links.new(g.noise(2.2 * scale, 5.0), roughness.inputs['Value'])
    value = g.mix(chip, roughness.outputs['Result'], (0.42, 0.42, 0.42, 1))
    value = g.mix(rusty, value, (0.92, 0.92, 0.92, 1))
    value = g.mix(dusty, value, (0.95, 0.95, 0.95, 1))
    metallic = g.mix(chip, (metal, metal, metal, 1), (0.7, 0.7, 0.7, 1))
    metallic = g.mix(rusty, metallic, (0, 0, 0, 1))

    relief = g.math('ADD', g.math('MULTIPLY', g.noise(30.0 * scale, 2.0), 0.2),
                    g.math('SUBTRACT', g.math('MULTIPLY', rusty, 0.35), g.math('MULTIPLY', chip, 0.7)))
    first = tree.nodes.new('ShaderNodeBump')
    first.inputs['Strength'].default_value = 0.35 * bump
    first.inputs['Distance'].default_value = 0.004
    tree.links.new(relief, first.inputs['Height'])
    normal = first.outputs['Normal']
    if lines is not None:
        groove = tree.nodes.new('ShaderNodeBump')
        groove.invert = True
        groove.inputs['Strength'].default_value = 0.5
        groove.inputs['Distance'].default_value = 0.008
        tree.links.new(lines, groove.inputs['Height'])
        tree.links.new(normal, groove.inputs['Normal'])
        normal = groove.outputs['Normal']
    tree.links.new(colour, shader.inputs['Base Color'])
    tree.links.new(value, shader.inputs['Roughness'])
    tree.links.new(metallic, shader.inputs['Metallic'])
    tree.links.new(normal, shader.inputs['Normal'])
    return mat


# --- mesh builders ----------------------------------------------------------------------------------

B = kit.block
R = kit.rod


def C(name, radius, depth, location, axis, material, sides=12, radius_end=None, smooth=True):
    """A cylinder or frustum along an axis, centred on location."""
    obj = mk.assign(mk.cylinder(name, radius, depth, location, axis, sides, radius_end), material)
    return mk.shade(obj, 50) if smooth else obj


def lathe(name, profile, axis, location, material, sides=14, smooth=40):
    """A turned shape: profile is (radius, distance along the axis) pairs, capped at both ends."""
    rings = []
    for radius, along in profile:
        points = []
        for i in range(sides):
            angle = 2 * math.pi * i / sides
            c, s = math.cos(angle) * max(radius, 1e-4), math.sin(angle) * max(radius, 1e-4)
            p = {'Y': (c, along, s), 'X': (along, s, c), 'Z': (s, c, along)}[axis]
            points.append((p[0] + location[0], p[1] + location[1], p[2] + location[2]))
        rings.append(points)
    obj = mk.assign(mk.loft(name, rings), material)
    return mk.shade(obj, smooth) if smooth else obj


def beam(name, start, end, width, height, material, bevel=0.0):
    """A rectangular bar from start to end: width across (horizontal), height in the other direction."""
    start, end = Vector(start), Vector(end)
    along = end - start
    length = along.length
    along.normalize()
    side = along.cross(Vector((0, 0, 1)))
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    up = side.cross(along)
    obj = mk.box(name, (width, length, height), (0, 0, 0), bevel, 1)
    frame = Matrix((side, along, up)).transposed().to_4x4()
    frame.translation = (start + end) * 0.5
    obj.data.transform(frame)
    obj.data.update()
    return mk.assign(obj, material)


def wheel(name, radius, width, location, tyre, hub, side=1, sides=14, dual=False, nuts=0, nut_material=None):
    """A wheel on an axle along X: grooved tyre, dished rim, hub cap; side -1 turns the dish to -X."""
    rim, w = radius * 0.6, width
    if dual:
        h = w * 0.5
        profile = [(rim * 0.5, -h), (rim, -h * 0.96), (radius * 0.9, -h), (radius, -h * 0.86), (radius, -h * 0.2), (radius * 0.84, -h * 0.12),
                   (radius * 0.84, h * 0.12), (radius, h * 0.2), (radius, h * 0.55), (radius * 0.965, h * 0.58), (radius * 0.965, h * 0.66),
                   (radius, h * 0.7), (radius, h * 0.86), (radius * 0.9, h), (rim, h * 0.96), (rim * 0.93, h * 0.3), (rim * 0.5, h * 0.22),
                   (rim * 0.42, h * 0.6), (rim * 0.2, h * 0.66)]
    else:
        h = w * 0.5
        profile = [(rim * 0.5, -h * 0.8), (rim, -h * 0.94), (radius * 0.9, -h), (radius, -h * 0.72), (radius, -h * 0.12),
                   (radius * 0.955, -h * 0.07), (radius * 0.955, h * 0.07), (radius, h * 0.12), (radius, h * 0.72), (radius * 0.9, h),
                   (rim, h * 0.94), (rim * 0.93, h * 0.45), (rim * 0.5, h * 0.36), (rim * 0.42, h * 0.74), (rim * 0.2, h * 0.8)]
    obj = lathe(name, profile, 'X', (0, 0, 0), tyre, sides, 35)
    mk.assign_faces(obj, hub, lambda c, n: math.hypot(c.y, c.z) < rim * 0.985)
    parts = [obj]
    for index in range(nuts):
        angle = 2 * math.pi * index / nuts
        parts.append(C(name + '_nut', radius * 0.045, 0.03, (h * 0.36, math.cos(angle) * rim * 0.68, math.sin(angle) * rim * 0.68), 'X',
                       nut_material or hub, 5, smooth=False))
    obj = mk.join(name, parts) if len(parts) > 1 else obj
    mk.transform(obj, location, (0, 0, 0), (side, 1, 1))
    return obj


def guard(name, centre, radius, x0, x1, start, end, material, thickness=0.03, steps=7):
    """A mudguard: an arc of sheet over a wheel on an axle along X at centre (y, z); angles in degrees
    from straight ahead (+Y) over the top (90) to straight behind (180)."""
    rings = []
    for i in range(steps + 1):
        angle = math.radians(start + (end - start) * i / steps)
        c, s = math.cos(angle), math.sin(angle)
        outer, inner = radius + thickness, radius
        rings.append([(x0, centre[0] + c * outer, centre[1] + s * outer), (x1, centre[0] + c * outer, centre[1] + s * outer),
                      (x1, centre[0] + c * inner, centre[1] + s * inner), (x0, centre[0] + c * inner, centre[1] + s * inner)])
    return mk.shade(mk.assign(mk.loft(name, rings), material), 30)


def panel(name, corners, material, inside):
    """A flat face that looks away from the point inside."""
    return kit.polygon(name, corners, material, inside, True)


def rope(name, points, radius, material, sides=5, sag=0.0):
    """A rope or cable through points (smoothed with a Catmull-Rom curve)."""
    pts = [Vector(p) for p in points]
    path = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, len(pts) - 1)]
        for k in range(3):
            t = k / 3.0
            path.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    path.append(pts[-1])
    return mk.shade(mk.assign(mk.tube(name, [tuple(p) for p in path], radius, sides), material), 60)


def ac_unit(name, size, location, body, dark, turn=0):
    """An air-conditioning unit standing on location: cabinet on feet, a fan on top, a louvred side.
    The fan and its hub stay inside the height size[2]."""
    sx, sy, sz = size
    parts = [mk.assign(mk.box(name, (sx, sy, sz - 0.14), (0, 0, 0.1 + (sz - 0.14) * 0.5), 0.03, 1), body),
             C(name + '_fan', min(sx, sy) * 0.36, 0.03, (0, 0, sz - 0.025), 'Z', dark, 10), C(name + '_hub', min(sx, sy) * 0.1, 0.04, (0, 0, sz - 0.02), 'Z', body, 6)]
    for x in (-sx * 0.4, sx * 0.4):
        parts.append(B(name + '_foot', (0.08, sy, 0.1), (x, 0, 0.05), dark))
    for i in range(5):
        parts.append(B(name + '_slat', (sx * 0.8, 0.03, 0.035), (0, -sy * 0.5 + 0.005, 0.24 + i * (sz - 0.42) / 4), dark, (30, 0, 0)))
    for obj in parts:
        mk.transform(obj, location, (0, 0, turn))
    return mk.join(name, parts)


def sandbag(name, size, material, seed=0):
    """One filled sandbag lying along X, centred on the origin: plump middle, pinched ends."""
    sx, sy, sz = size
    obj = mk.box(name, size, (0, 0, 0), min(sz, sy) * 0.3, 1)

    def plump(v):
        along = v.x / (sx * 0.5)
        squeeze = 1.0 - 0.22 * abs(along) ** 3
        wobble = 1.0 + 0.05 * math.sin(seed * 2.1 + v.x * 9.0)
        return (v.x, v.y * squeeze * wobble, v.z * squeeze * (1.0 + 0.06 * math.cos(seed * 1.3 + v.x * 7.0)))

    mk.map_points(obj, plump)
    return mk.shade(mk.assign(obj, material), 60)


class Prop:
    """One prop of a DetailKitAsset: parts are modelled around the origin, then moved to the slot."""

    def __init__(self, asset, name, slot, density=1.0, offset=(0.0, 0.0)):
        """offset moves everything that is modelled (to centre the footprint on the prop's origin)."""
        self.asset, self.name, self.slot, self.weight = asset, name, (slot[0], slot[1], 0.0), density
        self.at = (slot[0] + offset[0], slot[1] + offset[1], 0.0)
        self.ref = mk.empty('ref_' + name, self.at)
        self.parts = []
        self.copies = []

    def add(self, *objs):
        for obj in objs:
            self.parts.extend(obj if isinstance(obj, (list, tuple)) else [obj])
        return objs[0]

    def repeat(self, obj, matrices):
        """obj (not added) is baked once and copied under the matrices (the prop's own frame)."""
        self.copies.append((obj, list(matrices)))
        return obj

    def done(self, parent=None):
        shift = Matrix.Translation(self.at)
        back = Matrix.Translation([-v for v in self.at])
        for obj in self.parts:
            obj.data.transform(shift)
        body = mk.join(self.name, self.parts)
        if parent is None:
            self.asset.prop(body, self.slot[:2])
        else:
            self.asset.child(body, parent)
        self.asset.density(body, self.weight)
        for obj, matrices in self.copies:
            obj.data.transform(shift)
            self.asset.density(obj, self.weight)
            self.asset.repeat(obj, [shift @ m @ back for m in matrices], into=body)
        return body


class Parts(list):
    """A list of meshes whose append takes several at once."""

    def append(self, *objs):
        self.extend(objs)


def mirror_x():
    return Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0))


def shift(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))
