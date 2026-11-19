"""The cockpit kit: what the cockpit scripts (garza_cockpit.py, gaviota_cockpit.py) model with.

  Soup      a mesh under construction (lathes, tubes, boxes, lofts) with a material index per face
  Decals    flat faces that show a rectangle of the kit's painted sheet (placards, baked dial faces)
  Sheet     that sheet: legends, dial faces and lamp tiles drawn with PIL at build time
  Plane     a panel's own right / up / normal frame, to place dressing on it
  Kit       the registry: soups per node and texel tier, tiny parts that share one atlas texel,
            unbaked nodes (glass, live faces), empties; finish() unwraps with a texel density per
            tier, bakes (lib/atlasbake), parents the hands, exports, quantises and verifies the .glb
  hand()    Dez's gloved hand with its sleeve, in its own frame (wrist at the origin, fingers to +Y,
            the back of the hand to +Z, a right hand's thumb to -X)
  render_eye()  a picture from the pilot's eye (the composition check)

Blender axes: nose +Y, right wing +X, up +Z, metres. Environment switches (never needed by a build):
  MARAZUL_COCKPIT_SHOT=/path.jpg    render the views from the eye into one 640 px wide sheet
  MARAZUL_COCKPIT_VIEWS="0,0;-55,-25"   yaw (right positive), pitch in degrees per view
"""
import json
import math
import os
import struct
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector
from PIL import Image, ImageDraw, ImageFont

from lib import atlasbake
from lib import meshkit as mk
from lib import surfaces as sf

UNBAKED = ('canopy_glass', 'hud_glass', 'screen_live')


# --- geometry ----------------------------------------------------------------------------------

def frame_of(axis, ref=None):
    """(a, u, v): the unit axis and two unit vectors across it, u nearest to ref; u x v = a."""
    a = Vector(axis).normalized()
    r = Vector(ref) if ref is not None else (Vector((0, 0, 1)) if abs(a.z) < 0.9 else Vector((1, 0, 0)))
    u = r - a * r.dot(a)
    if u.length < 1e-6:
        u = Vector((1, 0, 0)) - a * a.x
    u.normalize()
    return a, u, a.cross(u)


def fillet(path, size=0.012, steps=3):
    """Rounds the corners of a polyline (quadratic curves of the given size at each inner point)."""
    pts = [Vector(p) for p in path]
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, c, b = pts[i - 1], pts[i], pts[i + 1]
        f = min(size, 0.45 * (c - a).length, 0.45 * (b - c).length)
        p0, p1 = c + (a - c).normalized() * f, c + (b - c).normalized() * f
        for k in range(steps + 1):
            t = k / steps
            out.append(p0 * (1 - t) ** 2 + c * 2 * t * (1 - t) + p1 * t ** 2)
    out.append(pts[-1])
    return out


def resample(path, radii, step):
    """Splits a polyline's spans so no span is longer than step; radii are interpolated."""
    pts, rs = [Vector(path[0])], [radii[0]]
    for i in range(1, len(path)):
        a, b = Vector(path[i - 1]), Vector(path[i])
        n = max(1, int(math.ceil((b - a).length / step)))
        for k in range(1, n + 1):
            t = k / n
            pts.append(a.lerp(b, t))
            rs.append(radii[i - 1] + (radii[i] - radii[i - 1]) * t)
    return pts, rs


class Soup:
    """Points and faces with a material index per face; to_object() makes the mesh."""

    def __init__(self):
        self.v, self.f, self.m = [], [], []

    def add(self, verts, faces, mat=0):
        base = len(self.v)
        self.v += [tuple(p) for p in verts]
        for k, face in enumerate(faces):
            self.f.append(tuple(base + i for i in face))
            self.m.append(mat[k] if isinstance(mat, (list, tuple)) else mat)
        return self

    def quad(self, pts, mat=0):
        return self.add(pts, [tuple(range(len(pts)))], mat)

    def lathe(self, c, axis, profile, seg=8, mat=0, ref=None, squash=(1.0, 1.0), turn=0.0):
        """Turns a profile of (radius, height along the axis) about the axis through c.

        A profile that climbs the axis faces outwards; radius 0 closes on a single point.
        """
        a, u, v = frame_of(axis, ref)
        c = Vector(c)
        verts, rows = [], []
        for r, h in profile:
            if r <= 1e-6:
                rows.append([len(verts)])
                verts.append(c + a * h)
                continue
            row = []
            for i in range(seg):
                t = 2 * math.pi * (i + turn) / seg
                row.append(len(verts))
                verts.append(c + a * h + (u * (math.cos(t) * squash[0]) + v * (math.sin(t) * squash[1])) * r)
            rows.append(row)
        faces = []
        for k in range(len(rows) - 1):
            lo, hi = rows[k], rows[k + 1]
            for i in range(seg):
                j = (i + 1) % seg
                if len(lo) == 1 and len(hi) == 1:
                    continue
                if len(lo) == 1:
                    faces.append((lo[0], hi[j], hi[i]))
                elif len(hi) == 1:
                    faces.append((lo[i], lo[j], hi[0]))
                else:
                    faces.append((lo[i], lo[j], hi[j], hi[i]))
        return self.add(verts, faces, mat)

    def loft(self, rings, mat=0, closed=True, cap_start=False, cap_end=False):
        """Skins rings of equal length (counter-clockwise about the direction of travel).

        mat may be a function (ring index, point index) -> material index.
        """
        n = len(rings[0])
        verts = [p for ring in rings for p in ring]
        faces, mats = [], []
        for k in range(len(rings) - 1):
            for i in range(n if closed else n - 1):
                j = (i + 1) % n
                faces.append((k * n + i, k * n + j, (k + 1) * n + j, (k + 1) * n + i))
                mats.append(mat(k, i) if callable(mat) else mat)
        if cap_start:
            faces.append(tuple(range(n - 1, -1, -1)))
            mats.append(mat(0, 0) if callable(mat) else mat)
        if cap_end:
            base = (len(rings) - 1) * n
            faces.append(tuple(base + i for i in range(n)))
            mats.append(mat(len(rings) - 2, 0) if callable(mat) else mat)
        return self.add(verts, faces, mats)

    def tube(self, path, radius, seg=6, mat=0, caps=(False, True), squash=(1.0, 1.0), ref=None, dome=False):
        """A round tube along a path; radius a number or one per point. dome rounds the far end."""
        pts = [Vector(p) for p in path]
        radii = list(radius) if isinstance(radius, (list, tuple)) else [radius] * len(pts)
        rings, normal = [], None
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            if normal is None:
                normal = frame_of(t, ref)[1]
            else:
                normal = normal - t * normal.dot(t)
                normal = frame_of(t)[1] if normal.length < 1e-6 else normal.normalized()
            b = t.cross(normal)
            rings.append([p + (normal * (math.cos(2 * math.pi * k / seg) * squash[0]) + b * (math.sin(2 * math.pi * k / seg) * squash[1])) * radii[i]
                          for k in range(seg)])
            last = (p, t, normal, b, radii[i])
        if dome:
            p, t, normal, b, r = last
            for ang in (35, 65):
                c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
                rings.append([p + t * (r * s) + (normal * (math.cos(2 * math.pi * k / seg) * squash[0]) + b * (math.sin(2 * math.pi * k / seg) * squash[1])) * (r * c)
                              for k in range(seg)])
        return self.loft(rings, mat, True, caps[0], caps[1])

    def strip(self, path, width, thick, up, mat=0, caps=(True, True)):
        """A flat strap or bar of rectangular section along a path; up is the side its face looks to."""
        pts = [Vector(p) for p in path]
        rings = []
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            n = Vector(up[i] if isinstance(up, list) else up)
            n = (n - t * n.dot(t)).normalized()
            b = t.cross(n)
            rings.append([p + n * (thick * sn) + b * (0.5 * width * sb) for sn, sb in ((1, 1), (0, 1), (0, -1), (1, -1))])
        return self.loft(rings, mat, True, caps[0], caps[1])

    def box(self, c, size, mat=0, axes=None):
        """A box of full size centred on c; axes are its three unit directions (default: the world's)."""
        ax = [Vector(a) for a in (axes or ((1, 0, 0), (0, 1, 0), (0, 0, 1)))]
        c = Vector(c)
        verts = [c + ax[0] * (0.5 * size[0] * sx) + ax[1] * (0.5 * size[1] * sy) + ax[2] * (0.5 * size[2] * sz)
                 for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
        faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
        if ax[0].cross(ax[1]).dot(ax[2]) < 0:
            faces = [tuple(reversed(f)) for f in faces]
        return self.add(verts, faces, mat)

    def grid(self, rows, toward, mat=0):
        """A sheet through rows of points, turned to face the point `toward`."""
        rows = [[Vector(p) for p in row] for row in rows]
        normal = (rows[0][1] - rows[0][0]).cross(rows[1][0] - rows[0][0])
        if normal.dot(Vector(toward) - rows[0][0]) < 0:
            rows = rows[::-1]
        return self.loft(rows, mat, closed=False)

    def polygon(self, pts, toward, mat=0):
        """One flat many-cornered face, turned to face the point `toward`."""
        pts = [Vector(p) for p in pts]
        normal = Vector()
        for a, b in zip(pts, pts[1:] + pts[:1]):
            normal += a.cross(b)
        centre = sum(pts, Vector()) / len(pts)
        if normal.dot(Vector(toward) - centre) < 0:
            pts = pts[::-1]
        return self.quad(pts, mat)

    def transform(self, matrix):
        self.v = [tuple(matrix @ Vector(p)) for p in self.v]
        return self

    def mirror_x(self):
        self.v = [(-p[0], p[1], p[2]) for p in self.v]
        self.f = [tuple(reversed(f)) for f in self.f]
        return self

    def extend(self, other):
        return self.add(other.v, other.f, list(other.m))

    def to_object(self, name, materials, smooth=40.0):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.v, [], self.f)
        for material in materials:
            mesh.materials.append(material)
        mesh.polygons.foreach_set('material_index', self.m)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        if smooth:
            mk.shade(obj, smooth)
        return obj


class Decals:
    """Flat faces mapped onto rectangles of the painted sheet (UV layer 'decal')."""

    def __init__(self):
        self.v, self.f, self.uv = [], [], []

    def quad(self, corners, rect):
        """corners: bottom-left, bottom-right, top-right, top-left as read; rect: (u0, v0, u1, v1)."""
        base = len(self.v)
        self.v += [tuple(c) for c in corners]
        self.f.append((base, base + 1, base + 2, base + 3))
        u0, v0, u1, v1 = rect
        self.uv += [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]

    def on(self, plane, u, v, w, h, rect, lift=0.0006, turn=0.0):
        c, s = math.cos(math.radians(turn)), math.sin(math.radians(turn))
        pts = []
        for du, dv in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
            x, y = du * w, dv * h
            pts.append(plane.pt(u + x * c - y * s, v + x * s + y * c, lift))
        self.quad(pts, rect)

    def to_object(self, name, material):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.v, [], self.f)
        mesh.materials.append(material)
        layer = mesh.uv_layers.new(name='decal')
        flat = [c for face in self.f for i in face for c in self.uv[i]]
        layer.data.foreach_set('uv', flat)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


class Plane:
    """A flat panel: pt(u, v, lift) is u along its right, v along its up, lift along its normal."""

    def __init__(self, origin, right, up):
        self.o = Vector(origin)
        self.r = Vector(right).normalized()
        self.n = self.r.cross(Vector(up)).normalized()
        self.u = self.n.cross(self.r)

    def pt(self, u, v, lift=0.0):
        return self.o + self.r * u + self.u * v + self.n * lift

    def lifted(self, lift):
        return Plane(self.o + self.n * lift, self.r, self.u)

    def axes(self):
        return (self.r, self.u, self.n)


# --- the painted sheet ---------------------------------------------------------------------------

class Sheet:
    """Legends, dial faces and lamp tiles drawn into one image; every draw returns its UV rectangle."""
    WHITE, BLACK, AMBER, RED, GREEN, YELLOW = (214, 212, 200), (17, 17, 18), (214, 138, 30), (176, 38, 28), (60, 150, 70), (204, 170, 36)

    def __init__(self, size=2048, ppm=3000.0):
        self.size, self.ppm = size, ppm
        self.image = Image.new('RGB', (size, size), (24, 24, 25))
        self.x, self.y, self.row = 3, 3, 0
        self.material = None
        self.node = None

    def font(self, px):
        px = max(6, int(px))
        try:
            return ImageFont.load_default(size=px)
        except TypeError:
            return ImageFont.load_default()

    def _take(self, w, h):
        w, h = int(w) + 6, int(h) + 6
        if self.x + w > self.size:
            self.x, self.y, self.row = 3, self.y + self.row, 0
        if self.y + h > self.size:
            raise RuntimeError('the decal sheet is full')
        box = (self.x + 3, self.y + 3, self.x + w - 3, self.y + h - 3)
        self.x += w
        self.row = max(self.row, h)
        return box

    def _rect(self, box):
        s = float(self.size)
        return ((box[0] + 0.5) / s, 1.0 - (box[3] - 0.5) / s, (box[2] - 0.5) / s, 1.0 - (box[1] + 0.5) / s)

    def _paste(self, tile, box):
        self.image.paste(tile.resize((box[2] - box[0], box[3] - box[1]), Image.LANCZOS), box[:2])
        # Bleed the tile's edge outwards so the atlas filter never picks up the neighbour.
        return self._rect(box)

    def placard(self, text, w, h, ink=None, ground=None, border=True, scale=1.0):
        """An engraved legend plate w x h metres; text may hold '\\n'."""
        ink, ground = ink or self.WHITE, ground or self.BLACK
        box = self._take(w * self.ppm, h * self.ppm)
        W, H = (box[2] - box[0]) * 3, (box[3] - box[1]) * 3
        tile = Image.new('RGB', (W, H), ground)
        draw = ImageDraw.Draw(tile)
        if border:
            draw.rectangle((3, 3, W - 4, H - 4), outline=ink, width=3)
        lines = text.split('\n')
        px = min(H * 0.72 / len(lines), W * 1.55 / max(len(l) for l in lines)) * scale
        font = self.font(px)
        total = len(lines) * px * 1.08
        for i, line in enumerate(lines):
            bounds = draw.textbbox((0, 0), line, font=font)
            draw.text(((W - (bounds[2] - bounds[0])) / 2 - bounds[0], (H - total) / 2 + i * px * 1.08 + (px - (bounds[3] - bounds[1])) / 2 - bounds[1]),
                      line, fill=ink, font=font)
        return self._paste(tile, box)

    def tile(self, text, colour, w=0.03, h=0.018):
        """A caution-lamp tile: a dull coloured lens with a dark caption."""
        dull = tuple(int(c * 0.62) for c in colour)
        return self.placard(text, w, h, ink=(22, 18, 14), ground=dull, border=False, scale=0.9)

    def stripes(self, w, h, a=None, b=None):
        """Diagonal warning stripes."""
        a, b = a or self.YELLOW, b or self.BLACK
        box = self._take(w * self.ppm, h * self.ppm)
        W, H = (box[2] - box[0]) * 3, (box[3] - box[1]) * 3
        tile = Image.new('RGB', (W, H), a)
        draw = ImageDraw.Draw(tile)
        step = max(8, H // 2)
        for x in range(-H, W + H, step * 2):
            draw.polygon([(x, H), (x + step, H), (x + step + H, 0), (x + H, 0)], fill=b)
        return self._paste(tile, box)

    def dial(self, diameter, label, numbers, needle=0.3, sweep=270.0, minor=4, band=None, second=None):
        """A baked instrument face: scale, numerals, legend and needle(s). needle: 0..1 along the sweep."""
        box = self._take(diameter * self.ppm, diameter * self.ppm)
        S = (box[2] - box[0]) * 3
        tile = Image.new('RGB', (S, S), (14, 14, 15))
        draw = ImageDraw.Draw(tile)
        c, R = S / 2.0, S / 2.0

        def at(frac, radius):
            a = math.radians(90 + sweep / 2 - frac * sweep)
            return (c + math.cos(a) * radius * R, c - math.sin(a) * radius * R)

        if band:
            for lo, hi, colour in band:
                for k in range(40):
                    f0, f1 = lo + (hi - lo) * k / 40, lo + (hi - lo) * (k + 1) / 40
                    draw.polygon([at(f0, 0.9), at(f1, 0.9), at(f1, 0.82), at(f0, 0.82)], fill=colour)
        count = len(numbers) - 1
        font = self.font(S * 0.13)
        for k in range(count * minor + 1):
            f = k / (count * minor)
            major = k % minor == 0
            draw.line([at(f, 0.92), at(f, 0.76 if major else 0.84)], fill=self.WHITE, width=max(2, S // (60 if major else 110)))
            if major and numbers[k // minor] != '':
                text = str(numbers[k // minor])
                p = at(f, 0.6)
                bounds = draw.textbbox((0, 0), text, font=font)
                draw.text((p[0] - (bounds[2] + bounds[0]) / 2, p[1] - (bounds[3] + bounds[1]) / 2), text, fill=self.WHITE, font=font)
        small = self.font(S * 0.095)
        for i, line in enumerate(label.split('\n')):
            bounds = draw.textbbox((0, 0), line, font=small)
            draw.text((c - (bounds[2] + bounds[0]) / 2, c + R * (0.3 + 0.2 * i) - (bounds[3] + bounds[1]) / 2), line, fill=(170, 170, 160), font=small)
        for frac, length, colour in ((needle, 0.78, (226, 224, 214)),) + (((second, 0.5, (226, 224, 214)),) if second is not None else ()):
            tip, tail = at(frac, length), at(frac + 0.5 * 360.0 / sweep, 0.16)
            draw.line([tail, tip], fill=colour, width=max(3, S // 40))
        draw.ellipse((c - R * 0.09, c - R * 0.09, c + R * 0.09, c + R * 0.09), fill=(40, 40, 42))
        return self._paste(tile, box)

    def window(self, text, w, h):
        """A counter window: light digits on black inside a frame (radio channels, a clock)."""
        return self.placard(text, w, h, ink=(232, 226, 196), ground=(8, 8, 8), border=True, scale=1.0)

    def make_material(self):
        mat, tree, shader = sf._principled('legend_sheet')
        node = tree.nodes.new('ShaderNodeTexImage')
        uv = tree.nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'decal'
        tree.links.new(uv.outputs['UV'], node.inputs['Vector'])
        tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
        shader.inputs['Roughness'].default_value = 0.5
        self.material, self.node = mat, node
        return mat

    def save(self, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.image.save(path)
        self.node.image = bpy.data.images.load(path, check_existing=False)
        return path


# --- materials -----------------------------------------------------------------------------------

def _math(tree, operation, a, b=None):
    node = tree.nodes.new('ShaderNodeMath')
    node.operation = operation
    node.use_clamp = True
    for socket, value in ((node.inputs[0], a), (node.inputs[1], b)):
        if value is None:
            continue
        if isinstance(value, bpy.types.NodeSocket):
            tree.links.new(value, socket)
        else:
            socket.default_value = value
    return node.outputs[0]


def _blend(tree, factor, a, b):
    node = tree.nodes.new('ShaderNodeMix')
    node.data_type = 'FLOAT'
    for socket, value in ((node.inputs[0], factor), (node.inputs[2], a), (node.inputs[3], b)):
        if isinstance(value, bpy.types.NodeSocket):
            tree.links.new(value, socket)
        else:
            socket.default_value = value
    return node.outputs[0]


def _scaled(color, k):
    return tuple(min(1.0, c * k) for c in color[:3]) + (1.0,)


def coat(name, color, rough=0.6, wear=0.4, dust=0.25, chips=0.15, metal=True, under='#a3a59c', vary=0.16, bump=0.1,
         grime=0.55, wrinkle=0.0, scuff=0.3, radius=0.003):
    """A coated surface with a life behind it, all of it baked: mottled colour, grime in the creases
    (an occlusion probe), paint rubbed off the edges (a bevel probe) and chipped in specks, lighter
    scuff streaks, dust settled on what faces up, rounded edges in the normal map. metal False is
    cloth or leather: the wear only fades it. Albedos are meant around 0.10-0.22."""
    mat, tree, shader = sf._principled(name)
    base = sf.hex_color(color)
    links = tree.links
    geo = tree.nodes.new('ShaderNodeNewGeometry')
    bevel = tree.nodes.new('ShaderNodeBevel')
    bevel.samples = 4
    bevel.inputs['Radius'].default_value = radius
    dot = tree.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    links.new(bevel.outputs['Normal'], dot.inputs[0])
    links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = sf._ramp(tree, dot.outputs['Value'], 0.99, 0.82)
    rub = _math(tree, 'MULTIPLY', _math(tree, 'MULTIPLY', edge, sf._ramp(tree, sf._noise(tree, 48.0, 3.0), 0.36, 0.6)), min(1.0, wear * 2.2))
    if chips > 0:
        # Chips: sparse specks, denser and larger near the worn edges.
        low = 0.8 - 0.08 * chips
        speck = sf._ramp(tree, sf._noise(tree, 70.0, 3.0, 0.6), low, low + 0.02)
        near = sf._ramp(tree, _math(tree, 'ADD', _math(tree, 'MULTIPLY', edge, 0.8), sf._noise(tree, 9.0, 3.0)), 0.52, 0.62)
        rub = _math(tree, 'MAXIMUM', rub, _math(tree, 'MULTIPLY', speck, near))
    probe = tree.nodes.new('ShaderNodeAmbientOcclusion')
    probe.samples = 4
    probe.inputs['Distance'].default_value = 0.05
    dirt = _math(tree, 'MULTIPLY', sf._ramp(tree, probe.outputs['AO'], 0.92, 0.3), grime)
    split = tree.nodes.new('ShaderNodeSeparateXYZ')
    links.new(geo.outputs['Normal'], split.inputs[0])
    settle = _math(tree, 'MULTIPLY', _math(tree, 'MULTIPLY', sf._ramp(tree, split.outputs['Z'], 0.35, 0.95), sf._ramp(tree, sf._noise(tree, 6.0, 4.0), 0.3, 0.75)), dust)
    colour = sf._mix(tree, sf._ramp(tree, sf._noise(tree, 2.6, 4.0), 0.3, 0.7), base, _scaled(base, 1.0 - vary))
    if scuff > 0:
        streak = _math(tree, 'MULTIPLY', sf._ramp(tree, sf._noise(tree, 26.0, 2.0, 0.6, (1.0, 0.07, 1.0)), 0.6, 0.78), scuff)
        colour = sf._mix(tree, streak, colour, _scaled(base, 1.55))
    colour = sf._mix(tree, dirt, colour, _scaled(base, 0.3))
    colour = sf._mix(tree, rub, colour, sf.hex_color(under) if metal else _scaled(base, 1.5))
    colour = sf._mix(tree, settle, colour, sf.hex_color('#8d8674'))
    links.new(colour, shader.inputs['Base Color'])
    spread = tree.nodes.new('ShaderNodeMapRange')
    spread.inputs['To Min'].default_value = max(0.05, rough - 0.07)
    spread.inputs['To Max'].default_value = min(1.0, rough + 0.07)
    links.new(sf._ramp(tree, sf._noise(tree, 5.0, 3.0), 0.3, 0.7), spread.inputs['Value'])
    gloss = spread.outputs['Result']
    if metal:
        gloss = _blend(tree, rub, gloss, 0.38)
        links.new(_math(tree, 'MULTIPLY', rub, 0.85), shader.inputs['Metallic'])
    gloss = _blend(tree, settle, gloss, 0.9)
    links.new(gloss, shader.inputs['Roughness'])
    normal = bevel.outputs['Normal']
    for strength, distance, scale in ((bump, 0.0015, 240.0), (wrinkle, 0.006, 22.0)):
        if strength > 0:
            node = tree.nodes.new('ShaderNodeBump')
            node.inputs['Strength'].default_value = strength
            node.inputs['Distance'].default_value = distance
            links.new(sf._noise(tree, scale, 2.0), node.inputs['Height'])
            links.new(normal, node.inputs['Normal'])
            normal = node.outputs['Normal']
    links.new(normal, shader.inputs['Normal'])
    return mat


def striped(name, a='#c9a416', b='#141414', period=0.024):
    """Diagonal warning stripes in object space (the ejection handle)."""
    mat, tree, shader = sf._principled(name)
    coords = tree.nodes.new('ShaderNodeTexCoord')
    split = tree.nodes.new('ShaderNodeSeparateXYZ')
    tree.links.new(coords.outputs['Object'], split.inputs[0])
    total = tree.nodes.new('ShaderNodeMath')
    total.operation = 'ADD'
    tree.links.new(split.outputs['X'], total.inputs[0])
    tree.links.new(split.outputs['Z'], total.inputs[1])
    scale = tree.nodes.new('ShaderNodeMath')
    scale.operation = 'MULTIPLY'
    tree.links.new(total.outputs[0], scale.inputs[0])
    scale.inputs[1].default_value = 1.0 / period
    fract = tree.nodes.new('ShaderNodeMath')
    fract.operation = 'FRACT'
    tree.links.new(scale.outputs[0], fract.inputs[0])
    step = tree.nodes.new('ShaderNodeMath')
    step.operation = 'GREATER_THAN'
    tree.links.new(fract.outputs[0], step.inputs[0])
    step.inputs[1].default_value = 0.5
    grime = sf._ramp(tree, sf._noise(tree, 30.0, 3.0), 0.3, 0.8)
    colour = sf._mix(tree, step.outputs[0], sf.hex_color(a), sf.hex_color(b))
    colour = sf._mix(tree, _math(tree, 'MULTIPLY', grime, 0.3), colour, sf.hex_color('#4a4030'))
    tree.links.new(colour, shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = 0.55
    return mat


def see_through(name, tint, alpha, roughness=0.05):
    """Glass the game blends (canopy_glass, hud_glass): not baked, drawn from both sides."""
    mat, tree, shader = sf._principled(name)
    shader.inputs['Base Color'].default_value = sf.hex_color(tint)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Alpha'].default_value = alpha
    mat['alpha'] = alpha
    mat.use_backface_culling = False
    for key, value in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
        try:
            setattr(mat, key, value)
        except (AttributeError, TypeError):
            pass
    return mat


def live_screen(name='screen_live'):
    """A face the game paints live: dark glass with a faint glow until then."""
    mat, tree, shader = sf._principled(name)
    shader.inputs['Base Color'].default_value = sf.hex_color('#0b0e0d')
    shader.inputs['Roughness'].default_value = 0.3
    shader.inputs['Emission Color'].default_value = sf.hex_color('#1a211d')
    shader.inputs['Emission Strength'].default_value = 1.0
    return mat


# --- the registry and the pipeline ----------------------------------------------------------------

class Kit:
    """Everything a cockpit is made of, by node; finish() turns it into the .glb."""

    def __init__(self, asset_id, atlas=2048):
        self.id, self.atlas = asset_id, atlas
        self.sheet = Sheet()
        self.legend = self.sheet.make_material()
        self.soups = []          # (soup, node, tier, materials, smooth)
        self.tiny = {}           # (node, material name) -> (soup, material)
        self.decal_sets = {}     # (node, tier) -> Decals
        self.loose = []          # unbaked node objects (glass, live faces)
        self.empties = []
        self.extras = {}
        self.pivots = {}         # node -> origin
        self.parents = {}        # node -> parent node
        self.probes = {}         # name -> point, for the report's screen positions
        self.objects = None

    def soup(self, materials, node='cockpit_shell', tier=1.0, smooth=40.0):
        s = Soup()
        self.soups.append((s, node, tier, list(materials) if isinstance(materials, (list, tuple)) else [materials], smooth))
        return s

    def bits(self, material, node='cockpit_shell'):
        """The soup of tiny parts in one material: they all share a single atlas texel."""
        key = (node, material.name)
        if key not in self.tiny:
            self.tiny[key] = (Soup(), material)
        return self.tiny[key][0]

    def decals(self, node='cockpit_shell', tier=6.0):
        return self.decal_sets.setdefault((node, tier), Decals())

    def node(self, obj):
        self.loose.append(obj)
        return obj

    def empty(self, name, location):
        self.empties.append(mk.empty(name, location))

    def seal(self, work_dir):
        """Turns the soups into objects (the source scene). Returns {node: [objects]} of baked parts."""
        self.sheet.save(os.path.join(work_dir, 'legend_sheet.png'))
        parts, small = {}, {}
        for index, (s, node, tier, materials, smooth) in enumerate(self.soups):
            if not s.f:
                continue
            obj = s.to_object('%s_part%d' % (node, index), materials, smooth)
            _tag(obj, tier)
            parts.setdefault(node, []).append(obj)
        for (node, tier), d in self.decal_sets.items():
            if d.f:
                obj = d.to_object('%s_legends%d' % (node, int(tier * 10)), self.legend)
                _tag(obj, tier)
                parts.setdefault(node, []).append(obj)
        swatch, names = Soup(), []
        for index, ((node, name), (s, material)) in enumerate(self.tiny.items()):
            if not s.f:
                continue
            small.setdefault(node, []).append((s.to_object('%s_bits%d' % (node, index), [material], 80.0), name))
            if name not in names:
                names.append(name)
        materials = [next(m for (n, k), (s, m) in self.tiny.items() if k == name) for name in names]
        self.objects = {'parts': parts, 'small': small, 'swatch': None, 'swatch_names': names}
        if names:
            # One small quad per tiny material, far from everything: the texel its parts all read.
            s2 = Soup()
            for i in range(len(names)):
                x = 40.0 + 0.2 * i
                s2.quad([(x - 0.012, -0.012, 40.0), (x + 0.012, -0.012, 40.0), (x + 0.012, 0.012, 40.0), (x - 0.012, 0.012, 40.0)], i)
            obj = s2.to_object('swatches', materials, None)
            _tag(obj, 1.0)
            self.objects['swatch'] = obj
        return self.objects

    # --- finish: what build_aircraft.py calls through the asset ---------------------------------

    def finish(self, out_path, work_dir, bake=True):
        import time
        started = time.time()
        objects = self.objects
        mains = {node: mk.join(node + '_main', objs) for node, objs in objects['parts'].items()}
        baked = list(mains.values()) + ([objects['swatch']] if objects['swatch'] else [])
        unwrap(baked)
        paths = {key: os.path.join(work_dir, key + '.png') for key in ('base', 'orm', 'normal')}
        if os.environ.get('MARAZUL_COCKPIT_DRY') and all(os.path.exists(p) for p in paths.values()):
            pass        # a dry run measures the geometry with the textures of the last bake
        else:
            paths = atlasbake.bake(baked, self.atlas, work_dir, occlusion_samples=int(os.environ.get('MARAZUL_COCKPIT_AO', '16')),
                                   occlusion_in_color=0.0, occlusion_distance=0.3)
            _soften(paths, 0.5, self.atlas // 2)
        # Where each tiny material landed in the atlas (before the slots are merged).
        centres = {}
        if objects['swatch']:
            mesh = objects['swatch'].data
            layer = mesh.uv_layers['atlas'].data
            for poly in mesh.polygons:
                uvs = [layer[i].uv for i in poly.loop_indices]
                centres[objects['swatch_names'][poly.material_index]] = (sum(u[0] for u in uvs) / len(uvs), sum(u[1] for u in uvs) / len(uvs))
        made = atlasbake.swap_materials(baked, paths)
        atlas = made['atlas']
        final = {}
        for node, main in mains.items():
            for layer in [l for l in main.data.uv_layers if l.name != 'atlas']:
                main.data.uv_layers.remove(layer)
            group = [main]
            for obj, name in objects['small'].get(node, []):
                layer = obj.data.uv_layers.new(name='atlas')
                layer.data.foreach_set('uv', list(centres[name]) * len(layer.data))
                mk.assign(obj, atlas)
                group.append(obj)
            out = mk.join(node, group)
            for attribute in [a for a in out.data.attributes if a.name == 'tier']:
                out.data.attributes.remove(attribute)
            final[node] = out
        for node, point in self.pivots.items():
            mk.set_origin(final[node], point)
        bpy.context.view_layer.update()
        for node, parent in self.parents.items():
            final[node].parent = final[parent]
            final[node].matrix_parent_inverse = final[parent].matrix_world.inverted()
        bpy.context.view_layer.update()
        everything = list(final.values()) + self.loose
        report = self._report(everything)
        scene = bpy.context.scene
        for key, value in {'asset': self.id, 'kind': 'vehicle', 'lods': 1, 'lod_distances': [], 'bounds': report['bounds'], **self.extras}.items():
            scene[key] = value
        bpy.ops.object.select_all(action='DESELECT')
        for obj in everything + self.empties:
            obj.hide_render = False
            obj.select_set(True)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=True, export_image_format='WEBP',
                                  export_image_quality=75, export_extras=True, export_yup=True,
                                  export_apply=True, export_animations=False, export_tangents=False, export_cameras=False, export_lights=False)
        quality = [int(v) for v in os.environ.get('MARAZUL_COCKPIT_WEBP', '72,56,68').split(',')]
        report['file'] = pack_glb(out_path, textures={key: (paths[key], q) for key, q in zip(('base', 'orm', 'normal'), quality)})
        report['bytes'] = os.path.getsize(out_path)
        report['contract'] = check_glb(out_path, self.required)
        report['bake_seconds'] = round(time.time() - started, 1)
        shot = os.environ.get('MARAZUL_COCKPIT_SHOT')
        if shot:
            if objects['swatch']:
                objects['swatch'].hide_render = True
            report['shot'] = render_eye(shot, self.extras['eye'], self.extras['fov'], _views())
        return report

    required = ()

    def _report(self, objs):
        scene = bpy.context.scene
        depsgraph = bpy.context.evaluated_depsgraph_get()
        eye = Vector(self.extras['eye'])
        fov = self.extras['fov']
        lo, hi = [1e9] * 3, [-1e9] * 3
        triangles = {}
        for obj in objs:
            triangles[obj.name] = mk.triangle_count(obj)
            for corner in obj.bound_box:
                p = obj.matrix_world @ Vector(corner)
                for i in range(3):
                    lo[i], hi[i] = min(lo[i], p[i]), max(hi[i], p[i])
        seen, uv_ok = {}, {}
        for obj in objs:
            if not obj.name.startswith(('gauge_', 'display_')):
                continue
            centre = obj.matrix_world @ (sum((Vector(c) for c in obj.bound_box), Vector()) / 8.0)
            reach = (centre - eye).length
            hit, where, normal, index, what, matrix = scene.ray_cast(depsgraph, eye, (centre - eye).normalized(), distance=reach + 0.01)
            seen[obj.name] = bool(hit and (what.name == obj.name or (where - eye).length > reach - 0.0015))
            if not seen[obj.name]:
                seen[obj.name] = 'blocked by %s at %.3f of %.3f m' % (what.name if hit else '?', (where - eye).length if hit else 0, reach)
            uvs = np.empty(len(obj.data.loops) * 2, dtype=np.float32)
            obj.data.uv_layers[0].data.foreach_get('uv', uvs)
            uvs = uvs.reshape(-1, 2)
            uv_ok[obj.name] = bool(abs(uvs.min()) < 1e-4 and abs(uvs.max() - 1.0) < 1e-4)
        small = {k: v for k, v in triangles.items() if not k.startswith('gauge_')}
        return {
            'id': self.id, 'triangles': sum(triangles.values()), 'triangles_by_node': small,
            'bounds': [round(v, 3) for v in (lo[0], lo[2], -hi[1], hi[0], hi[2], -lo[1])],
            'eye': list(self.extras['eye']), 'fov': fov, 'gaze': self.extras.get('gaze', 0.0),
            'screen': {name: on_screen(eye, fov, p) for name, p in self.probes.items()},
            'gauges_seen': seen if not all(v is True for v in seen.values()) else 'all %d' % len(seen),
            'gauge_uvs_0_1': uv_ok if not all(uv_ok.values()) else 'all %d' % len(uv_ok),
        }


def _tag(obj, tier):
    attribute = obj.data.attributes.new('tier', 'FLOAT', 'FACE')
    attribute.data.foreach_set('value', [tier] * len(obj.data.polygons))


def on_screen(eye, fov, point, aspect=1.6):
    """Where a point lands looking straight ahead from the eye: [share from the left, share from the bottom]."""
    d = Vector(point) - Vector(eye)
    t = math.tan(math.radians(fov) / 2)
    return [round(0.5 + d.x / d.y / (2 * t * aspect), 3), round(0.5 + d.z / d.y / (2 * t), 3)]


def unwrap(objs, margin=0.0022):
    """One atlas layout: projected islands, each scaled by its faces' tier (texel density), packed."""
    for obj in objs:
        layers = obj.data.uv_layers
        for layer in [l for l in layers if l.name != 'decal']:
            layers.remove(layer)
        if 'decal' not in layers:
            layers.new(name='decal')
        atlas = layers.new(name='atlas')
        layers.active = atlas
        atlas.active_render = True
    mk._activate(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj in objs:
        mesh = obj.data
        tiers = np.empty(len(mesh.polygons), dtype=np.float32)
        mesh.attributes['tier'].data.foreach_get('value', tiers)
        totals = np.empty(len(mesh.polygons), dtype=np.int32)
        mesh.polygons.foreach_get('loop_total', totals)
        starts = np.empty(len(mesh.polygons), dtype=np.int32)
        mesh.polygons.foreach_get('loop_start', starts)
        per_loop = np.ones(len(mesh.loops), dtype=np.float32)
        for start, total, tier in zip(starts, totals, tiers):
            per_loop[start:start + total] = max(tier, 0.05)
        uvs = np.empty(len(mesh.loops) * 2, dtype=np.float32)
        mesh.uv_layers['atlas'].data.foreach_get('uv', uvs)
        uvs = uvs.reshape(-1, 2) * per_loop[:, None]
        mesh.uv_layers['atlas'].data.foreach_set('uv', uvs.reshape(-1))
        mesh.update()
    mk._activate(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    try:
        bpy.ops.uv.pack_islands(margin=margin, rotate=True, shape_method=os.environ.get('MARAZUL_COCKPIT_PACK', 'CONCAVE'))
    except TypeError:
        bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj in objs:
        obj.data.uv_layers.active = obj.data.uv_layers['atlas']
        obj.data.uv_layers['atlas'].active_render = True


def _spread(arrays, mask, rounds=8):
    """Grows the baked texels outwards into the empty atlas so no filter or smaller copy ever
    reads background at an island's edge."""
    filled = mask.copy()
    for _ in range(rounds):
        total = [np.zeros_like(a) for a in arrays]
        count = np.zeros(filled.shape, dtype=np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                moved = np.roll(np.roll(filled, dy, 0), dx, 1)
                count += moved
                for t, a in zip(total, arrays):
                    t += np.roll(np.roll(a, dy, 0), dx, 1) * moved[..., None]
        grow = (~filled) & (count > 0)
        for t, a in zip(total, arrays):
            a[grow] = t[grow] / count[grow][:, None]
        filled = filled | grow
    return filled


def _soften(paths, occlusion_in_color=0.5, small=1024):
    """After the bake: the occlusion is smoothed (a low sample count is enough then) and a share of
    it goes into the base colour; the islands are grown into the empty atlas; the occlusion /
    roughness / metal map and the normal map are stored at half the atlas size (same UVs)."""
    from PIL import ImageFilter
    orm = np.asarray(Image.open(paths['orm']).convert('RGB'), dtype=np.float32) / 255.0
    normal = np.asarray(Image.open(paths['normal']).convert('RGB'), dtype=np.float32) / 255.0
    base = np.asarray(Image.open(paths['base']).convert('RGB'), dtype=np.float32) / 255.0
    orm, normal, base = orm.copy(), normal.copy(), base.copy()
    mask = normal.sum(axis=2) > 0.02
    filled = _spread([orm, normal, base], mask)
    occlusion = Image.fromarray((orm[..., 0] * 255.0 + 0.5).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))
    occlusion = np.asarray(occlusion, dtype=np.float32) / 255.0
    orm[..., 0] = occlusion
    linear = np.where(base <= 0.04045, base / 12.92, ((base + 0.055) / 1.055) ** 2.4)
    linear *= (1.0 - occlusion_in_color * (1.0 - occlusion))[..., None]
    base = np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(np.clip(linear, 0, 1), 1 / 2.4) - 0.055)
    orm[~filled] = (1.0, 0.6, 0.0)
    normal[~filled] = (0.5, 0.5, 1.0)
    base[~filled] = (0.3, 0.3, 0.3)

    def save(array, path, size=None):
        image = Image.fromarray((np.clip(array, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8))
        if size and size < image.size[0]:
            image = image.resize((size, size), Image.LANCZOS)
        image.save(path)

    save(base, paths['base'])
    save(orm, paths['orm'], small)
    save(normal, paths['normal'], small)


# --- the .glb: roles, quantised normals and UVs, the contract check ----------------------------------

def _read_glb(path):
    with open(path, 'rb') as handle:
        data = handle.read()
    length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + length].decode('utf-8'))
    start = 20 + length
    size = struct.unpack_from('<I', data, start)[0]
    return document, data[start + 8:start + 8 + size]


def pack_glb(path, shrink_nodes=('cockpit_shell',), textures=None):
    """Blended glass, and normals / texture coordinates stored as normalised bytes and shorts
    (KHR_mesh_quantization, which three.js reads natively): about a third less geometry."""
    document, binary = _read_glb(path)
    for material in document.get('materials', []):
        if material.get('name') in ('canopy_glass', 'hud_glass'):
            pbr = material.setdefault('pbrMetallicRoughness', {})
            factor = list(pbr.get('baseColorFactor', [0.6, 0.7, 0.65, 1.0]))
            factor[3] = round(material.get('extras', {}).get('alpha', factor[3]), 3)
            pbr['baseColorFactor'] = factor
            material['alphaMode'] = 'BLEND'
            material['doubleSided'] = True
    accessors, views = document['accessors'], document['bufferViews']
    normals, coords = set(), set()
    for mesh in document['meshes']:
        for primitive in mesh['primitives']:
            attributes = primitive['attributes']
            if 'NORMAL' in attributes:
                normals.add(attributes['NORMAL'])
            if 'TEXCOORD_0' in attributes:
                coords.add(attributes['TEXCOORD_0'])
    users = {}
    for index, accessor in enumerate(accessors):
        users.setdefault(accessor.get('bufferView'), []).append(index)
    # The big static mesh also stores its positions as normalised shorts: its node carries the
    # centre and the half size (so `cockpit_shell` has a translation and a uniform scale in the file).
    scaled = {}
    for node in document['nodes']:
        if node.get('name') in shrink_nodes and 'mesh' in node and not node.get('children') and not any(k in node for k in ('translation', 'scale', 'rotation', 'matrix')):
            ids = [p['attributes']['POSITION'] for p in document['meshes'][node['mesh']]['primitives']]
            lo = np.min([accessors[i]['min'] for i in ids], axis=0)
            hi = np.max([accessors[i]['max'] for i in ids], axis=0)
            centre, half = (lo + hi) / 2.0, float((hi - lo).max() / 2.0 * 1.0001)
            node['translation'], node['scale'] = [float(v) for v in centre], [half] * 3
            for i in ids:
                scaled[i] = (centre.astype(np.float32), half)
    # The textures are encoded again from the baked PNGs, each at its own quality (the exporter has
    # one quality for all): the colour keeps the most, the occlusion / roughness map needs the least.
    encoded = {}
    for image in document.get('images', []):
        key = next((k for k in (textures or {}) if image.get('name', '').startswith(k)), None)
        if key and image.get('mimeType') == 'image/webp' and 'bufferView' in image:
            import io
            source, quality = textures[key]
            data = io.BytesIO()
            Image.open(source).convert('RGB').save(data, 'WEBP', quality=quality, method=6)
            encoded[image['bufferView']] = data.getvalue()
    chunks, changed = [], 0
    for index, view in enumerate(views):
        raw = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
        if index in encoded:
            chunks.append(encoded[index])
            continue
        mine = users.get(index, [])
        if len(mine) == 1 and mine[0] in scaled and accessors[mine[0]]['componentType'] == 5126 and 'byteStride' not in view:
            accessor = accessors[mine[0]]
            centre, half = scaled[mine[0]]
            values = np.frombuffer(raw, dtype='<f4').reshape(-1, 3)
            whole = np.clip(np.round((values - centre) / half * 32767.0), -32767, 32767).astype('<i2')
            packed = np.zeros((len(whole), 4), dtype='<i2')
            packed[:, :3] = whole
            accessor['componentType'], accessor['normalized'] = 5122, True
            accessor['min'], accessor['max'] = [int(v) for v in whole.min(axis=0)], [int(v) for v in whole.max(axis=0)]
            view['byteStride'] = 8
            changed += 1
            chunks.append(packed.tobytes())
            continue
        if len(mine) == 1 and mine[0] in normals | coords and accessors[mine[0]]['componentType'] == 5126 and 'byteStride' not in view:
            accessor = accessors[mine[0]]
            if mine[0] in normals:
                values = np.frombuffer(raw, dtype='<f4').reshape(-1, 3)
                packed = np.zeros((len(values), 4), dtype=np.int8)
                packed[:, :3] = np.clip(np.round(values * 127.0), -127, 127).astype(np.int8)
                accessor['componentType'], accessor['normalized'] = 5120, True
            else:
                values = np.frombuffer(raw, dtype='<f4').reshape(-1, 2)
                if values.min() < -1e-5 or values.max() > 1.00001:
                    chunks.append(raw)
                    continue
                packed = np.clip(np.round(values * 65535.0), 0, 65535).astype('<u2')
                accessor['componentType'], accessor['normalized'] = 5123, True
            accessor.pop('min', None)
            accessor.pop('max', None)
            raw = packed.tobytes()
            view['byteStride'] = 4
            changed += 1
        chunks.append(raw)
    out, offset = [], 0
    for view, raw in zip(views, chunks):
        pad = (4 - offset % 4) % 4
        out.append(b'\0' * pad)
        offset += pad
        view['byteOffset'], view['byteLength'] = offset, len(raw)
        out.append(raw)
        offset += len(raw)
    binary = b''.join(out)
    binary += b'\0' * ((4 - len(binary) % 4) % 4)
    document['buffers'][0]['byteLength'] = len(binary)
    if changed:
        for key in ('extensionsUsed', 'extensionsRequired'):
            document[key] = sorted(set(document.get(key, [])) | {'KHR_mesh_quantization'})
    text = json.dumps(document, separators=(',', ':')).encode('utf-8')
    text += b' ' * ((4 - len(text) % 4) % 4)
    with open(path, 'wb') as handle:
        handle.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(text) + 8 + len(binary)) + struct.pack('<I4s', len(text), b'JSON') + text
                     + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
    images = [views[i['bufferView']]['byteLength'] for i in document.get('images', [])]
    return {'quantised_accessors': changed, 'texture_bytes': sum(images), 'geometry_bytes': len(binary) - sum(images)}


def check_glb(path, required):
    """Re-reads the written file: every contract node, the parents, materials and extras."""
    document, binary = _read_glb(path)
    nodes = document['nodes']
    names = [n.get('name') for n in nodes]
    parent = {}
    for index, node in enumerate(nodes):
        for child in node.get('children', []):
            parent[names[child]] = names[index]
    materials = sorted(m['name'] for m in document.get('materials', []))
    extras = document['scenes'][0].get('extras', {})
    missing = [name for name in required if name not in names]
    return {'missing_nodes': missing, 'node_count': len(names), 'parents': {k: v for k, v in parent.items()}, 'materials': materials,
            'extras': {k: extras.get(k) for k in ('eye', 'fov', 'gaze')},
            'images': [document['bufferViews'][i['bufferView']]['byteLength'] for i in document.get('images', [])],
            'ok': not missing}


# --- the picture from the eye -----------------------------------------------------------------------

def _views():
    text = os.environ.get('MARAZUL_COCKPIT_VIEWS', '0,0')
    return [tuple(float(v) for v in part.split(',')) for part in text.split(';')]


def render_eye(path, eye, fov, views=((0, 0),), size=(640, 400), samples=None):
    """Cycles pictures from the eye (yaw to the right, pitch up, degrees), stacked into one JPEG:
    a dawn sky, a low sun ahead, a concrete plain below, a faint warm panel glow."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples or int(os.environ.get('MARAZUL_COCKPIT_SAMPLES', '40'))
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.exposure = 0.6
    world = scene.world or bpy.data.worlds.new('eye_world')
    scene.world = world
    world.use_nodes = True
    tree = world.node_tree
    background = next(n for n in tree.nodes if n.type == 'BACKGROUND')
    coords = tree.nodes.new('ShaderNodeTexCoord')
    split = tree.nodes.new('ShaderNodeSeparateXYZ')
    tree.links.new(coords.outputs['Generated'], split.inputs[0])
    ramp = tree.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.0, (0.95, 0.62, 0.36, 1.0)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.45, (0.3, 0.47, 0.8, 1.0)
    tree.links.new(split.outputs['Z'], ramp.inputs['Fac'])
    tree.links.new(ramp.outputs['Color'], background.inputs['Color'])
    background.inputs['Strength'].default_value = 1.3
    extras = []
    sun_data = bpy.data.lights.new('eye_sun', 'SUN')
    sun_data.energy, sun_data.color, sun_data.angle = 4.5, (1.0, 0.82, 0.62), math.radians(2.0)
    sun = bpy.data.objects.new('eye_sun', sun_data)
    towards = Vector((math.sin(math.radians(-24)) * math.cos(math.radians(16)), math.cos(math.radians(-24)) * math.cos(math.radians(16)), math.sin(math.radians(16))))
    sun.rotation_euler = (-towards).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(sun)
    extras.append(sun)
    glow_data = bpy.data.lights.new('eye_glow', 'POINT')
    glow_data.energy, glow_data.color, glow_data.shadow_soft_size = 2.5, (1.0, 0.85, 0.7), 0.1
    glow = bpy.data.objects.new('eye_glow', glow_data)
    glow.location = Vector(eye) + Vector((0.0, 0.45, -0.25))
    scene.collection.objects.link(glow)
    extras.append(glow)
    bpy.ops.mesh.primitive_plane_add(size=6000, location=(0, 0, 0))
    plane = bpy.context.active_object
    ground = bpy.data.materials.new('eye_ground')
    ground.use_nodes = True
    shader = next(n for n in ground.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (0.2, 0.19, 0.17, 1)
    shader.inputs['Roughness'].default_value = 0.9
    plane.data.materials.append(ground)
    extras.append(plane)
    camera_data = bpy.data.cameras.new('eye_camera')
    camera_data.sensor_fit = 'VERTICAL'
    camera_data.angle_y = math.radians(fov)
    camera_data.clip_start, camera_data.clip_end = 0.02, 8000
    camera = bpy.data.objects.new('eye_camera', camera_data)
    camera.location = eye
    scene.collection.objects.link(camera)
    scene.camera = camera
    extras.append(camera)
    tiles = []
    for index, view in enumerate(views):
        camera.rotation_euler = (math.radians(90 + view[1]), 0.0, math.radians(-view[0]))
        camera_data.angle_y = math.radians(view[2] if len(view) > 2 else fov)     # a third number zooms in
        tile = path + '_tile%d.png' % index
        scene.render.filepath = tile
        bpy.ops.render.render(write_still=True)
        tiles.append(tile)
    sheet = Image.new('RGB', (size[0], size[1] * len(tiles)))
    for index, tile in enumerate(tiles):
        sheet.paste(Image.open(tile).convert('RGB'), (0, index * size[1]))
        os.remove(tile)
    sheet.save(path, quality=85)
    for obj in extras:
        bpy.data.objects.remove(obj, do_unlink=True)
    return path


def source_shot(kit):
    """In a --source run: the picture from the eye with the procedural materials."""
    shot = os.environ.get('MARAZUL_COCKPIT_SHOT')
    if shot and '--source' in sys.argv:
        if kit.objects.get('swatch'):
            kit.objects['swatch'].hide_render = True
        render_eye(shot, kit.extras['eye'], kit.extras['fov'], _views())
        print(json.dumps({'id': kit.id, 'shot': shot, 'screen': {n: on_screen(kit.extras['eye'], kit.extras['fov'], p) for n, p in kit.probes.items()}}))


# --- frames ---------------------------------------------------------------------------------------------

def bar(soup, edge_a, edge_b, depth, mat=0, chamfer=0.006):
    """A canopy frame member: edge_a and edge_b are its two edges on the glazing as lists of
    (point, inward normal); the bar stands `depth` into the cabin with chamfered corners. Only the
    faces seen from inside are made. Returns the centre line of its inner face as (point, normal)."""
    rings, line = [], []
    for (pa, na), (pb, nb) in zip(edge_a, edge_b):
        across = (pb - pa).normalized()
        rings.append([pa, pa + na * (depth - chamfer), pa + na * depth + across * chamfer, pb + nb * depth - across * chamfer, pb + nb * (depth - chamfer), pb])
        line.append(((pa + pb) * 0.5 + (na + nb) * (0.5 * depth), (na + nb).normalized()))
    normal = (rings[0][3] - rings[0][2]).cross(rings[1][2] - rings[0][2])
    if normal.dot(edge_a[0][1]) < 0:
        rings = [ring[::-1] for ring in rings]
    soup.loft(rings, mat, closed=False)
    return line


def studs(soup, line, step=0.065, radius=0.0045, height=0.003, start=0.5):
    """Bolt heads along a line of (point, normal), one every `step` metres."""
    reach, count = start * step, 0
    for (p0, n0), (p1, n1) in zip(line, line[1:]):
        span = (p1 - p0).length
        while reach <= span:
            t = reach / span
            bolt(soup, p0.lerp(p1, t), n0.lerp(n1, t).normalized(), radius, height)
            reach += step
            count += 1
        reach -= span
    return count


def bead(soup, edge, radius=0.004, lift=0.002, mat=0, side=None):
    """A sealant bead along a frame edge where the glass meets it."""
    pts = [p + n * lift + (side[i] if side else Vector()) for i, (p, n) in enumerate(edge)]
    soup.tube(pts, radius, 3, mat, (False, False))


def plate(soup, screws, plane, u0, v0, u1, v1, thick=0.002, mat=0):
    """A raised sub-panel plate with a screw in each corner; returns the plane of its face."""
    soup.box(plane.pt((u0 + u1) / 2, (v0 + v1) / 2, thick / 2), (abs(u1 - u0), abs(v1 - v0), thick), mat, plane.axes())
    for u in (u0 + 0.007 * (1 if u1 > u0 else -1), u1 - 0.007 * (1 if u1 > u0 else -1)):
        for v in (v0 + 0.007 * (1 if v1 > v0 else -1), v1 - 0.007 * (1 if v1 > v0 else -1)):
            screw(screws, plane, u, v, thick)
    return plane.lifted(thick)


# --- dressing on a panel ------------------------------------------------------------------------------

def gauge_ring(ring, screws, plane, u, v, radius, seg=24, flange=True):
    """A raised instrument bezel: a square flange with four screws and a ring 7 mm proud of the panel."""
    c = plane.pt(u, v)
    if flange:
        side = 2 * radius + 0.02
        ring.box(plane.pt(u, v, 0.0008), (side, side, 0.0016), axes=plane.axes())
    ring.lathe(c, plane.n, [(radius + 0.0085, 0.0014), (radius + 0.0085, 0.0054), (radius + 0.002, 0.007), (radius, 0.0055), (radius, 0.0006)], seg, ref=plane.r)
    k = radius + 0.0035
    for su in (-1, 1):
        for sv in (-1, 1):
            screw(screws, plane, u + su * k, v + sv * k, 0.0016)


def screw(soup, plane, u, v, lift=0.0, radius=0.0028):
    soup.lathe(plane.pt(u, v, lift), plane.n, [(radius, 0.0), (0.0, radius * 0.55)], 6, ref=plane.r)


def bolt(soup, point, normal, radius=0.0045, height=0.003):
    """A domed bolt head: six triangles, smooth shaded (hundreds of them line the frames)."""
    soup.lathe(point, normal, [(radius, 0.0), (0.0, height)], 6)


def live_face(kit, material, plane, u, v, radius, name, seg=32, lift=0.001):
    """A live round face: UVs fill 0..1 across the disc's bounding square, u right and v up as read."""
    pts, uvs = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        c, s = math.cos(a), math.sin(a)
        pts.append(plane.pt(u + c * radius, v + s * radius, lift))
        uvs.append((0.5 + 0.5 * c, 0.5 + 0.5 * s))
    # Exact 0 and 1 at the four compass points (seg is a multiple of 4).
    obj = mk.mesh_object(name, pts, [tuple(range(seg))])
    layer = obj.data.uv_layers.new(name='UVMap')
    for loop in obj.data.loops:
        layer.data[loop.index].uv = uvs[loop.vertex_index]
    mk.assign(obj, material)
    kit.probes[name] = tuple(plane.pt(u, v, lift))
    return kit.node(obj)


def live_rect(kit, material, plane, u, v, w, h, name, lift=0.001):
    """A live rectangular face (a display): UVs 0..1."""
    obj = mk.quad(name, [plane.pt(u - w / 2, v - h / 2, lift), plane.pt(u + w / 2, v - h / 2, lift), plane.pt(u + w / 2, v + h / 2, lift), plane.pt(u - w / 2, v + h / 2, lift)])
    mk.assign(obj, material)
    kit.probes[name] = tuple(plane.pt(u, v, lift))
    return kit.node(obj)


def toggle(chrome, plane, u, v, lean=22.0, lift=0.0):
    """A toggle switch: a hex nut and a bat lever leaning up (positive) or down."""
    base = plane.pt(u, v, lift)
    chrome.lathe(base, plane.n, [(0.0054, 0.0), (0.003, 0.0034)], 6, ref=plane.r)
    a = math.radians(lean)
    direction = plane.n * math.cos(a) + plane.u * math.sin(a)
    chrome.lathe(base + plane.n * 0.003, direction, [(0.0019, 0.0), (0.003, 0.0135), (0.0, 0.0165)], 5)


def guard(soup, plane, u, v, lift=0.0, mat=0):
    """A red flip-up guard over a toggle: two cheeks and a cover leaning open."""
    for side in (-1, 1):
        soup.box(plane.pt(u + side * 0.0085, v - 0.002, lift + 0.007), (0.0016, 0.024, 0.014), mat, plane.axes())
    soup.box(plane.pt(u, v + 0.011, lift + 0.016), (0.0186, 0.0016, 0.012), mat, plane.axes())


def breaker(black, white, plane, u, v, lift=0.0, out=False):
    """A circuit breaker: a black push-pull button with a pale collar (shown when popped)."""
    c = plane.pt(u, v, lift)
    rise = 0.0035 if out else 0.0
    if out:
        white.lathe(c + plane.n * 0.002, plane.n, [(0.0036, 0.0), (0.0036, 0.0035)], 6, ref=plane.r)
    black.lathe(c, plane.n, [(0.0062, 0.0), (0.0046, 0.002 + rise), (0.0046, 0.0055 + rise), (0.0, 0.0062 + rise)], 6, ref=plane.r)


def knob(black, white, plane, u, v, radius=0.011, height=0.014, lift=0.0, turn=0.0, seg=8):
    """A rotary knob with a skirt and a pale index line."""
    c = plane.pt(u, v, lift)
    black.lathe(c, plane.n, [(radius * 1.25, 0.0), (radius * 1.25, height * 0.18), (radius, height * 0.28), (radius * 0.92, height), (0.0, height)], seg, ref=plane.r)
    a = math.radians(turn)
    along = plane.u * math.cos(a) + plane.r * math.sin(a)
    white.box(c + along * (radius * 0.55) + plane.n * (height + 0.0003), (0.0016, radius * 0.75, 0.0008),
              axes=(plane.n.cross(along) * -1.0, along, plane.n))


def lamp_tiles(kit, soup, plane, u, v, texts, colours, columns, w=0.03, h=0.018, gap=0.003, lift=0.0, tier=6.0):
    """A block of caution-lamp tiles in a frame; returns its (width, height)."""
    rows = (len(texts) + columns - 1) // columns
    W, H = columns * (w + gap) + gap, rows * (h + gap) + gap
    soup.box(plane.pt(u, v, lift + 0.002), (W + 0.006, H + 0.006, 0.004), axes=plane.axes())
    d = kit.decals(tier=tier)
    for i, text in enumerate(texts):
        cu = u - W / 2 + gap + w / 2 + (i % columns) * (w + gap)
        cv = v + H / 2 - gap - h / 2 - (i // columns) * (h + gap)
        soup.box(plane.pt(cu, cv, lift + 0.005), (w, h, 0.002), axes=plane.axes())
        d.on(plane, cu, cv, w - 0.001, h - 0.001, kit.sheet.tile(text, colours[i % len(colours)], w, h), lift + 0.0064)
    return W, H


def label(kit, plane, u, v, text, w=0.03, h=0.007, lift=0.0006, tier=6.0, ink=None, ground=None, border=False, turn=0.0):
    kit.decals(tier=tier).on(plane, u, v, w, h, kit.sheet.placard(text, w, h, ink, ground, border), lift, turn)


# --- Dez's hand ---------------------------------------------------------------------------------------

FINGERS = (   # name, x of the knuckle, y of the knuckle, phalanx lengths, radius at the root
    ('index', -0.0305, 0.094, (0.043, 0.026, 0.023), 0.0102),
    ('middle', -0.0098, 0.099, (0.047, 0.030, 0.024), 0.0104),
    ('ring', 0.0108, 0.094, (0.043, 0.028, 0.023), 0.0098),
    ('little', 0.0305, 0.083, (0.034, 0.021, 0.021), 0.0088),
)
GRIP = (0.078, -0.033)   # (y, z) in the hand's frame of the axis of a 40 mm grip held in the curled fingers
SEG = 8


def _finger(soup, x, y, lengths, radius, curls, spread, mats, z=0.0035):
    """One gloved finger curled in its own plane: rounded joints, knuckle swells, a domed tip."""
    fabric, leather = mats
    root = 0.014
    corners = [Vector((0.0, -root, 0.0)), Vector((0.0, 0.0, 0.0))]
    angle, joints, walked = 0.0, [], root
    for span, turn in zip(lengths, curls):
        joints.append(walked)
        angle += math.radians(turn)
        corners.append(corners[-1] + Vector((0.0, math.cos(angle), -math.sin(angle))) * span)
        walked += span
    total = sum(lengths)
    ahead = (corners[-1] - corners[-2]).normalized()
    corners[-1] = corners[-1] - ahead * (radius * 0.7)
    path = fillet(corners, radius * 1.2, 3)
    reach = [0.0]
    for a, b in zip(path, path[1:]):
        reach.append(reach[-1] + (b - a).length)
    stretch = (root + total - radius * 0.7) / reach[-1]      # the rounded path is a little shorter
    pts, tangents, rad, far = [], [], [], []
    for i, q in enumerate(path):
        s = reach[i] * stretch
        r = radius * (1.0 - 0.2 * max(s - root, 0.0) / total)
        r *= 1.0 + sum(0.075 * math.exp(-((s - j) / 0.0065) ** 2) for j in joints)
        pts.append(q)
        tangents.append((path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized())
        rad.append(r)
        far.append(s > root + lengths[0] + lengths[1] - 0.004)
    for ang in (35, 65):    # the tip: a dome
        pts.append(path[-1] + ahead * (rad[len(path) - 1] * math.sin(math.radians(ang))))
        tangents.append(ahead)
        rad.append(rad[len(path) - 1] * math.cos(math.radians(ang)))
        far.append(True)
    rings = []
    for q, t, r in zip(pts, tangents, rad):
        n = Vector((0.0, -t.z, t.y))
        rings.append([q + n * (math.cos(2 * math.pi * k / SEG) * r * 0.94) + Vector((1, 0, 0)) * (math.sin(2 * math.pi * k / SEG) * r) for k in range(SEG)])

    def choose(k, i):
        back = math.cos(2 * math.pi * (i + 0.5) / SEG) > -0.15
        return leather if (far[k] and far[k + 1]) or not back else fabric

    part = Soup()
    part.loft(rings, choose, True, False, True)
    part.transform(Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(spread), 4, 'Z'))
    soup.extend(part)


def hand(pose, sleeve_path, left=False):
    """Dez's gloved hand in the hand frame, as a Soup with materials (fabric, leather, cuff, sleeve).

    pose: {'curl': {finger: (knuckle, middle, tip) degrees}, 'spread': {finger: degrees},
    'thumb': four points from the root to the tip}. sleeve_path: points from the wrist back to the
    shoulder, in the hand frame of the hand as it will stand (mirrored already for a left hand).
    """
    FABRIC, LEATHER, CUFF, SLEEVE = 0, 1, 2, 3
    s = Soup()
    # The palm: a loft from the wrist to the knuckle row, fabric on the back and leather inside.
    sections = [(-0.014, 0.054, 0.036, 0.0), (0.0, 0.057, 0.037, 0.0), (0.03, 0.076, 0.034, 0.0005), (0.062, 0.087, 0.030, 0.002),
                (0.088, 0.088, 0.027, 0.003), (0.1, 0.082, 0.02, 0.003)]
    count = 14
    rings = []
    for y, w, t, z in sections:
        ring = []
        for k in range(count):
            a = 2 * math.pi * k / count
            c, sn = math.cos(a), math.sin(a)
            ring.append(Vector((math.copysign(abs(sn) ** 0.72, sn) * w / 2, y, z + math.copysign(abs(c) ** 0.72, c) * t / 2)))
        rings.append(ring)
    s.loft(rings, lambda k, i: FABRIC if math.cos(2 * math.pi * (i + 0.5) / count) > 0.1 else LEATHER, True, False, True)
    for name, x, y, lengths, radius in FINGERS:
        _finger(s, x, y, lengths, radius, pose['curl'][name], pose.get('spread', {}).get(name, 0.0), (FABRIC, LEATHER))
    # The thumb and the ball of the thumb.
    thumb = fillet(pose['thumb'], 0.012, 3)
    radii = [0.0135 - 0.0035 * i / (len(thumb) - 1) for i in range(len(thumb))]
    half = len(thumb) * 3 // 5
    s.tube(thumb[:half + 1], radii[:half + 1], SEG, FABRIC, (False, False), ref=(0, 0, 1))
    s.tube(thumb[half:], radii[half:], SEG, LEATHER, (False, True), ref=(0, 0, 1), dome=True)
    root = Vector(pose['thumb'][0])
    s.lathe(root + Vector((0.005, -0.002, -0.009)), (Vector(pose['thumb'][1]) - root), [(0.0, -0.02), (0.012, -0.012), (0.016, 0.004), (0.014, 0.02), (0.0, 0.03)], SEG, LEATHER)
    # Seams along the back of the hand, a wrist strap with its tab, the cuff.
    for x in (-0.02, 0.0, 0.021):
        s.tube([(x * 0.6, 0.012, 0.0185), (x * 0.85, 0.045, 0.0175), (x, 0.08, 0.0168)], 0.0012, 4, CUFF, (True, True))
    s.lathe((0, 0.014, 0), (0, -1, 0), [(0.0295, 0.0), (0.0318, 0.001), (0.0318, 0.017), (0.0295, 0.018)], 14, CUFF, ref=(1, 0, 0), squash=(1.0, 0.68))
    s.box((0.0, 0.005, 0.0222), (0.026, 0.02, 0.003), CUFF)
    s.lathe((0, -0.004, 0), (0, -1, 0), [(0.0305, 0.0), (0.034, 0.004), (0.036, 0.03), (0.039, 0.058), (0.0405, 0.062), (0.036, 0.063)], 14, FABRIC,
            ref=(1, 0, 0), squash=(1.0, 0.88))
    if left:
        s.mirror_x()
    # The sleeve: wrist to elbow to shoulder, with folds.
    path = fillet(sleeve_path, 0.06, 4)
    reach = [0.0]
    for a, b in zip(path, path[1:]):
        reach.append(reach[-1] + (b - a).length)
    radii = [0.029 + 0.014 * min(1.0, d / (0.42 * reach[-1])) ** 0.6 + 0.007 * max(0.0, d / reach[-1] - 0.55) / 0.45 for d in reach]
    pts, radii = resample(path, radii, 0.028)
    radii = [r * (1.0 + 0.022 * math.sin(i * 2.3) + 0.018 * math.sin(i * 0.9 + 1.0)) for i, r in enumerate(radii)]
    s.tube(pts, radii, 10, SLEEVE, (False, True), ref=(0, 0, 1), dome=True)
    return s


def hand_matrix(wrist, across, fingers, back):
    """The world matrix of a hand frame: across = the frame's +X, fingers = +Y, back = +Z."""
    x, y = Vector(across).normalized(), Vector(fingers).normalized()
    z = x.cross(y).normalized()
    y = z.cross(x).normalized()
    m = Matrix.Identity(4)
    for i, axis in enumerate((x, y, z)):
        for k in range(3):
            m[k][i] = axis[k]
    for k in range(3):
        m[k][3] = wrist[k]
    return m
