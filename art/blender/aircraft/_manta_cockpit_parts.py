"""Parts and pipeline of the Manta Sombra flight deck (manta_cockpit.py lays them out).

Everything here is written for the cockpit alone: a small geometry collector (Geo) that builds
chamfered hard-surface pieces without modifiers, the detail stamps (bezels, switches, bolts...), the
ejection seat, the gloved hands, the worn interior materials, and the cockpit's own finish: an unwrap
with a texel density per part, stamps that share texels, the atlas bake (lib/atlasbake.py), the
checks of the cockpit contract and the export with Draco geometry.

Axes are the aircraft's: nose +Y, right wing +X, up +Z, metres. A stamp or a panel is modelled in a
local frame: X to the reader's right, Y up the panel, Z out of the surface towards the reader.
"""
import json
import math
import os
import struct
import subprocess
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

from lib import atlasbake
from lib import meshkit as mk
from lib import surfaces as sf

PYDEPS = '/tmp/marazul/flight/pydeps'

# --- the airframe's hump (the same analytic skin as manta_sombra.py; keep the two in step) ---------
NOSE_Y, SWEEP, OUTER_CHORD, HALF_SPAN = 10.0, 0.72, 3.6, 23.0
TAIL_X, TAIL_Y = 4.0, -9.6
TIP_Y = NOSE_Y - SWEEP * HALF_SPAN
NOTCH_Y = TAIL_Y + SWEEP * TAIL_X
ACROSS = 1.0 / math.sqrt(1.0 + SWEEP * SWEEP)
EDGE_PLANE, FALL, FLOOR = 2.72, 5.2, 2.75
CHORD = NOSE_Y - NOTCH_Y
PANES = [(0.14, 1.02, 0.095, 0.15), (1.16, 1.72, 0.12, 0.19)]
LINING = 0.06                 # the lining lies this far under the outer skin


def _both(*values):
    if min(values) <= 0.0:
        return 0.0
    return sum(v ** -4 for v in values) ** -0.25


def _either(a, b):
    return (max(a, 0.0) ** 4 + max(b, 0.0) ** 4) ** 0.25


def _behind(x, y):
    notch = (y - (NOTCH_Y - SWEEP * x)) * ACROSS
    inner = (y - (TAIL_Y + SWEEP * (x - TAIL_X))) * ACROSS
    outer = (y - (NOSE_Y - OUTER_CHORD - SWEEP * x)) * ACROSS
    tip = (y - (TIP_Y - SWEEP * (HALF_SPAN - x))) * ACROSS
    return _either(_both(notch, inner), _both(outer, tip))


def _ease(v):
    v = min(max(v, 0.0), 1.0)
    return v * v * v * (v * (6.0 * v - 15.0) + 10.0)


def skin_z(x, y):
    """Height of the airframe's upper skin over a point of the planform."""
    u = abs(x)
    edge = _both((NOSE_Y - SWEEP * x - y) * ACROSS, (NOSE_Y + SWEEP * x - y) * ACROSS, _either(_behind(x, y), _behind(-x, y)))
    fill = 1.0 - (1.0 - min(edge / FALL, 1.0)) ** 3
    body = 0.9 * math.exp(-(u / 4.4) ** 2) * (1.0 - 0.7 * _ease((3.0 - y) / 10.0))
    crest = 0.83 * math.exp(-(u / 1.55) ** 4) * (1.0 - 0.3 * _ease((6.6 - y) / 2.6) - 0.7 * _ease((4.0 - y) / 8.5))
    return EDGE_PLANE + fill * (0.28 + body + crest)


def lining_z(x, y):
    """Height of the cabin lining (the hump's inner surface)."""
    return skin_z(x, y) - LINING


def chord_y(x, t):
    """The y of chord share t at span station x (the exterior's grid lines)."""
    return NOSE_Y - SWEEP * abs(x) - t * CHORD


def pane_corners(index, side):
    """The four corners of a window opening on the lining: front-inner, front-outer, back-outer, back-inner."""
    x0, x1, t0, t1 = PANES[index]
    return [Vector((side * x, chord_y(x, t), lining_z(x, chord_y(x, t)))) for x, t in ((x0, t0), (x1, t0), (x1, t1), (x0, t1))]


# --- small matrix helpers --------------------------------------------------------------------------
def T(x, y, z):
    return Matrix.Translation((x, y, z))


def R(axis, degrees):
    return Matrix.Rotation(math.radians(degrees), 4, axis)


def S(x, y=None, z=None):
    return Matrix.Diagonal((x, x if y is None else y, x if z is None else z, 1.0))


def frame(origin, x, y):
    """A placement whose local X and Y lie along the given directions (Y made square to X), Z = X x Y."""
    x = Vector(x).normalized()
    y = Vector(y)
    y = (y - x * y.dot(x)).normalized()
    z = x.cross(y)
    m = Matrix.Identity(4)
    for i in range(3):
        m[i][0], m[i][1], m[i][2], m[i][3] = x[i], y[i], z[i], origin[i]
    return m


# --- shapes: (points, faces) pairs built without modifiers --------------------------------------------
def rect(w, h, cx=0.0, cy=0.0):
    return [(cx - w / 2, cy - h / 2), (cx + w / 2, cy - h / 2), (cx + w / 2, cy + h / 2), (cx - w / 2, cy + h / 2)]


def circle(r, n=12, cx=0.0, cy=0.0, phase=0.0):
    return [(cx + r * math.cos(2 * math.pi * i / n + phase), cy + r * math.sin(2 * math.pi * i / n + phase)) for i in range(n)]


def inset(outline, d):
    """A counter-clockwise outline moved inwards by d (a number, or one distance per edge)."""
    n = len(outline)
    lines = []
    for i in range(n):
        p, q = Vector(outline[i]), Vector(outline[(i + 1) % n])
        e = (q - p).normalized()
        di = d[i] if isinstance(d, (list, tuple)) else d
        lines.append((p + Vector((-e.y, e.x)) * di, e))
    out = []
    for i in range(n):
        (p1, e1), (p2, e2) = lines[i - 1], lines[i]
        cross = e1.x * e2.y - e1.y * e2.x
        if abs(cross) < 1e-9:
            out.append((p2.x, p2.y))
        else:
            t = ((p2.x - p1.x) * e2.y - (p2.y - p1.y) * e2.x) / cross
            out.append((p1.x + e1.x * t, p1.y + e1.y * t))
    return out


def sweep(outline, profile, cap=True, bottom=False, widths=None):
    """Rings of a counter-clockwise outline (seen from +Z) stacked along a profile.

    profile: (inset, z) pairs running from the outside bottom over the top to the inside; with widths
    (one per outline edge) the pairs are (share, extra, z): each edge is moved OUTWARDS by share * its
    width + extra. cap closes the last ring (facing +Z), bottom the first (facing -Z).
    """
    rings = []
    for step in profile:
        if widths is None:
            ring2 = inset(outline, step[0]) if step[0] else outline
        else:
            ring2 = inset(outline, [-(step[0] * w + step[1]) for w in widths])
        rings.append([(p[0], p[1], step[-1]) for p in ring2])
    n = len(outline)
    verts = [p for r in rings for p in r]
    faces = []
    for k in range(len(rings) - 1):
        a, b = k * n, (k + 1) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((a + i, a + j, b + j, b + i))
    if cap:
        faces.append(tuple((len(rings) - 1) * n + i for i in range(n)))
    if bottom:
        faces.append(tuple(range(n - 1, -1, -1)))
    return verts, faces


def pad(w, h, d, c=0.0012, cx=0.0, cy=0.0):
    """A raised plate on the surface z = 0 with a chamfered top edge (no underside)."""
    return sweep(rect(w, h, cx, cy), [(0, 0), (0, d - c), (c, d)])


def block(sx, sy, sz, c=0.002):
    """A closed chamfered box: centred on x and y, standing on z = 0."""
    return sweep(rect(sx, sy), [(c, 0), (0, c), (0, sz - c), (c, sz)], cap=True, bottom=True)


def disc(r, n, z=0.0):
    return [(x, y, z) for x, y in circle(r, n)], [tuple(range(n))]


def orient(shape):
    """Turns the faces of a closed (or nearly closed) shape outwards."""
    verts, faces = shape
    centre = Vector((0, 0, 0))
    for v in verts:
        centre += Vector(v)
    centre /= max(len(verts), 1)
    total = 0.0
    for f in faces:
        pts = [Vector(verts[i]) for i in f]
        normal = Vector((0, 0, 0))
        for i in range(len(pts)):
            normal += pts[i].cross(pts[(i + 1) % len(pts)])
        total += normal.dot(pts[0] - centre)
    if total < 0:
        faces = [tuple(reversed(f)) for f in faces]
    return verts, faces


def loft(rings, cap0=True, cap1=True):
    """Skins rings of equal point counts into a tube."""
    n = len(rings[0])
    verts = [tuple(p) for r in rings for p in r]
    faces = []
    for k in range(len(rings) - 1):
        a, b = k * n, (k + 1) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((a + i, a + j, b + j, b + i))
    if cap0:
        faces.append(tuple(range(n - 1, -1, -1)))
    if cap1:
        faces.append(tuple((len(rings) - 1) * n + i for i in range(n)))
    return orient((verts, faces))


def tube_rings(path, radius, seg=8, squash=1.0, side=None):
    """Rings round a path, carried along it without twisting. side: the direction ring point 0 starts from."""
    rings = []
    previous = None
    for i, p in enumerate(path):
        p = Vector(p)
        ahead = (Vector(path[min(i + 1, len(path) - 1)]) - Vector(path[max(i - 1, 0)])).normalized()
        if previous is None:
            ref = Vector(side) if side is not None else Vector((1, 0, 0))
            if abs(ref.normalized().dot(ahead)) > 0.95:
                ref = Vector((0, 0, 1))
        else:
            ref = previous
        sideways = (ref - ahead * ref.dot(ahead)).normalized()
        up = ahead.cross(sideways)
        previous = sideways
        r = radius[i] if isinstance(radius, (list, tuple)) else radius
        rings.append([tuple(p + (sideways * math.cos(2 * math.pi * k / seg) + up * math.sin(2 * math.pi * k / seg) * squash) * r)
                      for k in range(seg)])
    return rings


def tube(path, radius, seg=8, caps=True, squash=1.0, side=None):
    return loft(tube_rings(path, radius, seg, squash, side), caps, caps)


def strap(path, width, thick, normals):
    """A flat belt along a path; normals: the direction its face looks, one for all or one per point."""
    rings = []
    for i, p in enumerate(path):
        p = Vector(p)
        n = Vector(normals[i] if isinstance(normals[0], (list, tuple, Vector)) else normals).normalized()
        ahead = (Vector(path[min(i + 1, len(path) - 1)]) - Vector(path[max(i - 1, 0)])).normalized()
        sideways = ahead.cross(n).normalized()
        rings.append([tuple(p - sideways * width / 2), tuple(p + sideways * width / 2),
                      tuple(p + sideways * width / 2 + n * thick), tuple(p - sideways * width / 2 + n * thick)])
    return loft(rings)


def ellipsoid(radii, seg=10, rings=6):
    out = []
    for k in range(1, rings):
        a = math.pi * k / rings
        out.append([(radii[0] * math.sin(a) * math.cos(2 * math.pi * i / seg), radii[1] * math.sin(a) * math.sin(2 * math.pi * i / seg),
                     -radii[2] * math.cos(a)) for i in range(seg)])
    return loft(out)


_TEXT = {}


def text_shape(body, size):
    """Letters as flat geometry in the XY plane, centred, reading along +X."""
    key = (body, round(size, 5))
    if key not in _TEXT:
        curve = bpy.data.curves.new('legend', 'FONT')
        curve.body, curve.size, curve.resolution_u = body, size, 1
        curve.align_x, curve.align_y = 'CENTER', 'CENTER'
        obj = bpy.data.objects.new('legend', curve)
        bpy.context.scene.collection.objects.link(obj)
        graph = bpy.context.evaluated_depsgraph_get()
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(graph))
        verts = [tuple(v.co) for v in mesh.vertices]
        faces = [tuple(p.vertices) for p in mesh.polygons]
        if mesh.polygons and mesh.polygons[0].normal.z < 0:
            faces = [tuple(reversed(f)) for f in faces]
        bpy.data.meshes.remove(mesh)
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.curves.remove(curve)
        _TEXT[key] = (verts, faces)
    return _TEXT[key]


class Geo:
    """Collects points, faces and a material per face; object() makes the mesh once."""

    def __init__(self):
        self.v, self.f, self.m, self.mats = [], [], [], []

    def _slot(self, material):
        if material not in self.mats:
            self.mats.append(material)
        return self.mats.index(material)

    def put(self, shape, material, matrix=None):
        """Adds a shape; material is one material, or one per face."""
        verts, faces = shape
        base = len(self.v)
        turned = False
        if matrix is not None:
            verts = [tuple(matrix @ Vector(p)) for p in verts]
            turned = matrix.to_3x3().determinant() < 0
        self.v.extend(tuple(p) for p in verts)
        many = isinstance(material, (list, tuple))
        for index, face in enumerate(faces):
            ids = [base + i for i in face]
            self.f.append(tuple(reversed(ids)) if turned else tuple(ids))
            self.m.append(self._slot(material[index] if many else material))
        return self

    def merge(self, other, matrix=None):
        return self.put((other.v, other.f), [other.mats[i] for i in other.m], matrix)

    def text(self, body, size, material, matrix):
        return self.put(text_shape(body, size), material, matrix)

    def triangles(self):
        return sum(len(f) - 2 for f in self.f)

    def object(self, name):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.v, [], self.f)
        for material in self.mats:
            mesh.materials.append(material)
        mesh.polygons.foreach_set('material_index', self.m)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


class Kit:
    """What the cockpit is made of: unique parts (per node and texel density), stamps placed many
    times (the first placement is baked, the others share its texels) and flat legends."""

    def __init__(self):
        self.unique = {}       # (node, density) -> Geo
        self.flat = {}         # node -> Geo of plain-coloured faces that share swatch texels
        self.stamps = {}       # key -> {'geo', 'density', 'places': [(matrix, node)]}

    def geo(self, node='cockpit_shell', density=1.0):
        return self.unique.setdefault((node, density), Geo())

    def legends(self, node='cockpit_shell'):
        return self.flat.setdefault(node, Geo())

    def stamp(self, key, geo, density=1.0):
        self.stamps[key] = {'geo': geo, 'density': density, 'places': []}

    def place(self, key, matrix, node='cockpit_shell'):
        self.stamps[key]['places'].append((matrix.copy(), node))

    def triangles(self):
        total = sum(g.triangles() for g in self.unique.values()) + sum(g.triangles() for g in self.flat.values())
        return total + sum(s['geo'].triangles() * len(s['places']) for s in self.stamps.values())


# --- materials ----------------------------------------------------------------------------------------
def _value(tree, socket, value):
    if hasattr(value, 'node'):
        tree.links.new(value, socket)
    else:
        socket.default_value = value


def _math(tree, operation, a, b=0.0, clamp=False):
    node = tree.nodes.new('ShaderNodeMath')
    node.operation, node.use_clamp = operation, clamp
    _value(tree, node.inputs[0], a)
    _value(tree, node.inputs[1], b)
    return node.outputs[0]


def _range(tree, value, low, high, to_low=0.0, to_high=1.0):
    node = tree.nodes.new('ShaderNodeMapRange')
    node.inputs['From Min'].default_value, node.inputs['From Max'].default_value = low, high
    node.inputs['To Min'].default_value, node.inputs['To Max'].default_value = to_low, to_high
    tree.links.new(value, node.inputs['Value'])
    return node.outputs['Result']


def _noise(tree, scale, detail=3.0, roughness=0.55, stretch=(1, 1, 1)):
    coords = tree.nodes.new('ShaderNodeTexCoord')
    mapping = tree.nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = stretch
    tree.links.new(coords.outputs['Object'], mapping.inputs['Vector'])
    noise = tree.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = detail
    noise.inputs['Roughness'].default_value = roughness
    tree.links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
    return noise.outputs[0]


def _mix(tree, factor, a, b):
    node = tree.nodes.new('ShaderNodeMix')
    node.data_type = 'RGBA'
    for socket, value in ((node.inputs[0], factor), (node.inputs[6], a), (node.inputs[7], b)):
        _value(tree, socket, value)
    return node.outputs[2]


def _shade(color, k):
    return tuple(min(c * k, 1.0) for c in color[:3]) + (1.0,)


def worn(name, color, rough=0.6, metal=0.0, wear=0.5, dust=0.5, edge='#9c9e9f', mottle=0.3, bump=0.1, grain=45.0, bevel=0.002):
    """A used surface: mottled colour, scuffs, paint worn off the exposed edges, dust in the corners.

    The edges come from Cycles' bevel node (which also rounds them in the normal map), the corners
    from its ambient-occlusion node, so the wear follows the model, not the UVs.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    base = sf.hex_color(color)
    geometry = tree.nodes.new('ShaderNodeNewGeometry')
    round_edges = tree.nodes.new('ShaderNodeBevel')
    round_edges.samples = 6
    round_edges.inputs['Radius'].default_value = bevel
    dot = tree.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    tree.links.new(round_edges.outputs['Normal'], dot.inputs[0])
    tree.links.new(geometry.outputs['Normal'], dot.inputs[1])
    edges = _range(tree, dot.outputs['Value'], 0.992, 0.86)
    occlusion = tree.nodes.new('ShaderNodeAmbientOcclusion')
    occlusion.samples = 8
    occlusion.inputs['Distance'].default_value = 0.03
    exposed = _range(tree, occlusion.outputs['AO'], 0.5, 0.92)
    colour = _mix(tree, _range(tree, _noise(tree, 1.4, 4.0), 0.3, 0.7), base, _shade(base, 1.0 - 0.5 * mottle))
    streaks = _range(tree, _noise(tree, 7.0, 3.0, 0.6, (1, 0.18, 1)), 0.6, 0.8)
    colour = _mix(tree, _math(tree, 'MULTIPLY', streaks, 0.3 * wear), colour, _shade(base, 1.7))
    chips = _range(tree, _noise(tree, 60.0, 2.0, 0.7), 0.4, 0.58)
    worn_off = _math(tree, 'MULTIPLY', _math(tree, 'MULTIPLY', edges, exposed), _math(tree, 'MULTIPLY', chips, min(1.0, 1.7 * wear)))
    colour = _mix(tree, worn_off, colour, sf.hex_color(edge))
    dusty = _math(tree, 'MULTIPLY', _math(tree, 'SUBTRACT', 1.0, exposed), _math(tree, 'MULTIPLY', _range(tree, _noise(tree, 4.0, 3.0), 0.25, 0.75), dust))
    colour = _mix(tree, dusty, colour, sf.hex_color('#6f6a60'))
    gloss = _range(tree, _noise(tree, 3.0, 5.0), 0.25, 0.75, rough - 0.1, rough + 0.1)
    gloss = _math(tree, 'ADD', gloss, _math(tree, 'MULTIPLY', dusty, 0.3))
    gloss = _math(tree, 'SUBTRACT', gloss, _math(tree, 'MULTIPLY', worn_off, 0.25), clamp=True)
    relief = tree.nodes.new('ShaderNodeBump')
    relief.inputs['Strength'].default_value = bump
    relief.inputs['Distance'].default_value = 0.002
    tree.links.new(_noise(tree, grain, 2.0), relief.inputs['Height'])
    tree.links.new(round_edges.outputs['Normal'], relief.inputs['Normal'])
    tree.links.new(colour, shader.inputs['Base Color'])
    tree.links.new(gloss, shader.inputs['Roughness'])
    shader.inputs['Metallic'].default_value = metal
    tree.links.new(relief.outputs['Normal'], shader.inputs['Normal'])
    return mat


def materials():
    """The cockpit's source materials by name (all baked into the atlas but the last three)."""
    m = {}
    m['int_grey'] = worn('int_grey', '#676b70', 0.62, wear=0.55, dust=0.6)
    m['plate_grey'] = worn('plate_grey', '#5d6166', 0.58, wear=0.6, dust=0.6)
    m['lining'] = sf.coated('lining', '#73766f', roughness=0.85, wear=0.3, panels=(0.62, 0.47), projection='top', grain=0.2)
    m['wall'] = worn('wall', '#6c7072', 0.7, wear=0.4, dust=0.7)
    m['frame_paint'] = worn('frame_paint', '#5a5e63', 0.55, wear=0.8, dust=0.5, edge='#a9abab', bevel=0.004)
    m['sealant'] = worn('sealant', '#3a3b36', 0.8, wear=0.0, dust=0.6, bump=0.25, grain=120.0)
    m['bolt'] = worn('bolt', '#84878a', 0.4, metal=0.85, wear=0.3, dust=0.5, edge='#c4c6c8', bevel=0.0008)
    m['glare'] = worn('glare', '#525456', 0.92, wear=0.25, dust=0.8, edge='#77787a', bump=0.3, grain=160.0, bevel=0.004)
    m['bezel'] = worn('bezel', '#2c2e31', 0.42, wear=0.7, dust=0.5, edge='#8d9093', bevel=0.0012)
    m['button'] = worn('button', '#45484c', 0.5, wear=0.6, dust=0.3, edge='#9fa2a4', bevel=0.0008)
    m['knob'] = worn('knob', '#2d2e31', 0.5, wear=0.6, dust=0.3, edge='#85888b', bevel=0.001)
    m['metal'] = worn('metal', '#9a9da1', 0.36, metal=1.0, wear=0.3, dust=0.4, edge='#d2d4d6', bevel=0.0008)
    m['placard'] = worn('placard', '#232427', 0.5, wear=0.5, dust=0.2, edge='#8d8f90', bevel=0.0006)
    m['slot_dark'] = sf.plain('slot_dark', '#141516', 0.8)
    m['floor'] = worn('floor', '#585b5e', 0.7, wear=0.9, dust=0.9, edge='#a3a5a6', bevel=0.004)
    m['tread'] = worn('tread', '#2b2c2d', 0.95, wear=0.4, dust=0.9, edge='#6d6e6f', bump=0.5, grain=260.0)
    m['seat_frame'] = worn('seat_frame', '#5f6368', 0.55, wear=0.7, dust=0.6, bevel=0.004)
    m['seat_fabric'] = worn('seat_fabric', '#5a6152', 0.95, wear=0.35, dust=0.5, edge='#7f8672', bump=0.5, grain=300.0, bevel=0.006)
    m['harness'] = worn('harness', '#71734f', 0.9, wear=0.3, dust=0.3, edge='#9a9b78', bump=0.6, grain=380.0, bevel=0.0012)
    m['handle_yellow'] = worn('handle_yellow', '#d6ae12', 0.55, wear=0.4, dust=0.3, edge='#8a7a40')
    m['handle_black'] = worn('handle_black', '#1d1d1e', 0.55, wear=0.4, dust=0.3, edge='#77777a')
    m['guard_red'] = worn('guard_red', '#a32b21', 0.5, wear=0.6, dust=0.3, edge='#b9b2aa', bevel=0.001)
    m['amber'] = worn('amber', '#c98a1c', 0.4, wear=0.3, dust=0.3, edge='#e0b25a', bevel=0.001)
    m['red'] = worn('red', '#b3271d', 0.4, wear=0.3, dust=0.3, edge='#d6685a', bevel=0.001)
    m['green'] = worn('green', '#3f9a4b', 0.4, wear=0.3, dust=0.3, edge='#7cc486', bevel=0.001)
    m['tile_off'] = worn('tile_off', '#3b3d3c', 0.45, wear=0.3, dust=0.3, bevel=0.001)
    m['gauge_face'] = sf.plain('gauge_face', '#17181a', 0.55)
    m['adi_sky'] = sf.plain('adi_sky', '#3f6e9c', 0.5)
    m['adi_ground'] = sf.plain('adi_ground', '#6b4a2c', 0.5)
    m['lcd'] = sf.plain('lcd', '#1c2a22', 0.3)
    m['mirror'] = sf.plain('mirror', '#aeb6bd', 0.07, 1.0)
    m['grip'] = worn('grip', '#2f3033', 0.75, wear=0.5, dust=0.3, edge='#77797b', bump=0.35, grain=200.0)
    m['rubber'] = worn('rubber', '#2c2c2d', 0.9, wear=0.2, dust=0.8, edge='#55565a', bump=0.3, grain=150.0)
    m['throttle_knob'] = worn('throttle_knob', '#3a3c3f', 0.6, wear=0.8, dust=0.2, edge='#a5a7a9', bevel=0.003)
    m['glove_fabric'] = worn('glove_fabric', '#8a907b', 0.95, wear=0.2, dust=0.25, edge='#a6ab98', mottle=0.35, bump=0.6, grain=420.0, bevel=0.003)
    m['glove_leather'] = worn('glove_leather', '#45413c', 0.7, wear=0.5, dust=0.2, edge='#7a736a', mottle=0.4, bump=0.35, grain=180.0, bevel=0.003)
    m['glove_seam'] = worn('glove_seam', '#6c725f', 0.95, wear=0.1, dust=0.2, bump=0.4, grain=420.0)
    m['sleeve'] = worn('sleeve', '#62675a', 0.95, wear=0.2, dust=0.3, edge='#858a7a', mottle=0.4, bump=0.55, grain=330.0, bevel=0.006)
    m['extinguisher'] = worn('extinguisher', '#a8271e', 0.45, wear=0.5, dust=0.5, edge='#c9c2bb')
    for name, color in (('legend', '#d9d7cc'), ('stitch', '#99968a'), ('legend_amber', '#d9a23a'), ('legend_dark', '#18191a'),
                        ('legend_red', '#c63a2c'), ('legend_green', '#58b765')):
        m[name] = sf.plain(name, color, 0.6)
    screen = sf.screen('screen_live', '#06090b')
    shader = next(n for n in screen.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Emission Color'].default_value = (0.012, 0.035, 0.04, 1.0)
    shader.inputs['Emission Strength'].default_value = 1.0
    m['screen_live'] = screen
    m['canopy_glass'] = sf.glass('canopy_glass', '#a9b8ae', alpha=0.12, roughness=0.04)
    m['hud_glass'] = sf.glass('hud_glass', '#b4d0b6', alpha=0.16, roughness=0.03)
    return m


# --- detail stamps (local frame: on the surface z = 0, +Z towards the reader) -----------------------------
BEZEL = {'w': 0.27, 'h': 0.2025, 'border': 0.0325, 'rise': 0.015, 'sink': 0.007}


def bezel_geo(M):
    """A display bezel: a raised black frame with five keys on every side; the live face sits `sink` behind it."""
    b = BEZEL
    W, H, rise = b['w'] + 2 * b['border'], b['h'] + 2 * b['border'], b['rise']
    g = Geo()
    g.put(sweep(rect(W, H), [(0, 0), (0, rise - 0.003), (0.003, rise), (b['border'] - 0.005, rise), (b['border'] - 0.003, rise - 0.0015),
                             (b['border'], rise - b['sink'])], cap=False), M['bezel'])
    for i in range(5):
        for sign in (-1, 1):
            g.put(pad(0.024, 0.011, 0.0035, 0.001, (i - 2) * 0.048, sign * (H / 2 - 0.0135)), M['button'], T(0, 0, rise))
            g.put(pad(0.011, 0.022, 0.0035, 0.001, sign * (W / 2 - 0.0135), (i - 2) * 0.036), M['button'], T(0, 0, rise))
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.put(sweep(circle(0.0035, 8), [(0, 0), (0.001, 0.0012)]), M['metal'], T(sx * (W / 2 - 0.008), sy * (H / 2 - 0.008), rise))
    return g


def toggle_geo(M, guard=True, throw=1.0):
    g = Geo()
    g.put(sweep(circle(0.0065, 6), [(0, 0), (0, 0.003), (0.0025, 0.0045), (0.0025, 0.007)]), M['metal'])
    g.put(tube([(0, 0, 0.006), (0, 0.004 * throw, 0.016), (0, 0.008 * throw, 0.027)], [0.0018, 0.0022, 0.003], 6), M['metal'])
    if guard:
        for sx in (-1, 1):
            g.put(sweep(rect(0.0018, 0.022, sx * 0.011), [(0, 0), (0, 0.0165), (0.0004, 0.017)]), M['int_grey'])
    return g


def cover_geo(M):
    """A red guard cover over a switch."""
    g = Geo()
    g.put(sweep(rect(0.02, 0.034), [(0, 0), (0, 0.02), (0.003, 0.024)]), M['guard_red'], R('X', -14))
    g.put(tube([(-0.012, -0.017, 0.002), (0.012, -0.017, 0.002)], 0.0025, 6), M['metal'])
    return g


def knob_geo(M, r=0.011):
    g = Geo()
    g.put(sweep(circle(r + 0.003, 12), [(0, 0), (0, 0.003), (0.003, 0.0045)], cap=False), M['knob'])
    g.put(sweep(circle(r, 12), [(0, 0.0045), (0, 0.017), (0.002, 0.019)]), M['knob'])
    g.put(pad(0.0016, r * 0.9, 0.0006, 0.0002, 0, r * 0.5), M['legend'], T(0, 0, 0.019))
    return g


def key_geo(M):
    g = Geo()
    g.put(pad(0.016, 0.013, 0.004, 0.001), M['button'])
    return g


def tile_geo(M, material, w=0.062, h=0.021):
    g = Geo()
    g.put(pad(w, h, 0.004, 0.0012), M[material])
    return g


def screw_geo(M):
    g = Geo()
    g.put(sweep(circle(0.0038, 8), [(0, 0), (0.0008, 0.0012)]), M['metal'])
    g.put(([(-0.0004, -0.003, 0.00135), (0.0004, -0.003, 0.00135), (0.0004, 0.003, 0.00135), (-0.0004, 0.003, 0.00135)], [(0, 1, 2, 3)]), M['slot_dark'])
    return g


def bolt_geo(M):
    g = Geo()
    g.put(sweep(circle(0.0066, 6), [(-0.0016, 0), (0, 0.0012), (0, 0.004), (0.0013, 0.005)]), M['bolt'])
    return g


def gauge_geo(M, r, kind='dial', needle=40.0):
    """A round standby instrument: bezel ring, sunk face, tick marks and a needle (or a horizon)."""
    g = Geo()
    g.put(sweep(circle(r + 0.008, 24), [(0, 0), (0, 0.007), (0.002, 0.009), (0.006, 0.009), (0.008, 0.003)], cap=False), M['bezel'])
    if kind == 'horizon':
        upper = [(r * math.cos(math.pi * i / 12), r * math.sin(math.pi * i / 12), 0.003) for i in range(13)]
        lower = [(r * math.cos(math.pi + math.pi * i / 12), r * math.sin(math.pi + math.pi * i / 12), 0.003) for i in range(13)]
        g.put((upper, [tuple(range(13))]), M['adi_sky'], R('Z', 6))
        g.put((lower, [tuple(range(13))]), M['adi_ground'], R('Z', 6))
        g.put(pad(2 * r, 0.0012, 0.0004, 0.0001), M['legend'], R('Z', 6) @ T(0, 0, 0.003))
        for k in (-2, -1, 1, 2):
            g.put(pad(r * (0.5 if k % 2 else 0.8), 0.0008, 0.0004, 0.0001, 0, k * r * 0.2), M['legend'], R('Z', 6) @ T(0, 0, 0.003))
        g.put(pad(r * 0.9, 0.003, 0.0012, 0.0003), M['amber'], T(0, 0, 0.0036))
        g.put(sweep(circle(0.004, 8), [(0, 0), (0.001, 0.0016)]), M['amber'], T(0, 0, 0.0036))
    else:
        g.put(disc(r, 24, 0.003), M['gauge_face'])
        for i in range(12):
            g.put(pad(0.0012, 0.008 if i % 3 == 0 else 0.005, 0.0004, 0.0001, 0, r - 0.006), M['legend'], R('Z', i * 30) @ T(0, 0, 0.003))
        g.put(pad(0.0022, r * 0.82, 0.0008, 0.0002, 0, r * 0.3), M['legend'], R('Z', needle) @ T(0, 0, 0.0036))
        g.put(sweep(circle(0.0045, 10), [(0, 0), (0.001, 0.002)]), M['knob'], T(0, 0, 0.0036))
    return g


def lever_geo(M, length=0.185):
    """One throttle lever: origin on the hinge, the arm along +Z, a block knob centred `length` up it."""
    g = Geo()
    g.put(sweep(circle(0.017, 12), [(0.002, -0.004), (0, -0.002), (0, 0.002), (0.002, 0.004)], cap=True, bottom=True), M['metal'], R('Y', 90))
    g.put(block(0.007, 0.016, length - 0.017, 0.0015), M['metal'], T(0, 0, 0.008))
    g.put(block(0.029, 0.034, 0.028, 0.007), M['throttle_knob'], T(0, 0, length - 0.014))
    return g


def pedal_geo(M):
    """A rudder pedal: origin on the floor under it, the tread facing -Y (towards the pilot)."""
    g = Geo()
    lean = R('X', -22)
    g.put(tube([(0, 0.05, 0.0), (0, 0.03, 0.12), (0, 0.0, 0.2)], 0.013, 8), M['metal'])
    g.put(block(0.11, 0.014, 0.16, 0.003), M['seat_frame'], T(0, 0.0, 0.13) @ lean)
    for i in range(5):
        g.put(block(0.1, 0.006, 0.008, 0.002), M['tread'], T(0, 0.0, 0.13) @ lean @ T(0, -0.008, 0.02 + i * 0.03))
    return g


def striped(geo, path, radius, M, seg=8, every=1):
    """A tube whose segments alternate yellow and black (the ejection handles)."""
    rings = tube_rings(path, radius, seg)
    for i in range(len(rings) - 1):
        geo.put(loft(rings[i:i + 2], i == 0, i == len(rings) - 2), M['handle_yellow' if (i // every) % 2 == 0 else 'handle_black'])


def seat_geo(M):
    """An ejection seat: origin on the floor under the back of the seat pan, facing +Y.

    Rails, bucket, cushions, headrest box with the two striped face handles, the striped seat-pan
    handle, an unbuckled harness (shoulder straps, lap belts, release box).
    """
    g = Geo()
    frame_m, cloth, web, metal = M['seat_frame'], M['seat_fabric'], M['harness'], M['metal']
    lean = R('X', 12)
    for sx in (-0.17, 0.17):
        g.put(block(0.045, 0.06, 1.3, 0.004), frame_m, T(sx, -0.1, 0.0) @ lean)
        g.put(block(0.04, 0.72, 0.03, 0.004), frame_m, T(sx, 0.16, 0.0))
        for z in (0.35, 0.7, 1.05):
            g.put(sweep(circle(0.012, 8), [(0, 0), (0, 0.006), (0.003, 0.009)]), metal, T(sx, -0.1, 0.0) @ lean @ T(0.0, -0.03, z) @ R('X', 90))
    g.put(block(0.3, 0.3, 0.06, 0.004), frame_m, T(0, 0.2, 0.0))
    g.put(block(0.46, 0.5, 0.15, 0.008), frame_m, T(0, 0.24, 0.05))
    for sx in (-1, 1):
        g.put(block(0.022, 0.5, 0.1, 0.006), frame_m, T(sx * 0.23, 0.24, 0.17))
    g.put(block(0.4, 0.44, 0.06, 0.016), cloth, T(0, 0.25, 0.19))
    g.put(block(0.4, 0.008, 0.006, 0.002), web, T(0, 0.33, 0.247))
    g.put(block(0.44, 0.07, 0.8, 0.008), frame_m, T(0, -0.05, 0.16) @ lean)
    g.put(block(0.36, 0.05, 0.56, 0.016), cloth, T(0, -0.012, 0.26) @ lean)
    for z in (0.2, 0.38):
        g.put(block(0.36, 0.008, 0.006, 0.002), web, T(0, -0.012, 0.26) @ lean @ T(0, 0.022, z))
    g.put(block(0.34, 0.16, 0.3, 0.012), frame_m, T(0, -0.32, 0.9))
    g.put(block(0.24, 0.07, 0.2, 0.018), cloth, T(0, -0.205, 0.93))
    for sx in (-1, 1):
        g.put(block(0.02, 0.11, 0.2, 0.006), frame_m, T(sx * 0.135, -0.2, 0.93))
        g.put(tube([(sx * 0.1, -0.36, 1.2), (sx * 0.1, -0.33, 1.26)], [0.012, 0.004], 6), metal)
        loop = [(sx * 0.075 + 0.04 * math.cos(math.pi * k / 8), -0.25, 1.2 + 0.045 * math.sin(math.pi * k / 8)) for k in range(9)]
        striped(g, loop, 0.007, M, 8)
    ring = [(-0.055, 0.475, 0.2)] + [(0.055 * math.cos(math.pi - math.pi * k / 10), 0.475, 0.27 + 0.055 * math.sin(math.pi * k / 10)) for k in range(11)] + [(0.055, 0.475, 0.2)]
    striped(g, ring, 0.0085, M, 8)
    g.put(block(0.16, 0.03, 0.04, 0.006), frame_m, T(0, 0.475, 0.17))
    up = (0.0, 0.978, 0.208)
    for sx in (-1, 1):
        path = [(sx * 0.085, -0.12, 0.9)]
        for z in (0.86, 0.72, 0.58, 0.44, 0.34):
            path.append((sx * (0.085 + 0.05 * (0.86 - z)), 0.022 - (z - 0.26) * 0.2126 + 0.004, z))
        path += [(sx * 0.125, 0.03, 0.262), (sx * 0.13, 0.12, 0.252), (sx * 0.125, 0.2, 0.252)]
        normals = [up] * 6 + [(0, 0.5, 0.86), (0, 0, 1), (0, 0, 1)]
        g.put(strap(path, 0.045, 0.003, normals), web)
        g.put(block(0.052, 0.03, 0.01, 0.002), metal, T(sx * 0.096, 0.022 - (0.66 - 0.26) * 0.2126 + 0.004, 0.66) @ R('X', 102))
        g.put(block(0.03, 0.05, 0.005, 0.0015), metal, T(sx * 0.125, 0.23, 0.251))
        g.put(strap([(sx * 0.225, 0.1, 0.262), (sx * 0.2, 0.12, 0.252), (sx * 0.13, 0.24, 0.252), (sx * 0.075, 0.3, 0.252)], 0.045, 0.003, (0, 0, 1)), web)
        g.put(block(0.03, 0.045, 0.005, 0.0015), metal, T(sx * 0.06, 0.315, 0.252) @ R('Z', sx * 40))
    g.put(sweep(circle(0.036, 14), [(0, 0), (0, 0.016), (0.004, 0.02)]), metal, T(0, 0.34, 0.25))
    g.put(sweep(circle(0.02, 10), [(0, 0.02), (0, 0.026), (0.003, 0.029)]), M['knob'], T(0, 0.34, 0.25))
    g.put(block(0.03, 0.09, 0.03, 0.006), M['handle_yellow'], T(0.25, 0.3, 0.2))
    g.put(block(0.03, 0.03, 0.03, 0.006), M['handle_black'], T(0.25, 0.36, 0.2))
    return g


# --- the gloved hands -------------------------------------------------------------------------------------
PALM_RINGS = ((-0.004, 0.056, 0.038, 0.0, -0.002), (0.012, 0.066, 0.038, -0.002, -0.003), (0.035, 0.08, 0.035, -0.003, -0.004),
              (0.06, 0.086, 0.031, -0.001, -0.003), (0.082, 0.089, 0.027, 0.0, -0.002), (0.096, 0.088, 0.022, 0.0, -0.002),
              (0.104, 0.078, 0.012, 0.0, -0.002))
FINGERS = (   # knuckle (x, y), lengths of the three bones, radius at the root and at the tip, spread (degrees)
    ((-0.032, 0.097), (0.043, 0.025, 0.019), (0.0102, 0.0085), -3.0),
    ((-0.0105, 0.101), (0.047, 0.029, 0.02), (0.0105, 0.0087), -1.0),
    ((0.011, 0.097), (0.043, 0.027, 0.019), (0.0098, 0.0082), 1.5),
    ((0.031, 0.088), (0.034, 0.02, 0.017), (0.0088, 0.0073), 4.5),
)


def _digit(points, r0, r1, lateral, M, seg=12, leather_tip=0.012):
    """A finger along its joints (the first point lies inside the palm): a tube with rounded knuckles and a
    round tip; the palm side and the fingertip are leather, the back is fabric."""
    points = [Vector(p) for p in points]
    path = [points[0]]
    for k in range(1, len(points) - 1):
        a, j, b = points[k - 1], points[k], points[k + 1]
        e = min(0.011, 0.42 * (j - a).length, 0.42 * (b - j).length)
        p0, p2 = j + (a - j).normalized() * e, j + (b - j).normalized() * e
        for t in (0.0, 0.3, 0.5, 0.7, 1.0):
            path.append(p0 * (1 - t) ** 2 + j * (2 * t * (1 - t)) + p2 * t ** 2)
    path.append(points[-1])
    lengths = [0.0]
    for a, b in zip(path, path[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    total = lengths[-1]
    lateral = Vector(lateral).normalized()
    rings, tangents = [], []
    for i, p in enumerate(path):
        tangent = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        side = (lateral - tangent * lateral.dot(tangent)).normalized()
        back = side.cross(tangent)
        r = r0 + (r1 - r0) * lengths[i] / total
        rings.append([tuple(p + side * (math.cos(2 * math.pi * k / seg) * r * 1.05) + back * (math.sin(2 * math.pi * k / seg) * r * 0.96)) for k in range(seg)])
        tangents.append((tangent, side, back))
    tangent, side, back = tangents[-1]
    for angle in (35, 62, 82):
        c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
        centre = path[-1] + tangent * (r1 * s)
        rings.append([tuple(centre + side * (math.cos(2 * math.pi * k / seg) * r1 * 1.05 * c) + back * (math.sin(2 * math.pi * k / seg) * r1 * 0.96 * c)) for k in range(seg)])
    verts = [p for ring in rings for p in ring]
    faces, mats = [], []
    for k in range(len(rings) - 1):
        a, b = k * seg, (k + 1) * seg
        at_tip = k >= len(path) - 1 or total - lengths[min(k, len(lengths) - 1)] < leather_tip
        for i in range(seg):
            j = (i + 1) % seg
            faces.append((a + i, a + j, b + j, b + i))
            mats.append(M['glove_leather'] if at_tip or math.sin(2 * math.pi * (i + 0.5) / seg) < -0.1 else M['glove_fabric'])
    faces.append(tuple((len(rings) - 1) * seg + i for i in range(seg)))
    mats.append(M['glove_leather'])
    faces.append(tuple(range(seg - 1, -1, -1)))          # the root, hidden inside the palm
    mats.append(M['glove_leather'])
    return verts, orient((verts, faces))[1], mats


def _wrap(base, lateral, forward, lengths, radii, bar, slack=0.0, limit=200.0):
    """Joint positions of a finger curled round a bar lying along the hand's X axis at (y, z) = bar[:2];
    limit: the most the three joints may bend together (degrees). Returns the points and the bends."""
    up = lateral.cross(forward)
    centre = Vector((0.0, bar[0], bar[1]))
    points = [base - forward * 0.022, base]
    angle = 0.0
    bends = []
    for k, length in enumerate(lengths):
        reach = bar[2] + radii[0] + (radii[1] - radii[0]) * (k + 0.5) / 3.0 + slack
        pivot = points[-1]
        chosen = None
        for step in range(0, 106, 1):
            if angle + step >= limit:
                chosen = step
                break
            a = math.radians(angle + step)
            end = pivot + (forward * math.cos(a) - up * math.sin(a)) * length
            seg = end - pivot
            rel = Vector((0.0, centre.y - pivot.y, centre.z - pivot.z))
            seg2 = Vector((0.0, seg.y, seg.z))
            t = max(0.0, min(1.0, rel.dot(seg2) / max(seg2.length_squared, 1e-9)))
            if (rel - seg2 * t).length <= reach:
                chosen = step
                break
        if chosen is None:
            chosen = 95 if k else 60
        angle += chosen
        bends.append(chosen)
        a = math.radians(angle)
        points.append(pivot + (forward * math.cos(a) - up * math.sin(a)) * length)
    return points, bends


def hand_geo(M, bar, thumb, relax=(0.0, 0.0, 0.0, 0.0), limit=(200.0, 200.0, 200.0, 200.0)):
    """A gloved RIGHT hand gripping a bar, in hand space: the wrist at the origin, the fingers towards +Y,
    the back of the hand +Z, the thumb on -X. bar = (y, z, radius) of the bar lying along X under the
    palm; thumb = the directions of its three bones; relax = extra clearance per finger (metres).
    A left hand is this one placed through a mirroring matrix.
    """
    g = Geo()
    seg = 20
    rings = []
    for y, w, t, x0, z0 in PALM_RINGS:
        ring = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            c, s = math.cos(a), math.sin(a)
            px = x0 + math.copysign(abs(c) ** (2 / 2.6), c) * w / 2
            pz = z0 + math.copysign(abs(s) ** (2 / 2.6), s) * t / 2
            ring.append((px, y - 11.0 * (px + 0.008) ** 2 * max(y, 0.0) / 0.1, pz))
        rings.append(ring)
    verts, faces = loft(rings)
    mats = []
    for face in faces:
        pts = [Vector(verts[i]) for i in face]
        normal = (pts[1] - pts[0]).cross(pts[2] - pts[0])
        mats.append(M['glove_leather'] if normal.z < -0.25 * normal.length else M['glove_fabric'])
    g.put((verts, faces), mats)
    info = {}
    for index, ((kx, ky), lengths, radii, spread) in enumerate(FINGERS):
        turn = Matrix.Rotation(math.radians(-spread), 3, 'Z')
        forward, lateral = turn @ Vector((0, 1, 0)), turn @ Vector((1, 0, 0))
        points, angle = _wrap(Vector((kx, ky, -0.002)), lateral, forward, lengths, radii, bar, relax[index], limit[index])
        v, f, m = _digit(points, radii[0], radii[1], lateral, M)
        g.put((v, f), m)
        info['finger_%d' % index] = angle
    base = Vector((-0.028, 0.022, -0.008))
    joints = [base - Vector(thumb[0]).normalized() * 0.012, base]
    for direction, length in zip(thumb, (0.04, 0.032, 0.026)):
        joints.append(joints[-1] + Vector(direction).normalized() * length)
    lateral = Vector(thumb[0]).cross(Vector(thumb[2]))
    if lateral.length < 1e-3:
        lateral = Vector((0, 0, 1)).cross(Vector(thumb[0]))
    v, f, m = _digit(joints, 0.0125, 0.0105, lateral, M, leather_tip=0.016)
    g.put((v, f), m)
    g.put(ellipsoid((0.017, 0.03, 0.014)), M['glove_leather'], T(-0.024, 0.036, -0.012) @ R('Z', 24))
    for sx in (-0.021, 0.0, 0.021):   # seams over the back of the hand
        path = [(sx * (0.7 + 3.0 * y), y, 0.5 * t + z0 + 0.0004) for y, w, t, x0, z0 in PALM_RINGS[1:6]]
        g.put(tube(path, 0.0012, 5), M['glove_seam'])
    g.put(block(0.032, 0.02, 0.0035, 0.001), M['glove_leather'], T(0.004, 0.006, 0.0165))
    g.put(block(0.012, 0.02, 0.005, 0.001), M['glove_seam'], T(0.022, 0.006, 0.0165))
    info['tip'] = [round(c, 3) for c in joints[-1]]
    return g, info


def arm_geo(M, wrist, into_hand, elbow, shoulder):
    """The glove's gauntlet and the flight-suit sleeve, in aircraft space: from just inside the hand back
    past the elbow and a short way up towards the shoulder, closed at the end."""
    hand, sleeve = Geo(), Geo()
    wrist, elbow, shoulder = Vector(wrist), Vector(elbow), Vector(shoulder)
    fore = (elbow - wrist).normalized()
    length = (elbow - wrist).length
    path = [wrist + Vector(into_hand).normalized() * 0.014, wrist] + [wrist + fore * s for s in (0.03, 0.06, 0.085)]
    hand.put(tube(path, [0.026, 0.029, 0.033, 0.038, 0.039], 12, squash=0.86, side=(0, 0, 1)), M['glove_fabric'])
    hand.put(tube([wrist + fore * 0.078, wrist + fore * 0.09], 0.0405, 12, squash=0.86, side=(0, 0, 1)), M['glove_seam'])
    path, radii = [], []
    s = 0.06
    while s < length - 0.03:
        path.append(wrist + fore * s)
        radii.append(0.042 + 0.012 * (s - 0.06) / max(length - 0.06, 0.01) + 0.0028 * math.sin(s * 150.0))
        s += 0.018
    upper = (shoulder - elbow).normalized()
    for k, r in ((0.0, 0.056), (0.035, 0.058), (0.075, 0.058), (0.115, 0.057), (0.135, 0.04)):
        path.append(elbow + upper * k - fore * (0.02 if k == 0.0 else 0.0))
        radii.append(r)
    sleeve.put(tube(path, radii, 12, squash=0.9, side=(0, 0, 1)), M['sleeve'])
    sleeve.put(tube([wrist + fore * 0.058, wrist + fore * 0.072], 0.0445, 12, squash=0.88, side=(0, 0, 1)), M['sleeve'])
    return hand, sleeve


# --- pipeline: objects, unwrap, bake, checks, export -----------------------------------------------------
SWATCH = 0.03                # the strip of the atlas kept for plain-coloured legends
BAKED = {}                   # the last bake's texture files {base, orm, normal}


def _swatch_uvs(obj):
    """Every face of a flat object takes its material's small square in the swatch strip."""
    mesh = obj.data
    layer = mesh.uv_layers.new(name='atlas')
    corners = ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0))
    for poly in mesh.polygons:
        u0 = 0.004 + poly.material_index * 0.024
        for k, loop in enumerate(poly.loop_indices):
            c = corners[k % 4]
            layer.data[loop].uv = (u0 + 0.016 * c[0], 0.004 + (SWATCH - 0.01) * c[1])


def _unwrap(items, margin=0.0018):
    """One UV layout for (object, density) pairs: islands at the same texel density times the density."""
    objs = [o for o, _ in items]
    for obj, density in items:
        obj.data.transform(Matrix.Scale(density, 4))
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
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj, density in items:
        obj.data.transform(Matrix.Scale(1.0 / density, 4))
        layer = obj.data.uv_layers['atlas']
        uv = np.empty(len(layer.data) * 2, dtype=np.float32)
        layer.data.foreach_get('uv', uv)
        uv[1::2] = SWATCH + (1.0 - SWATCH) * uv[1::2]
        layer.data.foreach_set('uv', uv)


def realise(kit, pivots, parents, bake=None, log=print):
    """Turns the kit into the contract's nodes. bake: None, or (atlas size, work dir) to unwrap and bake.

    pivots: node -> origin; parents: child node -> parent node. Returns {node: object}.
    """
    items = []                     # (object, node, density)
    for (node, density), geo in kit.unique.items():
        if geo.f:
            items.append((mk.shade(geo.object('%s_d%s' % (node, density)), 38), node, density))
    firsts = {}
    for key, stamp in kit.stamps.items():
        if stamp['places']:
            matrix, node = stamp['places'][0]
            obj = mk.shade(Geo().merge(stamp['geo'], matrix).object('stamp_' + key), 38)
            items.append((obj, node, stamp['density']))
            firsts[key] = (obj, matrix)
    flats = []
    for node, geo in kit.flat.items():
        if geo.f:
            obj = geo.object(node + '_legends')
            _swatch_uvs(obj)
            flats.append((obj, node))
    if bake:
        _unwrap([(o, d) for o, _, d in items])
        log('unwrapped')
    copies = []
    for key, stamp in kit.stamps.items():
        if key not in firsts:
            continue
        first, first_matrix = firsts[key]
        undo = first_matrix.inverted()
        for matrix, node in stamp['places'][1:]:
            copy = mk.duplicate(first, 'copy_' + key)
            move = matrix @ undo
            copy.data.transform(move)
            if move.to_3x3().determinant() < 0:
                copy.data.flip_normals()
            copies.append((copy, node))
    if bake:
        size, work_dir = bake
        glass = [o for o in bpy.context.scene.objects if o.type == 'MESH' and any(m.name in ('canopy_glass', 'hud_glass') for m in o.data.materials)]
        for o in glass:
            o.hide_render = True
        baked = [o for o, _, _ in items] + [o for o, _ in flats]
        paths = atlasbake.bake(baked, size, work_dir, occlusion_samples=int(os.environ.get('MANTA_COCKPIT_AO', '40')),
                               occlusion_in_color=0.5, occlusion_distance=0.4)
        atlasbake.swap_materials(baked + [o for o, _ in copies], paths)
        BAKED.clear()
        BAKED.update(paths)
        for o in glass:
            o.hide_render = False
        log('baked')
    nodes = {}
    by_node = {}
    for obj, node in [(o, n) for o, n, _ in items] + flats + copies:
        by_node.setdefault(node, []).append(obj)
    for node, objs in by_node.items():
        obj = mk.join(node, objs)
        if node in pivots:
            mk.set_origin(obj, pivots[node])
        nodes[node] = obj
    bpy.context.view_layer.update()
    for child, parent in parents.items():
        nodes[child].parent = nodes[parent]
        nodes[child].matrix_parent_inverse = nodes[parent].matrix_world.inverted()
    bpy.context.view_layer.update()
    return nodes


def _tag(material):
    name = material.replace('_source', '')
    if name.startswith('glove'):
        return 'H'
    return {'sleeve': 'h', 'frame_paint': '#', 'sealant': '#', 'bolt': '#', 'lining': ':', 'wall': ':', 'glare': 'g', 'stitch': 'g',
            'int_grey': 'p', 'plate_grey': 'p', 'bezel': 'B', 'button': 'B', 'screen_live': 'D', 'throttle_knob': 'T', 'grip': 'S',
            'seat_fabric': 'c', 'seat_frame': 'c', 'harness': 'c', 'floor': '_', 'tread': '_', 'hud_glass': 'U'}.get(name, '.')


class Sight:
    """Ray tests from the pilot's eye over everything opaque (and the combiner glass, kept apart)."""

    def __init__(self, objects, tags=None):
        verts, polys, self.owner = [], [], []
        for obj in objects:
            if obj.type != 'MESH':
                continue
            names = [m.name for m in obj.data.materials]
            if any(n == 'canopy_glass' for n in names):
                continue
            base = len(verts)
            world = obj.matrix_world
            verts.extend(world @ v.co for v in obj.data.vertices)
            for poly in obj.data.polygons:
                polys.append([base + i for i in poly.vertices])
                self.owner.append((obj.name, names[poly.material_index] if names else ''))
        self.tree = BVHTree.FromPolygons(verts, polys)

    def first(self, origin, target):
        origin, target = Vector(origin), Vector(target)
        direction = (target - origin).normalized()
        hit = self.tree.ray_cast(origin, direction, 80.0)
        if hit[0] is None:
            return None, None, None
        return self.owner[hit[2]][0], self.owner[hit[2]][1], hit[3]

    def backfaces(self, origin, yaw=100, pitch=45, step=2.5):
        """Share of the directions a head at origin can look in that meet a face from behind (the game
        culls those), and the materials that own them."""
        total, wrong, owners = 0, 0, {}
        origin = Vector(origin)
        a = -yaw
        while a <= yaw:
            b = -pitch - 32
            while b <= pitch + 32:
                direction = Vector((math.sin(math.radians(a)) * math.cos(math.radians(b)), math.cos(math.radians(a)) * math.cos(math.radians(b)),
                                    math.sin(math.radians(b))))
                hit = self.tree.ray_cast(origin, direction, 80.0)
                total += 1
                if hit[0] is None:
                    if b < -16:
                        owners['(open below -16 deg)'] = owners.get('(open below -16 deg)', 0) + 1
                        owners.setdefault('(where)', []).append((a, b))
                elif hit[1].dot(direction) > 0.02:
                    wrong += 1
                    key = '%s/%s' % self.owner[hit[2]]
                    owners[key] = owners.get(key, 0) + 1
                b += step
            a += step
        where = owners.pop('(where)', [])[:10]
        return {'share': round(wrong / float(total), 4), 'by': dict(sorted(owners.items(), key=lambda kv: -kv[1])[:8]), 'open_at': where}

    def picture(self, eye, fov, columns=96, rows=40, aspect=1.6, pitch=0.0, yaw=0.0):
        """The view (straight ahead unless turned) as text, one letter per kind of surface (see _tag), and where each node shows."""
        tan_v = math.tan(math.radians(fov) / 2)
        lines, seen = [], {}
        turn = Matrix.Rotation(math.radians(-yaw), 3, 'Z') @ Matrix.Rotation(math.radians(pitch), 3, 'X')
        for row in range(rows):
            sy = 1.0 - 2.0 * (row + 0.5) / rows
            line = ''
            for column in range(columns):
                sx = 2.0 * (column + 0.5) / columns - 1.0
                direction = turn @ Vector((sx * tan_v * aspect, 1.0, sy * tan_v))
                node, material, _ = self.first(eye, Vector(eye) + direction)
                line += ' ' if node is None else _tag(material)
                if node is not None:
                    box = seen.setdefault(node, [1.0, 0.0, 1.0, 0.0, 0])
                    fx, fy = 0.5 + sx / 2, 0.5 + sy / 2
                    box[0], box[1], box[2], box[3], box[4] = min(box[0], fx), max(box[1], fx), min(box[2], fy), max(box[3], fy), box[4] + 1
            lines.append(line)
        share = {k: [round(v, 3) for v in box[:4]] + [round(box[4] / (columns * rows), 4)] for k, box in seen.items()}
        sky = sum(line.count(' ') for line in lines) / float(columns * rows)
        return lines, share, round(sky, 4)


def uv_range(obj):
    layer = obj.data.uv_layers.active
    us = [d.uv[0] for d in layer.data]
    vs = [d.uv[1] for d in layer.data]
    return [round(min(us), 4), round(max(us), 4), round(min(vs), 4), round(max(vs), 4)]


def render_view(path, location, target, fov, size=(640, 400), samples=48, glow=()):
    """A Cycles picture from a point towards a target under a dawn sky; glow: (point, colour, watts) lamps."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 82
    world = scene.world or bpy.data.worlds.new('dawn')
    scene.world = world
    world.use_nodes = True
    background = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    background.inputs['Color'].default_value = (0.55, 0.66, 0.86, 1.0)
    background.inputs['Strength'].default_value = 1.6
    made = []
    sun_data = bpy.data.lights.new('dawn_sun', 'SUN')
    sun_data.energy, sun_data.color, sun_data.angle = 5.0, (1.0, 0.82, 0.62), math.radians(2.0)
    sun = bpy.data.objects.new('dawn_sun', sun_data)
    sun.rotation_euler = Vector((0.3, -1.0, -0.2)).to_track_quat('-Z', 'Y').to_euler()   # low, ahead, a little to the left
    scene.collection.objects.link(sun)
    made.append(sun)
    for point, colour, watts in glow:
        data = bpy.data.lights.new('glow', 'POINT')
        data.energy, data.color, data.shadow_soft_size = watts, colour, 0.12
        lamp = bpy.data.objects.new('glow', data)
        lamp.location = point
        scene.collection.objects.link(lamp)
        made.append(lamp)
    bpy.ops.mesh.primitive_plane_add(size=6000, location=(0, 0, 0))
    ground = bpy.context.active_object
    material = bpy.data.materials.new('dawn_ground')
    material.use_nodes = True
    next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (0.1, 0.11, 0.1, 1)
    ground.data.materials.append(material)
    made.append(ground)
    camera_data = bpy.data.cameras.new('view')
    camera_data.sensor_fit = 'VERTICAL'
    camera_data.angle_y = math.radians(fov)
    camera_data.clip_start, camera_data.clip_end = 0.02, 8000
    camera = bpy.data.objects.new('view', camera_data)
    camera.location = location
    camera.rotation_euler = (Vector(target) - Vector(location)).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(camera)
    scene.camera = camera
    made.append(camera)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for obj in made:
        bpy.data.objects.remove(obj, do_unlink=True)
    return path


def render_sheet(path, views, cell=(320, 200), samples=32, glow=()):
    """Several views (location, target, fov) pasted two across into one JPEG."""
    from PIL import Image
    tiles = [render_view(path + '.tile%d.jpg' % i, location, target, fov, cell, samples, glow) for i, (location, target, fov) in enumerate(views)]
    columns = 2 if len(tiles) > 1 else 1
    sheet = Image.new('RGB', (cell[0] * columns, cell[1] * ((len(tiles) + columns - 1) // columns)))
    for i, tile in enumerate(tiles):
        sheet.paste(Image.open(tile).convert('RGB'), ((i % columns) * cell[0], (i // columns) * cell[1]))
        os.remove(tile)
    sheet.save(path, quality=84)
    return path


# --- the .glb: export, Draco geometry, checks ------------------------------------------------------------
def export_glb(objects, out_path, extras, quality=82):
    scene = bpy.context.scene
    for key, value in extras.items():
        scene[key] = value
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_render = False
        obj.select_set(True)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=True, export_image_format='WEBP',
                              export_image_quality=quality, export_extras=True, export_yup=True, export_apply=True,
                              export_animations=False, export_tangents=False, export_cameras=False, export_lights=False)
    document, rest = read_glb(out_path)
    for material in document.get('materials', []):
        name = material.get('name', '')
        if name in ('canopy_glass', 'hud_glass'):
            pbr = material.setdefault('pbrMetallicRoughness', {})
            factor = pbr.get('baseColorFactor', [0.6, 0.7, 0.65, 1.0])
            factor[3] = round(material.get('extras', {}).get('alpha', 0.12), 3)
            pbr['baseColorFactor'] = factor
            material['alphaMode'] = 'BLEND'
            material['doubleSided'] = True
    write_glb(out_path, document, rest)


def read_glb(path):
    with open(path, 'rb') as handle:
        data = handle.read()
    length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + length].decode('utf-8'))
    rest = data[20 + length:]
    return document, (rest[8:8 + struct.unpack_from('<I', rest, 0)[0]] if rest else b'')


def write_glb(path, document, binary):
    text = json.dumps(document, separators=(',', ':')).encode('utf-8')
    text += b' ' * ((4 - len(text) % 4) % 4)
    binary = bytes(binary) + b'\x00' * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(text) + 8 + len(binary)
    with open(path, 'wb') as handle:
        handle.write(struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(text), b'JSON') + text +
                     struct.pack('<I4s', len(binary), b'BIN\x00') + binary)


def recompress_images(path, sources, quality, sizes=None):
    """Replaces the file's atlas images by WebP encodes of the baked PNGs: sources {name: png path},
    quality {name: 0..100}, sizes {name: pixels} to store a map smaller than it was baked."""
    import io
    from PIL import Image
    document, binary = read_glb(path)
    views = document['bufferViews']
    fresh = {}
    for image in document.get('images', []):
        name = image.get('name')
        if name in sources and name in quality and 'bufferView' in image:
            picture = Image.open(sources[name]).convert('RGB')
            if sizes and sizes.get(name) and sizes[name] != picture.size[0]:
                picture = picture.resize((sizes[name], sizes[name]), Image.LANCZOS)
            buffer = io.BytesIO()
            picture.save(buffer, 'WEBP', quality=quality[name], method=6)
            fresh[image['bufferView']] = buffer.getvalue()
            image['mimeType'] = 'image/webp'
    out = bytearray()
    for index in sorted(range(len(views)), key=lambda i: views[i].get('byteOffset', 0)):
        view = views[index]
        start = view.get('byteOffset', 0)
        data = fresh.get(index, binary[start:start + view['byteLength']])
        view['byteOffset'], view['byteLength'] = len(out), len(data)
        out += data + b'\x00' * ((4 - len(data) % 4) % 4)
    document['buffers'] = [{'byteLength': len(out)}]
    write_glb(path, document, bytes(out))


def _draco():
    """The Draco encoder (the DracoPy wheel): Blender's own bridge library is not in this Python module."""
    for attempt in range(2):
        if PYDEPS not in sys.path and os.path.isdir(PYDEPS):
            sys.path.insert(0, PYDEPS)
        try:
            import DracoPy
            return DracoPy
        except Exception:
            if attempt == 0:
                try:
                    subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '--no-deps', '--target', PYDEPS, 'DracoPy==2.2.0'],
                                   timeout=240, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except Exception:
                    pass
    return None


_TYPES = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
_WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def draco_pack(path, bits=(14, 12, 8)):
    """Rewrites a .glb with its triangle meshes in KHR_draco_mesh_compression. True when it did.
    bits: quantisation of positions (per mesh's own box), texture coordinates and normals."""
    document, binary = read_glb(path)
    if 'KHR_draco_mesh_compression' in document.get('extensionsUsed', []):
        return True
    encoder = _draco()
    if encoder is None:
        return False
    views, accessors = document['bufferViews'], document['accessors']

    def array(index):
        accessor = accessors[index]
        view = views[accessor['bufferView']]
        kind, width = _TYPES[accessor['componentType']], _WIDTH[accessor['type']]
        start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        stride = view.get('byteStride', 0)
        if stride and stride != np.dtype(kind).itemsize * width:
            raw = np.frombuffer(binary, dtype=np.uint8, count=stride * accessor['count'], offset=start).reshape(accessor['count'], stride)
            return np.frombuffer(raw[:, :np.dtype(kind).itemsize * width].tobytes(), dtype=kind).reshape(accessor['count'], width)
        return np.frombuffer(binary, dtype=kind, count=accessor['count'] * width, offset=start).reshape(accessor['count'], width)

    blobs, new_views, packed = [], [], set()
    offset = 0

    def add_view(data, extra=None):
        nonlocal offset
        data = bytes(data) + b'\x00' * ((4 - len(data) % 4) % 4)
        view = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)}
        view.update(extra or {})
        blobs.append(data)
        new_views.append(view)
        offset += len(data)
        return len(new_views) - 1

    for mesh in document.get('meshes', []):
        for primitive in mesh['primitives']:
            attributes = primitive['attributes']
            if primitive.get('mode', 4) != 4 or 'indices' not in primitive or set(attributes) - {'POSITION', 'NORMAL', 'TEXCOORD_0'}:
                raise RuntimeError('draco_pack: a primitive this packer does not handle in mesh %s' % mesh.get('name'))
            faces = array(primitive['indices']).astype(np.uint32).reshape(-1, 3)
            options = {}
            if 'TEXCOORD_0' in attributes:
                options.update(tex_coord=array(attributes['TEXCOORD_0']).astype(np.float64), tex_coord_quantization_bits=bits[1])
            if 'NORMAL' in attributes:
                options.update(normals=array(attributes['NORMAL']).astype(np.float64), normal_quantization_bits=bits[2])
            blob = encoder.encode(array(attributes['POSITION']).astype(np.float32), faces, quantization_bits=bits[0], compression_level=10, **options)
            decoded = encoder.decode(blob)
            ids = {}
            for attribute in decoded.attributes:
                ids[{0: 'POSITION', 1: 'NORMAL', 3: 'TEXCOORD_0'}[attribute['attribute_type']]] = attribute['unique_id']
            count = int(decoded.points.shape[0])
            for name in attributes:
                accessors[attributes[name]]['count'] = count
                packed.add(attributes[name])
            accessors[primitive['indices']]['count'] = int(decoded.faces.shape[0]) * 3
            if count > 65535:
                accessors[primitive['indices']]['componentType'] = 5125
            packed.add(primitive['indices'])
            primitive.setdefault('extensions', {})['KHR_draco_mesh_compression'] = {
                'bufferView': add_view(blob), 'attributes': {name: ids[name] for name in attributes}}
    remap = {}
    for index, view in enumerate(views):
        users = [i for i, a in enumerate(accessors) if a.get('bufferView') == index]
        if users and all(i in packed for i in users):
            continue
        start = view.get('byteOffset', 0)
        extra = {k: v for k, v in view.items() if k not in ('buffer', 'byteOffset', 'byteLength')}
        remap[index] = add_view(binary[start:start + view['byteLength']], extra)
    for index, accessor in enumerate(accessors):
        if index in packed:
            accessor.pop('bufferView', None)
            accessor.pop('byteOffset', None)
        elif 'bufferView' in accessor:
            accessor['bufferView'] = remap[accessor['bufferView']]
    for image in document.get('images', []):
        if 'bufferView' in image:
            image['bufferView'] = remap[image['bufferView']]
    document['bufferViews'] = new_views
    payload = b''.join(blobs)
    document['buffers'] = [{'byteLength': len(payload)}]
    for key in ('extensionsUsed', 'extensionsRequired'):
        names = document.setdefault(key, [])
        if 'KHR_draco_mesh_compression' not in names:
            names.append('KHR_draco_mesh_compression')
    write_glb(path, document, payload)
    return True


def check_glb(path, wanted_nodes, children):
    """What the written file holds: nodes, parents, triangles, extras, material modes."""
    document, _ = read_glb(path)
    nodes = document.get('nodes', [])
    names = [n.get('name') for n in nodes]
    parent = {}
    for node in nodes:
        for child in node.get('children', []):
            parent[names[child]] = node.get('name')
    triangles = 0
    for mesh in document.get('meshes', []):
        for primitive in mesh['primitives']:
            triangles += document['accessors'][primitive['indices']]['count'] // 3
    views = document['bufferViews']
    return {
        'missing_nodes': [n for n in wanted_nodes if n not in names],
        'parents_ok': all(parent.get(c) == p for c, p in children.items()),
        'file_triangles': triangles,
        'draco': 'KHR_draco_mesh_compression' in document.get('extensionsUsed', []),
        'image_bytes': {i.get('name'): views[i['bufferView']]['byteLength'] for i in document.get('images', [])},
        'blend_materials': sorted(m['name'] for m in document.get('materials', []) if m.get('alphaMode') == 'BLEND'),
        'material_names': sorted(m['name'] for m in document.get('materials', [])),
        'scene_extras': {k: v for k, v in (document.get('scenes', [{}])[0].get('extras') or {}).items() if k in ('eye', 'fov', 'gaze', 'asset')},
        'bytes': os.path.getsize(path),
    }
