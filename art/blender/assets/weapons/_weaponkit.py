"""Weapon kit: how the weapon sets (set_*.py) put several hand weapons into one asset file.

A set is one asset, one bake and one atlas. It follows the set naming of the prop sets (see the
header of game/src/assets/registry/props.js), with the weapon contract on top:

    <weapon>                     an empty at the point where the hand closes on the grip: the node
                                 the game clones and hangs on the hand (anchor_hand_r). Everything
                                 below is its child, so a clone is the weapon with its grip at its
                                 own origin, barrel along +Y in Blender (-Z in the game), up +Z
                                 (+Y in the game). Its extras: catalog_id, hold, length, lods,
                                 lod_distances.
    <weapon>_lod0, <weapon>_lod1 the weapon's levels of detail
    <weapon>_magazine            the magazine (a revolver's cylinder), a separate node shown at
                                 every level; its origin is its own top centre (cylinder: axis)
    anchor_muzzle__<weapon>      the barrel's end, pointing out of the barrel
    anchor_eject__<weapon>       the ejection port, pointing the way the cases fly
    anchor_grip_off__<weapon>    where the other hand holds (long guns, fore grips)

hold is 'one_hand', 'two_hand_pistol' or 'two_hand_long'. In the file the weapons lie nose to
tail along Blender X in one row, lifted just clear of the ground, so a side view of the built set
is its contact sheet; extras.objects[<weapon>] repeats the table with `origin` in game axes.

Hand weapons are seen from about three metres in a lead's hand, so the materials here use wear
sized for them: millimetre edge polish and holster wear instead of a lamp post's chips.

normalise_uv() works around build.box() naming its UV layer differently from the other builders
(the same library slip the props set kit works around).
"""
import math

import bpy
from mathutils import Vector

from lib import build, modify, naming, scene, shading
from lib import materials as M
from lib.materials import wear

UV_LAYER = 'UVMap'
HOLDS = ('one_hand', 'two_hand_pistol', 'two_hand_long')
_KITS = {}


# -- shapes ------------------------------------------------------------------------------------

def normalise_uv(obj):
    """Leaves the mesh with exactly one UV layer, named as the pipeline expects."""
    layers = obj.data.uv_layers
    if not layers:
        layers.new(name=UV_LAYER)
    while len(layers) > 1:
        layers.remove(layers[-1])
    if layers[0].name != UV_LAYER:
        layers[0].name = UV_LAYER
    return obj


def _area(points):
    return sum(points[i][0] * points[i - 1][1] - points[i - 1][0] * points[i][1]
               for i in range(len(points))) / 2.0


def side(name, points, width, mat, x=0.0, bevel=0.0, segments=1):
    """A slab from a side profile: `points` are (y, z) in metres (either winding), extruded
    `width` across X centred on `x`, edges bevelled by `bevel`."""
    outline = list(points)
    if _area(outline) < 0:
        outline.reverse()
    obj = build.extrude_outline(name, outline, width)

    def turn(point):
        y, z, depth = point.x, point.y, point.z
        point.x, point.y, point.z = depth - width / 2.0 + x, y, z
        return point

    modify.map_vertices(obj, turn)
    if bevel:
        modify.bevel(obj, width=bevel, segments=segments, angle=math.radians(30))
    obj.data.materials.append(mat)
    return obj


def block(name, size, at, mat, bevel=0.0):
    """A box of `size` (x, y, z) centred on `at`."""
    obj = build.box(name, size, location=at)
    if bevel:
        modify.bevel(obj, width=bevel, segments=1)
    obj.data.materials.append(mat)
    return obj


def rod(name, radius, y0, y1, at, mat, segments=12, radius_end=None):
    """A cylinder along Y from y0 to y1 through (x, z) = `at`."""
    obj = build.cylinder(name, radius=radius, depth=y1 - y0, segments=segments,
                         radius_top=radius_end)
    modify.transform(obj, rotation=(-math.pi / 2, 0.0, 0.0))
    modify.transform(obj, location=(at[0], (y0 + y1) / 2.0, at[1]))
    obj.data.materials.append(mat)
    return obj


def lathe_y(name, profile, at, mat, segments=16):
    """A lathe about the Y axis through (x, z) = `at`: profile is (radius, y) back to front."""
    obj = build.lathe(name, profile, segments=segments)
    modify.transform(obj, rotation=(-math.pi / 2, 0.0, 0.0))
    modify.transform(obj, location=(at[0], 0.0, at[1]))
    obj.data.materials.append(mat)
    return obj


def bar(name, path, radius, mat, flat=1.0, segments=8):
    """A tube through (y, z) points in the centre plane, widened across X by `flat`
    (trigger guards, trigger blades, hammer spurs)."""
    obj = build.tube(name, [(0.0, y, z) for y, z in path], radius=radius, segments=segments,
                     up=(1.0, 0.0, 0.0))

    def widen(point):
        point.x *= flat
        return point

    modify.map_vertices(obj, widen)
    obj.data.materials.append(mat)
    return obj


def mirrored(obj):
    """A copy of a part on the other side (X mirrored), with its normals the right way out."""
    copy = scene.duplicate(obj, obj.name + '_l')
    modify.transform(copy, scale=(-1.0, 1.0, 1.0))
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(copy.data)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(copy.data)
    bm.free()
    copy.data.update()
    return copy


def shift(parts, dy=0.0, dz=0.0):
    """Moves design-space parts so the hand point lands on the origin."""
    for part in parts:
        modify.transform(part, location=(0.0, dy, dz))
    return parts


# -- materials ---------------------------------------------------------------------------------

def _edge_polish(coat, radius, color, roughness, metallic, amount):
    """Holster and hand wear: a narrow bright band on exposed edges, broken up."""
    graph = coat.graph
    edges = graph.remap(graph.edges(radius=radius), 0.15, 0.85)
    breakup = graph.noise(scale=0.6 / radius, detail=3.0, roughness=0.6)
    mask = graph.mask(graph.add(graph.mul(edges, 0.55 + 0.35 * amount), graph.mul(breakup, 0.45)),
                      threshold=0.72 - 0.12 * amount, softness=0.05)
    coat.cover(mask, color=color, roughness=roughness, metallic=metallic)
    return coat


def gun_steel(color=(0.034, 0.035, 0.037), roughness=0.42, metallic=0.8, wear_amount=0.5,
              bare=(0.40, 0.40, 0.40), seed=0, name='gun_steel'):
    """Nitrided or blued steel: dark, slightly metallic, with fine machining texture, edges
    worn through to bright steel, fine scratches and grime in the recesses. A pale colour and
    metallic 1 gives brushed stainless."""
    graph = M.Graph(name, seed)
    base = graph.vary(graph.rgb(color), amount=0.05, scale=35.0)
    coat = wear.Coat(graph, base, roughness=roughness, metallic=metallic)
    coat.height = graph.mul(graph.noise(scale=700.0, detail=2.0, stretch=(1.0, 0.05, 1.0)), 0.04)
    wear.scratches(coat, amount=0.5 * wear_amount, length=0.035)
    _edge_polish(coat, 0.0018, bare, 0.28, 1.0, wear_amount)
    wear.grime(coat, amount=0.35, distance=0.008)
    return coat.finish(bump_strength=0.35, bump_distance=0.0004)


def polymer(color=(0.030, 0.030, 0.032), stipple=0.0, seed=0, name='polymer'):
    """Moulded gun polymer: a soft matt sheen, edges rubbed glossier and paler; stipple > 0
    adds the raised dot texture of a grip (cells about 2 mm, baked into the normal map)."""
    graph = M.Graph(name, seed)
    base = graph.vary(graph.rgb(color), amount=0.06, scale=25.0)
    coat = wear.Coat(graph, base, roughness=0.62, metallic=0.0)
    coat.height = graph.mul(graph.noise(scale=1200.0, detail=2.0), 0.03)
    if stipple:
        cells = graph.voronoi(scale=420.0, feature='F1', output='Distance')
        coat.height = graph.add(coat.height, graph.mul(graph.invert(cells), 0.6 * stipple))
        coat.roughness = 0.74
    _edge_polish(coat, 0.0016, (0.085, 0.085, 0.088), 0.38, 0.0, 0.6)
    wear.scratches(coat, amount=0.25, length=0.03, color=(0.07, 0.07, 0.072))
    wear.grime(coat, amount=0.3, distance=0.008)
    return coat.finish(bump_strength=0.55, bump_distance=0.0005)


def gun_wood(color=(0.20, 0.085, 0.035), seed=0, name='gun_wood'):
    """Oiled hardwood grips and furniture with the grain along Z, darkened where hands sweat."""
    return M.wood(color=color, weathered=0.1, grain_axis='Z', varnish=0.6, seed=seed, name=name)


def bore_black(name='bore_black'):
    """The inside of a bore or a port: near black, matt."""
    return M.plastic(color=(0.008, 0.008, 0.009), roughness=0.85, grain=0.0, scuffs=0.0, seed=1,
                     name=name)


# -- the kit -----------------------------------------------------------------------------------

class Weapon:
    """One weapon of a set: its node, its level-0 mesh and what hangs on it."""

    def __init__(self, kit, name, mesh, root, hold, catalog_id, lod, distance, smooth):
        self.kit = kit
        self.name = name
        self.mesh = mesh
        self.root = root
        self.hold = hold
        self.catalog_id = catalog_id
        self.lod = lod
        self.distance = float(distance)
        self.smooth = smooth
        self.parts = []
        self.anchors = []

    def anchor(self, what, at, forward=(0.0, 1.0, 0.0), up=(0.0, 0.0, 1.0)):
        """anchor_<what>__<weapon> at a point of the weapon (grip coordinates)."""
        name = f'anchor_{what}__{self.name}'
        self.kit.a.add_anchor(name, at, forward=forward, up=up, parent=self.root)
        self.anchors.append(name)
        return self

    def magazine(self, pieces, pivot, smooth=None):
        """The magazine <weapon>_magazine, shown at every level; its origin is `pivot`."""
        for piece in pieces:
            normalise_uv(piece)
        obj = scene.join(pieces, f'{self.name}_magazine')
        shading.smooth(obj, angle=math.radians(self.smooth if smooth is None else smooth))
        scene.set_origin(obj, pivot)
        scene.parent_to(obj, self.root)
        self.kit.a.add(obj)
        self.parts.append(obj)
        return self


class WeaponKit:
    """Collects the weapons of one set, lays them out and builds their second level."""

    def __init__(self, a, gap=0.10, lift=0.03):
        self.a = a
        self.gap = gap
        self.lift = lift
        self.weapons = []
        _KITS[a.id] = self

    @staticmethod
    def of(a):
        """The kit that make(a) created, for assemble(a)."""
        return _KITS[a.id]

    def weapon(self, name, parts, hold, catalog_id=None, lod=0.4, distance=9.0, smooth=35.0,
               texel_scale=1.0):
        """Joins `parts` (modelled with the hand at the origin) into <name>_lod0 under a new
        weapon node. lod is the share of triangles kept at level 1, distance where it takes over."""
        if hold not in HOLDS:
            raise ValueError(f'{name}: hold must be one of {HOLDS}')
        for part in parts:
            normalise_uv(part)
        mesh = scene.join(parts, f'{name}_lod0')
        shading.smooth(mesh, angle=math.radians(smooth))
        root = scene.add_empty(name, (0.0, 0.0, 0.0), size=0.05)
        root['catalog_id'] = catalog_id or name
        root['hold'] = hold
        root['lods'] = 2
        root['lod_distances'] = [float(distance)]
        scene.parent_to(mesh, root)
        self.a.extra_objects.append(root)
        self.a.add(mesh, texel_scale=texel_scale)
        entry = Weapon(self, name, mesh, root, hold, catalog_id or name, lod, distance, smooth)
        self.weapons.append(entry)
        return entry

    def layout(self):
        """Lays the weapons nose to tail along X, lifted clear of the ground, and stores the
        table in the asset's extras. Call it last in make(a)."""
        x = 0.0
        placed = []
        for entry in self.weapons:
            low, high = scene.world_bounds([entry.mesh, *entry.parts])
            entry.low, entry.high = low, high
            entry.length = high.y - low.y
            placed.append((entry, x - low.x))
            x += high.x - low.x + self.gap
        centre = (x - self.gap) / 2.0
        table = {}
        for entry, offset in placed:
            origin = Vector((offset - centre, 0.0, self.lift - entry.low.z))
            entry.root.location = origin
            entry.origin = origin
            entry.root['length'] = round(entry.length, 3)
            table[entry.name] = {
                'catalog_id': entry.catalog_id, 'hold': entry.hold,
                'length': round(entry.length, 3), 'lods': 2, 'lod_distances': [entry.distance],
                # Game axes: x, y up, z = -Blender y.
                'origin': [round(origin.x, 4), round(origin.z, 4), round(-origin.y, 4)],
            }
        bpy.context.view_layer.update()
        self.a.set_extra('objects', table)
        self.a.set_lod_distances(max(entry.distance for entry in self.weapons))
        for entry in self.weapons:
            size = entry.high - entry.low
            count = scene.triangle_count(entry.mesh) + sum(scene.triangle_count(p) for p in entry.parts)
            print(f'weapons: {entry.name:18} length {entry.length:.3f}  size {size.x:.3f} '
                  f'{size.y:.3f} {size.z:.3f}  {count} tris  {entry.hold}  '
                  f'{" ".join(entry.anchors)}', flush=True)

    def levels(self):
        """Builds each weapon's level 1 from its baked level 0. Call it from assemble(a)."""
        for entry in self.weapons:
            first = scene.triangle_count(entry.mesh)
            copy = scene.duplicate(entry.mesh, naming.lod_name(entry.name, 1))
            modify.decimate(copy, ratio=entry.lod)
            shading.smooth(copy, angle=math.radians(max(entry.smooth, 45.0)))
            if copy.parent is None:
                scene.parent_to(copy, entry.root)
            if scene.triangle_count(copy) >= first:
                raise ValueError(f'{entry.name}: level 1 is not lighter than level 0')
            self.a.add_baked(copy)
            print(f'weapons: {entry.name:18} levels {first}/{scene.triangle_count(copy)}',
                  flush=True)
