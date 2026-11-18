"""Plant building tools shared by the vegetation scripts (a helper module, not an asset).

Every plant file is made the same way. make() bakes PIECES of texture: a straight length of
bark, a few flat cards that take colour, normals, occlusion and their cut-out shape from
modelled leaves (see _foliage.py), a patch of ground litter, and one small IMPOSTOR card per
variant, baked from the whole detailed plant. assemble() then builds the game meshes from those
pieces with a Shape: level 0 for near, level 1 at about a quarter of the triangles and level 2,
the impostor on crossed cards. All levels and all variants of a file share its one atlas.

Node names: variant_a_lod0, variant_a_lod1, variant_a_lod2, variant_b_lod0 ... (the pipeline's
<part>_lod<n> scheme with the variant as the part), or <plant>_lod<n> in a file of several plants.

Vertex colour (COLOR_0) of every plant mesh, linear values:
    R       shade: darkness inside the crown, multiplied into the base colour by the game
    G       R times a warmth factor (1 = neutral; lower turns a leaf yellow or brown)
    B       R times (1 - wind / 2): the WIND MASK, wind = 2 * (1 - B / R), from 0 on trunks,
            roots and the ground to 1 at leaf and frond tips. Stock rendering only sees a
            leaf tip lose a little blue.
    A       1

Blender axes: Z up. Plants stand on Z = 0 at the origin.
"""
import math
import random

import bpy
import numpy as np
from mathutils import Vector

from lib import build, profiles, scene

ATLAS = 'atlas'
CUTOUT = 'cutout'
UP = Vector((0.0, 0.0, 1.0))
GOLDEN_ANGLE = math.radians(137.5)
VARIANT_LETTERS = 'abcdef'


def variant_name(index, level):
    """The node name of a variant at a level: variant_a_lod0, variant_b_lod2 ..."""
    return f'variant_{VARIANT_LETTERS[index]}_lod{level}'


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(value, low=0.0, high=1.0):
    return max(low, min(high, value))


def smoothstep(edge0, edge1, x):
    return profiles.smoothstep(edge0, edge1, x)


def unit(vector, fallback=UP):
    vector = Vector(vector)
    return vector.normalized() if vector.length > 1e-9 else Vector(fallback)


def foliage_light(centre, up=0.3, keep=0.0, out=1.0):
    """Stored normals for leaves that must read green from below (for Shape.grid's `light`).

    Real leaves glow when the sun or sky shines through them; the game's double-sided cutout
    material has no translucency and negates the normal on a card's back, so the underside
    of a crown seen from the street faced the ground and read black. These normals point
    out from the vertical axis through `centre` (horizontally) and a little up, mixed with
    `keep` of the card's own normal, so whichever side the camera sees gets about half the
    sky and the low sun on its side of the crown, never only the ground."""
    centre = Vector(centre)

    def light(point, normal):
        radial = Vector((point.x - centre.x, point.y - centre.y, 0.0))
        radial = radial.normalized() if radial.length > 1e-6 else Vector((0.0, 0.0, 0.0))
        return unit(radial * out + Vector(normal) * keep + UP * up)
    return light


def polar(radius, angle, z=0.0):
    """A point at `radius` and `angle` around the Z axis."""
    return Vector((radius * math.cos(angle), radius * math.sin(angle), z))


def _value(spec, i, j, point):
    """A per-vertex value from a number, a function of the position, a list per row or a nested
    list per row and column."""
    if callable(spec):
        return spec(point)
    if isinstance(spec, (int, float)):
        return spec
    row = spec[i]
    return row if isinstance(row, (int, float)) else row[j]


# ---------------------------------------------------------------------------------------------
# Shape: the game geometry of one level of one plant
# ---------------------------------------------------------------------------------------------

class Shape:
    """Collects the vertices and faces of one game mesh. Each vertex carries a position, a
    normal of our choosing (soft, crown-shaped normals light foliage far better than the true
    normals of crossing cards), a UV inside a baked piece and the shade, warmth and wind values
    that become its vertex colour. Faces go to the opaque "atlas" or the alpha-tested "cutout"
    material."""

    def __init__(self):
        self.points, self.normals, self.uvs, self.colors = [], [], [], []
        self.faces = {ATLAS: [], CUTOUT: []}

    def triangles(self):
        return sum(len(face) - 2 for faces in self.faces.values() for face in faces)

    def grid(self, rows, rect, material=CUTOUT, normals=None, us=None, vs=None, uv=None,
             wind=0.0, shade=1.0, green=1.0, facing=None, face_to=None, light=None):
        """Adds a sheet of quads through `rows` (lists of points, the same number in each).

        rect is the piece's atlas rectangle; us and vs place columns and rows inside it
        (0..1, evenly by default) and uv, nested like rows, places every vertex by hand.
        normals (nested like rows) are the vertex normals; without them the sheet's own.
        wind, shade and green: a number, a function of the position, a list per row or a
        nested list. The faces are wound to face the side the normals (or `facing`) point to.

        Foliage seen from below (see foliage_light): `face_to(point)` gives the side each face
        is wound towards instead of its normals, and `light(point, normal)` the normal that
        is stored instead of the given one. A double-sided material negates the stored normal
        on a face's back, so a frond wound to face down whose stored normal points out and up
        is lit from the sky where the street sees it, instead of reading black.
        """
        points = [[Vector(point) for point in row] for row in rows]
        count_i, count_j = len(points), len(points[0])
        if us is None:
            us = [j / (count_j - 1) for j in range(count_j)]
        if vs is None:
            vs = [i / (count_i - 1) for i in range(count_i)]
        natural = Vector((0.0, 0.0, 0.0))
        for i in range(count_i - 1):
            for j in range(count_j - 1):
                natural += (points[i][j + 1] - points[i][j]).cross(points[i + 1][j] - points[i][j])
        if normals is not None:
            reference = sum((Vector(normal) for row in normals for normal in row), Vector())
        else:
            reference = Vector(facing) if facing is not None else natural
        flip = natural.dot(reference) < 0.0
        if normals is None:
            normals = self._sheet_normals(points, -1.0 if flip else 1.0)
        u0, v0, u1, v1 = rect
        index = [[0] * count_j for _ in range(count_i)]
        for i in range(count_i):
            for j in range(count_j):
                point = points[i][j]
                fu, fv = uv[i][j] if uv is not None else (us[j], vs[i])
                shade_here = _value(shade, i, j, point)
                wind_here = clamp(_value(wind, i, j, point))
                green_here = _value(green, i, j, point)
                index[i][j] = len(self.points)
                self.points.append(point)
                stored = normals[i][j] if light is None else light(point, Vector(normals[i][j]))
                self.normals.append(unit(stored))
                self.uvs.append((u0 + (u1 - u0) * fu, v0 + (v1 - v0) * fv))
                self.colors.append((shade_here, shade_here * green_here,
                                    shade_here * (1.0 - 0.5 * wind_here), 1.0))
        # Winding per face, from that face's own corner normals: on a closed tube the sums
        # above cancel out, so a whole-sheet decision could turn a trunk inside out.
        for i in range(count_i - 1):
            for j in range(count_j - 1):
                corners = [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
                face, seen = [], []
                for ci, cj in corners:
                    point = points[ci][cj]
                    if any((point - other).length < 1e-6 for other in seen):
                        continue
                    seen.append(point)
                    face.append(index[ci][cj])
                if len(face) < 3:
                    continue
                quad = ((points[i + 1][j + 1] - points[i][j])
                        .cross(points[i + 1][j] - points[i][j + 1]))
                if face_to is not None:
                    middle = sum((points[ci][cj] for ci, cj in corners), Vector()) / 4
                    want = Vector(face_to(middle))
                else:
                    want = sum((Vector(normals[ci][cj]) for ci, cj in corners), Vector())
                flip_here = quad.dot(want) < 0.0 if quad.length > 1e-12 else flip
                self.faces[material].append(tuple(reversed(face)) if flip_here else tuple(face))

    @staticmethod
    def _sheet_normals(points, sign):
        count_i, count_j = len(points), len(points[0])
        normals = []
        for i in range(count_i):
            row = []
            for j in range(count_j):
                across = points[i][min(j + 1, count_j - 1)] - points[i][max(j - 1, 0)]
                along = points[min(i + 1, count_i - 1)][j] - points[max(i - 1, 0)][j]
                row.append(unit(across.cross(along)) * sign)
            normals.append(row)
        return normals

    def tube(self, path, radii, sides, rect, vs=None, material=ATLAS, wind=0.0, shade=1.0,
             green=1.0, up=(0.0, 1.0, 0.0), section=None, spin=0.0):
        """A round stem along `path` with one radius per point, `sides` faces around, mapped
        onto a bark piece (U around, V along: see bark_vs). section(angle, index) scales the
        radius around the stem (flutes, buttresses)."""
        frames = build.path_frames(path, up=up)
        rows, normals = [], []
        for index, (point, _tangent, normal, binormal) in enumerate(frames):
            row, row_normals = [], []
            for side in range(sides + 1):
                angle = math.tau * side / sides + spin
                out = binormal * math.cos(angle) + normal * math.sin(angle)
                reach = radii[index] * (section(angle, index) if section else 1.0)
                row.append(point + out * reach)
                row_normals.append(out)
            rows.append(row)
            normals.append(row_normals)
        self.grid(rows, rect, material, normals=normals, vs=vs, wind=wind, shade=shade,
                  green=green)

    def frond(self, frames, rect, half_width, fold, wind=(0.3, 1.0), shade=1.0, green=1.0,
              v_range=(0.0, 1.0), mirror=False, face_to=None, light=None):
        """A feather frond: a strip along `frames` (see frond_frames) folded along its midrib by
        `fold` radians (negative: the leaflets hang), mapped onto a frond card. half_width is a
        number or one value per frame. face and light: see grid (foliage seen from below)."""
        rows, normals, winds = [], [], []
        last = len(frames) - 1
        for index, (point, _tangent, side, normal) in enumerate(frames):
            half = half_width if isinstance(half_width, (int, float)) else half_width[index]
            reach, rise = half * math.cos(fold), half * math.sin(fold)
            rows.append([point - side * reach + normal * rise, point,
                         point + side * reach + normal * rise])
            normals.append([normal * math.cos(fold) + side * math.sin(fold), normal,
                            normal * math.cos(fold) - side * math.sin(fold)])
            along = lerp(wind[0], wind[1], index / last)
            winds.append([min(1.0, along + 0.15), along, min(1.0, along + 0.15)])
        vs = [lerp(v_range[0], v_range[1], index / last) for index in range(last + 1)]
        us = [1.0, 0.5, 0.0] if mirror else [0.0, 0.5, 1.0]
        self.grid(rows, rect, CUTOUT, normals=normals, us=us, vs=vs, wind=winds, shade=shade,
                  green=green, face_to=face_to, light=light)

    def card(self, base, along, across, length, width, rect, columns=2, rows=2, cup=0.0,
             arch=0.0, centre=None, roundness=0.6, wind=(0.4, 1.0), shade=1.0, green=1.0,
             mirror=False, material=CUTOUT, light=None):
        """A leaf card growing from `base` along `along`, `width` wide across `across`.

        cup lifts the two side edges and arch bends the far end back, both as a fraction of
        the card's size, so a card is never a flat plane. With `centre` (the middle of the
        crown) the normals lean outwards from it by `roundness`, the faces are wound to look
        outwards, and the whole crown is lit as one rounded mass.
        """
        base, along, across = Vector(base), unit(along), unit(across)
        normal = unit(across.cross(along))
        out = unit(base + along * (length * 0.5) - Vector(centre)) if centre is not None else normal
        if normal.dot(out) < 0.0:
            normal = -normal
        grid_rows, grid_normals, winds = [], [], []
        for i in range(rows + 1):
            t = i / rows
            row, row_normals = [], []
            for j in range(columns + 1):
                c = -1.0 + 2.0 * j / columns
                point = (base + along * (t * length) + across * (c * width * 0.5)
                         + normal * (cup * c * c * width * 0.5 - arch * t * t * length))
                row.append(point)
                if centre is not None:
                    radial = unit(point - Vector(centre))
                    row_normals.append(unit(normal * (1.0 - roundness) + radial * roundness))
                else:
                    row_normals.append(unit(normal - across * (c * cup * 2.0)
                                            + along * (arch * 2.0 * t)))
            grid_rows.append(row)
            grid_normals.append(row_normals)
            winds.append(lerp(wind[0], wind[1], t))
        us = [1.0 - j / columns for j in range(columns + 1)] if mirror else None
        self.grid(grid_rows, rect, material, normals=grid_normals, us=us, wind=winds,
                  shade=shade, green=green, light=light)

    def cross(self, foot, axis, width, height, rect, cards=2, turn=0.0, wind=(0.2, 0.9),
              shade=1.0, lean=0.5):
        """The impostor: `cards` upright cards crossing on the line from `foot` along `axis`,
        all showing the impostor piece. Their normals fan out like a ball's, so the cards are
        lit as one crown whichever way they stand."""
        foot, axis = Vector(foot), unit(axis)
        seed = Vector((1.0, 0.0, 0.0)) if abs(axis.x) < 0.9 else Vector((0.0, 1.0, 0.0))
        first = unit(seed - axis * seed.dot(axis))
        second = axis.cross(first)
        for card in range(cards):
            angle = turn + math.pi * card / cards
            right = first * math.cos(angle) + second * math.sin(angle)
            facing = right.cross(axis)
            rows, normals, winds = [], [], []
            for i in range(3):
                t = i / 2
                rows.append([foot + right * (c * width * 0.5) + axis * (t * height)
                             for c in (-1.0, 0.0, 1.0)])
                normals.append([unit(right * (c * 0.85) + axis * ((t - 0.3) * 0.9)
                                     - facing * lean) for c in (-1.0, 0.0, 1.0)])
                winds.append(lerp(wind[0], wind[1], t))
            us = [1.0, 0.5, 0.0] if card % 2 else [0.0, 0.5, 1.0]
            self.grid(rows, rect, CUTOUT, normals=normals, us=us, wind=winds, shade=shade)

    def build(self, name, a):
        """Makes the mesh object `name` with the asset's finished game materials."""
        faces, slots, slot_of_face = [], [], []
        for material in (ATLAS, CUTOUT):
            if self.faces[material]:
                slots.append(a.material(material))
                faces += self.faces[material]
                slot_of_face += [len(slots) - 1] * len(self.faces[material])
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([tuple(point) for point in self.points], [], faces)
        mesh.update()
        for slot in slots:
            mesh.materials.append(slot)
        mesh.polygons.foreach_set('material_index', slot_of_face)
        mesh.polygons.foreach_set('use_smooth', [True] * len(faces))
        loop_vertices = np.empty(len(mesh.loops), dtype=np.int32)
        mesh.loops.foreach_get('vertex_index', loop_vertices)
        layer = mesh.uv_layers.new(name='UVMap')
        layer.data.foreach_set('uv', np.asarray(self.uvs, dtype=np.float32)[loop_vertices].ravel())
        color = mesh.color_attributes.new('Color', 'BYTE_COLOR', 'CORNER')
        color.data.foreach_set('color',
                               np.asarray(self.colors, dtype=np.float32)[loop_vertices].ravel())
        mesh.color_attributes.active_color = color
        mesh.normals_split_custom_set_from_vertices([tuple(normal) for normal in self.normals])
        mesh.update()
        return scene.new_object(name, mesh)


# ---------------------------------------------------------------------------------------------
# Stems
# ---------------------------------------------------------------------------------------------

def fold_v(distance, low=0.3):
    """Where a point `distance` piece-lengths up a stem lies on its bark piece (V, 0..1): the
    piece is laid end over end, mirrored at each joint so no seam shows, and after the first
    run it never comes back to its lowest part, where the foot of the trunk is painted."""
    if distance <= 1.0:
        return max(distance, 0.0)
    span = 1.0 - low
    wrapped = (distance - 1.0) % (2.0 * span)
    return 1.0 - wrapped if wrapped <= span else low + (wrapped - span)


def bark_vs(path, radii, piece_radius, piece_length, start=0.0, low=0.3):
    """V of every ring of a stem on a bark piece baked at `piece_radius`: thin stems run
    through the piece faster, so the bark keeps its proportions on a branch."""
    distance, result = start, [fold_v(start, low)]
    for index in range(1, len(path)):
        step = (Vector(path[index]) - Vector(path[index - 1])).length
        mean = max(0.5 * (radii[index] + radii[index - 1]), 1e-3)
        distance += step * clamp(piece_radius / mean, 0.7, 6.0) / piece_length
        result.append(fold_v(distance, low))
    return result


def curve(points, count):
    """`count` points evenly spaced along a smooth curve through `points`."""
    return [Vector(point) for point in
            profiles.resample(profiles.smooth_path([tuple(point) for point in points], 6), count)]


def source_stem(name, path, radii, material, sides=16, location=(0.0, 0.0, 0.0)):
    """A detailed stem with its procedural material, for a piece or for an impostor's source."""
    stem = build.tube(name, [tuple(point) for point in path], radii=list(radii), segments=sides,
                      caps=False, up=(0.0, 1.0, 0.0))
    stem.data.shade_smooth()
    scene.set_material(stem, material)
    stem.location = location
    return stem


# ---------------------------------------------------------------------------------------------
# Feather fronds
# ---------------------------------------------------------------------------------------------

def frond_frames(base, azimuth, elevation, droop, length, segments, power=1.6, sway=0.0,
                 roll=0.0, roll_tip=0.0):
    """Stations along an arching frond: a list of (point, tangent, side, normal).

    The frond leaves `base` towards `azimuth` at `elevation` above the horizon and bends down
    by `droop` radians towards its tip (faster near the tip as `power` grows); sway turns it
    sideways and roll, roll_tip twist it about its own length. `side` points to the right of
    the midrib and `normal` out of the frond's upper face.
    """
    points = [Vector(base)]
    for step in range(segments):
        s = (step + 0.5) / segments
        pitch = elevation - droop * s ** power
        yaw = azimuth + sway * s * s
        points.append(points[-1] + Vector((math.cos(yaw) * math.cos(pitch),
                                           math.sin(yaw) * math.cos(pitch),
                                           math.sin(pitch))) * (length / segments))
    frames = []
    for index, point in enumerate(points):
        tangent = unit(points[min(index + 1, segments)] - points[max(index - 1, 0)])
        s = index / segments
        yaw = azimuth + sway * s * s
        side = Vector((math.sin(yaw), -math.cos(yaw), 0.0))
        side = unit(side - tangent * side.dot(tangent))
        normal = side.cross(tangent)
        angle = lerp(roll, roll_tip, s)
        if abs(angle) > 1e-6:
            cos_a, sin_a = math.cos(angle), math.sin(angle)
            side, normal = side * cos_a + normal * sin_a, normal * cos_a - side * sin_a
        frames.append((point, tangent, side, normal))
    return frames


def bend_frond(part, frames, length, fold=0.0, scale=1.0):
    """A flat detailed frond (a part lying along +Y from the origin, see _foliage.py) bent
    along `frames`: the detailed plant an impostor is baked from uses the very fronds the
    cards were baked from, in the places the game mesh puts its strips."""
    vertices, quads, uvs = part
    stations = len(frames) - 1
    points = np.array([frame[0] for frame in frames], dtype=np.float64)
    sides = np.array([frame[2] for frame in frames], dtype=np.float64)
    normals = np.array([frame[3] for frame in frames], dtype=np.float64)
    s = np.clip(vertices[:, 1] / length, 0.0, 1.0) * stations
    low = np.minimum(s.astype(np.int64), stations - 1)
    t = (s - low)[:, None]
    x = vertices[:, 0:1] * scale
    z = vertices[:, 2:3] * scale
    centre = points[low] * (1.0 - t) + points[low + 1] * t
    side = sides[low] * (1.0 - t) + sides[low + 1] * t
    normal = normals[low] * (1.0 - t) + normals[low + 1] * t
    bent = (centre + side * (x * math.cos(fold))
            + normal * (np.abs(x) * math.sin(fold) + z))
    return bent.astype(np.float32), quads, uvs


# ---------------------------------------------------------------------------------------------
# Pieces: cards, impostors and their place in the scene while they are baked
# ---------------------------------------------------------------------------------------------

class Bench:
    """Lays the pieces of an asset out in a row along X, well apart, so that nothing shades
    its neighbour during the bake, and keeps what assemble() needs to know about them."""

    def __init__(self, a, cutout_material, spacing=3.0):
        self.a = a
        self.cutout = cutout_material
        self.cursor = 0.0
        self.spacing = spacing

    def slot(self, width):
        """The X at which a piece `width` wide may stand."""
        x = self.cursor + width * 0.5
        self.cursor += width + self.spacing
        return x

    def flat_card(self, name, width, length, soups, texel_scale=1.0):
        """A card lying on the ground along +Y; `soups` is a list of (Soup, material) lying
        on it from its near edge (the plant's side) outwards. Returns the card."""
        x = self.slot(width)
        card = build.grid(name, size=(width, length), location=(0.0, length * 0.5, 0.0))
        scene.set_material(card, self.cutout)
        card.location = (x, 0.0, 0.0)
        sources = [soup.object(f'{name}_source{index}', material, location=(x, 0.0, 0.0))
                   for index, (soup, material) in enumerate(soups)]
        self.a.add_piece(card, sources=sources, texel_scale=texel_scale)
        return card

    def upright_card(self, name, width, height, soups, texel_scale=1.0, bottom=0.0):
        """A card standing in the XZ plane facing -Y; the soups stand in front of and behind
        it. Returns the card."""
        x = self.slot(width)
        card = build.card(name, width=width, height=height, location=(0.0, 0.0, bottom))
        scene.set_material(card, self.cutout)
        card.location = (x, 0.0, 0.0)
        sources = [soup.object(f'{name}_source{index}', material, location=(x, 0.0, 0.0))
                   for index, (soup, material) in enumerate(soups)]
        self.a.add_piece(card, sources=sources, texel_scale=texel_scale)
        return card

    def stem_piece(self, name, radius, length, material, texel_scale=1.0, sides=24,
                   radius_top=None):
        """A straight length of stem with its bark material: U runs around it, V along."""
        x = self.slot(radius * 2.0)
        stem = build.cylinder(name, radius=radius, depth=length, segments=sides, caps=False,
                              on_ground=True, radius_top=radius_top)
        scene.set_material(stem, material)
        stem.location = (x, 0.0, 0.0)
        self.a.add_piece(stem, texel_scale=texel_scale)
        return stem

    def impostor(self, name, sources, width, height, centre_x, bottom, texel_scale=0.14):
        """An upright card baked from a whole detailed plant standing at the next free slot:
        `sources` are objects modelled about the origin, moved here; the card spans `width`
        about X = centre_x from Z = bottom up. Returns the card."""
        x = self.slot(width + 2.0)
        card = build.card(name, width=width, height=height, location=(centre_x, 0.0, bottom))
        scene.set_material(card, self.cutout)
        card.location = (x, 0.0, 0.0)
        for source in sources:
            source.location = (x, 0.0, 0.0)
        self.a.add_piece(card, sources=sources, texel_scale=texel_scale)
        return card


# ---------------------------------------------------------------------------------------------
# The ground under a plant
# ---------------------------------------------------------------------------------------------

def ground_patch(shape, rect, radius, seed=0, rise=0.05, sink=0.03, sides=10, shade=1.0,
                 centre=(0.0, 0.0), size=None):
    """A low mound of litter around the foot: a ragged-edged cut-out card baked from modelled
    mulch, soil and dead leaves. Its rim sinks a little into the ground and its middle rises.
    `size` is the side of the baked square patch the mound is cut from (default 2 * radius)."""
    rng = random.Random(seed)
    size = size or radius * 2.0
    turn = rng.uniform(0.0, math.tau)
    rows, uvs = [], []
    for scale, z in ((0.04, rise), (0.55, rise * 0.7), (1.0, -sink)):
        row, row_uv = [], []
        for side in range(sides + 1):
            angle = turn + math.tau * side / sides
            reach = radius * scale
            x, y = reach * math.cos(angle), reach * math.sin(angle)
            row.append((centre[0] + x, centre[1] + y, z))
            row_uv.append((0.5 + x / size, 0.5 + y / size))
        rows.append(row)
        uvs.append(row_uv)
    normals = [[UP] * (sides + 1) for _ in rows]
    shape.grid(rows, rect, CUTOUT, normals=normals, uv=uvs, shade=shade)


def tuft_ring(shape, rect, count, radius, width, height, seed=0, spread=0.25, lean=0.25,
              shade=1.0, cross=True):
    """Small upright tufts of grass around the foot, hiding where litter meets the ground."""
    rng = random.Random(seed)
    for index in range(count):
        angle = math.tau * (index + rng.uniform(-0.3, 0.3)) / count
        reach = radius * (1.0 + rng.uniform(-spread, spread))
        base = polar(reach, angle, -0.02)
        size = rng.uniform(0.75, 1.25)
        turn = rng.uniform(0.0, math.pi)
        for blade in range(2 if cross else 1):
            across = polar(1.0, turn + blade * math.pi / 2)
            along = unit(UP + polar(lean * rng.uniform(0.3, 1.0), angle))
            shape.card(base, along, across, height * size, width * size, rect, columns=1,
                       rows=1, wind=(0.0, 0.7), shade=shade, mirror=rng.random() < 0.5)


# ---------------------------------------------------------------------------------------------
# What the game is told
# ---------------------------------------------------------------------------------------------

WIND_NOTE = ('COLOR_0: R = shade, G = R * warmth, B = R * (1 - wind / 2); '
             'wind = 2 * (1 - B / R): 0 on trunks, roots and ground, 1 at leaf tips')


def describe(a, variants, lod_distances, collider=None):
    """Writes the plant table into the file's extras: for every variant its node part, height
    and crown width in metres; the wind mask; and the level distances."""
    a.set_lod_distances(*lod_distances)
    a.set_extra('wind', WIND_NOTE)
    a.set_extra('variants', variants)
    if collider is not None:
        a.set_extra('collider', collider)
