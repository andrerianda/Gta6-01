"""Shared builders of the two big jets (manta_sombra, garza_negra): wings lofted span-wise through
a planform given as functions, hinged surfaces cut out of them, faceted glazing shells with window
holes, landing gear, cockpit furniture, and the scene extras the exporter cannot write by itself.

Blender axes: Z up, nose +Y, right wing +X. A planform is described by functions of the span
position x (0 at the centreline): le(x) and te(x) give the leading and trailing edge (y), zc(x) the
height of the chord line, thick(x) the thickness as a share of the chord.
"""
import json
import math
import os
import struct

import bmesh
from mathutils import Vector

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
    """A wheel on an axle along X: a rounded tyre and a dished hub."""
    t = mk.cylinder(name, radius, width, centre, 'X', 20)
    mk.bevel(t, min(width, radius) * 0.22, 3)
    mk.assign(t, tyre)
    h = mk.cylinder(name + '_hub', radius * 0.55, width * 1.04, centre, 'X', 14)
    mk.assign(h, hub)
    return [t, h]


def gear_leg(name, hinge, axle_z, wheels_x, radius, width, metal, tyre, hub, strut=0.09, bogie=None, lamp=None):
    """A landing-gear leg: oleo strut from the hinge down to the axle, brace, torque link and wheels.

    hinge: (x, y, z) of the retraction hinge (the node's origin); wheels_x: axle offsets of the
    wheels from the leg; bogie: None or the fore-and-aft distance between two axles; lamp: a
    material for a landing lamp on the leg, or None.
    """
    hx, hy, hz = hinge
    parts = [
        mk.assign(mk.cylinder(name + '_outer', strut, (hz - axle_z) * 0.55, (hx, hy, hz - (hz - axle_z) * 0.275), 'Z', 14), metal),
        mk.assign(mk.cylinder(name + '_oleo', strut * 0.62, (hz - axle_z) * 0.5, (hx, hy, axle_z + (hz - axle_z) * 0.25), 'Z', 12), hub),
        mk.assign(mk.tube(name + '_brace', [(hx, hy - (hz - axle_z) * 0.45, hz - 0.02), (hx, hy - 0.02, axle_z + (hz - axle_z) * 0.5)], strut * 0.45, 8), metal),
        mk.assign(mk.tube(name + '_link', [(hx, hy + strut, axle_z + (hz - axle_z) * 0.42), (hx, hy + strut * 3.2, axle_z + (hz - axle_z) * 0.24),
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
        parts.append(mk.assign(mk.cylinder(name + '_lamp', 0.09, 0.07, (hx, hy + strut + 0.05, hz - (hz - axle_z) * 0.35), 'Y', 12), lamp))
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
