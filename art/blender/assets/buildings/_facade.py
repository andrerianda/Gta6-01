"""Facade kit helpers: how the building kits (kit_*.py) put many facade modules into one asset.

A kit is one asset, one bake and one atlas. Each module is one bay of one storey, authored in
module coordinates: the outer wall surface on the plane Y = 0, the street towards +Y, X from
-width/2 to +width/2 and Z from 0 to the storey height. A module has two nodes:

    <module>_lod0   the detailed bay (wall with real reveals, frames, sills, eyebrows, balconies)
    <module>_lod1   a card on the wall plane (at most 12 triangles) whose texture is baked from
                    the detailed bay: a wall ring in paint_wall and, where the bay has glazing,
                    one quad in the bay's lamp_window_* material, so far windows still light up

During the bake the modules stand apart in rows (ground-storey modules on the ground so that the
pavement shades their foot, upper modules 2 m up so that it does not), and each card stands with
its own copy of the detailed bay in another row. After the bake every node is moved to the
origin: in the file all module nodes have no translation and their geometry is in module
coordinates, so the assembler instantiates a node (or batches its geometry) and places it.

Shell collects the faces of one module by material key and makes one mesh of them. It builds
from plain quads and prisms with outward normals instead of boxes with hidden faces: a facade
is seen from the street only, and every triangle counts when a street shows hundreds of bays.

Materials are made by FacadeMaterials: two tintable stuccos (paint_wall, paint_trim; ground
modules get a variant with pavement splash that merges into the same game material), three
window glass lamp groups, and the repeating tile sets.
"""
import math

from mathutils import Vector

from lib import build, scene, shading
from lib import materials as M
from lib.materials import masonry, wear

UV_LAYER = 'UVMap'
GLOW_COLOR = (1.0, 0.80, 0.52)
GLOW_STRENGTH = 2.2
_KITS = {}


# ---------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------

def facade_stucco(name, color, seed, texture=0.5, stains=0.5, cracks=0.2, splash=False):
    """Trowelled stucco after the library's recipe, with two differences a facade kit needs: the
    colour goes through the paint node (a paint_* material bakes neutral and is tinted per
    building), and the pavement splash is optional, because a module's own Z = 0 is the
    pavement only on the ground storey."""
    graph = M.Graph(name, seed)
    paint = graph.paint_color(color)
    lumps = graph.noise(scale=42.0, detail=3.0, roughness=0.6)
    trowel = graph.noise(scale=7.0, detail=4.0, roughness=0.55, distortion=0.6)
    cloud = graph.noise(scale=0.9, detail=4.0)
    base = graph.hsv(paint, value=graph.remap(cloud, 0.2, 0.8, 0.93, 1.04),
                     saturation=graph.remap(cloud, 0.2, 0.8, 1.05, 0.9))
    relief = graph.add(graph.mul(lumps, 0.6), graph.mul(trowel, 0.4))
    base = graph.hsv(base, value=graph.remap(relief, 0.3, 0.7, 0.93, 1.05))
    height = graph.add(graph.mul(lumps, texture), graph.mul(trowel, 0.8 * texture))
    coat = wear.Coat(graph, base, roughness=graph.remap(lumps, 0.2, 0.8, 0.8, 0.95), height=height)
    if cracks > 0:
        crack_mask = masonry._cracks(graph, scale=1.6, width=0.008, density=cracks)
        coat.cover(crack_mask, color=(0.30, 0.28, 0.25), height=-1.5)
    if stains > 0:
        runs = graph.noise(scale=4.5, detail=5.0, stretch=(1.0, 1.0, 0.04), distortion=0.15)
        coat.tint(graph.mul(graph.mask(runs, 0.57, 0.14), graph.remap(cloud, 0.25, 0.7)),
                  (0.40, 0.37, 0.32), strength=0.6 * stains)
        wear.grime(coat, amount=0.25 + 0.4 * stains)
    if splash:
        wear.ground_splash(coat, amount=0.3, height=0.45, color=(0.34, 0.31, 0.27))
    return coat.finish(bump_strength=0.8, bump_distance=0.008)


def window_glass(name, seed, blinds=0.0, cell=0.8, offset=0.4, head=2.4):
    """A window pane as a switchable lamp: by day dark reflective glass, by night the game
    lights the group. Glass is a smooth metal here whose base colour is its reflectance: real
    glass reflects 4 to 8 percent and the dark room behind it shows through, so the base is a
    dark blue grey (linear 0.06 to 0.13; a mid-tone base mirrors the bright sky map as a flat
    pale sheet that reads as a closed shutter in the engine). Each column `cell` metres wide
    (columns start at -offset: lay the panes out on that grid) gets its own tone and gloss, and
    every pane catches a little more sky towards its head. With `blinds` (the share of columns
    that have one) a warm roller blind hangs behind the glass from `head`, drawn part way."""
    graph = M.Graph(name, seed)
    graph.material['mz_emissive_strength'] = GLOW_STRENGTH
    shift = graph.node('ShaderNodeVectorMath', operation='ADD')
    graph.links.new(graph.object_coords(), shift.inputs[0])
    shift.inputs[1].default_value = (offset, 0.0, 0.0)
    snap = graph.node('ShaderNodeVectorMath', operation='SNAP')
    graph.links.new(shift.outputs[0], snap.inputs[0])
    snap.inputs[1].default_value = (cell, 1000.0, 1000.0)
    chance = graph.white_noise(snap.outputs[0])
    tone = graph.mix(chance, (0.050, 0.062, 0.072), (0.105, 0.125, 0.140))
    tone = graph.hsv(tone, value=graph.remap(graph.axis('Z'), head - 1.6, head, 0.8, 1.25))
    base, metallic = tone, 1.0
    roughness = graph.remap(chance, 0.0, 1.0, 0.035, 0.09)
    if blinds > 0:
        drop = graph.remap(chance, 1.0 - blinds, 1.0, 0.25, 0.85)
        level = graph.add(graph.axis('Z'), drop)
        mask = graph.mul(graph.mask(level, head - 0.12, 0.004),
                         graph.mask(chance, 1.0 - blinds, 0.001))
        base = graph.mix(mask, tone, (0.46, 0.42, 0.35))
        metallic = graph.mix_value(mask, 1.0, 0.55)
        roughness = graph.mix_value(mask, roughness, 0.22)
    return graph.surface(base_color=base, roughness=roughness, metallic=metallic,
                         emission_color=GLOW_COLOR, emission_strength=GLOW_STRENGTH)


class FacadeMaterials:
    """The material sets of a kit: `ground` and `upper` map the keys a Shell uses ('wall',
    'trim', 'frame', 'plinth', 'glass_a', 'glass_b', 'glass_c') to source materials."""

    def __init__(self, wall_color, trim_color, frame, plinth, seed=1):
        wall_up = facade_stucco('paint_wall', wall_color, seed, texture=0.5, stains=0.55)
        wall_ground = facade_stucco('paint_wall', wall_color, seed, texture=0.5, stains=0.55,
                                    splash=True)
        trim_up = facade_stucco('paint_trim', trim_color, seed + 1, texture=0.2, stains=0.4,
                                cracks=0.0)
        trim_ground = facade_stucco('paint_trim', trim_color, seed + 1, texture=0.2, stains=0.4,
                                    cracks=0.0, splash=True)
        shared = {
            'frame': frame,
            'plinth': plinth,
            'glass_a': window_glass('lamp_window_a', seed + 2, blinds=0.35, cell=0.8, offset=0.4),
            'glass_b': window_glass('lamp_window_b', seed + 3, blinds=0.3, cell=1.2, offset=0.0),
            'glass_c': window_glass('lamp_window_c', seed + 4, cell=8.0, offset=4.0),
        }
        self.upper = dict(shared, wall=wall_up, trim=trim_up)
        self.ground = dict(shared, wall=wall_ground, trim=trim_ground)
        # Baked white-neutral like the paint_wall coat: the game multiplies the building's wall
        # tint into this material's colour for side and back walls.
        self.tile_wall = M.tile(facade_stucco('tile_wall', (1.0, 1.0, 1.0), seed, texture=0.5,
                                              stains=0.4), size=2.0, pixels=512)
        self.tile_roof = M.tile(M.concrete(color=(0.46, 0.45, 0.42), stains=0.7, cracks=0.3,
                                           pits=0.9, seed=seed + 5, name='tile_roof_flat'),
                                size=2.0, pixels=512, facing='floor')

    def add(self, **materials):
        """Adds atlas materials under their Shell keys to both storeys (brick, canvas, ...)."""
        self.upper.update(materials)
        self.ground.update(materials)


# ---------------------------------------------------------------------------------------------
# Outlines
# ---------------------------------------------------------------------------------------------

def d_outline(half_width, projection, radius, segments=3):
    """The counter-clockwise outline of a slab that projects from the wall with rounded outer
    corners: from (half_width, 0) out, across the front and back to (-half_width, 0)."""
    points = [(half_width, 0.0)]
    for centre_x, start in ((half_width - radius, 0.0), (-half_width + radius, 90.0)):
        for step in range(segments + 1):
            angle = math.radians(start + 90.0 * step / segments)
            points.append((centre_x + radius * math.cos(angle),
                           projection - radius + radius * math.sin(angle)))
    points.append((-half_width, 0.0))
    return points


def wrap_outline(projection, segments=0):
    """The counter-clockwise outline of a band that wraps the street corner of a corner post
    (faces on Y = 0 and X = 0.25), projecting `projection`; with segments > 0 the outer corner
    is a quarter round. The first and the last edge lie on the post's faces."""
    points = [(0.25, 0.0), (0.25, -0.5), (0.25 + projection, -0.5)]
    if segments > 0:
        for step in range(segments + 1):
            angle = math.radians(90.0 * step / segments)
            points.append((0.25 + projection * math.cos(angle), projection * math.sin(angle)))
    else:
        points.append((0.25 + projection, projection))
    points += [(-0.25, projection), (-0.25, 0.0)]
    return points


def inset_path(path, distance):
    """An open counter-clockwise path moved `distance` towards the inside (its left)."""
    result = []
    for index, (x, y) in enumerate(path):
        normal = Vector((0.0, 0.0))
        for a, b in ((index - 1, index), (index, index + 1)):
            if a < 0 or b >= len(path):
                continue
            edge = Vector(path[b]) - Vector(path[a])
            if edge.length > 1e-9:
                normal += Vector((-edge.y, edge.x)).normalized()
        normal.normalize()
        result.append((x + normal.x * distance, y + normal.y * distance))
    return result


# ---------------------------------------------------------------------------------------------
# Shell: the faces of one module
# ---------------------------------------------------------------------------------------------

class Shell:
    """Collects quads, polygons and tubes by material key and joins them into one mesh."""

    def __init__(self, materials):
        self.materials = materials
        self.faces = {}
        self.extra = []

    def quad(self, key, points, facing):
        """A face through `points`, wound so that its normal points along `facing`."""
        a, b, c = Vector(points[0]), Vector(points[1]), Vector(points[2])
        points = [tuple(point) for point in points]
        if (b - a).cross(c - a).dot(Vector(facing)) < 0:
            points.reverse()
        self.faces.setdefault(key, []).append(points)

    def box(self, key, low, high, skip='b'):
        """The faces of a box except those named in `skip`: f(ront, +Y), b(ack), l(eft, -X),
        r(ight), t(op), u(nderside)."""
        x0, y0, z0 = low
        x1, y1, z1 = high
        faces = {
            'f': ([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0)),
            'b': ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
            'l': ([(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], (-1, 0, 0)),
            'r': ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
            't': ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
            'u': ([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, -1)),
        }
        for letter, (points, facing) in faces.items():
            if letter not in skip:
                self.quad(key, points, facing)

    def wall(self, key, x0, x1, z0, z1, openings=(), y=0.0):
        """The wall plane between openings (x0, z0, x1, z1), as a grid without T-junctions."""
        xs = sorted({x0, x1, *[o[0] for o in openings], *[o[2] for o in openings]})
        zs = sorted({z0, z1, *[o[1] for o in openings], *[o[3] for o in openings]})
        for ix in range(len(xs) - 1):
            for iz in range(len(zs) - 1):
                centre_x, centre_z = (xs[ix] + xs[ix + 1]) / 2, (zs[iz] + zs[iz + 1]) / 2
                if any(o[0] < centre_x < o[2] and o[1] < centre_z < o[3] for o in openings):
                    continue
                self.quad(key, [(xs[ix], y, zs[iz]), (xs[ix + 1], y, zs[iz]),
                                (xs[ix + 1], y, zs[iz + 1]), (xs[ix], y, zs[iz + 1])], (0, 1, 0))

    def ring(self, key, x0, x1, z0, z1, hole):
        """The wall plane around one opening as four trapezoids (8 triangles, no T-junctions)."""
        hx0, hz0, hx1, hz1 = hole
        outer = [(x0, 0.0, z0), (x1, 0.0, z0), (x1, 0.0, z1), (x0, 0.0, z1)]
        inner = [(hx0, 0.0, hz0), (hx1, 0.0, hz0), (hx1, 0.0, hz1), (hx0, 0.0, hz1)]
        for index in range(4):
            after = (index + 1) % 4
            self.quad(key, [outer[index], outer[after], inner[after], inner[index]], (0, 1, 0))

    def reveal(self, key, opening, depth, sill=True):
        """The jambs, head and (optionally) the sill of an opening, `depth` into the wall."""
        x0, z0, x1, z1 = opening
        self.quad(key, [(x0, 0, z0), (x0, -depth, z0), (x0, -depth, z1), (x0, 0, z1)], (1, 0, 0))
        self.quad(key, [(x1, 0, z0), (x1, -depth, z0), (x1, -depth, z1), (x1, 0, z1)], (-1, 0, 0))
        self.quad(key, [(x0, 0, z1), (x1, 0, z1), (x1, -depth, z1), (x0, -depth, z1)], (0, 0, -1))
        if sill:
            self.quad(key, [(x0, 0, z0), (x1, 0, z0), (x1, -depth, z0), (x0, -depth, z0)], (0, 0, 1))

    def window(self, opening, depth, glass, frame='frame', columns=1, bars=(), sill='trim',
               frame_width=0.06, bar_width=0.045):
        """Glazing at the back of an opening: the pane, a frame standing 6 cm proud of it,
        `columns` lights divided by mullions, horizontal glazing bars at the heights `bars`,
        and a projecting sill of the material `sill` (None for a door or a shared sill)."""
        x0, z0, x1, z1 = opening
        back, front = -depth, -depth + 0.06
        fw = frame_width
        self.quad(glass, [(x0, back + 0.02, z0), (x1, back + 0.02, z0), (x1, back + 0.02, z1),
                          (x0, back + 0.02, z1)], (0, 1, 0))
        self.box(frame, (x0, back, z0), (x0 + fw, front, z1), skip='bltu')
        self.box(frame, (x1 - fw, back, z0), (x1, front, z1), skip='brtu')
        self.box(frame, (x0 + fw, back, z1 - fw), (x1 - fw, front, z1), skip='btlr')
        self.box(frame, (x0 + fw, back, z0), (x1 - fw, front, z0 + fw), skip='bulr')
        for index in range(1, columns):
            x = x0 + (x1 - x0) * index / columns
            self.box(frame, (x - bar_width / 2, back, z0 + fw), (x + bar_width / 2, front - 0.008,
                                                                 z1 - fw), skip='btu')
        for z in bars:
            self.box(frame, (x0 + fw, back, z - bar_width / 2), (x1 - fw, front - 0.016,
                                                                 z + bar_width / 2), skip='blr')
        if sill:
            self.box(sill, (x0 - 0.07, -depth, z0 - 0.07), (x1 + 0.07, 0.08, z0), skip='b')

    def polygon(self, key, outline, z, up=True):
        """A level polygon at height z from a counter-clockwise outline, facing up or down."""
        points = [(x, y, z) for x, y in outline]
        if not up:
            points.reverse()
        self.faces.setdefault(key, []).append(points)

    def prism(self, key, outline, z0, z1, skip_edges=(), top=True, bottom=True):
        """A slab from a counter-clockwise outline between two heights; edges whose index is
        in `skip_edges` (edge i runs from point i to point i + 1) get no side face."""
        count = len(outline)
        if top:
            self.polygon(key, outline, z1, up=True)
        if bottom:
            self.polygon(key, outline, z0, up=False)
        for index in range(count):
            if index in skip_edges:
                continue
            (ax, ay), (bx, by) = outline[index], outline[(index + 1) % count]
            self.quad(key, [(ax, ay, z0), (bx, by, z0), (bx, by, z1), (ax, ay, z1)],
                      (by - ay, ax - bx, 0.0))

    def band(self, side_key, top_key, path, z0, z1, thickness):
        """An upstand wall along an open counter-clockwise path (a balcony front): outer and
        inner faces and a flat top."""
        inner = inset_path(path, thickness)
        for index in range(len(path) - 1):
            (ax, ay), (bx, by) = path[index], path[index + 1]
            (cx, cy), (dx, dy) = inner[index], inner[index + 1]
            out = (by - ay, ax - bx, 0.0)
            self.quad(side_key, [(ax, ay, z0), (bx, by, z0), (bx, by, z1), (ax, ay, z1)], out)
            self.quad(side_key, [(cx, cy, z0), (dx, dy, z0), (dx, dy, z1), (cx, cy, z1)],
                      (-out[0], -out[1], 0.0))
            self.quad(top_key, [(ax, ay, z1), (bx, by, z1), (dx, dy, z1), (cx, cy, z1)], (0, 0, 1))

    def tube(self, key, path, radius=0.022, segments=4):
        """A pipe along 3D points (railings, handles, downpipes)."""
        first, last = Vector(path[0]), Vector(path[-1])
        upright = abs((last - first).normalized().z) > 0.9
        obj = build.tube(f'tube{len(self.extra)}', [tuple(point) for point in path], radius=radius,
                         segments=segments, caps=False,
                         up=(1.0, 0.0, 0.0) if upright else (0.0, 0.0, 1.0))
        self.extra.append(scene.set_material(obj, self.materials[key]))

    def finish(self, name, smooth=40.0):
        """Joins everything into one mesh object named `name`."""
        parts = []
        for key, faces in self.faces.items():
            vertices, indices = [], []
            for points in faces:
                indices.append(tuple(range(len(vertices), len(vertices) + len(points))))
                vertices.extend(points)
            part = build.from_data(f'{name}_{key}', vertices, indices)
            parts.append(scene.set_material(part, self.materials[key]))
        obj = scene.join(parts + self.extra, name)
        layers = obj.data.uv_layers
        while len(layers) > 1:
            layers.remove(layers[-1])
        if not layers:
            layers.new(name=UV_LAYER)
        layers[0].name = UV_LAYER
        shading.smooth(obj, angle=math.radians(smooth))
        return obj


# ---------------------------------------------------------------------------------------------
# Kit: the modules of one asset
# ---------------------------------------------------------------------------------------------

class Kit:
    """Registers modules with their cards, lays them out for the bake and records the table."""

    ROWS = {'ground': (22.0, 0.0), 'upper': (11.0, 2.0)}
    CARD_SHIFT = -33.0

    def __init__(self, a, materials):
        self.a = a
        self.materials = materials
        self.objects = []
        self.table = {}
        self.cursor = {'ground': -24.0, 'upper': -24.0}
        _KITS[a.id] = self

    @staticmethod
    def of(a):
        """The kit that make(a) created, for assemble(a)."""
        return _KITS[a.id]

    def shell(self, storey='upper'):
        """A new Shell with the material set of a storey ('ground' or 'upper')."""
        shell = Shell(self.materials.ground if storey == 'ground' else self.materials.upper)
        shell.storey = storey
        return shell

    def module(self, name, slot, width, height, shell, lamp=None, card=None, **info):
        """Registers a module. `lamp` is (x0, z0, x1, z1, glass key): the glazed rectangle that
        the card shows in the lamp material. `card` is a function(Shell) that draws another
        card (corner posts). Extra keyword arguments go into the module's table entry."""
        storey = shell.storey
        lod0 = shell.finish(f'{name}_lod0')
        flat = self.shell(storey)
        if card is not None:
            card(flat)
        elif lamp is not None:
            flat.ring('wall', -width / 2, width / 2, 0.0, height, lamp[:4])
            x0, z0, x1, z1 = lamp[:4]
            flat.quad(lamp[4], [(x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1)], (0, 1, 0))
        else:
            flat.wall('wall', -width / 2, width / 2, 0.0, height)
        lod1 = flat.finish(f'{name}_lod1')
        source = scene.duplicate(lod0, f'{name}_source')

        row_y, row_z = self.ROWS[storey]
        x = self.cursor[storey] + width / 2 + 1.0
        self.cursor[storey] = x + width / 2 + 1.0
        lod0.location = (x, row_y, row_z)
        lod1.location = source.location = (x, row_y + self.CARD_SHIFT, row_z)
        self.a.add(lod0)
        self.a.add(lod1, sources=[source], texel_scale=0.5)
        self.objects += [lod0, lod1]
        entry = {'slot': slot, 'width': width, 'height': height,
                 'triangles': scene.triangle_count(lod0)}
        if lamp is not None:
            entry['lamp'] = self.materials.upper[lamp[4]].name
        entry.update(info)
        self.table[name] = entry
        return lod0

    def tiles(self):
        """A small swatch that carries the kit's repeating tile materials into the file."""
        shell = Shell({'tile_wall': self.materials.tile_wall, 'tile_roof': self.materials.tile_roof})
        shell.quad('tile_wall', [(-0.2, -0.6, 0.0), (0.2, -0.6, 0.0), (0.2, -0.6, 0.4),
                                 (-0.2, -0.6, 0.4)], (0, 1, 0))
        shell.quad('tile_roof', [(-0.2, -1.0, 0.0), (0.2, -1.0, 0.0), (0.2, -0.6, 0.0),
                                 (-0.2, -0.6, 0.0)], (0, 0, 1))
        swatch = shell.finish('tile_swatch')
        swatch.location = (0.0, 0.0, 12.0)
        self.a.add(swatch)
        self.objects.append(swatch)

    def finish(self, lod_distance=70.0):
        """Call at the end of make(a): records the module table in the asset's extras."""
        self.a.set_extra('modules', self.table)
        self.a.set_lod_distances(lod_distance)

    def assemble(self):
        """Call from assemble(a): moves every node to the origin (module coordinates)."""
        for obj in self.objects:
            obj.location = (0.0, 0.0, 0.0)
