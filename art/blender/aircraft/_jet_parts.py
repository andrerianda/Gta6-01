"""Shared builders of the two big jets (manta_sombra, garza_negra): wings lofted span-wise through
a planform given as functions, hinged surfaces cut out of them, faceted glazing shells with window
holes, landing gear, cockpit furniture, and the scene extras the exporter cannot write by itself.

Blender axes: Z up, nose +Y, right wing +X. A planform is described by functions of the span
position x (0 at the centreline): le(x) and te(x) give the leading and trailing edge (y), zc(x) the
height of the chord line, thick(x) the thickness as a share of the chord.
"""
import io
import json
import math
import os
import random
import struct

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from PIL import Image, ImageChops, ImageDraw, ImageFilter

from lib import atlasbake
from lib import meshkit as mk
from lib import surfaces as sf


def profile_half(t):
    """Half thickness of the section at chord fraction t, per unit of (thickness share * chord)."""
    t = min(max(t, 0.0), 1.0)
    return 5.0 * (0.2969 * math.sqrt(t) - 0.126 * t - 0.3516 * t ** 2 + 0.2843 * t ** 3 - 0.1036 * t ** 4)


class Planform:
    """A wing seen from above with its section: where its skin is at any (x, y)."""

    def __init__(self, le, te, zc, thick, camber=0.012):
        self.le, self.te, self.zc, self.thick, self.camber = le, te, zc, thick, camber

    def chord(self, x):
        return self.le(x) - self.te(x)

    def skin_z(self, x, y, upper=True):
        """Height of the upper or lower skin at a point of the planform."""
        c = max(self.chord(x), 1e-4)
        t = min(max((self.le(x) - y) / c, 0.0), 1.0)
        bend = self.camber * 4 * t * (1 - t)
        half = profile_half(t) * self.thick(x)
        return self.zc(x) + (bend + half if upper else bend - half) * c

    def ring(self, x, t0=0.0, t1=1.0, n=14):
        """The closed section at x between chord fractions t0 and t1: upper skin back, lower skin forward."""
        c = self.chord(x)
        ts = [t0 + (t1 - t0) * 0.5 * (1 - math.cos(math.pi * i / n)) for i in range(n + 1)]
        top = [(x, self.le(x) - t * c, self.skin_z(x, self.le(x) - t * c, True)) for t in ts]
        low = [(x, self.le(x) - t * c, self.skin_z(x, self.le(x) - t * c, False)) for t in reversed(ts)]
        return top + low

    def wing(self, name, xs, n=14, hinge=None):
        """The right half of the wing lofted through sections at xs (open at the root for the mirror).

        hinge(x) -> y of a hinge line where a control surface is cut out (the wing ends bluntly
        there), or None where the section runs to the trailing edge.
        """
        rings = []
        for x in xs:
            y = hinge(x) if hinge else None
            t1 = 1.0 if y is None else (self.le(x) - y) / self.chord(x)
            rings.append(self.ring(x, 0.0, t1, n))
        obj = mk.loft(name, rings, cap_start=False, cap_end=True)
        mk.weld(obj, 0.0004)
        return orient(obj)

    def surface(self, name, xs, hinge, n=4, gap=0.025):
        """A hinged trailing-edge surface between the hinge line and the trailing edge."""
        rings = []
        for x in xs:
            c = self.chord(x)
            rings.append(self.ring(x, (self.le(x) - hinge(x) + gap) / c, 1.0, n))
        obj = mk.loft(name, rings)
        mk.weld(obj, 0.0004)
        return orient(obj)

    def patch(self, name, x0, x1, y0, y1, upper=True, lift=0.012, nx=4, ny=6):
        """A thin plate lying on the skin (stains, markings, door outlines)."""
        verts, faces = [], []
        for j in range(ny + 1):
            for i in range(nx + 1):
                x = x0 + (x1 - x0) * i / nx
                ya = y0(x) if callable(y0) else y0
                yb = y1(x) if callable(y1) else y1
                y = ya + (yb - ya) * j / ny
                verts.append((x, y, self.skin_z(x, y, upper) + (lift if upper else -lift)))
        for j in range(ny):
            for i in range(nx):
                a = j * (nx + 1) + i
                faces.append((a, a + 1, a + nx + 2, a + nx + 1))
        obj = mk.mesh_object(name, verts, faces)
        if (obj.data.polygons[0].normal.z > 0) != upper:
            mk.flip(obj)
        return obj


def orient(obj, inward=False):
    """Turns the faces so they look away from the mesh's middle (or towards it)."""
    mk.recalc_normals(obj)
    middle = sum((v.co for v in obj.data.vertices), Vector()) / max(len(obj.data.vertices), 1)
    outward = sum(p.normal.dot(p.center - middle) * p.area for p in obj.data.polygons)
    if (outward < 0) != inward:
        mk.flip(obj)
    return obj


def shell_point(station, angle, power):
    """A point of a half cross-section: angle in degrees from -90 (bottom centre) to 90 (top centre)."""
    a = math.radians(angle)
    c, s = math.cos(a), math.sin(a)
    x = (max(c, 0.0) ** (2.0 / power)) * station['w'] * 0.5
    z = station['z'] + math.copysign(abs(s) ** (2.0 / power), s) * station['h'] * 0.5
    return (x, station['y'], z)


def half_shell(name, stations, angles, power=2.4, holes=(), inward=False, shrink=0.0):
    """The right half of a faceted body skin lofted through stations, with window holes.

    stations: dicts y, w, h, z (ordered); angles: degrees from the bottom or the side to 90 (the top
    centreline). holes: (station index, angle index) pairs of the quads left out; they come back
    as a second object of flat panes (None when there are none). shrink pulls the skin inwards (an
    inner lining); inward turns it to be seen from inside.
    """
    stations = [dict(s, w=s['w'] - 2 * shrink, h=s['h'] - 2 * shrink) for s in stations]
    count = len(angles)
    verts = [shell_point(s, a, power) for s in stations for a in angles]
    faces, panes = [], []
    for k in range(len(stations) - 1):
        for i in range(count - 1):
            quad = (k * count + i, k * count + i + 1, (k + 1) * count + i + 1, (k + 1) * count + i)
            (panes if (k, i) in holes else faces).append(quad)
    shell = mk.mesh_object(name, verts, faces)
    mk.weld(shell, 0.0004)
    _face_away(shell, stations, inward)
    glass = None
    if panes:
        pane_verts, pane_faces = [], []
        for quad in panes:
            base = len(pane_verts)
            pane_verts += [verts[i] for i in quad]
            pane_faces.append((base, base + 1, base + 2, base + 3))
        glass = mk.mesh_object(name + '_panes', pane_verts, pane_faces)
        _face_away(glass, stations, False)
    return shell, glass


def _face_away(obj, stations, inward):
    """Per face: look away from the body's axis (the shell is open, so no global test works)."""
    ys = [s['y'] for s in stations]
    zs = [s['z'] for s in stations]

    def axis_z(y):
        for k in range(len(ys) - 1):
            lo, hi = sorted((ys[k], ys[k + 1]))
            if lo <= y <= hi:
                f = (y - ys[k]) / (ys[k + 1] - ys[k]) if ys[k + 1] != ys[k] else 0.0
                return zs[k] + (zs[k + 1] - zs[k]) * f
        return zs[0]

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for face in bm.faces:
        centre = face.calc_center_median()
        away = Vector((centre.x, 0.0, centre.z - axis_z(centre.y)))
        if (face.normal.dot(away) < 0) != inward:
            face.normal_flip()
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def panel_face(name, corners, toward):
    """A flat face through the corners (any number, in order) that looks towards a direction."""
    obj = mk.mesh_object(name, corners, [tuple(range(len(corners)))])
    if obj.data.polygons[0].normal.dot(Vector(toward)) < 0:
        mk.flip(obj)
    return obj


def delete_faces(obj, choose):
    """Removes the faces choose(centre, normal) says yes to (openings for cockpits)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    doomed = [f for f in bm.faces if choose(f.calc_center_median(), f.normal.copy())]
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def flat(obj):
    """Flat shading: every face its own facet (window panes, plates)."""
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return obj


def mirrored_pair(obj, name=None):
    """obj plus its mirror image across X = 0 as one mesh (for parts the library does not mirror)."""
    copy = mk.duplicate(obj, obj.name + '_m')
    mk.transform(copy, scale=(-1, 1, 1))
    return mk.join(name or obj.name, [obj, copy])


def wheel(name, radius, width, centre, tyre, hub):
    """A wheel on an axle along X: a rounded tyre, and on each face a hub with a rim lip, a dished web and a cap."""
    def lathe(part, profile, segments, caps):
        rings = [[(centre[0] + side * width, centre[1] + math.sin(a) * radius * scale, centre[2] + math.cos(a) * radius * scale)
                  for a in (2 * math.pi * i / segments for i in range(segments))] for side, scale in profile]
        return orient(mk.loft(part, rings, cap_start=caps, cap_end=caps))

    t = lathe(name, [(-0.5, 0.56), (-0.5, 0.8), (-0.45, 0.92), (-0.3, 1.0), (0.3, 1.0), (0.45, 0.92), (0.5, 0.8), (0.5, 0.56)], 20, False)
    mk.assign(t, tyre)
    h = lathe(name + '_hub', [(-0.46, 0.16), (-0.33, 0.25), (-0.33, 0.49), (-0.52, 0.58), (0.52, 0.58), (0.33, 0.49), (0.33, 0.25), (0.46, 0.16)], 12, True)
    mk.assign(h, hub)
    return [t, h]


def gear_leg(name, hinge, axle_z, wheels_x, radius, width, metal, tyre, hub, strut=0.09, bogie=None, lamp=None, chrome=None, hose=None):
    """A landing-gear leg: oleo strut from the hinge down to the axle, brace, torque link and wheels.

    hinge: (x, y, z) of the retraction hinge (the node's origin); wheels_x: axle offsets of the
    wheels from the leg; bogie: None or the fore-and-aft distance between two axles; lamp: a
    material for a landing lamp on the leg, or None. chrome: the polished piston's material (the hub
    material when None); hose: a material for the brake lines and the gland collars, or None.
    """
    hx, hy, hz = hinge
    drop = hz - axle_z
    parts = [
        mk.assign(mk.cylinder(name + '_outer', strut, drop * 0.55, (hx, hy, hz - drop * 0.275), 'Z', 14), metal),
        mk.assign(mk.cylinder(name + '_oleo', strut * 0.62, drop * 0.5, (hx, hy, axle_z + drop * 0.25), 'Z', 12), chrome or hub),
        mk.assign(mk.tube(name + '_brace', [(hx, hy - drop * 0.45, hz - 0.02), (hx, hy - 0.02, axle_z + drop * 0.5)], strut * 0.45, 8), metal),
        mk.assign(mk.tube(name + '_link', [(hx, hy + strut, axle_z + drop * 0.42), (hx, hy + strut * 3.2, axle_z + drop * 0.24),
                                           (hx, hy + strut, axle_z + 0.06)], strut * 0.3, 6), metal),
    ]
    rows = [0.0] if not bogie else [-0.5 * bogie, 0.5 * bogie]
    if bogie:
        parts.append(mk.assign(mk.box(name + '_beam', (strut * 1.6, bogie + strut * 2, strut * 1.6), (hx, hy, axle_z), 0.02), metal))
    span = max(wheels_x) - min(wheels_x) + width
    for row in rows:
        parts.append(mk.assign(mk.cylinder(name + '_axle', strut * 0.5, span, (hx, hy + row, axle_z), 'X', 10), metal))
        for i, offset in enumerate(wheels_x):
            parts += wheel('%s_wheel_%d' % (name, i), radius, width, (hx + offset, hy + row, axle_z), tyre, hub)
    if lamp is not None:
        parts.append(mk.assign(mk.cylinder(name + '_lamp', 0.09, 0.07, (hx, hy + strut + 0.05, hz - drop * 0.35), 'Y', 12), lamp))
        parts.append(mk.assign(mk.cylinder(name + '_lamp_body', 0.1, 0.07, (hx, hy + strut + 0.02, hz - drop * 0.35), 'Y', 12, 0.07), metal))
    if hose is not None:
        # The gland collar and wiper ring where the piston enters the cylinder, a clamp, and a brake line a side.
        parts.append(mk.assign(mk.cylinder(name + '_gland', strut * 1.14, strut * 0.5, (hx, hy, hz - drop * 0.55), 'Z', 12), metal))
        parts.append(mk.assign(mk.cylinder(name + '_wiper', strut * 0.78, strut * 0.2, (hx, hy, hz - drop * 0.55 - strut * 0.32), 'Z', 10), hose))
        for side in ((-1, 1) if len(wheels_x) > 1 else (1,)):
            sx = hx + side * strut * 0.8
            line = [(sx, hy - strut * 0.75, hz - 0.04), (sx, hy - strut * 0.8, hz - drop * 0.5), (sx + side * strut * 0.5, hy - strut * 1.5, axle_z + drop * 0.3),
                    (hx + side * strut * 1.1, hy - strut * 0.7, axle_z + drop * 0.1), (hx + side * (span * 0.5 - width * 0.9), hy + rows[0], axle_z + strut * 0.5)]
            parts.append(mk.assign(mk.tube(name + '_brake_line', line, strut * 0.085, 4), hose))
    obj = mk.join(name, parts)
    mk.shade(obj, 40)
    return mk.set_origin(obj, hinge)


def seat(name, hip, cloth, frame, width=0.5, recline=14.0):
    """An ejection-style seat around a hip point: pan, raked back, headrest box, side rails, firing handle."""
    x, y, z = hip
    lean = math.tan(math.radians(recline))
    parts = [
        mk.assign(mk.box(name + '_pan', (width, 0.5, 0.1), (x, y + 0.14, z - 0.13), 0.03), cloth),
        mk.assign(mk.box(name + '_bucket', (width + 0.08, 0.6, 0.16), (x, y + 0.12, z - 0.24), 0.02), frame),
        mk.assign(mk.transform(mk.box(name + '_back', (width - 0.04, 0.09, 0.74), (0, 0, 0), 0.03), (x, y - 0.17 - 0.37 * lean, z + 0.3), (recline, 0, 0)), cloth),
        mk.assign(mk.transform(mk.box(name + '_spine', (width + 0.06, 0.1, 1.02), (0, 0, 0), 0.02), (x, y - 0.27 - 0.5 * lean, z + 0.38), (recline, 0, 0)), frame),
        mk.assign(mk.box(name + '_head', (0.3, 0.16, 0.24), (x, y - 0.3 - 0.9 * lean, z + 0.93), 0.04), cloth),
        mk.assign(mk.tube(name + '_handle', [(x - 0.07, y + 0.36, z - 0.06), (x - 0.07, y + 0.4, z + 0.03), (x + 0.07, y + 0.4, z + 0.03), (x + 0.07, y + 0.36, z - 0.06)], 0.012, 6),
                  sf.plain(name + '_handle_stripe', '#b89a1e', 0.5)),
    ]
    for side in (-1, 1):
        parts.append(mk.assign(mk.box(name + '_rail', (0.035, 0.08, 1.0), (x + side * (width * 0.5 + 0.05), y - 0.3 - 0.45 * lean, z + 0.3), 0.008), frame))
    return parts


def stick(name, foot, grip_height, metal, grip):
    """A control stick rising from the floor to a shaped grip."""
    x, y, z = foot
    return [
        mk.assign(mk.cylinder(name + '_boot', 0.06, 0.07, (x, y, z + 0.035), 'Z', 12, 0.035), grip),
        mk.assign(mk.tube(name + '_column', [(x, y, z + 0.05), (x, y - 0.02, z + grip_height - 0.13)], 0.014, 8), metal),
        mk.assign(mk.tube(name + '_grip', [(x, y - 0.02, z + grip_height - 0.14), (x, y - 0.035, z + grip_height - 0.04), (x, y - 0.02, z + grip_height)], [0.021, 0.026, 0.02], 8), grip),
    ]


def lever(name, pivot, length, knob, metal, knob_material, lean=20.0):
    """A lever on a console: a thin shaft leaning forward with a knob."""
    x, y, z = pivot
    top = (x, y + length * math.sin(math.radians(lean)), z + length * math.cos(math.radians(lean)))
    return [
        mk.assign(mk.tube(name + '_shaft', [pivot, top], 0.007, 6), metal),
        mk.assign(mk.box(name + '_knob', knob, top, min(knob) * 0.3), knob_material),
    ]


def switch_block(name, centre, size, rows, columns, body, cap):
    """A console block with a grid of small switch caps on top (suggested, not lettered)."""
    x, y, z = centre
    parts = [mk.assign(mk.box(name, size, centre, 0.006), body)]
    for r in range(rows):
        for c in range(columns):
            px = x - size[0] * 0.5 + size[0] * (c + 0.5) / columns
            py = y - size[1] * 0.5 + size[1] * (r + 0.5) / rows
            parts.append(mk.assign(mk.box('%s_cap_%d_%d' % (name, r, c), (0.014, 0.014, 0.022), (px, py, z + size[2] * 0.5 + 0.008)), cap))
    return parts


def exact_extras(a, extras):
    """Scene extras the exporter cannot carry (lists that mix a letter and a number): written into
    the finished .glb after the library's own export, in the contract's exact form."""
    finish = a.finish

    def finish_with_extras(out_path, work_dir, bake=True):
        report = finish(out_path, work_dir, bake)
        with open(out_path, 'rb') as handle:
            data = handle.read()
        length = struct.unpack_from('<I', data, 12)[0]
        document = json.loads(data[20:20 + length].decode('utf-8'))
        rest = data[20 + length:]
        document['scenes'][document.get('scene', 0)].setdefault('extras', {}).update(extras)
        text = json.dumps(document, separators=(',', ':')).encode('utf-8')
        text += b' ' * ((4 - len(text) % 4) % 4)
        with open(out_path, 'wb') as handle:
            handle.write(struct.pack('<4sII', b'glTF', 2, 20 + len(text) + len(rest)) + struct.pack('<I4s', len(text), b'JSON') + text + rest)
        report['bytes'] = os.path.getsize(out_path)
        report['extras'] = sorted(extras)
        return report

    a.finish = finish_with_extras


# =====================================================================================================
# The surface kit of the four aircraft (session 4): charts drawn over the airframe (panel joints that
# follow the structure, fastener rows, hatches, stains in the airflow, wear, stencils), the skin
# materials that read them in the aircraft's own coordinates, and the bake steps the frozen library
# does not have (texel shares per surface, clean occlusion, grime in the recesses, texture packing).
# =====================================================================================================

SCRATCH = '/tmp/marazul/flight/art'

# A plain stroke alphabet for stencils: polylines on a 4 x 6 grid.
_O = [(1, 0), (0, 1), (0, 5), (1, 6), (3, 6), (4, 5), (4, 1), (3, 0), (1, 0)]
_P = [(0, 0), (0, 6), (3, 6), (4, 5), (4, 4), (3, 3), (0, 3)]
GLYPHS = {
    'A': [[(0, 0), (0, 4), (2, 6), (4, 4), (4, 0)], [(0, 2.4), (4, 2.4)]],
    'B': [[(0, 0), (0, 6), (3, 6), (4, 5), (4, 4), (3, 3), (0, 3)], [(3, 3), (4, 2), (4, 1), (3, 0), (0, 0)]],
    'C': [[(4, 5), (3, 6), (1, 6), (0, 5), (0, 1), (1, 0), (3, 0), (4, 1)]],
    'D': [[(0, 0), (0, 6), (2.5, 6), (4, 4.5), (4, 1.5), (2.5, 0), (0, 0)]],
    'E': [[(4, 6), (0, 6), (0, 0), (4, 0)], [(0, 3), (3, 3)]],
    'F': [[(4, 6), (0, 6), (0, 0)], [(0, 3), (3, 3)]],
    'G': [[(4, 5), (3, 6), (1, 6), (0, 5), (0, 1), (1, 0), (3, 0), (4, 1), (4, 3), (2.2, 3)]],
    'H': [[(0, 0), (0, 6)], [(4, 0), (4, 6)], [(0, 3), (4, 3)]],
    'I': [[(2, 0), (2, 6)], [(1, 0), (3, 0)], [(1, 6), (3, 6)]],
    'J': [[(4, 6), (4, 1), (3, 0), (1, 0), (0, 1)]],
    'K': [[(0, 0), (0, 6)], [(4, 6), (0, 2.5)], [(1.5, 3.6), (4, 0)]],
    'L': [[(0, 6), (0, 0), (4, 0)]],
    'M': [[(0, 0), (0, 6), (2, 3), (4, 6), (4, 0)]],
    'N': [[(0, 0), (0, 6), (4, 0), (4, 6)]],
    'O': [_O], 'P': [_P], 'Q': [_O, [(2.5, 1.5), (4, 0)]], 'R': [_P, [(2, 3), (4, 0)]],
    'S': [[(4, 5), (3, 6), (1, 6), (0, 5), (0, 4), (1, 3), (3, 3), (4, 2), (4, 1), (3, 0), (1, 0), (0, 1)]],
    'T': [[(0, 6), (4, 6)], [(2, 6), (2, 0)]],
    'U': [[(0, 6), (0, 1), (1, 0), (3, 0), (4, 1), (4, 6)]],
    'V': [[(0, 6), (2, 0), (4, 6)]],
    'W': [[(0, 6), (1, 0), (2, 4), (3, 0), (4, 6)]],
    'X': [[(0, 0), (4, 6)], [(0, 6), (4, 0)]],
    'Y': [[(0, 6), (2, 3), (4, 6)], [(2, 3), (2, 0)]],
    'Z': [[(0, 6), (4, 6), (0, 0), (4, 0)]],
    '0': [_O, [(1.3, 1.6), (2.7, 4.4)]],
    '1': [[(1, 4.5), (2, 6), (2, 0)], [(1, 0), (3, 0)]],
    '2': [[(0, 5), (1, 6), (3, 6), (4, 5), (4, 4), (0, 0), (4, 0)]],
    '3': [[(0, 5), (1, 6), (3, 6), (4, 5), (4, 4), (3, 3), (1.5, 3)], [(3, 3), (4, 2), (4, 1), (3, 0), (1, 0), (0, 1)]],
    '4': [[(3, 0), (3, 6), (0, 2), (4, 2)]],
    '5': [[(4, 6), (0, 6), (0, 3.5), (3, 3.5), (4, 2.5), (4, 1), (3, 0), (1, 0), (0, 1)]],
    '6': [[(4, 5), (3, 6), (1, 6), (0, 5), (0, 1), (1, 0), (3, 0), (4, 1), (4, 2.5), (3, 3.5), (0, 3.5)]],
    '7': [[(0, 6), (4, 6), (1.5, 0)]],
    '8': [[(1, 3), (0, 4), (0, 5), (1, 6), (3, 6), (4, 5), (4, 4), (3, 3), (1, 3), (0, 2), (0, 1), (1, 0), (3, 0), (4, 1), (4, 2), (3, 3)]],
    '9': [[(0, 1), (1, 0), (3, 0), (4, 1), (4, 5), (3, 6), (1, 6), (0, 5), (0, 3.5), (1, 2.5), (4, 2.5)]],
    '-': [[(0.8, 3), (3.2, 3)]], '.': [[(1.8, 0), (2.2, 0)]], '/': [[(0.5, 0), (3.5, 6)]], ' ': [],
    '>': [[(0, 3), (4, 3)], [(2.2, 5), (4, 3), (2.2, 1)]], '<': [[(0, 3), (4, 3)], [(1.8, 5), (0, 3), (1.8, 1)]],
    '^': [[(2, 0), (2, 6)], [(0.4, 4), (2, 6), (3.6, 4)]],
}
ADVANCE = 5.5


def text_width(text, height):
    """Width in metres of a stencil line of this letter height."""
    return (len(text) * ADVANCE - 1.5) * height / 6.0


def runs(points, keep):
    """Splits a polyline into the stretches whose points keep(p) accepts (clipping a joint to a planform)."""
    out, current = [], []
    for p in points:
        if keep(p):
            current.append(p)
        else:
            if len(current) > 1:
                out.append(current)
            current = []
    if len(current) > 1:
        out.append(current)
    return out


def sampled(start, end, step=0.1):
    """Points every `step` metres on the straight line from start to end."""
    length = math.hypot(end[0] - start[0], end[1] - start[1])
    count = max(1, int(length / step))
    return [(start[0] + (end[0] - start[0]) * i / count, start[1] + (end[1] - start[1]) * i / count) for i in range(count + 1)]


class Chart:
    """A drawing laid over a part of the aircraft, in metres.

    A plane chart measures a along the world axis u and b along v (top view: a = x, b = y; right
    side: a = y, b = z). A roll chart unrolls a body round an axis parallel to Y: a = y, b = the arc
    length from the top centreline at the reference radius (roll = (axis height, radius)).
    Layers, each 0..1: seam (joint grooves), rivet (fastener heads), tone (panel to panel shade,
    0.5 neutral), grime (soot, oil, streaks), wear (eroded or bleached finish), tint (a second finish:
    tape, heat colour, a second paint) and mark (stencil paint, with its ink colour).
    """
    LAYERS = ('seam', 'rivet', 'tone', 'grime', 'wear', 'tint', 'mark')

    def __init__(self, name, lo, hi, ppm, u=(1, 0, 0), v=(0, 1, 0), roll=None, seed=7, ink='#d8d8d0'):
        self.name, self.lo, self.hi, self.ppm, self.u, self.v, self.roll = name, lo, hi, ppm, u, v, roll
        self.size = (max(8, int(round((hi[0] - lo[0]) * ppm))), max(8, int(round((hi[1] - lo[1]) * ppm))))
        self.rng = random.Random(seed)
        self.layer = {k: Image.new('L', self.size, 128 if k == 'tone' else 0) for k in self.LAYERS}
        self.ink_default = ink
        self.rivet_radius = 0.005
        self.ink = None
        self.soft = {}
        self._images = None

    # --- coordinates ---------------------------------------------------------------------------
    def px(self, p):
        return ((p[0] - self.lo[0]) * self.ppm, self.size[1] - (p[1] - self.lo[1]) * self.ppm)

    def grid(self):
        """(a, b) of every pixel centre as two float arrays, for layers computed rather than drawn."""
        a = self.lo[0] + (np.arange(self.size[0], dtype=np.float32) + 0.5) / self.ppm
        b = self.lo[1] + (self.size[1] - 0.5 - np.arange(self.size[1], dtype=np.float32)) / self.ppm
        return np.meshgrid(a, b)

    def put(self, layer, array, mode='lighter'):
        """Merges a computed 0..1 array into a layer: lighter, add, or set (tone: absolute)."""
        image = Image.fromarray((np.clip(array, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8))
        if mode == 'set':
            self.layer[layer] = image
        else:
            self.layer[layer] = (ImageChops.lighter if mode == 'lighter' else ImageChops.add)(self.layer[layer], image)

    def array(self, layer):
        return np.asarray(self.layer[layer], dtype=np.float32) / 255.0

    def _canvas(self, layer, soft):
        if not soft:
            return self.layer[layer]
        key = (layer, max(1, int(round(soft * self.ppm))))
        if key not in self.soft:
            self.soft[key] = Image.new('L', self.size, 0)
        return self.soft[key]

    def _w(self, width):
        return max(1, int(round(width * self.ppm)))

    # --- drawing --------------------------------------------------------------------------------
    def line(self, layer, points, width, value=1.0, soft=0.0):
        ImageDraw.Draw(self._canvas(layer, soft)).line([self.px(p) for p in points], fill=int(value * 255), width=self._w(width), joint='curve')

    def fill(self, layer, points, value=1.0, soft=0.0):
        ImageDraw.Draw(self._canvas(layer, soft)).polygon([self.px(p) for p in points], fill=int(value * 255))

    def dot(self, layer, p, radius, value=1.0, soft=0.0):
        x, y = self.px(p)
        r = max(0.6, radius * self.ppm)
        ImageDraw.Draw(self._canvas(layer, soft)).ellipse([x - r, y - r, x + r, y + r], fill=int(value * 255))

    def rivets(self, points, spacing=0.06, radius=0.005, value=1.0, offset=0.0):
        """Fastener heads every `spacing` metres along a polyline, `offset` metres to its left."""
        carry = spacing * 0.5
        for p, q in zip(points, points[1:]):
            length = math.hypot(q[0] - p[0], q[1] - p[1])
            if length < 1e-6:
                continue
            dx, dy = (q[0] - p[0]) / length, (q[1] - p[1]) / length
            at = carry
            while at <= length:
                self.dot('rivet', (p[0] + dx * at - dy * offset, p[1] + dy * at + dx * offset), radius, value)
                at += spacing
            carry = at - length

    def seam(self, points, width=0.012, value=1.0, rivets=None, row=0.028, closed=False):
        """A joint: its groove and, with rivets = spacing, a fastener row either side."""
        points = list(points) + ([points[0]] if closed else [])
        self.line('seam', points, width, value)
        if rivets:
            for side in (-row, row):
                self.rivets(points, rivets, self.rivet_radius, offset=side)

    def panel(self, points, tone=0.35, seam=1.0, width=0.012, rivets=None, row=0.028):
        """A skin panel: its own shade and its outline joint."""
        if tone:
            self.fill('tone', points, 0.5 + self.rng.uniform(-0.5, 0.5) * tone)
        if seam:
            self.seam(points, width, seam, rivets, row, closed=True)

    def box(self, centre, size, angle=0.0, chamfer=0.0):
        """Corners of a rectangle (chamfered when asked), turned by angle degrees."""
        w, h = size[0] * 0.5, size[1] * 0.5
        c = min(chamfer, w, h)
        local = [(-w + c, -h), (w - c, -h), (w, -h + c), (w, h - c), (w - c, h), (-w + c, h), (-w, h - c), (-w, -h + c)] if c else [(-w, -h), (w, -h), (w, h), (-w, h)]
        ca, sa = math.cos(math.radians(angle)), math.sin(math.radians(angle))
        return [(centre[0] + x * ca - y * sa, centre[1] + x * sa + y * ca) for x, y in local]

    def hatch(self, centre, size, angle=0.0, chamfer=0.03, fasteners=0.09, tone=0.5, seam=1.0, width=0.012, inset=0.03, latch=False):
        """An access door: outline, its own shade, quick-release fasteners inside the edge, optional latches."""
        outline = self.box(centre, size, angle, chamfer)
        self.panel(outline, tone, seam, width)
        if fasteners:
            inner = self.box(centre, (size[0] - 2 * inset, size[1] - 2 * inset), angle, max(chamfer - inset * 0.4, 0.0))
            self.rivets(inner + [inner[0]], fasteners, radius=0.007)
        if latch:
            for corner in self.box(centre, (size[0] * 0.5, size[1] - 0.012), angle)[:2]:
                self.dot('seam', corner, 0.02)
                self.dot('rivet', corner, 0.012)
        return outline

    def streak(self, layer, start, length, width, strength=1.0, direction=(0.0, -1.0), spread=1.8, soft=None, steps=8):
        """A stain drawn out by the airflow from a point: strongest at its source, wider and fainter downstream."""
        norm = math.hypot(direction[0], direction[1]) or 1.0
        dx, dy = direction[0] / norm, direction[1] / norm
        soft = width * 0.4 if soft is None else soft
        for k in range(steps - 1, -1, -1):
            t0, t1 = k / steps, (k + 1.15) / steps
            value = strength * (1.0 - t0) ** 1.5
            w = width * (1.0 + (spread - 1.0) * t0)
            self.line(layer, [(start[0] + dx * length * t0, start[1] + dy * length * t0), (start[0] + dx * length * t1, start[1] + dy * length * t1)], w, value, soft)

    def streaks(self, layer, points, count, length, width, strength=(0.3, 0.9), direction=(0.0, -1.0), spread=1.8):
        """Random streaks starting on a polyline (a hinge line, a door edge, a row of drains)."""
        for _ in range(count):
            k = self.rng.randrange(len(points) - 1)
            f = self.rng.random()
            start = (points[k][0] + (points[k + 1][0] - points[k][0]) * f, points[k][1] + (points[k + 1][1] - points[k][1]) * f)
            self.streak(layer, start, self.rng.uniform(*length), self.rng.uniform(*width), self.rng.uniform(*strength), direction, spread)

    def _inked(self, color):
        if self.ink is None:
            self.ink = Image.new('RGB', self.size, _rgb8(self.ink_default))
        return _rgb8(color or self.ink_default)

    def mark_line(self, points, width, color=None, value=1.0):
        """Painted line work (walkway borders, arrows, door outlines)."""
        rgb = self._inked(color)
        ImageDraw.Draw(self.ink).line([self.px(p) for p in points], fill=rgb, width=self._w(width) + 4, joint='curve')
        self.line('mark', points, width, value)

    def mark_fill(self, points, color=None, value=1.0):
        rgb = self._inked(color)
        draw = ImageDraw.Draw(self.ink)
        draw.polygon([self.px(p) for p in points], fill=rgb)
        draw.line([self.px(p) for p in list(points) + [points[0]]], fill=rgb, width=5)
        self.fill('mark', points, value)

    def text(self, text, position, height, right=(1.0, 0.0), up=None, color=None, value=1.0, weight=0.15, align='left'):
        """A stencilled line: position is the baseline's left end (or its middle), right and up the reading directions."""
        norm = math.hypot(right[0], right[1])
        right = (right[0] / norm, right[1] / norm)
        up = up or (-right[1], right[0])
        unit = height / 6.0
        shift = -0.5 * text_width(text, height) if align == 'center' else 0.0
        for index, char in enumerate(text.upper()):
            for stroke in GLYPHS.get(char, []):
                points = []
                for gx, gy in stroke:
                    along = shift + (index * ADVANCE + gx) * unit
                    points.append((position[0] + right[0] * along + up[0] * gy * unit, position[1] + right[1] * along + up[1] * gy * unit))
                self.mark_line(points, height * weight, color, value)

    # --- output ---------------------------------------------------------------------------------
    def images(self, asset_id):
        """Writes the layers as three working textures and returns them loaded: (joints, stains, marks, ink or None)."""
        if self._images:
            return self._images
        for (layer, radius), image in self.soft.items():
            self.layer[layer] = ImageChops.add(self.layer[layer], image.filter(ImageFilter.GaussianBlur(radius)))
        for layer in ('seam', 'rivet', 'mark'):
            self.layer[layer] = self.layer[layer].filter(ImageFilter.GaussianBlur(0.55))
        folder = os.path.join(SCRATCH, asset_id, 'charts')
        os.makedirs(folder, exist_ok=True)

        def load(suffix, image, data=True):
            path = os.path.join(folder, '%s_%s.png' % (self.name, suffix))
            image.save(path, compress_level=1)
            loaded = bpy.data.images.load(path, check_existing=False)
            loaded.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
            return loaded

        joints = load('joints', Image.merge('RGB', (self.layer['seam'], self.layer['rivet'], self.layer['tone'])))
        stains = load('stains', Image.merge('RGB', (self.layer['grime'], self.layer['wear'], self.layer['tint'])))
        marks = load('marks', Image.merge('RGB', (self.layer['mark'],) * 3)) if self.ink is not None else None
        ink = None
        if self.ink is not None and len(self.ink.getcolors(64) or range(9)) > 1:
            ink = load('ink', self.ink, data=False)
        self._images = (joints, stains, marks, ink)
        return self._images


def _rgb8(color):
    color = color.lstrip('#')
    return tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))


class _Nodes:
    """Short hands for building a node tree: every value may be a number, a colour or another node's output."""

    def __init__(self, tree):
        self.tree = tree

    def node(self, kind, **settings):
        node = self.tree.nodes.new(kind)
        for key, value in settings.items():
            setattr(node, key, value)
        return node

    def put(self, socket, value):
        if isinstance(value, bpy.types.NodeSocket):
            self.tree.links.new(value, socket)
        elif isinstance(value, (int, float)) and socket.type in ('RGBA', 'VECTOR'):
            socket.default_value = (value, value, value, 1.0)[:len(socket.default_value)]
        else:
            socket.default_value = value

    def math(self, operation, a, b=None, clamp=False):
        node = self.node('ShaderNodeMath', operation=operation, use_clamp=clamp)
        self.put(node.inputs[0], a)
        if b is not None:
            self.put(node.inputs[1], b)
        return node.outputs[0]

    def mix(self, factor, a, b, mode='MIX'):
        node = self.node('ShaderNodeMix', data_type='RGBA', blend_type=mode, clamp_factor=True)
        for socket, value in ((node.inputs[0], factor), (node.inputs[6], a), (node.inputs[7], b)):
            self.put(socket, value)
        return node.outputs[2]

    def lerp(self, factor, a, b):
        node = self.node('ShaderNodeMix', data_type='FLOAT', clamp_factor=True)
        for socket, value in ((node.inputs[0], factor), (node.inputs[2], a), (node.inputs[3], b)):
            self.put(socket, value)
        return node.outputs[0]

    def ramp(self, value, low, high, to_low=0.0, to_high=1.0, clamp=True):
        node = self.node('ShaderNodeMapRange', clamp=clamp)
        for socket, v in zip(node.inputs[:5], (value, low, high, to_low, to_high)):
            self.put(socket, v)
        return node.outputs[0]

    def noise(self, vector, scale, detail=3.0, roughness=0.55, stretch=None):
        if stretch:
            mapping = self.node('ShaderNodeMapping')
            mapping.inputs['Scale'].default_value = stretch
            self.tree.links.new(vector, mapping.inputs['Vector'])
            vector = mapping.outputs['Vector']
        node = self.node('ShaderNodeTexNoise')
        node.inputs['Scale'].default_value = scale
        node.inputs['Detail'].default_value = detail
        node.inputs['Roughness'].default_value = roughness
        self.tree.links.new(vector, node.inputs['Vector'])
        return node.outputs['Fac']

    def combine(self, x, y, z):
        node = self.node('ShaderNodeCombineXYZ')
        for socket, value in zip(node.inputs, (x, y, z)):
            self.put(socket, value)
        return node.outputs[0]

    def dot(self, vector, axis):
        node = self.node('ShaderNodeVectorMath', operation='DOT_PRODUCT')
        self.tree.links.new(vector, node.inputs[0])
        node.inputs[1].default_value = axis
        return node.outputs['Value']

    def image(self, image, vector, cubic=False):
        node = self.node('ShaderNodeTexImage', image=image, extension='EXTEND', interpolation='Cubic' if cubic else 'Linear')
        self.tree.links.new(vector, node.inputs['Vector'])
        split = self.node('ShaderNodeSeparateColor')
        self.tree.links.new(node.outputs['Color'], split.inputs['Color'])
        return node.outputs['Color'], split.outputs[0], split.outputs[1], split.outputs[2]


def _arc(n, chart, x, z):
    """Arc length round a roll chart's axis (height, reference radius and optionally the axis' x) from its top line."""
    across = n.math('SUBTRACT', x, chart.roll[2]) if len(chart.roll) > 2 else x
    return n.math('MULTIPLY', n.math('ARCTAN2', across, n.math('SUBTRACT', z, chart.roll[0])), chart.roll[1])


def _chart_vector(n, chart, x, y, z, position, normal_z=None):
    """The chart's texture coordinate of the shaded point.

    Two optional extras let ONE material (a tintable paint, which the game knows by its name) read
    several drawings from one chart: chart.under = offset draws faces that look down `offset` metres
    further along b (the underside of a wing beside its top); chart.annex = (y_max, z_floor, slope,
    b_origin) draws everything behind y_max and above the line z_floor + slope * (y_max - y) in side
    view at b = b_origin + z (a fin standing on an unrolled body)."""
    if chart.roll:
        a = y
        b = _arc(n, chart, x, z)
    else:
        a, b = n.dot(position, chart.u), n.dot(position, chart.v)
    if getattr(chart, 'under', None) and normal_z is not None:
        b = n.math('ADD', b, n.math('MULTIPLY', n.math('LESS_THAN', normal_z, -0.02), chart.under))
    if getattr(chart, 'annex', None):
        y_max, z_floor, slope, b_origin = chart.annex
        above = n.math('GREATER_THAN', z, n.math('ADD', z_floor, n.math('MULTIPLY', n.math('SUBTRACT', y_max, y), slope)))
        b = n.lerp(n.math('MULTIPLY', above, n.math('LESS_THAN', y, y_max)), b, n.math('ADD', z, b_origin))
    return n.combine(n.ramp(a, chart.lo[0], chart.hi[0], clamp=False), n.ramp(b, chart.lo[1], chart.hi[1], clamp=False), 0.0)


def skin(name, color, asset_id, chart=None, decal=None, roughness=0.5, metallic=0.0, symmetric=True, mottle=0.1, gloss=0.16, sheen=(),
         tone=0.14, tone_gloss=0.1, wear_color='#8a8d90', wear_rough=0.5, wear_metal=None, wear=1.0, grime_color='#15110d', grime_rough=0.78,
         grime=0.9, tint_color=None, tint_rough=None, tint_metal=None, tint_height=0.0, seam_depth=0.004, seam_dark=0.7, rivet_depth=0.0012,
         grain=0.0004, dust=0.2, dust_color='#6d6558', ribs=None, paint_color=None, flow=(1.0, 0.07, 1.0)):
    """A skin with a history, read from a Chart in the aircraft's own coordinates (so it runs unbroken
    over hinged parts and mirrored halves): mottled coat, panel-to-panel shade and gloss, joints and
    fasteners in the normal map, chipped wear, stains broken up along the airflow, stencils that wear
    with the paint. decal: a second chart whose marks only are used, read unmirrored (lettering).
    sheen: [(hex, share)] colours the coat drifts to in broad patches. ribs: (period, depth, 'a' | 'b')
    presses stiffening corrugations along the chart into the skin where its tint layer says so.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    shader = next(node for node in tree.nodes if node.type == 'BSDF_PRINCIPLED')
    n = _Nodes(tree)
    geometry = n.node('ShaderNodeNewGeometry')
    split = n.node('ShaderNodeSeparateXYZ')
    tree.links.new(geometry.outputs['Position'], split.inputs[0])
    x_true, y, z = split.outputs
    x = n.math('ABSOLUTE', x_true) if symmetric else x_true
    position = n.combine(x, y, z)
    base = sf.hex_color(color)

    broad = n.ramp(n.noise(position, 0.45, 4.0), 0.3, 0.7)
    cloud = n.ramp(n.noise(position, 1.3, 1.5, 0.45), 0.25, 0.75)
    flowing = n.ramp(n.noise(position, 5.0, 4.0, 0.6, flow), 0.3, 0.72)
    fine = n.noise(position, 60.0, 2.0, 0.5)
    chips = n.noise(position, 38.0, 3.0, 0.7)
    colour = n.mix(broad, tuple(c * (1.0 - mottle) for c in base[:3]) + (1.0,), tuple(min(1.0, c * (1.0 + 0.6 * mottle)) for c in base[:3]) + (1.0,))
    for index, (hue, share) in enumerate(sheen):
        patch = n.ramp(n.noise(position, 0.16 + 0.07 * index, 2.0, 0.5, (1.0, 1.0, 3.0)), 0.42, 0.72)
        colour = n.mix(n.math('MULTIPLY', patch, share), colour, sf.hex_color(hue))
    rough = n.math('ADD', roughness, n.ramp(cloud, 0.0, 1.0, -gloss, gloss))
    metal = metallic
    height = n.math('MULTIPLY', fine, grain)

    seam = rivet = tone_layer = grime_layer = wear_layer = tint_layer = None
    if chart is not None:
        joints, stains, marks, ink = chart.images(asset_id)
        facing = n.node('ShaderNodeSeparateXYZ')
        tree.links.new(geometry.outputs['Normal'], facing.inputs[0])
        vector = _chart_vector(n, chart, x, y, z, position, facing.outputs[2])
        _, seam, rivet, tone_layer = n.image(joints, vector, cubic=True)
        _, grime_layer, wear_layer, tint_layer = n.image(stains, vector)
        shade = n.ramp(tone_layer, 0.0, 1.0, 1.0 - tone, 1.0 + tone, clamp=False)
        colour = n.mix(1.0, colour, shade, 'MULTIPLY')
        rough = n.math('ADD', rough, n.ramp(tone_layer, 0.0, 1.0, tone_gloss, -tone_gloss, clamp=False))
        if tint_color is not None:
            colour = n.mix(tint_layer, colour, sf.hex_color(tint_color))
            if tint_rough is not None:
                rough = n.lerp(tint_layer, rough, tint_rough)
            if tint_metal is not None:
                metal = n.lerp(tint_layer, metal, tint_metal)
            if tint_height:
                height = n.math('ADD', height, n.math('MULTIPLY', tint_layer, tint_height))
        if ribs:
            period, depth, along = ribs
            coordinate = (n.dot(position, chart.u) if along == 'a' else n.dot(position, chart.v)) if not chart.roll else (y if along == 'a' else _arc(n, chart, x, z))
            wave = n.math('ABSOLUTE', n.math('SINE', n.math('MULTIPLY', coordinate, math.pi / period)))
            pressed = n.math('MULTIPLY', n.math('SUBTRACT', 1.0, tint_layer) if tint_color is not None else 1.0, n.math('MULTIPLY', wave, depth))
            height = n.math('ADD', height, pressed)
        if marks is not None:
            stencil = n.math('MULTIPLY', n.image(marks, vector)[1], n.ramp(chips, 0.3, 0.5, 0.35, 1.0))
            colour = n.mix(stencil, colour, n.image(ink, vector)[0] if ink is not None else sf.hex_color(chart.ink_default))
    if decal is not None:
        _, _, marks, ink = decal.images(asset_id)
        if marks is not None:
            vector = _chart_vector(n, decal, x_true, y, z, geometry.outputs['Position'])
            inside = n.math('MULTIPLY', n.math('MULTIPLY', n.math('GREATER_THAN', vector.node.inputs[0].links[0].from_socket, 0.0),
                                               n.math('LESS_THAN', vector.node.inputs[0].links[0].from_socket, 1.0)),
                            n.math('MULTIPLY', n.math('GREATER_THAN', vector.node.inputs[1].links[0].from_socket, 0.0),
                                   n.math('LESS_THAN', vector.node.inputs[1].links[0].from_socket, 1.0)))
            stencil = n.math('MULTIPLY', n.math('MULTIPLY', n.image(marks, vector)[1], inside), n.ramp(chips, 0.3, 0.5, 0.4, 1.0))
            colour = n.mix(stencil, colour, n.image(ink, vector)[0] if ink is not None else sf.hex_color(decal.ink_default))
    # Dust that settles everywhere, drawn out along the airflow.
    colour = n.mix(n.math('MULTIPLY', n.ramp(flowing, 0.45, 1.0), dust), colour, sf.hex_color(dust_color))
    if chart is not None:
        worn = n.math('MULTIPLY', n.ramp(n.math('SUBTRACT', n.math('MULTIPLY', wear_layer, 1.35), chips), 0.0, 0.14), wear)
        colour = n.mix(worn, colour, sf.hex_color(wear_color))
        rough = n.lerp(worn, rough, wear_rough)
        if wear_metal is not None:
            metal = n.lerp(worn, metal, wear_metal)
        height = n.math('SUBTRACT', height, n.math('MULTIPLY', worn, 0.0004))
        stained = n.math('MULTIPLY', n.math('MULTIPLY', grime_layer, n.ramp(flowing, 0.0, 1.0, 0.55, 1.3, clamp=False), clamp=True), grime)
        colour = n.mix(stained, colour, sf.hex_color(grime_color))
        rough = n.lerp(stained, rough, grime_rough)
        if metallic or wear_metal is not None or tint_metal is not None:
            metal = n.lerp(stained, metal, 0.0)
        colour = n.mix(n.math('MULTIPLY', seam, seam_dark), colour, tuple(c * 0.22 for c in base[:3]) + (1.0,))
        colour = n.mix(n.math('MULTIPLY', rivet, 0.45), colour, tuple(c * 0.45 for c in base[:3]) + (1.0,))
        rough = n.lerp(n.math('MULTIPLY', seam, 0.8), rough, 0.9)
        height = n.math('SUBTRACT', height, n.math('ADD', n.math('MULTIPLY', seam, seam_depth), n.math('MULTIPLY', rivet, rivet_depth)))
    bump = n.node('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 1.0
    bump.inputs['Distance'].default_value = 1.0
    n.put(bump.inputs['Height'], height)
    n.put(shader.inputs['Base Color'], colour)
    n.put(shader.inputs['Roughness'], n.math('MAXIMUM', n.math('MINIMUM', rough, 1.0), 0.04))
    n.put(shader.inputs['Metallic'], metal)
    tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    if paint_color is not None:
        mat['paint_color'] = list(sf.hex_color(paint_color))
    return mat


def stencil_plate(planform, asset_id, name, lines, centre, right, height, color, material, upper=True):
    """A stencilled marking that must read the right way round on its own side of a mirrored skin: a
    thin plate lying on the planform's skin, with a small chart of its own for the lettering.
    material(chart) -> the plate's material (the skin's own finish with decal=chart). right is the
    reading direction in plan; under the wing the lines read from below."""
    norm = math.hypot(right[0], right[1])
    right = (right[0] / norm, right[1] / norm)
    up = (-right[1], right[0]) if upper else (right[1], -right[0])
    half_w = 0.5 * max(text_width(line, height) for line in lines) + 0.05
    half_h = 0.5 * (len(lines) * 1.6 - 0.6) * height + 0.05
    corners = [(centre[0] + sx * right[0] * half_w + sy * up[0] * half_h, centre[1] + sx * right[1] * half_w + sy * up[1] * half_h) for sx in (-1, 1) for sy in (-1, 1)]
    x0, x1 = min(c[0] for c in corners), max(c[0] for c in corners)
    y0, y1 = min(c[1] for c in corners), max(c[1] for c in corners)
    chart = Chart('stencil_' + name, (x0, y0), (x1, y1), min(800.0, max(200.0, 45.0 / height)), ink=color)
    for index, line in enumerate(lines):
        drop = ((len(lines) - 1) * 0.5 - index) * 1.6 * height - 0.5 * height
        chart.text(line, (centre[0] + up[0] * drop, centre[1] + up[1] * drop), height, right, up, align='center')
    plate = planform.patch('stencil_' + name, x0, x1, y0, y1, upper=upper, lift=0.006, nx=max(1, math.ceil((x1 - x0) / 0.4)), ny=max(1, math.ceil((y1 - y0) / 0.4)))
    return mk.assign(plate, material(chart))


def heat_metal(name, y_cool, y_hot, color='#6f6a66', roughness=0.5, rings=None, petals=None):
    """Exhaust metal: from clean alloy at y_cool through faint straw, purple and blue heat colours to soot at y_hot.
    rings: spacing of hoops along the flow; petals: (count, axis height) of the nozzle's overlapping leaves."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    shader = next(node for node in tree.nodes if node.type == 'BSDF_PRINCIPLED')
    n = _Nodes(tree)
    geometry = n.node('ShaderNodeNewGeometry')
    split = n.node('ShaderNodeSeparateXYZ')
    tree.links.new(geometry.outputs['Position'], split.inputs[0])
    position = n.combine(n.math('ABSOLUTE', split.outputs[0]), split.outputs[1], split.outputs[2])
    blotch = n.noise(position, 3.0, 3.0, 0.55, (1.0, 0.5, 1.0))
    travel = n.math('ADD', n.ramp(split.outputs[1], y_cool, y_hot, clamp=False), n.ramp(blotch, 0.0, 1.0, -0.13, 0.13))
    band = n.node('ShaderNodeValToRGB')
    stops = ((0.0, color), (0.28, '#6a6152'), (0.46, '#51454b'), (0.6, '#3d4350'), (0.76, '#2b2b2e'), (1.0, '#121110'))
    elements = band.color_ramp.elements
    while len(elements) < len(stops):
        elements.new(0.5)
    for element, (at, hue) in zip(elements, stops):
        element.position, element.color = at, sf.hex_color(hue)
    tree.links.new(travel, band.inputs['Fac'])
    soot = n.ramp(travel, 0.78, 1.0)
    height = n.math('MULTIPLY', n.noise(position, 45.0, 2.0), 0.0006)
    if rings:
        hoops = n.math('ABSOLUTE', n.math('SINE', n.math('MULTIPLY', split.outputs[1], math.pi / rings)))
        height = n.math('ADD', height, n.math('MULTIPLY', n.math('POWER', hoops, 0.3), 0.003))
    colour = band.outputs['Color']
    if petals:
        count, axis_z = petals[:2]
        across = n.math('SUBTRACT', n.math('ABSOLUTE', split.outputs[0]), petals[2]) if len(petals) > 2 else split.outputs[0]
        angle = n.math('ARCTAN2', across, n.math('SUBTRACT', split.outputs[2], axis_z))
        leaf = n.math('POWER', n.math('ABSOLUTE', n.math('SINE', n.math('MULTIPLY', angle, count * 0.5))), 0.35)
        height = n.math('ADD', height, n.math('MULTIPLY', leaf, 0.004))
        colour = n.mix(n.ramp(leaf, 0.0, 0.6, 0.6, 0.0), colour, sf.hex_color('#0c0b0b'))
    bump = n.node('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 1.0
    bump.inputs['Distance'].default_value = 1.0
    n.put(bump.inputs['Height'], height)
    n.put(shader.inputs['Base Color'], colour)
    n.put(shader.inputs['Roughness'], n.math('ADD', n.lerp(soot, roughness, 0.9), n.ramp(blotch, 0.0, 1.0, -0.1, 0.1)))
    n.put(shader.inputs['Metallic'], n.lerp(soot, 0.85, 0.15))
    tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    return mat


def tyre_rubber(name='tyre', groove=0.05):
    """A used tyre (axle along X): tread grooves, a dusty grey tread scuffed by the runway, darker sidewalls."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    shader = next(node for node in tree.nodes if node.type == 'BSDF_PRINCIPLED')
    n = _Nodes(tree)
    geometry = n.node('ShaderNodeNewGeometry')
    split = n.node('ShaderNodeSeparateXYZ')
    tree.links.new(geometry.outputs['Position'], split.inputs[0])
    normal = n.node('ShaderNodeSeparateXYZ')
    tree.links.new(geometry.outputs['Normal'], normal.inputs[0])
    tread = n.ramp(n.math('ABSOLUTE', normal.outputs[0]), 0.25, 0.6, 1.0, 0.0)
    cut = n.math('MULTIPLY', n.ramp(n.math('ABSOLUTE', n.math('SINE', n.math('MULTIPLY', split.outputs[0], math.pi / groove))), 0.0, 0.28, 1.0, 0.0), tread)
    scuff = n.ramp(n.noise(geometry.outputs['Position'], 14.0, 4.0, 0.65, (0.4, 1.0, 1.0)), 0.35, 0.7)
    colour = n.mix(n.math('MULTIPLY', tread, n.ramp(scuff, 0.0, 1.0, 0.35, 0.9)), sf.hex_color('#0d0d0e'), sf.hex_color('#3a3833'))
    colour = n.mix(cut, colour, sf.hex_color('#050505'))
    bump = n.node('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 1.0
    bump.inputs['Distance'].default_value = 1.0
    n.put(bump.inputs['Height'], n.math('ADD', n.math('MULTIPLY', cut, -0.004), n.math('MULTIPLY', n.noise(geometry.outputs['Position'], 90.0, 2.0), 0.0005)))
    n.put(shader.inputs['Base Color'], colour)
    n.put(shader.inputs['Roughness'], n.lerp(tread, 0.72, n.ramp(scuff, 0.0, 1.0, 0.8, 0.95)))
    tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    return mat


# --- the bake steps -----------------------------------------------------------------------------------

_ACTIVE = {}


def detail_pipeline(a, density=None, quality=None, occlusion_samples=24, cavity=0.55, shade=0.36):
    """Turns on, for the asset `a`, what the frozen library's bake lacks:

    density(node name, world centre, world normal, material name) -> the linear texel share of a face
    (1 = the common density; UV islands are rescaled and packed again, so what is seen most gets most);
    a cleaned ambient-occlusion pass that also gathers grime in the recesses (cavity 0..1) and shades
    the base colour (shade); quality = {'base': q, 'orm': q, 'normal': q}: the WebP quality each texture
    is packed with into the finished .glb (from the lossless working files, not from the exporter's copy).
    """
    _ACTIVE.clear()
    _ACTIVE.update(asset=a, density=density, samples=occlusion_samples, cavity=cavity, shade=shade)
    if not getattr(atlasbake, 'detail_kit', False):
        library_unwrap, library_bake = atlasbake.unwrap, atlasbake.bake

        def mine(objs):
            asset = _ACTIVE.get('asset')
            return bool(objs) and asset is not None and any(objs[0] is m for m in asset.meshes)

        def unwrap(objs, margin=0.004):
            library_unwrap(objs, margin)
            if mine(objs) and _ACTIVE.get('density'):
                _share_texels(objs, _ACTIVE['density'], margin)

        def bake(objs, size, work_dir, **options):
            if not mine(objs):
                return library_bake(objs, size, work_dir, **options)
            paths = library_bake(objs, size, work_dir, occlusion_samples=_ACTIVE['samples'], occlusion_in_color=0.0)
            _settle(paths, _ACTIVE['cavity'], _ACTIVE['shade'])
            return paths

        atlasbake.unwrap, atlasbake.bake, atlasbake.detail_kit = unwrap, bake, True
    finish = a.finish

    def finish_packed(out_path, work_dir, bake=True):
        report = finish(out_path, work_dir, bake)
        if bake and quality:
            report['textures'] = pack_textures(out_path, work_dir, quality)
            report['bytes'] = os.path.getsize(out_path)
        return report

    a.finish = finish_packed


def _share_texels(objs, density, margin):
    """Rescales every UV island by the texel share of its faces and packs the atlas again."""
    from bpy_extras import mesh_utils
    for obj in objs:
        mesh = obj.data
        uv = mesh.uv_layers.active.data
        turn = obj.matrix_world.to_3x3()
        names = [m.name for m in mesh.materials]
        for island in mesh_utils.mesh_linked_uv_islands(mesh):
            area = weighted = 0.0
            for index in island:
                poly = mesh.polygons[index]
                material = names[poly.material_index] if names else ''
                share = 0.06 if sf.role_of(material) in ('glass', 'lamp', 'screen') else density(obj.name, obj.matrix_world @ poly.center, (turn @ poly.normal).normalized(), material)
                area += poly.area
                weighted += poly.area * share
            scale = weighted / area if area > 0 else 1.0
            if abs(scale - 1.0) < 1e-3:
                continue
            loops = [loop for index in island for loop in mesh.polygons[index].loop_indices]
            cu = sum(uv[loop].uv[0] for loop in loops) / len(loops)
            cv = sum(uv[loop].uv[1] for loop in loops) / len(loops)
            for loop in loops:
                u, v = uv[loop].uv
                uv[loop].uv = (cu + (u - cu) * scale, cv + (v - cv) * scale)
    mk._activate(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def _linear(srgb):
    return np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)


def _settle(paths, cavity, shade):
    """Cleans the occlusion pass of its sampling noise, shades the base colour with it and lets grime
    (dark, dull, not metallic) gather where the airframe is most enclosed: joints of wing and body,
    gear legs, intakes, hinge gaps."""
    base = np.asarray(Image.open(paths['base']).convert('RGB'), dtype=np.float32) / 255.0
    orm = np.asarray(Image.open(paths['orm']).convert('RGB'), dtype=np.float32) / 255.0
    noisy = Image.fromarray((orm[..., 0] * 255.0 + 0.5).astype(np.uint8))
    occlusion = np.asarray(noisy.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float32) / 255.0
    covered = orm[..., 0] > 0.0
    occlusion = np.where(covered, occlusion, orm[..., 0])
    dirt = (np.clip((0.86 - occlusion) / 0.5, 0.0, 1.0) ** 1.25 * cavity * covered)[..., None]
    colour = _linear(base) * (1.0 - shade * (1.0 - occlusion))[..., None]
    colour = colour * (1.0 - 0.8 * dirt) + np.array([0.035, 0.028, 0.021], dtype=np.float32) * 0.8 * dirt
    rough = orm[..., 1] + (0.93 - orm[..., 1]) * 0.75 * dirt[..., 0]
    metal = orm[..., 2] * (1.0 - 0.7 * dirt[..., 0])
    atlasbake._save(atlasbake._srgb(colour), paths['base'])
    atlasbake._save(np.stack([occlusion, rough, metal], axis=-1), paths['orm'])


def pack_textures(path, work_dir, quality):
    """Re-encodes the .glb's base / orm / normal images from the working PNGs at the given WebP qualities."""
    with open(path, 'rb') as handle:
        data = handle.read()
    length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + length].decode('utf-8'))
    binary = data[20 + length + 8:]
    views = document['bufferViews']
    blobs = [binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in views]
    sizes = {}
    for image in document.get('images', []):
        source = os.path.join(work_dir, image.get('name', '') + '.png')
        if image.get('name') in quality and os.path.exists(source) and 'bufferView' in image:
            packed = io.BytesIO()
            Image.open(source).convert('RGB').save(packed, 'WEBP', quality=quality[image['name']], method=6)
            blobs[image['bufferView']] = packed.getvalue()
            image['mimeType'] = 'image/webp'
            sizes[image['name']] = len(blobs[image['bufferView']])
    out = bytearray()
    for view, blob in zip(views, blobs):
        out += b'\x00' * ((4 - len(out) % 4) % 4)
        view['byteOffset'], view['byteLength'] = len(out), len(blob)
        out += blob
    out += b'\x00' * ((4 - len(out) % 4) % 4)
    document['buffers'][0]['byteLength'] = len(out)
    text = json.dumps(document, separators=(',', ':')).encode('utf-8')
    text += b' ' * ((4 - len(text) % 4) % 4)
    with open(path, 'wb') as handle:
        handle.write(struct.pack('<4sII', b'glTF', 2, 28 + len(text) + len(out)) + struct.pack('<I4s', len(text), b'JSON') + text
                     + struct.pack('<I4s', len(out), b'BIN\x00') + bytes(out))
    return sizes
